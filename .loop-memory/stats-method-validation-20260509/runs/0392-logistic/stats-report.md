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

- Method: logistic-regression
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
| const | -4.028 | 0.02934 | -7.651 | -0.4046 |
| treatment | 0.4758 | 0.1541 | -0.1786 | 1.130 |
| age | 0.04326 | 0.0001426 | 0.02097 | 0.06556 |
| severity | 0.8338 | 0.00008761 | 0.4172 | 1.250 |
| albumin | -0.5577 | 0.2082 | -1.426 | 0.3108 |

## Diagnostics And QA

- Stats QA: warning (6/8 stats QA checks passed; status=warning.)
- Issues: (none)
- Warnings: (none)
- Errors: (none)

## References

- American Statistical Association. Statement on Statistical Significance and P-Values. 2016.
- ASA President's Task Force Statement on Statistical Significance and Replicability. 2021.