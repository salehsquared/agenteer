#!/usr/bin/env python3
"""MIMIC-IV SAVR/TAVR outcomes by dialysis status.

This is a local-review runner for a hospital-longitudinal MIMIC-IV question.
It reads declared Parquet tables from the project-owned GCS cache, removes the
temporary row-level cache after execution, and writes aggregate artifacts only.
"""

from __future__ import annotations

import hashlib
import json
import math
import os
import re
import shutil
import subprocess
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

import numpy as np
import pandas as pd
import pyarrow.parquet as pq
import statsmodels.api as sm


ROOT = Path("/Users/saleh/TechProjects/agenteer")
DATASET_DIR = ROOT / ".loop-memory/datasets/mimiciv-3-1"
MANIFEST_PATH = DATASET_DIR / "dataset-manifest.json"
OUT_DIR = ROOT / ".loop-memory/mimic-savr-tavr-dialysis-20260509"
RUN_DIR = Path(os.environ.get("AGENTEER_VALVE_DIALYSIS_RUN_DIR", str(OUT_DIR / "run")))

USD_PER_GB = 0.12
COST_CEILING_USD = 10.0
PER_RUN_MAX_BYTES = 180 * 1024 * 1024

TABLES = [
    "hosp-patients",
    "hosp-admissions",
    "hosp-procedures-icd",
    "hosp-d-icd-procedures",
    "hosp-diagnoses-icd",
    "hosp-d-icd-diagnoses",
    "hosp-hcpcsevents",
    "hosp-d-hcpcs",
    "derived-charlson",
]

TAVR_CPT_CODES = {"0256T", "0257T", "0258T", "0259T", "33361", "33362", "33363", "33364", "33365", "33366", "33367", "33368", "33369"}
SAVR_CPT_CODES = {"33405", "33410", "33411", "33412", "33413"}
TAVR_ICD9_PROC_CODES = {"3505", "3506"}
SAVR_ICD9_PROC_CODES = {"3521", "3522"}
DIALYSIS_ICD10_DX_CODES = {"N186", "Z992"}
DIALYSIS_ICD9_DX_CODES = {"5856", "V4511", "V560", "V561", "V562", "V5631", "V5632", "V568"}
HD_OR_UNSPECIFIED_DX_CODES = {"5856", "V4511", "V560", "V561", "V5631", "V568", "N186", "Z992"}
PERITONEAL_DIALYSIS_DX_CODES = {"V562", "V5632"}
PERITONEAL_DIALYSIS_ICD9_PROC_CODES = {"5498"}
PERITONEAL_DIALYSIS_CPT_HCPCS_CODES = {"49324", "49325", "49326", "49418", "49420", "49421", "49422", "49435", "49436", "G0052"}


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def stable_hash(value: Any) -> str:
    return hashlib.sha256(json.dumps(value, sort_keys=True, default=str, separators=(",", ":")).encode()).hexdigest()


def save_json(path: Path, value: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, indent=2, default=str) + "\n")


def run(cmd: list[str], attempts: int = 1) -> str:
    last_error: subprocess.CalledProcessError | None = None
    for attempt in range(1, attempts + 1):
        try:
            return subprocess.run(cmd, text=True, capture_output=True, check=True).stdout
        except subprocess.CalledProcessError as exc:
            last_error = exc
            if attempt == attempts:
                break
            time.sleep(min(2 * attempt, 8))
    assert last_error is not None
    raise last_error


def normalize_code(value: Any) -> str:
    return re.sub(r"[^A-Z0-9]", "", str(value).upper())


def manifest_tables() -> dict[str, dict[str, Any]]:
    return {table["tableId"]: table for table in json.loads(MANIFEST_PATH.read_text())["tables"]}


def list_objects(source_path: str) -> list[dict[str, Any]]:
    payload = json.loads(run(["gcloud", "storage", "ls", "--json", "--recursive", source_path]))
    objects: list[dict[str, Any]] = []
    for item in payload:
        if item.get("type") != "cloud_object":
            continue
        url = item["url"].split("#", 1)[0]
        if url.endswith(".parquet"):
            metadata = item.get("metadata", {})
            objects.append({"url": url, "size": int(metadata.get("size", 0)), "generation": metadata.get("generation")})
    return sorted(objects, key=lambda item: item["url"])


def copy_table(table_id: str, table: dict[str, Any], cache_dir: Path) -> tuple[pd.DataFrame, dict[str, Any], int]:
    target = cache_dir / table_id
    target.mkdir(parents=True, exist_ok=True)
    objects = list_objects(table["sourcePath"])
    paths: list[Path] = []
    for obj in objects:
        local = target / obj["url"].rsplit("/", 1)[-1]
        run(["gcloud", "storage", "cp", obj["url"], str(local)], attempts=3)
        paths.append(local)
    bytes_copied = sum(path.stat().st_size for path in paths)
    frame = pq.read_table([str(path) for path in paths]).to_pandas()
    return frame, {"sourcePath": table["sourcePath"], "manifestBytes": table["bytes"], "manifestRows": table.get("rowCount"), "bytesCopied": bytes_copied, "objects": objects}, bytes_copied


def load_tables() -> tuple[dict[str, pd.DataFrame], dict[str, Any]]:
    by_id = manifest_tables()
    missing = [table for table in TABLES if table not in by_id]
    if missing:
        raise RuntimeError(f"Missing required MIMIC tables: {missing}")
    planned_bytes = sum(int(by_id[table]["bytes"]) for table in TABLES)
    planned_usd = planned_bytes / 1024**3 * USD_PER_GB
    if planned_bytes > PER_RUN_MAX_BYTES:
        raise RuntimeError(f"Planned read {planned_bytes} exceeds cap {PER_RUN_MAX_BYTES}")
    if planned_usd > COST_CEILING_USD:
        raise RuntimeError(f"Planned cost ${planned_usd:.4f} exceeds ceiling ${COST_CEILING_USD:.2f}")

    cache_dir = RUN_DIR / "_tmp-parquet-cache"
    if cache_dir.exists():
        shutil.rmtree(cache_dir)
    cache_dir.mkdir(parents=True)

    tables: dict[str, pd.DataFrame] = {}
    inventory: dict[str, Any] = {"plannedBytes": planned_bytes, "plannedUsd": planned_usd, "tables": {}, "rowCacheRemoved": False}
    copied = 0
    try:
        for table_id in TABLES:
            frame, table_inventory, bytes_copied = copy_table(table_id, by_id[table_id], cache_dir)
            copied += bytes_copied
            if copied > PER_RUN_MAX_BYTES:
                raise RuntimeError("Actual read exceeded per-run cap")
            tables[table_id] = frame
            inventory["tables"][table_id] = table_inventory
    finally:
        if cache_dir.exists():
            shutil.rmtree(cache_dir)
        inventory["rowCacheRemoved"] = not cache_dir.exists()
    inventory["actualBytes"] = copied
    inventory["actualUsd"] = copied / 1024**3 * USD_PER_GB
    return tables, inventory


