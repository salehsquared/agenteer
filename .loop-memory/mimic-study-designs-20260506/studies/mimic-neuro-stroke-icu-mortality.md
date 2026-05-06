# Ischemic Stroke ICU Mortality

Question: Among ICU admissions with ischemic stroke codes, which first-day severity and physiologic variables predict mortality?

Domain: `neurology`

## ICD Verification

- `icd10cm I63`: verified_online. Examples: I63.00 Cerebral infarction due to thrombosis of unspecified precerebral artery; I63.011 Cerebral infarction due to thrombosis of right vertebral artery; I63.012 Cerebral infarction due to thrombosis of left vertebral artery
- `icd9cm_dx 434`: verified_online. Examples: 434.00 Cerebral thrombosis without mention of cerebral infarction; 434.01 Cerebral thrombosis with cerebral infarction; 434.10 Cerebral embolism without mention of cerebral infarction

## Tables

`hosp-diagnoses-icd`, `hosp-d-icd-diagnoses`, `derived-icustay-detail`, `derived-first-day-gcs`, `derived-oasis`, `derived-apsiii`, `derived-first-day-vitalsign`

## Methods

- stroke phenotype
- GCS missingness audit
- mortality prediction review

## Self-Audit

- Feasibility status: `ready_for_bounded_design`.
- Estimated naive required-table transfer: `$0.0090`.
- Promotion decision: `promote_to_candidate_queue`.
- Warning: Mortality models are associational unless a causal design is specified.
