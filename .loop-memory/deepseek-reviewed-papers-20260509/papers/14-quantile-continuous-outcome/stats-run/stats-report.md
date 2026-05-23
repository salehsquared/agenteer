# Stats Run Report

## Local Review Safety Header

- This is a standard-table statistical run, not proof of causal effect or clinical validity.
- Interpret estimates with uncertainty, diagnostics, data quality, and study design context.
- P-values are reported as compatibility measures under a model; they are not effect sizes or practical importance.
- Binding status: bound.
- Result posture: bound_standard_table (Bound standard-table result).
- Interpretation boundary: This run is bound to method/spec evidence and can support local methods review for non-survey standard-table analyses.
- No complex survey design was declared for this standard-table run.

## Methods

- Method: quantile-regression
- Rows: 240
- Complete-case N: 240
- Variables: outcome_cont, treatment, age, severity
- Weight: (none)
- Supports: method-bound estimates; standard-table diagnostics; local methods review
- Cannot support: causal claims without design support; clinical recommendations
- Next action: Review diagnostics, missingness, and claim language before packet promotion.

## Results

| term | estimate | p_value | ci_low | ci_high |
|---|---:|---:|---:|---:|
| const | 7.771 | 3.714e-19 | 6.205 | 9.338 |
| treatment | 1.307 | 0.0001335 | 0.6441 | 1.970 |
| age | 0.1362 | 1.357e-26 | 0.1140 | 0.1583 |
| severity | 1.953 | 4.204e-20 | 1.572 | 2.335 |

## Diagnostics And QA

- Stats QA: pass (9/9 stats QA checks passed; status=pass.)
- Issues: (none)
- Warnings: (none)
- Errors: (none)

## References

- American Statistical Association. Statement on Statistical Significance and P-Values. 2016.
- ASA President's Task Force Statement on Statistical Significance and Replicability. 2021.