import path from "node:path";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { researchTableSummaryCommand, type ResearchTableSummary } from "../commands/research.js";
import {
  archetypeCatalog,
  backendCatalog,
  datasetCatalog,
  getArchetypeManifest,
  getDatasetManifest,
} from "./catalog.js";
import {
  buildExecutionContract,
  buildMachinePlan,
  buildMachineStatus,
  evaluateMachineBenchmark,
  inspectDatasetAdapter,
  migrateToAnalysisSpecV2,
  readJsonFile,
  writeSpecV2,
  type DatasetAdapterInspection,
  type MachineBenchmarkResult,
  type SpecV2Result,
} from "./runtime.js";
import {
  analysisMethodCatalog,
  applyMethodSelectionToSpec,
  getAnalysisMethod,
  listAnalysisMethods,
  selectAnalysisMethods,
  validateMethodForSpec,
} from "./methods.js";
import {
  buildModelingDecisionPlan,
  modelingGoalSchema,
  type ModelingDecisionPlan,
  type ModelingGoal,
  type ModelingDecisionRequest,
} from "./modeling.js";
import {
  evaluateFeasibilityGate,
  researchFeasibilityGateCommand,
  renderResearchFeasibilityGate,
  renderResearchFeasibilityGateJson,
  renderResearchFeasibilityGateMarkdown,
  type FeasibilityGateOptions,
  type FeasibilityGateResult,
  type FeasibilityVerdict,
} from "./feasibility.js";
import { buildAnalysisRunManifest, criticalStatsQaWarningChecks, type AnalysisRunManifest } from "./analysis-manifest.js";
import {
  researchLiteratureContextCommand,
  researchLiteratureQaCommand,
  researchMedbreviaLiteratureSearchCommand,
  renderResearchLiteratureContext,
  renderResearchLiteratureContextJson,
  renderResearchLiteratureQa,
  renderResearchLiteratureQaJson,
  renderResearchMedbreviaLiteratureSearch,
  renderResearchMedbreviaLiteratureSearchJson,
  type ResearchLiteratureContext,
  type ResearchLiteratureQaResult,
  type ResearchLiteratureSearchResult,
} from "./medbrevia-literature.js";
import {
  renderDatasetRun,
  renderDatasetRunIndex,
  renderDatasetRunIndexJson,
  renderDatasetRunJson,
  renderDatasetSpec,
  renderDatasetSpecJson,
  researchDatasetRunCommand,
  researchDatasetRunIndexCommand,
  researchDatasetSpecCommand,
  type DatasetRunIndex,
  type DatasetRunResult,
  type DatasetSpecFromStudyResult,
} from "./dataset-run.js";
import {
  phenotypeCodeSystemSchema,
  researchPhenotypeInspectCommand,
  researchPhenotypeListCommand,
  researchPhenotypeMatchCommand,
  researchPhenotypeReviewCommand,
  renderResearchPhenotypeInspect,
  renderResearchPhenotypeInspectJson,
  renderResearchPhenotypeList,
  renderResearchPhenotypeListJson,
  renderResearchPhenotypeMatch,
  renderResearchPhenotypeMatchJson,
  renderResearchPhenotypeReview,
  renderResearchPhenotypeReviewJson,
  type PhenotypeCodeSystem,
} from "./phenotypes.js";
import {
  researchManuscriptCommand,
  researchMethodQaCommand,
  researchRunInspectCommand,
  renderResearchManuscriptJson,
  renderResearchMethodQaJson,
  renderResearchRunInspectJson,
  type ManuscriptResult,
  type MethodQaResult,
  type MethodQaStatus,
  type RunInspectionResult,
} from "./trust.js";
import {
  researchReviewAdjudicateCommand,
  researchReviewerProvidersCommand,
  researchReviewResponseCommand,
  researchStudyCriticCommand,
  renderResearchReviewAdjudication,
  renderResearchReviewAdjudicationJson,
  renderResearchReviewerProviders,
  renderResearchReviewerProvidersJson,
  renderResearchReviewResponse,
  renderResearchReviewResponseJson,
  renderResearchStudyCritic,
  renderResearchStudyCriticJson,
  reviewAutonomySchema,
  reviewStageSchema,
  type ReviewAutonomy,
  type ReviewStage,
} from "./reviewer.js";
export {
  evaluateFeasibilityGate,
  researchFeasibilityGateCommand,
  renderResearchFeasibilityGate,
  renderResearchFeasibilityGateJson,
  renderResearchFeasibilityGateMarkdown,
};
export type { FeasibilityGateOptions, FeasibilityGateResult, FeasibilityVerdict };
import { runStatsMethod } from "./stats/runner.js";
import type { StatsMethod, StatsRunRequest, StatsRunResult } from "./stats/schemas.js";
import {
  analysisMethodCategorySchema,
  type BackendId,
  type DatasetAdapterId,
  datasetAdapterIdSchema,
  dataStructureSchema,
  type ExecutionContract,
  type AnalysisMethod,
  type AnalysisMethodCategory,
  type MachinePlan,
  type MachineStatus,
  methodSelectionResultSchema,
  methodSelectionRequestSchema,
  outcomeTypeSchema,
  studyArchetypeIdSchema,
  studyDesignSchema,
  type DataStructure,
  type MethodSelectionRequest,
  type MethodSelectionResult,
  type OutcomeType,
  type StudyArchetypeId,
  backendIdSchema,
  type StudyArchetypeManifest,
  type ResearchBackendManifest,
  type DatasetAdapterManifest,
} from "./schemas.js";

export {
  researchBenchmarkSuiteRunCommand,
  researchBenchmarkTrendCommand,
  researchExplorePlanCommand,
  researchManuscriptCommand,
  researchMethodQaCommand,
  researchRunInspectCommand,
  renderResearchBenchmarkSuiteRun,
  renderResearchBenchmarkSuiteRunJson,
  renderResearchBenchmarkTrend,
  renderResearchBenchmarkTrendJson,
  renderResearchExplorePlan,
  renderResearchExplorePlanJson,
  renderResearchManuscript,
  renderResearchManuscriptJson,
  renderResearchMethodQa,
  renderResearchMethodQaJson,
  renderResearchRunInspect,
  renderResearchRunInspectJson,
  type ContinuousBenchmarkSuiteResult,
  type ContinuousBenchmarkTrendResult,
  type ExplorationPlanResult,
  type ManuscriptQaResult,
  type ManuscriptResult,
  type MethodQaResult,
  type RunInspectionResult,
} from "./trust.js";

export {
  researchLiteratureContextCommand,
  researchLiteratureQaCommand,
  researchMedbreviaLiteratureSearchCommand,
  renderResearchLiteratureContext,
  renderResearchLiteratureContextJson,
  renderResearchLiteratureQa,
  renderResearchLiteratureQaJson,
  renderResearchMedbreviaLiteratureSearch,
  renderResearchMedbreviaLiteratureSearchJson,
  type ResearchLiteratureContext,
  type ResearchLiteratureQaResult,
  type ResearchLiteratureSearchResult,
} from "./medbrevia-literature.js";

export type { DatasetAdapterInspection, MachineBenchmarkResult, SpecV2Result } from "./runtime.js";
export {
  renderDatasetRun,
  renderDatasetRunIndex,
  renderDatasetRunIndexJson,
  renderDatasetRunJson,
  renderDatasetSpec,
  renderDatasetSpecJson,
  researchDatasetRunCommand,
  researchDatasetRunIndexCommand,
  researchDatasetSpecCommand,
  type DatasetRunIndex,
  type DatasetRunResult,
  type DatasetSpecFromStudyResult,
} from "./dataset-run.js";

export {
  researchPhenotypeInspectCommand,
  researchPhenotypeListCommand,
  researchPhenotypeMatchCommand,
  researchPhenotypeReviewCommand,
  renderResearchPhenotypeInspect,
  renderResearchPhenotypeInspectJson,
  renderResearchPhenotypeList,
  renderResearchPhenotypeListJson,
  renderResearchPhenotypeMatch,
  renderResearchPhenotypeMatchJson,
  renderResearchPhenotypeReview,
  renderResearchPhenotypeReviewJson,
  type PhenotypeCodeSystem,
} from "./phenotypes.js";

export {
  parseControllerModel,
  researchControllerAgendaCommand,
  researchControllerAuditCommand,
  researchControllerBenchmarkCommand,
  researchControllerCapabilitiesCommand,
  researchControllerCompletionAuditCommand,
  researchControllerDoctorCommand,
  researchControllerEnvironmentCommand,
  researchControllerFollowAgendaCommand,
  researchControllerFollowLoopCommand,
  researchControllerGoldenPacketCommand,
  researchControllerGoalAuditCommand,
  researchControllerInitCommand,
  researchControllerInspectCommand,
  researchControllerOperateCommand,
  researchControllerPatchCommand,
  researchControllerRepairCycleCommand,
  researchControllerResumeCommand,
  researchControllerRunbookCommand,
  researchControllerRunnerPacketCommand,
  researchControllerRunCommand,
  researchControllerSelfTestCommand,
  researchControllerStepCommand,
  researchControllerStartCommand,
  researchControllerStatusCommand,
  researchControllerSupervisorCommand,
  researchControllerToolCommand,
  renderResearchControllerAgenda,
  renderResearchControllerAgendaJson,
  renderResearchControllerAudit,
  renderResearchControllerAuditJson,
  renderResearchControllerBenchmark,
  renderResearchControllerBenchmarkJson,
  renderResearchControllerCapabilities,
  renderResearchControllerCapabilitiesJson,
  renderResearchControllerCompletionAudit,
  renderResearchControllerCompletionAuditJson,
  renderResearchControllerDoctor,
  renderResearchControllerDoctorJson,
  renderResearchControllerEnvironment,
  renderResearchControllerEnvironmentJson,
  renderResearchControllerFollowAgenda,
  renderResearchControllerFollowAgendaJson,
  renderResearchControllerFollowLoop,
  renderResearchControllerFollowLoopJson,
  renderResearchControllerGoldenPacket,
  renderResearchControllerGoldenPacketJson,
  renderResearchControllerGoalAudit,
  renderResearchControllerGoalAuditJson,
  renderResearchControllerOperate,
  renderResearchControllerOperateJson,
  renderResearchControllerRepairCycle,
  renderResearchControllerRepairCycleJson,
  renderResearchControllerRunbook,
  renderResearchControllerRunbookJson,
  renderResearchControllerRunnerPacket,
  renderResearchControllerRunnerPacketJson,
  renderResearchControllerSelfTest,
  renderResearchControllerSelfTestJson,
  renderResearchControllerState,
  renderResearchControllerStateJson,
  renderResearchControllerStart,
  renderResearchControllerStartJson,
  renderResearchControllerStatus,
  renderResearchControllerStatusJson,
  renderResearchControllerSupervisor,
  renderResearchControllerSupervisorJson,
  type ControllerExecutionAgenda,
  type ControllerExecutionAgendaItem,
  type ControllerBenchmarkResult,
  type ControllerCapabilityManifest,
  type ControllerCompletionAudit,
  type ControllerDoctorResult,
  type ControllerGoldenPacket,
  type ControllerFollowAgendaResult,
  type ControllerFollowLoopResult,
  type ControllerModelRunnerPacket,
  type ControllerOperateResult,
  type ControllerOperatorAudit,
  type ControllerSelfTestResult,
  type ControllerStartResult,
  type ControllerSupervisorResult,
  type ControllerInitOptions,
  type ControllerInputPatch,
  type ControllerLaunchRunbook,
  type ControllerPatchRecord,
  type ControllerRepairCycleResult,
  type ControllerResumeResult,
  type ControllerRunResult,
  type ControllerState,
  type ControllerUnifiedStatus,
  type ControllerToolExecution,
  type ControllerToolRequest,
} from "./controller.js";

export {
  researchReviewAdjudicateCommand,
  researchReviewerProvidersCommand,
  researchReviewResponseCommand,
  researchStudyCriticCommand,
  renderResearchReviewAdjudication,
  renderResearchReviewAdjudicationJson,
  renderResearchReviewerProviders,
  renderResearchReviewerProvidersJson,
  renderResearchReviewResponse,
  renderResearchReviewResponseJson,
  renderResearchStudyCritic,
  renderResearchStudyCriticJson,
  type ReviewAutonomy,
  type ReviewStage,
} from "./reviewer.js";

export async function researchMachineStatusCommand(opts: { python?: string; rscript?: string; dataRoot?: string } = {}): Promise<MachineStatus> {
  return buildMachineStatus(opts);
}

export async function researchSpecV2Command(opts: { specPath: string; outPath?: string }): Promise<SpecV2Result> {
  return writeSpecV2(await readJsonFile(opts.specPath), opts.outPath);
}

export function researchExecutionContractCommand(opts: { spec: unknown; backend?: BackendId; dataRoot?: string; outDir?: string }): ExecutionContract {
  const spec = migrateToAnalysisSpecV2(opts.spec).spec;
  return buildExecutionContract(spec, { backend: opts.backend, dataRoot: opts.dataRoot, outDir: opts.outDir });
}

