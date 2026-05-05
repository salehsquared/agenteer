# Analysis Benchmark Report

## Summary

- Status: pass
- Summary: 4/4 analysis manifests passed local-review-ready checks; coverage=multi_route_ready.
- Route coverage: multi_route_ready
- Next action: Golden analysis routes satisfy the requested benchmark gate across multiple route kinds.

## Checks

| check | status | detail |
|---|---|---|
| artifact-completeness | pass | All manifests have required artifacts. |
| readiness-gate | pass | 4/4 manifests passed local-review-ready. |
| route-coverage | pass | Coverage posture is multi_route_ready; stats=3, ml=0, ml-comparison=1. |
| interpretation-boundaries | pass | Every manifest carries an interpretation boundary. |

## Manifests

| kind | readiness | posture | artifacts | run dir |
|---|---|---|---|---|
| stats | local_review_ready | bound_standard_table | pass | /Users/saleh/TechProjects/agenteer/.loop-memory/golden/0216-bound-stats-route/analysis-run/stats-run |
| stats | local_review_ready | bound_standard_table | pass | /Users/saleh/TechProjects/agenteer/.loop-memory/golden/0223-diagnostic-accuracy-route/analysis-run/stats-run |
| stats | local_review_ready | bound_standard_table | pass | /Users/saleh/TechProjects/agenteer/.loop-memory/golden/0229-diagnostic-threshold-route/analysis-run/stats-run |
| ml-comparison | local_review_ready | baseline_comparison_ready | pass | /Users/saleh/TechProjects/agenteer/.loop-memory/golden/0212-ml-comparison-route/ml-compare |

## Interpretation

This benchmark is a local readiness gate over analysis manifests. It does not certify external validity, clinical utility, causal inference, or deployment readiness.