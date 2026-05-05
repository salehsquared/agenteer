# Body mass index and elevated HbA1c threshold in NHANES adults

## Abstract

This spec-governed NHANES analysis evaluated Among NHANES adults aged 20 years and older, is body mass index associated with elevated HbA1c threshold status. The AnalysisSpec existed before execution, and the analytic sample included 24,836 complete-case eligible adults or participants after applying the declared population filters. A weighted logistic regression with WTMEC2YR survey weights and strata/PSU linearized sandwich variance estimated an adjusted odds ratio of 1.10 per one-unit higher BMXBMI (95% CI 1.09 to 1.11; p=9.36e-93). This is an observational cross-sectional association and cannot infer causality.

## Introduction

NHANES analyses need explicit handling of survey weights, strata, PSU, missingness, and cross-sectional interpretation. This paper is generated from a pre-run AnalysisSpec to test whether Agenteer can move from a design contract to a reproducible, inspectable public-health paper without retrospective provenance.

## Methods

The pre-run AnalysisSpec was read from analysis-spec.json. Agenteer loaded local cached NHANES files under the declared data root, selected files containing the required variables, merged them by SEQN, applied the declared population filters, and required complete cases for LBXGH, BMXBMI, WTMEC2YR, SDMVSTRA, SDMVPSU, and covariates. The complete-case analytic sample was 24,836 from 49,681 eligible merged rows. Missingness among eligible rows included BMXBMI: 4.3%, LBXGH: 29.8%, and WTMEC2YR: 27.7%.

The primary model was weighted logistic regression with covariate adjustment for RIDAGEYR, RIAGENDR, RIDRETH1. Unlike earlier approximate papers, this runner used a design-aware strata/PSU linearized sandwich variance estimator with 59 strata and 121 PSU clusters contributing to variance estimation.

## Results

The adjusted odds ratio 1.10 per one-unit higher BMXBMI had a 95% CI of 1.09 to 1.11 (p=9.36e-93). Weighted descriptive quartiles of BMXBMI showed outcome means or event fractions of 0.02, 0.05, 0.09, and 0.16. These descriptive summaries support inspection of the model direction but do not establish a causal gradient.

## Discussion

The generated paper demonstrates a complete AnalysisSpec-to-paper path with design-aware variance evidence. The association is still observational and cross-sectional, so the result should be interpreted as a population-survey association conditional on the variables included in the specification, not as evidence that the exposure caused the outcome.

## Limitations

This analysis cannot establish temporality or causality. Complete-case analysis may introduce selection bias. The current survey-aware runner implements linearized variance for primary weighted linear and logistic models only; subsample-specific eligibility, domain analysis, and multi-cycle weight construction still need explicit runner support before they should be presented as fully automated.

## Reproducibility

Agenteer generated this paper through research paper-run from a pre-run AnalysisSpec. The packet includes analysis.json, paper.md, qa-cli.json, runner-record.json, task/evidence receipts, interop exports, and lifecycle.md. Input files and output files are hashed in runner provenance.

## References

- CDC NHANES analytic guidelines: https://wwwn.cdc.gov/nchs/nhanes/AnalyticGuidelines.aspx
- CDC NHANES weighting tutorial: https://wwwn.cdc.gov/nchs/nhanes/tutorials/weighting.aspx
- Workflow Run RO-Crate provenance: https://journals.plos.org/plosone/article?id=10.1371%2Fjournal.pone.0309210