def add_norm_code(frame: pd.DataFrame, code_col: str) -> pd.DataFrame:
    out = frame.copy()
    out["norm_code"] = out[code_col].map(normalize_code)
    return out


def classify_icd_procedures(procedures: pd.DataFrame, proc_dict: pd.DataFrame) -> tuple[pd.DataFrame, pd.DataFrame]:
    proc = add_norm_code(procedures, "icd_code")
    dictionary = add_norm_code(proc_dict, "icd_code")
    dictionary["title_lower"] = dictionary["long_title"].astype(str).str.lower()
    proc = proc.rename(columns={"norm_code": "event_norm_code"})
    proc = proc.merge(dictionary[["icd_code", "icd_version", "long_title", "norm_code", "title_lower"]], on=["icd_code", "icd_version"], how="left")

    title = proc["title_lower"].fillna("")
    code = proc["event_norm_code"]
    version = proc["icd_version"].astype(int)
    proc["proc_savr"] = (
        (version.eq(9) & code.isin(SAVR_ICD9_PROC_CODES))
        | (version.eq(10) & title.str.contains("replacement of aortic valve", na=False) & title.str.contains("open approach", na=False))
        | code.isin({"X2RF032"})
    ).astype(int)
    proc["proc_tavr"] = (
        (version.eq(9) & code.isin(TAVR_ICD9_PROC_CODES))
        | (version.eq(10) & title.str.contains("replacement of aortic valve", na=False) & title.str.contains("percutaneous", na=False))
        | code.isin({"X2RF332", "X2RF432"})
    ).astype(int)
    proc["proc_aortic_revision"] = (version.eq(10) & title.str.contains("revision of .*aortic valve|excision of aortic valve|supplement aortic valve", regex=True, na=False)).astype(int)
    matched = proc.loc[proc[["proc_savr", "proc_tavr", "proc_aortic_revision"]].sum(axis=1).gt(0), ["icd_code", "icd_version", "long_title", "proc_savr", "proc_tavr", "proc_aortic_revision"]].drop_duplicates()
    return proc, matched


def classify_hcpcs(events: pd.DataFrame, dictionary: pd.DataFrame) -> tuple[pd.DataFrame, pd.DataFrame]:
    events = events.copy()
    events["hcpcs_norm"] = events["hcpcs_cd"].map(normalize_code)
    dictionary = dictionary.copy()
    dictionary["hcpcs_norm"] = dictionary["code"].map(normalize_code)
    events = events.merge(dictionary[["hcpcs_norm", "long_description", "short_description"]], on="hcpcs_norm", how="left", suffixes=("", "_dict"))
    events["hcpcs_tavr"] = events["hcpcs_norm"].isin(TAVR_CPT_CODES).astype(int)
    events["hcpcs_savr"] = events["hcpcs_norm"].isin(SAVR_CPT_CODES).astype(int)
    desc = events[["long_description", "short_description", "short_description_dict"]].fillna("").astype(str).agg(" ".join, axis=1).str.lower()
    events["hcpcs_hemodialysis"] = desc.str.contains("hemodialysis").astype(int)
    events["hcpcs_peritoneal_dialysis"] = (events["hcpcs_norm"].isin(PERITONEAL_DIALYSIS_CPT_HCPCS_CODES) | desc.str.contains("peritoneal dialysis")).astype(int)
    matched = events.loc[events[["hcpcs_tavr", "hcpcs_savr", "hcpcs_hemodialysis", "hcpcs_peritoneal_dialysis"]].sum(axis=1).gt(0), ["hcpcs_cd", "long_description", "short_description", "hcpcs_tavr", "hcpcs_savr", "hcpcs_hemodialysis", "hcpcs_peritoneal_dialysis"]].drop_duplicates()
    return events, matched


def classify_diagnoses(dx: pd.DataFrame, dx_dict: pd.DataFrame) -> tuple[pd.DataFrame, pd.DataFrame]:
    out = add_norm_code(dx, "icd_code")
    dictionary = add_norm_code(dx_dict, "icd_code")
    dictionary["title_lower"] = dictionary["long_title"].astype(str).str.lower()
    out = out.rename(columns={"norm_code": "event_norm_code"})
    out = out.merge(dictionary[["icd_code", "icd_version", "long_title", "norm_code", "title_lower"]], on=["icd_code", "icd_version"], how="left")
    title = out["title_lower"].fillna("")
    code = out["event_norm_code"]
    version = out["icd_version"].astype(int)
    out["dx_manual_dialysis"] = ((version.eq(9) & code.isin(DIALYSIS_ICD9_DX_CODES)) | (version.eq(10) & code.isin(DIALYSIS_ICD10_DX_CODES))).astype(int)
    out["dx_hemodialysis"] = ((version.eq(9) & code.isin(HD_OR_UNSPECIFIED_DX_CODES)) | (version.eq(10) & code.isin(HD_OR_UNSPECIFIED_DX_CODES)) | title.str.contains("hemodialysis|renal dialysis status|dependence on renal dialysis", regex=True, na=False)).astype(int)
    out["dx_peritoneal_dialysis"] = ((version.eq(9) & code.isin(PERITONEAL_DIALYSIS_DX_CODES)) | title.str.contains("peritoneal dialysis", na=False)).astype(int)
    out["dx_unspecified_dialysis"] = (out["dx_manual_dialysis"].eq(1) & out["dx_peritoneal_dialysis"].eq(0) & out["dx_hemodialysis"].eq(0)) | (version.eq(9) & code.isin({"V451", "V4511"})) | (version.eq(10) & code.isin({"Z992"}))
    out["dx_unspecified_dialysis"] = out["dx_unspecified_dialysis"].astype(int)
    out["dx_esrd"] = ((version.eq(9) & code.eq("5856")) | (version.eq(10) & code.eq("N186"))).astype(int)
    out["dx_heart_failure"] = ((version.eq(9) & code.str.startswith("428")) | (version.eq(10) & code.str.startswith("I50")) | title.str.contains("heart failure", na=False)).astype(int)
    out["dx_mi"] = ((version.eq(9) & code.str.startswith("410")) | (version.eq(10) & code.str.startswith("I21")) | (version.eq(10) & code.str.startswith("I22"))).astype(int)
    out["dx_stroke"] = (
        (version.eq(9) & (code.str.startswith("433") | code.str.startswith("434") | code.str.startswith("436")))
        | (version.eq(10) & (code.str.startswith("I63") | code.str.startswith("I64")))
    ).astype(int)
    out["dx_cardiac_related"] = ((version.eq(9) & code.str[:3].between("390", "459")) | (version.eq(10) & code.str.startswith("I"))).astype(int)
    matched = out.loc[out[["dx_manual_dialysis", "dx_hemodialysis", "dx_peritoneal_dialysis", "dx_unspecified_dialysis", "dx_esrd", "dx_heart_failure", "dx_mi", "dx_stroke"]].sum(axis=1).gt(0), ["icd_code", "icd_version", "long_title", "dx_manual_dialysis", "dx_hemodialysis", "dx_peritoneal_dialysis", "dx_unspecified_dialysis", "dx_esrd", "dx_heart_failure", "dx_mi", "dx_stroke"]].drop_duplicates()
    return out, matched


