# Albuminuria and measured hypertension in NHANES adults: a cross-sectional pipeline dogfood analysis

## Abstract

**Background:** Urine albumin-to-creatinine ratio (UACR) is a kidney damage marker, and prior NHANES work has examined UACR and hypertension [3]. This paper tests whether the pipeline can handle kidney threshold logic and single-measure diagnostic caveats.

**Objective:** To estimate the cross-sectional association between albuminuria category and measured hypertension among adults in a locally cached curated NHANES dataset.

**Methods:** Demographics, kidney, and blood pressure Parquet domains were merged by `SEQN`. Adults aged 18 years or older with nonmissing UACR (`URDACT`), first systolic and diastolic blood pressure readings, covariates, survey design fields, and positive `WTMEC2YR` were included. Albuminuria was operationalized as UACR >=30 mg/g, a threshold consistent with moderately increased albuminuria category language [1,2]. Measured hypertension was operationalized as `BPXSY1 >= 130` or `BPXDI1 >= 80`. A weighted approximate logistic GLM estimated the association of albuminuria category with measured hypertension, adjusted for age, sex, and race/ethnicity indicators.

**Results:** The merged adult file contained 31,772 adults; 20,461 complete-case participants were eligible. Albuminuria was associated with higher odds of measured hypertension (OR 1.83, 95% CI 1.66 to 2.03; p=2.56e-31). Weighted measured hypertension prevalence was 36.0% in the UACR <30 mg/g group and 57.8% in the UACR >=30 mg/g group.

**Conclusions:** Albuminuria category was associated with measured hypertension in this exploratory pipeline analysis. This is not evidence of causality, chronic kidney disease diagnosis, or clinical hypertension diagnosis because the analysis is cross-sectional and uses single-visit measures.

## Introduction

UACR corrects urine albumin for urine concentration and is used clinically to characterize albuminuria [1,2]. NHANES contains urine and blood pressure measures suitable for cross-sectional population analysis, but interpretation requires caution because single measurements do not establish persistent disease.

This paper is the third NHANES pipeline dogfood paper. It deliberately differs from the prior vitamin-D/BP and smoking/HDL papers by requiring kidney threshold logic and diagnostic caveat handling.

## Methods

### Data Source

The analysis used the local MedBrevia curated NHANES Parquet cache `nhanes-v1-20260430`. Domains were `demographics.parquet`, `kidney.parquet`, and `blood_pressure.parquet`. No MedBrevia files were modified.

### Study Population

Domains were inner-merged by `SEQN`. Adults aged 18 years or older were included if they had nonmissing UACR, first systolic and diastolic blood pressure readings, age, sex, race/ethnicity, survey design variables, and positive `WTMEC2YR`.

### Exposure and Outcome

The exposure was albuminuria category, defined as `URDACT >= 30 mg/g`. The endpoint was measured hypertension by first blood pressure reading threshold, `BPXSY1 >= 130` or `BPXDI1 >= 80`.

### Statistical Analysis

A weighted approximate logistic GLM estimated measured hypertension odds for UACR >=30 mg/g versus <30 mg/g, adjusting for age, sex, and race/ethnicity indicators. `WTMEC2YR` was used as a normalized frequency weight; full NHANES complex survey variance using strata and PSU was not implemented [4].

## Results

### Sample Construction

| Step | Rows |
| --- | ---: |
| Inner merged rows | 44,312 |
| Adult merged rows | 31,772 |
| Complete-case eligible rows | 20,461 |

### Descriptive Results

| UACR group | N | Weighted measured hypertension prevalence | Median UACR (mg/g) |
| --- | ---: | ---: | ---: |
| UACR <30 mg/g | 17,930 | 36.0% | 6.5 |
| UACR >=30 mg/g | 2,531 | 57.8% | 72.7 |

### Adjusted Association

Albuminuria was associated with higher odds of measured hypertension: **OR 1.83** (95% CI **1.66 to 2.03**, p=2.56e-31).

## Discussion

This exploratory analysis found a positive association between albuminuria category and measured hypertension. The result is consistent with the broader idea that kidney damage markers and blood pressure are related, but the direction of association cannot be established in a cross-sectional dataset.

The pipeline stress test was valuable because it forced paper generation to handle a clinical threshold that is easy to overstate. UACR >=30 mg/g should be described as an albuminuria category in this artifact, not as proof of persistent chronic kidney disease.

## Limitations

This is a cross-sectional observational analysis. It cannot establish temporality or causality. A single UACR measure cannot diagnose persistent albuminuria or chronic kidney disease. A single blood pressure exam threshold is not a clinical hypertension diagnosis. The model uses approximate weights and does not implement full NHANES complex survey variance. Complete-case analysis may induce selection bias, and medication use, diabetes, BMI, kidney function, and socioeconomic covariates were not included.

## Reproducibility

Artifacts are saved in `/Users/saleh/TechProjects/agenteer/.loop-memory/actual-nhanes/papers/0113-uacr-hypertension/`. Inputs were read from the local MedBrevia curated NHANES cache. The companion `analysis.json` records row counts, thresholds, model specification, estimates, limitations, and source URLs.

## References

[1] National Kidney Foundation. ACR. https://www.kidney.org/kidney-health/kidneydisease/siemens_hcp_acr

[2] National Kidney Foundation. How to Classify CKD. https://www.kidney.org/professionals/explore-your-knowledge/how-to-classify-ckd

[3] Association between urinary albumin-to-creatinine ratio within normal range and hypertension among adults in the United States: NHANES 2009-2018. https://pubmed.ncbi.nlm.nih.gov/37016928/

[4] CDC/NCHS NHANES Analytic Guidelines. https://wwwn.cdc.gov/nchs/nhanes/AnalyticGuidelines.aspx
