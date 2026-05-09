# Research ML Modeling

Agenteer now has a modular tabular ML layer under `research-machine/ml`. The TypeScript side owns the stable CLI/API contract, model registry, validation, artifact manifests, and comparison output. The execution side uses a generated Python bridge around scikit-learn so the platform relies on mature estimators instead of custom algorithms.

## Commands

Choose modeling strategies before execution:

```bash
agenteer research modeling-plan \
  --question "Can BMI and demographics predict elevated HbA1c?" \
  --outcome binary \
  --study-design cross_sectional \
  --table rows.csv \
  --target elevated_hba1c \
  --survey \
  --predict
```

List supported adapters:

```bash
agenteer research ml-models --task binary_classification
agenteer research ml-models --include-unavailable --json
```

Run one model:

```bash
agenteer research ml-run \
  --task binary_classification \
  --model logistic-regression \
  --data rows.csv \
  --target outcome \
  --out-dir .research/ml/binary-logistic \
  --scale \
  --cv 5
```

Compare models on a shared task/split:

```bash
agenteer research ml-compare \
  --task regression \
  --data rows.csv \
  --target target \
  --model ridge-regression \
  --model random-forest-regressor \
  --primary-metric rmse \
  --out-dir .research/ml/regression-compare
```

Inspect a persisted run:

```bash
agenteer research ml-inspect --run .research/ml/binary-logistic/ml-run.json
```

## Supported Tasks

The first production pass covers tabular:

- `binary_classification`
- `multiclass_classification`
- `regression`
- `clustering`
- `dimensionality_reduction`

Supervised tasks require `--target`. Unsupervised tasks use all columns unless `--feature` is supplied. When feature columns are explicit and accidentally include the target, the runner excludes the target and records a leakage warning.

## Modeling Decision Layer

`research modeling-plan` is the decision layer that should run after a protocol or AnalysisSpec exists and before selecting an executable backend. It combines the statistical methods ontology, ML adapter registry, and workflow policies into one ranked plan. The output separates:

- primary modeling candidates
- transparent baselines
- sensitivity analyses
- workflow policies such as complex-survey design, missingness sensitivity, causal stop-for-review, and survival required fields
- required artifacts and metrics before execution

The plan also includes `methodSelectionEvidence`: the underlying method-selection id/hash, primary method id, recommended backend/archetype, review flag, issue codes, and a `method-apply` command hint. This makes `modeling-plan` the single decision artifact that links the method ontology to ML adapter selection.
For standard-table methods that `stats-run` can execute, candidate `commandHint` values point directly to `research stats-run` and expected artifacts include `stats-run.json`, `estimates.csv`, `diagnostics.json`, `stats-report.md`, and `stats-qa.json`. Survey-shaped methods continue to route through survey-aware planning instead of standard `stats-run`.
The `routeRecommendation` field is the current analysis front door: it chooses `paper-run`, `stats-run`, `ml-run`, `method-select`, or `stop-for-review`, with the next command and required artifacts.

The planner does not treat prediction and inference as interchangeable. For example, a survey-weighted explanatory question keeps survey-design policy and design-aware statistical methods ahead of plain sklearn models; a prediction request adds sklearn model candidates with train/test and calibration requirements.
Use `--prior-run <stats-run.json|ml-run.json>` to feed the previous execution posture back into planning. A blocked survey stats run routes to a survey-aware `paper-run`, exploratory standard-table output routes back through method/spec binding, failed or invalid bindings route to repair/review, and locally validated ML output stops for stronger validation design before deployment-style claims.