def anchor_group_midpoint(group: Any) -> float | None:
    match = re.search(r"(\d{4})\s*-\s*(\d{4})", str(group))
    if not match:
        return None
    return (int(match.group(1)) + int(match.group(2))) / 2


def admission_actual_year(row: pd.Series) -> float | None:
    midpoint = anchor_group_midpoint(row.get("anchor_year_group"))
    if midpoint is None or pd.isna(row.get("admittime")) or pd.isna(row.get("anchor_year")):
        return None
    return float(midpoint + (pd.Timestamp(row["admittime"]).year - int(row["anchor_year"])))


def summarize_binary(frame: pd.DataFrame, group_cols: list[str], columns: list[str]) -> pd.DataFrame:
    rows: list[dict[str, Any]] = []
    for keys, group in frame.groupby(group_cols, dropna=False):
        if not isinstance(keys, tuple):
            keys = (keys,)
        base = dict(zip(group_cols, keys))
        base["n"] = int(len(group))
        for col in columns:
            pos = int(pd.to_numeric(group[col], errors="coerce").fillna(0).sum()) if col in group.columns else 0
            base[f"{col}_n"] = pos
            base[f"{col}_pct"] = pos / len(group) if len(group) else None
        rows.append(base)
    return pd.DataFrame(rows).sort_values(group_cols)


def numeric_table(frame: pd.DataFrame, group_cols: list[str], columns: list[str]) -> pd.DataFrame:
    rows: list[dict[str, Any]] = []
    for keys, group in frame.groupby(group_cols, dropna=False):
        if not isinstance(keys, tuple):
            keys = (keys,)
        base = dict(zip(group_cols, keys))
        base["n"] = int(len(group))
        for col in columns:
            clean = pd.to_numeric(group[col], errors="coerce").dropna()
            base[f"{col}_median"] = float(clean.median()) if len(clean) else None
            base[f"{col}_q1"] = float(clean.quantile(0.25)) if len(clean) else None
            base[f"{col}_q3"] = float(clean.quantile(0.75)) if len(clean) else None
        rows.append(base)
    return pd.DataFrame(rows).sort_values(group_cols)


def fit_adjusted_models(cohort: pd.DataFrame, outcomes: list[str]) -> dict[str, Any]:
    results: dict[str, Any] = {}
    covariates = [
        "dialysis_group",
        "valve_strategy",
        "admission_age",
        "male",
        "charlson_comorbidity_index",
        "anchor_year_group",
        "insurance",
    ]
    available = [col for col in covariates if col in cohort.columns]
    for outcome in outcomes:
        model_frame = cohort[[outcome] + available].copy()
        model_frame[outcome] = pd.to_numeric(model_frame[outcome], errors="coerce")
        model_frame = model_frame.dropna(subset=[outcome])
        events = int(model_frame[outcome].sum())
        non_events = int(len(model_frame) - events)
        if len(model_frame) < 80 or events < 10 or non_events < 10:
            results[outcome] = {"status": "not_fit", "reason": "Insufficient events/non-events", "n": int(len(model_frame)), "events": events}
            continue
        x = model_frame[available].copy()
        for col in ["admission_age", "charlson_comorbidity_index"]:
            if col in x.columns:
                x[col] = pd.to_numeric(x[col], errors="coerce")
        if "male" in x.columns:
            x["male"] = pd.to_numeric(x["male"], errors="coerce")
        x = pd.get_dummies(x, columns=[col for col in x.columns if x[col].dtype == object], drop_first=True, dtype=float)
        data = pd.concat([model_frame[[outcome]], x], axis=1).replace([np.inf, -np.inf], np.nan).dropna()
        if data.empty:
            results[outcome] = {"status": "not_fit", "reason": "No complete-case rows after covariate processing", "n": 0, "events": 0}
            continue
        y = data[outcome].astype(float)
        x = sm.add_constant(data.drop(columns=[outcome]), has_constant="add")
        if events // max(x.shape[1] - 1, 1) < 5:
            results[outcome] = {"status": "not_fit", "reason": "Low events per predictor", "n": int(len(data)), "events": int(y.sum()), "predictors": int(x.shape[1] - 1)}
            continue
        try:
            fit = sm.Logit(y, x).fit(disp=False, maxiter=200)
            rows = []
            conf = fit.conf_int()
            for term, beta in fit.params.items():
                if term == "const":
                    continue
                lo, hi = conf.loc[term]
                rows.append({
                    "term": term,
                    "odds_ratio": float(math.exp(beta)),
                    "ci_low": float(math.exp(lo)),
                    "ci_high": float(math.exp(hi)),
                    "p_value": float(fit.pvalues[term]),
                })
            results[outcome] = {"status": "fit", "n": int(len(data)), "events": int(y.sum()), "predictors": int(x.shape[1] - 1), "terms": rows[:40]}
        except Exception as exc:
            results[outcome] = {"status": "not_fit", "reason": str(exc), "n": int(len(data)), "events": int(y.sum())}
    return results


