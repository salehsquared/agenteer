# DeepSeek Dual-Reviewer Batch: Post-Review Repair Summary

## Scope

This batch generated 20 local research manuscripts from the statistical validation table and sent each run through two cold DeepSeek v4 Pro reviewers:

- methods reviewer
- reproducibility/reporting reviewer

Final bound review pass:

- Papers: 20
- Reviewer calls attempted: 40
- Reviewer calls succeeded: 40
- Reviewer calls failed: 0
- Estimated review cost: $1.046148
- Verdicts: 19 block, 1 revise

## What The Reviewers Added

The DeepSeek reviewers provided meaningful signal beyond deterministic QA. They repeatedly caught:

- manuscript result omissions
- unreported assumptions and diagnostics
- unbound or under-specified method choices
- weak variable definitions
- overinterpretation risk in observational comparisons
- missing uncertainty intervals
- inadequate survival and competing-risk reporting
- propensity balance and matched-sample reporting gaps
- prediction-model validation and calibration gaps

## Pipeline Repairs Made During This Batch

- Added `--panel deepseek-dual`, two distinct DeepSeek v4 Pro reviewer roles.
- Made reviewer calls parallel after budget checks.
- Hardened DeepSeek reviewer JSON parsing and normalized near-valid re-entry labels.
- Lowered DeepSeek prompt/output settings to reduce empty or overlong responses.
- Added raw-response preservation on parser failures.
- Added reviewer tests for the dual panel and near-valid JSON normalization.
- Added `stats-config.json` to trust-layer evidence discovery.
- Bound batch papers to method-selection artifacts so stats runs are not classified as ungoverned exploratory runs.
- Added stats method-map bindings for Aalen-Johansen CIF and prediction evaluation.
- Improved manuscript result extraction for prediction metrics.
- Added correlation result extraction.
- Changed tiny p-values from `p=0.0000` to `p<0.0001`.
- Prevented reviewer finding titles from becoming regenerated manuscript titles.
- Removed self-referential "no reader-facing paper" warnings from generated manuscript limitations.

## Remaining Major Blockers

The papers are better but not publication-ready. The reviewer panels are correctly blocking most of them because the validation-table papers still lack:

- true dataset-specific variable definitions and clinical units
- stronger descriptive tables in manuscripts
- method-specific assumption checks in text
- confidence intervals for several methods
- richer survival/competing-risk reporting
- calibration and validation details for prediction papers
- better propensity matched-sample narrative and balance interpretation
- actual literature context for the synthetic validation studies

## Decision

Promote the reviewer integration and trust-layer repairs. Keep this paper suite as a stress benchmark, not as a final manuscript set.

