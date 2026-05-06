# Delirium/Encephalopathy And ICU Length Of Stay

Question: Are delirium or encephalopathy diagnosis codes associated with prolonged ICU stay after severity adjustment?

Domain: `neurocritical-care`

## ICD Verification

- `icd10cm F05`: verified_online. Examples: F05 Delirium due to known physiological condition
- `icd10cm G93.4`: verified_online. Examples: G93.40 Encephalopathy, unspecified; G93.41 Metabolic encephalopathy; G93.42 Megalencephalic leukoencephalopathy with subcortical cysts
- `icd9cm_dx 293.0`: verified_online. Examples: 293.0 Delirium due to conditions classified elsewhere
- `icd9cm_dx 348.3`: verified_online. Examples: 348.30 Encephalopathy, unspecified; 348.31 Metabolic encephalopathy; 348.39 Other encephalopathy

## Tables

`hosp-diagnoses-icd`, `hosp-d-icd-diagnoses`, `derived-icustay-detail`, `derived-first-day-gcs`, `derived-apsiii`

## Methods

- neurocognitive phenotype
- diagnosis timing caveat
- LOS model

## Self-Audit

- Feasibility status: `ready_for_bounded_design`.
- Estimated naive required-table transfer: `$0.0080`.
- Promotion decision: `promote_to_candidate_queue`.
- Warning: Diagnosis-code timing may not equal clinical onset timing.
- Warning: Mortality models are associational unless a causal design is specified.
