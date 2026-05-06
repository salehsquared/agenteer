#!/usr/bin/env python3
"""Hip/femur fracture ICU outcomes analysis from the bounded MIMIC-IV cache.

This script copies only required Parquet tables from the project-owned GCS
cache, builds an ICD-defined hip/femur fracture ICU cohort, runs descriptive
and adjusted models, writes aggregate artifacts, and removes the temporary
row-level cache.
"""

from __future__ import annotations

import hashlib
import json
import math
import shutil
import subprocess
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import numpy as np
import pandas as pd
import pyarrow.parquet as pq
import statsmodels.api as sm
from scipy import stats
from sklearn.metrics import average_precision_score, roc_auc_score


ROOT = Path("/Users/saleh/TechProjects/agenteer")
DATASET_DIR = ROOT / ".loop-memory/datasets/mimiciv-3-1"
MANIFEST_PATH = DATASET_DIR / "dataset-manifest.json"
ANALYSIS_DIR = ROOT / ".loop-memory/mimic-analyses/hip-fracture-icu-outcomes-20260506"
CACHE_DIR = ANALYSIS_DIR / "_tmp-parquet-cache"

REQUIRED_TABLES = [
    "hosp-diagnoses-icd",
    "hosp-d-icd-diagnoses",
    "derived-icustay-detail",
    "derived-apsiii",
    "derived-oasis",
    "derived-first-day-sofa",
    "derived-first-day-lab",
    "derived-first-day-vitalsign",
]

MAX_READ_BYTES = 160 * 1024 * 1024
HARD_COST_CEILING_USD = 1.0
CONSERVATIVE_TRANSFER_USD_PER_GB = 0.12
GCS_STANDARD_CLASS_B_USD_PER_10K = 0.004


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def run(cmd: list[str]) -> str:
    completed = subprocess.run(cmd, check=True, text=True, capture_output=True)
    return completed.stdout


def load_manifest() -> dict[str, Any]:
    return json.loads(MANIFEST_PATH.read_text())


def table_lookup(manifest: dict[str, Any]) -> dict[str, dict[str, Any]]:
    return {table["tableId"]: table for table in manifest["tables"]}


def list_table_objects(table: dict[str, Any]) -> list[dict[str, Any]]:
    raw = run(["gcloud", "storage", "ls", "--json", "--recursive", table["sourcePath"]])
    entries = json.loads(raw)
    objects = []
    for entry in entries:
        if entry.get("type") != "cloud_object":
            continue
        url = entry["url"].split("#", 1)[0]
        if not url.endswith(".parquet"):
            continue
        metadata = entry.get("metadata", {})
        objects.append(
            {
                "url": url,
                "size": int(metadata.get("size", 0)),
                "generation": metadata.get("generation"),
                "crc32c": metadata.get("crc32c"),
                "md5Hash": metadata.get("md5Hash"),
                "updated": metadata.get("updated"),
            }
        )
    return sorted(objects, key=lambda item: item["url"])


def copy_table(table_id: str, table: dict[str, Any]) -> tuple[list[Path], int, list[dict[str, Any]]]:
    target = CACHE_DIR / table_id
    target.mkdir(parents=True, exist_ok=True)
    objects = list_table_objects(table)
    copied: list[Path] = []
    for obj in objects:
        local = target / obj["url"].rstrip("/").split("/")[-1]
        run(["gcloud", "storage", "cp", obj["url"], str(local)])
        copied.append(local)
    return copied, sum(path.stat().st_size for path in copied), objects


def read_table(paths: list[Path], columns: list[str] | None = None) -> pd.DataFrame:
    frame = pq.read_table([str(path) for path in paths], columns=columns).to_pandas()
    return frame


def digest_paths(paths: list[Path]) -> str:
    digest = hashlib.sha256()
    for path in sorted(paths):
        digest.update(path.name.encode())
        digest.update(str(path.stat().st_size).encode())
    return digest.hexdigest()


def simplify_race(value: Any) -> str:
    text = str(value or "Unknown").upper()
    if "BLACK" in text:
        return "Black"
    if "WHITE" in text:
        return "White"
    if "HISPANIC" in text or "LATINO" in text or "SOUTH AMERICAN" in text:
        return "Hispanic"
    if "ASIAN" in text:
        return "Asian"
    if "UNKNOWN" in text or "UNABLE" in text or "DECLINED" in text:
        return "Unknown"
    return "Other"


