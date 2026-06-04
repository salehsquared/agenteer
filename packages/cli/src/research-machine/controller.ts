import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { access, mkdir, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { z } from "zod";
import { agentContextPreflightCommand, type AgentContextPreflight } from "../commands/agent.js";
import { researchExploreCommand, researchTableSummaryCommand, type ResearchExplorationResult, type ResearchTableSummary } from "../commands/research.js";
import { researchLiteratureContextCommand, researchLiteratureQaCommand, researchMedbreviaLiteratureSearchCommand, type ResearchLiteratureContext, type ResearchLiteratureQaResult, type ResearchLiteratureSearchResult } from "./medbrevia-literature.js";
import { buildAnalysisRunManifest } from "./analysis-manifest.js";
import { evaluateFeasibilityGate, type FeasibilityGateResult, type FeasibilityVerdict } from "./feasibility.js";
import { buildModelingDecisionPlan, type ModelingDecisionPlan, type ModelingDecisionRequest } from "./modeling.js";
import { selectAnalysisMethods } from "./methods.js";
import { researchStudyCriticCommand, reviewAutonomySchema, reviewStageSchema, reviewerProviderConfigs, providerGenerate, type ReviewAutonomy, type ReviewerBudget, type ReviewerModelConfig, type ReviewerPanel, type ReviewReentryPoint, type ReviewStage, type StudyCriticResult } from "./reviewer.js";
import { contractArgumentNameFor, getStatisticalMethodSpec } from "./stats/contracts.js";
import { researchFigureQaCommand, researchStatsRunCommand } from "./stats/commands.js";
import { statsMethodSchema, type StatsMethod, type StatsRunResult } from "./stats/schemas.js";
import { researchBenchmarkSuiteRunCommand, researchBenchmarkTrendCommand, researchManuscriptCommand, researchMethodQaCommand, researchRunInspectCommand, type ContinuousBenchmarkSuiteResult, type ContinuousBenchmarkTrendResult, type ManuscriptResult, type MethodQaResult, type RunInspectionResult } from "./trust.js";
import type { MethodSelectionResult } from "./schemas.js";
import {
  identifierLikeColumnReason as sharedIdentifierLikeColumnReason,
  outcomeOrFutureLeakageReason as sharedOutcomeOrFutureLeakageReason,
  postTreatmentAdjustmentReason as sharedPostTreatmentAdjustmentReason,
  semanticPlausibilityIssuesForColumn as sharedSemanticPlausibilityIssuesForColumn,
} from "./semantic-plausibility.js";

const execFileAsync = promisify(execFile);

export const controllerStageSchema = z.enum([
  "intake",
  "context",
  "dataset_feasibility",
  "exploration",
  "literature",
  "method_selection",
  "execution",
  "qa",
  "manuscript",
  "literature_qa",
  "external_review",
  "repair",
  "inspection",
  "promotion_decision",
  "complete",
  "human_review",
  "blocked",
]);
export type ControllerStage = z.infer<typeof controllerStageSchema>;

export const controllerActionSchema = z.enum([
  "initialize",
  "context_preflight",
  "table_summary",
  "explore",
  "literature_search",
  "select_method",
  "run_analysis",
  "method_qa",
  "write_manuscript",
  "literature_qa",
  "external_review",
  "apply_repairs",
  "inspect_run",
  "decide_promotion",
  "stop_for_human",
  "complete",
  "block",
]);
export type ControllerActionType = z.infer<typeof controllerActionSchema>;

export const controllerRunStatusSchema = z.enum(["running", "needs_human_review", "blocked", "complete", "failed"]);
export type ControllerRunStatus = z.infer<typeof controllerRunStatusSchema>;

export const controllerInputPatchSchema = z.object({
  question: z.string().min(1).optional(),
  method: statsMethodSchema.nullable().optional(),
  outcome: z.string().min(1).nullable().optional(),
  exposure: z.string().min(1).nullable().optional(),
  group: z.string().min(1).nullable().optional(),
  outcomeThreshold: z.number().nullable().optional(),
  exposureThreshold: z.number().nullable().optional(),
  time: z.string().min(1).nullable().optional(),
  start: z.string().min(1).nullable().optional(),
  stop: z.string().min(1).nullable().optional(),
  event: z.string().min(1).nullable().optional(),
  id: z.string().min(1).nullable().optional(),
  strata: z.string().min(1).nullable().optional(),
  cluster: z.string().min(1).nullable().optional(),
  period: z.string().min(1).nullable().optional(),
  post: z.string().min(1).nullable().optional(),
  runningVariable: z.string().min(1).nullable().optional(),
  cutoff: z.number().nullable().optional(),
  instrument: z.string().min(1).nullable().optional(),
  alphaPenalty: z.number().min(0).nullable().optional(),
  l1Ratio: z.number().min(0).max(1).nullable().optional(),
  weight: z.string().min(1).nullable().optional(),
  offset: z.string().min(1).nullable().optional(),
  variables: z.array(z.string().min(1)).optional(),
  covariates: z.array(z.string().min(1)).optional(),
  exactCovariates: z.array(z.string().min(1)).optional(),
  surveyDesign: z.boolean().optional(),
  allowSurveyApproximation: z.boolean().optional(),
});
export type ControllerInputPatch = z.infer<typeof controllerInputPatchSchema>;

export const controllerToolIdSchema = z.enum(["npm-build", "npm-test", "controller-status", "controller-inspect", "controller-read-artifact", "controller-read-file", "controller-search-repo", "controller-run-agenteer", "controller-git-diff", "controller-propose-patch", "controller-apply-patch", "controller-verify-patch", "controller-rollback-patch"]);
export type ControllerToolId = z.infer<typeof controllerToolIdSchema>;

export const controllerToolRequestSchema = z.object({
  toolId: controllerToolIdSchema,
  args: z.array(z.string()).max(12).default([]),
  reason: z.string().min(1),
});
export type ControllerToolRequest = z.infer<typeof controllerToolRequestSchema>;

const controllerSourcePatchChangeSchema = z.object({
  path: z.string().min(1),
  rationale: z.string().min(1),
  after: z.string().min(1).max(250_000).optional(),
  diff: z.string().min(1).max(250_000).optional(),
});

const controllerSourcePatchProposalInputSchema = z.object({
  summary: z.string().min(1),
  risk: z.enum(["low", "medium", "high"]).default("medium"),
  changes: z.array(controllerSourcePatchChangeSchema).min(1).max(8),
  tests: z.array(z.string().min(1)).max(12).default([]),
});

export type ControllerSourcePatchProposalInput = z.infer<typeof controllerSourcePatchProposalInputSchema>;

export interface ControllerModelConfig {
  provider: "openai" | "anthropic" | "google" | "deepseek" | "xai" | "mock";
  model: string;
  enabled: boolean;
  maxInputChars: number;
  maxOutputTokens: number;
  timeoutMs: number;
}

export interface ControllerPolicy {
  autonomy: ReviewAutonomy;
  maxSteps: number;
  minRows: number;
  maxRequiredVariableMissingness: number;
  allowExecution: boolean;
  allowExternalReview: boolean;
  requireExternalReviewForPromotion: boolean;
  mockExternalReview: boolean;
  allowAutoRepair: boolean;
  maxAutoRepairs: number;
  allowInputPatches: boolean;
  maxInputPatches: number;
  allowToolActions: boolean;
  maxToolActions: number;
  allowedToolIds: ControllerToolId[];
  toolTimeoutMs: number;
  allowContext: boolean;
  requireContext: boolean;
  contextRepo: string | null;
  contextTarget: string | null;
  contextBin: string | null;
  autocontextRoot: string | null;
  contextBudgetTokens: number;
  allowLiterature: boolean;
  literatureBaseUrl: string | null;
  literatureEndpoint: string;
  literatureDepth: "quick" | "standard" | "long";
  literatureTopK: number;
  literatureTimeoutMs: number;
  literatureMockResponsePath: string | null;
  reviewPanel: ReviewerPanel;
  reviewStage: ReviewStage;
  reviewerBudget: ReviewerBudget;
  controllerBudget: ReviewerBudget;
  requireControllerModel: boolean;
  controller: ControllerModelConfig;
}

export interface ControllerStudyInputs {
  question: string;
  dataPath: string | null;
  datasetDir: string | null;
  runDir: string;
  method: StatsMethod | null;
  outcome: string | null;
  exposure: string | null;
  group: string | null;
  outcomeThreshold: number | null;
  exposureThreshold: number | null;
  time: string | null;
  start: string | null;
  stop: string | null;
  event: string | null;
  id: string | null;
  strata: string | null;
  cluster: string | null;
  period: string | null;
  post: string | null;
  runningVariable: string | null;
  cutoff: number | null;
  instrument: string | null;
  alphaPenalty: number | null;
  l1Ratio: number | null;
  weight: string | null;
  offset: string | null;
  variables: string[];
  covariates: string[];
  exactCovariates: string[];
  surveyDesign: boolean;
  allowSurveyApproximation: boolean;
  python: string | null;
}

export interface ControllerArtifact {
  kind: string;
  path: string;
  stage: ControllerStage;
  sha256: string | null;
  requiredForPromotion: boolean;
}

export interface ControllerGate {
  stage: ControllerStage;
  status: "pass" | "warning" | "block";
  label: string;
  reasons: string[];
  evidenceRefs: string[];
  nextStage: ControllerStage;
}

export interface ControllerDecision {
  id: string;
  stage: ControllerStage;
  source: "deterministic" | "model" | "model_fallback";
  action: ControllerActionType;
  rationale: string;
  confidence: number;
  expectedArtifacts: string[];
  riskFlags: string[];
  modelRawPath: string | null;
  inputPatch: ControllerInputPatch | null;
  patchValidation: {
    status: "not_requested" | "valid" | "invalid";
    reasons: string[];
  };
  toolRequests: ControllerToolRequest[];
  toolValidation: {
    status: "not_requested" | "valid" | "invalid";
    reasons: string[];
  };
}

export interface ControllerExecutedAction {
  decisionId: string;
  action: ControllerActionType;
  status: "succeeded" | "failed" | "skipped";
  startedAtIso: string;
  finishedAtIso: string;
  commandSummary: string;
  outputSummary: string;
  artifacts: ControllerArtifact[];
  error: string | null;
  nextStage: ControllerStage;
}

export interface ControllerActionContractCheck {
  schemaVersion: 1;
  generatedAtIso: string;
  runId: string;
  stage: ControllerStage;
  action: ControllerActionType;
  actionStatus: ControllerExecutedAction["status"];
  status: "pass" | "warning" | "fail";
  expectedArtifacts: string[];
  observedArtifacts: Array<{
    kind: string;
    path: string;
    sha256: string | null;
    requiredForPromotion: boolean;
    source: "state" | "action" | "expected-path";
  }>;
  missingExpectedArtifacts: string[];
  missingRequiredHashes: string[];
  reasons: string[];
  outPath: string;
  reportPath: string;
}

export interface ControllerActionReadiness {
  schemaVersion: 1;
  generatedAtIso: string;
  readinessId: string;
  runId: string;
  decisionId: string;
  stage: ControllerStage;
  action: ControllerActionType;
  gateStatus: ControllerGate["status"];
  status: "pass" | "warning" | "fail";
  checks: Array<{
    id: string;
    status: "pass" | "warning" | "fail";
    message: string;
    issueCodes?: string[];
    evidenceRefs: string[];
  }>;
  outPath: string;
  reportPath: string;
}

export interface ControllerModelPreflight {
  schemaVersion: 1;
  generatedAtIso: string;
  preflightId: string;
  status: "pass" | "fail";
  provider: ControllerModelConfig["provider"];
  model: string;
  enabled: boolean;
  required: boolean;
  envVar: string | null;
  envAvailable: boolean;
  estimatedCostUsd: number;
  maxPerCallUsd: number;
  projectedStudyLoopCostUsd: number;
  maxStudyLoopUsd: number;
  fallbackAllowed: boolean;
  checks: Array<{
    id: string;
    status: "pass" | "fail";
    message: string;
  }>;
  outPath: string;
  reportPath: string;
}

export interface ControllerDecisionQuality {
  schemaVersion: 1;
  generatedAtIso: string;
  qualityId: string;
  status: "pass" | "fail";
  stage: ControllerStage;
  action: ControllerActionType;
  confidence: number;
  minimumConfidence: number;
  riskFlags: string[];
  rawModelPath: string;
  fallbackAllowed: boolean;
  checks: Array<{
    id: string;
    status: "pass" | "fail";
    message: string;
    issueCodes?: string[];
  }>;
  outPath: string;
  reportPath: string;
}

export interface ControllerDecisionContextBundle {
  schemaVersion: 1;
  generatedAtIso: string;
  bundleId: string;
  runId: string;
  statePath: string;
  stage: ControllerStage;
  status: ControllerRunStatus;
  question: string;
  inputs: Pick<ControllerStudyInputs, "dataPath" | "datasetDir" | "runDir" | "method" | "outcome" | "exposure" | "group" | "outcomeThreshold" | "exposureThreshold" | "time" | "start" | "stop" | "event" | "id" | "strata" | "cluster" | "period" | "post" | "runningVariable" | "cutoff" | "instrument" | "alphaPenalty" | "l1Ratio" | "weight" | "offset" | "variables" | "covariates" | "exactCovariates" | "surveyDesign" | "allowSurveyApproximation">;
  policy: {
    autonomy: ReviewAutonomy;
    allowExecution: boolean;
    allowContext: boolean;
    allowLiterature: boolean;
    allowExternalReview: boolean;
    allowAutoRepair: boolean;
    requireControllerModel: boolean;
    controller: ControllerModelConfig;
    controllerBudget: ReviewerBudget;
    allowedToolIds: ControllerToolId[];
  };
  gate: ControllerGate;
  deterministicRecommendation: ControllerDecision;
  issueLedger: {
    present: boolean;
    ledgerId: string | null;
    status: ControllerIssueLedger["status"] | null;
    topIssues: Array<Pick<ControllerIssue, "id" | "issueCode" | "severity" | "category" | "message" | "suggestedAction" | "reentryStage" | "evidenceRefs">>;
    outPath: string | null;
  };
  workPlan: {
    present: boolean;
    planId: string | null;
    status: ControllerWorkPlan["status"] | null;
    currentStage: ControllerStage | null;
    pending: Array<{ stage: ControllerStage; action: ControllerActionType; requirement: string }>;
    blocked: Array<{ stage: ControllerStage; blocker: string | null; evidenceRefs: string[] }>;
    risks: string[];
    outPath: string | null;
  };
  feasibility: Awaited<ReturnType<typeof loadControllerFeasibilitySummary>>;
  datasetSemanticAudit: Awaited<ReturnType<typeof loadControllerDatasetSemanticAuditSummary>>;
  latestStageReview: {
    present: boolean;
    reviewId: string | null;
    status: ControllerStageReview["status"] | null;
    reviewedStage: ControllerStage | null;
    currentStage: ControllerStage | null;
    findings: Array<Pick<ControllerStageReviewFinding, "severity" | "category" | "message" | "issueCodes" | "repairAction" | "reentryStage" | "evidenceRefs">>;
    recommendedCommand: string | null;
    outPath: string | null;
  };
  executionAgenda: {
    present: boolean;
    agendaId: string | null;
    status: ControllerExecutionAgenda["status"] | null;
    primaryCommand: string | null;
    activeIssueCodes: string[];
    activeBlockerIssueCodes: string[];
    items: Array<Pick<ControllerExecutionAgendaItem, "priority" | "status" | "kind" | "command" | "reason" | "issueCodes" | "safety" | "source">>;
    outPath: string | null;
  };
  recentActions: ControllerExecutedAction[];
  recentToolResults: Awaited<ReturnType<typeof recentControllerToolResultSummaries>>;
  recentArtifacts: ControllerArtifact[];
  missingRequiredArtifacts: ControllerArtifact[];
  allowedActions: ControllerActionType[];
  allowedInputPatchFields: string[];
  instructions: string[];
  outPath: string;
  reportPath: string;
}

export interface ControllerWorkPlanItem {
  stage: ControllerStage;
  action: ControllerActionType;
  status: "pending" | "in_progress" | "completed" | "skipped" | "blocked" | "not_applicable";
  requirement: string;
  evidenceRefs: string[];
  blocker: string | null;
  lastUpdatedIso: string;
}

export interface ControllerWorkPlan {
  schemaVersion: 1;
  generatedAtIso: string;
  planId: string;
  reason: string;
  runId: string;
  status: "active" | "blocked" | "complete" | "needs_human_review";
  currentStage: ControllerStage;
  nextRecommendedAction: string;
  assumptions: string[];
  risks: string[];
  items: ControllerWorkPlanItem[];
  outPath: string;
  reportPath: string;
}

export interface ControllerWorkPlanSummary {
  planId: string;
  reason: string;
  status: ControllerWorkPlan["status"];
  currentStage: ControllerStage;
  pendingCount: number;
  blockedCount: number;
  outPath: string;
  reportPath: string;
}

export interface ControllerStageReviewFinding {
  id: string;
  severity: "blocker" | "major" | "minor" | "info";
  category: ControllerIssue["category"];
  message: string;
  issueCodes?: string[];
  evidenceRefs: string[];
  repairAction: string;
  reentryStage: ControllerStage;
}

export interface ControllerStageReview {
  schemaVersion: 1;
  generatedAtIso: string;
  reviewId: string;
  reason: string;
  runId: string;
  reviewedStage: ControllerStage;
  currentStage: ControllerStage;
  controllerStatus: ControllerRunStatus;
  status: "pass" | "warning" | "block";
  lastGate: ControllerGate | null;
  lastDecision: ControllerDecision | null;
  lastAction: ControllerExecutedAction | null;
  findings: ControllerStageReviewFinding[];
  acceptedEvidenceRefs: string[];
  suggestedPatch: ControllerInputPatch | null;
  recommendedCommand: string;
  nextAction: string;
  outPath: string;
  reportPath: string;
}

export interface ControllerStageReviewSummary {
  reviewId: string;
  reason: string;
  status: ControllerStageReview["status"];
  reviewedStage: ControllerStage;
  currentStage: ControllerStage;
  findingCount: number;
  blockerCount: number;
  outPath: string;
  reportPath: string;
}

export interface ControllerExecutionAgendaItem {
  id: string;
  priority: number;
  status: "executable" | "blocked" | "advisory" | "complete";
  kind: "run" | "step" | "status" | "inspect" | "patch" | "resume" | "tool" | "qa" | "manifest" | "review" | "human_review" | "stop";
  command: string;
  reason: string;
  issueCodes?: string[];
  evidenceRefs: string[];
  source: "issue_ledger" | "stage_review" | "work_plan" | "next_action" | "run_inspection" | "state" | "reentry";
  safety: "safe" | "requires_review" | "blocked";
}

export interface ControllerExecutionAgenda {
  schemaVersion: 1;
  generatedAtIso: string;
  agendaId: string;
  reason: string;
  runId: string;
  status: "ready" | "blocked" | "needs_human_review" | "complete";
  currentStage: ControllerStage;
  controllerStatus: ControllerRunStatus;
  primaryCommand: string;
  activeIssueIds: string[];
  activeIssueCodes: string[];
  activeBlockerIssueCodes: string[];
  sourceArtifacts: {
    issueLedger: string | null;
    stageReview: string | null;
    workPlan: string | null;
    nextAction: string | null;
    runInspection: string | null;
    reentryPlan: string | null;
  };
  items: ControllerExecutionAgendaItem[];
  outPath: string;
  reportPath: string;
}

export interface ControllerExecutionAgendaSummary {
  agendaId: string;
  reason: string;
  status: ControllerExecutionAgenda["status"];
  currentStage: ControllerStage;
  itemCount: number;
  primaryCommand: string;
  outPath: string;
  reportPath: string;
}

export interface ControllerBenchmarkResult {
  schemaVersion: 1;
  generatedAtIso: string;
  benchmarkId: string;
  runId: string;
  statePath: string;
  suiteDir: string;
  historyDir: string;
  suite: Pick<ContinuousBenchmarkSuiteResult, "caseCount" | "passCount" | "warningCount" | "failCount" | "meanScore" | "regressions" | "nextAction" | "outPath" | "reportPath">;
  trend: Pick<ContinuousBenchmarkTrendResult, "runCount" | "latestScore" | "previousScore" | "delta" | "trend" | "regressions" | "nextAction" | "outPath" | "reportPath">;
  capabilityStatus: "covered" | "warning" | "missing";
  attachedArtifacts: Array<Pick<ControllerArtifact, "kind" | "path" | "sha256">>;
  nextAction: string;
  outPath: string;
  reportPath: string;
}

export interface ControllerFollowAgendaResult {
  schemaVersion: 1;
  generatedAtIso: string;
  runId: string;
  statePath: string;
  agenda: ControllerExecutionAgenda;
  selectedItem: ControllerExecutionAgendaItem | null;
  executed: boolean;
  refused: boolean;
  reason: string;
  state: ControllerState;
  runResult: ControllerRunResult | null;
  outPath: string;
  reportPath: string;
}

export interface ControllerFollowLoopIteration {
  iteration: number;
  beforeStage: ControllerStage;
  beforeStatus: ControllerRunStatus;
  agendaId: string;
  selectedItemId: string | null;
  selectedKind: ControllerExecutionAgendaItem["kind"] | null;
  selectedIssueCodes: string[];
  selectedEvidenceRefs: string[];
  executed: boolean;
  refused: boolean;
  reason: string;
  afterStage: ControllerStage;
  afterStatus: ControllerRunStatus;
  followRecordPath: string;
  followReportPath: string;
}

export interface ControllerFollowLoopResult {
  schemaVersion: 1;
  generatedAtIso: string;
  loopId: string;
  runId: string;
  statePath: string;
  maxIterations: number;
  maxStepsPerRun: number;
  terminal: boolean;
  stoppedReason: string;
  iterations: ControllerFollowLoopIteration[];
  state: ControllerState;
  outPath: string;
  reportPath: string;
}

export interface ControllerSupervisorRound {
  round: number;
  beforeStage: ControllerStage;
  beforeStatus: ControllerRunStatus;
  runnerPacketPath: string;
  runnerPacketReportPath: string;
  runnerPacketStatus: ControllerModelRunnerPacket["status"];
  runnerPacketFeasibilityReadiness: string | null;
  runnerPacketFeasibilityVerdict: string | null;
  runnerPacketFeasibilityPath: string | null;
  recommendedCommand: string;
  safeAgendaPrimary: boolean;
  followLoopPath: string | null;
  followLoopReportPath: string | null;
  followLoopIterations: number;
  followLoopIssueCodes: string[];
  auditPath: string | null;
  auditReportPath: string | null;
  auditReadiness: ControllerOperatorAudit["readiness"] | null;
  afterStage: ControllerStage;
  afterStatus: ControllerRunStatus;
  stopped: boolean;
  reason: string;
}

export interface ControllerSupervisorResult {
  schemaVersion: 1;
  generatedAtIso: string;
  supervisorId: string;
  runId: string;
  statePath: string;
  maxRounds: number;
  maxIterationsPerRound: number;
  maxStepsPerRun: number;
  terminal: boolean;
  stoppedReason: string;
  rounds: ControllerSupervisorRound[];
  state: ControllerState;
  outPath: string;
  reportPath: string;
}

export interface ControllerOperatorAuditCheck {
  id: string;
  status: "pass" | "warning" | "fail";
  category: "state" | "autonomy" | "data" | "methods" | "artifacts" | "tools" | "review" | "cost";
  message: string;
  issueCodes?: string[];
  evidenceRefs: string[];
}

export interface ControllerOperatorAuditReadinessBlocker {
  id: string;
  severity: "blocker" | "warning";
  category: ControllerOperatorAuditCheck["category"];
  issueCodes: string[];
  message: string;
  evidenceRefs: string[];
}

export interface ControllerOperatorAudit {
  schemaVersion: 1;
  generatedAtIso: string;
  auditId: string;
  runId: string;
  statePath: string;
  status: "pass" | "warning" | "fail";
  readiness: "ready_to_follow" | "ready_for_review" | "blocked" | "complete";
  currentStage: ControllerStage;
  controllerStatus: ControllerRunStatus;
  defaultControllerModel: string;
  modelControllerEnabled: boolean;
  strictModelController: boolean;
  checks: ControllerOperatorAuditCheck[];
  readinessBlockers: ControllerOperatorAuditReadinessBlocker[];
  capabilityCoverage: ControllerSelfEvaluation["capabilityCoverage"];
  environment: ControllerEnvironmentPreflight;
  inspection: ControllerInternalInspection;
  recovery: ControllerRecoveryInspection;
  feasibility: Awaited<ReturnType<typeof loadControllerFeasibilitySummary>>;
  datasetSemanticAudit: Awaited<ReturnType<typeof loadControllerDatasetSemanticAuditSummary>>;
  latestAgenda: ControllerExecutionAgenda | null;
  latestIssueLedger: ControllerIssueLedger | null;
  latestStageReview: ControllerStageReview | null;
  nextCommand: string;
  outPath: string;
  reportPath: string;
}

export interface ControllerEnvironmentPreflightCheck {
  id: string;
  status: "pass" | "warning" | "fail";
  category: "repo" | "runtime" | "cli" | "git" | "policy";
  message: string;
  evidenceRefs: string[];
}

export interface ControllerEnvironmentPreflight {
  schemaVersion: 1;
  generatedAtIso: string;
  preflightId: string;
  runId: string;
  statePath: string;
  status: "pass" | "warning" | "fail";
  readiness: "ready" | "degraded" | "blocked";
  repoRoot: string;
  nodeVersion: string | null;
  npmVersion: string | null;
  packageScripts: {
    build: boolean;
    test: boolean;
  };
  cliDist: {
    path: string;
    present: boolean;
    executable: boolean;
    distMtimeIso: string | null;
    latestSourceMtimeIso: string | null;
    stale: boolean | null;
  };
  git: {
    available: boolean;
    dirty: boolean;
    statusPreview: string;
  };
  policy: {
    allowToolActions: boolean;
    allowedToolIds: ControllerToolId[];
    maxToolActions: number;
    toolTimeoutMs: number;
  };
  checks: ControllerEnvironmentPreflightCheck[];
  nextAction: string;
  outPath: string;
  reportPath: string;
}

export interface ControllerCapabilityManifestEntry {
  id: string;
  status: "available" | "covered" | "missing" | "not_applicable";
  description: string;
  commands: string[];
  artifactKinds: string[];
  evidenceRefs: string[];
  testRefs: string[];
  failureMode: string;
}

export interface ControllerCapabilityManifest {
  schemaVersion: 1;
  generatedAtIso: string;
  manifestId: string;
  runId: string;
  statePath: string;
  defaultControllerModel: string;
  controllerCommands: string[];
  entries: ControllerCapabilityManifestEntry[];
  summary: {
    covered: number;
    missing: number;
    available: number;
    notApplicable: number;
  };
  outPath: string;
  reportPath: string;
}

export interface ControllerGoalAuditRequirement {
  id: string;
  category: "autonomy" | "model" | "research" | "qa" | "implementation" | "safety" | "documentation" | "testing";
  requirement: string;
  evidenceStandard: string;
  status: "proved" | "partial" | "missing" | "not_applicable";
  issueCodes?: string[];
  evidenceRefs: string[];
  gaps: string[];
  nextAction: string;
}

export interface ControllerGoalAudit {
  schemaVersion: 1;
  generatedAtIso: string;
  auditId: string;
  runId: string;
  statePath: string;
  objective: string;
  status: "pass" | "warning" | "fail";
  readiness: "goal_complete" | "in_progress" | "blocked";
  score: number;
  requirements: ControllerGoalAuditRequirement[];
  missingRequirementIds: string[];
  partialRequirementIds: string[];
  blockingRequirementIds: string[];
  operatorAuditPath: string;
  capabilityManifestPath: string;
  nextCommand: string;
  outPath: string;
  reportPath: string;
}

export interface ControllerSelfTestScenario {
  id: string;
  label: string;
  status: "pass" | "warning" | "fail";
  statePath: string | null;
  finalStage: ControllerStage | null;
  finalStatus: ControllerRunStatus | null;
  evidenceRefs: string[];
  checks: Array<{
    id: string;
    status: "pass" | "warning" | "fail";
    message: string;
    evidenceRefs: string[];
  }>;
}

export interface ControllerSelfTestRequirement {
  id: string;
  category: "autonomy" | "model" | "research" | "qa" | "implementation" | "safety" | "documentation" | "testing";
  requirement: string;
  status: "pass" | "warning" | "fail";
  evidenceRefs: string[];
  gaps: string[];
}

export interface ControllerSelfTestResult {
  schemaVersion: 1;
  generatedAtIso: string;
  selfTestId: string;
  status: "pass" | "warning" | "fail";
  readiness: "ready" | "degraded" | "blocked";
  outDir: string;
  objective: string;
  scenarios: ControllerSelfTestScenario[];
  requirements: ControllerSelfTestRequirement[];
  checks: Array<{
    id: string;
    status: "pass" | "warning" | "fail";
    message: string;
    evidenceRefs: string[];
  }>;
  nextAction: string;
  outPath: string;
  reportPath: string;
}

export interface ControllerIssue {
  id: string;
  issueCode?: string;
  severity: "blocker" | "major" | "minor" | "info";
  category: "context" | "data" | "methods" | "execution" | "review" | "artifact" | "policy" | "cost" | "state" | "unknown";
  status: "active" | "resolved" | "accepted";
  source: string;
  stage: ControllerStage;
  message: string;
  evidenceRefs: string[];
  suggestedAction: string;
  reentryStage: ControllerStage;
}

export interface ControllerIssueLedger {
  schemaVersion: 1;
  generatedAtIso: string;
  ledgerId: string;
  reason: string;
  runId: string;
  status: "clear" | "warnings" | "blocked";
  currentStage: ControllerStage;
  controllerStatus: ControllerRunStatus;
  counts: {
    blockers: number;
    major: number;
    minor: number;
    info: number;
  };
  issues: ControllerIssue[];
  topIssue: ControllerIssue | null;
  nextRecommendedAction: string;
  outPath: string;
  reportPath: string;
}

export interface ControllerIssueLedgerSummary {
  ledgerId: string;
  reason: string;
  status: ControllerIssueLedger["status"];
  currentStage: ControllerStage;
  issueCount: number;
  blockerCount: number;
  topIssues?: Array<Pick<ControllerIssue, "id" | "issueCode" | "severity" | "category" | "message" | "suggestedAction" | "reentryStage" | "evidenceRefs">>;
  outPath: string;
  reportPath: string;
}

export interface ControllerState {
  schemaVersion: 1;
  runId: string;
  createdAtIso: string;
  updatedAtIso: string;
  rootDir: string;
  statePath: string;
  status: ControllerRunStatus;
  currentStage: ControllerStage;
  inputs: ControllerStudyInputs;
  policy: ControllerPolicy;
  completedStages: ControllerStage[];
  gates: ControllerGate[];
  decisions: ControllerDecision[];
  actions: ControllerExecutedAction[];
  artifacts: ControllerArtifact[];
  repairs: ControllerRepairExecution[];
  patches: ControllerPatchRecord[];
  policyUpdates: ControllerPolicyUpdate[];
  toolActions: ControllerToolExecution[];
  selfEvaluations: ControllerSelfEvaluation[];
  workPlans: ControllerWorkPlanSummary[];
  issueLedgers: ControllerIssueLedgerSummary[];
  stageReviews: ControllerStageReviewSummary[];
  agendas: ControllerExecutionAgendaSummary[];
  costEstimateUsd: number;
  stopReason: string | null;
  nextRecommendedAction: string;
}

export interface ControllerRunResult {
  schemaVersion: 1;
  generatedAtIso: string;
  state: ControllerState;
  stepCount: number;
  terminal: boolean;
}

export interface ControllerRunInvocation {
  schemaVersion: 1;
  generatedAtIso: string;
  invocationId: string;
  startedAtIso: string;
  finishedAtIso: string;
  runId: string;
  statePath: string;
  maxSteps: number;
  stepCount: number;
  terminal: boolean;
  before: {
    stage: ControllerStage;
    status: ControllerRunStatus;
    actions: number;
    decisions: number;
    gates: number;
    tools: number;
    patches: number;
    policyUpdates: number;
    artifacts: number;
    costEstimateUsd: number;
  };
  after: {
    stage: ControllerStage;
    status: ControllerRunStatus;
    actions: number;
    decisions: number;
    gates: number;
    tools: number;
    patches: number;
    policyUpdates: number;
    artifacts: number;
    costEstimateUsd: number;
  };
  actionDelta: Array<{
    decisionId: string;
    action: ControllerActionType;
    status: ControllerExecutedAction["status"];
    nextStage: ControllerStage;
  }>;
  policyUpdateDelta: string[];
  artifactDelta: number;
  costDeltaUsd: number;
  stopReason: string | null;
  nextRecommendedAction: string;
  outPath: string;
  reportPath: string;
}

export interface ControllerStateSnapshot {
  schemaVersion: 1;
  generatedAtIso: string;
  snapshotId: string;
  reason: string;
  runId: string;
  statePath: string;
  stage: ControllerStage;
  status: ControllerRunStatus;
  counts: {
    actions: number;
    decisions: number;
    gates: number;
    tools: number;
    patches: number;
    policyUpdates: number;
    artifacts: number;
    repairs: number;
    selfEvaluations: number;
  };
  stateHash: string;
  outPath: string;
  reportPath: string;
  controllerState: ControllerState;
}

export interface ControllerRecoveryInspection {
  schemaVersion: 1;
  generatedAtIso: string;
  status: "resume_safe" | "use_reentry_plan" | "possible_interruption" | "blocked" | "complete";
  stateStatus: ControllerRunStatus;
  currentStage: ControllerStage;
  lastCheckpoint: {
    path: string;
    checkpointId: string;
    reason: string;
    beforeStage: ControllerStage;
    afterStage: ControllerStage;
    afterStatus: ControllerRunStatus;
  } | null;
  lastInvocation: {
    path: string;
    invocationId: string;
    stepCount: number;
    terminal: boolean;
    beforeStage: ControllerStage;
    afterStage: ControllerStage;
    afterStatus: ControllerRunStatus;
  } | null;
  lastSnapshot: {
    path: string;
    snapshotId: string;
    reason: string;
    stage: ControllerStage;
    status: ControllerRunStatus;
    stateHash: string;
  } | null;
  unledgeredActionCount: number;
  evidenceRefs: string[];
  recommendedCommand: string;
  reason: string;
  outPath: string;
  reportPath: string;
}

export interface ControllerStepCheckpoint {
  schemaVersion: 1;
  generatedAtIso: string;
  runId: string;
  checkpointId: string;
  reason: string;
  before: {
    stage: ControllerStage;
    status: ControllerRunStatus;
    actions: number;
    decisions: number;
    gates: number;
    tools: number;
    patches: number;
    artifacts: number;
    costEstimateUsd: number;
  };
  after: {
    stage: ControllerStage;
    status: ControllerRunStatus;
    actions: number;
    decisions: number;
    gates: number;
    tools: number;
    patches: number;
    artifacts: number;
    costEstimateUsd: number;
  };
  lastGate: ControllerGate | null;
  lastDecision: ControllerDecision | null;
  lastAction: ControllerExecutedAction | null;
  lastToolAction: ControllerToolExecution | null;
  artifactDelta: number;
  costDeltaUsd: number;
  stopReason: string | null;
  nextRecommendedAction: string;
  statePath: string;
  outPath: string;
}

export interface ControllerResumeResult {
  schemaVersion: 1;
  generatedAtIso: string;
  state: ControllerState;
  reentryPlan: ControllerReentryPlan | null;
  resumed: boolean;
  reason: string;
  resumeRecordPath: string;
}

interface ControllerModelPayload {
  action: ControllerActionType;
  rationale: string;
  confidence: number;
  riskFlags?: string[];
  inputPatch?: ControllerInputPatch | null;
  toolRequests?: ControllerToolRequest[];
}

export interface ControllerInitOptions {
  question: string;
  outDir: string;
  dataPath?: string;
  datasetDir?: string;
  runDir?: string;
  method?: StatsMethod;
  outcome?: string;
  exposure?: string;
  group?: string;
  outcomeThreshold?: number;
  exposureThreshold?: number;
  time?: string;
  start?: string;
  stop?: string;
  event?: string;
  id?: string;
  strata?: string;
  cluster?: string;
  period?: string;
  post?: string;
  runningVariable?: string;
  cutoff?: number;
  instrument?: string;
  alphaPenalty?: number;
  l1Ratio?: number;
  weight?: string;
  offset?: string;
  variables?: string[];
  covariates?: string[];
  exactCovariates?: string[];
  surveyDesign?: boolean;
  allowSurveyApproximation?: boolean;
  python?: string;
  autonomy?: ReviewAutonomy;
  maxSteps?: number;
  minRows?: number;
  maxRequiredVariableMissingness?: number;
  allowExecution?: boolean;
  allowExternalReview?: boolean;
  requireExternalReviewForPromotion?: boolean;
  mockExternalReview?: boolean;
  reviewPanel?: ReviewerPanel;
  reviewStage?: ReviewStage;
  reviewerBudget?: Partial<ReviewerBudget>;
  controller?: Partial<ControllerModelConfig>;
  controllerBudget?: Partial<ReviewerBudget>;
  requireControllerModel?: boolean;
  allowAutoRepair?: boolean;
  maxAutoRepairs?: number;
  allowInputPatches?: boolean;
  maxInputPatches?: number;
  allowToolActions?: boolean;
  maxToolActions?: number;
  allowedToolIds?: ControllerToolId[];
  toolTimeoutMs?: number;
  allowContext?: boolean;
  requireContext?: boolean;
  contextRepo?: string;
  contextTarget?: string;
  contextBin?: string;
  autocontextRoot?: string;
  contextBudgetTokens?: number;
  allowLiterature?: boolean;
  literatureBaseUrl?: string;
  literatureEndpoint?: string;
  literatureDepth?: "quick" | "standard" | "long";
  literatureTopK?: number;
  literatureTimeoutMs?: number;
  literatureMockResponsePath?: string;
}

export interface ControllerPatchRecord {
  schemaVersion: 1;
  generatedAtIso: string;
  patchId: string;
  source: "model_decision" | "manual" | "repair_plugin";
  reason: string;
  status: "applied" | "rejected";
  patch: ControllerInputPatch;
  changedFields: string[];
  invalidatedStages: ControllerStage[];
  validationReasons: string[];
  beforeHash: string;
  afterHash: string;
  outPath: string;
}

export interface ControllerPolicyUpdate {
  schemaVersion: 1;
  generatedAtIso: string;
  updateId: string;
  reason: string;
  changedFields: Array<{
    field: string;
    before: unknown;
    after: unknown;
  }>;
  invalidatedStages: ControllerStage[];
  beforeHash: string;
  afterHash: string;
  outPath: string;
}

export interface ControllerToolExecution {
  schemaVersion: 1;
  generatedAtIso: string;
  toolRunId: string;
  request: ControllerToolRequest;
  status: "succeeded" | "failed" | "rejected";
  command: {
    executable: string;
    args: string[];
    cwd: string;
    timeoutMs: number;
  } | null;
  exitCode: number | null;
  stdoutPath: string | null;
  stderrPath: string | null;
  stdoutPreview: string;
  stderrPreview: string;
  validationReasons: string[];
  inspection: ControllerInternalInspection | null;
  outPath: string;
}

export interface ControllerGitDiffSnapshot {
  schemaVersion: 1;
  generatedAtIso: string;
  repoRoot: string;
  statusPreview: string;
  diffStatPreview: string;
  diffPreview: string;
  truncated: boolean;
  changedFiles: string[];
}

export interface ControllerRepoFileRead {
  schemaVersion: 1;
  generatedAtIso: string;
  repoRoot: string;
  relativePath: string;
  absolutePath: string | null;
  status: "found" | "missing" | "blocked" | "too_large";
  bytes: number;
  sha256: string | null;
  truncated: boolean;
  maxChars: number;
  contentPreview: string;
  reason: string;
}

export interface ControllerRepoSearchResult {
  schemaVersion: 1;
  generatedAtIso: string;
  repoRoot: string;
  query: string;
  scope: string;
  status: "found" | "no_matches" | "blocked";
  searchedFiles: number;
  skippedFiles: number;
  truncated: boolean;
  matches: Array<{
    path: string;
    lineNumber: number;
    linePreview: string;
  }>;
  reason: string;
}

export interface ControllerAgenteerCommandResult {
  schemaVersion: 1;
  generatedAtIso: string;
  repoRoot: string;
  command: {
    executable: string;
    args: string[];
    cwd: string;
    timeoutMs: number;
  };
  status: "passed" | "failed" | "blocked";
  exitCode: number | null;
  stdoutPath: string | null;
  stderrPath: string | null;
  stdoutPreview: string;
  stderrPreview: string;
  validationReasons: string[];
  nextAction: string;
}

export interface ControllerSourcePatchProposal {
  schemaVersion: 1;
  generatedAtIso: string;
  proposalId: string;
  runId: string;
  repoRoot: string;
  summary: string;
  risk: "low" | "medium" | "high";
  status: "valid" | "invalid";
  validationReasons: string[];
  changes: Array<{
    path: string;
    absolutePath: string;
    rationale: string;
    beforeHash: string | null;
    afterHash: string | null;
    afterPath: string | null;
    diffHash: string | null;
    mode: "replace-file" | "unified-diff";
    preview: string;
  }>;
  tests: string[];
  nextAction: string;
  outPath: string;
  reportPath: string;
}

export interface ControllerSourcePatchApplyResult {
  schemaVersion: 1;
  generatedAtIso: string;
  applyId: string;
  runId: string;
  proposalId: string | null;
  status: "applied" | "rejected" | "failed";
  repoRoot: string;
  validationReasons: string[];
  proposalTests: string[];
  appliedChanges: Array<{
    path: string;
    absolutePath: string;
    backupPath: string | null;
    beforeHash: string | null;
    expectedBeforeHash: string | null;
    afterHash: string | null;
    expectedAfterHash: string | null;
    status: "applied" | "skipped" | "failed";
    reason: string;
  }>;
  diffSnapshotPath: string | null;
  nextAction: string;
  outPath: string;
  reportPath: string;
}

export interface ControllerSourcePatchVerification {
  schemaVersion: 1;
  generatedAtIso: string;
  verificationId: string;
  runId: string;
  applyId: string | null;
  proposalId: string | null;
  status: "passed" | "failed" | "rejected";
  validationReasons: string[];
  commands: Array<{
    command: string;
    status: "passed" | "failed" | "skipped";
    exitCode: number | null;
    stdoutPath: string | null;
    stderrPath: string | null;
    stdoutPreview: string;
    stderrPreview: string;
  }>;
  diffSnapshotPath: string | null;
  nextAction: string;
  outPath: string;
  reportPath: string;
}

export interface ControllerSourcePatchRollback {
  schemaVersion: 1;
  generatedAtIso: string;
  rollbackId: string;
  runId: string;
  applyId: string | null;
  status: "rolled_back" | "failed" | "rejected";
  validationReasons: string[];
  restoredChanges: Array<{
    path: string;
    absolutePath: string;
    backupPath: string | null;
    status: "restored" | "removed" | "failed" | "skipped";
    beforeHash: string | null;
    restoredHash: string | null;
    reason: string;
  }>;
  diffSnapshotPath: string | null;
  nextAction: string;
  outPath: string;
  reportPath: string;
}

export interface ControllerFeasibilityVerdict {
  schemaVersion: 1;
  generatedAtIso: string;
  verdict: FeasibilityVerdict;
  status: "pass" | "warning" | "block";
  score: number;
  confidence: number;
  readinessLabel: string;
  primaryAction: FeasibilityGateResult["primaryAction"];
  summaryPath: string;
  reportPath: string;
  rowCount: number;
  columnCount: number;
  method: StatsMethod | null;
  requiredVariables: string[];
  variableChecks: Array<{
    role: string;
    name: string;
    present: boolean;
    inferredType: ResearchTableSummary["columns"][number]["inferredType"] | "missing";
    nonMissingRows: number;
    missingFraction: number;
    min: number | null;
    max: number | null;
    mean: number | null;
    sampleValues: string[];
    issues: Array<{ severity: "blocker" | "warning" | "note"; code: string; message: string }>;
  }>;
  completeCase: {
    scanned: boolean;
    scannedRows: number;
    completeRows: number | null;
    completeFraction: number | null;
    scanReason: string;
  };
  outcomeDiagnostics: {
    outcome: string | null;
    observedLevels: Array<{ value: string; count: number }>;
    eventCount: number | null;
    nonEventCount: number | null;
    eventRate: number | null;
    usable: boolean | null;
  };
  domains: FeasibilityGateResult["domains"];
  internalReviews: FeasibilityGateResult["internalReviews"];
  issues: FeasibilityGateResult["issues"];
  methodChecks: Array<{ id: string; status: "pass" | "warning" | "block"; message: string; evidenceRefs: string[] }>;
  blockers: string[];
  warnings: string[];
  notes: string[];
  clarifyingQuestions: string[];
  requiredModifications: string[];
  optionalModifications: string[];
  alternativeStudyIdeas: FeasibilityGateResult["alternativeStudyIdeas"];
  studyDesignAdvice: FeasibilityGateResult["studyDesignAdvice"];
  evidenceRefs: string[];
  nextAction: string;
}

export interface ControllerDatasetSemanticAudit {
  schemaVersion: 1;
  generatedAtIso: string;
  runId: string;
  statePath: string;
  summaryPath: string;
  rowCount: number;
  columnCount: number;
  status: "pass" | "warning" | "block";
  selectedRoleStatus: "pass" | "warning" | "block";
  issueCount: number;
  blockerCount: number;
  warningCount: number;
  selectedRoleIssueCount: number;
  issueCodeSummary: Array<{
    code: string;
    severity: "blocker" | "warning" | "note";
    totalIssueCount: number;
    selectedIssueCount: number;
    columns: string[];
  }>;
  selectedRoleSummary: Array<{
    column: string;
    role: string;
    issueCount: number;
    blockerCount: number;
    warningCount: number;
    codes: string[];
  }>;
  issues: Array<{
    column: string;
    role: string | null;
    selected: boolean;
    inferredType: ResearchTableSummary["columns"][number]["inferredType"];
    nonMissingRows: number;
    min: number | null;
    max: number | null;
    mean: number | null;
    severity: "blocker" | "warning" | "note";
    code: string;
    message: string;
  }>;
  nextAction: string;
  outPath: string;
  reportPath: string;
}

export interface ControllerSelfEvaluation {
  schemaVersion: 1;
  generatedAtIso: string;
  evaluationId: string;
  status: "pass" | "warning" | "fail";
  readiness: "promotable" | "needs_human_review" | "blocked";
  score: number;
  requiredStageCoverage: {
    required: ControllerStage[];
    completed: ControllerStage[];
    missing: ControllerStage[];
  };
  capabilityCoverage: Array<{
    capability: string;
    status: "covered" | "not_applicable" | "missing";
    evidenceRefs: string[];
  }>;
  checks: Array<{
    id: string;
    status: "pass" | "warning" | "fail";
    severity: "info" | "minor" | "major" | "blocker";
    message: string;
    issueCodes?: string[];
    evidenceRefs: string[];
  }>;
  nextAction: string;
  outPath: string;
  reportPath: string;
}

export interface ControllerCompletionAudit {
  schemaVersion: 1;
  generatedAtIso: string;
  runId: string;
  status: "pass" | "warning" | "fail";
  readiness: "complete" | "local_review_only" | "blocked";
  requirements: Array<{
    id: string;
    status: "proved" | "warning" | "failed" | "not_applicable";
    scope: "state_machine" | "data" | "methods" | "artifacts" | "review" | "cost" | "autonomy";
    requirement: string;
    evidenceRefs: string[];
    finding: string;
    issueCodes?: string[];
  }>;
  missingEvidence: string[];
  nextAction: string;
  outPath: string;
  reportPath: string;
}

export interface ControllerGoldenPacket {
  schemaVersion: 1;
  generatedAtIso: string;
  runId: string;
  status: ControllerRunStatus;
  stage: ControllerStage;
  question: string;
  method: StatsMethod | null;
  readiness: {
    runInspection: string | null;
    feasibilityReadiness: string | null;
    feasibilityVerdict: string | null;
    completionAudit: ControllerCompletionAudit["status"];
    selfEvaluation: ControllerSelfEvaluation["status"];
    promotionDecision: "complete" | "human_review";
    promotable: boolean;
  };
  counts: {
    actions: number;
    artifacts: number;
    blockers: number;
    warnings: number;
    requiredArtifactsMissingHash: number;
  };
  blockers: string[];
  warnings: string[];
  activeIssueCodes: string[];
  activeBlockerIssueCodes: string[];
  issueSummary: Array<{
    category: "completion_audit" | "self_evaluation" | "issue_ledger" | "stage_review" | "action_readiness" | "action_contract" | "dataset_semantic_audit" | "inspection" | "terminal_handoff" | "unknown";
    severity: "blocker" | "warning";
    issueCodes: string[];
    message: string;
    evidenceRefs: string[];
  }>;
  stageSummary: Array<{
    stage: ControllerStage;
    completed: boolean;
    latestAction: ControllerActionType | null;
    actionStatus: ControllerExecutedAction["status"] | null;
    evidenceRefs: string[];
  }>;
  keyArtifacts: Record<string, string | null>;
  keyArtifactReports: Record<string, string | null>;
  datasetSemanticAudit: Awaited<ReturnType<typeof loadControllerDatasetSemanticAuditSummary>>;
  nextAction: string;
  recommendedCommands: string[];
  outPath: string;
  reportPath: string;
}

export interface ControllerTerminalHandoff {
  schemaVersion: 1;
  generatedAtIso: string;
  runId: string;
  status: ControllerRunStatus;
  stage: ControllerStage;
  trigger: "blocked" | "human_review" | "complete";
  summary: string;
  failureAttribution: Array<{
    category: "context" | "data" | "methods" | "execution" | "review" | "artifact" | "policy" | "unknown";
    severity: "info" | "warning" | "blocker";
    message: string;
    evidenceRefs: string[];
  }>;
  lastGate: ControllerGate | null;
  lastDecision: ControllerDecision | null;
  lastAction: ControllerExecutedAction | null;
  lastToolAction: ControllerToolExecution | null;
  completedStages: ControllerStage[];
  missingStages: ControllerStage[];
  requiredArtifacts: ControllerArtifact[];
  missingRequiredArtifacts: ControllerArtifact[];
  reentryPlan: ControllerReentryPlan;
  suggestedCommands: string[];
  safePatchFields: string[];
  nextRecommendedAction: string;
  reportPath: string;
  jsonPath: string;
}

export interface ControllerNextActionPacket {
  schemaVersion: 1;
  generatedAtIso: string;
  runId: string;
  status: ControllerRunStatus;
  stage: ControllerStage;
  reason: string;
  recommendedCommand: string;
  alternativeCommands: string[];
  safeToAutoResume: boolean;
  reentryPlan: Pick<ControllerReentryPlan, "status" | "recommendedStage" | "confidence" | "reason" | "autoRepairEligible" | "repairPlugin" | "commands" | "safePatch">;
  issueLedger: {
    status: ControllerIssueLedger["status"] | null;
    path: string | null;
    reportPath: string | null;
    topIssues: Array<Pick<ControllerIssue, "id" | "issueCode" | "severity" | "category" | "message" | "suggestedAction" | "reentryStage" | "evidenceRefs">>;
  };
  mustReviewArtifacts: ControllerArtifact[];
  suggestedPatch: ControllerInputPatch | null;
  safePatchFields: string[];
  createdFromArtifacts: {
    terminalHandoff: string;
    terminalHandoffReport: string;
    reentryPlan: string;
    reentryPlanReport: string;
    issueLedger: string | null;
    issueLedgerReport: string | null;
    state: string;
  };
  outPath: string;
  reportPath: string;
}

export interface ControllerModelRunnerPacket {
  schemaVersion: 1;
  generatedAtIso: string;
  packetId: string;
  runId: string;
  statePath: string;
  status: "ready" | "review" | "blocked" | "complete";
  currentStage: ControllerStage;
  controllerStatus: ControllerRunStatus;
  defaultControllerModel: string;
  strictModelRecommended: boolean;
  recommendedCommand: string;
  safeToAutoExecute: boolean;
  maxRecommendedSteps: number;
  systemPrompt: string;
  userPrompt: string;
  operatingRules: string[];
  allowedCommands: string[];
  agendaCommands: string[];
  forbiddenActions: string[];
  activeIssueCodes: string[];
  activeBlockerIssueCodes: string[];
  handoffBlockers: Array<{
    category: "issue_ledger" | "next_action" | "dataset_semantic_audit" | "operator_audit" | "environment" | "unknown";
    severity: "blocker" | "warning";
    issueCodes: string[];
    message: string;
    evidenceRefs: string[];
  }>;
  evidenceRefs: string[];
  feasibilityReadiness: {
    present: boolean;
    status: string | null;
    verdict: string | null;
    path: string | null;
    blockers: string[];
    warnings: string[];
  };
  datasetSemanticAudit: Awaited<ReturnType<typeof loadControllerDatasetSemanticAuditSummary>>;
  agenda: Pick<ControllerExecutionAgenda, "agendaId" | "status" | "primaryCommand" | "activeIssueCodes" | "activeBlockerIssueCodes" | "sourceArtifacts"> & {
    path: string;
    reportPath: string;
    items: Array<Pick<ControllerExecutionAgendaItem, "id" | "kind" | "status" | "safety" | "source" | "command" | "reason" | "issueCodes">>;
  };
  audit: Pick<ControllerOperatorAudit, "status" | "readiness" | "nextCommand"> & {
    path: string;
    reportPath: string;
    failedChecks: string[];
    warningChecks: string[];
  };
  environment: Pick<ControllerEnvironmentPreflight, "status" | "readiness" | "repoRoot" | "nodeVersion" | "npmVersion" | "nextAction" | "outPath" | "reportPath">;
  capabilities: Pick<ControllerCapabilityManifest, "summary" | "defaultControllerModel"> & {
    path: string;
    reportPath: string;
    missing: string[];
    available: string[];
    covered: string[];
  };
  nextAction: ControllerNextActionPacket | null;
  outPath: string;
  reportPath: string;
}

export interface ControllerReentryPlan {
  schemaVersion: 1;
  generatedAtIso: string;
  runId: string;
  status: "resume" | "patch_then_resume" | "repair_then_resume" | "new_run_required" | "complete_no_reentry";
  recommendedStage: ControllerStage;
  confidence: number;
  reason: string;
  triggeringEvidence: string[];
  allowedActions: ControllerActionType[];
  safePatch: ControllerInputPatch | null;
  autoRepairEligible: boolean;
  repairPlugin: string | null;
  commands: string[];
  outPath: string;
  reportPath: string;
}

export interface ControllerInternalInspection {
  schemaVersion: 1;
  generatedAtIso: string;
  status: "pass" | "warning" | "fail";
  checks: Array<{
    id: string;
    status: "pass" | "warning" | "fail";
    message: string;
    evidenceRefs: string[];
  }>;
}

export interface ControllerRepairExecution {
  schemaVersion: 1;
  generatedAtIso: string;
  repairId: string;
  sourceReviewPath: string | null;
  status: "succeeded" | "partial" | "skipped" | "failed";
  stageBeforeRepair: ControllerStage;
  nextStage: ControllerStage;
  executedRepairs: Array<{
    findingId: string;
    pluginId: string;
    status: "succeeded" | "skipped" | "failed";
    reason: string;
    artifactRefs: string[];
  }>;
  skippedFindings: Array<{
    findingId: string;
    reason: string;
    reentryPoint: string;
  }>;
  outPath: string;
}

export interface ControllerRepairVerification {
  schemaVersion: 1;
  generatedAtIso: string;
  verificationId: string;
  repairId: string;
  repairExecutionPath: string;
  status: "pass" | "warning" | "fail";
  checks: Array<{
    id: string;
    status: "pass" | "warning" | "fail";
    message: string;
    evidenceRefs: string[];
  }>;
  acceptedFindings: number;
  verifiedFindings: number;
  skippedFindings: number;
  failedRepairs: number;
  missingArtifactRefs: number;
  freshExternalReviewRequired: boolean;
  nextAction: string;
  outPath: string;
  reportPath: string;
}

export interface ControllerRepairCycleResult {
  schemaVersion: 1;
  generatedAtIso: string;
  cycleId: string;
  runId: string;
  statePath: string;
  status: "repaired" | "blocked" | "skipped" | "complete";
  beforeStage: ControllerStage;
  beforeStatus: ControllerRunStatus;
  reentryPlanPath: string;
  reentryPlanReportPath: string;
  reentryStatus: ControllerReentryPlan["status"];
  autoRepairEligible: boolean;
  repairPlugin: string | null;
  runResultPath: string | null;
  runResultReportPath: string | null;
  completionAuditPath: string | null;
  completionAuditReportPath: string | null;
  afterStage: ControllerStage;
  afterStatus: ControllerRunStatus;
  reason: string;
  state: ControllerState;
  outPath: string;
  reportPath: string;
}

export interface ControllerDoctorResult {
  schemaVersion: 1;
  generatedAtIso: string;
  doctorId: string;
  runId: string;
  statePath: string;
  status: "ready_to_continue" | "needs_review" | "blocked" | "complete";
  currentStage: ControllerStage;
  controllerStatus: ControllerRunStatus;
  recommendedCommand: string;
  safeToAutoContinue: boolean;
  blockers: string[];
  warnings: string[];
  activeIssueCodes: string[];
  activeBlockerIssueCodes: string[];
  evidenceRefs: string[];
  summaries: {
    operatorAudit: {
      status: ControllerOperatorAudit["status"];
      readiness: ControllerOperatorAudit["readiness"];
      failedChecks: string[];
      warningChecks: string[];
      path: string;
      reportPath: string;
    };
    completionAudit: {
      status: ControllerCompletionAudit["status"];
      readiness: ControllerCompletionAudit["readiness"];
      failedRequirements: string[];
      warningRequirements: string[];
      failedRequirementDetails: Array<{ id: string; issueCodes: string[]; finding: string }>;
      warningRequirementDetails: Array<{ id: string; issueCodes: string[]; finding: string }>;
      missingEvidence: string[];
      path: string;
      reportPath: string;
    };
    runnerPacket: {
      status: ControllerModelRunnerPacket["status"];
      recommendedCommand: string;
      safeToAutoExecute: boolean;
      feasibilityReadiness: ControllerModelRunnerPacket["feasibilityReadiness"];
      datasetSemanticAudit: Awaited<ReturnType<typeof loadControllerDatasetSemanticAuditSummary>>;
      path: string;
      reportPath: string;
    };
    capabilities: {
      covered: number;
      missing: number;
      available: number;
      notApplicable: number;
      missingIds: string[];
      path: string;
      reportPath: string;
    };
    reentryPlan: {
      status: ControllerReentryPlan["status"];
      recommendedStage: ControllerStage;
      autoRepairEligible: boolean;
      repairPlugin: string | null;
      path: string;
      reportPath: string;
    };
    supervisor: {
      present: boolean;
      latestPath: string | null;
      latestReportPath: string | null;
    };
    repairCycle: {
      present: boolean;
      latestPath: string | null;
      latestReportPath: string | null;
    };
    artifacts: {
      total: number;
      requiredForPromotion: number;
      missingRequiredHashes: string[];
    };
    cost: {
      estimatedUsd: number;
      reviewerBudgetUsd: number;
      controllerBudgetUsd: number;
      withinBudget: boolean;
    };
  };
  state: ControllerState;
  outPath: string;
  reportPath: string;
}

export interface ControllerOperateCycle {
  cycle: number;
  beforeStage: ControllerStage;
  beforeStatus: ControllerRunStatus;
  doctorPath: string;
  doctorReportPath: string;
  doctorStatus: ControllerDoctorResult["status"];
  doctorFeasibilityReadiness: string | null;
  doctorFeasibilityVerdict: string | null;
  doctorFeasibilityPath: string | null;
  safeToAutoContinue: boolean;
  recommendedCommand: string;
  action: "supervise" | "repair_cycle" | "stop";
  actionPath: string | null;
  actionReportPath: string | null;
  actionStatus: string | null;
  afterStage: ControllerStage;
  afterStatus: ControllerRunStatus;
  reason: string;
  issueCodes: string[];
}

export interface ControllerOperateResult {
  schemaVersion: 1;
  generatedAtIso: string;
  operateId: string;
  runId: string;
  statePath: string;
  status: "complete" | "stopped" | "blocked" | "max_cycles";
  maxCycles: number;
  maxRounds: number;
  maxIterationsPerRound: number;
  maxStepsPerRun: number;
  cycles: ControllerOperateCycle[];
  finalDoctorPath: string | null;
  finalDoctorStatus: ControllerDoctorResult["status"] | null;
  stoppedReason: string;
  state: ControllerState;
  outPath: string;
  reportPath: string;
}

export interface ControllerStartResult {
  schemaVersion: 1;
  generatedAtIso: string;
  startId: string;
  runId: string;
  statePath: string;
  status: "initialized" | "ready" | "review" | "blocked" | "complete" | "operated" | "operate_failed";
  mode: "status_only" | "operate";
  question: string;
  state: ControllerState;
  statusSummary: Pick<ControllerUnifiedStatus, "status" | "controllerStatus" | "currentStage" | "safeToAutoContinue" | "readyToLaunch" | "promotable" | "activeIssueCodes" | "activeBlockerIssueCodes" | "blockers" | "warnings" | "recommendedCommand" | "launchCommand" | "inspectionCommand" | "nextAction"> & {
    feasibilityReadiness: string | null;
    feasibilityVerdict: string | null;
  };
  runbookSummary: Pick<ControllerLaunchRunbook, "status" | "readyToLaunch" | "firstReadCommand" | "launchCommand" | "readinessCommand" | "inspectionCommand" | "activeIssueCodes" | "activeBlockerIssueCodes" | "launchBlockers">;
  operateSummary: {
    requested: boolean;
    status: ControllerOperateResult["status"] | null;
    cycles: number;
    stoppedReason: string | null;
    outPath: string | null;
    reportPath: string | null;
  };
  artifactPaths: {
    state: string;
    status: string;
    statusReport: string;
    runbook: string;
    runbookReport: string;
    operate: string | null;
    operateReport: string | null;
  };
  evidenceRefs: string[];
  nextAction: string;
  outPath: string;
  reportPath: string;
}

export interface ControllerLaunchRunbook {
  schemaVersion: 1;
  generatedAtIso: string;
  runbookId: string;
  runId: string;
  statePath: string;
  status: "ready" | "review" | "blocked" | "complete";
  readyToLaunch: boolean;
  activeIssueCodes: string[];
  activeBlockerIssueCodes: string[];
  launchBlockers: Array<{
    category: "doctor" | "completion_audit" | "environment" | "runner_packet" | "cost" | "unknown";
    severity: "blocker" | "warning";
    issueCodes: string[];
    message: string;
    evidenceRefs: string[];
  }>;
  defaultControllerModel: string;
  strictModelRecommended: boolean;
  firstReadCommand: string;
  launchCommand: string;
  readinessCommand: string;
  inspectionCommand: string;
  recoveryCommands: string[];
  verificationCommands: string[];
  allowedCommands: string[];
  forbiddenActions: string[];
  stopCriteria: string[];
  safetyEnvelope: {
    autonomy: ControllerPolicy["autonomy"];
    maxControllerCostUsd: number;
    maxReviewerCostUsd: number;
    maxAutoRepairs: number;
    allowSourceEdits: boolean;
    allowExternalReview: boolean;
    allowLiteratureSearch: boolean;
    protectedPaths: string[];
  };
  environment: {
    repoRoot: string;
    readiness: ControllerEnvironmentPreflight["readiness"];
    status: ControllerEnvironmentPreflight["status"];
    nodeVersion: string | null;
    npmVersion: string | null;
    packageScripts: string[];
    requiredEnvVars: string[];
    optionalEnvWarnings: string[];
  };
  cost: ControllerDoctorResult["summaries"]["cost"];
  doctor: Pick<ControllerDoctorResult, "status" | "safeToAutoContinue" | "recommendedCommand" | "blockers" | "warnings" | "activeIssueCodes" | "activeBlockerIssueCodes" | "outPath" | "reportPath">;
  runnerPacket: {
    status: ControllerModelRunnerPacket["status"];
    recommendedCommand: string;
    safeToAutoExecute: boolean;
    activeIssueCodes: string[];
    activeBlockerIssueCodes: string[];
    feasibilityReadiness: ControllerModelRunnerPacket["feasibilityReadiness"];
    datasetSemanticAudit: Awaited<ReturnType<typeof loadControllerDatasetSemanticAuditSummary>>;
    path: string;
    reportPath: string;
  };
  capabilities: {
    covered: number;
    missing: number;
    available: number;
    missingIds: string[];
    path: string;
    reportPath: string;
  };
  handoffArtifacts: {
    doctor: { path: string; reportPath: string };
    runnerPacket: { path: string; reportPath: string };
    operatorAudit: { path: string; reportPath: string };
    environment: { path: string | null; reportPath: string | null };
    completionAudit: { path: string; reportPath: string };
    capabilities: { path: string; reportPath: string };
    reentryPlan: { path: string; reportPath: string };
    supervisor: { path: string | null; reportPath: string | null };
    repairCycle: { path: string | null; reportPath: string | null };
    repairVerification: { path: string | null; reportPath: string | null };
  };
  artifactsToInspect: string[];
  evidenceRefs: string[];
  handoffPrompt: string;
  outPath: string;
  reportPath: string;
}

export interface ControllerUnifiedStatus {
  schemaVersion: 1;
  generatedAtIso: string;
  statusId: string;
  runId: string;
  statePath: string;
  controllerStatus: ControllerRunStatus;
  currentStage: ControllerStage;
  status: "ready" | "review" | "blocked" | "complete";
  safeToAutoContinue: boolean;
  readyToLaunch: boolean;
  promotable: boolean;
  activeIssueCodes: string[];
  activeBlockerIssueCodes: string[];
  blockers: string[];
  warnings: string[];
  recommendedCommand: string;
  launchCommand: string | null;
  inspectionCommand: string;
  nextAction: string;
  summary: {
    doctorStatus: ControllerDoctorResult["status"];
    runbookStatus: ControllerLaunchRunbook["status"];
    goldenPacketStatus: ControllerGoldenPacket["status"];
    completionAudit: ControllerGoldenPacket["readiness"]["completionAudit"];
    selfEvaluation: ControllerGoldenPacket["readiness"]["selfEvaluation"];
    promotionDecision: ControllerGoldenPacket["readiness"]["promotionDecision"];
    runInspection: string | null;
    feasibilityReadiness: string | null;
    feasibilityVerdict: string | null;
    datasetSemanticAudit: ControllerLaunchRunbook["runnerPacket"]["datasetSemanticAudit"];
    capabilityMissingIds: string[];
    cost: ControllerDoctorResult["summaries"]["cost"];
  };
  artifactPaths: {
    doctor: string;
    doctorReport: string;
    runbook: string;
    runbookReport: string;
    goldenPacket: string;
    goldenPacketReport: string;
    runnerPacket: string;
    runnerPacketReport: string;
    completionAudit: string;
    completionAuditReport: string;
    capabilityManifest: string;
    capabilityManifestReport: string;
  };
  keyArtifactReports: ControllerGoldenPacket["keyArtifactReports"];
  evidenceRefs: string[];
  state: ControllerState;
  outPath: string;
  reportPath: string;
}

export async function researchControllerInitCommand(opts: ControllerInitOptions): Promise<ControllerState> {
  const rootDir = path.resolve(opts.outDir);
  await mkdir(rootDir, { recursive: true });
  const runId = `controller_${stableHash({ q: opts.question, t: Date.now(), r: Math.random() }).slice(0, 12)}`;
  const runDir = path.resolve(opts.runDir ?? path.join(rootDir, "analysis-run"));
  await mkdir(runDir, { recursive: true });
  const statePath = path.join(rootDir, "controller-state.json");
  const policy = buildControllerPolicy(opts);
  const state: ControllerState = {
    schemaVersion: 1,
    runId,
    createdAtIso: nowIso(),
    updatedAtIso: nowIso(),
    rootDir,
    statePath,
    status: "running",
    currentStage: "intake",
    inputs: {
      question: opts.question,
      dataPath: opts.dataPath ? path.resolve(opts.dataPath) : null,
      datasetDir: opts.datasetDir ? path.resolve(opts.datasetDir) : null,
      runDir,
      method: opts.method ?? null,
      outcome: opts.outcome ?? null,
      exposure: opts.exposure ?? null,
      group: opts.group ?? null,
      outcomeThreshold: opts.outcomeThreshold ?? null,
      exposureThreshold: opts.exposureThreshold ?? null,
      time: opts.time ?? null,
      start: opts.start ?? null,
      stop: opts.stop ?? null,
      event: opts.event ?? null,
      id: opts.id ?? null,
      strata: opts.strata ?? null,
      cluster: opts.cluster ?? null,
      period: opts.period ?? null,
      post: opts.post ?? null,
      runningVariable: opts.runningVariable ?? null,
      cutoff: opts.cutoff ?? null,
      instrument: opts.instrument ?? null,
      alphaPenalty: opts.alphaPenalty ?? null,
      l1Ratio: opts.l1Ratio ?? null,
      weight: opts.weight ?? null,
      offset: opts.offset ?? null,
      variables: opts.variables ?? [],
      covariates: opts.covariates ?? [],
      exactCovariates: opts.exactCovariates ?? [],
      surveyDesign: opts.surveyDesign ?? false,
      allowSurveyApproximation: opts.allowSurveyApproximation ?? false,
      python: opts.python ?? null,
    },
    policy,
    completedStages: [],
    gates: [],
    decisions: [],
    actions: [],
    artifacts: [],
    repairs: [],
    patches: [],
    policyUpdates: [],
    toolActions: [],
    selfEvaluations: [],
    workPlans: [],
    issueLedgers: [],
    stageReviews: [],
    agendas: [],
    costEstimateUsd: 0,
    stopReason: null,
    nextRecommendedAction: "Run controller-step or controller-run to evaluate dataset feasibility.",
  };
  await writeControllerIssueLedger(state, "initial_issues");
  await writeControllerWorkPlan(state, "initial_plan");
  await writeControllerExecutionAgenda(state, "initial_agenda");
  await persistState(state);
  return state;
}

export async function researchControllerStartCommand(opts: ControllerInitOptions & {
  operate?: boolean;
  maxCycles?: number;
  maxRounds?: number;
  maxIterationsPerRound?: number;
  maxStepsPerRun?: number;
  forceReviewRequired?: boolean;
  env?: NodeJS.ProcessEnv;
  fetchImpl?: typeof fetch;
}): Promise<ControllerStartResult> {
  let state = await researchControllerInitCommand(opts);
  let status = await researchControllerStatusCommand({
    statePath: state.statePath,
    reason: "controller_start first_read_status",
  });
  let runbookRaw = await readJsonIfPresent(status.artifactPaths.runbook);
  let runbook = (valueAtPath(runbookRaw, "controllerRunbook") ?? runbookRaw) as ControllerLaunchRunbook | null;
  let operate: ControllerOperateResult | null = null;

  if (opts.operate) {
    operate = await researchControllerOperateCommand({
      statePath: state.statePath,
      reason: "controller_start operate",
      maxCycles: opts.maxCycles,
      maxRounds: opts.maxRounds,
      maxIterationsPerRound: opts.maxIterationsPerRound,
      maxStepsPerRun: opts.maxStepsPerRun,
      forceReviewRequired: opts.forceReviewRequired,
      env: opts.env,
      fetchImpl: opts.fetchImpl,
    });
    state = operate.state;
    status = await researchControllerStatusCommand({
      statePath: state.statePath,
      reason: "controller_start post_operate_status",
    });
    runbookRaw = await readJsonIfPresent(status.artifactPaths.runbook);
    runbook = (valueAtPath(runbookRaw, "controllerRunbook") ?? runbookRaw) as ControllerLaunchRunbook | null;
  }

  state = await readControllerState(state.statePath);
  const startId = `controller_start_${String(state.artifacts.filter(item => item.kind === "controller-start").length + 1).padStart(3, "0")}`;
  const outPath = path.join(state.rootDir, `${startId}.json`);
  const reportPath = path.join(state.rootDir, `${startId}.md`);
  const statusSummary: ControllerStartResult["statusSummary"] = {
    status: status.status,
    controllerStatus: status.controllerStatus,
    currentStage: status.currentStage,
    safeToAutoContinue: status.safeToAutoContinue,
    readyToLaunch: status.readyToLaunch,
    promotable: status.promotable,
    activeIssueCodes: status.activeIssueCodes,
    activeBlockerIssueCodes: status.activeBlockerIssueCodes,
    blockers: status.blockers,
    warnings: status.warnings,
    feasibilityReadiness: status.summary.feasibilityReadiness,
    feasibilityVerdict: status.summary.feasibilityVerdict,
    recommendedCommand: status.recommendedCommand,
    launchCommand: status.launchCommand,
    inspectionCommand: status.inspectionCommand,
    nextAction: status.nextAction,
  };
  const runbookSummary: ControllerStartResult["runbookSummary"] = runbook
    ? {
        status: runbook.status,
        readyToLaunch: runbook.readyToLaunch,
        firstReadCommand: runbook.firstReadCommand,
        launchCommand: runbook.launchCommand,
        readinessCommand: runbook.readinessCommand,
        inspectionCommand: runbook.inspectionCommand,
        activeIssueCodes: runbook.activeIssueCodes,
        activeBlockerIssueCodes: runbook.activeBlockerIssueCodes,
        launchBlockers: runbook.launchBlockers,
      }
    : {
        status: "review",
        readyToLaunch: false,
        firstReadCommand: `agenteer research controller-status --state ${quotePath(state.statePath)}`,
        launchCommand: `agenteer research controller-operate --state ${quotePath(state.statePath)}`,
        readinessCommand: `agenteer research controller-doctor --state ${quotePath(state.statePath)}`,
        inspectionCommand: `agenteer research controller-inspect --state ${quotePath(state.statePath)}`,
        activeIssueCodes: status.activeIssueCodes,
        activeBlockerIssueCodes: status.activeBlockerIssueCodes,
        launchBlockers: [],
      };
  const startStatus: ControllerStartResult["status"] = opts.operate
    ? operate?.status === "complete"
      ? "complete"
      : operate
        ? "operated"
        : "operate_failed"
    : status.status === "ready"
      ? "ready"
      : status.status;
  const nextAction = opts.operate
    ? status.nextAction
    : status.status === "ready"
      ? "Review the first-read status/runbook, then run controller-operate or rerun controller-start with --operate when the launch envelope is acceptable."
      : status.nextAction;
  const result: ControllerStartResult = {
    schemaVersion: 1,
    generatedAtIso: nowIso(),
    startId,
    runId: state.runId,
    statePath: state.statePath,
    status: startStatus,
    mode: opts.operate ? "operate" : "status_only",
    question: state.inputs.question,
    state,
    statusSummary,
    runbookSummary,
    operateSummary: {
      requested: Boolean(opts.operate),
      status: operate?.status ?? null,
      cycles: operate?.cycles.length ?? 0,
      stoppedReason: operate?.stoppedReason ?? null,
      outPath: operate?.outPath ?? null,
      reportPath: operate?.reportPath ?? null,
    },
    artifactPaths: {
      state: state.statePath,
      status: status.outPath,
      statusReport: status.reportPath,
      runbook: status.artifactPaths.runbook,
      runbookReport: status.artifactPaths.runbookReport,
      operate: operate?.outPath ?? null,
      operateReport: operate?.reportPath ?? null,
    },
    evidenceRefs: uniqueText([
      state.statePath,
      status.outPath,
      status.reportPath,
      status.artifactPaths.runbook,
      status.artifactPaths.runbookReport,
      ...(operate ? [operate.outPath, operate.reportPath] : []),
      ...status.evidenceRefs,
    ]),
    nextAction,
    outPath,
    reportPath,
  };
  await writeJson(outPath, { schemaVersion: 1, controllerStart: result });
  await writeFile(reportPath, renderControllerStartMarkdown(result));
  await pushControllerArtifactOnce(state, "controller-start", outPath, false);
  await pushControllerArtifactOnce(state, "controller-start-report", reportPath, false);
  await persistState(state);
  result.state = await readControllerState(state.statePath);
  await writeJson(outPath, { schemaVersion: 1, controllerStart: result });
  await writeFile(reportPath, renderControllerStartMarkdown(result));
  return result;
}

export async function researchControllerStepCommand(opts: {
  statePath: string;
  env?: NodeJS.ProcessEnv;
  fetchImpl?: typeof fetch;
}): Promise<ControllerState> {
  const state = await readControllerState(opts.statePath);
  if (isTerminal(state.currentStage) || state.status !== "running") return state;
  const checkpointStart = controllerCheckpointStart(state);
  await writeControllerStateSnapshot(state, `before_step_${state.currentStage}`);
  const gate = await evaluateCurrentGate(state);
  state.gates.push(gate);
  if (gate.status === "block") {
    const blocked = await executeTerminalDecision(state, "block", gate.reasons.join(" "), gate);
    await checkpointAndPersist(blocked, checkpointStart, "gate_block");
    return blocked;
  }
  const activeBlockers = await activeCodedControllerBlockers(state);
  if (!state.policy.controller.enabled && activeBlockers.issueCodes.length && !activeCodedBlockerStageCanProceed(state.currentStage)) {
    const activeIssueGate: ControllerGate = {
      stage: state.currentStage,
      status: "block",
      label: "Active coded blockers prevent deterministic or model continuation.",
      reasons: [`Active coded blocker(s) remain: ${activeBlockers.issueCodes.join(", ")}.`],
      evidenceRefs: activeBlockers.evidenceRefs,
      nextStage: "blocked",
    };
    state.gates.push(activeIssueGate);
    const blocked = await executeTerminalDecision(state, "block", activeIssueGate.reasons.join(" "), activeIssueGate);
    await checkpointAndPersist(blocked, checkpointStart, "active_coded_blocker_guard");
    return blocked;
  }
  const decision = await chooseControllerDecision(state, gate, opts.env ?? process.env, opts.fetchImpl ?? fetch);
  state.decisions.push(decision);
  if (decision.inputPatch) {
    const patchRecord = await applyControllerInputPatch(state, decision.inputPatch, {
      source: "model_decision",
      reason: decision.rationale,
    });
    state.patches.push(patchRecord);
    state.artifacts.push(await artifact("controller-input-patch", patchRecord.outPath, state.currentStage, true));
    if (patchRecord.status === "rejected") {
      state.currentStage = "human_review";
      state.status = "needs_human_review";
      state.stopReason = `Controller model proposed an invalid input patch: ${patchRecord.validationReasons.join("; ")}`;
      state.nextRecommendedAction = nextRecommendedAction(state);
      await checkpointAndPersist(state, checkpointStart, "invalid_model_patch");
      return state;
    }
    if (patchRecord.invalidatedStages.includes(state.currentStage)) {
      const earliest = earliestInvalidatedStage(patchRecord.invalidatedStages) ?? state.currentStage;
      state.currentStage = earliest;
      state.status = "running";
      state.stopReason = null;
      state.nextRecommendedAction = `Model input patch invalidated ${patchRecord.invalidatedStages.join(", ")}; re-enter ${earliest} before executing stale actions.`;
      await checkpointAndPersist(state, checkpointStart, "model_patch_reentry");
      return state;
    }
  }
  if (decision.toolRequests.length) {
    if (decision.toolValidation.status === "invalid") {
      state.currentStage = "human_review";
      state.status = "needs_human_review";
      state.stopReason = `Controller model proposed invalid tool request(s): ${decision.toolValidation.reasons.join("; ")}`;
      state.nextRecommendedAction = nextRecommendedAction(state);
      await checkpointAndPersist(state, checkpointStart, "invalid_model_tool_request");
      return state;
    }
    const toolExecutions = await executeControllerTools(state, decision.toolRequests);
    state.toolActions.push(...toolExecutions);
    for (const toolExecution of toolExecutions) {
    state.artifacts.push(await artifact("controller-tool-action", toolExecution.outPath, state.currentStage, false));
    if (toolExecution.stdoutPath) state.artifacts.push(await artifact("controller-tool-stdout", toolExecution.stdoutPath, state.currentStage, false));
    if (toolExecution.stderrPath) state.artifacts.push(await artifact("controller-tool-stderr", toolExecution.stderrPath, state.currentStage, false));
    await attachSpecificToolArtifacts(state, toolExecution);
  }
    const failedTool = toolExecutions.find(item => item.status !== "succeeded");
    if (failedTool && state.policy.autonomy !== "aggressive") {
      state.currentStage = "human_review";
      state.status = "needs_human_review";
      state.stopReason = `Controller tool action failed or was rejected: ${failedTool.request.toolId}`;
      state.nextRecommendedAction = nextRecommendedAction(state);
      await checkpointAndPersist(state, checkpointStart, "tool_failure");
      return state;
    }
    if (toolExecutions.some(item => toolRequiresModelReentry(item))) {
      state.status = "running";
      state.stopReason = null;
      state.nextRecommendedAction = "Controller tool output was recorded; re-run controller-step so the model can use recentToolResults before executing a potentially stale action.";
      await checkpointAndPersist(state, checkpointStart, "tool_evidence_reentry");
      return state;
    }
  }
  const readiness = await writeControllerActionReadiness(state, decision, gate);
  state.artifacts.push(await artifact("controller-action-readiness", readiness.outPath, state.currentStage, decision.action !== "stop_for_human" && decision.action !== "block"));
  state.artifacts.push(await artifact("controller-action-readiness-report", readiness.reportPath, state.currentStage, false));
  if (readiness.status === "fail") {
    state.currentStage = "human_review";
    state.status = "needs_human_review";
    state.stopReason = `Selected action ${decision.action} failed pre-action readiness: ${readiness.checks.filter(check => check.status === "fail").map(check => check.message).join("; ")}`;
    state.nextRecommendedAction = nextRecommendedAction(state);
    await checkpointAndPersist(state, checkpointStart, "action_readiness_failed");
    return state;
  }
  const action = await executeControllerAction(state, decision, gate, opts.env ?? process.env, opts.fetchImpl ?? fetch);
  state.artifacts.push(...action.artifacts);
  const contract = await writeControllerActionContract(state, action);
  const contractRequired = action.status === "succeeded";
  state.artifacts.push(await artifact("controller-action-contract", contract.outPath, state.currentStage, contractRequired));
  state.artifacts.push(await artifact("controller-action-contract-report", contract.reportPath, state.currentStage, false));
  if (action.status === "succeeded" && contract.status === "fail") {
    action.status = "failed";
    action.error = `Action contract failed: ${contract.reasons.join("; ")}`;
    action.outputSummary = `${action.outputSummary} Contract failed: ${contract.reasons.join("; ")}`;
    action.nextStage = "human_review";
  }
  state.actions.push(action);
  if ((action.status === "succeeded" || action.status === "skipped") && !state.completedStages.includes(state.currentStage)) state.completedStages.push(state.currentStage);
  state.currentStage = action.nextStage;
  state.status = statusForStage(state.currentStage, action.status);
  state.stopReason = stopReasonForStage(state.currentStage, action.error);
  state.updatedAtIso = nowIso();
  state.nextRecommendedAction = nextRecommendedAction(state);
  await checkpointAndPersist(state, checkpointStart, action.status === "failed" ? "action_failed" : "action_completed");
  return state;
}

export async function researchControllerRunCommand(opts: ControllerInitOptions & {
  statePath?: string;
  env?: NodeJS.ProcessEnv;
  fetchImpl?: typeof fetch;
}): Promise<ControllerRunResult> {
  let state = opts.statePath
    ? await readControllerState(opts.statePath)
    : await researchControllerInitCommand(opts);
  const invocationStart = controllerRunInvocationStart(state);
  if (opts.statePath) {
    await writeControllerStateSnapshot(state, "before_runtime_policy_overrides");
    const policyUpdate = await applyControllerPolicyOverrides(state, opts, "Runtime controller-run policy overrides.");
    if (policyUpdate) {
      state.policyUpdates.push(policyUpdate);
      state.artifacts.push(await artifact("controller-policy-update", policyUpdate.outPath, state.currentStage, false));
      if (policyUpdate.invalidatedStages.length) {
        const earliest = earliestInvalidatedStage(policyUpdate.invalidatedStages) ?? state.currentStage;
        state.currentStage = earliest;
        state.status = "running";
        state.stopReason = null;
      state.nextRecommendedAction = `Policy update invalidated ${policyUpdate.invalidatedStages.join(", ")}; re-enter ${earliest}.`;
      }
      await writeControllerIssueLedger(state, "runtime_policy_update");
      await writeControllerWorkPlan(state, "runtime_policy_update");
      await writeControllerExecutionAgenda(state, "runtime_policy_update");
      await persistState(state);
    }
  }
  const maxSteps = opts.maxSteps ?? state.policy.maxSteps;
  let stepCount = 0;
  while (!isTerminal(state.currentStage) && state.status === "running" && stepCount < maxSteps) {
    state = await researchControllerStepCommand({ statePath: state.statePath, env: opts.env, fetchImpl: opts.fetchImpl });
    stepCount += 1;
  }
  if (!isTerminal(state.currentStage) && state.status === "running" && stepCount >= maxSteps) {
    state.status = "needs_human_review";
    state.currentStage = "human_review";
    state.stopReason = `Controller reached max steps (${maxSteps}) before terminal readiness.`;
    state.nextRecommendedAction = "Inspect controller-state.json, increase --max-steps, or resume after resolving blockers.";
    await persistState(state);
  }
  await writeControllerRunInvocation(state, invocationStart, stepCount, maxSteps);
  return { schemaVersion: 1, generatedAtIso: nowIso(), state, stepCount, terminal: isTerminal(state.currentStage) || state.status !== "running" };
}

export async function researchControllerResumeCommand(opts: {
  statePath: string;
  force?: boolean;
  reason?: string;
}): Promise<ControllerResumeResult> {
  const state = await readControllerState(opts.statePath);
  const previousStatus = state.status;
  const existingPlan = await readControllerReentryPlan(state);
  const plan = existingPlan ?? await writeControllerReentryPlan(state);
  const resumeRecordPath = path.join(state.rootDir, `controller-resume-${String(state.actions.length + state.patches.length + 1).padStart(3, "0")}.json`);
  let resumed = false;
  let reason = "";
  if (state.status === "running") {
    resumed = true;
    reason = "Controller state is already running.";
  } else if (plan.status === "complete_no_reentry") {
    reason = "Controller run is complete; re-entry is not allowed.";
  } else if (plan.status === "new_run_required") {
    reason = "Re-entry plan requires a new controller run.";
  } else if (plan.status === "patch_then_resume" && !opts.force) {
    reason = "Re-entry requires a reviewed controller-patch before resuming. Pass force only when the recommended safe patch has already been applied or manually reviewed.";
  } else if (plan.recommendedStage === "blocked" || plan.recommendedStage === "complete" || plan.recommendedStage === "human_review") {
    reason = `Re-entry stage ${plan.recommendedStage} is not executable. Apply a patch or start a new run.`;
  } else {
    state.currentStage = plan.recommendedStage;
    state.status = "running";
    state.stopReason = null;
    state.nextRecommendedAction = `Resumed from re-entry plan at ${plan.recommendedStage}; run controller-step or controller-run.`;
    state.updatedAtIso = nowIso();
    resumed = true;
    reason = opts.reason ?? `Resumed from controller re-entry plan (${plan.status}) at ${plan.recommendedStage}.`;
  }
  const record = {
    schemaVersion: 1,
    generatedAtIso: nowIso(),
    runId: state.runId,
    resumed,
    reason,
    force: Boolean(opts.force),
    previousStatus,
    reentryPlanPath: plan.outPath,
    recommendedStage: plan.recommendedStage,
    planStatus: plan.status,
  };
  await writeJson(resumeRecordPath, { schemaVersion: 1, controllerResume: record });
  state.artifacts.push(await artifact("controller-resume-record", resumeRecordPath, state.currentStage, false));
  state.nextRecommendedAction = resumed ? nextRecommendedAction(state) : reason;
  await writeControllerIssueLedger(state, resumed ? "controller_resume" : "controller_resume_refused");
  await writeControllerWorkPlan(state, resumed ? "controller_resume" : "controller_resume_refused");
  await writeControllerExecutionAgenda(state, resumed ? "controller_resume" : "controller_resume_refused");
  await persistState(state);
  return { schemaVersion: 1, generatedAtIso: nowIso(), state, reentryPlan: plan, resumed, reason, resumeRecordPath };
}

export async function researchControllerInspectCommand(opts: { statePath: string }): Promise<ControllerRunResult> {
  const state = await readControllerState(opts.statePath);
  const inspection = await inspectControllerStateForTool(state);
  const recovery = await writeControllerRecoveryInspection(state);
  const inspectionPath = path.join(state.rootDir, "controller-internal-inspection.json");
  const reportPath = path.join(state.rootDir, "controller-internal-inspection.md");
  await writeJson(inspectionPath, { schemaVersion: 1, controllerInspection: inspection });
  await writeFile(reportPath, renderControllerInternalInspectionMarkdown(inspection, state));
  state.artifacts = state.artifacts.filter(item => item.kind !== "controller-internal-inspection" && item.kind !== "controller-internal-inspection-report");
  state.artifacts.push(await artifact("controller-internal-inspection", inspectionPath, state.currentStage, false));
  state.artifacts.push(await artifact("controller-internal-inspection-report", reportPath, state.currentStage, false));
  state.artifacts = state.artifacts.filter(item => item.kind !== "controller-recovery-inspection" && item.kind !== "controller-recovery-inspection-report");
  state.artifacts.push(await artifact("controller-recovery-inspection", recovery.outPath, state.currentStage, false));
  state.artifacts.push(await artifact("controller-recovery-inspection-report", recovery.reportPath, state.currentStage, false));
  state.nextRecommendedAction = inspection.status === "fail"
    ? "Review controller-internal-inspection.md before continuing; one or more controller integrity checks failed."
    : recovery.recommendedCommand
      ? `Recovery inspection: ${recovery.reason} Recommended: ${recovery.recommendedCommand}`
    : nextRecommendedAction(state);
  await writeControllerIssueLedger(state, "controller_inspect");
  await writeControllerWorkPlan(state, "controller_inspect");
  await writeControllerExecutionAgenda(state, "controller_inspect");
  await persistState(state);
  return { schemaVersion: 1, generatedAtIso: nowIso(), state, stepCount: state.actions.length, terminal: isTerminal(state.currentStage) || state.status !== "running" };
}

export async function researchControllerPatchCommand(opts: {
  statePath: string;
  patch: ControllerInputPatch;
  reason?: string;
}): Promise<ControllerState> {
  const state = await readControllerState(opts.statePath);
  const record = await applyControllerInputPatch(state, opts.patch, {
    source: "manual",
    reason: opts.reason ?? "Manual controller input patch.",
  });
  state.patches.push(record);
  state.artifacts.push(await artifact("controller-input-patch", record.outPath, state.currentStage, true));
  if (record.status === "applied") {
    const earliest = earliestInvalidatedStage(record.invalidatedStages);
    state.currentStage = earliest ?? state.currentStage;
    state.status = "running";
    state.stopReason = null;
  } else {
    state.status = "needs_human_review";
    state.currentStage = "human_review";
    state.stopReason = `Manual input patch rejected: ${record.validationReasons.join("; ")}`;
  }
  state.nextRecommendedAction = nextRecommendedAction(state);
  await writeControllerIssueLedger(state, record.status === "applied" ? "manual_patch_applied" : "manual_patch_rejected");
  await writeControllerWorkPlan(state, record.status === "applied" ? "manual_patch_applied" : "manual_patch_rejected");
  await writeControllerExecutionAgenda(state, record.status === "applied" ? "manual_patch_applied" : "manual_patch_rejected");
  await persistState(state);
  return state;
}

export async function researchControllerToolCommand(opts: {
  statePath: string;
  request: ControllerToolRequest;
}): Promise<ControllerState> {
  const state = await readControllerState(opts.statePath);
  const executions = await executeControllerTools(state, [opts.request]);
  state.toolActions.push(...executions);
  for (const execution of executions) {
    state.artifacts.push(await artifact("controller-tool-action", execution.outPath, state.currentStage, false));
    if (execution.stdoutPath) state.artifacts.push(await artifact("controller-tool-stdout", execution.stdoutPath, state.currentStage, false));
    if (execution.stderrPath) state.artifacts.push(await artifact("controller-tool-stderr", execution.stderrPath, state.currentStage, false));
    await attachSpecificToolArtifacts(state, execution);
  }
  const failed = executions.find(execution => execution.status !== "succeeded");
  if (failed && state.policy.autonomy !== "aggressive") {
    state.status = "needs_human_review";
    state.currentStage = "human_review";
    state.stopReason = `Manual controller tool failed or was rejected: ${failed.request.toolId}`;
  }
  state.nextRecommendedAction = nextRecommendedAction(state);
  await writeControllerIssueLedger(state, "manual_tool_execution");
  await writeControllerWorkPlan(state, "manual_tool_execution");
  await writeControllerExecutionAgenda(state, "manual_tool_execution");
  await persistState(state);
  return state;
}

export async function researchControllerAgendaCommand(opts: {
  statePath: string;
  reason?: string;
}): Promise<ControllerExecutionAgenda> {
  const state = await readControllerState(opts.statePath);
  const agenda = await writeControllerExecutionAgenda(state, opts.reason ?? "manual_agenda_refresh");
  state.updatedAtIso = nowIso();
  await writeJson(state.statePath, { schemaVersion: 1, controllerState: state });
  return agenda;
}

export async function researchControllerFollowAgendaCommand(opts: {
  statePath: string;
  reason?: string;
  maxSteps?: number;
  forceReviewRequired?: boolean;
  env?: NodeJS.ProcessEnv;
  fetchImpl?: typeof fetch;
}): Promise<ControllerFollowAgendaResult> {
  let state = await readControllerState(opts.statePath);
  const agenda = await writeControllerExecutionAgenda(state, opts.reason ?? "follow_agenda");
  await writeJson(state.statePath, { schemaVersion: 1, controllerState: state });
  const selected = agenda.items.find(item => item.command === agenda.primaryCommand) ?? agenda.items[0] ?? null;
  const outPath = path.join(state.rootDir, `controller-follow-agenda-${String(state.agendas.length).padStart(3, "0")}.json`);
  const reportPath = outPath.replace(/\.json$/, ".md");
  let executed = false;
  let refused = false;
  let reason = "";
  let runResult: ControllerRunResult | null = null;
  const activeBlockers = await activeCodedControllerBlockers(state);

  if (!selected) {
    refused = true;
    reason = "Execution agenda has no selectable item.";
  } else if (activeBlockers.issueCodes.length && !activeCodedBlockerStageCanProceed(state.currentStage)) {
    refused = true;
    reason = `Active coded blocker(s) prevent follow-agenda execution: ${activeBlockers.issueCodes.join(", ")}.`;
  } else if (selected.status !== "executable" && selected.status !== "complete") {
    refused = true;
    reason = `Selected agenda item is ${selected.status}, not executable.`;
  } else if (selected.safety !== "safe" && !opts.forceReviewRequired) {
    refused = true;
    reason = `Selected agenda item requires review (${selected.safety}); pass force only after explicit review.`;
  } else if (selected.kind === "patch") {
    refused = true;
    reason = "Agenda patches require explicit controller-patch input and are not auto-applied by follow-agenda.";
  } else if (selected.kind === "human_review" || selected.kind === "stop") {
    refused = true;
    reason = `Agenda item ${selected.kind} requires human/model review, not automatic execution.`;
  } else if (selected.status === "complete") {
    executed = false;
    reason = "Agenda reports completion; no action executed.";
  } else {
    switch (selected.kind) {
      case "run":
        if ((opts.maxSteps ?? 4) === 1) {
          state = await researchControllerStepCommand({ statePath: state.statePath, env: opts.env, fetchImpl: opts.fetchImpl });
          runResult = { schemaVersion: 1, generatedAtIso: nowIso(), state, stepCount: 1, terminal: isTerminal(state.currentStage) || state.status !== "running" };
          executed = true;
          reason = "Executed one agenda run step.";
        } else {
          runResult = await researchControllerRunCommand({
            statePath: state.statePath,
            question: state.inputs.question,
            outDir: state.rootDir,
            maxSteps: opts.maxSteps ?? 4,
            env: opts.env,
            fetchImpl: opts.fetchImpl,
          });
          state = runResult.state;
          executed = true;
          reason = `Executed agenda run item for up to ${opts.maxSteps ?? 4} step(s).`;
        }
        break;
      case "step":
        state = await researchControllerStepCommand({ statePath: state.statePath, env: opts.env, fetchImpl: opts.fetchImpl });
        runResult = { schemaVersion: 1, generatedAtIso: nowIso(), state, stepCount: 1, terminal: isTerminal(state.currentStage) || state.status !== "running" };
        executed = true;
        reason = "Executed one agenda step item.";
        break;
      case "inspect":
        if (selected.command.includes("research run-inspect")) {
          await executeBoundedResearchAgendaCommand(state, selected.command, opts);
          await writeControllerExecutionAgenda(state, "follow_agenda_run_inspection_command");
          await persistState(state);
          executed = true;
          reason = "Executed agenda run-inspection item.";
        } else {
          runResult = await researchControllerInspectCommand({ statePath: state.statePath });
          state = runResult.state;
          executed = true;
          reason = "Executed agenda inspect item.";
        }
        break;
      case "resume": {
        const resume = await researchControllerResumeCommand({ statePath: state.statePath, force: Boolean(opts.forceReviewRequired), reason: opts.reason ?? "Follow agenda resume." });
        state = resume.state;
        runResult = { schemaVersion: 1, generatedAtIso: nowIso(), state, stepCount: state.actions.length, terminal: isTerminal(state.currentStage) || state.status !== "running" };
        executed = resume.resumed;
        refused = !resume.resumed;
        reason = resume.reason;
        break;
      }
      case "tool":
        refused = true;
        reason = "Agenda tool commands require explicit controller-tool request arguments and are not auto-executed by follow-agenda.";
        break;
      case "qa":
      case "manifest":
      case "review":
        await executeBoundedResearchAgendaCommand(state, selected.command, opts);
        await writeControllerExecutionAgenda(state, `follow_agenda_${selected.kind}_command`);
        await persistState(state);
        executed = true;
        reason = `Executed agenda ${selected.kind} item.`;
        break;
      default:
        refused = true;
        reason = `Agenda item kind ${selected.kind} is not supported by follow-agenda.`;
        break;
    }
  }

  const result: ControllerFollowAgendaResult = {
    schemaVersion: 1,
    generatedAtIso: nowIso(),
    runId: state.runId,
    statePath: state.statePath,
    agenda,
    selectedItem: selected,
    executed,
    refused,
    reason,
    state,
    runResult,
    outPath,
    reportPath,
  };
  await writeJson(outPath, { schemaVersion: 1, controllerFollowAgenda: result });
  await writeFile(reportPath, renderControllerFollowAgendaMarkdown(result));
  state.artifacts.push(await artifact("controller-follow-agenda", outPath, state.currentStage, false));
  state.artifacts.push(await artifact("controller-follow-agenda-report", reportPath, state.currentStage, false));
  await persistState(state);
  return result;
}

async function executeBoundedResearchAgendaCommand(
  state: ControllerState,
  command: string,
  opts: { env?: NodeJS.ProcessEnv; fetchImpl?: typeof fetch; forceReviewRequired?: boolean },
): Promise<void> {
  const parsed = parseAgenteerResearchCommand(command);
  if (!parsed) {
    throw new Error(`Unsupported agenda command shape: ${command}`);
  }
  if (parsed.subcommand === "figure-qa") {
    const figures = requiredParsedFlag(parsed.flags, "figures", command);
    const out = parsed.flags.out ?? path.join(path.dirname(figures), "figure-qa.json");
    const report = parsed.flags.report ?? path.join(path.dirname(figures), "figure-qa.md");
    const result = await researchFigureQaCommand({ manifestPath: figures, outPath: out, reportPath: report });
    await pushControllerArtifactOnce(state, "figure-qa", result.outPath ?? out, true);
    await pushControllerArtifactOnce(state, "figure-qa-report", result.reportPath ?? report, false);
    return;
  }
  if (parsed.subcommand === "method-qa") {
    const runDir = requiredParsedFlag(parsed.flags, "run-dir", command);
    const out = parsed.flags.out ?? path.join(runDir, "method-qa.json");
    const report = parsed.flags.report ?? path.join(runDir, "method-qa.md");
    const result = await researchMethodQaCommand({ runDir, outPath: out, reportPath: report });
    await pushControllerArtifactOnce(state, "method-qa", result.outPath ?? out, true);
    await pushControllerArtifactOnce(state, "method-qa-report", result.reportPath ?? report, false);
    return;
  }
  if (parsed.subcommand === "run-inspect") {
    const runDir = requiredParsedFlag(parsed.flags, "run-dir", command);
    const out = parsed.flags.out ?? path.join(runDir, "run-inspection.json");
    const report = parsed.flags.report ?? path.join(runDir, "run-inspection.md");
    const result = await researchRunInspectCommand({ runDir, outPath: out, reportPath: report });
    await pushControllerArtifactOnce(state, "run-inspection", result.outPath ?? out, true);
    await pushControllerArtifactOnce(state, "run-inspection-report", result.reportPath ?? report, false);
    return;
  }
  if (parsed.subcommand === "analysis-manifest") {
    const runDir = requiredParsedFlag(parsed.flags, "run-dir", command);
    const out = parsed.flags.out ?? path.join(runDir, "analysis-run-manifest.json");
    const manifest = await buildAnalysisRunManifest({ runDir, outPath: out });
    if (parsed.flags["require-ready"] === "true" && manifest.readiness !== "local_review_ready") {
      throw new Error(`analysis manifest is ${manifest.readiness}, not local_review_ready; next action: ${manifest.nextAction}`);
    }
    await pushControllerArtifactOnce(state, "analysis-run-manifest", manifest.outPath ?? out, true);
    return;
  }
  if (parsed.subcommand === "study-critic") {
    if (!opts.forceReviewRequired) {
      throw new Error("study-critic agenda commands require forceReviewRequired because they can call external reviewers.");
    }
    const runDir = requiredParsedFlag(parsed.flags, "run-dir", command);
    const result = await researchStudyCriticCommand({
      runDir,
      stage: reviewStageSchema.parse(parsed.flags.stage ?? "final"),
      panel: parsed.flags.panel ? reviewerPanelSchemaForController(parsed.flags.panel) : undefined,
      mock: parsed.flags.mock === "true",
      env: opts.env,
      fetchImpl: opts.fetchImpl,
    });
    await pushControllerArtifactOnce(state, "review-panel", result.generatedFiles.panel, true);
    await pushControllerArtifactOnce(state, "review-adjudication", result.generatedFiles.adjudication, true);
    await pushControllerArtifactOnce(state, "review-response", result.generatedFiles.response, false);
    await pushControllerArtifactOnce(state, "state-reentry", result.generatedFiles.stateReentry, false);
    return;
  }
  throw new Error(`follow-agenda does not support research ${parsed.subcommand} agenda commands yet.`);
}

function parseAgenteerResearchCommand(command: string): { subcommand: string; flags: Record<string, string> } | null {
  const words = splitShellLikeWords(command);
  const researchIndex = words.findIndex((word, index) => word === "research" && words[index - 1] === "agenteer");
  if (researchIndex < 0) return null;
  const subcommand = words[researchIndex + 1];
  if (!subcommand) return null;
  const flags: Record<string, string> = {};
  for (let i = researchIndex + 2; i < words.length; i += 1) {
    const word = words[i];
    if (!word) continue;
    if (!word.startsWith("--")) continue;
    const key = word.slice(2);
    const next = words[i + 1];
    if (!next || next.startsWith("--")) {
      flags[key] = "true";
    } else {
      flags[key] = next;
      i += 1;
    }
  }
  return { subcommand, flags };
}

function splitShellLikeWords(command: string): string[] {
  const words: string[] = [];
  let current = "";
  let quote: "'" | "\"" | null = null;
  let escaped = false;
  for (const char of command) {
    if (escaped) {
      current += char;
      escaped = false;
      continue;
    }
    if (char === "\\" && quote !== "'") {
      escaped = true;
      continue;
    }
    if (quote) {
      if (char === quote) {
        quote = null;
      } else {
        current += char;
      }
      continue;
    }
    if (char === "'" || char === "\"") {
      quote = char;
      continue;
    }
    if (/\s/.test(char)) {
      if (current) {
        words.push(current);
        current = "";
      }
      continue;
    }
    current += char;
  }
  if (current) words.push(current);
  return words;
}

function requiredParsedFlag(flags: Record<string, string>, key: string, command: string): string {
  const value = flags[key];
  if (!value) throw new Error(`Missing --${key} in agenda command: ${command}`);
  return value;
}

function reviewerPanelSchemaForController(value: string): ReviewerPanel {
  return z.enum(["default", "cheap", "strict", "all", "deepseek-dual", "deepseek-triple"]).parse(value);
}

export async function researchControllerFollowLoopCommand(opts: {
  statePath: string;
  reason?: string;
  maxIterations?: number;
  maxStepsPerRun?: number;
  forceReviewRequired?: boolean;
  env?: NodeJS.ProcessEnv;
  fetchImpl?: typeof fetch;
}): Promise<ControllerFollowLoopResult> {
  let state = await readControllerState(opts.statePath);
  const maxIterations = Math.max(1, opts.maxIterations ?? 5);
  const maxStepsPerRun = Math.max(1, opts.maxStepsPerRun ?? 4);
  const iterations: ControllerFollowLoopIteration[] = [];
  let stoppedReason = "";
  for (let i = 0; i < maxIterations; i += 1) {
    if (isTerminal(state.currentStage) || state.status !== "running") {
      stoppedReason = `Controller is terminal or paused at ${state.currentStage}/${state.status}.`;
      break;
    }
    const beforeStage = state.currentStage;
    const beforeStatus = state.status;
    const follow = await researchControllerFollowAgendaCommand({
      statePath: state.statePath,
      reason: `${opts.reason ?? "follow_loop"} iteration ${i + 1}`,
      maxSteps: maxStepsPerRun,
      forceReviewRequired: opts.forceReviewRequired,
      env: opts.env,
      fetchImpl: opts.fetchImpl,
    });
    state = follow.state;
    iterations.push({
      iteration: i + 1,
      beforeStage,
      beforeStatus,
      agendaId: follow.agenda.agendaId,
      selectedItemId: follow.selectedItem?.id ?? null,
      selectedKind: follow.selectedItem?.kind ?? null,
      selectedIssueCodes: follow.selectedItem?.issueCodes ?? [],
      selectedEvidenceRefs: follow.selectedItem?.evidenceRefs ?? [],
      executed: follow.executed,
      refused: follow.refused,
      reason: follow.reason,
      afterStage: state.currentStage,
      afterStatus: state.status,
      followRecordPath: follow.outPath,
      followReportPath: follow.reportPath,
    });
    if (follow.refused) {
      stoppedReason = `Agenda follow refused: ${follow.reason}`;
      break;
    }
    if (!follow.executed) {
      stoppedReason = `Agenda follow did not execute: ${follow.reason}`;
      break;
    }
  }
  if (!stoppedReason) {
    stoppedReason = iterations.length >= maxIterations
      ? `Reached max follow-loop iterations (${maxIterations}).`
      : `Controller stopped at ${state.currentStage}/${state.status}.`;
  }
  const loopId = `controller_follow_loop_${String(state.artifacts.filter(item => item.kind === "controller-follow-loop").length + 1).padStart(3, "0")}`;
  const outPath = path.join(state.rootDir, `${loopId}.json`);
  const reportPath = path.join(state.rootDir, `${loopId}.md`);
  const result: ControllerFollowLoopResult = {
    schemaVersion: 1,
    generatedAtIso: nowIso(),
    loopId,
    runId: state.runId,
    statePath: state.statePath,
    maxIterations,
    maxStepsPerRun,
    terminal: isTerminal(state.currentStage) || state.status !== "running",
    stoppedReason,
    iterations,
    state,
    outPath,
    reportPath,
  };
  await writeJson(outPath, { schemaVersion: 1, controllerFollowLoop: result });
  await writeFile(reportPath, renderControllerFollowLoopMarkdown(result));
  state.artifacts.push(await artifact("controller-follow-loop", outPath, state.currentStage, false));
  state.artifacts.push(await artifact("controller-follow-loop-report", reportPath, state.currentStage, false));
  await persistState(state);
  result.state = state;
  await writeJson(outPath, { schemaVersion: 1, controllerFollowLoop: result });
  await writeFile(reportPath, renderControllerFollowLoopMarkdown(result));
  return result;
}

export async function researchControllerSupervisorCommand(opts: {
  statePath: string;
  reason?: string;
  maxRounds?: number;
  maxIterationsPerRound?: number;
  maxStepsPerRun?: number;
  forceReviewRequired?: boolean;
  env?: NodeJS.ProcessEnv;
  fetchImpl?: typeof fetch;
}): Promise<ControllerSupervisorResult> {
  let state = await readControllerState(opts.statePath);
  const maxRounds = Math.max(1, opts.maxRounds ?? 3);
  const maxIterationsPerRound = Math.max(1, opts.maxIterationsPerRound ?? 3);
  const maxStepsPerRun = Math.max(1, opts.maxStepsPerRun ?? 4);
  const rounds: ControllerSupervisorRound[] = [];
  let stoppedReason = "";

  for (let i = 0; i < maxRounds; i += 1) {
    const beforeStage = state.currentStage;
    const beforeStatus = state.status;
    const packet = await researchControllerRunnerPacketCommand({
      statePath: state.statePath,
      reason: `${opts.reason ?? "controller_supervisor"} round ${i + 1} runner_packet`,
    });
    state = await readControllerState(state.statePath);
    const activeBlockers = await activeCodedControllerBlockers(state);
    const safeAgendaPrimary = !activeBlockers.issueCodes.length && packet.agenda.items.some(item =>
      item.command === packet.recommendedCommand && item.status === "executable" && item.safety === "safe");

    if (isTerminal(state.currentStage) || state.status !== "running") {
      const reason = `Controller is terminal or paused at ${state.currentStage}/${state.status}.`;
      rounds.push({
        round: i + 1,
        beforeStage,
        beforeStatus,
        runnerPacketPath: packet.outPath,
        runnerPacketReportPath: packet.reportPath,
        runnerPacketStatus: packet.status,
        runnerPacketFeasibilityReadiness: packet.feasibilityReadiness.status,
        runnerPacketFeasibilityVerdict: packet.feasibilityReadiness.verdict,
        runnerPacketFeasibilityPath: packet.feasibilityReadiness.path,
        recommendedCommand: packet.recommendedCommand,
        safeAgendaPrimary,
        followLoopPath: null,
        followLoopReportPath: null,
        followLoopIterations: 0,
        followLoopIssueCodes: [],
        auditPath: null,
        auditReportPath: null,
        auditReadiness: null,
        afterStage: state.currentStage,
        afterStatus: state.status,
        stopped: true,
        reason,
      });
      stoppedReason = reason;
      break;
    }

    if (!safeAgendaPrimary && !opts.forceReviewRequired) {
      const reason = activeBlockers.issueCodes.length
        ? `Active coded blocker(s) prevent supervisor auto-follow: ${activeBlockers.issueCodes.join(", ")}.`
        : `Runner packet did not authorize a safe executable primary command: ${packet.recommendedCommand}`;
      rounds.push({
        round: i + 1,
        beforeStage,
        beforeStatus,
        runnerPacketPath: packet.outPath,
        runnerPacketReportPath: packet.reportPath,
        runnerPacketStatus: packet.status,
        runnerPacketFeasibilityReadiness: packet.feasibilityReadiness.status,
        runnerPacketFeasibilityVerdict: packet.feasibilityReadiness.verdict,
        runnerPacketFeasibilityPath: packet.feasibilityReadiness.path,
        recommendedCommand: packet.recommendedCommand,
        safeAgendaPrimary,
        followLoopPath: null,
        followLoopReportPath: null,
        followLoopIterations: 0,
        followLoopIssueCodes: [],
        auditPath: null,
        auditReportPath: null,
        auditReadiness: null,
        afterStage: state.currentStage,
        afterStatus: state.status,
        stopped: true,
        reason,
      });
      stoppedReason = reason;
      break;
    }

    const followLoop = await researchControllerFollowLoopCommand({
      statePath: state.statePath,
      reason: `${opts.reason ?? "controller_supervisor"} round ${i + 1} follow_loop`,
      maxIterations: maxIterationsPerRound,
      maxStepsPerRun,
      forceReviewRequired: opts.forceReviewRequired,
      env: opts.env,
      fetchImpl: opts.fetchImpl,
    });
    state = followLoop.state;
    const followLoopIssueCodes = uniqueText(followLoop.iterations.flatMap(item => item.selectedIssueCodes));
    const audit = await researchControllerAuditCommand({
      statePath: state.statePath,
      reason: `${opts.reason ?? "controller_supervisor"} round ${i + 1} audit`,
    });
    state = await readControllerState(state.statePath);
    const stopped = followLoop.terminal || followLoop.iterations.length === 0 || followLoop.iterations.some(item => item.refused) || audit.readiness === "blocked" || audit.readiness === "complete";
    const reason = stopped
      ? followLoop.terminal
        ? `Follow loop reached terminal state: ${followLoop.stoppedReason}`
        : audit.readiness === "blocked" || audit.readiness === "complete"
          ? `Supervisor stopped after audit readiness ${audit.readiness}.`
          : followLoop.stoppedReason
      : "Round completed; continuing supervisor loop.";
    rounds.push({
      round: i + 1,
      beforeStage,
      beforeStatus,
      runnerPacketPath: packet.outPath,
      runnerPacketReportPath: packet.reportPath,
      runnerPacketStatus: packet.status,
      runnerPacketFeasibilityReadiness: packet.feasibilityReadiness.status,
      runnerPacketFeasibilityVerdict: packet.feasibilityReadiness.verdict,
      runnerPacketFeasibilityPath: packet.feasibilityReadiness.path,
      recommendedCommand: packet.recommendedCommand,
      safeAgendaPrimary,
      followLoopPath: followLoop.outPath,
      followLoopReportPath: followLoop.reportPath,
      followLoopIterations: followLoop.iterations.length,
      followLoopIssueCodes,
      auditPath: audit.outPath,
      auditReportPath: audit.reportPath,
      auditReadiness: audit.readiness,
      afterStage: state.currentStage,
      afterStatus: state.status,
      stopped,
      reason,
    });
    if (stopped) {
      stoppedReason = reason;
      break;
    }
  }

  if (!stoppedReason) {
    stoppedReason = rounds.length >= maxRounds
      ? `Reached max supervisor rounds (${maxRounds}).`
      : `Supervisor stopped at ${state.currentStage}/${state.status}.`;
  }

  const supervisorId = `controller_supervisor_${String(state.artifacts.filter(item => item.kind === "controller-supervisor").length + 1).padStart(3, "0")}`;
  const outPath = path.join(state.rootDir, `${supervisorId}.json`);
  const reportPath = path.join(state.rootDir, `${supervisorId}.md`);
  const result: ControllerSupervisorResult = {
    schemaVersion: 1,
    generatedAtIso: nowIso(),
    supervisorId,
    runId: state.runId,
    statePath: state.statePath,
    maxRounds,
    maxIterationsPerRound,
    maxStepsPerRun,
    terminal: isTerminal(state.currentStage) || state.status !== "running",
    stoppedReason,
    rounds,
    state,
    outPath,
    reportPath,
  };
  await writeJson(outPath, { schemaVersion: 1, controllerSupervisor: result });
  await writeFile(reportPath, renderControllerSupervisorMarkdown(result));
  await pushControllerArtifactOnce(state, "controller-supervisor", outPath, false);
  await pushControllerArtifactOnce(state, "controller-supervisor-report", reportPath, false);
  await persistState(state);
  result.state = state;
  await writeJson(outPath, { schemaVersion: 1, controllerSupervisor: result });
  await writeFile(reportPath, renderControllerSupervisorMarkdown(result));
  return result;
}

export async function researchControllerAuditCommand(opts: {
  statePath: string;
  reason?: string;
}): Promise<ControllerOperatorAudit> {
  const state = await readControllerState(opts.statePath);
  const agenda = await writeControllerExecutionAgenda(state, opts.reason ?? "operator_audit");
  const audit = await buildControllerOperatorAudit(state, agenda, opts.reason ?? "operator_audit");
  await writeControllerEnvironmentPreflight(audit.environment);
  await writeJson(audit.outPath, { schemaVersion: 1, controllerOperatorAudit: audit });
  await writeFile(audit.reportPath, renderControllerOperatorAuditMarkdown(audit));
  state.artifacts.push(await artifact("controller-environment-preflight", audit.environment.outPath, state.currentStage, false));
  state.artifacts.push(await artifact("controller-environment-preflight-report", audit.environment.reportPath, state.currentStage, false));
  state.artifacts.push(await artifact("controller-operator-audit", audit.outPath, state.currentStage, false));
  state.artifacts.push(await artifact("controller-operator-audit-report", audit.reportPath, state.currentStage, false));
  await persistState(state);
  return audit;
}

export async function researchControllerEnvironmentCommand(opts: {
  statePath: string;
  reason?: string;
}): Promise<ControllerEnvironmentPreflight> {
  const state = await readControllerState(opts.statePath);
  const preflight = await buildControllerEnvironmentPreflight(state, opts.reason ?? "controller_environment");
  await writeControllerEnvironmentPreflight(preflight);
  state.artifacts.push(await artifact("controller-environment-preflight", preflight.outPath, state.currentStage, false));
  state.artifacts.push(await artifact("controller-environment-preflight-report", preflight.reportPath, state.currentStage, false));
  await persistState(state);
  return preflight;
}

export async function researchControllerCapabilitiesCommand(opts: {
  statePath: string;
  reason?: string;
}): Promise<ControllerCapabilityManifest> {
  const state = await readControllerState(opts.statePath);
  const manifest = buildControllerCapabilityManifest(state, opts.reason ?? "controller_capabilities");
  await writeJson(manifest.outPath, { schemaVersion: 1, controllerCapabilityManifest: manifest });
  await writeFile(manifest.reportPath, renderControllerCapabilityManifestMarkdown(manifest));
  state.artifacts.push(await artifact("controller-capability-manifest", manifest.outPath, state.currentStage, false));
  state.artifacts.push(await artifact("controller-capability-manifest-report", manifest.reportPath, state.currentStage, false));
  await persistState(state);
  return manifest;
}

export async function researchControllerGoalAuditCommand(opts: {
  statePath: string;
  objective?: string;
  reason?: string;
}): Promise<ControllerGoalAudit> {
  const state = await readControllerState(opts.statePath);
  const issueLedger = await writeControllerIssueLedger(state, opts.reason ?? "goal_audit_active_issues");
  const agenda = await writeControllerExecutionAgenda(state, opts.reason ?? "goal_audit");
  const operatorAudit = await buildControllerOperatorAudit(state, agenda, opts.reason ?? "goal_audit");
  await writeControllerEnvironmentPreflight(operatorAudit.environment);
  await writeJson(operatorAudit.outPath, { schemaVersion: 1, controllerOperatorAudit: operatorAudit });
  await writeFile(operatorAudit.reportPath, renderControllerOperatorAuditMarkdown(operatorAudit));
  state.artifacts.push(await artifact("controller-environment-preflight", operatorAudit.environment.outPath, state.currentStage, false));
  state.artifacts.push(await artifact("controller-environment-preflight-report", operatorAudit.environment.reportPath, state.currentStage, false));
  state.artifacts.push(await artifact("controller-operator-audit", operatorAudit.outPath, state.currentStage, false));
  state.artifacts.push(await artifact("controller-operator-audit-report", operatorAudit.reportPath, state.currentStage, false));
  const capabilityManifest = buildControllerCapabilityManifest(state, opts.reason ?? "goal_audit_capabilities");
  await writeJson(capabilityManifest.outPath, { schemaVersion: 1, controllerCapabilityManifest: capabilityManifest });
  await writeFile(capabilityManifest.reportPath, renderControllerCapabilityManifestMarkdown(capabilityManifest));
  state.artifacts.push(await artifact("controller-capability-manifest", capabilityManifest.outPath, state.currentStage, false));
  state.artifacts.push(await artifact("controller-capability-manifest-report", capabilityManifest.reportPath, state.currentStage, false));
  const goalAudit = buildControllerGoalAudit(state, operatorAudit, capabilityManifest, issueLedger, opts.objective);
  await writeJson(goalAudit.outPath, { schemaVersion: 1, controllerGoalAudit: goalAudit });
  await writeFile(goalAudit.reportPath, renderControllerGoalAuditMarkdown(goalAudit));
  state.artifacts.push(await artifact("controller-goal-audit", goalAudit.outPath, state.currentStage, false));
  state.artifacts.push(await artifact("controller-goal-audit-report", goalAudit.reportPath, state.currentStage, false));
  await persistState(state);
  return goalAudit;
}

export async function researchControllerBenchmarkCommand(opts: {
  statePath: string;
  suiteDir?: string;
  historyDir?: string;
  reason?: string;
}): Promise<ControllerBenchmarkResult> {
  const state = await readControllerState(opts.statePath);
  const repoRoot = repoRootFromState(state);
  const suiteDir = path.resolve(repoRoot, opts.suiteDir ?? ".loop-memory/golden");
  const historyDir = path.resolve(repoRoot, opts.historyDir ?? ".loop-memory/benchmark-history");
  const benchmarkId = `controller_benchmark_${String(state.artifacts.filter(item => item.kind === "controller-benchmark").length + 1).padStart(3, "0")}`;
  const suite = await researchBenchmarkSuiteRunCommand({
    suiteDir,
    outDir: historyDir,
    outPath: path.join(historyDir, `${benchmarkId}.benchmark-suite-run.json`),
    reportPath: path.join(historyDir, `${benchmarkId}.benchmark-suite-run.md`),
  });
  const trend = await researchBenchmarkTrendCommand({
    historyDir,
    outPath: path.join(historyDir, `${benchmarkId}.benchmark-trend.json`),
    reportPath: path.join(historyDir, `${benchmarkId}.benchmark-trend.md`),
  });
  await pushControllerArtifactOnce(state, "continuous-benchmark-suite", suite.outPath ?? path.join(historyDir, `${benchmarkId}.benchmark-suite-run.json`), false);
  await pushControllerArtifactOnce(state, "continuous-benchmark-suite-report", suite.reportPath ?? path.join(historyDir, `${benchmarkId}.benchmark-suite-run.md`), false);
  await pushControllerArtifactOnce(state, "continuous-benchmark-trend", trend.outPath ?? path.join(historyDir, `${benchmarkId}.benchmark-trend.json`), false);
  await pushControllerArtifactOnce(state, "continuous-benchmark-trend-report", trend.reportPath ?? path.join(historyDir, `${benchmarkId}.benchmark-trend.md`), false);

  const capabilityStatus: ControllerBenchmarkResult["capabilityStatus"] = suite.caseCount === 0
    ? "missing"
    : suite.failCount > 0 || trend.trend === "regressing"
      ? "warning"
      : "covered";
  const outPath = path.join(state.rootDir, `${benchmarkId}.json`);
  const reportPath = path.join(state.rootDir, `${benchmarkId}.md`);
  const result: ControllerBenchmarkResult = {
    schemaVersion: 1,
    generatedAtIso: nowIso(),
    benchmarkId,
    runId: state.runId,
    statePath: state.statePath,
    suiteDir,
    historyDir,
    suite: {
      caseCount: suite.caseCount,
      passCount: suite.passCount,
      warningCount: suite.warningCount,
      failCount: suite.failCount,
      meanScore: suite.meanScore,
      regressions: suite.regressions,
      nextAction: suite.nextAction,
      outPath: suite.outPath,
      reportPath: suite.reportPath,
    },
    trend: {
      runCount: trend.runCount,
      latestScore: trend.latestScore,
      previousScore: trend.previousScore,
      delta: trend.delta,
      trend: trend.trend,
      regressions: trend.regressions,
      nextAction: trend.nextAction,
      outPath: trend.outPath,
      reportPath: trend.reportPath,
    },
    capabilityStatus,
    attachedArtifacts: state.artifacts
      .filter(item => ["continuous-benchmark-suite", "continuous-benchmark-suite-report", "continuous-benchmark-trend", "continuous-benchmark-trend-report"].includes(item.kind))
      .map(item => ({ kind: item.kind, path: item.path, sha256: item.sha256 })),
    nextAction: capabilityStatus === "covered"
      ? "Continuous benchmark evidence is attached; rerun controller-capabilities or controller-goal-audit to prove regression coverage."
      : suite.caseCount === 0
        ? "Add representative run directories to the benchmark suite, then rerun controller-benchmark."
        : "Review benchmark regressions or trend warnings before promoting framework changes.",
    outPath,
    reportPath,
  };
  await writeJson(outPath, { schemaVersion: 1, controllerBenchmark: result });
  await writeFile(reportPath, renderControllerBenchmarkMarkdown(result));
  await pushControllerArtifactOnce(state, "controller-benchmark", outPath, false);
  await pushControllerArtifactOnce(state, "controller-benchmark-report", reportPath, false);
  await persistState(state);
  return result;
}

export async function researchControllerCompletionAuditCommand(opts: {
  statePath: string;
  reason?: string;
}): Promise<ControllerCompletionAudit> {
  const state = await readControllerState(opts.statePath);
  const audit = await writeControllerCompletionAudit(state);
  await pushControllerArtifactOnce(state, "controller-completion-audit", audit.outPath, true);
  await pushControllerArtifactOnce(state, "controller-completion-audit-report", audit.reportPath, false);
  await writeControllerExecutionAgenda(state, opts.reason ?? "completion_audit");
  await persistState(state);
  return audit;
}

export async function researchControllerGoldenPacketCommand(opts: {
  statePath: string;
  reason?: string;
}): Promise<ControllerGoldenPacket> {
  const state = await readControllerState(opts.statePath);
  const completionAudit = await loadLatestArtifactPayload<ControllerCompletionAudit>(state, "controller-completion-audit", "controllerCompletionAudit");
  const selfEvaluation = await loadLatestArtifactPayload<ControllerSelfEvaluation>(state, "controller-self-evaluation", "controllerSelfEvaluation");
  const inspectionRaw = await readJsonIfPresent(path.join(state.inputs.runDir, "run-inspection.json"));
  const inspectionReadiness = String(valueAtPath(inspectionRaw, "runInspection.readiness") ?? valueAtPath(inspectionRaw, "readiness") ?? "") || null;
  let packet: ControllerGoldenPacket;
  if (completionAudit && selfEvaluation) {
    const reviewVerdict = String(valueAtPath(await readJsonIfPresent(path.join(state.inputs.runDir, "review", "review-adjudication.json")), "reviewAdjudication.verdict") ?? "");
    const reviewPromotion = externalReviewPromotionStatus(state, reviewVerdict);
    const ready = inspectionReadiness === "local_review_ready"
      && completionAudit.status !== "fail"
      && selfEvaluation.status !== "fail"
      && reviewPromotion.promotionSatisfied;
    packet = await writeControllerGoldenPacket(state, {
      ready,
      inspectionReadiness,
      reviewVerdict: reviewVerdict || null,
      completionAudit,
      selfEvaluation,
    });
  } else {
    const handoffPath = path.join(state.rootDir, "controller-terminal-handoff.json");
    const handoffReportPath = path.join(state.rootDir, "controller-terminal-handoff.md");
    const reentryPlan = await writeControllerReentryPlan(state);
    const handoff = await buildTerminalHandoff(state, handoffPath, handoffReportPath, reentryPlan);
    packet = await writeControllerTerminalGoldenPacket(state, handoff);
  }
  await pushControllerArtifactOnce(state, "controller-golden-packet", packet.outPath, state.status === "complete");
  await pushControllerArtifactOnce(state, "controller-golden-packet-report", packet.reportPath, false);
  state.nextRecommendedAction = opts.reason ? `${packet.nextAction} (${opts.reason})` : packet.nextAction;
  await persistState(state);
  return packet;
}

export async function researchControllerRepairCycleCommand(opts: {
  statePath: string;
  reason?: string;
  maxSteps?: number;
  force?: boolean;
  env?: NodeJS.ProcessEnv;
  fetchImpl?: typeof fetch;
}): Promise<ControllerRepairCycleResult> {
  let state = await readControllerState(opts.statePath);
  const beforeStage = state.currentStage;
  const beforeStatus = state.status;
  const reentryPlan = await writeControllerReentryPlan(state);
  await pushControllerArtifactOnce(state, "controller-reentry-plan", reentryPlan.outPath, state.status !== "blocked");
  await pushControllerArtifactOnce(state, "controller-reentry-plan-report", reentryPlan.reportPath, false);
  let status: ControllerRepairCycleResult["status"] = "blocked";
  let reason = "";
  let runResultPath: string | null = null;
  let completionAuditPath: string | null = null;

  if (reentryPlan.status === "complete_no_reentry" || state.status === "complete") {
    status = "complete";
    reason = "Controller run is already complete; repair cycle is not needed.";
  } else if (reentryPlan.status === "patch_then_resume" || reentryPlan.status === "new_run_required") {
    status = "blocked";
    reason = `Repair cycle cannot proceed from re-entry status ${reentryPlan.status}; human patch or new run is required.`;
  } else if (!state.policy.allowAutoRepair || state.policy.autonomy !== "aggressive") {
    status = "blocked";
    reason = "Bounded repair cycle requires auto-repair to be enabled with aggressive autonomy.";
  } else if (repairAttemptCount(state) >= state.policy.maxAutoRepairs) {
    status = "blocked";
    reason = `Auto-repair attempt ceiling reached (${state.policy.maxAutoRepairs}).`;
  } else if (!reentryPlan.autoRepairEligible && state.currentStage !== "repair" && !opts.force) {
    status = "skipped";
    reason = "Re-entry plan is not auto-repair eligible and the controller is not currently at the repair stage.";
  } else {
    if (state.currentStage !== "repair" || state.status !== "running") {
      state.currentStage = "repair";
      state.status = "running";
      state.stopReason = null;
      state.nextRecommendedAction = "Run bounded repair cycle from public controller-repair-cycle command.";
      await persistState(state);
    } else {
      await persistState(state);
    }
    const run = await researchControllerRunCommand({
      statePath: state.statePath,
      question: state.inputs.question,
      outDir: state.rootDir,
      maxSteps: Math.max(1, opts.maxSteps ?? 4),
      env: opts.env,
      fetchImpl: opts.fetchImpl,
    });
    state = run.state;
    const invocation = state.artifacts.filter(item => item.kind === "controller-run-invocation").at(-1);
    runResultPath = invocation?.path ?? null;
    const completionAudit = await writeControllerCompletionAudit(state);
    await pushControllerArtifactOnce(state, "controller-completion-audit", completionAudit.outPath, true);
    await pushControllerArtifactOnce(state, "controller-completion-audit-report", completionAudit.reportPath, false);
    completionAuditPath = completionAudit.outPath;
    status = state.repairs.length > 0 || state.actions.some(action => action.action === "apply_repairs")
      ? "repaired"
      : "skipped";
    reason = status === "repaired"
      ? `Repair cycle ran bounded repairs and stopped at ${state.currentStage}/${state.status}.`
      : `Repair cycle ran but no repair execution was recorded; stopped at ${state.currentStage}/${state.status}.`;
  }

  const runResultReportPath = runResultPath ? latestArtifactPath(state, "controller-run-invocation-report") : null;
  const completionAuditReportPath = completionAuditPath ? latestArtifactPath(state, "controller-completion-audit-report") : null;
  const cycleId = `controller_repair_cycle_${String(state.artifacts.filter(item => item.kind === "controller-repair-cycle").length + 1).padStart(3, "0")}`;
  const outPath = path.join(state.rootDir, `${cycleId}.json`);
  const reportPath = path.join(state.rootDir, `${cycleId}.md`);
  const result: ControllerRepairCycleResult = {
    schemaVersion: 1,
    generatedAtIso: nowIso(),
    cycleId,
    runId: state.runId,
    statePath: state.statePath,
    status,
    beforeStage,
    beforeStatus,
    reentryPlanPath: reentryPlan.outPath,
    reentryPlanReportPath: reentryPlan.reportPath,
    reentryStatus: reentryPlan.status,
    autoRepairEligible: reentryPlan.autoRepairEligible,
    repairPlugin: reentryPlan.repairPlugin,
    runResultPath,
    runResultReportPath,
    completionAuditPath,
    completionAuditReportPath,
    afterStage: state.currentStage,
    afterStatus: state.status,
    reason,
    state,
    outPath,
    reportPath,
  };
  await writeJson(outPath, { schemaVersion: 1, controllerRepairCycle: result });
  await writeFile(reportPath, renderControllerRepairCycleMarkdown(result));
  await pushControllerArtifactOnce(state, "controller-repair-cycle", outPath, false);
  await pushControllerArtifactOnce(state, "controller-repair-cycle-report", reportPath, false);
  await persistState(state);
  result.state = state;
  await writeJson(outPath, { schemaVersion: 1, controllerRepairCycle: result });
  await writeFile(reportPath, renderControllerRepairCycleMarkdown(result));
  return result;
}

export async function researchControllerDoctorCommand(opts: {
  statePath: string;
  reason?: string;
}): Promise<ControllerDoctorResult> {
  const reason = opts.reason ?? "controller_doctor";
  await researchControllerAuditCommand({ statePath: opts.statePath, reason: `${reason} operator_audit` });
  await researchControllerCompletionAuditCommand({ statePath: opts.statePath, reason: `${reason} completion_audit` });
  const runnerPacket = await researchControllerRunnerPacketCommand({ statePath: opts.statePath, reason: `${reason} runner_packet` });
  const capabilities = await researchControllerCapabilitiesCommand({ statePath: opts.statePath, reason: `${reason} capabilities` });
  let state = await readControllerState(opts.statePath);
  const reentryPlan = await writeControllerReentryPlan(state);
  await pushControllerArtifactOnce(state, "controller-reentry-plan", reentryPlan.outPath, state.status !== "blocked");
  await pushControllerArtifactOnce(state, "controller-reentry-plan-report", reentryPlan.reportPath, false);
  await persistState(state);
  state = await readControllerState(opts.statePath);
  const latestOperatorAudit = await loadLatestArtifactPayload<ControllerOperatorAudit>(state, "controller-operator-audit", "controllerOperatorAudit");
  const latestCompletionAudit = await loadLatestArtifactPayload<ControllerCompletionAudit>(state, "controller-completion-audit", "controllerCompletionAudit");
  const operatorAudit = latestOperatorAudit ?? await buildControllerOperatorAudit(state, await writeControllerExecutionAgenda(state, `${reason} fallback_agenda`), reason);
  const completionAudit = latestCompletionAudit ?? await buildControllerCompletionAudit(state);
  const failedChecks = operatorAudit.checks.filter(check => check.status === "fail").map(check => check.id);
  const warningChecks = operatorAudit.checks.filter(check => check.status === "warning").map(check => check.id);
  const failedRequirementRecords = completionAudit.requirements.filter(item => item.status === "failed");
  const warningRequirementRecords = completionAudit.requirements.filter(item => item.status === "warning");
  const failedRequirements = failedRequirementRecords.map(item => item.id);
  const warningRequirements = warningRequirementRecords.map(item => item.id);
  const failedRequirementDetails = failedRequirementRecords.map(completionRequirementDoctorDetail);
  const warningRequirementDetails = warningRequirementRecords.map(completionRequirementDoctorDetail);
  const missingCapabilityIds = capabilities.entries.filter(item => item.status === "missing").map(item => item.id);
  const latestSupervisor = latestArtifactRefs(state, "controller-supervisor", "controller-supervisor-report");
  const latestRepairCycle = latestArtifactRefs(state, "controller-repair-cycle", "controller-repair-cycle-report");
  const missingRequiredHashes = state.artifacts.filter(item => item.requiredForPromotion && !item.sha256).map(item => item.path);
  const totalBudget = state.policy.reviewerBudget.maxStudyLoopUsd + state.policy.controllerBudget.maxStudyLoopUsd;
  const withinBudget = state.costEstimateUsd <= totalBudget;
  const completionFailuresAreBlocking = state.status !== "running" || state.currentStage === "promotion_decision" || state.currentStage === "complete";
  const blockers = uniqueText([
    ...failedChecks.map(id => `Operator audit failed check: ${id}`),
    ...(completionFailuresAreBlocking ? failedRequirementDetails.map(detail => completionRequirementDoctorMessage("Completion audit failed requirement", detail)) : []),
    ...missingRequiredHashes.map(file => `Required promotion artifact has no hash: ${file}`),
    withinBudget ? null : `Estimated controller/reviewer cost ${state.costEstimateUsd.toFixed(4)} exceeds budget ${totalBudget.toFixed(4)}.`,
  ].filter((item): item is string => Boolean(item)));
  const warnings = uniqueText([
    ...warningChecks.map(id => `Operator audit warning: ${id}`),
    ...(!completionFailuresAreBlocking ? failedRequirementDetails.map(detail => completionRequirementDoctorMessage("Incomplete completion evidence while still running", detail)) : []),
    ...warningRequirementDetails.map(detail => completionRequirementDoctorMessage("Completion audit warning", detail)),
    ...completionAudit.missingEvidence.map(id => `Missing completion evidence: ${id}`),
    ...missingCapabilityIds.map(id => `Capability evidence not yet covered: ${id}`),
    capabilities.summary.available ? `${capabilities.summary.available} capability entries are available but not yet exercised.` : null,
  ].filter((item): item is string => Boolean(item)));
  const activeIssueCodes = uniqueText([
    ...runnerPacket.activeIssueCodes,
    ...blockers.flatMap(issueCodesFromText),
    ...warnings.flatMap(issueCodesFromText),
  ]);
  const activeBlockerIssueCodes = enforceableControllerBlockerCodes([
    ...runnerPacket.activeBlockerIssueCodes,
    ...blockers.flatMap(issueCodesFromText),
  ]);
  const safeToAutoContinue = runnerPacket.safeToAutoExecute && blockers.length === 0 && operatorAudit.readiness === "ready_to_follow";
  const status: ControllerDoctorResult["status"] = state.status === "complete" || operatorAudit.readiness === "complete" || runnerPacket.status === "complete"
    ? "complete"
    : blockers.length || operatorAudit.readiness === "blocked" || runnerPacket.status === "blocked"
      ? "blocked"
      : safeToAutoContinue
        ? "ready_to_continue"
        : "needs_review";
  const recommendedCommand = status === "complete"
    ? `agenteer research controller-status --state ${quotePath(state.statePath)}`
    : safeToAutoContinue
      ? runnerPacket.recommendedCommand
      : operatorAudit.nextCommand || runnerPacket.recommendedCommand || reentryPlan.commands[0] || `agenteer research controller-status --state ${quotePath(state.statePath)}`;
  const doctorId = `controller_doctor_${String(state.artifacts.filter(item => item.kind === "controller-doctor").length + 1).padStart(3, "0")}`;
  const outPath = path.join(state.rootDir, `${doctorId}.json`);
  const reportPath = path.join(state.rootDir, `${doctorId}.md`);
  const result: ControllerDoctorResult = {
    schemaVersion: 1,
    generatedAtIso: nowIso(),
    doctorId,
    runId: state.runId,
    statePath: state.statePath,
    status,
    currentStage: state.currentStage,
    controllerStatus: state.status,
    recommendedCommand,
    safeToAutoContinue,
    blockers,
    warnings,
    activeIssueCodes,
    activeBlockerIssueCodes,
    evidenceRefs: uniqueText([
      state.statePath,
      operatorAudit.outPath,
      operatorAudit.reportPath,
      completionAudit.outPath,
      completionAudit.reportPath,
      runnerPacket.outPath,
      runnerPacket.reportPath,
      runnerPacket.feasibilityReadiness.path,
      runnerPacket.datasetSemanticAudit.path,
      runnerPacket.datasetSemanticAudit.reportPath,
      capabilities.outPath,
      capabilities.reportPath,
      reentryPlan.outPath,
      reentryPlan.reportPath,
      latestSupervisor.latestPath,
      latestSupervisor.latestReportPath,
      latestRepairCycle.latestPath,
      latestRepairCycle.latestReportPath,
    ].filter((item): item is string => Boolean(item))),
    summaries: {
      operatorAudit: {
        status: operatorAudit.status,
        readiness: operatorAudit.readiness,
        failedChecks,
        warningChecks,
        path: operatorAudit.outPath,
        reportPath: operatorAudit.reportPath,
      },
      completionAudit: {
        status: completionAudit.status,
        readiness: completionAudit.readiness,
        failedRequirements,
        warningRequirements,
        failedRequirementDetails,
        warningRequirementDetails,
        missingEvidence: completionAudit.missingEvidence,
        path: completionAudit.outPath,
        reportPath: completionAudit.reportPath,
      },
      runnerPacket: {
        status: runnerPacket.status,
        recommendedCommand: runnerPacket.recommendedCommand,
        safeToAutoExecute: runnerPacket.safeToAutoExecute,
        feasibilityReadiness: runnerPacket.feasibilityReadiness,
        datasetSemanticAudit: runnerPacket.datasetSemanticAudit,
        path: runnerPacket.outPath,
        reportPath: runnerPacket.reportPath,
      },
      capabilities: {
        ...capabilities.summary,
        missingIds: missingCapabilityIds,
        path: capabilities.outPath,
        reportPath: capabilities.reportPath,
      },
      reentryPlan: {
        status: reentryPlan.status,
        recommendedStage: reentryPlan.recommendedStage,
        autoRepairEligible: reentryPlan.autoRepairEligible,
        repairPlugin: reentryPlan.repairPlugin,
        path: reentryPlan.outPath,
        reportPath: reentryPlan.reportPath,
      },
      supervisor: latestSupervisor,
      repairCycle: latestRepairCycle,
      artifacts: {
        total: state.artifacts.length,
        requiredForPromotion: state.artifacts.filter(item => item.requiredForPromotion).length,
        missingRequiredHashes,
      },
      cost: {
        estimatedUsd: state.costEstimateUsd,
        reviewerBudgetUsd: state.policy.reviewerBudget.maxStudyLoopUsd,
        controllerBudgetUsd: state.policy.controllerBudget.maxStudyLoopUsd,
        withinBudget,
      },
    },
    state,
    outPath,
    reportPath,
  };
  await writeJson(outPath, { schemaVersion: 1, controllerDoctor: result });
  await writeFile(reportPath, renderControllerDoctorMarkdown(result));
  await pushControllerArtifactOnce(state, "controller-doctor", outPath, false);
  await pushControllerArtifactOnce(state, "controller-doctor-report", reportPath, false);
  await persistState(state);
  result.state = state;
  await writeJson(outPath, { schemaVersion: 1, controllerDoctor: result });
  await writeFile(reportPath, renderControllerDoctorMarkdown(result));
  return result;
}

function completionRequirementDoctorDetail(requirement: ControllerCompletionAudit["requirements"][number]): { id: string; issueCodes: string[]; finding: string } {
  return {
    id: requirement.id,
    issueCodes: requirement.issueCodes ?? [],
    finding: requirement.finding,
  };
}

function completionRequirementDoctorMessage(prefix: string, detail: { id: string; issueCodes: string[]; finding: string }): string {
  const codes = detail.issueCodes.length ? ` [${detail.issueCodes.join(",")}]` : "";
  return `${prefix}: ${detail.id}${codes}${detail.finding ? ` - ${detail.finding}` : ""}`;
}

export async function researchControllerOperateCommand(opts: {
  statePath: string;
  reason?: string;
  maxCycles?: number;
  maxRounds?: number;
  maxIterationsPerRound?: number;
  maxStepsPerRun?: number;
  forceReviewRequired?: boolean;
  env?: NodeJS.ProcessEnv;
  fetchImpl?: typeof fetch;
}): Promise<ControllerOperateResult> {
  let state = await readControllerState(opts.statePath);
  const maxCycles = Math.max(1, opts.maxCycles ?? 4);
  const maxRounds = Math.max(1, opts.maxRounds ?? 3);
  const maxIterationsPerRound = Math.max(1, opts.maxIterationsPerRound ?? 3);
  const maxStepsPerRun = Math.max(1, opts.maxStepsPerRun ?? 4);
  const cycles: ControllerOperateCycle[] = [];
  let finalDoctor: ControllerDoctorResult | null = null;
  let stoppedReason = "";

  for (let i = 0; i < maxCycles; i += 1) {
    const beforeStage = state.currentStage;
    const beforeStatus = state.status;
    const doctor = await researchControllerDoctorCommand({
      statePath: state.statePath,
      reason: `${opts.reason ?? "controller_operate"} cycle ${i + 1} doctor`,
    });
    finalDoctor = doctor;
    state = doctor.state;
    const doctorFeasibility = doctor.summaries.runnerPacket.feasibilityReadiness;

    if (doctor.status === "complete") {
      const reason = "Doctor reports the controller run is complete.";
      cycles.push({
        cycle: i + 1,
        beforeStage,
        beforeStatus,
        doctorPath: doctor.outPath,
        doctorReportPath: doctor.reportPath,
        doctorStatus: doctor.status,
        doctorFeasibilityReadiness: doctorFeasibility.status,
        doctorFeasibilityVerdict: doctorFeasibility.verdict,
        doctorFeasibilityPath: doctorFeasibility.path,
        safeToAutoContinue: doctor.safeToAutoContinue,
        recommendedCommand: doctor.recommendedCommand,
        action: "stop",
        actionPath: null,
        actionReportPath: null,
        actionStatus: null,
        afterStage: state.currentStage,
        afterStatus: state.status,
        reason,
        issueCodes: [],
      });
      stoppedReason = reason;
      break;
    }

    const repairEligible = doctor.summaries.reentryPlan.status === "repair_then_resume" && doctor.summaries.reentryPlan.autoRepairEligible;
    if (doctor.safeToAutoContinue) {
      const supervised = await researchControllerSupervisorCommand({
        statePath: state.statePath,
        reason: `${opts.reason ?? "controller_operate"} cycle ${i + 1} supervise`,
        maxRounds,
        maxIterationsPerRound,
        maxStepsPerRun,
        forceReviewRequired: opts.forceReviewRequired,
        env: opts.env,
        fetchImpl: opts.fetchImpl,
      });
      state = supervised.state;
      const reason = supervised.stoppedReason;
      cycles.push({
        cycle: i + 1,
        beforeStage,
        beforeStatus,
        doctorPath: doctor.outPath,
        doctorReportPath: doctor.reportPath,
        doctorStatus: doctor.status,
        doctorFeasibilityReadiness: doctorFeasibility.status,
        doctorFeasibilityVerdict: doctorFeasibility.verdict,
        doctorFeasibilityPath: doctorFeasibility.path,
        safeToAutoContinue: doctor.safeToAutoContinue,
        recommendedCommand: doctor.recommendedCommand,
        action: "supervise",
        actionPath: supervised.outPath,
        actionReportPath: supervised.reportPath,
        actionStatus: supervised.terminal ? "terminal" : "stopped",
        afterStage: state.currentStage,
        afterStatus: state.status,
        reason,
        issueCodes: uniqueText([
          ...issueCodesFromText(reason),
          ...supervised.rounds.flatMap(round => round.followLoopIssueCodes),
        ]),
      });
      if (supervised.terminal || state.status !== "running") {
        stoppedReason = reason;
        break;
      }
      continue;
    }

    if (repairEligible || opts.forceReviewRequired && doctor.summaries.reentryPlan.status === "repair_then_resume") {
      const repaired = await researchControllerRepairCycleCommand({
        statePath: state.statePath,
        reason: `${opts.reason ?? "controller_operate"} cycle ${i + 1} repair_cycle`,
        maxSteps: maxStepsPerRun,
        force: opts.forceReviewRequired,
        env: opts.env,
        fetchImpl: opts.fetchImpl,
      });
      state = repaired.state;
      cycles.push({
        cycle: i + 1,
        beforeStage,
        beforeStatus,
        doctorPath: doctor.outPath,
        doctorReportPath: doctor.reportPath,
        doctorStatus: doctor.status,
        doctorFeasibilityReadiness: doctorFeasibility.status,
        doctorFeasibilityVerdict: doctorFeasibility.verdict,
        doctorFeasibilityPath: doctorFeasibility.path,
        safeToAutoContinue: doctor.safeToAutoContinue,
        recommendedCommand: doctor.recommendedCommand,
        action: "repair_cycle",
        actionPath: repaired.outPath,
        actionReportPath: repaired.reportPath,
        actionStatus: repaired.status,
        afterStage: state.currentStage,
        afterStatus: state.status,
        reason: repaired.reason,
        issueCodes: issueCodesFromText(repaired.reason),
      });
      if (repaired.status === "blocked" || repaired.status === "complete" || state.status !== "running") {
        stoppedReason = repaired.reason;
        break;
      }
      continue;
    }

    let reason = doctor.blockers.length
      ? `Doctor blocked autonomous operation: ${doctor.blockers.join("; ")}`
      : `Doctor requires review before continuing: ${doctor.warnings.slice(0, 3).join("; ") || doctor.recommendedCommand}`;
    const issueCodes = uniqueText([
      ...doctor.blockers.flatMap(issueCodesFromText),
      ...doctor.warnings.flatMap(issueCodesFromText),
      ...issueCodesFromText(reason),
    ]);
    if (issueCodes.length && !issueCodes.every(code => reason.includes(code))) {
      reason = `${reason} Issue codes: ${issueCodes.join(", ")}.`;
    }
    cycles.push({
      cycle: i + 1,
      beforeStage,
      beforeStatus,
      doctorPath: doctor.outPath,
      doctorReportPath: doctor.reportPath,
      doctorStatus: doctor.status,
      doctorFeasibilityReadiness: doctorFeasibility.status,
      doctorFeasibilityVerdict: doctorFeasibility.verdict,
      doctorFeasibilityPath: doctorFeasibility.path,
      safeToAutoContinue: doctor.safeToAutoContinue,
      recommendedCommand: doctor.recommendedCommand,
      action: "stop",
      actionPath: null,
      actionReportPath: null,
      actionStatus: null,
      afterStage: state.currentStage,
      afterStatus: state.status,
      reason,
      issueCodes,
    });
    stoppedReason = reason;
    break;
  }

  if (!stoppedReason) {
    stoppedReason = `Reached max controller operate cycles (${maxCycles}).`;
  }
  state = await readControllerState(state.statePath);
  const operateId = `controller_operate_${String(state.artifacts.filter(item => item.kind === "controller-operate").length + 1).padStart(3, "0")}`;
  const outPath = path.join(state.rootDir, `${operateId}.json`);
  const reportPath = path.join(state.rootDir, `${operateId}.md`);
  const status: ControllerOperateResult["status"] = state.status === "complete" || finalDoctor?.status === "complete"
    ? "complete"
    : cycles.length >= maxCycles && !cycles.some(item => item.action === "stop" && item.doctorStatus !== "ready_to_continue")
      ? "max_cycles"
      : state.status === "blocked" || finalDoctor?.status === "blocked"
        ? "blocked"
        : "stopped";
  const result: ControllerOperateResult = {
    schemaVersion: 1,
    generatedAtIso: nowIso(),
    operateId,
    runId: state.runId,
    statePath: state.statePath,
    status,
    maxCycles,
    maxRounds,
    maxIterationsPerRound,
    maxStepsPerRun,
    cycles,
    finalDoctorPath: finalDoctor?.outPath ?? null,
    finalDoctorStatus: finalDoctor?.status ?? null,
    stoppedReason,
    state,
    outPath,
    reportPath,
  };
  await writeJson(outPath, { schemaVersion: 1, controllerOperate: result });
  await writeFile(reportPath, renderControllerOperateMarkdown(result));
  await pushControllerArtifactOnce(state, "controller-operate", outPath, false);
  await pushControllerArtifactOnce(state, "controller-operate-report", reportPath, false);
  await persistState(state);
  result.state = state;
  await writeJson(outPath, { schemaVersion: 1, controllerOperate: result });
  await writeFile(reportPath, renderControllerOperateMarkdown(result));
  return result;
}

export async function researchControllerRunbookCommand(opts: {
  statePath: string;
  reason?: string;
}): Promise<ControllerLaunchRunbook> {
  const reason = opts.reason ?? "controller_runbook";
  const doctor = await researchControllerDoctorCommand({ statePath: opts.statePath, reason: `${reason} doctor` });
  let state = await readControllerState(opts.statePath);
  const rawRunnerPacket = await readJsonIfPresent(doctor.summaries.runnerPacket.path);
  const runnerPacket = (valueAtPath(rawRunnerPacket, "controllerModelRunnerPacket") ?? rawRunnerPacket) as ControllerModelRunnerPacket | null;
  const rawEnvironment = await readJsonIfPresent(doctor.summaries.operatorAudit.path);
  const audit = (valueAtPath(rawEnvironment, "controllerOperatorAudit") ?? rawEnvironment) as ControllerOperatorAudit | null;
  const environment = audit?.environment ?? {
    status: "fail",
    readiness: "blocked",
    repoRoot: process.cwd(),
    nodeVersion: null,
    npmVersion: null,
    packageScripts: { build: false, test: false },
  } as ControllerEnvironmentPreflight;
  const runbookId = `controller_runbook_${String(state.artifacts.filter(item => item.kind === "controller-runbook").length + 1).padStart(3, "0")}`;
  const outPath = path.join(state.rootDir, `${runbookId}.json`);
  const reportPath = path.join(state.rootDir, `${runbookId}.md`);
  const firstReadCommand = `agenteer research controller-status --state ${quotePath(state.statePath)}`;
  const launchCommand = `agenteer research controller-operate --state ${quotePath(state.statePath)} --max-cycles 4 --max-rounds 3 --max-iterations-per-round 3 --max-steps-per-run 4`;
  const readinessCommand = `agenteer research controller-doctor --state ${quotePath(state.statePath)}`;
  const inspectionCommand = `agenteer research controller-inspect --state ${quotePath(state.statePath)}`;
  const requiredEnvVars = requiredEnvVarsForControllerPolicy(state.policy);
  const optionalEnvWarnings = optionalEnvWarningsForControllerPolicy(state.policy, requiredEnvVars);
  const readyToLaunch = doctor.safeToAutoContinue && doctor.status === "ready_to_continue" && environment.readiness !== "blocked" && doctor.blockers.length === 0 && Boolean(runnerPacket?.safeToAutoExecute);
  const launchBlockers = buildControllerRunbookLaunchBlockers(doctor, environment, runnerPacket);
  const activeIssueCodes = uniqueText([
    ...doctor.activeIssueCodes,
    ...(runnerPacket?.activeIssueCodes ?? []),
    ...launchBlockers.flatMap(item => item.issueCodes),
  ]);
  const activeBlockerIssueCodes = enforceableControllerBlockerCodes([
    ...doctor.activeBlockerIssueCodes,
    ...(runnerPacket?.activeBlockerIssueCodes ?? []),
    ...launchBlockers.filter(item => item.severity === "blocker").flatMap(item => item.issueCodes),
  ]);
  const status: ControllerLaunchRunbook["status"] = doctor.status === "complete"
    ? "complete"
    : doctor.status === "blocked" || environment.readiness === "blocked"
      ? "blocked"
      : readyToLaunch
        ? "ready"
        : "review";
  const packageScripts = [
    environment.packageScripts?.build ? "build" : null,
    environment.packageScripts?.test ? "test" : null,
  ].filter((item): item is string => Boolean(item));
  const allowedCommands = uniqueText([
    ...(runnerPacket?.allowedCommands ?? []),
    firstReadCommand,
    readinessCommand,
    launchCommand,
    inspectionCommand,
    `agenteer research controller-runbook --state ${quotePath(state.statePath)}`,
    `agenteer research controller-completion-audit --state ${quotePath(state.statePath)}`,
  ]);
  const forbiddenActions = uniqueText([
    ...(runnerPacket?.forbiddenActions ?? []),
    "Do not use shell commands, BigQuery, cloud runners, or network calls outside declared controller tools and policy gates.",
    "Do not edit read-only domain repositories, source data, credentials, or external datasets from a runbook launch.",
    "Do not treat the runbook as proof of study validity; it is a launch envelope that still requires downstream QA and completion audit.",
  ]);
  const recoveryCommands = uniqueText([
    firstReadCommand,
    readinessCommand,
    ...(runnerPacket?.agendaCommands ?? []),
    `agenteer research controller-repair-cycle --state ${quotePath(state.statePath)} --max-steps 4`,
    `agenteer research controller-resume --state ${quotePath(state.statePath)}`,
    inspectionCommand,
  ]);
  const verificationCommands = uniqueText([
    readinessCommand,
    `agenteer research controller-completion-audit --state ${quotePath(state.statePath)}`,
    `agenteer research controller-goal-audit --state ${quotePath(state.statePath)}`,
    `agenteer research controller-benchmark --state ${quotePath(state.statePath)}`,
    "npm run build",
    "npm test -- packages/cli/tests/research-controller.test.ts",
  ]);
  const latestRepairVerificationPath = latestArtifactPath(state, "controller-repair-verification");
  const latestRepairVerificationReportPath = latestArtifactPath(state, "controller-repair-verification-report");
  const handoffArtifacts: ControllerLaunchRunbook["handoffArtifacts"] = {
    doctor: { path: doctor.outPath, reportPath: doctor.reportPath },
    runnerPacket: { path: doctor.summaries.runnerPacket.path, reportPath: doctor.summaries.runnerPacket.reportPath },
    operatorAudit: { path: doctor.summaries.operatorAudit.path, reportPath: doctor.summaries.operatorAudit.reportPath },
    environment: { path: environment.outPath ?? null, reportPath: environment.reportPath ?? null },
    completionAudit: { path: doctor.summaries.completionAudit.path, reportPath: doctor.summaries.completionAudit.reportPath },
    capabilities: { path: doctor.summaries.capabilities.path, reportPath: doctor.summaries.capabilities.reportPath },
    reentryPlan: { path: doctor.summaries.reentryPlan.path, reportPath: doctor.summaries.reentryPlan.reportPath },
    supervisor: { path: doctor.summaries.supervisor.latestPath, reportPath: doctor.summaries.supervisor.latestReportPath },
    repairCycle: { path: doctor.summaries.repairCycle.latestPath, reportPath: doctor.summaries.repairCycle.latestReportPath },
    repairVerification: { path: latestRepairVerificationPath, reportPath: latestRepairVerificationReportPath },
  };
  const artifactsToInspect = uniqueText([
    state.statePath,
    ...Object.values(handoffArtifacts).flatMap(item => [item.path, item.reportPath]),
    state.inputs.runDir,
  ].filter((item): item is string => Boolean(item)));
  const stopCriteria = [
    "Stop immediately if controller-doctor reports blocked or safeToAutoContinue=false without an explicit human override.",
    "Stop when controller-operate returns complete, blocked, or review-required status.",
    "Stop if cost estimates exceed controller or reviewer study-loop budgets.",
    "Stop if artifact hashes, required promotion artifacts, method QA, manuscript QA, external reviewer adjudication, or feasibility gates fail.",
    "Stop if reviewer-driven repairs exist but controller-repair-verification is missing, failed, or stale.",
    "Stop if the recommended next action would edit protected paths, credentials, source data, or read-only domain repositories.",
    "Stop after the configured operate cycle limits even when progress is being made; refresh this runbook before another unattended launch.",
  ];
  const handoffPrompt = [
    "You are a fresh autonomous Research Controller runner for Agenteer.",
    "Start from this runbook, the controller-state.json file, and the referenced evidence only.",
    `First-read command: ${firstReadCommand}`,
    "Use controller-status before launch/resume decisions; if gathered through controller-run-agenteer, use recentToolResults.controllerStatus as structured readiness evidence.",
    `Readiness command: ${readinessCommand}`,
    `Launch command: ${launchCommand}`,
    `Ready to launch now: ${readyToLaunch}`,
    "After every launch, regenerate controller-doctor or this runbook before continuing.",
    "If any blocker or stop criterion appears, stop and report the exact artifact path and reason.",
  ].join("\n");
  const runbook: ControllerLaunchRunbook = {
    schemaVersion: 1,
    generatedAtIso: nowIso(),
    runbookId,
    runId: state.runId,
    statePath: state.statePath,
    status,
    readyToLaunch,
    activeIssueCodes,
    activeBlockerIssueCodes,
    launchBlockers,
    defaultControllerModel: `${state.policy.controller.provider}:${state.policy.controller.model}`,
    strictModelRecommended: state.policy.requireControllerModel || state.policy.controller.enabled || Boolean(runnerPacket?.strictModelRecommended),
    firstReadCommand,
    launchCommand,
    readinessCommand,
    inspectionCommand,
    recoveryCommands,
    verificationCommands,
    allowedCommands,
    forbiddenActions,
    stopCriteria,
    safetyEnvelope: {
      autonomy: state.policy.autonomy,
      maxControllerCostUsd: state.policy.controllerBudget.maxStudyLoopUsd,
      maxReviewerCostUsd: state.policy.reviewerBudget.maxStudyLoopUsd,
      maxAutoRepairs: state.policy.maxAutoRepairs,
      allowSourceEdits: state.policy.allowToolActions && state.policy.allowedToolIds.some(tool => tool.includes("patch")),
      allowExternalReview: state.policy.allowExternalReview || state.policy.requireExternalReviewForPromotion,
      allowLiteratureSearch: state.policy.allowLiterature,
      protectedPaths: uniqueText([
        state.policy.contextRepo,
        state.inputs.datasetDir,
      ].filter((item): item is string => Boolean(item))),
    },
    environment: {
      repoRoot: environment.repoRoot,
      readiness: environment.readiness,
      status: environment.status,
      nodeVersion: environment.nodeVersion,
      npmVersion: environment.npmVersion,
      packageScripts,
      requiredEnvVars,
      optionalEnvWarnings,
    },
    cost: doctor.summaries.cost,
    doctor: {
      status: doctor.status,
      safeToAutoContinue: doctor.safeToAutoContinue,
      recommendedCommand: doctor.recommendedCommand,
      blockers: doctor.blockers,
      warnings: doctor.warnings,
      activeIssueCodes: doctor.activeIssueCodes,
      activeBlockerIssueCodes: doctor.activeBlockerIssueCodes,
      outPath: doctor.outPath,
      reportPath: doctor.reportPath,
    },
    runnerPacket: {
      status: runnerPacket?.status ?? doctor.summaries.runnerPacket.status,
      recommendedCommand: runnerPacket?.recommendedCommand ?? doctor.summaries.runnerPacket.recommendedCommand,
      safeToAutoExecute: runnerPacket?.safeToAutoExecute ?? doctor.summaries.runnerPacket.safeToAutoExecute,
      activeIssueCodes: runnerPacket?.activeIssueCodes ?? [],
      activeBlockerIssueCodes: runnerPacket?.activeBlockerIssueCodes ?? [],
      feasibilityReadiness: runnerPacket?.feasibilityReadiness ?? doctor.summaries.runnerPacket.feasibilityReadiness,
      datasetSemanticAudit: runnerPacket?.datasetSemanticAudit ?? await loadControllerDatasetSemanticAuditSummary(state),
      path: doctor.summaries.runnerPacket.path,
      reportPath: doctor.summaries.runnerPacket.reportPath,
    },
    capabilities: {
      covered: doctor.summaries.capabilities.covered,
      missing: doctor.summaries.capabilities.missing,
      available: doctor.summaries.capabilities.available,
      missingIds: doctor.summaries.capabilities.missingIds,
      path: doctor.summaries.capabilities.path,
      reportPath: doctor.summaries.capabilities.reportPath,
    },
    handoffArtifacts,
    artifactsToInspect,
    evidenceRefs: uniqueText([
      ...doctor.evidenceRefs,
      ...(runnerPacket?.evidenceRefs ?? []),
      ...artifactsToInspect,
    ]),
    handoffPrompt,
    outPath,
    reportPath,
  };
  await writeJson(outPath, { schemaVersion: 1, controllerRunbook: runbook });
  await writeFile(reportPath, renderControllerRunbookMarkdown(runbook));
  await pushControllerArtifactOnce(state, "controller-runbook", outPath, false);
  await pushControllerArtifactOnce(state, "controller-runbook-report", reportPath, false);
  await persistState(state);
  state = await readControllerState(state.statePath);
  await writeJson(outPath, { schemaVersion: 1, controllerRunbook: runbook });
  await writeFile(reportPath, renderControllerRunbookMarkdown(runbook));
  return runbook;
}

export async function researchControllerStatusCommand(opts: {
  statePath: string;
  reason?: string;
}): Promise<ControllerUnifiedStatus> {
  const reason = opts.reason ?? "controller_status";
  const goldenPacket = await researchControllerGoldenPacketCommand({
    statePath: opts.statePath,
    reason: `${reason} golden_packet`,
  });
  const runbook = await researchControllerRunbookCommand({
    statePath: opts.statePath,
    reason: `${reason} runbook`,
  });
  let state = await readControllerState(opts.statePath);
  const activeIssueCodes = uniqueText([
    ...goldenPacket.activeIssueCodes,
    ...runbook.activeIssueCodes,
  ]);
  const activeBlockerIssueCodes = enforceableControllerBlockerCodes([
    ...goldenPacket.activeBlockerIssueCodes,
    ...runbook.activeBlockerIssueCodes,
  ]);
  const goldenOperationalBlockers = goldenPacket.issueSummary
    .filter(item => item.severity === "blocker" && item.category !== "completion_audit" && item.category !== "self_evaluation")
    .map(item => item.message);
  const launchOperationalBlockers = runbook.launchBlockers
    .filter(item => item.severity === "blocker" && item.category !== "completion_audit")
    .map(item => item.message);
  const completionReadinessBlockers = uniqueText([
    ...goldenPacket.issueSummary
      .filter(item => item.severity === "blocker" && (item.category === "completion_audit" || item.category === "self_evaluation"))
      .map(item => item.message),
    ...runbook.launchBlockers
      .filter(item => item.severity === "blocker" && item.category === "completion_audit")
      .map(item => item.message),
  ]);
  const doctorOperationalBlockers = runbook.doctor.status === "blocked" ? runbook.doctor.blockers : [];
  const reviewRequiredFindings = uniqueText([
    ...(runbook.doctor.status === "blocked" ? [] : runbook.doctor.blockers),
    ...goldenOperationalBlockers,
  ]);
  const blockers = uniqueText([
    ...doctorOperationalBlockers,
    ...launchOperationalBlockers,
  ]);
  const warnings = uniqueText([
    ...completionReadinessBlockers.map(item => `Completion evidence pending: ${item}`),
    ...reviewRequiredFindings.map(item => `Review required: ${item}`),
    ...goldenPacket.warnings,
    ...runbook.doctor.warnings,
    ...runbook.launchBlockers.filter(item => item.severity === "warning").map(item => item.message),
    ...runbook.environment.optionalEnvWarnings,
  ]);
  const status: ControllerUnifiedStatus["status"] = runbook.status === "complete" || goldenPacket.status === "complete"
    ? "complete"
    : activeBlockerIssueCodes.length || runbook.status === "blocked" || blockers.length
      ? "blocked"
      : runbook.readyToLaunch
        ? "ready"
        : "review";
  const recommendedCommand = status === "complete"
    ? runbook.inspectionCommand
    : status === "ready"
      ? runbook.launchCommand
      : runbook.doctor.recommendedCommand || runbook.readinessCommand;
  const nextAction = status === "complete"
    ? "Inspect completed artifacts before external sharing."
    : status === "ready"
      ? "Run the launch command or controller-operate within the runbook safety envelope."
      : activeBlockerIssueCodes.length
        ? `Resolve active blocker issue codes before autonomous continuation: ${activeBlockerIssueCodes.join(", ")}.`
        : goldenPacket.nextAction || "Review warnings and regenerate controller-status before launch.";
  const statusId = `controller_status_${String(state.artifacts.filter(item => item.kind === "controller-status").length + 1).padStart(3, "0")}`;
  const outPath = path.join(state.rootDir, `${statusId}.json`);
  const reportPath = path.join(state.rootDir, `${statusId}.md`);
  const result: ControllerUnifiedStatus = {
    schemaVersion: 1,
    generatedAtIso: nowIso(),
    statusId,
    runId: state.runId,
    statePath: state.statePath,
    controllerStatus: state.status,
    currentStage: state.currentStage,
    status,
    safeToAutoContinue: runbook.doctor.safeToAutoContinue,
    readyToLaunch: runbook.readyToLaunch,
    promotable: goldenPacket.readiness.promotable,
    activeIssueCodes,
    activeBlockerIssueCodes,
    blockers,
    warnings,
    recommendedCommand,
    launchCommand: status === "complete" ? null : runbook.launchCommand,
    inspectionCommand: runbook.inspectionCommand,
    nextAction,
    summary: {
      doctorStatus: runbook.doctor.status,
      runbookStatus: runbook.status,
      goldenPacketStatus: goldenPacket.status,
      completionAudit: goldenPacket.readiness.completionAudit,
      selfEvaluation: goldenPacket.readiness.selfEvaluation,
      promotionDecision: goldenPacket.readiness.promotionDecision,
      runInspection: goldenPacket.readiness.runInspection,
      feasibilityReadiness: goldenPacket.readiness.feasibilityReadiness,
      feasibilityVerdict: goldenPacket.readiness.feasibilityVerdict,
      datasetSemanticAudit: runbook.runnerPacket.datasetSemanticAudit,
      capabilityMissingIds: runbook.capabilities.missingIds,
      cost: runbook.cost,
    },
    artifactPaths: {
      doctor: runbook.doctor.outPath,
      doctorReport: runbook.doctor.reportPath,
      runbook: runbook.outPath,
      runbookReport: runbook.reportPath,
      goldenPacket: goldenPacket.outPath,
      goldenPacketReport: goldenPacket.reportPath,
      runnerPacket: runbook.runnerPacket.path,
      runnerPacketReport: runbook.runnerPacket.reportPath,
      completionAudit: runbook.doctor.outPath ? runbook.artifactsToInspect.find(item => item.endsWith("controller-completion-audit.json")) ?? "" : "",
      completionAuditReport: runbook.artifactsToInspect.find(item => item.endsWith("controller-completion-audit.md")) ?? "",
      capabilityManifest: runbook.capabilities.path,
      capabilityManifestReport: runbook.capabilities.reportPath,
    },
    keyArtifactReports: goldenPacket.keyArtifactReports,
    evidenceRefs: uniqueText([
      goldenPacket.outPath,
      goldenPacket.reportPath,
      runbook.outPath,
      runbook.reportPath,
      ...runbook.evidenceRefs,
      ...goldenPacket.issueSummary.flatMap(item => item.evidenceRefs),
    ]),
    state,
    outPath,
    reportPath,
  };
  await writeJson(outPath, { schemaVersion: 1, controllerStatus: result });
  await writeFile(reportPath, renderControllerStatusMarkdown(result));
  await pushControllerArtifactOnce(state, "controller-status", outPath, false);
  await pushControllerArtifactOnce(state, "controller-status-report", reportPath, false);
  await persistState(state);
  state = await readControllerState(state.statePath);
  result.state = state;
  await writeJson(outPath, { schemaVersion: 1, controllerStatus: result });
  await writeFile(reportPath, renderControllerStatusMarkdown(result));
  return result;
}

function buildControllerRunbookLaunchBlockers(
  doctor: ControllerDoctorResult,
  environment: ControllerEnvironmentPreflight,
  runnerPacket: ControllerModelRunnerPacket | null,
): ControllerLaunchRunbook["launchBlockers"] {
  const blockers: ControllerLaunchRunbook["launchBlockers"] = [];
  const add = (
    category: ControllerLaunchRunbook["launchBlockers"][number]["category"],
    severity: ControllerLaunchRunbook["launchBlockers"][number]["severity"],
    message: string,
    issueCodes: string[] = [],
    evidenceRefs: string[] = [],
  ) => {
    const clean = message.trim();
    if (!clean) return;
    blockers.push({
      category,
      severity,
      issueCodes: uniqueText(issueCodes),
      message: clean,
      evidenceRefs: uniqueText(evidenceRefs),
    });
  };
  for (const detail of doctor.summaries.completionAudit.failedRequirementDetails) {
    add("completion_audit", "blocker", `${detail.id}: ${detail.finding}`, detail.issueCodes, [doctor.summaries.completionAudit.path, doctor.summaries.completionAudit.reportPath]);
  }
  for (const detail of doctor.summaries.completionAudit.warningRequirementDetails) {
    add("completion_audit", "warning", `${detail.id}: ${detail.finding}`, detail.issueCodes, [doctor.summaries.completionAudit.path, doctor.summaries.completionAudit.reportPath]);
  }
  for (const message of doctor.blockers) add("doctor", "blocker", message, issueCodesFromText(message), [doctor.outPath, doctor.reportPath]);
  for (const message of doctor.warnings.slice(0, 12)) add("doctor", "warning", message, issueCodesFromText(message), [doctor.outPath, doctor.reportPath]);
  if (environment.readiness === "blocked") add("environment", "blocker", `Environment readiness is blocked: ${environment.nextAction}`, [], [environment.outPath, environment.reportPath]);
  if (runnerPacket && !runnerPacket.safeToAutoExecute) add("runner_packet", runnerPacket.status === "blocked" ? "blocker" : "warning", `Runner packet is not safe to auto-execute: ${runnerPacket.status}; ${runnerPacket.recommendedCommand}`, [], [runnerPacket.outPath, runnerPacket.reportPath]);
  if (!doctor.summaries.cost.withinBudget) add("cost", "blocker", `Estimated cost ${doctor.summaries.cost.estimatedUsd.toFixed(4)} exceeds configured controller/reviewer budget.`, [], [doctor.outPath]);
  return uniqueRunbookLaunchBlockers(blockers).slice(0, 40);
}

function uniqueRunbookLaunchBlockers(blockers: ControllerLaunchRunbook["launchBlockers"]): ControllerLaunchRunbook["launchBlockers"] {
  const seen = new Set<string>();
  return blockers.filter(blocker => {
    const key = `${blocker.category}:${blocker.severity}:${blocker.issueCodes.join(",")}:${blocker.message}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function issueCodesFromText(value: string): string[] {
  return uniqueText([...value.matchAll(/\b[A-Z][A-Z0-9_]{2,}\b/g)].map(match => match[0]).filter(code => !["USD"].includes(code)));
}

export async function researchControllerRunnerPacketCommand(opts: {
  statePath: string;
  reason?: string;
}): Promise<ControllerModelRunnerPacket> {
  const state = await readControllerState(opts.statePath);
  const packet = await writeControllerModelRunnerPacketArtifacts(state, opts.reason ?? "model_runner_packet");
  await persistState(state);
  return packet;
}

async function writeControllerModelRunnerPacketArtifacts(
  state: ControllerState,
  reason: string,
): Promise<ControllerModelRunnerPacket> {
  const agenda = await writeControllerExecutionAgenda(state, reason);
  const audit = await buildControllerOperatorAudit(state, agenda, reason);
  await writeControllerEnvironmentPreflight(audit.environment);
  await writeJson(audit.outPath, { schemaVersion: 1, controllerOperatorAudit: audit });
  await writeFile(audit.reportPath, renderControllerOperatorAuditMarkdown(audit));
  await pushControllerArtifactOnce(state, "controller-environment-preflight", audit.environment.outPath, false);
  await pushControllerArtifactOnce(state, "controller-environment-preflight-report", audit.environment.reportPath, false);
  await pushControllerArtifactOnce(state, "controller-operator-audit", audit.outPath, false);
  await pushControllerArtifactOnce(state, "controller-operator-audit-report", audit.reportPath, false);
  const capabilities = buildControllerCapabilityManifest(state, "model_runner_packet_capabilities");
  await writeJson(capabilities.outPath, { schemaVersion: 1, controllerCapabilityManifest: capabilities });
  await writeFile(capabilities.reportPath, renderControllerCapabilityManifestMarkdown(capabilities));
  await pushControllerArtifactOnce(state, "controller-capability-manifest", capabilities.outPath, false);
  await pushControllerArtifactOnce(state, "controller-capability-manifest-report", capabilities.reportPath, false);
  const packet = await buildControllerModelRunnerPacket(state, agenda, audit, capabilities);
  await writeJson(packet.outPath, { schemaVersion: 1, controllerModelRunnerPacket: packet });
  await writeFile(packet.reportPath, renderControllerModelRunnerPacketMarkdown(packet));
  await pushControllerArtifactOnce(state, "controller-model-runner-packet", packet.outPath, false);
  await pushControllerArtifactOnce(state, "controller-model-runner-packet-report", packet.reportPath, false);
  return packet;
}

export async function researchControllerSelfTestCommand(opts: {
  outDir: string;
  objective?: string;
  env?: NodeJS.ProcessEnv;
  fetchImpl?: typeof fetch;
}): Promise<ControllerSelfTestResult> {
  const outDir = path.resolve(opts.outDir);
  await mkdir(outDir, { recursive: true });
  const objective = opts.objective ?? "Verify the Research Controller Agent can run, audit, resume, reject infeasible studies, and accept strict model-controller decisions in this local environment.";
  const selfTestId = `controller_self_test_${new Date().toISOString().replace(/[:.]/g, "-")}`;
  const dataPath = path.join(outDir, "controller-self-test-rows.csv");
  const badDataPath = path.join(outDir, "controller-self-test-too-small.csv");
  await writeFile(dataPath, controllerSelfTestCsv(96));
  await writeFile(badDataPath, "y,x,age\n1,0,55\n2,1,62\n3,2,70\n");

  const scenarios: ControllerSelfTestScenario[] = [];
  const checks: ControllerSelfTestResult["checks"] = [];
  const addCheck = (id: string, status: "pass" | "warning" | "fail", message: string, evidenceRefs: string[] = []) => {
    checks.push({ id, status, message, evidenceRefs: uniqueText(evidenceRefs) });
  };

  try {
    const started = await researchControllerStartCommand({
      question: "In a local synthetic table, can the one-command controller startup create first-read readiness evidence?",
      outDir: path.join(outDir, "golden-startup"),
      dataPath,
      method: "linear-regression",
      outcome: "y",
      exposure: "x",
      covariates: ["age"],
    });
    scenarios.push(controllerSelfTestScenario("golden_path_startup", "One-command controller startup", started.state, [
      {
        id: "start-artifacts",
        status: hasArtifactKinds(started.state, ["controller-start", "controller-start-report", "controller-status", "controller-runbook"]) ? "pass" : "fail",
        message: `controller-start status=${started.status}; mode=${started.mode}; first-read=${started.statusSummary.status}; runbook=${started.runbookSummary.status}.`,
        evidenceRefs: [started.outPath, started.reportPath, started.artifactPaths.status, started.artifactPaths.runbook],
      },
      {
        id: "start-readiness-envelope",
        status: started.runbookSummary.firstReadCommand.includes("controller-status") && started.runbookSummary.launchCommand.includes("controller-operate") ? "pass" : "fail",
        message: `First-read command=${started.runbookSummary.firstReadCommand}; launch command=${started.runbookSummary.launchCommand}.`,
        evidenceRefs: [started.artifactPaths.statusReport, started.artifactPaths.runbookReport],
      },
    ]));
  } catch (error) {
    scenarios.push(controllerFailedSelfTestScenario("golden_path_startup", "One-command controller startup", error));
  }

  try {
    const deterministic = await researchControllerRunCommand({
      question: "In a local synthetic table, is x associated with y after accounting for age?",
      outDir: path.join(outDir, "deterministic-golden"),
      dataPath,
      method: "linear-regression",
      outcome: "y",
      exposure: "x",
      covariates: ["age"],
      maxSteps: 16,
    });
    let deterministicState = deterministic.state;
    const searchTool = await researchControllerToolCommand({
      statePath: deterministicState.statePath,
      request: {
        toolId: "controller-search-repo",
        args: ["ControllerState", "packages/cli/src/research-machine/controller.ts"],
        reason: "Self-test bounded source search.",
      },
    });
    deterministicState = searchTool;
    const readTool = await researchControllerToolCommand({
      statePath: deterministicState.statePath,
      request: {
        toolId: "controller-read-file",
        args: ["packages/cli/src/research-machine/controller.ts"],
        reason: "Self-test bounded source file read.",
      },
    });
    deterministicState = readTool;
    const agenteerTool = await researchControllerToolCommand({
      statePath: deterministicState.statePath,
      request: {
        toolId: "controller-run-agenteer",
        args: ["research", "methods-catalog", "--json"],
        reason: "Self-test read-only Agenteer CLI introspection.",
      },
    });
    deterministicState = agenteerTool;
    const gitDiffTool = await researchControllerToolCommand({
      statePath: deterministicState.statePath,
      request: {
        toolId: "controller-git-diff",
        args: [],
        reason: "Self-test bounded git diff inspection.",
      },
    });
    deterministicState = gitDiffTool;
    const sourcePatchResult = await exerciseControllerSelfTestSourcePatchLoop(deterministicState);
    deterministicState = sourcePatchResult.state;
    await researchControllerDoctorCommand({ statePath: deterministicState.statePath, reason: "controller_self_test" });
    const operated = await researchControllerOperateCommand({
      statePath: deterministicState.statePath,
      reason: "controller_self_test",
      maxCycles: 1,
      maxRounds: 1,
      maxIterationsPerRound: 1,
      maxStepsPerRun: 1,
    });
    deterministicState = operated.state;
    const runnerPacket = await researchControllerRunnerPacketCommand({ statePath: deterministicState.statePath, reason: "controller_self_test" });
    deterministicState = await readControllerState(deterministicState.statePath);
    const status = await researchControllerStatusCommand({ statePath: deterministicState.statePath, reason: "controller_self_test" });
    deterministicState = status.state;
    const inspection = await researchControllerInspectCommand({ statePath: deterministicState.statePath });
    deterministicState = inspection.state;
    const audit = await researchControllerAuditCommand({ statePath: deterministicState.statePath, reason: "controller_self_test" });
    const capabilities = await researchControllerCapabilitiesCommand({ statePath: deterministicState.statePath, reason: "controller_self_test" });
    const goalAudit = await researchControllerGoalAuditCommand({ statePath: deterministicState.statePath, objective, reason: "controller_self_test" });
    scenarios.push(controllerSelfTestScenario("deterministic_golden_path", "Deterministic golden-path controller run", deterministicState, [
      {
        id: "terminal-status",
        status: deterministicState.status === "complete" || deterministicState.status === "needs_human_review" ? "pass" : "fail",
        message: `Final status is ${deterministicState.status}/${deterministicState.currentStage}.`,
        evidenceRefs: [deterministicState.statePath],
      },
      {
        id: "core-artifacts",
        status: hasArtifactKinds(deterministicState, ["controller-feasibility-verdict", "controller-modeling-plan", "stats-report", "method-qa", "manuscript", "run-inspection", "controller-completion-audit"]) ? "pass" : "fail",
        message: "Core feasibility, modeling, execution, QA, manuscript, inspection, and completion artifacts are present.",
        evidenceRefs: deterministicState.artifacts.map(item => item.path),
      },
      {
        id: "inspection-audit-capabilities",
        status: inspection.state.status === "failed" || audit.status === "fail" || capabilities.summary.missing > 0 ? "fail" : "pass",
        message: `Inspection=${inspection.state.status}; operator audit=${audit.status}; capability missing=${capabilities.summary.missing}; goal audit=${goalAudit.status}.`,
        evidenceRefs: [audit.outPath, capabilities.outPath, goalAudit.outPath],
      },
      {
        id: "bounded-tool-introspection",
        status: searchTool.toolActions.at(-1)?.status === "succeeded" && readTool.toolActions.at(-1)?.status === "succeeded" && agenteerTool.toolActions.at(-1)?.status === "succeeded" && gitDiffTool.toolActions.at(-1)?.status === "succeeded" ? "pass" : "fail",
        message: "Bounded repo search, file read, read-only Agenteer introspection, and git diff tool actions succeeded.",
        evidenceRefs: [
          searchTool.toolActions.at(-1)?.stdoutPath,
          readTool.toolActions.at(-1)?.stdoutPath,
          agenteerTool.toolActions.at(-1)?.stdoutPath,
          gitDiffTool.toolActions.at(-1)?.stdoutPath,
        ].filter((item): item is string => Boolean(item)),
      },
      {
        id: "source-patch-loop",
        status: sourcePatchResult.status,
        message: sourcePatchResult.message,
        evidenceRefs: sourcePatchResult.evidenceRefs,
      },
      {
        id: "fresh-model-runner-packet",
        status: runnerPacket.status === "blocked" ? "fail" : "pass",
        message: `Runner packet status=${runnerPacket.status}; safeToAutoExecute=${runnerPacket.safeToAutoExecute}; next=${runnerPacket.recommendedCommand}.`,
        evidenceRefs: [runnerPacket.outPath, runnerPacket.reportPath],
      },
      {
        id: "first-read-status",
        status: status.status === "blocked" || status.artifactPaths.doctor.length === 0 || status.artifactPaths.runbook.length === 0 || status.artifactPaths.goldenPacket.length === 0 ? "fail" : "pass",
        message: `Controller status=${status.status}; readyToLaunch=${status.readyToLaunch}; promotable=${status.promotable}; next=${status.recommendedCommand}.`,
        evidenceRefs: [status.outPath, status.reportPath, status.artifactPaths.doctor, status.artifactPaths.runbook, status.artifactPaths.goldenPacket],
      },
    ]));
  } catch (error) {
    scenarios.push(controllerFailedSelfTestScenario("deterministic_golden_path", "Deterministic golden-path controller run", error));
  }

  try {
    const supervisedSeed = await researchControllerInitCommand({
      question: "In a local synthetic table, can a supervised controller pickup advance a study safely?",
      outDir: path.join(outDir, "supervised-pickup"),
      dataPath,
      method: "linear-regression",
      outcome: "y",
      exposure: "x",
      covariates: ["age"],
    });
    const supervised = await researchControllerSupervisorCommand({
      statePath: supervisedSeed.statePath,
      reason: "controller_self_test_supervisor",
      maxRounds: 2,
      maxIterationsPerRound: 2,
      maxStepsPerRun: 4,
      env: opts.env,
      fetchImpl: opts.fetchImpl,
    });
    scenarios.push(controllerSelfTestScenario("supervised_pickup_loop", "Bounded supervised controller pickup", supervised.state, [
      {
        id: "runner-packet-refresh",
        status: hasArtifactKinds(supervised.state, ["controller-model-runner-packet", "controller-model-runner-packet-report"]) && supervised.rounds.every(round => round.runnerPacketPath) ? "pass" : "fail",
        message: `${supervised.rounds.length} supervised round(s) recorded runner-packet paths.`,
        evidenceRefs: supervised.rounds.map(round => round.runnerPacketPath),
      },
      {
        id: "safe-follow-loop",
        status: supervised.rounds.some(round => round.safeAgendaPrimary && round.followLoopIterations > 0 && round.followLoopPath) ? "pass" : "fail",
        message: `Supervisor safe primary flags: ${supervised.rounds.map(round => `${round.round}=${round.safeAgendaPrimary}`).join(", ")}; follow iterations=${supervised.rounds.map(round => round.followLoopIterations).join(", ")}.`,
        evidenceRefs: supervised.rounds.map(round => round.followLoopPath).filter((item): item is string => Boolean(item)),
      },
      {
        id: "post-round-audit",
        status: supervised.rounds.some(round => round.auditPath && round.auditReadiness) && hasArtifactKinds(supervised.state, ["controller-operator-audit"]) ? "pass" : "fail",
        message: `Audit readiness values: ${supervised.rounds.map(round => round.auditReadiness ?? "none").join(", ")}.`,
        evidenceRefs: supervised.rounds.map(round => round.auditPath).filter((item): item is string => Boolean(item)),
      },
      {
        id: "supervisor-artifacts",
        status: hasArtifactKinds(supervised.state, ["controller-supervisor", "controller-supervisor-report"]) ? "pass" : "fail",
        message: `Supervisor stopped because: ${supervised.stoppedReason}`,
        evidenceRefs: [supervised.outPath, supervised.reportPath],
      },
    ]));
  } catch (error) {
    scenarios.push(controllerFailedSelfTestScenario("supervised_pickup_loop", "Bounded supervised controller pickup", error));
  }

  try {
    const operateSeed = await researchControllerInitCommand({
      question: "In a local synthetic table, can a doctor-driven controller operate loop continue safely?",
      outDir: path.join(outDir, "operate-pickup"),
      dataPath,
      method: "linear-regression",
      outcome: "y",
      exposure: "x",
      covariates: ["age"],
    });
    const operated = await researchControllerOperateCommand({
      statePath: operateSeed.statePath,
      reason: "controller_self_test_operate",
      maxCycles: 2,
      maxRounds: 2,
      maxIterationsPerRound: 2,
      maxStepsPerRun: 3,
      env: opts.env,
      fetchImpl: opts.fetchImpl,
    });
    scenarios.push(controllerSelfTestScenario("doctor_operate_loop", "Doctor-driven controller operate loop", operated.state, [
      {
        id: "doctor-refresh",
        status: operated.cycles.every(cycle => cycle.doctorPath) && hasArtifactKinds(operated.state, ["controller-doctor", "controller-doctor-report"]) ? "pass" : "fail",
        message: `${operated.cycles.length} operate cycle(s) recorded doctor paths.`,
        evidenceRefs: operated.cycles.map(cycle => cycle.doctorPath),
      },
      {
        id: "safe-supervision-selected",
        status: operated.cycles.some(cycle => cycle.action === "supervise" && cycle.actionPath) ? "pass" : "fail",
        message: `Operate actions: ${operated.cycles.map(cycle => `${cycle.cycle}=${cycle.action}`).join(", ")}.`,
        evidenceRefs: operated.cycles.map(cycle => cycle.actionPath).filter((item): item is string => Boolean(item)),
      },
      {
        id: "operate-artifacts",
        status: hasArtifactKinds(operated.state, ["controller-operate", "controller-operate-report", "controller-supervisor"]) ? "pass" : "fail",
        message: `Operate status=${operated.status}; stopped=${operated.stoppedReason}`,
        evidenceRefs: [operated.outPath, operated.reportPath, ...operated.cycles.map(cycle => cycle.actionPath).filter((item): item is string => Boolean(item))],
      },
      {
        id: "bounded-stop",
        status: operated.status !== "blocked" && operated.state.status !== "failed" ? "pass" : "fail",
        message: `Operate stopped at ${operated.status}; state=${operated.state.status}/${operated.state.currentStage}.`,
        evidenceRefs: [operated.outPath, operated.state.statePath],
      },
    ]));
  } catch (error) {
    scenarios.push(controllerFailedSelfTestScenario("doctor_operate_loop", "Doctor-driven controller operate loop", error));
  }

  try {
    const repairRun = await researchControllerRunCommand({
      question: "Does x cause y with missingness concerns?",
      outDir: path.join(outDir, "review-repair-golden"),
      dataPath,
      method: "linear-regression",
      outcome: "y",
      exposure: "x",
      allowExternalReview: true,
      mockExternalReview: true,
      reviewPanel: "cheap",
      maxAutoRepairs: 1,
      maxSteps: 20,
    });
    scenarios.push(controllerSelfTestScenario("external_review_repair_loop", "Mock external review and bounded repair loop", repairRun.state, [
      {
        id: "external-review-artifacts",
        status: hasArtifactKinds(repairRun.state, ["review-panel", "review-adjudication", "state-reentry", "controller-repair-plan"]) ? "pass" : "fail",
        message: "External review artifacts and controller repair plan are present.",
        evidenceRefs: repairRun.state.artifacts.filter(item => item.kind.includes("review") || item.kind.includes("repair") || item.kind === "state-reentry").map(item => item.path),
      },
      {
        id: "bounded-repair-executed",
        status: repairRun.state.repairs.some(repair => repair.status === "succeeded" || repair.status === "partial") && hasArtifactKinds(repairRun.state, ["controller-repair-execution", "controller-repair-verification"]) ? "pass" : "fail",
        message: `${repairRun.state.repairs.length} repair execution(s) recorded with verification evidence.`,
        evidenceRefs: [
          ...repairRun.state.repairs.map(repair => repair.outPath),
          ...repairRun.state.artifacts.filter(item => item.kind === "controller-repair-verification").map(item => item.path),
        ],
      },
      {
        id: "repair-stops-safely",
        status: repairRun.state.status === "needs_human_review" || repairRun.state.status === "complete" ? "pass" : "fail",
        message: `Repair run stopped at ${repairRun.state.status}/${repairRun.state.currentStage}.`,
        evidenceRefs: [repairRun.state.statePath],
      },
    ]));
  } catch (error) {
    scenarios.push(controllerFailedSelfTestScenario("external_review_repair_loop", "Mock external review and bounded repair loop", error));
  }

  try {
    const strictModel = await researchControllerRunCommand({
      question: "In a local synthetic table, is x associated with y under strict model-controller decisions?",
      outDir: path.join(outDir, "strict-model-golden"),
      dataPath,
      method: "linear-regression",
      outcome: "y",
      exposure: "x",
      covariates: ["age"],
      maxSteps: 8,
      requireControllerModel: true,
      controller: { enabled: true, provider: "openai", model: "gpt-5.4" },
      env: { ...(opts.env ?? process.env), OPENAI_API_KEY: (opts.env ?? process.env).OPENAI_API_KEY ?? "controller-self-test-key" } as NodeJS.ProcessEnv,
      fetchImpl: opts.fetchImpl ?? controllerSelfTestFetch,
    });
    scenarios.push(controllerSelfTestScenario("strict_model_controller", "Strict GPT-5.4-compatible model-controller transport", strictModel.state, [
      {
        id: "model-decisions",
        status: strictModel.state.decisions.some(decision => decision.source === "model") ? "pass" : "fail",
        message: `${strictModel.state.decisions.filter(decision => decision.source === "model").length} model decision(s) were accepted.`,
        evidenceRefs: strictModel.state.decisions.map(decision => decision.modelRawPath).filter((item): item is string => Boolean(item)),
      },
      {
        id: "model-preflight-quality",
        status: hasArtifactKinds(strictModel.state, ["controller-model-preflight", "controller-decision-quality"]) ? "pass" : "fail",
        message: "Strict model run recorded preflight and decision-quality evidence.",
        evidenceRefs: strictModel.state.artifacts.filter(item => item.kind === "controller-model-preflight" || item.kind === "controller-decision-quality").map(item => item.path),
      },
      {
        id: "strict-run-progress",
        status: strictModel.state.actions.length > 0 && strictModel.state.status !== "failed" ? "pass" : "fail",
        message: `Strict run executed ${strictModel.state.actions.length} action(s) and stopped at ${strictModel.state.status}/${strictModel.state.currentStage}.`,
        evidenceRefs: [strictModel.state.statePath],
      },
    ]));
  } catch (error) {
    scenarios.push(controllerFailedSelfTestScenario("strict_model_controller", "Strict GPT-5.4-compatible model-controller transport", error));
  }

  try {
    const blocked = await researchControllerRunCommand({
      question: "In a tiny local table, is x associated with y?",
      outDir: path.join(outDir, "blocked-feasibility"),
      dataPath: badDataPath,
      method: "linear-regression",
      outcome: "y",
      exposure: "x",
      maxSteps: 8,
    });
    scenarios.push(controllerSelfTestScenario("infeasible_study_rejection", "Infeasible study rejection before execution", blocked.state, [
      {
        id: "blocked-before-execution",
        status: blocked.state.status === "blocked" && !blocked.state.actions.some(action => action.action === "run_analysis") ? "pass" : "fail",
        message: `Final status is ${blocked.state.status}; run_analysis executed=${blocked.state.actions.some(action => action.action === "run_analysis")}.`,
        evidenceRefs: [blocked.state.statePath],
      },
      {
        id: "feasibility-evidence",
        status: hasArtifactKinds(blocked.state, ["controller-feasibility-verdict", "controller-terminal-handoff", "controller-next-action"]) ? "pass" : "fail",
        message: "Blocked run recorded feasibility, handoff, and next-action artifacts.",
        evidenceRefs: blocked.state.artifacts.map(item => item.path),
      },
    ]));
  } catch (error) {
    scenarios.push(controllerFailedSelfTestScenario("infeasible_study_rejection", "Infeasible study rejection before execution", error));
  }

  const expectedScenarioIds = [
    "golden_path_startup",
    "deterministic_golden_path",
    "supervised_pickup_loop",
    "doctor_operate_loop",
    "external_review_repair_loop",
    "strict_model_controller",
    "infeasible_study_rejection",
  ];
  const missingScenarioIds = expectedScenarioIds.filter(id => !scenarios.some(scenario => scenario.id === id));
  addCheck(
    "scenario-count",
    missingScenarioIds.length === 0 ? "pass" : "fail",
    `Recorded ${scenarios.length} scenario(s); expected ${expectedScenarioIds.join(", ")}.${missingScenarioIds.length ? ` Missing: ${missingScenarioIds.join(", ")}.` : ""}`,
    scenarios.flatMap(scenario => scenario.evidenceRefs),
  );
  addCheck(
    "scenario-status",
    scenarios.some(scenario => scenario.status === "fail") ? "fail" : scenarios.some(scenario => scenario.status === "warning") ? "warning" : "pass",
    `Scenario statuses: ${scenarios.map(scenario => `${scenario.id}=${scenario.status}`).join(", ")}.`,
    scenarios.flatMap(scenario => scenario.evidenceRefs),
  );
  const requirements = buildControllerSelfTestRequirements(scenarios);
  addCheck(
    "requirement-coverage",
    requirements.some(requirement => requirement.status === "fail") ? "fail" : requirements.some(requirement => requirement.status === "warning") ? "warning" : "pass",
    `Requirement statuses: ${requirements.map(requirement => `${requirement.id}=${requirement.status}`).join(", ")}.`,
    requirements.flatMap(requirement => requirement.evidenceRefs),
  );
  const status: ControllerSelfTestResult["status"] = checks.some(check => check.status === "fail") || scenarios.some(scenario => scenario.status === "fail") || requirements.some(requirement => requirement.status === "fail")
    ? "fail"
    : checks.some(check => check.status === "warning") || scenarios.some(scenario => scenario.status === "warning") || requirements.some(requirement => requirement.status === "warning")
      ? "warning"
      : "pass";
  const readiness: ControllerSelfTestResult["readiness"] = status === "pass" ? "ready" : status === "warning" ? "degraded" : "blocked";
  const outPath = path.join(outDir, "controller-self-test.json");
  const reportPath = path.join(outDir, "controller-self-test.md");
  const result: ControllerSelfTestResult = {
    schemaVersion: 1,
    generatedAtIso: nowIso(),
    selfTestId,
    status,
    readiness,
    outDir,
    objective,
    scenarios,
    requirements,
    checks,
    nextAction: status === "fail"
      ? "Inspect failed scenario reports and rerun controller-self-test after fixing controller/runtime issues."
      : status === "warning"
        ? "Review warning scenarios before relying on unattended controller operation."
        : "Controller self-test passed; use controller-run or controller-follow-loop for bounded autonomous pickup.",
    outPath,
    reportPath,
  };
  await writeJson(outPath, { schemaVersion: 1, controllerSelfTest: result });
  await writeFile(reportPath, renderControllerSelfTestMarkdown(result));
  return result;
}

export function renderResearchControllerSelfTest(result: ControllerSelfTestResult): string {
  const nonPassingScenarios = result.scenarios.filter(item => item.status !== "pass");
  const nonPassingChecks = result.checks.filter(item => item.status !== "pass");
  const nonPassingRequirements = result.requirements.filter(item => item.status !== "pass");
  const focusEvidenceRefs = uniqueText([
    ...nonPassingScenarios.flatMap(item => item.evidenceRefs),
    ...nonPassingScenarios.flatMap(item => item.checks.flatMap(check => check.evidenceRefs)),
    ...nonPassingRequirements.flatMap(item => item.evidenceRefs),
    ...nonPassingChecks.flatMap(item => item.evidenceRefs),
  ]);
  const keyEvidenceRank = (ref: string): number => {
    if (ref.includes("controller_status_")) return 0;
    if (ref.includes("controller_runbook_")) return 1;
    if (ref.includes("controller_doctor_")) return 2;
    if (ref.includes("controller_model_runner_packet_")) return 3;
    if (ref.includes("controller-repair-verification")) return 4;
    if (ref.includes("controller-repair-execution")) return 5;
    if (ref.includes("controller_model_preflight_")) return 6;
    if (ref.includes("controller-feasibility-verdict")) return 7;
    return 8;
  };
  const keyPassingEvidenceRefs = result.scenarios.flatMap(item => item.evidenceRefs.filter(ref =>
    ref.includes("controller_status_")
    || ref.includes("controller_runbook_")
    || ref.includes("controller_doctor_")
    || ref.includes("controller_model_runner_packet_")
    || ref.includes("controller-repair-verification")
    || ref.includes("controller-repair-execution")
    || ref.includes("controller_model_preflight_")
    || ref.includes("controller-feasibility-verdict"),
  )).sort((left, right) => keyEvidenceRank(left) - keyEvidenceRank(right));
  const evidenceRefs = focusEvidenceRefs.length
    ? focusEvidenceRefs
    : uniqueText([
      result.outPath,
      result.reportPath,
      ...keyPassingEvidenceRefs,
      ...result.scenarios.map(item => item.statePath).filter((item): item is string => Boolean(item)),
      ...result.requirements.flatMap(item => item.evidenceRefs),
      ...result.checks.flatMap(item => item.evidenceRefs),
    ]);
  return [
    "research controller self-test",
    `  status: ${result.status}`,
    `  readiness: ${result.readiness}`,
    `  scenarios: ${result.scenarios.map(item => `${item.id}/${item.status}`).join(", ")}`,
    `  non-pass scenarios: ${nonPassingScenarios.length}`,
    ...nonPassingScenarios.slice(0, 5).map(item => `  - scenario ${item.status} ${item.id}: ${item.label}; evidence=${item.evidenceRefs.slice(0, 3).join(", ") || "(none)"}`),
    `  requirements: ${result.requirements.map(item => `${item.id}/${item.status}`).join(", ")}`,
    `  non-pass requirements: ${nonPassingRequirements.length}`,
    ...nonPassingRequirements.slice(0, 5).map(item => `  - requirement ${item.status} ${item.id}: ${item.gaps.join("; ") || item.requirement}; evidence=${item.evidenceRefs.slice(0, 3).join(", ") || "(none)"}`),
    `  non-pass checks: ${nonPassingChecks.length}`,
    ...nonPassingChecks.slice(0, 5).map(item => `  - check ${item.status} ${item.id}: ${item.message}; evidence=${item.evidenceRefs.slice(0, 3).join(", ") || "(none)"}`),
    `  evidence refs: ${evidenceRefs.length}`,
    ...evidenceRefs.slice(0, 5).map(ref => `  - evidence: ${ref}`),
    `  out: ${result.outPath}`,
    `  report: ${result.reportPath}`,
    `  next: ${result.nextAction}`,
  ].join("\n");
}

export function renderResearchControllerSelfTestJson(result: ControllerSelfTestResult): string {
  return `${JSON.stringify({ schemaVersion: 1, controllerSelfTest: result }, null, 2)}\n`;
}

function controllerSelfTestScenario(
  id: string,
  label: string,
  state: ControllerState,
  checks: ControllerSelfTestScenario["checks"],
): ControllerSelfTestScenario {
  const status: ControllerSelfTestScenario["status"] = checks.some(check => check.status === "fail")
    ? "fail"
    : checks.some(check => check.status === "warning")
      ? "warning"
      : "pass";
  return {
    id,
    label,
    status,
    statePath: state.statePath,
    finalStage: state.currentStage,
    finalStatus: state.status,
    evidenceRefs: uniqueText([state.statePath, ...state.artifacts.slice(-12).map(item => item.path), ...checks.flatMap(check => check.evidenceRefs)]),
    checks,
  };
}

function controllerFailedSelfTestScenario(id: string, label: string, error: unknown): ControllerSelfTestScenario {
  return {
    id,
    label,
    status: "fail",
    statePath: null,
    finalStage: null,
    finalStatus: null,
    evidenceRefs: [],
    checks: [{
      id: "scenario-exception",
      status: "fail",
      message: error instanceof Error ? error.message : String(error),
      evidenceRefs: [],
    }],
  };
}

function buildControllerSelfTestRequirements(scenarios: ControllerSelfTestScenario[]): ControllerSelfTestRequirement[] {
  const reqs: ControllerSelfTestRequirement[] = [];
  const add = (
    id: ControllerSelfTestRequirement["id"],
    category: ControllerSelfTestRequirement["category"],
    requirement: string,
    checks: Array<{ scenarioId: string; checkId: string }>,
    staticEvidenceRefs: string[] = [],
  ) => {
    const evidenceRefs: string[] = [...staticEvidenceRefs];
    const gaps: string[] = [];
    let hasWarning = false;
    for (const expected of checks) {
      const scenario = scenarios.find(item => item.id === expected.scenarioId);
      const check = scenario?.checks.find(item => item.id === expected.checkId);
      if (!scenario) {
        gaps.push(`Scenario ${expected.scenarioId} was not recorded.`);
        continue;
      }
      evidenceRefs.push(...scenario.evidenceRefs);
      if (!check) {
        gaps.push(`Check ${expected.scenarioId}.${expected.checkId} was not recorded.`);
        continue;
      }
      evidenceRefs.push(...check.evidenceRefs);
      if (check.status === "fail") gaps.push(`Check ${expected.scenarioId}.${expected.checkId} failed: ${check.message}`);
      if (check.status === "warning") hasWarning = true;
    }
    const status: ControllerSelfTestRequirement["status"] = gaps.length ? "fail" : hasWarning ? "warning" : "pass";
    reqs.push({ id, category, requirement, status, evidenceRefs: uniqueText(evidenceRefs), gaps: uniqueText(gaps) });
  };

  add(
    "persistent_autonomous_state",
    "autonomy",
    "The controller persists resumable state, handoff artifacts, audits, agendas, and can run a local golden path without chat context.",
    [
      { scenarioId: "golden_path_startup", checkId: "start-artifacts" },
      { scenarioId: "golden_path_startup", checkId: "start-readiness-envelope" },
      { scenarioId: "deterministic_golden_path", checkId: "terminal-status" },
      { scenarioId: "deterministic_golden_path", checkId: "core-artifacts" },
      { scenarioId: "deterministic_golden_path", checkId: "inspection-audit-capabilities" },
      { scenarioId: "deterministic_golden_path", checkId: "fresh-model-runner-packet" },
      { scenarioId: "deterministic_golden_path", checkId: "first-read-status" },
    ],
  );
  add(
    "default_gpt54_strict_model_runner",
    "model",
    "The controller defaults to GPT-5.4-compatible model control and can run strict model decisions with preflight and decision-quality evidence.",
    [
      { scenarioId: "strict_model_controller", checkId: "model-decisions" },
      { scenarioId: "strict_model_controller", checkId: "model-preflight-quality" },
      { scenarioId: "strict_model_controller", checkId: "strict-run-progress" },
    ],
  );
  add(
    "bounded_supervised_pickup",
    "autonomy",
    "The controller can be picked up by a bounded supervisor that refreshes runner packets, follows safe agenda items, audits after execution, and records stop reasons.",
    [
      { scenarioId: "supervised_pickup_loop", checkId: "runner-packet-refresh" },
      { scenarioId: "supervised_pickup_loop", checkId: "safe-follow-loop" },
      { scenarioId: "supervised_pickup_loop", checkId: "post-round-audit" },
      { scenarioId: "supervised_pickup_loop", checkId: "supervisor-artifacts" },
    ],
  );
  add(
    "doctor_driven_operate_loop",
    "autonomy",
    "The controller can run a full bounded wake-up loop that refreshes doctor readiness, chooses safe supervision or repair, records each cycle, and stops with an operation report.",
    [
      { scenarioId: "doctor_operate_loop", checkId: "doctor-refresh" },
      { scenarioId: "doctor_operate_loop", checkId: "safe-supervision-selected" },
      { scenarioId: "doctor_operate_loop", checkId: "operate-artifacts" },
      { scenarioId: "doctor_operate_loop", checkId: "bounded-stop" },
    ],
  );
  add(
    "dataset_grounded_research_execution",
    "research",
    "The controller executes a dataset-grounded research path and rejects infeasible study ideas before analysis execution.",
    [
      { scenarioId: "deterministic_golden_path", checkId: "core-artifacts" },
      { scenarioId: "infeasible_study_rejection", checkId: "blocked-before-execution" },
      { scenarioId: "infeasible_study_rejection", checkId: "feasibility-evidence" },
    ],
  );
  add(
    "independent_review_and_repair",
    "qa",
    "The controller routes outputs through independent review artifacts, builds repair plans, executes bounded repairs, and stops safely.",
    [
      { scenarioId: "external_review_repair_loop", checkId: "external-review-artifacts" },
      { scenarioId: "external_review_repair_loop", checkId: "bounded-repair-executed" },
      { scenarioId: "external_review_repair_loop", checkId: "repair-stops-safely" },
    ],
  );
  add(
    "implementation_change_loop",
    "implementation",
    "The controller can gather repository context, inspect Agenteer capabilities, propose/apply/verify/rollback a bounded source patch, and leave no scratch residue.",
    [
      { scenarioId: "deterministic_golden_path", checkId: "bounded-tool-introspection" },
      { scenarioId: "deterministic_golden_path", checkId: "source-patch-loop" },
    ],
  );
  add(
    "safety_and_artifact_integrity",
    "safety",
    "The controller preserves explicit safety gates, artifact-backed audits, infeasibility blockers, rollback evidence, and human-review stop states.",
    [
      { scenarioId: "deterministic_golden_path", checkId: "inspection-audit-capabilities" },
      { scenarioId: "deterministic_golden_path", checkId: "source-patch-loop" },
      { scenarioId: "infeasible_study_rejection", checkId: "blocked-before-execution" },
    ],
  );
  add(
    "documented_tested_public_surface",
    "documentation",
    "The public controller surface is documented and backed by focused regression tests.",
    [
      { scenarioId: "deterministic_golden_path", checkId: "inspection-audit-capabilities" },
      { scenarioId: "deterministic_golden_path", checkId: "fresh-model-runner-packet" },
      { scenarioId: "deterministic_golden_path", checkId: "first-read-status" },
      { scenarioId: "strict_model_controller", checkId: "model-preflight-quality" },
    ],
    [
      "docs/research-controller.md",
      "docs/command-catalog.md",
      "packages/cli/tests/research-controller.test.ts",
    ],
  );
  return reqs;
}

function hasArtifactKinds(state: ControllerState, kinds: string[]): boolean {
  const observed = new Set(state.artifacts.map(item => item.kind));
  return kinds.every(kind => observed.has(kind));
}

async function exerciseControllerSelfTestSourcePatchLoop(state: ControllerState): Promise<{
  state: ControllerState;
  status: "pass" | "warning" | "fail";
  message: string;
  evidenceRefs: string[];
}> {
  const scratchRel = `docs/controller-self-test-scratch-${sanitizeControllerFileStem(state.runId)}.md`;
  const scratchAbs = path.join(repoRootFromState(state), scratchRel);
  const proposal = {
    summary: "Exercise the controller source patch loop against a disposable scratch documentation file.",
    risk: "low" as const,
    changes: [{
      path: scratchRel,
      rationale: "Create a temporary scratch file so controller apply, verify, and rollback evidence can be tested without changing durable source behavior.",
      after: [
        "# Controller Self-Test Scratch",
        "",
        "This temporary file is created and removed by `controller-self-test`.",
        "",
      ].join("\n"),
    }],
    tests: ["npm run build"],
  };
  let current = state;
  const evidenceRefs: string[] = [];
  try {
    const proposed = await researchControllerToolCommand({
      statePath: current.statePath,
      request: {
        toolId: "controller-propose-patch",
        args: [JSON.stringify(proposal)],
        reason: "Self-test source patch proposal.",
      },
    });
    current = proposed;
    evidenceRefs.push(...lastToolEvidence(current));
    const applied = await researchControllerToolCommand({
      statePath: current.statePath,
      request: {
        toolId: "controller-apply-patch",
        args: ["latest"],
        reason: "Self-test reviewed source patch application.",
      },
    });
    current = applied;
    evidenceRefs.push(...lastToolEvidence(current));
    const verified = await researchControllerToolCommand({
      statePath: current.statePath,
      request: {
        toolId: "controller-verify-patch",
        args: ["latest"],
        reason: "Self-test source patch verification.",
      },
    });
    current = verified;
    evidenceRefs.push(...lastToolEvidence(current));
    const rolledBack = await researchControllerToolCommand({
      statePath: current.statePath,
      request: {
        toolId: "controller-rollback-patch",
        args: ["latest"],
        reason: "Self-test source patch rollback.",
      },
    });
    current = rolledBack;
    evidenceRefs.push(...lastToolEvidence(current));
    const statuses = current.toolActions.slice(-4).map(action => action.status);
    const scratchStillExists = await pathExists(scratchAbs);
    return {
      state: current,
      status: statuses.every(status => status === "succeeded") && !scratchStillExists ? "pass" : "fail",
      message: `Source patch proposal/apply/verify/rollback statuses=${statuses.join(",")}; scratch exists after rollback=${scratchStillExists}.`,
      evidenceRefs: uniqueText(evidenceRefs),
    };
  } catch (error) {
    await rm(scratchAbs, { force: true }).catch(() => undefined);
    return {
      state: current,
      status: "fail",
      message: error instanceof Error ? error.message : String(error),
      evidenceRefs: uniqueText(evidenceRefs),
    };
  } finally {
    await rm(scratchAbs, { force: true }).catch(() => undefined);
  }
}

function lastToolEvidence(state: ControllerState): string[] {
  const last = state.toolActions.at(-1);
  return [
    last?.outPath,
    last?.stdoutPath,
    last?.stderrPath,
  ].filter((item): item is string => Boolean(item));
}

function controllerSelfTestCsv(rows: number): string {
  const lines = ["y,x,age,sex"];
  for (let i = 0; i < rows; i += 1) {
    const x = i % 17;
    const age = 40 + (i % 36);
    const sex = i % 2;
    const y = Number((5 + 1.8 * x + 0.04 * age + sex * 0.7 + ((i % 5) - 2) * 0.15).toFixed(3));
    lines.push(`${y},${x},${age},${sex}`);
  }
  return `${lines.join("\n")}\n`;
}

async function controllerSelfTestFetch(_input: unknown, init?: RequestInit): Promise<Response> {
  const body = typeof init?.body === "string" ? init.body : "";
  const user = (() => {
    try {
      const parsed = JSON.parse(body) as { messages?: Array<{ role?: string; content?: string }> };
      return parsed.messages?.find(message => message.role === "user")?.content ?? body;
    } catch {
      return body;
    }
  })();
  const action = controllerSelfTestActionFromPrompt(user);
  const payload = {
    action,
    rationale: `Self-test model chooses ${action} because it is the allowed deterministic next action for this stage.`,
    confidence: 0.93,
    riskFlags: [],
  };
  return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(payload) } }] }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

function controllerSelfTestActionFromPrompt(user: string): ControllerActionType {
  const deterministic = /"deterministicRecommendation"\s*:\s*\{[\s\S]*?"action"\s*:\s*"([^"]+)"/.exec(user)?.[1];
  if (deterministic && controllerActionSchema.safeParse(deterministic).success) return deterministic as ControllerActionType;
  const allowed = /"allowedActions"\s*:\s*\[([\s\S]*?)\]/.exec(user)?.[1] ?? "";
  for (const candidate of controllerActionSchema.options) {
    if (allowed.includes(`"${candidate}"`)) return candidate;
  }
  return "stop_for_human";
}

function renderControllerSelfTestMarkdown(result: ControllerSelfTestResult): string {
  return [
    "# Controller Self-Test",
    "",
    `Generated: ${result.generatedAtIso}`,
    `Status: ${result.status}`,
    `Readiness: ${result.readiness}`,
    `Objective: ${result.objective}`,
    `Output directory: ${result.outDir}`,
    "",
    "## Scenarios",
    "",
    ...result.scenarios.flatMap(scenario => [
      `### ${scenario.id}`,
      "",
      `- Label: ${scenario.label}`,
      `- Status: ${scenario.status}`,
      `- Final: ${scenario.finalStatus ?? "(none)"}/${scenario.finalStage ?? "(none)"}`,
      `- State: ${scenario.statePath ?? "(none)"}`,
      "- Checks:",
      ...scenario.checks.map(check => `  - [${check.status}] ${check.id}: ${check.message}`),
      ...(scenario.evidenceRefs.length ? ["- Evidence:", ...scenario.evidenceRefs.slice(0, 20).map(ref => `  - ${ref}`)] : ["- Evidence: none"]),
      "",
    ]),
    "## Requirement Matrix",
    "",
    ...result.requirements.flatMap(requirement => [
      `### ${requirement.id}`,
      "",
      `- Category: ${requirement.category}`,
      `- Status: ${requirement.status}`,
      `- Requirement: ${requirement.requirement}`,
      ...(requirement.gaps.length ? ["- Gaps:", ...requirement.gaps.map(gap => `  - ${gap}`)] : ["- Gaps: none"]),
      ...(requirement.evidenceRefs.length ? ["- Evidence:", ...requirement.evidenceRefs.slice(0, 20).map(ref => `  - ${ref}`)] : ["- Evidence: none"]),
      "",
    ]),
    "## Overall Checks",
    "",
    ...result.checks.map(check => `- [${check.status}] ${check.id}: ${check.message}`),
    "",
    "## Next Action",
    "",
    result.nextAction,
    "",
  ].join("\n");
}

export function renderResearchControllerState(result: ControllerState | ControllerRunResult): string {
  const state = "state" in result ? result.state : result;
  const lastGate = state.gates.at(-1);
  const lastAction = state.actions.at(-1);
  const latestIssueLedger = state.issueLedgers.at(-1);
  const latestAgenda = state.agendas?.at(-1);
  const topIssues = latestIssueLedger?.topIssues ?? [];
  return [
    "research controller",
    `  run: ${state.runId}`,
    `  status: ${state.status}`,
    `  stage: ${state.currentStage}`,
    `  question: ${state.inputs.question}`,
    `  run dir: ${state.inputs.runDir}`,
    `  state: ${state.statePath}`,
    `  completed stages: ${state.completedStages.join(", ") || "(none)"}`,
    `  last gate: ${lastGate ? `${lastGate.stage}/${lastGate.status} - ${lastGate.label}` : "(none)"}`,
    `  last action: ${lastAction ? `${lastAction.action}/${lastAction.status}` : "(none)"}`,
    `  artifacts: ${state.artifacts.length}`,
    `  patches: ${state.patches.length}`,
    `  policy updates: ${state.policyUpdates.length}`,
    `  repairs: ${state.repairs.length}`,
    `  tool actions: ${state.toolActions.length}`,
    `  self evaluations: ${state.selfEvaluations.length}`,
    `  work plans: ${state.workPlans.length}`,
    `  issue ledgers: ${state.issueLedgers.length}`,
    `  latest issue ledger: ${latestIssueLedger ? `${latestIssueLedger.status} (${latestIssueLedger.issueCount} issue(s), ${latestIssueLedger.blockerCount} blocker)` : "(none)"}`,
    ...(latestIssueLedger ? [`  issue ledger record: ${latestIssueLedger.outPath}`] : []),
    ...(latestIssueLedger ? [`  issue ledger report: ${latestIssueLedger.reportPath}`] : []),
    ...topIssues.slice(0, 5).map(issue => `  - issue ${issue.severity}/${issue.category}${issue.issueCode ? ` (${issue.issueCode})` : ""}: ${issue.message}; evidence=${issue.evidenceRefs.slice(0, 3).join(",") || "(none)"}`),
    `  stage reviews: ${state.stageReviews?.length ?? 0}`,
    `  agendas: ${state.agendas?.length ?? 0}`,
    `  latest agenda: ${latestAgenda ? `${latestAgenda.status} (${latestAgenda.itemCount} item(s)) ${latestAgenda.primaryCommand}` : "(none)"}`,
    ...(latestAgenda ? [`  agenda record: ${latestAgenda.outPath}`] : []),
    ...(latestAgenda ? [`  agenda report: ${latestAgenda.reportPath}`] : []),
    `  estimated model/review cost: $${state.costEstimateUsd.toFixed(4)}`,
    `  stop reason: ${state.stopReason ?? "(none)"}`,
    `  next: ${state.nextRecommendedAction}`,
  ].join("\n");
}

export function renderResearchControllerAgenda(agenda: ControllerExecutionAgenda): string {
  return [
    "research controller agenda",
    `  run: ${agenda.runId}`,
    `  status: ${agenda.status}`,
    `  stage: ${agenda.currentStage}`,
    `  controller status: ${agenda.controllerStatus}`,
    `  primary: ${agenda.primaryCommand}`,
    `  items: ${agenda.items.length}`,
    `  active issue codes: ${agenda.activeIssueCodes.join(", ") || "(none)"}`,
    `  active blocker issue codes: ${agenda.activeBlockerIssueCodes.join(", ") || "(none)"}`,
    ...agenda.items.slice(0, 8).map(item => `  - P${item.priority} ${item.status}/${item.safety} issueCodes=${item.issueCodes?.join(",") || "none"} evidence=${item.evidenceRefs.slice(0, 3).join(",") || "none"} ${item.kind}: ${item.reason}`),
    `  agenda: ${agenda.outPath}`,
    `  report: ${agenda.reportPath}`,
  ].join("\n");
}

export function renderResearchControllerAgendaJson(agenda: ControllerExecutionAgenda): string {
  return `${JSON.stringify({ schemaVersion: 1, controllerExecutionAgenda: agenda }, null, 2)}\n`;
}

export function renderResearchControllerFollowAgenda(result: ControllerFollowAgendaResult): string {
  return [
    "research controller follow-agenda",
    `  run: ${result.runId}`,
    `  executed: ${result.executed}`,
    `  refused: ${result.refused}`,
    `  reason: ${result.reason}`,
    `  selected: ${result.selectedItem ? `${result.selectedItem.kind}/${result.selectedItem.status}/${result.selectedItem.safety}` : "(none)"}`,
    `  selected reason: ${result.selectedItem?.reason ?? "(none)"}`,
    `  selected issue codes: ${result.selectedItem?.issueCodes?.length ? result.selectedItem.issueCodes.join(", ") : "(none)"}`,
    `  selected evidence: ${result.selectedItem?.evidenceRefs?.length ? result.selectedItem.evidenceRefs.slice(0, 5).join(", ") : "(none)"}`,
    `  command: ${result.selectedItem?.command ?? "(none)"}`,
    `  status: ${result.state.status}`,
    `  stage: ${result.state.currentStage}`,
    `  state: ${result.statePath}`,
    `  record: ${result.outPath}`,
    `  report: ${result.reportPath}`,
  ].join("\n");
}

export function renderResearchControllerFollowAgendaJson(result: ControllerFollowAgendaResult): string {
  return `${JSON.stringify({ schemaVersion: 1, controllerFollowAgenda: result }, null, 2)}\n`;
}

export function renderResearchControllerFollowLoop(result: ControllerFollowLoopResult): string {
  return [
    "research controller follow-loop",
    `  run: ${result.runId}`,
    `  terminal: ${result.terminal}`,
    `  iterations: ${result.iterations.length}/${result.maxIterations}`,
    `  stopped: ${result.stoppedReason}`,
    `  status: ${result.state.status}`,
    `  stage: ${result.state.currentStage}`,
    `  state: ${result.statePath}`,
    `  record: ${result.outPath}`,
    `  report: ${result.reportPath}`,
    ...result.iterations.map(item => `  - #${item.iteration} ${item.selectedKind ?? "none"} issueCodes=${item.selectedIssueCodes.join(",") || "none"} evidence=${item.selectedEvidenceRefs.slice(0, 3).join(",") || "none"} follow=${item.followRecordPath} report=${item.followReportPath} executed=${item.executed} refused=${item.refused} ${item.beforeStage}/${item.beforeStatus} -> ${item.afterStage}/${item.afterStatus}; reason=${item.reason}`),
  ].join("\n");
}

export function renderResearchControllerFollowLoopJson(result: ControllerFollowLoopResult): string {
  return `${JSON.stringify({ schemaVersion: 1, controllerFollowLoop: result }, null, 2)}\n`;
}

export function renderResearchControllerBenchmark(result: ControllerBenchmarkResult): string {
  const regressions = uniqueText([...result.suite.regressions, ...result.trend.regressions]);
  return [
    "research controller benchmark",
    `  run: ${result.runId}`,
    `  suite: ${result.suiteDir}`,
    `  history: ${result.historyDir}`,
    `  cases: ${result.suite.caseCount}`,
    `  mean score: ${result.suite.meanScore.toFixed(3)}`,
    `  pass/warn/fail: ${result.suite.passCount}/${result.suite.warningCount}/${result.suite.failCount}`,
    `  trend: ${result.trend.trend} (${result.trend.runCount} run(s))`,
    `  regressions: ${regressions.length}`,
    ...regressions.slice(0, 5).map(item => `  - regression: ${item}`),
    `  capability: ${result.capabilityStatus}`,
    `  artifacts: ${result.attachedArtifacts.length}`,
    `  suite record: ${result.suite.outPath ?? "(not written)"}`,
    `  suite report: ${result.suite.reportPath ?? "(not written)"}`,
    `  trend record: ${result.trend.outPath ?? "(not written)"}`,
    `  trend report: ${result.trend.reportPath ?? "(not written)"}`,
    `  next: ${result.nextAction}`,
    `  record: ${result.outPath}`,
    `  report: ${result.reportPath}`,
  ].join("\n");
}

export function renderResearchControllerBenchmarkJson(result: ControllerBenchmarkResult): string {
  return `${JSON.stringify({ schemaVersion: 1, controllerBenchmark: result }, null, 2)}\n`;
}

function renderControllerBenchmarkMarkdown(result: ControllerBenchmarkResult): string {
  return [
    "# Controller Benchmark",
    "",
    `Benchmark: ${result.benchmarkId}`,
    `Generated: ${result.generatedAtIso}`,
    `Run ID: ${result.runId}`,
    `State: ${result.statePath}`,
    `Suite: ${result.suiteDir}`,
    `History: ${result.historyDir}`,
    `Capability status: ${result.capabilityStatus}`,
    "",
    "## Suite",
    "",
    `- Cases: ${result.suite.caseCount}`,
    `- Mean score: ${result.suite.meanScore.toFixed(3)}`,
    `- Pass/warn/fail: ${result.suite.passCount}/${result.suite.warningCount}/${result.suite.failCount}`,
    `- Regressions: ${result.suite.regressions.length}`,
    `- Suite JSON: ${result.suite.outPath ?? "(not written)"}`,
    `- Suite report: ${result.suite.reportPath ?? "(not written)"}`,
    "",
    "## Trend",
    "",
    `- Runs: ${result.trend.runCount}`,
    `- Trend: ${result.trend.trend}`,
    `- Latest score: ${result.trend.latestScore ?? "(none)"}`,
    `- Previous score: ${result.trend.previousScore ?? "(none)"}`,
    `- Delta: ${result.trend.delta ?? "(none)"}`,
    `- Trend JSON: ${result.trend.outPath ?? "(not written)"}`,
    `- Trend report: ${result.trend.reportPath ?? "(not written)"}`,
    "",
    "## Attached Artifacts",
    "",
    ...(result.attachedArtifacts.length ? result.attachedArtifacts.map(item => `- ${item.kind}: ${item.path}${item.sha256 ? ` (${item.sha256.slice(0, 12)})` : ""}`) : ["- none"]),
    "",
    "## Next Action",
    "",
    result.nextAction,
    "",
  ].join("\n");
}

function renderControllerDatasetSemanticAuditMarkdown(audit: ControllerDatasetSemanticAudit): string {
  return [
    "# Controller Dataset Semantic Audit",
    "",
    `Generated: ${audit.generatedAtIso}`,
    `Run ID: ${audit.runId}`,
    `State: ${audit.statePath}`,
    `Table summary: ${audit.summaryPath}`,
    `Rows: ${audit.rowCount}`,
    `Columns: ${audit.columnCount}`,
    `Status: ${audit.status}`,
    `Selected-role status: ${audit.selectedRoleStatus}`,
    `Issues: ${audit.issueCount} (${audit.blockerCount} blocker, ${audit.warningCount} warning)`,
    "",
    "## Issue Summary",
    "",
    ...(audit.issueCodeSummary.length
      ? audit.issueCodeSummary.slice(0, 20).map(item => `- [${item.severity}] ${item.code}: ${item.totalIssueCount} total, ${item.selectedIssueCount} selected; columns=${item.columns.join(", ") || "none"}`)
      : ["- None detected."]),
    "",
    "## Selected Role Summary",
    "",
    ...(audit.selectedRoleSummary.length
      ? audit.selectedRoleSummary.slice(0, 20).map(item => `- ${item.column} (${item.role}): ${item.issueCount} issue(s), ${item.blockerCount} blocker, ${item.warningCount} warning; codes=${item.codes.join(", ")}`)
      : ["- No selected-role semantic issues."]),
    "",
    "## Issues",
    "",
    ...(audit.issues.length
      ? audit.issues.slice(0, 50).map(issue => `- [${issue.severity}] ${issue.column}${issue.role ? ` (${issue.role})` : ""}: ${issue.code} - ${issue.message}`)
      : ["- None detected."]),
    ...(audit.issues.length > 50 ? [`- ${audit.issues.length - 50} additional issue(s) omitted from Markdown; see JSON.`] : []),
    "",
    "## Next Action",
    "",
    audit.nextAction,
    "",
  ].join("\n");
}

export function renderResearchControllerSupervisor(result: ControllerSupervisorResult): string {
  const latestRound = result.rounds.at(-1) ?? null;
  return [
    "research controller supervisor",
    `  run: ${result.runId}`,
    `  terminal: ${result.terminal}`,
    `  rounds: ${result.rounds.length}/${result.maxRounds}`,
    `  latest packet feasibility: ${latestRound?.runnerPacketFeasibilityReadiness ?? "(missing)"}${latestRound?.runnerPacketFeasibilityVerdict ? `; verdict: ${latestRound.runnerPacketFeasibilityVerdict}` : ""}`,
    `  stopped: ${result.stoppedReason}`,
    `  status: ${result.state.status}`,
    `  stage: ${result.state.currentStage}`,
    `  state: ${result.statePath}`,
    `  record: ${result.outPath}`,
    `  report: ${result.reportPath}`,
    ...result.rounds.map(item => {
      const evidenceRefs = uniqueText([
        item.runnerPacketPath,
        item.runnerPacketReportPath,
        item.runnerPacketFeasibilityPath,
        item.followLoopPath,
        item.followLoopReportPath,
        item.auditPath,
        item.auditReportPath,
      ].filter((ref): ref is string => Boolean(ref)));
      return `  - #${item.round} packet=${item.runnerPacketStatus} packetReport=${item.runnerPacketReportPath} feasibility=${item.runnerPacketFeasibilityReadiness ?? "missing"}${item.runnerPacketFeasibilityVerdict ? `:${item.runnerPacketFeasibilityVerdict}` : ""} safePrimary=${item.safeAgendaPrimary} followIterations=${item.followLoopIterations} followReport=${item.followLoopReportPath ?? "none"} issueCodes=${item.followLoopIssueCodes.join(",") || "none"} audit=${item.auditReadiness ?? "none"} auditReport=${item.auditReportPath ?? "none"} evidence=${evidenceRefs.slice(0, 6).join(",") || "none"} ${item.beforeStage}/${item.beforeStatus} -> ${item.afterStage}/${item.afterStatus}; reason=${item.reason}`;
    }),
  ].join("\n");
}

export function renderResearchControllerSupervisorJson(result: ControllerSupervisorResult): string {
  return `${JSON.stringify({ schemaVersion: 1, controllerSupervisor: result }, null, 2)}\n`;
}

export function renderResearchControllerAudit(audit: ControllerOperatorAudit): string {
  const failed = audit.checks.filter(check => check.status === "fail").length;
  const warnings = audit.checks.filter(check => check.status === "warning").length;
  const readinessBlockers = audit.readinessBlockers?.length
    ? audit.readinessBlockers
    : buildControllerOperatorAuditReadinessBlockers(audit.checks, audit.readiness);
  const readinessBlockerCodes = uniqueText(readinessBlockers.flatMap(blocker => blocker.issueCodes));
  return [
    "research controller audit",
    `  run: ${audit.runId}`,
    `  status: ${audit.status}`,
    `  readiness: ${audit.readiness}`,
    `  stage: ${audit.currentStage}`,
    `  controller status: ${audit.controllerStatus}`,
    `  model: ${audit.defaultControllerModel}`,
    `  model enabled: ${audit.modelControllerEnabled}`,
    `  strict model: ${audit.strictModelController}`,
    `  checks: ${audit.checks.length} (${failed} failed, ${warnings} warning)`,
    `  readiness blockers: ${readinessBlockers.length}${readinessBlockerCodes.length ? ` (${readinessBlockerCodes.join(", ")})` : ""}`,
    ...readinessBlockers.slice(0, 5).map(blocker => `  - readiness ${blocker.severity}/${blocker.category}${blocker.issueCodes.length ? ` (${blocker.issueCodes.join(", ")})` : ""}: ${blocker.message}; evidence=${blocker.evidenceRefs.slice(0, 3).join(",") || "(none)"}`),
    `  dataset semantic audit: ${audit.datasetSemanticAudit.status}/${audit.datasetSemanticAudit.selectedRoleStatus}`,
    `  next: ${audit.nextCommand}`,
    `  audit: ${audit.outPath}`,
    `  report: ${audit.reportPath}`,
  ].join("\n");
}

export function renderResearchControllerAuditJson(audit: ControllerOperatorAudit): string {
  return `${JSON.stringify({ schemaVersion: 1, controllerOperatorAudit: audit }, null, 2)}\n`;
}

export function renderResearchControllerEnvironment(preflight: ControllerEnvironmentPreflight): string {
  const failedChecks = preflight.checks.filter(check => check.status === "fail");
  const warningChecks = preflight.checks.filter(check => check.status === "warning");
  return [
    "research controller environment",
    `  run: ${preflight.runId}`,
    `  status: ${preflight.status}`,
    `  readiness: ${preflight.readiness}`,
    `  repo: ${preflight.repoRoot}`,
    `  node: ${preflight.nodeVersion ?? "(missing)"}`,
    `  npm: ${preflight.npmVersion ?? "(missing)"}`,
    `  cli dist: ${preflight.cliDist.present ? preflight.cliDist.path : "(missing)"}`,
    `  git dirty: ${preflight.git.dirty}`,
    `  checks: ${preflight.checks.length}`,
    `  failed checks: ${failedChecks.length}`,
    ...failedChecks.slice(0, 5).map(check => `  - fail ${check.id}/${check.category}: ${check.message}; evidence=${check.evidenceRefs.slice(0, 3).join(",") || "(none)"}`),
    `  warning checks: ${warningChecks.length}`,
    ...warningChecks.slice(0, 5).map(check => `  - warning ${check.id}/${check.category}: ${check.message}; evidence=${check.evidenceRefs.slice(0, 3).join(",") || "(none)"}`),
    `  next: ${preflight.nextAction}`,
    `  preflight: ${preflight.outPath}`,
    `  report: ${preflight.reportPath}`,
  ].join("\n");
}

export function renderResearchControllerEnvironmentJson(preflight: ControllerEnvironmentPreflight): string {
  return `${JSON.stringify({ schemaVersion: 1, controllerEnvironmentPreflight: preflight }, null, 2)}\n`;
}

async function writeControllerEnvironmentPreflight(preflight: ControllerEnvironmentPreflight): Promise<void> {
  await writeJson(preflight.outPath, { schemaVersion: 1, controllerEnvironmentPreflight: preflight });
  await writeFile(preflight.reportPath, renderControllerEnvironmentPreflightMarkdown(preflight));
}

export function renderResearchControllerCapabilities(manifest: ControllerCapabilityManifest): string {
  const missingEntries = manifest.entries.filter(entry => entry.status === "missing");
  const availableEntries = manifest.entries.filter(entry => entry.status === "available");
  const compactEntry = (entry: ControllerCapabilityManifestEntry) =>
    `${entry.failureMode}; artifacts=${entry.artifactKinds.slice(0, 6).join(",") || "(none)"}; evidence=${entry.evidenceRefs.slice(0, 3).join(",") || "(none)"}; tests=${entry.testRefs.slice(0, 3).join(",") || "(none)"}`;
  return [
    "research controller capabilities",
    `  run: ${manifest.runId}`,
    `  model: ${manifest.defaultControllerModel}`,
    `  entries: ${manifest.entries.length}`,
    `  covered: ${manifest.summary.covered}`,
    `  available: ${manifest.summary.available}`,
    `  missing: ${manifest.summary.missing}`,
    `  not applicable: ${manifest.summary.notApplicable}`,
    `  missing capabilities: ${missingEntries.length}${missingEntries.length ? ` (${missingEntries.map(entry => entry.id).join(", ")})` : ""}`,
    ...missingEntries.slice(0, 5).map(entry => `  - missing ${entry.id}: ${compactEntry(entry)}`),
    `  available capabilities: ${availableEntries.length}${availableEntries.length ? ` (${availableEntries.map(entry => entry.id).slice(0, 8).join(", ")})` : ""}`,
    ...availableEntries.slice(0, 5).map(entry => `  - available ${entry.id}: ${compactEntry(entry)}`),
    `  manifest: ${manifest.outPath}`,
    `  report: ${manifest.reportPath}`,
    ...manifest.entries.slice(0, 10).map(entry => `  - ${entry.status}: ${entry.id}`),
  ].join("\n");
}

export function renderResearchControllerCapabilitiesJson(manifest: ControllerCapabilityManifest): string {
  return `${JSON.stringify({ schemaVersion: 1, controllerCapabilityManifest: manifest }, null, 2)}\n`;
}

export function renderResearchControllerGoalAudit(audit: ControllerGoalAudit): string {
  const blockingRequirements = audit.requirements.filter(item => audit.blockingRequirementIds.includes(item.id));
  const blockingIssueCodes = uniqueText(blockingRequirements.flatMap(item => item.issueCodes ?? []));
  return [
    "research controller goal-audit",
    `  run: ${audit.runId}`,
    `  status: ${audit.status}`,
    `  readiness: ${audit.readiness}`,
    `  score: ${audit.score}`,
    `  proved: ${audit.requirements.filter(item => item.status === "proved").length}`,
    `  partial: ${audit.partialRequirementIds.length}`,
    `  missing: ${audit.missingRequirementIds.length}`,
    `  blocked: ${audit.blockingRequirementIds.length}`,
    `  blocking requirements: ${audit.blockingRequirementIds.join(", ") || "none"}${blockingIssueCodes.length ? ` (${blockingIssueCodes.join(", ")})` : ""}`,
    ...blockingRequirements.slice(0, 8).map(item => `  - blocking ${item.id}${item.issueCodes?.length ? ` (${item.issueCodes.join(", ")})` : ""}: ${item.gaps.join("; ") || item.nextAction}; evidence=${item.evidenceRefs.slice(0, 3).join(",") || "(none)"}`),
    `  next: ${audit.nextCommand}`,
    `  audit: ${audit.outPath}`,
    `  report: ${audit.reportPath}`,
  ].join("\n");
}

export function renderResearchControllerGoalAuditJson(audit: ControllerGoalAudit): string {
  return `${JSON.stringify({ schemaVersion: 1, controllerGoalAudit: audit }, null, 2)}\n`;
}

export function renderResearchControllerCompletionAudit(audit: ControllerCompletionAudit): string {
  const failedRequirements = audit.requirements.filter(item => item.status === "failed");
  const warningRequirements = audit.requirements.filter(item => item.status === "warning");
  return [
    "research controller completion-audit",
    `  run: ${audit.runId}`,
    `  status: ${audit.status}`,
    `  readiness: ${audit.readiness}`,
    `  failed: ${failedRequirements.length}`,
    `  warnings: ${warningRequirements.length}`,
    `  missing: ${audit.missingEvidence.join(", ") || "(none)"}`,
    ...(failedRequirements.length
      ? ["  failed requirements:", ...failedRequirements.slice(0, 8).map(item => `    - ${item.id} [${item.scope}${item.issueCodes?.length ? `:${item.issueCodes.join(",")}` : ""}]: ${item.finding} evidence=${item.evidenceRefs.length ? item.evidenceRefs.slice(0, 3).join(",") : "(none)"}`)]
      : ["  failed requirements: (none)"]),
    ...(warningRequirements.length
      ? ["  warning requirements:", ...warningRequirements.slice(0, 8).map(item => `    - ${item.id} [${item.scope}${item.issueCodes?.length ? `:${item.issueCodes.join(",")}` : ""}]: ${item.finding} evidence=${item.evidenceRefs.length ? item.evidenceRefs.slice(0, 3).join(",") : "(none)"}`)]
      : ["  warning requirements: (none)"]),
    `  next: ${audit.nextAction}`,
    `  record: ${audit.outPath}`,
    `  report: ${audit.reportPath}`,
  ].join("\n");
}

export function renderResearchControllerCompletionAuditJson(audit: ControllerCompletionAudit): string {
  return `${JSON.stringify({ schemaVersion: 1, controllerCompletionAudit: audit }, null, 2)}\n`;
}

function boundedKeyArtifactReportEntries(entries: Array<[string, string | null]>): Array<[string, string | null]> {
  const priorityKeys = ["issueLedger", "stageReview", "actionReadiness", "actionContract", "terminalHandoff", "nextAction", "reentryPlan"];
  const selected = new Map<string, string | null>(entries.slice(0, 10));
  for (const key of priorityKeys) {
    const entry = entries.find(([entryKey]) => entryKey === key);
    if (entry) selected.set(entry[0], entry[1]);
    if (selected.size >= 16) break;
  }
  return Array.from(selected.entries());
}

export function renderResearchControllerGoldenPacket(packet: ControllerGoldenPacket): string {
  const issueSummaryCodes = uniqueText(packet.issueSummary.flatMap(item => item.issueCodes));
  const keyReportEntries = Object.entries(packet.keyArtifactReports);
  const presentKeyReportCount = keyReportEntries.filter(([, value]) => Boolean(value)).length;
  const visibleKeyReportEntries = boundedKeyArtifactReportEntries(keyReportEntries);
  return [
    "research controller golden-packet",
    `  run: ${packet.runId}`,
    `  status: ${packet.status}`,
    `  stage: ${packet.stage}`,
    `  method: ${packet.method ?? "(none)"}`,
    `  promotable: ${packet.readiness.promotable}`,
    `  run inspection: ${packet.readiness.runInspection ?? "missing"}`,
    `  feasibility readiness: ${packet.readiness.feasibilityReadiness ?? "(missing)"}${packet.readiness.feasibilityVerdict ? `; verdict: ${packet.readiness.feasibilityVerdict}` : ""}`,
    `  completion audit: ${packet.readiness.completionAudit}`,
    `  self evaluation: ${packet.readiness.selfEvaluation}`,
    `  blockers: ${packet.blockers.length}`,
    ...packet.blockers.slice(0, 5).map(item => `  - blocker: ${item}`),
    `  warnings: ${packet.warnings.length}`,
    ...packet.warnings.slice(0, 5).map(item => `  - warning: ${item}`),
    `  active issue codes: ${packet.activeIssueCodes.join(", ") || "(none)"}`,
    `  active blocker issue codes: ${packet.activeBlockerIssueCodes.join(", ") || "(none)"}`,
    `  issue summary: ${packet.issueSummary.length}${issueSummaryCodes.length ? ` (${issueSummaryCodes.join(", ")})` : ""}`,
    ...packet.issueSummary.slice(0, 5).map(item => `  - issue ${item.severity}/${item.category}${item.issueCodes.length ? ` (${item.issueCodes.join(", ")})` : ""}: ${item.message}; evidence=${item.evidenceRefs.length ? item.evidenceRefs.slice(0, 3).join(",") : "(none)"}`),
    `  next: ${packet.nextAction}`,
    ...(packet.recommendedCommands.length
      ? packet.recommendedCommands.map((command, index) => `  command ${index + 1}: ${command}`)
      : ["  commands: (none)"]),
    `  key reports: ${presentKeyReportCount}/${keyReportEntries.length}`,
    ...visibleKeyReportEntries.map(([key, value]) => `  - report ${key}: ${value ?? "not report-backed"}`),
    `  packet: ${packet.outPath}`,
    `  report: ${packet.reportPath}`,
  ].join("\n");
}

export function renderResearchControllerGoldenPacketJson(packet: ControllerGoldenPacket): string {
  return `${JSON.stringify({ schemaVersion: 1, controllerGoldenPacket: packet }, null, 2)}\n`;
}

export function renderResearchControllerRepairCycle(result: ControllerRepairCycleResult): string {
  return [
    "research controller repair-cycle",
    `  run: ${result.runId}`,
    `  status: ${result.status}`,
    `  before: ${result.beforeStage}/${result.beforeStatus}`,
    `  after: ${result.afterStage}/${result.afterStatus}`,
    `  reentry: ${result.reentryStatus}`,
    `  autoRepairEligible: ${result.autoRepairEligible}`,
    `  repairPlugin: ${result.repairPlugin ?? "(none)"}`,
    `  reentry plan: ${result.reentryPlanPath}`,
    `  reentry report: ${result.reentryPlanReportPath}`,
    `  run invocation: ${result.runResultPath ?? "(not run)"}`,
    `  run invocation report: ${result.runResultReportPath ?? "(not run)"}`,
    `  completion audit: ${result.completionAuditPath ?? "(not run)"}`,
    `  completion audit report: ${result.completionAuditReportPath ?? "(not run)"}`,
    `  reason: ${result.reason}`,
    `  record: ${result.outPath}`,
    `  report: ${result.reportPath}`,
  ].join("\n");
}

export function renderResearchControllerRepairCycleJson(result: ControllerRepairCycleResult): string {
  return `${JSON.stringify({ schemaVersion: 1, controllerRepairCycle: result }, null, 2)}\n`;
}

export function renderResearchControllerDoctor(result: ControllerDoctorResult): string {
  return [
    "research controller doctor",
    `  run: ${result.runId}`,
    `  status: ${result.status}`,
    `  stage: ${result.currentStage}`,
    `  controller status: ${result.controllerStatus}`,
    `  safe auto continue: ${result.safeToAutoContinue}`,
    `  runner feasibility readiness: ${result.summaries.runnerPacket.feasibilityReadiness.status ?? "(missing)"}${result.summaries.runnerPacket.feasibilityReadiness.verdict ? `; verdict: ${result.summaries.runnerPacket.feasibilityReadiness.verdict}` : ""}`,
    `  blockers: ${result.blockers.length}`,
    ...result.blockers.slice(0, 5).map(item => `  - blocker: ${item}`),
    `  warnings: ${result.warnings.length}`,
    ...result.warnings.slice(0, 5).map(item => `  - warning: ${item}`),
    `  active issue codes: ${result.activeIssueCodes.join(", ") || "(none)"}`,
    `  active blocker issue codes: ${result.activeBlockerIssueCodes.join(", ") || "(none)"}`,
    `  evidence: operator=${result.summaries.operatorAudit.path}; completion=${result.summaries.completionAudit.path}; runner=${result.summaries.runnerPacket.path}; reentry=${result.summaries.reentryPlan.path}`,
    `  reports: operator=${result.summaries.operatorAudit.reportPath}; completion=${result.summaries.completionAudit.reportPath}; runner=${result.summaries.runnerPacket.reportPath}; capabilities=${result.summaries.capabilities.reportPath}; reentry=${result.summaries.reentryPlan.reportPath}`,
    `  evidence refs: ${result.evidenceRefs.length}`,
    ...result.evidenceRefs.slice(0, 5).map(ref => `  - evidence: ${ref}`),
    `  next: ${result.recommendedCommand}`,
    `  doctor: ${result.outPath}`,
    `  report: ${result.reportPath}`,
  ].join("\n");
}

export function renderResearchControllerDoctorJson(result: ControllerDoctorResult): string {
  return `${JSON.stringify({ schemaVersion: 1, controllerDoctor: result }, null, 2)}\n`;
}

export function renderResearchControllerOperate(result: ControllerOperateResult): string {
  const latestCycle = result.cycles.at(-1) ?? null;
  const issueCodes = uniqueText(result.cycles.flatMap(cycle => cycle.issueCodes));
  return [
    "research controller operate",
    `  run: ${result.runId}`,
    `  status: ${result.status}`,
    `  cycles: ${result.cycles.length}/${result.maxCycles}`,
    `  final doctor: ${result.finalDoctorStatus ?? "(none)"}`,
    `  latest doctor feasibility: ${latestCycle?.doctorFeasibilityReadiness ?? "(missing)"}${latestCycle?.doctorFeasibilityVerdict ? `; verdict: ${latestCycle.doctorFeasibilityVerdict}` : ""}`,
    `  stage: ${result.state.currentStage}`,
    `  controller status: ${result.state.status}`,
    `  reason: ${result.stoppedReason}`,
    `  issue codes: ${issueCodes.join(", ") || "(none)"}`,
    ...result.cycles.map(cycle => {
      const evidenceRefs = uniqueText([
        cycle.doctorPath,
        cycle.doctorReportPath,
        cycle.doctorFeasibilityPath,
        cycle.actionPath,
        cycle.actionReportPath,
      ].filter((ref): ref is string => Boolean(ref)));
      return `  - #${cycle.cycle} action=${cycle.action} doctor=${cycle.doctorStatus} doctorReport=${cycle.doctorReportPath} actionReport=${cycle.actionReportPath ?? "none"} issueCodes=${cycle.issueCodes.join(",") || "none"} evidence=${evidenceRefs.slice(0, 5).join(",") || "none"} ${cycle.beforeStage}/${cycle.beforeStatus} -> ${cycle.afterStage}/${cycle.afterStatus}; reason=${cycle.reason}`;
    }),
    `  record: ${result.outPath}`,
    `  report: ${result.reportPath}`,
  ].join("\n");
}

export function renderResearchControllerOperateJson(result: ControllerOperateResult): string {
  return `${JSON.stringify({ schemaVersion: 1, controllerOperate: result }, null, 2)}\n`;
}

export function renderResearchControllerStart(result: ControllerStartResult): string {
  const launchBlockerCodes = uniqueText(result.runbookSummary.launchBlockers.flatMap(item => item.issueCodes));
  return [
    "research controller start",
    `  run: ${result.runId}`,
    `  status: ${result.status}`,
    `  mode: ${result.mode}`,
    `  stage: ${result.statusSummary.currentStage}`,
    `  controller status: ${result.statusSummary.controllerStatus}`,
    `  first-read status: ${result.statusSummary.status}`,
    `  ready to launch: ${result.statusSummary.readyToLaunch}`,
    `  safe auto continue: ${result.statusSummary.safeToAutoContinue}`,
    `  feasibility readiness: ${result.statusSummary.feasibilityReadiness ?? "(missing)"}${result.statusSummary.feasibilityVerdict ? `; verdict: ${result.statusSummary.feasibilityVerdict}` : ""}`,
    `  blockers: ${result.statusSummary.blockers.length}`,
    ...result.statusSummary.blockers.slice(0, 5).map(item => `  - blocker: ${item}`),
    `  warnings: ${result.statusSummary.warnings.length}`,
    ...result.statusSummary.warnings.slice(0, 5).map(item => `  - warning: ${item}`),
    `  active issue codes: ${result.statusSummary.activeIssueCodes.join(", ") || "(none)"}`,
    `  active blocker issue codes: ${result.statusSummary.activeBlockerIssueCodes.join(", ") || "(none)"}`,
    `  launch blockers: ${result.runbookSummary.launchBlockers.length}${launchBlockerCodes.length ? ` (${launchBlockerCodes.join(", ")})` : ""}`,
    ...result.runbookSummary.launchBlockers.slice(0, 5).map(item => `  - launch ${item.severity}/${item.category}${item.issueCodes.length ? ` (${item.issueCodes.join(", ")})` : ""}: ${item.message}; evidence=${item.evidenceRefs.slice(0, 3).join(",") || "(none)"}`),
    `  operate: ${result.operateSummary.requested ? result.operateSummary.status ?? "unknown" : "not requested"}`,
    `  next: ${result.nextAction}`,
    `  record: ${result.outPath}`,
    `  report: ${result.reportPath}`,
  ].join("\n");
}

export function renderResearchControllerStartJson(result: ControllerStartResult): string {
  return `${JSON.stringify({ schemaVersion: 1, controllerStart: result }, null, 2)}\n`;
}

export function renderResearchControllerRunbook(result: ControllerLaunchRunbook): string {
  const launchBlockerCodes = uniqueText(result.launchBlockers.flatMap(item => item.issueCodes));
  return [
    "research controller runbook",
    `  run: ${result.runId}`,
    `  status: ${result.status}`,
    `  ready to launch: ${result.readyToLaunch}`,
    `  model: ${result.defaultControllerModel}`,
    `  first-read: ${result.firstReadCommand}`,
    `  readiness: ${result.readinessCommand}`,
    `  launch: ${result.launchCommand}`,
    `  inspection: ${result.inspectionCommand}`,
    `  doctor: ${result.doctor.status}`,
    `  runner feasibility readiness: ${result.runnerPacket.feasibilityReadiness.status ?? "(missing)"}${result.runnerPacket.feasibilityReadiness.verdict ? `; verdict: ${result.runnerPacket.feasibilityReadiness.verdict}` : ""}`,
    `  environment: ${result.environment.readiness}`,
    `  blockers: ${result.doctor.blockers.length}`,
    `  launch blockers: ${result.launchBlockers.length}${launchBlockerCodes.length ? ` (${launchBlockerCodes.join(", ")})` : ""}`,
    ...result.launchBlockers.slice(0, 5).map(item => `  - launch ${item.severity}/${item.category}${item.issueCodes.length ? ` (${item.issueCodes.join(", ")})` : ""}: ${item.message}; evidence=${item.evidenceRefs.slice(0, 3).join(",") || "(none)"}`),
    `  warnings: ${result.doctor.warnings.length + result.environment.optionalEnvWarnings.length}`,
    `  active issue codes: ${result.activeIssueCodes.join(", ") || "(none)"}`,
    `  active blocker issue codes: ${result.activeBlockerIssueCodes.join(", ") || "(none)"}`,
    `  reports: doctor=${result.handoffArtifacts.doctor.reportPath}; runner=${result.handoffArtifacts.runnerPacket.reportPath}; audit=${result.handoffArtifacts.operatorAudit.reportPath}; environment=${result.handoffArtifacts.environment.reportPath ?? "(none)"}; completion=${result.handoffArtifacts.completionAudit.reportPath}; capabilities=${result.handoffArtifacts.capabilities.reportPath}; reentry=${result.handoffArtifacts.reentryPlan.reportPath}; supervisor=${result.handoffArtifacts.supervisor.reportPath ?? "(none)"}; repair=${result.handoffArtifacts.repairCycle.reportPath ?? "(none)"}`,
    `  artifacts to inspect: ${result.artifactsToInspect.length}`,
    ...result.artifactsToInspect.slice(0, 5).map(item => `  - inspect: ${item}`),
    `  record: ${result.outPath}`,
    `  report: ${result.reportPath}`,
  ].join("\n");
}

export function renderResearchControllerRunbookJson(result: ControllerLaunchRunbook): string {
  return `${JSON.stringify({ schemaVersion: 1, controllerRunbook: result }, null, 2)}\n`;
}

export function renderResearchControllerStatus(result: ControllerUnifiedStatus): string {
  const keyReportEntries = Object.entries(result.keyArtifactReports);
  const presentKeyReportCount = keyReportEntries.filter(([, value]) => Boolean(value)).length;
  const visibleKeyReportEntries = boundedKeyArtifactReportEntries(keyReportEntries);
  return [
    "research controller status",
    `  run: ${result.runId}`,
    `  status: ${result.status}`,
    `  stage: ${result.currentStage}`,
    `  controller status: ${result.controllerStatus}`,
    `  safe auto continue: ${result.safeToAutoContinue}`,
    `  ready to launch: ${result.readyToLaunch}`,
    `  promotable: ${result.promotable}`,
    `  doctor: ${result.summary.doctorStatus}`,
    `  runbook: ${result.summary.runbookStatus}`,
    `  golden packet: ${result.summary.goldenPacketStatus}`,
    `  feasibility readiness: ${result.summary.feasibilityReadiness ?? "(missing)"}${result.summary.feasibilityVerdict ? `; verdict: ${result.summary.feasibilityVerdict}` : ""}`,
    `  blockers: ${result.blockers.length}`,
    ...result.blockers.slice(0, 5).map(item => `  - blocker: ${item}`),
    `  warnings: ${result.warnings.length}`,
    ...result.warnings.slice(0, 5).map(item => `  - warning: ${item}`),
    `  active issue codes: ${result.activeIssueCodes.join(", ") || "(none)"}`,
    `  active blocker issue codes: ${result.activeBlockerIssueCodes.join(", ") || "(none)"}`,
    `  evidence: doctor=${result.artifactPaths.doctor}; runbook=${result.artifactPaths.runbook}; golden=${result.artifactPaths.goldenPacket}; runner=${result.artifactPaths.runnerPacket}`,
    `  reports: doctor=${result.artifactPaths.doctorReport}; runbook=${result.artifactPaths.runbookReport}; golden=${result.artifactPaths.goldenPacketReport}; runner=${result.artifactPaths.runnerPacketReport}`,
    `  key reports: ${presentKeyReportCount}/${keyReportEntries.length}`,
    ...visibleKeyReportEntries.map(([key, value]) => `  - report ${key}: ${value ?? "not report-backed"}`),
    `  next: ${result.recommendedCommand}`,
    `  record: ${result.outPath}`,
    `  report: ${result.reportPath}`,
  ].join("\n");
}

export function renderResearchControllerStatusJson(result: ControllerUnifiedStatus): string {
  return `${JSON.stringify({ schemaVersion: 1, controllerStatus: result }, null, 2)}\n`;
}

export function renderResearchControllerRunnerPacket(packet: ControllerModelRunnerPacket): string {
  const handoffBlockerCodes = uniqueText(packet.handoffBlockers.flatMap(item => item.issueCodes));
  return [
    "research controller runner-packet",
    `  run: ${packet.runId}`,
    `  status: ${packet.status}`,
    `  stage: ${packet.currentStage}`,
    `  model: ${packet.defaultControllerModel}`,
    `  safe auto execute: ${packet.safeToAutoExecute}`,
    `  feasibility readiness: ${packet.feasibilityReadiness.status ?? "(missing)"}${packet.feasibilityReadiness.verdict ? `; verdict: ${packet.feasibilityReadiness.verdict}` : ""}`,
    `  handoff blockers: ${packet.handoffBlockers.length}${handoffBlockerCodes.length ? ` (${handoffBlockerCodes.join(", ")})` : ""}`,
    ...packet.handoffBlockers.slice(0, 5).map(item => `  - handoff ${item.severity}/${item.category}${item.issueCodes.length ? ` (${item.issueCodes.join(", ")})` : ""}: ${item.message}; evidence=${item.evidenceRefs.slice(0, 3).join(",") || "(none)"}`),
    `  active issue codes: ${packet.activeIssueCodes.join(", ") || "(none)"}`,
    `  active blocker issue codes: ${packet.activeBlockerIssueCodes.join(", ") || "(none)"}`,
    `  reports: agenda=${packet.agenda.reportPath}; audit=${packet.audit.reportPath}; environment=${packet.environment.reportPath}; capabilities=${packet.capabilities.reportPath}`,
    `  evidence refs: ${packet.evidenceRefs.length}`,
    ...(packet.evidenceRefs.length ? packet.evidenceRefs.slice(0, 5).map(ref => `  - evidence: ${ref}`) : []),
    `  next: ${packet.recommendedCommand}`,
    ...(packet.agendaCommands.length
      ? packet.agendaCommands.slice(0, 5).map((command, index) => `  agenda command ${index + 1}: ${command}`)
      : ["  agenda commands: (none)"]),
    `  packet: ${packet.outPath}`,
    `  report: ${packet.reportPath}`,
  ].join("\n");
}

export function renderResearchControllerRunnerPacketJson(packet: ControllerModelRunnerPacket): string {
  return `${JSON.stringify({ schemaVersion: 1, controllerModelRunnerPacket: packet }, null, 2)}\n`;
}

async function buildControllerModelRunnerPacket(
  state: ControllerState,
  agenda: ControllerExecutionAgenda,
  audit: ControllerOperatorAudit,
  capabilities: ControllerCapabilityManifest,
): Promise<ControllerModelRunnerPacket> {
  const packetId = `controller_model_runner_packet_${String(state.artifacts.filter(item => item.kind === "controller-model-runner-packet").length + 1).padStart(3, "0")}`;
  const outPath = path.join(state.rootDir, `${packetId}.json`);
  const reportPath = path.join(state.rootDir, `${packetId}.md`);
  const nextActionRaw = await readJsonIfPresent(path.join(state.rootDir, "controller-next-action.json"));
  const nextAction = (valueAtPath(nextActionRaw, "controllerNextAction") ?? nextActionRaw) as ControllerNextActionPacket | null;
  const missing = capabilities.entries.filter(entry => entry.status === "missing").map(entry => entry.id);
  const available = capabilities.entries.filter(entry => entry.status === "available").map(entry => entry.id);
  const covered = capabilities.entries.filter(entry => entry.status === "covered").map(entry => entry.id);
  const failedChecks = audit.checks.filter(check => check.status === "fail").map(check => check.id);
  const warningChecks = audit.checks.filter(check => check.status === "warning").map(check => check.id);
  const datasetSemanticAudit = await loadControllerDatasetSemanticAuditSummary(state);
  const feasibility = await loadControllerFeasibilitySummary(state);
  const feasibilityReadiness = controllerInspectionFeasibilityReadiness(null, feasibility);
  const latestIssueLedger = await readLatestControllerIssueLedger(state);
  const latestRepairVerificationPath = latestArtifactPath(state, "controller-repair-verification");
  const latestRepairVerificationRaw = latestRepairVerificationPath ? await readJsonIfPresent(latestRepairVerificationPath) : null;
  const latestRepairVerification = valueAtPath(latestRepairVerificationRaw, "controllerRepairVerification") as Partial<ControllerRepairVerification> | null;
  const latestRepairVerificationReportPath = latestArtifactPath(state, "controller-repair-verification-report");
  const repairVerificationPromptLine = state.repairs.length
    ? `Repair verification: status=${latestRepairVerification?.status ?? "missing"}; freshExternalReviewRequired=${latestRepairVerification?.freshExternalReviewRequired ?? "unknown"}; nextAction=${latestRepairVerification?.nextAction ?? "inspect repair verification"}.`
    : "Repair verification: no reviewer-driven repairs recorded.";
  const status: ControllerModelRunnerPacket["status"] = audit.readiness === "complete" || state.status === "complete"
    ? "complete"
    : failedChecks.length || audit.readiness === "blocked"
      ? "blocked"
      : audit.readiness === "ready_for_review"
        ? "review"
        : "ready";
  const recommendedCommand = status === "complete"
    ? `agenteer research controller-status --state ${quotePath(state.statePath)}`
    : agenda.primaryCommand || audit.nextCommand || `agenteer research controller-run --state ${quotePath(state.statePath)} --max-steps 4`;
  const safeToAutoExecute = status === "ready" && agenda.items.some(item => item.command === recommendedCommand && item.safety === "safe" && item.status === "executable");
  const agendaCommands = uniqueText(agenda.items.map(item => item.command).filter(command => command.length > 0));
  const handoffBlockers = buildControllerModelRunnerHandoffBlockers(audit, datasetSemanticAudit, latestIssueLedger, nextAction);
  const activeIssueCodes = uniqueText([...(agenda.activeIssueCodes ?? []), ...handoffBlockers.flatMap(item => item.issueCodes)]);
  const activeBlockerIssueCodes = enforceableControllerBlockerCodes([
    ...(agenda.activeBlockerIssueCodes ?? []),
    ...handoffBlockers.filter(item => item.severity === "blocker").flatMap(item => item.issueCodes),
  ]);
  const operatingRules = [
    "Treat this packet, controller-state.json, and referenced artifacts as the only authoritative state; do not rely on chat memory.",
    "Use controller-status as the first-read readiness command/tool before deciding whether to launch, resume, patch, or stop.",
    "If controller-status is gathered through controller-run-agenteer, treat the structured recentToolResults.controllerStatus summary as readiness evidence even when the underlying status command exits nonzero for a blocked pipeline.",
    "Run controller-env or controller-audit first if this packet is stale, the repo changed, or local tooling changed.",
    "Prefer controller-follow-agenda or controller-follow-loop over ad hoc commands when safeToAutoExecute is true.",
    "Do not mutate source except through controller-propose-patch, controller-apply-patch, controller-verify-patch, and controller-rollback-patch.",
    "Do not edit data paths, environment paths, credentials, or external domain repositories through controller input patches.",
    "Stop for human review when feasibility, cost, artifact integrity, model decision quality, or reviewer findings block safe progress.",
    "Use strict model mode when a model decision must count as the controller rather than deterministic automation.",
    "After every action, inspect the new action contract, stage review, issue ledger, and agenda before continuing.",
  ];
  const allowedCommands = uniqueText([
    "agenteer research controller-env --state <controller-state.json>",
    "agenteer research controller-status --state <controller-state.json>",
    "agenteer research controller-audit --state <controller-state.json>",
    "agenteer research controller-doctor --state <controller-state.json>",
    "agenteer research controller-capabilities --state <controller-state.json>",
    "agenteer research controller-agenda --state <controller-state.json>",
    "agenteer research controller-follow-agenda --state <controller-state.json>",
    "agenteer research controller-follow-loop --state <controller-state.json>",
    "agenteer research controller-operate --state <controller-state.json>",
    "agenteer research controller-supervise --state <controller-state.json>",
    "agenteer research controller-runbook --state <controller-state.json>",
    "agenteer research controller-benchmark --state <controller-state.json>",
    "agenteer research controller-run --state <controller-state.json>",
    "agenteer research controller-step --state <controller-state.json>",
    "agenteer research controller-inspect --state <controller-state.json>",
    "agenteer research controller-tool --state <controller-state.json> --tool <allowed-tool>",
    "agenteer research controller-patch --state <controller-state.json> --patch <safe-json>",
    "agenteer research controller-resume --state <controller-state.json>",
    ...agendaCommands,
  ]);
  const forbiddenActions = [
    "Do not run arbitrary shell through the controller.",
    "Do not apply patches outside repository path bounds.",
    "Do not claim a study is promotion-ready without run-inspection, method QA, manuscript QA, and completion audit evidence.",
    "Do not ignore activeBlockerIssueCodes in runner packets or agendas; they are stable hard-stop identifiers.",
    "Do not treat advisory-only issueCodes as automatic blockers when activeBlockerIssueCodes is empty.",
    "Do not continue after a blocked gate except through an explicit patch, repair, or human-reviewed policy change.",
    "Do not treat generated outputs as validated if controller action contracts or required artifact hashes are missing.",
  ];
  const systemPrompt = [
    "You are a fresh Research Controller Agent for Agenteer.",
    "Your job is to operate the saved controller state through bounded CLI commands and artifact-backed decisions.",
    "You must not rely on prior chat context. Use only this runner packet, controller-state.json, and referenced artifacts.",
    "Treat activeBlockerIssueCodes as authoritative hard-stop identifiers. Treat issueCodes outside that list as context unless their source artifact marks them as blocker severity.",
    "Prefer safe continuation through controller-follow-agenda/controller-follow-loop when the packet says it is safe.",
    "Stop for human review rather than guessing when blockers, unsupported methods, unsafe cost, missing evidence, or failed audits appear.",
  ].join(" ");
  const userPrompt = [
    `Objective: continue controller run ${state.runId}.`,
    `State: ${state.statePath}`,
    `Current stage/status: ${state.currentStage}/${state.status}`,
    `Recommended command: ${recommendedCommand}`,
    `Safe to auto-execute: ${safeToAutoExecute}`,
    "First-read command: agenteer research controller-status --state <controller-state.json>",
    "First-read tools: request controller-status directly, or request controller-run-agenteer with research controller-status --state <current-controller-state> --json when CLI introspection evidence is needed.",
    `Audit readiness: ${audit.readiness}; failed checks: ${failedChecks.join(", ") || "none"}; warning checks: ${warningChecks.join(", ") || "none"}.`,
    `Active issue codes: ${activeIssueCodes.join(", ") || "none"}.`,
    `Active blocker issue codes: ${activeBlockerIssueCodes.join(", ") || "none"}.`,
    `Handoff blockers: ${handoffBlockers.length ? handoffBlockers.slice(0, 8).map(item => `${item.severity}/${item.category}${item.issueCodes.length ? `/${item.issueCodes.join("+")}` : ""}: ${item.message}`).join(" | ") : "none"}.`,
    `Feasibility readiness: ${feasibilityReadiness.status ?? "missing"}${feasibilityReadiness.verdict ? `; verdict=${feasibilityReadiness.verdict}` : ""}.`,
    `Dataset semantic audit: present=${datasetSemanticAudit.present}; status=${datasetSemanticAudit.status}; selectedRoleStatus=${datasetSemanticAudit.selectedRoleStatus}; issues=${datasetSemanticAudit.issueCount}.`,
    repairVerificationPromptLine,
    `Capability missing: ${missing.join(", ") || "none"}.`,
    "Before acting, read the packet evidence refs needed for the recommended command. After acting, rerun controller-runner-packet or controller-audit.",
  ].join("\n");
  const evidenceRefs = uniqueText([
    state.statePath,
    agenda.outPath,
    agenda.reportPath,
    audit.outPath,
    audit.reportPath,
    audit.environment.outPath,
    audit.environment.reportPath,
    feasibility.path,
    datasetSemanticAudit.path,
    datasetSemanticAudit.reportPath,
    capabilities.outPath,
    capabilities.reportPath,
    nextAction?.outPath,
    nextAction?.reportPath,
    latestRepairVerificationPath,
    latestRepairVerificationReportPath,
    ...state.artifacts.slice(-20).map(artifactRef => artifactRef.path),
  ].filter((item): item is string => Boolean(item)));
  return {
    schemaVersion: 1,
    generatedAtIso: nowIso(),
    packetId,
    runId: state.runId,
    statePath: state.statePath,
    status,
    currentStage: state.currentStage,
    controllerStatus: state.status,
    defaultControllerModel: `${state.policy.controller.provider}:${state.policy.controller.model}`,
    strictModelRecommended: state.policy.requireControllerModel || state.policy.controller.enabled,
    recommendedCommand,
    safeToAutoExecute,
    maxRecommendedSteps: 5,
    systemPrompt,
    userPrompt,
    operatingRules,
    allowedCommands,
    agendaCommands,
    forbiddenActions,
    activeIssueCodes,
    activeBlockerIssueCodes,
    handoffBlockers,
    evidenceRefs,
    feasibilityReadiness: {
      present: feasibility.present,
      status: feasibilityReadiness.status,
      verdict: feasibilityReadiness.verdict,
      path: feasibility.path,
      blockers: feasibility.blockers,
      warnings: feasibility.warnings,
    },
    datasetSemanticAudit,
    agenda: {
      agendaId: agenda.agendaId,
      status: agenda.status,
      primaryCommand: agenda.primaryCommand,
      activeIssueCodes: agenda.activeIssueCodes,
      activeBlockerIssueCodes: agenda.activeBlockerIssueCodes,
      sourceArtifacts: agenda.sourceArtifacts,
      path: agenda.outPath,
      reportPath: agenda.reportPath,
      items: agenda.items.map(item => ({ id: item.id, kind: item.kind, status: item.status, safety: item.safety, source: item.source, command: item.command, reason: item.reason, issueCodes: item.issueCodes })),
    },
    audit: {
      status: audit.status,
      readiness: audit.readiness,
      nextCommand: audit.nextCommand,
      path: audit.outPath,
      reportPath: audit.reportPath,
      failedChecks,
      warningChecks,
    },
    environment: {
      status: audit.environment.status,
      readiness: audit.environment.readiness,
      repoRoot: audit.environment.repoRoot,
      nodeVersion: audit.environment.nodeVersion,
      npmVersion: audit.environment.npmVersion,
      nextAction: audit.environment.nextAction,
      outPath: audit.environment.outPath,
      reportPath: audit.environment.reportPath,
    },
    capabilities: {
      summary: capabilities.summary,
      defaultControllerModel: capabilities.defaultControllerModel,
      path: capabilities.outPath,
      reportPath: capabilities.reportPath,
      missing,
      available,
      covered,
    },
    nextAction: nextAction?.schemaVersion ? nextAction : null,
    outPath,
    reportPath,
  };
}

function buildControllerModelRunnerHandoffBlockers(
  audit: ControllerOperatorAudit,
  datasetSemanticAudit: Awaited<ReturnType<typeof loadControllerDatasetSemanticAuditSummary>>,
  issueLedger: ControllerIssueLedger | null,
  nextAction: ControllerNextActionPacket | null,
): ControllerModelRunnerPacket["handoffBlockers"] {
  const blockers: ControllerModelRunnerPacket["handoffBlockers"] = [];
  const add = (
    category: ControllerModelRunnerPacket["handoffBlockers"][number]["category"],
    severity: ControllerModelRunnerPacket["handoffBlockers"][number]["severity"],
    message: string,
    issueCodes: string[] = [],
    evidenceRefs: string[] = [],
  ) => {
    const clean = message.trim();
    if (!clean) return;
    blockers.push({
      category,
      severity,
      issueCodes: uniqueText(issueCodes),
      message: clean,
      evidenceRefs: uniqueText(evidenceRefs),
    });
  };
  for (const issue of issueLedger?.issues.filter(item => item.status === "active").slice(0, 20) ?? []) {
    add(
      "issue_ledger",
      issue.severity === "blocker" || issue.severity === "major" ? "blocker" : "warning",
      `${issue.issueCode ? `${issue.issueCode}: ` : ""}${issue.message}`,
      issue.issueCode ? [issue.issueCode] : issueCodesFromText(issue.message),
      uniqueText([issueLedger?.outPath, ...issue.evidenceRefs].filter((item): item is string => Boolean(item))),
    );
  }
  for (const issue of nextAction?.issueLedger.topIssues ?? []) {
    add(
      "next_action",
      issue.severity === "blocker" || issue.severity === "major" ? "blocker" : "warning",
      `${issue.issueCode ? `${issue.issueCode}: ` : ""}${issue.message}`,
      issue.issueCode ? [issue.issueCode] : issueCodesFromText(issue.message),
      uniqueText([nextAction?.outPath, ...issue.evidenceRefs].filter((item): item is string => Boolean(item))),
    );
  }
  for (const issue of datasetSemanticAudit.topIssues.filter(issue => issue.selected && issue.severity !== "note")) {
    add(
      "dataset_semantic_audit",
      issue.severity === "blocker" ? "blocker" : "warning",
      `${issue.code}: ${issue.message}`,
      [issue.code],
      uniqueText([datasetSemanticAudit.path, datasetSemanticAudit.reportPath].filter((item): item is string => Boolean(item))),
    );
  }
  const auditReadinessBlockers = audit.readinessBlockers?.length
    ? audit.readinessBlockers
    : buildControllerOperatorAuditReadinessBlockers(audit.checks, audit.readiness);
  for (const blocker of auditReadinessBlockers.filter(item => item.severity === "blocker")) {
    add("operator_audit", "blocker", `${blocker.id}: ${blocker.message}`, blocker.issueCodes, [audit.outPath, ...blocker.evidenceRefs]);
  }
  for (const blocker of auditReadinessBlockers.filter(item => item.severity === "warning").slice(0, 12)) {
    add("operator_audit", "warning", `${blocker.id}: ${blocker.message}`, blocker.issueCodes, [audit.outPath, ...blocker.evidenceRefs]);
  }
  if (audit.environment.readiness === "blocked") add("environment", "blocker", `Environment readiness is blocked: ${audit.environment.nextAction}`, [], [audit.environment.outPath, audit.environment.reportPath]);
  return uniqueModelRunnerHandoffBlockers(blockers).slice(0, 50);
}

function uniqueModelRunnerHandoffBlockers(blockers: ControllerModelRunnerPacket["handoffBlockers"]): ControllerModelRunnerPacket["handoffBlockers"] {
  const seen = new Set<string>();
  return blockers.filter(blocker => {
    const key = `${blocker.category}:${blocker.severity}:${blocker.issueCodes.join(",")}:${blocker.message}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function renderControllerModelRunnerPacketMarkdown(packet: ControllerModelRunnerPacket): string {
  return [
    "# Controller Model Runner Packet",
    "",
    `Packet: ${packet.packetId}`,
    `Generated: ${packet.generatedAtIso}`,
    `Run ID: ${packet.runId}`,
    `State: ${packet.statePath}`,
    `Status: ${packet.status}`,
    `Stage: ${packet.currentStage}`,
    `Controller status: ${packet.controllerStatus}`,
    `Default model: ${packet.defaultControllerModel}`,
    `Safe to auto-execute: ${packet.safeToAutoExecute}`,
    `Active issue codes: ${packet.activeIssueCodes.join(", ") || "(none)"}`,
    `Active blocker issue codes: ${packet.activeBlockerIssueCodes.join(", ") || "(none)"}`,
    `Feasibility readiness: ${packet.feasibilityReadiness.status ?? "missing"}${packet.feasibilityReadiness.verdict ? `; verdict: ${packet.feasibilityReadiness.verdict}` : ""}`,
    "",
    "## Handoff Blockers",
    "",
    ...(packet.handoffBlockers.length
      ? packet.handoffBlockers.map(item => `- ${item.severity.toUpperCase()} [${item.category}${item.issueCodes.length ? `:${item.issueCodes.join(",")}` : ""}] ${item.message}${item.evidenceRefs.length ? ` Evidence: ${item.evidenceRefs.join(", ")}` : ""}`)
      : ["- None."]),
    "",
    "## Recommended Command",
    "",
    "```bash",
    packet.recommendedCommand,
    "```",
    "",
    "## System Prompt",
    "",
    packet.systemPrompt,
    "",
    "## User Prompt",
    "",
    "```text",
    packet.userPrompt,
    "```",
    "",
    "## Operating Rules",
    "",
    ...packet.operatingRules.map(rule => `- ${rule}`),
    "",
    "## Agenda",
    "",
    `- Agenda: ${packet.agenda.agendaId}`,
    `- Agenda record: ${packet.agenda.path}`,
    `- Agenda report: ${packet.agenda.reportPath}`,
    `- Status: ${packet.agenda.status}`,
    `- Primary command: ${packet.agenda.primaryCommand}`,
    `- Active issue codes: ${packet.agenda.activeIssueCodes.join(", ") || "(none)"}`,
    `- Active blocker issue codes: ${packet.agenda.activeBlockerIssueCodes.join(", ") || "(none)"}`,
    ...(packet.agenda.items.length ? packet.agenda.items.map(item => `- ${item.id}: ${item.status}/${item.safety}${item.issueCodes?.length ? ` [${item.issueCodes.join(",")}]` : ""} ${item.kind} -> ${item.command}`) : ["- No agenda items."]),
    "",
    "## Agenda Commands",
    "",
    ...(packet.agendaCommands.length ? packet.agendaCommands.map(command => `- \`${command}\``) : ["- None recorded."]),
    "",
    "## Allowed Commands",
    "",
    ...(packet.allowedCommands.length ? packet.allowedCommands.map(command => `- \`${command}\``) : ["- None recorded."]),
    "",
    "## Audit",
    "",
    `- Audit record: ${packet.audit.path}`,
    `- Audit report: ${packet.audit.reportPath}`,
    `- Status: ${packet.audit.status}`,
    `- Readiness: ${packet.audit.readiness}`,
    `- Failed checks: ${packet.audit.failedChecks.join(", ") || "none"}`,
    `- Warning checks: ${packet.audit.warningChecks.join(", ") || "none"}`,
    "",
    "## Environment",
    "",
    `- Environment record: ${packet.environment.outPath}`,
    `- Environment report: ${packet.environment.reportPath}`,
    `- Status: ${packet.environment.status}`,
    `- Readiness: ${packet.environment.readiness}`,
    `- Repo root: ${packet.environment.repoRoot}`,
    `- Node: ${packet.environment.nodeVersion ?? "(missing)"}`,
    `- npm: ${packet.environment.npmVersion ?? "(missing)"}`,
    `- Next action: ${packet.environment.nextAction}`,
    "",
    "## Feasibility Readiness",
    "",
    `- Present: ${packet.feasibilityReadiness.present}`,
    `- Status: ${packet.feasibilityReadiness.status ?? "missing"}`,
    `- Verdict: ${packet.feasibilityReadiness.verdict ?? "missing"}`,
    `- Path: ${packet.feasibilityReadiness.path ?? "(none)"}`,
    `- Blockers: ${packet.feasibilityReadiness.blockers.length ? packet.feasibilityReadiness.blockers.join("; ") : "none"}`,
    `- Warnings: ${packet.feasibilityReadiness.warnings.length ? packet.feasibilityReadiness.warnings.slice(0, 8).join("; ") : "none"}`,
    "",
    "## Dataset Semantic Audit",
    "",
    `- Present: ${packet.datasetSemanticAudit.present}`,
    `- Status: ${packet.datasetSemanticAudit.status}`,
    `- Selected-role status: ${packet.datasetSemanticAudit.selectedRoleStatus}`,
    `- Issues: ${packet.datasetSemanticAudit.issueCount} (${packet.datasetSemanticAudit.blockerCount} blocker, ${packet.datasetSemanticAudit.warningCount} warning)`,
    ...(packet.datasetSemanticAudit.topIssues.length ? packet.datasetSemanticAudit.topIssues.map(issue => `- ${issue.severity.toUpperCase()} ${issue.column}${issue.selected ? " [selected]" : ""}: ${issue.code} - ${issue.message}`) : ["- Issue: none"]),
    `- Next action: ${packet.datasetSemanticAudit.nextAction ?? "(none)"}`,
    "",
    "## Capabilities",
    "",
    `- Capability record: ${packet.capabilities.path}`,
    `- Capability report: ${packet.capabilities.reportPath}`,
    `- Covered: ${packet.capabilities.covered.join(", ") || "none"}`,
    `- Available: ${packet.capabilities.available.join(", ") || "none"}`,
    `- Missing: ${packet.capabilities.missing.join(", ") || "none"}`,
    "",
    "## Evidence",
    "",
    ...packet.evidenceRefs.map(ref => `- ${ref}`),
    "",
  ].join("\n");
}

function renderControllerFollowAgendaMarkdown(result: ControllerFollowAgendaResult): string {
  return [
    "# Controller Follow Agenda",
    "",
    `Generated: ${result.generatedAtIso}`,
    `Run ID: ${result.runId}`,
    `State: ${result.statePath}`,
    `Executed: ${result.executed}`,
    `Refused: ${result.refused}`,
    `Reason: ${result.reason}`,
    `Final stage: ${result.state.currentStage}`,
    `Final status: ${result.state.status}`,
    "",
    "## Selected Item",
    "",
    `- ID: ${result.selectedItem?.id ?? "(none)"}`,
    `- Kind: ${result.selectedItem?.kind ?? "(none)"}`,
    `- Status: ${result.selectedItem?.status ?? "(none)"}`,
    `- Safety: ${result.selectedItem?.safety ?? "(none)"}`,
    `- Command: ${result.selectedItem?.command ?? "(none)"}`,
    `- Reason: ${result.selectedItem?.reason ?? "(none)"}`,
    `- Issue codes: ${result.selectedItem?.issueCodes?.join(", ") || "(none)"}`,
    `- Evidence refs: ${result.selectedItem?.evidenceRefs?.join(", ") || "(none)"}`,
    "",
    "## Agenda",
    "",
    `- Agenda: ${result.agenda.agendaId}`,
    `- Status: ${result.agenda.status}`,
    `- Primary command: ${result.agenda.primaryCommand}`,
    `- Record: ${result.agenda.outPath}`,
    `- Report: ${result.agenda.reportPath}`,
    "",
    "## Run Result",
    "",
    `- Present: ${Boolean(result.runResult)}`,
    `- Step count: ${result.runResult?.stepCount ?? "(none)"}`,
    `- Terminal: ${result.runResult?.terminal ?? "(none)"}`,
    "",
  ].join("\n");
}

function renderControllerFollowLoopMarkdown(result: ControllerFollowLoopResult): string {
  return [
    "# Controller Follow Loop",
    "",
    `Loop: ${result.loopId}`,
    `Generated: ${result.generatedAtIso}`,
    `Run ID: ${result.runId}`,
    `Terminal: ${result.terminal}`,
    `Iterations: ${result.iterations.length}/${result.maxIterations}`,
    `Max steps per run item: ${result.maxStepsPerRun}`,
    `Stopped reason: ${result.stoppedReason}`,
    `Final stage: ${result.state.currentStage}`,
    `Final status: ${result.state.status}`,
    "",
    "## Iterations",
    "",
    ...(result.iterations.length
      ? result.iterations.flatMap(item => [
        `### Iteration ${item.iteration}`,
        "",
        `- Before: ${item.beforeStage}/${item.beforeStatus}`,
        `- After: ${item.afterStage}/${item.afterStatus}`,
        `- Agenda: ${item.agendaId}`,
        `- Selected item: ${item.selectedItemId ?? "(none)"}`,
        `- Selected kind: ${item.selectedKind ?? "(none)"}`,
        `- Selected issue codes: ${item.selectedIssueCodes.join(", ") || "(none)"}`,
        `- Selected evidence: ${item.selectedEvidenceRefs.join(", ") || "(none)"}`,
        `- Executed: ${item.executed}`,
        `- Refused: ${item.refused}`,
        `- Reason: ${item.reason}`,
        `- Follow record: ${item.followRecordPath}`,
        `- Follow report: ${item.followReportPath}`,
        "",
      ])
      : ["- No iterations executed."]),
    "",
  ].join("\n");
}

function renderControllerSupervisorMarkdown(result: ControllerSupervisorResult): string {
  return [
    "# Controller Supervisor",
    "",
    `Supervisor: ${result.supervisorId}`,
    `Generated: ${result.generatedAtIso}`,
    `Run ID: ${result.runId}`,
    `Terminal: ${result.terminal}`,
    `Rounds: ${result.rounds.length}/${result.maxRounds}`,
    `Max follow-loop iterations per round: ${result.maxIterationsPerRound}`,
    `Max steps per run item: ${result.maxStepsPerRun}`,
    `Stopped reason: ${result.stoppedReason}`,
    `Final stage: ${result.state.currentStage}`,
    `Final status: ${result.state.status}`,
    "",
    "## Rounds",
    "",
    ...(result.rounds.length
      ? result.rounds.flatMap(item => [
        `### Round ${item.round}`,
        "",
        `- Before: ${item.beforeStage}/${item.beforeStatus}`,
        `- After: ${item.afterStage}/${item.afterStatus}`,
        `- Runner packet: ${item.runnerPacketPath}`,
        `- Runner packet report: ${item.runnerPacketReportPath}`,
        `- Runner packet status: ${item.runnerPacketStatus}`,
        `- Runner packet feasibility: ${item.runnerPacketFeasibilityReadiness ?? "missing"}${item.runnerPacketFeasibilityVerdict ? `; verdict=${item.runnerPacketFeasibilityVerdict}` : ""}${item.runnerPacketFeasibilityPath ? `; evidence=${item.runnerPacketFeasibilityPath}` : ""}`,
        `- Recommended command: \`${item.recommendedCommand}\``,
        `- Safe agenda primary: ${item.safeAgendaPrimary}`,
        `- Follow loop: ${item.followLoopPath ?? "(not run)"}`,
        `- Follow-loop report: ${item.followLoopReportPath ?? "(not run)"}`,
        `- Follow-loop iterations: ${item.followLoopIterations}`,
        `- Follow-loop issue codes: ${item.followLoopIssueCodes.join(", ") || "(none)"}`,
        `- Audit: ${item.auditPath ?? "(not run)"}`,
        `- Audit report: ${item.auditReportPath ?? "(not run)"}`,
        `- Audit readiness: ${item.auditReadiness ?? "(none)"}`,
        `- Stopped: ${item.stopped}`,
        `- Reason: ${item.reason}`,
        "",
      ])
      : ["- No rounds executed."]),
    "",
  ].join("\n");
}

function renderControllerRepairCycleMarkdown(result: ControllerRepairCycleResult): string {
  return [
    "# Controller Repair Cycle",
    "",
    `Cycle: ${result.cycleId}`,
    `Generated: ${result.generatedAtIso}`,
    `Run ID: ${result.runId}`,
    `Status: ${result.status}`,
    `Before: ${result.beforeStage}/${result.beforeStatus}`,
    `After: ${result.afterStage}/${result.afterStatus}`,
    `Re-entry status: ${result.reentryStatus}`,
    `Auto-repair eligible: ${result.autoRepairEligible}`,
    `Repair plugin: ${result.repairPlugin ?? "(none)"}`,
    `Run result: ${result.runResultPath ?? "(not run)"}`,
    `Run result report: ${result.runResultReportPath ?? "(not run)"}`,
    `Completion audit: ${result.completionAuditPath ?? "(not run)"}`,
    `Completion audit report: ${result.completionAuditReportPath ?? "(not run)"}`,
    "",
    "## Reason",
    "",
    result.reason,
    "",
    "## Evidence",
    "",
    `- Re-entry plan: ${result.reentryPlanPath}`,
    `- Re-entry report: ${result.reentryPlanReportPath}`,
    ...(result.runResultPath ? [`- Run invocation: ${result.runResultPath}`] : []),
    ...(result.runResultReportPath ? [`- Run invocation report: ${result.runResultReportPath}`] : []),
    ...(result.completionAuditPath ? [`- Completion audit: ${result.completionAuditPath}`] : []),
    ...(result.completionAuditReportPath ? [`- Completion audit report: ${result.completionAuditReportPath}`] : []),
    "",
  ].join("\n");
}

function renderControllerDoctorMarkdown(result: ControllerDoctorResult): string {
  return [
    "# Controller Doctor",
    "",
    `Doctor: ${result.doctorId}`,
    `Generated: ${result.generatedAtIso}`,
    `Run ID: ${result.runId}`,
    `State: ${result.statePath}`,
    `Status: ${result.status}`,
    `Stage/status: ${result.currentStage}/${result.controllerStatus}`,
    `Safe to auto-continue: ${result.safeToAutoContinue}`,
    `Recommended command: \`${result.recommendedCommand}\``,
    `Active issue codes: ${result.activeIssueCodes.join(", ") || "(none)"}`,
    `Active blocker issue codes: ${result.activeBlockerIssueCodes.join(", ") || "(none)"}`,
    "",
    "## Blockers",
    "",
    ...(result.blockers.length ? result.blockers.map(item => `- ${item}`) : ["- None."]),
    "",
    "## Warnings",
    "",
    ...(result.warnings.length ? result.warnings.map(item => `- ${item}`) : ["- None."]),
    "",
    "## Audit Summary",
    "",
    `- Operator audit: ${result.summaries.operatorAudit.status}/${result.summaries.operatorAudit.readiness}`,
    `- Operator failed checks: ${result.summaries.operatorAudit.failedChecks.join(", ") || "(none)"}`,
    `- Completion audit: ${result.summaries.completionAudit.status}/${result.summaries.completionAudit.readiness}`,
    `- Completion failed requirements: ${result.summaries.completionAudit.failedRequirements.join(", ") || "(none)"}`,
    ...(result.summaries.completionAudit.failedRequirementDetails.length
      ? result.summaries.completionAudit.failedRequirementDetails.map(detail => `  - ${detail.id}${detail.issueCodes.length ? ` [${detail.issueCodes.join(",")}]` : ""}: ${detail.finding}`)
      : []),
    ...(result.summaries.completionAudit.warningRequirementDetails.length
      ? [
        `- Completion warning requirements: ${result.summaries.completionAudit.warningRequirements.join(", ") || "(none)"}`,
        ...result.summaries.completionAudit.warningRequirementDetails.map(detail => `  - ${detail.id}${detail.issueCodes.length ? ` [${detail.issueCodes.join(",")}]` : ""}: ${detail.finding}`),
      ]
      : [`- Completion warning requirements: ${result.summaries.completionAudit.warningRequirements.join(", ") || "(none)"}`]),
    `- Runner packet: ${result.summaries.runnerPacket.status}; safe=${result.summaries.runnerPacket.safeToAutoExecute}`,
    `- Runner feasibility readiness: ${result.summaries.runnerPacket.feasibilityReadiness.status ?? "missing"}${result.summaries.runnerPacket.feasibilityReadiness.verdict ? `; verdict=${result.summaries.runnerPacket.feasibilityReadiness.verdict}` : ""}`,
    `- Capabilities: ${result.summaries.capabilities.covered} covered, ${result.summaries.capabilities.available} available, ${result.summaries.capabilities.missing} missing, ${result.summaries.capabilities.notApplicable} not applicable`,
    `- Re-entry: ${result.summaries.reentryPlan.status}; stage=${result.summaries.reentryPlan.recommendedStage}; autoRepair=${result.summaries.reentryPlan.autoRepairEligible}`,
    "",
    "## Dataset Semantic Audit",
    "",
    `- Present: ${result.summaries.runnerPacket.datasetSemanticAudit.present}`,
    `- Status: ${result.summaries.runnerPacket.datasetSemanticAudit.status}`,
    `- Selected-role status: ${result.summaries.runnerPacket.datasetSemanticAudit.selectedRoleStatus}`,
    `- Issues: ${result.summaries.runnerPacket.datasetSemanticAudit.issueCount} (${result.summaries.runnerPacket.datasetSemanticAudit.blockerCount} blocker, ${result.summaries.runnerPacket.datasetSemanticAudit.warningCount} warning)`,
    ...(result.summaries.runnerPacket.datasetSemanticAudit.topIssues.length ? result.summaries.runnerPacket.datasetSemanticAudit.topIssues.map(issue => `- ${issue.severity.toUpperCase()} ${issue.column}${issue.selected ? " [selected]" : ""}: ${issue.code} - ${issue.message}`) : ["- Issue: none"]),
    `- Next action: ${result.summaries.runnerPacket.datasetSemanticAudit.nextAction ?? "(none)"}`,
    "",
    "## Operational Evidence",
    "",
    `- Operator audit: ${result.summaries.operatorAudit.path}`,
    `- Completion audit: ${result.summaries.completionAudit.path}`,
    `- Runner packet: ${result.summaries.runnerPacket.path}`,
    `- Capability manifest: ${result.summaries.capabilities.path}`,
    `- Re-entry plan: ${result.summaries.reentryPlan.path}`,
    `- Latest supervisor: ${result.summaries.supervisor.latestPath ?? "(none)"}`,
    `- Latest repair cycle: ${result.summaries.repairCycle.latestPath ?? "(none)"}`,
    "",
    "## Artifact And Cost Posture",
    "",
    `- Artifacts: ${result.summaries.artifacts.total}`,
    `- Required for promotion: ${result.summaries.artifacts.requiredForPromotion}`,
    `- Missing required hashes: ${result.summaries.artifacts.missingRequiredHashes.join(", ") || "(none)"}`,
    `- Cost estimate: ${result.summaries.cost.estimatedUsd.toFixed(4)}`,
    `- Budget: reviewer ${result.summaries.cost.reviewerBudgetUsd.toFixed(2)} + controller ${result.summaries.cost.controllerBudgetUsd.toFixed(2)}`,
    `- Within budget: ${result.summaries.cost.withinBudget}`,
    "",
    "## Evidence Refs",
    "",
    ...result.evidenceRefs.map(item => `- ${item}`),
    "",
  ].join("\n");
}

function renderControllerOperateMarkdown(result: ControllerOperateResult): string {
  return [
    "# Controller Operate",
    "",
    `Operate: ${result.operateId}`,
    `Generated: ${result.generatedAtIso}`,
    `Run ID: ${result.runId}`,
    `State: ${result.statePath}`,
    `Status: ${result.status}`,
    `Cycles: ${result.cycles.length}/${result.maxCycles}`,
    `Final doctor: ${result.finalDoctorStatus ?? "(none)"}`,
    `Stopped reason: ${result.stoppedReason}`,
    "",
    "## Cycles",
    "",
    ...result.cycles.flatMap(cycle => [
      `### Cycle ${cycle.cycle}`,
      "",
      `- Before: ${cycle.beforeStage}/${cycle.beforeStatus}`,
      `- Doctor: ${cycle.doctorStatus} (${cycle.doctorPath})`,
      `- Doctor report: ${cycle.doctorReportPath}`,
      `- Doctor feasibility: ${cycle.doctorFeasibilityReadiness ?? "missing"}${cycle.doctorFeasibilityVerdict ? `; verdict=${cycle.doctorFeasibilityVerdict}` : ""}${cycle.doctorFeasibilityPath ? `; evidence=${cycle.doctorFeasibilityPath}` : ""}`,
      `- Safe to auto-continue: ${cycle.safeToAutoContinue}`,
      `- Recommended command: \`${cycle.recommendedCommand}\``,
      `- Action: ${cycle.action}`,
      `- Action status: ${cycle.actionStatus ?? "(none)"}`,
      `- Action path: ${cycle.actionPath ?? "(none)"}`,
      `- Action report: ${cycle.actionReportPath ?? "(none)"}`,
      `- After: ${cycle.afterStage}/${cycle.afterStatus}`,
      `- Reason: ${cycle.reason}`,
      `- Issue codes: ${cycle.issueCodes.length ? cycle.issueCodes.join(", ") : "(none)"}`,
      "",
    ]),
    "## Final State",
    "",
    `- Stage: ${result.state.currentStage}`,
    `- Status: ${result.state.status}`,
    `- Artifacts: ${result.state.artifacts.length}`,
    "",
  ].join("\n");
}

function renderControllerStartMarkdown(result: ControllerStartResult): string {
  return [
    "# Controller Start",
    "",
    `Start: ${result.startId}`,
    `Generated: ${result.generatedAtIso}`,
    `Run ID: ${result.runId}`,
    `Status: ${result.status}`,
    `Mode: ${result.mode}`,
    `State: ${result.statePath}`,
    "",
    "## First-Read Status",
    "",
    `- Status: ${result.statusSummary.status}`,
    `- Controller status: ${result.statusSummary.controllerStatus}`,
    `- Stage: ${result.statusSummary.currentStage}`,
    `- Safe to auto-continue: ${result.statusSummary.safeToAutoContinue}`,
    `- Ready to launch: ${result.statusSummary.readyToLaunch}`,
    `- Promotable: ${result.statusSummary.promotable}`,
    `- Feasibility readiness: ${result.statusSummary.feasibilityReadiness ?? "(missing)"}${result.statusSummary.feasibilityVerdict ? `; verdict: ${result.statusSummary.feasibilityVerdict}` : ""}`,
    `- Active issue codes: ${result.statusSummary.activeIssueCodes.join(", ") || "(none)"}`,
    `- Active blocker issue codes: ${result.statusSummary.activeBlockerIssueCodes.join(", ") || "(none)"}`,
    `- Blockers: ${result.statusSummary.blockers.length}`,
    ...result.statusSummary.blockers.slice(0, 10).map(item => `  - ${item}`),
    `- Warnings: ${result.statusSummary.warnings.length}`,
    ...result.statusSummary.warnings.slice(0, 10).map(item => `  - ${item}`),
    "",
    "## Launch Envelope",
    "",
    `- Runbook status: ${result.runbookSummary.status}`,
    `- Ready to launch: ${result.runbookSummary.readyToLaunch}`,
    `- First-read command: ${result.runbookSummary.firstReadCommand}`,
    `- Readiness command: ${result.runbookSummary.readinessCommand}`,
    `- Launch command: ${result.runbookSummary.launchCommand}`,
    `- Inspection command: ${result.runbookSummary.inspectionCommand}`,
    `- Launch blockers: ${result.runbookSummary.launchBlockers.length}`,
    ...result.runbookSummary.launchBlockers.slice(0, 10).map(item => `  - ${item.severity.toUpperCase()} [${item.category}${item.issueCodes.length ? `:${item.issueCodes.join(",")}` : ""}] ${item.message}`),
    "",
    "## Operate",
    "",
    `- Requested: ${result.operateSummary.requested}`,
    `- Status: ${result.operateSummary.status ?? "(not run)"}`,
    `- Cycles: ${result.operateSummary.cycles}`,
    `- Stopped reason: ${result.operateSummary.stoppedReason ?? "(none)"}`,
    "",
    "## Artifacts",
    "",
    `- State: ${result.artifactPaths.state}`,
    `- Status: ${result.artifactPaths.status}`,
    `- Status report: ${result.artifactPaths.statusReport}`,
    `- Runbook: ${result.artifactPaths.runbook}`,
    `- Runbook report: ${result.artifactPaths.runbookReport}`,
    `- Operate: ${result.artifactPaths.operate ?? "(not run)"}`,
    `- Operate report: ${result.artifactPaths.operateReport ?? "(not run)"}`,
    "",
    "## Next Action",
    "",
    result.nextAction,
    "",
  ].join("\n");
}

function renderControllerRunbookMarkdown(result: ControllerLaunchRunbook): string {
  return [
    "# Controller Launch Runbook",
    "",
    `Runbook: ${result.runbookId}`,
    `Generated: ${result.generatedAtIso}`,
    `Run ID: ${result.runId}`,
    `State: ${result.statePath}`,
    `Status: ${result.status}`,
    `Ready to launch: ${result.readyToLaunch}`,
    `Default model: ${result.defaultControllerModel}`,
    `Strict model recommended: ${result.strictModelRecommended}`,
    `Active issue codes: ${result.activeIssueCodes.join(", ") || "(none)"}`,
    `Active blocker issue codes: ${result.activeBlockerIssueCodes.join(", ") || "(none)"}`,
    "",
    "## Launch Blockers",
    "",
    ...(result.launchBlockers.length
      ? result.launchBlockers.map(item => `- ${item.severity.toUpperCase()} [${item.category}${item.issueCodes.length ? `:${item.issueCodes.join(",")}` : ""}] ${item.message}${item.evidenceRefs.length ? ` Evidence: ${item.evidenceRefs.join(", ")}` : ""}`)
      : ["- None."]),
    "",
    "## Launch",
    "",
    "Run the first-read status command before launch/resume decisions, then use the readiness command if detailed launch safety needs review.",
    "",
    "```bash",
    result.firstReadCommand,
    "```",
    "",
    "Readiness command:",
    "",
    "```bash",
    result.readinessCommand,
    "```",
    "",
    "Launch command:",
    "",
    "```bash",
    result.launchCommand,
    "```",
    "",
    "Inspection command:",
    "",
    "```bash",
    result.inspectionCommand,
    "```",
    "",
    "## Handoff Prompt",
    "",
    "```text",
    result.handoffPrompt,
    "```",
    "",
    "## Doctor Summary",
    "",
    `- Doctor record: ${result.handoffArtifacts.doctor.path}`,
    `- Doctor report: ${result.handoffArtifacts.doctor.reportPath}`,
    `- Doctor status: ${result.doctor.status}`,
    `- Safe to auto-continue: ${result.doctor.safeToAutoContinue}`,
    `- Recommended command: ${result.doctor.recommendedCommand}`,
    `- Blockers: ${result.doctor.blockers.length ? result.doctor.blockers.join("; ") : "none"}`,
    `- Warnings: ${result.doctor.warnings.length ? result.doctor.warnings.slice(0, 8).join("; ") : "none"}`,
    `- Runner packet record: ${result.handoffArtifacts.runnerPacket.path}`,
    `- Runner packet report: ${result.handoffArtifacts.runnerPacket.reportPath}`,
    `- Operator audit record: ${result.handoffArtifacts.operatorAudit.path}`,
    `- Operator audit report: ${result.handoffArtifacts.operatorAudit.reportPath}`,
    `- Completion audit record: ${result.handoffArtifacts.completionAudit.path}`,
    `- Completion audit report: ${result.handoffArtifacts.completionAudit.reportPath}`,
    `- Capability manifest record: ${result.handoffArtifacts.capabilities.path}`,
    `- Capability manifest report: ${result.handoffArtifacts.capabilities.reportPath}`,
    `- Re-entry plan record: ${result.handoffArtifacts.reentryPlan.path}`,
    `- Re-entry plan report: ${result.handoffArtifacts.reentryPlan.reportPath}`,
    `- Supervisor record: ${result.handoffArtifacts.supervisor.path ?? "(none)"}`,
    `- Supervisor report: ${result.handoffArtifacts.supervisor.reportPath ?? "(none)"}`,
    `- Repair-cycle record: ${result.handoffArtifacts.repairCycle.path ?? "(none)"}`,
    `- Repair-cycle report: ${result.handoffArtifacts.repairCycle.reportPath ?? "(none)"}`,
    `- Runner feasibility readiness: ${result.runnerPacket.feasibilityReadiness.status ?? "missing"}${result.runnerPacket.feasibilityReadiness.verdict ? `; verdict=${result.runnerPacket.feasibilityReadiness.verdict}` : ""}`,
    "",
    "## Dataset Semantic Audit",
    "",
    `- Present: ${result.runnerPacket.datasetSemanticAudit.present}`,
    `- Status: ${result.runnerPacket.datasetSemanticAudit.status}`,
    `- Selected-role status: ${result.runnerPacket.datasetSemanticAudit.selectedRoleStatus}`,
    `- Issues: ${result.runnerPacket.datasetSemanticAudit.issueCount} (${result.runnerPacket.datasetSemanticAudit.blockerCount} blocker, ${result.runnerPacket.datasetSemanticAudit.warningCount} warning)`,
    ...(result.runnerPacket.datasetSemanticAudit.topIssues.length ? result.runnerPacket.datasetSemanticAudit.topIssues.map(issue => `- ${issue.severity.toUpperCase()} ${issue.column}${issue.selected ? " [selected]" : ""}: ${issue.code} - ${issue.message}`) : ["- Issue: none"]),
    `- Next action: ${result.runnerPacket.datasetSemanticAudit.nextAction ?? "(none)"}`,
    "",
    "## Safety Envelope",
    "",
    `- Autonomy: ${result.safetyEnvelope.autonomy}`,
    `- Controller budget: $${result.safetyEnvelope.maxControllerCostUsd.toFixed(2)}`,
    `- Reviewer budget: $${result.safetyEnvelope.maxReviewerCostUsd.toFixed(2)}`,
    `- Max auto repairs: ${result.safetyEnvelope.maxAutoRepairs}`,
    `- Source edits allowed: ${result.safetyEnvelope.allowSourceEdits}`,
    `- External review allowed/required: ${result.safetyEnvelope.allowExternalReview}`,
    `- Literature search allowed: ${result.safetyEnvelope.allowLiteratureSearch}`,
    `- Protected paths: ${result.safetyEnvelope.protectedPaths.join(", ") || "(none)"}`,
    "",
    "## Environment",
    "",
    `- Environment record: ${result.handoffArtifacts.environment.path ?? "(none)"}`,
    `- Environment report: ${result.handoffArtifacts.environment.reportPath ?? "(none)"}`,
    `- Repo root: ${result.environment.repoRoot}`,
    `- Readiness: ${result.environment.readiness}`,
    `- Status: ${result.environment.status}`,
    `- Node: ${result.environment.nodeVersion ?? "(unavailable)"}`,
    `- npm: ${result.environment.npmVersion ?? "(unavailable)"}`,
    `- Package scripts: ${result.environment.packageScripts.join(", ") || "(none)"}`,
    `- Required env vars: ${result.environment.requiredEnvVars.join(", ") || "(none)"}`,
    `- Optional env warnings: ${result.environment.optionalEnvWarnings.join("; ") || "(none)"}`,
    "",
    "## Stop Criteria",
    "",
    ...result.stopCriteria.map(item => `- ${item}`),
    "",
    "## Recovery Commands",
    "",
    ...result.recoveryCommands.map(item => `- \`${item}\``),
    "",
    "## Allowed Commands",
    "",
    ...result.allowedCommands.map(item => `- \`${item}\``),
    "",
    "## Forbidden Actions",
    "",
    ...result.forbiddenActions.map(item => `- ${item}`),
    "",
    "## Recovery Commands",
    "",
    ...result.recoveryCommands.map(item => `- \`${item}\``),
    "",
    "## Verification Commands",
    "",
    ...result.verificationCommands.map(item => `- \`${item}\``),
    "",
    "## Artifacts To Inspect",
    "",
    ...result.artifactsToInspect.map(item => `- ${item}`),
    "",
    "## Evidence Refs",
    "",
    ...result.evidenceRefs.map(item => `- ${item}`),
    "",
  ].join("\n");
}

function renderControllerStatusMarkdown(result: ControllerUnifiedStatus): string {
  const keyReportEntries = Object.entries(result.keyArtifactReports);
  return [
    "# Controller Status",
    "",
    `Status artifact: ${result.statusId}`,
    `Generated: ${result.generatedAtIso}`,
    `Run ID: ${result.runId}`,
    `State: ${result.statePath}`,
    `Status: ${result.status}`,
    `Stage/status: ${result.currentStage}/${result.controllerStatus}`,
    `Safe to auto-continue: ${result.safeToAutoContinue}`,
    `Ready to launch: ${result.readyToLaunch}`,
    `Promotable: ${result.promotable}`,
    `Recommended command: \`${result.recommendedCommand}\``,
    `Launch command: ${result.launchCommand ? `\`${result.launchCommand}\`` : "(none)"}`,
    `Inspection command: \`${result.inspectionCommand}\``,
    `Active issue codes: ${result.activeIssueCodes.join(", ") || "(none)"}`,
    `Active blocker issue codes: ${result.activeBlockerIssueCodes.join(", ") || "(none)"}`,
    "",
    "## Summary",
    "",
    `- Doctor: ${result.summary.doctorStatus}`,
    `- Runbook: ${result.summary.runbookStatus}`,
    `- Golden packet: ${result.summary.goldenPacketStatus}`,
    `- Completion audit: ${result.summary.completionAudit}`,
    `- Self-evaluation: ${result.summary.selfEvaluation}`,
    `- Promotion decision: ${result.summary.promotionDecision}`,
    `- Run inspection: ${result.summary.runInspection ?? "(missing)"}`,
    `- Feasibility readiness: ${result.summary.feasibilityReadiness ?? "(missing)"}${result.summary.feasibilityVerdict ? `; verdict: ${result.summary.feasibilityVerdict}` : ""}`,
    `- Dataset semantic audit: ${result.summary.datasetSemanticAudit.status}/${result.summary.datasetSemanticAudit.selectedRoleStatus}`,
    `- Missing capability ids: ${result.summary.capabilityMissingIds.join(", ") || "(none)"}`,
    `- Cost estimate: ${result.summary.cost.estimatedUsd.toFixed(4)}; within budget: ${result.summary.cost.withinBudget}`,
    "",
    "## Blockers",
    "",
    ...(result.blockers.length ? result.blockers.map(item => `- ${item}`) : ["- None."]),
    "",
    "## Warnings",
    "",
    ...(result.warnings.length ? result.warnings.map(item => `- ${item}`) : ["- None."]),
    "",
    "## Next Action",
    "",
    result.nextAction,
    "",
    "## Key Artifacts",
    "",
    `- Doctor: ${result.artifactPaths.doctor}`,
    `- Doctor report: ${result.artifactPaths.doctorReport}`,
    `- Runbook: ${result.artifactPaths.runbook}`,
    `- Runbook report: ${result.artifactPaths.runbookReport}`,
    `- Golden packet: ${result.artifactPaths.goldenPacket}`,
    `- Golden packet report: ${result.artifactPaths.goldenPacketReport}`,
    `- Runner packet: ${result.artifactPaths.runnerPacket}`,
    `- Runner packet report: ${result.artifactPaths.runnerPacketReport}`,
    `- Completion audit: ${result.artifactPaths.completionAudit || "(missing)"}`,
    `- Completion audit report: ${result.artifactPaths.completionAuditReport || "(missing)"}`,
    `- Capability manifest: ${result.artifactPaths.capabilityManifest}`,
    `- Capability manifest report: ${result.artifactPaths.capabilityManifestReport}`,
    "",
    "## Key Artifact Reports",
    "",
    ...keyReportEntries.map(([key, value]) => `- ${key}: ${value ?? "not report-backed"}`),
    "",
    "## Evidence Refs",
    "",
    ...result.evidenceRefs.map(item => `- ${item}`),
    "",
  ].join("\n");
}

async function buildControllerEnvironmentPreflight(state: ControllerState, _reason: string): Promise<ControllerEnvironmentPreflight> {
  const preflightId = `controller_environment_${String(state.artifacts.filter(item => item.kind === "controller-environment-preflight").length + 1).padStart(3, "0")}`;
  const repoRoot = repoRootFromState(state);
  const outPath = path.join(state.rootDir, `${preflightId}.json`);
  const reportPath = path.join(state.rootDir, `${preflightId}.md`);
  const checks: ControllerEnvironmentPreflightCheck[] = [];
  const add = (id: string, status: ControllerEnvironmentPreflightCheck["status"], category: ControllerEnvironmentPreflightCheck["category"], message: string, evidenceRefs: string[] = []) => {
    checks.push({ id, status, category, message, evidenceRefs: uniqueText(evidenceRefs) });
  };
  const packagePath = path.join(repoRoot, "package.json");
  const cliDistPath = path.join(repoRoot, "packages", "cli", "dist", "bin", "agenteer.js");
  const packageJson = await readJsonIfPresent(packagePath) as { scripts?: Record<string, string> } | null;
  const buildScript = typeof packageJson?.scripts?.build === "string";
  const testScript = typeof packageJson?.scripts?.test === "string";
  const nodeVersion = await execFileAsync("node", ["--version"], { cwd: repoRoot, timeout: 5000 }).then(result => String(result.stdout).trim()).catch(() => null);
  const npmVersion = await execFileAsync("npm", ["--version"], { cwd: repoRoot, timeout: 5000 }).then(result => String(result.stdout).trim()).catch(() => null);
  const gitStatus = await execFileAsync("git", ["status", "--short"], { cwd: repoRoot, timeout: 5000, maxBuffer: 1024 * 1024 }).then(result => String(result.stdout ?? "")).catch(() => null);
  const cliDistStat = await stat(cliDistPath).catch(() => null);
  const sourcePaths = [
    path.join(repoRoot, "packages", "cli", "src", "bin", "agenteer.ts"),
    path.join(repoRoot, "packages", "cli", "src", "research-machine", "controller.ts"),
    path.join(repoRoot, "packages", "cli", "src", "research-machine", "commands.ts"),
    path.join(repoRoot, "packages", "cli", "src", "index.ts"),
  ];
  const sourceStats = await Promise.all(sourcePaths.map(file => stat(file).then(info => ({ file, info })).catch(() => null)));
  const latestSource = sourceStats
    .filter((item): item is NonNullable<(typeof sourceStats)[number]> => Boolean(item))
    .sort((a, b) => b.info.mtimeMs - a.info.mtimeMs)[0] ?? null;
  const distMtimeIso = cliDistStat ? cliDistStat.mtime.toISOString() : null;
  const latestSourceMtimeIso = latestSource ? latestSource.info.mtime.toISOString() : null;
  const stale = cliDistStat && latestSource ? cliDistStat.mtimeMs < latestSource.info.mtimeMs : cliDistStat ? false : null;
  const executable = cliDistStat ? Boolean(cliDistStat.mode & 0o111) : false;
  add("repo-root", await pathExists(packagePath) ? "pass" : "fail", "repo", await pathExists(packagePath) ? "Repository root contains package.json." : "Repository root package.json is missing.", [packagePath]);
  add("package-scripts", buildScript && testScript ? "pass" : "fail", "repo", buildScript && testScript ? "Root package exposes build and test scripts." : "Root package is missing build or test scripts.", [packagePath]);
  add("node-runtime", nodeVersion ? "pass" : "fail", "runtime", nodeVersion ? `Node runtime is available: ${nodeVersion}.` : "Node runtime is unavailable.");
  add("npm-runtime", npmVersion ? "pass" : "fail", "runtime", npmVersion ? `npm runtime is available: ${npmVersion}.` : "npm runtime is unavailable.");
  add("cli-dist", cliDistStat ? stale ? "warning" : executable ? "pass" : "warning" : "fail", "cli", cliDistStat ? stale ? "CLI dist exists but appears older than source; run npm run build before controller-run-agenteer." : executable ? "CLI dist exists and is executable." : "CLI dist exists but is not executable." : "CLI dist is missing; run npm run build before controller-run-agenteer.", [cliDistPath, latestSource?.file].filter((item): item is string => Boolean(item)));
  add("git-status", gitStatus === null ? "warning" : "pass", "git", gitStatus === null ? "git status could not be read." : gitStatus.trim() ? "Git status is readable and the worktree has changes." : "Git status is readable and the worktree is clean.");
  add("tool-policy", state.policy.allowToolActions && state.policy.allowedToolIds.length > 0 ? "pass" : "warning", "policy", state.policy.allowToolActions ? `Tool actions enabled with ${state.policy.allowedToolIds.length} allowed tool(s).` : "Tool actions are disabled by controller policy.");
  add("tool-timeout", state.policy.toolTimeoutMs >= 1000 ? "pass" : "warning", "policy", `Tool timeout is ${state.policy.toolTimeoutMs} ms.`);
  const failed = checks.filter(check => check.status === "fail");
  const warnings = checks.filter(check => check.status === "warning");
  const status: ControllerEnvironmentPreflight["status"] = failed.length ? "fail" : warnings.length ? "warning" : "pass";
  const readiness: ControllerEnvironmentPreflight["readiness"] = failed.length ? "blocked" : warnings.length ? "degraded" : "ready";
  return {
    schemaVersion: 1,
    generatedAtIso: nowIso(),
    preflightId,
    runId: state.runId,
    statePath: state.statePath,
    status,
    readiness,
    repoRoot,
    nodeVersion,
    npmVersion,
    packageScripts: {
      build: buildScript,
      test: testScript,
    },
    cliDist: {
      path: cliDistPath,
      present: Boolean(cliDistStat),
      executable,
      distMtimeIso,
      latestSourceMtimeIso,
      stale,
    },
    git: {
      available: gitStatus !== null,
      dirty: Boolean(gitStatus?.trim()),
      statusPreview: String(gitStatus ?? "").slice(0, 12000),
    },
    policy: {
      allowToolActions: state.policy.allowToolActions,
      allowedToolIds: state.policy.allowedToolIds,
      maxToolActions: state.policy.maxToolActions,
      toolTimeoutMs: state.policy.toolTimeoutMs,
    },
    checks,
    nextAction: failed.length
      ? "Resolve failed environment checks before autonomous controller pickup."
      : warnings.some(check => check.id === "cli-dist")
        ? "Run npm run build before relying on dist-backed controller-run-agenteer."
        : "Environment preflight is ready for bounded controller pickup.",
    outPath,
    reportPath,
  };
}

function renderControllerEnvironmentPreflightMarkdown(preflight: ControllerEnvironmentPreflight): string {
  return [
    "# Controller Environment Preflight",
    "",
    `Preflight: ${preflight.preflightId}`,
    `Generated: ${preflight.generatedAtIso}`,
    `Run ID: ${preflight.runId}`,
    `Status: ${preflight.status}`,
    `Readiness: ${preflight.readiness}`,
    `Repository: ${preflight.repoRoot}`,
    "",
    "## Runtime",
    "",
    `- Node: ${preflight.nodeVersion ?? "(missing)"}`,
    `- npm: ${preflight.npmVersion ?? "(missing)"}`,
    `- Build script: ${preflight.packageScripts.build}`,
    `- Test script: ${preflight.packageScripts.test}`,
    "",
    "## CLI Dist",
    "",
    `- Path: ${preflight.cliDist.path}`,
    `- Present: ${preflight.cliDist.present}`,
    `- Executable: ${preflight.cliDist.executable}`,
    `- Dist mtime: ${preflight.cliDist.distMtimeIso ?? "(missing)"}`,
    `- Latest source mtime: ${preflight.cliDist.latestSourceMtimeIso ?? "(missing)"}`,
    `- Stale: ${preflight.cliDist.stale ?? "(unknown)"}`,
    "",
    "## Git",
    "",
    `- Available: ${preflight.git.available}`,
    `- Dirty: ${preflight.git.dirty}`,
    "",
    "## Policy",
    "",
    `- Tool actions: ${preflight.policy.allowToolActions}`,
    `- Allowed tools: ${preflight.policy.allowedToolIds.join(", ")}`,
    `- Max tool actions: ${preflight.policy.maxToolActions}`,
    `- Tool timeout ms: ${preflight.policy.toolTimeoutMs}`,
    "",
    "## Checks",
    "",
    ...preflight.checks.map(check => `- ${check.status.toUpperCase()} [${check.category}] ${check.id}: ${check.message}${check.evidenceRefs.length ? ` Evidence: ${check.evidenceRefs.join(", ")}` : ""}`),
    "",
    `Next: ${preflight.nextAction}`,
    "",
  ].join("\n");
}

async function buildControllerOperatorAudit(state: ControllerState, agenda: ControllerExecutionAgenda, _reason: string): Promise<ControllerOperatorAudit> {
  const auditId = `controller_operator_audit_${String(state.artifacts.filter(item => item.kind === "controller-operator-audit").length + 1).padStart(3, "0")}`;
  const outPath = path.join(state.rootDir, `${auditId}.json`);
  const reportPath = path.join(state.rootDir, `${auditId}.md`);
  const checks: ControllerOperatorAuditCheck[] = [];
  const add = (
    id: string,
    status: ControllerOperatorAuditCheck["status"],
    category: ControllerOperatorAuditCheck["category"],
    message: string,
    evidenceRefs: string[] = [],
    issueCodes: string[] = [],
  ) => {
    checks.push({
      id,
      status,
      category,
      message,
      ...(issueCodes.length ? { issueCodes: uniqueText(issueCodes) } : {}),
      evidenceRefs: uniqueText(evidenceRefs),
    });
  };
  const inspection = await inspectControllerStateForTool(state);
  const recovery = await writeControllerRecoveryInspection(state);
  const environment = await buildControllerEnvironmentPreflight(state, _reason);
  const feasibility = await loadControllerFeasibilitySummary(state);
  const datasetSemanticAudit = await loadControllerDatasetSemanticAuditSummary(state);
  const capabilityCoverage = controllerCapabilityCoverage(state);
  const issueLedger = await readLatestControllerIssueLedger(state);
  const stageReview = await readLatestControllerStageReview(state);
  const missingRequiredArtifacts = state.artifacts.filter(item => item.requiredForPromotion && !item.sha256);
  const failedActions = state.actions.filter(action => action.status === "failed");
  const failedTools = state.toolActions.filter(tool => tool.status !== "succeeded");
  const failedInspectionChecks = inspection.checks.filter(check => check.status === "fail");
  const warningInspectionChecks = inspection.checks.filter(check => check.status === "warning");
  const missingCapabilities = capabilityCoverage.filter(item => item.status === "missing");
  const beforeDatasetFeasibility = state.currentStage === "intake" && !state.completedStages.includes("dataset_feasibility");
  const blockingInspectionChecks = failedInspectionChecks.filter(check => !(beforeDatasetFeasibility && check.id.startsWith("feasibility-verdict")));
  const feasibilityAuditStatus: ControllerOperatorAuditCheck["status"] = !state.inputs.dataPath
    ? "warning"
    : feasibility.status === "block"
      ? "fail"
      : feasibility.status === "warning"
        ? "warning"
        : feasibility.present
          ? "pass"
          : beforeDatasetFeasibility
            ? "warning"
            : "fail";

  add("state-integrity", blockingInspectionChecks.length ? "fail" : failedInspectionChecks.length || warningInspectionChecks.length ? "warning" : "pass", "state", blockingInspectionChecks.length ? `${blockingInspectionChecks.length} state inspection check(s) failed.` : failedInspectionChecks.length || warningInspectionChecks.length ? `${failedInspectionChecks.length + warningInspectionChecks.length} state inspection warning(s) found.` : "Controller state inspection passed.", [state.statePath, ...inspection.checks.flatMap(check => check.evidenceRefs)]);
  add("environment-preflight", environment.status === "fail" ? "fail" : environment.status === "warning" ? "warning" : "pass", "tools", `Environment readiness is ${environment.readiness}: ${environment.nextAction}`, [environment.outPath, environment.reportPath]);
  add("recovery-status", recovery.status === "blocked" ? "fail" : recovery.status === "possible_interruption" || recovery.status === "use_reentry_plan" ? "warning" : "pass", "state", `Recovery status is ${recovery.status}: ${recovery.reason}`, [recovery.outPath, ...recovery.evidenceRefs]);
  add("agenda-primary-command", agenda.primaryCommand ? agenda.status === "blocked" ? "warning" : "pass" : "fail", "autonomy", agenda.primaryCommand ? `Agenda primary command is ${agenda.primaryCommand}.` : "No agenda primary command is available.", [agenda.outPath]);
  add("follow-loop-capability", "pass", "autonomy", "Controller exposes agenda, follow-agenda, and follow-loop primitives for bounded autonomous pickup.", artifactPaths(state, "controller-execution-agenda", "controller-follow-agenda", "controller-follow-agenda-report", "controller-follow-loop", "controller-follow-loop-report"));
  add("default-model", state.policy.controller.provider === "openai" && state.policy.controller.model === "gpt-5.4" ? "pass" : "warning", "autonomy", `Default controller model config is ${state.policy.controller.provider}:${state.policy.controller.model}; enabled=${state.policy.controller.enabled}; strict=${state.policy.requireControllerModel}.`);
  add("model-preflight-if-enabled", state.policy.controller.enabled ? artifactExists(state, "controller-model-preflight") || state.decisions.some(decision => decision.source === "model_fallback") ? "pass" : "warning" : "pass", "autonomy", state.policy.controller.enabled ? "Model controller is enabled and model preflight/fallback evidence should be present after decisions." : "Model controller is configured but not enabled for this run.", artifactPaths(state, "controller-model-preflight", "controller-decision-quality"));
  add(
    "feasibility",
    feasibilityAuditStatus,
    "data",
    !state.inputs.dataPath
      ? "No row-level data path is configured; controller cannot independently verify data feasibility."
      : feasibility.present
        ? `Feasibility status is ${feasibility.status}${feasibility.issueCodes.length ? ` with issue code(s): ${feasibility.issueCodes.join(", ")}.` : "."}`
        : beforeDatasetFeasibility
          ? "Feasibility verdict is not present yet; the next safe controller stage should create it."
          : "Feasibility verdict is missing for row-level data.",
    feasibility.path ? [feasibility.path] : [],
    feasibility.issueCodes,
  );
  add(
    "dataset-semantic-audit",
    !state.inputs.dataPath
      ? "warning"
      : datasetSemanticAudit.selectedRoleStatus === "block"
        ? "fail"
        : datasetSemanticAudit.selectedRoleStatus === "warning"
          ? "warning"
          : datasetSemanticAudit.present
            ? "pass"
            : beforeDatasetFeasibility
              ? "warning"
              : "fail",
    "data",
    !state.inputs.dataPath
      ? "No row-level data path is configured; dataset semantic audit is unavailable."
      : datasetSemanticAudit.present
        ? `Dataset semantic audit status is ${datasetSemanticAudit.status}; selected-role status is ${datasetSemanticAudit.selectedRoleStatus}; issues=${datasetSemanticAudit.issueCount}.`
        : beforeDatasetFeasibility
          ? "Dataset semantic audit is not present yet; the next safe controller stage should create it."
          : "Dataset semantic audit is missing for row-level data.",
    uniqueText([datasetSemanticAudit.path, datasetSemanticAudit.reportPath].filter((item): item is string => Boolean(item))),
    uniqueText(datasetSemanticAudit.topIssues.filter(issue => issue.selected && issue.severity !== "note").map(issue => issue.code)),
  );
  add("required-artifact-integrity", missingRequiredArtifacts.length ? "fail" : "pass", "artifacts", missingRequiredArtifacts.length ? `${missingRequiredArtifacts.length} required artifact(s) are missing hashes.` : "Required artifacts have hashes or none are required yet.", missingRequiredArtifacts.map(item => item.path));
  add("action-outcomes", failedActions.length ? "fail" : "pass", "state", failedActions.length ? `${failedActions.length} action(s) failed.` : "No failed controller actions recorded.", failedActions.flatMap(action => action.artifacts.map(item => item.path)));
  add("tool-outcomes", failedTools.length ? "warning" : "pass", "tools", failedTools.length ? `${failedTools.length} tool action(s) failed or were rejected.` : "No failed/rejected controller tool actions recorded.", failedTools.map(tool => tool.outPath));
  add(
    "issue-ledger",
    issueLedger?.status === "blocked" ? "fail" : issueLedger?.status === "warnings" ? "warning" : issueLedger ? "pass" : "warning",
    "state",
    issueLedger ? `Issue ledger status is ${issueLedger.status} with ${issueLedger.issues.length} issue(s).` : "No issue ledger is available.",
    issueLedger ? [issueLedger.outPath] : [],
    uniqueText(issueLedger?.issues.filter(issue => issue.status === "active").map(issue => issue.issueCode).filter((item): item is string => Boolean(item)) ?? []),
  );
  add("stage-review", stageReview?.status === "block" ? "fail" : stageReview?.status === "warning" ? "warning" : stageReview ? "pass" : state.actions.length ? "warning" : "pass", "review", stageReview ? `Latest stage review status is ${stageReview.status} with ${stageReview.findings.length} finding(s).` : "No stage review is available yet.", stageReview ? [stageReview.outPath] : []);
  if (state.repairs.length > 0) {
    const latestRepairVerificationPath = latestArtifactPath(state, "controller-repair-verification");
    const latestRepairVerificationRaw = latestRepairVerificationPath ? await readJsonIfPresent(latestRepairVerificationPath) : null;
    const latestRepairVerification = valueAtPath(latestRepairVerificationRaw, "controllerRepairVerification") as Partial<ControllerRepairVerification> | null;
    const repairVerificationStatus = latestRepairVerification?.status ?? null;
    add(
      "repair-verification",
      repairVerificationStatus === "pass" ? "pass" : repairVerificationStatus === "warning" ? "warning" : "fail",
      "review",
      repairVerificationStatus === "pass"
        ? "Latest repair verification passed."
        : repairVerificationStatus === "warning"
          ? `Latest repair verification has warnings: ${latestRepairVerification?.nextAction ?? "review repair verification"}.`
          : "Reviewer-driven repair verification is missing or failed.",
      latestRepairVerificationPath ? [latestRepairVerificationPath] : artifactPaths(state, "controller-repair-execution"),
    );
  }
  add("capability-coverage", missingCapabilities.length ? "warning" : "pass", "autonomy", missingCapabilities.length ? `Missing applicable capability evidence: ${missingCapabilities.map(item => item.capability).join(", ")}.` : "Applicable controller capabilities have evidence or are not yet applicable.", missingCapabilities.flatMap(item => item.evidenceRefs));
  add("cost-boundary", state.costEstimateUsd <= state.policy.reviewerBudget.maxStudyLoopUsd + state.policy.controllerBudget.maxStudyLoopUsd ? "pass" : "fail", "cost", `Estimated controller/reviewer cost is $${state.costEstimateUsd}; combined budget is $${state.policy.reviewerBudget.maxStudyLoopUsd + state.policy.controllerBudget.maxStudyLoopUsd}.`);

  const failed = checks.filter(check => check.status === "fail");
  const warnings = checks.filter(check => check.status === "warning");
  const reviewWarnings = warnings.filter(check => !isAdvisoryControllerAuditWarning(check, state));
  const status: ControllerOperatorAudit["status"] = failed.length ? "fail" : warnings.length ? "warning" : "pass";
  const readiness: ControllerOperatorAudit["readiness"] = state.status === "complete" || state.currentStage === "complete" ? "complete" : failed.length || state.status === "blocked" || agenda.status === "blocked" ? "blocked" : reviewWarnings.length || state.status === "needs_human_review" ? "ready_for_review" : "ready_to_follow";
  const readinessBlockers = buildControllerOperatorAuditReadinessBlockers(checks, readiness);
  return {
    schemaVersion: 1,
    generatedAtIso: nowIso(),
    auditId,
    runId: state.runId,
    statePath: state.statePath,
    status,
    readiness,
    currentStage: state.currentStage,
    controllerStatus: state.status,
    defaultControllerModel: `${state.policy.controller.provider}:${state.policy.controller.model}`,
    modelControllerEnabled: state.policy.controller.enabled,
    strictModelController: state.policy.requireControllerModel,
    checks,
    readinessBlockers,
    capabilityCoverage,
    environment,
    inspection,
    recovery,
    feasibility,
    datasetSemanticAudit,
    latestAgenda: agenda,
    latestIssueLedger: issueLedger,
    latestStageReview: stageReview,
    nextCommand: readiness === "ready_to_follow" ? `agenteer research controller-follow-loop --state ${quotePath(state.statePath)} --max-iterations 5` : agenda.primaryCommand,
    outPath,
    reportPath,
  };
}

function buildControllerOperatorAuditReadinessBlockers(
  checks: ControllerOperatorAuditCheck[],
  readiness: ControllerOperatorAudit["readiness"],
): ControllerOperatorAuditReadinessBlocker[] {
  if (readiness === "complete" || readiness === "ready_to_follow") return [];
  const actionable = checks.filter(check => check.status === "fail" || check.status === "warning");
  const blockers = actionable.map(check => ({
    id: check.id,
    severity: check.status === "fail" ? "blocker" as const : "warning" as const,
    category: check.category,
    issueCodes: uniqueText(check.issueCodes ?? issueCodesFromText(check.message)),
    message: check.message,
    evidenceRefs: uniqueText(check.evidenceRefs),
  }));
  const seen = new Set<string>();
  return blockers.filter(blocker => {
    const key = `${blocker.id}:${blocker.severity}:${blocker.issueCodes.join(",")}:${blocker.message}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, 40);
}

function renderControllerOperatorAuditMarkdown(audit: ControllerOperatorAudit): string {
  const readinessBlockers = audit.readinessBlockers?.length
    ? audit.readinessBlockers
    : buildControllerOperatorAuditReadinessBlockers(audit.checks, audit.readiness);
  return [
    "# Controller Operator Audit",
    "",
    `Audit: ${audit.auditId}`,
    `Generated: ${audit.generatedAtIso}`,
    `Run ID: ${audit.runId}`,
    `Status: ${audit.status}`,
    `Readiness: ${audit.readiness}`,
    `Stage: ${audit.currentStage}`,
    `Controller status: ${audit.controllerStatus}`,
    `Default model: ${audit.defaultControllerModel}`,
    `Model controller enabled: ${audit.modelControllerEnabled}`,
    `Strict model controller: ${audit.strictModelController}`,
    "",
    "## Dataset Semantic Audit",
    "",
    `- Present: ${audit.datasetSemanticAudit.present}`,
    `- Status: ${audit.datasetSemanticAudit.status}`,
    `- Selected-role status: ${audit.datasetSemanticAudit.selectedRoleStatus}`,
    `- Issues: ${audit.datasetSemanticAudit.issueCount} (${audit.datasetSemanticAudit.blockerCount} blocker, ${audit.datasetSemanticAudit.warningCount} warning)`,
    ...(audit.datasetSemanticAudit.topIssues.length ? audit.datasetSemanticAudit.topIssues.map(issue => `- ${issue.severity.toUpperCase()} ${issue.column}${issue.selected ? " [selected]" : ""}: ${issue.code} - ${issue.message}`) : ["- Issue: none"]),
    `- Next action: ${audit.datasetSemanticAudit.nextAction ?? "(none)"}`,
    "",
    "## Next Command",
    "",
    "```bash",
    audit.nextCommand,
    "```",
    "",
    "## Readiness Blockers",
    "",
    ...(readinessBlockers.length
      ? readinessBlockers.map(item => `- ${item.severity.toUpperCase()} [${item.category}${item.issueCodes.length ? `:${item.issueCodes.join(",")}` : ""}] ${item.id}: ${item.message}${item.evidenceRefs.length ? ` Evidence: ${item.evidenceRefs.join(", ")}` : ""}`)
      : ["- None recorded."]),
    "",
    "## Checks",
    "",
    ...audit.checks.flatMap(check => [
      `### ${check.id}`,
      "",
      `- Status: ${check.status}`,
      `- Category: ${check.category}`,
      `- Finding: ${check.message}`,
      ...(check.issueCodes?.length ? [`- Issue codes: ${check.issueCodes.join(", ")}`] : []),
      ...(check.evidenceRefs.length ? ["- Evidence:", ...check.evidenceRefs.map(ref => `  - ${ref}`)] : ["- Evidence: none recorded"]),
      "",
    ]),
    "## Capability Coverage",
    "",
    ...audit.capabilityCoverage.map(item => `- [${item.status}] ${item.capability}${item.evidenceRefs.length ? ` (${item.evidenceRefs.length} evidence ref(s))` : ""}`),
    "",
  ].join("\n");
}

function isAdvisoryControllerAuditWarning(check: ControllerOperatorAuditCheck, state: Pick<ControllerState, "currentStage" | "completedStages">): boolean {
  if (check.id === "capability-coverage") return true;
  if (check.id === "environment-preflight") return true;
  if (state.currentStage === "intake" && !state.completedStages.includes("dataset_feasibility") && (check.id === "state-integrity" || check.id === "feasibility" || check.id === "dataset-semantic-audit")) return true;
  return false;
}

const controllerArtifactReportKindByBase = new Map<string, string>([
  ["continuous-benchmark-suite", "continuous-benchmark-suite-report"],
  ["continuous-benchmark-trend", "continuous-benchmark-trend-report"],
  ["exploration", "exploration-report"],
  ["figure-qa", "figure-qa-report"],
  ["literature-context", "literature-context-report"],
  ["literature-qa", "literature-qa-report"],
  ["literature-search", "literature-search-report"],
  ["method-qa", "method-qa-report"],
  ["run-inspection", "run-inspection-report"],
  ["stats-run", "stats-report"],
  ["stats-summary", "stats-report"],
  ["controller-action-contract", "controller-action-contract-report"],
  ["controller-action-readiness", "controller-action-readiness-report"],
  ["controller-benchmark", "controller-benchmark-report"],
  ["controller-capability-manifest", "controller-capability-manifest-report"],
  ["controller-completion-audit", "controller-completion-audit-report"],
  ["controller-dataset-semantic-audit", "controller-dataset-semantic-audit-report"],
  ["controller-decision-context", "controller-decision-context-report"],
  ["controller-decision-quality", "controller-decision-quality-report"],
  ["controller-doctor", "controller-doctor-report"],
  ["controller-environment-preflight", "controller-environment-preflight-report"],
  ["controller-execution-agenda", "controller-execution-agenda-report"],
  ["controller-feasibility-verdict", "controller-feasibility-report"],
  ["controller-follow-agenda", "controller-follow-agenda-report"],
  ["controller-follow-loop", "controller-follow-loop-report"],
  ["controller-golden-packet", "controller-golden-packet-report"],
  ["controller-goal-audit", "controller-goal-audit-report"],
  ["controller-internal-inspection", "controller-internal-inspection-report"],
  ["controller-issue-ledger", "controller-issue-ledger-report"],
  ["controller-model-preflight", "controller-model-preflight-report"],
  ["controller-model-runner-packet", "controller-model-runner-packet-report"],
  ["controller-next-action", "controller-next-action-report"],
  ["controller-operate", "controller-operate-report"],
  ["controller-operator-audit", "controller-operator-audit-report"],
  ["controller-recovery-inspection", "controller-recovery-inspection-report"],
  ["controller-reentry-plan", "controller-reentry-plan-report"],
  ["controller-repair-cycle", "controller-repair-cycle-report"],
  ["controller-repair-verification", "controller-repair-verification-report"],
  ["controller-run-invocation", "controller-run-invocation-report"],
  ["controller-runbook", "controller-runbook-report"],
  ["controller-self-evaluation", "controller-self-evaluation-report"],
  ["controller-source-patch-apply", "controller-source-patch-apply-report"],
  ["controller-source-patch-proposal", "controller-source-patch-proposal-report"],
  ["controller-source-patch-rollback", "controller-source-patch-rollback-report"],
  ["controller-source-patch-verification", "controller-source-patch-verification-report"],
  ["controller-stage-review", "controller-stage-review-report"],
  ["controller-start", "controller-start-report"],
  ["controller-state-snapshot", "controller-state-snapshot-report"],
  ["controller-status", "controller-status-report"],
  ["controller-supervisor", "controller-supervisor-report"],
  ["controller-terminal-handoff", "controller-terminal-handoff-report"],
  ["controller-work-plan", "controller-work-plan-report"],
]);

export function controllerArtifactReportKindPairs(): Array<readonly [string, string]> {
  return Array.from(controllerArtifactReportKindByBase.entries());
}

function expandControllerArtifactKindsWithReports(kinds: string[]): string[] {
  return uniqueText(kinds.flatMap(kind => {
    const reportKind = controllerArtifactReportKindByBase.get(kind);
    return reportKind ? [kind, reportKind] : [kind];
  }));
}

function buildControllerCapabilityManifest(state: ControllerState, _reason: string): ControllerCapabilityManifest {
  const manifestId = `controller_capabilities_${String(state.artifacts.filter(item => item.kind === "controller-capability-manifest").length + 1).padStart(3, "0")}`;
  const outPath = path.join(state.rootDir, `${manifestId}.json`);
  const reportPath = path.join(state.rootDir, `${manifestId}.md`);
  const coverage = new Map(controllerCapabilityCoverage(state).map(item => [item.capability, item]));
  const hasAction = (action: ControllerActionType) => state.actions.some(item => item.action === action && item.status === "succeeded");
  const hasAnyArtifact = (...kinds: string[]) => kinds.some(kind => artifactExists(state, kind));
  const evidence = (...kinds: string[]) => artifactPaths(state, ...kinds);
  const stageCompleted = (stage: ControllerStage) => state.completedStages.includes(stage);
  const entry = (input: {
    id: string;
    description: string;
    commands: string[];
    artifactKinds: string[];
    tests: string[];
    applicable?: boolean;
    covered?: boolean;
    requiredNow?: boolean;
    evidenceRefs?: string[];
    failureMode: string;
  }): ControllerCapabilityManifestEntry => {
    const baseCoverage = coverage.get(input.id);
    const applicable = input.applicable ?? (baseCoverage ? baseCoverage.status !== "not_applicable" : true);
    const artifactKinds = expandControllerArtifactKindsWithReports(input.artifactKinds);
    const evidenceRefs = uniqueText([...(input.evidenceRefs ?? []), ...evidence(...artifactKinds), ...(baseCoverage?.evidenceRefs ?? [])]);
    const covered = input.covered ?? Boolean(baseCoverage?.status === "covered") ?? false;
    const requiredNow = input.requiredNow ?? Boolean(baseCoverage?.status === "missing");
    const status: ControllerCapabilityManifestEntry["status"] = !applicable
      ? "not_applicable"
      : covered
        ? "covered"
        : requiredNow
          ? "missing"
          : "available";
    return {
      id: input.id,
      status,
      description: input.description,
      commands: input.commands,
      artifactKinds,
      evidenceRefs,
      testRefs: input.tests,
      failureMode: input.failureMode,
    };
  };
  const stateCommand = `agenteer research controller-run --state ${quotePath(state.statePath)} --max-steps 4`;
  const startCommand = `agenteer research controller-start --question ${JSON.stringify(state.inputs.question)} --out-dir ${quotePath(state.rootDir)}`;
  const entries: ControllerCapabilityManifestEntry[] = [
    entry({
      id: "golden_path_startup",
      description: "One-command controller startup that creates durable state, first-read status, and launch runbook evidence before execution; --operate can delegate into the bounded operate loop.",
      commands: [startCommand, `${startCommand} --operate --max-cycles 4`],
      artifactKinds: ["controller-start", "controller-start-report", "controller-status", "controller-runbook", "controller-operate"],
      evidenceRefs: evidence("controller-start", "controller-start-report", "controller-status", "controller-runbook", "controller-operate"),
      tests: ["packages/cli/tests/research-controller.test.ts"],
      covered: hasAnyArtifact("controller-start") && hasAnyArtifact("controller-status") && hasAnyArtifact("controller-runbook"),
      failureMode: "A user or fresh model runner must manually compose init/status/runbook/operate and may skip the readiness envelope before execution.",
    }),
    entry({
      id: "persistent_state_machine",
      description: "Durable controller state, checkpoints, snapshots, run ledgers, and terminal handoff artifacts.",
      commands: ["agenteer research controller-init", "agenteer research controller-start", "agenteer research controller-step", stateCommand],
      artifactKinds: ["controller-state", "controller-start", "controller-step-checkpoint", "controller-state-snapshot", "controller-run-invocation", "controller-terminal-handoff"],
      evidenceRefs: [state.statePath, ...evidence("controller-start", "controller-step-checkpoint", "controller-state-snapshot", "controller-run-invocation", "controller-terminal-handoff")],
      tests: ["packages/cli/tests/research-controller.test.ts"],
      covered: Boolean(state.runId && state.statePath),
      failureMode: "A runner cannot resume, audit, or prove what happened after interruption.",
    }),
    entry({
      id: "default_gpt54_controller_model",
      description: "Default model configuration for the controller runner is OpenAI GPT-5.4, disabled unless model control is requested.",
      commands: ["agenteer research controller-run --controller openai:gpt-5.4 --use-model"],
      artifactKinds: ["controller-model-preflight", "controller-decision-quality"],
      evidenceRefs: evidence("controller-model-preflight", "controller-decision-quality"),
      tests: ["packages/cli/tests/research-controller.test.ts"],
      covered: state.policy.controller.provider === "openai" && state.policy.controller.model === "gpt-5.4",
      failureMode: "Controller runs may silently use an unexpected model or deterministic fallback policy.",
    }),
    entry({
      id: "strict_model_controller",
      description: "Strict model-runner mode refuses deterministic fallback when model control is required.",
      commands: [`agenteer research controller-run --state ${quotePath(state.statePath)} --use-model --require-controller-model --controller ${state.policy.controller.provider}:${state.policy.controller.model}`],
      artifactKinds: ["controller-model-preflight", "controller-decision-quality", "controller-decision-context"],
      evidenceRefs: evidence("controller-model-preflight", "controller-decision-quality", "controller-decision-context"),
      tests: ["packages/cli/tests/research-controller.test.ts"],
      applicable: state.policy.controller.enabled || state.policy.requireControllerModel,
      covered: state.policy.requireControllerModel && state.decisions.some(item => item.source === "model"),
      requiredNow: state.policy.requireControllerModel,
      failureMode: "A run advertised as model-controlled may proceed deterministically without proof.",
    }),
    entry({
      id: "context_preflight",
      description: "Autocontext preflight before planning, including freshness, memory, impact, and context manifest evidence.",
      commands: [stateCommand, "agenteer agent context-preflight"],
      artifactKinds: ["controller-context-preflight", "controller-context-manifest"],
      evidenceRefs: evidence("controller-context-preflight", "controller-context-manifest"),
      tests: ["packages/cli/tests/research-controller.test.ts", "packages/cli/tests/agent.test.ts"],
      applicable: state.policy.allowContext,
      covered: hasAnyArtifact("controller-context-manifest"),
      requiredNow: state.policy.requireContext,
      failureMode: "Planning proceeds with stale or missing repository/task context.",
    }),
    entry({
      id: "dataset_feasibility",
      description: "Pre-analysis feasibility gate for required variables, missingness, row counts, semantic plausibility, and method-specific viability.",
      commands: [stateCommand, "agenteer research table-summary", "agenteer research explore"],
      artifactKinds: ["table-summary", "controller-dataset-semantic-audit", "controller-dataset-semantic-audit-report", "controller-feasibility-verdict", "controller-feasibility-report"],
      evidenceRefs: evidence("table-summary", "controller-dataset-semantic-audit", "controller-dataset-semantic-audit-report", "controller-feasibility-verdict", "controller-feasibility-report"),
      tests: ["packages/cli/tests/research-controller.test.ts"],
      applicable: Boolean(state.inputs.dataPath),
      covered: stageCompleted("dataset_feasibility") && hasAnyArtifact("controller-feasibility-verdict"),
      requiredNow: Boolean(state.inputs.dataPath) && !stageCompleted("dataset_feasibility"),
      failureMode: "Weak, impossible, or semantically implausible study ideas reach execution.",
    }),
    entry({
      id: "dataset_exploration",
      description: "Exploratory data profiling and hypothesis scouting before formal method selection.",
      commands: [stateCommand, "agenteer research explore"],
      artifactKinds: ["exploration", "exploration-report"],
      evidenceRefs: evidence("exploration", "exploration-report"),
      tests: ["packages/cli/tests/research-controller.test.ts", "packages/cli/tests/research-exploration.test.ts"],
      applicable: Boolean(state.inputs.dataPath),
      covered: stageCompleted("exploration") && hasAnyArtifact("exploration"),
      failureMode: "The controller chooses methods without first understanding the data shape and candidate associations.",
    }),
    entry({
      id: "literature_intake_and_qa",
      description: "MedBrevia literature search/context before planning and literature QA after manuscript generation.",
      commands: [stateCommand, "agenteer research literature-search", "agenteer research literature-qa"],
      artifactKinds: ["literature-search", "literature-context", "literature-qa"],
      evidenceRefs: evidence("literature-search", "literature-context", "literature-qa"),
      tests: ["packages/cli/tests/research-literature.test.ts", "packages/cli/tests/research-controller.test.ts"],
      applicable: state.policy.allowLiterature,
      covered: hasAnyArtifact("literature-context") && (!stageCompleted("manuscript") || hasAnyArtifact("literature-qa")),
      failureMode: "The paper ignores current evidence or overstates claims relative to literature context.",
    }),
    entry({
      id: "method_selection_and_modeling_plan",
      description: "Modeling plan and executable method selection with bounded route choice before analysis.",
      commands: [stateCommand, "agenteer research modeling-plan", "agenteer research method-select"],
      artifactKinds: ["controller-modeling-plan", "method-selection"],
      evidenceRefs: evidence("controller-modeling-plan", "method-selection"),
      tests: ["packages/cli/tests/research-controller.test.ts", "packages/cli/tests/research-modeling.test.ts"],
      covered: hasAnyArtifact("controller-modeling-plan") && hasAnyArtifact("method-selection"),
      requiredNow: stageCompleted("exploration") && !stageCompleted("method_selection"),
      failureMode: "Analysis execution starts without a defensible method-selection rationale.",
    }),
    entry({
      id: "analysis_execution",
      description: "Bounded stats execution through the research-machine runner, with typed result and QA artifacts.",
      commands: [stateCommand, "agenteer research stats-run"],
      artifactKinds: ["stats-summary", "stats-qa", "figure-manifest"],
      evidenceRefs: evidence("stats-summary", "stats-qa", "figure-manifest"),
      tests: ["packages/cli/tests/research-stats.test.ts", "packages/cli/tests/research-controller.test.ts"],
      applicable: state.policy.allowExecution,
      covered: hasAction("run_analysis") && hasAnyArtifact("stats-summary"),
      requiredNow: stageCompleted("method_selection") && !stageCompleted("execution"),
      failureMode: "The controller claims study progress without running the declared analysis.",
    }),
    entry({
      id: "method_qa",
      description: "Methods-aware deterministic QA over diagnostics, claim alignment, missingness, artifacts, and semantic plausibility.",
      commands: [stateCommand, "agenteer research method-qa"],
      artifactKinds: ["method-qa"],
      evidenceRefs: evidence("method-qa"),
      tests: ["packages/cli/tests/research-trust.test.ts", "packages/cli/tests/research-controller.test.ts"],
      covered: hasAnyArtifact("method-qa"),
      requiredNow: stageCompleted("execution") && !stageCompleted("qa"),
      failureMode: "Invalid models, sparse cells, implausible values, or unsupported claims are not blocked before manuscript writing.",
    }),
    entry({
      id: "manuscript_generation",
      description: "Human-readable manuscript generation with manuscript QA and artifact-backed reporting.",
      commands: [stateCommand, "agenteer research manuscript"],
      artifactKinds: ["manuscript", "manuscript-qa"],
      evidenceRefs: evidence("manuscript", "manuscript-qa"),
      tests: ["packages/cli/tests/research-trust.test.ts", "packages/cli/tests/research-controller.test.ts"],
      covered: hasAnyArtifact("manuscript") && hasAnyArtifact("manuscript-qa"),
      requiredNow: stageCompleted("qa") && !stageCompleted("manuscript"),
      failureMode: "The run has machine artifacts but no readable, QA-checked report.",
    }),
    entry({
      id: "external_reviewer_panel",
      description: "Cold external reviewer panel with adjudication, response, and state re-entry artifacts.",
      commands: [stateCommand, "agenteer research study-critic"],
      artifactKinds: ["review-packet", "review-panel", "review-adjudication", "review-response", "state-reentry"],
      evidenceRefs: evidence("review-packet", "review-panel", "review-adjudication", "review-response", "state-reentry"),
      tests: ["packages/cli/tests/research-reviewer.test.ts", "packages/cli/tests/research-controller.test.ts"],
      applicable: state.policy.allowExternalReview || state.policy.requireExternalReviewForPromotion,
      covered: hasAnyArtifact("review-adjudication"),
      requiredNow: state.policy.requireExternalReviewForPromotion && stageCompleted("manuscript"),
      failureMode: "A paper can promote without independent model-review evidence where policy requires it.",
    }),
    entry({
      id: "bounded_repair",
      description: "Reviewer-derived bounded repair plugins with post-repair verification before the state machine can claim repair capability.",
      commands: [stateCommand, `agenteer research controller-repair-cycle --state ${quotePath(state.statePath)}`, "agenteer research controller-resume"],
      artifactKinds: ["controller-repair-plan", "controller-repair-execution", "controller-repair-verification", "controller-repair-verification-report", "controller-repair-cycle"],
      evidenceRefs: evidence("controller-repair-plan", "controller-repair-execution", "controller-repair-verification", "controller-repair-verification-report", "controller-repair-cycle", "review-response", "state-reentry"),
      tests: ["packages/cli/tests/research-controller.test.ts", "packages/cli/tests/research-reviewer.test.ts"],
      applicable: state.policy.allowAutoRepair && (state.repairs.length > 0 || state.policy.allowExternalReview || state.policy.requireExternalReviewForPromotion),
      covered: state.repairs.some(item => item.status === "succeeded" || item.status === "partial") && hasAnyArtifact("controller-repair-verification"),
      failureMode: "Reviewer feedback can appear repaired without proof that accepted findings were accounted for and fresh review was required where appropriate.",
    }),
    entry({
      id: "safe_input_patching",
      description: "Validated controller input patches with downstream invalidation and provenance.",
      commands: [`agenteer research controller-patch --state ${quotePath(state.statePath)} --patch '{"exposure":"column"}' --reason "reviewed correction"`],
      artifactKinds: ["controller-input-patch"],
      evidenceRefs: state.patches.map(item => item.outPath),
      tests: ["packages/cli/tests/research-controller.test.ts"],
      applicable: state.policy.allowInputPatches,
      covered: state.patches.some(item => item.status === "applied"),
      failureMode: "A runner mutates study intent without safe-field validation or invalidating stale downstream evidence.",
    }),
    entry({
      id: "controller_tools",
      description: "Bounded tool actions for first-read status, inspection, artifact previews, repository file reads/searches, git diffs, non-applying patch proposals, reviewed patch application, post-apply verification, rollback, build, and tests with captured output.",
      commands: [
        `agenteer research controller-tool --state ${quotePath(state.statePath)} --tool controller-status --reason "refresh first-read status"`,
        `agenteer research controller-tool --state ${quotePath(state.statePath)} --tool controller-inspect --reason "inspect state"`,
        `agenteer research controller-tool --state ${quotePath(state.statePath)} --tool controller-search-repo --arg ControllerState --arg packages/cli/src --reason "search source"`,
        `agenteer research controller-tool --state ${quotePath(state.statePath)} --tool controller-read-file --arg packages/cli/src/research-machine/controller.ts --reason "read source"`,
        `agenteer research controller-tool --state ${quotePath(state.statePath)} --tool controller-run-agenteer --arg research --arg methods-catalog --arg --json --reason "inspect methods catalog"`,
        `agenteer research controller-tool --state ${quotePath(state.statePath)} --tool controller-git-diff --reason "inspect source diff"`,
        `agenteer research controller-tool --state ${quotePath(state.statePath)} --tool controller-propose-patch --arg '<proposal-json>' --reason "record source patch proposal"`,
        `agenteer research controller-tool --state ${quotePath(state.statePath)} --tool controller-apply-patch --arg latest --reason "apply reviewed source patch proposal"`,
        `agenteer research controller-tool --state ${quotePath(state.statePath)} --tool controller-verify-patch --arg latest --reason "run declared patch verification"`,
        `agenteer research controller-tool --state ${quotePath(state.statePath)} --tool controller-rollback-patch --arg latest --reason "rollback failed source patch"`,
      ],
      artifactKinds: ["controller-tool-action", "controller-status", "controller-status-report", "controller-repo-file-read", "controller-repo-search", "controller-agenteer-command", "controller-git-diff", "controller-source-patch-proposal", "controller-source-patch-apply", "controller-source-patch-verification", "controller-source-patch-rollback"],
      evidenceRefs: state.toolActions.map(item => item.outPath),
      tests: ["packages/cli/tests/research-controller.test.ts"],
      applicable: state.policy.allowToolActions,
      covered: state.toolActions.length > 0 && state.toolActions.every(item => item.status === "succeeded"),
      failureMode: "A model runner cannot gather bounded evidence before acting.",
    }),
    entry({
      id: "bounded_agenteer_introspection",
      description: "Allowlisted read-only Agenteer CLI execution for catalog/status/provider introspection without arbitrary shell access.",
      commands: [
        `agenteer research controller-tool --state ${quotePath(state.statePath)} --tool controller-run-agenteer --arg research --arg methods-catalog --arg --json --reason "inspect methods"`,
        `agenteer research controller-tool --state ${quotePath(state.statePath)} --tool controller-run-agenteer --arg research --arg machine-status --arg --json --reason "inspect runtime status"`,
      ],
      artifactKinds: ["controller-agenteer-command", "controller-agenteer-command-stderr"],
      evidenceRefs: evidence("controller-agenteer-command", "controller-agenteer-command-stderr"),
      tests: ["packages/cli/tests/research-controller.test.ts"],
      applicable: state.policy.allowToolActions && state.policy.allowedToolIds.includes("controller-run-agenteer"),
      covered: hasAnyArtifact("controller-agenteer-command"),
      failureMode: "A model runner cannot ask Agenteer's own read-only CLI surfaces for methods, runtime, phenotype, or reviewer-provider context.",
    }),
    entry({
      id: "repo_context_tools",
      description: "Safe repository search and file-preview tools so a model controller can inspect source/docs before proposing implementation changes.",
      commands: [
        `agenteer research controller-tool --state ${quotePath(state.statePath)} --tool controller-search-repo --arg '<query>' --arg packages/cli/src --reason "find implementation context"`,
        `agenteer research controller-tool --state ${quotePath(state.statePath)} --tool controller-read-file --arg '<repo-relative-file>' --reason "read implementation context"`,
      ],
      artifactKinds: ["controller-repo-search", "controller-repo-file-read"],
      evidenceRefs: evidence("controller-repo-search", "controller-repo-file-read"),
      tests: ["packages/cli/tests/research-controller.test.ts"],
      applicable: state.policy.allowToolActions && state.policy.allowedToolIds.includes("controller-search-repo") && state.policy.allowedToolIds.includes("controller-read-file"),
      covered: hasAnyArtifact("controller-repo-search") || hasAnyArtifact("controller-repo-file-read"),
      failureMode: "A model runner can propose changes only from artifact names or prior prompt context, not current repository evidence.",
    }),
    entry({
      id: "source_patch_proposals",
      description: "Non-destructive implementation proposals for source changes, bounded to repository paths and linked to verification commands.",
      commands: [`agenteer research controller-tool --state ${quotePath(state.statePath)} --tool controller-propose-patch --arg '<proposal-json>' --reason "propose implementation change"`],
      artifactKinds: ["controller-source-patch-proposal"],
      evidenceRefs: evidence("controller-source-patch-proposal"),
      tests: ["packages/cli/tests/research-controller.test.ts"],
      applicable: state.policy.allowToolActions && state.policy.allowedToolIds.includes("controller-propose-patch"),
      covered: hasAnyArtifact("controller-source-patch-proposal"),
      failureMode: "A model runner can identify needed code changes but cannot persist an auditable implementation proposal.",
    }),
    entry({
      id: "source_patch_application",
      description: "Reviewed source patch application with repository path bounds, before/after hash checks, backups, post-apply verification, rollback, and diff evidence.",
      commands: [
        `agenteer research controller-tool --state ${quotePath(state.statePath)} --tool controller-apply-patch --arg latest --reason "apply reviewed implementation change"`,
        `agenteer research controller-tool --state ${quotePath(state.statePath)} --tool controller-verify-patch --arg latest --reason "verify applied implementation change"`,
        `agenteer research controller-tool --state ${quotePath(state.statePath)} --tool controller-rollback-patch --arg latest --reason "rollback implementation change when verification fails"`,
      ],
      artifactKinds: [
        "controller-source-patch-apply",
        "controller-source-patch-apply-record",
        "controller-source-patch-apply-report",
        "controller-git-diff-after-apply",
        "controller-source-patch-verification",
        "controller-source-patch-verification-record",
        "controller-source-patch-verification-report",
        "controller-git-diff-after-verification",
        "controller-source-patch-rollback",
        "controller-source-patch-rollback-record",
        "controller-source-patch-rollback-report",
        "controller-git-diff-after-rollback",
      ],
      evidenceRefs: evidence(
        "controller-source-patch-apply",
        "controller-source-patch-apply-record",
        "controller-source-patch-apply-report",
        "controller-git-diff-after-apply",
        "controller-source-patch-verification",
        "controller-source-patch-verification-record",
        "controller-source-patch-verification-report",
        "controller-git-diff-after-verification",
        "controller-source-patch-rollback",
        "controller-source-patch-rollback-record",
        "controller-source-patch-rollback-report",
        "controller-git-diff-after-rollback",
      ),
      tests: ["packages/cli/tests/research-controller.test.ts"],
      applicable: state.policy.allowToolActions && state.policy.allowedToolIds.includes("controller-apply-patch"),
      covered: hasAnyArtifact("controller-source-patch-apply") && (hasAnyArtifact("controller-source-patch-verification") || hasAnyArtifact("controller-source-patch-rollback")),
      failureMode: "A model runner can propose code changes but cannot safely mutate files with rollback and verification evidence.",
    }),
    entry({
      id: "work_plan_issue_ledger_stage_review",
      description: "Operator-like planning memory: work plan, issue ledger, and stage review after each step.",
      commands: [stateCommand, "agenteer research controller-inspect"],
      artifactKinds: ["controller-work-plan", "controller-issue-ledger", "controller-stage-review"],
      evidenceRefs: [...evidence("controller-work-plan", "controller-issue-ledger", "controller-stage-review")],
      tests: ["packages/cli/tests/research-controller.test.ts"],
      covered: hasAnyArtifact("controller-work-plan") && hasAnyArtifact("controller-issue-ledger") && (!state.actions.length || hasAnyArtifact("controller-stage-review")),
      failureMode: "A runner lacks the human-style working memory needed to continue safely after pauses.",
    }),
    entry({
      id: "execution_agenda",
      description: "Ranked bounded command queue for follow-agenda, follow-loop, and supervisor pickup.",
      commands: [`agenteer research controller-agenda --state ${quotePath(state.statePath)}`, `agenteer research controller-follow-agenda --state ${quotePath(state.statePath)}`, `agenteer research controller-follow-loop --state ${quotePath(state.statePath)}`, `agenteer research controller-supervise --state ${quotePath(state.statePath)}`],
      artifactKinds: ["controller-execution-agenda", "controller-execution-agenda-report", "controller-follow-agenda", "controller-follow-agenda-report", "controller-follow-loop", "controller-follow-loop-report", "controller-supervisor", "controller-supervisor-report"],
      evidenceRefs: evidence("controller-execution-agenda", "controller-execution-agenda-report", "controller-follow-agenda", "controller-follow-agenda-report", "controller-follow-loop", "controller-follow-loop-report", "controller-supervisor", "controller-supervisor-report"),
      tests: ["packages/cli/tests/research-controller.test.ts"],
      covered: hasAnyArtifact("controller-execution-agenda"),
      failureMode: "A future runner has no bounded command queue and must infer next actions from scratch.",
    }),
    entry({
      id: "actionable_run_inspection_recovery",
      description: "Run-inspection recommended commands are propagated into terminal handoff, next-action alternatives, execution agenda, model-runner packet, and launch runbook recovery commands.",
      commands: [
        `agenteer research run-inspect --run-dir ${quotePath(state.inputs.runDir)}`,
        `agenteer research controller-agenda --state ${quotePath(state.statePath)}`,
        `agenteer research controller-follow-agenda --state ${quotePath(state.statePath)}`,
        `agenteer research controller-runner-packet --state ${quotePath(state.statePath)}`,
        `agenteer research controller-runbook --state ${quotePath(state.statePath)}`,
      ],
      artifactKinds: ["run-inspection", "controller-terminal-handoff", "controller-next-action", "controller-execution-agenda", "controller-model-runner-packet", "controller-runbook"],
      evidenceRefs: evidence("run-inspection", "controller-terminal-handoff", "controller-next-action", "controller-execution-agenda", "controller-model-runner-packet", "controller-runbook"),
      tests: ["packages/cli/tests/research-controller.test.ts"],
      covered: hasAnyArtifact("controller-execution-agenda") && hasAnyArtifact("controller-model-runner-packet") && (state.status === "running" || artifactExists(state, "controller-terminal-handoff") && artifactExists(state, "controller-next-action")),
      failureMode: "Run inspection can identify concrete repairs, but a fresh runner cannot find or execute those commands from controller handoff artifacts.",
    }),
    entry({
      id: "environment_preflight",
      description: "Workspace runtime preflight for repository root, package scripts, Node/npm, CLI dist freshness, git status, and controller tool policy.",
      commands: [`agenteer research controller-env --state ${quotePath(state.statePath)}`],
      artifactKinds: ["controller-environment-preflight", "controller-environment-preflight-report"],
      evidenceRefs: evidence("controller-environment-preflight", "controller-environment-preflight-report"),
      tests: ["packages/cli/tests/research-controller.test.ts"],
      covered: hasAnyArtifact("controller-environment-preflight"),
      failureMode: "An unattended runner starts work without knowing whether the local CLI/runtime/git/tool environment is healthy.",
    }),
    entry({
      id: "operator_audit",
      description: "Public readiness audit combining state integrity, recovery, agenda, capabilities, cost, and blockers.",
      commands: [`agenteer research controller-audit --state ${quotePath(state.statePath)}`],
      artifactKinds: ["controller-operator-audit", "controller-operator-audit-report"],
      evidenceRefs: evidence("controller-operator-audit", "controller-operator-audit-report"),
      tests: ["packages/cli/tests/research-controller.test.ts"],
      covered: hasAnyArtifact("controller-operator-audit"),
      failureMode: "An unattended runner cannot prove whether it is safe to continue.",
    }),
    entry({
      id: "supervised_pickup",
      description: "Bounded supervisor pickup that refreshes runner packets, follows safe agenda items, and records post-round readiness evidence.",
      commands: [`agenteer research controller-supervise --state ${quotePath(state.statePath)}`],
      artifactKinds: ["controller-supervisor", "controller-supervisor-report"],
      evidenceRefs: evidence("controller-supervisor", "controller-supervisor-report"),
      tests: ["packages/cli/tests/research-controller.test.ts"],
      covered: hasAnyArtifact("controller-supervisor"),
      requiredNow: false,
      failureMode: "A fresh runner cannot prove that unattended agenda pickup is bounded, audited, and stopped when unsafe.",
    }),
    entry({
      id: "operational_doctor",
      description: "Unified readiness report for humans and fresh model runners, combining audit, completion, runner-packet, capability, re-entry, supervisor, repair, artifact, and cost posture.",
      commands: [`agenteer research controller-doctor --state ${quotePath(state.statePath)}`],
      artifactKinds: ["controller-doctor", "controller-doctor-report"],
      evidenceRefs: evidence("controller-doctor", "controller-doctor-report"),
      tests: ["packages/cli/tests/research-controller.test.ts"],
      covered: hasAnyArtifact("controller-doctor"),
      requiredNow: false,
      failureMode: "Operators must inspect scattered artifacts manually and may miss a blocker before handing work to a fresh model runner.",
    }),
    entry({
      id: "operational_status",
      description: "First-read controller status summary for humans, schedulers, and fresh model runners, combining launchability, promotability, blockers, warnings, issue codes, next command, and key linked artifacts.",
      commands: [`agenteer research controller-status --state ${quotePath(state.statePath)}`],
      artifactKinds: ["controller-status", "controller-status-report", "controller-doctor", "controller-runbook", "controller-golden-packet"],
      evidenceRefs: evidence("controller-status", "controller-status-report", "controller-doctor", "controller-runbook", "controller-golden-packet"),
      tests: ["packages/cli/tests/research-controller.test.ts"],
      covered: hasAnyArtifact("controller-status"),
      requiredNow: false,
      failureMode: "A human or fresh model runner must reconcile doctor, runbook, and golden-packet artifacts manually before knowing whether to launch, stop, or inspect.",
    }),
    entry({
      id: "controller_operate_loop",
      description: "Doctor-driven unattended operation loop that alternates readiness checks, safe supervision, and eligible bounded repair cycles until stop criteria.",
      commands: [`agenteer research controller-operate --state ${quotePath(state.statePath)}`],
      artifactKinds: ["controller-operate", "controller-operate-report"],
      evidenceRefs: evidence("controller-operate", "controller-operate-report"),
      tests: ["packages/cli/tests/research-controller.test.ts"],
      covered: hasAnyArtifact("controller-operate"),
      requiredNow: false,
      failureMode: "A fresh model or scheduled runner can inspect readiness but still lacks a single bounded command that keeps the state machine moving.",
    }),
    entry({
      id: "controller_launch_runbook",
      description: "Auditable launch manifest for an external or scheduled model runner, binding doctor readiness, runner packet, commands, budgets, env requirements, stop criteria, recovery, and verification.",
      commands: [`agenteer research controller-runbook --state ${quotePath(state.statePath)}`],
      artifactKinds: ["controller-runbook", "controller-runbook-report"],
      evidenceRefs: evidence("controller-runbook", "controller-runbook-report"),
      tests: ["packages/cli/tests/research-controller.test.ts"],
      covered: hasAnyArtifact("controller-runbook"),
      requiredNow: false,
      failureMode: "A separate model runner has commands and packets but no durable launch envelope that says when and how to start, stop, recover, and verify.",
    }),
    entry({
      id: "model_runner_packet",
      description: "Fresh-model runner handoff packet with prompts, operating rules, allowed commands, current agenda, audit state, environment, and capability summary.",
      commands: [`agenteer research controller-runner-packet --state ${quotePath(state.statePath)}`],
      artifactKinds: ["controller-model-runner-packet", "controller-model-runner-packet-report"],
      evidenceRefs: evidence("controller-model-runner-packet", "controller-model-runner-packet-report"),
      tests: ["packages/cli/tests/research-controller.test.ts"],
      covered: hasAnyArtifact("controller-model-runner-packet"),
      failureMode: "A fresh GPT-style runner receives state files but not an explicit operating packet, prompt, command envelope, and evidence map.",
    }),
    entry({
      id: "goal_completion_audit",
      description: "Requirement-by-requirement goal audit that prevents the controller from claiming completion from partial or indirect evidence.",
      commands: [`agenteer research controller-goal-audit --state ${quotePath(state.statePath)}`],
      artifactKinds: ["controller-goal-audit", "controller-goal-audit-report"],
      evidenceRefs: evidence("controller-goal-audit", "controller-goal-audit-report"),
      tests: ["packages/cli/tests/research-controller.test.ts"],
      covered: hasAnyArtifact("controller-goal-audit"),
      failureMode: "A model runner overclaims the overall controller-agent build without checking each required capability against authoritative evidence.",
    }),
    entry({
      id: "continuous_benchmark_regression_suite",
      description: "Continuous benchmark scoring over representative research run directories, using unified run inspection to track packet completeness, QA status, rerun stability, cost, report readability, and artifact integrity before framework changes are promoted.",
      commands: [
        `agenteer research controller-benchmark --state ${quotePath(state.statePath)}`,
        "agenteer research benchmark-suite-run --suite ./.loop-memory/golden --out-dir ./.loop-memory/benchmark-history",
        "agenteer research benchmark-trend --history ./.loop-memory/benchmark-history",
      ],
      artifactKinds: ["controller-benchmark", "controller-benchmark-report", "continuous-benchmark-suite", "continuous-benchmark-suite-report", "continuous-benchmark-trend", "continuous-benchmark-trend-report"],
      evidenceRefs: evidence("controller-benchmark", "controller-benchmark-report", "continuous-benchmark-suite", "continuous-benchmark-suite-report", "continuous-benchmark-trend", "continuous-benchmark-trend-report"),
      tests: ["packages/cli/tests/research-trust.test.ts", "packages/cli/tests/research.test.ts"],
      covered: hasAnyArtifact("continuous-benchmark-suite") && hasAnyArtifact("continuous-benchmark-trend"),
      requiredNow: false,
      failureMode: "Framework changes can pass local unit tests while regressing packet readiness, methods correctness, figure/report quality, rerun stability, or artifact integrity on representative research runs.",
    }),
    entry({
      id: "completion_audit_and_promotion",
      description: "Completion audit and self-evaluation prove that generated artifacts satisfy promotion policy before complete status.",
      commands: [stateCommand, `agenteer research controller-completion-audit --state ${quotePath(state.statePath)}`, "agenteer research controller-inspect"],
      artifactKinds: ["controller-completion-audit", "controller-self-evaluation", "run-inspection"],
      evidenceRefs: evidence("controller-completion-audit", "controller-self-evaluation", "run-inspection"),
      tests: ["packages/cli/tests/research-controller.test.ts"],
      covered: hasAnyArtifact("controller-completion-audit") && hasAnyArtifact("controller-self-evaluation"),
      requiredNow: state.currentStage === "promotion_decision" || state.status === "complete",
      failureMode: "Generated outputs can be mistaken for promoted, validated study packets.",
    }),
    entry({
      id: "terminal_handoff_and_reentry",
      description: "Terminal next-action, handoff, and re-entry packets for blocked, complete, or human-review states.",
      commands: [`agenteer research controller-inspect --state ${quotePath(state.statePath)}`, `agenteer research controller-resume --state ${quotePath(state.statePath)}`],
      artifactKinds: ["controller-terminal-handoff", "controller-next-action", "controller-reentry-plan"],
      evidenceRefs: evidence("controller-terminal-handoff", "controller-next-action", "controller-reentry-plan"),
      tests: ["packages/cli/tests/research-controller.test.ts"],
      applicable: state.status !== "running" || isTerminal(state.currentStage),
      covered: hasAnyArtifact("controller-terminal-handoff") && hasAnyArtifact("controller-next-action") && hasAnyArtifact("controller-reentry-plan"),
      requiredNow: state.status !== "running" || isTerminal(state.currentStage),
      failureMode: "A stopped run is not actionable for the next model runner or human operator.",
    }),
    entry({
      id: "artifact_integrity_and_cost_boundary",
      description: "Artifact hashes and model/reviewer cost boundaries are tracked before promotion or autonomous continuation.",
      commands: [`agenteer research controller-audit --state ${quotePath(state.statePath)}`, stateCommand],
      artifactKinds: ["controller-action-contract", "controller-model-preflight", "controller-run-invocation"],
      evidenceRefs: evidence("controller-action-contract", "controller-model-preflight", "controller-run-invocation"),
      tests: ["packages/cli/tests/research-controller.test.ts"],
      covered: state.artifacts.every(item => !item.requiredForPromotion || Boolean(item.sha256)) && state.costEstimateUsd <= state.policy.reviewerBudget.maxStudyLoopUsd + state.policy.controllerBudget.maxStudyLoopUsd,
      failureMode: "The controller cannot prove artifact provenance or keep autonomous work inside cost limits.",
    }),
  ];
  const summary = {
    covered: entries.filter(item => item.status === "covered").length,
    missing: entries.filter(item => item.status === "missing").length,
    available: entries.filter(item => item.status === "available").length,
    notApplicable: entries.filter(item => item.status === "not_applicable").length,
  };
  return {
    schemaVersion: 1,
    generatedAtIso: nowIso(),
    manifestId,
    runId: state.runId,
    statePath: state.statePath,
    defaultControllerModel: `${state.policy.controller.provider}:${state.policy.controller.model}`,
    controllerCommands: [
      "controller-init",
      "controller-start",
      "controller-step",
      "controller-run",
      "run-autonomous",
      "controller-patch",
      "controller-resume",
      "controller-tool",
      "controller-inspect",
      "controller-agenda",
      "controller-follow-agenda",
      "controller-follow-loop",
      "controller-supervise",
      "controller-env",
      "controller-audit",
      "controller-status",
      "controller-doctor",
      "controller-operate",
      "controller-capabilities",
      "controller-benchmark",
      "controller-goal-audit",
      "controller-completion-audit",
      "controller-golden-packet",
      "controller-repair-cycle",
      "controller-runbook",
      "controller-runner-packet",
      "controller-self-test",
    ],
    entries,
    summary,
    outPath,
    reportPath,
  };
}

function renderControllerCapabilityManifestMarkdown(manifest: ControllerCapabilityManifest): string {
  return [
    "# Controller Capability Manifest",
    "",
    `Manifest: ${manifest.manifestId}`,
    `Generated: ${manifest.generatedAtIso}`,
    `Run ID: ${manifest.runId}`,
    `State: ${manifest.statePath}`,
    `Default model: ${manifest.defaultControllerModel}`,
    "",
    "## Summary",
    "",
    `- Covered: ${manifest.summary.covered}`,
    `- Available: ${manifest.summary.available}`,
    `- Missing: ${manifest.summary.missing}`,
    `- Not applicable: ${manifest.summary.notApplicable}`,
    "",
    "## Commands",
    "",
    ...manifest.controllerCommands.map(command => `- ${command}`),
    "",
    "## Capabilities",
    "",
    ...manifest.entries.flatMap(entry => [
      `### ${entry.id}`,
      "",
      `- Status: ${entry.status}`,
      `- Description: ${entry.description}`,
      `- Failure mode: ${entry.failureMode}`,
      `- Artifact kinds: ${entry.artifactKinds.join(", ") || "(none)"}`,
      `- Test refs: ${entry.testRefs.join(", ") || "(none)"}`,
      "- Commands:",
      ...entry.commands.map(command => `  - \`${command}\``),
      ...(entry.evidenceRefs.length ? ["- Evidence:", ...entry.evidenceRefs.map(ref => `  - ${ref}`)] : ["- Evidence: none recorded yet"]),
      "",
    ]),
  ].join("\n");
}

function buildControllerGoalAudit(
  state: ControllerState,
  operatorAudit: ControllerOperatorAudit,
  capabilityManifest: ControllerCapabilityManifest,
  issueLedger: ControllerIssueLedger,
  objective?: string,
): ControllerGoalAudit {
  const auditId = `controller_goal_audit_${String(state.artifacts.filter(item => item.kind === "controller-goal-audit").length + 1).padStart(3, "0")}`;
  const outPath = path.join(state.rootDir, `${auditId}.json`);
  const reportPath = path.join(state.rootDir, `${auditId}.md`);
  const byId = new Map(capabilityManifest.entries.map(entry => [entry.id, entry]));
  const cap = (id: string) => byId.get(id) ?? null;
  const capStatus = (ids: string[]): ControllerGoalAuditRequirement["status"] => {
    const entries = ids.map(cap).filter((item): item is ControllerCapabilityManifestEntry => Boolean(item));
    if (!entries.length) return "missing";
    if (entries.every(entry => entry.status === "not_applicable")) return "not_applicable";
    if (entries.every(entry => entry.status === "covered" || entry.status === "not_applicable")) return "proved";
    if (entries.some(entry => entry.status === "missing")) return "missing";
    return "partial";
  };
  const capEvidence = (ids: string[]) => uniqueText(ids.flatMap(id => {
    const entry = cap(id);
    return entry ? [...entry.evidenceRefs, ...entry.testRefs] : [];
  }));
  const capGaps = (ids: string[]) => ids.flatMap(id => {
    const entry = cap(id);
    if (!entry) return [`Capability ${id} is not present in the manifest.`];
    if (entry.status === "missing") return [`${id}: ${entry.failureMode}`];
    if (entry.status === "available") return [`${id}: capability exists but this run has not exercised enough evidence to prove it.`];
    return [];
  });
  const reqs: ControllerGoalAuditRequirement[] = [];
  const activeIssues = issueLedger.issues.filter(issue => issue.status === "active");
  const activeBlockingIssues = activeIssues.filter(issue => issue.severity === "blocker" || issue.severity === "major");
  const activeIssueCodes = uniqueText(activeIssues.map(issue => issue.issueCode).filter((item): item is string => Boolean(item)));
  const add = (
    id: string,
    category: ControllerGoalAuditRequirement["category"],
    requirement: string,
    evidenceStandard: string,
    status: ControllerGoalAuditRequirement["status"],
    evidenceRefs: string[],
    gaps: string[],
    nextAction: string,
    issueCodes: string[] = [],
  ) => {
    reqs.push({
      id,
      category,
      requirement,
      evidenceStandard,
      status,
      ...(issueCodes.length ? { issueCodes: uniqueText(issueCodes) } : {}),
      evidenceRefs: uniqueText(evidenceRefs),
      gaps: uniqueText(gaps),
      nextAction,
    });
  };
  add(
    "persistent_resumable_state",
    "autonomy",
    "Controller persists state, checkpoints, snapshots, agendas, ledgers, and handoff artifacts so another runner can resume without chat context.",
    "persistent_state_machine, work_plan_issue_ledger_stage_review, execution_agenda, environment_preflight, operational_status, operational_doctor, controller_operate_loop, and terminal_handoff_and_reentry capabilities are covered or currently not applicable.",
    capStatus(["persistent_state_machine", "work_plan_issue_ledger_stage_review", "execution_agenda", "environment_preflight", "operational_status", "operational_doctor", "controller_operate_loop", "terminal_handoff_and_reentry"]),
    capEvidence(["persistent_state_machine", "work_plan_issue_ledger_stage_review", "execution_agenda", "environment_preflight", "operational_status", "operational_doctor", "controller_operate_loop", "terminal_handoff_and_reentry"]),
    capGaps(["persistent_state_machine", "work_plan_issue_ledger_stage_review", "execution_agenda", "environment_preflight", "operational_status", "operational_doctor", "controller_operate_loop", "terminal_handoff_and_reentry"]),
    `Run agenteer research controller-follow-loop --state ${quotePath(state.statePath)} --max-iterations 5, then rerun controller-goal-audit.`,
  );
  add(
    "actionable_inspection_recovery",
    "autonomy",
    "Controller carries run-inspection recommended commands into handoff, next-action alternatives, execution agenda, model-runner packet, and launch runbook recovery so a fresh runner can execute concrete QA/repair steps.",
    "actionable_run_inspection_recovery is covered, proving that run-inspection commands are not stranded inside inspection reports.",
    capStatus(["actionable_run_inspection_recovery"]),
    capEvidence(["actionable_run_inspection_recovery"]),
    capGaps(["actionable_run_inspection_recovery"]),
    `Run agenteer research run-inspect --run-dir ${quotePath(state.inputs.runDir)}, then regenerate controller-agenda, controller-runner-packet, controller-runbook, and controller-goal-audit.`,
  );
  add(
    "doctor_driven_autonomous_operation",
    "autonomy",
    "Controller exposes and can prove the doctor-driven operate loop that chooses safe supervision or bounded repair before stopping.",
    "operational_doctor, controller_operate_loop, supervised_pickup, model_runner_packet, and bounded_repair capabilities are covered, available, or not applicable according to policy.",
    capStatus(["operational_doctor", "controller_operate_loop", "supervised_pickup", "model_runner_packet", "bounded_repair"]),
    capEvidence(["operational_doctor", "controller_operate_loop", "supervised_pickup", "model_runner_packet", "bounded_repair"]),
    capGaps(["operational_doctor", "controller_operate_loop", "supervised_pickup", "model_runner_packet", "bounded_repair"]),
    `Run agenteer research controller-operate --state ${quotePath(state.statePath)} --max-cycles 4, then rerun controller-goal-audit.`,
  );
  add(
    "default_gpt54_model_control",
    "model",
    "Controller defaults to GPT-5.4 and can run in strict model-controlled mode with preflight and decision-quality gates.",
    "default_gpt54_controller_model is covered and strict_model_controller is either covered for model runs or available when not requested.",
    capStatus(["default_gpt54_controller_model", "strict_model_controller"]) === "missing" ? "missing" : state.policy.controller.provider === "openai" && state.policy.controller.model === "gpt-5.4" ? "proved" : "partial",
    capEvidence(["default_gpt54_controller_model", "strict_model_controller"]),
    [
      ...capGaps(["default_gpt54_controller_model", "strict_model_controller"]),
      ...(state.policy.controller.provider === "openai" && state.policy.controller.model === "gpt-5.4" ? [] : [`Current controller model is ${state.policy.controller.provider}:${state.policy.controller.model}.`]),
    ],
    `Run controller-run with --use-model --require-controller-model when provider credentials are available, then inspect model preflight and decision-quality artifacts.`,
  );
  add(
    "dataset_grounded_research_pipeline",
    "research",
    "Controller can reject infeasible research ideas and execute the dataset-grounded path through feasibility, exploration, literature, method selection, execution, QA, manuscript, inspection, and promotion decision.",
    "Dataset/method/execution/QA/manuscript/completion capabilities are covered for a data-bearing run; no-data runs mark dataset-dependent checks as not applicable.",
    capStatus(["dataset_feasibility", "dataset_exploration", "method_selection_and_modeling_plan", "analysis_execution", "method_qa", "manuscript_generation", "completion_audit_and_promotion"]),
    capEvidence(["dataset_feasibility", "dataset_exploration", "method_selection_and_modeling_plan", "analysis_execution", "method_qa", "manuscript_generation", "completion_audit_and_promotion"]),
    capGaps(["dataset_feasibility", "dataset_exploration", "method_selection_and_modeling_plan", "analysis_execution", "method_qa", "manuscript_generation", "completion_audit_and_promotion"]),
    `Run a representative row-level study through controller-run --state ${quotePath(state.statePath)} --max-steps 20 and require feasibility/method/manuscript artifacts before promotion.`,
  );
  add(
    "independent_review_and_repair_loop",
    "qa",
    "Controller can route manuscripts through cold reviewer panels, adjudicate findings, repair accepted issues, and re-enter the state machine.",
    "External review and bounded repair capabilities are covered when external review is required, or available/not applicable when policy does not require it.",
    capStatus(["external_reviewer_panel", "bounded_repair"]),
    capEvidence(["external_reviewer_panel", "bounded_repair"]),
    capGaps(["external_reviewer_panel", "bounded_repair"]),
    "Enable --external-review or --require-external-review with reviewer credentials/mock reviewers, then rerun after review-response and repair artifacts exist.",
  );
  add(
    "implementation_change_loop",
    "implementation",
    "Controller can inspect repository context, propose source changes, apply bounded reviewed patches, verify them, and roll them back.",
    "Repo context, controller tools, source patch proposal, and source patch application capabilities are covered or available with clear evidence.",
    capStatus(["repo_context_tools", "bounded_agenteer_introspection", "controller_tools", "source_patch_proposals", "source_patch_application"]),
    capEvidence(["repo_context_tools", "bounded_agenteer_introspection", "controller_tools", "source_patch_proposals", "source_patch_application"]),
    capGaps(["repo_context_tools", "bounded_agenteer_introspection", "controller_tools", "source_patch_proposals", "source_patch_application"]),
    "Exercise controller-search-repo, controller-read-file, controller-run-agenteer, controller-propose-patch, controller-apply-patch, controller-verify-patch, and rollback on a low-risk fixture change.",
  );
  add(
    "bounded_safety_cost_and_artifact_integrity",
    "safety",
    "Controller enforces bounded tools, cost policy, artifact hashing, feasibility blockers, review-required pauses, and explicit human-review states.",
    "Operator audit passes or warns without blockers, artifact/cost capability is covered, and no failed tool/action outcomes are unresolved.",
    operatorAudit.readiness === "blocked" ? "missing" : capStatus(["operator_audit", "artifact_integrity_and_cost_boundary"]),
    uniqueText([operatorAudit.outPath, ...capEvidence(["operator_audit", "artifact_integrity_and_cost_boundary"])]),
    [
      ...(operatorAudit.readiness === "blocked" ? ["Operator audit readiness is blocked."] : []),
      ...operatorAudit.checks.filter(check => check.status === "fail").map(check => `${check.id}: ${check.message}`),
      ...capGaps(["operator_audit", "artifact_integrity_and_cost_boundary"]),
    ],
    operatorAudit.nextCommand,
  );
  add(
    "active_issue_ledger_clearance",
    "safety",
    "Controller goal completion is blocked while active issue-ledger blockers or major issues remain unresolved, including coded feasibility and semantic-plausibility failures.",
    "Latest controller issue ledger is clear, or only nonblocking warnings remain explicitly visible with stable issue codes and evidence refs.",
    activeBlockingIssues.length ? "missing" : activeIssues.length ? "partial" : "proved",
    uniqueText([issueLedger.outPath, issueLedger.reportPath]),
    activeIssues.length
      ? activeIssues.slice(0, 12).map(issue => `${issue.issueCode ? `${issue.issueCode}: ` : ""}${issue.severity}/${issue.category} from ${issue.source}: ${issue.message}`)
      : [],
    activeIssues[0]?.suggestedAction ?? `Run agenteer research controller-doctor --state ${quotePath(state.statePath)} and continue only after the issue ledger is clear.`,
    activeIssueCodes,
  );
  add(
    "documented_and_tested_public_surface",
    "documentation",
    "Controller has CLI commands, documentation, and regression tests covering runner pickup, audit, tools, source-change loop, and research lifecycle.",
    "Capability manifest lists public commands and test refs, docs/research-controller.md exists as the user-facing controller guide, and controller tests exercise the command surface.",
    capabilityManifest.controllerCommands.includes("controller-start") && capabilityManifest.controllerCommands.includes("controller-run") && capabilityManifest.controllerCommands.includes("controller-tool") && capabilityManifest.entries.some(entry => entry.testRefs.includes("packages/cli/tests/research-controller.test.ts"))
      ? "proved"
      : "partial",
    uniqueText([capabilityManifest.outPath, capabilityManifest.reportPath, "docs/research-controller.md", "packages/cli/tests/research-controller.test.ts"]),
    [
      ...(capabilityManifest.controllerCommands.includes("controller-start") ? [] : ["Controller command list is missing controller-start."]),
      ...(capabilityManifest.controllerCommands.includes("controller-run") ? [] : ["Controller command list is missing controller-run."]),
      ...(capabilityManifest.controllerCommands.includes("controller-tool") ? [] : ["Controller command list is missing controller-tool."]),
    ],
    "Run npm test -- packages/cli/tests/research-controller.test.ts and npm test before claiming goal completion.",
  );
  add(
    "continuous_benchmark_regression",
    "testing",
    "Controller/research-machine changes are validated against representative continuous benchmark runs, not only unit tests or one-off generated packets.",
    "continuous_benchmark_regression_suite is covered by controller-benchmark artifacts that attach benchmark-suite-run and benchmark-trend evidence to controller state, or remains available with explicit commands and tests when the current controller state has not run the suite.",
    capStatus(["continuous_benchmark_regression_suite"]) === "missing" ? "partial" : capStatus(["continuous_benchmark_regression_suite"]),
    capEvidence(["continuous_benchmark_regression_suite"]),
    capGaps(["continuous_benchmark_regression_suite"]),
    `Run agenteer research controller-benchmark --state ${quotePath(state.statePath)}, then rerun controller-goal-audit before promoting broad framework changes.`,
  );
  const missingRequirementIds = reqs.filter(req => req.status === "missing").map(req => req.id);
  const partialRequirementIds = reqs.filter(req => req.status === "partial").map(req => req.id);
  const blockingRequirementIds = reqs.filter(req => req.status === "missing" && (req.category === "safety" || req.category === "autonomy" || req.category === "research")).map(req => req.id);
  const provedWeight = reqs.filter(req => req.status === "proved" || req.status === "not_applicable").length;
  const partialWeight = reqs.filter(req => req.status === "partial").length * 0.5;
  const score = Number(((provedWeight + partialWeight) / Math.max(1, reqs.length)).toFixed(3));
  const status: ControllerGoalAudit["status"] = blockingRequirementIds.length ? "fail" : missingRequirementIds.length || partialRequirementIds.length ? "warning" : "pass";
  const readiness: ControllerGoalAudit["readiness"] = status === "pass" && operatorAudit.readiness === "complete" ? "goal_complete" : blockingRequirementIds.length ? "blocked" : "in_progress";
  const firstAction = reqs.find(req => req.status === "missing" || req.status === "partial")?.nextAction ?? operatorAudit.nextCommand;
  return {
    schemaVersion: 1,
    generatedAtIso: nowIso(),
    auditId,
    runId: state.runId,
    statePath: state.statePath,
    objective: objective ?? "Complete build of a Research Controller Agent with fully functional comprehensive testing, GPT-5.4-capable model control, autonomous runner behavior, research-pipeline execution, QA, repair, source-inspection, source-change, verification, and rollback capabilities.",
    status,
    readiness,
    score,
    requirements: reqs,
    missingRequirementIds,
    partialRequirementIds,
    blockingRequirementIds,
    operatorAuditPath: operatorAudit.outPath,
    capabilityManifestPath: capabilityManifest.outPath,
    nextCommand: firstAction,
    outPath,
    reportPath,
  };
}

function renderControllerGoalAuditMarkdown(audit: ControllerGoalAudit): string {
  return [
    "# Controller Goal Audit",
    "",
    `Audit: ${audit.auditId}`,
    `Generated: ${audit.generatedAtIso}`,
    `Run ID: ${audit.runId}`,
    `State: ${audit.statePath}`,
    `Status: ${audit.status}`,
    `Readiness: ${audit.readiness}`,
    `Score: ${audit.score}`,
    "",
    "## Objective",
    "",
    audit.objective,
    "",
    "## Evidence Sources",
    "",
    `- Operator audit: ${audit.operatorAuditPath}`,
    `- Capability manifest: ${audit.capabilityManifestPath}`,
    "",
    "## Requirement Matrix",
    "",
    ...audit.requirements.flatMap(req => [
      `### ${req.id}`,
      "",
      `- Category: ${req.category}`,
      `- Status: ${req.status}`,
      `- Requirement: ${req.requirement}`,
      `- Evidence standard: ${req.evidenceStandard}`,
      `- Next action: ${req.nextAction}`,
      ...(req.issueCodes?.length ? [`- Issue codes: ${req.issueCodes.join(", ")}`] : []),
      ...(req.evidenceRefs.length ? ["- Evidence:", ...req.evidenceRefs.map(ref => `  - ${ref}`)] : ["- Evidence: none"]),
      ...(req.gaps.length ? ["- Gaps:", ...req.gaps.map(gap => `  - ${gap}`)] : ["- Gaps: none"]),
      "",
    ]),
    "## Summary",
    "",
    `- Missing: ${audit.missingRequirementIds.join(", ") || "(none)"}`,
    `- Partial: ${audit.partialRequirementIds.join(", ") || "(none)"}`,
    `- Blocking: ${audit.blockingRequirementIds.join(", ") || "(none)"}`,
    "",
    "## Next Command",
    "",
    "```bash",
    audit.nextCommand,
    "```",
    "",
  ].join("\n");
}

export function renderResearchControllerStateJson(result: ControllerState | ControllerRunResult): string {
  return `${JSON.stringify("state" in result ? result : { schemaVersion: 1, controllerState: result }, null, 2)}\n`;
}

async function evaluateCurrentGate(state: ControllerState): Promise<ControllerGate> {
  switch (state.currentStage) {
    case "intake":
      return gate("intake", state.inputs.question.trim() ? "pass" : "block", state.inputs.question.trim() ? "Research question is present." : "Research question is missing.", [], [], state.policy.allowContext ? "context" : nextStageAfterContext(state));
    case "context":
      return gate("context", state.policy.allowContext ? "pass" : "warning", state.policy.allowContext ? "Context preflight is enabled for this controller run." : "Context preflight disabled by policy.", [], [], nextStageAfterContext(state));
    case "dataset_feasibility":
      return datasetFeasibilityGate(state);
    case "exploration":
      return gate("exploration", state.inputs.dataPath ? "pass" : "warning", state.inputs.dataPath ? "Dataset exploration can run." : "No row-level data path was provided; exploration will be skipped.", [], [], state.policy.allowLiterature ? "literature" : "method_selection");
    case "literature":
      return gate("literature", state.policy.allowLiterature ? "pass" : "warning", state.policy.allowLiterature ? "Literature intake is enabled for this controller run." : "Literature intake is disabled by policy.", [], [], "method_selection");
    case "method_selection":
      return gate("method_selection", "pass", "Method selection can proceed from supplied question and inputs.", [], [], "execution");
    case "execution":
      return executionGate(state);
    case "qa":
      return gate("qa", await pathExists(state.inputs.runDir) ? "pass" : "block", "Run directory is available for QA.", [], [state.inputs.runDir], "manuscript");
    case "manuscript":
      return gate("manuscript", await pathExists(state.inputs.runDir) ? "pass" : "block", "Run directory is available for manuscript generation.", [], [state.inputs.runDir], state.policy.allowLiterature ? "literature_qa" : state.policy.allowExternalReview ? "external_review" : "inspection");
    case "literature_qa":
      return gate("literature_qa", state.policy.allowLiterature ? "pass" : "warning", state.policy.allowLiterature ? "Literature QA is enabled for this controller run." : "Literature QA disabled by policy.", [], [state.inputs.runDir], state.policy.allowExternalReview ? "external_review" : "inspection");
    case "external_review":
      return gate("external_review", state.policy.allowExternalReview ? "pass" : "warning", state.policy.allowExternalReview ? "External review is enabled." : "External review disabled by policy.", [], [state.inputs.runDir], "inspection");
    case "repair":
      return repairGate(state);
    case "inspection":
      return gate("inspection", await pathExists(state.inputs.runDir) ? "pass" : "block", "Final inspection can run.", [], [state.inputs.runDir], "promotion_decision");
    case "promotion_decision":
      return gate("promotion_decision", "pass", "Promotion decision can be made from inspection, QA, and review artifacts.", [], [state.inputs.runDir], "complete");
    default:
      return gate(state.currentStage, "block", `Controller cannot execute terminal stage ${state.currentStage}.`, [], [], state.currentStage);
  }
}

async function datasetFeasibilityGate(state: ControllerState): Promise<ControllerGate> {
  if (!state.inputs.dataPath) return gate("dataset_feasibility", "warning", "No data path supplied; controller will skip table feasibility and require existing artifacts or human review.", ["No --data was provided."], [], "method_selection");
  const refs = [state.inputs.dataPath];
  let summary: ResearchTableSummary;
  try {
    summary = await researchTableSummaryCommand({ file: state.inputs.dataPath, python: state.inputs.python ?? undefined });
  } catch (error) {
    return gate("dataset_feasibility", "block", "Dataset could not be summarized.", [error instanceof Error ? error.message : String(error)], refs, "blocked");
  }
  const summaryPath = path.join(state.rootDir, "table-summary.json");
  await writeJson(summaryPath, { schemaVersion: 1, tableSummary: summary });
  state.artifacts.push(await artifact("table-summary", summaryPath, "dataset_feasibility", true));
  refs.push(summaryPath);
  const semanticAudit = buildControllerDatasetSemanticAudit(state, summary, summaryPath);
  await writeJson(semanticAudit.outPath, { schemaVersion: 1, controllerDatasetSemanticAudit: semanticAudit });
  await writeFile(semanticAudit.reportPath, renderControllerDatasetSemanticAuditMarkdown(semanticAudit));
  state.artifacts.push(await artifact("controller-dataset-semantic-audit", semanticAudit.outPath, "dataset_feasibility", false));
  state.artifacts.push(await artifact("controller-dataset-semantic-audit-report", semanticAudit.reportPath, "dataset_feasibility", false));
  refs.push(semanticAudit.outPath, semanticAudit.reportPath);
  const verdict = await buildControllerFeasibilityVerdict(state, summary, summaryPath);
  await writeJson(verdict.summaryPath, { schemaVersion: 1, controllerFeasibilityVerdict: verdict });
  await writeFile(verdict.reportPath, renderControllerFeasibilityMarkdown(verdict));
  state.artifacts.push(await artifact("controller-feasibility-verdict", verdict.summaryPath, "dataset_feasibility", true));
  state.artifacts.push(await artifact("controller-feasibility-report", verdict.reportPath, "dataset_feasibility", false));
  refs.push(verdict.summaryPath, verdict.reportPath);
  return gate(
    "dataset_feasibility",
    verdict.status,
    verdict.status === "pass" ? "Dataset passes controller feasibility checks." : verdict.status === "warning" ? "Dataset is feasible but has quality or methods warnings." : "Dataset is not feasible for the requested study as specified.",
    [...verdict.blockers, ...verdict.warnings],
    refs,
    verdict.status === "block" ? "blocked" : "exploration",
  );
}

function nextStageAfterContext(state: ControllerState): ControllerStage {
  return state.inputs.dataPath ? "dataset_feasibility" : state.policy.allowLiterature ? "literature" : "method_selection";
}

async function buildControllerFeasibilityVerdict(
  state: ControllerState,
  summary: ResearchTableSummary,
  summaryPath: string,
): Promise<ControllerFeasibilityVerdict> {
  const requiredVariables = requiredVariableNames(state);
  const byName = new Map(summary.columns.map(column => [column.name, column]));
  const blockers: string[] = [];
  const warnings: string[] = [];
  const notes: string[] = [];
  const methodChecks: ControllerFeasibilityVerdict["methodChecks"] = [];
  const addCheck = (id: string, status: "pass" | "warning" | "block", message: string, evidenceRefs: string[] = []) => {
    methodChecks.push({ id, status, message, evidenceRefs });
    if (status === "block") blockers.push(message);
    else if (status === "warning") warnings.push(message);
    else notes.push(message);
  };

  if (summary.rowCount < state.policy.minRows) addCheck("minimum-row-count", "block", `Only ${summary.rowCount} row(s), below minimum ${state.policy.minRows}.`, [summaryPath]);
  else addCheck("minimum-row-count", "pass", `${summary.rowCount} rows meet the minimum row-count gate.`, [summaryPath]);
  if (summary.columnCount === 0) addCheck("non-empty-columns", "block", "Dataset has no columns.", [summaryPath]);
  else addCheck("non-empty-columns", "pass", `${summary.columnCount} columns are available.`, [summaryPath]);

  const variableChecks: ControllerFeasibilityVerdict["variableChecks"] = [];
  for (const item of controllerVariableRoles(state)) {
    const column = byName.get(item.name);
    const issues: ControllerFeasibilityVerdict["variableChecks"][number]["issues"] = [];
    if (!column) {
      issues.push({ severity: "blocker", code: "MISSING_REQUIRED_VARIABLE", message: `${item.role} variable '${item.name}' is missing.` });
    } else {
      if (column.nonMissingRows === 0) issues.push({ severity: "blocker", code: "EMPTY_REQUIRED_VARIABLE", message: `${item.role} variable '${item.name}' has no observed values.` });
      if (column.missingFraction > state.policy.maxRequiredVariableMissingness) issues.push({ severity: "blocker", code: "HIGH_REQUIRED_MISSINGNESS", message: `${item.role} variable '${item.name}' is ${(column.missingFraction * 100).toFixed(1)}% missing, above ${(state.policy.maxRequiredVariableMissingness * 100).toFixed(1)}%.` });
      if ((item.role === "outcome" || item.role === "event") && column.inferredType === "empty") issues.push({ severity: "blocker", code: "EMPTY_OUTCOME", message: `${item.role} variable '${item.name}' cannot support inference because it is empty.` });
      if ((item.role === "time" || item.role === "start" || item.role === "stop" || item.role === "running_variable" || item.role === "weight" || item.role === "offset") && column.inferredType !== "number") issues.push({ severity: "blocker", code: "NON_NUMERIC_REQUIRED_TIME", message: `${item.role} variable '${item.name}' must be numeric for this design.` });
      for (const warning of semanticIssuesForColumn(column, summary.rowCount, item.role)) issues.push(warning);
    }
    const severity = issues.some(issue => issue.severity === "blocker") ? "blocker" : issues.some(issue => issue.severity === "warning") ? "warning" : "note";
    if (issues.length) {
      const messages = issues.map(issue => issue.message);
      if (severity === "blocker") blockers.push(...messages);
      else if (severity === "warning") warnings.push(...messages);
      else notes.push(...messages);
    }
    variableChecks.push({
      role: item.role,
      name: item.name,
      present: Boolean(column),
      inferredType: column?.inferredType ?? "missing",
      nonMissingRows: column?.nonMissingRows ?? 0,
      missingFraction: column?.missingFraction ?? 1,
      min: column?.min ?? null,
      max: column?.max ?? null,
      mean: column?.mean ?? null,
      sampleValues: column?.sampleValues ?? [],
      issues,
    });
  }

  const rowScan = await scanControllerRowsForFeasibility(state.inputs.dataPath, requiredVariables);
  const completeCase = rowScan
    ? {
        scanned: true,
        scannedRows: rowScan.scannedRows,
        completeRows: rowScan.completeRows,
        completeFraction: rowScan.scannedRows ? round(rowScan.completeRows / rowScan.scannedRows, 4) : null,
        scanReason: rowScan.truncated ? `Scanned first ${rowScan.scannedRows} rows for feasibility.` : `Scanned ${rowScan.scannedRows} rows for feasibility.`,
      }
    : {
        scanned: false,
        scannedRows: 0,
        completeRows: null,
        completeFraction: null,
        scanReason: "Row-level feasibility scan is available for CSV/JSON controller inputs; this dataset uses another format or could not be parsed cheaply.",
      };
  if (completeCase.scanned && completeCase.completeRows !== null && completeCase.completeRows < state.policy.minRows) {
    addCheck("complete-case-count", "block", `Only ${completeCase.completeRows} complete-case row(s) among scanned rows, below minimum ${state.policy.minRows}.`, [state.inputs.dataPath ?? summaryPath]);
  } else if (completeCase.scanned && completeCase.completeFraction !== null && completeCase.completeFraction < 0.5) {
    addCheck("complete-case-fraction", "warning", `Only ${(completeCase.completeFraction * 100).toFixed(1)}% of scanned rows are complete for required variables.`, [state.inputs.dataPath ?? summaryPath]);
  } else if (completeCase.scanned) {
    addCheck("complete-case-count", "pass", `${completeCase.completeRows ?? 0} scanned row(s) are complete for required variables.`, [state.inputs.dataPath ?? summaryPath]);
  } else {
    addCheck("complete-case-count", "warning", completeCase.scanReason, [summaryPath]);
  }

  const outcomeDiagnostics = buildOutcomeDiagnostics(state, rowScan, byName);
  for (const check of methodFeasibilityChecks(state, summary, rowScan, outcomeDiagnostics)) addCheck(check.id, check.status, check.message, check.evidenceRefs);
  for (const issue of summary.warnings) {
    const message = `${issue.code}: ${issue.message}`;
    if (issue.severity === "blocker") blockers.push(message);
    else if (issue.severity === "warning") warnings.push(message);
    else notes.push(message);
  }

  const codedPhenotypeQuestion = /\b(icd|cpt|hcpcs|pcs|phenotype|diagnos|procedure|code|claims?)\b/i.test(state.inputs.question);
  const feasibilityGate = await evaluateFeasibilityGate({
    question: state.inputs.question,
    dataPath: state.inputs.dataPath,
    datasetDir: state.inputs.datasetDir,
    tableSummary: summary,
    method: state.inputs.method,
    outcome: state.inputs.outcome,
    exposure: state.inputs.exposure,
    group: state.inputs.group,
    outcomeThreshold: state.inputs.outcomeThreshold,
    exposureThreshold: state.inputs.exposureThreshold,
    time: state.inputs.time,
    start: state.inputs.start,
    stop: state.inputs.stop,
    event: state.inputs.event,
    id: state.inputs.id,
    strata: state.inputs.strata,
    cluster: state.inputs.cluster,
    period: state.inputs.period,
    post: state.inputs.post,
    runningVariable: state.inputs.runningVariable,
    cutoff: state.inputs.cutoff,
    instrument: state.inputs.instrument,
    weight: state.inputs.weight,
    offset: state.inputs.offset,
    variables: state.inputs.variables,
    covariates: state.inputs.covariates,
    exactCovariates: state.inputs.exactCovariates,
    phenotypeIds: codedPhenotypeQuestion ? ["question-implied-coded-phenotype"] : [],
    phenotypeReviewed: codedPhenotypeQuestion ? false : undefined,
    minRows: state.policy.minRows,
    maxMissingness: state.policy.maxRequiredVariableMissingness,
    surveyDesign: state.inputs.surveyDesign,
    allowSurveyApproximation: state.inputs.allowSurveyApproximation,
    python: state.inputs.python ?? undefined,
  });
  addCheck(
    "comprehensive-feasibility-gate",
    feasibilityGate.status,
    `Comprehensive feasibility gate returned ${feasibilityGate.verdict}: ${feasibilityGate.nextAction}`,
    feasibilityGate.evidenceRefs,
  );
  methodChecks.push(...comprehensiveFeasibilityMethodChecks(feasibilityGate));

  const uniqueBlockers = uniqueText([
    ...blockers,
    ...(feasibilityGate.verdict === "reject" ? feasibilityGate.blockers : []),
  ]);
  const uniqueWarnings = uniqueText([
    ...warnings,
    ...feasibilityGate.warnings,
    ...(feasibilityGate.verdict !== "formal_analysis_ready" && feasibilityGate.verdict !== "reject" ? [feasibilityGate.nextAction] : []),
    ...feasibilityGate.requiredModifications,
  ]).filter(item => !uniqueBlockers.includes(item));
  const uniqueNotes = uniqueText(notes);
  const legacyScore = round(Math.max(0, 1 - uniqueBlockers.length * 0.35 - uniqueWarnings.length * 0.08 - Math.max(0, state.policy.minRows - summary.rowCount) / Math.max(state.policy.minRows, 1)), 4);
  const score = round(Math.min(legacyScore, feasibilityGate.score), 4);
  const status: ControllerFeasibilityVerdict["status"] = uniqueBlockers.length || feasibilityGate.verdict === "reject" ? "block" : feasibilityGate.verdict === "formal_analysis_ready" ? "pass" : "warning";
  const verdictPath = path.join(state.rootDir, "controller-feasibility-verdict.json");
  const reportPath = path.join(state.rootDir, "controller-feasibility-verdict.md");
  return {
    schemaVersion: 1,
    generatedAtIso: nowIso(),
    verdict: feasibilityGate.verdict,
    status,
    score,
    confidence: feasibilityGate.confidence,
    readinessLabel: feasibilityGate.readinessLabel,
    primaryAction: feasibilityGate.primaryAction,
    summaryPath: verdictPath,
    reportPath,
    rowCount: summary.rowCount,
    columnCount: summary.columnCount,
    method: state.inputs.method,
    requiredVariables,
    variableChecks,
    completeCase,
    outcomeDiagnostics,
    domains: feasibilityGate.domains,
    internalReviews: feasibilityGate.internalReviews,
    issues: feasibilityGate.issues,
    methodChecks,
    blockers: uniqueBlockers,
    warnings: uniqueWarnings,
    notes: uniqueNotes,
    clarifyingQuestions: feasibilityGate.clarifyingQuestions,
    requiredModifications: feasibilityGate.requiredModifications,
    optionalModifications: feasibilityGate.optionalModifications,
    alternativeStudyIdeas: feasibilityGate.alternativeStudyIdeas,
    studyDesignAdvice: feasibilityGate.studyDesignAdvice,
    evidenceRefs: uniqueText([summaryPath, ...(state.inputs.dataPath ? [state.inputs.dataPath] : []), ...feasibilityGate.evidenceRefs]),
    nextAction: status === "block"
      ? feasibilityGate.verdict === "reject" ? feasibilityGate.nextAction : "Revise the research question, variables, cohort, or dataset before execution."
      : status === "warning"
        ? feasibilityGate.nextAction
        : "Proceed to exploration and method selection.",
  };
}

function controllerVariableRoles(state: ControllerState): Array<{ role: string; name: string }> {
  const pairs: Array<{ role: string; name: string | null }> = [
    { role: "outcome", name: state.inputs.outcome },
    { role: "exposure", name: state.inputs.exposure },
    { role: "group", name: state.inputs.group },
    { role: "time", name: state.inputs.time },
    { role: "start", name: state.inputs.start },
    { role: "stop", name: state.inputs.stop },
    { role: "event", name: state.inputs.event },
    { role: "id", name: state.inputs.id },
    { role: "strata", name: state.inputs.strata },
    { role: "cluster", name: state.inputs.cluster },
    { role: "period", name: state.inputs.period },
    { role: "post", name: state.inputs.post },
    { role: "running_variable", name: state.inputs.runningVariable },
    { role: "instrument", name: state.inputs.instrument },
    { role: "weight", name: state.inputs.weight },
    { role: "offset", name: state.inputs.offset },
    ...state.inputs.variables.map(name => ({ role: "variable", name })),
    ...state.inputs.covariates.map(name => ({ role: "covariate", name })),
    ...state.inputs.exactCovariates.map(name => ({ role: "exact_covariate", name })),
  ];
  const seen = new Set<string>();
  return pairs
    .filter((pair): pair is { role: string; name: string } => Boolean(pair.name))
    .filter(pair => {
      const key = `${pair.role}:${pair.name}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

function semanticIssuesForColumn(column: ResearchTableSummary["columns"][number], rowCount: number | null, role: string, targetName?: string | null): Array<{ severity: "blocker" | "warning" | "note"; code: string; message: string }> {
  const issues = [...sharedSemanticPlausibilityIssuesForColumn(column, rowCount)];
  const identifierReason = sharedIdentifierLikeColumnReason(column, rowCount);
  if (identifierReason && !["id", "cluster", "strata"].includes(role)) {
    issues.push({
      severity: "blocker",
      code: "IDENTIFIER_USED_AS_ANALYSIS_VARIABLE",
      message: `${role} variable '${column.name}' appears to be an identifier (${identifierReason}) and cannot be used as a substantive outcome, exposure, group, covariate, weight, or endpoint role.`,
    });
  }
  const leakageReason = sharedOutcomeOrFutureLeakageReason(column.name, targetName);
  if (leakageReason && !["outcome", "event", "time", "start", "stop", "id", "cluster", "strata", "period", "post"].includes(role)) {
    issues.push({
      severity: "blocker",
      code: "OUTCOME_FUTURE_LEAKAGE_SELECTED_ROLE",
      message: `${role} variable '${column.name}' appears outcome-derived or post-index (${leakageReason}); do not use it as an exposure, group, covariate, weight, offset, instrument, or predictor without explicit baseline/timing evidence.`,
    });
  }
  const postTreatmentReason = sharedPostTreatmentAdjustmentReason(column.name);
  if (postTreatmentReason && ["covariate", "exact_covariate", "variable", "weight", "offset", "instrument", "running_variable"].includes(role)) {
    issues.push({
      severity: "blocker",
      code: "POST_TREATMENT_ADJUSTMENT_SELECTED_ROLE",
      message: `${role} variable '${column.name}' appears to encode post-baseline treatment, procedure, or care (${postTreatmentReason}); do not adjust for it without explicit target-trial timing evidence.`,
    });
  }
  return issues;
}

function unselectedSemanticIssuesForColumn(column: ResearchTableSummary["columns"][number], rowCount: number | null, targetName?: string | null): Array<{ severity: "blocker" | "warning" | "note"; code: string; message: string }> {
  const issues = [...sharedSemanticPlausibilityIssuesForColumn(column, rowCount)];
  const leakageReason = sharedOutcomeOrFutureLeakageReason(column.name, targetName);
  if (leakageReason) {
    issues.push({
      severity: "warning",
      code: "OUTCOME_FUTURE_LEAKAGE_UNSELECTED_COLUMN",
      message: `Unused column '${column.name}' appears outcome-derived or post-index (${leakageReason}); avoid selecting it as an exposure, covariate, group, weight, offset, instrument, or predictor without explicit baseline/timing evidence.`,
    });
  }
  const postTreatmentReason = sharedPostTreatmentAdjustmentReason(column.name);
  if (postTreatmentReason) {
    issues.push({
      severity: "warning",
      code: "POST_TREATMENT_ADJUSTMENT_UNSELECTED_COLUMN",
      message: `Unused column '${column.name}' appears to encode post-baseline treatment, procedure, or care (${postTreatmentReason}); avoid selecting it as an adjustment variable without target-trial timing evidence.`,
    });
  }
  return issues;
}

function buildControllerDatasetSemanticAudit(
  state: ControllerState,
  summary: ResearchTableSummary,
  summaryPath: string,
): ControllerDatasetSemanticAudit {
  const targetName = state.inputs.outcome ?? state.inputs.event;
  const roleByColumn = new Map<string, string[]>();
  for (const item of controllerVariableRoles(state)) {
    roleByColumn.set(item.name, [...(roleByColumn.get(item.name) ?? []), item.role]);
  }
  const issues: ControllerDatasetSemanticAudit["issues"] = [];
  for (const column of summary.columns) {
    const roles = roleByColumn.get(column.name) ?? [];
    const selected = roles.length > 0;
    const role = roles.join(", ") || null;
    const columnIssues = selected
      ? uniqueSemanticIssues(roles.flatMap(item => semanticIssuesForColumn(column, summary.rowCount, item, targetName)))
      : unselectedSemanticIssuesForColumn(column, summary.rowCount, targetName);
    for (const issue of columnIssues) {
      issues.push({
        column: column.name,
        role,
        selected,
        inferredType: column.inferredType,
        nonMissingRows: column.nonMissingRows,
        min: column.min ?? null,
        max: column.max ?? null,
        mean: column.mean ?? null,
        severity: issue.severity,
        code: issue.code,
        message: issue.message,
      });
    }
  }
  const selectedIssues = issues.filter(item => item.selected);
  const issueCodeSummary = buildDatasetSemanticIssueCodeSummary(issues);
  const selectedRoleSummary = buildDatasetSemanticSelectedRoleSummary(selectedIssues);
  const selectedRoleStatus: ControllerDatasetSemanticAudit["selectedRoleStatus"] = selectedIssues.some(item => item.severity === "blocker")
    ? "block"
    : selectedIssues.some(item => item.severity === "warning")
      ? "warning"
      : "pass";
  const datasetStatus: ControllerDatasetSemanticAudit["status"] = selectedRoleStatus === "block"
    ? "block"
    : issues.some(item => item.severity === "blocker" || item.severity === "warning")
      ? "warning"
      : "pass";
  const auditId = `controller_dataset_semantic_audit_${String(state.artifacts.filter(item => item.kind === "controller-dataset-semantic-audit").length + 1).padStart(3, "0")}`;
  const outPath = path.join(state.rootDir, `${auditId}.json`);
  const reportPath = path.join(state.rootDir, `${auditId}.md`);
  return {
    schemaVersion: 1,
    generatedAtIso: nowIso(),
    runId: state.runId,
    statePath: state.statePath,
    summaryPath,
    rowCount: summary.rowCount,
    columnCount: summary.columnCount,
    status: datasetStatus,
    selectedRoleStatus,
    issueCount: issues.length,
    blockerCount: issues.filter(item => item.severity === "blocker").length,
    warningCount: issues.filter(item => item.severity === "warning").length,
    selectedRoleIssueCount: selectedIssues.length,
    issueCodeSummary,
    selectedRoleSummary,
    issues,
    nextAction: selectedRoleStatus === "block"
      ? "Repair selected study roles before execution; controller feasibility should block this run."
      : issues.length
        ? "Review dataset-wide semantic issues and avoid selecting implausible columns without unit/coding repair."
        : "No dataset-wide semantic plausibility issues detected.",
    outPath,
    reportPath,
  };
}

function buildDatasetSemanticIssueCodeSummary(issues: ControllerDatasetSemanticAudit["issues"]): ControllerDatasetSemanticAudit["issueCodeSummary"] {
  const byCode = new Map<string, ControllerDatasetSemanticAudit["issueCodeSummary"][number]>();
  const severityRank: Record<ControllerDatasetSemanticAudit["issueCodeSummary"][number]["severity"], number> = { blocker: 0, warning: 1, note: 2 };
  for (const issue of issues) {
    const current = byCode.get(issue.code) ?? {
      code: issue.code,
      severity: issue.severity,
      totalIssueCount: 0,
      selectedIssueCount: 0,
      columns: [],
    };
    current.totalIssueCount += 1;
    if (issue.selected) current.selectedIssueCount += 1;
    if (!current.columns.includes(issue.column)) current.columns.push(issue.column);
    if (severityRank[issue.severity] < severityRank[current.severity]) current.severity = issue.severity;
    byCode.set(issue.code, current);
  }
  return [...byCode.values()]
    .map(item => ({ ...item, columns: item.columns.sort().slice(0, 12) }))
    .sort((a, b) => severityRank[a.severity] - severityRank[b.severity] || b.selectedIssueCount - a.selectedIssueCount || b.totalIssueCount - a.totalIssueCount || a.code.localeCompare(b.code));
}

function buildDatasetSemanticSelectedRoleSummary(selectedIssues: ControllerDatasetSemanticAudit["issues"]): ControllerDatasetSemanticAudit["selectedRoleSummary"] {
  const byRole = new Map<string, ControllerDatasetSemanticAudit["selectedRoleSummary"][number]>();
  for (const issue of selectedIssues) {
    const role = issue.role ?? "selected";
    const key = `${issue.column}:${role}`;
    const current = byRole.get(key) ?? {
      column: issue.column,
      role,
      issueCount: 0,
      blockerCount: 0,
      warningCount: 0,
      codes: [],
    };
    current.issueCount += 1;
    if (issue.severity === "blocker") current.blockerCount += 1;
    if (issue.severity === "warning") current.warningCount += 1;
    if (!current.codes.includes(issue.code)) current.codes.push(issue.code);
    byRole.set(key, current);
  }
  return [...byRole.values()]
    .map(item => ({ ...item, codes: item.codes.sort() }))
    .sort((a, b) => b.blockerCount - a.blockerCount || b.warningCount - a.warningCount || b.issueCount - a.issueCount || a.column.localeCompare(b.column));
}

function uniqueSemanticIssues<T extends { severity: string; code: string; message: string }>(issues: T[]): T[] {
  const seen = new Set<string>();
  return issues.filter(issue => {
    const key = `${issue.severity}:${issue.code}:${issue.message}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function comprehensiveFeasibilityMethodChecks(feasibilityGate: FeasibilityGateResult): ControllerFeasibilityVerdict["methodChecks"] {
  const checks: ControllerFeasibilityVerdict["methodChecks"] = [];
  for (const domain of feasibilityGate.domains) {
    if (!["method_suitability", "expected_statistical_power", "semantic_plausibility", "outcome_observability", "missingness"].includes(domain.id)) continue;
    checks.push({
      id: `comprehensive-${domain.id.replaceAll("_", "-")}`,
      status: domain.status === "block" ? "block" : domain.status === "warning" || domain.status === "unknown" ? "warning" : "pass",
      message: `${domain.label}: ${domain.rationale}${domain.blockers.length ? ` Blockers: ${domain.blockers.join("; ")}` : ""}${domain.warnings.length ? ` Warnings: ${domain.warnings.join("; ")}` : ""}`,
      evidenceRefs: domain.evidenceRefs,
    });
  }
  for (const blocker of feasibilityGate.blockers.slice(0, 8)) {
    checks.push({
      id: "comprehensive-feasibility-blocker",
      status: "block",
      message: blocker,
      evidenceRefs: feasibilityGate.evidenceRefs,
    });
  }
  for (const warning of feasibilityGate.warnings.slice(0, 8)) {
    checks.push({
      id: "comprehensive-feasibility-warning",
      status: "warning",
      message: warning,
      evidenceRefs: feasibilityGate.evidenceRefs,
    });
  }
  return checks;
}

function buildOutcomeDiagnostics(
  state: ControllerState,
  rowScan: ControllerRowFeasibilityScan | null,
  byName: Map<string, ResearchTableSummary["columns"][number]>,
): ControllerFeasibilityVerdict["outcomeDiagnostics"] {
  const outcome = state.inputs.outcome ?? state.inputs.event;
  const observedLevels = outcome && rowScan?.valueCounts[outcome]
    ? Object.entries(rowScan.valueCounts[outcome]).map(([value, count]) => ({ value, count })).sort((a, b) => b.count - a.count).slice(0, 12)
    : [];
  const binary = binaryCounts(observedLevels);
  const column = outcome ? byName.get(outcome) : undefined;
  return {
    outcome: outcome ?? null,
    observedLevels,
    eventCount: binary?.eventCount ?? null,
    nonEventCount: binary?.nonEventCount ?? null,
    eventRate: binary && binary.eventCount + binary.nonEventCount > 0 ? round(binary.eventCount / (binary.eventCount + binary.nonEventCount), 4) : null,
    usable: outcome ? Boolean(column && column.nonMissingRows > 0 && (observedLevels.length !== 1 || !rowScan)) : null,
  };
}

function methodFeasibilityChecks(
  state: ControllerState,
  summary: ResearchTableSummary,
  rowScan: ControllerRowFeasibilityScan | null,
  outcomeDiagnostics: ControllerFeasibilityVerdict["outcomeDiagnostics"],
): Array<{ id: string; status: "pass" | "warning" | "block"; message: string; evidenceRefs: string[] }> {
  const checks: Array<{ id: string; status: "pass" | "warning" | "block"; message: string; evidenceRefs: string[] }> = [];
  const method = state.inputs.method;
  if (!method) {
    checks.push({ id: "method-declared", status: "warning", message: "No executable method was supplied; controller will rely on method selection.", evidenceRefs: [] });
    return checks;
  }
  const missingArguments = missingControllerMethodArguments(method, state);
  if (missingArguments.length) {
    checks.push({
      id: "method-required-arguments",
      status: "block",
      message: `${method} requires missing role(s): ${missingArguments.join(", ")}.`,
      evidenceRefs: [],
    });
    return checks;
  }
  const required = requiredVariableNames(state);
  if (required.length && rowScan && rowScan.completeRows > 0) {
    const ratio = required.length / rowScan.completeRows;
    if (ratio > 0.25) checks.push({ id: "dimensionality-vs-complete-case", status: "warning", message: `${required.length} required variable references for ${rowScan.completeRows} complete scanned rows; model may be overfit or unidentified.`, evidenceRefs: [state.inputs.dataPath ?? ""] });
  }
  if (["logistic-regression", "penalized-logistic-regression", "propensity-score-matching", "propensity-score-weighting"].includes(method)) {
    if (!state.inputs.outcome && method.includes("logistic")) checks.push({ id: "binary-outcome-present", status: "block", message: `${method} requires an outcome variable.`, evidenceRefs: [] });
    if (outcomeDiagnostics.eventCount !== null && outcomeDiagnostics.nonEventCount !== null) {
      const minClass = Math.min(outcomeDiagnostics.eventCount, outcomeDiagnostics.nonEventCount);
      if (minClass < 5) checks.push({ id: "binary-outcome-class-count", status: "block", message: `Binary outcome has only ${minClass} row(s) in the smaller class among scanned rows.`, evidenceRefs: [state.inputs.dataPath ?? ""] });
      else checks.push({ id: "binary-outcome-class-count", status: "pass", message: `Binary outcome has ${outcomeDiagnostics.eventCount} events and ${outcomeDiagnostics.nonEventCount} non-events among scanned rows.`, evidenceRefs: [state.inputs.dataPath ?? ""] });
      const predictors = new Set([state.inputs.exposure, ...state.inputs.covariates].filter(Boolean)).size;
      if (predictors > 0 && outcomeDiagnostics.eventCount / predictors < 10) checks.push({ id: "events-per-variable", status: "warning", message: `Events per modeled predictor is approximately ${round(outcomeDiagnostics.eventCount / predictors, 2)}, below the conservative 10 EPV heuristic.`, evidenceRefs: [state.inputs.dataPath ?? ""] });
    } else if (rowScan) {
      checks.push({ id: "binary-outcome-class-count", status: "warning", message: "Could not confirm binary outcome class counts from scanned rows.", evidenceRefs: [state.inputs.dataPath ?? ""] });
    }
  }
  if (["cox-proportional-hazards", "stratified-cox", "time-varying-cox", "fine-gray", "aalen-johansen-cif", "kaplan-meier", "log-rank", "recurrent-event-rate", "recurrent-event-cox"].includes(method)) {
    const hasAnalysisTime = Boolean(state.inputs.time || state.inputs.stop);
    if (!hasAnalysisTime || !state.inputs.event) checks.push({ id: "time-event-present", status: "block", message: `${method} requires a time/stop variable and an event variable.`, evidenceRefs: [] });
    if (method === "recurrent-event-cox" && (!state.inputs.start || !state.inputs.stop || !state.inputs.id)) checks.push({ id: "recurrent-start-stop-present", status: "block", message: "recurrent-event-cox requires start, stop, and id variables for Andersen-Gill interval data.", evidenceRefs: [] });
    if (outcomeDiagnostics.eventCount !== null && outcomeDiagnostics.eventCount < 5) checks.push({ id: "survival-event-count", status: "block", message: `Only ${outcomeDiagnostics.eventCount} event(s) detected among scanned rows; time-to-event analysis is not stable.`, evidenceRefs: [state.inputs.dataPath ?? ""] });
    else if (outcomeDiagnostics.eventCount !== null) checks.push({ id: "survival-event-count", status: "pass", message: `${outcomeDiagnostics.eventCount} event(s) detected among scanned rows.`, evidenceRefs: [state.inputs.dataPath ?? ""] });
  }
  if (["linear-regression", "robust-linear-regression", "quantile-regression", "gamma-glm", "inverse-gaussian-glm"].includes(method)) {
    const outcome = state.inputs.outcome ? summary.columns.find(column => column.name === state.inputs.outcome) : undefined;
    if (!outcome) checks.push({ id: "continuous-outcome-present", status: "block", message: `${method} requires an outcome variable present in the table.`, evidenceRefs: [] });
    else if (outcome.inferredType !== "number") checks.push({ id: "continuous-outcome-numeric", status: "block", message: `${method} requires numeric outcome '${outcome.name}', but it was inferred as ${outcome.inferredType}.`, evidenceRefs: [outcome.name] });
    else if (outcome.min !== undefined && outcome.max !== undefined && outcome.min === outcome.max) checks.push({ id: "continuous-outcome-variation", status: "block", message: `Outcome '${outcome.name}' is constant and cannot support regression.`, evidenceRefs: [outcome.name] });
    else checks.push({ id: "continuous-outcome-variation", status: "pass", message: `Outcome '${outcome.name}' is numeric with observed variation.`, evidenceRefs: [outcome.name] });
  }
  if (!checks.length) checks.push({ id: "method-specific-checks", status: "pass", message: `No additional pre-execution feasibility blockers were detected for ${method}.`, evidenceRefs: [] });
  return checks;
}

interface ControllerRowFeasibilityScan {
  scannedRows: number;
  completeRows: number;
  truncated: boolean;
  valueCounts: Record<string, Record<string, number>>;
}

async function scanControllerRowsForFeasibility(dataPath: string | null, variables: string[], limit = 5000): Promise<ControllerRowFeasibilityScan | null> {
  if (!dataPath || !variables.length) return null;
  const ext = path.extname(dataPath).toLowerCase();
  let rows: Array<Record<string, unknown>>;
  try {
    if (ext === ".csv") rows = parseControllerCsv(await readFile(dataPath, "utf-8"));
    else if (ext === ".json") {
      const parsed = JSON.parse(await readFile(dataPath, "utf-8")) as unknown;
      rows = Array.isArray(parsed) ? parsed.filter(item => item && typeof item === "object") as Array<Record<string, unknown>> : [];
    } else return null;
  } catch {
    return null;
  }
  const scanned = rows.slice(0, limit);
  const valueCounts: Record<string, Record<string, number>> = {};
  for (const variable of variables) valueCounts[variable] = {};
  let completeRows = 0;
  for (const row of scanned) {
    if (variables.every(variable => hasControllerValue(row[variable]))) completeRows += 1;
    for (const variable of variables) {
      const value = row[variable];
      if (!hasControllerValue(value)) continue;
      const key = String(value);
      const counts = valueCounts[variable] ?? {};
      counts[key] = (counts[key] ?? 0) + 1;
      valueCounts[variable] = counts;
    }
  }
  return { scannedRows: scanned.length, completeRows, truncated: rows.length > scanned.length, valueCounts };
}

function parseControllerCsv(raw: string): Array<Record<string, unknown>> {
  const lines = raw.split(/\r?\n/).filter(line => line.trim().length);
  if (lines.length < 2) return [];
  const headers = parseControllerCsvLine(lines[0] ?? "").map(header => header.trim());
  return lines.slice(1).map(line => {
    const values = parseControllerCsvLine(line);
    const row: Record<string, unknown> = {};
    for (let i = 0; i < headers.length; i += 1) row[headers[i] ?? `col${i}`] = parseControllerScalar(values[i] ?? "");
    return row;
  });
}

function parseControllerCsvLine(line: string): string[] {
  const result: string[] = [];
  let value = "";
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (char === "\"" && line[i + 1] === "\"") {
      value += "\"";
      i += 1;
    } else if (char === "\"") {
      quoted = !quoted;
    } else if (char === "," && !quoted) {
      result.push(value);
      value = "";
    } else {
      value += char;
    }
  }
  result.push(value);
  return result;
}

function parseControllerScalar(value: string): unknown {
  const trimmed = value.trim();
  if (trimmed === "") return null;
  const numeric = Number(trimmed);
  return Number.isFinite(numeric) ? numeric : trimmed;
}

function hasControllerValue(value: unknown): boolean {
  return value !== null && value !== undefined && String(value).trim() !== "";
}

function binaryCounts(levels: Array<{ value: string; count: number }>): { eventCount: number; nonEventCount: number } | null {
  const normalized = new Map(levels.map(level => [level.value.toLowerCase(), level.count]));
  const positive = (normalized.get("1") ?? 0) + (normalized.get("true") ?? 0) + (normalized.get("yes") ?? 0);
  const negative = (normalized.get("0") ?? 0) + (normalized.get("false") ?? 0) + (normalized.get("no") ?? 0);
  if (positive + negative === levels.reduce((sum, level) => sum + level.count, 0) && positive + negative > 0) return { eventCount: positive, nonEventCount: negative };
  if (levels.length === 2) {
    const sorted = [...levels].sort((a, b) => Number(a.value) - Number(b.value));
    if (sorted.every(level => Number.isFinite(Number(level.value)))) return { nonEventCount: sorted[0]?.count ?? 0, eventCount: sorted[1]?.count ?? 0 };
  }
  return null;
}

function renderControllerFeasibilityMarkdown(verdict: ControllerFeasibilityVerdict): string {
  return [
    "# Controller Feasibility Verdict",
    "",
    `Verdict: ${verdict.verdict}`,
    `Status: ${verdict.status}`,
    `Score: ${verdict.score}`,
    `Confidence: ${verdict.confidence}`,
    `Readiness: ${verdict.readinessLabel}`,
    `Primary action: ${verdict.primaryAction}`,
    `Rows: ${verdict.rowCount}`,
    `Columns: ${verdict.columnCount}`,
    `Method: ${verdict.method ?? "(not selected)"}`,
    "",
    "## Domain Scores",
    ...(verdict.domains.length ? verdict.domains.map(domain => `- [${domain.status}] ${domain.label}: ${domain.score} - ${domain.rationale}`) : ["- None"]),
    "",
    "## Internal Feasibility Reviews",
    ...(verdict.internalReviews.length ? verdict.internalReviews.map(review => `- ${review.reviewerId}: ${review.stance}; suggests ${review.suggestedVerdict}; confidence=${review.confidence}; concerns=${review.primaryConcerns.join("; ")}`) : ["- None"]),
    "",
    "## Blockers",
    ...(verdict.blockers.length ? verdict.blockers.map(item => `- ${item}`) : ["- None"]),
    "",
    "## Warnings",
    ...(verdict.warnings.length ? verdict.warnings.map(item => `- ${item}`) : ["- None"]),
    "",
    "## Typed Issues",
    ...(verdict.issues.length ? verdict.issues.map(item => `- [${item.severity}] ${item.code}: ${item.message}${item.domainId ? ` (domain: ${item.domainId})` : item.variable ? ` (variable: ${item.variable})` : item.reviewerId ? ` (reviewer: ${item.reviewerId})` : ""}`) : ["- None"]),
    "",
    "## Required Modifications",
    ...(verdict.requiredModifications.length ? verdict.requiredModifications.map(item => `- ${item}`) : ["- None"]),
    "",
    "## Clarifying Questions",
    ...(verdict.clarifyingQuestions.length ? verdict.clarifyingQuestions.map(item => `- ${item}`) : ["- None"]),
    "",
    "## Alternatives",
    ...(verdict.alternativeStudyIdeas.length ? verdict.alternativeStudyIdeas.map(item => `- ${item.title}: ${item.reason} (${item.expectedVerdict})`) : ["- None"]),
    "",
    "## Required Variables",
    ...verdict.variableChecks.map(check => `- ${check.role} ${check.name}: ${check.present ? `${check.inferredType}, ${(check.missingFraction * 100).toFixed(1)}% missing, n=${check.nonMissingRows}` : "missing"}${check.issues.length ? `; issues=${check.issues.map(issue => issue.code).join(",")}` : ""}`),
    "",
    "## Complete-Case Scan",
    `- ${verdict.completeCase.scanReason}`,
    `- Complete rows: ${verdict.completeCase.completeRows ?? "unknown"}`,
    `- Complete fraction: ${verdict.completeCase.completeFraction === null ? "unknown" : `${(verdict.completeCase.completeFraction * 100).toFixed(1)}%`}`,
    "",
    "## Outcome Diagnostics",
    `- Outcome/event: ${verdict.outcomeDiagnostics.outcome ?? "(none)"}`,
    `- Events: ${verdict.outcomeDiagnostics.eventCount ?? "unknown"}`,
    `- Non-events: ${verdict.outcomeDiagnostics.nonEventCount ?? "unknown"}`,
    `- Event rate: ${verdict.outcomeDiagnostics.eventRate === null ? "unknown" : `${(verdict.outcomeDiagnostics.eventRate * 100).toFixed(1)}%`}`,
    "",
    "## Method Checks",
    ...verdict.methodChecks.map(check => `- [${check.status}] ${check.id}: ${check.message}`),
    "",
    "## Study Design Advice",
    `- Recommended posture: ${verdict.studyDesignAdvice.recommendedPosture}`,
    `- Method recommendation: ${verdict.studyDesignAdvice.methodRecommendation}`,
    `- Estimand/design warning: ${verdict.studyDesignAdvice.estimandOrDesignWarning ?? "none"}`,
    `- Reviewer risk: ${verdict.studyDesignAdvice.reviewerRiskSummary}`,
    "",
    `Next action: ${verdict.nextAction}`,
    "",
  ].join("\n");
}

function executionGate(state: ControllerState): ControllerGate {
  const reasons: string[] = [];
  if (!state.policy.allowExecution) reasons.push("Execution disabled by controller policy.");
  if (!state.inputs.dataPath) reasons.push("No data path is available for execution.");
  if (!state.inputs.method) reasons.push("No executable statistical method has been selected.");
  if (state.inputs.method && !statsMethodSchema.safeParse(state.inputs.method).success) reasons.push(`Method ${state.inputs.method} is not executable by stats-run.`);
  if (state.inputs.method) {
    const missingArguments = missingControllerMethodArguments(state.inputs.method, state);
    if (missingArguments.length) reasons.push(`${state.inputs.method} is missing required role(s): ${missingArguments.join(", ")}.`);
  }
  const variables = requiredVariableNames(state);
  if (variables.length === 0) reasons.push("No outcome, exposure, group, time/event, or variables were supplied for execution.");
  return gate("execution", reasons.length ? "block" : "pass", reasons.length ? "Execution prerequisites are incomplete." : "Execution prerequisites are present.", reasons, [state.inputs.runDir], reasons.length ? "human_review" : "qa");
}

function repairGate(state: ControllerState): ControllerGate {
  const planPath = path.join(state.inputs.runDir, "review", "controller-repair-plan.json");
  const reasons: string[] = [];
  if (!state.policy.allowAutoRepair) reasons.push("Auto-repair is disabled by controller policy.");
  if (state.policy.autonomy !== "aggressive") reasons.push("Auto-repair requires aggressive autonomy.");
  if (repairAttemptCount(state) >= state.policy.maxAutoRepairs) reasons.push(`Auto-repair attempt ceiling reached (${state.policy.maxAutoRepairs}).`);
  if (!state.artifacts.some(item => item.kind === "controller-repair-plan" && item.sha256)) reasons.push("No controller repair plan artifact is available.");
  return gate("repair", reasons.length ? "block" : "pass", reasons.length ? "Bounded repair cannot proceed." : "Bounded repair can proceed from reviewer findings.", reasons, [planPath], reasons.length ? "human_review" : "inspection");
}

async function chooseControllerDecision(state: ControllerState, gateResult: ControllerGate, env: NodeJS.ProcessEnv, fetchImpl: typeof fetch): Promise<ControllerDecision> {
  const deterministic = deterministicDecision(state, gateResult);
  const contextBundle = await writeControllerDecisionContextBundle(state, gateResult, deterministic);
  state.artifacts.push(await artifact("controller-decision-context", contextBundle.outPath, state.currentStage, false));
  state.artifacts.push(await artifact("controller-decision-context-report", contextBundle.reportPath, state.currentStage, false));
  if (!state.policy.controller.enabled || gateResult.status === "block") return deterministic;
  const estimated = estimateControllerCost(state);
  const preflight = await writeControllerModelPreflight(state, env, estimated);
  state.artifacts.push(await artifact("controller-model-preflight", preflight.outPath, state.currentStage, state.policy.requireControllerModel));
  state.artifacts.push(await artifact("controller-model-preflight-report", preflight.reportPath, state.currentStage, false));
  if (preflight.status === "fail") {
    return controllerModelFallbackDecision(state, deterministic, `Controller model preflight failed: ${preflight.checks.filter(check => check.status === "fail").map(check => check.message).join("; ")}`, preflight.outPath);
  }
  const rawPath = path.join(state.rootDir, `controller-decision-${String(state.decisions.length + 1).padStart(2, "0")}.raw.txt`);
  try {
    const raw = await providerGenerate(controllerAsReviewerConfig(state.policy.controller), controllerSystemPrompt(), controllerUserPrompt(contextBundle), env, fetchImpl);
    await writeFile(rawPath, raw);
    const parsed = parseControllerModelPayload(raw);
    if (!parsed || !allowedActionForStage(state.currentStage, parsed.action)) {
      return controllerModelFallbackDecision(state, deterministic, "Controller model returned an invalid or disallowed action.", rawPath);
    }
    const quality = await writeControllerDecisionQuality(state, parsed, rawPath);
    state.artifacts.push(await artifact("controller-decision-quality", quality.outPath, state.currentStage, state.policy.requireControllerModel));
    state.artifacts.push(await artifact("controller-decision-quality-report", quality.reportPath, state.currentStage, false));
    if (quality.status === "fail") {
      return controllerModelFallbackDecision(state, deterministic, `Controller model decision quality failed: ${quality.checks.filter(check => check.status === "fail").map(check => check.message).join("; ")}`, quality.outPath);
    }
    state.costEstimateUsd = round(state.costEstimateUsd + estimated, 6);
    return {
      id: decisionId(state, "model"),
      stage: state.currentStage,
      source: "model",
      action: parsed.action,
      rationale: parsed.rationale,
      confidence: parsed.confidence,
      expectedArtifacts: expectedArtifactsForAction(parsed.action),
      riskFlags: parsed.riskFlags ?? [],
      modelRawPath: rawPath,
      inputPatch: parsed.inputPatch ?? null,
      patchValidation: parsed.inputPatch ? validateControllerInputPatch(state, parsed.inputPatch) : { status: "not_requested", reasons: [] },
      toolRequests: parsed.toolRequests ?? [],
      toolValidation: parsed.toolRequests?.length ? validateControllerToolRequests(state, parsed.toolRequests) : { status: "not_requested", reasons: [] },
    };
  } catch (error) {
    return controllerModelFallbackDecision(state, deterministic, `Controller model failed (${error instanceof Error ? error.message : String(error)}).`, null);
  }
}

function controllerModelFallbackDecision(state: ControllerState, deterministic: ControllerDecision, reason: string, modelRawPath: string | null): ControllerDecision {
  if (state.policy.requireControllerModel) {
    return {
      id: decisionId(state, "model_required_stop"),
      stage: state.currentStage,
      source: "model_fallback",
      action: "stop_for_human",
      rationale: `${reason} Controller model is required by policy, so deterministic fallback is not allowed.`,
      confidence: 1,
      expectedArtifacts: [],
      riskFlags: ["controller_model_required", "deterministic_fallback_blocked"],
      modelRawPath,
      inputPatch: null,
      patchValidation: { status: "not_requested", reasons: [] },
      toolRequests: [],
      toolValidation: { status: "not_requested", reasons: [] },
    };
  }
  return {
    ...deterministic,
    source: "model_fallback",
    modelRawPath,
    rationale: `${deterministic.rationale} ${reason} Deterministic policy was used because controller model requirement is not enabled.`,
  };
}

async function writeControllerModelPreflight(state: ControllerState, env: NodeJS.ProcessEnv, estimatedCostUsd: number): Promise<ControllerModelPreflight> {
  const preflightId = `controller_model_preflight_${String(state.decisions.length + 1).padStart(3, "0")}`;
  const outPath = path.join(state.rootDir, `${preflightId}.json`);
  const reportPath = path.join(state.rootDir, `${preflightId}.md`);
  const provider = reviewerProviderConfigs(env).find(item => item.id === state.policy.controller.provider);
  const checks: ControllerModelPreflight["checks"] = [];
  const add = (id: string, status: "pass" | "fail", message: string) => checks.push({ id, status, message });
  add("controller-enabled", state.policy.controller.enabled ? "pass" : "fail", state.policy.controller.enabled ? "Controller model is enabled." : "Controller model is disabled.");
  add("provider-known", provider ? "pass" : "fail", provider ? `Provider ${provider.label} is configured.` : `Provider ${state.policy.controller.provider} is not configured.`);
  const envAvailable = provider ? provider.available : false;
  add("provider-credentials", provider && (provider.envVar === null || envAvailable) ? "pass" : "fail", provider ? provider.envVar === null ? "Provider does not require an API key." : envAvailable ? `${provider.envVar} is present.` : `${provider.envVar} is missing.` : "Provider configuration is missing.");
  add("model-name", state.policy.controller.model.trim() ? "pass" : "fail", state.policy.controller.model.trim() ? `Model is ${state.policy.controller.model}.` : "Model name is empty.");
  add("per-call-budget", estimatedCostUsd <= state.policy.controllerBudget.maxPerCallUsd ? "pass" : "fail", `Estimated controller call cost $${estimatedCostUsd.toFixed(6)}; max per call $${state.policy.controllerBudget.maxPerCallUsd}.`);
  const projectedStudyLoopCostUsd = round(state.costEstimateUsd + estimatedCostUsd, 6);
  add("study-loop-budget", projectedStudyLoopCostUsd <= state.policy.controllerBudget.maxStudyLoopUsd ? "pass" : "fail", `Projected controller study-loop cost $${projectedStudyLoopCostUsd.toFixed(6)}; max study-loop $${state.policy.controllerBudget.maxStudyLoopUsd}.`);
  add("output-token-limit", state.policy.controller.maxOutputTokens > 0 ? "pass" : "fail", `Controller max output tokens: ${state.policy.controller.maxOutputTokens}.`);
  add("input-char-limit", state.policy.controller.maxInputChars > 0 ? "pass" : "fail", `Controller max input chars: ${state.policy.controller.maxInputChars}.`);
  add("timeout", state.policy.controller.timeoutMs > 0 ? "pass" : "fail", `Controller timeout: ${state.policy.controller.timeoutMs}ms.`);
  const status: ControllerModelPreflight["status"] = checks.some(check => check.status === "fail") ? "fail" : "pass";
  const preflight: ControllerModelPreflight = {
    schemaVersion: 1,
    generatedAtIso: nowIso(),
    preflightId,
    status,
    provider: state.policy.controller.provider,
    model: state.policy.controller.model,
    enabled: state.policy.controller.enabled,
    required: state.policy.requireControllerModel,
    envVar: provider?.envVar ?? null,
    envAvailable,
    estimatedCostUsd,
    maxPerCallUsd: state.policy.controllerBudget.maxPerCallUsd,
    projectedStudyLoopCostUsd,
    maxStudyLoopUsd: state.policy.controllerBudget.maxStudyLoopUsd,
    fallbackAllowed: !state.policy.requireControllerModel,
    checks,
    outPath,
    reportPath,
  };
  await writeJson(outPath, { schemaVersion: 1, controllerModelPreflight: preflight });
  await writeFile(reportPath, renderControllerModelPreflightMarkdown(preflight));
  return preflight;
}

function renderControllerModelPreflightMarkdown(preflight: ControllerModelPreflight): string {
  return [
    "# Controller Model Preflight",
    "",
    `Generated: ${preflight.generatedAtIso}`,
    `Status: ${preflight.status}`,
    `Provider: ${preflight.provider}`,
    `Model: ${preflight.model}`,
    `Required: ${preflight.required}`,
    `Fallback allowed: ${preflight.fallbackAllowed}`,
    `Env var: ${preflight.envVar ?? "(none)"}`,
    `Env available: ${preflight.envAvailable}`,
    `Estimated call cost: $${preflight.estimatedCostUsd.toFixed(6)}`,
    `Projected controller loop cost: $${preflight.projectedStudyLoopCostUsd.toFixed(6)}`,
    "",
    "## Checks",
    "",
    ...preflight.checks.map(check => `- [${check.status}] ${check.id}: ${check.message}`),
    "",
    preflight.status === "fail" && preflight.required
      ? "Strict model-runner mode must stop until failed checks are resolved."
      : preflight.status === "fail"
        ? "The controller may fall back to deterministic policy because strict model-runner mode is not required."
        : "Model preflight passed; the controller may request a model decision.",
    "",
  ].join("\n");
}

async function writeControllerDecisionQuality(state: ControllerState, payload: ControllerModelPayload, rawModelPath: string): Promise<ControllerDecisionQuality> {
  const qualityId = `controller_decision_quality_${String(state.decisions.length + 1).padStart(3, "0")}`;
  const outPath = path.join(state.rootDir, `${qualityId}.json`);
  const reportPath = path.join(state.rootDir, `${qualityId}.md`);
  const minimumConfidence = 0.65;
  const riskFlags = payload.riskFlags ?? [];
  const checks: ControllerDecisionQuality["checks"] = [];
  const add = (id: string, status: "pass" | "fail", message: string, issueCodes: string[] = []) => checks.push({
    id,
    status,
    message,
    ...(issueCodes.length ? { issueCodes: uniqueText(issueCodes) } : {}),
  });
  add("confidence", payload.confidence >= minimumConfidence ? "pass" : "fail", `Model confidence ${payload.confidence}; minimum ${minimumConfidence}.`);
  add("rationale", payload.rationale.trim().length >= 12 ? "pass" : "fail", payload.rationale.trim().length >= 12 ? "Rationale is specific enough for audit." : "Rationale is too short to audit.");
  const highRiskFlags = riskFlags.filter(flag => controllerDecisionRiskFlagIsHigh(flag));
  add(
    "risk-flags",
    highRiskFlags.length && payload.action !== "stop_for_human" && payload.action !== "block" ? "fail" : "pass",
    highRiskFlags.length
      ? `High-risk flag(s): ${highRiskFlags.join(", ")}${payload.action === "stop_for_human" || payload.action === "block" ? "; terminal action is appropriate." : "; non-terminal execution is not allowed."}`
      : "No high-risk flags were reported.",
  );
  const activeCodedBlockers = await activeCodedControllerBlockers(state);
  add(
    "active-coded-blockers",
    activeCodedBlockers.issueCodes.length && payload.action !== "block" && payload.action !== "stop_for_human" ? "fail" : "pass",
    activeCodedBlockers.issueCodes.length
      ? `Active coded blocker(s) remain: ${activeCodedBlockers.issueCodes.join(", ")}. Model action ${payload.action} ${payload.action === "block" || payload.action === "stop_for_human" ? "is terminal and allowed" : "is non-terminal and must not continue"}.`
      : "No active coded blockers were found in issue ledger, stage review, or execution agenda.",
    activeCodedBlockers.issueCodes,
  );
  if (payload.toolRequests?.length) {
    const toolValidation = validateControllerToolRequests(state, payload.toolRequests);
    add("tool-requests", "pass", `Tool policy validation is ${toolValidation.status}: ${toolValidation.reasons.join("; ")} Final enforcement remains in the controller tool gate.`);
  } else {
    add("tool-requests", "pass", "No tool requests require quality validation.");
  }
  if (payload.inputPatch) {
    const patchValidation = validateControllerInputPatch(state, payload.inputPatch);
    add("input-patch", "pass", `Input patch validation is ${patchValidation.status}: ${patchValidation.reasons.join("; ")} Final enforcement remains in the controller patch gate.`);
  } else {
    add("input-patch", "pass", "No input patch requires quality validation.");
  }
  const status: ControllerDecisionQuality["status"] = checks.some(check => check.status === "fail") ? "fail" : "pass";
  const quality: ControllerDecisionQuality = {
    schemaVersion: 1,
    generatedAtIso: nowIso(),
    qualityId,
    status,
    stage: state.currentStage,
    action: payload.action,
    confidence: payload.confidence,
    minimumConfidence,
    riskFlags,
    rawModelPath,
    fallbackAllowed: !state.policy.requireControllerModel,
    checks,
    outPath,
    reportPath,
  };
  await writeJson(outPath, { schemaVersion: 1, controllerDecisionQuality: quality });
  await writeFile(reportPath, renderControllerDecisionQualityMarkdown(quality));
  return quality;
}

async function activeCodedControllerBlockers(state: ControllerState): Promise<{ issueCodes: string[]; evidenceRefs: string[] }> {
  const issueLedger = await readLatestControllerIssueLedger(state);
  const stageReview = await readLatestControllerStageReview(state);
  const latestAgendaPath = latestArtifactPath(state, "controller-execution-agenda");
  const latestAgendaRaw = latestAgendaPath ? await readJsonIfPresent(latestAgendaPath) : null;
  const latestAgenda = (valueAtPath(latestAgendaRaw, "controllerExecutionAgenda") ?? latestAgendaRaw) as Partial<ControllerExecutionAgenda> | null;
  const issueCodes = enforceableControllerBlockerCodes([
    ...(issueLedger?.issues ?? [])
      .filter(issue => issue.status === "active" && issue.severity === "blocker")
      .map(issue => issue.issueCode)
      .filter((item): item is string => Boolean(item)),
    ...(stageReview?.findings ?? [])
      .filter(finding => finding.severity === "blocker")
      .flatMap(finding => finding.issueCodes ?? issueCodesFromText(finding.message)),
    ...(latestAgenda?.status === "blocked" && Array.isArray(latestAgenda.activeBlockerIssueCodes) ? latestAgenda.activeBlockerIssueCodes.map(String) : []),
    ...(Array.isArray(latestAgenda?.items)
      ? latestAgenda.items
        .filter(item => item && typeof item === "object" && item.status === "blocked")
        .flatMap(item => Array.isArray(item.issueCodes) ? item.issueCodes.map(String) : [])
      : []),
  ].filter(item => item.length > 0));
  const evidenceRefs = uniqueText([
    issueLedger?.outPath,
    stageReview?.outPath,
    latestAgendaPath,
  ].filter((item): item is string => Boolean(item)));
  return { issueCodes, evidenceRefs };
}

function enforceableControllerBlockerCodes(codes: string[]): string[] {
  return uniqueText(codes.map(code => code.trim().toUpperCase()).filter(isEnforceableControllerBlockerCode));
}

function isEnforceableControllerBlockerCode(code: string): boolean {
  if (!/^[A-Z][A-Z0-9_]{2,}$/.test(code)) return false;
  if (!code.includes("_")) return false;
  if (code.endsWith("_WARNING") || code.endsWith("_WARN") || code.endsWith("_ADVISORY")) return false;
  return (
    code.endsWith("_BLOCKER")
    || code.startsWith("METHOD_")
    || code.startsWith("COMPLETE_CASE_")
    || code.startsWith("TEMPORAL_WINDOW_INVALID")
    || code.startsWith("TEMPORAL_WINDOW_NOT_OBSERVED")
    || code.startsWith("IMPLAUSIBLE_")
    || code.startsWith("INVALID_")
    || code.startsWith("NEGATIVE_")
    || code.startsWith("NON_")
    || code.startsWith("NO_")
    || code.startsWith("EMPTY_")
    || code.startsWith("MISSING_")
    || code.startsWith("EXTREME_")
    || code.includes("_REQUIRED")
    || code.includes("_INVALID")
    || code.includes("_LEAKAGE")
    || code.includes("_POST_TREATMENT")
    || code.includes("_ATTRITION_EXTREME")
    || code.includes("_UNDERPOWERED")
  );
}

function activeCodedBlockerStageCanProceed(stage: ControllerStage): boolean {
  return stage === "dataset_feasibility" || stage === "repair";
}

async function writeControllerActionReadiness(
  state: ControllerState,
  decision: ControllerDecision,
  gateResult: ControllerGate,
): Promise<ControllerActionReadiness> {
  const readiness = await validateControllerActionReadiness(state, decision, gateResult);
  await writeJson(readiness.outPath, { schemaVersion: 1, controllerActionReadiness: readiness });
  await writeFile(readiness.reportPath, renderControllerActionReadinessMarkdown(readiness));
  return readiness;
}

async function validateControllerActionReadiness(
  state: ControllerState,
  decision: ControllerDecision,
  gateResult: ControllerGate,
): Promise<ControllerActionReadiness> {
  const readinessId = `controller_action_readiness_${String(state.decisions.length).padStart(3, "0")}_${decision.action}`;
  const basePath = path.join(state.rootDir, readinessId);
  const checks: ControllerActionReadiness["checks"] = [];
  const add = (id: string, status: "pass" | "warning" | "fail", message: string, evidenceRefs: string[] = [], issueCodes: string[] = []) => {
    checks.push({
      id,
      status,
      message,
      ...(issueCodes.length ? { issueCodes: uniqueText(issueCodes) } : {}),
      evidenceRefs: uniqueText(evidenceRefs),
    });
  };
  add(
    "stage-action-allowed",
    allowedActionForStage(state.currentStage, decision.action) ? "pass" : "fail",
    allowedActionForStage(state.currentStage, decision.action)
      ? `${decision.action} is allowed at stage ${state.currentStage}.`
      : `${decision.action} is not allowed at stage ${state.currentStage}.`,
  );
  add(
    "gate-status",
    gateResult.status === "block" && decision.action !== "block" && decision.action !== "stop_for_human" ? "fail" : gateResult.status === "warning" ? "warning" : "pass",
    gateResult.status === "block"
      ? `Gate is blocked: ${gateResult.reasons.join("; ") || gateResult.label}`
      : gateResult.status === "warning"
        ? `Gate has warnings: ${gateResult.reasons.join("; ") || gateResult.label}`
        : `Gate passed: ${gateResult.label}`,
    gateResult.evidenceRefs,
  );
  if (decision.action === "stop_for_human" || decision.action === "block") {
    add("terminal-action", "pass", `${decision.action} is a safe terminal controller action.`);
  } else {
    add("controller-status", state.status === "running" ? "pass" : "fail", `Controller status is ${state.status}.`);
    add("required-action-artifacts-declared", expectedArtifactsForAction(decision.action).length || decision.action === "initialize" ? "pass" : "warning", `${decision.action} expects ${expectedArtifactsForAction(decision.action).length} artifact(s).`);
    await addActionSpecificReadinessChecks(state, decision.action, add);
  }
  const status: ControllerActionReadiness["status"] = checks.some(check => check.status === "fail")
    ? "fail"
    : checks.some(check => check.status === "warning") ? "warning" : "pass";
  return {
    schemaVersion: 1,
    generatedAtIso: nowIso(),
    readinessId,
    runId: state.runId,
    decisionId: decision.id,
    stage: state.currentStage,
    action: decision.action,
    gateStatus: gateResult.status,
    status,
    checks,
    outPath: `${basePath}.json`,
    reportPath: `${basePath}.md`,
  };
}

async function addActionSpecificReadinessChecks(
  state: ControllerState,
  action: ControllerActionType,
  add: (id: string, status: "pass" | "warning" | "fail", message: string, evidenceRefs?: string[], issueCodes?: string[]) => void,
): Promise<void> {
  const has = (kind: string) => artifactExists(state, kind);
  const paths = (...kinds: string[]) => artifactPaths(state, ...kinds);
  switch (action) {
    case "context_preflight":
      add("context-policy", state.policy.allowContext ? "pass" : "fail", state.policy.allowContext ? "Context preflight is enabled." : "Context preflight is disabled by policy.");
      break;
    case "table_summary":
      add("data-path-present", state.inputs.dataPath ? "pass" : "warning", state.inputs.dataPath ? `Data path is ${state.inputs.dataPath}.` : "No data path is supplied; table summary will be advisory or skipped.", state.inputs.dataPath ? [state.inputs.dataPath] : []);
      add("feasibility-verdict-present", has("controller-feasibility-verdict") ? "pass" : "fail", has("controller-feasibility-verdict") ? "Feasibility verdict was produced by the stage gate." : "Feasibility verdict is missing before table_summary action.", paths("controller-feasibility-verdict"));
      break;
    case "explore":
      add("data-path-present", state.inputs.dataPath ? "pass" : "warning", state.inputs.dataPath ? `Data path is ${state.inputs.dataPath}.` : "No data path is supplied; exploration will be skipped.", state.inputs.dataPath ? [state.inputs.dataPath] : []);
      break;
    case "literature_search":
      add("literature-policy", state.policy.allowLiterature ? "pass" : "fail", state.policy.allowLiterature ? "Literature intake is enabled." : "Literature intake is disabled by policy.");
      break;
    case "select_method":
      add("method-selection-input", state.inputs.question.trim() ? "pass" : "fail", state.inputs.question.trim() ? "Research question is available for method selection." : "Research question is missing.");
      if (state.inputs.dataPath) {
        const feasibility = await loadControllerFeasibilitySummary(state);
        add(
          "feasibility-before-method",
          !feasibility.present ? "fail" : feasibility.status === "block" ? "fail" : feasibility.status === "warning" ? "warning" : "pass",
          !feasibility.present
            ? "Row-level run is missing feasibility verdict before method selection."
            : feasibility.status === "block"
              ? `Feasibility verdict blocks method selection: ${feasibility.issueCodes.join(", ") || feasibility.blockers.join("; ") || "blocked"}.`
              : feasibility.status === "warning"
                ? `Feasibility verdict has warnings before method selection: ${feasibility.issueCodes.join(", ") || feasibility.warnings.join("; ") || "warning"}.`
                : "Feasibility verdict is available before method selection and does not block.",
          feasibility.path ? [feasibility.path] : paths("controller-feasibility-verdict"),
          feasibility.issueCodes,
        );
      }
      if (state.inputs.dataPath) await addDatasetSemanticAuditReadinessCheck(state, "method", add);
      break;
    case "run_analysis": {
      add("execution-policy", state.policy.allowExecution ? "pass" : "fail", state.policy.allowExecution ? "Execution is allowed by policy." : "Execution is disabled by policy.");
      add("method-present", state.inputs.method ? "pass" : "fail", state.inputs.method ? `Executable method is ${state.inputs.method}.` : "No executable method is selected.");
      add("data-path-present", state.inputs.dataPath ? "pass" : "fail", state.inputs.dataPath ? `Data path is ${state.inputs.dataPath}.` : "No data path is available for execution.", state.inputs.dataPath ? [state.inputs.dataPath] : []);
      add("required-variables-present", requiredVariableNames(state).length ? "pass" : "fail", requiredVariableNames(state).length ? `Required variables: ${requiredVariableNames(state).join(", ")}.` : "No outcome/exposure/group/time-event/variables are available for execution.");
      {
        const feasibility = await loadControllerFeasibilitySummary(state);
        add(
          "feasibility-before-execution",
          !feasibility.present ? "fail" : feasibility.status === "block" ? "fail" : feasibility.status === "warning" ? "warning" : "pass",
          !feasibility.present
            ? "Execution requires a feasibility verdict."
            : feasibility.status === "block"
              ? `Feasibility verdict blocks execution: ${feasibility.issueCodes.join(", ") || feasibility.blockers.join("; ") || "blocked"}.`
              : feasibility.status === "warning"
                ? `Feasibility verdict has warnings before execution: ${feasibility.issueCodes.join(", ") || feasibility.warnings.join("; ") || "warning"}.`
                : "Feasibility verdict is available before execution and does not block.",
          feasibility.path ? [feasibility.path] : paths("controller-feasibility-verdict"),
          feasibility.issueCodes,
        );
      }
      await addDatasetSemanticAuditReadinessCheck(state, "execution", add);
      add("method-plan-before-execution", has("controller-modeling-plan") || has("method-selection") ? "pass" : "warning", has("controller-modeling-plan") || has("method-selection") ? "Method-selection evidence is available." : "No method-selection artifact is available; execution may be using only supplied inputs.", paths("controller-modeling-plan", "method-selection"));
      break;
    }
    case "method_qa":
      add("stats-artifacts-before-qa", has("stats-summary") && has("stats-qa") ? "pass" : "fail", has("stats-summary") && has("stats-qa") ? "Stats artifacts are available before methods QA." : "Methods QA requires stats summary and stats QA artifacts.", paths("stats-summary", "stats-qa"));
      break;
    case "write_manuscript":
      add("stats-artifacts-before-manuscript", has("stats-summary") && has("stats-report") && has("stats-qa") ? "pass" : "fail", has("stats-summary") && has("stats-report") && has("stats-qa") ? "Stats artifacts are available before manuscript generation." : "Manuscript generation requires stats summary, report, and QA artifacts.", paths("stats-summary", "stats-report", "stats-qa"));
      add("method-qa-before-manuscript", has("method-qa") ? "pass" : "warning", has("method-qa") ? "Method QA is available before manuscript generation." : "Method QA is missing before manuscript generation.", paths("method-qa"));
      break;
    case "literature_qa":
      add("literature-context-before-qa", has("literature-context") ? "pass" : "fail", has("literature-context") ? "Literature context is available for literature QA." : "Literature QA requires literature context.", paths("literature-context"));
      add("manuscript-before-literature-qa", has("manuscript") ? "pass" : "fail", has("manuscript") ? "Manuscript is available for literature QA." : "Literature QA requires a manuscript.", paths("manuscript"));
      break;
    case "external_review":
      add("external-review-policy", state.policy.allowExternalReview || state.policy.requireExternalReviewForPromotion ? "pass" : "fail", state.policy.allowExternalReview || state.policy.requireExternalReviewForPromotion ? "External review is enabled or required." : "External review is disabled by policy.");
      add("manuscript-before-review", has("manuscript") ? "pass" : "fail", has("manuscript") ? "Manuscript is available for external review." : "External review requires a manuscript.", paths("manuscript"));
      break;
    case "apply_repairs":
      add("repair-policy", state.policy.allowAutoRepair && state.policy.autonomy === "aggressive" ? "pass" : "fail", state.policy.allowAutoRepair && state.policy.autonomy === "aggressive" ? "Auto-repair policy allows bounded repair." : "Auto-repair requires aggressive autonomy and allowAutoRepair.");
      add("repair-plan-present", has("controller-repair-plan") ? "pass" : "fail", has("controller-repair-plan") ? "Repair plan is available." : "No controller repair plan artifact is available.", paths("controller-repair-plan"));
      break;
    case "inspect_run":
      add("run-dir-present", state.inputs.runDir ? "pass" : "fail", `Run directory is ${state.inputs.runDir}.`, [state.inputs.runDir]);
      add("analysis-before-inspection", has("stats-summary") || has("manuscript") ? "pass" : "warning", has("stats-summary") || has("manuscript") ? "Analysis or manuscript artifacts exist for inspection." : "Inspection has no analysis/manuscript artifacts yet.", paths("stats-summary", "manuscript"));
      break;
    case "decide_promotion":
      add("inspection-before-promotion", has("run-inspection") ? "pass" : "fail", has("run-inspection") ? "Run inspection is available before promotion decision." : "Promotion requires run inspection.", paths("run-inspection"));
      add("required-artifacts-hashable", state.artifacts.filter(item => item.requiredForPromotion && !item.sha256).length ? "fail" : "pass", state.artifacts.filter(item => item.requiredForPromotion && !item.sha256).length ? "Some required artifacts are missing hashes/files." : "Required artifacts are hashable.", state.artifacts.filter(item => item.requiredForPromotion && !item.sha256).map(item => item.path));
      break;
    case "initialize":
      add("state-path-present", state.statePath ? "pass" : "fail", `Controller state path is ${state.statePath}.`, [state.statePath]);
      break;
    default:
      break;
  }
}

function renderControllerActionReadinessMarkdown(readiness: ControllerActionReadiness): string {
  return [
    "# Controller Action Readiness",
    "",
    `Generated: ${readiness.generatedAtIso}`,
    `Readiness: ${readiness.readinessId}`,
    `Run ID: ${readiness.runId}`,
    `Decision: ${readiness.decisionId}`,
    `Stage: ${readiness.stage}`,
    `Action: ${readiness.action}`,
    `Gate status: ${readiness.gateStatus}`,
    `Status: ${readiness.status}`,
    "",
    "## Checks",
    "",
    ...readiness.checks.flatMap(check => [
      `### ${check.id}`,
      "",
      `- Status: ${check.status}`,
      `- Finding: ${check.message}`,
      ...(check.issueCodes?.length ? [`- Issue codes: ${check.issueCodes.join(", ")}`] : []),
      ...(check.evidenceRefs.length ? ["- Evidence:", ...check.evidenceRefs.map(ref => `  - ${ref}`)] : ["- Evidence: none recorded"]),
      "",
    ]),
    readiness.status === "fail"
      ? "The selected action must not execute until failed readiness checks are resolved."
      : readiness.status === "warning"
        ? "The selected action may execute, but warning checks should be carried forward as risk evidence."
        : "The selected action is ready to execute.",
    "",
  ].join("\n");
}

function controllerDecisionRiskFlagIsHigh(flag: string): boolean {
  return /\b(block|blocker|unsafe|unsupported|unverified|hallucinat|privacy|credential|cost|overclaim|invalid|methodological|infeasible|needs_human|human_review)\b/i.test(flag.replace(/[_-]/g, " "));
}

async function addDatasetSemanticAuditReadinessCheck(
  state: ControllerState,
  phase: "method" | "execution",
  add: (id: string, status: "pass" | "warning" | "fail", message: string, evidenceRefs?: string[], issueCodes?: string[]) => void,
): Promise<void> {
  const audit = await loadControllerDatasetSemanticAuditSummary(state);
  const evidenceRefs = uniqueText([audit.path, audit.reportPath].filter((item): item is string => Boolean(item)));
  const selectedIssueCodes = uniqueText(audit.topIssues.filter(issue => issue.selected && issue.severity !== "note").map(issue => issue.code));
  const id = phase === "execution" ? "semantic-audit-before-execution" : "semantic-audit-before-method";
  if (!audit.present) {
    add(id, "fail", `Row-level ${phase === "execution" ? "execution" : "method selection"} requires a dataset semantic audit from dataset_feasibility.`, evidenceRefs);
    return;
  }
  if (audit.selectedRoleStatus === "block") {
    add(
      id,
      "fail",
      `Selected study roles have semantic blocker(s): ${audit.topIssues.filter(issue => issue.selected).map(issue => `${issue.code}: ${issue.message}`).join("; ") || "no detail"}.`,
      evidenceRefs,
      selectedIssueCodes,
    );
    return;
  }
  if (audit.selectedRoleStatus === "warning") {
    add(
      id,
      "warning",
      `Selected study roles have semantic warning(s): ${audit.topIssues.filter(issue => issue.selected).map(issue => `${issue.code}: ${issue.message}`).join("; ") || "no detail"}.`,
      evidenceRefs,
      selectedIssueCodes,
    );
    return;
  }
  add(
    id,
    "pass",
    audit.status === "warning"
      ? `Selected study roles pass semantic plausibility; dataset-wide audit has ${audit.issueCount} unused/nonblocking issue(s) for review.`
      : "Dataset semantic audit passes for selected study roles.",
    evidenceRefs,
  );
}

function renderControllerDecisionQualityMarkdown(quality: ControllerDecisionQuality): string {
  return [
    "# Controller Decision Quality",
    "",
    `Generated: ${quality.generatedAtIso}`,
    `Status: ${quality.status}`,
    `Stage: ${quality.stage}`,
    `Action: ${quality.action}`,
    `Confidence: ${quality.confidence}`,
    `Minimum confidence: ${quality.minimumConfidence}`,
    `Fallback allowed: ${quality.fallbackAllowed}`,
    `Raw model output: ${quality.rawModelPath}`,
    "",
    "## Risk Flags",
    "",
    ...(quality.riskFlags.length ? quality.riskFlags.map(flag => `- ${flag}`) : ["- None"]),
    "",
    "## Checks",
    "",
    ...quality.checks.map(check => `- [${check.status}${check.issueCodes?.length ? `:${check.issueCodes.join(",")}` : ""}] ${check.id}: ${check.message}`),
    "",
    quality.status === "fail" && !quality.fallbackAllowed
      ? "Strict model-runner mode must stop because this model decision is not safe to execute."
      : quality.status === "fail"
        ? "The controller may fall back to deterministic policy because strict model-runner mode is not required."
        : "Decision quality passed; the controller may execute the model-selected action.",
    "",
  ].join("\n");
}

async function executeControllerAction(state: ControllerState, decision: ControllerDecision, gateResult: ControllerGate, env: NodeJS.ProcessEnv, fetchImpl: typeof fetch): Promise<ControllerExecutedAction> {
  const startedAtIso = nowIso();
  const artifacts: ControllerArtifact[] = [];
  let status: ControllerExecutedAction["status"] = "succeeded";
  let outputSummary = "";
  let error: string | null = null;
  let nextStage = gateResult.nextStage;
  try {
    switch (decision.action) {
      case "initialize":
        outputSummary = "Controller initialized run directories and state.";
        nextStage = gateResult.nextStage;
        break;
      case "context_preflight": {
        if (!state.policy.allowContext) {
          status = "skipped";
          outputSummary = "Context preflight disabled by policy.";
          nextStage = nextStageAfterContext(state);
          break;
        }
        const context = await runControllerContextPreflight(state);
        const contextPath = path.join(state.rootDir, "controller-context-preflight.json");
        const manifestPath = path.join(state.rootDir, "controller-context-manifest.json");
        await writeJson(contextPath, { schemaVersion: 1, controllerContextPreflight: context });
        await writeJson(manifestPath, { schemaVersion: 1, contextManifest: context.contextManifest });
        artifacts.push(await artifact("controller-context-preflight", contextPath, "context", true));
        artifacts.push(await artifact("controller-context-manifest", manifestPath, "context", true));
        outputSummary = `Context preflight ${context.contextManifest.status}; staleOrMissing=${context.staleOrMissing}; score=${context.contextManifest.score.toFixed(3)}; memoryHits=${context.memoryHits.length}.`;
        nextStage = state.policy.requireContext && context.contextManifest.status === "blocked" ? "human_review" : nextStageAfterContext(state);
        break;
      }
      case "table_summary":
        outputSummary = "Table summary was already produced by the feasibility gate.";
        nextStage = gateResult.nextStage;
        break;
      case "explore": {
        if (!state.inputs.dataPath) {
          status = "skipped";
          outputSummary = "No data path supplied; exploration skipped.";
          nextStage = "method_selection";
          break;
        }
        const outDir = path.join(state.rootDir, "exploration");
        const result: ResearchExplorationResult = await researchExploreCommand({ dataPath: state.inputs.dataPath, outDir, target: state.inputs.outcome ?? undefined, python: state.inputs.python ?? undefined });
        artifacts.push(await artifact("exploration", path.join(outDir, "exploration.json"), "exploration", false));
        artifacts.push(await artifact("exploration-report", path.join(outDir, "exploration-report.md"), "exploration", false));
        outputSummary = `Exploration ${result.qa.status}; ${result.candidateQuestions.length} candidate question(s), ${result.associations.length} association(s).`;
        nextStage = state.policy.allowLiterature ? "literature" : "method_selection";
        break;
      }
      case "literature_search": {
        if (!state.policy.allowLiterature) {
          status = "skipped";
          outputSummary = "Literature intake disabled by policy.";
          nextStage = "method_selection";
          break;
        }
        const outDir = path.join(state.rootDir, "literature");
        const searchPath = path.join(outDir, "literature-search.json");
        const searchReportPath = path.join(outDir, "literature-search.md");
        const contextPath = path.join(outDir, "literature-context.json");
        const contextReportPath = path.join(outDir, "literature-context.md");
        const search: ResearchLiteratureSearchResult = await researchMedbreviaLiteratureSearchCommand({
          question: state.inputs.question,
          baseUrl: state.policy.literatureBaseUrl ?? undefined,
          endpoint: state.policy.literatureEndpoint,
          responseDepth: state.policy.literatureDepth,
          topK: state.policy.literatureTopK,
          timeoutMs: state.policy.literatureTimeoutMs,
          mockResponsePath: state.policy.literatureMockResponsePath ?? undefined,
          outPath: searchPath,
          reportPath: searchReportPath,
        });
        const context: ResearchLiteratureContext = await researchLiteratureContextCommand({
          question: state.inputs.question,
          literaturePath: searchPath,
          outPath: contextPath,
          reportPath: contextReportPath,
        });
        artifacts.push(await artifact("literature-search", searchPath, "literature", false));
        artifacts.push(await artifact("literature-search-report", searchReportPath, "literature", false));
        artifacts.push(await artifact("literature-context", contextPath, "literature", true));
        artifacts.push(await artifact("literature-context-report", contextReportPath, "literature", false));
        outputSummary = `Literature intake ${context.status}; evidence=${context.evidenceStrength}; sources=${search.evidenceSummary.sourceCount}; high-quality=${search.evidenceSummary.highQualitySourceCount}.`;
        nextStage = context.status === "failed" && state.policy.autonomy !== "aggressive" ? "human_review" : "method_selection";
        break;
      }
      case "select_method": {
        const outcomeType = inferOutcomeType(state);
        const modelingPlan: ModelingDecisionPlan = buildModelingDecisionPlan({
          question: state.inputs.question,
          outcomeType: outcomeType === "unknown" ? undefined : outcomeType,
          surveyDesign: state.inputs.surveyDesign,
          timeToEvent: Boolean((state.inputs.time || state.inputs.stop) && state.inputs.event),
          dataStructures: ["single_table"],
          target: state.inputs.outcome ?? state.inputs.event ?? undefined,
          roleHints: controllerModelingRoleHints(state),
          tableSummary: await controllerTableSummaryForModeling(state),
          literatureEvidence: await controllerLiteratureEvidenceForModeling(state),
          feasibilityEvidence: await controllerFeasibilityEvidenceForModeling(state),
          requiresInference: true,
          maxCandidates: 12,
        });
        const modelingPlanPath = path.join(state.rootDir, "controller-modeling-plan.json");
        await writeJson(modelingPlanPath, { schemaVersion: 1, modelingPlan });
        artifacts.push(await artifact("controller-modeling-plan", modelingPlanPath, "method_selection", true));
        const selection = selectAnalysisMethods({
          question: state.inputs.question,
          outcomeType: outcomeType === "unknown" ? undefined : outcomeType,
          surveyDesign: state.inputs.surveyDesign,
          timeToEvent: Boolean((state.inputs.time || state.inputs.stop) && state.inputs.event),
          dataStructures: ["single_table"],
          maxCandidates: 8,
        });
        const selectionPath = path.join(state.rootDir, "method-selection.json");
        await writeJson(selectionPath, { schemaVersion: 1, methodSelection: selection });
        artifacts.push(await artifact("method-selection", selectionPath, "method_selection", true));
        const executableSelection = selectControllerExecutableStatsMethod(state.inputs.method ?? null, modelingPlan, selection);
        const executable = executableSelection.method;
        if (executable) state.inputs.method = executable;
        outputSummary = executable
          ? `Selected executable method ${executable} from ${executableSelection.source}; modeling route=${modelingPlan.routeRecommendation.route}; blocked=${modelingPlan.blocked}; guidance=${modelingPlan.statisticalMethodGuidance.recommendedStatsRunMethod}.`
          : `Modeling plan produced ${executableSelection.unmappedMethodId ?? modelingPlan.methodSelectionEvidence.primaryMethodId ?? selection.primary?.method.id ?? "no primary method"} but no stats-run mapping; human review required.`;
        nextStage = executable && !modelingPlan.blocked ? "execution" : "human_review";
        break;
      }
      case "run_analysis": {
        const result: StatsRunResult = await researchStatsRunCommand({
          method: state.inputs.method ?? "descriptive",
          dataPath: state.inputs.dataPath ?? "",
          outDir: state.inputs.runDir,
          outcome: state.inputs.outcome ?? undefined,
          exposure: state.inputs.exposure ?? undefined,
          group: state.inputs.group ?? undefined,
          outcomeThreshold: state.inputs.outcomeThreshold ?? undefined,
          exposureThreshold: state.inputs.exposureThreshold ?? undefined,
          variables: state.inputs.variables,
          covariates: state.inputs.covariates,
          exactCovariates: state.inputs.exactCovariates,
          estimand: "ATT",
          matchRatio: 1,
          replacement: false,
          trimThreshold: 0.01,
          stabilizeWeights: true,
          time: state.inputs.time ?? undefined,
          start: state.inputs.start ?? undefined,
          stop: state.inputs.stop ?? undefined,
          event: state.inputs.event ?? undefined,
          id: state.inputs.id ?? undefined,
          strata: state.inputs.strata ?? undefined,
          cluster: state.inputs.cluster ?? undefined,
          period: state.inputs.period ?? undefined,
          post: state.inputs.post ?? undefined,
          runningVariable: state.inputs.runningVariable ?? undefined,
          cutoff: state.inputs.cutoff ?? undefined,
          instrument: state.inputs.instrument ?? undefined,
          alphaPenalty: state.inputs.alphaPenalty ?? undefined,
          l1Ratio: state.inputs.l1Ratio ?? undefined,
          weight: state.inputs.weight ?? undefined,
          offset: state.inputs.offset ?? undefined,
          surveyDesign: state.inputs.surveyDesign,
          allowSurveyApproximation: state.inputs.allowSurveyApproximation,
          alpha: 0.05,
          python: state.inputs.python ?? undefined,
        });
        for (const item of result.artifacts) artifacts.push(await artifact(`stats-${item.kind}`, item.path, "execution", item.kind === "summary" || item.kind === "qa" || item.kind === "report"));
        outputSummary = `Stats run ${result.status}; complete-case N=${result.completeCaseN}; issues=${result.issues.length}; warnings=${result.warnings.length}.`;
        nextStage = result.status === "succeeded" ? "qa" : "human_review";
        break;
      }
      case "method_qa": {
        const result: MethodQaResult = await researchMethodQaCommand({ runDir: state.inputs.runDir, outPath: path.join(state.inputs.runDir, "method-qa.json"), reportPath: path.join(state.inputs.runDir, "method-qa.md") });
        artifacts.push(await artifact("method-qa", path.join(state.inputs.runDir, "method-qa.json"), "qa", true));
        artifacts.push(await artifact("method-qa-report", path.join(state.inputs.runDir, "method-qa.md"), "qa", false));
        outputSummary = `Method QA ${result.overallStatus}; readiness=${result.readiness}; blockers=${result.blockerCount}; warnings=${result.warningCount}.`;
        nextStage = result.overallStatus === "fail" && state.policy.autonomy !== "aggressive" ? "human_review" : "manuscript";
        break;
      }
      case "write_manuscript": {
        const result: ManuscriptResult = await researchManuscriptCommand({ runDir: state.inputs.runDir, outPath: path.join(state.inputs.runDir, "manuscript.md"), qaOutPath: path.join(state.inputs.runDir, "manuscript-qa.json") });
        artifacts.push(await artifact("manuscript", result.manuscriptPath ?? path.join(state.inputs.runDir, "manuscript.md"), "manuscript", true));
        artifacts.push(await artifact("manuscript-qa", result.qaPath ?? path.join(state.inputs.runDir, "manuscript-qa.json"), "manuscript", true));
        outputSummary = `Manuscript QA ${result.manuscriptQa.status}; method QA ${result.methodQa.overallStatus}.`;
        nextStage = state.policy.allowLiterature ? "literature_qa" : state.policy.allowExternalReview ? "external_review" : "inspection";
        break;
      }
      case "literature_qa": {
        if (!state.policy.allowLiterature) {
          status = "skipped";
          outputSummary = "Literature QA disabled by policy.";
          nextStage = state.policy.allowExternalReview ? "external_review" : "inspection";
          break;
        }
        const literaturePath = path.join(state.rootDir, "literature", "literature-search.json");
        if (!await pathExists(literaturePath)) {
          status = "failed";
          error = "Literature QA requires a literature-search.json artifact.";
          outputSummary = error;
          nextStage = state.policy.autonomy === "aggressive" ? state.policy.allowExternalReview ? "external_review" : "inspection" : "human_review";
          break;
        }
        const qa: ResearchLiteratureQaResult = await researchLiteratureQaCommand({
          question: state.inputs.question,
          literaturePath,
          paperPath: path.join(state.inputs.runDir, "manuscript.md"),
          outPath: path.join(state.inputs.runDir, "literature-qa.json"),
          reportPath: path.join(state.inputs.runDir, "literature-qa.md"),
        });
        artifacts.push(await artifact("literature-qa", path.join(state.inputs.runDir, "literature-qa.json"), "literature_qa", true));
        artifacts.push(await artifact("literature-qa-report", path.join(state.inputs.runDir, "literature-qa.md"), "literature_qa", false));
        outputSummary = `Literature QA ${qa.status}; cited=${qa.citedSourceIds.length}; high-quality uncited=${qa.uncitedHighQualitySourceIds.length}.`;
        nextStage = qa.status === "fail" && state.policy.autonomy !== "aggressive" ? "human_review" : state.policy.allowExternalReview ? "external_review" : "inspection";
        break;
      }
      case "external_review": {
        if (!state.policy.allowExternalReview) {
          status = "skipped";
          outputSummary = "External review disabled by policy.";
          nextStage = "inspection";
          break;
        }
        const result: StudyCriticResult = await researchStudyCriticCommand({
          runDir: state.inputs.runDir,
          stage: state.policy.reviewStage,
          autonomy: state.policy.autonomy,
          panel: state.policy.reviewPanel,
          mock: state.policy.mockExternalReview,
          budget: state.policy.reviewerBudget,
          env,
          fetchImpl,
        });
        artifacts.push(await artifact("review-panel", result.generatedFiles.panel, "external_review", true));
        artifacts.push(await artifact("review-adjudication", result.generatedFiles.adjudication, "external_review", true));
        artifacts.push(await artifact("state-reentry", result.generatedFiles.stateReentry, "external_review", true));
        state.costEstimateUsd = round(state.costEstimateUsd + result.panel.costEstimateUsd, 6);
        const repairPlanPath = await writeControllerRepairPlan(state, result);
        artifacts.push(await artifact("controller-repair-plan", repairPlanPath, "external_review", true));
        const reentryStage = mapReviewReentryToControllerStage(result.adjudication.reentryPoint);
        const canAutoRepair = state.policy.allowAutoRepair && state.policy.autonomy === "aggressive" && result.adjudication.verdict !== "pass" && reentryStage !== "human_review" && repairAttemptCount(state) < state.policy.maxAutoRepairs;
        outputSummary = `External review ${result.adjudication.verdict}; accepted findings=${result.adjudication.acceptedFindings.length}; reentry=${result.adjudication.reentryPoint}${canAutoRepair ? "; bounded repair queued" : ""}.`;
        nextStage = result.adjudication.verdict === "pass" ? "inspection" : canAutoRepair ? "repair" : "human_review";
        break;
      }
      case "apply_repairs": {
        const repair = await applyControllerRepairs(state);
        state.repairs.push(repair);
        artifacts.push(await artifact("controller-repair-execution", repair.outPath, "repair", true));
        for (const repairStep of repair.executedRepairs) {
          for (const artifactRef of repairStep.artifactRefs) artifacts.push(await artifact(`repair-${repairStep.pluginId}`, artifactRef, "repair", false));
        }
        const verification = await writeControllerRepairVerification(state, repair);
        artifacts.push(await artifact("controller-repair-verification", verification.outPath, "repair", true));
        artifacts.push(await artifact("controller-repair-verification-report", verification.reportPath, "repair", false));
        outputSummary = `Repair ${repair.status}; executed=${repair.executedRepairs.length}; skipped=${repair.skippedFindings.length}; next=${repair.nextStage}.`;
        nextStage = repair.nextStage;
        break;
      }
      case "inspect_run": {
        const result: RunInspectionResult = await researchRunInspectCommand({ runDir: state.inputs.runDir, outPath: path.join(state.inputs.runDir, "run-inspection.json"), reportPath: path.join(state.inputs.runDir, "run-inspection.md") });
        artifacts.push(await artifact("run-inspection", path.join(state.inputs.runDir, "run-inspection.json"), "inspection", true));
        artifacts.push(await artifact("run-inspection-report", path.join(state.inputs.runDir, "run-inspection.md"), "inspection", false));
        outputSummary = `Run inspection readiness=${result.readiness}; blockers=${result.blockers.length}; warnings=${result.warnings.length}.`;
        nextStage = "promotion_decision";
        break;
      }
      case "decide_promotion": {
        const inspection = await readJsonIfPresent(path.join(state.inputs.runDir, "run-inspection.json"));
        const readiness = String(valueAtPath(inspection, "runInspection.readiness") ?? valueAtPath(inspection, "readiness") ?? "");
        const reviewVerdict = String(valueAtPath(await readJsonIfPresent(path.join(state.inputs.runDir, "review", "review-adjudication.json")), "reviewAdjudication.verdict") ?? "");
        const reviewPromotion = externalReviewPromotionStatus(state, reviewVerdict);
        const completionAudit = await writeControllerCompletionAudit(state);
        artifacts.push(await artifact("controller-completion-audit", completionAudit.outPath, "promotion_decision", true));
        artifacts.push(await artifact("controller-completion-audit-report", completionAudit.reportPath, "promotion_decision", false));
        const selfEvaluation = await writeControllerSelfEvaluation(state);
        state.selfEvaluations.push(selfEvaluation);
        artifacts.push(await artifact("controller-self-evaluation", selfEvaluation.outPath, "promotion_decision", true));
        artifacts.push(await artifact("controller-self-evaluation-report", selfEvaluation.reportPath, "promotion_decision", false));
        const ready = readiness === "local_review_ready" && reviewPromotion.promotionSatisfied && selfEvaluation.status !== "fail" && completionAudit.status !== "fail";
        const goldenPacket = await writeControllerGoldenPacket(state, {
          ready,
          inspectionReadiness: readiness || null,
          reviewVerdict: reviewVerdict || null,
          completionAudit,
          selfEvaluation,
        });
        artifacts.push(await artifact("controller-golden-packet", goldenPacket.outPath, "promotion_decision", false));
        artifacts.push(await artifact("controller-golden-packet-report", goldenPacket.reportPath, "promotion_decision", false));
        outputSummary = ready
          ? `Study is locally review-ready and promotion gates are satisfied; controller self-evaluation=${selfEvaluation.status} score=${selfEvaluation.score}; completion audit=${completionAudit.status}; golden packet written.`
          : `Study is not promotable yet; readiness=${readiness || "missing"} review=${reviewVerdict || "missing"}${reviewPromotion.finding ? ` (${reviewPromotion.finding})` : ""} self-evaluation=${selfEvaluation.status}; completion audit=${completionAudit.status}; golden packet written.`;
        nextStage = ready ? "complete" : state.policy.autonomy === "aggressive" ? "human_review" : "human_review";
        break;
      }
      case "stop_for_human":
        status = "skipped";
        outputSummary = decision.rationale;
        nextStage = "human_review";
        break;
      case "complete":
        outputSummary = "Controller completed the study loop.";
        nextStage = "complete";
        break;
      case "block":
        outputSummary = decision.rationale;
        nextStage = "blocked";
        break;
    }
  } catch (caught) {
    status = "failed";
    error = caught instanceof Error ? caught.message : String(caught);
    outputSummary = `Action failed: ${error}`;
    nextStage = state.policy.autonomy === "aggressive" ? "human_review" : "blocked";
  }
  return {
    decisionId: decision.id,
    action: decision.action,
    status,
    startedAtIso,
    finishedAtIso: nowIso(),
    commandSummary: commandSummaryForAction(decision.action, state),
    outputSummary,
    artifacts,
    error,
    nextStage,
  };
}

async function executeTerminalDecision(state: ControllerState, action: "block" | "stop_for_human", rationale: string, gateResult: ControllerGate): Promise<ControllerState> {
  const decision: ControllerDecision = {
    id: decisionId(state, "deterministic"),
    stage: state.currentStage,
    source: "deterministic",
    action,
    rationale,
    confidence: 1,
    expectedArtifacts: [],
    riskFlags: gateResult.reasons,
    modelRawPath: null,
    inputPatch: null,
    patchValidation: { status: "not_requested", reasons: [] },
    toolRequests: [],
    toolValidation: { status: "not_requested", reasons: [] },
  };
  state.decisions.push(decision);
  state.actions.push({
    decisionId: decision.id,
    action,
    status: "skipped",
    startedAtIso: nowIso(),
    finishedAtIso: nowIso(),
    commandSummary: action,
    outputSummary: rationale,
    artifacts: [],
    error: null,
    nextStage: action === "block" ? "blocked" : "human_review",
  });
  state.currentStage = action === "block" ? "blocked" : "human_review";
  state.status = action === "block" ? "blocked" : "needs_human_review";
  state.stopReason = rationale;
  state.updatedAtIso = nowIso();
  state.nextRecommendedAction = nextRecommendedAction(state);
  return state;
}

function deterministicDecision(state: ControllerState, gateResult: ControllerGate): ControllerDecision {
  const action: ControllerActionType = stageAction(state.currentStage, gateResult);
  return {
    id: decisionId(state, "deterministic"),
    stage: state.currentStage,
    source: "deterministic",
    action,
    rationale: rationaleForAction(action, state, gateResult),
    confidence: gateResult.status === "pass" ? 0.92 : 0.72,
    expectedArtifacts: expectedArtifactsForAction(action),
    riskFlags: gateResult.status === "warning" ? gateResult.reasons : [],
    modelRawPath: null,
    inputPatch: null,
    patchValidation: { status: "not_requested", reasons: [] },
    toolRequests: [],
    toolValidation: { status: "not_requested", reasons: [] },
  };
}

function stageAction(stage: ControllerStage, gateResult: ControllerGate): ControllerActionType {
  if (gateResult.status === "block") return "block";
  switch (stage) {
    case "intake": return "initialize";
    case "context": return "context_preflight";
    case "dataset_feasibility": return "table_summary";
    case "exploration": return "explore";
    case "literature": return "literature_search";
    case "method_selection": return "select_method";
    case "execution": return "run_analysis";
    case "qa": return "method_qa";
    case "manuscript": return "write_manuscript";
    case "literature_qa": return "literature_qa";
    case "external_review": return "external_review";
    case "repair": return "apply_repairs";
    case "inspection": return "inspect_run";
    case "promotion_decision": return "decide_promotion";
    default: return "stop_for_human";
  }
}

function allowedActionForStage(stage: ControllerStage, action: ControllerActionType): boolean {
  return stageAction(stage, gate(stage, "pass", "", [], [], stage)) === action || action === "stop_for_human" || action === "block";
}

function buildControllerPolicy(opts: ControllerInitOptions): ControllerPolicy {
  const autonomy = reviewAutonomySchema.parse(opts.autonomy ?? "aggressive");
  return {
    autonomy,
    maxSteps: opts.maxSteps ?? 16,
    minRows: opts.minRows ?? 30,
    maxRequiredVariableMissingness: opts.maxRequiredVariableMissingness ?? 0.4,
    allowExecution: opts.allowExecution ?? true,
    allowExternalReview: opts.allowExternalReview ?? false,
    requireExternalReviewForPromotion: opts.requireExternalReviewForPromotion ?? false,
    mockExternalReview: opts.mockExternalReview ?? false,
    allowAutoRepair: opts.allowAutoRepair ?? true,
    maxAutoRepairs: opts.maxAutoRepairs ?? 2,
    allowInputPatches: opts.allowInputPatches ?? true,
    maxInputPatches: opts.maxInputPatches ?? 10,
    allowToolActions: opts.allowToolActions ?? true,
    maxToolActions: opts.maxToolActions ?? 8,
    allowedToolIds: opts.allowedToolIds ?? ["npm-build", "npm-test", "controller-status", "controller-inspect", "controller-read-artifact", "controller-read-file", "controller-search-repo", "controller-run-agenteer", "controller-git-diff", "controller-propose-patch", "controller-apply-patch", "controller-verify-patch", "controller-rollback-patch"],
    toolTimeoutMs: opts.toolTimeoutMs ?? 120000,
    allowContext: opts.allowContext ?? false,
    requireContext: opts.requireContext ?? false,
    contextRepo: opts.contextRepo ? path.resolve(opts.contextRepo) : null,
    contextTarget: opts.contextTarget ?? null,
    contextBin: opts.contextBin ? path.resolve(opts.contextBin) : null,
    autocontextRoot: opts.autocontextRoot ? path.resolve(opts.autocontextRoot) : null,
    contextBudgetTokens: opts.contextBudgetTokens ?? 4000,
    allowLiterature: opts.allowLiterature ?? false,
    literatureBaseUrl: opts.literatureBaseUrl ?? null,
    literatureEndpoint: opts.literatureEndpoint ?? "/api/search",
    literatureDepth: opts.literatureDepth ?? "standard",
    literatureTopK: opts.literatureTopK ?? 12,
    literatureTimeoutMs: opts.literatureTimeoutMs ?? 120000,
    literatureMockResponsePath: opts.literatureMockResponsePath ? path.resolve(opts.literatureMockResponsePath) : null,
    reviewPanel: opts.reviewPanel ?? "deepseek-dual",
    reviewStage: reviewStageSchema.parse(opts.reviewStage ?? "final"),
    reviewerBudget: { maxPerCallUsd: 0.5, maxPanelUsd: 2, maxStudyLoopUsd: 5, ...definedBudget(opts.reviewerBudget) },
    controllerBudget: { maxPerCallUsd: 0.5, maxPanelUsd: 2, maxStudyLoopUsd: 5, ...definedBudget(opts.controllerBudget) },
    requireControllerModel: opts.requireControllerModel ?? false,
    controller: {
      provider: opts.controller?.provider ?? "openai",
      model: opts.controller?.model ?? "gpt-5.4",
      enabled: opts.controller?.enabled ?? false,
      maxInputChars: opts.controller?.maxInputChars ?? 48000,
      maxOutputTokens: opts.controller?.maxOutputTokens ?? 1200,
      timeoutMs: opts.controller?.timeoutMs ?? 90000,
    },
  };
}

async function applyControllerPolicyOverrides(state: ControllerState, opts: ControllerInitOptions, reason: string): Promise<ControllerPolicyUpdate | null> {
  const beforeHash = stableHash(state.policy);
  const changedFields: ControllerPolicyUpdate["changedFields"] = [];
  const set = <K extends keyof ControllerPolicy>(field: K, value: ControllerPolicy[K] | undefined) => {
    if (value === undefined) return;
    const before = state.policy[field];
    if (JSON.stringify(before) === JSON.stringify(value)) return;
    state.policy[field] = value;
    changedFields.push({ field: String(field), before, after: value });
  };
  const setBudget = (budgetField: "reviewerBudget" | "controllerBudget", value: Partial<ReviewerBudget> | undefined) => {
    const defined = definedBudget(value);
    for (const [key, after] of Object.entries(defined)) {
      const budgetKey = key as keyof ReviewerBudget;
      const before = state.policy[budgetField][budgetKey];
      if (before === after) continue;
      state.policy[budgetField] = { ...state.policy[budgetField], [budgetKey]: after };
      changedFields.push({ field: `${budgetField}.${budgetKey}`, before, after });
    }
  };
  const setController = <K extends keyof ControllerModelConfig>(field: K, value: ControllerModelConfig[K] | undefined) => {
    if (value === undefined) return;
    const before = state.policy.controller[field];
    if (JSON.stringify(before) === JSON.stringify(value)) return;
    state.policy.controller = { ...state.policy.controller, [field]: value };
    changedFields.push({ field: `controller.${String(field)}`, before, after: value });
  };

  set("autonomy", opts.autonomy ? reviewAutonomySchema.parse(opts.autonomy) : undefined);
  set("maxSteps", opts.maxSteps);
  set("minRows", opts.minRows);
  set("maxRequiredVariableMissingness", opts.maxRequiredVariableMissingness);
  set("allowExecution", opts.allowExecution);
  set("allowExternalReview", opts.allowExternalReview);
  set("requireExternalReviewForPromotion", opts.requireExternalReviewForPromotion);
  set("mockExternalReview", opts.mockExternalReview);
  set("allowAutoRepair", opts.allowAutoRepair);
  set("maxAutoRepairs", opts.maxAutoRepairs);
  set("allowInputPatches", opts.allowInputPatches);
  set("maxInputPatches", opts.maxInputPatches);
  set("allowToolActions", opts.allowToolActions);
  set("maxToolActions", opts.maxToolActions);
  set("allowedToolIds", opts.allowedToolIds);
  set("toolTimeoutMs", opts.toolTimeoutMs);
  set("allowContext", opts.allowContext);
  set("requireContext", opts.requireContext);
  set("contextRepo", opts.contextRepo ? path.resolve(opts.contextRepo) : undefined);
  set("contextTarget", opts.contextTarget ?? undefined);
  set("contextBin", opts.contextBin ? path.resolve(opts.contextBin) : undefined);
  set("autocontextRoot", opts.autocontextRoot ? path.resolve(opts.autocontextRoot) : undefined);
  set("contextBudgetTokens", opts.contextBudgetTokens);
  set("allowLiterature", opts.allowLiterature);
  set("literatureBaseUrl", opts.literatureBaseUrl ?? undefined);
  set("literatureEndpoint", opts.literatureEndpoint ?? undefined);
  set("literatureDepth", opts.literatureDepth);
  set("literatureTopK", opts.literatureTopK);
  set("literatureTimeoutMs", opts.literatureTimeoutMs);
  set("literatureMockResponsePath", opts.literatureMockResponsePath ? path.resolve(opts.literatureMockResponsePath) : undefined);
  set("reviewPanel", opts.reviewPanel);
  set("reviewStage", opts.reviewStage ? reviewStageSchema.parse(opts.reviewStage) : undefined);
  set("requireControllerModel", opts.requireControllerModel);
  setBudget("reviewerBudget", opts.reviewerBudget);
  setBudget("controllerBudget", opts.controllerBudget);
  setController("provider", opts.controller?.provider);
  setController("model", opts.controller?.model);
  setController("enabled", opts.controller?.enabled);
  setController("maxInputChars", opts.controller?.maxInputChars);
  setController("maxOutputTokens", opts.controller?.maxOutputTokens);
  setController("timeoutMs", opts.controller?.timeoutMs);

  if (!changedFields.length) return null;
  const invalidatedStages = invalidatedStagesForPolicyUpdate(changedFields.map(change => change.field), state.completedStages);
  pruneInvalidatedControllerState(state, invalidatedStages);
  const updateId = `policy_update_${String(state.policyUpdates.length + 1).padStart(3, "0")}`;
  const outPath = path.join(state.rootDir, `${updateId}.json`);
  const record: ControllerPolicyUpdate = {
    schemaVersion: 1,
    generatedAtIso: nowIso(),
    updateId,
    reason,
    changedFields,
    invalidatedStages,
    beforeHash,
    afterHash: stableHash(state.policy),
    outPath,
  };
  await writeJson(outPath, { schemaVersion: 1, controllerPolicyUpdate: record });
  return record;
}

function definedBudget(value: Partial<ReviewerBudget> | undefined): Partial<ReviewerBudget> {
  return Object.fromEntries(Object.entries(value ?? {}).filter(([, item]) => typeof item === "number" && Number.isFinite(item))) as Partial<ReviewerBudget>;
}

function gate(stage: ControllerStage, status: ControllerGate["status"], label: string, reasons: string[], evidenceRefs: string[], nextStage: ControllerStage): ControllerGate {
  return { stage, status, label, reasons, evidenceRefs, nextStage };
}

function requiredVariableNames(state: ControllerState): string[] {
  return [...new Set([
    state.inputs.outcome,
    state.inputs.exposure,
    state.inputs.group,
    state.inputs.time,
    state.inputs.start,
    state.inputs.stop,
    state.inputs.event,
    state.inputs.id,
    state.inputs.strata,
    state.inputs.cluster,
    state.inputs.period,
    state.inputs.post,
    state.inputs.runningVariable,
    state.inputs.instrument,
    state.inputs.weight,
    state.inputs.offset,
    ...state.inputs.variables,
    ...state.inputs.covariates,
    ...state.inputs.exactCovariates,
  ].filter((value): value is string => Boolean(value)))];
}

function controllerModelingRoleHints(state: ControllerState): ModelingDecisionRequest["roleHints"] {
  return {
    outcome: state.inputs.outcome ?? undefined,
    exposure: state.inputs.exposure ?? undefined,
    group: state.inputs.group ?? undefined,
    time: state.inputs.time ?? undefined,
    start: state.inputs.start ?? undefined,
    stop: state.inputs.stop ?? undefined,
    event: state.inputs.event ?? undefined,
    id: state.inputs.id ?? undefined,
    cluster: state.inputs.cluster ?? undefined,
    strata: state.inputs.strata ?? undefined,
    period: state.inputs.period ?? undefined,
    post: state.inputs.post ?? undefined,
    runningVariable: state.inputs.runningVariable ?? undefined,
    instrument: state.inputs.instrument ?? undefined,
    weight: state.inputs.weight ?? undefined,
    offset: state.inputs.offset ?? undefined,
    variables: state.inputs.variables,
    covariates: state.inputs.covariates,
    exactCovariates: state.inputs.exactCovariates,
  };
}

function missingControllerMethodArguments(method: StatsMethod, state: ControllerState): string[] {
  const requiredArguments = getStatisticalMethodSpec(method).requiredArguments;
  return requiredArguments.filter(argument => !controllerMethodArgumentPresent(method, argument, state));
}

function controllerMethodArgumentPresent(method: StatsMethod, argument: string, state: ControllerState): boolean {
  const mapped = contractArgumentNameFor(argument);
  if (mapped === "outcome") return Boolean(state.inputs.outcome);
  if (mapped === "exposure") return Boolean(state.inputs.exposure);
  if (mapped === "group") return Boolean(state.inputs.group);
  if (mapped === "time") return Boolean(state.inputs.time);
  if (mapped === "timeOrStop") return Boolean(state.inputs.time || state.inputs.stop);
  if (mapped === "start") return Boolean(state.inputs.start);
  if (mapped === "stop") return Boolean(state.inputs.stop);
  if (mapped === "event") return Boolean(state.inputs.event);
  if (mapped === "id") return Boolean(state.inputs.id);
  if (mapped === "strata") return Boolean(state.inputs.strata);
  if (mapped === "period") return Boolean(state.inputs.period);
  if (mapped === "post") return Boolean(state.inputs.post);
  if (mapped === "instrument") return Boolean(state.inputs.instrument);
  if (mapped === "runningVariable") return Boolean(state.inputs.runningVariable);
  if (mapped === "cutoff") return state.inputs.cutoff !== undefined && state.inputs.cutoff !== null && Number.isFinite(state.inputs.cutoff);
  if (mapped === "covariates") return state.inputs.covariates.length > 0;
  if (mapped === "clusterOrId") return Boolean(state.inputs.cluster || state.inputs.id);
  if (mapped === "variables") {
    if (method === "paired-t-test" || method === "wilcoxon") return state.inputs.variables.length >= 2;
    if (method === "friedman" || method === "repeated-measures-anova") return state.inputs.variables.length >= 3;
    return state.inputs.variables.length > 0 || requiredVariableNames(state).length > 0;
  }
  return false;
}

function inferOutcomeType(state: ControllerState): "binary" | "continuous" | "categorical" | "count" | "time_to_event" | "unknown" {
  if ((state.inputs.time || state.inputs.stop) && state.inputs.event) return "time_to_event";
  const text = `${state.inputs.question} ${state.inputs.outcome ?? ""}`.toLowerCase();
  if (/mortality|death|died|readmission|event|yes\/no|binary|stroke|mi\b/.test(text)) return "binary";
  if (/count|number of|visits|hospitalizations/.test(text)) return "count";
  if (/category|class|multiclass|ordinal/.test(text)) return "categorical";
  if (state.inputs.outcome) return "continuous";
  return "unknown";
}

function statsMethodFromSelection(methodId: string | null): StatsMethod | null {
  if (!methodId) return null;
  const direct = statsMethodSchema.safeParse(methodId);
  if (direct.success) return direct.data;
  const map: Record<string, StatsMethod> = {
    "binary-logistic-regression": "logistic-regression",
    "linear-regression": "linear-regression",
    "cox-proportional-hazards": "cox-proportional-hazards",
    "survey-weighted-descriptive-summary": "descriptive",
    "propensity-score-matching": "propensity-score-matching",
    "propensity-score-weighting": "propensity-score-weighting",
    "diagnostic-accuracy": "diagnostic-accuracy",
  };
  return map[methodId] ?? null;
}

function selectControllerExecutableStatsMethod(
  explicitMethod: StatsMethod | null,
  modelingPlan: ModelingDecisionPlan,
  selection: MethodSelectionResult,
): { method: StatsMethod | null; source: string; unmappedMethodId: string | null } {
  if (explicitMethod) return { method: explicitMethod, source: "explicit-controller-input", unmappedMethodId: null };

  const guidanceMethodId = modelingPlan.statisticalMethodGuidance.recommendedStatsRunMethod;
  const guidanceMethod = modelingPlan.statisticalMethodGuidance.blockers.length === 0
    ? statsMethodFromSelection(guidanceMethodId)
    : null;
  if (guidanceMethod) return { method: guidanceMethod, source: "data-aware-statistical-guidance", unmappedMethodId: null };

  const modelingEvidenceMethodId = modelingPlan.methodSelectionEvidence.primaryMethodId;
  const modelingEvidenceMethod = statsMethodFromSelection(modelingEvidenceMethodId);
  if (modelingEvidenceMethod) return { method: modelingEvidenceMethod, source: "method-selection-evidence", unmappedMethodId: null };

  const selectionMethodId = selection.primary?.method.id ?? null;
  const selectionMethod = statsMethodFromSelection(selectionMethodId);
  if (selectionMethod) return { method: selectionMethod, source: "method-catalog-selection", unmappedMethodId: null };

  return {
    method: null,
    source: "unmapped",
    unmappedMethodId: guidanceMethodId ?? modelingEvidenceMethodId ?? selectionMethodId,
  };
}

async function runControllerContextPreflight(state: ControllerState): Promise<AgentContextPreflight> {
  const repo = state.policy.contextRepo ?? repoRootFromState(state);
  return agentContextPreflightCommand(repo, state.inputs.question, {
    target: state.policy.contextTarget ?? undefined,
    contextBin: state.policy.contextBin ?? undefined,
    autocontextRoot: state.policy.autocontextRoot ?? undefined,
    budget: state.policy.contextBudgetTokens,
  });
}

async function controllerTableSummaryForModeling(state: ControllerState): Promise<ModelingDecisionRequest["tableSummary"] | undefined> {
  const raw = await readJsonIfPresent(path.join(state.rootDir, "table-summary.json"));
  const summary = valueAtPath(raw, "tableSummary") ?? raw;
  if (!summary || typeof summary !== "object") return undefined;
  const record = summary as Record<string, unknown>;
  if (!Array.isArray(record.columns)) return undefined;
  const rowCount = typeof record.rowCount === "number" ? record.rowCount : null;
  const columnCount = typeof record.columnCount === "number" ? record.columnCount : record.columns.length;
  if (rowCount == null || rowCount < 0) return undefined;
  return {
    rowCount,
    columnCount,
    columns: record.columns.map(column => {
      const item = column && typeof column === "object" ? column as Record<string, unknown> : {};
      const inferred = typeof item.inferredType === "string" && ["number", "string", "boolean", "empty", "mixed", "unknown"].includes(item.inferredType) ? item.inferredType as "number" | "string" | "boolean" | "empty" | "mixed" | "unknown" : "unknown";
      const finiteNumber = (value: unknown): number | undefined => typeof value === "number" && Number.isFinite(value) ? value : undefined;
      return {
        name: typeof item.name === "string" ? item.name : "unknown",
        inferredType: inferred,
        nonMissingRows: typeof item.nonMissingRows === "number" ? item.nonMissingRows : 0,
        missingFraction: typeof item.missingFraction === "number" ? Math.max(0, Math.min(1, item.missingFraction)) : 1,
        uniqueCount: typeof item.uniqueCount === "number" && item.uniqueCount >= 0 ? Math.floor(item.uniqueCount) : undefined,
        valueCounts: Array.isArray(item.valueCounts)
          ? item.valueCounts.map(valueCount => {
            const valueRecord = valueCount && typeof valueCount === "object" ? valueCount as Record<string, unknown> : {};
            const count = typeof valueRecord.count === "number" && Number.isFinite(valueRecord.count) ? Math.max(0, Math.floor(valueRecord.count)) : 0;
            return {
              value: String(valueRecord.value ?? ""),
              count,
              fraction: typeof valueRecord.fraction === "number" && Number.isFinite(valueRecord.fraction) ? Math.max(0, Math.min(1, valueRecord.fraction)) : 0,
            };
          }).filter(valueCount => valueCount.value !== "" && valueCount.count > 0).slice(0, 20)
          : [],
        sampleValues: Array.isArray(item.sampleValues) ? item.sampleValues.map(value => String(value)).slice(0, 12) : [],
        min: finiteNumber(item.min),
        max: finiteNumber(item.max),
        mean: finiteNumber(item.mean),
        variance: finiteNumber(item.variance),
        sd: finiteNumber(item.sd),
        median: finiteNumber(item.median),
        q1: finiteNumber(item.q1),
        q3: finiteNumber(item.q3),
        iqr: finiteNumber(item.iqr),
        zeroFraction: finiteNumber(item.zeroFraction),
        skewness: finiteNumber(item.skewness),
        outlierFraction: finiteNumber(item.outlierFraction),
      };
    }),
  };
}

async function controllerLiteratureEvidenceForModeling(state: ControllerState): Promise<ModelingDecisionRequest["literatureEvidence"] | undefined> {
  if (!state.policy.allowLiterature) return undefined;
  const contextPath = path.join(state.rootDir, "literature", "literature-context.json");
  const raw = await readJsonIfPresent(contextPath);
  const context = valueAtPath(raw, "literatureContext") ?? raw;
  if (!context || typeof context !== "object") return undefined;
  const record = context as Record<string, unknown>;
  const sourceSummary = record.sourceSummary && typeof record.sourceSummary === "object" ? record.sourceSummary as Record<string, unknown> : {};
  const quality = record.quality && typeof record.quality === "object" ? record.quality as Record<string, unknown> : {};
  const status = record.status === "ready" || record.status === "needs_more_evidence" || record.status === "failed" ? record.status : "failed";
  const evidenceStrength = record.evidenceStrength === "none" || record.evidenceStrength === "sparse" || record.evidenceStrength === "adequate" || record.evidenceStrength === "strong" ? record.evidenceStrength : "none";
  const issues = Array.isArray(record.issues) ? record.issues : [];
  return {
    path: contextPath,
    status,
    evidenceStrength,
    sourceCount: typeof sourceSummary.sourceCount === "number" ? sourceSummary.sourceCount : 0,
    highQualitySourceCount: typeof sourceSummary.highQualitySourceCount === "number" ? sourceSummary.highQualitySourceCount : 0,
    latestPublicationYear: typeof sourceSummary.latestPublicationYear === "number" ? sourceSummary.latestPublicationYear : null,
    questionTokenCoverage: typeof quality.questionTokenCoverage === "number" ? Math.max(0, Math.min(1, quality.questionTokenCoverage)) : 0,
    designSignals: Array.isArray(record.designSignals) ? record.designSignals.map(item => String(item)) : [],
    methodSignals: Array.isArray(record.methodSignals) ? record.methodSignals.map(item => String(item)) : [],
    planningImplications: Array.isArray(record.planningImplications) ? record.planningImplications.map(item => String(item)) : [],
    followUpSearches: Array.isArray(record.followUpSearches) ? record.followUpSearches.map(item => String(item)) : [],
    issueCodes: issues.map(issue => issue && typeof issue === "object" ? String((issue as Record<string, unknown>).id ?? "") : "").filter(Boolean),
  };
}

async function controllerFeasibilityEvidenceForModeling(state: ControllerState): Promise<ModelingDecisionRequest["feasibilityEvidence"] | undefined> {
  const feasibility = await loadControllerFeasibilitySummary(state);
  if (!feasibility.present) return undefined;
  return {
    path: feasibility.path ?? undefined,
    verdict: feasibility.verdict,
    status: feasibility.status,
    score: feasibility.score,
    confidence: feasibility.confidence,
    blockers: feasibility.blockers,
    warnings: feasibility.warnings,
    issueCodes: feasibility.issueCodes,
    requiredModifications: feasibility.requiredModifications,
    nextAction: feasibility.nextAction,
  };
}

function commandSummaryForAction(action: ControllerActionType, state: ControllerState): string {
  switch (action) {
    case "context_preflight": return `agent context-preflight --repo ${state.policy.contextRepo ?? repoRootFromState(state)}`;
    case "explore": return `research explore --data ${state.inputs.dataPath ?? "(missing)"}`;
    case "literature_search": return `research literature-search --question ${JSON.stringify(state.inputs.question)}`;
    case "select_method": return "research method-select";
    case "run_analysis": return `research stats-run --method ${state.inputs.method ?? "(missing)"}`;
    case "method_qa": return `research method-qa --run-dir ${state.inputs.runDir}`;
    case "write_manuscript": return `research manuscript --run-dir ${state.inputs.runDir}`;
    case "literature_qa": return `research literature-qa --literature ${path.join(state.rootDir, "literature", "literature-search.json")}`;
    case "external_review": return `research study-critic --run-dir ${state.inputs.runDir} --panel ${state.policy.reviewPanel}`;
    case "apply_repairs": return `research controller internal-repair --run-dir ${state.inputs.runDir}`;
    case "inspect_run": return `research run-inspect --run-dir ${state.inputs.runDir}`;
    default: return action;
  }
}

async function writeControllerRepairPlan(state: ControllerState, review: StudyCriticResult): Promise<string> {
  const repairPlanPath = path.join(state.inputs.runDir, "review", "controller-repair-plan.json");
  const accepted = review.adjudication.acceptedFindings.map(finding => ({
    findingId: finding.id,
    severity: finding.severity,
    category: finding.category,
    title: finding.title,
    action: finding.actionableFix,
    reentryPoint: finding.reentryPoint,
    deterministicVerification: finding.deterministicVerification,
    supportCount: finding.supportCount,
    reviewerIds: finding.reviewerIds,
  }));
  await writeJson(repairPlanPath, {
    schemaVersion: 1,
    controllerRepairPlan: {
      generatedAtIso: nowIso(),
      runId: state.runId,
      reviewPanelPath: review.generatedFiles.panel,
      adjudicationPath: review.generatedFiles.adjudication,
      autonomy: state.policy.autonomy,
      verdict: review.adjudication.verdict,
      acceptedFindings: accepted,
      autoRepairPolicy: state.policy.autonomy === "aggressive"
        ? "The controller may re-enter one earlier deterministic stage when the reviewer supplies an actionable reentry point; repeated reviewer failures stop for human review."
        : "The controller records repairs but requires human review before re-entry.",
      reviewReentryPoint: review.adjudication.reentryPoint,
      nextStage: mapReviewReentryToControllerStage(review.adjudication.reentryPoint),
    },
  });
  return repairPlanPath;
}

function mapReviewReentryToControllerStage(point: ReviewReentryPoint): ControllerStage {
  const map: Record<ReviewReentryPoint, ControllerStage> = {
    exploration: "exploration",
    protocol: "method_selection",
    analysis_spec: "method_selection",
    dataset_feasibility: "dataset_feasibility",
    method_selection: "method_selection",
    execution: "execution",
    qa: "qa",
    manuscript: "manuscript",
    literature: "human_review",
    human_review: "human_review",
    promotion: "promotion_decision",
  };
  return map[point];
}

function previousExternalReviewFailures(state: ControllerState): number {
  return state.actions.filter(action => action.action === "external_review" && /External review (revise|block)/.test(action.outputSummary)).length;
}

function latestControllerActionIndex(state: ControllerState, action: ControllerActionType): number {
  for (let index = state.actions.length - 1; index >= 0; index -= 1) {
    if (state.actions[index]?.action === action) return index;
  }
  return -1;
}

function externalReviewPromotionStatus(state: ControllerState, reviewVerdict: string): {
  applicable: boolean;
  auditStatus: ControllerCompletionAudit["requirements"][number]["status"];
  promotionSatisfied: boolean;
  finding: string;
} {
  const applicable = state.policy.requireExternalReviewForPromotion || state.policy.allowExternalReview;
  if (!applicable) {
    return {
      applicable: false,
      auditStatus: "not_applicable",
      promotionSatisfied: true,
      finding: "External review was not required.",
    };
  }
  if (!reviewVerdict) {
    return {
      applicable: true,
      auditStatus: "failed",
      promotionSatisfied: false,
      finding: state.policy.requireExternalReviewForPromotion ? "Required external review adjudication is missing." : "External review was enabled but adjudication is missing.",
    };
  }
  if (reviewVerdict !== "pass") {
    return {
      applicable: true,
      auditStatus: "failed",
      promotionSatisfied: false,
      finding: `External review adjudication is unresolved (${reviewVerdict}); repair, re-review, or record explicit human acceptance before promotion.`,
    };
  }
  const latestReviewIndex = latestControllerActionIndex(state, "external_review");
  const latestRepairIndex = latestControllerActionIndex(state, "apply_repairs");
  if (latestRepairIndex >= 0 && latestReviewIndex >= 0 && latestRepairIndex > latestReviewIndex) {
    return {
      applicable: true,
      auditStatus: "failed",
      promotionSatisfied: false,
      finding: "External review passed before the latest repair; rerun external review on the repaired artifacts before promotion.",
    };
  }
  return {
    applicable: true,
    auditStatus: "proved",
    promotionSatisfied: true,
    finding: "External review adjudication passed and is current for recorded repairs.",
  };
}

function nextStageAfterReviewerRepair(state: ControllerState, plannedNext: ControllerStage, status: ControllerRepairExecution["status"]): ControllerStage {
  if (status === "failed" || status === "skipped") return "human_review";
  if (!state.policy.allowExternalReview) return plannedNext;
  if (plannedNext === "human_review" || plannedNext === "blocked" || plannedNext === "complete") return plannedNext;
  if (plannedNext === "inspection" || plannedNext === "promotion_decision" || plannedNext === "external_review") return "external_review";
  return plannedNext;
}

async function applyControllerRepairs(state: ControllerState): Promise<ControllerRepairExecution> {
  const planPath = path.join(state.inputs.runDir, "review", "controller-repair-plan.json");
  const rawPlan = await readJsonIfPresent(planPath);
  const plan = valueAtPath(rawPlan, "controllerRepairPlan") as Record<string, unknown> | null;
  const acceptedFindings = Array.isArray(plan?.acceptedFindings) ? plan.acceptedFindings : [];
  const executedRepairs: ControllerRepairExecution["executedRepairs"] = [];
  const skippedFindings: ControllerRepairExecution["skippedFindings"] = [];
  const plannedNext = typeof plan?.nextStage === "string" && controllerStageSchema.safeParse(plan.nextStage).success
    ? plan.nextStage as ControllerStage
    : typeof plan?.reviewReentryPoint === "string"
      ? mapReviewReentryToControllerStage(plan.reviewReentryPoint as ReviewReentryPoint)
      : "inspection";
  let nextStage = plannedNext;
  for (const rawFinding of acceptedFindings) {
    const finding = normalizeRepairFinding(rawFinding);
    const pluginId = repairPluginForFinding(finding);
    if (!pluginId) {
      skippedFindings.push({ findingId: finding.findingId, reason: "No bounded deterministic repair plugin is registered for this finding category/reentry point.", reentryPoint: finding.reentryPoint });
      continue;
    }
    try {
      const artifactRefs = await runRepairPlugin(pluginId, state);
      executedRepairs.push({ findingId: finding.findingId, pluginId, status: "succeeded", reason: `Executed ${pluginId}.`, artifactRefs });
    } catch (error) {
      executedRepairs.push({ findingId: finding.findingId, pluginId, status: "failed", reason: error instanceof Error ? error.message : String(error), artifactRefs: [] });
    }
  }
  if (executedRepairs.some(item => item.status === "failed")) nextStage = "human_review";
  const status: ControllerRepairExecution["status"] = executedRepairs.length === 0
    ? "skipped"
    : executedRepairs.every(item => item.status === "succeeded")
      ? "succeeded"
      : executedRepairs.some(item => item.status === "succeeded")
        ? "partial"
        : "failed";
  const verifiedNextStage = nextStageAfterReviewerRepair(state, nextStage, status);
  const outPath = path.join(state.inputs.runDir, "review", `controller-repair-execution-${String(state.repairs.length + 1).padStart(2, "0")}.json`);
  const result: ControllerRepairExecution = {
    schemaVersion: 1,
    generatedAtIso: nowIso(),
    repairId: `repair_${String(state.repairs.length + 1).padStart(2, "0")}`,
    sourceReviewPath: planPath,
    status,
    stageBeforeRepair: state.currentStage,
    nextStage: verifiedNextStage,
    executedRepairs,
    skippedFindings,
    outPath,
  };
  await writeJson(outPath, { schemaVersion: 1, controllerRepairExecution: result });
  return result;
}

async function writeControllerRepairVerification(state: ControllerState, repair: ControllerRepairExecution): Promise<ControllerRepairVerification> {
  const checks: ControllerRepairVerification["checks"] = [];
  const add = (id: string, status: "pass" | "warning" | "fail", message: string, evidenceRefs: string[] = []) => {
    checks.push({ id, status, message, evidenceRefs: uniqueText(evidenceRefs.filter(Boolean)) });
  };
  const acceptedFindings = repair.executedRepairs.length + repair.skippedFindings.length;
  const succeededRepairs = repair.executedRepairs.filter(item => item.status === "succeeded");
  const failedRepairs = repair.executedRepairs.filter(item => item.status === "failed");
  const allArtifactRefs = repair.executedRepairs.flatMap(item => item.artifactRefs);
  const missingArtifactRefs: string[] = [];
  for (const ref of uniqueText(allArtifactRefs)) {
    if (!await pathExists(ref)) missingArtifactRefs.push(ref);
  }
  add(
    "accepted-findings-accounted",
    acceptedFindings > 0 ? "pass" : "fail",
    acceptedFindings > 0 ? `${acceptedFindings} accepted reviewer finding(s) were accounted for by repair execution.` : "No accepted reviewer findings were accounted for by repair execution.",
    [repair.outPath],
  );
  add(
    "repair-plugin-success",
    failedRepairs.length ? "fail" : succeededRepairs.length ? "pass" : "warning",
    failedRepairs.length
      ? `${failedRepairs.length} bounded repair plugin(s) failed.`
      : succeededRepairs.length ? `${succeededRepairs.length} bounded repair plugin(s) succeeded.` : "No bounded repair plugin succeeded.",
    [repair.outPath, ...succeededRepairs.flatMap(item => item.artifactRefs)],
  );
  add(
    "skipped-findings",
    repair.skippedFindings.length ? "fail" : "pass",
    repair.skippedFindings.length ? `${repair.skippedFindings.length} accepted reviewer finding(s) were skipped and require human review.` : "No accepted reviewer findings were skipped.",
    [repair.outPath],
  );
  add(
    "repair-artifact-refs-exist",
    missingArtifactRefs.length ? "fail" : allArtifactRefs.length ? "pass" : "warning",
    missingArtifactRefs.length
      ? `${missingArtifactRefs.length} repair artifact reference(s) are missing.`
      : allArtifactRefs.length ? `${uniqueText(allArtifactRefs).length} repair artifact reference(s) exist.` : "Repair execution did not produce artifact references.",
    missingArtifactRefs.length ? missingArtifactRefs : allArtifactRefs,
  );
  const freshExternalReviewRequired = state.policy.allowExternalReview && repair.status !== "failed" && repair.status !== "skipped";
  add(
    "fresh-external-review-after-repair",
    freshExternalReviewRequired ? repair.nextStage === "external_review" ? "pass" : "warning" : "pass",
    freshExternalReviewRequired
      ? repair.nextStage === "external_review"
        ? "Repair routes back to external review for fresh reviewer validation."
        : `Repair routes to ${repair.nextStage}; deterministic verification must complete before fresh external review.`
      : "Fresh external review is not required by current policy or repair status.",
    [repair.outPath],
  );
  const status: ControllerRepairVerification["status"] = checks.some(check => check.status === "fail")
    ? "fail"
    : checks.some(check => check.status === "warning")
      ? "warning"
      : "pass";
  const outPath = path.join(state.inputs.runDir, "review", `controller-repair-verification-${String(state.repairs.length).padStart(2, "0")}.json`);
  const reportPath = path.join(state.inputs.runDir, "review", `controller-repair-verification-${String(state.repairs.length).padStart(2, "0")}.md`);
  const verification: ControllerRepairVerification = {
    schemaVersion: 1,
    generatedAtIso: nowIso(),
    verificationId: `repair_verification_${String(state.repairs.length).padStart(2, "0")}`,
    repairId: repair.repairId,
    repairExecutionPath: repair.outPath,
    status,
    checks,
    acceptedFindings,
    verifiedFindings: succeededRepairs.length,
    skippedFindings: repair.skippedFindings.length,
    failedRepairs: failedRepairs.length,
    missingArtifactRefs: missingArtifactRefs.length,
    freshExternalReviewRequired,
    nextAction: status === "fail"
      ? "Stop for human review of skipped, failed, or missing repair evidence before continuing."
      : freshExternalReviewRequired && repair.nextStage === "external_review"
        ? "Run external review on the repaired packet."
        : freshExternalReviewRequired
          ? `Continue deterministic verification at ${repair.nextStage}, then rerun external review.`
          : "Continue the controller loop.",
    outPath,
    reportPath,
  };
  await writeJson(outPath, { schemaVersion: 1, controllerRepairVerification: verification });
  await writeFile(reportPath, renderControllerRepairVerificationMarkdown(verification));
  return verification;
}

function renderControllerRepairVerificationMarkdown(verification: ControllerRepairVerification): string {
  return [
    "# Controller Repair Verification",
    "",
    `Status: ${verification.status}`,
    `Repair: ${verification.repairId}`,
    `Accepted findings: ${verification.acceptedFindings}`,
    `Verified findings: ${verification.verifiedFindings}`,
    `Skipped findings: ${verification.skippedFindings}`,
    `Failed repairs: ${verification.failedRepairs}`,
    `Missing artifact refs: ${verification.missingArtifactRefs}`,
    `Fresh external review required: ${verification.freshExternalReviewRequired}`,
    "",
    "## Checks",
    ...verification.checks.map(check => `- [${check.status}] ${check.id}: ${check.message}`),
    "",
    `Next action: ${verification.nextAction}`,
    "",
  ].join("\n");
}

function normalizeRepairFinding(value: unknown): { findingId: string; category: string; reentryPoint: string; action: string } {
  const record = value && typeof value === "object" ? value as Record<string, unknown> : {};
  return {
    findingId: typeof record.findingId === "string" ? record.findingId : `finding_${stableHash(record).slice(0, 8)}`,
    category: typeof record.category === "string" ? record.category : "unknown",
    reentryPoint: typeof record.reentryPoint === "string" ? record.reentryPoint : "human_review",
    action: typeof record.action === "string" ? record.action : "",
  };
}

function repairPluginForFinding(finding: { category: string; reentryPoint: string; action: string }): string | null {
  const text = `${finding.category} ${finding.reentryPoint} ${finding.action}`.toLowerCase();
  if (/manuscript|reporting|figures/.test(text)) return "regenerate-manuscript-and-qa";
  if (/qa|model_diagnostics|missingness|data_plausibility|reproducibility/.test(text)) return "refresh-method-qa-and-inspection";
  if (/method_selection|method_choice|analysis_spec|protocol|study_design/.test(text)) return "refresh-method-selection";
  if (/execution/.test(text)) return "rerun-analysis";
  if (/dataset_feasibility|cohort|variables/.test(text)) return "refresh-dataset-feasibility";
  return null;
}

async function runRepairPlugin(pluginId: string, state: ControllerState): Promise<string[]> {
  switch (pluginId) {
    case "regenerate-manuscript-and-qa": {
      const result = await researchManuscriptCommand({ runDir: state.inputs.runDir, outPath: path.join(state.inputs.runDir, "manuscript.md"), qaOutPath: path.join(state.inputs.runDir, "manuscript-qa.json") });
      return [result.manuscriptPath ?? path.join(state.inputs.runDir, "manuscript.md"), result.qaPath ?? path.join(state.inputs.runDir, "manuscript-qa.json")];
    }
    case "refresh-method-qa-and-inspection": {
      await researchMethodQaCommand({ runDir: state.inputs.runDir, outPath: path.join(state.inputs.runDir, "method-qa.json"), reportPath: path.join(state.inputs.runDir, "method-qa.md") });
      await researchRunInspectCommand({ runDir: state.inputs.runDir, outPath: path.join(state.inputs.runDir, "run-inspection.json"), reportPath: path.join(state.inputs.runDir, "run-inspection.md") });
      return [path.join(state.inputs.runDir, "method-qa.json"), path.join(state.inputs.runDir, "method-qa.md"), path.join(state.inputs.runDir, "run-inspection.json"), path.join(state.inputs.runDir, "run-inspection.md")];
    }
    case "refresh-method-selection": {
      const outcomeType = inferOutcomeType(state);
      const modelingPlan: ModelingDecisionPlan = buildModelingDecisionPlan({
        question: state.inputs.question,
        outcomeType: outcomeType === "unknown" ? undefined : outcomeType,
        surveyDesign: state.inputs.surveyDesign,
        timeToEvent: Boolean((state.inputs.time || state.inputs.stop) && state.inputs.event),
        dataStructures: ["single_table"],
        target: state.inputs.outcome ?? state.inputs.event ?? undefined,
        roleHints: controllerModelingRoleHints(state),
        tableSummary: await controllerTableSummaryForModeling(state),
        literatureEvidence: await controllerLiteratureEvidenceForModeling(state),
        feasibilityEvidence: await controllerFeasibilityEvidenceForModeling(state),
        requiresInference: true,
        maxCandidates: 12,
      });
      const modelingPlanPath = path.join(state.rootDir, `controller-modeling-plan-repair-${String(state.repairs.length + 1).padStart(2, "0")}.json`);
      await writeJson(modelingPlanPath, { schemaVersion: 1, modelingPlan });
      const selection = selectAnalysisMethods({
        question: state.inputs.question,
        outcomeType: outcomeType === "unknown" ? undefined : outcomeType,
        surveyDesign: state.inputs.surveyDesign,
        timeToEvent: Boolean((state.inputs.time || state.inputs.stop) && state.inputs.event),
        dataStructures: ["single_table"],
        maxCandidates: 8,
      });
      const selectionPath = path.join(state.rootDir, `method-selection-repair-${String(state.repairs.length + 1).padStart(2, "0")}.json`);
      await writeJson(selectionPath, { schemaVersion: 1, methodSelection: selection });
      const executable = selectControllerExecutableStatsMethod(state.inputs.method ?? null, modelingPlan, selection).method;
      if (executable) state.inputs.method = executable;
      return [modelingPlanPath, selectionPath];
    }
    case "rerun-analysis": {
      if (!state.inputs.dataPath || !state.inputs.method) throw new Error("Cannot rerun analysis without data path and selected method.");
      const result = await researchStatsRunCommand({
        method: state.inputs.method,
        dataPath: state.inputs.dataPath,
        outDir: state.inputs.runDir,
        outcome: state.inputs.outcome ?? undefined,
        exposure: state.inputs.exposure ?? undefined,
        group: state.inputs.group ?? undefined,
        outcomeThreshold: state.inputs.outcomeThreshold ?? undefined,
        exposureThreshold: state.inputs.exposureThreshold ?? undefined,
        variables: state.inputs.variables,
        covariates: state.inputs.covariates,
        exactCovariates: state.inputs.exactCovariates,
        estimand: "ATT",
        matchRatio: 1,
        replacement: false,
        trimThreshold: 0.01,
        stabilizeWeights: true,
        time: state.inputs.time ?? undefined,
        start: state.inputs.start ?? undefined,
        stop: state.inputs.stop ?? undefined,
        event: state.inputs.event ?? undefined,
        id: state.inputs.id ?? undefined,
        strata: state.inputs.strata ?? undefined,
        cluster: state.inputs.cluster ?? undefined,
        period: state.inputs.period ?? undefined,
        post: state.inputs.post ?? undefined,
        runningVariable: state.inputs.runningVariable ?? undefined,
        cutoff: state.inputs.cutoff ?? undefined,
        instrument: state.inputs.instrument ?? undefined,
        alphaPenalty: state.inputs.alphaPenalty ?? undefined,
        l1Ratio: state.inputs.l1Ratio ?? undefined,
        weight: state.inputs.weight ?? undefined,
        offset: state.inputs.offset ?? undefined,
        surveyDesign: state.inputs.surveyDesign,
        allowSurveyApproximation: state.inputs.allowSurveyApproximation,
        alpha: 0.05,
        python: state.inputs.python ?? undefined,
      });
      return result.artifacts.map(item => item.path);
    }
    case "refresh-dataset-feasibility": {
      if (!state.inputs.dataPath) throw new Error("Cannot refresh dataset feasibility without a data path.");
      const summary = await researchTableSummaryCommand({ file: state.inputs.dataPath, python: state.inputs.python ?? undefined });
      const summaryPath = path.join(state.rootDir, `table-summary-repair-${String(state.repairs.length + 1).padStart(2, "0")}.json`);
      await writeJson(summaryPath, { schemaVersion: 1, tableSummary: summary });
      return [summaryPath];
    }
    default:
      throw new Error(`Unknown controller repair plugin: ${pluginId}`);
  }
}

function repairAttemptCount(state: ControllerState): number {
  return state.repairs.length + state.actions.filter(action => action.action === "apply_repairs").length;
}

async function writeControllerSelfEvaluation(state: ControllerState): Promise<ControllerSelfEvaluation> {
  const evaluation = await buildControllerSelfEvaluation(state);
  await writeJson(evaluation.outPath, { schemaVersion: 1, controllerSelfEvaluation: evaluation });
  await writeFile(evaluation.reportPath, renderControllerSelfEvaluationMarkdown(evaluation));
  return evaluation;
}

async function writeControllerCompletionAudit(state: ControllerState): Promise<ControllerCompletionAudit> {
  const audit = await buildControllerCompletionAudit(state);
  await writeJson(audit.outPath, { schemaVersion: 1, controllerCompletionAudit: audit });
  await writeFile(audit.reportPath, renderControllerCompletionAuditMarkdown(audit));
  return audit;
}

async function writeControllerGoldenPacket(
  state: ControllerState,
  context: {
    ready: boolean;
    inspectionReadiness: string | null;
    reviewVerdict: string | null;
    completionAudit: ControllerCompletionAudit;
    selfEvaluation: ControllerSelfEvaluation;
  },
): Promise<ControllerGoldenPacket> {
  const packet = await buildControllerGoldenPacket(state, context);
  await writeJson(packet.outPath, { schemaVersion: 1, controllerGoldenPacket: packet });
  await writeFile(packet.reportPath, renderControllerGoldenPacketMarkdown(packet));
  return packet;
}

async function writeControllerTerminalGoldenPacket(state: ControllerState, handoff: ControllerTerminalHandoff): Promise<ControllerGoldenPacket> {
  const outPath = path.join(state.rootDir, "controller-golden-packet.json");
  const reportPath = path.join(state.rootDir, "controller-golden-packet.md");
  const inspectionRaw = await readJsonIfPresent(path.join(state.inputs.runDir, "run-inspection.json"));
  const inspection = (valueAtPath(inspectionRaw, "runInspection") ?? inspectionRaw) as Partial<RunInspectionResult> | null;
  const inspectionReadiness = typeof inspection?.readiness === "string" ? inspection.readiness : null;
  const controllerFeasibility = await loadControllerFeasibilitySummary(state);
  const inspectionFeasibility = controllerInspectionFeasibilityReadiness(inspection, controllerFeasibility);
  const inspectionRecommendedCommands = controllerInspectionRecommendedCommands(inspection);
  const latestIssueLedger = await readLatestControllerIssueLedger(state);
  const latestStageReview = await readLatestControllerStageReview(state);
  const latestReadiness = await readLatestControllerActionReadiness(state);
  const latestContract = await readLatestControllerActionContract(state);
  const datasetSemanticAudit = await loadControllerDatasetSemanticAuditSummary(state);
  const blockers = uniqueStringList([
    ...handoff.failureAttribution.filter(item => item.severity === "blocker").map(item => item.message),
    ...(latestIssueLedger?.issues.filter(item => item.severity === "blocker").map(item => item.message) ?? []),
    ...(latestStageReview?.findings.filter(item => item.severity === "blocker").map(item => item.message) ?? []),
    ...(latestReadiness?.checks.filter(item => item.status === "fail").map(item => item.message) ?? []),
    ...(latestContract?.status === "fail" ? latestContract.reasons : []),
    ...(state.status === "blocked" && state.stopReason ? [state.stopReason] : []),
  ]);
  const warnings = uniqueStringList([
    ...handoff.failureAttribution.filter(item => item.severity !== "blocker").map(item => item.message),
    ...(latestIssueLedger?.issues.filter(item => item.severity !== "blocker").map(item => item.message) ?? []),
    ...(latestStageReview?.findings.filter(item => item.severity !== "blocker").map(item => item.message) ?? []),
    ...(latestReadiness?.checks.filter(item => item.status === "warning").map(item => item.message) ?? []),
    ...(latestContract?.status === "warning" ? latestContract.reasons : []),
    ...(Array.isArray(inspection?.warnings) ? inspection.warnings.filter((item): item is string => typeof item === "string") : []),
  ]);
  const requiredArtifactsMissingHash = state.artifacts.filter(item => item.requiredForPromotion && !item.sha256).length;
  const completionAudit: ControllerCompletionAudit["status"] = state.status === "complete" ? "pass" : state.status === "blocked" ? "fail" : "warning";
  const selfEvaluation: ControllerSelfEvaluation["status"] = state.status === "complete" ? "pass" : state.status === "blocked" ? "fail" : "warning";
  const issueSummary = buildControllerGoldenIssueSummary({
    handoff,
    issueLedger: latestIssueLedger,
    stageReview: latestStageReview,
    actionReadiness: latestReadiness,
    actionContract: latestContract,
    datasetSemanticAudit,
    inspection,
  });
  const activeIssueCodes = uniqueText(issueSummary.flatMap(issue => issue.issueCodes));
  const activeBlockerIssueCodes = enforceableControllerBlockerCodes(issueSummary.filter(issue => issue.severity === "blocker").flatMap(issue => issue.issueCodes));
  const packet: ControllerGoldenPacket = {
    schemaVersion: 1,
    generatedAtIso: nowIso(),
    runId: state.runId,
    status: state.status,
    stage: state.currentStage,
    question: state.inputs.question,
    method: state.inputs.method,
    readiness: {
      runInspection: inspectionReadiness,
      feasibilityReadiness: inspectionFeasibility.status,
      feasibilityVerdict: inspectionFeasibility.verdict,
      completionAudit,
      selfEvaluation,
      promotionDecision: state.status === "complete" ? "complete" : "human_review",
      promotable: state.status === "complete" && inspectionReadiness === "local_review_ready" && !requiredArtifactsMissingHash,
    },
    counts: {
      actions: state.actions.length,
      artifacts: state.artifacts.length,
      blockers: blockers.length,
      warnings: warnings.length,
      requiredArtifactsMissingHash,
    },
    blockers,
    warnings,
    activeIssueCodes,
    activeBlockerIssueCodes,
    issueSummary,
    stageSummary: controllerGoldenStageSummary(state),
    keyArtifacts: {
      state: state.statePath,
      feasibility: latestArtifactPath(state, "controller-feasibility-verdict"),
      datasetSemanticAudit: datasetSemanticAudit.path,
      exploration: latestArtifactPath(state, "exploration"),
      literatureContext: latestArtifactPath(state, "literature-context"),
      methodSelection: latestArtifactPath(state, "method-selection"),
      modelingPlan: latestArtifactPath(state, "controller-modeling-plan"),
      statsRun: await pathExists(path.join(state.inputs.runDir, "stats-run.json")) ? path.join(state.inputs.runDir, "stats-run.json") : null,
      statsQa: latestArtifactPath(state, "stats-qa"),
      methodQa: latestArtifactPath(state, "method-qa"),
      manuscript: latestArtifactPath(state, "manuscript"),
      manuscriptQa: latestArtifactPath(state, "manuscript-qa"),
      literatureQa: latestArtifactPath(state, "literature-qa"),
      reviewAdjudication: latestArtifactPath(state, "review-adjudication"),
      runInspection: latestArtifactPath(state, "run-inspection"),
      stageReview: latestStageReview?.outPath ?? latestArtifactPath(state, "controller-stage-review"),
      issueLedger: latestIssueLedger?.outPath ?? latestArtifactPath(state, "controller-issue-ledger"),
      actionReadiness: latestReadiness?.outPath ?? latestArtifactPath(state, "controller-action-readiness"),
      actionContract: latestContract?.outPath ?? latestArtifactPath(state, "controller-action-contract"),
      terminalHandoff: latestArtifactPath(state, "controller-terminal-handoff") ?? path.join(state.rootDir, "controller-terminal-handoff.json"),
      nextAction: latestArtifactPath(state, "controller-next-action") ?? path.join(state.rootDir, "controller-next-action.json"),
      reentryPlan: latestArtifactPath(state, "controller-reentry-plan") ?? path.join(state.rootDir, "controller-reentry-plan.json"),
    },
    keyArtifactReports: {
      state: null,
      feasibility: latestArtifactPath(state, "controller-feasibility-report"),
      datasetSemanticAudit: datasetSemanticAudit.reportPath,
      exploration: latestArtifactPath(state, "exploration-report"),
      literatureContext: latestArtifactPath(state, "literature-context-report"),
      methodSelection: null,
      modelingPlan: null,
      statsRun: latestArtifactPath(state, "stats-report"),
      statsQa: null,
      methodQa: latestArtifactPath(state, "method-qa-report"),
      manuscript: null,
      manuscriptQa: null,
      literatureQa: latestArtifactPath(state, "literature-qa-report"),
      reviewAdjudication: null,
      runInspection: latestArtifactPath(state, "run-inspection-report"),
      stageReview: latestStageReview?.reportPath ?? latestArtifactPath(state, "controller-stage-review-report"),
      issueLedger: latestIssueLedger?.reportPath ?? latestArtifactPath(state, "controller-issue-ledger-report"),
      actionReadiness: latestReadiness?.reportPath ?? latestArtifactPath(state, "controller-action-readiness-report"),
      actionContract: latestContract?.reportPath ?? latestArtifactPath(state, "controller-action-contract-report"),
      terminalHandoff: latestArtifactPath(state, "controller-terminal-handoff-report") ?? path.join(state.rootDir, "controller-terminal-handoff.md"),
      nextAction: latestArtifactPath(state, "controller-next-action-report") ?? path.join(state.rootDir, "controller-next-action.md"),
      reentryPlan: latestArtifactPath(state, "controller-reentry-plan-report") ?? path.join(state.rootDir, "controller-reentry-plan.md"),
    },
    datasetSemanticAudit,
    nextAction: state.status === "blocked"
      ? "Do not execute downstream analysis. Patch the blocking study/data issue or start a new run with feasible inputs."
      : state.status === "complete"
        ? "Proceed to human scientific review and external sharing decisions under the declared evidence boundary."
        : "Review the terminal handoff, next-action packet, and issue ledger before resuming.",
    recommendedCommands: uniqueStringList([
      ...inspectionRecommendedCommands,
      ...handoff.suggestedCommands,
    ]).slice(0, 8),
    outPath,
    reportPath,
  };
  await writeJson(outPath, { schemaVersion: 1, controllerGoldenPacket: packet });
  await writeFile(reportPath, renderControllerGoldenPacketMarkdown(packet));
  return packet;
}

async function buildControllerGoldenPacket(
  state: ControllerState,
  context: {
    ready: boolean;
    inspectionReadiness: string | null;
    reviewVerdict: string | null;
    completionAudit: ControllerCompletionAudit;
    selfEvaluation: ControllerSelfEvaluation;
  },
): Promise<ControllerGoldenPacket> {
  const outPath = path.join(state.rootDir, "controller-golden-packet.json");
  const reportPath = path.join(state.rootDir, "controller-golden-packet.md");
  const inspectionRaw = await readJsonIfPresent(path.join(state.inputs.runDir, "run-inspection.json"));
  const inspection = (valueAtPath(inspectionRaw, "runInspection") ?? inspectionRaw) as Partial<RunInspectionResult> | null;
  const controllerFeasibility = await loadControllerFeasibilitySummary(state);
  const inspectionFeasibility = controllerInspectionFeasibilityReadiness(inspection, controllerFeasibility);
  const inspectionRecommendedCommands = controllerInspectionRecommendedCommands(inspection);
  const inspectionBlockers = Array.isArray(inspection?.blockers) ? inspection.blockers.filter((item): item is string => typeof item === "string") : [];
  const inspectionWarnings = Array.isArray(inspection?.warnings) ? inspection.warnings.filter((item): item is string => typeof item === "string") : [];
  const auditFailures = context.completionAudit.requirements.filter(item => item.status === "failed").map(item => `${item.id}: ${item.finding}`);
  const auditWarnings = context.completionAudit.requirements.filter(item => item.status === "warning").map(item => `${item.id}: ${item.finding}`);
  const selfEvalFailures = context.selfEvaluation.checks.filter(item => item.status === "fail").map(item => `${item.id}: ${item.message}`);
  const selfEvalWarnings = context.selfEvaluation.checks.filter(item => item.status === "warning").map(item => `${item.id}: ${item.message}`);
  const latestIssueLedger = await readLatestControllerIssueLedger(state);
  const latestStageReview = await readLatestControllerStageReview(state);
  const latestReadiness = await readLatestControllerActionReadiness(state);
  const latestContract = await readLatestControllerActionContract(state);
  const datasetSemanticAudit = await loadControllerDatasetSemanticAuditSummary(state);
  const issueSummary = buildControllerGoldenIssueSummary({
    completionAudit: context.completionAudit,
    selfEvaluation: context.selfEvaluation,
    issueLedger: latestIssueLedger,
    stageReview: latestStageReview,
    actionReadiness: latestReadiness,
    actionContract: latestContract,
    datasetSemanticAudit,
    inspection,
  });
  const activeIssueCodes = uniqueText(issueSummary.flatMap(issue => issue.issueCodes));
  const activeBlockerIssueCodes = enforceableControllerBlockerCodes(issueSummary.filter(issue => issue.severity === "blocker").flatMap(issue => issue.issueCodes));
  const blockers = uniqueStringList([
    ...inspectionBlockers,
    ...auditFailures,
    ...selfEvalFailures,
    ...(latestIssueLedger?.issues.filter(item => item.severity === "blocker").map(item => item.message) ?? []),
    ...(latestStageReview?.findings.filter(item => item.severity === "blocker").map(item => item.message) ?? []),
    ...(latestReadiness?.checks.filter(item => item.status === "fail").map(item => item.message) ?? []),
    ...(latestContract?.status === "fail" ? latestContract.reasons : []),
  ]);
  const warnings = uniqueStringList([
    ...inspectionWarnings,
    ...auditWarnings,
    ...selfEvalWarnings,
    ...(latestIssueLedger?.issues.filter(item => item.severity !== "blocker").map(item => item.message) ?? []),
    ...(latestStageReview?.findings.filter(item => item.severity !== "blocker").map(item => item.message) ?? []),
    ...(latestReadiness?.checks.filter(item => item.status === "warning").map(item => item.message) ?? []),
    ...(latestContract?.status === "warning" ? latestContract.reasons : []),
  ]);
  const requiredArtifactsMissingHash = state.artifacts.filter(item => item.requiredForPromotion && !item.sha256).length;
  const statsRunPath = path.join(state.inputs.runDir, "stats-run.json");
  return {
    schemaVersion: 1,
    generatedAtIso: nowIso(),
    runId: state.runId,
    status: state.status,
    stage: state.currentStage,
    question: state.inputs.question,
    method: state.inputs.method,
    readiness: {
      runInspection: context.inspectionReadiness,
      feasibilityReadiness: inspectionFeasibility.status,
      feasibilityVerdict: inspectionFeasibility.verdict,
      completionAudit: context.completionAudit.status,
      selfEvaluation: context.selfEvaluation.status,
      promotionDecision: context.ready ? "complete" : "human_review",
      promotable: context.ready,
    },
    counts: {
      actions: state.actions.length,
      artifacts: state.artifacts.length,
      blockers: blockers.length,
      warnings: warnings.length,
      requiredArtifactsMissingHash,
    },
    blockers,
    warnings,
    activeIssueCodes,
    activeBlockerIssueCodes,
    issueSummary,
    stageSummary: controllerGoldenStageSummary(state),
    keyArtifacts: {
      state: state.statePath,
      feasibility: latestArtifactPath(state, "controller-feasibility-verdict"),
      datasetSemanticAudit: datasetSemanticAudit.path,
      exploration: latestArtifactPath(state, "exploration"),
      literatureContext: latestArtifactPath(state, "literature-context"),
      methodSelection: latestArtifactPath(state, "method-selection"),
      modelingPlan: latestArtifactPath(state, "controller-modeling-plan"),
      statsRun: await pathExists(statsRunPath) ? statsRunPath : latestArtifactPath(state, "stats-run"),
      statsQa: latestArtifactPath(state, "stats-qa"),
      methodQa: latestArtifactPath(state, "method-qa"),
      manuscript: latestArtifactPath(state, "manuscript"),
      manuscriptQa: latestArtifactPath(state, "manuscript-qa"),
      literatureQa: latestArtifactPath(state, "literature-qa"),
      reviewAdjudication: latestArtifactPath(state, "review-adjudication"),
      runInspection: latestArtifactPath(state, "run-inspection"),
      completionAudit: context.completionAudit.outPath,
      selfEvaluation: context.selfEvaluation.outPath,
      stageReview: latestStageReview?.outPath ?? latestArtifactPath(state, "controller-stage-review"),
      issueLedger: latestIssueLedger?.outPath ?? latestArtifactPath(state, "controller-issue-ledger"),
      actionReadiness: latestReadiness?.outPath ?? latestArtifactPath(state, "controller-action-readiness"),
      actionContract: latestContract?.outPath ?? latestArtifactPath(state, "controller-action-contract"),
      terminalHandoff: latestArtifactPath(state, "controller-terminal-handoff"),
      nextAction: latestArtifactPath(state, "controller-next-action"),
      reentryPlan: latestArtifactPath(state, "controller-reentry-plan"),
    },
    keyArtifactReports: {
      state: null,
      feasibility: latestArtifactPath(state, "controller-feasibility-report"),
      datasetSemanticAudit: datasetSemanticAudit.reportPath,
      exploration: latestArtifactPath(state, "exploration-report"),
      literatureContext: latestArtifactPath(state, "literature-context-report"),
      methodSelection: null,
      modelingPlan: null,
      statsRun: latestArtifactPath(state, "stats-report"),
      statsQa: null,
      methodQa: latestArtifactPath(state, "method-qa-report"),
      manuscript: null,
      manuscriptQa: null,
      literatureQa: latestArtifactPath(state, "literature-qa-report"),
      reviewAdjudication: null,
      runInspection: latestArtifactPath(state, "run-inspection-report"),
      completionAudit: context.completionAudit.reportPath,
      selfEvaluation: context.selfEvaluation.reportPath,
      stageReview: latestStageReview?.reportPath ?? latestArtifactPath(state, "controller-stage-review-report"),
      issueLedger: latestIssueLedger?.reportPath ?? latestArtifactPath(state, "controller-issue-ledger-report"),
      actionReadiness: latestReadiness?.reportPath ?? latestArtifactPath(state, "controller-action-readiness-report"),
      actionContract: latestContract?.reportPath ?? latestArtifactPath(state, "controller-action-contract-report"),
      terminalHandoff: latestArtifactPath(state, "controller-terminal-handoff-report"),
      nextAction: latestArtifactPath(state, "controller-next-action-report"),
      reentryPlan: latestArtifactPath(state, "controller-reentry-plan-report"),
    },
    datasetSemanticAudit,
    nextAction: context.ready
      ? "Proceed to human scientific review and external sharing decisions under the declared evidence boundary."
      : blockers.length
        ? "Do not promote. Resolve blocker-level findings, rerun the affected stage, and regenerate this packet."
        : "Treat as local-review only. Review warning-level methods, QA, and reporting findings before promotion.",
    recommendedCommands: uniqueStringList([
      ...inspectionRecommendedCommands,
      context.ready
        ? `agenteer research controller-status --state ${quotePath(state.statePath)}`
        : `agenteer research controller-run --state ${quotePath(state.statePath)} --max-steps 4`,
    ]).slice(0, 8),
    outPath,
    reportPath,
  };
}

function buildControllerGoldenIssueSummary(context: {
  completionAudit?: ControllerCompletionAudit;
  selfEvaluation?: ControllerSelfEvaluation;
  handoff?: ControllerTerminalHandoff;
  issueLedger: ControllerIssueLedger | null;
  stageReview: ControllerStageReview | null;
  actionReadiness: ControllerActionReadiness | null;
  actionContract: ControllerActionContractCheck | null;
  datasetSemanticAudit: Awaited<ReturnType<typeof loadControllerDatasetSemanticAuditSummary>>;
  inspection: Partial<RunInspectionResult> | null;
}): ControllerGoldenPacket["issueSummary"] {
  const issues: ControllerGoldenPacket["issueSummary"] = [];
  const add = (
    category: ControllerGoldenPacket["issueSummary"][number]["category"],
    severity: ControllerGoldenPacket["issueSummary"][number]["severity"],
    message: string,
    issueCodes: string[] = [],
    evidenceRefs: string[] = [],
  ) => {
    const clean = message.trim();
    if (!clean) return;
    issues.push({
      category,
      severity,
      issueCodes: uniqueText(issueCodes),
      message: clean,
      evidenceRefs: uniqueText(evidenceRefs),
    });
  };
  for (const requirement of context.completionAudit?.requirements ?? []) {
    if (requirement.status === "failed") add("completion_audit", "blocker", `${requirement.id}: ${requirement.finding}`, requirement.issueCodes ?? [], [context.completionAudit?.outPath, ...requirement.evidenceRefs].filter((item): item is string => Boolean(item)));
    if (requirement.status === "warning") add("completion_audit", "warning", `${requirement.id}: ${requirement.finding}`, requirement.issueCodes ?? [], [context.completionAudit?.outPath, ...requirement.evidenceRefs].filter((item): item is string => Boolean(item)));
  }
  for (const check of context.selfEvaluation?.checks ?? []) {
    if (check.status === "fail") add("self_evaluation", "blocker", `${check.id}: ${check.message}`, check.issueCodes ?? issueCodesFromText(check.message), [context.selfEvaluation?.outPath, ...check.evidenceRefs].filter((item): item is string => Boolean(item)));
    if (check.status === "warning") add("self_evaluation", "warning", `${check.id}: ${check.message}`, check.issueCodes ?? issueCodesFromText(check.message), [context.selfEvaluation?.outPath, ...check.evidenceRefs].filter((item): item is string => Boolean(item)));
  }
  for (const item of context.handoff?.failureAttribution ?? []) {
    add("terminal_handoff", item.severity === "blocker" ? "blocker" : "warning", item.message, issueCodesFromText(item.message), item.evidenceRefs);
  }
  for (const issue of context.issueLedger?.issues.filter(item => item.status === "active") ?? []) {
    add("issue_ledger", issue.severity === "blocker" || issue.severity === "major" ? "blocker" : "warning", `${issue.issueCode ? `${issue.issueCode}: ` : ""}${issue.message}`, issue.issueCode ? [issue.issueCode] : issueCodesFromText(issue.message), [context.issueLedger?.outPath, ...issue.evidenceRefs].filter((item): item is string => Boolean(item)));
  }
  for (const finding of context.stageReview?.findings ?? []) {
    if (finding.severity === "blocker" || finding.severity === "major") add("stage_review", finding.severity === "blocker" ? "blocker" : "warning", finding.message, finding.issueCodes ?? issueCodesFromText(finding.message), [context.stageReview?.outPath, ...finding.evidenceRefs].filter((item): item is string => Boolean(item)));
  }
  for (const check of context.actionReadiness?.checks ?? []) {
    if (check.status === "fail") add("action_readiness", "blocker", check.message, check.issueCodes ?? issueCodesFromText(check.message), [context.actionReadiness?.outPath, ...check.evidenceRefs].filter((item): item is string => Boolean(item)));
    if (check.status === "warning") add("action_readiness", "warning", check.message, check.issueCodes ?? issueCodesFromText(check.message), [context.actionReadiness?.outPath, ...check.evidenceRefs].filter((item): item is string => Boolean(item)));
  }
  if (context.actionContract?.status === "fail") for (const reason of context.actionContract.reasons) add("action_contract", "blocker", reason, issueCodesFromText(reason), [context.actionContract.outPath]);
  if (context.actionContract?.status === "warning") for (const reason of context.actionContract.reasons) add("action_contract", "warning", reason, issueCodesFromText(reason), [context.actionContract.outPath]);
  for (const issue of context.datasetSemanticAudit.topIssues.filter(issue => issue.selected && issue.severity !== "note")) {
    add("dataset_semantic_audit", issue.severity === "blocker" ? "blocker" : "warning", `${issue.code}: ${issue.message}`, [issue.code], [context.datasetSemanticAudit.path, context.datasetSemanticAudit.reportPath].filter((item): item is string => Boolean(item)));
  }
  for (const blocker of Array.isArray(context.inspection?.blockers) ? context.inspection.blockers : []) if (typeof blocker === "string") add("inspection", "blocker", blocker, issueCodesFromText(blocker), []);
  for (const warning of Array.isArray(context.inspection?.warnings) ? context.inspection.warnings : []) if (typeof warning === "string") add("inspection", "warning", warning, issueCodesFromText(warning), []);
  return uniqueGoldenIssueSummary(issues).slice(0, 80);
}

function uniqueGoldenIssueSummary(issues: ControllerGoldenPacket["issueSummary"]): ControllerGoldenPacket["issueSummary"] {
  const seen = new Set<string>();
  return issues.filter(issue => {
    const key = `${issue.category}:${issue.severity}:${issue.issueCodes.join(",")}:${issue.message}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function controllerInspectionRecommendedCommands(inspection: Partial<RunInspectionResult> | null): string[] {
  if (!inspection || !Array.isArray(inspection.recommendedCommands)) return [];
  return inspection.recommendedCommands.filter((command): command is string => typeof command === "string" && command.trim().length > 0);
}

function controllerInspectionFeasibilityReadiness(
  inspection: Partial<RunInspectionResult> | null,
  controllerFeasibility: Awaited<ReturnType<typeof loadControllerFeasibilitySummary>> | null = null,
): { status: string | null; verdict: string | null } {
  const feasibility = inspection && typeof inspection === "object" ? (inspection as { feasibilityReadiness?: unknown }).feasibilityReadiness : null;
  const readiness = feasibility && typeof feasibility === "object" && !Array.isArray(feasibility)
    ? feasibility as { status?: unknown; verdict?: unknown }
    : null;
  const fallbackStatus = controllerFeasibility?.status && controllerFeasibility.status !== "unknown" ? controllerFeasibility.status : null;
  const fallbackVerdict = controllerFeasibility?.verdict && controllerFeasibility.verdict !== "unknown" ? controllerFeasibility.verdict : null;
  return {
    status: typeof readiness?.status === "string" ? readiness.status : fallbackStatus,
    verdict: typeof readiness?.verdict === "string" ? readiness.verdict : fallbackVerdict,
  };
}

function controllerGoldenStageSummary(state: ControllerState): ControllerGoldenPacket["stageSummary"] {
  const stages: ControllerStage[] = ["dataset_feasibility", "exploration", "literature", "method_selection", "execution", "qa", "manuscript", "literature_qa", "external_review", "inspection", "promotion_decision"];
  return stages.map(stage => {
    const actions = state.actions.filter(action => actionStageForGoldenSummary(action.action) === stage);
    const latest = actions.at(-1) ?? null;
    const currentPromotionDecision = stage === "promotion_decision" && state.currentStage === "promotion_decision";
    return {
      stage,
      completed: state.completedStages.includes(stage) || currentPromotionDecision,
      latestAction: latest?.action ?? (currentPromotionDecision ? "decide_promotion" : null),
      actionStatus: latest?.status ?? (currentPromotionDecision ? "succeeded" : null),
      evidenceRefs: artifactPathsForStage(state, stage),
    };
  });
}

function actionStageForGoldenSummary(action: ControllerActionType): ControllerStage | null {
  switch (action) {
    case "table_summary": return "dataset_feasibility";
    case "explore": return "exploration";
    case "literature_search": return "literature";
    case "select_method": return "method_selection";
    case "run_analysis": return "execution";
    case "method_qa": return "qa";
    case "write_manuscript": return "manuscript";
    case "literature_qa": return "literature_qa";
    case "external_review": return "external_review";
    case "inspect_run": return "inspection";
    case "decide_promotion": return "promotion_decision";
    default: return null;
  }
}

function artifactPathsForStage(state: ControllerState, stage: ControllerStage): string[] {
  return state.artifacts.filter(item => item.stage === stage && item.sha256).map(item => item.path).slice(0, 12);
}

function latestArtifactPath(state: ControllerState, kind: string): string | null {
  return [...state.artifacts].reverse().find(item => item.kind === kind && item.sha256)?.path ?? null;
}

function uniqueStringList(items: string[]): string[] {
  return [...new Set(items.map(item => item.trim()).filter(Boolean))];
}

async function buildControllerCompletionAudit(state: ControllerState): Promise<ControllerCompletionAudit> {
  const outPath = path.join(state.rootDir, "controller-completion-audit.json");
  const reportPath = path.join(state.rootDir, "controller-completion-audit.md");
  const requirements: ControllerCompletionAudit["requirements"] = [];
  const add = (
    id: string,
    status: ControllerCompletionAudit["requirements"][number]["status"],
    scope: ControllerCompletionAudit["requirements"][number]["scope"],
    requirement: string,
    evidenceRefs: string[],
    finding: string,
    issueCodes: string[] = [],
  ) => requirements.push({ id, status, scope, requirement, evidenceRefs, finding, ...(issueCodes.length ? { issueCodes: uniqueText(issueCodes) } : {}) });
  const requiredStages = requiredStagesBeforePromotion(state);
  const missingStages = requiredStages.filter(stage => !state.completedStages.includes(stage));
  add(
    "stage-coverage",
    missingStages.length ? "failed" : "proved",
    "state_machine",
    "Every required controller stage before promotion must be completed.",
    [],
    missingStages.length ? `Missing required stages: ${missingStages.join(", ")}.` : `Completed required stages: ${requiredStages.join(", ")}.`,
  );
  const failedOrRejectedActions = state.actions.filter(action => action.status === "failed");
  add(
    "action-outcomes",
    failedOrRejectedActions.length ? "failed" : "proved",
    "state_machine",
    "No failed controller action may be hidden at promotion.",
    failedOrRejectedActions.flatMap(action => action.artifacts.map(item => item.path)),
    failedOrRejectedActions.length ? `${failedOrRejectedActions.length} failed action(s) found.` : "No failed controller actions found.",
  );
  const gateBlocks = state.gates.filter(item => item.status === "block");
  add(
    "gate-outcomes",
    gateBlocks.length ? "failed" : "proved",
    "state_machine",
    "Blocking gates must not remain unresolved.",
    gateBlocks.flatMap(item => item.evidenceRefs),
    gateBlocks.length ? `Blocking gates remain: ${gateBlocks.map(item => item.stage).join(", ")}.` : "No unresolved blocking gates found.",
  );
  const feasibility = await loadControllerFeasibilitySummary(state);
  add(
    "study-feasibility",
    !state.inputs.dataPath ? "not_applicable" : feasibility.status === "pass" ? "proved" : feasibility.status === "warning" ? "warning" : "failed",
    "data",
    "Dataset-grounded runs require a durable feasibility verdict before execution.",
    feasibility.path ? [feasibility.path] : [],
    !state.inputs.dataPath
      ? "No row-level data path was supplied."
      : feasibility.present
        ? `Feasibility verdict status is ${feasibility.status}${feasibility.blockers.length ? `; blockers=${feasibility.blockers.join("; ")}` : ""}${feasibility.warnings.length ? `; warnings=${feasibility.warnings.join("; ")}` : ""}.`
        : "Feasibility verdict is missing.",
  );
  const datasetSemanticAudit = await loadControllerDatasetSemanticAuditSummary(state);
  add(
    "dataset-semantic-audit",
    !state.inputs.dataPath
      ? "not_applicable"
      : !datasetSemanticAudit.present
        ? "failed"
        : datasetSemanticAudit.selectedRoleStatus === "block"
          ? "failed"
          : datasetSemanticAudit.selectedRoleStatus === "warning"
            ? "warning"
            : "proved",
    "data",
    "Dataset-grounded runs require semantic plausibility audit evidence, and selected study roles must not have unresolved semantic blockers.",
    uniqueText([datasetSemanticAudit.path, datasetSemanticAudit.reportPath].filter((item): item is string => Boolean(item))),
    !state.inputs.dataPath
      ? "No row-level data path was supplied."
      : !datasetSemanticAudit.present
        ? "Dataset semantic audit is missing."
        : datasetSemanticAudit.selectedRoleStatus === "block"
          ? `Selected study roles have semantic blocker(s): ${datasetSemanticAudit.topIssues.filter(issue => issue.selected).map(issue => `${issue.code}: ${issue.message}`).join("; ") || "no detail"}.`
          : datasetSemanticAudit.selectedRoleStatus === "warning"
            ? `Selected study roles have semantic warning(s): ${datasetSemanticAudit.topIssues.filter(issue => issue.selected).map(issue => `${issue.code}: ${issue.message}`).join("; ") || "no detail"}.`
            : datasetSemanticAudit.status === "warning"
              ? `Selected study roles pass semantic plausibility; dataset-wide audit found ${datasetSemanticAudit.issueCount} unused/nonblocking issue(s) for review.`
              : "Dataset semantic audit passes for selected study roles.",
  );
  add(
    "method-planning",
    artifactExists(state, "controller-modeling-plan") && artifactExists(state, "method-selection") ? "proved" : "failed",
    "methods",
    "The controller must record method-selection and modeling-plan evidence before execution.",
    artifactPaths(state, "controller-modeling-plan", "method-selection"),
    artifactExists(state, "controller-modeling-plan") && artifactExists(state, "method-selection") ? "Modeling plan and method-selection artifacts are present." : "Modeling plan or method-selection artifact is missing.",
  );
  add(
    "analysis-execution",
    state.actions.some(action => action.action === "run_analysis" && action.status === "succeeded") && artifactExists(state, "stats-qa") ? "proved" : "failed",
    "methods",
    "The selected analysis must execute and produce QA evidence.",
    artifactPaths(state, "stats-summary", "stats-report", "stats-qa"),
    state.actions.some(action => action.action === "run_analysis" && action.status === "succeeded") && artifactExists(state, "stats-qa") ? "Analysis execution and stats QA are present." : "Analysis execution or stats QA evidence is missing.",
  );
  const requiredArtifacts = state.artifacts.filter(item => item.requiredForPromotion);
  const missingHashes = requiredArtifacts.filter(item => !item.sha256);
  add(
    "artifact-integrity",
    missingHashes.length ? "failed" : "proved",
    "artifacts",
    "Every artifact required for promotion must exist and have a hash.",
    missingHashes.length ? missingHashes.map(item => item.path) : requiredArtifacts.map(item => item.path),
    missingHashes.length ? `${missingHashes.length} required artifact(s) are missing hashes.` : `${requiredArtifacts.length} required artifact(s) have hashes.`,
  );
  const actionContractArtifacts = state.artifacts.filter(item => item.kind === "controller-action-contract");
  const contracts = (await Promise.all(actionContractArtifacts.map(item => readJsonIfPresent(item.path))))
    .map(raw => valueAtPath(raw, "controllerActionContract") as Partial<ControllerActionContractCheck> | null)
    .filter((item): item is Partial<ControllerActionContractCheck> => Boolean(item));
  const failedContracts = contracts.filter(item => item.status === "fail");
  add(
    "action-contracts",
    failedContracts.length ? "failed" : contracts.length ? "proved" : "failed",
    "artifacts",
    "Every successful action must be backed by an action contract.",
    failedContracts.length ? failedContracts.map(item => item.outPath).filter((value): value is string => Boolean(value)) : actionContractArtifacts.map(item => item.path),
    failedContracts.length ? `${failedContracts.length} action contract(s) failed.` : contracts.length ? `${contracts.length} action contract(s) are present.` : "No action contracts are present.",
  );
  const checkpoints = state.artifacts.filter(item => item.kind === "controller-step-checkpoint" && item.sha256);
  add(
    "step-checkpoints",
    checkpoints.length >= state.actions.length ? "proved" : "failed",
    "state_machine",
    "Every completed prior controller action must have an immutable step checkpoint.",
    checkpoints.map(item => item.path),
    checkpoints.length >= state.actions.length ? `${checkpoints.length} checkpoint artifact(s) cover ${state.actions.length} completed prior action(s).` : `${checkpoints.length} checkpoint artifact(s) do not cover ${state.actions.length} completed prior action(s).`,
  );
  const stageReviewArtifacts = state.artifacts.filter(item => item.kind === "controller-stage-review");
  const stageReviews = (await Promise.all(stageReviewArtifacts.map(item => readJsonIfPresent(item.path))))
    .map(raw => valueAtPath(raw, "controllerStageReview") as Partial<ControllerStageReview> | null)
    .filter((item): item is Partial<ControllerStageReview> => Boolean(item));
  const blockingStageReviews = stageReviews.filter(review => review.status === "block");
  add(
    "stage-reviews",
    blockingStageReviews.length ? "failed" : stageReviews.length >= state.actions.length ? "proved" : "failed",
    "state_machine",
    "Every controller action must have an operator-style stage review and no unresolved blocking stage review may remain.",
    blockingStageReviews.length ? blockingStageReviews.map(review => review.outPath).filter((value): value is string => Boolean(value)) : stageReviewArtifacts.map(item => item.path),
    blockingStageReviews.length
      ? `${blockingStageReviews.length} blocking stage review(s) remain.`
      : stageReviews.length >= state.actions.length ? `${stageReviews.length} stage review artifact(s) cover ${state.actions.length} action(s).` : `${stageReviews.length} stage review artifact(s) do not cover ${state.actions.length} action(s).`,
  );
  const latestRepairVerificationPath = latestArtifactPath(state, "controller-repair-verification");
  const latestRepairVerificationRaw = latestRepairVerificationPath ? await readJsonIfPresent(latestRepairVerificationPath) : null;
  const latestRepairVerification = valueAtPath(latestRepairVerificationRaw, "controllerRepairVerification") as Partial<ControllerRepairVerification> | null;
  const repairVerificationStatus = latestRepairVerification?.status ?? null;
  add(
    "repair-verification",
    state.repairs.length === 0
      ? "not_applicable"
      : repairVerificationStatus === "pass" || repairVerificationStatus === "warning"
        ? repairVerificationStatus === "pass" ? "proved" : "warning"
        : "failed",
    "review",
    "Reviewer-driven repairs must have a durable verification artifact before promotion.",
    latestRepairVerificationPath ? [latestRepairVerificationPath] : artifactPaths(state, "controller-repair-execution"),
    state.repairs.length === 0
      ? "No reviewer-driven repair was recorded."
      : repairVerificationStatus === "pass"
        ? "Latest repair verification passed."
        : repairVerificationStatus === "warning"
          ? `Latest repair verification has warnings: ${latestRepairVerification?.nextAction ?? "continue with review"}.`
          : "Latest repair verification is missing or failed.",
  );
  const agendaArtifacts = state.artifacts.filter(item => item.kind === "controller-execution-agenda");
  const agendas = (await Promise.all(agendaArtifacts.map(item => readJsonIfPresent(item.path))))
    .map(raw => valueAtPath(raw, "controllerExecutionAgenda") as Partial<ControllerExecutionAgenda> | null)
    .filter((item): item is Partial<ControllerExecutionAgenda> => Boolean(item));
  const latestAgenda = agendas.at(-1);
  add(
    "execution-agenda",
    latestAgenda?.primaryCommand ? "proved" : "failed",
    "state_machine",
    "The controller must maintain a bounded execution agenda with a primary command for the next runner.",
    latestAgenda?.outPath ? [latestAgenda.outPath] : agendaArtifacts.map(item => item.path),
    latestAgenda?.primaryCommand ? `Latest agenda primary command is ${latestAgenda.primaryCommand}.` : "No execution agenda with a primary command is present.",
  );
  const latestIssueLedger = await readLatestControllerIssueLedger(state);
  const activeLedgerIssues = latestIssueLedger?.issues.filter(issue => issue.status === "active") ?? [];
  const activeBlockerIssues = activeLedgerIssues.filter(issue => issue.severity === "blocker");
  const activeIssueCodes = uniqueText(activeLedgerIssues.map(issue => issue.issueCode).filter((value): value is string => Boolean(value)));
  add(
    "active-issue-ledger",
    !latestIssueLedger
      ? "warning"
      : activeBlockerIssues.length
        ? "failed"
        : activeLedgerIssues.length
          ? "warning"
          : "proved",
    "state_machine",
    "The active issue ledger must be clear of unresolved blocker-level issues before completion or promotion.",
    latestIssueLedger ? [latestIssueLedger.outPath, ...activeLedgerIssues.flatMap(issue => issue.evidenceRefs).slice(0, 12)] : [],
    !latestIssueLedger
      ? "No issue ledger is available for completion audit."
      : activeBlockerIssues.length
        ? `Active blocker issues remain: ${activeBlockerIssues.slice(0, 6).map(issue => `${issue.issueCode ? `${issue.issueCode}: ` : ""}${issue.message}`).join("; ")}.`
        : activeLedgerIssues.length
          ? `Active nonblocking issues remain: ${activeLedgerIssues.slice(0, 6).map(issue => `${issue.issueCode ? `${issue.issueCode}: ` : ""}${issue.message}`).join("; ")}.`
          : "No active issue-ledger issues remain.",
    activeIssueCodes,
  );
  add(
    "manuscript-and-inspection",
    artifactExists(state, "manuscript") && artifactExists(state, "manuscript-qa") && artifactExists(state, "run-inspection") ? "proved" : "failed",
    "artifacts",
    "The controller must produce manuscript, manuscript QA, and final run inspection artifacts.",
    artifactPaths(state, "manuscript", "manuscript-qa", "run-inspection"),
    artifactExists(state, "manuscript") && artifactExists(state, "manuscript-qa") && artifactExists(state, "run-inspection") ? "Manuscript and inspection artifacts are present." : "Manuscript, manuscript QA, or run inspection artifact is missing.",
  );
  const inspection = await readJsonIfPresent(path.join(state.inputs.runDir, "run-inspection.json"));
  const inspectionReadiness = String(valueAtPath(inspection, "runInspection.readiness") ?? valueAtPath(inspection, "readiness") ?? "");
  add(
    "run-inspection-readiness",
    inspectionReadiness === "local_review_ready" ? "proved" : inspectionReadiness === "needs_methods_review" ? "warning" : "failed",
    "methods",
    "Final promotion requires local-review-ready run inspection, including methods QA, runner capability, companion analysis, and artifact readiness.",
    artifactPaths(state, "run-inspection"),
    inspectionReadiness === "local_review_ready"
      ? "Run inspection is local_review_ready."
      : inspectionReadiness === "needs_methods_review"
        ? "Run inspection requires methods review before external sharing."
        : `Run inspection readiness is ${inspectionReadiness || "missing"}.`,
  );
  const reviewAdjudication = await readJsonIfPresent(path.join(state.inputs.runDir, "review", "review-adjudication.json"));
  const reviewVerdict = String(valueAtPath(reviewAdjudication, "reviewAdjudication.verdict") ?? "");
  const reviewPromotion = externalReviewPromotionStatus(state, reviewVerdict);
  add(
    "external-review-policy",
    reviewPromotion.auditStatus,
    "review",
    "External review must pass before promotion when review is required or enabled.",
    artifactPaths(state, "review-panel", "review-adjudication"),
    reviewPromotion.finding,
  );
  add(
    "cost-boundary",
    state.costEstimateUsd <= state.policy.reviewerBudget.maxStudyLoopUsd + state.policy.controllerBudget.maxStudyLoopUsd ? "proved" : "failed",
    "cost",
    "Estimated model/reviewer cost must remain within declared study-loop budgets.",
    [],
    `Recorded estimated cost is $${state.costEstimateUsd}; reviewer budget=$${state.policy.reviewerBudget.maxStudyLoopUsd}; controller budget=$${state.policy.controllerBudget.maxStudyLoopUsd}.`,
  );
  if (state.policy.requireControllerModel) {
    const modelDecisions = state.decisions.filter(decision => decision.source === "model");
    const modelPreflights = state.artifacts.filter(item => item.kind === "controller-model-preflight" && item.sha256);
    const decisionQuality = state.artifacts.filter(item => item.kind === "controller-decision-quality" && item.sha256);
    add(
      "required-controller-model-preflight",
      modelPreflights.length ? "proved" : "failed",
      "autonomy",
      "Strict model-runner mode requires durable model/provider preflight evidence.",
      modelPreflights.map(item => item.path),
      modelPreflights.length ? `${modelPreflights.length} model preflight artifact(s) are recorded.` : "No model preflight artifact is recorded.",
    );
    add(
      "required-controller-decision-quality",
      decisionQuality.length ? "proved" : "failed",
      "autonomy",
      "Strict model-runner mode requires durable model decision quality evidence.",
      decisionQuality.map(item => item.path),
      decisionQuality.length ? `${decisionQuality.length} model decision quality artifact(s) are recorded.` : "No model decision quality artifact is recorded.",
    );
    add(
      "required-controller-model",
      modelDecisions.length ? "proved" : "failed",
      "autonomy",
      "Runs that require the model controller must contain at least one accepted model-backed controller decision.",
      modelDecisions.map(decision => decision.modelRawPath).filter((value): value is string => Boolean(value)),
      modelDecisions.length
        ? `${modelDecisions.length} accepted model-backed controller decision(s) are recorded.`
        : "No accepted model-backed controller decision is recorded.",
    );
  }
  const failed = requirements.filter(item => item.status === "failed");
  const warnings = requirements.filter(item => item.status === "warning");
  const status: ControllerCompletionAudit["status"] = failed.length ? "fail" : warnings.length ? "warning" : "pass";
  const readiness: ControllerCompletionAudit["readiness"] = failed.length ? "blocked" : warnings.length ? "local_review_only" : "complete";
  const missingEvidence = requirements.filter(item => item.status === "failed").map(item => item.id);
  return {
    schemaVersion: 1,
    generatedAtIso: nowIso(),
    runId: state.runId,
    status,
    readiness,
    requirements,
    missingEvidence,
    nextAction: status === "fail"
      ? "Do not promote. Resolve failed completion-audit requirements and rerun controller-run."
      : status === "warning"
        ? "Treat as local-review only until warning requirements are reviewed."
        : "Completion audit proves controller-run readiness under the current policy.",
    outPath,
    reportPath,
  };
}

async function buildControllerSelfEvaluation(state: ControllerState): Promise<ControllerSelfEvaluation> {
  const outPath = path.join(state.rootDir, "controller-self-evaluation.json");
  const reportPath = path.join(state.rootDir, "controller-self-evaluation.md");
  const checks: ControllerSelfEvaluation["checks"] = [];
  const add = (
    id: string,
    status: "pass" | "warning" | "fail",
    severity: "info" | "minor" | "major" | "blocker",
    message: string,
    evidenceRefs: string[] = [],
    issueCodes: string[] = [],
  ) => {
    checks.push({
      id,
      status,
      severity,
      message,
      ...(issueCodes.length ? { issueCodes: uniqueText(issueCodes) } : {}),
      evidenceRefs: uniqueText(evidenceRefs),
    });
  };
  const requiredStages = requiredStagesBeforePromotion(state);
  const missingStages = requiredStages.filter(stage => !state.completedStages.includes(stage));
  const completedRequired = requiredStages.filter(stage => state.completedStages.includes(stage));
  add(
    "required-stage-coverage",
    missingStages.length ? "fail" : "pass",
    missingStages.length ? "blocker" : "info",
    missingStages.length ? `Missing required controller stage(s): ${missingStages.join(", ")}.` : "All required controller stages before promotion were completed.",
  );
  const failedActions = state.actions.filter(action => action.status === "failed");
  add(
    "action-success",
    failedActions.length ? "fail" : "pass",
    failedActions.length ? "blocker" : "info",
    failedActions.length ? `${failedActions.length} controller action(s) failed.` : "No failed controller actions were recorded.",
    failedActions.flatMap(action => action.artifacts.map(item => item.path)),
  );
  const requiredArtifacts = state.artifacts.filter(item => item.requiredForPromotion);
  const missingArtifacts = requiredArtifacts.filter(item => !item.sha256);
  add(
    "required-artifacts",
    missingArtifacts.length ? "fail" : "pass",
    missingArtifacts.length ? "blocker" : "info",
    missingArtifacts.length ? `${missingArtifacts.length} required artifact(s) are missing hashes or files.` : `${requiredArtifacts.length} required artifact(s) exist with hashes.`,
    missingArtifacts.map(item => item.path),
  );
  const actionContractArtifacts = state.artifacts.filter(item => item.kind === "controller-action-contract");
  const actionContracts = (await Promise.all(actionContractArtifacts.map(item => readJsonIfPresent(item.path))))
    .map(raw => valueAtPath(raw, "controllerActionContract") as Partial<ControllerActionContractCheck> | null)
    .filter((item): item is Partial<ControllerActionContractCheck> => Boolean(item));
  const failedContracts = actionContracts.filter(contract => contract.status === "fail");
  const successfulActionCount = state.actions.filter(action => action.status === "succeeded").length;
  const successfulContractCount = actionContracts.filter(contract => contract.actionStatus === "succeeded").length;
  const missingSuccessfulContracts = Math.max(0, successfulActionCount - successfulContractCount);
  add(
    "action-contracts",
    failedContracts.length || missingSuccessfulContracts ? "fail" : "pass",
    failedContracts.length || missingSuccessfulContracts ? "blocker" : "info",
    failedContracts.length || missingSuccessfulContracts
      ? `${failedContracts.length} action contract(s) failed and ${missingSuccessfulContracts} successful action(s) lack a contract.`
      : `${actionContracts.length} action contract artifact(s) validate controller action outputs.`,
    [...failedContracts.map(contract => contract.outPath).filter((value): value is string => Boolean(value)), ...actionContractArtifacts.map(item => item.path)],
  );
  const stageReviewArtifacts = state.artifacts.filter(item => item.kind === "controller-stage-review");
  const stageReviews = (await Promise.all(stageReviewArtifacts.map(item => readJsonIfPresent(item.path))))
    .map(raw => valueAtPath(raw, "controllerStageReview") as Partial<ControllerStageReview> | null)
    .filter((item): item is Partial<ControllerStageReview> => Boolean(item));
  const blockingStageReviews = stageReviews.filter(review => review.status === "block");
  const missingStageReviews = Math.max(0, state.actions.length - stageReviews.length);
  add(
    "stage-review-coverage",
    blockingStageReviews.length || missingStageReviews ? "fail" : "pass",
    blockingStageReviews.length || missingStageReviews ? "blocker" : "info",
    blockingStageReviews.length || missingStageReviews
      ? `${blockingStageReviews.length} stage review(s) block and ${missingStageReviews} action(s) lack a stage review.`
      : `${stageReviews.length} controller stage review artifact(s) cover completed actions without blockers.`,
    [...blockingStageReviews.map(review => review.outPath).filter((value): value is string => Boolean(value)), ...stageReviewArtifacts.map(item => item.path)],
  );
  const agendaArtifacts = state.artifacts.filter(item => item.kind === "controller-execution-agenda");
  const agendas = (await Promise.all(agendaArtifacts.map(item => readJsonIfPresent(item.path))))
    .map(raw => valueAtPath(raw, "controllerExecutionAgenda") as Partial<ControllerExecutionAgenda> | null)
    .filter((item): item is Partial<ControllerExecutionAgenda> => Boolean(item));
  const latestAgenda = agendas.at(-1);
  add(
    "execution-agenda-coverage",
    latestAgenda?.primaryCommand ? "pass" : "fail",
    latestAgenda?.primaryCommand ? "info" : "blocker",
    latestAgenda?.primaryCommand ? `Latest execution agenda has primary command: ${latestAgenda.primaryCommand}.` : "No execution agenda with a primary command is recorded.",
    latestAgenda?.outPath ? [latestAgenda.outPath] : agendaArtifacts.map(item => item.path),
  );
  const hasAnalysis = state.actions.some(action => action.action === "run_analysis" && action.status === "succeeded");
  if (state.policy.allowContext) {
    const hasContext = artifactExists(state, "controller-context-manifest");
    add("context-preflight-artifact", hasContext ? "pass" : state.policy.requireContext ? "fail" : "warning", hasContext ? "info" : state.policy.requireContext ? "blocker" : "minor", hasContext ? "Context preflight manifest is present." : "Context preflight was enabled but no context manifest artifact is present.", artifactPaths(state, "controller-context-preflight", "controller-context-manifest"));
  }
  const feasibility = await loadControllerFeasibilitySummary(state);
  const feasibilityStatus: "pass" | "warning" | "fail" = !state.inputs.dataPath
    ? "pass"
    : feasibility.status === "block"
      ? "fail"
      : feasibility.status === "warning"
        ? "warning"
        : feasibility.present
          ? "pass"
          : "fail";
  add(
    "feasibility-verdict-artifact",
    feasibilityStatus,
    feasibilityStatus === "fail" ? "blocker" : feasibilityStatus === "warning" ? "major" : "info",
    !state.inputs.dataPath
      ? "No row-level data was supplied; controller feasibility verdict is not required."
      : !feasibility.present
        ? "Controller feasibility verdict is missing for a row-level data run."
        : feasibility.status === "block"
          ? `Controller feasibility verdict blocks execution${feasibility.issueCodes.length ? `: ${feasibility.issueCodes.join(", ")}` : "."}`
          : feasibility.status === "warning"
            ? `Controller feasibility verdict has warnings${feasibility.issueCodes.length ? `: ${feasibility.issueCodes.join(", ")}` : "."}`
            : "Controller feasibility verdict is present and does not block execution.",
    feasibility.path ? [feasibility.path] : artifactPaths(state, "controller-feasibility-verdict"),
    feasibility.issueCodes,
  );
  const datasetSemanticAudit = await loadControllerDatasetSemanticAuditSummary(state);
  add(
    "dataset-semantic-audit",
    !state.inputs.dataPath
      ? "pass"
      : !datasetSemanticAudit.present || datasetSemanticAudit.selectedRoleStatus === "block"
        ? "fail"
        : datasetSemanticAudit.selectedRoleStatus === "warning"
          ? "warning"
          : "pass",
    !state.inputs.dataPath
      ? "info"
      : !datasetSemanticAudit.present || datasetSemanticAudit.selectedRoleStatus === "block"
        ? "blocker"
        : datasetSemanticAudit.selectedRoleStatus === "warning"
          ? "major"
          : "info",
    !state.inputs.dataPath
      ? "No row-level data path was supplied; semantic audit is not applicable."
      : !datasetSemanticAudit.present
        ? "Dataset semantic audit is missing for a row-level data run."
        : datasetSemanticAudit.selectedRoleStatus === "block"
          ? `Selected study roles have semantic blocker(s): ${datasetSemanticAudit.topIssues.filter(issue => issue.selected).map(issue => `${issue.code}: ${issue.message}`).join("; ") || "no detail"}.`
          : datasetSemanticAudit.selectedRoleStatus === "warning"
            ? `Selected study roles have semantic warning(s): ${datasetSemanticAudit.topIssues.filter(issue => issue.selected).map(issue => `${issue.code}: ${issue.message}`).join("; ") || "no detail"}.`
            : datasetSemanticAudit.status === "warning"
              ? `Selected study roles pass semantic plausibility; ${datasetSemanticAudit.issueCount} unused/nonblocking dataset issue(s) remain visible for review.`
              : "Dataset semantic audit passes for selected study roles.",
    uniqueText([datasetSemanticAudit.path, datasetSemanticAudit.reportPath].filter((item): item is string => Boolean(item))),
    uniqueText(datasetSemanticAudit.topIssues.filter(issue => issue.selected && issue.severity !== "note").map(issue => issue.code)),
  );
  add("analysis-executed", hasAnalysis ? "pass" : "fail", hasAnalysis ? "info" : "blocker", hasAnalysis ? "Stats execution succeeded." : "No successful stats execution action is recorded.", artifactPaths(state, "stats-summary", "stats-qa"));
  const hasModelingPlan = artifactExists(state, "controller-modeling-plan");
  add("modeling-plan-artifact", hasModelingPlan ? "pass" : "fail", hasModelingPlan ? "info" : "blocker", hasModelingPlan ? "Controller modeling-plan artifact is present." : "Controller modeling-plan artifact is missing.", artifactPaths(state, "controller-modeling-plan"));
  const hasMethodQa = artifactExists(state, "method-qa");
  add("method-qa-artifact", hasMethodQa ? "pass" : "fail", hasMethodQa ? "info" : "blocker", hasMethodQa ? "Method QA artifact is present." : "Method QA artifact is missing.", artifactPaths(state, "method-qa"));
  const hasManuscript = artifactExists(state, "manuscript") && artifactExists(state, "manuscript-qa");
  add("manuscript-artifacts", hasManuscript ? "pass" : "fail", hasManuscript ? "info" : "blocker", hasManuscript ? "Manuscript and manuscript QA artifacts are present." : "Manuscript or manuscript QA artifact is missing.", artifactPaths(state, "manuscript", "manuscript-qa"));
  const inspection = await readJsonIfPresent(path.join(state.inputs.runDir, "run-inspection.json"));
  const inspectionReadiness = String(valueAtPath(inspection, "runInspection.readiness") ?? valueAtPath(inspection, "readiness") ?? "");
  add(
    "run-inspection-readiness",
    inspectionReadiness === "local_review_ready" ? "pass" : "warning",
    inspectionReadiness === "local_review_ready" ? "info" : "major",
    inspectionReadiness === "local_review_ready" ? "Run inspection reports local review readiness." : `Run inspection readiness is ${inspectionReadiness || "missing"}.`,
    artifactPaths(state, "run-inspection"),
  );
  if (state.repairs.length > 0) {
    const latestRepairVerificationPath = latestArtifactPath(state, "controller-repair-verification");
    const latestRepairVerificationRaw = latestRepairVerificationPath ? await readJsonIfPresent(latestRepairVerificationPath) : null;
    const latestRepairVerification = valueAtPath(latestRepairVerificationRaw, "controllerRepairVerification") as Partial<ControllerRepairVerification> | null;
    const verificationStatus = latestRepairVerification?.status ?? null;
    add(
      "repair-verification-artifact",
      verificationStatus === "pass" || verificationStatus === "warning" ? "pass" : "fail",
      verificationStatus === "pass" ? "info" : verificationStatus === "warning" ? "major" : "blocker",
      verificationStatus === "pass"
        ? "Latest repair verification passed."
        : verificationStatus === "warning"
          ? `Latest repair verification has warnings: ${latestRepairVerification?.nextAction ?? "continue with review"}.`
          : "Reviewer-driven repair verification is missing or failed.",
      latestRepairVerificationPath ? [latestRepairVerificationPath] : artifactPaths(state, "controller-repair-execution"),
    );
  }
  if (state.policy.allowLiterature) {
    const hasLiterature = artifactExists(state, "literature-context") && artifactExists(state, "literature-qa");
    add("literature-lifecycle", hasLiterature ? "pass" : "fail", hasLiterature ? "info" : "blocker", hasLiterature ? "Literature context and post-manuscript literature QA are present." : "Literature was enabled but context or QA artifact is missing.", artifactPaths(state, "literature-context", "literature-qa"));
  }
  if (state.policy.requireExternalReviewForPromotion || state.policy.allowExternalReview) {
    const adjudication = await readJsonIfPresent(path.join(state.inputs.runDir, "review", "review-adjudication.json"));
    const verdict = String(valueAtPath(adjudication, "reviewAdjudication.verdict") ?? "");
    const reviewPromotion = externalReviewPromotionStatus(state, verdict);
    add(
      state.policy.requireExternalReviewForPromotion ? "external-review-required" : "external-review-enabled",
      reviewPromotion.promotionSatisfied ? "pass" : "fail",
      reviewPromotion.promotionSatisfied ? "info" : "blocker",
      reviewPromotion.finding,
      artifactPaths(state, "review-adjudication"),
    );
  }
  if (state.policy.controller.enabled) {
    const modelDecisions = state.decisions.filter(decision => decision.source === "model");
    const hasModelPreflight = artifactExists(state, "controller-model-preflight");
    const hasDecisionQuality = artifactExists(state, "controller-decision-quality");
    add(
      "model-controller-preflight",
      hasModelPreflight ? "pass" : state.policy.requireControllerModel ? "fail" : "warning",
      hasModelPreflight ? "info" : state.policy.requireControllerModel ? "blocker" : "minor",
      hasModelPreflight ? "Controller model preflight artifact is present." : "Controller model is enabled but no model preflight artifact is present.",
      artifactPaths(state, "controller-model-preflight"),
    );
    add(
      "model-decision-quality",
      hasDecisionQuality ? "pass" : state.policy.requireControllerModel ? "fail" : "warning",
      hasDecisionQuality ? "info" : state.policy.requireControllerModel ? "blocker" : "minor",
      hasDecisionQuality ? "Controller decision quality artifact is present." : "Controller model is enabled but no decision quality artifact is present.",
      artifactPaths(state, "controller-decision-quality"),
    );
    add(
      "model-controller-use",
      modelDecisions.length ? "pass" : state.policy.requireControllerModel ? "fail" : "warning",
      modelDecisions.length ? "info" : state.policy.requireControllerModel ? "blocker" : "minor",
      modelDecisions.length
        ? `${modelDecisions.length} model-backed controller decision(s) were used.`
        : state.policy.requireControllerModel
          ? "Controller model was required by policy but no model decision was accepted."
          : "Model controller was enabled but no model decision was accepted.",
      modelDecisions.map(decision => decision.modelRawPath).filter((value): value is string => Boolean(value)),
    );
  }
  const patchFailures = state.patches.filter(patch => patch.status === "rejected");
  add("patch-governance", patchFailures.length ? "warning" : "pass", patchFailures.length ? "major" : "info", patchFailures.length ? `${patchFailures.length} input patch(es) were rejected.` : "No rejected input patches were recorded.", patchFailures.map(patch => patch.outPath));
  const failedTools = state.toolActions.filter(tool => tool.status !== "succeeded");
  add("tool-governance", failedTools.length ? "warning" : "pass", failedTools.length ? "major" : "info", failedTools.length ? `${failedTools.length} tool action(s) failed or were rejected.` : "No failed/rejected controller tool actions were recorded.", failedTools.map(tool => tool.outPath));
  const hasReentryPlan = state.status === "running" || artifactExists(state, "controller-reentry-plan");
  add("reentry-plan-artifact", hasReentryPlan ? "pass" : "warning", hasReentryPlan ? "info" : "major", hasReentryPlan ? "Controller re-entry plan exists for terminal/non-running state or the run is still active." : "Terminal/non-running controller state has no re-entry plan artifact.", artifactPaths(state, "controller-reentry-plan"));
  const capabilityCoverage = controllerCapabilityCoverage(state);
  const failCount = checks.filter(check => check.status === "fail").length;
  const warningCount = checks.filter(check => check.status === "warning").length;
  const score = round(Math.max(0, (checks.length - failCount - warningCount * 0.35) / Math.max(1, checks.length)), 4);
  const status: ControllerSelfEvaluation["status"] = failCount ? "fail" : warningCount ? "warning" : "pass";
  const readiness: ControllerSelfEvaluation["readiness"] = failCount ? "blocked" : warningCount ? "needs_human_review" : "promotable";
  return {
    schemaVersion: 1,
    generatedAtIso: nowIso(),
    evaluationId: `controller_self_eval_${String(state.selfEvaluations.length + 1).padStart(3, "0")}`,
    status,
    readiness,
    score,
    requiredStageCoverage: {
      required: requiredStages,
      completed: completedRequired,
      missing: missingStages,
    },
    capabilityCoverage,
    checks,
    nextAction: status === "fail"
      ? "Do not promote. Resolve failed self-evaluation checks and rerun controller-run."
      : status === "warning"
        ? "Review warning checks before external sharing; promotion may remain local-only."
        : "Controller obligations are satisfied for local promotion.",
    outPath,
    reportPath,
  };
}

function requiredStagesBeforePromotion(state: ControllerState): ControllerStage[] {
  const required: ControllerStage[] = ["intake", "dataset_feasibility", "exploration", "method_selection", "execution", "qa", "manuscript", "inspection"];
  if (state.policy.allowContext) required.splice(required.indexOf("dataset_feasibility"), 0, "context");
  if (state.policy.allowLiterature) {
    required.splice(required.indexOf("method_selection"), 0, "literature");
    required.splice(required.indexOf("inspection"), 0, "literature_qa");
  }
  if (state.policy.allowExternalReview) required.splice(required.indexOf("inspection"), 0, "external_review");
  return required;
}

function artifactExists(state: ControllerState, kind: string): boolean {
  return state.artifacts.some(item => item.kind === kind && Boolean(item.sha256));
}

function artifactPaths(state: ControllerState, ...kinds: string[]): string[] {
  const set = new Set(kinds);
  return state.artifacts.filter(item => set.has(item.kind)).map(item => item.path);
}

function controllerCapabilityCoverage(state: ControllerState): ControllerSelfEvaluation["capabilityCoverage"] {
  const coverage: ControllerSelfEvaluation["capabilityCoverage"] = [];
  const add = (capability: string, applicable: boolean, covered: boolean, evidenceRefs: string[]) => {
    coverage.push({ capability, status: applicable ? covered ? "covered" : "missing" : "not_applicable", evidenceRefs });
  };
  add("dataset_feasibility", Boolean(state.inputs.dataPath), state.completedStages.includes("dataset_feasibility"), artifactPaths(state, "table-summary", "controller-dataset-semantic-audit", "controller-dataset-semantic-audit-report"));
  add("study_feasibility_verdict", Boolean(state.inputs.dataPath), artifactExists(state, "controller-feasibility-verdict"), artifactPaths(state, "controller-feasibility-verdict", "controller-feasibility-report"));
  add("operator_stage_review", state.actions.length > 0, state.artifacts.filter(item => item.kind === "controller-stage-review" && item.sha256).length >= state.actions.length, artifactPaths(state, "controller-stage-review", "controller-stage-review-report"));
  add("execution_agenda", true, state.artifacts.some(item => item.kind === "controller-execution-agenda" && item.sha256), artifactPaths(state, "controller-execution-agenda", "controller-execution-agenda-report"));
  add("supervised_pickup", true, artifactExists(state, "controller-supervisor"), artifactPaths(state, "controller-supervisor", "controller-supervisor-report"));
  add("environment_preflight", true, artifactExists(state, "controller-environment-preflight"), artifactPaths(state, "controller-environment-preflight", "controller-environment-preflight-report"));
  add("context_preflight", state.policy.allowContext, artifactExists(state, "controller-context-manifest"), artifactPaths(state, "controller-context-preflight", "controller-context-manifest"));
  add("exploration", Boolean(state.inputs.dataPath), state.completedStages.includes("exploration"), artifactPaths(state, "exploration", "exploration-report"));
  add("literature_intake", state.policy.allowLiterature, artifactExists(state, "literature-context"), artifactPaths(state, "literature-search", "literature-context"));
  add("method_selection", true, artifactExists(state, "method-selection"), artifactPaths(state, "method-selection"));
  add("modeling_plan", true, artifactExists(state, "controller-modeling-plan"), artifactPaths(state, "controller-modeling-plan"));
  add("analysis_execution", state.policy.allowExecution, state.actions.some(action => action.action === "run_analysis" && action.status === "succeeded"), artifactPaths(state, "stats-summary", "stats-qa"));
  add("methods_qa", true, artifactExists(state, "method-qa"), artifactPaths(state, "method-qa"));
  add("manuscript_generation", true, artifactExists(state, "manuscript") && artifactExists(state, "manuscript-qa"), artifactPaths(state, "manuscript", "manuscript-qa"));
  add("literature_qa", state.policy.allowLiterature, artifactExists(state, "literature-qa"), artifactPaths(state, "literature-qa"));
  add("external_review", state.policy.allowExternalReview || state.policy.requireExternalReviewForPromotion, artifactExists(state, "review-adjudication"), artifactPaths(state, "review-panel", "review-adjudication"));
  add(
    "bounded_repair",
    state.repairs.length > 0,
    state.repairs.some(repair => repair.status === "succeeded" || repair.status === "partial") && artifactExists(state, "controller-repair-verification"),
    uniqueText([
      ...state.repairs.map(repair => repair.outPath),
      ...artifactPaths(state, "controller-repair-execution", "controller-repair-verification", "controller-repair-verification-report"),
    ]),
  );
  add("model_control", state.policy.controller.enabled, state.decisions.some(decision => decision.source === "model"), state.decisions.map(decision => decision.modelRawPath).filter((value): value is string => Boolean(value)));
  add("tool_actions", state.toolActions.length > 0, state.toolActions.every(tool => tool.status === "succeeded"), state.toolActions.map(tool => tool.outPath));
  add("bounded_agenteer_introspection", state.policy.allowToolActions && state.policy.allowedToolIds.includes("controller-run-agenteer"), artifactExists(state, "controller-agenteer-command"), artifactPaths(state, "controller-agenteer-command", "controller-agenteer-command-stderr"));
  add("model_runner_packet", true, artifactExists(state, "controller-model-runner-packet"), artifactPaths(state, "controller-model-runner-packet", "controller-model-runner-packet-report"));
  add("operational_status", true, artifactExists(state, "controller-status"), artifactPaths(state, "controller-status", "controller-status-report"));
  add("actionable_run_inspection_recovery", true, artifactExists(state, "controller-execution-agenda") && artifactExists(state, "controller-model-runner-packet") && (state.status === "running" || artifactExists(state, "controller-terminal-handoff") && artifactExists(state, "controller-next-action")), artifactPaths(state, "run-inspection", "controller-execution-agenda", "controller-terminal-handoff", "controller-next-action", "controller-model-runner-packet", "controller-runbook"));
  add("continuous_benchmark_regression_suite", true, artifactExists(state, "continuous-benchmark-suite") && artifactExists(state, "continuous-benchmark-trend"), artifactPaths(state, "controller-benchmark", "controller-benchmark-report", "continuous-benchmark-suite", "continuous-benchmark-suite-report", "continuous-benchmark-trend", "continuous-benchmark-trend-report"));
  add("safe_patching", state.patches.length > 0, state.patches.every(patch => patch.status === "applied"), state.patches.map(patch => patch.outPath));
  add("state_reentry_plan", state.status !== "running", artifactExists(state, "controller-reentry-plan"), artifactPaths(state, "controller-reentry-plan", "controller-reentry-plan-report"));
  add("inspection", true, artifactExists(state, "run-inspection"), artifactPaths(state, "run-inspection"));
  return coverage;
}

function renderControllerSelfEvaluationMarkdown(evaluation: ControllerSelfEvaluation): string {
  return [
    "# Controller Self-Evaluation",
    "",
    `- Evaluation: ${evaluation.evaluationId}`,
    `- Status: ${evaluation.status}`,
    `- Readiness: ${evaluation.readiness}`,
    `- Score: ${evaluation.score}`,
    "",
    "## Required Stage Coverage",
    "",
    `- Required: ${evaluation.requiredStageCoverage.required.join(", ")}`,
    `- Completed: ${evaluation.requiredStageCoverage.completed.join(", ") || "(none)"}`,
    `- Missing: ${evaluation.requiredStageCoverage.missing.join(", ") || "(none)"}`,
    "",
    "## Checks",
    "",
    ...evaluation.checks.map(check => `- ${check.status.toUpperCase()} [${check.severity}${check.issueCodes?.length ? `:${check.issueCodes.join(",")}` : ""}] ${check.id}: ${check.message}${check.evidenceRefs.length ? ` Evidence: ${check.evidenceRefs.join(", ")}` : ""}`),
    "",
    "## Capability Coverage",
    "",
    ...evaluation.capabilityCoverage.map(item => `- ${item.status}: ${item.capability}${item.evidenceRefs.length ? ` (${item.evidenceRefs.join(", ")})` : ""}`),
    "",
    `Next: ${evaluation.nextAction}`,
    "",
  ].join("\n");
}

function renderControllerCompletionAuditMarkdown(audit: ControllerCompletionAudit): string {
  return [
    "# Controller Completion Audit",
    "",
    `- Run: ${audit.runId}`,
    `- Status: ${audit.status}`,
    `- Readiness: ${audit.readiness}`,
    `- Missing evidence: ${audit.missingEvidence.join(", ") || "(none)"}`,
    "",
    "## Requirements",
    "",
    ...audit.requirements.map(item => `- ${item.status.toUpperCase()} [${item.scope}${item.issueCodes?.length ? `:${item.issueCodes.join(",")}` : ""}] ${item.id}: ${item.requirement} ${item.finding}${item.evidenceRefs.length ? ` Evidence: ${item.evidenceRefs.join(", ")}` : ""}`),
    "",
    `Next: ${audit.nextAction}`,
    "",
  ].join("\n");
}

function renderControllerGoldenPacketMarkdown(packet: ControllerGoldenPacket): string {
  return [
    "# Controller Golden Packet",
    "",
    `- Run: ${packet.runId}`,
    `- Status: ${packet.status}`,
    `- Stage: ${packet.stage}`,
    `- Question: ${packet.question}`,
    `- Method: ${packet.method ?? "(not selected)"}`,
    "",
    "## Readiness",
    "",
    `- Run inspection: ${packet.readiness.runInspection ?? "missing"}`,
    `- Feasibility readiness: ${packet.readiness.feasibilityReadiness ?? "missing"}${packet.readiness.feasibilityVerdict ? `; verdict: ${packet.readiness.feasibilityVerdict}` : ""}`,
    `- Completion audit: ${packet.readiness.completionAudit}`,
    `- Self-evaluation: ${packet.readiness.selfEvaluation}`,
    `- Promotion decision: ${packet.readiness.promotionDecision}`,
    `- Promotable: ${packet.readiness.promotable ? "yes" : "no"}`,
    "",
    "## Counts",
    "",
    `- Actions: ${packet.counts.actions}`,
    `- Artifacts: ${packet.counts.artifacts}`,
    `- Blockers: ${packet.counts.blockers}`,
    `- Warnings: ${packet.counts.warnings}`,
    `- Required artifacts missing hashes: ${packet.counts.requiredArtifactsMissingHash}`,
    `- Active issue codes: ${packet.activeIssueCodes.join(", ") || "(none)"}`,
    `- Active blocker issue codes: ${packet.activeBlockerIssueCodes.join(", ") || "(none)"}`,
    "",
    "## Dataset Semantic Audit",
    "",
    `- Present: ${packet.datasetSemanticAudit.present}`,
    `- Status: ${packet.datasetSemanticAudit.status}`,
    `- Selected-role status: ${packet.datasetSemanticAudit.selectedRoleStatus}`,
    `- Issues: ${packet.datasetSemanticAudit.issueCount} (${packet.datasetSemanticAudit.blockerCount} blocker, ${packet.datasetSemanticAudit.warningCount} warning)`,
    ...(packet.datasetSemanticAudit.topIssues.length ? packet.datasetSemanticAudit.topIssues.map(issue => `- ${issue.severity.toUpperCase()} ${issue.column}${issue.selected ? " [selected]" : ""}: ${issue.code} - ${issue.message}`) : ["- Issue: none"]),
    `- Next action: ${packet.datasetSemanticAudit.nextAction ?? "(none)"}`,
    "",
    "## Blockers",
    "",
    ...(packet.blockers.length ? packet.blockers.map(item => `- ${item}`) : ["- None"]),
    "",
    "## Issue Summary",
    "",
    ...(packet.issueSummary.length
      ? packet.issueSummary.map(item => `- ${item.severity.toUpperCase()} [${item.category}${item.issueCodes.length ? `:${item.issueCodes.join(",")}` : ""}] ${item.message}${item.evidenceRefs.length ? ` Evidence: ${item.evidenceRefs.join(", ")}` : ""}`)
      : ["- None"]),
    "",
    "## Warnings",
    "",
    ...(packet.warnings.length ? packet.warnings.map(item => `- ${item}`) : ["- None"]),
    "",
    "## Stage Summary",
    "",
    ...packet.stageSummary.map(item => `- ${item.stage}: ${item.completed ? "completed" : "not completed"}${item.latestAction ? `; latest action ${item.latestAction} ${item.actionStatus ?? "unknown"}` : ""}; evidence refs=${item.evidenceRefs.length}`),
    "",
    "## Key Artifacts",
    "",
    ...Object.entries(packet.keyArtifacts).map(([key, value]) => `- ${key}: ${value ?? "missing"}`),
    "",
    "## Key Artifact Reports",
    "",
    ...Object.entries(packet.keyArtifactReports).map(([key, value]) => `- ${key}: ${value ?? "not report-backed"}`),
    "",
    "## Next Action",
    "",
    packet.nextAction,
    "",
    "## Recommended Commands",
    "",
    ...(packet.recommendedCommands.length
      ? packet.recommendedCommands.flatMap(command => ["```bash", command, "```", ""])
      : ["None recorded.", ""]),
  ].join("\n");
}

async function executeControllerTools(state: ControllerState, requests: ControllerToolRequest[]): Promise<ControllerToolExecution[]> {
  const executions: ControllerToolExecution[] = [];
  for (const request of requests) {
    const validation = validateControllerToolRequests(state, [request]);
    const toolRunId = `tool_${String(state.toolActions.length + executions.length + 1).padStart(3, "0")}`;
    const outPath = path.join(state.rootDir, `${toolRunId}.json`);
    if (validation.status === "invalid") {
      const rejected: ControllerToolExecution = {
        schemaVersion: 1,
        generatedAtIso: nowIso(),
        toolRunId,
        request,
        status: "rejected",
        command: null,
        exitCode: null,
        stdoutPath: null,
        stderrPath: null,
        stdoutPreview: "",
        stderrPreview: "",
        validationReasons: validation.reasons,
        inspection: null,
        outPath,
      };
      await writeJson(outPath, { schemaVersion: 1, controllerToolExecution: rejected });
      executions.push(rejected);
      continue;
    }
    if (request.toolId === "controller-status") {
      await persistState(state);
      const status = await researchControllerStatusCommand({
        statePath: state.statePath,
        reason: request.reason,
      });
      Object.assign(state, status.state);
      const stdoutPath = path.join(state.rootDir, `${toolRunId}.stdout.txt`);
      const stdout = JSON.stringify({ schemaVersion: 1, controllerStatus: status }, null, 2);
      await writeFile(stdoutPath, `${stdout}\n`);
      const execution: ControllerToolExecution = {
        schemaVersion: 1,
        generatedAtIso: nowIso(),
        toolRunId,
        request,
        status: "succeeded",
        command: null,
        exitCode: 0,
        stdoutPath,
        stderrPath: null,
        stdoutPreview: stdout.slice(0, 2000),
        stderrPreview: "",
        validationReasons: validation.reasons,
        inspection: null,
        outPath,
      };
      await writeJson(outPath, { schemaVersion: 1, controllerToolExecution: execution });
      executions.push(execution);
      continue;
    }
    if (request.toolId === "controller-inspect") {
      const inspection = await inspectControllerStateForTool(state);
      const stdoutPath = path.join(state.rootDir, `${toolRunId}.stdout.txt`);
      const stdout = JSON.stringify({ schemaVersion: 1, controllerInspection: inspection }, null, 2);
      await writeFile(stdoutPath, `${stdout}\n`);
      const execution: ControllerToolExecution = {
        schemaVersion: 1,
        generatedAtIso: nowIso(),
        toolRunId,
        request,
        status: inspection.status === "fail" ? "failed" : "succeeded",
        command: null,
        exitCode: inspection.status === "fail" ? 1 : 0,
        stdoutPath,
        stderrPath: null,
        stdoutPreview: stdout.slice(0, 2000),
        stderrPreview: "",
        validationReasons: validation.reasons,
        inspection,
        outPath,
      };
      await writeJson(outPath, { schemaVersion: 1, controllerToolExecution: execution });
      executions.push(execution);
      continue;
    }
    if (request.toolId === "controller-read-artifact") {
      const artifactRead = await readControllerArtifactForTool(state, request.args[0] ?? "");
      const stdoutPath = path.join(state.rootDir, `${toolRunId}.stdout.txt`);
      const stdout = JSON.stringify({ schemaVersion: 1, controllerArtifactRead: artifactRead }, null, 2);
      await writeFile(stdoutPath, `${stdout}\n`);
      const execution: ControllerToolExecution = {
        schemaVersion: 1,
        generatedAtIso: nowIso(),
        toolRunId,
        request,
        status: artifactRead.status === "found" ? "succeeded" : "failed",
        command: null,
        exitCode: artifactRead.status === "found" ? 0 : 1,
        stdoutPath,
        stderrPath: null,
        stdoutPreview: stdout.slice(0, 2000),
        stderrPreview: "",
        validationReasons: validation.reasons,
        inspection: null,
        outPath,
      };
      await writeJson(outPath, { schemaVersion: 1, controllerToolExecution: execution });
      executions.push(execution);
      continue;
    }
    if (request.toolId === "controller-read-file") {
      const fileRead = await readControllerRepoFileForTool(state, request.args[0] ?? "");
      const stdoutPath = path.join(state.rootDir, `${toolRunId}.stdout.txt`);
      const stdout = JSON.stringify({ schemaVersion: 1, controllerRepoFileRead: fileRead }, null, 2);
      await writeFile(stdoutPath, `${stdout}\n`);
      const execution: ControllerToolExecution = {
        schemaVersion: 1,
        generatedAtIso: nowIso(),
        toolRunId,
        request,
        status: fileRead.status === "found" ? "succeeded" : "failed",
        command: null,
        exitCode: fileRead.status === "found" ? 0 : 1,
        stdoutPath,
        stderrPath: null,
        stdoutPreview: stdout.slice(0, 2000),
        stderrPreview: "",
        validationReasons: validation.reasons,
        inspection: null,
        outPath,
      };
      await writeJson(outPath, { schemaVersion: 1, controllerToolExecution: execution });
      executions.push(execution);
      continue;
    }
    if (request.toolId === "controller-search-repo") {
      const searchResult = await searchControllerRepoForTool(state, request.args[0] ?? "", request.args[1] ?? "");
      const stdoutPath = path.join(state.rootDir, `${toolRunId}.stdout.txt`);
      const stdout = JSON.stringify({ schemaVersion: 1, controllerRepoSearch: searchResult }, null, 2);
      await writeFile(stdoutPath, `${stdout}\n`);
      const execution: ControllerToolExecution = {
        schemaVersion: 1,
        generatedAtIso: nowIso(),
        toolRunId,
        request,
        status: searchResult.status === "found" ? "succeeded" : "failed",
        command: null,
        exitCode: searchResult.status === "found" ? 0 : 1,
        stdoutPath,
        stderrPath: null,
        stdoutPreview: stdout.slice(0, 2000),
        stderrPreview: "",
        validationReasons: validation.reasons,
        inspection: null,
        outPath,
      };
      await writeJson(outPath, { schemaVersion: 1, controllerToolExecution: execution });
      executions.push(execution);
      continue;
    }
    if (request.toolId === "controller-run-agenteer") {
      const command = buildControllerToolCommand(state, request);
      const stdoutPath = path.join(state.rootDir, `${toolRunId}.stdout.txt`);
      const rawStdoutPath = path.join(state.rootDir, `${toolRunId}.agenteer.stdout.txt`);
      const rawStderrPath = path.join(state.rootDir, `${toolRunId}.agenteer.stderr.txt`);
      const commandResult = await runControllerAgenteerCommand(command, validation.reasons, rawStdoutPath, rawStderrPath);
      const stdout = JSON.stringify({ schemaVersion: 1, controllerAgenteerCommand: commandResult }, null, 2);
      await writeFile(stdoutPath, `${stdout}\n`);
      const execution: ControllerToolExecution = {
        schemaVersion: 1,
        generatedAtIso: nowIso(),
        toolRunId,
        request,
        status: commandResult.status === "passed" ? "succeeded" : "failed",
        command,
        exitCode: commandResult.exitCode,
        stdoutPath,
        stderrPath: rawStderrPath,
        stdoutPreview: stdout.slice(0, 2000),
        stderrPreview: commandResult.stderrPreview,
        validationReasons: validation.reasons,
        inspection: null,
        outPath,
      };
      await writeJson(outPath, { schemaVersion: 1, controllerToolExecution: execution });
      executions.push(execution);
      continue;
    }
    if (request.toolId === "controller-git-diff") {
      const snapshot = await readControllerGitDiffSnapshot(state, request.args[0] ?? "");
      const stdoutPath = path.join(state.rootDir, `${toolRunId}.stdout.txt`);
      const stdout = JSON.stringify({ schemaVersion: 1, controllerGitDiff: snapshot }, null, 2);
      await writeFile(stdoutPath, `${stdout}\n`);
      const execution: ControllerToolExecution = {
        schemaVersion: 1,
        generatedAtIso: nowIso(),
        toolRunId,
        request,
        status: "succeeded",
        command: null,
        exitCode: 0,
        stdoutPath,
        stderrPath: null,
        stdoutPreview: stdout.slice(0, 2000),
        stderrPreview: "",
        validationReasons: validation.reasons,
        inspection: null,
        outPath,
      };
      await writeJson(outPath, { schemaVersion: 1, controllerToolExecution: execution });
      executions.push(execution);
      continue;
    }
    if (request.toolId === "controller-propose-patch") {
      const proposal = await buildControllerSourcePatchProposal(state, request.args[0] ?? "");
      const stdoutPath = path.join(state.rootDir, `${toolRunId}.stdout.txt`);
      const stdout = JSON.stringify({ schemaVersion: 1, controllerSourcePatchProposal: proposal }, null, 2);
      await writeFile(stdoutPath, `${stdout}\n`);
      const execution: ControllerToolExecution = {
        schemaVersion: 1,
        generatedAtIso: nowIso(),
        toolRunId,
        request,
        status: proposal.status === "valid" ? "succeeded" : "failed",
        command: null,
        exitCode: proposal.status === "valid" ? 0 : 1,
        stdoutPath,
        stderrPath: null,
        stdoutPreview: stdout.slice(0, 2000),
        stderrPreview: "",
        validationReasons: validation.reasons,
        inspection: null,
        outPath,
      };
      await writeJson(outPath, { schemaVersion: 1, controllerToolExecution: execution });
      executions.push(execution);
      continue;
    }
    if (request.toolId === "controller-apply-patch") {
      const applyResult = await applyControllerSourcePatchProposal(state, request.args[0] ?? "");
      const stdoutPath = path.join(state.rootDir, `${toolRunId}.stdout.txt`);
      const stdout = JSON.stringify({ schemaVersion: 1, controllerSourcePatchApply: applyResult }, null, 2);
      await writeFile(stdoutPath, `${stdout}\n`);
      const execution: ControllerToolExecution = {
        schemaVersion: 1,
        generatedAtIso: nowIso(),
        toolRunId,
        request,
        status: applyResult.status === "applied" ? "succeeded" : "failed",
        command: null,
        exitCode: applyResult.status === "applied" ? 0 : 1,
        stdoutPath,
        stderrPath: null,
        stdoutPreview: stdout.slice(0, 2000),
        stderrPreview: "",
        validationReasons: validation.reasons,
        inspection: null,
        outPath,
      };
      await writeJson(outPath, { schemaVersion: 1, controllerToolExecution: execution });
      executions.push(execution);
      continue;
    }
    if (request.toolId === "controller-verify-patch") {
      const verification = await verifyControllerSourcePatch(state, request.args[0] ?? "latest");
      const stdoutPath = path.join(state.rootDir, `${toolRunId}.stdout.txt`);
      const stdout = JSON.stringify({ schemaVersion: 1, controllerSourcePatchVerification: verification }, null, 2);
      await writeFile(stdoutPath, `${stdout}\n`);
      const execution: ControllerToolExecution = {
        schemaVersion: 1,
        generatedAtIso: nowIso(),
        toolRunId,
        request,
        status: verification.status === "passed" ? "succeeded" : "failed",
        command: null,
        exitCode: verification.status === "passed" ? 0 : 1,
        stdoutPath,
        stderrPath: null,
        stdoutPreview: stdout.slice(0, 2000),
        stderrPreview: "",
        validationReasons: validation.reasons,
        inspection: null,
        outPath,
      };
      await writeJson(outPath, { schemaVersion: 1, controllerToolExecution: execution });
      executions.push(execution);
      continue;
    }
    if (request.toolId === "controller-rollback-patch") {
      const rollback = await rollbackControllerSourcePatch(state, request.args[0] ?? "latest");
      const stdoutPath = path.join(state.rootDir, `${toolRunId}.stdout.txt`);
      const stdout = JSON.stringify({ schemaVersion: 1, controllerSourcePatchRollback: rollback }, null, 2);
      await writeFile(stdoutPath, `${stdout}\n`);
      const execution: ControllerToolExecution = {
        schemaVersion: 1,
        generatedAtIso: nowIso(),
        toolRunId,
        request,
        status: rollback.status === "rolled_back" ? "succeeded" : "failed",
        command: null,
        exitCode: rollback.status === "rolled_back" ? 0 : 1,
        stdoutPath,
        stderrPath: null,
        stdoutPreview: stdout.slice(0, 2000),
        stderrPreview: "",
        validationReasons: validation.reasons,
        inspection: null,
        outPath,
      };
      await writeJson(outPath, { schemaVersion: 1, controllerToolExecution: execution });
      executions.push(execution);
      continue;
    }
    const command = buildControllerToolCommand(state, request);
    const stdoutPath = path.join(state.rootDir, `${toolRunId}.stdout.txt`);
    const stderrPath = path.join(state.rootDir, `${toolRunId}.stderr.txt`);
    try {
      const result = await execFileAsync(command.executable, command.args, {
        cwd: command.cwd,
        timeout: command.timeoutMs,
        maxBuffer: 1024 * 1024 * 8,
      });
      const stdout = String(result.stdout ?? "");
      const stderr = String(result.stderr ?? "");
      await writeFile(stdoutPath, stdout);
      await writeFile(stderrPath, stderr);
      const execution: ControllerToolExecution = {
        schemaVersion: 1,
        generatedAtIso: nowIso(),
        toolRunId,
        request,
        status: "succeeded",
        command,
        exitCode: 0,
        stdoutPath,
        stderrPath,
        stdoutPreview: stdout.slice(0, 2000),
        stderrPreview: stderr.slice(0, 2000),
        validationReasons: validation.reasons,
        inspection: null,
        outPath,
      };
      await writeJson(outPath, { schemaVersion: 1, controllerToolExecution: execution });
      executions.push(execution);
    } catch (error) {
      const maybe = error as { stdout?: unknown; stderr?: unknown; code?: unknown };
      const stdout = String(maybe.stdout ?? "");
      const stderr = String(maybe.stderr ?? (error instanceof Error ? error.message : String(error)));
      await writeFile(stdoutPath, stdout);
      await writeFile(stderrPath, stderr);
      const execution: ControllerToolExecution = {
        schemaVersion: 1,
        generatedAtIso: nowIso(),
        toolRunId,
        request,
        status: "failed",
        command,
        exitCode: typeof maybe.code === "number" ? maybe.code : null,
        stdoutPath,
        stderrPath,
        stdoutPreview: stdout.slice(0, 2000),
        stderrPreview: stderr.slice(0, 2000),
        validationReasons: validation.reasons,
        inspection: null,
        outPath,
      };
      await writeJson(outPath, { schemaVersion: 1, controllerToolExecution: execution });
      executions.push(execution);
    }
  }
  return executions;
}

function validateControllerToolRequests(state: ControllerState, requests: ControllerToolRequest[]): ControllerDecision["toolValidation"] {
  const reasons: string[] = [];
  const batchEvidenceKeys = new Set<string>();
  for (const request of requests) {
    const parsed = controllerToolRequestSchema.safeParse(request);
    if (!parsed.success) reasons.push(`Tool request schema invalid: ${parsed.error.message}`);
    if (!state.policy.allowToolActions) reasons.push("Tool actions are disabled by controller policy.");
    if (!state.policy.allowedToolIds.includes(request.toolId)) reasons.push(`Tool ${request.toolId} is not allowed by controller policy.`);
    if (state.toolActions.length + requests.length > state.policy.maxToolActions) reasons.push(`Tool action ceiling would be exceeded (${state.policy.maxToolActions}).`);
    if (request.toolId === "npm-test" && request.args.some(arg => /(^|\/)\.\.(\/|$)/.test(arg) || arg.startsWith("-"))) reasons.push("npm-test tool args may only be test file paths without parent traversal or npm flags.");
    if (request.toolId === "controller-read-artifact") {
      if (request.args.length !== 1) reasons.push("controller-read-artifact requires exactly one artifact kind, basename, or in-run artifact path argument.");
      if (request.args.some(arg => arg.startsWith("-") || /(^|\/)\.\.(\/|$)/.test(arg))) reasons.push("controller-read-artifact args may not contain flags or parent traversal.");
    } else if (request.toolId === "controller-read-file") {
      if (request.args.length !== 1) reasons.push("controller-read-file requires exactly one repository-relative file path argument.");
      if (request.args.some(arg => arg.startsWith("-") || path.isAbsolute(arg) || /(^|\/)\.\.(\/|$)/.test(arg))) reasons.push("controller-read-file args may not contain flags, absolute paths, or parent traversal.");
    } else if (request.toolId === "controller-search-repo") {
      if (request.args.length < 1 || request.args.length > 2) reasons.push("controller-search-repo requires a search query and accepts at most one optional repository-relative scope.");
      if ((request.args[0] ?? "").trim().length < 2) reasons.push("controller-search-repo query must be at least two characters.");
      if ((request.args[0] ?? "").length > 200) reasons.push("controller-search-repo query is too long.");
      const scope = request.args[1] ?? "";
      if (scope && (scope.startsWith("-") || path.isAbsolute(scope) || /(^|\/)\.\.(\/|$)/.test(scope))) reasons.push("controller-search-repo scope may not contain flags, absolute paths, or parent traversal.");
    } else if (request.toolId === "controller-run-agenteer") {
      const commandValidation = validateControllerAgenteerCommandArgs(request.args, state);
      reasons.push(...commandValidation.reasons);
    } else if (request.toolId === "controller-git-diff") {
      if (request.args.length > 1) reasons.push("controller-git-diff accepts at most one optional in-repo path argument.");
      if (request.args.some(arg => arg.startsWith("-") || /(^|\/)\.\.(\/|$)/.test(arg) || path.isAbsolute(arg))) reasons.push("controller-git-diff args may not contain flags, absolute paths, or parent traversal.");
    } else if (request.toolId === "controller-propose-patch") {
      if (request.args.length !== 1) reasons.push("controller-propose-patch requires exactly one JSON proposal argument or in-run proposal file path.");
      const arg = request.args[0] ?? "";
      if (arg.startsWith("-")) reasons.push("controller-propose-patch arg may not contain flags.");
      if (!arg.trim().startsWith("{") && /(^|\/)\.\.(\/|$)/.test(arg)) reasons.push("controller-propose-patch proposal file path may not contain parent traversal.");
      if (arg.length > 600_000) reasons.push("controller-propose-patch arg is too large.");
    } else if (request.toolId === "controller-apply-patch") {
      if (request.args.length !== 1) reasons.push("controller-apply-patch requires exactly one controller patch proposal selector.");
      const arg = request.args[0] ?? "";
      if (arg.startsWith("-") || /(^|\/)\.\.(\/|$)/.test(arg)) reasons.push("controller-apply-patch selector may not contain flags or parent traversal.");
    } else if (request.toolId === "controller-verify-patch" || request.toolId === "controller-rollback-patch") {
      if (request.args.length > 1) reasons.push(`${request.toolId} accepts at most one apply-result selector.`);
      const arg = request.args[0] ?? "";
      if (arg && (arg.startsWith("-") || /(^|\/)\.\.(\/|$)/.test(arg))) reasons.push(`${request.toolId} selector may not contain flags or parent traversal.`);
    } else if (request.toolId !== "npm-test" && request.args.length) {
      reasons.push(`${request.toolId} does not accept caller-controlled args.`);
    }
    if (requestIsEvidenceGathering(request)) {
      const key = toolRequestKey(request);
      if (batchEvidenceKeys.has(key)) reasons.push(`Duplicate evidence tool request ${key} appears more than once in the same decision.`);
      batchEvidenceKeys.add(key);
      const repeated = repeatedEvidenceToolRequest(state, request);
      if (repeated) reasons.push(`Repeated evidence tool request ${key} already succeeded at stage ${state.currentStage}; use recentToolResults or choose the next stage action instead of rereading unchanged evidence.`);
    }
  }
  return reasons.length ? { status: "invalid", reasons } : { status: "valid", reasons: ["Tool request(s) satisfy controller policy."] };
}

function buildControllerToolCommand(state: ControllerState, request: ControllerToolRequest): NonNullable<ControllerToolExecution["command"]> {
  const cwd = repoRootFromState(state);
  if (request.toolId === "npm-build") return { executable: "npm", args: ["run", "build"], cwd, timeoutMs: state.policy.toolTimeoutMs };
  if (request.toolId === "npm-test") return { executable: "npm", args: ["test", "--", ...request.args], cwd, timeoutMs: state.policy.toolTimeoutMs };
  if (request.toolId === "controller-run-agenteer") {
    const validation = validateControllerAgenteerCommandArgs(request.args, state);
    if (!validation.commandArgs) throw new Error(`Invalid controller-run-agenteer command: ${validation.reasons.join("; ")}`);
    return {
      executable: "node",
      args: [path.join(cwd, "packages", "cli", "dist", "bin", "agenteer.js"), ...validation.commandArgs],
      cwd,
      timeoutMs: state.policy.toolTimeoutMs,
    };
  }
  throw new Error(`No external command is registered for controller tool ${request.toolId}.`);
}

function toolRequiresModelReentry(execution: ControllerToolExecution): boolean {
  return execution.status === "succeeded" && (execution.request.toolId === "controller-status" || execution.request.toolId === "controller-inspect" || execution.request.toolId === "controller-read-artifact" || execution.request.toolId === "controller-read-file" || execution.request.toolId === "controller-search-repo" || execution.request.toolId === "controller-run-agenteer" || execution.request.toolId === "controller-git-diff" || execution.request.toolId === "controller-propose-patch" || execution.request.toolId === "controller-apply-patch" || execution.request.toolId === "controller-verify-patch" || execution.request.toolId === "controller-rollback-patch");
}

function requestIsEvidenceGathering(request: ControllerToolRequest): boolean {
  return request.toolId === "controller-status" || request.toolId === "controller-inspect" || request.toolId === "controller-read-artifact" || request.toolId === "controller-read-file" || request.toolId === "controller-search-repo" || request.toolId === "controller-run-agenteer" || request.toolId === "controller-git-diff";
}

function toolRequestKey(request: ControllerToolRequest): string {
  return `${request.toolId}:${JSON.stringify(request.args)}`;
}

function repeatedEvidenceToolRequest(state: ControllerState, request: ControllerToolRequest): ControllerToolExecution | null {
  const lastActionFinishedAt = state.actions.at(-1)?.finishedAtIso ?? "";
  const key = toolRequestKey(request);
  return [...state.toolActions].reverse().find(tool => {
    if (tool.status !== "succeeded") return false;
    if (toolRequestKey(tool.request) !== key) return false;
    if (lastActionFinishedAt && tool.generatedAtIso <= lastActionFinishedAt) return false;
    return controllerToolExecutionStage(state, tool) === state.currentStage;
  }) ?? null;
}

function controllerToolExecutionStage(state: ControllerState, execution: ControllerToolExecution): ControllerStage | null {
  return state.artifacts.find(item => item.kind === "controller-tool-action" && path.resolve(item.path) === path.resolve(execution.outPath))?.stage ?? null;
}

function validateControllerAgenteerCommandArgs(args: string[], state: ControllerState): { reasons: string[]; commandArgs: string[] | null } {
  const reasons: string[] = [];
  const clean = args.map(arg => arg.trim()).filter(Boolean);
  if (!clean.length) reasons.push("controller-run-agenteer requires an Agenteer CLI argument vector.");
  if (clean.length > 8) reasons.push("controller-run-agenteer accepts at most eight command arguments.");
  const currentStatePath = path.resolve(state.statePath);
  const isAllowedStatePath = (value: string): boolean => path.resolve(value) === currentStatePath;
  if (clean.some(arg => /(^|\/)\.\.(\/|$)/.test(arg) || (path.isAbsolute(arg) && !isAllowedStatePath(arg)))) reasons.push("controller-run-agenteer args may not contain absolute paths or parent traversal except the current controller --state path.");
  const allowedValue = /^[A-Za-z0-9_.:-]+$/;
  const safeValue = (value: string, flag?: string) => (flag === "--state" && isAllowedStatePath(value)) || (allowedValue.test(value) && !value.startsWith("-"));
  const checkFlags = (allowedFlags: Record<string, "none" | "value">) => {
    for (let index = 2; index < clean.length; index += 1) {
      const flag = clean[index] ?? "";
      const arity = allowedFlags[flag];
      if (!arity) {
        reasons.push(`Flag or argument ${flag} is not allowed for ${clean.slice(0, 2).join(" ")}.`);
        continue;
      }
      if (arity === "value") {
        const value = clean[index + 1] ?? "";
        if (!safeValue(value, flag)) reasons.push(`Flag ${flag} requires a safe scalar value.`);
        index += 1;
      }
    }
  };
  if (clean[0] !== "research") {
    reasons.push("controller-run-agenteer only permits read-only agenteer research subcommands.");
  } else {
    const subcommand = clean[1] ?? "";
    if (subcommand === "methods-catalog") {
      checkFlags({ "--json": "none", "--category": "value", "--method": "value" });
    } else if (subcommand === "archetypes") {
      checkFlags({ "--json": "none", "--id": "value" });
    } else if (subcommand === "machine-status" || subcommand === "phenotype-list" || subcommand === "reviewer-providers") {
      checkFlags({ "--json": "none" });
    } else if (subcommand === "controller-status") {
      checkFlags({ "--json": "none", "--state": "value" });
      if (!clean.includes("--state")) reasons.push("controller-status through controller-run-agenteer requires --state set to the current controller state path.");
    } else {
      reasons.push(`Read-only research subcommand ${subcommand || "(missing)"} is not allowlisted for controller-run-agenteer.`);
    }
  }
  return { reasons, commandArgs: reasons.length ? null : clean };
}

async function runControllerAgenteerCommand(
  command: NonNullable<ControllerToolExecution["command"]>,
  validationReasons: string[],
  stdoutPath: string,
  stderrPath: string,
): Promise<ControllerAgenteerCommandResult> {
  try {
    const result = await execFileAsync(command.executable, command.args, {
      cwd: command.cwd,
      timeout: command.timeoutMs,
      maxBuffer: 1024 * 1024 * 8,
    });
    const stdout = String(result.stdout ?? "");
    const stderr = String(result.stderr ?? "");
    await writeFile(stdoutPath, stdout);
    await writeFile(stderrPath, stderr);
    return {
      schemaVersion: 1,
      generatedAtIso: nowIso(),
      repoRoot: command.cwd,
      command,
      status: "passed",
      exitCode: 0,
      stdoutPath,
      stderrPath,
      stdoutPreview: stdout.slice(0, 6000),
      stderrPreview: stderr.slice(0, 2000),
      validationReasons,
      nextAction: "Use the Agenteer command output as observed evidence in the next controller decision.",
    };
  } catch (error) {
    const maybe = error as { stdout?: unknown; stderr?: unknown; code?: unknown };
    const stdout = String(maybe.stdout ?? "");
    const stderr = String(maybe.stderr ?? (error instanceof Error ? error.message : String(error)));
    await writeFile(stdoutPath, stdout);
    await writeFile(stderrPath, stderr);
    const statusIntrospectionSucceeded = isControllerStatusAgenteerCommand(command) && hasControllerStatusJsonEnvelope(stdout);
    return {
      schemaVersion: 1,
      generatedAtIso: nowIso(),
      repoRoot: command.cwd,
      command,
      status: statusIntrospectionSucceeded ? "passed" : "failed",
      exitCode: typeof maybe.code === "number" ? maybe.code : null,
      stdoutPath,
      stderrPath,
      stdoutPreview: stdout.slice(0, 6000),
      stderrPreview: stderr.slice(0, 2000),
      validationReasons,
      nextAction: statusIntrospectionSucceeded
        ? "Use the controller-status JSON as observed readiness evidence; nonzero exit reflects blocked pipeline status, not failed introspection."
        : "Inspect stderr/stdout, run npm-build if the CLI dist is stale or missing, or choose a narrower read-only Agenteer command.",
    };
  }
}

function isControllerStatusAgenteerCommand(command: NonNullable<ControllerToolExecution["command"]>): boolean {
  return command.args.includes("research") && command.args.includes("controller-status");
}

function hasControllerStatusJsonEnvelope(stdout: string): boolean {
  if (!stdout.includes("\"controllerStatus\"")) return false;
  try {
    const parsed = JSON.parse(stdout) as { controllerStatus?: unknown };
    return Boolean(parsed.controllerStatus);
  } catch {
    return true;
  }
}

async function attachSpecificToolArtifacts(state: ControllerState, execution: ControllerToolExecution): Promise<void> {
  if (!execution.stdoutPath) return;
  if (execution.request.toolId === "controller-git-diff") {
    state.artifacts.push(await artifact("controller-git-diff", execution.stdoutPath, state.currentStage, false));
  }
  if (execution.request.toolId === "controller-read-file") {
    state.artifacts.push(await artifact("controller-repo-file-read", execution.stdoutPath, state.currentStage, false));
  }
  if (execution.request.toolId === "controller-search-repo") {
    state.artifacts.push(await artifact("controller-repo-search", execution.stdoutPath, state.currentStage, false));
  }
  if (execution.request.toolId === "controller-run-agenteer") {
    state.artifacts.push(await artifact("controller-agenteer-command", execution.stdoutPath, state.currentStage, false));
    if (execution.stderrPath) state.artifacts.push(await artifact("controller-agenteer-command-stderr", execution.stderrPath, state.currentStage, false));
  }
  if (execution.request.toolId === "controller-propose-patch") {
    state.artifacts.push(await artifact("controller-source-patch-proposal", execution.stdoutPath, state.currentStage, false));
    const raw = await readJsonIfPresent(execution.stdoutPath);
    const proposal = valueAtPath(raw, "controllerSourcePatchProposal") as Partial<ControllerSourcePatchProposal> | null;
    if (proposal?.outPath) state.artifacts.push(await artifact("controller-source-patch-proposal-record", proposal.outPath, state.currentStage, false));
    if (proposal?.reportPath) state.artifacts.push(await artifact("controller-source-patch-proposal-report", proposal.reportPath, state.currentStage, false));
    for (const change of proposal?.changes ?? []) {
      if (change.afterPath) state.artifacts.push(await artifact("controller-source-patch-payload", change.afterPath, state.currentStage, false));
    }
  }
  if (execution.request.toolId === "controller-apply-patch") {
    state.artifacts.push(await artifact("controller-source-patch-apply", execution.stdoutPath, state.currentStage, false));
    const raw = await readJsonIfPresent(execution.stdoutPath);
    const applyResult = valueAtPath(raw, "controllerSourcePatchApply") as Partial<ControllerSourcePatchApplyResult> | null;
    if (applyResult?.outPath) state.artifacts.push(await artifact("controller-source-patch-apply-record", applyResult.outPath, state.currentStage, false));
    if (applyResult?.reportPath) state.artifacts.push(await artifact("controller-source-patch-apply-report", applyResult.reportPath, state.currentStage, false));
    if (applyResult?.diffSnapshotPath) state.artifacts.push(await artifact("controller-git-diff-after-apply", applyResult.diffSnapshotPath, state.currentStage, false));
  }
  if (execution.request.toolId === "controller-verify-patch") {
    state.artifacts.push(await artifact("controller-source-patch-verification", execution.stdoutPath, state.currentStage, false));
    const raw = await readJsonIfPresent(execution.stdoutPath);
    const verification = valueAtPath(raw, "controllerSourcePatchVerification") as Partial<ControllerSourcePatchVerification> | null;
    if (verification?.outPath) state.artifacts.push(await artifact("controller-source-patch-verification-record", verification.outPath, state.currentStage, false));
    if (verification?.reportPath) state.artifacts.push(await artifact("controller-source-patch-verification-report", verification.reportPath, state.currentStage, false));
    if (verification?.diffSnapshotPath) state.artifacts.push(await artifact("controller-git-diff-after-verification", verification.diffSnapshotPath, state.currentStage, false));
  }
  if (execution.request.toolId === "controller-rollback-patch") {
    state.artifacts.push(await artifact("controller-source-patch-rollback", execution.stdoutPath, state.currentStage, false));
    const raw = await readJsonIfPresent(execution.stdoutPath);
    const rollback = valueAtPath(raw, "controllerSourcePatchRollback") as Partial<ControllerSourcePatchRollback> | null;
    if (rollback?.outPath) state.artifacts.push(await artifact("controller-source-patch-rollback-record", rollback.outPath, state.currentStage, false));
    if (rollback?.reportPath) state.artifacts.push(await artifact("controller-source-patch-rollback-report", rollback.reportPath, state.currentStage, false));
    if (rollback?.diffSnapshotPath) state.artifacts.push(await artifact("controller-git-diff-after-rollback", rollback.diffSnapshotPath, state.currentStage, false));
  }
}

async function readControllerArtifactForTool(state: ControllerState, selector: string): Promise<{
  schemaVersion: 1;
  generatedAtIso: string;
  selector: string;
  status: "found" | "missing" | "blocked";
  artifact: ControllerArtifact | null;
  bytes: number;
  truncated: boolean;
  maxChars: number;
  contentPreview: string;
  reason: string;
}> {
  const maxChars = 24000;
  const selected = selectReadableControllerArtifact(state, selector);
  if (!selected) {
    return {
      schemaVersion: 1,
      generatedAtIso: nowIso(),
      selector,
      status: "missing",
      artifact: null,
      bytes: 0,
      truncated: false,
      maxChars,
      contentPreview: "",
      reason: "No controller artifact matched the requested kind, basename, or path.",
    };
  }
  const allowedRoots = [state.rootDir, state.inputs.runDir].map(item => path.resolve(item));
  const resolved = path.resolve(selected.path);
  if (!allowedRoots.some(root => isPathInside(root, resolved))) {
    return {
      schemaVersion: 1,
      generatedAtIso: nowIso(),
      selector,
      status: "blocked",
      artifact: selected,
      bytes: 0,
      truncated: false,
      maxChars,
      contentPreview: "",
      reason: "Artifact path is outside the controller root/run directories.",
    };
  }
  try {
    const raw = await readFile(resolved);
    const text = raw.toString("utf-8");
    return {
      schemaVersion: 1,
      generatedAtIso: nowIso(),
      selector,
      status: "found",
      artifact: { ...selected, path: resolved, sha256: selected.sha256 ?? createHash("sha256").update(raw).digest("hex") },
      bytes: raw.byteLength,
      truncated: text.length > maxChars,
      maxChars,
      contentPreview: text.slice(0, maxChars),
      reason: "Artifact content preview loaded from a controller-owned path.",
    };
  } catch (error) {
    return {
      schemaVersion: 1,
      generatedAtIso: nowIso(),
      selector,
      status: "missing",
      artifact: selected,
      bytes: 0,
      truncated: false,
      maxChars,
      contentPreview: "",
      reason: error instanceof Error ? error.message : String(error),
    };
  }
}

async function readControllerRepoFileForTool(state: ControllerState, relativePath: string): Promise<ControllerRepoFileRead> {
  const repoRoot = repoRootFromState(state);
  const maxChars = 32000;
  const maxBytes = 2_000_000;
  const cleanRel = normalizeControllerRepoRelativePath(relativePath);
  const absolutePath = cleanRel ? path.resolve(repoRoot, cleanRel) : null;
  if (!cleanRel || !absolutePath || !isControllerRepoReadPathAllowed(repoRoot, absolutePath, cleanRel)) {
    return {
      schemaVersion: 1,
      generatedAtIso: nowIso(),
      repoRoot,
      relativePath: cleanRel || relativePath,
      absolutePath,
      status: "blocked",
      bytes: 0,
      sha256: null,
      truncated: false,
      maxChars,
      contentPreview: "",
      reason: "File path is empty, sensitive, outside the repository, generated/cache-heavy, or otherwise outside the controller read envelope.",
    };
  }
  try {
    const info = await stat(absolutePath);
    if (!info.isFile()) {
      return {
        schemaVersion: 1,
        generatedAtIso: nowIso(),
        repoRoot,
        relativePath: cleanRel,
        absolutePath,
        status: "missing",
        bytes: 0,
        sha256: null,
        truncated: false,
        maxChars,
        contentPreview: "",
        reason: "Requested repository path is not a regular file.",
      };
    }
    if (info.size > maxBytes) {
      return {
        schemaVersion: 1,
        generatedAtIso: nowIso(),
        repoRoot,
        relativePath: cleanRel,
        absolutePath,
        status: "too_large",
        bytes: info.size,
        sha256: null,
        truncated: true,
        maxChars,
        contentPreview: "",
        reason: `File exceeds controller read limit of ${maxBytes} bytes.`,
      };
    }
    const raw = await readFile(absolutePath);
    if (looksBinary(raw)) {
      return {
        schemaVersion: 1,
        generatedAtIso: nowIso(),
        repoRoot,
        relativePath: cleanRel,
        absolutePath,
        status: "blocked",
        bytes: raw.byteLength,
        sha256: createHash("sha256").update(raw).digest("hex"),
        truncated: false,
        maxChars,
        contentPreview: "",
        reason: "Binary files are not exposed through controller-read-file.",
      };
    }
    const text = raw.toString("utf-8");
    return {
      schemaVersion: 1,
      generatedAtIso: nowIso(),
      repoRoot,
      relativePath: cleanRel,
      absolutePath,
      status: "found",
      bytes: raw.byteLength,
      sha256: createHash("sha256").update(raw).digest("hex"),
      truncated: text.length > maxChars,
      maxChars,
      contentPreview: text.slice(0, maxChars),
      reason: "Repository file preview loaded from a bounded, non-sensitive path.",
    };
  } catch (error) {
    return {
      schemaVersion: 1,
      generatedAtIso: nowIso(),
      repoRoot,
      relativePath: cleanRel,
      absolutePath,
      status: "missing",
      bytes: 0,
      sha256: null,
      truncated: false,
      maxChars,
      contentPreview: "",
      reason: error instanceof Error ? error.message : String(error),
    };
  }
}

async function searchControllerRepoForTool(state: ControllerState, query: string, scope: string): Promise<ControllerRepoSearchResult> {
  const repoRoot = repoRootFromState(state);
  const cleanQuery = query.trim();
  const cleanScope = normalizeControllerRepoRelativePath(scope || ".");
  const scopeRoot = path.resolve(repoRoot, cleanScope || ".");
  if (cleanQuery.length < 2 || cleanQuery.length > 200 || !isControllerRepoReadPathAllowed(repoRoot, scopeRoot, cleanScope || ".")) {
    return {
      schemaVersion: 1,
      generatedAtIso: nowIso(),
      repoRoot,
      query: cleanQuery,
      scope: cleanScope || ".",
      status: "blocked",
      searchedFiles: 0,
      skippedFiles: 0,
      truncated: false,
      matches: [],
      reason: "Search query or scope is outside the controller repo-search envelope.",
    };
  }
  const maxFiles = 4000;
  const maxMatches = 80;
  const maxFileBytes = 2_000_000;
  const matches: ControllerRepoSearchResult["matches"] = [];
  let searchedFiles = 0;
  let skippedFiles = 0;
  let truncated = false;
  const lowered = cleanQuery.toLowerCase();
  const files = await listControllerSearchFiles(repoRoot, scopeRoot, maxFiles);
  if (files.truncated) truncated = true;
  skippedFiles += files.skippedFiles;
  for (const file of files.paths) {
    if (matches.length >= maxMatches) {
      truncated = true;
      break;
    }
    const rel = path.relative(repoRoot, file).replace(/\\/g, "/");
    if (!isControllerRepoReadPathAllowed(repoRoot, file, rel)) {
      skippedFiles += 1;
      continue;
    }
    try {
      const info = await stat(file);
      if (!info.isFile() || info.size > maxFileBytes) {
        skippedFiles += 1;
        continue;
      }
      const raw = await readFile(file);
      if (looksBinary(raw)) {
        skippedFiles += 1;
        continue;
      }
      searchedFiles += 1;
      const lines = raw.toString("utf-8").split(/\r?\n/);
      for (const [index, line] of lines.entries()) {
        if (line.toLowerCase().includes(lowered)) {
          matches.push({
            path: rel,
            lineNumber: index + 1,
            linePreview: line.trim().slice(0, 500),
          });
          if (matches.length >= maxMatches) {
            truncated = true;
            break;
          }
        }
      }
    } catch {
      skippedFiles += 1;
    }
  }
  return {
    schemaVersion: 1,
    generatedAtIso: nowIso(),
    repoRoot,
    query: cleanQuery,
    scope: cleanScope || ".",
    status: matches.length ? "found" : "no_matches",
    searchedFiles,
    skippedFiles,
    truncated,
    matches,
    reason: matches.length ? "Search completed with bounded repository matches." : "Search completed without matches in bounded repository files.",
  };
}

function normalizeControllerRepoRelativePath(raw: string): string {
  return raw.trim().replace(/\\/g, "/").replace(/^\.?\//, "");
}

function isControllerRepoReadPathAllowed(repoRoot: string, absolutePath: string, relativePath: string): boolean {
  const cleanRel = normalizeControllerRepoRelativePath(relativePath);
  if (!cleanRel) return false;
  if (!isPathInside(repoRoot, absolutePath)) return false;
  if (path.isAbsolute(relativePath)) return false;
  if (/(^|\/)\.\.(\/|$)/.test(cleanRel)) return false;
  const parts = cleanRel.split("/");
  const blockedDirs = new Set([".git", "node_modules", "dist", "build", "coverage", ".next", ".turbo", ".cache", ".loop-memory"]);
  if (parts.some(part => blockedDirs.has(part))) return false;
  const base = path.basename(cleanRel).toLowerCase();
  if (base === ".env" || base.endsWith(".env") || base.includes("secret") || base.includes("apikey") || base.includes("api_key")) return false;
  if (base.endsWith(".pem") || base.endsWith(".key") || base.endsWith(".p12") || base.endsWith(".pfx")) return false;
  return true;
}

async function listControllerSearchFiles(repoRoot: string, scopeRoot: string, maxFiles: number): Promise<{ paths: string[]; skippedFiles: number; truncated: boolean }> {
  const paths: string[] = [];
  let skippedFiles = 0;
  let truncated = false;
  const scopeInfo = await stat(scopeRoot).catch(() => null);
  if (scopeInfo?.isFile()) return { paths: [scopeRoot], skippedFiles, truncated };
  if (scopeInfo && !scopeInfo.isDirectory()) return { paths, skippedFiles: 1, truncated };
  const visit = async (dir: string): Promise<void> => {
    if (paths.length >= maxFiles) {
      truncated = true;
      return;
    }
    const relDir = path.relative(repoRoot, dir).replace(/\\/g, "/") || ".";
    if (!isControllerRepoReadPathAllowed(repoRoot, dir, relDir)) {
      skippedFiles += 1;
      return;
    }
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      skippedFiles += 1;
      return;
    }
    entries.sort((a, b) => a.name.localeCompare(b.name));
    for (const entry of entries) {
      if (paths.length >= maxFiles) {
        truncated = true;
        return;
      }
      const absolute = path.join(dir, entry.name);
      const rel = path.relative(repoRoot, absolute).replace(/\\/g, "/");
      if (!isControllerRepoReadPathAllowed(repoRoot, absolute, rel)) {
        skippedFiles += 1;
        continue;
      }
      if (entry.isDirectory()) {
        await visit(absolute);
      } else if (entry.isFile()) {
        paths.push(absolute);
      } else {
        skippedFiles += 1;
      }
    }
  };
  await visit(scopeRoot);
  return { paths, skippedFiles, truncated };
}

function looksBinary(buffer: Buffer): boolean {
  const sample = buffer.subarray(0, Math.min(buffer.length, 1024));
  return sample.includes(0);
}

async function readControllerGitDiffSnapshot(state: ControllerState, relativeTarget: string): Promise<ControllerGitDiffSnapshot> {
  const repoRoot = repoRootFromState(state);
  const target = relativeTarget.trim();
  const argsSuffix = target ? ["--", target] : [];
  const [status, stat, diff] = await Promise.all([
    execFileAsync("git", ["status", "--short", ...argsSuffix], { cwd: repoRoot, timeout: state.policy.toolTimeoutMs, maxBuffer: 1024 * 1024 * 2 }).catch(error => ({ stdout: "", stderr: error instanceof Error ? error.message : String(error) })),
    execFileAsync("git", ["diff", "--stat", ...argsSuffix], { cwd: repoRoot, timeout: state.policy.toolTimeoutMs, maxBuffer: 1024 * 1024 * 2 }).catch(error => ({ stdout: "", stderr: error instanceof Error ? error.message : String(error) })),
    execFileAsync("git", ["diff", "--", ...(target ? [target] : [])], { cwd: repoRoot, timeout: state.policy.toolTimeoutMs, maxBuffer: 1024 * 1024 * 4 }).catch(error => ({ stdout: "", stderr: error instanceof Error ? error.message : String(error) })),
  ]);
  const statusText = String(status.stdout || status.stderr || "");
  const statText = String(stat.stdout || stat.stderr || "");
  const diffText = String(diff.stdout || diff.stderr || "");
  const maxDiffChars = 48000;
  return {
    schemaVersion: 1,
    generatedAtIso: nowIso(),
    repoRoot,
    statusPreview: statusText.slice(0, 12000),
    diffStatPreview: statText.slice(0, 12000),
    diffPreview: diffText.slice(0, maxDiffChars),
    truncated: diffText.length > maxDiffChars,
    changedFiles: statusText
      .split(/\r?\n/)
      .map(line => line.trim().split(/\s+/).at(-1) ?? "")
      .filter(Boolean)
      .slice(0, 200),
  };
}

async function buildControllerSourcePatchProposal(state: ControllerState, rawArg: string): Promise<ControllerSourcePatchProposal> {
  const proposalId = `controller_patch_proposal_${String(state.artifacts.filter(item => item.kind === "controller-source-patch-proposal").length + 1).padStart(3, "0")}`;
  const outPath = path.join(state.rootDir, `${proposalId}.json`);
  const reportPath = path.join(state.rootDir, `${proposalId}.md`);
  const repoRoot = repoRootFromState(state);
  const validationReasons: string[] = [];
  const raw = await readPatchProposalArg(state, rawArg).catch(error => {
    validationReasons.push(error instanceof Error ? error.message : String(error));
    return "";
  });
  let parsed: ControllerSourcePatchProposalInput | null = null;
  if (raw) {
    try {
      parsed = controllerSourcePatchProposalInputSchema.parse(JSON.parse(raw));
    } catch (error) {
      validationReasons.push(`Patch proposal JSON is invalid: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  const changes: ControllerSourcePatchProposal["changes"] = [];
  if (parsed) {
    for (const [index, change] of parsed.changes.entries()) {
      const cleanRel = change.path.replace(/\\/g, "/").replace(/^\.?\//, "");
      const absolutePath = path.resolve(repoRoot, cleanRel);
      const pathIssues: string[] = [];
      if (path.isAbsolute(change.path)) pathIssues.push("absolute paths are not allowed");
      if (!isPathInside(repoRoot, absolutePath)) pathIssues.push("path is outside repository root");
      if (cleanRel.startsWith(".git/") || cleanRel.includes("/.git/")) pathIssues.push("patches may not target .git");
      if (!change.after && !change.diff) pathIssues.push("each change must include either full after content or a unified diff");
      if (change.after && change.diff) pathIssues.push("each change must include only one of after or diff");
      if (pathIssues.length) validationReasons.push(`${change.path}: ${pathIssues.join("; ")}.`);
      const before = await readFile(absolutePath).catch(() => null);
      const afterPath = change.after ? path.join(state.rootDir, `${proposalId}_change_${String(index + 1).padStart(2, "0")}.after.txt`) : null;
      if (afterPath && change.after !== undefined) await writeFile(afterPath, change.after);
      const afterHash = change.after ? createHash("sha256").update(change.after).digest("hex") : null;
      const diffHash = createHash("sha256").update(change.diff ?? makeReplacementDiffPreview(cleanRel, before?.toString("utf-8") ?? "", change.after ?? "")).digest("hex");
      changes.push({
        path: cleanRel,
        absolutePath,
        rationale: change.rationale,
        beforeHash: before ? createHash("sha256").update(before).digest("hex") : null,
        afterHash,
        afterPath,
        diffHash,
        mode: change.after ? "replace-file" : "unified-diff",
        preview: (change.diff ?? makeReplacementDiffPreview(cleanRel, before?.toString("utf-8") ?? "", change.after ?? "")).slice(0, 8000),
      });
    }
    for (const test of parsed.tests) {
      if (!/^npm (run build|test)(\s|$)/.test(test) && !/^agenteer\s/.test(test)) {
        validationReasons.push(`Test command is outside the controller's usual verification envelope: ${test}`);
      }
    }
  }
  const status: ControllerSourcePatchProposal["status"] = validationReasons.length ? "invalid" : "valid";
  const proposal: ControllerSourcePatchProposal = {
    schemaVersion: 1,
    generatedAtIso: nowIso(),
    proposalId,
    runId: state.runId,
    repoRoot,
    summary: parsed?.summary ?? "Invalid patch proposal",
    risk: parsed?.risk ?? "high",
    status,
    validationReasons: validationReasons.length ? validationReasons : ["Patch proposal is bounded to repository paths and ready for human or future apply-step review."],
    changes,
    tests: parsed?.tests ?? [],
    nextAction: status === "valid"
      ? "Review this proposal, then apply it through the coding agent or a future controller apply-patch gate; rerun declared tests afterward."
      : "Repair the proposal JSON/path bounds before applying any changes.",
    outPath,
    reportPath,
  };
  await writeJson(outPath, { schemaVersion: 1, controllerSourcePatchProposal: proposal });
  await writeFile(reportPath, renderControllerSourcePatchProposalMarkdown(proposal));
  return proposal;
}

async function readPatchProposalArg(state: ControllerState, rawArg: string): Promise<string> {
  const trimmed = rawArg.trim();
  if (!trimmed) throw new Error("Patch proposal argument is empty.");
  if (trimmed.startsWith("{")) return trimmed;
  const candidate = path.resolve(state.rootDir, trimmed);
  const allowedRoots = [state.rootDir, state.inputs.runDir].map(item => path.resolve(item));
  if (!allowedRoots.some(root => isPathInside(root, candidate))) {
    throw new Error("Patch proposal file must be inside the controller root or run directory.");
  }
  return readFile(candidate, "utf-8");
}

async function applyControllerSourcePatchProposal(state: ControllerState, selector: string): Promise<ControllerSourcePatchApplyResult> {
  const applyId = `controller_patch_apply_${String(state.artifacts.filter(item => item.kind === "controller-source-patch-apply").length + 1).padStart(3, "0")}`;
  const outPath = path.join(state.rootDir, `${applyId}.json`);
  const reportPath = path.join(state.rootDir, `${applyId}.md`);
  const repoRoot = repoRootFromState(state);
  const validationReasons: string[] = [];
  const proposal = await loadControllerSourcePatchProposal(state, selector).catch(error => {
    validationReasons.push(error instanceof Error ? error.message : String(error));
    return null;
  });
  const appliedChanges: ControllerSourcePatchApplyResult["appliedChanges"] = [];
  if (!proposal) {
    return writeControllerSourcePatchApplyResult({
      schemaVersion: 1,
      generatedAtIso: nowIso(),
      applyId,
      runId: state.runId,
      proposalId: null,
      status: "rejected",
      repoRoot,
      validationReasons,
      proposalTests: [],
      appliedChanges,
      diffSnapshotPath: null,
      nextAction: "Repair the proposal selector or create a valid controller-propose-patch artifact.",
      outPath,
      reportPath,
    });
  }
  if (proposal.status !== "valid") validationReasons.push(`Proposal ${proposal.proposalId} is ${proposal.status}; only valid proposals may be applied.`);
  if (proposal.risk === "high") validationReasons.push("High-risk source patch proposals require manual application outside controller-apply-patch.");
  if (!proposal.changes.length) validationReasons.push("Proposal has no changes.");
  for (const change of proposal.changes) {
    const absolutePath = path.resolve(change.absolutePath);
    if (!isPathInside(repoRoot, absolutePath)) validationReasons.push(`${change.path}: target is outside repository root.`);
    if (change.mode !== "replace-file") validationReasons.push(`${change.path}: controller-apply-patch only applies full replacement payloads; unified diff proposals remain review-only.`);
    if (!change.afterPath) validationReasons.push(`${change.path}: replacement payload file is missing.`);
  }
  if (validationReasons.length) {
    return writeControllerSourcePatchApplyResult({
      schemaVersion: 1,
      generatedAtIso: nowIso(),
      applyId,
      runId: state.runId,
      proposalId: proposal.proposalId,
      status: "rejected",
      repoRoot,
      validationReasons,
      proposalTests: proposal.tests,
      appliedChanges,
      diffSnapshotPath: null,
      nextAction: "Resolve apply-gate validation issues before mutating source files.",
      outPath,
      reportPath,
    });
  }
  const backupDir = path.join(state.rootDir, "controller-patch-backups", applyId);
  await mkdir(backupDir, { recursive: true });
  let failed = false;
  for (const change of proposal.changes) {
    const absolutePath = path.resolve(change.absolutePath);
    const before = await readFile(absolutePath).catch(() => null);
    const beforeHash = before ? createHash("sha256").update(before).digest("hex") : null;
    if (change.beforeHash !== beforeHash) {
      appliedChanges.push({
        path: change.path,
        absolutePath,
        backupPath: null,
        beforeHash,
        expectedBeforeHash: change.beforeHash,
        afterHash: null,
        expectedAfterHash: change.afterHash,
        status: "failed",
        reason: "Current file hash does not match proposal beforeHash; refusing stale patch.",
      });
      failed = true;
      continue;
    }
    const after = await readFile(change.afterPath ?? "").catch(() => null);
    const afterHash = after ? createHash("sha256").update(after).digest("hex") : null;
    if (!after || afterHash !== change.afterHash) {
      appliedChanges.push({
        path: change.path,
        absolutePath,
        backupPath: null,
        beforeHash,
        expectedBeforeHash: change.beforeHash,
        afterHash,
        expectedAfterHash: change.afterHash,
        status: "failed",
        reason: "Replacement payload hash does not match proposal afterHash.",
      });
      failed = true;
      continue;
    }
    const backupPath = before ? path.join(backupDir, `${sanitizeControllerFileStem(change.path)}.before`) : null;
    if (backupPath && before) await writeFile(backupPath, before);
    await mkdir(path.dirname(absolutePath), { recursive: true });
    await writeFile(absolutePath, after);
    appliedChanges.push({
      path: change.path,
      absolutePath,
      backupPath,
      beforeHash,
      expectedBeforeHash: change.beforeHash,
      afterHash,
      expectedAfterHash: change.afterHash,
      status: "applied",
      reason: "Replacement payload applied after hash and path-boundary validation.",
    });
  }
  const diffSnapshot = await readControllerGitDiffSnapshot(state, "");
  const diffSnapshotPath = path.join(state.rootDir, `${applyId}_git_diff.json`);
  await writeJson(diffSnapshotPath, { schemaVersion: 1, controllerGitDiff: diffSnapshot });
  return writeControllerSourcePatchApplyResult({
    schemaVersion: 1,
    generatedAtIso: nowIso(),
    applyId,
    runId: state.runId,
    proposalId: proposal.proposalId,
    status: failed ? "failed" : "applied",
    repoRoot,
    validationReasons: failed ? ["One or more changes failed; inspect appliedChanges and backup paths before continuing."] : ["Patch proposal was applied with hash checks and backups."],
    proposalTests: proposal.tests,
    appliedChanges,
    diffSnapshotPath,
    nextAction: failed ? "Inspect partial application, restore from backups if needed, and rerun controller-git-diff." : `Run declared verification: ${proposal.tests.join("; ") || "npm run build and focused tests"}.`,
    outPath,
    reportPath,
  });
}

async function writeControllerSourcePatchApplyResult(result: ControllerSourcePatchApplyResult): Promise<ControllerSourcePatchApplyResult> {
  await writeJson(result.outPath, { schemaVersion: 1, controllerSourcePatchApply: result });
  await writeFile(result.reportPath, renderControllerSourcePatchApplyMarkdown(result));
  return result;
}

async function verifyControllerSourcePatch(state: ControllerState, selector: string): Promise<ControllerSourcePatchVerification> {
  const verificationId = `controller_patch_verification_${String(state.artifacts.filter(item => item.kind === "controller-source-patch-verification").length + 1).padStart(3, "0")}`;
  const outPath = path.join(state.rootDir, `${verificationId}.json`);
  const reportPath = path.join(state.rootDir, `${verificationId}.md`);
  const applyResult = await loadControllerSourcePatchApply(state, selector).catch(error => null);
  const validationReasons: string[] = [];
  if (!applyResult) validationReasons.push(`No controller source patch apply result matched selector ${selector}.`);
  if (applyResult && applyResult.status !== "applied") validationReasons.push(`Apply result ${applyResult.applyId} is ${applyResult.status}; only applied patches can be verified.`);
  const commands = applyResult?.proposalTests?.length ? applyResult.proposalTests : [];
  if (!commands.length) validationReasons.push("Applied proposal has no declared verification commands.");
  const commandResults: ControllerSourcePatchVerification["commands"] = [];
  if (!validationReasons.length && applyResult) {
    for (const [index, command] of commands.entries()) {
      const parsed = parseControllerVerificationCommand(command, state);
      const stdoutPath = path.join(state.rootDir, `${verificationId}_command_${String(index + 1).padStart(2, "0")}.stdout.txt`);
      const stderrPath = path.join(state.rootDir, `${verificationId}_command_${String(index + 1).padStart(2, "0")}.stderr.txt`);
      if (!parsed) {
        commandResults.push({ command, status: "skipped", exitCode: null, stdoutPath: null, stderrPath: null, stdoutPreview: "", stderrPreview: "Command is outside the bounded verification envelope." });
        continue;
      }
      try {
        const result = await execFileAsync(parsed.executable, parsed.args, {
          cwd: parsed.cwd,
          timeout: parsed.timeoutMs,
          maxBuffer: 1024 * 1024 * 8,
        });
        const stdout = String(result.stdout ?? "");
        const stderr = String(result.stderr ?? "");
        await writeFile(stdoutPath, stdout);
        await writeFile(stderrPath, stderr);
        commandResults.push({ command, status: "passed", exitCode: 0, stdoutPath, stderrPath, stdoutPreview: stdout.slice(0, 2000), stderrPreview: stderr.slice(0, 2000) });
      } catch (error) {
        const maybe = error as { stdout?: unknown; stderr?: unknown; code?: unknown };
        const stdout = String(maybe.stdout ?? "");
        const stderr = String(maybe.stderr ?? (error instanceof Error ? error.message : String(error)));
        await writeFile(stdoutPath, stdout);
        await writeFile(stderrPath, stderr);
        commandResults.push({ command, status: "failed", exitCode: typeof maybe.code === "number" ? maybe.code : null, stdoutPath, stderrPath, stdoutPreview: stdout.slice(0, 2000), stderrPreview: stderr.slice(0, 2000) });
      }
    }
  }
  const diffSnapshot = await readControllerGitDiffSnapshot(state, "");
  const diffSnapshotPath = path.join(state.rootDir, `${verificationId}_git_diff.json`);
  await writeJson(diffSnapshotPath, { schemaVersion: 1, controllerGitDiff: diffSnapshot });
  const hasFailedCommand = commandResults.some(item => item.status !== "passed");
  const status: ControllerSourcePatchVerification["status"] = validationReasons.length ? "rejected" : hasFailedCommand ? "failed" : "passed";
  const verification: ControllerSourcePatchVerification = {
    schemaVersion: 1,
    generatedAtIso: nowIso(),
    verificationId,
    runId: state.runId,
    applyId: applyResult?.applyId ?? null,
    proposalId: applyResult?.proposalId ?? null,
    status,
    validationReasons: validationReasons.length ? validationReasons : ["Patch verification executed declared commands."],
    commands: commandResults,
    diffSnapshotPath,
    nextAction: status === "passed"
      ? "Inspect the post-verification diff and proceed to controller audit or promotion review."
      : status === "failed"
        ? "Review failed/skipped verification commands; repair the patch or run controller-rollback-patch."
        : "Apply a valid patch before verification.",
    outPath,
    reportPath,
  };
  await writeJson(outPath, { schemaVersion: 1, controllerSourcePatchVerification: verification });
  await writeFile(reportPath, renderControllerSourcePatchVerificationMarkdown(verification));
  return verification;
}

async function rollbackControllerSourcePatch(state: ControllerState, selector: string): Promise<ControllerSourcePatchRollback> {
  const rollbackId = `controller_patch_rollback_${String(state.artifacts.filter(item => item.kind === "controller-source-patch-rollback").length + 1).padStart(3, "0")}`;
  const outPath = path.join(state.rootDir, `${rollbackId}.json`);
  const reportPath = path.join(state.rootDir, `${rollbackId}.md`);
  const applyResult = await loadControllerSourcePatchApply(state, selector).catch(() => null);
  const validationReasons: string[] = [];
  const restoredChanges: ControllerSourcePatchRollback["restoredChanges"] = [];
  if (!applyResult) validationReasons.push(`No controller source patch apply result matched selector ${selector}.`);
  if (applyResult && !["applied", "failed"].includes(applyResult.status)) validationReasons.push(`Apply result ${applyResult.applyId} is ${applyResult.status}; no applied changes are eligible for rollback.`);
  if (!validationReasons.length && applyResult) {
    for (const change of [...applyResult.appliedChanges].reverse()) {
      if (change.status !== "applied") {
        restoredChanges.push({ path: change.path, absolutePath: change.absolutePath, backupPath: change.backupPath, status: "skipped", beforeHash: null, restoredHash: null, reason: "Change was not applied." });
        continue;
      }
      try {
        const current = await readFile(change.absolutePath).catch(() => null);
        const beforeHash = current ? createHash("sha256").update(current).digest("hex") : null;
        if (change.backupPath) {
          const backup = await readFile(change.backupPath);
          await writeFile(change.absolutePath, backup);
          restoredChanges.push({
            path: change.path,
            absolutePath: change.absolutePath,
            backupPath: change.backupPath,
            status: "restored",
            beforeHash,
            restoredHash: createHash("sha256").update(backup).digest("hex"),
            reason: "Restored file from controller backup.",
          });
        } else {
          await rm(change.absolutePath, { force: true });
          restoredChanges.push({
            path: change.path,
            absolutePath: change.absolutePath,
            backupPath: null,
            status: "removed",
            beforeHash,
            restoredHash: null,
            reason: "Removed file created by patch because no backup existed.",
          });
        }
      } catch (error) {
        restoredChanges.push({
          path: change.path,
          absolutePath: change.absolutePath,
          backupPath: change.backupPath,
          status: "failed",
          beforeHash: null,
          restoredHash: null,
          reason: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }
  const diffSnapshot = await readControllerGitDiffSnapshot(state, "");
  const diffSnapshotPath = path.join(state.rootDir, `${rollbackId}_git_diff.json`);
  await writeJson(diffSnapshotPath, { schemaVersion: 1, controllerGitDiff: diffSnapshot });
  const failed = restoredChanges.some(item => item.status === "failed");
  const status: ControllerSourcePatchRollback["status"] = validationReasons.length ? "rejected" : failed ? "failed" : "rolled_back";
  const rollback: ControllerSourcePatchRollback = {
    schemaVersion: 1,
    generatedAtIso: nowIso(),
    rollbackId,
    runId: state.runId,
    applyId: applyResult?.applyId ?? null,
    status,
    validationReasons: validationReasons.length ? validationReasons : ["Rollback processed applied patch changes."],
    restoredChanges,
    diffSnapshotPath,
    nextAction: status === "rolled_back" ? "Run controller-git-diff and focused tests to confirm rollback state." : "Resolve rollback failure manually before continuing.",
    outPath,
    reportPath,
  };
  await writeJson(outPath, { schemaVersion: 1, controllerSourcePatchRollback: rollback });
  await writeFile(reportPath, renderControllerSourcePatchRollbackMarkdown(rollback));
  return rollback;
}

function parseControllerVerificationCommand(command: string, state: ControllerState): NonNullable<ControllerToolExecution["command"]> | null {
  const trimmed = command.trim();
  if (trimmed === "npm run build") return { executable: "npm", args: ["run", "build"], cwd: repoRootFromState(state), timeoutMs: state.policy.toolTimeoutMs };
  if (trimmed === "npm test") return { executable: "npm", args: ["test"], cwd: repoRootFromState(state), timeoutMs: state.policy.toolTimeoutMs };
  if (trimmed.startsWith("npm test -- ")) {
    const args = trimmed.slice("npm test -- ".length).split(/\s+/).filter(Boolean);
    if (args.some(arg => arg.startsWith("-") || /(^|\/)\.\.(\/|$)/.test(arg))) return null;
    return { executable: "npm", args: ["test", "--", ...args], cwd: repoRootFromState(state), timeoutMs: state.policy.toolTimeoutMs };
  }
  return null;
}

async function loadControllerSourcePatchApply(state: ControllerState, selector: string): Promise<ControllerSourcePatchApplyResult> {
  const selected = selectReadableControllerArtifact(state, selector);
  const candidates = uniqueText([
    selected?.path,
    ...state.artifacts.filter(item => item.kind === "controller-source-patch-apply-record" || item.kind === "controller-source-patch-apply").map(item => item.path),
  ].filter((value): value is string => Boolean(value)));
  for (const candidate of candidates.reverse()) {
    const raw = await readJsonIfPresent(candidate);
    const applyResult = (valueAtPath(raw, "controllerSourcePatchApply") ?? raw) as ControllerSourcePatchApplyResult | null;
    if (applyResult?.schemaVersion === 1 && Array.isArray(applyResult.appliedChanges)) {
      if (selector === "latest" || selector === applyResult.applyId || path.basename(candidate) === selector || candidate.endsWith(selector) || selected?.path === candidate) return applyResult;
    }
  }
  throw new Error(`No controller source patch apply result matched selector ${selector}.`);
}

async function loadControllerSourcePatchProposal(state: ControllerState, selector: string): Promise<ControllerSourcePatchProposal> {
  const selected = selectReadableControllerArtifact(state, selector);
  const candidates = uniqueText([
    selected?.path,
    ...state.artifacts.filter(item => item.kind === "controller-source-patch-proposal-record" || item.kind === "controller-source-patch-proposal").map(item => item.path),
  ].filter((value): value is string => Boolean(value)));
  for (const candidate of candidates.reverse()) {
    const raw = await readJsonIfPresent(candidate);
    const proposal = (valueAtPath(raw, "controllerSourcePatchProposal") ?? raw) as ControllerSourcePatchProposal | null;
    if (proposal?.schemaVersion === 1 && Array.isArray(proposal.changes)) {
      if (selector === "latest" || selector === proposal.proposalId || path.basename(candidate) === selector || candidate.endsWith(selector) || selected?.path === candidate) return proposal;
    }
  }
  throw new Error(`No controller source patch proposal matched selector ${selector}.`);
}

function renderControllerSourcePatchApplyMarkdown(result: ControllerSourcePatchApplyResult): string {
  return [
    "# Controller Source Patch Apply",
    "",
    `Apply: ${result.applyId}`,
    `Generated: ${result.generatedAtIso}`,
    `Status: ${result.status}`,
    `Proposal: ${result.proposalId ?? "(none)"}`,
    "",
    "## Validation",
    "",
    ...result.validationReasons.map(reason => `- ${reason}`),
    "",
    "## Applied Changes",
    "",
    ...(result.appliedChanges.length ? result.appliedChanges.flatMap(change => [
      `### ${change.path}`,
      "",
      `- Status: ${change.status}`,
      `- Reason: ${change.reason}`,
      `- Before hash: ${change.beforeHash ?? "(new or missing)"}`,
      `- Expected before hash: ${change.expectedBeforeHash ?? "(new or missing)"}`,
      `- After hash: ${change.afterHash ?? "(none)"}`,
      `- Expected after hash: ${change.expectedAfterHash ?? "(none)"}`,
      `- Backup: ${change.backupPath ?? "(none)"}`,
      "",
    ]) : ["- No changes applied."]),
    `Diff snapshot: ${result.diffSnapshotPath ?? "(none)"}`,
    `Next: ${result.nextAction}`,
    "",
  ].join("\n");
}

function renderControllerSourcePatchVerificationMarkdown(result: ControllerSourcePatchVerification): string {
  return [
    "# Controller Source Patch Verification",
    "",
    `Verification: ${result.verificationId}`,
    `Generated: ${result.generatedAtIso}`,
    `Status: ${result.status}`,
    `Apply: ${result.applyId ?? "(none)"}`,
    `Proposal: ${result.proposalId ?? "(none)"}`,
    "",
    "## Validation",
    "",
    ...result.validationReasons.map(reason => `- ${reason}`),
    "",
    "## Commands",
    "",
    ...(result.commands.length ? result.commands.flatMap(command => [
      `### ${command.command}`,
      "",
      `- Status: ${command.status}`,
      `- Exit code: ${command.exitCode ?? "(none)"}`,
      `- Stdout: ${command.stdoutPath ?? "(none)"}`,
      `- Stderr: ${command.stderrPath ?? "(none)"}`,
      "",
    ]) : ["- No commands executed."]),
    `Diff snapshot: ${result.diffSnapshotPath ?? "(none)"}`,
    `Next: ${result.nextAction}`,
    "",
  ].join("\n");
}

function renderControllerSourcePatchRollbackMarkdown(result: ControllerSourcePatchRollback): string {
  return [
    "# Controller Source Patch Rollback",
    "",
    `Rollback: ${result.rollbackId}`,
    `Generated: ${result.generatedAtIso}`,
    `Status: ${result.status}`,
    `Apply: ${result.applyId ?? "(none)"}`,
    "",
    "## Validation",
    "",
    ...result.validationReasons.map(reason => `- ${reason}`),
    "",
    "## Restored Changes",
    "",
    ...(result.restoredChanges.length ? result.restoredChanges.flatMap(change => [
      `### ${change.path}`,
      "",
      `- Status: ${change.status}`,
      `- Reason: ${change.reason}`,
      `- Backup: ${change.backupPath ?? "(none)"}`,
      `- Before rollback hash: ${change.beforeHash ?? "(missing)"}`,
      `- Restored hash: ${change.restoredHash ?? "(removed or missing)"}`,
      "",
    ]) : ["- No changes restored."]),
    `Diff snapshot: ${result.diffSnapshotPath ?? "(none)"}`,
    `Next: ${result.nextAction}`,
    "",
  ].join("\n");
}

function makeReplacementDiffPreview(relativePath: string, before: string, after: string): string {
  const beforeLines = before.split(/\r?\n/).slice(0, 80);
  const afterLines = after.split(/\r?\n/).slice(0, 80);
  return [
    `--- a/${relativePath}`,
    `+++ b/${relativePath}`,
    "@@ replacement preview @@",
    ...beforeLines.map(line => `-${line}`),
    ...afterLines.map(line => `+${line}`),
  ].join("\n");
}

function sanitizeControllerFileStem(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 120) || `file_${stableHash(value).slice(0, 10)}`;
}

function renderControllerSourcePatchProposalMarkdown(proposal: ControllerSourcePatchProposal): string {
  return [
    "# Controller Source Patch Proposal",
    "",
    `Proposal: ${proposal.proposalId}`,
    `Generated: ${proposal.generatedAtIso}`,
    `Status: ${proposal.status}`,
    `Risk: ${proposal.risk}`,
    `Summary: ${proposal.summary}`,
    "",
    "## Validation",
    "",
    ...proposal.validationReasons.map(reason => `- ${reason}`),
    "",
    "## Changes",
    "",
    ...proposal.changes.flatMap(change => [
      `### ${change.path}`,
      "",
      `- Mode: ${change.mode}`,
      `- Rationale: ${change.rationale}`,
      `- Before hash: ${change.beforeHash ?? "(new or unavailable)"}`,
      `- After hash: ${change.afterHash ?? "(diff-only)"}`,
      `- Diff hash: ${change.diffHash ?? "(none)"}`,
      "",
      "```diff",
      change.preview,
      "```",
      "",
    ]),
    "## Tests",
    "",
    ...(proposal.tests.length ? proposal.tests.map(test => `- \`${test}\``) : ["- No tests declared."]),
    "",
    `Next: ${proposal.nextAction}`,
    "",
  ].join("\n");
}

function selectReadableControllerArtifact(state: ControllerState, selector: string): ControllerArtifact | null {
  const trimmed = selector.trim();
  if (!trimmed) return null;
  const normalized = trimmed.toLowerCase();
  const byKind = [...state.artifacts].reverse().find(item => item.kind.toLowerCase() === normalized);
  if (byKind) return byKind;
  const byBase = [...state.artifacts].reverse().find(item => path.basename(item.path).toLowerCase() === path.basename(normalized));
  if (byBase) return byBase;
  const selectorPath = path.resolve(trimmed);
  const byPath = [...state.artifacts].reverse().find(item => path.resolve(item.path) === selectorPath || item.path.endsWith(trimmed));
  return byPath ?? null;
}

function isPathInside(root: string, candidate: string): boolean {
  const relative = path.relative(path.resolve(root), path.resolve(candidate));
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function repoRootFromState(state: ControllerState): string {
  const marker = `${path.sep}.loop-memory${path.sep}`;
  const index = state.rootDir.indexOf(marker);
  if (index > 0) return state.rootDir.slice(0, index);
  return process.cwd();
}

async function inspectControllerStateForTool(state: ControllerState): Promise<ControllerInternalInspection> {
  const checks: ControllerInternalInspection["checks"] = [];
  const add = (id: string, status: "pass" | "warning" | "fail", message: string, evidenceRefs: string[] = []) => {
    checks.push({ id, status, message, evidenceRefs });
  };
  add("state-path", await pathExists(state.statePath) ? "pass" : "fail", await pathExists(state.statePath) ? "Controller state file exists." : "Controller state file is missing.", [state.statePath]);
  add("run-dir", await pathExists(state.inputs.runDir) ? "pass" : "warning", await pathExists(state.inputs.runDir) ? "Run directory exists." : "Run directory is not present yet.", [state.inputs.runDir]);
  add("stage-valid", controllerStageSchema.safeParse(state.currentStage).success ? "pass" : "fail", `Current stage is ${state.currentStage}.`);
  add("status-valid", controllerRunStatusSchema.safeParse(state.status).success ? "pass" : "fail", `Current status is ${state.status}.`);
  const latestWorkPlan = state.workPlans.at(-1);
  add(
    "work-plan-present",
    latestWorkPlan && await pathExists(latestWorkPlan.outPath) ? "pass" : "warning",
    latestWorkPlan ? `Latest controller work plan is ${latestWorkPlan.planId} with status ${latestWorkPlan.status}.` : "No controller work plan is recorded.",
    latestWorkPlan ? [latestWorkPlan.outPath] : [],
  );
  const latestIssueLedger = state.issueLedgers.at(-1);
  add(
    "issue-ledger-present",
    latestIssueLedger && await pathExists(latestIssueLedger.outPath) ? "pass" : "warning",
    latestIssueLedger ? `Latest controller issue ledger is ${latestIssueLedger.ledgerId} with status ${latestIssueLedger.status}.` : "No controller issue ledger is recorded.",
    latestIssueLedger ? [latestIssueLedger.outPath] : [],
  );
  const latestStageReview = state.stageReviews.at(-1);
  add(
    "stage-review-present",
    state.actions.length === 0 || latestStageReview && await pathExists(latestStageReview.outPath) ? "pass" : "warning",
    latestStageReview ? `Latest controller stage review is ${latestStageReview.reviewId} with status ${latestStageReview.status}.` : "No controller stage review is recorded yet.",
    latestStageReview ? [latestStageReview.outPath] : [],
  );
  const latestAgenda = state.agendas.at(-1);
  add(
    "execution-agenda-present",
    latestAgenda && await pathExists(latestAgenda.outPath) ? "pass" : "warning",
    latestAgenda ? `Latest controller execution agenda is ${latestAgenda.agendaId} with status ${latestAgenda.status}.` : "No controller execution agenda is recorded.",
    latestAgenda ? [latestAgenda.outPath] : [],
  );
  const decisionContexts = state.artifacts.filter(item => item.kind === "controller-decision-context" && item.sha256);
  add(
    "decision-context-coverage",
    decisionContexts.length >= state.decisions.length ? "pass" : state.decisions.length ? "warning" : "pass",
    state.decisions.length
      ? `${decisionContexts.length} decision-context artifact(s) cover ${state.decisions.length} controller decision(s).`
      : "No controller decisions have been made yet.",
    decisionContexts.map(item => item.path),
  );
  const readinessArtifacts = state.artifacts.filter(item => item.kind === "controller-action-readiness" && item.sha256);
  add(
    "action-readiness-coverage",
    readinessArtifacts.length >= state.actions.length ? "pass" : state.actions.length ? "warning" : "pass",
    state.actions.length
      ? `${readinessArtifacts.length} action-readiness artifact(s) cover ${state.actions.length} executed action(s).`
      : "No executed controller actions require readiness coverage yet.",
    readinessArtifacts.map(item => item.path),
  );
  const terminalMismatch = state.status === "complete" && state.currentStage !== "complete";
  add("terminal-consistency", terminalMismatch ? "fail" : "pass", terminalMismatch ? "Status is complete but stage is not complete." : "Terminal status and stage are consistent.");
  const requiredArtifacts = state.artifacts.filter(item => item.requiredForPromotion);
  const missingRequired = requiredArtifacts.filter(item => item.sha256 === null);
  add(
    "required-artifact-hashes",
    missingRequired.length ? "warning" : "pass",
    missingRequired.length ? `${missingRequired.length} required artifact(s) are missing hashes or files.` : `${requiredArtifacts.length} required artifact(s) have recorded hashes when present.`,
    missingRequired.map(item => item.path),
  );
  const feasibility = await loadControllerFeasibilitySummary(state);
  if (state.inputs.dataPath) {
    const beforeDatasetFeasibility = state.currentStage === "intake" && !state.completedStages.includes("dataset_feasibility");
    add(
      "feasibility-verdict-present",
      feasibility.present ? "pass" : "fail",
      feasibility.present ? `Feasibility verdict is present with status ${feasibility.status}.` : "Row-level data run has no controller feasibility verdict.",
      feasibility.path ? [feasibility.path] : [],
    );
    add(
      "feasibility-verdict-status",
      feasibility.status === "block" ? "fail" : feasibility.status === "warning" ? "warning" : feasibility.status === "pass" ? "pass" : "warning",
      feasibility.status === "block"
        ? `Feasibility verdict blocks continuation: ${feasibility.blockers.join("; ") || "no blocker detail"}`
        : feasibility.status === "warning"
          ? `Feasibility verdict has warnings: ${feasibility.warnings.join("; ") || "no warning detail"}`
          : feasibility.status === "pass"
            ? "Feasibility verdict passes."
            : "Feasibility verdict status is unknown.",
      feasibility.path ? [feasibility.path] : [],
    );
    const datasetSemanticAudit = await loadControllerDatasetSemanticAuditSummary(state);
    add(
      "dataset-semantic-audit-present",
      datasetSemanticAudit.present ? "pass" : beforeDatasetFeasibility ? "warning" : "fail",
      datasetSemanticAudit.present ? `Dataset semantic audit is present with status ${datasetSemanticAudit.status}.` : beforeDatasetFeasibility ? "Dataset semantic audit has not been created yet; dataset_feasibility should create it." : "Row-level data run has no dataset semantic audit.",
      uniqueText([datasetSemanticAudit.path, datasetSemanticAudit.reportPath].filter((item): item is string => Boolean(item))),
    );
    add(
      "dataset-semantic-audit-status",
      datasetSemanticAudit.selectedRoleStatus === "block"
        ? "fail"
        : datasetSemanticAudit.selectedRoleStatus === "warning"
          ? "warning"
          : datasetSemanticAudit.present
            ? "pass"
            : "warning",
      datasetSemanticAudit.selectedRoleStatus === "block"
        ? `Selected study role has semantic blocker(s): ${datasetSemanticAudit.topIssues.filter(issue => issue.selected).map(issue => issue.message).join("; ") || "no detail"}`
        : datasetSemanticAudit.selectedRoleStatus === "warning"
          ? `Selected study role has semantic warning(s): ${datasetSemanticAudit.topIssues.filter(issue => issue.selected).map(issue => issue.message).join("; ") || "no detail"}`
          : datasetSemanticAudit.status === "warning"
            ? `Selected roles pass semantic plausibility; dataset-wide audit still found ${datasetSemanticAudit.issueCount} issue(s) on unused or nonblocking columns.`
            : datasetSemanticAudit.present
              ? "Dataset semantic audit passes."
              : "Dataset semantic audit status is unknown.",
      uniqueText([datasetSemanticAudit.path, datasetSemanticAudit.reportPath].filter((item): item is string => Boolean(item))),
    );
  }
  const reentry = await readJsonIfPresent(path.join(state.rootDir, "controller-reentry-plan.json"));
  const reentryPlan = valueAtPath(reentry, "controllerReentryPlan") as Partial<ControllerReentryPlan> | null;
  if (state.status !== "running") {
    add(
      "reentry-plan-present",
      reentryPlan ? "pass" : "warning",
      reentryPlan ? `Re-entry plan is present with status ${String(reentryPlan.status)} and stage ${String(reentryPlan.recommendedStage)}.` : "Terminal/non-running controller state has no re-entry plan.",
      reentryPlan?.outPath ? [String(reentryPlan.outPath)] : [],
    );
  }
  const promotionWithoutInspection = state.currentStage === "complete" && !state.artifacts.some(item => item.kind === "run-inspection" && item.sha256);
  add(
    "promotion-inspection",
    promotionWithoutInspection ? "fail" : "pass",
    promotionWithoutInspection ? "Completed controller state has no hashed run-inspection artifact." : "Promotion/inspection relationship is acceptable.",
    state.artifacts.filter(item => item.kind === "run-inspection").map(item => item.path),
  );
  const status = checks.some(check => check.status === "fail") ? "fail" : checks.some(check => check.status === "warning") ? "warning" : "pass";
  return { schemaVersion: 1, generatedAtIso: nowIso(), status, checks };
}

function renderControllerInternalInspectionMarkdown(inspection: ControllerInternalInspection, state: ControllerState): string {
  const counts = {
    pass: inspection.checks.filter(check => check.status === "pass").length,
    warning: inspection.checks.filter(check => check.status === "warning").length,
    fail: inspection.checks.filter(check => check.status === "fail").length,
  };
  const lines = [
    "# Controller Internal Inspection",
    "",
    `Generated: ${inspection.generatedAtIso}`,
    `Run ID: ${state.runId}`,
    `Status: ${inspection.status}`,
    `Stage: ${state.currentStage}`,
    `Controller status: ${state.status}`,
    `State path: ${state.statePath}`,
    `Run directory: ${state.inputs.runDir}`,
    "",
    "## Summary",
    "",
    `- Passed checks: ${counts.pass}`,
    `- Warning checks: ${counts.warning}`,
    `- Failed checks: ${counts.fail}`,
    `- Recorded artifacts: ${state.artifacts.length}`,
    `- Completed actions: ${state.actions.length}`,
    "",
    "## Checks",
    "",
    ...inspection.checks.flatMap(check => [
      `### ${check.id}`,
      "",
      `- Status: ${check.status}`,
      `- Finding: ${check.message}`,
      ...(check.evidenceRefs.length ? ["- Evidence:", ...check.evidenceRefs.map(ref => `  - ${ref}`)] : ["- Evidence: none recorded"]),
      "",
    ]),
    "## Recommended Use",
    "",
    inspection.status === "fail"
      ? "Do not promote this controller run until failed inspection checks are resolved or explicitly accepted by a human reviewer."
      : inspection.status === "warning"
        ? "Proceed only after reviewing warning checks, especially missing hashes, weak feasibility evidence, or terminal-state handoff gaps."
        : "Inspection passed. Continue with the next controller stage or promotion gate as appropriate.",
    "",
  ];
  return `${lines.join("\n")}\n`;
}

async function writeControllerRecoveryInspection(state: ControllerState): Promise<ControllerRecoveryInspection> {
  const outPath = path.join(state.rootDir, "controller-recovery-inspection.json");
  const reportPath = path.join(state.rootDir, "controller-recovery-inspection.md");
  const lastCheckpoint = await latestControllerCheckpoint(state);
  const lastInvocation = await latestControllerRunInvocation(state);
  const lastSnapshot = await latestControllerStateSnapshot(state);
  const invocationActionCount = lastInvocation?.after.actions ?? 0;
  const unledgeredActionCount = Math.max(0, state.actions.length - invocationActionCount);
  let status: ControllerRecoveryInspection["status"] = "resume_safe";
  let reason = "Controller state is running and can continue from the current stage.";
  let recommendedCommand = `agenteer research controller-run --state ${quotePath(state.statePath)}`;
  if (state.status === "complete" || state.currentStage === "complete") {
    status = "complete";
    reason = "Controller run is complete; refresh status and inspect artifacts before external sharing.";
    recommendedCommand = `agenteer research controller-status --state ${quotePath(state.statePath)}`;
  } else if (state.status === "blocked" || state.currentStage === "blocked") {
    status = "blocked";
    reason = "Controller is blocked; review feasibility/gate evidence and apply a patch or start a new run.";
    recommendedCommand = `agenteer research controller-status --state ${quotePath(state.statePath)}`;
  } else if (state.status !== "running" || state.currentStage === "human_review") {
    status = "use_reentry_plan";
    reason = "Controller is stopped for review; refresh status and use the re-entry plan before continuing.";
    recommendedCommand = `agenteer research controller-status --state ${quotePath(state.statePath)}`;
  } else if (unledgeredActionCount > 0 || (!lastInvocation && state.actions.length > 0)) {
    status = "possible_interruption";
    reason = `${unledgeredActionCount || state.actions.length} action(s) are not covered by the latest controller-run invocation ledger; this may be a stepwise/manual run or an interrupted controller-run.`;
    recommendedCommand = `agenteer research controller-run --state ${quotePath(state.statePath)} --max-steps 4`;
  }
  const recovery: ControllerRecoveryInspection = {
    schemaVersion: 1,
    generatedAtIso: nowIso(),
    status,
    stateStatus: state.status,
    currentStage: state.currentStage,
    lastCheckpoint: lastCheckpoint ? {
      path: lastCheckpoint.outPath,
      checkpointId: lastCheckpoint.checkpointId,
      reason: lastCheckpoint.reason,
      beforeStage: lastCheckpoint.before.stage,
      afterStage: lastCheckpoint.after.stage,
      afterStatus: lastCheckpoint.after.status,
    } : null,
    lastInvocation: lastInvocation ? {
      path: lastInvocation.outPath,
      invocationId: lastInvocation.invocationId,
      stepCount: lastInvocation.stepCount,
      terminal: lastInvocation.terminal,
      beforeStage: lastInvocation.before.stage,
      afterStage: lastInvocation.after.stage,
      afterStatus: lastInvocation.after.status,
    } : null,
    lastSnapshot: lastSnapshot ? {
      path: lastSnapshot.outPath,
      snapshotId: lastSnapshot.snapshotId,
      reason: lastSnapshot.reason,
      stage: lastSnapshot.stage,
      status: lastSnapshot.status,
      stateHash: lastSnapshot.stateHash,
    } : null,
    unledgeredActionCount,
    evidenceRefs: [
      ...(lastCheckpoint ? [lastCheckpoint.outPath] : []),
      ...(lastInvocation ? [lastInvocation.outPath] : []),
      ...(lastSnapshot ? [lastSnapshot.outPath] : []),
      state.statePath,
    ],
    recommendedCommand,
    reason,
    outPath,
    reportPath,
  };
  await writeJson(outPath, { schemaVersion: 1, controllerRecoveryInspection: recovery });
  await writeFile(reportPath, renderControllerRecoveryInspectionMarkdown(recovery));
  return recovery;
}

async function latestControllerCheckpoint(state: ControllerState): Promise<ControllerStepCheckpoint | null> {
  const checkpointArtifacts = state.artifacts.filter(item => item.kind === "controller-step-checkpoint" && item.sha256);
  const latest = checkpointArtifacts.at(-1);
  if (!latest) return null;
  const raw = await readJsonIfPresent(latest.path);
  const checkpoint = valueAtPath(raw, "controllerStepCheckpoint") as Partial<ControllerStepCheckpoint> | null;
  if (!checkpoint?.checkpointId || !checkpoint.before || !checkpoint.after || !checkpoint.outPath) return null;
  return checkpoint as ControllerStepCheckpoint;
}

async function latestControllerRunInvocation(state: ControllerState): Promise<ControllerRunInvocation | null> {
  const invocationArtifacts = state.artifacts.filter(item => item.kind === "controller-run-invocation" && item.sha256);
  const latest = invocationArtifacts.at(-1);
  if (!latest) return null;
  const raw = await readJsonIfPresent(latest.path);
  const invocation = valueAtPath(raw, "controllerRunInvocation") as Partial<ControllerRunInvocation> | null;
  if (!invocation?.invocationId || !invocation.before || !invocation.after || !invocation.outPath) return null;
  return invocation as ControllerRunInvocation;
}

async function latestControllerStateSnapshot(state: ControllerState): Promise<ControllerStateSnapshot | null> {
  const snapshotArtifacts = state.artifacts.filter(item => item.kind === "controller-state-snapshot" && item.sha256);
  const latest = snapshotArtifacts.at(-1);
  if (!latest) return null;
  const raw = await readJsonIfPresent(latest.path);
  const snapshot = valueAtPath(raw, "controllerStateSnapshot") as Partial<ControllerStateSnapshot> | null;
  if (!snapshot?.snapshotId || !snapshot.outPath || !snapshot.stateHash || !snapshot.stage || !snapshot.status) return null;
  return snapshot as ControllerStateSnapshot;
}

function renderControllerRecoveryInspectionMarkdown(recovery: ControllerRecoveryInspection): string {
  return [
    "# Controller Recovery Inspection",
    "",
    `Generated: ${recovery.generatedAtIso}`,
    `Status: ${recovery.status}`,
    `Controller state: ${recovery.stateStatus}`,
    `Current stage: ${recovery.currentStage}`,
    `Unledgered actions: ${recovery.unledgeredActionCount}`,
    "",
    "## Last Checkpoint",
    "",
    recovery.lastCheckpoint
      ? `- ${recovery.lastCheckpoint.checkpointId}: ${recovery.lastCheckpoint.beforeStage} -> ${recovery.lastCheckpoint.afterStage} (${recovery.lastCheckpoint.afterStatus}); reason=${recovery.lastCheckpoint.reason}`
      : "- None",
    "",
    "## Last Run Invocation",
    "",
    recovery.lastInvocation
      ? `- ${recovery.lastInvocation.invocationId}: ${recovery.lastInvocation.beforeStage} -> ${recovery.lastInvocation.afterStage} (${recovery.lastInvocation.afterStatus}); steps=${recovery.lastInvocation.stepCount}; terminal=${recovery.lastInvocation.terminal}`
      : "- None",
    "",
    "## Last State Snapshot",
    "",
    recovery.lastSnapshot
      ? `- ${recovery.lastSnapshot.snapshotId}: ${recovery.lastSnapshot.stage}/${recovery.lastSnapshot.status}; reason=${recovery.lastSnapshot.reason}; stateHash=${recovery.lastSnapshot.stateHash}`
      : "- None",
    "",
    "## Recommendation",
    "",
    `- Reason: ${recovery.reason}`,
    `- Command: ${recovery.recommendedCommand}`,
    "",
    "## Evidence",
    "",
    ...recovery.evidenceRefs.map(ref => `- ${ref}`),
    "",
  ].join("\n");
}

async function applyControllerInputPatch(
  state: ControllerState,
  patch: ControllerInputPatch,
  opts: { source: ControllerPatchRecord["source"]; reason: string },
): Promise<ControllerPatchRecord> {
  const beforeHash = stableHash(state.inputs);
  const validation = validateControllerInputPatch(state, patch);
  const changedFields = changedInputPatchFields(state.inputs, patch);
  const invalidatedStages = invalidatedStagesForPatch(changedFields, state.completedStages);
  const patchId = `patch_${String(state.patches.length + 1).padStart(3, "0")}`;
  const outPath = path.join(state.rootDir, `${patchId}.json`);
  if (validation.status === "valid") {
    for (const [key, value] of Object.entries(patch) as Array<[keyof ControllerInputPatch, ControllerInputPatch[keyof ControllerInputPatch]]>) {
      if (value === undefined) continue;
      (state.inputs as unknown as Record<string, unknown>)[key] = value;
    }
    pruneInvalidatedControllerState(state, invalidatedStages);
  }
  const record: ControllerPatchRecord = {
    schemaVersion: 1,
    generatedAtIso: nowIso(),
    patchId,
    source: opts.source,
    reason: opts.reason,
    status: validation.status === "valid" ? "applied" : "rejected",
    patch,
    changedFields,
    invalidatedStages,
    validationReasons: validation.reasons,
    beforeHash,
    afterHash: stableHash(state.inputs),
    outPath,
  };
  await writeJson(outPath, { schemaVersion: 1, controllerPatch: record });
  return record;
}

function validateControllerInputPatch(state: ControllerState, patch: ControllerInputPatch): ControllerDecision["patchValidation"] {
  const parsed = controllerInputPatchSchema.safeParse(patch);
  const reasons: string[] = [];
  if (!parsed.success) reasons.push(`Patch schema invalid: ${parsed.error.message}`);
  if (!state.policy.allowInputPatches) reasons.push("Input patches are disabled by controller policy.");
  if (state.patches.length >= state.policy.maxInputPatches) reasons.push(`Input patch ceiling reached (${state.policy.maxInputPatches}).`);
  const changedFields = changedInputPatchFields(state.inputs, patch);
  if (changedFields.length === 0) reasons.push("Patch does not change any controller input.");
  if (changedFields.includes("dataPath") || changedFields.includes("datasetDir") || changedFields.includes("runDir") || changedFields.includes("python")) {
    reasons.push("Patch cannot change dataPath, datasetDir, runDir, or python; those require a new controller run.");
  }
  if (state.currentStage === "promotion_decision" || state.currentStage === "complete") {
    reasons.push("Patch cannot be applied after promotion decision/completion without a new controller run.");
  }
  const nextInputs = { ...state.inputs, ...patch };
  const hasAnalysisTime = Boolean(nextInputs.time || nextInputs.stop);
  if (hasAnalysisTime && !nextInputs.event) reasons.push("Time-to-event patch requires an event variable when time or stop is supplied.");
  if (nextInputs.event && !hasAnalysisTime) reasons.push("Time-to-event patch requires a time or stop variable when event is supplied.");
  if (nextInputs.start && !nextInputs.stop) reasons.push("Start/stop interval patches require both start and stop variables.");
  if (nextInputs.method === "recurrent-event-cox" && (!nextInputs.start || !nextInputs.stop || !nextInputs.id)) reasons.push("recurrent-event-cox patches require start, stop, and id variables.");
  if (nextInputs.method && !statsMethodSchema.safeParse(nextInputs.method).success) reasons.push(`Patched method ${nextInputs.method} is not a supported stats method.`);
  if (reasons.length) return { status: "invalid", reasons };
  return { status: "valid", reasons: [`Patch changes ${changedFields.join(", ")} and will invalidate downstream stages as needed.`] };
}

function changedInputPatchFields(inputs: ControllerStudyInputs, patch: ControllerInputPatch): string[] {
  return Object.entries(patch)
    .filter(([, value]) => value !== undefined)
    .filter(([key, value]) => JSON.stringify((inputs as unknown as Record<string, unknown>)[key]) !== JSON.stringify(value))
    .map(([key]) => key);
}

function invalidatedStagesForPatch(changedFields: string[], completedStages: ControllerStage[]): ControllerStage[] {
  if (!changedFields.length) return [];
  const stageOrder: ControllerStage[] = ["context", "dataset_feasibility", "exploration", "literature", "method_selection", "execution", "qa", "manuscript", "literature_qa", "external_review", "repair", "inspection", "promotion_decision"];
  const dataFields = new Set(["question", "outcome", "exposure", "group", "outcomeThreshold", "exposureThreshold", "time", "start", "stop", "event", "id", "strata", "cluster", "period", "post", "runningVariable", "cutoff", "instrument", "alphaPenalty", "l1Ratio", "weight", "offset", "variables", "covariates", "exactCovariates", "surveyDesign", "allowSurveyApproximation", "method"]);
  const start = changedFields.includes("question") ? "context" : changedFields.some(field => dataFields.has(field)) ? "dataset_feasibility" : "method_selection";
  const startIndex = stageOrder.indexOf(start);
  return stageOrder.slice(startIndex).filter(stage => completedStages.includes(stage) || ["context", "dataset_feasibility", "exploration", "literature", "method_selection", "execution", "qa", "manuscript", "literature_qa", "external_review", "repair", "inspection", "promotion_decision"].includes(stage));
}

function invalidatedStagesForPolicyUpdate(changedFields: string[], completedStages: ControllerStage[]): ControllerStage[] {
  if (!changedFields.length) return [];
  const invalidated = new Set<ControllerStage>();
  const addFrom = (stage: ControllerStage) => {
    const order: ControllerStage[] = ["context", "dataset_feasibility", "exploration", "literature", "method_selection", "execution", "qa", "manuscript", "literature_qa", "external_review", "repair", "inspection", "promotion_decision"];
    const start = order.indexOf(stage);
    if (start < 0) return;
    for (const item of order.slice(start)) {
      if (completedStages.includes(item) || ["context", "literature", "literature_qa", "external_review", "repair", "inspection", "promotion_decision"].includes(item)) invalidated.add(item);
    }
  };
  if (changedFields.some(field => ["allowContext", "requireContext", "contextRepo", "contextTarget", "contextBin", "autocontextRoot", "contextBudgetTokens"].includes(field))) addFrom("context");
  if (changedFields.some(field => ["minRows", "maxRequiredVariableMissingness"].includes(field))) addFrom("dataset_feasibility");
  if (changedFields.some(field => ["allowLiterature", "literatureBaseUrl", "literatureEndpoint", "literatureDepth", "literatureTopK", "literatureTimeoutMs", "literatureMockResponsePath"].includes(field))) addFrom("literature");
  if (changedFields.some(field => ["allowExecution"].includes(field))) addFrom("execution");
  if (changedFields.some(field => ["allowExternalReview", "requireExternalReviewForPromotion", "mockExternalReview", "reviewPanel", "reviewStage"].includes(field) || field.startsWith("reviewerBudget."))) addFrom("external_review");
  if (changedFields.some(field => ["allowAutoRepair", "maxAutoRepairs", "autonomy"].includes(field))) addFrom("repair");
  if (changedFields.some(field => ["requireControllerModel"].includes(field) || field.startsWith("controller.") || field.startsWith("controllerBudget."))) addFrom("promotion_decision");
  return [...invalidated];
}

function pruneInvalidatedControllerState(state: ControllerState, invalidatedStages: ControllerStage[]): void {
  if (!invalidatedStages.length) return;
  const invalid = new Set(invalidatedStages);
  state.completedStages = state.completedStages.filter(stage => !invalid.has(stage));
  state.gates = state.gates.filter(gate => !invalid.has(gate.stage));
  state.decisions = state.decisions.filter(decision => !invalid.has(decision.stage));
  state.actions = state.actions.filter(action => !invalid.has(action.nextStage) && !invalidatedAction(action.action));
  state.artifacts = state.artifacts.filter(item => !invalid.has(item.stage));
  state.repairs = state.repairs.filter(repair => !invalid.has(repair.stageBeforeRepair));
}

function invalidatedAction(action: ControllerActionType): boolean {
  return ["context_preflight", "literature_search", "select_method", "run_analysis", "method_qa", "write_manuscript", "literature_qa", "external_review", "apply_repairs", "inspect_run", "decide_promotion"].includes(action);
}

function earliestInvalidatedStage(stages: ControllerStage[]): ControllerStage | null {
  const order: ControllerStage[] = ["context", "dataset_feasibility", "exploration", "literature", "method_selection", "execution", "qa", "manuscript", "literature_qa", "external_review", "repair", "inspection", "promotion_decision"];
  return order.find(stage => stages.includes(stage)) ?? null;
}

function rationaleForAction(action: ControllerActionType, state: ControllerState, gateResult: ControllerGate): string {
  if (action === "stop_for_human" || action === "block") return gateResult.reasons.join("; ") || gateResult.label;
  return `At stage ${state.currentStage}, ${gateResult.label} The next bounded action is ${action}.`;
}

function expectedArtifactsForAction(action: ControllerActionType): string[] {
  const map: Record<ControllerActionType, string[]> = {
    initialize: ["controller-state.json"],
    context_preflight: ["controller-context-preflight.json", "controller-context-manifest.json"],
    table_summary: ["table-summary.json", "controller-dataset-semantic-audit", "controller-feasibility-verdict.json"],
    explore: ["exploration.json", "exploration-report.md"],
    literature_search: ["literature-search.json", "literature-context.json"],
    select_method: ["controller-modeling-plan.json", "method-selection.json"],
    run_analysis: ["stats-run.json", "stats-report.md", "stats-qa.json"],
    method_qa: ["method-qa.json", "method-qa.md"],
    write_manuscript: ["manuscript.md", "manuscript-qa.json"],
    literature_qa: ["literature-qa.json", "literature-qa.md"],
    external_review: ["review-panel.json", "review-adjudication.json", "state-reentry.json"],
    apply_repairs: ["controller-repair-execution.json", "controller-repair-verification.json"],
    inspect_run: ["run-inspection.json", "run-inspection.md"],
    decide_promotion: ["controller-completion-audit.json", "controller-completion-audit.md", "controller-self-evaluation.json", "controller-self-evaluation.md", "controller-golden-packet.json", "controller-golden-packet.md"],
    stop_for_human: [],
    complete: [],
    block: [],
  };
  return map[action];
}

async function writeControllerActionContract(state: ControllerState, action: ControllerExecutedAction): Promise<ControllerActionContractCheck> {
  const contract = await validateControllerActionContract(state, action);
  await writeJson(contract.outPath, { schemaVersion: 1, controllerActionContract: contract });
  await writeFile(contract.reportPath, renderControllerActionContractMarkdown(contract));
  return contract;
}

async function validateControllerActionContract(state: ControllerState, action: ControllerExecutedAction): Promise<ControllerActionContractCheck> {
  const expectedArtifacts = expectedArtifactsForAction(action.action);
  const expectedPaths = controllerExpectedArtifactPaths(state, action.action);
  const observedArtifacts = await observedArtifactsForContract(state, action, expectedPaths);
  const missingExpectedArtifacts: string[] = [];
  for (const expected of expectedArtifacts) {
    const satisfied = await expectedArtifactSatisfied(expected, expectedPaths, observedArtifacts);
    if (!satisfied) missingExpectedArtifacts.push(expected);
  }
  const missingRequiredHashes = observedArtifacts
    .filter(item => item.requiredForPromotion && !item.sha256)
    .map(item => item.path);
  const reasons: string[] = [];
  if (action.status === "succeeded" && missingExpectedArtifacts.length) reasons.push(`Missing expected artifact(s): ${missingExpectedArtifacts.join(", ")}.`);
  if (missingRequiredHashes.length) reasons.push(`Required artifact(s) have no hash: ${missingRequiredHashes.join(", ")}.`);
  if (action.status === "failed") reasons.push("Action failed before contract validation; expected artifacts are not required for advancement.");
  if (action.status === "skipped") reasons.push("Action was skipped by policy; expected artifacts are advisory only.");
  const status: ControllerActionContractCheck["status"] = action.status === "succeeded"
    ? reasons.length ? "fail" : "pass"
    : reasons.some(reason => reason.includes("Required artifact")) ? "fail" : "warning";
  const base = `controller-action-contract-${String(state.actions.length + 1).padStart(3, "0")}-${action.action}`;
  return {
    schemaVersion: 1,
    generatedAtIso: nowIso(),
    runId: state.runId,
    stage: actionStageForContract(state, action),
    action: action.action,
    actionStatus: action.status,
    status,
    expectedArtifacts,
    observedArtifacts,
    missingExpectedArtifacts,
    missingRequiredHashes,
    reasons: reasons.length ? reasons : ["All expected action artifacts were present and required artifacts were hashable."],
    outPath: path.join(state.rootDir, `${base}.json`),
    reportPath: path.join(state.rootDir, `${base}.md`),
  };
}

function actionStageForContract(state: ControllerState, action: ControllerExecutedAction): ControllerStage {
  return action.artifacts[0]?.stage ?? state.currentStage;
}

async function observedArtifactsForContract(state: ControllerState, action: ControllerExecutedAction, expectedPaths: string[]): Promise<ControllerActionContractCheck["observedArtifacts"]> {
  const observed: ControllerActionContractCheck["observedArtifacts"] = [];
  const seen = new Set<string>();
  const addArtifact = (item: ControllerArtifact, source: "state" | "action") => {
    const key = `${source}:${item.kind}:${path.resolve(item.path)}`;
    if (seen.has(key)) return;
    seen.add(key);
    observed.push({ ...item, path: path.resolve(item.path), source });
  };
  const relevantStage = actionStageForContract(state, action);
  for (const item of state.artifacts) {
    if (
      item.stage === relevantStage
      || expectedPaths.includes(path.resolve(item.path))
      || action.artifacts.some(actionArtifact => actionArtifact.path === item.path)
    ) addArtifact(item, "state");
  }
  for (const item of action.artifacts) addArtifact(item, "action");
  for (const expectedPath of expectedPaths) {
    const resolved = path.resolve(expectedPath);
    if (observed.some(item => item.path === resolved)) continue;
    const sha256 = await hashFileIfPresent(resolved);
    if (sha256) {
      const key = `expected:${resolved}`;
      if (!seen.has(key)) {
        seen.add(key);
        observed.push({
          kind: expectedKindFromPath(resolved),
          path: resolved,
          sha256,
          requiredForPromotion: expectedPathRequired(resolved),
          source: "expected-path",
        });
      }
    }
  }
  return observed;
}

async function expectedArtifactSatisfied(expected: string, expectedPaths: string[], observedArtifacts: ControllerActionContractCheck["observedArtifacts"]): Promise<boolean> {
  const normalizedExpected = expected.toLowerCase();
  const expectedBase = path.basename(normalizedExpected);
  if (expected === "controller-repair-execution.json") {
    return observedArtifacts.some(item => item.kind === "controller-repair-execution" && Boolean(item.sha256));
  }
  if (expected === "controller-repair-verification.json") {
    return observedArtifacts.some(item => item.kind === "controller-repair-verification" && Boolean(item.sha256));
  }
  if (observedArtifacts.some(item => item.kind.toLowerCase() === normalizedExpected && Boolean(item.sha256))) return true;
  if (observedArtifacts.some(item => path.basename(item.path).toLowerCase() === expectedBase && Boolean(item.sha256))) return true;
  const explicitPath = expectedPaths.find(item => path.basename(item).toLowerCase() === expectedBase);
  return explicitPath ? Boolean(await hashFileIfPresent(explicitPath)) : false;
}

function controllerExpectedArtifactPaths(state: ControllerState, action: ControllerActionType): string[] {
  const root = state.rootDir;
  const run = state.inputs.runDir;
  switch (action) {
    case "initialize":
      return [state.statePath];
    case "context_preflight":
      return [path.join(root, "controller-context-preflight.json"), path.join(root, "controller-context-manifest.json")];
    case "table_summary":
      return [path.join(root, "table-summary.json"), path.join(root, "controller-feasibility-verdict.json")];
    case "explore":
      return [path.join(root, "exploration", "exploration.json"), path.join(root, "exploration", "exploration-report.md")];
    case "literature_search":
      return [path.join(root, "literature", "literature-search.json"), path.join(root, "literature", "literature-context.json")];
    case "select_method":
      return [path.join(root, "controller-modeling-plan.json"), path.join(root, "method-selection.json")];
    case "run_analysis":
      return [path.join(run, "stats-run.json"), path.join(run, "stats-report.md"), path.join(run, "stats-qa.json")];
    case "method_qa":
      return [path.join(run, "method-qa.json"), path.join(run, "method-qa.md")];
    case "write_manuscript":
      return [path.join(run, "manuscript.md"), path.join(run, "manuscript-qa.json")];
    case "literature_qa":
      return [path.join(run, "literature-qa.json"), path.join(run, "literature-qa.md")];
    case "external_review":
      return [path.join(run, "review", "review-panel.json"), path.join(run, "review", "review-adjudication.json"), path.join(run, "review", "state-reentry.json")];
    case "apply_repairs":
      return state.artifacts
        .filter(item => item.kind === "controller-repair-execution" || item.kind === "controller-repair-verification")
        .map(item => item.path);
    case "inspect_run":
      return [path.join(run, "run-inspection.json"), path.join(run, "run-inspection.md")];
    case "decide_promotion":
      return [
        path.join(root, "controller-completion-audit.json"),
        path.join(root, "controller-completion-audit.md"),
        path.join(root, "controller-self-evaluation.json"),
        path.join(root, "controller-self-evaluation.md"),
        path.join(root, "controller-golden-packet.json"),
        path.join(root, "controller-golden-packet.md"),
      ];
    default:
      return [];
  }
}

function expectedKindFromPath(file: string): string {
  const base = path.basename(file).replace(/\.(json|md|csv|png|svg|pdf)$/i, "");
  return base.replace(/_/g, "-");
}

function expectedPathRequired(file: string): boolean {
  return /\.(json|csv)$/i.test(file) || /manuscript\.md$/i.test(file) || /stats-report\.md$/i.test(file);
}

function renderControllerActionContractMarkdown(contract: ControllerActionContractCheck): string {
  return [
    "# Controller Action Contract",
    "",
    `- Run: ${contract.runId}`,
    `- Stage: ${contract.stage}`,
    `- Action: ${contract.action}`,
    `- Action status: ${contract.actionStatus}`,
    `- Contract status: ${contract.status}`,
    "",
    "## Expected Artifacts",
    "",
    ...(contract.expectedArtifacts.length ? contract.expectedArtifacts.map(item => `- ${item}`) : ["- No required artifacts for this action."]),
    "",
    "## Missing Expected Artifacts",
    "",
    ...(contract.missingExpectedArtifacts.length ? contract.missingExpectedArtifacts.map(item => `- ${item}`) : ["- None"]),
    "",
    "## Observed Artifacts",
    "",
    ...(contract.observedArtifacts.length
      ? contract.observedArtifacts.map(item => `- ${item.kind}: ${item.path} (${item.sha256 ? "hash present" : "missing hash"}, ${item.source})`)
      : ["- None"]),
    "",
    "## Reasons",
    "",
    ...contract.reasons.map(reason => `- ${reason}`),
    "",
  ].join("\n");
}

function statusForStage(stage: ControllerStage, actionStatus: ControllerExecutedAction["status"]): ControllerRunStatus {
  if (actionStatus === "failed") return stage === "blocked" ? "blocked" : "needs_human_review";
  if (stage === "complete") return "complete";
  if (stage === "blocked") return "blocked";
  if (stage === "human_review") return "needs_human_review";
  return "running";
}

function stopReasonForStage(stage: ControllerStage, error: string | null): string | null {
  if (error) return error;
  if (stage === "complete") return "Controller completed all required gates.";
  if (stage === "human_review") return "Controller stopped for human review because the next safe repair or promotion decision is not automatic.";
  if (stage === "blocked") return "Controller blocked because a hard gate failed.";
  return null;
}

function nextRecommendedAction(state: ControllerState): string {
  if (state.status === "running") return `Run controller-step to continue from ${state.currentStage}.`;
  if (state.status === "complete") return "Study packet is complete by controller policy; inspect run artifacts before external sharing.";
  if (state.status === "blocked") return "Resolve the blocking gate, then rerun controller-run from the saved state.";
  if (state.status === "needs_human_review") return "Review controller-state.json, accepted reviewer findings, and run-inspection before resuming.";
  return "Inspect controller-state.json.";
}

function isTerminal(stage: ControllerStage): boolean {
  return stage === "complete" || stage === "blocked" || stage === "human_review";
}

function decisionId(state: ControllerState, source: string): string {
  return `decision_${String(state.decisions.length + 1).padStart(3, "0")}_${source}`;
}

function controllerAsReviewerConfig(config: ControllerModelConfig): ReviewerModelConfig {
  return {
    id: `${config.provider}:${config.model}:controller`,
    provider: config.provider,
    model: config.model,
    role: "research controller agent",
    enabled: config.enabled,
    maxInputChars: config.maxInputChars,
    maxOutputTokens: config.maxOutputTokens,
    timeoutMs: config.timeoutMs,
  };
}

function controllerSystemPrompt(): string {
  return [
    "You are the controller for an inspectable medical/public-health research pipeline.",
    "Choose exactly one allowed next action. Do not claim completion unless artifacts and gates prove it.",
    "Treat activeBlockerIssueCodes as authoritative blocker identifiers; issueCodes outside that list are advisory context unless their source artifact marks blocker severity.",
    "Prefer rejecting or routing to human review when feasibility, phenotype, missingness, temporal validity, method choice, or reviewer evidence is insufficient.",
    "Return strict JSON only.",
  ].join(" ");
}

async function recentControllerToolResultSummaries(state: ControllerState): Promise<Array<{
  toolRunId: string;
  toolId: ControllerToolId;
  status: ControllerToolExecution["status"];
  reason: string;
  stdoutPath: string | null;
  summary: string;
  artifactRead?: {
    selector: string;
    status: "found" | "missing" | "blocked";
    artifactKind: string | null;
    artifactPath: string | null;
    truncated: boolean;
    contentPreview: string;
  };
  repoFileRead?: {
    relativePath: string;
    status: ControllerRepoFileRead["status"];
    bytes: number;
    truncated: boolean;
    contentPreview: string;
    reason: string;
  };
  repoSearch?: {
    query: string;
    scope: string;
    status: ControllerRepoSearchResult["status"];
    searchedFiles: number;
    skippedFiles: number;
    truncated: boolean;
    matches: ControllerRepoSearchResult["matches"];
  };
  agenteerCommand?: {
    status: ControllerAgenteerCommandResult["status"];
    args: string[];
    exitCode: number | null;
    stdoutPreview: string;
    stderrPreview: string;
    nextAction: string;
  };
  inspection?: {
    status: ControllerInternalInspection["status"];
    failedChecks: string[];
    warningChecks: string[];
  };
  gitDiff?: {
    changedFiles: string[];
    truncated: boolean;
    diffStatPreview: string;
    diffPreview: string;
  };
  patchProposal?: {
    status: ControllerSourcePatchProposal["status"];
    summary: string;
    risk: ControllerSourcePatchProposal["risk"];
    changedFiles: string[];
    validationReasons: string[];
    tests: string[];
  };
  patchApply?: {
    status: ControllerSourcePatchApplyResult["status"];
    proposalId: string | null;
    changedFiles: string[];
    validationReasons: string[];
    diffSnapshotPath: string | null;
    nextAction: string;
  };
  patchVerification?: {
    status: ControllerSourcePatchVerification["status"];
    applyId: string | null;
    proposalId: string | null;
    commands: Array<{ command: string; status: "passed" | "failed" | "skipped"; exitCode: number | null }>;
    nextAction: string;
  };
  patchRollback?: {
    status: ControllerSourcePatchRollback["status"];
    applyId: string | null;
    changedFiles: string[];
    validationReasons: string[];
    nextAction: string;
  };
  controllerStatus?: {
    status: ControllerUnifiedStatus["status"];
    controllerStatus: ControllerRunStatus;
    currentStage: ControllerStage;
    safeToAutoContinue: boolean;
    readyToLaunch: boolean;
    promotable: boolean;
    blockers: string[];
    warnings: string[];
    activeIssueCodes: string[];
    activeBlockerIssueCodes: string[];
    recommendedCommand: string;
    launchCommand: string | null;
    inspectionCommand: string;
    artifactPaths: {
      doctor: string;
      runbook: string;
      goldenPacket: string;
      runnerPacket: string;
    };
    keyArtifactReports: Record<string, string | null>;
    nextAction: string;
  };
}>> {
  const summaries = [];
  for (const tool of state.toolActions.slice(-6)) {
    const raw = tool.stdoutPath ? await readJsonIfPresent(tool.stdoutPath) : null;
    const artifactRead = valueAtPath(raw, "controllerArtifactRead") as {
      selector?: string;
      status?: "found" | "missing" | "blocked";
      artifact?: { kind?: string; path?: string } | null;
      truncated?: boolean;
      contentPreview?: string;
    } | null;
    const repoFileRead = valueAtPath(raw, "controllerRepoFileRead") as Partial<ControllerRepoFileRead> | null;
    const repoSearch = valueAtPath(raw, "controllerRepoSearch") as Partial<ControllerRepoSearchResult> | null;
    const agenteerCommand = valueAtPath(raw, "controllerAgenteerCommand") as Partial<ControllerAgenteerCommandResult> | null;
    const controllerStatus = (valueAtPath(raw, "controllerStatus") as Partial<ControllerUnifiedStatus> | null) ?? await readControllerStatusFromAgenteerToolResult(agenteerCommand, tool.stdoutPath);
    const inspection = (valueAtPath(raw, "controllerInspection") ?? tool.inspection) as ControllerInternalInspection | null;
    const gitDiff = valueAtPath(raw, "controllerGitDiff") as Partial<ControllerGitDiffSnapshot> | null;
    const patchProposal = valueAtPath(raw, "controllerSourcePatchProposal") as Partial<ControllerSourcePatchProposal> | null;
    const patchApply = valueAtPath(raw, "controllerSourcePatchApply") as Partial<ControllerSourcePatchApplyResult> | null;
    const patchVerification = valueAtPath(raw, "controllerSourcePatchVerification") as Partial<ControllerSourcePatchVerification> | null;
    const patchRollback = valueAtPath(raw, "controllerSourcePatchRollback") as Partial<ControllerSourcePatchRollback> | null;
    summaries.push({
      toolRunId: tool.toolRunId,
      toolId: tool.request.toolId,
      status: tool.status,
      reason: tool.request.reason,
      stdoutPath: tool.stdoutPath,
      summary: tool.status === "succeeded"
        ? controllerStatus
          ? `controller-status ${controllerStatus.status ?? "unknown"}: ${String(controllerStatus.nextAction ?? controllerStatus.recommendedCommand ?? "status refreshed").slice(0, 240)}`
          : `${tool.request.toolId} succeeded.`
        : `${tool.request.toolId} ${tool.status}: ${tool.validationReasons.join("; ") || tool.stderrPreview || "no detail"}`,
      ...(controllerStatus ? { controllerStatus: summarizeControllerStatusForTool(controllerStatus) } : {}),
      ...(artifactRead ? {
        artifactRead: {
          selector: String(artifactRead.selector ?? ""),
          status: artifactRead.status ?? "missing",
          artifactKind: artifactRead.artifact?.kind ?? null,
          artifactPath: artifactRead.artifact?.path ?? null,
          truncated: Boolean(artifactRead.truncated),
          contentPreview: String(artifactRead.contentPreview ?? "").slice(0, 4000),
        },
      } : {}),
      ...(repoFileRead ? {
        repoFileRead: {
          relativePath: String(repoFileRead.relativePath ?? ""),
          status: repoFileRead.status === "found" || repoFileRead.status === "missing" || repoFileRead.status === "blocked" || repoFileRead.status === "too_large" ? repoFileRead.status : "blocked",
          bytes: typeof repoFileRead.bytes === "number" ? repoFileRead.bytes : 0,
          truncated: Boolean(repoFileRead.truncated),
          contentPreview: String(repoFileRead.contentPreview ?? "").slice(0, 5000),
          reason: String(repoFileRead.reason ?? ""),
        },
      } : {}),
      ...(repoSearch ? {
        repoSearch: {
          query: String(repoSearch.query ?? ""),
          scope: String(repoSearch.scope ?? ""),
          status: repoSearch.status === "found" || repoSearch.status === "no_matches" || repoSearch.status === "blocked" ? repoSearch.status : "blocked",
          searchedFiles: typeof repoSearch.searchedFiles === "number" ? repoSearch.searchedFiles : 0,
          skippedFiles: typeof repoSearch.skippedFiles === "number" ? repoSearch.skippedFiles : 0,
          truncated: Boolean(repoSearch.truncated),
          matches: Array.isArray(repoSearch.matches)
            ? repoSearch.matches.map(match => ({
              path: String(match.path ?? ""),
              lineNumber: typeof match.lineNumber === "number" ? match.lineNumber : 0,
              linePreview: String(match.linePreview ?? "").slice(0, 500),
            })).slice(0, 40)
            : [],
        },
      } : {}),
      ...(agenteerCommand ? {
        agenteerCommand: {
          status: agenteerCommand.status === "passed" || agenteerCommand.status === "failed" || agenteerCommand.status === "blocked" ? agenteerCommand.status : "failed",
          args: Array.isArray(agenteerCommand.command?.args) ? agenteerCommand.command.args.map(String).slice(1, 12) : [],
          exitCode: typeof agenteerCommand.exitCode === "number" ? agenteerCommand.exitCode : null,
          stdoutPreview: String(agenteerCommand.stdoutPreview ?? "").slice(0, 5000),
          stderrPreview: String(agenteerCommand.stderrPreview ?? "").slice(0, 2000),
          nextAction: String(agenteerCommand.nextAction ?? ""),
        },
      } : {}),
      ...(inspection ? {
        inspection: {
          status: inspection.status,
          failedChecks: inspection.checks.filter(check => check.status === "fail").map(check => check.id),
          warningChecks: inspection.checks.filter(check => check.status === "warning").map(check => check.id),
        },
      } : {}),
      ...(gitDiff ? {
        gitDiff: {
          changedFiles: Array.isArray(gitDiff.changedFiles) ? gitDiff.changedFiles.filter((item): item is string => typeof item === "string").slice(0, 40) : [],
          truncated: Boolean(gitDiff.truncated),
          diffStatPreview: String(gitDiff.diffStatPreview ?? "").slice(0, 2000),
          diffPreview: String(gitDiff.diffPreview ?? "").slice(0, 4000),
        },
      } : {}),
      ...(patchProposal ? {
        patchProposal: {
          status: (patchProposal.status === "valid" ? "valid" : "invalid") as ControllerSourcePatchProposal["status"],
          summary: String(patchProposal.summary ?? ""),
          risk: patchProposal.risk === "low" || patchProposal.risk === "medium" || patchProposal.risk === "high" ? patchProposal.risk : "high",
          changedFiles: Array.isArray(patchProposal.changes) ? patchProposal.changes.map(change => change.path).filter((item): item is string => typeof item === "string").slice(0, 20) : [],
          validationReasons: Array.isArray(patchProposal.validationReasons) ? patchProposal.validationReasons.filter((item): item is string => typeof item === "string").slice(0, 12) : [],
          tests: Array.isArray(patchProposal.tests) ? patchProposal.tests.filter((item): item is string => typeof item === "string").slice(0, 12) : [],
        },
      } : {}),
      ...(patchApply ? {
        patchApply: {
          status: patchApply.status === "applied" || patchApply.status === "failed" || patchApply.status === "rejected" ? patchApply.status : "failed",
          proposalId: typeof patchApply.proposalId === "string" ? patchApply.proposalId : null,
          changedFiles: Array.isArray(patchApply.appliedChanges) ? patchApply.appliedChanges.map(change => change.path).filter((item): item is string => typeof item === "string").slice(0, 20) : [],
          validationReasons: Array.isArray(patchApply.validationReasons) ? patchApply.validationReasons.filter((item): item is string => typeof item === "string").slice(0, 12) : [],
          diffSnapshotPath: typeof patchApply.diffSnapshotPath === "string" ? patchApply.diffSnapshotPath : null,
          nextAction: typeof patchApply.nextAction === "string" ? patchApply.nextAction : "",
        },
      } : {}),
      ...(patchVerification ? {
        patchVerification: {
          status: patchVerification.status === "passed" || patchVerification.status === "failed" || patchVerification.status === "rejected" ? patchVerification.status : "failed",
          applyId: typeof patchVerification.applyId === "string" ? patchVerification.applyId : null,
          proposalId: typeof patchVerification.proposalId === "string" ? patchVerification.proposalId : null,
          commands: Array.isArray(patchVerification.commands)
            ? patchVerification.commands.map(command => ({
              command: String(command.command ?? ""),
              status: command.status === "passed" || command.status === "failed" || command.status === "skipped" ? command.status : "failed",
              exitCode: typeof command.exitCode === "number" ? command.exitCode : null,
            })).slice(0, 12)
            : [],
          nextAction: typeof patchVerification.nextAction === "string" ? patchVerification.nextAction : "",
        },
      } : {}),
      ...(patchRollback ? {
        patchRollback: {
          status: patchRollback.status === "rolled_back" || patchRollback.status === "failed" || patchRollback.status === "rejected" ? patchRollback.status : "failed",
          applyId: typeof patchRollback.applyId === "string" ? patchRollback.applyId : null,
          changedFiles: Array.isArray(patchRollback.restoredChanges) ? patchRollback.restoredChanges.map(change => change.path).filter((item): item is string => typeof item === "string").slice(0, 20) : [],
          validationReasons: Array.isArray(patchRollback.validationReasons) ? patchRollback.validationReasons.filter((item): item is string => typeof item === "string").slice(0, 12) : [],
          nextAction: typeof patchRollback.nextAction === "string" ? patchRollback.nextAction : "",
        },
      } : {}),
    });
  }
  return summaries;
}

async function readControllerStatusFromAgenteerToolResult(command: Partial<ControllerAgenteerCommandResult> | null, wrapperStdoutPath?: string | null): Promise<Partial<ControllerUnifiedStatus> | null> {
  if (!command?.command || !isControllerStatusAgenteerCommand(command.command)) return null;
  const wrapperRaw = wrapperStdoutPath ? await readJsonIfPresent(wrapperStdoutPath) : null;
  const wrapperCommand = valueAtPath(wrapperRaw, "controllerAgenteerCommand") as Partial<ControllerAgenteerCommandResult> | null;
  const stdoutPath = typeof command.stdoutPath === "string" ? command.stdoutPath : null;
  const wrapperCommandStdoutPath = typeof wrapperCommand?.stdoutPath === "string" ? wrapperCommand.stdoutPath : null;
  const candidates = [
    wrapperCommandStdoutPath ? await readTextIfPresent(wrapperCommandStdoutPath) : null,
    stdoutPath ? await readTextIfPresent(stdoutPath) : null,
    typeof wrapperCommand?.stdoutPreview === "string" ? wrapperCommand.stdoutPreview : null,
    typeof command.stdoutPreview === "string" ? command.stdoutPreview : null,
  ].filter((item): item is string => Boolean(item));
  for (const candidate of candidates) {
    const parsed = parseControllerStatusFromText(candidate);
    if (parsed) return await enrichControllerStatusWithGoldenReportSlots(parsed, command);
  }
  const preview = typeof command.stdoutPreview === "string" ? command.stdoutPreview : "";
  if (preview.includes("\"controllerStatus\"")) {
    return await enrichControllerStatusWithGoldenReportSlots({
      status: extractJsonStringField(preview, "status") as ControllerUnifiedStatus["status"] | undefined,
      controllerStatus: extractJsonStringField(preview, "controllerStatus") as ControllerRunStatus | undefined,
      currentStage: extractJsonStringField(preview, "currentStage") as ControllerStage | undefined,
      safeToAutoContinue: extractJsonBooleanField(preview, "safeToAutoContinue"),
      readyToLaunch: extractJsonBooleanField(preview, "readyToLaunch"),
      promotable: extractJsonBooleanField(preview, "promotable"),
      activeIssueCodes: extractJsonStringArrayField(preview, "activeIssueCodes"),
      activeBlockerIssueCodes: extractJsonStringArrayField(preview, "activeBlockerIssueCodes"),
      blockers: extractJsonStringArrayField(preview, "blockers"),
      warnings: extractJsonStringArrayField(preview, "warnings"),
      recommendedCommand: extractJsonStringField(preview, "recommendedCommand") ?? "",
      launchCommand: extractJsonStringField(preview, "launchCommand") ?? null,
      inspectionCommand: extractJsonStringField(preview, "inspectionCommand") ?? "",
      nextAction: extractJsonStringField(preview, "nextAction") ?? command.nextAction ?? "",
    }, command);
  }
  return null;
}

async function enrichControllerStatusWithGoldenReportSlots(status: Partial<ControllerUnifiedStatus>, command: Partial<ControllerAgenteerCommandResult>): Promise<Partial<ControllerUnifiedStatus>> {
  if (status.keyArtifactReports && Object.keys(status.keyArtifactReports).length) return status;
  const statePath = controllerStatePathFromAgenteerCommand(command);
  if (!statePath) return status;
  const goldenRaw = await readJsonIfPresent(path.join(path.dirname(statePath), "controller-golden-packet.json"));
  const goldenPacket = valueAtPath(goldenRaw, "controllerGoldenPacket") as Partial<ControllerGoldenPacket> | null;
  return goldenPacket?.keyArtifactReports && typeof goldenPacket.keyArtifactReports === "object"
    ? { ...status, keyArtifactReports: goldenPacket.keyArtifactReports }
    : status;
}

function controllerStatePathFromAgenteerCommand(command: Partial<ControllerAgenteerCommandResult>): string | null {
  const args = Array.isArray(command.command?.args) ? command.command.args.map(String) : [];
  const stateIndex = args.indexOf("--state");
  const candidate = stateIndex >= 0 ? args[stateIndex + 1] : null;
  return candidate ? path.resolve(candidate) : null;
}

async function readTextIfPresent(file: string): Promise<string | null> {
  try {
    return await readFile(file, "utf-8");
  } catch {
    return null;
  }
}

function parseControllerStatusFromText(text: string): Partial<ControllerUnifiedStatus> | null {
  if (!text.includes("\"controllerStatus\"")) return null;
  for (const candidate of [text, ...jsonObjectSlices(text)]) {
    if (!candidate) continue;
    try {
      const parsed = JSON.parse(candidate) as { controllerStatus?: Partial<ControllerUnifiedStatus> };
      if (parsed.controllerStatus) return parsed.controllerStatus;
    } catch {
      continue;
    }
  }
  return null;
}

function jsonObjectSlices(text: string): string[] {
  const slices: string[] = [];
  for (let start = text.indexOf("{"); start >= 0; start = text.indexOf("{", start + 1)) {
    let depth = 0;
    let inString = false;
    let escaped = false;
    for (let index = start; index < text.length; index += 1) {
      const char = text[index];
      if (inString) {
        if (escaped) {
          escaped = false;
        } else if (char === "\\") {
          escaped = true;
        } else if (char === "\"") {
          inString = false;
        }
        continue;
      }
      if (char === "\"") {
        inString = true;
      } else if (char === "{") {
        depth += 1;
      } else if (char === "}") {
        depth -= 1;
        if (depth === 0) {
          const candidate = text.slice(start, index + 1);
          if (candidate.includes("\"controllerStatus\"")) slices.push(candidate);
          break;
        }
      }
    }
  }
  return slices;
}

function extractJsonStringField(text: string, field: string): string | null {
  const pattern = new RegExp(`"${escapeRegExp(field)}"\\s*:\\s*"((?:\\\\.|[^"\\\\])*)"`);
  const match = pattern.exec(text);
  if (!match) return null;
  try {
    return JSON.parse(`"${match[1]}"`) as string;
  } catch {
    return match[1] ?? null;
  }
}

function extractJsonBooleanField(text: string, field: string): boolean | undefined {
  const pattern = new RegExp(`"${escapeRegExp(field)}"\\s*:\\s*(true|false)`);
  const match = pattern.exec(text);
  if (!match) return undefined;
  return match[1] === "true";
}

function extractJsonStringArrayField(text: string, field: string): string[] {
  const pattern = new RegExp(`"${escapeRegExp(field)}"\\s*:\\s*\\[((?:.|\\n)*?)\\]`);
  const match = pattern.exec(text);
  if (!match) return [];
  const body = match[1] ?? "";
  try {
    const parsed = JSON.parse(`[${body}]`) as unknown;
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [...body.matchAll(/"((?:\\.|[^"\\])*)"/g)]
      .map(item => {
        try {
          return JSON.parse(`"${item[1]}"`) as string;
        } catch {
          return item[1] ?? "";
        }
      })
      .filter(Boolean);
  }
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function summarizeControllerStatusForTool(controllerStatus: Partial<ControllerUnifiedStatus>): NonNullable<Awaited<ReturnType<typeof recentControllerToolResultSummaries>>[number]["controllerStatus"]> {
  return {
    status: controllerStatus.status === "ready" || controllerStatus.status === "blocked" || controllerStatus.status === "review" || controllerStatus.status === "complete" ? controllerStatus.status : "review",
    controllerStatus: controllerStatus.controllerStatus === "running" || controllerStatus.controllerStatus === "complete" || controllerStatus.controllerStatus === "blocked" || controllerStatus.controllerStatus === "needs_human_review" ? controllerStatus.controllerStatus : "needs_human_review",
    currentStage: controllerStageSchema.safeParse(controllerStatus.currentStage).success ? controllerStatus.currentStage as ControllerStage : "human_review",
    safeToAutoContinue: Boolean(controllerStatus.safeToAutoContinue),
    readyToLaunch: Boolean(controllerStatus.readyToLaunch),
    promotable: Boolean(controllerStatus.promotable),
    blockers: Array.isArray(controllerStatus.blockers) ? controllerStatus.blockers.filter((item): item is string => typeof item === "string").slice(0, 12) : [],
    warnings: Array.isArray(controllerStatus.warnings) ? controllerStatus.warnings.filter((item): item is string => typeof item === "string").slice(0, 12) : [],
    activeIssueCodes: Array.isArray(controllerStatus.activeIssueCodes) ? controllerStatus.activeIssueCodes.filter((item): item is string => typeof item === "string").slice(0, 24) : [],
    activeBlockerIssueCodes: Array.isArray(controllerStatus.activeBlockerIssueCodes) ? controllerStatus.activeBlockerIssueCodes.filter((item): item is string => typeof item === "string").slice(0, 24) : [],
    recommendedCommand: String(controllerStatus.recommendedCommand ?? ""),
    launchCommand: typeof controllerStatus.launchCommand === "string" ? controllerStatus.launchCommand : null,
    inspectionCommand: String(controllerStatus.inspectionCommand ?? ""),
    artifactPaths: {
      doctor: String(controllerStatus.artifactPaths?.doctor ?? ""),
      runbook: String(controllerStatus.artifactPaths?.runbook ?? ""),
      goldenPacket: String(controllerStatus.artifactPaths?.goldenPacket ?? ""),
      runnerPacket: String(controllerStatus.artifactPaths?.runnerPacket ?? ""),
    },
    keyArtifactReports: Object.fromEntries(
      Object.entries(controllerStatus.keyArtifactReports ?? {})
        .filter(([key, value]) => typeof key === "string" && (typeof value === "string" || value === null))
        .slice(0, 24),
    ),
    nextAction: String(controllerStatus.nextAction ?? ""),
  };
}

async function writeControllerDecisionContextBundle(
  state: ControllerState,
  gateResult: ControllerGate,
  deterministic: ControllerDecision,
): Promise<ControllerDecisionContextBundle> {
  const bundleId = `controller_decision_context_${String(state.decisions.length + 1).padStart(3, "0")}`;
  const outPath = path.join(state.rootDir, `${bundleId}.json`);
  const reportPath = path.join(state.rootDir, `${bundleId}.md`);
  const feasibility = await loadControllerFeasibilitySummary(state);
  const datasetSemanticAudit = await loadControllerDatasetSemanticAuditSummary(state);
  const recentToolResults = await recentControllerToolResultSummaries(state);
  const workPlan = await loadControllerWorkPlanSummary(state);
  const issueLedger = await loadControllerIssueLedgerSummary(state);
  const latestStageReview = await loadControllerStageReviewSummary(state);
  const executionAgenda = await loadControllerExecutionAgendaSummary(state);
  const bundle: ControllerDecisionContextBundle = {
    schemaVersion: 1,
    generatedAtIso: nowIso(),
    bundleId,
    runId: state.runId,
    statePath: state.statePath,
    stage: state.currentStage,
    status: state.status,
    question: state.inputs.question,
    inputs: {
      dataPath: state.inputs.dataPath,
      datasetDir: state.inputs.datasetDir,
      runDir: state.inputs.runDir,
      method: state.inputs.method,
      outcome: state.inputs.outcome,
      exposure: state.inputs.exposure,
      group: state.inputs.group,
      outcomeThreshold: state.inputs.outcomeThreshold,
      exposureThreshold: state.inputs.exposureThreshold,
      time: state.inputs.time,
      start: state.inputs.start,
      stop: state.inputs.stop,
      event: state.inputs.event,
      id: state.inputs.id,
      strata: state.inputs.strata,
      cluster: state.inputs.cluster,
      period: state.inputs.period,
      post: state.inputs.post,
      runningVariable: state.inputs.runningVariable,
      cutoff: state.inputs.cutoff,
      instrument: state.inputs.instrument,
      alphaPenalty: state.inputs.alphaPenalty,
      l1Ratio: state.inputs.l1Ratio,
      weight: state.inputs.weight,
      offset: state.inputs.offset,
      variables: state.inputs.variables,
      covariates: state.inputs.covariates,
      exactCovariates: state.inputs.exactCovariates,
      surveyDesign: state.inputs.surveyDesign,
      allowSurveyApproximation: state.inputs.allowSurveyApproximation,
    },
    policy: {
      autonomy: state.policy.autonomy,
      allowExecution: state.policy.allowExecution,
      allowContext: state.policy.allowContext,
      allowLiterature: state.policy.allowLiterature,
      allowExternalReview: state.policy.allowExternalReview,
      allowAutoRepair: state.policy.allowAutoRepair,
      requireControllerModel: state.policy.requireControllerModel,
      controller: state.policy.controller,
      controllerBudget: state.policy.controllerBudget,
      allowedToolIds: state.policy.allowedToolIds,
    },
    gate: gateResult,
    deterministicRecommendation: deterministic,
    issueLedger,
    workPlan,
    feasibility,
    datasetSemanticAudit,
    latestStageReview,
    executionAgenda,
    recentActions: state.actions.slice(-4),
    recentToolResults,
    recentArtifacts: state.artifacts.slice(-16),
    missingRequiredArtifacts: state.artifacts.filter(item => item.requiredForPromotion && !item.sha256),
    allowedActions: allowedActionsForStage(state.currentStage),
    allowedInputPatchFields: Object.keys(controllerInputPatchSchema.shape),
    instructions: [
      "Choose exactly one allowed action for the current stage.",
      "Use issueLedger.topIssues as the controller's active triage list; address blockers before proceeding.",
      "Use issueLedger.topIssues.issueCode and per-item issueCodes as stable issue identifiers for rationale and riskFlags.",
      "Use executionAgenda.activeBlockerIssueCodes as the hard stop list. executionAgenda.activeIssueCodes includes advisory labels too; carry them in riskFlags but do not treat warning-only labels as hard blockers.",
      "Use latestStageReview.findings as the most recent operator-style critique of the previous stage.",
      "Use executionAgenda.items as the bounded action queue; prefer executable safe items unless an issue requires review or patching.",
      "Do not choose run_analysis, decide_promotion, complete, or any continuation action while executionAgenda.activeBlockerIssueCodes remain unresolved.",
      "Use workPlan.pending and workPlan.blocked to avoid skipping required stages.",
      "Use feasibility evidence to reject weak or impossible study ideas before execution.",
      "Use datasetSemanticAudit to notice suspicious unused columns and avoid selecting them without unit/coding repair.",
      "Use recentToolResults as observed evidence from bounded tool calls; do not request the same unchanged artifact repeatedly.",
      "Use recentToolResults.controllerStatus.keyArtifactReports to distinguish Markdown report-backed evidence from JSON-only null report slots.",
      "Only propose inputPatch fields listed in allowedInputPatchFields.",
      "Do not claim completion unless required artifacts, QA, inspection, and promotion evidence are present.",
    ],
    outPath,
    reportPath,
  };
  await writeJson(outPath, { schemaVersion: 1, controllerDecisionContext: bundle });
  await writeFile(reportPath, renderControllerDecisionContextMarkdown(bundle));
  return bundle;
}

async function loadControllerWorkPlanSummary(state: ControllerState): Promise<ControllerDecisionContextBundle["workPlan"]> {
  const latest = state.workPlans.at(-1);
  if (!latest) {
    return { present: false, planId: null, status: null, currentStage: null, pending: [], blocked: [], risks: [], outPath: null };
  }
  const raw = await readJsonIfPresent(latest.outPath);
  const plan = (valueAtPath(raw, "controllerWorkPlan") ?? raw) as Partial<ControllerWorkPlan> | null;
  if (!plan || !Array.isArray(plan.items)) {
    return { present: false, planId: latest.planId, status: latest.status, currentStage: latest.currentStage, pending: [], blocked: [], risks: [], outPath: latest.outPath };
  }
  const items = plan.items.filter(item => item && typeof item === "object") as ControllerWorkPlanItem[];
  return {
    present: true,
    planId: String(plan.planId ?? latest.planId),
    status: plan.status ?? latest.status,
    currentStage: plan.currentStage ?? latest.currentStage,
    pending: items
      .filter(item => item.status === "pending" || item.status === "in_progress")
      .map(item => ({ stage: item.stage, action: item.action, requirement: item.requirement }))
      .slice(0, 12),
    blocked: items
      .filter(item => item.status === "blocked")
      .map(item => ({ stage: item.stage, blocker: item.blocker, evidenceRefs: item.evidenceRefs }))
      .slice(0, 8),
    risks: Array.isArray(plan.risks) ? plan.risks.map(String).slice(0, 12) : [],
    outPath: latest.outPath,
  };
}

async function loadControllerIssueLedgerSummary(state: ControllerState): Promise<ControllerDecisionContextBundle["issueLedger"]> {
  const latest = state.issueLedgers.at(-1);
  if (!latest) return { present: false, ledgerId: null, status: null, topIssues: [], outPath: null };
  const raw = await readJsonIfPresent(latest.outPath);
  const ledger = (valueAtPath(raw, "controllerIssueLedger") ?? raw) as Partial<ControllerIssueLedger> | null;
  if (!ledger || !Array.isArray(ledger.issues)) {
    return { present: false, ledgerId: latest.ledgerId, status: latest.status, topIssues: [], outPath: latest.outPath };
  }
  return {
    present: true,
    ledgerId: String(ledger.ledgerId ?? latest.ledgerId),
    status: ledger.status ?? latest.status,
    topIssues: ledger.issues
      .filter(issue => issue && typeof issue === "object" && issue.status !== "resolved")
      .slice(0, 8)
      .map(issue => ({
        id: issue.id,
        issueCode: issue.issueCode,
        severity: issue.severity,
        category: issue.category,
        message: issue.message,
        suggestedAction: issue.suggestedAction,
        reentryStage: issue.reentryStage,
        evidenceRefs: issue.evidenceRefs,
      })),
    outPath: latest.outPath,
  };
}

async function loadControllerStageReviewSummary(state: ControllerState): Promise<ControllerDecisionContextBundle["latestStageReview"]> {
  const latest = state.stageReviews.at(-1);
  if (!latest) return { present: false, reviewId: null, status: null, reviewedStage: null, currentStage: null, findings: [], recommendedCommand: null, outPath: null };
  const raw = await readJsonIfPresent(latest.outPath);
  const review = (valueAtPath(raw, "controllerStageReview") ?? raw) as Partial<ControllerStageReview> | null;
  if (!review || !Array.isArray(review.findings)) {
    return { present: false, reviewId: latest.reviewId, status: latest.status, reviewedStage: latest.reviewedStage, currentStage: latest.currentStage, findings: [], recommendedCommand: null, outPath: latest.outPath };
  }
  return {
    present: true,
    reviewId: String(review.reviewId ?? latest.reviewId),
    status: review.status ?? latest.status,
    reviewedStage: review.reviewedStage ?? latest.reviewedStage,
    currentStage: review.currentStage ?? latest.currentStage,
    findings: review.findings
      .filter(finding => finding && typeof finding === "object")
      .slice(0, 8)
      .map(finding => ({
        severity: finding.severity,
        category: finding.category,
        message: finding.message,
        issueCodes: finding.issueCodes,
        repairAction: finding.repairAction,
        reentryStage: finding.reentryStage,
        evidenceRefs: finding.evidenceRefs,
      })),
    recommendedCommand: typeof review.recommendedCommand === "string" ? review.recommendedCommand : null,
    outPath: latest.outPath,
  };
}

async function loadControllerExecutionAgendaSummary(state: ControllerState): Promise<ControllerDecisionContextBundle["executionAgenda"]> {
  const latest = state.agendas.at(-1);
  if (!latest) return { present: false, agendaId: null, status: null, primaryCommand: null, activeIssueCodes: [], activeBlockerIssueCodes: [], items: [], outPath: null };
  const raw = await readJsonIfPresent(latest.outPath);
  const agenda = (valueAtPath(raw, "controllerExecutionAgenda") ?? raw) as Partial<ControllerExecutionAgenda> | null;
  if (!agenda || !Array.isArray(agenda.items)) {
    return { present: false, agendaId: latest.agendaId, status: latest.status, primaryCommand: latest.primaryCommand, activeIssueCodes: [], activeBlockerIssueCodes: [], items: [], outPath: latest.outPath };
  }
  return {
    present: true,
    agendaId: String(agenda.agendaId ?? latest.agendaId),
    status: agenda.status ?? latest.status,
    primaryCommand: typeof agenda.primaryCommand === "string" ? agenda.primaryCommand : latest.primaryCommand,
    activeIssueCodes: Array.isArray(agenda.activeIssueCodes) ? agenda.activeIssueCodes.map(String) : [],
    activeBlockerIssueCodes: Array.isArray(agenda.activeBlockerIssueCodes) ? agenda.activeBlockerIssueCodes.map(String) : [],
    items: agenda.items
      .filter(item => item && typeof item === "object")
      .slice(0, 8)
      .map(item => ({
        priority: item.priority,
        status: item.status,
        kind: item.kind,
        command: item.command,
        reason: item.reason,
        issueCodes: item.issueCodes,
        safety: item.safety,
        source: item.source,
      })),
    outPath: latest.outPath,
  };
}

function renderControllerDecisionContextMarkdown(bundle: ControllerDecisionContextBundle): string {
  return [
    "# Controller Decision Context",
    "",
    `Bundle: ${bundle.bundleId}`,
    `Generated: ${bundle.generatedAtIso}`,
    `Run ID: ${bundle.runId}`,
    `Stage: ${bundle.stage}`,
    `Status: ${bundle.status}`,
    `Question: ${bundle.question}`,
    "",
    "## Gate",
    "",
    `- Status: ${bundle.gate.status}`,
    `- Label: ${bundle.gate.label}`,
    `- Next stage: ${bundle.gate.nextStage}`,
    ...(bundle.gate.reasons.length ? bundle.gate.reasons.map(reason => `- Reason: ${reason}`) : ["- Reason: none"]),
    "",
    "## Work Plan",
    "",
    `- Present: ${bundle.workPlan.present}`,
    `- Plan: ${bundle.workPlan.planId ?? "(none)"}`,
    `- Status: ${bundle.workPlan.status ?? "(unknown)"}`,
    `- Pending: ${bundle.workPlan.pending.map(item => item.stage).join(", ") || "(none)"}`,
    `- Blocked: ${bundle.workPlan.blocked.map(item => item.stage).join(", ") || "(none)"}`,
    "",
    "## Issue Ledger",
    "",
    `- Present: ${bundle.issueLedger.present}`,
    `- Ledger: ${bundle.issueLedger.ledgerId ?? "(none)"}`,
    `- Status: ${bundle.issueLedger.status ?? "(unknown)"}`,
    ...(bundle.issueLedger.topIssues.length ? bundle.issueLedger.topIssues.map(issue => `- ${issue.severity.toUpperCase()} [${issue.category}${issue.issueCode ? `:${issue.issueCode}` : ""}] ${issue.message}`) : ["- No active issues recorded."]),
    "",
    "## Latest Stage Review",
    "",
    `- Present: ${bundle.latestStageReview.present}`,
    `- Review: ${bundle.latestStageReview.reviewId ?? "(none)"}`,
    `- Status: ${bundle.latestStageReview.status ?? "(unknown)"}`,
    `- Reviewed stage: ${bundle.latestStageReview.reviewedStage ?? "(none)"}`,
    ...(bundle.latestStageReview.findings.length ? bundle.latestStageReview.findings.map(finding => `- ${finding.severity.toUpperCase()} [${finding.category}${finding.issueCodes?.length ? `:${finding.issueCodes.join(",")}` : ""}] ${finding.message}`) : ["- No stage-review findings recorded."]),
    "",
    "## Execution Agenda",
    "",
    `- Present: ${bundle.executionAgenda.present}`,
    `- Agenda: ${bundle.executionAgenda.agendaId ?? "(none)"}`,
    `- Status: ${bundle.executionAgenda.status ?? "(unknown)"}`,
    `- Primary command: ${bundle.executionAgenda.primaryCommand ?? "(none)"}`,
    `- Active issue codes: ${bundle.executionAgenda.activeIssueCodes.join(", ") || "(none)"}`,
    `- Active blocker issue codes: ${bundle.executionAgenda.activeBlockerIssueCodes.join(", ") || "(none)"}`,
    ...(bundle.executionAgenda.items.length ? bundle.executionAgenda.items.map(item => `- P${item.priority} [${item.status}/${item.safety}${item.issueCodes?.length ? `:${item.issueCodes.join(",")}` : ""}] ${item.kind}: ${item.reason}`) : ["- No agenda items recorded."]),
    "",
    "## Feasibility",
    "",
    `- Present: ${bundle.feasibility.present}`,
    `- Verdict: ${bundle.feasibility.verdict}`,
    `- Status: ${bundle.feasibility.status}`,
    `- Score: ${bundle.feasibility.score ?? "unknown"}`,
    `- Confidence: ${bundle.feasibility.confidence ?? "unknown"}`,
    `- Primary action: ${bundle.feasibility.primaryAction}`,
    ...(bundle.feasibility.blockers.length ? bundle.feasibility.blockers.map(item => `- Blocker: ${item}`) : ["- Blocker: none"]),
    ...(bundle.feasibility.warnings.length ? bundle.feasibility.warnings.map(item => `- Warning: ${item}`) : ["- Warning: none"]),
    ...(bundle.feasibility.requiredModifications.length ? bundle.feasibility.requiredModifications.map(item => `- Required modification: ${item}`) : ["- Required modification: none"]),
    ...(bundle.feasibility.clarifyingQuestions.length ? bundle.feasibility.clarifyingQuestions.map(item => `- Clarifying question: ${item}`) : ["- Clarifying question: none"]),
    ...(bundle.feasibility.internalReviews.length ? bundle.feasibility.internalReviews.map(review => `- Internal review ${review.reviewerId}: ${review.stance}; suggests ${review.suggestedVerdict}; confidence=${review.confidence}`) : ["- Internal review: none"]),
    "",
    "## Dataset Semantic Audit",
    "",
    `- Present: ${bundle.datasetSemanticAudit.present}`,
    `- Status: ${bundle.datasetSemanticAudit.status}`,
    `- Selected-role status: ${bundle.datasetSemanticAudit.selectedRoleStatus}`,
    `- Issues: ${bundle.datasetSemanticAudit.issueCount} (${bundle.datasetSemanticAudit.blockerCount} blocker, ${bundle.datasetSemanticAudit.warningCount} warning)`,
    ...(bundle.datasetSemanticAudit.topIssues.length ? bundle.datasetSemanticAudit.topIssues.map(issue => `- ${issue.severity.toUpperCase()} ${issue.column}${issue.selected ? " [selected]" : ""}: ${issue.code} - ${issue.message}`) : ["- Issue: none"]),
    `- Next action: ${bundle.datasetSemanticAudit.nextAction ?? "(none)"}`,
    "",
    "## Deterministic Recommendation",
    "",
    `- Action: ${bundle.deterministicRecommendation.action}`,
    `- Rationale: ${bundle.deterministicRecommendation.rationale}`,
    `- Confidence: ${bundle.deterministicRecommendation.confidence}`,
    "",
    "## Evidence Summary",
    "",
    `- Recent actions: ${bundle.recentActions.length}`,
    `- Recent tool results: ${bundle.recentToolResults.length}`,
    `- Recent artifacts: ${bundle.recentArtifacts.length}`,
    `- Missing required artifacts: ${bundle.missingRequiredArtifacts.map(item => item.kind).join(", ") || "(none)"}`,
    "",
    "## Allowed Actions",
    "",
    bundle.allowedActions.join(", "),
    "",
  ].join("\n");
}

function controllerUserPrompt(bundle: ControllerDecisionContextBundle): string {
  return [
    "Select the next controller action for this pipeline state.",
    "Schema: {\"action\":\"one allowed action\",\"rationale\":\"short actionable reason\",\"confidence\":0.0,\"riskFlags\":[\"...\"],\"inputPatch\":{\"outcome\":\"optional safe correction\"},\"toolRequests\":[{\"toolId\":\"controller-status\",\"args\":[],\"reason\":\"optional first-read readiness refresh\"},{\"toolId\":\"controller-inspect\",\"args\":[],\"reason\":\"optional state-integrity verification\"},{\"toolId\":\"controller-read-artifact\",\"args\":[\"stats-qa\"],\"reason\":\"optional artifact review\"},{\"toolId\":\"controller-search-repo\",\"args\":[\"ControllerState\",\"packages/cli/src\"],\"reason\":\"optional source search\"},{\"toolId\":\"controller-read-file\",\"args\":[\"packages/cli/src/research-machine/controller.ts\"],\"reason\":\"optional source read\"},{\"toolId\":\"controller-run-agenteer\",\"args\":[\"research\",\"methods-catalog\",\"--json\"],\"reason\":\"optional read-only Agenteer introspection\"},{\"toolId\":\"controller-git-diff\",\"args\":[],\"reason\":\"optional source diff review\"},{\"toolId\":\"controller-propose-patch\",\"args\":[\"{\\\"summary\\\":\\\"...\\\",\\\"risk\\\":\\\"low\\\",\\\"changes\\\":[{\\\"path\\\":\\\"packages/...\\\",\\\"rationale\\\":\\\"...\\\",\\\"after\\\":\\\"full file content\\\"}],\\\"tests\\\":[\\\"npm run build\\\"]}\"],\"reason\":\"optional non-applying source patch proposal\"},{\"toolId\":\"controller-apply-patch\",\"args\":[\"latest\"],\"reason\":\"optional reviewed patch application\"},{\"toolId\":\"controller-verify-patch\",\"args\":[\"latest\"],\"reason\":\"optional patch verification\"},{\"toolId\":\"controller-rollback-patch\",\"args\":[\"latest\"],\"reason\":\"optional rollback after failed verification\"}]}",
    "Only include inputPatch when a bounded correction to study variables/method is necessary. Do not patch file paths.",
    "Only include toolRequests when verification materially changes the next decision. Use allowed tool IDs only.",
    `For CLI-backed first-read status evidence, request controller-run-agenteer with args ["research","controller-status","--state","${bundle.statePath}","--json"]; the controller will expose recentToolResults.controllerStatus on the next decision.`,
    "Use recentToolResults as observed evidence from prior bounded tool calls; do not request the same artifact again unless the state changed.",
    "Use recentToolResults.controllerStatus.keyArtifactReports to distinguish Markdown report-backed evidence from JSON-only null report slots.",
    "Prefer executionAgenda.primaryCommand when it is safe and consistent with the allowed action set.",
    "Use executionAgenda.activeBlockerIssueCodes as hard blocker identifiers. executionAgenda.activeIssueCodes can include advisory labels; carry them into rationale/riskFlags without treating warning-only labels as automatic blockers.",
    "Never claim readiness or choose continuation when executionAgenda.activeBlockerIssueCodes remain; choose block, stop_for_human, a targeted safe inputPatch, or a bounded evidence tool.",
    "If latestStageReview.status is block, choose block, stop_for_human, a targeted evidence tool, or a safe inputPatch rather than continuing blindly.",
    "If feasibility.status is block, choose block or stop_for_human unless a safe inputPatch directly resolves the blocker.",
    "If feasibility.status is warning, carry the warnings in riskFlags and avoid overconfident continuation.",
    "If datasetSemanticAudit.selectedRoleStatus is block, choose block or stop_for_human unless a safe inputPatch removes or repairs the selected role.",
    "If datasetSemanticAudit.status is warning, do not select suspicious unused columns in a patch without explaining the unit/coding repair or review evidence.",
    JSON.stringify(bundle, null, 2),
  ].join("\n\n");
}

async function loadControllerDatasetSemanticAuditSummary(state: ControllerState): Promise<{
  present: boolean;
  path: string | null;
  reportPath: string | null;
  status: ControllerDatasetSemanticAudit["status"] | "unknown";
  selectedRoleStatus: ControllerDatasetSemanticAudit["selectedRoleStatus"] | "unknown";
  issueCount: number;
  blockerCount: number;
  warningCount: number;
  selectedRoleIssueCount: number;
  issueCodeSummary: ControllerDatasetSemanticAudit["issueCodeSummary"];
  selectedRoleSummary: ControllerDatasetSemanticAudit["selectedRoleSummary"];
  topIssues: Array<Pick<ControllerDatasetSemanticAudit["issues"][number], "column" | "role" | "selected" | "severity" | "code" | "message">>;
  nextAction: string | null;
}> {
  const pathValue = latestArtifactPath(state, "controller-dataset-semantic-audit");
  const reportPath = latestArtifactPath(state, "controller-dataset-semantic-audit-report");
  if (!pathValue) {
    return {
      present: false,
      path: null,
      reportPath: null,
      status: "unknown",
      selectedRoleStatus: "unknown",
      issueCount: 0,
      blockerCount: 0,
      warningCount: 0,
      selectedRoleIssueCount: 0,
      issueCodeSummary: [],
      selectedRoleSummary: [],
      topIssues: [],
      nextAction: null,
    };
  }
  const raw = await readJsonIfPresent(pathValue);
  const audit = (valueAtPath(raw, "controllerDatasetSemanticAudit") ?? raw) as Partial<ControllerDatasetSemanticAudit> | null;
  if (!audit || typeof audit !== "object") {
    return {
      present: false,
      path: pathValue,
      reportPath,
      status: "unknown",
      selectedRoleStatus: "unknown",
      issueCount: 0,
      blockerCount: 0,
      warningCount: 0,
      selectedRoleIssueCount: 0,
      issueCodeSummary: [],
      selectedRoleSummary: [],
      topIssues: [],
      nextAction: null,
    };
  }
  const issues = Array.isArray(audit.issues) ? audit.issues.filter(issue => issue && typeof issue === "object") : [];
  const rank = (issue: ControllerDatasetSemanticAudit["issues"][number]): number => {
    if (issue.selected && issue.severity === "blocker") return 0;
    if (issue.selected && issue.severity === "warning") return 1;
    if (issue.severity === "blocker") return 2;
    if (issue.severity === "warning") return 3;
    return 4;
  };
  const topIssues = [...issues]
    .sort((a, b) => rank(a) - rank(b) || a.column.localeCompare(b.column))
    .slice(0, 12)
    .map(issue => ({
      column: String(issue.column),
      role: typeof issue.role === "string" ? issue.role : null,
      selected: Boolean(issue.selected),
      severity: issue.severity === "blocker" || issue.severity === "warning" || issue.severity === "note" ? issue.severity : "note",
      code: String(issue.code),
      message: String(issue.message),
    }));
  const status = audit.status === "pass" || audit.status === "warning" || audit.status === "block" ? audit.status : "unknown";
  const selectedRoleStatus = audit.selectedRoleStatus === "pass" || audit.selectedRoleStatus === "warning" || audit.selectedRoleStatus === "block" ? audit.selectedRoleStatus : "unknown";
  return {
    present: true,
    path: pathValue,
    reportPath,
    status,
    selectedRoleStatus,
    issueCount: typeof audit.issueCount === "number" ? audit.issueCount : issues.length,
    blockerCount: typeof audit.blockerCount === "number" ? audit.blockerCount : issues.filter(issue => issue.severity === "blocker").length,
    warningCount: typeof audit.warningCount === "number" ? audit.warningCount : issues.filter(issue => issue.severity === "warning").length,
    selectedRoleIssueCount: typeof audit.selectedRoleIssueCount === "number" ? audit.selectedRoleIssueCount : issues.filter(issue => issue.selected).length,
    issueCodeSummary: Array.isArray(audit.issueCodeSummary)
      ? audit.issueCodeSummary
          .filter(item => item && typeof item === "object")
          .map(item => ({
            code: String(item.code),
            severity: item.severity === "blocker" || item.severity === "warning" || item.severity === "note" ? item.severity : "note",
            totalIssueCount: typeof item.totalIssueCount === "number" ? item.totalIssueCount : 0,
            selectedIssueCount: typeof item.selectedIssueCount === "number" ? item.selectedIssueCount : 0,
            columns: Array.isArray(item.columns) ? item.columns.map(column => String(column)).slice(0, 12) : [],
          }))
      : buildDatasetSemanticIssueCodeSummary(issues as ControllerDatasetSemanticAudit["issues"]),
    selectedRoleSummary: Array.isArray(audit.selectedRoleSummary)
      ? audit.selectedRoleSummary
          .filter(item => item && typeof item === "object")
          .map(item => ({
            column: String(item.column),
            role: String(item.role),
            issueCount: typeof item.issueCount === "number" ? item.issueCount : 0,
            blockerCount: typeof item.blockerCount === "number" ? item.blockerCount : 0,
            warningCount: typeof item.warningCount === "number" ? item.warningCount : 0,
            codes: Array.isArray(item.codes) ? item.codes.map(code => String(code)).slice(0, 12) : [],
          }))
      : buildDatasetSemanticSelectedRoleSummary(issues.filter(issue => issue.selected) as ControllerDatasetSemanticAudit["issues"]),
    topIssues,
    nextAction: typeof audit.nextAction === "string" ? audit.nextAction : null,
  };
}

async function loadControllerFeasibilitySummary(state: ControllerState): Promise<{
  present: boolean;
  path: string | null;
  verdict: FeasibilityVerdict | "unknown";
  status: ControllerFeasibilityVerdict["status"] | "unknown";
  score: number | null;
  confidence: number | null;
  primaryAction: FeasibilityGateResult["primaryAction"] | "unknown";
  blockers: string[];
  warnings: string[];
  issueCodes: string[];
  issues: Array<{
    severity: "blocker" | "warning" | "note";
    code: string;
    message: string;
    source: string;
    domainId?: string;
    variable?: string;
    role?: string;
    reviewerId?: string;
    evidenceRefs: string[];
    suggestedFixes: string[];
  }>;
  nextAction: string | null;
  requiredVariables: string[];
  requiredModifications: string[];
  clarifyingQuestions: string[];
  alternativeStudyIdeas: Array<{ title: string; reason: string; expectedVerdict: FeasibilityVerdict }>;
  internalReviews: Array<{ reviewerId: string; stance: string; suggestedVerdict: string; confidence: number; primaryConcerns: string[] }>;
  methodChecks: Array<{ id: string; status: "pass" | "warning" | "block"; message: string }>;
  outcomeDiagnostics: ControllerFeasibilityVerdict["outcomeDiagnostics"] | null;
}> {
  const pathValue = latestArtifactPath(state, "controller-feasibility-verdict") ?? path.join(state.rootDir, "controller-feasibility-verdict.json");
  const raw = await readJsonIfPresent(pathValue);
  const verdict = (valueAtPath(raw, "controllerFeasibilityVerdict") ?? raw) as Partial<ControllerFeasibilityVerdict> | null;
  if (!verdict || typeof verdict !== "object") {
    return {
      present: false,
      path: null,
      verdict: "unknown",
      status: "unknown",
      score: null,
      confidence: null,
      primaryAction: "unknown",
      blockers: [],
      warnings: [],
      issueCodes: [],
      issues: [],
      nextAction: null,
      requiredVariables: [],
      requiredModifications: [],
      clarifyingQuestions: [],
      alternativeStudyIdeas: [],
      internalReviews: [],
      methodChecks: [],
      outcomeDiagnostics: null,
    };
  }
  const status = verdict.status === "pass" || verdict.status === "warning" || verdict.status === "block" ? verdict.status : "unknown";
  const verdictValue = verdict.verdict === "reject" || verdict.verdict === "needs_data_profiling" || verdict.verdict === "needs_phenotype_review" || verdict.verdict === "exploratory_only" || verdict.verdict === "formal_analysis_ready" ? verdict.verdict : "unknown";
  return {
    present: true,
    path: pathValue,
    verdict: verdictValue,
    status,
    score: typeof verdict.score === "number" ? verdict.score : null,
    confidence: typeof verdict.confidence === "number" ? verdict.confidence : null,
    primaryAction: typeof verdict.primaryAction === "string" ? verdict.primaryAction : "unknown",
    blockers: Array.isArray(verdict.blockers) ? verdict.blockers.map(String).slice(0, 12) : [],
    warnings: Array.isArray(verdict.warnings) ? verdict.warnings.map(String).slice(0, 12) : [],
    issues: Array.isArray(verdict.issues)
      ? verdict.issues
        .filter(issue => issue && typeof issue === "object")
        .map(issue => {
          const record = issue as unknown as Record<string, unknown>;
          const severity: "blocker" | "warning" | "note" = record.severity === "blocker" || record.severity === "warning" || record.severity === "note" ? record.severity : "warning";
          return {
            severity,
            code: String(record.code ?? "FEASIBILITY_ISSUE"),
            message: String(record.message ?? ""),
            source: String(record.source ?? "domain"),
            ...(typeof record.domainId === "string" ? { domainId: record.domainId } : {}),
            ...(typeof record.variable === "string" ? { variable: record.variable } : {}),
            ...(typeof record.role === "string" ? { role: record.role } : {}),
            ...(typeof record.reviewerId === "string" ? { reviewerId: record.reviewerId } : {}),
            evidenceRefs: Array.isArray(record.evidenceRefs) ? record.evidenceRefs.map(String).slice(0, 8) : [],
            suggestedFixes: Array.isArray(record.suggestedFixes) ? record.suggestedFixes.map(String).slice(0, 4) : [],
          };
        })
        .filter(issue => issue.message.length > 0)
        .slice(0, 40)
      : [],
    issueCodes: [
      ...new Set([
        ...(Array.isArray(verdict.issues)
          ? verdict.issues.map(issue => issue && typeof issue === "object" ? String((issue as unknown as Record<string, unknown>).code ?? "") : "")
          : []),
        ...(Array.isArray(verdict.blockers) ? verdict.blockers : []).map(item => String(item).match(/^\s*([A-Z][A-Z0-9_]{2,})\s*:/)?.[1] ?? ""),
        ...(Array.isArray(verdict.warnings) ? verdict.warnings : []).map(item => String(item).match(/^\s*([A-Z][A-Z0-9_]{2,})\s*:/)?.[1] ?? ""),
      ].filter(item => item.length > 0)),
    ].slice(0, 24),
    nextAction: typeof verdict.nextAction === "string" ? verdict.nextAction : null,
    requiredVariables: Array.isArray(verdict.requiredVariables) ? verdict.requiredVariables.map(String) : [],
    requiredModifications: Array.isArray(verdict.requiredModifications) ? verdict.requiredModifications.map(String).slice(0, 8) : [],
    clarifyingQuestions: Array.isArray(verdict.clarifyingQuestions) ? verdict.clarifyingQuestions.map(String).slice(0, 8) : [],
    alternativeStudyIdeas: Array.isArray(verdict.alternativeStudyIdeas)
      ? verdict.alternativeStudyIdeas
        .filter(item => item && typeof item === "object")
        .map(item => ({
          title: String((item as Record<string, unknown>).title ?? ""),
          reason: String((item as Record<string, unknown>).reason ?? ""),
          expectedVerdict: ((item as Record<string, unknown>).expectedVerdict === "reject" || (item as Record<string, unknown>).expectedVerdict === "needs_data_profiling" || (item as Record<string, unknown>).expectedVerdict === "needs_phenotype_review" || (item as Record<string, unknown>).expectedVerdict === "exploratory_only" || (item as Record<string, unknown>).expectedVerdict === "formal_analysis_ready" ? (item as { expectedVerdict: FeasibilityVerdict }).expectedVerdict : "exploratory_only"),
        }))
        .slice(0, 5)
      : [],
    internalReviews: Array.isArray(verdict.internalReviews)
      ? verdict.internalReviews
        .filter(item => item && typeof item === "object")
        .map(item => {
          const rawReview = item as unknown as Record<string, unknown>;
          return {
            reviewerId: String(rawReview.reviewerId ?? "unknown"),
            stance: String(rawReview.stance ?? "unknown"),
            suggestedVerdict: String(rawReview.suggestedVerdict ?? "unknown"),
            confidence: typeof rawReview.confidence === "number" ? rawReview.confidence : 0,
            primaryConcerns: Array.isArray(rawReview.primaryConcerns) ? rawReview.primaryConcerns.map(String).slice(0, 4) : [],
          };
        })
        .slice(0, 5)
      : [],
    methodChecks: Array.isArray(verdict.methodChecks)
      ? verdict.methodChecks.map(check => ({
          id: String((check as Record<string, unknown>).id ?? "unknown"),
          status: (check as Record<string, unknown>).status === "pass" || (check as Record<string, unknown>).status === "warning" || (check as Record<string, unknown>).status === "block" ? (check as { status: "pass" | "warning" | "block" }).status : "warning",
          message: String((check as Record<string, unknown>).message ?? ""),
        })).slice(0, 16)
      : [],
    outcomeDiagnostics: verdict.outcomeDiagnostics ?? null,
  };
}

function allowedActionsForStage(stage: ControllerStage): ControllerActionType[] {
  return [...new Set<ControllerActionType>([stageAction(stage, gate(stage, "pass", "", [], [], stage)), "stop_for_human", "block"])];
}

function parseControllerModelPayload(raw: string): ControllerModelPayload | null {
  const text = raw.trim().replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```$/i, "").trim();
  const parsed = z.object({
    action: controllerActionSchema,
    rationale: z.string().min(1),
    confidence: z.number().min(0).max(1).catch(0.5),
    riskFlags: z.array(z.string()).optional(),
    inputPatch: controllerInputPatchSchema.nullable().optional(),
    toolRequests: z.array(controllerToolRequestSchema).optional(),
  }).safeParse(JSON.parse(text));
  return parsed.success ? parsed.data : null;
}

function estimateControllerCost(state: ControllerState): number {
  const inputTokens = Math.ceil(JSON.stringify({ inputs: state.inputs, gates: state.gates.slice(-3), actions: state.actions.slice(-3), artifacts: state.artifacts.slice(-10) }).length / 4);
  const outputTokens = state.policy.controller.maxOutputTokens;
  const rates = state.policy.controller.provider === "deepseek" ? { input: 0.14, output: 0.28 } : state.policy.controller.provider === "openai" ? { input: 5, output: 15 } : { input: 3, output: 15 };
  return round((inputTokens / 1_000_000) * rates.input + (outputTokens / 1_000_000) * rates.output, 6);
}

async function artifact(kind: string, artifactPath: string, stage: ControllerStage, requiredForPromotion: boolean): Promise<ControllerArtifact> {
  return {
    kind,
    path: path.resolve(artifactPath),
    stage,
    sha256: await hashFileIfPresent(artifactPath),
    requiredForPromotion,
  };
}

async function pushControllerArtifactOnce(
  state: ControllerState,
  kind: string,
  artifactPath: string,
  requiredForPromotion: boolean,
): Promise<void> {
  const resolved = path.resolve(artifactPath);
  if (state.artifacts.some(item => item.path === resolved && item.kind === kind)) return;
  state.artifacts.push(await artifact(kind, artifactPath, state.currentStage, requiredForPromotion));
}

function controllerCheckpointStart(state: ControllerState): ControllerStepCheckpoint["before"] {
  return {
    stage: state.currentStage,
    status: state.status,
    actions: state.actions.length,
    decisions: state.decisions.length,
    gates: state.gates.length,
    tools: state.toolActions.length,
    patches: state.patches.length,
    artifacts: state.artifacts.length,
    costEstimateUsd: state.costEstimateUsd,
  };
}

function controllerRunInvocationStart(state: ControllerState): ControllerRunInvocation["before"] & { startedAtIso: string } {
  return {
    startedAtIso: nowIso(),
    stage: state.currentStage,
    status: state.status,
    actions: state.actions.length,
    decisions: state.decisions.length,
    gates: state.gates.length,
    tools: state.toolActions.length,
    patches: state.patches.length,
    policyUpdates: state.policyUpdates.length,
    artifacts: state.artifacts.length,
    costEstimateUsd: state.costEstimateUsd,
  };
}

async function writeControllerWorkPlan(state: ControllerState, reason: string): Promise<ControllerWorkPlan> {
  const planId = `controller_work_plan_${String((state.workPlans?.length ?? 0) + 1).padStart(3, "0")}`;
  const outPath = path.join(state.rootDir, `${planId}.json`);
  const reportPath = path.join(state.rootDir, `${planId}.md`);
  const plan = buildControllerWorkPlan(state, planId, reason, outPath, reportPath);
  await writeJson(outPath, { schemaVersion: 1, controllerWorkPlan: plan });
  await writeFile(reportPath, renderControllerWorkPlanMarkdown(plan));
  state.workPlans.push({
    planId,
    reason,
    status: plan.status,
    currentStage: plan.currentStage,
    pendingCount: plan.items.filter(item => item.status === "pending" || item.status === "in_progress").length,
    blockedCount: plan.items.filter(item => item.status === "blocked").length,
    outPath,
    reportPath,
  });
  state.artifacts.push(await artifact("controller-work-plan", outPath, state.currentStage, false));
  state.artifacts.push(await artifact("controller-work-plan-report", reportPath, state.currentStage, false));
  return plan;
}

function buildControllerWorkPlan(
  state: ControllerState,
  planId: string,
  reason: string,
  outPath: string,
  reportPath: string,
): ControllerWorkPlan {
  const generatedAtIso = nowIso();
  const stages = controllerWorkPlanStages(state);
  const currentIndex = stages.findIndex(item => item.stage === state.currentStage);
  const lastGate = state.gates.at(-1) ?? null;
  const lastAction = state.actions.at(-1) ?? null;
  const items = stages.map((entry, index): ControllerWorkPlanItem => {
    const applicable = isControllerPlanStageApplicable(state, entry.stage);
    const completed = state.completedStages.includes(entry.stage) || state.currentStage === "complete" && applicable;
    const stageBlocked = lastGate?.stage === entry.stage && lastGate.status === "block"
      || lastAction?.nextStage === "human_review" && lastAction.action === entry.action && lastAction.status === "failed"
      || state.currentStage === entry.stage && (state.status === "blocked" || state.status === "needs_human_review");
    let status: ControllerWorkPlanItem["status"] = "pending";
    if (!applicable) status = "not_applicable";
    else if (completed) status = "completed";
    else if (stageBlocked) status = "blocked";
    else if (state.currentStage === entry.stage && state.status === "running") status = "in_progress";
    else if (currentIndex >= 0 && index < currentIndex) status = "skipped";
    const stageArtifacts = state.artifacts.filter(artifactRef => artifactRef.stage === entry.stage).map(artifactRef => artifactRef.path);
    const evidenceRefs = uniqueText([
      ...stageArtifacts,
      ...(lastGate?.stage === entry.stage ? lastGate.evidenceRefs : []),
      ...(lastAction?.action === entry.action ? lastAction.artifacts.map(artifactRef => artifactRef.path) : []),
    ]);
    return {
      stage: entry.stage,
      action: entry.action,
      status,
      requirement: entry.requirement,
      evidenceRefs,
      blocker: stageBlocked ? uniqueText([...(lastGate?.reasons ?? []), lastAction?.error ?? "", state.stopReason ?? ""]).join("; ") || "Controller is stopped at this stage." : null,
      lastUpdatedIso: generatedAtIso,
    };
  });
  const status: ControllerWorkPlan["status"] = state.status === "complete" || state.currentStage === "complete"
    ? "complete"
    : state.status === "blocked" || state.currentStage === "blocked"
      ? "blocked"
      : state.status === "needs_human_review" || state.currentStage === "human_review"
        ? "needs_human_review"
        : "active";
  return {
    schemaVersion: 1,
    generatedAtIso,
    planId,
    reason,
    runId: state.runId,
    status,
    currentStage: state.currentStage,
    nextRecommendedAction: state.nextRecommendedAction,
    assumptions: controllerPlanAssumptions(state),
    risks: controllerPlanRisks(state),
    items,
    outPath,
    reportPath,
  };
}

function controllerWorkPlanStages(state: ControllerState): Array<{ stage: ControllerStage; action: ControllerActionType; requirement: string }> {
  const stages: Array<{ stage: ControllerStage; action: ControllerActionType; requirement: string }> = [
    { stage: "intake", action: "initialize", requirement: "Confirm a non-empty research question and initialize bounded controller policy." },
    { stage: "context", action: "context_preflight", requirement: "Load or explicitly skip autocontext before planning." },
    { stage: "dataset_feasibility", action: "table_summary", requirement: "Summarize row-level data, validate required variables, and block infeasible study ideas." },
    { stage: "exploration", action: "explore", requirement: "Inspect dataset structure and distribution signals before method selection." },
    { stage: "literature", action: "literature_search", requirement: "Retrieve current literature context when enabled by policy." },
    { stage: "method_selection", action: "select_method", requirement: "Choose a defensible executable method from data, question, and evidence." },
    { stage: "execution", action: "run_analysis", requirement: "Execute the selected analysis in a bounded runner and record required artifacts." },
    { stage: "qa", action: "method_qa", requirement: "Run methods-aware QA and identify repairable execution or validity issues." },
    { stage: "manuscript", action: "write_manuscript", requirement: "Generate a readable manuscript/report from validated analysis artifacts." },
    { stage: "literature_qa", action: "literature_qa", requirement: "Check manuscript claims against retrieved literature when enabled by policy." },
    { stage: "external_review", action: "external_review", requirement: "Run an external reviewer panel when required or enabled by policy." },
    { stage: "repair", action: "apply_repairs", requirement: "Apply bounded repairs only for accepted executable findings and avoid stale artifacts." },
    { stage: "inspection", action: "inspect_run", requirement: "Inspect artifact integrity, run readiness, QA status, and reproducibility signals." },
    { stage: "promotion_decision", action: "decide_promotion", requirement: "Make a promotion or human-review decision from QA, review, and artifact evidence." },
  ];
  return stages.filter(entry => entry.stage !== "repair" || state.policy.allowAutoRepair || state.repairs.length > 0 || state.currentStage === "repair");
}

function isControllerPlanStageApplicable(state: ControllerState, stage: ControllerStage): boolean {
  if (stage === "context") return state.policy.allowContext;
  if (stage === "literature" || stage === "literature_qa") return state.policy.allowLiterature;
  if (stage === "external_review") return state.policy.allowExternalReview || state.policy.requireExternalReviewForPromotion;
  if (stage === "repair") return state.policy.allowAutoRepair || state.repairs.length > 0 || state.currentStage === "repair";
  return true;
}

function controllerPlanAssumptions(state: ControllerState): string[] {
  return [
    state.inputs.dataPath ? `Row-level data path is ${state.inputs.dataPath}.` : "No row-level data path is supplied; execution depends on existing artifacts or later patching.",
    state.inputs.method ? `Requested method is ${state.inputs.method}.` : "No method is preselected; method_selection must infer a route.",
    state.policy.allowExecution ? "Execution is allowed by controller policy." : "Execution is disabled by controller policy.",
    state.policy.allowContext ? "Autocontext preflight is enabled." : "Autocontext preflight is disabled.",
    state.policy.allowLiterature ? "Literature intake is enabled." : "Literature intake is disabled.",
    state.policy.requireControllerModel ? `Strict model controller is required (${state.policy.controller.provider}:${state.policy.controller.model}).` : `Controller model is optional (${state.policy.controller.provider}:${state.policy.controller.model}).`,
  ];
}

function controllerPlanRisks(state: ControllerState): string[] {
  const gateRisks = state.gates
    .filter(gateRecord => gateRecord.status !== "pass")
    .flatMap(gateRecord => gateRecord.reasons.length ? gateRecord.reasons.map(reason => `${gateRecord.stage}: ${reason}`) : [`${gateRecord.stage}: ${gateRecord.label}`]);
  const actionRisks = state.actions
    .filter(action => action.status === "failed" || action.error)
    .map(action => `${action.action}: ${action.error ?? action.outputSummary}`);
  const toolRisks = state.toolActions
    .filter(tool => tool.status !== "succeeded")
    .map(tool => `${tool.request.toolId}: ${tool.validationReasons.join("; ") || tool.stderrPreview || "tool did not succeed"}`);
  const terminalRisk = state.stopReason ? [`stop: ${state.stopReason}`] : [];
  const artifactRisks = state.artifacts
    .filter(artifactRef => artifactRef.requiredForPromotion && !artifactRef.sha256)
    .map(artifactRef => `required artifact is missing hash/file: ${artifactRef.kind}`);
  return uniqueText([...gateRisks, ...actionRisks, ...toolRisks, ...terminalRisk, ...artifactRisks]).slice(0, 20);
}

function renderControllerWorkPlanMarkdown(plan: ControllerWorkPlan): string {
  return [
    "# Controller Work Plan",
    "",
    `Plan: ${plan.planId}`,
    `Run ID: ${plan.runId}`,
    `Generated: ${plan.generatedAtIso}`,
    `Reason: ${plan.reason}`,
    `Status: ${plan.status}`,
    `Current stage: ${plan.currentStage}`,
    "",
    "## Next Action",
    "",
    plan.nextRecommendedAction,
    "",
    "## Stage Checklist",
    "",
    ...plan.items.flatMap(item => [
      `### ${item.stage}`,
      "",
      `- Action: ${item.action}`,
      `- Status: ${item.status}`,
      `- Requirement: ${item.requirement}`,
      `- Blocker: ${item.blocker ?? "(none)"}`,
      `- Evidence: ${item.evidenceRefs.length ? item.evidenceRefs.join(", ") : "(none yet)"}`,
      "",
    ]),
    "## Assumptions",
    "",
    ...plan.assumptions.map(item => `- ${item}`),
    "",
    "## Risks",
    "",
    ...(plan.risks.length ? plan.risks.map(item => `- ${item}`) : ["- None recorded."]),
    "",
  ].join("\n");
}

async function writeControllerStageReview(state: ControllerState, reason: string): Promise<ControllerStageReview> {
  const reviewId = `controller_stage_review_${String((state.stageReviews?.length ?? 0) + 1).padStart(3, "0")}`;
  const outPath = path.join(state.rootDir, `${reviewId}.json`);
  const reportPath = path.join(state.rootDir, `${reviewId}.md`);
  const review = await buildControllerStageReview(state, reviewId, reason, outPath, reportPath);
  await writeJson(outPath, { schemaVersion: 1, controllerStageReview: review });
  await writeFile(reportPath, renderControllerStageReviewMarkdown(review));
  state.stageReviews.push({
    reviewId,
    reason,
    status: review.status,
    reviewedStage: review.reviewedStage,
    currentStage: review.currentStage,
    findingCount: review.findings.length,
    blockerCount: review.findings.filter(item => item.severity === "blocker").length,
    outPath,
    reportPath,
  });
  state.artifacts.push(await artifact("controller-stage-review", outPath, state.currentStage, false));
  state.artifacts.push(await artifact("controller-stage-review-report", reportPath, state.currentStage, false));
  return review;
}

async function buildControllerStageReview(
  state: ControllerState,
  reviewId: string,
  reason: string,
  outPath: string,
  reportPath: string,
): Promise<ControllerStageReview> {
  const lastGate = state.gates.at(-1) ?? null;
  const lastDecision = state.decisions.at(-1) ?? null;
  const lastAction = state.actions.at(-1) ?? null;
  const reviewedStage = lastAction?.artifacts.length ? actionStageForContract(state, lastAction) : lastGate?.stage ?? state.currentStage;
  const findings: ControllerStageReviewFinding[] = [];
  const acceptedEvidenceRefs: string[] = [];
  const addFinding = (
    severity: ControllerStageReviewFinding["severity"],
    category: ControllerStageReviewFinding["category"],
    message: string,
    evidenceRefs: string[],
    repairAction: string,
    reentryStage: ControllerStage,
    issueCodes: string[] = [],
  ) => {
    const cleanMessage = message.trim();
    if (!cleanMessage) return;
    const id = `stage_finding_${stableHash({ reviewId, severity, category, cleanMessage, reentryStage, issueCodes }).slice(0, 10)}`;
    if (findings.some(item => item.id === id)) return;
    findings.push({
      id,
      severity,
      category,
      message: cleanMessage,
      ...(issueCodes.length ? { issueCodes: uniqueText(issueCodes) } : {}),
      evidenceRefs: uniqueText(evidenceRefs),
      repairAction,
      reentryStage,
    });
  };

  if (lastGate && lastGate.status !== "pass") {
    for (const message of lastGate.reasons.length ? lastGate.reasons : [lastGate.label]) {
      addFinding(
        lastGate.status === "block" ? "blocker" : "minor",
        categoryForGate(lastGate),
        message,
        lastGate.evidenceRefs,
        lastGate.status === "block" ? "Do not execute downstream actions until this gate is patched or reviewed." : "Carry this warning into the next decision and report limitations.",
        lastGate.stage,
      );
    }
  }

  if (lastDecision?.riskFlags.length) {
    addFinding(
      "minor",
      categoryForAction(lastDecision.action),
      `Decision risk flags: ${lastDecision.riskFlags.join("; ")}.`,
      lastDecision.modelRawPath ? [lastDecision.modelRawPath] : [],
      "Address decision risk flags before treating the next action as routine.",
      lastDecision.stage,
    );
  }

  if (lastAction) {
    acceptedEvidenceRefs.push(...lastAction.artifacts.map(item => item.path));
    if (lastAction.status === "failed") {
      addFinding(
        "blocker",
        categoryForAction(lastAction.action),
        lastAction.error ?? lastAction.outputSummary,
        lastAction.artifacts.map(item => item.path),
        "Repair the failed action or re-enter the owning stage before continuing.",
        reviewedStage,
      );
    } else if (lastAction.status === "skipped" && lastAction.nextStage !== "human_review" && lastAction.nextStage !== "blocked") {
      addFinding(
        "minor",
        categoryForAction(lastAction.action),
        `${lastAction.action} was skipped: ${lastAction.outputSummary}`,
        lastAction.artifacts.map(item => item.path),
        "Confirm the skipped action is non-applicable before promotion.",
        reviewedStage,
      );
    }
  }

  const latestReadiness = await readLatestControllerActionReadiness(state);
  if (latestReadiness) {
    acceptedEvidenceRefs.push(latestReadiness.outPath, latestReadiness.reportPath);
    for (const check of latestReadiness.checks.filter(item => item.status !== "pass")) {
      addFinding(
        check.status === "fail" ? "blocker" : "minor",
        categoryForAction(latestReadiness.action),
        check.message,
        [latestReadiness.outPath, ...check.evidenceRefs],
        check.status === "fail" ? "Resolve failed action readiness before executing or resuming." : "Carry readiness warning into the next stage review.",
        latestReadiness.stage,
        check.issueCodes ?? issueCodesFromText(check.message),
      );
    }
  }

  const latestContract = await readLatestControllerActionContract(state);
  if (latestContract) {
    acceptedEvidenceRefs.push(latestContract.outPath, latestContract.reportPath);
    if (latestContract.status !== "pass") {
      for (const message of latestContract.reasons) {
        addFinding(
          latestContract.status === "fail" ? "blocker" : "major",
          "artifact",
          message,
          [latestContract.outPath, ...latestContract.missingExpectedArtifacts, ...latestContract.missingRequiredHashes],
          latestContract.status === "fail" ? "Regenerate missing action artifacts before progressing." : "Inspect the action contract warning before promotion.",
          latestContract.stage,
        );
      }
    }
  }

  const feasibility = await loadControllerFeasibilitySummary(state);
  if (feasibility.status === "block") {
    const messages = feasibility.issues.length
      ? feasibility.issues.filter(issue => issue.severity === "blocker").map(issue => `${issue.code}: ${issue.message}`)
      : feasibility.blockers;
    for (const message of messages) {
      addFinding("blocker", "data", message, feasibility.path ? [feasibility.path] : [], "Patch study variables/cohort or provide adequate data before execution.", "dataset_feasibility", feasibility.issueCodes);
    }
  } else if (feasibility.status === "warning") {
    const messages = feasibility.issues.length
      ? feasibility.issues.filter(issue => issue.severity !== "blocker").map(issue => `${issue.code}: ${issue.message}`)
      : feasibility.warnings;
    for (const message of messages.slice(0, 8)) {
      addFinding("minor", "data", message, feasibility.path ? [feasibility.path] : [], "Carry feasibility warning into methods and limitations or patch inputs before execution.", "dataset_feasibility", feasibility.issueCodes);
    }
  }
  const datasetSemanticAudit = await loadControllerDatasetSemanticAuditSummary(state);
  for (const issue of datasetSemanticAudit.topIssues.filter(item => item.selected && item.severity !== "note")) {
    const evidenceRefs = uniqueText([datasetSemanticAudit.path, datasetSemanticAudit.reportPath].filter((item): item is string => Boolean(item)));
    addFinding(
      issue.severity === "blocker" ? "blocker" : "minor",
      "data",
      `${issue.code}: ${issue.message}`,
      evidenceRefs,
      issue.severity === "blocker"
        ? "Patch or remove the selected study role before execution; rerun dataset_feasibility."
        : "Carry selected-role semantic warning into methods/limitations or patch the selected role before execution.",
      "dataset_feasibility",
      [issue.code],
    );
  }

  if ((state.status === "blocked" || state.status === "needs_human_review") && state.stopReason && findings.length === 0) {
    addFinding(
      state.status === "blocked" ? "blocker" : "major",
      "state",
      state.stopReason,
      [],
      "Inspect the stopped state and choose an explicit patch, repair, resume, or stop action.",
      state.currentStage,
    );
  }

  const status: ControllerStageReview["status"] = findings.some(item => item.severity === "blocker")
    ? "block"
    : findings.some(item => item.severity === "major" || item.severity === "minor") ? "warning" : "pass";
  const suggestedPatch = status === "block" && state.policy.allowInputPatches ? examplePatchForState(state) : null;
  return {
    schemaVersion: 1,
    generatedAtIso: nowIso(),
    reviewId,
    reason,
    runId: state.runId,
    reviewedStage,
    currentStage: state.currentStage,
    controllerStatus: state.status,
    status,
    lastGate,
    lastDecision,
    lastAction,
    findings: findings.sort((a, b) => issueSeverityRank(a.severity) - issueSeverityRank(b.severity) || a.category.localeCompare(b.category)),
    acceptedEvidenceRefs: uniqueText(acceptedEvidenceRefs).filter(Boolean),
    suggestedPatch,
    recommendedCommand: commandForStageReview(state, status, suggestedPatch),
    nextAction: status === "block"
      ? "Stop downstream execution until the blocker has been patched, repaired, or explicitly accepted by a human."
      : status === "warning"
        ? "Continue only if the warning is acceptable under the current autonomy policy and carried into QA/reporting."
        : "Stage evidence is acceptable; continue the controller run.",
    outPath,
    reportPath,
  };
}

function commandForStageReview(state: ControllerState, status: ControllerStageReview["status"], suggestedPatch: ControllerInputPatch | null): string {
  if (status === "block" && suggestedPatch) return `agenteer research controller-patch --state ${quotePath(state.statePath)} --patch '${JSON.stringify(suggestedPatch)}' --reason ${JSON.stringify("Stage review blocker correction.")}`;
  if (status === "block") return `agenteer research controller-status --state ${quotePath(state.statePath)}`;
  if (state.status === "running") return `agenteer research controller-run --state ${quotePath(state.statePath)} --max-steps 4`;
  return `agenteer research controller-status --state ${quotePath(state.statePath)}`;
}

async function readLatestControllerStageReview(state: ControllerState): Promise<ControllerStageReview | null> {
  const latest = state.stageReviews.at(-1);
  if (!latest) return null;
  const raw = await readJsonIfPresent(latest.outPath);
  const review = (valueAtPath(raw, "controllerStageReview") ?? raw) as Partial<ControllerStageReview> | null;
  if (!review?.reviewId || !Array.isArray(review.findings)) return null;
  return review as ControllerStageReview;
}

async function readLatestControllerActionReadiness(state: ControllerState): Promise<ControllerActionReadiness | null> {
  const latest = [...state.artifacts].reverse().find(item => item.kind === "controller-action-readiness");
  if (!latest) return null;
  const raw = await readJsonIfPresent(latest.path);
  const readiness = (valueAtPath(raw, "controllerActionReadiness") ?? raw) as Partial<ControllerActionReadiness> | null;
  if (!readiness?.readinessId || !Array.isArray(readiness.checks)) return null;
  return readiness as ControllerActionReadiness;
}

async function readLatestControllerActionContract(state: ControllerState): Promise<ControllerActionContractCheck | null> {
  const latest = [...state.artifacts].reverse().find(item => item.kind === "controller-action-contract");
  if (!latest) return null;
  const raw = await readJsonIfPresent(latest.path);
  const contract = (valueAtPath(raw, "controllerActionContract") ?? raw) as Partial<ControllerActionContractCheck> | null;
  if (!contract?.outPath || !Array.isArray(contract.reasons)) return null;
  return contract as ControllerActionContractCheck;
}

function renderControllerStageReviewMarkdown(review: ControllerStageReview): string {
  return [
    "# Controller Stage Review",
    "",
    `Review: ${review.reviewId}`,
    `Generated: ${review.generatedAtIso}`,
    `Reason: ${review.reason}`,
    `Run ID: ${review.runId}`,
    `Reviewed stage: ${review.reviewedStage}`,
    `Current stage: ${review.currentStage}`,
    `Controller status: ${review.controllerStatus}`,
    `Review status: ${review.status}`,
    "",
    "## Findings",
    "",
    ...(review.findings.length
      ? review.findings.flatMap(finding => [
        `### ${finding.id}`,
        "",
        `- Severity: ${finding.severity}`,
        `- Category: ${finding.category}`,
        `- Re-entry stage: ${finding.reentryStage}`,
        `- Finding: ${finding.message}`,
        ...(finding.issueCodes?.length ? [`- Issue codes: ${finding.issueCodes.join(", ")}`] : []),
        `- Repair action: ${finding.repairAction}`,
        ...(finding.evidenceRefs.length ? ["- Evidence:", ...finding.evidenceRefs.map(ref => `  - ${ref}`)] : ["- Evidence: none recorded"]),
        "",
      ])
      : ["- No critique findings."]),
    "## Accepted Evidence",
    "",
    ...(review.acceptedEvidenceRefs.length ? review.acceptedEvidenceRefs.map(ref => `- ${ref}`) : ["- None recorded."]),
    "",
    "## Next Action",
    "",
    review.nextAction,
    "",
    "## Recommended Command",
    "",
    "```bash",
    review.recommendedCommand,
    "```",
    "",
  ].join("\n");
}

async function writeControllerExecutionAgenda(state: ControllerState, reason: string): Promise<ControllerExecutionAgenda> {
  const agendaId = `controller_execution_agenda_${String((state.agendas?.length ?? 0) + 1).padStart(3, "0")}`;
  const outPath = path.join(state.rootDir, `${agendaId}.json`);
  const reportPath = path.join(state.rootDir, `${agendaId}.md`);
  const agenda = await buildControllerExecutionAgenda(state, agendaId, reason, outPath, reportPath);
  await writeJson(outPath, { schemaVersion: 1, controllerExecutionAgenda: agenda });
  await writeFile(reportPath, renderControllerExecutionAgendaMarkdown(agenda));
  state.agendas.push({
    agendaId,
    reason,
    status: agenda.status,
    currentStage: agenda.currentStage,
    itemCount: agenda.items.length,
    primaryCommand: agenda.primaryCommand,
    outPath,
    reportPath,
  });
  state.artifacts.push(await artifact("controller-execution-agenda", outPath, state.currentStage, false));
  state.artifacts.push(await artifact("controller-execution-agenda-report", reportPath, state.currentStage, false));
  return agenda;
}

async function buildControllerExecutionAgenda(
  state: ControllerState,
  agendaId: string,
  reason: string,
  outPath: string,
  reportPath: string,
): Promise<ControllerExecutionAgenda> {
  const issueLedger = await readLatestControllerIssueLedger(state);
  const stageReview = await readLatestControllerStageReview(state);
  const workPlan = state.workPlans.at(-1) ?? null;
  const nextActionPath = path.join(state.rootDir, "controller-next-action.json");
  const nextActionRaw = await readJsonIfPresent(nextActionPath);
  const nextAction = (valueAtPath(nextActionRaw, "controllerNextAction") ?? nextActionRaw) as Partial<ControllerNextActionPacket> | null;
  const reentryPlan = await readControllerReentryPlan(state);
  const nextActionArtifactPath = typeof nextAction?.outPath === "string" ? nextAction.outPath : await pathExists(nextActionPath) ? nextActionPath : null;
  const runInspectionPath = path.join(state.inputs.runDir, "run-inspection.json");
  const runInspectionRaw = await readJsonIfPresent(runInspectionPath);
  const runInspection = (valueAtPath(runInspectionRaw, "runInspection") ?? runInspectionRaw) as Partial<RunInspectionResult> | null;
  const runInspectionArtifactPath = latestArtifactPath(state, "run-inspection") ?? (await pathExists(runInspectionPath) ? runInspectionPath : null);
  const runInspectionRecommendedCommands = Array.isArray(runInspection?.recommendedCommands)
    ? runInspection.recommendedCommands.filter((command): command is string => typeof command === "string" && command.trim().length > 0)
    : [];
  const items: ControllerExecutionAgendaItem[] = [];
  const add = (
    priority: number,
    status: ControllerExecutionAgendaItem["status"],
    kind: ControllerExecutionAgendaItem["kind"],
    command: string,
    itemReason: string,
    evidenceRefs: string[],
    source: ControllerExecutionAgendaItem["source"],
    safety: ControllerExecutionAgendaItem["safety"],
    issueCodes: string[] = [],
  ) => {
    const cleanCommand = command.trim();
    if (!cleanCommand) return;
    const id = `agenda_item_${stableHash({ agendaId, priority, kind, cleanCommand, itemReason }).slice(0, 10)}`;
    if (items.some(item => item.command === cleanCommand && item.kind === kind)) return;
    items.push({
      id,
      priority,
      status,
      kind,
      command: cleanCommand,
      reason: itemReason,
      ...(issueCodes.length ? { issueCodes: uniqueText(issueCodes) } : {}),
      evidenceRefs: uniqueText(evidenceRefs),
      source,
      safety,
    });
  };

  if (nextAction?.recommendedCommand) {
    const nextActionIssueCodes = uniqueText((nextAction.issueLedger?.topIssues ?? []).map(issue => issue.issueCode).filter((item): item is string => Boolean(item)));
    add(5, nextAction.safeToAutoResume ? "executable" : "advisory", commandKind(nextAction.recommendedCommand), nextAction.recommendedCommand, "Latest terminal next-action packet recommendation.", [nextAction.outPath ?? nextActionPath].filter(Boolean) as string[], "next_action", nextAction.safeToAutoResume ? "safe" : "requires_review", nextActionIssueCodes);
  }

  runInspectionRecommendedCommands.slice(0, 5).forEach((command, index) => {
    const kind = commandKind(command);
    const safety: ControllerExecutionAgendaItem["safety"] = kind === "review"
      ? "requires_review"
      : state.status === "running" ? "safe" : "requires_review";
    add(
      6 + index,
      state.status === "running" ? "executable" : "advisory",
      kind,
      command,
      `Unified run inspection recommended command ${index + 1}.`,
      [runInspectionArtifactPath, runInspection?.outPath, path.join(state.inputs.runDir, "run-inspection.md")].filter((item): item is string => typeof item === "string" && item.length > 0),
      "run_inspection",
      safety,
      issueCodesFromText(command),
    );
  });

  if (stageReview) {
    const hasBlocker = stageReview.status === "block";
    const stageReviewIssueCodes = uniqueText(stageReview.findings.flatMap(finding => finding.issueCodes ?? issueCodesFromText(finding.message)));
    add(
      hasBlocker ? 1 : 20,
      hasBlocker ? "blocked" : state.status === "running" ? "executable" : "advisory",
      commandKind(stageReview.recommendedCommand),
      stageReview.recommendedCommand,
      hasBlocker ? "Stage review found a blocker; use its recommended command before continuing." : "Stage review did not block continuation.",
      [stageReview.outPath, ...stageReview.findings.flatMap(finding => finding.evidenceRefs)],
      "stage_review",
      hasBlocker ? "requires_review" : "safe",
      stageReviewIssueCodes,
    );
  }

  const topIssue = issueLedger?.topIssue ?? null;
  if (topIssue) {
    const command = topIssue.severity === "blocker" && state.policy.allowInputPatches
      ? `agenteer research controller-patch --state ${quotePath(state.statePath)} --patch '${JSON.stringify(examplePatchForState(state))}' --reason ${JSON.stringify(topIssue.suggestedAction)}`
      : `agenteer research controller-status --state ${quotePath(state.statePath)}`;
    add(
      topIssue.severity === "blocker" ? 2 : 30,
      topIssue.severity === "blocker" ? "blocked" : "advisory",
      commandKind(command),
      command,
      `Top issue: ${topIssue.message}`,
      [issueLedger?.outPath, ...topIssue.evidenceRefs].filter((item): item is string => Boolean(item)),
      "issue_ledger",
      topIssue.severity === "blocker" ? "requires_review" : "safe",
      topIssue.issueCode ? [topIssue.issueCode] : issueCodesFromText(topIssue.message),
    );
  }

  if (reentryPlan) {
    const preferred = primaryCommandFromCommands(reentryPlan.commands, reentryPlan.status);
    if (preferred) {
      add(
        reentryPlan.status === "patch_then_resume" ? 3 : 15,
        reentryPlan.status === "patch_then_resume" ? "blocked" : reentryPlan.status === "complete_no_reentry" ? "complete" : "executable",
        commandKind(preferred),
        preferred,
        `Re-entry plan ${reentryPlan.status}: ${reentryPlan.reason}`,
        [reentryPlan.outPath, ...reentryPlan.triggeringEvidence],
        "reentry",
        reentryPlan.status === "patch_then_resume" ? "requires_review" : reentryPlan.status === "complete_no_reentry" ? "safe" : "safe",
        issueCodesFromText(reentryPlan.reason),
      );
    }
  }

  if (state.status === "running") {
    add(10, "executable", "run", `agenteer research controller-run --state ${quotePath(state.statePath)} --max-steps 4`, `Continue bounded autonomous run from ${state.currentStage}.`, workPlan ? [workPlan.outPath] : [], "state", "safe");
    add(12, "executable", "step", `agenteer research controller-step --state ${quotePath(state.statePath)}`, `Execute one controller step from ${state.currentStage}.`, [], "state", "safe");
  } else if (state.status === "complete") {
    add(1, "complete", "status", `agenteer research controller-status --state ${quotePath(state.statePath)}`, "Study is complete by controller state; refresh status and inspect linked artifacts before external sharing.", [], "state", "safe");
  } else {
    add(40, "advisory", "status", `agenteer research controller-status --state ${quotePath(state.statePath)}`, `Controller is ${state.status}; refresh first-read status before resuming.`, [], "state", "safe");
  }

  const sorted = items.sort((a, b) => a.priority - b.priority || agendaSafetyRank(a.safety) - agendaSafetyRank(b.safety) || a.id.localeCompare(b.id));
  const executable = sorted.find(item => item.status === "executable" && item.safety === "safe") ?? sorted.find(item => item.status === "complete") ?? sorted[0];
  const status: ControllerExecutionAgenda["status"] = state.status === "complete"
    ? "complete"
    : sorted.some(item => item.status === "blocked") || state.status === "blocked"
      ? "blocked"
      : state.status === "needs_human_review" ? "needs_human_review" : "ready";
  const activeIssueCodes = uniqueText(issueLedger?.issues.filter(issue => issue.status === "active").map(issue => issue.issueCode).filter((item): item is string => Boolean(item)) ?? []);
  const activeBlockerIssueCodes = enforceableControllerBlockerCodes([
    ...(issueLedger?.issues ?? [])
      .filter(issue => issue.status === "active" && issue.severity === "blocker")
      .map(issue => issue.issueCode)
      .filter((item): item is string => Boolean(item)),
    ...sorted
      .filter(item => item.status === "blocked")
      .flatMap(item => item.issueCodes ?? []),
  ]);
  return {
    schemaVersion: 1,
    generatedAtIso: nowIso(),
    agendaId,
    reason,
    runId: state.runId,
    status,
    currentStage: state.currentStage,
    controllerStatus: state.status,
    primaryCommand: executable?.command ?? `agenteer research controller-status --state ${quotePath(state.statePath)}`,
    activeIssueIds: issueLedger?.issues.filter(issue => issue.status === "active").slice(0, 12).map(issue => issue.id) ?? [],
    activeIssueCodes,
    activeBlockerIssueCodes,
    sourceArtifacts: {
      issueLedger: issueLedger?.outPath ?? null,
      stageReview: stageReview?.outPath ?? null,
      workPlan: workPlan?.outPath ?? null,
      nextAction: nextActionArtifactPath,
      runInspection: runInspectionArtifactPath,
      reentryPlan: reentryPlan?.outPath ?? null,
    },
    items: sorted.slice(0, 12),
    outPath,
    reportPath,
  };
}

function primaryCommandFromCommands(commands: string[], status: ControllerReentryPlan["status"]): string | null {
  if (status === "patch_then_resume") return commands.find(command => command.includes("controller-patch")) ?? commands[0] ?? null;
  if (status === "repair_then_resume") return commands.find(command => command.includes("controller-run")) ?? commands.find(command => command.includes("controller-resume")) ?? commands[0] ?? null;
  if (status === "resume") return commands.find(command => command.includes("controller-resume")) ?? commands.find(command => command.includes("controller-run")) ?? commands[0] ?? null;
  return commands[0] ?? null;
}

function commandKind(command: string): ControllerExecutionAgendaItem["kind"] {
  if (command.includes(" research figure-qa") || command.includes(" research method-qa")) return "qa";
  if (command.includes(" research analysis-manifest")) return "manifest";
  if (command.includes(" research study-critic")) return "review";
  if (command.includes(" research run-inspect")) return "inspect";
  if (command.includes("controller-patch")) return "patch";
  if (command.includes("controller-resume")) return "resume";
  if (command.includes("controller-status")) return "status";
  if (command.includes("controller-run")) return "run";
  if (command.includes("controller-step")) return "step";
  if (command.includes("controller-tool")) return "tool";
  if (command.includes("figure-qa") || command.includes("method-qa")) return "qa";
  if (command.includes("analysis-manifest")) return "manifest";
  if (command.includes("study-critic")) return "review";
  if (command.includes("controller-inspect")) return "inspect";
  if (command.includes("run-inspect")) return "inspect";
  return "human_review";
}

function agendaSafetyRank(safety: ControllerExecutionAgendaItem["safety"]): number {
  if (safety === "safe") return 0;
  if (safety === "requires_review") return 1;
  return 2;
}

function renderControllerExecutionAgendaMarkdown(agenda: ControllerExecutionAgenda): string {
  return [
    "# Controller Execution Agenda",
    "",
    `Agenda: ${agenda.agendaId}`,
    `Generated: ${agenda.generatedAtIso}`,
    `Reason: ${agenda.reason}`,
    `Run ID: ${agenda.runId}`,
    `Status: ${agenda.status}`,
    `Current stage: ${agenda.currentStage}`,
    `Controller status: ${agenda.controllerStatus}`,
    `Active issue codes: ${agenda.activeIssueCodes.join(", ") || "(none)"}`,
    `Active blocker issue codes: ${agenda.activeBlockerIssueCodes.join(", ") || "(none)"}`,
    "",
    "## Primary Command",
    "",
    "```bash",
    agenda.primaryCommand,
    "```",
    "",
    "## Items",
    "",
    ...(agenda.items.length
      ? agenda.items.flatMap(item => [
        `### ${item.id}`,
        "",
        `- Priority: ${item.priority}`,
        `- Status: ${item.status}`,
        `- Kind: ${item.kind}`,
        `- Safety: ${item.safety}`,
        `- Source: ${item.source}`,
        `- Reason: ${item.reason}`,
        ...(item.issueCodes?.length ? [`- Issue codes: ${item.issueCodes.join(", ")}`] : []),
        "- Command:",
        "```bash",
        item.command,
        "```",
        ...(item.evidenceRefs.length ? ["- Evidence:", ...item.evidenceRefs.map(ref => `  - ${ref}`)] : ["- Evidence: none recorded"]),
        "",
      ])
      : ["- No agenda items recorded."]),
    "## Source Artifacts",
    "",
    `- Issue ledger: ${agenda.sourceArtifacts.issueLedger ?? "(none)"}`,
    `- Stage review: ${agenda.sourceArtifacts.stageReview ?? "(none)"}`,
    `- Work plan: ${agenda.sourceArtifacts.workPlan ?? "(none)"}`,
    `- Next action: ${agenda.sourceArtifacts.nextAction ?? "(none)"}`,
    `- Run inspection: ${agenda.sourceArtifacts.runInspection ?? "(none)"}`,
    `- Re-entry plan: ${agenda.sourceArtifacts.reentryPlan ?? "(none)"}`,
    "",
  ].join("\n");
}

async function writeControllerIssueLedger(state: ControllerState, reason: string): Promise<ControllerIssueLedger> {
  const ledgerId = `controller_issue_ledger_${String((state.issueLedgers?.length ?? 0) + 1).padStart(3, "0")}`;
  const outPath = path.join(state.rootDir, `${ledgerId}.json`);
  const reportPath = path.join(state.rootDir, `${ledgerId}.md`);
  const ledger = await buildControllerIssueLedger(state, ledgerId, reason, outPath, reportPath);
  await writeJson(outPath, { schemaVersion: 1, controllerIssueLedger: ledger });
  await writeFile(reportPath, renderControllerIssueLedgerMarkdown(ledger));
  state.issueLedgers.push({
    ledgerId,
    reason,
    status: ledger.status,
    currentStage: ledger.currentStage,
    issueCount: ledger.issues.length,
    blockerCount: ledger.counts.blockers,
    topIssues: ledger.issues
      .filter(issue => issue.status === "active")
      .sort((left, right) => issueSeverityRank(left.severity) - issueSeverityRank(right.severity))
      .slice(0, 5)
      .map(issue => ({
        id: issue.id,
        issueCode: issue.issueCode,
        severity: issue.severity,
        category: issue.category,
        message: issue.message,
        suggestedAction: issue.suggestedAction,
        reentryStage: issue.reentryStage,
        evidenceRefs: issue.evidenceRefs,
      })),
    outPath,
    reportPath,
  });
  state.artifacts.push(await artifact("controller-issue-ledger", outPath, state.currentStage, false));
  state.artifacts.push(await artifact("controller-issue-ledger-report", reportPath, state.currentStage, false));
  return ledger;
}

async function buildControllerIssueLedger(
  state: ControllerState,
  ledgerId: string,
  reason: string,
  outPath: string,
  reportPath: string,
): Promise<ControllerIssueLedger> {
  const issues: ControllerIssue[] = [];
  const add = (
    severity: ControllerIssue["severity"],
    category: ControllerIssue["category"],
    source: string,
    stage: ControllerStage,
    message: string,
    evidenceRefs: string[] = [],
    suggestedAction?: string,
    reentryStage?: ControllerStage,
    issueCode?: string,
  ) => {
    const cleanMessage = message.trim();
    if (!cleanMessage) return;
    const normalizedIssueCode = issueCode ?? issueCodeFromSourceOrMessage(source, cleanMessage);
    const id = `issue_${stableHash({ severity, category, source, stage, message: cleanMessage, issueCode: normalizedIssueCode }).slice(0, 12)}`;
    if (issues.some(issue => issue.id === id)) return;
    const targetStage = reentryStage ?? issueReentryStage(category, stage);
    issues.push({
      id,
      ...(normalizedIssueCode ? { issueCode: normalizedIssueCode } : {}),
      severity,
      category,
      status: "active",
      source,
      stage,
      message: cleanMessage,
      evidenceRefs: uniqueText(evidenceRefs),
      suggestedAction: suggestedAction ?? suggestedActionForIssue(category, targetStage),
      reentryStage: targetStage,
    });
  };

  for (const gateRecord of state.gates.filter(item => item.status !== "pass")) {
    const severity: ControllerIssue["severity"] = gateRecord.status === "block" ? "blocker" : "minor";
    for (const message of gateRecord.reasons.length ? gateRecord.reasons : [gateRecord.label]) {
      add(severity, categoryForGate(gateRecord), `gate:${gateRecord.stage}`, gateRecord.stage, message, gateRecord.evidenceRefs, undefined, gateRecord.stage);
    }
  }

  const feasibility = await loadControllerFeasibilitySummary(state);
  if (feasibility.issues.length) {
    for (const issue of feasibility.issues.filter(item => item.severity !== "note" && item.source !== "internal_review")) {
      add(
        issue.severity === "blocker" ? "blocker" : "minor",
        feasibilityIssueCategory(issue),
        `feasibility:${issue.code}`,
        "dataset_feasibility",
        `${issue.code}: ${issue.message}`,
        uniqueText([feasibility.path, ...issue.evidenceRefs].filter((item): item is string => Boolean(item))),
        feasibilityIssueSuggestedAction(issue, feasibility.status),
        "dataset_feasibility",
        issue.code,
      );
    }
  } else if (feasibility.status === "block") {
    for (const message of feasibility.blockers) add("blocker", "data", "feasibility", "dataset_feasibility", message, feasibility.path ? [feasibility.path] : [], "Patch study variables, loosen infeasible design only with review, or start a new run with appropriate data.", "dataset_feasibility");
  } else if (feasibility.status === "warning") {
    for (const message of feasibility.warnings) add("minor", "data", "feasibility", "dataset_feasibility", message, feasibility.path ? [feasibility.path] : [], "Carry this warning into methods/report limitations or patch the study before execution.", "dataset_feasibility");
  }
  const datasetSemanticAudit = await loadControllerDatasetSemanticAuditSummary(state);
  for (const issue of datasetSemanticAudit.topIssues.filter(item => item.selected && item.severity !== "note")) {
    add(
      issue.severity === "blocker" ? "blocker" : "minor",
      "data",
      `dataset-semantic-audit:${issue.code}`,
      "dataset_feasibility",
      `${issue.code}: ${issue.message}`,
      uniqueText([datasetSemanticAudit.path, datasetSemanticAudit.reportPath].filter((item): item is string => Boolean(item))),
      issue.severity === "blocker"
        ? "Patch or remove the selected study role, then rerun dataset_feasibility before execution."
        : "Review the selected role's unit/coding, document the warning, or patch the selected role before execution.",
      "dataset_feasibility",
    );
  }

  for (const action of state.actions) {
    if (action.status === "failed") add("blocker", categoryForAction(action.action), `action:${action.action}`, actionStageForContract(state, action), action.error ?? action.outputSummary, action.artifacts.map(item => item.path), undefined, actionStageForContract(state, action));
  }
  for (const tool of state.toolActions.filter(item => item.status !== "succeeded")) {
    add(tool.status === "rejected" ? "major" : "minor", "execution", `tool:${tool.request.toolId}`, state.currentStage, tool.validationReasons.join("; ") || tool.stderrPreview || `${tool.request.toolId} did not succeed.`, [tool.outPath, tool.stdoutPath, tool.stderrPath].filter((item): item is string => Boolean(item)), "Review the tool output and either choose a different bounded tool or continue without this evidence.", state.currentStage);
  }
  for (const patch of state.patches.filter(item => item.status === "rejected")) {
    add("major", "state", `patch:${patch.patchId}`, state.currentStage, patch.validationReasons.join("; ") || "Input patch was rejected.", [patch.outPath], "Apply a valid controller-patch or start a new controller run if environment paths must change.", state.currentStage);
  }
  for (const artifactRef of state.artifacts.filter(item => item.requiredForPromotion && !item.sha256)) {
    add("blocker", "artifact", `artifact:${artifactRef.kind}`, artifactRef.stage, `Required artifact ${artifactRef.kind} is missing or unhashable.`, [artifactRef.path], "Regenerate the owning stage or inspect artifact paths before promotion.", artifactRef.stage);
  }

  for (const readiness of await recentActionReadinessRecords(state)) {
    for (const check of readiness.checks.filter(item => item.status !== "pass")) {
      add(
        check.status === "fail" ? "blocker" : "minor",
        categoryForAction(readiness.action),
        `readiness:${readiness.action}:${check.id}${check.issueCodes?.length ? `:${check.issueCodes.join(",")}` : ""}`,
        readiness.stage,
        check.issueCodes?.length ? `${check.issueCodes.join(", ")}: ${check.message}` : check.message,
        [readiness.outPath, ...check.evidenceRefs],
        check.status === "fail" ? "Resolve readiness failure before executing this action." : "Carry readiness warning forward as risk evidence.",
        readiness.stage,
        check.issueCodes?.[0],
      );
    }
  }

  const latestStageReview = await readLatestControllerStageReview(state);
  if (latestStageReview) {
    for (const finding of latestStageReview.findings.filter(item => item.severity !== "info")) {
      add(
        finding.severity,
        finding.category,
        `stage-review:${latestStageReview.reviewId}:${finding.id}${finding.issueCodes?.length ? `:${finding.issueCodes.join(",")}` : ""}`,
        finding.reentryStage,
        finding.issueCodes?.length ? `${finding.issueCodes.join(", ")}: ${finding.message}` : finding.message,
        [latestStageReview.outPath, ...finding.evidenceRefs],
        finding.repairAction,
        finding.reentryStage,
        finding.issueCodes?.[0],
      );
    }
  }

  const lastEvaluation = state.selfEvaluations.at(-1);
  if (lastEvaluation) {
    for (const check of lastEvaluation.checks.filter(item => item.status !== "pass")) {
      add(
        check.severity === "blocker" ? "blocker" : check.severity === "major" ? "major" : "minor",
        "review",
        `self-evaluation:${check.id}${check.issueCodes?.length ? `:${check.issueCodes.join(",")}` : ""}`,
        state.currentStage,
        check.issueCodes?.length ? `${check.issueCodes.join(", ")}: ${check.message}` : check.message,
        [lastEvaluation.outPath, ...check.evidenceRefs],
        "Resolve self-evaluation finding before external sharing or promotion.",
        state.currentStage,
        check.issueCodes?.[0],
      );
    }
  }

  if (state.stopReason) add(state.status === "blocked" ? "blocker" : "major", state.status === "blocked" ? "state" : "unknown", "stop-reason", state.currentStage, state.stopReason, [], nextRecommendedAction(state), state.currentStage);

  const sorted = issues.sort((a, b) =>
    issueSeverityRank(a.severity) - issueSeverityRank(b.severity)
    || issueSourceRank(a) - issueSourceRank(b)
    || a.category.localeCompare(b.category)
    || a.id.localeCompare(b.id)
  );
  const counts = {
    blockers: sorted.filter(item => item.severity === "blocker").length,
    major: sorted.filter(item => item.severity === "major").length,
    minor: sorted.filter(item => item.severity === "minor").length,
    info: sorted.filter(item => item.severity === "info").length,
  };
  const status: ControllerIssueLedger["status"] = counts.blockers ? "blocked" : counts.major || counts.minor ? "warnings" : "clear";
  return {
    schemaVersion: 1,
    generatedAtIso: nowIso(),
    ledgerId,
    reason,
    runId: state.runId,
    status,
    currentStage: state.currentStage,
    controllerStatus: state.status,
    counts,
    issues: sorted.slice(0, 50),
    topIssue: sorted[0] ?? null,
    nextRecommendedAction: sorted[0]?.suggestedAction ?? state.nextRecommendedAction,
    outPath,
    reportPath,
  };
}

function issueCodeFromSourceOrMessage(source: string, message: string): string | undefined {
  const sourceMatch = source.match(/:([A-Z][A-Z0-9_]{2,})$/);
  if (sourceMatch?.[1]) return sourceMatch[1];
  const messageMatch = message.match(/^\s*([A-Z][A-Z0-9_]{2,})\s*:/);
  return messageMatch?.[1];
}

function feasibilityIssueCategory(issue: { code: string; source: string; domainId?: string }): ControllerIssue["category"] {
  const code = issue.code.toUpperCase();
  const domain = issue.domainId ?? "";
  if (/METHOD|PARAMETER|MODEL|EVENTS_PER|SEPARATION|REGRESSION|SURVIVAL|TREATMENT_ARM|OUTCOME_BY_ARM/.test(code)) return "methods";
  if (/PHENOTYPE|CODE/.test(code) || domain === "phenotype_confidence") return "methods";
  if (/COST|ACCESS/.test(code) || domain === "cost_and_access") return "cost";
  if (/ARTIFACT/.test(code) || domain === "artifact_readiness") return "artifact";
  if (/REVIEWER|CLAIM|RISK/.test(code) || domain === "expected_reviewer_risk") return "review";
  if (/SURVEY|POLICY/.test(code)) return "policy";
  return "data";
}

function feasibilityIssueSuggestedAction(issue: { code: string; suggestedFixes: string[] }, status: ControllerFeasibilityVerdict["status"] | "unknown"): string {
  if (issue.code.includes("COMPLETE_CASE_ATTRITION")) return "Revise high-missingness variables, add missingness/imputation sensitivity, or rerun dataset_feasibility after redesign.";
  if (issue.suggestedFixes.length) return issue.suggestedFixes[0] ?? "Review feasibility issue and rerun dataset_feasibility.";
  if (issue.code.includes("TEMPORAL_WINDOW")) return "Correct the requested study window or use data covering the requested period, then rerun dataset_feasibility.";
  if (issue.code.includes("PHENOTYPE")) return "Run phenotype/code review and rerun dataset_feasibility before execution.";
  if (issue.code.includes("METHOD")) return "Revise method inputs or rerun method selection after feasibility repair.";
  if (status === "block") return "Patch study variables, cohort, or dataset evidence before execution.";
  return "Carry this warning into methods/report limitations or patch the study before execution.";
}

async function recentActionReadinessRecords(state: ControllerState): Promise<ControllerActionReadiness[]> {
  const artifacts = state.artifacts.filter(item => item.kind === "controller-action-readiness" && item.sha256).slice(-8);
  const records: ControllerActionReadiness[] = [];
  for (const artifactRef of artifacts) {
    const raw = await readJsonIfPresent(artifactRef.path);
    const readiness = (valueAtPath(raw, "controllerActionReadiness") ?? raw) as Partial<ControllerActionReadiness> | null;
    if (readiness?.readinessId && readiness.action && readiness.stage && Array.isArray(readiness.checks)) records.push(readiness as ControllerActionReadiness);
  }
  return records;
}

function issueSeverityRank(severity: ControllerIssue["severity"]): number {
  return severity === "blocker" ? 0 : severity === "major" ? 1 : severity === "minor" ? 2 : 3;
}

function issueSourceRank(issue: Pick<ControllerIssue, "source" | "issueCode">): number {
  if (issue.source.startsWith("dataset-semantic-audit:")) return 0;
  if (issue.source.startsWith("feasibility:") && issue.issueCode) return 1;
  if (issue.source.startsWith("gate:")) return 2;
  if (issue.source.startsWith("readiness:")) return 3;
  if (issue.source.startsWith("stage-review:")) return 4;
  return 5;
}

function issueReentryStage(category: ControllerIssue["category"], fallback: ControllerStage): ControllerStage {
  if (category === "context") return "context";
  if (category === "data") return "dataset_feasibility";
  if (category === "methods") return "method_selection";
  if (category === "execution") return "execution";
  if (category === "review") return "external_review";
  if (category === "artifact") return fallback;
  if (category === "policy" || category === "cost") return "human_review";
  return fallback;
}

function suggestedActionForIssue(category: ControllerIssue["category"], stage: ControllerStage): string {
  if (category === "data") return "Patch the research variables/cohort or provide a dataset that satisfies feasibility checks, then resume at dataset_feasibility.";
  if (category === "methods") return "Re-enter method_selection with corrected method assumptions or patch the AnalysisSpec inputs.";
  if (category === "execution") return "Inspect execution artifacts, repair executable failures, then rerun execution.";
  if (category === "review") return "Review accepted findings, apply bounded repairs or patch inputs, then rerun review/inspection.";
  if (category === "artifact") return `Regenerate or inspect artifacts for ${stage} before promotion.`;
  if (category === "context") return "Refresh context or disable required context only after human review.";
  if (category === "policy" || category === "cost") return "Adjust controller policy/budget explicitly, or stop for human review.";
  return `Inspect issue evidence and resume at ${stage}.`;
}

function renderControllerIssueLedgerMarkdown(ledger: ControllerIssueLedger): string {
  return [
    "# Controller Issue Ledger",
    "",
    `Ledger: ${ledger.ledgerId}`,
    `Run ID: ${ledger.runId}`,
    `Generated: ${ledger.generatedAtIso}`,
    `Reason: ${ledger.reason}`,
    `Status: ${ledger.status}`,
    `Controller status: ${ledger.controllerStatus}`,
    `Current stage: ${ledger.currentStage}`,
    "",
    "## Counts",
    "",
    `- Blockers: ${ledger.counts.blockers}`,
    `- Major: ${ledger.counts.major}`,
    `- Minor: ${ledger.counts.minor}`,
    `- Info: ${ledger.counts.info}`,
    "",
    "## Top Issue",
    "",
    ledger.topIssue ? `- ${ledger.topIssue.severity.toUpperCase()} [${ledger.topIssue.category}] ${ledger.topIssue.message}` : "- None",
    "",
    "## Issues",
    "",
    ...(ledger.issues.length ? ledger.issues.flatMap(issue => [
      `### ${issue.id}`,
      "",
      `- Severity: ${issue.severity}`,
      `- Issue code: ${issue.issueCode ?? "(none)"}`,
      `- Category: ${issue.category}`,
      `- Source: ${issue.source}`,
      `- Stage: ${issue.stage}`,
      `- Re-entry stage: ${issue.reentryStage}`,
      `- Message: ${issue.message}`,
      `- Suggested action: ${issue.suggestedAction}`,
      ...(issue.evidenceRefs.length ? ["- Evidence:", ...issue.evidenceRefs.map(ref => `  - ${ref}`)] : ["- Evidence: none recorded"]),
      "",
    ]) : ["- No active issues recorded."]),
    "## Next Recommended Action",
    "",
    ledger.nextRecommendedAction,
    "",
  ].join("\n");
}

async function writeControllerNextActionPacket(
  state: ControllerState,
  handoff: ControllerTerminalHandoff,
  reentryPlan: ControllerReentryPlan,
): Promise<ControllerNextActionPacket> {
  const outPath = path.join(state.rootDir, "controller-next-action.json");
  const reportPath = path.join(state.rootDir, "controller-next-action.md");
  const latestIssueLedger = await readLatestControllerIssueLedger(state);
  const inspectionRaw = await readJsonIfPresent(path.join(state.inputs.runDir, "run-inspection.json"));
  const inspection = (valueAtPath(inspectionRaw, "runInspection") ?? inspectionRaw) as Partial<RunInspectionResult> | null;
  const packet = buildControllerNextActionPacket(state, handoff, reentryPlan, latestIssueLedger, controllerInspectionRecommendedCommands(inspection), outPath, reportPath);
  await writeJson(outPath, { schemaVersion: 1, controllerNextAction: packet });
  await writeFile(reportPath, renderControllerNextActionMarkdown(packet));
  return packet;
}

async function readLatestControllerIssueLedger(state: ControllerState): Promise<ControllerIssueLedger | null> {
  const latest = state.issueLedgers.at(-1);
  if (!latest) return null;
  const raw = await readJsonIfPresent(latest.outPath);
  const ledger = (valueAtPath(raw, "controllerIssueLedger") ?? raw) as Partial<ControllerIssueLedger> | null;
  if (!ledger?.ledgerId || !Array.isArray(ledger.issues)) return null;
  return ledger as ControllerIssueLedger;
}

function buildControllerNextActionPacket(
  state: ControllerState,
  handoff: ControllerTerminalHandoff,
  reentryPlan: ControllerReentryPlan,
  issueLedger: ControllerIssueLedger | null,
  inspectionRecommendedCommands: string[],
  outPath: string,
  reportPath: string,
): ControllerNextActionPacket {
  const topIssues = (issueLedger?.issues ?? [])
    .filter(issue => issue.status === "active")
    .slice(0, 8)
    .map(issue => ({
      id: issue.id,
      issueCode: issue.issueCode,
      severity: issue.severity,
      category: issue.category,
      message: issue.message,
      suggestedAction: issue.suggestedAction,
      reentryStage: issue.reentryStage,
      evidenceRefs: issue.evidenceRefs,
    }));
  const recommendedCommand = primaryNextActionCommand(state, handoff, reentryPlan);
  const alternativeCommands = uniqueText([
    ...inspectionRecommendedCommands,
    ...reentryPlan.commands,
    ...handoff.suggestedCommands,
  ]).filter(command => command !== recommendedCommand).slice(0, 10);
  const safeToAutoResume = state.status === "running"
    || reentryPlan.status === "resume" && !topIssues.some(issue => issue.severity === "blocker") && reentryPlan.recommendedStage !== "human_review";
  const mustReviewArtifactKinds = expandControllerArtifactKindsWithReports([
    "controller-dataset-semantic-audit",
    "controller-stage-review",
    "controller-issue-ledger",
    "controller-reentry-plan",
    "controller-terminal-handoff",
    "run-inspection",
    "method-qa",
    "review-adjudication",
    "controller-repair-verification",
  ]);
  const mustReviewArtifacts = uniqueArtifactsByPath([
    ...handoff.missingRequiredArtifacts,
    ...state.artifacts.filter(item => item.requiredForPromotion && !item.sha256),
    ...state.artifacts.filter(item => mustReviewArtifactKinds.includes(item.kind)).slice(-32),
  ]);
  return {
    schemaVersion: 1,
    generatedAtIso: nowIso(),
    runId: state.runId,
    status: state.status,
    stage: state.currentStage,
    reason: state.stopReason ?? handoff.summary,
    recommendedCommand,
    alternativeCommands,
    safeToAutoResume,
    reentryPlan: {
      status: reentryPlan.status,
      recommendedStage: reentryPlan.recommendedStage,
      confidence: reentryPlan.confidence,
      reason: reentryPlan.reason,
      autoRepairEligible: reentryPlan.autoRepairEligible,
      repairPlugin: reentryPlan.repairPlugin,
      commands: reentryPlan.commands,
      safePatch: reentryPlan.safePatch,
    },
    issueLedger: {
      status: issueLedger?.status ?? null,
      path: issueLedger?.outPath ?? null,
      reportPath: issueLedger?.reportPath ?? null,
      topIssues,
    },
    mustReviewArtifacts,
    suggestedPatch: reentryPlan.safePatch,
    safePatchFields: Object.keys(controllerInputPatchSchema.shape),
    createdFromArtifacts: {
      terminalHandoff: handoff.jsonPath,
      terminalHandoffReport: handoff.reportPath,
      reentryPlan: reentryPlan.outPath,
      reentryPlanReport: reentryPlan.reportPath,
      issueLedger: issueLedger?.outPath ?? null,
      issueLedgerReport: issueLedger?.reportPath ?? null,
      state: state.statePath,
    },
    outPath,
    reportPath,
  };
}

function primaryNextActionCommand(
  state: ControllerState,
  handoff: ControllerTerminalHandoff,
  reentryPlan: ControllerReentryPlan,
): string {
  const commands = uniqueText([...reentryPlan.commands, ...handoff.suggestedCommands]);
  const firstMatching = (needles: string[]): string | undefined =>
    commands.find(command => needles.some(needle => command.includes(needle)));
  const fallback = state.status === "complete"
    ? `agenteer research controller-status --state ${quotePath(state.statePath)}`
    : `agenteer research controller-run --state ${quotePath(state.statePath)} --max-steps 4`;

  if (reentryPlan.status === "patch_then_resume") {
    return firstMatching(["controller-patch", "controller-resume", "controller-run"]) ?? commands[0] ?? fallback;
  }
  if (reentryPlan.status === "repair_then_resume") {
    return firstMatching(["controller-run", "controller-resume", "controller-tool"]) ?? commands[0] ?? fallback;
  }
  if (reentryPlan.status === "resume") {
    return firstMatching(["controller-resume", "controller-run"]) ?? commands[0] ?? fallback;
  }
  if (reentryPlan.status === "new_run_required") {
    return firstMatching(["controller-init", "controller-run"]) ?? commands[0] ?? fallback;
  }
  return firstMatching(["controller-status", "controller-inspect"]) ?? commands[0] ?? fallback;
}

function uniqueArtifactsByPath(items: ControllerArtifact[]): ControllerArtifact[] {
  const seen = new Set<string>();
  const result: ControllerArtifact[] = [];
  for (const item of items) {
    const key = path.resolve(item.path);
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(item);
  }
  return result;
}

function renderControllerNextActionMarkdown(packet: ControllerNextActionPacket): string {
  return [
    "# Controller Next Action Packet",
    "",
    `Generated: ${packet.generatedAtIso}`,
    `Run ID: ${packet.runId}`,
    `Status: ${packet.status}`,
    `Stage: ${packet.stage}`,
    `Safe to auto-resume: ${packet.safeToAutoResume}`,
    "",
    "## Reason",
    "",
    packet.reason,
    "",
    "## Recommended Command",
    "",
    "```bash",
    packet.recommendedCommand,
    "```",
    "",
    "## Alternative Commands",
    "",
    ...(packet.alternativeCommands.length
      ? packet.alternativeCommands.flatMap(command => ["```bash", command, "```", ""])
      : ["None recorded.", ""]),
    "",
    "## Re-Entry",
    "",
    `- Status: ${packet.reentryPlan.status}`,
    `- Recommended stage: ${packet.reentryPlan.recommendedStage}`,
    `- Confidence: ${packet.reentryPlan.confidence}`,
    `- Reason: ${packet.reentryPlan.reason}`,
    `- Auto-repair eligible: ${packet.reentryPlan.autoRepairEligible}`,
    `- Repair plugin: ${packet.reentryPlan.repairPlugin ?? "(none)"}`,
    "",
    "## Active Issues",
    "",
    `- Issue ledger record: ${packet.issueLedger.path ?? "(none)"}`,
    `- Issue ledger report: ${packet.issueLedger.reportPath ?? "(none)"}`,
    ...(packet.issueLedger.topIssues.length ? packet.issueLedger.topIssues.map(issue => `- ${issue.severity.toUpperCase()} [${issue.category}${issue.issueCode ? `:${issue.issueCode}` : ""}] ${issue.message} Re-enter: ${issue.reentryStage}.`) : ["- None recorded."]),
    "",
    "## Must Review Artifacts",
    "",
    ...(packet.mustReviewArtifacts.length ? packet.mustReviewArtifacts.map(item => `- ${item.kind}: ${item.path}`) : ["- None recorded."]),
    "",
    "## Suggested Patch",
    "",
    packet.suggestedPatch ? `\`\`\`json\n${JSON.stringify(packet.suggestedPatch, null, 2)}\n\`\`\`` : "- None",
    "",
    "## Source Artifacts",
    "",
    `- Terminal handoff: ${packet.createdFromArtifacts.terminalHandoff}`,
    `- Terminal handoff report: ${packet.createdFromArtifacts.terminalHandoffReport}`,
    `- Re-entry plan: ${packet.createdFromArtifacts.reentryPlan}`,
    `- Re-entry plan report: ${packet.createdFromArtifacts.reentryPlanReport}`,
    `- Issue ledger: ${packet.createdFromArtifacts.issueLedger ?? "(none)"}`,
    `- Issue ledger report: ${packet.createdFromArtifacts.issueLedgerReport ?? "(none)"}`,
    `- State: ${packet.createdFromArtifacts.state}`,
    "",
  ].join("\n");
}

async function writeControllerStateSnapshot(state: ControllerState, reason: string): Promise<ControllerStateSnapshot> {
  const snapshotId = `controller_state_snapshot_${String(state.artifacts.filter(item => item.kind === "controller-state-snapshot").length + 1).padStart(3, "0")}`;
  const outPath = path.join(state.rootDir, `${snapshotId}.json`);
  const reportPath = path.join(state.rootDir, `${snapshotId}.md`);
  const snapshot: ControllerStateSnapshot = {
    schemaVersion: 1,
    generatedAtIso: nowIso(),
    snapshotId,
    reason,
    runId: state.runId,
    statePath: state.statePath,
    stage: state.currentStage,
    status: state.status,
    counts: {
      actions: state.actions.length,
      decisions: state.decisions.length,
      gates: state.gates.length,
      tools: state.toolActions.length,
      patches: state.patches.length,
      policyUpdates: state.policyUpdates.length,
      artifacts: state.artifacts.length,
      repairs: state.repairs.length,
      selfEvaluations: state.selfEvaluations.length,
    },
    stateHash: stableHash(state),
    outPath,
    reportPath,
    controllerState: state,
  };
  await writeJson(outPath, { schemaVersion: 1, controllerStateSnapshot: snapshot });
  await writeFile(reportPath, renderControllerStateSnapshotMarkdown(snapshot));
  state.artifacts.push(await artifact("controller-state-snapshot", outPath, state.currentStage, false));
  state.artifacts.push(await artifact("controller-state-snapshot-report", reportPath, state.currentStage, false));
  return snapshot;
}

function renderControllerStateSnapshotMarkdown(snapshot: ControllerStateSnapshot): string {
  return [
    "# Controller State Snapshot",
    "",
    `Snapshot: ${snapshot.snapshotId}`,
    `Run ID: ${snapshot.runId}`,
    `Generated: ${snapshot.generatedAtIso}`,
    `Reason: ${snapshot.reason}`,
    `Stage: ${snapshot.stage}`,
    `Status: ${snapshot.status}`,
    `State path: ${snapshot.statePath}`,
    `State hash: ${snapshot.stateHash}`,
    "",
    "## Counts",
    "",
    `- Actions: ${snapshot.counts.actions}`,
    `- Decisions: ${snapshot.counts.decisions}`,
    `- Gates: ${snapshot.counts.gates}`,
    `- Tools: ${snapshot.counts.tools}`,
    `- Patches: ${snapshot.counts.patches}`,
    `- Policy updates: ${snapshot.counts.policyUpdates}`,
    `- Artifacts: ${snapshot.counts.artifacts}`,
    `- Repairs: ${snapshot.counts.repairs}`,
    `- Self evaluations: ${snapshot.counts.selfEvaluations}`,
    "",
    "## Recovery Use",
    "",
    "Use the JSON snapshot as a point-in-time copy of controller state before the recorded transition. Do not treat it as a promoted research artifact; it is an audit and recovery artifact for unattended controller runs.",
    "",
  ].join("\n");
}

async function writeControllerRunInvocation(
  state: ControllerState,
  beforeWithStartedAt: ControllerRunInvocation["before"] & { startedAtIso: string },
  stepCount: number,
  maxSteps: number,
): Promise<ControllerRunInvocation> {
  const before: ControllerRunInvocation["before"] = {
    stage: beforeWithStartedAt.stage,
    status: beforeWithStartedAt.status,
    actions: beforeWithStartedAt.actions,
    decisions: beforeWithStartedAt.decisions,
    gates: beforeWithStartedAt.gates,
    tools: beforeWithStartedAt.tools,
    patches: beforeWithStartedAt.patches,
    policyUpdates: beforeWithStartedAt.policyUpdates,
    artifacts: beforeWithStartedAt.artifacts,
    costEstimateUsd: beforeWithStartedAt.costEstimateUsd,
  };
  const after: ControllerRunInvocation["after"] = {
    stage: state.currentStage,
    status: state.status,
    actions: state.actions.length,
    decisions: state.decisions.length,
    gates: state.gates.length,
    tools: state.toolActions.length,
    patches: state.patches.length,
    policyUpdates: state.policyUpdates.length,
    artifacts: state.artifacts.length,
    costEstimateUsd: state.costEstimateUsd,
  };
  const invocationId = `controller_run_invocation_${String(state.artifacts.filter(item => item.kind === "controller-run-invocation").length + 1).padStart(3, "0")}`;
  const outPath = path.join(state.rootDir, `${invocationId}.json`);
  const reportPath = path.join(state.rootDir, `${invocationId}.md`);
  const invocation: ControllerRunInvocation = {
    schemaVersion: 1,
    generatedAtIso: nowIso(),
    invocationId,
    startedAtIso: beforeWithStartedAt.startedAtIso,
    finishedAtIso: nowIso(),
    runId: state.runId,
    statePath: state.statePath,
    maxSteps,
    stepCount,
    terminal: isTerminal(state.currentStage) || state.status !== "running",
    before,
    after,
    actionDelta: state.actions.slice(before.actions).map(action => ({
      decisionId: action.decisionId,
      action: action.action,
      status: action.status,
      nextStage: action.nextStage,
    })),
    policyUpdateDelta: state.policyUpdates.slice(before.policyUpdates).map(update => update.updateId),
    artifactDelta: after.artifacts - before.artifacts,
    costDeltaUsd: round(after.costEstimateUsd - before.costEstimateUsd, 6),
    stopReason: state.stopReason,
    nextRecommendedAction: state.nextRecommendedAction,
    outPath,
    reportPath,
  };
  await writeJson(outPath, { schemaVersion: 1, controllerRunInvocation: invocation });
  await writeFile(reportPath, renderControllerRunInvocationMarkdown(invocation));
  state.artifacts.push(await artifact("controller-run-invocation", outPath, state.currentStage, false));
  state.artifacts.push(await artifact("controller-run-invocation-report", reportPath, state.currentStage, false));
  await persistState(state);
  return invocation;
}

function renderControllerRunInvocationMarkdown(invocation: ControllerRunInvocation): string {
  return [
    "# Controller Run Invocation",
    "",
    `Invocation: ${invocation.invocationId}`,
    `Run ID: ${invocation.runId}`,
    `Started: ${invocation.startedAtIso}`,
    `Finished: ${invocation.finishedAtIso}`,
    `State path: ${invocation.statePath}`,
    `Max steps: ${invocation.maxSteps}`,
    `Executed steps: ${invocation.stepCount}`,
    `Terminal after run: ${invocation.terminal}`,
    "",
    "## Before",
    "",
    `- Stage: ${invocation.before.stage}`,
    `- Status: ${invocation.before.status}`,
    `- Actions: ${invocation.before.actions}`,
    `- Artifacts: ${invocation.before.artifacts}`,
    `- Estimated cost: $${invocation.before.costEstimateUsd.toFixed(6)}`,
    "",
    "## After",
    "",
    `- Stage: ${invocation.after.stage}`,
    `- Status: ${invocation.after.status}`,
    `- Actions: ${invocation.after.actions}`,
    `- Artifacts: ${invocation.after.artifacts}`,
    `- Estimated cost: $${invocation.after.costEstimateUsd.toFixed(6)}`,
    "",
    "## Deltas",
    "",
    `- Artifact delta: ${invocation.artifactDelta}`,
    `- Cost delta: $${invocation.costDeltaUsd.toFixed(6)}`,
    `- Policy updates: ${invocation.policyUpdateDelta.join(", ") || "(none)"}`,
    "",
    "## Actions Executed",
    "",
    ...(invocation.actionDelta.length
      ? invocation.actionDelta.map(action => `- ${action.action}/${action.status} -> ${action.nextStage} (${action.decisionId})`)
      : ["- None"]),
    "",
    "## Stop And Next Action",
    "",
    `- Stop reason: ${invocation.stopReason ?? "(none)"}`,
    `- Next: ${invocation.nextRecommendedAction}`,
    "",
  ].join("\n");
}

async function checkpointAndPersist(state: ControllerState, before: ControllerStepCheckpoint["before"], reason: string): Promise<void> {
  await writeControllerStageReview(state, reason);
  await writeControllerIssueLedger(state, reason);
  await writeControllerWorkPlan(state, reason);
  await writeControllerExecutionAgenda(state, reason);
  const checkpoint = buildControllerCheckpoint(state, before, reason);
  await writeJson(checkpoint.outPath, { schemaVersion: 1, controllerStepCheckpoint: checkpoint });
  state.artifacts.push(await artifact("controller-step-checkpoint", checkpoint.outPath, state.currentStage, false));
  await persistState(state);
}

function buildControllerCheckpoint(state: ControllerState, before: ControllerStepCheckpoint["before"], reason: string): ControllerStepCheckpoint {
  const after: ControllerStepCheckpoint["after"] = {
    stage: state.currentStage,
    status: state.status,
    actions: state.actions.length,
    decisions: state.decisions.length,
    gates: state.gates.length,
    tools: state.toolActions.length,
    patches: state.patches.length,
    artifacts: state.artifacts.length,
    costEstimateUsd: state.costEstimateUsd,
  };
  const checkpointId = `controller_checkpoint_${String(state.gates.length).padStart(3, "0")}`;
  return {
    schemaVersion: 1,
    generatedAtIso: nowIso(),
    runId: state.runId,
    checkpointId,
    reason,
    before,
    after,
    lastGate: state.gates.at(-1) ?? null,
    lastDecision: state.decisions.at(-1) ?? null,
    lastAction: state.actions.at(-1) ?? null,
    lastToolAction: state.toolActions.at(-1) ?? null,
    artifactDelta: after.artifacts - before.artifacts,
    costDeltaUsd: round(after.costEstimateUsd - before.costEstimateUsd, 6),
    stopReason: state.stopReason,
    nextRecommendedAction: state.nextRecommendedAction,
    statePath: state.statePath,
    outPath: path.join(state.rootDir, `${checkpointId}.json`),
  };
}

async function persistState(state: ControllerState): Promise<void> {
  state.updatedAtIso = nowIso();
  await mkdir(path.dirname(state.statePath), { recursive: true });
  if (state.status === "needs_human_review" || state.status === "blocked" || state.status === "complete") {
    await ensureTerminalHandoff(state);
  }
  await writeJson(state.statePath, { schemaVersion: 1, controllerState: state });
}

async function ensureTerminalHandoff(state: ControllerState): Promise<void> {
  const handoffPath = path.join(state.rootDir, "controller-terminal-handoff.json");
  const reportPath = path.join(state.rootDir, "controller-terminal-handoff.md");
  const reentryPlan = await writeControllerReentryPlan(state);
  const packet = await buildTerminalHandoff(state, handoffPath, reportPath, reentryPlan);
  await writeJson(handoffPath, { schemaVersion: 1, controllerTerminalHandoff: packet });
  await writeFile(reportPath, renderTerminalHandoffMarkdown(packet));
  const nextActionPacket = await writeControllerNextActionPacket(state, packet, reentryPlan);
  if (!state.artifacts.some(item => item.path === path.resolve(reentryPlan.outPath))) {
    state.artifacts.push(await artifact("controller-reentry-plan", reentryPlan.outPath, state.currentStage, state.status !== "blocked"));
  }
  if (!state.artifacts.some(item => item.path === path.resolve(reentryPlan.reportPath))) {
    state.artifacts.push(await artifact("controller-reentry-plan-report", reentryPlan.reportPath, state.currentStage, false));
  }
  if (!state.artifacts.some(item => item.path === path.resolve(handoffPath))) {
    state.artifacts.push(await artifact("controller-terminal-handoff", handoffPath, state.currentStage, state.status === "complete"));
  }
  if (!state.artifacts.some(item => item.path === path.resolve(reportPath))) {
    state.artifacts.push(await artifact("controller-terminal-handoff-report", reportPath, state.currentStage, false));
  }
  if (!state.artifacts.some(item => item.path === path.resolve(nextActionPacket.outPath))) {
    state.artifacts.push(await artifact("controller-next-action", nextActionPacket.outPath, state.currentStage, state.status !== "complete"));
  }
  if (!state.artifacts.some(item => item.path === path.resolve(nextActionPacket.reportPath))) {
    state.artifacts.push(await artifact("controller-next-action-report", nextActionPacket.reportPath, state.currentStage, false));
  }
  const goldenPacketPath = path.join(state.rootDir, "controller-golden-packet.json");
  if (!await pathExists(goldenPacketPath)) {
    const goldenPacket = await writeControllerTerminalGoldenPacket(state, packet);
    if (!state.artifacts.some(item => item.path === path.resolve(goldenPacket.outPath))) {
      state.artifacts.push(await artifact("controller-golden-packet", goldenPacket.outPath, state.currentStage, state.status === "complete"));
    }
    if (!state.artifacts.some(item => item.path === path.resolve(goldenPacket.reportPath))) {
      state.artifacts.push(await artifact("controller-golden-packet-report", goldenPacket.reportPath, state.currentStage, false));
    }
  }
  await writeControllerExecutionAgenda(state, "terminal_handoff");
  if (!state.artifacts.some(item => item.kind === "controller-model-runner-packet")) {
    await writeControllerModelRunnerPacketArtifacts(state, "terminal_model_runner_packet");
  }
}

async function writeControllerReentryPlan(state: ControllerState): Promise<ControllerReentryPlan> {
  const outPath = path.join(state.rootDir, "controller-reentry-plan.json");
  const reportPath = path.join(state.rootDir, "controller-reentry-plan.md");
  const plan = await buildControllerReentryPlan(state, outPath, reportPath);
  await writeJson(outPath, { schemaVersion: 1, controllerReentryPlan: plan });
  await writeFile(reportPath, renderControllerReentryPlanMarkdown(plan));
  return plan;
}

async function readControllerReentryPlan(state: ControllerState): Promise<ControllerReentryPlan | null> {
  const raw = await readJsonIfPresent(path.join(state.rootDir, "controller-reentry-plan.json"));
  const plan = valueAtPath(raw, "controllerReentryPlan") ?? raw;
  if (!plan || typeof plan !== "object") return null;
  const record = plan as Partial<ControllerReentryPlan>;
  const status = record.status;
  const stage = record.recommendedStage;
  if (status !== "resume" && status !== "patch_then_resume" && status !== "repair_then_resume" && status !== "new_run_required" && status !== "complete_no_reentry") return null;
  if (!stage || !controllerStageSchema.safeParse(stage).success) return null;
  return {
    schemaVersion: 1,
    generatedAtIso: typeof record.generatedAtIso === "string" ? record.generatedAtIso : nowIso(),
    runId: typeof record.runId === "string" ? record.runId : state.runId,
    status,
    recommendedStage: stage,
    confidence: typeof record.confidence === "number" ? record.confidence : 0.5,
    reason: typeof record.reason === "string" ? record.reason : "Loaded existing re-entry plan.",
    triggeringEvidence: Array.isArray(record.triggeringEvidence) ? record.triggeringEvidence.map(String) : [],
    allowedActions: Array.isArray(record.allowedActions) ? record.allowedActions.filter(action => controllerActionSchema.safeParse(action).success) as ControllerActionType[] : allowedActionsForStage(stage),
    safePatch: record.safePatch && typeof record.safePatch === "object" ? controllerInputPatchSchema.safeParse(record.safePatch).success ? record.safePatch as ControllerInputPatch : null : null,
    autoRepairEligible: Boolean(record.autoRepairEligible),
    repairPlugin: typeof record.repairPlugin === "string" ? record.repairPlugin : null,
    commands: Array.isArray(record.commands) ? record.commands.map(String) : [],
    outPath: typeof record.outPath === "string" ? record.outPath : path.join(state.rootDir, "controller-reentry-plan.json"),
    reportPath: typeof record.reportPath === "string" ? record.reportPath : path.join(state.rootDir, "controller-reentry-plan.md"),
  };
}

async function buildControllerReentryPlan(state: ControllerState, outPath: string, reportPath: string): Promise<ControllerReentryPlan> {
  const lastGate = state.gates.at(-1) ?? null;
  const lastAction = state.actions.at(-1) ?? null;
  const lastTool = state.toolActions.at(-1) ?? null;
  const feasibility = await loadControllerFeasibilitySummary(state);
  const datasetSemanticAudit = await loadControllerDatasetSemanticAuditSummary(state);
  const selectedSemanticIssues = datasetSemanticAudit.topIssues.filter(issue => issue.selected && issue.severity !== "note");
  const selectedSemanticEvidence = uniqueText([datasetSemanticAudit.path, datasetSemanticAudit.reportPath].filter((item): item is string => Boolean(item)));
  const evidence = [
    ...(lastGate?.evidenceRefs ?? []),
    ...(lastAction?.artifacts.map(item => item.path) ?? []),
    ...(lastTool ? [lastTool.outPath, lastTool.stdoutPath, lastTool.stderrPath].filter((value): value is string => Boolean(value)) : []),
    ...(feasibility.path ? [feasibility.path] : []),
    ...selectedSemanticEvidence,
  ];
  const safePatch = examplePatchForState(state);
  let status: ControllerReentryPlan["status"] = "resume";
  let recommendedStage: ControllerStage = state.currentStage;
  let confidence = 0.72;
  let reason = state.stopReason ?? "Resume from the current controller stage.";
  let autoRepairEligible = false;
  let repairPlugin: string | null = null;

  if (state.status === "complete") {
    status = "complete_no_reentry";
    recommendedStage = "complete";
    confidence = 1;
    reason = "Controller run is complete; inspect artifacts before external sharing.";
  } else if (feasibility.status === "block" || lastGate?.stage === "dataset_feasibility" && lastGate.status === "block") {
    status = "patch_then_resume";
    recommendedStage = "dataset_feasibility";
    confidence = 0.92;
    const semanticReasons = selectedSemanticIssues.map(issue => `${issue.code}: ${issue.message}`);
    reason = `Dataset feasibility is blocked: ${uniqueText([...(feasibility.blockers.length ? feasibility.blockers : lastGate?.reasons ?? []), ...semanticReasons]).join("; ")}`;
  } else if (lastAction?.action === "external_review") {
    const rawAdjudication = await readJsonIfPresent(path.join(state.inputs.runDir, "review", "review-adjudication.json"));
    const verdict = String(valueAtPath(rawAdjudication, "reviewAdjudication.verdict") ?? "");
    const reentryPoint = String(valueAtPath(rawAdjudication, "reviewAdjudication.reentryPoint") ?? "human_review") as ReviewReentryPoint;
    recommendedStage = mapReviewReentryToControllerStage(reentryPoint);
    const accepted = valueAtPath(rawAdjudication, "reviewAdjudication.acceptedFindings");
    const firstFinding = Array.isArray(accepted) ? normalizeRepairFinding(accepted[0]) : null;
    repairPlugin = firstFinding ? repairPluginForFinding(firstFinding) : null;
    autoRepairEligible = Boolean(state.policy.allowAutoRepair && state.policy.autonomy === "aggressive" && verdict !== "pass" && recommendedStage !== "human_review" && repairPlugin && repairAttemptCount(state) < state.policy.maxAutoRepairs);
    status = autoRepairEligible ? "repair_then_resume" : verdict === "pass" ? "resume" : "patch_then_resume";
    confidence = autoRepairEligible ? 0.86 : 0.76;
    reason = verdict === "pass" ? "External review passed; continue to inspection." : `External review verdict is ${verdict || "missing"} with reentry point ${reentryPoint}.`;
  } else if (lastAction?.action === "apply_repairs" && state.repairs.length) {
    const repair = state.repairs.at(-1);
    recommendedStage = repair?.nextStage && repair.nextStage !== "human_review" ? repair.nextStage : "inspection";
    status = "resume";
    confidence = repair?.status === "succeeded" ? 0.84 : repair?.status === "partial" ? 0.68 : 0.56;
    reason = `Bounded repair ${repair?.status ?? "unknown"}; resume at ${recommendedStage} to verify repaired artifacts.`;
  } else if (lastAction?.action === "method_qa" && /fail|blocker/i.test(lastAction.outputSummary)) {
    status = state.policy.allowAutoRepair && state.policy.autonomy === "aggressive" ? "repair_then_resume" : "resume";
    recommendedStage = "qa";
    autoRepairEligible = state.policy.allowAutoRepair && state.policy.autonomy === "aggressive";
    repairPlugin = "refresh-method-qa-and-inspection";
    reason = "Method QA reported failure/blockers; re-enter QA after resolving diagnostics.";
  } else if (lastAction?.status === "failed") {
    status = "resume";
    recommendedStage = lastAction.action === "run_analysis" ? "execution" : state.currentStage;
    confidence = 0.7;
    reason = `Last controller action failed: ${lastAction.error ?? lastAction.outputSummary}`;
  } else if (lastGate?.status === "block") {
    status = "patch_then_resume";
    recommendedStage = lastGate.stage;
    confidence = 0.82;
    reason = lastGate.reasons.join("; ") || lastGate.label;
  } else if (state.status === "needs_human_review") {
    status = "resume";
    recommendedStage = state.currentStage;
    confidence = 0.64;
    reason = state.stopReason ?? "Human review was requested before resuming.";
  }

  if (state.status === "blocked" && recommendedStage === "blocked") {
    recommendedStage = lastGate && lastGate.stage !== "blocked" ? lastGate.stage : "dataset_feasibility";
  }
  if (status === "resume" && state.status === "blocked") status = "patch_then_resume";
  if (state.currentStage === "human_review" && recommendedStage === "human_review" && lastGate) recommendedStage = lastGate.stage;
  const commands = buildReentryCommands(state, status, recommendedStage, safePatch);
  return {
    schemaVersion: 1,
    generatedAtIso: nowIso(),
    runId: state.runId,
    status,
    recommendedStage,
    confidence,
    reason,
    triggeringEvidence: uniqueText(evidence),
    allowedActions: allowedActionsForStage(recommendedStage),
    safePatch: status === "patch_then_resume" ? safePatch : null,
    autoRepairEligible,
    repairPlugin,
    commands,
    outPath: path.resolve(outPath),
    reportPath: path.resolve(reportPath),
  };
}

function buildReentryCommands(state: ControllerState, status: ControllerReentryPlan["status"], stage: ControllerStage, safePatch: ControllerInputPatch): string[] {
  const commands = [
    `agenteer research controller-status --state ${quotePath(state.statePath)}`,
    `agenteer research controller-inspect --state ${quotePath(state.statePath)}`,
  ];
  if (status === "patch_then_resume") commands.push(`agenteer research controller-patch --state ${quotePath(state.statePath)} --patch '${JSON.stringify(safePatch)}' --reason ${JSON.stringify(`Re-enter ${stage} after reviewed correction.`)}`);
  if (status === "patch_then_resume") commands.push(`agenteer research controller-resume --state ${quotePath(state.statePath)} --force`);
  else if (status !== "complete_no_reentry" && status !== "new_run_required") commands.push(`agenteer research controller-resume --state ${quotePath(state.statePath)}`);
  if (status === "repair_then_resume") commands.push(`agenteer research controller-run --state ${quotePath(state.statePath)} --max-steps 4`);
  else if (status === "resume") commands.push(`agenteer research controller-run --state ${quotePath(state.statePath)}`);
  if (state.inputs.runDir) commands.push(`agenteer research run-inspect --run-dir ${quotePath(state.inputs.runDir)}`);
  return uniqueText(commands);
}

function renderControllerReentryPlanMarkdown(plan: ControllerReentryPlan): string {
  return [
    "# Controller Re-Entry Plan",
    "",
    `- Run: ${plan.runId}`,
    `- Status: ${plan.status}`,
    `- Recommended stage: ${plan.recommendedStage}`,
    `- Confidence: ${plan.confidence}`,
    `- Auto-repair eligible: ${plan.autoRepairEligible}`,
    `- Repair plugin: ${plan.repairPlugin ?? "(none)"}`,
    "",
    "## Reason",
    "",
    plan.reason,
    "",
    "## Evidence",
    ...(plan.triggeringEvidence.length ? plan.triggeringEvidence.map(item => `- ${item}`) : ["- None recorded"]),
    "",
    "## Commands",
    ...plan.commands.map(command => `\`\`\`bash\n${command}\n\`\`\``),
    "",
  ].join("\n");
}

async function buildTerminalHandoff(state: ControllerState, jsonPath: string, reportPath: string, reentryPlan: ControllerReentryPlan): Promise<ControllerTerminalHandoff> {
  const trigger: ControllerTerminalHandoff["trigger"] = state.status === "blocked" ? "blocked" : state.status === "complete" ? "complete" : "human_review";
  const requiredArtifacts = state.artifacts.filter(item => item.requiredForPromotion);
  const missingRequiredArtifacts = requiredArtifacts.filter(item => !item.sha256);
  const datasetSemanticAudit = await loadControllerDatasetSemanticAuditSummary(state);
  return {
    schemaVersion: 1,
    generatedAtIso: nowIso(),
    runId: state.runId,
    status: state.status,
    stage: state.currentStage,
    trigger,
    summary: terminalSummary(state),
    failureAttribution: terminalFailureAttribution(state, datasetSemanticAudit),
    lastGate: state.gates.at(-1) ?? null,
    lastDecision: state.decisions.at(-1) ?? null,
    lastAction: state.actions.at(-1) ?? null,
    lastToolAction: state.toolActions.at(-1) ?? null,
    completedStages: state.completedStages,
    missingStages: missingControllerStages(state),
    requiredArtifacts,
    missingRequiredArtifacts,
    reentryPlan,
    suggestedCommands: await suggestedTerminalCommands(state),
    safePatchFields: Object.keys(controllerInputPatchSchema.shape),
    nextRecommendedAction: state.nextRecommendedAction,
    reportPath: path.resolve(reportPath),
    jsonPath: path.resolve(jsonPath),
  };
}

function terminalSummary(state: ControllerState): string {
  if (state.status === "complete") return "Controller completed all required gates for the current policy. Inspect the manuscript, QA, and handoff packet before external sharing.";
  if (state.status === "blocked") return state.stopReason ?? "Controller blocked because a hard gate failed.";
  return state.stopReason ?? "Controller stopped because the next action requires human review or an explicit policy change.";
}

function terminalFailureAttribution(
  state: ControllerState,
  datasetSemanticAudit?: Awaited<ReturnType<typeof loadControllerDatasetSemanticAuditSummary>>,
): ControllerTerminalHandoff["failureAttribution"] {
  const attributions: ControllerTerminalHandoff["failureAttribution"] = [];
  const lastGate = state.gates.at(-1);
  const lastAction = state.actions.at(-1);
  const lastTool = state.toolActions.at(-1);
  if (datasetSemanticAudit?.present && datasetSemanticAudit.selectedRoleStatus !== "pass" && datasetSemanticAudit.selectedRoleStatus !== "unknown") {
    const evidenceRefs = uniqueText([datasetSemanticAudit.path, datasetSemanticAudit.reportPath].filter((item): item is string => Boolean(item)));
    for (const issue of datasetSemanticAudit.topIssues.filter(item => item.selected && item.severity !== "note")) {
      attributions.push({
        category: "data",
        severity: issue.severity === "blocker" ? "blocker" : "warning",
        message: `${issue.code}: ${issue.message}`,
        evidenceRefs,
      });
    }
  }
  if (lastGate && lastGate.status === "block") {
    attributions.push({
      category: categoryForGate(lastGate),
      severity: "blocker",
      message: lastGate.reasons.join("; ") || lastGate.label,
      evidenceRefs: lastGate.evidenceRefs,
    });
  }
  if (lastAction?.status === "failed") {
    attributions.push({
      category: categoryForAction(lastAction.action),
      severity: "blocker",
      message: lastAction.error ?? lastAction.outputSummary,
      evidenceRefs: lastAction.artifacts.map(item => item.path),
    });
  }
  if (lastTool && lastTool.status !== "succeeded") {
    attributions.push({
      category: "execution",
      severity: state.policy.autonomy === "aggressive" ? "warning" : "blocker",
      message: `Tool ${lastTool.request.toolId} ${lastTool.status}: ${lastTool.validationReasons.join("; ") || lastTool.stderrPreview || "no additional detail"}`,
      evidenceRefs: [lastTool.outPath, lastTool.stdoutPath, lastTool.stderrPath].filter((value): value is string => Boolean(value)),
    });
  }
  if (state.status === "complete") {
    attributions.push({
      category: "artifact",
      severity: "info",
      message: "Completion reached by controller policy; this is local readiness, not external publication approval.",
      evidenceRefs: state.artifacts.filter(item => item.requiredForPromotion).map(item => item.path),
    });
  }
  if (!attributions.length && state.stopReason) {
    attributions.push({ category: "unknown", severity: "warning", message: state.stopReason, evidenceRefs: [] });
  }
  return attributions;
}

function categoryForGate(gateResult: ControllerGate): ControllerTerminalHandoff["failureAttribution"][number]["category"] {
  if (gateResult.stage === "context") return "context";
  if (gateResult.stage === "dataset_feasibility") return "data";
  if (gateResult.stage === "literature" || gateResult.stage === "literature_qa") return "review";
  if (gateResult.stage === "method_selection" || gateResult.stage === "execution" || gateResult.stage === "qa") return "methods";
  if (gateResult.stage === "external_review" || gateResult.stage === "repair" || gateResult.stage === "promotion_decision") return "review";
  return "policy";
}

function categoryForAction(action: ControllerActionType): ControllerTerminalHandoff["failureAttribution"][number]["category"] {
  if (action === "context_preflight") return "context";
  if (action === "run_analysis" || action === "apply_repairs") return "execution";
  if (action === "method_qa" || action === "select_method") return "methods";
  if (action === "literature_search" || action === "literature_qa") return "review";
  if (action === "external_review") return "review";
  if (action === "write_manuscript" || action === "inspect_run") return "artifact";
  return "unknown";
}

function missingControllerStages(state: ControllerState): ControllerStage[] {
  const required: ControllerStage[] = ["intake", "dataset_feasibility", "exploration", "method_selection", "execution", "qa", "manuscript", "inspection", "promotion_decision"];
  if (state.policy.allowContext) required.splice(required.indexOf("dataset_feasibility"), 0, "context");
  if (state.policy.allowLiterature) {
    required.splice(required.indexOf("method_selection"), 0, "literature");
    required.splice(required.indexOf("inspection"), 0, "literature_qa");
  }
  if (state.policy.allowExternalReview) required.splice(required.indexOf("inspection"), 0, "external_review");
  return required.filter(stage => !state.completedStages.includes(stage));
}

async function suggestedTerminalCommands(state: ControllerState): Promise<string[]> {
  const commands = [
    `agenteer research controller-status --state ${quotePath(state.statePath)}`,
    `agenteer research controller-inspect --state ${quotePath(state.statePath)}`,
  ];
  if (state.status === "blocked" || state.status === "needs_human_review") {
    commands.push(`agenteer research controller-tool --state ${quotePath(state.statePath)} --tool controller-status --reason ${JSON.stringify("Refresh terminal controller status before resuming.")}`);
    commands.push(`agenteer research controller-tool --state ${quotePath(state.statePath)} --tool controller-inspect --reason ${JSON.stringify("Inspect terminal controller state before resuming.")}`);
    commands.push(`agenteer research controller-patch --state ${quotePath(state.statePath)} --patch '${JSON.stringify(examplePatchForState(state))}' --reason ${JSON.stringify("Apply a reviewed correction, then rerun.")}`);
    commands.push(`agenteer research controller-resume --state ${quotePath(state.statePath)}`);
    commands.push(`agenteer research controller-run --state ${quotePath(state.statePath)}`);
  }
  if (state.inputs.runDir) {
    commands.push(...await runInspectionRecommendedCommandsForState(state));
    commands.push(`agenteer research run-inspect --run-dir ${quotePath(state.inputs.runDir)}`);
  }
  return uniqueText(commands);
}

async function runInspectionRecommendedCommandsForState(state: ControllerState): Promise<string[]> {
  const raw = await readJsonIfPresent(path.join(state.inputs.runDir, "run-inspection.json"));
  const inspection = (valueAtPath(raw, "runInspection") ?? raw) as Partial<RunInspectionResult> | null;
  return controllerInspectionRecommendedCommands(inspection);
}

function examplePatchForState(state: ControllerState): ControllerInputPatch {
  if (!state.inputs.outcome) return { outcome: "REPLACE_WITH_OUTCOME_COLUMN" };
  if (!state.inputs.exposure && !state.inputs.group) return { exposure: "REPLACE_WITH_EXPOSURE_COLUMN" };
  if (!state.inputs.method) return { method: "descriptive" };
  return { covariates: [...new Set([...state.inputs.covariates, "REPLACE_WITH_COVARIATE_COLUMN"])] };
}

function quotePath(value: string): string {
  return JSON.stringify(value);
}

function requiredEnvVarsForControllerPolicy(policy: ControllerPolicy): string[] {
  const vars = new Set<string>();
  if (policy.controller.enabled || policy.requireControllerModel) {
    vars.add(envVarForProvider(policy.controller.provider));
  }
  if (policy.allowExternalReview || policy.requireExternalReviewForPromotion) {
    for (const provider of providersForReviewPanel(policy.reviewPanel)) {
      vars.add(envVarForProvider(provider));
    }
  }
  return Array.from(vars).filter(item => item !== "MOCK_PROVIDER").sort();
}

function optionalEnvWarningsForControllerPolicy(policy: ControllerPolicy, requiredEnvVars: string[]): string[] {
  const warnings: string[] = [];
  if (!requiredEnvVars.length && (policy.controller.enabled || policy.allowExternalReview || policy.requireControllerModel || policy.requireExternalReviewForPromotion)) {
    warnings.push("Model or reviewer policy is enabled but no concrete non-mock provider environment variable was inferred.");
  }
  if (policy.allowLiterature && !policy.literatureBaseUrl) {
    warnings.push("Literature search is enabled without a configured literatureBaseUrl; local defaults must be reachable.");
  }
  if (providersForReviewPanel(policy.reviewPanel).includes("mock") && (policy.allowExternalReview || policy.requireExternalReviewForPromotion) && !policy.mockExternalReview) {
    warnings.push("External review policy uses a mock panel while mockExternalReview is false.");
  }
  return uniqueText(warnings);
}

function providersForReviewPanel(panel: ReviewerPanel): ControllerModelConfig["provider"][] {
  switch (panel) {
    case "default":
      return ["anthropic", "deepseek"];
    case "cheap":
      return ["deepseek"];
    case "strict":
      return ["anthropic", "openai", "google"];
    case "all":
      return ["openai", "anthropic", "google", "deepseek", "xai"];
    case "deepseek-dual":
    case "deepseek-triple":
      return ["deepseek"];
  }
}

function envVarForProvider(provider: ControllerModelConfig["provider"]): string {
  switch (provider) {
    case "anthropic":
      return "ANTHROPIC_API_KEY";
    case "deepseek":
      return "DEEPSEEK_API_KEY";
    case "google":
      return "GEMINI_API_KEY";
    case "openai":
      return "OPENAI_API_KEY";
    case "xai":
      return "XAI_API_KEY";
    case "mock":
      return "MOCK_PROVIDER";
  }
}

function renderTerminalHandoffMarkdown(packet: ControllerTerminalHandoff): string {
  const lines = [
    `# Controller Terminal Handoff`,
    "",
    `- Run: ${packet.runId}`,
    `- Status: ${packet.status}`,
    `- Stage: ${packet.stage}`,
    `- Trigger: ${packet.trigger}`,
    "",
    "## Summary",
    "",
    packet.summary,
    "",
    "## Failure Attribution",
    "",
    ...(packet.failureAttribution.length
      ? packet.failureAttribution.map(item => `- ${item.severity.toUpperCase()} [${item.category}]: ${item.message}${item.evidenceRefs.length ? ` Evidence: ${item.evidenceRefs.join(", ")}` : ""}`)
      : ["- No blocker attribution recorded."]),
    "",
    "## Progress",
    "",
    `- Completed stages: ${packet.completedStages.join(", ") || "(none)"}`,
    `- Missing stages: ${packet.missingStages.join(", ") || "(none)"}`,
    `- Required artifacts: ${packet.requiredArtifacts.length}`,
    `- Missing required artifacts: ${packet.missingRequiredArtifacts.length}`,
    "",
    "## Re-Entry Plan",
    "",
    `- Status: ${packet.reentryPlan.status}`,
    `- Recommended stage: ${packet.reentryPlan.recommendedStage}`,
    `- Reason: ${packet.reentryPlan.reason}`,
    `- Auto-repair eligible: ${packet.reentryPlan.autoRepairEligible}`,
    `- Plan artifact: ${packet.reentryPlan.outPath}`,
    `- Plan report: ${packet.reentryPlan.reportPath}`,
    "",
    "## Suggested Commands",
    "",
    ...packet.suggestedCommands.map(command => `\`\`\`bash\n${command}\n\`\`\``),
    "",
    "## Safe Patch Fields",
    "",
    packet.safePatchFields.join(", "),
    "",
  ];
  return `${lines.join("\n")}\n`;
}

async function readControllerState(statePath: string): Promise<ControllerState> {
  const raw = JSON.parse(await readFile(path.resolve(statePath), "utf-8")) as Record<string, unknown>;
  const state = (raw.controllerState ?? raw) as ControllerState;
  return {
    ...state,
    statePath: path.resolve(state.statePath ?? statePath),
    policyUpdates: state.policyUpdates ?? [],
    selfEvaluations: state.selfEvaluations ?? [],
    workPlans: state.workPlans ?? [],
    issueLedgers: state.issueLedgers ?? [],
    stageReviews: state.stageReviews ?? [],
    agendas: state.agendas ?? [],
  };
}

async function writeJson(file: string, value: unknown): Promise<void> {
  await mkdir(path.dirname(path.resolve(file)), { recursive: true });
  await writeFile(path.resolve(file), `${JSON.stringify(value, null, 2)}\n`);
}

async function readJsonIfPresent(file: string): Promise<unknown | null> {
  try {
    return JSON.parse(await readFile(path.resolve(file), "utf-8")) as unknown;
  } catch {
    return null;
  }
}

async function loadLatestArtifactPayload<T>(state: ControllerState, kind: string, property: string): Promise<T | null> {
  const latest = state.artifacts.filter(item => item.kind === kind).at(-1);
  if (!latest) return null;
  const raw = await readJsonIfPresent(latest.path);
  return (valueAtPath(raw, property) ?? raw) as T | null;
}

function latestArtifactRefs(state: ControllerState, dataKind: string, reportKind: string): {
  present: boolean;
  latestPath: string | null;
  latestReportPath: string | null;
} {
  const latestPath = state.artifacts.filter(item => item.kind === dataKind).at(-1)?.path ?? null;
  const latestReportPath = state.artifacts.filter(item => item.kind === reportKind).at(-1)?.path ?? null;
  return {
    present: Boolean(latestPath),
    latestPath,
    latestReportPath,
  };
}

async function pathExists(file: string): Promise<boolean> {
  return access(path.resolve(file)).then(() => true).catch(() => false);
}

async function hashFileIfPresent(file: string): Promise<string | null> {
  try {
    const buffer = await readFile(path.resolve(file));
    return createHash("sha256").update(buffer).digest("hex");
  } catch {
    return null;
  }
}

function stableHash(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function uniqueText(values: string[]): string[] {
  return Array.from(new Set(values.filter(value => value.trim().length)));
}

function nowIso(): string {
  return new Date().toISOString();
}

function round(value: number, places: number): number {
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
}

function valueAtPath(value: unknown, expression: string): unknown {
  return expression.split(".").reduce<unknown>((current, part) => {
    if (!current || typeof current !== "object") return undefined;
    return (current as Record<string, unknown>)[part];
  }, value);
}

export function parseControllerModel(value: string | undefined, enabled: boolean): Partial<ControllerModelConfig> {
  if (!value) return { enabled };
  const [providerText, ...modelParts] = value.split(":");
  const provider = z.enum(["openai", "anthropic", "google", "deepseek", "xai", "mock"]).parse(providerText);
  const model = modelParts.join(":") || reviewerProviderConfigs().find(item => item.id === provider)?.defaultModel || "gpt-5.4";
  return { provider, model, enabled };
}