export async function researchExecutionContractFromFileCommand(opts: { specPath: string; backend?: BackendId; dataRoot?: string; outDir?: string }): Promise<ExecutionContract> {
  return researchExecutionContractCommand({ spec: await readJsonFile(opts.specPath), backend: opts.backend, dataRoot: opts.dataRoot, outDir: opts.outDir });
}

export function researchArchetypesCommand(opts: { id?: StudyArchetypeId } = {}): { archetypes: StudyArchetypeManifest[]; nextAction: string } {
  const archetypes = opts.id ? [getArchetypeManifest(opts.id)] : archetypeCatalog;
  return {
    archetypes,
    nextAction: opts.id ? "Use this archetype to generate or validate AnalysisSpec V2." : "Choose one archetype before execution so QA gates and backends are explicit.",
  };
}

export async function researchDatasetAdapterCommand(opts: { dataset: DatasetAdapterId; dataRoot?: string }): Promise<DatasetAdapterInspection> {
  return inspectDatasetAdapter(opts.dataset, { dataRoot: opts.dataRoot });
}

export function researchMachinePlanCommand(opts: { question: string; dataset?: DatasetAdapterId; archetype?: StudyArchetypeId; dataRoot?: string; backend?: BackendId }): MachinePlan {
  return buildMachinePlan(opts);
}

export async function researchMachineBenchmarkCommand(opts: { packetDir: string; specPath?: string; outPath?: string }): Promise<MachineBenchmarkResult> {
  return evaluateMachineBenchmark(opts);
}

export function researchMethodsCatalogCommand(opts: { category?: AnalysisMethodCategory; methodId?: string } = {}): { methods: AnalysisMethod[]; category: AnalysisMethodCategory | null; nextAction: string } {
  const methods = opts.methodId ? [getAnalysisMethod(opts.methodId)] : listAnalysisMethods({ category: opts.category });
  return {
    methods,
    category: opts.category ?? null,
    nextAction: opts.methodId
      ? "Validate this method against an AnalysisSpec before execution."
      : "Run method-select for a specific research question, then apply the selected method to AnalysisSpec V2.",
  };
}

export async function researchMethodSelectCommand(opts: Partial<MethodSelectionRequest> & { question: string; outPath?: string }): Promise<MethodSelectionResult & { outPath: string | null }> {
  const result = selectAnalysisMethods(opts);
  const parsed = methodSelectionResultSchema.parse(result);
  if (opts.outPath) {
    const resolved = path.resolve(opts.outPath);
    await mkdir(path.dirname(resolved), { recursive: true });
    await writeFile(resolved, renderResearchMachineMethodSelectionJson(parsed));
    return { ...parsed, outPath: resolved };
  }
  return { ...parsed, outPath: null };
}

export async function researchMethodApplyCommand(opts: { specPath: string; selectionPath: string; outPath?: string }): Promise<{ spec: ReturnType<typeof applyMethodSelectionToSpec>; selection: MethodSelectionResult; validation: ReturnType<typeof validateMethodForSpec>; outPath: string | null }> {
  const spec = migrateToAnalysisSpecV2(await readJsonFile(opts.specPath)).spec;
  const rawSelection = await readJsonFile(opts.selectionPath);
  const selection = methodSelectionResultSchema.parse("methodSelection" in Object(rawSelection) ? (rawSelection as Record<string, unknown>).methodSelection : rawSelection);
  const updated = applyMethodSelectionToSpec(spec, selection);
  const validation = selection.primary ? validateMethodForSpec(updated, selection.primary.method) : { status: "blocked" as const, issues: [{ severity: "blocker" as const, code: "NO_PRIMARY_METHOD", message: "No primary method was selected.", evidenceRefs: [] }] };
  if (opts.outPath) {
    const resolved = path.resolve(opts.outPath);
    await mkdir(path.dirname(resolved), { recursive: true });
    await writeFile(resolved, `${JSON.stringify({ schemaVersion: 1, analysisSpecV2: updated, methodSelection: selection, validation }, null, 2)}\n`);
    return { spec: updated, selection, validation, outPath: resolved };
  }
  return { spec: updated, selection, validation, outPath: null };
}

export async function researchMethodValidateCommand(opts: { specPath: string; methodId: string }): Promise<{ method: AnalysisMethod; validation: ReturnType<typeof validateMethodForSpec> }> {
  const spec = migrateToAnalysisSpecV2(await readJsonFile(opts.specPath)).spec;
  const method = getAnalysisMethod(opts.methodId);
  return { method, validation: validateMethodForSpec(spec, method) };
}

export function researchModelingPlanCommand(opts: {
  question: string;
  goal?: ModelingGoal;
  outcomeType?: OutcomeType;
  studyDesign?: MethodSelectionRequest["studyDesign"];
  dataStructures?: DataStructure[];
  surveyDesign?: boolean;
  repeatedMeasures?: boolean;
  clustered?: boolean;
  timeToEvent?: boolean;
  highDimensional?: boolean;
  text?: boolean;
  image?: boolean;
  spatial?: boolean;
  network?: boolean;
  rowCount?: number;
  featureCount?: number;
  classCount?: number;
  target?: string;
  roleHints?: ModelingDecisionRequest["roleHints"];
  tableSummary?: ModelingDecisionRequest["tableSummary"];
  backendStatus?: ModelingDecisionRequest["backendStatus"];
  priorRuns?: ModelingDecisionRequest["priorRuns"];
  explorationHandoff?: ModelingDecisionRequest["explorationHandoff"];
  literatureEvidence?: ModelingDecisionRequest["literatureEvidence"];
  feasibilityEvidence?: ModelingDecisionRequest["feasibilityEvidence"];
  highMissingness?: boolean;
  smallSample?: boolean;
  requiresInference?: boolean;
  requiresPrediction?: boolean;
  maxCandidates?: number;
}): ModelingDecisionPlan {
  return buildModelingDecisionPlan(opts);
}

export async function researchModelingFeasibilityEvidenceFromFile(pathValue: string): Promise<ModelingDecisionRequest["feasibilityEvidence"]> {
  const raw = JSON.parse(await readFile(pathValue, "utf-8")) as Record<string, unknown>;
  const candidate = raw.feasibilityGate && typeof raw.feasibilityGate === "object"
    ? raw.feasibilityGate as Record<string, unknown>
    : raw.controllerFeasibilityVerdict && typeof raw.controllerFeasibilityVerdict === "object"
      ? raw.controllerFeasibilityVerdict as Record<string, unknown>
      : raw.feasibilityEvidence && typeof raw.feasibilityEvidence === "object"
        ? raw.feasibilityEvidence as Record<string, unknown>
        : raw;
  const verdict = parseFeasibilityEvidenceVerdict(candidate.verdict);
  const status = parseFeasibilityEvidenceStatus(candidate.status, verdict);
  if (verdict === "unknown" && status === "unknown" && !Array.isArray(candidate.blockers) && !Array.isArray(candidate.warnings)) {
    throw new Error(`Unrecognized feasibility evidence artifact: ${pathValue}`);
  }
  return {
    path: pathValue,
    verdict,
    status,
    score: finiteUnitNumber(candidate.score),
    confidence: finiteUnitNumber(candidate.confidence),
    blockers: stringArray(candidate.blockers),
    warnings: stringArray(candidate.warnings),
    issueCodes: feasibilityIssueCodesFromRecord(candidate),
    requiredModifications: stringArray(candidate.requiredModifications),
    nextAction: typeof candidate.nextAction === "string" && candidate.nextAction.trim().length > 0 ? candidate.nextAction : null,
  };
}

function parseFeasibilityEvidenceVerdict(value: unknown): NonNullable<ModelingDecisionRequest["feasibilityEvidence"]>["verdict"] {
  return value === "reject"
    || value === "needs_data_profiling"
    || value === "needs_phenotype_review"
    || value === "exploratory_only"
    || value === "formal_analysis_ready"
    || value === "unknown"
    ? value
    : "unknown";
}

function parseFeasibilityEvidenceStatus(value: unknown, verdict: NonNullable<ModelingDecisionRequest["feasibilityEvidence"]>["verdict"]): NonNullable<ModelingDecisionRequest["feasibilityEvidence"]>["status"] {
  if (value === "pass" || value === "warning" || value === "block" || value === "unknown") return value;
  if (verdict === "reject") return "block";
  if (verdict === "formal_analysis_ready") return "pass";
  if (verdict !== "unknown") return "warning";
  return "unknown";
}

function finiteUnitNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : null;
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.map(item => String(item)).filter(item => item.length > 0) : [];
}

function feasibilityIssueCodesFromRecord(candidate: Record<string, unknown>): string[] {
  const explicit = stringArray(candidate.issueCodes);
  const issueObjects = Array.isArray(candidate.issues)
    ? candidate.issues
        .map(item => item && typeof item === "object" && "code" in item ? String((item as { code: unknown }).code) : "")
        .filter(item => item.length > 0)
    : [];
  const prefixed = [...stringArray(candidate.blockers), ...stringArray(candidate.warnings)]
    .map(item => item.match(/^\s*([A-Z][A-Z0-9_]{2,})\s*:/)?.[1] ?? "")
    .filter(item => item.length > 0);
  return [...new Set([...explicit, ...issueObjects, ...prefixed])];
}

export async function researchAnalysisManifestCommand(opts: { runDir: string; outPath?: string; requireReady?: boolean }): Promise<AnalysisRunManifest> {
  const manifest = await buildAnalysisRunManifest(opts);
  if (opts.requireReady && manifest.readiness !== "local_review_ready") {
    throw new Error(`analysis manifest is ${manifest.readiness}, not local_review_ready; next action: ${manifest.nextAction}`);
  }
  return manifest;
}

export function renderResearchAnalysisManifest(result: AnalysisRunManifest): string {
  return [
    `research analysis manifest: ${result.manifestId}`,
    `  kind: ${result.runKind}`,
    `  run: ${result.runId} status=${result.runStatus}`,
    `  posture: ${result.resultPosture.status ?? "(missing)"}`,
    `  readiness: ${result.readiness}`,
    `  qa: ${result.qaReadiness.status}${result.qaReadiness.failingChecks.length ? ` failing=${result.qaReadiness.failingChecks.join(",")}` : ""}`,
    `  runner: ${result.runnerCapability.status ?? "(missing)"}${result.runnerCapability.method ? ` method=${result.runnerCapability.method}` : ""}`,
    `  feasibility: ${result.feasibilityReadiness.status}; verdict=${result.feasibilityReadiness.verdict ?? "(missing)"}`,
    `  method decision: ${result.methodDecisionReadiness.status}; verdict=${result.methodDecisionReadiness.verdict ?? "(missing)"} role=${result.methodDecisionReadiness.requestedRole ?? "(missing)"}`,
    `  artifacts: ${result.artifactCompleteness.status}; missing=${result.artifactCompleteness.missingRequired.join(",") || "(none)"}`,
    `  companions: ${result.companionReadiness.status}; missing=${result.companionReadiness.missingMethods.join(",") || "(none)"}`,
    `  out: ${result.outPath}`,
    `  next: ${result.nextAction}`,
  ].join("\n");
}

export function renderResearchAnalysisManifestJson(result: AnalysisRunManifest): string {
  return `${JSON.stringify({ schemaVersion: 1, analysisRunManifest: result }, null, 2)}\n`;
}

export interface ResearchAnalysisRunResult {
  schemaVersion: 1;
  outDir: string;
  route: "stats-run";
  modelingPlan: ModelingDecisionPlan;
  statsRun: StatsRunResult;
  analysisRunManifest: AnalysisRunManifest;
  postRunModelingPlan: ModelingDecisionPlan;
  generatedFiles: {
    modelingPlan: string;
    feasibilityGate?: string;
    statsRunEnvelope: string;
    feasibilityTrial: string;
    analysisManifest: string;
    postRunModelingPlan: string;
    diagnosticPaper?: string;
    diagnosticPaperQa?: string;
    propensityPaper?: string;
    propensityPaperQa?: string;
    literatureEvidence?: string;
    literatureContext?: string;
    literatureContextReport?: string;
    literatureQa?: string;
    literatureQaReport?: string;
  };
  nextAction: string;
}

