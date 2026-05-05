import { z } from "zod";
import { listMlModels, defaultPrimaryMetric } from "./ml/catalog.js";
import type { MlTaskType } from "./ml/schemas.js";
import {
  dataStructureSchema,
  outcomeTypeSchema,
  studyDesignSchema,
  type AnalysisMethod,
  type BackendId,
  type DataStructure,
  type MachineIssue,
  type MethodSelectionRequest,
  type OutcomeType,
  type StudyDesign,
} from "./schemas.js";
import { selectAnalysisMethods } from "./methods.js";

export const modelingGoalSchema = z.enum([
  "describe",
  "compare_groups",
  "associate",
  "predict",
  "classify",
  "diagnose",
  "causal",
  "discover",
  "reduce_dimensions",
]);
export type ModelingGoal = z.infer<typeof modelingGoalSchema>;

export const modelingDecisionRequestSchema = z.object({
  question: z.string().min(1),
  goal: modelingGoalSchema.optional(),
  outcomeType: outcomeTypeSchema.optional(),
  studyDesign: studyDesignSchema.optional(),
  dataStructures: z.array(dataStructureSchema).default([]),
  surveyDesign: z.boolean().default(false),
  repeatedMeasures: z.boolean().default(false),
  clustered: z.boolean().default(false),
  timeToEvent: z.boolean().default(false),
  highDimensional: z.boolean().default(false),
  text: z.boolean().default(false),
  image: z.boolean().default(false),
  spatial: z.boolean().default(false),
  network: z.boolean().default(false),
  rowCount: z.number().int().positive().optional(),
  featureCount: z.number().int().nonnegative().optional(),
  classCount: z.number().int().positive().optional(),
  target: z.string().min(1).optional(),
  tableSummary: z.object({
    rowCount: z.number().int().nonnegative(),
    columnCount: z.number().int().nonnegative(),
    columns: z.array(z.object({
      name: z.string().min(1),
      inferredType: z.enum(["number", "string", "boolean", "empty", "mixed", "unknown"]).optional(),
      nonMissingRows: z.number().int().nonnegative(),
      missingFraction: z.number().min(0).max(1),
      sampleValues: z.array(z.string()).default([]),
    })),
  }).optional(),
  highMissingness: z.boolean().default(false),
  smallSample: z.boolean().default(false),
  requiresInference: z.boolean().default(true),
  requiresPrediction: z.boolean().default(false),
  maxCandidates: z.number().int().positive().max(30).default(12),
});
export type ModelingDecisionRequest = z.infer<typeof modelingDecisionRequestSchema>;

export interface ModelingCandidate {
  id: string;
  rank: number;
  tier: "primary" | "baseline" | "sensitivity" | "exploratory" | "not_recommended";
  source: "statistical-method" | "ml-adapter" | "workflow-policy";
  label: string;
  family: string;
  backend: BackendId | "sklearn" | "manual-review";
  taskType: MlTaskType | null;
  score: number;
  compatible: boolean;
  reasons: string[];
  cautions: MachineIssue[];
  requiredBeforeExecution: string[];
  expectedMetrics: string[];
  expectedArtifacts: string[];
  commandHint: string | null;
}

export interface ModelingDecisionPlan {
  schemaVersion: 1;
  decisionId: string;
  request: ModelingDecisionRequest;
  inferredGoal: ModelingGoal;
  inferredOutcomeType: OutcomeType;
  inferredStudyDesign: StudyDesign;
  inferredDataStructures: DataStructure[];
  dataEvidence: {
    source: "request" | "table-summary";
    rowCount: number | null;
    featureCount: number | null;
    target: string | null;
    targetClassCount: number | null;
    maxMissingFraction: number | null;
    highMissingness: boolean;
    smallSample: boolean;
    highDimensional: boolean;
    warnings: MachineIssue[];
  };
  primary: ModelingCandidate | null;
  blockingPolicies: ModelingCandidate[];
  executableCandidates: ModelingCandidate[];
  baselines: ModelingCandidate[];
  sensitivityAnalyses: ModelingCandidate[];
  candidates: ModelingCandidate[];
  blocked: boolean;
  issues: MachineIssue[];
  nextAction: string;
}

