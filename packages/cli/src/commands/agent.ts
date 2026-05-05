import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { access, mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const DEFAULT_AUTOCONTEXT_ROOT = "/Users/saleh/TechProjects/context";

export type AgentCriticCategory = "product" | "research" | "architecture" | "execution" | "safety" | "context" | "cost";
export type AgentSeverity = "blocker" | "warning" | "note";

export interface AgentIssue {
  severity: AgentSeverity;
  category: AgentCriticCategory;
  code: string;
  message: string;
  evidenceRefs: string[];
  repairAction: string;
  confidence: number;
}

export interface AgentContextOptions {
  contextBin?: string;
  autocontextRoot?: string;
}

export interface AgentContextCommandResult {
  ok: boolean;
  command: string[];
  stdout: string;
  stderr: string;
  parsed: unknown | null;
  error: string | null;
}

export type AgentContextSourceType = "file" | "memory" | "symbol" | "docs" | "web" | "x_weak_signal" | "generated_summary" | "user_instruction" | "autocontext_status" | "autocontext_pack" | "autocontext_impact";

export interface AgentContextManifestSource {
  id: string;
  sourceType: AgentContextSourceType;
  pathOrUrl: string | null;
  hash: string;
  lastModified: string | null;
  includedTokens: number;
  reasonIncluded: string;
  knownLimitations: string[];
}

export interface AgentContextManifestPolicy {
  minimumScore: number;
  minimumFreshness: number;
  maximumContradictionRisk: number;
  failOnMissingPack: boolean;
}

export interface AgentContextOutcomeRecord {
  recordedAtIso: string;
  resultId: string;
  status: "success" | "failure" | "blocked" | "unknown";
  scoreDelta: number;
  summary: string;
  evidenceHash: string;
}

export interface AgentContextPackManifest {
  schemaVersion: 1;
  contextPackId: string;
  createdAtIso: string;
  repo: string;
  query: string;
  target: string | null;
  budgetTokens: number;
  estimatedTokens: number;
  sources: AgentContextManifestSource[];
  sourceHashes: string[];
  freshness: number;
  relevanceScore: number;
  contradictionRisk: number;
  coverage: number;
  score: number;
  memoryHits: AgentContextPreflight["memoryHits"];
  missingContext: string[];
  downstreamOutcomeHistory: AgentContextOutcomeRecord[];
  policy: AgentContextManifestPolicy;
  status: "ready" | "degraded" | "blocked";
  nextAction: string;
}

export interface AgentContextScore {
  contextPackId: string;
  status: AgentContextPackManifest["status"];
  score: number;
  freshness: number;
  relevanceScore: number;
  contradictionRisk: number;
  coverage: number;
  issues: AgentIssue[];
  nextAction: string;
}

export interface AgentContextPreflight {
  repo: string;
  query: string;
  target: string | null;
  status: AgentContextCommandResult;
  pack: AgentContextCommandResult;
  impact: AgentContextCommandResult | null;
  memoryHits: Array<{ file: string; score: number; excerpt: string }>;
  staleOrMissing: boolean;
  contextManifest: AgentContextPackManifest;
  nextAction: string;
}

export interface AgentContextPack {
  repo: string;
  seed: { kind: "query" | "file" | "symbol"; value: string };
  budget: number;
  result: AgentContextCommandResult;
  contextManifest: AgentContextPackManifest;
}

export interface AgentContextImpact {
  repo: string;
  target: string;
  result: AgentContextCommandResult;
}

export interface AgentContextVerify {
  repo: string;
  result: AgentContextCommandResult;
}

export interface AgentPlanStep {
  id: string;
  title: string;
  kind: "context" | "plan" | "execute" | "verify" | "repair" | "research" | "review";
  dependsOn: string[];
  expectedEvidence: string[];
  status: "pending" | "completed" | "invalidated";
  mode?: "exploratory" | "review_gate" | "executable";
  command?: string;
  manifestId?: string;
  nodeProposal?: string;
  contractId?: string;
}

export interface AgentNodeArtifactEffect {
  id: string;
  kind: "read" | "write" | "emit" | "delete";
  pathTemplate: string;
  required: boolean;
  description: string;
}

export interface AgentNodeFailureType {
  code: string;
  severity: AgentSeverity;
  category: AgentCriticCategory;
  retryable: boolean;
  repairAction: string;
  description: string;
}

export interface AgentNodeVerifier {
  kind: "json-schema" | "command" | "manual";
  inputRequired: boolean;
  outputRequired: boolean;
  command: string | null;
  evidenceRefs: string[];
}

export interface AgentNodePermissions {
  requiredActions: string[];
  dynamicActions: boolean;
  dynamicActionSpec: string | null;
}

export interface AgentNodeCostBoundary {
  maxUsd: number;
  maxRuntimeSeconds: number | null;
  cloudAllowed: boolean;
}

export interface AgentNodeSideEffects {
  writesFs: boolean;
  network: boolean;
  mutatesCtx: boolean;
  emitsCtxVariants: string[];
}

export interface AgentNodeStability {
  determinism: "deterministic" | "stochastic";
  maturity: "experimental" | "stable" | "deprecated";
}

export interface AgentNodeContractExample {
  name: string;
  input: unknown;
  output: unknown;
}

export interface AgentNodeContract {
  schemaVersion: 1;
  nodeId: string;
  displayName: string;
  domain: string;
  inputSchema: unknown;
  outputSchema: unknown;
  artifactEffects: AgentNodeArtifactEffect[];
  failureTypes: AgentNodeFailureType[];
  verifier: AgentNodeVerifier;
  permissions: AgentNodePermissions;
  costBoundary: AgentNodeCostBoundary;
  sideEffects: AgentNodeSideEffects;
  stability: AgentNodeStability;
  examples: AgentNodeContractExample[];
}

export interface AgentJsonSchemaIssue {
  path: string;
  code: string;
  message: string;
}

export interface AgentNodeContractValidation {
  contract: AgentNodeContract;
  status: "pass" | "needs_revision" | "blocked";
  issues: AgentIssue[];
  inputExampleIssues: AgentJsonSchemaIssue[];
  outputExampleIssues: AgentJsonSchemaIssue[];
  nextAction: string;
}

export interface AgentNodeContractRegistry {
  dir: string;
  contracts: AgentNodeContract[];
  issues: AgentIssue[];
  nextAction: string;
}

export interface AgentNodeIoValidation {
  nodeId: string;
  kind: "input" | "output";
  status: "pass" | "fail";
  issues: AgentJsonSchemaIssue[];
  typedFailures: AgentNodeFailureType[];
  nextAction: string;
}

export interface AgentNodeArtifactRecord {
  id: string;
  kind: AgentNodeArtifactEffect["kind"];
  path: string;
  required: boolean;
  exists: boolean;
  hash: string | null;
}

export interface AgentNodeExecutionRecord {
  schemaVersion: 1;
  nodeId: string;
  status: "passed" | "failed";
  inputValidation: AgentNodeIoValidation;
  outputValidation: AgentNodeIoValidation;
  artifactRecords: AgentNodeArtifactRecord[];
  typedFailures: AgentNodeFailureType[];
  provenance: {
    recordedAtIso: string;
    inputHash: string;
    outputHash: string;
    contractHash: string;
  };
  repairHint: string;
}

export interface AgentNodeContractSummary {
  nodeId: string;
  displayName: string;
  domain: string;
  verifierKind: AgentNodeVerifier["kind"];
  artifactEffects: string[];
  failureTypes: string[];
  costBoundary: AgentNodeCostBoundary;
}

export interface AgentPlanCandidate {
  id: string;
  goal: string;
  strategy: string;
  assumptions: string[];
  steps: AgentPlanStep[];
  expectedEvidence: string[];
  risk: number;
  confidence: number;
  estimatedCostUsd: number;
  noveltyScore: number;
  utility: number;
  capabilitiesUsed?: string[];
  nodeProposals?: string[];
  nodeContracts?: AgentNodeContractSummary[];
  evidenceTrace?: Array<{ stepId: string; expectedEvidence: string[]; source: string }>;
  contextManifestId?: string | null;
  contextQuality?: Pick<AgentContextPackManifest, "status" | "score" | "freshness" | "relevanceScore" | "contradictionRisk" | "coverage"> | null;
}

export interface AgentPlanPortfolio {
  schemaVersion: 1;
  goal: string;
  generatedAtIso: string;
  contextPackPath: string | null;
  contextManifestPath: string | null;
  contextManifestId: string | null;
  contextQuality: AgentPlanCandidate["contextQuality"];
  nodeContracts: AgentNodeContractSummary[];
  candidates: AgentPlanCandidate[];
  selectedCandidateId: string;
  nextAction: string;
}

export interface AgentReplanEvent {
  kind: "failure" | "new_evidence" | "user_correction" | "stale_context" | "verification_result";
  detail: string;
  invalidatesEvidence: boolean;
  missingRequiredStages?: string[];
  targetStage?: string;
}

export interface AgentReplanResult {
  event: AgentReplanEvent;
  before: AgentPlanCandidate;
  after: AgentPlanCandidate;
  preservedEvidence: string[];
  changes: string[];
  nextAction: string;
}

export type AgentPlanEventType = "created" | "step_completed" | "step_failed" | "evidence_added" | "evidence_invalidated" | "context_changed" | "user_correction" | "replanned" | "critic_failed" | "repair_applied";
export type AgentPlanStatus = "draft" | "ready" | "running" | "blocked" | "needs_replan" | "completed";

export interface AgentPlanEvidenceRequirement {
  id: string;
  stepId: string;
  description: string;
  status: "required" | "completed" | "invalidated";
}

export interface AgentPlanConfidencePoint {
  atIso: string;
  eventId: string;
  confidence: number;
  risk: number;
  reason: string;
}

export interface AgentPlanEvent {
  eventId: string;
  type: AgentPlanEventType;
  createdAtIso: string;
  detail: string;
  targetStepId: string | null;
  evidenceRefs: string[];
  invalidatesEvidence: boolean;
  confidenceDelta: number;
  statusAfter: AgentPlanStatus;
  planDiff?: AgentPlanDiff;
}

export interface AgentPlanState {
  schemaVersion: 1;
  planId: string;
  goal: string;
  contextManifestId: string | null;
  selectedCandidateId: string;
  candidates: AgentPlanCandidate[];
  steps: AgentPlanStep[];
  assumptions: string[];
  evidenceRequirements: AgentPlanEvidenceRequirement[];
  completedEvidence: string[];
  invalidatedEvidence: string[];
  confidenceTimeline: AgentPlanConfidencePoint[];
  events: AgentPlanEvent[];
  currentStatus: AgentPlanStatus;
  nextAction: string;
}

export interface AgentPlanCritique {
  planId: string;
  status: "pass" | "needs_revision" | "blocked";
  issues: AgentIssue[];
  confidence: number;
  nextAction: string;
}

export interface AgentPlanDiff {
  beforePlanId: string;
  afterPlanId: string;
  addedSteps: string[];
  removedSteps: string[];
  changedSteps: string[];
  changedAssumptions: string[];
  changedEvidenceRequirements: string[];
  reasonSummary: string;
  confidenceDelta: number;
}

export interface AgentRepairAttempt {
  attempt: number;
  attemptNumber: number;
  qaCommand: string;
  exitCode: number;
  failureClass: AgentRepairFailureClass;
  inputFailure: AgentRepairInputFailure;
  validatorOutput: string;
  repairAction: string;
  patchSummary: string;
  changedFiles: string[];
  patchProvenance: AgentPatchProvenance[];
  failureHash: string;
  diffHash: string;
  diffSummary: string;
  status: "passed" | "failed" | "repaired" | "stopped";
}

export type AgentRepairFailureClass = "none" | "executable" | "methodological" | "semantic" | "repeated" | "boundary" | "unknown";

export interface AgentRepairInputFailure {
  exitCode: number;
  failureClass: AgentRepairFailureClass;
  failureHash: string;
  validatorEvidenceHash: string;
  summary: string;
}

export interface AgentPatchProvenance {
  attemptNumber: number;
  changedFile: string;
  beforeHash: string | null;
  afterHash: string | null;
  diffHash: string;
  diffSummary: string;
  reason: string;
  validatorEvidence: string;
  validatorEvidenceHash: string;
}

export interface AgentRepairBoundary {
  maxCostUsd: number;
  maxRiskScore: number;
  allowedFiles: string[];
  protectedGlobs: string[];
}

export interface AgentRepairRun {
  schemaVersion: 1;
  repairRunId: string;
  bundle: string;
  bundleDir: string;
  qaCommand: string;
  qa: string;
  maxAttempts: number;
  repairSpecPath: string | null;
  repairCommand: string | null;
  costBoundary: Pick<AgentRepairBoundary, "maxCostUsd">;
  riskBoundary: Omit<AgentRepairBoundary, "maxCostUsd">;
  analysisSpecHash: string | null;
  attempts: AgentRepairAttempt[];
  finalStatus: "passed" | "failed" | "stopped";
  stoppingReason: "pass" | "max_attempts" | "methodological_or_semantic" | "repeated_failure" | "qa_artifact_failed" | "cost_or_risk_boundary" | "out_of_bundle" | "no_repair_available";
  nextAction: string;
}

export interface AgentRepairProvenance {
  repairRunPath: string;
  bundleDir: string;
  repairRunId: string;
  finalStatus: AgentRepairRun["finalStatus"];
  stoppingReason: AgentRepairRun["stoppingReason"];
  patchProvenance: AgentPatchProvenance[];
}

export interface AgentSource {
  id: string;
  title: string;
  sourceType: "paper" | "official_doc" | "blog" | "x" | "dataset" | "classic" | "unrelated_field";
  url: string | null;
  claim: string;
  verified: boolean;
  confidence: number;
  evidenceState: "live" | "local_seed" | "connector_required" | "unverified";
  evidenceRole: "anchor" | "supporting" | "weak_signal" | "baseline" | "analogy";
  retrievedAtIso: string;
  notes: string[];
}

export interface AgentResearchIntake {
  topic: string;
  generatedAtIso: string;
  retrievalMode: "live" | "deterministic";
  sources: AgentSource[];
  nextAction: string;
}

export interface AgentSourceRank {
  sources: AgentSource[];
  ranked: Array<AgentSource & { rank: number; rankScore: number; use: "anchor" | "supporting" | "weak_signal" | "reject" }>;
}

export interface AgentCreativeIdea {
  id: string;
  title: string;
  sourceAnalogies: string[];
  noveltyScore: number;
  expectedImpact: number;
  confidence: number;
  costUsd: number;
  risk: number;
  tail: boolean;
  practicalSubcomponent: string;
  lineage: string[];
}

export interface AgentCreativitySynthesis {
  goal: string;
  ideas: AgentCreativeIdea[];
  nextAction: string;
}

export interface AgentIdeaEvolution {
  generations: number;
  ideas: AgentCreativeIdea[];
  promoted: AgentCreativeIdea[];
}

export interface AgentAdversarialProtocols {
  domain: string;
  protocols: Array<{ id: string; title: string; failureTarget: string; whyItBreaksAgents: string; expectedGuard: string }>;
}

export interface AgentCritique {
  artifactPath: string;
  mode: "cold" | "same-context";
  status: "pass" | "needs_revision" | "blocked";
  issues: AgentIssue[];
  confidence: number;
  nextAction: string;
}

export interface AgentCognitivePool {
  artifactPath: string;
  reviews: Array<{ role: string; status: AgentCritique["status"]; issues: AgentIssue[]; confidence: number }>;
  consensus: AgentCritique["status"];
}

export interface AgentContextImmuneCheck {
  contextPath: string;
  items: Array<{ id: string; freshness: number; useFrequency: number; downstreamOutcome: number; contradictionRisk: number; immuneScore: number; action: "keep" | "decay" | "quarantine" }>;
}

export interface AgentDream {
  historyDir: string;
  proposals: Array<{ id: string; title: string; recombinedFrom: string[]; nodeProposal: string; evaluator: string }>;
}

export interface AgentResearchMarket {
  budgetUsd: number;
  bids: Array<AgentCreativeIdea & { bidScore: number; decision: "fund" | "queue" | "reject" }>;
  funded: string[];
}

export type AgentImprovementMutationType = "validator_threshold" | "node_recombination" | "benchmark_case" | "workflow_simplification" | "failure_classifier" | "typed_contract_replacement" | "tail_analogy";

export interface AgentImprovementCandidate {
  candidateId: string;
  origin: string;
  mutationType: AgentImprovementMutationType;
  parentIds: string[];
  hypothesis: string;
  expectedGain: number;
  expectedRisk: number;
  implementationScope: string[];
  costEstimate: number;
  noveltyScore: number;
  benchmarkTarget: string;
  complexityDelta: number;
  counterDesign: string;
  lineage: string[];
  priorRejectionCount: number;
  priorRejectionReasons: string[];
}

export interface AgentRejectedCandidate {
  candidateId: string;
  reason: string;
  evidence: string[];
  reconsiderWhen: string;
}

export interface AgentImprovementBenchmarkEvidence {
  sourcePath: string;
  status: string;
  normalizedScore: number;
  issueCount: number;
  blockerCount: number;
  riskScore: number;
  summary: string;
}

export interface AgentImprovementRunCandidate {
  candidate: AgentImprovementCandidate;
  decision: "promote" | "reject" | "queue";
  decisionScore: number;
  reasons: string[];
  evidence: string[];
}

export interface AgentImprovementRun {
  schemaVersion: 1;
  runId: string;
  createdAtIso: string;
  candidates: AgentImprovementCandidate[];
  selectedCandidateIds: string[];
  benchmarkBefore: AgentImprovementBenchmarkEvidence;
  benchmarkAfter: AgentImprovementBenchmarkEvidence;
  scoreDelta: number;
  riskDelta: number;
  promoted: AgentImprovementRunCandidate[];
  rejected: AgentRejectedCandidate[];
  queued: AgentImprovementRunCandidate[];
  lessons: string[];
  costBoundary: { budgetUsd: number; totalCostEstimate: number; withinBoundary: boolean };
  testsPassed: boolean;
  override: { used: boolean; reason: string | null };
  promotionPolicy: {
    requiresPassingBenchmark: boolean;
    requiresTestsPassed: boolean;
    requiresScoreGainOrRiskReductionOrOverride: boolean;
    rejectsRepeatedCandidatesWithoutNewEvidence: boolean;
  };
  nextAction: string;
}

export interface AgentReliabilityRun {
  taskId: string;
  durationBucket: string;
  domain: string;
  attempt: number;
  status: "pass" | "fail" | "meltdown";
  score?: number;
}

export interface AgentReliabilityEval {
  runs: AgentReliabilityRun[];
  metrics: {
    passAt1: number;
    reliabilityByDuration: Array<{ durationBucket: string; attempts: number; reliability: number; meltdownRate: number }>;
    reliabilityDecayCurve: Array<{ durationBucket: string; reliability: number }>;
    varianceAmplificationFactor: number;
    gracefulDegradationScore: number;
    meltdownOnsetPoint: string | null;
  };
  issues: AgentIssue[];
  nextAction: string;
}

export interface AgentContextDenoise {
  contextPath: string;
  items: Array<{ id: string; action: "keep" | "summarize" | "quarantine"; reason: string; riskScore: number; excerpt: string }>;
  kept: number;
  summarized: number;
  quarantined: number;
  denoisedText: string | null;
  nextAction: string;
}

export interface AgentTrajectory {
  id: string;
  state: string;
  action: string;
  reward: number;
  outcome: "success" | "failure" | "unknown";
  notes?: string;
}

export interface AgentTrajectoryPolicy {
  state: string;
  validActions: string[];
  ranked: Array<AgentTrajectory & { similarity: number; advantage: number; policyScore: number; valid: boolean }>;
  recommendedAction: string | null;
  nextAction: string;
}

export interface AgentExecutionMemory {
  historyDir: string;
  recordsScanned: number;
  repeatedThemes: Array<{ theme: string; count: number; evidenceRefs: string[]; guard: string }>;
  retryGuards: string[];
  nextAction: string;
}

export type AgentInteropStatus = "created" | "queued" | "running" | "blocked" | "needs_human_review" | "succeeded" | "failed" | "canceled" | "superseded";
export type AgentEvidenceReceiptStatus = "pass" | "fail" | "warning" | "unverified";

export interface AgentInteropArtifactRef {
  artifactId: string;
  uri: string;
  kind: string;
  mediaType: string | null;
  hash: string | null;
  description: string;
}

export interface AgentEvidenceReceipt {
  schemaVersion: 1;
  receiptId: string;
  artifactRef: AgentInteropArtifactRef;
  hash: string;
  producedBy: string;
  producedAt: string;
  validator: string;
  status: AgentEvidenceReceiptStatus;
  evidenceRefs: string[];
}

export interface AgentPermissionEnvelope {
  allowedActions: string[];
  deniedActions: string[];
  humanApprovalRequired: boolean;
  networkAllowed: boolean;
  filesystemWriteRoots: string[];
  cloudAllowed: boolean;
}

export interface AgentCostBoundary {
  maxUsd: number;
  maxRuntimeSeconds: number | null;
  maxModelCalls: number | null;
}

export interface AgentCapabilityDeclaration {
  schemaVersion: 1;
  capabilityId: string;
  description: string;
  inputSchema: unknown;
  outputSchema: unknown;
  permissionsRequired: string[];
  failureTypes: AgentNodeFailureType[];
  costProfile: AgentCostBoundary;
  source: string;
  interopShape: "local" | "mcp" | "a2a";
}

export interface AgentTaskInputRef {
  inputId: string;
  value: unknown;
  mediaType: string | null;
  hash: string | null;
}

export interface AgentTaskEnvelope {
  schemaVersion: 1;
  taskId: string;
  goal: string;
  requester: string;
  capabilitiesRequired: string[];
  inputs: AgentTaskInputRef[];
  artifactRefs: AgentInteropArtifactRef[];
  permissions: AgentPermissionEnvelope;
  costBoundary: AgentCostBoundary;
  status: AgentInteropStatus;
  evidenceReceipts: AgentEvidenceReceipt[];
  failureRecords: Array<{ code: string; message: string; evidenceRefs: string[] }>;
  createdAtIso: string;
  updatedAtIso: string;
  nextAction: string;
}

export interface AgentInteropValidation {
  artifactType: "capability" | "task" | "evidence";
  status: "pass" | "needs_revision" | "blocked";
  issues: AgentIssue[];
  nextAction: string;
}

export interface AgentTaskTransition {
  beforeStatus: AgentInteropStatus;
  afterStatus: AgentInteropStatus;
  allowed: boolean;
  taskEnvelope: AgentTaskEnvelope;
  issues: AgentIssue[];
  nextAction: string;
}

export interface AgentTaskInteropExport {
  shape: "local" | "mcp" | "a2a";
  taskId: string;
  payload: unknown;
  evidenceReceipts: AgentEvidenceReceipt[];
}

export async function agentContextPreflightCommand(
  repo: string,
  query: string,
  opts: AgentContextOptions & { target?: string; budget?: number } = {},
): Promise<AgentContextPreflight> {
  const resolved = path.resolve(repo);
  const status = await runAutocontext(["status", "--json", "-p", resolved], opts);
  const pack = await runAutocontext(["pack", "--query", query, "--budget", String(opts.budget ?? 4000), "--format", "json", "-p", resolved], opts);
  const impact = opts.target ? await runAutocontext(["impact", opts.target, "--json", "-p", resolved], opts) : null;
  const memoryHits = await searchAutocontextMemory(resolved, query);
  const staleOrMissing = JSON.stringify(status.parsed ?? status.stdout).toLowerCase().includes("stale")
    || JSON.stringify(status.parsed ?? status.stdout).toLowerCase().includes("missing")
    || !status.ok;
  const contextManifest = await buildContextPackManifest({
    repo: resolved,
    query,
    target: opts.target ?? null,
    budgetTokens: opts.budget ?? 4000,
    status,
    pack,
    impact,
    memoryHits,
  });
  return {
    repo: resolved,
    query,
    target: opts.target ?? null,
    status,
    pack,
    impact,
    memoryHits,
    staleOrMissing,
    contextManifest,
    nextAction: staleOrMissing || contextManifest.status !== "ready"
      ? "Refresh or inspect autocontext before trusting planner context."
      : "Use the context pack and memory hits as planner input.",
  };
}

export async function agentContextPackCommand(repo: string, seed: AgentContextPack["seed"], opts: AgentContextOptions & { budget?: number } = {}): Promise<AgentContextPack> {
  const resolved = path.resolve(repo);
  const flag = seed.kind === "query" ? "--query" : seed.kind === "file" ? "--file" : "--symbol";
  const budget = opts.budget ?? 4000;
  const result = await runAutocontext(["pack", flag, seed.value, "--budget", String(budget), "--format", "json", "-p", resolved], opts);
  const memoryHits = seed.kind === "query" ? await searchAutocontextMemory(resolved, seed.value) : [];
  const contextManifest = await buildContextPackManifest({
    repo: resolved,
    query: `${seed.kind}:${seed.value}`,
    target: seed.kind === "file" || seed.kind === "symbol" ? seed.value : null,
    budgetTokens: budget,
    status: { ok: true, command: [], stdout: "", stderr: "", parsed: null, error: null },
    pack: result,
    impact: null,
    memoryHits,
  });
  return {
    repo: resolved,
    seed,
    budget,
    result,
    contextManifest,
  };
}

export async function agentContextImpactCommand(repo: string, target: string, opts: AgentContextOptions = {}): Promise<AgentContextImpact> {
  const resolved = path.resolve(repo);
  return { repo: resolved, target, result: await runAutocontext(["impact", target, "--json", "-p", resolved], opts) };
}

export async function agentContextVerifyCommand(repo: string, opts: AgentContextOptions = {}): Promise<AgentContextVerify> {
  const resolved = path.resolve(repo);
  return { repo: resolved, result: await runAutocontext(["verify", "--json", "-p", resolved], opts) };
}

export async function agentContextManifestCommand(repo: string, query: string, opts: AgentContextOptions & { target?: string; budget?: number; outPath?: string } = {}): Promise<AgentContextPackManifest> {
  const preflight = await agentContextPreflightCommand(repo, query, opts);
  if (opts.outPath) await writeJsonFile(path.resolve(opts.outPath), preflight.contextManifest);
  return preflight.contextManifest;
}

export async function agentContextScoreCommand(manifestPath: string): Promise<AgentContextScore> {
  const manifest = unwrapContextManifest(JSON.parse(await readFile(path.resolve(manifestPath), "utf-8")) as unknown);
  return scoreContextManifest(manifest);
}

export async function agentContextOutcomeCommand(manifestPath: string, resultPath: string, opts: { outPath?: string } = {}): Promise<AgentContextPackManifest> {
  const resolvedManifest = path.resolve(manifestPath);
  const manifest = unwrapContextManifest(JSON.parse(await readFile(resolvedManifest, "utf-8")) as unknown);
  const resultText = await readFile(path.resolve(resultPath), "utf-8");
  const result = parseMaybeJson(resultText) as Record<string, unknown> | null;
  const status = inferOutcomeStatus(resultText, result);
  const scoreDelta = status === "success" ? 0.05 : status === "blocked" ? -0.02 : status === "failure" ? -0.08 : 0;
  const record: AgentContextOutcomeRecord = {
    recordedAtIso: new Date().toISOString(),
    resultId: path.basename(resultPath),
    status,
    scoreDelta,
    summary: summarizeJsonOrText(resultText),
    evidenceHash: sha256(resultText),
  };
  const updated: AgentContextPackManifest = {
    ...manifest,
    downstreamOutcomeHistory: [...manifest.downstreamOutcomeHistory, record].slice(-20),
  };
  const rescored = rescoreContextManifest(updated);
  if (opts.outPath) await writeJsonFile(path.resolve(opts.outPath), rescored);
  return rescored;
}

export async function agentNodeContractCommand(manifestPath: string, opts: { outPath?: string } = {}): Promise<AgentNodeContractValidation> {
  const resolved = path.resolve(manifestPath);
  const parsed = JSON.parse(await readFile(resolved, "utf-8")) as unknown;
  const contract = normalizeNodeContractArtifact(parsed);
  const validation = validateNodeContract(contract);
  if (opts.outPath) await writeJsonFile(path.resolve(opts.outPath), validation.contract);
  return validation;
}

export async function agentNodeContractsCommand(dir: string): Promise<AgentNodeContractRegistry> {
  return discoverNodeContracts(path.resolve(dir));
}

export async function agentNodeContractValidateCommand(contractPath: string): Promise<AgentNodeContractValidation> {
  const parsed = JSON.parse(await readFile(path.resolve(contractPath), "utf-8")) as unknown;
  return validateNodeContract(normalizeNodeContractArtifact(parsed));
}

export async function agentNodeIoValidateCommand(contractPath: string, kind: "input" | "output", valuePath: string): Promise<AgentNodeIoValidation> {
  const contract = normalizeNodeContractArtifact(JSON.parse(await readFile(path.resolve(contractPath), "utf-8")) as unknown);
  const value = JSON.parse(await readFile(path.resolve(valuePath), "utf-8")) as unknown;
  return validateNodeIo(contract, kind, value);
}

export async function agentNodeOutputRecordCommand(
  contractPath: string,
  inputPath: string,
  outputPath: string,
  opts: { artifactBaseDir?: string; outPath?: string } = {},
): Promise<AgentNodeExecutionRecord> {
  const contractText = await readFile(path.resolve(contractPath), "utf-8");
  const contract = normalizeNodeContractArtifact(JSON.parse(contractText) as unknown);
  const inputText = await readFile(path.resolve(inputPath), "utf-8");
  const outputText = await readFile(path.resolve(outputPath), "utf-8");
  const inputValue = JSON.parse(inputText) as unknown;
  const outputValue = JSON.parse(outputText) as unknown;
  const inputValidation = validateNodeIo(contract, "input", inputValue);
  const outputValidation = validateNodeIo(contract, "output", outputValue);
  const artifactRecords = await recordArtifactEffects(contract, opts.artifactBaseDir ?? path.dirname(path.resolve(outputPath)));
  const missingRequiredArtifacts = artifactRecords.filter(record => record.required && !record.exists);
  const typedFailures = uniqueFailures([
    ...inputValidation.typedFailures,
    ...outputValidation.typedFailures,
    ...missingRequiredArtifacts.map(() => pickContractFailure(contract, "NODE_ARTIFACT_MISSING")),
  ]);
  const record: AgentNodeExecutionRecord = {
    schemaVersion: 1,
    nodeId: contract.nodeId,
    status: inputValidation.status === "pass" && outputValidation.status === "pass" && !missingRequiredArtifacts.length ? "passed" : "failed",
    inputValidation,
    outputValidation,
    artifactRecords,
    typedFailures,
    provenance: {
      recordedAtIso: new Date().toISOString(),
      inputHash: sha256(inputText),
      outputHash: sha256(outputText),
      contractHash: sha256(JSON.stringify(contract)),
    },
    repairHint: typedFailures[0]?.repairAction ?? "No repair needed.",
  };
  if (opts.outPath) await writeJsonFile(path.resolve(opts.outPath), record);
  return record;
}

export async function agentPlanV2Command(goal: string, opts: { contextPackPath?: string; contextManifestPath?: string; repo?: string; nodeContractDir?: string } = {}): Promise<AgentPlanPortfolio> {
  const contextText = opts.contextPackPath ? await readFile(path.resolve(opts.contextPackPath), "utf-8") : "";
  const contextSummary = contextText ? summarizeJsonOrText(contextText) : "";
  const executionMemoryGuards = contextText ? extractExecutionMemoryGuards(contextText) : [];
  const contextManifest = opts.contextManifestPath ? unwrapContextManifest(JSON.parse(await readFile(path.resolve(opts.contextManifestPath), "utf-8")) as unknown) : null;
  const contextQuality = contextManifest ? pickContextQuality(contextManifest) : null;
  const contextConfidencePenalty = contextQuality?.status === "blocked" ? 0.36 : contextQuality?.status === "degraded" ? 0.14 : 0;
  const contextRiskPenalty = contextQuality?.status === "blocked" ? 0.24 : contextQuality?.status === "degraded" ? 0.09 : 0;
  const capabilities = await discoverRepoCapabilities(opts.repo ?? process.cwd());
  const contractRegistry = await discoverNodeContracts(opts.nodeContractDir ? path.resolve(opts.nodeContractDir) : opts.repo ? path.resolve(opts.repo) : process.cwd());
  const contractSummaries = summarizeNodeContracts(contractRegistry.contracts);
  const contextCommand = capabilities.cliCommands.includes("agent context-preflight") ? "agenteer agent context-preflight" : "context-preflight";
  const repairCommand = capabilities.cliCommands.includes("agent repair-run") ? "agenteer agent repair-run" : "repair-run";
  const availableContract = contractRegistry.contracts.find(contract => contract.verifier.kind !== "manual") ?? contractRegistry.contracts[0];
  const availableManifest = availableContract?.nodeId ?? capabilities.manifests[0]?.id;
  const capabilitiesUsed = uniqueStrings([
    ...capabilities.cliCommands,
    ...contractSummaries.map(contract => `node-contract ${contract.nodeId}`),
  ]);
  const candidates = [
    makePlanCandidate(goal, "rigor-first", Math.min(1, 0.18 + contextRiskPenalty), Math.max(0, 0.86 - contextConfidencePenalty), 0, 0.28, [
      "Run context preflight and gather evidence.",
      "Design multiple candidate plans.",
      "Critique the selected plan before execution.",
      "Execute with deterministic verification and repair gates.",
    ], contextSummary, { contextCommand, repairCommand, availableManifest, availableContractId: availableContract?.nodeId, capabilitiesUsed: capabilitiesUsed.slice(0, 10), executionMemoryGuards, contextManifest, nodeContracts: contractSummaries }),
    makePlanCandidate(goal, "speed-first", Math.min(1, 0.32 + contextRiskPenalty), Math.max(0, 0.72 - contextConfidencePenalty), 0, 0.12, [
      "Build minimal context pack.",
      "Execute the highest-confidence local path.",
      "Run targeted verification.",
    ], contextSummary, { contextCommand, repairCommand, availableManifest, availableContractId: availableContract?.nodeId, capabilitiesUsed: capabilitiesUsed.slice(0, 8), executionMemoryGuards, contextManifest, nodeContracts: contractSummaries.slice(0, 6) }),
    makePlanCandidate(goal, "novelty-first", Math.min(1, 0.44 + contextRiskPenalty), Math.max(0, 0.64 - contextConfidencePenalty), 0, 0.72, [
      "Run research intake and far-transfer synthesis.",
      "Generate tail-pass ideas and adversarial cases.",
      "Promote a practical subcomponent through critic review.",
      "Execute the selected experiment behind verification gates.",
    ], contextSummary, { contextCommand, repairCommand, availableManifest, availableContractId: availableContract?.nodeId, capabilitiesUsed: capabilitiesUsed.slice(0, 10), nodeProposals: ["node-proposal:novelty-search-evaluator"], executionMemoryGuards, contextManifest, nodeContracts: contractSummaries }),
  ].sort((a, b) => b.utility - a.utility);
  return {
    schemaVersion: 1,
    goal,
    generatedAtIso: new Date().toISOString(),
    contextPackPath: opts.contextPackPath ? path.resolve(opts.contextPackPath) : null,
    contextManifestPath: opts.contextManifestPath ? path.resolve(opts.contextManifestPath) : null,
    contextManifestId: contextManifest?.contextPackId ?? null,
    contextQuality,
    nodeContracts: contractSummaries,
    candidates,
    selectedCandidateId: candidates[0]?.id ?? "",
    nextAction: capabilities.cliCommands.length || contractSummaries.length
      ? "Run plan-critic with node contracts, then execute or replan based on evidence."
      : "No CLI capabilities were discovered; run plan-critic and create node-proposal artifacts before execution.",
  };
}

export async function agentReplanCommand(planPath: string, eventInput: string): Promise<AgentReplanResult> {
  const plan = pickPlanCandidate(JSON.parse(await readFile(path.resolve(planPath), "utf-8")) as unknown);
  const event = parseReplanEvent(eventInput);
  const preservedEvidence = event.invalidatesEvidence ? [] : plan.expectedEvidence;
  const activeTail = plan.steps.filter(step => step.status !== "invalidated").slice(-1).map(step => step.id);
  const repairSteps: AgentPlanStep[] = event.missingRequiredStages?.length
    ? event.missingRequiredStages.map((stage, index) => ({
      id: `step-${plan.steps.length + index + 1}`,
      title: `Complete missing research gate: ${stage}`,
      kind: "verify" as const,
      dependsOn: index === 0 ? activeTail : [`step-${plan.steps.length + index}`],
      expectedEvidence: [`stage-gate.${stage}.completed`],
      status: "pending" as const,
      mode: "review_gate" as const,
    }))
    : [{
      id: `step-${plan.steps.length + 1}`,
      title: `Respond to ${event.kind}: ${event.detail.slice(0, 80)}`,
      kind: event.kind === "stale_context" ? "context" : event.kind === "verification_result" ? "verify" : "repair",
      dependsOn: activeTail,
      expectedEvidence: [`replan.${event.kind}.resolution`],
      status: "pending",
      mode: event.kind === "verification_result" ? "review_gate" : event.kind === "stale_context" ? "exploratory" : "executable",
    }];
  const after: AgentPlanCandidate = {
    ...plan,
    id: `${plan.id}-replanned`,
    assumptions: uniqueStrings([...plan.assumptions, `Replan event handled: ${event.kind}`]),
    steps: [
      ...plan.steps.map(step => event.invalidatesEvidence && step.status === "completed" ? { ...step, status: "invalidated" as const } : step),
      ...repairSteps,
    ],
    expectedEvidence: uniqueStrings([...preservedEvidence, ...repairSteps.flatMap(step => step.expectedEvidence)]),
    risk: Math.min(1, plan.risk + (event.kind === "failure" ? 0.08 : 0.03)),
    confidence: Math.max(0, plan.confidence - (event.kind === "failure" ? 0.08 : 0.03)),
  };
  return {
    event,
    before: plan,
    after,
    preservedEvidence,
    changes: [`Added ${repairSteps.map(step => step.id).join(", ")}`, event.invalidatesEvidence ? "Invalidated completed evidence" : "Preserved completed evidence"],
    nextAction: "Run plan-critic on the replanned candidate before execution.",
  };
}

export async function agentPlanStateCreateCommand(planPath: string, opts: { outPath?: string } = {}): Promise<AgentPlanState> {
  const parsed = JSON.parse(await readFile(path.resolve(planPath), "utf-8")) as unknown;
  const portfolio = unwrap<AgentPlanPortfolio>(parsed, "planPortfolio");
  const selected = pickPlanCandidate(parsed);
  const candidates = portfolio?.candidates ?? [selected];
  const now = new Date().toISOString();
  const state: AgentPlanState = {
    schemaVersion: 1,
    planId: `state_${selected.id}_${sha256(`${selected.id}:${now}`).slice(0, 8)}`,
    goal: selected.goal,
    contextManifestId: selected.contextManifestId ?? portfolio?.contextManifestId ?? null,
    selectedCandidateId: selected.id,
    candidates,
    steps: selected.steps,
    assumptions: selected.assumptions,
    evidenceRequirements: evidenceRequirementsFromSteps(selected.steps),
    completedEvidence: [],
    invalidatedEvidence: [],
    confidenceTimeline: [{
      atIso: now,
      eventId: "event-created",
      confidence: selected.confidence,
      risk: selected.risk,
      reason: "Plan state created from selected plan candidate.",
    }],
    events: [{
      eventId: "event-created",
      type: "created",
      createdAtIso: now,
      detail: `Created plan state from ${selected.id}.`,
      targetStepId: null,
      evidenceRefs: selected.expectedEvidence,
      invalidatesEvidence: false,
      confidenceDelta: 0,
      statusAfter: "draft",
    }],
    currentStatus: "draft",
    nextAction: "Run plan-critic against this plan state before execution.",
  };
  if (opts.outPath) await writeJsonFile(path.resolve(opts.outPath), state);
  return state;
}

export async function agentPlanStateEventCommand(statePath: string, eventInput: string, opts: { outPath?: string } = {}): Promise<AgentPlanState> {
  const state = pickPlanState(JSON.parse(await readFile(path.resolve(statePath), "utf-8")) as unknown);
  const event = parsePlanStateEvent(eventInput, state);
  const updated = applyPlanEvent(state, event);
  if (opts.outPath) await writeJsonFile(path.resolve(opts.outPath), updated);
  return updated;
}

export async function agentPlanStateReplanCommand(statePath: string, eventInput: string, opts: { outPath?: string } = {}): Promise<AgentPlanState> {
  const state = pickPlanState(JSON.parse(await readFile(path.resolve(statePath), "utf-8")) as unknown);
  const replan = await agentReplanCandidateFromState(state, eventInput);
  const diff = diffPlanCandidates(selectedCandidateFromState(state), replan.after);
  const baseEvent = parsePlanStateEvent(JSON.stringify({
    type: "replanned",
    detail: replan.event.detail,
    invalidatesEvidence: replan.event.invalidatesEvidence,
    evidenceRefs: replan.after.expectedEvidence,
    confidenceDelta: replan.after.confidence - selectedCandidateFromState(state).confidence,
  }), state);
  const event: AgentPlanEvent = { ...baseEvent, planDiff: diff };
  const updated = applyPlanEvent({
    ...state,
    selectedCandidateId: replan.after.id,
    candidates: uniquePlanCandidates([...state.candidates, replan.after]),
    steps: replan.after.steps,
    assumptions: replan.after.assumptions,
    evidenceRequirements: mergeEvidenceRequirements(state.evidenceRequirements, evidenceRequirementsFromSteps(replan.after.steps), replan.event.invalidatesEvidence),
  }, event);
  if (opts.outPath) await writeJsonFile(path.resolve(opts.outPath), updated);
  return updated;
}

export async function agentPlanStateResumeCommand(statePath: string): Promise<AgentPlanState> {
  return pickPlanState(JSON.parse(await readFile(path.resolve(statePath), "utf-8")) as unknown);
}

export async function agentPlanCriticCommand(planPath: string, rubricPath?: string, opts: { nodeContractDir?: string; repo?: string } = {}): Promise<AgentPlanCritique> {
  const parsedPlanArtifact = JSON.parse(await readFile(path.resolve(planPath), "utf-8")) as unknown;
  const planState = maybePickPlanState(parsedPlanArtifact);
  const plan = pickPlanCandidate(parsedPlanArtifact);
  const rubric = rubricPath ? JSON.parse(await readFile(path.resolve(rubricPath), "utf-8")) as Record<string, unknown> : {};
  const maxCost = Number(rubric.maxCostUsd ?? 30);
  const minConfidence = Number(rubric.minConfidence ?? 0.55);
  const allowedCommands = Array.isArray(rubric.allowedCommands) ? rubric.allowedCommands.map(String) : null;
  const sourceRank = unwrap<AgentSourceRank>(rubric, "sourceRank");
  const knownCapabilities = await discoverRepoCapabilities(opts.repo ?? process.cwd());
  const knownManifestIds = new Set(knownCapabilities.manifests.map(manifest => manifest.id));
  const contractRegistry = await discoverNodeContracts(opts.nodeContractDir ? path.resolve(opts.nodeContractDir) : opts.repo ? path.resolve(opts.repo) : process.cwd());
  const knownContracts = new Map(contractRegistry.contracts.map(contract => [contract.nodeId, contract]));
  const issues: AgentIssue[] = [];
  if (!plan.steps.length) issues.push(makeIssue("blocker", "execution", "PLAN_HAS_NO_STEPS", "Plan has no executable or reviewable steps.", [], "Regenerate plan with ordered steps.", 0.95));
  if (!plan.expectedEvidence.length) issues.push(makeIssue("blocker", "research", "MISSING_EXPECTED_EVIDENCE", "Plan does not define expected evidence.", [], "Add evidence expectations before execution.", 0.9));
  if (plan.estimatedCostUsd > maxCost) issues.push(makeIssue("blocker", "cost", "COST_EXCEEDS_RUBRIC", `Estimated cost $${plan.estimatedCostUsd} exceeds max $${maxCost}.`, [], "Lower cost or request approval.", 0.9));
  if (plan.confidence < minConfidence) issues.push(makeIssue("warning", "architecture", "LOW_PLAN_CONFIDENCE", `Plan confidence ${plan.confidence.toFixed(2)} is below ${minConfidence.toFixed(2)}.`, [], "Run research intake or context preflight.", 0.75));
  if (sourceRank?.ranked) {
    const hasUsableSource = sourceRank.ranked.some(source => source.use === "anchor" || source.use === "supporting");
    const executionIntent = plan.steps.some(step => step.mode === "executable") || /\b(implement|execute|promote|create|deploy|edit|modify|new node|workflow node)\b/i.test(`${plan.goal} ${plan.strategy} ${plan.steps.map(step => step.title).join(" ")}`);
    if (!hasUsableSource && executionIntent) {
      issues.push(makeIssue("blocker", "research", "WEAK_SIGNAL_EXECUTION_GUARD", "Plan proposes execution or implementation without source-ranked anchor/supporting evidence.", [], "Keep this as ideation, or add verified/supporting sources before implementation.", 0.84));
    }
  }
  if (plan.steps.some(step => step.dependsOn.some(dep => !plan.steps.some(candidate => candidate.id === dep)))) {
    issues.push(makeIssue("blocker", "execution", "IMPOSSIBLE_DEPENDENCY", "Plan references a missing dependency step.", [], "Repair step dependencies.", 0.96));
  }
  for (const step of plan.steps) {
    if (!step.expectedEvidence.length) {
      issues.push(makeIssue("blocker", "research", "STEP_MISSING_EVIDENCE", `Step ${step.id} has no expected evidence.`, [step.id], "Attach at least one evidence record expectation to the step.", 0.88));
    }
    const referencedNode = step.contractId ?? step.manifestId;
    if (referencedNode && !knownManifestIds.has(referencedNode) && !knownContracts.has(referencedNode) && !step.nodeProposal) {
      issues.push(makeIssue("blocker", "architecture", "UNKNOWN_NODE_CONTRACT", `Step ${step.id} references unknown executable node ${referencedNode}.`, [step.id], "Install a node contract or convert this to a node-proposal artifact.", 0.88));
    }
    const contract = referencedNode ? knownContracts.get(referencedNode) : null;
    if (contract) {
      const validation = validateNodeContract(contract);
      for (const issue of validation.issues.filter(issue => issue.severity === "blocker")) {
        issues.push(makeIssue("blocker", issue.category, `CONTRACT_${issue.code}`, `Step ${step.id} uses invalid contract ${contract.nodeId}: ${issue.message}`, [step.id, contract.nodeId], issue.repairAction, issue.confidence));
      }
      if (step.mode === "executable" && !contract.failureTypes.length) {
        issues.push(makeIssue("blocker", "architecture", "CONTRACT_MISSING_FAILURE_TYPES", `Step ${step.id} contract ${contract.nodeId} does not expose typed failures.`, [contract.nodeId], "Add failureTypes before executable planning.", 0.9));
      }
      if (contract.costBoundary.maxUsd > maxCost && step.mode === "executable") {
        issues.push(makeIssue("blocker", "cost", "CONTRACT_COST_EXCEEDS_RUBRIC", `Step ${step.id} contract cost boundary $${contract.costBoundary.maxUsd} exceeds max $${maxCost}.`, [contract.nodeId], "Lower the contract cost boundary or request approval.", 0.86));
      }
    }
    if (step.command && allowedCommands && !allowedCommands.some(command => step.command?.startsWith(command))) {
      issues.push(makeIssue("blocker", "safety", "COMMAND_NOT_ALLOWED", `Step ${step.id} command is outside the rubric allowlist.`, [step.command], "Use an allowlisted command or update the reviewed rubric.", 0.87));
    }
    if (/new node|invent|create node|proposal/i.test(step.title) && !step.nodeProposal) {
      issues.push(makeIssue("blocker", "architecture", "NODE_PROPOSAL_REQUIRED", `Step ${step.id} proposes new capability without a node-proposal artifact.`, [step.id], "Add nodeProposal metadata before execution.", 0.86));
    }
  }
  if (JSON.stringify(plan.assumptions).toLowerCase().includes("stale") || JSON.stringify(plan.assumptions).toLowerCase().includes("missing context")) {
    issues.push(makeIssue("blocker", "context", "STALE_CONTEXT_ASSUMPTION", "Plan assumptions indicate stale or missing context.", [], "Refresh autocontext or explicitly approve stale-context execution.", 0.8));
  }
  if (plan.contextQuality) {
    if (plan.contextQuality.status === "blocked") {
      issues.push(makeIssue("blocker", "context", "CONTEXT_MANIFEST_BLOCKED", `Context manifest ${plan.contextManifestId ?? "(unknown)"} is blocked with score ${plan.contextQuality.score.toFixed(2)}.`, [plan.contextManifestId ?? "context-manifest"], "Refresh context, remove contradictory sources, or lower plan confidence before execution.", 0.9));
    } else if (plan.contextQuality.status === "degraded") {
      issues.push(makeIssue("warning", "context", "CONTEXT_MANIFEST_DEGRADED", `Context manifest ${plan.contextManifestId ?? "(unknown)"} is degraded with score ${plan.contextQuality.score.toFixed(2)}.`, [plan.contextManifestId ?? "context-manifest"], "Use review gates and avoid high-confidence execution until context improves.", 0.82));
    }
    if (plan.contextQuality.status !== "ready" && plan.confidence >= 0.75) {
      issues.push(makeIssue("blocker", "context", "HIGH_CONFIDENCE_WITH_WEAK_CONTEXT", "Plan remains high-confidence even though its context manifest is not ready.", [plan.contextManifestId ?? "context-manifest"], "Regenerate plan with the weak context penalty or explicitly approve a low-context mode.", 0.86));
    }
    if (plan.contextQuality.contradictionRisk > 0.55) {
      issues.push(makeIssue("blocker", "context", "CONTEXT_CONTRADICTION_RISK", `Context contradiction risk ${plan.contextQuality.contradictionRisk.toFixed(2)} exceeds the safe planning threshold.`, [plan.contextManifestId ?? "context-manifest"], "Run context-denoise or context-immune-check before execution.", 0.84));
    }
  }
  if (planState) {
    const invalidatedRequired = planState.evidenceRequirements.filter(requirement => requirement.status === "invalidated");
    const failedUnresolved = planState.events.filter(event => event.type === "step_failed" || event.type === "critic_failed").filter(event => !planState.events.some(later => later.createdAtIso > event.createdAtIso && (later.type === "replanned" || later.type === "repair_applied")));
    if (planState.currentStatus === "blocked" || planState.currentStatus === "needs_replan") {
      issues.push(makeIssue("blocker", "execution", "PLAN_STATE_NOT_READY", `Plan state is ${planState.currentStatus}.`, [planState.planId], "Apply a replan, repair, or user correction event before execution.", 0.88));
    }
    if (invalidatedRequired.length) {
      issues.push(makeIssue("blocker", "research", "PLAN_STATE_INVALIDATED_EVIDENCE", `Plan state has ${invalidatedRequired.length} invalidated evidence requirement(s).`, invalidatedRequired.map(item => item.id), "Replan or replace invalidated evidence before execution.", 0.9));
    }
    if (failedUnresolved.length) {
      issues.push(makeIssue("blocker", "execution", "PLAN_STATE_UNRESOLVED_FAILURE", `Plan state has unresolved failed event ${failedUnresolved.at(-1)?.eventId}.`, [failedUnresolved.at(-1)?.eventId ?? planState.planId], "Record repair_applied or replan before continuing.", 0.86));
    }
    const latestConfidence = planState.confidenceTimeline.at(-1);
    if (latestConfidence && latestConfidence.confidence < minConfidence) {
      issues.push(makeIssue("warning", "architecture", "PLAN_STATE_LOW_CONFIDENCE", `Latest plan-state confidence ${latestConfidence.confidence.toFixed(2)} is below ${minConfidence.toFixed(2)}.`, [latestConfidence.eventId], "Run replanning or strengthen evidence before execution.", 0.78));
    }
  }
  return {
    planId: planState?.planId ?? plan.id,
    status: issues.some(issue => issue.severity === "blocker") ? "blocked" : issues.length ? "needs_revision" : "pass",
    issues,
    confidence: issues.length ? 0.82 : 0.9,
    nextAction: issues.length ? "Repair the plan and rerun plan-critic." : "Plan is ready for gated execution.",
  };
}

export async function agentPlanDiffCommand(beforePath: string, afterPath: string): Promise<AgentPlanDiff> {
  const beforeArtifact = JSON.parse(await readFile(path.resolve(beforePath), "utf-8")) as unknown;
  const afterArtifact = JSON.parse(await readFile(path.resolve(afterPath), "utf-8")) as unknown;
  const beforeState = maybePickPlanState(beforeArtifact);
  const afterState = maybePickPlanState(afterArtifact);
  if (beforeState && afterState) return diffPlanStates(beforeState, afterState);
  return diffPlanCandidates(pickPlanCandidate(beforeArtifact), pickPlanCandidate(afterArtifact));
}

export async function agentRepairRunCommand(bundleDir: string, qa: string, opts: { maxAttempts?: number; repairCommand?: string; maxCostUsd?: number; maxRiskScore?: number; allowedFiles?: string[]; analysisSpecPath?: string } = {}): Promise<AgentRepairRun> {
  const resolved = path.resolve(bundleDir);
  const maxAttempts = Math.max(1, opts.maxAttempts ?? 3);
  const repairSpecPath = path.join(resolved, "agenteer.repair.json");
  const boundary = normalizeRepairBoundary(opts);
  const analysisSpecHash = opts.analysisSpecPath ? await hashFileIfExists(path.resolve(opts.analysisSpecPath)) : null;
  const repairRunId = `repair_${sha256(`${resolved}:${qa}:${Date.now()}`).slice(0, 12)}`;
  const attempts: AgentRepairAttempt[] = [];
  const seenFailures = new Set<string>();
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const result = await runQa(qa, resolved);
    const validatorOutput = `${result.stdout}${result.stderr}`.trim();
    const failureClass = classifyFailure(validatorOutput, result.exitCode);
    const validatorEvidenceHash = sha256(validatorOutput);
    const failureHash = createHash("sha1").update(`${failureClass}:${validatorOutput}`).digest("hex");
    let patchSummary = result.exitCode === 0 ? "No repair needed." : "No executable repair was applied.";
    let repairAction = result.exitCode === 0 ? "none" : "refuse_or_repair";
    let changedFiles: string[] = [];
    let patchProvenance: AgentPatchProvenance[] = [];
    let diffSummary = "No file diff recorded.";
    let diffHash = sha256(diffSummary);
    if (result.exitCode !== 0 && seenFailures.has(failureHash)) {
      attempts.push({
        attempt,
        attemptNumber: attempt,
        qaCommand: qa,
        exitCode: result.exitCode,
        failureClass: "repeated",
        inputFailure: makeInputFailure(result.exitCode, "repeated", failureHash, validatorEvidenceHash, validatorOutput),
        validatorOutput,
        repairAction: "stop_repeated_failure",
        patchSummary: "Stopped before repair because the same failure repeated.",
        changedFiles: [],
        patchProvenance: [],
        failureHash,
        diffHash,
        diffSummary,
        status: "stopped",
      });
      return makeRepairRun(resolved, qa, maxAttempts, repairSpecPath, opts.repairCommand ?? null, boundary, analysisSpecHash, repairRunId, attempts, "stopped", "repeated_failure");
    }
    if (result.exitCode !== 0 && failureClass !== "methodological" && failureClass !== "semantic") {
      const before = await snapshotBundle(resolved);
      const preflight = await preflightRepairBoundary(resolved, boundary, validatorOutput, opts.repairCommand);
      if (!preflight.ok) {
        attempts.push(makeRepairAttempt({
          attempt,
          qa,
          result,
          failureClass: "boundary",
          failureHash,
          validatorOutput,
          validatorEvidenceHash,
          repairAction: preflight.reason === "out_of_bundle" ? "stop_out_of_bundle" : "stop_boundary",
          patchSummary: preflight.message,
          changedFiles: [],
          patchProvenance: [],
          diffSummary,
          diffHash,
          status: "stopped",
        }));
        return makeRepairRun(resolved, qa, maxAttempts, repairSpecPath, opts.repairCommand ?? null, boundary, analysisSpecHash, repairRunId, attempts, "stopped", preflight.reason);
      }
      const repair = opts.repairCommand
        ? await runRepairCommand(opts.repairCommand, resolved)
        : await applyBundleRepairSpec(resolved, validatorOutput, attempt, boundary);
      const after = await snapshotBundle(resolved);
      changedFiles = changedFilesBetween(before, after);
      patchSummary = repair.summary;
      repairAction = repair.action;
      diffSummary = summarizeChangedFiles(changedFiles, before, after);
      diffHash = sha256(diffSummary);
      patchProvenance = makePatchProvenance(attempt, changedFiles, before, after, repair.summary, validatorOutput, validatorEvidenceHash);
      const risk = estimateRepairRisk(changedFiles, boundary);
      if (repair.boundaryViolation || risk > boundary.maxRiskScore) {
        attempts.push(makeRepairAttempt({
          attempt,
          qa,
          result,
          failureClass: "boundary",
          failureHash,
          validatorOutput,
          validatorEvidenceHash,
          repairAction: repair.boundaryViolation ? "stop_out_of_bundle" : "stop_risk_boundary",
          patchSummary: repair.boundaryViolation ?? `Repair risk ${risk.toFixed(2)} exceeds boundary ${boundary.maxRiskScore.toFixed(2)}.`,
          changedFiles,
          patchProvenance,
          diffSummary,
          diffHash,
          status: "stopped",
        }));
        return makeRepairRun(resolved, qa, maxAttempts, repairSpecPath, opts.repairCommand ?? null, boundary, analysisSpecHash, repairRunId, attempts, "stopped", repair.boundaryViolation ? "out_of_bundle" : "cost_or_risk_boundary");
      }
    }
    attempts.push({
      attempt,
      attemptNumber: attempt,
      qaCommand: qa,
      exitCode: result.exitCode,
      failureClass,
      inputFailure: makeInputFailure(result.exitCode, failureClass, failureHash, validatorEvidenceHash, validatorOutput),
      validatorOutput,
      repairAction,
      patchSummary,
      changedFiles,
      patchProvenance,
      failureHash,
      diffHash,
      diffSummary,
      status: result.exitCode === 0 ? "passed" : changedFiles.length ? "repaired" : "failed",
    });
    if (result.exitCode === 0) return makeRepairRun(resolved, qa, maxAttempts, repairSpecPath, opts.repairCommand ?? null, boundary, analysisSpecHash, repairRunId, attempts, "passed", "pass");
    if (failureClass === "methodological" || failureClass === "semantic") return makeRepairRun(resolved, qa, maxAttempts, repairSpecPath, opts.repairCommand ?? null, boundary, analysisSpecHash, repairRunId, attempts, "stopped", "methodological_or_semantic");
    seenFailures.add(failureHash);
    if (!changedFiles.length && attempt < maxAttempts) continue;
  }
  return makeRepairRun(resolved, qa, maxAttempts, repairSpecPath, opts.repairCommand ?? null, boundary, analysisSpecHash, repairRunId, attempts, "failed", "max_attempts");
}

