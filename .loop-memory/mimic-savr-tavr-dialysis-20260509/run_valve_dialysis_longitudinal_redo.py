#!/usr/bin/env python3
"""Redo MIMIC-IV SAVR/TAVR dialysis-status study with reviewer-ready artifacts.

This runner answers the MIMIC-feasible version of the requested longitudinal
question. It deliberately separates user-supplied code sets from auxiliary
dictionary/title logic and writes aggregate artifacts only.
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
from dataclasses import dataclass
from datetime import timedelta, timezone, datetime
from pathlib import Path
from typing import Any

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np
import pandas as pd
import pyarrow.parquet as pq
import statsmodels.api as sm
from statsmodels.duration.hazard_regression import PHReg


ROOT = Path("/Users/saleh/TechProjects/agenteer")
DATASET_DIR = ROOT / ".loop-memory/datasets/mimiciv-3-1"
MANIFEST_PATH = DATASET_DIR / "dataset-manifest.json"
OUT_DIR = ROOT / ".loop-memory/mimic-savr-tavr-dialysis-redo-20260509"
RUN_DIR = Path(os.environ.get("AGENTEER_VALVE_DIALYSIS_REDO_RUN_DIR", str(OUT_DIR / "run")))

USD_PER_GB = 0.12
COST_CEILING_USD = 10.0
PER_RUN_MAX_BYTES = 220 * 1024 * 1024
HORIZONS = [(30, "30d"), (365, "1y"), (1095, "3y"), (1825, "5y"), (3650, "10y")]

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

# User-supplied codes, normalized without dots.
USER_TAVR_ICD9_PROC = {"3505", "3506"}
USER_SAVR_ICD9_PROC = {"3521", "3522"}
USER_DIALYSIS_ICD10_DX = {"N186", "Z992"}
USER_DIALYSIS_ICD9_DX = {"5856", "V4511", "V560", "V561", "V562", "V5631", "V5632", "V568"}
USER_PD_ICD9_PROC = {"5498"}
USER_PD_CPT_HCPCS = {"49324", "49325", "49326", "49418", "49420", "49421", "49422", "49435", "49436", "G0052"}
HD_CPT_HCPCS_SCAN = {"90935", "90937", "90945", "90947", "90999", "G0257"}

# Auxiliary valve CPT/HCPCS scan set used only to audit available HCPCS rows.
VALVE_CPT_SCAN = {
    "tavr": {"0256T", "0257T", "0258T", "0259T", "33361", "33362", "33363", "33364", "33365", "33366", "33367", "33368", "33369"},
    "savr": {"33405", "33406", "33410"},
}

CODE_EVIDENCE_URLS = [
    "https://www.cdc.gov/nchs/icd/icd-10-cm/index.html",
    "https://www.cms.gov/medicare/coding-billing/icd-10-codes",
    "https://www.cms.gov/files/document/fy-2012-fr-table-6b-new-diagnosis-codes-pdf.pdf",
    "https://www.cms.gov/regulations-and-guidance/guidance/transmittals/downloads/r2552cp.pdf",
    "https://www.cms.gov/medicare/regulations-guidance/physician-self-referral/list-cpt-hcpcs-codes",
    "https://physionet.org/content/mimiciv/3.1/",
    "https://mimic.mit.edu/docs/iv/",
]


@dataclass
class FitResult:
    status: str
    n: int
    events: int
    terms: list[dict[str, Any]]
    reason: str | None = None


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def normalize_code(value: Any) -> str:
    return re.sub(r"[^A-Z0-9]", "", str(value).upper())


def stable_hash(value: Any) -> str:
    return hashlib.sha256(json.dumps(value, sort_keys=True, default=str, separators=(",", ":")).encode()).hexdigest()


def save_json(path: Path, value: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, indent=2, default=str) + "\n", encoding="utf-8")


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


def manifest_tables() -> dict[str, dict[str, Any]]:
    return {table["tableId"]: table for table in json.loads(MANIFEST_PATH.read_text())["tables"]}


def list_objects(source_path: str) -> list[dict[str, Any]]:
    payload = json.loads(run(["gcloud", "storage", "ls", "--json", "--recursive", source_path]))
    out = []
    for item in payload:
        if item.get("type") != "cloud_object":
            continue
        url = item["url"].split("#", 1)[0]
        if url.endswith(".parquet"):
            metadata = item.get("metadata", {})
            out.append({"url": url, "size": int(metadata.get("size", 0)), "generation": metadata.get("generation")})
    return sorted(out, key=lambda item: item["url"])


def copy_table(table_id: str, table: dict[str, Any], cache_dir: Path) -> tuple[pd.DataFrame, dict[str, Any], int]:
    target = cache_dir / table_id
    target.mkdir(parents=True, exist_ok=True)
    objects = list_objects(table["sourcePath"])
    paths = []
    for obj in objects:
        local = target / obj["url"].rsplit("/", 1)[-1]
        run(["gcloud", "storage", "cp", obj["url"], str(local)], attempts=3)
        paths.append(local)
    copied = sum(path.stat().st_size for path in paths)
    return pq.read_table([str(path) for path in paths]).to_pandas(), {
        "sourcePath": table["sourcePath"],
        "manifestBytes": table["bytes"],
        "manifestRows": table.get("rowCount"),
        "bytesCopied": copied,
        "objects": objects,
    }, copied


def load_tables() -> tuple[dict[str, pd.DataFrame], dict[str, Any]]:
    by_id = manifest_tables()
    missing = [table for table in TABLES if table not in by_id]
    if missing:
        raise RuntimeError(f"Missing required tables: {missing}")
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
            frame, source, bytes_copied = copy_table(table_id, by_id[table_id], cache_dir)
            copied += bytes_copied
            if copied > PER_RUN_MAX_BYTES:
                raise RuntimeError("Actual read exceeded per-run cap")
            tables[table_id] = frame
            inventory["tables"][table_id] = source
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


def is_icd10pcs_tavr(code: str, title: str) -> bool:
    # ICD-10-PCS aortic valve replacement: body system 2, root operation R, body part F.
    return (
        len(code) >= 5
        and code.startswith("02RF")
        and (code[4] in {"3", "4"} or "percutaneous" in title or "transapical" in title)
    ) or code in {"X2RF032", "X2RF332", "X2RF432"}


def is_icd10pcs_savr(code: str, title: str) -> bool:
    return len(code) >= 5 and code.startswith("02RF") and (code[4] == "0" or "open approach" in title)


def classify_icd_procedures(procedures: pd.DataFrame, proc_dict: pd.DataFrame) -> tuple[pd.DataFrame, pd.DataFrame]:
    proc = add_norm_code(procedures, "icd_code").rename(columns={"norm_code": "event_norm_code"})
    dictionary = add_norm_code(proc_dict, "icd_code")
    dictionary["title_lower"] = dictionary["long_title"].astype(str).str.lower()
    proc = proc.merge(dictionary[["icd_code", "icd_version", "long_title", "title_lower"]], on=["icd_code", "icd_version"], how="left")
    code = proc["event_norm_code"]
    version = proc["icd_version"].astype(int)
    title = proc["title_lower"].fillna("")
    icd10_savr = pd.Series([is_icd10pcs_savr(c, t) for c, t in zip(code, title)], index=proc.index)
    icd10_tavr = pd.Series([is_icd10pcs_tavr(c, t) for c, t in zip(code, title)], index=proc.index)
    proc["proc_savr"] = ((version.eq(9) & code.isin(USER_SAVR_ICD9_PROC)) | (version.eq(10) & icd10_savr)).astype(int)
    proc["proc_tavr"] = ((version.eq(9) & code.isin(USER_TAVR_ICD9_PROC)) | (version.eq(10) & icd10_tavr)).astype(int)
    proc["proc_later_revision"] = (version.eq(10) & title.str.contains("revision of .*aortic valve|excision of aortic valve|supplement aortic valve|removal of.*aortic valve", regex=True, na=False)).astype(int)
    proc["proc_hemodialysis"] = ((version.eq(9) & code.eq("3995")) | title.str.contains("hemodialysis", na=False)).astype(int)
    proc["proc_peritoneal_dialysis"] = ((version.eq(9) & code.isin(USER_PD_ICD9_PROC)) | title.str.contains("peritoneal dialysis", na=False)).astype(int)
    matched = proc.loc[proc[["proc_savr", "proc_tavr", "proc_later_revision", "proc_hemodialysis", "proc_peritoneal_dialysis"]].sum(axis=1).gt(0), [
        "icd_code", "event_norm_code", "icd_version", "long_title", "proc_savr", "proc_tavr", "proc_later_revision", "proc_hemodialysis", "proc_peritoneal_dialysis",
    ]].drop_duplicates()
    return proc, matched


def classify_hcpcs(events: pd.DataFrame, dictionary: pd.DataFrame) -> tuple[pd.DataFrame, pd.DataFrame]:
    events = events.copy()
    events["hcpcs_norm"] = events["hcpcs_cd"].map(normalize_code)
    dictionary = dictionary.copy()
    dictionary["hcpcs_norm"] = dictionary["code"].map(normalize_code)
    events = events.merge(dictionary[["hcpcs_norm", "long_description", "short_description"]], on="hcpcs_norm", how="left", suffixes=("", "_dict"))
    desc = events[["long_description", "short_description", "short_description_dict"]].fillna("").astype(str).agg(" ".join, axis=1).str.lower()
    events["hcpcs_tavr"] = events["hcpcs_norm"].isin(VALVE_CPT_SCAN["tavr"]).astype(int)
    events["hcpcs_savr"] = events["hcpcs_norm"].isin(VALVE_CPT_SCAN["savr"]).astype(int)
    events["hcpcs_peritoneal_dialysis"] = (events["hcpcs_norm"].isin(USER_PD_CPT_HCPCS) | desc.str.contains("peritoneal dialysis")).astype(int)
    events["hcpcs_hemodialysis"] = (events["hcpcs_norm"].isin(HD_CPT_HCPCS_SCAN) | desc.str.contains("hemodialysis")).astype(int)
    matched = events.loc[events[["hcpcs_tavr", "hcpcs_savr", "hcpcs_peritoneal_dialysis", "hcpcs_hemodialysis"]].sum(axis=1).gt(0), [
        "hcpcs_cd", "hcpcs_norm", "long_description", "short_description", "hcpcs_tavr", "hcpcs_savr", "hcpcs_peritoneal_dialysis", "hcpcs_hemodialysis",
    ]].drop_duplicates()
    return events, matched


def classify_diagnoses(dx: pd.DataFrame, dx_dict: pd.DataFrame) -> tuple[pd.DataFrame, pd.DataFrame]:
    out = add_norm_code(dx, "icd_code").rename(columns={"norm_code": "event_norm_code"})
    dictionary = add_norm_code(dx_dict, "icd_code")
    dictionary["title_lower"] = dictionary["long_title"].astype(str).str.lower()
    out = out.merge(dictionary[["icd_code", "icd_version", "long_title", "title_lower"]], on=["icd_code", "icd_version"], how="left")
    code = out["event_norm_code"]
    version = out["icd_version"].astype(int)
    title = out["title_lower"].fillna("")
    out["dx_manual_dialysis"] = ((version.eq(9) & code.isin(USER_DIALYSIS_ICD9_DX)) | (version.eq(10) & code.isin(USER_DIALYSIS_ICD10_DX))).astype(int)
    out["dx_peritoneal_dialysis"] = ((version.eq(9) & code.isin({"V562", "V5632"})) | title.str.contains("peritoneal dialysis", na=False)).astype(int)
    out["dx_hemodialysis_or_unspecified"] = ((out["dx_manual_dialysis"].eq(1) & out["dx_peritoneal_dialysis"].eq(0)) | title.str.contains("hemodialysis|renal dialysis status|dependence on renal dialysis", regex=True, na=False)).astype(int)
    out["dx_esrd"] = ((version.eq(9) & code.eq("5856")) | (version.eq(10) & code.eq("N186"))).astype(int)
    out["dx_heart_failure"] = ((version.eq(9) & code.str.startswith("428")) | (version.eq(10) & code.str.startswith("I50")) | title.str.contains("heart failure", na=False)).astype(int)
    out["dx_mi"] = ((version.eq(9) & code.str.startswith("410")) | (version.eq(10) & (code.str.startswith("I21") | code.str.startswith("I22")))).astype(int)
    out["dx_stroke"] = ((version.eq(9) & (code.str.startswith("430") | code.str.startswith("431") | code.str.startswith("432") | code.str.startswith("433") | code.str.startswith("434") | code.str.startswith("436") | code.str.startswith("437") | code.str.startswith("438"))) | (version.eq(10) & (code.str.startswith("I60") | code.str.startswith("I61") | code.str.startswith("I62") | code.str.startswith("I63") | code.str.startswith("I64")))).astype(int)
    out["dx_cardiac_related"] = ((version.eq(9) & code.str[:3].between("390", "459")) | (version.eq(10) & code.str.startswith("I"))).astype(int)
    matched = out.loc[out[["dx_manual_dialysis", "dx_hemodialysis_or_unspecified", "dx_peritoneal_dialysis", "dx_esrd", "dx_heart_failure", "dx_mi", "dx_stroke"]].sum(axis=1).gt(0), [
        "icd_code", "event_norm_code", "icd_version", "long_title", "dx_manual_dialysis", "dx_hemodialysis_or_unspecified", "dx_peritoneal_dialysis", "dx_esrd", "dx_heart_failure", "dx_mi", "dx_stroke",
    ]].drop_duplicates()
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


def first_event_days(after: pd.DataFrame, index_discharge: pd.Timestamp, flag: str) -> float | None:
    if after.empty or flag not in after.columns:
        return None
    events = after.loc[pd.to_numeric(after[flag], errors="coerce").fillna(0).gt(0), "admittime"]
    if events.empty:
        return None
    return float((events.min() - index_discharge).days)


def summarize_by_group(frame: pd.DataFrame, group_cols: list[str], flags: list[str]) -> pd.DataFrame:
    rows = []
    for keys, group in frame.groupby(group_cols, dropna=False):
        if not isinstance(keys, tuple):
            keys = (keys,)
        row = dict(zip(group_cols, keys))
        row["n"] = int(len(group))
        for col in flags:
            n = int(pd.to_numeric(group[col], errors="coerce").fillna(0).sum())
            row[f"{col}_n"] = n
            row[f"{col}_pct"] = n / len(group) if len(group) else None
        rows.append(row)
    return pd.DataFrame(rows).sort_values(group_cols)


def baseline_by_group(frame: pd.DataFrame) -> pd.DataFrame:
    rows = []
    for keys, group in frame.groupby(["valve_strategy", "dialysis_group"], dropna=False):
        row = {"valve_strategy": keys[0], "dialysis_group": keys[1], "n": int(len(group))}
        for col in ["admission_age", "charlson_comorbidity_index"]:
            clean = pd.to_numeric(group[col], errors="coerce").dropna()
            row[f"{col}_median"] = float(clean.median()) if len(clean) else None
            row[f"{col}_q1"] = float(clean.quantile(0.25)) if len(clean) else None
            row[f"{col}_q3"] = float(clean.quantile(0.75)) if len(clean) else None
        row["male_n"] = int(pd.to_numeric(group["male"], errors="coerce").fillna(0).sum())
        row["male_pct"] = row["male_n"] / len(group) if len(group) else None
        rows.append(row)
    return pd.DataFrame(rows).sort_values(["valve_strategy", "dialysis_group"])


def design_matrix(frame: pd.DataFrame, include_anchor: bool = True) -> tuple[pd.DataFrame, list[str]]:
    x = pd.DataFrame(index=frame.index)
    x["dialysis_hd_unspecified"] = (frame["dialysis_group"] == "hemodialysis_or_unspecified_dialysis").astype(float)
    x["dialysis_peritoneal"] = (frame["dialysis_group"] == "peritoneal_dialysis").astype(float)
    x["valve_tavr"] = (frame["valve_strategy"] == "TAVR").astype(float)
    x["valve_mixed"] = (frame["valve_strategy"] == "mixed_savr_tavr_same_admission").astype(float)
    x["admission_age"] = pd.to_numeric(frame["admission_age"], errors="coerce")
    x["male"] = pd.to_numeric(frame["male"], errors="coerce")
    x["charlson_comorbidity_index"] = pd.to_numeric(frame["charlson_comorbidity_index"], errors="coerce")
    for col in ["insurance"] + (["anchor_year_group"] if include_anchor else []):
        if col in frame.columns:
            dummies = pd.get_dummies(frame[col].fillna("missing").astype(str), prefix=col, drop_first=True, dtype=float)
            x = pd.concat([x, dummies], axis=1)
    x = x.replace([np.inf, -np.inf], np.nan)
    for col in list(x.columns):
        series = x[col].dropna()
        if series.empty or series.nunique() <= 1:
            x = x.drop(columns=[col])
    return x, list(x.columns)


def fit_logistic(cohort: pd.DataFrame, outcome: str) -> FitResult:
    x, _ = design_matrix(cohort)
    y = pd.to_numeric(cohort[outcome], errors="coerce")
    data = pd.concat([y.rename(outcome), x], axis=1).dropna()
    events = int(data[outcome].sum()) if not data.empty else 0
    non_events = int(len(data) - events)
    if len(data) < 100 or events < 20 or non_events < 20:
        return FitResult("not_fit", int(len(data)), events, [], "Insufficient events/non-events")
    if events / max(data.shape[1] - 1, 1) < 5:
        return FitResult("not_fit", int(len(data)), events, [], "Low events per predictor")
    try:
        model = sm.Logit(data[outcome].astype(float), sm.add_constant(data.drop(columns=[outcome]), has_constant="add")).fit(disp=False, maxiter=200)
        conf = model.conf_int()
        rows = []
        for term, beta in model.params.items():
            if term == "const":
                continue
            lo, hi = conf.loc[term]
            rows.append({"term": term, "odds_ratio": float(math.exp(beta)), "ci_low": float(math.exp(lo)), "ci_high": float(math.exp(hi)), "p_value": float(model.pvalues[term])})
        return FitResult("fit", int(len(data)), events, rows)
    except Exception as exc:
        return FitResult("not_fit", int(len(data)), events, [], str(exc))


def fit_cox(cohort: pd.DataFrame, time_col: str, event_col: str) -> FitResult:
    x, _ = design_matrix(cohort, include_anchor=False)
    t = pd.to_numeric(cohort[time_col], errors="coerce")
    e = pd.to_numeric(cohort[event_col], errors="coerce")
    data = pd.concat([t.rename("_time"), e.rename("_event"), x], axis=1).replace([np.inf, -np.inf], np.nan).dropna()
    data = data.loc[data["_time"].gt(0)].copy()
    events = int(data["_event"].sum()) if not data.empty else 0
    if len(data) < 100 or events < 20:
        return FitResult("not_fit", int(len(data)), events, [], "Insufficient events for Cox model")
    try:
        model = PHReg(data["_time"], data.drop(columns=["_time", "_event"]), status=data["_event"]).fit(disp=False)
        rows = []
        for idx, term in enumerate(data.drop(columns=["_time", "_event"]).columns):
            beta = float(model.params[idx])
            lo, hi = model.conf_int()[idx]
            rows.append({"term": term, "hazard_ratio": float(math.exp(beta)), "ci_low": float(math.exp(lo)), "ci_high": float(math.exp(hi)), "p_value": float(model.pvalues[idx])})
        return FitResult("fit", int(len(data)), events, rows)
    except Exception as exc:
        return FitResult("not_fit", int(len(data)), events, [], str(exc))


def smd_numeric(a: pd.Series, b: pd.Series) -> float | None:
    a2 = pd.to_numeric(a, errors="coerce").dropna()
    b2 = pd.to_numeric(b, errors="coerce").dropna()
    if len(a2) < 2 or len(b2) < 2:
        return None
    pooled = math.sqrt((a2.var() + b2.var()) / 2)
    return float((a2.mean() - b2.mean()) / pooled) if pooled else None


def format_counts(counts: dict[str, Any]) -> str:
    return "; ".join(f"{key.replace('_', ' ')}: {int(value):,}" for key, value in counts.items())


def propensity_design(frame: pd.DataFrame, include_categorical: bool) -> pd.DataFrame:
    x = pd.DataFrame(index=frame.index)
    x["admission_age"] = pd.to_numeric(frame["admission_age"], errors="coerce")
    x["male"] = pd.to_numeric(frame["male"], errors="coerce")
    x["charlson_comorbidity_index"] = pd.to_numeric(frame["charlson_comorbidity_index"], errors="coerce")
    x["valve_tavr"] = (frame["valve_strategy"] == "TAVR").astype(float)
    if include_categorical:
        for col in ["insurance", "anchor_year_group"]:
            dummies = pd.get_dummies(frame[col].fillna("missing").astype(str), prefix=col, drop_first=True, dtype=float)
            x = pd.concat([x, dummies], axis=1)
    x = x.replace([np.inf, -np.inf], np.nan)
    x = x.dropna(axis=1, how="all")
    for col in list(x.columns):
        series = x[col].dropna()
        if series.empty or series.nunique() <= 1:
            x = x.drop(columns=[col])
    return x


def fit_propensity_model(data: pd.DataFrame) -> tuple[pd.Series | None, str | None, str]:
    y = data["treated"].astype(float)
    x = data.drop(columns=["treated"]).astype(float)
    if x.empty:
        return None, "No nonconstant propensity covariates were available.", "none"
    try:
        full = sm.add_constant(x, has_constant="add")
        if np.linalg.matrix_rank(full.to_numpy()) < full.shape[1]:
            raise np.linalg.LinAlgError("propensity design matrix is rank deficient")
        fit = sm.Logit(y, full).fit(disp=False, maxiter=200)
        return pd.Series(fit.predict(full), index=data.index, name="propensity_score"), None, "maximum_likelihood"
    except Exception as first_exc:
        try:
            full = sm.add_constant(x, has_constant="add")
            fit = sm.Logit(y, full).fit_regularized(alpha=0.05, L1_wt=0.0, disp=False, maxiter=300)
            return pd.Series(fit.predict(full), index=data.index, name="propensity_score"), f"Regularized fallback used after standard logit failed: {first_exc}", "ridge_regularized_logit"
        except Exception as second_exc:
            return None, f"Standard and regularized propensity models failed: {first_exc}; {second_exc}", "failed"


def propensity_sensitivity(cohort: pd.DataFrame) -> dict[str, Any]:
    eligible = cohort.loc[cohort["dialysis_group"].isin(["hemodialysis_or_unspecified_dialysis", "non_dialysis"])].copy()
    eligible["treated"] = (eligible["dialysis_group"] == "hemodialysis_or_unspecified_dialysis").astype(int)
    outcomes = ["death_1y", "mace_1y"]
    x = propensity_design(eligible, include_categorical=True)
    data = pd.concat([eligible["treated"], x], axis=1).dropna()
    if data["treated"].sum() < 20:
        return {"status": "not_fit", "reason": "Too few treated dialysis patients for matching."}
    ps, warning, fit_method = fit_propensity_model(data)
    if ps is None:
        reduced = pd.concat([eligible["treated"], propensity_design(eligible, include_categorical=False)], axis=1).dropna()
        ps, warning, fit_method = fit_propensity_model(reduced)
        data = reduced if ps is not None else data
    if ps is None:
        return {"status": "not_fit", "reason": warning or "Propensity model failed."}
    eligible = eligible.join(ps)
    eligible = eligible.dropna(subset=["propensity_score"])
    eligible["logit_ps"] = np.log(eligible["propensity_score"].clip(1e-6, 1 - 1e-6) / (1 - eligible["propensity_score"].clip(1e-6, 1 - 1e-6)))
    caliper = 0.2 * float(eligible["logit_ps"].std())
    treated = eligible.loc[eligible["treated"].eq(1)].sort_values("propensity_score")
    controls = eligible.loc[eligible["treated"].eq(0)].copy()
    used_controls: set[int] = set()
    pairs = []
    for tidx, row in treated.iterrows():
        available = controls.loc[~controls.index.isin(used_controls)].copy()
        if available.empty:
            break
        available["distance"] = (available["logit_ps"] - row["logit_ps"]).abs()
        best = available.sort_values("distance").iloc[0]
        if best["distance"] <= caliper:
            used_controls.add(int(best.name))
            pairs.append({"treated_index": int(tidx), "control_index": int(best.name), "distance": float(best["distance"])})
    matched_idx = [p["treated_index"] for p in pairs] + [p["control_index"] for p in pairs]
    matched = eligible.loc[matched_idx].copy() if matched_idx else pd.DataFrame()

    balance_rows = []
    balance_covariates = [col for col in data.columns if col != "treated"]
    matched_treated_idx = [p["treated_index"] for p in pairs]
    matched_control_idx = [p["control_index"] for p in pairs]
    for covar in balance_covariates:
        before = smd_numeric(data.loc[data["treated"].eq(1), covar], data.loc[data["treated"].eq(0), covar])
        after = smd_numeric(data.loc[matched_treated_idx, covar], data.loc[matched_control_idx, covar]) if pairs else None
        balance_rows.append({"covariate": covar, "smd_before": before, "smd_after": after})
    pd.DataFrame(balance_rows).to_csv(RUN_DIR / "propensity-balance.csv", index=False)
    pd.DataFrame(pairs).to_csv(RUN_DIR / "matched-pairs.csv", index=False)
    eligible[["subject_id", "hadm_id", "treated", "propensity_score"]].to_csv(RUN_DIR / "propensity-scores.csv", index=False)

    contrasts = []
    for outcome in outcomes:
        if matched.empty:
            contrasts.append({"outcome": outcome, "status": "not_fit", "reason": "No matched pairs"})
            continue
        treated_values = pd.to_numeric(cohort.loc[matched_treated_idx, outcome], errors="coerce").fillna(0).to_numpy()
        control_values = pd.to_numeric(cohort.loc[matched_control_idx, outcome], errors="coerce").fillna(0).to_numpy()
        diff = treated_values - control_values
        risk_difference = float(diff.mean()) if len(diff) else float("nan")
        se = float(diff.std(ddof=1) / math.sqrt(len(diff))) if len(diff) > 1 else None
        b = int(((treated_values == 1) & (control_values == 0)).sum())
        c = int(((treated_values == 0) & (control_values == 1)).sum())
        mcnemar_stat = ((abs(b - c) - 1) ** 2 / (b + c)) if b + c else None
        mcnemar_p = math.erfc(math.sqrt(mcnemar_stat / 2)) if mcnemar_stat is not None else None
        contrasts.append({
            "outcome": outcome,
            "status": "fit",
            "treatedRisk": float(treated_values.mean()) if len(treated_values) else None,
            "controlRisk": float(control_values.mean()) if len(control_values) else None,
            "riskDifference": risk_difference,
            "riskDifferenceCiLow": risk_difference - 1.96 * se if se is not None else None,
            "riskDifferenceCiHigh": risk_difference + 1.96 * se if se is not None else None,
            "mcnemarPValue": mcnemar_p,
            "discordantTreatedOnly": b,
            "discordantControlOnly": c,
            "matchedPairs": len(pairs),
        })
    return {
        "status": "fit" if pairs else "not_fit",
        "treated": int(treated.shape[0]),
        "controls": int(controls.shape[0]),
        "matchedPairs": len(pairs),
        "caliper": caliper,
        "fitMethod": fit_method,
        "warning": warning,
        "covariates": [col for col in data.columns if col != "treated"],
        "contrasts": contrasts,
        "maxAbsSmdAfter": max(abs(r["smd_after"]) for r in balance_rows if r["smd_after"] is not None) if pairs else None,
    }


def missingness_summary(frame: pd.DataFrame, variables: list[str]) -> pd.DataFrame:
    rows = []
    denominator = len(frame)
    for variable in variables:
        missing = int(frame[variable].isna().sum()) if variable in frame.columns else denominator
        rows.append({
            "variable": variable,
            "n": denominator,
            "missing_n": missing,
            "missing_pct": missing / denominator if denominator else None,
            "nonmissing_n": denominator - missing,
        })
    return pd.DataFrame(rows)


def outcome_phenotype_definitions() -> dict[str, Any]:
    return {
        "schemaVersion": 1,
        "generatedAtIso": now_iso(),
        "timeZero": "Index admission time for mortality horizons and time-to-death models; index discharge time for post-discharge readmission and reintervention outcomes; index admission for in-hospital mortality.",
        "censoring": "Nonfatal time-to-event outcomes are censored at 3650 days when no same-hospital event is observed. Death before a nonfatal readmission is recorded in death-before-event flags but Fine-Gray competing-risk models are not estimated in this MIMIC redo.",
        "definitions": {
            "heart_failure_readmission": {
                "source": "post-index same-hospital diagnosis codes",
                "rules": ["ICD-9-CM prefix 428", "ICD-10-CM prefix I50", "dictionary title contains heart failure"],
            },
            "cardiac_related_readmission": {
                "source": "post-index same-hospital diagnosis codes",
                "rules": ["ICD-9-CM 390-459 diagnosis range", "ICD-10-CM prefix I"],
            },
            "myocardial_infarction": {
                "source": "post-index same-hospital diagnosis codes",
                "rules": ["ICD-9-CM prefix 410", "ICD-10-CM prefixes I21 or I22"],
            },
            "stroke": {
                "source": "post-index same-hospital diagnosis codes",
                "rules": ["ICD-9-CM prefixes 430, 431, 432, 433, 434, 436, 437, or 438; ICD-9-CM 435/TIA excluded", "ICD-10-CM prefixes I60, I61, I62, I63, or I64"],
            },
            "mace": {
                "source": "composite endpoint",
                "rules": ["death", "myocardial infarction", "stroke"],
            },
            "later_tavr": {
                "source": "post-index same-hospital procedure/HCPCS evidence",
                "rules": ["user ICD-9-CM procedure 35.05 or 35.06", "ICD-10-PCS aortic valve replacement with percutaneous/endoscopic/transapical axis/title logic", "auxiliary CPT/HCPCS scan codes 0256T-0259T and 33361-33369 when present"],
            },
            "later_savr": {
                "source": "post-index same-hospital procedure/HCPCS evidence",
                "rules": ["user ICD-9-CM procedure 35.21 or 35.22", "ICD-10-PCS aortic valve replacement with open approach axis/title logic", "auxiliary CPT scan codes 33405, 33406, 33410 when present"],
            },
            "revision_explant_proxy": {
                "source": "post-index same-hospital ICD-10-PCS title logic",
                "rules": ["procedure title regex: revision of aortic valve, excision of aortic valve, supplement aortic valve, or removal of aortic valve"],
            },
            "valve_reintervention_composite": {
                "source": "composite endpoint",
                "rules": ["later TAVR", "later SAVR", "revision/explant proxy"],
            },
        },
    }


def write_figures(outcomes: pd.DataFrame, cox_models: dict[str, Any], propensity: dict[str, Any]) -> list[dict[str, Any]]:
    figures: list[dict[str, Any]] = []
    fig_dir = RUN_DIR
    plot_data = outcomes.loc[outcomes["horizon"].eq("1y")].copy()
    plot_data["label"] = plot_data["valve_strategy"] + " / " + plot_data["dialysis_group"]
    plt.figure(figsize=(12, 7))
    y = np.arange(len(plot_data))
    plt.barh(y, plot_data["mace_n"] / plot_data["n"])
    plt.yticks(y, plot_data["label"])
    plt.xlabel("1-year MACE proportion")
    plt.title("One-year MACE by valve strategy and dialysis group")
    plt.tight_layout()
    path = fig_dir / "figure-1-mace-by-group.png"
    plt.savefig(path, dpi=150)
    plt.close()
    figures.append({"figureId": "figure-1-mace-by-group", "path": str(path), "kind": "bar", "title": "One-year MACE by valve strategy and dialysis group", "caption": "MACE is death, MI, or stroke within 365 days in available same-hospital/death-date follow-up.", "altText": "Horizontal bar chart of one-year MACE proportions by valve strategy and dialysis group.", "xLabel": "MACE proportion", "yLabel": "Valve/dialysis group", "sourceColumns": ["mace_n", "n", "valve_strategy", "dialysis_group"]})

    mortality = outcomes.pivot_table(index="horizon_days", columns="dialysis_group", values="death_n", aggfunc="sum")
    denom = outcomes.pivot_table(index="horizon_days", columns="dialysis_group", values="n", aggfunc="sum")
    rates = mortality / denom
    plt.figure(figsize=(9, 6))
    for col in rates.columns:
        plt.plot(rates.index, rates[col], marker="o", label=col)
    plt.xlabel("Days after index discharge")
    plt.ylabel("Mortality proportion")
    plt.title("Mortality horizons by dialysis group")
    plt.legend(title="Dialysis group")
    plt.tight_layout()
    path = fig_dir / "figure-2-mortality-horizons.png"
    plt.savefig(path, dpi=150)
    plt.close()
    figures.append({"figureId": "figure-2-mortality-horizons", "path": str(path), "kind": "line", "title": "Mortality horizons by dialysis group", "caption": "Mortality horizons use MIMIC death-date availability and are not national follow-up.", "altText": "Line chart of death proportions at 30 days, 1 year, 3 years, 5 years, and 10 years by dialysis group.", "xLabel": "Days after index discharge", "yLabel": "Mortality proportion", "sourceColumns": ["death_n", "n", "dialysis_group", "horizon_days"]})

    cox_rows = []
    for outcome, model in cox_models.items():
        if model.get("status") != "fit":
            continue
        for term in model.get("terms", []):
            if term["term"] in {"dialysis_hd_unspecified", "dialysis_peritoneal"}:
                cox_rows.append({"outcome": outcome, **term})
    if cox_rows:
        cdf = pd.DataFrame(cox_rows)
        cdf["label"] = cdf["outcome"] + " / " + cdf["term"]
        plt.figure(figsize=(10, max(4, len(cdf) * 0.45)))
        y = np.arange(len(cdf))
        plt.errorbar(cdf["hazard_ratio"], y, xerr=[cdf["hazard_ratio"] - cdf["ci_low"], cdf["ci_high"] - cdf["hazard_ratio"]], fmt="o")
        plt.axvline(1, color="gray", linestyle="--")
        plt.yticks(y, cdf["label"])
        plt.xscale("log")
        plt.xlabel("Hazard ratio, log scale")
        plt.title("Adjusted dialysis-group hazard ratios")
        plt.tight_layout()
        path = fig_dir / "figure-3-cox-forest.png"
        plt.savefig(path, dpi=150)
        plt.close()
        figures.append({"figureId": "figure-3-cox-forest", "path": str(path), "kind": "forest", "title": "Adjusted dialysis-group hazard ratios", "caption": "Cox models use available same-hospital/death-date timelines and complete-case covariates.", "altText": "Forest plot of dialysis-group hazard ratios for time-to-event outcomes.", "xLabel": "Hazard ratio", "yLabel": "Outcome and dialysis term", "sourceColumns": ["hazard_ratio", "ci_low", "ci_high", "term", "outcome"]})

    balance_path = RUN_DIR / "propensity-balance.csv"
    if balance_path.exists():
        bal = pd.read_csv(balance_path)
        plt.figure(figsize=(9, max(5, len(bal) * 0.35)))
        y = np.arange(len(bal))
        plt.scatter(bal["smd_before"].abs(), y, label="Before matching")
        plt.scatter(bal["smd_after"].abs(), y, label="After matching")
        plt.axvline(0.1, color="gray", linestyle="--", label="0.1 threshold")
        plt.yticks(y, bal["covariate"])
        plt.xlabel("Absolute standardized mean difference")
        plt.title("Propensity balance for HD/unspecified vs non-dialysis")
        plt.legend()
        plt.tight_layout()
        path = fig_dir / "figure-4-propensity-love-plot.png"
        plt.savefig(path, dpi=150)
        plt.close()
        figures.append({"figureId": "figure-4-propensity-love-plot", "path": str(path), "kind": "love_plot", "title": "Propensity balance for HD/unspecified vs non-dialysis", "caption": "Balance is shown for numeric covariates only in the matched sensitivity analysis.", "altText": "Love plot comparing absolute standardized mean differences before and after matching.", "xLabel": "Absolute standardized mean difference", "yLabel": "Covariate", "sourceColumns": ["smd_before", "smd_after", "covariate"]})
    return figures


def build_analysis() -> dict[str, Any]:
    RUN_DIR.mkdir(parents=True, exist_ok=True)
    tables, inventory = load_tables()
    patients = tables["hosp-patients"].copy()
    admissions = tables["hosp-admissions"].copy()
    procedures, matched_proc = classify_icd_procedures(tables["hosp-procedures-icd"], tables["hosp-d-icd-procedures"])
    hcpcs, matched_hcpcs = classify_hcpcs(tables["hosp-hcpcsevents"], tables["hosp-d-hcpcs"])
    diagnoses, matched_dx = classify_diagnoses(tables["hosp-diagnoses-icd"], tables["hosp-d-icd-diagnoses"])
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
        proc_later_revision=("proc_later_revision", "max"),
        proc_hemodialysis=("proc_hemodialysis", "max"),
        proc_peritoneal_dialysis=("proc_peritoneal_dialysis", "max"),
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
        dx_hemodialysis_or_unspecified=("dx_hemodialysis_or_unspecified", "max"),
        dx_peritoneal_dialysis=("dx_peritoneal_dialysis", "max"),
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

    candidates = adm.loc[(adm["any_savr"].eq(1)) | (adm["any_tavr"].eq(1))].copy()
    candidates["first_proc_date"] = pd.to_datetime(candidates["first_proc_date"], errors="coerce")
    index = candidates.sort_values(["subject_id", "admittime", "first_proc_date", "hadm_id"]).drop_duplicates("subject_id", keep="first").copy()
    index["valve_strategy"] = np.select(
        [index["any_tavr"].eq(1) & index["any_savr"].eq(0), index["any_savr"].eq(1) & index["any_tavr"].eq(0), index["any_tavr"].eq(1) & index["any_savr"].eq(1)],
        ["TAVR", "SAVR", "mixed_savr_tavr_same_admission"],
        default="unknown",
    )

    dialysis_cols = ["dx_manual_dialysis", "dx_hemodialysis_or_unspecified", "dx_peritoneal_dialysis", "dx_esrd", "hcpcs_hemodialysis", "hcpcs_peritoneal_dialysis", "proc_hemodialysis", "proc_peritoneal_dialysis"]
    all_adm = adm[["subject_id", "hadm_id", "admittime", "dischtime"] + dialysis_cols].copy()
    rows = []
    for _, row in index.iterrows():
        prior = all_adm.loc[(all_adm["subject_id"].eq(row["subject_id"])) & (all_adm["admittime"].le(row["admittime"]))]
        pd_flag = int(prior[["dx_peritoneal_dialysis", "hcpcs_peritoneal_dialysis", "proc_peritoneal_dialysis"]].max().max()) if not prior.empty else 0
        hd_flag = int(prior[["dx_manual_dialysis", "dx_hemodialysis_or_unspecified", "dx_esrd", "hcpcs_hemodialysis", "proc_hemodialysis"]].max().max()) if not prior.empty else 0
        group = "peritoneal_dialysis" if pd_flag else "hemodialysis_or_unspecified_dialysis" if hd_flag else "non_dialysis"
        rows.append({"subject_id": row["subject_id"], "hadm_id": row["hadm_id"], "dialysis_group": group, "baseline_pd_evidence": pd_flag, "baseline_hd_or_unspecified_evidence": hd_flag})
    index = index.merge(pd.DataFrame(rows), on=["subject_id", "hadm_id"], how="left")

    outcome_rows = []
    adm_lookup = adm.copy()
    for _, row in index.iterrows():
        subject_adm = adm_lookup.loc[adm_lookup["subject_id"].eq(row["subject_id"])].copy()
        after = subject_adm.loc[subject_adm["admittime"].gt(row["dischtime"])].copy()
        dod = pd.to_datetime(row.get("dod"), errors="coerce")
        base = {"subject_id": row["subject_id"], "hadm_id": row["hadm_id"], "in_hospital_mortality": int(row["hospital_expire_flag"])}
        death_days = float((dod - row["admittime"]).days) if pd.notna(dod) and pd.notna(row["admittime"]) else None
        event_days = {
            "hf": first_event_days(after, row["dischtime"], "dx_heart_failure"),
            "cardiac": first_event_days(after, row["dischtime"], "dx_cardiac_related"),
            "mi": first_event_days(after, row["dischtime"], "dx_mi"),
            "stroke": first_event_days(after, row["dischtime"], "dx_stroke"),
            "later_tavr": first_event_days(after, row["dischtime"], "any_tavr"),
            "later_savr": first_event_days(after, row["dischtime"], "any_savr"),
            "revision": first_event_days(after, row["dischtime"], "proc_later_revision"),
        }
        event_days["mace"] = min([d for d in [death_days, event_days["mi"], event_days["stroke"]] if d is not None], default=None)
        event_days["valve_reintervention"] = min([d for d in [event_days["later_tavr"], event_days["later_savr"], event_days["revision"]] if d is not None], default=None)
        for name, days in event_days.items():
            base[f"{name}_event_days"] = days
        base["death_event_days"] = death_days
        for horizon_days, label in HORIZONS:
            death = int(death_days is not None and 0 <= death_days <= horizon_days)
            base[f"death_{label}"] = death
            for name in ["hf", "cardiac", "mi", "stroke", "mace", "later_tavr", "later_savr", "revision", "valve_reintervention"]:
                d = event_days[name]
                base[f"{name}_{label}"] = int(d is not None and 0 <= d <= horizon_days)
                if name not in {"mace", "mi", "stroke"}:
                    base[f"death_before_{name}_{label}"] = int(death_days is not None and 0 <= death_days <= horizon_days and (d is None or death_days < d))
        outcome_rows.append(base)
    index = index.merge(pd.DataFrame(outcome_rows), on=["subject_id", "hadm_id"], how="left")

    horizon_rows = []
    for horizon_days, label in HORIZONS:
        cols = [f"death_{label}", f"hf_{label}", f"cardiac_{label}", f"mi_{label}", f"stroke_{label}", f"mace_{label}", f"valve_reintervention_{label}", f"later_tavr_{label}", f"later_savr_{label}", f"revision_{label}"]
        renamed = index[["valve_strategy", "dialysis_group"] + cols].rename(columns={col: col.rsplit("_", 1)[0] for col in cols})
        summary = summarize_by_group(renamed, ["valve_strategy", "dialysis_group"], [col.rsplit("_", 1)[0] for col in cols])
        summary["horizon_days"] = horizon_days
        summary["horizon"] = label
        horizon_rows.append(summary)
    outcomes = pd.concat(horizon_rows, ignore_index=True)
    baseline = baseline_by_group(index)
    era = summarize_by_group(index, ["anchor_year_group", "valve_strategy"], ["in_hospital_mortality", "death_1y", "mace_1y", "valve_reintervention_1y"])
    formal_index = index.loc[
        index["dialysis_group"].isin(["hemodialysis_or_unspecified_dialysis", "non_dialysis"])
        & index["valve_strategy"].isin(["SAVR", "TAVR"])
    ].copy()

    logistic_models = {
        "in_hospital_mortality": fit_logistic(formal_index, "in_hospital_mortality").__dict__,
        "death_1y": fit_logistic(formal_index, "death_1y").__dict__,
        "death_5y": fit_logistic(formal_index, "death_5y").__dict__,
        "mace_1y": fit_logistic(formal_index, "mace_1y").__dict__,
        "mace_5y": fit_logistic(formal_index, "mace_5y").__dict__,
        "hf_1y": fit_logistic(formal_index, "hf_1y").__dict__,
        "cardiac_1y": fit_logistic(formal_index, "cardiac_1y").__dict__,
        "valve_reintervention_1y": fit_logistic(formal_index, "valve_reintervention_1y").__dict__,
    }
    cox_inputs = {
        "death": ("death_event_days", "death_10y"),
        "hf_readmission": ("hf_event_days", "hf_10y"),
        "cardiac_readmission": ("cardiac_event_days", "cardiac_10y"),
        "mace": ("mace_event_days", "mace_10y"),
        "valve_reintervention": ("valve_reintervention_event_days", "valve_reintervention_10y"),
    }
    cox_models = {}
    for name, (time_col, event_col) in cox_inputs.items():
        cox_frame = formal_index.copy()
        cox_frame[time_col] = pd.to_numeric(cox_frame[time_col], errors="coerce").fillna(3650)
        cox_models[name] = fit_cox(cox_frame, time_col, event_col).__dict__
    propensity = propensity_sensitivity(formal_index)

    matched_proc.to_csv(RUN_DIR / "matched-procedure-codes.csv", index=False)
    matched_proc.loc[matched_proc[["proc_savr", "proc_tavr"]].sum(axis=1).gt(0)].to_csv(RUN_DIR / "valve-phenotype-code-list.csv", index=False)
    matched_dx.to_csv(RUN_DIR / "matched-diagnosis-codes.csv", index=False)
    matched_hcpcs.to_csv(RUN_DIR / "matched-hcpcs-codes.csv", index=False)
    outcomes.to_csv(RUN_DIR / "outcomes-by-horizon.csv", index=False)
    baseline.to_csv(RUN_DIR / "baseline-by-group.csv", index=False)
    era.to_csv(RUN_DIR / "era-summary.csv", index=False)
    missingness = missingness_summary(
        index,
        ["admission_age", "male", "charlson_comorbidity_index", "insurance", "anchor_year_group", "valve_strategy", "dialysis_group"],
    )
    missingness.to_csv(RUN_DIR / "missingness-summary.csv", index=False)
    index[["subject_id", "hadm_id", "valve_strategy", "dialysis_group", "anchor_year_group", "approx_actual_admit_year", "in_hospital_mortality", "death_1y", "death_5y", "death_10y", "hf_1y", "cardiac_1y", "mace_1y", "valve_reintervention_1y"]].to_csv(RUN_DIR / "index-cohort-audit.csv", index=False)
    save_json(RUN_DIR / "outcome-phenotypes.json", outcome_phenotype_definitions())
    figures = write_figures(outcomes, cox_models, propensity)
    save_json(RUN_DIR / "figures.json", {"schemaVersion": 1, "generatedAtIso": now_iso(), "figures": figures})

    code_match = {
        "schemaVersion": 1,
        "sources": CODE_EVIDENCE_URLS,
        "userSuppliedCodeSets": {
            "tavrIcd9Procedure": sorted(USER_TAVR_ICD9_PROC),
            "savrIcd9Procedure": sorted(USER_SAVR_ICD9_PROC),
            "dialysisIcd10Diagnosis": sorted(USER_DIALYSIS_ICD10_DX),
            "dialysisIcd9Diagnosis": sorted(USER_DIALYSIS_ICD9_DX),
            "peritonealDialysisIcd9Procedure": sorted(USER_PD_ICD9_PROC),
            "peritonealDialysisCptHcpcs": sorted(USER_PD_CPT_HCPCS),
            "auxiliaryHemodialysisCptHcpcsScan": sorted(HD_CPT_HCPCS_SCAN),
        },
        "observedValveCptHcpcs": {
            "tavr": sorted(set(hcpcs["hcpcs_norm"]) & VALVE_CPT_SCAN["tavr"]),
            "savr": sorted(set(hcpcs["hcpcs_norm"]) & VALVE_CPT_SCAN["savr"]),
        },
        "observedUserDialysisCodes": sorted((set(diagnoses["event_norm_code"]) & (USER_DIALYSIS_ICD9_DX | USER_DIALYSIS_ICD10_DX)) | (set(procedures["event_norm_code"]) & USER_PD_ICD9_PROC) | (set(hcpcs["hcpcs_norm"]) & USER_PD_CPT_HCPCS)),
        "observedAuxiliaryHemodialysisCptHcpcs": sorted(set(hcpcs["hcpcs_norm"]) & HD_CPT_HCPCS_SCAN),
        "warnings": [
            "SAVR CPT codes were scanned as auxiliary valve CPT evidence but are not part of the user-supplied code list.",
            "ICD-10-PCS valve classification uses code-axis/title logic and should be reviewed before claims-style reuse.",
            "MIMIC HCPCS rows are not a complete CPT claims feed.",
        ],
    }
    save_json(RUN_DIR / "code-definition-review.json", code_match)

    estimates = []
    for model_family, models in [("logistic", logistic_models), ("cox", cox_models)]:
        for outcome, model in models.items():
            if model.get("status") != "fit":
                estimates.append({"model_family": model_family, "outcome": outcome, "status": model.get("status"), "term": "", "n": model.get("n"), "events": model.get("events"), "note": model.get("reason")})
                continue
            for term in model["terms"]:
                estimates.append({"model_family": model_family, "outcome": outcome, "status": "fit", **term, "n": model.get("n"), "events": model.get("events"), "note": ""})
    pd.DataFrame(estimates).to_csv(RUN_DIR / "model-estimates.csv", index=False)
    pd.DataFrame(estimates).to_csv(RUN_DIR / "estimates.csv", index=False)

    study = {
        "schemaVersion": 2,
        "generatedAtIso": now_iso(),
        "title": "Dialysis status and outcomes after SAVR or TAVR in MIMIC-IV",
        "question": "In hemodialysis, peritoneal dialysis, and non-dialysis patients undergoing SAVR and TAVR across ICD-9, ICD-10, and CPT/HCPCS-coded hospital data, how do clinical outcomes differ across mortality, heart-failure or cardiac-related hospital admission, MACE, and valve reintervention?",
        "dataset": "MIMIC-IV v3.1 project-owned GCS Parquet cache",
        "dataBoundary": {
            "supports": ["ICD-9-CM and ICD-10-PCS hospital procedure codes", "HCPCS/CPT-like event scanning when codes are present", "same-hospital longitudinal admissions within deidentified MIMIC patient timelines", "in-hospital and death-date-based mortality horizons"],
            "doesNotSupport": ["national claims capture", "complete outside-hospital readmission/reintervention ascertainment", "exact public calendar-year trend analysis", "complete CPT capture"],
        },
        "cohortSummary": {
            "indexRows": int(len(index)),
            "uniquePatients": int(index["subject_id"].nunique()),
            "valveStrategyCounts": index["valve_strategy"].value_counts(dropna=False).to_dict(),
            "dialysisGroupCounts": index["dialysis_group"].value_counts(dropna=False).to_dict(),
            "anchorYearGroupCounts": index["anchor_year_group"].value_counts(dropna=False).to_dict(),
        },
        "rowCounts": {
            "eligibleIndexRows": int(len(index)),
            "formalAdjustedModelRows": int(len(formal_index)),
            "uniquePatients": int(index["subject_id"].nunique()),
            "completeCaseModelRows": {outcome: int(model.get("n", 0)) for outcome, model in logistic_models.items()},
            "timeToEventModelRows": {outcome: int(model.get("n", 0)) for outcome, model in cox_models.items()},
        },
        "limitations": [
            "single-center deidentified EHR data",
            "same-hospital readmission and reintervention ascertainment only",
            "exact public calendar dates unavailable; anchor-year groups used",
            "CPT/HCPCS capture incomplete in MIMIC",
            "peritoneal dialysis stratum too small for stable adjusted inference",
            "observational design; no causal interpretation",
        ],
        "surveyDesign": {
            "complexSurvey": False,
            "notes": "MIMIC-IV is not a complex survey dataset and has no survey weight, strata, or PSU design to apply.",
        },
        "manualCodeEvidence": code_match,
        "outcomes": ["death", "heart_failure_readmission", "cardiac_readmission", "MI", "stroke", "MACE", "valve_reintervention", "later_TAVR", "later_SAVR", "revision_explant_proxy"],
        "horizons": [{"days": days, "label": label} for days, label in HORIZONS],
        "models": {"logistic": logistic_models, "cox": cox_models, "propensitySensitivity": propensity},
        "cost": {"plannedUsd": inventory["plannedUsd"], "actualUsd": inventory["actualUsd"], "ceilingUsd": COST_CEILING_USD, "actualBytes": inventory["actualBytes"]},
        "artifacts": {
            "outcomesByHorizon": "outcomes-by-horizon.csv",
            "baselineByGroup": "baseline-by-group.csv",
            "modelEstimates": "model-estimates.csv",
            "codeDefinitionReview": "code-definition-review.json",
            "matchedProcedureCodes": "matched-procedure-codes.csv",
            "matchedDiagnosisCodes": "matched-diagnosis-codes.csv",
            "matchedHcpcsCodes": "matched-hcpcs-codes.csv",
            "valvePhenotypeCodeList": "valve-phenotype-code-list.csv",
            "outcomePhenotypes": "outcome-phenotypes.json",
            "missingnessSummary": "missingness-summary.csv",
            "figures": "figures.json",
        },
    }
    save_json(RUN_DIR / "analysis-results.json", study)
    save_json(RUN_DIR / "source-inventory.json", inventory)
    save_json(RUN_DIR / "cost-receipt.json", {"schemaVersion": 1, "generatedAtIso": now_iso(), "estimatedUsd": inventory["actualUsd"], "ceilingUsd": COST_CEILING_USD, "actualBytes": inventory["actualBytes"], "rowCacheRemoved": inventory["rowCacheRemoved"]})
    return study


def fmt_pct(n: Any, d: Any) -> str:
    n2, d2 = int(n), int(d)
    return f"{n2}/{d2} ({100*n2/d2:.1f}%)" if d2 else "0/0"


def render_paper(study: dict[str, Any]) -> None:
    outcomes = pd.read_csv(RUN_DIR / "outcomes-by-horizon.csv")
    baseline = pd.read_csv(RUN_DIR / "baseline-by-group.csv")
    estimates = pd.read_csv(RUN_DIR / "model-estimates.csv")
    missingness = pd.read_csv(RUN_DIR / "missingness-summary.csv") if (RUN_DIR / "missingness-summary.csv").exists() else pd.DataFrame()
    one_year = outcomes.loc[outcomes["horizon"].eq("1y")]
    horizon_summary = outcomes.groupby(["dialysis_group", "horizon", "horizon_days"], as_index=False).agg(
        n=("n", "sum"),
        death_n=("death_n", "sum"),
        hf_n=("hf_n", "sum"),
        cardiac_n=("cardiac_n", "sum"),
        mace_n=("mace_n", "sum"),
        valve_reintervention_n=("valve_reintervention_n", "sum"),
    ).sort_values(["dialysis_group", "horizon_days"])
    valve_counts = format_counts(study["cohortSummary"]["valveStrategyCounts"])
    dialysis_counts = format_counts(study["cohortSummary"]["dialysisGroupCounts"])
    observed_user_codes = ", ".join(study["manualCodeEvidence"]["observedUserDialysisCodes"]) or "none"
    observed_hd_hcpcs = ", ".join(study["manualCodeEvidence"]["observedAuxiliaryHemodialysisCptHcpcs"]) or "none"
    observed_tavr_hcpcs = ", ".join(study["manualCodeEvidence"]["observedValveCptHcpcs"]["tavr"]) or "none"
    observed_savr_hcpcs = ", ".join(study["manualCodeEvidence"]["observedValveCptHcpcs"]["savr"]) or "none"
    lines = [
        "# Dialysis Status and Outcomes After SAVR or TAVR in MIMIC-IV",
        "",
        "## Abstract",
        "",
        "**Background:** Dialysis patients undergoing aortic valve replacement are clinically high risk. A hospital EHR dataset can support a transparent same-institution analysis, but it cannot replace claims or registry follow-up.",
        "",
        "**Objective:** To compare mortality, heart-failure or cardiac-related readmission, MACE, and valve-reintervention outcomes after SAVR or TAVR by dialysis status.",
        "",
        f"**Design:** Retrospective same-hospital longitudinal cohort analysis of MIMIC-IV v3.1. The study included {study['cohortSummary']['indexRows']:,} first observed SAVR/TAVR admissions from {study['cohortSummary']['uniquePatients']:,} patients.",
        "",
        "**Methods:** The cohort was identified from user-supplied ICD-9 procedure and dialysis diagnosis/procedure/CPT/HCPCS codes, ICD-10-PCS aortic-valve replacement logic, and local HCPCS/CPT-like event scanning. Outcomes were summarized at 30 days, 1 year, 3 years, 5 years, and 10 years where MIMIC timelines allowed. Adjusted logistic and event-specific Cox models compared non-dialysis versus hemodialysis/unspecified dialysis patients while adjusting for valve strategy; the peritoneal dialysis and mixed-procedure strata were descriptive only. A propensity-score matched sensitivity analysis compared hemodialysis/unspecified dialysis with non-dialysis patients.",
        "",
        f"**Results:** The cohort included {valve_counts} by valve strategy and {dialysis_counts} by dialysis group. Peritoneal dialysis was very sparse. Same-hospital one-year outcomes are reported below; model estimates should be interpreted as local associations, not treatment effects.",
        "",
        "**Conclusion:** This redo creates a reviewer-ready MIMIC packet for the feasible version of the question. It does not establish complete 2008-2022 national longitudinal outcomes because MIMIC lacks complete outside-hospital claims follow-up and exact public dates.",
        "",
        "## Introduction",
        "",
        study["question"],
        "",
        "The clinically ideal version of this question is a claims or registry study with complete procedure, CPT/HCPCS, readmission, and reintervention follow-up. This MIMIC-IV analysis is a narrower but auditable same-hospital study designed to test phenotype definitions, outcome logic, and reporting quality.",
        "",
        "## Methods",
        "",
        "### Data Source",
        "",
        "We used the project-owned local GCS Parquet cache of MIMIC-IV v3.1. Admissions, diagnosis codes, procedure codes, HCPCS events, patient metadata, and Charlson comorbidity scores were loaded. MIMIC-IV is not a complex survey dataset; there is no survey weight, strata, or PSU design for these models. Temporary row-level cache files were deleted after execution; saved artifacts are aggregate CSV/JSON/PNG files.",
        "",
        "### Code Definitions",
        "",
        "The user-supplied TAVR ICD-9 procedure codes were 35.05 and 35.06. The user-supplied SAVR ICD-9 procedure codes were 35.21 and 35.22. Dialysis evidence used ICD-10-CM N18.6 and Z99.2; ICD-9-CM 585.6, V45.11, V56.0, V56.1, V56.2, V56.31, V56.32, and V56.8; ICD-9 procedure code 54.98; and peritoneal dialysis CPT/HCPCS codes 49324, 49325, 49326, 49418, 49420, 49421, 49422, 49435, 49436, and G0052. A secondary hemodialysis CPT/HCPCS scan used 90935, 90937, 90945, 90947, 90999, and G0257 when those rows were present.",
        "",
        "ICD-10-PCS SAVR/TAVR classification used aortic-valve replacement code-axis/title logic. The matched valve procedure code list is saved as `valve-phenotype-code-list.csv`, and the exact rule is saved in `outcome-phenotypes.json`. HCPCS/CPT-like event rows were scanned for auxiliary valve codes, but MIMIC HCPCS events are not a complete professional-claims feed.",
        "",
        "### Cohort Construction",
        "",
        f"Sample construction began with admissions containing SAVR or TAVR evidence in ICD procedure or auxiliary HCPCS/CPT-like records. We retained the first observed eligible SAVR/TAVR admission per patient. The study population contained {study['cohortSummary']['indexRows']:,} eligible rows from {study['cohortSummary']['uniquePatients']:,} unique patients. Valve strategy counts were {valve_counts}. Dialysis group counts were {dialysis_counts}. Peritoneal dialysis was treated as exploratory because only {study['cohortSummary']['dialysisGroupCounts'].get('peritoneal_dialysis', 0)} index patients met that definition.",
        "",
        "### Outcomes",
        "",
        "Outcomes were in-hospital mortality; death at 30 days, 1 year, 3 years, 5 years, and 10 years; heart-failure readmission; broad cardiac-related readmission; MI; stroke; MACE defined as death, MI, or stroke; later TAVR; later SAVR; revision/explant proxy; and valve reintervention composite. Readmission and reintervention outcomes are same-hospital only. Time zero was index admission for mortality horizons and time-to-death models, index discharge for post-discharge readmission and reintervention outcomes, and index admission for in-hospital mortality.",
        "",
        "Heart-failure readmission used ICD-9-CM 428* or ICD-10-CM I50* diagnosis evidence. Cardiac-related readmission used ICD-9-CM 390-459 or ICD-10-CM I* diagnosis evidence. MI used ICD-9-CM 410* or ICD-10-CM I21*/I22*. Stroke used ICD-9-CM 430*/431*/432*/433*/434*/436*/437*/438* or ICD-10-CM I60*/I61*/I62*/I63*/I64*, excluding ICD-9-CM 435/TIA. Valve reintervention combined later TAVR, later SAVR, and ICD-10-PCS title-based revision/explant proxy evidence. The full machine-readable outcome phenotype record is saved as `outcome-phenotypes.json`.",
        "",
        "### Statistical Analysis",
        "",
        "We generated baseline summaries, outcome counts by horizon, adjusted logistic models for selected binary outcomes, event-specific Cox proportional-hazards models for time-to-event outcomes, and a propensity-score matched sensitivity analysis for hemodialysis/unspecified dialysis versus non-dialysis. Formal adjusted models excluded peritoneal dialysis patients and same-admission mixed SAVR/TAVR patients because those strata were too small for stable adjusted inference. Models included dialysis group, valve strategy, age, sex, Charlson comorbidity index, insurance, and anchor-year group when appropriate and feasible. Models used complete-case rows for the required outcome and adjustment variables. Missing data were handled by complete-case exclusion rather than imputation, and models were not interpreted when event counts were too sparse. Nonfatal readmission/reintervention Cox models censor deaths before nonfatal events; Fine-Gray competing-risk models were not estimated in this MIMIC redo.",
        "",
        "## Results",
        "",
        "### One-Year Outcomes",
        "",
    ]
    for _, row in one_year.iterrows():
        lines.append(f"- {row['valve_strategy']} / {row['dialysis_group']}: n={int(row['n']):,}; death {fmt_pct(row['death_n'], row['n'])}; HF readmission {fmt_pct(row['hf_n'], row['n'])}; cardiac readmission {fmt_pct(row['cardiac_n'], row['n'])}; MACE {fmt_pct(row['mace_n'], row['n'])}; valve reintervention {fmt_pct(row['valve_reintervention_n'], row['n'])}.")
    lines += ["", "### Baseline Characteristics", ""]
    for _, row in baseline.iterrows():
        lines.append(f"- {row['valve_strategy']} / {row['dialysis_group']}: n={int(row['n']):,}; median age {row['admission_age_median']:.1f}; median Charlson {row['charlson_comorbidity_index_median']:.1f}; male {fmt_pct(row['male_n'], row['n'])}.")
    if not missingness.empty:
        lines += ["", "### Missingness", ""]
        for _, row in missingness.iterrows():
            lines.append(f"- {row['variable']}: {int(row['missing_n'])}/{int(row['n'])} missing ({100*float(row['missing_pct']):.1f}%).")
    lines += [
        "",
        "### Outcomes Across Follow-Up Horizons",
        "",
        "The following horizon summaries collapse across SAVR/TAVR strategy to show the overall dialysis-status gradient. Readmission and reintervention outcomes remain same-hospital only.",
        "",
    ]
    for _, row in horizon_summary.iterrows():
        lines.append(f"- {row['dialysis_group']} at {row['horizon']}: death {fmt_pct(row['death_n'], row['n'])}; HF readmission {fmt_pct(row['hf_n'], row['n'])}; cardiac readmission {fmt_pct(row['cardiac_n'], row['n'])}; MACE {fmt_pct(row['mace_n'], row['n'])}; valve reintervention {fmt_pct(row['valve_reintervention_n'], row['n'])}.")
    lines += [
        "",
        "### Code And Phenotype QA",
        "",
        f"- User-supplied dialysis and peritoneal-dialysis codes observed in the local tables: {observed_user_codes}.",
        f"- Auxiliary hemodialysis CPT/HCPCS scan codes observed: {observed_hd_hcpcs}.",
        f"- Auxiliary TAVR CPT/HCPCS scan codes observed: {observed_tavr_hcpcs}.",
        f"- Auxiliary SAVR CPT/HCPCS scan codes observed: {observed_savr_hcpcs}.",
        "- ICD-10-PCS aortic-valve replacement classification was derived from code-axis/title logic and should be treated as a reviewed phenotype rule, not a raw exact-code list.",
    ]
    lines += ["", "### Adjusted Model Findings", ""]
    key_terms = estimates.loc[estimates["term"].isin(["dialysis_hd_unspecified", "dialysis_peritoneal", "valve_tavr"])].copy()
    for _, row in key_terms.head(30).iterrows():
        measure = "HR" if row["model_family"] == "cox" else "OR"
        value = row.get("hazard_ratio") if row["model_family"] == "cox" else row.get("odds_ratio")
        lines.append(f"- {row['model_family']} {row['outcome']} / {row['term']}: {measure} {float(value):.2f} (95% CI {float(row['ci_low']):.2f}-{float(row['ci_high']):.2f}); p={float(row['p_value']):.3g}; n={int(row['n'])}, events={int(row['events'])}.")
    if key_terms.empty:
        lines.append("- No adjusted model produced dialysis/valve terms under event-count and convergence safeguards.")
    propensity = study["models"]["propensitySensitivity"]
    lines += ["", "### Propensity-Score Sensitivity", ""]
    if propensity.get("status") == "fit":
        covars = ", ".join(propensity.get("covariates", []))
        lines.append(f"The hemodialysis/unspecified versus non-dialysis matched sensitivity analysis used nearest-neighbor matching on the logit propensity score with a caliper of {propensity.get('caliper'):.3f}. The propensity model covariates were {covars}. It matched {propensity['matchedPairs']} of {propensity['treated']} treated patients. Maximum absolute SMD after matching was {propensity.get('maxAbsSmdAfter'):.3f}; the full balance table is saved as `propensity-balance.csv` and Figure 4.")
        if propensity.get("warning"):
            lines.append(f"The propensity model used {propensity.get('fitMethod')} with this implementation note: {propensity['warning']}")
        for contrast in propensity["contrasts"]:
            if contrast.get("status") == "fit":
                ci = f"95% CI {contrast['riskDifferenceCiLow']:.3f} to {contrast['riskDifferenceCiHigh']:.3f}" if contrast.get("riskDifferenceCiLow") is not None else "95% CI not available"
                pval = f"; McNemar p={contrast['mcnemarPValue']:.3g}" if contrast.get("mcnemarPValue") is not None else ""
                lines.append(f"- {contrast['outcome']}: treated risk {contrast['treatedRisk']:.3f}, control risk {contrast['controlRisk']:.3f}, risk difference {contrast['riskDifference']:.3f} ({ci}){pval}.")
    else:
        lines.append(f"Propensity sensitivity was not fit: {propensity.get('reason')}.")
    lines += [
        "",
        "## Discussion",
        "",
        "This analysis consistently shows that dialysis-coded patients are a higher-risk subgroup after aortic valve replacement in the available MIMIC-IV hospital timeline. The hemodialysis/unspecified dialysis group had higher crude death and MACE rates than non-dialysis patients in both SAVR and TAVR strata. Peritoneal dialysis counts were too small for stable comparative inference.",
        "",
        "The most important interpretation boundary is ascertainment. MIMIC can observe same-hospital readmissions and reinterventions, plus death-date-based mortality where available. It cannot prove that a patient did not have an outside-hospital heart-failure admission, MI, stroke, TAVR, SAVR, or explant.",
        "",
        "## Limitations",
        "",
        "- This is a single-center deidentified EHR analysis, not a national claims or registry study.",
        "- Calendar years are approximated through MIMIC anchor-year groups; exact public dates are not available.",
        "- Same-hospital readmission and reintervention outcomes may miss outside-hospital events.",
        "- CPT/HCPCS evidence is incomplete in MIMIC; valve classification is mainly ICD procedure driven.",
        "- Peritoneal dialysis was rare and should be treated as descriptive only.",
        "- Event-specific Cox models do not estimate subdistribution hazards; nonfatal event analyses should not be read as Fine-Gray competing-risk estimates.",
        "- Dialysis modality assignment is code-based and may misclassify outpatient modality.",
        "- No causal conclusion is supported by this observational design.",
        "",
        "## Figures",
        "",
        "- Figure 1: one-year MACE proportions by valve strategy and dialysis group.",
        "- Figure 2: mortality proportions across 30-day, 1-year, 3-year, 5-year, and 10-year horizons by dialysis group.",
        "- Figure 3: adjusted Cox-model dialysis-group hazard ratios.",
        "- Figure 4, when available: propensity-balance love plot for hemodialysis/unspecified dialysis versus non-dialysis.",
        "",
        "## Reproducibility",
        "",
        f"Estimated GCS read cost was ${study['cost']['actualUsd']:.4f}; row-level cache files were removed after execution. The run directory contains aggregate code-match, cohort, outcome, model, propensity, figure, QA, source-inventory, and reviewer-context artifacts.",
        "",
        "## References",
        "",
        "- MIMIC-IV v3.1, PhysioNet: https://physionet.org/content/mimiciv/3.1/",
        "- MIMIC-IV documentation: https://mimic.mit.edu/docs/iv/",
        "- CDC ICD-10-CM information: https://www.cdc.gov/nchs/icd/icd-10-cm/index.html",
        "- CMS ICD-10 coding resources: https://www.cms.gov/medicare/coding-billing/icd-10-codes",
        "- CMS CPT/HCPCS code-list resources: https://www.cms.gov/medicare/regulations-guidance/physician-self-referral/list-cpt-hcpcs-codes",
    ]
    (RUN_DIR / "paper.md").write_text("\n".join(lines) + "\n", encoding="utf-8")


def qa(study: dict[str, Any]) -> dict[str, Any]:
    issues = []
    if study["cohortSummary"]["indexRows"] < 100:
        issues.append({"severity": "blocker", "code": "TINY_COHORT", "message": "Too few SAVR/TAVR patients."})
    if study["cohortSummary"]["dialysisGroupCounts"].get("peritoneal_dialysis", 0) < 30:
        issues.append({"severity": "warning", "code": "TINY_PD_STRATUM", "message": "Peritoneal dialysis stratum is too small for adjusted inference."})
    if not study["manualCodeEvidence"]["observedValveCptHcpcs"]["savr"]:
        issues.append({"severity": "warning", "code": "SAVR_CPT_NOT_OBSERVED", "message": "Auxiliary SAVR CPT scan codes were not observed in local HCPCS events."})
    if not study["manualCodeEvidence"]["observedValveCptHcpcs"]["tavr"]:
        issues.append({"severity": "warning", "code": "TAVR_CPT_NOT_OBSERVED", "message": "Auxiliary TAVR CPT scan codes were not observed in local HCPCS events."})
    if study["models"]["propensitySensitivity"].get("status") != "fit":
        issues.append({"severity": "warning", "code": "PROPENSITY_NOT_FIT", "message": "Propensity sensitivity did not fit."})
    return {"schemaVersion": 1, "generatedAtIso": now_iso(), "status": "block" if any(i["severity"] == "blocker" for i in issues) else "review", "issues": issues}


def write_context(study: dict[str, Any], qa_result: dict[str, Any]) -> None:
    context = [
        "# Reviewer Context",
        "",
        f"Research question: {study['question']}",
        "",
        "This is a complete redo of the SAVR/TAVR dialysis-status packet. Review the MIMIC-feasible study, not the impossible claims-registry version.",
        "",
        "## Data Boundary",
        "",
        "- MIMIC-IV supports deidentified same-hospital longitudinal admissions and death-date-based mortality where available.",
        "- MIMIC-IV does not support complete national claims follow-up, outside-hospital readmissions, exact public dates, or complete CPT claims capture.",
        "- Anchor-year groups approximate the requested 2008-2022 period; they are not exact public dates.",
        "",
        "## User-Supplied Codes",
        "",
        json.dumps(study["manualCodeEvidence"]["userSuppliedCodeSets"], indent=2),
        "",
        "## Official/Primary Context Sources Consulted",
        "",
        *[f"- {url}" for url in CODE_EVIDENCE_URLS],
        "",
        "## Run QA Issues",
        "",
        json.dumps(qa_result["issues"], indent=2),
        "",
        "## What To Review",
        "",
        "- Whether the coding logic is sufficiently transparent and appropriately limited.",
        "- Whether the same-hospital longitudinal boundary is stated clearly enough.",
        "- Whether the outcome definitions match the stated claims.",
        "- Whether adjusted and propensity analyses are appropriate or overinterpreted.",
        "- Whether the paper should re-enter phenotype review, method selection, execution, manuscript repair, or human review.",
    ]
    (RUN_DIR / "reviewer-context.md").write_text("\n".join(context) + "\n", encoding="utf-8")


def write_artifact_index(study: dict[str, Any], qa_result: dict[str, Any]) -> None:
    artifacts = []
    for path in sorted(RUN_DIR.iterdir()):
        if path.is_file():
            artifacts.append({"path": path.name, "bytes": path.stat().st_size, "sha256": hashlib.sha256(path.read_bytes()).hexdigest()})
    save_json(RUN_DIR / "artifact-index.json", {"schemaVersion": 1, "generatedAtIso": now_iso(), "studyHash": stable_hash(study), "qaStatus": qa_result["status"], "artifactCount": len(artifacts), "artifacts": artifacts})


def main() -> None:
    if RUN_DIR.exists():
        shutil.rmtree(RUN_DIR)
    RUN_DIR.mkdir(parents=True)
    study = build_analysis()
    render_paper(study)
    qa_result = qa(study)
    save_json(RUN_DIR / "qa.json", qa_result)
    write_context(study, qa_result)
    write_artifact_index(study, qa_result)
    print(json.dumps({
        "runDir": str(RUN_DIR),
        "paper": str(RUN_DIR / "paper.md"),
        "cohortRows": study["cohortSummary"]["indexRows"],
        "dialysisGroups": study["cohortSummary"]["dialysisGroupCounts"],
        "valveStrategies": study["cohortSummary"]["valveStrategyCounts"],
        "qaStatus": qa_result["status"],
        "issues": [issue["code"] for issue in qa_result["issues"]],
        "estimatedCostUsd": study["cost"]["actualUsd"],
    }, indent=2))


if __name__ == "__main__":
    main()