export function buildModelingDecisionPlan(raw: Partial<ModelingDecisionRequest> & { question: string }): ModelingDecisionPlan {
  const request = modelingDecisionRequestSchema.parse({
    dataStructures: [],
    surveyDesign: false,
    repeatedMeasures: false,
    clustered: false,
    timeToEvent: false,
    highDimensional: false,
    text: false,
    image: false,
    spatial: false,
    network: false,
    highMissingness: false,
    smallSample: false,
    requiresInference: true,
    requiresPrediction: false,
    maxCandidates: 12,
    ...raw,
  });
  const dataEvidence = deriveDataEvidence(request);
  const evidenceAdjustedRequest = {
    ...request,
    rowCount: dataEvidence.rowCount ?? request.rowCount,
    featureCount: dataEvidence.featureCount ?? request.featureCount,
    classCount: dataEvidence.targetClassCount ?? request.classCount,
    highMissingness: dataEvidence.highMissingness,
    smallSample: dataEvidence.smallSample,
    highDimensional: dataEvidence.highDimensional,
  };
  const inferredGoal = inferGoal(evidenceAdjustedRequest);
  const inferredOutcomeType = inferOutcomeType(evidenceAdjustedRequest);
  const inferredStudyDesign = inferStudyDesign(evidenceAdjustedRequest);
  const inferredDataStructures = inferDataStructures(evidenceAdjustedRequest);
  const issues: MachineIssue[] = [...dataEvidence.warnings];
  if (evidenceAdjustedRequest.image) issues.push(issue("warning", "IMAGE_MODELING_NOT_IN_THIS_PASS", "Image modeling requires a separate computer-vision adapter layer; tabular/statistical planning can only emit a stop-for-review candidate.", ["request.image"]));
  if (evidenceAdjustedRequest.text) issues.push(issue("warning", "TEXT_MODELING_NOT_IN_THIS_PASS", "Text/NLP modeling needs a later text adapter layer; current executable ML support is tabular.", ["request.text"]));
  if (evidenceAdjustedRequest.timeToEvent) issues.push(issue("warning", "SURVIVAL_BACKEND_NOT_YET_EXECUTABLE", "Survival methods can be selected as method contracts, but Cox/random-survival-forest execution is not yet production-ready in Agenteer.", ["request.timeToEvent"]));

  const methodRequest: MethodSelectionRequest = {
    question: request.question,
    outcomeType: inferredOutcomeType,
    studyDesign: inferredStudyDesign,
    dataStructures: inferredDataStructures,
    goal: mapGoalToMethodGoal(inferredGoal),
    surveyDesign: evidenceAdjustedRequest.surveyDesign,
    repeatedMeasures: evidenceAdjustedRequest.repeatedMeasures,
    clustered: evidenceAdjustedRequest.clustered,
    timeToEvent: evidenceAdjustedRequest.timeToEvent,
    highDimensional: evidenceAdjustedRequest.highDimensional,
    text: evidenceAdjustedRequest.text,
    image: evidenceAdjustedRequest.image,
    spatial: evidenceAdjustedRequest.spatial,
    network: evidenceAdjustedRequest.network,
    maxCandidates: Math.min(evidenceAdjustedRequest.maxCandidates, 12),
  };
  const methodSelection = selectAnalysisMethods(methodRequest);
  const methodCandidates = methodSelection.candidates.map((candidate, index) => methodToModelingCandidate(candidate.method, {
    rankBase: index + 1,
    score: candidate.score,
    request: evidenceAdjustedRequest,
    inferredGoal,
    inferredOutcomeType,
    inferredDataStructures,
    reasons: candidate.fitReasons,
    cautions: candidate.cautions,
    requiredBeforeExecution: candidate.requiredBeforeExecution,
  }));
  const mlCandidates = buildMlCandidates(evidenceAdjustedRequest, inferredGoal, inferredOutcomeType);
  const workflowCandidates = buildWorkflowPolicyCandidates(evidenceAdjustedRequest, inferredGoal, inferredOutcomeType);
  const candidates = [...methodCandidates, ...mlCandidates, ...workflowCandidates]
    .map(candidate => ({ ...candidate, score: adjustScore(candidate, evidenceAdjustedRequest, inferredGoal) }))
    .sort((a, b) => {
      const tierDelta = tierWeight(b.tier) - tierWeight(a.tier);
      if (tierDelta !== 0) return tierDelta;
      return b.score - a.score;
    })
    .slice(0, request.maxCandidates)
    .map((candidate, index) => ({ ...candidate, rank: index + 1 }));
  const blockingPolicies = candidates.filter(candidate => candidate.source === "workflow-policy");
  const executableCandidates = candidates.filter(candidate => candidate.source !== "workflow-policy" && candidate.compatible);
  const primary = executableCandidates.find(candidate => candidate.tier === "primary") ?? executableCandidates[0] ?? null;
  const baselines = candidates.filter(candidate => candidate.tier === "baseline");
  const sensitivityAnalyses = candidates.filter(candidate => candidate.tier === "sensitivity");
  const blocked = !primary || issues.some(issue => issue.severity === "blocker");
  return {
    schemaVersion: 1,
    decisionId: `modeling_${stableDecisionHash(JSON.stringify({ request, primary: primary?.id ?? null })).slice(0, 16)}`,
    request: evidenceAdjustedRequest,
    inferredGoal,
    inferredOutcomeType,
    inferredStudyDesign,
    inferredDataStructures,
    dataEvidence,
    primary,
    blockingPolicies,
    executableCandidates,
    baselines,
    sensitivityAnalyses,
    candidates,
    blocked,
    issues,
    nextAction: blocked
      ? "Resolve blocking modeling issues before execution."
      : primary
        ? `Promote ${primary.id}; run required feasibility checks, then execute the suggested command or AnalysisSpec-backed runner.`
        : "Add outcome type, study design, and dataset shape details to choose a model.",
  };
}

