# Propensity Score Weighting Analysis

## Summary

This local observational analysis evaluated whether treated differed in the outcome after balancing measured baseline covariates. It is intended for causal-design review, not as proof of a treatment effect.

Main finding: the ATT contrast estimated risk difference and odds ratio of 0.1603 in 296 treated and 124 control records used by the adjusted analysis.

## Research Question

Does ATT weighting produce stable balance diagnostics and weight artifacts?

## Methods

The treatment or exposure was treated. The propensity model used the following measured baseline covariates: age, bmi, severity, frailty, sex, site.
No exact-match covariates were declared.
The analysis used inverse-probability treatment weighting. Weight diagnostics recorded an effective sample size of 138.2 and weight range 0.4717 to 23.76.
Complete-case retention for treatment, outcome, and propensity covariates was 1.

## Results

- Estimated contrast: 0.1603.
- Odds ratio: 1.911 (1.447, 2.526).
- Risk difference: 0.1603.
- Maximum absolute standardized mean difference before adjustment: 0.5249.
- Maximum absolute standardized mean difference after adjustment: 0.1524.
- Covariate terms above absolute SMD 0.10 after adjustment: 1.
- Common-support fraction: 0.8929.

## Interpretation

The balance diagnostics describe measured baseline covariate balance after matching or weighting. They do not remove unmeasured confounding, guarantee correct treatment timing, or establish causality without a reviewed target-trial design, exchangeability argument, positivity review, and sensitivity analysis.

## Limitations

This analysis uses complete cases and only the measured covariates supplied to the propensity model. Covariates measured after treatment, unmeasured confounding, poor overlap, missingness, and model misspecification can bias the contrast. P-values and intervals from this standard route should be reviewed as local model-based summaries, not definitive causal uncertainty.

## Reproducibility Note

The companion files include propensity scores, overlap bins, balance diagnostics, matched pairs or weights, run metadata, quality checks, and file hashes.
