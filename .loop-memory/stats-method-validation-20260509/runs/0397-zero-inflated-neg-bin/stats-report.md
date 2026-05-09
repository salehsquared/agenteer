# Stats Run Report

## Local Review Safety Header

- This is a standard-table statistical run, not proof of causal effect or clinical validity.
- Interpret estimates with uncertainty, diagnostics, data quality, and study design context.
- P-values are reported as compatibility measures under a model; they are not effect sizes or practical importance.
- Binding status: unbound.
- Result posture: failed (Failed execution).
- Interpretation boundary: This run failed before producing a locally reviewable statistical result.
- No complex survey design was declared for this standard-table run.

## Methods

- Method: zero-inflated-negative-binomial
- Rows: 240
- Complete-case N: 240
- Variables: zero_count, treatment, age, severity
- Weight: (none)
- Supports: failure attribution; repair planning
- Cannot support: effect estimates; confidence intervals; p-values; paper-ready inference
- Next action: Resolve blocker issues and rerun the stats method.

## Results

| term | estimate | p_value | ci_low | ci_high |
|---|---:|---:|---:|---:|
| inflate_const | -291.8 |  |  |  |
| const | 36.69 |  |  |  |
| treatment | -10.93 |  |  |  |
| age | -0.3701 |  |  |  |
| severity | -0.1539 |  |  |  |
| alpha | -356.1 |  |  |  |

## Diagnostics And QA

- Stats QA: fail (5/8 stats QA checks passed; status=fail.)
- Issues: REGRESSION_DID_NOT_CONVERGE
- Warnings: /Users/saleh/TechProjects/agenteer/.research-runtime/python/lib/python3.9/site-packages/statsmodels/base/model.py:595: HessianInversionWarning: Inverting hessian failed, no bse or cov_params available
  warnings.warn('Inverting hessian failed, no bse or cov_params '
/Users/saleh/TechProjects/agenteer/.research-runtime/python/lib/python3.9/site-packages/statsmodels/base/model.py:607: ConvergenceWarning: Maximum Likelihood optimization failed to converge. Check mle_retvals
  warnings.warn("Maximum Likelihood optimization failed to "
- Errors: (none)

## References

- American Statistical Association. Statement on Statistical Significance and P-Values. 2016.
- ASA President's Task Force Statement on Statistical Significance and Replicability. 2021.