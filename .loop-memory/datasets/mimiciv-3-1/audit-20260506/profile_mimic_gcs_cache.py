#!/usr/bin/env python3
"""Bounded MIMIC-IV GCS Parquet audit.

The script deliberately avoids a full dataset scan. It profiles a selected
subset of small/high-value Parquet tables, writes aggregate artifacts, records
estimated cloud read cost, and removes the temporary row-level cache.
"""

from __future__ import annotations

import hashlib
import json
import math
import shutil
import subprocess
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import pyarrow as pa
import pyarrow.compute as pc
import pyarrow.parquet as pq


ROOT = Path("/Users/saleh/TechProjects/agenteer")
DATASET_DIR = ROOT / ".loop-memory/datasets/mimiciv-3-1"
MANIFEST_PATH = DATASET_DIR / "dataset-manifest.json"
AUDIT_DIR = DATASET_DIR / "audit-20260506"
CACHE_DIR = AUDIT_DIR / "_tmp-parquet-cache"

MAX_READ_BYTES = 256 * 1024 * 1024
CONSERVATIVE_EGRESS_USD_PER_GB = 0.12
GCS_STANDARD_CLASS_B_USD_PER_10K = 0.004

ALWAYS_INCLUDE = {
    "hosp-admissions",
    "hosp-patients",
    "icu-icustays",
    "derived-icustay-detail",
    "derived-first-day-lab",
    "derived-first-day-vitalsign",
    "derived-first-day-sofa",
    "derived-apsiii",
    "derived-oasis",
    "derived-charlson",
    "derived-antibiotic",
    "hosp-diagnoses-icd",
}

FULL_PROFILE_BYTE_LIMIT = 10 * 1024 * 1024


def run(cmd: list[str]) -> str:
    completed = subprocess.run(cmd, check=True, text=True, capture_output=True)
    return completed.stdout


def load_manifest() -> dict[str, Any]:
    return json.loads(MANIFEST_PATH.read_text())


def selected_tables(manifest: dict[str, Any]) -> list[dict[str, Any]]:
    selected: list[dict[str, Any]] = []
    total = 0
    tables = sorted(manifest["tables"], key=lambda t: (t["tableId"] not in ALWAYS_INCLUDE, t["bytes"]))
    for table in tables:
        include = table["tableId"] in ALWAYS_INCLUDE or table["bytes"] <= FULL_PROFILE_BYTE_LIMIT
        if not include:
            continue
        projected = total + int(table["bytes"])
        if projected > MAX_READ_BYTES:
            continue
        selected.append(table)
        total = projected
    return sorted(selected, key=lambda t: t["tableId"])


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
                "storageClass": metadata.get("storageClass"),
            }
        )
    return sorted(objects, key=lambda item: item["url"])


def copy_objects(table_id: str, objects: list[dict[str, Any]]) -> list[Path]:
    target = CACHE_DIR / table_id
    target.mkdir(parents=True, exist_ok=True)
    copied: list[Path] = []
    for obj in objects:
        filename = obj["url"].rstrip("/").split("/")[-1]
        local = target / filename
        run(["gcloud", "storage", "cp", obj["url"], str(local)])
        copied.append(local)
    return copied


def table_digest(paths: list[Path]) -> str:
    digest = hashlib.sha256()
    for path in sorted(paths):
        digest.update(path.name.encode())
        digest.update(str(path.stat().st_size).encode())
    return digest.hexdigest()


def scalar(value: Any) -> Any:
    if value is None:
        return None
    if hasattr(value, "as_py"):
        return value.as_py()
    if isinstance(value, float) and (math.isnan(value) or math.isinf(value)):
        return None
    return value


def safe_min_max(array: pa.ChunkedArray) -> tuple[Any, Any]:
    try:
        if is_numeric_type(array.type) or pa.types.is_temporal(array.type):
            return scalar(pc.min(array)), scalar(pc.max(array))
    except Exception:
        return None, None
    return None, None


def is_numeric_type(dtype: pa.DataType) -> bool:
    return pa.types.is_integer(dtype) or pa.types.is_floating(dtype) or pa.types.is_decimal(dtype)


