# Heart Failure ICU Outcomes

Question: Among ICU admissions with heart failure diagnoses, how do first-day renal and vital-sign features relate to mortality and ICU length of stay?

Domain: `cardiology`

## ICD Verification

- `icd10cm I50`: verified_online. Examples: I50.1 Left ventricular failure, unspecified; I50.20 Unspecified systolic (congestive) heart failure; I50.21 Acute systolic (congestive) heart failure
- `icd9cm_dx 428`: verified_online. Examples: 428.0 Congestive heart failure, unspecified; 428.1 Left heart failure; 428.20 Systolic heart failure, unspecified

## Tables

`hosp-diagnoses-icd`, `hosp-d-icd-diagnoses`, `derived-icustay-detail`, `derived-first-day-lab`, `derived-first-day-vitalsign`, `derived-first-day-sofa`

## Methods

- heart-failure phenotype
- renal interaction candidate
- mortality and LOS models

## Self-Audit

- Feasibility status: `ready_for_bounded_design`.
- Estimated naive required-table transfer: `$0.0093`.
- Promotion decision: `promote_to_candidate_queue`.
- Warning: Mortality models are associational unless a causal design is specified.
