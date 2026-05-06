# Ischemic Stroke ICU Mortality

## Plain-Language Summary

This analysis used MIMIC-IV ICU records to study: Among ICU admissions with ischemic stroke codes, which first-day severity and physiologic variables predict mortality? The results are observational and describe associations in hospitalized ICU patients, not causal effects.

## Cohort

- Matched diagnosis codes: 119.
- Matched diagnosis rows: 7564.
- Matched hospital admissions: 7057.
- First ICU stay cohort rows: 3546.
- Unique patients: 3471.

## Methods

Diagnosis-code families were verified online before execution, then matched against the local MIMIC diagnosis dictionary. The primary cohort used the first ICU stay per matching hospitalization. Models used complete-case analysis for available first-day severity, laboratory, and vital-sign predictors.

## Cohort Characteristics

- admission_age: median 71.00 (IQR 60.00-81.00), n=3546.
- los_icu: median 3.33 (IQR 1.75-7.08), n=3546.
- los_hospital: median 9.00 (IQR 4.00-17.00), n=3546.
- apsiii: median 37.00 (IQR 27.00-50.00), n=3546.
- oasis: median 31.00 (IQR 26.00-37.00), n=3546.
- In-hospital mortality: 656 of 3546 (18.5%).
- Male sex: 1813 of 3546 (51.1%).

## Mortality Model

Complete-case N=3281; deaths=599; AUROC=0.787; average precision=0.415.
- oasis: adjusted OR 1.81 (1.56, 2.10), p=2.6e-15, per 1 SD.
- apsiii: adjusted OR 1.73 (1.48, 2.01), p=2.13e-12, per 1 SD.
- gcs: adjusted OR 1.33 (1.18, 1.49), p=1.2e-06, per 1 SD.
- admission_age: adjusted OR 1.22 (1.09, 1.36), p=0.000517, per 1 SD.
- urineoutput: adjusted OR 1.14 (1.02, 1.28), p=0.0206, per 1 SD.
- male: adjusted OR 1.26 (1.03, 1.53), p=0.0239, per unit.

## ICU Length Of Stay Model

Complete-case N=3281; R-squared=0.119.
- oasis: 24.8% change (19.3%, 30.5%), p=3.31e-22, per 1 SD.
- admission_age: -11.4% change (-13.8%, -8.9%), p=8.65e-18, per 1 SD.
- gcs: 7.5% change (3.5%, 11.6%), p=0.000197, per 1 SD.
- apsiii: 8.9% change (3.9%, 14.2%), p=0.000404, per 1 SD.
- urineoutput: 11.7% change (5.1%, 18.8%), p=0.000405, per 1 SD.
- spo2_min: 4.1% change (0.9%, 7.5%), p=0.0124, per 1 SD.

## Missingness

- urineoutput: 217 missing (6.1%).
- glucose_max: 54 missing (1.5%).
- gcs: 6 missing (0.2%).
- spo2_min: 2 missing (0.1%).
- sbp_min: 1 missing (0.0%).
- heart_rate_max: 1 missing (0.0%).
- admission_age: 0 missing (0.0%).
- male: 0 missing (0.0%).
- apsiii: 0 missing (0.0%).
- oasis: 0 missing (0.0%).

## Quality And Cost Controls

- QA status: pass.
- Estimated run cost: $0.0090.
- Cumulative estimated session cost: $0.2052 of $1.00.
- Temporary row-level cache removed: yes.

## Limitations

- This is an observational diagnosis-code-based analysis.
- Diagnosis codes may reflect billing/coding and may not perfectly identify clinical onset, severity, or reason for ICU admission.
- First-day variables may be care-process markers as well as illness-severity markers.
- Complete-case models should be reviewed before publication-quality use.
