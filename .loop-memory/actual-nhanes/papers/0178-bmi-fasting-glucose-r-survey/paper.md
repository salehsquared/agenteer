# BMI and fasting glucose in the NHANES fasting subsample

## Local Review Safety Header

- Analysis type: observational cross-sectional association.
- Survey method: R survey-weighted linear regression with WTSAF2YR weights, SDMVSTRA strata, SDMVPSU PSU, and R survey Taylor linearized variance.
- Weight domain: Morning fasting laboratory subsample (subsample analytic population).
- Population: 11,918 complete-case eligible participants after AnalysisSpec filters.
- Causal status: not causal; this cannot infer causality or temporality.
- Clinical actionability: not clinically actionable and not a diagnostic rule.
- Human review: required before sharing, publication, clinical interpretation, or product integration.


## Abstract

This spec-governed NHANES analysis evaluated Among NHANES adults in the morning fasting laboratory subsample, what is the adjusted association between body mass index and fasting plasma glucose. The AnalysisSpec existed before execution, and the analytic sample included 11,918 complete-case eligible adults or participants after applying the declared population filters. A R survey-weighted linear regression with WTSAF2YR survey weights and R survey Taylor linearized variance estimated an adjusted mean difference of 0.84 outcome units per one-unit higher BMXBMI (95% CI 0.73 to 0.95; p=3.23e-21). The selected weight domain was Morning fasting laboratory subsample; the AnalysisSpec rationale was: LBXGLU fasting plasma glucose is measured in the morning fasting laboratory subsample, so WTSAF2YR is the least-common-denominator NHANES weight for this AnalysisSpec. Eligibility note: Interpret estimates for fasting subsample-eligible adults with nonmissing fasting glucose, BMI, covariates, strata, PSU, and positive WTSAF2YR. This is an observational cross-sectional association and cannot infer causality.

## Introduction

NHANES analyses need explicit handling of survey weights, strata, PSU, missingness, and cross-sectional interpretation. This paper is generated from a pre-run AnalysisSpec to test whether Agenteer can move from a design contract to a reproducible, inspectable public-health paper without retrospective provenance. Backend used: r-survey.

## Methods

The pre-run AnalysisSpec was read from analysis-spec.json. Agenteer loaded local cached NHANES files under the declared data root, selected files containing the required variables, merged them by SEQN, applied the declared population filters, and required complete cases for LBXGLU, BMXBMI, WTSAF2YR, SDMVSTRA, SDMVPSU, and covariates. The complete-case analytic sample was 11,918 from 49,681 eligible merged rows. Missingness among eligible rows included BMXBMI: 4.3%, LBXGLU: 66.2%, and WTSAF2YR: 74.2%. Weight-domain clearance: Morning fasting laboratory subsample; rationale: LBXGLU fasting plasma glucose is measured in the morning fasting laboratory subsample, so WTSAF2YR is the least-common-denominator NHANES weight for this AnalysisSpec.; eligibility: Interpret estimates for fasting subsample-eligible adults with nonmissing fasting glucose, BMI, covariates, strata, PSU, and positive WTSAF2YR..

The primary model was R survey-weighted linear regression with covariate adjustment for RIDAGEYR, RIAGENDR, RIDRETH1. Unlike earlier approximate papers, this runner used R survey Taylor linearized variance with 59 strata and 3 PSU clusters contributing to variance estimation.

## Results

The adjusted mean difference 0.84 per one-unit higher BMXBMI had a 95% CI of 0.73 to 0.95 (p=3.23e-21). Weighted descriptive quartiles of BMXBMI showed outcome means or event fractions of 96.95, 102.41, 108.26, and 115.34. These descriptive summaries support inspection of the model direction but do not establish a causal gradient.

## Discussion

The generated paper demonstrates a complete AnalysisSpec-to-paper path with design-aware variance evidence. The association is still observational and cross-sectional, so the result should be interpreted as a population-survey association conditional on the variables included in the specification, not as evidence that the exposure caused the outcome.

## Limitations

This analysis cannot establish temporality or causality. Complete-case analysis may introduce selection bias. The current survey-aware runner implements primary weighted linear and logistic models only. Subsample-weight analyses apply to the declared eligible subgroup rather than all examined participants, and domain analysis, replicate weights, plus multi-cycle weight construction still need explicit runner support before they should be presented as fully automated.

## Reproducibility

Agenteer generated this paper through research paper-run from a pre-run AnalysisSpec using backend r-survey. The packet includes analysis.json, paper.md, qa-cli.json, runner-record.json, task/evidence receipts, interop exports, and lifecycle.md. Input files and output files are hashed in runner provenance.

## References

- CDC NHANES analytic guidelines: https://wwwn.cdc.gov/nchs/nhanes/AnalyticGuidelines.aspx
- CDC NHANES weighting tutorial: https://wwwn.cdc.gov/nchs/nhanes/tutorials/weighting.aspx
- R survey package: https://r-survey.r-forge.r-project.org/survey/index.html
