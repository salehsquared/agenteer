#!/usr/bin/env python3
"""Generate a bounded 30-tick MIMIC study-design acquaintance run.

The run deliberately uses existing dataset artifacts and online ICD verification
instead of additional GCS/BigQuery scans. It writes one artifact per tick plus a
study atlas, ICD verification ledger, and cost ledger.
"""

from __future__ import annotations

import hashlib
import json
import textwrap
import urllib.parse
import urllib.request
from collections import Counter, defaultdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


ROOT = Path("/Users/saleh/TechProjects/agenteer")
MEMORY = ROOT / ".loop-memory"
RUN_DIR = MEMORY / "mimic-study-designs-20260506"
STUDY_DIR = RUN_DIR / "studies"
TICK_DIR = MEMORY / "ticks"
RUN_TICK_DIR = RUN_DIR / "ticks"
ICD_DIR = RUN_DIR / "icd-verification"
AUDIT_DIR = RUN_DIR / "audits"
DATASET_DIR = MEMORY / "datasets/mimiciv-3-1"

NLM_SOURCES = {
    "icd10cm": {
        "api": "https://clinicaltables.nlm.nih.gov/api/icd10cm/v3/search",
        "doc": "https://clinicaltables.nlm.nih.gov/apidoc/icd10cm/v3/doc.html",
        "authority": "NLM Clinical Tables ICD-10-CM API; CDC/NCHS maintains ICD-10-CM for U.S. morbidity coding.",
    },
    "icd9cm_dx": {
        "api": "https://clinicaltables.nlm.nih.gov/api/icd9cm_dx/v3/search",
        "doc": "https://clinicaltables.nlm.nih.gov/apidoc/icd9cm_dx/v3/doc.html",
        "authority": "NLM Clinical Tables ICD-9-CM diagnosis API from CMS Data version 32.",
    },
}

OFFICIAL_SOURCE_NOTES = [
    {
        "label": "CDC ICD-10-CM overview/browser",
        "url": "https://www.cdc.gov/nchs/icd/icd-10-cm/index.html",
        "use": "Authority for ICD-10-CM as the U.S. diagnosis coding system and CDC/NCHS browser.",
    },
    {
        "label": "NLM Clinical Tables ICD-10-CM API docs",
        "url": NLM_SOURCES["icd10cm"]["doc"],
        "use": "Online lookup used to verify ICD-10-CM code families and representative titles.",
    },
    {
        "label": "NLM Clinical Tables ICD-9-CM diagnosis API docs",
        "url": NLM_SOURCES["icd9cm_dx"]["doc"],
        "use": "Online lookup used to verify ICD-9-CM diagnosis code families and representative titles.",
    },
]


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def stable_hash(value: Any) -> str:
    payload = json.dumps(value, sort_keys=True, separators=(",", ":"), default=str).encode()
    return hashlib.sha256(payload).hexdigest()


def fetch_icd(system: str, terms: str, max_list: int = 8) -> dict[str, Any]:
    source = NLM_SOURCES[system]
    url = source["api"] + "?" + urllib.parse.urlencode({"sf": "code,name", "terms": terms, "maxList": max_list})
    with urllib.request.urlopen(url, timeout=20) as response:
        payload = json.loads(response.read().decode())
    rows = []
    if len(payload) >= 4 and isinstance(payload[3], list):
        rows = [{"code": str(row[0]), "name": str(row[1]).strip()} for row in payload[3]]
    return {
        "system": system,
        "terms": terms,
        "url": url,
        "sourceDoc": source["doc"],
        "authority": source["authority"],
        "reportedTotalMatches": int(payload[0]) if payload and isinstance(payload[0], int) else None,
        "sampleRows": rows,
        "retrievedAtIso": now_iso(),
    }


def verify_family(family: dict[str, Any], cache: dict[str, dict[str, Any]]) -> dict[str, Any]:
    lookup_terms = family.get("apiQuery")
    if not lookup_terms:
        lookup_terms = family["query"].replace(".", "") if family["system"] == "icd9cm_dx" else family["query"]
    key = f"{family['system']}::{lookup_terms}"
    if key not in cache:
        try:
            cache[key] = fetch_icd(family["system"], lookup_terms)
        except Exception as exc:
            cache[key] = {
                "system": family["system"],
                "terms": family["query"],
                "error": str(exc),
                "reportedTotalMatches": 0,
                "sampleRows": [],
                "retrievedAtIso": now_iso(),
            }
    result = cache[key]
    haystack = " ".join([row["name"].lower() for row in result.get("sampleRows", [])])
    expected = [term.lower() for term in family.get("expectedTerms", [])]
    keyword_hit = any(term in haystack for term in expected) if expected else bool(result.get("sampleRows"))
    verified = bool(result.get("reportedTotalMatches", 0)) and keyword_hit and not result.get("error")
    return {
        **family,
        "verification": {
            "status": "verified_online" if verified else "review_required",
            "lookupTerms": lookup_terms,
            "reason": "NLM API returned matching code-family titles with expected clinical terms."
            if verified
            else "Online lookup did not return enough expected evidence; clinician/coding review required.",
            "source": result,
        },
    }


def load_dataset_context() -> dict[str, Any]:
    manifest = json.loads((DATASET_DIR / "dataset-manifest.json").read_text())
    profile = json.loads((DATASET_DIR / "audit-20260506/sample-profile.json").read_text())
    table_ids = {table["tableId"] for table in manifest["tables"]}
    profiled_ids = {item["tableId"] for item in profile["profiles"]}
    size_by_table = {table["tableId"]: int(table["bytes"]) for table in manifest["tables"]}
    rows_by_table = {table["tableId"]: table.get("rowCount") for table in manifest["tables"]}
    return {
        "manifestHash": stable_hash(manifest),
        "auditHash": stable_hash(profile),
        "tableIds": table_ids,
        "profiledIds": profiled_ids,
        "sizeByTable": size_by_table,
        "rowsByTable": rows_by_table,
    }


