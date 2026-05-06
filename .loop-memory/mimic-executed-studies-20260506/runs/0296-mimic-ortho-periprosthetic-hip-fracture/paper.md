# Periprosthetic Hip Fracture ICU Outcomes

## Plain-Language Summary

This analysis used MIMIC-IV ICU records to study: How do ICU outcomes for periprosthetic hip fracture admissions compare with other hip/femur fracture admissions? The results are observational and describe associations in hospitalized ICU patients, not causal effects.

## Cohort

- Matched diagnosis codes: 10.
- Matched diagnosis rows: 460.
- Matched hospital admissions: 459.
- First ICU stay cohort rows: 55.
- Unique patients: 55.

## Methods

Diagnosis-code families were verified online before execution, then matched against the local MIMIC diagnosis dictionary. The primary cohort used the first ICU stay per matching hospitalization. Models used complete-case analysis for available first-day severity, laboratory, and vital-sign predictors.

## Cohort Characteristics

- admission_age: median 82.00 (IQR 75.50-86.50), n=55.
- los_icu: median 1.67 (IQR 0.96-3.40), n=55.
- los_hospital: median 9.00 (IQR 6.00-17.50), n=55.
- apsiii: median 44.00 (IQR 36.50-52.00), n=55.
- In-hospital mortality: 10 of 55 (18.2%).
- Male sex: 20 of 55 (36.4%).

## Mortality Model

Complete-case N=55; deaths=10; AUROC=0.893; average precision=0.850.
- wbc_max: adjusted OR 3.62 (1.19, 10.98), p=0.023, per 1 SD.
- apsiii: adjusted OR 4.76 (1.14, 19.80), p=0.0319, per 1 SD.
- male: adjusted OR 2.95 (0.34, 25.38), p=0.324, per unit.
- hemoglobin_min: adjusted OR 1.75 (0.53, 5.77), p=0.359, per 1 SD.
- admission_age: adjusted OR 0.59 (0.17, 2.03), p=0.4, per 1 SD.
- glucose_max: adjusted OR 1.41 (0.54, 3.68), p=0.488, per 1 SD.

## ICU Length Of Stay Model

Complete-case N=55; R-squared=0.158.
- male: 50.2% change (-0.3%, 126.3%), p=0.0519, per unit.
- wbc_max: 18.2% change (-8.2%, 52.3%), p=0.195, per 1 SD.
- hemoglobin_min: -13.4% change (-30.5%, 8.1%), p=0.203, per 1 SD.
- admission_age: -9.5% change (-31.8%, 20.1%), p=0.489, per 1 SD.
- apsiii: 10.0% change (-18.7%, 48.8%), p=0.539, per 1 SD.
- bun_max: -5.8% change (-29.2%, 25.5%), p=0.684, per 1 SD.

## Missingness

- admission_age: 0 missing (0.0%).
- male: 0 missing (0.0%).
- apsiii: 0 missing (0.0%).
- hemoglobin_min: 0 missing (0.0%).
- wbc_max: 0 missing (0.0%).
- creatinine_max: 0 missing (0.0%).
- bun_max: 0 missing (0.0%).
- glucose_max: 0 missing (0.0%).
- hospital_expire_flag: 0 missing (0.0%).
- los_icu: 0 missing (0.0%).

## Quality And Cost Controls

- QA status: review.
- Estimated run cost: $0.0087.
- Cumulative estimated session cost: $0.0259 of $1.00.
- Temporary row-level cache removed: yes.

## Limitations

- This is an observational diagnosis-code-based analysis.
- Diagnosis codes may reflect billing/coding and may not perfectly identify clinical onset, severity, or reason for ICU admission.
- First-day variables may be care-process markers as well as illness-severity markers.
- Complete-case models should be reviewed before publication-quality use.
