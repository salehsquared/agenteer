# Pulmonary Validation Issues

## Validation Outcome

- Packet: `.loop-memory/mimic-executed-studies-20260506/runs/0308-mimic-pulmonary-copd-respiratory-failure`
- Original runner QA: pass
- Trust-layer readiness: `needs_methods_review`
- Method QA: warning, not blocked
- Manuscript QA: pass
- New cloud cost: `$0.00`

## Scientific Issues

- The full diagnosis-code cohort has 25,835 first ICU stays, but model complete-case N is 4,679. This is only 18.1% of the cohort and requires missingness mechanism review.
- Several respiratory/lab predictors have high missingness, so model findings should be presented as complete-case associations, not full-cohort associations.
- The phenotype combines COPD and respiratory failure code families. That breadth may be useful, but it should have broad-vs-narrow sensitivity analysis before stronger claims.
- The model uses odds-ratio style mortality coefficients and should carry explicit separation diagnostics, not only successful fit output.

## Framework Issues Found And Addressed

- Method QA previously reported the full cohort as the complete-case N because it found a generic nested `n` before model-specific `models.*.n`.
- Method QA did not infer logistic-type models from odds-ratio coefficients.
- Missingness QA did not downgrade denominator shrinkage when the model used a small fraction of the cohort.

## Fix Implemented

- Method summaries now prefer model-specific sample sizes, event counts, and predictor counts when available.
- Missingness QA now detects model-denominator shrinkage against cohort size and high-missingness variables.
- Model-family detection now infers logistic models from odds-ratio/risk-ratio/hazard-ratio estimate records.

## Remaining Follow-Up

The MIMIC runner should generate denominator-shift and separation-diagnostic evidence at execution time, not rely only on post-hoc trust-layer inspection.
