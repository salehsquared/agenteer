# Among NHANES adults aged 20 years and older, is family poverty-income ratio associated with HDL cholesterol in an exploratory cross-sectional analysis

## Abstract

This spec-governed NHANES analysis evaluated Among NHANES adults aged 20 years and older, is family poverty-income ratio associated with HDL cholesterol in an exploratory cross-sectional analysis. The AnalysisSpec existed before execution, and the analytic sample included 25,967 complete-case eligible adults or participants after applying the declared population filters. A weighted linear regression with WTMEC2YR survey weights and strata/PSU linearized sandwich variance estimated an adjusted mean difference of 1.27 outcome units per one-unit higher INDFMPIR (95% CI 1.08 to 1.45; p=3.24e-39). This is an observational cross-sectional association and cannot infer causality.

## Introduction

NHANES analyses need explicit handling of survey weights, strata, PSU, missingness, and cross-sectional interpretation. This paper is generated from a pre-run AnalysisSpec to test whether Agenteer can move from a design contract to a reproducible, inspectable public-health paper without retrospective provenance.

## Methods

The pre-run AnalysisSpec was read from analysis-spec.json. Agenteer loaded local cached NHANES files under the declared data root, selected files containing the required variables, merged them by SEQN, applied the declared population filters, and required complete cases for LBDHDD, INDFMPIR, WTMEC2YR, SDMVSTRA, SDMVPSU, and covariates. The complete-case analytic sample was 25,967 from 43,766 eligible merged rows. Missingness among eligible rows included INDFMPIR: 10.5%, LBDHDD: 9.9%, and WTMEC2YR: 27.9%.

The primary model was weighted linear regression with covariate adjustment for RIDAGEYR, RIAGENDR, RIDRETH1. Unlike earlier approximate papers, this runner used a design-aware strata/PSU linearized sandwich variance estimator with 59 strata and 121 PSU clusters contributing to variance estimation.

## Results

The adjusted mean difference was 1.27 outcome units per one-unit higher INDFMPIR (95% CI 1.08 to 1.45; p=3.24e-39). Weighted descriptive quartiles of INDFMPIR showed outcome means of 51.50, 51.74, 53.05, and 56.15. These descriptive summaries support inspection of the model direction but do not establish a causal gradient.

## Discussion

The generated paper demonstrates a complete AnalysisSpec-to-paper path with design-aware variance evidence. The association is still observational and cross-sectional, so the result should be interpreted as a population-survey association conditional on the variables included in the specification, not as evidence that the exposure caused the outcome.

## Limitations

This analysis cannot establish temporality or causality. Complete-case analysis may introduce selection bias. The current survey-aware runner implements linearized variance for the primary weighted linear model only; binary endpoints and more complex estimands still need explicit runner support before they should be presented with design-corrected inference.

## Reproducibility

Agenteer generated this paper through research paper-run from a pre-run AnalysisSpec. The packet includes analysis.json, paper.md, qa-cli.json, runner-record.json, task/evidence receipts, interop exports, and lifecycle.md. Input files and output files are hashed in runner provenance.

## References

- CDC NHANES analytic guidelines: https://wwwn.cdc.gov/nchs/nhanes/AnalyticGuidelines.aspx
- CDC NHANES weighting tutorial: https://wwwn.cdc.gov/nchs/nhanes/tutorials/weighting.aspx
- Workflow Run RO-Crate provenance: https://journals.plos.org/plosone/article?id=10.1371%2Fjournal.pone.0309210