def top_values(array: pa.ChunkedArray, limit: int = 8) -> list[dict[str, Any]]:
    try:
        if array.length() > 2_000_000:
            return []
        counts = pc.value_counts(array.drop_null()).to_pylist()
    except Exception:
        return []
    simplified = []
    for item in counts[:200]:
        simplified.append({"value": str(item["values"])[:80], "count": int(item["counts"])})
    simplified.sort(key=lambda item: item["count"], reverse=True)
    return simplified[:limit]


def numeric_quantiles(array: pa.ChunkedArray) -> dict[str, Any]:
    if not is_numeric_type(array.type):
        return {}
    try:
        qs = pc.quantile(array.drop_null(), q=[0.01, 0.25, 0.5, 0.75, 0.99]).as_py()
    except Exception:
        return {}
    return {"p01": qs[0], "p25": qs[1], "p50": qs[2], "p75": qs[3], "p99": qs[4]}


def profile_column(name: str, array: pa.ChunkedArray, row_count: int) -> dict[str, Any]:
    nulls = int(array.null_count)
    non_missing = row_count - nulls
    min_value, max_value = safe_min_max(array)
    distinct_count = None
    if row_count <= 1_000_000:
        try:
            distinct_count = int(pc.count_distinct(array.drop_null()).as_py())
        except Exception:
            distinct_count = None
    return {
        "name": name,
        "type": str(array.type),
        "rows": row_count,
        "nonMissingRows": non_missing,
        "missingFraction": nulls / row_count if row_count else None,
        "distinctCount": distinct_count,
        "min": min_value,
        "max": max_value,
        "quantiles": numeric_quantiles(array),
        "topValues": top_values(array) if row_count <= 500_000 else [],
    }


def read_table(paths: list[Path]) -> pa.Table:
    return pq.read_table([str(path) for path in paths])


def row_count_from_metadata(paths: list[Path]) -> int:
    return sum(pq.ParquetFile(path).metadata.num_rows for path in paths)


def profile_table(table: dict[str, Any], paths: list[Path]) -> dict[str, Any]:
    arrow = read_table(paths)
    row_count = arrow.num_rows
    columns = [profile_column(name, arrow[name], row_count) for name in arrow.column_names]
    return {
        "tableId": table["tableId"],
        "sourcePath": table["sourcePath"],
        "manifestRows": table.get("rowCount"),
        "manifestBytes": table.get("bytes"),
        "localRows": row_count,
        "localColumns": len(arrow.column_names),
        "schema": [{"name": field.name, "type": str(field.type)} for field in arrow.schema],
        "columns": columns,
        "cacheDigest": table_digest(paths),
    }


def impossible_negative(name: str) -> bool:
    lower = name.lower()
    positive_terms = [
        "age",
        "weight",
        "height",
        "rate",
        "score",
        "bilirubin",
        "creatinine",
        "glucose",
        "sodium",
        "potassium",
        "chloride",
        "hematocrit",
        "hemoglobin",
        "platelet",
        "wbc",
        "bun",
        "albumin",
        "lactate",
        "spo2",
        "heart",
        "resp",
        "temperature",
    ]
    return any(term in lower for term in positive_terms)


def semantic_findings(profiles: list[dict[str, Any]]) -> list[dict[str, Any]]:
    findings: list[dict[str, Any]] = []
    for profile in profiles:
        table_id = profile["tableId"]
        if profile["manifestRows"] is not None and profile["manifestRows"] != profile["localRows"]:
            findings.append(
                {
                    "severity": "blocker",
                    "code": "ROW_COUNT_MISMATCH",
                    "tableId": table_id,
                    "message": f"Manifest rows {profile['manifestRows']} do not match local parquet rows {profile['localRows']}.",
                }
            )
        if profile["localColumns"] != len(profile["schema"]):
            findings.append(
                {
                    "severity": "blocker",
                    "code": "SCHEMA_COLUMN_COUNT_MISMATCH",
                    "tableId": table_id,
                    "message": "Arrow schema column count disagrees with local column count.",
                }
            )
        for column in profile["columns"]:
            mf = column["missingFraction"]
            if mf is not None and mf >= 0.95:
                findings.append(
                    {
                        "severity": "warning",
                        "code": "VERY_HIGH_MISSINGNESS",
                        "tableId": table_id,
                        "column": column["name"],
                        "message": f"{column['name']} is {mf:.1%} missing in the profiled table.",
                    }
                )
            if column["min"] is not None and isinstance(column["min"], (int, float)) and column["min"] < 0 and impossible_negative(column["name"]):
                findings.append(
                    {
                        "severity": "warning",
                        "code": "NEGATIVE_PLAUSIBILITY_VALUE",
                        "tableId": table_id,
                        "column": column["name"],
                        "message": f"{column['name']} has minimum {column['min']}, which may be implausible depending on coding.",
                    }
                )
    return findings