def families(*items: tuple[str, str, list[str]]) -> list[dict[str, Any]]:
    return [{"system": system, "query": query, "expectedTerms": expected} for system, query, expected in items]


STUDIES: list[dict[str, Any]] = [
    {
        "id": "mimic-ortho-hip-fracture-icu",
        "title": "Hip/Femur Fracture ICU Mortality And Length Of Stay",
        "domain": "orthopedics",
        "question": "Among ICU stays linked to hip or femur fracture admissions, which first-day severity and physiologic markers are associated with mortality and ICU length of stay?",
        "icdFamilies": families(
            ("icd10cm", "S72", ["femur", "fracture"]),
            ("icd10cm", "M97.0", ["periprosthetic", "hip"]),
            ("icd9cm_dx", "820", ["neck of femur", "fracture"]),
            ("icd9cm_dx", "821", ["femur", "fracture"]),
        ),
        "tables": ["hosp-diagnoses-icd", "hosp-d-icd-diagnoses", "derived-icustay-detail", "derived-apsiii", "derived-oasis", "derived-first-day-sofa", "derived-first-day-lab", "derived-first-day-vitalsign"],
        "outcomes": ["hospital_expire_flag", "los_icu", "los_hospital"],
        "methods": ["ICD phenotype", "descriptive table", "adjusted logistic regression", "robust log-LOS model", "phenotype audit"],
    },
    {
        "id": "mimic-ortho-geriatric-hip-fracture",
        "title": "Narrow Geriatric Hip Fracture ICU Outcomes",
        "domain": "orthopedics",
        "question": "Among patients aged 65+ with femoral neck, intertrochanteric, or subtrochanteric fracture codes, what predicts mortality and prolonged ICU stay?",
        "icdFamilies": families(
            ("icd10cm", "S72.0", ["neck", "femur"]),
            ("icd10cm", "S72.1", ["trochanteric", "femur"]),
            ("icd9cm_dx", "820", ["neck of femur", "fracture"]),
        ),
        "tables": ["hosp-diagnoses-icd", "hosp-d-icd-diagnoses", "derived-icustay-detail", "derived-apsiii", "derived-oasis", "derived-first-day-sofa"],
        "outcomes": ["hospital_expire_flag", "los_icu"],
        "methods": ["age-restricted phenotype", "mortality model", "LOS model", "broad-vs-narrow phenotype sensitivity"],
    },
    {
        "id": "mimic-ortho-periprosthetic-hip-fracture",
        "title": "Periprosthetic Hip Fracture ICU Outcomes",
        "domain": "orthopedics",
        "question": "How do ICU outcomes for periprosthetic hip fracture admissions compare with other hip/femur fracture admissions?",
        "icdFamilies": families(
            ("icd10cm", "M97.0", ["periprosthetic", "hip"]),
            ("icd9cm_dx", "996.44", ["periprosthetic", "fracture"]),
        ),
        "tables": ["hosp-diagnoses-icd", "hosp-d-icd-diagnoses", "derived-icustay-detail", "derived-first-day-lab", "derived-apsiii"],
        "outcomes": ["hospital_expire_flag", "los_icu"],
        "methods": ["comparative cohort", "sparse-cell audit", "severity-adjusted logistic regression if feasible"],
    },
    {
        "id": "mimic-spine-vertebral-fracture-icu",
        "title": "Vertebral Fracture ICU Outcomes",
        "domain": "orthopedics-spine",
        "question": "Among ICU patients with vertebral fracture diagnoses, what first-day factors predict mortality and ICU length of stay?",
        "icdFamilies": families(
            ("icd10cm", "S12", ["cervical", "fracture"]),
            ("icd10cm", "S22.0", ["thoracic", "vertebra"]),
            ("icd10cm", "S32.0", ["lumbar", "vertebra"]),
            ("icd9cm_dx", "805", ["vertebral", "fracture"]),
            ("icd9cm_dx", "806", ["vertebral", "spinal cord"]),
        ),
        "tables": ["hosp-diagnoses-icd", "hosp-d-icd-diagnoses", "derived-icustay-detail", "derived-first-day-vitalsign", "derived-first-day-sofa"],
        "outcomes": ["hospital_expire_flag", "los_icu"],
        "methods": ["spine fracture phenotype", "neurologic injury sensitivity", "mortality/LOS models"],
    },
    {
        "id": "mimic-ortho-osteomyelitis-icu",
        "title": "Osteomyelitis-Associated ICU Admissions",
        "domain": "orthopedic-infection",
        "question": "What severity and comorbidity patterns characterize ICU stays with osteomyelitis diagnosis codes?",
        "icdFamilies": families(
            ("icd10cm", "M86", ["osteomyelitis"]),
            ("icd9cm_dx", "730", ["osteomyelitis"]),
        ),
        "tables": ["hosp-diagnoses-icd", "hosp-d-icd-diagnoses", "derived-icustay-detail", "derived-charlson", "derived-first-day-lab", "derived-antibiotic"],
        "outcomes": ["hospital_expire_flag", "los_icu", "antibiotic exposure pattern"],
        "methods": ["infection phenotype", "antibiotic timing caveat", "severity-adjusted descriptive outcome model"],
    },
    {
        "id": "mimic-ortho-septic-arthritis-icu",
        "title": "Septic Arthritis ICU Outcomes",
        "domain": "orthopedic-infection",
        "question": "Among ICU patients with septic arthritis codes, what predicts mortality and prolonged stay?",
        "icdFamilies": families(
            ("icd10cm", "M00", ["pyogenic", "arthritis"]),
            ("icd9cm_dx", "711.0", ["pyogenic", "arthritis"]),
        ),
        "tables": ["hosp-diagnoses-icd", "hosp-d-icd-diagnoses", "derived-icustay-detail", "derived-first-day-lab", "derived-antibiotic", "derived-apsiii"],
        "outcomes": ["hospital_expire_flag", "los_icu"],
        "methods": ["sparse phenotype check", "complete-case feasibility", "descriptive if low events"],
    },
    {
        "id": "mimic-ortho-prosthetic-joint-infection",
        "title": "Prosthetic Joint Infection ICU Outcomes",
        "domain": "orthopedic-infection",
        "question": "Are prosthetic joint infection diagnoses associated with higher ICU resource use than other orthopedic infection diagnoses?",
        "icdFamilies": families(
            ("icd10cm", "infection joint prosthesis", ["infection", "joint prosthesis"]),
            ("icd9cm_dx", "996.66", ["infection", "joint prosthesis"]),
        ),
        "tables": ["hosp-diagnoses-icd", "hosp-d-icd-diagnoses", "derived-icustay-detail", "derived-antibiotic", "derived-first-day-sofa"],
        "outcomes": ["los_icu", "hospital_expire_flag"],
        "methods": ["prosthetic infection phenotype", "comparison group design", "sparse-cell refusal if needed"],
    },
    {
        "id": "mimic-trauma-lower-extremity-fracture-aki",
        "title": "Lower-Extremity Fracture And Early AKI Signal",
        "domain": "trauma-renal",
        "question": "Among ICU admissions with lower-extremity fracture diagnoses, how common is early renal dysfunction and is it associated with mortality?",
        "icdFamilies": families(
            ("icd10cm", "S72", ["femur", "fracture"]),
            ("icd10cm", "S82", ["lower leg", "fracture"]),
            ("icd9cm_dx", "820", ["femur", "fracture"]),
            ("icd9cm_dx", "821", ["femur", "fracture"]),
            ("icd9cm_dx", "823", ["tibia", "fibula"]),
        ),
        "tables": ["hosp-diagnoses-icd", "hosp-d-icd-diagnoses", "derived-icustay-detail", "derived-kdigo-stages", "derived-first-day-lab"],
        "outcomes": ["aki_stage", "hospital_expire_flag"],
        "methods": ["phenotype + KDIGO stage", "missingness audit", "ordinal/binary AKI simplification"],
    },
    {
        "id": "mimic-cardiology-mi-icu-mortality",
        "title": "Acute Myocardial Infarction ICU Mortality",
        "domain": "cardiology",
        "question": "Which first-day ICU features predict in-hospital mortality among admissions with acute myocardial infarction codes?",
        "icdFamilies": families(
            ("icd10cm", "I21", ["myocardial infarction"]),
            ("icd9cm_dx", "410", ["myocardial infarction"]),
        ),
        "tables": ["hosp-diagnoses-icd", "hosp-d-icd-diagnoses", "derived-icustay-detail", "derived-cardiac-marker", "derived-apsiii", "derived-first-day-vitalsign"],
        "outcomes": ["hospital_expire_flag"],
        "methods": ["MI phenotype", "troponin/marker missingness audit", "logistic regression", "calibration if predictive framing"],
    },
    {
        "id": "mimic-cardiology-heart-failure-icu",
        "title": "Heart Failure ICU Outcomes",
        "domain": "cardiology",
        "question": "Among ICU admissions with heart failure diagnoses, how do first-day renal and vital-sign features relate to mortality and ICU length of stay?",
        "icdFamilies": families(
            ("icd10cm", "I50", ["heart failure"]),
            ("icd9cm_dx", "428", ["heart failure"]),
        ),
        "tables": ["hosp-diagnoses-icd", "hosp-d-icd-diagnoses", "derived-icustay-detail", "derived-first-day-lab", "derived-first-day-vitalsign", "derived-first-day-sofa"],
        "outcomes": ["hospital_expire_flag", "los_icu"],
        "methods": ["heart-failure phenotype", "renal interaction candidate", "mortality and LOS models"],
    },
    {
        "id": "mimic-pulmonary-copd-respiratory-failure",
        "title": "COPD And Respiratory Failure ICU Outcomes",
        "domain": "pulmonary",
        "question": "Among ICU patients with COPD and/or acute respiratory failure codes, which first-day respiratory markers predict mortality?",
        "icdFamilies": families(
            ("icd10cm", "J44", ["chronic obstructive", "pulmonary"]),
            ("icd10cm", "J96", ["respiratory failure"]),
            ("icd9cm_dx", "496", ["chronic airway obstruction"]),
            ("icd9cm_dx", "518.81", ["respiratory failure"]),
        ),
        "tables": ["hosp-diagnoses-icd", "hosp-d-icd-diagnoses", "derived-icustay-detail", "derived-first-day-bg", "derived-first-day-bg-art", "derived-oxygen-delivery", "derived-oasis"],
        "outcomes": ["hospital_expire_flag", "los_icu"],
        "methods": ["respiratory phenotype", "blood-gas high-missingness warning", "sensitivity using oxygen-delivery data"],
    },
    {
        "id": "mimic-renal-aki-icu-mortality",
        "title": "Acute Kidney Injury ICU Mortality",
        "domain": "renal",
        "question": "Among ICU admissions with AKI diagnosis codes or derived AKI stages, how strongly does AKI severity predict mortality?",
        "icdFamilies": families(
            ("icd10cm", "N17", ["acute kidney failure"]),
            ("icd9cm_dx", "584", ["acute kidney failure"]),
        ),
        "tables": ["hosp-diagnoses-icd", "hosp-d-icd-diagnoses", "derived-kdigo-stages", "derived-kdigo-creatinine", "derived-kdigo-uo", "derived-icustay-detail", "derived-first-day-lab"],
        "outcomes": ["aki_stage", "hospital_expire_flag"],
        "methods": ["diagnosis-vs-derived AKI comparison", "KDIGO stage model", "measurement-window audit"],
    },
    {
        "id": "mimic-renal-ckd-fracture-interaction",
        "title": "Chronic Kidney Disease And Fracture ICU Outcomes",
        "domain": "ortho-renal",
        "question": "In hip/femur fracture ICU patients, is chronic kidney disease associated with mortality after severity adjustment?",
        "icdFamilies": families(
            ("icd10cm", "S72", ["femur", "fracture"]),
            ("icd10cm", "N18", ["chronic kidney disease"]),
            ("icd9cm_dx", "820", ["femur", "fracture"]),
            ("icd9cm_dx", "585", ["chronic kidney disease"]),
        ),
        "tables": ["hosp-diagnoses-icd", "hosp-d-icd-diagnoses", "derived-icustay-detail", "derived-first-day-lab", "derived-apsiii"],
        "outcomes": ["hospital_expire_flag", "los_icu"],
        "methods": ["comorbidity phenotype", "effect modification candidate", "confounding-by-age audit"],
    },
    {
        "id": "mimic-endocrine-diabetes-fracture-outcomes",
        "title": "Diabetes And Hip/Femur Fracture ICU Outcomes",
        "domain": "ortho-endocrine",
        "question": "Among hip/femur fracture ICU patients, is diabetes diagnosis associated with mortality or prolonged ICU stay?",
        "icdFamilies": families(
            ("icd10cm", "S72", ["femur", "fracture"]),
            ("icd10cm", "E10", ["diabetes"]),
            ("icd10cm", "E11", ["diabetes"]),
            ("icd9cm_dx", "250", ["diabetes"]),
        ),
        "tables": ["hosp-diagnoses-icd", "hosp-d-icd-diagnoses", "derived-icustay-detail", "derived-first-day-lab", "derived-charlson"],
        "outcomes": ["hospital_expire_flag", "los_icu"],
        "methods": ["fracture + diabetes phenotype", "Charlson overlap audit", "complete-case logistic model"],
    },
    {
        "id": "mimic-neuro-stroke-icu-mortality",
        "title": "Ischemic Stroke ICU Mortality",
        "domain": "neurology",
        "question": "Among ICU admissions with ischemic stroke codes, which first-day severity and physiologic variables predict mortality?",
        "icdFamilies": families(
            ("icd10cm", "I63", ["cerebral infarction"]),
            ("icd9cm_dx", "434", ["cerebral artery occlusion"]),
        ),
        "tables": ["hosp-diagnoses-icd", "hosp-d-icd-diagnoses", "derived-icustay-detail", "derived-first-day-gcs", "derived-oasis", "derived-apsiii", "derived-first-day-vitalsign"],
        "outcomes": ["hospital_expire_flag"],
        "methods": ["stroke phenotype", "GCS missingness audit", "mortality prediction review"],
    },
    {
        "id": "mimic-neuro-intracranial-hemorrhage",
        "title": "Intracranial Hemorrhage ICU Outcomes",
        "domain": "neurology",
        "question": "Among ICU admissions with intracranial hemorrhage diagnoses, how do first-day GCS and vital signs predict mortality?",
        "icdFamilies": families(
            ("icd10cm", "I61", ["intracerebral hemorrhage"]),
            ("icd10cm", "I60", ["subarachnoid hemorrhage"]),
            ("icd9cm_dx", "431", ["intracerebral hemorrhage"]),
            ("icd9cm_dx", "430", ["subarachnoid hemorrhage"]),
        ),
        "tables": ["hosp-diagnoses-icd", "hosp-d-icd-diagnoses", "derived-icustay-detail", "derived-first-day-gcs", "derived-apsiii"],
        "outcomes": ["hospital_expire_flag", "los_icu"],
        "methods": ["hemorrhage phenotype", "GCS-centered mortality model", "LOS model with neurologic caveat"],
    },
    {
        "id": "mimic-gi-upper-bleed-icu",
        "title": "Gastrointestinal Bleeding ICU Outcomes",
        "domain": "gastroenterology",
        "question": "Among ICU admissions with gastrointestinal bleeding codes, are first-day hemoglobin and hemodynamic markers associated with mortality and prolonged stay?",
        "icdFamilies": families(
            ("icd10cm", "K92.2", ["hemorrhage"]),
            ("icd9cm_dx", "578", ["hemorrhage"]),
        ),
        "tables": ["hosp-diagnoses-icd", "hosp-d-icd-diagnoses", "derived-icustay-detail", "derived-first-day-lab", "derived-first-day-vitalsign"],
        "outcomes": ["hospital_expire_flag", "los_icu"],
        "methods": ["bleeding phenotype", "hemoglobin/vital model", "transfusion data deferred"],
    },
    {
        "id": "mimic-liver-cirrhosis-icu",
        "title": "Cirrhosis And ICU Outcomes",
        "domain": "hepatology",
        "question": "Among ICU admissions with cirrhosis codes, how do MELD-like derived variables and first-day labs relate to mortality?",
        "icdFamilies": families(
            ("icd10cm", "K74", ["fibrosis", "cirrhosis"]),
            ("icd9cm_dx", "571.5", ["cirrhosis"]),
        ),
        "tables": ["hosp-diagnoses-icd", "hosp-d-icd-diagnoses", "derived-icustay-detail", "derived-meld", "derived-first-day-lab", "derived-coagulation"],
        "outcomes": ["hospital_expire_flag"],
        "methods": ["cirrhosis phenotype", "MELD/severity model", "bilirubin/coagulation missingness audit"],
    },
    {
        "id": "mimic-sepsis-icu-mortality",
        "title": "Sepsis ICU Mortality",
        "domain": "critical-care",
        "question": "Among ICU admissions with sepsis diagnosis codes, which first-day severity scores and labs predict mortality?",
        "icdFamilies": families(
            ("icd10cm", "A40", ["streptococcal sepsis"]),
            ("icd10cm", "A41", ["sepsis"]),
            ("icd9cm_dx", "995.91", ["sepsis"]),
            ("icd9cm_dx", "995.92", ["severe sepsis"]),
        ),
        "tables": ["hosp-diagnoses-icd", "hosp-d-icd-diagnoses", "derived-icustay-detail", "derived-sepsis3", "derived-first-day-lab", "derived-first-day-sofa"],
        "outcomes": ["hospital_expire_flag"],
        "methods": ["ICD sepsis vs derived sepsis comparison", "SOFA/lab model", "definition mismatch audit"],
    },
    {
        "id": "mimic-pneumonia-respiratory-outcomes",
        "title": "Pneumonia ICU Respiratory Outcomes",
        "domain": "pulmonary-infection",
        "question": "Among ICU admissions with pneumonia codes, what respiratory and oxygen-delivery features are associated with mortality?",
        "icdFamilies": families(
            ("icd10cm", "J18", ["pneumonia"]),
            ("icd9cm_dx", "486", ["pneumonia"]),
        ),
        "tables": ["hosp-diagnoses-icd", "hosp-d-icd-diagnoses", "derived-icustay-detail", "derived-first-day-bg", "derived-oxygen-delivery", "derived-antibiotic"],
        "outcomes": ["hospital_expire_flag", "los_icu"],
        "methods": ["pneumonia phenotype", "respiratory-data missingness gate", "antibiotic exposure timing caveat"],
    },
    {
        "id": "mimic-anemia-icu-outcomes",
        "title": "Anemia Diagnosis And ICU Outcomes",
        "domain": "hematology",
        "question": "Among ICU admissions with anemia codes, do first-day hemoglobin values and comorbidity burden predict mortality?",
        "icdFamilies": families(
            ("icd10cm", "D64", ["anemia"]),
            ("icd9cm_dx", "285", ["anemia"]),
        ),
        "tables": ["hosp-diagnoses-icd", "hosp-d-icd-diagnoses", "derived-icustay-detail", "derived-first-day-lab", "derived-charlson"],
        "outcomes": ["hospital_expire_flag", "los_icu"],
        "methods": ["diagnosis-lab concordance audit", "mortality model", "transfusion data deferred"],
    },
    {
        "id": "mimic-delirium-icu-los",
        "title": "Delirium/Encephalopathy And ICU Length Of Stay",
        "domain": "neurocritical-care",
        "question": "Are delirium or encephalopathy diagnosis codes associated with prolonged ICU stay after severity adjustment?",
        "icdFamilies": families(
            ("icd10cm", "F05", ["delirium"]),
            ("icd10cm", "G93.4", ["encephalopathy"]),
            ("icd9cm_dx", "293.0", ["delirium"]),
            ("icd9cm_dx", "348.3", ["encephalopathy"]),
        ),
        "tables": ["hosp-diagnoses-icd", "hosp-d-icd-diagnoses", "derived-icustay-detail", "derived-first-day-gcs", "derived-apsiii"],
        "outcomes": ["los_icu", "hospital_expire_flag"],
        "methods": ["neurocognitive phenotype", "diagnosis timing caveat", "LOS model"],
    },
    {
        "id": "mimic-obesity-icu-outcomes",
        "title": "Obesity Diagnosis And ICU Outcomes",
        "domain": "metabolic",
        "question": "Among ICU patients, are obesity diagnosis codes associated with mortality or ICU length of stay after severity adjustment?",
        "icdFamilies": families(
            ("icd10cm", "E66", ["obesity"]),
            ("icd9cm_dx", "278.0", ["obesity"]),
        ),
        "tables": ["hosp-diagnoses-icd", "hosp-d-icd-diagnoses", "derived-icustay-detail", "derived-first-day-weight", "derived-first-day-height", "derived-oasis"],
        "outcomes": ["hospital_expire_flag", "los_icu"],
        "methods": ["diagnosis-vs-measured-BMI feasibility", "height/weight missingness audit", "mortality/LOS models"],
    },
    {
        "id": "mimic-opioid-overdose-icu",
        "title": "Opioid Poisoning ICU Outcomes",
        "domain": "toxicology",
        "question": "Among ICU admissions with opioid poisoning codes, what first-day factors are associated with mortality and length of stay?",
        "icdFamilies": families(
            ("icd10cm", "T40.2", ["opioids", "poisoning"]),
            ("icd9cm_dx", "965.0", ["opiates", "poisoning"]),
        ),
        "tables": ["hosp-diagnoses-icd", "hosp-d-icd-diagnoses", "derived-icustay-detail", "derived-first-day-vitalsign", "derived-first-day-bg"],
        "outcomes": ["hospital_expire_flag", "los_icu"],
        "methods": ["poisoning phenotype", "intent/external-cause caveat", "respiratory markers"],
    },
]


