# Intracranial Hemorrhage ICU Outcomes

## Plain-Language Summary

This analysis used MIMIC-IV ICU records to study: Among ICU admissions with intracranial hemorrhage diagnoses, how do first-day GCS and vital signs predict mortality? The results are observational and describe associations in hospitalized ICU patients, not causal effects.

## Cohort

- Matched diagnosis codes: 38.
- Matched diagnosis rows: 6220.
- Matched hospital admissions: 5498.
- First ICU stay cohort rows: 4191.
- Unique patients: 4013.

## Methods

Diagnosis-code families were verified online before execution, then matched against the local MIMIC diagnosis dictionary. The primary cohort used the first ICU stay per matching hospitalization. Models used complete-case analysis for available first-day severity, laboratory, and vital-sign predictors.

## Cohort Characteristics

- admission_age: median 68.00 (IQR 56.00-79.00), n=4191.
- los_icu: median 3.67 (IQR 1.71-8.46), n=4189.
- los_hospital: median 8.00 (IQR 4.00-16.00), n=4191.
- apsiii: median 34.00 (IQR 25.00-46.00), n=4191.
- In-hospital mortality: 966 of 4191 (23.0%).
- Male sex: 2142 of 4191 (51.1%).

## Mortality Model

Complete-case N=4191; deaths=966; AUROC=0.735; average precision=0.489.
- apsiii: adjusted OR 2.27 (2.09, 2.45), p=1.64e-92, per 1 SD.
- admission_age: adjusted OR 1.37 (1.26, 1.49), p=1.07e-13, per 1 SD.
- male: adjusted OR 1.09 (0.93, 1.27), p=0.3, per unit.

## ICU Length Of Stay Model

Complete-case N=4188; R-squared=0.037.
- admission_age: -14.3% change (-16.4%, -12.2%), p=8.43e-35, per 1 SD.
- apsiii: 6.0% change (3.1%, 8.9%), p=3.17e-05, per 1 SD.
- male: 1.9% change (-3.0%, 7.1%), p=0.462, per unit.

## Missingness

- los_icu: 2 missing (0.0%).
- admission_age: 0 missing (0.0%).
- male: 0 missing (0.0%).
- apsiii: 0 missing (0.0%).
- hospital_expire_flag: 0 missing (0.0%).
- los_hospital: 0 missing (0.0%).

## Quality And Cost Controls

- QA status: pass.
- Estimated run cost: $0.0080.
- Cumulative estimated session cost: $0.2133 of $1.00.
- Temporary row-level cache removed: yes.

## Limitations

- This is an observational diagnosis-code-based analysis.
- Diagnosis codes may reflect billing/coding and may not perfectly identify clinical onset, severity, or reason for ICU admission.
- First-day variables may be care-process markers as well as illness-severity markers.
- Complete-case models should be reviewed before publication-quality use.
