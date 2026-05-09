# Propensity Score Matching Analysis

## Summary

This local observational analysis evaluated whether treated differed in the outcome after balancing measured baseline covariates. It is intended for causal-design review, not as proof of a treatment effect.

Main finding: the ATT contrast estimated risk difference and odds ratio of 0.1351 in 74 treated and 74 control records used by the adjusted analysis.

## Research Question

Does a strict caliper record unmatched treated rows instead of hiding loss of comparability?

## Methods

The treatment or exposure was treated. The propensity model used the following measured baseline covariates: age, bmi, severity, frailty, sex, site.
No exact-match covariates were declared.
The analysis used nearest-neighbor propensity score matching. Matching diagnostics recorded 74 matched treated records, 74 matched controls, and 180 unmatched treated records.
Complete-case retention for treatment, outcome, and propensity covariates was 1.

## Results

- Estimated contrast: 0.1351.
- Odds ratio: 1.725 (0.8995, 3.310).
- Risk difference: 0.1351.
- Maximum absolute standardized mean difference before adjustment: 0.4984.
- Maximum absolute standardized mean difference after adjustment: 0.1257.
- Covariate terms above absolute SMD 0.10 after adjustment: 2.
- Common-support fraction: 0.9028.

## Interpretation

The balance diagnostics describe measured baseline covariate balance after matching or weighting. They do not remove unmeasured confounding, guarantee correct treatment timing, or establish causality without a reviewed target-trial design, exchangeability argument, positivity review, and sensitivity analysis.

## Limitations

This analysis uses complete cases and only the measured covariates supplied to the propensity model. Covariates measured after treatment, unmeasured confounding, poor overlap, missingness, and model misspecification can bias the contrast. P-values and intervals from this standard route should be reviewed as local model-based summaries, not definitive causal uncertainty.

## Reproducibility Note

The companion files include propensity scores, overlap bins, balance diagnostics, matched pairs or weights, run metadata, quality checks, and file hashes.