export async function agentRepairProvenanceCommand(repairRunPath: string): Promise<AgentRepairProvenance> {
  const resolved = path.resolve(repairRunPath);
  const repairRun = unwrap<AgentRepairRun>(JSON.parse(await readFile(resolved, "utf-8")) as unknown, "repairRun");
  if (!repairRun) throw new Error("repair-provenance requires a repair-run artifact");
  return {
    repairRunPath: resolved,
    bundleDir: repairRun.bundleDir,
    repairRunId: repairRun.repairRunId,
    finalStatus: repairRun.finalStatus,
    stoppingReason: repairRun.stoppingReason,
    patchProvenance: repairRun.attempts.flatMap(attempt => attempt.patchProvenance.length
      ? attempt.patchProvenance
      : [{
        attemptNumber: attempt.attemptNumber ?? attempt.attempt,
        changedFile: "(none)",
        beforeHash: null,
        afterHash: null,
        diffHash: attempt.diffHash ?? sha256(attempt.diffSummary),
        diffSummary: attempt.diffSummary,
        reason: attempt.patchSummary,
        validatorEvidence: attempt.inputFailure?.summary ?? attempt.failureClass,
        validatorEvidenceHash: attempt.inputFailure?.validatorEvidenceHash ?? sha256(attempt.validatorOutput),
      }]),
  };
}

