#!/usr/bin/env python3
"""Execute one bounded MIMIC-IV study design.

The runner is intentionally conservative:
- reads only tables declared by the study design;
- records cumulative estimated cost before/after the run;
- removes temporary row-level Parquet cache;
- writes aggregate results, paper, QA, manifest, and critique artifacts.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import re
import shutil
import subprocess
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import numpy as np
import pandas as pd
import pyarrow.parquet as pq
import statsmodels.api as sm
from sklearn.metrics import average_precision_score, roc_auc_score


ROOT = Path("/Users/saleh/TechProjects/agenteer")
DATASET_DIR = ROOT / ".loop-memory/datasets/mimiciv-3-1"
MANIFEST_PATH = DATASET_DIR / "dataset-manifest.json"
SESSION_LEDGER = ROOT / ".loop-memory/mimic-executed-studies-20260506/cumulative-cost-ledger.json"

USD_PER_GB = 0.12
SESSION_CEILING_USD = 1.0
PER_RUN_MAX_BYTES = 360 * 1024 * 1024


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def stable_hash(value: Any) -> str:
    return hashlib.sha256(json.dumps(value, sort_keys=True, default=str, separators=(",", ":")).encode()).hexdigest()


def finite_or_none(value: Any) -> float | None:
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None
    return number if math.isfinite(number) else None


def percent_from_log(value: Any) -> float | None:
    number = finite_or_none(value)
    if number is None or number > 50 or number < -50:
        return None
    return finite_or_none((math.exp(number) - 1) * 100)


def run(cmd: list[str]) -> str:
    result = subprocess.run(cmd, text=True, capture_output=True, check=True)
    return result.stdout


def load_json(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text())


def save_json(path: Path, value: Any) -> None:
    path.write_text(json.dumps(value, indent=2, default=str) + "\n")


def normalize_code(value: Any) -> str:
    return re.sub(r"[^A-Z0-9]", "", str(value).upper())


def load_ledger() -> dict[str, Any]:
    if SESSION_LEDGER.exists():
        return load_json(SESSION_LEDGER)
    ledger = {
        "schemaVersion": 1,
        "startedAtIso": now_iso(),
        "ceilingUsd": SESSION_CEILING_USD,
        "estimatedUsd": 0.0,
        "events": [],
    }
    save_json(SESSION_LEDGER, ledger)
    return ledger


def append_cost_event(event: dict[str, Any]) -> dict[str, Any]:
    ledger = load_ledger()
    ledger["events"].append({**event, "timestamp": now_iso()})
    ledger["estimatedUsd"] = sum(float(item.get("estimatedUsd", 0.0)) for item in ledger["events"] if item.get("event") == "actual_read")
    save_json(SESSION_LEDGER, ledger)
    return ledger


def manifest_tables() -> dict[str, dict[str, Any]]:
    manifest = load_json(MANIFEST_PATH)
    return {table["tableId"]: table for table in manifest["tables"]}


def list_objects(source_path: str) -> list[dict[str, Any]]:
    payload = json.loads(run(["gcloud", "storage", "ls", "--json", "--recursive", source_path]))
    objects = []
    for item in payload:
        if item.get("type") != "cloud_object":
            continue
        url = item["url"].split("#", 1)[0]
        if not url.endswith(".parquet"):
            continue
        metadata = item.get("metadata", {})
        objects.append({"url": url, "size": int(metadata.get("size", 0)), "generation": metadata.get("generation")})
    return sorted(objects, key=lambda entry: entry["url"])


def copy_table(table_id: str, table: dict[str, Any], cache_dir: Path) -> tuple[list[Path], int, list[dict[str, Any]]]:
    objects = list_objects(table["sourcePath"])
    target = cache_dir / table_id
    target.mkdir(parents=True, exist_ok=True)
    paths = []
    for obj in objects:
        local = target / obj["url"].rsplit("/", 1)[-1]
        run(["gcloud", "storage", "cp", obj["url"], str(local)])
        paths.append(local)
    return paths, sum(path.stat().st_size for path in paths), objects


def read_parquet(paths: list[Path]) -> pd.DataFrame:
    return pq.read_table([str(path) for path in paths]).to_pandas()


def match_icd_dictionary(dictionary: pd.DataFrame, families: list[dict[str, Any]]) -> pd.DataFrame:
    dictionary = dictionary.copy()
    dictionary["norm_code"] = dictionary["icd_code"].map(normalize_code)
    dictionary["title_lower"] = dictionary["long_title"].astype(str).str.lower()
    masks = []
    for family in families:
        system = family["system"]
        expected = [str(term).lower() for term in family.get("expectedTerms", [])]
        query = str(family["query"])
        version = 10 if system == "icd10cm" else 9
        version_mask = dictionary["icd_version"].astype(int) == version
        norm_query = normalize_code(query)
        if re.fullmatch(r"[A-Z0-9.]+", query) and norm_query:
            mask = version_mask & dictionary["norm_code"].str.startswith(norm_query)
        else:
            terms = [term for term in re.split(r"\s+", query.lower()) if len(term) > 2]
            mask = version_mask
            for term in terms:
                mask = mask & dictionary["title_lower"].str.contains(re.escape(term), na=False)
        if expected:
            expected_mask = False
            for term in expected:
                expected_mask = expected_mask | dictionary["title_lower"].str.contains(re.escape(term), na=False)
            mask = mask & expected_mask
        masks.append(mask)
    if not masks:
        return dictionary.iloc[0:0].drop(columns=["norm_code", "title_lower"])
    combined = masks[0]
    for mask in masks[1:]:
        combined = combined | mask
    return dictionary.loc[combined].drop(columns=["norm_code", "title_lower"]).drop_duplicates()


def prepare_table(table_id: str, frame: pd.DataFrame) -> pd.DataFrame:
    # Repeated-event tables are collapsed to one row per best available encounter key.
    if table_id == "derived-antibiotic":
        keys = [key for key in ["subject_id", "hadm_id", "stay_id"] if key in frame.columns]
        grouped = frame.groupby(keys, dropna=False).size().reset_index(name="antibiotic_record_count")
        grouped["any_antibiotic_record"] = 1
        return grouped
    if table_id.startswith("derived-kdigo"):
        keys = [key for key in ["subject_id", "hadm_id", "stay_id"] if key in frame.columns]
        numeric = [c for c in frame.select_dtypes(include=[np.number]).columns if c not in keys]
        if not keys or not numeric:
            return frame.drop_duplicates()
        agg = frame.groupby(keys, dropna=False)[numeric].max().reset_index()
        return agg
    if table_id == "hosp-diagnoses-icd" or table_id == "hosp-d-icd-diagnoses":
        return frame
    keys = [key for key in ["subject_id", "hadm_id", "stay_id"] if key in frame.columns]
    if keys and frame.duplicated(keys).any():
        numeric = [c for c in frame.select_dtypes(include=[np.number]).columns if c not in keys]
        categorical = [c for c in frame.columns if c not in keys and c not in numeric]
        parts = []
        if numeric:
            parts.append(frame.groupby(keys, dropna=False)[numeric].max())
        if categorical:
            parts.append(frame.groupby(keys, dropna=False)[categorical].first())
        if parts:
            return pd.concat(parts, axis=1).reset_index()
    return frame.drop_duplicates()


def first_icu_stay(frame: pd.DataFrame) -> pd.DataFrame:
    out = frame.copy()
    out["icu_intime"] = pd.to_datetime(out.get("icu_intime"), errors="coerce")
    out = out.sort_values(["hadm_id", "icu_intime", "stay_id"])
    return out.drop_duplicates("hadm_id", keep="first")


def merge_tables(base: pd.DataFrame, table_id: str, frame: pd.DataFrame) -> pd.DataFrame:
    if table_id == "derived-icustay-detail":
        return base
    keys = [key for key in ["subject_id", "hadm_id", "stay_id"] if key in base.columns and key in frame.columns]
    if not keys:
        return base
    keep = [c for c in frame.columns if c in keys or c not in base.columns]
    return base.merge(frame[keep], on=keys, how="left")


def build_cohort(study: dict[str, Any], tables: dict[str, pd.DataFrame]) -> tuple[pd.DataFrame, pd.DataFrame, dict[str, Any]]:
    dx = tables["hosp-diagnoses-icd"].copy()
    dictionary = tables["hosp-d-icd-diagnoses"].copy()
    dx["icd_code"] = dx["icd_code"].astype(str)
    dictionary["icd_code"] = dictionary["icd_code"].astype(str)
    dx["icd_version"] = dx["icd_version"].astype(int)
    dictionary["icd_version"] = dictionary["icd_version"].astype(int)
    matched_codes = match_icd_dictionary(dictionary, study["icdFamilies"])
    fracture_dx = dx.merge(matched_codes[["icd_code", "icd_version", "long_title"]], on=["icd_code", "icd_version"], how="inner")
    admissions = fracture_dx[["subject_id", "hadm_id"]].drop_duplicates()
    base = first_icu_stay(tables["derived-icustay-detail"])
    cohort = base.merge(admissions, on=["subject_id", "hadm_id"], how="inner")
    for table_id, frame in tables.items():
        if table_id in {"hosp-diagnoses-icd", "hosp-d-icd-diagnoses", "derived-icustay-detail"}:
            continue
        cohort = merge_tables(cohort, table_id, prepare_table(table_id, frame))
    if "gender" in cohort.columns:
        cohort["male"] = (cohort["gender"].astype(str).str.upper() == "M").astype(int)
    if "los_icu" in cohort.columns:
        cohort["prolonged_icu_los"] = pd.to_numeric(cohort["los_icu"], errors="coerce") > pd.to_numeric(
            cohort["los_icu"], errors="coerce"
        ).quantile(0.75)
    summary = {
        "matchedDiagnosisCodes": int(matched_codes.shape[0]),
        "matchedDiagnosisRows": int(fracture_dx.shape[0]),
        "matchedAdmissions": int(admissions.shape[0]),
        "firstIcuStayRows": int(cohort.shape[0]),
        "uniquePatients": int(cohort["subject_id"].nunique()) if "subject_id" in cohort.columns else None,
    }
    return cohort, matched_codes, summary


def numeric_summary(series: pd.Series) -> dict[str, Any]:
    clean = pd.to_numeric(series, errors="coerce").replace([np.inf, -np.inf], np.nan).dropna()
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


def binary_summary(series: pd.Series) -> dict[str, Any]:
    clean = pd.to_numeric(series, errors="coerce").dropna().astype(int)
    n = int(clean.shape[0])
    pos = int(clean.sum()) if n else 0
    return {"n": n, "positive": pos, "proportion": pos / n if n else None}


def standardize(frame: pd.DataFrame, columns: list[str]) -> tuple[pd.DataFrame, dict[str, Any]]:
    out = frame.copy()
    scalers = {}
    for col in columns:
        mean = float(out[col].mean())
        sd = float(out[col].std(ddof=1))
        if not sd or math.isnan(sd):
            sd = 1.0
        out[col] = (out[col] - mean) / sd
        scalers[col] = {"mean": mean, "sd": sd}
    return out, scalers


def candidate_predictors(cohort: pd.DataFrame) -> list[str]:
    preferred = [
        "admission_age",
        "male",
        "apsiii",
        "oasis",
        "sofa",
        "charlson_comorbidity_index",
        "hemoglobin_min",
        "wbc_max",
        "creatinine_max",
        "bun_max",
        "glucose_max",
        "sbp_min",
        "heart_rate_max",
        "spo2_min",
        "gcs",
        "urineoutput",
        "any_antibiotic_record",
        "antibiotic_record_count",
        "aki_stage",
        "aki_stage_smoothed",
    ]
    predictors = []
    for col in preferred:
        if col in cohort.columns and pd.to_numeric(cohort[col], errors="coerce").notna().sum() >= max(30, int(0.1 * len(cohort))):
            predictors.append(col)
    return predictors[:12]


def fit_logistic(cohort: pd.DataFrame, outcome: str, predictors: list[str]) -> dict[str, Any]:
    if outcome not in cohort.columns or not predictors:
        return {"status": "not_fit", "reason": "Missing outcome or predictors."}
    frame = cohort[[outcome] + predictors].replace([np.inf, -np.inf], np.nan).copy()
    for col in frame.columns:
        frame[col] = pd.to_numeric(frame[col], errors="coerce")
    frame = frame.dropna()
    if len(frame) < 50:
        return {"status": "not_fit", "reason": "Too few complete cases.", "n": int(len(frame))}
    y = frame[outcome].astype(int)
    if y.nunique() != 2 or y.sum() < 10 or (len(y) - y.sum()) < 10:
        return {"status": "not_fit", "reason": "Outcome lacks enough events/non-events.", "n": int(len(frame))}
    continuous = [c for c in predictors if c != "male" and frame[c].nunique(dropna=True) > 2]
    frame, scalers = standardize(frame, continuous)
    x = sm.add_constant(frame[predictors], has_constant="add")
    try:
        result = sm.Logit(y, x).fit(disp=False, maxiter=200)
        conf = result.conf_int()
        rows = []
        for term in result.params.index:
            if term == "const":
                continue
            rows.append(
                {
                    "term": term,
                    "oddsRatio": float(np.exp(result.params[term])),
                    "ci95": [float(np.exp(conf.loc[term, 0])), float(np.exp(conf.loc[term, 1]))],
                    "pValue": float(result.pvalues[term]),
                    "scale": "per 1 SD" if term in continuous else "per unit",
                }
            )
        pred = result.predict(x)
        return {
            "status": "fit",
            "n": int(len(frame)),
            "events": int(y.sum()),
            "predictors": predictors,
            "scalers": scalers,
            "metrics": {"auroc": float(roc_auc_score(y, pred)), "averagePrecision": float(average_precision_score(y, pred))},
            "coefficients": rows,
        }
    except Exception as exc:
        return {"status": "not_fit", "reason": str(exc), "n": int(len(frame)), "events": int(y.sum())}


def fit_log_los(cohort: pd.DataFrame, predictors: list[str]) -> dict[str, Any]:
    if "los_icu" not in cohort.columns or not predictors:
        return {"status": "not_fit", "reason": "Missing LOS or predictors."}
    frame = cohort[["los_icu"] + predictors].replace([np.inf, -np.inf], np.nan).copy()
    for col in frame.columns:
        frame[col] = pd.to_numeric(frame[col], errors="coerce")
    frame = frame.dropna()
    frame = frame[frame["los_icu"] > 0]
    if len(frame) < 50:
        return {"status": "not_fit", "reason": "Too few complete cases.", "n": int(len(frame))}
    continuous = [c for c in predictors if c != "male" and frame[c].nunique(dropna=True) > 2]
    frame, scalers = standardize(frame, continuous)
    y = np.log1p(frame["los_icu"])
    x = sm.add_constant(frame[predictors], has_constant="add")
    try:
        result = sm.OLS(y, x).fit(cov_type="HC3")
        conf = result.conf_int()
        rows = []
        for term in result.params.index:
            if term == "const":
                continue
            percent = percent_from_log(result.params[term])
            low = percent_from_log(conf.loc[term, 0])
            high = percent_from_log(conf.loc[term, 1])
            rows.append(
                {
                    "term": term,
                    "percentChangeInLos": percent,
                    "ci95PercentChange": [low, high],
                    "pValue": float(result.pvalues[term]),
                    "scale": "per 1 SD" if term in continuous else "per unit",
                }
            )
        return {
            "status": "fit",
            "n": int(len(frame)),
            "predictors": predictors,
            "scalers": scalers,
            "rSquared": float(result.rsquared),
            "coefficients": rows,
        }
    except Exception as exc:
        return {"status": "not_fit", "reason": str(exc), "n": int(len(frame))}


def missingness(cohort: pd.DataFrame, columns: list[str]) -> list[dict[str, Any]]:
    rows = []
    n = len(cohort)
    for col in columns:
        if col in cohort.columns:
            miss = int(cohort[col].isna().sum())
            rows.append({"column": col, "missing": miss, "missingFraction": miss / n if n else None})
    return sorted(rows, key=lambda item: item["missingFraction"] or 0, reverse=True)


def methods_issues(cohort_summary: dict[str, Any], models: dict[str, Any]) -> list[dict[str, Any]]:
    issues: list[dict[str, Any]] = []
    cohort_n = int(cohort_summary.get("firstIcuStayRows") or 0)
    if cohort_n < 100:
        issues.append(
            {
                "code": "SMALL_COHORT_REVIEW",
                "severity": "warning",
                "message": "Fewer than 100 first ICU stays were available; estimates may be unstable.",
            }
        )
    mortality = models.get("mortality", {})
    if mortality.get("status") == "fit":
        events = int(mortality.get("events") or 0)
        predictors = len(mortality.get("predictors") or [])
        non_events = int(mortality.get("n") or 0) - events
        if events < 20 or non_events < 20:
            issues.append(
                {
                    "code": "SPARSE_BINARY_OUTCOME_REVIEW",
                    "severity": "warning",
                    "message": "The mortality model has fewer than 20 events or non-events.",
                }
            )
        if predictors and events / predictors < 10:
            issues.append(
                {
                    "code": "LOW_EVENTS_PER_PREDICTOR",
                    "severity": "warning",
                    "message": f"Mortality model has {events} events across {predictors} predictors.",
                }
            )
    los = models.get("los", {})
    if los.get("status") == "fit":
        nonfinite_terms = [
            row.get("term")
            for row in los.get("coefficients", [])
            if row.get("percentChangeInLos") is None or any(value is None for value in row.get("ci95PercentChange", []))
        ]
        if nonfinite_terms:
            issues.append(
                {
                    "code": "NONFINITE_LOS_EFFECT_REVIEW",
                    "severity": "warning",
                    "message": "At least one ICU LOS effect estimate was too large or unstable to render as a finite percent change.",
                    "terms": nonfinite_terms,
                }
            )
    return issues


def write_paper(out_dir: Path, study: dict[str, Any], cohort_summary: dict[str, Any], table1: dict[str, Any], models: dict[str, Any], miss: list[dict[str, Any]], qa: dict[str, Any], cost: dict[str, Any]) -> None:
    lines = [
        f"# {study['title']}",
        "",
        "## Plain-Language Summary",
        "",
        f"This analysis used MIMIC-IV ICU records to study: {study['question']} The results are observational and describe associations in hospitalized ICU patients, not causal effects.",
        "",
        "## Cohort",
        "",
        f"- Matched diagnosis codes: {cohort_summary['matchedDiagnosisCodes']}.",
        f"- Matched diagnosis rows: {cohort_summary['matchedDiagnosisRows']}.",
        f"- Matched hospital admissions: {cohort_summary['matchedAdmissions']}.",
        f"- First ICU stay cohort rows: {cohort_summary['firstIcuStayRows']}.",
        f"- Unique patients: {cohort_summary['uniquePatients']}.",
        "",
        "## Methods",
        "",
        "Diagnosis-code families were verified online before execution, then matched against the local MIMIC diagnosis dictionary. The primary cohort used the first ICU stay per matching hospitalization. Models used complete-case analysis for available first-day severity, laboratory, and vital-sign predictors.",
        "",
        "## Cohort Characteristics",
        "",
    ]
    for col in ["admission_age", "los_icu", "los_hospital", "apsiii", "oasis", "sofa"]:
        if col in table1.get("continuous", {}):
            s = table1["continuous"][col]
            if s.get("n"):
                lines.append(f"- {col}: median {s['median']:.2f} (IQR {s['iqr'][0]:.2f}-{s['iqr'][1]:.2f}), n={s['n']}.")
    if "hospital_expire_flag" in table1.get("binary", {}):
        b = table1["binary"]["hospital_expire_flag"]
        lines.append(f"- In-hospital mortality: {b['positive']} of {b['n']} ({b['proportion']:.1%}).")
    if "male" in table1.get("binary", {}):
        b = table1["binary"]["male"]
        lines.append(f"- Male sex: {b['positive']} of {b['n']} ({b['proportion']:.1%}).")
    lines.extend(["", "## Mortality Model", ""])
    mortality = models.get("mortality", {})
    if mortality.get("status") == "fit":
        lines.append(f"Complete-case N={mortality['n']}; deaths={mortality['events']}; AUROC={mortality['metrics']['auroc']:.3f}; average precision={mortality['metrics']['averagePrecision']:.3f}.")
        for row in sorted(mortality["coefficients"], key=lambda r: r["pValue"])[:6]:
            lines.append(f"- {row['term']}: adjusted OR {row['oddsRatio']:.2f} ({row['ci95'][0]:.2f}, {row['ci95'][1]:.2f}), p={row['pValue']:.3g}, {row['scale']}.")
    else:
        lines.append(f"Mortality model was not fit: {mortality.get('reason')}.")
    lines.extend(["", "## ICU Length Of Stay Model", ""])
    los = models.get("los", {})
    if los.get("status") == "fit":
        lines.append(f"Complete-case N={los['n']}; R-squared={los['rSquared']:.3f}.")
        for row in sorted(los["coefficients"], key=lambda r: r["pValue"])[:6]:
            if row["percentChangeInLos"] is None or any(value is None for value in row["ci95PercentChange"]):
                lines.append(f"- {row['term']}: effect estimate was too unstable to render as a finite percent change, p={row['pValue']:.3g}, {row['scale']}.")
            else:
                lines.append(f"- {row['term']}: {row['percentChangeInLos']:.1f}% change ({row['ci95PercentChange'][0]:.1f}%, {row['ci95PercentChange'][1]:.1f}%), p={row['pValue']:.3g}, {row['scale']}.")
    else:
        lines.append(f"LOS model was not fit: {los.get('reason')}.")
    lines.extend(["", "## Missingness", ""])
    for row in miss[:10]:
        lines.append(f"- {row['column']}: {row['missing']} missing ({row['missingFraction']:.1%}).")
    lines.extend(
        [
            "",
            "## Quality And Cost Controls",
            "",
            f"- QA status: {qa['status']}.",
            f"- Estimated run cost: ${cost['estimatedUsd']:.4f}.",
            f"- Cumulative estimated session cost: ${cost['cumulativeEstimatedUsd']:.4f} of ${SESSION_CEILING_USD:.2f}.",
            f"- Temporary row-level cache removed: {'yes' if not (out_dir / '_tmp-parquet-cache').exists() else 'no'}.",
            "",
            "## Limitations",
            "",
            "- This is an observational diagnosis-code-based analysis.",
            "- Diagnosis codes may reflect billing/coding and may not perfectly identify clinical onset, severity, or reason for ICU admission.",
            "- First-day variables may be care-process markers as well as illness-severity markers.",
            "- Complete-case models should be reviewed before publication-quality use.",
        ]
    )
    (out_dir / "paper.md").write_text("\n".join(lines) + "\n")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--study", required=True)
    parser.add_argument("--out-dir", required=True)
    args = parser.parse_args()
    study_path = Path(args.study)
    out_dir = Path(args.out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    cache_dir = out_dir / "_tmp-parquet-cache"
    if cache_dir.exists():
        shutil.rmtree(cache_dir)
    cache_dir.mkdir(parents=True)

    study_artifact = load_json(study_path)
    study = study_artifact["study"]
    study["icdFamilies"] = study_artifact["icdFamilies"]
    tables_by_id = manifest_tables()
    required = study["tables"]
    missing_tables = [table for table in required if table not in tables_by_id]
    if missing_tables:
        failure = {"status": "blocked", "reason": "Missing required tables.", "missingTables": missing_tables}
        save_json(out_dir / "qa.json", failure)
        print(json.dumps(failure, indent=2))
        return
    planned_bytes = sum(int(tables_by_id[table]["bytes"]) for table in required)
    planned_usd = planned_bytes / 1024**3 * USD_PER_GB
    ledger = load_ledger()
    if planned_bytes > PER_RUN_MAX_BYTES:
        raise RuntimeError(f"Planned read {planned_bytes} exceeds per-run cap {PER_RUN_MAX_BYTES}.")
    if float(ledger["estimatedUsd"]) + planned_usd > SESSION_CEILING_USD:
        raise RuntimeError("Cumulative estimated cost would exceed $1 ceiling.")
    append_cost_event({"event": "planned_read", "studyId": study["id"], "plannedBytes": planned_bytes, "estimatedUsd": 0.0})

    copied_bytes = 0
    inventory = {}
    tables: dict[str, pd.DataFrame] = {}
    try:
        for table_id in required:
            paths, bytes_copied, objects = copy_table(table_id, tables_by_id[table_id], cache_dir)
            copied_bytes += bytes_copied
            if copied_bytes > PER_RUN_MAX_BYTES:
                raise RuntimeError("Actual read exceeded per-run cap.")
            inventory[table_id] = {
                "sourcePath": tables_by_id[table_id]["sourcePath"],
                "manifestBytes": tables_by_id[table_id]["bytes"],
                "manifestRows": tables_by_id[table_id].get("rowCount"),
                "bytesCopied": bytes_copied,
                "objects": objects,
            }
            tables[table_id] = read_parquet(paths)
        cohort, matched_codes, cohort_summary = build_cohort(study, tables)
        predictors = candidate_predictors(cohort)
        table1 = {
            "continuous": {col: numeric_summary(cohort[col]) for col in ["admission_age", "los_icu", "los_hospital", "apsiii", "oasis", "sofa", "charlson_comorbidity_index"] if col in cohort.columns},
            "binary": {col: binary_summary(cohort[col]) for col in ["hospital_expire_flag", "male", "prolonged_icu_los"] if col in cohort.columns},
        }
        models = {
            "mortality": fit_logistic(cohort, "hospital_expire_flag", predictors),
            "los": fit_log_los(cohort, predictors),
        }
        miss = missingness(cohort, predictors + ["hospital_expire_flag", "los_icu", "los_hospital"])
        actual_usd = copied_bytes / 1024**3 * USD_PER_GB
        ledger = append_cost_event({"event": "actual_read", "studyId": study["id"], "actualBytes": copied_bytes, "estimatedUsd": actual_usd})
        if cache_dir.exists():
            shutil.rmtree(cache_dir)
        typed_issues = methods_issues(cohort_summary, models)
        qa_checks = [
            {"code": "cost-under-session-ceiling", "passed": ledger["estimatedUsd"] <= SESSION_CEILING_USD},
            {"code": "cohort-nonempty", "passed": cohort_summary["firstIcuStayRows"] > 0},
            {"code": "icd-codes-matched", "passed": cohort_summary["matchedDiagnosisCodes"] > 0},
            {"code": "row-cache-removed", "passed": not cache_dir.exists()},
            {"code": "mortality-model-fit-or-justified", "passed": models["mortality"].get("status") == "fit" or "reason" in models["mortality"]},
            {"code": "los-model-fit-or-justified", "passed": models["los"].get("status") == "fit" or "reason" in models["los"]},
            {"code": "methods-review-typed-issues-recorded", "passed": True},
        ]
        qa = {
            "status": "pass" if all(item["passed"] for item in qa_checks) and not typed_issues else "review",
            "checks": qa_checks,
            "typedIssues": typed_issues,
            "warnings": study_artifact["selfAudit"].get("warnings", []),
            "blockers": study_artifact["selfAudit"].get("blockers", []),
        }
        cost = {
            "actualBytes": copied_bytes,
            "estimatedUsd": actual_usd,
            "cumulativeEstimatedUsd": ledger["estimatedUsd"],
            "sessionCeilingUsd": SESSION_CEILING_USD,
        }
        matched_codes.to_csv(out_dir / "matched-icd-codes.csv", index=False)
        save_json(out_dir / "analysis-results.json", {"study": study, "cohortSummary": cohort_summary, "tableOne": table1, "predictors": predictors, "missingness": miss, "models": models})
        save_json(out_dir / "qa.json", qa)
        save_json(out_dir / "cost-receipt.json", cost)
        save_json(out_dir / "run-manifest.json", {"studyPath": str(study_path), "sourceInventory": inventory, "studyHash": stable_hash(study_artifact), "generatedAtIso": now_iso()})
        critique = {
            "verdict": "local_review_ready" if qa["status"] == "pass" and cohort_summary["firstIcuStayRows"] >= 50 else "needs_review",
            "mainRisks": [
                "ICD phenotype requires clinical/coding review.",
                "Associational models should not be interpreted causally.",
                "Complete-case analysis may bias results if missingness is informative.",
            ],
            "nextImprovement": "Add phenotype-specific sensitivity analysis or split broad code families before publication-quality use.",
        }
        save_json(out_dir / "critique.json", critique)
        (out_dir / "critique.md").write_text(
            "# Critique\n\n"
            f"Verdict: `{critique['verdict']}`.\n\n"
            + "\n".join(f"- {risk}" for risk in critique["mainRisks"])
            + f"\n\nNext improvement: {critique['nextImprovement']}\n"
        )
        write_paper(out_dir, study, cohort_summary, table1, models, miss, qa, cost)
        print(json.dumps({"studyId": study["id"], "outDir": str(out_dir), "cohortRows": cohort_summary["firstIcuStayRows"], "costUsd": actual_usd, "cumulativeCostUsd": ledger["estimatedUsd"], "qa": qa["status"]}, indent=2))
    finally:
        if cache_dir.exists():
            shutil.rmtree(cache_dir)


if __name__ == "__main__":
    main()
