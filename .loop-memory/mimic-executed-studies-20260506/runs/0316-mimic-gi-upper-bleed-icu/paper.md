# Gastrointestinal Bleeding ICU Outcomes

## Plain-Language Summary

This analysis used MIMIC-IV ICU records to study: Among ICU admissions with gastrointestinal bleeding codes, are first-day hemoglobin and hemodynamic markers associated with mortality and prolonged stay? The results are observational and describe associations in hospitalized ICU patients, not causal effects.

## Cohort

- Matched diagnosis codes: 2.
- Matched diagnosis rows: 3902.
- Matched hospital admissions: 3902.
- First ICU stay cohort rows: 1582.
- Unique patients: 1502.

## Methods

Diagnosis-code families were verified online before execution, then matched against the local MIMIC diagnosis dictionary. The primary cohort used the first ICU stay per matching hospitalization. Models used complete-case analysis for available first-day severity, laboratory, and vital-sign predictors.

## Cohort Characteristics

- admission_age: median 69.00 (IQR 57.00-81.00), n=1582.
- los_icu: median 2.21 (IQR 1.17-4.83), n=1581.
- los_hospital: median 8.00 (IQR 4.00-17.75), n=1582.
- In-hospital mortality: 387 of 1582 (24.5%).
- Male sex: 922 of 1582 (58.3%).

## Mortality Model

Complete-case N=1563; deaths=379; AUROC=0.739; average precision=0.491.
- sbp_min: adjusted OR 0.64 (0.55, 0.73), p=4e-10, per 1 SD.
- heart_rate_max: adjusted OR 1.37 (1.20, 1.56), p=2.25e-06, per 1 SD.
- spo2_min: adjusted OR 0.71 (0.62, 0.82), p=2.93e-06, per 1 SD.
- hemoglobin_min: adjusted OR 1.22 (1.08, 1.39), p=0.00202, per 1 SD.
- wbc_max: adjusted OR 1.23 (1.07, 1.42), p=0.00418, per 1 SD.
- bun_max: adjusted OR 1.21 (1.04, 1.41), p=0.0131, per 1 SD.

## ICU Length Of Stay Model

Complete-case N=1561; R-squared=0.105.
- heart_rate_max: 10.7% change (6.6%, 14.9%), p=9.92e-08, per 1 SD.
- hemoglobin_min: 10.3% change (6.1%, 14.6%), p=5.31e-07, per 1 SD.
- admission_age: -6.9% change (-10.4%, -3.3%), p=0.000247, per 1 SD.
- sbp_min: -6.4% change (-10.2%, -2.5%), p=0.0016, per 1 SD.
- creatinine_max: 6.7% change (0.9%, 12.7%), p=0.0218, per 1 SD.
- wbc_max: 9.9% change (1.4%, 19.1%), p=0.0221, per 1 SD.

## Missingness

- hemoglobin_min: 11 missing (0.7%).
- glucose_max: 11 missing (0.7%).
- wbc_max: 10 missing (0.6%).
- creatinine_max: 10 missing (0.6%).
- bun_max: 10 missing (0.6%).
- spo2_min: 4 missing (0.3%).
- sbp_min: 2 missing (0.1%).
- heart_rate_max: 2 missing (0.1%).
- los_icu: 1 missing (0.1%).
- admission_age: 0 missing (0.0%).

## Quality And Cost Controls

- QA status: pass.
- Estimated run cost: $0.0091.
- Cumulative estimated session cost: $0.2223 of $1.00.
- Temporary row-level cache removed: yes.

## Limitations

- This is an observational diagnosis-code-based analysis.
- Diagnosis codes may reflect billing/coding and may not perfectly identify clinical onset, severity, or reason for ICU admission.
- First-day variables may be care-process markers as well as illness-severity markers.
- Complete-case models should be reviewed before publication-quality use.