export async function agentResearchIntakeCommand(topic: string, opts: { web?: boolean; x?: boolean; papers?: boolean; live?: boolean } = {}): Promise<AgentResearchIntake> {
  const sources: AgentSource[] = [];
  const live = opts.live === true || process.env.AGENTEER_AGENT_LIVE_RESEARCH === "1";
  if (opts.papers) sources.push(...(live ? await fetchCrossrefPaperSources(topic) : [makeSource("paper", "Paper retrieval requested; live mode disabled", `Use live paper retrieval or provide external sources before treating paper claims about ${topic} as evidence.`, false, { evidenceState: "unverified", evidenceRole: "supporting", notes: ["deterministic placeholder; not evidence"] })]));
  if (opts.web) sources.push(makeSource("official_doc", "Official documentation retrieval requested", `Use an official documentation connector or reviewed URL list for ${topic}.`, false, { evidenceState: live ? "unverified" : "connector_required", evidenceRole: "supporting", notes: ["web search is not fabricated by the CLI"] }));
  if (opts.x) sources.push(makeSource("x", "X trend retrieval requires connector review", `X can discover weak signals for ${topic}, but must be verified elsewhere before use.`, false, { evidenceState: "connector_required", evidenceRole: "weak_signal", notes: ["X is discovery only, never evidence"] }));
  sources.push(makeSource("classic", "Classic baseline seed", `Historical baseline or established method to compare against for ${topic}.`, false, { evidenceState: "local_seed", evidenceRole: "baseline", notes: ["local seed for ideation, not a citation"] }));
  sources.push(makeSource("unrelated_field", "Far-transfer field seed", `Analogy source outside ${topic}.`, false, { evidenceState: "local_seed", evidenceRole: "analogy", notes: ["local seed for creativity, not empirical evidence"] }));
  return {
    topic,
    generatedAtIso: new Date().toISOString(),
    retrievalMode: live ? "live" : "deterministic",
    sources,
    nextAction: "Rank sources; use only live/verified anchors as evidence and treat X/local seeds as discovery or analogy inputs.",
  };
}

export async function agentSourceRankCommand(sourcesPath: string): Promise<AgentSourceRank> {
  const sources = unwrapSources(JSON.parse(await readFile(path.resolve(sourcesPath), "utf-8")) as unknown);
  const ranked = sources.map(source => {
    const base = source.sourceType === "paper" ? 1 : source.sourceType === "official_doc" ? 0.92 : source.sourceType === "classic" ? 0.82 : source.sourceType === "blog" ? 0.62 : source.sourceType === "x" ? 0.35 : 0.5;
    const evidenceMultiplier = source.evidenceState === "live" ? 1 : source.evidenceState === "local_seed" ? 0.48 : source.evidenceState === "connector_required" ? 0.25 : 0.38;
    const rankScore = base * (source.verified ? 1 : 0.55) * evidenceMultiplier * source.confidence;
    const use = source.sourceType === "x"
      ? "weak_signal" as const
      : rankScore >= 0.72 && source.verified
        ? "anchor" as const
        : rankScore >= 0.45
          ? "supporting" as const
          : "reject" as const;
    return { ...source, rank: 0, rankScore, use };
  }).sort((a, b) => b.rankScore - a.rankScore).map((source, index) => ({ ...source, rank: index + 1 }));
  return { sources, ranked };
}

export async function agentCreativitySynthCommand(sourcesPath: string, goal: string): Promise<AgentCreativitySynthesis> {
  const sources = unwrapSources(JSON.parse(await readFile(path.resolve(sourcesPath), "utf-8")) as unknown);
  const analogies = ["drug discovery", "compiler optimization", "active learning", "operations research", "aviation safety", "lab automation"];
  const rankedSources = sources
    .map(source => ({ source, score: source.confidence * (source.verified ? 1 : 0.6) * (source.evidenceState === "live" ? 1 : source.evidenceState === "local_seed" ? 0.55 : 0.35) }))
    .sort((a, b) => b.score - a.score)
    .map(item => item.source);
  const ideas = analogies.map((analogy, index) => {
    const lineage = uniqueStrings([...rankedSources.slice(0, 3).map(source => source.id), ...sources.filter(source => source.claim.toLowerCase().includes(analogy.split(" ")[0] ?? "")).map(source => source.id)]);
    return makeIdea(goal, analogy, lineage, index === analogies.length - 1, sources);
  });
  ideas.push({
    ...makeIdea(goal, "tail-pass impossible system", sources.map(source => source.id), true, sources),
    title: "Impossible tail pass: self-testing agent laboratory",
    practicalSubcomponent: "Extract only the deterministic evaluator and adversarial-case generator.",
  });
  return { goal, ideas, nextAction: "Run idea-evolve, then fund candidates through research-market." };
}

export async function agentIdeaEvolveCommand(ideasPath: string, generations = 2): Promise<AgentIdeaEvolution> {
  const ideas = unwrapIdeas(JSON.parse(await readFile(path.resolve(ideasPath), "utf-8")) as unknown);
  let population = ideas;
  for (let generation = 0; generation < generations; generation += 1) {
    const mutations = population.map(idea => ({
      ...idea,
      id: `${idea.id}_g${generation + 1}`,
      noveltyScore: Math.min(1, noveltyDistance(idea, population) * 0.45 + idea.noveltyScore * 0.55 + 0.04),
      expectedImpact: Math.min(1, idea.expectedImpact + 0.03),
      confidence: Math.min(1, idea.confidence + 0.02),
      lineage: [...idea.lineage, idea.id],
    }));
    const recombined = population.slice(0, 2).length === 2 ? [{
      ...population[0]!,
      id: `recombined_g${generation + 1}`,
      title: `${population[0]!.title} + ${population[1]!.title}`,
      sourceAnalogies: uniqueStrings([...population[0]!.sourceAnalogies, ...population[1]!.sourceAnalogies]),
      noveltyScore: Math.min(1, noveltyDistance(population[0]!, population) * 0.35 + noveltyDistance(population[1]!, population) * 0.35 + 0.18),
      expectedImpact: Math.min(1, (population[0]!.expectedImpact + population[1]!.expectedImpact) / 2 + 0.05),
      lineage: [population[0]!.id, population[1]!.id],
    }] : [];
    population = [...population, ...mutations, ...recombined].sort((a, b) => ideaScore(b) - ideaScore(a)).slice(0, 12);
  }
  return { generations, ideas: population, promoted: population.slice(0, 3) };
}

export function agentAdversarialProtocolsCommand(domain: string): AgentAdversarialProtocols {
  return {
    domain,
    protocols: [
      { id: "missing-denominator", title: "Endpoint exists only in a hidden subsample", failureTarget: "cohort scouting", whyItBreaksAgents: "Superficial schemas pass but eligible rows collapse.", expectedGuard: "cohort-scout-file + uncertainty-budget" },
      { id: "causal-wording-trap", title: "Associational data with intervention wording", failureTarget: "report safety", whyItBreaksAgents: "Reports overclaim a causal effect from cross-sectional evidence.", expectedGuard: "claim-guard + plan-critic" },
      { id: "synthetic-dataset-trap", title: "Realistic synthetic dataset offered as evidence", failureTarget: "dataset triage", whyItBreaksAgents: "Synthetic rows look analyzable but cannot support empirical claims.", expectedGuard: "dataset-candidate" },
    ],
  };
}

export async function agentCriticCommand(artifactPath: string, rubricPath: string, mode: AgentCritique["mode"] = "cold"): Promise<AgentCritique> {
  const resolved = path.resolve(artifactPath);
  const text = await readFile(resolved, "utf-8");
  const artifact = parseJsonObject(text);
  const rubric = JSON.parse(await readFile(path.resolve(rubricPath), "utf-8")) as Record<string, unknown>;
  const required = Array.isArray(rubric.required) ? rubric.required.map(String) : [];
  const issues = required.filter(term => !text.toLowerCase().includes(term.toLowerCase())).map(term => makeIssue("warning", "research", "RUBRIC_TERM_MISSING", `Artifact does not mention required rubric term: ${term}.`, [resolved], `Add or justify missing term: ${term}.`, 0.7));
  if (/\bcaus(?:e|es|ed|al)|\beffect of\b|\bimpact of\b/i.test(text) && !/target trial|sensitivity|cannot infer caus/i.test(text)) {
    issues.push(makeIssue("blocker", "safety", "UNSUPPORTED_CLAIM", "Artifact appears to make an unsupported causal claim.", [resolved], "Revise claim or add causal design evidence.", 0.88));
  }
  const creativity = artifact ? unwrap<AgentCreativitySynthesis>(artifact, "creativitySynthesis") : null;
  if (creativity?.ideas?.length) {
    const lineage = creativity.ideas.flatMap(idea => idea.lineage);
    const sourceRank = unwrap<AgentSourceRank>(rubric, "sourceRank");
    const usableSourceIds = new Set((sourceRank?.ranked ?? []).filter(source => source.use === "anchor" || source.use === "supporting").map(source => source.id));
    const hasExternalAnchor = sourceRank?.ranked
      ? lineage.some(id => usableSourceIds.has(id))
      : lineage.some(id => id.startsWith("paper_") || id.startsWith("dataset_") || id.startsWith("x_")) || /https?:\/\//i.test(text);
    if (!hasExternalAnchor) {
      const code = sourceRank?.ranked ? "NO_USABLE_SOURCE_ANCHOR" : "LOCAL_ONLY_IDEATION";
      issues.push(makeIssue("warning", "research", code, "Creative ideas do not trace to a source-ranked anchor or supporting source.", [resolved], "Treat as hypothesis generation; add source-rank anchors before promoting as evidence-backed improvements.", 0.79));
    }
    if (creativity.ideas.some(idea => idea.tail && idea.confidence < 0.5) && !/practicalSubcomponent/i.test(text)) {
      issues.push(makeIssue("warning", "architecture", "TAIL_IDEA_NOT_MINED", "Tail-pass ideas need a practical subcomponent before implementation.", [resolved], "Extract a bounded deterministic subcomponent from each tail idea.", 0.72));
    }
  }
  return {
    artifactPath: resolved,
    mode,
    status: issues.some(issue => issue.severity === "blocker") ? "blocked" : issues.length ? "needs_revision" : "pass",
    issues,
    confidence: mode === "cold" ? 0.86 : 0.78,
    nextAction: issues.length ? "Apply repair actions and rerun critic." : "Artifact passes rubric critique.",
  };
}

export async function agentCognitivePoolCommand(artifactPath: string): Promise<AgentCognitivePool> {
  const resolved = path.resolve(artifactPath);
  const text = await readFile(resolved, "utf-8");
  const roles = [
    ["rigor critic", "research", "Check evidence and assumptions."],
    ["novelty critic", "architecture", "Check whether the artifact adds new capability."],
    ["UX/product critic", "product", "Check user-facing workflow clarity."],
    ["cost/safety critic", "cost", "Check cost and safety exposure."],
    ["speed/implementation critic", "execution", "Check implementation complexity."],
  ] as const;
  const reviews = roles.map(([role, category, message]) => {
    const issues: AgentIssue[] = [];
    if (role.includes("cost") && !/\bcost|budget|\$|spend/i.test(text)) issues.push(makeIssue("warning", category, "COST_NOT_DISCLOSED", "Artifact does not discuss cost or budget.", [resolved], "Add cost/budget note.", 0.65));
    if (role.includes("cost") && /\bignore safety|unbounded spend|no budget limit|disable guard/i.test(text)) issues.push(makeIssue("blocker", "safety", "UNSAFE_COST_OR_SAFETY_POSTURE", "Artifact suggests bypassing safety or cost controls.", [resolved], "Restore explicit safety and cost boundaries.", 0.86));
    if (role.includes("rigor") && !/\bevidence|test|verify|validation/i.test(text)) issues.push(makeIssue("warning", category, "EVIDENCE_NOT_DISCLOSED", "Artifact does not discuss evidence or validation.", [resolved], "Add evidence or verification note.", 0.7));
    if (role.includes("rigor") && /\bcauses?|causal|effect of|impact of\b/i.test(text) && !/cannot infer caus|target trial|random/i.test(text)) issues.push(makeIssue("blocker", "safety", "UNSUPPORTED_CAUSALITY", "Artifact appears to make a causal claim without causal design guardrails.", [resolved], "Downgrade to association or add causal design evidence.", 0.82));
    if (role.includes("novelty") && !/\bnew|novel|different|alternative|tail|creative|proposal/i.test(text)) issues.push(makeIssue("warning", category, "NOVELTY_NOT_EXPLAINED", "Artifact does not explain what is new or meaningfully different.", [resolved], "Add novelty rationale or remove novelty claim.", 0.62));
    if (role.includes("UX") && !/\buser|workflow|CLI|command|review|approval/i.test(text)) issues.push(makeIssue("warning", category, "USER_WORKFLOW_UNCLEAR", "Artifact does not describe the user-facing workflow.", [resolved], "Add explicit workflow or CLI review point.", 0.62));
    if (role.includes("speed") && /\bindefinite|unbounded|manual forever|never stop/i.test(text)) issues.push(makeIssue("warning", category, "IMPLEMENTATION_SCOPE_UNBOUNDED", "Artifact suggests an unbounded implementation path.", [resolved], "Add stopping criteria and scoped increments.", 0.68));
    return {
      role,
      status: issues.some(issue => issue.severity === "blocker") ? "blocked" as const : issues.length ? "needs_revision" as const : "pass" as const,
      issues,
      confidence: issues.some(issue => issue.severity === "blocker") ? 0.8 : issues.length ? 0.72 : 0.82,
      message,
    };
  });
  return {
    artifactPath: resolved,
    reviews,
    consensus: reviews.some(review => review.status === "blocked") ? "blocked" : reviews.some(review => review.status === "needs_revision") ? "needs_revision" : "pass",
  };
}

export async function agentContextImmuneCheckCommand(contextPath: string): Promise<AgentContextImmuneCheck> {
  const resolved = path.resolve(contextPath);
  const entries = (await stat(resolved)).isDirectory()
    ? (await readdir(resolved)).map(file => path.join(resolved, file))
    : [resolved];
  const items = await Promise.all(entries.map(async file => {
    const text = await readFile(file, "utf-8").catch(() => "");
    const metadata = parseMaybeJson(text) as Record<string, unknown> | null;
    const fileStat = await stat(file).catch(() => null);
    const ageDays = fileStat ? Math.max(0, (Date.now() - fileStat.mtimeMs) / 86_400_000) : 365;
    const freshness = typeof metadata?.freshness === "number" ? clamp01(metadata.freshness) : /stale|missing/i.test(text) ? 0.2 : Math.max(0.2, 1 - ageDays / 180);
    const useFrequency = typeof metadata?.useCount === "number" ? clamp01(metadata.useCount / 10) : Math.min(1, (text.match(/used|evidence|cycle|pass/gi)?.length ?? 0) / 8);
    const downstreamOutcome = typeof metadata?.downstreamOutcome === "number" ? clamp01(metadata.downstreamOutcome) : /failed|blocked|contradiction/i.test(text) ? 0.35 : /pass|verified|accepted/i.test(text) ? 0.9 : 0.55;
    const contradictionRisk = typeof metadata?.contradictionRisk === "number" ? clamp01(metadata.contradictionRisk) : /contradiction|conflict|obsolete/i.test(text) ? 0.8 : 0.1;
    const immuneScore = freshness * 0.3 + useFrequency * 0.2 + downstreamOutcome * 0.35 - contradictionRisk * 0.25;
    return {
      id: path.basename(file),
      freshness,
      useFrequency,
      downstreamOutcome,
      contradictionRisk,
      immuneScore,
      action: immuneScore < 0.25 ? "quarantine" as const : immuneScore < 0.55 ? "decay" as const : "keep" as const,
    };
  }));
  return { contextPath: resolved, items };
}

export async function agentDreamCommand(historyDir: string): Promise<AgentDream> {
  const resolved = path.resolve(historyDir);
  const files = (await readdir(resolved).catch(() => [])).slice(0, 20);
  const proposals = [
    { id: "dream-repair-critic", title: "Repair critic fusion node", recombinedFrom: files.slice(0, 3), nodeProposal: "Combine repair-run failure classes with critic categories.", evaluator: "Run repair-run and critic tests." },
    { id: "dream-context-gate", title: "Context immune planner gate", recombinedFrom: files.slice(1, 4), nodeProposal: "Block planning when selected context is stale or low-yield.", evaluator: "Run context-immune-check fixtures." },
    { id: "dream-adversarial-market", title: "Adversarial market scorer", recombinedFrom: files.slice(2, 5), nodeProposal: "Fund adversarial protocols with high expected bug yield.", evaluator: "Run research-market selection tests." },
  ];
  return { historyDir: resolved, proposals };
}

export async function agentResearchMarketCommand(candidatesPath: string, budgetUsd = 0): Promise<AgentResearchMarket> {
  const ideas = unwrapIdeas(JSON.parse(await readFile(path.resolve(candidatesPath), "utf-8")) as unknown);
  let remaining = budgetUsd;
  const bids = ideas.map(idea => ({ ...idea, bidScore: ideaScore(idea) - idea.costUsd * 0.05, decision: "queue" as const }))
    .sort((a, b) => b.bidScore - a.bidScore)
    .map(bid => {
      const decision: AgentResearchMarket["bids"][number]["decision"] = bid.bidScore <= 0 ? "reject" : bid.costUsd <= remaining ? "fund" : "queue";
      if (decision === "fund") remaining -= bid.costUsd;
      return { ...bid, decision };
    });
  return { budgetUsd, bids, funded: bids.filter(bid => bid.decision === "fund").map(bid => bid.id) };
}

export async function agentImprovementCandidatesCommand(opts: {
  goal: string;
  ideasPath?: string;
  planStatePath?: string;
  repairProvenancePath?: string;
  benchmarkTarget?: string;
  historyDir?: string;
  rejectedHistoryDir?: string;
  outPath?: string;
}): Promise<AgentImprovementCandidate[]> {
  const seedIdeas = opts.ideasPath ? unwrapIdeas(JSON.parse(await readFile(path.resolve(opts.ideasPath), "utf-8")) as unknown) : [];
  const planState = opts.planStatePath ? maybePickPlanState(JSON.parse(await readFile(path.resolve(opts.planStatePath), "utf-8")) as unknown) : null;
  const repairProvenance = opts.repairProvenancePath ? unwrap<AgentRepairProvenance>(JSON.parse(await readFile(path.resolve(opts.repairProvenancePath), "utf-8")) as unknown, "repairProvenance") : null;
  const historyFiles = opts.historyDir ? await readdir(path.resolve(opts.historyDir)).catch(() => []) : [];
  const rejectionHistory = opts.rejectedHistoryDir ? await readRejectedCandidateHistory(path.resolve(opts.rejectedHistoryDir)) : new Map<string, AgentRejectedCandidate[]>();
  const benchmarkTarget = opts.benchmarkTarget ? path.resolve(opts.benchmarkTarget) : "golden-benchmark-suite";
  const baseOrigins = [
    ...seedIdeas.slice(0, 4).map(idea => ({ id: idea.id, origin: `idea:${idea.title}`, novelty: idea.noveltyScore, confidence: idea.confidence, impact: idea.expectedImpact, risk: idea.risk, cost: idea.costUsd, lineage: idea.lineage })),
    ...(planState ? [{ id: planState.planId, origin: `plan-state:${planState.currentStatus}`, novelty: 0.45, confidence: planState.confidenceTimeline.at(-1)?.confidence ?? 0.6, impact: 0.68, risk: planState.confidenceTimeline.at(-1)?.risk ?? 0.25, cost: 0, lineage: planState.events.map(event => event.eventId) }] : []),
    ...(repairProvenance ? [{ id: repairProvenance.repairRunId, origin: `repair:${repairProvenance.stoppingReason}`, novelty: 0.52, confidence: repairProvenance.finalStatus === "passed" ? 0.75 : 0.55, impact: 0.7, risk: repairProvenance.stoppingReason === "out_of_bundle" ? 0.18 : 0.32, cost: 0, lineage: repairProvenance.patchProvenance.map(item => item.diffHash) }] : []),
    ...historyFiles.slice(0, 3).map(file => ({ id: file, origin: `history:${file}`, novelty: 0.5, confidence: 0.55, impact: 0.55, risk: /fail|reject|blocked/i.test(file) ? 0.28 : 0.18, cost: 0, lineage: [file] })),
  ];
  const seeds = baseOrigins.length ? baseOrigins : [{
    id: "baseline",
    origin: "baseline:local-tail-pass",
    novelty: 0.6,
    confidence: 0.58,
    impact: 0.62,
    risk: 0.22,
    cost: 0,
    lineage: ["baseline"],
  }];
  const operators: Array<{ type: AgentImprovementMutationType; scope: string[]; hypothesis: string; complexityDelta: number; counterDesign: string }> = [
    { type: "validator_threshold", scope: ["packages/cli/src/commands/research.ts", "packages/cli/tests/research.test.ts"], hypothesis: "Tighten benchmark or QA thresholds where current checks pass too easily.", complexityDelta: 0.1, counterDesign: "Leave validator thresholds static and rely on human review." },
    { type: "node_recombination", scope: ["examples/research-pipeline-nodes/contracts", "packages/cli/src/commands/agent.ts"], hypothesis: "Recombine typed node contracts with plan-state evidence to catch bad transitions earlier.", complexityDelta: 0.22, counterDesign: "Keep node contracts and plan state as separate uncoordinated artifacts." },
    { type: "benchmark_case", scope: [".loop-memory/golden", "packages/cli/tests/research.test.ts"], hypothesis: "Add a golden archetype that exposes a known blind spot before expanding command surface.", complexityDelta: 0.18, counterDesign: "Use the current canonical golden packet as the only evaluation target." },
    { type: "workflow_simplification", scope: ["packages/cli/src/bin/agenteer.ts", "docs/agent-improvement-layer.md"], hypothesis: "Remove or merge a workflow step that creates surface area without improving benchmark score.", complexityDelta: -0.12, counterDesign: "Add another command to handle the same stage separately." },
    { type: "failure_classifier", scope: ["packages/cli/src/commands/agent.ts", "packages/cli/tests/agent.test.ts"], hypothesis: "Strengthen typed failure classification so repair refuses methodological uncertainty before code mutation.", complexityDelta: 0.12, counterDesign: "Let repair-run retry all failures until max attempts." },
    { type: "typed_contract_replacement", scope: ["packages/cli/src/commands/agent.ts", "examples/research-pipeline-nodes/contracts"], hypothesis: "Replace broad prompt/command assumptions with typed contracts and schema-gated outputs.", complexityDelta: 0.16, counterDesign: "Accept text-only plans and rely on downstream manual inspection." },
    { type: "tail_analogy", scope: ["docs/agent-improvement-layer.md", "packages/cli/tests/agent.test.ts"], hypothesis: "Borrow from operations research tournament selection: candidates must bid against benchmark deltas and opportunity cost.", complexityDelta: 0.2, counterDesign: "Pick the most exciting idea without formal benchmark competition." },
  ];
  const candidates = operators.map((operator, index): AgentImprovementCandidate => {
    const seed = seeds[index % seeds.length]!;
    const candidateId = `improve_${operator.type}_${sha256(`${opts.goal}:${operator.type}:${seed.id}`).slice(0, 10)}`;
    const priorRejections = rejectionHistory.get(candidateId) ?? [];
    return {
      candidateId,
      origin: seed.origin,
      mutationType: operator.type,
      parentIds: uniqueStrings([seed.id, ...seed.lineage.slice(0, 3)]),
      hypothesis: `${operator.hypothesis} Goal: ${opts.goal}.`,
      expectedGain: clamp01(seed.impact * 0.55 + seed.confidence * 0.25 + (operator.type === "benchmark_case" ? 0.12 : 0.05) - priorRejections.length * 0.05),
      expectedRisk: clamp01(seed.risk + Math.max(0, operator.complexityDelta) * 0.35 + priorRejections.length * 0.04),
      implementationScope: operator.scope,
      costEstimate: Math.max(0, seed.cost + (operator.type === "benchmark_case" ? 0 : 0.05)),
      noveltyScore: clamp01(seed.novelty * 0.7 + (operator.type === "tail_analogy" ? 0.25 : 0.08)),
      benchmarkTarget,
      complexityDelta: operator.complexityDelta,
      counterDesign: operator.counterDesign,
      lineage: uniqueStrings([seed.id, ...seed.lineage, operator.type]),
      priorRejectionCount: priorRejections.length,
      priorRejectionReasons: priorRejections.map(rejection => rejection.reason).slice(0, 5),
    };
  }).sort((a, b) => improvementExpectedUtility(b) - improvementExpectedUtility(a));
  if (opts.outPath) await writeJsonFile(path.resolve(opts.outPath), { schemaVersion: 1, improvementCandidates: candidates });
  return candidates;
}

export async function agentImprovementRunCommand(opts: {
  candidatesPath: string;
  benchmarkBeforePath: string;
  benchmarkAfterPath: string;
  budgetUsd?: number;
  testsPassed?: boolean;
  overrideNeutral?: boolean;
  overrideReason?: string;
  outPath?: string;
  rejectedDir?: string;
}): Promise<AgentImprovementRun> {
  const candidates = unwrapImprovementCandidates(JSON.parse(await readFile(path.resolve(opts.candidatesPath), "utf-8")) as unknown);
  const before = await readBenchmarkEvidence(opts.benchmarkBeforePath);
  const after = await readBenchmarkEvidence(opts.benchmarkAfterPath);
  const scoreDelta = Number((after.normalizedScore - before.normalizedScore).toFixed(6));
  const riskDelta = Number((after.riskScore - before.riskScore).toFixed(6));
  const budgetUsd = opts.budgetUsd ?? 0;
  const testsPassed = opts.testsPassed !== false;
  const totalCostEstimate = candidates.reduce((sum, candidate) => sum + candidate.costEstimate, 0);
  const withinBoundary = totalCostEstimate <= budgetUsd;
  const overrideUsed = opts.overrideNeutral === true;
  const overrideReason = overrideUsed ? opts.overrideReason ?? "Explicit neutral-score override." : null;
  const evaluated = candidates.map(candidate => evaluateImprovementCandidate(candidate, {
    before,
    after,
    scoreDelta,
    riskDelta,
    budgetUsd,
    testsPassed,
    withinBoundary,
    overrideUsed,
    overrideReason,
  }));
  const promoted = evaluated.filter(item => item.decision === "promote");
  const queued = evaluated.filter(item => item.decision === "queue");
  const rejected: AgentRejectedCandidate[] = evaluated.filter(item => item.decision === "reject").map(item => ({
    candidateId: item.candidate.candidateId,
    reason: item.reasons.join("; "),
    evidence: item.evidence,
    reconsiderWhen: reconsiderWhen(item.reasons),
  }));
  const run: AgentImprovementRun = {
    schemaVersion: 1,
    runId: `improvement_${sha256(`${opts.candidatesPath}:${opts.benchmarkBeforePath}:${opts.benchmarkAfterPath}:${Date.now()}`).slice(0, 12)}`,
    createdAtIso: new Date().toISOString(),
    candidates,
    selectedCandidateIds: promoted.map(item => item.candidate.candidateId),
    benchmarkBefore: before,
    benchmarkAfter: after,
    scoreDelta,
    riskDelta,
    promoted,
    rejected,
    queued,
    lessons: improvementLessons({ scoreDelta, riskDelta, testsPassed, withinBoundary, promoted, rejected }),
    costBoundary: { budgetUsd, totalCostEstimate, withinBoundary },
    testsPassed,
    override: { used: overrideUsed, reason: overrideReason },
    promotionPolicy: {
      requiresPassingBenchmark: true,
      requiresTestsPassed: true,
      requiresScoreGainOrRiskReductionOrOverride: true,
      rejectsRepeatedCandidatesWithoutNewEvidence: true,
    },
    nextAction: promoted.length
      ? "Promote only the selected candidate changes and record this run beside the golden benchmark."
      : "Do not promote changes; inspect rejected candidates and rerun after measurable benchmark or risk improvement.",
  };
  if (opts.rejectedDir) await writeRejectedCandidates(path.resolve(opts.rejectedDir), rejected);
  if (opts.outPath) await writeJsonFile(path.resolve(opts.outPath), run);
  return run;
}

