# Narrow Geriatric Hip Fracture ICU Outcomes

Question: Among patients aged 65+ with femoral neck, intertrochanteric, or subtrochanteric fracture codes, what predicts mortality and prolonged ICU stay?

Domain: `orthopedics`

## ICD Verification

- `icd10cm S72.0`: verified_online. Examples: S72.001A Fracture of unspecified part of neck of right femur, initial encounter for closed fracture; S72.001B Fracture of unspecified part of neck of right femur, initial encounter for open fracture type I or II; S72.001C Fracture of unspecified part of neck of right femur, initial encounter for open fracture type IIIA, IIIB, or IIIC
- `icd10cm S72.1`: verified_online. Examples: S72.101A Unspecified trochanteric fracture of right femur, initial encounter for closed fracture; S72.101B Unspecified trochanteric fracture of right femur, initial encounter for open fracture type I or II; S72.101C Unspecified trochanteric fracture of right femur, initial encounter for open fracture type IIIA, IIIB, or IIIC
- `icd9cm_dx 820`: verified_online. Examples: 820.00 Closed fracture of intracapsular section of neck of femur, unspecified; 820.01 Closed fracture of epiphysis (separation) (upper) of neck of femur; 820.02 Closed fracture of midcervical section of neck of femur

## Tables

`hosp-diagnoses-icd`, `hosp-d-icd-diagnoses`, `derived-icustay-detail`, `derived-apsiii`, `derived-oasis`, `derived-first-day-sofa`

## Methods

- age-restricted phenotype
- mortality model
- LOS model
- broad-vs-narrow phenotype sensitivity

## Self-Audit

- Feasibility status: `ready_for_bounded_design`.
- Estimated naive required-table transfer: `$0.0085`.
- Promotion decision: `promote_to_candidate_queue`.
- Warning: Mortality models are associational unless a causal design is specified.
