# Renal Replacement Therapy After Open Heart Valve Procedures

## Abstract

**Background:** Dialysis and cardiac-surgery ICU populations have high acuity and heterogeneous risk. This local MIMIC-IV analysis evaluates among icu admissions after open heart valve procedure codes, how is first-day renal replacement therapy associated with mortality and icu length of stay.
**Methods:** We identified a diagnosis- or procedure-code-defined ICU cohort, kept the first ICU stay per hospitalization, summarized cohort characteristics, and fit complete-case adjusted models for in-hospital mortality and log-transformed ICU length of stay. Models adjusted for available first-day severity, laboratory, vital-sign, demographic, and comorbidity variables. Results are observational associations and are not causal estimates.
**Results:** The cohort included 3,913 first ICU stays from 3,855 patients. In-hospital mortality was 89 of 3,913 (2.3%).
**Conclusion:** The packet is suitable for local methods review. Stronger clinical claims require phenotype review, missing-data review, and external validation.

## Introduction

This study asks: Among ICU admissions after open heart valve procedure codes, how is first-day renal replacement therapy associated with mortality and ICU length of stay? The goal is to produce a reproducible local-review manuscript and a machine-readable audit trail for a clinically plausible ICU cohort. The analysis is intended to test the research pipeline as much as to summarize the data: it should make cohort construction, missingness, model fit, and limitations visible.

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

The analysis started from 85,242 first ICU stays and retained 3,913 rows after the study cohort definition. The cohort included 3,855 unique patients.

### Baseline Characteristics

- admission_age: median 69.00 (IQR 60.00-77.00); n=3,913.
- los_icu: median 2.17 (IQR 1.29-4.00); n=3,913.
- los_hospital: median 7.00 (IQR 5.00-12.00); n=3,913.
- apsiii: median 35.00 (IQR 27.00-47.00); n=3,913.
- oasis: median 32.00 (IQR 27.00-37.00); n=3,913.
- sofa: median 6.00 (IQR 4.00-8.00); n=3,913.
- charlson_comorbidity_index: median 4.00 (IQR 3.00-6.00); n=3,913.
- creatinine_max: median 0.90 (IQR 0.80-1.20); n=3,905.
- bun_max: median 17.00 (IQR 14.00-23.00); n=3,905.
- hospital_expire_flag: 89 of 3,913 (2.3%).
- male: 2,487 of 3,913 (63.6%).
- dialysis_present: 68 of 3,913 (1.7%).
- any_crrt_record: 138 of 3,913 (3.5%).
- any_aki: 793 of 3,913 (20.3%).
- any_esrd: 97 of 3,913 (2.5%).

### Outcome By Exposure Group

- Unexposed: n=3,845; mortality 75/3,845 (2.0%); median ICU LOS 2.17 days.
- Exposed: n=68; mortality 14/68 (20.6%); median ICU LOS 4.86 days.

### Mortality Model

The mortality model retained 3,905 complete cases with 86 deaths. AUROC was 0.849, average precision was 0.149, and Brier score was 0.020. These are apparent in-sample performance values, not external validation.
For the primary exposure, adjusted OR was 2.74 (95% CI 1.28-5.88; p=0.010).
- charlson_comorbidity_index: adjusted OR 2.28 (95% CI 1.81-2.89); p=<0.001; per 1 SD.
- apsiii: adjusted OR 1.81 (95% CI 1.39-2.36); p=<0.001; per 1 SD.
- dialysis_present: adjusted OR 2.74 (95% CI 1.28-5.88); p=0.010; per unit.
- admission_age: adjusted OR 0.70 (95% CI 0.52-0.93); p=0.016; per 1 SD.
- oasis: adjusted OR 0.84 (95% CI 0.63-1.11); p=0.214; per 1 SD.
- sofa: adjusted OR 1.18 (95% CI 0.91-1.54); p=0.214; per 1 SD.
- male: adjusted OR 1.37 (95% CI 0.83-2.25); p=0.222; per unit.
- hemoglobin_min: adjusted OR 0.95 (95% CI 0.74-1.21); p=0.670; per 1 SD.

### ICU Length Of Stay Model

The ICU length-of-stay model retained 3,904 complete cases and had R-squared=0.188.
For the primary exposure, adjusted ICU LOS difference was 15.4% (95% CI -4.3% to 39.0%; p=0.134).
- charlson_comorbidity_index: 17.7% LOS change (95% CI 14.7% to 20.7%); p=<0.001; per 1 SD.
- sofa: 15.8% LOS change (95% CI 13.1% to 18.6%); p=<0.001; per 1 SD.
- admission_age: -8.1% LOS change (95% CI -10.3% to -5.9%); p=<0.001; per 1 SD.
- male: -7.1% LOS change (95% CI -10.6% to -3.5%); p=<0.001; per unit.
- apsiii: 3.9% LOS change (95% CI 1.3% to 6.6%); p=0.003; per 1 SD.
- hemoglobin_min: -2.4% LOS change (95% CI -4.5% to -0.2%); p=0.035; per 1 SD.
- dialysis_present: 15.4% LOS change (95% CI -4.3% to 39.0%); p=0.134; per unit.
- oasis: 1.2% LOS change (95% CI -0.8% to 3.3%); p=0.243; per 1 SD.

### Propensity-Matched Exposure Analysis

Propensity-score matching used 7 covariates and matched 62 exposed ICU stays to 62 unexposed ICU stays. The maximum absolute standardized mean difference after matching was 0.149; balance status was review.
In the matched sample, exposed stays had a mortality risk difference of 0.097 and a matched discordant-pair odds ratio of 2.09. Mean ICU length of stay differed by -1.33 days.
4 exposed rows were not matched within the caliper and should be considered a common-support limitation.

### Missingness And Diagnostics

- hemoglobin_min: 8 missing (0.2%).
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
- Cumulative estimated series cost: $0.2535 of $10.00.
- Artifact files include `analysis-results.json`, `table-one.csv`, `model-coefficients.csv`, `missingness.csv`, propensity matching CSVs when fit, code-match CSVs, QA JSON, cost receipt, manifest, critique, and this manuscript.

## What This Does And Does Not Show

- Shows: local associations and cohort summaries in a code-defined MIMIC-IV ICU cohort.
- Does not show: causality, external validity, dialysis effectiveness, surgical quality, or deployable prediction performance.
