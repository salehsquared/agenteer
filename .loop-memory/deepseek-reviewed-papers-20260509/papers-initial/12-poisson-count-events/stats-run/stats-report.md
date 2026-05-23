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

- Method: poisson-regression
- Rows: 240
- Complete-case N: 240
- Variables: count_events, treatment, age, severity
- Weight: (none)
- Supports: local data debugging; rough statistical exploration; candidate method smoke testing
- Cannot support: method-governed inference; paper-ready conclusions; causal claims
- Next action: Create or bind method-selection and AnalysisSpec evidence, then rerun before paper lifecycle promotion.

## Results

| term | estimate | p_value | ci_low | ci_high |
|---|---:|---:|---:|---:|
| const | -0.7983 | 0.004090 | -1.343 | -0.2534 |
| treatment | 0.2704 | 0.02211 | 0.03881 | 0.5019 |
| age | 0.01102 | 0.003221 | 0.003689 | 0.01836 |
| severity | 0.1241 | 0.05807 | -0.004243 | 0.2525 |

## Diagnostics And QA

- Stats QA: warning (7/9 stats QA checks passed; status=warning.)
- Issues: (none)
- Warnings: (none)
- Errors: (none)

## References

- American Statistical Association. Statement on Statistical Significance and P-Values. 2016.
- ASA President's Task Force Statement on Statistical Significance and Replicability. 2021.