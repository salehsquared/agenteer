# Hip/Femur Fracture ICU Outcomes in MIMIC-IV v3.1

## Plain-Language Summary

This analysis identified ICU stays linked to hospital admissions with hip or femur fracture diagnosis codes. It then summarized patient characteristics and tested whether first-day ICU severity, laboratory, and vital-sign features were associated with in-hospital death and ICU length of stay. The results are observational and should not be interpreted as proof that any measured factor caused worse outcomes.

## Research Question

Among ICU patients admitted with hip or femur fracture diagnosis codes, what first-day factors are associated with in-hospital mortality and prolonged ICU stay?

## Data Source

The analysis used the local project-owned MIMIC-IV v3.1 Parquet cache. Required tables were copied from GCS into a temporary local cache, analyzed locally, and then deleted. Only aggregate results are saved.

## Cohort Definition

- Diagnosis phenotype: ICD-9 codes beginning with `820` or `821`, ICD-10 codes beginning with `S72`, and diagnosis dictionary titles containing fracture terms for hip/femur/femoral/trochanteric regions.
- Matched diagnosis dictionary codes: 3189.
- Phenotype audit suspicious non-hip/femur dictionary-code examples: 0.
- Matched diagnosis rows: 6704.
- Hospital admissions with a matching hip/femur fracture diagnosis: 6068.
- ICU stays before first-stay restriction: 1070.
- Primary analytic cohort: first ICU stay per fracture hospitalization, N=920; unique patients=909.

## Methods

The primary outcome was in-hospital mortality. A secondary outcome was ICU length of stay. A third analysis modeled prolonged ICU stay, defined as ICU length of stay above the cohort 75th percentile. Continuous predictors were standardized so adjusted odds ratios and length-of-stay effects are interpreted per one standard deviation. The mortality and prolonged-stay models used logistic regression. ICU length of stay used a robust linear regression of log(1 + ICU length of stay).

Candidate predictors were age, sex, APS III score, OASIS score, SOFA score, first-day hemoglobin, white blood cell count, creatinine, BUN, systolic blood pressure minimum, heart rate maximum, and oxygen saturation minimum. Missing values were handled by complete-case analysis within each model.

## Cohort Characteristics

- Age: median 75.0 years (IQR 59.0-87.0).
- Male: 427 of 920 (46.4%).
- In-hospital mortality: 133 of 920 (14.5%).
- ICU length of stay: median 2.04 days (IQR 1.04-4.34).
- APS III: median 44.0 (IQR 35.0-56.0).
- SOFA: median 4.0 (IQR 2.0-6.0).

Race/ethnicity groups as recorded in MIMIC administrative data:
- White: 648.
- Unknown: 144.
- Black: 54.
- Other: 33.
- Hispanic: 24.
- Asian: 17.

## Mortality Model

- Complete-case N: 909; deaths: 130.
- AUROC: 0.825.
- Average precision: 0.538.

Strongest adjusted mortality associations by p-value:
- admission_age: adjusted OR 1.87 (1.35, 2.59), p=0.000143, per 1 SD.
- apsiii: adjusted OR 1.58 (1.13, 2.19), p=0.00719, per 1 SD.
- sofa: adjusted OR 1.48 (1.10, 1.99), p=0.00929, per 1 SD.
- bun_max: adjusted OR 1.35 (1.02, 1.77), p=0.035, per 1 SD.
- oasis: adjusted OR 1.29 (0.95, 1.75), p=0.106, per 1 SD.

## ICU Length-Of-Stay Model

- Complete-case N: 909; R-squared: 0.163.

Strongest adjusted ICU length-of-stay associations by p-value:
- oasis: 19.5% change in ICU LOS (12.7%, 26.8%), p=2.71e-09, per 1 SD.
- admission_age: -12.1% change in ICU LOS (-16.8%, -7.2%), p=3.9e-06, per 1 SD.
- sbp_min: -8.3% change in ICU LOS (-13.0%, -3.4%), p=0.0012, per 1 SD.
- spo2_min: 7.0% change in ICU LOS (2.1%, 12.0%), p=0.0043, per 1 SD.
- sofa: 9.8% change in ICU LOS (1.9%, 18.2%), p=0.0136, per 1 SD.

## Prolonged ICU Stay Model

- Complete-case N: 909; prolonged-stay cases: 229.
- AUROC: 0.732.

Strongest adjusted prolonged-stay associations by p-value:
- oasis: adjusted OR 1.67 (1.33, 2.11), p=1.33e-05, per 1 SD.
- admission_age: adjusted OR 0.71 (0.59, 0.86), p=0.000491, per 1 SD.
- sofa: adjusted OR 1.42 (1.12, 1.80), p=0.00414, per 1 SD.
- sbp_min: adjusted OR 0.79 (0.65, 0.96), p=0.0169, per 1 SD.
- male: adjusted OR 1.44 (1.02, 2.02), p=0.0363, per unit.

## Missingness

Most model variables were near-complete in the cohort, but variables with missingness should be reviewed before confirmatory use:
- hemoglobin_min: 7 missing (0.8%).
- wbc_max: 7 missing (0.8%).
- creatinine_max: 7 missing (0.8%).
- bun_max: 6 missing (0.7%).
- spo2_min: 2 missing (0.2%).
- sbp_min: 1 missing (0.1%).
- heart_rate_max: 1 missing (0.1%).
- admission_age: 0 missing (0.0%).
- male: 0 missing (0.0%).
- apsiii: 0 missing (0.0%).
- oasis: 0 missing (0.0%).
- sofa: 0 missing (0.0%).

## Interpretation

This analysis is most useful as a reproducible first-pass description of critically ill hip/femur fracture patients. It can identify severity markers and early physiologic features associated with worse outcomes, but it does not establish causality. The ICD phenotype should be reviewed by an orthopedic or clinical coding expert before publication-quality use.

## Quality And Cost Controls

- QA status: pass.
- Actual copied/read bytes: 88506026 (84.41 MiB).
- Conservative estimated transfer cost: $0.0099.
- Temporary row-level cache removed: yes.

QA checks:
- PASS COST_UNDER_CEILING: Estimated transfer cost $0.0099.
- PASS COHORT_NONEMPTY: Cohort rows: 920.
- PASS MORTALITY_BOTH_CLASSES: Mortality values: [0, 1].
- PASS LOS_POSITIVE: All non-missing ICU LOS values are positive.
- PASS NO_ROW_LEVEL_EXPORT: Temporary row-level cache is absent after the run.
- PASS MODEL_MORTALITY_FIT: Model n=909.
- PASS MODEL_LOS_FIT: Model n=909.
- PASS MODEL_PROLONGED_LOS_FIT: Model n=909.

## Limitations

- This is an observational ICU cohort analysis and does not estimate causal effects.
- The hip/femur fracture phenotype is ICD-code based and should be clinician-reviewed before publication use.
- Only first ICU stay per fracture hospitalization is used for the primary cohort.
- Administrative and derived variables may encode care processes as well as disease severity.

## Artifact Index

- `analysis-results.json`: model coefficients, metrics, cohort counts, and table summaries.
- `cohort-summary.json`: phenotype and cohort construction evidence.
- `matched-icd-codes.csv`: aggregate ICD phenotype code list.
- `phenotype-audit.json`: ICD prefix counts, sample titles, and suspicious-code screen.
- `qa.json`: quality checks and limitations.
- `cost-ledger.json`: byte and estimated-cost accounting.
- `run-manifest.json`: source tables and reproducibility metadata.