Use `research analysis-manifest --run-dir <dir>` after `stats-run` or `ml-run` to create `analysis-run-manifest.json`, a compact packet record with run kind, run status, result posture, artifact completeness, readiness, hashes, and next action. Add `--require-ready` in benchmark or promotion scripts to fail unless the run is `local_review_ready`. For binary classification ML, calibration evidence is a required manifest artifact before local review readiness.
The same manifest command also accepts an `ml-compare` directory containing `comparison.json` and `model-review-card.md`; `--require-ready` then requires `baseline_comparison_ready` plus the review-card artifact.
Use `research analysis-benchmark --run-dir <dir> --run-dir <dir> --require-ready --out benchmark.json --report benchmark.md` to check multiple stats, ML, or ML-comparison directories through the same manifest readiness gate. The benchmark reports route coverage across `stats`, `ml`, and `ml-comparison`, per-route readiness, artifact completeness, interpretation-boundary checks, and an explicit narrow-versus-multi-route coverage posture. Add `--require-multi-route` in promotion scripts when a single passing route should not count as benchmark maturity. This is the preferred gate for golden stats/ML route promotion.

For standard-table statistics, `research analysis-run` composes the golden route in one bounded command while preserving intermediate artifacts: initial `modeling-plan.json`, `stats-run/`, `feasibility-trial.json`, `analysis-run-manifest.json`, and `modeling-plan-after-prior.json`. It accepts `--method-selection` and `--analysis-spec` and can enforce `--require-bound` so benchmark or paper-like runs fail unless execution is tied to upstream method/spec evidence. The feasibility trial records requested versus observed variables, complete-case fraction, typed blocker codes, and semantic plausibility issue codes so a user-suggested or agent-suggested idea is explicitly marked feasible, needs methods review, or blocked before promotion. It also accepts `--literature <literature-search.json>` to copy MedBrevia search evidence into the run and produce `literature-qa.json` / `literature-qa.md` against the generated reader-facing paper when one exists. It is intentionally limited to the stats route for now; survey-aware paper generation remains under `paper-run`.
For `diagnostic-accuracy`, `analysis-run` also writes a concise `paper.md` and `paper-qa.json` at the analysis-run root. This diagnostic paper wrapper consumes the stats-run estimates, thresholds, intervals, QA posture, and manifest readiness; it is intended for local review and does not replace a full survey-aware or externally validated diagnostic paper workflow.

When `--table` or `--table-summary` is supplied, the planner derives row count, feature count, target class count, maximum missingness, small-sample status, and high-dimensional status. These evidence fields affect ranking: small or high-missingness tables downgrade high-capacity ML, and high missingness emits a blocking policy for diagnostics/sensitivity before interpretation.

## Dataset Exploration Mode

Use `research explore` before a protocol exists, when the task is to understand a dataset, map variables, find plausible associations, and propose research questions:

```bash
agenteer research explore \
  --data ./rows.csv \
  --target hba1c \
  --out-dir ./exploration \
  --max-pairs 25 \
  --json
```

Exploration writes `exploration.json`, `exploration-report.md`, and `candidate-questions.json`. The output includes table summary, variable roles, ranked unadjusted associations, candidate research questions, QA checks, limitations, and artifact hashes. When `--target` is supplied, the report and JSON foreground target-centered associations/questions separately from the broader background correlation map.

Candidate questions are not ranked by association strength alone. Each candidate includes a `routeIntent`, `taxonomy`, `researchInterestScore`, `primaryQuestionUse`, `taxonomyEvidence`, `whyThisQuestion`, and optional `avoidAsPrimaryQuestion` reason. This separates likely duplicate/proxy relationships and expected same-domain biomarker signals from more useful public-health candidates such as plausible risk factors, social/demographic determinants, or surprising cross-domain signals. `taxonomyEvidence` records the taxonomy version, matched rule ids, matched terms, score adjustments, and rejected category candidates so the ranking can be audited and overridden. `routeIntent` separates data-quality review, explanatory association, prediction, diagnosis, causal-design review, and descriptive profiling before the question reaches modeling.

The Markdown report starts with `Recommended Next Question`, which is the concise operator view over the longer signal map and question agenda.

The JSON also includes an `explorationBurden` section and question-level `promotionStatus`. This records how many pairs were tested, target-centered pair count, multiplicity risk, high-missingness variables, sparse categorical variables, survey/design candidate columns, possible target leakage/proxy pairs, and whether each candidate is currently a `promotable_hypothesis`, `needs_methods_review`, or `blocked`. The burden object also emits `promotionClearance`: `clear_for_handoff`, `hold_for_methods_review`, or `stop`.