function buildMlCandidates(request: ModelingDecisionRequest, goal: ModelingGoal, outcomeType: OutcomeType): ModelingCandidate[] {
  const task = mlTaskFor(goal, outcomeType, request);
  if (!task) return [];
  const models = listMlModels({ task, includeUnavailable: true });
  const preferred = preferredMlIds(task, request);
  return models.map(model => {
    const optional = model.availability !== "available";
    const idRank = preferred.indexOf(model.id);
    const isPreferred = idRank >= 0;
    const baseline = baselineMlIds(task).includes(model.id);
    const tier: ModelingCandidate["tier"] = baseline ? "baseline" : isPreferred ? "primary" : "sensitivity";
    const reasons = [
      `${model.label} supports ${task}.`,
      baseline ? "Useful as a transparent baseline before stronger models." : isPreferred ? "Matches the requested prediction/modeling shape." : "Useful comparator or sensitivity model.",
    ];
    if (request.highDimensional && model.family === "linear") reasons.push("Linear/regularized models are often useful for high-dimensional biomedical tables.");
    if (request.smallSample && isHighCapacityMlId(model.id)) reasons.push("Downgraded because the table appears small for high-capacity ML.");
    if (request.highMissingness && isHighCapacityMlId(model.id)) reasons.push("Downgraded because high missingness increases overfitting and imputation sensitivity risk.");
    const cautions: MachineIssue[] = [];
    if (optional) cautions.push(issue("warning", "OPTIONAL_DEPENDENCY_MISSING", `${model.id} requires ${model.requiredPackage}; keep as candidate only if that package is installed.`, [model.id]));
    if (request.requiresInference && goal === "predict") cautions.push(issue("note", "PREDICTION_NOT_INFERENCE", "Prediction metrics do not answer an explanatory or causal estimand by themselves.", [model.id]));
    return {
      id: `ml:${model.id}`,
      rank: 0,
      tier,
      source: "ml-adapter",
      label: model.label,
      family: model.family,
      backend: "sklearn",
      taskType: task,
      score: optional ? 0.45 : isPreferred ? 0.82 - Math.max(0, idRank) * 0.03 : baseline ? 0.74 : 0.62,
      compatible: !optional,
      reasons,
      cautions,
      requiredBeforeExecution: [
        "confirm target column and feature exclusions",
        "run train/test split or cross-validation",
        ...(task === "binary_classification" ? ["report calibration, Brier score, and threshold policy for clinical prediction"] : []),
        "report calibration for probability models when clinical interpretation is intended",
      ],
      expectedMetrics: metricsForTask(task),
      expectedArtifacts: ["ml-run.json", "predictions.csv or transformed.csv", "model-summary.json", "model.joblib when serializable"],
      commandHint: task === "clustering" || task === "dimensionality_reduction"
        ? `agenteer research ml-run --task ${task} --model ${model.id} --data <rows.csv> --out-dir <out> --json`
        : `agenteer research ml-run --task ${task} --model ${model.id} --data <rows.csv> --target <target> --out-dir <out> --json`,
    };
  });
}