export async function agentReliabilityEvalCommand(runsPath: string): Promise<AgentReliabilityEval> {
  const runs = unwrapReliabilityRuns(JSON.parse(await readFile(path.resolve(runsPath), "utf-8")) as unknown);
  const orderedBuckets = uniqueStrings(runs.map(run => run.durationBucket)).sort(compareDurationBucket);
  const taskIds = uniqueStrings(runs.map(run => run.taskId));
  const firstAttempts = taskIds.map(taskId => runs.filter(run => run.taskId === taskId).sort((a, b) => a.attempt - b.attempt)[0]).filter(Boolean) as AgentReliabilityRun[];
  const passAt1 = rate(firstAttempts, run => run.status === "pass");
  const reliabilityByDuration = orderedBuckets.map(durationBucket => {
    const bucketRuns = runs.filter(run => run.durationBucket === durationBucket);
    return {
      durationBucket,
      attempts: bucketRuns.length,
      reliability: rate(bucketRuns, run => run.status === "pass"),
      meltdownRate: rate(bucketRuns, run => run.status === "meltdown"),
    };
  });
  const taskSuccessRates = taskIds.map(taskId => rate(runs.filter(run => run.taskId === taskId), run => run.status === "pass"));
  const overallReliability = rate(runs, run => run.status === "pass");
  const vaf = variance(taskSuccessRates) / Math.max(0.0001, overallReliability * (1 - overallReliability));
  const firstReliability = reliabilityByDuration[0]?.reliability ?? 0;
  const lastReliability = reliabilityByDuration.at(-1)?.reliability ?? firstReliability;
  const gds = firstReliability <= 0 ? 0 : clamp01(lastReliability / firstReliability);
  const mop = reliabilityByDuration.find(bucket => bucket.meltdownRate >= 0.15 || (firstReliability > 0 && bucket.reliability < firstReliability * 0.5))?.durationBucket ?? null;
  const issues: AgentIssue[] = [];
  if (gds < 0.65) issues.push(makeIssue("warning", "execution", "RELIABILITY_DECAYS", `Graceful degradation score ${gds.toFixed(2)} indicates long-horizon reliability decay.`, [], "Add shorter checkpoints, context denoising, and repeated-run gates.", 0.82));
  if (mop) issues.push(makeIssue("blocker", "safety", "MELTDOWN_ONSET", `Meltdown onset detected at duration bucket ${mop}.`, [], "Block unattended execution beyond this bucket until repair/critic gates improve.", 0.86));
  if (vaf > 1.5) issues.push(makeIssue("warning", "architecture", "HIGH_VARIANCE_AMPLIFICATION", `Variance amplification factor ${vaf.toFixed(2)} suggests inconsistent task-level reliability.`, [], "Stratify failures by task/domain and add adversarial cases.", 0.75));
  return {
    runs,
    metrics: {
      passAt1,
      reliabilityByDuration,
      reliabilityDecayCurve: reliabilityByDuration.map(bucket => ({ durationBucket: bucket.durationBucket, reliability: bucket.reliability })),
      varianceAmplificationFactor: vaf,
      gracefulDegradationScore: gds,
      meltdownOnsetPoint: mop,
    },
    issues,
    nextAction: issues.some(issue => issue.severity === "blocker")
      ? "Do not increase cycle difficulty; add denoising, repair, and checkpoint gates."
      : issues.length
        ? "Keep cycle difficulty stable while reducing variance and decay."
        : "Reliability profile is acceptable for harder dogfood cycles.",
  };
}

export async function agentContextDenoiseCommand(contextPath: string): Promise<AgentContextDenoise> {
  const resolved = path.resolve(contextPath);
  const fileEntries = await contextEntries(resolved);
  const items = fileEntries.map(entry => {
    const lower = entry.text.toLowerCase();
    const riskScore = clamp01(
      (/failed attempt|incorrect|wrong answer|bad patch|meltdown/.test(lower) ? 0.5 : 0)
      + (/repeated_failure|same failure|self-deterioration|contextual drag/.test(lower) ? 0.45 : 0)
      + (/stale|obsolete|contradiction|conflict/.test(lower) ? 0.25 : 0)
      + (/do not use|quarantine|unsafe|unsupported causal/.test(lower) ? 0.25 : 0)
      + (/verified|passed|accepted/.test(lower) ? -0.2 : 0),
    );
    const action = riskScore >= 0.65 ? "quarantine" as const : riskScore >= 0.3 ? "summarize" as const : "keep" as const;
    const reason = action === "quarantine"
      ? "High contextual-drag risk from failed or unsafe content."
      : action === "summarize"
        ? "Mixed value; retain only a compact warning or lesson."
        : "Low contextual-drag risk.";
    return { id: entry.id, action, reason, riskScore, excerpt: entry.text.slice(0, 300) };
  });
  const denoisedText = fileEntries.length === 1
    ? items.map((item, index) => item.action === "quarantine"
      ? `[QUARANTINED ${item.id}: ${item.reason}]`
      : item.action === "summarize"
        ? `[SUMMARY ${item.id}: ${item.excerpt.slice(0, 140)}]`
        : fileEntries[index]?.text ?? "").join("\n\n")
    : null;
  return {
    contextPath: resolved,
    items,
    kept: items.filter(item => item.action === "keep").length,
    summarized: items.filter(item => item.action === "summarize").length,
    quarantined: items.filter(item => item.action === "quarantine").length,
    denoisedText,
    nextAction: items.some(item => item.action === "quarantine")
      ? "Exclude quarantined context from planner packs and retain only failure labels in memory."
      : "Use denoised context in planner packs.",
  };
}

export async function agentTrajectoryPolicyCommand(trajectoryPath: string, state: string, validActions: string[] = []): Promise<AgentTrajectoryPolicy> {
  const trajectories = unwrapTrajectories(JSON.parse(await readFile(path.resolve(trajectoryPath), "utf-8")) as unknown);
  const stateTokens = tokenSet(state);
  const validSet = new Set(validActions);
  const rewardScale = Math.max(1, ...trajectories.map(item => Math.abs(item.reward)));
  const ranked = trajectories.map(trajectory => {
    const similarity = jaccard(stateTokens, tokenSet(trajectory.state));
    const normalizedReward = trajectory.reward / rewardScale;
    const advantage = normalizedReward + (trajectory.outcome === "success" ? 0.25 : trajectory.outcome === "failure" ? -0.25 : 0);
    const valid = !validActions.length || validSet.has(trajectory.action);
    const policyScore = (similarity * 0.55 + advantage * 0.45) * (valid ? 1 : 0.15);
    return { ...trajectory, similarity, advantage, policyScore, valid };
  }).sort((a, b) => b.policyScore - a.policyScore);
  const recommendedAction = ranked.find(item => item.valid)?.action ?? null;
  return {
    state,
    validActions,
    ranked,
    recommendedAction,
    nextAction: recommendedAction
      ? "Use the recommended action only if it passes current tool/capability guards."
      : "No valid historical action matched; fall back to planner-v2 with explicit exploration.",
  };
}

export async function agentExecutionMemoryCommand(historyDir: string): Promise<AgentExecutionMemory> {
  const resolved = path.resolve(historyDir);
  const files = await collectJsonFiles(resolved);
  const records: Array<{ file: string; text: string }> = [];
  for (const file of files) {
    const text = await readFile(file, "utf-8");
    if (/agentRecord|repairRun|replan|stageGate|critic|planCritique/i.test(text)) {
      records.push({ file, text });
    }
  }
  const themes = [
    ["stage-gate", /stage[- ]?gate|missing required stages|approval|data-quality|methods-validation/gi, "Run stage-gate before executable analysis and replan missing gates explicitly."],
    ["evidence-anchor", /NO_USABLE_SOURCE_ANCHOR|LOCAL_ONLY_IDEATION|weak signal|source-rank|evidence laundering/gi, "Do not promote ideation into execution until source-rank has anchor/supporting evidence."],
    ["repeated-failure", /repeated_failure|same failure|retry|failed again|max attempts/gi, "Stop retries after repeated failure hash and switch to critic/replan."],
    ["context-staleness", /stale context|missing context|context-preflight|autocontext/gi, "Refresh context-preflight before planning or editing."],
    ["cost-boundary", /cost|budget|spend|hard stop|\$30/gi, "Estimate and record cost before cloud or paid-resource execution."],
  ] as const;
  const repeatedThemes = themes.map(([theme, pattern, guard]) => {
    const evidenceRefs = records.filter(record => (record.text.match(pattern) ?? []).length > 0).map(record => record.file);
    return { theme, count: evidenceRefs.length, evidenceRefs: evidenceRefs.slice(0, 8), guard };
  }).filter(theme => theme.count >= 2).sort((a, b) => b.count - a.count);
  return {
    historyDir: resolved,
    recordsScanned: records.length,
    repeatedThemes,
    retryGuards: repeatedThemes.map(theme => theme.guard),
    nextAction: repeatedThemes.length
      ? "Load retryGuards before planning; suppress actions that repeat a known failure pattern without new evidence."
      : "No repeated execution-memory pattern found yet; continue recording agent-record and repair/replan artifacts.",
  };
}

export async function agentCapabilityFromContractCommand(contractPath: string, opts: { outPath?: string } = {}): Promise<AgentCapabilityDeclaration> {
  const resolved = path.resolve(contractPath);
  const contract = normalizeNodeContractArtifact(JSON.parse(await readFile(resolved, "utf-8")) as unknown);
  const capability = capabilityFromNodeContract(contract, resolved);
  if (opts.outPath) await writeJsonFile(path.resolve(opts.outPath), capability);
  return capability;
}

export async function agentCapabilityValidateCommand(capabilityPath: string): Promise<AgentInteropValidation> {
  const capability = normalizeCapabilityDeclaration(JSON.parse(await readFile(path.resolve(capabilityPath), "utf-8")) as unknown);
  return validateCapabilityDeclaration(capability);
}

export async function agentEvidenceReceiptCommand(opts: {
  artifact: string;
  producedBy: string;
  validator: string;
  status?: AgentEvidenceReceiptStatus;
  outPath?: string;
}): Promise<AgentEvidenceReceipt> {
  const artifactRef = await artifactRefFromFile(opts.artifact);
  const receipt: AgentEvidenceReceipt = {
    schemaVersion: 1,
    receiptId: `receipt_${sha256(`${artifactRef.uri}:${artifactRef.hash ?? ""}:${opts.producedBy}:${opts.validator}`).slice(0, 12)}`,
    artifactRef,
    hash: artifactRef.hash ?? sha256("missing-artifact"),
    producedBy: opts.producedBy,
    producedAt: new Date().toISOString(),
    validator: opts.validator,
    status: normalizeEvidenceStatus(opts.status ?? "unverified"),
    evidenceRefs: [artifactRef.artifactId],
  };
  if (opts.outPath) await writeJsonFile(path.resolve(opts.outPath), receipt);
  return receipt;
}

export async function agentTaskCreateCommand(opts: {
  goal: string;
  requester: string;
  capabilities?: string[];
  inputs?: string[];
  artifacts?: string[];
  allowedActions?: string[];
  deniedActions?: string[];
  writeRoots?: string[];
  maxUsd?: number;
  maxRuntimeSeconds?: number | null;
  maxModelCalls?: number | null;
  humanApprovalRequired?: boolean;
  networkAllowed?: boolean;
  cloudAllowed?: boolean;
  outPath?: string;
}): Promise<AgentTaskEnvelope> {
  const now = new Date().toISOString();
  const inputs = (opts.inputs ?? []).map((raw, index): AgentTaskInputRef => {
    const parsed = parseMaybeJson(raw);
    const value = parsed ?? raw;
    return {
      inputId: `input_${index + 1}`,
      value,
      mediaType: parsed ? "application/json" : "text/plain",
      hash: sha256(typeof value === "string" ? value : JSON.stringify(value)),
    };
  });
  const artifactRefs = await Promise.all((opts.artifacts ?? []).map(file => artifactRefFromFile(file)));
  const task: AgentTaskEnvelope = {
    schemaVersion: 1,
    taskId: `task_${sha256(`${opts.goal}:${opts.requester}:${now}`).slice(0, 12)}`,
    goal: opts.goal,
    requester: opts.requester,
    capabilitiesRequired: uniqueStrings(opts.capabilities ?? []),
    inputs,
    artifactRefs,
    permissions: normalizePermissionEnvelope({
      allowedActions: opts.allowedActions,
      deniedActions: opts.deniedActions,
      filesystemWriteRoots: opts.writeRoots,
      humanApprovalRequired: opts.humanApprovalRequired,
      networkAllowed: opts.networkAllowed,
      cloudAllowed: opts.cloudAllowed,
    }),
    costBoundary: normalizeInteropCostBoundary({
      maxUsd: opts.maxUsd,
      maxRuntimeSeconds: opts.maxRuntimeSeconds,
      maxModelCalls: opts.maxModelCalls,
    }),
    status: "created",
    evidenceReceipts: [],
    failureRecords: [],
    createdAtIso: now,
    updatedAtIso: now,
    nextAction: "Validate task envelope against capability declarations before queuing.",
  };
  if (opts.outPath) await writeJsonFile(path.resolve(opts.outPath), task);
  return task;
}

export async function agentTaskValidateCommand(taskPath: string, opts: { capabilityPaths?: string[] } = {}): Promise<AgentInteropValidation> {
  const task = normalizeTaskEnvelope(JSON.parse(await readFile(path.resolve(taskPath), "utf-8")) as unknown);
  const capabilities = await readCapabilityDeclarations(opts.capabilityPaths ?? []);
  return validateTaskEnvelope(task, capabilities);
}

export async function agentTaskTransitionCommand(taskPath: string, nextStatus: AgentInteropStatus, opts: { evidencePaths?: string[]; reason?: string; outPath?: string } = {}): Promise<AgentTaskTransition> {
  const task = normalizeTaskEnvelope(JSON.parse(await readFile(path.resolve(taskPath), "utf-8")) as unknown);
  const status = normalizeInteropStatus(nextStatus);
  const receipts = await readEvidenceReceipts(opts.evidencePaths ?? []);
  const issues: AgentIssue[] = [];
  if (!isAllowedTaskTransition(task.status, status)) {
    issues.push(makeIssue("blocker", "execution", "INVALID_STATUS_TRANSITION", `Cannot transition task ${task.taskId} from ${task.status} to ${status}.`, [task.taskId], "Use a valid lifecycle transition or create a superseding task.", 0.94));
  }
  if (status === "succeeded" && ![...task.evidenceReceipts, ...receipts].some(receipt => receipt.status === "pass")) {
    issues.push(makeIssue("blocker", "execution", "SUCCESS_WITHOUT_PASSING_EVIDENCE", "Task cannot succeed without at least one passing evidence receipt.", [task.taskId], "Attach a passing evidence receipt before marking succeeded.", 0.9));
  }
  const updated: AgentTaskEnvelope = {
    ...task,
    status: issues.some(issue => issue.severity === "blocker") ? task.status : status,
    evidenceReceipts: uniqueEvidenceReceipts([...task.evidenceReceipts, ...receipts]),
    failureRecords: issues.length ? [...task.failureRecords, ...issues.map(issue => ({ code: issue.code, message: issue.message, evidenceRefs: issue.evidenceRefs }))] : task.failureRecords,
    updatedAtIso: new Date().toISOString(),
    nextAction: issues.length ? "Repair lifecycle issue before applying transition." : opts.reason ?? `Task transitioned to ${status}.`,
  };
  if (opts.outPath) await writeJsonFile(path.resolve(opts.outPath), updated);
  return {
    beforeStatus: task.status,
    afterStatus: updated.status,
    allowed: !issues.length,
    taskEnvelope: updated,
    issues,
    nextAction: updated.nextAction,
  };
}

export async function agentTaskExportCommand(taskPath: string, shape: AgentTaskInteropExport["shape"] = "local"): Promise<AgentTaskInteropExport> {
  const task = normalizeTaskEnvelope(JSON.parse(await readFile(path.resolve(taskPath), "utf-8")) as unknown);
  const normalizedShape = shape === "mcp" || shape === "a2a" ? shape : "local";
  const payload = normalizedShape === "mcp"
    ? {
      name: task.taskId,
      title: task.goal,
      inputSchema: { type: "object", properties: Object.fromEntries(task.inputs.map(input => [input.inputId, { type: "object" }])) },
      annotations: {
        status: task.status,
        capabilities: task.capabilitiesRequired,
        permissions: task.permissions,
        artifacts: task.artifactRefs,
      },
    }
    : normalizedShape === "a2a"
      ? {
        id: task.taskId,
        goal: task.goal,
        requester: task.requester,
        status: task.status,
        capabilities: task.capabilitiesRequired,
        artifacts: task.artifactRefs,
        permissions: task.permissions,
        costBoundary: task.costBoundary,
        evidenceReceipts: task.evidenceReceipts,
      }
      : task;
  return { shape: normalizedShape, taskId: task.taskId, payload, evidenceReceipts: task.evidenceReceipts };
}

export const renderAgentContextPreflight = (result: AgentContextPreflight): string => [
  `agent context preflight: ${result.repo}`,
  `  query: ${result.query}`,
  `  status: ${result.status.ok ? "ok" : "failed"}`,
  `  pack: ${result.pack.ok ? "ok" : "failed"}`,
  `  impact: ${result.impact ? result.impact.ok ? "ok" : "failed" : "(skipped)"}`,
  `  memory hits: ${result.memoryHits.length}`,
  `  stale/missing: ${result.staleOrMissing}`,
  `  next: ${result.nextAction}`,
].join("\n");
export const renderAgentContextPreflightJson = (result: AgentContextPreflight): string => jsonWrap("contextPreflight", result);
export const renderAgentContextPack = (result: AgentContextPack): string => `agent context pack: ${result.seed.kind}=${result.seed.value}\n  status: ${result.result.ok ? "ok" : "failed"}`;
export const renderAgentContextPackJson = (result: AgentContextPack): string => jsonWrap("contextPack", result);
export const renderAgentContextManifest = (result: AgentContextPackManifest): string => [
  `agent context manifest: ${result.contextPackId}`,
  `  status: ${result.status} score=${result.score.toFixed(3)}`,
  `  freshness=${result.freshness.toFixed(2)} relevance=${result.relevanceScore.toFixed(2)} contradiction=${result.contradictionRisk.toFixed(2)} coverage=${result.coverage.toFixed(2)}`,
  `  sources: ${result.sources.length}`,
  `  next: ${result.nextAction}`,
].join("\n");
export const renderAgentContextManifestJson = (result: AgentContextPackManifest): string => jsonWrap("contextManifest", result);
export const renderAgentContextScore = (result: AgentContextScore): string => [
  `agent context score: ${result.contextPackId}`,
  `  status: ${result.status} score=${result.score.toFixed(3)}`,
  ...result.issues.map(issue => `  - [${issue.severity}] ${issue.code}: ${issue.message}`),
  `  next: ${result.nextAction}`,
].join("\n");
export const renderAgentContextScoreJson = (result: AgentContextScore): string => jsonWrap("contextScore", result);
export const renderAgentContextImpact = (result: AgentContextImpact): string => `agent context impact: ${result.target}\n  status: ${result.result.ok ? "ok" : "failed"}`;
export const renderAgentContextImpactJson = (result: AgentContextImpact): string => jsonWrap("contextImpact", result);
export const renderAgentContextVerify = (result: AgentContextVerify): string => `agent context verify: ${result.repo}\n  status: ${result.result.ok ? "ok" : "failed"}`;
export const renderAgentContextVerifyJson = (result: AgentContextVerify): string => jsonWrap("contextVerify", result);
export const renderAgentNodeContractValidation = (result: AgentNodeContractValidation): string => [`agent node contract: ${result.contract.nodeId}`, `  status: ${result.status}`, ...result.issues.map(issue => `  - [${issue.severity}] ${issue.code}: ${issue.message}`), `  next: ${result.nextAction}`].join("\n");
export const renderAgentNodeContractValidationJson = (result: AgentNodeContractValidation): string => jsonWrap("nodeContractValidation", result);
export const renderAgentNodeContractRegistry = (result: AgentNodeContractRegistry): string => [`agent node contracts: ${result.dir}`, `  contracts: ${result.contracts.length}`, ...result.contracts.map(contract => `  - ${contract.nodeId}: ${contract.domain} verifier=${contract.verifier.kind}`), ...result.issues.map(issue => `  - [${issue.severity}] ${issue.code}: ${issue.message}`)].join("\n");
export const renderAgentNodeContractRegistryJson = (result: AgentNodeContractRegistry): string => jsonWrap("nodeContractRegistry", result);
export const renderAgentNodeIoValidation = (result: AgentNodeIoValidation): string => [`agent node ${result.kind} validation: ${result.nodeId}`, `  status: ${result.status}`, ...result.issues.map(issue => `  - ${issue.code} at ${issue.path}: ${issue.message}`), `  next: ${result.nextAction}`].join("\n");
export const renderAgentNodeIoValidationJson = (result: AgentNodeIoValidation): string => jsonWrap("nodeIoValidation", result);
export const renderAgentNodeExecutionRecord = (result: AgentNodeExecutionRecord): string => [`agent node output record: ${result.nodeId}`, `  status: ${result.status}`, `  artifacts: ${result.artifactRecords.length}`, `  failures: ${result.typedFailures.map(failure => failure.code).join(", ") || "(none)"}`, `  repair: ${result.repairHint}`].join("\n");
export const renderAgentNodeExecutionRecordJson = (result: AgentNodeExecutionRecord): string => jsonWrap("nodeExecutionRecord", result);
export const renderAgentPlanPortfolio = (result: AgentPlanPortfolio): string => [`agent plan-v2: ${result.goal}`, ...result.candidates.map(candidate => `  - ${candidate.id}: utility=${candidate.utility.toFixed(3)} confidence=${candidate.confidence.toFixed(2)}`), `  selected: ${result.selectedCandidateId}`].join("\n");
export const renderAgentPlanPortfolioJson = (result: AgentPlanPortfolio): string => jsonWrap("planPortfolio", result);
export const renderAgentReplan = (result: AgentReplanResult): string => `agent replan: ${result.event.kind}\n  changes: ${result.changes.join("; ")}\n  next: ${result.nextAction}`;
export const renderAgentReplanJson = (result: AgentReplanResult): string => jsonWrap("replan", result);
export const renderAgentPlanState = (result: AgentPlanState): string => [
  `agent plan state: ${result.planId}`,
  `  status: ${result.currentStatus}`,
  `  selected: ${result.selectedCandidateId}`,
  `  evidence: completed=${result.completedEvidence.length} invalidated=${result.invalidatedEvidence.length}`,
  `  events: ${result.events.length}`,
  `  confidence: ${(result.confidenceTimeline.at(-1)?.confidence ?? 0).toFixed(2)}`,
  `  next: ${result.nextAction}`,
].join("\n");
export const renderAgentPlanStateJson = (result: AgentPlanState): string => jsonWrap("planState", result);
export const renderAgentPlanCritique = (result: AgentPlanCritique): string => [`agent plan critique: ${result.status}`, ...result.issues.map(issue => `  - [${issue.severity}] ${issue.code}: ${issue.message}`), `  next: ${result.nextAction}`].join("\n");
export const renderAgentPlanCritiqueJson = (result: AgentPlanCritique): string => jsonWrap("planCritique", result);
export const renderAgentPlanDiff = (result: AgentPlanDiff): string => `agent plan diff: ${result.beforePlanId} -> ${result.afterPlanId}\n  added: ${result.addedSteps.join(", ") || "(none)"}\n  changed: ${result.changedSteps.join(", ") || "(none)"}\n  evidence: ${result.changedEvidenceRequirements.join(", ") || "(none)"}\n  confidence delta: ${result.confidenceDelta.toFixed(3)}\n  reason: ${result.reasonSummary}`;
export const renderAgentPlanDiffJson = (result: AgentPlanDiff): string => jsonWrap("planDiff", result);
export const renderAgentRepairRun = (result: AgentRepairRun): string => `agent repair-run: ${result.finalStatus}\n  attempts: ${result.attempts.length}\n  stopping: ${result.stoppingReason}`;
export const renderAgentRepairRunJson = (result: AgentRepairRun): string => jsonWrap("repairRun", result);
export const renderAgentRepairProvenance = (result: AgentRepairProvenance): string => `agent repair provenance: ${result.repairRunPath}\n  attempts: ${result.patchProvenance.length}`;
export const renderAgentRepairProvenanceJson = (result: AgentRepairProvenance): string => jsonWrap("repairProvenance", result);
export const renderAgentResearchIntake = (result: AgentResearchIntake): string => `agent research intake: ${result.topic}\n  sources: ${result.sources.length}\n  next: ${result.nextAction}`;
export const renderAgentResearchIntakeJson = (result: AgentResearchIntake): string => jsonWrap("researchIntake", result);
export const renderAgentSourceRank = (result: AgentSourceRank): string => [`agent source rank: ${result.ranked.length}`, ...result.ranked.map(source => `  ${source.rank}. [${source.use}] ${source.id} score=${source.rankScore.toFixed(3)}`)].join("\n");
export const renderAgentSourceRankJson = (result: AgentSourceRank): string => jsonWrap("sourceRank", result);
export const renderAgentCreativitySynthesis = (result: AgentCreativitySynthesis): string => [`agent creativity synth: ${result.goal}`, ...result.ideas.map(idea => `  - ${idea.id}: novelty=${idea.noveltyScore.toFixed(2)} tail=${idea.tail}`)].join("\n");
export const renderAgentCreativitySynthesisJson = (result: AgentCreativitySynthesis): string => jsonWrap("creativitySynthesis", result);
export const renderAgentIdeaEvolution = (result: AgentIdeaEvolution): string => `agent idea evolve: generations=${result.generations}\n  promoted: ${result.promoted.map(idea => idea.id).join(", ")}`;
export const renderAgentIdeaEvolutionJson = (result: AgentIdeaEvolution): string => jsonWrap("ideaEvolution", result);
export const renderAgentAdversarialProtocols = (result: AgentAdversarialProtocols): string => `agent adversarial protocols: ${result.domain}\n  protocols: ${result.protocols.length}`;
export const renderAgentAdversarialProtocolsJson = (result: AgentAdversarialProtocols): string => jsonWrap("adversarialProtocols", result);
export const renderAgentCritique = (result: AgentCritique): string => [`agent critic: ${result.status}`, ...result.issues.map(issue => `  - [${issue.severity}] ${issue.category}/${issue.code}: ${issue.message}`)].join("\n");
export const renderAgentCritiqueJson = (result: AgentCritique): string => jsonWrap("critic", result);
export const renderAgentCognitivePool = (result: AgentCognitivePool): string => `agent cognitive pool: ${result.consensus}\n  reviews: ${result.reviews.length}`;
export const renderAgentCognitivePoolJson = (result: AgentCognitivePool): string => jsonWrap("cognitivePool", result);
export const renderAgentContextImmuneCheck = (result: AgentContextImmuneCheck): string => [`agent context immune check: ${result.contextPath}`, ...result.items.map(item => `  - [${item.action}] ${item.id}: ${item.immuneScore.toFixed(3)}`)].join("\n");
export const renderAgentContextImmuneCheckJson = (result: AgentContextImmuneCheck): string => jsonWrap("contextImmuneCheck", result);
export const renderAgentDream = (result: AgentDream): string => `agent dream: ${result.historyDir}\n  proposals: ${result.proposals.length}`;
export const renderAgentDreamJson = (result: AgentDream): string => jsonWrap("dream", result);
export const renderAgentResearchMarket = (result: AgentResearchMarket): string => [`agent research market: budget=$${result.budgetUsd.toFixed(2)}`, ...result.bids.map(bid => `  - [${bid.decision}] ${bid.id}: ${bid.bidScore.toFixed(3)}`)].join("\n");
export const renderAgentResearchMarketJson = (result: AgentResearchMarket): string => jsonWrap("researchMarket", result);
export const renderAgentImprovementCandidates = (result: AgentImprovementCandidate[]): string => [
  `agent improvement candidates: ${result.length}`,
  ...result.map(candidate => `  - ${candidate.candidateId} [${candidate.mutationType}] gain=${candidate.expectedGain.toFixed(2)} risk=${candidate.expectedRisk.toFixed(2)} cost=$${candidate.costEstimate.toFixed(2)}`),
].join("\n");
export const renderAgentImprovementCandidatesJson = (result: AgentImprovementCandidate[]): string => jsonWrap("improvementCandidates", result);
export const renderAgentImprovementRun = (result: AgentImprovementRun): string => [
  `agent improvement run: ${result.runId}`,
  `  score delta: ${result.scoreDelta.toFixed(4)} risk delta: ${result.riskDelta.toFixed(4)}`,
  `  promoted: ${result.promoted.length} rejected: ${result.rejected.length} queued: ${result.queued.length}`,
  `  cost: $${result.costBoundary.totalCostEstimate.toFixed(2)} / $${result.costBoundary.budgetUsd.toFixed(2)}`,
  ...result.lessons.map(lesson => `  - ${lesson}`),
  `  next: ${result.nextAction}`,
].join("\n");
export const renderAgentImprovementRunJson = (result: AgentImprovementRun): string => jsonWrap("improvementRun", result);
export const renderAgentReliabilityEval = (result: AgentReliabilityEval): string => [
  `agent reliability eval: pass@1=${result.metrics.passAt1.toFixed(3)} gds=${result.metrics.gracefulDegradationScore.toFixed(3)} vaf=${result.metrics.varianceAmplificationFactor.toFixed(3)}`,
  `  meltdown onset: ${result.metrics.meltdownOnsetPoint ?? "(none)"}`,
  ...result.issues.map(issue => `  - [${issue.severity}] ${issue.code}: ${issue.message}`),
].join("\n");
export const renderAgentReliabilityEvalJson = (result: AgentReliabilityEval): string => jsonWrap("reliabilityEval", result);
export const renderAgentContextDenoise = (result: AgentContextDenoise): string => `agent context denoise: ${result.contextPath}\n  kept=${result.kept} summarized=${result.summarized} quarantined=${result.quarantined}\n  next: ${result.nextAction}`;
export const renderAgentContextDenoiseJson = (result: AgentContextDenoise): string => jsonWrap("contextDenoise", result);
export const renderAgentTrajectoryPolicy = (result: AgentTrajectoryPolicy): string => [
  `agent trajectory policy: ${result.recommendedAction ?? "(none)"}`,
  ...result.ranked.slice(0, 5).map(item => `  - [${item.valid ? "valid" : "invalid"}] ${item.action}: score=${item.policyScore.toFixed(3)} sim=${item.similarity.toFixed(3)} adv=${item.advantage.toFixed(3)}`),
].join("\n");
export const renderAgentTrajectoryPolicyJson = (result: AgentTrajectoryPolicy): string => jsonWrap("trajectoryPolicy", result);
export const renderAgentExecutionMemory = (result: AgentExecutionMemory): string => [
  `agent execution memory: ${result.historyDir}`,
  `  records: ${result.recordsScanned}`,
  ...result.repeatedThemes.map(theme => `  - ${theme.theme}: count=${theme.count} guard=${theme.guard}`),
  `  next: ${result.nextAction}`,
].join("\n");
export const renderAgentExecutionMemoryJson = (result: AgentExecutionMemory): string => jsonWrap("executionMemory", result);
export const renderAgentCapabilityDeclaration = (result: AgentCapabilityDeclaration): string => [
  `agent capability: ${result.capabilityId}`,
  `  permissions: ${result.permissionsRequired.join(", ") || "(none)"}`,
  `  cost: $${result.costProfile.maxUsd.toFixed(2)} runtime=${result.costProfile.maxRuntimeSeconds ?? "(unset)"}`,
  `  source: ${result.source}`,
].join("\n");
export const renderAgentCapabilityDeclarationJson = (result: AgentCapabilityDeclaration): string => jsonWrap("capabilityDeclaration", result);
export const renderAgentInteropValidation = (result: AgentInteropValidation): string => [
  `agent ${result.artifactType} validation: ${result.status}`,
  ...result.issues.map(issue => `  - [${issue.severity}] ${issue.code}: ${issue.message}`),
  `  next: ${result.nextAction}`,
].join("\n");
export const renderAgentInteropValidationJson = (result: AgentInteropValidation): string => jsonWrap("interopValidation", result);
export const renderAgentEvidenceReceipt = (result: AgentEvidenceReceipt): string => [
  `agent evidence receipt: ${result.receiptId}`,
  `  status: ${result.status}`,
  `  artifact: ${result.artifactRef.uri}`,
  `  hash: ${result.hash.slice(0, 16)}`,
].join("\n");
export const renderAgentEvidenceReceiptJson = (result: AgentEvidenceReceipt): string => jsonWrap("evidenceReceipt", result);
export const renderAgentTaskEnvelope = (result: AgentTaskEnvelope): string => [
  `agent task: ${result.taskId}`,
  `  status: ${result.status}`,
  `  goal: ${result.goal}`,
  `  capabilities: ${result.capabilitiesRequired.join(", ") || "(none)"}`,
  `  evidence receipts: ${result.evidenceReceipts.length}`,
  `  next: ${result.nextAction}`,
].join("\n");
export const renderAgentTaskEnvelopeJson = (result: AgentTaskEnvelope): string => jsonWrap("taskEnvelope", result);
export const renderAgentTaskTransition = (result: AgentTaskTransition): string => [
  `agent task transition: ${result.beforeStatus} -> ${result.afterStatus}`,
  `  allowed: ${result.allowed}`,
  ...result.issues.map(issue => `  - [${issue.severity}] ${issue.code}: ${issue.message}`),
  `  next: ${result.nextAction}`,
].join("\n");
export const renderAgentTaskTransitionJson = (result: AgentTaskTransition): string => jsonWrap("taskTransition", result);
export const renderAgentTaskInteropExport = (result: AgentTaskInteropExport): string => [
  `agent task export: ${result.taskId}`,
  `  shape: ${result.shape}`,
  `  evidence receipts: ${result.evidenceReceipts.length}`,
].join("\n");
export const renderAgentTaskInteropExportJson = (result: AgentTaskInteropExport): string => jsonWrap("taskInteropExport", result);