def hip_femur_fracture_mask(dictionary: pd.DataFrame) -> pd.Series:
    code = dictionary["icd_code"].astype(str).str.replace(".", "", regex=False).str.upper()
    title = dictionary["long_title"].astype(str).str.lower()
    icd10_s72 = (dictionary["icd_version"].astype(int) == 10) & code.str.startswith("S72")
    icd9_hip_femur = (dictionary["icd_version"].astype(int) == 9) & (
        code.str.startswith("820") | code.str.startswith("821")
    )
    icd9_pathologic_or_stress_femur = (dictionary["icd_version"].astype(int) == 9) & code.isin(
        {"73314", "73315", "73396", "73397"}
    )
    icd10_periprosthetic_hip = (dictionary["icd_version"].astype(int) == 10) & (
        code.str.startswith("M970") | code.str.startswith("T8404") | code.str.startswith("M9666")
    )
    icd10_pathologic_or_physeal_femur = (dictionary["icd_version"].astype(int) == 10) & (
        code.str.startswith("M8005")
        | code.str.startswith("M8085")
        | code.str.startswith("M8445")
        | code.str.startswith("M8455")
        | code.str.startswith("M8465")
        | code.str.startswith("S7900")
    )
    title_match = title.str.contains("fracture", na=False) & title.str.contains(
        r"\b(?:hip|femur|femoral|trochanter|subtrochanteric|intertrochanteric)\b|neck of femur",
        regex=True,
        na=False,
    )
    exclude = title.str.contains(
        "skull|face|tooth|hand|wrist|forearm|humerus|rib|vertebra|spine|talus|ankle|foot",
        regex=True,
        na=False,
    )
    return (
        icd10_s72
        | icd9_hip_femur
        | icd9_pathologic_or_stress_femur
        | icd10_periprosthetic_hip
        | icd10_pathologic_or_physeal_femur
        | title_match
    ) & ~exclude


def as_numeric(frame: pd.DataFrame, columns: list[str]) -> pd.DataFrame:
    for column in columns:
        if column in frame.columns:
            frame[column] = pd.to_numeric(frame[column], errors="coerce")
    return frame


def first_icu_stay_per_admission(stays: pd.DataFrame) -> pd.DataFrame:
    stays = stays.copy()
    stays["icu_intime"] = pd.to_datetime(stays["icu_intime"], errors="coerce")
    stays = stays.sort_values(["hadm_id", "icu_intime", "stay_id"])
    return stays.drop_duplicates("hadm_id", keep="first")


def build_cohort(tables: dict[str, pd.DataFrame]) -> tuple[pd.DataFrame, dict[str, Any], pd.DataFrame]:
    dx = tables["hosp-diagnoses-icd"].copy()
    dx_dict = tables["hosp-d-icd-diagnoses"].copy()
    dx["icd_code"] = dx["icd_code"].astype(str)
    dx_dict["icd_code"] = dx_dict["icd_code"].astype(str)
    dx["icd_version"] = dx["icd_version"].astype(int)
    dx_dict["icd_version"] = dx_dict["icd_version"].astype(int)

    matched_codes = dx_dict.loc[hip_femur_fracture_mask(dx_dict), ["icd_code", "icd_version", "long_title"]].copy()
    fracture_dx = dx.merge(matched_codes, on=["icd_code", "icd_version"], how="inner")
    fracture_admissions = fracture_dx[["subject_id", "hadm_id"]].drop_duplicates()

    stays = first_icu_stay_per_admission(tables["derived-icustay-detail"])
    cohort = stays.merge(fracture_admissions, on=["subject_id", "hadm_id"], how="inner")
    cohort = cohort.merge(tables["derived-apsiii"], on=["subject_id", "hadm_id", "stay_id"], how="left", suffixes=("", "_apsiii"))
    cohort = cohort.merge(tables["derived-oasis"], on=["subject_id", "hadm_id", "stay_id"], how="left", suffixes=("", "_oasis"))
    cohort = cohort.merge(tables["derived-first-day-sofa"], on=["subject_id", "hadm_id", "stay_id"], how="left", suffixes=("", "_sofa"))
    cohort = cohort.merge(tables["derived-first-day-lab"], on=["subject_id", "stay_id"], how="left", suffixes=("", "_lab"))
    cohort = cohort.merge(tables["derived-first-day-vitalsign"], on=["subject_id", "stay_id"], how="left", suffixes=("", "_vital"))

    numeric_cols = [
        "hospital_expire_flag",
        "los_hospital",
        "los_icu",
        "admission_age",
        "apsiii",
        "apsiii_prob",
        "oasis",
        "oasis_prob",
        "sofa",
        "hemoglobin_min",
        "hemoglobin_max",
        "platelets_min",
        "wbc_max",
        "creatinine_max",
        "bun_max",
        "glucose_max",
        "sodium_min",
        "potassium_max",
        "sbp_min",
        "heart_rate_max",
        "resp_rate_max",
        "spo2_min",
        "temperature_max",
    ]
    cohort = as_numeric(cohort, numeric_cols)
    cohort["male"] = (cohort["gender"].astype(str).str.upper() == "M").astype(int)
    cohort["race_group"] = cohort["race"].map(simplify_race)
    cohort["prolonged_icu_los"] = cohort["los_icu"] > cohort["los_icu"].quantile(0.75)
    cohort["hip_femur_dx_count"] = cohort["hadm_id"].map(fracture_dx.groupby("hadm_id").size()).fillna(0).astype(int)

    summary = {
        "matchedDiagnosisCodes": int(matched_codes.shape[0]),
        "matchedDiagnosisRows": int(fracture_dx.shape[0]),
        "fractureAdmissions": int(fracture_admissions.shape[0]),
        "icuStaysBeforeFirstStayRestriction": int(
            tables["derived-icustay-detail"].merge(fracture_admissions, on=["subject_id", "hadm_id"], how="inner").shape[0]
        ),
        "firstIcuStayCohortRows": int(cohort.shape[0]),
        "firstIcuStayUniquePatients": int(cohort["subject_id"].nunique()),
    }
    return cohort, summary, matched_codes


