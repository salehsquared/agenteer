import { z } from "zod";
import { listMlModels, defaultPrimaryMetric } from "./ml/catalog.js";
import type { MlTaskType } from "./ml/schemas.js";
import { stableHash } from "./runtime.js";
import { statsRunMethodForAnalysisMethod } from "./stats/method-map.js";
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
      min: z.number().optional(),
      max: z.number().optional(),
      mean: z.number().optional(),
    })),
  }).optional(),
  backendStatus: z.object({
    backends: z.array(z.object({
      id: z.string().min(1),
      availability: z.enum(["available", "missing", "not_checked"]),
      version: z.string().nullable().optional(),
    })),
  }).optional(),
  priorRuns: z.array(z.object({
    path: z.string().min(1).optional(),
    kind: z.enum(["stats", "ml", "unknown"]),
    status: z.string().min(1),
    posture: z.string().min(1).nullable().optional(),
    methodOrModel: z.string().min(1).nullable().optional(),
    issueCodes: z.array(z.string().min(1)).default([]),
    errors: z.array(z.string()).default([]),
  })).default([]),
  explorationHandoff: z.object({
    path: z.string().min(1),
    status: z.enum(["ready_for_modeling_plan", "needs_methods_review", "blocked"]),
    clearanceLevel: z.enum(["clear_for_handoff", "hold_for_methods_review", "stop"]),
    sourceExplorationSha256: z.string().min(1).nullable().optional(),
    questionId: z.string().min(1).nullable().optional(),
    blockers: z.array(z.string()).default([]),
    methodsReviewNote: z.string().min(1).nullable().optional(),
  }).optional(),
  literatureEvidence: z.object({
    path: z.string().min(1).optional(),
    status: z.enum(["ready", "needs_more_evidence", "failed"]),
    evidenceStrength: z.enum(["none", "sparse", "adequate", "strong"]),
    sourceCount: z.number().int().nonnegative(),
    highQualitySourceCount: z.number().int().nonnegative(),
    latestPublicationYear: z.number().int().nullable().optional(),
    questionTokenCoverage: z.number().min(0).max(1),
    designSignals: z.array(z.string()).default([]),
    methodSignals: z.array(z.string()).default([]),
    planningImplications: z.array(z.string()).default([]),
    followUpSearches: z.array(z.string()).default([]),
    issueCodes: z.array(z.string()).default([]),
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
  backendEvidence: {
    source: "not-supplied" | "machine-status";
    available: string[];
    missing: string[];
    notChecked: string[];
    warnings: MachineIssue[];
  };
  priorRunEvidence: {
    source: "none" | "prior-run-artifacts";
    runs: Array<{
      path: string | null;
      kind: "stats" | "ml" | "unknown";
      status: string;
      posture: string | null;
      methodOrModel: string | null;
      issueCodes: string[];
      action: "promote-local-review" | "rerun-with-binding" | "rerun-survey-aware" | "repair-execution" | "compare-baseline" | "stop-for-validation" | "reject-or-redesign";
      reason: string;
    }>;
    warnings: MachineIssue[];
    recommendedAction: string;
  };
  literatureEvidence: {
    source: "not-supplied" | "literature-context";
    path: string | null;
    status: "ready" | "needs_more_evidence" | "failed" | null;
    evidenceStrength: "none" | "sparse" | "adequate" | "strong" | null;
    sourceCount: number | null;
    highQualitySourceCount: number | null;
    latestPublicationYear: number | null;
    questionTokenCoverage: number | null;
    designSignals: string[];
    methodSignals: string[];
    planningImplications: string[];
    followUpSearches: string[];
    warnings: MachineIssue[];
  };
  methodSelectionEvidence: {
    selectionId: string;
    selectionHash: string;
    primaryMethodId: string | null;
    candidateMethodIds: string[];
    recommendedBackend: BackendId;
    recommendedArchetype: string;
    stopForHumanReview: boolean;
    issueCodes: string[];
    applyCommandHint: string | null;
  };
  statisticalMethodGuidance: {
    source: "table-summary" | "request-only";
    recommendedStatsRunMethod: string | null;
    confidence: number;
    rationale: string;
    dataShape: {
      target: string | null;
      targetType: "continuous" | "binary" | "categorical" | "count" | "time_to_event" | "unknown";
      rowCount: number | null;
      completeTargetRows: number | null;
      classCount: number | null;
      eventCount: number | null;
      nonEventCount: number | null;
      numericPredictorCount: number;
      categoricalPredictorCount: number;
      maxMissingFraction: number | null;
    };
    alternatives: Array<{
      method: string;
      tier: "primary" | "baseline" | "sensitivity" | "fallback" | "blocked";
      reason: string;
      commandHint: string | null;
      expectedQa: string[];
    }>;
    warnings: MachineIssue[];
    blockers: MachineIssue[];
  };
  routeRecommendation: {
    route: "paper-run" | "stats-run" | "ml-run" | "method-select" | "stop-for-review";
    commandHint: string | null;
    reason: string;
    requiredArtifacts: string[];
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
  const backendEvidence = deriveBackendEvidence(request);
  const priorRunEvidence = derivePriorRunEvidence(request);
  const literatureEvidence = deriveLiteratureEvidence(request);
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
  const issues: MachineIssue[] = [...dataEvidence.warnings, ...backendEvidence.warnings, ...priorRunEvidence.warnings, ...literatureEvidence.warnings];
  if (evidenceAdjustedRequest.explorationHandoff) {
    const handoff = evidenceAdjustedRequest.explorationHandoff;
    if (handoff.status === "blocked" || handoff.clearanceLevel === "stop") {
      issues.push(issue("blocker", "EXPLORATION_HANDOFF_BLOCKED", `Exploration handoff is blocked: ${handoff.blockers.join("; ") || handoff.clearanceLevel}.`, ["request.explorationHandoff"]));
    } else if (handoff.status === "needs_methods_review" || handoff.clearanceLevel === "hold_for_methods_review") {
      issues.push(issue("warning", "EXPLORATION_HANDOFF_METHODS_REVIEW", `Exploration handoff requires methods review: ${handoff.blockers.join("; ") || handoff.clearanceLevel}.`, ["request.explorationHandoff"]));
      if (!handoff.methodsReviewNote) issues.push(issue("blocker", "EXPLORATION_HANDOFF_MISSING_REVIEW_NOTE", "Held exploration handoff is missing a methods-review note.", ["request.explorationHandoff.methodsReviewNote"]));
    }
  }
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
  const methodSelectionEvidence = {
    selectionId: methodSelection.selectionId,
    selectionHash: stableHash(methodSelection),
    primaryMethodId: methodSelection.primary?.method.id ?? null,
    candidateMethodIds: methodSelection.candidates.map(candidate => candidate.method.id),
    recommendedBackend: methodSelection.recommendedBackend,
    recommendedArchetype: methodSelection.recommendedArchetype,
    stopForHumanReview: methodSelection.stopForHumanReview,
    issueCodes: methodSelection.issues.map(item => item.code),
    applyCommandHint: methodSelection.primary
      ? `agenteer research method-select --question "${request.question.replaceAll('"', "'")}" --out method-selection.json --json && agenteer research method-apply --spec analysis-spec.json --selection method-selection.json --json`
      : null,
  };
  const statisticalMethodGuidance = buildStatisticalMethodGuidance(evidenceAdjustedRequest, inferredGoal, inferredOutcomeType);
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
    statisticalMethodGuidance,
  }));
  const mlCandidates = buildMlCandidates(evidenceAdjustedRequest, inferredGoal, inferredOutcomeType);
  const workflowCandidates = buildWorkflowPolicyCandidates(evidenceAdjustedRequest, inferredGoal, inferredOutcomeType);
  const candidates = [...methodCandidates, ...mlCandidates, ...workflowCandidates]
    .map(candidate => applyBackendEvidence(candidate, backendEvidence))
    .map(candidate => ({ ...candidate, score: adjustScore(candidate, evidenceAdjustedRequest, inferredGoal, statisticalMethodGuidance) }))
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
  if (statisticalMethodGuidance.blockers.length) issues.push(...statisticalMethodGuidance.blockers);
  if (statisticalMethodGuidance.warnings.length) issues.push(...statisticalMethodGuidance.warnings);
  const blocked = !primary || issues.some(issue => issue.severity === "blocker");
  const routeRecommendation = recommendRoute({
    request: evidenceAdjustedRequest,
    inferredGoal,
    inferredOutcomeType,
    primary,
    candidates,
    blocked,
    backendEvidence,
    priorRunEvidence,
  });
  return {
    schemaVersion: 1,
    decisionId: `modeling_${stableHash({ request, primary: primary?.id ?? null, methodSelectionId: methodSelection.selectionId, literature: { path: literatureEvidence.path, status: literatureEvidence.status, strength: literatureEvidence.evidenceStrength } }).slice(0, 16)}`,
    request: evidenceAdjustedRequest,
    inferredGoal,
    inferredOutcomeType,
    inferredStudyDesign,
    inferredDataStructures,
    dataEvidence,
    backendEvidence,
    priorRunEvidence,
    literatureEvidence,
    methodSelectionEvidence,
    statisticalMethodGuidance,
    routeRecommendation,
    primary,
    blockingPolicies,
    executableCandidates,
    baselines,
    sensitivityAnalyses,
    candidates,
    blocked,
    issues,
    nextAction: routeRecommendation.commandHint
      ? routeRecommendation.commandHint
      : routeRecommendation.reason,
  };
}

