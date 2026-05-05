import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { assertMlModelTaskCompatible, defaultPrimaryMetric, getMlModelManifest } from "./catalog.js";
import {
  mlComparisonRequestSchema,
  mlRunRequestSchema,
  mlTaskTypeSchema,
  type MlArtifact,
  type MlComparisonRequest,
  type MlComparisonResult,
  type MlMetricDirection,
  type MlResultPosture,
  type MlRunRequest,
  type MlRunResult,
  type MlTaskType,
} from "./schemas.js";

const execFileAsync = promisify(execFile);

export async function runMlModel(rawRequest: MlRunRequest): Promise<MlRunResult> {
  const request = normalizeRunRequest(rawRequest);
  assertMlModelTaskCompatible(request.modelId, request.task);
  const outDir = path.resolve(request.outDir);
  await mkdir(outDir, { recursive: true });
  const configPath = path.join(outDir, "ml-config.json");
  const scriptPath = path.join(await mkdtemp(path.join(os.tmpdir(), "agenteer-ml-")), "sklearn_bridge.py");
  await writeFile(scriptPath, sklearnBridgeSource());
  await writeFile(configPath, `${JSON.stringify(request, null, 2)}\n`);
  const python = resolvePython(request.python);
  try {
    const { stdout, stderr } = await execFileAsync(python, [scriptPath, configPath], {
      maxBuffer: 1024 * 1024 * 24,
      cwd: process.cwd(),
      env: { ...process.env, PYTHONWARNINGS: "ignore" },
    });
    const parsed = JSON.parse(stdout) as MlRunResult;
    const withArtifacts = await attachHashes(withMlPosture({ ...parsed, warnings: stderr.trim() ? [...parsed.warnings, stderr.trim()] : parsed.warnings }, request));
    await writeFile(path.join(outDir, "ml-run.json"), `${JSON.stringify(withArtifacts, null, 2)}\n`);
    return withArtifacts;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const stderr = typeof (error as { stderr?: unknown }).stderr === "string" ? (error as { stderr: string }).stderr : "";
    const failed: MlRunResult = {
      schemaVersion: 1,
      runId: `mlrun_${Date.now()}`,
      task: request.task,
      modelId: request.modelId,
      status: "failed",
      primaryMetric: request.primaryMetric ?? defaultPrimaryMetric(request.task).metric,
      primaryMetricDirection: defaultPrimaryMetric(request.task).direction,
      metrics: {},
      warnings: [],
      errors: [stderr.trim() || message],
      resultPosture: deriveMlResultPosture({
        schemaVersion: 1,
        runId: `mlrun_${Date.now()}`,
        task: request.task,
        modelId: request.modelId,
        status: "failed",
        primaryMetric: request.primaryMetric ?? defaultPrimaryMetric(request.task).metric,
        primaryMetricDirection: defaultPrimaryMetric(request.task).direction,
        metrics: {},
        warnings: [],
        errors: [stderr.trim() || message],
        preprocessing: {
          rowCount: 0,
          featureCount: 0,
          numericFeatures: [],
          categoricalFeatures: [],
          excludedColumns: [],
        },
        evaluation: { split: "full_data" },
        explanation: { shapAvailable: false, shapStatus: "not_supported" },
        artifacts: [{ kind: "config", path: configPath }],
        outDir,
      }, request),
      preprocessing: {
        rowCount: 0,
        featureCount: 0,
        numericFeatures: [],
        categoricalFeatures: [],
        excludedColumns: [],
      },
      evaluation: { split: "full_data" },
      explanation: { shapAvailable: false, shapStatus: "not_supported" },
      artifacts: [{ kind: "config", path: configPath }],
      outDir,
    };
    await writeFile(path.join(outDir, "ml-run.json"), `${JSON.stringify(failed, null, 2)}\n`);
    return failed;
  }
}

