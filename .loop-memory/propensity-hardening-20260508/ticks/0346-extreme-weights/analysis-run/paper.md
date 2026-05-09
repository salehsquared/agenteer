# Propensity Score Weighting Analysis

## Summary

This local observational analysis evaluated whether treated differed in the outcome after balancing measured baseline covariates. It is intended for causal-design review, not as proof of a treatment effect.

Main finding: the ATE contrast estimated risk difference and odds ratio of 0.2187 in 206 treated and 154 control records used by the adjusted analysis.

## Research Question

Does weighting flag extreme inverse-probability weights under sparse overlap?

## Methods

The treatment or exposure was treated. The propensity model used the following measured baseline covariates: age, bmi, severity, frailty, sex, site.
No exact-match covariates were declared.
The analysis used inverse-probability treatment weighting. Weight diagnostics recorded an effective sample size of 29.02 and weight range 0.4360 to 68.66.
Complete-case retention for treatment, outcome, and propensity covariates was 1.

## Results

- Estimated contrast: 0.2187.
- Odds ratio: 2.498 (1.635, 3.816).
- Risk difference: 0.2187.
- Maximum absolute standardized mean difference before adjustment: 1.740.
- Maximum absolute standardized mean difference after adjustment: 0.4458.
- Covariate terms above absolute SMD 0.10 after adjustment: 8.
- Common-support fraction: 0.8361.

## Interpretation

The balance diagnostics describe measured baseline covariate balance after matching or weighting. They do not remove unmeasured confounding, guarantee correct treatment timing, or establish causality without a reviewed target-trial design, exchangeability argument, positivity review, and sensitivity analysis.

## Limitations

This analysis uses complete cases and only the measured covariates supplied to the propensity model. Covariates measured after treatment, unmeasured confounding, poor overlap, missingness, and model misspecification can bias the contrast. P-values and intervals from this standard route should be reviewed as local model-based summaries, not definitive causal uncertainty.

## Reproducibility Note

The companion files include propensity scores, overlap bins, balance diagnostics, matched pairs or weights, run metadata, quality checks, and file hashes.
