# Acute Kidney Injury Diagnosis Codes After Cardiac Surgery

## Abstract

**Background:** Dialysis and cardiac-surgery ICU populations have high acuity and heterogeneous risk. This local MIMIC-IV analysis evaluates among icu admissions after cabg or open heart valve procedure codes, how are acute kidney injury diagnosis codes associated with mortality and icu length of stay.
**Methods:** We identified a diagnosis- or procedure-code-defined ICU cohort, kept the first ICU stay per hospitalization, summarized cohort characteristics, and fit complete-case adjusted models for in-hospital mortality and log-transformed ICU length of stay. Models adjusted for available first-day severity, laboratory, vital-sign, demographic, and comorbidity variables. Results are observational associations and are not causal estimates.
**Results:** The cohort included 9,261 first ICU stays from 9,189 patients. In-hospital mortality was 144 of 9,261 (1.6%).
**Conclusion:** The packet is suitable for local methods review. Stronger clinical claims require phenotype review, missing-data review, and external validation.

## Introduction

This study asks: Among ICU admissions after CABG or open heart valve procedure codes, how are acute kidney injury diagnosis codes associated with mortality and ICU length of stay? The goal is to produce a reproducible local-review manuscript and a machine-readable audit trail for a clinically plausible ICU cohort. The analysis is intended to test the research pipeline as much as to summarize the data: it should make cohort construction, missingness, model fit, and limitations visible.

## Methods

### Data Source And Setting

We analyzed a local project-owned Parquet cache of MIMIC-IV v3.1 tables. MIMIC-IV is a deidentified critical-care and hospital EHR dataset. This packet contains aggregate outputs only; temporary row-level Parquet cache files were removed after execution.

### Cohort Construction

Diagnosis and procedure code families were matched against the local MIMIC diagnosis and procedure dictionaries. The cohort used the first ICU stay for each matching hospitalization. Procedure-code cohorts use hospital procedure coding and therefore identify coded procedures, not operative notes or timestamps validated by chart review.

### Exposure And Outcomes

The primary exposure was: **Any acute kidney injury diagnosis code** (`any_aki`). The primary outcome was in-hospital mortality. ICU length of stay was analyzed as a secondary continuous outcome using log-transformed ICU days.

### Statistical Analysis

We fit adjusted logistic regression for in-hospital mortality and heteroskedasticity-robust linear regression for log-transformed ICU length of stay. Continuous predictors were standardized to one standard deviation when modeled. Candidate predictors were selected from first-day severity scores, laboratory values, vital signs, demographics, and comorbidity fields when available. Complete-case denominators are reported separately from cohort size.

### Quality Control

The runner recorded source-table inventory, transfer-cost estimates, matched code dictionaries, missingness, model diagnostics, events-per-predictor checks, collinearity screening, and row-cache cleanup status. QA warnings are treated as methods-review items rather than hidden implementation details.

## Results

### Cohort And Code Matching

The analysis started from 85,242 first ICU stays and retained 9,261 rows after the study cohort definition. The cohort included 9,189 unique patients.

### Baseline Characteristics

- admission_age: median 68.00 (IQR 60.00-75.00); n=9,261.
- los_icu: median 1.96 (IQR 1.25-3.25); n=9,261.
- los_hospital: median 7.00 (IQR 5.00-11.00); n=9,261.
- apsiii: median 33.00 (IQR 26.00-44.00); n=9,261.
- oasis: median 32.00 (IQR 27.00-37.00); n=9,261.
- sofa: median 5.00 (IQR 3.00-7.00); n=9,261.
- charlson_comorbidity_index: median 4.00 (IQR 3.00-6.00); n=9,261.
- creatinine_max: median 1.00 (IQR 0.80-1.20); n=9,250.
- bun_max: median 17.00 (IQR 14.00-22.00); n=9,250.
- hospital_expire_flag: 144 of 9,261 (1.6%).
- male: 6,752 of 9,261 (72.9%).
- any_aki: 1,609 of 9,261 (17.4%).
- dialysis_present: 148 of 9,261 (1.6%).
- any_crrt_record: 210 of 9,261 (2.3%).
- any_esrd: 237 of 9,261 (2.6%).

### Outcome By Exposure Group

