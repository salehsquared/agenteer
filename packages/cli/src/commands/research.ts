import { createHash } from "node:crypto";
import { access, appendFile, copyFile, mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  labMedbreviaNhanesCommand,
  renderLabMedbreviaNhanesResult,
  type LabMedbreviaNhanesOptions,
  type LabMedbreviaNhanesResult,
  type NhanesRegistry,
} from "./lab.js";

export type ResearchProject = "medbrevia-nhanes";

export interface ResearchDesignOptions {
  project: ResearchProject;
  repoDir: string;
  question: string;
  outDir?: string;
}

export type ResearchDesignResult = LabMedbreviaNhanesResult;

export interface ResearchQuestionOptions {
  project: ResearchProject;
  repoDir: string;
  limit?: number;
}

export interface ResearchQuestionCandidate {
  id: string;
  question: string;
  rationale: string;
  requiredDomains: string[];
  difficulty: "starter" | "intermediate" | "hard";
  expectedStress: string[];
}

export interface ResearchPacketInspectResult {
  packetDir: string;
  packetVersion: number | null;
  question: string;
  title: string;
  dataset: string;
  cycles: string[];
  domains: string[];
  blockers: number;
  warnings: number;
  registrySha256: string | null;
  nextAction: string;
}

export interface ResearchCritiqueIssue {
  severity: "blocker" | "warning" | "note";
  code: string;
  message: string;
}

export interface ResearchPacketCritiqueResult {
  packetDir: string;
  title: string;
  issues: ResearchCritiqueIssue[];
  status: "blocked" | "needs_review" | "pass";
}

export interface ResearchScoutPlan {
  packetDir: string;
  status: "plan_ready" | "computed";
  title: string;
  cycles: string[];
  domains: string[];
  requiredVariables: string[];
  caseRequirements: {
    populationFilters: string[];
    filterDefinitions: string[];
    exposureAnyOf: string[];
    endpointAnyOf: string[];
    covariatesAllOf: string[];
    stratifiers: string[];
    positiveWeight: string | null;
  };
  surveyDesign: {
    weightVariable: string | null;
    strataVariable: string | null;
    psuVariable: string | null;
  };
  derivedDefinitions: Array<{
    id: string;
    expression: string;
    variables: string[];
  }>;
  plannedMetrics: string[];
  localDataStatus: "not_available" | "fixture_loaded";
  metrics?: {
    baseRows: number;
    eligibleRows: number;
    nonmissingExposureRows: number;
    nonmissingEndpointRows: number;
    positiveWeightRows: number;
    completeCaseRows: number;
  };
  nextAction: string;
}

export interface ResearchApprovalRecord {
  packetDir: string;
  approvedAtIso: string;
  reviewer: "agent-human-in-the-loop";
  status: "approved";
  title: string;
  note: string;
  critiqueStatus: ResearchPacketCritiqueResult["status"];
  scoutStatus: ResearchScoutPlan["status"] | "missing";
}

export interface ResearchAnalysisResult {
  packetDir: string;
  status: "completed";
  title: string;
  analysisMode: "local_fixture_unweighted";
  analysisKind: "binary_association" | "continuous_by_exposure_group";
  eligibleRows: number;
  completeCaseRows: number;
  exposurePositiveRows: number;
  endpointPositiveRows: number;
  twoByTwo: Array<{
    exposure: string;
    endpointNegative: number;
    endpointPositive: number;
    total: number;
  }>;
  stratifiedTwoByTwo?: Array<{
    stratifier: string;
    level: string;
    rows: Array<{
      exposure: string;
      endpointNegative: number;
      endpointPositive: number;
      total: number;
    }>;
  }>;
  diagnosticMetrics?: {
    sensitivity: number | null;
    specificity: number | null;
    positivePredictiveValue: number | null;
    negativePredictiveValue: number | null;
  };
  groupSummaries?: Array<{
    exposureGroup: string;
    n: number;
    endpointMeans: Array<{
      variable: string;
      mean: number | null;
    }>;
  }>;
  artifacts: {
    resultJson: string;
    reportMarkdown: string;
  };
}

export interface ResearchReportReview {
  packetDir: string;
  status: "pass" | "needs_review";
  issues: ResearchCritiqueIssue[];
}

export interface ResearchCheckpoint {
  packetDir: string;
  artifacts: {
    design: boolean;
    scoutPlan: boolean;
    runnerSpec: boolean;
    approval: boolean;
    analysisResult: boolean;
    report: boolean;
    artifactManifest: boolean;
    exportRecord: boolean;
  };
  currentStage: "design" | "scout" | "runner_spec" | "approval" | "analysis" | "report_review" | "manifest" | "export" | "complete";
  nextCommand: string;
  reason: string;
}

export interface ResearchArtifactManifest {
  packetDir: string;
  generatedAtIso: string;
  artifacts: Array<{
    path: string;
    bytes: number;
    sha256: string;
  }>;
}

export interface ResearchLoopStatus {
  stateDir: string;
  stateExists: boolean;
  state: unknown | null;
  journalEntries: number;
  backlogItems: number;
  nextAction: string;
}

export interface ResearchLoopNoteOptions {
  stateDir?: string;
  cycle: number;
  summary: string;
  nextAction?: string;
}

export interface ResearchLoopNoteResult {
  stateDir: string;
  cycle: number;
  journalPath: string;
  statePath: string;
  nextAction: string | null;
}

export interface ResearchRunnerSpec {
  packetDir: string;
  generatedAtIso: string;
  runnerVersion: 0;
  mode: "local_fixture";
  inputs: {
    designPacket: string;
    scoutPlan: string | null;
    fixtureRowsJson: string;
  };
  outputs: {
    analysisResult: string;
    reportMarkdown: string;
    artifactManifest: string;
  };
  contract: {
    requiredVariables: string[];
    populationFilters: string[];
    exposureVariables: string[];
    endpointVariables: string[];
    covariates: string[];
    stratifiers: string[];
    surveyWeight: string | null;
    analysisKind: ResearchAnalysisResult["analysisKind"];
  };
  safety: {
    cloudSpendUsd: 0;
    medbreviaMutationAllowed: false;
    requiresHumanApproval: true;
  };
}

export interface ResearchPipelineStage {
  id: string;
  nodeId: string;
  purpose: string;
  humanReview: boolean;
}

export interface ResearchPacketExport {
  packetDir: string;
  exportDir: string;
  copiedArtifacts: string[];
  summaryPath: string;
}

export async function researchDesignCommand(
  opts: ResearchDesignOptions,
): Promise<ResearchDesignResult> {
  switch (opts.project) {
    case "medbrevia-nhanes": {
      const labOpts: LabMedbreviaNhanesOptions = {
        repoDir: opts.repoDir,
        question: opts.question,
        ...(opts.outDir ? { outDir: opts.outDir } : {}),
      };
      return labMedbreviaNhanesCommand(labOpts);
    }
    default: {
      const neverProject: never = opts.project;
      throw new Error(`unsupported research project: ${neverProject}`);
    }
  }
}

export function researchPipelineStagesCommand(): ResearchPipelineStage[] {
  return [
    { id: "design", nodeId: "@agenteer/node-research-protocol-design", purpose: "Create a protocol packet from a question and dataset registry.", humanReview: false },
    { id: "critique", nodeId: "@agenteer/node-research-protocol-critique", purpose: "Run deterministic methodology checks before execution.", humanReview: false },
    { id: "scout", nodeId: "@agenteer/node-research-scout-plan", purpose: "Plan or compute cohort and complete-case feasibility.", humanReview: false },
    { id: "runner-spec", nodeId: "@agenteer/node-research-runner-spec", purpose: "Define the zero-cloud execution contract.", humanReview: false },
    { id: "approval", nodeId: "human:approval", purpose: "Record human-in-the-loop approval before analysis.", humanReview: true },
    { id: "analysis", nodeId: "@agenteer/node-research-analyze-local", purpose: "Run bounded local fixture analysis.", humanReview: false },
    { id: "report-review", nodeId: "@agenteer/node-research-report-review", purpose: "Check report artifacts against packet-specific QA requirements.", humanReview: false },
    { id: "manifest", nodeId: "@agenteer/node-research-artifact-manifest", purpose: "Hash packet artifacts for reproducibility.", humanReview: false },
    { id: "export", nodeId: "@agenteer/node-research-export", purpose: "Copy manifest-backed artifacts into a durable export directory.", humanReview: false },
  ];
}