def write_model_estimates(models: dict[str, Any]) -> None:
    rows: list[dict[str, Any]] = []
    for outcome, model in models.items():
        if model.get("status") != "fit":
            rows.append({
                "outcome": outcome,
                "status": model.get("status"),
                "term": "",
                "odds_ratio": "",
                "ci_low": "",
                "ci_high": "",
                "p_value": "",
                "n": model.get("n"),
                "events": model.get("events"),
                "note": model.get("reason", ""),
            })
            continue
        for term in model.get("terms", []):
            rows.append({
                "outcome": outcome,
                "status": "fit",
                "term": term["term"],
                "odds_ratio": term["odds_ratio"],
                "ci_low": term["ci_low"],
                "ci_high": term["ci_high"],
                "p_value": term["p_value"],
                "n": model.get("n"),
                "events": model.get("events"),
                "note": "",
            })
    estimates = pd.DataFrame(rows)
    estimates.to_csv(RUN_DIR / "model-estimates.csv", index=False)
    estimates.to_csv(RUN_DIR / "estimates.csv", index=False)


def build_analysis() -> dict[str, Any]:
    RUN_DIR.mkdir(parents=True, exist_ok=True)
    tables, inventory = load_tables()
    patients = tables["hosp-patients"].copy()
    admissions = tables["hosp-admissions"].copy()
    procedures, matched_procedures = classify_icd_procedures(tables["hosp-procedures-icd"], tables["hosp-d-icd-procedures"])
    hcpcs, matched_hcpcs = classify_hcpcs(tables["hosp-hcpcsevents"], tables["hosp-d-hcpcs"])
    diagnoses, matched_diagnoses = classify_diagnoses(tables["hosp-diagnoses-icd"], tables["hosp-d-icd-diagnoses"])
    charlson = tables["derived-charlson"].copy()

    admissions["admittime"] = pd.to_datetime(admissions["admittime"], errors="coerce")
    admissions["dischtime"] = pd.to_datetime(admissions["dischtime"], errors="coerce")
    admissions = admissions.merge(patients, on="subject_id", how="left")
    admissions["approx_actual_admit_year"] = admissions.apply(admission_actual_year, axis=1)
    admissions["admission_age"] = pd.to_numeric(admissions["anchor_age"], errors="coerce") + (admissions["admittime"].dt.year - pd.to_numeric(admissions["anchor_year"], errors="coerce"))
    admissions["male"] = (admissions["gender"].astype(str).str.upper() == "M").astype(int)

    proc_adm = procedures.groupby(["subject_id", "hadm_id"], dropna=False).agg(
        proc_savr=("proc_savr", "max"),
        proc_tavr=("proc_tavr", "max"),
        proc_aortic_revision=("proc_aortic_revision", "max"),
        first_proc_date=("chartdate", "min"),
    ).reset_index()
    hcpcs_adm = hcpcs.groupby(["subject_id", "hadm_id"], dropna=False).agg(
        hcpcs_savr=("hcpcs_savr", "max"),
        hcpcs_tavr=("hcpcs_tavr", "max"),
        hcpcs_hemodialysis=("hcpcs_hemodialysis", "max"),
        hcpcs_peritoneal_dialysis=("hcpcs_peritoneal_dialysis", "max"),
    ).reset_index()
    dx_adm = diagnoses.groupby(["subject_id", "hadm_id"], dropna=False).agg(
        dx_manual_dialysis=("dx_manual_dialysis", "max"),
        dx_hemodialysis=("dx_hemodialysis", "max"),
        dx_peritoneal_dialysis=("dx_peritoneal_dialysis", "max"),
        dx_unspecified_dialysis=("dx_unspecified_dialysis", "max"),
        dx_esrd=("dx_esrd", "max"),
        dx_heart_failure=("dx_heart_failure", "max"),
        dx_mi=("dx_mi", "max"),
        dx_stroke=("dx_stroke", "max"),
        dx_cardiac_related=("dx_cardiac_related", "max"),
    ).reset_index()

    adm = admissions.merge(proc_adm, on=["subject_id", "hadm_id"], how="left").merge(hcpcs_adm, on=["subject_id", "hadm_id"], how="left").merge(dx_adm, on=["subject_id", "hadm_id"], how="left").merge(charlson, on=["subject_id", "hadm_id"], how="left")
    flag_cols = [col for col in adm.columns if col.startswith(("proc_", "hcpcs_", "dx_"))]
    for col in flag_cols:
        adm[col] = pd.to_numeric(adm[col], errors="coerce").fillna(0).astype(int)
    adm["any_savr"] = ((adm["proc_savr"] == 1) | (adm["hcpcs_savr"] == 1)).astype(int)
    adm["any_tavr"] = ((adm["proc_tavr"] == 1) | (adm["hcpcs_tavr"] == 1)).astype(int)
    adm["valve_index_candidate"] = ((adm["any_savr"] == 1) | (adm["any_tavr"] == 1)).astype(int)
    candidates = adm.loc[adm["valve_index_candidate"].eq(1)].copy()
    candidates["first_proc_date"] = pd.to_datetime(candidates["first_proc_date"], errors="coerce")
    candidates = candidates.sort_values(["subject_id", "admittime", "first_proc_date", "hadm_id"])
    index = candidates.drop_duplicates("subject_id", keep="first").copy()
    index["valve_strategy"] = np.select(
        [index["any_tavr"].eq(1) & index["any_savr"].eq(0), index["any_savr"].eq(1) & index["any_tavr"].eq(0), index["any_tavr"].eq(1) & index["any_savr"].eq(1)],
        ["TAVR", "SAVR", "mixed_savr_tavr_same_admission"],
        default="unknown",
    )

    # Baseline dialysis evidence from admissions/procedures/HCPCS up to and including index admission.
    all_adm = adm[["subject_id", "hadm_id", "admittime", "dischtime", "dx_manual_dialysis", "dx_hemodialysis", "dx_peritoneal_dialysis", "dx_unspecified_dialysis", "dx_esrd", "hcpcs_hemodialysis", "hcpcs_peritoneal_dialysis"]].copy()
    proc_dial = procedures.copy()
    proc_dial["proc_hemodialysis"] = ((proc_dial["icd_version"].astype(int).eq(9) & proc_dial["norm_code"].eq("3995")) | proc_dial["title_lower"].fillna("").str.contains("hemodialysis", na=False)).astype(int)
    proc_dial["proc_peritoneal_dialysis"] = ((proc_dial["icd_version"].astype(int).eq(9) & proc_dial["norm_code"].isin(PERITONEAL_DIALYSIS_ICD9_PROC_CODES)) | proc_dial["title_lower"].fillna("").str.contains("peritoneal dialysis", na=False)).astype(int)
    proc_dial_adm = proc_dial.groupby(["subject_id", "hadm_id"], dropna=False).agg(proc_hemodialysis=("proc_hemodialysis", "max"), proc_peritoneal_dialysis=("proc_peritoneal_dialysis", "max")).reset_index()
    all_adm = all_adm.merge(proc_dial_adm, on=["subject_id", "hadm_id"], how="left").fillna({"proc_hemodialysis": 0, "proc_peritoneal_dialysis": 0})
    dialysis_rows = []
    for _, row in index.iterrows():
        prior = all_adm.loc[(all_adm["subject_id"].eq(row["subject_id"])) & (all_adm["admittime"].le(row["admittime"]))]
        pd_flag = int(prior[["dx_peritoneal_dialysis", "hcpcs_peritoneal_dialysis", "proc_peritoneal_dialysis"]].max().max()) if not prior.empty else 0
        hd_flag = int(prior[["dx_manual_dialysis", "dx_hemodialysis", "dx_unspecified_dialysis", "dx_esrd", "hcpcs_hemodialysis", "proc_hemodialysis"]].max().max()) if not prior.empty else 0
        if pd_flag:
            group = "peritoneal_dialysis"
        elif hd_flag:
            group = "hemodialysis_or_unspecified_dialysis"
        else:
            group = "non_dialysis"
        dialysis_rows.append({"subject_id": row["subject_id"], "index_hadm_id": row["hadm_id"], "dialysis_group": group, "baseline_pd_evidence": pd_flag, "baseline_hd_or_unspecified_evidence": hd_flag})
    index = index.merge(pd.DataFrame(dialysis_rows), left_on=["subject_id", "hadm_id"], right_on=["subject_id", "index_hadm_id"], how="left")

    # Longitudinal same-hospital outcomes after index admission.
    outcome_rows = []
    adm_lookup = adm.copy()
    for _, row in index.iterrows():
        subject_adm = adm_lookup.loc[adm_lookup["subject_id"].eq(row["subject_id"])].copy()
        after = subject_adm.loc[subject_adm["admittime"].gt(row["dischtime"]) & subject_adm["admittime"].le(row["dischtime"] + timedelta(days=365))].copy()
        dod = pd.to_datetime(row.get("dod"), errors="coerce")
        death_30 = int(pd.notna(dod) and pd.notna(row["dischtime"]) and dod <= row["dischtime"] + timedelta(days=30))
        death_365 = int(pd.notna(dod) and pd.notna(row["dischtime"]) and dod <= row["dischtime"] + timedelta(days=365))
        mi_365 = int(max(int(row["dx_mi"]), int(after["dx_mi"].max()) if not after.empty else 0))
        stroke_365 = int(max(int(row["dx_stroke"]), int(after["dx_stroke"].max()) if not after.empty else 0))
        hf_readmit = int(after["dx_heart_failure"].max()) if not after.empty else 0
        cardiac_readmit = int(after["dx_cardiac_related"].max()) if not after.empty else 0
        reintervention = int(after[["any_savr", "any_tavr", "proc_aortic_revision"]].max().max()) if not after.empty else 0
        outcome_rows.append({
            "subject_id": row["subject_id"],
            "hadm_id": row["hadm_id"],
            "followup_admissions_365d": int(len(after)),
            "in_hospital_mortality": int(row["hospital_expire_flag"]),
            "death_30d": death_30,
            "death_365d": death_365,
            "hf_readmission_365d": hf_readmit,
            "cardiac_readmission_365d": cardiac_readmit,
            "mi_365d": mi_365,
            "stroke_365d": stroke_365,
            "mace_365d": int(bool(death_365 or mi_365 or stroke_365)),
            "valve_reintervention_365d": reintervention,
        })
    index = index.merge(pd.DataFrame(outcome_rows), on=["subject_id", "hadm_id"], how="left")

    # Write aggregate tables.
    group_cols = ["valve_strategy", "dialysis_group"]
    outcome_cols = ["in_hospital_mortality", "death_30d", "death_365d", "hf_readmission_365d", "cardiac_readmission_365d", "mi_365d", "stroke_365d", "mace_365d", "valve_reintervention_365d"]
    outcome_by_group = summarize_binary(index, group_cols, outcome_cols)
    baseline_numeric = numeric_table(index, group_cols, ["admission_age", "charlson_comorbidity_index", "followup_admissions_365d"])
    era_table = summarize_binary(index, ["anchor_year_group", "valve_strategy"], ["in_hospital_mortality", "death_365d", "mace_365d"])
    models = fit_adjusted_models(index, ["in_hospital_mortality", "death_30d", "death_365d", "hf_readmission_365d", "cardiac_readmission_365d", "mace_365d", "valve_reintervention_365d"])

    matched_procedures.to_csv(RUN_DIR / "matched-procedure-codes.csv", index=False)
    matched_diagnoses.to_csv(RUN_DIR / "matched-diagnosis-codes.csv", index=False)
    matched_hcpcs.to_csv(RUN_DIR / "matched-hcpcs-codes.csv", index=False)
    outcome_by_group.to_csv(RUN_DIR / "outcomes-by-group.csv", index=False)
    baseline_numeric.to_csv(RUN_DIR / "baseline-by-group.csv", index=False)
    era_table.to_csv(RUN_DIR / "era-summary.csv", index=False)
    index[["subject_id", "hadm_id", "valve_strategy", "dialysis_group", "anchor_year_group", "approx_actual_admit_year"] + outcome_cols].to_csv(RUN_DIR / "index-cohort-audit.csv", index=False)

    hcpcs_requested_present = sorted(set(hcpcs["hcpcs_norm"]) & (TAVR_CPT_CODES | SAVR_CPT_CODES))
    hcpcs_tavr_present = sorted(set(hcpcs["hcpcs_norm"]) & TAVR_CPT_CODES)
    hcpcs_savr_present = sorted(set(hcpcs["hcpcs_norm"]) & SAVR_CPT_CODES)
    estimate_records = []
    for outcome, model in models.items():
        if model.get("status") != "fit":
            continue
        for term in model.get("terms", []):
            estimate_records.append({
                "outcome": outcome,
                "term": term["term"],
                "oddsRatio": term["odds_ratio"],
                "ciLow": term["ci_low"],
                "ciHigh": term["ci_high"],
                "pValue": term["p_value"],
                "n": model.get("n"),
                "events": model.get("events"),
            })

    study = {
        "schemaVersion": 1,
        "generatedAtIso": now_iso(),
        "question": "In hemodialysis, peritoneal dialysis, and non-dialysis patients undergoing SAVR and TAVR across ICD9, ICD10, and CPT/HCPCS-coded hospital data, how do clinical outcomes differ across mortality, heart-failure or cardiac-related admission, MACE, and valve reintervention?",
        "dataset": "MIMIC-IV v3.1 project-owned GCS Parquet cache",
        "dataBoundary": {
            "supports": [
                "same-hospital longitudinal admissions within deidentified patient timelines",
                "ICD-9-CM and ICD-10-PCS procedure identification",
                "HCPCS/CPT-like event table scanning when codes are present",
                "in-hospital mortality and death-date-based 30/365 day mortality within MIMIC death-date availability",
            ],
            "doesNotSupport": [
                "national claims capture",
                "complete outside-hospital readmission/reintervention ascertainment",
                "exact public calendar-year trend analysis; anchor year groups are approximate",
                "complete CPT capture; local HCPCS descriptions are sparse and requested SAVR CPT codes were not observed",
            ],
        },
        "limitations": [
            "single-center deidentified EHR dataset rather than national claims or registry data",
            "same-hospital follow-up may miss outside-hospital readmissions and reinterventions",
            "anchor-year groups approximate calendar periods rather than exact public dates",
            "dialysis modality assignment relies on coded evidence and may misclassify outpatient modality",
            "requested SAVR CPT codes were not observed in local HCPCS event rows",
            "observational associations cannot establish causality",
        ],
        "cohortSummary": {
            "indexRows": int(len(index)),
            "uniquePatients": int(index["subject_id"].nunique()),
            "rowCounts": {
                "indexAdmissions": int(len(index)),
                "uniquePatients": int(index["subject_id"].nunique()),
                "matchedProcedureDefinitions": int(len(matched_procedures)),
                "matchedDiagnosisDefinitions": int(len(matched_diagnoses)),
                "matchedHcpcsDefinitions": int(len(matched_hcpcs)),
            },
            "valveStrategyCounts": index["valve_strategy"].value_counts(dropna=False).to_dict(),
            "dialysisGroupCounts": index["dialysis_group"].value_counts(dropna=False).to_dict(),
            "anchorYearGroupCounts": index["anchor_year_group"].value_counts(dropna=False).to_dict(),
            "hcpcsRequestedValveCodesPresent": hcpcs_requested_present,
            "hcpcsTavrCodesPresent": hcpcs_tavr_present,
            "hcpcsSavrCodesPresent": hcpcs_savr_present,
            "manualCodeSets": {
                "tavrIcd9Procedure": sorted(TAVR_ICD9_PROC_CODES),
                "savrIcd9Procedure": sorted(SAVR_ICD9_PROC_CODES),
                "dialysisIcd10Diagnosis": sorted(DIALYSIS_ICD10_DX_CODES),
                "dialysisIcd9Diagnosis": sorted(DIALYSIS_ICD9_DX_CODES),
                "peritonealDialysisIcd9Procedure": sorted(PERITONEAL_DIALYSIS_ICD9_PROC_CODES),
                "peritonealDialysisCptHcpcs": sorted(PERITONEAL_DIALYSIS_CPT_HCPCS_CODES),
            },
        },
        "outcomes": outcome_cols,
        "models": models,
        "estimates": estimate_records,
        "cost": {"plannedUsd": inventory["plannedUsd"], "actualUsd": inventory["actualUsd"], "ceilingUsd": COST_CEILING_USD, "actualBytes": inventory["actualBytes"]},
        "artifacts": {
            "matchedProcedureCodes": "matched-procedure-codes.csv",
            "matchedDiagnosisCodes": "matched-diagnosis-codes.csv",
            "matchedHcpcsCodes": "matched-hcpcs-codes.csv",
            "outcomesByGroup": "outcomes-by-group.csv",
            "baselineByGroup": "baseline-by-group.csv",
            "eraSummary": "era-summary.csv",
            "indexCohortAudit": "index-cohort-audit.csv",
        },
    }
    save_json(RUN_DIR / "analysis-results.json", study)
    save_json(RUN_DIR / "source-inventory.json", inventory)
    save_json(RUN_DIR / "cost-receipt.json", {"schemaVersion": 1, "generatedAtIso": now_iso(), "estimatedUsd": inventory["actualUsd"], "ceilingUsd": COST_CEILING_USD, "actualBytes": inventory["actualBytes"]})
    write_model_estimates(models)
    return study


