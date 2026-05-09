# Propensity Score Matching Analysis

## Summary

This local observational analysis evaluated whether treated differed in the outcome after balancing measured baseline covariates. It is intended for causal-design review, not as proof of a treatment effect.

Main finding: the ATT contrast estimated risk difference and odds ratio of 0.1091 in 110 treated and 110 control records used by the adjusted analysis.

## Research Question

Does protocolized co-management relate to ICU mortality with sex and site exact matching?

## Methods

The treatment or exposure was treated. The propensity model used the following measured baseline covariates: age, bmi, severity, frailty, sex, site, diabetes.
Matching also required exact agreement on: sex, site.
The analysis used nearest-neighbor propensity score matching. Matching diagnostics recorded 110 matched treated records, 110 matched controls, and 186 unmatched treated records.
Complete-case retention for treatment, outcome, and propensity covariates was 1.

## Results

- Estimated contrast: 0.1091.
- Odds ratio: 1.558 (0.9124, 2.661).
- Risk difference: 0.1091.
- Maximum absolute standardized mean difference before adjustment: 0.5249.
- Maximum absolute standardized mean difference after adjustment: 0.1381.
- Covariate terms above absolute SMD 0.10 after adjustment: 2.
- Common-support fraction: 0.9333.

## Interpretation

The balance diagnostics describe measured baseline covariate balance after matching or weighting. They do not remove unmeasured confounding, guarantee correct treatment timing, or establish causality without a reviewed target-trial design, exchangeability argument, positivity review, and sensitivity analysis.

## Limitations

This analysis uses complete cases and only the measured covariates supplied to the propensity model. Covariates measured after treatment, unmeasured confounding, poor overlap, missingness, and model misspecification can bias the contrast. P-values and intervals from this standard route should be reviewed as local model-based summaries, not definitive causal uncertainty.

## Reproducibility Note

The companion files include propensity scores, overlap bins, balance diagnostics, matched pairs or weights, run metadata, quality checks, and file hashes.
