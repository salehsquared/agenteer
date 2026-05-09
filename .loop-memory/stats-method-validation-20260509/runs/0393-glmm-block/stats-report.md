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

- Method: generalized-mixed-model
- Rows: 240
- Complete-case N: 240
- Variables: outcome_binary, treatment, id, age
- Weight: (none)
- Supports: failure attribution; repair planning
- Cannot support: effect estimates; confidence intervals; p-values; paper-ready inference
- Next action: Resolve blocker issues and rerun the stats method.

## Results

| term | estimate | p_value | ci_low | ci_high |
|---|---:|---:|---:|---:|
| generalized-mixed-model |  |  |  |  |

## Diagnostics And QA

- Stats QA: fail (3/8 stats QA checks passed; status=fail.)
- Issues: GLMM_BACKEND_NOT_AVAILABLE
- Warnings: (none)
- Errors: (none)

## References

- American Statistical Association. Statement on Statistical Significance and P-Values. 2016.
- ASA President's Task Force Statement on Statistical Significance and Replicability. 2021.