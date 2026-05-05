# Family poverty-income ratio and HDL cholesterol in NHANES adults

## Abstract

This exploratory cross-sectional NHANES analysis examined whether family poverty-income ratio was associated with HDL cholesterol among adults aged 20 years and older. The analytic sample included 18,394 complete-case adults after merging demographics and lipids tables. Using WTMEC2YR normalized approximate weights and covariate adjustment for age, sex, and race/ethnicity, each 1-unit higher poverty-income ratio was associated with a 1.42 mg/dL HDL cholesterol mean difference (approximate 95% CI 1.28 to 1.56; approximate p=2.16e-87). This is exploratory associational evidence only because full NHANES complex survey variance with strata and PSU was not implemented.

## Introduction

HDL cholesterol is commonly analyzed in public-health surveillance as one component of cardiometabolic risk profiles. Family poverty-income ratio captures household economic context relative to poverty thresholds. NHANES provides measured lipids, demographic covariates, survey weights, strata, and PSU variables, making it a useful stress test for a reproducible research pipeline that must explicitly handle survey design and cross-sectional limits.

## Methods

The pre-run AnalysisSpec for this paper was written before execution at `analysis-spec.json`. I merged local cached MedBrevia-curated NHANES demographics and lipids Parquet by SEQN, restricted to adults aged 20 years and older, and required non-missing INDFMPIR, LBDHDD, WTMEC2YR, SDMVSTRA, SDMVPSU, RIDAGEYR, RIAGENDR, and RIDRETH1. The complete-case analytic sample was 18,394 adults from 30,190 merged adults. Missingness among merged adults was 11.1% for INDFMPIR, 6.4% for LBDHDD, and 28.3% for WTMEC2YR.

The primary model was an approximate weighted linear regression of HDL cholesterol on continuous poverty-income ratio, age per 10 years, sex, and race/ethnicity indicators. WTMEC2YR was normalized and used as an approximate frequency weight. The analysis retained SDMVSTRA and SDMVPSU in evidence records and paper text, but did not implement full NHANES complex survey variance; therefore all confidence intervals and p-values are approximate exploratory quantities.

## Results

In the primary model, each 1-unit higher family poverty-income ratio was associated with a 1.42 mg/dL higher mean HDL cholesterol difference (approximate 95% CI 1.28 to 1.56; approximate p=2.16e-87). Poverty-income category summaries showed weighted mean HDL cholesterol of 51.1 mg/dL for PIR <=1.0, 51.9 mg/dL for PIR 1.01-2.0, 53.2 mg/dL for PIR 2.01-4.0, and 56.6 mg/dL for PIR >4.0. These summaries are descriptive and should not be interpreted as causal gradients.

## Discussion

The analysis found an exploratory association between higher family poverty-income ratio and higher HDL cholesterol among complete-case NHANES adults. The result is compatible with socioeconomic patterning of cardiometabolic measures, but this artifact is not evidence that income caused HDL differences. The study is cross-sectional, uses complete-case inclusion, and applies only approximate model variance.

## Limitations

This study cannot establish temporality or causality. Full NHANES complex survey variance using strata and PSU was not implemented, so p-values and confidence intervals are approximate only. Complete-case analysis may induce selection bias, especially because poverty-income ratio had non-trivial missingness. Family poverty-income ratio is a household economic measure and does not directly measure material hardship, diet, medication use, or access to care.

## Reproducibility

The analysis used local cached Parquet files from the read-only MedBrevia NHANES cache under `nhanes-v1-20260430`. Inputs were demographics and lipids, merged by SEQN. The pre-run AnalysisSpec was `analysis-spec.json`; companion evidence is `analysis.json`; deterministic paper QA output is `qa-cli.json`; runner provenance is `runner-record.json`.

## References

- CDC NHANES analytic guidelines: https://wwwn.cdc.gov/nchs/nhanes/AnalyticGuidelines.aspx
- CDC NHANES weighting tutorial: https://wwwn.cdc.gov/nchs/nhanes/tutorials/weighting.aspx
- NHANES demographics documentation example: https://wwwn.cdc.gov/Nchs/Data/Nhanes/Public/1999/DataFiles/DEMO.htm
