# Diagnostic Accuracy Study

## Local Review Safety Header

- This is a local diagnostic accuracy report generated from a standard-table stats route.
- It is not a clinical screening recommendation, deployment validation, or diagnostic replacement claim.
- PPV and NPV are prevalence-dependent and local to the analyzed table.
- Sensitivity, specificity, PPV, and NPV include Wilson binomial intervals when available.

## Research Question

How accurately does a waist circumference threshold identify elevated HbA1c from continuous values?

## Methods

- Reference standard: hba1c_pct.
- Index test: waist_cm.
- Reference positive level: >=6.5.
- Index-test positive level: >=100.
- Reference threshold: 6.5.
- Index-test threshold: 100.
- Complete-case N: 180.
- Result posture: bound_standard_table.

## Results

- True positives: 67.
- False positives: 4.
- True negatives: 98.
- False negatives: 11.
- Sensitivity: 0.8590 (0.7649, 0.9194).
- Specificity: 0.9608 (0.9035, 0.9846).
- Positive predictive value: 0.9437 (0.8639, 0.9779).
- Negative predictive value: 0.8991 (0.8283, 0.9427).
- Positive likelihood ratio: 21.90.
- Negative likelihood ratio: 0.1468.
- Prevalence in analyzed table: 0.4333.

## Interpretation

These results summarize local agreement between an index test and a reference standard in the analyzed table. They do not establish external validity, clinical utility, causal interpretation, or a recommendation to screen.
Sparse diagnostic cells were detected, so the accuracy estimates may be unstable and should be reviewed before promotion.

## Artifact Posture

- Analysis manifest readiness: local_review_ready.
- Stats QA status: see stats-qa.json.
- Issues: SPARSE_DIAGNOSTIC_CELL.