export async function researchAnalysisRunCommand(opts: {
  question: string;
  method: StatsMethod;
  dataPath: string;
  outDir: string;
  outcome?: string;
  exposure?: string;
  group?: string;
  outcomeThreshold?: number;
  exposureThreshold?: number;
  variables?: string[];
  covariates?: string[];
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
  exactCovariates?: string[];
  estimand?: "ATE" | "ATT";
  matchRatio?: number;
  caliper?: number;
  replacement?: boolean;
  trimThreshold?: number;
  stabilizeWeights?: boolean;
  bootstrapReplicates?: number;
  validationColumn?: string;
  validationValue?: string;
  validationTime?: string;
  validationCutoff?: number;
  surveyDesign?: boolean;
  allowSurveyApproximation?: boolean;
  methodSelectionPath?: string;
  analysisSpecPath?: string;
  literaturePath?: string;
  requireBound?: boolean;
  allowBlockedFeasibility?: boolean;
  alpha?: number;
  python?: string;
}): Promise<ResearchAnalysisRunResult> {
  const outDir = path.resolve(opts.outDir);
  await mkdir(outDir, { recursive: true });
  if (opts.requireBound && !opts.methodSelectionPath && !opts.analysisSpecPath) {
    throw new Error("analysis-run --require-bound requires --method-selection or --analysis-spec so execution is tied to upstream method/spec evidence.");
  }
  const initialGoal = goalForStatsAnalysisRun(opts.method, opts.group, opts.exposure);
  const initialOutcomeType = outcomeTypeForStatsAnalysisRun(opts.method);
  const initialStudyDesign = opts.method === "diagnostic-accuracy" ? "diagnostic" : undefined;
  const initialTableSummary = await researchTableSummaryCommand({ file: opts.dataPath, python: opts.python }).catch(() => null);
  const initialLiteratureContext = opts.literaturePath
    ? await researchLiteratureContextCommand({ literaturePath: opts.literaturePath, question: opts.question })
    : null;
  const preRunFeasibilityGate = await evaluateFeasibilityGate({
    question: opts.question,
    method: opts.method,
    dataPath: opts.dataPath,
    tableSummary: initialTableSummary,
    outcome: opts.outcome,
    exposure: opts.exposure,
    group: opts.group,
    outcomeThreshold: opts.outcomeThreshold,
    exposureThreshold: opts.exposureThreshold,
    variables: opts.variables ?? [],
    covariates: opts.covariates ?? [],
    time: opts.time,
    start: opts.start,
    stop: opts.stop,
    event: opts.event,
    id: opts.id,
    strata: opts.strata,
    cluster: opts.cluster,
    period: opts.period,
    post: opts.post,
    runningVariable: opts.runningVariable,
    cutoff: opts.cutoff,
    instrument: opts.instrument,
    weight: opts.weight,
    offset: opts.offset,
    exactCovariates: opts.exactCovariates ?? [],
    surveyDesign: opts.surveyDesign ?? false,
    allowSurveyApproximation: opts.allowSurveyApproximation ?? false,
    python: opts.python,
  }).catch(() => null);
  const feasibilityGatePath = preRunFeasibilityGate ? path.join(outDir, "feasibility-gate.json") : null;
  if (preRunFeasibilityGate && feasibilityGatePath) {
    await writeFile(feasibilityGatePath, renderResearchFeasibilityGateJson(preRunFeasibilityGate));
  }
  const preRunFeasibilityEvidence = preRunFeasibilityGate && feasibilityGatePath
    ? feasibilityGateToModelingEvidence(preRunFeasibilityGate, feasibilityGatePath)
    : undefined;
  const modelingPlan = buildModelingDecisionPlan({
    question: opts.question,
    goal: initialGoal,
    outcomeType: initialOutcomeType,
    studyDesign: initialStudyDesign,
    dataStructures: ["single_table"],
    surveyDesign: opts.surveyDesign ?? false,
    target: opts.outcome,
    roleHints: analysisRunRoleHints(opts),
    tableSummary: tableSummaryForModeling(initialTableSummary),
    requiresInference: true,
    literatureEvidence: initialLiteratureContext ? literatureContextToModelingEvidence(initialLiteratureContext) : undefined,
    feasibilityEvidence: preRunFeasibilityEvidence,
    priorRuns: [],
  });
  const modelingPlanPath = path.join(outDir, "modeling-plan.json");
  await writeFile(modelingPlanPath, `${JSON.stringify({ schemaVersion: 1, modelingPlan }, null, 2)}\n`);
  if (preRunFeasibilityGate?.status === "block" && opts.allowBlockedFeasibility !== true) {
    const details = preRunFeasibilityGate.blockers.length
      ? preRunFeasibilityGate.blockers.slice(0, 3).join("; ")
      : preRunFeasibilityGate.nextAction;
    throw new Error(`analysis-run feasibility gate blocked execution before stats-run: ${details}. Review ${feasibilityGatePath ?? "feasibility-gate.json"} or rerun with --allow-blocked-feasibility for an explicit negative/debug run.`);
  }
  const statsOutDir = path.join(outDir, "stats-run");
  const statsRun = await runStatsMethod({
    schemaVersion: 1,
    method: opts.method,
    dataPath: opts.dataPath,
    outcome: opts.outcome,
    exposure: opts.exposure,
    group: opts.group,
    outcomeThreshold: opts.outcomeThreshold,
    exposureThreshold: opts.exposureThreshold,
    variables: opts.variables ?? [],
    covariates: opts.covariates ?? [],
    time: opts.time,
    start: opts.start,
    stop: opts.stop,
    event: opts.event,
    id: opts.id,
    strata: opts.strata,
    cluster: opts.cluster,
    period: opts.period,
    post: opts.post,
    runningVariable: opts.runningVariable,
    cutoff: opts.cutoff,
    instrument: opts.instrument,
    alphaPenalty: opts.alphaPenalty,
    l1Ratio: opts.l1Ratio,
    weight: opts.weight,
    offset: opts.offset,
    exactCovariates: opts.exactCovariates ?? [],
    estimand: opts.estimand ?? "ATT",
    matchRatio: opts.matchRatio ?? 1,
    caliper: opts.caliper,
    replacement: opts.replacement ?? false,
    trimThreshold: opts.trimThreshold ?? 0.01,
    stabilizeWeights: opts.stabilizeWeights ?? true,
    bootstrapReplicates: opts.bootstrapReplicates,
    validationColumn: opts.validationColumn,
    validationValue: opts.validationValue,
    validationTime: opts.validationTime,
    validationCutoff: opts.validationCutoff,
    surveyDesign: opts.surveyDesign ?? false,
    allowSurveyApproximation: opts.allowSurveyApproximation ?? false,
    methodSelectionPath: opts.methodSelectionPath,
    analysisSpecPath: opts.analysisSpecPath,
    outDir: statsOutDir,
    alpha: opts.alpha ?? 0.05,
    python: opts.python,
  } satisfies StatsRunRequest);
  const statsEnvelopePath = path.join(outDir, "stats-run-envelope.json");
  await writeFile(statsEnvelopePath, `${JSON.stringify({ schemaVersion: 1, statsRun }, null, 2)}\n`);
  const feasibilityTrial = buildAnalysisFeasibilityTrial({
    question: opts.question,
    dataPath: opts.dataPath,
    method: opts.method,
    requestedVariables: analysisRunRequestedVariables(opts),
    statsRun,
  });
  const feasibilityTrialPath = path.join(outDir, "feasibility-trial.json");
  await writeFile(feasibilityTrialPath, `${JSON.stringify({ schemaVersion: 1, feasibilityTrial }, null, 2)}\n`);
  const analysisRunManifest = await buildAnalysisRunManifest({ runDir: statsOutDir });
  const canWriteReaderPaper = statsRun.status === "succeeded";
  const diagnosticPaperFiles = canWriteReaderPaper && opts.method === "diagnostic-accuracy"
    ? await writeDiagnosticAnalysisPaper({ outDir, question: opts.question, statsRun, analysisRunManifest })
    : {};
  const propensityPaperFiles = canWriteReaderPaper && (opts.method === "propensity-score-matching" || opts.method === "propensity-score-weighting")
    ? await writePropensityAnalysisPaper({ outDir, question: opts.question, statsRun, analysisRunManifest })
    : {};
  const readerPaperPath: string | undefined = typeof (diagnosticPaperFiles as { diagnosticPaper?: unknown }).diagnosticPaper === "string"
    ? (diagnosticPaperFiles as { diagnosticPaper: string }).diagnosticPaper
    : typeof (propensityPaperFiles as { propensityPaper?: unknown }).propensityPaper === "string"
      ? (propensityPaperFiles as { propensityPaper: string }).propensityPaper
      : undefined;
  const literatureFiles = opts.literaturePath
    ? await attachLiteratureEvidenceToAnalysisRun({
      outDir,
      question: opts.question,
      literaturePath: opts.literaturePath,
      paperPath: readerPaperPath,
    })
    : {};
  const localLiteratureContextPath = typeof (literatureFiles as { literatureContext?: unknown }).literatureContext === "string"
    ? (literatureFiles as { literatureContext: string }).literatureContext
    : undefined;
  const finalAnalysisRunManifest = opts.method === "diagnostic-accuracy" || opts.method === "propensity-score-matching" || opts.method === "propensity-score-weighting"
    ? await buildAnalysisRunManifest({ runDir: statsOutDir })
    : analysisRunManifest;
  const postRunModelingPlan = buildModelingDecisionPlan({
    question: opts.question,
    goal: initialGoal,
    outcomeType: initialOutcomeType,
    studyDesign: initialStudyDesign,
    dataStructures: ["single_table"],
    surveyDesign: opts.surveyDesign ?? false,
    target: opts.outcome,
    roleHints: analysisRunRoleHints(opts),
    tableSummary: tableSummaryForModeling(initialTableSummary),
    requiresInference: true,
    literatureEvidence: initialLiteratureContext ? literatureContextToModelingEvidence(initialLiteratureContext, localLiteratureContextPath) : undefined,
    feasibilityEvidence: preRunFeasibilityEvidence,
    priorRuns: [{
      path: path.join(statsOutDir, "stats-run.json"),
      kind: "stats",
      status: statsRun.status,
      posture: statsRun.resultPosture?.status ?? null,
      methodOrModel: statsRun.method,
      issueCodes: statsRun.issues.map(issue => issue.code),
      errors: statsRun.errors,
    }],
  });
  const postRunPath = path.join(outDir, "modeling-plan-after-prior.json");
  await writeFile(postRunPath, `${JSON.stringify({ schemaVersion: 1, modelingPlan: postRunModelingPlan }, null, 2)}\n`);
  return {
    schemaVersion: 1,
    outDir,
    route: "stats-run",
    modelingPlan,
    statsRun,
    analysisRunManifest: finalAnalysisRunManifest,
    postRunModelingPlan,
    generatedFiles: {
      modelingPlan: modelingPlanPath,
      ...(feasibilityGatePath ? { feasibilityGate: feasibilityGatePath } : {}),
      statsRunEnvelope: statsEnvelopePath,
      feasibilityTrial: feasibilityTrialPath,
      analysisManifest: finalAnalysisRunManifest.outPath,
      postRunModelingPlan: postRunPath,
      ...diagnosticPaperFiles,
      ...propensityPaperFiles,
      ...literatureFiles,
    },
    nextAction: postRunModelingPlan.nextAction,
  };
}

function analysisRunRequestedVariables(opts: Parameters<typeof researchAnalysisRunCommand>[0]): string[] {
  return uniqueStrings([
    opts.outcome,
    opts.exposure,
    opts.group,
    opts.time,
    opts.start,
    opts.stop,
    opts.event,
    opts.id,
    opts.strata,
    opts.cluster,
    opts.period,
    opts.post,
    opts.runningVariable,
    opts.instrument,
    opts.offset,
    opts.validationColumn,
    opts.validationTime,
    ...(opts.variables ?? []),
    ...(opts.covariates ?? []),
    ...(opts.exactCovariates ?? []),
  ].filter((value): value is string => typeof value === "string" && value.length > 0));
}

function feasibilityGateToModelingEvidence(result: FeasibilityGateResult, artifactPath: string): ModelingDecisionRequest["feasibilityEvidence"] {
  return {
    path: artifactPath,
    verdict: result.verdict,
    status: result.status,
    score: result.score,
    confidence: result.confidence,
    blockers: result.blockers,
    warnings: result.warnings,
    issueCodes: result.issues.map(issue => issue.code),
    requiredModifications: result.requiredModifications,
    nextAction: result.nextAction,
  };
}

function analysisRunRoleHints(opts: Parameters<typeof researchAnalysisRunCommand>[0]): ModelingDecisionRequest["roleHints"] {
  return {
    outcome: opts.outcome,
    exposure: opts.exposure,
    group: opts.group,
    time: opts.time,
    start: opts.start,
    stop: opts.stop,
    event: opts.event,
    id: opts.id,
    cluster: opts.cluster,
    strata: opts.strata,
    period: opts.period,
    post: opts.post,
    runningVariable: opts.runningVariable,
    instrument: opts.instrument,
    weight: opts.weight,
    offset: opts.offset,
    variables: opts.variables ?? [],
    covariates: opts.covariates ?? [],
    exactCovariates: opts.exactCovariates ?? [],
  };
}

function tableSummaryForModeling(summary: ResearchTableSummary | null): ModelingDecisionRequest["tableSummary"] | undefined {
  if (!summary) return undefined;
  return {
    rowCount: summary.rowCount,
    columnCount: summary.columnCount,
    columns: summary.columns.map(column => ({
      ...column,
      valueCounts: column.valueCounts ?? [],
      sampleValues: column.sampleValues ?? [],
    })),
  };
}

function uniqueStrings(values: string[]): string[] {
  return Array.from(new Set(values));
}

