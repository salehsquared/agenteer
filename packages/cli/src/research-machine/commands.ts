import path from "node:path";
import { mkdir, writeFile } from "node:fs/promises";
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

export type { DatasetAdapterInspection, MachineBenchmarkResult, SpecV2Result } from "./runtime.js";

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
  tableSummary?: ModelingDecisionRequest["tableSummary"];
  highMissingness?: boolean;
  smallSample?: boolean;
  requiresInference?: boolean;
  requiresPrediction?: boolean;
  maxCandidates?: number;
}): ModelingDecisionPlan {
  return buildModelingDecisionPlan(opts);
}

export function parseBackendId(value: string | undefined): BackendId | undefined {
  if (value === undefined) return undefined;
  return backendIdSchema.parse(value);
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
