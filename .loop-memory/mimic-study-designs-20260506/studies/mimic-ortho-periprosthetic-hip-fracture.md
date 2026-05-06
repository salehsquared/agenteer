# Periprosthetic Hip Fracture ICU Outcomes

Question: How do ICU outcomes for periprosthetic hip fracture admissions compare with other hip/femur fracture admissions?

Domain: `orthopedics`

## ICD Verification

- `icd10cm M97.0`: verified_online. Examples: M97.01XA Periprosthetic fracture around internal prosthetic right hip joint, initial encounter; M97.01XD Periprosthetic fracture around internal prosthetic right hip joint, subsequent encounter; M97.01XS Periprosthetic fracture around internal prosthetic right hip joint, sequela
- `icd9cm_dx 996.44`: verified_online. Examples: 996.44 Peri-prosthetic fracture around prosthetic joint

## Tables

`hosp-diagnoses-icd`, `hosp-d-icd-diagnoses`, `derived-icustay-detail`, `derived-first-day-lab`, `derived-apsiii`

## Methods

- comparative cohort
- sparse-cell audit
- severity-adjusted logistic regression if feasible

## Self-Audit

- Feasibility status: `ready_for_bounded_design`.
- Estimated naive required-table transfer: `$0.0087`.
- Promotion decision: `promote_to_candidate_queue`.
- Warning: Mortality models are associational unless a causal design is specified.