function buildAnalysisFeasibilityTrial(opts: {
  question: string;
  dataPath: string;
  method: StatsMethod;
  requestedVariables: string[];
  statsRun: StatsRunResult;
}): {
  schemaVersion: 1;
  status: "feasible_for_local_review" | "needs_methods_review" | "blocked";
  question: string;
  dataPath: string;
  method: StatsMethod;
  rowCount: number;
  completeCaseN: number;
  requestedVariables: string[];
  observedVariables: string[];
  missingRequestedVariables: string[];
  issueCodes: string[];
  semanticIssueCodes: string[];
  blockerIssueCodes: string[];
  feasibilityRatio: number | null;
  nextAction: string;
} {
  const observedVariables = uniqueStrings(opts.statsRun.variables);
  const missingRequestedVariables = opts.requestedVariables.filter(variable => !observedVariables.includes(variable));
  const issueCodes = opts.statsRun.issues.map(issue => issue.code);
  const semanticIssueCodes = issueCodes.filter(code => code.startsWith("SEMANTIC_"));
  const blockerIssueCodes = opts.statsRun.issues.filter(issue => issue.severity === "blocker").map(issue => issue.code);
  const feasibilityRatio = opts.statsRun.rowCount > 0 ? opts.statsRun.completeCaseN / opts.statsRun.rowCount : null;
  const status = opts.statsRun.status === "failed" || blockerIssueCodes.length || missingRequestedVariables.length
    ? "blocked"
    : semanticIssueCodes.length || opts.statsRun.issues.some(issue => issue.severity === "warning") || opts.statsRun.completeCaseN < 30
      ? "needs_methods_review"
      : "feasible_for_local_review";
  return {
    schemaVersion: 1,
    status,
    question: opts.question,
    dataPath: path.resolve(opts.dataPath),
    method: opts.method,
    rowCount: opts.statsRun.rowCount,
    completeCaseN: opts.statsRun.completeCaseN,
    requestedVariables: opts.requestedVariables,
    observedVariables,
    missingRequestedVariables,
    issueCodes,
    semanticIssueCodes,
    blockerIssueCodes,
    feasibilityRatio,
    nextAction: status === "feasible_for_local_review"
      ? "Proceed to method QA/manuscript review under the declared local-review boundary."
      : status === "needs_methods_review"
        ? "Review warning-level feasibility, missingness, sparse cells, or semantic plausibility before paper promotion."
        : "Resolve blockers before treating this idea as analyzable on the current dataset.",
  };
}

async function attachLiteratureEvidenceToAnalysisRun(opts: {
  outDir: string;
  question: string;
  literaturePath: string;
  paperPath?: string;
}): Promise<{ literatureEvidence: string; literatureContext: string; literatureContextReport: string; literatureQa: string; literatureQaReport: string }> {
  const literatureEvidence = path.join(opts.outDir, "literature-search.json");
  const literatureContext = path.join(opts.outDir, "literature-context.json");
  const literatureContextReport = path.join(opts.outDir, "literature-context.md");
  const literatureQa = path.join(opts.outDir, "literature-qa.json");
  const literatureQaReport = path.join(opts.outDir, "literature-qa.md");
  await writeFile(literatureEvidence, await readFile(path.resolve(opts.literaturePath), "utf-8"), "utf-8");
  await researchLiteratureContextCommand({
    literaturePath: literatureEvidence,
    question: opts.question,
    outPath: literatureContext,
    reportPath: literatureContextReport,
  });
  await researchLiteratureQaCommand({
    question: opts.question,
    literaturePath: literatureEvidence,
    paperPath: opts.paperPath,
    outPath: literatureQa,
    reportPath: literatureQaReport,
  });
  return { literatureEvidence, literatureContext, literatureContextReport, literatureQa, literatureQaReport };
}

function literatureContextToModelingEvidence(
  context: ResearchLiteratureContext,
  artifactPath?: string,
): ModelingDecisionRequest["literatureEvidence"] {
  return {
    path: artifactPath ?? context.outPath ?? context.literaturePath,
    status: context.status,
    evidenceStrength: context.evidenceStrength,
    sourceCount: context.sourceSummary.sourceCount,
    highQualitySourceCount: context.sourceSummary.highQualitySourceCount,
    latestPublicationYear: context.sourceSummary.latestPublicationYear,
    questionTokenCoverage: context.quality.questionTokenCoverage,
    designSignals: context.designSignals,
    methodSignals: context.methodSignals,
    planningImplications: context.planningImplications,
    followUpSearches: context.followUpSearches,
    issueCodes: context.issues.filter(issue => issue.status !== "pass").map(issue => issue.id),
  };
}

async function writeDiagnosticAnalysisPaper(opts: {
  outDir: string;
  question: string;
  statsRun: StatsRunResult;
  analysisRunManifest: AnalysisRunManifest;
}): Promise<{ diagnosticPaper: string; diagnosticPaperQa: string }> {
  const paperPath = path.join(opts.outDir, "paper.md");
  const qaPath = path.join(opts.outDir, "paper-qa.json");
  const first = opts.statsRun.estimates[0] ?? {};
  const diagnostics = opts.statsRun.diagnostics as Record<string, unknown>;
  const reference = String(first.reference ?? opts.statsRun.variables[0] ?? "the reference measure");
  const indexTest = String(first.term ?? opts.statsRun.variables[1] ?? "the index measure");
  const referencePositive = String(diagnostics.reference_positive_level ?? "the positive reference definition");
  const indexPositive = String(diagnostics.test_positive_level ?? "the positive index-test definition");
  const completeCaseN = opts.statsRun.completeCaseN;
  const sparseCells = opts.statsRun.issues.some(issue => issue.code === "SPARSE_DIAGNOSTIC_CELL");
  const paper = [
    `# Diagnostic Accuracy of ${indexTest} Against ${reference}`,
    "",
    "## Summary",
    "",
    `This report estimates how well ${indexTest} identified records meeting the ${reference} reference definition in the analyzed table. It is a diagnostic accuracy analysis of local data, not a clinical screening recommendation or validation of a deployable diagnostic rule.`,
    "",
    `Main finding: in ${completeCaseN} complete records, sensitivity was ${formatEstimateWithCi(first.sensitivity, first.sensitivity_ci_low, first.sensitivity_ci_high)} and specificity was ${formatEstimateWithCi(first.specificity, first.specificity_ci_low, first.specificity_ci_high)}. Positive and negative predictive values depend on the prevalence in this analyzed table.`,
    "",
    "## Research Question",
    "",
    opts.question,
    "",
    "## Methods",
    "",
    `The reference standard was ${reference}; records were considered reference-positive when ${referencePositive}. The index test was ${indexTest}; records were considered test-positive when ${indexPositive}.`,
    "",
    `The analysis used complete records for both measures (N = ${completeCaseN}). It formed a 2 x 2 diagnostic accuracy table and estimated sensitivity, specificity, positive predictive value, negative predictive value, likelihood ratios, and prevalence in the analyzed table. Wilson binomial intervals were used for sensitivity, specificity, PPV, and NPV when available.`,
    typeof diagnostics.reference_threshold === "number" || typeof diagnostics.test_threshold === "number"
      ? `Thresholds were applied before the 2 x 2 table was formed: ${reference} was positive at ${formatValue(diagnostics.reference_threshold)} and ${indexTest} was positive at ${formatValue(diagnostics.test_threshold)}.`
      : "The input table already contained binary positive/negative indicators for the reference standard and index test.",
    "",
    "## Results",
    "",
    `The diagnostic table contained ${formatValue(first.true_positive)} true positives, ${formatValue(first.false_positive)} false positives, ${formatValue(first.true_negative)} true negatives, and ${formatValue(first.false_negative)} false negatives.`,
    "",
    `- Sensitivity: ${formatEstimateWithCi(first.sensitivity, first.sensitivity_ci_low, first.sensitivity_ci_high)}.`,
    `- Specificity: ${formatEstimateWithCi(first.specificity, first.specificity_ci_low, first.specificity_ci_high)}.`,
    `- Positive predictive value: ${formatEstimateWithCi(first.positive_predictive_value, first.positive_predictive_value_ci_low, first.positive_predictive_value_ci_high)}.`,
    `- Negative predictive value: ${formatEstimateWithCi(first.negative_predictive_value, first.negative_predictive_value_ci_low, first.negative_predictive_value_ci_high)}.`,
    `- Positive likelihood ratio: ${formatValue(first.positive_likelihood_ratio)}.`,
    `- Negative likelihood ratio: ${formatValue(first.negative_likelihood_ratio)}.`,
    `- Prevalence in analyzed table: ${formatValue(first.prevalence)}.`,
    "",
    "## Interpretation",
    "",
    `These results describe agreement between ${indexTest} and ${reference} in the analyzed records. They do not establish external validity, clinical utility, causal interpretation, or a recommendation to screen.`,
    sparseCells
      ? "One or more diagnostic cells were sparse, so the accuracy estimates may be unstable and should be reviewed with caution."
      : "No sparse diagnostic-cell warning was detected in this run.",
    "",
    "## Limitations",
    "",
    "This analysis used only the rows available in the supplied table and should not be generalized without external validation. Predictive values are prevalence-dependent. Threshold-derived classifications can be sensitive to the chosen cut points. This report does not assess clinical utility, calibration across populations, harms, or implementation feasibility.",
    "",
    "## Reproducibility Note",
    "",
    "The companion files in this packet contain the numerical estimates, quality checks, run metadata, and file hashes needed to audit or rerun the analysis.",
    "",
  ].join("\n");
  await writeFile(paperPath, paper, "utf-8");
  const forbiddenTerms = readerFacingPaperJargonHits(paper);
  const checks = [
    { id: "reader-facing-summary", status: paper.includes("## Summary") && /Main finding:/i.test(paper) ? "pass" : "fail" },
    { id: "reference-standard", status: paper.includes("reference standard") ? "pass" : "fail" },
    { id: "index-test", status: paper.includes("index test") ? "pass" : "fail" },
    { id: "predictive-value-prevalence", status: /predictive values are prevalence-dependent|positive and negative predictive values depend on the prevalence/i.test(paper) ? "pass" : "fail" },
    { id: "intervals", status: /Wilson binomial intervals/i.test(paper) && typeof first.sensitivity_ci_low === "number" ? "pass" : "warning" },
    { id: "screening-overclaim-boundary", status: /not a clinical screening recommendation/i.test(paper) ? "pass" : "fail" },
    { id: "reader-facing-language", status: forbiddenTerms.length === 0 ? "pass" : "fail", hits: forbiddenTerms },
    { id: "manifest-readiness", status: opts.analysisRunManifest.readiness === "local_review_ready" ? "pass" : "warning" },
  ] as Array<{ id: string; status: "pass" | "warning" | "fail" }>;
  const qa = {
    schemaVersion: 1,
    status: checks.some(check => check.status === "fail") ? "fail" : checks.some(check => check.status === "warning") ? "warning" : "pass",
    checks,
  };
  await writeFile(qaPath, `${JSON.stringify(qa, null, 2)}\n`, "utf-8");
  return { diagnosticPaper: paperPath, diagnosticPaperQa: qaPath };
}

