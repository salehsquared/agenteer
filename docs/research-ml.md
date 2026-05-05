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

The planner does not treat prediction and inference as interchangeable. For example, a survey-weighted explanatory question keeps survey-design policy and design-aware statistical methods ahead of plain sklearn models; a prediction request adds sklearn model candidates with train/test and calibration requirements.

When `--table` or `--table-summary` is supplied, the planner derives row count, feature count, target class count, maximum missingness, small-sample status, and high-dimensional status. These evidence fields affect ranking: small or high-missingness tables downgrade high-capacity ML, and high missingness emits a blocking policy for diagnostics/sensitivity before interpretation.

## Adapters

Classification adapters include logistic regression, k-nearest neighbors, SVM, decision tree, random forest, extra trees, gradient boosting, AdaBoost, and MLP. XGBoost, LightGBM, and CatBoost are registered as optional adapters and report the missing package instead of breaking the registry.

Regression adapters include linear regression, ridge, lasso, elastic net, SVR, k-nearest neighbors, decision tree, random forest, extra trees, gradient boosting, AdaBoost, and MLP. Optional XGBoost, LightGBM, and CatBoost regressors follow the same missing-dependency behavior.

Clustering adapters include k-means, mini-batch k-means, agglomerative clustering, DBSCAN, Gaussian mixture models, and spectral clustering.

Dimensionality reduction adapters include PCA, truncated SVD, NMF, and t-SNE. UMAP is registered as optional.

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

Multiclass classification reports accuracy, macro F1, weighted F1, per-class precision/recall/F1, confusion matrix, and log loss when probabilities are available.

Regression reports MAE, MSE, RMSE, R2, and adjusted R2 when feasible.

Clustering reports cluster count, noise count, silhouette, Davies-Bouldin, and Calinski-Harabasz when the fitted labels make those metrics valid.

Dimensionality reduction reports transformed shape and explained variance ratios where the estimator exposes them.

## Artifacts

Each run writes:

- `ml-config.json`
- `ml-run.json`
- `predictions.csv` for supervised models
- `transformed.csv` for clustering and dimensionality reduction
- `model.joblib` when serialization is supported and enabled
- `model-summary.json`

Each artifact is returned with a SHA-256 hash when available. Comparisons write `comparison.json` and keep each model run in a model-specific subdirectory.

## Explainability

The run output includes coefficients for linear/logistic estimators, feature importances for tree-based estimators, and permutation importance when feasible. SHAP is intentionally an extension point rather than a hard dependency; missing SHAP never blocks a run.

## Adding A Model Adapter

Add a manifest to `packages/cli/src/research-machine/ml/catalog.ts`, then add a factory branch in the Python bridge inside `packages/cli/src/research-machine/ml/runner.ts`. The adapter must declare compatible tasks, probability support, serialization support, explanation capabilities, default parameters, limitations, and optional dependency requirements. Add at least one synthetic-data test if the dependency is required by the default runtime; optional adapters should have missing-dependency tests instead.