- Unexposed: n=7,652; mortality 38/7,652 (0.5%); median ICU LOS 1.50 days.
- Exposed: n=1,609; mortality 106/1,609 (6.6%); median ICU LOS 3.42 days.

### Mortality Model

The mortality model retained 9,070 complete cases with 138 deaths. AUROC was 0.904, average precision was 0.160, and Brier score was 0.014. These are apparent in-sample performance values, not external validation.
For the primary exposure, adjusted OR was 7.74 (95% CI 4.98-12.04; p=<0.001).
- any_aki: adjusted OR 7.74 (95% CI 4.98-12.04); p=<0.001; per unit.
- creatinine_max: adjusted OR 1.33 (95% CI 1.18-1.51); p=<0.001; per 1 SD.
- apsiii: adjusted OR 1.60 (95% CI 1.31-1.96); p=<0.001; per 1 SD.
- glucose_max: adjusted OR 1.21 (95% CI 1.11-1.33); p=<0.001; per 1 SD.
- charlson_comorbidity_index: adjusted OR 1.52 (95% CI 1.24-1.86); p=<0.001; per 1 SD.
- sofa: adjusted OR 1.24 (95% CI 1.01-1.52); p=0.039; per 1 SD.
- bun_max: adjusted OR 0.86 (95% CI 0.74-1.00); p=0.051; per 1 SD.
- male: adjusted OR 0.70 (95% CI 0.47-1.03); p=0.069; per unit.

### ICU Length Of Stay Model

The ICU length-of-stay model retained 9,069 complete cases and had R-squared=0.219.
For the primary exposure, adjusted ICU LOS difference was 40.9% (95% CI 35.4% to 46.5%; p=<0.001).
- any_aki: 40.9% LOS change (95% CI 35.4% to 46.5%); p=<0.001; per unit.
- sofa: 10.1% LOS change (95% CI 8.5% to 11.7%); p=<0.001; per 1 SD.
- charlson_comorbidity_index: 7.9% LOS change (95% CI 6.2% to 9.7%); p=<0.001; per 1 SD.
- male: -10.4% LOS change (95% CI -12.7% to -8.1%); p=<0.001; per unit.
- admission_age: -2.0% LOS change (95% CI -3.4% to -0.6%); p=0.006; per 1 SD.
- apsiii: 2.1% LOS change (95% CI 0.6% to 3.6%); p=0.006; per 1 SD.
- creatinine_max: 2.2% LOS change (95% CI 0.5% to 3.9%); p=0.012; per 1 SD.
- glucose_max: 3.0% LOS change (95% CI 0.6% to 5.4%); p=0.012; per 1 SD.

### Propensity-Matched Exposure Analysis

Propensity-score matching used 11 covariates and matched 1,408 exposed ICU stays to 1,408 unexposed ICU stays. The maximum absolute standardized mean difference after matching was 0.055; balance status was pass.
In the matched sample, exposed stays had a mortality risk difference of 0.043 and a matched discordant-pair odds ratio of 4.13. Mean ICU length of stay differed by 2.48 days.
178 exposed rows were not matched within the caliper and should be considered a common-support limitation.

### Missingness And Diagnostics

- glucose_max: 190 missing (2.1%).
- hemoglobin_min: 12 missing (0.1%).
- creatinine_max: 11 missing (0.1%).
- bun_max: 11 missing (0.1%).
- wbc_max: 10 missing (0.1%).
- any_aki: 0 missing (0.0%).
- admission_age: 0 missing (0.0%).
- male: 0 missing (0.0%).
- apsiii: 0 missing (0.0%).
- oasis: 0 missing (0.0%).
- sofa: 0 missing (0.0%).
- charlson_comorbidity_index: 0 missing (0.0%).

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
- Cumulative estimated series cost: $0.1972 of $10.00.
- Artifact files include `analysis-results.json`, `table-one.csv`, `model-coefficients.csv`, `missingness.csv`, propensity matching CSVs when fit, code-match CSVs, QA JSON, cost receipt, manifest, critique, and this manuscript.

## What This Does And Does Not Show

- Shows: local associations and cohort summaries in a code-defined MIMIC-IV ICU cohort.
- Does not show: causality, external validity, dialysis effectiveness, surgical quality, or deployable prediction performance.