def key_uniqueness(table: pa.Table, table_id: str, keys: list[str]) -> list[dict[str, Any]]:
    findings = []
    available = [key for key in keys if key in table.column_names]
    if len(available) != len(keys):
        return findings
    try:
        import pandas as pd

        frame = table.select(available).to_pandas()
        duplicate_count = int(frame.duplicated().sum())
        if duplicate_count:
            findings.append(
                {
                    "severity": "warning",
                    "code": "NON_UNIQUE_EXPECTED_KEY",
                    "tableId": table_id,
                    "columns": available,
                    "message": f"{duplicate_count} duplicate rows found for expected key {', '.join(available)}.",
                }
            )
    except Exception as exc:
        findings.append(
            {
                "severity": "note",
                "code": "KEY_CHECK_SKIPPED",
                "tableId": table_id,
                "columns": available,
                "message": f"Could not evaluate key uniqueness: {exc}",
            }
        )
    return findings


def targeted_integrity_checks(local_tables: dict[str, pa.Table]) -> list[dict[str, Any]]:
    findings: list[dict[str, Any]] = []
    expected_keys = {
        "hosp-patients": ["subject_id"],
        "hosp-admissions": ["hadm_id"],
        "icu-icustays": ["stay_id"],
        "derived-icustay-detail": ["stay_id"],
        "derived-apsiii": ["stay_id"],
        "derived-oasis": ["stay_id"],
        "derived-first-day-lab": ["stay_id"],
        "derived-first-day-vitalsign": ["stay_id"],
    }
    for table_id, keys in expected_keys.items():
        table = local_tables.get(table_id)
        if table is not None:
            findings.extend(key_uniqueness(table, table_id, keys))

    checks = [
        ("hosp-admissions", "admittime", "dischtime", "ADMISSION_DISCHARGE_ORDER"),
        ("icu-icustays", "intime", "outtime", "ICU_INTIME_OUTTIME_ORDER"),
    ]
    for table_id, start, end, code in checks:
        table = local_tables.get(table_id)
        if table is None or start not in table.column_names or end not in table.column_names:
            continue
        try:
            bad = int(pc.sum(pc.cast(pc.less(table[end], table[start]), pa.int64())).as_py())
        except Exception:
            continue
        if bad:
            findings.append(
                {
                    "severity": "blocker",
                    "code": code,
                    "tableId": table_id,
                    "message": f"{bad} rows have {end} earlier than {start}.",
                }
            )

    if "hosp-admissions" in local_tables and "hosp-patients" in local_tables:
        try:
            import pandas as pd

            admissions_subjects = set(local_tables["hosp-admissions"]["subject_id"].to_pylist())
            patient_subjects = set(local_tables["hosp-patients"]["subject_id"].to_pylist())
            missing = len(admissions_subjects - patient_subjects)
            if missing:
                findings.append(
                    {
                        "severity": "blocker",
                        "code": "ADMISSION_PATIENT_JOIN_GAP",
                        "tableId": "hosp-admissions",
                        "message": f"{missing} admission subject_id values do not appear in hosp-patients.",
                    }
                )
        except Exception as exc:
            findings.append(
                {
                    "severity": "note",
                    "code": "JOIN_COVERAGE_SKIPPED",
                    "tableId": "hosp-admissions",
                    "message": f"Could not evaluate admissions-to-patients coverage: {exc}",
                }
            )
    return findings


