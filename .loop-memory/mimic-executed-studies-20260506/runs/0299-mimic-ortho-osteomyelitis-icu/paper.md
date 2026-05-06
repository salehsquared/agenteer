# Osteomyelitis-Associated ICU Admissions

## Plain-Language Summary

This analysis used MIMIC-IV ICU records to study: What severity and comorbidity patterns characterize ICU stays with osteomyelitis diagnosis codes? The results are observational and describe associations in hospitalized ICU patients, not causal effects.

## Cohort

- Matched diagnosis codes: 278.
- Matched diagnosis rows: 6500.
- Matched hospital admissions: 6106.
- First ICU stay cohort rows: 972.
- Unique patients: 838.

## Methods

Diagnosis-code families were verified online before execution, then matched against the local MIMIC diagnosis dictionary. The primary cohort used the first ICU stay per matching hospitalization. Models used complete-case analysis for available first-day severity, laboratory, and vital-sign predictors.

## Cohort Characteristics

- admission_age: median 65.00 (IQR 55.00-74.00), n=972.
- los_icu: median 2.40 (IQR 1.17-4.88), n=972.
- los_hospital: median 13.00 (IQR 7.75-24.00), n=972.
- In-hospital mortality: 142 of 972 (14.6%).
- Male sex: 591 of 972 (60.8%).

## Mortality Model

Mortality model was not fit: Singular matrix.

## ICU Length Of Stay Model

Complete-case N=858; R-squared=0.550.
- any_antibiotic_record: 103.9% change (98.7%, 109.1%), p=0, per unit.
- antibiotic_record_count: 71.3% change (61.5%, 81.8%), p=4.84e-71, per 1 SD.
- hemoglobin_min: -4.4% change (-7.4%, -1.3%), p=0.00606, per 1 SD.
- creatinine_max: -6.7% change (-11.5%, -1.5%), p=0.0117, per 1 SD.
- glucose_max: -3.2% change (-6.3%, -0.1%), p=0.0437, per 1 SD.
- bun_max: 4.5% change (-0.3%, 9.5%), p=0.0659, per 1 SD.

## Missingness

- any_antibiotic_record: 105 missing (10.8%).
- antibiotic_record_count: 105 missing (10.8%).
- wbc_max: 11 missing (1.1%).
- hemoglobin_min: 10 missing (1.0%).
- glucose_max: 9 missing (0.9%).
- creatinine_max: 7 missing (0.7%).
- bun_max: 7 missing (0.7%).
- admission_age: 0 missing (0.0%).
- male: 0 missing (0.0%).
- charlson_comorbidity_index: 0 missing (0.0%).

## Quality And Cost Controls

- QA status: pass.
- Estimated run cost: $0.0117.
- Cumulative estimated session cost: $0.0461 of $1.00.
- Temporary row-level cache removed: yes.

## Limitations

- This is an observational diagnosis-code-based analysis.
- Diagnosis codes may reflect billing/coding and may not perfectly identify clinical onset, severity, or reason for ICU admission.
- First-day variables may be care-process markers as well as illness-severity markers.
- Complete-case models should be reviewed before publication-quality use.
