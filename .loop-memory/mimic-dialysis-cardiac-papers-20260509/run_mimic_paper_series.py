#!/usr/bin/env python3
"""Run bounded MIMIC-IV dialysis and cardiac-surgery manuscript packets.

This runner is intentionally local-review oriented. It reads only declared
Parquet tables from the project-owned GCS cache, deletes row-level caches after
each run, and writes aggregate manuscripts plus QA/provenance artifacts.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import re
import shutil
import subprocess
import time
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import numpy as np
import pandas as pd
import pyarrow.parquet as pq
import statsmodels.api as sm
from sklearn.metrics import average_precision_score, brier_score_loss, roc_auc_score


ROOT = Path("/Users/saleh/TechProjects/agenteer")
DATASET_DIR = ROOT / ".loop-memory/datasets/mimiciv-3-1"
MANIFEST_PATH = DATASET_DIR / "dataset-manifest.json"
OUT_ROOT = ROOT / ".loop-memory/mimic-dialysis-cardiac-papers-20260509"
LEDGER_PATH = OUT_ROOT / "cost-ledger.json"

USD_PER_GB = 0.12
SESSION_CEILING_USD = 10.0
PER_RUN_MAX_BYTES = 420 * 1024 * 1024

COMMON_TABLES = [
    "hosp-diagnoses-icd",
    "hosp-d-icd-diagnoses",
    "hosp-procedures-icd",
    "hosp-d-icd-procedures",
    "derived-icustay-detail",
    "derived-apsiii",
    "derived-oasis",
    "derived-first-day-sofa",
    "derived-first-day-lab",
    "derived-first-day-vitalsign",
    "derived-first-day-rrt",
    "derived-crrt",
    "derived-charlson",
    "derived-cardiac-marker",
]

DIAGNOSIS_FAMILIES = {
    "aki": [
        {"system": "icd10cm", "query": "N17", "expected": ["acute kidney failure"]},
        {"system": "icd9cm_dx", "query": "584", "expected": ["acute kidney failure"]},
    ],
    "esrd": [
        {"system": "icd10cm", "query": "N186", "expected": ["end stage renal disease"]},
        {"system": "icd10cm", "query": "Z992", "expected": ["dependence on renal dialysis"]},
        {"system": "icd9cm_dx", "query": "5856", "expected": ["end stage renal disease"]},
        {"system": "icd9cm_dx", "query": "V451", "expected": ["renal dialysis status"]},
    ],
    "sepsis": [
        {"system": "icd10cm", "query": "A41", "expected": ["sepsis"]},
        {"system": "icd9cm_dx", "query": "99591", "expected": ["sepsis"]},
        {"system": "icd9cm_dx", "query": "99592", "expected": ["severe sepsis"]},
        {"system": "icd9cm_dx", "query": "038", "expected": ["septicemia"]},
    ],
    "heart_failure": [
        {"system": "icd10cm", "query": "I50", "expected": ["heart failure"]},
        {"system": "icd9cm_dx", "query": "428", "expected": ["heart failure"]},
    ],
    "ckd": [
        {"system": "icd10cm", "query": "N18", "expected": ["chronic kidney disease"]},
        {"system": "icd9cm_dx", "query": "585", "expected": ["chronic kidney disease"]},
    ],
}

PROCEDURE_FAMILIES = {
    "cabg": [
        {"system": "icd9cm_sg", "query": "361", "expected": ["coronary bypass"]},
        {"system": "icd10pcs", "query": "0210", "expected": ["bypass coronary artery", "open approach"]},
    ],
    "valve_open": [
        {"system": "icd9cm_sg", "query": "351", "expected": ["valvuloplasty"]},
        {"system": "icd9cm_sg", "query": "352", "expected": ["replacement", "valve"]},
        {"system": "icd10pcs", "query": "02RF0", "expected": ["replacement of aortic valve", "open approach"]},
        {"system": "icd10pcs", "query": "02RG0", "expected": ["replacement of mitral valve", "open approach"]},
        {"system": "icd10pcs", "query": "02RH0", "expected": ["replacement of pulmonary valve", "open approach"]},
        {"system": "icd10pcs", "query": "02RJ0", "expected": ["replacement of tricuspid valve", "open approach"]},
        {"system": "icd10pcs", "query": "02QF0", "expected": ["repair aortic valve", "open approach"]},
        {"system": "icd10pcs", "query": "02QG0", "expected": ["repair mitral valve", "open approach"]},
        {"system": "icd10pcs", "query": "02QH0", "expected": ["repair pulmonary valve", "open approach"]},
        {"system": "icd10pcs", "query": "02QJ0", "expected": ["repair tricuspid valve", "open approach"]},
    ],
    "dialysis_procedure": [
        {"system": "icd9cm_sg", "query": "3995", "expected": ["hemodialysis"]},
        {"system": "icd9cm_sg", "query": "5498", "expected": ["peritoneal dialysis"]},
        {"system": "icd10pcs", "query": "5A1D", "expected": ["urinary filtration"]},
    ],
}

STUDIES = [
    {
        "id": "0378-dialysis-aki-first-day-rrt",
        "title": "First-Day Renal Replacement Therapy and ICU Outcomes in Acute Kidney Injury",
        "domain": "nephrology/critical care",
        "question": "Among ICU admissions with acute kidney injury diagnosis codes, how is first-day renal replacement therapy associated with mortality and ICU length of stay?",
        "cohort": {"diagnosis_any": ["aki"]},
        "primary_exposure": "dialysis_present",
        "exposure_label": "First-day renal replacement therapy present",
    },
    {
        "id": "0379-dialysis-aki-crrt",
        "title": "Continuous Renal Replacement Therapy and Outcomes in Acute Kidney Injury",
        "domain": "nephrology/critical care",
        "question": "Among ICU admissions with acute kidney injury diagnosis codes, how are CRRT records associated with mortality and ICU length of stay?",
        "cohort": {"diagnosis_any": ["aki"]},
        "primary_exposure": "any_crrt_record",
        "exposure_label": "Any CRRT record during ICU stay",
    },
    {
        "id": "0380-dialysis-esrd-icu",
        "title": "End-Stage Kidney Disease and ICU Outcomes",
        "domain": "nephrology",
        "question": "Among ICU admissions with end-stage kidney disease or dialysis-status diagnosis codes, what first-day features are associated with mortality and ICU length of stay?",
        "cohort": {"diagnosis_any": ["esrd"]},
        "primary_exposure": "dialysis_present",
        "exposure_label": "First-day renal replacement therapy present",
    },
    {
        "id": "0381-dialysis-sepsis-rrt",
        "title": "Renal Replacement Therapy in Sepsis-Associated ICU Admissions",
        "domain": "nephrology/infectious diseases",
        "question": "Among ICU admissions with sepsis diagnosis codes, how is first-day renal replacement therapy associated with mortality and ICU length of stay?",
        "cohort": {"diagnosis_any": ["sepsis"]},
        "primary_exposure": "dialysis_present",
        "exposure_label": "First-day renal replacement therapy present",
    },
    {
        "id": "0382-dialysis-heart-failure-rrt",
        "title": "Renal Replacement Therapy in Heart Failure ICU Admissions",
        "domain": "cardiorenal critical care",
        "question": "Among ICU admissions with heart failure diagnosis codes, how is first-day renal replacement therapy associated with mortality and ICU length of stay?",
        "cohort": {"diagnosis_any": ["heart_failure"]},
        "primary_exposure": "dialysis_present",
        "exposure_label": "First-day renal replacement therapy present",
    },
    {
        "id": "0383-cardiac-surgery-cabg",
        "title": "ICU Outcomes After Coronary Artery Bypass Grafting",
        "domain": "cardiac surgery",
        "question": "Among ICU admissions after coronary artery bypass graft procedure codes, what first-day features are associated with mortality and ICU length of stay?",
        "cohort": {"procedure_any": ["cabg"]},
        "primary_exposure": "any_aki",
        "exposure_label": "Any acute kidney injury diagnosis code",
    },
    {
        "id": "0384-cardiac-surgery-valve",
        "title": "ICU Outcomes After Open Heart Valve Procedures",
        "domain": "cardiac surgery",
        "question": "Among ICU admissions after open heart valve procedure codes, what first-day features are associated with mortality and ICU length of stay?",
        "cohort": {"procedure_any": ["valve_open"]},
        "primary_exposure": "any_aki",
        "exposure_label": "Any acute kidney injury diagnosis code",
    },
    {
        "id": "0385-cardiac-surgery-cabg-rrt",
        "title": "Renal Replacement Therapy After Coronary Artery Bypass Grafting",
        "domain": "cardiac surgery/nephrology",
        "question": "Among ICU admissions after coronary artery bypass graft procedure codes, how is first-day renal replacement therapy associated with mortality and ICU length of stay?",
        "cohort": {"procedure_any": ["cabg"]},
        "primary_exposure": "dialysis_present",
        "exposure_label": "First-day renal replacement therapy present",
    },
    {
        "id": "0386-cardiac-surgery-valve-rrt",
        "title": "Renal Replacement Therapy After Open Heart Valve Procedures",
        "domain": "cardiac surgery/nephrology",
        "question": "Among ICU admissions after open heart valve procedure codes, how is first-day renal replacement therapy associated with mortality and ICU length of stay?",
        "cohort": {"procedure_any": ["valve_open"]},
        "primary_exposure": "dialysis_present",
        "exposure_label": "First-day renal replacement therapy present",
    },
    {
        "id": "0387-cardiac-surgery-aki",
        "title": "Acute Kidney Injury Diagnosis Codes After Cardiac Surgery",
        "domain": "cardiac surgery/nephrology",
        "question": "Among ICU admissions after CABG or open heart valve procedure codes, how are acute kidney injury diagnosis codes associated with mortality and ICU length of stay?",
        "cohort": {"procedure_any": ["cabg", "valve_open"]},
        "primary_exposure": "any_aki",
        "exposure_label": "Any acute kidney injury diagnosis code",
    },
]


@dataclass
class LoadedData:
    tables: dict[str, pd.DataFrame]
    inventory: dict[str, Any]
    bytes_copied: int


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def stable_hash(value: Any) -> str:
    return hashlib.sha256(json.dumps(value, sort_keys=True, default=str, separators=(",", ":")).encode()).hexdigest()


def normalize_code(value: Any) -> str:
    return re.sub(r"[^A-Z0-9]", "", str(value).upper())


def save_json(path: Path, value: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, indent=2, default=str) + "\n")


def run(cmd: list[str], attempts: int = 1) -> str:
    last_error: subprocess.CalledProcessError | None = None
    for attempt in range(1, attempts + 1):
        try:
            result = subprocess.run(cmd, text=True, capture_output=True, check=True)
            return result.stdout
        except subprocess.CalledProcessError as exc:
            last_error = exc
            if attempt == attempts:
                break
            time.sleep(min(2 * attempt, 8))
    assert last_error is not None
    raise last_error


def manifest_tables() -> dict[str, dict[str, Any]]:
    return {table["tableId"]: table for table in json.loads(MANIFEST_PATH.read_text())["tables"]}


def load_ledger() -> dict[str, Any]:
    if LEDGER_PATH.exists():
        return json.loads(LEDGER_PATH.read_text())
    ledger = {"schemaVersion": 1, "startedAtIso": now_iso(), "ceilingUsd": SESSION_CEILING_USD, "estimatedUsd": 0.0, "events": []}
    save_json(LEDGER_PATH, ledger)
    return ledger


def append_cost_event(event: dict[str, Any]) -> dict[str, Any]:
    ledger = load_ledger()
    ledger["events"].append({**event, "timestamp": now_iso()})
    ledger["estimatedUsd"] = sum(float(item.get("estimatedUsd", 0.0)) for item in ledger["events"] if item.get("event") == "actual_read")
    save_json(LEDGER_PATH, ledger)
    return ledger


def list_objects(source_path: str) -> list[dict[str, Any]]:
    payload = json.loads(run(["gcloud", "storage", "ls", "--json", "--recursive", source_path]))
    objects: list[dict[str, Any]] = []
    for item in payload:
        if item.get("type") != "cloud_object":
            continue
        url = item["url"].split("#", 1)[0]
        if not url.endswith(".parquet"):
            continue
        metadata = item.get("metadata", {})
        objects.append({"url": url, "size": int(metadata.get("size", 0)), "generation": metadata.get("generation")})
    return sorted(objects, key=lambda item: item["url"])


def copy_table(table_id: str, table: dict[str, Any], cache_dir: Path) -> tuple[list[Path], int, list[dict[str, Any]]]:
    objects = list_objects(table["sourcePath"])
    target = cache_dir / table_id
    target.mkdir(parents=True, exist_ok=True)
    paths: list[Path] = []
    for obj in objects:
        local = target / obj["url"].rsplit("/", 1)[-1]
        run(["gcloud", "storage", "cp", obj["url"], str(local)], attempts=3)
        paths.append(local)
    return paths, sum(path.stat().st_size for path in paths), objects


def read_parquet(paths: list[Path]) -> pd.DataFrame:
    return pq.read_table([str(path) for path in paths]).to_pandas()


def load_declared_tables(study_id: str, out_dir: Path, tables: list[str]) -> LoadedData:
    by_id = manifest_tables()
    missing = [table for table in tables if table not in by_id]
    if missing:
        raise RuntimeError(f"Missing required MIMIC tables: {', '.join(missing)}")
    planned_bytes = sum(int(by_id[table]["bytes"]) for table in tables)
    planned_usd = planned_bytes / 1024**3 * USD_PER_GB
    ledger = load_ledger()
    if planned_bytes > PER_RUN_MAX_BYTES:
        raise RuntimeError(f"Planned read {planned_bytes} exceeds per-run cap {PER_RUN_MAX_BYTES}.")
    if float(ledger["estimatedUsd"]) + planned_usd > SESSION_CEILING_USD:
        raise RuntimeError("Cumulative estimated cost would exceed session ceiling.")
    append_cost_event({"event": "planned_read", "studyId": study_id, "plannedBytes": planned_bytes, "estimatedUsd": 0.0})
    cache_dir = out_dir / "_tmp-parquet-cache"
    if cache_dir.exists():
        shutil.rmtree(cache_dir)
    cache_dir.mkdir(parents=True)
    inventory: dict[str, Any] = {}
    data: dict[str, pd.DataFrame] = {}
    copied = 0
    try:
        for table_id in tables:
            paths, bytes_copied, objects = copy_table(table_id, by_id[table_id], cache_dir)
            copied += bytes_copied
            if copied > PER_RUN_MAX_BYTES:
                raise RuntimeError("Actual read exceeded per-run cap.")
            inventory[table_id] = {
                "sourcePath": by_id[table_id]["sourcePath"],
                "manifestBytes": by_id[table_id]["bytes"],
                "manifestRows": by_id[table_id].get("rowCount"),
                "bytesCopied": bytes_copied,
                "objects": objects,
            }
            data[table_id] = read_parquet(paths)
    finally:
        if cache_dir.exists():
            shutil.rmtree(cache_dir)
    return LoadedData(tables=data, inventory=inventory, bytes_copied=copied)


def match_dictionary(dictionary: pd.DataFrame, families: list[dict[str, Any]], version_kind: str) -> pd.DataFrame:
    frame = dictionary.copy()
    frame["norm_code"] = frame["icd_code"].map(normalize_code)
    frame["title_lower"] = frame["long_title"].astype(str).str.lower()
    masks = []
    for family in families:
        system = family["system"]
        if version_kind == "diagnosis":
            version = 10 if system == "icd10cm" else 9
        else:
            version = 10 if system == "icd10pcs" else 9
        query = normalize_code(family["query"])
        mask = frame["icd_version"].astype(int).eq(version) & frame["norm_code"].str.startswith(query)
        for term in family.get("expected", []):
            mask = mask & frame["title_lower"].str.contains(re.escape(str(term).lower()), na=False)
        masks.append(mask)
    if not masks:
        return frame.iloc[0:0].drop(columns=["norm_code", "title_lower"])
    combined = masks[0]
    for mask in masks[1:]:
        combined = combined | mask
    return frame.loc[combined].drop(columns=["norm_code", "title_lower"]).drop_duplicates()


def make_flags(
    events: pd.DataFrame,
    dictionary: pd.DataFrame,
    family_map: dict[str, list[dict[str, Any]]],
    kind: str,
) -> tuple[pd.DataFrame, dict[str, pd.DataFrame]]:
    events = events.copy()
    events["icd_code"] = events["icd_code"].astype(str)
    events["icd_version"] = events["icd_version"].astype(int)
    matched_by_name: dict[str, pd.DataFrame] = {}
    keys = ["subject_id", "hadm_id"]
    flag_frame = events[keys].drop_duplicates().copy()
    for name, families in family_map.items():
        matched = match_dictionary(dictionary, families, kind)
        matched_by_name[name] = matched
        if matched.empty:
            flag_frame[f"any_{name}"] = 0
            continue
        hits = events.merge(matched[["icd_code", "icd_version"]], on=["icd_code", "icd_version"], how="inner")[keys].drop_duplicates()
        hits[f"any_{name}"] = 1
        flag_frame = flag_frame.merge(hits, on=keys, how="left")
        flag_frame[f"any_{name}"] = flag_frame[f"any_{name}"].fillna(0).astype(int)
    return flag_frame, matched_by_name


def first_icu_stay(frame: pd.DataFrame) -> pd.DataFrame:
    out = frame.copy()
    out["icu_intime"] = pd.to_datetime(out.get("icu_intime"), errors="coerce")
    out = out.sort_values(["hadm_id", "icu_intime", "stay_id"])
    return out.drop_duplicates("hadm_id", keep="first")


def collapse_by_keys(frame: pd.DataFrame, keys: list[str]) -> pd.DataFrame:
    if not keys or not frame.duplicated(keys).any():
        return frame.drop_duplicates()
    numeric = [col for col in frame.select_dtypes(include=[np.number]).columns if col not in keys]
    categorical = [col for col in frame.columns if col not in keys and col not in numeric]
    parts = []
    if numeric:
        parts.append(frame.groupby(keys, dropna=False)[numeric].max())
    if categorical:
        parts.append(frame.groupby(keys, dropna=False)[categorical].first())
    return pd.concat(parts, axis=1).reset_index() if parts else frame.drop_duplicates(keys)


def merge_table(base: pd.DataFrame, table_id: str, frame: pd.DataFrame) -> pd.DataFrame:
    if table_id in {"derived-icustay-detail", "hosp-diagnoses-icd", "hosp-d-icd-diagnoses", "hosp-procedures-icd", "hosp-d-icd-procedures"}:
        return base
    keys = [key for key in ["subject_id", "hadm_id", "stay_id"] if key in base.columns and key in frame.columns]
    if not keys:
        return base
    collapsed = collapse_by_keys(frame, keys)
    keep = [col for col in collapsed.columns if col in keys or col not in base.columns]
    return base.merge(collapsed[keep], on=keys, how="left")


def add_crrt_features(cohort: pd.DataFrame, crrt: pd.DataFrame) -> pd.DataFrame:
    if "stay_id" not in crrt.columns:
        cohort["any_crrt_record"] = 0
        return cohort
    crrt = crrt.copy()
    crrt["any_crrt_record"] = 1
    numeric = [col for col in ["system_active", "clots", "clotted", "ultrafiltrate_output", "hourly_patient_fluid_removal"] if col in crrt.columns]
    agg_spec: dict[str, str] = {"any_crrt_record": "max"}
    for col in numeric:
        agg_spec[col] = "max"
    features = crrt.groupby("stay_id", dropna=False).agg(agg_spec).reset_index()
    out = cohort.merge(features, on="stay_id", how="left")
    out["any_crrt_record"] = out["any_crrt_record"].fillna(0).astype(int)
    return out


def build_cohort(study: dict[str, Any], data: LoadedData) -> tuple[pd.DataFrame, dict[str, Any], dict[str, pd.DataFrame], dict[str, pd.DataFrame]]:
    tables = data.tables
    dx_flags, matched_dx = make_flags(tables["hosp-diagnoses-icd"], tables["hosp-d-icd-diagnoses"], DIAGNOSIS_FAMILIES, "diagnosis")
    proc_flags, matched_proc = make_flags(tables["hosp-procedures-icd"], tables["hosp-d-icd-procedures"], PROCEDURE_FAMILIES, "procedure")
    base = first_icu_stay(tables["derived-icustay-detail"])
    cohort = base.merge(dx_flags, on=["subject_id", "hadm_id"], how="left").merge(proc_flags, on=["subject_id", "hadm_id"], how="left")
    for col in [col for col in cohort.columns if col.startswith("any_")]:
        cohort[col] = cohort[col].fillna(0).astype(int)
    for table_id, frame in tables.items():
        cohort = merge_table(cohort, table_id, frame)
    cohort = add_crrt_features(cohort, tables["derived-crrt"])
    for col in ["dialysis_present", "dialysis_active", "any_crrt_record"]:
        if col in cohort.columns:
            cohort[col] = pd.to_numeric(cohort[col], errors="coerce").fillna(0).astype(int)
    if "gender" in cohort.columns:
        cohort["male"] = (cohort["gender"].astype(str).str.upper() == "M").astype(int)
    if "los_icu" in cohort.columns:
        los = pd.to_numeric(cohort["los_icu"], errors="coerce")
        cohort["prolonged_icu_los"] = (los > los.quantile(0.75)).astype(int)

    before_n = int(cohort.shape[0])
    filters = study["cohort"]
    mask = pd.Series(True, index=cohort.index)
    for name in filters.get("diagnosis_any", []):
        mask &= cohort.get(f"any_{name}", pd.Series(0, index=cohort.index)).eq(1)
    procedure_names = filters.get("procedure_any", [])
    if procedure_names:
        proc_mask = pd.Series(False, index=cohort.index)
        for name in procedure_names:
            proc_mask |= cohort.get(f"any_{name}", pd.Series(0, index=cohort.index)).eq(1)
        mask &= proc_mask
    cohort = cohort.loc[mask].copy()
    summary = {
        "baseFirstIcuRows": before_n,
        "firstIcuStayRows": int(cohort.shape[0]),
        "uniquePatients": int(cohort["subject_id"].nunique()) if "subject_id" in cohort.columns else None,
        "diagnosisFlags": {name: int(cohort.get(f"any_{name}", pd.Series(dtype=int)).sum()) for name in DIAGNOSIS_FAMILIES},
        "procedureFlags": {name: int(cohort.get(f"any_{name}", pd.Series(dtype=int)).sum()) for name in PROCEDURE_FAMILIES},
    }
    return cohort, summary, matched_dx, matched_proc


def numeric_summary(series: pd.Series) -> dict[str, Any]:
    clean = pd.to_numeric(series, errors="coerce").replace([np.inf, -np.inf], np.nan).dropna()
    if clean.empty:
        return {"n": 0, "missing": int(series.shape[0])}
    return {
        "n": int(clean.shape[0]),
        "missing": int(series.shape[0] - clean.shape[0]),
        "mean": float(clean.mean()),
        "sd": float(clean.std(ddof=1)) if clean.shape[0] > 1 else 0.0,
        "median": float(clean.median()),
        "iqr": [float(clean.quantile(0.25)), float(clean.quantile(0.75))],
        "min": float(clean.min()),
        "max": float(clean.max()),
    }


def binary_summary(series: pd.Series) -> dict[str, Any]:
    clean = pd.to_numeric(series, errors="coerce").dropna()
    n = int(clean.shape[0])
    pos = int((clean > 0).sum()) if n else 0
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


def candidate_predictors(cohort: pd.DataFrame, primary_exposure: str) -> list[str]:
    preferred = [
        primary_exposure,
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
        "any_aki",
        "any_esrd",
        "dialysis_active",
        "any_crrt_record",
    ]
    predictors: list[str] = []
    for col in preferred:
        if col in predictors:
            continue
        if col not in cohort.columns:
            continue
        numeric = pd.to_numeric(cohort[col], errors="coerce")
        if numeric.notna().sum() >= max(30, int(0.08 * len(cohort))) and numeric.nunique(dropna=True) > 1:
            predictors.append(col)
    event_cap = 12
    if "hospital_expire_flag" in cohort.columns:
        events = int(pd.to_numeric(cohort["hospital_expire_flag"], errors="coerce").fillna(0).sum())
        if events > 0:
            event_cap = max(3, min(12, events // 10))
    return predictors[:event_cap]


def vif_table(frame: pd.DataFrame, predictors: list[str]) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    if len(predictors) < 2:
        return rows
    x = frame[predictors].replace([np.inf, -np.inf], np.nan).copy()
    for col in predictors:
        x[col] = pd.to_numeric(x[col], errors="coerce")
    x = x.dropna()
    if len(x) < 50:
        return rows
    continuous = [col for col in predictors if x[col].nunique(dropna=True) > 2]
    x, _ = standardize(x, continuous)
    for col in predictors:
        others = [item for item in predictors if item != col]
        if not others:
            continue
        try:
            y = x[col]
            xx = sm.add_constant(x[others], has_constant="add")
            r2 = float(sm.OLS(y, xx).fit().rsquared)
            vif = 1 / (1 - r2) if r2 < 0.999 else math.inf
            rows.append({"term": col, "vif": float(vif) if math.isfinite(vif) else None})
        except Exception:
            rows.append({"term": col, "vif": None})
    return rows


def standardized_mean_difference(frame: pd.DataFrame, exposure: str, covariate: str) -> float | None:
    x = pd.to_numeric(frame[exposure], errors="coerce")
    c = pd.to_numeric(frame[covariate], errors="coerce")
    data = pd.DataFrame({"exposure": x, "covariate": c}).dropna()
    treated = data.loc[data["exposure"].eq(1), "covariate"]
    control = data.loc[data["exposure"].eq(0), "covariate"]
    if treated.empty or control.empty:
        return None
    pooled = math.sqrt((float(treated.var(ddof=1)) + float(control.var(ddof=1))) / 2)
    if not pooled or not math.isfinite(pooled):
        return 0.0 if abs(float(treated.mean()) - float(control.mean())) < 1e-12 else None
    return float((treated.mean() - control.mean()) / pooled)


def fit_propensity_match(cohort: pd.DataFrame, exposure: str, covariates: list[str], out_dir: Path) -> dict[str, Any]:
    if exposure not in cohort.columns:
        return {"status": "not_fit", "reason": "Primary exposure missing."}
    covariates = [col for col in covariates if col != exposure and col in cohort.columns]
    frame = cohort[[exposure, "hospital_expire_flag", "los_icu"] + covariates].replace([np.inf, -np.inf], np.nan).copy()
    for col in frame.columns:
        frame[col] = pd.to_numeric(frame[col], errors="coerce")
    frame = frame.dropna(subset=[exposure, "hospital_expire_flag", "los_icu"] + covariates)
    frame[exposure] = frame[exposure].astype(int)
    treated_count = int(frame[exposure].sum())
    control_count = int(frame.shape[0] - treated_count)
    if frame.shape[0] < 80 or treated_count < 20 or control_count < 20 or len(covariates) < 2:
        return {
            "status": "not_fit",
            "reason": "Insufficient complete treated/control rows or covariates for matching.",
            "n": int(frame.shape[0]),
            "treated": treated_count,
            "control": control_count,
            "covariates": covariates,
        }
    continuous = [col for col in covariates if frame[col].nunique(dropna=True) > 2]
    model_frame, scalers = standardize(frame, continuous)
    x = sm.add_constant(model_frame[covariates], has_constant="add")
    try:
        ps_model = sm.Logit(model_frame[exposure], x).fit(disp=False, maxiter=200)
        propensity = pd.Series(ps_model.predict(x), index=frame.index, name="propensity_score").clip(1e-4, 1 - 1e-4)
    except Exception as exc:
        return {"status": "not_fit", "reason": f"Propensity model failed: {exc}", "n": int(frame.shape[0]), "treated": treated_count, "control": control_count, "covariates": covariates}
    work = frame.copy()
    work["propensity_score"] = propensity
    treated = work.loc[work[exposure].eq(1)].sort_values("propensity_score")
    controls = work.loc[work[exposure].eq(0)].sort_values("propensity_score")
    available = set(controls.index.tolist())
    pairs = []
    caliper = 0.2 * float(propensity.std(ddof=1))
    for tidx, trow in treated.iterrows():
        if not available:
            break
        candidates = controls.loc[list(available)]
        distances = (candidates["propensity_score"] - trow["propensity_score"]).abs()
        cidx = distances.idxmin()
        distance = float(distances.loc[cidx])
        if math.isfinite(caliper) and caliper > 0 and distance > caliper:
            continue
        available.remove(cidx)
        pairs.append({
            "pair_id": len(pairs) + 1,
            "treated_row": int(tidx),
            "control_row": int(cidx),
            "treated_propensity": float(trow["propensity_score"]),
            "control_propensity": float(work.loc[cidx, "propensity_score"]),
            "distance": distance,
        })
    if len(pairs) < 20:
        return {
            "status": "not_fit",
            "reason": "Too few matched pairs after caliper matching.",
            "n": int(frame.shape[0]),
            "treated": treated_count,
            "control": control_count,
            "matchedPairs": len(pairs),
            "covariates": covariates,
        }
    pair_frame = pd.DataFrame(pairs)
    treated_matched = work.loc[pair_frame["treated_row"].to_numpy()].copy()
    control_matched = work.loc[pair_frame["control_row"].to_numpy()].copy()
    treated_matched["pair_id"] = pair_frame["pair_id"].to_numpy()
    control_matched["pair_id"] = pair_frame["pair_id"].to_numpy()
    matched = pd.concat([treated_matched, control_matched], ignore_index=True)
    balance = []
    for covariate in covariates:
        before = standardized_mean_difference(work, exposure, covariate)
        after = standardized_mean_difference(matched, exposure, covariate)
        balance.append({"covariate": covariate, "smdBefore": before, "smdAfter": after, "absSmdBefore": abs(before) if before is not None else None, "absSmdAfter": abs(after) if after is not None else None})
    pd.DataFrame(balance).to_csv(out_dir / "propensity-balance.csv", index=False)
    pair_frame.to_csv(out_dir / "matched-pairs.csv", index=False)
    work[["propensity_score", exposure]].assign(row_id=work.index).to_csv(out_dir / "propensity-scores.csv", index=False)
    t_mort = treated_matched["hospital_expire_flag"].astype(float).to_numpy()
    c_mort = control_matched["hospital_expire_flag"].astype(float).to_numpy()
    t_los = treated_matched["los_icu"].astype(float).to_numpy()
    c_los = control_matched["los_icu"].astype(float).to_numpy()
    risk_diff = float(np.mean(t_mort - c_mort))
    los_diff = float(np.mean(t_los - c_los))
    discordant_treated = int(np.sum((t_mort == 1) & (c_mort == 0)))
    discordant_control = int(np.sum((t_mort == 0) & (c_mort == 1)))
    matched_or = (discordant_treated + 0.5) / (discordant_control + 0.5)
    max_after = max([row["absSmdAfter"] for row in balance if row["absSmdAfter"] is not None] or [None])
    return {
        "status": "fit",
        "n": int(frame.shape[0]),
        "treated": treated_count,
        "control": control_count,
        "matchedPairs": int(len(pairs)),
        "unmatchedTreated": int(treated_count - len(pairs)),
        "caliper": caliper,
        "covariates": covariates,
        "scalers": scalers,
        "maxAbsSmdBefore": max([row["absSmdBefore"] for row in balance if row["absSmdBefore"] is not None] or [None]),
        "maxAbsSmdAfter": max_after,
        "balanceStatus": "pass" if max_after is not None and max_after <= 0.1 else "review",
        "effects": {
            "mortalityRiskDifference": risk_diff,
            "mortalityMatchedOddsRatio": float(matched_or),
            "discordantTreatedDeaths": discordant_treated,
            "discordantControlDeaths": discordant_control,
            "icuLosMeanDifferenceDays": los_diff,
        },
        "artifacts": {
            "balance": str(out_dir / "propensity-balance.csv"),
            "pairs": str(out_dir / "matched-pairs.csv"),
            "scores": str(out_dir / "propensity-scores.csv"),
        },
    }


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
        return {"status": "not_fit", "reason": "Outcome lacks enough events/non-events.", "n": int(len(frame)), "events": int(y.sum())}
    continuous = [col for col in predictors if col != "male" and frame[col].nunique(dropna=True) > 2]
    frame, scalers = standardize(frame, continuous)
    x = sm.add_constant(frame[predictors], has_constant="add")
    try:
        result = sm.Logit(y, x).fit(disp=False, maxiter=200)
        conf = result.conf_int()
        rows = []
        for term in result.params.index:
            if term == "const":
                continue
            rows.append({
                "term": term,
                "oddsRatio": float(np.exp(result.params[term])),
                "ci95": [float(np.exp(conf.loc[term, 0])), float(np.exp(conf.loc[term, 1]))],
                "pValue": float(result.pvalues[term]),
                "scale": "per 1 SD" if term in continuous else "per unit",
            })
        pred = result.predict(x)
        influence_summary = {}
        try:
            glm = sm.GLM(y, x, family=sm.families.Binomial()).fit()
            infl = glm.get_influence(observed=True)
            cooks = infl.cooks_distance[0]
            influence_summary = {"maxCookDistance": float(np.nanmax(cooks)), "cookDistanceGt1Count": int(np.sum(cooks > 1))}
        except Exception as exc:
            influence_summary = {"status": "not_available", "reason": str(exc)}
        return {
            "status": "fit",
            "n": int(len(frame)),
            "events": int(y.sum()),
            "predictors": predictors,
            "scalers": scalers,
            "metrics": {
                "auroc": float(roc_auc_score(y, pred)),
                "averagePrecision": float(average_precision_score(y, pred)),
                "brierScore": float(brier_score_loss(y, pred)),
            },
            "coefficients": rows,
            "diagnostics": {"vif": vif_table(frame, predictors), "influence": influence_summary},
        }
    except Exception as exc:
        return {"status": "not_fit", "reason": str(exc), "n": int(len(frame)), "events": int(y.sum())}


def percent_from_log(value: Any) -> float | None:
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None
    if not math.isfinite(number) or number > 50 or number < -50:
        return None
    return float((math.exp(number) - 1) * 100)


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
    continuous = [col for col in predictors if col != "male" and frame[col].nunique(dropna=True) > 2]
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
            rows.append({
                "term": term,
                "percentChangeInLos": percent_from_log(result.params[term]),
                "ci95PercentChange": [percent_from_log(conf.loc[term, 0]), percent_from_log(conf.loc[term, 1])],
                "pValue": float(result.pvalues[term]),
                "scale": "per 1 SD" if term in continuous else "per unit",
            })
        return {
            "status": "fit",
            "n": int(len(frame)),
            "predictors": predictors,
            "scalers": scalers,
            "rSquared": float(result.rsquared),
            "coefficients": rows,
            "diagnostics": {"vif": vif_table(frame, predictors)},
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


def table_one(cohort: pd.DataFrame, exposure: str) -> dict[str, Any]:
    continuous_cols = ["admission_age", "los_icu", "los_hospital", "apsiii", "oasis", "sofa", "charlson_comorbidity_index", "creatinine_max", "bun_max", "heart_rate_max", "sbp_min"]
    binary_cols = list(dict.fromkeys(["hospital_expire_flag", "male", "prolonged_icu_los", exposure, "dialysis_present", "dialysis_active", "any_crrt_record", "any_aki", "any_esrd"]))
    table = {
        "continuous": {col: numeric_summary(cohort[col]) for col in continuous_cols if col in cohort.columns},
        "binary": {col: binary_summary(cohort[col]) for col in binary_cols if col in cohort.columns},
        "byExposure": {},
    }
    if exposure in cohort.columns and pd.to_numeric(cohort[exposure], errors="coerce").nunique(dropna=True) == 2:
        groups = {}
        for value, label in [(0, "unexposed"), (1, "exposed")]:
            subset = cohort.loc[pd.to_numeric(cohort[exposure], errors="coerce").fillna(0).astype(int).eq(value)]
            groups[label] = {
                "n": int(subset.shape[0]),
                "mortality": binary_summary(subset["hospital_expire_flag"]) if "hospital_expire_flag" in subset.columns else None,
                "losIcu": numeric_summary(subset["los_icu"]) if "los_icu" in subset.columns else None,
            }
        table["byExposure"] = groups
    return table


def methods_issues(cohort_summary: dict[str, Any], models: dict[str, Any], miss: list[dict[str, Any]], exposure: str) -> list[dict[str, Any]]:
    issues: list[dict[str, Any]] = []
    cohort_n = int(cohort_summary.get("firstIcuStayRows") or 0)
    if cohort_n < 100:
        issues.append({"code": "SMALL_COHORT_REVIEW", "severity": "warning", "message": "Fewer than 100 first ICU stays were available; estimates may be unstable."})
    mortality = models.get("mortality", {})
    if mortality.get("status") == "fit":
        events = int(mortality.get("events") or 0)
        predictors = len(mortality.get("predictors") or [])
        n = int(mortality.get("n") or 0)
        non_events = n - events
        if events < 20 or non_events < 20:
            issues.append({"code": "SPARSE_BINARY_OUTCOME_REVIEW", "severity": "warning", "message": "The mortality model has fewer than 20 events or non-events."})
        if predictors and events / predictors < 10:
            issues.append({"code": "LOW_EVENTS_PER_PREDICTOR", "severity": "warning", "message": f"Mortality model has {events} events across {predictors} predictors."})
        if n and cohort_n and n / cohort_n < 0.75:
            issues.append({"code": "COMPLETE_CASE_SHRINKAGE_REVIEW", "severity": "warning", "message": f"Mortality model retained {n} of {cohort_n} cohort rows."})
        high_vif = [row for row in mortality.get("diagnostics", {}).get("vif", []) if row.get("vif") and row["vif"] > 5]
        if high_vif:
            issues.append({"code": "COLLINEARITY_REVIEW", "severity": "warning", "message": f"{len(high_vif)} predictor(s) had VIF > 5.", "terms": [row["term"] for row in high_vif]})
    los = models.get("los", {})
    if los.get("status") == "fit":
        nonfinite = [row.get("term") for row in los.get("coefficients", []) if row.get("percentChangeInLos") is None or any(value is None for value in row.get("ci95PercentChange", []))]
        if nonfinite:
            issues.append({"code": "NONFINITE_LOS_EFFECT_REVIEW", "severity": "warning", "message": "At least one ICU LOS effect estimate was too large or unstable to render as a finite percent change.", "terms": nonfinite})
    for row in miss:
        if row["column"] == exposure and (row["missingFraction"] or 0) > 0.05:
            issues.append({"code": "EXPOSURE_MISSINGNESS_REVIEW", "severity": "warning", "message": f"Primary exposure {exposure} has {row['missingFraction']:.1%} missingness."})
        elif (row["missingFraction"] or 0) > 0.4:
            issues.append({"code": "HIGH_MISSINGNESS_REVIEW", "severity": "warning", "message": f"{row['column']} has {row['missingFraction']:.1%} missingness."})
    matching = models.get("propensityMatch", {})
    if matching.get("status") != "fit":
        issues.append({"code": "PROPENSITY_MATCHING_NOT_FIT", "severity": "warning", "message": f"Propensity matching did not fit: {matching.get('reason', 'unknown reason')}."})
    elif matching.get("balanceStatus") != "pass":
        issues.append({"code": "PROPENSITY_RESIDUAL_IMBALANCE", "severity": "warning", "message": f"Maximum absolute matched SMD was {matching.get('maxAbsSmdAfter')}."})
    elif int(matching.get("unmatchedTreated") or 0) > 0:
        issues.append({"code": "PROPENSITY_UNMATCHED_TREATED", "severity": "warning", "message": f"{matching.get('unmatchedTreated')} treated rows were unmatched after caliper matching."})
    return issues


def write_csvs(out_dir: Path, table: dict[str, Any], models: dict[str, Any], miss: list[dict[str, Any]]) -> None:
    rows = []
    for kind, values in [("continuous", table.get("continuous", {})), ("binary", table.get("binary", {}))]:
        for name, payload in values.items():
            rows.append({"kind": kind, "variable": name, **payload})
    pd.DataFrame(rows).to_csv(out_dir / "table-one.csv", index=False)
    coef_rows = []
    for model_name, model in models.items():
        for row in model.get("coefficients", []):
            coef_rows.append({"model": model_name, **row})
    pd.DataFrame(coef_rows).to_csv(out_dir / "model-coefficients.csv", index=False)
    pd.DataFrame(miss).to_csv(out_dir / "missingness.csv", index=False)


def format_p(value: float | None) -> str:
    if value is None:
        return "NA"
    if value < 0.001:
        return "<0.001"
    return f"{value:.3f}"


def write_paper(out_dir: Path, study: dict[str, Any], results: dict[str, Any]) -> None:
    cohort = results["cohortSummary"]
    table = results["tableOne"]
    models = results["models"]
    miss = results["missingness"]
    qa = results["qa"]
    cost = results["cost"]
    exposure = study["primary_exposure"]
    by_exp = table.get("byExposure", {})
    mortality = models.get("mortality", {})
    los = models.get("los", {})
    top_mortality = sorted(mortality.get("coefficients", []), key=lambda row: row.get("pValue", 1))[:8] if mortality.get("status") == "fit" else []
    top_los = sorted(los.get("coefficients", []), key=lambda row: row.get("pValue", 1))[:8] if los.get("status") == "fit" else []
    exposure_row_m = next((row for row in mortality.get("coefficients", []) if row.get("term") == exposure), None)
    exposure_row_l = next((row for row in los.get("coefficients", []) if row.get("term") == exposure), None)
    lines = [
        f"# {study['title']}",
        "",
        "## Abstract",
        "",
        f"**Background:** Dialysis and cardiac-surgery ICU populations have high acuity and heterogeneous risk. This local MIMIC-IV analysis evaluates {study['question'].rstrip('?').lower()}.",
        f"**Methods:** We identified a diagnosis- or procedure-code-defined ICU cohort, kept the first ICU stay per hospitalization, summarized cohort characteristics, and fit complete-case adjusted models for in-hospital mortality and log-transformed ICU length of stay. Models adjusted for available first-day severity, laboratory, vital-sign, demographic, and comorbidity variables. Results are observational associations and are not causal estimates.",
        f"**Results:** The cohort included {cohort['firstIcuStayRows']:,} first ICU stays from {cohort['uniquePatients']:,} patients. In-hospital mortality was {table['binary'].get('hospital_expire_flag', {}).get('positive', 0):,} of {table['binary'].get('hospital_expire_flag', {}).get('n', 0):,} ({(table['binary'].get('hospital_expire_flag', {}).get('proportion') or 0):.1%}).",
        f"**Conclusion:** The packet is suitable for local methods review. Stronger clinical claims require phenotype review, missing-data review, and external validation.",
        "",
        "## Introduction",
        "",
        f"This study asks: {study['question']} The goal is to produce a reproducible local-review manuscript and a machine-readable audit trail for a clinically plausible ICU cohort. The analysis is intended to test the research pipeline as much as to summarize the data: it should make cohort construction, missingness, model fit, and limitations visible.",
        "",
        "## Methods",
        "",
        "### Data Source And Setting",
        "",
        "We analyzed a local project-owned Parquet cache of MIMIC-IV v3.1 tables. MIMIC-IV is a deidentified critical-care and hospital EHR dataset. This packet contains aggregate outputs only; temporary row-level Parquet cache files were removed after execution.",
        "",
        "### Cohort Construction",
        "",
        "Diagnosis and procedure code families were matched against the local MIMIC diagnosis and procedure dictionaries. The cohort used the first ICU stay for each matching hospitalization. Procedure-code cohorts use hospital procedure coding and therefore identify coded procedures, not operative notes or timestamps validated by chart review.",
        "",
        "### Exposure And Outcomes",
        "",
        f"The primary exposure was: **{study['exposure_label']}** (`{exposure}`). The primary outcome was in-hospital mortality. ICU length of stay was analyzed as a secondary continuous outcome using log-transformed ICU days.",
        "",
        "### Statistical Analysis",
        "",
        "We fit adjusted logistic regression for in-hospital mortality and heteroskedasticity-robust linear regression for log-transformed ICU length of stay. Continuous predictors were standardized to one standard deviation when modeled. Candidate predictors were selected from first-day severity scores, laboratory values, vital signs, demographics, and comorbidity fields when available. Complete-case denominators are reported separately from cohort size.",
        "",
        "### Quality Control",
        "",
        "The runner recorded source-table inventory, transfer-cost estimates, matched code dictionaries, missingness, model diagnostics, events-per-predictor checks, collinearity screening, and row-cache cleanup status. QA warnings are treated as methods-review items rather than hidden implementation details.",
        "",
        "## Results",
        "",
        "### Cohort And Code Matching",
        "",
        f"The analysis started from {cohort['baseFirstIcuRows']:,} first ICU stays and retained {cohort['firstIcuStayRows']:,} rows after the study cohort definition. The cohort included {cohort['uniquePatients']:,} unique patients.",
        "",
        "### Baseline Characteristics",
        "",
    ]
    for col in ["admission_age", "los_icu", "los_hospital", "apsiii", "oasis", "sofa", "charlson_comorbidity_index", "creatinine_max", "bun_max"]:
        s = table.get("continuous", {}).get(col)
        if s and s.get("n"):
            lines.append(f"- {col}: median {s['median']:.2f} (IQR {s['iqr'][0]:.2f}-{s['iqr'][1]:.2f}); n={s['n']:,}.")
    for col in dict.fromkeys(["hospital_expire_flag", "male", exposure, "dialysis_present", "any_crrt_record", "any_aki", "any_esrd"]):
        b = table.get("binary", {}).get(col)
        if b and b.get("n"):
            lines.append(f"- {col}: {b['positive']:,} of {b['n']:,} ({(b['proportion'] or 0):.1%}).")
    if by_exp:
        lines.extend(["", "### Outcome By Exposure Group", ""])
        for label, payload in by_exp.items():
            m = payload.get("mortality") or {}
            l = payload.get("losIcu") or {}
            lines.append(f"- {label.title()}: n={payload.get('n', 0):,}; mortality {m.get('positive', 0):,}/{m.get('n', 0):,} ({(m.get('proportion') or 0):.1%}); median ICU LOS {l.get('median', 0):.2f} days.")
    lines.extend(["", "### Mortality Model", ""])
    if mortality.get("status") == "fit":
        lines.append(f"The mortality model retained {mortality['n']:,} complete cases with {mortality['events']:,} deaths. AUROC was {mortality['metrics']['auroc']:.3f}, average precision was {mortality['metrics']['averagePrecision']:.3f}, and Brier score was {mortality['metrics']['brierScore']:.3f}. These are apparent in-sample performance values, not external validation.")
        if exposure_row_m:
            lines.append(f"For the primary exposure, adjusted OR was {exposure_row_m['oddsRatio']:.2f} (95% CI {exposure_row_m['ci95'][0]:.2f}-{exposure_row_m['ci95'][1]:.2f}; p={format_p(exposure_row_m['pValue'])}).")
        for row in top_mortality:
            lines.append(f"- {row['term']}: adjusted OR {row['oddsRatio']:.2f} (95% CI {row['ci95'][0]:.2f}-{row['ci95'][1]:.2f}); p={format_p(row['pValue'])}; {row['scale']}.")
    else:
        lines.append(f"The mortality model was not fit: {mortality.get('reason', 'unknown reason')}.")
    lines.extend(["", "### ICU Length Of Stay Model", ""])
    if los.get("status") == "fit":
        lines.append(f"The ICU length-of-stay model retained {los['n']:,} complete cases and had R-squared={los['rSquared']:.3f}.")
        if exposure_row_l:
            effect = exposure_row_l.get("percentChangeInLos")
            ci = exposure_row_l.get("ci95PercentChange", [None, None])
            if effect is not None and all(item is not None for item in ci):
                lines.append(f"For the primary exposure, adjusted ICU LOS difference was {effect:.1f}% (95% CI {ci[0]:.1f}% to {ci[1]:.1f}%; p={format_p(exposure_row_l['pValue'])}).")
        for row in top_los:
            effect = row.get("percentChangeInLos")
            ci = row.get("ci95PercentChange", [None, None])
            if effect is None or any(item is None for item in ci):
                lines.append(f"- {row['term']}: effect too unstable to render as finite percent change; p={format_p(row['pValue'])}; {row['scale']}.")
            else:
                lines.append(f"- {row['term']}: {effect:.1f}% LOS change (95% CI {ci[0]:.1f}% to {ci[1]:.1f}%); p={format_p(row['pValue'])}; {row['scale']}.")
    else:
        lines.append(f"The ICU length-of-stay model was not fit: {los.get('reason', 'unknown reason')}.")
    matching = models.get("propensityMatch", {})
    lines.extend(["", "### Propensity-Matched Exposure Analysis", ""])
    if matching.get("status") == "fit":
        effects = matching["effects"]
        lines.append(f"Propensity-score matching used {len(matching['covariates'])} covariates and matched {matching['matchedPairs']:,} exposed ICU stays to {matching['matchedPairs']:,} unexposed ICU stays. The maximum absolute standardized mean difference after matching was {matching['maxAbsSmdAfter']:.3f}; balance status was {matching['balanceStatus']}.")
        lines.append(f"In the matched sample, exposed stays had a mortality risk difference of {effects['mortalityRiskDifference']:.3f} and a matched discordant-pair odds ratio of {effects['mortalityMatchedOddsRatio']:.2f}. Mean ICU length of stay differed by {effects['icuLosMeanDifferenceDays']:.2f} days.")
        if matching["unmatchedTreated"]:
            lines.append(f"{matching['unmatchedTreated']:,} exposed rows were not matched within the caliper and should be considered a common-support limitation.")
    else:
        lines.append(f"Propensity-score matching was not fit: {matching.get('reason', 'unknown reason')}.")
    lines.extend(["", "### Missingness And Diagnostics", ""])
    for row in miss[:12]:
        lines.append(f"- {row['column']}: {row['missing']:,} missing ({(row['missingFraction'] or 0):.1%}).")
    lines.extend([
        "",
        "## Discussion",
        "",
        f"This local MIMIC-IV analysis provides a reproducible, code-defined summary of {study['domain']} ICU outcomes. The results show which measured first-day features and the declared exposure were associated with mortality and ICU length of stay in the analyzed table. They should be interpreted as associations in a deidentified EHR cohort, not as treatment effects or clinical recommendations.",
        "",
        "## Limitations",
        "",
        "- Cohorts are defined by diagnosis or procedure codes and require clinical/coding review.",
        "- Procedure timing and diagnosis timing may not identify the exact onset or indication for ICU care.",
        "- Complete-case modeling can bias estimates if missingness is related to illness severity, exposure, or outcome.",
        "- Apparent discrimination metrics are in-sample and should not be used as deployment or prediction-model validation evidence.",
        "- Propensity matching balances recorded covariates only and does not address unmeasured confounding, code-timing ambiguity, or treatment indication.",
        "- The analysis does not establish whether dialysis, CRRT, surgery, or AKI caused the observed outcomes.",
        "",
        "## Reproducibility And Artifacts",
        "",
        f"- QA status: {qa['status']}.",
        f"- Typed QA issues: {len(qa['typedIssues'])}.",
        f"- Estimated run cost: ${cost['estimatedUsd']:.4f}.",
        f"- Cumulative estimated series cost: ${cost['cumulativeEstimatedUsd']:.4f} of ${SESSION_CEILING_USD:.2f}.",
        "- Artifact files include `analysis-results.json`, `table-one.csv`, `model-coefficients.csv`, `missingness.csv`, propensity matching CSVs when fit, code-match CSVs, QA JSON, cost receipt, manifest, critique, and this manuscript.",
        "",
        "## What This Does And Does Not Show",
        "",
        "- Shows: local associations and cohort summaries in a code-defined MIMIC-IV ICU cohort.",
        "- Does not show: causality, external validity, dialysis effectiveness, surgical quality, or deployable prediction performance.",
    ])
    (out_dir / "paper.md").write_text("\n".join(lines) + "\n")


def paper_text_qa(paper: str) -> list[dict[str, Any]]:
    required = ["## Abstract", "## Introduction", "## Methods", "## Results", "## Discussion", "## Limitations", "## Reproducibility And Artifacts", "## What This Does And Does Not Show"]
    checks = [{"code": f"section-{section.lower().replace(' ', '-')}", "passed": section in paper, "message": f"Required section {section} present."} for section in required]
    forbidden = ["AnalysisSpec", "agenteer", "run-inspect", "local_review_ready", "needs_methods_review"]
    hits = [term for term in forbidden if term.lower() in paper.lower()]
    checks.append({"code": "reader-facing-language", "passed": not hits, "message": f"Internal jargon hits: {', '.join(hits) if hits else 'none'}."})
    checks.append({"code": "has-data-density", "passed": paper.count("Complete-case") + paper.count("cohort") >= 4, "message": "Paper contains multiple concrete cohort/model statements."})
    checks.append({"code": "causal-boundary", "passed": "not as treatment effects" in paper.lower() or "does not establish" in paper.lower(), "message": "Paper states non-causal boundary."})
    checks.append({"code": "propensity-section", "passed": "### Propensity-Matched Exposure Analysis" in paper, "message": "Paper includes a propensity-matched exposure section."})
    return checks


def make_qa(study: dict[str, Any], results: dict[str, Any], out_dir: Path) -> dict[str, Any]:
    cohort = results["cohortSummary"]
    models = results["models"]
    miss = results["missingness"]
    typed = methods_issues(cohort, models, miss, study["primary_exposure"])
    checks = [
        {"code": "cohort-nonempty", "passed": cohort["firstIcuStayRows"] > 0, "message": "Cohort has at least one first ICU stay."},
        {"code": "row-cache-removed", "passed": not (out_dir / "_tmp-parquet-cache").exists(), "message": "Temporary row-level cache was removed."},
        {"code": "mortality-model-fit-or-justified", "passed": models["mortality"].get("status") == "fit" or "reason" in models["mortality"], "message": "Mortality model either fit or recorded why it did not fit."},
        {"code": "los-model-fit-or-justified", "passed": models["los"].get("status") == "fit" or "reason" in models["los"], "message": "LOS model either fit or recorded why it did not fit."},
        {"code": "exposure-recorded", "passed": study["primary_exposure"] in results["predictors"] or study["primary_exposure"] in results["tableOne"].get("binary", {}), "message": "Primary exposure is present in predictors or Table 1."},
        {"code": "exposure-denominator-complete", "passed": (results["tableOne"].get("binary", {}).get(study["primary_exposure"], {}).get("n") or 0) == cohort["firstIcuStayRows"], "message": "Primary exposure denominator equals cohort rows."},
        {"code": "artifact-csvs-written", "passed": all((out_dir / name).exists() for name in ["table-one.csv", "model-coefficients.csv", "missingness.csv"]), "message": "CSV review artifacts exist."},
        {"code": "propensity-artifacts-written", "passed": results["models"].get("propensityMatch", {}).get("status") != "fit" or all((out_dir / name).exists() for name in ["propensity-balance.csv", "matched-pairs.csv", "propensity-scores.csv"]), "message": "Propensity artifacts exist when matching fits."},
    ]
    paper = (out_dir / "paper.md").read_text() if (out_dir / "paper.md").exists() else ""
    checks.extend(paper_text_qa(paper))
    status = "pass" if all(check["passed"] for check in checks) and not any(issue["severity"] == "blocker" for issue in typed) else "review"
    return {
        "schemaVersion": 1,
        "generatedAtIso": now_iso(),
        "status": status,
        "checks": checks,
        "typedIssues": typed,
        "warnings": [issue["message"] for issue in typed],
        "nextAction": "Review typed methods warnings, phenotype definitions, and complete-case diagnostics before external sharing." if typed else "Ready for local methods review; consider phenotype sensitivity and external validation before stronger claims.",
    }


def artifact_index(out_dir: Path) -> dict[str, Any]:
    artifacts = []
    for path in sorted(out_dir.iterdir()):
        if path.is_file():
            data = path.read_bytes()
            artifacts.append({"path": str(path), "name": path.name, "bytes": len(data), "sha256": hashlib.sha256(data).hexdigest()})
    return {"schemaVersion": 1, "generatedAtIso": now_iso(), "artifactCount": len(artifacts), "artifacts": artifacts}


def run_one(study: dict[str, Any], out_root: Path) -> dict[str, Any]:
    out_dir = out_root / "papers" / study["id"]
    if out_dir.exists():
        shutil.rmtree(out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    loaded = load_declared_tables(study["id"], out_dir, COMMON_TABLES)
    cohort, cohort_summary, matched_dx, matched_proc = build_cohort(study, loaded)
    predictors = candidate_predictors(cohort, study["primary_exposure"])
    table = table_one(cohort, study["primary_exposure"])
    propensity = fit_propensity_match(cohort, study["primary_exposure"], predictors, out_dir)
    models = {"mortality": fit_logistic(cohort, "hospital_expire_flag", predictors), "los": fit_log_los(cohort, predictors), "propensityMatch": propensity}
    miss = missingness(cohort, predictors + ["hospital_expire_flag", "los_icu", "los_hospital"])
    actual_usd = loaded.bytes_copied / 1024**3 * USD_PER_GB
    ledger = append_cost_event({"event": "actual_read", "studyId": study["id"], "actualBytes": loaded.bytes_copied, "estimatedUsd": actual_usd})
    cost = {"actualBytes": loaded.bytes_copied, "estimatedUsd": actual_usd, "cumulativeEstimatedUsd": ledger["estimatedUsd"], "sessionCeilingUsd": SESSION_CEILING_USD}
    results = {
        "schemaVersion": 1,
        "generatedAtIso": now_iso(),
        "study": study,
        "cohortSummary": cohort_summary,
        "tableOne": table,
        "predictors": predictors,
        "missingness": miss,
        "models": models,
        "cost": cost,
    }
    write_csvs(out_dir, table, models, miss)
    diagnosis_rows = []
    for name, frame in matched_dx.items():
        if not frame.empty:
            temp = frame.copy()
            temp.insert(0, "family", name)
            diagnosis_rows.append(temp)
    procedure_rows = []
    for name, frame in matched_proc.items():
        if not frame.empty:
            temp = frame.copy()
            temp.insert(0, "family", name)
            procedure_rows.append(temp)
    pd.concat(diagnosis_rows, ignore_index=True).to_csv(out_dir / "matched-diagnosis-codes.csv", index=False) if diagnosis_rows else pd.DataFrame().to_csv(out_dir / "matched-diagnosis-codes.csv", index=False)
    pd.concat(procedure_rows, ignore_index=True).to_csv(out_dir / "matched-procedure-codes.csv", index=False) if procedure_rows else pd.DataFrame().to_csv(out_dir / "matched-procedure-codes.csv", index=False)
    results["qa"] = {"status": "pending", "typedIssues": []}
    write_paper(out_dir, study, results)
    qa = make_qa(study, {**results, "qa": {"status": "pending", "typedIssues": []}}, out_dir)
    results["qa"] = qa
    write_paper(out_dir, study, results)
    save_json(out_dir / "analysis-results.json", results)
    save_json(out_dir / "paper-qa.json", qa)
    save_json(out_dir / "qa.json", qa)
    save_json(out_dir / "cost-receipt.json", cost)
    save_json(out_dir / "run-manifest.json", {"schemaVersion": 1, "generatedAtIso": now_iso(), "studyId": study["id"], "studyHash": stable_hash(study), "sourceInventory": loaded.inventory, "temporaryRowCacheRemoved": not (out_dir / "_tmp-parquet-cache").exists()})
    critique = {
        "schemaVersion": 1,
        "generatedAtIso": now_iso(),
        "verdict": "local_methods_review_ready" if qa["status"] == "pass" else "needs_methods_review",
        "mainRisks": [
            "Code-defined phenotype needs clinical/coding review.",
            "Complete-case regression can be biased by missingness.",
            "In-sample model performance is not validation.",
            "Associations are not causal effects.",
        ],
        "nextImprovement": "Add phenotype sensitivity, code-era stratification, and validation split or external validation before publication-grade use.",
    }
    save_json(out_dir / "critique.json", critique)
    (out_dir / "critique.md").write_text("# Critique\n\n" + f"Verdict: `{critique['verdict']}`.\n\n" + "\n".join(f"- {risk}" for risk in critique["mainRisks"]) + f"\n\nNext improvement: {critique['nextImprovement']}\n")
    save_json(out_dir / "artifact-index.json", artifact_index(out_dir))
    return {
        "studyId": study["id"],
        "title": study["title"],
        "outDir": str(out_dir),
        "paper": str(out_dir / "paper.md"),
        "cohortRows": cohort_summary["firstIcuStayRows"],
        "uniquePatients": cohort_summary["uniquePatients"],
        "mortalityStatus": models["mortality"].get("status"),
        "losStatus": models["los"].get("status"),
        "qaStatus": qa["status"],
        "typedIssueCodes": [issue["code"] for issue in qa["typedIssues"]],
        "costUsd": actual_usd,
        "cumulativeCostUsd": ledger["estimatedUsd"],
    }


def write_index(out_root: Path, summaries: list[dict[str, Any]]) -> None:
    save_json(out_root / "SERIES_INDEX.json", {"schemaVersion": 1, "generatedAtIso": now_iso(), "paperCount": len(summaries), "papers": summaries})
    lines = [
        "# MIMIC Dialysis and Cardiac Surgery Paper Series",
        "",
        f"Generated at: {now_iso()}",
        "",
        "| Study | Cohort rows | QA | Issues | Paper |",
        "| --- | ---: | --- | --- | --- |",
    ]
    for item in summaries:
        rel = Path(item["paper"]).relative_to(ROOT)
        issues = ", ".join(item["typedIssueCodes"]) if item["typedIssueCodes"] else "-"
        lines.append(f"| {item['title']} | {item['cohortRows']:,} | {item['qaStatus']} | {issues} | `{rel}` |")
    (out_root / "SERIES_INDEX.md").write_text("\n".join(lines) + "\n")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--study-id", help="Run one study id. Omit with --all to run every study.")
    parser.add_argument("--all", action="store_true")
    parser.add_argument("--out-root", default=str(OUT_ROOT))
    args = parser.parse_args()
    out_root = Path(args.out_root)
    out_root.mkdir(parents=True, exist_ok=True)
    save_json(out_root / "study-catalog.json", {"schemaVersion": 1, "generatedAtIso": now_iso(), "studies": STUDIES})
    selected = STUDIES if args.all else [study for study in STUDIES if study["id"] == args.study_id]
    if not selected:
        raise SystemExit(f"No study selected. Available: {', '.join(study['id'] for study in STUDIES)}")
    summaries = []
    for study in selected:
        summary = run_one(study, out_root)
        summaries.append(summary)
        print(json.dumps(summary, indent=2))
    existing = []
    index_path = out_root / "SERIES_INDEX.json"
    if index_path.exists() and not args.all:
        existing = json.loads(index_path.read_text()).get("papers", [])
    merged = {item["studyId"]: item for item in existing + summaries}
    write_index(out_root, list(merged.values()))


if __name__ == "__main__":
    main()