def summarize_profiles(profiles: list[dict[str, Any]], findings: list[dict[str, Any]], selected: list[dict[str, Any]], bytes_read: int) -> str:
    severity_counts = Counter(item["severity"] for item in findings)
    high_missing = [
        (p["tableId"], c["name"], c["missingFraction"])
        for p in profiles
        for c in p["columns"]
        if c["missingFraction"] is not None and c["missingFraction"] >= 0.5
    ]
    high_missing.sort(key=lambda item: item[2], reverse=True)
    lines = [
        "# MIMIC-IV v3.1 Bounded Data Audit",
        "",
        f"Generated: {datetime.now(timezone.utc).isoformat()}",
        "",
        "## Cost And Scope Guard",
        "",
        f"- Hard actual-read cap: {MAX_READ_BYTES / 1024 / 1024:.0f} MiB.",
        f"- Actual copied/read Parquet bytes: {bytes_read / 1024 / 1024:.2f} MiB.",
        f"- Conservative transfer estimate at ${CONSERVATIVE_EGRESS_USD_PER_GB:.2f}/GB: ${bytes_read / 1024**3 * CONSERVATIVE_EGRESS_USD_PER_GB:.4f}.",
        f"- Estimated Class B object-read/list operations: under ${GCS_STANDARD_CLASS_B_USD_PER_10K:.4f} at this scale.",
        "- Temporary row-level Parquet cache is removed after aggregate profiling.",
        "",
        "## Profiled Tables",
        "",
    ]
    for table in selected:
        lines.append(f"- `{table['tableId']}`: {table['rowCount']} rows, {table['bytes'] / 1024 / 1024:.2f} MiB.")
    lines.extend(
        [
            "",
            "## Findings Summary",
            "",
            f"- Blockers: {severity_counts.get('blocker', 0)}.",
            f"- Warnings: {severity_counts.get('warning', 0)}.",
            f"- Notes: {severity_counts.get('note', 0)}.",
            "",
            "## Important Warnings",
            "",
        ]
    )
    for item in [f for f in findings if f["severity"] in {"blocker", "warning"}][:40]:
        loc = item.get("tableId", "")
        if item.get("column"):
            loc += f".{item['column']}"
        lines.append(f"- `{item['code']}` at `{loc}`: {item['message']}")
    if not [f for f in findings if f["severity"] in {"blocker", "warning"}]:
        lines.append("- No blocker/warning findings from the bounded local table profiles.")
    lines.extend(["", "## High Missingness Columns", ""])
    for table_id, name, fraction in high_missing[:30]:
        lines.append(f"- `{table_id}.{name}`: {fraction:.1%} missing.")
    if not high_missing:
        lines.append("- No columns at or above 50% missingness in the profiled subset.")
    lines.extend(
        [
            "",
            "## Practical Implications",
            "",
            "- The profiled subset is suitable for building first-pass cohorts around admissions, ICU stays, first-day labs/vitals, severity scores, and diagnosis codes.",
            "- Very large event tables such as chartevents, labevents, emar, pharmacy, inputevents, and prescriptions still need query-specific bounded scans before use.",
            "- Any generated study should record exactly which profiled tables were used and whether unprofiled large tables were touched.",
            "- Avoid row-level export in reports; keep outputs aggregate and de-identified.",
        ]
    )
    return "\n".join(lines) + "\n"


