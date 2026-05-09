# First-Day Renal Replacement Therapy and ICU Outcomes in Acute Kidney Injury

## Abstract

**Background:** Dialysis and cardiac-surgery ICU populations have high acuity and heterogeneous risk. This local MIMIC-IV analysis evaluates among icu admissions with acute kidney injury diagnosis codes, how is first-day renal replacement therapy associated with mortality and icu length of stay.
**Methods:** We identified a diagnosis- or procedure-code-defined ICU cohort, kept the first ICU stay per hospitalization, summarized cohort characteristics, and fit complete-case adjusted models for in-hospital mortality and log-transformed ICU length of stay. Models adjusted for available first-day severity, laboratory, vital-sign, demographic, and comorbidity variables. Results are observational associations and are not causal estimates.
**Results:** The cohort included 25,658 first ICU stays from 21,251 patients. In-hospital mortality was 5,370 of 25,658 (20.9%).
**Conclusion:** The packet is suitable for local methods review. Stronger clinical claims require phenotype review, missing-data review, and external validation.

## Introduction

This study asks: Among ICU admissions with acute kidney injury diagnosis codes, how is first-day renal replacement therapy associated with mortality and ICU length of stay? The goal is to produce a reproducible local-review manuscript and a machine-readable audit trail for a clinically plausible ICU cohort. The analysis is intended to test the research pipeline as much as to summarize the data: it should make cohort construction, missingness, model fit, and limitations visible.

## Methods

### Data Source And Setting

We analyzed a local project-owned Parquet cache of MIMIC-IV v3.1 tables. MIMIC-IV is a deidentified critical-care and hospital EHR dataset. This packet contains aggregate outputs only; temporary row-level Parquet cache files were removed after execution.

### Cohort Construction

Diagnosis and procedure code families were matched against the local MIMIC diagnosis and procedure dictionaries. The cohort used the first ICU stay for each matching hospitalization. Procedure-code cohorts use hospital procedure coding and therefore identify coded procedures, not operative notes or timestamps validated by chart review.

### Exposure And Outcomes

The primary exposure was: **First-day renal replacement therapy present** (`dialysis_present`). The primary outcome was in-hospital mortality. ICU length of stay was analyzed as a secondary continuous outcome using log-transformed ICU days.

### Statistical Analysis

We fit adjusted logistic regression for in-hospital mortality and heteroskedasticity-robust linear regression for log-transformed ICU length of stay. Continuous predictors were standardized to one standard deviation when modeled. Candidate predictors were selected from first-day severity scores, laboratory values, vital signs, demographics, and comorbidity fields when available. Complete-case denominators are reported separately from cohort size.

### Quality Control

The runner recorded source-table inventory, transfer-cost estimates, matched code dictionaries, missingness, model diagnostics, events-per-predictor checks, collinearity screening, and row-cache cleanup status. QA warnings are treated as methods-review items rather than hidden implementation details.

## Results

### Cohort And Code Matching

The analysis started from 85,242 first ICU stays and retained 25,658 rows after the study cohort definition. The cohort included 21,251 unique patients.

### Baseline Characteristics

- admission_age: median 70.00 (IQR 58.00-80.00); n=25,658.
- los_icu: median 2.54 (IQR 1.33-5.25); n=25,649.
- los_hospital: median 10.00 (IQR 5.00-17.00); n=25,658.
- apsiii: median 51.00 (IQR 40.00-66.00); n=25,658.
- oasis: median 33.00 (IQR 27.00-39.00); n=25,658.
- sofa: median 5.00 (IQR 3.00-8.00); n=25,658.
- charlson_comorbidity_index: median 6.00 (IQR 4.00-8.00); n=25,658.
- creatinine_max: median 1.70 (IQR 1.30-2.60); n=25,544.
- bun_max: median 36.00 (IQR 24.00-55.00); n=25,542.
- hospital_expire_flag: 5,370 of 25,658 (20.9%).
- male: 15,167 of 25,658 (59.1%).
- dialysis_present: 1,552 of 25,658 (6.0%).
- any_crrt_record: 2,172 of 25,658 (8.5%).
- any_aki: 25,658 of 25,658 (100.0%).
- any_esrd: 726 of 25,658 (2.8%).

### Outcome By Exposure Group

- Unexposed: n=24,106; mortality 4,727/24,106 (19.6%); median ICU LOS 2.46 days.
- Exposed: n=1,552; mortality 643/1,552 (41.4%); median ICU LOS 4.08 days.

### Mortality Model

