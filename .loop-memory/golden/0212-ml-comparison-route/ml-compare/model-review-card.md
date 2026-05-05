# ML Model Review Card

- Comparison: mlcmp_1778013871885
- Task: binary_classification
- Primary metric: auroc (maximize)
- Comparison posture: baseline_comparison_ready
- Review status: local_review_ready

## Intended Use

Local model-selection review for tabular research analysis using the declared split and metrics.

## Intended Non-Use

- clinical deployment
- causal inference
- external-validity claims
- fairness claims without subgroup evidence

## Validation Boundary

Internal split/CV evidence only; external or temporal validation is not established.

## Leakage Review

Pipeline excludes the target column from features and fits preprocessing on training data; temporal, site, patient-level, and label-leakage risks still require study-specific review.

## Missing Evidence

- subgroup performance evidence
- external or temporal validation evidence

## Ranked Models

| rank | model | status | score |
|---:|---|---|---:|
| 1 | logistic-regression | succeeded | 1 |
| 2 | decision-tree-classifier | succeeded | 1 |
