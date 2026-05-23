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

- Method: cox-proportional-hazards
- Rows: 240
- Complete-case N: 240
- Variables: survival_time, event, treatment, age, severity
- Weight: (none)
- Supports: method-bound estimates; standard-table diagnostics; local methods review
- Cannot support: causal claims without design support; clinical recommendations
- Next action: Review diagnostics, missingness, and claim language before packet promotion.

## Results

| term | estimate | p_value | ci_low | ci_high |
|---|---:|---:|---:|---:|
| treatment |  | 0.008597 | 1.142 | 2.495 |
| age |  | 0.001039 | 1.008 | 1.032 |
| severity |  | 0.01437 | 1.052 | 1.583 |

## Diagnostics And QA

- Stats QA: warning (8/9 stats QA checks passed; status=warning.)
- Issues: FIGURE_QA_WARNING
- Warnings: (none)
- Errors: (none)

## References

- American Statistical Association. Statement on Statistical Significance and P-Values. 2016.
- ASA President's Task Force Statement on Statistical Significance and Replicability. 2021.