The mortality model retained 25,431 complete cases with 5,289 deaths. AUROC was 0.793, average precision was 0.525, and Brier score was 0.131. These are apparent in-sample performance values, not external validation.
For the primary exposure, adjusted OR was 1.40 (95% CI 1.22-1.62; p=<0.001).
- apsiii: adjusted OR 1.82 (95% CI 1.73-1.92); p=<0.001; per 1 SD.
- sofa: adjusted OR 1.51 (95% CI 1.43-1.58); p=<0.001; per 1 SD.
- charlson_comorbidity_index: adjusted OR 1.34 (95% CI 1.28-1.39); p=<0.001; per 1 SD.
- creatinine_max: adjusted OR 0.70 (95% CI 0.66-0.74); p=<0.001; per 1 SD.
- oasis: adjusted OR 1.25 (95% CI 1.19-1.31); p=<0.001; per 1 SD.
- glucose_max: adjusted OR 0.88 (95% CI 0.85-0.92); p=<0.001; per 1 SD.
- bun_max: adjusted OR 1.15 (95% CI 1.10-1.20); p=<0.001; per 1 SD.
- dialysis_present: adjusted OR 1.40 (95% CI 1.22-1.62); p=<0.001; per unit.

### ICU Length Of Stay Model

The ICU length-of-stay model retained 25,411 complete cases and had R-squared=0.123.
For the primary exposure, adjusted ICU LOS difference was 14.5% (95% CI 9.2% to 20.1%; p=<0.001).
- oasis: 23.1% LOS change (95% CI 21.5% to 24.7%); p=<0.001; per 1 SD.
- sofa: 13.9% LOS change (95% CI 12.3% to 15.5%); p=<0.001; per 1 SD.
- admission_age: -9.5% LOS change (95% CI -10.6% to -8.5%); p=<0.001; per 1 SD.
- creatinine_max: -5.9% LOS change (95% CI -7.0% to -4.7%); p=<0.001; per 1 SD.
- apsiii: -7.2% LOS change (95% CI -8.7% to -5.7%); p=<0.001; per 1 SD.
- dialysis_present: 14.5% LOS change (95% CI 9.2% to 20.1%); p=<0.001; per unit.
- male: 3.5% LOS change (95% CI 1.7% to 5.4%); p=<0.001; per unit.
- glucose_max: -1.5% LOS change (95% CI -2.2% to -0.7%); p=<0.001; per 1 SD.

### Propensity-Matched Exposure Analysis

Propensity-score matching used 11 covariates and matched 1,437 exposed ICU stays to 1,437 unexposed ICU stays. The maximum absolute standardized mean difference after matching was 0.077; balance status was pass.
In the matched sample, exposed stays had a mortality risk difference of 0.015 and a matched discordant-pair odds ratio of 1.06. Mean ICU length of stay differed by 1.59 days.
101 exposed rows were not matched within the caliper and should be considered a common-support limitation.

### Missingness And Diagnostics

- wbc_max: 175 missing (0.7%).
- hemoglobin_min: 173 missing (0.7%).
- glucose_max: 147 missing (0.6%).
- bun_max: 116 missing (0.5%).
- creatinine_max: 114 missing (0.4%).
- los_icu: 9 missing (0.0%).
- dialysis_present: 0 missing (0.0%).
- admission_age: 0 missing (0.0%).
- male: 0 missing (0.0%).
- apsiii: 0 missing (0.0%).
- oasis: 0 missing (0.0%).
- sofa: 0 missing (0.0%).

## Discussion

This local MIMIC-IV analysis provides a reproducible, code-defined summary of nephrology/critical care ICU outcomes. The results show which measured first-day features and the declared exposure were associated with mortality and ICU length of stay in the analyzed table. They should be interpreted as associations in a deidentified EHR cohort, not as treatment effects or clinical recommendations.

## Limitations

- Cohorts are defined by diagnosis or procedure codes and require clinical/coding review.
- Procedure timing and diagnosis timing may not identify the exact onset or indication for ICU care.
- Complete-case modeling can bias estimates if missingness is related to illness severity, exposure, or outcome.
- Apparent discrimination metrics are in-sample and should not be used as deployment or prediction-model validation evidence.
- Propensity matching balances recorded covariates only and does not address unmeasured confounding, code-timing ambiguity, or treatment indication.
- The analysis does not establish whether dialysis, CRRT, surgery, or AKI caused the observed outcomes.

## Reproducibility And Artifacts

- QA status: pass.
- Typed QA issues: 1.
- Estimated run cost: $0.0141.
- Cumulative estimated series cost: $0.2676 of $10.00.
- Artifact files include `analysis-results.json`, `table-one.csv`, `model-coefficients.csv`, `missingness.csv`, propensity matching CSVs when fit, code-match CSVs, QA JSON, cost receipt, manifest, critique, and this manuscript.

## What This Does And Does Not Show

- Shows: local associations and cohort summaries in a code-defined MIMIC-IV ICU cohort.
- Does not show: causality, external validity, dialysis effectiveness, surgical quality, or deployable prediction performance.
