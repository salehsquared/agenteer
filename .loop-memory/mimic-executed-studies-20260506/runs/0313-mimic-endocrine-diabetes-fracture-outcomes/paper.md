# Diabetes And Hip/Femur Fracture ICU Outcomes

## Plain-Language Summary

This analysis used MIMIC-IV ICU records to study: Among hip/femur fracture ICU patients, is diabetes diagnosis associated with mortality or prolonged ICU stay? The results are observational and describe associations in hospitalized ICU patients, not causal effects.

## Cohort

- Matched diagnosis codes: 2929.
- Matched diagnosis rows: 182181.
- Matched hospital admissions: 134809.
- First ICU stay cohort rows: 25949.
- Unique patients: 19098.

## Methods

Diagnosis-code families were verified online before execution, then matched against the local MIMIC diagnosis dictionary. The primary cohort used the first ICU stay per matching hospitalization. Models used complete-case analysis for available first-day severity, laboratory, and vital-sign predictors.

## Cohort Characteristics

- admission_age: median 69.00 (IQR 59.00-78.00), n=25949.
- los_icu: median 2.00 (IQR 1.13-3.88), n=25943.
- los_hospital: median 7.00 (IQR 4.00-13.00), n=25949.
- In-hospital mortality: 3014 of 25949 (11.6%).
- Male sex: 14870 of 25949 (57.3%).

## Mortality Model

Complete-case N=25591; deaths=2930; AUROC=0.714; average precision=0.229.
- charlson_comorbidity_index: adjusted OR 1.53 (1.46, 1.60), p=1.99e-68, per 1 SD.
- bun_max: adjusted OR 1.34 (1.28, 1.40), p=1.25e-40, per 1 SD.
- wbc_max: adjusted OR 1.23 (1.18, 1.28), p=1.82e-23, per 1 SD.
- admission_age: adjusted OR 1.21 (1.15, 1.28), p=9.66e-13, per 1 SD.
- glucose_max: adjusted OR 1.11 (1.06, 1.15), p=1.42e-07, per 1 SD.
- male: adjusted OR 0.96 (0.88, 1.04), p=0.298, per unit.

## ICU Length Of Stay Model

Complete-case N=25578; R-squared=0.020.
- charlson_comorbidity_index: 5.1% change (4.0%, 6.2%), p=3.03e-20, per 1 SD.
- bun_max: 5.1% change (3.8%, 6.5%), p=1.03e-14, per 1 SD.
- admission_age: -3.3% change (-4.3%, -2.3%), p=4.92e-11, per 1 SD.
- wbc_max: 6.4% change (3.9%, 8.9%), p=3.14e-07, per 1 SD.
- male: 2.3% change (0.7%, 4.0%), p=0.00619, per unit.
- hemoglobin_min: -1.2% change (-2.1%, -0.3%), p=0.00752, per 1 SD.

## Missingness

- glucose_max: 264 missing (1.0%).
- wbc_max: 230 missing (0.9%).
- hemoglobin_min: 228 missing (0.9%).
- bun_max: 163 missing (0.6%).
- creatinine_max: 162 missing (0.6%).
- los_icu: 6 missing (0.0%).
- admission_age: 0 missing (0.0%).
- male: 0 missing (0.0%).
- charlson_comorbidity_index: 0 missing (0.0%).
- hospital_expire_flag: 0 missing (0.0%).

## Quality And Cost Controls

- QA status: pass.
- Estimated run cost: $0.0093.
- Cumulative estimated session cost: $0.1962 of $1.00.
- Temporary row-level cache removed: yes.

## Limitations

- This is an observational diagnosis-code-based analysis.
- Diagnosis codes may reflect billing/coding and may not perfectly identify clinical onset, severity, or reason for ICU admission.
- First-day variables may be care-process markers as well as illness-severity markers.
- Complete-case models should be reviewed before publication-quality use.