def phenotype_audit(matched_codes: pd.DataFrame, fracture_dx: pd.DataFrame | None = None) -> dict[str, Any]:
    codes = matched_codes.copy()
    codes["prefix3"] = codes["icd_code"].astype(str).str[:3]
    by_version = codes.groupby("icd_version").size().astype(int).to_dict()
    by_prefix = (
        codes.groupby(["icd_version", "prefix3"])
        .size()
        .sort_values(ascending=False)
        .head(30)
        .reset_index(name="count")
        .to_dict(orient="records")
    )
    suspicious_terms = r"talus|ankle|foot|humerus|forearm|wrist|hand|skull|face|vertebra|spine"
    suspicious = codes[codes["long_title"].astype(str).str.lower().str.contains(suspicious_terms, regex=True, na=False)]
    return {
        "matchedCodeCount": int(codes.shape[0]),
        "matchedCodesByIcdVersion": {str(k): int(v) for k, v in by_version.items()},
        "topMatchedPrefixes": by_prefix,
        "suspiciousNonHipFemurCodeCount": int(suspicious.shape[0]),
        "suspiciousNonHipFemurCodeExamples": suspicious.head(25).to_dict(orient="records"),
        "sampleMatchedCodes": codes.sample(min(25, codes.shape[0]), random_state=7).to_dict(orient="records"),
    }


def describe_continuous(series: pd.Series) -> dict[str, Any]:
    clean = pd.to_numeric(series, errors="coerce").dropna()
    if clean.empty:
        return {"n": 0}
    return {
        "n": int(clean.shape[0]),
        "missing": int(series.shape[0] - clean.shape[0]),
        "mean": float(clean.mean()),
        "sd": float(clean.std(ddof=1)),
        "median": float(clean.median()),
        "iqr": [float(clean.quantile(0.25)), float(clean.quantile(0.75))],
        "min": float(clean.min()),
        "max": float(clean.max()),
    }


def describe_binary(series: pd.Series) -> dict[str, Any]:
    clean = pd.to_numeric(series, errors="coerce").dropna().astype(int)
    positives = int(clean.sum()) if not clean.empty else 0
    total = int(clean.shape[0])
    return {"n": total, "positive": positives, "proportion": positives / total if total else None}


def standardize_columns(frame: pd.DataFrame, columns: list[str]) -> tuple[pd.DataFrame, dict[str, dict[str, float]]]:
    out = frame.copy()
    stats_out: dict[str, dict[str, float]] = {}
    for column in columns:
        mean = float(out[column].mean())
        sd = float(out[column].std(ddof=1))
        if not sd or math.isnan(sd):
            sd = 1.0
        out[column] = (out[column] - mean) / sd
        stats_out[column] = {"mean": mean, "sd": sd}
    return out, stats_out


