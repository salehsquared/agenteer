# Propensity Score Weighting Analysis

## Summary

This local observational analysis evaluated whether treated differed in the outcome after balancing measured baseline covariates. It is intended for causal-design review, not as proof of a treatment effect.

Main finding: the ATE contrast estimated risk difference and odds ratio of 0.1580 in 367 treated and 153 control records used by the adjusted analysis.

## Research Question

Does IPTW remain inspectable with a broader measured confounder set?

## Methods

The treatment or exposure was treated. The propensity model used the following measured baseline covariates: age, bmi, severity, frailty, sex, site, renal, diabetes, albumin, hemoglobin, heart_rate.
No exact-match covariates were declared.
The analysis used inverse-probability treatment weighting. Weight diagnostics recorded an effective sample size of 410.5 and weight range 0.3636 to 6.511.
Complete-case retention for treatment, outcome, and propensity covariates was 1.

## Results

- Estimated contrast: 0.1580.
- Odds ratio: 1.892 (1.286, 2.782).
- Risk difference: 0.1580.
- Maximum absolute standardized mean difference before adjustment: 0.5517.
- Maximum absolute standardized mean difference after adjustment: 0.06379.
- Covariate terms above absolute SMD 0.10 after adjustment: 0.
- Common-support fraction: 0.9519.

## Interpretation

The balance diagnostics describe measured baseline covariate balance after matching or weighting. They do not remove unmeasured confounding, guarantee correct treatment timing, or establish causality without a reviewed target-trial design, exchangeability argument, positivity review, and sensitivity analysis.

## Limitations

This analysis uses complete cases and only the measured covariates supplied to the propensity model. Covariates measured after treatment, unmeasured confounding, poor overlap, missingness, and model misspecification can bias the contrast. P-values and intervals from this standard route should be reviewed as local model-based summaries, not definitive causal uncertainty.

## Reproducibility Note

The companion files include propensity scores, overlap bins, balance diagnostics, matched pairs or weights, run metadata, quality checks, and file hashes.
