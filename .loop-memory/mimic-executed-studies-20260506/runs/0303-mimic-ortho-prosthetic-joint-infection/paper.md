# Prosthetic Joint Infection ICU Outcomes

## Plain-Language Summary

This analysis used MIMIC-IV ICU records to study: Are prosthetic joint infection diagnoses associated with higher ICU resource use than other orthopedic infection diagnoses? The results are observational and describe associations in hospitalized ICU patients, not causal effects.

## Cohort

- Matched diagnosis codes: 10.
- Matched diagnosis rows: 477.
- Matched hospital admissions: 477.
- First ICU stay cohort rows: 81.
- Unique patients: 72.

## Methods

Diagnosis-code families were verified online before execution, then matched against the local MIMIC diagnosis dictionary. The primary cohort used the first ICU stay per matching hospitalization. Models used complete-case analysis for available first-day severity, laboratory, and vital-sign predictors.

## Cohort Characteristics

- admission_age: median 70.00 (IQR 58.00-75.00), n=81.
- los_icu: median 2.21 (IQR 1.13-4.04), n=81.
- los_hospital: median 12.00 (IQR 7.00-18.00), n=81.
- sofa: median 4.00 (IQR 2.00-7.00), n=81.
- In-hospital mortality: 13 of 81 (16.0%).
- Male sex: 34 of 81 (42.0%).

## Mortality Model

Mortality model was not fit: Singular matrix.

## ICU Length Of Stay Model

Complete-case N=69; R-squared=0.501.
- any_antibiotic_record: 90.3% change (75.8%, 105.9%), p=1.59e-57, per unit.
- antibiotic_record_count: 55.6% change (36.9%, 76.8%), p=1.36e-11, per 1 SD.
- male: 29.4% change (0.0%, 67.4%), p=0.0499, per unit.
- sofa: 2.5% change (-10.8%, 17.9%), p=0.725, per 1 SD.
- admission_age: -0.6% change (-11.6%, 11.8%), p=0.925, per 1 SD.

## Missingness

- any_antibiotic_record: 12 missing (14.8%).
- antibiotic_record_count: 12 missing (14.8%).
- admission_age: 0 missing (0.0%).
- male: 0 missing (0.0%).
- sofa: 0 missing (0.0%).
- hospital_expire_flag: 0 missing (0.0%).
- los_icu: 0 missing (0.0%).
- los_hospital: 0 missing (0.0%).

## Quality And Cost Controls

- QA status: review.
- Estimated run cost: $0.0103.
- Cumulative estimated session cost: $0.0786 of $1.00.
- Temporary row-level cache removed: yes.

## Limitations

- This is an observational diagnosis-code-based analysis.
- Diagnosis codes may reflect billing/coding and may not perfectly identify clinical onset, severity, or reason for ICU admission.
- First-day variables may be care-process markers as well as illness-severity markers.
- Complete-case models should be reviewed before publication-quality use.