def logistic_model(frame: pd.DataFrame, outcome: str, predictors: list[str], label: str) -> dict[str, Any]:
    model_frame = frame[[outcome] + predictors].replace([np.inf, -np.inf], np.nan).dropna()
    model_frame[outcome] = model_frame[outcome].astype(int)
    events = int(model_frame[outcome].sum())
    non_events = int(model_frame.shape[0] - events)
    if events < 10 or non_events < 10:
        return {"label": label, "status": "not_fit", "reason": "Too few events or non-events.", "n": int(model_frame.shape[0])}
    continuous = [column for column in predictors if column not in {"male"} and model_frame[column].nunique(dropna=True) > 2]
    model_frame, scaling = standardize_columns(model_frame, continuous)
    x = sm.add_constant(model_frame[predictors], has_constant="add")
    y = model_frame[outcome]
    try:
        result = sm.Logit(y, x).fit(disp=False, maxiter=200)
        params = result.params
        conf = result.conf_int()
        rows = []
        for term in params.index:
            if term == "const":
                continue
            rows.append(
                {
                    "term": term,
                    "oddsRatio": float(np.exp(params[term])),
                    "ci95": [float(np.exp(conf.loc[term, 0])), float(np.exp(conf.loc[term, 1]))],
                    "pValue": float(result.pvalues[term]),
                    "scale": "per 1 SD" if term in continuous else "per unit",
                }
            )
        predicted = result.predict(x)
        metrics = {
            "auroc": float(roc_auc_score(y, predicted)),
            "averagePrecision": float(average_precision_score(y, predicted)),
            "eventRate": events / int(model_frame.shape[0]),
        }
        return {
            "label": label,
            "status": "fit",
            "n": int(model_frame.shape[0]),
            "events": events,
            "nonEvents": non_events,
            "predictors": predictors,
            "scaling": scaling,
            "coefficients": rows,
            "metrics": metrics,
            "aic": float(result.aic),
            "warnings": [],
        }
    except Exception as exc:
        return {
            "label": label,
            "status": "not_fit",
            "reason": str(exc),
            "n": int(model_frame.shape[0]),
            "events": events,
            "nonEvents": non_events,
        }


def ols_log_los_model(frame: pd.DataFrame, predictors: list[str]) -> dict[str, Any]:
    model_frame = frame[["los_icu"] + predictors].replace([np.inf, -np.inf], np.nan).dropna()
    model_frame = model_frame[model_frame["los_icu"] > 0]
    continuous = [column for column in predictors if column not in {"male"} and model_frame[column].nunique(dropna=True) > 2]
    model_frame, scaling = standardize_columns(model_frame, continuous)
    y = np.log1p(model_frame["los_icu"].astype(float))
    x = sm.add_constant(model_frame[predictors], has_constant="add")
    result = sm.OLS(y, x).fit(cov_type="HC3")
    rows = []
    conf = result.conf_int()
    for term in result.params.index:
        if term == "const":
            continue
        rows.append(
            {
                "term": term,
                "multiplicativeChangeInLos": float(np.exp(result.params[term])),
                "percentChangeInLos": float((np.exp(result.params[term]) - 1) * 100),
                "ci95PercentChange": [
                    float((np.exp(conf.loc[term, 0]) - 1) * 100),
                    float((np.exp(conf.loc[term, 1]) - 1) * 100),
                ],
                "pValue": float(result.pvalues[term]),
                "scale": "per 1 SD" if term in continuous else "per unit",
            }
        )
    return {
        "label": "Adjusted robust linear model for log(1 + ICU LOS)",
        "status": "fit",
        "n": int(model_frame.shape[0]),
        "predictors": predictors,
        "scaling": scaling,
        "coefficients": rows,
        "rSquared": float(result.rsquared),
        "aic": float(result.aic),
    }


def table_one(cohort: pd.DataFrame) -> dict[str, Any]:
    variables = [
        "admission_age",
        "male",
        "hospital_expire_flag",
        "los_hospital",
        "los_icu",
        "apsiii",
        "oasis",
        "sofa",
        "hemoglobin_min",
        "wbc_max",
        "creatinine_max",
        "bun_max",
        "glucose_max",
        "sbp_min",
        "heart_rate_max",
        "spo2_min",
    ]
    continuous = {var: describe_continuous(cohort[var]) for var in variables if var in cohort.columns and var not in {"male", "hospital_expire_flag"}}
    binary = {var: describe_binary(cohort[var]) for var in ["male", "hospital_expire_flag"] if var in cohort.columns}
    race = cohort["race_group"].value_counts(dropna=False).to_dict()
    return {"continuous": continuous, "binary": binary, "raceGroupCounts": {str(k): int(v) for k, v in race.items()}}


def missingness_summary(cohort: pd.DataFrame, columns: list[str]) -> list[dict[str, Any]]:
    rows = []
    total = cohort.shape[0]
    for column in columns:
        if column not in cohort.columns:
            continue
        missing = int(cohort[column].isna().sum())
        rows.append({"column": column, "missing": missing, "missingFraction": missing / total if total else None})
    return rows


