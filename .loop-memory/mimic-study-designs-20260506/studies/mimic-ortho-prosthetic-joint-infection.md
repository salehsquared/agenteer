# Prosthetic Joint Infection ICU Outcomes

Question: Are prosthetic joint infection diagnoses associated with higher ICU resource use than other orthopedic infection diagnoses?

Domain: `orthopedic-infection`

## ICD Verification

- `icd10cm infection joint prosthesis`: verified_online. Examples: T84.50XS Infection and inflammatory reaction due to unspecified internal joint prosthesis, sequela; T84.59XS Infection and inflammatory reaction due to other internal joint prosthesis, sequela; T84.50XA Infection and inflammatory reaction due to unspecified internal joint prosthesis, initial encounter
- `icd9cm_dx 996.66`: verified_online. Examples: 996.66 Infection and inflammatory reaction due to internal joint prosthesis

## Tables

`hosp-diagnoses-icd`, `hosp-d-icd-diagnoses`, `derived-icustay-detail`, `derived-antibiotic`, `derived-first-day-sofa`

## Methods

- prosthetic infection phenotype
- comparison group design
- sparse-cell refusal if needed

## Self-Audit

- Feasibility status: `ready_for_bounded_design`.
- Estimated naive required-table transfer: `$0.0103`.
- Promotion decision: `promote_to_candidate_queue`.
- Warning: Antibiotic exposure is time-dependent and confounded by indication.
- Warning: Mortality models are associational unless a causal design is specified.
