# Propensity Score Matching Analysis

## Summary

This local observational analysis evaluated whether treated differed in the outcome after balancing measured baseline covariates. It is intended for causal-design review, not as proof of a treatment effect.

Main finding: the ATT contrast estimated mean difference of 0.8677 in 118 treated and 118 control records used by the adjusted analysis.

## Research Question

Does a final full propensity run produce complete inspection, QA, paper, and manifest artifacts?

## Methods

The treatment or exposure was treated. The propensity model used the following measured baseline covariates: age, bmi, severity, frailty, sex, site, renal, diabetes.
Matching also required exact agreement on: sex, site.
The analysis used nearest-neighbor propensity score matching. Matching diagnostics recorded 118 matched treated records, 118 matched controls, and 223 unmatched treated records.
Complete-case retention for treatment, outcome, and propensity covariates was 1.

## Results

- Estimated contrast: 0.8677.
- Mean difference: 0.8677 (0.4550, 1.280).
- Maximum absolute standardized mean difference before adjustment: 0.5392.
- Maximum absolute standardized mean difference after adjustment: 0.1641.
- Covariate terms above absolute SMD 0.10 after adjustment: 3.
- Common-support fraction: 0.9146.

## Interpretation

The balance diagnostics describe measured baseline covariate balance after matching or weighting. They do not remove unmeasured confounding, guarantee correct treatment timing, or establish causality without a reviewed target-trial design, exchangeability argument, positivity review, and sensitivity analysis.

## Limitations

This analysis uses complete cases and only the measured covariates supplied to the propensity model. Covariates measured after treatment, unmeasured confounding, poor overlap, missingness, and model misspecification can bias the contrast. P-values and intervals from this standard route should be reviewed as local model-based summaries, not definitive causal uncertainty.

## Reproducibility Note

The companion files include propensity scores, overlap bins, balance diagnostics, matched pairs or weights, run metadata, quality checks, and file hashes.