The posture is always hypothesis generation. Associations are unadjusted and should not be treated as confirmatory evidence. Before any paper or inference, promote one candidate question into `method-select` / `modeling-plan`, add design constraints and covariates, review missingness and sparse cells, and account for survey design or clustering when applicable.

Use `research explore-promote` to create that handoff safely:

```bash
agenteer research explore-promote \
  --exploration ./exploration/exploration.json \
  --question question_01_288de2dac7 \
  --methods-review-note "Reviewed low-N and proxy risk; handoff is for planning only." \
  --out ./exploration/handoff.json \
  --json
```

The handoff refuses blocked questions and requires a methods-review note when clearance is `hold_for_methods_review`.

Pass the handoff directly into `modeling-plan` when moving from exploration to analysis design:

```bash
agenteer research modeling-plan \
  --exploration-handoff ./exploration/handoff.json \
  --survey \
  --json
```

The planner reads the candidate question, target/outcome seed, table path when available, route intent, source exploration hash, blocker list, and review status from the handoff. Held handoffs remain visible as warnings after methods review; held handoffs without a review note and blocked handoffs stop the plan.

The handoff also includes an `analysisSpecCandidate`. This is not executable by itself. It is the pre-spec bridge that records route intent, research question, estimand boundary, source population, outcome/exposure, excluded variables pending review, design requirements, suggested model family, required pre-execution checks, and exploration provenance. Use it to author or validate a real AnalysisSpec before runner execution.

`explore-plan` is the stricter bridge when the next step should be a formal planning artifact rather than a loose handoff:

```bash
agenteer research explore-plan \
  --exploration ./exploration/exploration.json \
  --question question_01_abcd1234 \
  --dataset mimic \
  --methods-review-note "Reviewed exploratory multiplicity and proxy-variable risk; planning only." \
  --out ./exploration/formal-plan.json \
  --json
```

The output contains a formal plan, an AnalysisSpec V2 draft, validation status, blockers, warnings, required pre-execution checks, and recommended next commands. This makes exploration useful for hypothesis generation without letting unadjusted correlation search become an executable study by accident.

## Trust Layer And Continuous Benchmarks

Use the trust layer after `stats-run`, `ml-run`, `analysis-run`, `paper-run`, or manifest-backed `dataset-run`:

```bash
agenteer research method-qa --run-dir ./run --out ./run/method-qa.json --report ./run/method-qa.md
agenteer research manuscript --run-dir ./run
agenteer research study-critic --run-dir ./run --stage final --panel default --autonomy aggressive
agenteer research run-inspect --run-dir ./run --out ./run/run-inspection.json --report ./run/run-inspection.md
```

`method-qa` is intentionally methods-aware rather than only artifact-aware. It checks numerical stability, separation, sparse or overfit models, missingness, regression diagnostics, effect-size consistency, claims, semantic plausibility, survey design, and artifact completeness. It also reads `feasibility-trial.json` when present, so a blocked feasibility trial or semantic plausibility issue is visible during later run inspection instead of remaining a one-off preflight artifact.

`run-inspect` is the preferred single status command for a run. It summarizes readiness, blockers, cost, provenance, paper/manuscript paths, QA, lifecycle state, rerun stability, and next action.

`study-critic` is the true external-review gate. It builds a cold review packet from the run directory, sends it to configured reviewers, writes `review-panel.json`, adjudicates accepted/rejected findings into `review-adjudication.json`, and writes `review-response.json` plus `state-reentry.json`. The default panel is Anthropic Opus 4.7 plus DeepSeek v4 Pro for a different perspective from the main runner; `--panel strict` adds OpenAI GPT-5.4 and Gemini 3.1 Pro. Reviewer failures such as exhausted API credit are recorded as unavailable reviewer results rather than crashing the whole panel. The default autonomy is aggressive, with `--autonomy balanced` and `--autonomy conservative` available when reviewer feedback should require more human approval.

