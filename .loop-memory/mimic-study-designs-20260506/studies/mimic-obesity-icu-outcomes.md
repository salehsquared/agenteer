# Obesity Diagnosis And ICU Outcomes

Question: Among ICU patients, are obesity diagnosis codes associated with mortality or ICU length of stay after severity adjustment?

Domain: `metabolic`

## ICD Verification

- `icd10cm E66`: verified_online. Examples: E66.01 Morbid (severe) obesity due to excess calories; E66.09 Other obesity due to excess calories; E66.1 Drug-induced obesity
- `icd9cm_dx 278.0`: verified_online. Examples: 278.00 Obesity, unspecified; 278.01 Morbid obesity; 278.02 Overweight

## Tables

`hosp-diagnoses-icd`, `hosp-d-icd-diagnoses`, `derived-icustay-detail`, `derived-first-day-weight`, `derived-first-day-height`, `derived-oasis`

## Methods

- diagnosis-vs-measured-BMI feasibility
- height/weight missingness audit
- mortality/LOS models

## Self-Audit

- Feasibility status: `ready_for_bounded_design`.
- Estimated naive required-table transfer: `$0.0083`.
- Promotion decision: `promote_to_candidate_queue`.
- Warning: Diagnosis-code timing may not equal clinical onset timing.
- Warning: Mortality models are associational unless a causal design is specified.
