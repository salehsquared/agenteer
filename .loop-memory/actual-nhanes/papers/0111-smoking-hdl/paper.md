# Smoking history and HDL cholesterol in NHANES adults: a cross-sectional pipeline dogfood analysis

## Abstract

**Background:** Smoking exposure is associated with cardiometabolic risk profiles, and prior NHANES analyses have examined smoking and lipid concentrations [3]. The Agenteer research pipeline needs to handle continuous outcomes and exposure definitions that differ from blood-pressure threshold analyses.

**Objective:** To estimate the cross-sectional association between self-reported smoking history and HDL cholesterol among adults in a locally cached curated NHANES dataset.

**Methods:** This analysis merged demographics, smoking questionnaire, and lipid Parquet domains by `SEQN`. Adults aged 20 years or older with valid `SMQ020` responses, nonmissing HDL cholesterol (`LBDHDD`), covariates, survey design fields, and positive `WTMEC2YR` were included. Smoking history was defined as ever versus never having smoked at least 100 cigarettes. A weighted approximate linear regression estimated the mean HDL difference for ever smokers versus never smokers, adjusted for age, sex, and race/ethnicity indicators. `WTMEC2YR` was used as a normalized weight; full NHANES strata/PSU variance estimation was not implemented [2].

**Results:** The merged adult file with valid smoking codes contained 30,169 participants; 20,334 complete-case participants were eligible. Ever smoking was associated with an adjusted HDL difference of -0.93 mg/dL (95% CI -1.56 to -0.29; p=0.00407). Weighted mean HDL was 54.8 mg/dL among never smokers and 52.7 mg/dL among ever smokers.

**Conclusions:** In this exploratory NHANES pipeline analysis, ever-smoking history was associated with lower HDL cholesterol under an approximate weighted model. This is observational association evidence only; current smoking intensity, cotinine verification, fasting status, and full complex survey variance were not implemented.

## Introduction

Smoking is a major cardiovascular risk factor and has been studied in relation to lipid and lipoprotein concentrations in NHANES [3]. This paper deliberately differs from the prior vitamin-D/blood-pressure pipeline paper by using a questionnaire exposure and a continuous laboratory outcome.

Transparent observational reporting requires clear sample construction, exposure and outcome definitions, missingness handling, and limitations [1]. NHANES analyses also require care with survey weights and design variables [2].

## Methods

### Data Source

The analysis used the local MedBrevia curated NHANES Parquet cache `nhanes-v1-20260430`. The domains were `demographics.parquet`, `smoking.parquet`, and `lipids.parquet`. No MedBrevia files were modified.

### Study Population

Domains were inner-merged by `SEQN`. Adults were defined as participants aged 20 years or older. Valid smoking codes were `SMQ020` values 1 or 2. Complete cases required nonmissing age, sex, race/ethnicity, survey weight, strata, PSU, smoking exposure, and HDL cholesterol.

### Exposure and Outcome

The exposure was self-reported smoking history: ever smoked at least 100 cigarettes versus never. The primary endpoint was HDL cholesterol (`LBDHDD`, mg/dL). Triglycerides were not selected because the available table summary showed high missingness and likely fasting/subsample-specific handling needs.

### Statistical Analysis

Weighted approximate linear regression estimated the adjusted mean HDL difference for ever smokers versus never smokers. Covariates were age, sex, and race/ethnicity indicators. `WTMEC2YR` was used as a normalized analytic weight, but full NHANES complex survey variance was not implemented.

## Results

### Sample Construction

| Step | Rows |
| --- | ---: |
| Inner merged rows | 37,082 |
| Adult rows with valid smoking codes | 30,169 |
| Complete-case eligible rows | 20,334 |

### Descriptive Results

| Smoking history group | N | Weighted mean HDL (mg/dL) | Weighted mean total cholesterol (mg/dL) |
| --- | ---: | ---: | ---: |
| Never smoked 100 cigarettes | 11,656 | 54.8 | 190.8 |
| Ever smoked 100 cigarettes | 8,678 | 52.7 | 192.6 |

### Adjusted Association

Ever smoking was associated with an adjusted HDL difference of **-0.93 mg/dL** (95% CI **-1.56 to -0.29**, p=0.00407) compared with never smoking.

## Discussion

This exploratory analysis found lower HDL cholesterol among adults who reported ever smoking at least 100 cigarettes. The result is directionally compatible with prior smoking/lipid literature, but the exposure definition is coarse and does not distinguish former from current smoking or smoking intensity.

The pipeline learned a concrete design lesson: endpoint selection matters. Triglycerides looked attractive as a lipid endpoint but were deferred because the local table summary showed high missingness and probable fasting/subsample complexity. The paper therefore uses HDL cholesterol as a cleaner continuous outcome while recording the rejected endpoint.

## Limitations

This is a cross-sectional observational analysis and cannot establish temporality or causality. Smoking exposure was self-reported and coarse; it was not cotinine-verified. The model used approximate weights only and did not implement full NHANES strata/PSU variance [2]. Complete-case analysis may induce selection bias, and missing data should be transparently reported in observational studies [4]. Important confounders such as BMI, alcohol use, medications, diet, physical activity, and current smoking intensity were not included.

## Reproducibility

Artifacts are saved in `/Users/saleh/TechProjects/agenteer/.loop-memory/actual-nhanes/papers/0111-smoking-hdl/`. Inputs were read from the local MedBrevia curated NHANES cache. The companion `analysis.json` records row counts, model specification, estimates, discarded endpoint rationale, and source URLs.

## References

[1] STROBE Statement. https://www.strobe-statement.org/

[2] CDC/NCHS NHANES Analytic Guidelines. https://wwwn.cdc.gov/nchs/nhanes/AnalyticGuidelines.aspx

[3] Associations between smoking and lipid/lipoprotein concentrations among US adults aged >=20 years. https://journals.sagepub.com/doi/abs/10.1177/1849454418779310

[4] TARMOS missing-data reporting framework. https://arxiv.org/abs/2004.14066
