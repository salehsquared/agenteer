# Renal Replacement Therapy After Coronary Artery Bypass Grafting

## Abstract

**Background:** Dialysis and cardiac-surgery ICU populations have high acuity and heterogeneous risk. This local MIMIC-IV analysis evaluates among icu admissions after coronary artery bypass graft procedure codes, how is first-day renal replacement therapy associated with mortality and icu length of stay.
**Methods:** We identified a diagnosis- or procedure-code-defined ICU cohort, kept the first ICU stay per hospitalization, summarized cohort characteristics, and fit complete-case adjusted models for in-hospital mortality and log-transformed ICU length of stay. Models adjusted for available first-day severity, laboratory, vital-sign, demographic, and comorbidity variables. Results are observational associations and are not causal estimates.
**Results:** The cohort included 6,529 first ICU stays from 6,518 patients. In-hospital mortality was 89 of 6,529 (1.4%).
**Conclusion:** The packet is suitable for local methods review. Stronger clinical claims require phenotype review, missing-data review, and external validation.

## Introduction

This study asks: Among ICU admissions after coronary artery bypass graft procedure codes, how is first-day renal replacement therapy associated with mortality and ICU length of stay? The goal is to produce a reproducible local-review manuscript and a machine-readable audit trail for a clinically plausible ICU cohort. The analysis is intended to test the research pipeline as much as to summarize the data: it should make cohort construction, missingness, model fit, and limitations visible.

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

The analysis started from 85,242 first ICU stays and retained 6,529 rows after the study cohort definition. The cohort included 6,518 unique patients.

### Baseline Characteristics

- admission_age: median 69.00 (IQR 61.00-75.00); n=6,529.
- los_icu: median 1.83 (IQR 1.21-3.17); n=6,529.
- los_hospital: median 7.00 (IQR 5.00-11.00); n=6,529.
- apsiii: median 33.00 (IQR 26.00-43.00); n=6,529.
- oasis: median 32.00 (IQR 28.00-37.00); n=6,529.
- sofa: median 5.00 (IQR 3.00-7.00); n=6,529.
- charlson_comorbidity_index: median 4.00 (IQR 3.00-6.00); n=6,529.
- creatinine_max: median 1.00 (IQR 0.80-1.20); n=6,522.
- bun_max: median 17.00 (IQR 14.00-22.00); n=6,522.
- hospital_expire_flag: 89 of 6,529 (1.4%).
- male: 5,121 of 6,529 (78.4%).
- dialysis_present: 104 of 6,529 (1.6%).
- any_crrt_record: 124 of 6,529 (1.9%).
- any_aki: 1,094 of 6,529 (16.8%).
- any_esrd: 182 of 6,529 (2.8%).

### Outcome By Exposure Group

- Unexposed: n=6,425; mortality 79/6,425 (1.2%); median ICU LOS 1.75 days.
- Exposed: n=104; mortality 10/104 (9.6%); median ICU LOS 3.13 days.

### Mortality Model

The mortality model retained 6,521 complete cases with 88 deaths. AUROC was 0.853, average precision was 0.105, and Brier score was 0.013. These are apparent in-sample performance values, not external validation.
For the primary exposure, adjusted OR was 1.85 (95% CI 0.83-4.15; p=0.135).
- charlson_comorbidity_index: adjusted OR 2.07 (95% CI 1.66-2.58); p=<0.001; per 1 SD.
- apsiii: adjusted OR 1.56 (95% CI 1.23-1.98); p=<0.001; per 1 SD.
- sofa: adjusted OR 1.59 (95% CI 1.24-2.04); p=<0.001; per 1 SD.
- male: adjusted OR 0.52 (95% CI 0.32-0.82); p=0.006; per unit.
- oasis: adjusted OR 0.70 (95% CI 0.54-0.90); p=0.006; per 1 SD.
- dialysis_present: adjusted OR 1.85 (95% CI 0.83-4.15); p=0.135; per unit.
- admission_age: adjusted OR 1.05 (95% CI 0.80-1.37); p=0.743; per 1 SD.
- hemoglobin_min: adjusted OR 0.98 (95% CI 0.76-1.26); p=0.867; per 1 SD.

### ICU Length Of Stay Model

The ICU length-of-stay model retained 6,520 complete cases and had R-squared=0.156.
For the primary exposure, adjusted ICU LOS difference was 2.5% (95% CI -10.1% to 17.0%; p=0.710).
- charlson_comorbidity_index: 14.8% LOS change (95% CI 12.8% to 16.9%); p=<0.001; per 1 SD.
- sofa: 8.6% LOS change (95% CI 6.8% to 10.4%); p=<0.001; per 1 SD.
- male: -8.5% LOS change (95% CI -11.5% to -5.5%); p=<0.001; per unit.
- apsiii: 3.9% LOS change (95% CI 2.1% to 5.7%); p=<0.001; per 1 SD.
- admission_age: -2.2% LOS change (95% CI -3.7% to -0.6%); p=0.006; per 1 SD.
- oasis: 1.5% LOS change (95% CI 0.2% to 2.9%); p=0.029; per 1 SD.
- dialysis_present: 2.5% LOS change (95% CI -10.1% to 17.0%); p=0.710; per unit.
- hemoglobin_min: -0.2% LOS change (95% CI -1.7% to 1.2%); p=0.741; per 1 SD.

### Propensity-Matched Exposure Analysis

Propensity-score matching used 7 covariates and matched 96 exposed ICU stays to 96 unexposed ICU stays. The maximum absolute standardized mean difference after matching was 0.144; balance status was review.
In the matched sample, exposed stays had a mortality risk difference of -0.021 and a matched discordant-pair odds ratio of 0.76. Mean ICU length of stay differed by -0.74 days.
7 exposed rows were not matched within the caliper and should be considered a common-support limitation.

### Missingness And Diagnostics

- hemoglobin_min: 8 missing (0.1%).
- dialysis_present: 0 missing (0.0%).
- admission_age: 0 missing (0.0%).
- male: 0 missing (0.0%).
- apsiii: 0 missing (0.0%).
- oasis: 0 missing (0.0%).
- sofa: 0 missing (0.0%).
- charlson_comorbidity_index: 0 missing (0.0%).
- hospital_expire_flag: 0 missing (0.0%).
- los_icu: 0 missing (0.0%).
- los_hospital: 0 missing (0.0%).

## Discussion

This local MIMIC-IV analysis provides a reproducible, code-defined summary of cardiac surgery/nephrology ICU outcomes. The results show which measured first-day features and the declared exposure were associated with mortality and ICU length of stay in the analyzed table. They should be interpreted as associations in a deidentified EHR cohort, not as treatment effects or clinical recommendations.

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
- Cumulative estimated series cost: $0.2395 of $10.00.
- Artifact files include `analysis-results.json`, `table-one.csv`, `model-coefficients.csv`, `missingness.csv`, propensity matching CSVs when fit, code-match CSVs, QA JSON, cost receipt, manifest, critique, and this manuscript.

## What This Does And Does Not Show

- Shows: local associations and cohort summaries in a code-defined MIMIC-IV ICU cohort.
- Does not show: causality, external validity, dialysis effectiveness, surgical quality, or deployable prediction performance.