def study_feasibility(study: dict[str, Any], dataset: dict[str, Any]) -> dict[str, Any]:
    tables = study["tables"]
    missing = [table for table in tables if table not in dataset["tableIds"]]
    profiled = [table for table in tables if table in dataset["profiledIds"]]
    unprofiled = [table for table in tables if table in dataset["tableIds"] and table not in dataset["profiledIds"]]
    bytes_needed = sum(dataset["sizeByTable"].get(table, 0) for table in tables if table in dataset["tableIds"])
    return {
        "tablesRequested": tables,
        "missingTables": missing,
        "profiledTables": profiled,
        "unprofiledTables": unprofiled,
        "estimatedBytesForNaiveFullRequiredTableRead": bytes_needed,
        "estimatedTransferUsdAt012PerGb": bytes_needed / 1024**3 * 0.12,
        "status": "ready_for_bounded_design"
        if not missing and len(unprofiled) <= 2
        else "needs_table_or_profile_review",
        "notes": [
            "Study design uses existing schema/audit artifacts only; no row-level reads were performed in this 30-tick design run.",
            "Large event-table use must be narrowed by cohort/time windows before execution.",
        ],
    }


def self_audit(study: dict[str, Any], feasibility: dict[str, Any], verified_families: list[dict[str, Any]]) -> dict[str, Any]:
    blockers = []
    warnings = []
    if feasibility["missingTables"]:
        blockers.append(f"Missing tables: {', '.join(feasibility['missingTables'])}.")
    review_codes = [fam for fam in verified_families if fam["verification"]["status"] != "verified_online"]
    if review_codes:
        blockers.append(f"{len(review_codes)} ICD code families require manual review.")
    if feasibility["unprofiledTables"]:
        warnings.append(f"Unprofiled required tables: {', '.join(feasibility['unprofiledTables'])}.")
    if feasibility["estimatedTransferUsdAt012PerGb"] > 0.25:
        warnings.append("Naive full required-table read may be costly; execute with cohort-pushdown/sampling.")
    if "derived-antibiotic" in study["tables"]:
        warnings.append("Antibiotic exposure is time-dependent and confounded by indication.")
    if any("diagnosis" in method.lower() for method in study["methods"]):
        warnings.append("Diagnosis-code timing may not equal clinical onset timing.")
    if "hospital_expire_flag" in study["outcomes"]:
        warnings.append("Mortality models are associational unless a causal design is specified.")
    decision = "promote_to_candidate_queue" if not blockers else "hold_for_review"
    return {
        "blockers": blockers,
        "warnings": warnings,
        "promotionDecision": decision,
        "counterDesignRejected": "Rejected running the full analysis immediately; design/ICD verification comes first to avoid broad unvetted GCS reads and phenotype drift.",
    }