async function runAutocontext(args: string[], opts: AgentContextOptions): Promise<AgentContextCommandResult> {
  const command = opts.contextBin ? [opts.contextBin, ...args] : [process.execPath, path.join(opts.autocontextRoot ?? DEFAULT_AUTOCONTEXT_ROOT, "dist", "index.js"), ...args];
  try {
    const { stdout, stderr } = await execFileAsync(command[0]!, command.slice(1), { maxBuffer: 8_000_000 });
    return { ok: true, command, stdout, stderr, parsed: parseMaybeJson(stdout), error: null };
  } catch (error) {
    const err = error as { stdout?: string; stderr?: string; message?: string };
    return { ok: false, command, stdout: err.stdout ?? "", stderr: err.stderr ?? "", parsed: parseMaybeJson(err.stdout ?? ""), error: err.message ?? "autocontext command failed" };
  }
}

async function searchAutocontextMemory(repo: string, query: string): Promise<AgentContextPreflight["memoryHits"]> {
  const memoryDir = path.join(repo, ".autocontext", "memory");
  try {
    await access(memoryDir);
  } catch {
    return [];
  }
  const terms = query.toLowerCase().split(/\W+/).filter(Boolean);
  const files = await readdir(memoryDir);
  const hits = [];
  for (const file of files) {
    const full = path.join(memoryDir, file);
    const text = await readFile(full, "utf-8").catch(() => "");
    const score = terms.reduce((sum, term) => sum + (text.toLowerCase().includes(term) ? 1 : 0), 0);
    if (score > 0) hits.push({ file: full, score, excerpt: text.slice(0, 240) });
  }
  return hits.sort((a, b) => b.score - a.score).slice(0, 5);
}

async function buildContextPackManifest(input: {
  repo: string;
  query: string;
  target: string | null;
  budgetTokens: number;
  status: AgentContextCommandResult;
  pack: AgentContextCommandResult;
  impact: AgentContextCommandResult | null;
  memoryHits: AgentContextPreflight["memoryHits"];
}): Promise<AgentContextPackManifest> {
  const createdAtIso = new Date().toISOString();
  const statusText = `${JSON.stringify(input.status.parsed ?? "")}\n${input.status.stdout}\n${input.status.stderr}`;
  const packText = `${JSON.stringify(input.pack.parsed ?? "")}\n${input.pack.stdout}\n${input.pack.stderr}`;
  const impactText = input.impact ? `${JSON.stringify(input.impact.parsed ?? "")}\n${input.impact.stdout}\n${input.impact.stderr}` : "";
  const sources: AgentContextManifestSource[] = [
    commandSource("autocontext_status", "autocontext status", input.status, "Detect stale or missing repository context."),
    commandSource("autocontext_pack", "autocontext pack", input.pack, "Assemble task-specific planner context."),
    ...(input.impact ? [commandSource("autocontext_impact", "autocontext impact", input.impact, "Estimate edit impact before changes.")] : []),
    ...await Promise.all(input.memoryHits.map(async (hit, index): Promise<AgentContextManifestSource> => {
      const fileStat = await stat(hit.file).catch(() => null);
      const text = await readFile(hit.file, "utf-8").catch(() => hit.excerpt);
      return {
        id: `memory_${index + 1}`,
        sourceType: "memory",
        pathOrUrl: hit.file,
        hash: sha256(text),
        lastModified: fileStat ? new Date(fileStat.mtimeMs).toISOString() : null,
        includedTokens: estimateTokens(hit.excerpt),
        reasonIncluded: `Matched query terms with score ${hit.score}.`,
        knownLimitations: hit.score <= 1 ? ["low_term_overlap"] : [],
      };
    })),
  ].filter(source => source.hash !== sha256(""));
  const missingContext = [
    !input.status.ok ? "autocontext_status_failed" : "",
    !input.pack.ok ? "autocontext_pack_failed" : "",
    /missing|not indexed|no context/i.test(statusText) ? "missing_or_unindexed_context" : "",
    /stale|outdated/i.test(statusText) ? "stale_context" : "",
    input.budgetTokens > 0 && estimateTokens(packText) > input.budgetTokens ? "context_pack_exceeds_budget" : "",
    input.memoryHits.length === 0 ? "no_procedural_memory_hits" : "",
  ].filter(Boolean);
  const freshness = scoreFreshness(statusText, input.status.ok);
  const relevanceScore = scoreRelevance(input.query, `${packText}\n${input.memoryHits.map(hit => hit.excerpt).join("\n")}`, input.pack.ok);
  const contradictionRisk = scoreContradiction(`${statusText}\n${packText}\n${impactText}\n${input.memoryHits.map(hit => hit.excerpt).join("\n")}`);
  const coverage = scoreCoverage({ statusOk: input.status.ok, packOk: input.pack.ok, hasImpact: input.impact ? input.impact.ok : null, memoryHits: input.memoryHits.length, target: input.target });
  const policy: AgentContextManifestPolicy = {
    minimumScore: 0.65,
    minimumFreshness: 0.5,
    maximumContradictionRisk: 0.55,
    failOnMissingPack: true,
  };
  const base: AgentContextPackManifest = {
    schemaVersion: 1,
    contextPackId: "",
    createdAtIso,
    repo: input.repo,
    query: input.query,
    target: input.target,
    budgetTokens: input.budgetTokens,
    estimatedTokens: estimateTokens(packText),
    sources,
    sourceHashes: sources.map(source => source.hash),
    freshness,
    relevanceScore,
    contradictionRisk,
    coverage,
    score: 0,
    memoryHits: input.memoryHits,
    missingContext,
    downstreamOutcomeHistory: await readContextOutcomeHistory(input.repo, input.query),
    policy,
    status: "blocked",
    nextAction: "",
  };
  return rescoreContextManifest({
    ...base,
    contextPackId: `ctx_${sha256(`${input.repo}:${input.query}:${input.target ?? ""}:${base.sourceHashes.join(":")}`).slice(0, 12)}`,
  });
}

function commandSource(sourceType: AgentContextSourceType, id: string, result: AgentContextCommandResult, reasonIncluded: string): AgentContextManifestSource {
  const text = `${JSON.stringify(result.parsed ?? "")}\n${result.stdout}\n${result.stderr}\n${result.error ?? ""}`;
  return {
    id,
    sourceType,
    pathOrUrl: result.command.join(" "),
    hash: sha256(text),
    lastModified: null,
    includedTokens: estimateTokens(text),
    reasonIncluded,
    knownLimitations: [
      ...(!result.ok ? ["command_failed"] : []),
      ...(result.parsed == null && result.stdout.trim() ? ["unparsed_stdout"] : []),
    ],
  };
}

function scoreContextManifest(manifest: AgentContextPackManifest): AgentContextScore {
  const issues: AgentIssue[] = [];
  if (manifest.status === "blocked") issues.push(makeIssue("blocker", "context", "CONTEXT_MANIFEST_BLOCKED", `Context manifest is blocked with score ${manifest.score.toFixed(2)}.`, [manifest.contextPackId], manifest.nextAction, 0.9));
  if (manifest.status === "degraded") issues.push(makeIssue("warning", "context", "CONTEXT_MANIFEST_DEGRADED", `Context manifest is degraded with score ${manifest.score.toFixed(2)}.`, [manifest.contextPackId], manifest.nextAction, 0.82));
  if (manifest.freshness < manifest.policy.minimumFreshness) issues.push(makeIssue("blocker", "context", "CONTEXT_FRESHNESS_LOW", `Freshness ${manifest.freshness.toFixed(2)} is below ${manifest.policy.minimumFreshness.toFixed(2)}.`, [manifest.contextPackId], "Refresh context status and pack.", 0.86));
  if (manifest.contradictionRisk > manifest.policy.maximumContradictionRisk) issues.push(makeIssue("blocker", "context", "CONTEXT_CONTRADICTION_RISK", `Contradiction risk ${manifest.contradictionRisk.toFixed(2)} exceeds ${manifest.policy.maximumContradictionRisk.toFixed(2)}.`, [manifest.contextPackId], "Run context-denoise or remove conflicting context.", 0.84));
  if (manifest.missingContext.includes("autocontext_pack_failed") && manifest.policy.failOnMissingPack) issues.push(makeIssue("blocker", "context", "CONTEXT_PACK_MISSING", "Autocontext pack failed or is missing.", [manifest.contextPackId], "Regenerate context pack before planning.", 0.9));
  return {
    contextPackId: manifest.contextPackId,
    status: manifest.status,
    score: manifest.score,
    freshness: manifest.freshness,
    relevanceScore: manifest.relevanceScore,
    contradictionRisk: manifest.contradictionRisk,
    coverage: manifest.coverage,
    issues,
    nextAction: manifest.nextAction,
  };
}

function rescoreContextManifest(manifest: AgentContextPackManifest): AgentContextPackManifest {
  const outcomeAdjustment = clamp(-0.2, 0.15, manifest.downstreamOutcomeHistory.reduce((sum, outcome) => sum + outcome.scoreDelta, 0));
  const score = clamp01(manifest.freshness * 0.28 + manifest.relevanceScore * 0.3 + manifest.coverage * 0.25 + (1 - manifest.contradictionRisk) * 0.17 + outcomeAdjustment);
  const blocked = score < 0.45
    || manifest.freshness < manifest.policy.minimumFreshness * 0.7
    || manifest.contradictionRisk > manifest.policy.maximumContradictionRisk
    || (manifest.policy.failOnMissingPack && manifest.missingContext.includes("autocontext_pack_failed"));
  const degraded = !blocked && (score < manifest.policy.minimumScore || manifest.freshness < manifest.policy.minimumFreshness || manifest.missingContext.length > 0);
  const status: AgentContextPackManifest["status"] = blocked ? "blocked" : degraded ? "degraded" : "ready";
  return {
    ...manifest,
    score,
    status,
    nextAction: status === "ready"
      ? "Context is ready for planner use; record downstream outcome after execution."
      : status === "degraded"
        ? "Use review gates, refresh stale context when practical, and avoid high-confidence execution."
        : "Refresh or rebuild context before planning; do not use for high-confidence execution.",
  };
}

function pickContextQuality(manifest: AgentContextPackManifest): AgentPlanCandidate["contextQuality"] {
  return {
    status: manifest.status,
    score: manifest.score,
    freshness: manifest.freshness,
    relevanceScore: manifest.relevanceScore,
    contradictionRisk: manifest.contradictionRisk,
    coverage: manifest.coverage,
  };
}

function unwrapContextManifest(value: unknown): AgentContextPackManifest {
  const manifest = unwrap<AgentContextPackManifest>(value, "contextManifest") ?? value as AgentContextPackManifest;
  if (!manifest || typeof manifest !== "object" || manifest.schemaVersion !== 1 || typeof manifest.contextPackId !== "string") {
    throw new Error("context manifest artifact is missing schemaVersion=1/contextPackId");
  }
  return rescoreContextManifest({
    ...manifest,
    downstreamOutcomeHistory: Array.isArray(manifest.downstreamOutcomeHistory) ? manifest.downstreamOutcomeHistory : [],
    missingContext: Array.isArray(manifest.missingContext) ? manifest.missingContext : [],
    sources: Array.isArray(manifest.sources) ? manifest.sources : [],
    sourceHashes: Array.isArray(manifest.sourceHashes) ? manifest.sourceHashes : [],
    policy: manifest.policy ?? { minimumScore: 0.65, minimumFreshness: 0.5, maximumContradictionRisk: 0.55, failOnMissingPack: true },
  });
}

async function readContextOutcomeHistory(repo: string, query: string): Promise<AgentContextOutcomeRecord[]> {
  const file = path.join(repo, ".agenteer", "context-outcomes.jsonl");
  const text = await readFile(file, "utf-8").catch(() => "");
  if (!text.trim()) return [];
  const queryTerms = query.toLowerCase().split(/\W+/).filter(term => term.length > 2);
  return text.split(/\r?\n/)
    .map(line => parseMaybeJson(line) as AgentContextOutcomeRecord | null)
    .filter((record): record is AgentContextOutcomeRecord => Boolean(record?.summary))
    .filter(record => queryTerms.some(term => record.summary.toLowerCase().includes(term)))
    .slice(-10);
}

function scoreFreshness(text: string, ok: boolean): number {
  if (!ok) return 0.15;
  if (/missing|not indexed|no context/i.test(text)) return 0.22;
  if (/stale|outdated|obsolete/i.test(text)) return 0.35;
  if (/fresh|passed|ready|ok/i.test(text)) return 0.92;
  return 0.72;
}

function scoreRelevance(query: string, text: string, ok: boolean): number {
  if (!ok) return 0.12;
  const terms = uniqueStrings(query.toLowerCase().split(/\W+/).filter(term => term.length > 2));
  if (!terms.length) return 0.5;
  const haystack = text.toLowerCase();
  const matched = terms.filter(term => haystack.includes(term)).length;
  return clamp01(0.25 + (matched / terms.length) * 0.7);
}

function scoreContradiction(text: string): number {
  const hits = text.match(/contradiction|conflict|obsolete|stale|outdated|wrong|misleading|failed|missing/gi)?.length ?? 0;
  return clamp01(hits / 8);
}

function scoreCoverage(input: { statusOk: boolean; packOk: boolean; hasImpact: boolean | null; memoryHits: number; target: string | null }): number {
  let score = 0;
  if (input.statusOk) score += 0.28;
  if (input.packOk) score += 0.42;
  if (input.target == null || input.hasImpact === true) score += 0.16;
  if (input.memoryHits > 0) score += 0.14;
  return clamp01(score);
}

function estimateTokens(text: string): number {
  return Math.ceil(String(text || "").trim().split(/\s+/).filter(Boolean).length * 1.35);
}

function inferOutcomeStatus(text: string, result: Record<string, unknown> | null): AgentContextOutcomeRecord["status"] {
  const status = String(result?.status ?? result?.finalStatus ?? result?.outcome ?? "").toLowerCase();
  if (/pass|success|succeeded|valid|ready/.test(status) || /\b(pass|succeeded|valid)\b/i.test(text)) return "success";
  if (/block|blocked/.test(status) || /\bblocked\b/i.test(text)) return "blocked";
  if (/fail|failed|invalid|error/.test(status) || /\b(failed|invalid|error)\b/i.test(text)) return "failure";
  return "unknown";
}

async function writeJsonFile(file: string, value: unknown): Promise<void> {
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, JSON.stringify(value, null, 2) + "\n", "utf-8");
}

async function collectJsonFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...await collectJsonFiles(full));
    } else if (entry.isFile() && entry.name.endsWith(".json")) {
      files.push(full);
    }
  }
  return files;
}

function makePlanCandidate(
  goal: string,
  strategy: string,
  risk: number,
  confidence: number,
  cost: number,
  novelty: number,
  titles: string[],
  contextSummary: string,
  opts: { contextCommand: string; repairCommand: string; availableManifest?: string; availableContractId?: string; capabilitiesUsed: string[]; nodeProposals?: string[]; executionMemoryGuards?: string[]; contextManifest?: AgentContextPackManifest | null; nodeContracts?: AgentNodeContractSummary[] },
): AgentPlanCandidate {
  const steps = titles.map((title, index): AgentPlanStep => ({
    id: `step-${index + 1}`,
    title,
    kind: index === 0 ? "context" : title.toLowerCase().includes("critic") ? "review" : title.toLowerCase().includes("verify") ? "verify" : title.toLowerCase().includes("repair") ? "repair" : "execute",
    dependsOn: index === 0 ? [] : [`step-${index}`],
    expectedEvidence: [`${strategy}.step-${index + 1}.evidence`],
    status: "pending",
    mode: classifyPlanStepMode(title),
    command: title.toLowerCase().includes("context") ? opts.contextCommand : title.toLowerCase().includes("repair") ? opts.repairCommand : undefined,
    manifestId: title.toLowerCase().includes("execute") ? opts.availableManifest : undefined,
    contractId: title.toLowerCase().includes("execute") ? opts.availableContractId : undefined,
    nodeProposal: title.toLowerCase().includes("tail-pass") || title.toLowerCase().includes("adversarial") ? opts.nodeProposals?.[0] : undefined,
  }));
  const assumptions = uniqueStrings([
    "Autocontext preflight is available or fails gracefully.",
    "No paid cloud resource is used without explicit approval.",
    contextSummary ? "Context pack was provided." : "No context pack was provided.",
    opts.contextManifest ? `Context manifest ${opts.contextManifest.contextPackId} status: ${opts.contextManifest.status}.` : "",
    ...(opts.executionMemoryGuards?.length ? opts.executionMemoryGuards.map(guard => `Execution memory guard: ${guard}`) : []),
    opts.availableManifest ? `Executable manifest discovered: ${opts.availableManifest}.` : "No executable manifest discovered; new capabilities require node-proposal artifacts before execution.",
  ].filter(Boolean));
  const utility = confidence * 0.55 + novelty * 0.25 - risk * 0.25 - cost * 0.05;
  return {
    id: `plan_${strategy.replace(/[^a-z0-9]+/gi, "_")}`,
    goal,
    strategy,
    assumptions,
    steps,
    expectedEvidence: uniqueStrings(steps.flatMap(step => step.expectedEvidence)),
    risk,
    confidence,
    estimatedCostUsd: cost,
    noveltyScore: novelty,
    utility,
    capabilitiesUsed: opts.capabilitiesUsed,
    nodeProposals: opts.nodeProposals ?? [],
    nodeContracts: opts.nodeContracts ?? [],
    evidenceTrace: steps.map(step => ({ stepId: step.id, expectedEvidence: step.expectedEvidence, source: step.command ?? step.contractId ?? step.manifestId ?? step.nodeProposal ?? "review-artifact" })),
    contextManifestId: opts.contextManifest?.contextPackId ?? null,
    contextQuality: opts.contextManifest ? pickContextQuality(opts.contextManifest) : null,
  };
}

function diffPlanCandidates(before: AgentPlanCandidate, after: AgentPlanCandidate): AgentPlanDiff {
  const beforeSteps = new Map(before.steps.map(step => [step.id, step]));
  const afterSteps = new Map(after.steps.map(step => [step.id, step]));
  const addedSteps = after.steps.filter(step => !beforeSteps.has(step.id)).map(step => step.id);
  const removedSteps = before.steps.filter(step => !afterSteps.has(step.id)).map(step => step.id);
  const changedSteps = after.steps.filter(step => {
    const prior = beforeSteps.get(step.id);
    return prior && JSON.stringify(prior) !== JSON.stringify(step);
  }).map(step => step.id);
  const changedAssumptions = symmetricDifference(before.assumptions, after.assumptions);
  const changedEvidenceRequirements = symmetricDifference(before.expectedEvidence, after.expectedEvidence);
  const confidenceDelta = Number((after.confidence - before.confidence).toFixed(4));
  return {
    beforePlanId: before.id,
    afterPlanId: after.id,
    addedSteps,
    removedSteps,
    changedSteps,
    changedAssumptions,
    changedEvidenceRequirements,
    reasonSummary: addedSteps.length || removedSteps.length || changedSteps.length || changedAssumptions.length || changedEvidenceRequirements.length
      ? "Plan changed in response to new evidence or critique."
      : "No material plan differences detected.",
    confidenceDelta,
  };
}

function diffPlanStates(before: AgentPlanState, after: AgentPlanState): AgentPlanDiff {
  const candidateDiff = diffPlanCandidates(selectedCandidateFromState(before), selectedCandidateFromState(after));
  const changedEvidenceRequirements = symmetricDifference(before.evidenceRequirements.map(item => `${item.id}:${item.status}`), after.evidenceRequirements.map(item => `${item.id}:${item.status}`));
  const latestEvent = after.events.at(-1);
  return {
    ...candidateDiff,
    beforePlanId: before.planId,
    afterPlanId: after.planId,
    changedEvidenceRequirements: uniqueStrings([...candidateDiff.changedEvidenceRequirements, ...changedEvidenceRequirements]),
    reasonSummary: latestEvent?.detail ?? candidateDiff.reasonSummary,
    confidenceDelta: Number(((after.confidenceTimeline.at(-1)?.confidence ?? 0) - (before.confidenceTimeline.at(-1)?.confidence ?? 0)).toFixed(4)),
  };
}

function makeRepairRun(
  bundleDir: string,
  qa: string,
  maxAttempts: number,
  repairSpecPath: string | null,
  repairCommand: string | null,
  boundary: AgentRepairBoundary,
  analysisSpecHash: string | null,
  repairRunId: string,
  attempts: AgentRepairAttempt[],
  finalStatus: AgentRepairRun["finalStatus"],
  stoppingReason: AgentRepairRun["stoppingReason"],
): AgentRepairRun {
  return {
    schemaVersion: 1,
    repairRunId,
    bundle: bundleDir,
    bundleDir,
    qaCommand: qa,
    qa,
    maxAttempts,
    repairSpecPath,
    repairCommand,
    costBoundary: { maxCostUsd: boundary.maxCostUsd },
    riskBoundary: {
      maxRiskScore: boundary.maxRiskScore,
      allowedFiles: boundary.allowedFiles,
      protectedGlobs: boundary.protectedGlobs,
    },
    analysisSpecHash,
    attempts,
    finalStatus,
    stoppingReason,
    nextAction: finalStatus === "passed" ? "Record repair provenance and proceed." : "Inspect stopping reason before another repair attempt.",
  };
}

function makeRepairAttempt(input: {
  attempt: number;
  qa: string;
  result: { exitCode: number };
  failureClass: AgentRepairFailureClass;
  failureHash: string;
  validatorOutput: string;
  validatorEvidenceHash: string;
  repairAction: string;
  patchSummary: string;
  changedFiles: string[];
  patchProvenance: AgentPatchProvenance[];
  diffSummary: string;
  diffHash: string;
  status: AgentRepairAttempt["status"];
}): AgentRepairAttempt {
  return {
    attempt: input.attempt,
    attemptNumber: input.attempt,
    qaCommand: input.qa,
    exitCode: input.result.exitCode,
    failureClass: input.failureClass,
    inputFailure: makeInputFailure(input.result.exitCode, input.failureClass, input.failureHash, input.validatorEvidenceHash, input.validatorOutput),
    validatorOutput: input.validatorOutput,
    repairAction: input.repairAction,
    patchSummary: input.patchSummary,
    changedFiles: input.changedFiles,
    patchProvenance: input.patchProvenance,
    failureHash: input.failureHash,
    diffHash: input.diffHash,
    diffSummary: input.diffSummary,
    status: input.status,
  };
}

function makeInputFailure(exitCode: number, failureClass: AgentRepairFailureClass, failureHash: string, validatorEvidenceHash: string, validatorOutput: string): AgentRepairInputFailure {
  return {
    exitCode,
    failureClass,
    failureHash,
    validatorEvidenceHash,
    summary: summarizeJsonOrText(validatorOutput),
  };
}

async function runQa(qa: string, cwd: string): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  const artifact = path.resolve(cwd, qa);
  if (!qa.includes(" ") && await exists(artifact)) {
    const text = await readFile(artifact, "utf-8");
    const failed = /fail|blocker|methodological|semantic/i.test(text);
    return { exitCode: failed ? 1 : 0, stdout: text, stderr: "" };
  }
  try {
    const { stdout, stderr } = await execFileAsync(process.env.SHELL ?? "sh", ["-lc", qa], { cwd, maxBuffer: 4_000_000 });
    return { exitCode: 0, stdout, stderr };
  } catch (error) {
    const err = error as { code?: number; stdout?: string; stderr?: string };
    return { exitCode: typeof err.code === "number" ? err.code : 1, stdout: err.stdout ?? "", stderr: err.stderr ?? "" };
  }
}

