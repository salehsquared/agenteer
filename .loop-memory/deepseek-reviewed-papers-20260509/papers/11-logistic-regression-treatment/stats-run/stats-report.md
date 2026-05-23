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

- Method: logistic-regression
- Rows: 240
- Complete-case N: 240
- Variables: outcome_binary, treatment, age, severity, albumin
- Weight: (none)
- Supports: method-bound estimates; standard-table diagnostics; local methods review
- Cannot support: causal claims without design support; clinical recommendations
- Next action: Review diagnostics, missingness, and claim language before packet promotion.

## Results

| term | estimate | p_value | ci_low | ci_high |
|---|---:|---:|---:|---:|
| const | -4.028 | 0.02934 | -7.651 | -0.4046 |
| treatment | 0.4758 | 0.1541 | -0.1786 | 1.130 |
| age | 0.04326 | 0.0001426 | 0.02097 | 0.06556 |
| severity | 0.8338 | 0.00008761 | 0.4172 | 1.250 |
| albumin | -0.5577 | 0.2082 | -1.426 | 0.3108 |

## Diagnostics And QA

- Stats QA: pass (9/9 stats QA checks passed; status=pass.)
- Issues: (none)
- Warnings: (none)
- Errors: (none)

## References

- American Statistical Association. Statement on Statistical Significance and P-Values. 2016.
- ASA President's Task Force Statement on Statistical Significance and Replicability. 2021.