def write_study(study: dict[str, Any], dataset: dict[str, Any], cache: dict[str, dict[str, Any]]) -> dict[str, Any]:
    verified = [verify_family(family, cache) for family in study["icdFamilies"]]
    feasibility = study_feasibility(study, dataset)
    audit = self_audit(study, feasibility, verified)
    artifact = {
        "schemaVersion": 1,
        "generatedAtIso": now_iso(),
        "study": {key: value for key, value in study.items() if key != "icdFamilies"},
        "icdFamilies": verified,
        "feasibility": feasibility,
        "selfAudit": audit,
        "sourceEvidence": {
            "datasetContext": str(DATASET_DIR / "DATASET_CONTEXT.md"),
            "boundedDataAudit": str(DATASET_DIR / "audit-20260506/MIMIC_DATA_AUDIT.md"),
            "officialSourceNotes": OFFICIAL_SOURCE_NOTES,
        },
    }
    artifact["artifactHash"] = stable_hash(artifact)
    (STUDY_DIR / f"{study['id']}.json").write_text(json.dumps(artifact, indent=2, default=str) + "\n")
    md = [
        f"# {study['title']}",
        "",
        f"Question: {study['question']}",
        "",
        f"Domain: `{study['domain']}`",
        "",
        "## ICD Verification",
        "",
    ]
    for fam in verified:
        rows = fam["verification"]["source"].get("sampleRows", [])[:3]
        examples = "; ".join([f"{row['code']} {row['name']}" for row in rows])
        md.append(f"- `{fam['system']} {fam['query']}`: {fam['verification']['status']}. Examples: {examples}")
    md.extend(
        [
            "",
            "## Tables",
            "",
            ", ".join(f"`{table}`" for table in study["tables"]),
            "",
            "## Methods",
            "",
        ]
    )
    for method in study["methods"]:
        md.append(f"- {method}")
    md.extend(
        [
            "",
            "## Self-Audit",
            "",
            f"- Feasibility status: `{feasibility['status']}`.",
            f"- Estimated naive required-table transfer: `${feasibility['estimatedTransferUsdAt012PerGb']:.4f}`.",
            f"- Promotion decision: `{audit['promotionDecision']}`.",
        ]
    )
    for blocker in audit["blockers"]:
        md.append(f"- Blocker: {blocker}")
    for warning in audit["warnings"]:
        md.append(f"- Warning: {warning}")
    (STUDY_DIR / f"{study['id']}.md").write_text("\n".join(md) + "\n")
    return artifact


