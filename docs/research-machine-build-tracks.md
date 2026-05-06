# Research Machine Build Tracks

This document records the intended build direction for turning the Agenteer researcher from a CLI prototype into a reusable public-health and medical research machine. The target is not code volume for its own sake. The target is a set of subsystems that make generated studies more correct, inspectable, reproducible, and easier to review.

## 1. Execution Core

Agenteer needs a stable execution substrate before the researcher can scale. Every run should move through typed task envelopes, bounded runner contracts, artifact manifests, lifecycle states, evidence receipts, repeatability checks, and sandbox/cost policy. The current `paper-run` path is the first golden example: it starts from an AnalysisSpec, executes locally, records task lifecycle, hashes artifacts, validates capabilities, exports interop views, and surfaces lifecycle status.

Next work:

- make runner contracts backend-neutral
- require declared input/output schemas for every executable node
- add reusable failure classes for missing artifact, hash drift, rerun instability, invalid backend, and policy breach
- add local sandbox profiles before any cloud execution
- make lifecycle state the primary reviewer entry point

## 2. Analysis Engines

Analysis should be delegated to backend adapters with declared capabilities and limitations. The first supported engines are:

- `duckdb-polars`: fast local data preparation and joins
- `python-linearized`: development fallback for weighted linear/logistic survey models
- `r-survey`: preferred complex-survey inference backend using R `survey::svydesign` and `survey::svyglm`
- `sklearn`: modular tabular ML adapters for classification, regression, clustering, and dimensionality reduction

The current local runtime lives outside git under `.research-runtime/` and is ignored. Backend readiness is inspected with `agenteer research backend-status`. Tabular ML is exposed through `agenteer research ml-models`, `ml-run`, `ml-compare`, and `ml-inspect`; the detailed adapter contract is documented in [research-ml.md](./research-ml.md).

Next work:

- add backend capability manifests and fixture conformance tests
- move table loading and model fitting behind a TypeScript adapter registry
- add R `gtsummary` table generation for paper-ready model summaries
- add sensitivity-analysis runners
- later add causal inference, Stan/PyMC, and survival engines only when a study archetype requires them

## 3. AnalysisSpec V2

AnalysisSpec should be the universal executable contract before code generation or runner execution. It must describe the estimand, target population, variables, survey design, model family, missingness policy, diagnostics, sensitivity analyses, backend requirements, expected artifacts, failure policy, and allowed inference language.

The current AnalysisSpec path already gates survey fields, subsample-weight rationale, binary thresholds, and local review safety language. V2 should make these rules schema-level rather than command-specific.

Manifest-backed dataset execution extends AnalysisSpec v2 with `datasetAccess` and `phenotype` sections. `datasetAccess` declares required tables, join keys, maximum bytes/cost boundary, PHI/PII risk, and row-level cache policy. `phenotype` records diagnosis-code cohort families, expected dictionary terms, external coding verification references, sensitivity analyses, and coding review status. This is the minimum contract for EHR/claims-style studies where the cohort definition itself is part of the method.

Next work:

- define `AnalysisSpecV2` with explicit model, estimand, backend, and artifact sections
- add migration from current specs to V2
- make `paper-run` refuse execution when V2 method policy is incomplete
- encode cross-sectional, causal, and actionability limits as machine-readable claim policy
- attach versioned validation reports to every packet

## 4. Study Archetype Library

The researcher should know study shapes before it knows variables. Each archetype should declare required fields, compatible datasets, supported engines, expected artifacts, QA gates, and common failure modes.

The current archetype set includes `ehr-diagnosis-cohort-outcome` for MIMIC/claims/user-table style diagnosis-code cohorts with binary or continuous hospital outcomes. Its gates cover phenotype evidence, required table presence, join-key availability, model artifact completeness, cost receipts, aggregate-only output policy, sparse cells, low events-per-predictor, and conservative clinical language.

Initial archetypes:

- cross-sectional association
- survey-weighted prevalence or threshold estimate
- continuous biomarker model
- binary outcome model
- subgroup/domain analysis
- high-missingness/subsample analysis
- diagnostic accuracy
- prediction model
- target-trial-emulation sketch

Next work:

- make archetype selection explicit in planner output
- use archetypes to generate AnalysisSpec skeletons
- add adversarial fixtures for each archetype
- block studies whose requested archetype has no verified backend

## 5. Dataset Adapter System

Datasets should be pluggable. An adapter exposes registry, variables, codebooks, survey weights, domains, known caveats, download/cache policy, and validation rules. NHANES is first because it stresses survey design, subsamples, multi-domain joins, and clinical interpretation.

Initial adapter priorities:

- NHANES local/public-cache adapter
- BRFSS public survey adapter
- user-uploaded CSV/Parquet adapter
- MIMIC-style relational clinical table adapter
- claims-style longitudinal adapter

Next work:

- formalize the adapter interface
- separate local cache discovery from dataset semantics
- include codebook provenance and variable-level caveats
- add cache manifests and source download receipts
- make multi-cycle weight construction explicit and blocked until verified

MIMIC is now a partial first-class adapter rather than a design-only placeholder. It exposes ICU stay/outcome, diagnosis, severity-score, first-day lab/vital, and admission identifiers; records de-identification and row-level cache risks; and supports bounded manifest-backed execution through `research dataset-spec` and `research dataset-run`. NHANES remains the stronger survey adapter for public-health survey inference.

## 6. QA / Benchmark Harness

The platform should be evaluated against golden packets, not only unit tests. Golden cases should declare expected artifacts, expected failures, method requirements, rerun stability thresholds, paper QA rubrics, claim QA, and share/export policy.

Current progress includes a formal golden packet, paper QA, manifest verification, lifecycle summaries, rerun stability, and real NHANES paper packets.

Next work:

- promote the R-survey NHANES packet into a formal benchmark case
- add five archetype benchmark packets
- score runner correctness, artifact completeness, claim safety, and reproducibility separately
- store score trends over time
- make benchmark failures emit typed repair plans

## 7. Planner / Product Layer

The LLM should eventually choose the study design, dataset adapter, variables, model family, backend, validation plan, repair plan, and stopping point. Until that is safe, the orchestrating agent remains the controller.

Next work:

- make planner output select archetype, dataset adapter, backend, and AnalysisSpec V2 skeleton
- require plan criticism before execution
- add stop-for-human-review rules for methodological uncertainty
- expose a local reviewer workspace over packets, lifecycle, QA, diffs, and generated papers
- keep MedBrevia as read-only pressure until packet consumption is explicitly approved

## Immediate Build Sequence

1. Use `r-survey` as the preferred backend for NHANES survey inference.
2. Promote the newest R-survey packet into the golden benchmark suite.
3. Extract backend adapters out of the monolithic `paper-run` generated Python script.
4. Define AnalysisSpec V2 and migrate current real packets.
5. Add archetype manifests and require an archetype before execution.
6. Add dataset adapter manifests for NHANES local cache and public CDC download/caching.
7. Turn benchmark scoring into a top-level quality signal for Agenteer changes.

## Implemented Research Machine Layer

The first production-grade layer now lives under `packages/cli/src/research-machine/`. It is intentionally separate from the older `research.ts` command surface so the next phase can extract execution internals without destabilizing existing packet generation.

The layer adds:

- `AnalysisSpecV2`, a strict hashable contract covering estimand, population, variables, survey design, missingness, model, sensitivity analyses, backend requirements, artifact expectations, claim policy, failure policy, and execution bounds.
- Backend manifests for DuckDB/Polars, Python/statsmodels, Python linearized survey fallback, R survey, R gtsummary, and future causal/Bayesian/prediction engines.
- Dataset adapter manifests for NHANES, BRFSS, SEER, MIMIC-style EHR data, claims-style longitudinal data, user tables, and synthetic fixtures.
- Study archetype manifests for cross-sectional association, survey prevalence, continuous biomarker models, binary outcomes, subgroup/domain analysis, high-missingness/subsample work, diagnostic accuracy, prediction, target-trial sketches, interrupted time series, and difference-in-differences.
- A comprehensive analysis-method ontology spanning descriptive statistics, group tests, correlations, linear/logistic/count/GLM models, survival, repeated-measures, multilevel, causal inference, diagnostic/prognostic methods, prediction/ML, validation, dimensionality reduction, clustering, time series, meta-analysis, Bayesian analysis, nonparametric/resampling, missing data, sensitivity/subgroup analyses, effect sizes, reliability/agreement, questionnaire methods, epidemiology, trials, health economics, spatial analysis, network analysis, NLP, qualitative/mixed methods, mediation/SEM, high-dimensional data, image/signal methods, power, diagnostics, and multiple comparisons.
- A deterministic method selector that scores methods from the question, outcome type, study design, data structure, dataset, survey/repeated/clustered/time-to-event/high-dimensional/text/image/spatial/network flags, and requested goal.
- `ExecutionContract`, which joins an AnalysisSpec V2, backend, dataset adapter, archetype, runner command, policy envelope, typed outputs, and repeatability requirements.
- A machine benchmark evaluator that checks required artifacts, paper QA, lifecycle readiness, spec-governed runner provenance, and rerun stability.
- A deterministic planner that selects dataset, archetype, backend, stop-for-review posture, command sequence, and risks.

Primary CLI commands:

```bash
agenteer research machine-status --data-root /path/to/nhanes --python /path/to/python --rscript /path/to/Rscript --json
agenteer research spec-v2 --spec ./analysis-spec.json --out ./analysis-spec-v2.json --json
agenteer research archetypes --json
agenteer research methods-catalog --json
agenteer research method-select --question "In NHANES adults, is BMI associated with elevated HbA1c odds?" --dataset nhanes --outcome binary --survey --out ./method-selection.json --json
agenteer research method-apply --spec ./analysis-spec-v2.json --selection ./method-selection.json --out ./analysis-spec-v2-method.json --json
agenteer research method-validate --spec ./analysis-spec-v2-method.json --method binary-logistic-regression --json
agenteer research dataset-adapter --dataset nhanes --data-root /path/to/nhanes --json
agenteer research dataset-spec --study ./study.json --dataset-dir .loop-memory/datasets/mimiciv-3-1 --out ./analysis-spec-v2.json --json
agenteer research dataset-run --analysis-spec ./analysis-spec-v2.json --dataset-dir .loop-memory/datasets/mimiciv-3-1 --out-dir ./dataset-run --max-usd 1 --json
agenteer research dataset-run-index --run-root ./runs --out ./dataset-run-index.json --report ./dataset-run-index.md --json
agenteer research machine-plan --question "In NHANES adults, is BMI associated with fasting glucose?" --json
agenteer research execution-contract --spec ./analysis-spec-v2.json --backend r-survey --data-root /path/to/nhanes --json
agenteer research machine-benchmark --packet ./paper --spec ./analysis-spec-v2.json --out ./machine-benchmark.json --json
```

The selector is intentionally conservative. Methods can be `executable`, `contract-ready`, `design-only`, or `blocked`. A method may be selected for planning while still requiring human review or a verified backend before execution. This prevents the platform from pretending that specialized analyses such as Fine-Gray competing risks, target-trial emulation, SEM, Bayesian models, or economic modeling are executable just because they are represented in the ontology.

The next engineering step is to make `paper-run` consume `AnalysisSpecV2`, method selections, and `ExecutionContract` directly, then move the embedded Python/R runner generation into backend adapter modules.
