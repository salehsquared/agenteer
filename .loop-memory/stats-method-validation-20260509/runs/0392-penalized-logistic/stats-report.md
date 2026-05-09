# Stats Run Report

## Local Review Safety Header

- This is a standard-table statistical run, not proof of causal effect or clinical validity.
- Interpret estimates with uncertainty, diagnostics, data quality, and study design context.
- P-values are reported as compatibility measures under a model; they are not effect sizes or practical importance.
- Binding status: unbound.
- Result posture: exploratory_standard_table (Exploratory standard-table result).
- Interpretation boundary: This run is not bound to a method-selection artifact or AnalysisSpec, so treat it as exploratory until governed by pre-run evidence.
- No complex survey design was declared for this standard-table run.

## Methods

- Method: penalized-logistic-regression
- Rows: 240
- Complete-case N: 240
- Variables: outcome_binary, treatment, age, severity, albumin
- Weight: (none)
- Supports: local data debugging; rough statistical exploration; candidate method smoke testing
- Cannot support: method-governed inference; paper-ready conclusions; causal claims
- Next action: Create or bind method-selection and AnalysisSpec evidence, then rerun before paper lifecycle promotion.

## Results

| term | estimate | p_value | ci_low | ci_high |
|---|---:|---:|---:|---:|
| intercept | -0.4377 |  |  |  |
| treatment | 0.3479 |  |  |  |
| age | 0.03398 |  |  |  |
| severity | 0.6684 |  |  |  |
| albumin | -1.265 |  |  |  |

## Diagnostics And QA

- Stats QA: warning (6/8 stats QA checks passed; status=warning.)
- Issues: PENALIZED_INFERENCE_CAVEAT
- Warnings: (none)
- Errors: (none)

## References

- American Statistical Association. Statement on Statistical Significance and P-Values. 2016.
- ASA President's Task Force Statement on Statistical Significance and Replicability. 2021.