async function writePropensityAnalysisPaper(opts: {
  outDir: string;
  question: string;
  statsRun: StatsRunResult;
  analysisRunManifest: AnalysisRunManifest;
}): Promise<{ propensityPaper: string; propensityPaperQa: string }> {
  const paperPath = path.join(opts.outDir, "paper.md");
  const qaPath = path.join(opts.outDir, "paper-qa.json");
  const first = opts.statsRun.estimates[0] ?? {};
  const diagnostics = opts.statsRun.diagnostics as Record<string, unknown>;
  const balance = diagnostics.balance as Record<string, unknown>;
  const positivity = diagnostics.positivity as Record<string, unknown>;
  const missingness = diagnostics.missingness as Record<string, unknown>;
  const matching = diagnostics.matching as Record<string, unknown> | undefined;
  const weighting = diagnostics.weighting as Record<string, unknown> | undefined;
  const treatment = String(diagnostics.treatment_column ?? first.term ?? "the treatment/exposure");
  const covariates = Array.isArray(diagnostics.covariates) ? diagnostics.covariates.map(String) : [];
  const exactCovariates = Array.isArray(diagnostics.exact_covariates) ? diagnostics.exact_covariates.map(String) : [];
  const paper = [
    `# Propensity Score ${opts.statsRun.method === "propensity-score-matching" ? "Matching" : "Weighting"} Analysis`,
    "",
    "## Summary",
    "",
    `This local observational analysis evaluated whether ${treatment} differed in the outcome after balancing measured baseline covariates. It is intended for causal-design review, not as proof of a treatment effect.`,
    "",
    `Main finding: the ${String(first.estimand ?? "declared")} contrast estimated ${String(first.effect_measure ?? "a treatment contrast")} of ${formatValue(first.estimate)} in ${formatValue(first.treated_n)} treated and ${formatValue(first.control_n)} control records used by the adjusted analysis.`,
    "",
    "## Research Question",
    "",
    opts.question,
    "",
    "## Methods",
    "",
    `The treatment or exposure was ${treatment}. The propensity model used the following measured baseline covariates: ${covariates.join(", ") || "(none recorded)"}.`,
    exactCovariates.length ? `Matching also required exact agreement on: ${exactCovariates.join(", ")}.` : "No exact-match covariates were declared.",
    opts.statsRun.method === "propensity-score-matching"
      ? `The analysis used nearest-neighbor propensity score matching. Matching diagnostics recorded ${formatValue(matching?.matched_treated)} matched treated records, ${formatValue(matching?.matched_controls)} matched controls, and ${formatValue(matching?.unmatched_treated)} unmatched treated records.`
      : `The analysis used inverse-probability treatment weighting. Weight diagnostics recorded an effective sample size of ${formatValue(weighting?.effective_sample_size)} and weight range ${formatValue(weighting?.min_weight)} to ${formatValue(weighting?.max_weight)}.`,
    `Complete-case retention for treatment, outcome, and propensity covariates was ${formatValue(missingness?.complete_case_fraction)}.`,
    "",
    "## Results",
    "",
    `- Estimated contrast: ${formatValue(first.estimate)}.`,
    typeof first.odds_ratio === "number" ? `- Odds ratio: ${formatEstimateWithCi(first.odds_ratio, first.or_ci_low, first.or_ci_high)}.` : null,
    typeof first.risk_difference === "number" ? `- Risk difference: ${formatValue(first.risk_difference)}.` : null,
    typeof first.mean_difference === "number" ? `- Mean difference: ${formatEstimateWithCi(first.mean_difference, first.ci_low, first.ci_high)}.` : null,
    `- Maximum absolute standardized mean difference before adjustment: ${formatValue(balance?.max_abs_smd_before)}.`,
    `- Maximum absolute standardized mean difference after adjustment: ${formatValue(balance?.max_abs_smd_after)}.`,
    `- Covariate terms above absolute SMD 0.10 after adjustment: ${formatValue(balance?.covariates_over_0_1_after)}.`,
    `- Common-support fraction: ${formatValue(positivity?.common_support_fraction)}.`,
    "",
    "## Interpretation",
    "",
    "The balance diagnostics describe measured baseline covariate balance after matching or weighting. They do not remove unmeasured confounding, guarantee correct treatment timing, or establish causality without a reviewed target-trial design, exchangeability argument, positivity review, and sensitivity analysis.",
    "",
    "## Limitations",
    "",
    "This analysis uses complete cases and only the measured covariates supplied to the propensity model. Covariates measured after treatment, unmeasured confounding, poor overlap, missingness, and model misspecification can bias the contrast. P-values and intervals from this standard route should be reviewed as local model-based summaries, not definitive causal uncertainty.",
    "",
    "## Reproducibility Note",
    "",
    "The companion files include propensity scores, overlap bins, balance diagnostics, matched pairs or weights, run metadata, quality checks, and file hashes.",
    "",
  ].filter(line => line !== null && line !== undefined).join("\n");
  await writeFile(paperPath, paper, "utf-8");
  const forbiddenTerms = readerFacingPaperJargonHits(paper);
  const checks = [
    { id: "reader-facing-summary", status: paper.includes("## Summary") && /Main finding:/i.test(paper) ? "pass" : "fail" },
    { id: "balance-diagnostics", status: typeof balance?.max_abs_smd_after === "number" ? "pass" : "fail" },
    { id: "positivity-overlap", status: typeof positivity?.common_support_fraction === "number" ? "pass" : "fail" },
    { id: "causal-boundary", status: /not as proof of a treatment effect|do not remove unmeasured confounding/i.test(paper) ? "pass" : "fail" },
    { id: "reader-facing-language", status: forbiddenTerms.length === 0 ? "pass" : "fail", hits: forbiddenTerms },
    { id: "manifest-readiness", status: opts.analysisRunManifest.artifactCompleteness.status === "pass" ? "pass" : "warning" },
  ] as Array<{ id: string; status: "pass" | "warning" | "fail"; hits?: string[] }>;
  const qa = {
    schemaVersion: 1,
    status: checks.some(check => check.status === "fail") ? "fail" : checks.some(check => check.status === "warning") ? "warning" : "pass",
    checks,
  };
  await writeFile(qaPath, `${JSON.stringify(qa, null, 2)}\n`, "utf-8");
  return { propensityPaper: paperPath, propensityPaperQa: qaPath };
}

function readerFacingPaperJargonHits(text: string): string[] {
  const forbidden = [
    /\bAgenteer\b/i,
    /\bAnalysisSpec\b/i,
    /\bresult posture\b/i,
    /\blocal_review_ready\b/i,
    /\bartifact posture\b/i,
    /\brunner record\b/i,
    /\btask envelope\b/i,
    /\bevidence receipt\b/i,
    /\binterop\b/i,
    /\bspec-governed\b/i,
    /\bpaper-run\b/i,
  ];
  return forbidden
    .map(pattern => text.match(pattern)?.[0])
    .filter((match): match is string => Boolean(match));
}

function formatEstimateWithCi(value: unknown, low: unknown, high: unknown): string {
  if (typeof value === "number" && typeof low === "number" && typeof high === "number") {
    return `${formatValue(value)} (${formatValue(low)}, ${formatValue(high)})`;
  }
  return formatValue(value);
}

function formatValue(value: unknown): string {
  if (typeof value === "number") return Number.isInteger(value) ? String(value) : value.toPrecision(4);
  if (value === null || typeof value === "undefined") return "(missing)";
  return String(value);
}

function statsQaStatus(statsRun: StatsRunResult): string {
  const qa = statsRun.artifacts.find(artifact => artifact.kind === "qa");
  return qa ? "see stats-qa.json" : "(missing)";
}

export function renderResearchAnalysisRun(result: ResearchAnalysisRunResult): string {
  return [
    `research analysis run: ${result.route}`,
    `  out: ${result.outDir}`,
    `  stats: ${result.statsRun.status} posture=${result.statsRun.resultPosture?.status ?? "(missing)"}`,
    `  manifest: ${result.analysisRunManifest.readiness} artifacts=${result.analysisRunManifest.artifactCompleteness.status}`,
    `  post-run route: ${result.postRunModelingPlan.routeRecommendation.route}`,
    `  next: ${result.nextAction}`,
  ].join("\n");
}

export function renderResearchAnalysisRunJson(result: ResearchAnalysisRunResult): string {
  return `${JSON.stringify({ schemaVersion: 1, analysisRun: result }, null, 2)}\n`;
}

export interface ResearchGoldenRunResult {
  schemaVersion: 1;
  outDir: string;
  status: "local_review_ready" | "needs_methods_review" | "blocked";
  question: string;
  method: StatsMethod;
  stages: Array<{
    id: "analysis-run" | "analysis-manifest" | "method-qa" | "manuscript" | "run-inspect" | "analysis-benchmark";
    status: "pass" | "warning" | "fail";
    summary: string;
    evidenceRefs: string[];
  }>;
  analysisRun: ResearchAnalysisRunResult;
  analysisManifest: AnalysisRunManifest;
  methodQa: MethodQaResult;
  manuscript: ManuscriptResult;
  inspection: RunInspectionResult;
  benchmark: ResearchAnalysisBenchmarkResult;
  finalReadiness: {
    readiness: RunInspectionResult["readiness"];
    blockers: number;
    warnings: number;
	    methodQaStatus: MethodQaResult["overallStatus"];
	    manuscriptQaStatus: MethodQaStatus;
	    feasibilityReadinessStatus: AnalysisRunManifest["feasibilityReadiness"]["status"];
	    feasibilityVerdict: string | null;
	    feasibilityWarnings: string[];
	    feasibilityBlockers: string[];
	    statsQaReadinessStatus: string | null;
	    figureReadinessStatus: string | null;
    figureCount: number | null;
    figureFailingIds: string[];
    figureWarningIds: string[];
    benchmarkStatus: ResearchAnalysisBenchmarkResult["status"];
    routeCoveragePosture: ResearchAnalysisBenchmarkResult["routeCoverage"]["posture"];
    recommendedCommands: string[];
  };
  generatedFiles: {
    goldenRun: string;
    goldenReport: string;
    methodSelection?: string;
    modelingPlan: string;
    feasibilityGate?: string;
    statsRun: string;
    analysisManifest: string;
    methodQa: string;
    methodQaReport: string;
    manuscript: string | null;
    manuscriptQa: string | null;
    runInspection: string;
    runInspectionReport: string;
    benchmark: string;
    benchmarkReport: string;
  };
  nextAction: string;
}

export async function researchGoldenRunCommand(opts: Parameters<typeof researchAnalysisRunCommand>[0] & {
  outPath?: string;
  reportPath?: string;
  requireReady?: boolean;
}): Promise<ResearchGoldenRunResult> {
  const outDir = path.resolve(opts.outDir);
  await mkdir(outDir, { recursive: true });
  let methodSelectionPath = opts.methodSelectionPath;
  if (!methodSelectionPath && !opts.analysisSpecPath) {
    methodSelectionPath = path.join(outDir, "method-selection.json");
    await researchMethodSelectCommand({
      question: opts.question,
      goal: methodSelectionGoalForStatsAnalysisRun(opts.method, opts.group, opts.exposure),
      outcomeType: outcomeTypeForStatsAnalysisRun(opts.method),
      studyDesign: opts.method === "diagnostic-accuracy" ? "diagnostic" : undefined,
      dataStructures: ["single_table"],
      outPath: methodSelectionPath,
    });
  }
  const analysisRun = await researchAnalysisRunCommand({
    ...opts,
    methodSelectionPath,
    requireBound: opts.requireBound ?? true,
  });
  const statsRunDir = path.join(outDir, "stats-run");
  const manifestPath = path.join(statsRunDir, "analysis-run-manifest.json");
  const methodQaPath = path.join(statsRunDir, "method-qa.json");
  const methodQaReportPath = path.join(statsRunDir, "method-qa.md");
  const manuscriptPath = path.join(statsRunDir, "manuscript.md");
  const manuscriptQaPath = path.join(statsRunDir, "manuscript-qa.json");
  const inspectionPath = path.join(statsRunDir, "run-inspection.json");
  const inspectionReportPath = path.join(statsRunDir, "run-inspection.md");
  const benchmarkPath = path.join(outDir, "analysis-benchmark.json");
  const benchmarkReportPath = path.join(outDir, "analysis-benchmark.md");
  const goldenRunPath = opts.outPath ? path.resolve(opts.outPath) : path.join(outDir, "golden-run.json");
  const goldenReportPath = opts.reportPath ? path.resolve(opts.reportPath) : path.join(outDir, "golden-run.md");

  const analysisManifest = await researchAnalysisManifestCommand({
    runDir: statsRunDir,
    outPath: manifestPath,
    requireReady: false,
  });
  await researchMethodQaCommand({
    runDir: statsRunDir,
    outPath: methodQaPath,
    reportPath: methodQaReportPath,
  });
  const manuscript = await researchManuscriptCommand({
    runDir: statsRunDir,
    outPath: manuscriptPath,
    qaOutPath: manuscriptQaPath,
  });
  const methodQa = await researchMethodQaCommand({
    runDir: statsRunDir,
    outPath: methodQaPath,
    reportPath: methodQaReportPath,
  });
  const inspection = await researchRunInspectCommand({
    runDir: statsRunDir,
    outPath: inspectionPath,
    reportPath: inspectionReportPath,
  });
  const benchmark = await researchAnalysisBenchmarkCommand({
    runDirs: [statsRunDir],
    requireReady: opts.requireReady === true,
    outPath: benchmarkPath,
    reportPath: benchmarkReportPath,
  });

  const status: ResearchGoldenRunResult["status"] = analysisRun.statsRun.status === "failed" || analysisManifest.readiness === "blocked" || inspection.readiness === "blocked"
    ? "blocked"
    : analysisManifest.readiness === "local_review_ready" && inspection.readiness === "local_review_ready" && methodQa.overallStatus !== "fail" && manuscript.manuscriptQa.status !== "fail"
      ? "local_review_ready"
      : "needs_methods_review";
  const stages: ResearchGoldenRunResult["stages"] = [
    {
      id: "analysis-run",
      status: analysisRun.statsRun.status === "failed" ? "fail" : analysisRun.analysisRunManifest.readiness === "local_review_ready" ? "pass" : "warning",
      summary: `stats=${analysisRun.statsRun.status}; posture=${analysisRun.statsRun.resultPosture?.status ?? "missing"}`,
      evidenceRefs: [analysisRun.generatedFiles.statsRunEnvelope, path.join(statsRunDir, "stats-run.json")],
    },
    {
      id: "analysis-manifest",
      status: analysisManifest.readiness === "blocked" ? "fail" : analysisManifest.readiness === "local_review_ready" ? "pass" : "warning",
      summary: `readiness=${analysisManifest.readiness}; next=${analysisManifest.nextAction}`,
      evidenceRefs: [analysisManifest.outPath],
    },
    {
      id: "method-qa",
      status: methodQa.overallStatus === "fail" ? "fail" : methodQa.overallStatus === "pass" ? "pass" : "warning",
      summary: `status=${methodQa.overallStatus}; readiness=${methodQa.readiness}`,
      evidenceRefs: [methodQaPath, methodQaReportPath],
    },
    {
      id: "manuscript",
      status: manuscript.manuscriptQa.status === "fail" ? "fail" : manuscript.manuscriptQa.status === "pass" ? "pass" : "warning",
      summary: `qa=${manuscript.manuscriptQa.status}; next=${manuscript.manuscriptQa.nextAction}`,
      evidenceRefs: [manuscriptPath, manuscriptQaPath],
    },
    {
      id: "run-inspect",
      status: inspection.readiness === "blocked" ? "fail" : inspection.readiness === "local_review_ready" ? "pass" : "warning",
      summary: `readiness=${inspection.readiness}; next=${inspection.nextRecommendedAction}`,
      evidenceRefs: [inspectionPath, inspectionReportPath],
    },
    {
      id: "analysis-benchmark",
      status: benchmark.status === "pass" ? "pass" : "fail",
      summary: benchmark.summary,
      evidenceRefs: [benchmarkPath, benchmarkReportPath],
    },
  ];
  const nextAction = status === "local_review_ready"
    ? "Proceed to local methods review and human decision about external sharing; do not claim external validity without additional validation."
    : status === "blocked"
      ? stages.find(stage => stage.status === "fail")?.summary ?? inspection.nextRecommendedAction
      : inspection.nextRecommendedAction || analysisManifest.nextAction || benchmark.nextAction;
  const finalReadiness: ResearchGoldenRunResult["finalReadiness"] = {
    readiness: inspection.readiness,
    blockers: inspection.blockers.length,
	    warnings: inspection.warnings.length,
	    methodQaStatus: methodQa.overallStatus,
	    manuscriptQaStatus: manuscript.manuscriptQa.status,
	    feasibilityReadinessStatus: analysisManifest.feasibilityReadiness.status,
	    feasibilityVerdict: analysisManifest.feasibilityReadiness.verdict,
	    feasibilityWarnings: analysisManifest.feasibilityReadiness.warnings,
	    feasibilityBlockers: analysisManifest.feasibilityReadiness.blockers,
	    statsQaReadinessStatus: inspection.qa.statsQaReadinessStatus,
    figureReadinessStatus: inspection.qa.figureReadinessStatus,
    figureCount: inspection.qa.figureCount,
    figureFailingIds: inspection.qa.figureFailingIds,
    figureWarningIds: inspection.qa.figureWarningIds,
    benchmarkStatus: benchmark.status,
    routeCoveragePosture: benchmark.routeCoverage.posture,
    recommendedCommands: inspection.recommendedCommands,
  };
  const result: ResearchGoldenRunResult = {
    schemaVersion: 1,
    outDir,
    status,
    question: opts.question,
    method: opts.method,
    stages,
    analysisRun,
    analysisManifest,
    methodQa,
    manuscript,
    inspection,
    benchmark,
    finalReadiness,
    generatedFiles: {
      goldenRun: goldenRunPath,
      goldenReport: goldenReportPath,
      modelingPlan: analysisRun.generatedFiles.modelingPlan,
      ...(methodSelectionPath ? { methodSelection: methodSelectionPath } : {}),
      ...(analysisRun.generatedFiles.feasibilityGate ? { feasibilityGate: analysisRun.generatedFiles.feasibilityGate } : {}),
      statsRun: path.join(statsRunDir, "stats-run.json"),
      analysisManifest: manifestPath,
      methodQa: methodQaPath,
      methodQaReport: methodQaReportPath,
      manuscript: manuscript.manuscriptPath,
      manuscriptQa: manuscript.qaPath,
      runInspection: inspectionPath,
      runInspectionReport: inspectionReportPath,
      benchmark: benchmarkPath,
      benchmarkReport: benchmarkReportPath,
    },
    nextAction,
  };
  await mkdir(path.dirname(goldenRunPath), { recursive: true });
  await writeFile(goldenRunPath, renderResearchGoldenRunJson(result));
  await mkdir(path.dirname(goldenReportPath), { recursive: true });
  await writeFile(goldenReportPath, renderResearchGoldenRun(result));
  return result;
}

