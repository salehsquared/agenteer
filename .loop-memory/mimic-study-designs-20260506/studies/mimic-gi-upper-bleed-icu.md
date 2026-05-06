# Gastrointestinal Bleeding ICU Outcomes

Question: Among ICU admissions with gastrointestinal bleeding codes, are first-day hemoglobin and hemodynamic markers associated with mortality and prolonged stay?

Domain: `gastroenterology`

## ICD Verification

- `icd10cm K92.2`: verified_online. Examples: K92.2 Gastrointestinal hemorrhage, unspecified
- `icd9cm_dx 578`: verified_online. Examples: 578.0 Hematemesis; 578.1 Blood in stool; 578.9 Hemorrhage of gastrointestinal tract, unspecified

## Tables

`hosp-diagnoses-icd`, `hosp-d-icd-diagnoses`, `derived-icustay-detail`, `derived-first-day-lab`, `derived-first-day-vitalsign`

## Methods

- bleeding phenotype
- hemoglobin/vital model
- transfusion data deferred

## Self-Audit

- Feasibility status: `ready_for_bounded_design`.
- Estimated naive required-table transfer: `$0.0091`.
- Promotion decision: `promote_to_candidate_queue`.
- Warning: Mortality models are associational unless a causal design is specified.
