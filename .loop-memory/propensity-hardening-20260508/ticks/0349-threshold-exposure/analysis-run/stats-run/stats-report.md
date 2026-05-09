# Stats Run Report

## Local Review Safety Header

- This is a standard-table statistical run, not proof of causal effect or clinical validity.
- Interpret estimates with uncertainty, diagnostics, data quality, and study design context.
- P-values are reported as compatibility measures under a model; they are not effect sizes or practical importance.
- Binding status: bound.
- Result posture: failed (Failed execution).
- Interpretation boundary: This run failed before producing a locally reviewable statistical result.
- No complex survey design was declared for this standard-table run.

## Methods

- Method: propensity-score-matching
- Rows: 400
- Complete-case N: 400
- Variables: outcome, high_biomarker, age, bmi, severity, frailty, sex, site, renal
- Weight: (none)
- Supports: failure attribution; repair planning
- Cannot support: effect estimates; confidence intervals; p-values; paper-ready inference
- Next action: Resolve blocker issues and rerun the stats method.

## Results

| contrast | estimand | effect measure | estimate | ci_low | ci_high | p_value | treated n | control n |
|---|---|---|---:|---:|---:|---:|---:|---:|
| high_biomarker | ATT | risk difference and odds ratio | 0.1818 | 0.6276 | 7.027 | 0.2286 | 22 | 22 |
## Propensity Design Diagnostics
- Treatment/exposure: high_biomarker.
- Outcome: outcome.
- Estimand: ATT; method: propensity-score-matching.
- Covariates in propensity model: age, bmi, severity, frailty, sex, site, renal.
- Exact-match covariates: sex.
- Matching: nearest-neighbor greedy matching, ratio 1:1, without replacement, caliper 0.25 SD of the logit propensity score.
- Maximum absolute standardized mean difference before adjustment: 2.850.
- Maximum absolute standardized mean difference after adjustment: 0.2085.
- Covariate terms above absolute SMD 0.10 after adjustment: 5.
- Common-support fraction: 0.2350.
- Complete-case fraction for treatment, outcome, and propensity covariates: 1.
- Matched treated rows: 22; matched control rows: 22; unmatched treated rows: 239.
- These diagnostics address measured-covariate balance only. They do not address unmeasured confounding, treatment timing, immortal time, consistency, or causal transportability.

## Diagnostics And QA

- Stats QA: fail (9/13 stats QA checks passed; status=fail.)
- Issues: PROPENSITY_UNMATCHED_TREATED, PROPENSITY_RESIDUAL_IMBALANCE, PROPENSITY_POOR_OVERLAP
- Warnings: (none)
- Errors: (none)

## References

- American Statistical Association. Statement on Statistical Significance and P-Values. 2016.
- ASA President's Task Force Statement on Statistical Significance and Replicability. 2021.
- Austin PC. An Introduction to Propensity Score Methods for Reducing the Effects of Confounding in Observational Studies. Multivariate Behavioral Research. 2011.
- Austin PC. Balance diagnostics for comparing the distribution of baseline covariates between treatment groups in propensity-score matched samples. Statistics in Medicine. 2009.
- MatchIt and cobalt documentation informed the balance-table and Love-plot-style standardized mean-difference artifact conventions.