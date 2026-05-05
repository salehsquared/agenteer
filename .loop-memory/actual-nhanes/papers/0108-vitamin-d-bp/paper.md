# Serum 25-hydroxyvitamin D and measured hypertension in NHANES adults: a cross-sectional pipeline dogfood analysis

## Abstract

**Background:** Vitamin D status and blood pressure are commonly studied in observational datasets, but NHANES analyses require careful reporting of sample construction, missingness, and survey-design limitations.

**Objective:** To estimate whether serum 25-hydroxyvitamin D was associated with measured hypertension status among adults in a locally cached curated NHANES dataset.

**Methods:** This cross-sectional analysis merged demographics, vitamin D, and blood pressure Parquet domains by `SEQN`. Adults aged 18 years or older with nonmissing serum 25-hydroxyvitamin D, first systolic and diastolic blood pressure readings, covariates, and positive `WTMEC2YR` were included. Hypertension was operationalized as `BPXSY1 >= 130` or `BPXDI1 >= 80`, using the 2017 ACC/AHA threshold as a measurement threshold rather than a clinical diagnosis [3]. A weighted approximate logistic GLM estimated the association per 10 nmol/L higher vitamin D, adjusting for age, sex, and race/ethnicity indicators. `WTMEC2YR` was used as a normalized frequency weight; full NHANES strata/PSU variance estimation was not implemented in this artifact [2].

**Results:** The merged adult file contained 22,807 adults; 19,770 complete-case participants were eligible. The approximate adjusted odds ratio for measured hypertension per 10 nmol/L higher vitamin D was 0.965 (95% CI 0.954 to 0.977; p=3.6e-09). Weighted hypertension prevalence by vitamin D quartile ranged from 36.3% to 40.1%.

**Conclusions:** In this pipeline dogfood analysis, higher serum 25-hydroxyvitamin D was associated with lower odds of measured hypertension under an approximate weighted model. This should be interpreted as exploratory association evidence only because the analysis is cross-sectional, uses complete cases, and does not yet implement full NHANES complex survey variance.

## Introduction

NHANES is a major substrate for population health research because it combines interview, examination, and laboratory measures. The same richness creates methodological obligations: analyses should report how domains were merged, which weights were used, how missingness affected the analytic cohort, and what limitations remain. STROBE emphasizes transparent reporting for observational studies [1], and NHANES analytic guidance emphasizes correct handling of survey design and weights [2].

This paper is intentionally a dogfood artifact for the Agenteer research pipeline. Its purpose is both scientific and infrastructural: it tests whether the pipeline can produce a reproducible, inspectable paper from actual NHANES data while preserving the distinction between exploratory association and causal inference.

## Methods

### Data Source

The analysis used the local MedBrevia curated NHANES Parquet cache `nhanes-v1-20260430`. The domains were `demographics.parquet`, `vitamin_d.parquet`, and `blood_pressure.parquet`. No MedBrevia files were modified.

### Study Population

The domains were inner-merged by `SEQN`. Adults were defined as participants with `RIDAGEYR >= 18`. The complete-case cohort required nonmissing age, sex, race/ethnicity, `WTMEC2YR`, survey strata and PSU variables, serum 25-hydroxyvitamin D, and first systolic and diastolic blood pressure readings.

### Exposure and Outcome

The exposure was serum 25-hydroxyvitamin D (`LBXVIDMS`, nmol/L). The endpoint was measured hypertension using the first blood pressure reading fields: `BPXSY1 >= 130` or `BPXDI1 >= 80`. This threshold follows the 2017 ACC/AHA blood pressure categories [3], but this analysis does not diagnose hypertension clinically.

### Statistical Analysis

A weighted approximate logistic GLM estimated measured hypertension odds per 10 nmol/L higher vitamin D. Covariates were age, sex, and race/ethnicity indicators. `WTMEC2YR` was used as a normalized frequency weight. Full NHANES complex survey variance with strata and PSU was not implemented, so confidence intervals are approximate.

## Results

### Sample Construction

| Step | Rows |
| --- | ---: |
| Inner merged rows | 35,909 |
| Adult merged rows | 22,807 |
| Complete-case eligible rows | 19,770 |

### Quartile Description

| Vitamin D quartile | N | Range (nmol/L) | Weighted measured hypertension prevalence |
| --- | ---: | ---: | ---: |
| Q1 lowest | 4945 | 7.0-44.9 | 39.6% |
| Q2 | 4964 | 45.0-62.1 | 36.3% |
| Q3 | 4926 | 62.2-81.1 | 36.3% |
| Q4 highest | 4935 | 81.2-422.0 | 40.1% |

### Adjusted Association

Per 10 nmol/L higher serum 25-hydroxyvitamin D, the approximate adjusted odds ratio for measured hypertension was **0.965** (95% CI **0.954 to 0.977**, p=3.6e-09).

## Discussion

This exploratory analysis found an inverse association between serum 25-hydroxyvitamin D and measured hypertension under an approximate weighted model. The result is plausible as an observational pattern, but it should not be interpreted causally. Reverse causation, confounding, seasonality, medication use, comorbidities, and selection into complete cases may influence the estimate.

The pipeline itself improved through this analysis: file-level missingness initially made blood pressure appear less usable, while merged adult complete-case feasibility showed a large analyzable cohort. This supports adding cohort-feasibility evidence before analysis generation.

## Limitations

This is a cross-sectional observational analysis. It cannot establish temporality or causality. The analysis used complete cases and may be biased if missingness is related to exposure, outcome, or covariates; missing-data reporting should be explicit in observational studies [4]. The model used `WTMEC2YR` as an approximate frequency weight but did not implement full NHANES strata/PSU variance estimation [2]. Blood pressure was operationalized from first reading fields and should not be treated as a clinical diagnosis. The analysis did not adjust for season, BMI, medications, kidney disease, socioeconomic status, or diabetes.

## Reproducibility

Artifacts are saved in `/Users/saleh/TechProjects/agenteer/.loop-memory/actual-nhanes/papers/0108-vitamin-d-bp/`. Inputs were read from the local MedBrevia curated NHANES cache. The companion `analysis.json` records row counts, model specification, estimates, and source URLs.

## References

[1] STROBE Statement. https://www.strobe-statement.org/

[2] CDC/NCHS NHANES Analytic Guidelines. https://wwwn.cdc.gov/nchs/nhanes/AnalyticGuidelines.aspx

[3] American Heart Association. 2017 Hypertension Clinical Guidelines: Top Things to Know. https://professional.heart.org/en/science-news/2017-hypertension-clinical-guidelines/top-things-to-know

[4] TARMOS: Transparent Reporting of a multivariable prediction model for individual prognosis or diagnosis when using Missing data. https://arxiv.org/abs/2004.14066