function buildWorkflowPolicyCandidates(request: ModelingDecisionRequest, goal: ModelingGoal, outcomeType: OutcomeType): ModelingCandidate[] {
  const candidates: ModelingCandidate[] = [];
  if (request.highMissingness) {
    candidates.push(policyCandidate("policy:missing-data-sensitivity", "Missing-data sensitivity policy", "sensitivity", 0.78, [
      "High missingness was declared; complete-case results need missingness diagnostics and sensitivity analysis before interpretation.",
    ], ["missingness-summary.json", "complete-case flow counts", "imputation or inverse-probability sensitivity plan"]));
  }
  if (request.surveyDesign) {
    candidates.push(policyCandidate("policy:complex-survey-design", "Complex survey design policy", goal === "predict" ? "sensitivity" : "primary", 0.84, [
      "Survey data require weight, strata, PSU, domain eligibility, and cross-sectional limitations before inference.",
    ], ["survey weight variable", "strata variable", "PSU variable", "weight-domain rationale"]));
  }
  if (goal === "causal") {
    candidates.push(policyCandidate("policy:causal-stop-for-review", "Causal design stop-for-review", "primary", 0.86, [
      "Causal language requires target trial, DAG/confounding set, positivity, exchangeability, and sensitivity analysis before modeling.",
    ], ["causal estimand", "DAG/confounder rationale", "positivity diagnostics", "negative/control or sensitivity analysis"]));
  }
  if (outcomeType === "time_to_event") {
    candidates.push(policyCandidate("policy:survival-required-fields", "Survival required-fields policy", "primary", 0.82, [
      "Time-to-event analyses require time origin, event indicator, censoring mechanism, and proportional-hazards diagnostics.",
    ], ["time origin", "event indicator", "censoring definition", "PH assumption check"]));
  }
  if (request.text) {
    candidates.push(policyCandidate("policy:text-adapter-required", "Text/NLP adapter required", "primary", 0.8, [
      "Text modeling needs a text corpus manifest, feature extraction policy, leakage review, and NLP backend declaration.",
    ], ["text corpus manifest", "label source and leakage review", "tokenization/embedding plan", "evaluation split policy"]));
  }
  if (request.image) {
    candidates.push(policyCandidate("policy:image-adapter-required", "Imaging adapter required", "primary", 0.8, [
      "Imaging/computer-vision modeling requires a separate image manifest, preprocessing transform record, and model-card style evaluation plan.",
    ], ["image manifest", "train/validation/test patient-level split", "preprocessing transform record", "model card and calibration plan"]));
  }
  if (request.spatial) {
    candidates.push(policyCandidate("policy:spatial-adapter-required", "Spatial modeling adapter required", "primary", 0.76, [
      "Spatial modeling requires geographic unit definitions, spatial autocorrelation checks, and privacy/suppression review.",
    ], ["geographic unit manifest", "Moran/autocorrelation diagnostic", "small-area suppression policy"]));
  }
  if (request.network) {
    candidates.push(policyCandidate("policy:network-adapter-required", "Network modeling adapter required", "primary", 0.76, [
      "Network modeling requires node/edge schemas, connected-component diagnostics, and leakage-aware split policy.",
    ], ["node schema", "edge schema", "component diagnostics", "network split policy"]));
  }
  return candidates;
}