export function renderResearchGoldenRun(result: ResearchGoldenRunResult): string {
  return [
    `research golden run: ${result.status}`,
    `  question: ${result.question}`,
    `  method: ${result.method}`,
    `  out: ${result.outDir}`,
	    `  final readiness: ${result.finalReadiness.readiness}; blockers=${result.finalReadiness.blockers}; warnings=${result.finalReadiness.warnings}`,
	    `  feasibility: ${result.finalReadiness.feasibilityReadinessStatus}${result.finalReadiness.feasibilityVerdict ? `; verdict=${result.finalReadiness.feasibilityVerdict}` : ""}${result.finalReadiness.feasibilityBlockers.length ? `; blockers=${result.finalReadiness.feasibilityBlockers.join(";")}` : ""}${result.finalReadiness.feasibilityWarnings.length ? `; warnings=${result.finalReadiness.feasibilityWarnings.join(";")}` : ""}`,
	    `  figure QA: ${result.finalReadiness.figureReadinessStatus ?? "(missing)"}${result.finalReadiness.figureCount === null ? "" : `; figures=${result.finalReadiness.figureCount}`}${result.finalReadiness.figureFailingIds.length ? `; failing=${result.finalReadiness.figureFailingIds.join(",")}` : ""}${result.finalReadiness.figureWarningIds.length ? `; warnings=${result.finalReadiness.figureWarningIds.join(",")}` : ""}`,
    `  stats QA readiness: ${result.finalReadiness.statsQaReadinessStatus ?? "(missing)"}`,
    `  manuscript QA: ${result.finalReadiness.manuscriptQaStatus}`,
    ...(result.finalReadiness.recommendedCommands.length
      ? result.finalReadiness.recommendedCommands.map((command, index) => `  command ${index + 1}: ${command}`)
      : ["  commands: (none)"]),
    "  stages:",
    ...result.stages.map(stage => `    ${stage.id}: ${stage.status} - ${stage.summary}`),
    `  manuscript: ${result.generatedFiles.manuscript ?? "(not written)"}`,
    `  inspection: ${result.generatedFiles.runInspectionReport}`,
    `  benchmark: ${result.benchmark.status} coverage=${result.benchmark.routeCoverage.posture}`,
    `  report: ${result.generatedFiles.goldenReport}`,
    `  next: ${result.nextAction}`,
  ].join("\n");
}

export function renderResearchGoldenRunJson(result: ResearchGoldenRunResult): string {
  return `${JSON.stringify({ schemaVersion: 1, goldenRun: result }, null, 2)}\n`;
}

function goalForStatsAnalysisRun(method: StatsRunRequest["method"], group?: string, exposure?: string): ModelingGoal {
  if (method === "propensity-score-matching" || method === "propensity-score-weighting") return "causal";
  if (method === "diagnostic-accuracy") return "diagnose";
  if (method === "descriptive") return "describe";
  if (method === "t-test" || method === "mann-whitney" || group) return "compare_groups";
  if (exposure) return "associate";
  return "describe";
}

function methodSelectionGoalForStatsAnalysisRun(method: StatsRunRequest["method"], group?: string, exposure?: string): MethodSelectionRequest["goal"] {
  const goal = goalForStatsAnalysisRun(method, group, exposure);
  if (goal === "classify") return "predict";
  if (goal === "reduce_dimensions") return "discover";
  return goal;
}

function outcomeTypeForStatsAnalysisRun(method: StatsRunRequest["method"]): OutcomeType {
  if (method === "logistic-regression" || method === "diagnostic-accuracy") return "binary";
  if (method === "propensity-score-matching" || method === "propensity-score-weighting") return "binary";
  if (method === "chi-square" || method === "fisher-exact") return "categorical";
  if (method === "poisson-regression") return "count";
  return "continuous";
}

export interface ResearchAnalysisBenchmarkResult {
  schemaVersion: 1;
  status: "pass" | "fail";
  manifests: AnalysisRunManifest[];
  routeCoverage: {
    total: number;
    byKind: Record<AnalysisRunManifest["runKind"], number>;
    localReviewReadyByKind: Record<AnalysisRunManifest["runKind"], number>;
    posture: "empty" | "single_route" | "multi_route_ready" | "multi_route_incomplete";
  };
  checks: Array<{
    id: string;
    status: "pass" | "warning" | "fail";
    detail: string;
  }>;
  summary: string;
  nextAction: string;
  generatedFiles: {
    out: string | null;
    report: string | null;
  };
}

export async function researchAnalysisBenchmarkCommand(opts: { runDirs: string[]; requireReady?: boolean; requireMultiRoute?: boolean; outPath?: string; reportPath?: string }): Promise<ResearchAnalysisBenchmarkResult> {
  if (opts.runDirs.length === 0) throw new Error("analysis-benchmark requires at least one --run-dir.");
  const manifests = await Promise.all(opts.runDirs.map(runDir => buildAnalysisRunManifest({ runDir })));
  const routeCoverage = buildAnalysisRouteCoverage(manifests);
  const manifestFailures = manifests.filter(manifest =>
    manifest.artifactCompleteness.status === "fail"
    || manifest.qaReadiness.status === "fail"
    || manifest.qaReadiness.status === "missing"
    || manifest.qaReadiness.status === "unreadable"
    || (manifest.runKind === "stats" && manifest.methodDecisionReadiness.status === "blocked")
    || (opts.requireReady && manifest.readiness !== "local_review_ready")
  );
  const checks = buildAnalysisBenchmarkChecks(manifests, manifestFailures, routeCoverage, opts.requireReady ?? false, opts.requireMultiRoute ?? false);
  const hardFailures = checks.filter(check => check.status === "fail" && (check.id !== "route-coverage" || opts.requireMultiRoute));
  const nonRouteWarnings = checks.filter(check => check.status === "warning" && check.id !== "route-coverage");
  const nonRouteWarningSummary = nonRouteWarnings.map(check => `${check.id}: ${check.detail}`).join("; ");
  const result: ResearchAnalysisBenchmarkResult = {
    schemaVersion: 1,
    status: manifestFailures.length === 0 && hardFailures.length === 0 ? "pass" : "fail",
    manifests,
    routeCoverage,
    checks,
    summary: `${manifests.length - manifestFailures.length}/${manifests.length} analysis manifests passed${opts.requireReady ? " local-review-ready" : " artifact/QA"} checks; coverage=${routeCoverage.posture}${nonRouteWarnings.length ? `; warnings=${nonRouteWarnings.map(check => check.id).join(", ")}` : ""}.`,
    nextAction: manifestFailures.length === 0 && hardFailures.length === 0
      ? nonRouteWarnings.length
        ? `Resolve or explicitly justify warning-level benchmark checks before promotion: ${nonRouteWarningSummary}.`
        : routeCoverage.posture === "multi_route_ready"
        ? "Golden analysis routes satisfy the requested benchmark gate across multiple route kinds."
        : "Golden analysis routes satisfy the requested benchmark gate, but route coverage is narrow."
      : opts.requireMultiRoute && routeCoverage.posture !== "multi_route_ready"
        ? "Add at least two local-review-ready route kinds before promotion, such as one bound stats route and one ML comparison route."
      : "Inspect failing manifests and repair missing artifacts, posture, or readiness before promotion.",
    generatedFiles: {
      out: opts.outPath ? path.resolve(opts.outPath) : null,
      report: opts.reportPath ? path.resolve(opts.reportPath) : null,
    },
  };
  if (result.generatedFiles.out) {
    await mkdir(path.dirname(result.generatedFiles.out), { recursive: true });
    await writeFile(result.generatedFiles.out, renderResearchAnalysisBenchmarkJson(result));
  }
  if (result.generatedFiles.report) {
    await mkdir(path.dirname(result.generatedFiles.report), { recursive: true });
    await writeFile(result.generatedFiles.report, renderAnalysisBenchmarkMarkdown(result));
  }
  return result;
}

export function renderResearchAnalysisBenchmark(result: ResearchAnalysisBenchmarkResult): string {
  return [
    `research analysis benchmark: ${result.status}`,
    `  ${result.summary}`,
    `  coverage: ${result.routeCoverage.posture} stats=${result.routeCoverage.byKind.stats} ml=${result.routeCoverage.byKind.ml} ml-comparison=${result.routeCoverage.byKind["ml-comparison"]}`,
    `  checks: ${result.checks.map(check => `${check.id}=${check.status}`).join(", ")}`,
    ...result.manifests.map(manifest => `  ${manifest.runKind}: ${manifest.readiness} artifacts=${manifest.artifactCompleteness.status} qa=${qaReadinessLabel(manifest.qaReadiness)} feasibility=${manifest.feasibilityReadiness.status} method=${manifest.methodDecisionReadiness.status} consistency=${manifest.methodDecisionEvidenceConsistency.status} companions=${manifest.companionReadiness.status}${manifest.companionReadiness.missingMethods.length ? ` missing=${manifest.companionReadiness.missingMethods.join(",")}` : ""} dir=${manifest.runDir}`),
    result.generatedFiles.out ? `  out: ${result.generatedFiles.out}` : null,
    result.generatedFiles.report ? `  report: ${result.generatedFiles.report}` : null,
    `  next: ${result.nextAction}`,
  ].filter((line): line is string => Boolean(line)).join("\n");
}

function qaReadinessLabel(qaReadiness: AnalysisRunManifest["qaReadiness"]): string {
  const details = [
    ...qaReadiness.failingChecks.map(check => `fail:${check}`),
    ...qaReadiness.warningChecks.map(check => `warning:${check}`),
  ];
  return `${qaReadiness.status}${details.length ? `[${details.join(",")}]` : ""}`;
}

export function renderResearchAnalysisBenchmarkJson(result: ResearchAnalysisBenchmarkResult): string {
  return `${JSON.stringify({ schemaVersion: 1, analysisBenchmark: result }, null, 2)}\n`;
}

