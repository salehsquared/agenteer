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

For standard-table statistics, `research analysis-run` composes the golden route in one bounded command while preserving intermediate artifacts: initial `modeling-plan.json`, `stats-run/`, `analysis-run-manifest.json`, and `modeling-plan-after-prior.json`. It accepts `--method-selection` and `--analysis-spec` and can enforce `--require-bound` so benchmark or paper-like runs fail unless execution is tied to upstream method/spec evidence. It is intentionally limited to the stats route for now; survey-aware paper generation remains under `paper-run`.
For `diagnostic-accuracy`, `analysis-run` also writes a concise `paper.md` and `paper-qa.json` at the analysis-run root. This diagnostic paper wrapper consumes the stats-run estimates, thresholds, intervals, QA posture, and manifest readiness; it is intended for local review and does not replace a full survey-aware or externally validated diagnostic paper workflow.

When `--table` or `--table-summary` is supplied, the planner derives row count, feature count, target class count, maximum missingness, small-sample status, and high-dimensional status. These evidence fields affect ranking: small or high-missingness tables downgrade high-capacity ML, and high missingness emits a blocking policy for diagnostics/sensitivity before interpretation.

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
- `mann-whitney`
- `chi-square`
- `fisher-exact`
- `pearson`
- `spearman`
- `linear-regression`
- `logistic-regression`
- `poisson-regression`
- `diagnostic-accuracy`

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

Each run writes `stats-run.json`, `stats-summary.json`, `estimates.csv`, `diagnostics.json`, `stats-report.md`, and `stats-qa.json` with artifact hashes. The run also declares a typed `resultPosture` such as `exploratory_standard_table`, `bound_standard_table`, `exploratory_survey_approximation`, `blocked_survey_required`, or `invalid_binding`. The report includes the posture, interpretation boundary, local-review safety header, and p-value/effect-size interpretation cautions. This runner is for standard table methods and does not replace survey-aware `paper-run --backend r-survey` when complex survey variance is required.
`diagnostic-accuracy` expects a binary reference outcome in `--outcome` and a binary test/screen indicator in `--exposure` or `--group`. If the reference or index-test columns are continuous, pass `--outcome-threshold <n>` and/or `--exposure-threshold <n>` to derive positive indicators using `>= threshold`. It reports a confusion matrix, sensitivity, specificity, PPV, NPV, likelihood ratios, accuracy, prevalence, and Wilson intervals for sensitivity/specificity/PPV/NPV. Treat PPV/NPV as prevalence-dependent and local to the analyzed table unless external validation is supplied.
Diagnostic accuracy planning follows the STARD framing: keep the reference standard and index test explicit, preserve participant/sampling context, and do not promote screening recommendations from local accuracy estimates alone. STARD-AI adds additional dataset-practice, algorithmic-bias, and fairness disclosure pressure for AI-centered diagnostic tests; Agenteer's current diagnostic route is a classical standard-table route, not a deployment-ready AI diagnostic workflow.
If `--survey` is supplied, `stats-run` refuses execution unless `--allow-survey-approximation` is also supplied. The approximation flag records a warning issue and should be treated as exploratory, not paper-ready inference.
The runner emits typed issues such as sparse expected cells, low complete-case N, possible logistic separation/extreme log-odds, regression non-convergence, and Poisson overdispersion.
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