async function runRepairCommand(command: string, cwd: string): Promise<{ summary: string; action: string; boundaryViolation: string | null }> {
  try {
    const { stdout, stderr } = await execFileAsync(process.env.SHELL ?? "sh", ["-lc", command], { cwd, maxBuffer: 4_000_000 });
    const output = `${stdout}${stderr}`.trim();
    return { summary: output ? `Repair command completed: ${output.slice(0, 300)}` : "Repair command completed.", action: "repair_command", boundaryViolation: null };
  } catch (error) {
    const err = error as { code?: number; stdout?: string; stderr?: string };
    return { summary: `Repair command failed with exit ${String(err.code ?? 1)}: ${`${err.stdout ?? ""}${err.stderr ?? ""}`.trim().slice(0, 300)}`, action: "repair_command_failed", boundaryViolation: null };
  }
}

interface BundleRepairSpec {
  repairs?: Array<{
    match: string;
    file: string;
    reason?: string;
    replace?: string;
    with?: string;
    append?: string;
    create?: string;
  }>;
}

async function applyBundleRepairSpec(bundleDir: string, failureOutput: string, attempt: number, boundary: AgentRepairBoundary): Promise<{ summary: string; action: string; boundaryViolation: string | null }> {
  const specPath = path.join(bundleDir, "agenteer.repair.json");
  if (!await exists(specPath)) return { summary: "No agenteer.repair.json or repair command was available.", action: "no_repair_available", boundaryViolation: null };
  const spec = JSON.parse(await readFile(specPath, "utf-8")) as BundleRepairSpec;
  const applied: string[] = [];
  for (const repair of spec.repairs ?? []) {
    const match = new RegExp(repair.match, "i");
    if (!match.test(failureOutput)) continue;
    const targetCheck = validateRepairTarget(bundleDir, repair.file, boundary);
    if (!targetCheck.ok) return { summary: targetCheck.message, action: "boundary_blocked", boundaryViolation: targetCheck.message };
    const target = targetCheck.path;
    if (repair.create !== undefined) {
      await writeFile(target, repair.create);
      applied.push(`${repair.file}: ${repair.reason ?? "created file"}`);
      continue;
    }
    const prior = await readFile(target, "utf-8");
    let next = prior;
    if (repair.replace !== undefined) {
      next = prior.split(repair.replace).join(repair.with ?? "");
    }
    if (repair.append !== undefined && !next.includes(repair.append)) {
      next = `${next}${next.endsWith("\n") ? "" : "\n"}${repair.append}`;
    }
    if (next !== prior) {
      await writeFile(target, next);
      applied.push(`${repair.file}: ${repair.reason ?? `repair rule applied on attempt ${attempt}`}`);
    }
  }
  return { summary: applied.length ? `Applied ${applied.length} repair rule(s): ${applied.join("; ")}` : "Repair spec matched no rules or made no changes.", action: applied.length ? "repair_spec" : "no_repair_available", boundaryViolation: null };
}

async function snapshotBundle(bundleDir: string): Promise<Map<string, string>> {
  const snapshot = new Map<string, string>();
  async function walk(dir: string): Promise<void> {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      if ([".git", "node_modules", "dist"].includes(entry.name)) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(full);
      } else if (entry.isFile()) {
        const rel = path.relative(bundleDir, full);
        const text = await readFile(full);
        snapshot.set(rel, createHash("sha256").update(text).digest("hex"));
      }
    }
  }
  await walk(bundleDir);
  return snapshot;
}

function changedFilesBetween(before: Map<string, string>, after: Map<string, string>): string[] {
  const all = uniqueStrings([...before.keys(), ...after.keys()]);
  return all.filter(file => before.get(file) !== after.get(file)).sort();
}

function summarizeChangedFiles(changedFiles: string[], before: Map<string, string>, after: Map<string, string>): string {
  if (!changedFiles.length) return "No file diff recorded.";
  return changedFiles.map(file => {
    const prior = before.get(file)?.slice(0, 10) ?? "created";
    const next = after.get(file)?.slice(0, 10) ?? "deleted";
    return `${file}: ${prior} -> ${next}`;
  }).join("; ");
}

function makePatchProvenance(
  attemptNumber: number,
  changedFiles: string[],
  before: Map<string, string>,
  after: Map<string, string>,
  reason: string,
  validatorEvidence: string,
  validatorEvidenceHash: string,
): AgentPatchProvenance[] {
  return changedFiles.map(changedFile => {
    const beforeHash = before.get(changedFile) ?? null;
    const afterHash = after.get(changedFile) ?? null;
    const diffSummary = `${changedFile}: ${beforeHash?.slice(0, 12) ?? "created"} -> ${afterHash?.slice(0, 12) ?? "deleted"}`;
    return {
      attemptNumber,
      changedFile,
      beforeHash,
      afterHash,
      diffHash: sha256(`${changedFile}:${beforeHash ?? ""}:${afterHash ?? ""}`),
      diffSummary,
      reason,
      validatorEvidence: summarizeJsonOrText(validatorEvidence),
      validatorEvidenceHash,
    };
  });
}

function normalizeRepairBoundary(opts: { maxCostUsd?: number; maxRiskScore?: number; allowedFiles?: string[] }): AgentRepairBoundary {
  return {
    maxCostUsd: Number.isFinite(opts.maxCostUsd) ? Math.max(0, opts.maxCostUsd ?? 0) : 0,
    maxRiskScore: Number.isFinite(opts.maxRiskScore) ? clamp01(opts.maxRiskScore ?? 0.7) : 0.7,
    allowedFiles: opts.allowedFiles?.length ? opts.allowedFiles : ["**"],
    protectedGlobs: ["../*", "/**", ".git/**", "node_modules/**", "dist/**"],
  };
}

async function preflightRepairBoundary(bundleDir: string, boundary: AgentRepairBoundary, failureOutput: string, repairCommand?: string): Promise<{ ok: true } | { ok: false; reason: "cost_or_risk_boundary" | "out_of_bundle"; message: string }> {
  if (boundary.maxCostUsd < 0) return { ok: false, reason: "cost_or_risk_boundary", message: "Repair cost boundary is negative." };
  if (repairCommand) return { ok: true };
  const specPath = path.join(bundleDir, "agenteer.repair.json");
  if (!await exists(specPath)) return { ok: true };
  const spec = JSON.parse(await readFile(specPath, "utf-8")) as BundleRepairSpec;
  for (const repair of spec.repairs ?? []) {
    if (!new RegExp(repair.match, "i").test(failureOutput)) continue;
    const targetCheck = validateRepairTarget(bundleDir, repair.file, boundary);
    if (!targetCheck.ok) return { ok: false, reason: "out_of_bundle", message: targetCheck.message };
  }
  return { ok: true };
}

function validateRepairTarget(root: string, target: string, boundary: AgentRepairBoundary): { ok: true; path: string; relative: string } | { ok: false; message: string } {
  const resolved = path.resolve(root, target);
  const relative = path.relative(root, resolved);
  if (relative.startsWith("..") || path.isAbsolute(relative)) return { ok: false, message: `repair target escapes bundle: ${target}` };
  if (isProtectedRepairPath(relative, boundary.protectedGlobs)) return { ok: false, message: `repair target is protected: ${target}` };
  if (!isAllowedRepairPath(relative, boundary.allowedFiles)) return { ok: false, message: `repair target is outside allowed files: ${target}` };
  return { ok: true, path: resolved, relative };
}

function isAllowedRepairPath(relative: string, allowed: string[]): boolean {
  if (!allowed.length || allowed.includes("**")) return true;
  return allowed.some(pattern => globishMatches(relative, pattern));
}

function isProtectedRepairPath(relative: string, protectedGlobs: string[]): boolean {
  return protectedGlobs.some(pattern => globishMatches(relative, pattern));
}

function globishMatches(relative: string, pattern: string): boolean {
  if (pattern === "**") return true;
  if (pattern.endsWith("/**")) return relative === pattern.slice(0, -3) || relative.startsWith(pattern.slice(0, -2));
  if (pattern.endsWith("*")) return relative.startsWith(pattern.slice(0, -1));
  return relative === pattern;
}

function estimateRepairRisk(changedFiles: string[], boundary: AgentRepairBoundary): number {
  if (!changedFiles.length) return 0;
  const fileCountRisk = Math.min(0.7, changedFiles.length * 0.18);
  const protectedRisk = changedFiles.some(file => isProtectedRepairPath(file, boundary.protectedGlobs)) ? 0.5 : 0;
  const configRisk = changedFiles.some(file => /package\.json|tsconfig|lock|env|credential|secret/i.test(file)) ? 0.25 : 0;
  return clamp01(fileCountRisk + protectedRisk + configRisk);
}

async function hashFileIfExists(file: string): Promise<string | null> {
  const content = await readFile(file).catch(() => null);
  return content ? createHash("sha256").update(content).digest("hex") : null;
}

function classifyFailure(output: string, exitCode: number): AgentRepairAttempt["failureClass"] {
  if (exitCode === 0) return "none";
  if (/methodological|underpowered|causal|uncertainty/i.test(output)) return "methodological";
  if (/semantic|claim|meaning|invalid interpretation/i.test(output)) return "semantic";
  if (/syntax|typeerror|referenceerror|compile|test failed|assert/i.test(output)) return "executable";
  return "unknown";
}

function parseReplanEvent(input: string): AgentReplanEvent {
  const parsed = parseMaybeJson(input);
  if (parsed && typeof parsed === "object") {
    const stageGate = unwrap<{ status?: string; target?: string; missingRequiredStages?: string[]; nextAction?: string }>(parsed, "stageGate");
    if (stageGate?.status === "blocked") {
      const missing = Array.isArray(stageGate.missingRequiredStages) ? stageGate.missingRequiredStages.join(", ") : "unknown required stages";
      return {
        kind: "verification_result",
        detail: `Stage gate blocked ${stageGate.target ?? "target"}; missing required stages: ${missing}. ${stageGate.nextAction ?? ""}`.trim(),
        invalidatesEvidence: false,
        missingRequiredStages: Array.isArray(stageGate.missingRequiredStages) ? stageGate.missingRequiredStages : [],
        targetStage: stageGate.target,
      };
    }
    const obj = parsed as Partial<AgentReplanEvent>;
    return {
      kind: obj.kind ?? "new_evidence",
      detail: obj.detail ?? input,
      invalidatesEvidence: obj.invalidatesEvidence ?? false,
    };
  }
  const lower = input.toLowerCase();
  return {
    kind: lower.includes("fail") ? "failure" : lower.includes("stale") ? "stale_context" : lower.includes("verify") ? "verification_result" : "new_evidence",
    detail: input,
    invalidatesEvidence: lower.includes("invalidate") || lower.includes("stale"),
  };
}

async function agentReplanCandidateFromState(state: AgentPlanState, eventInput: string): Promise<AgentReplanResult> {
  const tmpCandidate = selectedCandidateFromState(state);
  const event = parseReplanEvent(eventInput);
  const preservedEvidence = event.invalidatesEvidence ? [] : state.completedEvidence;
  const activeTail = state.steps.filter(step => step.status !== "invalidated").slice(-1).map(step => step.id);
  const repairSteps: AgentPlanStep[] = event.missingRequiredStages?.length
    ? event.missingRequiredStages.map((stage, index) => ({
      id: `step-${state.steps.length + index + 1}`,
      title: `Complete missing research gate: ${stage}`,
      kind: "verify" as const,
      dependsOn: index === 0 ? activeTail : [`step-${state.steps.length + index}`],
      expectedEvidence: [`stage-gate.${stage}.completed`],
      status: "pending" as const,
      mode: "review_gate" as const,
    }))
    : [{
      id: `step-${state.steps.length + 1}`,
      title: `Respond to ${event.kind}: ${event.detail.slice(0, 80)}`,
      kind: event.kind === "stale_context" ? "context" : event.kind === "verification_result" ? "verify" : "repair",
      dependsOn: activeTail,
      expectedEvidence: [`replan.${event.kind}.resolution`],
      status: "pending",
      mode: event.kind === "verification_result" ? "review_gate" : event.kind === "stale_context" ? "exploratory" : "executable",
    }];
  const after: AgentPlanCandidate = {
    ...tmpCandidate,
    id: `${tmpCandidate.id}-replanned-${state.events.length + 1}`,
    assumptions: uniqueStrings([...state.assumptions, `Replan event handled: ${event.kind}`]),
    steps: [
      ...state.steps.map(step => event.invalidatesEvidence && step.status === "completed" ? { ...step, status: "invalidated" as const } : step),
      ...repairSteps,
    ],
    expectedEvidence: uniqueStrings([...preservedEvidence, ...repairSteps.flatMap(step => step.expectedEvidence)]),
    risk: Math.min(1, tmpCandidate.risk + (event.kind === "failure" ? 0.08 : 0.03)),
    confidence: Math.max(0, tmpCandidate.confidence - (event.kind === "failure" ? 0.08 : 0.03)),
  };
  return {
    event,
    before: tmpCandidate,
    after,
    preservedEvidence,
    changes: [`Added ${repairSteps.map(step => step.id).join(", ")}`, event.invalidatesEvidence ? "Invalidated completed evidence" : "Preserved completed evidence"],
    nextAction: "Run plan-critic on the replanned state before execution.",
  };
}

function parsePlanStateEvent(input: string, state: AgentPlanState): AgentPlanEvent {
  const parsed = parseMaybeJson(input);
  const object = parsed && typeof parsed === "object" ? parsed as Record<string, unknown> : {};
  const rawType = String(object.type ?? object.kind ?? "");
  const type = normalizePlanEventType(rawType || parseReplanEvent(input).kind);
  const confidenceDelta = typeof object.confidenceDelta === "number" ? object.confidenceDelta : defaultConfidenceDelta(type);
  const invalidatesEvidence = Boolean(object.invalidatesEvidence ?? (type === "evidence_invalidated" || type === "context_changed"));
  const evidenceRefs = Array.isArray(object.evidenceRefs)
    ? object.evidenceRefs.map(String)
    : type === "step_completed" && typeof object.targetStepId === "string"
      ? state.steps.find(step => step.id === object.targetStepId)?.expectedEvidence ?? []
      : parseReplanEvent(input).invalidatesEvidence ? state.completedEvidence : [];
  const createdAtIso = new Date().toISOString();
  return {
    eventId: String(object.eventId ?? `event-${state.events.length + 1}-${type}`),
    type,
    createdAtIso,
    detail: String(object.detail ?? input),
    targetStepId: typeof object.targetStepId === "string" ? object.targetStepId : typeof object.stepId === "string" ? object.stepId : null,
    evidenceRefs,
    invalidatesEvidence,
    confidenceDelta,
    statusAfter: statusAfterEvent(type, state.currentStatus),
  };
}

function applyPlanEvent(state: AgentPlanState, event: AgentPlanEvent): AgentPlanState {
  const selected = selectedCandidateFromState(state);
  const updatedSteps = state.steps.map(step => {
    if (step.id !== event.targetStepId) return step;
    if (event.type === "step_completed") return { ...step, status: "completed" as const };
    if (event.type === "step_failed" || event.type === "evidence_invalidated") return { ...step, status: "invalidated" as const };
    return step;
  });
  const invalidated = event.invalidatesEvidence ? uniqueStrings([...state.invalidatedEvidence, ...event.evidenceRefs]) : state.invalidatedEvidence;
  const completedEvidence = event.type === "step_completed" || event.type === "evidence_added" || event.type === "repair_applied"
    ? uniqueStrings([...state.completedEvidence, ...event.evidenceRefs]).filter(evidence => !invalidated.includes(evidence))
    : state.completedEvidence.filter(evidence => !invalidated.includes(evidence));
  const evidenceRequirements = state.evidenceRequirements.map(requirement => {
    if (invalidated.includes(requirement.id) || invalidated.includes(requirement.description)) return { ...requirement, status: "invalidated" as const };
    if (completedEvidence.includes(requirement.id) || completedEvidence.includes(requirement.description)) return { ...requirement, status: "completed" as const };
    return requirement;
  });
  const confidence = clamp01((state.confidenceTimeline.at(-1)?.confidence ?? selected.confidence) + event.confidenceDelta);
  const risk = clamp01((state.confidenceTimeline.at(-1)?.risk ?? selected.risk) + (event.type === "step_failed" || event.type === "critic_failed" ? 0.08 : event.type === "repair_applied" ? -0.03 : 0));
  return {
    ...state,
    steps: updatedSteps,
    evidenceRequirements,
    completedEvidence,
    invalidatedEvidence: invalidated,
    confidenceTimeline: [...state.confidenceTimeline, {
      atIso: event.createdAtIso,
      eventId: event.eventId,
      confidence,
      risk,
      reason: event.detail,
    }],
    events: [...state.events, event],
    currentStatus: event.statusAfter,
    nextAction: nextActionForPlanStatus(event.statusAfter),
  };
}

function normalizePlanEventType(type: string): AgentPlanEventType {
  const lower = type.toLowerCase();
  if (lower === "failure" || lower === "step_failed") return "step_failed";
  if (lower === "verification_result" || lower === "evidence_added") return "evidence_added";
  if (lower === "new_evidence") return "evidence_added";
  if (lower === "stale_context" || lower === "context_changed") return "context_changed";
  if (lower === "user_correction") return "user_correction";
  if (lower === "repair_applied") return "repair_applied";
  if (lower === "critic_failed") return "critic_failed";
  if (lower === "replanned") return "replanned";
  if (lower === "evidence_invalidated") return "evidence_invalidated";
  if (lower === "step_completed") return "step_completed";
  return "evidence_added";
}

function defaultConfidenceDelta(type: AgentPlanEventType): number {
  if (type === "step_completed" || type === "evidence_added" || type === "repair_applied") return 0.03;
  if (type === "replanned") return -0.02;
  if (type === "step_failed" || type === "critic_failed") return -0.12;
  if (type === "evidence_invalidated" || type === "context_changed") return -0.1;
  return 0;
}

function statusAfterEvent(type: AgentPlanEventType, current: AgentPlanStatus): AgentPlanStatus {
  if (type === "created") return "draft";
  if (type === "step_failed" || type === "critic_failed") return "blocked";
  if (type === "evidence_invalidated" || type === "context_changed" || type === "user_correction") return "needs_replan";
  if (type === "replanned" || type === "repair_applied") return "ready";
  if (type === "step_completed" || type === "evidence_added") return current === "draft" ? "ready" : current;
  return current;
}

function nextActionForPlanStatus(status: AgentPlanStatus): string {
  if (status === "blocked") return "Apply repair or replan before execution.";
  if (status === "needs_replan") return "Run plan-state-replan and then plan-critic.";
  if (status === "ready") return "Run plan-critic against the current plan state.";
  if (status === "completed") return "Export packet with the final plan state citation.";
  return "Run plan-critic before execution.";
}

function evidenceRequirementsFromSteps(steps: readonly AgentPlanStep[]): AgentPlanEvidenceRequirement[] {
  return steps.flatMap(step => step.expectedEvidence.map((evidence, index) => ({
    id: evidence,
    stepId: step.id,
    description: evidence,
    status: step.status === "completed" ? "completed" as const : step.status === "invalidated" ? "invalidated" as const : "required" as const,
  })));
}

function mergeEvidenceRequirements(before: AgentPlanEvidenceRequirement[], after: AgentPlanEvidenceRequirement[], invalidateBefore: boolean): AgentPlanEvidenceRequirement[] {
  const existing = new Map(before.map(requirement => [requirement.id, invalidateBefore && requirement.status === "completed" ? { ...requirement, status: "invalidated" as const } : requirement]));
  for (const requirement of after) if (!existing.has(requirement.id)) existing.set(requirement.id, requirement);
  return [...existing.values()];
}

function selectedCandidateFromState(state: AgentPlanState): AgentPlanCandidate {
  const selected = state.candidates.find(candidate => candidate.id === state.selectedCandidateId) ?? state.candidates[0];
  if (!selected) throw new Error("plan state has no candidates");
  const latest = state.confidenceTimeline.at(-1);
  return {
    ...selected,
    id: state.selectedCandidateId,
    goal: state.goal,
    steps: state.steps,
    assumptions: state.assumptions,
    expectedEvidence: state.evidenceRequirements.filter(requirement => requirement.status !== "invalidated").map(requirement => requirement.id),
    confidence: latest?.confidence ?? selected.confidence,
    risk: latest?.risk ?? selected.risk,
    contextManifestId: state.contextManifestId,
  };
}

function uniquePlanCandidates(candidates: AgentPlanCandidate[]): AgentPlanCandidate[] {
  const seen = new Set<string>();
  return candidates.filter(candidate => {
    if (seen.has(candidate.id)) return false;
    seen.add(candidate.id);
    return true;
  });
}

function classifyPlanStepMode(title: string): AgentPlanStep["mode"] {
  const lower = title.toLowerCase();
  if (/\b(critique|review|verify|verification|approval|gate|validate)\b/.test(lower)) {
    return "review_gate";
  }
  if (/\b(execute|implement|edit|modify|deploy|repair|run selected|highest-confidence local path)\b/.test(lower)) {
    return "executable";
  }
  return "exploratory";
}

function pickPlanCandidate(value: unknown): AgentPlanCandidate {
  const state = maybePickPlanState(value);
  if (state) return selectedCandidateFromState(state);
  const portfolio = unwrap<AgentPlanPortfolio>(value, "planPortfolio");
  if (portfolio?.candidates) return portfolio.candidates.find(candidate => candidate.id === portfolio.selectedCandidateId) ?? portfolio.candidates[0]!;
  const candidate = unwrap<AgentPlanCandidate>(value, "plan");
  if (candidate?.steps) return candidate;
  throw new Error("expected a plan portfolio or plan candidate artifact");
}

function maybePickPlanState(value: unknown): AgentPlanState | null {
  const state = unwrap<AgentPlanState>(value, "planState");
  if (state?.schemaVersion === 1 && state.steps && state.events) return state;
  return null;
}

function pickPlanState(value: unknown): AgentPlanState {
  const state = maybePickPlanState(value);
  if (!state) throw new Error("expected a plan state artifact");
  return state;
}

function unwrap<T>(value: unknown, key: string): T | null {
  if (!value || typeof value !== "object") return null;
  const object = value as Record<string, unknown>;
  return (object[key] ?? value) as T;
}

function parseJsonObject(text: string): unknown | null {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}

function unwrapSources(value: unknown): AgentSource[] {
  const intake = unwrap<AgentResearchIntake>(value, "researchIntake");
  if (intake?.sources) return intake.sources;
  const rank = unwrap<AgentSourceRank>(value, "sourceRank");
  if (rank?.sources) return rank.sources;
  const portfolio = unwrap<AgentPlanPortfolio>(value, "planPortfolio");
  if (portfolio?.candidates) return sourcesFromPlanPortfolio(portfolio);
  const plan = unwrap<AgentPlanCandidate>(value, "plan");
  if (plan?.steps) return sourcesFromPlanCandidate(plan);
  if (Array.isArray(value)) return value as AgentSource[];
  throw new Error("expected source artifact");
}

function sourcesFromPlanPortfolio(portfolio: AgentPlanPortfolio): AgentSource[] {
  return portfolio.candidates.flatMap(candidate => sourcesFromPlanCandidate(candidate));
}

function sourcesFromPlanCandidate(candidate: AgentPlanCandidate): AgentSource[] {
  const planSource = makeSource(
    "official_doc",
    `Plan candidate ${candidate.id}`,
    `Plan strategy for ${candidate.goal}: ${candidate.strategy}. Risk ${candidate.risk}; confidence ${candidate.confidence}; expected evidence ${candidate.expectedEvidence.join(", ") || "none"}.`,
    false,
    { evidenceState: "local_seed", evidenceRole: "supporting", notes: ["adapted from local plan artifact; not external evidence"] },
  );
  const stepSources = candidate.steps.map(step => makeSource(
    "classic",
    `Plan step ${candidate.id}/${step.id}: ${step.title}`,
    `Expected evidence for ${step.kind} step: ${step.expectedEvidence.join(", ") || "none declared"}. Dependencies: ${step.dependsOn.join(", ") || "none"}.`,
    false,
    { evidenceState: "local_seed", evidenceRole: "baseline", notes: ["adapted from plan step for creativity synthesis"] },
  ));
  return [planSource, ...stepSources];
}

function unwrapIdeas(value: unknown): AgentCreativeIdea[] {
  const synthesis = unwrap<AgentCreativitySynthesis>(value, "creativitySynthesis");
  if (synthesis?.ideas) return synthesis.ideas;
  const evolution = unwrap<AgentIdeaEvolution>(value, "ideaEvolution");
  if (evolution?.ideas) return evolution.ideas;
  if (Array.isArray(value)) return value as AgentCreativeIdea[];
  throw new Error("expected ideas artifact");
}

function unwrapImprovementCandidates(value: unknown): AgentImprovementCandidate[] {
  const wrapped = unwrap<AgentImprovementCandidate[]>(value, "improvementCandidates");
  if (Array.isArray(wrapped)) return wrapped.map(normalizeImprovementCandidate);
  const run = unwrap<AgentImprovementRun>(value, "improvementRun");
  if (run?.candidates) return run.candidates.map(normalizeImprovementCandidate);
  if (Array.isArray(value)) return value.map(normalizeImprovementCandidate);
  throw new Error("expected improvement candidates artifact");
}

function normalizeImprovementCandidate(value: unknown): AgentImprovementCandidate {
  const object = value as Record<string, unknown>;
  const mutationType = normalizeMutationType(String(object.mutationType ?? object.mutation_type ?? "tail_analogy"));
  const idSeed = JSON.stringify({ mutationType, hypothesis: object.hypothesis, origin: object.origin });
  return {
    candidateId: String(object.candidateId ?? object.candidate_id ?? `improve_${mutationType}_${sha256(idSeed).slice(0, 10)}`),
    origin: String(object.origin ?? "manual"),
    mutationType,
    parentIds: Array.isArray(object.parentIds) ? object.parentIds.map(String) : Array.isArray(object.parent_ids) ? object.parent_ids.map(String) : [],
    hypothesis: String(object.hypothesis ?? "Unspecified improvement hypothesis."),
    expectedGain: clamp01(Number(object.expectedGain ?? object.expected_gain ?? 0)),
    expectedRisk: clamp01(Number(object.expectedRisk ?? object.expected_risk ?? 0.5)),
    implementationScope: Array.isArray(object.implementationScope) ? object.implementationScope.map(String) : Array.isArray(object.implementation_scope) ? object.implementation_scope.map(String) : [],
    costEstimate: Math.max(0, Number(object.costEstimate ?? object.cost_estimate ?? 0)),
    noveltyScore: clamp01(Number(object.noveltyScore ?? object.novelty_score ?? 0.5)),
    benchmarkTarget: String(object.benchmarkTarget ?? object.benchmark_target ?? "golden-benchmark-suite"),
    complexityDelta: Number(object.complexityDelta ?? object.complexity_delta ?? 0),
    counterDesign: String(object.counterDesign ?? object.counter_design ?? "No counter-design recorded."),
    lineage: Array.isArray(object.lineage) ? object.lineage.map(String) : [],
    priorRejectionCount: Math.max(0, Number(object.priorRejectionCount ?? object.prior_rejection_count ?? 0)),
    priorRejectionReasons: Array.isArray(object.priorRejectionReasons) ? object.priorRejectionReasons.map(String) : [],
  };
}

function normalizeMutationType(value: string): AgentImprovementMutationType {
  const known: AgentImprovementMutationType[] = ["validator_threshold", "node_recombination", "benchmark_case", "workflow_simplification", "failure_classifier", "typed_contract_replacement", "tail_analogy"];
  return known.includes(value as AgentImprovementMutationType) ? value as AgentImprovementMutationType : "tail_analogy";
}

async function readBenchmarkEvidence(file: string): Promise<AgentImprovementBenchmarkEvidence> {
  const resolved = path.resolve(file);
  const raw = JSON.parse(await readFile(resolved, "utf-8")) as unknown;
  const artifact = raw && typeof raw === "object" ? raw as Record<string, unknown> : {};
  const score = artifact.benchmarkScore && typeof artifact.benchmarkScore === "object" ? artifact.benchmarkScore as Record<string, unknown> : null;
  const suite = artifact.benchmarkSuite && typeof artifact.benchmarkSuite === "object" ? artifact.benchmarkSuite as Record<string, unknown> : null;
  const run = artifact.benchmarkRun && typeof artifact.benchmarkRun === "object" ? artifact.benchmarkRun as Record<string, unknown> : null;
  const source = score ?? (suite?.score as Record<string, unknown> | undefined) ?? run;
  if (!source) throw new Error("expected benchmarkScore, benchmarkSuite, or benchmarkRun artifact");
  const status = String(source.status ?? "unknown");
  const normalizedScore = clamp01(Number(source.normalizedScore ?? source.normalized_score ?? (status === "pass" ? 1 : 0)));
  const issues = Array.isArray(source.issues) ? source.issues as Array<Record<string, unknown>> : Array.isArray(source.unexpectedFailures) ? source.unexpectedFailures as Array<Record<string, unknown>> : [];
  const blockerCount = issues.filter(issue => String(issue.severity ?? "").toLowerCase() === "blocker").length;
  const issueCount = Number(source.issueCount ?? issues.length);
  const riskScore = clamp01(Number(source.riskScore ?? (1 - normalizedScore) * 0.7 + blockerCount * 0.12 + issueCount * 0.02));
  return {
    sourcePath: resolved,
    status,
    normalizedScore,
    issueCount,
    blockerCount,
    riskScore,
    summary: String(source.summary ?? source.nextAction ?? `${status} score=${normalizedScore.toFixed(3)} issues=${issueCount}`),
  };
}

