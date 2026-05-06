# Chronic Kidney Disease And Fracture ICU Outcomes

## Plain-Language Summary

This analysis used MIMIC-IV ICU records to study: In hip/femur fracture ICU patients, is chronic kidney disease associated with mortality after severity adjustment? The results are observational and describe associations in hospitalized ICU patients, not causal effects.

## Cohort

- Matched diagnosis codes: 2694.
- Matched diagnosis rows: 70214.
- Matched hospital admissions: 68964.
- First ICU stay cohort rows: 14584.
- Unique patients: 11460.

## Methods

Diagnosis-code families were verified online before execution, then matched against the local MIMIC diagnosis dictionary. The primary cohort used the first ICU stay per matching hospitalization. Models used complete-case analysis for available first-day severity, laboratory, and vital-sign predictors.

## Cohort Characteristics

- admission_age: median 75.00 (IQR 66.00-84.00), n=14584.
- los_icu: median 2.08 (IQR 1.17-4.04), n=14582.
- los_hospital: median 8.00 (IQR 5.00-14.00), n=14584.
- apsiii: median 47.00 (IQR 38.00-59.00), n=14584.
- In-hospital mortality: 2170 of 14584 (14.9%).
- Male sex: 8896 of 14584 (61.0%).

## Mortality Model

Complete-case N=14422; deaths=2129; AUROC=0.787; average precision=0.437.
- apsiii: adjusted OR 2.61 (2.48, 2.75), p=2.6e-286, per 1 SD.
- admission_age: adjusted OR 1.39 (1.31, 1.48), p=3.7e-29, per 1 SD.
- bun_max: adjusted OR 1.27 (1.20, 1.35), p=3.22e-14, per 1 SD.
- creatinine_max: adjusted OR 0.90 (0.84, 0.96), p=0.00215, per 1 SD.
- wbc_max: adjusted OR 1.04 (1.00, 1.08), p=0.0418, per 1 SD.
- hemoglobin_min: adjusted OR 1.05 (1.00, 1.11), p=0.0738, per 1 SD.

## ICU Length Of Stay Model

Complete-case N=14413; R-squared=0.059.
- apsiii: 15.9% change (14.2%, 17.6%), p=1.14e-88, per 1 SD.
- admission_age: -4.8% change (-5.9%, -3.8%), p=3.64e-19, per 1 SD.
- creatinine_max: -2.5% change (-3.9%, -1.1%), p=0.000482, per 1 SD.
- male: 3.7% change (1.5%, 6.0%), p=0.000937, per unit.
- wbc_max: 4.1% change (1.4%, 6.8%), p=0.00287, per 1 SD.
- glucose_max: -1.2% change (-2.2%, -0.2%), p=0.0231, per 1 SD.

## Missingness

- glucose_max: 116 missing (0.8%).
- hemoglobin_min: 109 missing (0.7%).
- wbc_max: 109 missing (0.7%).
- creatinine_max: 81 missing (0.6%).
- bun_max: 76 missing (0.5%).
- los_icu: 2 missing (0.0%).
- admission_age: 0 missing (0.0%).
- male: 0 missing (0.0%).
- apsiii: 0 missing (0.0%).
- hospital_expire_flag: 0 missing (0.0%).

## Quality And Cost Controls

- QA status: pass.
- Estimated run cost: $0.0087.
- Cumulative estimated session cost: $0.1869 of $1.00.
- Temporary row-level cache removed: yes.

## Limitations

- This is an observational diagnosis-code-based analysis.
- Diagnosis codes may reflect billing/coding and may not perfectly identify clinical onset, severity, or reason for ICU admission.
- First-day variables may be care-process markers as well as illness-severity markers.
- Complete-case models should be reviewed before publication-quality use.
