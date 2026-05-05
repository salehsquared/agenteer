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

- Method: diagnostic-accuracy
- Rows: 160
- Complete-case N: 160
- Variables: elevated_hba1c, waist_high
- Weight: (none)
- Supports: method-bound estimates; standard-table diagnostics; local methods review
- Cannot support: causal claims without design support; clinical recommendations
- Next action: Review diagnostics, missingness, and claim language before packet promotion.

## Results

| index test | reference standard | TP | FP | TN | FN | sensitivity | specificity | PPV | NPV | LR+ | LR- | prevalence |
|---|---|---:|---:|---:|---:|---|---|---|---|---:|---:|---:|
| waist_high | elevated_hba1c | 69 | 2 | 74 | 15 | 0.8214 (0.7261, 0.8887) | 0.9737 (0.9090, 0.9928) | 0.9718 (0.9030, 0.9922) | 0.8315 (0.7404, 0.8951) | 31.21 | 0.1834 | 0.5250 |

## Diagnostic Accuracy Boundary

- Reference standard: elevated_hba1c.
- Index test or screening indicator: waist_high.
- Reference positive level: 1; index-test positive level: 1.
- PPV and NPV depend on the prevalence in this analyzed table and should not be generalized without external validation or a target-population prevalence model.
- Sensitivity, specificity, PPV, and NPV include Wilson binomial intervals when denominators are available; likelihood ratios remain point estimates in this standard-table route.
- These estimates do not justify clinical screening recommendations, deployment, or diagnostic replacement claims without prospective validation and clinical-utility evidence.
- Sparse diagnostic cells were detected; treat all accuracy metrics as unstable until more data or exact interval evidence is available.

## Diagnostics And QA

- Stats QA: warning (10/12 stats QA checks passed; status=warning.)
- Issues: SPARSE_DIAGNOSTIC_CELL
- Warnings: At least one diagnostic accuracy cell count is below 5; performance metrics may be unstable.
- Errors: (none)

## References

- American Statistical Association. Statement on Statistical Significance and P-Values. 2016.
- ASA President's Task Force Statement on Statistical Significance and Replicability. 2021.
- STARD 2015 diagnostic accuracy reporting guideline.
- STARD-AI 2025 reporting guideline for AI-centered diagnostic accuracy studies.