def pct(n: Any, d: Any) -> str:
    try:
        n2 = int(n)
        d2 = int(d)
        return f"{n2}/{d2} ({100*n2/d2:.1f}%)" if d2 else "0/0"
    except Exception:
        return "NA"


def render_paper(study: dict[str, Any]) -> None:
    outcomes = pd.read_csv(RUN_DIR / "outcomes-by-group.csv")
    baseline = pd.read_csv(RUN_DIR / "baseline-by-group.csv")
    lines: list[str] = []
    lines.append("# Dialysis Status and Outcomes After SAVR or TAVR in MIMIC-IV\n")
    lines.append("## Abstract\n")
    lines.append("**Background:** Dialysis patients undergoing aortic valve replacement are clinically high risk, but local EHR data need careful handling because procedure coding, follow-up capture, and dialysis modality evidence are imperfect.")
    lines.append("**Objective:** To compare mortality, heart-failure/cardiac readmission, MACE, and valve reintervention after SAVR or TAVR among patients with hemodialysis or unspecified dialysis evidence, peritoneal dialysis evidence, and no dialysis evidence.")
    lines.append(f"**Design:** Same-hospital longitudinal cohort analysis of MIMIC-IV v3.1 hospital admissions. The cohort included {study['cohortSummary']['indexRows']:,} first observed SAVR/TAVR admissions from {study['cohortSummary']['uniquePatients']:,} patients.")
    lines.append("**Methods:** SAVR/TAVR were identified from manually declared ICD-9-CM procedure codes plus ICD-10-PCS procedure-title logic, with HCPCS/CPT event scanning documented separately. Dialysis groups were assigned from the manually declared ICD-9/ICD-10 dialysis diagnosis codes, peritoneal dialysis procedure codes, peritoneal dialysis CPT/HCPCS codes, procedures, and HCPCS descriptions available up to the index admission. Outcomes were measured during the index admission and subsequent same-hospital admissions within 365 days.")
    tavr_cpt = ", ".join(study["cohortSummary"].get("hcpcsTavrCodesPresent", [])) or "none"
    savr_cpt = ", ".join(study["cohortSummary"].get("hcpcsSavrCodesPresent", [])) or "none"
    lines.append(f"**Results:** Outcome rates and adjusted models are reported as local EHR associations. Local HCPCS/CPT scanning found TAVR-related code(s): {tavr_cpt}; SAVR CPT code(s): {savr_cpt}. Most valve strategy classification was driven by ICD procedure coding.")
    lines.append("**Conclusion:** This packet is suitable for methods review of a MIMIC-feasible version of the question. It is not a claims-registry study and should not be interpreted as complete 2008-2022 national longitudinal follow-up.\n")
    lines.append("## Introduction\n")
    lines.append("This study evaluates outcomes after surgical or transcatheter aortic valve replacement by dialysis status. The motivating clinical question asks about hemodialysis, peritoneal dialysis, and non-dialysis patients across SAVR and TAVR, including mortality, cardiac readmission, MACE, and valve reintervention.")
    lines.append("MIMIC-IV can answer a narrower same-institution version of this question. It contains deidentified hospital admissions, diagnosis/procedure codes, HCPCS events, patient death dates, and anchor-year groups. It does not provide complete national claims follow-up or exact public calendar years.\n")
    lines.append("## Methods\n")
    lines.append("### Data Source\n")
    lines.append("We used the local project-owned Parquet cache of MIMIC-IV v3.1. MIMIC-IV anchor-year groups allow approximate temporal grouping from 2008-2022, but individual dates are deidentified and shifted. The analysis used aggregate outputs only; temporary row-level cache files were removed after execution.")
    lines.append("### Cohort Construction\n")
    manual = study["cohortSummary"]["manualCodeSets"]
    lines.append(f"Sample construction started from hospital admissions with valve-replacement evidence and retained one first observed index admission per patient. The final study population contained {study['cohortSummary']['indexRows']:,} rows from {study['cohortSummary']['uniquePatients']:,} patients. SAVR used ICD-9-CM procedure codes {', '.join(manual['savrIcd9Procedure'])} and ICD-10-PCS open replacement of the aortic valve. TAVR used ICD-9-CM procedure codes {', '.join(manual['tavrIcd9Procedure'])} and ICD-10-PCS percutaneous, transapical, or percutaneous endoscopic replacement of the aortic valve. HCPCS/CPT event data were scanned for common SAVR/TAVR codes; observed TAVR-related code(s) were {tavr_cpt}, and observed SAVR CPT code(s) were {savr_cpt}.")
    lines.append("### Dialysis Status\n")
    lines.append(f"Dialysis evidence was searched in diagnosis, procedure, and HCPCS event records up to the index admission. The manually declared dialysis ICD-10 diagnosis codes were {', '.join(manual['dialysisIcd10Diagnosis'])}; the manually declared dialysis ICD-9 diagnosis codes were {', '.join(manual['dialysisIcd9Diagnosis'])}; peritoneal dialysis procedure/CPT/HCPCS codes were {', '.join(manual['peritonealDialysisIcd9Procedure'] + manual['peritonealDialysisCptHcpcs'])}. Peritoneal dialysis was assigned when peritoneal dialysis-specific evidence was present. Hemodialysis/unspecified dialysis was assigned when hemodialysis, ESRD, dependence/status, dialysis encounter, or renal dialysis status evidence was present without peritoneal dialysis evidence. This is not a clean outpatient modality registry.")
    lines.append("### Outcomes\n")
    lines.append("Outcomes were in-hospital mortality, death within 30 and 365 days, heart-failure readmission within 365 days, broad cardiac-related readmission within 365 days, MI, stroke, MACE, and valve reintervention within 365 days. MACE was defined as death, MI, or stroke within the available same-patient timeline. Readmissions and reinterventions are same-hospital only.")
    lines.append("### Statistical Analysis\n")
    lines.append("We summarized outcomes by valve strategy and dialysis group. Adjusted logistic models were attempted for each outcome using dialysis group, valve strategy, age, sex, Charlson comorbidity index, anchor-year group, and insurance when event counts permitted. Models were not fit when events per predictor were too sparse.\n")
    lines.append("### Missingness, Survey Design, And Inference Boundary\n")
    lines.append("Adjusted models used complete-case rows for the covariates included in each model; no imputation was applied in this run. This was an observational EHR analysis, so the adjusted associations cannot establish causality. This was not a complex survey analysis: MIMIC-IV does not provide survey weight, strata, or PSU variables, and no survey-weighted inference was attempted.\n")
    lines.append("## Results\n")
    lines.append("### Cohort\n")
    lines.append(f"The cohort included {study['cohortSummary']['indexRows']:,} first observed SAVR/TAVR admissions. Valve strategy counts were: {study['cohortSummary']['valveStrategyCounts']}. Dialysis group counts were: {study['cohortSummary']['dialysisGroupCounts']}.")
    lines.append("### Outcomes By Valve Strategy And Dialysis Group\n")
    for _, row in outcomes.iterrows():
        label = f"{row['valve_strategy']} / {row['dialysis_group']}"
        lines.append(f"- {label}: n={int(row['n']):,}; in-hospital death {pct(row['in_hospital_mortality_n'], row['n'])}; 365-day death {pct(row['death_365d_n'], row['n'])}; HF readmission {pct(row['hf_readmission_365d_n'], row['n'])}; cardiac readmission {pct(row['cardiac_readmission_365d_n'], row['n'])}; MACE {pct(row['mace_365d_n'], row['n'])}; valve reintervention {pct(row['valve_reintervention_365d_n'], row['n'])}.")
    lines.append("### Baseline Characteristics\n")
    for _, row in baseline.iterrows():
        lines.append(f"- {row['valve_strategy']} / {row['dialysis_group']}: age median {row.get('admission_age_median', float('nan')):.1f}, Charlson median {row.get('charlson_comorbidity_index_median', float('nan')):.1f}, 365-day follow-up admissions median {row.get('followup_admissions_365d_median', float('nan')):.1f}.")
    lines.append("### Adjusted Models\n")
    for outcome, model in study["models"].items():
        if model["status"] != "fit":
            lines.append(f"- {outcome}: model not fit ({model.get('reason')}; n={model.get('n')}, events={model.get('events')}).")
            continue
        lines.append(f"- {outcome}: adjusted model fit with n={model['n']:,}, events={model['events']:,}, predictors={model['predictors']}. Selected terms:")
        for term in model["terms"][:8]:
            lines.append(f"  - {term['term']}: OR {term['odds_ratio']:.2f} (95% CI {term['ci_low']:.2f}-{term['ci_high']:.2f}); p={term['p_value']:.3g}.")
    lines.append("## Discussion\n")
    lines.append("This local MIMIC-IV analysis gives an auditable first pass on dialysis status and outcomes after aortic valve replacement. It suggests how outcome rates differ across SAVR/TAVR and dialysis groups in the available EHR data, but it also shows why the full requested question is more naturally a claims-registry study.")
    lines.append("The strongest use of this packet is feasibility and methods development: code lists are visible, CPT/HCPCS absence is explicit, follow-up is bounded to the same institution, and sparse model conditions are not hidden.")
    lines.append("## Limitations\n")
    lines.append("- MIMIC-IV is a single-center deidentified EHR dataset, not a national claims registry.")
    lines.append("- Admission years are approximate through anchor-year groups; exact 2008-2022 public calendar-year trends are not available.")
    lines.append("- Same-hospital readmission and reintervention capture may miss outside-hospital events.")
    lines.append("- HCPCS/CPT event data were sparse for valve replacement coding; TAVR-related CPT evidence was present, but requested SAVR CPT codes were not observed, so most cohort definition depends on ICD procedure codes.")
    lines.append("- Hemodialysis/unspecified dialysis combines ESRD, dependence/status, and hemodialysis evidence; outpatient modality assignment is imperfect.")
    lines.append("- MACE uses diagnosis-code evidence and death-date availability; it is not adjudicated.")
    lines.append("- This observational design cannot establish causality, treatment superiority, or external effectiveness.")
    lines.append("## Reproducibility\n")
    lines.append(f"The run directory contains aggregate CSV and JSON artifacts for code matching, cohort audit, outcomes, model estimates, QA, cost, and source inventory. Estimated GCS read cost was ${study['cost']['actualUsd']:.4f}, below the ${COST_CEILING_USD:.2f} ceiling. Temporary row-level cache removed: true.")
    lines.append("## References\n")
    lines.append("- MIMIC-IV v3.1 dataset page: https://physionet.org/content/mimiciv/3.1/")
    lines.append("- MIMIC-IV documentation: https://mimic.mit.edu/docs/iv/")
    lines.append("- MIMIC-IV hospital module documentation: https://mimic.mit.edu/docs/iv/modules/hosp/")
    (RUN_DIR / "paper.md").write_text("\n\n".join(lines) + "\n")


