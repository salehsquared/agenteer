# Septic Arthritis ICU Outcomes

## Plain-Language Summary

This analysis used MIMIC-IV ICU records to study: Among ICU patients with septic arthritis codes, what predicts mortality and prolonged stay? The results are observational and describe associations in hospitalized ICU patients, not causal effects.

## Cohort

- Matched diagnosis codes: 140.
- Matched diagnosis rows: 1648.
- Matched hospital admissions: 1571.
- First ICU stay cohort rows: 313.
- Unique patients: 290.

## Methods

Diagnosis-code families were verified online before execution, then matched against the local MIMIC diagnosis dictionary. The primary cohort used the first ICU stay per matching hospitalization. Models used complete-case analysis for available first-day severity, laboratory, and vital-sign predictors.

## Cohort Characteristics

- admission_age: median 63.00 (IQR 54.00-73.00), n=313.
- los_icu: median 2.54 (IQR 1.25-5.96), n=313.
- los_hospital: median 16.00 (IQR 9.00-24.00), n=313.
- apsiii: median 47.00 (IQR 38.00-59.00), n=313.
- In-hospital mortality: 41 of 313 (13.1%).
- Male sex: 184 of 313 (58.8%).

## Mortality Model

Mortality model was not fit: Singular matrix.

## ICU Length Of Stay Model

Complete-case N=283; R-squared=0.505.
- admission_age: -5.6% change (-5.6%, -5.6%), p=0, per 1 SD.
- male: 0.4% change (0.4%, 0.4%), p=0, per unit.
- apsiii: 2.0% change (2.0%, 2.0%), p=0, per 1 SD.
- hemoglobin_min: -2.1% change (-2.1%, -2.1%), p=0, per 1 SD.
- wbc_max: 3.5% change (3.5%, 3.5%), p=0, per 1 SD.
- creatinine_max: -14.3% change (-14.3%, -14.3%), p=0, per 1 SD.

## Missingness

- any_antibiotic_record: 28 missing (8.9%).
- antibiotic_record_count: 28 missing (8.9%).
- hemoglobin_min: 2 missing (0.6%).
- wbc_max: 2 missing (0.6%).
- creatinine_max: 1 missing (0.3%).
- bun_max: 1 missing (0.3%).
- glucose_max: 1 missing (0.3%).
- admission_age: 0 missing (0.0%).
- male: 0 missing (0.0%).
- apsiii: 0 missing (0.0%).

## Quality And Cost Controls

- QA status: review.
- Estimated run cost: $0.0111.
- Cumulative estimated session cost: $0.0683 of $1.00.
- Temporary row-level cache removed: yes.

## Limitations

- This is an observational diagnosis-code-based analysis.
- Diagnosis codes may reflect billing/coding and may not perfectly identify clinical onset, severity, or reason for ICU admission.
- First-day variables may be care-process markers as well as illness-severity markers.
- Complete-case models should be reviewed before publication-quality use.
