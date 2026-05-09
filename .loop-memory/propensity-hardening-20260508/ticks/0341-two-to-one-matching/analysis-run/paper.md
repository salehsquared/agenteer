# Propensity Score Matching Analysis

## Summary

This local observational analysis evaluated whether treated differed in the outcome after balancing measured baseline covariates. It is intended for causal-design review, not as proof of a treatment effect.

Main finding: the ATT contrast estimated risk difference and odds ratio of 0.1311 in 61 treated and 122 control records used by the adjusted analysis.

## Research Question

Does geriatric fracture pathway exposure relate to mortality using 2:1 propensity matching?

## Methods

The treatment or exposure was treated. The propensity model used the following measured baseline covariates: age, bmi, severity, frailty, sex, site, renal.
Matching also required exact agreement on: sex.
The analysis used nearest-neighbor propensity score matching. Matching diagnostics recorded 61 matched treated records, 122 matched controls, and 264 unmatched treated records.
Complete-case retention for treatment, outcome, and propensity covariates was 1.

## Results

- Estimated contrast: 0.1311.
- Odds ratio: 1.716 (0.8312, 3.541).
- Risk difference: 0.1311.
- Maximum absolute standardized mean difference before adjustment: 0.5222.
- Maximum absolute standardized mean difference after adjustment: 0.2363.
- Covariate terms above absolute SMD 0.10 after adjustment: 2.
- Common-support fraction: 0.9500.

## Interpretation

The balance diagnostics describe measured baseline covariate balance after matching or weighting. They do not remove unmeasured confounding, guarantee correct treatment timing, or establish causality without a reviewed target-trial design, exchangeability argument, positivity review, and sensitivity analysis.

## Limitations

This analysis uses complete cases and only the measured covariates supplied to the propensity model. Covariates measured after treatment, unmeasured confounding, poor overlap, missingness, and model misspecification can bias the contrast. P-values and intervals from this standard route should be reviewed as local model-based summaries, not definitive causal uncertainty.

## Reproducibility Note

The companion files include propensity scores, overlap bins, balance diagnostics, matched pairs or weights, run metadata, quality checks, and file hashes.
