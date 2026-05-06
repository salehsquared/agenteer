# Cirrhosis And ICU Outcomes

## Plain-Language Summary

This analysis used MIMIC-IV ICU records to study: Among ICU admissions with cirrhosis codes, how do MELD-like derived variables and first-day labs relate to mortality? The results are observational and describe associations in hospitalized ICU patients, not causal effects.

## Cohort

- Matched diagnosis codes: 13.
- Matched diagnosis rows: 12959.
- Matched hospital admissions: 12849.
- First ICU stay cohort rows: 2662.
- Unique patients: 2094.

## Methods

Diagnosis-code families were verified online before execution, then matched against the local MIMIC diagnosis dictionary. The primary cohort used the first ICU stay per matching hospitalization. Models used complete-case analysis for available first-day severity, laboratory, and vital-sign predictors.

## Cohort Characteristics

- admission_age: median 63.00 (IQR 56.00-71.00), n=2662.
- los_icu: median 2.17 (IQR 1.17-4.33), n=2662.
- los_hospital: median 9.00 (IQR 5.00-17.00), n=2662.
- In-hospital mortality: 565 of 2662 (21.2%).
- Male sex: 1623 of 2662 (61.0%).

## Mortality Model

Complete-case N=2641; deaths=556; AUROC=0.701; average precision=0.376.
- wbc_max: adjusted OR 1.46 (1.31, 1.62), p=2.65e-12, per 1 SD.
- bun_max: adjusted OR 1.43 (1.28, 1.60), p=1.74e-10, per 1 SD.
- hemoglobin_min: adjusted OR 0.88 (0.80, 0.98), p=0.0183, per 1 SD.
- admission_age: adjusted OR 1.11 (1.00, 1.23), p=0.0397, per 1 SD.
- glucose_max: adjusted OR 0.90 (0.81, 1.00), p=0.0407, per 1 SD.
- creatinine_max: adjusted OR 1.11 (1.00, 1.23), p=0.0601, per 1 SD.

## ICU Length Of Stay Model

Complete-case N=2640; R-squared=0.045.
- creatinine_max: 6.2% change (2.5%, 9.9%), p=0.000764, per 1 SD.
- wbc_max: 9.6% change (3.8%, 15.7%), p=0.000992, per 1 SD.
- bun_max: 5.1% change (1.4%, 8.9%), p=0.00625, per 1 SD.
- male: -6.6% change (-11.4%, -1.5%), p=0.0116, per unit.
- admission_age: -2.6% change (-5.0%, -0.1%), p=0.0424, per 1 SD.
- glucose_max: 1.3% change (-1.3%, 3.9%), p=0.325, per 1 SD.

## Missingness

- glucose_max: 20 missing (0.8%).
- creatinine_max: 14 missing (0.5%).
- bun_max: 14 missing (0.5%).
- hemoglobin_min: 12 missing (0.5%).
- wbc_max: 12 missing (0.5%).
- admission_age: 0 missing (0.0%).
- male: 0 missing (0.0%).
- hospital_expire_flag: 0 missing (0.0%).
- los_icu: 0 missing (0.0%).
- los_hospital: 0 missing (0.0%).

## Quality And Cost Controls

- QA status: pass.
- Estimated run cost: $0.0138.
- Cumulative estimated session cost: $0.2362 of $1.00.
- Temporary row-level cache removed: yes.

## Limitations

- This is an observational diagnosis-code-based analysis.
- Diagnosis codes may reflect billing/coding and may not perfectly identify clinical onset, severity, or reason for ICU admission.
- First-day variables may be care-process markers as well as illness-severity markers.
- Complete-case models should be reviewed before publication-quality use.
