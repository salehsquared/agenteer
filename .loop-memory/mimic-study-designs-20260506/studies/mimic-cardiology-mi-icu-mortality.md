# Acute Myocardial Infarction ICU Mortality

Question: Which first-day ICU features predict in-hospital mortality among admissions with acute myocardial infarction codes?

Domain: `cardiology`

## ICD Verification

- `icd10cm I21`: verified_online. Examples: I21.01 ST elevation (STEMI) myocardial infarction involving left main coronary artery; I21.02 ST elevation (STEMI) myocardial infarction involving left anterior descending coronary artery; I21.09 ST elevation (STEMI) myocardial infarction involving other coronary artery of anterior wall
- `icd9cm_dx 410`: verified_online. Examples: 410.00 Acute myocardial infarction of anterolateral wall, episode of care unspecified; 410.01 Acute myocardial infarction of anterolateral wall, initial episode of care; 410.02 Acute myocardial infarction of anterolateral wall, subsequent episode of care

## Tables

`hosp-diagnoses-icd`, `hosp-d-icd-diagnoses`, `derived-icustay-detail`, `derived-cardiac-marker`, `derived-apsiii`, `derived-first-day-vitalsign`

## Methods

- MI phenotype
- troponin/marker missingness audit
- logistic regression
- calibration if predictive framing

## Self-Audit

- Feasibility status: `ready_for_bounded_design`.
- Estimated naive required-table transfer: `$0.0095`.
- Promotion decision: `promote_to_candidate_queue`.
- Warning: Mortality models are associational unless a causal design is specified.
