# Body mass index and HbA1c in NHANES adults

## Abstract

This observational cross-sectional NHANES analysis evaluated whether adult body mass index (BMI) was associated with HbA1c in locally cached curated NHANES Parquet data. Among 20,366 complete-case eligible adult rows, each 5 kg/m2 higher BMI was associated with an adjusted mean difference of 0.143 HbA1c percentage points (95% CI 0.135 to 0.152; approximate p=2.665e-223) in a weighted approximate linear regression. A threshold sensitivity model for single-measure HbA1c >=6.5% estimated an odds ratio of 1.606 per 5 kg/m2 (95% CI 1.553 to 1.660; approximate p=2.058e-168). These are exploratory associations and cannot establish causality.

## Introduction

BMI is widely used as an adult weight-status screening measure, with CDC categories defining overweight and obesity ranges for adults. HbA1c summarizes recent glycemia, but an isolated elevated value in this analysis should be read as a threshold-defined survey measurement rather than a clinical diagnosis. This paper dogfoods the Agenteer research pipeline by asking whether an anthropometric exposure can be analyzed against a laboratory glycemia endpoint using reproducible packet artifacts.

## Methods

We merged curated NHANES demographics, anthropometrics, and diabetes laboratory domains by SEQN from the local MedBrevia cache. The study population was adults aged 20 years or older with nonmissing BMXBMI, LBXGH, WTMEC2YR, sex, race/ethnicity, and age values. We used WTMEC2YR survey weight language and retained strata and PSU fields as required survey-design metadata, but the model used normalized approximate frequency weights rather than full complex survey strata and PSU variance estimation.

The primary model was a weighted approximate linear regression of HbA1c percent on BMI per 5 kg/m2, adjusting for age, sex, and race/ethnicity. A sensitivity weighted approximate logistic GLM evaluated single-measure HbA1c >=6.5%. The model was adjusted for age, sex, and race/ethnicity covariates. Inference language is approximate because full NHANES complex survey variance was not implemented.

## Results

The merged adult dataset contained 30,190 rows, of which 20,366 were complete-case eligible rows. Missingness in the adult merged dataset was 1.6% for BMI, 4.9% for HbA1c, and 28.3% for MEC weights. There were 2,585 complete-case rows meeting the HbA1c >=6.5% threshold.

Each 5 kg/m2 higher BMI was associated with an adjusted mean difference of 0.143 HbA1c percentage points (95% CI 0.135 to 0.152; approximate p=2.665e-223). In the threshold sensitivity model, the adjusted odds ratio for HbA1c >=6.5% was 1.606 (95% CI 1.553 to 1.660; approximate p=2.058e-168) per 5 kg/m2 higher BMI.

## Discussion

In this complete-case exploratory analysis, higher BMI was associated with higher HbA1c levels after approximate weighting and covariate adjustment. The direction is plausible for a metabolic-risk study, but this cross-sectional observational design cannot infer causality or temporality. This is not evidence that BMI caused the HbA1c difference, and it does not estimate an intervention effect.

## Limitations

Missing data and complete-case handling may bias results. BMI is a screening measure and does not directly measure body composition or adiposity distribution. A single HbA1c threshold measurement is not a clinical diabetes diagnosis; NIDDK notes that repeat testing may be needed to confirm diagnosis. Approximate variance was used without full complex survey strata and PSU estimation, so confidence intervals and p-values should be treated as exploratory. The analysis did not adjust for medication use, diabetes duration, pregnancy, anemia, or other clinical factors that may affect HbA1c.

## Reproducibility

The companion `analysis.json` stores row counts, missingness, model coefficients, confidence intervals, p-values, survey-weight metadata, limitations, and source URLs. The companion runner record hashes inputs and generated outputs. The pipeline QA was run with `agenteer research paper-qa`.

## References

- CDC. Adult BMI Categories. https://www.cdc.gov/bmi/adult-calculator/bmi-categories.html
- NIDDK. The A1C Test & Diabetes. https://www.niddk.nih.gov/health-information/diagnostic-tests/a1c-test
- CDC/NCHS. NHANES Survey Methods and Analytic Guidelines. https://wwwn.cdc.gov/nchs/nhanes/AnalyticGuidelines.aspx
