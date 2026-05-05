# Health insurance coverage and HbA1c in NHANES adults

## Abstract

**Background:** Health insurance is a marker of health-care access, but cross-sectional survey data cannot by itself prove care quality or causal access effects. This dogfood study tested whether Agenteer's research pipeline can generate a social-determinant NHANES paper with explicit measurement and interpretation constraints.

**Methods:** Demographics, insurance/access, and diabetes Parquet domains were merged by `SEQN`. The study population was all adults aged 18 years or older with valid `HIQ011` insurance coverage response, nonmissing HbA1c (`LBXGH`), covariates, and positive `WTMEC2YR`. Uninsured status was defined as `HIQ011 == 2` versus insured `HIQ011 == 1`; refused, don't-know, and missing responses were excluded. A weighted approximate linear regression estimated adjusted mean HbA1c difference for uninsured versus insured adults, adjusting for age, sex, and race/ethnicity indicators. A secondary threshold sensitivity used `LBXGH >= 6.5%`, citing diabetes-threshold references but treating the single NHANES lab value as threshold-defined elevated A1c, not a clinical diagnosis [1,2]. `WTMEC2YR` was used as a normalized frequency weight; full NHANES strata/PSU variance estimation was not implemented [3].

**Results:** The merged adult file contained 33,518 adults; 21,653 complete-case participants were eligible. Uninsured adults had an adjusted mean HbA1c difference of **0.05 percentage points** compared with insured adults (95% CI **0.02 to 0.08**, p=0.0047). In the threshold sensitivity, uninsured adults had an odds ratio of **1.02** for A1c >=6.5% (95% CI **0.88 to 1.19**, p=0.775). Weighted mean HbA1c was 5.65% among insured adults and 5.61% among uninsured adults.

**Conclusions:** In this exploratory NHANES pipeline analysis, uninsured adults had higher HbA1c on average than insured adults under an approximate weighted model. The result is descriptive and cross-sectional; it should not be interpreted as insurance causing glycemic differences or as proof of diabetes-care quality.

## Introduction

Health insurance coverage can shape access to clinical care, laboratory monitoring, medication affordability, and preventive services, but population survey associations require careful interpretation. Recent NHANES work has examined insurance status and HbA1c control among adults with type 2 diabetes [4]. This pipeline test deliberately uses all adults rather than a diagnosed-diabetes-only cohort, so the endpoint is HbA1c level in the adult population, not diabetes control among patients.

## Methods

The analysis used local cached MedBrevia-curated NHANES Parquet files from `nhanes-v1-20260430`. Demographics supplied age, sex, race/ethnicity, survey design fields, and `WTMEC2YR`; insurance/access supplied `HIQ011`; diabetes supplied `LBXGH` and `DIQ010`. Records were merged by `SEQN`.

Eligible participants were adults aged 18 years or older with valid insurance response (`HIQ011` 1 or 2), nonmissing HbA1c, nonmissing adjustment covariates, and positive `WTMEC2YR`. The main endpoint was continuous HbA1c percent. A secondary threshold sensitivity used A1c >=6.5%, a diabetes-range threshold described by ADA and NIDDK references [1,2], but this single survey laboratory value was not treated as a clinical diabetes diagnosis.

A weighted approximate linear regression estimated the adjusted mean HbA1c difference for uninsured versus insured adults. Covariates were age, sex, and race/ethnicity indicators. `WTMEC2YR` was normalized and used as a frequency weight. Full NHANES complex survey variance with strata and PSU was not implemented, so confidence intervals are approximate.

## Results

### Sample construction

The merged adult file contained 33,518 adults. After excluding invalid insurance responses, missing HbA1c, missing covariates, and nonpositive weights, 21,653 complete-case participants remained: 17,428 insured and 4,225 uninsured.

### Group summary

| Insurance group | N | Weighted mean HbA1c (%) | Weighted A1c >=6.5% (%) | Weighted self-reported diabetes (%) |
|---|---:|---:|---:|---:|
| Insured | 17,428 | 5.65 | 9.3 | 11.1 |
| Uninsured | 4,225 | 5.61 | 6.8 | 6.1 |

### Adjusted association

Uninsured adults had an adjusted mean HbA1c difference of **0.05 percentage points** compared with insured adults (95% CI **0.02 to 0.08**, p=0.0047). In the secondary threshold sensitivity, uninsured adults had higher odds of A1c >=6.5%: **OR 1.02** (95% CI **0.88 to 1.19**, p=0.775).

## Discussion

This exploratory analysis found higher average HbA1c among uninsured adults than insured adults. The result is consistent with health-access concerns, but it is not evidence that insurance status caused the difference. Insurance coverage is an imperfect self-reported access marker, and HbA1c can reflect many upstream factors including age, disease status, medication use, diet, comorbidity, and care patterns.

The all-adult design is intentionally broad. Because the cohort is not restricted to diagnosed diabetes, the main interpretation should be population HbA1c difference rather than diabetes-control quality. The A1c >=6.5% sensitivity analysis is a threshold-defined laboratory finding in this artifact and is not an NHANES clinical diagnosis.

## Limitations

This is a cross-sectional observational analysis and cannot establish temporality or causality. `HIQ011` is self-reported insurance coverage and does not measure plan generosity, continuity, medication coverage, clinician access, or adherence. A single HbA1c value at or above 6.5% should not be treated as a clinical diagnosis without appropriate clinical confirmation [1,2]. The model uses approximate weights and does not implement full NHANES complex survey variance. Complete-case analysis may induce selection bias, and important covariates such as BMI, medication use, income, duration of diabetes, and comorbidity were not included.

## Reproducibility

Artifacts are saved in `/Users/saleh/TechProjects/agenteer/.loop-memory/actual-nhanes/papers/0121-insurance-hba1c/`. The analysis used read-only local cached Parquet inputs from MedBrevia and wrote `analysis.json`, this paper, CLI QA output, and a critique. No GCP resources were used.

## References

1. ADA. Diabetes Diagnosis & Tests. https://diabetes.org/about-diabetes/diagnosis
2. NIDDK. Diabetes & Prediabetes Tests. https://www.niddk.nih.gov/health-information/professionals/clinical-tools-patient-management/diabetes/diabetes-prediabetes
3. CDC/NCHS. NHANES Analytic Guidelines. https://wwwn.cdc.gov/nchs/nhanes/AnalyticGuidelines.aspx
4. PubMed. Impact of Health Insurance Status on HbA1c Control Among United States Adults With Type 2 Diabetes. https://pubmed.ncbi.nlm.nih.gov/41040761/
