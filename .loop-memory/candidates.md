# Candidate Queue

## High Priority

- Promote `.loop-memory/mimic-executed-studies-20260506/run_mimic_study.py` into a reusable Agenteer `research` command with typed packet schema, tests, and configurable dataset manifest.
- Add MIMIC phenotype sensitivity contracts: include/exclude code-family variants, admission-primary diagnosis option, broad-vs-narrow phenotype comparison, and coding review notes.
- Add MIMIC packet lifecycle/index command analogous to NHANES paper lifecycle so QA review/pass status, cost, cache cleanup, and paper paths are not only in loop memory.
- Convert exploration `analysisSpecCandidate` into a full AnalysisSpec V2 artifact with validation.
- Move exploration taxonomy terms and variable-domain knowledge from heuristic code into dataset adapter/codebook metadata.
- Build an exploration-handoff-to-AnalysisSpec bridge so question/outcome/exposure/design warnings become executable spec evidence instead of only route-planning context.
- Move exploration proxy/label knowledge from hardcoded aliases into dataset adapter/codebook metadata.
- Add survey/missingness/sparse-cell burden sections to exploration reports before promoting any exploration candidate into a paper route.
- Make `modeling-plan` and `analysis-run` natively understand diagnostic accuracy route semantics.
- Add Wilson/exact interval estimates or threshold derivation to diagnostic accuracy before generating a real diagnostic paper.
- Add stricter readability heuristics beyond forbidden jargon: variable-label substitution, awkward question echo detection, and a short plain-language main finding requirement.
- Make `modeling-plan` consume backend status and prior run outcome evidence.
- Generate a complete stats-backed packet wrapper from `StatsRunResult`.
- Add AnalysisSpec V2 fields for model family, estimand, diagnostics, sensitivity analyses, and backend requirements.
- Expand executable stats methods while preserving typed diagnostics and refusal rules.
- Make ML model comparison output feed lifecycle/readiness and packet manifests.

## Medium Priority

- Add richer survey-domain semantics for subsamples and multi-cycle weights.
- Add benchmark/golden packet scoring for stats and ML routes.
- Extract backend adapters out of generated scripts into reusable runner modules.
- Add a small paper-language audit command or benchmark check that scans current packet `paper.md` files for internal framework terminology.

## Avoid For Now

- Imaging, graph, omics, and deep learning routes until tabular stats/ML routes have packet-grade lifecycle support.
- Broad unbounded MIMIC event-table reads. The corrected execution run proved many bounded diagnosis/cohort packets; the next MIMIC work should improve runner architecture and phenotype sensitivity, not spend more by default.
