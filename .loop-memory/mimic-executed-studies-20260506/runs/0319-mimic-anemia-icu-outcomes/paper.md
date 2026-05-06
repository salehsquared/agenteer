# Anemia Diagnosis And ICU Outcomes

## Plain-Language Summary

This analysis used MIMIC-IV ICU records to study: Among ICU admissions with anemia codes, do first-day hemoglobin values and comorbidity burden predict mortality? The results are observational and describe associations in hospitalized ICU patients, not causal effects.

## Cohort

- Matched diagnosis codes: 18.
- Matched diagnosis rows: 71800.
- Matched hospital admissions: 70638.
- First ICU stay cohort rows: 18946.
- Unique patients: 16140.

## Methods

Diagnosis-code families were verified online before execution, then matched against the local MIMIC diagnosis dictionary. The primary cohort used the first ICU stay per matching hospitalization. Models used complete-case analysis for available first-day severity, laboratory, and vital-sign predictors.

## Cohort Characteristics

- admission_age: median 68.00 (IQR 56.00-79.00), n=18946.
- los_icu: median 2.17 (IQR 1.21-4.17), n=18943.
- los_hospital: median 8.00 (IQR 5.00-14.00), n=18946.
- In-hospital mortality: 2104 of 18946 (11.1%).
- Male sex: 10262 of 18946 (54.2%).

## Mortality Model

Complete-case N=18772; deaths=2074; AUROC=0.688; average precision=0.206.
- charlson_comorbidity_index: adjusted OR 1.54 (1.45, 1.63), p=4.16e-52, per 1 SD.
- bun_max: adjusted OR 1.35 (1.28, 1.42), p=3.34e-29, per 1 SD.
- wbc_max: adjusted OR 1.18 (1.13, 1.24), p=1.24e-14, per 1 SD.
- creatinine_max: adjusted OR 0.87 (0.81, 0.92), p=4.75e-06, per 1 SD.
- glucose_max: adjusted OR 1.09 (1.05, 1.14), p=2.02e-05, per 1 SD.
- hemoglobin_min: adjusted OR 0.90 (0.86, 0.95), p=2.89e-05, per 1 SD.

## ICU Length Of Stay Model

Complete-case N=18764; R-squared=0.022.
- bun_max: 7.4% change (6.0%, 8.9%), p=2.92e-25, per 1 SD.
- creatinine_max: -5.3% change (-6.4%, -4.1%), p=2.55e-18, per 1 SD.
- hemoglobin_min: 4.3% change (3.1%, 5.4%), p=3.48e-14, per 1 SD.
- admission_age: -3.4% change (-4.6%, -2.2%), p=2.56e-08, per 1 SD.
- wbc_max: 7.0% change (4.0%, 10.1%), p=3.45e-06, per 1 SD.
- glucose_max: 2.2% change (1.2%, 3.3%), p=1.52e-05, per 1 SD.

## Missingness

- glucose_max: 136 missing (0.7%).
- hemoglobin_min: 101 missing (0.5%).
- wbc_max: 100 missing (0.5%).
- creatinine_max: 91 missing (0.5%).
- bun_max: 90 missing (0.5%).
- los_icu: 3 missing (0.0%).
- admission_age: 0 missing (0.0%).
- male: 0 missing (0.0%).
- charlson_comorbidity_index: 0 missing (0.0%).
- hospital_expire_flag: 0 missing (0.0%).

## Quality And Cost Controls

- QA status: pass.
- Estimated run cost: $0.0093.
- Cumulative estimated session cost: $0.2454 of $1.00.
- Temporary row-level cache removed: yes.

## Limitations

- This is an observational diagnosis-code-based analysis.
- Diagnosis codes may reflect billing/coding and may not perfectly identify clinical onset, severity, or reason for ICU admission.
- First-day variables may be care-process markers as well as illness-severity markers.
- Complete-case models should be reviewed before publication-quality use.
