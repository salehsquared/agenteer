# Critique: Hip/Femur Fracture ICU Outcomes

## Verdict

This is a credible first-pass observational analysis for dogfooding the research pipeline. It should not be treated as publication-ready until the ICD phenotype is clinician-reviewed and the model specification is prospectively frozen.

## Strengths

- Uses actual MIMIC-IV Parquet tables rather than fixtures.
- Has explicit cost accounting and kept the run under one cent by conservative transfer estimate.
- Deletes temporary row-level cache and saves only aggregate artifacts.
- Defines a reproducible ICD phenotype and saves the matched code list.
- Uses first ICU stay per fracture hospitalization to reduce duplicated admission weighting.
- Fits mortality, log ICU length-of-stay, and prolonged-stay models with clear complete-case denominators.
- Includes phenotype audit after catching an initial false-positive title-match issue.

## Main Risks

- The ICD phenotype is broad. It includes femur shaft, hip, periprosthetic, pathological, stress, and physeal femur fracture codes. That is reasonable for "hip/femur fracture ICU outcomes" but too broad for a pure geriatric hip-fracture paper.
- Diagnosis codes identify admissions with coded fractures; they do not prove fracture acuity, timing, operative treatment, trauma mechanism, or reason for ICU admission.
- The model adjusts for severity scores that may already include parts of the physiologic signal, so coefficient interpretation is descriptive rather than mechanistic.
- OASIS, APS III, and SOFA are correlated. The model is useful for prediction/association but not ideal for isolating independent biological effects.
- Complete-case analysis is acceptable here because model-variable missingness is low, but this should be recorded as a design choice, not a universal policy.
- No external validation split was used. AUROC describes apparent in-sample performance only.

## What I Would Improve Next

- Add a narrow geriatric hip-fracture phenotype: femoral neck/intertrochanteric/subtrochanteric fracture only, age >= 65.
- Separate operative/procedure-coded admissions from non-operative admissions using `hosp-procedures-icd`.
- Add discharge disposition as a functional proxy, after carefully handling missing `discharge_location`.
- Add a train/test or bootstrap validation layer for model performance.
- Add calibration slope/intercept and calibration plot data for the mortality model.
- Create a phenotype comparison table: broad hip/femur fracture vs narrow hip fracture vs periprosthetic fracture.
