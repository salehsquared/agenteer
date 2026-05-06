# Lower-Extremity Fracture And Early AKI Signal

## Plain-Language Summary

This analysis used MIMIC-IV ICU records to study: Among ICU admissions with lower-extremity fracture diagnoses, how common is early renal dysfunction and is it associated with mortality? The results are observational and describe associations in hospitalized ICU patients, not causal effects.

## Cohort

- Matched diagnosis codes: 6059.
- Matched diagnosis rows: 9918.
- Matched hospital admissions: 8626.
- First ICU stay cohort rows: 1181.
- Unique patients: 1168.

## Methods

Diagnosis-code families were verified online before execution, then matched against the local MIMIC diagnosis dictionary. The primary cohort used the first ICU stay per matching hospitalization. Models used complete-case analysis for available first-day severity, laboratory, and vital-sign predictors.

## Cohort Characteristics

- admission_age: median 70.00 (IQR 52.00-85.00), n=1181.
- los_icu: median 2.13 (IQR 1.08-4.42), n=1181.
- los_hospital: median 9.00 (IQR 6.00-16.00), n=1181.
- In-hospital mortality: 156 of 1181 (13.2%).
- Male sex: 572 of 1181 (48.4%).

## Mortality Model

Complete-case N=1164; deaths=153; AUROC=0.726; average precision=0.326.
- admission_age: adjusted OR 1.63 (1.27, 2.08), p=0.000114, per 1 SD.
- bun_max: adjusted OR 1.50 (1.21, 1.87), p=0.000283, per 1 SD.
- wbc_max: adjusted OR 1.17 (0.99, 1.38), p=0.0593, per 1 SD.
- aki_stage: adjusted OR 1.71 (0.98, 3.01), p=0.0609, per 1 SD.
- glucose_max: adjusted OR 1.12 (0.97, 1.29), p=0.112, per 1 SD.
- aki_stage_smoothed: adjusted OR 0.73 (0.41, 1.29), p=0.273, per 1 SD.

## ICU Length Of Stay Model

Complete-case N=1164; R-squared=0.306.
- aki_stage: 33.4% change (23.7%, 43.7%), p=5.13e-14, per 1 SD.
- admission_age: -13.7% change (-17.1%, -10.2%), p=3.25e-13, per 1 SD.
- wbc_max: 6.5% change (2.8%, 10.4%), p=0.000529, per 1 SD.
- creatinine_max: -7.8% change (-12.3%, -3.0%), p=0.00159, per 1 SD.
- hemoglobin_min: -4.9% change (-8.3%, -1.3%), p=0.00775, per 1 SD.
- aki_stage_smoothed: 8.9% change (1.1%, 17.3%), p=0.0253, per 1 SD.

## Missingness

- glucose_max: 15 missing (1.3%).
- creatinine_max: 12 missing (1.0%).
- hemoglobin_min: 11 missing (0.9%).
- wbc_max: 11 missing (0.9%).
- bun_max: 11 missing (0.9%).
- admission_age: 0 missing (0.0%).
- male: 0 missing (0.0%).
- aki_stage: 0 missing (0.0%).
- aki_stage_smoothed: 0 missing (0.0%).
- hospital_expire_flag: 0 missing (0.0%).

## Quality And Cost Controls

- QA status: pass.
- Estimated run cost: $0.0233.
- Cumulative estimated session cost: $0.1018 of $1.00.
- Temporary row-level cache removed: yes.

## Limitations

- This is an observational diagnosis-code-based analysis.
- Diagnosis codes may reflect billing/coding and may not perfectly identify clinical onset, severity, or reason for ICU admission.
- First-day variables may be care-process markers as well as illness-severity markers.
- Complete-case models should be reviewed before publication-quality use.
