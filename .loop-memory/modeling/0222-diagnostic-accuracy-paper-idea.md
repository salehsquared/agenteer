# Tick 0222 Research Idea - Diagnostic Accuracy Stress Case

## Question

Can a simple waist-circumference screening threshold identify elevated HbA1c in an adult screening table?

## Why This Stresses The Research Machine

The current stats route handles group tests, correlations, and regressions. The ML route handles prediction comparison. The survey paper route handles weighted NHANES-style inference.

Diagnostic accuracy is different:

- It is not primarily a regression coefficient.
- It needs a 2x2 confusion matrix.
- It reports sensitivity, specificity, PPV, NPV, likelihood ratios, prevalence, and accuracy.
- PPV/NPV depend on prevalence and must not be overgeneralized.
- Clinical threshold language can overclaim quickly.
- It needs clear intended use and intended non-use, similar to model-review cards.

## Proposed Fixture

Synthetic local adult screening table:

- `waist_high`: binary screening threshold indicator.
- `elevated_hba1c`: binary reference outcome.
- optional `age`, `sex`, `bmi` for future stratified diagnostics.

## Expected Artifacts

- `stats-run.json`
- `estimates.csv` with sensitivity/specificity/PPV/NPV/LR+/LR-/accuracy/prevalence.
- `diagnostics.json` with confusion matrix and cell counts.
- `stats-report.md` with diagnostic-limitations language.
- `stats-qa.json`
- `analysis-run-manifest.json`

## Paper Boundary

This can support a local diagnostic-performance paper draft for a synthetic screening table. It cannot support clinical adoption, external validity, causal claims, or real diagnostic accuracy without an independent validation sample and clinically accepted reference standard.

## Implementation Target

Add an executable `diagnostic-accuracy` stats method that maps from `diagnostic-accuracy-basic` in the method ontology.