function recommendRoute(opts: {
  request: ModelingDecisionRequest;
  inferredGoal: ModelingGoal;
  inferredOutcomeType: OutcomeType;
  primary: ModelingCandidate | null;
  candidates: ModelingCandidate[];
  blocked: boolean;
  backendEvidence: ModelingDecisionPlan["backendEvidence"];
  priorRunEvidence: ModelingDecisionPlan["priorRunEvidence"];
}): ModelingDecisionPlan["routeRecommendation"] {
  const latestPrior = opts.priorRunEvidence.runs.at(-1);
  if (latestPrior) {
    if (latestPrior.action === "rerun-survey-aware") {
      const hasBackendStatus = opts.backendEvidence.source === "machine-status";
      const rSurveyAvailable = !hasBackendStatus || opts.backendEvidence.available.includes("r-survey");
      const pythonLinearizedAvailable = !hasBackendStatus || opts.backendEvidence.available.includes("python-linearized");
      if (!rSurveyAvailable && !pythonLinearizedAvailable) {
        return {
          route: "stop-for-review",
          commandHint: null,
          reason: `Prior run posture ${latestPrior.posture} requires survey-aware rerun, but no survey-capable backend is available.`,
          requiredArtifacts: ["prior-run.json", "machine-status.json", "backend-install-note.md"],
        };
      }
      const backend = rSurveyAvailable ? "r-survey" : "python-linearized";
      return {
        route: "paper-run",
        commandHint: `agenteer research paper-run --analysis-spec <analysis-spec.json> --data-root <dir> --out-dir <paper-dir> --backend ${backend} --json`,
        reason: `Prior run posture ${latestPrior.posture} requires a survey-aware rerun before inference.`,
        requiredArtifacts: ["prior-run.json", "analysis-spec.json", "runner-record.json", "lifecycle-summary.md"],
      };
    }
    if (latestPrior.action === "rerun-with-binding") {
      return {
        route: "method-select",
        commandHint: `agenteer research method-select --question "${opts.request.question.replaceAll('"', "'")}" --out method-selection.json --json`,
        reason: `Prior run posture ${latestPrior.posture} is exploratory; bind method-selection/AnalysisSpec evidence before rerun.`,
        requiredArtifacts: ["prior-run.json", "method-selection.json", "analysis-spec-v2.json"],
      };
    }
    if (latestPrior.action === "repair-execution") {
      return {
        route: "stop-for-review",
        commandHint: null,
        reason: `Prior run failed or had invalid binding: ${latestPrior.reason}`,
        requiredArtifacts: ["prior-run.json", "repair-note.md"],
      };
    }
    if (latestPrior.action === "compare-baseline") {
      return {
        route: "ml-run",
        commandHint: "agenteer research ml-compare --task <task> --model <baseline> --model <candidate> --data <rows.csv> --target <target> --out-dir <ml-compare-dir> --json",
        reason: `Prior run posture ${latestPrior.posture} requires baseline comparison before stronger prediction claims.`,
        requiredArtifacts: ["prior-run.json", "comparison.json", "calibration.csv when binary classification"],
      };
    }
    if (latestPrior.action === "stop-for-validation" || latestPrior.action === "reject-or-redesign") {
      return {
        route: "stop-for-review",
        commandHint: null,
        reason: `Prior run posture ${latestPrior.posture} requires design review: ${latestPrior.reason}`,
        requiredArtifacts: ["prior-run.json", "validation-design-note.md"],
      };
    }
  }
  if (opts.request.surveyDesign && opts.request.requiresInference) {
    const hasBackendStatus = opts.backendEvidence.source === "machine-status";
    const rSurveyAvailable = !hasBackendStatus || opts.backendEvidence.available.includes("r-survey");
    const pythonLinearizedAvailable = !hasBackendStatus || opts.backendEvidence.available.includes("python-linearized");
    if (!rSurveyAvailable && !pythonLinearizedAvailable) {
      return {
        route: "stop-for-review",
        commandHint: null,
        reason: "Complex survey inference is requested, but supplied backend evidence shows no available survey-capable local backend.",
        requiredArtifacts: ["machine-status.json", "backend-install-note.md", "analysis-spec.json"],
      };
    }
    const backend = rSurveyAvailable ? "r-survey" : "python-linearized";
    return {
      route: "paper-run",
      commandHint: `agenteer research paper-run --analysis-spec <analysis-spec.json> --data-root <dir> --out-dir <paper-dir> --backend ${backend} --json`,
      reason: backend === "r-survey"
        ? "Complex survey inference should use the R survey backend when available."
        : "Complex survey inference should use the local linearized survey paper runner because R survey is unavailable.",
      requiredArtifacts: ["analysis-spec.json", "paper.md", "analysis.json", "runner-record.json", "lifecycle-summary.md"],
    };
  }
  if (opts.blocked || !opts.primary) {
    return {
      route: "stop-for-review",
      commandHint: null,
      reason: "Resolve blocking modeling issues or provide enough data-shape evidence before execution.",
      requiredArtifacts: ["modeling-plan.json", "review-note.md"],
    };
  }
  if (opts.primary.source === "ml-adapter" || opts.request.requiresPrediction || ["predict", "classify", "discover", "reduce_dimensions"].includes(opts.inferredGoal)) {
    const task = opts.primary.taskType ?? mlTaskFor(opts.inferredGoal, opts.inferredOutcomeType, opts.request);
    return {
      route: "ml-run",
      commandHint: task
        ? `agenteer research ml-run --task ${task} --model ${opts.primary.id.replace(/^ml:/, "")} --data <rows.csv> ${task === "clustering" || task === "dimensionality_reduction" ? "" : "--target <target> "}--out-dir <ml-run-dir> --json`.replace(/\s+/g, " ").trim()
        : "agenteer research ml-models --json",
      reason: "The selected primary candidate is a prediction/ML adapter.",
      requiredArtifacts: ["ml-run.json", "model-summary.json", "predictions.csv or transformed.csv"],
    };
  }
  const statsCandidate = opts.primary.commandHint?.includes("research stats-run")
    ? opts.primary
    : opts.candidates.find(candidate => candidate.compatible && candidate.commandHint?.includes("research stats-run"));
  if (statsCandidate?.commandHint) {
    return {
      route: "stats-run",
      commandHint: statsCandidate.commandHint,
      reason: `${statsCandidate.id} is executable by the standard-table statistics runner.`,
      requiredArtifacts: ["stats-run.json", "estimates.csv", "diagnostics.json", "stats-report.md", "stats-qa.json"],
    };
  }
  if (opts.primary.commandHint) {
    return {
      route: "method-select",
      commandHint: opts.primary.commandHint,
      reason: "The selected method needs method-selection or AnalysisSpec promotion before execution.",
      requiredArtifacts: ["method-selection.json", "analysis-spec-v2.json", "execution-contract.json"],
    };
  }
  return {
    route: "stop-for-review",
    commandHint: null,
    reason: "The selected candidate is not executable in the current runner set.",
    requiredArtifacts: ["review-note.md"],
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
    const capacityDowngraded = isHighCapacityMlId(model.id) && (request.smallSample || request.highMissingness);
    const tier: ModelingCandidate["tier"] = baseline ? "baseline" : capacityDowngraded ? "sensitivity" : isPreferred ? "primary" : "sensitivity";
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

function buildStatisticalMethodGuidance(
  request: ModelingDecisionRequest,
  goal: ModelingGoal,
  outcomeType: OutcomeType,
): ModelingDecisionPlan["statisticalMethodGuidance"] {
  const summary = request.tableSummary;
  const target = request.target ?? null;
  const targetColumn = target && summary ? summary.columns.find(column => column.name === target) ?? null : null;
  const predictors = summary ? summary.columns.filter(column => column.name !== target) : [];
  const numericPredictors = predictors.filter(column => columnKind(column) === "continuous" || columnKind(column) === "count");
  const categoricalPredictors = predictors.filter(column => columnKind(column) === "binary" || columnKind(column) === "categorical");
  const maxMissingFraction = summary ? summary.columns.reduce((max, column) => Math.max(max, column.missingFraction), 0) : null;
  const targetType = targetColumn ? columnKind(targetColumn) : outcomeTypeToTargetKind(outcomeType);
  const classCount = targetColumn ? classCountFor(targetColumn) : request.classCount ?? null;
  const warnings: MachineIssue[] = [];
  const blockers: MachineIssue[] = [];
  const alternatives: ModelingDecisionPlan["statisticalMethodGuidance"]["alternatives"] = [];
  const add = (
    method: string,
    tier: ModelingDecisionPlan["statisticalMethodGuidance"]["alternatives"][number]["tier"],
    reason: string,
    expectedQa: string[],
  ) => {
    alternatives.push({
      method,
      tier,
      reason,
      commandHint: statsRunMethodCommandForGuidance(method, request, targetColumn, numericPredictors, categoricalPredictors),
      expectedQa,
    });
  };

  if (!summary) {
    warnings.push(issue("warning", "METHOD_GUIDANCE_REQUEST_ONLY", "No table summary was supplied; method guidance is based on declared question shape only.", ["request.tableSummary"]));
  }
  if (request.target && summary && !targetColumn) {
    blockers.push(issue("blocker", "METHOD_GUIDANCE_TARGET_MISSING", `Target '${request.target}' is missing from the table summary.`, ["request.target", "tableSummary.columns"]));
  }
  if (targetColumn?.missingFraction && targetColumn.missingFraction > 0.2) {
    warnings.push(issue("warning", "METHOD_GUIDANCE_TARGET_MISSINGNESS", `Target '${targetColumn.name}' is ${(targetColumn.missingFraction * 100).toFixed(1)}% missing; missingness review should precede inference.`, [targetColumn.name]));
  }
  if (maxMissingFraction !== null && maxMissingFraction > 0.35) {
    warnings.push(issue("warning", "METHOD_GUIDANCE_HIGH_TABLE_MISSINGNESS", `At least one table column is ${(maxMissingFraction * 100).toFixed(1)}% missing; add missingness-summary and sensitivity analysis.`, ["tableSummary.columns"]));
    add("missingness-summary", "sensitivity", "High missingness should be explicitly profiled before formal modeling.", ["missingness patterns", "complete-case counts", "MNAR/MAR review"]);
  }

  const smallSample = (summary?.rowCount ?? request.rowCount ?? 0) > 0 && (summary?.rowCount ?? request.rowCount ?? 0) < 50;
  if (smallSample) warnings.push(issue("warning", "METHOD_GUIDANCE_SMALL_SAMPLE", "Small sample detected; prefer exact, nonparametric, descriptive, or penalized routes over high-parameter models.", ["tableSummary.rowCount"]));

  let recommended: string | null = null;
  let rationale = "Insufficient table detail; start with descriptive profiling and method-selection evidence.";
  if (goal === "describe") {
    recommended = "descriptive";
    rationale = "The goal is descriptive, so profiling distributions, missingness, and group summaries should precede inference.";
    add("descriptive", "primary", rationale, ["missingness", "distribution plausibility", "small-cell suppression"]);
  } else if (goal === "diagnose") {
    recommended = "diagnostic-accuracy";
    rationale = "Diagnostic framing requires reference-standard/index-test roles and accuracy metrics with prevalence context.";
    add("diagnostic-accuracy", "primary", rationale, ["reference/index roles", "confusion matrix", "Wilson intervals", "screening-overclaim boundary"]);
    add("prediction-evaluation", "sensitivity", "If the index test is a continuous score, add ROC/PR and calibration-style evaluation.", ["ROC/PR", "Brier score", "threshold policy"]);
  } else if (goal === "compare_groups") {
    const grouping = bestGroupingColumn(categoricalPredictors);
    if (targetType === "continuous" && grouping) {
      if (classCountFor(grouping) === 2) {
        recommended = smallSample ? "mann-whitney" : "welch-t-test";
        rationale = smallSample
          ? "Continuous outcome with two groups and small sample: rank-based comparison is safer as the primary executable check."
          : "Continuous outcome with two groups: Welch t-test is preferred unless equal variances are proven.";
        add(recommended, "primary", rationale, ["group counts", "distribution plots", "effect size", "variance/normality review"]);
        add(recommended === "mann-whitney" ? "welch-t-test" : "mann-whitney", "sensitivity", "Use as a sensitivity route for distributional assumptions.", ["group counts", "distribution shape"]);
      } else {
        recommended = smallSample ? "kruskal-wallis" : "anova";
        rationale = "Continuous outcome with more than two groups: use ANOVA with Kruskal-Wallis as a distribution-robust sensitivity route.";
        add(recommended, "primary", rationale, ["group counts", "post-hoc/multiplicity policy", "distribution review"]);
        add(recommended === "anova" ? "kruskal-wallis" : "anova", "sensitivity", "Use as an assumption-checking companion route.", ["rank method disclosure", "variance/normality review"]);
      }
    } else if ((targetType === "binary" || targetType === "categorical") && grouping) {
      recommended = smallSample ? "fisher-exact" : "chi-square";
      rationale = smallSample
        ? "Categorical comparison with small sample: exact testing is safer than asymptotic chi-square when the table is 2x2."
        : "Categorical comparison: start with chi-square and fall back to Fisher/exact review for sparse cells.";
      add(recommended, "primary", rationale, ["cell counts", "expected counts", "effect size", "sparse-cell policy"]);
      add(recommended === "chi-square" ? "fisher-exact" : "chi-square", "fallback", "Use when cell-count diagnostics indicate the primary route is inappropriate.", ["2x2 verification", "expected counts"]);
    }
  } else if (goal === "associate" || goal === "causal") {
    if (targetType === "binary") {
      recommended = request.highDimensional ? "penalized-logistic-regression" : "logistic-regression";
      rationale = "Binary outcome association should use logistic regression with event-count, separation, and events-per-variable checks.";
      add(recommended, "primary", rationale, ["event count", "separation diagnostics", "EPV", "calibration where predictive"]);
      if (goal === "causal") add("propensity-score-matching", "sensitivity", "Causal framing requires explicit design and balance diagnostics before causal language.", ["balance/SMD", "positivity", "unmeasured confounding sensitivity"]);
    } else if (targetType === "count") {
      recommended = "poisson-regression";
      rationale = "Count outcome association should begin with Poisson regression and check overdispersion before negative-binomial escalation.";
      add("poisson-regression", "primary", rationale, ["overdispersion", "zero inflation", "rate denominator"]);
      add("negative-binomial-regression", "sensitivity", "Use when overdispersion is detected or expected.", ["overdispersion", "model convergence"]);
      add("zero-inflated-poisson", "sensitivity", "Use only when excess structural zeros are plausible and reviewed.", ["zero fraction", "structural-zero rationale"]);
    } else if (targetType === "continuous") {
      recommended = request.highDimensional ? "penalized-linear-regression" : "linear-regression";
      rationale = "Continuous outcome association should use linear regression with residual, influence, and collinearity diagnostics.";
      add(recommended, "primary", rationale, ["residual diagnostics", "VIF", "influence/Cook's distance", "effect-size/CI consistency"]);
      add("robust-linear-regression", "sensitivity", "Use when influence/outlier diagnostics are concerning.", ["influence points", "robustness of effect direction"]);
      add("quantile-regression", "sensitivity", "Use when median or tail behavior is scientifically relevant or residual assumptions are poor.", ["quantile definition", "bootstrap uncertainty"]);
    } else if (outcomeType === "time_to_event" || request.timeToEvent) {
      recommended = "cox-proportional-hazards";
      rationale = "Time-to-event questions require time origin, event/censoring definitions, and proportional-hazards diagnostics.";
      add("kaplan-meier", "baseline", "Start with nonparametric survival curves and log-rank comparison.", ["risk tables", "censoring pattern", "group counts"]);
      add("cox-proportional-hazards", "primary", rationale, ["PH diagnostics", "event count", "EPV", "censoring definition"]);
      add("aalen-johansen-cif", "sensitivity", "Use when a competing event is defined and death/competing risks matter.", ["competing event coding", "CIF curves"]);
    }
  } else if (goal === "classify" || goal === "predict") {
    if (targetType === "binary") {
      recommended = "prediction-evaluation";
      rationale = "Prediction/classification plans need validation metrics and calibration before model comparison claims.";
      add("prediction-evaluation", "primary", rationale, ["ROC/AUC", "AUPRC", "calibration", "Brier score", "threshold policy"]);
      add("logistic-regression", "baseline", "Transparent baseline model for binary prediction.", ["separation diagnostics", "calibration"]);
    } else if (targetType === "continuous" || targetType === "count") {
      recommended = "linear-regression";
      rationale = "Continuous prediction should begin with transparent regression and validation metrics before high-capacity ML.";
      add("linear-regression", "baseline", rationale, ["residual diagnostics", "train/test or CV", "RMSE/MAE/R2"]);
    }
  } else if (goal === "discover") {
    recommended = "clustering-validation";
    rationale = "Discovery/phenotyping requires cluster validity and stability checks before treating clusters as findings.";
    add("clustering-validation", "primary", rationale, ["silhouette", "Davies-Bouldin", "stability", "domain plausibility"]);
  } else if (goal === "reduce_dimensions") {
    recommended = "pca";
    rationale = "Dimensionality reduction should begin with PCA when numeric tabular features are available and assumptions are inspectable.";
    add("pca", "primary", rationale, ["explained variance", "component loadings", "scaling policy"]);
  }

  if (!recommended) {
    recommended = "descriptive";
    add("descriptive", "fallback", "No specific inferential route was safe from supplied evidence; start with data profiling.", ["missingness", "distribution plausibility"]);
  }

  return {
    source: summary ? "table-summary" : "request-only",
    recommendedStatsRunMethod: recommended,
    confidence: Number(Math.max(0.35, Math.min(0.95, (summary ? 0.72 : 0.5) + (targetColumn ? 0.12 : 0) - warnings.length * 0.04 - blockers.length * 0.2)).toFixed(3)),
    rationale,
    dataShape: {
      target,
      targetType,
      rowCount: summary?.rowCount ?? request.rowCount ?? null,
      completeTargetRows: targetColumn?.nonMissingRows ?? null,
      classCount,
      eventCount: null,
      nonEventCount: null,
      numericPredictorCount: numericPredictors.length,
      categoricalPredictorCount: categoricalPredictors.length,
      maxMissingFraction,
    },
    alternatives: alternatives.slice(0, 8),
    warnings,
    blockers,
  };
}

type ModelingTableColumn = NonNullable<ModelingDecisionRequest["tableSummary"]>["columns"][number];

function columnKind(column: ModelingTableColumn): ModelingDecisionPlan["statisticalMethodGuidance"]["dataShape"]["targetType"] {
  const classes = classCountFor(column);
  if (column.inferredType === "boolean") return "binary";
  if (classes === 2) return "binary";
  if (column.inferredType === "string" || column.inferredType === "mixed" || column.inferredType === "unknown") return classes && classes <= 20 ? "categorical" : "unknown";
  if (column.inferredType === "number") {
    if (classes !== null && classes <= 12 && column.sampleValues.every(value => Number.isFinite(Number(value)))) {
      const values = column.sampleValues.map(value => Number(value));
      if (values.every(value => Number.isInteger(value) && value >= 0) && (column.max === undefined || column.max <= 20)) return classes === 2 ? "binary" : "count";
    }
    if (looksLikeCountColumn(column)) return "count";
    return "continuous";
  }
  return "unknown";
}

function outcomeTypeToTargetKind(outcomeType: OutcomeType): ModelingDecisionPlan["statisticalMethodGuidance"]["dataShape"]["targetType"] {
  if (outcomeType === "binary") return "binary";
  if (outcomeType === "categorical" || outcomeType === "ordinal") return "categorical";
  if (outcomeType === "count" || outcomeType === "rate") return "count";
  if (outcomeType === "time_to_event") return "time_to_event";
  if (outcomeType === "continuous") return "continuous";
  return "unknown";
}

function classCountFor(column: ModelingTableColumn): number | null {
  const values = new Set(column.sampleValues.filter(value => value !== ""));
  return values.size || null;
}

function looksLikeCountColumn(column: ModelingTableColumn): boolean {
  const lower = column.name.toLowerCase();
  if (/(count|number|visits|admissions|events|episodes)/.test(lower)) return true;
  if (column.min !== undefined && column.max !== undefined && column.min >= 0 && column.max <= 100 && column.sampleValues.length) {
    return column.sampleValues.every(value => Number.isInteger(Number(value)) && Number(value) >= 0);
  }
  return false;
}

function bestGroupingColumn(columns: ModelingTableColumn[]): ModelingTableColumn | null {
  return [...columns].sort((a, b) => {
    const aClasses = classCountFor(a) ?? 999;
    const bClasses = classCountFor(b) ?? 999;
    const aBinaryBonus = aClasses === 2 ? -5 : 0;
    const bBinaryBonus = bClasses === 2 ? -5 : 0;
    return (aClasses + aBinaryBonus + a.missingFraction * 10) - (bClasses + bBinaryBonus + b.missingFraction * 10);
  })[0] ?? null;
}

function statsRunMethodCommandForGuidance(
  method: string,
  request: ModelingDecisionRequest,
  target: ModelingTableColumn | null,
  numericPredictors: ModelingTableColumn[],
  categoricalPredictors: ModelingTableColumn[],
): string | null {
  const shared = `agenteer research stats-run --method ${method} --data <rows.csv> --out-dir <out>`;
  const outcome = target?.name ?? request.target ?? "<outcome>";
  const exposure = numericPredictors[0]?.name ?? categoricalPredictors[0]?.name ?? "<exposure>";
  const group = bestGroupingColumn(categoricalPredictors)?.name ?? "<group>";
  if (["descriptive", "missingness-summary", "pca", "clustering-validation"].includes(method)) return `${shared} --variable <column>`;
  if (["t-test", "welch-t-test", "mann-whitney", "anova", "kruskal-wallis"].includes(method)) return `${shared} --outcome ${outcome} --group ${group}`;
  if (["chi-square", "fisher-exact"].includes(method)) return `${shared} --outcome ${outcome} --exposure ${group}`;
  if (["pearson", "spearman", "kendall"].includes(method)) return `${shared} --outcome ${outcome} --exposure ${exposure}`;
  if (method === "diagnostic-accuracy") return `${shared} --outcome ${outcome} --exposure <binary-index-test>`;
  if (method === "prediction-evaluation") return `${shared} --outcome ${outcome} --exposure <risk-score-or-probability>`;
  if (method.includes("regression") || method.endsWith("-glm")) return `${shared} --outcome ${outcome} --exposure ${exposure}`;
  if (["kaplan-meier", "cox-proportional-hazards", "aalen-johansen-cif"].includes(method)) return `${shared} --time <time> --event ${outcome} --group ${group}`;
  if (method.startsWith("propensity-score")) return `${shared} --outcome ${outcome} --exposure <treatment> --covariate <covariate>`;
  return shared;
}

function deriveBackendEvidence(request: ModelingDecisionRequest): ModelingDecisionPlan["backendEvidence"] {
  if (!request.backendStatus) {
    return { source: "not-supplied", available: [], missing: [], notChecked: [], warnings: [] };
  }
  const available = request.backendStatus.backends.filter(backend => backend.availability === "available").map(backend => backend.id);
  const missing = request.backendStatus.backends.filter(backend => backend.availability === "missing").map(backend => backend.id);
  const notChecked = request.backendStatus.backends.filter(backend => backend.availability === "not_checked").map(backend => backend.id);
  return {
    source: "machine-status",
    available,
    missing,
    notChecked,
    warnings: missing.map(id => issue("warning", "BACKEND_UNAVAILABLE_FOR_MODELING", `${id} is missing in supplied backend status and should not be selected as an executable route.`, [id])),
  };
}

function derivePriorRunEvidence(request: ModelingDecisionRequest): ModelingDecisionPlan["priorRunEvidence"] {
  if (request.priorRuns.length === 0) {
    return {
      source: "none",
      runs: [],
      warnings: [],
      recommendedAction: "No prior run evidence supplied.",
    };
  }
  const runs = request.priorRuns.map(run => {
    const posture = run.posture ?? null;
    const failed = run.status === "failed" || posture === "failed";
    const surveyBlocked = posture === "blocked_survey_required" || run.issueCodes.includes("SURVEY_DESIGN_REQUIRES_SURVEY_RUNNER");
    const invalidBinding = posture === "invalid_binding" || run.issueCodes.some(code => code.includes("BINDING") || code.includes("MISMATCH"));
    const optionalMissing = posture === "optional_dependency_missing";
    const exploratoryBound = posture === "exploratory_standard_table" || posture === "exploratory_prediction";
    const locallyValidated = posture === "locally_validated_prediction";
    const exploratoryUnsupervised = posture === "exploratory_unsupervised";
    if (surveyBlocked) {
      return priorRunAction(run, "rerun-survey-aware", "Prior standard-table run was blocked because complex-survey variance is required.");
    }
    if (invalidBinding) {
      return priorRunAction(run, "repair-execution", "Prior run has invalid or mismatched method/spec binding.");
    }
    if (optionalMissing) {
      return priorRunAction(run, "compare-baseline", "Prior ML candidate requires a missing optional dependency; compare available baselines or install the backend.");
    }
    if (failed) {
      return priorRunAction(run, "repair-execution", "Prior run failed before producing locally reviewable results.");
    }
    if (exploratoryBound) {
      return priorRunAction(run, "rerun-with-binding", "Prior run is exploratory and needs method/spec binding before stronger claims.");
    }
    if (locallyValidated) {
      return priorRunAction(run, "stop-for-validation", "Prior ML run supports local review only; external/temporal validation design is required before stronger claims.");
    }
    if (exploratoryUnsupervised) {
      return priorRunAction(run, "reject-or-redesign", "Prior unsupervised run needs stability and domain-plausibility review before it can be treated as a finding.");
    }
    return priorRunAction(run, "promote-local-review", "Prior run has no blocking posture; use it only for local review unless stronger validation artifacts exist.");
  });
  const warnings = runs.map(run => issue(
    run.action === "promote-local-review" ? "note" : "warning",
    "PRIOR_RUN_POSTURE_REQUIRES_PLANNING_RESPONSE",
    `${run.kind} prior run ${run.path ?? "(inline)"} posture=${run.posture ?? "(missing)"} action=${run.action}.`,
    run.path ? [run.path] : ["priorRuns"],
  ));
  return {
    source: "prior-run-artifacts",
    runs,
    warnings,
    recommendedAction: runs.at(-1)?.reason ?? "No prior run action derived.",
  };
}

function priorRunAction(
  run: ModelingDecisionRequest["priorRuns"][number],
  action: ModelingDecisionPlan["priorRunEvidence"]["runs"][number]["action"],
  reason: string,
): ModelingDecisionPlan["priorRunEvidence"]["runs"][number] {
  return {
    path: run.path ?? null,
    kind: run.kind,
    status: run.status,
    posture: run.posture ?? null,
    methodOrModel: run.methodOrModel ?? null,
    issueCodes: run.issueCodes,
    action,
    reason,
  };
}

function applyBackendEvidence(candidate: ModelingCandidate, evidence: ModelingDecisionPlan["backendEvidence"]): ModelingCandidate {
  if (evidence.source !== "machine-status") return candidate;
  const backend = String(candidate.backend);
  if (backend === "manual-review") return candidate;
  if (evidence.available.includes(backend) || evidence.notChecked.includes(backend)) return candidate;
  if (!evidence.missing.includes(backend)) return candidate;
  return {
    ...candidate,
    compatible: false,
    tier: candidate.tier === "primary" ? "sensitivity" : candidate.tier,
    score: Math.min(candidate.score, 0.38),
    reasons: [...candidate.reasons, `Downgraded because backend ${backend} is missing in supplied machine status.`],
    cautions: [...candidate.cautions, issue("warning", "CANDIDATE_BACKEND_MISSING", `${candidate.id} requires missing backend ${backend}.`, [backend])],
    commandHint: null,
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
  statisticalMethodGuidance: ModelingDecisionPlan["statisticalMethodGuidance"];
}): ModelingCandidate {
  const compatible = method.implementationStatus === "executable" || method.implementationStatus === "contract-ready";
  const backend = preferredBackend(method, opts.request);
  const tier = inferMethodTier(method, opts.inferredGoal, opts.inferredOutcomeType);
  const statsMethod = statsRunMethodForAnalysisMethod(method.id);
  const statsRunAllowed = Boolean(statsMethod) && !opts.request.surveyDesign;
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
      ...guidanceCautionsForMethod(method, opts.statisticalMethodGuidance),
      ...(method.implementationStatus === "design-only" || method.implementationStatus === "blocked"
        ? [issue("warning", "METHOD_NOT_EXECUTABLE", `${method.id} is ${method.implementationStatus}; use as design contract only.`, [method.id])]
        : []),
    ],
    requiredBeforeExecution: [...new Set([...method.requiredFields, ...method.diagnostics, ...opts.requiredBeforeExecution])].slice(0, 12),
    expectedMetrics: method.effectMeasures,
    expectedArtifacts: statsRunAllowed
      ? [...new Set([...method.artifactExpectations, "stats-run.json", "estimates.csv", "diagnostics.json", "stats-report.md", "stats-qa.json"])]
      : method.artifactExpectations,
    commandHint: statsRunAllowed
      ? statsRunCommandHint(statsMethod!, method.id)
      : method.implementationStatus === "executable" || method.implementationStatus === "contract-ready"
        ? `agenteer research method-select --question "${opts.request.question.replaceAll('"', "'")}" --json`
        : null,
  };
}

