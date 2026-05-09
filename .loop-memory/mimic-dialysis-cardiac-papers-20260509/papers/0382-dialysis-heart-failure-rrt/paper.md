# Renal Replacement Therapy in Heart Failure ICU Admissions

## Abstract

**Background:** Dialysis and cardiac-surgery ICU populations have high acuity and heterogeneous risk. This local MIMIC-IV analysis evaluates among icu admissions with heart failure diagnosis codes, how is first-day renal replacement therapy associated with mortality and icu length of stay.
**Methods:** We identified a diagnosis- or procedure-code-defined ICU cohort, kept the first ICU stay per hospitalization, summarized cohort characteristics, and fit complete-case adjusted models for in-hospital mortality and log-transformed ICU length of stay. Models adjusted for available first-day severity, laboratory, vital-sign, demographic, and comorbidity variables. Results are observational associations and are not causal estimates.
**Results:** The cohort included 22,580 first ICU stays from 16,583 patients. In-hospital mortality was 3,339 of 22,580 (14.8%).
**Conclusion:** The packet is suitable for local methods review. Stronger clinical claims require phenotype review, missing-data review, and external validation.

## Introduction

This study asks: Among ICU admissions with heart failure diagnosis codes, how is first-day renal replacement therapy associated with mortality and ICU length of stay? The goal is to produce a reproducible local-review manuscript and a machine-readable audit trail for a clinically plausible ICU cohort. The analysis is intended to test the research pipeline as much as to summarize the data: it should make cohort construction, missingness, model fit, and limitations visible.

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

The analysis started from 85,242 first ICU stays and retained 22,580 rows after the study cohort definition. The cohort included 16,583 unique patients.

### Baseline Characteristics

- admission_age: median 74.00 (IQR 64.00-83.00); n=22,580.
- los_icu: median 2.25 (IQR 1.21-4.42); n=22,578.
- los_hospital: median 8.00 (IQR 5.00-14.00); n=22,580.
- apsiii: median 45.00 (IQR 35.00-58.00); n=22,580.
- oasis: median 32.00 (IQR 26.00-38.00); n=22,580.
- sofa: median 5.00 (IQR 3.00-7.00); n=22,580.
- charlson_comorbidity_index: median 7.00 (IQR 5.00-9.00); n=22,580.
- creatinine_max: median 1.40 (IQR 1.00-2.30); n=22,451.
- bun_max: median 31.00 (IQR 20.00-50.00); n=22,447.
- hospital_expire_flag: 3,339 of 22,580 (14.8%).
- male: 12,423 of 22,580 (55.0%).
- dialysis_present: 1,753 of 22,580 (7.8%).
- any_crrt_record: 1,339 of 22,580 (5.9%).
- any_aki: 10,717 of 22,580 (47.5%).
- any_esrd: 2,151 of 22,580 (9.5%).

### Outcome By Exposure Group

- Unexposed: n=20,827; mortality 2,915/20,827 (14.0%); median ICU LOS 2.21 days.
- Exposed: n=1,753; mortality 424/1,753 (24.2%); median ICU LOS 2.50 days.

### Mortality Model

The mortality model retained 22,325 complete cases with 3,256 deaths. AUROC was 0.795, average precision was 0.441, and Brier score was 0.102. These are apparent in-sample performance values, not external validation.
For the primary exposure, adjusted OR was 1.29 (95% CI 1.09-1.52; p=0.003).
- apsiii: adjusted OR 1.67 (95% CI 1.58-1.77); p=<0.001; per 1 SD.
- sofa: adjusted OR 1.45 (95% CI 1.38-1.54); p=<0.001; per 1 SD.
- charlson_comorbidity_index: adjusted OR 1.35 (95% CI 1.29-1.42); p=<0.001; per 1 SD.
- oasis: adjusted OR 1.24 (95% CI 1.18-1.32); p=<0.001; per 1 SD.
- bun_max: adjusted OR 1.20 (95% CI 1.15-1.26); p=<0.001; per 1 SD.
- creatinine_max: adjusted OR 0.78 (95% CI 0.73-0.84); p=<0.001; per 1 SD.
- admission_age: adjusted OR 1.19 (95% CI 1.13-1.25); p=<0.001; per 1 SD.
- wbc_max: adjusted OR 1.09 (95% CI 1.05-1.13); p=<0.001; per 1 SD.

### ICU Length Of Stay Model

The ICU length-of-stay model retained 22,311 complete cases and had R-squared=0.124.
For the primary exposure, adjusted ICU LOS difference was 5.4% (95% CI 0.9% to 10.2%; p=0.019).
- oasis: 13.8% LOS change (95% CI 12.4% to 15.1%); p=<0.001; per 1 SD.
- sofa: 14.0% LOS change (95% CI 12.6% to 15.5%); p=<0.001; per 1 SD.
- admission_age: -9.6% LOS change (95% CI -10.5% to -8.6%); p=<0.001; per 1 SD.
- creatinine_max: -7.1% LOS change (95% CI -8.5% to -5.7%); p=<0.001; per 1 SD.
- bun_max: 4.0% LOS change (95% CI 2.7% to 5.3%); p=<0.001; per 1 SD.
- wbc_max: 2.5% LOS change (95% CI 1.4% to 3.5%); p=<0.001; per 1 SD.
- charlson_comorbidity_index: 1.7% LOS change (95% CI 0.6% to 2.7%); p=0.002; per 1 SD.
- male: 2.7% LOS change (95% CI 0.9% to 4.4%); p=0.003; per unit.

### Propensity-Matched Exposure Analysis

Propensity-score matching used 11 covariates and matched 1,380 exposed ICU stays to 1,380 unexposed ICU stays. The maximum absolute standardized mean difference after matching was 0.255; balance status was review.
In the matched sample, exposed stays had a mortality risk difference of -0.038 and a matched discordant-pair odds ratio of 0.83. Mean ICU length of stay differed by 0.34 days.
359 exposed rows were not matched within the caliper and should be considered a common-support limitation.

### Missingness And Diagnostics

- glucose_max: 194 missing (0.9%).
- wbc_max: 168 missing (0.7%).
- hemoglobin_min: 164 missing (0.7%).
- bun_max: 133 missing (0.6%).
- creatinine_max: 129 missing (0.6%).
- los_icu: 2 missing (0.0%).
- dialysis_present: 0 missing (0.0%).
- admission_age: 0 missing (0.0%).
- male: 0 missing (0.0%).
- apsiii: 0 missing (0.0%).
- oasis: 0 missing (0.0%).
- sofa: 0 missing (0.0%).

## Discussion

This local MIMIC-IV analysis provides a reproducible, code-defined summary of cardiorenal critical care ICU outcomes. The results show which measured first-day features and the declared exposure were associated with mortality and ICU length of stay in the analyzed table. They should be interpreted as associations in a deidentified EHR cohort, not as treatment effects or clinical recommendations.

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
- Cumulative estimated series cost: $0.1127 of $10.00.
- Artifact files include `analysis-results.json`, `table-one.csv`, `model-coefficients.csv`, `missingness.csv`, propensity matching CSVs when fit, code-match CSVs, QA JSON, cost receipt, manifest, critique, and this manuscript.

## What This Does And Does Not Show

- Shows: local associations and cohort summaries in a code-defined MIMIC-IV ICU cohort.
- Does not show: causality, external validity, dialysis effectiveness, surgical quality, or deployable prediction performance.