def qa(study: dict[str, Any]) -> dict[str, Any]:
    issues: list[dict[str, Any]] = []
    if study["cohortSummary"]["indexRows"] < 30:
        issues.append({"severity": "blocker", "code": "TINY_VALVE_COHORT", "message": "Too few index SAVR/TAVR admissions for useful analysis."})
    if not study["cohortSummary"].get("hcpcsTavrCodesPresent"):
        issues.append({"severity": "warning", "code": "TAVR_CPT_CODES_ABSENT", "message": "Requested TAVR CPT codes were not observed in local HCPCS event data."})
    if not study["cohortSummary"].get("hcpcsSavrCodesPresent"):
        issues.append({"severity": "warning", "code": "SAVR_CPT_CODES_ABSENT", "message": "Requested SAVR CPT codes were not observed in local HCPCS event data."})
    if "mixed_savr_tavr_same_admission" in study["cohortSummary"]["valveStrategyCounts"]:
        issues.append({"severity": "warning", "code": "MIXED_VALVE_STRATEGY", "message": "Some index admissions contain both SAVR and TAVR-coded evidence."})
    if not any(model.get("status") == "fit" for model in study["models"].values()):
        issues.append({"severity": "warning", "code": "NO_ADJUSTED_MODELS_FIT", "message": "No adjusted logistic models fit under event-count safeguards."})
    return {
        "schemaVersion": 1,
        "generatedAtIso": now_iso(),
        "status": "block" if any(item["severity"] == "blocker" for item in issues) else "pass",
        "issues": issues,
        "readerFacingRequiredCaveats": [
            "single-center same-hospital follow-up",
            "approximate calendar-year groups",
            "ICD-driven valve cohort because CPT codes were absent",
            "dialysis modality misclassification risk",
        ],
    }


