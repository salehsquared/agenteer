# Heart Failure ICU Outcomes

## Plain-Language Summary

This analysis used MIMIC-IV ICU records to study: Among ICU admissions with heart failure diagnoses, how do first-day renal and vital-sign features relate to mortality and ICU length of stay? The results are observational and describe associations in hospitalized ICU patients, not causal effects.

## Cohort

- Matched diagnosis codes: 43.
- Matched diagnosis rows: 112810.
- Matched hospital admissions: 80512.
- First ICU stay cohort rows: 22580.
- Unique patients: 16583.

## Methods

Diagnosis-code families were verified online before execution, then matched against the local MIMIC diagnosis dictionary. The primary cohort used the first ICU stay per matching hospitalization. Models used complete-case analysis for available first-day severity, laboratory, and vital-sign predictors.

## Cohort Characteristics

- admission_age: median 74.00 (IQR 64.00-83.00), n=22580.
- los_icu: median 2.25 (IQR 1.21-4.42), n=22578.
- los_hospital: median 8.00 (IQR 5.00-14.00), n=22580.
- sofa: median 5.00 (IQR 3.00-7.00), n=22580.
- In-hospital mortality: 3339 of 22580 (14.8%).
- Male sex: 12423 of 22580 (55.0%).

## Mortality Model

Complete-case N=22250; deaths=3232; AUROC=0.775; average precision=0.443.
- sofa: adjusted OR 2.00 (1.92, 2.09), p=3.63e-207, per 1 SD.
- admission_age: adjusted OR 1.47 (1.41, 1.55), p=5.09e-58, per 1 SD.
- spo2_min: adjusted OR 0.78 (0.75, 0.81), p=5.53e-45, per 1 SD.
- bun_max: adjusted OR 1.31 (1.25, 1.37), p=1.49e-30, per 1 SD.
- heart_rate_max: adjusted OR 1.26 (1.21, 1.32), p=5.1e-30, per 1 SD.
- sbp_min: adjusted OR 0.83 (0.79, 0.86), p=7.11e-16, per 1 SD.

## ICU Length Of Stay Model

Complete-case N=22240; R-squared=0.116.
- sofa: 20.5% change (19.2%, 21.8%), p=4.5e-248, per 1 SD.
- heart_rate_max: 6.3% change (5.4%, 7.3%), p=5.76e-43, per 1 SD.
- admission_age: -5.6% change (-6.4%, -4.7%), p=4e-37, per 1 SD.
- creatinine_max: -6.4% change (-7.6%, -5.3%), p=1.85e-26, per 1 SD.
- sbp_min: -3.9% change (-4.8%, -2.9%), p=3.31e-15, per 1 SD.
- bun_max: 3.3% change (2.1%, 4.5%), p=3.52e-08, per 1 SD.

## Missingness

- glucose_max: 194 missing (0.9%).
- wbc_max: 168 missing (0.7%).
- hemoglobin_min: 164 missing (0.7%).
- bun_max: 133 missing (0.6%).
- creatinine_max: 129 missing (0.6%).
- sbp_min: 60 missing (0.3%).
- spo2_min: 56 missing (0.2%).
- heart_rate_max: 24 missing (0.1%).
- los_icu: 2 missing (0.0%).
- admission_age: 0 missing (0.0%).

## Quality And Cost Controls

- QA status: pass.
- Estimated run cost: $0.0093.
- Cumulative estimated session cost: $0.1206 of $1.00.
- Temporary row-level cache removed: yes.

## Limitations

- This is an observational diagnosis-code-based analysis.
- Diagnosis codes may reflect billing/coding and may not perfectly identify clinical onset, severity, or reason for ICU admission.
- First-day variables may be care-process markers as well as illness-severity markers.
- Complete-case models should be reviewed before publication-quality use.
