import { z } from "zod";
import { listMlModels, defaultPrimaryMetric } from "./ml/catalog.js";
import type { MlTaskType } from "./ml/schemas.js";
import { stableHash } from "./runtime.js";
import { getStatisticalMethodSpec, statsRunnerCapabilityForMethod, type StatsRunnerCapability } from "./stats/contracts.js";
import { statsRunMethodForAnalysisMethod } from "./stats/method-map.js";
import { statsMethodSchema } from "./stats/schemas.js";
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
import { identifierLikeColumnReason, outcomeOrFutureLeakageReason, semanticPlausibilityIssuesForColumn } from "./semantic-plausibility.js";
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
  roleHints: z.object({
    outcome: z.string().min(1).optional(),
    exposure: z.string().min(1).optional(),
    group: z.string().min(1).optional(),
    time: z.string().min(1).optional(),
    start: z.string().min(1).optional(),
    stop: z.string().min(1).optional(),
    event: z.string().min(1).optional(),
    id: z.string().min(1).optional(),
    cluster: z.string().min(1).optional(),
    strata: z.string().min(1).optional(),
    period: z.string().min(1).optional(),
    post: z.string().min(1).optional(),
    runningVariable: z.string().min(1).optional(),
    instrument: z.string().min(1).optional(),
    weight: z.string().min(1).optional(),
    offset: z.string().min(1).optional(),
    variables: z.array(z.string().min(1)).default([]),
    covariates: z.array(z.string().min(1)).default([]),
    exactCovariates: z.array(z.string().min(1)).default([]),
  }).default({ variables: [], covariates: [], exactCovariates: [] }),
  tableSummary: z.object({
    rowCount: z.number().int().nonnegative(),
    columnCount: z.number().int().nonnegative(),
    columns: z.array(z.object({
      name: z.string().min(1),
      inferredType: z.enum(["number", "string", "boolean", "empty", "mixed", "unknown"]).optional(),
      nonMissingRows: z.number().int().nonnegative(),
      missingFraction: z.number().min(0).max(1),
      uniqueCount: z.number().int().nonnegative().optional(),
      valueCounts: z.array(z.object({
        value: z.string(),
        count: z.number().int().nonnegative(),
        fraction: z.number().min(0).max(1),
      })).default([]),
      sampleValues: z.array(z.string()).default([]),
      min: z.number().optional(),
      max: z.number().optional(),
      mean: z.number().optional(),
      variance: z.number().optional(),
      sd: z.number().optional(),
      median: z.number().optional(),
      q1: z.number().optional(),
      q3: z.number().optional(),
      iqr: z.number().optional(),
      zeroFraction: z.number().optional(),
      skewness: z.number().optional(),
      outlierFraction: z.number().optional(),
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
  feasibilityEvidence: z.object({
    path: z.string().min(1).optional(),
    verdict: z.enum(["reject", "needs_data_profiling", "needs_phenotype_review", "exploratory_only", "formal_analysis_ready", "unknown"]).default("unknown"),
    status: z.enum(["pass", "warning", "block", "unknown"]).default("unknown"),
    score: z.number().min(0).max(1).nullable().optional(),
    confidence: z.number().min(0).max(1).nullable().optional(),
    blockers: z.array(z.string()).default([]),
    warnings: z.array(z.string()).default([]),
    issueCodes: z.array(z.string()).default([]),
    requiredModifications: z.array(z.string()).default([]),
    nextAction: z.string().min(1).nullable().optional(),
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
  feasibilityEvidence: {
    source: "not-supplied" | "controller-feasibility";
    path: string | null;
    verdict: "reject" | "needs_data_profiling" | "needs_phenotype_review" | "exploratory_only" | "formal_analysis_ready" | "unknown";
    status: "pass" | "warning" | "block" | "unknown";
    score: number | null;
    confidence: number | null;
    blockers: string[];
    warningsText: string[];
    issueCodes: string[];
    requiredModifications: string[];
    nextAction: string | null;
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
      targetSkewness: number | null;
      targetOutlierFraction: number | null;
      targetZeroFraction: number | null;
      targetVarianceMeanRatio: number | null;
      estimatedRoleCompleteRows: number | null;
      estimatedRoleCompleteFraction: number | null;
      limitingRoleColumns: string[];
    };
    contract: {
      method: string;
      family: string;
      requiredArguments: string[];
      assumptions: string[];
      diagnostics: string[];
      expectedTables: string[];
      requiredFigures: string[];
      qaGates: string[];
      failureModes: string[];
      interpretationBoundary: string;
    } | null;
    runnerCapability: StatsRunnerCapability | null;
    alternatives: Array<{
      method: string;
      tier: "primary" | "baseline" | "sensitivity" | "fallback" | "blocked";
      reason: string;
      commandHint: string | null;
      expectedQa: string[];
      runnerCapability: StatsRunnerCapability | null;
    }>;
    readiness: {
      status: "ready" | "ready_with_sensitivity" | "exploratory_only" | "blocked";
      reason: string;
      requiredBeforeExecution: string[];
      requiredCompanionMethods: string[];
      enforceCompanionReadiness: boolean;
      promotionBlockers: string[];
    };
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
  const feasibilityEvidence = deriveFeasibilityEvidence(request);
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
  const issues: MachineIssue[] = [...dataEvidence.warnings, ...backendEvidence.warnings, ...priorRunEvidence.warnings, ...literatureEvidence.warnings, ...feasibilityEvidence.warnings];
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
  if (evidenceAdjustedRequest.timeToEvent) {
    issues.push(issue(
      "warning",
      "SURVIVAL_ADVANCED_BACKEND_LIMITED",
      "Core local survival routes are executable with preflight and QA, but time-varying, Fine-Gray, and random-survival-forest analyses still require a dedicated validated backend before strong claims.",
      ["request.timeToEvent"],
    ));
  }

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
    statisticalMethodGuidance,
    primary,
    candidates,
    blockingPolicies,
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
    feasibilityEvidence,
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
  statisticalMethodGuidance: ModelingDecisionPlan["statisticalMethodGuidance"];
  primary: ModelingCandidate | null;
  candidates: ModelingCandidate[];
  blockingPolicies: ModelingCandidate[];
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
  const causalStop = opts.blockingPolicies.find(candidate => candidate.id === "policy:causal-stop-for-review");
  if (causalStop && opts.request.requiresInference) {
    return {
      route: "stop-for-review",
      commandHint: null,
      reason: "Causal inference was requested; complete target-trial/DAG/confounding, positivity, timing, and sensitivity review before executing an effect model.",
      requiredArtifacts: ["causal-design-note.md", "dag-or-confounder-set.json", "positivity-diagnostics.json", "sensitivity-plan.md"],
    };
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
  if (opts.statisticalMethodGuidance.readiness.status === "exploratory_only" && (opts.request.requiresInference || opts.request.requiresPrediction)) {
    return {
      route: "stop-for-review",
      commandHint: null,
      reason: "Profile the dataset and rerun modeling-plan with table-summary evidence before executing a formal stats or ML route.",
      requiredArtifacts: ["table-profile.json", "modeling-plan.json", "method-selection.json"],
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
  const guidedStatsAlternative = opts.statisticalMethodGuidance.alternatives.find(alternative =>
    alternative.method === opts.statisticalMethodGuidance.recommendedStatsRunMethod
    && alternative.tier === "primary"
    && alternative.commandHint?.includes("research stats-run")
  );
  if (guidedStatsAlternative?.commandHint) {
    const capability = guidedStatsAlternative.runnerCapability;
    return {
      route: "stats-run",
      commandHint: guidedStatsAlternative.commandHint,
      reason: capability?.status === "bounded_approximation"
        ? `Data-aware statistical guidance recommends ${guidedStatsAlternative.method} as the primary executable route, but the local runner marks it as a bounded approximation: ${capability.reason}`
        : `Data-aware statistical guidance recommends ${guidedStatsAlternative.method} as the primary executable route.`,
      requiredArtifacts: ["stats-run.json", "estimates.csv", "diagnostics.json", "stats-report.md", "stats-qa.json"],
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
  const target = request.target ?? request.roleHints.outcome ?? null;
  const targetColumn = target && summary ? summary.columns.find(column => column.name === target) ?? null : null;
  const predictors = summary ? summary.columns.filter(column => column.name !== target) : [];
  const numericPredictors = predictors.filter(column => columnKind(column) === "continuous" || columnKind(column) === "count");
  const categoricalPredictors = predictors.filter(column => columnKind(column) === "binary" || columnKind(column) === "categorical");
  const hintedOutcomeColumn = columnByName(summary, request.roleHints.outcome);
  const hintedExposureColumn = columnByName(summary, request.roleHints.exposure);
  const hintedGroupColumn = columnByName(summary, request.roleHints.group);
  const hintedTimeColumn = columnByName(summary, request.roleHints.stop ?? request.roleHints.time);
  const hintedEventColumn = columnByName(summary, request.roleHints.event);
  const hintedIdColumn = columnByName(summary, request.roleHints.id);
  const hintedClusterColumn = columnByName(summary, request.roleHints.cluster);
  const hintedPeriodColumn = columnByName(summary, request.roleHints.period);
  const hintedPostColumn = columnByName(summary, request.roleHints.post);
  const hintedRunningVariableColumn = columnByName(summary, request.roleHints.runningVariable);
  const hintedInstrumentColumn = columnByName(summary, request.roleHints.instrument);
  const repeatedMeasures = repeatedMeasureColumns(targetColumn, numericPredictors, request);
  const repeatedBinaryMeasures = repeatedBinaryMeasureColumns(targetColumn, categoricalPredictors, request);
  const correlatedOutcomeStructure = hasCorrelatedOutcomeStructure(request);
  const clusterColumn = hintedClusterColumn ?? hintedIdColumn ?? bestClusterColumn(predictors, summary?.rowCount ?? null);
  const survivalTimeColumn = hintedTimeColumn ?? bestSurvivalTimeColumn(numericPredictors);
  const numericExposureColumn = hintedExposureColumn && isNumericAnalysisColumn(hintedExposureColumn) ? hintedExposureColumn : bestNumericExposureColumn(numericPredictors, clusterColumn);
  const correlationIntent = hasCorrelationIntent(request);
  const quasiExperimentalIntent = inferQuasiExperimentalIntent(request);
  const hintedTreatmentColumn = hintedExposureColumn ?? hintedGroupColumn;
  const treatmentColumn = hintedTreatmentColumn ?? bestTreatmentColumn(numericPredictors, categoricalPredictors, clusterColumn);
  const postColumn = hintedPostColumn ?? bestPostColumn([...numericPredictors, ...categoricalPredictors]);
  const periodColumn = hintedPeriodColumn ?? (quasiExperimentalIntent === "event-study-did" ? bestPostColumn([...numericPredictors, ...categoricalPredictors]) : null);
  const trendTimeColumn = hintedTimeColumn ?? bestTrendTimeColumn(numericPredictors);
  const runningVariableColumn = hintedRunningVariableColumn ?? bestRunningVariableColumn(numericPredictors);
  const instrumentColumn = hintedInstrumentColumn ?? bestInstrumentColumn([...numericPredictors, ...categoricalPredictors], treatmentColumn, clusterColumn);
  const genericGroupingColumn = hintedGroupColumn
    ?? (hintedExposureColumn && isGroupingAnalysisColumn(hintedExposureColumn) ? hintedExposureColumn : null)
    ?? bestGroupingColumn(categoricalPredictors);
  const maxMissingFraction = summary ? summary.columns.reduce((max, column) => Math.max(max, column.missingFraction), 0) : null;
  const targetType = targetColumn ? targetKindForGuidance(targetColumn, outcomeType) : outcomeTypeToTargetKind(outcomeType);
  const classCount = targetColumn ? classCountFor(targetColumn) : request.classCount ?? null;
  const targetBinaryCounts = targetColumn ? binaryCountsFor(targetColumn) : null;
  const eventCount = targetBinaryCounts?.eventCount ?? null;
  const nonEventCount = targetBinaryCounts?.nonEventCount ?? null;
  const minTargetClassCount = minValueCount(targetColumn);
  const targetShape = numericShapeForColumn(targetColumn);
  const warnings: MachineIssue[] = [];
  const blockers: MachineIssue[] = [];
  const alternatives: ModelingDecisionPlan["statisticalMethodGuidance"]["alternatives"] = [];
  const roleHintIssues = roleHintResolutionIssues(request, summary, {
    outcome: hintedOutcomeColumn,
    exposure: hintedExposureColumn,
    group: hintedGroupColumn,
    time: hintedTimeColumn,
    start: columnByName(summary, request.roleHints.start),
    stop: columnByName(summary, request.roleHints.stop),
    event: hintedEventColumn,
    id: hintedIdColumn,
    cluster: hintedClusterColumn,
    strata: columnByName(summary, request.roleHints.strata),
    period: hintedPeriodColumn,
    post: hintedPostColumn,
    runningVariable: hintedRunningVariableColumn,
    instrument: hintedInstrumentColumn,
    weight: columnByName(summary, request.roleHints.weight),
    offset: columnByName(summary, request.roleHints.offset),
  });
  warnings.push(...roleHintIssues.warnings);
  blockers.push(...roleHintIssues.blockers);
  const add = (
    method: string,
    tier: ModelingDecisionPlan["statisticalMethodGuidance"]["alternatives"][number]["tier"],
    reason: string,
    expectedQa: string[],
  ) => {
    const runnerCapability = runnerCapabilityForStatsMethodString(method, request);
    alternatives.push({
      method,
      tier: runnerCapability?.status === "backend_blocked" ? "blocked" : tier,
      reason,
      commandHint: statsRunMethodCommandForGuidance(method, request, targetColumn, numericPredictors, categoricalPredictors),
      expectedQa,
      runnerCapability,
    });
  };
  const rowCountForGuidance = summary?.rowCount ?? request.rowCount ?? null;
  const semanticReview = semanticPlausibilityReviewForGuidance({
    request,
    summary,
    goal,
    rowCount: rowCountForGuidance,
    roleColumns: [
      targetColumn,
      hintedOutcomeColumn,
      hintedExposureColumn,
      hintedGroupColumn,
      hintedTimeColumn,
      hintedEventColumn,
      hintedIdColumn,
      hintedClusterColumn,
      hintedPeriodColumn,
      hintedPostColumn,
      hintedRunningVariableColumn,
      hintedInstrumentColumn,
      numericExposureColumn,
      genericGroupingColumn,
      treatmentColumn,
      postColumn,
      periodColumn,
      trendTimeColumn,
      runningVariableColumn,
      instrumentColumn,
      survivalTimeColumn,
      clusterColumn,
      ...request.roleHints.variables.map(name => columnByName(summary, name)),
      ...request.roleHints.covariates.map(name => columnByName(summary, name)),
      ...request.roleHints.exactCovariates.map(name => columnByName(summary, name)),
    ],
    predictorColumns: predictors,
  });
  warnings.push(...semanticReview.warnings);
  blockers.push(...semanticReview.blockers);
  const identifierReview = identifierRoleReviewForGuidance({
    request,
    summary,
    goal,
    rowCount: rowCountForGuidance,
    roles: [
      { role: "outcome", column: targetColumn, allowedIdentifier: false },
      { role: "declared outcome", column: hintedOutcomeColumn, allowedIdentifier: false },
      { role: "declared exposure", column: hintedExposureColumn, allowedIdentifier: false },
      { role: "declared group", column: hintedGroupColumn, allowedIdentifier: false },
      { role: "declared event", column: hintedEventColumn, allowedIdentifier: false },
      { role: "declared time", column: hintedTimeColumn, allowedIdentifier: false },
      { role: "declared period", column: hintedPeriodColumn, allowedIdentifier: false },
      { role: "declared post indicator", column: hintedPostColumn, allowedIdentifier: false },
      { role: "declared running variable", column: hintedRunningVariableColumn, allowedIdentifier: false },
      { role: "declared instrument", column: hintedInstrumentColumn, allowedIdentifier: false },
      { role: "declared id", column: hintedIdColumn, allowedIdentifier: true },
      { role: "declared cluster", column: hintedClusterColumn, allowedIdentifier: true },
      { role: "inferred numeric exposure", column: numericExposureColumn, allowedIdentifier: false },
      { role: "inferred grouping variable", column: genericGroupingColumn, allowedIdentifier: false },
      { role: "inferred treatment variable", column: treatmentColumn, allowedIdentifier: false },
      { role: "inferred survival time", column: survivalTimeColumn, allowedIdentifier: false },
      { role: "inferred cluster/id support", column: clusterColumn, allowedIdentifier: true },
      ...request.roleHints.variables.map(name => ({ role: "declared variable", column: columnByName(summary, name), allowedIdentifier: false })),
      ...request.roleHints.covariates.map(name => ({ role: "declared covariate", column: columnByName(summary, name), allowedIdentifier: false })),
      ...request.roleHints.exactCovariates.map(name => ({ role: "declared exact covariate", column: columnByName(summary, name), allowedIdentifier: false })),
    ],
    predictorColumns: predictors,
  });
  warnings.push(...identifierReview.warnings);
  blockers.push(...identifierReview.blockers);
  const leakageReview = outcomeLeakageReviewForGuidance({
    request,
    summary,
    goal,
    targetName: target,
    roles: [
      { role: "outcome", column: targetColumn, leakageAllowed: true },
      { role: "declared outcome", column: hintedOutcomeColumn, leakageAllowed: true },
      { role: "declared exposure", column: hintedExposureColumn, leakageAllowed: false },
      { role: "declared group", column: hintedGroupColumn, leakageAllowed: false },
      { role: "declared event", column: hintedEventColumn, leakageAllowed: true },
      { role: "declared time", column: hintedTimeColumn, leakageAllowed: true },
      { role: "declared period", column: hintedPeriodColumn, leakageAllowed: true },
      { role: "declared post indicator", column: hintedPostColumn, leakageAllowed: true },
      { role: "declared running variable", column: hintedRunningVariableColumn, leakageAllowed: false },
      { role: "declared instrument", column: hintedInstrumentColumn, leakageAllowed: false },
      { role: "inferred numeric exposure", column: numericExposureColumn, leakageAllowed: false },
      { role: "inferred grouping variable", column: genericGroupingColumn, leakageAllowed: false },
      { role: "inferred treatment variable", column: treatmentColumn, leakageAllowed: false },
      ...request.roleHints.variables.map(name => ({ role: "declared variable", column: columnByName(summary, name), leakageAllowed: false })),
      ...request.roleHints.covariates.map(name => ({ role: "declared covariate", column: columnByName(summary, name), leakageAllowed: false })),
      ...request.roleHints.exactCovariates.map(name => ({ role: "declared exact covariate", column: columnByName(summary, name), leakageAllowed: false })),
    ],
    predictorColumns: predictors,
  });
  warnings.push(...leakageReview.warnings);
  blockers.push(...leakageReview.blockers);
  const feasibilityReview = feasibilityEvidenceReviewForGuidance(request);
  warnings.push(...feasibilityReview.warnings);
  blockers.push(...feasibilityReview.blockers);
  const candidateParameterCount = approximateGuidanceParameterCount(numericPredictors, categoricalPredictors);
  const eventsPerCandidateParameter = eventCount !== null ? eventCount / candidateParameterCount : null;
  const binaryMinorityClassCount = eventCount !== null && nonEventCount !== null ? Math.min(eventCount, nonEventCount) : eventCount;
  const minorityRowsPerCandidateParameter = binaryMinorityClassCount !== null ? binaryMinorityClassCount / candidateParameterCount : null;
  const rowsPerCandidateParameter = rowCountForGuidance !== null ? rowCountForGuidance / candidateParameterCount : null;
  const roleCompleteSupport = estimateGuidanceRoleCompleteSupport(rowCountForGuidance, roleSupportColumnsForGuidance({
    goal,
    request,
    targetColumn,
    targetType,
    numericExposureColumn,
    genericGroupingColumn,
    treatmentColumn,
    postColumn,
    periodColumn,
    trendTimeColumn,
    runningVariableColumn,
    instrumentColumn,
    survivalTimeColumn,
    clusterColumn,
    repeatedMeasures,
    repeatedBinaryMeasures,
    quasiExperimentalIntent,
  }));
  const competingEventEvidence = eventStateEvidenceForGuidance(targetColumn, outcomeType, request);

  if (!summary) {
    warnings.push(issue("warning", "METHOD_GUIDANCE_REQUEST_ONLY", "No table summary was supplied; method guidance is based on declared question shape only.", ["request.tableSummary"]));
  }
  if (target && summary && !targetColumn) {
    blockers.push(issue("blocker", "METHOD_GUIDANCE_TARGET_MISSING", `Target/outcome '${target}' is missing from the table summary.`, ["request.target", "request.roleHints.outcome", "tableSummary.columns"]));
  }
  if (targetColumn?.missingFraction && targetColumn.missingFraction > 0.2) {
    warnings.push(issue("warning", "METHOD_GUIDANCE_TARGET_MISSINGNESS", `Target '${targetColumn.name}' is ${(targetColumn.missingFraction * 100).toFixed(1)}% missing; missingness review should precede inference.`, [targetColumn.name]));
  }
  if (targetColumn && targetColumn.nonMissingRows < Math.max(8, Math.min(30, (summary?.rowCount ?? 0) * 0.2))) {
    blockers.push(issue("blocker", "METHOD_GUIDANCE_TARGET_SUPPORT_TOO_LOW", `Target '${targetColumn.name}' has only ${targetColumn.nonMissingRows} non-missing row(s); formal method selection should wait for better outcome support.`, [targetColumn.name]));
  }
  if (targetColumn && targetType !== "categorical" && targetType !== "binary" && classCount !== null && classCount < 2) {
    blockers.push(issue("blocker", "METHOD_GUIDANCE_TARGET_VARIATION_INSUFFICIENT", `Target '${targetColumn.name}' has fewer than two observed values; inferential modeling is not meaningful.`, [targetColumn.name]));
  }
  if (targetColumn && classCount !== null && targetType !== "continuous" && classCount > 20) {
    warnings.push(issue("warning", "METHOD_GUIDANCE_HIGH_CARDINALITY_TARGET", `Target '${targetColumn.name}' has ${classCount} observed levels; verify that this is an outcome rather than an identifier or free-text field.`, [targetColumn.name]));
  }
  if (targetType === "binary" && eventCount !== null && eventCount < 10) {
    warnings.push(issue("warning", "METHOD_GUIDANCE_RARE_BINARY_EVENT", `Binary target '${targetColumn?.name ?? target ?? "outcome"}' has only ${eventCount} positive event(s); prefer exact/descriptive, penalized, or design-review routes over ordinary logistic inference.`, [targetColumn?.name ?? target ?? "outcome"]));
  }
  if (targetType === "categorical" && minTargetClassCount !== null && minTargetClassCount < 5) {
    warnings.push(issue("warning", "METHOD_GUIDANCE_SPARSE_TARGET_LEVEL", `Target '${targetColumn?.name ?? target ?? "outcome"}' has a sparse observed level with ${minTargetClassCount} row(s); exact/suppressed or collapsed-category analysis may be required.`, [targetColumn?.name ?? target ?? "outcome"]));
  }
  if (maxMissingFraction !== null && maxMissingFraction > 0.35) {
    warnings.push(issue("warning", "METHOD_GUIDANCE_HIGH_TABLE_MISSINGNESS", `At least one table column is ${(maxMissingFraction * 100).toFixed(1)}% missing; add missingness-summary and sensitivity analysis.`, ["tableSummary.columns"]));
    add("missingness-summary", "sensitivity", "High missingness should be explicitly profiled before formal modeling.", ["missingness patterns", "complete-case counts", "MNAR/MAR review"]);
  }
  if (roleCompleteSupport.estimatedRows !== null && roleCompleteSupport.columns.length >= 2) {
    const lowSupportThreshold = Math.max(20, Math.ceil((rowCountForGuidance ?? 0) * 0.1));
    if (roleCompleteSupport.estimatedRows < 10) {
      blockers.push(issue(
        "blocker",
        "METHOD_GUIDANCE_ROLE_COMPLETE_SUPPORT_TOO_LOW",
        `The likely analysis-role complete-case support is only about ${roleCompleteSupport.estimatedRows} row(s) after considering missingness in ${roleCompleteSupport.limitingColumns.join(", ")}.`,
        roleCompleteSupport.limitingColumns,
      ));
    } else if (roleCompleteSupport.estimatedRows < lowSupportThreshold) {
      warnings.push(issue(
        "warning",
        "METHOD_GUIDANCE_ROLE_COMPLETE_SUPPORT_LOW",
        `The likely analysis-role complete-case support is about ${roleCompleteSupport.estimatedRows} row(s), below the ${lowSupportThreshold}-row review threshold after considering missingness in ${roleCompleteSupport.limitingColumns.join(", ")}.`,
        roleCompleteSupport.limitingColumns,
      ));
    }
  }
  if (targetShape.skewness !== null && Math.abs(targetShape.skewness) > 1.5) {
    warnings.push(issue("warning", "METHOD_GUIDANCE_TARGET_SKEWED", `Target '${targetColumn?.name ?? target ?? "outcome"}' is strongly skewed (skewness ${targetShape.skewness.toFixed(2)}); prefer robust/rank/skew-aware methods or add them as sensitivity analyses.`, [targetColumn?.name ?? target ?? "outcome"]));
  }
  if (targetShape.outlierFraction !== null && targetShape.outlierFraction > 0.05) {
    warnings.push(issue("warning", "METHOD_GUIDANCE_TARGET_OUTLIERS", `Target '${targetColumn?.name ?? target ?? "outcome"}' has ${(targetShape.outlierFraction * 100).toFixed(1)}% Tukey outlier(s); add influence/robustness diagnostics before interpreting mean-based models.`, [targetColumn?.name ?? target ?? "outcome"]));
  }

  const smallSample = (rowCountForGuidance ?? 0) > 0 && (rowCountForGuidance ?? 0) < 50;
  if (smallSample) warnings.push(issue("warning", "METHOD_GUIDANCE_SMALL_SAMPLE", "Small sample detected; prefer exact, nonparametric, descriptive, or penalized routes over high-parameter models.", ["tableSummary.rowCount"]));
  const sparseGroupingColumn = categoricalPredictors.find(column => {
    const minCount = minValueCount(column);
    return minCount !== null && minCount < 5;
  });
  if (sparseGroupingColumn) {
    warnings.push(issue("warning", "METHOD_GUIDANCE_SPARSE_GROUP", `Grouping/predictor column '${sparseGroupingColumn.name}' has a sparse observed level; verify small-cell policy before group comparisons.`, [sparseGroupingColumn.name]));
  }
  if (request.repeatedMeasures && repeatedMeasures.length < 2 && repeatedBinaryMeasures.length < 2) {
    blockers.push(issue("blocker", "METHOD_GUIDANCE_REPEATED_MEASURES_MISSING", "Repeated-measures analysis was requested, but fewer than two repeated numeric or binary measurement columns were visible in the table summary.", ["request.repeatedMeasures", "tableSummary.columns"]));
  }
  if (correlatedOutcomeStructure && summary && !clusterColumn && !request.repeatedMeasures) {
    blockers.push(issue(
      "blocker",
      "METHOD_GUIDANCE_CLUSTER_ID_MISSING",
      "Clustered/longitudinal association was requested, but no plausible subject, cluster, site, or provider identifier was visible in the table summary.",
      ["request.clustered", "request.dataStructures", "tableSummary.columns"],
    ));
  }
  if ((request.timeToEvent || outcomeType === "time_to_event") && summary && !survivalTimeColumn) {
    blockers.push(issue(
      "blocker",
      "METHOD_GUIDANCE_TIME_VARIABLE_MISSING",
      "Time-to-event analysis was requested, but no plausible follow-up/time-at-risk variable was visible in the table summary.",
      ["request.timeToEvent", "tableSummary.columns"],
    ));
  }
  if ((request.timeToEvent || outcomeType === "time_to_event") && competingEventEvidence.hasCompetingStates) {
    warnings.push(issue(
      "warning",
      "METHOD_GUIDANCE_COMPETING_EVENT_STATES",
      `${targetColumn?.name ?? target ?? "event"} appears to use multistate competing-event coding (${competingEventEvidence.levelSummary}); ordinary survival models require an event-specific binary recode and explicit competing-risk interpretation.`,
      [targetColumn?.name ?? target ?? "event"],
    ));
  }

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
    const grouping = genericGroupingColumn;
    const adjustmentRequested = hasAdjustmentIntent(request);
    const adjustmentCovariates = grouping
      ? bestAdjustmentCovariates([...numericPredictors, ...categoricalPredictors], new Set([grouping.name, clusterColumn?.name].filter((name): name is string => Boolean(name))))
      : [];
    if (summary && !grouping && !request.repeatedMeasures) {
      blockers.push(issue("blocker", "METHOD_GUIDANCE_GROUPING_MISSING", "A group-comparison question was requested, but no categorical grouping variable with usable levels was visible in the table summary.", ["request.question", "tableSummary.columns"]));
    }
    if (adjustmentRequested && grouping && adjustmentCovariates.length === 0 && !request.repeatedMeasures) {
      blockers.push(issue(
        "blocker",
        "METHOD_GUIDANCE_ADJUSTMENT_COVARIATES_MISSING",
        "The question asks for adjusted comparison, but no usable baseline covariate columns were visible after excluding the group and design identifiers.",
        ["request.question", "tableSummary.columns"],
      ));
    }
    if (outcomeType === "time_to_event" || request.timeToEvent) {
      if (competingEventEvidence.hasCompetingStates) {
        recommended = "aalen-johansen-cif";
        rationale = "Time-to-event comparison uses multistate event coding, so cumulative incidence with competing-event accounting must come before ordinary log-rank, Kaplan-Meier, or Cox summaries.";
        add("aalen-johansen-cif", "primary", rationale, ["competing event coding", "CIF curves", "death/competing-event accounting", "time origin"]);
        add("fine-gray", "sensitivity", "Fine-Gray-style subdistribution regression is available as bounded local methods-review evidence when regression is needed, but subdistribution hazard ratios still require confirmation in a validated competing-risk backend.", ["validated competing-risk backend confirmation", "subdistribution-hazard interpretation", "event coding"]);
        add("cox-proportional-hazards", "blocked", "Cause-specific Cox requires a prespecified event-of-interest binary recode and must not silently censor competing events for the primary comparison.", ["event-specific recode", "cause-specific interpretation", "PH diagnostics"]);
        add("kaplan-meier", "blocked", "Kaplan-Meier treats competing events as censored and is not a primary competing-risk estimate unless that limitation is explicitly justified.", ["competing-event limitation", "risk-set interpretation"]);
      } else {
        recommended = grouping ? "log-rank" : "kaplan-meier";
        rationale = grouping
          ? "Time-to-event group comparisons require survival curves, censoring review, risk tables, and log-rank testing before regression claims."
          : "Time-to-event data were declared without a clear grouping variable. Kaplan-Meier estimation is executable as an overall survival summary, but it does not answer the requested group comparison until a group variable is supplied.";
        add("kaplan-meier", grouping ? "baseline" : "primary", "Start with nonparametric survival curves and censoring/risk-table review.", ["risk tables", "censoring pattern", "time origin"]);
        if (grouping) add("log-rank", "primary", rationale, ["risk tables", "censoring pattern", "group counts"]);
        add("cox-proportional-hazards", "sensitivity", "Use adjusted Cox modeling only after exposure/covariate roles, event counts, and proportional-hazards diagnostics are reviewed.", ["PH diagnostics", "event count", "EPV", "censoring definition"]);
        add("aalen-johansen-cif", "sensitivity", "Use when a competing event is defined and death/competing risks matter.", ["competing event coding", "CIF curves"]);
      }
    } else if (request.repeatedMeasures && (repeatedMeasures.length >= 2 || repeatedBinaryMeasures.length >= 2)) {
      if (targetType === "binary" && repeatedBinaryMeasures.length >= 2) {
        if (repeatedBinaryMeasures.length === 2) {
          recommended = "mcnemar";
          rationale = "Two repeated binary measurements on the same units: McNemar is the correct paired binary route when discordant-pair support is adequate.";
          add("mcnemar", "primary", rationale, ["paired completeness", "binary coding", "discordant pairs"]);
          add("descriptive", "baseline", "Report paired binary counts and discordant-pair support before interpreting the exact/asymptotic contrast.", ["paired counts", "discordant pairs"]);
        } else {
          recommended = "cochran-q";
          rationale = "More than two repeated binary measurements were detected; Cochran's Q is the correct omnibus related-proportions route before post-hoc paired contrasts.";
          add("cochran-q", "primary", rationale, ["paired completeness", "binary coding", "within-subject response variation", "post-hoc/multiplicity policy"]);
          add("mcnemar", "sensitivity", "Use for prespecified post-hoc paired binary contrasts after omnibus Cochran's Q review.", ["discordant pairs", "multiplicity policy"]);
        }
      } else if (repeatedMeasures.length === 2) {
        recommended = smallSample ? "wilcoxon" : "paired-t-test";
        rationale = smallSample
          ? "Repeated paired measurements with small sample: Wilcoxon signed-rank is safer as the primary executable paired comparison."
          : "Two repeated measurements on the same units: paired t-test is the correct primary route when the within-pair difference distribution is acceptable.";
        add(recommended, "primary", rationale, ["paired completeness", "difference distribution", "within-subject pairing integrity"]);
        add(recommended === "paired-t-test" ? "wilcoxon" : "paired-t-test", "sensitivity", "Use as a sensitivity route for paired-difference distribution assumptions.", ["paired completeness", "difference distribution"]);
      } else {
        recommended = "friedman";
        rationale = "More than two repeated measurements were detected; Friedman provides a nonparametric repeated-measure omnibus test before post-hoc contrasts.";
        add("friedman", "primary", rationale, ["repeated-measure completeness", "subject-level pairing integrity", "post-hoc/multiplicity policy"]);
        add("repeated-measures-anova", "sensitivity", "Use only when repeated-measures ANOVA assumptions and sphericity policy are reviewed.", ["sphericity", "residual diagnostics", "post-hoc/multiplicity policy"]);
      }
    } else if (targetType === "continuous" && grouping) {
      if (adjustmentRequested && adjustmentCovariates.length > 0) {
        recommended = "ancova";
        rationale = `Adjusted continuous group comparison requested; ANCOVA is the primary route using ${grouping.name} as the group term and prespecified baseline covariates.`;
        add("ancova", "primary", rationale, ["covariate set", "group counts", "residual diagnostics", "linearity/homogeneity review", "effect-size/CI consistency"]);
        add(classCountFor(grouping) === 2 ? "welch-t-test" : "anova", "baseline", "Report the transparent unadjusted group comparison as a baseline, not as the adjusted answer.", ["unadjusted effect size", "distribution review"]);
        add("robust-linear-regression", "sensitivity", "Use when influence/outlier diagnostics threaten adjusted mean-model interpretation.", ["influence points", "robustness of adjusted group effect"]);
      } else if (classCountFor(grouping) === 2) {
        const rankPreferred = smallSample
          || (minValueCount(grouping) ?? Number.POSITIVE_INFINITY) < 5
          || Math.abs(targetShape.skewness ?? 0) > 1.5
          || (targetShape.outlierFraction ?? 0) > 0.05;
        recommended = rankPreferred ? "mann-whitney" : "welch-t-test";
        rationale = smallSample
          ? "Continuous outcome with two groups and small sample: rank-based comparison is safer as the primary executable check."
          : (minValueCount(grouping) ?? Number.POSITIVE_INFINITY) < 5
            ? "Continuous outcome with a very sparse comparison group: rank-based comparison is safer as the primary executable check."
          : Math.abs(targetShape.skewness ?? 0) > 1.5 || (targetShape.outlierFraction ?? 0) > 0.05
            ? "Continuous outcome has strong skew/outlier evidence in the table summary, so Mann-Whitney is safer as the primary screening comparison with Welch as a sensitivity analysis."
          : "Continuous outcome with two groups: Welch t-test is preferred unless equal variances are proven.";
        add(recommended, "primary", rationale, ["group counts", "distribution plots", "effect size", "variance/normality review"]);
        add(recommended === "mann-whitney" ? "welch-t-test" : "mann-whitney", "sensitivity", "Use as a sensitivity route for distributional assumptions.", ["group counts", "distribution shape"]);
      } else {
        const rankPreferred = smallSample || Math.abs(targetShape.skewness ?? 0) > 1.5 || (targetShape.outlierFraction ?? 0) > 0.05;
        recommended = rankPreferred ? "kruskal-wallis" : "anova";
        rationale = rankPreferred
          ? "Continuous outcome has small-sample or skew/outlier evidence across more than two groups, so Kruskal-Wallis is safer as the primary omnibus comparison."
          : "Continuous outcome with more than two groups: use ANOVA with Kruskal-Wallis as a distribution-robust sensitivity route.";
        add(recommended, "primary", rationale, ["group counts", "post-hoc/multiplicity policy", "distribution review"]);
        add(recommended === "anova" ? "kruskal-wallis" : "anova", "sensitivity", "Use as an assumption-checking companion route.", ["rank method disclosure", "variance/normality review"]);
      }
    } else if ((targetType === "binary" || targetType === "categorical") && grouping) {
      const outcomeLevels = targetColumn ? classCountFor(targetColumn) : classCount;
      const groupLevels = classCountFor(grouping);
      const twoByTwo = outcomeLevels === 2 && groupLevels === 2;
      const sparseCategorical = smallSample || (eventCount !== null && eventCount < 10) || (minValueCount(grouping) ?? Number.POSITIVE_INFINITY) < 5 || (minTargetClassCount ?? Number.POSITIVE_INFINITY) < 5;
      if (adjustmentRequested && adjustmentCovariates.length > 0) {
        if (targetType === "binary" || outcomeLevels === 2) {
          const parameterCount = approximateSelectedGuidanceParameterCount([grouping, ...adjustmentCovariates]);
          const minorityClassCount = eventCount !== null && nonEventCount !== null ? Math.min(eventCount, nonEventCount) : eventCount;
          const minorityRowsPerParameter = minorityClassCount !== null ? minorityClassCount / parameterCount : null;
          recommended = minorityRowsPerParameter !== null && minorityRowsPerParameter < 10 ? "penalized-logistic-regression" : "logistic-regression";
          rationale = minorityRowsPerParameter !== null && minorityRowsPerParameter < 10
            ? `Adjusted binary group comparison requested, but minority-class rows per expanded candidate parameter is ${minorityRowsPerParameter.toFixed(1)} after categorical expansion; use penalized logistic or reduce covariates before ordinary adjusted inference.`
            : `Adjusted binary group comparison requested; logistic regression is the primary route using ${grouping.name} as the group/exposure term with baseline covariates.`;
          add(recommended, "primary", rationale, ["event count", "separation diagnostics", "EPV", "covariate set", "adjusted effect-size/CI"]);
          add("chi-square", "baseline", "Report the unadjusted categorical table as a baseline, not as the adjusted answer.", ["cell counts", "expected counts", "unadjusted effect size"]);
          if (recommended === "penalized-logistic-regression") add("logistic-regression", "blocked", "Ordinary logistic regression should wait until EPV and separation checks are acceptable.", ["EPV", "separation diagnostics"]);
        } else {
          const ordinalRequested = outcomeType === "ordinal" || looksOrdinalOutcome(targetColumn);
          recommended = ordinalRequested ? "ordinal-logistic-regression" : "multinomial-logistic-regression";
          rationale = ordinalRequested
            ? "Adjusted ordered categorical group comparison requested; ordinal logistic regression is the primary route after level-ordering and proportional-odds review."
            : "Adjusted multi-category group comparison requested; multinomial logistic regression is the primary route after sparse-level and convergence review.";
          add(recommended, "primary", rationale, ["level support", "covariate set", "model convergence", ordinalRequested ? "proportional-odds review" : "baseline category"]);
          add("chi-square", "baseline", "Report the unadjusted categorical table as a baseline, not as the adjusted answer.", ["cell counts", "expected counts", "unadjusted association"]);
        }
      } else {
        if (sparseCategorical && !twoByTwo) {
        warnings.push(issue(
          "warning",
          "METHOD_GUIDANCE_EXACT_TEST_REQUIRES_2X2",
          `Sparse categorical table appears to be ${groupLevels ?? "unknown"}x${outcomeLevels ?? "unknown"}; this runner's Fisher exact route is limited to true 2x2 tables.`,
          [grouping.name, targetColumn?.name ?? target ?? "outcome"],
        ));
        }
        recommended = sparseCategorical && twoByTwo ? "fisher-exact" : "chi-square";
        rationale = sparseCategorical && twoByTwo
          ? "Categorical comparison has sparse/small 2x2 support; Fisher exact is safer than asymptotic chi-square."
          : sparseCategorical
            ? "Categorical comparison is sparse but not a true 2x2 table; use chi-square only as a reviewed/sensitivity route with sparse-cell disclosure rather than forcing Fisher exact."
            : "Categorical comparison: start with chi-square and fall back to Fisher/exact review only for true sparse 2x2 tables.";
        add(recommended, "primary", rationale, ["cell counts", "expected counts", "effect size", "sparse-cell policy"]);
        if (twoByTwo) {
          add(recommended === "chi-square" ? "fisher-exact" : "chi-square", "fallback", "Use when cell-count diagnostics indicate the primary route is inappropriate.", ["2x2 verification", "expected counts"]);
        } else if (sparseCategorical) {
          add("descriptive", "sensitivity", "When sparse multi-level cells make asymptotic inference fragile, report reviewed counts and suppress unstable contrasts.", ["cell counts", "small-cell suppression", "category-collapse rationale"]);
        }
      }
    }
  } else if (goal === "associate" || goal === "causal") {
    if (quasiExperimentalIntent) {
      const addQuasiBlocker = (code: string, message: string, refs: string[]) => blockers.push(issue("blocker", code, message, refs));
      if (quasiExperimentalIntent === "difference-in-differences" || quasiExperimentalIntent === "event-study-did") {
        recommended = quasiExperimentalIntent;
        const timingColumn = quasiExperimentalIntent === "event-study-did" ? periodColumn : postColumn;
        const missingDesign = !treatmentColumn || !timingColumn;
        rationale = quasiExperimentalIntent === "event-study-did"
          ? "Event-study difference-in-differences framing requires treatment timing, pre/post or event-time support, comparison groups, and parallel-trends review before treatment-effect claims."
          : "Difference-in-differences framing requires treatment/comparison groups, pre/post timing, treatment-by-post interaction, and parallel-trends review before causal claims.";
        if (!treatmentColumn) addQuasiBlocker("METHOD_GUIDANCE_TREATMENT_COLUMN_MISSING", "Difference-in-differences requires a treatment/comparison group indicator.", ["request.question", "tableSummary.columns"]);
        if (!timingColumn) addQuasiBlocker(
          quasiExperimentalIntent === "event-study-did" ? "METHOD_GUIDANCE_EVENT_PERIOD_MISSING" : "METHOD_GUIDANCE_POST_PERIOD_MISSING",
          quasiExperimentalIntent === "event-study-did"
            ? "Event-study DiD requires a period/event-time variable, not just a two-period post indicator."
            : "Difference-in-differences requires a pre/post indicator.",
          ["request.question", "tableSummary.columns"],
        );
        add(recommended, missingDesign ? "blocked" : "primary", rationale, ["treatment/control support", "pre/post support", "parallel-trends review", "interaction estimate", "cell counts"]);
        if (quasiExperimentalIntent === "event-study-did") add("difference-in-differences", missingDesign ? "blocked" : "baseline", "Use the bounded two-period DiD route as a baseline while richer event-time support is reviewed.", ["two-period interaction", "parallel-trends review"]);
        if (quasiExperimentalIntent === "difference-in-differences") add("event-study-did", missingDesign ? "blocked" : "sensitivity", "Use when richer event-time or multiple-period support is available and parallel-trends visualization is required.", ["event-time support", "parallel-trends plot"]);
        add("propensity-score-weighting", treatmentColumn ? "sensitivity" : "blocked", "Use only as a measured-confounding sensitivity route; it does not replace the quasi-experimental identifying assumptions.", ["balance/SMD", "positivity", "post-treatment exclusion"]);
      } else if (quasiExperimentalIntent === "interrupted-time-series") {
        recommended = "interrupted-time-series";
        const missingDesign = !trendTimeColumn || !postColumn;
        rationale = "Interrupted time-series framing requires ordered time support, a defined intervention boundary, pre/post observations, and autocorrelation-aware diagnostics.";
        if (!trendTimeColumn) addQuasiBlocker("METHOD_GUIDANCE_TIME_COLUMN_MISSING", "Interrupted time-series requires an ordered time variable.", ["request.question", "tableSummary.columns"]);
        if (!postColumn) addQuasiBlocker("METHOD_GUIDANCE_POST_PERIOD_MISSING", "Interrupted time-series requires a post-intervention indicator.", ["request.question", "tableSummary.columns"]);
        add("interrupted-time-series", missingDesign ? "blocked" : "primary", rationale, ["time ordering", "intervention boundary", "pre/post observations", "autocorrelation/HAC diagnostics"]);
        add("descriptive", "baseline", "Plot outcome over time and mark the intervention boundary before interpreting segmented-regression terms.", ["time plot", "boundary annotation", "missing time points"]);
      } else if (quasiExperimentalIntent === "regression-discontinuity") {
        recommended = "regression-discontinuity";
        const missingDesign = !runningVariableColumn;
        rationale = "Regression-discontinuity framing requires a running/assignment variable, an explicit cutoff, local support on both sides, and bandwidth/manipulation review.";
        if (!runningVariableColumn) addQuasiBlocker("METHOD_GUIDANCE_RUNNING_VARIABLE_MISSING", "Regression discontinuity requires a numeric running or assignment variable.", ["request.question", "tableSummary.columns"]);
        add("regression-discontinuity", missingDesign ? "blocked" : "primary", rationale, ["running variable", "cutoff", "side support", "bandwidth review", "manipulation check"]);
        add("descriptive", "baseline", "Profile observations around the cutoff and outcome continuity before fitting the RDD approximation.", ["cutoff support", "binned means", "density/manipulation review"]);
      } else {
        recommended = "instrumental-variables-2sls";
        const missingDesign = !treatmentColumn || !instrumentColumn;
        rationale = "Instrumental-variable framing requires a treatment/exposure, a prespecified instrument, first-stage strength, exclusion-restriction review, and weak-instrument diagnostics.";
        if (!treatmentColumn) addQuasiBlocker("METHOD_GUIDANCE_TREATMENT_COLUMN_MISSING", "Instrumental-variable analysis requires an endogenous treatment/exposure column.", ["request.question", "tableSummary.columns"]);
        if (!instrumentColumn) addQuasiBlocker("METHOD_GUIDANCE_INSTRUMENT_COLUMN_MISSING", "Instrumental-variable analysis requires a plausible instrument column.", ["request.question", "tableSummary.columns"]);
        add("instrumental-variables-2sls", missingDesign ? "blocked" : "primary", rationale, ["first-stage F statistic", "instrument relevance", "exclusion restriction", "monotonicity/plausibility review"]);
        add("linear-regression", treatmentColumn ? "baseline" : "blocked", "Use as a naive association baseline only; it does not address unmeasured confounding.", ["confounding boundary", "coefficient comparison"]);
      }
    } else if (outcomeType === "time_to_event" || request.timeToEvent) {
      if (competingEventEvidence.hasCompetingStates) {
        recommended = "aalen-johansen-cif";
        rationale = "The event column appears to encode competing event states; start with cumulative incidence and methods review before fitting cause-specific or subdistribution regression.";
        add("aalen-johansen-cif", "primary", rationale, ["competing event coding", "CIF curves", "death/competing-event accounting", "time origin"]);
        add("fine-gray", "sensitivity", "Fine-Gray-style subdistribution regression can be run as bounded local methods-review evidence; do not promote a subdistribution-hazard claim until a validated competing-risk backend confirms it.", ["validated competing-risk backend confirmation", "subdistribution-hazard interpretation"]);
        add("cox-proportional-hazards", "blocked", "Cause-specific Cox requires a prespecified event-of-interest binary recode and explicit disclosure that competing events are handled outside the subdistribution estimand.", ["event-specific recode", "cause-specific interpretation", "PH diagnostics"]);
        add("kaplan-meier", "blocked", "Kaplan-Meier is not a primary competing-risk estimate because competing events are treated as censored.", ["competing-event limitation", "risk-set interpretation"]);
      } else if (request.roleHints.start && request.roleHints.stop && request.roleHints.id) {
        recommended = "time-varying-cox";
        rationale = "Time-to-event interval data declare start, stop, event, subject id, and exposure roles, so an interval-expanded time-varying Cox route is the best local primary model before collapsing intervals to ordinary Cox.";
        add("kaplan-meier", "baseline", "Start with nonparametric survival curves and censoring/risk-table review, recognizing that they do not model time-varying covariates.", ["risk tables", "censoring pattern", "time origin"]);
        add("time-varying-cox", "primary", rationale, ["interval validity", "subject support", "cluster-robust variance", "PH diagnostics"]);
        add("cox-proportional-hazards", "sensitivity", "Use ordinary Cox only as a collapsed fixed-covariate sensitivity after documenting how interval-expanded covariates were summarized.", ["PH diagnostics", "event count", "interval collapse rule"]);
        add("aalen-johansen-cif", "sensitivity", "Use when a competing event is defined and death/competing risks matter.", ["competing event coding", "CIF curves"]);
      } else {
        recommended = "cox-proportional-hazards";
        rationale = "Time-to-event questions require time origin, event/censoring definitions, and proportional-hazards diagnostics; do not collapse them to ordinary binary regression unless follow-up time is irrelevant and explicitly justified.";
        add("kaplan-meier", "baseline", "Start with nonparametric survival curves and censoring/risk-table review.", ["risk tables", "censoring pattern", "time origin"]);
        add("cox-proportional-hazards", "primary", rationale, ["PH diagnostics", "event count", "EPV", "censoring definition"]);
        add("aalen-johansen-cif", "sensitivity", "Use when a competing event is defined and death/competing risks matter.", ["competing event coding", "CIF curves"]);
      }
    } else if (correlatedOutcomeStructure && targetType === "binary") {
      recommended = clusterColumn ? "gee" : "logistic-regression";
      rationale = clusterColumn
        ? `Binary outcome has clustered/repeated structure through ${clusterColumn.name}; GEE is the primary executable population-average route before ordinary independent-row logistic claims.`
        : "Binary outcome has clustered/repeated structure but no usable cluster identifier was visible, so ordinary logistic regression cannot answer the correlated-outcome design without review.";
      add(recommended, clusterColumn ? "primary" : "blocked", rationale, ["cluster/subject support", "within-cluster size", "working correlation", "robust standard errors"]);
      add("logistic-regression", clusterColumn ? "baseline" : "blocked", "Use only as an independence-assumption baseline or after documenting that row-level correlation is negligible.", ["independence assumption", "cluster sensitivity"]);
      add("generalized-mixed-model", clusterColumn ? "sensitivity" : "blocked", "Use as a subject-specific random-intercept sensitivity route; the local backend uses variational Bayes and should be confirmed before strong claims.", ["cluster count", "random-effect structure", "variational-Bayes caveat"]);
    } else if (targetType === "binary") {
      recommended = request.highDimensional || (minorityRowsPerCandidateParameter !== null && minorityRowsPerCandidateParameter < 10) ? "penalized-logistic-regression" : "logistic-regression";
      rationale = minorityRowsPerCandidateParameter !== null && minorityRowsPerCandidateParameter < 10
        ? `Binary outcome has low minority-class rows per expanded candidate parameter (${minorityRowsPerCandidateParameter.toFixed(1)}) after categorical expansion; use penalized logistic or reduce the covariate set before ordinary adjusted inference.`
        : "Binary outcome association should use logistic regression with event-count, separation, and events-per-variable checks.";
      add(recommended, "primary", rationale, ["event count", "separation diagnostics", "EPV", "calibration where predictive"]);
      if (recommended === "penalized-logistic-regression") add("logistic-regression", "blocked", "Ordinary logistic regression should wait until events-per-variable and separation checks are acceptable.", ["EPV", "separation diagnostics"]);
      if (goal === "causal") add("propensity-score-matching", "sensitivity", "Causal framing requires explicit design and balance diagnostics before causal language.", ["balance/SMD", "positivity", "unmeasured confounding sensitivity"]);
    } else if (targetType === "categorical") {
      const levelCount = classCount ?? 0;
      const sparseLevelCount = minTargetClassCount ?? Number.POSITIVE_INFINITY;
      const ordinalRequested = outcomeType === "ordinal" || looksOrdinalOutcome(targetColumn);
      if (levelCount < 3) {
        recommended = "logistic-regression";
        rationale = "Categorical outcome has two observed levels, so binary logistic regression is the executable association route.";
        add("logistic-regression", "primary", rationale, ["event count", "separation diagnostics", "EPV"]);
      } else if (ordinalRequested) {
        recommended = sparseLevelCount < 10 ? "multinomial-logistic-regression" : "ordinal-logistic-regression";
        rationale = sparseLevelCount < 10
          ? `Ordinal outcome has sparse level support (minimum level count ${sparseLevelCount}); ordinary ordinal-logistic assumptions should wait for level review, so multinomial/logistic descriptive sensitivity is safer first.`
          : "Ordered categorical outcome: ordinal logistic regression is the primary association route when level ordering and proportional-odds assumptions are reviewed.";
        add(recommended, "primary", rationale, ["level ordering", "sparse levels", "proportional-odds review", "model convergence"]);
        add(recommended === "ordinal-logistic-regression" ? "multinomial-logistic-regression" : "ordinal-logistic-regression", "sensitivity", "Use as a sensitivity route for ordering/proportional-odds assumptions.", ["level ordering", "proportional-odds review", "model convergence"]);
      } else {
        recommended = "multinomial-logistic-regression";
        rationale = "Unordered categorical outcome with more than two levels: multinomial logistic regression is the primary association route, with sparse-level and convergence review before inference.";
        add("multinomial-logistic-regression", "primary", rationale, ["sparse levels", "model convergence", "baseline category", "parameter capacity"]);
        add("descriptive", "baseline", "Report category counts and reviewed cross-tabulations before relying on multinomial model terms.", ["cell counts", "small-cell suppression"]);
      }
      if (sparseLevelCount < 10) {
        warnings.push(issue(
          "warning",
          "METHOD_GUIDANCE_SPARSE_CATEGORICAL_OUTCOME_MODEL",
          `Categorical outcome '${targetColumn?.name ?? target ?? "outcome"}' has a sparse level with ${sparseLevelCount} row(s); model estimates may be unstable without collapsing, penalization, or descriptive-only reporting.`,
          [targetColumn?.name ?? target ?? "outcome"],
        ));
      }
    } else if (targetType === "count") {
      const zeroFraction = targetShape.zeroFraction ?? (targetColumn ? valueFraction(targetColumn, "0") : null);
      const overdispersed = (targetShape.varianceMeanRatio ?? 0) > 1.5;
      const excessZeros = zeroFraction !== null && zeroFraction > 0.4;
      recommended = excessZeros && overdispersed
        ? "zero-inflated-negative-binomial"
        : excessZeros
          ? "zero-inflated-poisson"
        : overdispersed
          ? "negative-binomial-regression"
          : "poisson-regression";
      rationale = excessZeros && overdispersed
        ? `Count outcome has ${(zeroFraction * 100).toFixed(1)}% zeros and variance/mean ${(targetShape.varianceMeanRatio ?? 0).toFixed(2)}, so zero-inflated negative binomial is the primary route before ordinary Poisson interpretation.`
        : excessZeros
        ? `Count outcome has ${(zeroFraction * 100).toFixed(1)}% zeros; zero-inflated modeling or structural-zero review should precede ordinary Poisson interpretation.`
        : overdispersed
          ? `Count outcome variance/mean is ${(targetShape.varianceMeanRatio ?? 0).toFixed(2)}, so negative-binomial regression is a better primary route than ordinary Poisson.`
        : "Count outcome association should begin with Poisson regression and check overdispersion before negative-binomial escalation.";
      add(recommended, "primary", rationale, ["overdispersion", "zero inflation", "rate denominator"]);
      if (recommended !== "poisson-regression") add("poisson-regression", "fallback", "Use only if zero inflation is ruled out and overdispersion is acceptable.", ["overdispersion", "zero inflation", "rate denominator"]);
      if (recommended !== "negative-binomial-regression") add("negative-binomial-regression", "sensitivity", "Use when overdispersion is detected or expected.", ["overdispersion", "model convergence"]);
      if (recommended !== "zero-inflated-poisson") add("zero-inflated-poisson", "sensitivity", "Use only when excess structural zeros are plausible and reviewed.", ["zero fraction", "structural-zero rationale"]);
      if (recommended !== "zero-inflated-negative-binomial" && (excessZeros || overdispersed)) add("zero-inflated-negative-binomial", "sensitivity", "Use when excess zeros and overdispersion are both supported by table shape and convergence diagnostics.", ["zero fraction", "overdispersion", "model convergence"]);
    } else if (goal === "associate" && targetType === "continuous" && correlationIntent) {
      if (!numericExposureColumn) {
        recommended = "descriptive";
        rationale = "The question asks for correlation/relationship, but no usable continuous exposure variable was visible; start with descriptive profiling and variable-role repair.";
        blockers.push(issue("blocker", "METHOD_GUIDANCE_CORRELATION_EXPOSURE_MISSING", "Correlation analysis requires a second numeric variable besides the target.", ["request.question", "tableSummary.columns"]));
        add("descriptive", "primary", rationale, ["numeric variable support", "missingness", "distribution plausibility"]);
      } else {
        const exposureShape = numericShapeForColumn(numericExposureColumn);
        const candidateCovariate = numericPredictors.find(column => column.name !== numericExposureColumn.name && column.name !== clusterColumn?.name);
        const wantsPartial = Boolean(candidateCovariate) && /\bpartial|adjust(?:ed)?|controll?ing for|covariat|account(?:ing)? for\b/i.test(request.question);
        const rankPreferred = smallSample
          || Math.abs(targetShape.skewness ?? 0) > 1.5
          || Math.abs(exposureShape.skewness ?? 0) > 1.5
          || (targetShape.outlierFraction ?? 0) > 0.05
          || (exposureShape.outlierFraction ?? 0) > 0.05;
        recommended = wantsPartial
          ? "partial-correlation"
          : smallSample && (rowCountForGuidance ?? Number.POSITIVE_INFINITY) < 30
            ? "kendall"
            : rankPreferred
              ? "spearman"
              : "pearson";
        rationale = wantsPartial
          ? `The question asks for an adjusted/partial relationship; use partial correlation between ${targetColumn?.name ?? target ?? "outcome"} and ${numericExposureColumn.name} with prespecified covariate adjustment.`
          : recommended === "kendall"
            ? "Small-sample continuous relationship question: Kendall rank correlation is more stable than Pearson for very small samples."
            : recommended === "spearman"
              ? "Continuous relationship question with skew/outlier/small-sample evidence: Spearman rank correlation is safer than Pearson as the primary correlation route."
              : "Continuous relationship question with adequate distribution evidence: Pearson correlation is the transparent primary route, with rank correlation as a sensitivity check.";
        add(recommended, "primary", rationale, ["pairwise complete rows", "scatterplot", "monotonicity/linearity", "outlier review"]);
        if (recommended !== "pearson") add("pearson", "sensitivity", "Use as a linear-association sensitivity route when outlier and linearity diagnostics are acceptable.", ["scatterplot", "linearity", "outlier review"]);
        if (recommended !== "spearman") add("spearman", "sensitivity", "Use as a monotonic/rank-association sensitivity route.", ["monotonicity", "rank ties", "outlier robustness"]);
        if (recommended !== "kendall" && smallSample) add("kendall", "sensitivity", "Use as a small-sample rank-association sensitivity route.", ["rank ties", "small-sample support"]);
        if (!wantsPartial && candidateCovariate) add("partial-correlation", "sensitivity", "Use only if covariates are prespecified and adjustment is substantively justified.", ["covariate set", "linear residual relationship", "overadjustment review"]);
      }
    } else if (correlatedOutcomeStructure && targetType === "continuous") {
      const positiveSkewed = (targetColumn?.min ?? Number.NEGATIVE_INFINITY) > 0 && (targetShape.skewness ?? 0) > 1.5;
      recommended = clusterColumn ? "linear-mixed-model" : "linear-regression";
      rationale = clusterColumn
        ? `Continuous outcome has clustered/repeated structure through ${clusterColumn.name}; linear mixed modeling is the primary executable subject/cluster-aware route before independent-row regression.`
        : "Continuous outcome has clustered/repeated structure but no usable cluster identifier was visible, so independent-row regression should wait for design repair.";
      if (positiveSkewed) {
        warnings.push(issue(
          "warning",
          "METHOD_GUIDANCE_CORRELATED_SKEWED_CONTINUOUS_OUTCOME",
          `Target '${targetColumn?.name ?? target ?? "outcome"}' is strictly positive and strongly skewed, but the local correlated-outcome routes are Gaussian; add Gamma/quantile sensitivity or route to a richer backend before strong claims.`,
          [targetColumn?.name ?? target ?? "outcome"],
        ));
      }
      add(recommended, clusterColumn ? "primary" : "blocked", rationale, ["cluster/subject support", "within-cluster size", "random-effect or correlation structure", "residual diagnostics"]);
      if (clusterColumn) add("gee", "sensitivity", "Use GEE for population-average sensitivity to the mixed-model estimand and working-correlation assumptions.", ["cluster/subject support", "working correlation", "robust standard errors"]);
      add("linear-regression", clusterColumn ? "baseline" : "blocked", "Use only as an independence-assumption baseline or when correlation is shown to be negligible.", ["independence assumption", "cluster sensitivity"]);
      if (positiveSkewed) add("gamma-glm", "sensitivity", "Use as a skew-aware independent-row sensitivity route when correlated Gamma modeling is unavailable.", ["positive outcome support", "skewness", "independence caveat"]);
    } else if (targetType === "continuous") {
      const positiveSkewed = (targetColumn?.min ?? Number.NEGATIVE_INFINITY) > 0 && (targetShape.skewness ?? 0) > 1.5;
      const parameterBurdened = rowsPerCandidateParameter !== null && rowsPerCandidateParameter < 10 && candidateParameterCount > 8;
      recommended = request.highDimensional || parameterBurdened
        ? "penalized-linear-regression"
        : positiveSkewed
          ? "gamma-glm"
          : "linear-regression";
      rationale = positiveSkewed
        ? "Continuous outcome is strictly positive and strongly right-skewed, so Gamma GLM is the primary skew-aware association route with linear/quantile sensitivity checks."
        : parameterBurdened
          ? `Continuous outcome association has ${rowsPerCandidateParameter?.toFixed(1)} row(s) per expanded candidate parameter after categorical expansion, so penalized linear regression is safer than ordinary adjusted linear inference until the covariate set is simplified or expanded support is available.`
          : "Continuous outcome association should use linear regression with residual, influence, and collinearity diagnostics.";
      add(recommended, "primary", rationale, ["residual diagnostics", "VIF", "influence/Cook's distance", "effect-size/CI consistency"]);
      if (recommended !== "linear-regression") add("linear-regression", "baseline", "Use a transparent linear baseline only with residual/influence diagnostics and bounded claims.", ["residual diagnostics", "VIF", "influence/Cook's distance"]);
      add("robust-linear-regression", "sensitivity", "Use when influence/outlier diagnostics are concerning.", ["influence points", "robustness of effect direction"]);
      add("quantile-regression", "sensitivity", "Use when median or tail behavior is scientifically relevant or residual assumptions are poor.", ["quantile definition", "bootstrap uncertainty"]);
    }
  } else if (goal === "classify" || goal === "predict") {
    if (targetType === "binary") {
      recommended = "prediction-evaluation";
      rationale = "Prediction/classification plans need validation metrics and calibration before model comparison claims.";
      add("prediction-evaluation", "primary", rationale, ["ROC/AUC", "AUPRC", "calibration", "Brier score", "threshold policy"]);
      add("logistic-regression", "baseline", "Transparent baseline model for binary prediction.", ["separation diagnostics", "calibration"]);
    } else if (targetType === "count") {
      const zeroFraction = targetShape.zeroFraction ?? (targetColumn ? valueFraction(targetColumn, "0") : null);
      const overdispersed = (targetShape.varianceMeanRatio ?? 0) > 1.5;
      const excessZeros = zeroFraction !== null && zeroFraction > 0.4;
      recommended = excessZeros && overdispersed
        ? "zero-inflated-negative-binomial"
        : excessZeros
          ? "zero-inflated-poisson"
        : overdispersed
          ? "negative-binomial-regression"
          : "poisson-regression";
      rationale = excessZeros && overdispersed
        ? `Count prediction target has ${(zeroFraction * 100).toFixed(1)}% zeros and variance/mean ${(targetShape.varianceMeanRatio ?? 0).toFixed(2)}, so zero-inflated negative binomial is the transparent statistical baseline before high-capacity ML.`
        : excessZeros
        ? `Count prediction target has ${(zeroFraction * 100).toFixed(1)}% zeros; zero-inflated count modeling should be reviewed before ordinary Poisson or linear prediction.`
        : overdispersed
          ? `Count prediction target variance/mean is ${(targetShape.varianceMeanRatio ?? 0).toFixed(2)}, so negative-binomial regression is a better transparent baseline than Poisson or linear regression.`
        : "Count prediction should begin with Poisson regression and overdispersion diagnostics before high-capacity ML.";
      add(recommended, "primary", rationale, ["overdispersion", "zero inflation", "rate denominator", "train/test or CV"]);
      if (recommended !== "poisson-regression") add("poisson-regression", "fallback", "Use only if zero inflation is ruled out and overdispersion is acceptable.", ["overdispersion", "zero inflation", "rate denominator"]);
      if (recommended !== "negative-binomial-regression") add("negative-binomial-regression", "sensitivity", "Use when overdispersion is detected or expected.", ["overdispersion", "model convergence"]);
      if (recommended !== "zero-inflated-poisson") add("zero-inflated-poisson", "sensitivity", "Use only when excess structural zeros are plausible and reviewed.", ["zero fraction", "structural-zero rationale"]);
      if (recommended !== "zero-inflated-negative-binomial" && (excessZeros || overdispersed)) add("zero-inflated-negative-binomial", "sensitivity", "Use when excess zeros and overdispersion are both supported by table shape and convergence diagnostics.", ["zero fraction", "overdispersion", "model convergence"]);
    } else if (targetType === "continuous") {
      const positiveSkewed = (targetColumn?.min ?? Number.NEGATIVE_INFINITY) > 0 && (targetShape.skewness ?? 0) > 1.5;
      const parameterBurdened = rowsPerCandidateParameter !== null && rowsPerCandidateParameter < 10 && candidateParameterCount > 8;
      recommended = request.highDimensional || parameterBurdened
        ? "penalized-linear-regression"
        : positiveSkewed
          ? "gamma-glm"
          : "linear-regression";
      rationale = positiveSkewed
        ? "Continuous prediction target is strictly positive and strongly right-skewed, so Gamma GLM is the transparent skew-aware baseline before high-capacity ML."
        : parameterBurdened
          ? `Continuous prediction has ${rowsPerCandidateParameter?.toFixed(1)} row(s) per expanded candidate parameter after categorical expansion, so penalized linear regression is the transparent baseline before high-capacity ML.`
          : "Continuous prediction should begin with transparent regression and validation metrics before high-capacity ML.";
      add(recommended, "primary", rationale, ["residual diagnostics", "train/test or CV", "RMSE/MAE/R2"]);
      if (recommended !== "linear-regression") add("linear-regression", "baseline", "Use a transparent linear baseline only with residual/influence diagnostics and bounded claims.", ["residual diagnostics", "VIF", "influence/Cook's distance"]);
      add("robust-linear-regression", "sensitivity", "Use when influence/outlier diagnostics are concerning.", ["influence points", "robustness of prediction signal"]);
      add("quantile-regression", "sensitivity", "Use when median or tail prediction behavior is scientifically relevant or residual assumptions are poor.", ["quantile definition", "bootstrap uncertainty"]);
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

  const powerReviewReasons: string[] = [];
  const powerReviewRefs = new Set<string>(["tableSummary.rowCount"]);
  if (smallSample) powerReviewReasons.push("the analytic table has fewer than 50 rows");
  if (targetType === "binary" && eventCount !== null && eventCount < 20) {
    powerReviewReasons.push(`the binary outcome has only ${eventCount} event(s)`);
    powerReviewRefs.add(targetColumn?.name ?? target ?? "outcome");
  }
  if (targetType !== "binary" && eventsPerCandidateParameter !== null && eventsPerCandidateParameter < 10) {
    powerReviewReasons.push(`events per candidate parameter is ${eventsPerCandidateParameter.toFixed(1)}`);
    powerReviewRefs.add(targetColumn?.name ?? target ?? "outcome");
  }
  if (targetType === "binary" && minorityRowsPerCandidateParameter !== null && minorityRowsPerCandidateParameter < 10) {
    powerReviewReasons.push(`minority-class rows per expanded candidate parameter is ${minorityRowsPerCandidateParameter.toFixed(1)}`);
    powerReviewRefs.add(targetColumn?.name ?? target ?? "outcome");
  }
  if (rowsPerCandidateParameter !== null && rowsPerCandidateParameter < 15 && candidateParameterCount > 4) {
    powerReviewReasons.push(`rows per candidate parameter is ${rowsPerCandidateParameter.toFixed(1)}`);
  }
  if (sparseGroupingColumn) {
    powerReviewReasons.push(`grouping/predictor '${sparseGroupingColumn.name}' has sparse level support`);
    powerReviewRefs.add(sparseGroupingColumn.name);
  }
  if (targetType === "categorical" && minTargetClassCount !== null && minTargetClassCount < 10) {
    powerReviewReasons.push(`the categorical outcome has a level with only ${minTargetClassCount} row(s)`);
    powerReviewRefs.add(targetColumn?.name ?? target ?? "outcome");
  }
  if ((request.highDimensional || (rowsPerCandidateParameter !== null && rowsPerCandidateParameter < 10)) && candidateParameterCount > 8) {
    powerReviewReasons.push("the candidate design is high-dimensional relative to the available rows");
  }
  if (powerReviewReasons.length && !alternatives.some(alternative => alternative.method === "power-sample-size")) {
    warnings.push(issue(
      "warning",
      "METHOD_GUIDANCE_POWER_REVIEW_RECOMMENDED",
      `Add a power/precision review before promoting this plan because ${powerReviewReasons.join("; ")}.`,
      [...powerReviewRefs],
    ));
    add(
      "power-sample-size",
      "sensitivity",
      "Estimate minimum detectable effect or required sample size before treating this design as adequately powered.",
      ["minimum detectable effect", "target power", "alpha", "precision/CI width", "underpowered-study disclosure"],
    );
  }

  if ((semanticReview.hasIssues || identifierReview.hasIssues || leakageReview.hasIssues) && recommended !== "descriptive" && !alternatives.some(alternative => alternative.method === "descriptive")) {
    add(
      "descriptive",
      "sensitivity",
      "Data-validity issues require a data-quality profile and unit/coding/role audit before formal inference or prediction.",
      ["semantic plausibility", "identifier leakage", "outcome leakage", "unit/coding audit", "role-binding review"],
    );
  }

  if (!recommended) {
    recommended = "descriptive";
    add("descriptive", "fallback", "No specific inferential route was safe from supplied evidence; start with data profiling.", ["missingness", "distribution plausibility"]);
  }
  const capabilityAdjustment = executableFirstRecommendedMethod({
    recommended,
    rationale,
    alternatives,
    request,
  });
  if (capabilityAdjustment.adjusted) {
    warnings.push(issue(
      "warning",
      "METHOD_GUIDANCE_EXECUTABLE_ROUTE_PREFERRED",
      capabilityAdjustment.message,
      ["statisticalMethodGuidance.runnerCapability", capabilityAdjustment.from, capabilityAdjustment.to],
    ));
    recommended = capabilityAdjustment.recommended;
    rationale = capabilityAdjustment.rationale;
  }
  const contract = contractSummaryForStatsMethod(recommended);
  const runnerCapability = runnerCapabilityForStatsMethodString(recommended, request);
  const recommendedRef = recommended ?? "recommended-method";
  if (runnerCapability?.status === "backend_blocked") {
    blockers.push(issue(
      "blocker",
      "METHOD_GUIDANCE_RUNNER_BACKEND_BLOCKED",
      `${recommended} is selected by the method logic but the local runner cannot execute it: ${runnerCapability.reason}`,
      ["statisticalMethodGuidance.runnerCapability", recommendedRef],
    ));
  } else if (runnerCapability?.status === "bounded_approximation") {
    warnings.push(issue(
      "warning",
      "METHOD_GUIDANCE_RUNNER_BOUNDED_APPROXIMATION",
      `${recommended} is executable only as a bounded local approximation: ${runnerCapability.reason}`,
      ["statisticalMethodGuidance.runnerCapability", recommendedRef],
    ));
  }
  const modelDiagnosticsReasons = modelDiagnosticsCompanionReasons({
    recommended,
    contract,
    candidateParameterCount,
    rowsPerCandidateParameter,
    eventsPerCandidateParameter,
    targetShape,
    request,
    goal,
    numericPredictorCount: numericPredictors.length,
    categoricalPredictorCount: categoricalPredictors.length,
  });
  if (modelDiagnosticsReasons.length && !alternatives.some(alternative => alternative.method === "model-diagnostics")) {
    warnings.push(issue(
      "warning",
      "METHOD_GUIDANCE_MODEL_DIAGNOSTICS_REQUIRED",
      `Run model-diagnostics before promotion because ${modelDiagnosticsReasons.join("; ")}.`,
      uniqueStrings([targetColumn?.name ?? target ?? "outcome", "tableSummary.columns"].filter(Boolean)),
    ));
    add(
      "model-diagnostics",
      "sensitivity",
      "Regression/GLM plans with meaningful parameter or assumption burden require a companion diagnostic run before promotion.",
      ["VIF/collinearity", "Cook distance/leverage", "residual diagnostics", "convergence/separation/overdispersion review"],
    );
  }
  const alternativesForOutput = alternativesForReadinessOutput(alternatives, warnings);

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
      eventCount,
      nonEventCount,
      numericPredictorCount: numericPredictors.length,
      categoricalPredictorCount: categoricalPredictors.length,
      maxMissingFraction,
      targetSkewness: targetShape.skewness,
      targetOutlierFraction: targetShape.outlierFraction,
      targetZeroFraction: targetShape.zeroFraction,
      targetVarianceMeanRatio: targetShape.varianceMeanRatio,
      estimatedRoleCompleteRows: roleCompleteSupport.estimatedRows,
      estimatedRoleCompleteFraction: roleCompleteSupport.estimatedFraction,
      limitingRoleColumns: roleCompleteSupport.limitingColumns,
    },
    contract,
    runnerCapability,
    alternatives: alternativesForOutput,
    readiness: buildStatisticalGuidanceReadiness({
      source: summary ? "table-summary" : "request-only",
      recommended,
      contract,
      runnerCapability,
      alternatives: alternativesForOutput,
      warnings,
      blockers,
    }),
    warnings,
    blockers,
  };
}

function buildStatisticalGuidanceReadiness(opts: {
  source: "table-summary" | "request-only";
  recommended: string | null;
  contract: ModelingDecisionPlan["statisticalMethodGuidance"]["contract"];
  runnerCapability: ModelingDecisionPlan["statisticalMethodGuidance"]["runnerCapability"];
  alternatives: ModelingDecisionPlan["statisticalMethodGuidance"]["alternatives"];
  warnings: MachineIssue[];
  blockers: MachineIssue[];
}): ModelingDecisionPlan["statisticalMethodGuidance"]["readiness"] {
  const warningCodes = new Set(opts.warnings.map(warning => warning.code));
  const primaryAlternative = opts.alternatives.find(alternative => alternative.method === opts.recommended);
  const boundedRunner = opts.runnerCapability?.status === "bounded_approximation";
  const hasSemanticWarning = opts.warnings.some(warning => warning.code.startsWith("METHOD_GUIDANCE_SEMANTIC_"));
  const hasLeakageIssue = [...opts.warnings, ...opts.blockers].some(item => item.code.startsWith("METHOD_GUIDANCE_OUTCOME_LEAKAGE_"));
  const hasFeasibilityWarning = warningCodes.has("METHOD_GUIDANCE_FEASIBILITY_WARNING");
  const requiredBeforeExecution = uniqueStrings([
    "run stats preflight",
    "bind method-selection or AnalysisSpec before promotion",
    "verify stats-qa estimate sanity checks",
    ...(opts.contract?.requiredArguments.map(argument => `provide ${argument}`) ?? []),
    ...(primaryAlternative?.expectedQa ?? []),
    ...(opts.contract?.qaGates ?? []),
    ...(warningCodes.has("METHOD_GUIDANCE_POWER_REVIEW_RECOMMENDED") ? ["run power-sample-size or document precision limits"] : []),
    ...(warningCodes.has("METHOD_GUIDANCE_HIGH_TABLE_MISSINGNESS") ? ["run missingness-summary and sensitivity analysis"] : []),
    ...(warningCodes.has("METHOD_GUIDANCE_ROLE_COMPLETE_SUPPORT_LOW") ? ["run complete-case flow and role-missingness review"] : []),
    ...(warningCodes.has("METHOD_GUIDANCE_COMPETING_EVENT_STATES") ? ["run cumulative-incidence analysis and competing-event coding review"] : []),
    ...(warningCodes.has("METHOD_GUIDANCE_MODEL_DIAGNOSTICS_REQUIRED") ? ["run model-diagnostics companion analysis"] : []),
    ...(warningCodes.has("METHOD_GUIDANCE_FEASIBILITY_WARNING") ? ["resolve or explicitly accept feasibility-gate warnings before execution"] : []),
    ...(hasSemanticWarning ? ["resolve semantic plausibility warnings for target, role, and candidate feature columns"] : []),
    ...(hasLeakageIssue ? ["remove outcome-derived or post-index leakage variables from predictors and adjustment roles"] : []),
    ...(boundedRunner ? opts.runnerCapability?.requiredFollowUp ?? [] : []),
  ]);
  const promotionBlockers = [
    ...opts.blockers.map(blocker => blocker.message),
    ...(opts.source === "request-only" ? ["No table summary/profile evidence was supplied; do not promote beyond exploratory planning."] : []),
    ...(opts.runnerCapability?.status === "backend_blocked" ? [`Runner backend is blocked for ${opts.runnerCapability.method}: ${opts.runnerCapability.reason}`] : []),
    ...(boundedRunner ? [`${opts.runnerCapability?.method} is a bounded local approximation; do not promote strong claims until follow-up validation is complete.`] : []),
    ...(boundedRunner ? opts.runnerCapability?.cannotSupport.map(item => `Cannot support without follow-up: ${item}`) ?? [] : []),
  ];
  const fragileCodes = new Set([
    "METHOD_GUIDANCE_RARE_BINARY_EVENT",
    "METHOD_GUIDANCE_SPARSE_TARGET_LEVEL",
    "METHOD_GUIDANCE_HIGH_TABLE_MISSINGNESS",
    "METHOD_GUIDANCE_TARGET_SKEWED",
    "METHOD_GUIDANCE_TARGET_OUTLIERS",
    "METHOD_GUIDANCE_SMALL_SAMPLE",
    "METHOD_GUIDANCE_SPARSE_GROUP",
    "METHOD_GUIDANCE_ROLE_COMPLETE_SUPPORT_LOW",
    "METHOD_GUIDANCE_COMPETING_EVENT_STATES",
    "METHOD_GUIDANCE_POWER_REVIEW_RECOMMENDED",
    "METHOD_GUIDANCE_SPARSE_CATEGORICAL_OUTCOME_MODEL",
    "METHOD_GUIDANCE_EXACT_TEST_REQUIRES_2X2",
    "METHOD_GUIDANCE_RUNNER_BOUNDED_APPROXIMATION",
  ]);
  const hasFragilityWarning = opts.warnings.some(warning => fragileCodes.has(warning.code));
  const hasDataValidityWarning = hasSemanticWarning || hasLeakageIssue;
  const enforceCompanionReadiness = warningCodes.has("METHOD_GUIDANCE_COMPETING_EVENT_STATES")
    || warningCodes.has("METHOD_GUIDANCE_ROLE_COMPLETE_SUPPORT_LOW")
    || warningCodes.has("METHOD_GUIDANCE_HIGH_TABLE_MISSINGNESS")
    || warningCodes.has("METHOD_GUIDANCE_MODEL_DIAGNOSTICS_REQUIRED")
    || hasDataValidityWarning
    || boundedRunner;
  const companionMethods = uniqueStrings(opts.alternatives
    .filter(alternative => alternative.method !== opts.recommended)
    .filter(alternative => {
      if (alternative.method === "model-diagnostics") return warningCodes.has("METHOD_GUIDANCE_MODEL_DIAGNOSTICS_REQUIRED");
      if (alternative.method === "power-sample-size") return warningCodes.has("METHOD_GUIDANCE_POWER_REVIEW_RECOMMENDED");
      if (alternative.method === "missingness-summary") return warningCodes.has("METHOD_GUIDANCE_HIGH_TABLE_MISSINGNESS");
      return hasFragilityWarning && (alternative.tier === "baseline" || alternative.tier === "sensitivity" || alternative.tier === "fallback");
    })
    .map(alternative => alternative.method));
  if (opts.blockers.length) {
    return {
      status: "blocked",
      reason: `${opts.blockers.length} blocking method-selection issue(s) must be resolved before execution.`,
      requiredBeforeExecution,
      requiredCompanionMethods: companionMethods,
      enforceCompanionReadiness,
      promotionBlockers,
    };
  }
  if (opts.source === "request-only") {
    return {
      status: "exploratory_only",
      reason: "Only request-level evidence was available, so the recommendation can guide profiling but should not be promoted as a formal analysis plan.",
      requiredBeforeExecution,
      requiredCompanionMethods: companionMethods,
      enforceCompanionReadiness,
      promotionBlockers,
    };
  }
  if (hasFragilityWarning || hasDataValidityWarning || hasFeasibilityWarning || companionMethods.length > 0) {
    return {
      status: "ready_with_sensitivity",
      reason: "The primary method is executable, but data-shape warnings require companion analyses or explicit limitations before promotion.",
      requiredBeforeExecution,
      requiredCompanionMethods: companionMethods,
      enforceCompanionReadiness,
      promotionBlockers,
    };
  }
  return {
    status: "ready",
    reason: "Table-shape evidence supports the selected method with routine diagnostics and QA.",
    requiredBeforeExecution,
    requiredCompanionMethods: companionMethods,
    enforceCompanionReadiness,
    promotionBlockers,
  };
}

function executableFirstRecommendedMethod(opts: {
  recommended: string | null;
  rationale: string;
  alternatives: ModelingDecisionPlan["statisticalMethodGuidance"]["alternatives"];
  request: ModelingDecisionRequest;
}): {
  adjusted: boolean;
  recommended: string | null;
  rationale: string;
  from: string;
  to: string;
  message: string;
} {
  if (!opts.recommended) return { adjusted: false, recommended: opts.recommended, rationale: opts.rationale, from: "", to: "", message: "" };
  const primaryCapability = runnerCapabilityForStatsMethodString(opts.recommended, opts.request);
  if (primaryCapability?.status !== "bounded_approximation") {
    return { adjusted: false, recommended: opts.recommended, rationale: opts.rationale, from: "", to: "", message: "" };
  }
  if (boundedMethodExplicitlyRequested(opts.request, opts.recommended)) {
    return { adjusted: false, recommended: opts.recommended, rationale: opts.rationale, from: "", to: "", message: "" };
  }
  const replacement = executableReplacementForBoundedMethod(opts.recommended, opts.alternatives);
  if (!replacement) return { adjusted: false, recommended: opts.recommended, rationale: opts.rationale, from: "", to: "", message: "" };
  const previous = opts.alternatives.find(alternative => alternative.method === opts.recommended);
  if (previous && previous.tier === "primary") previous.tier = "sensitivity";
  replacement.tier = "primary";
  const message = `${opts.recommended} is only a bounded local approximation and was not explicitly requested; ${replacement.method} is preferred as the primary executable route while ${opts.recommended} remains a reviewed sensitivity route.`;
  return {
    adjusted: true,
    recommended: replacement.method,
    rationale: `${message} ${replacement.reason}`,
    from: opts.recommended,
    to: replacement.method,
    message,
  };
}

function executableReplacementForBoundedMethod(
  method: string,
  alternatives: ModelingDecisionPlan["statisticalMethodGuidance"]["alternatives"],
): ModelingDecisionPlan["statisticalMethodGuidance"]["alternatives"][number] | null {
  const replacements: Record<string, string[]> = {
    "event-study-did": ["difference-in-differences"],
    "time-varying-cox": ["cox-proportional-hazards", "stratified-cox", "kaplan-meier"],
    "recurrent-event-cox": ["recurrent-event-rate", "cox-proportional-hazards", "kaplan-meier"],
    "generalized-mixed-model": ["gee", "logistic-regression"],
    "overlap-weighting": ["propensity-score-weighting", "propensity-score-matching"],
    "entropy-balancing": ["propensity-score-weighting", "propensity-score-matching"],
    "doubly-robust-aipw": ["propensity-score-weighting", "propensity-score-matching"],
  };
  for (const candidateMethod of replacements[method] ?? []) {
    const candidate = alternatives.find(alternative =>
      alternative.method === candidateMethod
      && alternative.tier !== "blocked"
      && alternative.commandHint
      && alternative.runnerCapability?.status === "executable"
    );
    if (candidate) return candidate;
  }
  return null;
}

function boundedMethodExplicitlyRequested(request: ModelingDecisionRequest, method: string): boolean {
  const q = request.question.toLowerCase();
  switch (method) {
    case "event-study-did":
      return /\bevent[- ]?study|dynamic treatment|event time|event-time/.test(q);
    case "interrupted-time-series":
      return /\binterrupted[- ]time[- ]series|\bits\b|segmented regression|interruption|policy change|before and after intervention/.test(q);
    case "regression-discontinuity":
      return Boolean(request.roleHints.runningVariable) || /\bregression[- ]discontinuity|\brdd\b|running variable|forcing variable|cutoff|threshold assignment/.test(q);
    case "instrumental-variables-2sls":
      return Boolean(request.roleHints.instrument) || /\binstrumental variable|\biv\b|\b2sls\b|two-stage least squares|weak instrument|instrument relevance/.test(q);
    case "time-varying-cox":
      return /\btime[- ]varying|time[- ]dependent|start[-/]stop|counting[- ]process|extended cox/.test(q);
    case "recurrent-event-cox":
      return /\brecurrent event|multiple events|repeated event|andersen[- ]gill|pwp|frailty|start[-/]stop|counting[- ]process/.test(q);
    case "generalized-mixed-model":
      return /\bgeneralized mixed|glmm|mixed[- ]effects logistic|random[- ]intercept logistic/.test(q);
    case "overlap-weighting":
      return /\boverlap weighting|overlap weights\b/.test(q);
    case "entropy-balancing":
      return /\bentropy balancing|entropy weights\b/.test(q);
    case "doubly-robust-aipw":
      return /\bdoubly robust|aipw|augmented inverse probability/.test(q);
    case "multiple-imputation-mice":
      return /\bmultiple imputation|mice|chained equations\b/.test(q);
    case "target-trial-emulation-spec":
      return /\btarget trial|trial emulation|emulate a trial\b/.test(q);
    default:
      return false;
  }
}

function modelDiagnosticsCompanionReasons(opts: {
  recommended: string | null;
  contract: ModelingDecisionPlan["statisticalMethodGuidance"]["contract"];
  candidateParameterCount: number;
  rowsPerCandidateParameter: number | null;
  eventsPerCandidateParameter: number | null;
  targetShape: {
    skewness: number | null;
    outlierFraction: number | null;
    zeroFraction: number | null;
    varianceMeanRatio: number | null;
  };
  request: ModelingDecisionRequest;
  goal: ModelingGoal;
  numericPredictorCount: number;
  categoricalPredictorCount: number;
}): string[] {
  if (!opts.recommended || opts.recommended === "model-diagnostics" || opts.contract?.family !== "regression_glm") return [];
  const predictorCount = opts.numericPredictorCount + opts.categoricalPredictorCount;
  const reasons: string[] = [];
  if (opts.candidateParameterCount >= 5) reasons.push(`the candidate model has ${opts.candidateParameterCount} pre-expansion parameter slot(s)`);
  if (opts.rowsPerCandidateParameter !== null && opts.rowsPerCandidateParameter < 30) reasons.push(`rows per candidate parameter is ${opts.rowsPerCandidateParameter.toFixed(1)}`);
  if (opts.eventsPerCandidateParameter !== null && opts.eventsPerCandidateParameter < 20) reasons.push(`events per candidate parameter is ${opts.eventsPerCandidateParameter.toFixed(1)}`);
  if (opts.request.highDimensional) reasons.push("the design was declared high-dimensional");
  if (hasAdjustmentIntent(opts.request) && predictorCount >= 3) reasons.push("the question asks for adjusted modeling with multiple covariate roles");
  if (Math.abs(opts.targetShape.skewness ?? 0) > 1.5) reasons.push("the outcome is strongly skewed");
  if ((opts.targetShape.outlierFraction ?? 0) > 0.02) reasons.push("the outcome has nontrivial outlier support");
  if ((opts.recommended.includes("logistic") || opts.recommended.includes("multinomial") || opts.recommended.includes("ordinal")) && predictorCount >= 3) reasons.push("categorical-outcome regression requires explicit separation/convergence review");
  if (opts.recommended.includes("poisson") || opts.recommended.includes("negative-binomial") || opts.recommended.includes("zero-inflated")) reasons.push("count regression requires overdispersion, zero-inflation, and influence review");
  if (opts.goal === "predict" && opts.contract.family === "regression_glm") reasons.push("regression used as a prediction baseline needs residual and calibration-adjacent diagnostic review before comparison claims");
  return uniqueStrings(reasons);
}

function alternativesForReadinessOutput(
  alternatives: ModelingDecisionPlan["statisticalMethodGuidance"]["alternatives"],
  warnings: MachineIssue[],
): ModelingDecisionPlan["statisticalMethodGuidance"]["alternatives"] {
  const modelDiagnosticsRequired = warnings.some(warning => warning.code === "METHOD_GUIDANCE_MODEL_DIAGNOSTICS_REQUIRED");
  if (!modelDiagnosticsRequired) return alternatives.slice(0, 8);
  const diagnostic = alternatives.find(alternative => alternative.method === "model-diagnostics");
  if (!diagnostic) return alternatives.slice(0, 8);
  return [...alternatives.filter(alternative => alternative.method !== "model-diagnostics").slice(0, 7), diagnostic];
}

function contractSummaryForStatsMethod(method: string | null): ModelingDecisionPlan["statisticalMethodGuidance"]["contract"] {
  const parsed = statsMethodSchema.safeParse(method);
  if (!parsed.success) return null;
  const contract = getStatisticalMethodSpec(parsed.data);
  return {
    method: contract.method,
    family: contract.family,
    requiredArguments: contract.requiredArguments,
    assumptions: contract.assumptions,
    diagnostics: contract.diagnostics,
    expectedTables: contract.expectedTables,
    requiredFigures: contract.expectedFigures.filter(figure => figure.required).map(figure => figure.label),
    qaGates: contract.qaGates,
    failureModes: contract.failureModes,
    interpretationBoundary: contract.interpretationBoundary,
  };
}

function runnerCapabilityForStatsMethodString(method: string | null, request?: ModelingDecisionRequest): StatsRunnerCapability | null {
  const parsed = statsMethodSchema.safeParse(method);
  if (!parsed.success) return null;
  if (parsed.data === "time-varying-cox" && request?.roleHints.start && request.roleHints.stop && request.roleHints.id) {
    return {
      method: parsed.data,
      status: "executable",
      reason: "The local route can use explicit start/stop interval-expanded Cox data with a subject id, so interval validity, subject support, and subject-clustered robust variance are inspectable in run artifacts.",
      requiredFollowUp: [
        "Review interval construction, time-varying covariate timing, proportional-hazards diagnostics, and subject-clustered robust variance before promotion.",
        "Use a dedicated survival backend for publication-grade confirmation when the claim depends on complex time-varying covariate structure.",
      ],
      cannotSupport: [
        "unreviewed repeated-subject interval construction",
        "claims beyond the declared interval data and proportional-hazards diagnostics",
      ],
    };
  }
  return statsRunnerCapabilityForMethod(parsed.data);
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values.filter(value => value.trim().length > 0))];
}

type ModelingTableColumn = NonNullable<ModelingDecisionRequest["tableSummary"]>["columns"][number];

function columnByName(summary: ModelingDecisionRequest["tableSummary"] | undefined, name: string | undefined): ModelingTableColumn | null {
  if (!summary || !name) return null;
  return summary.columns.find(column => column.name === name) ?? null;
}

function isNumericAnalysisColumn(column: ModelingTableColumn): boolean {
  const kind = columnKind(column);
  return kind === "continuous" || kind === "count" || kind === "binary";
}

function isGroupingAnalysisColumn(column: ModelingTableColumn): boolean {
  const kind = columnKind(column);
  return kind === "binary" || kind === "categorical" || (kind === "count" && (classCountFor(column) ?? 999) <= 10);
}

function roleHintResolutionIssues(
  request: ModelingDecisionRequest,
  summary: ModelingDecisionRequest["tableSummary"] | undefined,
  resolved: Partial<Record<"outcome" | "exposure" | "group" | "time" | "start" | "stop" | "event" | "id" | "cluster" | "strata" | "period" | "post" | "runningVariable" | "instrument" | "weight" | "offset", ModelingTableColumn | null>>,
): { warnings: MachineIssue[]; blockers: MachineIssue[] } {
  const warnings: MachineIssue[] = [];
  const blockers: MachineIssue[] = [];
  if (!summary) return { warnings, blockers };

  const scalarHints: Array<{ role: keyof typeof resolved; label: string; value: string | undefined }> = [
    { role: "outcome", label: "outcome", value: request.roleHints.outcome },
    { role: "exposure", label: "exposure", value: request.roleHints.exposure },
    { role: "group", label: "group", value: request.roleHints.group },
    { role: "time", label: "time", value: request.roleHints.time },
    { role: "start", label: "start time", value: request.roleHints.start },
    { role: "stop", label: "stop time", value: request.roleHints.stop },
    { role: "event", label: "event", value: request.roleHints.event },
    { role: "id", label: "id", value: request.roleHints.id },
    { role: "cluster", label: "cluster", value: request.roleHints.cluster },
    { role: "strata", label: "strata", value: request.roleHints.strata },
    { role: "period", label: "period", value: request.roleHints.period },
    { role: "post", label: "post", value: request.roleHints.post },
    { role: "runningVariable", label: "running variable", value: request.roleHints.runningVariable },
    { role: "instrument", label: "instrument", value: request.roleHints.instrument },
    { role: "weight", label: "weight", value: request.roleHints.weight },
    { role: "offset", label: "offset", value: request.roleHints.offset },
  ];
  for (const hint of scalarHints) {
    if (!hint.value || resolved[hint.role]) continue;
    blockers.push(issue(
      "blocker",
      "METHOD_GUIDANCE_ROLE_HINT_COLUMN_MISSING",
      `Declared ${hint.label} column '${hint.value}' was not found in the table summary. Refusing to substitute a heuristic column for this role.`,
      [`request.roleHints.${hint.role}`, "tableSummary.columns"],
    ));
  }

  for (const [role, values] of [
    ["variable", request.roleHints.variables],
    ["covariate", request.roleHints.covariates],
    ["exact covariate", request.roleHints.exactCovariates],
  ] as const) {
    for (const value of values) {
      if (columnByName(summary, value)) continue;
      blockers.push(issue(
        "blocker",
        "METHOD_GUIDANCE_ROLE_HINT_COLUMN_MISSING",
        `Declared ${role} column '${value}' was not found in the table summary. Refusing to proceed with incomplete role binding.`,
        [`request.roleHints.${role.replace(/\s+/g, "")}`, "tableSummary.columns"],
      ));
    }
  }

  if (resolved.group && !isGroupingAnalysisColumn(resolved.group)) {
    blockers.push(issue("blocker", "METHOD_GUIDANCE_ROLE_HINT_GROUP_NOT_DISCRETE", `Declared group column '${resolved.group.name}' does not look like a discrete grouping variable.`, [resolved.group.name]));
  }
  if (resolved.time && !isNumericAnalysisColumn(resolved.time)) {
    blockers.push(issue("blocker", "METHOD_GUIDANCE_ROLE_HINT_TIME_NOT_NUMERIC", `Declared time column '${resolved.time.name}' is not numeric enough for time-to-event or trend analysis.`, [resolved.time.name]));
  }
  if (resolved.post && !isGroupingAnalysisColumn(resolved.post)) {
    blockers.push(issue("blocker", "METHOD_GUIDANCE_ROLE_HINT_POST_NOT_BINARY", `Declared post/intervention column '${resolved.post.name}' does not look like a binary or low-level period indicator.`, [resolved.post.name]));
  }
  if (resolved.runningVariable && !isNumericAnalysisColumn(resolved.runningVariable)) {
    blockers.push(issue("blocker", "METHOD_GUIDANCE_ROLE_HINT_RUNNING_VARIABLE_NOT_NUMERIC", `Declared running variable '${resolved.runningVariable.name}' is not numeric enough for regression-discontinuity screening.`, [resolved.runningVariable.name]));
  }
  if (resolved.event && columnKind(resolved.event) === "continuous" && (classCountFor(resolved.event) ?? Number.POSITIVE_INFINITY) > 10) {
    warnings.push(issue("warning", "METHOD_GUIDANCE_ROLE_HINT_EVENT_HIGH_CARDINALITY", `Declared event column '${resolved.event.name}' has many observed values; verify it is event-state coding rather than an identifier or continuous measure.`, [resolved.event.name]));
  }

  return { warnings, blockers };
}

function uniqueColumns(columns: Array<ModelingTableColumn | null | undefined>): ModelingTableColumn[] {
  const seen = new Set<string>();
  const result: ModelingTableColumn[] = [];
  for (const column of columns) {
    if (!column || seen.has(column.name)) continue;
    seen.add(column.name);
    result.push(column);
  }
  return result;
}

function semanticPlausibilityReviewForGuidance(opts: {
  request: ModelingDecisionRequest;
  summary: ModelingDecisionRequest["tableSummary"] | undefined;
  goal: ModelingGoal;
  rowCount: number | null;
  roleColumns: Array<ModelingTableColumn | null | undefined>;
  predictorColumns: ModelingTableColumn[];
}): { warnings: MachineIssue[]; blockers: MachineIssue[]; hasIssues: boolean } {
  const warnings: MachineIssue[] = [];
  const blockers: MachineIssue[] = [];
  if (!opts.summary) return { warnings, blockers, hasIssues: false };

  const explicitRoleNames = new Set(uniqueStrings([
    opts.request.target,
    opts.request.roleHints.outcome,
    opts.request.roleHints.exposure,
    opts.request.roleHints.group,
    opts.request.roleHints.time,
    opts.request.roleHints.start,
    opts.request.roleHints.stop,
    opts.request.roleHints.event,
    opts.request.roleHints.id,
    opts.request.roleHints.cluster,
    opts.request.roleHints.strata,
    opts.request.roleHints.period,
    opts.request.roleHints.post,
    opts.request.roleHints.runningVariable,
    opts.request.roleHints.instrument,
    opts.request.roleHints.weight,
    opts.request.roleHints.offset,
    ...opts.request.roleHints.variables,
    ...opts.request.roleHints.covariates,
    ...opts.request.roleHints.exactCovariates,
  ].filter((value): value is string => Boolean(value))));
  const analysisRoleNames = new Set(uniqueColumns(opts.roleColumns).map(column => column.name));
  for (const name of explicitRoleNames) analysisRoleNames.add(name);
  const predictionUsesCandidateFeatures = opts.request.requiresPrediction || opts.goal === "predict" || opts.goal === "classify";
  const predictionFeatureNames = predictionUsesCandidateFeatures ? new Set(opts.predictorColumns.map(column => column.name)) : new Set<string>();
  const columnsToReview = uniqueColumns([
    ...opts.roleColumns,
    ...(predictionUsesCandidateFeatures ? opts.predictorColumns : []),
  ]);

  for (const column of columnsToReview) {
    const semanticIssues = semanticPlausibilityIssuesForColumn(column, opts.rowCount);
    const role = analysisRoleNames.has(column.name)
      ? "analysis role"
      : predictionFeatureNames.has(column.name)
        ? "candidate prediction feature"
        : "candidate column";
    for (const semanticIssue of semanticIssues) {
      const isBlockingRoleIssue = semanticIssue.severity === "blocker" && (analysisRoleNames.has(column.name) || predictionFeatureNames.has(column.name));
      const message = `${role} '${column.name}' failed semantic plausibility review: ${semanticIssue.message} Repair units/coding or exclude this column before formal execution.`;
      const mapped = issue(
        isBlockingRoleIssue ? "blocker" : "warning",
        `METHOD_GUIDANCE_SEMANTIC_${semanticIssue.code}`,
        message,
        [column.name],
      );
      if (mapped.severity === "blocker") blockers.push(mapped);
      else warnings.push(mapped);
    }
  }

  return { warnings, blockers, hasIssues: warnings.length > 0 || blockers.length > 0 };
}

function identifierRoleReviewForGuidance(opts: {
  request: ModelingDecisionRequest;
  summary: ModelingDecisionRequest["tableSummary"] | undefined;
  goal: ModelingGoal;
  rowCount: number | null;
  roles: Array<{ role: string; column: ModelingTableColumn | null | undefined; allowedIdentifier: boolean }>;
  predictorColumns: ModelingTableColumn[];
}): { warnings: MachineIssue[]; blockers: MachineIssue[]; hasIssues: boolean } {
  const warnings: MachineIssue[] = [];
  const blockers: MachineIssue[] = [];
  if (!opts.summary) return { warnings, blockers, hasIssues: false };

  const declaredIdentifierColumns = new Set(uniqueStrings([
    opts.request.roleHints.id,
    opts.request.roleHints.cluster,
    opts.request.roleHints.strata,
  ].filter((value): value is string => Boolean(value))));
  const seenRoleIssues = new Set<string>();
  for (const entry of opts.roles) {
    if (!entry.column) continue;
    const identifierReason = identifierLikeColumnReason(entry.column, opts.rowCount);
    if (!identifierReason || entry.allowedIdentifier) continue;
    const key = `${entry.role}:${entry.column.name}`;
    if (seenRoleIssues.has(key)) continue;
    seenRoleIssues.add(key);
    blockers.push(issue(
      "blocker",
      "METHOD_GUIDANCE_IDENTIFIER_ROLE_MISUSE",
      `${entry.role} column '${entry.column.name}' appears to be an identifier (${identifierReason}). Identifiers may be used for linkage, clustering, pairing, or leakage checks, but not as substantive outcomes, exposures, groups, covariates, or endpoints.`,
      [entry.column.name],
    ));
  }

  const predictionUsesCandidateFeatures = opts.request.requiresPrediction || opts.goal === "predict" || opts.goal === "classify";
  if (predictionUsesCandidateFeatures) {
    const seenFeatureIssues = new Set<string>();
    for (const column of opts.predictorColumns) {
      if (declaredIdentifierColumns.has(column.name)) continue;
      const identifierReason = identifierLikeColumnReason(column, opts.rowCount);
      if (!identifierReason || seenFeatureIssues.has(column.name)) continue;
      seenFeatureIssues.add(column.name);
      blockers.push(issue(
        "blocker",
        "METHOD_GUIDANCE_IDENTIFIER_FEATURE_LEAKAGE",
        `Candidate prediction feature '${column.name}' appears to be an identifier (${identifierReason}). Exclude it from predictors or declare it as an id/cluster role before model development, validation, or comparison.`,
        [column.name],
      ));
    }
  }

  return { warnings, blockers, hasIssues: warnings.length > 0 || blockers.length > 0 };
}

function outcomeLeakageReviewForGuidance(opts: {
  request: ModelingDecisionRequest;
  summary: ModelingDecisionRequest["tableSummary"] | undefined;
  goal: ModelingGoal;
  targetName: string | null;
  roles: Array<{ role: string; column: ModelingTableColumn | null | undefined; leakageAllowed: boolean }>;
  predictorColumns: ModelingTableColumn[];
}): { warnings: MachineIssue[]; blockers: MachineIssue[]; hasIssues: boolean } {
  const warnings: MachineIssue[] = [];
  const blockers: MachineIssue[] = [];
  if (!opts.summary) return { warnings, blockers, hasIssues: false };

  const allowedDesignColumns = new Set(uniqueStrings([
    opts.targetName ?? undefined,
    opts.request.roleHints.outcome,
    opts.request.roleHints.event,
    opts.request.roleHints.time,
    opts.request.roleHints.start,
    opts.request.roleHints.stop,
    opts.request.roleHints.period,
    opts.request.roleHints.post,
    opts.request.roleHints.id,
    opts.request.roleHints.cluster,
    opts.request.roleHints.strata,
  ].filter((value): value is string => Boolean(value))));
  const seenRoleIssues = new Set<string>();
  for (const entry of opts.roles) {
    if (!entry.column || entry.leakageAllowed || allowedDesignColumns.has(entry.column.name)) continue;
    const reason = outcomeOrFutureLeakageReason(entry.column.name, opts.targetName);
    if (!reason) continue;
    const key = `${entry.role}:${entry.column.name}`;
    if (seenRoleIssues.has(key)) continue;
    seenRoleIssues.add(key);
    blockers.push(issue(
      "blocker",
      "METHOD_GUIDANCE_OUTCOME_LEAKAGE_ROLE",
      `${entry.role} column '${entry.column.name}' looks outcome-derived or post-index (${reason}). Use baseline/pre-index variables for substantive predictors, adjustment, treatment, instruments, and grouping roles.`,
      [entry.column.name],
    ));
  }

  const predictionUsesCandidateFeatures = opts.request.requiresPrediction || opts.goal === "predict" || opts.goal === "classify";
  if (predictionUsesCandidateFeatures) {
    const seenFeatureIssues = new Set<string>();
    for (const column of opts.predictorColumns) {
      if (allowedDesignColumns.has(column.name)) continue;
      const reason = outcomeOrFutureLeakageReason(column.name, opts.targetName);
      if (!reason || seenFeatureIssues.has(column.name)) continue;
      seenFeatureIssues.add(column.name);
      blockers.push(issue(
        "blocker",
        "METHOD_GUIDANCE_OUTCOME_LEAKAGE_FEATURE",
        `Candidate prediction feature '${column.name}' looks outcome-derived or post-index (${reason}). Exclude leakage-prone future/outcome fields before model development, validation, or comparison.`,
        [column.name],
      ));
    }
  }

  return { warnings, blockers, hasIssues: warnings.length > 0 || blockers.length > 0 };
}

function roleSupportColumnsForGuidance(opts: {
  goal: ModelingGoal;
  request: ModelingDecisionRequest;
  targetColumn: ModelingTableColumn | null;
  targetType: ModelingDecisionPlan["statisticalMethodGuidance"]["dataShape"]["targetType"];
  numericExposureColumn: ModelingTableColumn | null;
  genericGroupingColumn: ModelingTableColumn | null;
  treatmentColumn: ModelingTableColumn | null;
  postColumn: ModelingTableColumn | null;
  periodColumn: ModelingTableColumn | null;
  trendTimeColumn: ModelingTableColumn | null;
  runningVariableColumn: ModelingTableColumn | null;
  instrumentColumn: ModelingTableColumn | null;
  survivalTimeColumn: ModelingTableColumn | null;
  clusterColumn: ModelingTableColumn | null;
  repeatedMeasures: ModelingTableColumn[];
  repeatedBinaryMeasures: ModelingTableColumn[];
  quasiExperimentalIntent: ReturnType<typeof inferQuasiExperimentalIntent>;
}): ModelingTableColumn[] {
  const columns: Array<ModelingTableColumn | null | undefined> = [opts.targetColumn];
  if (opts.request.timeToEvent || opts.targetType === "time_to_event") {
    columns.push(opts.survivalTimeColumn);
  }
  if (opts.request.repeatedMeasures || opts.request.dataStructures.includes("repeated_measures")) {
    columns.push(...(opts.targetType === "binary" ? opts.repeatedBinaryMeasures : opts.repeatedMeasures).slice(0, 4));
  } else if (opts.goal === "compare_groups") {
    columns.push(opts.genericGroupingColumn);
  } else if (opts.goal === "causal" || opts.quasiExperimentalIntent) {
    columns.push(opts.treatmentColumn ?? opts.numericExposureColumn ?? opts.genericGroupingColumn);
  } else if (opts.goal === "associate" || opts.goal === "predict" || opts.goal === "classify" || opts.goal === "diagnose") {
    columns.push(opts.numericExposureColumn ?? opts.treatmentColumn ?? opts.genericGroupingColumn);
  }
  if (opts.quasiExperimentalIntent === "difference-in-differences") {
    columns.push(opts.postColumn);
  } else if (opts.quasiExperimentalIntent === "event-study-did") {
    columns.push(opts.periodColumn);
  } else if (opts.quasiExperimentalIntent === "interrupted-time-series") {
    columns.push(opts.trendTimeColumn, opts.postColumn);
  } else if (opts.quasiExperimentalIntent === "regression-discontinuity") {
    columns.push(opts.runningVariableColumn);
  } else if (opts.quasiExperimentalIntent === "instrumental-variables-2sls") {
    columns.push(opts.instrumentColumn);
  }
  if (opts.request.clustered || opts.request.dataStructures.some(structure => ["clustered", "nested", "longitudinal"].includes(structure))) {
    columns.push(opts.clusterColumn);
  }
  return uniqueColumns(columns);
}

function estimateGuidanceRoleCompleteSupport(rowCount: number | null, columns: ModelingTableColumn[]): {
  columns: string[];
  estimatedRows: number | null;
  estimatedFraction: number | null;
  limitingColumns: string[];
} {
  if (rowCount === null || rowCount <= 0 || columns.length === 0) {
    return { columns: columns.map(column => column.name), estimatedRows: null, estimatedFraction: null, limitingColumns: [] };
  }
  const boundedFractions = columns.map(column => Math.max(0, Math.min(1, 1 - column.missingFraction)));
  const estimatedFraction = boundedFractions.reduce((product, fraction) => product * fraction, 1);
  const estimatedRows = Math.round(rowCount * estimatedFraction);
  const limitingColumns = [...columns]
    .sort((a, b) => b.missingFraction - a.missingFraction || a.name.localeCompare(b.name))
    .slice(0, 4)
    .map(column => `${column.name} (${(column.missingFraction * 100).toFixed(1)}% missing)`);
  return {
    columns: columns.map(column => column.name),
    estimatedRows,
    estimatedFraction: Number(estimatedFraction.toFixed(4)),
    limitingColumns,
  };
}

function approximateGuidanceParameterCount(
  numericPredictors: ModelingTableColumn[],
  categoricalPredictors: ModelingTableColumn[],
): number {
  const numericTerms = numericPredictors.length;
  const categoricalTerms = categoricalPredictors
    .reduce((sum, column) => {
      const levelCount = classCountFor(column) ?? column.valueCounts.length;
      return sum + Math.max(1, levelCount - 1);
    }, 0);
  return Math.max(1, 1 + numericTerms + categoricalTerms);
}

function approximateSelectedGuidanceParameterCount(columns: ModelingTableColumn[]): number {
  const uniqueColumns = new Map(columns.map(column => [column.name, column]));
  const selected = [...uniqueColumns.values()];
  const numericPredictors = selected.filter(column => columnKind(column) === "continuous" || columnKind(column) === "count");
  const categoricalPredictors = selected.filter(column => columnKind(column) === "binary" || columnKind(column) === "categorical");
  const unknownTerms = selected.length - numericPredictors.length - categoricalPredictors.length;
  return approximateGuidanceParameterCount(numericPredictors, categoricalPredictors) + unknownTerms;
}

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

function targetKindForGuidance(column: ModelingTableColumn, declaredOutcomeType: OutcomeType): ModelingDecisionPlan["statisticalMethodGuidance"]["dataShape"]["targetType"] {
  if (declaredOutcomeType === "binary") return "binary";
  if (declaredOutcomeType === "continuous") return "continuous";
  if (declaredOutcomeType === "count" || declaredOutcomeType === "rate") return "count";
  if (declaredOutcomeType === "categorical") return "categorical";
  if (declaredOutcomeType === "ordinal") return "categorical";
  if (declaredOutcomeType === "time_to_event") return "time_to_event";
  return columnKind(column);
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
  if (column.uniqueCount !== undefined) return column.uniqueCount || null;
  if (column.valueCounts.length) return column.valueCounts.length;
  const values = new Set(column.sampleValues.filter(value => value !== ""));
  return values.size || null;
}

function minValueCount(column: ModelingTableColumn | null | undefined): number | null {
  if (!column?.valueCounts.length) return null;
  const counts = column.valueCounts.map(item => item.count).filter(count => Number.isFinite(count));
  return counts.length ? Math.min(...counts) : null;
}

function eventStateEvidenceForGuidance(
  column: ModelingTableColumn | null,
  declaredOutcomeType: OutcomeType,
  request: ModelingDecisionRequest,
): { hasCompetingStates: boolean; levelSummary: string } {
  if (!column || declaredOutcomeType !== "time_to_event" && !request.timeToEvent) {
    return { hasCompetingStates: false, levelSummary: "(not time-to-event)" };
  }
  const numericLevels = column.valueCounts.length
    ? column.valueCounts.map(item => Number(item.value)).filter(Number.isFinite)
    : column.sampleValues.map(value => Number(value)).filter(Number.isFinite);
  const uniqueLevels = [...new Set(numericLevels)].sort((a, b) => a - b);
  const positiveLevels = uniqueLevels.filter(value => value > 0);
  const maxLevel = column.max ?? (uniqueLevels.length ? Math.max(...uniqueLevels) : null);
  const hasCompetingStates = positiveLevels.length > 1 || (maxLevel !== null && maxLevel > 1 && uniqueLevels.includes(0));
  const levelSummary = uniqueLevels.length
    ? uniqueLevels.map(value => Number.isInteger(value) ? String(value) : value.toPrecision(4)).join(", ")
    : column.min !== undefined || column.max !== undefined
      ? `range ${column.min ?? "unknown"} to ${column.max ?? "unknown"}`
      : "levels unavailable";
  return { hasCompetingStates, levelSummary };
}

function valueFraction(column: ModelingTableColumn, rawValue: string): number | null {
  const found = column.valueCounts.find(item => item.value === rawValue || Number(item.value) === Number(rawValue));
  return found ? found.fraction : null;
}

function numericShapeForColumn(column: ModelingTableColumn | null): {
  skewness: number | null;
  outlierFraction: number | null;
  zeroFraction: number | null;
  varianceMeanRatio: number | null;
} {
  if (!column || columnKind(column) !== "continuous" && columnKind(column) !== "count" && columnKind(column) !== "binary") {
    return { skewness: null, outlierFraction: null, zeroFraction: null, varianceMeanRatio: null };
  }
  const mean = typeof column.mean === "number" && Number.isFinite(column.mean) ? column.mean : null;
  const variance = typeof column.variance === "number" && Number.isFinite(column.variance)
    ? column.variance
    : typeof column.sd === "number" && Number.isFinite(column.sd)
      ? column.sd ** 2
      : null;
  const varianceMeanRatio = mean !== null && mean > 0 && variance !== null ? variance / mean : null;
  return {
    skewness: typeof column.skewness === "number" && Number.isFinite(column.skewness) ? column.skewness : null,
    outlierFraction: typeof column.outlierFraction === "number" && Number.isFinite(column.outlierFraction) ? column.outlierFraction : null,
    zeroFraction: typeof column.zeroFraction === "number" && Number.isFinite(column.zeroFraction)
      ? column.zeroFraction
      : valueFraction(column, "0"),
    varianceMeanRatio,
  };
}

function binaryCountsFor(column: ModelingTableColumn): { eventCount: number; nonEventCount: number; eventLabel: string } | null {
  if (!column.valueCounts.length) return null;
  const classCount = classCountFor(column);
  if (classCount !== 2) return null;
  const sorted = [...column.valueCounts].sort((a, b) => {
    const numericA = Number(a.value);
    const numericB = Number(b.value);
    if (Number.isFinite(numericA) && Number.isFinite(numericB) && numericA !== numericB) return numericA - numericB;
    return a.value.localeCompare(b.value);
  });
  const positive = sorted.find(item => Number(item.value) === 1)
    ?? sorted.find(item => /^(true|yes|y|case|event|positive|pos|dead|death)$/i.test(item.value))
    ?? sorted[sorted.length - 1];
  if (!positive) return null;
  const eventCount = positive.count;
  const nonEventCount = column.valueCounts.reduce((sum, item) => sum + (item.value === positive.value ? 0 : item.count), 0);
  return { eventCount, nonEventCount, eventLabel: positive.value };
}

function looksLikeCountColumn(column: ModelingTableColumn): boolean {
  const lower = column.name.toLowerCase();
  if (/(count|number|visits|admissions|events|episodes)/.test(lower)) return true;
  if (column.min !== undefined && column.max !== undefined && column.min >= 0 && column.max <= 100 && column.sampleValues.length) {
    return column.sampleValues.every(value => Number.isInteger(Number(value)) && Number(value) >= 0);
  }
  return false;
}

function hasCorrelatedOutcomeStructure(request: ModelingDecisionRequest): boolean {
  return request.repeatedMeasures
    || request.clustered
    || request.dataStructures.some(structure => ["repeated_measures", "clustered", "nested", "longitudinal"].includes(structure));
}

function looksOrdinalOutcome(column: ModelingTableColumn | null): boolean {
  if (!column) return false;
  const lower = column.name.toLowerCase();
  if (/(grade|stage|class|score|severity|rank|ordinal|likert|nyha|asa|category_level)/.test(lower)) return true;
  const levels = classCountFor(column);
  if (levels === null || levels < 3 || levels > 12) return false;
  const values = column.valueCounts.length ? column.valueCounts.map(item => item.value) : column.sampleValues;
  if (!values.length) return false;
  const numericValues = values.map(value => Number(value));
  return numericValues.every(value => Number.isFinite(value) && Number.isInteger(value)) && new Set(numericValues).size >= 3;
}

function bestClusterColumn(columns: ModelingTableColumn[], rowCount: number | null): ModelingTableColumn | null {
  const candidates = columns
    .filter(column => {
      const lower = column.name.toLowerCase();
      if (!/(^|_)(id|subject|person|patient|encounter|visit|cluster|site|hospital|provider|physician|clinic|facility|center|centre|school|unit)(_|$)/.test(lower)
        && !/(subject|patient|cluster|site|hospital|provider|clinic|facility|school)/.test(lower)) {
        return false;
      }
      const levels = classCountFor(column);
      if (levels !== null && levels < 2) return false;
      if (rowCount !== null && levels !== null && levels > rowCount) return false;
      return column.nonMissingRows > 0;
    })
    .sort((a, b) => clusterColumnScore(b, rowCount) - clusterColumnScore(a, rowCount) || a.name.localeCompare(b.name));
  return candidates[0] ?? null;
}

function clusterColumnScore(column: ModelingTableColumn, rowCount: number | null): number {
  const lower = column.name.toLowerCase();
  let score = 0;
  if (/(subject|person|patient|participant)/.test(lower)) score += 24;
  if (/(cluster|site|hospital|provider|physician|clinic|facility|center|centre|school|unit)/.test(lower)) score += 20;
  if (/(^|_)id(_|$)/.test(lower)) score += 12;
  if (/(age|sex|gender|race|treat|exposure|group|arm|outcome|score|cost|count|time|date|year)/.test(lower)) score -= 20;
  const levels = classCountFor(column);
  if (levels !== null && rowCount !== null && rowCount > 0) {
    const fraction = levels / rowCount;
    if (fraction < 0.02) score -= 8;
    else if (fraction < 0.95) score += 8;
    else score += 3;
  } else if (levels !== null) {
    score += Math.min(8, levels / 5);
  }
  score -= column.missingFraction * 10;
  return score;
}

function bestExposureColumn(numericPredictors: ModelingTableColumn[], categoricalPredictors: ModelingTableColumn[], clusterColumn: ModelingTableColumn | null): ModelingTableColumn | null {
  return [...numericPredictors, ...categoricalPredictors]
    .filter(column => column.name !== clusterColumn?.name)
    .filter(column => {
      const lower = column.name.toLowerCase();
      return !/(^|_)(id|subject|person|patient|encounter|visit|cluster)(_|$)/.test(lower)
        && !/(follow|time|duration|survival|person[_-]?time|days?|months?|years?|date|year)/i.test(lower);
    })
    .sort((a, b) => exposureColumnScore(b) - exposureColumnScore(a) || a.name.localeCompare(b.name))[0] ?? null;
}

function bestNumericExposureColumn(numericPredictors: ModelingTableColumn[], clusterColumn: ModelingTableColumn | null): ModelingTableColumn | null {
  return numericPredictors
    .filter(column => column.name !== clusterColumn?.name)
    .filter(column => {
      const lower = column.name.toLowerCase();
      return !/(^|_)(id|subject|person|patient|encounter|visit|cluster)(_|$)/.test(lower)
        && !/(follow|time|duration|survival|person[_-]?time|days?|months?|years?|date|year)/i.test(lower);
    })
    .sort((a, b) => numericExposureColumnScore(b) - numericExposureColumnScore(a) || a.name.localeCompare(b.name))[0] ?? null;
}

function bestTreatmentColumn(numericPredictors: ModelingTableColumn[], categoricalPredictors: ModelingTableColumn[], clusterColumn: ModelingTableColumn | null): ModelingTableColumn | null {
  return [...categoricalPredictors, ...numericPredictors]
    .filter(column => column.name !== clusterColumn?.name)
    .filter(column => {
      const lower = column.name.toLowerCase();
      if (/(^|_)(id|subject|person|patient|encounter|visit|cluster)(_|$)/.test(lower)) return false;
      const kind = columnKind(column);
      return kind === "binary" || kind === "categorical";
    })
    .sort((a, b) => treatmentColumnScore(b) - treatmentColumnScore(a) || a.name.localeCompare(b.name))[0] ?? null;
}

function bestPostColumn(columns: ModelingTableColumn[]): ModelingTableColumn | null {
  return columns
    .filter(column => {
      const lower = column.name.toLowerCase();
      const levels = classCountFor(column);
      return column.nonMissingRows > 0
        && (levels === null || levels <= 8)
        && (/(^|_)(post|after|period|phase|era|intervention_period|policy_period|time_period)(_|$)/.test(lower)
          || /(post|after|prepost|intervention|policy|period|phase|era)/.test(lower));
    })
    .sort((a, b) => postColumnScore(b) - postColumnScore(a) || a.name.localeCompare(b.name))[0] ?? null;
}

function bestTrendTimeColumn(numericPredictors: ModelingTableColumn[]): ModelingTableColumn | null {
  return numericPredictors
    .filter(column => {
      const lower = column.name.toLowerCase();
      if (/(follow|survival|duration|los|length)/.test(lower)) return false;
      return /(time|date|year|month|quarter|week|day|index|sequence|order|period)/.test(lower);
    })
    .sort((a, b) => timeColumnScore(b) - timeColumnScore(a) || a.name.localeCompare(b.name))[0] ?? null;
}

function bestRunningVariableColumn(numericPredictors: ModelingTableColumn[]): ModelingTableColumn | null {
  return numericPredictors
    .filter(column => {
      const lower = column.name.toLowerCase();
      if (/(id|subject|patient|time|date|year|post|period|outcome|event|death)/.test(lower)) return false;
      return /(running|assignment|score|threshold|cutoff|forcing|eligibility|distance|rank|index|age)/.test(lower);
    })
    .sort((a, b) => runningVariableScore(b) - runningVariableScore(a) || a.name.localeCompare(b.name))[0] ?? null;
}

function bestInstrumentColumn(columns: ModelingTableColumn[], treatmentColumn: ModelingTableColumn | null, clusterColumn: ModelingTableColumn | null): ModelingTableColumn | null {
  return columns
    .filter(column => column.name !== treatmentColumn?.name && column.name !== clusterColumn?.name)
    .filter(column => {
      const lower = column.name.toLowerCase();
      if (/(^|_)(id|subject|person|patient|encounter|visit|cluster)(_|$)/.test(lower)) return false;
      return /(instrument|encouragement|assignment|preference|distance|lottery|eligibility|policy|availability|z_)/.test(lower);
    })
    .sort((a, b) => instrumentColumnScore(b) - instrumentColumnScore(a) || a.name.localeCompare(b.name))[0] ?? null;
}

function bestAdjustmentCovariates(columns: ModelingTableColumn[], excludedNames: Set<string>): ModelingTableColumn[] {
  return columns
    .filter(column => !excludedNames.has(column.name))
    .filter(column => {
      const lower = column.name.toLowerCase();
      if (column.nonMissingRows <= 0) return false;
      if (/(^|_)(id|subject|person|patient|encounter|visit|row|cluster)(_|$)/.test(lower)) return false;
      if (/(outcome|event|death|mortality|endpoint|target|label|post|after|period|phase|time|date|year|instrument|running|cutoff|threshold|score_cutoff)/.test(lower)) return false;
      if (/(treat|treated|exposure|intervention|procedure_group|group|arm|case|control)/.test(lower)) return false;
      return columnKind(column) === "continuous" || columnKind(column) === "count" || columnKind(column) === "binary" || columnKind(column) === "categorical";
    })
    .sort((a, b) => adjustmentCovariateScore(b) - adjustmentCovariateScore(a) || a.name.localeCompare(b.name))
    .slice(0, 8);
}

function exposureColumnScore(column: ModelingTableColumn): number {
  const lower = column.name.toLowerCase();
  let score = 0;
  if (/(treat|exposure|procedure|therapy|dose|intervention|group|arm|risk|predictor)/.test(lower)) score += 20;
  if (columnKind(column) === "binary") score += 8;
  if (columnKind(column) === "categorical") score += 4;
  score += Math.min(6, Math.log10(Math.max(1, column.nonMissingRows)) * 3);
  score -= column.missingFraction * 10;
  return score;
}

function adjustmentCovariateScore(column: ModelingTableColumn): number {
  const lower = column.name.toLowerCase();
  let score = 0;
  if (/(age|sex|gender|race|ethnicity|income|bmi|severity|baseline|comorbid|diabetes|hypertension|copd|cad|ckd|renal|site|hospital|smoking|insurance|risk|prior|history)/.test(lower)) score += 22;
  if (columnKind(column) === "continuous" || columnKind(column) === "binary") score += 6;
  if (columnKind(column) === "categorical") score += 3;
  const levels = classCountFor(column);
  if (levels !== null && levels > 30) score -= 12;
  score += Math.min(6, Math.log10(Math.max(1, column.nonMissingRows)) * 3);
  score -= column.missingFraction * 14;
  return score;
}

function treatmentColumnScore(column: ModelingTableColumn): number {
  const lower = column.name.toLowerCase();
  let score = exposureColumnScore(column);
  if (/(treat|treated|intervention|exposure|therapy|assigned|policy|program|procedure|group|arm)/.test(lower)) score += 18;
  if (columnKind(column) === "binary") score += 10;
  if (/(post|after|period|time|date|year|instrument|score|outcome|event)/.test(lower)) score -= 16;
  return score;
}

function postColumnScore(column: ModelingTableColumn): number {
  const lower = column.name.toLowerCase();
  let score = 0;
  if (/(^|_)(post|after|prepost)(_|$)/.test(lower)) score += 24;
  if (/(intervention|policy|period|phase|era)/.test(lower)) score += 12;
  if (columnKind(column) === "binary") score += 10;
  if (/(outcome|event|score|risk|treat|exposure)/.test(lower)) score -= 12;
  score -= column.missingFraction * 10;
  return score;
}

function timeColumnScore(column: ModelingTableColumn): number {
  const lower = column.name.toLowerCase();
  let score = 0;
  if (/(^|_)(time|date|year|month|quarter|week|day|period)(_|$)/.test(lower)) score += 20;
  if (/(sequence|index|order)/.test(lower)) score += 8;
  if (/(follow|survival|duration|los|length|outcome|event)/.test(lower)) score -= 12;
  if (column.uniqueCount !== undefined) score += Math.min(8, Math.log10(Math.max(1, column.uniqueCount)) * 4);
  score -= column.missingFraction * 10;
  return score;
}

function runningVariableScore(column: ModelingTableColumn): number {
  const lower = column.name.toLowerCase();
  let score = 0;
  if (/(running|forcing|assignment|eligibility|score|threshold|distance|rank|index)/.test(lower)) score += 20;
  if (/(age)/.test(lower)) score += 5;
  if (column.uniqueCount !== undefined) score += Math.min(8, Math.log10(Math.max(1, column.uniqueCount)) * 4);
  score -= column.missingFraction * 10;
  return score;
}

function instrumentColumnScore(column: ModelingTableColumn): number {
  const lower = column.name.toLowerCase();
  let score = 0;
  if (/(instrument|encouragement|lottery|preference|assignment|eligibility|distance|policy|availability)/.test(lower)) score += 24;
  if (/(treat|exposure|outcome|event|post|period)/.test(lower)) score -= 16;
  if (columnKind(column) === "binary") score += 5;
  score -= column.missingFraction * 10;
  return score;
}

function numericExposureColumnScore(column: ModelingTableColumn): number {
  const lower = column.name.toLowerCase();
  let score = exposureColumnScore(column);
  if (/(biomarker|marker|measure|score|index|level|dose|exposure|predictor|risk)/.test(lower)) score += 8;
  if (/(age|sex|gender|race|ethnicity|year|date)/.test(lower)) score -= 8;
  if (column.uniqueCount !== undefined) score += Math.min(6, Math.log10(Math.max(1, column.uniqueCount)) * 3);
  return score;
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

function repeatedMeasureColumns(
  target: ModelingTableColumn | null,
  numericPredictors: ModelingTableColumn[],
  request: ModelingDecisionRequest,
): ModelingTableColumn[] {
  if (!request.repeatedMeasures && !request.dataStructures.includes("repeated_measures")) return [];
  const candidates = [target, ...numericPredictors].filter((column): column is ModelingTableColumn => Boolean(column));
  const seen = new Set<string>();
  return candidates
    .filter(column => {
      if (seen.has(column.name)) return false;
      seen.add(column.name);
      const lower = column.name.toLowerCase();
      if (/(^|_)(id|subject|person|patient|encounter|visit|row)(_|$)/.test(lower)) return false;
      if (/(group|arm|treat|exposure|case|control|sex|gender|race|site|hospital)/.test(lower) && columnKind(column) !== "continuous") return false;
      return columnKind(column) === "continuous" || columnKind(column) === "count";
    })
    .sort((a, b) => repeatedMeasureOrder(a.name) - repeatedMeasureOrder(b.name) || a.name.localeCompare(b.name));
}

function repeatedBinaryMeasureColumns(
  target: ModelingTableColumn | null,
  categoricalPredictors: ModelingTableColumn[],
  request: ModelingDecisionRequest,
): ModelingTableColumn[] {
  if (!request.repeatedMeasures && !request.dataStructures.includes("repeated_measures") && !request.dataStructures.includes("paired")) return [];
  const candidates = [target, ...categoricalPredictors].filter((column): column is ModelingTableColumn => Boolean(column));
  const seen = new Set<string>();
  return candidates
    .filter(column => {
      if (seen.has(column.name)) return false;
      seen.add(column.name);
      const lower = column.name.toLowerCase();
      if (/(^|_)(id|subject|person|patient|encounter|visit|row)(_|$)/.test(lower)) return false;
      if (/(group|arm|treat|exposure|case|control|sex|gender|race|site|hospital)/.test(lower)) return false;
      return columnKind(column) === "binary";
    })
    .sort((a, b) => repeatedMeasureOrder(a.name) - repeatedMeasureOrder(b.name) || a.name.localeCompare(b.name));
}

function repeatedMeasureOrder(name: string): number {
  const lower = name.toLowerCase();
  if (/baseline|pre|before|time[_-]?0|t0|month[_-]?0|day[_-]?0/.test(lower)) return 0;
  if (/post|after|follow|time[_-]?1|t1|month[_-]?1|day[_-]?1/.test(lower)) return 10;
  const match = lower.match(/(?:time|month|week|day|visit|t)[_-]?(\d+)/);
  return match ? 20 + Number(match[1]) : 100;
}

function bestSurvivalTimeColumn(numericPredictors: ModelingTableColumn[]): ModelingTableColumn | null {
  const candidates = numericPredictors
    .filter(column => {
      const lower = column.name.toLowerCase();
      if (/(^|_)(id|subject|person|patient|encounter|row)(_|$)/.test(lower)) return false;
      if (!/(follow|time|duration|survival|person[_-]?time|days?|months?|years?|interval|at[_-]?risk|los|length[_-]?of[_-]?stay)/i.test(lower)) return false;
      const levelCount = classCountFor(column);
      if (levelCount !== null && levelCount < 3) return false;
      if (typeof column.max === "number" && column.max <= 0) return false;
      return column.nonMissingRows > 0;
    })
    .sort((a, b) => survivalTimeColumnScore(b) - survivalTimeColumnScore(a) || a.name.localeCompare(b.name));
  return candidates[0] ?? null;
}

function survivalTimeColumnScore(column: ModelingTableColumn): number {
  const lower = column.name.toLowerCase();
  let score = 0;
  if (/follow/.test(lower)) score += 20;
  if (/person[_-]?time|at[_-]?risk/.test(lower)) score += 18;
  if (/survival/.test(lower)) score += 16;
  if (/duration|interval|length[_-]?of[_-]?stay|los/.test(lower)) score += 14;
  if (/days?|months?|years?/.test(lower)) score += 12;
  if (/(^|_)time(_|$)/.test(lower)) score += 10;
  if (/age|year[_-]?of|calendar|date/.test(lower)) score -= 18;
  score += Math.min(10, Math.log10(Math.max(1, column.nonMissingRows)) * 4);
  score += Math.min(6, classCountFor(column) ?? 0);
  score -= column.missingFraction * 10;
  return score;
}

function statsRunMethodCommandForGuidance(
  method: string,
  request: ModelingDecisionRequest,
  target: ModelingTableColumn | null,
  numericPredictors: ModelingTableColumn[],
  categoricalPredictors: ModelingTableColumn[],
): string | null {
  const shared = `agenteer research stats-run --method ${method} --data <rows.csv> --out-dir <out>`;
  const outcome = request.roleHints.outcome ?? target?.name ?? request.target ?? "<outcome>";
  const clusterColumn = bestClusterColumn([...numericPredictors, ...categoricalPredictors], request.tableSummary?.rowCount ?? null);
  const exposure = request.roleHints.exposure
    ?? bestExposureColumn(numericPredictors, categoricalPredictors, clusterColumn)?.name
    ?? numericPredictors.find(column => column.name !== clusterColumn?.name)?.name
    ?? categoricalPredictors.find(column => column.name !== clusterColumn?.name)?.name
    ?? "<exposure>";
  const correlationExposure = request.roleHints.exposure ?? bestNumericExposureColumn(numericPredictors, clusterColumn)?.name ?? exposure;
  const survivalTime = request.roleHints.stop ?? request.roleHints.time ?? bestSurvivalTimeColumn(numericPredictors)?.name ?? "<time>";
  const survivalStart = request.roleHints.start ?? "<interval-start>";
  const survivalStop = request.roleHints.stop ?? survivalTime;
  const survivalEvent = request.roleHints.event ?? outcome;
  const treatment = request.roleHints.exposure
    ?? request.roleHints.group
    ?? bestTreatmentColumn(numericPredictors, categoricalPredictors, clusterColumn)?.name
    ?? "<treatment>";
  const post = request.roleHints.post ?? bestPostColumn([...numericPredictors, ...categoricalPredictors])?.name ?? "<post-period-indicator>";
  const period = request.roleHints.period ?? bestPostColumn([...numericPredictors, ...categoricalPredictors])?.name ?? "<period-or-event-time>";
  const trendTime = request.roleHints.time ?? bestTrendTimeColumn(numericPredictors)?.name ?? "<time>";
  const runningVariable = request.roleHints.runningVariable ?? bestRunningVariableColumn(numericPredictors)?.name ?? "<running-variable>";
  const instrument = request.roleHints.instrument ?? bestInstrumentColumn([...numericPredictors, ...categoricalPredictors], bestTreatmentColumn(numericPredictors, categoricalPredictors, clusterColumn), clusterColumn)?.name ?? "<instrument>";
  const survivalExposure = request.roleHints.exposure
    ?? request.roleHints.group
    ?? categoricalPredictors[0]?.name
    ?? numericPredictors.find(column => !/(time|follow|days|duration|survival)/i.test(column.name))?.name
    ?? exposure;
  const group = request.roleHints.group ?? bestGroupingColumn(categoricalPredictors)?.name ?? "<group>";
  const cluster = request.roleHints.cluster ?? request.roleHints.id ?? clusterColumn?.name ?? "<subject-or-cluster-id>";
  const partialCovariate = request.roleHints.covariates[0] ?? numericPredictors.find(column => column.name !== correlationExposure && column.name !== clusterColumn?.name)?.name ?? "<covariate>";
  const adjustmentExcludedNames = [outcome, exposure, group, clusterColumn?.name]
    .filter((name): name is string => typeof name === "string" && name.length > 0 && !name.startsWith("<"));
  const adjustmentCovariates = bestAdjustmentCovariates([...numericPredictors, ...categoricalPredictors], new Set(adjustmentExcludedNames));
  const covariateArgs = adjustmentCovariates.length
    ? adjustmentCovariates.slice(0, 2).map(column => `--covariate ${column.name}`).join(" ")
    : "--covariate <covariate>";
  const repeatedMeasures = repeatedMeasureColumns(target, numericPredictors, request);
  const repeatedBinaryMeasures = repeatedBinaryMeasureColumns(target, categoricalPredictors, request);
  if (["descriptive", "missingness-summary", "pca", "clustering-validation"].includes(method)) return `${shared} --variable <column>`;
  if (["paired-t-test", "wilcoxon"].includes(method)) {
    const variables = repeatedMeasures.slice(0, 2).map(column => `--variable ${column.name}`).join(" ");
    return `${shared} ${variables || "--variable <pre-measure> --variable <post-measure>"}`;
  }
  if (method === "friedman") {
    const variables = repeatedMeasures.slice(0, 3).map(column => `--variable ${column.name}`).join(" ");
    return `${shared} ${variables || "--variable <time-1-measure> --variable <time-2-measure> --variable <time-3-measure>"}`;
  }
  if (method === "cochran-q") {
    const variables = repeatedBinaryMeasures.slice(0, 4).map(column => `--variable ${column.name}`).join(" ");
    return `${shared} ${variables || "--variable <binary-time-1> --variable <binary-time-2> --variable <binary-time-3>"}`;
  }
  if (method === "mcnemar" && repeatedBinaryMeasures.length >= 2) return `${shared} --outcome ${repeatedBinaryMeasures[0]!.name} --exposure ${repeatedBinaryMeasures[1]!.name}`;
  if (method === "repeated-measures-anova") return `${shared} --outcome ${outcome} --exposure <time-or-condition> --id ${cluster}`;
  if (method === "linear-mixed-model" || method === "gee" || method === "generalized-mixed-model") return `${shared} --outcome ${outcome} --exposure ${exposure} --cluster ${cluster}`;
  if (["t-test", "welch-t-test", "mann-whitney", "anova", "kruskal-wallis"].includes(method)) return `${shared} --outcome ${outcome} --group ${group}`;
  if (method === "ancova") return `${shared} --outcome ${outcome} --group ${group} ${covariateArgs}`;
  if (["chi-square", "fisher-exact", "mcnemar"].includes(method)) return `${shared} --outcome ${outcome} --exposure ${group}`;
  if (["pearson", "spearman", "kendall"].includes(method)) return `${shared} --outcome ${outcome} --exposure ${correlationExposure}`;
  if (method === "partial-correlation") return `${shared} --outcome ${outcome} --exposure ${correlationExposure} --covariate ${partialCovariate}`;
  if (method === "diagnostic-accuracy") return `${shared} --outcome ${outcome} --exposure ${exposure === outcome ? "<binary-index-test>" : exposure}`;
  if (method === "prediction-evaluation") return `${shared} --outcome ${outcome} --exposure ${exposure === outcome ? "<risk-score-or-probability>" : exposure}`;
  if (method === "power-sample-size") return `${shared} --variable ${outcome} --outcome-threshold 0.5 --exposure-threshold 0.8`;
  if (method === "difference-in-differences") return `${shared} --outcome ${outcome} --exposure ${treatment} --post ${post}`;
  if (method === "event-study-did") return `${shared} --outcome ${outcome} --exposure ${treatment} --period ${period}`;
  if (method === "interrupted-time-series") return `${shared} --outcome ${outcome} --time ${trendTime} --post ${post}`;
  if (method === "regression-discontinuity") return `${shared} --outcome ${outcome} --running-variable ${runningVariable} --cutoff <cutoff>`;
  if (method === "instrumental-variables-2sls") return `${shared} --outcome ${outcome} --exposure ${treatment} --instrument ${instrument}`;
  if (method.includes("regression") || method.endsWith("-glm")) return `${shared} --outcome ${outcome} --exposure ${exposure} ${covariateArgs}`;
  if (method === "kaplan-meier") return `${shared} --time ${survivalTime} --event ${survivalEvent}${group === "<group>" ? "" : ` --group ${group}`}`;
  if (method === "log-rank") return `${shared} --time ${survivalTime} --event ${survivalEvent} --group ${group}`;
  if (method === "recurrent-event-cox") return `${shared} --start ${survivalStart} --stop ${survivalStop} --event ${survivalEvent} --id ${cluster} --exposure ${survivalExposure}`;
  if (method === "time-varying-cox") return `${shared} --start ${survivalStart} --stop ${survivalStop} --event ${survivalEvent} --id ${cluster} --exposure ${survivalExposure}`;
  if (["cox-proportional-hazards", "stratified-cox", "fine-gray"].includes(method)) return `${shared} --time ${survivalTime} --event ${survivalEvent} --exposure ${survivalExposure}`;
  if (method === "aalen-johansen-cif") return `${shared} --time ${survivalTime} --event ${survivalEvent}${group === "<group>" ? "" : ` --group ${group}`}`;
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
    const methodDecisionReview = run.issueCodes.includes("STATS_METHOD_DECISION_ALIGNMENT_REVIEW");
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
    if (methodDecisionReview) {
      return priorRunAction(run, "reject-or-redesign", "Prior run executed a method that data-shaped method-decision support did not classify as the preferred primary route; rerun the preferred method or explicitly demote this run to sensitivity evidence.");
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
  if (statsMethod === "paired-t-test" || statsMethod === "wilcoxon") return `${shared} --variable <pre-measure> --variable <post-measure>`;
  if (statsMethod === "cochran-q") return `${shared} --variable <binary-time-1> --variable <binary-time-2> --variable <binary-time-3>`;
  if (["t-test", "welch-t-test", "mann-whitney", "anova", "kruskal-wallis"].includes(statsMethod)) return `${shared} --outcome <continuous-outcome> --group <group>`;
  if (statsMethod === "ancova") return `${shared} --outcome <continuous-outcome> --group <group> --covariate <covariate>`;
  if (statsMethod === "friedman") return `${shared} --variable <time-1-measure> --variable <time-2-measure> --variable <time-3-measure>`;
  if (["chi-square", "fisher-exact", "mcnemar", "cochran-armitage-trend"].includes(statsMethod)) return `${shared} --outcome <categorical-outcome> --exposure <categorical-exposure>`;
  if (["pearson", "spearman", "kendall", "partial-correlation"].includes(statsMethod)) return `${shared} --outcome <continuous-outcome> --exposure <continuous-exposure>${statsMethod === "partial-correlation" ? " --covariate <covariate>" : ""}`;
  if (["linear-regression", "robust-linear-regression", "quantile-regression", "penalized-linear-regression"].includes(statsMethod)) return `${shared} --outcome <continuous-outcome> --exposure <exposure> --covariate <covariate>`;
  if (["logistic-regression", "ordinal-logistic-regression", "multinomial-logistic-regression", "penalized-logistic-regression"].includes(statsMethod)) return `${shared} --outcome <categorical-outcome> --exposure <exposure> --covariate <covariate>`;
  if (["poisson-regression", "negative-binomial-regression", "zero-inflated-poisson", "zero-inflated-negative-binomial"].includes(statsMethod)) return `${shared} --outcome <count-outcome> --exposure <exposure> --covariate <covariate>`;
  if (["gamma-glm", "inverse-gaussian-glm"].includes(statsMethod)) return `${shared} --outcome <positive-continuous-outcome> --exposure <exposure> --covariate <covariate>`;
  if (statsMethod === "diagnostic-accuracy") return `${shared} --outcome <binary-reference-standard> --exposure <binary-index-test>`;
  if (statsMethod === "prediction-evaluation") return `${shared} --outcome <binary-outcome> --exposure <risk-score-or-probability>`;
  if (statsMethod === "recurrent-event-cox") return `${shared} --start <interval-start> --stop <interval-stop> --event <event-indicator> --id <subject-id> --exposure <exposure> --covariate <covariate>`;
  if (["kaplan-meier", "log-rank", "cox-proportional-hazards", "stratified-cox", "aalen-johansen-cif", "recurrent-event-rate"].includes(statsMethod)) return `${shared} --time <time> --event <event-indicator> --group <group>`;
  if (["linear-mixed-model", "generalized-mixed-model", "gee", "repeated-measures-anova"].includes(statsMethod)) return `${shared} --outcome <outcome> --exposure <exposure> --id <subject-or-cluster-id>`;
  if (["overlap-weighting", "entropy-balancing", "doubly-robust-aipw", "propensity-score-matching", "propensity-score-weighting"].includes(statsMethod)) return `${shared} --outcome <outcome> --exposure <treatment> --covariate <baseline-covariate>`;
  if (statsMethod === "difference-in-differences") return `${shared} --outcome <outcome> --exposure <treated-group> --post <post-period-indicator>`;
  if (statsMethod === "interrupted-time-series") return `${shared} --outcome <outcome> --time <time> --post <post-intervention-indicator>`;
  if (statsMethod === "regression-discontinuity") return `${shared} --outcome <outcome> --running-variable <running-variable> --cutoff <cutoff>`;
  if (statsMethod === "instrumental-variables-2sls") return `${shared} --outcome <outcome> --exposure <treatment> --instrument <instrument>`;
  if (["missingness-summary", "multiple-imputation-mice", "missingness-ipw", "complete-case-sensitivity", "mnar-sensitivity", "pca", "clustering-validation", "cronbach-alpha", "multiple-comparison-correction"].includes(statsMethod)) return `${shared} --variable <column> --variable <column>`;
  if (statsMethod === "reliability-kappa" || statsMethod === "intraclass-correlation" || statsMethod === "bland-altman") return `${shared} --variable <measurement-a> --variable <measurement-b>`;
  if (statsMethod === "model-diagnostics") return `${shared} --outcome <outcome> --exposure <exposure> --covariate <covariate>`;
  if (statsMethod === "power-sample-size") return `${shared} --outcome <outcome> --exposure <group-or-effect-proxy>`;
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

function deriveFeasibilityEvidence(request: ModelingDecisionRequest): ModelingDecisionPlan["feasibilityEvidence"] {
  const evidence = request.feasibilityEvidence;
  if (!evidence) {
    return {
      source: "not-supplied",
      path: null,
      verdict: "unknown",
      status: "unknown",
      score: null,
      confidence: null,
      blockers: [],
      warningsText: [],
      issueCodes: [],
      requiredModifications: [],
      nextAction: null,
      warnings: [],
    };
  }
  const warnings: MachineIssue[] = [];
  if (evidence.status === "block" || evidence.verdict === "reject") {
    warnings.push(issue(
      "blocker",
      "FEASIBILITY_GATE_BLOCKED",
      `Feasibility gate blocks modeling: ${evidence.blockers.join("; ") || evidence.nextAction || evidence.verdict}.`,
      ["request.feasibilityEvidence", ...(evidence.path ? [evidence.path] : [])],
    ));
  } else if (evidence.status === "warning" || evidence.verdict === "needs_data_profiling" || evidence.verdict === "needs_phenotype_review" || evidence.verdict === "exploratory_only") {
    warnings.push(issue(
      "warning",
      "FEASIBILITY_GATE_WARNING",
      `Feasibility gate requires review before formal execution: ${[...evidence.warnings, ...evidence.requiredModifications, evidence.nextAction].filter((item): item is string => Boolean(item)).slice(0, 6).join("; ") || evidence.verdict}.`,
      ["request.feasibilityEvidence", ...(evidence.path ? [evidence.path] : [])],
    ));
  }
  return {
    source: "controller-feasibility",
    path: evidence.path ?? null,
    verdict: evidence.verdict,
    status: evidence.status,
    score: evidence.score ?? null,
    confidence: evidence.confidence ?? null,
    blockers: evidence.blockers,
    warningsText: evidence.warnings,
    issueCodes: evidence.issueCodes,
    requiredModifications: evidence.requiredModifications,
    nextAction: evidence.nextAction ?? null,
    warnings,
  };
}

function feasibilityEvidenceReviewForGuidance(request: ModelingDecisionRequest): { warnings: MachineIssue[]; blockers: MachineIssue[] } {
  const evidence = request.feasibilityEvidence;
  if (!evidence) return { warnings: [], blockers: [] };
  if (evidence.status === "block" || evidence.verdict === "reject") {
    return {
      warnings: [],
      blockers: [issue(
        "blocker",
        "METHOD_GUIDANCE_FEASIBILITY_BLOCKED",
        `Feasibility gate blocked this study idea: ${evidence.blockers.join("; ") || evidence.nextAction || evidence.verdict}.`,
        ["request.feasibilityEvidence", ...(evidence.path ? [evidence.path] : [])],
      )],
    };
  }
  if (evidence.status === "warning" || evidence.verdict === "needs_data_profiling" || evidence.verdict === "needs_phenotype_review" || evidence.verdict === "exploratory_only") {
    return {
      warnings: [issue(
        "warning",
        "METHOD_GUIDANCE_FEASIBILITY_WARNING",
        `Feasibility gate returned ${evidence.verdict}/${evidence.status}; carry these constraints into method choice: ${[...evidence.warnings, ...evidence.requiredModifications, evidence.nextAction].filter((item): item is string => Boolean(item)).slice(0, 6).join("; ") || "review feasibility-gate evidence"}.`,
        ["request.feasibilityEvidence", ...(evidence.path ? [evidence.path] : [])],
      )],
      blockers: [],
    };
  }
  return { warnings: [], blockers: [] };
}

function inferGoal(request: ModelingDecisionRequest): ModelingGoal {
  if (request.goal) return request.goal;
  const q = request.question.toLowerCase();
  const literatureSignals = request.literatureEvidence?.designSignals ?? [];
  if (literatureSignals.includes("diagnostic-accuracy")) return "diagnose";
  if (literatureSignals.includes("prediction-validation")) return "classify";
  if (literatureSignals.includes("causal-inference")) return "causal";
  if (request.requiresPrediction || /\bpredict|prediction|risk score|classify|forecast\b/.test(q)) return request.outcomeType === "continuous" ? "predict" : "classify";
  if (inferQuasiExperimentalIntent(request)) return "causal";
  const comparisonIntent = /\bcompare|comparison|difference|versus|vs\.?|between groups|across groups|by group\b/.test(q);
  const explicitCausalIntent = /\bcaus|causal|effect of|treatment effect|impact of|counterfactual|propensity|instrumental|randomi[sz]ed|assigned|intervention effect\b/.test(q);
  if (comparisonIntent && !explicitCausalIntent) return "compare_groups";
  if (explicitCausalIntent || /\bintervention\b/.test(q)) return "causal";
  if (/\bdiagnos|sensitivity|specificity|auc|roc\b/.test(q)) return "diagnose";
  if (/\bcluster|phenotype|subgroup|latent class\b/.test(q)) return "discover";
  if (/\bpca|dimension|embedding|umap|t-sne|reduce\b/.test(q)) return "reduce_dimensions";
  if (/\bprevalence|mean|proportion|describe|summary|distribution\b/.test(q)) return "describe";
  return "associate";
}

function hasCorrelationIntent(request: ModelingDecisionRequest): boolean {
  const q = request.question.toLowerCase();
  const methodSignals = request.literatureEvidence?.methodSignals ?? [];
  return methodSignals.some(signal => /correlation|rank-association|partial-correlation/i.test(signal))
    || /\bcorrelat|partial correlation|rank association|linear association|monotonic association|relationship between|move together\b/.test(q);
}

function hasAdjustmentIntent(request: ModelingDecisionRequest): boolean {
  const q = request.question.toLowerCase();
  const methodSignals = request.literatureEvidence?.methodSignals ?? [];
  return methodSignals.some(signal => /adjusted|covariate|confound|multivariable|multivariate|ancova|regression-adjusted/i.test(signal))
    || /\badjust(?:ed|ing)?\b|controll?ing for|account(?:ing)? for|covariat|confound|multivariable|multivariate|risk[- ]adjust|case[- ]mix|baseline[- ]adjust|after adjustment|with adjustment/.test(q);
}

function inferQuasiExperimentalIntent(request: ModelingDecisionRequest): "difference-in-differences" | "event-study-did" | "interrupted-time-series" | "regression-discontinuity" | "instrumental-variables-2sls" | null {
  const q = request.question.toLowerCase();
  const methodSignals = request.literatureEvidence?.methodSignals ?? [];
  const signals = `${q} ${methodSignals.join(" ").toLowerCase()}`;
  if (/\bevent[- ]?study|dynamic treatment|event time|event-time/.test(signals)) return "event-study-did";
  if (/\bdifference[- ]?in[- ]?differences|\bdiff[- ]?in[- ]?diff\b|pre.?post.*control|treated.*control.*pre.?post|two[- ]period/.test(signals)) return "difference-in-differences";
  if (/\binterrupted[- ]time[- ]series|\bits\b|segmented regression|interruption|policy change|before and after intervention/.test(signals)) return "interrupted-time-series";
  if (/\bregression[- ]discontinuity|\brdd\b|running variable|forcing variable|cutoff|threshold assignment/.test(signals)) return "regression-discontinuity";
  if (/\binstrumental variable|\biv\b|\b2sls\b|two-stage least squares|weak instrument|instrument relevance/.test(signals)) return "instrumental-variables-2sls";
  return null;
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