function deriveDataEvidence(request: ModelingDecisionRequest): ModelingDecisionPlan["dataEvidence"] {
  const summary = request.tableSummary;
  if (!summary) {
    const rowCount = request.rowCount ?? null;
    const featureCount = request.featureCount ?? null;
    return {
      source: "request",
      rowCount,
      featureCount,
      target: request.target ?? null,
      targetClassCount: request.classCount ?? null,
      maxMissingFraction: null,
      highMissingness: request.highMissingness || Boolean(rowCount !== null && rowCount < 150),
      smallSample: request.smallSample || Boolean(rowCount !== null && rowCount < 200),
      highDimensional: request.highDimensional || Boolean(rowCount !== null && featureCount !== null && featureCount > Math.max(50, rowCount / 2)),
      warnings: [],
    };
  }
  const targetColumn = request.target ? summary.columns.find(column => column.name === request.target) : undefined;
  const rowCount = summary.rowCount;
  const featureCount = Math.max(0, summary.columnCount - (targetColumn ? 1 : 0));
  const maxMissingFraction = summary.columns.reduce((max, column) => Math.max(max, column.missingFraction), 0);
  const targetClassCount = targetColumn ? new Set(targetColumn.sampleValues.filter(Boolean)).size || null : request.classCount ?? null;
  const warnings: MachineIssue[] = [];
  if (request.target && !targetColumn) warnings.push(issue("warning", "TARGET_NOT_IN_TABLE_SUMMARY", `Target '${request.target}' was not found in table summary columns.`, ["tableSummary.columns"]));
  if (targetColumn && targetColumn.missingFraction > 0.2) warnings.push(issue("warning", "TARGET_HIGH_MISSINGNESS", `Target '${targetColumn.name}' has ${(targetColumn.missingFraction * 100).toFixed(1)}% missingness.`, [targetColumn.name]));
  if (maxMissingFraction > 0.35) warnings.push(issue("warning", "TABLE_HIGH_MISSINGNESS", `At least one column has ${(maxMissingFraction * 100).toFixed(1)}% missingness.`, ["tableSummary.columns"]));
  if (rowCount < 200) warnings.push(issue("warning", "TABLE_SMALL_SAMPLE", `Table has ${rowCount} rows; high-capacity ML should be downgraded and uncertainty emphasized.`, ["tableSummary.rowCount"]));
  return {
    source: "table-summary",
    rowCount,
    featureCount,
    target: request.target ?? null,
    targetClassCount,
    maxMissingFraction,
    highMissingness: request.highMissingness || maxMissingFraction > 0.25,
    smallSample: request.smallSample || rowCount < 200,
    highDimensional: request.highDimensional || featureCount > Math.max(50, rowCount / 2),
    warnings,
  };
}

function methodToModelingCandidate(method: AnalysisMethod, opts: {
  rankBase: number;
  score: number;
  request: ModelingDecisionRequest;
  inferredGoal: ModelingGoal;
  inferredOutcomeType: OutcomeType;
  inferredDataStructures: DataStructure[];
  reasons: string[];
  cautions: MachineIssue[];
  requiredBeforeExecution: string[];
}): ModelingCandidate {
  const compatible = method.implementationStatus === "executable" || method.implementationStatus === "contract-ready";
  const backend = preferredBackend(method, opts.request);
  const tier = inferMethodTier(method, opts.inferredGoal, opts.inferredOutcomeType);
  return {
    id: `method:${method.id}`,
    rank: opts.rankBase,
    tier,
    source: "statistical-method",
    label: method.label,
    family: method.modelFamily,
    backend,
    taskType: null,
    score: opts.score,
    compatible,
    reasons: opts.reasons.length ? opts.reasons : [method.purpose],
    cautions: [
      ...opts.cautions,
      ...(method.implementationStatus === "design-only" || method.implementationStatus === "blocked"
        ? [issue("warning", "METHOD_NOT_EXECUTABLE", `${method.id} is ${method.implementationStatus}; use as design contract only.`, [method.id])]
        : []),
    ],
    requiredBeforeExecution: [...new Set([...method.requiredFields, ...method.diagnostics, ...opts.requiredBeforeExecution])].slice(0, 12),
    expectedMetrics: method.effectMeasures,
    expectedArtifacts: method.artifactExpectations,
    commandHint: method.implementationStatus === "executable" || method.implementationStatus === "contract-ready"
      ? `agenteer research method-select --question "${opts.request.question.replaceAll('"', "'")}" --json`
      : null,
  };
}

function policyCandidate(id: string, label: string, tier: ModelingCandidate["tier"], score: number, reasons: string[], required: string[]): ModelingCandidate {
  return {
    id,
    rank: 0,
    tier,
    source: "workflow-policy",
    label,
    family: "policy",
    backend: "manual-review",
    taskType: null,
    score,
    compatible: true,
    reasons,
    cautions: [],
    requiredBeforeExecution: required,
    expectedMetrics: [],
    expectedArtifacts: ["analysis-spec.json", "diagnostics.json", "review-note.md"],
    commandHint: null,
  };
}

