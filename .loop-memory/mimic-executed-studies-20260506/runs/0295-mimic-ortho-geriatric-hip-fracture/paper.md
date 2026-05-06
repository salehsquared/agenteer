# Narrow Geriatric Hip Fracture ICU Outcomes

## Plain-Language Summary

This analysis used MIMIC-IV ICU records to study: Among patients aged 65+ with femoral neck, intertrochanteric, or subtrochanteric fracture codes, what predicts mortality and prolonged ICU stay? The results are observational and describe associations in hospitalized ICU patients, not causal effects.

## Cohort

- Matched diagnosis codes: 1104.
- Matched diagnosis rows: 3641.
- Matched hospital admissions: 3566.
- First ICU stay cohort rows: 527.
- Unique patients: 523.

## Methods

Diagnosis-code families were verified online before execution, then matched against the local MIMIC diagnosis dictionary. The primary cohort used the first ICU stay per matching hospitalization. Models used complete-case analysis for available first-day severity, laboratory, and vital-sign predictors.

## Cohort Characteristics

- admission_age: median 80.00 (IQR 65.50-88.50), n=527.
- los_icu: median 1.88 (IQR 1.00-3.85), n=527.
- los_hospital: median 9.00 (IQR 6.00-14.00), n=527.
- apsiii: median 44.00 (IQR 35.50-57.50), n=527.
- oasis: median 33.00 (IQR 29.00-39.00), n=527.
- sofa: median 4.00 (IQR 2.00-6.00), n=527.
- In-hospital mortality: 84 of 527 (15.9%).
- Male sex: 238 of 527 (45.2%).

## Mortality Model

Complete-case N=496; deaths=77; AUROC=0.812; average precision=0.543.
- admission_age: adjusted OR 2.62 (1.59, 4.31), p=0.000161, per 1 SD.
- apsiii: adjusted OR 1.73 (1.13, 2.66), p=0.0123, per 1 SD.
- sofa: adjusted OR 1.54 (1.05, 2.26), p=0.0275, per 1 SD.
- oasis: adjusted OR 1.53 (1.04, 2.26), p=0.0319, per 1 SD.
- gcs: adjusted OR 1.24 (0.93, 1.65), p=0.14, per 1 SD.
- male: adjusted OR 1.21 (0.68, 2.18), p=0.519, per unit.

## ICU Length Of Stay Model

Complete-case N=496; R-squared=0.206.
- urineoutput: 24.5% change (16.7%, 32.8%), p=3.11e-11, per 1 SD.
- oasis: 20.0% change (11.7%, 28.8%), p=6.14e-07, per 1 SD.
- gcs: 10.8% change (2.2%, 20.1%), p=0.0128, per 1 SD.
- sofa: 11.1% change (2.2%, 20.8%), p=0.0133, per 1 SD.
- admission_age: -5.0% change (-10.7%, 1.0%), p=0.103, per 1 SD.
- apsiii: 4.9% change (-4.4%, 15.2%), p=0.312, per 1 SD.

## Missingness

- urineoutput: 30 missing (5.7%).
- gcs: 3 missing (0.6%).
- admission_age: 0 missing (0.0%).
- male: 0 missing (0.0%).
- apsiii: 0 missing (0.0%).
- oasis: 0 missing (0.0%).
- sofa: 0 missing (0.0%).
- hospital_expire_flag: 0 missing (0.0%).
- los_icu: 0 missing (0.0%).
- los_hospital: 0 missing (0.0%).

## Quality And Cost Controls

- QA status: pass.
- Estimated run cost: $0.0085.
- Cumulative estimated session cost: $0.0085 of $1.00.
- Temporary row-level cache removed: yes.

## Limitations

- This is an observational diagnosis-code-based analysis.
- Diagnosis codes may reflect billing/coding and may not perfectly identify clinical onset, severity, or reason for ICU admission.
- First-day variables may be care-process markers as well as illness-severity markers.
- Complete-case models should be reviewed before publication-quality use.