function improvementExpectedUtility(candidate: AgentImprovementCandidate): number {
  return candidate.expectedGain * 0.5 + candidate.noveltyScore * 0.22 - candidate.expectedRisk * 0.28 - candidate.costEstimate * 0.04 - Math.max(0, candidate.complexityDelta) * 0.1;
}

function evaluateImprovementCandidate(candidate: AgentImprovementCandidate, ctx: {
  before: AgentImprovementBenchmarkEvidence;
  after: AgentImprovementBenchmarkEvidence;
  scoreDelta: number;
  riskDelta: number;
  budgetUsd: number;
  testsPassed: boolean;
  withinBoundary: boolean;
  overrideUsed: boolean;
  overrideReason: string | null;
}): AgentImprovementRunCandidate {
  const reasons: string[] = [];
  const evidence = [
    `before:${ctx.before.sourcePath}`,
    `after:${ctx.after.sourcePath}`,
    `scoreDelta:${ctx.scoreDelta.toFixed(6)}`,
    `riskDelta:${ctx.riskDelta.toFixed(6)}`,
  ];
  if (!ctx.testsPassed) reasons.push("relevant tests did not pass");
  if (!ctx.withinBoundary || candidate.costEstimate > ctx.budgetUsd) reasons.push("cost boundary exceeded");
  if (!candidate.counterDesign || /no counter-design/i.test(candidate.counterDesign)) reasons.push("rejected counter-design was not recorded");
  if (candidate.complexityDelta > 0.35 && candidate.expectedGain < 0.08) reasons.push("new complexity is not justified by expected gain");
  const measurableGain = ctx.scoreDelta > 0.0001;
  const riskReduced = ctx.riskDelta < -0.0001;
  if (ctx.after.status !== "pass") reasons.push("after benchmark did not pass");
  if (!measurableGain && !riskReduced && !ctx.overrideUsed) reasons.push("no benchmark score gain or risk reduction");
  if (candidate.priorRejectionCount > 0 && !measurableGain && !riskReduced && !ctx.overrideUsed) reasons.push("candidate previously rejected without new evidence");
  if (ctx.after.blockerCount > ctx.before.blockerCount) reasons.push("benchmark blockers regressed");
  const decisionScore = improvementExpectedUtility(candidate) + ctx.scoreDelta * 1.8 + Math.max(0, -ctx.riskDelta) * 0.8 - reasons.length * 0.35;
  const decision: AgentImprovementRunCandidate["decision"] = reasons.length
    ? candidate.costEstimate <= ctx.budgetUsd && ctx.testsPassed && (measurableGain || riskReduced || ctx.overrideUsed) ? "queue" : "reject"
    : "promote";
  return { candidate, decision, decisionScore, reasons: reasons.length ? reasons : ["promotion policy satisfied"], evidence };
}

function reconsiderWhen(reasons: string[]): string {
  if (reasons.some(reason => reason.includes("tests"))) return "Relevant tests pass against the same candidate scope.";
  if (reasons.some(reason => reason.includes("cost"))) return "A cheaper implementation or explicit budget increase is available.";
  if (reasons.some(reason => reason.includes("counter-design"))) return "A concrete rejected counter-design is recorded.";
  if (reasons.some(reason => reason.includes("benchmark"))) return "Golden benchmark score improves or measured risk decreases.";
  if (reasons.some(reason => reason.includes("blockers"))) return "Benchmark blockers are reduced or returned to baseline.";
  return "New evidence changes the candidate utility.";
}

function improvementLessons(input: { scoreDelta: number; riskDelta: number; testsPassed: boolean; withinBoundary: boolean; promoted: AgentImprovementRunCandidate[]; rejected: AgentRejectedCandidate[] }): string[] {
  const lessons: string[] = [];
  lessons.push(input.scoreDelta > 0 ? "Benchmark score improved; retain the measurable delta as promotion evidence." : "Benchmark score did not improve; avoid promoting on vibes.");
  if (input.riskDelta < 0) lessons.push("Risk decreased; risk-reduction can justify promotion even when score is neutral.");
  if (!input.testsPassed) lessons.push("Tests are a hard gate for promotion.");
  if (!input.withinBoundary) lessons.push("Cost boundary prevented promotion; reduce scope or ask for budget approval.");
  if (input.promoted.length) lessons.push(`Promoted ${input.promoted.length} candidate(s) with lineage and counter-designs.`);
  if (input.rejected.length) lessons.push(`Recorded ${input.rejected.length} rejected candidate(s) to avoid repeated failed ideas.`);
  return lessons;
}

async function writeRejectedCandidates(dir: string, rejected: AgentRejectedCandidate[]): Promise<void> {
  await mkdir(dir, { recursive: true });
  for (const candidate of rejected) {
    await writeJsonFile(path.join(dir, `${candidate.candidateId}.rejected.json`), { schemaVersion: 1, rejectedCandidate: candidate });
  }
}

async function readRejectedCandidateHistory(dir: string): Promise<Map<string, AgentRejectedCandidate[]>> {
  const out = new Map<string, AgentRejectedCandidate[]>();
  const files = await collectJsonFiles(dir).catch(() => []);
  for (const file of files) {
    const parsed = parseMaybeJson(await readFile(file, "utf-8").catch(() => ""));
    const rejected = unwrap<AgentRejectedCandidate>(parsed, "rejectedCandidate");
    if (!rejected?.candidateId) continue;
    out.set(rejected.candidateId, [...(out.get(rejected.candidateId) ?? []), rejected]);
  }
  return out;
}

function unwrapReliabilityRuns(value: unknown): AgentReliabilityRun[] {
  const evalArtifact = unwrap<AgentReliabilityEval>(value, "reliabilityEval");
  if (evalArtifact?.runs) return evalArtifact.runs;
  if (Array.isArray(value)) return value.map(normalizeReliabilityRun);
  if (value && typeof value === "object" && Array.isArray((value as { runs?: unknown }).runs)) return (value as { runs: unknown[] }).runs.map(normalizeReliabilityRun);
  throw new Error("expected reliability runs artifact");
}

function normalizeReliabilityRun(value: unknown): AgentReliabilityRun {
  const object = value as Record<string, unknown>;
  const status = String(object.status ?? "fail").toLowerCase();
  return {
    taskId: String(object.taskId ?? object.task_id ?? "task"),
    durationBucket: String(object.durationBucket ?? object.duration_bucket ?? "unknown"),
    domain: String(object.domain ?? "unknown"),
    attempt: Number(object.attempt ?? 1),
    status: status === "pass" || status === "passed" || status === "success" ? "pass" : status === "meltdown" ? "meltdown" : "fail",
    score: typeof object.score === "number" ? object.score : undefined,
  };
}

function unwrapTrajectories(value: unknown): AgentTrajectory[] {
  if (Array.isArray(value)) return value.map(normalizeTrajectory);
  if (value && typeof value === "object" && Array.isArray((value as { trajectories?: unknown }).trajectories)) return (value as { trajectories: unknown[] }).trajectories.map(normalizeTrajectory);
  const policy = unwrap<AgentTrajectoryPolicy>(value, "trajectoryPolicy");
  if (policy?.ranked) return policy.ranked.map(normalizeTrajectory);
  throw new Error("expected trajectory artifact");
}

function normalizeTrajectory(value: unknown): AgentTrajectory {
  const object = value as Record<string, unknown>;
  const outcome = String(object.outcome ?? "unknown").toLowerCase();
  return {
    id: String(object.id ?? createHash("sha1").update(JSON.stringify(value)).digest("hex").slice(0, 10)),
    state: String(object.state ?? ""),
    action: String(object.action ?? ""),
    reward: Number(object.reward ?? 0),
    outcome: outcome === "success" ? "success" : outcome === "failure" ? "failure" : "unknown",
    notes: typeof object.notes === "string" ? object.notes : undefined,
  };
}

function capabilityFromNodeContract(contract: AgentNodeContract, source: string): AgentCapabilityDeclaration {
  return {
    schemaVersion: 1,
    capabilityId: contract.nodeId,
    description: `${contract.displayName}: ${contract.domain}`,
    inputSchema: contract.inputSchema,
    outputSchema: contract.outputSchema,
    permissionsRequired: contract.permissions.requiredActions,
    failureTypes: contract.failureTypes,
    costProfile: {
      maxUsd: contract.costBoundary.maxUsd,
      maxRuntimeSeconds: contract.costBoundary.maxRuntimeSeconds,
      maxModelCalls: null,
    },
    source,
    interopShape: "local",
  };
}

function normalizeCapabilityDeclaration(value: unknown): AgentCapabilityDeclaration {
  const wrapped = unwrap<AgentCapabilityDeclaration>(value, "capabilityDeclaration") ?? value as AgentCapabilityDeclaration;
  if (!wrapped || typeof wrapped !== "object") throw new Error("expected capability declaration artifact");
  const object = wrapped as unknown as Record<string, unknown>;
  return {
    schemaVersion: 1,
    capabilityId: String(object.capabilityId ?? object.capability_id ?? ""),
    description: String(object.description ?? object.capabilityId ?? ""),
    inputSchema: object.inputSchema ?? object.input_schema ?? { type: "object" },
    outputSchema: object.outputSchema ?? object.output_schema ?? { type: "object" },
    permissionsRequired: Array.isArray(object.permissionsRequired) ? object.permissionsRequired.map(String) : Array.isArray(object.permissions_required) ? object.permissions_required.map(String) : [],
    failureTypes: normalizeFailureTypes(object.failureTypes),
    costProfile: normalizeInteropCostBoundary(object.costProfile as Partial<AgentCostBoundary> | undefined),
    source: String(object.source ?? "unknown"),
    interopShape: object.interopShape === "mcp" || object.interopShape === "a2a" ? object.interopShape : "local",
  };
}

function validateCapabilityDeclaration(capability: AgentCapabilityDeclaration): AgentInteropValidation {
  const issues: AgentIssue[] = [];
  if (!capability.capabilityId) issues.push(makeIssue("blocker", "architecture", "CAPABILITY_ID_MISSING", "Capability declaration is missing capabilityId.", [], "Set a stable capabilityId.", 0.96));
  if (!isJsonSchemaLike(capability.inputSchema)) issues.push(makeIssue("blocker", "architecture", "CAPABILITY_INPUT_SCHEMA_INVALID", "Capability inputSchema is not JSON-schema-like.", [capability.capabilityId], "Add a JSON-schema-compatible inputSchema.", 0.9));
  if (!isJsonSchemaLike(capability.outputSchema)) issues.push(makeIssue("blocker", "architecture", "CAPABILITY_OUTPUT_SCHEMA_INVALID", "Capability outputSchema is not JSON-schema-like.", [capability.capabilityId], "Add a JSON-schema-compatible outputSchema.", 0.9));
  if (!capability.failureTypes.length) issues.push(makeIssue("warning", "architecture", "CAPABILITY_FAILURE_TYPES_MISSING", "Capability does not declare failure types.", [capability.capabilityId], "Declare typed failure modes for interop repair/routing.", 0.78));
  if (capability.costProfile.maxUsd < 0) issues.push(makeIssue("blocker", "cost", "CAPABILITY_COST_NEGATIVE", "Capability cost profile has a negative maxUsd.", [capability.capabilityId], "Use a nonnegative cost boundary.", 0.92));
  const status = issues.some(issue => issue.severity === "blocker") ? "blocked" : issues.length ? "needs_revision" : "pass";
  return {
    artifactType: "capability",
    status,
    issues,
    nextAction: status === "pass" ? "Capability is ready for task-envelope validation." : "Repair capability declaration before registering it.",
  };
}

function normalizeTaskEnvelope(value: unknown): AgentTaskEnvelope {
  const wrapped = unwrap<AgentTaskEnvelope>(value, "taskEnvelope") ?? value as AgentTaskEnvelope;
  if (!wrapped || typeof wrapped !== "object") throw new Error("expected task envelope artifact");
  const object = wrapped as unknown as Record<string, unknown>;
  return {
    schemaVersion: 1,
    taskId: String(object.taskId ?? object.task_id ?? ""),
    goal: String(object.goal ?? ""),
    requester: String(object.requester ?? "unknown"),
    capabilitiesRequired: Array.isArray(object.capabilitiesRequired) ? object.capabilitiesRequired.map(String) : Array.isArray(object.capabilities_required) ? object.capabilities_required.map(String) : [],
    inputs: Array.isArray(object.inputs) ? object.inputs.map(normalizeTaskInputRef) : [],
    artifactRefs: Array.isArray(object.artifactRefs) ? object.artifactRefs.map(normalizeArtifactRef) : [],
    permissions: normalizePermissionEnvelope(object.permissions as Partial<AgentPermissionEnvelope> | undefined),
    costBoundary: normalizeInteropCostBoundary(object.costBoundary as Partial<AgentCostBoundary> | undefined),
    status: normalizeInteropStatus(String(object.status ?? "created")),
    evidenceReceipts: Array.isArray(object.evidenceReceipts) ? object.evidenceReceipts.map(normalizeEvidenceReceipt) : [],
    failureRecords: Array.isArray(object.failureRecords)
      ? object.failureRecords.map(record => {
        const item = record as Record<string, unknown>;
        return { code: String(item.code ?? "UNKNOWN"), message: String(item.message ?? ""), evidenceRefs: Array.isArray(item.evidenceRefs) ? item.evidenceRefs.map(String) : [] };
      })
      : [],
    createdAtIso: String(object.createdAtIso ?? object.created_at ?? new Date().toISOString()),
    updatedAtIso: String(object.updatedAtIso ?? object.updated_at ?? new Date().toISOString()),
    nextAction: String(object.nextAction ?? "Validate task envelope before execution."),
  };
}

function normalizeTaskInputRef(value: unknown, index: number): AgentTaskInputRef {
  const object = value && typeof value === "object" ? value as Record<string, unknown> : { value };
  const inputValue = "value" in object ? object.value : value;
  return {
    inputId: String(object.inputId ?? object.input_id ?? `input_${index + 1}`),
    value: inputValue,
    mediaType: typeof object.mediaType === "string" ? object.mediaType : null,
    hash: typeof object.hash === "string" ? object.hash : sha256(typeof inputValue === "string" ? inputValue : JSON.stringify(inputValue)),
  };
}

function normalizeArtifactRef(value: unknown, index = 0): AgentInteropArtifactRef {
  const object = value && typeof value === "object" ? value as Record<string, unknown> : { uri: String(value ?? "") };
  const uri = String(object.uri ?? object.path ?? "");
  return {
    artifactId: String(object.artifactId ?? object.artifact_id ?? `artifact_${index + 1}_${sha256(uri).slice(0, 8)}`),
    uri,
    kind: String(object.kind ?? inferArtifactKind(uri)),
    mediaType: typeof object.mediaType === "string" ? object.mediaType : inferMediaType(uri),
    hash: typeof object.hash === "string" ? object.hash : null,
    description: String(object.description ?? (path.basename(uri) || "artifact")),
  };
}

function normalizeEvidenceReceipt(value: unknown): AgentEvidenceReceipt {
  const wrapped = unwrap<AgentEvidenceReceipt>(value, "evidenceReceipt") ?? value as AgentEvidenceReceipt;
  if (!wrapped || typeof wrapped !== "object") throw new Error("expected evidence receipt artifact");
  const object = wrapped as unknown as Record<string, unknown>;
  const artifactRef = normalizeArtifactRef(object.artifactRef ?? object.artifact_ref ?? {}, 0);
  return {
    schemaVersion: 1,
    receiptId: String(object.receiptId ?? object.receipt_id ?? `receipt_${sha256(JSON.stringify(object)).slice(0, 12)}`),
    artifactRef,
    hash: String(object.hash ?? artifactRef.hash ?? ""),
    producedBy: String(object.producedBy ?? object.produced_by ?? "unknown"),
    producedAt: String(object.producedAt ?? object.produced_at ?? new Date().toISOString()),
    validator: String(object.validator ?? "unknown"),
    status: normalizeEvidenceStatus(String(object.status ?? "unverified")),
    evidenceRefs: Array.isArray(object.evidenceRefs) ? object.evidenceRefs.map(String) : [artifactRef.artifactId],
  };
}

function normalizePermissionEnvelope(value: Partial<AgentPermissionEnvelope> | undefined): AgentPermissionEnvelope {
  return {
    allowedActions: Array.isArray(value?.allowedActions) ? value.allowedActions.map(String) : [],
    deniedActions: Array.isArray(value?.deniedActions) ? value.deniedActions.map(String) : [],
    humanApprovalRequired: value?.humanApprovalRequired === true,
    networkAllowed: value?.networkAllowed === true,
    filesystemWriteRoots: Array.isArray(value?.filesystemWriteRoots) ? value.filesystemWriteRoots.map(item => path.resolve(String(item))) : [],
    cloudAllowed: value?.cloudAllowed === true,
  };
}

function normalizeInteropCostBoundary(value: Partial<AgentCostBoundary> | undefined): AgentCostBoundary {
  const maxUsd = Number(value?.maxUsd ?? 0);
  const rawRuntime = value?.maxRuntimeSeconds == null ? null : Number(value.maxRuntimeSeconds);
  const rawModelCalls = value?.maxModelCalls == null ? null : Number(value.maxModelCalls);
  return {
    maxUsd: Number.isFinite(maxUsd) ? Math.max(0, maxUsd) : 0,
    maxRuntimeSeconds: rawRuntime != null && Number.isFinite(rawRuntime) ? Math.max(0, rawRuntime) : null,
    maxModelCalls: rawModelCalls != null && Number.isFinite(rawModelCalls) ? Math.max(0, Math.floor(rawModelCalls)) : null,
  };
}

function normalizeInteropStatus(value: string): AgentInteropStatus {
  const known: AgentInteropStatus[] = ["created", "queued", "running", "blocked", "needs_human_review", "succeeded", "failed", "canceled", "superseded"];
  return known.includes(value as AgentInteropStatus) ? value as AgentInteropStatus : "created";
}

function normalizeEvidenceStatus(value: string): AgentEvidenceReceiptStatus {
  const known: AgentEvidenceReceiptStatus[] = ["pass", "fail", "warning", "unverified"];
  return known.includes(value as AgentEvidenceReceiptStatus) ? value as AgentEvidenceReceiptStatus : "unverified";
}

async function artifactRefFromFile(file: string): Promise<AgentInteropArtifactRef> {
  const resolved = path.resolve(file);
  const hash = await hashLocalFile(resolved);
  return {
    artifactId: `artifact_${sha256(resolved).slice(0, 12)}`,
    uri: resolved,
    kind: inferArtifactKind(resolved),
    mediaType: inferMediaType(resolved),
    hash,
    description: path.basename(resolved),
  };
}

async function hashLocalFile(file: string): Promise<string | null> {
  const content = await readFile(file).catch(() => null);
  return content == null ? null : createHash("sha256").update(content).digest("hex");
}

function inferArtifactKind(uri: string): string {
  if (/\.json$/i.test(uri)) return "json";
  if (/\.md$/i.test(uri)) return "markdown";
  if (/\.ya?ml$/i.test(uri)) return "yaml";
  if (/\.csv$/i.test(uri)) return "table";
  return "file";
}

function inferMediaType(uri: string): string | null {
  if (/\.json$/i.test(uri)) return "application/json";
  if (/\.md$/i.test(uri)) return "text/markdown";
  if (/\.ya?ml$/i.test(uri)) return "application/yaml";
  if (/\.csv$/i.test(uri)) return "text/csv";
  if (/\.txt$/i.test(uri)) return "text/plain";
  return null;
}

async function readCapabilityDeclarations(paths: string[]): Promise<AgentCapabilityDeclaration[]> {
  const capabilities: AgentCapabilityDeclaration[] = [];
  for (const capabilityPath of paths) {
    capabilities.push(normalizeCapabilityDeclaration(JSON.parse(await readFile(path.resolve(capabilityPath), "utf-8")) as unknown));
  }
  return capabilities;
}

async function readEvidenceReceipts(paths: string[]): Promise<AgentEvidenceReceipt[]> {
  const receipts: AgentEvidenceReceipt[] = [];
  for (const receiptPath of paths) {
    receipts.push(normalizeEvidenceReceipt(JSON.parse(await readFile(path.resolve(receiptPath), "utf-8")) as unknown));
  }
  return receipts;
}

function uniqueEvidenceReceipts(receipts: AgentEvidenceReceipt[]): AgentEvidenceReceipt[] {
  const seen = new Set<string>();
  return receipts.filter(receipt => {
    if (seen.has(receipt.receiptId)) return false;
    seen.add(receipt.receiptId);
    return true;
  });
}

async function validateTaskEnvelope(task: AgentTaskEnvelope, capabilities: AgentCapabilityDeclaration[]): Promise<AgentInteropValidation> {
  const issues: AgentIssue[] = [];
  if (!task.taskId) issues.push(makeIssue("blocker", "architecture", "TASK_ID_MISSING", "Task envelope is missing taskId.", [], "Set a stable taskId.", 0.96));
  if (!task.goal) issues.push(makeIssue("blocker", "product", "TASK_GOAL_MISSING", "Task envelope is missing goal.", [task.taskId], "Describe the user-visible task goal.", 0.92));
  if (!task.requester) issues.push(makeIssue("warning", "architecture", "TASK_REQUESTER_MISSING", "Task requester is missing.", [task.taskId], "Set requester to a user, workflow, or agent id.", 0.76));
  const capabilityMap = new Map(capabilities.map(capability => [capability.capabilityId, capability]));
  for (const capabilityId of task.capabilitiesRequired) {
    const capability = capabilityMap.get(capabilityId);
    if (!capability) {
      issues.push(makeIssue("blocker", "architecture", "CAPABILITY_DECLARATION_MISSING", `Task requires capability ${capabilityId}, but no declaration was provided.`, [task.taskId, capabilityId], "Provide a capability declaration or remove the capability requirement.", 0.91));
      continue;
    }
    issues.push(...validateCapabilityDeclaration(capability).issues.map(issue => ({ ...issue, evidenceRefs: uniqueStrings([...issue.evidenceRefs, capabilityId]) })));
    issues.push(...validateCapabilityAgainstTask(task, capability));
  }
  for (const receipt of task.evidenceReceipts) {
    issues.push(...await validateEvidenceReceipt(receipt));
  }
  if (task.status === "succeeded" && !task.evidenceReceipts.some(receipt => receipt.status === "pass")) {
    issues.push(makeIssue("blocker", "execution", "SUCCEEDED_TASK_WITHOUT_PASS_RECEIPT", "Succeeded task has no passing evidence receipt.", [task.taskId], "Attach a passing EvidenceReceipt or downgrade status.", 0.9));
  }
  if (task.costBoundary.maxUsd < 0) {
    issues.push(makeIssue("blocker", "cost", "TASK_COST_NEGATIVE", "Task cost boundary is negative.", [task.taskId], "Use a nonnegative cost boundary.", 0.95));
  }
  const status = issues.some(issue => issue.severity === "blocker") ? "blocked" : issues.length ? "needs_revision" : "pass";
  return {
    artifactType: "task",
    status,
    issues,
    nextAction: status === "pass" ? "Task envelope is ready for lifecycle transition or execution." : "Repair task/capability/evidence issues before execution.",
  };
}

function validateCapabilityAgainstTask(task: AgentTaskEnvelope, capability: AgentCapabilityDeclaration): AgentIssue[] {
  const issues: AgentIssue[] = [];
  const allowed = new Set(task.permissions.allowedActions);
  const denied = new Set(task.permissions.deniedActions);
  for (const action of capability.permissionsRequired) {
    if (denied.has(action)) {
      issues.push(makeIssue("blocker", "safety", "PERMISSION_EXPLICITLY_DENIED", `Capability ${capability.capabilityId} requires denied action ${action}.`, [task.taskId, capability.capabilityId], "Remove the capability or revise the permission envelope.", 0.93));
    }
    if (!allowed.has("*") && !allowed.has(action)) {
      issues.push(makeIssue("blocker", "safety", "PERMISSION_NOT_ALLOWED", `Capability ${capability.capabilityId} requires action ${action}, but task does not allow it.`, [task.taskId, capability.capabilityId], "Add the action to allowedActions after review, or choose a lower-privilege capability.", 0.9));
    }
    if (/net|network|http|fetch|web/i.test(action) && !task.permissions.networkAllowed) {
      issues.push(makeIssue("blocker", "safety", "NETWORK_NOT_ALLOWED", `Capability ${capability.capabilityId} requires network-like action ${action}.`, [task.taskId, capability.capabilityId], "Set networkAllowed after review or use offline inputs.", 0.88));
    }
    if (/gcp|cloud|aws|azure/i.test(action) && !task.permissions.cloudAllowed) {
      issues.push(makeIssue("blocker", "cost", "CLOUD_NOT_ALLOWED", `Capability ${capability.capabilityId} requires cloud-like action ${action}.`, [task.taskId, capability.capabilityId], "Set cloudAllowed and cost boundary after explicit review.", 0.88));
    }
    if (/fs\.write|write|file\.write/i.test(action) && task.permissions.filesystemWriteRoots.length === 0) {
      issues.push(makeIssue("blocker", "safety", "WRITE_ROOT_MISSING", `Capability ${capability.capabilityId} can write files but task has no filesystemWriteRoots.`, [task.taskId, capability.capabilityId], "Declare bounded filesystemWriteRoots.", 0.88));
    }
  }
  if (capability.costProfile.maxUsd > task.costBoundary.maxUsd) {
    issues.push(makeIssue("blocker", "cost", "CAPABILITY_COST_EXCEEDS_TASK", `Capability ${capability.capabilityId} allows $${capability.costProfile.maxUsd.toFixed(2)} but task boundary is $${task.costBoundary.maxUsd.toFixed(2)}.`, [task.taskId, capability.capabilityId], "Lower capability cost profile or raise task boundary after review.", 0.9));
  }
  if (task.costBoundary.maxRuntimeSeconds != null && capability.costProfile.maxRuntimeSeconds != null && capability.costProfile.maxRuntimeSeconds > task.costBoundary.maxRuntimeSeconds) {
    issues.push(makeIssue("blocker", "cost", "CAPABILITY_RUNTIME_EXCEEDS_TASK", `Capability runtime ${capability.costProfile.maxRuntimeSeconds}s exceeds task boundary ${task.costBoundary.maxRuntimeSeconds}s.`, [task.taskId, capability.capabilityId], "Use a faster capability or raise runtime boundary.", 0.86));
  }
  return issues;
}

async function validateEvidenceReceipt(receipt: AgentEvidenceReceipt): Promise<AgentIssue[]> {
  const issues: AgentIssue[] = [];
  if (!receipt.receiptId) issues.push(makeIssue("blocker", "architecture", "RECEIPT_ID_MISSING", "Evidence receipt is missing receiptId.", [], "Set receiptId.", 0.94));
  if (!receipt.producedBy) issues.push(makeIssue("warning", "architecture", "RECEIPT_PRODUCER_MISSING", "Evidence receipt does not record producedBy.", [receipt.receiptId], "Record producer capability or task id.", 0.75));
  if (!receipt.validator) issues.push(makeIssue("warning", "execution", "RECEIPT_VALIDATOR_MISSING", "Evidence receipt does not record validator.", [receipt.receiptId], "Record validator command or rubric id.", 0.75));
  if (!receipt.hash) issues.push(makeIssue("blocker", "execution", "RECEIPT_HASH_MISSING", "Evidence receipt is missing hash.", [receipt.receiptId], "Hash the referenced artifact.", 0.92));
  if (isLocalArtifactUri(receipt.artifactRef.uri)) {
    const actual = await hashLocalFile(receipt.artifactRef.uri);
    if (!actual) {
      issues.push(makeIssue("blocker", "execution", "RECEIPT_ARTIFACT_MISSING", `Referenced artifact is missing: ${receipt.artifactRef.uri}.`, [receipt.receiptId], "Restore artifact or invalidate receipt.", 0.9));
    } else if (actual !== receipt.hash || (receipt.artifactRef.hash && actual !== receipt.artifactRef.hash)) {
      issues.push(makeIssue("blocker", "execution", "RECEIPT_HASH_MISMATCH", `Artifact hash does not match receipt ${receipt.receiptId}.`, [receipt.receiptId, receipt.artifactRef.uri], "Regenerate receipt after validating the current artifact.", 0.93));
    }
  }
  return issues;
}

function isLocalArtifactUri(uri: string): boolean {
  return Boolean(uri) && !/^[a-z][a-z0-9+.-]*:\/\//i.test(uri);
}

function isAllowedTaskTransition(from: AgentInteropStatus, to: AgentInteropStatus): boolean {
  if (from === to) return true;
  const allowed: Record<AgentInteropStatus, AgentInteropStatus[]> = {
    created: ["queued", "blocked", "needs_human_review", "canceled"],
    queued: ["running", "blocked", "canceled", "superseded"],
    running: ["succeeded", "failed", "blocked", "needs_human_review", "canceled"],
    blocked: ["queued", "needs_human_review", "failed", "canceled", "superseded"],
    needs_human_review: ["queued", "running", "blocked", "canceled", "superseded"],
    failed: ["queued", "superseded"],
    succeeded: ["superseded"],
    canceled: ["superseded"],
    superseded: [],
  };
  return allowed[from].includes(to);
}

