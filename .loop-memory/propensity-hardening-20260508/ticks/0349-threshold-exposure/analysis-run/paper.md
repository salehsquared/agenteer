# Propensity Score Matching Analysis

## Summary

This local observational analysis evaluated whether high_biomarker differed in the outcome after balancing measured baseline covariates. It is intended for causal-design review, not as proof of a treatment effect.

Main finding: the ATT contrast estimated risk difference and odds ratio of 0.1818 in 22 treated and 22 control records used by the adjusted analysis.

## Research Question

Does high baseline biomarker exposure relate to mortality after propensity matching?

## Methods

The treatment or exposure was high_biomarker. The propensity model used the following measured baseline covariates: age, bmi, severity, frailty, sex, site, renal.
Matching also required exact agreement on: sex.
The analysis used nearest-neighbor propensity score matching. Matching diagnostics recorded 22 matched treated records, 22 matched controls, and 239 unmatched treated records.
Complete-case retention for treatment, outcome, and propensity covariates was 1.

## Results

- Estimated contrast: 0.1818.
- Odds ratio: 2.100 (0.6276, 7.027).
- Risk difference: 0.1818.
- Maximum absolute standardized mean difference before adjustment: 2.850.
- Maximum absolute standardized mean difference after adjustment: 0.2085.
- Covariate terms above absolute SMD 0.10 after adjustment: 5.
- Common-support fraction: 0.2350.

## Interpretation

The balance diagnostics describe measured baseline covariate balance after matching or weighting. They do not remove unmeasured confounding, guarantee correct treatment timing, or establish causality without a reviewed target-trial design, exchangeability argument, positivity review, and sensitivity analysis.

## Limitations

This analysis uses complete cases and only the measured covariates supplied to the propensity model. Covariates measured after treatment, unmeasured confounding, poor overlap, missingness, and model misspecification can bias the contrast. P-values and intervals from this standard route should be reviewed as local model-based summaries, not definitive causal uncertainty.

## Reproducibility Note

The companion files include propensity scores, overlap bins, balance diagnostics, matched pairs or weights, run metadata, quality checks, and file hashes.
