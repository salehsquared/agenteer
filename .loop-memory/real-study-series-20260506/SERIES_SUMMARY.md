# Five-Specialty Real Study Series Summary

Ticks: 0328-0337.

## Overall Result

Validated five real MIMIC-IV executed study packets across five specialties with Agenteer's trust layer. No new raw-data reads were performed; new cloud cost was `$0.00`.

All five packets have reader-facing manuscripts that pass manuscript QA after the tick 0329 manuscript-language fix. All five packets remain `needs_methods_review`, which is the correct outcome: the original runner-level QA pass indicates execution success, not publication-grade methods readiness.

## Study Outcomes

| Specialty | Packet | Original QA | Trust Readiness | Main Issues |
| --- | --- | --- | --- | --- |
| Cardiology | `0307-mimic-cardiology-heart-failure-icu` | pass | needs methods review | missing collinearity and influence diagnostics |
| Pulmonary | `0308-mimic-pulmonary-copd-respiratory-failure` | pass | needs methods review | model denominator is 18.1% of cohort, missing separation/collinearity/influence diagnostics |
| Nephrology | `0310-mimic-renal-aki-icu-mortality` | pass | needs methods review | unprofiled KDIGO-derived tables, diagnosis-code timing, missing regression diagnostics |
| Neurology | `0314-mimic-neuro-stroke-icu-mortality` | pass | needs methods review | prediction-language gap, missing calibration/validation evidence, missing regression diagnostics |
| Hepatology | `0317-mimic-liver-cirrhosis-icu` | pass | needs methods review | unprofiled coagulation-derived table, phenotype breadth, missing regression diagnostics |

## Agenteer Improvements Made During Series

- Manuscript generation now translates internal readiness enums into reader-facing language.
- Manuscripts now prefer study titles found in run artifacts.
- Manuscript result bullets now avoid arbitrary nested statuses such as ICD verification statuses.
- Method summaries now prefer model-specific denominators, event counts, and predictor counts.
- Missingness QA now downgrades model complete-case denominator shrinkage against cohort size.
- Model-family detection now infers logistic routes from odds-ratio/risk-ratio/hazard-ratio estimates.
- Runner `qa.json` string warnings now feed method-QA issue evidence.
- Semantic-plausibility QA now recognizes unprofiled required tables and diagnosis-code timing concerns.

## Cross-Study Lessons

- Runner `pass` means execution succeeded. It should not be presented as methods readiness.
- MIMIC packets need a first-class lifecycle/index command analogous to NHANES paper lifecycle.
- Derived-table profiling should become a typed artifact before these studies are promoted.
- Prediction wording must trigger calibration/validation requirements even outside ML-comparison routes.
- The most useful next implementation is a reusable MIMIC/dataset runner contract that emits diagnostics during execution rather than relying on post-hoc trust inspection.

## Suggested Next Implementation

Promote the loop-memory MIMIC runner into an Agenteer command or general dataset-run interface with:

- typed study manifest;
- phenotype sensitivity contract;
- derived-table profile artifact;
- model diagnostics bundle including separation, collinearity, influence, denominator shift, and missingness sensitivity;
- packet lifecycle/index output;
- cost receipt and cache cleanup receipt;
- manuscript generation and trust-layer validation in one bounded path.