def qa_checks(cohort: pd.DataFrame, model_results: dict[str, Any], copied_bytes: int) -> dict[str, Any]:
    checks = []
    checks.append(
        {
            "code": "COST_UNDER_CEILING",
            "passed": copied_bytes / 1024**3 * CONSERVATIVE_TRANSFER_USD_PER_GB < HARD_COST_CEILING_USD,
            "detail": f"Estimated transfer cost ${copied_bytes / 1024**3 * CONSERVATIVE_TRANSFER_USD_PER_GB:.4f}.",
        }
    )
    checks.append({"code": "COHORT_NONEMPTY", "passed": cohort.shape[0] > 0, "detail": f"Cohort rows: {cohort.shape[0]}."})
    checks.append(
        {
            "code": "MORTALITY_BOTH_CLASSES",
            "passed": cohort["hospital_expire_flag"].nunique(dropna=True) == 2,
            "detail": f"Mortality values: {sorted(cohort['hospital_expire_flag'].dropna().unique().tolist())}.",
        }
    )
    checks.append(
        {
            "code": "LOS_POSITIVE",
            "passed": bool((cohort["los_icu"].dropna() > 0).all()),
            "detail": "All non-missing ICU LOS values are positive.",
        }
    )
    checks.append(
        {
            "code": "NO_ROW_LEVEL_EXPORT",
            "passed": not CACHE_DIR.exists(),
            "detail": "Temporary row-level cache is absent after the run.",
        }
    )
    for name, result in model_results.items():
        checks.append(
            {
                "code": f"MODEL_{name.upper()}_FIT",
                "passed": result.get("status") == "fit",
                "detail": result.get("reason", f"Model n={result.get('n')}."),
            }
        )
    return {
        "status": "pass" if all(check["passed"] for check in checks) else "review",
        "checks": checks,
        "limitations": [
            "This is an observational ICU cohort analysis and does not estimate causal effects.",
            "The hip/femur fracture phenotype is ICD-code based and should be clinician-reviewed before publication use.",
            "Only first ICU stay per fracture hospitalization is used for the primary cohort.",
            "Administrative and derived variables may encode care processes as well as disease severity.",
        ],
    }


def format_ci(value: float, ci: list[float], digits: int = 2) -> str:
    return f"{value:.{digits}f} ({ci[0]:.{digits}f}, {ci[1]:.{digits}f})"


