# Lower-Extremity Fracture And Early AKI Signal

Question: Among ICU admissions with lower-extremity fracture diagnoses, how common is early renal dysfunction and is it associated with mortality?

Domain: `trauma-renal`

## ICD Verification

- `icd10cm S72`: verified_online. Examples: S72.001A Fracture of unspecified part of neck of right femur, initial encounter for closed fracture; S72.001B Fracture of unspecified part of neck of right femur, initial encounter for open fracture type I or II; S72.001C Fracture of unspecified part of neck of right femur, initial encounter for open fracture type IIIA, IIIB, or IIIC
- `icd10cm S82`: verified_online. Examples: S82.001A Unspecified fracture of right patella, initial encounter for closed fracture; S82.001B Unspecified fracture of right patella, initial encounter for open fracture type I or II; S82.001C Unspecified fracture of right patella, initial encounter for open fracture type IIIA, IIIB, or IIIC
- `icd9cm_dx 820`: verified_online. Examples: 820.00 Closed fracture of intracapsular section of neck of femur, unspecified; 820.01 Closed fracture of epiphysis (separation) (upper) of neck of femur; 820.02 Closed fracture of midcervical section of neck of femur
- `icd9cm_dx 821`: verified_online. Examples: 821.00 Closed fracture of unspecified part of femur; 821.01 Closed fracture of shaft of femur; 821.10 Open fracture of unspecified part of femur
- `icd9cm_dx 823`: verified_online. Examples: 823.00 Closed fracture of upper end of tibia alone; 823.01 Closed fracture of upper end of fibula alone; 823.02 Closed fracture of upper end of fibula with tibia

## Tables

`hosp-diagnoses-icd`, `hosp-d-icd-diagnoses`, `derived-icustay-detail`, `derived-kdigo-stages`, `derived-first-day-lab`

## Methods

- phenotype + KDIGO stage
- missingness audit
- ordinal/binary AKI simplification

## Self-Audit

- Feasibility status: `ready_for_bounded_design`.
- Estimated naive required-table transfer: `$0.0233`.
- Promotion decision: `promote_to_candidate_queue`.
- Warning: Unprofiled required tables: derived-kdigo-stages.
- Warning: Mortality models are associational unless a causal design is specified.
