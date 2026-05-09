# Renal Replacement Therapy in Sepsis-Associated ICU Admissions

## Abstract

**Background:** Dialysis and cardiac-surgery ICU populations have high acuity and heterogeneous risk. This local MIMIC-IV analysis evaluates among icu admissions with sepsis diagnosis codes, how is first-day renal replacement therapy associated with mortality and icu length of stay.
**Methods:** We identified a diagnosis- or procedure-code-defined ICU cohort, kept the first ICU stay per hospitalization, summarized cohort characteristics, and fit complete-case adjusted models for in-hospital mortality and log-transformed ICU length of stay. Models adjusted for available first-day severity, laboratory, vital-sign, demographic, and comorbidity variables. Results are observational associations and are not causal estimates.
**Results:** The cohort included 13,730 first ICU stays from 11,839 patients. In-hospital mortality was 3,875 of 13,730 (28.2%).
**Conclusion:** The packet is suitable for local methods review. Stronger clinical claims require phenotype review, missing-data review, and external validation.

## Introduction

This study asks: Among ICU admissions with sepsis diagnosis codes, how is first-day renal replacement therapy associated with mortality and ICU length of stay? The goal is to produce a reproducible local-review manuscript and a machine-readable audit trail for a clinically plausible ICU cohort. The analysis is intended to test the research pipeline as much as to summarize the data: it should make cohort construction, missingness, model fit, and limitations visible.

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

The analysis started from 85,242 first ICU stays and retained 13,730 rows after the study cohort definition. The cohort included 11,839 unique patients.

### Baseline Characteristics

- admission_age: median 68.00 (IQR 58.00-79.00); n=13,730.
- los_icu: median 2.88 (IQR 1.46-6.71); n=13,723.
- los_hospital: median 10.00 (IQR 6.00-20.00); n=13,730.
- apsiii: median 54.00 (IQR 41.00-71.00); n=13,730.
- oasis: median 35.00 (IQR 28.00-41.00); n=13,730.
- sofa: median 6.00 (IQR 4.00-9.00); n=13,730.
- charlson_comorbidity_index: median 6.00 (IQR 4.00-8.00); n=13,730.
- creatinine_max: median 1.40 (IQR 0.90-2.50); n=13,656.
- bun_max: median 30.00 (IQR 19.00-49.00); n=13,651.
- hospital_expire_flag: 3,875 of 13,730 (28.2%).
- male: 7,603 of 13,730 (55.4%).
- dialysis_present: 1,253 of 13,730 (9.1%).
- any_crrt_record: 1,487 of 13,730 (10.8%).
- any_aki: 8,277 of 13,730 (60.3%).
- any_esrd: 1,030 of 13,730 (7.5%).

### Outcome By Exposure Group

- Unexposed: n=12,477; mortality 3,297/12,477 (26.4%); median ICU LOS 2.79 days.
- Exposed: n=1,253; mortality 578/1,253 (46.1%); median ICU LOS 4.25 days.

### Mortality Model

The mortality model retained 13,603 complete cases with 3,805 deaths. AUROC was 0.781, average precision was 0.585, and Brier score was 0.160. These are apparent in-sample performance values, not external validation.
For the primary exposure, adjusted OR was 1.35 (95% CI 1.15-1.59; p=<0.001).
- apsiii: adjusted OR 1.90 (95% CI 1.77-2.04); p=<0.001; per 1 SD.
- charlson_comorbidity_index: adjusted OR 1.44 (95% CI 1.37-1.51); p=<0.001; per 1 SD.
- sofa: adjusted OR 1.49 (95% CI 1.39-1.58); p=<0.001; per 1 SD.
- creatinine_max: adjusted OR 0.80 (95% CI 0.75-0.85); p=<0.001; per 1 SD.
- glucose_max: adjusted OR 0.90 (95% CI 0.86-0.95); p=<0.001; per 1 SD.
- bun_max: adjusted OR 1.12 (95% CI 1.06-1.18); p=<0.001; per 1 SD.
- dialysis_present: adjusted OR 1.35 (95% CI 1.15-1.59); p=<0.001; per unit.
- oasis: adjusted OR 1.12 (95% CI 1.05-1.19); p=<0.001; per 1 SD.

### ICU Length Of Stay Model

The ICU length-of-stay model retained 13,592 complete cases and had R-squared=0.121.
For the primary exposure, adjusted ICU LOS difference was 12.1% (95% CI 5.5% to 19.1%; p=<0.001).
- oasis: 29.8% LOS change (95% CI 27.3% to 32.3%); p=<0.001; per 1 SD.
- admission_age: -14.8% LOS change (95% CI -16.1% to -13.4%); p=<0.001; per 1 SD.
- sofa: 10.8% LOS change (95% CI 8.6% to 13.1%); p=<0.001; per 1 SD.
- apsiii: -10.2% LOS change (95% CI -12.3% to -8.0%); p=<0.001; per 1 SD.
- bun_max: 5.6% LOS change (95% CI 3.5% to 7.6%); p=<0.001; per 1 SD.
- male: 6.0% LOS change (95% CI 3.2% to 8.8%); p=<0.001; per unit.
- creatinine_max: -3.9% LOS change (95% CI -6.0% to -1.9%); p=<0.001; per 1 SD.
- dialysis_present: 12.1% LOS change (95% CI 5.5% to 19.1%); p=<0.001; per unit.

### Propensity-Matched Exposure Analysis

Propensity-score matching used 11 covariates and matched 1,049 exposed ICU stays to 1,049 unexposed ICU stays. The maximum absolute standardized mean difference after matching was 0.184; balance status was review.
In the matched sample, exposed stays had a mortality risk difference of 0.021 and a matched discordant-pair odds ratio of 1.09. Mean ICU length of stay differed by 1.55 days.
194 exposed rows were not matched within the caliper and should be considered a common-support limitation.

### Missingness And Diagnostics

- wbc_max: 101 missing (0.7%).
- hemoglobin_min: 97 missing (0.7%).
- glucose_max: 86 missing (0.6%).
- bun_max: 79 missing (0.6%).
- creatinine_max: 74 missing (0.5%).
- los_icu: 7 missing (0.1%).
- dialysis_present: 0 missing (0.0%).
- admission_age: 0 missing (0.0%).
- male: 0 missing (0.0%).
- apsiii: 0 missing (0.0%).
- oasis: 0 missing (0.0%).
- sofa: 0 missing (0.0%).

## Discussion

This local MIMIC-IV analysis provides a reproducible, code-defined summary of nephrology/infectious diseases ICU outcomes. The results show which measured first-day features and the declared exposure were associated with mortality and ICU length of stay in the analyzed table. They should be interpreted as associations in a deidentified EHR cohort, not as treatment effects or clinical recommendations.

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
- Cumulative estimated series cost: $0.0986 of $10.00.
- Artifact files include `analysis-results.json`, `table-one.csv`, `model-coefficients.csv`, `missingness.csv`, propensity matching CSVs when fit, code-match CSVs, QA JSON, cost receipt, manifest, critique, and this manuscript.

## What This Does And Does Not Show

- Shows: local associations and cohort summaries in a code-defined MIMIC-IV ICU cohort.
- Does not show: causality, external validity, dialysis effectiveness, surgical quality, or deployable prediction performance.