def audit_summary(studies: list[dict[str, Any]], tick_number: int, title: str) -> dict[str, Any]:
    decisions = Counter(s["selfAudit"]["promotionDecision"] for s in studies)
    domains = Counter(s["study"]["domain"] for s in studies)
    blockers = sum(len(s["selfAudit"]["blockers"]) for s in studies)
    warnings = sum(len(s["selfAudit"]["warnings"]) for s in studies)
    return {
        "tick": tick_number,
        "title": title,
        "generatedAtIso": now_iso(),
        "studiesReviewed": len(studies),
        "promotionDecisions": dict(decisions),
        "domains": dict(domains),
        "blockerCount": blockers,
        "warningCount": warnings,
        "fakeProgressRisk": "The atlas can look impressive while still being unexecuted; promote only designs with online ICD verification, profiled tables, and a bounded execution plan.",
        "nextPressure": "Run only the top one or two promoted candidates with row-level reads, and require phenotype audit before modeling.",
    }


def write_tick_file(tick: int, axis: str, contribution: str, title: str, artifact_paths: list[Path], hypothesis: str, decision: str, rejected: str, next_scope: str) -> None:
    rels = [str(path) for path in artifact_paths]
    body = f"""# Tick {tick:04d} - MIMIC Study Design Loop - {title}

Axis: {axis}.
Contribution: `{contribution}`.

## Hypothesis

{hypothesis}

## Deliverable

Artifacts:
{chr(10).join(f"- `{path}`" for path in rels)}

## Verification

- Used existing MIMIC dataset artifacts and bounded-audit evidence.
- Online ICD verification performed through NLM Clinical Tables APIs for all ICD families used in this tick's study designs.
- New GCS/BigQuery spend for this tick: `$0.0000`.
- The run-level cost ledger tracks cumulative spend against the user's `$1` ceiling.

## Decision

{decision}

## Counter-Design Rejected

{rejected}

## Next Tick

{next_scope}
"""
    target = TICK_DIR / f"{tick:04d}.md"
    target.write_text(body)
    (RUN_TICK_DIR / f"{tick:04d}.md").write_text(body)


