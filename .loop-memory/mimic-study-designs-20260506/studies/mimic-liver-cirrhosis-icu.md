# Cirrhosis And ICU Outcomes

Question: Among ICU admissions with cirrhosis codes, how do MELD-like derived variables and first-day labs relate to mortality?

Domain: `hepatology`

## ICD Verification

- `icd10cm K74`: verified_online. Examples: K74.00 Hepatic fibrosis, unspecified; K74.01 Hepatic fibrosis, early fibrosis; K74.02 Hepatic fibrosis, advanced fibrosis
- `icd9cm_dx 571.5`: verified_online. Examples: 571.5 Cirrhosis of liver without mention of alcohol

## Tables

`hosp-diagnoses-icd`, `hosp-d-icd-diagnoses`, `derived-icustay-detail`, `derived-meld`, `derived-first-day-lab`, `derived-coagulation`

## Methods

- cirrhosis phenotype
- MELD/severity model
- bilirubin/coagulation missingness audit

## Self-Audit

- Feasibility status: `ready_for_bounded_design`.
- Estimated naive required-table transfer: `$0.0138`.
- Promotion decision: `promote_to_candidate_queue`.
- Warning: Unprofiled required tables: derived-coagulation.
- Warning: Mortality models are associational unless a causal design is specified.
