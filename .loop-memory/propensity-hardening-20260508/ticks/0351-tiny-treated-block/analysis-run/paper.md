# Propensity Score Matching Analysis

## Summary

This local observational analysis evaluated whether treated differed in the outcome after balancing measured baseline covariates. It is intended for causal-design review, not as proof of a treatment effect.

Main finding: the ATT contrast estimated risk difference and odds ratio of 0.2500 in 4 treated and 4 control records used by the adjusted analysis.

## Research Question

Does the runner refuse propensity analysis when treated rows are too sparse?

## Methods

The treatment or exposure was treated. The propensity model used the following measured baseline covariates: age, bmi, severity, sex.
No exact-match covariates were declared.
The analysis used nearest-neighbor propensity score matching. Matching diagnostics recorded 4 matched treated records, 4 matched controls, and 0 unmatched treated records.
Complete-case retention for treatment, outcome, and propensity covariates was 1.

## Results

- Estimated contrast: 0.2500.
- Odds ratio: 3.000 (0.1503, 59.89).
- Risk difference: 0.2500.
- Maximum absolute standardized mean difference before adjustment: 2.136.
- Maximum absolute standardized mean difference after adjustment: 0.9057.
- Covariate terms above absolute SMD 0.10 after adjustment: 2.
- Common-support fraction: 0.05000.

## Interpretation

The balance diagnostics describe measured baseline covariate balance after matching or weighting. They do not remove unmeasured confounding, guarantee correct treatment timing, or establish causality without a reviewed target-trial design, exchangeability argument, positivity review, and sensitivity analysis.

## Limitations

This analysis uses complete cases and only the measured covariates supplied to the propensity model. Covariates measured after treatment, unmeasured confounding, poor overlap, missingness, and model misspecification can bias the contrast. P-values and intervals from this standard route should be reviewed as local model-based summaries, not definitive causal uncertainty.

## Reproducibility Note

The companion files include propensity scores, overlap bins, balance diagnostics, matched pairs or weights, run metadata, quality checks, and file hashes.