For regression pressure over the whole research machine, use:

```bash
agenteer research benchmark-suite-run --suite ./.loop-memory/golden --out-dir ./.loop-memory/benchmark-history
agenteer research benchmark-trend --history ./.loop-memory/benchmark-history
```

This continuous benchmark path scores packet completeness, methods correctness, QA pass/fail, rerun stability, cost discipline, report readability, and artifact integrity. It should run before major changes to the research-machine layer are promoted.

## Adapters

Classification adapters include logistic regression, k-nearest neighbors, SVM, decision tree, random forest, extra trees, gradient boosting, AdaBoost, and MLP. XGBoost, LightGBM, and CatBoost are registered as optional adapters and report the missing package instead of breaking the registry.

Regression adapters include linear regression, ridge, lasso, elastic net, SVR, k-nearest neighbors, decision tree, random forest, extra trees, gradient boosting, AdaBoost, and MLP. Optional XGBoost, LightGBM, and CatBoost regressors follow the same missing-dependency behavior.

Clustering adapters include k-means, mini-batch k-means, agglomerative clustering, DBSCAN, Gaussian mixture models, and spectral clustering.

Dimensionality reduction adapters include PCA, truncated SVD, NMF, and t-SNE. UMAP is registered as optional.

`research ml-run` writes a typed `resultPosture` into `ml-run.json` and renders it in text output. Supervised models with held-out or cross-validation evidence are marked `locally_validated_prediction`; clustering and dimensionality reduction remain `exploratory_unsupervised`; missing optional backends are marked `optional_dependency_missing`. These postures are deliberately conservative: local ML metrics support model comparison and debugging, not external validation, clinical deployment, causal claims, or fairness claims without additional evidence.

`research ml-compare` writes a `comparisonPosture`. A comparison is `baseline_comparison_ready` only when at least two scored models succeed and at least one transparent baseline is present; binary classification comparisons also require calibration artifacts from successful runs. Otherwise it is `insufficient_comparison`. It also writes `model-review-card.md` with intended use, intended non-use, validation boundary, leakage review, missing evidence, and ranked models.

## Classical Statistics Runner

`research stats-run` executes common table-based statistical methods through the local Python analysis runtime:

- `descriptive`
- `t-test`
- `welch-t-test`
- `paired-t-test`
- `anova`
- `ancova`
- `mann-whitney`
- `wilcoxon`
- `kruskal-wallis`
- `friedman`
- `chi-square`
- `fisher-exact`
- `mcnemar`
- `cochran-armitage-trend`
- `pearson`
- `spearman`
- `kendall`
- `partial-correlation`
- `linear-regression`
- `robust-linear-regression`
- `logistic-regression`
- `ordinal-logistic-regression`
- `multinomial-logistic-regression`
- `poisson-regression`
- `negative-binomial-regression`
- `zero-inflated-poisson`
- `zero-inflated-negative-binomial`
- `gamma-glm`
- `inverse-gaussian-glm`
- `quantile-regression`
- `penalized-linear-regression`
- `penalized-logistic-regression`
- `kaplan-meier`
- `log-rank`
- `cox-proportional-hazards`
- `stratified-cox`
- `aalen-johansen-cif`
- `recurrent-event-rate`
- `linear-mixed-model`
- `gee`
- `repeated-measures-anova`
- `overlap-weighting`
- `entropy-balancing`
- `doubly-robust-aipw`
- `difference-in-differences`
- `event-study-did`
- `interrupted-time-series`
- `regression-discontinuity`
- `instrumental-variables-2sls`
- `target-trial-emulation-spec`
- `unmeasured-confounding-sensitivity`
- `prediction-evaluation`
- `missingness-summary`
- `multiple-imputation-mice`
- `missingness-ipw`
- `complete-case-sensitivity`
- `mnar-sensitivity`
- `model-diagnostics`
- `reliability-kappa`
- `intraclass-correlation`
- `cronbach-alpha`
- `pca`
- `clustering-validation`
- `bland-altman`
- `multiple-comparison-correction`
- `power-sample-size`
- `diagnostic-accuracy`
- `propensity-score-matching`
- `propensity-score-weighting`

