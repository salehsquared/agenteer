# End-Stage Kidney Disease and ICU Outcomes

## Abstract

**Background:** Dialysis and cardiac-surgery ICU populations have high acuity and heterogeneous risk. This local MIMIC-IV analysis evaluates among icu admissions with end-stage kidney disease or dialysis-status diagnosis codes, what first-day features are associated with mortality and icu length of stay.
**Methods:** We identified a diagnosis- or procedure-code-defined ICU cohort, kept the first ICU stay per hospitalization, summarized cohort characteristics, and fit complete-case adjusted models for in-hospital mortality and log-transformed ICU length of stay. Models adjusted for available first-day severity, laboratory, vital-sign, demographic, and comorbidity variables. Results are observational associations and are not causal estimates.
**Results:** The cohort included 4,127 first ICU stays from 2,403 patients. In-hospital mortality was 637 of 4,127 (15.4%).
**Conclusion:** The packet is suitable for local methods review. Stronger clinical claims require phenotype review, missing-data review, and external validation.

## Introduction

This study asks: Among ICU admissions with end-stage kidney disease or dialysis-status diagnosis codes, what first-day features are associated with mortality and ICU length of stay? The goal is to produce a reproducible local-review manuscript and a machine-readable audit trail for a clinically plausible ICU cohort. The analysis is intended to test the research pipeline as much as to summarize the data: it should make cohort construction, missingness, model fit, and limitations visible.

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

The analysis started from 85,242 first ICU stays and retained 4,127 rows after the study cohort definition. The cohort included 2,403 unique patients.

### Baseline Characteristics

- admission_age: median 65.00 (IQR 54.00-74.00); n=4,127.
- los_icu: median 2.13 (IQR 1.13-4.29); n=4,127.
- los_hospital: median 8.00 (IQR 4.00-15.00); n=4,127.
- apsiii: median 55.00 (IQR 45.00-66.00); n=4,127.
- oasis: median 31.00 (IQR 25.00-38.00); n=4,127.
- sofa: median 6.00 (IQR 5.00-9.00); n=4,127.
- charlson_comorbidity_index: median 7.00 (IQR 5.00-9.00); n=4,127.
- creatinine_max: median 5.90 (IQR 4.10-8.10); n=4,104.
- bun_max: median 49.00 (IQR 34.00-72.00); n=4,103.
- hospital_expire_flag: 637 of 4,127 (15.4%).
- male: 2,423 of 4,127 (58.7%).
- dialysis_present: 2,521 of 4,127 (61.1%).
- any_crrt_record: 974 of 4,127 (23.6%).
- any_aki: 726 of 4,127 (17.6%).
- any_esrd: 4,127 of 4,127 (100.0%).

### Outcome By Exposure Group

- Unexposed: n=1,606; mortality 260/1,606 (16.2%); median ICU LOS 2.13 days.
- Exposed: n=2,521; mortality 377/2,521 (15.0%); median ICU LOS 2.13 days.

### Mortality Model

The mortality model retained 4,088 complete cases with 618 deaths. AUROC was 0.796, average precision was 0.435, and Brier score was 0.106. These are apparent in-sample performance values, not external validation.
For the primary exposure, adjusted OR was 0.98 (95% CI 0.80-1.19; p=0.817).
- sofa: adjusted OR 1.86 (95% CI 1.67-2.08); p=<0.001; per 1 SD.
- apsiii: adjusted OR 1.55 (95% CI 1.36-1.76); p=<0.001; per 1 SD.
- creatinine_max: adjusted OR 0.64 (95% CI 0.54-0.76); p=<0.001; per 1 SD.
- admission_age: adjusted OR 1.41 (95% CI 1.24-1.61); p=<0.001; per 1 SD.
- wbc_max: adjusted OR 1.18 (95% CI 1.09-1.28); p=<0.001; per 1 SD.
- charlson_comorbidity_index: adjusted OR 1.27 (95% CI 1.13-1.42); p=<0.001; per 1 SD.
- hemoglobin_min: adjusted OR 1.21 (95% CI 1.10-1.33); p=<0.001; per 1 SD.
- oasis: adjusted OR 0.87 (95% CI 0.76-0.99); p=0.037; per 1 SD.

### ICU Length Of Stay Model

The ICU length-of-stay model retained 4,087 complete cases and had R-squared=0.202.
For the primary exposure, adjusted ICU LOS difference was -1.4% (95% CI -5.7% to 2.9%; p=0.512).
- sofa: 20.5% LOS change (95% CI 17.1% to 24.0%); p=<0.001; per 1 SD.
- oasis: 16.0% LOS change (95% CI 12.5% to 19.7%); p=<0.001; per 1 SD.
- admission_age: -7.0% LOS change (95% CI -9.6% to -4.4%); p=<0.001; per 1 SD.
- creatinine_max: -7.8% LOS change (95% CI -11.6% to -3.8%); p=<0.001; per 1 SD.
- bun_max: 5.4% LOS change (95% CI 2.4% to 8.5%); p=<0.001; per 1 SD.
- charlson_comorbidity_index: 4.2% LOS change (95% CI 1.6% to 7.0%); p=0.002; per 1 SD.
- wbc_max: 4.0% LOS change (95% CI 1.1% to 6.9%); p=0.006; per 1 SD.
- male: 4.0% LOS change (95% CI -0.2% to 8.5%); p=0.063; per unit.

### Propensity-Matched Exposure Analysis

Propensity-score matching used 11 covariates and matched 1,429 exposed ICU stays to 1,429 unexposed ICU stays. The maximum absolute standardized mean difference after matching was 0.103; balance status was review.
In the matched sample, exposed stays had a mortality risk difference of -0.004 and a matched discordant-pair odds ratio of 0.97. Mean ICU length of stay differed by -0.19 days.
1,073 exposed rows were not matched within the caliper and should be considered a common-support limitation.

### Missingness And Diagnostics

- hemoglobin_min: 33 missing (0.8%).
- wbc_max: 32 missing (0.8%).
- glucose_max: 25 missing (0.6%).
- bun_max: 24 missing (0.6%).
- creatinine_max: 23 missing (0.6%).
- dialysis_present: 0 missing (0.0%).
- admission_age: 0 missing (0.0%).
- male: 0 missing (0.0%).
- apsiii: 0 missing (0.0%).
- oasis: 0 missing (0.0%).
- sofa: 0 missing (0.0%).
- charlson_comorbidity_index: 0 missing (0.0%).

## Discussion

This local MIMIC-IV analysis provides a reproducible, code-defined summary of nephrology ICU outcomes. The results show which measured first-day features and the declared exposure were associated with mortality and ICU length of stay in the analyzed table. They should be interpreted as associations in a deidentified EHR cohort, not as treatment effects or clinical recommendations.

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
- Cumulative estimated series cost: $0.2958 of $10.00.
- Artifact files include `analysis-results.json`, `table-one.csv`, `model-coefficients.csv`, `missingness.csv`, propensity matching CSVs when fit, code-match CSVs, QA JSON, cost receipt, manifest, critique, and this manuscript.

## What This Does And Does Not Show

- Shows: local associations and cohort summaries in a code-defined MIMIC-IV ICU cohort.
- Does not show: causality, external validity, dialysis effectiveness, surgical quality, or deployable prediction performance.
