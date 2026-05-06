# Acute Myocardial Infarction ICU Mortality

## Plain-Language Summary

This analysis used MIMIC-IV ICU records to study: Which first-day ICU features predict in-hospital mortality among admissions with acute myocardial infarction codes? The results are observational and describe associations in hospitalized ICU patients, not causal effects.

## Cohort

- Matched diagnosis codes: 41.
- Matched diagnosis rows: 11645.
- Matched hospital admissions: 11527.
- First ICU stay cohort rows: 6094.
- Unique patients: 5717.

## Methods

Diagnosis-code families were verified online before execution, then matched against the local MIMIC diagnosis dictionary. The primary cohort used the first ICU stay per matching hospitalization. Models used complete-case analysis for available first-day severity, laboratory, and vital-sign predictors.

## Cohort Characteristics

- admission_age: median 71.00 (IQR 62.00-80.00), n=6094.
- los_icu: median 2.13 (IQR 1.21-4.17), n=6092.
- los_hospital: median 8.00 (IQR 4.00-14.00), n=6094.
- apsiii: median 43.00 (IQR 31.00-57.00), n=6094.
- In-hospital mortality: 1070 of 6094 (17.6%).
- Male sex: 3918 of 6094 (64.3%).

## Mortality Model

Complete-case N=6016; deaths=1033; AUROC=0.821; average precision=0.510.
- apsiii: adjusted OR 2.66 (2.45, 2.90), p=1.69e-114, per 1 SD.
- admission_age: adjusted OR 1.42 (1.31, 1.54), p=1.19e-16, per 1 SD.
- sbp_min: adjusted OR 0.80 (0.74, 0.87), p=2.42e-07, per 1 SD.
- spo2_min: adjusted OR 0.86 (0.80, 0.92), p=1.81e-05, per 1 SD.
- heart_rate_max: adjusted OR 1.09 (1.02, 1.17), p=0.0181, per 1 SD.
- male: adjusted OR 0.88 (0.75, 1.03), p=0.122, per unit.

## ICU Length Of Stay Model

Complete-case N=6014; R-squared=0.080.
- apsiii: 17.1% change (14.6%, 19.6%), p=9.93e-47, per 1 SD.
- admission_age: -4.9% change (-6.5%, -3.2%), p=2.21e-08, per 1 SD.
- sbp_min: -5.2% change (-7.0%, -3.4%), p=4.42e-08, per 1 SD.
- spo2_min: 5.4% change (3.3%, 7.6%), p=3.81e-07, per 1 SD.
- heart_rate_max: 4.0% change (2.1%, 5.9%), p=3.26e-05, per 1 SD.
- glucose_max: -1.0% change (-2.1%, 0.2%), p=0.0993, per 1 SD.

## Missingness

- glucose_max: 62 missing (1.0%).
- spo2_min: 17 missing (0.3%).
- sbp_min: 6 missing (0.1%).
- heart_rate_max: 2 missing (0.0%).
- los_icu: 2 missing (0.0%).
- admission_age: 0 missing (0.0%).
- male: 0 missing (0.0%).
- apsiii: 0 missing (0.0%).
- hospital_expire_flag: 0 missing (0.0%).
- los_hospital: 0 missing (0.0%).

## Quality And Cost Controls

- QA status: pass.
- Estimated run cost: $0.0095.
- Cumulative estimated session cost: $0.1113 of $1.00.
- Temporary row-level cache removed: yes.

## Limitations

- This is an observational diagnosis-code-based analysis.
- Diagnosis codes may reflect billing/coding and may not perfectly identify clinical onset, severity, or reason for ICU admission.
- First-day variables may be care-process markers as well as illness-severity markers.
- Complete-case models should be reviewed before publication-quality use.