def write_paper(
    cohort_summary: dict[str, Any],
    phenotype: pd.DataFrame,
    table1: dict[str, Any],
    model_results: dict[str, Any],
    missingness: list[dict[str, Any]],
    qa: dict[str, Any],
    cost: dict[str, Any],
    phenotype_review: dict[str, Any],
) -> None:
    mortality = table1["binary"]["hospital_expire_flag"]
    los = table1["continuous"]["los_icu"]
    age = table1["continuous"]["admission_age"]
    aps = table1["continuous"]["apsiii"]
    sofa = table1["continuous"]["sofa"]
    logistic = model_results["mortality"]
    los_model = model_results["los"]
    prolonged = model_results["prolonged_los"]

    top_logistic = []
    if logistic.get("status") == "fit":
        top_logistic = sorted(logistic["coefficients"], key=lambda row: row["pValue"])[:5]
    top_los = []
    if los_model.get("status") == "fit":
        top_los = sorted(los_model["coefficients"], key=lambda row: row["pValue"])[:5]

    lines = [
        "# Hip/Femur Fracture ICU Outcomes in MIMIC-IV v3.1",
        "",
        "## Plain-Language Summary",
        "",
        (
            "This analysis identified ICU stays linked to hospital admissions with hip or femur fracture diagnosis codes. "
            "It then summarized patient characteristics and tested whether first-day ICU severity, laboratory, and vital-sign "
            "features were associated with in-hospital death and ICU length of stay. The results are observational and should "
            "not be interpreted as proof that any measured factor caused worse outcomes."
        ),
        "",
        "## Research Question",
        "",
        "Among ICU patients admitted with hip or femur fracture diagnosis codes, what first-day factors are associated with in-hospital mortality and prolonged ICU stay?",
        "",
        "## Data Source",
        "",
        (
            "The analysis used the local project-owned MIMIC-IV v3.1 Parquet cache. Required tables were copied from GCS into "
            "a temporary local cache, analyzed locally, and then deleted. Only aggregate results are saved."
        ),
        "",
        "## Cohort Definition",
        "",
        f"- Diagnosis phenotype: ICD-9 codes beginning with `820` or `821`, ICD-10 codes beginning with `S72`, and diagnosis dictionary titles containing fracture terms for hip/femur/femoral/trochanteric regions.",
        f"- Matched diagnosis dictionary codes: {cohort_summary['matchedDiagnosisCodes']}.",
        f"- Phenotype audit suspicious non-hip/femur dictionary-code examples: {phenotype_review['suspiciousNonHipFemurCodeCount']}.",
        f"- Matched diagnosis rows: {cohort_summary['matchedDiagnosisRows']}.",
        f"- Hospital admissions with a matching hip/femur fracture diagnosis: {cohort_summary['fractureAdmissions']}.",
        f"- ICU stays before first-stay restriction: {cohort_summary['icuStaysBeforeFirstStayRestriction']}.",
        f"- Primary analytic cohort: first ICU stay per fracture hospitalization, N={cohort_summary['firstIcuStayCohortRows']}; unique patients={cohort_summary['firstIcuStayUniquePatients']}.",
        "",
        "## Methods",
        "",
        (
            "The primary outcome was in-hospital mortality. A secondary outcome was ICU length of stay. "
            "A third analysis modeled prolonged ICU stay, defined as ICU length of stay above the cohort 75th percentile. "
            "Continuous predictors were standardized so adjusted odds ratios and length-of-stay effects are interpreted per one standard deviation. "
            "The mortality and prolonged-stay models used logistic regression. ICU length of stay used a robust linear regression of log(1 + ICU length of stay)."
        ),
        "",
        "Candidate predictors were age, sex, APS III score, OASIS score, SOFA score, first-day hemoglobin, white blood cell count, creatinine, BUN, systolic blood pressure minimum, heart rate maximum, and oxygen saturation minimum. Missing values were handled by complete-case analysis within each model.",
        "",
        "## Cohort Characteristics",
        "",
        f"- Age: median {age['median']:.1f} years (IQR {age['iqr'][0]:.1f}-{age['iqr'][1]:.1f}).",
        f"- Male: {table1['binary']['male']['positive']} of {table1['binary']['male']['n']} ({table1['binary']['male']['proportion']:.1%}).",
        f"- In-hospital mortality: {mortality['positive']} of {mortality['n']} ({mortality['proportion']:.1%}).",
        f"- ICU length of stay: median {los['median']:.2f} days (IQR {los['iqr'][0]:.2f}-{los['iqr'][1]:.2f}).",
        f"- APS III: median {aps['median']:.1f} (IQR {aps['iqr'][0]:.1f}-{aps['iqr'][1]:.1f}).",
        f"- SOFA: median {sofa['median']:.1f} (IQR {sofa['iqr'][0]:.1f}-{sofa['iqr'][1]:.1f}).",
        "",
        "Race/ethnicity groups as recorded in MIMIC administrative data:",
    ]
    for group, count in table1["raceGroupCounts"].items():
        lines.append(f"- {group}: {count}.")
    lines.extend(["", "## Mortality Model", ""])
    if logistic.get("status") == "fit":
        lines.extend(
            [
                f"- Complete-case N: {logistic['n']}; deaths: {logistic['events']}.",
                f"- AUROC: {logistic['metrics']['auroc']:.3f}.",
                f"- Average precision: {logistic['metrics']['averagePrecision']:.3f}.",
                "",
                "Strongest adjusted mortality associations by p-value:",
            ]
        )
        for row in top_logistic:
            lines.append(
                f"- {row['term']}: adjusted OR {format_ci(row['oddsRatio'], row['ci95'])}, p={row['pValue']:.3g}, {row['scale']}."
            )
    else:
        lines.append(f"The mortality model was not fit: {logistic.get('reason')}.")
    lines.extend(["", "## ICU Length-Of-Stay Model", ""])
    if los_model.get("status") == "fit":
        lines.append(f"- Complete-case N: {los_model['n']}; R-squared: {los_model['rSquared']:.3f}.")
        lines.append("")
        lines.append("Strongest adjusted ICU length-of-stay associations by p-value:")
        for row in top_los:
            lines.append(
                f"- {row['term']}: {row['percentChangeInLos']:.1f}% change in ICU LOS ({row['ci95PercentChange'][0]:.1f}%, {row['ci95PercentChange'][1]:.1f}%), p={row['pValue']:.3g}, {row['scale']}."
            )
    else:
        lines.append(f"The length-of-stay model was not fit: {los_model.get('reason')}.")
    lines.extend(["", "## Prolonged ICU Stay Model", ""])
    if prolonged.get("status") == "fit":
        lines.extend(
            [
                f"- Complete-case N: {prolonged['n']}; prolonged-stay cases: {prolonged['events']}.",
                f"- AUROC: {prolonged['metrics']['auroc']:.3f}.",
                "",
                "Strongest adjusted prolonged-stay associations by p-value:",
            ]
        )
        for row in sorted(prolonged["coefficients"], key=lambda item: item["pValue"])[:5]:
            lines.append(
                f"- {row['term']}: adjusted OR {format_ci(row['oddsRatio'], row['ci95'])}, p={row['pValue']:.3g}, {row['scale']}."
            )
    else:
        lines.append(f"The prolonged ICU stay model was not fit: {prolonged.get('reason')}.")
    lines.extend(
        [
            "",
            "## Missingness",
            "",
            "Most model variables were near-complete in the cohort, but variables with missingness should be reviewed before confirmatory use:",
        ]
    )
    for row in sorted(missingness, key=lambda item: item["missingFraction"] or 0, reverse=True)[:12]:
        lines.append(f"- {row['column']}: {row['missing']} missing ({row['missingFraction']:.1%}).")
    lines.extend(
        [
            "",
            "## Interpretation",
            "",
            (
                "This analysis is most useful as a reproducible first-pass description of critically ill hip/femur fracture patients. "
                "It can identify severity markers and early physiologic features associated with worse outcomes, but it does not establish causality. "
                "The ICD phenotype should be reviewed by an orthopedic or clinical coding expert before publication-quality use."
            ),
            "",
            "## Quality And Cost Controls",
            "",
            f"- QA status: {qa['status']}.",
            f"- Actual copied/read bytes: {cost['actualBytes']} ({cost['actualBytes'] / 1024 / 1024:.2f} MiB).",
            f"- Conservative estimated transfer cost: ${cost['estimatedTransferUsd']:.4f}.",
            f"- Temporary row-level cache removed: {'yes' if not CACHE_DIR.exists() else 'no'}.",
            "",
            "QA checks:",
        ]
    )
    for check in qa["checks"]:
        lines.append(f"- {'PASS' if check['passed'] else 'REVIEW'} {check['code']}: {check['detail']}")
    lines.extend(["", "## Limitations", ""])
    for limitation in qa["limitations"]:
        lines.append(f"- {limitation}")
    lines.extend(
        [
            "",
            "## Artifact Index",
            "",
            "- `analysis-results.json`: model coefficients, metrics, cohort counts, and table summaries.",
            "- `cohort-summary.json`: phenotype and cohort construction evidence.",
            "- `matched-icd-codes.csv`: aggregate ICD phenotype code list.",
            "- `phenotype-audit.json`: ICD prefix counts, sample titles, and suspicious-code screen.",
            "- `qa.json`: quality checks and limitations.",
            "- `cost-ledger.json`: byte and estimated-cost accounting.",
            "- `run-manifest.json`: source tables and reproducibility metadata.",
        ]
    )
    (ANALYSIS_DIR / "paper.md").write_text("\n".join(lines) + "\n")


