# NHANES Research Registry and Local Exploration Table

## What This Dataset Is

NHANES public-health survey registry derived from the MedBrevia read-only NHANES registry, with CDC source URLs, survey design metadata, variable codebook entries, weight rules, and the existing local adult exploration table as a profiled analysis artifact.

Source: https://wwwn.cdc.gov/Nchs/Nhanes
Domain: public-health-survey
Tables: 19
Profiled tables: 19
Known rows across tables: 31849
Storage footprint: 3.61 MiB

## Standard Files For Agents

- `dataset-manifest.json`: source, access, storage, table inventory, and fixed file locations.
- `variable-registry.json`: variable roles, inferred types, semantic tags, and variable-level watchouts.
- `relationship-graph.json`: inferred table relationships and entity keys.
- `data-profile.json`: table and column profiling evidence.
- `watchouts.json`: consolidated blockers, warnings, and notes.
- `question-seeds.json`: candidate research questions that still require protocol review.
- `DATASET_CONTEXT.md`: short agent-facing context to read before every planning round.

## Variable Role Inventory

- covariate_candidate: 1
- exposure_candidate: 13
- feature: 31
- id: 19
- outcome_candidate: 16
- survey_design: 4
- survey_weight: 8
- time: 1

## Relationship Map

- actual-adult-exploration-table to registry-alb-cr via SEQN (one-to-many, confidence 0.9).
- actual-adult-exploration-table to registry-biopro via SEQN (one-to-many, confidence 0.9).
- actual-adult-exploration-table to registry-bmx via SEQN (one-to-many, confidence 0.9).
- actual-adult-exploration-table to registry-bpq via SEQN (one-to-many, confidence 0.9).
- actual-adult-exploration-table to registry-bpx via SEQN (one-to-many, confidence 0.9).
- actual-adult-exploration-table to registry-bpxo via SEQN (one-to-many, confidence 0.9).
- actual-adult-exploration-table to registry-demo via SEQN (one-to-many, confidence 0.9).
- actual-adult-exploration-table to registry-diq via SEQN (one-to-many, confidence 0.9).
- actual-adult-exploration-table to registry-ghb via SEQN (one-to-many, confidence 0.9).
- actual-adult-exploration-table to registry-glu via SEQN (one-to-many, confidence 0.9).
- actual-adult-exploration-table to registry-hdl via SEQN (one-to-many, confidence 0.9).
- actual-adult-exploration-table to registry-hiq via SEQN (one-to-many, confidence 0.9).
- actual-adult-exploration-table to registry-huq via SEQN (one-to-many, confidence 0.9).
- actual-adult-exploration-table to registry-rxq-rx via SEQN (one-to-many, confidence 0.9).
- actual-adult-exploration-table to registry-smq via SEQN (one-to-many, confidence 0.9).
- actual-adult-exploration-table to registry-tchol via SEQN (one-to-many, confidence 0.9).
- actual-adult-exploration-table to registry-trigly via SEQN (one-to-many, confidence 0.9).
- actual-adult-exploration-table to registry-vid via SEQN (one-to-many, confidence 0.9).
- registry-alb-cr to registry-biopro via SEQN (unknown, confidence 0.9).
- registry-alb-cr to registry-bmx via SEQN (unknown, confidence 0.9).

## Things To Watch Out For

- NOTE SCHEMA_METADATA_ONLY (19): Column names and types came from metadata; missingness/distribution profiling requires local files or samples.

## Candidate Research Directions

- question_01_df54a69a: Is Urine albumin/creatinine ratio associated with Ever told you had high blood pressure in nhanes? Suggested design: cross-sectional association.
- question_02_58c04510: Is Urine creatinine associated with Ever told you had high blood pressure in nhanes? Suggested design: cross-sectional association.
- question_03_dc98cf84: Is Urine albumin associated with Ever told you had high blood pressure in nhanes? Suggested design: cross-sectional association.
- question_04_59fdf15a: Is Creatinine associated with Ever told you had high blood pressure in nhanes? Suggested design: cross-sectional association.
- question_05_34e51d40: Is Body mass index associated with Ever told you had high blood pressure in nhanes? Suggested design: cross-sectional association.
- question_06_e783475b: Is Standing height associated with Ever told you had high blood pressure in nhanes? Suggested design: cross-sectional association.
- question_07_acd7c472: Is Waist circumference associated with Ever told you had high blood pressure in nhanes? Suggested design: cross-sectional association.
- question_08_923b930e: Is Education level - adults 20+ associated with Ever told you had high blood pressure in nhanes? Suggested design: descriptive.
- question_09_acd1c9cc: Is Marital status associated with Ever told you had high blood pressure in nhanes? Suggested design: descriptive.
- question_10_4883be07: Is Family income to poverty ratio associated with Ever told you had high blood pressure in nhanes? Suggested design: descriptive.

## Required Before Serious Analysis

- Confirm source license/access rules and whether row-level data may be exported.
- Attach or verify codebooks for variable meanings and coding.
- Confirm table joins and analytic unit before joining tables.
- Run method selection against a specific research question before modeling.
- Treat generated question seeds as exploratory until a protocol is approved.
