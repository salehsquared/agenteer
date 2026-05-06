# Intracranial Hemorrhage ICU Outcomes

Question: Among ICU admissions with intracranial hemorrhage diagnoses, how do first-day GCS and vital signs predict mortality?

Domain: `neurology`

## ICD Verification

- `icd10cm I61`: verified_online. Examples: I61.0 Nontraumatic intracerebral hemorrhage in hemisphere, subcortical; I61.1 Nontraumatic intracerebral hemorrhage in hemisphere, cortical; I61.2 Nontraumatic intracerebral hemorrhage in hemisphere, unspecified
- `icd10cm I60`: verified_online. Examples: I60.00 Nontraumatic subarachnoid hemorrhage from unspecified carotid siphon and bifurcation; I60.01 Nontraumatic subarachnoid hemorrhage from right carotid siphon and bifurcation; I60.02 Nontraumatic subarachnoid hemorrhage from left carotid siphon and bifurcation
- `icd9cm_dx 431`: verified_online. Examples: 431 Intracerebral hemorrhage
- `icd9cm_dx 430`: verified_online. Examples: 430 Subarachnoid hemorrhage

## Tables

`hosp-diagnoses-icd`, `hosp-d-icd-diagnoses`, `derived-icustay-detail`, `derived-first-day-gcs`, `derived-apsiii`

## Methods

- hemorrhage phenotype
- GCS-centered mortality model
- LOS model with neurologic caveat

## Self-Audit

- Feasibility status: `ready_for_bounded_design`.
- Estimated naive required-table transfer: `$0.0080`.
- Promotion decision: `promote_to_candidate_queue`.
- Warning: Mortality models are associational unless a causal design is specified.
