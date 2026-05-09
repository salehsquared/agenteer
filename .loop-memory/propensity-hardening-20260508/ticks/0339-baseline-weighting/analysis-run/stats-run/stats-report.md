# Stats Run Report

## Local Review Safety Header

- This is a standard-table statistical run, not proof of causal effect or clinical validity.
- Interpret estimates with uncertainty, diagnostics, data quality, and study design context.
- P-values are reported as compatibility measures under a model; they are not effect sizes or practical importance.
- Binding status: bound.
- Result posture: causal_design_review_required (Causal design review required).
- Interpretation boundary: This run produces propensity-score balance and treatment-contrast artifacts for local causal-design review; it does not by itself establish a causal effect.
- No complex survey design was declared for this standard-table run.

## Methods

- Method: propensity-score-weighting
- Rows: 360
- Complete-case N: 360
- Variables: outcome, treated, age, bmi, severity, frailty, sex, site
- Weight: (none)
- Supports: propensity score diagnostics; balance review; overlap/positivity review; local treatment-contrast estimation under declared assumptions
- Cannot support: causal claims without target-trial/DAG review; unmeasured-confounding control; clinical recommendations; external validity
- Next action: Review the target trial, confounding set, positivity, balance, missingness, and sensitivity plan before using causal language.

## Results

| contrast | estimand | effect measure | estimate | ci_low | ci_high | p_value | treated n | control n |
|---|---|---|---:|---:|---:|---:|---:|---:|
| treated | ATE | risk difference and odds ratio | 0.1766 | 1.279 | 3.264 | 0.002804 | 254 | 106 |
## Propensity Design Diagnostics
- Treatment/exposure: treated.
- Outcome: outcome.
- Estimand: ATE; method: propensity-score-weighting.
- Covariates in propensity model: age, bmi, severity, frailty, sex, site.
- Exact-match covariates: (none).
- Weighting: ATE inverse-probability weights with stabilization; trim threshold 0.02.
- Maximum absolute standardized mean difference before adjustment: 0.4984.
- Maximum absolute standardized mean difference after adjustment: 0.07430.
- Covariate terms above absolute SMD 0.10 after adjustment: 0.
- Common-support fraction: 0.9028.
- Complete-case fraction for treatment, outcome, and propensity covariates: 1.
- Weight range: 0.3898 to 4.863; effective sample size 305.0.
- These diagnostics address measured-covariate balance only. They do not address unmeasured confounding, treatment timing, immortal time, consistency, or causal transportability.

## Diagnostics And QA

- Stats QA: pass (13/13 stats QA checks passed; status=pass.)
- Issues: (none)
- Warnings: (none)
- Errors: (none)

## References

- American Statistical Association. Statement on Statistical Significance and P-Values. 2016.
- ASA President's Task Force Statement on Statistical Significance and Replicability. 2021.
- Austin PC. An Introduction to Propensity Score Methods for Reducing the Effects of Confounding in Observational Studies. Multivariate Behavioral Research. 2011.
- Austin PC. Balance diagnostics for comparing the distribution of baseline covariates between treatment groups in propensity-score matched samples. Statistics in Medicine. 2009.
- MatchIt and cobalt documentation informed the balance-table and Love-plot-style standardized mean-difference artifact conventions.