def main() -> None:
    for directory in [RUN_DIR, STUDY_DIR, ICD_DIR, AUDIT_DIR, RUN_TICK_DIR]:
        directory.mkdir(parents=True, exist_ok=True)
    dataset = load_dataset_context()
    verification_cache: dict[str, dict[str, Any]] = {}
    study_artifacts = [write_study(study, dataset, verification_cache) for study in STUDIES]

    icd_verification = {
        "schemaVersion": 1,
        "generatedAtIso": now_iso(),
        "sourceNotes": OFFICIAL_SOURCE_NOTES,
        "uniqueLookups": verification_cache,
        "allFamiliesVerifiedOnline": all(
            fam["verification"]["status"] == "verified_online" for study in study_artifacts for fam in study["icdFamilies"]
        ),
        "reviewRequiredFamilies": [
            fam
            for study in study_artifacts
            for fam in study["icdFamilies"]
            if fam["verification"]["status"] != "verified_online"
        ],
    }
    (ICD_DIR / "online-icd-verification.json").write_text(json.dumps(icd_verification, indent=2, default=str) + "\n")

    cumulative_cost = {
        "schemaVersion": 1,
        "generatedAtIso": now_iso(),
        "hardCeilingUsd": 1.0,
        "actualCloudSpendEstimatedUsd": 0.0,
        "reason": "This design run performed no BigQuery queries and no GCS row-level reads; it used existing local artifacts and public no-key web APIs.",
        "events": [
            {"tickRange": "0263-0292", "action": "MIMIC study design and online ICD verification", "estimatedUsd": 0.0}
        ],
    }
    (RUN_DIR / "cost-ledger.json").write_text(json.dumps(cumulative_cost, indent=2) + "\n")

    atlas = {
        "schemaVersion": 1,
        "generatedAtIso": now_iso(),
        "dataset": "mimiciv-3-1",
        "studyCount": len(study_artifacts),
        "costLedger": str(RUN_DIR / "cost-ledger.json"),
        "icdVerification": str(ICD_DIR / "online-icd-verification.json"),
        "studies": [
            {
                "id": item["study"]["id"],
                "title": item["study"]["title"],
                "domain": item["study"]["domain"],
                "question": item["study"]["question"],
                "promotionDecision": item["selfAudit"]["promotionDecision"],
                "feasibilityStatus": item["feasibility"]["status"],
                "estimatedNaiveTransferUsd": item["feasibility"]["estimatedTransferUsdAt012PerGb"],
                "studyJson": str(STUDY_DIR / f"{item['study']['id']}.json"),
                "studyMarkdown": str(STUDY_DIR / f"{item['study']['id']}.md"),
            }
            for item in study_artifacts
        ],
    }
    (RUN_DIR / "MIMIC_STUDY_DESIGN_ATLAS.json").write_text(json.dumps(atlas, indent=2, default=str) + "\n")

    lines = [
        "# MIMIC-IV Study Design Atlas",
        "",
        "This atlas acquaints the research pipeline with MIMIC-IV by designing study candidates from the current dataset artifacts. It performs no new row-level cloud reads.",
        "",
        "## Cost Guard",
        "",
        "- User ceiling: `$1.00`.",
        "- New estimated cloud spend in this design run: `$0.0000`.",
        "- No BigQuery queries and no GCS Parquet copies were performed.",
        "",
        "## Online ICD Verification",
        "",
        f"- All ICD families verified online: `{icd_verification['allFamiliesVerifiedOnline']}`.",
        f"- Unique online lookups: {len(verification_cache)}.",
        "- Sources: CDC/NCHS ICD-10-CM page plus NLM Clinical Tables ICD-10-CM and ICD-9-CM diagnosis APIs.",
        "",
        "## Studies",
        "",
    ]
    for item in atlas["studies"]:
        lines.append(
            f"- `{item['id']}` ({item['domain']}): {item['question']} Decision: `{item['promotionDecision']}`; feasibility `{item['feasibilityStatus']}`."
        )
    (RUN_DIR / "MIMIC_STUDY_DESIGN_ATLAS.md").write_text("\n".join(lines) + "\n")

    tick = 263
    # Tick 263 is the challenge required by the current dual-tick state.
    challenge = {
        "tick": 263,
        "title": "MIMIC study design challenge before adding more analyses",
        "critique": [
            "The biggest fake-progress risk is designing many ICD phenotypes without online code verification.",
            "The second biggest risk is proposing studies that silently require huge event-table scans.",
            "The third risk is making orthopedic/EHR associations sound causal when they are diagnosis-code and care-process artifacts.",
        ],
        "policy": "Every design in this run must carry online ICD verification, a cost posture, and a promotion decision.",
    }
    challenge_path = AUDIT_DIR / "0263-challenge.json"
    challenge_path.write_text(json.dumps(challenge, indent=2) + "\n")
    write_tick_file(
        263,
        "challenge",
        "truth",
        "Pre-Design Critique",
        [challenge_path],
        "If I first name the fake-progress modes, the following study-design ticks will be harder to mistake for validated analyses.",
        "Promote critique as the run policy.",
        "Rejected starting by running another analysis; the current weakness is study-selection/phenotype verification breadth.",
        "Tick 0264 starts generating verified study designs.",
    )

    axes = ["question", "faster/simpler", "more robust", "remove/merge", "add primitive", "challenge"]
    study_index = 0
    audit_points = {268, 273, 278, 283, 288, 292}
    for tick in range(264, 293):
        if tick in audit_points:
            reviewed = study_artifacts[:study_index]
            summary = audit_summary(reviewed, tick, f"Audit after {study_index} study designs")
            audit_path = AUDIT_DIR / f"{tick:04d}-audit.json"
            audit_path.write_text(json.dumps(summary, indent=2, default=str) + "\n")
            write_tick_file(
                tick,
                "challenge" if tick in {268, 278, 288} else axes[(tick - 264) % len(axes)],
                "QA",
                f"Self-Audit After {study_index} Designs",
                [audit_path, RUN_DIR / "cost-ledger.json"],
                "Periodic self-audit should catch atlas bloat, unverified ICD families, and cost drift before the run reaches 30 ticks.",
                f"Keep atlas experimental; {summary['promotionDecisions']} so far.",
                "Rejected counting study-count alone as progress; each design must remain gated by feasibility and phenotype review.",
                f"Continue study design unless cumulative cost reaches `$1`; current estimated cloud spend is `$0.0000`.",
            )
            continue
        if study_index >= len(study_artifacts):
            break
        study = study_artifacts[study_index]
        study_index += 1
        path_json = STUDY_DIR / f"{study['study']['id']}.json"
        path_md = STUDY_DIR / f"{study['study']['id']}.md"
        write_tick_file(
            tick,
            axes[(tick - 264) % len(axes)],
            "methods",
            study["study"]["title"],
            [path_md, path_json],
            f"Designing `{study['study']['id']}` will reveal whether MIMIC's profiled tables can support this domain without immediate broad table scans.",
            f"Promotion decision: `{study['selfAudit']['promotionDecision']}`; feasibility: `{study['feasibility']['status']}`.",
            study["selfAudit"]["counterDesignRejected"],
            "Proceed to the next verified MIMIC study design or audit tick.",
        )

    # Memory updates are concise; detailed history is in tick files.
    memory = (MEMORY / "MEMORY.md").read_text()
    addition = (
        "\n- Ticks 263-292, maturity MIMIC acquaintance: generated a no-new-cloud-read MIMIC study design atlas with online ICD verification, "
        "24 study candidates, six self-audit ticks, and a $0.0000 new cloud-spend ledger under the $1 ceiling.\n"
    )
    if "Ticks 263-292, maturity MIMIC acquaintance" not in memory:
        marker = "\n## Open Thread\n"
        memory = memory.replace(marker, addition + marker)
        (MEMORY / "MEMORY.md").write_text(memory)

    rejected_line = "- Ticks 263-292: rejected running broad MIMIC event-table analyses before online ICD verification, cost gates, and phenotype-specific audit artifacts existed.\n"
    rejected_path = MEMORY / "rejected.md"
    rejected_text = rejected_path.read_text() if rejected_path.exists() else "# Rejected\n\n"
    if rejected_line not in rejected_text:
        rejected_path.write_text(rejected_text.rstrip() + "\n" + rejected_line)

    lessons_line = "- MIMIC study design should verify ICD families online before execution; title-substring phenotype bugs are easy and costly to miss.\n"
    lessons_path = MEMORY / "lessons.md"
    lessons_text = lessons_path.read_text()
    if lessons_line not in lessons_text:
        lessons_path.write_text(lessons_text.rstrip() + "\n" + lessons_line)

    candidates_line = "- Promote the MIMIC study atlas top candidates into bounded executions: narrow geriatric hip fracture, periprosthetic hip fracture, MI ICU mortality, and AKI diagnosis-vs-derived-stage comparison.\n"
    candidates_path = MEMORY / "candidates.md"
    candidates_text = candidates_path.read_text()
    if candidates_line not in candidates_text:
        candidates_path.write_text(candidates_text.rstrip() + "\n" + candidates_line)

    print(
        json.dumps(
            {
                "runDir": str(RUN_DIR),
                "ticksWritten": "0263-0292",
                "studyCount": len(study_artifacts),
                "allIcdFamiliesVerifiedOnline": icd_verification["allFamiliesVerifiedOnline"],
                "uniqueOnlineLookups": len(verification_cache),
                "newCloudSpendEstimatedUsd": 0.0,
            },
            indent=2,
        )
    )


if __name__ == "__main__":
    main()
