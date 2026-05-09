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

- Method: regression-discontinuity
- Rows: 240
- Complete-case N: 240
- Variables: outcome_cont, running, age
- Weight: (none)
- Supports: local data debugging; rough statistical exploration; candidate method smoke testing
- Cannot support: method-governed inference; paper-ready conclusions; causal claims
- Next action: Create or bind method-selection and AnalysisSpec evidence, then rerun before paper lifecycle promotion.

## Results

| term | estimate | p_value | ci_low | ci_high |
|---|---:|---:|---:|---:|
| const | 9.976 | 6.834e-26 | 8.118 | 11.83 |
| _above_cutoff | 2.064 | 0.001666 | 0.7773 | 3.350 |
| _running_centered | -0.2185 | 0.06032 | -0.4466 | 0.009480 |
| age | 0.1635 | 6.066e-37 | 0.1383 | 0.1888 |

## Diagnostics And QA

- Stats QA: warning (6/8 stats QA checks passed; status=warning.)
- Issues: (none)
- Warnings: (none)
- Errors: (none)

## References

- American Statistical Association. Statement on Statistical Significance and P-Values. 2016.
- ASA President's Task Force Statement on Statistical Significance and Replicability. 2021.