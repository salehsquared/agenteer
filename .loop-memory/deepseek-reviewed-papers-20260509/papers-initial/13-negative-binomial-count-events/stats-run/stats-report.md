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

- Method: negative-binomial-regression
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
| const | -0.8310 | 0.05742 | -1.688 | 0.02618 |
| treatment | 0.2529 | 0.1682 | -0.1068 | 0.6126 |
| age | 0.01127 | 0.06168 | -0.0005512 | 0.02309 |
| severity | 0.1354 | 0.1969 | -0.07026 | 0.3411 |

## Diagnostics And QA

- Stats QA: warning (7/9 stats QA checks passed; status=warning.)
- Issues: (none)
- Warnings: /Users/saleh/TechProjects/agenteer/.research-runtime/python/lib/python3.9/site-packages/statsmodels/genmod/families/family.py:1367: ValueWarning: Negative binomial dispersion parameter alpha not set. Using default value alpha=1.0.
  warnings.warn("Negative binomial dispersion parameter alpha not "
- Errors: (none)

## References

- American Statistical Association. Statement on Statistical Significance and P-Values. 2016.
- ASA President's Task Force Statement on Statistical Significance and Replicability. 2021.