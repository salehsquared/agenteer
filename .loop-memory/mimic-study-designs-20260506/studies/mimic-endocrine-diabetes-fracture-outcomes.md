# Diabetes And Hip/Femur Fracture ICU Outcomes

Question: Among hip/femur fracture ICU patients, is diabetes diagnosis associated with mortality or prolonged ICU stay?

Domain: `ortho-endocrine`

## ICD Verification

- `icd10cm S72`: verified_online. Examples: S72.001A Fracture of unspecified part of neck of right femur, initial encounter for closed fracture; S72.001B Fracture of unspecified part of neck of right femur, initial encounter for open fracture type I or II; S72.001C Fracture of unspecified part of neck of right femur, initial encounter for open fracture type IIIA, IIIB, or IIIC
- `icd10cm E10`: verified_online. Examples: E10.10 Type 1 diabetes mellitus with ketoacidosis without coma; E10.11 Type 1 diabetes mellitus with ketoacidosis with coma; E10.21 Type 1 diabetes mellitus with diabetic nephropathy
- `icd10cm E11`: verified_online. Examples: E11.00 Type 2 diabetes mellitus with hyperosmolarity without nonketotic hyperglycemic-hyperosmolar coma (NKHHC); E11.01 Type 2 diabetes mellitus with hyperosmolarity with coma; E11.10 Type 2 diabetes mellitus with ketoacidosis without coma
- `icd9cm_dx 250`: verified_online. Examples: 250.00 Diabetes mellitus without mention of complication, type II or unspecified type, not stated as uncontrolled; 250.01 Diabetes mellitus without mention of complication, type I [juvenile type], not stated as uncontrolled; 250.02 Diabetes mellitus without mention of complication, type II or unspecified type, uncontrolled

## Tables

`hosp-diagnoses-icd`, `hosp-d-icd-diagnoses`, `derived-icustay-detail`, `derived-first-day-lab`, `derived-charlson`

## Methods

- fracture + diabetes phenotype
- Charlson overlap audit
- complete-case logistic model

## Self-Audit

- Feasibility status: `ready_for_bounded_design`.
- Estimated naive required-table transfer: `$0.0093`.
- Promotion decision: `promote_to_candidate_queue`.
- Warning: Mortality models are associational unless a causal design is specified.
