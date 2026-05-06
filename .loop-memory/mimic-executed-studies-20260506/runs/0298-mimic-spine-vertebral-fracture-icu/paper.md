# Vertebral Fracture ICU Outcomes

## Plain-Language Summary

This analysis used MIMIC-IV ICU records to study: Among ICU patients with vertebral fracture diagnoses, what first-day factors predict mortality and ICU length of stay? The results are observational and describe associations in hospitalized ICU patients, not causal effects.

## Cohort

- Matched diagnosis codes: 1121.
- Matched diagnosis rows: 8716.
- Matched hospital admissions: 5932.
- First ICU stay cohort rows: 1647.
- Unique patients: 1609.

## Methods

Diagnosis-code families were verified online before execution, then matched against the local MIMIC diagnosis dictionary. The primary cohort used the first ICU stay per matching hospitalization. Models used complete-case analysis for available first-day severity, laboratory, and vital-sign predictors.

## Cohort Characteristics

- admission_age: median 65.00 (IQR 45.00-80.00), n=1647.
- los_icu: median 2.42 (IQR 1.13-5.56), n=1647.
- los_hospital: median 8.00 (IQR 5.00-15.00), n=1647.
- sofa: median 3.00 (IQR 1.50-5.00), n=1647.
- In-hospital mortality: 210 of 1647 (12.8%).
- Male sex: 1035 of 1647 (62.8%).

## Mortality Model

Complete-case N=1606; deaths=199; AUROC=0.837; average precision=0.467.
- sofa: adjusted OR 2.29 (1.93, 2.72), p=3.17e-21, per 1 SD.
- admission_age: adjusted OR 2.05 (1.65, 2.54), p=9e-11, per 1 SD.
- sbp_min: adjusted OR 0.71 (0.59, 0.86), p=0.000456, per 1 SD.
- glucose_max: adjusted OR 1.18 (1.02, 1.36), p=0.0223, per 1 SD.
- heart_rate_max: adjusted OR 1.19 (1.00, 1.41), p=0.0529, per 1 SD.
- spo2_min: adjusted OR 0.92 (0.80, 1.05), p=0.2, per 1 SD.

## ICU Length Of Stay Model

Complete-case N=1606; R-squared=0.133.
- sofa: 20.5% change (15.2%, 26.0%), p=5.35e-16, per 1 SD.
- sbp_min: -8.3% change (-12.3%, -4.1%), p=0.000136, per 1 SD.
- spo2_min: 9.7% change (4.6%, 15.1%), p=0.000144, per 1 SD.
- glucose_max: 8.0% change (3.2%, 13.1%), p=0.00101, per 1 SD.
- admission_age: -6.1% change (-10.0%, -2.1%), p=0.00292, per 1 SD.
- heart_rate_max: 6.2% change (2.0%, 10.5%), p=0.00358, per 1 SD.

## Missingness

- glucose_max: 37 missing (2.2%).
- spo2_min: 7 missing (0.4%).
- sbp_min: 4 missing (0.2%).
- heart_rate_max: 4 missing (0.2%).
- admission_age: 0 missing (0.0%).
- male: 0 missing (0.0%).
- sofa: 0 missing (0.0%).
- hospital_expire_flag: 0 missing (0.0%).
- los_icu: 0 missing (0.0%).
- los_hospital: 0 missing (0.0%).

## Quality And Cost Controls

- QA status: pass.
- Estimated run cost: $0.0085.
- Cumulative estimated session cost: $0.0344 of $1.00.
- Temporary row-level cache removed: yes.

## Limitations

- This is an observational diagnosis-code-based analysis.
- Diagnosis codes may reflect billing/coding and may not perfectly identify clinical onset, severity, or reason for ICU admission.
- First-day variables may be care-process markers as well as illness-severity markers.
- Complete-case models should be reviewed before publication-quality use.