def write_manifest(study: dict[str, Any], qa_result: dict[str, Any]) -> None:
    artifacts = []
    for path in sorted(RUN_DIR.iterdir()):
        if path.is_file():
            artifacts.append({
                "path": path.name,
                "bytes": path.stat().st_size,
                "sha256": hashlib.sha256(path.read_bytes()).hexdigest(),
            })
    save_json(RUN_DIR / "artifact-index.json", {
        "schemaVersion": 1,
        "generatedAtIso": now_iso(),
        "studyHash": stable_hash(study),
        "qaStatus": qa_result["status"],
        "artifactCount": len(artifacts),
        "artifacts": artifacts,
    })


def main() -> None:
    if RUN_DIR.exists():
        shutil.rmtree(RUN_DIR)
    RUN_DIR.mkdir(parents=True)
    study = build_analysis()
    render_paper(study)
    qa_result = qa(study)
    save_json(RUN_DIR / "paper-qa.json", qa_result)
    save_json(RUN_DIR / "qa.json", qa_result)
    write_manifest(study, qa_result)
    print(json.dumps({
        "runDir": str(RUN_DIR),
        "paper": str(RUN_DIR / "paper.md"),
        "cohortRows": study["cohortSummary"]["indexRows"],
        "valveStrategies": study["cohortSummary"]["valveStrategyCounts"],
        "dialysisGroups": study["cohortSummary"]["dialysisGroupCounts"],
        "qaStatus": qa_result["status"],
        "issues": [item["code"] for item in qa_result["issues"]],
        "estimatedCostUsd": study["cost"]["actualUsd"],
    }, indent=2))


if __name__ == "__main__":
    main()
