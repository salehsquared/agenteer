# Opioid Poisoning ICU Outcomes

Question: Among ICU admissions with opioid poisoning codes, what first-day factors are associated with mortality and length of stay?

Domain: `toxicology`

## ICD Verification

- `icd10cm T40.2`: verified_online. Examples: T40.2X1A Poisoning by other opioids, accidental (unintentional), initial encounter; T40.2X1D Poisoning by other opioids, accidental (unintentional), subsequent encounter; T40.2X1S Poisoning by other opioids, accidental (unintentional), sequela
- `icd9cm_dx 965.0`: verified_online. Examples: 965.00 Poisoning by opium (alkaloids), unspecified; 965.01 Poisoning by heroin; 965.02 Poisoning by methadone

## Tables

`hosp-diagnoses-icd`, `hosp-d-icd-diagnoses`, `derived-icustay-detail`, `derived-first-day-vitalsign`, `derived-first-day-bg`

## Methods

- poisoning phenotype
- intent/external-cause caveat
- respiratory markers

## Self-Audit

- Feasibility status: `ready_for_bounded_design`.
- Estimated naive required-table transfer: `$0.0086`.
- Promotion decision: `promote_to_candidate_queue`.
- Warning: Mortality models are associational unless a causal design is specified.
