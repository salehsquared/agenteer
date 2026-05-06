# Chronic Kidney Disease And Fracture ICU Outcomes

Question: In hip/femur fracture ICU patients, is chronic kidney disease associated with mortality after severity adjustment?

Domain: `ortho-renal`

## ICD Verification

- `icd10cm S72`: verified_online. Examples: S72.001A Fracture of unspecified part of neck of right femur, initial encounter for closed fracture; S72.001B Fracture of unspecified part of neck of right femur, initial encounter for open fracture type I or II; S72.001C Fracture of unspecified part of neck of right femur, initial encounter for open fracture type IIIA, IIIB, or IIIC
- `icd10cm N18`: verified_online. Examples: N18.1 Chronic kidney disease, stage 1; N18.2 Chronic kidney disease, stage 2 (mild); N18.30 Chronic kidney disease, stage 3 unspecified
- `icd9cm_dx 820`: verified_online. Examples: 820.00 Closed fracture of intracapsular section of neck of femur, unspecified; 820.01 Closed fracture of epiphysis (separation) (upper) of neck of femur; 820.02 Closed fracture of midcervical section of neck of femur
- `icd9cm_dx 585`: verified_online. Examples: 585.1 Chronic kidney disease, Stage I; 585.2 Chronic kidney disease, Stage II (mild); 585.3 Chronic kidney disease, Stage III (moderate)

## Tables

`hosp-diagnoses-icd`, `hosp-d-icd-diagnoses`, `derived-icustay-detail`, `derived-first-day-lab`, `derived-apsiii`

## Methods

- comorbidity phenotype
- effect modification candidate
- confounding-by-age audit

## Self-Audit

- Feasibility status: `ready_for_bounded_design`.
- Estimated naive required-table transfer: `$0.0087`.
- Promotion decision: `promote_to_candidate_queue`.
- Warning: Mortality models are associational unless a causal design is specified.