function buildAnalysisRouteCoverage(manifests: AnalysisRunManifest[]): ResearchAnalysisBenchmarkResult["routeCoverage"] {
  const byKind: Record<AnalysisRunManifest["runKind"], number> = { stats: 0, ml: 0, "ml-comparison": 0 };
  const localReviewReadyByKind: Record<AnalysisRunManifest["runKind"], number> = { stats: 0, ml: 0, "ml-comparison": 0 };
  for (const manifest of manifests) {
    byKind[manifest.runKind] += 1;
    if (manifest.readiness === "local_review_ready") localReviewReadyByKind[manifest.runKind] += 1;
  }
  const kindsPresent = Object.values(byKind).filter(count => count > 0).length;
  const readyKindsPresent = Object.values(localReviewReadyByKind).filter(count => count > 0).length;
  return {
    total: manifests.length,
    byKind,
    localReviewReadyByKind,
    posture: manifests.length === 0
      ? "empty"
      : kindsPresent === 1
        ? "single_route"
        : readyKindsPresent >= 2
          ? "multi_route_ready"
          : "multi_route_incomplete",
  };
}

function buildAnalysisBenchmarkChecks(
  manifests: AnalysisRunManifest[],
  failures: AnalysisRunManifest[],
  coverage: ResearchAnalysisBenchmarkResult["routeCoverage"],
  requireReady: boolean,
  requireMultiRoute: boolean,
): ResearchAnalysisBenchmarkResult["checks"] {
  const allComplete = manifests.every(manifest => manifest.artifactCompleteness.status === "pass");
  const qaFailures = manifests.filter(manifest => ["fail", "missing", "unreadable"].includes(manifest.qaReadiness.status));
  const qaWarnings = manifests.filter(manifest => manifest.qaReadiness.status === "warning");
  const criticalQaWarnings = manifests.flatMap(manifest => manifest.qaReadiness.criticalWarningChecks?.length
    ? manifest.qaReadiness.criticalWarningChecks
    : criticalStatsQaWarningChecks(manifest.qaReadiness.warningChecks));
  const statsMethodDecisionFailures = manifests.filter(manifest => manifest.runKind === "stats" && manifest.methodDecisionReadiness.status === "blocked");
  const statsMethodDecisionWarnings = manifests.filter(manifest => manifest.runKind === "stats" && manifest.methodDecisionReadiness.status !== "preferred" && manifest.methodDecisionReadiness.status !== "blocked");
  const statsMethodDecisionConsistencyWarnings = manifests.filter(manifest => manifest.runKind === "stats" && manifest.methodDecisionEvidenceConsistency.status === "warning");
  const feasibilityFailures = manifests.filter(manifest => manifest.runKind === "stats" && (manifest.feasibilityReadiness.status === "blocked" || manifest.feasibilityReadiness.status === "unverifiable"));
  const feasibilityWarnings = manifests.filter(manifest => manifest.runKind === "stats" && (manifest.feasibilityReadiness.status === "warning" || manifest.feasibilityReadiness.status === "not_supplied"));
  const missingFeasibilityEvidence = manifests.filter(manifest => manifest.runKind === "stats" && manifest.feasibilityReadiness.status === "not_supplied");
  const allHaveBoundaries = manifests.every(manifest => Boolean(manifest.resultPosture.interpretationBoundary));
  const hardCompanionFailures = manifests.filter(manifest => manifest.companionReadiness.status === "missing" || manifest.companionReadiness.status === "unverifiable");
  const advisoryCompanionGaps = manifests.filter(manifest => manifest.companionReadiness.status === "advisory" && manifest.companionReadiness.missingMethods.length > 0);
  return [
    {
      id: "artifact-completeness",
      status: allComplete ? "pass" : "fail",
      detail: allComplete ? "All manifests have required artifacts." : "At least one manifest is missing required artifacts.",
    },
    {
      id: "readiness-gate",
      status: failures.length === 0 ? "pass" : "fail",
      detail: requireReady
        ? `${manifests.length - failures.length}/${manifests.length} manifests passed local-review-ready.`
        : `${manifests.length - failures.length}/${manifests.length} manifests passed artifact checks.`,
    },
    {
      id: "qa-readiness",
      status: qaFailures.length ? "fail" : qaWarnings.length ? "warning" : "pass",
      detail: qaFailures.length
        ? `${qaFailures.length} manifest(s) have failed, missing, or unreadable QA readiness.`
        : qaWarnings.length
          ? `${qaWarnings.length} manifest(s) have warning-level QA readiness: ${uniqueStrings(qaWarnings.flatMap(manifest => manifest.qaReadiness.warningChecks)).join(", ") || "review stats-qa.json"}.`
          : "All manifests have passing or non-applicable QA readiness.",
    },
    {
      id: "critical-stats-qa-warnings",
      status: criticalQaWarnings.length ? "warning" : "pass",
      detail: criticalQaWarnings.length
        ? `${criticalQaWarnings.length} critical stats QA warning instance(s) keep stats manifests exploratory: ${uniqueStrings(criticalQaWarnings).join(", ")}.`
        : manifests.some(manifest => manifest.runKind === "stats")
          ? "No critical stats QA warnings were detected."
          : "No stats manifests required critical stats QA warning checks.",
    },
    {
      id: "feasibility-readiness",
      status: feasibilityFailures.length ? "fail" : feasibilityWarnings.length ? "warning" : "pass",
      detail: feasibilityFailures.length
        ? `${feasibilityFailures.length} stats manifest(s) have blocked or unverifiable feasibility evidence.`
        : missingFeasibilityEvidence.length
          ? `${missingFeasibilityEvidence.length} stats manifest(s) are missing feasibility-gate or analysis-run feasibility evidence.`
        : feasibilityWarnings.length
          ? `${feasibilityWarnings.length} stats manifest(s) require feasibility warning acceptance or repair.`
          : manifests.some(manifest => manifest.runKind === "stats")
            ? "No blocking feasibility evidence was detected for stats manifests."
            : "No stats manifests required feasibility readiness.",
    },
    {
      id: "method-decision-readiness",
      status: statsMethodDecisionFailures.length ? "fail" : statsMethodDecisionWarnings.length ? "warning" : "pass",
      detail: statsMethodDecisionFailures.length
        ? `${statsMethodDecisionFailures.length} stats manifest(s) have blocked method-selection decisions.`
        : statsMethodDecisionWarnings.length
          ? `${statsMethodDecisionWarnings.length} stats manifest(s) are missing preferred primary method-decision evidence.`
          : manifests.some(manifest => manifest.runKind === "stats")
            ? "All stats manifests have preferred method-decision evidence."
            : "No stats manifests required method-decision readiness.",
    },
    {
      id: "method-decision-consistency",
      status: statsMethodDecisionConsistencyWarnings.length ? "warning" : "pass",
      detail: statsMethodDecisionConsistencyWarnings.length
        ? `${statsMethodDecisionConsistencyWarnings.length} stats manifest(s) have contradictory method-decision artifacts.`
        : manifests.some(manifest => manifest.runKind === "stats")
          ? "Stats manifests have internally consistent method-decision artifacts."
          : "No stats manifests required method-decision consistency checks.",
    },
    {
      id: "route-coverage",
      status: coverage.posture === "multi_route_ready" ? "pass" : requireMultiRoute ? "fail" : coverage.posture === "single_route" ? "warning" : "fail",
      detail: `Coverage posture is ${coverage.posture}; stats=${coverage.byKind.stats}, ml=${coverage.byKind.ml}, ml-comparison=${coverage.byKind["ml-comparison"]}.`,
    },
    {
      id: "interpretation-boundaries",
      status: allHaveBoundaries ? "pass" : "warning",
      detail: allHaveBoundaries ? "Every manifest carries an interpretation boundary." : "At least one manifest lacks an explicit interpretation boundary.",
    },
    {
      id: "companion-readiness",
      status: hardCompanionFailures.length ? "fail" : advisoryCompanionGaps.length ? "warning" : "pass",
      detail: hardCompanionFailures.length
        ? `${hardCompanionFailures.length} manifest(s) are missing enforced companion analyses.`
        : advisoryCompanionGaps.length
          ? `${advisoryCompanionGaps.length} manifest(s) have advisory companion analyses not yet run.`
          : "No enforced companion-analysis gaps were detected.",
    },
  ];
}

function renderAnalysisBenchmarkMarkdown(result: ResearchAnalysisBenchmarkResult): string {
  const rows = result.manifests.map(manifest => {
    return `| ${manifest.runKind} | ${manifest.readiness} | ${manifest.resultPosture.status ?? "(missing)"} | ${manifest.artifactCompleteness.status} | ${qaReadinessLabel(manifest.qaReadiness).replaceAll(",", ", ")} | ${manifest.feasibilityReadiness.status}${manifest.feasibilityReadiness.verdict ? `: ${manifest.feasibilityReadiness.verdict}` : ""} | ${manifest.methodDecisionReadiness.status}${manifest.methodDecisionReadiness.primaryMethods.length ? `: ${manifest.methodDecisionReadiness.primaryMethods.join(", ")}` : ""} | ${manifest.methodDecisionEvidenceConsistency.status}${manifest.methodDecisionEvidenceConsistency.summary ? `: ${manifest.methodDecisionEvidenceConsistency.summary}` : ""} | ${manifest.companionReadiness.status}${manifest.companionReadiness.missingMethods.length ? `: ${manifest.companionReadiness.missingMethods.join(", ")}` : ""} | ${manifest.runDir} |`;
  });
  return [
    "# Analysis Benchmark Report",
    "",
    "## Summary",
    "",
    `- Status: ${result.status}`,
    `- Summary: ${result.summary}`,
    `- Route coverage: ${result.routeCoverage.posture}`,
    `- Next action: ${result.nextAction}`,
    "",
    "## Checks",
    "",
    "| check | status | detail |",
    "|---|---|---|",
    ...result.checks.map(check => `| ${check.id} | ${check.status} | ${check.detail.replaceAll("|", "\\|")} |`),
    "",
    "## Manifests",
    "",
    "| kind | readiness | posture | artifacts | qa | feasibility | method decision | decision consistency | companions | run dir |",
    "|---|---|---|---|---|---|---|---|---|---|",
    ...rows,
    "",
    "## Interpretation",
    "",
    "This benchmark is a local readiness gate over analysis manifests. It does not certify external validity, clinical utility, causal inference, or deployment readiness.",
  ].join("\n");
}

export function parseBackendId(value: string | undefined): BackendId | undefined {
  if (value === undefined) return undefined;
  return backendIdSchema.parse(value);
}

export function parsePhenotypeCodeSystem(value: string | undefined): PhenotypeCodeSystem | undefined {
  if (!value) return undefined;
  const parsed = phenotypeCodeSystemSchema.safeParse(value);
  if (!parsed.success) {
    throw new Error(`Unknown phenotype code system '${value}'. Expected one of: ${phenotypeCodeSystemSchema.options.join(", ")}`);
  }
  return parsed.data;
}

export function parseReviewStage(value: string | undefined): ReviewStage | undefined {
  if (!value) return undefined;
  return reviewStageSchema.parse(value);
}

export function parseReviewAutonomy(value: string | undefined): ReviewAutonomy | undefined {
  if (!value) return undefined;
  return reviewAutonomySchema.parse(value);
}

export function parseDatasetAdapterId(value: string | undefined, fallback: DatasetAdapterId): DatasetAdapterId {
  return value === undefined ? fallback : datasetAdapterIdSchema.parse(value);
}

export function parseStudyArchetypeId(value: string | undefined): StudyArchetypeId | undefined {
  if (value === undefined) return undefined;
  return studyArchetypeIdSchema.parse(value);
}

export function parseMethodCategory(value: string | undefined): AnalysisMethodCategory | undefined {
  return value === undefined ? undefined : analysisMethodCategorySchema.parse(value);
}

export function parseOutcomeType(value: string | undefined): OutcomeType | undefined {
  return value === undefined ? undefined : outcomeTypeSchema.parse(value);
}

export function parseStudyDesign(value: string | undefined): MethodSelectionRequest["studyDesign"] {
  return value === undefined ? undefined : studyDesignSchema.parse(value);
}

export function parseDataStructures(values: string[]): DataStructure[] {
  return values.flatMap(value => value.split(",")).filter(Boolean).map(value => dataStructureSchema.parse(value));
}

export function parseMethodGoal(value: string | undefined): MethodSelectionRequest["goal"] {
  if (value === undefined) return undefined;
  const parsed = methodSelectionRequestSchema.shape.goal.unwrap().safeParse(value);
  if (!parsed.success) throw new Error(`Unsupported method-selection goal: ${value}`);
  return parsed.data;
}

export function parseModelingGoal(value: string | undefined): ModelingGoal | undefined {
  return value === undefined ? undefined : modelingGoalSchema.parse(value);
}

export function renderResearchMachineStatus(result: MachineStatus): string {
  return [
    "research machine status",
    ...result.tracks.map(track => `  ${track.id}: ${track.status} - ${track.summary}`),
    "  backends:",
    ...result.backends.map(backend => `    ${backend.id}: ${backend.availability} ${backend.version ?? ""}`.trimEnd()),
    "  datasets:",
    ...result.datasets.map(dataset => `    ${dataset.id}: ${dataset.availability}`),
    `  issues: ${result.issues.length}`,
    `  next: ${result.nextAction}`,
  ].join("\n");
}

