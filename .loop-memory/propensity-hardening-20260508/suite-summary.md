# Propensity Hardening Suite

Ticks: 338-357
Passed expectations: 20/20

| Tick | Scenario | Method | Expected | Met | Issues | SMD after | Support |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 338 | baseline-matching | propensity-score-matching | success | yes | PROPENSITY_UNMATCHED_TREATED, PROPENSITY_RESIDUAL_IMBALANCE | 0.17511388561695693 | 0.9027777777777778 |
| 339 | baseline-weighting | propensity-score-weighting | success | yes | none | 0.07430222460471782 | 0.9027777777777778 |
| 340 | exact-site-matching | propensity-score-matching | success | yes | PROPENSITY_UNMATCHED_TREATED, PROPENSITY_RESIDUAL_IMBALANCE | 0.1381111242374072 | 0.9333333333333333 |
| 341 | two-to-one-matching | propensity-score-matching | success | yes | PROPENSITY_UNMATCHED_TREATED, PROPENSITY_RESIDUAL_IMBALANCE | 0.23631822343497919 | 0.95 |
| 342 | replacement-matching | propensity-score-matching | success | yes | PROPENSITY_UNMATCHED_TREATED, PROPENSITY_RESIDUAL_IMBALANCE | 0.15790327939564164 | 0.8933333333333333 |
| 343 | continuous-outcome | propensity-score-matching | success | yes | PROPENSITY_UNMATCHED_TREATED, PROPENSITY_RESIDUAL_IMBALANCE | 0.1481154650425281 | 0.9473684210526315 |
| 344 | missingness-stress | propensity-score-matching | success_with_warning | yes | PROPENSITY_HIGH_COMPLETE_CASE_EXCLUSION, PROPENSITY_UNMATCHED_TREATED | 0.07809241932951796 | 0.8666666666666667 |
| 345 | poor-overlap | propensity-score-matching | success_with_blocker | yes | PROPENSITY_UNMATCHED_TREATED, PROPENSITY_RESIDUAL_IMBALANCE, PROPENSITY_POOR_OVERLAP | 0.18623669383489092 | 0.7029411764705882 |
| 346 | extreme-weights | propensity-score-weighting | success_with_warning | yes | PROPENSITY_EXTREME_WEIGHTS, PROPENSITY_RESIDUAL_IMBALANCE | 0.44584338122266454 | 0.8361111111111111 |
| 347 | categorical-burden | propensity-score-matching | success | yes | PROPENSITY_UNMATCHED_TREATED, PROPENSITY_RESIDUAL_IMBALANCE | 0.1630339741415421 | 0.938 |
| 348 | wide-covariate-set | propensity-score-weighting | success | yes | none | 0.06378998629512768 | 0.9519230769230769 |
| 349 | threshold-exposure | propensity-score-matching | success | yes | PROPENSITY_UNMATCHED_TREATED, PROPENSITY_RESIDUAL_IMBALANCE, PROPENSITY_POOR_OVERLAP | 0.20846212854239615 | 0.235 |
| 350 | no-covariates-block | propensity-score-matching | expected_failure | yes | none |  |  |
| 351 | tiny-treated-block | propensity-score-matching | success_with_blocker | yes | PROPENSITY_GROUP_TOO_SMALL, PROPENSITY_MATCHED_SAMPLE_TOO_SMALL, PROPENSITY_RESIDUAL_IMBALANCE, PROPENSITY_POOR_OVERLAP | 0.9056579822940144 | 0.05 |
| 352 | att-weighting | propensity-score-weighting | success | yes | PROPENSITY_EXTREME_WEIGHTS, PROPENSITY_RESIDUAL_IMBALANCE | 0.15241491892565742 | 0.8928571428571429 |
| 353 | loose-caliper | propensity-score-matching | success | yes | PROPENSITY_UNMATCHED_TREATED, PROPENSITY_RESIDUAL_IMBALANCE | 0.21958590831206806 | 0.9027777777777778 |
| 354 | strict-caliper-unmatched | propensity-score-matching | success_with_warning | yes | PROPENSITY_UNMATCHED_TREATED, PROPENSITY_RESIDUAL_IMBALANCE | 0.12568943527102597 | 0.9027777777777778 |
| 355 | rerun-stability | propensity-score-weighting | success | yes | none | 0.07248136441206947 | 0.9285714285714286 |
| 356 | binding-mismatch-block | propensity-score-weighting | expected_failure | yes | METHOD_SELECTION_STATS_MISMATCH |  |  |
| 357 | suite-summary | propensity-score-matching | success | yes | PROPENSITY_UNMATCHED_TREATED, PROPENSITY_RESIDUAL_IMBALANCE | 0.16406296031344858 | 0.9145833333333333 |

## Notes

- Expected blockers are counted as passing when the pipeline stops with the declared safety error or issue.
- Every successful execution is expected to produce balance, propensity-score, overlap, QA, manifest, inspection, and paper artifacts.
- The suite uses synthetic data only; it tests machinery and safety gates, not real causal truth.
