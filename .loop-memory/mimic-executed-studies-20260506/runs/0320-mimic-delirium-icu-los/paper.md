# Delirium/Encephalopathy And ICU Length Of Stay

## Plain-Language Summary

This analysis used MIMIC-IV ICU records to study: Are delirium or encephalopathy diagnosis codes associated with prolonged ICU stay after severity adjustment? The results are observational and describe associations in hospitalized ICU patients, not causal effects.

## Cohort

- Matched diagnosis codes: 9.
- Matched diagnosis rows: 21381.
- Matched hospital admissions: 20105.
- First ICU stay cohort rows: 9361.
- Unique patients: 8669.

## Methods

Diagnosis-code families were verified online before execution, then matched against the local MIMIC diagnosis dictionary. The primary cohort used the first ICU stay per matching hospitalization. Models used complete-case analysis for available first-day severity, laboratory, and vital-sign predictors.

## Cohort Characteristics

- admission_age: median 72.00 (IQR 60.00-82.00), n=9361.
- los_icu: median 3.21 (IQR 1.63-7.04), n=9359.
- los_hospital: median 12.00 (IQR 7.00-21.00), n=9361.
- apsiii: median 48.00 (IQR 36.00-62.00), n=9361.
- In-hospital mortality: 1589 of 9361 (17.0%).
- Male sex: 5239 of 9361 (56.0%).

## Mortality Model

Complete-case N=9361; deaths=1589; AUROC=0.710; average precision=0.358.
- apsiii: adjusted OR 2.06 (1.96, 2.18), p=6.16e-151, per 1 SD.
- admission_age: adjusted OR 1.26 (1.19, 1.34), p=4.12e-14, per 1 SD.
- male: adjusted OR 1.00 (0.89, 1.12), p=0.985, per unit.

## ICU Length Of Stay Model

Complete-case N=9354; R-squared=0.057.
- admission_age: -12.2% change (-13.6%, -10.8%), p=8.6e-57, per 1 SD.
- apsiii: 14.6% change (12.7%, 16.6%), p=8.83e-57, per 1 SD.
- male: 9.5% change (6.1%, 13.0%), p=1.92e-08, per unit.

## Missingness

- los_icu: 2 missing (0.0%).
- admission_age: 0 missing (0.0%).
- male: 0 missing (0.0%).
- apsiii: 0 missing (0.0%).
- hospital_expire_flag: 0 missing (0.0%).
- los_hospital: 0 missing (0.0%).

## Quality And Cost Controls

- QA status: pass.
- Estimated run cost: $0.0080.
- Cumulative estimated session cost: $0.2535 of $1.00.
- Temporary row-level cache removed: yes.

## Limitations

- This is an observational diagnosis-code-based analysis.
- Diagnosis codes may reflect billing/coding and may not perfectly identify clinical onset, severity, or reason for ICU admission.
- First-day variables may be care-process markers as well as illness-severity markers.
- Complete-case models should be reviewed before publication-quality use.