export function renderResearchMachineStatusJson(result: MachineStatus): string {
  return `${JSON.stringify({ schemaVersion: 1, machineStatus: result }, null, 2)}\n`;
}

export function renderResearchSpecV2(result: SpecV2Result): string {
  return [
    `research AnalysisSpec V2: ${result.spec.specId}`,
    `  source: ${result.sourceKind}`,
    `  dataset: ${result.spec.dataset}`,
    `  archetype: ${result.spec.archetype}`,
    `  backend: ${result.spec.backendRequirements.preferred}`,
    `  validation: ${result.validation.status}`,
    `  issues: ${result.validation.issues.length}`,
    `  spec hash: ${result.spec.specHash}`,
    `  out: ${result.outPath ?? "(not written)"}`,
  ].join("\n");
}

export function renderResearchSpecV2Json(result: SpecV2Result): string {
  return `${JSON.stringify({ schemaVersion: 1, analysisSpecV2: result.spec, validation: result.validation, sourceKind: result.sourceKind, outPath: result.outPath }, null, 2)}\n`;
}

export function renderResearchExecutionContract(result: ExecutionContract): string {
  return [
    `research execution contract: ${result.contractId}`,
    `  backend: ${result.backend.id}`,
    `  dataset: ${result.datasetAdapter.id}`,
    `  archetype: ${result.archetype.id}`,
    `  validation: ${result.validation.status}`,
    `  command: ${result.runner.command.join(" ")}`,
    `  human review: ${result.policyEnvelope.requiresHumanReview ? "required" : "not required before execution"}`,
    `  outputs: ${result.typedOutputs.map(output => output.path).join(", ")}`,
  ].join("\n");
}

export function renderResearchExecutionContractJson(result: ExecutionContract): string {
  return `${JSON.stringify({ schemaVersion: 1, executionContract: result }, null, 2)}\n`;
}

export function renderResearchArchetypes(result: { archetypes: StudyArchetypeManifest[]; nextAction: string }): string {
  return [
    "research study archetypes",
    ...result.archetypes.map(archetype => `  ${archetype.id}: ${archetype.label} [${archetype.allowedBackends.join(", ")}]`),
    `  next: ${result.nextAction}`,
  ].join("\n");
}

export function renderResearchArchetypesJson(result: { archetypes: StudyArchetypeManifest[]; nextAction: string }): string {
  return `${JSON.stringify({ schemaVersion: 1, studyArchetypes: result.archetypes, nextAction: result.nextAction }, null, 2)}\n`;
}

export function renderResearchDatasetAdapter(result: DatasetAdapterInspection): string {
  return [
    `research dataset adapter: ${result.adapter.id}`,
    `  status: ${result.availability}`,
    `  data root: ${result.dataRoot ?? "(not supplied)"}`,
    `  files: ${result.discoveredFiles.length}`,
    `  variable metadata: ${result.variableMetadataCount}`,
    `  survey weight domains: ${result.surveyWeightDomains.map(domain => `${domain.weight}${domain.isSubsample ? " (subsample)" : ""}`).join(", ") || "(none)"}`,
    ...result.evidence.map(item => `  evidence: ${item}`),
    `  issues: ${result.issues.length}`,
  ].join("\n");
}

export function renderResearchDatasetAdapterJson(result: DatasetAdapterInspection): string {
  return `${JSON.stringify({ schemaVersion: 1, datasetAdapterInspection: result }, null, 2)}\n`;
}

export function renderResearchMachinePlan(result: MachinePlan): string {
  return [
    `research machine plan: ${result.planId}`,
    `  dataset: ${result.dataset.id}`,
    `  archetype: ${result.archetype.id}`,
    `  backend: ${result.backend.id}`,
    `  confidence: ${result.confidence.toFixed(2)}`,
    `  human review: ${result.stopForHumanReview ? "required" : "not required before execution"}`,
    `  risks: ${result.risks.length}`,
    "  command sequence:",
    ...result.commandSequence.map((command, index) => `    ${index + 1}. ${command}`),
  ].join("\n");
}

export function renderResearchMachinePlanJson(result: MachinePlan): string {
  return `${JSON.stringify({ schemaVersion: 1, machinePlan: result }, null, 2)}\n`;
}

export function renderResearchMachineBenchmark(result: MachineBenchmarkResult): string {
  return [
    `research machine benchmark: ${result.benchmark.benchmarkId}`,
    `  status: ${result.evaluation.status}`,
    `  score: ${result.evaluation.normalizedScore}`,
    `  checks: ${result.evaluation.checks.length}`,
    `  issues: ${result.evaluation.issues.length}`,
    `  out: ${result.outPath ?? "(not written)"}`,
    `  next: ${result.evaluation.nextAction}`,
  ].join("\n");
}

export function renderResearchMachineBenchmarkJson(result: MachineBenchmarkResult): string {
  return `${JSON.stringify({ schemaVersion: 1, benchmark: result.benchmark, evaluation: result.evaluation, outPath: result.outPath }, null, 2)}\n`;
}

export function renderResearchMethodsCatalog(result: { methods: AnalysisMethod[]; category: AnalysisMethodCategory | null; nextAction: string }): string {
  return [
    `research methods catalog${result.category ? `: ${result.category}` : ""}`,
    `  methods: ${result.methods.length}`,
    ...result.methods.map(method => `  ${method.id}: ${method.label} [${method.category}; ${method.implementationStatus}; ${method.compatibleBackends.join(", ")}]`),
    `  next: ${result.nextAction}`,
  ].join("\n");
}

export function renderResearchMethodsCatalogJson(result: { methods: AnalysisMethod[]; category: AnalysisMethodCategory | null; nextAction: string }): string {
  return `${JSON.stringify({ schemaVersion: 1, methodsCatalog: result }, null, 2)}\n`;
}

export function renderResearchMachineMethodSelection(result: MethodSelectionResult & { outPath?: string | null }): string {
  return [
    `research method selection: ${result.selectionId}`,
    `  primary: ${result.primary?.method.id ?? "(none)"}`,
    `  archetype: ${result.recommendedArchetype}`,
    `  backend: ${result.recommendedBackend}`,
    `  candidates: ${result.candidates.length}`,
    `  human review: ${result.stopForHumanReview ? "required" : "not required before execution"}`,
    `  issues: ${result.issues.length}`,
    `  out: ${result.outPath ?? "(not written)"}`,
    `  next: ${result.nextAction}`,
  ].join("\n");
}

export function renderResearchMachineMethodSelectionJson(result: MethodSelectionResult & { outPath?: string | null }): string {
  const { outPath: _outPath, ...selection } = result;
  return `${JSON.stringify({ schemaVersion: 1, methodSelection: selection, outPath: result.outPath ?? null }, null, 2)}\n`;
}

export function renderResearchMethodApply(result: Awaited<ReturnType<typeof researchMethodApplyCommand>>): string {
  return [
    `research method apply: ${result.selection.primary?.method.id ?? "(none)"}`,
    `  spec: ${result.spec.specId}`,
    `  archetype: ${result.spec.archetype}`,
    `  backend: ${result.spec.backendRequirements.preferred}`,
    `  validation: ${result.validation.status}`,
    `  issues: ${result.validation.issues.length}`,
    `  out: ${result.outPath ?? "(not written)"}`,
  ].join("\n");
}

export function renderResearchMethodApplyJson(result: Awaited<ReturnType<typeof researchMethodApplyCommand>>): string {
  return `${JSON.stringify({ schemaVersion: 1, analysisSpecV2: result.spec, methodSelection: result.selection, validation: result.validation, outPath: result.outPath }, null, 2)}\n`;
}

export function renderResearchMethodValidation(result: Awaited<ReturnType<typeof researchMethodValidateCommand>>): string {
  return [
    `research method validation: ${result.method.id}`,
    `  status: ${result.validation.status}`,
    `  issues: ${result.validation.issues.length}`,
  ].join("\n");
}

export function renderResearchMethodValidationJson(result: Awaited<ReturnType<typeof researchMethodValidateCommand>>): string {
  return `${JSON.stringify({ schemaVersion: 1, method: result.method, validation: result.validation }, null, 2)}\n`;
}

export function renderResearchModelingPlan(result: ModelingDecisionPlan): string {
  return [
    `research modeling plan: ${result.decisionId}`,
    `  goal: ${result.inferredGoal}`,
    `  outcome: ${result.inferredOutcomeType}`,
    `  design: ${result.inferredStudyDesign}`,
    `  data: ${result.inferredDataStructures.join(", ")}`,
    `  evidence: ${result.dataEvidence.source}; rows=${result.dataEvidence.rowCount ?? "?"}; features=${result.dataEvidence.featureCount ?? "?"}; target classes=${result.dataEvidence.targetClassCount ?? "?"}; max missing=${result.dataEvidence.maxMissingFraction === null ? "?" : `${(result.dataEvidence.maxMissingFraction * 100).toFixed(1)}%`}`,
    `  backend evidence: ${result.backendEvidence.source}; available=${result.backendEvidence.available.join(",") || "(none)"}; missing=${result.backendEvidence.missing.join(",") || "(none)"}`,
    `  prior runs: ${result.priorRunEvidence.source}; actions=${result.priorRunEvidence.runs.map(run => run.action).join(",") || "(none)"}`,
    `  literature: ${result.literatureEvidence.source}; status=${result.literatureEvidence.status ?? "(none)"}; strength=${result.literatureEvidence.evidenceStrength ?? "(none)"}; sources=${result.literatureEvidence.sourceCount ?? "?"}`,
    `  feasibility: ${renderModelingFeasibilityEvidenceLine(result)}`,
    `  exploration handoff: ${result.request.explorationHandoff ? `${result.request.explorationHandoff.status}; clearance=${result.request.explorationHandoff.clearanceLevel}; question=${result.request.explorationHandoff.questionId ?? "(unknown)"}` : "(none)"}`,
    `  method selection: ${result.methodSelectionEvidence.selectionId}; primary=${result.methodSelectionEvidence.primaryMethodId ?? "(none)"}; backend=${result.methodSelectionEvidence.recommendedBackend}; review=${result.methodSelectionEvidence.stopForHumanReview ? "required" : "not-required"}`,
    `  stats guidance: ${result.statisticalMethodGuidance.recommendedStatsRunMethod ?? "(none)"}; confidence=${result.statisticalMethodGuidance.confidence}; ${result.statisticalMethodGuidance.rationale}`,
    `  stats contract: ${result.statisticalMethodGuidance.contract ? `${result.statisticalMethodGuidance.contract.family}; required=${result.statisticalMethodGuidance.contract.requiredArguments.join(",") || "(none)"}; qa=${result.statisticalMethodGuidance.contract.qaGates.slice(0, 4).join(",")}` : "(none)"}`,
    `  route: ${result.routeRecommendation.route}; ${result.routeRecommendation.reason}`,
    `  blocking policies: ${result.blockingPolicies.map(candidate => candidate.id).join(", ") || "(none)"}`,
    `  primary: ${result.primary ? `${result.primary.id} [${result.primary.backend}]` : "(none)"}`,
    `  executable candidates: ${result.executableCandidates.length}`,
    `  candidates: ${result.candidates.length}`,
    `  baselines: ${result.baselines.map(candidate => candidate.id).join(", ") || "(none)"}`,
    `  sensitivity: ${result.sensitivityAnalyses.map(candidate => candidate.id).join(", ") || "(none)"}`,
    `  issues: ${result.issues.length}`,
    ...result.candidates.slice(0, 8).map(candidate => `  ${candidate.rank}. ${candidate.id}: ${candidate.tier}; score=${candidate.score.toFixed(2)}; ${candidate.compatible ? "compatible" : "not executable now"}`),
    `  next: ${result.nextAction}`,
  ].join("\n");
}

function renderModelingFeasibilityEvidenceLine(result: ModelingDecisionPlan): string {
  const evidence = result.feasibilityEvidence;
  if (evidence.source === "not-supplied") return "not-supplied";
  const score = evidence.score === null ? "?" : evidence.score.toFixed(2);
  const confidence = evidence.confidence === null ? "?" : evidence.confidence.toFixed(2);
  const details = evidence.status === "block"
    ? evidence.blockers
    : [...evidence.warningsText, ...evidence.requiredModifications, evidence.nextAction].filter((item): item is string => typeof item === "string" && item.length > 0);
  return [
    `${evidence.source}; status=${evidence.status}; verdict=${evidence.verdict}; score=${score}; confidence=${confidence}`,
    evidence.path ? `path=${evidence.path}` : null,
    details.length ? `review=${details.slice(0, 2).join(" | ")}` : null,
  ].filter((part): part is string => Boolean(part)).join("; ");
}

export function renderResearchModelingPlanJson(result: ModelingDecisionPlan): string {
  return `${JSON.stringify({ schemaVersion: 1, modelingPlan: result }, null, 2)}\n`;
}

export function researchMachineCatalogs(): {
  backends: ResearchBackendManifest[];
  datasets: DatasetAdapterManifest[];
  archetypes: StudyArchetypeManifest[];
  methods: AnalysisMethod[];
} {
  return { backends: backendCatalog, datasets: datasetCatalog, archetypes: archetypeCatalog, methods: analysisMethodCatalog };
}

export function resolveMachineOutPath(value: string | undefined): string | undefined {
  return value ? path.resolve(value) : undefined;
}