export async function compareMlModels(rawRequest: MlComparisonRequest): Promise<MlComparisonResult> {
  const defaults = {
    schemaVersion: 1,
    testSize: 0.25,
    validationSize: 0,
    seed: 17,
    scale: false,
    cvFolds: 0,
    saveModel: true,
    permutationImportance: true,
    maxPermutationRows: 500,
    params: {},
  };
  const request = mlComparisonRequestSchema.parse({ ...defaults, ...rawRequest });
  const outDir = path.resolve(request.outDir);
  await mkdir(outDir, { recursive: true });
  const primary = primaryMetricFor(request.task, request.primaryMetric);
  const warnings: string[] = [];
  const runs: MlRunResult[] = [];
  for (const modelId of request.modelIds) {
    const modelOut = path.join(outDir, modelId.replace(/[^a-zA-Z0-9._-]/g, "_"));
    try {
      const run = await runMlModel({ ...request, modelId, outDir: modelOut });
      runs.push(run);
      if (run.primaryMetric !== primary.metric) {
        warnings.push(`Model ${modelId} reported primary metric ${run.primaryMetric ?? "(none)"} instead of requested ${primary.metric}.`);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const manifest = getMlModelManifest(modelId);
      const optionalMissing = manifest.availability === "optional_missing" || message.includes("requires optional package");
      runs.push({
        schemaVersion: 1,
        runId: `mlrun_${Date.now()}_${modelId}`,
        task: request.task,
        modelId,
        status: "failed",
        primaryMetric: primary.metric,
        primaryMetricDirection: primary.direction,
        metrics: {},
        warnings: [],
        errors: [message],
        resultPosture: {
          status: optionalMissing ? "optional_dependency_missing" : "failed",
          label: optionalMissing ? "Optional dependency missing" : "Failed ML candidate",
          interpretationBoundary: "This candidate did not produce a usable local ML result.",
          supports: ["adapter availability diagnosis", "candidate rejection"],
          cannotSupport: ["prediction performance comparison", "model promotion"],
          nextAction: optionalMissing ? "Install the optional backend or remove this candidate from the comparison." : "Repair the candidate configuration and rerun before comparison.",
        },
        preprocessing: {
          rowCount: 0,
          featureCount: 0,
          numericFeatures: [],
          categoricalFeatures: [],
          excludedColumns: [],
        },
        evaluation: { split: "full_data" },
        explanation: { shapAvailable: false, shapStatus: "not_supported" },
        artifacts: [],
        outDir: modelOut,
      });
    }
  }
  const ranked = runs
    .map(run => ({
      modelId: run.modelId,
      status: run.status,
      score: numericMetric(run.metrics[primary.metric]),
      warnings: run.warnings,
      errors: run.errors,
      outDir: run.outDir,
    }))
    .sort((a, b) => {
      if (a.score === null && b.score === null) return a.modelId.localeCompare(b.modelId);
      if (a.score === null) return 1;
      if (b.score === null) return -1;
      return primary.direction === "maximize" ? b.score - a.score : a.score - b.score;
    })
    .map((item, index) => ({ rank: index + 1, ...item }));
  const comparisonPosture = deriveMlComparisonPosture(request.task, ranked, runs);
  const reviewCardPath = path.join(outDir, "model-review-card.md");
  const reviewCard = deriveMlReviewCard(request.task, comparisonPosture, reviewCardPath, runs);
  const result: MlComparisonResult = {
    schemaVersion: 1,
    comparisonId: `mlcmp_${Date.now()}`,
    task: request.task,
    primaryMetric: primary.metric,
    primaryMetricDirection: primary.direction,
    comparisonPosture,
    reviewCard,
    ranked,
    runs,
    warnings,
    outDir,
  };
  await writeFile(reviewCardPath, renderMlReviewCard(result), "utf-8");
  await writeFile(path.join(outDir, "comparison.json"), `${JSON.stringify(result, null, 2)}\n`);
  return result;
}

export function normalizeRunRequest(rawRequest: MlRunRequest): MlRunRequest {
  const defaults = {
    schemaVersion: 1,
    testSize: 0.25,
    validationSize: 0,
    seed: 17,
    scale: false,
    cvFolds: 0,
    saveModel: true,
    permutationImportance: true,
    maxPermutationRows: 500,
    params: {},
  };
  const parsed = mlRunRequestSchema.parse({ ...defaults, ...rawRequest });
  const primary = primaryMetricFor(parsed.task, parsed.primaryMetric);
  return { ...parsed, dataPath: path.resolve(parsed.dataPath), outDir: path.resolve(parsed.outDir), primaryMetric: primary.metric };
}

export function primaryMetricFor(task: MlTaskType, requested?: string): { metric: string; direction: MlMetricDirection } {
  const defaults = defaultPrimaryMetric(task);
  const metric = requested ?? defaults.metric;
  const minimize = new Set(["rmse", "mse", "mae", "log_loss", "brier_score", "davies_bouldin"]);
  return { metric, direction: minimize.has(metric) ? "minimize" : "maximize" };
}

export async function inspectMlRun(runPath: string): Promise<MlRunResult> {
  const parsed = JSON.parse(await readFile(path.resolve(runPath), "utf-8"));
  return parsed as MlRunResult;
}

export function validateMlTask(value: string): MlTaskType {
  return mlTaskTypeSchema.parse(value);
}

export function getMlModelForTask(modelId: string, task: MlTaskType) {
  return assertMlModelTaskCompatible(modelId, task);
}

export function getMlModel(modelId: string) {
  return getMlModelManifest(modelId);
}

function resolvePython(explicit?: string): string {
  if (explicit) return explicit;
  return process.env.AGENTEER_RESEARCH_PYTHON ?? path.resolve(".research-runtime/python/bin/python");
}

function numericMetric(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function deriveMlComparisonPosture(
  task: MlTaskType,
  ranked: MlComparisonResult["ranked"],
  runs: MlRunResult[],
): NonNullable<MlComparisonResult["comparisonPosture"]> {
  const succeededWithScores = ranked.filter(item => item.status === "succeeded" && item.score !== null);
  const hasBaseline = runs.some(run => run.status === "succeeded" && baselineModelIds(task).has(run.modelId));
  const binaryCalibrationReady = task !== "binary_classification" || runs
    .filter(run => run.status === "succeeded")
    .every(run => run.artifacts.some(artifact => artifact.kind === "calibration"));
  if (succeededWithScores.length >= 2 && hasBaseline && binaryCalibrationReady) {
    return {
      status: "baseline_comparison_ready",
      label: "Baseline comparison ready",
      interpretationBoundary: "This comparison supports local model-selection review against at least one transparent baseline, not external validation or deployment.",
      supports: ["local model ranking", "baseline comparison", task === "binary_classification" ? "calibration artifact review" : "primary metric review"],
      cannotSupport: ["external validity", "clinical deployment", "causal claims", "fairness claims without subgroup evidence"],
      nextAction: "Review calibration, subgroup performance, leakage risk, and validation design before promotion.",
    };
  }
  return {
    status: "insufficient_comparison",
    label: "Insufficient model comparison",
    interpretationBoundary: "This comparison does not yet provide enough successful baseline evidence for model-selection review.",
    supports: ["debugging adapter availability", "identifying failed candidates"],
    cannotSupport: ["model promotion", "strong model ranking claims", "deployment-style claims"],
    nextAction: "Include at least one transparent baseline and at least two successful scored models; require calibration artifacts for binary classification.",
  };
}

function baselineModelIds(task: MlTaskType): Set<string> {
  if (task === "binary_classification" || task === "multiclass_classification") return new Set(["logistic-regression", "decision-tree-classifier"]);
  if (task === "regression") return new Set(["linear-regression", "ridge-regression"]);
  if (task === "clustering") return new Set(["k-means"]);
  if (task === "dimensionality_reduction") return new Set(["pca"]);
  return new Set();
}

function deriveMlReviewCard(
  task: MlTaskType,
  comparisonPosture: NonNullable<MlComparisonResult["comparisonPosture"]>,
  reviewCardPath: string,
  runs: MlRunResult[],
): NonNullable<MlComparisonResult["reviewCard"]> {
  const missingEvidence: string[] = [];
  if (comparisonPosture.status !== "baseline_comparison_ready") missingEvidence.push("baseline comparison readiness");
  if (task === "binary_classification" && !runs.some(run => run.artifacts.some(artifact => artifact.kind === "calibration"))) missingEvidence.push("binary calibration artifact");
  missingEvidence.push("subgroup performance evidence");
  missingEvidence.push("external or temporal validation evidence");
  return {
    path: reviewCardPath,
    status: missingEvidence.length <= 2 && comparisonPosture.status === "baseline_comparison_ready" ? "local_review_ready" : "needs_review",
    intendedUse: "Local model-selection review for tabular research analysis using the declared split and metrics.",
    intendedNonUse: ["clinical deployment", "causal inference", "external-validity claims", "fairness claims without subgroup evidence"],
    validationBoundary: "Internal split/CV evidence only; external or temporal validation is not established.",
    subgroupEvidence: "not_assessed",
    leakageReview: "Pipeline excludes the target column from features and fits preprocessing on training data; temporal, site, patient-level, and label-leakage risks still require study-specific review.",
    missingEvidence,
  };
}

function renderMlReviewCard(result: MlComparisonResult): string {
  const card = result.reviewCard;
  return [
    "# ML Model Review Card",
    "",
    `- Comparison: ${result.comparisonId}`,
    `- Task: ${result.task}`,
    `- Primary metric: ${result.primaryMetric} (${result.primaryMetricDirection})`,
    `- Comparison posture: ${result.comparisonPosture?.status ?? "missing"}`,
    `- Review status: ${card?.status ?? "missing"}`,
    "",
    "## Intended Use",
    "",
    card?.intendedUse ?? "Not declared.",
    "",
    "## Intended Non-Use",
    "",
    ...(card?.intendedNonUse.map(item => `- ${item}`) ?? ["- Not declared."]),
    "",
    "## Validation Boundary",
    "",
    card?.validationBoundary ?? "Not declared.",
    "",
    "## Leakage Review",
    "",
    card?.leakageReview ?? "Not declared.",
    "",
    "## Missing Evidence",
    "",
    ...(card?.missingEvidence.map(item => `- ${item}`) ?? ["- Not declared."]),
    "",
    "## Ranked Models",
    "",
    "| rank | model | status | score |",
    "|---:|---|---|---:|",
    ...result.ranked.map(item => `| ${item.rank} | ${item.modelId} | ${item.status} | ${item.score ?? ""} |`),
    "",
  ].join("\n");
}

async function attachHashes(result: MlRunResult): Promise<MlRunResult> {
  const artifacts: MlArtifact[] = [];
  for (const artifact of result.artifacts) {
    try {
      const raw = await readFile(artifact.path);
      artifacts.push({ ...artifact, sha256: createHash("sha256").update(raw).digest("hex") });
    } catch {
      artifacts.push(artifact);
    }
  }
  return { ...result, artifacts };
}

function withMlPosture(result: MlRunResult, request: MlRunRequest): MlRunResult {
  return { ...result, resultPosture: deriveMlResultPosture(result, request) };
}

function deriveMlResultPosture(result: MlRunResult, request: MlRunRequest): MlResultPosture {
  const errors = result.errors.join("\n");
  if (result.status === "failed") {
    const optionalMissing = errors.includes("requires optional package") || errors.includes("Optional dependency") || errors.includes("No module named");
    return {
      status: optionalMissing ? "optional_dependency_missing" : "failed",
      label: optionalMissing ? "Optional dependency missing" : "Failed ML execution",
      interpretationBoundary: optionalMissing
        ? "This adapter was requested but its optional package is unavailable in the selected Python environment."
        : "This run failed before producing a locally reviewable model result.",
      supports: optionalMissing ? ["backend availability diagnosis", "candidate rejection"] : ["failure attribution", "repair planning"],
      cannotSupport: ["model performance", "prediction use", "research conclusions"],
      nextAction: optionalMissing ? "Install the optional package or choose an available baseline model." : "Resolve errors and rerun the model.",
    };
  }
  if (request.task === "clustering" || request.task === "dimensionality_reduction") {
    return {
      status: "exploratory_unsupervised",
      label: "Exploratory unsupervised result",
      interpretationBoundary: "This run may support subgroup or representation exploration, but it does not validate an outcome prediction or inferential claim.",
      supports: ["exploratory subgrouping", "representation inspection", "feature-space diagnostics"],
      cannotSupport: ["outcome prediction performance", "causal claims", "clinical deployment"],
      nextAction: "Review stability, domain plausibility, and downstream validation before treating clusters/components as study findings.",
    };
  }
  const hasPrimaryMetric = Boolean(result.primaryMetric && typeof result.metrics[result.primaryMetric] === "number");
  const hasHeldOutRows = typeof result.preprocessing.testRows === "number" && result.preprocessing.testRows > 0;
  const hasCrossValidation = Boolean(result.evaluation.crossValidation);
  const locallyValidated = result.status === "succeeded" && hasPrimaryMetric && (hasHeldOutRows || hasCrossValidation);
  if (locallyValidated) {
    const supports = ["local model comparison", "held-out performance review", "leakage-aware preprocessing audit"];
    if (request.task === "binary_classification" && typeof result.metrics.calibration_bins === "number") supports.push("basic calibration review");
    return {
      status: "locally_validated_prediction",
      label: "Locally validated prediction result",
      interpretationBoundary: "This run supports local predictive-performance review on the declared split, not external validation or clinical deployment.",
      supports,
      cannotSupport: ["external validity", "clinical deployment", "causal claims", "unmeasured fairness claims"],
      nextAction: "Compare against baselines, review calibration/leakage, and require external or temporal validation before deployment-style claims.",
    };
  }
  return {
    status: "exploratory_prediction",
    label: "Exploratory prediction result",
    interpretationBoundary: "This run produced a predictive model but lacks enough validation evidence for local performance review.",
    supports: ["debugging model configuration", "rough feasibility exploration"],
    cannotSupport: ["model promotion", "performance claims", "clinical deployment"],
    nextAction: "Add held-out evaluation, cross-validation, calibration where applicable, and baseline comparison before promotion.",
  };
}

function sklearnBridgeSource(): string {
  return String.raw`#!/usr/bin/env python3
import hashlib
import importlib.util
import json
import math
import os
import sys
import traceback
from pathlib import Path

import joblib
import numpy as np
import pandas as pd

from sklearn.compose import ColumnTransformer
from sklearn.calibration import calibration_curve
from sklearn.impute import SimpleImputer
from sklearn.inspection import permutation_importance
from sklearn.metrics import (
    accuracy_score,
    average_precision_score,
    brier_score_loss,
    calinski_harabasz_score,
    confusion_matrix,
    davies_bouldin_score,
    f1_score,
    log_loss,
    mean_absolute_error,
    mean_squared_error,
    precision_recall_fscore_support,
    precision_score,
    r2_score,
    recall_score,
    roc_auc_score,
    silhouette_score,
)
from sklearn.model_selection import StratifiedKFold, KFold, cross_val_score, train_test_split
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import LabelEncoder, OneHotEncoder, StandardScaler


def one_hot_encoder():
    try:
        return OneHotEncoder(handle_unknown="ignore", sparse_output=False)
    except TypeError:
        return OneHotEncoder(handle_unknown="ignore", sparse=False)


def load_frame(data_path):
    suffix = Path(data_path).suffix.lower()
    if suffix == ".csv":
        return pd.read_csv(data_path)
    if suffix in [".json", ".jsonl"]:
        try:
            return pd.read_json(data_path, lines=suffix == ".jsonl")
        except ValueError:
            return pd.DataFrame(json.loads(Path(data_path).read_text()))
    if suffix in [".parquet", ".pq"]:
        return pd.read_parquet(data_path)
    raise ValueError(f"Unsupported data file extension '{suffix}'. Use csv, json, jsonl, or parquet.")


def estimator_for(model_id, task, params, seed):
    from sklearn.cluster import AgglomerativeClustering, DBSCAN, KMeans, MiniBatchKMeans, SpectralClustering
    from sklearn.decomposition import NMF, PCA, TruncatedSVD
    from sklearn.ensemble import (
        AdaBoostClassifier,
        AdaBoostRegressor,
        ExtraTreesClassifier,
        ExtraTreesRegressor,
        GradientBoostingClassifier,
        GradientBoostingRegressor,
        RandomForestClassifier,
        RandomForestRegressor,
    )
    from sklearn.linear_model import ElasticNet, Lasso, LinearRegression, LogisticRegression, Ridge
    from sklearn.manifold import TSNE
    from sklearn.mixture import GaussianMixture
    from sklearn.neighbors import KNeighborsClassifier, KNeighborsRegressor
    from sklearn.neural_network import MLPClassifier, MLPRegressor
    from sklearn.svm import SVC, SVR
    from sklearn.tree import DecisionTreeClassifier, DecisionTreeRegressor

    def merged(defaults):
        return {**defaults, **params}

    factories = {
        "logistic-regression": lambda: LogisticRegression(**merged({"max_iter": 1000, "solver": "lbfgs"})),
        "knn-classifier": lambda: KNeighborsClassifier(**merged({"n_neighbors": 5})),
        "svm-classifier": lambda: SVC(**merged({"probability": True, "kernel": "rbf"})),
        "decision-tree-classifier": lambda: DecisionTreeClassifier(**merged({"min_samples_leaf": 2, "random_state": seed})),
        "random-forest-classifier": lambda: RandomForestClassifier(**merged({"n_estimators": 100, "n_jobs": 1, "random_state": seed})),
        "extra-trees-classifier": lambda: ExtraTreesClassifier(**merged({"n_estimators": 100, "n_jobs": 1, "random_state": seed})),
        "gradient-boosting-classifier": lambda: GradientBoostingClassifier(**merged({"random_state": seed})),
        "adaboost-classifier": lambda: AdaBoostClassifier(**merged({"n_estimators": 50, "random_state": seed})),
        "mlp-classifier": lambda: MLPClassifier(**merged({"hidden_layer_sizes": (64,), "max_iter": 500, "early_stopping": True, "random_state": seed})),
        "linear-regression": lambda: LinearRegression(**params),
        "ridge-regression": lambda: Ridge(**merged({"alpha": 1.0, "random_state": seed})),
        "lasso-regression": lambda: Lasso(**merged({"alpha": 0.01, "max_iter": 5000, "random_state": seed})),
        "elastic-net-regression": lambda: ElasticNet(**merged({"alpha": 0.01, "l1_ratio": 0.5, "max_iter": 5000, "random_state": seed})),
        "svr": lambda: SVR(**params),
        "knn-regressor": lambda: KNeighborsRegressor(**merged({"n_neighbors": 5})),
        "decision-tree-regressor": lambda: DecisionTreeRegressor(**merged({"min_samples_leaf": 2, "random_state": seed})),
        "random-forest-regressor": lambda: RandomForestRegressor(**merged({"n_estimators": 100, "n_jobs": 1, "random_state": seed})),
        "extra-trees-regressor": lambda: ExtraTreesRegressor(**merged({"n_estimators": 100, "n_jobs": 1, "random_state": seed})),
        "gradient-boosting-regressor": lambda: GradientBoostingRegressor(**merged({"random_state": seed})),
        "adaboost-regressor": lambda: AdaBoostRegressor(**merged({"n_estimators": 50, "random_state": seed})),
        "mlp-regressor": lambda: MLPRegressor(**merged({"hidden_layer_sizes": (64,), "max_iter": 500, "early_stopping": True, "random_state": seed})),
        "k-means": lambda: KMeans(**merged({"n_clusters": 3, "n_init": 10, "random_state": seed})),
        "mini-batch-k-means": lambda: MiniBatchKMeans(**merged({"n_clusters": 3, "n_init": 10, "random_state": seed})),
        "agglomerative-clustering": lambda: AgglomerativeClustering(**merged({"n_clusters": 3})),
        "dbscan": lambda: DBSCAN(**merged({"eps": 0.5, "min_samples": 5})),
        "gaussian-mixture": lambda: GaussianMixture(**merged({"n_components": 3, "random_state": seed})),
        "spectral-clustering": lambda: SpectralClustering(**merged({"n_clusters": 3, "assign_labels": "kmeans", "random_state": seed})),
        "pca": lambda: PCA(**merged({"n_components": 2, "random_state": seed})),
        "truncated-svd": lambda: TruncatedSVD(**merged({"n_components": 2, "random_state": seed})),
        "nmf": lambda: NMF(**merged({"n_components": 2, "init": "nndsvda", "max_iter": 500, "random_state": seed})),
        "tsne": lambda: TSNE(**merged({"n_components": 2, "random_state": seed, "init": "random", "learning_rate": "auto"})),
    }
    optional = {
        "xgboost-classifier": ("xgboost", "XGBClassifier", {"eval_metric": "logloss", "random_state": seed}),
        "xgboost-regressor": ("xgboost", "XGBRegressor", {"random_state": seed}),
        "lightgbm-classifier": ("lightgbm", "LGBMClassifier", {"random_state": seed}),
        "lightgbm-regressor": ("lightgbm", "LGBMRegressor", {"random_state": seed}),
        "catboost-classifier": ("catboost", "CatBoostClassifier", {"verbose": False, "random_state": seed}),
        "catboost-regressor": ("catboost", "CatBoostRegressor", {"verbose": False, "random_state": seed}),
        "umap": ("umap", "UMAP", {"random_state": seed, "n_components": 2}),
    }
    if model_id in optional:
        module_name, class_name, defaults = optional[model_id]
        if importlib.util.find_spec(module_name) is None:
            raise RuntimeError(f"Optional dependency '{module_name}' is not installed for model '{model_id}'.")
        module = __import__(module_name, fromlist=[class_name])
        cls = getattr(module, class_name)
        return cls(**{**defaults, **params})
    if model_id not in factories:
        raise ValueError(f"Unknown model id: {model_id}")
    return factories[model_id]()


def prepare_features(df, target, requested_features, task):
    warnings = []
    excluded = []
    if df.empty:
        raise ValueError("Input dataset has zero rows.")
    if len(set(df.columns)) != len(df.columns):
        raise ValueError("Input dataset has duplicate column names.")
    if task in ["binary_classification", "multiclass_classification", "regression"]:
        if not target:
            raise ValueError(f"Task '{task}' requires --target.")
        if target not in df.columns:
            raise ValueError(f"Target column '{target}' not found. Available columns: {', '.join(map(str, df.columns))}")
    if requested_features:
        missing = [name for name in requested_features if name not in df.columns]
        if missing:
            raise ValueError(f"Requested feature columns not found: {', '.join(missing)}")
        if target and target in requested_features:
            excluded.append(target)
            warnings.append(f"Excluded target column '{target}' from features to prevent leakage.")
        feature_cols = [name for name in requested_features if name != target]
    else:
        feature_cols = [c for c in df.columns if c != target]
    if target and target in feature_cols:
        feature_cols = [c for c in feature_cols if c != target]
        excluded.append(target)
        warnings.append(f"Excluded target column '{target}' from features to prevent leakage.")
    if not feature_cols:
        raise ValueError("No feature columns remain after target exclusion.")
    X = df[feature_cols].copy()
    numeric_features = [c for c in feature_cols if pd.api.types.is_numeric_dtype(X[c])]
    categorical_features = [c for c in feature_cols if c not in numeric_features]
    return X, feature_cols, numeric_features, categorical_features, excluded, warnings


def build_preprocessor(numeric_features, categorical_features, scale):
    transformers = []
    numeric_steps = [("imputer", SimpleImputer(strategy="median"))]
    if scale:
        numeric_steps.append(("scaler", StandardScaler()))
    transformers.append(("numeric", Pipeline(numeric_steps), numeric_features))
    if categorical_features:
        transformers.append(("categorical", Pipeline([
            ("imputer", SimpleImputer(strategy="most_frequent")),
            ("onehot", one_hot_encoder()),
        ]), categorical_features))
    return ColumnTransformer(transformers=transformers, remainder="drop", verbose_feature_names_out=False)


def transformed_feature_names(preprocessor, fallback):
    try:
        return [str(x) for x in preprocessor.get_feature_names_out()]
    except Exception:
        return list(fallback)


def encode_target(y, task):
    if task in ["binary_classification", "multiclass_classification"]:
        enc = LabelEncoder()
        values = enc.fit_transform(y.astype(str))
        return values, [str(x) for x in enc.classes_]
    return y.astype(float).to_numpy(), None


def has_enough_strata(y):
    values, counts = np.unique(y, return_counts=True)
    return len(values) > 1 and counts.min() >= 2


def classification_metrics(task, y_true, y_pred, proba, classes):
    metrics = {}
    labels = list(range(len(classes))) if classes else sorted(set(list(y_true) + list(y_pred)))
    metrics["accuracy"] = float(accuracy_score(y_true, y_pred))
    metrics["confusion_matrix"] = confusion_matrix(y_true, y_pred, labels=labels).tolist()
    if task == "binary_classification":
        metrics["precision"] = float(precision_score(y_true, y_pred, zero_division=0))
        metrics["recall"] = float(recall_score(y_true, y_pred, zero_division=0))
        metrics["sensitivity"] = metrics["recall"]
        metrics["f1"] = float(f1_score(y_true, y_pred, zero_division=0))
        cm = confusion_matrix(y_true, y_pred, labels=[0, 1])
        if cm.shape == (2, 2):
            tn, fp, fn, tp = cm.ravel()
            metrics["specificity"] = float(tn / (tn + fp)) if (tn + fp) else None
        if proba is not None:
            score = proba[:, 1] if len(proba.shape) == 2 and proba.shape[1] > 1 else proba
            try:
                metrics["auroc"] = float(roc_auc_score(y_true, score))
            except Exception:
                metrics["auroc"] = None
            try:
                metrics["auprc"] = float(average_precision_score(y_true, score))
            except Exception:
                metrics["auprc"] = None
            try:
                metrics["log_loss"] = float(log_loss(y_true, proba))
            except Exception:
                metrics["log_loss"] = None
            try:
                metrics["brier_score"] = float(brier_score_loss(y_true, score))
            except Exception:
                metrics["brier_score"] = None
    else:
        metrics["macro_f1"] = float(f1_score(y_true, y_pred, average="macro", zero_division=0))
        metrics["weighted_f1"] = float(f1_score(y_true, y_pred, average="weighted", zero_division=0))
        precision, recall, f1, support = precision_recall_fscore_support(y_true, y_pred, labels=labels, zero_division=0)
        metrics["per_class"] = [
            {"class": classes[i] if classes and i < len(classes) else str(label), "precision": float(precision[i]), "recall": float(recall[i]), "f1": float(f1[i]), "support": int(support[i])}
            for i, label in enumerate(labels)
        ]
        if proba is not None:
            try:
                metrics["log_loss"] = float(log_loss(y_true, proba))
            except Exception:
                metrics["log_loss"] = None
    return metrics


def regression_metrics(y_true, y_pred, feature_count):
    mse = float(mean_squared_error(y_true, y_pred))
    r2 = float(r2_score(y_true, y_pred))
    n = len(y_true)
    adjusted = None
    if n > feature_count + 1:
        adjusted = float(1 - (1 - r2) * (n - 1) / (n - feature_count - 1))
    return {
        "mae": float(mean_absolute_error(y_true, y_pred)),
        "mse": mse,
        "rmse": float(math.sqrt(mse)),
        "r2": r2,
        "adjusted_r2": adjusted,
    }


def cluster_metrics(Xt, labels):
    labels = np.asarray(labels)
    unique = set(labels.tolist())
    if -1 in unique and len(unique) == 1:
        return {"cluster_count": 0, "noise_count": int((labels == -1).sum()), "silhouette": None, "davies_bouldin": None, "calinski_harabasz": None}
    cluster_count = len(unique - {-1})
    metrics = {"cluster_count": int(cluster_count), "noise_count": int((labels == -1).sum())}
    if cluster_count >= 2 and len(labels) > cluster_count:
        try:
            metrics["silhouette"] = float(silhouette_score(Xt, labels))
        except Exception:
            metrics["silhouette"] = None
        try:
            metrics["davies_bouldin"] = float(davies_bouldin_score(Xt, labels))
        except Exception:
            metrics["davies_bouldin"] = None
        try:
            metrics["calinski_harabasz"] = float(calinski_harabasz_score(Xt, labels))
        except Exception:
            metrics["calinski_harabasz"] = None
    else:
        metrics.update({"silhouette": None, "davies_bouldin": None, "calinski_harabasz": None})
    return metrics


def top_pairs(names, values, limit=25):
    arr = np.asarray(values)
    if arr.ndim > 1:
        arr = np.mean(np.abs(arr), axis=0)
    pairs = []
    for name, value in zip(names, arr.tolist()):
        if value is None:
            continue
        try:
            fv = float(value)
        except Exception:
            continue
        if math.isfinite(fv):
            pairs.append({"feature": str(name), "value": fv})
    pairs.sort(key=lambda item: abs(item["value"]), reverse=True)
    return pairs[:limit]


def write_csv(path, frame):
    frame.to_csv(path, index=False)


def artifact(kind, path):
    return {"kind": kind, "path": str(Path(path).resolve())}


def run_supervised(config, df):
    task = config["task"]
    out_dir = Path(config["outDir"]).resolve()
    warnings = []
    X, feature_cols, numeric_features, categorical_features, excluded, prep_warnings = prepare_features(df, config.get("target"), config.get("features", []), task)
    warnings.extend(prep_warnings)
    y, classes = encode_target(df[config["target"]], task)
    if task == "binary_classification" and len(np.unique(y)) != 2:
        raise ValueError("binary_classification requires exactly two target classes.")
    if task == "multiclass_classification" and len(np.unique(y)) < 3:
        raise ValueError("multiclass_classification requires at least three target classes.")
    preprocessor = build_preprocessor(numeric_features, categorical_features, config.get("scale", False))
    estimator = estimator_for(config["modelId"], task, config.get("params", {}), int(config.get("seed", 17)))
    pipeline = Pipeline([("preprocessor", preprocessor), ("model", estimator)])
    stratify = y if task in ["binary_classification", "multiclass_classification"] and has_enough_strata(y) else None
    if stratify is None and task in ["binary_classification", "multiclass_classification"]:
        warnings.append("Train/test split was not stratified because at least one class had fewer than two rows.")
    X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=float(config.get("testSize", 0.25)), random_state=int(config.get("seed", 17)), stratify=stratify)
    pipeline.fit(X_train, y_train)
    y_pred = pipeline.predict(X_test)
    proba = pipeline.predict_proba(X_test) if hasattr(pipeline, "predict_proba") else None
    if task in ["binary_classification", "multiclass_classification"]:
        metrics = classification_metrics(task, y_test, y_pred, proba, classes)
    else:
        metrics = regression_metrics(y_test, y_pred, len(feature_cols))
    cv_result = None
    cv_folds = int(config.get("cvFolds", 0) or 0)
    if cv_folds >= 2:
        try:
            if task in ["binary_classification", "multiclass_classification"]:
                cv = StratifiedKFold(n_splits=cv_folds, shuffle=True, random_state=int(config.get("seed", 17)))
                scoring = "roc_auc" if task == "binary_classification" else "f1_macro"
            else:
                cv = KFold(n_splits=cv_folds, shuffle=True, random_state=int(config.get("seed", 17)))
                scoring = "neg_root_mean_squared_error"
            scores = cross_val_score(pipeline, X, y, cv=cv, scoring=scoring)
            cv_result = {"folds": cv_folds, "scoring": scoring, "scores": [float(x) for x in scores], "mean": float(np.mean(scores)), "std": float(np.std(scores))}
        except Exception as exc:
            warnings.append(f"Cross-validation failed: {exc}")
    feature_names = transformed_feature_names(pipeline.named_steps["preprocessor"], feature_cols)
    model = pipeline.named_steps["model"]
    explanation = {"shapAvailable": importlib.util.find_spec("shap") is not None, "shapStatus": "not_requested"}
    if hasattr(model, "coef_"):
        explanation["coefficients"] = top_pairs(feature_names, model.coef_)
    if hasattr(model, "feature_importances_"):
        explanation["featureImportances"] = top_pairs(feature_names, model.feature_importances_)
    if config.get("permutationImportance", True):
        try:
            sample_X = X_test.iloc[: int(config.get("maxPermutationRows", 500))]
            sample_y = y_test[: len(sample_X)]
            scoring = "roc_auc" if task == "binary_classification" else ("f1_macro" if task == "multiclass_classification" else "neg_root_mean_squared_error")
            pi = permutation_importance(pipeline, sample_X, sample_y, n_repeats=5, random_state=int(config.get("seed", 17)), scoring=scoring)
            explanation["permutationImportance"] = [
                {"feature": str(name), "value": float(mean), "std": float(std)}
                for name, mean, std in sorted(zip(feature_cols, pi.importances_mean, pi.importances_std), key=lambda x: abs(float(x[1])), reverse=True)[:25]
            ]
        except Exception as exc:
            warnings.append(f"Permutation importance failed: {exc}")
    predictions_path = out_dir / "predictions.csv"
    pred_frame = pd.DataFrame({"y_true": y_test, "y_pred": y_pred})
    calibration_path = None
    if proba is not None:
        if len(proba.shape) == 2:
            for idx in range(proba.shape[1]):
                col = classes[idx] if classes and idx < len(classes) else str(idx)
                pred_frame[f"proba_{col}"] = proba[:, idx]
            if task == "binary_classification" and proba.shape[1] > 1:
                try:
                    score = proba[:, 1]
                    fraction_positive, mean_predicted = calibration_curve(y_test, score, n_bins=min(10, max(2, len(y_test) // 10)), strategy="uniform")
                    calibration_path = out_dir / "calibration.csv"
                    pd.DataFrame({
                        "mean_predicted_probability": mean_predicted,
                        "fraction_positive": fraction_positive,
                    }).to_csv(calibration_path, index=False)
                    metrics["calibration_bins"] = int(len(fraction_positive))
                except Exception as exc:
                    warnings.append(f"Calibration curve failed: {exc}")
        else:
            pred_frame["score"] = proba
    write_csv(predictions_path, pred_frame)
    artifacts = [artifact("predictions", predictions_path)]
    if calibration_path is not None:
        artifacts.append(artifact("calibration", calibration_path))
    if config.get("saveModel", True):
        model_path = out_dir / "model.joblib"
        joblib.dump(pipeline, model_path)
        artifacts.append(artifact("model", model_path))
    summary_path = out_dir / "model-summary.json"
    primary = config.get("primaryMetric")
    result = {
        "schemaVersion": 1,
        "runId": f"mlrun_{hashlib.sha1((config['modelId'] + str(out_dir)).encode()).hexdigest()[:12]}",
        "task": task,
        "modelId": config["modelId"],
        "status": "succeeded",
        "primaryMetric": primary,
        "primaryMetricDirection": "minimize" if primary in ["rmse", "mse", "mae", "log_loss", "brier_score"] else "maximize",
        "metrics": metrics,
        "warnings": warnings,
        "errors": [],
        "preprocessing": {
            "rowCount": int(len(df)),
            "featureCount": int(len(feature_cols)),
            "numericFeatures": [str(x) for x in numeric_features],
            "categoricalFeatures": [str(x) for x in categorical_features],
            "excludedColumns": [str(x) for x in excluded],
            "trainRows": int(len(X_train)),
            "testRows": int(len(X_test)),
        },
        "evaluation": {"split": "cross_validation" if cv_result else "train_test", "crossValidation": cv_result},
        "explanation": explanation,
        "artifacts": artifacts,
        "outDir": str(out_dir),
    }
    Path(summary_path).write_text(json.dumps({"model": config["modelId"], "task": task, "metrics": metrics, "explanation": explanation}, indent=2) + "\n")
    result["artifacts"].append(artifact("summary", summary_path))
    return result


def run_unsupervised(config, df):
    task = config["task"]
    out_dir = Path(config["outDir"]).resolve()
    warnings = []
    X, feature_cols, numeric_features, categorical_features, excluded, prep_warnings = prepare_features(df, None, config.get("features", []), task)
    warnings.extend(prep_warnings)
    preprocessor = build_preprocessor(numeric_features, categorical_features, config.get("scale", True))
    Xt = preprocessor.fit_transform(X)
    if hasattr(Xt, "toarray"):
        Xt = Xt.toarray()
    estimator = estimator_for(config["modelId"], task, config.get("params", {}), int(config.get("seed", 17)))
    artifacts = []
    metrics = {}
    transformed_path = out_dir / "transformed.csv"
    if task == "clustering":
        if hasattr(estimator, "fit_predict"):
            labels = estimator.fit_predict(Xt)
        else:
            estimator.fit(Xt)
            labels = estimator.predict(Xt)
        metrics = cluster_metrics(Xt, labels)
        frame = pd.DataFrame({"cluster": labels})
        write_csv(transformed_path, frame)
    else:
        if config["modelId"] == "nmf":
            Xt = np.maximum(Xt, 0)
        if config["modelId"] == "tsne":
            params = estimator.get_params()
            if params.get("perplexity", 30) >= len(Xt):
                estimator.set_params(perplexity=max(1, min(30, len(Xt) - 1)))
                warnings.append("Reduced t-SNE perplexity because it must be smaller than row count.")
        if hasattr(estimator, "fit_transform"):
            transformed = estimator.fit_transform(Xt)
        else:
            estimator.fit(Xt)
            transformed = estimator.transform(Xt)
        metrics = {"transformed_rows": int(transformed.shape[0]), "transformed_columns": int(transformed.shape[1])}
        if hasattr(estimator, "explained_variance_ratio_"):
            ratios = [float(x) for x in estimator.explained_variance_ratio_.tolist()]
            metrics["explained_variance_ratio"] = ratios
            metrics["explained_variance_ratio_sum"] = float(sum(ratios))
        frame = pd.DataFrame(transformed, columns=[f"component_{i+1}" for i in range(transformed.shape[1])])
        write_csv(transformed_path, frame)
    artifacts.append(artifact("transformed", transformed_path))
    if config.get("saveModel", True) and config["modelId"] != "tsne":
        model_path = out_dir / "model.joblib"
        joblib.dump({"preprocessor": preprocessor, "model": estimator}, model_path)
        artifacts.append(artifact("model", model_path))
    summary_path = out_dir / "model-summary.json"
    primary = config.get("primaryMetric")
    result = {
        "schemaVersion": 1,
        "runId": f"mlrun_{hashlib.sha1((config['modelId'] + str(out_dir)).encode()).hexdigest()[:12]}",
        "task": task,
        "modelId": config["modelId"],
        "status": "succeeded",
        "primaryMetric": primary,
        "primaryMetricDirection": "minimize" if primary in ["davies_bouldin"] else "maximize",
        "metrics": metrics,
        "warnings": warnings,
        "errors": [],
        "preprocessing": {
            "rowCount": int(len(df)),
            "featureCount": int(len(feature_cols)),
            "numericFeatures": [str(x) for x in numeric_features],
            "categoricalFeatures": [str(x) for x in categorical_features],
            "excludedColumns": [str(x) for x in excluded],
            "transformedShape": [int(Xt.shape[0]), int(Xt.shape[1])],
        },
        "evaluation": {"split": "full_data"},
        "explanation": {"shapAvailable": importlib.util.find_spec("shap") is not None, "shapStatus": "not_supported"},
        "artifacts": artifacts,
        "outDir": str(out_dir),
    }
    Path(summary_path).write_text(json.dumps({"model": config["modelId"], "task": task, "metrics": metrics}, indent=2) + "\n")
    result["artifacts"].append(artifact("summary", summary_path))
    return result


def main():
    config = json.loads(Path(sys.argv[1]).read_text())
    out_dir = Path(config["outDir"]).resolve()
    out_dir.mkdir(parents=True, exist_ok=True)
    df = load_frame(config["dataPath"])
    if config["task"] in ["binary_classification", "multiclass_classification", "regression"]:
        result = run_supervised(config, df)
    else:
        result = run_unsupervised(config, df)
    print(json.dumps(result, allow_nan=False))


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        try:
            failed_config = json.loads(Path(sys.argv[1]).read_text())
        except Exception:
            failed_config = {}
        print(json.dumps({
            "schemaVersion": 1,
            "runId": "mlrun_failed",
            "task": failed_config.get("task", "binary_classification"),
            "modelId": failed_config.get("modelId", "unknown"),
            "status": "failed",
            "primaryMetric": failed_config.get("primaryMetric"),
            "primaryMetricDirection": None,
            "metrics": {},
            "warnings": [],
            "errors": [str(exc), traceback.format_exc()],
            "preprocessing": {"rowCount": 0, "featureCount": 0, "numericFeatures": [], "categoricalFeatures": [], "excludedColumns": []},
            "evaluation": {"split": "full_data"},
            "explanation": {"shapAvailable": False, "shapStatus": "not_supported"},
            "artifacts": [],
            "outDir": str(Path(failed_config.get("outDir", ".")).resolve()),
        }))
        sys.exit(0)
`;
}
