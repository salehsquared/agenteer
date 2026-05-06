# Dataset Context: mimiciv-3-1

Read this file before planning with mimiciv-3-1.

Manifest: /Users/saleh/TechProjects/agenteer/.loop-memory/datasets/mimiciv-3-1/dataset-manifest.json
Variable registry: /Users/saleh/TechProjects/agenteer/.loop-memory/datasets/mimiciv-3-1/variable-registry.json
Relationship graph: /Users/saleh/TechProjects/agenteer/.loop-memory/datasets/mimiciv-3-1/relationship-graph.json
Profile: /Users/saleh/TechProjects/agenteer/.loop-memory/datasets/mimiciv-3-1/data-profile.json
Watchouts: /Users/saleh/TechProjects/agenteer/.loop-memory/datasets/mimiciv-3-1/watchouts.json
Question seeds: /Users/saleh/TechProjects/agenteer/.loop-memory/datasets/mimiciv-3-1/question-seeds.json
Latest bounded data audit: /Users/saleh/TechProjects/agenteer/.loop-memory/datasets/mimiciv-3-1/audit-20260506/MIMIC_DATA_AUDIT.md

## Operational Summary

- Domain: ehr
- Tables: 81; profiled: 81
- Known rows: 935654014
- Known variables: 977
- Inferred relationship edges: 217
- Watchouts: 0 blocker(s), 0 warning(s), 81 note(s).
- Latest bounded GCS Parquet audit: 50 tables profiled, 239.11 MiB read, estimated transfer cost $0.0280, one blocker found (`hosp-admissions` has 175 rows where `dischtime` is earlier than `admittime`).

## First Checks

- Use `dataset-manifest.json` to verify source and access boundaries.
- Use `variable-registry.json` before choosing outcome/exposure/covariates.
- Use `relationship-graph.json` before any multi-table materialization.
- Use `watchouts.json` to block high-missingness, semantic-range, low-information, and access-risk mistakes.
- Use the latest bounded data audit before any MIMIC study; it contains actual Parquet-derived missingness, plausibility, row-count, and integrity findings for the profiled subset.
- Use `question-seeds.json` only as hypothesis-generation input, not as approved protocols.

## Top Question Seeds

- question_01_259a7246: Is Apsiii associated with Hr Score in mimiciv-3-1?
- question_02_8cb9f6c2: Is Apsiii Prob associated with Hr Score in mimiciv-3-1?
- question_03_c90d5246: Is Apsiii associated with Mbp Score in mimiciv-3-1?
- question_04_737538c6: Is Apsiii Prob associated with Mbp Score in mimiciv-3-1?
- question_05_d34ed490: Is Apsiii associated with Temp Score in mimiciv-3-1?