export function renderResearchPipelineStages(stages: readonly ResearchPipelineStage[]): string {
  return [
    "research pipeline stages",
    "",
    ...stages.map((stage, index) =>
      `${index + 1}. ${stage.id} -> ${stage.nodeId}${stage.humanReview ? " [human-review]" : ""}\n   ${stage.purpose}`,
    ),
  ].join("\n");
}

export function renderResearchPipelineStagesJson(stages: readonly ResearchPipelineStage[]): string {
  return `${JSON.stringify({
    schemaVersion: 1,
    stages,
  }, null, 2)}\n`;
}

export function renderResearchDesignResult(result: ResearchDesignResult): string {
  return renderLabMedbreviaNhanesResult(result);
}

export async function researchQuestionsCommand(
  opts: ResearchQuestionOptions,
): Promise<ResearchQuestionCandidate[]> {
  switch (opts.project) {
    case "medbrevia-nhanes": {
      const registry = await loadNhanesRegistry(opts.repoDir);
      return buildNhanesQuestions(registry).slice(0, opts.limit ?? 8);
    }
    default: {
      const neverProject: never = opts.project;
      throw new Error(`unsupported research project: ${neverProject}`);
    }
  }
}

export function renderResearchQuestions(candidates: readonly ResearchQuestionCandidate[]): string {
  const lines = ["Research question candidates", ""];
  for (const candidate of candidates) {
    lines.push(`${candidate.id}. ${candidate.question}`);
    lines.push(`   difficulty: ${candidate.difficulty}`);
    lines.push(`   domains: ${candidate.requiredDomains.join(", ")}`);
    lines.push(`   stress: ${candidate.expectedStress.join("; ")}`);
    lines.push(`   rationale: ${candidate.rationale}`);
    lines.push("");
  }
  return lines.join("\n").trimEnd();
}

export async function researchInspectPacketCommand(packetDir: string): Promise<ResearchPacketInspectResult> {
  const resolved = path.resolve(packetDir);
  const packet = JSON.parse(await readFile(path.join(resolved, "design.json"), "utf-8")) as LabMedbreviaNhanesResult;
  const blockers = packet.diagnostics?.blockers?.length ?? 0;
  const warnings = packet.diagnostics?.warnings?.length ?? 0;
  return {
    packetDir: resolved,
    packetVersion: packet.packetVersion ?? null,
    question: packet.protocol?.clinicalQuestion ?? "",
    title: packet.protocol?.title ?? "",
    dataset: packet.protocol?.dataset ?? "",
    cycles: packet.protocol?.cycles ?? [],
    domains: packet.protocol?.approvedDataInputs ?? [],
    blockers,
    warnings,
    registrySha256: packet.source?.registrySha256 ?? null,
    nextAction: blockers
      ? "Resolve blockers before running or generating analysis code."
      : warnings
        ? "Review warnings, then proceed to cohort scout or human approval."
        : "Proceed to cohort scout or human approval.",
  };
}

export function renderResearchPacketInspect(result: ResearchPacketInspectResult): string {
  return [
    `research packet: ${result.packetDir}`,
    `  version: ${result.packetVersion ?? "unknown"}`,
    `  title: ${result.title}`,
    `  question: ${result.question}`,
    `  dataset: ${result.dataset}`,
    `  cycles: ${result.cycles.join(", ") || "(none)"}`,
    `  domains: ${result.domains.join(", ") || "(none)"}`,
    `  registry: ${result.registrySha256 ?? "unknown"}`,
    `  blockers: ${result.blockers}`,
    `  warnings: ${result.warnings}`,
    `  next: ${result.nextAction}`,
  ].join("\n");
}

export async function researchCritiquePacketCommand(packetDir: string): Promise<ResearchPacketCritiqueResult> {
  const resolved = path.resolve(packetDir);
  const packet = JSON.parse(await readFile(path.join(resolved, "design.json"), "utf-8")) as LabMedbreviaNhanesResult;
  const issues = critiquePacket(packet);
  return {
    packetDir: resolved,
    title: packet.protocol?.title ?? "",
    issues,
    status: issues.some(issue => issue.severity === "blocker")
      ? "blocked"
      : issues.some(issue => issue.severity === "warning")
        ? "needs_review"
        : "pass",
  };
}

export function renderResearchPacketCritique(result: ResearchPacketCritiqueResult): string {
  const lines = [
    `research critique: ${result.packetDir}`,
    `  title: ${result.title}`,
    `  status: ${result.status}`,
  ];
  if (!result.issues.length) {
    lines.push("  issues: none");
    return lines.join("\n");
  }
  lines.push("  issues:");
  for (const issue of result.issues) {
    lines.push(`    - [${issue.severity}] ${issue.code}: ${issue.message}`);
  }
  return lines.join("\n");
}

export async function researchScoutPlanCommand(packetDir: string, fixturePath?: string): Promise<ResearchScoutPlan> {
  const resolved = path.resolve(packetDir);
  const packet = JSON.parse(await readFile(path.join(resolved, "design.json"), "utf-8")) as LabMedbreviaNhanesResult;
  const plan = buildScoutPlan(resolved, packet);
  if (fixturePath) {
    const rows = JSON.parse(await readFile(path.resolve(fixturePath), "utf-8")) as Array<Record<string, unknown>>;
    Object.assign(plan, computeScoutMetrics(plan, packet, rows));
  }
  await writeFile(path.join(resolved, "scout-plan.json"), `${JSON.stringify(plan, null, 2)}\n`);
  return plan;
}

export function renderResearchScoutPlan(plan: ResearchScoutPlan): string {
  return [
    `research scout plan: ${plan.packetDir}`,
    `  status: ${plan.status}`,
    `  title: ${plan.title}`,
    `  cycles: ${plan.cycles.join(", ") || "(none)"}`,
    `  domains: ${plan.domains.join(", ") || "(none)"}`,
    `  required variables: ${plan.requiredVariables.join(", ") || "(none)"}`,
    `  case requirements: population filters [${plan.caseRequirements.populationFilters.join(", ")}]; derived filters [${plan.caseRequirements.filterDefinitions.join(", ")}]; exposure any of [${plan.caseRequirements.exposureAnyOf.join(", ")}]; endpoint any of [${plan.caseRequirements.endpointAnyOf.join(", ")}]; covariates all of [${plan.caseRequirements.covariatesAllOf.join(", ")}]; stratifiers [${plan.caseRequirements.stratifiers.join(", ")}]`,
    `  survey weight: ${plan.surveyDesign.weightVariable ?? "unknown"}`,
    `  derived definitions: ${plan.derivedDefinitions.map(def => def.id).join(", ") || "(none)"}`,
    `  planned metrics: ${plan.plannedMetrics.join("; ")}`,
    `  local data: ${plan.localDataStatus}`,
    ...(plan.metrics ? [
      `  base rows: ${plan.metrics.baseRows}`,
      `  eligible rows: ${plan.metrics.eligibleRows}`,
      `  exposure nonmissing rows: ${plan.metrics.nonmissingExposureRows}`,
      `  endpoint nonmissing rows: ${plan.metrics.nonmissingEndpointRows}`,
      `  positive weight rows: ${plan.metrics.positiveWeightRows}`,
      `  complete-case rows: ${plan.metrics.completeCaseRows}`,
    ] : []),
    `  next: ${plan.nextAction}`,
  ].join("\n");
}

export async function researchApprovePacketCommand(packetDir: string, note = ""): Promise<ResearchApprovalRecord> {
  const resolved = path.resolve(packetDir);
  const packet = JSON.parse(await readFile(path.join(resolved, "design.json"), "utf-8")) as LabMedbreviaNhanesResult;
  const critique = await researchCritiquePacketCommand(resolved);
  if (critique.status === "blocked") {
    throw new Error("cannot approve a packet with blocking critique issues");
  }
  const scout = await readScoutIfPresent(resolved);
  const approval: ResearchApprovalRecord = {
    packetDir: resolved,
    approvedAtIso: new Date().toISOString(),
    reviewer: "agent-human-in-the-loop",
    status: "approved",
    title: packet.protocol.title,
    note: note.trim() || "Approved for the next local research-pipeline stage.",
    critiqueStatus: critique.status,
    scoutStatus: scout?.status ?? "missing",
  };
  await writeFile(path.join(resolved, "approval.json"), `${JSON.stringify(approval, null, 2)}\n`);
  return approval;
}

export function renderResearchApproval(record: ResearchApprovalRecord): string {
  return [
    `research approval: ${record.packetDir}`,
    `  status: ${record.status}`,
    `  reviewer: ${record.reviewer}`,
    `  title: ${record.title}`,
    `  critique: ${record.critiqueStatus}`,
    `  scout: ${record.scoutStatus}`,
    `  note: ${record.note}`,
  ].join("\n");
}