function guidanceCautionsForMethod(method: AnalysisMethod, guidance: ModelingDecisionPlan["statisticalMethodGuidance"]): MachineIssue[] {
  const statsMethod = statsRunMethodForAnalysisMethod(method.id);
  if (!statsMethod || !guidance.recommendedStatsRunMethod || statsMethod === guidance.recommendedStatsRunMethod) return [];
  if (guidance.alternatives.some(alternative => alternative.method === statsMethod && alternative.tier !== "blocked")) return [];
  return [issue("note", "DATA_AWARE_METHOD_NOT_PRIMARY", `Data-aware guidance prefers ${guidance.recommendedStatsRunMethod}; ${method.id} should be treated as secondary unless justified.`, [method.id])];
}

function statsRunCommandHint(statsMethod: string, methodId: string): string {
  const shared = `agenteer research stats-run --method ${statsMethod} --data <rows.csv> --out-dir <out>`;
  if (statsMethod === "descriptive") return `${shared} --variable <column>`;
  if (statsMethod === "t-test" || statsMethod === "mann-whitney") return `${shared} --outcome <continuous-outcome> --group <binary-group>`;
  if (statsMethod === "chi-square" || statsMethod === "fisher-exact") return `${shared} --outcome <categorical-outcome> --exposure <categorical-exposure>`;
  if (statsMethod === "pearson" || statsMethod === "spearman") return `${shared} --outcome <continuous-outcome> --exposure <continuous-exposure>`;
  if (statsMethod === "linear-regression") return `${shared} --outcome <continuous-outcome> --exposure <exposure> --covariate <covariate>`;
  if (statsMethod === "logistic-regression") return `${shared} --outcome <binary-outcome> --exposure <exposure> --covariate <covariate>`;
  if (statsMethod === "poisson-regression") return `${shared} --outcome <count-outcome> --exposure <exposure> --covariate <covariate>`;
  if (statsMethod === "diagnostic-accuracy") return `${shared} --outcome <binary-reference-standard> --exposure <binary-index-test>`;
  return `${shared} # selected from ${methodId}`;
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

function deriveLiteratureEvidence(request: ModelingDecisionRequest): ModelingDecisionPlan["literatureEvidence"] {
  const context = request.literatureEvidence;
  if (!context) {
    return {
      source: "not-supplied",
      path: null,
      status: null,
      evidenceStrength: null,
      sourceCount: null,
      highQualitySourceCount: null,
      latestPublicationYear: null,
      questionTokenCoverage: null,
      designSignals: [],
      methodSignals: [],
      planningImplications: [],
      followUpSearches: [],
      warnings: [],
    };
  }
  const warnings: MachineIssue[] = [];
  if (context.status === "failed") {
    warnings.push(issue("blocker", "LITERATURE_CONTEXT_FAILED", "Literature context failed; repair or rerun MedBrevia search before using it to justify planning decisions.", ["request.literatureEvidence"]));
  } else if (context.status === "needs_more_evidence" || context.evidenceStrength === "sparse" || context.evidenceStrength === "none") {
    warnings.push(issue("warning", "LITERATURE_CONTEXT_INCOMPLETE", "Literature context is incomplete; keep background and claim boundaries conservative and run follow-up searches before promotion.", ["request.literatureEvidence"]));
  }
  if (context.questionTokenCoverage < 0.2) {
    warnings.push(issue("warning", "LITERATURE_QUESTION_LOW_OVERLAP", `Literature evidence has low question overlap (${(context.questionTokenCoverage * 100).toFixed(1)}%).`, ["request.literatureEvidence.questionTokenCoverage"]));
  }
  if (context.highQualitySourceCount === 0) {
    warnings.push(issue("warning", "LITERATURE_NO_HIGH_QUALITY_SOURCE", "No high-quality literature source was detected; do not use this pass to support strong clinical or causal framing.", ["request.literatureEvidence.highQualitySourceCount"]));
  }
  const latest = context.latestPublicationYear ?? null;
  if (latest != null && new Date().getUTCFullYear() - latest > 10) {
    warnings.push(issue("warning", "LITERATURE_STALE", `Latest literature source appears to be from ${latest}; run a current search before promotion.`, ["request.literatureEvidence.latestPublicationYear"]));
  }
  return {
    source: "literature-context",
    path: context.path ?? null,
    status: context.status,
    evidenceStrength: context.evidenceStrength,
    sourceCount: context.sourceCount,
    highQualitySourceCount: context.highQualitySourceCount,
    latestPublicationYear: latest,
    questionTokenCoverage: context.questionTokenCoverage,
    designSignals: context.designSignals,
    methodSignals: context.methodSignals,
    planningImplications: context.planningImplications,
    followUpSearches: context.followUpSearches,
    warnings,
  };
}

function inferGoal(request: ModelingDecisionRequest): ModelingGoal {
  if (request.goal) return request.goal;
  const q = request.question.toLowerCase();
  const literatureSignals = request.literatureEvidence?.designSignals ?? [];
  if (literatureSignals.includes("diagnostic-accuracy")) return "diagnose";
  if (literatureSignals.includes("prediction-validation")) return "classify";
  if (literatureSignals.includes("causal-inference")) return "causal";
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
  const literatureSignals = request.literatureEvidence?.designSignals ?? [];
  if (literatureSignals.includes("diagnostic-accuracy")) return "diagnostic";
  if (literatureSignals.includes("prediction-validation")) return "prediction";
  if (literatureSignals.includes("randomized-trial")) return "randomized_trial";
  if (literatureSignals.includes("observational-cohort")) return "cohort";
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

function adjustScore(candidate: ModelingCandidate, request: ModelingDecisionRequest, goal: ModelingGoal, guidance: ModelingDecisionPlan["statisticalMethodGuidance"]): number {
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
  const statsMethod = candidate.source === "statistical-method" ? statsRunMethodForAnalysisMethod(candidate.id.replace(/^method:/, "")) : null;
  if (statsMethod && guidance.recommendedStatsRunMethod) {
    if (statsMethod === guidance.recommendedStatsRunMethod) score += 0.14;
    else if (guidance.alternatives.some(alternative => alternative.method === statsMethod && alternative.tier === "sensitivity")) score += 0.04;
    else if (guidance.alternatives.some(alternative => alternative.method === statsMethod && alternative.tier === "fallback")) score -= 0.04;
    else score -= 0.08;
  }
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
