# Pneumonia ICU Respiratory Outcomes

## Plain-Language Summary

This analysis used MIMIC-IV ICU records to study: Among ICU admissions with pneumonia codes, what respiratory and oxygen-delivery features are associated with mortality? The results are observational and describe associations in hospitalized ICU patients, not causal effects.

## Cohort

- Matched diagnosis codes: 7.
- Matched diagnosis rows: 21100.
- Matched hospital admissions: 21091.
- First ICU stay cohort rows: 8173.
- Unique patients: 7497.

## Methods

Diagnosis-code families were verified online before execution, then matched against the local MIMIC diagnosis dictionary. The primary cohort used the first ICU stay per matching hospitalization. Models used complete-case analysis for available first-day severity, laboratory, and vital-sign predictors.

## Cohort Characteristics

- admission_age: median 70.00 (IQR 58.00-80.00), n=8173.
- los_icu: median 2.75 (IQR 1.38-5.88), n=8171.
- los_hospital: median 10.00 (IQR 5.00-17.00), n=8173.
- In-hospital mortality: 1813 of 8173 (22.2%).
- Male sex: 4454 of 8173 (54.5%).

## Mortality Model

Mortality model was not fit: Singular matrix.

## ICU Length Of Stay Model

Complete-case N=932; R-squared=0.494.
- admission_age: 0.3% change (0.3%, 0.3%), p=0, per 1 SD.
- male: 2.3% change (2.3%, 2.3%), p=0, per unit.
- hemoglobin_min: -4.0% change (-4.0%, -4.0%), p=0, per 1 SD.
- glucose_max: -2.5% change (-2.5%, -2.5%), p=0, per 1 SD.
- any_antibiotic_record: effect estimate was too unstable to render as a finite percent change, p=0, per unit.
- antibiotic_record_count: 74.9% change (74.9%, 74.9%), p=0, per 1 SD.

## Missingness

- hemoglobin_min: 6949 missing (85.0%).
- glucose_max: 6368 missing (77.9%).
- any_antibiotic_record: 918 missing (11.2%).
- antibiotic_record_count: 918 missing (11.2%).
- los_icu: 2 missing (0.0%).
- admission_age: 0 missing (0.0%).
- male: 0 missing (0.0%).
- hospital_expire_flag: 0 missing (0.0%).
- los_hospital: 0 missing (0.0%).

## Quality And Cost Controls

- QA status: review.
- Estimated run cost: $0.0113.
- Cumulative estimated session cost: $0.1415 of $1.00.
- Temporary row-level cache removed: yes.

## Limitations

- This is an observational diagnosis-code-based analysis.
- Diagnosis codes may reflect billing/coding and may not perfectly identify clinical onset, severity, or reason for ICU admission.
- First-day variables may be care-process markers as well as illness-severity markers.
- Complete-case models should be reviewed before publication-quality use.
