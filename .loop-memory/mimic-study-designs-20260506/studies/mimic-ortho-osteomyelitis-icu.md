# Osteomyelitis-Associated ICU Admissions

Question: What severity and comorbidity patterns characterize ICU stays with osteomyelitis diagnosis codes?

Domain: `orthopedic-infection`

## ICD Verification

- `icd10cm M86`: verified_online. Examples: M86.00 Acute hematogenous osteomyelitis, unspecified site; M86.011 Acute hematogenous osteomyelitis, right shoulder; M86.012 Acute hematogenous osteomyelitis, left shoulder
- `icd9cm_dx 730`: verified_online. Examples: 730.00 Acute osteomyelitis, site unspecified; 730.01 Acute osteomyelitis, shoulder region; 730.02 Acute osteomyelitis, upper arm

## Tables

`hosp-diagnoses-icd`, `hosp-d-icd-diagnoses`, `derived-icustay-detail`, `derived-charlson`, `derived-first-day-lab`, `derived-antibiotic`

## Methods

- infection phenotype
- antibiotic timing caveat
- severity-adjusted descriptive outcome model

## Self-Audit

- Feasibility status: `ready_for_bounded_design`.
- Estimated naive required-table transfer: `$0.0117`.
- Promotion decision: `promote_to_candidate_queue`.
- Warning: Antibiotic exposure is time-dependent and confounded by indication.
- Warning: Mortality models are associational unless a causal design is specified.
