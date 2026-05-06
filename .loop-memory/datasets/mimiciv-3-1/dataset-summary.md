# MIMIC-IV v3.1 Local GCS Parquet Cache

## What This Dataset Is

MIMIC-IV v3.1 exported from BigQuery public PhysioNet tables to a project-owned GCS Parquet cache for local/controlled analysis planning.

Source: gs://agenteer-mimiciv-cache-ultra-sound-403618/mimiciv/v3.1/
Domain: ehr
Tables: 81
Profiled tables: 81
Known rows across tables: 935654014
Storage footprint: 28.30 GiB

## Standard Files For Agents

- `dataset-manifest.json`: source, access, storage, table inventory, and fixed file locations.
- `variable-registry.json`: variable roles, inferred types, semantic tags, and variable-level watchouts.
- `relationship-graph.json`: inferred table relationships and entity keys.
- `data-profile.json`: table and column profiling evidence.
- `watchouts.json`: consolidated blockers, warnings, and notes.
- `question-seeds.json`: candidate research questions that still require protocol review.
- `DATASET_CONTEXT.md`: short agent-facing context to read before every planning round.

## Variable Role Inventory

- covariate_candidate: 3
- exposure_candidate: 21
- feature: 588
- id: 189
- outcome_candidate: 53
- survey_weight: 5
- text: 17
- time: 101

## Relationship Map

- hosp-patients to derived-acei via subject_id (one-to-many, confidence 0.9).
- hosp-patients to derived-age via subject_id (one-to-many, confidence 0.9).
- hosp-patients to derived-antibiotic via subject_id (one-to-many, confidence 0.9).
- hosp-patients to derived-apsiii via subject_id (one-to-many, confidence 0.9).
- hosp-patients to derived-arb via subject_id (one-to-many, confidence 0.9).
- hosp-patients to derived-bg via subject_id (one-to-many, confidence 0.9).
- hosp-patients to derived-blood-differential via subject_id (one-to-many, confidence 0.9).
- hosp-patients to derived-cardiac-marker via subject_id (one-to-many, confidence 0.9).
- hosp-patients to derived-charlson via subject_id (one-to-many, confidence 0.9).
- hosp-patients to derived-chemistry via subject_id (one-to-many, confidence 0.9).
- hosp-patients to derived-coagulation via subject_id (one-to-many, confidence 0.9).
- hosp-patients to derived-code-status via subject_id (one-to-many, confidence 0.9).
- hosp-patients to derived-complete-blood-count via subject_id (one-to-many, confidence 0.9).
- hosp-patients to derived-enzyme via subject_id (one-to-many, confidence 0.9).
- hosp-patients to derived-first-day-bg via subject_id (one-to-many, confidence 0.9).
- hosp-patients to derived-first-day-bg-art via subject_id (one-to-many, confidence 0.9).
- hosp-patients to derived-first-day-gcs via subject_id (one-to-many, confidence 0.9).
- hosp-patients to derived-first-day-height via subject_id (one-to-many, confidence 0.9).
- hosp-patients to derived-first-day-lab via subject_id (one-to-many, confidence 0.9).
- hosp-patients to derived-first-day-rrt via subject_id (one-to-many, confidence 0.9).

## Things To Watch Out For

- NOTE SCHEMA_METADATA_ONLY (81): Column names and types came from metadata; missingness/distribution profiling requires local files or samples.
- LATEST_BOUNDED_DATA_AUDIT: `/Users/saleh/TechProjects/agenteer/.loop-memory/datasets/mimiciv-3-1/audit-20260506/MIMIC_DATA_AUDIT.md` profiled 50 small/high-value Parquet tables from the GCS cache with 239.11 MiB copied/read, estimated transfer cost $0.0280, temporary row-level cache removed, and one blocker: 175 `hosp-admissions` rows have `dischtime` earlier than `admittime`.

## Candidate Research Directions

- question_01_259a7246: Is Apsiii associated with Hr Score in mimiciv-3-1? Suggested design: cross-sectional association.
- question_02_8cb9f6c2: Is Apsiii Prob associated with Hr Score in mimiciv-3-1? Suggested design: cross-sectional association.
- question_03_c90d5246: Is Apsiii associated with Mbp Score in mimiciv-3-1? Suggested design: cross-sectional association.
- question_04_737538c6: Is Apsiii Prob associated with Mbp Score in mimiciv-3-1? Suggested design: cross-sectional association.
- question_05_d34ed490: Is Apsiii associated with Temp Score in mimiciv-3-1? Suggested design: cross-sectional association.
- question_06_a031941a: Is Apsiii Prob associated with Temp Score in mimiciv-3-1? Suggested design: cross-sectional association.
- question_07_8107ea01: Is Apsiii associated with Resp Rate Score in mimiciv-3-1? Suggested design: cross-sectional association.
- question_08_04a74d34: Is Apsiii Prob associated with Resp Rate Score in mimiciv-3-1? Suggested design: cross-sectional association.
- question_09_f02e8632: Is Apsiii associated with Pao2 Aado2 Score in mimiciv-3-1? Suggested design: cross-sectional association.
- question_10_6c3e53cf: Is Apsiii Prob associated with Pao2 Aado2 Score in mimiciv-3-1? Suggested design: cross-sectional association.

## Required Before Serious Analysis

- Confirm source license/access rules and whether row-level data may be exported.
- Attach or verify codebooks for variable meanings and coding.
- Confirm table joins and analytic unit before joining tables.
- Run method selection against a specific research question before modeling.
- Treat generated question seeds as exploratory until a protocol is approved.
