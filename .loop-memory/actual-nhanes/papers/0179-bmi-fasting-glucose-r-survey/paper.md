# BMI and fasting glucose in the NHANES fasting subsample

## Study Summary

- Analysis type: observational cross-sectional association.
- Survey method: R survey-weighted linear regression with fasting subsample survey weight (WTSAF2YR), survey strata, survey primary sampling units, and R survey Taylor linearized variance.
- Weight domain: Morning fasting laboratory subsample (subsample analytic population).
- Population: 11,918 complete-case eligible participants after applying the stated eligibility criteria.
- Causal status: not causal; this cannot infer causality or temporality.
- Clinical actionability: not clinically actionable and not a diagnostic rule.
- Human review: required before sharing, publication, clinical interpretation, or product integration.


## Abstract

Main finding: higher body mass index was associated with higher fasting plasma glucose in the analyzed NHANES sample.

This NHANES analysis evaluated the adjusted association between body mass index (BMXBMI) and fasting plasma glucose (LBXGLU) in the stated study population. The analysis followed a pre-specified plan, and the analytic sample included 11,918 complete-case eligible participants after applying the stated population filters. A R survey-weighted linear regression with fasting subsample survey weight (WTSAF2YR) and R survey Taylor linearized variance estimated an adjusted mean difference of 0.84 mg/dL per one-unit higher body mass index (95% CI 0.73 to 0.95; p=3.23e-21). The selected weight domain was Morning fasting laboratory subsample because LBXGLU fasting plasma glucose is measured in the morning fasting laboratory subsample, so WTSAF2YR is the least-common-denominator NHANES weight for this analysis. This means results apply to fasting subsample-eligible adults with nonmissing fasting glucose, BMI, covariates, strata, PSU, and positive WTSAF2YR. This is an observational cross-sectional association and cannot infer causality.

## Introduction

NHANES analyses need explicit handling of survey weights, strata, primary sampling units, missingness, and cross-sectional interpretation. This report evaluates the adjusted association between body mass index and fasting plasma glucose in a reproducible public-health analysis using a pre-specified plan. The statistical backend was r-survey.

## Methods

The analysis plan was read before execution. Local cached NHANES component files were loaded from the declared data directory, files containing the required variables were selected, records were merged by participant identifier, population filters were applied, and complete cases were required for fasting plasma glucose, body mass index, fasting subsample survey weight (WTSAF2YR), survey strata, survey primary sampling units, and covariates. The complete-case analytic sample was 11,918 from 49,681 eligible merged rows. Missingness among eligible rows included body mass index: 4.3%, fasting plasma glucose: 66.2%, and fasting subsample survey weight: 74.2%. The weight domain was Morning fasting laboratory subsample because LBXGLU fasting plasma glucose is measured in the morning fasting laboratory subsample, so WTSAF2YR is the least-common-denominator NHANES weight for this analysis. Results apply to fasting subsample-eligible adults with nonmissing fasting glucose, BMI, covariates, strata, PSU, and positive WTSAF2YR.

The primary model was R survey-weighted linear regression with covariate adjustment for age, sex, race and ethnicity. Unlike earlier approximate papers, this analysis used R survey Taylor linearized variance with 59 strata and 3 primary sampling unit clusters contributing to variance estimation.

## Results

The adjusted mean difference 0.84 per one-unit higher body mass index had a 95% CI of 0.73 to 0.95 (p=3.23e-21). Weighted descriptive quartiles of body mass index showed fasting plasma glucose means or event fractions of 96.95, 102.41, 108.26, and 115.34. These descriptive summaries support inspection of the model direction but do not establish a causal gradient.

## Discussion

In this cross-sectional survey analysis, body mass index was associated with fasting plasma glucose after the stated covariate adjustment. The result should be interpreted as a population-survey association conditional on the variables included in the model, not as evidence that the exposure caused the outcome.

## Limitations

This analysis cannot establish temporality or causality. Complete-case analysis may introduce selection bias. The current survey-aware runner implements primary weighted linear and logistic models only. Subsample-weight analyses apply to the declared eligible subgroup rather than all examined participants, and domain analysis, replicate weights, plus multi-cycle weight construction still need explicit runner support before they should be presented as fully automated.

## Reproducibility

The companion packet includes the analysis results, quality checks, run metadata, and file hashes needed to audit or rerun the analysis. Input files and output files are hashed in the companion metadata.

## References

- CDC NHANES analytic guidelines: https://wwwn.cdc.gov/nchs/nhanes/AnalyticGuidelines.aspx
- CDC NHANES weighting tutorial: https://wwwn.cdc.gov/nchs/nhanes/tutorials/weighting.aspx
- R survey package: https://r-survey.r-forge.r-project.org/survey/index.html
