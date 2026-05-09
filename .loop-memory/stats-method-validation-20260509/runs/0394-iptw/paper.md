# Propensity Score Weighting Analysis

## Summary

This local observational analysis evaluated whether treatment differed in the outcome after balancing measured baseline covariates. It is intended for causal-design review, not as proof of a treatment effect.

Main finding: the ATE contrast estimated mean difference of 0.9466 in 144 treated and 96 control records used by the adjusted analysis.

## Research Question

Among treated and untreated records, does treatment relate to continuous outcome after propensity weighting?

## Methods

The treatment or exposure was treatment. The propensity model used the following measured baseline covariates: age, severity, albumin.
No exact-match covariates were declared.
The analysis used inverse-probability treatment weighting. Weight diagnostics recorded an effective sample size of 201.9 and weight range 0.4789 to 3.395.
Complete-case retention for treatment, outcome, and propensity covariates was 1.

## Results

- Estimated contrast: 0.9466.
- Mean difference: 0.9466 (0.08174, 1.811).
- Maximum absolute standardized mean difference before adjustment: 0.6509.
- Maximum absolute standardized mean difference after adjustment: 0.02326.
- Covariate terms above absolute SMD 0.10 after adjustment: 0.
- Common-support fraction: 0.9458.

## Interpretation

The balance diagnostics describe measured baseline covariate balance after matching or weighting. They do not remove unmeasured confounding, guarantee correct treatment timing, or establish causality without a reviewed target-trial design, exchangeability argument, positivity review, and sensitivity analysis.

## Limitations

This analysis uses complete cases and only the measured covariates supplied to the propensity model. Covariates measured after treatment, unmeasured confounding, poor overlap, missingness, and model misspecification can bias the contrast. P-values and intervals from this standard route should be reviewed as local model-based summaries, not definitive causal uncertainty.

## Reproducibility Note

The companion files include propensity scores, overlap bins, balance diagnostics, matched pairs or weights, run metadata, quality checks, and file hashes.
