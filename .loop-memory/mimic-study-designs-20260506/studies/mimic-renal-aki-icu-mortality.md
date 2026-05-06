# Acute Kidney Injury ICU Mortality

Question: Among ICU admissions with AKI diagnosis codes or derived AKI stages, how strongly does AKI severity predict mortality?

Domain: `renal`

## ICD Verification

- `icd10cm N17`: verified_online. Examples: N17.0 Acute kidney failure with tubular necrosis; N17.1 Acute kidney failure with acute cortical necrosis; N17.2 Acute kidney failure with medullary necrosis
- `icd9cm_dx 584`: verified_online. Examples: 584.5 Acute kidney failure with lesion of tubular necrosis; 584.6 Acute kidney failure with lesion of renal cortical necrosis; 584.7 Acute kidney failure with lesion of renal medullary [papillary] necrosis

## Tables

`hosp-diagnoses-icd`, `hosp-d-icd-diagnoses`, `derived-kdigo-stages`, `derived-kdigo-creatinine`, `derived-kdigo-uo`, `derived-icustay-detail`, `derived-first-day-lab`

## Methods

- diagnosis-vs-derived AKI comparison
- KDIGO stage model
- measurement-window audit

## Self-Audit

- Feasibility status: `needs_table_or_profile_review`.
- Estimated naive required-table transfer: `$0.0367`.
- Promotion decision: `promote_to_candidate_queue`.
- Warning: Unprofiled required tables: derived-kdigo-stages, derived-kdigo-creatinine, derived-kdigo-uo.
- Warning: Diagnosis-code timing may not equal clinical onset timing.
- Warning: Mortality models are associational unless a causal design is specified.
