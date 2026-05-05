# Candidate Queue

## High Priority

- Make `modeling-plan` and `analysis-run` natively understand diagnostic accuracy route semantics.
- Add Wilson/exact interval estimates or threshold derivation to diagnostic accuracy before generating a real diagnostic paper.
- Make `modeling-plan` consume backend status and prior run outcome evidence.
- Generate a complete stats-backed packet wrapper from `StatsRunResult`.
- Add AnalysisSpec V2 fields for model family, estimand, diagnostics, sensitivity analyses, and backend requirements.
- Expand executable stats methods while preserving typed diagnostics and refusal rules.
- Make ML model comparison output feed lifecycle/readiness and packet manifests.

## Medium Priority

- Add richer survey-domain semantics for subsamples and multi-cycle weights.
- Add benchmark/golden packet scoring for stats and ML routes.
- Extract backend adapters out of generated scripts into reusable runner modules.

## Avoid For Now

- Imaging, graph, omics, and deep learning routes until tabular stats/ML routes have packet-grade lifecycle support.
