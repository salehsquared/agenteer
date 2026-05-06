# Hip/Femur Fracture ICU Mortality And Length Of Stay

Question: Among ICU stays linked to hip or femur fracture admissions, which first-day severity and physiologic markers are associated with mortality and ICU length of stay?

Domain: `orthopedics`

## ICD Verification

- `icd10cm S72`: verified_online. Examples: S72.001A Fracture of unspecified part of neck of right femur, initial encounter for closed fracture; S72.001B Fracture of unspecified part of neck of right femur, initial encounter for open fracture type I or II; S72.001C Fracture of unspecified part of neck of right femur, initial encounter for open fracture type IIIA, IIIB, or IIIC
- `icd10cm M97.0`: verified_online. Examples: M97.01XA Periprosthetic fracture around internal prosthetic right hip joint, initial encounter; M97.01XD Periprosthetic fracture around internal prosthetic right hip joint, subsequent encounter; M97.01XS Periprosthetic fracture around internal prosthetic right hip joint, sequela
- `icd9cm_dx 820`: verified_online. Examples: 820.00 Closed fracture of intracapsular section of neck of femur, unspecified; 820.01 Closed fracture of epiphysis (separation) (upper) of neck of femur; 820.02 Closed fracture of midcervical section of neck of femur
- `icd9cm_dx 821`: verified_online. Examples: 821.00 Closed fracture of unspecified part of femur; 821.01 Closed fracture of shaft of femur; 821.10 Open fracture of unspecified part of femur

## Tables

`hosp-diagnoses-icd`, `hosp-d-icd-diagnoses`, `derived-icustay-detail`, `derived-apsiii`, `derived-oasis`, `derived-first-day-sofa`, `derived-first-day-lab`, `derived-first-day-vitalsign`

## Methods

- ICD phenotype
- descriptive table
- adjusted logistic regression
- robust log-LOS model
- phenotype audit

## Self-Audit

- Feasibility status: `ready_for_bounded_design`.
- Estimated naive required-table transfer: `$0.0099`.
- Promotion decision: `promote_to_candidate_queue`.
- Warning: Mortality models are associational unless a causal design is specified.
