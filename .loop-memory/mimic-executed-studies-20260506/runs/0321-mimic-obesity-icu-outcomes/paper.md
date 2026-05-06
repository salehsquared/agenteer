# Obesity Diagnosis And ICU Outcomes

## Plain-Language Summary

This analysis used MIMIC-IV ICU records to study: Among ICU patients, are obesity diagnosis codes associated with mortality or ICU length of stay after severity adjustment? The results are observational and describe associations in hospitalized ICU patients, not causal effects.

## Cohort

- Matched diagnosis codes: 11.
- Matched diagnosis rows: 52151.
- Matched hospital admissions: 51617.
- First ICU stay cohort rows: 9795.
- Unique patients: 8164.

## Methods

Diagnosis-code families were verified online before execution, then matched against the local MIMIC diagnosis dictionary. The primary cohort used the first ICU stay per matching hospitalization. Models used complete-case analysis for available first-day severity, laboratory, and vital-sign predictors.

## Cohort Characteristics

- admission_age: median 64.00 (IQR 54.00-72.00), n=9795.
- los_icu: median 2.13 (IQR 1.17-4.29), n=9792.
- los_hospital: median 8.00 (IQR 5.00-14.00), n=9795.
- oasis: median 30.00 (IQR 24.00-36.00), n=9795.
- In-hospital mortality: 856 of 9795 (8.7%).
- Male sex: 4903 of 9795 (50.1%).

## Mortality Model

Complete-case N=9366; deaths=779; AUROC=0.779; average precision=0.307.
- oasis: adjusted OR 2.78 (2.53, 3.05), p=9.13e-103, per 1 SD.
- urineoutput: adjusted OR 0.79 (0.71, 0.87), p=6.57e-06, per 1 SD.
- gcs: adjusted OR 1.11 (1.03, 1.18), p=0.00336, per 1 SD.
- admission_age: adjusted OR 1.08 (1.00, 1.18), p=0.0565, per 1 SD.
- male: adjusted OR 1.11 (0.95, 1.30), p=0.19, per unit.

## ICU Length Of Stay Model

Complete-case N=9363; R-squared=0.131.
- oasis: 32.1% change (29.9%, 34.4%), p=7.84e-223, per 1 SD.
- urineoutput: 8.6% change (6.9%, 10.4%), p=1.44e-23, per 1 SD.
- admission_age: -4.8% change (-6.2%, -3.4%), p=4.18e-11, per 1 SD.
- male: 4.8% change (2.1%, 7.7%), p=0.000517, per unit.
- gcs: 2.1% change (0.4%, 3.8%), p=0.0133, per 1 SD.

## Missingness

- urineoutput: 422 missing (4.3%).
- gcs: 31 missing (0.3%).
- los_icu: 3 missing (0.0%).
- admission_age: 0 missing (0.0%).
- male: 0 missing (0.0%).
- oasis: 0 missing (0.0%).
- hospital_expire_flag: 0 missing (0.0%).
- los_hospital: 0 missing (0.0%).

## Quality And Cost Controls

- QA status: pass.
- Estimated run cost: $0.0083.
- Cumulative estimated session cost: $0.2618 of $1.00.
- Temporary row-level cache removed: yes.

## Limitations

- This is an observational diagnosis-code-based analysis.
- Diagnosis codes may reflect billing/coding and may not perfectly identify clinical onset, severity, or reason for ICU admission.
- First-day variables may be care-process markers as well as illness-severity markers.
- Complete-case models should be reviewed before publication-quality use.
