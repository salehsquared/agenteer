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

- Method: zero-inflated-negative-binomial
- Rows: 600
- Complete-case N: 600
- Variables: zero_count, treatment, age, severity
- Weight: (none)
- Supports: local data debugging; rough statistical exploration; candidate method smoke testing
- Cannot support: method-governed inference; paper-ready conclusions; causal claims
- Next action: Create or bind method-selection and AnalysisSpec evidence, then rerun before paper lifecycle promotion.

## Results

| term | estimate | p_value | ci_low | ci_high |
|---|---:|---:|---:|---:|
| inflate_const | -0.3884 | 0.05562 | -0.7861 | 0.009328 |
| const | 0.4866 | 0.2980 | -0.4298 | 1.403 |
| treatment | 0.5491 | 0.00002376 | 0.2944 | 0.8037 |
| age | -0.008063 | 0.2518 | -0.02185 | 0.005726 |
| severity | 0.1770 | 0.01454 | 0.03504 | 0.3190 |
| alpha | 0.5609 | 0.0008713 | 0.2307 | 0.8911 |

## Diagnostics And QA

- Stats QA: warning (6/8 stats QA checks passed; status=warning.)
- Issues: (none)
- Warnings: (none)
- Errors: (none)

## References

- American Statistical Association. Statement on Statistical Significance and P-Values. 2016.
- ASA President's Task Force Statement on Statistical Significance and Replicability. 2021.