async function contextEntries(resolved: string): Promise<Array<{ id: string; text: string }>> {
  const pathStat = await stat(resolved);
  if (!pathStat.isDirectory()) return [{ id: path.basename(resolved), text: await readFile(resolved, "utf-8") }];
  const entries = await readdir(resolved, { withFileTypes: true });
  const out: Array<{ id: string; text: string }> = [];
  for (const entry of entries) {
    if (!entry.isFile()) continue;
    const full = path.join(resolved, entry.name);
    out.push({ id: entry.name, text: await readFile(full, "utf-8").catch(() => "") });
  }
  return out;
}

async function fetchCrossrefPaperSources(topic: string): Promise<AgentSource[]> {
  const url = `https://api.crossref.org/works?rows=3&query=${encodeURIComponent(topic)}&select=DOI,title,URL,type`;
  try {
    const response = await fetch(url, { headers: { "User-Agent": "agenteer-agent-research-intake/1.0 (mailto:unknown@example.com)" } });
    if (!response.ok) throw new Error(`Crossref ${response.status}`);
    const parsed = await response.json() as { message?: { items?: Array<{ DOI?: string; title?: string[]; URL?: string; type?: string }> } };
    return (parsed.message?.items ?? []).map(item => makeSource("paper", item.title?.[0] ?? item.DOI ?? "Crossref paper", `Crossref paper result for ${topic}${item.type ? ` (${item.type})` : ""}.`, true, {
      url: item.URL ?? (item.DOI ? `https://doi.org/${item.DOI}` : null),
      evidenceState: "live",
      evidenceRole: "anchor",
      notes: ["retrieved from Crossref; content still requires human/method review"],
    }));
  } catch (error) {
    return [makeSource("paper", "Paper retrieval failed", `Could not retrieve live papers for ${topic}: ${error instanceof Error ? error.message : String(error)}.`, false, { evidenceState: "unverified", evidenceRole: "supporting", notes: ["live retrieval failed; do not use as evidence"] })];
  }
}

function makeSource(
  sourceType: AgentSource["sourceType"],
  title: string,
  claim: string,
  verified: boolean,
  opts: Partial<Pick<AgentSource, "url" | "evidenceState" | "evidenceRole" | "notes">> = {},
): AgentSource {
  const id = `${sourceType}_${createHash("sha1").update(title + claim).digest("hex").slice(0, 10)}`;
  const confidence = sourceType === "paper" ? 0.9 : sourceType === "official_doc" ? 0.86 : sourceType === "classic" ? 0.8 : sourceType === "x" ? 0.45 : 0.55;
  return {
    id,
    title,
    sourceType,
    url: opts.url ?? null,
    claim,
    verified,
    confidence,
    evidenceState: opts.evidenceState ?? (verified ? "live" : "unverified"),
    evidenceRole: opts.evidenceRole ?? (verified ? "anchor" : sourceType === "x" ? "weak_signal" : "supporting"),
    retrievedAtIso: new Date().toISOString(),
    notes: opts.notes ?? [],
  };
}

function makeIdea(goal: string, analogy: string, lineage: string[], tail: boolean, sources: readonly AgentSource[] = []): AgentCreativeIdea {
  const id = `idea_${createHash("sha1").update(`${goal}:${analogy}`).digest("hex").slice(0, 10)}`;
  const liveEvidenceBoost = Math.min(0.18, sources.filter(source => source.verified && source.evidenceState === "live").length * 0.04);
  const weakSignalBoost = Math.min(0.08, sources.filter(source => source.sourceType === "x").length * 0.03);
  return {
    id,
    title: `${analogy} transfer for ${goal}`,
    sourceAnalogies: [analogy],
    noveltyScore: Math.min(1, (tail ? 0.92 : 0.58 + Math.min(0.25, analogy.length / 100)) + weakSignalBoost),
    expectedImpact: Math.min(1, (tail ? 0.62 : 0.7) + liveEvidenceBoost),
    confidence: Math.min(1, (tail ? 0.38 : 0.68) + liveEvidenceBoost / 2),
    costUsd: 0,
    risk: tail ? 0.55 : 0.25,
    tail,
    practicalSubcomponent: tail ? "Extract the smallest deterministic evaluator from the impractical version." : `Translate ${analogy} scoring into a planner or critic heuristic.`,
    lineage,
  };
}

function ideaScore(idea: AgentCreativeIdea): number {
  return idea.expectedImpact * 0.4 + idea.confidence * 0.25 + idea.noveltyScore * 0.25 - idea.risk * 0.2 - idea.costUsd * 0.05;
}

function noveltyDistance(idea: AgentCreativeIdea, population: readonly AgentCreativeIdea[]): number {
  const target = tokenSet(`${idea.title} ${idea.sourceAnalogies.join(" ")} ${idea.practicalSubcomponent}`);
  const others = population.filter(candidate => candidate.id !== idea.id);
  if (!others.length) return 1;
  const maxSimilarity = Math.max(...others.map(candidate => jaccard(target, tokenSet(`${candidate.title} ${candidate.sourceAnalogies.join(" ")} ${candidate.practicalSubcomponent}`))));
  return 1 - maxSimilarity;
}

function tokenSet(text: string): Set<string> {
  return new Set(text.toLowerCase().split(/[^a-z0-9]+/).filter(token => token.length > 2));
}

function jaccard(a: Set<string>, b: Set<string>): number {
  const union = new Set([...a, ...b]);
  if (!union.size) return 0;
  let intersection = 0;
  for (const token of a) if (b.has(token)) intersection += 1;
  return intersection / union.size;
}

function rate<T>(items: readonly T[], predicate: (item: T) => boolean): number {
  return items.length ? items.filter(predicate).length / items.length : 0;
}

function variance(values: readonly number[]): number {
  if (!values.length) return 0;
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  return values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length;
}

function compareDurationBucket(a: string, b: string): number {
  return durationBucketWeight(a) - durationBucketWeight(b) || a.localeCompare(b);
}

function durationBucketWeight(bucket: string): number {
  const lower = bucket.toLowerCase();
  if (/short|tiny|1/.test(lower)) return 1;
  if (/medium|mid|2/.test(lower)) return 2;
  if (/long|3/.test(lower)) return 3;
  if (/marathon|extended|4/.test(lower)) return 4;
  return 10;
}

interface RepoCapabilities {
  manifests: Array<{ id: string; path: string; requiredActions: string[]; tags: string[] }>;
  cliCommands: string[];
}

function normalizeNodeContractArtifact(value: unknown): AgentNodeContract {
  const wrapped = unwrap<AgentNodeContract>(value, "nodeContract") ?? unwrap<AgentNodeContractValidation>(value, "nodeContractValidation")?.contract;
  const object = (wrapped ?? value) as Record<string, unknown>;
  if (object.schemaVersion === 1 && typeof object.nodeId === "string") return normalizeExplicitNodeContract(object);
  if (typeof object.id === "string" && typeof object.name === "string") return contractFromManifest(object);
  throw new Error("expected node contract or node manifest artifact");
}

function normalizeExplicitNodeContract(object: Record<string, unknown>): AgentNodeContract {
  return {
    schemaVersion: 1,
    nodeId: String(object.nodeId),
    displayName: String(object.displayName ?? object.nodeId),
    domain: String(object.domain ?? "general"),
    inputSchema: object.inputSchema ?? object.input_schema ?? { type: "object" },
    outputSchema: object.outputSchema ?? object.output_schema ?? { type: "object" },
    artifactEffects: normalizeArtifactEffects(object.artifactEffects),
    failureTypes: normalizeFailureTypes(object.failureTypes),
    verifier: normalizeVerifier(object.verifier),
    permissions: normalizePermissions(object.permissions),
    costBoundary: normalizeCostBoundary(object.costBoundary),
    sideEffects: normalizeSideEffects(object.sideEffects),
    stability: normalizeStability(object.stability),
    examples: normalizeExamples(object.examples),
  };
}

function contractFromManifest(manifest: Record<string, unknown>): AgentNodeContract {
  const sideEffects = Array.isArray(manifest.side_effects) ? manifest.side_effects.map(String) : [];
  const requiredActions = Array.isArray(manifest.required_actions) ? manifest.required_actions.map(String) : [];
  const tags = Array.isArray(manifest.tags) ? manifest.tags.map(String) : [];
  const writesFs = sideEffects.some(effect => /fs|file|write|artifact/i.test(effect));
  const network = requiredActions.some(action => /net|http|fetch|web|network/i.test(action));
  return {
    schemaVersion: 1,
    nodeId: String(manifest.id),
    displayName: String(manifest.name),
    domain: tags[0] ?? "general",
    inputSchema: manifest.input_schema ?? { type: "object" },
    outputSchema: manifest.output_schema ?? { type: "object" },
    artifactEffects: writesFs
      ? [{ id: "artifact-output", kind: "emit", pathTemplate: "artifacts/{nodeId}.json", required: false, description: "Node emits an inspectable artifact record." }]
      : [],
    failureTypes: defaultNodeFailureTypes(),
    verifier: {
      kind: manifest.input_schema || manifest.output_schema ? "json-schema" : "manual",
      inputRequired: Boolean(manifest.input_schema),
      outputRequired: Boolean(manifest.output_schema),
      command: null,
      evidenceRefs: [],
    },
    permissions: {
      requiredActions,
      dynamicActions: Boolean(manifest.dynamic_actions),
      dynamicActionSpec: typeof manifest.dynamic_action_spec === "string" ? manifest.dynamic_action_spec : null,
    },
    costBoundary: {
      maxUsd: network ? 1 : 0,
      maxRuntimeSeconds: 300,
      cloudAllowed: false,
    },
    sideEffects: {
      writesFs,
      network,
      mutatesCtx: sideEffects.some(effect => /ctx|context/i.test(effect)),
      emitsCtxVariants: [],
    },
    stability: {
      determinism: manifest.determinism === "stochastic" ? "stochastic" : "deterministic",
      maturity: "experimental",
    },
    examples: [],
  };
}

function validateNodeContract(contract: AgentNodeContract): AgentNodeContractValidation {
  const issues: AgentIssue[] = [];
  if (!contract.nodeId) issues.push(makeIssue("blocker", "architecture", "NODE_ID_MISSING", "Contract is missing nodeId.", [], "Set a stable nodeId.", 0.96));
  if (!contract.displayName) issues.push(makeIssue("blocker", "architecture", "DISPLAY_NAME_MISSING", "Contract is missing displayName.", [contract.nodeId], "Add a displayName.", 0.92));
  if (!isJsonSchemaLike(contract.inputSchema)) issues.push(makeIssue("blocker", "architecture", "INPUT_SCHEMA_INVALID", "Input schema is missing or not schema-like.", [contract.nodeId], "Add a JSON-schema-compatible inputSchema.", 0.9));
  if (!isJsonSchemaLike(contract.outputSchema)) issues.push(makeIssue("blocker", "architecture", "OUTPUT_SCHEMA_INVALID", "Output schema is missing or not schema-like.", [contract.nodeId], "Add a JSON-schema-compatible outputSchema.", 0.9));
  if (!contract.failureTypes.length) issues.push(makeIssue("blocker", "architecture", "FAILURE_TYPES_MISSING", "Contract does not declare typed failure modes.", [contract.nodeId], "Declare failureTypes before execution.", 0.93));
  if (contract.sideEffects.writesFs && !contract.artifactEffects.length) {
    issues.push(makeIssue("blocker", "execution", "ARTIFACT_EFFECTS_MISSING", "Contract writes files but declares no artifact effects.", [contract.nodeId], "Declare artifactEffects for every file/artifact side effect.", 0.9));
  }
  if (contract.verifier.kind === "manual" && (contract.verifier.inputRequired || contract.verifier.outputRequired)) {
    issues.push(makeIssue("warning", "architecture", "MANUAL_VERIFIER_WITH_REQUIRED_IO", "Contract requires IO verification but verifier is manual.", [contract.nodeId], "Use json-schema or command verifier.", 0.76));
  }
  if (contract.permissions.requiredActions.some(action => /network|http|fetch|web|gcp|cloud/i.test(action)) && !contract.costBoundary.cloudAllowed && contract.costBoundary.maxUsd <= 0) {
    issues.push(makeIssue("warning", "cost", "NETWORK_WITH_ZERO_COST_BOUNDARY", "Contract may use network/cloud capability but has a zero spend boundary.", [contract.nodeId], "Set an explicit nonzero reviewed cost boundary or remove the network action.", 0.72));
  }
  const inputExampleIssues = contract.examples.flatMap((example, index) => validateJsonSchemaSubset(contract.inputSchema, example.input, `examples[${index}].input`));
  const outputExampleIssues = contract.examples.flatMap((example, index) => validateJsonSchemaSubset(contract.outputSchema, example.output, `examples[${index}].output`));
  if (inputExampleIssues.length) {
    issues.push(makeIssue("blocker", "execution", "INPUT_EXAMPLE_INVALID", "At least one contract input example fails schema validation.", [contract.nodeId], "Fix the input example or the input schema.", 0.88));
  }
  if (outputExampleIssues.length) {
    issues.push(makeIssue("blocker", "execution", "OUTPUT_EXAMPLE_INVALID", "At least one contract output example fails schema validation.", [contract.nodeId], "Fix the output example or the output schema.", 0.88));
  }
  const status = issues.some(issue => issue.severity === "blocker") ? "blocked" : issues.length ? "needs_revision" : "pass";
  return {
    contract,
    status,
    issues,
    inputExampleIssues,
    outputExampleIssues,
    nextAction: status === "pass" ? "Contract is ready for planner and execution gates." : "Repair the contract before using it for executable planning.",
  };
}

function validateNodeIo(contract: AgentNodeContract, kind: "input" | "output", value: unknown): AgentNodeIoValidation {
  const issues = validateJsonSchemaSubset(kind === "input" ? contract.inputSchema : contract.outputSchema, value, "$");
  return {
    nodeId: contract.nodeId,
    kind,
    status: issues.length ? "fail" : "pass",
    issues,
    typedFailures: issues.length ? [pickContractFailure(contract, kind === "input" ? "NODE_INPUT_INVALID" : "NODE_OUTPUT_INVALID")] : [],
    nextAction: issues.length ? `Repair ${kind} before ${kind === "input" ? "running" : "recording downstream provenance"}.` : `${kind} is valid for ${contract.nodeId}.`,
  };
}

function validateJsonSchemaSubset(schema: unknown, value: unknown, at: string): AgentJsonSchemaIssue[] {
  if (!schema || typeof schema !== "object") return [{ path: at, code: "SCHEMA_NOT_OBJECT", message: "Schema must be an object." }];
  const object = schema as Record<string, unknown>;
  const issues: AgentJsonSchemaIssue[] = [];
  const type = object.type;
  if (type && !matchesJsonType(type, value)) {
    issues.push({ path: at, code: "TYPE_MISMATCH", message: `Expected ${Array.isArray(type) ? type.join("|") : String(type)}.` });
    return issues;
  }
  if (Array.isArray(object.enum) && !object.enum.some(item => JSON.stringify(item) === JSON.stringify(value))) {
    issues.push({ path: at, code: "ENUM_MISMATCH", message: `Value is not one of ${object.enum.map(String).join(", ")}.` });
  }
  if (typeof value === "object" && value !== null && !Array.isArray(value)) {
    const record = value as Record<string, unknown>;
    for (const key of Array.isArray(object.required) ? object.required.map(String) : []) {
      if (!(key in record)) issues.push({ path: `${at}.${key}`, code: "REQUIRED_MISSING", message: `Missing required property ${key}.` });
    }
    const properties = object.properties;
    if (properties && typeof properties === "object") {
      for (const [key, childSchema] of Object.entries(properties as Record<string, unknown>)) {
        if (key in record) issues.push(...validateJsonSchemaSubset(childSchema, record[key], `${at}.${key}`));
      }
    }
  }
  if (Array.isArray(value) && object.items) {
    value.forEach((item, index) => issues.push(...validateJsonSchemaSubset(object.items, item, `${at}[${index}]`)));
  }
  if (typeof value === "string") {
    if (typeof object.minLength === "number" && value.length < object.minLength) issues.push({ path: at, code: "MIN_LENGTH", message: `String is shorter than ${object.minLength}.` });
    if (typeof object.maxLength === "number" && value.length > object.maxLength) issues.push({ path: at, code: "MAX_LENGTH", message: `String is longer than ${object.maxLength}.` });
  }
  if (typeof value === "number") {
    if (typeof object.minimum === "number" && value < object.minimum) issues.push({ path: at, code: "MINIMUM", message: `Number is below ${object.minimum}.` });
    if (typeof object.maximum === "number" && value > object.maximum) issues.push({ path: at, code: "MAXIMUM", message: `Number is above ${object.maximum}.` });
  }
  return issues;
}

function matchesJsonType(type: unknown, value: unknown): boolean {
  const types = Array.isArray(type) ? type.map(String) : [String(type)];
  return types.some(candidate => {
    if (candidate === "array") return Array.isArray(value);
    if (candidate === "object") return typeof value === "object" && value !== null && !Array.isArray(value);
    if (candidate === "integer") return Number.isInteger(value);
    if (candidate === "number") return typeof value === "number" && Number.isFinite(value);
    if (candidate === "null") return value === null;
    return typeof value === candidate;
  });
}

function isJsonSchemaLike(value: unknown): boolean {
  return Boolean(value && typeof value === "object" && ("type" in (value as Record<string, unknown>) || "properties" in (value as Record<string, unknown>) || "required" in (value as Record<string, unknown>)));
}

async function discoverNodeContracts(dir: string): Promise<AgentNodeContractRegistry> {
  const root = path.resolve(dir);
  const contracts: AgentNodeContract[] = [];
  const issues: AgentIssue[] = [];
  const files = (await findFiles(root, "node-contract.json", 5)).concat(await findFiles(root, "framework.json", 5));
  for (const file of uniqueStrings(files)) {
    const parsed = parseMaybeJson(await readFile(file, "utf-8").catch(() => ""));
    if (!parsed) continue;
    try {
      const contract = normalizeNodeContractArtifact(parsed);
      const validation = validateNodeContract(contract);
      contracts.push(contract);
      for (const issue of validation.issues) {
        issues.push(makeIssue(issue.severity, issue.category, issue.code, `${path.relative(root, file)}: ${issue.message}`, [contract.nodeId], issue.repairAction, issue.confidence));
      }
    } catch {
      continue;
    }
  }
  return {
    dir: root,
    contracts: uniqueContracts(contracts),
    issues,
    nextAction: contracts.length ? "Use node contracts in plan-v2 and plan-critic." : "Add node-contract.json files or framework manifests with typed schemas.",
  };
}

function summarizeNodeContracts(contracts: readonly AgentNodeContract[]): AgentNodeContractSummary[] {
  return contracts.map(contract => ({
    nodeId: contract.nodeId,
    displayName: contract.displayName,
    domain: contract.domain,
    verifierKind: contract.verifier.kind,
    artifactEffects: contract.artifactEffects.map(effect => `${effect.kind}:${effect.pathTemplate}`),
    failureTypes: contract.failureTypes.map(failure => failure.code),
    costBoundary: contract.costBoundary,
  })).slice(0, 20);
}

async function recordArtifactEffects(contract: AgentNodeContract, baseDir: string): Promise<AgentNodeArtifactRecord[]> {
  const records: AgentNodeArtifactRecord[] = [];
  for (const effect of contract.artifactEffects) {
    const rendered = effect.pathTemplate.replaceAll("{nodeId}", contract.nodeId.replace(/[^a-z0-9._-]+/gi, "_"));
    const resolved = path.isAbsolute(rendered) ? rendered : path.resolve(baseDir, rendered);
    const text = await readFile(resolved, "utf-8").catch(() => null);
    records.push({
      id: effect.id,
      kind: effect.kind,
      path: resolved,
      required: effect.required,
      exists: text !== null || await exists(resolved),
      hash: text === null ? null : sha256(text),
    });
  }
  return records;
}

function normalizeArtifactEffects(value: unknown): AgentNodeArtifactEffect[] {
  if (!Array.isArray(value)) return [];
  return value.map((effect, index) => {
    const object = effect as Record<string, unknown>;
    const kind = String(object.kind ?? "emit");
    return {
      id: String(object.id ?? `artifact-${index + 1}`),
      kind: kind === "read" || kind === "write" || kind === "delete" ? kind : "emit",
      pathTemplate: String(object.pathTemplate ?? object.path_template ?? `artifacts/artifact-${index + 1}.json`),
      required: Boolean(object.required),
      description: String(object.description ?? "Declared node artifact side effect."),
    };
  });
}

function normalizeFailureTypes(value: unknown): AgentNodeFailureType[] {
  if (!Array.isArray(value)) return defaultNodeFailureTypes();
  return value.map((failure): AgentNodeFailureType => {
    const object = failure as Record<string, unknown>;
    const severity = String(object.severity ?? "blocker");
    const category = String(object.category ?? "execution");
    return {
      code: String(object.code ?? "NODE_RUNTIME_FAILED"),
      severity: severity === "warning" || severity === "note" ? severity : "blocker",
      category: isAgentCriticCategory(category) ? category : "execution",
      retryable: object.retryable !== false,
      repairAction: String(object.repairAction ?? object.repair_action ?? "Inspect node failure and route to repair-plan."),
      description: String(object.description ?? "Node failure."),
    };
  });
}

function normalizeVerifier(value: unknown): AgentNodeVerifier {
  const object = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const kind = String(object.kind ?? "json-schema");
  return {
    kind: kind === "command" || kind === "manual" ? kind : "json-schema",
    inputRequired: object.inputRequired !== false,
    outputRequired: object.outputRequired !== false,
    command: typeof object.command === "string" ? object.command : null,
    evidenceRefs: Array.isArray(object.evidenceRefs) ? object.evidenceRefs.map(String) : [],
  };
}

function normalizePermissions(value: unknown): AgentNodePermissions {
  const object = value && typeof value === "object" ? value as Record<string, unknown> : {};
  return {
    requiredActions: Array.isArray(object.requiredActions) ? object.requiredActions.map(String) : [],
    dynamicActions: Boolean(object.dynamicActions),
    dynamicActionSpec: typeof object.dynamicActionSpec === "string" ? object.dynamicActionSpec : null,
  };
}

function normalizeCostBoundary(value: unknown): AgentNodeCostBoundary {
  const object = value && typeof value === "object" ? value as Record<string, unknown> : {};
  return {
    maxUsd: Number(object.maxUsd ?? 0),
    maxRuntimeSeconds: object.maxRuntimeSeconds === null ? null : Number(object.maxRuntimeSeconds ?? 300),
    cloudAllowed: Boolean(object.cloudAllowed),
  };
}

function normalizeSideEffects(value: unknown): AgentNodeSideEffects {
  const object = value && typeof value === "object" ? value as Record<string, unknown> : {};
  return {
    writesFs: Boolean(object.writesFs),
    network: Boolean(object.network),
    mutatesCtx: Boolean(object.mutatesCtx),
    emitsCtxVariants: Array.isArray(object.emitsCtxVariants) ? object.emitsCtxVariants.map(String) : [],
  };
}

function normalizeStability(value: unknown): AgentNodeStability {
  const object = value && typeof value === "object" ? value as Record<string, unknown> : {};
  return {
    determinism: object.determinism === "stochastic" ? "stochastic" : "deterministic",
    maturity: object.maturity === "stable" || object.maturity === "deprecated" ? object.maturity : "experimental",
  };
}

function normalizeExamples(value: unknown): AgentNodeContractExample[] {
  if (!Array.isArray(value)) return [];
  return value.map((example, index) => {
    const object = example as Record<string, unknown>;
    return {
      name: String(object.name ?? `example-${index + 1}`),
      input: object.input ?? {},
      output: object.output ?? {},
    };
  });
}

function defaultNodeFailureTypes(): AgentNodeFailureType[] {
  return [
    { code: "NODE_INPUT_INVALID", severity: "blocker", category: "execution", retryable: false, repairAction: "Repair upstream data before running this node.", description: "Input failed the node input schema." },
    { code: "NODE_OUTPUT_INVALID", severity: "blocker", category: "execution", retryable: true, repairAction: "Repair node implementation or output adapter before downstream use.", description: "Output failed the node output schema." },
    { code: "NODE_ARTIFACT_MISSING", severity: "blocker", category: "execution", retryable: true, repairAction: "Regenerate or locate the required artifact before packet export.", description: "A required artifact side effect was not found." },
    { code: "NODE_RUNTIME_FAILED", severity: "blocker", category: "execution", retryable: true, repairAction: "Inspect validator output and run the typed repair loop.", description: "Node execution failed." },
  ];
}

function pickContractFailure(contract: AgentNodeContract, code: string): AgentNodeFailureType {
  return contract.failureTypes.find(failure => failure.code === code) ?? defaultNodeFailureTypes().find(failure => failure.code === code) ?? defaultNodeFailureTypes()[3]!;
}

function uniqueFailures(failures: AgentNodeFailureType[]): AgentNodeFailureType[] {
  const seen = new Set<string>();
  return failures.filter(failure => {
    if (seen.has(failure.code)) return false;
    seen.add(failure.code);
    return true;
  });
}

function uniqueContracts(contracts: AgentNodeContract[]): AgentNodeContract[] {
  const seen = new Set<string>();
  return contracts.filter(contract => {
    if (seen.has(contract.nodeId)) return false;
    seen.add(contract.nodeId);
    return true;
  });
}

function isAgentCriticCategory(value: string): value is AgentCriticCategory {
  return ["product", "research", "architecture", "execution", "safety", "context", "cost"].includes(value);
}

async function discoverRepoCapabilities(repo: string): Promise<RepoCapabilities> {
  const root = path.resolve(repo);
  const manifests: RepoCapabilities["manifests"] = [];
  const frameworkFiles = await findFiles(root, "framework.json", 4);
  for (const file of frameworkFiles) {
    const parsed = parseMaybeJson(await readFile(file, "utf-8").catch(() => ""));
    if (parsed && typeof parsed === "object") {
      const object = parsed as Record<string, unknown>;
      if (typeof object.id === "string") {
        manifests.push({
          id: object.id,
          path: file,
          requiredActions: Array.isArray(object.required_actions) ? object.required_actions.map(String) : [],
          tags: Array.isArray(object.tags) ? object.tags.map(String) : [],
        });
      }
    }
  }
  const cliCommands = await discoverCliCommands(root);
  return { manifests, cliCommands };
}

async function discoverCliCommands(root: string): Promise<string[]> {
  const binPath = path.join(root, "packages", "cli", "src", "bin", "agenteer.ts");
  const text = await readFile(binPath, "utf-8").catch(() => "");
  const commands: string[] = [];
  const commandGroups = ["agent", "research", "lab"];
  for (const group of commandGroups) {
    const groupStart = text.indexOf(`async function ${group}Cmd`);
    if (groupStart < 0) continue;
    const groupText = text.slice(groupStart, text.indexOf("\nasync function", groupStart + 20) > 0 ? text.indexOf("\nasync function", groupStart + 20) : undefined);
    for (const match of groupText.matchAll(/case "([^"]+)":/g)) commands.push(`${group} ${match[1]}`);
  }
  return uniqueStrings(commands).sort();
}

async function findFiles(root: string, basename: string, maxDepth: number): Promise<string[]> {
  const results: string[] = [];
  async function walk(dir: string, depth: number): Promise<void> {
    if (depth > maxDepth) return;
    const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);
    for (const entry of entries) {
      if (["node_modules", ".git", "dist", ".turbo"].includes(entry.name)) continue;
      const full = path.join(dir, entry.name);
      if (entry.isFile() && entry.name === basename) results.push(full);
      if (entry.isDirectory()) await walk(full, depth + 1);
    }
  }
  await walk(root, 0);
  return results;
}

function makeIssue(severity: AgentSeverity, category: AgentCriticCategory, code: string, message: string, evidenceRefs: string[], repairAction: string, confidence: number): AgentIssue {
  return { severity, category, code, message, evidenceRefs, repairAction, confidence };
}

function parseMaybeJson(text: string): unknown | null {
  const trimmed = text.trim();
  if (!trimmed) return null;
  try {
    return JSON.parse(trimmed);
  } catch {
    return null;
  }
}

function summarizeJsonOrText(text: string): string {
  const parsed = parseMaybeJson(text);
  if (parsed && typeof parsed === "object") return JSON.stringify(parsed).slice(0, 500);
  return text.slice(0, 500);
}

function extractExecutionMemoryGuards(text: string): string[] {
  const parsed = parseMaybeJson(text);
  const memory = parsed ? unwrap<AgentExecutionMemory>(parsed, "executionMemory") : null;
  if (memory?.retryGuards?.length) {
    return memory.retryGuards.slice(0, 5);
  }
  return [];
}

function uniqueStrings(values: readonly string[]): string[] {
  return Array.from(new Set(values.filter(Boolean)));
}

function symmetricDifference(a: readonly string[], b: readonly string[]): string[] {
  const setA = new Set(a);
  const setB = new Set(b);
  return [...a.filter(item => !setB.has(item)), ...b.filter(item => !setA.has(item))];
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function clamp(min: number, max: number, value: number): number {
  return Math.max(min, Math.min(max, value));
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

async function exists(file: string): Promise<boolean> {
  try {
    await access(file);
    return true;
  } catch {
    return false;
  }
}

function jsonWrap(key: string, value: unknown): string {
  return `${JSON.stringify({ schemaVersion: 1, [key]: value }, null, 2)}\n`;
}
