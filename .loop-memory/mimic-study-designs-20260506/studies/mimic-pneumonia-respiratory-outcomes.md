# Pneumonia ICU Respiratory Outcomes

Question: Among ICU admissions with pneumonia codes, what respiratory and oxygen-delivery features are associated with mortality?

Domain: `pulmonary-infection`

## ICD Verification

- `icd10cm J18`: verified_online. Examples: J18.0 Bronchopneumonia, unspecified organism; J18.1 Lobar pneumonia, unspecified organism; J18.2 Hypostatic pneumonia, unspecified organism
- `icd9cm_dx 486`: verified_online. Examples: 486 Pneumonia, organism unspecified

## Tables

`hosp-diagnoses-icd`, `hosp-d-icd-diagnoses`, `derived-icustay-detail`, `derived-first-day-bg`, `derived-oxygen-delivery`, `derived-antibiotic`

## Methods

- pneumonia phenotype
- respiratory-data missingness gate
- antibiotic exposure timing caveat

## Self-Audit

- Feasibility status: `ready_for_bounded_design`.
- Estimated naive required-table transfer: `$0.0113`.
- Promotion decision: `promote_to_candidate_queue`.
- Warning: Antibiotic exposure is time-dependent and confounded by indication.
- Warning: Mortality models are associational unless a causal design is specified.
