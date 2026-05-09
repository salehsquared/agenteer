# Propensity Score Matching Analysis

## Summary

This local observational analysis evaluated whether treated differed in the outcome after balancing measured baseline covariates. It is intended for causal-design review, not as proof of a treatment effect.

Main finding: the ATT contrast estimated risk difference and odds ratio of 0.1008 in 129 treated and 129 control records used by the adjusted analysis.

## Research Question

Does matching tolerate multiple categorical baseline covariates without artifact loss?

## Methods

The treatment or exposure was treated. The propensity model used the following measured baseline covariates: age, bmi, severity, frailty, sex, site, region, insurance.
Matching also required exact agreement on: sex.
The analysis used nearest-neighbor propensity score matching. Matching diagnostics recorded 129 matched treated records, 129 matched controls, and 226 unmatched treated records.
Complete-case retention for treatment, outcome, and propensity covariates was 1.

## Results

- Estimated contrast: 0.1008.
- Odds ratio: 1.517 (0.9218, 2.497).
- Risk difference: 0.1008.
- Maximum absolute standardized mean difference before adjustment: 0.5262.
- Maximum absolute standardized mean difference after adjustment: 0.1630.
- Covariate terms above absolute SMD 0.10 after adjustment: 2.
- Common-support fraction: 0.9380.

## Interpretation

The balance diagnostics describe measured baseline covariate balance after matching or weighting. They do not remove unmeasured confounding, guarantee correct treatment timing, or establish causality without a reviewed target-trial design, exchangeability argument, positivity review, and sensitivity analysis.

## Limitations

This analysis uses complete cases and only the measured covariates supplied to the propensity model. Covariates measured after treatment, unmeasured confounding, poor overlap, missingness, and model misspecification can bias the contrast. P-values and intervals from this standard route should be reviewed as local model-based summaries, not definitive causal uncertainty.

## Reproducibility Note

The companion files include propensity scores, overlap bins, balance diagnostics, matched pairs or weights, run metadata, quality checks, and file hashes.
