# Septic Arthritis ICU Outcomes

Question: Among ICU patients with septic arthritis codes, what predicts mortality and prolonged stay?

Domain: `orthopedic-infection`

## ICD Verification

- `icd10cm M00`: verified_online. Examples: M00.00 Staphylococcal arthritis, unspecified joint; M00.011 Staphylococcal arthritis, right shoulder; M00.012 Staphylococcal arthritis, left shoulder
- `icd9cm_dx 711.0`: verified_online. Examples: 711.00 Pyogenic arthritis, site unspecified; 711.01 Pyogenic arthritis, shoulder region; 711.02 Pyogenic arthritis, upper arm

## Tables

`hosp-diagnoses-icd`, `hosp-d-icd-diagnoses`, `derived-icustay-detail`, `derived-first-day-lab`, `derived-antibiotic`, `derived-apsiii`

## Methods

- sparse phenotype check
- complete-case feasibility
- descriptive if low events

## Self-Audit

- Feasibility status: `ready_for_bounded_design`.
- Estimated naive required-table transfer: `$0.0111`.
- Promotion decision: `promote_to_candidate_queue`.
- Warning: Antibiotic exposure is time-dependent and confounded by indication.
- Warning: Mortality models are associational unless a causal design is specified.
