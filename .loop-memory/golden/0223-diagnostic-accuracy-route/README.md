# Diagnostic Accuracy Golden Route

## Question

Estimate sensitivity and specificity for a waist circumference threshold as a screen for elevated HbA1c.

## Why This Route Exists

This route stresses a common medical/public-health study shape that is neither regression nor prediction-model benchmarking:

- binary reference standard
- binary screening indicator
- confusion matrix
- sensitivity/specificity
- PPV/NPV with prevalence dependence
- likelihood ratios
- sparse-cell warnings

## Current Evidence

- Method selection primary method: `diagnostic-accuracy-basic`.
- Analysis method: `diagnostic-accuracy`.
- Manifest readiness: `local_review_ready`.
- Result posture: `bound_standard_table`.
- Confusion matrix: TP 69, FP 2, TN 74, FN 15.
- Sensitivity: 0.8214.
- Specificity: 0.9737.
- PPV: 0.9718.
- NPV: 0.8315.
- Typed warning: `SPARSE_DIAGNOSTIC_CELL`.

## Benchmark Evidence

`three-route-analysis-benchmark.md` verifies this route alongside:

- `.loop-memory/golden/0216-bound-stats-route`
- `.loop-memory/golden/0212-ml-comparison-route`

The benchmark passes `--require-ready --require-multi-route` with two stats routes and one ML-comparison route.

## Interpretation Boundary

This route supports local review of diagnostic accuracy calculations on a bounded table. It does not establish clinical utility, external validation, causal interpretation, or deployment readiness.
