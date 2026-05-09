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
- Rows: 0
- Complete-case N: 0
- Variables: (none)
- Weight: (none)
- Supports: failure attribution; repair planning
- Cannot support: effect estimates; confidence intervals; p-values; paper-ready inference
- Next action: Resolve blocker issues and rerun the stats method.

## Results

_No estimate rows were produced._
## Propensity Design Diagnostics
- Treatment/exposure: treated.
- Outcome: outcome.
- Estimand: ATT; method: propensity-score-matching.
- Covariates in propensity model: (none).
- Exact-match covariates: (none).
- Matching: nearest-neighbor greedy matching, ratio 1:1, without replacement, caliper 0.2 SD of the logit propensity score.
- Maximum absolute standardized mean difference before adjustment: .
- Maximum absolute standardized mean difference after adjustment: .
- Covariate terms above absolute SMD 0.10 after adjustment: .
- Common-support fraction: .
- Complete-case fraction for treatment, outcome, and propensity covariates: .
- These diagnostics address measured-covariate balance only. They do not address unmeasured confounding, treatment timing, immortal time, consistency, or causal transportability.

## Diagnostics And QA

- Stats QA: fail (5/13 stats QA checks passed; status=fail.)
- Issues: (none)
- Warnings: (none)
- Errors: Propensity methods require at least one baseline covariate.; Traceback (most recent call last):
  File "/var/folders/tx/ktqqcdmn4ydf6s3zl97nsswm0000gn/T/agenteer-stats-L0jjcA/stats_bridge.py", line 814, in main
    print(json.dumps(run(req)))
  File "/var/folders/tx/ktqqcdmn4ydf6s3zl97nsswm0000gn/T/agenteer-stats-L0jjcA/stats_bridge.py", line 595, in run
    ps, x_cov, ps_model = fit_propensity_scores(data, "_agenteer_treatment", covariates)
  File "/var/folders/tx/ktqqcdmn4ydf6s3zl97nsswm0000gn/T/agenteer-stats-L0jjcA/stats_bridge.py", line 130, in fit_propensity_scores
    x = covariate_matrix(data, covariates)
  File "/var/folders/tx/ktqqcdmn4ydf6s3zl97nsswm0000gn/T/agenteer-stats-L0jjcA/stats_bridge.py", line 102, in covariate_matrix
    raise ValueError("Propensity methods require at least one baseline covariate.")
ValueError: Propensity methods require at least one baseline covariate.


## References

- American Statistical Association. Statement on Statistical Significance and P-Values. 2016.
- ASA President's Task Force Statement on Statistical Significance and Replicability. 2021.
- Austin PC. An Introduction to Propensity Score Methods for Reducing the Effects of Confounding in Observational Studies. Multivariate Behavioral Research. 2011.
- Austin PC. Balance diagnostics for comparing the distribution of baseline covariates between treatment groups in propensity-score matched samples. Statistics in Medicine. 2009.
- MatchIt and cobalt documentation informed the balance-table and Love-plot-style standardized mean-difference artifact conventions.