export async function researchAnalyzeLocalCommand(packetDir: string, fixturePath: string): Promise<ResearchAnalysisResult> {
  const resolved = path.resolve(packetDir);
  const packet = JSON.parse(await readFile(path.join(resolved, "design.json"), "utf-8")) as LabMedbreviaNhanesResult;
  const approval = await readApprovalIfPresent(resolved);
  if (!approval) throw new Error("cannot analyze packet before human-in-the-loop approval");
  const rows = JSON.parse(await readFile(path.resolve(fixturePath), "utf-8")) as Array<Record<string, unknown>>;
  const result = computeLocalAnalysis(resolved, packet, rows);
  await writeFile(path.join(resolved, "analysis-result.json"), `${JSON.stringify(result, null, 2)}\n`);
  await writeFile(path.join(resolved, "report.md"), renderAnalysisReport(packet, result));
  return result;
}

export function renderResearchAnalysisResult(result: ResearchAnalysisResult): string {
  return [
    `research analysis: ${result.packetDir}`,
    `  status: ${result.status}`,
    `  mode: ${result.analysisMode}`,
    `  analysis: ${result.analysisKind}`,
    `  title: ${result.title}`,
    `  eligible rows: ${result.eligibleRows}`,
    `  complete-case rows: ${result.completeCaseRows}`,
    ...(result.analysisKind === "binary_association" ? [
      `  exposure-positive rows: ${result.exposurePositiveRows}`,
      `  endpoint-positive rows: ${result.endpointPositiveRows}`,
      ...(result.stratifiedTwoByTwo?.map(stratum =>
        `  ${stratum.stratifier}=${stratum.level}: ${stratum.rows.map(row => `${row.exposure} ${row.endpointPositive}/${row.total}`).join("; ")}`,
      ) ?? []),
      ...(result.diagnosticMetrics ? [
        `  sensitivity: ${formatMetric(result.diagnosticMetrics.sensitivity)}`,
        `  specificity: ${formatMetric(result.diagnosticMetrics.specificity)}`,
        `  ppv: ${formatMetric(result.diagnosticMetrics.positivePredictiveValue)}`,
        `  npv: ${formatMetric(result.diagnosticMetrics.negativePredictiveValue)}`,
      ] : []),
    ] : result.groupSummaries?.map(group =>
      `  ${group.exposureGroup}: n=${group.n}; ${group.endpointMeans.map(item => `${item.variable} mean=${item.mean ?? "NA"}`).join("; ")}`,
    ) ?? []),
    `  result: ${result.artifacts.resultJson}`,
    `  report: ${result.artifacts.reportMarkdown}`,
  ].join("\n");
}

export async function researchReviewReportCommand(packetDir: string): Promise<ResearchReportReview> {
  const resolved = path.resolve(packetDir);
  const packet = JSON.parse(await readFile(path.join(resolved, "design.json"), "utf-8")) as LabMedbreviaNhanesResult;
  const analysis = JSON.parse(await readFile(path.join(resolved, "analysis-result.json"), "utf-8")) as ResearchAnalysisResult;
  const report = await readFile(path.join(resolved, "report.md"), "utf-8");
  const issues = reviewReportText(report, packet, analysis);
  return {
    packetDir: resolved,
    status: issues.some(issue => issue.severity !== "note") ? "needs_review" : "pass",
    issues,
  };
}

export function renderResearchReportReview(review: ResearchReportReview): string {
  const lines = [
    `research report review: ${review.packetDir}`,
    `  status: ${review.status}`,
  ];
  if (!review.issues.length) {
    lines.push("  issues: none");
    return lines.join("\n");
  }
  lines.push("  issues:");
  for (const issue of review.issues) {
    lines.push(`    - [${issue.severity}] ${issue.code}: ${issue.message}`);
  }
  return lines.join("\n");
}

