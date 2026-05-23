# Candidate Queue

## High Priority

- Promote `.loop-memory/mimic-dialysis-cardiac-papers-20260509/run_mimic_paper_series.py` into a reusable Agenteer paper-series or dataset-adapter runner after deciding the general contract for study lists, code families, cost ceilings, and aggregate-only artifact policies.
- Add lifecycle, rerun-stability, and MedBrevia-literature artifact generation to MIMIC paper-series runs so the current `needs_methods_review` status becomes more actionable.
- Extend propensity outputs with matched-pair/robust variance, bootstrap intervals, and unmeasured-confounding sensitivity summaries before using matched contrasts in a flagship demo.
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
- Promote figure QA into higher-level readiness/benchmark checks so `analysis-manifest`, `run-inspect`, and future paper-series runs can block or downgrade blank/poorly labeled figures automatically.
- Add source-data CSV sidecars for every generated figure, not only source-column metadata.
- Add a `research review-apply` or `research study-repair-loop` command that consumes `review-adjudication.json`, chooses accepted findings by category/severity, regenerates the appropriate artifact, reruns deterministic QA, and optionally re-enters `study-critic`.
- Add method-specific manuscript sections for the highest-friction routes exposed by DeepSeek: descriptive Table 1, correlation assumptions, ANOVA/ANCOVA diagnostics/effect sizes, survival risk tables/log-rank, competing-risk uncertainty, propensity balance tables, prediction calibration/validation.
- Add dataset-level variable dictionaries/units into paper generation so reviewers stop blocking for undefined `outcome_binary`, `pred_score`, `severity`, and synthetic validation-column names.
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
