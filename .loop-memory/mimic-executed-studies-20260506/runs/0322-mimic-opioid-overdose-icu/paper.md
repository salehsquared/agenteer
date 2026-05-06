# Opioid Poisoning ICU Outcomes

## Plain-Language Summary

This analysis used MIMIC-IV ICU records to study: Among ICU admissions with opioid poisoning codes, what first-day factors are associated with mortality and length of stay? The results are observational and describe associations in hospitalized ICU patients, not causal effects.

## Cohort

- Matched diagnosis codes: 30.
- Matched diagnosis rows: 3257.
- Matched hospital admissions: 3237.
- First ICU stay cohort rows: 829.
- Unique patients: 807.

## Methods

Diagnosis-code families were verified online before execution, then matched against the local MIMIC diagnosis dictionary. The primary cohort used the first ICU stay per matching hospitalization. Models used complete-case analysis for available first-day severity, laboratory, and vital-sign predictors.

## Cohort Characteristics

- admission_age: median 59.00 (IQR 45.00-69.00), n=829.
- los_icu: median 2.00 (IQR 1.13-3.92), n=829.
- los_hospital: median 8.00 (IQR 5.00-15.00), n=829.
- In-hospital mortality: 96 of 829 (11.6%).
- Male sex: 449 of 829 (54.2%).

## Mortality Model

Complete-case N=163; deaths=20; AUROC=0.739; average precision=0.300.
- sbp_min: adjusted OR 0.63 (0.38, 1.05), p=0.0738, per 1 SD.
- hemoglobin_min: adjusted OR 1.64 (0.93, 2.88), p=0.0847, per 1 SD.
- heart_rate_max: adjusted OR 1.30 (0.80, 2.12), p=0.295, per 1 SD.
- glucose_max: adjusted OR 1.14 (0.71, 1.83), p=0.588, per 1 SD.
- spo2_min: adjusted OR 0.92 (0.62, 1.37), p=0.691, per 1 SD.
- male: adjusted OR 1.23 (0.42, 3.60), p=0.71, per unit.

## ICU Length Of Stay Model

Complete-case N=163; R-squared=0.231.
- admission_age: -13.7% change (-22.6%, -3.7%), p=0.00836, per 1 SD.
- heart_rate_max: 14.4% change (2.9%, 27.1%), p=0.0124, per 1 SD.
- hemoglobin_min: 8.9% change (-3.1%, 22.3%), p=0.152, per 1 SD.
- glucose_max: 5.9% change (-7.1%, 20.7%), p=0.391, per 1 SD.
- spo2_min: 6.5% change (-8.7%, 24.3%), p=0.425, per 1 SD.
- sbp_min: -3.7% change (-13.0%, 6.6%), p=0.471, per 1 SD.

## Missingness

- hemoglobin_min: 666 missing (80.3%).
- glucose_max: 21 missing (2.5%).
- sbp_min: 3 missing (0.4%).
- heart_rate_max: 2 missing (0.2%).
- spo2_min: 2 missing (0.2%).
- admission_age: 0 missing (0.0%).
- male: 0 missing (0.0%).
- hospital_expire_flag: 0 missing (0.0%).
- los_icu: 0 missing (0.0%).
- los_hospital: 0 missing (0.0%).

## Quality And Cost Controls

- QA status: review.
- Estimated run cost: $0.0086.
- Cumulative estimated session cost: $0.2704 of $1.00.
- Temporary row-level cache removed: yes.

## Limitations

- This is an observational diagnosis-code-based analysis.
- Diagnosis codes may reflect billing/coding and may not perfectly identify clinical onset, severity, or reason for ICU admission.
- First-day variables may be care-process markers as well as illness-severity markers.
- Complete-case models should be reviewed before publication-quality use.