function inferGoal(request: ModelingDecisionRequest): ModelingGoal {
  if (request.goal) return request.goal;
  const q = request.question.toLowerCase();
  if (request.requiresPrediction || /\bpredict|prediction|risk score|classify|forecast\b/.test(q)) return request.outcomeType === "continuous" ? "predict" : "classify";
  if (/\bcaus|effect of|impact of|treatment|intervention\b/.test(q)) return "causal";
  if (/\bdiagnos|sensitivity|specificity|auc|roc\b/.test(q)) return "diagnose";
  if (/\bcluster|phenotype|subgroup|latent class\b/.test(q)) return "discover";
  if (/\bpca|dimension|embedding|umap|t-sne|reduce\b/.test(q)) return "reduce_dimensions";
  if (/\bcompare|difference|versus|vs\.?|between groups\b/.test(q)) return "compare_groups";
  if (/\bprevalence|mean|proportion|describe|summary|distribution\b/.test(q)) return "describe";
  return "associate";
}

function inferOutcomeType(request: ModelingDecisionRequest): OutcomeType {
  if (request.outcomeType) return request.outcomeType;
  const q = request.question.toLowerCase();
  if (request.timeToEvent || /\bsurvival|time to|readmission|death|recurrence\b/.test(q)) return "time_to_event";
  if (/\bbinary|yes.no|elevated|disease|mortality|case|positive|negative\b/.test(q)) return "binary";
  if (/\bcount|number of|visits|hospitalizations|events\b/.test(q)) return "count";
  if (/\bcategory|multiclass|class|grade\b/.test(q)) return "categorical";
  if (request.text) return "text";
  if (request.image) return "image";
  if (request.network) return "network";
  if (request.spatial) return "spatial";
  return "continuous";
}

function inferStudyDesign(request: ModelingDecisionRequest): StudyDesign {
  if (request.studyDesign) return request.studyDesign;
  const q = request.question.toLowerCase();
  if (request.timeToEvent || /\bcohort|follow-up|incident|readmission|survival\b/.test(q)) return "cohort";
  if (/\brandom|trial|assigned\b/.test(q)) return "randomized_trial";
  if (/\bdiagnos|test performance|sensitivity|specificity\b/.test(q)) return "diagnostic";
  if (/\bpredict|risk score|validation\b/.test(q)) return "prediction";
  if (/\bbefore after|interrupted|policy\b/.test(q)) return "time_series";
  return "cross_sectional";
}

function inferDataStructures(request: ModelingDecisionRequest): DataStructure[] {
  const values = new Set<DataStructure>(request.dataStructures);
  if (request.surveyDesign) values.add("complex_survey");
  if (request.repeatedMeasures) values.add("repeated_measures");
  if (request.clustered) values.add("clustered");
  if (request.timeToEvent) values.add("survival");
  if (request.highDimensional) values.add("high_dimensional");
  if (request.text) values.add("text_corpus");
  if (request.image) values.add("image_collection");
  if (request.spatial) values.add("spatial_units");
  if (request.network) values.add("network_graph");
  if (values.size === 0) values.add("single_table");
  return [...values];
}

function mapGoalToMethodGoal(goal: ModelingGoal): MethodSelectionRequest["goal"] {
  if (goal === "classify") return "predict";
  if (goal === "reduce_dimensions") return "discover";
  return goal;
}

function mlTaskFor(goal: ModelingGoal, outcomeType: OutcomeType, request: ModelingDecisionRequest): MlTaskType | null {
  if (goal === "discover") return "clustering";
  if (goal === "reduce_dimensions") return "dimensionality_reduction";
  if (goal !== "predict" && goal !== "classify" && !request.requiresPrediction) return null;
  if (outcomeType === "binary") return "binary_classification";
  if (outcomeType === "categorical" || outcomeType === "ordinal") return "multiclass_classification";
  if (outcomeType === "continuous" || outcomeType === "count" || outcomeType === "rate") return "regression";
  return null;
}

function preferredMlIds(task: MlTaskType, request: ModelingDecisionRequest): string[] {
  if (task === "binary_classification") return request.smallSample ? ["logistic-regression", "svm-classifier", "random-forest-classifier"] : ["logistic-regression", "random-forest-classifier", "gradient-boosting-classifier", "extra-trees-classifier"];
  if (task === "multiclass_classification") return ["logistic-regression", "random-forest-classifier", "gradient-boosting-classifier"];
  if (task === "regression") return request.highDimensional ? ["elastic-net-regression", "ridge-regression", "random-forest-regressor"] : ["linear-regression", "ridge-regression", "random-forest-regressor", "gradient-boosting-regressor"];
  if (task === "clustering") return ["k-means", "gaussian-mixture", "agglomerative-clustering"];
  return ["pca", "truncated-svd", "nmf"];
}

