# Stats Run Report

## Local Review Safety Header

- This is a standard-table statistical run, not proof of causal effect or clinical validity.
- Interpret estimates with uncertainty, diagnostics, data quality, and study design context.
- P-values are reported as compatibility measures under a model; they are not effect sizes or practical importance.
- Binding status: mismatch.
- Result posture: invalid_binding (Blocked: method binding invalid).
- Interpretation boundary: This run cannot be interpreted because the executable method does not match or cannot read the selected method/spec evidence.
- No complex survey design was declared for this standard-table run.

## Methods

- Method: propensity-score-weighting
- Rows: 0
- Complete-case N: 0
- Variables: outcome, treated, age, bmi, severity, sex, site
- Weight: (none)
- Supports: binding failure diagnosis; repair planning
- Cannot support: method-governed estimates; paper-ready inference
- Next action: Repair the method-selection or AnalysisSpec binding and rerun before reviewing estimates.

## Results

_No estimate rows were produced._
## Propensity Design Diagnostics
- Treatment/exposure: treated.
- Outcome: outcome.
- Estimand: ATE; method: propensity-score-weighting.
- Covariates in propensity model: age, bmi, severity, sex, site.
- Exact-match covariates: (none).
- Weighting: ATE inverse-probability weights with stabilization; trim threshold 0.01.
- Maximum absolute standardized mean difference before adjustment: .
- Maximum absolute standardized mean difference after adjustment: .
- Covariate terms above absolute SMD 0.10 after adjustment: .
- Common-support fraction: .
- Complete-case fraction for treatment, outcome, and propensity covariates: .
- These diagnostics address measured-covariate balance only. They do not address unmeasured confounding, treatment timing, immortal time, consistency, or causal transportability.

## Diagnostics And QA

- Stats QA: fail (4/13 stats QA checks passed; status=fail.)
- Issues: METHOD_SELECTION_STATS_MISMATCH
- Warnings: (none)
- Errors: Stats run binding validation failed.

## References

- American Statistical Association. Statement on Statistical Significance and P-Values. 2016.
- ASA President's Task Force Statement on Statistical Significance and Replicability. 2021.
- Austin PC. An Introduction to Propensity Score Methods for Reducing the Effects of Confounding in Observational Studies. Multivariate Behavioral Research. 2011.
- Austin PC. Balance diagnostics for comparing the distribution of baseline covariates between treatment groups in propensity-score matched samples. Statistics in Medicine. 2009.
- MatchIt and cobalt documentation informed the balance-table and Love-plot-style standardized mean-difference artifact conventions.