export async function researchArtifactManifestCommand(packetDir: string): Promise<ResearchArtifactManifest> {
  const resolved = path.resolve(packetDir);
  const artifactNames = await listResearchArtifactNames(resolved);
  const artifacts: ResearchArtifactManifest["artifacts"] = [];
  for (const name of artifactNames) {
    const artifactPath = path.join(resolved, name);
    const [info, contents] = await Promise.all([stat(artifactPath), readFile(artifactPath)]);
    artifacts.push({
      path: name,
      bytes: info.size,
      sha256: createHash("sha256").update(contents).digest("hex"),
    });
  }
  const manifest: ResearchArtifactManifest = {
    packetDir: resolved,
    generatedAtIso: new Date().toISOString(),
    artifacts,
  };
  await writeFile(path.join(resolved, "artifact-manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  return manifest;
}

export function renderResearchArtifactManifest(manifest: ResearchArtifactManifest): string {
  return [
    `research artifact manifest: ${manifest.packetDir}`,
    `  artifacts: ${manifest.artifacts.length}`,
    ...manifest.artifacts.map(artifact => `  - ${artifact.path} ${artifact.bytes} bytes ${artifact.sha256}`),
  ].join("\n");
}

export async function researchLoopStatusCommand(stateDir = ".agenteer/research-loop"): Promise<ResearchLoopStatus> {
  const resolved = path.resolve(stateDir);
  const [state, journal, backlog] = await Promise.all([
    readJsonIfPresent(path.join(resolved, "state.json")),
    readTextIfPresent(path.join(resolved, "journal.md")),
    readJsonIfPresent(path.join(resolved, "backlog.json")),
  ]);
  const backlogArray = Array.isArray(backlog) ? backlog : [];
  const journalEntries = journal ? Array.from(journal.matchAll(/^##\s+/gm)).length : 0;
  return {
    stateDir: resolved,
    stateExists: state !== null,
    state,
    journalEntries,
    backlogItems: backlogArray.length,
    nextAction: isRecord(state) && typeof state.nextAction === "string"
      ? state.nextAction
      : state
      ? "Use the recorded nextAction/currentPacket to continue the stage loop."
      : "Create state.json, journal.md, and backlog.json before the next long-running loop.",
  };
}

export function renderResearchLoopStatus(status: ResearchLoopStatus): string {
  return [
    `research loop status: ${status.stateDir}`,
    `  state: ${status.stateExists ? "present" : "missing"}`,
    `  journal entries: ${status.journalEntries}`,
    `  backlog items: ${status.backlogItems}`,
    `  next: ${status.nextAction}`,
  ].join("\n");
}

export function renderResearchLoopStatusJson(status: ResearchLoopStatus): string {
  return `${JSON.stringify({
    schemaVersion: 1,
    loopStatus: status,
  }, null, 2)}\n`;
}

export async function researchLoopNoteCommand(opts: ResearchLoopNoteOptions): Promise<ResearchLoopNoteResult> {
  const resolved = path.resolve(opts.stateDir ?? ".agenteer/research-loop");
  await mkdir(resolved, { recursive: true });
  const journalPath = path.join(resolved, "journal.md");
  const statePath = path.join(resolved, "state.json");
  const nextAction = opts.nextAction?.trim() || null;
  const entry = [
    `## Cycle ${opts.cycle}`,
    "",
    opts.summary.trim(),
    ...(nextAction ? ["", `Next: ${nextAction}`] : []),
    "",
  ].join("\n");
  await appendFile(journalPath, entry);

  const existing = await readJsonIfPresent(statePath);
  const state = {
    ...(isRecord(existing) ? existing : {}),
    cyclesCompletedThisRun: opts.cycle,
    lastJournaledAtIso: new Date().toISOString(),
    ...(nextAction ? { nextAction } : {}),
  };
  await writeFile(statePath, `${JSON.stringify(state, null, 2)}\n`);
  return {
    stateDir: resolved,
    cycle: opts.cycle,
    journalPath,
    statePath,
    nextAction,
  };
}

export function renderResearchLoopNote(result: ResearchLoopNoteResult): string {
  return [
    `research loop note: ${result.stateDir}`,
    `  cycle: ${result.cycle}`,
    `  journal: ${result.journalPath}`,
    `  state: ${result.statePath}`,
    `  next: ${result.nextAction ?? "(unchanged)"}`,
  ].join("\n");
}

export async function researchRunnerSpecCommand(packetDir: string): Promise<ResearchRunnerSpec> {
  const resolved = path.resolve(packetDir);
  const packet = JSON.parse(await readFile(path.join(resolved, "design.json"), "utf-8")) as LabMedbreviaNhanesResult;
  const scout = await readScoutIfPresent(resolved);
  const spec: ResearchRunnerSpec = {
    packetDir: resolved,
    generatedAtIso: new Date().toISOString(),
    runnerVersion: 0,
    mode: "local_fixture",
    inputs: {
      designPacket: path.join(resolved, "design.json"),
      scoutPlan: scout ? path.join(resolved, "scout-plan.json") : null,
      fixtureRowsJson: "<rows.json>",
    },
    outputs: {
      analysisResult: path.join(resolved, "analysis-result.json"),
      reportMarkdown: path.join(resolved, "report.md"),
      artifactManifest: path.join(resolved, "artifact-manifest.json"),
    },
    contract: {
      requiredVariables: scout?.requiredVariables ?? uniqueStrings([
        ...packet.protocol.exposure.variables,
        ...packet.protocol.endpoint.variables,
        ...packet.protocol.covariates,
        ...(packet.protocol.stratifiers ?? []),
      ]),
      populationFilters: packet.protocol.population.filters,
      exposureVariables: packet.protocol.exposure.variables,
      endpointVariables: packet.protocol.endpoint.variables,
      covariates: packet.protocol.covariates,
      stratifiers: packet.protocol.stratifiers ?? [],
      surveyWeight: packet.protocol.surveyDesign.weightVariable,
      analysisKind: usesContinuousByExposureGroup(packet.protocol) ? "continuous_by_exposure_group" : "binary_association",
    },
    safety: {
      cloudSpendUsd: 0,
      medbreviaMutationAllowed: false,
      requiresHumanApproval: true,
    },
  };
  await writeFile(path.join(resolved, "runner-spec.json"), `${JSON.stringify(spec, null, 2)}\n`);
  return spec;
}

export function renderResearchRunnerSpec(spec: ResearchRunnerSpec): string {
  return [
    `research runner spec: ${spec.packetDir}`,
    `  mode: ${spec.mode}`,
    `  analysis: ${spec.contract.analysisKind}`,
    `  required variables: ${spec.contract.requiredVariables.join(", ") || "(none)"}`,
    `  safety: cloud=$${spec.safety.cloudSpendUsd} medbrevia_mutation=${spec.safety.medbreviaMutationAllowed} approval=${spec.safety.requiresHumanApproval}`,
  ].join("\n");
}

export async function researchExportPacketCommand(packetDir: string, outDir: string): Promise<ResearchPacketExport> {
  const resolvedPacket = path.resolve(packetDir);
  const resolvedOut = path.resolve(outDir);
  await mkdir(resolvedOut, { recursive: true });
  const copiedArtifacts = uniqueStrings([
    ...await listResearchArtifactNames(resolvedPacket),
    "export-record.json",
    "artifact-manifest.json",
  ]).sort((a, b) => a.localeCompare(b));
  const summaryPath = path.join(resolvedOut, "export-summary.json");
  const summary: ResearchPacketExport = {
    packetDir: resolvedPacket,
    exportDir: resolvedOut,
    copiedArtifacts,
    summaryPath,
  };
  await writeFile(path.join(resolvedPacket, "export-record.json"), `${JSON.stringify(summary, null, 2)}\n`);

  const manifest = await researchArtifactManifestCommand(resolvedPacket);
  for (const artifact of manifest.artifacts) {
    await copyFile(path.join(resolvedPacket, artifact.path), path.join(resolvedOut, artifact.path));
  }
  await copyFile(path.join(resolvedPacket, "artifact-manifest.json"), path.join(resolvedOut, "artifact-manifest.json"));
  await writeFile(summaryPath, `${JSON.stringify(summary, null, 2)}\n`);
  return summary;
}

export function renderResearchPacketExport(result: ResearchPacketExport): string {
  return [
    `research packet export: ${result.exportDir}`,
    `  source: ${result.packetDir}`,
    `  artifacts: ${result.copiedArtifacts.join(", ")}`,
    `  summary: ${result.summaryPath}`,
  ].join("\n");
}

export async function researchCheckpointCommand(packetDir: string): Promise<ResearchCheckpoint> {
  const resolved = path.resolve(packetDir);
  const artifacts = {
    design: await exists(path.join(resolved, "design.json")),
    scoutPlan: await exists(path.join(resolved, "scout-plan.json")),
    runnerSpec: await exists(path.join(resolved, "runner-spec.json")),
    approval: await exists(path.join(resolved, "approval.json")),
    analysisResult: await exists(path.join(resolved, "analysis-result.json")),
    report: await exists(path.join(resolved, "report.md")),
    artifactManifest: await exists(path.join(resolved, "artifact-manifest.json")),
    exportRecord: await exists(path.join(resolved, "export-record.json")),
  };
  if (!artifacts.design) {
    return {
      packetDir: resolved,
      artifacts,
      currentStage: "design",
      nextCommand: "agenteer research design --project medbrevia-nhanes --repo <repo> --question <question> --out <packet-dir>",
      reason: "No design packet exists yet.",
    };
  }
  if (!artifacts.scoutPlan) {
    return {
      packetDir: resolved,
      artifacts,
      currentStage: "scout",
      nextCommand: `agenteer research critique --packet ${resolved} && agenteer research scout --packet ${resolved}`,
      reason: "Design exists; deterministic critique and scout planning should happen next.",
    };
  }
  if (!artifacts.approval) {
    if (!artifacts.runnerSpec) {
      return {
        packetDir: resolved,
        artifacts,
        currentStage: "runner_spec",
        nextCommand: `agenteer research runner-spec --packet ${resolved}`,
        reason: "Scout plan exists; define the local runner contract before human approval and analysis.",
      };
    }
    return {
      packetDir: resolved,
      artifacts,
      currentStage: "approval",
      nextCommand: `agenteer research approve --packet ${resolved} --note "<review note>"`,
      reason: "Scout plan exists; I should review it as human-in-the-loop before analysis.",
    };
  }
  if (!artifacts.analysisResult) {
    return {
      packetDir: resolved,
      artifacts,
      currentStage: "analysis",
      nextCommand: `agenteer research analyze --packet ${resolved} --fixture <rows.json>`,
      reason: "Packet is approved; local fixture analysis is the next bounded execution step.",
    };
  }
  if (!artifacts.report) {
    return {
      packetDir: resolved,
      artifacts,
      currentStage: "report_review",
      nextCommand: `agenteer research review-report --packet ${resolved}`,
      reason: "Analysis result exists but report artifact is missing; report review cannot complete yet.",
    };
  }
  if (!artifacts.artifactManifest) {
    return {
      packetDir: resolved,
      artifacts,
      currentStage: "manifest",
      nextCommand: `agenteer research manifest --packet ${resolved}`,
      reason: "Report exists and passed review should be followed by a reproducible artifact manifest.",
    };
  }
  if (!artifacts.exportRecord) {
    return {
      packetDir: resolved,
      artifacts,
      currentStage: "export",
      nextCommand: `agenteer research export --packet ${resolved} --out <export-dir>`,
      reason: "Manifest exists; export the packet into a durable tracking directory before calling it complete.",
    };
  }
  return {
    packetDir: resolved,
    artifacts,
    currentStage: "complete",
    nextCommand: "agenteer research questions --project medbrevia-nhanes --repo <repo>",
    reason: "Local packet has design, scout, approval, analysis, report, manifest, and export record artifacts; choose the next harder question.",
  };
}

export function renderResearchCheckpoint(checkpoint: ResearchCheckpoint): string {
  return [
    `research checkpoint: ${checkpoint.packetDir}`,
    `  stage: ${checkpoint.currentStage}`,
    `  artifacts: design=${checkpoint.artifacts.design} scout=${checkpoint.artifacts.scoutPlan} runner=${checkpoint.artifacts.runnerSpec} approval=${checkpoint.artifacts.approval} analysis=${checkpoint.artifacts.analysisResult} report=${checkpoint.artifacts.report} manifest=${checkpoint.artifacts.artifactManifest} export=${checkpoint.artifacts.exportRecord}`,
    `  reason: ${checkpoint.reason}`,
    `  next: ${checkpoint.nextCommand}`,
  ].join("\n");
}

export function renderResearchCheckpointJson(checkpoint: ResearchCheckpoint): string {
  return `${JSON.stringify({
    schemaVersion: 1,
    checkpoint,
  }, null, 2)}\n`;
}

async function loadNhanesRegistry(repoDir: string): Promise<NhanesRegistry> {
  const registryPath = path.join(path.resolve(repoDir), "data", "analytics", "nhanes", "registry.json");
  return JSON.parse(await readFile(registryPath, "utf-8")) as NhanesRegistry;
}

async function exists(file: string): Promise<boolean> {
  try {
    await access(file);
    return true;
  } catch {
    return false;
  }
}

async function listResearchArtifactNames(packetDir: string): Promise<string[]> {
  const artifactAllowlist = new Set([
    "design.json",
    "design.md",
    "workflow.yaml",
    "scout-plan.json",
    "runner-spec.json",
    "approval.json",
    "analysis-result.json",
    "report.md",
    "export-record.json",
  ]);
  return (await readdir(packetDir))
    .filter(name => artifactAllowlist.has(name))
    .sort((a, b) => a.localeCompare(b));
}

function buildNhanesQuestions(registry: NhanesRegistry): ResearchQuestionCandidate[] {
  const domains = new Set(Object.keys(registry.domains ?? {}));
  const out: ResearchQuestionCandidate[] = [];
  const add = (candidate: ResearchQuestionCandidate): void => {
    if (candidate.requiredDomains.every(domain => domains.has(domain))) out.push(candidate);
  };

  add({
    id: "vitd-hypertension",
    question: "In NHANES adults, is vitamin D deficiency associated with measured hypertension after BMI and smoking adjustment?",
    rationale: "Exercises lab measures, exam-based outcomes, covariate adjustment, and non-causal clinical reporting.",
    requiredDomains: ["demographics", "vitamin_d", "blood_pressure", "anthropometrics", "smoking"],
    difficulty: "starter",
    expectedStress: ["cycle selection", "MEC weights", "derived hypertension endpoint", "complete-case denominator"],
  });
  add({
    id: "obesity-diabetes",
    question: "Among NHANES adults, how does measured obesity relate to HbA1c-defined diabetes status after age, sex, and race/ethnicity adjustment?",
    rationale: "Tests anthropometric exposure, laboratory outcome, and threshold-derived disease definitions.",
    requiredDomains: ["demographics", "anthropometrics", "diabetes"],
    difficulty: "starter",
    expectedStress: ["threshold definitions", "MEC weights", "clinical caveats"],
  });
  add({
    id: "insurance-hypertension-control",
    question: "Among NHANES adults with measured hypertension, is health insurance coverage associated with uncontrolled blood pressure?",
    rationale: "Combines questionnaire exposure with measured endpoint and a restricted clinical subcohort.",
    requiredDomains: ["demographics", "insurance_access", "blood_pressure"],
    difficulty: "intermediate",
    expectedStress: ["subcohort definition", "interview versus MEC variable mixing", "small-cell warnings"],
  });
  add({
    id: "kidney-diabetes-gradient",
    question: "In NHANES adults, do kidney markers differ across HbA1c categories after adjustment for age, sex, race/ethnicity, and BMI?",
    rationale: "Exercises multi-category exposure definitions and laboratory kidney endpoints.",
    requiredDomains: ["demographics", "diabetes", "kidney", "anthropometrics"],
    difficulty: "intermediate",
    expectedStress: ["category derivation", "multiple lab domains", "missingness"],
  });
  add({
    id: "lipids-socioeconomic-gradient",
    question: "In NHANES adults, are lipid markers patterned by family income-to-poverty ratio after age, sex, race/ethnicity, and BMI adjustment?",
    rationale: "Tests socioeconomic stratification and continuous biomarker summaries.",
    requiredDomains: ["demographics", "lipids", "anthropometrics"],
    difficulty: "intermediate",
    expectedStress: ["continuous endpoints", "stratified tables", "non-causal interpretation"],
  });
  add({
    id: "smoking-bp-sex-strata",
    question: "Is smoking history associated with measured blood pressure differently by sex among NHANES adults?",
    rationale: "Adds effect-modification language and stratified reporting requirements.",
    requiredDomains: ["demographics", "smoking", "blood_pressure"],
    difficulty: "hard",
    expectedStress: ["interaction or stratification", "sparse cells", "report critique"],
  });

  return out;
}

function critiquePacket(packet: LabMedbreviaNhanesResult): ResearchCritiqueIssue[] {
  const issues: ResearchCritiqueIssue[] = [];
  const protocol = packet.protocol;
  const question = protocol?.clinicalQuestion?.toLowerCase() ?? "";
  const exposureVars = protocol?.exposure?.variables ?? [];
  const endpointVars = protocol?.endpoint?.variables ?? [];
  const covariates = protocol?.covariates ?? [];
  const stratifiers = protocol?.stratifiers ?? [];
  const caveats = (protocol?.caveats ?? []).join("\n").toLowerCase();
  const cycles = protocol?.cycles ?? [];

  const exposureCovariateOverlap = exposureVars.filter(variable => covariates.includes(variable));
  if (exposureCovariateOverlap.length) {
    issues.push({
      severity: "blocker",
      code: "EXPOSURE_COVARIATE_OVERLAP",
      message: `Primary exposure variable(s) also appear as covariates: ${exposureCovariateOverlap.join(", ")}.`,
    });
  }

  const endpointCovariateOverlap = endpointVars.filter(variable => covariates.includes(variable));
  if (endpointCovariateOverlap.length) {
    issues.push({
      severity: "blocker",
      code: "ENDPOINT_COVARIATE_OVERLAP",
      message: `Primary endpoint variable(s) also appear as covariates: ${endpointCovariateOverlap.join(", ")}.`,
    });
  }

  if (cycles.includes("2017-2020-prepandemic") && cycles.length > 1) {
    issues.push({
      severity: "blocker",
      code: "INVALID_PREPANDEMIC_POOLING",
      message: "The special 2017-March 2020 pre-pandemic release must not be pooled with standard two-year cycles.",
    });
  }

  const derivedDefinitionIds = new Set((protocol?.derivedDefinitions ?? []).map(definition => definition.id));

  if (question.includes("hba1c-defined diabetes") && endpointVars.includes("LBXGH") && !derivedDefinitionIds.has("hba1c_defined_diabetes")) {
    issues.push({
      severity: "warning",
      code: "MISSING_HBA1C_THRESHOLD",
      message: "The packet identifies HbA1c but does not yet encode the diabetes-status threshold, commonly HbA1c >= 6.5%.",
    });
  }

  if (/\b(income-to-poverty|income to poverty|family income|poverty ratio|socioeconomic)\b/.test(question)) {
    if (!exposureVars.includes("INDFMPIR")) {
      issues.push({
        severity: "blocker",
        code: "MISSING_INCOME_EXPOSURE",
        message: "The question frames income-to-poverty as the exposure, but INDFMPIR is not selected as the primary exposure.",
      });
    }
    if (covariates.includes("INDFMPIR")) {
      issues.push({
        severity: "blocker",
        code: "INCOME_EXPOSURE_AS_COVARIATE",
        message: "INDFMPIR should not be adjusted for when it is the income-to-poverty exposure.",
      });
    }
  }

  if (/\b(differently by sex|by sex|sex strata|stratified by sex|effect modification by sex)\b/.test(question)) {
    if (!stratifiers.includes("RIAGENDR")) {
      issues.push({
        severity: "blocker",
        code: "MISSING_SEX_STRATIFIER",
        message: "The question asks for differences by sex, so RIAGENDR should be represented as a stratifier or effect modifier.",
      });
    }
    if (covariates.includes("RIAGENDR")) {
      issues.push({
        severity: "blocker",
        code: "SEX_EFFECT_MODIFIER_AS_COVARIATE",
        message: "RIAGENDR should not be treated only as an adjustment covariate when the question asks for sex-specific differences.",
      });
    }
  }

  if (/\b(self-reported high blood pressure|self reported high blood pressure|told you had high blood pressure|doctor told.*high blood pressure)\b/.test(question)
    && !exposureVars.includes("BPQ020")) {
    issues.push({
      severity: "blocker",
      code: "MISSING_SELF_REPORTED_HYPERTENSION_EXPOSURE",
      message: "Self-reported high blood pressure should use BPQ020 as the exposure instead of measured BP readings.",
    });
  }

  if (question.includes("hypertension") && endpointVars.some(variable => variable.startsWith("BPX")) && !derivedDefinitionIds.has("measured_hypertension")) {
    issues.push({
      severity: "warning",
      code: "MISSING_HYPERTENSION_DEFINITION",
      message: "The packet identifies blood pressure readings but should explicitly encode the measured-hypertension threshold before execution.",
    });
  }

  if (question.includes("uncontrolled blood pressure") && endpointVars.some(variable => variable.startsWith("BPX")) && !derivedDefinitionIds.has("uncontrolled_blood_pressure")) {
    issues.push({
      severity: "warning",
      code: "MISSING_UNCONTROLLED_BP_DEFINITION",
      message: "The packet should define uncontrolled blood pressure separately from the measured-hypertension subcohort.",
    });
  }

  if (/\b(adults|participants|people|persons) with measured hypertension\b/.test(question)) {
    const measured = (protocol?.derivedDefinitions ?? []).find(definition => definition.id === "measured_hypertension");
    if (measured && measured.role !== "filter") {
      issues.push({
        severity: "warning",
        code: "HYPERTENSION_SUBCOHORT_NOT_FILTER",
        message: "The measured-hypertension definition should be a filter when the question asks among adults with measured hypertension.",
      });
    }
  }

  if ((question.includes("associated") || question.includes("relate")) && !/observational|cross-sectional|non-causal/.test(caveats)) {
    issues.push({
      severity: "warning",
      code: "MISSING_NONCAUSAL_CAVEAT",
      message: "Association-style NHANES questions should carry an explicit observational, cross-sectional, non-causal caveat.",
    });
  }

  if (!packet.source?.registrySha256) {
    issues.push({
      severity: "warning",
      code: "MISSING_REGISTRY_HASH",
      message: "Packet should include a registry SHA-256 hash for reproducibility.",
    });
  }

  if (!issues.length) {
    issues.push({
      severity: "note",
      code: "READY_FOR_SCOUT",
      message: "No deterministic critique issues found; proceed to cohort scout or human approval.",
    });
  }

  return issues;
}

function buildScoutPlan(packetDir: string, packet: LabMedbreviaNhanesResult): ResearchScoutPlan {
  const protocol = packet.protocol;
  const survey = protocol.surveyDesign;
  const requiredVariables = uniqueStrings([
    ...protocol.exposure.variables,
    ...protocol.endpoint.variables,
    ...protocol.covariates,
    ...(protocol.stratifiers ?? []),
    ...protocol.population.filters.flatMap(extractVariableNames),
    ...protocol.derivedDefinitions.flatMap(def => def.variables),
    survey.weightVariable,
    survey.strataVariable,
    survey.psuVariable,
    "SEQN",
  ]);

  return {
    packetDir,
    status: "plan_ready",
    title: protocol.title,
    cycles: protocol.cycles,
    domains: protocol.approvedDataInputs,
    requiredVariables,
    caseRequirements: {
      populationFilters: protocol.population.filters,
      filterDefinitions: protocol.derivedDefinitions.filter(def => def.role === "filter").map(def => def.id),
      exposureAnyOf: protocol.exposure.variables,
      endpointAnyOf: protocol.endpoint.variables,
      covariatesAllOf: protocol.covariates,
      stratifiers: protocol.stratifiers ?? [],
      positiveWeight: survey.weightVariable,
    },
    surveyDesign: {
      weightVariable: survey.weightVariable,
      strataVariable: survey.strataVariable,
      psuVariable: survey.psuVariable,
    },
    derivedDefinitions: protocol.derivedDefinitions.map(def => ({
      id: def.id,
      expression: def.expression,
      variables: def.variables,
    })),
    plannedMetrics: [
      "base rows after domain merge",
      "eligible rows after population filters",
      "nonmissing exposure rows",
      "nonmissing endpoint rows",
      "positive survey-weight rows",
      "complete-case model rows",
      "minimum subgroup cell size when stratifiers are present",
    ],
    localDataStatus: "not_available",
    nextAction: "Attach a local fixture or runner adapter to compute scout metrics without cloud spend.",
  };
}

async function readScoutIfPresent(packetDir: string): Promise<ResearchScoutPlan | null> {
  try {
    return JSON.parse(await readFile(path.join(packetDir, "scout-plan.json"), "utf-8")) as ResearchScoutPlan;
  } catch {
    return null;
  }
}

async function readApprovalIfPresent(packetDir: string): Promise<ResearchApprovalRecord | null> {
  try {
    return JSON.parse(await readFile(path.join(packetDir, "approval.json"), "utf-8")) as ResearchApprovalRecord;
  } catch {
    return null;
  }
}

async function readJsonIfPresent(file: string): Promise<unknown | null> {
  try {
    return JSON.parse(await readFile(file, "utf-8")) as unknown;
  } catch {
    return null;
  }
}

async function readTextIfPresent(file: string): Promise<string | null> {
  try {
    return await readFile(file, "utf-8");
  } catch {
    return null;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function computeLocalAnalysis(
  packetDir: string,
  packet: LabMedbreviaNhanesResult,
  rows: Array<Record<string, unknown>>,
): ResearchAnalysisResult {
  const protocol = packet.protocol;
  const eligible = rows.filter(row => isEligibleForProtocol(protocol, row));
  const modelReady = eligible.filter(row => hasCompleteModelInputs(protocol, row));
  const resultJson = path.join(packetDir, "analysis-result.json");
  const reportMarkdown = path.join(packetDir, "report.md");

  if (usesContinuousByExposureGroup(protocol)) {
    return {
      packetDir,
      status: "completed",
      title: protocol.title,
      analysisMode: "local_fixture_unweighted",
      analysisKind: "continuous_by_exposure_group",
      eligibleRows: eligible.length,
      completeCaseRows: modelReady.length,
      exposurePositiveRows: 0,
      endpointPositiveRows: 0,
      twoByTwo: [],
      groupSummaries: buildContinuousGroupSummaries(protocol, modelReady),
      artifacts: {
        resultJson,
        reportMarkdown,
      },
    };
  }

  const complete = eligible
    .filter(row => hasCompleteModelInputs(protocol, row))
    .map(row => ({
      row,
      exposure: evaluateExposure(protocol, row),
      endpoint: evaluateEndpoint(protocol, row),
    }))
    .filter((item): item is { row: Record<string, unknown>; exposure: boolean; endpoint: boolean } =>
      item.exposure !== null && item.endpoint !== null,
    );
  const labels = ["negative_or_reference", "positive_or_exposed"];
  const table = labels.map(label => {
    const exposed = label === "positive_or_exposed";
    const subset = complete.filter(item => item.exposure === exposed);
    return {
      exposure: label,
      endpointNegative: subset.filter(item => item.endpoint === false).length,
      endpointPositive: subset.filter(item => item.endpoint === true).length,
      total: subset.length,
    };
  });
  return {
    packetDir,
    status: "completed",
    title: protocol.title,
    analysisMode: "local_fixture_unweighted",
    analysisKind: "binary_association",
    eligibleRows: eligible.length,
    completeCaseRows: complete.length,
    exposurePositiveRows: complete.filter(item => item.exposure === true).length,
    endpointPositiveRows: complete.filter(item => item.endpoint === true).length,
    twoByTwo: table,
    stratifiedTwoByTwo: buildStratifiedTwoByTwo(protocol, complete),
    diagnosticMetrics: buildDiagnosticMetrics(protocol, complete),
    artifacts: {
      resultJson,
      reportMarkdown,
    },
  };
}

function buildDiagnosticMetrics(
  protocol: LabMedbreviaNhanesResult["protocol"],
  complete: Array<{ row: Record<string, unknown>; exposure: boolean; endpoint: boolean }>,
): ResearchAnalysisResult["diagnosticMetrics"] {
  if (!protocol.exposure.variables.includes("BPQ020") || !protocol.derivedDefinitions.some(def => def.id === "measured_hypertension")) {
    return undefined;
  }
  const tp = complete.filter(item => item.exposure === true && item.endpoint === true).length;
  const fp = complete.filter(item => item.exposure === true && item.endpoint === false).length;
  const tn = complete.filter(item => item.exposure === false && item.endpoint === false).length;
  const fn = complete.filter(item => item.exposure === false && item.endpoint === true).length;
  return {
    sensitivity: safeRatio(tp, tp + fn),
    specificity: safeRatio(tn, tn + fp),
    positivePredictiveValue: safeRatio(tp, tp + fp),
    negativePredictiveValue: safeRatio(tn, tn + fn),
  };
}

function safeRatio(numerator: number, denominator: number): number | null {
  return denominator > 0 ? numerator / denominator : null;
}

function formatMetric(value: number | null): string {
  return value === null ? "NA" : value.toFixed(3);
}

function buildStratifiedTwoByTwo(
  protocol: LabMedbreviaNhanesResult["protocol"],
  complete: Array<{ row: Record<string, unknown>; exposure: boolean; endpoint: boolean }>,
): ResearchAnalysisResult["stratifiedTwoByTwo"] {
  const stratifiers = protocol.stratifiers ?? [];
  if (!stratifiers.length) return undefined;
  const labels = ["negative_or_reference", "positive_or_exposed"];
  const out: NonNullable<ResearchAnalysisResult["stratifiedTwoByTwo"]> = [];
  for (const stratifier of stratifiers) {
    const levels = uniqueStrings(complete.map(item => formatStratifierLevel(stratifier, item.row[stratifier])));
    for (const level of levels) {
      const stratum = complete.filter(item => formatStratifierLevel(stratifier, item.row[stratifier]) === level);
      out.push({
        stratifier,
        level,
        rows: labels.map(label => {
          const exposed = label === "positive_or_exposed";
          const subset = stratum.filter(item => item.exposure === exposed);
          return {
            exposure: label,
            endpointNegative: subset.filter(item => item.endpoint === false).length,
            endpointPositive: subset.filter(item => item.endpoint === true).length,
            total: subset.length,
          };
        }),
      });
    }
  }
  return out;
}

function formatStratifierLevel(stratifier: string, value: unknown): string {
  if (stratifier === "RIAGENDR") {
    if (Number(value) === 1) return "male";
    if (Number(value) === 2) return "female";
  }
  return String(value);
}

function usesContinuousByExposureGroup(protocol: LabMedbreviaNhanesResult["protocol"]): boolean {
  const derivedIds = new Set(protocol.derivedDefinitions.map(def => def.id));
  const hasContinuousEndpoint = protocol.endpoint.variables.some(variable =>
    ["URDACT", "LBXSCR", "LBXTC", "LBDHDD", "LBXTR"].includes(variable),
  );
  return hasContinuousEndpoint
    && ((derivedIds.has("hba1c_categories") && protocol.exposure.variables.includes("LBXGH"))
      || (derivedIds.has("income_poverty_ratio_categories") && protocol.exposure.variables.includes("INDFMPIR")));
}

function buildContinuousGroupSummaries(
  protocol: LabMedbreviaNhanesResult["protocol"],
  rows: Array<Record<string, unknown>>,
): NonNullable<ResearchAnalysisResult["groupSummaries"]> {
  const groupOrder = exposureGroupOrder(protocol);
  return groupOrder.map(exposureGroup => {
    const groupRows = rows.filter(row => exposureGroupForProtocol(protocol, row) === exposureGroup);
    return {
      exposureGroup,
      n: groupRows.length,
      endpointMeans: protocol.endpoint.variables.map(variable => ({
        variable,
        mean: meanNumbers(groupRows.map(row => row[variable])),
      })),
    };
  });
}

function exposureGroupOrder(protocol: LabMedbreviaNhanesResult["protocol"]): string[] {
  if (protocol.derivedDefinitions.some(def => def.id === "income_poverty_ratio_categories")) {
    return ["lt_1_3", "1_3_to_3_5", "gt_3_5"];
  }
  return ["lt_5_7", "5_7_to_6_4", "gte_6_5"];
}

function exposureGroupForProtocol(
  protocol: LabMedbreviaNhanesResult["protocol"],
  row: Record<string, unknown>,
): string | null {
  if (protocol.derivedDefinitions.some(def => def.id === "income_poverty_ratio_categories")) {
    return incomePovertyCategory(row);
  }
  return hba1cCategory(row);
}

function hba1cCategory(row: Record<string, unknown>): string | null {
  const value = Number(row.LBXGH);
  if (!Number.isFinite(value)) return null;
  if (value < 5.7) return "lt_5_7";
  if (value < 6.5) return "5_7_to_6_4";
  return "gte_6_5";
}

function incomePovertyCategory(row: Record<string, unknown>): string | null {
  const value = Number(row.INDFMPIR);
  if (!Number.isFinite(value)) return null;
  if (value < 1.3) return "lt_1_3";
  if (value <= 3.5) return "1_3_to_3_5";
  return "gt_3_5";
}

function hasCompleteModelInputs(protocol: LabMedbreviaNhanesResult["protocol"], row: Record<string, unknown>): boolean {
  const weight = protocol.surveyDesign.weightVariable;
  return hasAnyValue(row, protocol.exposure.variables)
    && hasAnyValue(row, protocol.endpoint.variables)
    && protocol.covariates.every(variable => hasValue(row[variable]))
    && (protocol.stratifiers ?? []).every(variable => hasValue(row[variable]))
    && (weight ? Number(row[weight]) > 0 : true);
}

function evaluateExposure(protocol: LabMedbreviaNhanesResult["protocol"], row: Record<string, unknown>): boolean | null {
  if (protocol.derivedDefinitions.some(def => def.id === "vitamin_d_deficiency")) {
    const value = Number(row.LBXVIDMS);
    return Number.isFinite(value) ? value < 50 : null;
  }
  if (protocol.exposure.variables.includes("BMXBMI")) {
    const value = Number(row.BMXBMI);
    return Number.isFinite(value) ? value >= 30 : null;
  }
  if (protocol.exposure.variables.includes("HIQ011")) {
    const value = Number(row.HIQ011);
    if (!Number.isFinite(value) || value === 7 || value === 9) return null;
    return value === 1;
  }
  if (protocol.exposure.variables.includes("SMQ020")) {
    const value = Number(row.SMQ020);
    if (!Number.isFinite(value) || value === 7 || value === 9) return null;
    return value === 1;
  }
  if (protocol.exposure.variables.includes("BPQ020")) {
    const value = Number(row.BPQ020);
    if (!Number.isFinite(value) || value === 7 || value === 9) return null;
    return value === 1;
  }
  const variable = protocol.exposure.variables[0];
  return variable && hasValue(row[variable]) ? Boolean(row[variable]) : null;
}

function evaluateEndpoint(protocol: LabMedbreviaNhanesResult["protocol"], row: Record<string, unknown>): boolean | null {
  if (protocol.derivedDefinitions.some(def => def.id === "uncontrolled_blood_pressure")) {
    return evaluateDerivedDefinition("uncontrolled_blood_pressure", row);
  }
  if (protocol.derivedDefinitions.some(def => def.id === "measured_hypertension")) {
    return evaluateDerivedDefinition("measured_hypertension", row);
  }
  if (protocol.derivedDefinitions.some(def => def.id === "hba1c_defined_diabetes")) {
    const value = Number(row.LBXGH);
    return Number.isFinite(value) ? value >= 6.5 : null;
  }
  const variable = protocol.endpoint.variables[0];
  return variable && hasValue(row[variable]) ? Boolean(row[variable]) : null;
}

function evaluateDerivedDefinition(id: string, row: Record<string, unknown>): boolean | null {
  if (id === "measured_hypertension") {
    const systolic = meanNumbers([row.BPXSY1, row.BPXSY2, row.BPXSY3]);
    const diastolic = meanNumbers([row.BPXDI1, row.BPXDI2, row.BPXDI3]);
    if (systolic === null && diastolic === null) return null;
    return (systolic !== null && systolic >= 130) || (diastolic !== null && diastolic >= 80);
  }
  if (id === "uncontrolled_blood_pressure") {
    const systolic = meanNumbers([row.BPXSY1, row.BPXSY2, row.BPXSY3]);
    const diastolic = meanNumbers([row.BPXDI1, row.BPXDI2, row.BPXDI3]);
    if (systolic === null && diastolic === null) return null;
    return (systolic !== null && systolic >= 140) || (diastolic !== null && diastolic >= 90);
  }
  return null;
}

function meanNumbers(values: unknown[]): number | null {
  const nums = values.map(value => Number(value)).filter(value => Number.isFinite(value));
  if (!nums.length) return null;
  return nums.reduce((sum, value) => sum + value, 0) / nums.length;
}

function renderAnalysisReport(packet: LabMedbreviaNhanesResult, result: ResearchAnalysisResult): string {
  const sparseCellCaveat = hasSparseStratifiedCells(result)
    ? ["Sparse stratified cells are present in this local fixture; subgroup patterns should be treated as pipeline-validation output only."]
    : [];
  if (result.analysisKind === "continuous_by_exposure_group") {
    const endpoints = packet.protocol.endpoint.variables;
    const header = `| Exposure group | N | ${endpoints.map(variable => `${variable} mean`).join(" | ")} |`;
    const divider = `| --- | ---: | ${endpoints.map(() => "---:").join(" | ")} |`;
    const rows = (result.groupSummaries ?? [])
      .map(group => `| ${group.exposureGroup} | ${group.n} | ${group.endpointMeans.map(item => item.mean ?? "NA").join(" | ")} |`)
      .join("\n");
    return [
      `# ${result.title}`,
      "",
      `Question: ${packet.protocol.clinicalQuestion}`,
      "",
      "## Local Fixture Result",
      "",
      `Eligible rows: ${result.eligibleRows}`,
      `Complete-case rows: ${result.completeCaseRows}`,
      "",
      header,
      divider,
      rows,
      "",
      "## Caveats",
      "",
      "This is a local fixture analysis for pipeline validation only. It is unweighted and not a NHANES population estimate.",
      ...sparseCellCaveat,
      ...packet.protocol.caveats.map(caveat => `- ${caveat}`),
      "",
    ].join("\n");
  }

  const rows = result.twoByTwo
    .map(row => `| ${row.exposure} | ${row.endpointNegative} | ${row.endpointPositive} | ${row.total} |`)
    .join("\n");
  const stratifiedSections = (result.stratifiedTwoByTwo ?? []).flatMap(stratum => [
    "",
    `### ${stratum.stratifier} = ${stratum.level}`,
    "",
    "| Exposure group | Endpoint negative | Endpoint positive | Total |",
    "| --- | ---: | ---: | ---: |",
    ...stratum.rows.map(row => `| ${row.exposure} | ${row.endpointNegative} | ${row.endpointPositive} | ${row.total} |`),
  ]);
  const diagnosticSection = result.diagnosticMetrics ? [
    "",
    "### Diagnostic Metrics",
    "",
    `Sensitivity: ${formatMetric(result.diagnosticMetrics.sensitivity)}`,
    `Specificity: ${formatMetric(result.diagnosticMetrics.specificity)}`,
    `Positive predictive value: ${formatMetric(result.diagnosticMetrics.positivePredictiveValue)}`,
    `Negative predictive value: ${formatMetric(result.diagnosticMetrics.negativePredictiveValue)}`,
  ] : [];
  return [
    `# ${result.title}`,
    "",
    `Question: ${packet.protocol.clinicalQuestion}`,
    "",
    "## Local Fixture Result",
    "",
    `Eligible rows: ${result.eligibleRows}`,
    `Complete-case rows: ${result.completeCaseRows}`,
    "",
    "| Exposure group | Endpoint negative | Endpoint positive | Total |",
    "| --- | ---: | ---: | ---: |",
    rows,
    ...stratifiedSections,
    ...diagnosticSection,
    "",
    "## Caveats",
    "",
    "This is a local fixture analysis for pipeline validation only. It is unweighted and not a NHANES population estimate.",
    ...sparseCellCaveat,
    ...packet.protocol.caveats.map(caveat => `- ${caveat}`),
    "",
  ].join("\n");
}

function hasSparseStratifiedCells(result: ResearchAnalysisResult): boolean {
  return (result.stratifiedTwoByTwo ?? []).some(stratum =>
    stratum.rows.some(row => row.total > 0 && row.total < 5),
  );
}

function reviewReportText(
  report: string,
  packet: LabMedbreviaNhanesResult,
  analysis: ResearchAnalysisResult,
): ResearchCritiqueIssue[] {
  const text = report.toLowerCase();
  const issues: ResearchCritiqueIssue[] = [];
  if (!text.includes("unweighted")) {
    issues.push({
      severity: "warning",
      code: "MISSING_UNWEIGHTED_FIXTURE_CAVEAT",
      message: "Local fixture reports must state that the result is unweighted.",
    });
  }
  if (!text.includes("not a nhanes population estimate")) {
    issues.push({
      severity: "warning",
      code: "MISSING_POPULATION_ESTIMATE_CAVEAT",
      message: "Local fixture reports must state that the result is not a NHANES population estimate.",
    });
  }
  if (!/observational|cross-sectional|non-causal/.test(text)) {
    issues.push({
      severity: "warning",
      code: "MISSING_NONCAUSAL_REPORT_CAVEAT",
      message: "Report should preserve the non-causal observational NHANES caveat.",
    });
  }
  for (const stratifier of packet.protocol.stratifiers ?? []) {
    if (!text.includes(stratifier.toLowerCase())) {
      issues.push({
        severity: "warning",
        code: "MISSING_STRATIFIED_REPORT_SECTION",
        message: `Report should include a stratified result section for ${stratifier}.`,
      });
    }
  }
  const sparseStratifiedCells = (analysis.stratifiedTwoByTwo ?? [])
    .flatMap(stratum => stratum.rows.map(row => ({ stratum, row })))
    .filter(item => item.row.total > 0 && item.row.total < 5);
  if (sparseStratifiedCells.length && !text.includes("sparse stratified")) {
    issues.push({
      severity: "warning",
      code: "SPARSE_STRATIFIED_CELL",
      message: "At least one non-empty stratified fixture cell has fewer than 5 rows; report should flag sparse-cell instability.",
    });
  }
  if (analysis.analysisKind === "continuous_by_exposure_group" && !text.includes("exposure group")) {
    issues.push({
      severity: "warning",
      code: "MISSING_GROUP_SUMMARY_TABLE",
      message: "Continuous grouped analyses should report endpoint summaries by exposure group.",
    });
  }
  if (analysis.diagnosticMetrics && (!text.includes("sensitivity") || !text.includes("specificity"))) {
    issues.push({
      severity: "warning",
      code: "MISSING_DIAGNOSTIC_METRICS",
      message: "Reports for questionnaire-versus-measured endpoint analyses should include diagnostic metrics.",
    });
  }
  if (!issues.length) {
    issues.push({
      severity: "note",
      code: "REPORT_READY",
      message: "Report contains the expected local-fixture and non-causal caveats.",
    });
  }
  return issues;
}

function computeScoutMetrics(
  plan: ResearchScoutPlan,
  packet: LabMedbreviaNhanesResult,
  rows: Array<Record<string, unknown>>,
): Pick<ResearchScoutPlan, "status" | "localDataStatus" | "metrics" | "nextAction"> {
  const protocol = packet.protocol;
  const eligible = rows.filter(row => isEligibleForProtocol(protocol, row));
  const exposureRows = eligible.filter(row => hasAnyValue(row, protocol.exposure.variables));
  const endpointRows = eligible.filter(row => hasAnyValue(row, protocol.endpoint.variables));
  const weight = protocol.surveyDesign.weightVariable;
  const positiveWeightRows = eligible.filter(row => weight ? Number(row[weight]) > 0 : false);
  const covariates = protocol.covariates;
  const stratifiers = protocol.stratifiers ?? [];
  const completeCaseRows = eligible.filter(row =>
    hasAnyValue(row, protocol.exposure.variables)
      && hasAnyValue(row, protocol.endpoint.variables)
      && covariates.every(variable => hasValue(row[variable]))
      && stratifiers.every(variable => hasValue(row[variable]))
      && (weight ? Number(row[weight]) > 0 : true)
  );

  return {
    status: "computed",
    localDataStatus: "fixture_loaded",
    metrics: {
      baseRows: rows.length,
      eligibleRows: eligible.length,
      nonmissingExposureRows: exposureRows.length,
      nonmissingEndpointRows: endpointRows.length,
      positiveWeightRows: positiveWeightRows.length,
      completeCaseRows: completeCaseRows.length,
    },
    nextAction: completeCaseRows.length > 0
      ? "Review fixture scout metrics, then proceed to human approval or runner adapter design."
      : "Fixture scout found no complete-case rows; revise protocol or fixture before execution.",
  };
}

function isEligible(row: Record<string, unknown>): boolean {
  const status = row.RIDSTATR == null ? 2 : Number(row.RIDSTATR);
  const age = row.RIDAGEYR == null ? 20 : Number(row.RIDAGEYR);
  return status === 2 && age >= 20;
}

function isEligibleForProtocol(
  protocol: LabMedbreviaNhanesResult["protocol"],
  row: Record<string, unknown>,
): boolean {
  return isEligible(row) && protocol.derivedDefinitions
    .filter(def => def.role === "filter")
    .every(def => evaluateDerivedDefinition(def.id, row) === true);
}

function hasAnyValue(row: Record<string, unknown>, variables: readonly string[]): boolean {
  return variables.some(variable => hasValue(row[variable]));
}

function hasValue(value: unknown): boolean {
  return value !== null && value !== undefined && value !== "" && !(typeof value === "number" && Number.isNaN(value));
}

function extractVariableNames(expression: string): string[] {
  return Array.from(expression.matchAll(/\b[A-Z][A-Z0-9_]{2,}\b/g)).map(match => match[0]);
}

function uniqueStrings(values: Array<string | null | undefined>): string[] {
  return Array.from(new Set(values.filter((value): value is string => Boolean(value)))).sort((a, b) => a.localeCompare(b));
}