Methods that need a validated backend not present in the local runtime are registered but blocked rather than silently approximated:

- `fine-gray`
- `time-varying-cox`
- `generalized-mixed-model`

Example:

```bash
agenteer research stats-run \
  --method logistic-regression \
  --data ./rows.csv \
  --outcome elevated_hba1c \
  --exposure bmi \
  --covariate age \
  --covariate sex \
  --out-dir ./stats-run \
  --json
```

Each run writes `stats-run.json`, `stats-summary.json`, `estimates.csv`, `diagnostics.json`, `figures.json`, `stats-report.md`, and `stats-qa.json` with artifact hashes. Methods with natural visual checks also write PNG figures such as histograms, missingness bars, group boxplots, contingency heatmaps, scatterplots, residual plots, Kaplan-Meier curves, cumulative-incidence curves, PCA scree plots, Bland-Altman plots, and ROC curves. The figure manifest records title, caption, source columns, format, and figure QA so visual artifacts can be audited like tables. Standard-table execution also performs generic semantic plausibility checks for common clinical/data variables such as age, BMI, HbA1c, blood pressure, binary outcomes, counts, and length of stay; impossible values block execution and implausible aggregate means force methods review.

The run declares a typed `resultPosture` such as `exploratory_standard_table`, `bound_standard_table`, `exploratory_survey_approximation`, `blocked_survey_required`, or `invalid_binding`. The report includes the posture, interpretation boundary, local-review safety header, and p-value/effect-size interpretation cautions. This runner is for standard table methods and does not replace survey-aware `paper-run --backend r-survey` when complex survey variance is required.

Additional argument conventions:

- Survival methods use `--time`, `--event`, optional `--group`, optional `--strata`, and repeated `--covariate`.
- Repeated/clustered methods use `--cluster` or `--id`.
- Difference-in-differences and interrupted time series use `--post` or `--period`.
- Regression discontinuity uses `--running-variable` and `--cutoff`.
- Instrumental variables use `--instrument`.
- Penalized models use `--alpha-penalty` and `--l1-ratio`.

The runner is intentionally conservative. Successful execution does not mean publication readiness. Fine-Gray, time-varying Cox, and GLMM routes currently fail with explicit backend blockers because the local runtime lacks a validated competing-risk/GLMM backend. Penalized models run, but their QA warns that shrinkage coefficients are not classical inference and need bootstrap or post-selection methods before inferential claims.
`diagnostic-accuracy` expects a binary reference outcome in `--outcome` and a binary test/screen indicator in `--exposure` or `--group`. If the reference or index-test columns are continuous, pass `--outcome-threshold <n>` and/or `--exposure-threshold <n>` to derive positive indicators using `>= threshold`. It reports a confusion matrix, sensitivity, specificity, PPV, NPV, likelihood ratios, accuracy, prevalence, and Wilson intervals for sensitivity/specificity/PPV/NPV. Treat PPV/NPV as prevalence-dependent and local to the analyzed table unless external validation is supplied.
Diagnostic accuracy planning follows the STARD framing: keep the reference standard and index test explicit, preserve participant/sampling context, and do not promote screening recommendations from local accuracy estimates alone. STARD-AI adds additional dataset-practice, algorithmic-bias, and fairness disclosure pressure for AI-centered diagnostic tests; Agenteer's current diagnostic route is a classical standard-table route, not a deployment-ready AI diagnostic workflow.

`propensity-score-matching` and `propensity-score-weighting` are executable causal-design-review routes. Use `--exposure` or `--group` for the binary treatment/exposure, `--outcome` for the endpoint, and repeat `--covariate` for baseline confounders. Matching supports `--match-ratio`, `--caliper` in standard deviations of the logit propensity score, `--replacement`, and repeated `--exact-covariate` constraints. Weighting supports `--estimand ATE|ATT`, `--trim-threshold`, and `--no-stabilize-weights`. Both routes estimate propensity scores with a logistic treatment model and write standardized mean-difference balance diagnostics before and after adjustment.