def main() -> None:
    AUDIT_DIR.mkdir(parents=True, exist_ok=True)
    if CACHE_DIR.exists():
        shutil.rmtree(CACHE_DIR)
    CACHE_DIR.mkdir(parents=True)

    manifest = load_manifest()
    selected = selected_tables(manifest)
    planned_bytes = sum(int(t["bytes"]) for t in selected)
    if planned_bytes > MAX_READ_BYTES:
        raise RuntimeError("planned read bytes exceed hard cap")

    inventory: dict[str, Any] = {}
    profiles: list[dict[str, Any]] = []
    local_tables: dict[str, pa.Table] = {}
    copied_bytes = 0
    cost_ledger_events = [
        {
            "event": "cost_guard_initialized",
            "maxReadBytes": MAX_READ_BYTES,
            "plannedReadBytes": planned_bytes,
            "estimatedTransferUsd": planned_bytes / 1024**3 * CONSERVATIVE_EGRESS_USD_PER_GB,
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }
    ]

    try:
        for table in selected:
            objects = list_table_objects(table)
            object_bytes = sum(obj["size"] for obj in objects)
            if copied_bytes + object_bytes > MAX_READ_BYTES:
                cost_ledger_events.append(
                    {
                        "event": "table_skipped_budget",
                        "tableId": table["tableId"],
                        "objectBytes": object_bytes,
                        "copiedBytesBeforeSkip": copied_bytes,
                    }
                )
                continue
            inventory[table["tableId"]] = {"table": table, "objects": objects}
            paths = copy_objects(table["tableId"], objects)
            copied_bytes += sum(path.stat().st_size for path in paths)
            profile = profile_table(table, paths)
            profiles.append(profile)
            if table["tableId"] in {
                "hosp-patients",
                "hosp-admissions",
                "icu-icustays",
                "derived-icustay-detail",
                "derived-apsiii",
                "derived-oasis",
                "derived-first-day-lab",
                "derived-first-day-vitalsign",
            }:
                local_tables[table["tableId"]] = read_table(paths)
            cost_ledger_events.append(
                {
                    "event": "table_profiled",
                    "tableId": table["tableId"],
                    "bytesCopied": sum(path.stat().st_size for path in paths),
                    "totalBytesCopied": copied_bytes,
                    "estimatedTransferUsdSoFar": copied_bytes / 1024**3 * CONSERVATIVE_EGRESS_USD_PER_GB,
                }
            )

        findings = semantic_findings(profiles)
        findings.extend(targeted_integrity_checks(local_tables))
        metadata_only = [t for t in manifest["tables"] if t["tableId"] not in {p["tableId"] for p in profiles}]
        for table in metadata_only:
            findings.append(
                {
                    "severity": "note",
                    "code": "METADATA_ONLY_TABLE",
                    "tableId": table["tableId"],
                    "message": "Table was not row-profiled in this bounded audit; use query-specific profiling before analysis.",
                }
            )

        outputs = {
            "auditVersion": 1,
            "datasetId": manifest["datasetId"],
            "generatedAtIso": datetime.now(timezone.utc).isoformat(),
            "readBudget": {
                "maxBytes": MAX_READ_BYTES,
                "plannedBytes": planned_bytes,
                "actualBytes": copied_bytes,
                "estimatedTransferUsd": copied_bytes / 1024**3 * CONSERVATIVE_EGRESS_USD_PER_GB,
                "estimatedClassBOperationsUsd": GCS_STANDARD_CLASS_B_USD_PER_10K,
                "hardCeilingUsd": 1.0,
            },
            "profiledTableCount": len(profiles),
            "metadataOnlyTableCount": len(metadata_only),
            "profiles": profiles,
            "findings": findings,
        }
        (AUDIT_DIR / "object-inventory.json").write_text(json.dumps(inventory, indent=2, default=str) + "\n")
        (AUDIT_DIR / "sample-profile.json").write_text(json.dumps(outputs, indent=2, default=str) + "\n")
        (AUDIT_DIR / "semantic-watchouts.json").write_text(json.dumps({"findings": findings}, indent=2, default=str) + "\n")
        (AUDIT_DIR / "COST_LEDGER.json").write_text(json.dumps({"events": cost_ledger_events}, indent=2, default=str) + "\n")
        (AUDIT_DIR / "MIMIC_DATA_AUDIT.md").write_text(summarize_profiles(profiles, findings, selected, copied_bytes))
    finally:
        if CACHE_DIR.exists():
            shutil.rmtree(CACHE_DIR)

    print(json.dumps({"auditDir": str(AUDIT_DIR), "bytesCopied": copied_bytes, "tablesProfiled": len(profiles)}, indent=2))


if __name__ == "__main__":
    main()