function baselineMlIds(task: MlTaskType): string[] {
  if (task === "binary_classification" || task === "multiclass_classification") return ["logistic-regression"];
  if (task === "regression") return ["linear-regression", "ridge-regression"];
  if (task === "clustering") return ["k-means"];
  return ["pca"];
}

function metricsForTask(task: MlTaskType): string[] {
  if (task === "binary_classification") return ["auroc", "auprc", "accuracy", "sensitivity", "specificity", "f1", "calibration", "brier_score"];
  if (task === "multiclass_classification") return ["accuracy", "macro_f1", "weighted_f1", "per_class_precision_recall_f1", "confusion_matrix"];
  if (task === "regression") return ["mae", "rmse", "r2", "calibration_plot_when_prediction"];
  if (task === "clustering") return ["silhouette", "davies_bouldin", "calinski_harabasz", "cluster_stability"];
  return ["explained_variance_ratio", "transformed_shape", "reconstruction_or_neighbor_quality_when_available"];
}

function inferMethodTier(method: AnalysisMethod, goal: ModelingGoal, outcomeType: OutcomeType): ModelingCandidate["tier"] {
  if (method.category === "descriptive") return goal === "describe" ? "primary" : "baseline";
  if (goal === "compare_groups" && method.category === "group_comparison") return "primary";
  if (goal === "associate" && ["linear_regression", "logistic_regression", "correlation_association", "generalized_linear_model"].includes(method.category)) return "primary";
  if (goal === "causal" && method.category === "causal_inference") return "primary";
  if (goal === "diagnose" && method.category === "diagnostic_prognostic") return "primary";
  if (outcomeType === "time_to_event" && method.category === "survival_time_to_event") return "primary";
  if (method.category === "missing_data" || method.category === "model_diagnostics" || method.category === "multiple_comparisons") return "sensitivity";
  return "exploratory";
}

function preferredBackend(method: AnalysisMethod, request: ModelingDecisionRequest): BackendId {
  if (request.surveyDesign && method.compatibleBackends.includes("r-survey")) return "r-survey";
  if (method.compatibleBackends.includes("python-statsmodels")) return "python-statsmodels";
  if (method.compatibleBackends.includes("python-scipy")) return "python-scipy";
  return method.compatibleBackends[0] ?? "python-statsmodels";
}

function adjustScore(candidate: ModelingCandidate, request: ModelingDecisionRequest, goal: ModelingGoal): number {
  let score = candidate.score;
  if (request.surveyDesign && candidate.backend === "r-survey") score += 0.08;
  if (request.surveyDesign && candidate.source === "ml-adapter" && request.requiresInference) score -= 0.12;
  if (goal === "predict" || goal === "classify") {
    if (candidate.source === "ml-adapter") score += 0.08;
    if (candidate.id.includes("random-forest") || candidate.id.includes("gradient-boosting")) score += 0.04;
  }
  if (request.smallSample && isHighCapacityMlId(candidate.id)) score -= 0.16;
  if (request.highMissingness && isHighCapacityMlId(candidate.id)) score -= 0.14;
  if (request.highMissingness && candidate.source === "workflow-policy") score += 0.08;
  if (request.highMissingness && candidate.id.includes("missing-data")) score += 0.12;
  return Math.max(0, Math.min(1, score));
}

function isHighCapacityMlId(id: string): boolean {
  return /random-forest|extra-trees|gradient-boosting|adaboost|xgboost|lightgbm|catboost|mlp|svm/.test(id);
}

function tierWeight(tier: ModelingCandidate["tier"]): number {
  switch (tier) {
    case "primary": return 4;
    case "baseline": return 3;
    case "sensitivity": return 2;
    case "exploratory": return 1;
    case "not_recommended": return 0;
  }
}

function issue(severity: MachineIssue["severity"], code: string, message: string, evidenceRefs: string[]): MachineIssue {
  return { severity, code, message, evidenceRefs };
}

function stableDecisionHash(value: string): string {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash >>> 0).toString(16).padStart(8, "0");
}
