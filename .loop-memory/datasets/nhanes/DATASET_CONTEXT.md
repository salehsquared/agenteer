# Dataset Context: nhanes

Read this file before planning with nhanes.

Manifest: /Users/saleh/TechProjects/agenteer/.loop-memory/datasets/nhanes/dataset-manifest.json
Variable registry: /Users/saleh/TechProjects/agenteer/.loop-memory/datasets/nhanes/variable-registry.json
Relationship graph: /Users/saleh/TechProjects/agenteer/.loop-memory/datasets/nhanes/relationship-graph.json
Profile: /Users/saleh/TechProjects/agenteer/.loop-memory/datasets/nhanes/data-profile.json
Watchouts: /Users/saleh/TechProjects/agenteer/.loop-memory/datasets/nhanes/watchouts.json
Question seeds: /Users/saleh/TechProjects/agenteer/.loop-memory/datasets/nhanes/question-seeds.json

## Operational Summary

- Domain: public-health-survey
- Tables: 19; profiled: 19
- Known rows: 31849
- Known variables: 93
- Inferred relationship edges: 171
- Watchouts: 0 blocker(s), 0 warning(s), 19 note(s).

## First Checks

- Use `dataset-manifest.json` to verify source and access boundaries.
- Use `variable-registry.json` before choosing outcome/exposure/covariates.
- Use `relationship-graph.json` before any multi-table materialization.
- Use `watchouts.json` to block high-missingness, semantic-range, low-information, and access-risk mistakes.
- Use `question-seeds.json` only as hypothesis-generation input, not as approved protocols.

## Top Question Seeds

- question_01_df54a69a: Is Urine albumin/creatinine ratio associated with Ever told you had high blood pressure in nhanes?
- question_02_58c04510: Is Urine creatinine associated with Ever told you had high blood pressure in nhanes?
- question_03_dc98cf84: Is Urine albumin associated with Ever told you had high blood pressure in nhanes?
- question_04_59fdf15a: Is Creatinine associated with Ever told you had high blood pressure in nhanes?
- question_05_34e51d40: Is Body mass index associated with Ever told you had high blood pressure in nhanes?