def main() -> None:
    ANALYSIS_DIR.mkdir(parents=True, exist_ok=True)
    if CACHE_DIR.exists():
        shutil.rmtree(CACHE_DIR)
    CACHE_DIR.mkdir(parents=True)

    manifest = load_manifest()
    tables_by_id = table_lookup(manifest)
    required = [tables_by_id[table_id] for table_id in REQUIRED_TABLES]
    planned_bytes = sum(int(table["bytes"]) for table in required)
    if planned_bytes > MAX_READ_BYTES:
        raise RuntimeError(f"Planned read {planned_bytes} exceeds cap {MAX_READ_BYTES}.")
    if planned_bytes / 1024**3 * CONSERVATIVE_TRANSFER_USD_PER_GB > HARD_COST_CEILING_USD:
        raise RuntimeError("Estimated transfer cost exceeds hard ceiling.")

    cost_events: list[dict[str, Any]] = [
        {
            "event": "analysis_cost_guard_initialized",
            "timestamp": now_iso(),
            "maxReadBytes": MAX_READ_BYTES,
            "plannedBytes": planned_bytes,
            "estimatedTransferUsd": planned_bytes / 1024**3 * CONSERVATIVE_TRANSFER_USD_PER_GB,
            "hardCostCeilingUsd": HARD_COST_CEILING_USD,
        }
    ]
    source_inventory: dict[str, Any] = {}
    local_paths: dict[str, list[Path]] = {}
    copied_bytes = 0
    tables: dict[str, pd.DataFrame] = {}

    try:
        for table in required:
            table_id = table["tableId"]
            paths, bytes_copied, objects = copy_table(table_id, table)
            copied_bytes += bytes_copied
            if copied_bytes > MAX_READ_BYTES:
                raise RuntimeError("Actual copied bytes exceeded cap.")
            local_paths[table_id] = paths
            source_inventory[table_id] = {
                "sourcePath": table["sourcePath"],
                "manifestRows": table["rowCount"],
                "manifestBytes": table["bytes"],
                "objects": objects,
                "localDigest": digest_paths(paths),
                "bytesCopied": bytes_copied,
            }
            cost_events.append(
                {
                    "event": "table_copied",
                    "timestamp": now_iso(),
                    "tableId": table_id,
                    "bytesCopied": bytes_copied,
                    "cumulativeBytes": copied_bytes,
                    "estimatedTransferUsdSoFar": copied_bytes / 1024**3 * CONSERVATIVE_TRANSFER_USD_PER_GB,
                }
            )

        tables["hosp-diagnoses-icd"] = read_table(local_paths["hosp-diagnoses-icd"])
        tables["hosp-d-icd-diagnoses"] = read_table(local_paths["hosp-d-icd-diagnoses"])
        tables["derived-icustay-detail"] = read_table(local_paths["derived-icustay-detail"])
        tables["derived-apsiii"] = read_table(local_paths["derived-apsiii"])
        tables["derived-oasis"] = read_table(local_paths["derived-oasis"])
        tables["derived-first-day-sofa"] = read_table(local_paths["derived-first-day-sofa"])
        tables["derived-first-day-lab"] = read_table(local_paths["derived-first-day-lab"])
        tables["derived-first-day-vitalsign"] = read_table(local_paths["derived-first-day-vitalsign"])

        cohort, cohort_summary, matched_codes = build_cohort(tables)
        phenotype_review = phenotype_audit(matched_codes)
        model_predictors = [
            "admission_age",
            "male",
            "apsiii",
            "oasis",
            "sofa",
            "hemoglobin_min",
            "wbc_max",
            "creatinine_max",
            "bun_max",
            "sbp_min",
            "heart_rate_max",
            "spo2_min",
        ]
        model_results = {
            "mortality": logistic_model(cohort, "hospital_expire_flag", model_predictors, "Adjusted mortality model"),
            "los": ols_log_los_model(cohort, model_predictors),
            "prolonged_los": logistic_model(cohort, "prolonged_icu_los", model_predictors, "Adjusted prolonged ICU stay model"),
        }
        summary_table = table_one(cohort)
        missingness = missingness_summary(cohort, model_predictors + ["hospital_expire_flag", "los_icu", "los_hospital"])

        cost = {
            "plannedBytes": planned_bytes,
            "actualBytes": copied_bytes,
            "estimatedTransferUsd": copied_bytes / 1024**3 * CONSERVATIVE_TRANSFER_USD_PER_GB,
            "estimatedClassBOperationsUsdUpperBound": GCS_STANDARD_CLASS_B_USD_PER_10K,
            "hardCostCeilingUsd": HARD_COST_CEILING_USD,
            "source": "Conservative guard estimate; final GCP billing may lag.",
        }
        qa = qa_checks(cohort, model_results, copied_bytes)

        matched_codes.sort_values(["icd_version", "icd_code"]).to_csv(ANALYSIS_DIR / "matched-icd-codes.csv", index=False)
        (ANALYSIS_DIR / "cohort-summary.json").write_text(
            json.dumps(
                {
                    "cohort": cohort_summary,
                    "phenotype": {
                        "definition": "ICD-9 820/821, ICD-10 S72, or dictionary title fracture terms involving hip/femur/femoral/trochanteric regions.",
                        "matchedDiagnosisCodes": int(matched_codes.shape[0]),
                        "audit": phenotype_review,
                    },
                    "tableOne": summary_table,
                    "missingness": missingness,
                },
                indent=2,
                default=str,
            )
            + "\n"
        )
        (ANALYSIS_DIR / "phenotype-audit.json").write_text(json.dumps(phenotype_review, indent=2, default=str) + "\n")
        (ANALYSIS_DIR / "analysis-results.json").write_text(
            json.dumps(
                {
                    "cohortSummary": cohort_summary,
                    "tableOne": summary_table,
                    "missingness": missingness,
                    "modelResults": model_results,
                },
                indent=2,
                default=str,
            )
            + "\n"
        )
        (ANALYSIS_DIR / "qa.json").write_text(json.dumps(qa, indent=2, default=str) + "\n")
        (ANALYSIS_DIR / "cost-ledger.json").write_text(
            json.dumps({"cost": cost, "events": cost_events}, indent=2, default=str) + "\n"
        )
        (ANALYSIS_DIR / "run-manifest.json").write_text(
            json.dumps(
                {
                    "analysisId": "hip-fracture-icu-outcomes-20260506",
                    "generatedAtIso": now_iso(),
                    "dataset": {
                        "id": manifest["datasetId"],
                        "source": manifest["source"],
                        "access": manifest["access"],
                    },
                    "requiredTables": REQUIRED_TABLES,
                    "sourceInventory": source_inventory,
                    "rowLevelCachePersisted": False,
                    "cost": cost,
                },
                indent=2,
                default=str,
            )
            + "\n"
        )

        if CACHE_DIR.exists():
            shutil.rmtree(CACHE_DIR)
        qa = qa_checks(cohort, model_results, copied_bytes)
        (ANALYSIS_DIR / "qa.json").write_text(json.dumps(qa, indent=2, default=str) + "\n")
        write_paper(cohort_summary, matched_codes, summary_table, model_results, missingness, qa, cost, phenotype_review)
        print(
            json.dumps(
                {
                    "analysisDir": str(ANALYSIS_DIR),
                    "cohortRows": cohort_summary["firstIcuStayCohortRows"],
                    "deaths": int(cohort["hospital_expire_flag"].sum()),
                    "bytesCopied": copied_bytes,
                    "estimatedTransferUsd": cost["estimatedTransferUsd"],
                    "qaStatus": qa["status"],
                },
                indent=2,
            )
        )
    finally:
        if CACHE_DIR.exists():
            shutil.rmtree(CACHE_DIR)


if __name__ == "__main__":
    main()