Example:

```bash
agenteer research stats-run \
  --method propensity-score-matching \
  --data ./rows.csv \
  --outcome mortality \
  --exposure treatment \
  --covariate age \
  --covariate sex \
  --covariate severity_score \
  --exact-covariate sex \
  --match-ratio 1 \
  --caliper 0.2 \
  --out-dir ./psm-run \
  --json
```

Propensity runs write the standard stats artifacts plus `propensity-scores.csv`, `propensity-overlap.csv`, `balance.csv`, and either `matched-pairs.csv` or `weights.csv`. Their `resultPosture` is `causal_design_review_required`, not `bound_standard_table`, because a successful match or IPTW run still cannot prove a causal effect by itself. Before causal language, review the target-trial framing, treatment time zero, measured confounder set, post-treatment variable exclusion, positivity/overlap, residual imbalance, missingness, and sensitivity to unmeasured confounding.

If `--survey` is supplied, `stats-run` refuses execution unless `--allow-survey-approximation` is also supplied. The approximation flag records a warning issue and should be treated as exploratory, not paper-ready inference.
The runner emits typed issues such as sparse expected cells, low complete-case N, possible logistic separation/extreme log-odds, regression non-convergence, Poisson overdispersion, poor propensity overlap, residual imbalance, unmatched treated rows, extreme IPTW weights, and trimmed non-overlap rows.
Use `--method-selection <selection.json>` and `--analysis-spec <spec.json>` to bind a stats run back to upstream planning evidence. A method-selection mismatch, such as trying to run logistic regression from a t-test selection, fails before execution.

## Preprocessing

The bridge performs deterministic tabular preprocessing:

- numeric column detection
- median imputation for numeric features
- most-frequent imputation for categorical features
- one-hot encoding for categorical features
- optional standard scaling
- target leakage exclusion
- reproducible train/test split
- optional cross-validation

Preprocessing is fit only on training data for supervised runs through a scikit-learn pipeline.

## Metrics

Binary classification reports AUROC, AUPRC, accuracy, precision, recall/sensitivity, specificity, F1, confusion matrix, log loss, and Brier score when probabilities are available.
It also writes `calibration.csv` for binary probabilistic classifiers, with mean predicted probability and observed fraction positive by bin.

Multiclass classification reports accuracy, macro F1, weighted F1, per-class precision/recall/F1, confusion matrix, and log loss when probabilities are available.

Regression reports MAE, MSE, RMSE, R2, and adjusted R2 when feasible.

Clustering reports cluster count, noise count, silhouette, Davies-Bouldin, and Calinski-Harabasz when the fitted labels make those metrics valid.

Dimensionality reduction reports transformed shape and explained variance ratios where the estimator exposes them.

## Artifacts

Each run writes:

- `ml-config.json`
- `ml-run.json`
- `predictions.csv` for supervised models
- `calibration.csv` for binary probabilistic classification
- `transformed.csv` for clustering and dimensionality reduction
- `model.joblib` when serialization is supported and enabled
- `model-summary.json`

Each artifact is returned with a SHA-256 hash when available. Comparisons write `comparison.json` and keep each model run in a model-specific subdirectory.

## Explainability

The run output includes coefficients for linear/logistic estimators, feature importances for tree-based estimators, and permutation importance when feasible. SHAP is intentionally an extension point rather than a hard dependency; missing SHAP never blocks a run.

## Adding A Model Adapter

Add a manifest to `packages/cli/src/research-machine/ml/catalog.ts`, then add a factory branch in the Python bridge inside `packages/cli/src/research-machine/ml/runner.ts`. The adapter must declare compatible tasks, probability support, serialization support, explanation capabilities, default parameters, limitations, and optional dependency requirements. Add at least one synthetic-data test if the dependency is required by the default runtime; optional adapters should have missing-dependency tests instead.
