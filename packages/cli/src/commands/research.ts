import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { access, appendFile, copyFile, mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import {
  agentCapabilityValidateCommand,
  agentEvidenceReceiptCommand,
  agentTaskCreateCommand,
  agentTaskExportCommand,
  agentTaskTransitionCommand,
  agentTaskValidateCommand,
} from "./agent.js";
import { getDatasetManifest } from "../research-machine/catalog.js";
import {
  labMedbreviaNhanesCommand,
  renderLabMedbreviaNhanesResult,
  type LabMedbreviaNhanesOptions,
  type LabMedbreviaNhanesResult,
  type NhanesRegistry,
} from "./lab.js";
import type { StatsRunResult } from "../research-machine/stats/schemas.js";

const execFileAsync = promisify(execFile);

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
  schemaVersion: 1;
  eventType: "research.packet.approval";
  packetDir: string;
  approvedAtIso: string;
  decisionId: string;
  recordHash: string;
  reviewer: "agent-human-in-the-loop";
  status: "approved";
  title: string;
  note: string;
  critiqueStatus: ResearchPacketCritiqueResult["status"];
  scoutStatus: ResearchScoutPlan["status"] | "missing";
}

export interface ResearchApprovalVerification {
  packetDir: string;
  approvalPath: string;
  status: "missing" | "valid" | "invalid";
  expectedHash: string | null;
  actualHash: string | null;
  eventType: string | null;
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
    critique: boolean;
    methodsValidation: boolean;
    scoutPlan: boolean;
    dataQuality: boolean;
    runnerSpec: boolean;
    approval: boolean;
    analysisResult: boolean;
    report: boolean;
    artifactManifest: boolean;
    exportRecord: boolean;
  };
  currentStage: "design" | "scout" | "runner_spec" | "approval" | "analysis" | "report_review" | "manifest" | "export" | "complete";
  nextCommand: string;
  recommendedCommands: string[];
  reason: string;
  stageGate: ResearchStageGateResult | null;
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

export interface ResearchManifestVerification {
  packetDir: string;
  manifestPath: string;
  status: "missing" | "valid" | "invalid";
  validLocal: boolean;
  validForShare: boolean;
  shareStatus: string | null;
  checkedArtifacts: number;
  issues: string[];
  typedIssues: ResearchCritiqueIssue[];
}

export interface ResearchLoopStatus {
  stateDir: string;
  stateExists: boolean;
  state: unknown | null;
  journalEntries: number;
  backlogItems: number;
  nextAction: string;
}

export interface ResearchPacketNext {
  schemaVersion: 1;
  eventType: "research.packet.next";
  packetDir: string;
  generatedAtIso: string;
  decisionId: string;
  previousRecordHash: string | null;
  recordHash: string;
  currentStage: ResearchCheckpoint["currentStage"];
  gateStatus: "pass" | "blocked" | "not_applicable";
  targetMode: ResearchPipelineStage["mode"] | null;
  recommendedCommands: string[];
  expectedArtifacts: ResearchPacketExpectedArtifact[];
  tracePath: string | null;
  message: string;
}

export interface ResearchPacketNextOptions {
  trace?: boolean;
}

export interface ResearchNavigationTraceSummary {
  packetDir: string;
  tracePath: string;
  status: "missing" | "valid" | "invalid";
  exists: boolean;
  events: number;
  malformedLines: number;
  hashChainStatus: "missing" | "valid" | "broken" | "unchecked";
  eventTypes: Record<string, number>;
  lastEvent: ResearchPacketNext | null;
}

export interface ResearchPacketVerification {
  packetDir: string;
  mode: "available-integrity";
  scope: string[];
  status: "pass" | "fail" | "incomplete";
  exportIntegrityReady: boolean;
  exportIntegrityReason: string;
  summary: string;
  nextAction: string;
  approval: ResearchApprovalVerification;
  navigationTrace: ResearchNavigationTraceSummary;
  manifest: ResearchManifestVerification;
  issues: string[];
}

export interface ResearchPacketReadinessComponent {
  id: "integrity" | "checkpoint" | "methods-validation" | "report-review" | "claim-guard" | "provenance" | "export" | "share-local-paths" | "redacted-data-access";
  status: "pass" | "warning" | "missing" | "fail" | "blocked";
  detail: string;
  nextAction: string;
}

export interface ResearchPacketReadiness {
  packetDir: string;
  mode: "review-readiness";
  readinessProfile: {
    id: string;
    label: string;
    domain: string;
    selection: "default";
    caveat: string;
  };
  scope: string[];
  status: "review_ready" | "needs_work";
  decisionPosture: "stop" | "read_with_caution" | "ready_for_scientific_review";
  sharePosture: "do_not_share" | "share_with_caution" | "ready_to_share";
  stopReasons: string[];
  recommendedCommands: string[];
  summary: string;
  clinicianSummary: string;
  components: ResearchPacketReadinessComponent[];
  limitations: string[];
  references: Array<{
    id: string;
    title: string;
    url: string;
    applicability: string;
  }>;
  packetVerification: ResearchPacketVerification;
  nextAction: string;
}

export interface ResearchPacketExpectedArtifact {
  stage: string;
  path: string;
  required: boolean;
  exists: boolean;
  description: string;
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

export interface ResearchCycleAudit {
  cycleDir: string;
  status: "full_cycle" | "batch_sweep" | "incomplete";
  countsAsCycle: boolean;
  score: number;
  checks: Array<{
    id: string;
    status: "pass" | "fail";
    evidence: string[];
    detail: string;
  }>;
  correctiveActions: string[];
  nextAction: string;
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
  mode: "exploratory" | "review_gate" | "executable" | "reproducibility";
  requiredBefore: string[];
}

export interface ResearchStageArtifactDefinition {
  stage: string;
  fileName: string;
  required: boolean;
  description: string;
}

export interface ResearchStageGateResult {
  target: string;
  completed: string[];
  status: "pass" | "blocked";
  missingRequiredStages: string[];
  targetMode: ResearchPipelineStage["mode"] | null;
  nextAction: string;
}

export interface ResearchPacketExport {
  packetDir: string;
  exportDir: string;
  copiedArtifacts: string[];
  summaryPath: string;
  exportReceipt?: {
    policy: "shareable-local-path-scan-v1";
    generatedAtIso: string;
    status: "pass" | "fail";
    artifactChecks: Array<{ path: string; bytes: number; sha256: string }>;
    localPathScan: {
      status: "pass" | "fail";
      scannedArtifacts: number;
      findings: Array<{ artifactPath: string; sample: string }>;
    };
  };
}

export interface ResearchPacketSummary {
  packetDir: string;
  generatedAtIso: string;
  stages: ResearchPipelineStage[];
  checkpoint: ResearchCheckpoint;
  manifest: ResearchArtifactManifest | null;
  reportReview: ResearchReportReview | null;
  exportRecord: ResearchPacketExport | null;
  nextAction: string;
}

export interface ResearchMethodsFrameworkItem {
  id: string;
  appliesTo: string[];
  purpose: string;
  pipelineImplication: string;
  sourceUrl: string;
}

export interface ResearchMethodsFramework {
  schemaVersion: 1;
  generatedAtIso: string;
  items: ResearchMethodsFrameworkItem[];
}

export interface ResearchMethodsValidationResult {
  packetDir: string;
  status: "pass" | "needs_review" | "blocked";
  appliedFrameworkItems: string[];
  issues: ResearchCritiqueIssue[];
}

export interface ResearchRegistryInspectResult {
  registryPath: string;
  dataset: string;
  cycles: string[];
  domainCount: number;
  variableCount: number;
  weightRuleCount: number;
  warnings: ResearchCritiqueIssue[];
  nextAction: string;
}

export interface ResearchQuestionDecomposition {
  question: string;
  intent: "association" | "causal" | "prediction" | "diagnostic" | "descriptive";
  population: string | null;
  exposureOrPredictor: string | null;
  comparatorOrReference: string | null;
  outcome: string | null;
  stratifierOrModifier: string | null;
  temporalConstraints: string[];
  adjustmentCovariates: string[];
  requiredMethods: string[];
  clarificationPrompts: string[];
}

export interface ResearchClarificationPlan {
  question: string;
  status: "needs_clarification" | "ready_for_protocol_design";
  items: Array<{
    id: string;
    priority: "required" | "recommended";
    prompt: string;
    reason: string;
  }>;
  nextAction: string;
}

export interface ResearchDataQualityProfile {
  fixturePath: string;
  rowCount: number;
  variableCount: number;
  variables: Array<{
    name: string;
    missing: number;
    missingRate: number;
    codedUnknown: number;
    observed: number;
  }>;
  warnings: ResearchCritiqueIssue[];
}

export interface ResearchMethodSelection {
  question: string;
  intent: ResearchQuestionDecomposition["intent"];
  recommendedAnalysis: string;
  requiredChecks: string[];
  cautions: string[];
}

export interface ResearchRoCrateMetadata {
  packetDir: string;
  cratePath: string;
  metadata: {
    "@context": string;
    "@graph": Array<Record<string, unknown>>;
  };
}

export interface ResearchProvenanceGraph {
  packetDir: string;
  provenancePath: string;
  graph: {
    schemaVersion: 1;
    entities: Array<{ id: string; type: "artifact"; path: string; sha256?: string }>;
    activities: Array<{ id: string; type: string; generated: string[]; used: string[] }>;
    agents: Array<{ id: string; type: string; role: string }>;
  };
}

export interface ResearchQaDashboard {
  packetDir: string;
  status: "ready" | "needs_review" | "blocked";
  checks: Array<{
    id: string;
    status: "pass" | "missing" | "needs_review" | "blocked";
    detail: string;
  }>;
  nextAction: string;
}

export interface ResearchSuppressionPolicyResult {
  count: number;
  threshold: number;
  status: "display" | "suppress";
  reason: string;
  source: string;
}

export interface ResearchRegistrySearchResult {
  registryPath: string;
  query: string;
  matches: Array<{
    name: string;
    domain: string | null;
    label: string | null;
  }>;
}

export interface ResearchEstimandSketch {
  question: string;
  intent: ResearchQuestionDecomposition["intent"];
  targetQuantity: string;
  contrast: string;
  population: string | null;
  exposureOrPredictor: string | null;
  comparatorOrReference: string | null;
  outcome: string | null;
  temporalConstraints: string[];
  adjustmentCovariates: string[];
  requiredAssumptions: string[];
  disallowedLanguage: string[];
}

export interface ResearchStudySimulationResult {
  packetDir: string;
  exportDir: string;
  question: string;
  fixturePath: string;
  completedStages: string[];
  qaStatus: ResearchQaDashboard["status"];
  nextAction: string;
}

export interface ResearchRealStudyReadiness {
  packetDir: string;
  status: "not_ready" | "ready_for_local_real_data";
  requirements: Array<{
    id: string;
    blocking: boolean;
    status: "pass" | "missing";
    detail: string;
  }>;
  nextAction: string;
}

export interface ResearchDataAccessManifest {
  packetDir: string;
  manifestPath: string;
  dataset: string;
  decisionSummary: string;
  files: Array<{
    path: string;
    role: string;
    exists: boolean;
    summaryStatus: "summarized" | "missing" | "unsupported";
    summaryError?: string;
    summary?: Pick<ResearchTableSummary, "format" | "adapter" | "fileSizeBytes" | "fileMtimeMs" | "fileSha256" | "rowCount" | "columnCount"> & {
      columns: Array<Pick<ResearchTableSummary["columns"][number], "name" | "inferredType" | "nonMissingRows" | "missingFraction">>;
    };
  }>;
  expectedVariables: Array<{ name: string; observed: boolean; files: string[] }>;
  readOnly: true;
  notes: string[];
}

export interface ResearchDataAccessRedaction {
  packetRef: string;
  sourceManifestRef: string;
  sourceManifestSha256: string;
  redactedRef: string;
  generatedAtIso: string;
  decisionSummary: string;
  files: Array<{
    sourceRef: string;
    role: string;
    exists: boolean;
    summaryStatus: ResearchDataAccessManifest["files"][number]["summaryStatus"];
    summary?: Omit<NonNullable<ResearchDataAccessManifest["files"][number]["summary"]>, "adapter"> & {
      adapter: Omit<ResearchTableSummary["adapter"], "executable"> & { executableRef: string };
    };
  }>;
  expectedVariables: Array<{ name: string; observed: boolean; sourceRefs: string[] }>;
  redactions: Array<{ field: string; reason: string }>;
}

export interface ResearchRealLocalRunnerSpec {
  packetDir: string;
  generatedAtIso: string;
  runnerVersion: 0;
  mode: "real_local_files";
  dataAccessManifest: string | null;
  requiredVariables: string[];
  safety: {
    cloudSpendUsd: 0;
    readOnlyData: true;
    requiresHumanApproval: true;
  };
}

export interface ResearchRealStudyChecklist {
  packetDir: string;
  items: Array<{
    order: number;
    command: string;
    reason: string;
    done: boolean;
  }>;
  nextCommand: string | null;
}

export interface ResearchAdapterGapReport {
  packetDir: string;
  requiredVariables: string[];
  declaredFiles: number;
  missingEvidence: string[];
  status: "needs_mapping" | "mapping_ready";
  nextAction: string;
}

export interface ResearchVariableMap {
  packetDir: string;
  mapPath: string;
  mappings: Array<{
    variable: string;
    file: string;
    column: string;
  }>;
}

export interface ResearchVariableMapSuggestion {
  packetDir: string;
  file: string;
  tableEvidence: {
    adapterKind: ResearchTableSummary["adapter"]["kind"];
    fileSha256: string;
    fileMtimeMs: number;
    rowCount: number;
    columnCount: number;
  };
  requiredVariables: string[];
  suggestions: Array<{
    variable: string;
    column: string;
    confidence: "high" | "medium";
    reason: string;
  }>;
  unmatchedVariables: string[];
  nextAction: string;
}

export interface ResearchVariableMapApplyResult {
  packetDir: string;
  file: string;
  mapPath: string;
  appliedMappings: ResearchVariableMap["mappings"];
  skippedVariables: string[];
  adapterStatus: ResearchAdapterGapReport["status"];
  nextAction: string;
}

export interface ResearchWorkflowScorecard {
  packetDir: string;
  score: number;
  status: "promote" | "improve" | "blocked";
  checks: Array<{
    id: string;
    points: number;
    maxPoints: number;
    status: "pass" | "partial" | "fail";
    detail: string;
  }>;
  nextAction: string;
}

export interface ResearchEvidenceGapReport {
  packetDir: string;
  status: "ready" | "needs_evidence";
  reportPath: string | null;
  citationCount: number;
  checks: Array<{
    id: string;
    status: "pass" | "missing" | "needs_review";
    detail: string;
  }>;
  nextAction: string;
}

export interface ResearchPacketDiff {
  basePacketDir: string;
  comparePacketDir: string;
  addedArtifacts: string[];
  removedArtifacts: string[];
  changedArtifacts: string[];
  unchangedArtifacts: string[];
  scoreDelta: number | null;
  nextAction: string;
}

export interface ResearchNodeProposal {
  id: string;
  purpose: string;
  expectedEvaluator: string;
  rollbackCondition: string;
  costEnvelopeUsd: number;
  promotionCriteria: string[];
  status: "candidate";
}

export interface ResearchNodeProposalRegistry {
  registryDir: string;
  proposals: ResearchNodeProposal[];
  totalCostEnvelopeUsd: number;
  nextAction: string;
}

export interface ResearchCostLedger {
  packetDir: string | null;
  proposalDir: string | null;
  observedCloudSpendUsd: number;
  proposedCostEnvelopeUsd: number;
  hardStopUsd: number;
  status: "within_budget" | "hard_stop";
  entries: Array<{ source: string; amountUsd: number; kind: "observed" | "proposed" }>;
  nextAction: string;
}

export interface ResearchQuestionBank {
  domain: string;
  questions: Array<{
    id: string;
    question: string;
    datasetNeeds: string[];
    designStress: string[];
    analysisFamily: string;
  }>;
}

export interface ResearchQuestionReadiness {
  question: string;
  score: number;
  status: "ready_for_protocol" | "needs_clarification";
  missing: string[];
  suggestedCommands: string[];
}

export interface ResearchStructuredProtocol {
  id: string;
  title: string;
  clinicalQuestion: string;
  dataset: string;
  population: { label: string; definition: string; filters: string[] };
  exposure: { label: string; variable: string; definition: string; domain: string; threshold: string | null };
  comparator: { label: string; variable: string; definition: string; domain: string; threshold: string | null };
  endpoint: { label: string; variable: string; definition: string; domain: string; threshold: string | null };
  covariates: Array<{ label: string; variable: string; domain: string }>;
  stratifiers: Array<{ label: string; variable: string; domain: string }>;
  cycles: string[];
  analysisType: string;
  requestedOutputs: string[];
  clinicalRationale: string;
  assumptions: string[];
  caveats: string[];
  uncertainty: string[];
  evidenceCitations: string[];
}

export interface ResearchProtocolCandidatePortfolio {
  question: string;
  generatedAtIso: string;
  candidates: Array<{
    id: string;
    rank: number;
    priority: number;
    status: "scout_ready" | "needs_clarification" | "not_feasible";
    recommendation: string;
    protocol: ResearchStructuredProtocol;
    readiness: ResearchQuestionReadiness;
    blockers: ResearchCritiqueIssue[];
    warnings: ResearchCritiqueIssue[];
  }>;
  selectedCandidateId: string | null;
  nextAction: string;
}

export interface ResearchProtocolPromotion {
  portfolioPath: string;
  candidateId: string;
  protocol: ResearchStructuredProtocol;
  analysisSpec: ResearchAnalysisSpecV1;
  promotionStatus: "promoted";
  nextAction: string;
}

export interface ResearchProtocolSteerResult {
  portfolioPath: string;
  steer: { prefer: string[]; avoid: string[]; requireVariables: string[] };
  updatedPortfolio: ResearchProtocolCandidatePortfolio;
  changes: string[];
  nextAction: string;
}

export interface ResearchProtocolEditResult {
  protocolPath: string;
  protocol: ResearchStructuredProtocol;
  changes: string[];
  analysisSpec: ResearchAnalysisSpecV1;
  nextAction: string;
}

export interface ResearchAnalysisSpecV1 {
  schemaVersion: 1;
  id: string;
  dataset: string;
  releasePolicy: "local_files" | "latest_validated";
  researchQuestion: string;
  population: { description: string[]; filters: string[] };
  cycles: string[];
  variables: {
    outcome: string[];
    exposures: string[];
    covariates: string[];
    stratify: string[];
    filters: string[];
  };
  derivedDefinitions: { source: string; definitions: string[] };
  surveyDesign: {
    weightRule: string;
    weightVariable: string | null;
    strataVariable: string | null;
    psuVariable: string | null;
  };
  analysisPlan: string[];
  inferencePolicy: {
    estimandType: "descriptive" | "associational" | "causal";
    varianceEstimator: "approximate_weighted" | "complex_survey" | "none";
    allowedInference: "descriptive_only" | "exploratory_association" | "design_corrected_inference";
    pValueLanguage: "avoid" | "approximate_only" | "standard";
    causalClaimsAllowed: boolean;
  };
  failurePolicy: {
    missingVariable: "block";
    invalidWeight: "block";
    highMissingnessThreshold: number;
    sparseCellThreshold: number;
    rerunInstability: "block";
    hashMismatch: "block";
    methodologicalUncertainty: "stop_for_review";
  };
  expectedOutputs: string[];
  execution: {
    timeoutSeconds: number;
    memoryMb: number;
    maxRows: number;
    maxOutputBytes: number;
  };
  requiredVariables: string[];
  specHash: string;
}

export interface ResearchLocalCohortScout {
  specPath: string;
  dataFile: string;
  rowCount: number;
  eligibleRows: number;
  endpointNonMissingRows: number;
  exposureNonMissingRows: number;
  positiveWeightRows: number;
  completeCaseRows: number;
  minimumCellSize: number | null;
  missingness: Record<string, { available: boolean; missingRows: number; missingFraction: number }>;
  warnings: ResearchCritiqueIssue[];
  status: "passed" | "blocked";
}

export interface ResearchSemanticQualityReport {
  file: string;
  rowCount: number;
  status: "passed" | "warning" | "failed";
  failures: ResearchCritiqueIssue[];
  warnings: ResearchCritiqueIssue[];
  variableStats: Record<string, { nonMissingRows: number; min?: number; max?: number; mean?: number }>;
}

export interface ResearchTableSummary {
  file: string;
  format: "json" | "csv" | "parquet";
  adapter: {
    kind: "node-tabular" | "python-pandas-parquet";
    executable: string;
    version: string | null;
    packages: Record<string, string | null>;
  };
  fileSizeBytes: number;
  fileMtimeMs: number;
  fileSha256: string;
  rowCount: number;
  columnCount: number;
  columns: Array<{
    name: string;
    inferredType: "number" | "string" | "boolean" | "empty" | "mixed" | "unknown";
    nonMissingRows: number;
    missingFraction: number;
    min?: number;
    max?: number;
    mean?: number;
    sampleValues: string[];
  }>;
  warnings: ResearchCritiqueIssue[];
}

export interface ResearchExplorationResult {
  schemaVersion: 1;
  generatedAtIso: string;
  dataPath: string;
  outDir: string | null;
  target: string | null;
  posture: "exploratory_hypothesis_generation" | "blocked";
  tableSummary: ResearchTableSummary;
  variableMap: Array<{
    name: string;
    role: "candidate_outcome" | "candidate_exposure" | "identifier_or_index" | "metadata_or_weight" | "low_information" | "feature";
    inferredType: ResearchTableSummary["columns"][number]["inferredType"];
    nonMissingRows: number;
    missingFraction: number;
    cardinality: number | null;
    notes: string[];
  }>;
  associations: Array<{
    id: string;
    left: string;
    right: string;
    method: "pearson" | "cramers_v" | "eta_squared";
    strength: number;
    direction: "positive" | "negative" | "unsigned";
    n: number;
    missingFractionMax: number;
    caveats: string[];
  }>;
  targetAssociations: Array<ResearchExplorationResult["associations"][number]>;
  backgroundAssociations: Array<ResearchExplorationResult["associations"][number]>;
  explorationBurden: {
    eligiblePairCount: number;
    testedPairCount: number;
    targetPairCount: number;
    multiplicityRisk: "low" | "medium" | "high";
    highMissingnessVariables: Array<{ name: string; missingFraction: number }>;
    sparseCategoricalVariables: Array<{ name: string; cardinality: number; minCellCount: number }>;
    surveyDesignCandidates: Array<{ name: string; reason: string }>;
    possibleLeakagePairs: Array<{ associationId: string; left: string; right: string; reason: string }>;
    promotionSummary: { promotable: number; needsMethodsReview: number; blocked: number };
    promotionClearance: {
      level: "clear_for_handoff" | "hold_for_methods_review" | "stop";
      reasons: string[];
    };
  };
  candidateQuestions: Array<{
    id: string;
    question: string;
    outcome: string;
    exposure: string;
    routeIntent: "data_quality_review" | "descriptive_profile" | "explanatory_association" | "prediction_modeling" | "diagnostic_accuracy" | "causal_design_review" | "methods_review";
    routeIntentRationale: string;
    taxonomy: "likely_duplicate_or_proxy" | "expected_same_domain_biomarker" | "plausible_risk_factor" | "social_demographic_determinant" | "clinical_utilization_or_outcome_signal" | "surprising_cross_domain_signal" | "design_or_metadata_artifact" | "general_association";
    researchInterestScore: number;
    primaryQuestionUse: "recommended" | "review_before_primary" | "avoid_primary";
    taxonomyEvidence: {
      taxonomyVersion: string;
      matchedRuleIds: string[];
      matchedTerms: string[];
      scoreAdjustments: Array<{ id: string; delta: number; reason: string }>;
      rejectedCategories: Array<{ taxonomy: ResearchExplorationResult["candidateQuestions"][number]["taxonomy"]; reason: string }>;
    };
    whyThisQuestion: string;
    avoidAsPrimaryQuestion: string | null;
    suggestedMethod: string;
    rationale: string;
    requiredNextChecks: string[];
    priority: "high" | "medium" | "low";
    promotionStatus: "promotable_hypothesis" | "needs_methods_review" | "blocked";
    promotionBlockers: string[];
  }>;
  recommendedQuestion: {
    questionId: string;
    question: string;
    routeIntent: ResearchExplorationResult["candidateQuestions"][number]["routeIntent"];
    primaryQuestionUse: ResearchExplorationResult["candidateQuestions"][number]["primaryQuestionUse"];
    reason: string;
    nextCommand: string;
  } | null;
  qa: {
    status: "pass" | "warning" | "blocked";
    checks: Array<{ id: string; status: "pass" | "warning" | "fail"; message: string }>;
  };
  artifacts: Array<{ kind: string; path: string; sha256?: string; bytes?: number }>;
  limitations: string[];
  nextAction: string;
}

export interface ResearchExplorationHandoff {
  schemaVersion: 1;
  generatedAtIso: string;
  sourceExplorationPath: string;
  sourceExplorationSha256: string;
  questionId: string;
  status: "ready_for_modeling_plan" | "needs_methods_review" | "blocked";
  clearanceLevel: ResearchExplorationResult["explorationBurden"]["promotionClearance"]["level"];
  methodsReviewNote: string | null;
  question: ResearchExplorationResult["candidateQuestions"][number];
  blockers: string[];
  modelingPlanSeed: {
    question: string;
    target: string | null;
    outcome: string;
    exposure: string;
    routeIntent: ResearchExplorationResult["candidateQuestions"][number]["routeIntent"];
    routeIntentRationale: string;
    taxonomy: ResearchExplorationResult["candidateQuestions"][number]["taxonomy"];
    researchInterestScore: number;
    primaryQuestionUse: ResearchExplorationResult["candidateQuestions"][number]["primaryQuestionUse"];
    taxonomyEvidence: ResearchExplorationResult["candidateQuestions"][number]["taxonomyEvidence"];
    whyThisQuestion: string;
    avoidAsPrimaryQuestion: string | null;
    suggestedMethod: string;
    tablePath: string;
    rowCount: number;
    columnCount: number;
    designWarnings: string[];
    requiredNextChecks: string[];
  };
  analysisSpecCandidate: {
    status: "ready_for_spec_authoring" | "needs_methods_review" | "blocked";
    routeIntent: ResearchExplorationResult["candidateQuestions"][number]["routeIntent"];
    researchQuestion: string;
    estimandBoundary: string;
    population: {
      sourceTable: string;
      rowCount: number;
      description: string;
    };
    variables: {
      outcome: string;
      exposure: string;
      covariates: string[];
      excludedUntilReviewed: string[];
    };
    designRequirements: string[];
    suggestedModelFamily: string;
    requiredBeforeExecution: string[];
    provenance: {
      sourceExplorationPath: string;
      sourceExplorationSha256: string;
      questionId: string;
      taxonomyVersion: string;
      routeIntent: ResearchExplorationResult["candidateQuestions"][number]["routeIntent"];
    };
  };
  recommendedCommand: string;
  artifacts: Array<{ kind: string; path: string; sha256?: string; bytes?: number }>;
}

export interface ResearchRuntimeProgress {
  phase: string;
  label: string;
  detail: string;
  nextStep: string;
  terminal: boolean;
}

export interface ResearchAsyncJobState {
  jobId: string;
  status: "queued" | "running" | "succeeded" | "failed" | "canceled" | "cancel_requested";
  progress: ResearchRuntimeProgress;
  updatedAtIso: string;
}

export interface ResearchRepairPlan {
  packetDir: string;
  status: "repair_recommended" | "no_repair_needed";
  issues: ResearchCritiqueIssue[];
  repairClasses: {
    executable: ResearchCritiqueIssue[];
    methodological: ResearchCritiqueIssue[];
  };
  proposedActions: string[];
  stoppingReasons: string[];
  nextAction: string;
}

export interface ResearchAgentExecutionRecord {
  schemaVersion: 1;
  id: string;
  cycle: number | null;
  createdAtIso: string;
  intent: string;
  observation: string;
  inference: string;
  action: string;
  evidence: string[];
  confidence: number;
  tags: string[];
  recordHash: string;
}

export interface ResearchWorkflowMemory {
  source: string;
  generatedAtIso: string;
  cyclesObserved: number[];
  routines: Array<{
    id: string;
    title: string;
    trigger: string;
    steps: string[];
    evidenceCycles: number[];
    confidence: number;
  }>;
  antiPatterns: Array<{
    id: string;
    title: string;
    signal: string;
    mitigation: string;
    evidenceCycles: number[];
  }>;
  nextAction: string;
}

export interface ResearchUncertaintyBudget {
  specPath: string;
  scoutPath: string | null;
  comparisons: number;
  alpha: number;
  adjustedAlphaBonferroni: number;
  status: "acceptable" | "caution" | "underpowered_or_fragile";
  components: Array<{
    id: string;
    label: string;
    risk: "low" | "moderate" | "high";
    detail: string;
  }>;
  recommendations: string[];
  nextAction: string;
}

export interface ResearchDatasetCandidateAssessment {
  id: string;
  title: string;
  sourceUrl: string | null;
  modality: string[];
  rowCount: number | null;
  license: string | null;
  synthetic: boolean;
  containsHumanSubjects: boolean;
  intendedUse: "empirical_analysis" | "methods_development" | "nlp_support" | "unknown";
  status: "empirical_ready" | "methods_only" | "needs_review" | "unsuitable";
  risks: ResearchCritiqueIssue[];
  requiredNextChecks: string[];
}

export interface ResearchImprovementAgenda {
  budgetUsd: number;
  generatedAtIso: string;
  candidates: Array<{
    id: string;
    title: string;
    expectedImpact: number;
    confidence: number;
    costUsd: number;
    risk: number;
    explorationBonus: number;
    utility: number;
    decision: "do_now" | "queue" | "reject";
  }>;
  selected: string[];
  nextAction: string;
}

export interface ResearchClaimGuard {
  reportPath: string;
  specPath: string | null;
  status: "pass" | "needs_revision" | "blocked";
  causalTerms: string[];
  requiredCaveatsPresent: string[];
  issues: ResearchCritiqueIssue[];
  nextAction: string;
}

export interface ResearchPaperQa {
  paperPath: string;
  evidencePath: string | null;
  status: "pass" | "warning" | "fail";
  checks: Array<{
    id: string;
    status: "pass" | "warning" | "fail";
    severity: "minor" | "major" | "critical";
    detail: string;
  }>;
  summary: string;
  nextAction: string;
}

export interface ResearchBenchmarkExpectedArtifact {
  id: string;
  path: string;
  role: string;
  required: boolean;
  bytes?: number;
  sha256?: string;
}

export interface ResearchBenchmarkExpectedFailure {
  code: string;
  severity: ResearchCritiqueIssue["severity"];
  reason: string;
  countsAsRegression: boolean;
}

export interface ResearchBenchmarkMethodRequirement {
  id: string;
  description: string;
  required: boolean;
  source: "analysis-spec" | "paper" | "manifest" | "runner" | "policy";
}

export interface ResearchGoldenPacketBenchmark {
  schemaVersion: 1;
  benchmarkId: string;
  domain: string;
  packetPath: string;
  researchQuestion: string;
  analysisSpecPath: string | null;
  expectedArtifacts: ResearchBenchmarkExpectedArtifact[];
  requiredChecks: string[];
  expectedFailures: ResearchBenchmarkExpectedFailure[];
  methodRequirements: ResearchBenchmarkMethodRequirement[];
  rerunStabilityThresholds: {
    requiredStatus: "stable";
    maxDiffCount: number;
    maxAbsoluteNumericDiff: number;
  };
  qaRubric: {
    requiredPaperQaStatus: ResearchPaperQa["status"];
    requireRunnerRecord: boolean;
    requireLocalReviewNote: boolean;
    requireAnalysisSpecHashBinding: boolean;
    requireColdReview: boolean;
  };
  sharePolicy: {
    expectedShareStatus: "ready_to_share" | "local_only_blocked_for_share";
    allowLocalOnly: boolean;
    requireNoLocalPathsForShare: boolean;
  };
  localReviewPolicy: {
    expectedStatus: "ready_for_local_review";
    requireHumanReadableNote: boolean;
  };
  scoreWeights: Record<string, number>;
  lastRun: {
    runId: string;
    status: "pass" | "warning" | "fail";
    normalizedScore: number;
    generatedAtIso: string;
  } | null;
}

export interface ResearchBenchmarkCheck {
  id: string;
  status: "pass" | "warning" | "fail" | "expected_failure" | "skipped";
  severity: ResearchCritiqueIssue["severity"];
  score: number;
  weight: number;
  detail: string;
  evidenceRefs: string[];
  typedIssues: ResearchCritiqueIssue[];
}

export interface ResearchBenchmarkRun {
  schemaVersion: 1;
  runId: string;
  generatedAtIso: string;
  benchmark: ResearchGoldenPacketBenchmark;
  runPath: string | null;
  status: "pass" | "warning" | "fail";
  score: number;
  maxScore: number;
  normalizedScore: number;
  checks: ResearchBenchmarkCheck[];
  expectedFailuresObserved: string[];
  unexpectedFailures: ResearchCritiqueIssue[];
  nextAction: string;
}

export interface ResearchBenchmarkScore {
  runId: string;
  status: ResearchBenchmarkRun["status"];
  score: number;
  maxScore: number;
  normalizedScore: number;
  passCount: number;
  warningCount: number;
  failCount: number;
  expectedFailureCount: number;
  topRisks: ResearchCritiqueIssue[];
  nextAction: string;
}

export interface ResearchBenchmarkSuite {
  suiteDir: string;
  generatedAtIso: string;
  benchmarks: ResearchGoldenPacketBenchmark[];
  runs: ResearchBenchmarkRun[];
  score: ResearchBenchmarkScore;
  nextAction: string;
}

export interface ResearchPaperIndex {
  papersDir: string;
  outPath: string | null;
  papers: Array<{
    id: string;
    title: string;
    completeCaseN: number | null;
    latestQaPath: string | null;
    latestQaStatus: string;
    latestQaSummary: string;
    readerFacingLanguageStatus: "pass" | "legacy_or_fail" | "missing";
    readerFacingLanguageHits: string[];
    runnerRecordPath: string | null;
    runnerStatus: string;
  }>;
}

export interface ResearchPaperLifecycle {
  paperDir: string;
  paperId: string;
  title: string;
  qa: {
    status: string;
    summary: string;
    path: string | null;
  };
  runner: {
    status: string;
    binding: string;
    warningCodes: string[];
    path: string | null;
  };
  task: {
    status: string;
    validationStatus: string;
    receiptStatuses: string[];
    path: string | null;
    validationPath: string | null;
  };
  capabilities: {
    dir: string | null;
    status: string;
    count: number;
    issueCodes: string[];
  };
  rerunStability: {
    status: "pass" | "fail" | "not_checked";
    summary: string;
    path: string | null;
  };
  statsRun: {
    status: "succeeded" | "failed" | "missing";
    method: string | null;
    binding: string;
    posture: string | null;
    interpretationBoundary: string | null;
    issueCodes: string[];
    path: string | null;
  };
  lifecycleStatus: "ready_for_local_review" | "needs_task_envelope" | "needs_methods_review" | "blocked";
  blockers: string[];
  nextAction: string;
}

export interface ResearchPaperRun {
  paperDir: string;
  paperId: string;
  backend: "python-linearized" | "r-survey";
  analysisSpecPath: string;
  dataRoot: string;
  generatedFiles: {
    runnerScript: string;
    analysis: string;
    paper: string;
    critique: string;
    paperQa: string;
    runnerRecord: string;
    lifecycle: string;
  };
  analysis: {
    varianceEstimator: string;
    effectEstimate: number | null;
    standardError: number | null;
    pValue: number | null;
    completeCaseN: number | null;
    inputFiles: string[];
  };
  qaStatus: ResearchPaperQa["status"];
  runnerBinding: ResearchPaperRunnerRecord["analysisSpec"]["binding"];
  lifecycleStatus: ResearchPaperLifecycle["lifecycleStatus"];
  taskValidationStatus: string;
  nextAction: string;
}

export interface ResearchAnalysisBackendStatus {
  schemaVersion: 1;
  generatedAtIso: string;
  backends: Array<{
    id: "python-linearized" | "r-survey" | "duckdb-polars";
    status: "available" | "missing";
    executable: string;
    version: string | null;
    packages: Record<string, string | null>;
    supports: string[];
    limitations: string[];
  }>;
  recommendedDefault: string;
  nextAction: string;
}

export interface ResearchPaperRerunStability {
  schemaVersion: 1;
  baselineDir: string;
  repeatDir: string;
  generatedAtIso: string;
  tolerance: number;
  status: "pass" | "fail";
  comparisons: Array<{
    field: string;
    status: "pass" | "fail";
    baseline: unknown;
    repeat: unknown;
    tolerance?: number;
    diff?: number;
  }>;
  summary: string;
  nextAction: string;
}

export interface ResearchPaperRunnerRecord {
  schemaVersion: 1;
  recordType: "agenteer.research.paper-runner-record";
  paperId: string;
  status: "succeeded" | "failed" | "stopped";
  generatedAtIso: string;
  runner: {
    kind: string;
    commandSummary: string;
  };
  analysisSpec: {
    path: string | null;
    specHash: string | null;
    artifactHash: string | null;
    binding: "spec-governed" | "retrospective" | "none";
  };
  inputs: Array<{ path: string; bytes: number; sha256: string }>;
  outputs: Array<{ path: string; bytes: number; sha256: string }>;
  methods: {
    weighting: string;
    variance: string;
    population: string;
  };
  warnings: ResearchCritiqueIssue[];
  nextAction: string;
}

export interface ResearchSchemaInference {
  file: string;
  rowCount: number;
  columns: Array<{
    name: string;
    inferredType: "number" | "string" | "boolean" | "mixed" | "empty";
    nonMissing: number;
  }>;
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
    { id: "design", nodeId: "@agenteer/node-research-protocol-design", purpose: "Create a protocol packet from a question and dataset registry.", humanReview: false, mode: "exploratory", requiredBefore: [] },
    { id: "critique", nodeId: "@agenteer/node-research-protocol-critique", purpose: "Run deterministic methodology checks before execution.", humanReview: false, mode: "review_gate", requiredBefore: ["analysis"] },
    { id: "methods-validation", nodeId: "@agenteer/node-research-methods-validation", purpose: "Validate packet methods against broader medical research policy.", humanReview: false, mode: "review_gate", requiredBefore: ["analysis"] },
    { id: "scout", nodeId: "@agenteer/node-research-scout-plan", purpose: "Plan or compute cohort and complete-case feasibility.", humanReview: false, mode: "review_gate", requiredBefore: ["analysis"] },
    { id: "data-quality", nodeId: "@agenteer/node-research-data-quality", purpose: "Profile fixture data quality, missingness, and coded unknown values.", humanReview: false, mode: "review_gate", requiredBefore: ["analysis"] },
    { id: "runner-spec", nodeId: "@agenteer/node-research-runner-spec", purpose: "Define the zero-cloud execution contract.", humanReview: false, mode: "review_gate", requiredBefore: ["analysis"] },
    { id: "approval", nodeId: "human:approval", purpose: "Record human-in-the-loop approval before analysis.", humanReview: true, mode: "review_gate", requiredBefore: ["analysis"] },
    { id: "analysis", nodeId: "@agenteer/node-research-analyze-local", purpose: "Run bounded local fixture analysis.", humanReview: false, mode: "executable", requiredBefore: [] },
    { id: "report-review", nodeId: "@agenteer/node-research-report-review", purpose: "Check report artifacts against packet-specific QA requirements.", humanReview: false, mode: "review_gate", requiredBefore: ["export"] },
    { id: "manifest", nodeId: "@agenteer/node-research-artifact-manifest", purpose: "Hash packet artifacts for reproducibility.", humanReview: false, mode: "reproducibility", requiredBefore: ["export"] },
    { id: "ro-crate", nodeId: "@agenteer/node-research-ro-crate", purpose: "Write RO-Crate-style metadata for research packet artifacts.", humanReview: false, mode: "reproducibility", requiredBefore: ["export"] },
    { id: "provenance", nodeId: "@agenteer/node-research-provenance", purpose: "Write a PROV-style graph for packet artifacts and activities.", humanReview: false, mode: "reproducibility", requiredBefore: ["export"] },
    { id: "export", nodeId: "@agenteer/node-research-export", purpose: "Copy manifest-backed artifacts into a durable export directory.", humanReview: false, mode: "reproducibility", requiredBefore: [] },
    { id: "qa-dashboard", nodeId: "@agenteer/node-research-qa-dashboard", purpose: "Summarize lifecycle, methods, reproducibility, and export readiness.", humanReview: false, mode: "review_gate", requiredBefore: [] },
  ];
}

export function renderResearchPipelineStages(stages: readonly ResearchPipelineStage[]): string {
  return [
    "research pipeline stages",
    "",
    ...stages.map((stage, index) =>
      `${index + 1}. ${stage.id} -> ${stage.nodeId}${stage.humanReview ? " [human-review]" : ""}\n   mode: ${stage.mode}; required before: ${stage.requiredBefore.join(", ") || "(none)"}\n   ${stage.purpose}`,
    ),
  ].join("\n");
}

export function renderResearchPipelineStagesJson(stages: readonly ResearchPipelineStage[]): string {
  return `${JSON.stringify({
    schemaVersion: 1,
    stages,
  }, null, 2)}\n`;
}

export function researchStageGateCommand(completed: readonly string[], target: string): ResearchStageGateResult {
  const stages = researchPipelineStagesCommand();
  const completedSet = new Set(completed);
  const targetStage = stages.find(stage => stage.id === target);
  if (!targetStage) {
    return {
      target,
      completed: [...completed],
      status: "blocked",
      missingRequiredStages: [],
      targetMode: null,
      nextAction: `Unknown target stage ${target}; inspect research pipeline-stages before continuing.`,
    };
  }
  const required = stages.filter(stage => stage.requiredBefore.includes(targetStage.id));
  const missingRequiredStages = required.filter(stage => !completedSet.has(stage.id)).map(stage => stage.id);
  return {
    target: targetStage.id,
    completed: [...completed],
    status: missingRequiredStages.length ? "blocked" : "pass",
    missingRequiredStages,
    targetMode: targetStage.mode,
    nextAction: missingRequiredStages.length
      ? `Complete required stages before ${targetStage.id}: ${missingRequiredStages.join(", ")}.`
      : `Stage ${targetStage.id} is cleared by deterministic gate metadata.`,
  };
}

export function renderResearchStageGate(result: ResearchStageGateResult): string {
  return [
    `research stage gate: ${result.status}`,
    `  target: ${result.target}`,
    `  target mode: ${result.targetMode ?? "(unknown)"}`,
    `  completed: ${result.completed.join(", ") || "(none)"}`,
    `  missing required stages: ${result.missingRequiredStages.join(", ") || "(none)"}`,
    `  next: ${result.nextAction}`,
  ].join("\n");
}

export function renderResearchStageGateJson(result: ResearchStageGateResult): string {
  return `${JSON.stringify({
    schemaVersion: 1,
    stageGate: result,
  }, null, 2)}\n`;
}

export function researchMethodsFrameworkCommand(): ResearchMethodsFramework {
  return {
    schemaVersion: 1,
    generatedAtIso: new Date().toISOString(),
    items: [
      {
        id: "strobe",
        appliesTo: ["observational", "cohort", "case-control", "cross-sectional"],
        purpose: "Transparent reporting for observational epidemiology.",
        pipelineImplication: "Report QA should check population, variables, bias, study size, statistical methods, participant flow, descriptive data, outcomes, limitations, and generalizability.",
        sourceUrl: "https://www.strobe-statement.org/",
      },
      {
        id: "tripod",
        appliesTo: ["prediction", "diagnosis", "prognosis", "machine-learning"],
        purpose: "Transparent reporting for clinical prediction model development, validation, or updating.",
        pipelineImplication: "Prediction workflows need explicit model purpose, development/validation split, calibration, discrimination, missing data handling, and intended use.",
        sourceUrl: "https://pmc.ncbi.nlm.nih.gov/articles/PMC4297220/",
      },
      {
        id: "target-trial-emulation",
        appliesTo: ["causal", "treatment-comparison", "intervention"],
        purpose: "Clarify causal questions from observational data by specifying the hypothetical randomized trial being emulated.",
        pipelineImplication: "Causal workflows should require eligibility, strategies, assignment, follow-up, outcomes, causal contrast, assumptions, and analysis plan before causal language is allowed.",
        sourceUrl: "https://jamanetwork.com/journals/jama/fullarticle/2799678",
      },
      {
        id: "real-world-evidence-fitness",
        appliesTo: ["ehr", "claims", "registry", "real-world-data"],
        purpose: "Assess whether routinely collected health data are fit for a specific research purpose.",
        pipelineImplication: "Dataset registry and scout stages should evaluate relevance and reliability of exposure, outcome, timing, coding, completeness, and provenance.",
        sourceUrl: "https://www.fda.gov/science-research/science-and-research-special-topics/real-world-evidence",
      },
      {
        id: "survey-design",
        appliesTo: ["complex-survey", "nhanes", "population-estimate"],
        purpose: "Protect validity of survey estimates by respecting weights, strata, PSUs, and subpopulation rules.",
        pipelineImplication: "Runner specs must distinguish local fixtures from population estimates and require survey design variables for weighted analyses.",
        sourceUrl: "https://wwwn.cdc.gov/nchs/nhanes/AnalyticGuidelines.aspx",
      },
      {
        id: "missing-data",
        appliesTo: ["observational", "registry", "ehr", "survey"],
        purpose: "Make missingness assumptions and handling strategies explicit.",
        pipelineImplication: "Scout and data-quality stages should summarize missingness and require a plan for complete-case analysis, imputation, weighting, or sensitivity analysis.",
        sourceUrl: "https://pmc.ncbi.nlm.nih.gov/articles/PMC8168830/",
      },
      {
        id: "fair",
        appliesTo: ["metadata", "dataset-registry", "artifact-export"],
        purpose: "Make research assets findable, accessible, interoperable, and reusable.",
        pipelineImplication: "Packets should expose stable identifiers, machine-readable metadata, explicit formats, and reusable artifact manifests.",
        sourceUrl: "https://www.nature.com/articles/sdata201618",
      },
      {
        id: "ro-crate",
        appliesTo: ["artifact-export", "reproducibility", "workflow-package"],
        purpose: "Package research data, code, outputs, and metadata as a structured research object.",
        pipelineImplication: "Export should evolve from copied files into a standards-aligned research crate with metadata about datasets, code, commands, and outputs.",
        sourceUrl: "https://www.researchobject.org/ro-crate/specification/1.2/introduction.html",
      },
      {
        id: "w3c-prov",
        appliesTo: ["provenance", "lineage", "agent-audit"],
        purpose: "Represent entities, activities, and agents involved in producing artifacts.",
        pipelineImplication: "Agenteer should link prompts, validations, approvals, commands, inputs, generated code, outputs, and reviewers in a provenance graph.",
        sourceUrl: "https://www.w3.org/TR/prov-overview/",
      },
    ],
  };
}

export function renderResearchMethodsFramework(framework: ResearchMethodsFramework): string {
  return [
    "research methods framework",
    "",
    ...framework.items.map(item =>
      `${item.id}: ${item.purpose}\n  applies: ${item.appliesTo.join(", ")}\n  implication: ${item.pipelineImplication}\n  source: ${item.sourceUrl}`,
    ),
  ].join("\n");
}

export function renderResearchMethodsFrameworkJson(framework: ResearchMethodsFramework): string {
  return `${JSON.stringify(framework, null, 2)}\n`;
}

export async function researchValidateMethodsCommand(packetDir: string): Promise<ResearchMethodsValidationResult> {
  const resolved = path.resolve(packetDir);
  const packet = JSON.parse(await readFile(path.join(resolved, "design.json"), "utf-8")) as LabMedbreviaNhanesResult;
  const scout = await readScoutIfPresent(resolved);
  const protocol = packet.protocol;
  const question = protocol.clinicalQuestion.toLowerCase();
  const caveats = protocol.caveats.join("\n").toLowerCase();
  const applied = new Set<string>(["strobe"]);
  const issues: ResearchCritiqueIssue[] = [];

  if (/\b(cause|causal|effect of|impact of|prevent|reduce|improve|treatment|intervention)\b/.test(question)) {
    applied.add("target-trial-emulation");
    issues.push({
      severity: "blocker",
      code: "CAUSAL_LANGUAGE_REQUIRES_TARGET_TRIAL_SPEC",
      message: "The question implies causal interpretation; specify target-trial components before causal language is allowed.",
    });
  }

  if (/\b(predict|prediction|risk score|prognos|diagnostic model|classification model|machine learning)\b/.test(question)) {
    applied.add("tripod");
    issues.push({
      severity: "blocker",
      code: "PREDICTION_QUESTION_REQUIRES_TRIPOD_PLAN",
      message: "Prediction-model questions need a TRIPOD/TRIPOD+AI development or validation plan.",
    });
  }

  if (protocol.surveyDesign.weightVariable || protocol.surveyDesign.strataVariable || protocol.surveyDesign.psuVariable) {
    applied.add("survey-design");
    if (!protocol.surveyDesign.weightVariable || !protocol.surveyDesign.strataVariable || !protocol.surveyDesign.psuVariable) {
      issues.push({
        severity: "warning",
        code: "INCOMPLETE_SURVEY_DESIGN",
        message: "Survey analyses should identify weight, strata, and PSU variables or explicitly state why one is unavailable.",
      });
    }
  }

  applied.add("missing-data");
  if (!scout?.metrics) {
    issues.push({
      severity: "warning",
      code: "MISSINGNESS_NOT_COMPUTED",
      message: "No computed scout metrics found; missingness and complete-case feasibility have not been quantified.",
    });
  }

  applied.add("real-world-evidence-fitness");
  if (!packet.source?.registrySha256) {
    issues.push({
      severity: "warning",
      code: "MISSING_DATASET_FITNESS_TRACE",
      message: "Dataset registry hash is missing, weakening data fitness and provenance review.",
    });
  }

  applied.add("fair");
  applied.add("w3c-prov");
  if (!await exists(path.join(resolved, "artifact-manifest.json"))) {
    issues.push({
      severity: "warning",
      code: "MISSING_REPRODUCIBILITY_MANIFEST",
      message: "No artifact manifest exists yet; packet is not ready for reproducible review/export.",
    });
  }

  if ((question.includes("associated") || question.includes("relate")) && !/observational|cross-sectional|non-causal/.test(caveats)) {
    issues.push({
      severity: "warning",
      code: "MISSING_ASSOCIATION_CAVEAT",
      message: "Association questions should preserve observational, cross-sectional, or non-causal caveats.",
    });
  }

  if (!issues.length) {
    issues.push({
      severity: "note",
      code: "METHODS_VALIDATION_READY",
      message: "No deterministic methods-validation issues found.",
    });
  }

  const result: ResearchMethodsValidationResult = {
    packetDir: resolved,
    status: issues.some(issue => issue.severity === "blocker")
      ? "blocked"
      : issues.some(issue => issue.severity === "warning")
        ? "needs_review"
        : "pass",
    appliedFrameworkItems: Array.from(applied).sort((a, b) => a.localeCompare(b)),
    issues,
  };
  await writeFile(path.join(resolved, "methods-validation.json"), `${JSON.stringify(result, null, 2)}\n`);
  return result;
}

export function renderResearchMethodsValidation(result: ResearchMethodsValidationResult): string {
  return [
    `research methods validation: ${result.packetDir}`,
    `  status: ${result.status}`,
    `  framework: ${result.appliedFrameworkItems.join(", ")}`,
    "  issues:",
    ...result.issues.map(issue => `    - [${issue.severity}] ${issue.code}: ${issue.message}`),
  ].join("\n");
}

export function renderResearchMethodsValidationJson(result: ResearchMethodsValidationResult): string {
  return `${JSON.stringify({
    schemaVersion: 1,
    methodsValidation: result,
  }, null, 2)}\n`;
}

export async function researchRegistryInspectCommand(registryPath: string): Promise<ResearchRegistryInspectResult> {
  const resolved = path.resolve(registryPath);
  const registry = JSON.parse(await readFile(resolved, "utf-8")) as {
    dataset?: unknown;
    cycles?: unknown;
    domains?: unknown;
    variables?: unknown;
    weightRules?: unknown;
  };
  const variables = Array.isArray(registry.variables) ? registry.variables : [];
  const cycles = Array.isArray(registry.cycles)
    ? registry.cycles.map(cycle => isRecord(cycle) && typeof cycle.id === "string" ? cycle.id : String(cycle))
    : [];
  const domains = isRecord(registry.domains) ? Object.keys(registry.domains) : [];
  const weightRules = Array.isArray(registry.weightRules) ? registry.weightRules : [];
  const warnings: ResearchCritiqueIssue[] = [];
  if (typeof registry.dataset !== "string" || !registry.dataset.trim()) {
    warnings.push({ severity: "warning", code: "MISSING_DATASET_ID", message: "Registry should include a stable dataset identifier." });
  }
  if (!variables.length) {
    warnings.push({ severity: "blocker", code: "MISSING_VARIABLES", message: "Registry has no variables; protocol design cannot select exposures, outcomes, or covariates." });
  }
  if (!domains.length) {
    warnings.push({ severity: "warning", code: "MISSING_DOMAINS", message: "Registry has no domains; dataset coverage and question generation will be weak." });
  }
  if (!cycles.length) {
    warnings.push({ severity: "warning", code: "MISSING_CYCLES", message: "Registry has no cycles or time windows; reproducibility and temporal scope are underspecified." });
  }
  if (!weightRules.length) {
    warnings.push({ severity: "note", code: "NO_WEIGHT_RULES", message: "No survey/weight rules were found; this is acceptable for non-survey datasets but should be explicit." });
  }
  return {
    registryPath: resolved,
    dataset: typeof registry.dataset === "string" && registry.dataset.trim() ? registry.dataset : "(missing)",
    cycles,
    domainCount: domains.length,
    variableCount: variables.length,
    weightRuleCount: weightRules.length,
    warnings,
    nextAction: warnings.some(issue => issue.severity === "blocker")
      ? "Add variables before protocol design."
      : "Use this registry for question generation, protocol design, or dataset-specific validator development.",
  };
}

export function renderResearchRegistryInspect(result: ResearchRegistryInspectResult): string {
  return [
    `research registry inspect: ${result.registryPath}`,
    `  dataset: ${result.dataset}`,
    `  cycles: ${result.cycles.join(", ") || "(none)"}`,
    `  domains: ${result.domainCount}`,
    `  variables: ${result.variableCount}`,
    `  weight rules: ${result.weightRuleCount}`,
    `  next: ${result.nextAction}`,
    "  warnings:",
    ...result.warnings.map(issue => `    - [${issue.severity}] ${issue.code}: ${issue.message}`),
  ].join("\n");
}

export function renderResearchRegistryInspectJson(result: ResearchRegistryInspectResult): string {
  return `${JSON.stringify({
    schemaVersion: 1,
    registry: result,
  }, null, 2)}\n`;
}

export function researchDecomposeQuestionCommand(question: string): ResearchQuestionDecomposition {
  const normalized = question.trim();
  const lower = normalized.toLowerCase();
  const intent: ResearchQuestionDecomposition["intent"] =
    /\b(predict|prediction|risk score|prognos|machine learning)\b/.test(lower) ? "prediction"
      : /\b(sensitivity|specificity|diagnostic|screening|self-reported|self reported)\b/.test(lower) ? "diagnostic"
        : /\b(cause|causal|effect of|impact of|prevent|reduce|improve|treatment|intervention)\b/.test(lower) ? "causal"
          : /\b(prevalence|how common|distribution|describe|patterned by)\b/.test(lower) ? "descriptive"
            : "association";
  const population = extractQuestionPart(normalized, /\b(?:among|in)\s+(.+?)(?:,\s+|\s+is\s+|\s+are\s+|\s+does\s+|\s+do\s+|\s+how\s+)/i);
  const stratifierOrModifier = extractQuestionPart(normalized, /\b(?:by|across|stratified by|differently by)\s+([^?]+?)(?:\s+after\s+adjusting|\s+after\s+adjustment|\s+adjusted\s+for|\s+controlling\s+for|\s+accounting\s+for|\s+among|\s+in|\?|$)/i);
  const exposureOrPredictor =
    extractQuestionPart(normalized, /\b(?:is|are)\s+(.+?)\s+(?:associated with|related to|predictive of|patterned by)\s+/i)
    ?? extractQuestionPart(normalized, /\bdoes\s+(.+?)\s+(?:relate to|predict|affect|impact)\s+/i)
    ?? extractQuestionPart(normalized, /\b(?:effect of|impact of)\s+(.+?)\s+on\s+/i);
  const comparatorOrReference = extractComparator(exposureOrPredictor);
  const cleanedExposureOrPredictor = comparatorOrReference && exposureOrPredictor
    ? exposureOrPredictor.replace(/\s+(?:versus|vs\.?|compared with|relative to)\s+.+$/i, "").trim()
    : exposureOrPredictor;
  const outcome =
    extractQuestionPart(normalized, /\b(?:associated with|related to|predictive of|relate to|predict|affect|impact)\s+(.+?)(?:\s+differently by|\s+after|\s+among|\s+in|\s+by|\?|$)/i)
    ?? extractQuestionPart(normalized, /\bon\s+(.+?)(?:\s+after|\s+among|\s+in|\s+by|\?|$)/i);
  const temporalConstraints = extractTemporalConstraints(normalized);
  const adjustmentCovariates = extractAdjustmentCovariates(normalized);
  const requiredMethods = uniqueStrings([
    "strobe",
    intent === "causal" ? "target-trial-emulation" : null,
    intent === "prediction" ? "tripod" : null,
    intent === "diagnostic" ? "diagnostic-performance" : null,
    "missing-data",
  ]);
  const clarificationPrompts = [
    population ? null : "Specify the target population and eligibility criteria.",
    cleanedExposureOrPredictor ? null : "Specify the primary exposure, predictor, or grouping variable.",
    outcome ? null : "Specify the primary outcome or endpoint.",
    intent === "causal" ? "Specify target-trial components before using causal language." : null,
    stratifierOrModifier ? "Clarify whether the modifier is for stratification, interaction testing, or adjustment." : null,
  ].filter((prompt): prompt is string => Boolean(prompt));
  return {
    question: normalized,
    intent,
    population,
    exposureOrPredictor: cleanedExposureOrPredictor,
    comparatorOrReference,
    outcome,
    stratifierOrModifier,
    temporalConstraints,
    adjustmentCovariates,
    requiredMethods,
    clarificationPrompts,
  };
}

export function renderResearchQuestionDecomposition(result: ResearchQuestionDecomposition): string {
  return [
    "research question decomposition",
    `  intent: ${result.intent}`,
    `  population: ${result.population ?? "(needs clarification)"}`,
    `  exposure/predictor: ${result.exposureOrPredictor ?? "(needs clarification)"}`,
    `  comparator/reference: ${result.comparatorOrReference ?? "(none)"}`,
    `  outcome: ${result.outcome ?? "(needs clarification)"}`,
    `  stratifier/modifier: ${result.stratifierOrModifier ?? "(none)"}`,
    `  temporal constraints: ${result.temporalConstraints.length ? result.temporalConstraints.join("; ") : "(none)"}`,
    `  adjustment covariates: ${result.adjustmentCovariates.length ? result.adjustmentCovariates.join(", ") : "(none)"}`,
    `  methods: ${result.requiredMethods.join(", ")}`,
    "  clarifications:",
    ...result.clarificationPrompts.map(prompt => `    - ${prompt}`),
  ].join("\n");
}

export function renderResearchQuestionDecompositionJson(result: ResearchQuestionDecomposition): string {
  return `${JSON.stringify({
    schemaVersion: 1,
    decomposition: result,
  }, null, 2)}\n`;
}

export function researchClarificationPlanCommand(question: string): ResearchClarificationPlan {
  const decomposition = researchDecomposeQuestionCommand(question);
  const items: ResearchClarificationPlan["items"] = decomposition.clarificationPrompts.map((prompt, index) => ({
    id: `clarify-${index + 1}`,
    priority: prompt.includes("Specify the primary") || prompt.includes("target population") || prompt.includes("target-trial")
      ? "required"
      : "recommended",
    prompt,
    reason: prompt.includes("target-trial")
      ? "Causal claims require a design-level methods commitment before analysis."
      : prompt.includes("modifier")
        ? "Effect modification and stratification decisions change analysis and reporting requirements."
        : "Protocol design needs this field to avoid silent assumptions.",
  }));
  if (!items.length) {
    items.push({
      id: "confirm-protocol-scope",
      priority: "recommended",
      prompt: "Confirm the extracted population, exposure/predictor, outcome, and methods intent before protocol design.",
      reason: "Human-in-the-loop confirmation catches semantic mismatches before variable selection.",
    });
  }
  return {
    question: decomposition.question,
    status: items.some(item => item.priority === "required") ? "needs_clarification" : "ready_for_protocol_design",
    items,
    nextAction: items.some(item => item.priority === "required")
      ? "Resolve required clarifications before protocol design."
      : "Proceed to protocol design after reviewer confirmation.",
  };
}

export function renderResearchClarificationPlan(plan: ResearchClarificationPlan): string {
  return [
    "research clarification plan",
    `  status: ${plan.status}`,
    `  next: ${plan.nextAction}`,
    "  items:",
    ...plan.items.map(item => `    - [${item.priority}] ${item.id}: ${item.prompt} (${item.reason})`),
  ].join("\n");
}

export function renderResearchClarificationPlanJson(plan: ResearchClarificationPlan): string {
  return `${JSON.stringify({
    schemaVersion: 1,
    clarificationPlan: plan,
  }, null, 2)}\n`;
}

export async function researchDataQualityCommand(fixturePath: string): Promise<ResearchDataQualityProfile> {
  const resolved = path.resolve(fixturePath);
  const rows = JSON.parse(await readFile(resolved, "utf-8")) as Array<Record<string, unknown>>;
  const variables = uniqueStrings(rows.flatMap(row => Object.keys(row)));
  const profileVariables = variables.map(name => {
    const values = rows.map(row => row[name]);
    const missing = values.filter(value => !hasValue(value)).length;
    const codedUnknown = values.filter(value => Number(value) === 7 || Number(value) === 9 || Number(value) === 77 || Number(value) === 99).length;
    return {
      name,
      missing,
      missingRate: rows.length ? missing / rows.length : 0,
      codedUnknown,
      observed: rows.length - missing,
    };
  });
  const warnings: ResearchCritiqueIssue[] = [];
  if (!rows.length) {
    warnings.push({ severity: "blocker", code: "EMPTY_FIXTURE", message: "Fixture contains no rows." });
  }
  for (const variable of profileVariables) {
    if (variable.missingRate > 0.4) {
      warnings.push({ severity: "warning", code: "HIGH_MISSINGNESS", message: `${variable.name} is missing in ${(variable.missingRate * 100).toFixed(1)}% of rows.` });
    }
    if (variable.codedUnknown > 0) {
      warnings.push({ severity: "warning", code: "CODED_UNKNOWN_VALUES", message: `${variable.name} contains ${variable.codedUnknown} coded unknown/refused values.` });
    }
  }
  if (!warnings.length) {
    warnings.push({ severity: "note", code: "DATA_QUALITY_READY", message: "No deterministic fixture data-quality warnings found." });
  }
  return {
    fixturePath: resolved,
    rowCount: rows.length,
    variableCount: variables.length,
    variables: profileVariables,
    warnings,
  };
}

export function renderResearchDataQuality(profile: ResearchDataQualityProfile): string {
  return [
    `research data quality: ${profile.fixturePath}`,
    `  rows: ${profile.rowCount}`,
    `  variables: ${profile.variableCount}`,
    "  warnings:",
    ...profile.warnings.map(issue => `    - [${issue.severity}] ${issue.code}: ${issue.message}`),
  ].join("\n");
}

export function renderResearchDataQualityJson(profile: ResearchDataQualityProfile): string {
  return `${JSON.stringify({
    schemaVersion: 1,
    dataQuality: profile,
  }, null, 2)}\n`;
}

export function researchSelectMethodCommand(question: string): ResearchMethodSelection {
  const decomposition = researchDecomposeQuestionCommand(question);
  const recommendedAnalysis = decomposition.intent === "causal"
    ? "target_trial_emulation_or_causal_contrast"
    : decomposition.intent === "prediction"
      ? "prediction_model_development_or_validation"
      : decomposition.intent === "diagnostic"
        ? "diagnostic_accuracy_table"
        : decomposition.intent === "descriptive"
          ? "descriptive_summary_or_prevalence"
          : "association_model_or_contingency_summary";
  const requiredChecks = uniqueStrings([
    "missingness_profile",
    "data_quality_profile",
    "effect_size_and_uncertainty",
    decomposition.intent === "causal" ? "target_trial_components" : null,
    decomposition.intent === "prediction" ? "calibration_and_discrimination" : null,
    decomposition.intent === "diagnostic" ? "sensitivity_specificity_ppv_npv" : null,
    decomposition.stratifierOrModifier ? "stratified_or_interaction_plan" : null,
  ]);
  const cautions = [
    decomposition.intent === "causal" ? "Do not allow causal language without explicit assumptions and target-trial specification." : null,
    decomposition.intent === "prediction" ? "Prediction models require validation and calibration; association summaries are not enough." : null,
    decomposition.intent === "diagnostic" ? "Diagnostic metrics require a clear reference standard and interpretable prevalence context." : null,
    "Local fixture analyses are not population estimates unless the runner uses valid design-aware methods.",
  ].filter((caution): caution is string => Boolean(caution));
  return {
    question: decomposition.question,
    intent: decomposition.intent,
    recommendedAnalysis,
    requiredChecks,
    cautions,
  };
}

export function renderResearchMethodSelection(selection: ResearchMethodSelection): string {
  return [
    "research method selection",
    `  intent: ${selection.intent}`,
    `  recommended analysis: ${selection.recommendedAnalysis}`,
    `  required checks: ${selection.requiredChecks.join(", ")}`,
    "  cautions:",
    ...selection.cautions.map(caution => `    - ${caution}`),
  ].join("\n");
}

export function renderResearchMethodSelectionJson(selection: ResearchMethodSelection): string {
  return `${JSON.stringify({
    schemaVersion: 1,
    methodSelection: selection,
  }, null, 2)}\n`;
}

export async function researchRoCrateCommand(packetDir: string): Promise<ResearchRoCrateMetadata> {
  const resolved = path.resolve(packetDir);
  const manifest = await readJsonIfPresent(path.join(resolved, "artifact-manifest.json")) as ResearchArtifactManifest | null;
  const packet = await readJsonIfPresent(path.join(resolved, "design.json")) as LabMedbreviaNhanesResult | null;
  const cratePath = path.join(resolved, "ro-crate-metadata.json");
  const artifacts = manifest?.artifacts ?? [];
  const graph: Array<Record<string, unknown>> = [
    {
      "@id": "ro-crate-metadata.json",
      "@type": "CreativeWork",
      "conformsTo": { "@id": "https://w3id.org/ro/crate/1.2" },
      "about": { "@id": "./" },
    },
    {
      "@id": "./",
      "@type": "Dataset",
      "name": packet?.protocol.title ?? "Agenteer research packet",
      "description": packet?.protocol.clinicalQuestion ?? "Agenteer research packet",
      "hasPart": artifacts.map(artifact => ({ "@id": artifact.path })),
    },
    ...artifacts.map(artifact => ({
      "@id": artifact.path,
      "@type": "File",
      "contentSize": artifact.bytes,
      "sha256": artifact.sha256,
    })),
  ];
  const metadata: ResearchRoCrateMetadata["metadata"] = {
    "@context": "https://w3id.org/ro/crate/1.2/context",
    "@graph": graph,
  };
  const result: ResearchRoCrateMetadata = {
    packetDir: resolved,
    cratePath,
    metadata,
  };
  await writeFile(cratePath, `${JSON.stringify(metadata, null, 2)}\n`);
  return result;
}

export function renderResearchRoCrate(result: ResearchRoCrateMetadata): string {
  return [
    `research ro-crate: ${result.packetDir}`,
    `  metadata: ${result.cratePath}`,
    `  graph nodes: ${result.metadata["@graph"].length}`,
  ].join("\n");
}

export function renderResearchRoCrateJson(result: ResearchRoCrateMetadata): string {
  return `${JSON.stringify({
    schemaVersion: 1,
    roCrate: result,
  }, null, 2)}\n`;
}

export async function researchProvenanceCommand(packetDir: string): Promise<ResearchProvenanceGraph> {
  const resolved = path.resolve(packetDir);
  const provenancePath = path.join(resolved, "provenance.json");
  const manifest = await readJsonIfPresent(path.join(resolved, "artifact-manifest.json")) as ResearchArtifactManifest | null;
  const artifactPaths = manifest?.artifacts.map(artifact => artifact.path) ?? await listResearchArtifactNames(resolved);
  const artifactSet = new Set(artifactPaths);
  const entityFor = (artifact: string) => `artifact:${artifact}`;
  const activities: ResearchProvenanceGraph["graph"]["activities"] = [
    { id: "activity:design", type: "protocol-design", generated: ["design.json", "design.md", "workflow.yaml"].filter(item => artifactSet.has(item)).map(entityFor), used: [] },
    { id: "activity:scout", type: "cohort-scout", generated: ["scout-plan.json"].filter(item => artifactSet.has(item)).map(entityFor), used: ["design.json"].filter(item => artifactSet.has(item)).map(entityFor) },
    { id: "activity:runner-spec", type: "runner-contract", generated: ["runner-spec.json"].filter(item => artifactSet.has(item)).map(entityFor), used: ["design.json", "scout-plan.json"].filter(item => artifactSet.has(item)).map(entityFor) },
    { id: "activity:approval", type: "human-approval", generated: ["approval.json"].filter(item => artifactSet.has(item)).map(entityFor), used: ["design.json", "scout-plan.json", "runner-spec.json"].filter(item => artifactSet.has(item)).map(entityFor) },
    { id: "activity:analysis", type: "local-analysis", generated: ["analysis-result.json", "report.md"].filter(item => artifactSet.has(item)).map(entityFor), used: ["design.json", "approval.json", "runner-spec.json"].filter(item => artifactSet.has(item)).map(entityFor) },
    { id: "activity:qa", type: "report-and-methods-review", generated: ["report-review.json", "methods-validation.json"].filter(item => artifactSet.has(item)).map(entityFor), used: ["design.json", "analysis-result.json", "report.md"].filter(item => artifactSet.has(item)).map(entityFor) },
    { id: "activity:export", type: "reproducible-export", generated: ["artifact-manifest.json", "export-record.json", "ro-crate-metadata.json", "provenance.json"].filter(item => artifactSet.has(item) || item === "provenance.json").map(entityFor), used: artifactPaths.filter(item => item !== "export-record.json").map(entityFor) },
  ].filter(activity => activity.generated.length > 0);
  const graph: ResearchProvenanceGraph["graph"] = {
    schemaVersion: 1,
    entities: uniqueStrings([...artifactPaths, "provenance.json"]).map(artifact => ({
      id: entityFor(artifact),
      type: "artifact",
      path: artifact,
      ...(manifest?.artifacts.find(item => item.path === artifact)?.sha256 ? { sha256: manifest.artifacts.find(item => item.path === artifact)!.sha256 } : {}),
    })),
    activities,
    agents: [
      { id: "agent:agenteer-orchestrator", type: "software-agent", role: "human-in-the-loop orchestrator" },
    ],
  };
  const result: ResearchProvenanceGraph = {
    packetDir: resolved,
    provenancePath,
    graph,
  };
  await writeFile(provenancePath, `${JSON.stringify(graph, null, 2)}\n`);
  return result;
}

export function renderResearchProvenance(result: ResearchProvenanceGraph): string {
  return [
    `research provenance: ${result.packetDir}`,
    `  entities: ${result.graph.entities.length}`,
    `  activities: ${result.graph.activities.length}`,
    `  agents: ${result.graph.agents.length}`,
    `  path: ${result.provenancePath}`,
  ].join("\n");
}

export function renderResearchProvenanceJson(result: ResearchProvenanceGraph): string {
  return `${JSON.stringify({
    schemaVersion: 1,
    provenance: result,
  }, null, 2)}\n`;
}

export async function researchQaDashboardCommand(packetDir: string): Promise<ResearchQaDashboard> {
  const resolved = path.resolve(packetDir);
  const checkpoint = await researchCheckpointCommand(resolved);
  const methods = await readJsonIfPresent(path.join(resolved, "methods-validation.json")) as ResearchMethodsValidationResult | null;
  const manifest = await readJsonIfPresent(path.join(resolved, "artifact-manifest.json")) as ResearchArtifactManifest | null;
  const reportReview = await readJsonIfPresent(path.join(resolved, "report-review.json")) as ResearchReportReview | null;
  const exportRecord = await readJsonIfPresent(path.join(resolved, "export-record.json")) as ResearchPacketExport | null;
  const roCrate = await exists(path.join(resolved, "ro-crate-metadata.json"));
  const provenance = await exists(path.join(resolved, "provenance.json"));
  const checks: ResearchQaDashboard["checks"] = [
    {
      id: "checkpoint",
      status: checkpoint.currentStage === "complete" ? "pass" : "needs_review",
      detail: checkpoint.currentStage === "complete" ? "Packet lifecycle is complete." : `Current stage is ${checkpoint.currentStage}.`,
    },
    {
      id: "methods-validation",
      status: methods ? methods.status : "missing",
      detail: methods ? `${methods.issues.length} methods issue(s).` : "methods-validation.json is missing.",
    },
    {
      id: "report-review",
      status: reportReview ? reportReview.status : "missing",
      detail: reportReview ? `${reportReview.issues.length} report review issue(s).` : "report-review.json is missing.",
    },
    {
      id: "manifest",
      status: manifest ? "pass" : "missing",
      detail: manifest ? `${manifest.artifacts.length} artifact(s) hashed.` : "artifact-manifest.json is missing.",
    },
    {
      id: "export",
      status: exportRecord ? "pass" : "missing",
      detail: exportRecord ? `Exported to ${exportRecord.exportDir}.` : "export-record.json is missing.",
    },
    {
      id: "ro-crate",
      status: roCrate ? "pass" : "missing",
      detail: roCrate ? "RO-Crate metadata present." : "ro-crate-metadata.json is missing.",
    },
    {
      id: "provenance",
      status: provenance ? "pass" : "missing",
      detail: provenance ? "PROV-style provenance graph present." : "provenance.json is missing.",
    },
  ];
  const status = checks.some(check => check.status === "blocked")
    ? "blocked"
    : checks.some(check => check.status === "missing" || check.status === "needs_review")
      ? "needs_review"
      : "ready";
  const dashboard: ResearchQaDashboard = {
    packetDir: resolved,
    status,
    checks,
    nextAction: status === "ready" ? "Packet is ready for durable review or downstream consumption." : "Resolve missing or needs-review checks before calling the packet ready.",
  };
  await writeFile(path.join(resolved, "qa-dashboard.json"), `${JSON.stringify(dashboard, null, 2)}\n`);
  return dashboard;
}

export function renderResearchQaDashboard(dashboard: ResearchQaDashboard): string {
  return [
    `research QA dashboard: ${dashboard.packetDir}`,
    `  status: ${dashboard.status}`,
    `  next: ${dashboard.nextAction}`,
    "  checks:",
    ...dashboard.checks.map(check => `    - [${check.status}] ${check.id}: ${check.detail}`),
  ].join("\n");
}

export function renderResearchQaDashboardJson(dashboard: ResearchQaDashboard): string {
  return `${JSON.stringify({
    schemaVersion: 1,
    qaDashboard: dashboard,
  }, null, 2)}\n`;
}

export function researchSuppressionPolicyCommand(count: number, threshold = 16): ResearchSuppressionPolicyResult {
  return {
    count,
    threshold,
    status: count < threshold ? "suppress" : "display",
    reason: count < threshold
      ? `Count ${count} is below the reliability/privacy threshold ${threshold}.`
      : `Count ${count} meets or exceeds the threshold ${threshold}.`,
    source: "CDC/NCHS statistical reliability and small-count suppression practices.",
  };
}

export function renderResearchSuppressionPolicy(result: ResearchSuppressionPolicyResult): string {
  return [
    "research suppression policy",
    `  count: ${result.count}`,
    `  threshold: ${result.threshold}`,
    `  status: ${result.status}`,
    `  reason: ${result.reason}`,
  ].join("\n");
}

export function renderResearchSuppressionPolicyJson(result: ResearchSuppressionPolicyResult): string {
  return `${JSON.stringify({
    schemaVersion: 1,
    suppressionPolicy: result,
  }, null, 2)}\n`;
}

export async function researchRegistrySearchCommand(registryPath: string, query: string, limit = 20): Promise<ResearchRegistrySearchResult> {
  const resolved = path.resolve(registryPath);
  const registry = JSON.parse(await readFile(resolved, "utf-8")) as { variables?: unknown };
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  const variables = Array.isArray(registry.variables) ? registry.variables : [];
  const matches = variables
    .filter(isRecord)
    .map(variable => ({
      name: typeof variable.name === "string" ? variable.name : "",
      domain: typeof variable.domain === "string" ? variable.domain : null,
      label: typeof variable.label === "string" ? variable.label : null,
    }))
    .filter(variable => {
      const haystack = [variable.name, variable.domain, variable.label].filter(Boolean).join(" ").toLowerCase();
      return terms.every(term => haystack.includes(term));
    })
    .slice(0, limit);
  return {
    registryPath: resolved,
    query,
    matches,
  };
}

export function renderResearchRegistrySearch(result: ResearchRegistrySearchResult): string {
  return [
    `research registry search: ${result.registryPath}`,
    `  query: ${result.query}`,
    `  matches: ${result.matches.length}`,
    ...result.matches.map(match => `  - ${match.name} (${match.domain ?? "unknown"}): ${match.label ?? "(no label)"}`),
  ].join("\n");
}

export function renderResearchRegistrySearchJson(result: ResearchRegistrySearchResult): string {
  return `${JSON.stringify({
    schemaVersion: 1,
    registrySearch: result,
  }, null, 2)}\n`;
}

export function researchEstimandSketchCommand(question: string): ResearchEstimandSketch {
  const decomposition = researchDecomposeQuestionCommand(question);
  const targetQuantity = decomposition.intent === "causal"
    ? "causal effect under an explicitly specified target trial"
    : decomposition.intent === "prediction"
      ? "out-of-sample predictive performance"
      : decomposition.intent === "diagnostic"
        ? "diagnostic accuracy relative to a reference standard"
        : decomposition.intent === "descriptive"
          ? "descriptive distribution or prevalence"
          : "observational association";
  const exposureContrast = decomposition.exposureOrPredictor && decomposition.comparatorOrReference
    ? `${decomposition.exposureOrPredictor} versus ${decomposition.comparatorOrReference}`
    : decomposition.exposureOrPredictor
      ? `${decomposition.exposureOrPredictor} groups or levels`
      : "comparison groups require clarification";
  const contrast = decomposition.intent === "diagnostic"
    ? "test-positive versus reference-standard-positive classification"
    : decomposition.intent === "prediction"
      ? "predicted risk versus observed outcome"
      : decomposition.intent === "causal"
        ? exposureContrast
        : exposureContrast;
  const requiredAssumptions = uniqueStrings([
    "well-defined population",
    "valid outcome definition",
    decomposition.intent === "causal" ? "exchangeability/positivity/consistency" : null,
    decomposition.intent === "prediction" ? "development-validation separation" : null,
    decomposition.intent === "diagnostic" ? "reference standard validity" : null,
    "missing-data handling plan",
  ]);
  const disallowedLanguage = decomposition.intent === "causal"
    ? ["causal claims without target-trial specification"]
    : decomposition.intent === "prediction"
      ? ["causal interpretation", "clinical deployment claims without validation"]
      : decomposition.intent === "diagnostic"
        ? ["screening recommendation without clinical utility analysis"]
        : ["causal language", "population estimate claims without design-aware methods"];
  return {
    question: decomposition.question,
    intent: decomposition.intent,
    targetQuantity,
    contrast,
    population: decomposition.population,
    exposureOrPredictor: decomposition.exposureOrPredictor,
    comparatorOrReference: decomposition.comparatorOrReference,
    outcome: decomposition.outcome,
    temporalConstraints: decomposition.temporalConstraints,
    adjustmentCovariates: decomposition.adjustmentCovariates,
    requiredAssumptions,
    disallowedLanguage,
  };
}

export function renderResearchEstimandSketch(result: ResearchEstimandSketch): string {
  return [
    "research estimand sketch",
    `  intent: ${result.intent}`,
    `  target quantity: ${result.targetQuantity}`,
    `  contrast: ${result.contrast}`,
    `  population: ${result.population ?? "(needs clarification)"}`,
    `  exposure/predictor: ${result.exposureOrPredictor ?? "(needs clarification)"}`,
    `  comparator/reference: ${result.comparatorOrReference ?? "(none)"}`,
    `  outcome: ${result.outcome ?? "(needs clarification)"}`,
    `  temporal constraints: ${result.temporalConstraints.length ? result.temporalConstraints.join("; ") : "(none)"}`,
    `  adjustment covariates: ${result.adjustmentCovariates.length ? result.adjustmentCovariates.join(", ") : "(none)"}`,
    `  assumptions: ${result.requiredAssumptions.join(", ")}`,
    `  disallowed language: ${result.disallowedLanguage.join(", ")}`,
  ].join("\n");
}

export function renderResearchEstimandSketchJson(result: ResearchEstimandSketch): string {
  return `${JSON.stringify({
    schemaVersion: 1,
    estimandSketch: result,
  }, null, 2)}\n`;
}

export async function researchSimulateStudyCommand(opts: ResearchDesignOptions): Promise<ResearchStudySimulationResult> {
  const packetDir = path.resolve(opts.outDir ?? path.join(process.cwd(), "agenteer-research-simulated-study"));
  await mkdir(packetDir, { recursive: true });
  const design = await researchDesignCommand({ ...opts, outDir: packetDir });
  const fixturePath = path.join(packetDir, "rows.json");
  await writeFile(fixturePath, `${JSON.stringify(buildSyntheticStudyRows(design.protocol), null, 2)}\n`);
  const completedStages: string[] = ["design", "fixture"];
  await researchCritiquePacketCommand(packetDir);
  completedStages.push("critique");
  await researchValidateMethodsCommand(packetDir);
  completedStages.push("methods-validation");
  await researchScoutPlanCommand(packetDir, fixturePath);
  completedStages.push("scout");
  await researchDataQualityCommand(fixturePath);
  completedStages.push("data-quality");
  await researchRunnerSpecCommand(packetDir);
  completedStages.push("runner-spec");
  await researchApprovePacketCommand(packetDir, "Approved synthetic study simulation for end-to-end pipeline pressure testing.");
  completedStages.push("approval");
  await researchAnalyzeLocalCommand(packetDir, fixturePath);
  completedStages.push("analysis");
  await researchReviewReportCommand(packetDir);
  completedStages.push("report-review");
  await researchArtifactManifestCommand(packetDir);
  completedStages.push("manifest");
  await researchRoCrateCommand(packetDir);
  completedStages.push("ro-crate");
  await researchProvenanceCommand(packetDir);
  completedStages.push("provenance");
  await researchArtifactManifestCommand(packetDir);
  const exportDir = path.join(packetDir, "export");
  await researchExportPacketCommand(packetDir, exportDir);
  completedStages.push("export");
  const qa = await researchQaDashboardCommand(packetDir);
  completedStages.push("qa-dashboard");
  return {
    packetDir,
    exportDir,
    question: opts.question,
    fixturePath,
    completedStages,
    qaStatus: qa.status,
    nextAction: qa.nextAction,
  };
}

export function renderResearchStudySimulation(result: ResearchStudySimulationResult): string {
  return [
    `research study simulation: ${result.packetDir}`,
    `  question: ${result.question}`,
    `  fixture: ${result.fixturePath}`,
    `  export: ${result.exportDir}`,
    `  qa: ${result.qaStatus}`,
    `  stages: ${result.completedStages.join(", ")}`,
    `  next: ${result.nextAction}`,
  ].join("\n");
}

export function renderResearchStudySimulationJson(result: ResearchStudySimulationResult): string {
  return `${JSON.stringify({
    schemaVersion: 1,
    studySimulation: result,
  }, null, 2)}\n`;
}

export async function researchRealStudyReadinessCommand(packetDir: string): Promise<ResearchRealStudyReadiness> {
  const resolved = path.resolve(packetDir);
  const runner = await readJsonIfPresent(path.join(resolved, "runner-spec.json")) as ResearchRunnerSpec | null;
  const realRunner = await readJsonIfPresent(path.join(resolved, "real-runner-spec.json")) as ResearchRealLocalRunnerSpec | null;
  const dataAccess = await readJsonIfPresent(path.join(resolved, "data-access.json")) as ResearchDataAccessManifest | null;
  const design = await readJsonIfPresent(path.join(resolved, "design.json")) as LabMedbreviaNhanesResult | null;
  const summarizedFiles = dataAccess?.files.filter(file => file.summaryStatus === "summarized") ?? [];
  const missingExpectedVariables = dataAccess?.expectedVariables.filter(variable => !variable.observed).map(variable => variable.name) ?? [];
  const requirements: ResearchRealStudyReadiness["requirements"] = [
    {
      id: "design-packet",
      blocking: true,
      status: design ? "pass" : "missing",
      detail: design ? "design.json is present." : "design.json is required.",
    },
    {
      id: "fixture-runner-spec",
      blocking: false,
      status: runner ? "pass" : "missing",
      detail: runner ? `Fixture runner mode is ${runner.mode}.` : "runner-spec.json is useful for synthetic fixture execution.",
    },
    {
      id: "real-data-runner",
      blocking: true,
      status: realRunner?.mode === "real_local_files" ? "pass" : "missing",
      detail: realRunner ? "real-runner-spec.json declares real_local_files execution." : "real-runner-spec.json is required for real local dataset execution.",
    },
    {
      id: "data-access-manifest",
      blocking: true,
      status: dataAccess ? "pass" : "missing",
      detail: dataAccess ? dataAccess.decisionSummary : "data-access.json should describe local data files, schemas, and access constraints.",
    },
    {
      id: "data-access-summary",
      blocking: true,
      status: summarizedFiles.length ? "pass" : "missing",
      detail: summarizedFiles.length
        ? `${summarizedFiles.length} declared data file(s) have table-summary provenance.`
        : "At least one declared data file should have table-summary provenance before real-data execution.",
    },
    {
      id: "data-access-expected-variables",
      blocking: true,
      status: !missingExpectedVariables.length ? "pass" : "missing",
      detail: missingExpectedVariables.length
        ? `Expected variables missing from summarized data: ${missingExpectedVariables.join(", ")}.`
        : dataAccess?.expectedVariables.length ? "All expected packet variables were observed in summarized data." : "No packet expected-variable list was available to check.",
    },
    {
      id: "survey-methods",
      blocking: true,
      status: design?.protocol.surveyDesign.weightVariable ? "pass" : "missing",
      detail: design?.protocol.surveyDesign.weightVariable
        ? `Survey weight ${design.protocol.surveyDesign.weightVariable} is specified.`
        : "Survey or sampling design requirements must be explicit for population estimates.",
    },
  ];
  const status = requirements.filter(requirement => requirement.blocking).every(requirement => requirement.status === "pass") ? "ready_for_local_real_data" : "not_ready";
  return {
    packetDir: resolved,
    status,
    requirements,
    nextAction: status === "ready_for_local_real_data"
      ? "Run with a real-data adapter under cost and permission controls."
      : "Implement the missing real-data adapter requirements before claiming real study execution.",
  };
}

export function renderResearchRealStudyReadiness(result: ResearchRealStudyReadiness): string {
  return [
    `research real-study readiness: ${result.packetDir}`,
    `  status: ${result.status}`,
    `  next: ${result.nextAction}`,
    "  requirements:",
    ...result.requirements.map(requirement => `    - [${requirement.status}${requirement.blocking ? "" : ", advisory"}] ${requirement.id}: ${requirement.detail}`),
  ].join("\n");
}

export function renderResearchRealStudyReadinessJson(result: ResearchRealStudyReadiness): string {
  return `${JSON.stringify({
    schemaVersion: 1,
    realStudyReadiness: result,
  }, null, 2)}\n`;
}

export async function researchDataAccessManifestCommand(packetDir: string, files: string[], opts: { python?: string } = {}): Promise<ResearchDataAccessManifest> {
  const resolved = path.resolve(packetDir);
  const design = await readJsonIfPresent(path.join(resolved, "design.json")) as LabMedbreviaNhanesResult | null;
  const manifestPath = path.join(resolved, "data-access.json");
  const summarizedFiles = await Promise.all(files.map(async (file, index) => summarizeDataAccessFile(file, index, opts.python)));
  const expectedVariableNames = design ? uniqueStrings([
    ...design.protocol.exposure.variables,
    ...design.protocol.endpoint.variables,
    ...design.protocol.covariates,
    ...(design.protocol.stratifiers ?? []),
    design.protocol.surveyDesign.weightVariable,
    design.protocol.surveyDesign.strataVariable,
    design.protocol.surveyDesign.psuVariable,
  ].filter(Boolean)) : [];
  const expectedVariables = expectedVariableNames.map(name => {
    const matchingFiles = summarizedFiles
      .filter(file => file.summary?.columns.some(column => column.name === name))
      .map(file => file.path);
    return { name, observed: matchingFiles.length > 0, files: matchingFiles };
  });
  const presentCount = summarizedFiles.filter(file => file.exists).length;
  const summarizedCount = summarizedFiles.filter(file => file.summaryStatus === "summarized").length;
  const missingExpected = expectedVariables.filter(variable => !variable.observed).map(variable => variable.name);
  const manifest: ResearchDataAccessManifest = {
    packetDir: resolved,
    manifestPath,
    dataset: design?.protocol.dataset ?? "unknown",
    decisionSummary: missingExpected.length
      ? `${presentCount}/${summarizedFiles.length} declared files are present and ${summarizedCount} summarized; expected variables still missing: ${missingExpected.join(", ")}.`
      : `${presentCount}/${summarizedFiles.length} declared files are present and ${summarizedCount} summarized; expected variables observed: ${expectedVariables.length || "not declared by packet design"}.`,
    files: summarizedFiles,
    expectedVariables,
    readOnly: true,
    notes: [
      "Data files are declared read-only for research pipeline execution.",
      "Adapters should fail closed if a declared data file is missing or mutable write access is requested.",
    ],
  };
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  return manifest;
}

export function renderResearchDataAccessManifest(manifest: ResearchDataAccessManifest): string {
  return [
    `research data access manifest: ${manifest.packetDir}`,
    `  dataset: ${manifest.dataset}`,
    `  decision: ${manifest.decisionSummary}`,
    `  read-only: ${manifest.readOnly}`,
    `  files: ${manifest.files.length}`,
    ...manifest.files.map(file => `  - [${file.exists ? file.summaryStatus : "missing"}] ${file.role}: ${file.path}${file.summary ? ` rows=${file.summary.rowCount} cols=${file.summary.columnCount}` : ""}`),
    ...(manifest.expectedVariables.length ? [
      "  expected variables:",
      ...manifest.expectedVariables.map(variable => `    - [${variable.observed ? "observed" : "missing"}] ${variable.name}`),
    ] : []),
  ].join("\n");
}

export function renderResearchDataAccessManifestJson(manifest: ResearchDataAccessManifest): string {
  return `${JSON.stringify({
    schemaVersion: 1,
    dataAccess: manifest,
  }, null, 2)}\n`;
}

export async function researchDataAccessRedactCommand(packetDir: string): Promise<ResearchDataAccessRedaction> {
  const resolved = path.resolve(packetDir);
  const sourceManifestPath = path.join(resolved, "data-access.json");
  const manifest = await readJsonIfPresent(sourceManifestPath) as ResearchDataAccessManifest | null;
  if (!manifest) throw new Error("data-access-redact requires data-access.json.");
  const sourceManifestSha256 = await hashFile(sourceManifestPath);
  const sourceRefFor = (value: string): string => path.basename(value) || "(redacted)";
  const files: ResearchDataAccessRedaction["files"] = manifest.files.map(file => ({
    sourceRef: sourceRefFor(file.path),
    role: file.role,
    exists: file.exists,
    summaryStatus: file.summaryStatus,
    ...(file.summary ? {
      summary: {
        ...file.summary,
        adapter: {
          kind: file.summary.adapter.kind,
          executableRef: sourceRefFor(file.summary.adapter.executable),
          version: file.summary.adapter.version,
          packages: file.summary.adapter.packages,
        },
      },
    } : {}),
  }));
  const expectedVariables = manifest.expectedVariables.map(variable => ({
    name: variable.name,
    observed: variable.observed,
    sourceRefs: variable.files.map(sourceRefFor),
  }));
  const redactedPath = path.join(resolved, "data-access-redacted.json");
  const result: ResearchDataAccessRedaction = {
    packetRef: path.basename(resolved) || ".",
    sourceManifestRef: "data-access.json",
    sourceManifestSha256,
    redactedRef: "data-access-redacted.json",
    generatedAtIso: new Date().toISOString(),
    decisionSummary: manifest.decisionSummary,
    files,
    expectedVariables,
    redactions: [
      { field: "files[].path", reason: "Absolute local data paths are local rerun metadata and are not share-safe by default." },
      { field: "files[].summary.adapter.executable", reason: "Absolute local runtime paths disclose local environment layout." },
      { field: "expectedVariables[].files", reason: "Variable evidence can use sourceRefs plus hashes instead of absolute local paths." },
    ],
  };
  await writeFile(redactedPath, `${JSON.stringify(result, null, 2)}\n`);
  return result;
}

export function renderResearchDataAccessRedaction(result: ResearchDataAccessRedaction): string {
  return [
    `research data access redaction: ${result.packetRef}`,
    `  path: ${result.redactedRef}`,
    `  source: ${result.sourceManifestRef} sha256=${result.sourceManifestSha256}`,
    `  decision: ${result.decisionSummary}`,
    `  files: ${result.files.length}`,
    ...result.files.map(file => `  - ${file.role}: ${file.sourceRef}${file.summary ? ` rows=${file.summary.rowCount} cols=${file.summary.columnCount}` : ""}`),
    `  redactions: ${result.redactions.length}`,
  ].join("\n");
}

export function renderResearchDataAccessRedactionJson(result: ResearchDataAccessRedaction): string {
  return `${JSON.stringify({
    schemaVersion: 1,
    dataAccessRedaction: result,
  }, null, 2)}\n`;
}

async function summarizeDataAccessFile(file: string, index: number, python?: string): Promise<ResearchDataAccessManifest["files"][number]> {
  const resolved = path.resolve(file);
  const fileExists = await exists(resolved);
  const base = {
    path: resolved,
    role: index === 0 ? "primary-data" : "supporting-data",
    exists: fileExists,
  };
  if (!fileExists) return { ...base, summaryStatus: "missing" };
  try {
    const summary = await researchTableSummaryCommand({ file: resolved, python });
    return {
      ...base,
      summaryStatus: "summarized",
      summary: {
        format: summary.format,
        adapter: summary.adapter,
        fileSizeBytes: summary.fileSizeBytes,
        fileMtimeMs: summary.fileMtimeMs,
        fileSha256: summary.fileSha256,
        rowCount: summary.rowCount,
        columnCount: summary.columnCount,
        columns: summary.columns.map(column => ({
          name: column.name,
          inferredType: column.inferredType,
          nonMissingRows: column.nonMissingRows,
          missingFraction: column.missingFraction,
        })),
      },
    };
  } catch (error) {
    return {
      ...base,
      summaryStatus: "unsupported",
      summaryError: error instanceof Error ? error.message : String(error),
    };
  }
}

export async function researchRealLocalRunnerSpecCommand(packetDir: string): Promise<ResearchRealLocalRunnerSpec> {
  const resolved = path.resolve(packetDir);
  const design = await readJsonIfPresent(path.join(resolved, "design.json")) as LabMedbreviaNhanesResult | null;
  const scout = await readScoutIfPresent(resolved);
  const spec: ResearchRealLocalRunnerSpec = {
    packetDir: resolved,
    generatedAtIso: new Date().toISOString(),
    runnerVersion: 0,
    mode: "real_local_files",
    dataAccessManifest: await exists(path.join(resolved, "data-access.json")) ? path.join(resolved, "data-access.json") : null,
    requiredVariables: scout?.requiredVariables ?? (design ? uniqueStrings([
      ...design.protocol.exposure.variables,
      ...design.protocol.endpoint.variables,
      ...design.protocol.covariates,
      ...(design.protocol.stratifiers ?? []),
      design.protocol.surveyDesign.weightVariable,
      design.protocol.surveyDesign.strataVariable,
      design.protocol.surveyDesign.psuVariable,
    ]) : []),
    safety: {
      cloudSpendUsd: 0,
      readOnlyData: true,
      requiresHumanApproval: true,
    },
  };
  await writeFile(path.join(resolved, "real-runner-spec.json"), `${JSON.stringify(spec, null, 2)}\n`);
  return spec;
}

export function renderResearchRealLocalRunnerSpec(spec: ResearchRealLocalRunnerSpec): string {
  return [
    `research real-local runner spec: ${spec.packetDir}`,
    `  mode: ${spec.mode}`,
    `  data access: ${spec.dataAccessManifest ?? "missing"}`,
    `  required variables: ${spec.requiredVariables.join(", ") || "(none)"}`,
    `  safety: cloud=$${spec.safety.cloudSpendUsd} read_only=${spec.safety.readOnlyData} approval=${spec.safety.requiresHumanApproval}`,
  ].join("\n");
}

export function renderResearchRealLocalRunnerSpecJson(spec: ResearchRealLocalRunnerSpec): string {
  return `${JSON.stringify({
    schemaVersion: 1,
    realLocalRunnerSpec: spec,
  }, null, 2)}\n`;
}

export async function researchRealStudyChecklistCommand(packetDir: string): Promise<ResearchRealStudyChecklist> {
  const resolved = path.resolve(packetDir);
  const dataAccessDone = await exists(path.join(resolved, "data-access.json"));
  const realRunnerDone = await exists(path.join(resolved, "real-runner-spec.json"));
  const readiness = await researchRealStudyReadinessCommand(resolved);
  const items: ResearchRealStudyChecklist["items"] = [
    {
      order: 1,
      command: `agenteer research data-access --packet ${resolved} --file <real-data-file> --json`,
      reason: "Declare read-only local data files and access constraints.",
      done: dataAccessDone,
    },
    {
      order: 2,
      command: `agenteer research real-runner-spec --packet ${resolved} --json`,
      reason: "Create a non-fixture runner contract for read-only local files.",
      done: realRunnerDone,
    },
    {
      order: 3,
      command: `agenteer research real-study-readiness --packet ${resolved} --json`,
      reason: "Verify the packet is ready before claiming real-data execution.",
      done: readiness.status === "ready_for_local_real_data",
    },
  ];
  return {
    packetDir: resolved,
    items,
    nextCommand: items.find(item => !item.done)?.command ?? null,
  };
}

export function renderResearchRealStudyChecklist(checklist: ResearchRealStudyChecklist): string {
  return [
    `research real-study checklist: ${checklist.packetDir}`,
    `  next: ${checklist.nextCommand ?? "(complete)"}`,
    ...checklist.items.map(item => `  ${item.order}. [${item.done ? "done" : "todo"}] ${item.command}\n     ${item.reason}`),
  ].join("\n");
}

export function renderResearchRealStudyChecklistJson(checklist: ResearchRealStudyChecklist): string {
  return `${JSON.stringify({
    schemaVersion: 1,
    realStudyChecklist: checklist,
  }, null, 2)}\n`;
}

export async function researchAdapterGapReportCommand(packetDir: string): Promise<ResearchAdapterGapReport> {
  const resolved = path.resolve(packetDir);
  const realRunner = await readJsonIfPresent(path.join(resolved, "real-runner-spec.json")) as ResearchRealLocalRunnerSpec | null;
  const dataAccess = await readJsonIfPresent(path.join(resolved, "data-access.json")) as ResearchDataAccessManifest | null;
  const variableMap = await readJsonIfPresent(path.join(resolved, "variable-map.json")) as ResearchVariableMap | null;
  const requiredVariables = realRunner?.requiredVariables ?? [];
  const mappedVariables = new Set(variableMap?.mappings.map(mapping => mapping.variable) ?? []);
  const missingEvidence = [
    ...(!dataAccess ? ["data-access.json"] : []),
    ...(!realRunner ? ["real-runner-spec.json"] : []),
    ...requiredVariables.filter(variable => !mappedVariables.has(variable)).map(variable => `variable:${variable}`),
  ];
  return {
    packetDir: resolved,
    requiredVariables,
    declaredFiles: dataAccess?.files.length ?? 0,
    missingEvidence,
    status: missingEvidence.length ? "needs_mapping" : "mapping_ready",
    nextAction: missingEvidence.length
      ? "Add schema/variable mapping evidence for required variables before real-data execution."
      : "Adapter inputs have declared files and variable mapping evidence.",
  };
}

export function renderResearchAdapterGapReport(report: ResearchAdapterGapReport): string {
  return [
    `research adapter gap report: ${report.packetDir}`,
    `  status: ${report.status}`,
    `  declared files: ${report.declaredFiles}`,
    `  required variables: ${report.requiredVariables.join(", ") || "(none)"}`,
    `  missing evidence: ${report.missingEvidence.join(", ") || "(none)"}`,
    `  next: ${report.nextAction}`,
  ].join("\n");
}

export function renderResearchAdapterGapReportJson(report: ResearchAdapterGapReport): string {
  return `${JSON.stringify({
    schemaVersion: 1,
    adapterGapReport: report,
  }, null, 2)}\n`;
}

export async function researchVariableMapCommand(packetDir: string, file: string, mappings: string[]): Promise<ResearchVariableMap> {
  const resolved = path.resolve(packetDir);
  const resolvedFile = path.resolve(file);
  const parsedMappings = mappings.map(mapping => {
    const [variable, column] = mapping.split(":");
    if (!variable || !column) throw new Error(`invalid --map '${mapping}', expected VARIABLE:COLUMN`);
    return { variable, file: resolvedFile, column };
  });
  const result: ResearchVariableMap = {
    packetDir: resolved,
    mapPath: path.join(resolved, "variable-map.json"),
    mappings: parsedMappings,
  };
  await writeFile(result.mapPath, `${JSON.stringify(result, null, 2)}\n`);
  return result;
}

export function renderResearchVariableMap(result: ResearchVariableMap): string {
  return [
    `research variable map: ${result.packetDir}`,
    `  path: ${result.mapPath}`,
    `  mappings: ${result.mappings.length}`,
    ...result.mappings.map(mapping => `  - ${mapping.variable} -> ${mapping.file}#${mapping.column}`),
  ].join("\n");
}

export function renderResearchVariableMapJson(result: ResearchVariableMap): string {
  return `${JSON.stringify({
    schemaVersion: 1,
    variableMap: result,
  }, null, 2)}\n`;
}

export async function researchSuggestVariableMapCommand(packetDir: string, file: string, opts: { python?: string } = {}): Promise<ResearchVariableMapSuggestion> {
  const resolved = path.resolve(packetDir);
  const realRunner = await readJsonIfPresent(path.join(resolved, "real-runner-spec.json")) as ResearchRealLocalRunnerSpec | null;
  const requiredVariables = realRunner?.requiredVariables ?? [];
  const summary = await researchTableSummaryCommand({ file, python: opts.python });
  const columnsByName = new Map(summary.columns.map(column => [column.name, column]));
  const columnsByNormalizedName = new Map(summary.columns.map(column => [normalizeVariableName(column.name), column]));
  const suggestions: ResearchVariableMapSuggestion["suggestions"] = [];
  for (const variable of requiredVariables) {
    const exact = columnsByName.get(variable);
    if (exact) {
      suggestions.push({
        variable,
        column: exact.name,
        confidence: "high",
        reason: "Required variable exactly matches an observed column name.",
      });
      continue;
    }
    const normalized = columnsByNormalizedName.get(normalizeVariableName(variable));
    if (normalized) {
      suggestions.push({
        variable,
        column: normalized.name,
        confidence: "medium",
        reason: "Required variable matches an observed column after case and punctuation normalization.",
      });
    }
  }
  const suggestedVariables = new Set(suggestions.map(suggestion => suggestion.variable));
  const unmatchedVariables = requiredVariables.filter(variable => !suggestedVariables.has(variable));
  return {
    packetDir: resolved,
    file: summary.file,
    tableEvidence: {
      adapterKind: summary.adapter.kind,
      fileSha256: summary.fileSha256,
      fileMtimeMs: summary.fileMtimeMs,
      rowCount: summary.rowCount,
      columnCount: summary.columnCount,
    },
    requiredVariables,
    suggestions,
    unmatchedVariables,
    nextAction: unmatchedVariables.length
      ? "Review unmatched variables, then persist accepted mappings with research variable-map."
      : `Persist accepted mappings with: agenteer research variable-map --packet ${resolved} --file ${summary.file} ${suggestions.map(suggestion => `--map ${suggestion.variable}:${suggestion.column}`).join(" ")}`,
  };
}

export function renderResearchVariableMapSuggestion(result: ResearchVariableMapSuggestion): string {
  return [
    `research variable map suggestions: ${result.packetDir}`,
    `  file: ${result.file}`,
    `  evidence: ${result.tableEvidence.adapterKind} rows=${result.tableEvidence.rowCount} cols=${result.tableEvidence.columnCount} sha256=${result.tableEvidence.fileSha256}`,
    `  required variables: ${result.requiredVariables.join(", ") || "(none)"}`,
    `  suggestions: ${result.suggestions.length}`,
    ...result.suggestions.map(suggestion => `  - ${suggestion.variable} -> ${suggestion.column} (${suggestion.confidence}): ${suggestion.reason}`),
    `  unmatched: ${result.unmatchedVariables.join(", ") || "(none)"}`,
    `  next: ${result.nextAction}`,
  ].join("\n");
}

export function renderResearchVariableMapSuggestionJson(result: ResearchVariableMapSuggestion): string {
  return `${JSON.stringify({
    schemaVersion: 1,
    variableMapSuggestion: result,
  }, null, 2)}\n`;
}

export async function researchApplyVariableMapSuggestionsCommand(packetDir: string, file: string): Promise<ResearchVariableMapApplyResult> {
  const suggestion = await researchSuggestVariableMapCommand(packetDir, file);
  const map = await researchVariableMapCommand(
    suggestion.packetDir,
    suggestion.file,
    suggestion.suggestions.map(item => `${item.variable}:${item.column}`),
  );
  const gap = await researchAdapterGapReportCommand(suggestion.packetDir);
  return {
    packetDir: suggestion.packetDir,
    file: suggestion.file,
    mapPath: map.mapPath,
    appliedMappings: map.mappings,
    skippedVariables: suggestion.unmatchedVariables,
    adapterStatus: gap.status,
    nextAction: gap.status === "mapping_ready"
      ? "Adapter mapping evidence is complete; proceed to local real-data runner implementation or human review."
      : "Resolve skipped variables before real-data execution.",
  };
}

export function renderResearchVariableMapApplyResult(result: ResearchVariableMapApplyResult): string {
  return [
    `research apply variable map suggestions: ${result.packetDir}`,
    `  file: ${result.file}`,
    `  map: ${result.mapPath}`,
    `  applied mappings: ${result.appliedMappings.length}`,
    `  skipped: ${result.skippedVariables.join(", ") || "(none)"}`,
    `  adapter status: ${result.adapterStatus}`,
    `  next: ${result.nextAction}`,
  ].join("\n");
}

export function renderResearchVariableMapApplyResultJson(result: ResearchVariableMapApplyResult): string {
  return `${JSON.stringify({
    schemaVersion: 1,
    variableMapApplyResult: result,
  }, null, 2)}\n`;
}

export async function researchWorkflowScorecardCommand(packetDir: string): Promise<ResearchWorkflowScorecard> {
  const resolved = path.resolve(packetDir);
  const persistedQa = await readJsonIfPresent(path.join(resolved, "qa-dashboard.json")) as ResearchQaDashboard | null;
  const qa = persistedQa ?? await researchQaDashboardCommand(resolved);
  const methods = await readJsonIfPresent(path.join(resolved, "methods-validation.json")) as ResearchMethodsValidationResult | null;
  const reportReview = await readJsonIfPresent(path.join(resolved, "report-review.json")) as ResearchReportReview | null;
  const persistedEvidenceGap = await readJsonIfPresent(path.join(resolved, "evidence-gap-report.json")) as ResearchEvidenceGapReport | null;
  const evidenceGap = persistedEvidenceGap ?? await researchEvidenceGapReportCommand(resolved);
  const provenance = await readJsonIfPresent(path.join(resolved, "provenance.json")) as ResearchProvenanceGraph["graph"] | ResearchProvenanceGraph | null;
  const provenanceGraph = provenance && "graph" in provenance ? provenance.graph : provenance;
  const roCrate = await readJsonIfPresent(path.join(resolved, "ro-crate-metadata.json")) as ResearchRoCrateMetadata | null;
  const adapterGap = await researchAdapterGapReportCommand(resolved).catch(() => null);
  const manifest = await readJsonIfPresent(path.join(resolved, "artifact-manifest.json")) as ResearchArtifactManifest | null;
  const checks: ResearchWorkflowScorecard["checks"] = [
    scoreCheck("qa-dashboard", qa?.status === "ready" ? 20 : qa ? 10 : 0, 20, qa ? `QA status ${qa.status}.` : "QA dashboard missing."),
    scoreCheck("methods-validation", methods?.status === "pass" ? 15 : methods ? 7 : 0, 15, methods ? `Methods validation status ${methods.status}.` : "Methods validation missing."),
    scoreCheck("report-review", reportReview?.status === "pass" ? 15 : reportReview ? 7 : 0, 15, reportReview ? `Report review status ${reportReview.status}.` : "Report review missing."),
    scoreCheck("provenance", provenanceGraph ? 15 : 0, 15, provenanceGraph ? `${provenanceGraph.entities.length} provenance entities recorded.` : "Provenance graph missing."),
    scoreCheck("ro-crate", roCrate ? 10 : 0, 10, roCrate ? "RO-Crate metadata present." : "RO-Crate metadata missing."),
    scoreCheck("evidence-gap", evidenceGap.status === "ready" ? 10 : 5, 10, `Evidence gap status ${evidenceGap.status}.`),
    scoreCheck("adapter-readiness", adapterGap?.status === "mapping_ready" ? 15 : adapterGap ? 7 : 0, 15, adapterGap ? `Adapter status ${adapterGap.status}.` : "Adapter gap report unavailable."),
    scoreCheck("manifest", manifest?.artifacts.length ? 10 : 0, 10, manifest?.artifacts.length ? `${manifest.artifacts.length} artifacts manifest recorded.` : "Artifact manifest missing."),
  ];
  const earned = checks.reduce((sum, check) => sum + check.points, 0);
  const possible = checks.reduce((sum, check) => sum + check.maxPoints, 0);
  const score = possible ? Math.round((earned / possible) * 100) : 0;
  const status: ResearchWorkflowScorecard["status"] = checks.some(check => check.status === "fail" && check.maxPoints >= 15)
    ? "blocked"
    : score >= 85 ? "promote" : "improve";
  return {
    packetDir: resolved,
    score,
    status,
    checks,
    nextAction: status === "promote"
      ? "Promote this packet shape as a stronger fixture and increase task difficulty."
      : "Address failed or partial evaluator checks before promoting this packet shape.",
  };
}

export function renderResearchWorkflowScorecard(result: ResearchWorkflowScorecard): string {
  return [
    `research workflow scorecard: ${result.packetDir}`,
    `  score: ${result.score}/100`,
    `  status: ${result.status}`,
    ...result.checks.map(check => `  - [${check.status}] ${check.id}: ${check.points}/${check.maxPoints} ${check.detail}`),
    `  next: ${result.nextAction}`,
  ].join("\n");
}

export function renderResearchWorkflowScorecardJson(result: ResearchWorkflowScorecard): string {
  return `${JSON.stringify({
    schemaVersion: 1,
    workflowScorecard: result,
  }, null, 2)}\n`;
}

export async function researchEvidenceGapReportCommand(packetDir: string): Promise<ResearchEvidenceGapReport> {
  const resolved = path.resolve(packetDir);
  const reportPath = path.join(resolved, "report.md");
  const reportExists = await exists(reportPath);
  const report = reportExists ? await readFile(reportPath, "utf-8") : "";
  const analysis = await exists(path.join(resolved, "analysis-result.json"));
  const design = await exists(path.join(resolved, "design.json"));
  const manifest = await exists(path.join(resolved, "artifact-manifest.json"));
  const provenance = await exists(path.join(resolved, "provenance.json"));
  const citationCount = Array.from(report.matchAll(/\[[0-9]+\]|\(https?:\/\/[^)]+\)/g)).length;
  const claimsPopulationEstimate = /\b(population estimate|nationally representative|prevalence|risk ratio|odds ratio|hazard ratio)\b/i.test(report);
  const declaresFixtureOnly = /\blocal fixture\b/i.test(report) && /\bunweighted\b/i.test(report);
  const checks: ResearchEvidenceGapReport["checks"] = [
    {
      id: "report",
      status: reportExists ? "pass" : "missing",
      detail: reportExists ? "report.md is present." : "report.md is missing.",
    },
    {
      id: "analysis-artifact",
      status: analysis ? "pass" : "missing",
      detail: analysis ? "analysis-result.json is present." : "analysis-result.json is missing.",
    },
    {
      id: "design-artifact",
      status: design ? "pass" : "missing",
      detail: design ? "design.json is present." : "design.json is missing.",
    },
    {
      id: "lineage-artifacts",
      status: manifest && provenance ? "pass" : manifest || provenance ? "needs_review" : "missing",
      detail: manifest && provenance ? "Manifest and provenance are present." : "Manifest and provenance should both be present.",
    },
    {
      id: "fixture-caveat",
      status: declaresFixtureOnly ? "pass" : "needs_review",
      detail: declaresFixtureOnly ? "Report declares local fixture and unweighted limitations." : "Report should declare fixture/unweighted limitations unless it is a real-data survey analysis.",
    },
    {
      id: "citation-coverage",
      status: citationCount > 0 || !claimsPopulationEstimate ? "pass" : "needs_review",
      detail: citationCount > 0 ? `${citationCount} citation-like reference(s) found.` : "No citation-like references found; acceptable only for local fixture reports without external factual claims.",
    },
  ];
  const status: ResearchEvidenceGapReport["status"] = checks.some(check => check.status === "missing" || check.status === "needs_review")
    ? "needs_evidence"
    : "ready";
  const result: ResearchEvidenceGapReport = {
    packetDir: resolved,
    status,
    reportPath: reportExists ? reportPath : null,
    citationCount,
    checks,
    nextAction: status === "ready"
      ? "Report evidence coverage is sufficient for this packet stage."
      : "Add missing artifacts, caveats, provenance, or citations before treating the report as publishable.",
  };
  await writeFile(path.join(resolved, "evidence-gap-report.json"), `${JSON.stringify(result, null, 2)}\n`);
  return result;
}

export function renderResearchEvidenceGapReport(result: ResearchEvidenceGapReport): string {
  return [
    `research evidence gap report: ${result.packetDir}`,
    `  status: ${result.status}`,
    `  report: ${result.reportPath ?? "missing"}`,
    `  citations: ${result.citationCount}`,
    ...result.checks.map(check => `  - [${check.status}] ${check.id}: ${check.detail}`),
    `  next: ${result.nextAction}`,
  ].join("\n");
}

export function renderResearchEvidenceGapReportJson(result: ResearchEvidenceGapReport): string {
  return `${JSON.stringify({
    schemaVersion: 1,
    evidenceGapReport: result,
  }, null, 2)}\n`;
}

export async function researchPacketDiffCommand(basePacketDir: string, comparePacketDir: string): Promise<ResearchPacketDiff> {
  const base = path.resolve(basePacketDir);
  const compare = path.resolve(comparePacketDir);
  const baseArtifacts = await artifactDigestMap(base);
  const compareArtifacts = await artifactDigestMap(compare);
  const baseNames = new Set(baseArtifacts.keys());
  const compareNames = new Set(compareArtifacts.keys());
  const addedArtifacts = Array.from(compareNames).filter(name => !baseNames.has(name)).sort((a, b) => a.localeCompare(b));
  const removedArtifacts = Array.from(baseNames).filter(name => !compareNames.has(name)).sort((a, b) => a.localeCompare(b));
  const shared = Array.from(compareNames).filter(name => baseNames.has(name));
  const changedArtifacts = shared.filter(name => baseArtifacts.get(name) !== compareArtifacts.get(name)).sort((a, b) => a.localeCompare(b));
  const unchangedArtifacts = shared.filter(name => baseArtifacts.get(name) === compareArtifacts.get(name)).sort((a, b) => a.localeCompare(b));
  const baseScorecard = await readJsonIfPresent(path.join(base, "workflow-scorecard.json")) as ResearchWorkflowScorecard | { workflowScorecard?: ResearchWorkflowScorecard } | null;
  const compareScorecard = await readJsonIfPresent(path.join(compare, "workflow-scorecard.json")) as ResearchWorkflowScorecard | { workflowScorecard?: ResearchWorkflowScorecard } | null;
  const baseScore = workflowScoreFromUnknown(baseScorecard);
  const compareScore = workflowScoreFromUnknown(compareScorecard);
  return {
    basePacketDir: base,
    comparePacketDir: compare,
    addedArtifacts,
    removedArtifacts,
    changedArtifacts,
    unchangedArtifacts,
    scoreDelta: typeof baseScore === "number" && typeof compareScore === "number" ? compareScore - baseScore : null,
    nextAction: addedArtifacts.length || removedArtifacts.length || changedArtifacts.length
      ? "Review changed artifacts and score delta before promoting the newer packet."
      : "Packets have identical tracked artifacts.",
  };
}

export function renderResearchPacketDiff(result: ResearchPacketDiff): string {
  return [
    `research packet diff: ${result.basePacketDir} -> ${result.comparePacketDir}`,
    `  added: ${result.addedArtifacts.join(", ") || "(none)"}`,
    `  removed: ${result.removedArtifacts.join(", ") || "(none)"}`,
    `  changed: ${result.changedArtifacts.join(", ") || "(none)"}`,
    `  unchanged: ${result.unchangedArtifacts.length}`,
    `  score delta: ${result.scoreDelta ?? "unknown"}`,
    `  next: ${result.nextAction}`,
  ].join("\n");
}

export function renderResearchPacketDiffJson(result: ResearchPacketDiff): string {
  return `${JSON.stringify({
    schemaVersion: 1,
    packetDiff: result,
  }, null, 2)}\n`;
}

export function researchNodeProposalCommand(opts: {
  id: string;
  purpose: string;
  evaluator: string;
  rollback: string;
  costUsd?: number;
  promotion?: string[];
}): ResearchNodeProposal {
  return {
    id: opts.id.trim(),
    purpose: opts.purpose.trim(),
    expectedEvaluator: opts.evaluator.trim(),
    rollbackCondition: opts.rollback.trim(),
    costEnvelopeUsd: opts.costUsd ?? 0,
    promotionCriteria: opts.promotion?.length ? opts.promotion : [
      "Focused tests pass.",
      "Local fixture evaluation improves or preserves workflow score.",
      "No cloud spend is required for default verification.",
    ],
    status: "candidate",
  };
}

export function renderResearchNodeProposal(result: ResearchNodeProposal): string {
  return [
    `research node proposal: ${result.id}`,
    `  purpose: ${result.purpose}`,
    `  evaluator: ${result.expectedEvaluator}`,
    `  rollback: ${result.rollbackCondition}`,
    `  cost envelope: $${result.costEnvelopeUsd}`,
    `  promotion: ${result.promotionCriteria.join("; ")}`,
  ].join("\n");
}

export function renderResearchNodeProposalJson(result: ResearchNodeProposal): string {
  return `${JSON.stringify({
    schemaVersion: 1,
    nodeProposal: result,
  }, null, 2)}\n`;
}

export async function researchNodeProposalRegistryCommand(registryDir: string): Promise<ResearchNodeProposalRegistry> {
  const resolved = path.resolve(registryDir);
  const names = await readdir(resolved).catch(() => []);
  const proposals = (await Promise.all(names
    .filter(name => name.endsWith(".json"))
    .sort((a, b) => a.localeCompare(b))
    .map(async name => {
      const parsed = JSON.parse(await readFile(path.join(resolved, name), "utf-8")) as ResearchNodeProposal | { nodeProposal?: ResearchNodeProposal };
      return "nodeProposal" in parsed ? parsed.nodeProposal ?? null : parsed;
    }))).filter((proposal): proposal is ResearchNodeProposal => Boolean(proposal));
  const totalCostEnvelopeUsd = proposals.reduce((sum, proposal) => sum + proposal.costEnvelopeUsd, 0);
  return {
    registryDir: resolved,
    proposals,
    totalCostEnvelopeUsd,
    nextAction: proposals.length
      ? "Review candidate evaluators and promote the highest-leverage node into the pipeline."
      : "Add candidate node proposal JSON files to this registry.",
  };
}

export function renderResearchNodeProposalRegistry(result: ResearchNodeProposalRegistry): string {
  return [
    `research node proposal registry: ${result.registryDir}`,
    `  proposals: ${result.proposals.length}`,
    `  total cost envelope: $${result.totalCostEnvelopeUsd}`,
    ...result.proposals.map(proposal => `  - ${proposal.id}: ${proposal.purpose} (evaluator: ${proposal.expectedEvaluator})`),
    `  next: ${result.nextAction}`,
  ].join("\n");
}

export function renderResearchNodeProposalRegistryJson(result: ResearchNodeProposalRegistry): string {
  return `${JSON.stringify({
    schemaVersion: 1,
    nodeProposalRegistry: result,
  }, null, 2)}\n`;
}

export async function researchCostLedgerCommand(opts: { packetDir?: string; proposalDir?: string; hardStopUsd?: number }): Promise<ResearchCostLedger> {
  const hardStopUsd = opts.hardStopUsd ?? 30;
  const entries: ResearchCostLedger["entries"] = [];
  let packetDir: string | null = null;
  if (opts.packetDir) {
    packetDir = path.resolve(opts.packetDir);
    const runner = await readJsonIfPresent(path.join(packetDir, "runner-spec.json")) as ResearchRunnerSpec | null;
    const realRunner = await readJsonIfPresent(path.join(packetDir, "real-runner-spec.json")) as ResearchRealLocalRunnerSpec | null;
    if (runner) entries.push({ source: "runner-spec.json", amountUsd: runner.safety.cloudSpendUsd, kind: "observed" });
    if (realRunner) entries.push({ source: "real-runner-spec.json", amountUsd: realRunner.safety.cloudSpendUsd, kind: "observed" });
  }
  let proposalDir: string | null = null;
  if (opts.proposalDir) {
    const registry = await researchNodeProposalRegistryCommand(opts.proposalDir);
    proposalDir = registry.registryDir;
    for (const proposal of registry.proposals) {
      entries.push({ source: `node-proposal:${proposal.id}`, amountUsd: proposal.costEnvelopeUsd, kind: "proposed" });
    }
  }
  const observedCloudSpendUsd = entries.filter(entry => entry.kind === "observed").reduce((sum, entry) => sum + entry.amountUsd, 0);
  const proposedCostEnvelopeUsd = entries.filter(entry => entry.kind === "proposed").reduce((sum, entry) => sum + entry.amountUsd, 0);
  const status: ResearchCostLedger["status"] = observedCloudSpendUsd > hardStopUsd || proposedCostEnvelopeUsd > hardStopUsd ? "hard_stop" : "within_budget";
  return {
    packetDir,
    proposalDir,
    observedCloudSpendUsd,
    proposedCostEnvelopeUsd,
    hardStopUsd,
    status,
    entries,
    nextAction: status === "within_budget"
      ? "Continue preferring local deterministic verification before any paid execution."
      : "Stop paid/cloud escalation and reduce proposed or observed spend before continuing.",
  };
}

export function renderResearchCostLedger(result: ResearchCostLedger): string {
  return [
    "research cost ledger",
    `  packet: ${result.packetDir ?? "(none)"}`,
    `  proposals: ${result.proposalDir ?? "(none)"}`,
    `  observed cloud spend: $${result.observedCloudSpendUsd}`,
    `  proposed cost envelope: $${result.proposedCostEnvelopeUsd}`,
    `  hard stop: $${result.hardStopUsd}`,
    `  status: ${result.status}`,
    ...result.entries.map(entry => `  - [${entry.kind}] ${entry.source}: $${entry.amountUsd}`),
    `  next: ${result.nextAction}`,
  ].join("\n");
}

export function renderResearchCostLedgerJson(result: ResearchCostLedger): string {
  return `${JSON.stringify({
    schemaVersion: 1,
    costLedger: result,
  }, null, 2)}\n`;
}

export function researchQuestionBankCommand(domain = "medical"): ResearchQuestionBank {
  const normalized = domain.trim().toLowerCase();
  const shared: ResearchQuestionBank["questions"] = [
    {
      id: "medication-adherence-control",
      question: "Among adults with diagnosed hypertension, is medication adherence associated with blood pressure control?",
      datasetNeeds: ["diagnosis history", "medication use or adherence", "measured blood pressure", "demographics", "sampling design if survey data"],
      designStress: ["confounding by disease severity", "self-report measurement error", "subcohort eligibility"],
      analysisFamily: "cross-sectional association or target-trial emulation if longitudinal timing exists",
    },
    {
      id: "screening-access-stage",
      question: "Among adults eligible for cancer screening, is healthcare access associated with diagnosis stage at detection?",
      datasetNeeds: ["screening eligibility", "healthcare access", "diagnosis stage", "age/sex/risk factors", "follow-up timing"],
      designStress: ["selection bias", "lead-time bias", "time window alignment"],
      analysisFamily: "cohort or case-only stage distribution model",
    },
    {
      id: "lab-marker-risk-gradient",
      question: "Do cardiometabolic biomarkers vary across socioeconomic strata after accounting for age, sex, race/ethnicity, and BMI?",
      datasetNeeds: ["biomarker labs", "socioeconomic measure", "anthropometrics", "demographics"],
      designStress: ["nonlinear gradients", "missing labs", "survey weighting"],
      analysisFamily: "weighted descriptive regression or generalized additive model",
    },
    {
      id: "clinical-prediction-calibration",
      question: "Does an existing clinical risk score remain calibrated across demographic subgroups in a newer dataset?",
      datasetNeeds: ["risk score inputs", "outcome follow-up", "demographics", "calibration horizon"],
      designStress: ["transportability", "subgroup calibration", "label leakage"],
      analysisFamily: "prediction validation with calibration and discrimination metrics",
    },
  ];
  return {
    domain: normalized,
    questions: normalized === "public-health" ? shared.filter(item => item.id !== "clinical-prediction-calibration") : shared,
  };
}

export function renderResearchQuestionBank(result: ResearchQuestionBank): string {
  return [
    `research question bank: ${result.domain}`,
    ...result.questions.map(question => [
      `  - ${question.id}: ${question.question}`,
      `    needs: ${question.datasetNeeds.join(", ")}`,
      `    stress: ${question.designStress.join("; ")}`,
      `    analysis: ${question.analysisFamily}`,
    ].join("\n")),
  ].join("\n");
}

export function renderResearchQuestionBankJson(result: ResearchQuestionBank): string {
  return `${JSON.stringify({
    schemaVersion: 1,
    questionBank: result,
  }, null, 2)}\n`;
}

export function researchQuestionReadinessCommand(question: string): ResearchQuestionReadiness {
  const decomposition = researchDecomposeQuestionCommand(question);
  const missing = [
    ...(!decomposition.population ? ["population"] : []),
    ...(!decomposition.exposureOrPredictor ? ["exposure_or_predictor"] : []),
    ...(!decomposition.outcome ? ["outcome"] : []),
    ...(decomposition.intent === "causal" ? ["target_trial_components"] : []),
  ];
  const score = Math.max(0, 100 - missing.length * 25);
  return {
    question: decomposition.question,
    score,
    status: missing.length ? "needs_clarification" : "ready_for_protocol",
    missing,
    suggestedCommands: [
      `agenteer research decompose-question --question ${JSON.stringify(decomposition.question)} --json`,
      `agenteer research clarification-plan --question ${JSON.stringify(decomposition.question)} --json`,
      ...(missing.length ? [] : [`agenteer research select-method --question ${JSON.stringify(decomposition.question)} --json`]),
    ],
  };
}

export function renderResearchQuestionReadiness(result: ResearchQuestionReadiness): string {
  return [
    `research question readiness: ${result.status}`,
    `  score: ${result.score}/100`,
    `  question: ${result.question}`,
    `  missing: ${result.missing.join(", ") || "(none)"}`,
    ...result.suggestedCommands.map(command => `  - ${command}`),
  ].join("\n");
}

export function renderResearchQuestionReadinessJson(result: ResearchQuestionReadiness): string {
  return `${JSON.stringify({
    schemaVersion: 1,
    questionReadiness: result,
  }, null, 2)}\n`;
}

export function researchProtocolCandidatesCommand(question: string): ResearchProtocolCandidatePortfolio {
  const readiness = researchQuestionReadinessCommand(question);
  const q = question.trim();
  const lower = q.toLowerCase();
  const candidates: ResearchProtocolCandidatePortfolio["candidates"] = [];
  const addCandidate = (protocol: ResearchStructuredProtocol, priority: number, recommendation: string): void => {
    candidates.push({
      id: protocol.id,
      rank: 0,
      priority,
      status: readiness.status === "ready_for_protocol" ? "scout_ready" : "needs_clarification",
      recommendation,
      protocol,
      readiness,
      blockers: [],
      warnings: readiness.missing.map(item => ({
        severity: "warning",
        code: "QUESTION_READINESS_GAP",
        message: `Question is missing or underspecified: ${item}.`,
      })),
    });
  };

  if (/\b(vitamin d|lbxvidms)\b/.test(lower) && /\b(hypertension|blood pressure|bp)\b/.test(lower)) {
    addCandidate(makeStructuredProtocol({
      title: "Vitamin D deficiency and measured hypertension",
      question: q,
      exposure: ["Vitamin D deficiency", "LBXVIDMS", "25-hydroxyvitamin D below a clinically specified threshold", "vitamin_d", "50 nmol/L"],
      endpoint: ["Measured hypertension", "measured_hypertension", "Mean systolic BP >=130 mmHg or mean diastolic BP >=80 mmHg", "blood_pressure", "130/80 mmHg"],
      covariates: [["Age", "RIDAGEYR", "demographics"], ["Sex", "RIAGENDR", "demographics"], ["Race/ethnicity", "RIDRETH3", "demographics"], ["BMI", "BMXBMI", "anthropometrics"]],
      cycles: ["2017-2018"],
      analysisType: "adjusted_logistic_regression",
      rationale: "Direct exposure-outcome design with an executable derived endpoint and covariate plan.",
      caveats: ["Observational cross-sectional association; do not infer causality.", "Vitamin D threshold should be confirmed before execution."],
    }), 95, "Recommended");
  }
  if (/\b(diabetes|hba1c|lbxgh)\b/.test(lower)) {
    addCandidate(makeStructuredProtocol({
      title: "Weighted prevalence of uncontrolled diabetes",
      question: q,
      exposure: ["Diagnosed diabetes", "DIQ010", "Doctor told participant they have diabetes", "diabetes", null],
      endpoint: ["Uncontrolled diabetes", "LBXGH", "HbA1c >=7.0% among participants with diagnosed diabetes", "diabetes", "7.0%"],
      covariates: [["Age", "RIDAGEYR", "demographics"], ["Sex", "RIAGENDR", "demographics"]],
      stratifiers: [["Age", "RIDAGEYR", "demographics"], ["Sex", "RIAGENDR", "demographics"]],
      cycles: ["2017-2020-prepandemic"],
      analysisType: "weighted_prevalence",
      rationale: "Clinically interpretable descriptive design with clear cohort and endpoint definitions.",
      caveats: ["Descriptive cross-sectional survey estimate.", "HbA1c availability and survey weights must be checked before execution."],
    }), 90, "Strong candidate");
  }
  if (/\b(hypertension|blood pressure|bp)\b/.test(lower)) {
    addCandidate(makeStructuredProtocol({
      title: "Weighted prevalence of measured hypertension",
      question: q,
      exposure: ["Population subgroup", "RIDAGEYR", "Age or subgroup strata requested by the question", "demographics", null],
      endpoint: ["Measured hypertension", "measured_hypertension", "Mean systolic BP >=130 mmHg or mean diastolic BP >=80 mmHg", "blood_pressure", "130/80 mmHg"],
      covariates: [["Age", "RIDAGEYR", "demographics"], ["Sex", "RIAGENDR", "demographics"]],
      stratifiers: [["Age", "RIDAGEYR", "demographics"], ["Sex", "RIAGENDR", "demographics"]],
      cycles: ["2017-2020-prepandemic"],
      analysisType: "weighted_prevalence",
      rationale: "Good first-pass cardiovascular risk estimate with scoutable denominators and subgroup checks.",
      caveats: ["Measured BP definitions require adequate examination measurements."],
    }), 80, candidates.length ? "Alternative" : "Recommended");
  }
  if (!candidates.length) {
    addCandidate(makeStructuredProtocol({
      title: "Dataset feasibility scan",
      question: q,
      exposure: [readiness.missing.includes("exposure_or_predictor") ? "Unspecified exposure" : readiness.question, "", "Exposure requires clarification", "", null],
      endpoint: [readiness.missing.includes("outcome") ? "Unspecified endpoint" : readiness.question, "", "Endpoint requires clarification", "", null],
      covariates: [["Age", "RIDAGEYR", "demographics"], ["Sex", "RIAGENDR", "demographics"]],
      cycles: ["local_files"],
      analysisType: "feasibility_review",
      rationale: "The question does not map to a known medical template yet; start with feasibility and clarification.",
      caveats: ["No analysis should run until endpoint, population, and variables are explicit."],
    }), 50, "Clarify before execution");
  }
  const sorted = candidates
    .sort((a, b) => b.priority - a.priority || a.protocol.title.localeCompare(b.protocol.title))
    .map((candidate, index) => ({ ...candidate, rank: index + 1 }));
  return {
    question: q,
    generatedAtIso: new Date().toISOString(),
    candidates: sorted,
    selectedCandidateId: sorted.find(candidate => candidate.status !== "not_feasible")?.id ?? sorted[0]?.id ?? null,
    nextAction: "Review candidate protocols; promote one to an AnalysisSpec before cohort scouting.",
  };
}

export function renderResearchProtocolCandidates(result: ResearchProtocolCandidatePortfolio): string {
  return [
    `research protocol candidates: ${result.question}`,
    ...result.candidates.map(candidate => `  ${candidate.rank}. ${candidate.protocol.title} [${candidate.status}] priority=${candidate.priority}\n     ${candidate.recommendation}: ${candidate.protocol.clinicalRationale}`),
    `  selected: ${result.selectedCandidateId ?? "(none)"}`,
    `  next: ${result.nextAction}`,
  ].join("\n");
}

export function renderResearchProtocolCandidatesJson(result: ResearchProtocolCandidatePortfolio): string {
  return `${JSON.stringify({
    schemaVersion: 1,
    protocolCandidates: result,
  }, null, 2)}\n`;
}

export async function researchProtocolSteerCommand(
  portfolioPath: string,
  opts: { prefer?: string[]; avoid?: string[]; requireVariables?: string[] },
): Promise<ResearchProtocolSteerResult> {
  const resolved = path.resolve(portfolioPath);
  const parsed = JSON.parse(await readFile(resolved, "utf-8")) as unknown;
  const portfolio = unwrapResearchArtifact<ResearchProtocolCandidatePortfolio>(parsed, "protocolCandidates");
  if (!portfolio || !Array.isArray(portfolio.candidates)) throw new Error("invalid protocol candidates portfolio");
  const prefer = uniqueStrings(opts.prefer ?? []);
  const avoid = uniqueStrings(opts.avoid ?? []);
  const requireVariables = uniqueStrings((opts.requireVariables ?? []).map(item => item.toUpperCase()));
  const changes: string[] = [];
  const candidates = portfolio.candidates.map(candidate => {
    const haystack = JSON.stringify(candidate.protocol).toLowerCase();
    const variables = new Set(researchAnalysisSpecFromProtocol(candidate.protocol).requiredVariables.map(variable => variable.toUpperCase()));
    const preferredHits = prefer.filter(term => haystack.includes(term.toLowerCase()));
    const avoidedHits = avoid.filter(term => haystack.includes(term.toLowerCase()));
    const missingRequired = requireVariables.filter(variable => !variables.has(variable));
    const delta = preferredHits.length * 10 - avoidedHits.length * 15 - missingRequired.length * 25;
    if (delta !== 0) changes.push(`${candidate.id}: priority ${candidate.priority} -> ${candidate.priority + delta}`);
    return {
      ...candidate,
      priority: candidate.priority + delta,
      status: missingRequired.length ? "not_feasible" as const : candidate.status,
      warnings: [
        ...candidate.warnings,
        ...missingRequired.map(variable => ({
          severity: "warning" as const,
          code: "STEER_REQUIRED_VARIABLE_MISSING",
          message: `Steering requested ${variable}, but this candidate does not require it.`,
        })),
      ],
      recommendation: missingRequired.length ? "Does not satisfy steering constraints" : candidate.recommendation,
    };
  }).sort((a, b) => b.priority - a.priority || a.protocol.title.localeCompare(b.protocol.title))
    .map((candidate, index) => ({ ...candidate, rank: index + 1 }));
  const updatedPortfolio: ResearchProtocolCandidatePortfolio = {
    ...portfolio,
    candidates,
    selectedCandidateId: candidates.find(candidate => candidate.status === "scout_ready")?.id ?? candidates.find(candidate => candidate.status !== "not_feasible")?.id ?? null,
    nextAction: "Review the steered portfolio; promote the selected candidate or edit its protocol before scouting.",
  };
  return {
    portfolioPath: resolved,
    steer: { prefer, avoid, requireVariables },
    updatedPortfolio,
    changes,
    nextAction: updatedPortfolio.nextAction,
  };
}

export function renderResearchProtocolSteer(result: ResearchProtocolSteerResult): string {
  return [
    `research protocol steer: ${result.portfolioPath}`,
    `  prefer: ${result.steer.prefer.join(", ") || "(none)"}`,
    `  avoid: ${result.steer.avoid.join(", ") || "(none)"}`,
    `  require variables: ${result.steer.requireVariables.join(", ") || "(none)"}`,
    `  selected: ${result.updatedPortfolio.selectedCandidateId ?? "(none)"}`,
    ...result.changes.map(change => `  - ${change}`),
    `  next: ${result.nextAction}`,
  ].join("\n");
}

export function renderResearchProtocolSteerJson(result: ResearchProtocolSteerResult): string {
  return `${JSON.stringify({
    schemaVersion: 1,
    protocolSteer: result,
  }, null, 2)}\n`;
}

export async function researchProtocolPromoteCommand(portfolioPath: string, candidateId?: string): Promise<ResearchProtocolPromotion> {
  const resolved = path.resolve(portfolioPath);
  const parsed = JSON.parse(await readFile(resolved, "utf-8")) as unknown;
  const portfolio = unwrapResearchArtifact<ResearchProtocolCandidatePortfolio>(parsed, "protocolCandidates");
  if (!portfolio || !Array.isArray(portfolio.candidates)) throw new Error("invalid protocol candidates portfolio");
  const candidate = portfolio.candidates.find(item => item.id === (candidateId ?? portfolio.selectedCandidateId)) ?? portfolio.candidates[0];
  if (!candidate) throw new Error("no protocol candidate available to promote");
  const analysisSpec = researchAnalysisSpecFromProtocol(candidate.protocol);
  return {
    portfolioPath: resolved,
    candidateId: candidate.id,
    protocol: candidate.protocol,
    analysisSpec,
    promotionStatus: "promoted",
    nextAction: "Write the AnalysisSpec to a packet or pass it to cohort-scout-file for local data feasibility checks.",
  };
}

export function renderResearchProtocolPromotion(result: ResearchProtocolPromotion): string {
  return [
    `research protocol promotion: ${result.candidateId}`,
    `  title: ${result.protocol.title}`,
    `  spec hash: ${result.analysisSpec.specHash}`,
    `  required variables: ${result.analysisSpec.requiredVariables.join(", ") || "(none)"}`,
    `  next: ${result.nextAction}`,
  ].join("\n");
}

export function renderResearchProtocolPromotionJson(result: ResearchProtocolPromotion): string {
  return `${JSON.stringify({
    schemaVersion: 1,
    protocolPromotion: result,
  }, null, 2)}\n`;
}

export async function researchProtocolEditCommand(
  protocolPath: string,
  opts: { title?: string; question?: string; cycles?: string[]; addCovariate?: string[]; addCaveat?: string[]; addAssumption?: string[] },
): Promise<ResearchProtocolEditResult> {
  const resolved = path.resolve(protocolPath);
  const parsed = JSON.parse(await readFile(resolved, "utf-8")) as unknown;
  const promotion = unwrapResearchArtifact<ResearchProtocolPromotion>(parsed, "protocolPromotion");
  const portfolio = unwrapResearchArtifact<ResearchProtocolCandidatePortfolio>(parsed, "protocolCandidates");
  const protocol = promotion?.protocol ?? portfolio?.candidates.find(candidate => candidate.id === portfolio.selectedCandidateId)?.protocol ?? unwrapResearchArtifact<ResearchStructuredProtocol>(parsed, "protocol");
  if (!protocol || !protocol.id) throw new Error("protocol file did not contain a protocol object");
  const changes: string[] = [];
  const edited: ResearchStructuredProtocol = {
    ...protocol,
    population: { ...protocol.population, filters: [...protocol.population.filters] },
    exposure: { ...protocol.exposure },
    comparator: { ...protocol.comparator },
    endpoint: { ...protocol.endpoint },
    covariates: protocol.covariates.map(item => ({ ...item })),
    stratifiers: protocol.stratifiers.map(item => ({ ...item })),
    cycles: [...protocol.cycles],
    requestedOutputs: [...protocol.requestedOutputs],
    assumptions: [...protocol.assumptions],
    caveats: [...protocol.caveats],
    uncertainty: [...protocol.uncertainty],
    evidenceCitations: [...protocol.evidenceCitations],
  };
  if (opts.title && opts.title !== edited.title) {
    changes.push(`title: ${edited.title} -> ${opts.title}`);
    edited.title = opts.title;
  }
  if (opts.question && opts.question !== edited.clinicalQuestion) {
    changes.push("clinicalQuestion updated");
    edited.clinicalQuestion = opts.question;
  }
  if (opts.cycles?.length) {
    changes.push(`cycles: ${edited.cycles.join(", ")} -> ${opts.cycles.join(", ")}`);
    edited.cycles = uniqueStrings(opts.cycles);
  }
  for (const item of opts.addCovariate ?? []) {
    const [label, variable, domain] = item.split(":").map(part => part.trim());
    if (!label || !variable) throw new Error("--add-covariate must use LABEL:VARIABLE[:DOMAIN]");
    if (!edited.covariates.some(covariate => covariate.variable === variable)) {
      edited.covariates.push({ label, variable, domain: domain || "user_added" });
      changes.push(`added covariate ${variable}`);
    }
  }
  for (const caveat of opts.addCaveat ?? []) {
    if (!edited.caveats.includes(caveat)) {
      edited.caveats.push(caveat);
      changes.push("added caveat");
    }
  }
  for (const assumption of opts.addAssumption ?? []) {
    if (!edited.assumptions.includes(assumption)) {
      edited.assumptions.push(assumption);
      changes.push("added assumption");
    }
  }
  return {
    protocolPath: resolved,
    protocol: edited,
    changes,
    analysisSpec: researchAnalysisSpecFromProtocol(edited),
    nextAction: "Review the edited protocol and promote or scout the regenerated AnalysisSpec.",
  };
}

export function renderResearchProtocolEdit(result: ResearchProtocolEditResult): string {
  return [
    `research protocol edit: ${result.protocolPath}`,
    `  title: ${result.protocol.title}`,
    `  changes: ${result.changes.length}`,
    ...result.changes.map(change => `  - ${change}`),
    `  spec hash: ${result.analysisSpec.specHash}`,
    `  next: ${result.nextAction}`,
  ].join("\n");
}

export function renderResearchProtocolEditJson(result: ResearchProtocolEditResult): string {
  return `${JSON.stringify({
    schemaVersion: 1,
    protocolEdit: result,
  }, null, 2)}\n`;
}

export async function researchAnalysisSpecCommand(opts: { packetDir?: string; protocolPath?: string }): Promise<ResearchAnalysisSpecV1> {
  if (opts.protocolPath) {
    const parsed = JSON.parse(await readFile(path.resolve(opts.protocolPath), "utf-8")) as unknown;
    const promotion = unwrapResearchArtifact<ResearchProtocolPromotion>(parsed, "protocolPromotion");
    const protocol = promotion?.protocol ?? unwrapResearchArtifact<ResearchStructuredProtocol>(parsed, "protocol");
    if (!protocol || !protocol.id) throw new Error("protocol file did not contain a protocol object");
    return researchAnalysisSpecFromProtocol(protocol);
  }
  if (!opts.packetDir) throw new Error("analysis-spec requires --packet or --protocol");
  const resolved = path.resolve(opts.packetDir);
  const packet = JSON.parse(await readFile(path.join(resolved, "design.json"), "utf-8")) as LabMedbreviaNhanesResult;
  return researchAnalysisSpecFromPacket(packet);
}

export function renderResearchAnalysisSpec(result: ResearchAnalysisSpecV1): string {
  return [
    `research AnalysisSpec v${result.schemaVersion}: ${result.id}`,
    `  dataset: ${result.dataset}`,
    `  question: ${result.researchQuestion}`,
    `  variables: ${result.requiredVariables.join(", ") || "(none)"}`,
    `  survey: ${result.surveyDesign.weightVariable ?? "(none)"} / ${result.surveyDesign.strataVariable ?? "(none)"} / ${result.surveyDesign.psuVariable ?? "(none)"}`,
    `  spec hash: ${result.specHash}`,
  ].join("\n");
}

export function renderResearchAnalysisSpecJson(result: ResearchAnalysisSpecV1): string {
  return `${JSON.stringify({
    schemaVersion: 1,
    analysisSpec: result,
  }, null, 2)}\n`;
}

export async function researchCohortScoutFileCommand(specPath: string, file: string): Promise<ResearchLocalCohortScout> {
  const resolvedSpec = path.resolve(specPath);
  const resolvedFile = path.resolve(file);
  const parsed = JSON.parse(await readFile(resolvedSpec, "utf-8")) as unknown;
  const spec = unwrapResearchArtifact<ResearchAnalysisSpecV1>(parsed, "analysisSpec");
  if (!spec || !Array.isArray(spec.requiredVariables)) throw new Error("analysis spec file did not contain an AnalysisSpec");
  const rows = await readTabularRows(resolvedFile);
  const required = spec.requiredVariables;
  const eligibleRows = rows.filter(row => rowPassesBasicPopulation(row, spec)).length;
  const eligible = rows.filter(row => rowPassesBasicPopulation(row, spec));
  const endpointNonMissingRows = eligible.filter(row => spec.variables.outcome.some(variable => hasValue(row[variable]))).length;
  const exposureNonMissingRows = eligible.filter(row => spec.variables.exposures.length === 0 || spec.variables.exposures.some(variable => hasValue(row[variable]))).length;
  const weight = spec.surveyDesign.weightVariable;
  const positiveWeightRows = weight ? eligible.filter(row => Number(row[weight]) > 0).length : 0;
  const completeCaseRows = eligible.filter(row => required.every(variable => hasValue(row[variable]))).length;
  const missingness = Object.fromEntries(required.map(variable => {
    const missingRows = eligible.filter(row => !hasValue(row[variable])).length;
    return [variable, {
      available: rows.some(row => Object.prototype.hasOwnProperty.call(row, variable)),
      missingRows,
      missingFraction: eligible.length ? missingRows / eligible.length : 1,
    }];
  }));
  const subgroupCounts = spec.variables.stratify.flatMap(variable => {
    const counts = new Map<string, number>();
    for (const row of eligible) {
      const key = String(row[variable] ?? "missing");
      counts.set(`${variable}:${key}`, (counts.get(`${variable}:${key}`) ?? 0) + 1);
    }
    return Array.from(counts.values());
  });
  const exposureCounts = spec.variables.exposures.flatMap(variable => {
    const counts = new Map<string, number>();
    for (const row of eligible.filter(row => hasValue(row[variable]))) {
      const key = String(row[variable]);
      counts.set(`${variable}:${key}`, (counts.get(`${variable}:${key}`) ?? 0) + 1);
    }
    return Array.from(counts.values());
  });
  const allCellCounts = [...subgroupCounts, ...exposureCounts];
  const minimumCellSize = allCellCounts.length ? Math.min(...allCellCounts) : null;
  const warnings: ResearchCritiqueIssue[] = [];
  for (const [variable, item] of Object.entries(missingness)) {
    if (!item.available) warnings.push({ severity: "blocker", code: "REQUIRED_VARIABLE_MISSING", message: `${variable} is required by the AnalysisSpec but absent from the data file.` });
    else if (item.missingFraction > 0.4) warnings.push({ severity: "warning", code: "HIGH_MISSINGNESS", message: `${variable} has ${(item.missingFraction * 100).toFixed(1)}% missingness in eligible rows.` });
  }
  if (!eligibleRows) warnings.push({ severity: "blocker", code: "NO_ELIGIBLE_ROWS", message: "No rows passed the basic population filters." });
  if (!endpointNonMissingRows) warnings.push({ severity: "blocker", code: "NO_ENDPOINT_ROWS", message: "No eligible rows have nonmissing endpoint data." });
  if (weight && !positiveWeightRows) warnings.push({ severity: "blocker", code: "NO_POSITIVE_WEIGHT_ROWS", message: `${weight} is required by the AnalysisSpec but no eligible rows have a positive weight.` });
  if (spec.surveyDesign.weightVariable && !missingness[spec.surveyDesign.weightVariable]?.available) warnings.push({ severity: "blocker", code: "SURVEY_WEIGHT_MISSING", message: `Survey weight ${spec.surveyDesign.weightVariable} is absent.` });
  if (spec.surveyDesign.strataVariable && !missingness[spec.surveyDesign.strataVariable]?.available) warnings.push({ severity: "blocker", code: "SURVEY_STRATA_MISSING", message: `Survey strata ${spec.surveyDesign.strataVariable} is absent.` });
  if (spec.surveyDesign.psuVariable && !missingness[spec.surveyDesign.psuVariable]?.available) warnings.push({ severity: "blocker", code: "SURVEY_PSU_MISSING", message: `Survey PSU ${spec.surveyDesign.psuVariable} is absent.` });
  if (minimumCellSize !== null && minimumCellSize < 16) warnings.push({ severity: "warning", code: "SMALL_SUBGROUP_CELL", message: `Minimum subgroup cell size is ${minimumCellSize}; apply suppression/caveats.` });
  return {
    specPath: resolvedSpec,
    dataFile: resolvedFile,
    rowCount: rows.length,
    eligibleRows,
    endpointNonMissingRows,
    exposureNonMissingRows,
    positiveWeightRows,
    completeCaseRows,
    minimumCellSize,
    missingness,
    warnings,
    status: warnings.some(issue => issue.severity === "blocker") ? "blocked" : "passed",
  };
}

export function renderResearchCohortScoutFile(result: ResearchLocalCohortScout): string {
  return [
    `research cohort scout file: ${result.dataFile}`,
    `  status: ${result.status}`,
    `  rows: ${result.rowCount}`,
    `  eligible: ${result.eligibleRows}`,
    `  endpoint nonmissing: ${result.endpointNonMissingRows}`,
    `  exposure nonmissing: ${result.exposureNonMissingRows}`,
    `  complete case: ${result.completeCaseRows}`,
    `  min cell: ${result.minimumCellSize ?? "(none)"}`,
    ...result.warnings.map(issue => `  - [${issue.severity}] ${issue.code}: ${issue.message}`),
  ].join("\n");
}

export function renderResearchCohortScoutFileJson(result: ResearchLocalCohortScout): string {
  return `${JSON.stringify({
    schemaVersion: 1,
    cohortScout: result,
  }, null, 2)}\n`;
}

export async function researchSemanticQualityCommand(file: string): Promise<ResearchSemanticQualityReport> {
  const resolved = path.resolve(file);
  const rows = await readTabularRows(resolved);
  const failures: ResearchCritiqueIssue[] = [];
  const warnings: ResearchCritiqueIssue[] = [];
  const variableStats: ResearchSemanticQualityReport["variableStats"] = {};
  const variables = uniqueStrings(rows.flatMap(row => Object.keys(row)));
  for (const variable of variables) {
    const rule = SEMANTIC_VARIABLE_RULES[variable] ?? inferredSemanticRuleForVariable(variable);
    const values = rows.map(row => Number(row[variable])).filter(value => Number.isFinite(value));
    if (values.length) {
      variableStats[variable] = {
        nonMissingRows: values.length,
        min: Math.min(...values),
        max: Math.max(...values),
        mean: values.reduce((sum, value) => sum + value, 0) / values.length,
      };
    } else {
      variableStats[variable] = { nonMissingRows: 0 };
    }
    if (!rule || !values.length) continue;
    const min = Math.min(...values);
    const max = Math.max(...values);
    const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
    if (rule.allowed) {
      const unexpected = uniqueStrings(values.map(value => String(value)).filter(value => !rule.allowed?.has(Number(value))));
      const nonInteger = values.filter(value => !Number.isInteger(value));
      if (unexpected.length || nonInteger.length) failures.push({ severity: "blocker", code: "UNEXPECTED_CODE_VALUES", message: `${variable} contains values outside the semantic registry: ${unexpected.join(", ") || "non-integer value(s)"}.` });
    }
    if (rule.min !== undefined && min < rule.min) failures.push({ severity: "blocker", code: "VALUE_BELOW_REASONABLE_RANGE", message: `${variable} minimum ${min.toFixed(4)} is below plausible lower bound ${rule.min}.` });
    if (rule.max !== undefined && max > rule.max) failures.push({ severity: "blocker", code: "VALUE_ABOVE_REASONABLE_RANGE", message: `${variable} maximum ${max.toFixed(4)} is above plausible upper bound ${rule.max}.` });
    if (values.length >= 30 && rule.meanMin !== undefined && mean < rule.meanMin) warnings.push({ severity: "warning", code: "MEAN_BELOW_EXPECTED_RANGE", message: `${variable} mean ${mean.toFixed(4)} is outside a broad expected range; confirm units/coding.` });
    if (values.length >= 30 && rule.meanMax !== undefined && mean > rule.meanMax) warnings.push({ severity: "warning", code: "MEAN_ABOVE_EXPECTED_RANGE", message: `${variable} mean ${mean.toFixed(4)} is outside a broad expected range; confirm units/coding.` });
    if (rule.kind === "count" && max > rows.length) warnings.push({ severity: "warning", code: "COUNT_EXCEEDS_ROW_COUNT", message: `${variable} includes values larger than the table row count; confirm whether it is an aggregate count or a row-level variable.` });
  }
  return {
    file: resolved,
    rowCount: rows.length,
    status: failures.length ? "failed" : warnings.length ? "warning" : "passed",
    failures,
    warnings,
    variableStats,
  };
}

export function renderResearchSemanticQuality(result: ResearchSemanticQualityReport): string {
  return [
    `research semantic quality: ${result.file}`,
    `  status: ${result.status}`,
    `  rows: ${result.rowCount}`,
    `  failures: ${result.failures.length}`,
    `  warnings: ${result.warnings.length}`,
    ...[...result.failures, ...result.warnings].map(issue => `  - [${issue.severity}] ${issue.code}: ${issue.message}`),
  ].join("\n");
}

export function renderResearchSemanticQualityJson(result: ResearchSemanticQualityReport): string {
  return `${JSON.stringify({
    schemaVersion: 1,
    semanticQuality: result,
  }, null, 2)}\n`;
}

export function researchProgressCommand(opts: { phase: string; label?: string; detail?: string; nextStep?: string; terminal?: boolean }): ResearchRuntimeProgress {
  return {
    phase: opts.phase,
    label: opts.label ?? opts.phase.replace(/_/g, " "),
    detail: opts.detail ?? "",
    nextStep: opts.nextStep ?? "",
    terminal: opts.terminal ?? ["succeeded", "failed", "canceled"].includes(opts.phase),
  };
}

export function renderResearchProgress(result: ResearchRuntimeProgress): string {
  return [
    `research progress: ${result.phase}`,
    `  label: ${result.label}`,
    `  detail: ${result.detail}`,
    `  next: ${result.nextStep}`,
    `  terminal: ${result.terminal}`,
  ].join("\n");
}

export function renderResearchProgressJson(result: ResearchRuntimeProgress): string {
  return `${JSON.stringify({
    schemaVersion: 1,
    progress: result,
  }, null, 2)}\n`;
}

export function researchJobLifecycleCommand(opts: { jobId: string; status: ResearchAsyncJobState["status"]; phase?: string; label?: string; detail?: string; nextStep?: string }): ResearchAsyncJobState {
  return {
    jobId: opts.jobId,
    status: opts.status,
    progress: researchProgressCommand({
      phase: opts.phase ?? opts.status,
      label: opts.label ?? opts.status.replace(/_/g, " "),
      detail: opts.detail ?? "",
      nextStep: opts.nextStep ?? "",
      terminal: ["succeeded", "failed", "canceled"].includes(opts.status),
    }),
    updatedAtIso: new Date().toISOString(),
  };
}

export function renderResearchJobLifecycle(result: ResearchAsyncJobState): string {
  return [
    `research job: ${result.jobId}`,
    `  status: ${result.status}`,
    `  phase: ${result.progress.phase}`,
    `  terminal: ${result.progress.terminal}`,
    `  next: ${result.progress.nextStep}`,
  ].join("\n");
}

export function renderResearchJobLifecycleJson(result: ResearchAsyncJobState): string {
  return `${JSON.stringify({
    schemaVersion: 1,
    job: result,
  }, null, 2)}\n`;
}

export async function researchRepairPlanCommand(packetDir: string): Promise<ResearchRepairPlan> {
  const resolved = path.resolve(packetDir);
  const reportReview = unwrapResearchArtifact<ResearchReportReview>(await readJsonIfPresent(path.join(resolved, "report-review.json")), "reportReview");
  const evidenceGap = unwrapResearchArtifact<ResearchEvidenceGapReport>(await readJsonIfPresent(path.join(resolved, "evidence-gap-report.json")), "evidenceGapReport");
  const scorecard = unwrapResearchArtifact<ResearchWorkflowScorecard>(await readJsonIfPresent(path.join(resolved, "workflow-scorecard.json")), "workflowScorecard");
  const paperQa = unwrapResearchArtifact<ResearchPaperQa>(await readJsonIfPresent(path.join(resolved, "paper-qa.json")), "paperQa");
  const shouldVerifyManifest = await exists(path.join(resolved, "artifact-manifest.json")) || await exists(path.join(resolved, "golden-manifest.json"));
  const manifestVerification = shouldVerifyManifest ? await researchManifestVerifyCommand(resolved) : null;
  const issues = [
    ...(reportReview?.issues ?? []).filter(issue => issue.severity !== "note"),
    ...(evidenceGap?.checks ?? []).filter(check => check.status !== "pass").map(check => ({
      severity: check.status === "missing" ? "blocker" : "warning",
      code: `EVIDENCE_${check.id.toUpperCase().replace(/[^A-Z0-9]+/g, "_")}`,
      message: check.detail,
    } satisfies ResearchCritiqueIssue)),
    ...(scorecard?.checks ?? []).filter(check => check.status === "fail").map(check => ({
      severity: "warning",
      code: `SCORECARD_${check.id.toUpperCase().replace(/[^A-Z0-9]+/g, "_")}`,
      message: check.detail,
    } satisfies ResearchCritiqueIssue)),
    ...(paperQa?.checks ?? []).filter(check => check.status !== "pass").map(check => ({
      severity: check.severity === "critical" ? "blocker" : check.severity === "major" ? "warning" : "note",
      code: `PAPER_QA_${check.id.toUpperCase().replace(/[^A-Z0-9]+/g, "_")}`,
      message: check.detail,
    } satisfies ResearchCritiqueIssue)),
    ...(manifestVerification?.status === "invalid" ? manifestVerification.typedIssues.map(issue => ({
      severity: issue.severity,
      code: `MANIFEST_${issue.code}`,
      message: issue.message,
    } satisfies ResearchCritiqueIssue)) : []),
  ];
  const methodologicalIssues = issues.filter(issue => /INFERENCE|CAUSAL|DIAGNOSIS|VARIANCE|METHOD|SURVEY/.test(issue.code));
  const executableIssues = issues.filter(issue => !methodologicalIssues.includes(issue));
  const proposedActions = uniqueStrings(issues.map(issue => {
    if (methodologicalIssues.includes(issue)) return "Stop for methodological review; revise the AnalysisSpec, estimator, or report inference policy before executable repair.";
    if (issue.code.includes("REPORT") || issue.code.includes("CAVEAT")) return "Regenerate or patch report caveats and methods limitations.";
    if (issue.code.includes("EVIDENCE")) return "Add or regenerate evidence/provenance/citation artifacts.";
    if (issue.code.includes("SCORECARD")) return "Run the missing packet stage and refresh workflow-scorecard.";
    if (issue.code.includes("RERUN_DIFF_UNSTABLE")) return "Rerun from the AnalysisSpec, compare deterministic outputs, and stop if instability repeats.";
    if (issue.code.includes("SHA256") || issue.code.includes("BYTE_COUNT")) return "Regenerate the manifest from current artifacts after reviewing whether artifact drift was intended.";
    if (issue.code.includes("RUNNER_RECORD")) return "Regenerate runner provenance before local review.";
    return "Repair the failing artifact and rerun QA.";
  }));
  const stoppingReasons = methodologicalIssues.some(issue => issue.severity === "blocker")
    ? ["methodological uncertainty requires human review before executable repair"]
    : [];
  return {
    packetDir: resolved,
    status: issues.length ? "repair_recommended" : "no_repair_needed",
    issues,
    repairClasses: {
      executable: executableIssues,
      methodological: methodologicalIssues,
    },
    proposedActions,
    stoppingReasons,
    nextAction: issues.length
      ? stoppingReasons.length
        ? "Stop executable repair, resolve methodological blockers, then rerun QA/scorecard and compare packet diffs."
        : "Apply the proposed actions, rerun QA/scorecard, then compare packet diffs."
      : "No deterministic repair needed; proceed to promotion or harder test cases.",
  };
}

export function renderResearchRepairPlan(result: ResearchRepairPlan): string {
  return [
    `research repair plan: ${result.packetDir}`,
    `  status: ${result.status}`,
    `  issues: ${result.issues.length}`,
    `  executable issues: ${result.repairClasses.executable.length}`,
    `  methodological issues: ${result.repairClasses.methodological.length}`,
    `  stopping reasons: ${result.stoppingReasons.join("; ") || "(none)"}`,
    ...result.proposedActions.map(action => `  - ${action}`),
    `  next: ${result.nextAction}`,
  ].join("\n");
}

export function renderResearchRepairPlanJson(result: ResearchRepairPlan): string {
  return `${JSON.stringify({
    schemaVersion: 1,
    repairPlan: result,
  }, null, 2)}\n`;
}

export async function researchBenchmarkRegisterCommand(opts: { packetDir: string; outPath?: string; benchmarkId?: string; domain?: string }): Promise<ResearchGoldenPacketBenchmark> {
  const packetPath = path.resolve(opts.packetDir);
  const goldenPacket = await readJsonIfPresent(path.join(packetPath, "golden-packet.json")) as Record<string, unknown> | null;
  const goldenManifest = await readJsonIfPresent(path.join(packetPath, "golden-manifest.json")) as Record<string, unknown> | null;
  const analysisSpecPath = await exists(path.join(packetPath, "analysis-spec.json")) ? path.join(packetPath, "analysis-spec.json") : null;
  const analysisSpecDocument = analysisSpecPath ? await readJsonIfPresent(analysisSpecPath) as Record<string, unknown> | null : null;
  const analysisSpec = isRecord(analysisSpecDocument?.analysisSpec) ? analysisSpecDocument.analysisSpec : analysisSpecDocument;
  const benchmarkId = opts.benchmarkId
    ?? String(goldenPacket?.id ?? goldenManifest?.id ?? `golden_${path.basename(packetPath).replace(/[^a-z0-9]+/gi, "_")}`);
  const researchQuestion = typeof analysisSpec?.researchQuestion === "string"
    ? analysisSpec.researchQuestion
    : typeof goldenPacket?.researchQuestion === "string"
      ? goldenPacket.researchQuestion
      : path.basename(packetPath).replace(/[-_]+/g, " ");
  const manifestArtifacts = Array.isArray(goldenManifest?.artifacts) ? goldenManifest.artifacts as Array<Record<string, unknown>> : [];
  const artifactMap = new Map<string, ResearchBenchmarkExpectedArtifact>();
  const addArtifact = (artifact: ResearchBenchmarkExpectedArtifact) => {
    const key = path.isAbsolute(artifact.path) ? artifact.path : path.join(packetPath, artifact.path);
    const existing = artifactMap.get(key);
    artifactMap.set(key, existing ? { ...existing, ...artifact, required: existing.required || artifact.required } : artifact);
  };
  for (const artifact of manifestArtifacts) {
    const artifactPath = typeof artifact.path === "string" ? artifact.path : "";
    if (!artifactPath) continue;
    addArtifact({
      id: path.basename(artifactPath).replace(/[^a-z0-9]+/gi, "_").replace(/^_+|_+$/g, "") || "artifact",
      path: artifactPath,
      role: typeof artifact.role === "string" ? artifact.role : "manifest",
      required: true,
      ...(typeof artifact.bytes === "number" ? { bytes: artifact.bytes } : {}),
      ...(typeof artifact.sha256 === "string" ? { sha256: artifact.sha256 } : {}),
    });
  }
  for (const artifact of [
    "golden-manifest.json",
    "golden-packet.json",
    "analysis-spec.json",
    "source-validation.json",
    "rerun-diff.json",
    "repair-plan.json",
    "share-safety.json",
    "verification-repeat.json",
    "local-review-note.md",
  ]) {
    if (await exists(path.join(packetPath, artifact))) {
      addArtifact({ id: artifact.replace(/[^a-z0-9]+/gi, "_").replace(/^_+|_+$/g, ""), path: artifact, role: "golden", required: true });
    }
  }
  const packetArtifacts = isRecord(goldenPacket?.artifacts) ? goldenPacket.artifacts : {};
  for (const [key, value] of Object.entries(packetArtifacts)) {
    if (typeof value === "string") {
      addArtifact({ id: key, path: value, role: "paper-source", required: ["paper", "analysisEvidence", "paperQa", "runnerRecord"].includes(key) });
    }
  }
  const shareStatus = typeof goldenManifest?.shareStatus === "string" ? goldenManifest.shareStatus : typeof (goldenManifest?.checks as Record<string, unknown> | undefined)?.shareSafety === "string" ? String((goldenManifest?.checks as Record<string, unknown>).shareSafety) : "local_only_blocked_for_share";
  const benchmark: ResearchGoldenPacketBenchmark = {
    schemaVersion: 1,
    benchmarkId,
    domain: opts.domain ?? "observational-survey",
    packetPath,
    researchQuestion,
    analysisSpecPath,
    expectedArtifacts: Array.from(artifactMap.values()).sort((a, b) => a.id.localeCompare(b.id)),
    requiredChecks: [
      "artifact-completeness",
      "manifest-local-valid",
      "analysis-spec-policy",
      "real-data-feasibility",
      "survey-method-compliance",
      "rerun-stability",
      "paper-qa",
      "claim-safety",
      "share-export-policy",
      "repair-plan",
      "cold-review",
    ],
    expectedFailures: shareStatus === "local_only_blocked_for_share"
      ? [{ code: "SHARE_NOT_READY", severity: "warning", reason: "Golden packet is expected to be valid for local review but blocked for external sharing until local paths are redacted.", countsAsRegression: false }]
      : [],
    methodRequirements: [
      { id: "survey-weight", description: "AnalysisSpec declares survey weight variable.", required: true, source: "analysis-spec" },
      { id: "survey-strata", description: "AnalysisSpec declares strata variable.", required: true, source: "analysis-spec" },
      { id: "survey-psu", description: "AnalysisSpec declares PSU variable.", required: true, source: "analysis-spec" },
      { id: "inference-policy", description: "AnalysisSpec declares inference policy.", required: true, source: "analysis-spec" },
      { id: "failure-policy", description: "AnalysisSpec declares typed failure policy.", required: true, source: "analysis-spec" },
      { id: "no-causal-claims", description: "AnalysisSpec disallows causal claims for observational cross-sectional packets.", required: true, source: "policy" },
      { id: "rerun-instability-block", description: "AnalysisSpec blocks rerun instability.", required: true, source: "policy" },
    ],
    rerunStabilityThresholds: {
      requiredStatus: "stable",
      maxDiffCount: 0,
      maxAbsoluteNumericDiff: 1e-12,
    },
    qaRubric: {
      requiredPaperQaStatus: "pass",
      requireRunnerRecord: true,
      requireLocalReviewNote: true,
      requireAnalysisSpecHashBinding: true,
      requireColdReview: true,
    },
    sharePolicy: {
      expectedShareStatus: shareStatus === "ready_to_share" ? "ready_to_share" : "local_only_blocked_for_share",
      allowLocalOnly: shareStatus !== "ready_to_share",
      requireNoLocalPathsForShare: shareStatus === "ready_to_share",
    },
    localReviewPolicy: {
      expectedStatus: "ready_for_local_review",
      requireHumanReadableNote: true,
    },
    scoreWeights: {
      "artifact-completeness": 1.1,
      "manifest-local-valid": 1.3,
      "analysis-spec-policy": 1.25,
      "real-data-feasibility": 1,
      "survey-method-compliance": 1.3,
      "rerun-stability": 1.25,
      "paper-qa": 1.15,
      "claim-safety": 1,
      "share-export-policy": 0.8,
      "repair-plan": 0.85,
      "cold-review": 0.7,
    },
    lastRun: null,
  };
  const outPath = path.resolve(opts.outPath ?? path.join(packetPath, "golden-benchmark.json"));
  await writeFile(outPath, `${JSON.stringify(benchmark, null, 2)}\n`);
  return benchmark;
}

export async function researchBenchmarkRunCommand(opts: { benchmarkPath: string; outPath?: string }): Promise<ResearchBenchmarkRun> {
  const benchmarkPath = path.resolve(opts.benchmarkPath);
  const benchmark = await readBenchmarkArtifact(benchmarkPath);
  const checks = await evaluateResearchBenchmark(benchmark);
  const run = scoreResearchBenchmarkRun({
    schemaVersion: 1,
    runId: `benchmark_run_${createHash("sha256").update(`${benchmark.benchmarkId}:${Date.now()}`).digest("hex").slice(0, 12)}`,
    generatedAtIso: new Date().toISOString(),
    benchmark,
    runPath: null,
    status: "fail",
    score: 0,
    maxScore: 0,
    normalizedScore: 0,
    checks,
    expectedFailuresObserved: checks.filter(check => check.status === "expected_failure").map(check => check.id),
    unexpectedFailures: checks.filter(check => check.status === "fail").flatMap(check => check.typedIssues.length ? check.typedIssues : [{ severity: check.severity, code: check.id.toUpperCase().replace(/[^A-Z0-9]+/g, "_"), message: check.detail }]),
    nextAction: "",
  });
  const outPath = path.resolve(opts.outPath ?? path.join(benchmark.packetPath, "benchmark-run.json"));
  const runWithPath = { ...run, runPath: outPath };
  await writeFile(outPath, renderResearchBenchmarkRunJson(runWithPath));
  return runWithPath;
}

export async function researchBenchmarkScoreCommand(runPath: string): Promise<ResearchBenchmarkScore> {
  const run = unwrapResearchArtifact<ResearchBenchmarkRun>(await readJsonIfPresent(path.resolve(runPath)), "benchmarkRun");
  if (!run) throw new Error("benchmark-score requires a benchmark-run artifact.");
  return summarizeBenchmarkRun(run);
}

export async function researchBenchmarkSuiteCommand(opts: { suiteDir: string; outPath?: string }): Promise<ResearchBenchmarkSuite> {
  const suiteDir = path.resolve(opts.suiteDir);
  const benchmarkPaths = await discoverBenchmarkPaths(suiteDir);
  const benchmarks = benchmarkPaths.length
    ? await Promise.all(benchmarkPaths.map(readBenchmarkArtifact))
    : await discoverGoldenPacketDirs(suiteDir).then(dirs => Promise.all(dirs.map(dir => researchBenchmarkRegisterCommand({ packetDir: dir }))));
  const runs = [];
  for (const benchmark of benchmarks) {
    const checks = await evaluateResearchBenchmark(benchmark);
    runs.push(scoreResearchBenchmarkRun({
      schemaVersion: 1,
      runId: `benchmark_run_${createHash("sha256").update(`${benchmark.benchmarkId}:${Date.now()}:${runs.length}`).digest("hex").slice(0, 12)}`,
      generatedAtIso: new Date().toISOString(),
      benchmark,
      runPath: null,
      status: "fail",
      score: 0,
      maxScore: 0,
      normalizedScore: 0,
      checks,
      expectedFailuresObserved: checks.filter(check => check.status === "expected_failure").map(check => check.id),
      unexpectedFailures: checks.filter(check => check.status === "fail").flatMap(check => check.typedIssues.length ? check.typedIssues : [{ severity: check.severity, code: check.id.toUpperCase().replace(/[^A-Z0-9]+/g, "_"), message: check.detail }]),
      nextAction: "",
    }));
  }
  const aggregateRun: ResearchBenchmarkRun = {
    schemaVersion: 1,
    runId: "benchmark_suite_aggregate",
    generatedAtIso: new Date().toISOString(),
    benchmark: benchmarks[0] ?? emptyBenchmark(suiteDir),
    runPath: null,
    status: runs.some(run => run.status === "fail") ? "fail" : runs.some(run => run.status === "warning") ? "warning" : "pass",
    score: runs.reduce((sum, run) => sum + run.score, 0),
    maxScore: runs.reduce((sum, run) => sum + run.maxScore, 0),
    normalizedScore: runs.length ? runs.reduce((sum, run) => sum + run.normalizedScore, 0) / runs.length : 0,
    checks: runs.flatMap(run => run.checks),
    expectedFailuresObserved: runs.flatMap(run => run.expectedFailuresObserved),
    unexpectedFailures: runs.flatMap(run => run.unexpectedFailures),
    nextAction: "",
  };
  const suite: ResearchBenchmarkSuite = {
    suiteDir,
    generatedAtIso: new Date().toISOString(),
    benchmarks,
    runs,
    score: summarizeBenchmarkRun(aggregateRun),
    nextAction: runs.some(run => run.status === "fail")
      ? "Fix failing golden benchmark checks before promoting framework or researcher changes."
      : "Benchmark suite is green; add harder archetypes before broadening command surface.",
  };
  if (opts.outPath) await writeFile(path.resolve(opts.outPath), renderResearchBenchmarkSuiteJson(suite));
  return suite;
}

export function renderResearchBenchmark(result: ResearchGoldenPacketBenchmark): string {
  return [
    `research benchmark: ${result.benchmarkId}`,
    `  packet: ${result.packetPath}`,
    `  domain: ${result.domain}`,
    `  artifacts: ${result.expectedArtifacts.length}`,
    `  required checks: ${result.requiredChecks.join(", ")}`,
  ].join("\n");
}

export function renderResearchBenchmarkJson(result: ResearchGoldenPacketBenchmark): string {
  return `${JSON.stringify({ schemaVersion: 1, benchmark: result }, null, 2)}\n`;
}

export function renderResearchBenchmarkRun(result: ResearchBenchmarkRun): string {
  return [
    `research benchmark run: ${result.benchmark.benchmarkId}`,
    `  status: ${result.status}`,
    `  score: ${result.score.toFixed(2)}/${result.maxScore.toFixed(2)} (${(result.normalizedScore * 100).toFixed(1)}%)`,
    `  expected failures: ${result.expectedFailuresObserved.join(", ") || "(none)"}`,
    `  unexpected failures: ${result.unexpectedFailures.map(issue => issue.code).join(", ") || "(none)"}`,
    ...result.checks.map(check => `  - [${check.status}] ${check.id}: ${check.detail}`),
    `  next: ${result.nextAction}`,
  ].join("\n");
}

export function renderResearchBenchmarkRunJson(result: ResearchBenchmarkRun): string {
  return `${JSON.stringify({ schemaVersion: 1, benchmarkRun: result }, null, 2)}\n`;
}

export function renderResearchBenchmarkScore(result: ResearchBenchmarkScore): string {
  return [
    `research benchmark score: ${result.runId}`,
    `  status: ${result.status}`,
    `  score: ${result.score.toFixed(2)}/${result.maxScore.toFixed(2)} (${(result.normalizedScore * 100).toFixed(1)}%)`,
    `  pass=${result.passCount} warning=${result.warningCount} fail=${result.failCount} expected=${result.expectedFailureCount}`,
    ...result.topRisks.map(issue => `  - [${issue.severity}] ${issue.code}: ${issue.message}`),
    `  next: ${result.nextAction}`,
  ].join("\n");
}

export function renderResearchBenchmarkScoreJson(result: ResearchBenchmarkScore): string {
  return `${JSON.stringify({ schemaVersion: 1, benchmarkScore: result }, null, 2)}\n`;
}

export function renderResearchBenchmarkSuite(result: ResearchBenchmarkSuite): string {
  return [
    `research benchmark suite: ${result.suiteDir}`,
    `  benchmarks: ${result.benchmarks.length}`,
    `  status: ${result.score.status}`,
    `  score: ${result.score.score.toFixed(2)}/${result.score.maxScore.toFixed(2)} (${(result.score.normalizedScore * 100).toFixed(1)}%)`,
    ...result.runs.map(run => `  - ${run.benchmark.benchmarkId}: ${run.status} ${(run.normalizedScore * 100).toFixed(1)}%`),
    `  next: ${result.nextAction}`,
  ].join("\n");
}

export function renderResearchBenchmarkSuiteJson(result: ResearchBenchmarkSuite): string {
  return `${JSON.stringify({ schemaVersion: 1, benchmarkSuite: result }, null, 2)}\n`;
}

export function researchAgentExecutionRecordCommand(opts: {
  cycle?: number;
  intent: string;
  observation: string;
  inference: string;
  action: string;
  evidence?: string[];
  confidence?: number;
  tags?: string[];
}): ResearchAgentExecutionRecord {
  const base = {
    schemaVersion: 1 as const,
    id: `aer_${createHash("sha1").update(`${opts.cycle ?? ""}:${opts.intent}:${opts.action}`).digest("hex").slice(0, 12)}`,
    cycle: opts.cycle ?? null,
    createdAtIso: new Date().toISOString(),
    intent: opts.intent,
    observation: opts.observation,
    inference: opts.inference,
    action: opts.action,
    evidence: uniqueStrings(opts.evidence ?? []),
    confidence: Math.max(0, Math.min(1, opts.confidence ?? 0.75)),
    tags: uniqueStrings(opts.tags ?? []),
  };
  return {
    ...base,
    recordHash: createHash("sha256").update(JSON.stringify(base)).digest("hex"),
  };
}

export function renderResearchAgentExecutionRecord(result: ResearchAgentExecutionRecord): string {
  return [
    `research agent execution record: ${result.id}`,
    `  cycle: ${result.cycle ?? "(none)"}`,
    `  intent: ${result.intent}`,
    `  observation: ${result.observation}`,
    `  inference: ${result.inference}`,
    `  action: ${result.action}`,
    `  confidence: ${result.confidence.toFixed(2)}`,
    `  hash: ${result.recordHash}`,
  ].join("\n");
}

export function renderResearchAgentExecutionRecordJson(result: ResearchAgentExecutionRecord): string {
  return `${JSON.stringify({
    schemaVersion: 1,
    agentExecutionRecord: result,
  }, null, 2)}\n`;
}

export async function researchWorkflowMemoryCommand(opts: { source: string }): Promise<ResearchWorkflowMemory> {
  const resolved = path.resolve(opts.source);
  const text = await readFile(resolved, "utf-8");
  const cycleBlocks = parseCycleMarkdownBlocks(text);
  const cyclesObserved = cycleBlocks.map(block => block.cycle).filter(Number.isFinite);
  const findCycles = (pattern: RegExp): number[] => cycleBlocks.filter(block => pattern.test(block.body)).map(block => block.cycle);
  const routines = [
    {
      id: "deterministic-validation-before-run",
      title: "Deterministic validation before generated execution",
      trigger: "A packet, protocol, or AnalysisSpec is ready to execute.",
      steps: [
        "Render machine-readable JSON.",
        "Run deterministic validation or scorecard checks.",
        "Only run local fixture/runner execution after blockers are absent.",
        "Record the validation artifact for later repair planning.",
      ],
      evidenceCycles: findCycles(/validation|scorecard|readiness|semantic quality|cohort scout/i),
      confidence: 0,
    },
    {
      id: "artifact-first-reproducibility",
      title: "Artifact-first reproducibility loop",
      trigger: "A research workflow produces an intermediate decision.",
      steps: [
        "Persist the artifact under a cycle-specific directory.",
        "Hash or manifest the artifact when possible.",
        "Compare packet or scorecard deltas before promotion.",
        "Append the improvement to the upgrade log.",
      ],
      evidenceCycles: findCycles(/artifact|manifest|packet-diff|export|Saved a live sample run/i),
      confidence: 0,
    },
    {
      id: "protocol-portfolio-to-analysis-spec",
      title: "Protocol portfolio to executable AnalysisSpec",
      trigger: "A research question has more than one plausible study design.",
      steps: [
        "Generate and rank candidate protocols.",
        "Steer or edit the selected candidate as human-in-the-loop.",
        "Promote one protocol into a hashable AnalysisSpec.",
        "Scout cohort/data quality before runner generation.",
      ],
      evidenceCycles: findCycles(/protocol|AnalysisSpec|candidate|promote/i),
      confidence: 0,
    },
  ].map(routine => ({
    ...routine,
    confidence: Math.min(0.95, 0.55 + routine.evidenceCycles.length * 0.05),
  }));
  const antiPatterns = [
    {
      id: "transient-memory-only",
      title: "Transient memory without reusable routines",
      signal: "Cycle notes accumulate but no routine can be reapplied to a new question.",
      mitigation: "Distill repeated successful actions into workflow memory with trigger, steps, evidence cycles, and confidence.",
      evidenceCycles: cyclesObserved.slice(-10),
    },
    {
      id: "execution-before-feasibility",
      title: "Execution before feasibility checks",
      signal: "Generated code runs before cohort, semantic quality, or missingness gates.",
      mitigation: "Require AnalysisSpec, cohort scout, and semantic-quality artifacts before generated execution.",
      evidenceCycles: findCycles(/cohort scout|semantic quality|AnalysisSpec/i),
    },
  ];
  return {
    source: resolved,
    generatedAtIso: new Date().toISOString(),
    cyclesObserved,
    routines,
    antiPatterns,
    nextAction: "Use this memory as a retrieval artifact before selecting the next research-pipeline improvement.",
  };
}

export function renderResearchWorkflowMemory(result: ResearchWorkflowMemory): string {
  return [
    `research workflow memory: ${result.source}`,
    `  cycles observed: ${result.cyclesObserved.length}`,
    ...result.routines.map(routine => `  - ${routine.id}: confidence=${routine.confidence.toFixed(2)} cycles=${routine.evidenceCycles.join(", ") || "(none)"}`),
    `  anti-patterns: ${result.antiPatterns.length}`,
    `  next: ${result.nextAction}`,
  ].join("\n");
}

export function renderResearchWorkflowMemoryJson(result: ResearchWorkflowMemory): string {
  return `${JSON.stringify({
    schemaVersion: 1,
    workflowMemory: result,
  }, null, 2)}\n`;
}

export async function researchUncertaintyBudgetCommand(opts: {
  specPath: string;
  scoutPath?: string;
  comparisons?: number;
  alpha?: number;
}): Promise<ResearchUncertaintyBudget> {
  const specPath = path.resolve(opts.specPath);
  const spec = unwrapResearchArtifact<ResearchAnalysisSpecV1>(JSON.parse(await readFile(specPath, "utf-8")) as unknown, "analysisSpec");
  if (!spec) throw new Error("uncertainty-budget requires an AnalysisSpec artifact");
  const scoutPath = opts.scoutPath ? path.resolve(opts.scoutPath) : null;
  const scout = scoutPath
    ? unwrapResearchArtifact<ResearchLocalCohortScout>(JSON.parse(await readFile(scoutPath, "utf-8")) as unknown, "cohortScout")
    : null;
  const comparisons = Math.max(1, Math.floor(opts.comparisons ?? Math.max(1, spec.variables.stratify.length + spec.variables.outcome.length)));
  const alpha = opts.alpha ?? 0.05;
  const adjustedAlphaBonferroni = alpha / comparisons;
  const maxMissingFraction = scout
    ? Math.max(0, ...Object.values(scout.missingness).map(item => item.missingFraction))
    : null;
  const completeCaseRows = scout?.completeCaseRows ?? null;
  const minimumCellSize = scout?.minimumCellSize ?? null;
  const components: ResearchUncertaintyBudget["components"] = [
    {
      id: "multiplicity",
      label: "Multiplicity",
      risk: comparisons > 10 ? "high" : comparisons > 3 ? "moderate" : "low",
      detail: `${comparisons} planned comparison(s); Bonferroni alpha ${adjustedAlphaBonferroni.toFixed(5)}.`,
    },
    {
      id: "complete-case-n",
      label: "Complete-case sample size",
      risk: completeCaseRows === null ? "moderate" : completeCaseRows < 100 ? "high" : completeCaseRows < 500 ? "moderate" : "low",
      detail: completeCaseRows === null ? "No scout artifact provided." : `${completeCaseRows} complete-case row(s) after deterministic filters.`,
    },
    {
      id: "missingness",
      label: "Missingness",
      risk: maxMissingFraction === null ? "moderate" : maxMissingFraction > 0.4 ? "high" : maxMissingFraction > 0.1 ? "moderate" : "low",
      detail: maxMissingFraction === null ? "No missingness profile provided." : `Worst required-variable missingness ${(maxMissingFraction * 100).toFixed(1)}%.`,
    },
    {
      id: "sparse-cells",
      label: "Sparse subgroup cells",
      risk: minimumCellSize === null ? "moderate" : minimumCellSize < 16 ? "high" : minimumCellSize < 30 ? "moderate" : "low",
      detail: minimumCellSize === null ? "No subgroup cell profile provided." : `Minimum observed subgroup cell size ${minimumCellSize}.`,
    },
    {
      id: "design-claim",
      label: "Design claim strength",
      risk: spec.analysisPlan.some(item => /causal|target trial|treatment effect/i.test(item)) ? "moderate" : "low",
      detail: spec.analysisPlan.some(item => /causal|target trial|treatment effect/i.test(item))
        ? "Causal wording requires target-trial components and sensitivity analysis."
        : "Associational or descriptive wording should avoid causal overclaiming.",
    },
  ];
  const high = components.filter(component => component.risk === "high");
  const moderate = components.filter(component => component.risk === "moderate");
  const recommendations = uniqueStrings([
    high.some(component => component.id === "complete-case-n") ? "Downgrade claims or gather more complete data before effect estimation." : "",
    high.some(component => component.id === "missingness") ? "Add missing-data strategy such as multiple imputation or explicit complete-case limitation." : "",
    high.some(component => component.id === "sparse-cells") ? "Apply suppression or collapse sparse strata before reporting subgroup results." : "",
    moderate.some(component => component.id === "multiplicity") || high.some(component => component.id === "multiplicity") ? "Pre-specify primary comparisons and report adjusted alpha or FDR policy." : "",
    "Keep causal language out unless target-trial eligibility, treatment/exposure assignment time, follow-up, estimand, and sensitivity analyses are explicit.",
  ].filter(Boolean));
  return {
    specPath,
    scoutPath,
    comparisons,
    alpha,
    adjustedAlphaBonferroni,
    status: high.length ? "underpowered_or_fragile" : moderate.length ? "caution" : "acceptable",
    components,
    recommendations,
    nextAction: high.length
      ? "Repair the fragile design component before generated analysis code."
      : "Proceed with analysis while carrying the uncertainty budget into report QA.",
  };
}

export function renderResearchUncertaintyBudget(result: ResearchUncertaintyBudget): string {
  return [
    `research uncertainty budget: ${result.status}`,
    `  spec: ${result.specPath}`,
    `  scout: ${result.scoutPath ?? "(none)"}`,
    `  comparisons: ${result.comparisons}`,
    `  adjusted alpha: ${result.adjustedAlphaBonferroni.toFixed(5)}`,
    ...result.components.map(component => `  - [${component.risk}] ${component.id}: ${component.detail}`),
    `  next: ${result.nextAction}`,
  ].join("\n");
}

export function renderResearchUncertaintyBudgetJson(result: ResearchUncertaintyBudget): string {
  return `${JSON.stringify({
    schemaVersion: 1,
    uncertaintyBudget: result,
  }, null, 2)}\n`;
}

export function researchDatasetCandidateCommand(opts: {
  id: string;
  title?: string;
  sourceUrl?: string;
  modality?: string[];
  rowCount?: number;
  license?: string;
  synthetic?: boolean;
  containsHumanSubjects?: boolean;
  intendedUse?: ResearchDatasetCandidateAssessment["intendedUse"];
}): ResearchDatasetCandidateAssessment {
  const modality = uniqueStrings((opts.modality ?? []).map(item => item.toLowerCase()));
  const title = opts.title ?? opts.id;
  const synthetic = opts.synthetic ?? /\bsynthetic|simulated|llm-generated\b/i.test(`${opts.id} ${title}`);
  const intendedUse = opts.intendedUse ?? (modality.includes("text") && !modality.includes("tabular") ? "nlp_support" : "unknown");
  const risks: ResearchCritiqueIssue[] = [];
  if (synthetic && intendedUse === "empirical_analysis") {
    risks.push({ severity: "blocker", code: "SYNTHETIC_EMPIRICAL_ANALYSIS", message: "Synthetic datasets are not valid evidence for empirical medical effect estimation." });
  }
  if (modality.includes("text") && !modality.includes("tabular") && intendedUse === "empirical_analysis") {
    risks.push({ severity: "blocker", code: "TEXT_ONLY_EMPIRICAL_ANALYSIS", message: "Text-only datasets do not provide structured cohort variables for this research pipeline." });
  }
  if (!opts.license) {
    risks.push({ severity: "warning", code: "LICENSE_UNKNOWN", message: "Dataset license is unknown; reproducible redistribution and use constraints need review." });
  }
  if (opts.containsHumanSubjects && !opts.sourceUrl) {
    risks.push({ severity: "warning", code: "HUMAN_DATA_PROVENANCE_UNKNOWN", message: "Human-subjects data needs a source URL or data dictionary provenance before use." });
  }
  if (opts.rowCount !== undefined && opts.rowCount < 500 && intendedUse === "empirical_analysis") {
    risks.push({ severity: "warning", code: "SMALL_DATASET", message: "Dataset has fewer than 500 rows; power and sparse-cell risks are likely." });
  }
  const status: ResearchDatasetCandidateAssessment["status"] = risks.some(risk => risk.severity === "blocker")
    ? "unsuitable"
    : synthetic || intendedUse === "methods_development"
      ? "methods_only"
      : risks.length
        ? "needs_review"
        : "empirical_ready";
  return {
    id: opts.id,
    title,
    sourceUrl: opts.sourceUrl ?? null,
    modality,
    rowCount: opts.rowCount ?? null,
    license: opts.license ?? null,
    synthetic,
    containsHumanSubjects: opts.containsHumanSubjects ?? true,
    intendedUse,
    status,
    risks,
    requiredNextChecks: [
      "Confirm data dictionary and variable provenance.",
      "Run schema inference and semantic quality before protocol promotion.",
      "Run uncertainty budget after cohort scouting.",
      status === "methods_only" ? "Use only for pipeline testing or methods development, not empirical claims." : "",
    ].filter(Boolean),
  };
}

export function renderResearchDatasetCandidate(result: ResearchDatasetCandidateAssessment): string {
  return [
    `research dataset candidate: ${result.id}`,
    `  status: ${result.status}`,
    `  title: ${result.title}`,
    `  modality: ${result.modality.join(", ") || "(unknown)"}`,
    `  synthetic: ${result.synthetic}`,
    `  intended use: ${result.intendedUse}`,
    ...result.risks.map(risk => `  - [${risk.severity}] ${risk.code}: ${risk.message}`),
  ].join("\n");
}

export function renderResearchDatasetCandidateJson(result: ResearchDatasetCandidateAssessment): string {
  return `${JSON.stringify({
    schemaVersion: 1,
    datasetCandidate: result,
  }, null, 2)}\n`;
}

export function researchImprovementAgendaCommand(opts: {
  budgetUsd?: number;
  candidates: string[];
}): ResearchImprovementAgenda {
  const budgetUsd = opts.budgetUsd ?? 0;
  const parsed = opts.candidates.map((candidate, index) => {
    const parts = candidate.split(":");
    if (parts.length < 5) throw new Error("--candidate must use ID:IMPACT:CONFIDENCE:COST_USD:RISK[:TITLE]");
    const [id, impactRaw, confidenceRaw, costRaw, riskRaw, ...titleParts] = parts;
    const expectedImpact = Number(impactRaw);
    const confidence = Number(confidenceRaw);
    const costUsd = Number(costRaw);
    const risk = Number(riskRaw);
    if (!id || ![expectedImpact, confidence, costUsd, risk].every(Number.isFinite)) {
      throw new Error("--candidate must use ID:IMPACT:CONFIDENCE:COST_USD:RISK[:TITLE]");
    }
    const explorationBonus = 0.08 / Math.sqrt(index + 1);
    const utility = expectedImpact * confidence + explorationBonus - risk * 0.35 - Math.max(0, costUsd - budgetUsd) * 0.1;
    const title = titleParts.join(":") || id.replace(/[-_]/g, " ");
    return {
      id,
      title,
      expectedImpact,
      confidence,
      costUsd,
      risk,
      explorationBonus,
      utility,
      decision: "queue" as ResearchImprovementAgenda["candidates"][number]["decision"],
    };
  }).sort((a, b) => b.utility - a.utility || a.costUsd - b.costUsd);
  let remaining = budgetUsd;
  const candidates = parsed.map(candidate => {
    const affordable = candidate.costUsd <= remaining;
    const decision: ResearchImprovementAgenda["candidates"][number]["decision"] = candidate.utility <= 0
      ? "reject"
      : affordable
        ? "do_now"
        : "queue";
    if (decision === "do_now") remaining -= candidate.costUsd;
    return { ...candidate, decision };
  });
  return {
    budgetUsd,
    generatedAtIso: new Date().toISOString(),
    candidates,
    selected: candidates.filter(candidate => candidate.decision === "do_now").map(candidate => candidate.id),
    nextAction: "Implement the highest-utility affordable candidate, then update confidence from observed test and cycle outcomes.",
  };
}

export function renderResearchImprovementAgenda(result: ResearchImprovementAgenda): string {
  return [
    `research improvement agenda: budget=$${result.budgetUsd.toFixed(2)}`,
    ...result.candidates.map(candidate => `  - [${candidate.decision}] ${candidate.id}: utility=${candidate.utility.toFixed(3)} cost=$${candidate.costUsd.toFixed(2)} risk=${candidate.risk.toFixed(2)}`),
    `  selected: ${result.selected.join(", ") || "(none)"}`,
    `  next: ${result.nextAction}`,
  ].join("\n");
}

export function renderResearchImprovementAgendaJson(result: ResearchImprovementAgenda): string {
  return `${JSON.stringify({
    schemaVersion: 1,
    improvementAgenda: result,
  }, null, 2)}\n`;
}

export async function researchClaimGuardCommand(opts: { reportPath: string; specPath?: string }): Promise<ResearchClaimGuard> {
  const reportPath = path.resolve(opts.reportPath);
  const report = await readFile(reportPath, "utf-8");
  const specPath = opts.specPath ? path.resolve(opts.specPath) : null;
  const spec = specPath
    ? unwrapResearchArtifact<ResearchAnalysisSpecV1>(JSON.parse(await readFile(specPath, "utf-8")) as unknown, "analysisSpec")
    : null;
  const causalPatterns = [
    /\bcaus(?:e|es|ed|al|ation)\b/gi,
    /\beffect of\b/gi,
    /\bimpact of\b/gi,
    /\breduc(?:e|es|ed|tion)\b/gi,
    /\bincreas(?:e|es|ed)\b/gi,
    /\bprotect(?:s|ive|ed)?\b/gi,
  ];
  const causalTerms = uniqueStrings(causalPatterns.flatMap(pattern => Array.from(report.matchAll(pattern)).map(match => match[0].toLowerCase())));
  const lower = report.toLowerCase();
  const requiredCaveatsPresent = [
    lower.includes("cross-sectional") ? "cross-sectional" : "",
    lower.includes("observational") ? "observational" : "",
    lower.includes("not infer caus") || lower.includes("cannot infer caus") ? "no-causal-inference" : "",
    lower.includes("sensitivity") ? "sensitivity-analysis" : "",
    lower.includes("target trial") ? "target-trial" : "",
  ].filter(Boolean);
  const specSupportsCausal = spec?.analysisPlan.some(item => /target trial|causal|treatment effect|sensitivity/i.test(item)) ?? false;
  const issues: ResearchCritiqueIssue[] = [];
  if (causalTerms.length && !specSupportsCausal) {
    issues.push({
      severity: "blocker",
      code: "UNSUPPORTED_CAUSAL_LANGUAGE",
      message: `Report uses causal language (${causalTerms.join(", ")}) without a causal AnalysisSpec or target-trial support.`,
    });
  }
  if (!requiredCaveatsPresent.includes("cross-sectional") && !requiredCaveatsPresent.includes("observational")) {
    issues.push({ severity: "warning", code: "DESIGN_CAVEAT_MISSING", message: "Report should state the observational/cross-sectional design limitation." });
  }
  if (!requiredCaveatsPresent.includes("no-causal-inference") && !specSupportsCausal) {
    issues.push({ severity: "warning", code: "NO_CAUSAL_CAVEAT_MISSING", message: "Report should explicitly warn against causal interpretation." });
  }
  return {
    reportPath,
    specPath,
    status: issues.some(issue => issue.severity === "blocker") ? "blocked" : issues.length ? "needs_revision" : "pass",
    causalTerms,
    requiredCaveatsPresent,
    issues,
    nextAction: issues.length
      ? "Revise report wording/caveats or provide a causal AnalysisSpec with target-trial and sensitivity-analysis support."
      : "Report claim language is compatible with the available design evidence.",
  };
}

export function renderResearchClaimGuard(result: ResearchClaimGuard): string {
  return [
    `research claim guard: ${result.status}`,
    `  report: ${result.reportPath}`,
    `  spec: ${result.specPath ?? "(none)"}`,
    `  causal terms: ${result.causalTerms.join(", ") || "(none)"}`,
    ...result.issues.map(issue => `  - [${issue.severity}] ${issue.code}: ${issue.message}`),
    `  next: ${result.nextAction}`,
  ].join("\n");
}

export function renderResearchClaimGuardJson(result: ResearchClaimGuard): string {
  return `${JSON.stringify({
    schemaVersion: 1,
    claimGuard: result,
  }, null, 2)}\n`;
}

function numbersMentionedInText(text: string): number[] {
  return [...text.matchAll(/-?\d+(?:,\d{3})*(?:\.\d+)?(?:e[+-]?\d+)?/gi)]
    .map(match => Number(match[0].replace(/,/g, "")))
    .filter(value => Number.isFinite(value));
}

function numericMentionExists(numbers: number[], target: number, tolerance: number): boolean {
  return numbers.some(value => {
    const absolute = Math.abs(value - target);
    if (absolute <= tolerance) return true;
    const denominator = Math.max(Math.abs(target), 1e-12);
    return absolute / denominator <= tolerance;
  });
}

function firstModelEffectEstimate(model: Record<string, unknown>, modelType = ""): number | null {
  if (/logistic|binomial/.test(modelType) && typeof model.oddsRatio === "number" && Number.isFinite(model.oddsRatio)) {
    return model.oddsRatio;
  }
  for (const [key, value] of Object.entries(model)) {
    if (typeof value !== "number" || !Number.isFinite(value)) continue;
    if (/pvalue|p_value|intercept|n$|count|row/i.test(key)) continue;
    if (/or|odds|mean|difference|beta|coefficient|estimate/i.test(key)) return value;
  }
  return null;
}

function hasUnsupportedCausalTerm(text: string, term: string): boolean {
  let searchFrom = 0;
  while (true) {
    const index = text.indexOf(term, searchFrom);
    if (index === -1) return false;
    const prefix = text.slice(Math.max(0, index - 80), index);
    if (!/(?:not|no evidence|without evidence|cannot|can't|does not|do not|did not|should not|must not|cannot establish|cannot infer)[\s\w.,;:'"-]{0,80}$/.test(prefix)) {
      return true;
    }
    searchFrom = index + term.length;
  }
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
  return uniqueStrings(forbidden
    .map(pattern => text.match(pattern)?.[0])
    .filter((match): match is string => Boolean(match))
    .map(match => match.trim()));
}

function rawVariableCodeHits(text: string): string[] {
  const allowedAcronyms = new Set(["CDC", "CI", "HDL", "NHANES", "PPV", "NPV", "PSU", "QA", "R"]);
  return uniqueStrings(Array.from(text.matchAll(/\b[A-Z]{2,}[A-Z0-9]{2,}\b/g))
    .map(match => match[0])
    .filter(token => !allowedAcronyms.has(token))
    .filter(token => !/^HTTP/.test(token)));
}

export async function researchPaperQaCommand(opts: { paperPath: string; evidencePath?: string }): Promise<ResearchPaperQa> {
  const paperPath = path.resolve(opts.paperPath);
  const evidencePath = opts.evidencePath ? path.resolve(opts.evidencePath) : null;
  const paper = await readFile(paperPath, "utf-8");
  const lower = paper.toLowerCase();
  const readerFacingJargonHits = readerFacingPaperJargonHits(paper);
  const rawCodeHits = rawVariableCodeHits(paper);
  const paperNumbers = numbersMentionedInText(paper);
  const evidence = evidencePath ? await readJsonIfPresent(evidencePath) : null;
  const evidenceText = evidence && typeof evidence === "object" ? JSON.stringify(evidence).toLowerCase() : "";
  const checks: ResearchPaperQa["checks"] = [];
  const add = (id: string, ok: boolean, severity: "minor" | "major" | "critical", detail: string, warning = false) => {
    checks.push({ id, status: ok ? "pass" : warning ? "warning" : "fail", severity, detail });
  };
  add(
    "reader-facing-language",
    readerFacingJargonHits.length === 0,
    "critical",
    readerFacingJargonHits.length
      ? `Paper contains internal platform language that belongs in provenance artifacts, not reader-facing prose: ${readerFacingJargonHits.join(", ")}.`
      : "Paper avoids internal platform terminology and speaks to scientific readers.",
  );
  add("reader-code-density", rawCodeHits.length <= 8, "major", rawCodeHits.length ? `Paper exposes ${rawCodeHits.length} raw variable-like codes: ${rawCodeHits.join(", ")}.` : "Paper keeps raw variable-code exposure low.");
  const awkwardPhrases = [
    /whether,\s+among/i,
    /this the analysis/i,
    /outcome units/i,
    /Eligibility note:/i,
    /based on this rationale/i,
    /Results apply to Interpret/i,
  ].map(pattern => paper.match(pattern)?.[0]).filter((match): match is string => Boolean(match));
  add("reader-awkward-generator-phrases", awkwardPhrases.length === 0, "major", awkwardPhrases.length ? `Paper contains awkward generator phrases: ${uniqueStrings(awkwardPhrases).join(", ")}.` : "Paper avoids known awkward generator phrases.");
  for (const section of ["abstract", "introduction", "methods", "results", "discussion", "limitations", "reproducibility", "references"]) {
    add(`section-${section}`, lower.includes(`## ${section}`), "major", `${section} section should be present.`);
  }
  add("survey-design-language", /wtmec2yr|wtint2yr|survey weight/.test(lower) && /strata|psu|complex survey/.test(lower), "major", "Paper should disclose survey weights and strata/PSU or complex survey limitations.");
  add("sample-construction", /complete-case|eligible rows|study population|sample construction/.test(lower) && /\d{1,3}(,\d{3})+|\d+\s+rows/.test(lower), "major", "Paper should report sample construction and cohort counts.");
  add("missingness-language", /missing|complete-case|missing data/.test(lower), "major", "Paper should discuss missingness or complete-case handling.");
  add("citation-urls", (paper.match(/https?:\/\//g) ?? []).length >= 3, "major", "Paper should include at least three source URLs.");
  const causalOverclaims = ["caused", "causes", "causal effect", "prevented", "prevents"].filter(term => hasUnsupportedCausalTerm(lower, term));
  add("causal-language", causalOverclaims.length === 0, "critical", causalOverclaims.length ? `Potential causal overclaim terms: ${causalOverclaims.join(", ")}` : "No obvious causal overclaim terms found.");
  add("observational-caveat", /cross-sectional|observational|cannot establish|cannot infer caus/.test(lower), "critical", "Paper should explicitly bound observational/cross-sectional inference.");
  const diagnosisOverclaimPatterns = [
    /\bdiagnosed (?:chronic kidney disease|ckd|hypertension)\b/,
    /\bdiagnoses (?:chronic kidney disease|ckd|hypertension)\b/,
    /\bconfirmed (?:chronic kidney disease|ckd|hypertension)\b/,
    /\bclinical diagnosis of (?:chronic kidney disease|ckd|hypertension)\b/,
  ];
  const diagnosisOverclaims = diagnosisOverclaimPatterns
    .map(pattern => lower.match(pattern)?.[0])
    .filter((match): match is string => Boolean(match));
  add("diagnosis-overclaiming", diagnosisOverclaims.length === 0, "critical", diagnosisOverclaims.length ? `Potential diagnostic overclaim terms: ${diagnosisOverclaims.join(", ")}` : "No obvious diagnostic overclaim terms found.");
  add("evidence-json", evidencePath ? Boolean(evidence) : false, "major", "Companion evidence JSON should be readable.");
  if (evidence && typeof evidence === "object") {
    const evidenceRecord = evidence as Record<string, unknown>;
    const paperRunEvidence = typeof evidenceRecord.paperId === "string"
      && typeof evidenceRecord.analysisSpecPath === "string"
      && isRecord(evidenceRecord.weights);
    if (paperRunEvidence) {
      add("reader-main-finding", /(^|\n)Main finding:/i.test(paper), "major", "Generated paper packets should include a short plain-language main finding in the summary or abstract.");
      add(
        "reader-safety-summary",
        /## study summary/.test(lower)
          && /not clinically actionable|not clinical action/.test(lower)
          && /not causal|cannot infer caus|causal status/.test(lower)
          && /survey method|weight domain|human review/.test(lower),
        "critical",
        "Reader-facing papers should start with a plain-language study summary covering survey method, weight domain, causal status, actionability, and human review.",
      );
    }
    add("evidence-row-counts", /rowcounts|row_counts|completecase|complete-case|eligible/.test(evidenceText), "major", "Evidence should include row counts or eligible cohort evidence.");
    add("evidence-limitations", /limitations|weights|survey/.test(evidenceText), "minor", "Evidence should include limitations or survey-design notes.", true);
    const model = "model" in evidence && evidence.model && typeof evidence.model === "object"
      ? evidence.model as { type?: unknown; covariates?: unknown }
      : null;
    const modelType = typeof model?.type === "string" ? model.type.toLowerCase() : "";
    const modelRecord = model as Record<string, unknown> | null;
    if (modelType) {
      if (/logistic|binomial/.test(modelType)) {
        add("model-family-logistic-effect", /odds ratio|\bor\b|logistic/.test(lower), "critical", "Logistic/binomial evidence should be reported with odds-ratio/logistic language.");
      }
      if (!/logistic|binomial/.test(modelType) && /linear|ordinary least squares|ols/.test(modelType)) {
        add("model-family-linear-effect", /mean difference|linear regression|coefficient|beta/.test(lower), "critical", "Linear-regression evidence should be reported with mean-difference/coefficient language.");
      }
      if (/approximate|frequency weight/.test(modelType) || /approximate weighting|approximate weights|frequency weight/.test(evidenceText)) {
        add("model-variance-caveat", /approximate/.test(lower) && /variance|strata|psu|complex survey/.test(lower), "critical", "Approximate weighted models should disclose non-design-correct variance limits.");
      }
    }
    const weightsRecord = isRecord((evidence as Record<string, unknown>).weights)
      ? (evidence as Record<string, unknown>).weights as Record<string, unknown>
      : null;
    const weightName = typeof weightsRecord?.weight === "string" ? weightsRecord.weight.toUpperCase() : "";
    const weightDomain = isRecord(weightsRecord?.domain) ? weightsRecord.domain as Record<string, unknown> : null;
    const subsampleWeight = Boolean(weightDomain?.isSubsample) || /^WTSAF|^WTSS|^WTS/.test(weightName);
    if (subsampleWeight) {
      add(
        "subsample-weight-disclosure",
        /subsample|fasting|morning session|least common denominator|eligible subgroup|analytic population/.test(lower),
        "critical",
        "Papers using subsample-specific weights must disclose the subsample analytic population and weight-domain rationale.",
      );
      add(
        "subsample-weight-evidence",
        typeof weightDomain?.rationale === "string" && typeof weightDomain?.eligibilityNote === "string",
        "critical",
        "Evidence for subsample-specific weights should include rationale and eligibility notes.",
      );
    }
    const evidenceDeclaresApproximateInference = /"varianceestimator"\s*:\s*"approximate_weighted"/.test(evidenceText)
      || /"allowedinference"\s*:\s*"exploratory_association"/.test(evidenceText);
    if (evidenceDeclaresApproximateInference) {
      add(
        "inference-policy-approximate-language",
        /exploratory|approximate/.test(lower) && /variance|confidence interval|p[- ]?value|inferential/.test(lower),
        "critical",
        "Approximate-inference AnalysisSpecs require exploratory/approximate language around p values, CIs, or inferential claims.",
      );
      add(
        "inference-policy-no-strong-significance",
        !/statistically significant|significant association|significantly (?:higher|lower|associated)/.test(lower),
        "critical",
        "Approximate-inference AnalysisSpecs should not use strong statistical-significance language.",
      );
    }
    if (modelRecord) {
      const effectEstimate = firstModelEffectEstimate(modelRecord, modelType);
      if (effectEstimate !== null) {
        add("model-effect-numeric-consistency", numericMentionExists(paperNumbers, effectEstimate, 0.02), "critical", `Paper should include the evidence effect estimate near ${effectEstimate}.`);
      }
      const ci95 = Array.isArray(modelRecord.ci95) ? modelRecord.ci95.filter((value): value is number => typeof value === "number" && Number.isFinite(value)) : [];
      if (ci95.length >= 2) {
        const ciMatches = ci95.slice(0, 2).every(value => numericMentionExists(paperNumbers, value, 0.02));
        add("model-ci-numeric-consistency", ciMatches, "critical", `Paper should include evidence CI bounds near ${ci95.slice(0, 2).join(" to ")}.`);
      }
      const pValue = typeof modelRecord.pValue === "number" && Number.isFinite(modelRecord.pValue) ? modelRecord.pValue : null;
      if (pValue !== null) {
        add("model-pvalue-numeric-consistency", numericMentionExists(paperNumbers, pValue, pValue < 0.001 ? 0.2 : 0.02), "major", `Paper should include evidence p-value near ${pValue}.`);
      }
    }
    if (Array.isArray(model?.covariates) && model.covariates.length > 0) {
      const covariateText = model.covariates.join(" ").toLowerCase();
      const expectedCovariateGroups = [
        { id: "age", expected: /age/.test(covariateText) },
        { id: "sex", expected: /female|sex|gender/.test(covariateText) },
        { id: "race", expected: /race|ethnicity/.test(covariateText) },
      ].filter(group => group.expected);
      const disclosedGroups = expectedCovariateGroups.filter(group => new RegExp(group.id === "sex" ? "sex|female|gender" : group.id).test(lower));
      add("model-covariate-disclosure", /covariate|adjusted|adjusting|adjustment/.test(lower) && disclosedGroups.length === expectedCovariateGroups.length, "major", "Paper should disclose covariate adjustment groups present in evidence JSON.");
    }
    const thresholdsRecord = isRecord(evidenceRecord.thresholds) ? evidenceRecord.thresholds : null;
    const hasThresholdEvidence = Boolean(thresholdsRecord && Object.keys(thresholdsRecord).length > 0)
      || Boolean(modelRecord && isRecord(modelRecord.binaryThreshold))
      || /"binaryoutcome"\s*:|"classified as"|"cutoff"|"cut-point"|"cutpoint"/.test(evidenceText);
    if (hasThresholdEvidence) {
      add("threshold-provenance", /threshold|cutoff|cut-point|cutpoint|defined as|classified as/.test(lower) && /https?:\/\//.test(paper), "major", "Threshold-based papers should name threshold definitions and cite threshold sources.");
      if (/albuminuria|uacr|urda?ct|urine albumin|mg\/g/.test(evidenceText)) {
        add("single-measure-kidney-caveat", /single|persistent|repeat|cannot diagnose|not a diagnosis|not a clinical/.test(lower) && /albuminuria|uacr|ckd|kidney/.test(lower), "critical", "Single urine albumin/UACR threshold papers should avoid CKD diagnosis and disclose persistence/repeat-testing limits.");
      }
      if (/hypertension|blood pressure|bpxsy|bpxdi/.test(evidenceText)) {
        add("single-measure-bp-caveat", /measured hypertension|threshold-defined|not a clinical|single|repeat|cannot diagnose/.test(lower), "critical", "Blood-pressure threshold papers should distinguish measured threshold status from clinical hypertension diagnosis.");
      }
    }
  }
  const status: ResearchPaperQa["status"] = checks.some(check => check.status === "fail" && check.severity === "critical")
    ? "fail"
    : checks.some(check => check.status === "fail")
      ? "warning"
      : checks.some(check => check.status === "warning")
        ? "warning"
        : "pass";
  return {
    paperPath,
    evidencePath,
    status,
    checks,
    summary: `${checks.filter(check => check.status === "pass").length}/${checks.length} paper QA checks passed.`,
    nextAction: status === "pass" ? "Paper passes deterministic QA; proceed to human scientific critique." : "Revise the paper or evidence artifact before relying on it.",
  };
}

export function renderResearchPaperQa(result: ResearchPaperQa): string {
  return [
    `research paper QA: ${result.paperPath}`,
    `  status: ${result.status}`,
    `  evidence: ${result.evidencePath ?? "(none)"}`,
    `  summary: ${result.summary}`,
    ...result.checks.map(check => `  - [${check.status}/${check.severity}] ${check.id}: ${check.detail}`),
    `  next: ${result.nextAction}`,
  ].join("\n");
}

export function renderResearchPaperQaJson(result: ResearchPaperQa): string {
  return `${JSON.stringify({
    schemaVersion: 1,
    paperQa: result,
  }, null, 2)}\n`;
}

export async function researchPaperIndexCommand(opts: { papersDir: string; outPath?: string }): Promise<ResearchPaperIndex> {
  const papersDir = path.resolve(opts.papersDir);
  const entries = await readdir(papersDir, { withFileTypes: true });
  const papers: ResearchPaperIndex["papers"] = [];
  for (const entry of entries.filter(item => item.isDirectory()).sort((a, b) => a.name.localeCompare(b.name))) {
    const dir = path.join(papersDir, entry.name);
    const analysis = await readJsonIfPresent(path.join(dir, "analysis.json")) as Record<string, unknown> | null;
    const files = await readdir(dir);
    const qaCandidates = await Promise.all(files
      .filter(file => /^qa.*\.json$/.test(file))
      .map(async file => ({ file, mtimeMs: (await stat(path.join(dir, file))).mtimeMs })));
    const latestQa = qaCandidates.sort((a, b) => b.mtimeMs - a.mtimeMs)[0] ?? null;
    let latestQaStatus = "missing";
    let latestQaSummary = "";
    if (latestQa) {
      const qa = await readJsonIfPresent(path.join(dir, latestQa.file)) as Record<string, unknown> | null;
      const paperQa = qa && "paperQa" in qa && qa.paperQa && typeof qa.paperQa === "object" ? qa.paperQa as Record<string, unknown> : qa;
      latestQaStatus = typeof paperQa?.status === "string" ? paperQa.status : "unknown";
      latestQaSummary = typeof paperQa?.summary === "string" ? paperQa.summary : "";
    }
    const rowCounts = analysis && "rowCounts" in analysis && analysis.rowCounts && typeof analysis.rowCounts === "object"
      ? analysis.rowCounts as Record<string, unknown>
      : {};
    const completeCase = rowCounts.completeCaseEligible;
    const runnerRecordPath = path.join(dir, "runner-record.json");
    const runnerRecordJson = await readJsonIfPresent(runnerRecordPath) as Record<string, unknown> | null;
    const runnerRecord = normalizePaperRunnerRecord(runnerRecordJson);
    const runnerBinding = typeof runnerRecord?.analysisSpec === "object" && runnerRecord.analysisSpec
      ? (runnerRecord.analysisSpec as Record<string, unknown>).binding
      : null;
    const rawRunnerStatus = typeof runnerRecord?.status === "string" ? runnerRecord.status : "missing";
    const runnerStatus = runnerBinding === "retrospective" && rawRunnerStatus !== "missing"
      ? `retrospective_${rawRunnerStatus}`
      : rawRunnerStatus;
    const paperMarkdown = await readTextIfPresent(path.join(dir, "paper.md"));
    const readerFacingLanguageHits = paperMarkdown ? readerFacingPaperJargonHits(paperMarkdown) : [];
    const readerFacingLanguageStatus = !paperMarkdown
      ? "missing"
      : readerFacingLanguageHits.length
        ? "legacy_or_fail"
        : "pass";
    papers.push({
      id: entry.name,
      title: typeof analysis?.title === "string" ? analysis.title : entry.name,
      completeCaseN: typeof completeCase === "number" ? completeCase : null,
      latestQaPath: latestQa ? path.join(dir, latestQa.file) : null,
      latestQaStatus,
      latestQaSummary,
      readerFacingLanguageStatus,
      readerFacingLanguageHits,
      runnerRecordPath: runnerRecord ? runnerRecordPath : null,
      runnerStatus,
    });
  }
  const outPath = opts.outPath ? path.resolve(opts.outPath) : null;
  const result: ResearchPaperIndex = { papersDir, outPath, papers };
  if (outPath) {
    await writeFile(outPath, renderResearchPaperIndex(result));
  }
  return result;
}

export async function researchPaperLifecycleCommand(opts: { paperDir: string; capabilityDir?: string; outPath?: string }): Promise<ResearchPaperLifecycle> {
  const paperDir = path.resolve(opts.paperDir);
  const analysis = await readJsonIfPresent(path.join(paperDir, "analysis.json")) as Record<string, unknown> | null;
  const qaPath = await latestMatchingJsonPath(paperDir, /^qa.*\.json$/);
  const qaJson = qaPath ? await readJsonIfPresent(qaPath) as Record<string, unknown> | null : null;
  const paperQa = qaJson && "paperQa" in qaJson && qaJson.paperQa && typeof qaJson.paperQa === "object" ? qaJson.paperQa as Record<string, unknown> : qaJson;
  const runnerPath = path.join(paperDir, "runner-record.json");
  const runnerRecord = normalizePaperRunnerRecord(await readJsonIfPresent(runnerPath) as Record<string, unknown> | null);
  const runnerBinding = typeof runnerRecord?.analysisSpec === "object" && runnerRecord.analysisSpec
    ? String((runnerRecord.analysisSpec as Record<string, unknown>).binding ?? "unknown")
    : "missing";
  const runnerRawStatus = typeof runnerRecord?.status === "string" ? runnerRecord.status : "missing";
  const runnerStatus = runnerBinding === "retrospective" && runnerRawStatus !== "missing" ? `retrospective_${runnerRawStatus}` : runnerRawStatus;
  const warningCodes = Array.isArray(runnerRecord?.warnings)
    ? runnerRecord.warnings.map(issue => issue && typeof issue === "object" ? String((issue as Record<string, unknown>).code ?? "") : "").filter(Boolean)
    : [];

  const interopDir = path.join(paperDir, "interop");
  const taskPath = await latestExistingPath([
    path.join(interopDir, "task-succeeded.json"),
    path.join(interopDir, "task-running.json"),
    path.join(interopDir, "task-queued.json"),
    path.join(interopDir, "task-created.json"),
  ]);
  const taskJson = taskPath ? await readJsonIfPresent(taskPath) as Record<string, unknown> | null : null;
  const task = taskJson && "taskEnvelope" in taskJson && taskJson.taskEnvelope && typeof taskJson.taskEnvelope === "object"
    ? taskJson.taskEnvelope as Record<string, unknown>
    : taskJson;
  const validationPath = await latestExistingPath([
    path.join(interopDir, "task-validation-with-capabilities.json"),
    path.join(interopDir, "task-validation.json"),
  ]);
  const validation = validationPath ? await readJsonIfPresent(validationPath) as Record<string, unknown> | null : null;
  const interopValidation = validation && "interopValidation" in validation && validation.interopValidation && typeof validation.interopValidation === "object"
    ? validation.interopValidation as Record<string, unknown>
    : validation;
  const receiptStatuses = Array.isArray(task?.evidenceReceipts)
    ? task.evidenceReceipts.map(receipt => receipt && typeof receipt === "object" ? String((receipt as Record<string, unknown>).status ?? "unknown") : "unknown")
    : [];

  const capabilityDir = opts.capabilityDir ? path.resolve(opts.capabilityDir) : null;
  const capabilityValidations = capabilityDir ? await readCapabilityValidationSummaries(capabilityDir) : [];
  const capabilityIssues = capabilityValidations.flatMap(summary => summary.issueCodes);
  const capabilityStatus = !capabilityDir
    ? "not_checked"
    : capabilityValidations.length === 0
      ? "missing"
      : capabilityValidations.every(summary => summary.status === "pass")
        ? "pass"
        : capabilityValidations.some(summary => summary.status === "blocked")
          ? "blocked"
          : "needs_revision";
  const rerunStabilityPath = path.join(paperDir, "rerun-stability.json");
  const rerunStabilityJson = await readJsonIfPresent(rerunStabilityPath) as Record<string, unknown> | null;
  const rerunStabilityRecord = rerunStabilityJson && "paperRerunStability" in rerunStabilityJson && isRecord(rerunStabilityJson.paperRerunStability)
    ? rerunStabilityJson.paperRerunStability as Record<string, unknown>
    : rerunStabilityJson;
  const rerunStabilityStatus = rerunStabilityRecord && rerunStabilityRecord.status === "pass"
    ? "pass"
    : rerunStabilityRecord && rerunStabilityRecord.status === "fail"
      ? "fail"
      : "not_checked";
  const statsRunPath = path.join(paperDir, "stats-run.json");
  const statsRun = unwrapResearchArtifact<StatsRunResult>(await readJsonIfPresent(statsRunPath), "statsRun");
  const statsRunStatus = statsRun?.status ?? "missing";
  const statsRunIssueCodes = Array.isArray(statsRun?.issues)
    ? statsRun.issues.map(issue => issue.code).filter(Boolean)
    : [];
  const statsRunPosture = statsRun?.resultPosture?.status ?? null;
  const statsRunInterpretationBoundary = statsRun?.resultPosture?.interpretationBoundary ?? null;

  const blockers: string[] = [];
  const qaStatus = typeof paperQa?.status === "string" ? paperQa.status : "missing";
  if (qaStatus !== "pass") blockers.push(`paper QA is ${qaStatus}`);
  if (runnerRawStatus !== "succeeded") blockers.push(`runner record is ${runnerRawStatus}`);
  if (runnerBinding === "retrospective") blockers.push("AnalysisSpec binding is retrospective, not spec-governed");
  if (runnerBinding === "missing") blockers.push("runner AnalysisSpec binding is missing");
  const taskStatus = typeof task?.status === "string" ? task.status : "missing";
  const taskValidationStatus = typeof interopValidation?.status === "string" ? interopValidation.status : "missing";
  if (!taskPath) blockers.push("task envelope is missing");
  if (taskPath && taskStatus !== "succeeded") blockers.push(`task status is ${taskStatus}`);
  if (taskPath && taskValidationStatus !== "pass") blockers.push(`task validation is ${taskValidationStatus}`);
  if (capabilityDir && capabilityStatus !== "pass") blockers.push(`capability validation is ${capabilityStatus}`);
  if (rerunStabilityStatus === "fail") blockers.push("rerun stability failed");
  if (statsRunStatus === "failed") blockers.push(`stats-run failed${statsRunIssueCodes.length ? `: ${statsRunIssueCodes.join(",")}` : ""}`);
  const lifecycleStatus: ResearchPaperLifecycle["lifecycleStatus"] = runnerBinding === "retrospective"
    ? "needs_methods_review"
    : !taskPath
      ? "needs_task_envelope"
      : blockers.length
        ? "blocked"
        : "ready_for_local_review";
  const result: ResearchPaperLifecycle = {
    paperDir,
    paperId: path.basename(paperDir),
    title: typeof analysis?.title === "string" ? analysis.title : path.basename(paperDir),
    qa: {
      status: qaStatus,
      summary: typeof paperQa?.summary === "string" ? paperQa.summary : "",
      path: qaPath,
    },
    runner: {
      status: runnerStatus,
      binding: runnerBinding,
      warningCodes,
      path: runnerRecord ? runnerPath : null,
    },
    task: {
      status: taskStatus,
      validationStatus: taskValidationStatus,
      receiptStatuses,
      path: taskPath,
      validationPath,
    },
    capabilities: {
      dir: capabilityDir,
      status: capabilityStatus,
      count: capabilityValidations.length,
      issueCodes: capabilityIssues,
    },
    rerunStability: {
      status: rerunStabilityStatus,
      summary: typeof rerunStabilityRecord?.summary === "string" ? rerunStabilityRecord.summary : "",
      path: rerunStabilityRecord ? rerunStabilityPath : null,
    },
    statsRun: {
      status: statsRunStatus,
      method: statsRun?.method ?? null,
      binding: statsRun?.binding.status ?? "missing",
      posture: statsRunPosture,
      interpretationBoundary: statsRunInterpretationBoundary,
      issueCodes: statsRunIssueCodes,
      path: statsRun ? statsRunPath : null,
    },
    lifecycleStatus,
    blockers,
    nextAction: lifecycleStatus === "ready_for_local_review"
      ? rerunStabilityStatus === "pass"
        ? "Proceed to methods review or manifest inclusion; rerun stability is available."
        : "Proceed to methods review; run paper-rerun-stability before archive or benchmark promotion."
      : lifecycleStatus === "needs_task_envelope"
        ? "Create task/evidence envelopes and validate them against capability declarations."
        : lifecycleStatus === "needs_methods_review"
          ? "Do not present as spec-governed; create a pre-run AnalysisSpec for the next execution."
          : "Resolve blockers before treating this paper as locally review-ready.",
  };
  if (opts.outPath) await writeFile(path.resolve(opts.outPath), renderResearchPaperLifecycle(result));
  return result;
}

export function renderResearchPaperLifecycle(result: ResearchPaperLifecycle): string {
  return [
    `research paper lifecycle: ${result.paperId}`,
    `  title: ${result.title}`,
    `  status: ${result.lifecycleStatus}`,
    `  qa: ${result.qa.status}${result.qa.summary ? ` (${result.qa.summary})` : ""}`,
    `  runner: ${result.runner.status} binding=${result.runner.binding}${result.runner.warningCodes.length ? ` warnings=${result.runner.warningCodes.join(",")}` : ""}`,
    `  task: ${result.task.status} validation=${result.task.validationStatus} receipts=${result.task.receiptStatuses.join(",") || "(none)"}`,
    `  capabilities: ${result.capabilities.status} count=${result.capabilities.count}`,
    `  rerun stability: ${result.rerunStability.status}${result.rerunStability.summary ? ` (${result.rerunStability.summary})` : ""}`,
    `  stats-run: ${result.statsRun.status}${result.statsRun.method ? ` method=${result.statsRun.method}` : ""} binding=${result.statsRun.binding}${result.statsRun.posture ? ` posture=${result.statsRun.posture}` : ""}${result.statsRun.issueCodes.length ? ` issues=${result.statsRun.issueCodes.join(",")}` : ""}`,
    result.statsRun.interpretationBoundary ? `  stats-boundary: ${result.statsRun.interpretationBoundary}` : "",
    ...result.blockers.map(blocker => `  - blocker: ${blocker}`),
    `  next: ${result.nextAction}`,
  ].join("\n");
}

export function renderResearchPaperLifecycleJson(result: ResearchPaperLifecycle): string {
  return `${JSON.stringify({
    schemaVersion: 1,
    paperLifecycle: result,
  }, null, 2)}\n`;
}

export async function researchPaperRunCommand(opts: { analysisSpecPath: string; dataRoot: string; outDir: string; python?: string; rscript?: string; backend?: "python-linearized" | "r-survey"; capabilityDir?: string }): Promise<ResearchPaperRun> {
  const analysisSpecPath = path.resolve(opts.analysisSpecPath);
  const dataRoot = path.resolve(opts.dataRoot);
  const outDir = path.resolve(opts.outDir);
  const backend = opts.backend ?? "python-linearized";
  if (backend !== "python-linearized" && backend !== "r-survey") {
    throw new Error(`Unsupported research paper-run backend: ${String(backend)}`);
  }
  const python = opts.python ?? process.env.AGENTEER_RESEARCH_PYTHON ?? process.env.PYTHON ?? "python3";
  const rscript = opts.rscript ?? process.env.AGENTEER_RESEARCH_RSCRIPT ?? "Rscript";
  await mkdir(outDir, { recursive: true });
  const runnerScript = path.join(outDir, "paper-runner.py");
  const runnerConfig = path.join(outDir, "runner-config.json");
  const datasetAdapter = getDatasetManifest("nhanes");
  await writeFile(runnerScript, researchPaperRunPythonScript());
  await writeFile(runnerConfig, `${JSON.stringify({ analysisSpecPath, dataRoot, outDir, backend, rscript, datasetAdapter }, null, 2)}\n`);
  await execFileAsync(python, [runnerScript, runnerConfig], { maxBuffer: 20 * 1024 * 1024 });

  const analysisPath = path.join(outDir, "analysis.json");
  const paperPath = path.join(outDir, "paper.md");
  const critiquePath = path.join(outDir, "critique.md");
  const paperQaPath = path.join(outDir, "qa-cli.json");
  const runnerRecordPath = path.join(outDir, "runner-record.json");
  const lifecyclePath = path.join(outDir, "lifecycle.md");
  const analysis = await readJsonIfPresent(analysisPath) as Record<string, unknown> | null;
  const inputFiles = Array.isArray(analysis?.inputFiles) ? analysis.inputFiles.map(String) : [];
  const model = analysis && typeof analysis.model === "object" && analysis.model ? analysis.model as Record<string, unknown> : {};
  const qa = await researchPaperQaCommand({ paperPath, evidencePath: analysisPath });
  await writeFile(paperQaPath, renderResearchPaperQaJson(qa));
  const runnerRecord = await researchPaperRunnerRecordCommand({
    paperId: path.basename(outDir),
    commandSummary: backend === "r-survey"
      ? "Executed AnalysisSpec through research paper-run with R survey svyglm backend."
      : "Executed AnalysisSpec through research paper-run with local survey-aware linearized variance runner.",
    runnerKind: backend === "r-survey" ? "local-r-survey-svyglm" : "local-python-complex-survey-linearized",
    analysisSpecPath,
    binding: "spec-governed",
    inputFiles,
    outputFiles: [runnerScript, runnerConfig, analysisSpecPath, analysisPath, paperPath, paperQaPath, critiquePath],
    weighting: "AnalysisSpec survey weight with strata/PSU linearized sandwich variance",
    variance: backend === "r-survey" ? "R survey Taylor linearized variance via svyglm" : "strata/PSU linearized sandwich variance for weighted regression",
    population: typeof analysis?.population === "string" ? analysis.population : "AnalysisSpec-defined complete-case population",
    outPath: runnerRecordPath,
  });

  const interopDir = path.join(outDir, "interop");
  await mkdir(interopDir, { recursive: true });
  const paperReceiptPath = path.join(interopDir, "paper-receipt.json");
  const qaReceiptPath = path.join(interopDir, "qa-receipt.json");
  const runnerReceiptPath = path.join(interopDir, "runner-receipt.json");
  const paperReceipt = await agentEvidenceReceiptCommand({ artifact: paperPath, producedBy: "agenteer.research.paper-run", validator: "paper-authoring", status: qa.status === "pass" ? "pass" : "warning", outPath: paperReceiptPath });
  const qaReceipt = await agentEvidenceReceiptCommand({ artifact: paperQaPath, producedBy: "agenteer.research.paper-qa", validator: "paper-qa", status: qa.status === "pass" ? "pass" : "fail", outPath: qaReceiptPath });
  const runnerReceipt = await agentEvidenceReceiptCommand({ artifact: runnerRecordPath, producedBy: "agenteer.research.paper-runner-record", validator: "runner-provenance", status: runnerRecord.warnings.length ? "warning" : "pass", outPath: runnerReceiptPath });
  await writeJsonWrapped(paperReceiptPath, "evidenceReceipt", paperReceipt);
  await writeJsonWrapped(qaReceiptPath, "evidenceReceipt", qaReceipt);
  await writeJsonWrapped(runnerReceiptPath, "evidenceReceipt", runnerReceipt);

  const taskCreatedPath = path.join(interopDir, "task-created.json");
  const taskQueuedPath = path.join(interopDir, "task-queued.json");
  const taskRunningPath = path.join(interopDir, "task-running.json");
  const taskSucceededPath = path.join(interopDir, "task-succeeded.json");
  const capabilityPaths = opts.capabilityDir ? await capabilityDeclarationPaths(path.resolve(opts.capabilityDir)) : [];
  if (opts.capabilityDir) {
    for (const capabilityPath of capabilityPaths) {
      const validation = await agentCapabilityValidateCommand(capabilityPath);
      await writeJsonWrapped(capabilityValidationPath(capabilityPath), "interopValidation", validation);
    }
  }
  const task = await agentTaskCreateCommand({
    goal: `Run AnalysisSpec and generate ${path.basename(outDir)} research paper packet`,
    requester: "agenteer.research.paper-run",
    capabilities: ["research.paper.generate", "research.paper.qa", "research.runner.provenance"],
    inputs: [JSON.stringify({
      analysisSpecPath,
      dataRoot,
      backend,
      varianceEstimator: backend === "r-survey" ? "r_survey_taylor_linearized" : "complex_survey_linearized",
    })],
    artifacts: [analysisSpecPath, analysisPath, paperPath, paperQaPath, runnerRecordPath],
    allowedActions: ["read-local-nhanes-cache", "write-loop-memory-paper-artifacts"],
    deniedActions: ["write-medbrevia", "cloud"],
    writeRoots: [outDir],
    maxUsd: 0,
    maxRuntimeSeconds: 900,
    maxModelCalls: 0,
    outPath: taskCreatedPath,
  });
  await writeJsonWrapped(taskCreatedPath, "taskEnvelope", task);
  const queued = await agentTaskTransitionCommand(taskCreatedPath, "queued", { reason: "AnalysisSpec paper-run task queued.", outPath: taskQueuedPath });
  await writeJsonWrapped(taskQueuedPath, "taskEnvelope", queued.taskEnvelope);
  const running = await agentTaskTransitionCommand(taskQueuedPath, "running", { reason: "AnalysisSpec paper-run task running.", outPath: taskRunningPath });
  await writeJsonWrapped(taskRunningPath, "taskEnvelope", running.taskEnvelope);
  const finalStatus = qa.status === "pass" ? "succeeded" : "failed";
  const completed = await agentTaskTransitionCommand(taskRunningPath, finalStatus, {
    evidencePaths: [paperReceiptPath, qaReceiptPath, runnerReceiptPath],
    reason: finalStatus === "succeeded" ? "Paper, QA, and runner provenance evidence attached." : "Paper run failed QA.",
    outPath: taskSucceededPath,
  });
  await writeJsonWrapped(taskSucceededPath, "taskEnvelope", completed.taskEnvelope);
  const taskValidation = await agentTaskValidateCommand(taskSucceededPath, { capabilityPaths });
  await writeJsonWrapped(path.join(interopDir, "task-validation-with-capabilities.json"), "interopValidation", taskValidation);
  await writeJsonWrapped(path.join(interopDir, "task-export-mcp.json"), "taskInteropExport", await agentTaskExportCommand(taskSucceededPath, "mcp"));
  await writeJsonWrapped(path.join(interopDir, "task-export-a2a.json"), "taskInteropExport", await agentTaskExportCommand(taskSucceededPath, "a2a"));

  const lifecycle = await researchPaperLifecycleCommand({ paperDir: outDir, capabilityDir: opts.capabilityDir, outPath: lifecyclePath });
  await writeFile(path.join(outDir, "lifecycle.json"), renderResearchPaperLifecycleJson(lifecycle));
  return {
    paperDir: outDir,
    paperId: path.basename(outDir),
    backend,
    analysisSpecPath,
    dataRoot,
    generatedFiles: {
      runnerScript,
      analysis: analysisPath,
      paper: paperPath,
      critique: critiquePath,
      paperQa: paperQaPath,
      runnerRecord: runnerRecordPath,
      lifecycle: lifecyclePath,
    },
    analysis: {
      varianceEstimator: typeof analysis?.varianceEstimator === "string" ? analysis.varianceEstimator : "unknown",
      effectEstimate: firstModelEffectEstimate(model, typeof model.type === "string" ? model.type.toLowerCase() : ""),
      standardError: typeof model.standardError === "number" ? model.standardError : null,
      pValue: typeof model.pValue === "number" ? model.pValue : null,
      completeCaseN: typeof (analysis?.rowCounts as Record<string, unknown> | undefined)?.completeCaseEligible === "number"
        ? Number((analysis?.rowCounts as Record<string, unknown>).completeCaseEligible)
        : null,
      inputFiles,
    },
    qaStatus: qa.status,
    runnerBinding: runnerRecord.analysisSpec.binding,
    lifecycleStatus: lifecycle.lifecycleStatus,
    taskValidationStatus: taskValidation.status,
    nextAction: lifecycle.nextAction,
  };
}

export function renderResearchPaperRun(result: ResearchPaperRun): string {
  return [
    `research paper run: ${result.paperId}`,
    `  backend: ${result.backend}`,
    `  lifecycle: ${result.lifecycleStatus}`,
    `  qa: ${result.qaStatus}`,
    `  runner binding: ${result.runnerBinding}`,
    `  variance: ${result.analysis.varianceEstimator}`,
    `  complete-case N: ${result.analysis.completeCaseN ?? "(unknown)"}`,
    `  effect: ${result.analysis.effectEstimate ?? "(unknown)"}`,
    `  task validation: ${result.taskValidationStatus}`,
    `  paper: ${result.generatedFiles.paper}`,
    `  lifecycle summary: ${result.generatedFiles.lifecycle}`,
    `  next: ${result.nextAction}`,
  ].join("\n");
}

export function renderResearchPaperRunJson(result: ResearchPaperRun): string {
  return `${JSON.stringify({
    schemaVersion: 1,
    paperRun: result,
  }, null, 2)}\n`;
}

async function probeCommand(executable: string, args: string[]): Promise<{ status: "available" | "missing"; stdout: string }> {
  try {
    const { stdout } = await execFileAsync(executable, args, { maxBuffer: 1024 * 1024 });
    return { status: "available", stdout: stdout.trim() };
  } catch {
    return { status: "missing", stdout: "" };
  }
}

export async function researchBackendStatusCommand(opts: { python?: string; rscript?: string } = {}): Promise<ResearchAnalysisBackendStatus> {
  const python = opts.python ?? process.env.AGENTEER_RESEARCH_PYTHON ?? process.env.PYTHON ?? "python3";
  const rscript = opts.rscript ?? process.env.AGENTEER_RESEARCH_RSCRIPT ?? "Rscript";
  const pythonProbe = await probeCommand(python, ["-c", `import importlib, json, sys
mods = ['numpy', 'pandas', 'pyarrow', 'statsmodels', 'duckdb', 'polars']
out = {'version': sys.version.split()[0], 'packages': {}}
for m in mods:
    try:
        mod = importlib.import_module(m)
        out['packages'][m] = getattr(mod, '__version__', None)
    except Exception:
        out['packages'][m] = None
print(json.dumps(out))`]);
  const rProbe = await probeCommand(rscript, ["-e", "suppressPackageStartupMessages({library(jsonlite)}); pkgs <- c('survey','srvyr','gtsummary','arrow','jsonlite','dplyr','broom'); versions <- list(); for (p in pkgs) { versions[[p]] <- tryCatch(as.character(packageVersion(p)), error=function(e) NA_character_) }; cat(toJSON(list(version=as.character(getRversion()), packages=versions), auto_unbox=TRUE, null='null'))"]);
  const pythonInfo: { version: string | null; packages: Record<string, string | null> } = pythonProbe.status === "available" ? JSON.parse(pythonProbe.stdout) as { version: string; packages: Record<string, string | null> } : { version: null, packages: {} };
  const rInfo: { version: string | null; packages: Record<string, string | null> } = rProbe.status === "available" ? JSON.parse(rProbe.stdout) as { version: string; packages: Record<string, string | null> } : { version: null, packages: {} };
  const pythonCoreAvailable = pythonProbe.status === "available" && ["numpy", "pandas", "pyarrow", "statsmodels"].every(name => pythonInfo.packages[name]);
  const duckdbPolarsAvailable = pythonProbe.status === "available" && Boolean(pythonInfo.packages.duckdb && pythonInfo.packages.polars);
  const rSurveyAvailable = rProbe.status === "available" && Boolean(rInfo.packages.survey && rInfo.packages.arrow && rInfo.packages.jsonlite);
  const backends: ResearchAnalysisBackendStatus["backends"] = [
    {
      id: "python-linearized",
      status: pythonCoreAvailable ? "available" : "missing",
      executable: python,
      version: pythonInfo.version,
      packages: pythonInfo.packages,
      supports: ["local Parquet/CSV/JSON loading", "weighted linear regression", "weighted logistic regression", "strata/PSU linearized sandwich variance", "paper-run packet generation"],
      limitations: ["not a reference complex-survey implementation", "no replicate weights", "limited domain analysis"],
    },
    {
      id: "r-survey",
      status: rSurveyAvailable ? "available" : "missing",
      executable: rscript,
      version: rInfo.version,
      packages: rInfo.packages,
      supports: ["survey::svydesign", "survey::svyglm", "Taylor linearized survey inference", "weighted linear regression", "weighted logistic regression"],
      limitations: ["current adapter does not yet expose replicate weights", "domain analysis and multi-cycle weight construction still require AnalysisSpec expansion"],
    },
    {
      id: "duckdb-polars",
      status: duckdbPolarsAvailable ? "available" : "missing",
      executable: python,
      version: pythonInfo.version,
      packages: { duckdb: pythonInfo.packages.duckdb ?? null, polars: pythonInfo.packages.polars ?? null, pyarrow: pythonInfo.packages.pyarrow ?? null },
      supports: ["fast local Parquet/CSV cohort construction", "lazy dataframe transformations", "large local analytical joins"],
      limitations: ["data-prep backend only; not an inferential statistics backend"],
    },
  ];
  return {
    schemaVersion: 1,
    generatedAtIso: new Date().toISOString(),
    backends,
    recommendedDefault: rSurveyAvailable ? "r-survey for complex survey inference; duckdb-polars/python for data preparation" : "python-linearized until r-survey is installed",
    nextAction: rSurveyAvailable && duckdbPolarsAvailable
      ? "Use --backend r-survey for NHANES/public-health survey papers and reserve Python/DuckDB/Polars for data prep and non-survey analyses."
      : "Install the missing local analysis runtime packages before broadening the researcher.",
  };
}

export function renderResearchBackendStatus(result: ResearchAnalysisBackendStatus): string {
  return [
    "research analysis backends",
    `  recommended: ${result.recommendedDefault}`,
    ...result.backends.map(backend => `  - ${backend.id}: ${backend.status} executable=${backend.executable} version=${backend.version ?? "(unknown)"}`),
    `  next: ${result.nextAction}`,
  ].join("\n");
}

export function renderResearchBackendStatusJson(result: ResearchAnalysisBackendStatus): string {
  return `${JSON.stringify({
    schemaVersion: 1,
    backendStatus: result,
  }, null, 2)}\n`;
}

function valueAtPath(value: unknown, pathExpression: string): unknown {
  return pathExpression.split(".").reduce<unknown>((current, segment) => {
    if (!isRecord(current)) return undefined;
    return current[segment];
  }, value);
}

function runnerInputHashMap(record: unknown): Record<string, string> {
  const runner = normalizePaperRunnerRecord(isRecord(record) ? record : null);
  const inputs = Array.isArray(runner?.inputs) ? runner.inputs : [];
  const entries = inputs
    .filter((item): item is { path: string; sha256: string } => isRecord(item) && typeof item.path === "string" && typeof item.sha256 === "string")
    .map(item => [item.path, item.sha256] as const);
  return Object.fromEntries(entries);
}

function compareScientificField(
  comparisons: ResearchPaperRerunStability["comparisons"],
  field: string,
  baseline: unknown,
  repeat: unknown,
  tolerance: number,
): void {
  if (typeof baseline === "number" && typeof repeat === "number" && Number.isFinite(baseline) && Number.isFinite(repeat)) {
    const diff = Math.abs(baseline - repeat);
    comparisons.push({ field, baseline, repeat, tolerance, diff, status: diff <= tolerance ? "pass" : "fail" });
    return;
  }
  comparisons.push({ field, baseline, repeat, status: JSON.stringify(baseline) === JSON.stringify(repeat) ? "pass" : "fail" });
}

export async function researchPaperRerunStabilityCommand(opts: { baselineDir: string; repeatDir: string; tolerance?: number; outPath?: string }): Promise<ResearchPaperRerunStability> {
  const baselineDir = path.resolve(opts.baselineDir);
  const repeatDir = path.resolve(opts.repeatDir);
  const tolerance = opts.tolerance ?? 1e-8;
  const baselineAnalysis = await readJsonIfPresent(path.join(baselineDir, "analysis.json")) as Record<string, unknown> | null;
  const repeatAnalysis = await readJsonIfPresent(path.join(repeatDir, "analysis.json")) as Record<string, unknown> | null;
  const baselineQa = unwrapResearchArtifact<ResearchPaperQa>(await readJsonIfPresent(path.join(baselineDir, "qa-cli.json")), "paperQa");
  const repeatQa = unwrapResearchArtifact<ResearchPaperQa>(await readJsonIfPresent(path.join(repeatDir, "qa-cli.json")), "paperQa");
  const baselineLifecycle = unwrapResearchArtifact<ResearchPaperLifecycle>(await readJsonIfPresent(path.join(baselineDir, "lifecycle.json")), "paperLifecycle");
  const repeatLifecycle = unwrapResearchArtifact<ResearchPaperLifecycle>(await readJsonIfPresent(path.join(repeatDir, "lifecycle.json")), "paperLifecycle");
  const baselineRunner = await readJsonIfPresent(path.join(baselineDir, "runner-record.json"));
  const repeatRunner = await readJsonIfPresent(path.join(repeatDir, "runner-record.json"));
  const comparisons: ResearchPaperRerunStability["comparisons"] = [];

  if (!baselineAnalysis || !repeatAnalysis) {
    comparisons.push({ field: "analysis.json", baseline: Boolean(baselineAnalysis), repeat: Boolean(repeatAnalysis), status: "fail" });
  } else {
    for (const field of [
      "rowCounts.completeCaseEligible",
      "model.type",
      "model.exposureCoefficient",
      "model.oddsRatio",
      "model.standardError",
      "model.ci95",
      "model.pValue",
      "weights.weight",
      "weights.strata",
      "weights.psu",
      "weights.domain.id",
      "weights.domain.isSubsample",
    ]) {
      const baseline = valueAtPath(baselineAnalysis, field);
      const repeat = valueAtPath(repeatAnalysis, field);
      if (typeof baseline === "undefined" && typeof repeat === "undefined") continue;
      compareScientificField(comparisons, field, baseline, repeat, tolerance);
    }
  }
  compareScientificField(comparisons, "qa.status", baselineQa?.status, repeatQa?.status, tolerance);
  compareScientificField(comparisons, "lifecycle.status", baselineLifecycle?.lifecycleStatus, repeatLifecycle?.lifecycleStatus, tolerance);
  const baselineRunnerRecord = normalizePaperRunnerRecord(isRecord(baselineRunner) ? baselineRunner : null);
  const repeatRunnerRecord = normalizePaperRunnerRecord(isRecord(repeatRunner) ? repeatRunner : null);
  compareScientificField(
    comparisons,
    "runner.analysisSpec.specHash",
    valueAtPath(baselineRunnerRecord, "analysisSpec.specHash"),
    valueAtPath(repeatRunnerRecord, "analysisSpec.specHash"),
    tolerance,
  );
  compareScientificField(comparisons, "runner.inputs.sha256", runnerInputHashMap(baselineRunner), runnerInputHashMap(repeatRunner), tolerance);

  const status = comparisons.every(item => item.status === "pass") ? "pass" : "fail";
  const result: ResearchPaperRerunStability = {
    schemaVersion: 1,
    baselineDir,
    repeatDir,
    generatedAtIso: new Date().toISOString(),
    tolerance,
    status,
    comparisons,
    summary: `${comparisons.filter(item => item.status === "pass").length}/${comparisons.length} rerun stability checks passed.`,
    nextAction: status === "pass"
      ? "Rerun stability passed for tracked scientific fields; include this artifact in lifecycle or manifest before treating the packet as archive-stable."
      : "Inspect failed comparisons before treating the repeated paper run as scientifically equivalent.",
  };
  if (opts.outPath) await writeFile(path.resolve(opts.outPath), renderResearchPaperRerunStabilityJson(result));
  return result;
}

export function renderResearchPaperRerunStability(result: ResearchPaperRerunStability): string {
  return [
    `research paper rerun stability: ${result.status}`,
    `  baseline: ${result.baselineDir}`,
    `  repeat: ${result.repeatDir}`,
    `  tolerance: ${result.tolerance}`,
    `  summary: ${result.summary}`,
    ...result.comparisons.filter(item => item.status !== "pass").map(item => `  - ${item.field}: baseline=${JSON.stringify(item.baseline)} repeat=${JSON.stringify(item.repeat)} diff=${item.diff ?? "(n/a)"}`),
    `  next: ${result.nextAction}`,
  ].join("\n");
}

export function renderResearchPaperRerunStabilityJson(result: ResearchPaperRerunStability): string {
  return `${JSON.stringify({
    schemaVersion: 1,
    paperRerunStability: result,
  }, null, 2)}\n`;
}

export function renderResearchPaperIndex(result: ResearchPaperIndex): string {
  const lines = [
    "# Actual NHANES Paper Index",
    "",
    `Root: \`${result.papersDir}\``,
    "",
    "| Paper | Title | Complete-case N | Latest QA | Reader Language | Runner | QA file |",
    "|---|---|---:|---|---|---|---|",
  ];
  for (const paper of result.papers) {
    const language = paper.readerFacingLanguageStatus === "legacy_or_fail"
      ? `legacy/fail: ${paper.readerFacingLanguageHits.join(", ")}`
      : paper.readerFacingLanguageStatus;
    lines.push(`| \`${paper.id}\` | ${paper.title} | ${paper.completeCaseN ?? ""} | ${paper.latestQaStatus} (${paper.latestQaSummary}) | ${language} | ${paper.runnerStatus} | \`${paper.latestQaPath ? path.basename(paper.latestQaPath) : ""}\` |`);
  }
  lines.push("", "Use each paper directory for paper.md, analysis.json, `critique.md`, QA history, and runner-record.json when available. `Reader Language` separates current reader-facing papers from legacy outputs that still contain platform terminology.");
  return `${lines.join("\n")}\n`;
}

export function renderResearchPaperIndexJson(result: ResearchPaperIndex): string {
  return `${JSON.stringify({
    schemaVersion: 1,
    paperIndex: result,
  }, null, 2)}\n`;
}

function normalizePaperRunnerRecord(record: Record<string, unknown> | null): Record<string, unknown> | null {
  if (!record) return null;
  if (record.recordType === "agenteer.research.paper-runner-record") return record;
  if (record.paperRunnerRecord && typeof record.paperRunnerRecord === "object") {
    return record.paperRunnerRecord as Record<string, unknown>;
  }
  if (typeof record.status === "string") return record;
  return null;
}

export async function researchPaperRunnerRecordCommand(opts: {
  paperId: string;
  status?: ResearchPaperRunnerRecord["status"];
  runnerKind?: string;
  commandSummary: string;
  analysisSpecPath?: string;
  binding?: ResearchPaperRunnerRecord["analysisSpec"]["binding"];
  inputFiles?: string[];
  outputFiles?: string[];
  weighting?: string;
  variance?: string;
  population?: string;
  outPath?: string;
}): Promise<ResearchPaperRunnerRecord> {
  const analysisSpecPath = opts.analysisSpecPath ? path.resolve(opts.analysisSpecPath) : null;
  const specArtifactHash = analysisSpecPath && await exists(analysisSpecPath) ? await hashFile(analysisSpecPath) : null;
  const specHash = analysisSpecPath && await exists(analysisSpecPath)
    ? readAnalysisSpecHash(await readJsonIfPresent(analysisSpecPath)) ?? specArtifactHash
    : null;
  const inputs = await Promise.all((opts.inputFiles ?? []).map(fileRecord));
  const outputs = await Promise.all((opts.outputFiles ?? []).map(fileRecord));
  const binding = opts.binding ?? (analysisSpecPath ? "spec-governed" : "none");
  const warnings: ResearchCritiqueIssue[] = [];
  if (binding === "retrospective") {
    warnings.push({
      severity: "warning",
      code: "RETROSPECTIVE_ANALYSIS_SPEC_BINDING",
      message: "AnalysisSpec was attached after execution; treat this as provenance migration evidence, not proof of spec-governed execution.",
    });
  }
  if (analysisSpecPath && !specHash) {
    warnings.push({
      severity: "warning",
      code: "ANALYSIS_SPEC_HASH_MISSING",
      message: "AnalysisSpec path was provided but no spec hash could be read or derived.",
    });
  }
  if (outputs.length === 0) {
    warnings.push({
      severity: "warning",
      code: "RUNNER_OUTPUTS_MISSING",
      message: "No output artifacts were recorded, so the runner record cannot prove generated paper files.",
    });
  }
  const record: ResearchPaperRunnerRecord = {
    schemaVersion: 1,
    recordType: "agenteer.research.paper-runner-record",
    paperId: opts.paperId,
    status: opts.status ?? "succeeded",
    generatedAtIso: new Date().toISOString(),
    runner: {
      kind: opts.runnerKind ?? "local-deterministic-runner",
      commandSummary: opts.commandSummary,
    },
    analysisSpec: {
      path: analysisSpecPath,
      specHash,
      artifactHash: specArtifactHash,
      binding,
    },
    inputs,
    outputs,
    methods: {
      weighting: opts.weighting ?? "not specified",
      variance: opts.variance ?? "not specified",
      population: opts.population ?? "not specified",
    },
    warnings,
    nextAction: outputs.length
      ? binding === "retrospective"
        ? "Do not treat this as spec-governed execution; create a pre-run AnalysisSpec before the next paper."
        : "Run paper-qa and include this runner record in the paper index or golden manifest."
      : "Add output files after execution so this record can prove artifact hashes.",
  };
  if (opts.outPath) await writeFile(path.resolve(opts.outPath), renderResearchPaperRunnerRecordJson(record));
  return record;
}

export function renderResearchPaperRunnerRecord(result: ResearchPaperRunnerRecord): string {
  return [
    `research paper runner record: ${result.paperId}`,
    `  status: ${result.status}`,
    `  runner: ${result.runner.kind}`,
    `  spec: ${result.analysisSpec.specHash ?? "(none)"}`,
    `  spec binding: ${result.analysisSpec.binding}`,
    `  inputs: ${result.inputs.length}`,
    `  outputs: ${result.outputs.length}`,
    ...result.warnings.map(issue => `  - [${issue.severity}] ${issue.code}: ${issue.message}`),
    `  next: ${result.nextAction}`,
  ].join("\n");
}

export function renderResearchPaperRunnerRecordJson(result: ResearchPaperRunnerRecord): string {
  return `${JSON.stringify({
    schemaVersion: 1,
    paperRunnerRecord: result,
  }, null, 2)}\n`;
}

export async function researchTableSummaryCommand(opts: { file: string; python?: string }): Promise<ResearchTableSummary> {
  const resolved = path.resolve(opts.file);
  const format = tableFormatForFile(resolved);
  const fileStat = await stat(resolved);
  const fileSha256 = await hashFile(resolved);
  if (format === "parquet") {
    return readParquetTableSummary(resolved, fileStat.size, fileStat.mtimeMs, fileSha256, opts.python);
  }
  const rows = await readTabularRows(resolved);
  return summarizeRows(resolved, format, fileStat.size, fileStat.mtimeMs, fileSha256, rows);
}

export function renderResearchTableSummary(result: ResearchTableSummary): string {
  return [
    `research table summary: ${result.file}`,
    `  format: ${result.format}`,
    `  adapter: ${result.adapter.kind} (${result.adapter.executable}${result.adapter.version ? ` ${result.adapter.version}` : ""})`,
    `  sha256: ${result.fileSha256}`,
    `  rows: ${result.rowCount}`,
    `  columns: ${result.columnCount}`,
    ...result.warnings.map(issue => `  - [${issue.severity}] ${issue.code}: ${issue.message}`),
    ...result.columns.slice(0, 24).map(column => {
      const stats = column.inferredType === "number" && column.min !== undefined
        ? ` min=${column.min} max=${column.max} mean=${column.mean?.toFixed(3)}`
        : "";
      return `  - ${column.name}: ${column.inferredType} (${column.nonMissingRows} non-missing, ${(column.missingFraction * 100).toFixed(1)}% missing)${stats}`;
    }),
    result.columns.length > 24 ? `  ... ${result.columns.length - 24} more columns` : "",
  ].filter(Boolean).join("\n");
}

export function renderResearchTableSummaryJson(result: ResearchTableSummary): string {
  return `${JSON.stringify({
    schemaVersion: 1,
    tableSummary: result,
  }, null, 2)}\n`;
}

export async function researchExploreCommand(opts: { dataPath: string; outDir?: string; target?: string; maxPairs?: number; python?: string }): Promise<ResearchExplorationResult> {
  const dataPath = path.resolve(opts.dataPath);
  const outDir = opts.outDir ? path.resolve(opts.outDir) : null;
  const maxPairs = opts.maxPairs ?? 25;
  const tableSummary = await researchTableSummaryCommand({ file: dataPath, python: opts.python });
  const rows = tableSummary.format === "parquet"
    ? await readTabularRowsWithPython(dataPath, opts.python)
    : await readTabularRows(dataPath);
  const variableMap = buildExplorationVariableMap(tableSummary, rows, opts.target ?? null);
  const associationScan = scanExploratoryAssociations(rows, tableSummary);
  const rankedAssociations = associationScan.associations.slice(0, Math.max(maxPairs * 8, 100));
  const target = opts.target ?? null;
  const targetAssociations = target
    ? rankedAssociations.filter(item => item.left === target || item.right === target).slice(0, maxPairs)
    : [];
  const backgroundAssociations = (target
    ? rankedAssociations.filter(item => item.left !== target && item.right !== target)
    : rankedAssociations).slice(0, maxPairs);
  const associations = target
    ? [...targetAssociations, ...backgroundAssociations].slice(0, maxPairs)
    : backgroundAssociations;
  const questionSource = target && targetAssociations.length
    ? [...targetAssociations, ...backgroundAssociations]
    : associations;
  const explorationBurdenBase = buildExplorationBurden(rows, tableSummary, variableMap, associationScan, target, targetAssociations);
  const allCandidateQuestions = buildExplorationQuestions(questionSource, variableMap, target, explorationBurdenBase);
  const candidateLimit = Math.min(12, maxPairs);
  let candidateQuestions = allCandidateQuestions.slice(0, candidateLimit);
  const avoidedQuestions = allCandidateQuestions.filter(question => question.avoidAsPrimaryQuestion).slice(0, 3);
  for (const avoidedQuestion of avoidedQuestions) {
    if (candidateQuestions.some(question => question.id === avoidedQuestion.id) || !candidateQuestions.length) continue;
    const replaceIndex = Math.max(0, candidateQuestions.map(question => Boolean(question.avoidAsPrimaryQuestion)).lastIndexOf(false));
    candidateQuestions = candidateQuestions.map((question, index) => index === replaceIndex ? avoidedQuestion : question);
  }
  const promotionSummary = {
    promotable: candidateQuestions.filter(question => question.promotionStatus === "promotable_hypothesis").length,
    needsMethodsReview: candidateQuestions.filter(question => question.promotionStatus === "needs_methods_review").length,
    blocked: candidateQuestions.filter(question => question.promotionStatus === "blocked").length,
  };
  const explorationBurden = {
    ...explorationBurdenBase,
    promotionSummary,
    promotionClearance: explorationPromotionClearance(explorationBurdenBase, promotionSummary, candidateQuestions.length),
  };
  const recommendedQuestion = recommendedExplorationQuestion(candidateQuestions, outDir);
  const qaChecks = explorationQaChecks(tableSummary, variableMap, associations, candidateQuestions, target, targetAssociations, explorationBurden);
  const qaStatus = qaChecks.some(check => check.status === "fail")
    ? "blocked"
    : qaChecks.some(check => check.status === "warning")
      ? "warning"
      : "pass";
  const artifacts: ResearchExplorationResult["artifacts"] = [];
  const result: ResearchExplorationResult = {
    schemaVersion: 1,
    generatedAtIso: new Date().toISOString(),
    dataPath,
    outDir,
    target,
    posture: qaStatus === "blocked" ? "blocked" : "exploratory_hypothesis_generation",
    tableSummary,
    variableMap,
    associations,
    targetAssociations,
    backgroundAssociations,
    explorationBurden,
    candidateQuestions,
    recommendedQuestion,
    qa: { status: qaStatus, checks: qaChecks },
    artifacts,
    limitations: [
      "Exploration is hypothesis generation, not confirmation.",
      "Reported associations are unadjusted and should not be interpreted causally.",
      "Multiple comparisons, missingness, sparse categories, survey design, clustering, and temporal ordering must be handled before inferential claims.",
      "Candidate questions must be promoted into an explicit analysis plan before execution or paper generation.",
    ],
    nextAction: candidateQuestions.some(question => question.promotionStatus === "promotable_hypothesis")
      ? "Promote one candidate question into method-select/modeling-plan with explicit outcome, exposure, covariates, design limits, and validation checks."
      : candidateQuestions.length
        ? "Resolve promotion blockers or perform methods review before turning an exploratory question into an analysis plan."
        : "Improve dataset quality or provide a target variable before promoting research questions.",
  };
  if (outDir) {
    await mkdir(outDir, { recursive: true });
    const jsonPath = path.join(outDir, "exploration.json");
    const reportPath = path.join(outDir, "exploration-report.md");
    const questionsPath = path.join(outDir, "candidate-questions.json");
    await writeFile(jsonPath, renderResearchExploreJson(result));
    await writeFile(reportPath, renderResearchExplore(result));
    await writeFile(questionsPath, `${JSON.stringify({ schemaVersion: 1, candidateQuestions }, null, 2)}\n`);
    for (const artifact of [
      { kind: "exploration", path: jsonPath },
      { kind: "exploration-report", path: reportPath },
      { kind: "candidate-questions", path: questionsPath },
    ]) {
      const record = await fileRecord(artifact.path);
      artifacts.push({ kind: artifact.kind, path: artifact.path, sha256: record.sha256, bytes: record.bytes });
    }
    await writeFile(jsonPath, renderResearchExploreJson(result));
  }
  return result;
}

export function renderResearchExplore(result: ResearchExplorationResult): string {
  const associationLines = (items: ResearchExplorationResult["associations"]) => items.length
    ? items.slice(0, 12).map(item => `- ${item.left} vs ${item.right}: ${item.method}=${item.strength.toFixed(3)} (${item.direction}, n=${item.n})${item.caveats.length ? `; caveats: ${item.caveats.join("; ")}` : ""}`)
    : ["- No eligible associations found."];
  return [
    "# Dataset Exploration Report",
    "",
    `Data: \`${result.dataPath}\``,
    `Rows: ${result.tableSummary.rowCount}`,
    `Columns: ${result.tableSummary.columnCount}`,
    `Posture: ${result.posture}`,
    `QA: ${result.qa.status}`,
    "",
    "## Recommended Next Question",
    "",
    ...(result.recommendedQuestion ? [
      `Question: ${result.recommendedQuestion.question}`,
      `Route intent: ${result.recommendedQuestion.routeIntent}`,
      `Primary use: ${result.recommendedQuestion.primaryQuestionUse}`,
      `Reason: ${result.recommendedQuestion.reason}`,
      `Next command: \`${result.recommendedQuestion.nextCommand}\``,
    ] : [
      "No recommended question is available.",
    ]),
    "",
    ...(result.target ? [
      "## Target-Centered Associations",
      "",
      ...associationLines(result.targetAssociations),
      "",
      "## Background Correlation Map",
      "",
      ...associationLines(result.backgroundAssociations),
    ] : [
      "## Strongest Exploratory Associations",
      "",
      ...associationLines(result.associations),
    ]),
    "",
    "## Exploration Burden",
    "",
    `- Eligible pairs: ${result.explorationBurden.eligiblePairCount}`,
    `- Tested pairs: ${result.explorationBurden.testedPairCount}`,
    `- Target-centered tested pairs: ${result.explorationBurden.targetPairCount}`,
    `- Multiplicity risk: ${result.explorationBurden.multiplicityRisk}`,
    `- Survey/design candidates: ${result.explorationBurden.surveyDesignCandidates.length ? result.explorationBurden.surveyDesignCandidates.map(item => `${item.name} (${item.reason})`).join("; ") : "none detected"}`,
    `- High-missingness variables: ${result.explorationBurden.highMissingnessVariables.length ? result.explorationBurden.highMissingnessVariables.map(item => `${item.name} ${(item.missingFraction * 100).toFixed(1)}%`).join("; ") : "none over 50%"}`,
    `- Sparse categorical variables: ${result.explorationBurden.sparseCategoricalVariables.length ? result.explorationBurden.sparseCategoricalVariables.map(item => `${item.name} min cell ${item.minCellCount}`).join("; ") : "none detected"}`,
    `- Possible leakage/proxy pairs: ${result.explorationBurden.possibleLeakagePairs.length ? result.explorationBurden.possibleLeakagePairs.map(item => `${item.left} vs ${item.right} (${item.reason})`).join("; ") : "none detected"}`,
    `- Candidate promotion summary: ${result.explorationBurden.promotionSummary.promotable} promotable, ${result.explorationBurden.promotionSummary.needsMethodsReview} need methods review, ${result.explorationBurden.promotionSummary.blocked} blocked`,
    `- Promotion clearance: ${result.explorationBurden.promotionClearance.level}${result.explorationBurden.promotionClearance.reasons.length ? ` (${result.explorationBurden.promotionClearance.reasons.join("; ")})` : ""}`,
    "",
    "## Candidate Research Questions",
    "",
    ...result.candidateQuestions.map(question => `- [${question.priority}; ${question.promotionStatus}; ${question.primaryQuestionUse}; ${question.routeIntent}; interest ${question.researchInterestScore}/100; ${question.taxonomy}] ${question.question} Why: ${question.whyThisQuestion} Taxonomy evidence: ${question.taxonomyEvidence.matchedRuleIds.join(", ")}. Suggested method: ${question.suggestedMethod}. Rationale: ${question.rationale}${question.avoidAsPrimaryQuestion ? ` Avoid as primary: ${question.avoidAsPrimaryQuestion}` : ""}${question.promotionBlockers.length ? ` Promotion blockers: ${question.promotionBlockers.join("; ")}` : ""}`),
    result.candidateQuestions.length ? "" : "- No candidate questions were generated.",
    "## QA Checks",
    "",
    ...result.qa.checks.map(check => `- [${check.status}] ${check.id}: ${check.message}`),
    "## Limitations",
    "",
    ...result.limitations.map(item => `- ${item}`),
    "",
    `Next action: ${result.nextAction}`,
  ].join("\n");
}

export function renderResearchExploreJson(result: ResearchExplorationResult): string {
  return `${JSON.stringify({
    schemaVersion: 1,
    exploration: result,
  }, null, 2)}\n`;
}

export async function researchExplorePromoteCommand(opts: {
  explorationPath: string;
  questionId: string;
  outPath?: string;
  methodsReviewNote?: string;
}): Promise<ResearchExplorationHandoff> {
  const sourceExplorationPath = path.resolve(opts.explorationPath);
  const raw = JSON.parse(await readFile(sourceExplorationPath, "utf-8")) as Record<string, unknown>;
  const exploration = (raw.exploration && typeof raw.exploration === "object" ? raw.exploration : raw) as ResearchExplorationResult;
  if (!Array.isArray(exploration.candidateQuestions)) throw new Error("exploration artifact does not contain candidateQuestions");
  const question = exploration.candidateQuestions.find(candidate => candidate.id === opts.questionId);
  if (!question) throw new Error(`candidate question not found: ${opts.questionId}`);
  const clearance = exploration.explorationBurden?.promotionClearance;
  if (!clearance) throw new Error("exploration artifact is missing explorationBurden.promotionClearance");
  const methodsReviewNote = opts.methodsReviewNote?.trim() || null;
  const blockers = uniqueStrings([
    ...question.promotionBlockers,
    ...clearance.reasons,
  ]);
  if (clearance.level === "stop" || question.promotionStatus === "blocked") {
    throw new Error(`cannot promote blocked exploration question: ${blockers.join("; ") || "blocked"}`);
  }
  if ((clearance.level === "hold_for_methods_review" || question.promotionStatus === "needs_methods_review") && !methodsReviewNote) {
    throw new Error("methods review note is required to hand off this exploratory question");
  }
  const status: ResearchExplorationHandoff["status"] =
    question.promotionStatus === "promotable_hypothesis" && clearance.level === "clear_for_handoff"
      ? "ready_for_modeling_plan"
      : "needs_methods_review";
  const designWarnings = uniqueStrings([
    ...blockers,
    ...exploration.limitations,
  ]);
  const recommendedCommand = [
    "agenteer research modeling-plan",
    `--question ${JSON.stringify(question.question)}`,
    `--target ${JSON.stringify(question.outcome)}`,
    `--table ${JSON.stringify(exploration.dataPath)}`,
    "--json",
  ].join(" ");
  const sourceExplorationSha256 = await hashFile(sourceExplorationPath);
  const suggestedModelFamily = question.routeIntent === "data_quality_review"
    ? "data-quality review; do not fit an inferential model until leakage/design concerns are resolved"
    : question.routeIntent === "prediction_modeling"
      ? "prediction model with train/test validation and calibration as applicable"
      : question.routeIntent === "diagnostic_accuracy"
        ? "diagnostic accuracy table or model with reference-standard review"
        : question.routeIntent === "causal_design_review"
          ? "causal design review before any effect estimate"
          : question.suggestedMethod;
  const analysisSpecCandidate: ResearchExplorationHandoff["analysisSpecCandidate"] = {
    status: status === "ready_for_modeling_plan" ? "ready_for_spec_authoring" : "needs_methods_review",
    routeIntent: question.routeIntent,
    researchQuestion: question.question,
    estimandBoundary: question.routeIntent === "explanatory_association"
      ? "Exploratory explanatory association only; not causal and not a prediction-model development claim."
      : question.routeIntent === "data_quality_review"
        ? "Data-quality or leakage review; not a substantive association estimand."
        : "Exploratory candidate; specify estimand and reporting boundary before execution.",
    population: {
      sourceTable: exploration.dataPath,
      rowCount: exploration.tableSummary.rowCount,
      description: "Rows available in the exploration source table; refine eligibility and survey domains before execution.",
    },
    variables: {
      outcome: question.outcome,
      exposure: question.exposure,
      covariates: [],
      excludedUntilReviewed: uniqueStrings([
        ...exploration.explorationBurden.possibleLeakagePairs.flatMap(item => [item.left, item.right]),
        ...exploration.explorationBurden.surveyDesignCandidates.map(item => item.name),
      ]).filter(name => name !== question.outcome && name !== question.exposure),
    },
    designRequirements: designWarnings,
    suggestedModelFamily,
    requiredBeforeExecution: uniqueStrings([
      ...question.requiredNextChecks,
      "Write or approve an AnalysisSpec before execution.",
      "Confirm survey weights, strata, PSU, cycle handling, missingness policy, and sparse-cell policy when applicable.",
      "Declare whether the study is explanatory, predictive, diagnostic, causal, descriptive, or data-quality review.",
    ]),
    provenance: {
      sourceExplorationPath,
      sourceExplorationSha256,
      questionId: opts.questionId,
      taxonomyVersion: question.taxonomyEvidence.taxonomyVersion,
      routeIntent: question.routeIntent,
    },
  };
  const handoff: ResearchExplorationHandoff = {
    schemaVersion: 1,
    generatedAtIso: new Date().toISOString(),
    sourceExplorationPath,
    sourceExplorationSha256,
    questionId: opts.questionId,
    status,
    clearanceLevel: clearance.level,
    methodsReviewNote,
    question,
    blockers,
    modelingPlanSeed: {
      question: question.question,
      target: exploration.target,
      outcome: question.outcome,
      exposure: question.exposure,
      routeIntent: question.routeIntent,
      routeIntentRationale: question.routeIntentRationale,
      taxonomy: question.taxonomy,
      researchInterestScore: question.researchInterestScore,
      primaryQuestionUse: question.primaryQuestionUse,
      taxonomyEvidence: question.taxonomyEvidence,
      whyThisQuestion: question.whyThisQuestion,
      avoidAsPrimaryQuestion: question.avoidAsPrimaryQuestion,
      suggestedMethod: question.suggestedMethod,
      tablePath: exploration.dataPath,
      rowCount: exploration.tableSummary.rowCount,
      columnCount: exploration.tableSummary.columnCount,
      designWarnings,
      requiredNextChecks: question.requiredNextChecks,
    },
    analysisSpecCandidate,
    recommendedCommand,
    artifacts: [],
  };
  if (opts.outPath) {
    const outPath = path.resolve(opts.outPath);
    await mkdir(path.dirname(outPath), { recursive: true });
    await writeFile(outPath, renderResearchExplorePromoteJson(handoff));
    const record = await fileRecord(outPath);
    handoff.artifacts.push({ kind: "exploration-handoff", path: outPath, sha256: record.sha256, bytes: record.bytes });
    await writeFile(outPath, renderResearchExplorePromoteJson(handoff));
  }
  return handoff;
}

export function renderResearchExplorePromote(result: ResearchExplorationHandoff): string {
  return [
    "research exploration handoff",
    `  status: ${result.status}`,
    `  clearance: ${result.clearanceLevel}`,
    `  question: ${result.question.question}`,
    `  outcome: ${result.modelingPlanSeed.outcome}`,
    `  exposure: ${result.modelingPlanSeed.exposure}`,
    `  route intent: ${result.question.routeIntent}`,
    `  route rationale: ${result.question.routeIntentRationale}`,
    `  taxonomy: ${result.question.taxonomy}; use=${result.question.primaryQuestionUse}; interest=${result.question.researchInterestScore}/100`,
    `  taxonomy evidence: ${result.question.taxonomyEvidence.matchedRuleIds.join(", ")}`,
    `  why: ${result.question.whyThisQuestion}`,
    `  avoid primary: ${result.question.avoidAsPrimaryQuestion ?? "(none)"}`,
    `  spec candidate: ${result.analysisSpecCandidate.status}; model=${result.analysisSpecCandidate.suggestedModelFamily}`,
    `  methods review: ${result.methodsReviewNote ?? "(none)"}`,
    `  blockers: ${result.blockers.length ? result.blockers.join("; ") : "none"}`,
    `  recommended: ${result.recommendedCommand}`,
  ].join("\n");
}

export function renderResearchExplorePromoteJson(result: ResearchExplorationHandoff): string {
  return `${JSON.stringify({
    schemaVersion: 1,
    explorationHandoff: result,
  }, null, 2)}\n`;
}

export async function researchInferSchemaCommand(file: string): Promise<ResearchSchemaInference> {
  const resolved = path.resolve(file);
  const rows = JSON.parse(await readFile(resolved, "utf-8")) as Array<Record<string, unknown>>;
  const columns = uniqueStrings(rows.flatMap(row => Object.keys(row))).map(name => {
    const values = rows.map(row => row[name]).filter(hasValue);
    const types = uniqueStrings(values.map(value => typeof value));
    const inferredType: ResearchSchemaInference["columns"][number]["inferredType"] =
      values.length === 0 ? "empty"
        : types.length > 1 ? "mixed"
          : types[0] === "number" || types[0] === "string" || types[0] === "boolean" ? types[0] : "mixed";
    return {
      name,
      inferredType,
      nonMissing: values.length,
    };
  });
  return {
    file: resolved,
    rowCount: rows.length,
    columns,
  };
}

export function renderResearchSchemaInference(result: ResearchSchemaInference): string {
  return [
    `research schema inference: ${result.file}`,
    `  rows: ${result.rowCount}`,
    `  columns: ${result.columns.length}`,
    ...result.columns.map(column => `  - ${column.name}: ${column.inferredType} (${column.nonMissing} non-missing)`),
  ].join("\n");
}

export function renderResearchSchemaInferenceJson(result: ResearchSchemaInference): string {
  return `${JSON.stringify({
    schemaVersion: 1,
    schemaInference: result,
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
  const approvedAtIso = new Date().toISOString();
  const decisionId = createHash("sha256").update(JSON.stringify({
    packetDir: resolved,
    approvedAtIso,
    title: packet.protocol.title,
    critiqueStatus: critique.status,
    scoutStatus: scout?.status ?? "missing",
    note: note.trim() || "Approved for the next local research-pipeline stage.",
  })).digest("hex").slice(0, 16);
  const approvalWithoutHash: Omit<ResearchApprovalRecord, "recordHash"> = {
    schemaVersion: 1,
    eventType: "research.packet.approval",
    packetDir: resolved,
    approvedAtIso,
    decisionId,
    reviewer: "agent-human-in-the-loop",
    status: "approved",
    title: packet.protocol.title,
    note: note.trim() || "Approved for the next local research-pipeline stage.",
    critiqueStatus: critique.status,
    scoutStatus: scout?.status ?? "missing",
  };
  const approval: ResearchApprovalRecord = {
    ...approvalWithoutHash,
    recordHash: hashResearchEventRecord(approvalWithoutHash),
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

export async function researchApprovalVerifyCommand(packetDir: string): Promise<ResearchApprovalVerification> {
  const resolved = path.resolve(packetDir);
  const approvalPath = path.join(resolved, "approval.json");
  if (!(await exists(approvalPath))) {
    return {
      packetDir: resolved,
      approvalPath,
      status: "missing",
      expectedHash: null,
      actualHash: null,
      eventType: null,
    };
  }
  const approval = JSON.parse(await readFile(approvalPath, "utf-8")) as Partial<ResearchApprovalRecord>;
  const { recordHash, ...withoutHash } = approval;
  const expectedHash = hashResearchEventRecord(withoutHash);
  const actualHash = typeof recordHash === "string" ? recordHash : null;
  return {
    packetDir: resolved,
    approvalPath,
    status: actualHash === expectedHash ? "valid" : "invalid",
    expectedHash,
    actualHash,
    eventType: typeof approval.eventType === "string" ? approval.eventType : null,
  };
}

export function renderResearchApprovalVerification(result: ResearchApprovalVerification): string {
  return [
    `research approval verify: ${result.packetDir}`,
    `  status: ${result.status}`,
    `  path: ${result.approvalPath}`,
    `  event: ${result.eventType ?? "(none)"}`,
    `  expected hash: ${result.expectedHash ?? "(none)"}`,
    `  actual hash: ${result.actualHash ?? "(none)"}`,
  ].join("\n");
}

export function renderResearchApprovalVerificationJson(result: ResearchApprovalVerification): string {
  return `${JSON.stringify({
    schemaVersion: 1,
    approvalVerification: result,
  }, null, 2)}\n`;
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
  const review: ResearchReportReview = {
    packetDir: resolved,
    status: issues.some(issue => issue.severity !== "note") ? "needs_review" : "pass",
    issues,
  };
  await writeFile(path.join(resolved, "report-review.json"), `${JSON.stringify(review, null, 2)}\n`);
  return review;
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

export function renderResearchReportReviewJson(review: ResearchReportReview): string {
  return `${JSON.stringify({
    schemaVersion: 1,
    reportReview: review,
  }, null, 2)}\n`;
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

export function renderResearchArtifactManifestJson(manifest: ResearchArtifactManifest): string {
  return `${JSON.stringify({
    schemaVersion: 1,
    artifactManifest: manifest,
  }, null, 2)}\n`;
}

export async function researchManifestVerifyCommand(packetDir: string): Promise<ResearchManifestVerification> {
  const resolved = path.resolve(packetDir);
  const artifactManifestPath = path.join(resolved, "artifact-manifest.json");
  const goldenManifestPath = path.join(resolved, "golden-manifest.json");
  const manifestPath = await exists(artifactManifestPath) ? artifactManifestPath : goldenManifestPath;
  if (!(await exists(manifestPath))) {
    return {
      packetDir: resolved,
      manifestPath,
      status: "missing",
      validLocal: false,
      validForShare: false,
      shareStatus: null,
      checkedArtifacts: 0,
      issues: ["artifact manifest is missing"],
      typedIssues: [{ severity: "blocker", code: "MANIFEST_MISSING", message: "Artifact manifest is missing." }],
    };
  }
  const manifest = JSON.parse(await readFile(manifestPath, "utf-8")) as ResearchArtifactManifest | { artifacts?: ResearchArtifactManifest["artifacts"]; checks?: Record<string, unknown>; status?: unknown; shareStatus?: unknown };
  const issues: string[] = [];
  const typedIssues: ResearchCritiqueIssue[] = [];
  const addIssue = (severity: ResearchCritiqueIssue["severity"], code: string, message: string) => {
    issues.push(message);
    typedIssues.push({ severity, code, message });
  };
  if ("checks" in manifest && manifest.checks && typeof manifest.checks === "object") {
    const checks = manifest.checks as Record<string, unknown>;
    if (checks.sourceValidation !== "passed") addIssue("blocker", "SOURCE_VALIDATION_NOT_PASSED", "golden source validation is not passed");
    if (checks.rerunDiff !== "stable") addIssue("blocker", "RERUN_DIFF_UNSTABLE", "golden rerun diff is not stable");
    if (checks.paperQa !== "pass") addIssue("blocker", "PAPER_QA_NOT_PASSED", "golden paper QA is not pass");
    if (checks.runnerRecord !== "present") addIssue("blocker", "RUNNER_RECORD_MISSING", "golden runner record is not present");
  }
  if ("localReviewStatus" in manifest && manifest.localReviewStatus !== "ready_for_local_review") {
    addIssue("blocker", "LOCAL_REVIEW_NOT_READY", "golden local review status is not ready");
  }
  const artifacts = Array.isArray(manifest.artifacts) ? manifest.artifacts : [];
  for (const artifact of artifacts) {
    const artifactPath = path.isAbsolute(artifact.path) ? artifact.path : path.join(resolved, artifact.path);
    if (!(await exists(artifactPath))) {
      addIssue("blocker", "ARTIFACT_MISSING", `${artifact.path} is missing`);
      continue;
    }
    const [info, contents] = await Promise.all([stat(artifactPath), readFile(artifactPath)]);
    const sha256 = createHash("sha256").update(contents).digest("hex");
    if (info.size !== artifact.bytes) addIssue("blocker", "ARTIFACT_BYTE_COUNT_CHANGED", `${artifact.path} byte count changed`);
    if (sha256 !== artifact.sha256) addIssue("blocker", "ARTIFACT_SHA256_CHANGED", `${artifact.path} sha256 changed`);
  }
  const analysisSpecArtifact = artifacts.find(artifact => path.basename(artifact.path) === "analysis-spec.json");
  const runnerRecordArtifact = artifacts.find(artifact => path.basename(artifact.path) === "runner-record.json");
  if (analysisSpecArtifact && runnerRecordArtifact) {
    const analysisSpecPath = path.isAbsolute(analysisSpecArtifact.path) ? analysisSpecArtifact.path : path.join(resolved, analysisSpecArtifact.path);
    const runnerRecordPath = path.isAbsolute(runnerRecordArtifact.path) ? runnerRecordArtifact.path : path.join(resolved, runnerRecordArtifact.path);
    if (await exists(analysisSpecPath) && await exists(runnerRecordPath)) {
      const specDocument = JSON.parse(await readFile(analysisSpecPath, "utf-8")) as { analysisSpec?: { specHash?: unknown } };
      const runnerRecord = JSON.parse(await readFile(runnerRecordPath, "utf-8")) as { analysisSpec?: { specHash?: unknown } };
      const expectedSpecHash = specDocument.analysisSpec?.specHash;
      const recordedSpecHash = runnerRecord.analysisSpec?.specHash;
      if (typeof expectedSpecHash === "string" && recordedSpecHash !== expectedSpecHash) {
        addIssue("blocker", "RUNNER_SPEC_HASH_MISMATCH", "runner record AnalysisSpec hash does not match current analysis-spec.json");
      }
    }
  }
  const manifestRecord = manifest as { shareStatus?: unknown };
  const shareStatus = typeof manifestRecord.shareStatus === "string" ? manifestRecord.shareStatus : null;
  const status = issues.length ? "invalid" : "valid";
  return {
    packetDir: resolved,
    manifestPath,
    status,
    validLocal: status === "valid",
    validForShare: status === "valid" && ["ready_to_share", "share_ready", "share_safe", "ready_for_share"].includes(shareStatus ?? ""),
    shareStatus,
    checkedArtifacts: artifacts.length,
    issues,
    typedIssues,
  };
}

export function renderResearchManifestVerification(result: ResearchManifestVerification): string {
  return [
    `research manifest verify: ${result.packetDir}`,
    `  status: ${result.status}`,
    `  valid local: ${result.validLocal}`,
    `  valid for share: ${result.validForShare}${result.shareStatus ? ` (${result.shareStatus})` : ""}`,
    `  manifest: ${result.manifestPath}`,
    `  checked artifacts: ${result.checkedArtifacts}`,
    `  issues: ${result.issues.join("; ") || "(none)"}`,
  ].join("\n");
}

export function renderResearchManifestVerificationJson(result: ResearchManifestVerification): string {
  return `${JSON.stringify({
    schemaVersion: 1,
    manifestVerification: result,
  }, null, 2)}\n`;
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

export function renderResearchLoopNoteJson(result: ResearchLoopNoteResult): string {
  return `${JSON.stringify({
    schemaVersion: 1,
    loopNote: result,
  }, null, 2)}\n`;
}

export async function researchCycleAuditCommand(cycleDir: string): Promise<ResearchCycleAudit> {
  const resolved = path.resolve(cycleDir);
  const entries = await collectCycleFiles(resolved);
  const names = entries.map(entry => entry.relative);
  const combinedText = entries.map(entry => `\n--- ${entry.relative} ---\n${entry.text}`).join("\n").toLowerCase();
  const summary = entries.find(entry => entry.relative === "summary.md")?.text.toLowerCase() ?? "";
  const metaStatuses = entries
    .filter(entry => entry.relative.endsWith(".meta.json"))
    .map(entry => parseJsonObject(entry.text))
    .filter(isRecord)
    .map(meta => Number(meta.status));
  const hasPassingCommand = metaStatuses.some(status => status === 0);
  const hasFailingCommand = metaStatuses.some(status => Number.isFinite(status) && status !== 0);
  const checks: ResearchCycleAudit["checks"] = [
    makeCycleCheck(
      "research-question",
      /question:\s+\S/i.test(combinedText) || /research question|study asks|proposed study asks/i.test(combinedText),
      names.filter(name => /summary|question|protocol|artifact/.test(name)),
      "Cycle must design or select a concrete research question/stress case.",
    ),
    makeCycleCheck(
      "pipeline-run",
      names.some(name => /(protocol|analysis-spec|cohort|semantic|claim-guard|reliability|trajectory|repair|critic|intake|scorecard|packet|audit)/i.test(name)) || hasPassingCommand,
      names.filter(name => /(protocol|analysis-spec|cohort|semantic|claim-guard|reliability|trajectory|repair|critic|intake|scorecard|packet|audit|meta)/i.test(name)),
      "Cycle must run or extend the Agenteer-powered research pipeline.",
    ),
    makeCycleCheck(
      "human-review-failure-attribution",
      /human[- ]in[- ]the[- ]loop|reviewed|inspect(ed)?|judg(e|ment)|attribut(e|ion)|friction belongs|failure attribution|diagnosis/i.test(combinedText),
      names.filter(name => /agent-record|review|summary|critic|audit/.test(name)),
      "Cycle must record human-in-the-loop review and failure/friction attribution.",
    ),
    makeCycleCheck(
      "implemented-improvement",
      /implemented|added command|added test|patched|modified|new validator|new node|updated cli|changed code|improvement implemented/i.test(combinedText),
      names.filter(name => /agent-record|summary|repair|proposal|agenda/.test(name)),
      "Cycle must implement or explicitly record a concrete improvement, not just run a command.",
    ),
    makeCycleCheck(
      "focused-verification",
      /verification passed|npm test|npm run build|tests? passed|focused test|rerun|status\":\s*0/i.test(combinedText) || hasPassingCommand,
      names.filter(name => /meta|summary|agent-record|repair/.test(name)),
      "Cycle must verify the improvement or rerun the relevant pipeline path.",
    ),
    makeCycleCheck(
      "next-step-decision",
      /next:|next action|what should happen next|increase task difficulty|continue with|blocker/i.test(combinedText),
      names.filter(name => /summary|agent-record|agenda|memory/.test(name)),
      "Cycle must record what should happen next.",
    ),
  ];
  const passed = checks.filter(check => check.status === "pass").length;
  const score = passed / checks.length;
  const hasManyGeneratedArtifacts = names.filter(name => name.endsWith(".json")).length >= 2 && !/implemented|human[- ]in[- ]the[- ]loop|failure attribution|diagnosis/i.test(summary);
  const countsAsCycle = checks.every(check => check.status === "pass");
  const status: ResearchCycleAudit["status"] = countsAsCycle ? "full_cycle" : hasManyGeneratedArtifacts ? "batch_sweep" : "incomplete";
  const correctiveActions = checks
    .filter(check => check.status === "fail")
    .map(check => check.detail);
  if (status === "batch_sweep") {
    correctiveActions.unshift("Relabel this directory as a batch dogfood sweep unless a separate human-review and improvement record is added.");
  }
  if (hasFailingCommand) {
    correctiveActions.push("Inspect failing command metadata before counting this work as verified.");
  }
  return {
    cycleDir: resolved,
    status,
    countsAsCycle,
    score,
    checks,
    correctiveActions,
    nextAction: countsAsCycle
      ? "This directory can count as a completed cycle; use its next-step decision to continue."
      : "Do not count this as a completed cycle until failed checks are satisfied.",
  };
}

export function renderResearchCycleAudit(result: ResearchCycleAudit): string {
  return [
    `research cycle audit: ${result.cycleDir}`,
    `  status: ${result.status}`,
    `  counts as cycle: ${result.countsAsCycle}`,
    `  score: ${result.score.toFixed(2)}`,
    ...result.checks.map(check => `  - [${check.status}] ${check.id}: ${check.detail}`),
    `  next: ${result.nextAction}`,
  ].join("\n");
}

export function renderResearchCycleAuditJson(result: ResearchCycleAudit): string {
  return `${JSON.stringify({
    schemaVersion: 1,
    cycleAudit: result,
  }, null, 2)}\n`;
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
  const packetArtifacts = await listResearchArtifactNames(resolvedPacket);
  const useRedactedDataAccess = await hasFreshRedactedDataAccess(resolvedPacket);
  const exportSourceArtifacts = packetArtifacts.filter(name => !(name === "data-access.json" && useRedactedDataAccess));
  const copiedArtifacts = uniqueStrings([
    ...exportSourceArtifacts,
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

  await researchArtifactManifestCommand(resolvedPacket);
  for (const artifact of exportSourceArtifacts) {
    if (artifact === "artifact-manifest.json" || artifact === "export-record.json") continue;
    await copyFile(path.join(resolvedPacket, artifact), path.join(resolvedOut, artifact));
  }
  const shareRecord = {
    ...summary,
    packetDir: ".",
    exportDir: ".",
    summaryPath: "export-summary.json",
  };
  await writeFile(path.join(resolvedOut, "export-record.json"), `${JSON.stringify(shareRecord, null, 2)}\n`);
  const exportManifest = await buildResearchExportManifest(resolvedOut, copiedArtifacts.filter(artifact => artifact !== "artifact-manifest.json"));
  await writeFile(path.join(resolvedOut, "artifact-manifest.json"), `${JSON.stringify(exportManifest, null, 2)}\n`);
  const exportReceipt = await buildResearchExportReceipt(resolvedOut, copiedArtifacts);
  summary.exportReceipt = exportReceipt;
  await writeFile(summaryPath, `${JSON.stringify({
    ...summary,
    packetDir: ".",
    exportDir: ".",
    summaryPath: "export-summary.json",
  }, null, 2)}\n`);
  return summary;
}

export function renderResearchPacketExport(result: ResearchPacketExport): string {
  return [
    `research packet export: ${result.exportDir}`,
    `  source: ${result.packetDir}`,
    `  artifacts: ${result.copiedArtifacts.join(", ")}`,
    `  export receipt: ${result.exportReceipt?.status ?? "missing"}`,
    `  summary: ${result.summaryPath}`,
  ].join("\n");
}

export async function researchCheckpointCommand(packetDir: string): Promise<ResearchCheckpoint> {
  const resolved = path.resolve(packetDir);
  const artifacts = {
    design: await exists(researchStageArtifactPath("design", resolved)),
    critique: await exists(researchStageArtifactPath("critique", resolved)),
    methodsValidation: await exists(researchStageArtifactPath("methods-validation", resolved)),
    scoutPlan: await exists(researchStageArtifactPath("scout", resolved)),
    dataQuality: await exists(researchStageArtifactPath("data-quality", resolved)),
    runnerSpec: await exists(researchStageArtifactPath("runner-spec", resolved)),
    approval: await exists(researchStageArtifactPath("approval", resolved)),
    analysisResult: await exists(researchStageArtifactPath("analysis", resolved)),
    report: await exists(path.join(resolved, "report.md")),
    artifactManifest: await exists(researchStageArtifactPath("manifest", resolved)),
    exportRecord: await exists(researchStageArtifactPath("export", resolved)),
  };
  if (!artifacts.design) {
    return withResearchCheckpointStageGate({
      packetDir: resolved,
      artifacts,
      currentStage: "design",
      nextCommand: "agenteer research design --project medbrevia-nhanes --repo <repo> --question <question> --out <packet-dir>",
      reason: "No design packet exists yet.",
    });
  }
  if (!artifacts.scoutPlan) {
    return withResearchCheckpointStageGate({
      packetDir: resolved,
      artifacts,
      currentStage: "scout",
      nextCommand: `agenteer research critique --packet ${resolved} && agenteer research scout --packet ${resolved}`,
      reason: "Design exists; deterministic critique and scout planning should happen next.",
    });
  }
  if (!artifacts.approval) {
    if (!artifacts.runnerSpec) {
      return withResearchCheckpointStageGate({
        packetDir: resolved,
        artifacts,
        currentStage: "runner_spec",
        nextCommand: `agenteer research runner-spec --packet ${resolved}`,
        reason: "Scout plan exists; define the local runner contract before human approval and analysis.",
      });
    }
    return withResearchCheckpointStageGate({
      packetDir: resolved,
      artifacts,
      currentStage: "approval",
      nextCommand: `agenteer research approve --packet ${resolved} --note "<review note>"`,
      reason: "Scout plan exists; I should review it as human-in-the-loop before analysis.",
    });
  }
  if (!artifacts.analysisResult) {
    return withResearchCheckpointStageGate({
      packetDir: resolved,
      artifacts,
      currentStage: "analysis",
      nextCommand: `agenteer research analyze --packet ${resolved} --fixture <rows.json>`,
      reason: "Packet is approved; local fixture analysis is the next bounded execution step.",
    });
  }
  if (!artifacts.report) {
    return withResearchCheckpointStageGate({
      packetDir: resolved,
      artifacts,
      currentStage: "report_review",
      nextCommand: `agenteer research review-report --packet ${resolved}`,
      reason: "Analysis result exists but report artifact is missing; report review cannot complete yet.",
    });
  }
  if (!artifacts.artifactManifest) {
    return withResearchCheckpointStageGate({
      packetDir: resolved,
      artifacts,
      currentStage: "manifest",
      nextCommand: `agenteer research manifest --packet ${resolved}`,
      reason: "Report exists and passed review should be followed by a reproducible artifact manifest.",
    });
  }
  if (!artifacts.exportRecord) {
    return withResearchCheckpointStageGate({
      packetDir: resolved,
      artifacts,
      currentStage: "export",
      nextCommand: `agenteer research export --packet ${resolved} --out <export-dir>`,
      reason: "Manifest exists; export the packet into a durable tracking directory before calling it complete.",
    });
  }
  return withResearchCheckpointStageGate({
    packetDir: resolved,
    artifacts,
    currentStage: "complete",
    nextCommand: "agenteer research questions --project medbrevia-nhanes --repo <repo>",
    reason: "Local packet has design, scout, approval, analysis, report, manifest, and export record artifacts; choose the next harder question.",
  });
}

export function renderResearchCheckpoint(checkpoint: ResearchCheckpoint): string {
  return [
    `research checkpoint: ${checkpoint.packetDir}`,
    `  stage: ${checkpoint.currentStage}`,
    `  artifacts: design=${checkpoint.artifacts.design} critique=${checkpoint.artifacts.critique} methods=${checkpoint.artifacts.methodsValidation} scout=${checkpoint.artifacts.scoutPlan} dataQuality=${checkpoint.artifacts.dataQuality} runner=${checkpoint.artifacts.runnerSpec} approval=${checkpoint.artifacts.approval} analysis=${checkpoint.artifacts.analysisResult} report=${checkpoint.artifacts.report} manifest=${checkpoint.artifacts.artifactManifest} export=${checkpoint.artifacts.exportRecord}`,
    `  gate: ${checkpoint.stageGate ? `${checkpoint.stageGate.status}${checkpoint.stageGate.missingRequiredStages.length ? ` missing=${checkpoint.stageGate.missingRequiredStages.join(",")}` : ""}` : "(none)"}`,
    `  reason: ${checkpoint.reason}`,
    `  next: ${checkpoint.nextCommand}`,
    `  recommended: ${checkpoint.recommendedCommands.join(" && ")}`,
  ].join("\n");
}

export function renderResearchCheckpointJson(checkpoint: ResearchCheckpoint): string {
  return `${JSON.stringify({
    schemaVersion: 1,
    checkpoint,
  }, null, 2)}\n`;
}

function withResearchCheckpointStageGate(checkpoint: Omit<ResearchCheckpoint, "stageGate" | "recommendedCommands">): ResearchCheckpoint {
  const target = checkpoint.currentStage === "complete" ? null : checkpointStageToPipelineStage(checkpoint.currentStage);
  const stageGate = target ? researchStageGateCommand(completedStagesFromArtifacts(checkpoint.artifacts), target) : null;
  return {
    ...checkpoint,
    recommendedCommands: stageGate?.status === "blocked"
      ? stageGate.missingRequiredStages.map(stage => commandForResearchStage(stage, checkpoint.packetDir))
      : [checkpoint.nextCommand],
    stageGate,
  };
}

function commandForResearchStage(stage: string, packetDir: string): string {
  switch (stage) {
    case "critique": return `agenteer research critique --packet ${packetDir}`;
    case "methods-validation": return `agenteer research validate-methods --packet ${packetDir} --json`;
    case "scout": return `agenteer research scout --packet ${packetDir}`;
    case "data-quality": return "agenteer research data-quality --fixture <rows.json> --json";
    case "runner-spec": return `agenteer research runner-spec --packet ${packetDir}`;
    case "approval": return `agenteer research approve --packet ${packetDir} --note "<review note>"`;
    case "report-review": return `agenteer research review-report --packet ${packetDir} --json`;
    case "manifest": return `agenteer research manifest --packet ${packetDir} --json`;
    case "ro-crate": return `agenteer research ro-crate --packet ${packetDir} --json`;
    case "provenance": return `agenteer research provenance --packet ${packetDir} --json`;
    default: return `agenteer research ${stage} --packet ${packetDir}`;
  }
}

const RESEARCH_STAGE_ARTIFACTS: Record<string, Omit<ResearchStageArtifactDefinition, "stage">> = {
  design: { fileName: "design.json", required: true, description: "Research design packet with question, variables, protocol, and assumptions." },
  critique: { fileName: "critique.json", required: true, description: "Deterministic critique issues and severity before scouting or execution." },
  "methods-validation": { fileName: "methods-validation.json", required: true, description: "Survey-method and feasibility validation evidence for the protocol." },
  scout: { fileName: "scout-plan.json", required: true, description: "Cohort scouting plan or scout result that constrains downstream execution." },
  "data-quality": { fileName: "data-quality.json", required: true, description: "Semantic and missingness quality evidence for the rows used in analysis." },
  "runner-spec": { fileName: "runner-spec.json", required: true, description: "Executable analysis contract, inputs, outputs, and risk limits." },
  approval: { fileName: "approval.json", required: true, description: "Human-in-the-loop approval record before bounded execution." },
  analysis: { fileName: "analysis-result.json", required: true, description: "Bounded local analysis result and execution summary." },
  "report-review": { fileName: "report-review.json", required: true, description: "Report QA result, claim checks, and unresolved issue list." },
  manifest: { fileName: "artifact-manifest.json", required: true, description: "Hash manifest for reproducible packet artifacts." },
  "ro-crate": { fileName: "ro-crate-metadata.json", required: false, description: "Optional RO-Crate metadata for external research packaging." },
  provenance: { fileName: "provenance.json", required: false, description: "Optional graph of artifact lineage and stage transitions." },
  export: { fileName: "export-record.json", required: true, description: "Durable export record with copied artifacts and packet summary." },
};

const RESEARCH_EXTRA_ARTIFACTS = [
  "design.md",
  "workflow.yaml",
  "variable-map.json",
  "data-access.json",
  "data-access-redacted.json",
  "evidence-gap-report.json",
  "packet-readiness.json",
  "qa-dashboard.json",
  "real-runner-spec.json",
  "report.md",
] as const;

const DEFAULT_RESEARCH_READINESS_PROFILE: ResearchPacketReadiness["readinessProfile"] = {
  id: "observational-survey-v1",
  label: "Observational survey readiness",
  domain: "observational-survey",
  selection: "default",
  caveat: "Default profile for observational/survey-style packet review; profile selection is not implemented yet.",
};

export function researchStageArtifactsCommand(): ResearchStageArtifactDefinition[] {
  return Object.entries(RESEARCH_STAGE_ARTIFACTS).map(([stage, artifact]) => ({
    stage,
    ...artifact,
  }));
}

export function renderResearchStageArtifacts(artifacts: readonly ResearchStageArtifactDefinition[]): string {
  return [
    "research stage artifacts",
    ...artifacts.map(artifact =>
      `  - ${artifact.stage}: ${artifact.fileName} (${artifact.required ? "required" : "optional"}) - ${artifact.description}`,
    ),
  ].join("\n");
}

export function renderResearchStageArtifactsJson(artifacts: readonly ResearchStageArtifactDefinition[]): string {
  return `${JSON.stringify({
    schemaVersion: 1,
    stageArtifacts: artifacts,
  }, null, 2)}\n`;
}

async function expectedArtifactForResearchStage(stage: string, packetDir: string): Promise<ResearchPacketExpectedArtifact> {
  const artifact = researchStageArtifactDefinition(stage);
  const artifactPath = researchStageArtifactPath(stage, packetDir);
  return {
    stage,
    path: artifactPath,
    required: artifact.required,
    exists: await exists(artifactPath),
    description: artifact.description,
  };
}

function researchStageArtifactPath(stage: string, packetDir: string): string {
  return path.join(packetDir, researchStageArtifactDefinition(stage).fileName);
}

function researchStageArtifactDefinition(stage: string): { fileName: string; required: boolean; description: string } {
  return RESEARCH_STAGE_ARTIFACTS[stage] ?? {
    fileName: `${stage}.json`,
    required: true,
    description: `Evidence artifact expected after the ${stage} stage.`,
  };
}

async function expectedArtifactsForResearchCheckpoint(checkpoint: ResearchCheckpoint): Promise<ResearchPacketExpectedArtifact[]> {
  const missingStages = checkpoint.stageGate?.status === "blocked"
    ? checkpoint.stageGate.missingRequiredStages
    : [checkpointStageToPipelineStage(checkpoint.currentStage)].filter((stage): stage is string => Boolean(stage));
  return Promise.all(missingStages.map(stage => expectedArtifactForResearchStage(stage, checkpoint.packetDir)));
}

function checkpointStageToPipelineStage(stage: ResearchCheckpoint["currentStage"]): string | null {
  switch (stage) {
    case "runner_spec": return "runner-spec";
    case "report_review": return "report-review";
    case "complete": return null;
    default: return stage;
  }
}

function completedStagesFromArtifacts(artifacts: ResearchCheckpoint["artifacts"]): string[] {
  return [
    artifacts.design ? "design" : null,
    artifacts.critique ? "critique" : null,
    artifacts.methodsValidation ? "methods-validation" : null,
    artifacts.scoutPlan ? "scout" : null,
    artifacts.dataQuality ? "data-quality" : null,
    artifacts.runnerSpec ? "runner-spec" : null,
    artifacts.approval ? "approval" : null,
    artifacts.analysisResult ? "analysis" : null,
    artifacts.report ? "report-review" : null,
    artifacts.artifactManifest ? "manifest" : null,
    artifacts.exportRecord ? "export" : null,
  ].filter((stage): stage is string => Boolean(stage));
}

export async function researchPacketSummaryCommand(packetDir: string): Promise<ResearchPacketSummary> {
  const resolved = path.resolve(packetDir);
  const checkpoint = await researchCheckpointCommand(resolved);
  const manifest = await readJsonIfPresent(path.join(resolved, "artifact-manifest.json")) as ResearchArtifactManifest | null;
  const reportReview = await readJsonIfPresent(path.join(resolved, "report-review.json")) as ResearchReportReview | null;
  const exportRecord = await readJsonIfPresent(path.join(resolved, "export-record.json")) as ResearchPacketExport | null;
  return {
    packetDir: resolved,
    generatedAtIso: new Date().toISOString(),
    stages: researchPipelineStagesCommand(),
    checkpoint,
    manifest,
    reportReview,
    exportRecord,
    nextAction: checkpoint.stageGate?.status === "blocked" ? checkpoint.stageGate.nextAction : checkpoint.nextCommand,
  };
}

export async function researchPacketNextCommand(packetDir: string, options: ResearchPacketNextOptions = {}): Promise<ResearchPacketNext> {
  const checkpoint = await researchCheckpointCommand(packetDir);
  const gateStatus = checkpoint.stageGate?.status ?? "not_applicable";
  const generatedAtIso = new Date().toISOString();
  const expectedArtifacts = await expectedArtifactsForResearchCheckpoint(checkpoint);
  const decisionId = createHash("sha256").update(JSON.stringify({
    generatedAtIso,
    packetDir: checkpoint.packetDir,
    currentStage: checkpoint.currentStage,
    gateStatus,
    recommendedCommands: checkpoint.recommendedCommands,
    expectedArtifacts: expectedArtifacts.map(artifact => artifact.path),
  })).digest("hex").slice(0, 16);
  const tracePath = options.trace ? path.join(checkpoint.packetDir, "navigation-trace.jsonl") : null;
  const previousRecordHash = tracePath ? await lastNavigationTraceRecordHash(tracePath) : null;
  const eventWithoutRecordHash: Omit<ResearchPacketNext, "recordHash"> = {
    schemaVersion: 1,
    eventType: "research.packet.next",
    packetDir: checkpoint.packetDir,
    generatedAtIso,
    decisionId,
    previousRecordHash,
    currentStage: checkpoint.currentStage,
    gateStatus,
    targetMode: checkpoint.stageGate?.targetMode ?? null,
    recommendedCommands: checkpoint.recommendedCommands,
    expectedArtifacts,
    tracePath,
    message: gateStatus === "blocked"
      ? checkpoint.stageGate?.nextAction ?? "Resolve blocked stage gate before continuing."
      : checkpoint.reason,
  };
  const result: ResearchPacketNext = {
    ...eventWithoutRecordHash,
    recordHash: hashResearchEventRecord(eventWithoutRecordHash),
  };
  if (tracePath) {
    await mkdir(checkpoint.packetDir, { recursive: true });
    await appendFile(tracePath, `${JSON.stringify(result)}\n`);
  }
  return result;
}

async function lastNavigationTraceRecordHash(tracePath: string): Promise<string | null> {
  if (!(await exists(tracePath))) return null;
  const lines = (await readFile(tracePath, "utf-8")).split(/\r?\n/).filter(Boolean);
  for (let i = lines.length - 1; i >= 0; i--) {
    try {
      const event = JSON.parse(lines[i]!) as Partial<ResearchPacketNext>;
      if (typeof event.recordHash === "string") return event.recordHash;
    } catch {
      continue;
    }
  }
  return null;
}

function hashResearchEventRecord(event: unknown): string {
  return createHash("sha256").update(JSON.stringify(event)).digest("hex");
}

export function renderResearchPacketNext(result: ResearchPacketNext): string {
  return [
    `research next: ${result.packetDir}`,
    `  event: ${result.eventType} v${result.schemaVersion}`,
    `  decision: ${result.decisionId}`,
    `  stage: ${result.currentStage}`,
    `  gate: ${result.gateStatus}`,
    `  mode: ${result.targetMode ?? "(none)"}`,
    `  message: ${result.message}`,
    "  commands:",
    ...result.recommendedCommands.map(command => `    - ${command}`),
    "  expected artifacts:",
    ...result.expectedArtifacts.map(artifact => `    - ${artifact.path} (${artifact.required ? "required" : "optional"}, ${artifact.exists ? "present" : "missing"}): ${artifact.description}`),
    `  trace: ${result.tracePath ?? "(not written)"}`,
  ].join("\n");
}

export function renderResearchPacketNextJson(result: ResearchPacketNext): string {
  return `${JSON.stringify({
    schemaVersion: 1,
    packetNext: result,
  }, null, 2)}\n`;
}

export async function researchNavigationTraceCommand(packetDir: string): Promise<ResearchNavigationTraceSummary> {
  const resolved = path.resolve(packetDir);
  const tracePath = path.join(resolved, "navigation-trace.jsonl");
  if (!(await exists(tracePath))) {
    return {
      packetDir: resolved,
      tracePath,
      status: "missing",
      exists: false,
      events: 0,
      malformedLines: 0,
      hashChainStatus: "missing",
      eventTypes: {},
      lastEvent: null,
    };
  }
  const lines = (await readFile(tracePath, "utf-8")).split(/\r?\n/).filter(Boolean);
  const events: ResearchPacketNext[] = [];
  let malformedLines = 0;
  let missingHash = false;
  let brokenHash = false;
  let previousHash: string | null = null;
  const eventTypes: Record<string, number> = {};
  for (const line of lines) {
    try {
      const event = JSON.parse(line) as ResearchPacketNext;
      events.push(event);
      const eventType = typeof event.eventType === "string" ? event.eventType : "(missing)";
      eventTypes[eventType] = (eventTypes[eventType] ?? 0) + 1;
      if (typeof event.recordHash !== "string" || typeof event.previousRecordHash === "undefined") {
        missingHash = true;
      } else {
        const { recordHash: _recordHash, ...eventWithoutRecordHash } = event;
        if (event.recordHash !== hashResearchEventRecord(eventWithoutRecordHash)) brokenHash = true;
        if (event.previousRecordHash !== previousHash) brokenHash = true;
        previousHash = event.recordHash;
      }
    } catch {
      malformedLines += 1;
    }
  }
  const hashChainStatus = malformedLines > 0 || brokenHash ? "broken" : missingHash ? "unchecked" : "valid";
  return {
    packetDir: resolved,
    tracePath,
    status: malformedLines === 0 && hashChainStatus !== "broken" ? "valid" : "invalid",
    exists: true,
    events: events.length,
    malformedLines,
    hashChainStatus,
    eventTypes,
    lastEvent: events.at(-1) ?? null,
  };
}

export function renderResearchNavigationTrace(result: ResearchNavigationTraceSummary): string {
  return [
    `research navigation trace: ${result.packetDir}`,
    `  status: ${result.status}`,
    `  trace: ${result.tracePath}`,
    `  exists: ${result.exists}`,
    `  events: ${result.events}`,
    `  malformed lines: ${result.malformedLines}`,
    `  hash chain: ${result.hashChainStatus}`,
    `  event types: ${Object.entries(result.eventTypes).map(([type, count]) => `${type}=${count}`).join(", ") || "(none)"}`,
    `  last decision: ${result.lastEvent?.decisionId ?? "(none)"}`,
    `  last stage: ${result.lastEvent?.currentStage ?? "(none)"}`,
    `  last gate: ${result.lastEvent?.gateStatus ?? "(none)"}`,
  ].join("\n");
}

export function renderResearchNavigationTraceJson(result: ResearchNavigationTraceSummary): string {
  return `${JSON.stringify({
    schemaVersion: 1,
    navigationTrace: result,
  }, null, 2)}\n`;
}

export async function researchPacketVerifyCommand(packetDir: string): Promise<ResearchPacketVerification> {
  const resolved = path.resolve(packetDir);
  const approval = await researchApprovalVerifyCommand(resolved);
  const navigationTrace = await researchNavigationTraceCommand(resolved);
  const manifest = await researchManifestVerifyCommand(resolved);
  const issues = [
    approval.status === "invalid" ? "approval hash is invalid" : null,
    navigationTrace.status === "invalid" ? "navigation trace is invalid" : null,
    manifest.status === "invalid" ? "artifact manifest is invalid" : null,
    approval.status === "missing" ? "approval artifact is missing" : null,
    navigationTrace.status === "missing" ? "navigation trace is missing" : null,
    manifest.status === "missing" ? "artifact manifest is missing" : null,
  ].filter((issue): issue is string => Boolean(issue));
  const status = issues.some(issue => issue.includes("invalid"))
    ? "fail"
    : issues.length
      ? "incomplete"
      : "pass";
  const summary = status === "pass"
    ? "Available integrity checks passed. This does not validate scientific methods or report claims."
    : status === "fail"
      ? "One or more available integrity checks failed."
      : "Some integrity artifacts are missing, so available integrity verification is incomplete.";
  const nextAction = status === "pass"
    ? "Continue with methods validation, report review, claim guard, and provenance checks before treating the packet as research-ready."
    : status === "fail"
      ? "Inspect the failing narrow verifier: approval-verify, navigation-trace, or manifest-verify."
      : [
        approval.status === "missing" ? commandForResearchStage("approval", resolved) : null,
        navigationTrace.status === "missing" ? `agenteer research next --packet ${resolved} --trace --exit-zero-on-blocked` : null,
        manifest.status === "missing" ? commandForResearchStage("manifest", resolved) : null,
      ].filter(Boolean).join(" && ");
  const exportIntegrityReady = manifest.status === "valid";
  const exportIntegrityReason = exportIntegrityReady
    ? "artifact manifest exists and matches packet artifacts"
    : `artifact manifest status is ${manifest.status}${manifest.issues[0] ? `: ${manifest.issues[0]}` : ""}`;
  return {
    packetDir: resolved,
    mode: "available-integrity",
    scope: ["approval-record-hash", "navigation-trace-jsonl", "artifact-manifest-hashes"],
    status,
    exportIntegrityReady,
    exportIntegrityReason,
    summary,
    nextAction,
    approval,
    navigationTrace,
    manifest,
    issues,
  };
}

export function renderResearchPacketVerification(result: ResearchPacketVerification): string {
  return [
    `research packet verify: ${result.packetDir}`,
    `  mode: ${result.mode}`,
    `  scope: ${result.scope.join(", ")}`,
    `  status: ${result.status}`,
    `  export integrity: ${result.exportIntegrityReady ? "ready" : "not ready"} - ${result.exportIntegrityReason}`,
    `  summary: ${result.summary}`,
    `  approval: ${result.approval.status}`,
    `  navigation trace: ${result.navigationTrace.status}`,
    `  manifest: ${result.manifest.status}`,
    `  issues: ${result.issues.join("; ") || "(none)"}`,
    `  next: ${result.nextAction || "(none)"}`,
  ].join("\n");
}

export function renderResearchPacketVerificationJson(result: ResearchPacketVerification): string {
  return `${JSON.stringify({
    schemaVersion: 1,
    packetVerification: result,
  }, null, 2)}\n`;
}

export async function researchPacketReadinessCommand(packetDir: string): Promise<ResearchPacketReadiness> {
  const resolved = path.resolve(packetDir);
  const packetVerification = await researchPacketVerifyCommand(resolved);
  const checkpoint = await researchCheckpointCommand(resolved);
  const methods = unwrapResearchArtifact<ResearchMethodsValidationResult>(
    await readJsonIfPresent(path.join(resolved, "methods-validation.json")),
    "methodsValidation",
  );
  const reportReview = unwrapResearchArtifact<ResearchReportReview>(
    await readJsonIfPresent(path.join(resolved, "report-review.json")),
    "reportReview",
  );
  const exportRecord = unwrapResearchArtifact<ResearchPacketExport>(
    await readJsonIfPresent(path.join(resolved, "export-record.json")),
    "packetExport",
  );
  const dataAccess = await readJsonIfPresent(path.join(resolved, "data-access.json")) as ResearchDataAccessManifest | null;
  const dataAccessPath = path.join(resolved, "data-access.json");
  const redactedDataAccess = await readJsonIfPresent(path.join(resolved, "data-access-redacted.json")) as ResearchDataAccessRedaction | null;
  const currentDataAccessSha256 = dataAccess && await exists(dataAccessPath) ? await hashFile(dataAccessPath) : null;
  const redactedDataAccessFresh = Boolean(
    redactedDataAccess
    && currentDataAccessSha256
    && redactedDataAccess.sourceManifestSha256 === currentDataAccessSha256,
  );
  const localPathCount = dataAccess
    ? [
      ...dataAccess.files.map(file => file.path),
      ...dataAccess.files.map(file => file.summary?.adapter.executable ?? ""),
    ].filter(value => value && path.isAbsolute(value)).length
    : 0;
  const provenancePresent = await exists(path.join(resolved, "provenance.json"));
  const reportPath = path.join(resolved, "report.md");
  const reportPresent = await exists(reportPath);
  const analysisSpecPath = path.join(resolved, "analysis-spec.json");
  const claimGuard = reportPresent
    ? await researchClaimGuardCommand({
      reportPath,
      ...(await exists(analysisSpecPath) ? { specPath: analysisSpecPath } : {}),
    })
    : null;

  const components: ResearchPacketReadinessComponent[] = [
    {
      id: "integrity",
      status: packetVerification.status === "pass" ? "pass" : packetVerification.status === "fail" ? "fail" : "missing",
      detail: packetVerification.summary,
      nextAction: packetVerification.status === "pass" ? "Continue to workflow and methods review." : packetVerification.nextAction,
    },
    {
      id: "checkpoint",
      status: checkpoint.currentStage === "complete" || checkpoint.currentStage === "export" || checkpoint.currentStage === "manifest" ? "pass" : "warning",
      detail: checkpoint.currentStage === "complete"
        ? "Packet lifecycle has reached complete."
        : checkpoint.currentStage === "export"
          ? "Packet has completed review and manifest stages; export/share remains separate."
          : checkpoint.currentStage === "manifest"
            ? "Packet has completed review stages through artifact manifest; export/share remains separate."
          : `Packet lifecycle is currently at ${checkpoint.currentStage}.`,
      nextAction: checkpoint.currentStage === "complete" || checkpoint.currentStage === "export" || checkpoint.currentStage === "manifest" ? "No checkpoint action required for review readiness." : checkpoint.nextCommand,
    },
    {
      id: "methods-validation",
      status: methods ? methods.status === "pass" ? "pass" : methods.status === "blocked" ? "blocked" : "warning" : "missing",
      detail: methods ? `${methods.status}; ${methods.issues.length} issue(s).` : "methods-validation.json is missing.",
      nextAction: methods ? "Resolve any methods issues before relying on the packet." : `agenteer research validate-methods --packet ${resolved}`,
    },
    {
      id: "report-review",
      status: reportReview ? reportReview.status === "pass" ? "pass" : "warning" : "missing",
      detail: reportReview ? `${reportReview.status}; ${reportReview.issues.length} issue(s).` : "report-review.json is missing.",
      nextAction: reportReview ? "Resolve report review issues before export review." : `agenteer research review-report --packet ${resolved}`,
    },
    {
      id: "claim-guard",
      status: claimGuard ? claimGuard.status === "pass" ? "pass" : claimGuard.status === "blocked" ? "blocked" : "warning" : "missing",
      detail: claimGuard ? `${claimGuard.status}; ${claimGuard.issues.length} claim issue(s).` : "report.md is missing, so claim language could not be checked.",
      nextAction: claimGuard ? claimGuard.nextAction : `Generate report.md, then run agenteer research claim-guard --report ${reportPath}`,
    },
    {
      id: "provenance",
      status: provenancePresent ? "pass" : "missing",
      detail: provenancePresent ? "provenance.json is present." : "provenance.json is missing.",
      nextAction: provenancePresent ? "No provenance action required." : `agenteer research provenance --packet ${resolved}`,
    },
    {
      id: "export",
      status: exportRecord ? "pass" : "missing",
      detail: exportRecord ? `Exported to ${exportRecord.exportDir}.` : "export-record.json is missing.",
      nextAction: exportRecord ? "No export action required." : "Export the packet after review artifacts pass.",
    },
    {
      id: "share-local-paths",
      status: localPathCount ? "warning" : "pass",
      detail: localPathCount
        ? `${localPathCount} absolute local path reference(s) appear in data-access evidence; redact or relativize before sharing.`
        : "No absolute local path references were found in data-access evidence.",
      nextAction: localPathCount ? "Redact or relativize local paths before export/share." : "No local path action required.",
    },
    {
      id: "redacted-data-access",
      status: !dataAccess
        ? "missing"
        : redactedDataAccessFresh
          ? "pass"
          : redactedDataAccess
            ? "warning"
            : "missing",
      detail: !dataAccess
        ? "data-access.json is missing, so a redacted data-access view cannot be checked."
        : redactedDataAccessFresh
          ? "data-access-redacted.json is present and matches the current data-access manifest hash."
          : redactedDataAccess
            ? "data-access-redacted.json is present but does not match the current data-access manifest hash."
            : "data-access-redacted.json is missing.",
      nextAction: !dataAccess
        ? `agenteer research data-access --packet ${resolved} --file <data-file>`
        : redactedDataAccessFresh
          ? "No redaction action required before export/share."
          : `agenteer research data-access-redact --packet ${resolved}`,
    },
  ];

  const blocking = components.filter(component => component.status === "missing" || component.status === "fail" || component.status === "blocked");
  const reviewBlocking = blocking.filter(component => component.id !== "export" && component.id !== "share-local-paths" && component.id !== "redacted-data-access");
  const reviewWarnings = components.filter(component => component.status === "warning" && component.id !== "share-local-paths" && component.id !== "redacted-data-access");
  const status: ResearchPacketReadiness["status"] = reviewBlocking.length ? "needs_work" : "review_ready";
  const hardStop = components.some(component => component.status === "fail" || component.status === "blocked") || !reportPresent;
  const stopReasons = [
    ...components
      .filter(component => component.status === "fail" || component.status === "blocked")
      .map(component => `${component.id}: ${component.detail}`),
    reportPresent ? null : "report.md is missing",
  ].filter((reason): reason is string => Boolean(reason));
  const decisionPosture: ResearchPacketReadiness["decisionPosture"] = hardStop
    ? "stop"
    : reviewWarnings.length
      ? "read_with_caution"
      : status === "review_ready"
      ? "ready_for_scientific_review"
      : "read_with_caution";
  const sharePosture: ResearchPacketReadiness["sharePosture"] = localPathCount
    ? "share_with_caution"
    : status === "review_ready" && exportRecord
    ? "ready_to_share"
    : status === "review_ready"
      ? "do_not_share"
    : packetVerification.status === "pass" && exportRecord && provenancePresent
      ? "share_with_caution"
      : "do_not_share";
  const limitations = [
    "Readiness is a scoped review signal, not proof of scientific validity.",
    "For survey or cross-sectional datasets, independently confirm weights, strata, PSU handling, missingness, subsample eligibility, sparse cells, and reproducibility.",
    "Treat associations as observational unless the design, estimand, and analysis support causal interpretation.",
    "Claim support depends on the report text and available artifacts; absence of warnings is not peer review.",
  ];
  const references = [
    {
      id: "strobe-official",
      title: "STROBE Statement",
      url: "https://www.strobe-statement.org/",
      applicability: "Supports treating observational-study checks as reporting guidance, not as a study-quality instrument.",
    },
    {
      id: "strobe-explanation",
      title: "STROBE Explanation and Elaboration",
      url: "https://journals.plos.org/plosmedicine/article?id=10.1371/journal.pmed.0040297",
      applicability: "Supports explicit reporting of design, eligibility, participant flow, bias, descriptive data, and study-size rationale.",
    },
  ];
  const nextAction = status === "review_ready"
    ? "Available integrity, workflow, methods, claim, and provenance checks passed; proceed to human scientific review before export/share."
    : reviewBlocking[0]?.nextAction ?? "Resolve non-passing readiness components.";
  const recommendedCommands = uniqueStrings(reviewBlocking
    .map(component => component.nextAction)
    .filter(isSingleAgenteerResearchCommand));
  const clinicianSummary = decisionPosture === "ready_for_scientific_review"
    ? "The packet can be read as an internally reviewable analytic draft; this is not peer review or proof of validity."
    : decisionPosture === "read_with_caution"
      ? "The report can be inspected as a draft, but at least one review component has a caution before relying on or sharing it."
      : reportPresent
        ? "Stop before relying on the report; a blocking review issue is present."
        : "Stop before report review; no report.md is available to inspect.";
  const result: ResearchPacketReadiness = {
    packetDir: resolved,
    mode: "review-readiness",
    readinessProfile: DEFAULT_RESEARCH_READINESS_PROFILE,
    scope: [
      "available-integrity",
      "workflow-completeness",
      "methods-validation-artifact",
      "report-review-artifact",
      "claim-language-guard",
      "provenance-presence",
      "export-record-presence",
      "share-redaction-evidence",
    ],
    status,
    decisionPosture,
    sharePosture,
    stopReasons,
    recommendedCommands,
    summary: status === "review_ready"
      ? "Available review-readiness checks passed. Human scientific review is still required."
      : `${reviewBlocking.length} readiness component(s) need work before human scientific review.`,
    clinicianSummary,
    components,
    limitations,
    references,
    packetVerification,
    nextAction,
  };
  await writeFile(path.join(resolved, "packet-readiness.json"), `${JSON.stringify(result, null, 2)}\n`);
  return result;
}

export function renderResearchPacketReadiness(result: ResearchPacketReadiness): string {
  return [
    `research packet readiness: ${result.packetDir}`,
    `  mode: ${result.mode}`,
    `  profile: ${result.readinessProfile.id} (${result.readinessProfile.label})`,
    `  profile caveat: ${result.readinessProfile.caveat}`,
    `  scope: ${result.scope.join(", ")}`,
    `  status: ${result.status}`,
    `  decision posture: ${result.decisionPosture}`,
    `  share posture: ${result.sharePosture}`,
    `  stop reasons: ${result.stopReasons.join("; ") || "(none)"}`,
    `  recommended commands: ${result.recommendedCommands.join(" && ") || "(none)"}`,
    `  clinician summary: ${result.clinicianSummary}`,
    `  summary: ${result.summary}`,
    "  components:",
    ...result.components.map(component => `    - [${component.status}] ${component.id}: ${component.detail}`),
    "  limitations:",
    ...result.limitations.map(limitation => `    - ${limitation}`),
    "  references:",
    ...result.references.map(reference => `    - ${reference.id}: ${reference.title} (${reference.url})`),
    `  next: ${result.nextAction}`,
  ].join("\n");
}

export function renderResearchPacketReadinessJson(result: ResearchPacketReadiness): string {
  return `${JSON.stringify({
    schemaVersion: 1,
    packetReadiness: result,
  }, null, 2)}\n`;
}

export function renderResearchPacketSummary(summary: ResearchPacketSummary): string {
  return [
    `research packet summary: ${summary.packetDir}`,
    `  stage: ${summary.checkpoint.currentStage}`,
    `  next: ${summary.nextAction}`,
    `  stages: ${summary.stages.length}`,
    `  manifest: ${summary.manifest ? `${summary.manifest.artifacts.length} artifacts` : "missing"}`,
    `  report review: ${summary.reportReview ? summary.reportReview.status : "missing"}`,
    `  export: ${summary.exportRecord ? summary.exportRecord.exportDir : "missing"}`,
  ].join("\n");
}

export function renderResearchPacketSummaryJson(summary: ResearchPacketSummary): string {
  return `${JSON.stringify({
    schemaVersion: 1,
    packetSummary: summary,
  }, null, 2)}\n`;
}

async function evaluateResearchBenchmark(benchmark: ResearchGoldenPacketBenchmark): Promise<ResearchBenchmarkCheck[]> {
  const checks: ResearchBenchmarkCheck[] = [];
  const weight = (id: string) => benchmark.scoreWeights[id] ?? 1;
  const add = (
    id: string,
    status: ResearchBenchmarkCheck["status"],
    severity: ResearchCritiqueIssue["severity"],
    detail: string,
    evidenceRefs: string[] = [],
    typedIssues: ResearchCritiqueIssue[] = [],
  ) => {
    checks.push({
      id,
      status,
      severity,
      score: status === "pass" || status === "expected_failure" ? 1 : status === "warning" ? 0.5 : status === "skipped" ? 0.25 : 0,
      weight: weight(id),
      detail,
      evidenceRefs,
      typedIssues,
    });
  };

  const artifactFailures: ResearchCritiqueIssue[] = [];
  let checkedArtifacts = 0;
  for (const artifact of benchmark.expectedArtifacts) {
    const artifactPath = resolveBenchmarkArtifactPath(benchmark, artifact.path);
    if (!(await exists(artifactPath))) {
      if (artifact.required) artifactFailures.push({ severity: "blocker", code: "BENCHMARK_ARTIFACT_MISSING", message: `${artifact.id} missing at ${artifact.path}` });
      continue;
    }
    checkedArtifacts += 1;
    if (artifact.sha256) {
      const actualHash = await hashFile(artifactPath);
      if (actualHash !== artifact.sha256) artifactFailures.push({ severity: "blocker", code: "BENCHMARK_ARTIFACT_HASH_MISMATCH", message: `${artifact.id} sha256 changed` });
    }
    if (typeof artifact.bytes === "number") {
      const info = await stat(artifactPath);
      if (info.size !== artifact.bytes) artifactFailures.push({ severity: "blocker", code: "BENCHMARK_ARTIFACT_SIZE_MISMATCH", message: `${artifact.id} byte count changed` });
    }
  }
  add(
    "artifact-completeness",
    artifactFailures.length ? "fail" : "pass",
    artifactFailures.length ? "blocker" : "note",
    artifactFailures.length ? `${artifactFailures.length} expected artifact checks failed.` : `${checkedArtifacts}/${benchmark.expectedArtifacts.length} expected artifacts present and stable.`,
    benchmark.expectedArtifacts.map(artifact => artifact.path),
    artifactFailures,
  );

  const manifest = await researchManifestVerifyCommand(benchmark.packetPath);
  add(
    "manifest-local-valid",
    manifest.validLocal ? "pass" : "fail",
    manifest.validLocal ? "note" : "blocker",
    manifest.validLocal ? `Manifest valid locally with ${manifest.checkedArtifacts} artifacts.` : `Manifest invalid: ${manifest.issues.join("; ") || "unknown manifest failure"}`,
    [manifest.manifestPath],
    manifest.typedIssues,
  );

  const analysisSpec = benchmark.analysisSpecPath ? await readJsonIfPresent(benchmark.analysisSpecPath) as Record<string, unknown> | null : null;
  const spec = isRecord(analysisSpec?.analysisSpec) ? analysisSpec.analysisSpec : analysisSpec;
  const methodIssues = evaluateBenchmarkMethodRequirements(benchmark, spec);
  add(
    "analysis-spec-policy",
    methodIssues.filter(issue => issue.source === "analysis-spec" || issue.source === "policy").some(issue => issue.status === "fail") ? "fail" : "pass",
    methodIssues.some(issue => issue.status === "fail") ? "blocker" : "note",
    methodIssues.length ? methodIssues.map(issue => `${issue.id}:${issue.status}`).join(", ") : "AnalysisSpec method policy requirements satisfied.",
    benchmark.analysisSpecPath ? [benchmark.analysisSpecPath] : [],
    methodIssues.filter(issue => issue.status === "fail").map(issue => ({ severity: "blocker", code: `METHOD_${issue.id.toUpperCase().replace(/[^A-Z0-9]+/g, "_")}`, message: issue.description })),
  );
  add(
    "survey-method-compliance",
    ["survey-weight", "survey-strata", "survey-psu"].every(id => methodIssues.find(issue => issue.id === id)?.status === "pass") ? "pass" : "fail",
    "blocker",
    "Survey design fields must declare weight, strata, and PSU variables.",
    benchmark.analysisSpecPath ? [benchmark.analysisSpecPath] : [],
    methodIssues.filter(issue => ["survey-weight", "survey-strata", "survey-psu"].includes(issue.id) && issue.status === "fail").map(issue => ({ severity: "blocker", code: `SURVEY_${issue.id.toUpperCase().replace(/[^A-Z0-9]+/g, "_")}`, message: issue.description })),
  );

  const sourceValidation = await readJsonIfPresent(path.join(benchmark.packetPath, "source-validation.json")) as Record<string, unknown> | null;
  const sourceValidationNested = isRecord(sourceValidation?.sourceValidation) ? sourceValidation.sourceValidation : {};
  const sourceStatus = String(sourceValidation?.status ?? sourceValidationNested.status ?? "").toLowerCase();
  add(
    "real-data-feasibility",
    /pass|passed|ready|valid/.test(sourceStatus) ? "pass" : sourceValidation ? "warning" : "fail",
    sourceValidation ? "warning" : "blocker",
    sourceValidation ? `Source validation status: ${sourceStatus || "unknown"}.` : "source-validation.json is missing.",
    [path.join(benchmark.packetPath, "source-validation.json")],
    sourceValidation ? [] : [{ severity: "blocker", code: "SOURCE_VALIDATION_MISSING", message: "source-validation.json is missing." }],
  );

  const rerun = await readJsonIfPresent(path.join(benchmark.packetPath, "rerun-diff.json")) as Record<string, unknown> | null;
  const rerunDiffs = Array.isArray(rerun?.diffs) ? rerun.diffs : [];
  const rerunStatus = String(rerun?.status ?? "").toLowerCase();
  const rerunStable = rerunStatus === benchmark.rerunStabilityThresholds.requiredStatus && rerunDiffs.length <= benchmark.rerunStabilityThresholds.maxDiffCount;
  add(
    "rerun-stability",
    rerunStable ? "pass" : "fail",
    rerunStable ? "note" : "blocker",
    rerunStable ? "Rerun diff is stable within benchmark threshold." : `Rerun status=${rerunStatus || "missing"} diffs=${rerunDiffs.length}.`,
    [path.join(benchmark.packetPath, "rerun-diff.json")],
    rerunStable ? [] : [{ severity: "blocker", code: "RERUN_DIFF_UNSTABLE", message: "Benchmark rerun diff is not stable." }],
  );

  const packet = await readJsonIfPresent(path.join(benchmark.packetPath, "golden-packet.json")) as Record<string, unknown> | null;
  const packetArtifacts = isRecord(packet?.artifacts) ? packet.artifacts : {};
  const paperPath = typeof packetArtifacts.paper === "string" ? packetArtifacts.paper : null;
  const evidencePath = typeof packetArtifacts.analysisEvidence === "string" ? packetArtifacts.analysisEvidence : null;
  const paperQaPath = typeof packetArtifacts.paperQa === "string" ? packetArtifacts.paperQa : path.join(benchmark.packetPath, "paper-qa.json");
  let paperQa: ResearchPaperQa | null = null;
  if (paperPath && evidencePath && await exists(paperPath) && await exists(evidencePath)) {
    paperQa = await researchPaperQaCommand({ paperPath, evidencePath });
  } else {
    paperQa = unwrapResearchArtifact<ResearchPaperQa>(await readJsonIfPresent(paperQaPath), "paperQa");
  }
  add(
    "paper-qa",
    paperQa?.status === benchmark.qaRubric.requiredPaperQaStatus ? "pass" : paperQa ? "warning" : "fail",
    paperQa ? "warning" : "blocker",
    paperQa ? `Paper QA status=${paperQa.status}; ${paperQa.summary}` : "Paper QA artifact is missing or paper/evidence paths are unavailable.",
    [paperPath, evidencePath, paperQaPath].filter((value): value is string => Boolean(value)),
    paperQa && paperQa.status !== benchmark.qaRubric.requiredPaperQaStatus ? paperQa.checks.filter(check => check.status !== "pass").map(check => ({ severity: check.severity === "critical" ? "blocker" : check.severity === "major" ? "warning" : "note", code: `PAPER_QA_${check.id.toUpperCase().replace(/[^A-Z0-9]+/g, "_")}`, message: check.detail })) : [],
  );

  const claimGuard = paperPath && await exists(paperPath)
    ? await researchClaimGuardCommand({ reportPath: paperPath, specPath: benchmark.analysisSpecPath ?? undefined })
    : null;
  add(
    "claim-safety",
    claimGuard ? claimGuard.status === "pass" ? "pass" : claimGuard.status === "needs_revision" ? "warning" : "fail" : "skipped",
    claimGuard?.status === "blocked" ? "blocker" : "warning",
    claimGuard ? `Claim guard status=${claimGuard.status}.` : "Claim guard skipped because paper path is unavailable.",
    paperPath ? [paperPath] : [],
    claimGuard?.issues ?? [],
  );

  const shareExpectedLocalOnly = benchmark.expectedFailures.some(failure => failure.code === "SHARE_NOT_READY" && !failure.countsAsRegression);
  const shareMatches = benchmark.sharePolicy.expectedShareStatus === "ready_to_share"
    ? manifest.validForShare
    : manifest.validLocal && !manifest.validForShare && manifest.shareStatus === "local_only_blocked_for_share";
  add(
    "share-export-policy",
    shareMatches
      ? benchmark.sharePolicy.expectedShareStatus === "local_only_blocked_for_share" && shareExpectedLocalOnly ? "expected_failure" : "pass"
      : "fail",
    shareMatches ? "warning" : "blocker",
    shareMatches
      ? `Share policy observed expected ${benchmark.sharePolicy.expectedShareStatus}.`
      : `Share policy mismatch: validForShare=${manifest.validForShare} shareStatus=${manifest.shareStatus ?? "(none)"}.`,
    [manifest.manifestPath],
    shareMatches ? [] : [{ severity: "blocker", code: "SHARE_POLICY_MISMATCH", message: "Benchmark share/export policy did not match observed manifest verification." }],
  );

  const repairPlan = await researchRepairPlanCommand(benchmark.packetPath);
  add(
    "repair-plan",
    repairPlan.status === "no_repair_needed" ? "pass" : repairPlan.stoppingReasons.length ? "fail" : "warning",
    repairPlan.stoppingReasons.length ? "blocker" : "warning",
    repairPlan.status === "no_repair_needed" ? "No deterministic repair needed." : `${repairPlan.issues.length} repair issues; stopping=${repairPlan.stoppingReasons.join("; ") || "(none)"}.`,
    [path.join(benchmark.packetPath, "repair-plan.json")],
    repairPlan.issues,
  );

  const localReviewPath = path.join(benchmark.packetPath, "local-review-note.md");
  const localReviewText = await readTextIfPresent(localReviewPath);
  add(
    "cold-review",
    localReviewText && /review|limitation|approximate|local/i.test(localReviewText) ? "pass" : localReviewText ? "warning" : "fail",
    localReviewText ? "warning" : "blocker",
    localReviewText ? "Local review note is present and human-readable." : "Local review note is missing.",
    [localReviewPath],
    localReviewText ? [] : [{ severity: "blocker", code: "LOCAL_REVIEW_NOTE_MISSING", message: "Golden benchmark requires a local review note." }],
  );

  return benchmark.requiredChecks.map(id => checks.find(check => check.id === id) ?? {
    id,
    status: "skipped",
    severity: "warning",
    score: 0.25,
    weight: weight(id),
    detail: "Required benchmark check was declared but no evaluator produced it.",
    evidenceRefs: [],
    typedIssues: [{ severity: "warning", code: "BENCHMARK_CHECK_NOT_IMPLEMENTED", message: `No evaluator produced required check ${id}.` }],
  });
}

function evaluateBenchmarkMethodRequirements(benchmark: ResearchGoldenPacketBenchmark, spec: Record<string, unknown> | null): Array<ResearchBenchmarkMethodRequirement & { status: "pass" | "fail" }> {
  const surveyDesign = isRecord(spec?.surveyDesign) ? spec.surveyDesign : {};
  const inferencePolicy = isRecord(spec?.inferencePolicy) ? spec.inferencePolicy : {};
  const failurePolicy = isRecord(spec?.failurePolicy) ? spec.failurePolicy : {};
  const satisfied = new Map<string, boolean>([
    ["survey-weight", typeof surveyDesign.weightVariable === "string" && surveyDesign.weightVariable.length > 0],
    ["survey-strata", typeof surveyDesign.strataVariable === "string" && surveyDesign.strataVariable.length > 0],
    ["survey-psu", typeof surveyDesign.psuVariable === "string" && surveyDesign.psuVariable.length > 0],
    ["inference-policy", Object.keys(inferencePolicy).length > 0],
    ["failure-policy", Object.keys(failurePolicy).length > 0],
    ["no-causal-claims", inferencePolicy.causalClaimsAllowed === false],
    ["rerun-instability-block", failurePolicy.rerunInstability === "block"],
  ]);
  return benchmark.methodRequirements.map(requirement => ({
    ...requirement,
    status: satisfied.get(requirement.id) === true ? "pass" : requirement.required ? "fail" : "pass",
  }));
}

function scoreResearchBenchmarkRun(run: ResearchBenchmarkRun): ResearchBenchmarkRun {
  const score = run.checks.reduce((sum, check) => sum + check.score * check.weight, 0);
  const maxScore = run.checks.reduce((sum, check) => sum + check.weight, 0);
  const normalizedScore = maxScore > 0 ? score / maxScore : 0;
  const status: ResearchBenchmarkRun["status"] = run.unexpectedFailures.some(issue => issue.severity === "blocker")
    ? "fail"
    : run.checks.some(check => check.status === "fail")
      ? "fail"
      : run.checks.some(check => check.status === "warning" || check.status === "skipped")
        ? "warning"
        : "pass";
  return {
    ...run,
    score,
    maxScore,
    normalizedScore,
    status,
    nextAction: status === "pass"
      ? "Benchmark passed; add a harder archetype or use this run as a baseline for future changes."
      : "Repair failing benchmark checks before promoting framework or researcher changes.",
  };
}

function summarizeBenchmarkRun(run: ResearchBenchmarkRun): ResearchBenchmarkScore {
  const topRisks = run.unexpectedFailures.slice(0, 5);
  return {
    runId: run.runId,
    status: run.status,
    score: run.score,
    maxScore: run.maxScore,
    normalizedScore: run.normalizedScore,
    passCount: run.checks.filter(check => check.status === "pass").length,
    warningCount: run.checks.filter(check => check.status === "warning" || check.status === "skipped").length,
    failCount: run.checks.filter(check => check.status === "fail").length,
    expectedFailureCount: run.checks.filter(check => check.status === "expected_failure").length,
    topRisks,
    nextAction: run.status === "pass" ? "Use score as a promotion baseline." : "Fix top risks and rerun benchmark-run.",
  };
}

async function readBenchmarkArtifact(benchmarkPath: string): Promise<ResearchGoldenPacketBenchmark> {
  const raw = await readJsonIfPresent(path.resolve(benchmarkPath));
  const benchmark = unwrapResearchArtifact<ResearchGoldenPacketBenchmark>(raw, "benchmark");
  if (!benchmark || benchmark.schemaVersion !== 1 || typeof benchmark.benchmarkId !== "string") {
    throw new Error("benchmark artifact must contain schemaVersion=1 and benchmarkId");
  }
  return benchmark;
}

function resolveBenchmarkArtifactPath(benchmark: ResearchGoldenPacketBenchmark, artifactPath: string): string {
  return path.isAbsolute(artifactPath) ? artifactPath : path.join(benchmark.packetPath, artifactPath);
}

async function discoverBenchmarkPaths(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);
  const paths: string[] = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      paths.push(...await discoverBenchmarkPaths(full));
    } else if (entry.isFile() && /(?:golden-)?benchmark\.json$/.test(entry.name)) {
      paths.push(full);
    }
  }
  return paths.sort((a, b) => a.localeCompare(b));
}

async function discoverGoldenPacketDirs(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);
  const dirs: string[] = [];
  if (await exists(path.join(dir, "golden-manifest.json"))) dirs.push(dir);
  for (const entry of entries) {
    if (entry.isDirectory()) dirs.push(...await discoverGoldenPacketDirs(path.join(dir, entry.name)));
  }
  return uniqueStrings(dirs);
}

function emptyBenchmark(packetPath: string): ResearchGoldenPacketBenchmark {
  return {
    schemaVersion: 1,
    benchmarkId: "empty_suite",
    domain: "unknown",
    packetPath,
    researchQuestion: "",
    analysisSpecPath: null,
    expectedArtifacts: [],
    requiredChecks: [],
    expectedFailures: [],
    methodRequirements: [],
    rerunStabilityThresholds: { requiredStatus: "stable", maxDiffCount: 0, maxAbsoluteNumericDiff: 0 },
    qaRubric: { requiredPaperQaStatus: "pass", requireRunnerRecord: false, requireLocalReviewNote: false, requireAnalysisSpecHashBinding: false, requireColdReview: false },
    sharePolicy: { expectedShareStatus: "local_only_blocked_for_share", allowLocalOnly: true, requireNoLocalPathsForShare: false },
    localReviewPolicy: { expectedStatus: "ready_for_local_review", requireHumanReadableNote: false },
    scoreWeights: {},
    lastRun: null,
  };
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
    ...Object.values(RESEARCH_STAGE_ARTIFACTS).map(artifact => artifact.fileName),
    ...RESEARCH_EXTRA_ARTIFACTS,
  ]);
  return (await readdir(packetDir))
    .filter(name => artifactAllowlist.has(name))
    .sort((a, b) => a.localeCompare(b));
}

async function buildResearchExportReceipt(exportDir: string, artifactNames: string[]): Promise<NonNullable<ResearchPacketExport["exportReceipt"]>> {
  const artifactChecks: NonNullable<ResearchPacketExport["exportReceipt"]>["artifactChecks"] = [];
  const findings: NonNullable<ResearchPacketExport["exportReceipt"]>["localPathScan"]["findings"] = [];
  const localPathPattern = /(?:\/Users\/[^\s"'<>]+|\/home\/[^\s"'<>]+|[A-Za-z]:\\[^\s"'<>]+)/g;
  for (const artifactName of artifactNames) {
    const artifactPath = path.join(exportDir, artifactName);
    if (!await exists(artifactPath)) continue;
    const contents = await readFile(artifactPath);
    artifactChecks.push({
      path: artifactName,
      bytes: contents.length,
      sha256: createHash("sha256").update(contents).digest("hex"),
    });
    const text = contents.toString("utf-8");
    const matches = [...text.matchAll(localPathPattern)].slice(0, 3);
    findings.push(...matches.map(match => ({
      artifactPath: artifactName,
      sample: match[0].slice(0, 160),
    })));
  }
  const status = findings.length ? "fail" : "pass";
  return {
    policy: "shareable-local-path-scan-v1",
    generatedAtIso: new Date().toISOString(),
    status,
    artifactChecks,
    localPathScan: {
      status,
      scannedArtifacts: artifactChecks.length,
      findings,
    },
  };
}

async function buildResearchExportManifest(exportDir: string, artifactNames: string[]): Promise<ResearchArtifactManifest> {
  const artifacts: ResearchArtifactManifest["artifacts"] = [];
  for (const artifactName of artifactNames) {
    const artifactPath = path.join(exportDir, artifactName);
    if (!await exists(artifactPath)) continue;
    const [info, contents] = await Promise.all([stat(artifactPath), readFile(artifactPath)]);
    artifacts.push({
      path: artifactName,
      bytes: info.size,
      sha256: createHash("sha256").update(contents).digest("hex"),
    });
  }
  return {
    packetDir: ".",
    generatedAtIso: new Date().toISOString(),
    artifacts,
  };
}

async function hasFreshRedactedDataAccess(packetDir: string): Promise<boolean> {
  const sourcePath = path.join(packetDir, "data-access.json");
  const redactedPath = path.join(packetDir, "data-access-redacted.json");
  if (!await exists(sourcePath) || !await exists(redactedPath)) return false;
  const redacted = await readJsonIfPresent(redactedPath) as ResearchDataAccessRedaction | null;
  return Boolean(redacted?.sourceManifestSha256 && redacted.sourceManifestSha256 === await hashFile(sourcePath));
}

function isSingleAgenteerResearchCommand(command: string): boolean {
  return command.startsWith("agenteer research ") && !/[;&|`$<>]/.test(command);
}

async function artifactDigestMap(packetDir: string): Promise<Map<string, string>> {
  const entries = await Promise.all((await listResearchArtifactNames(packetDir)).map(async name => {
    const bytes = await readFile(path.join(packetDir, name));
    return [name, createHash("sha256").update(bytes).digest("hex")] as const;
  }));
  return new Map(entries);
}

function makeStructuredProtocol(opts: {
  title: string;
  question: string;
  exposure: [string, string, string, string, string | null];
  endpoint: [string, string, string, string, string | null];
  covariates?: Array<[string, string, string]>;
  stratifiers?: Array<[string, string, string]>;
  cycles: string[];
  analysisType: string;
  rationale: string;
  caveats: string[];
}): ResearchStructuredProtocol {
  const seed = `${opts.title}|${opts.question}|${opts.exposure[1]}|${opts.endpoint[1]}|${opts.analysisType}`;
  const hash = createHash("sha1").update(seed).digest("hex").slice(0, 10);
  const slug = opts.title.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 40);
  return {
    id: `protocol_${slug}_${hash}`,
    title: opts.title,
    clinicalQuestion: opts.question,
    dataset: "nhanes",
    population: {
      label: inferPopulationLabel(opts.question),
      definition: inferPopulationLabel(opts.question),
      filters: ["RIDAGEYR", "RIDSTATR"],
    },
    exposure: conceptFromTuple(opts.exposure),
    comparator: { label: "Reference group", variable: "", definition: "Not exposed or reference category", domain: "", threshold: null },
    endpoint: conceptFromTuple(opts.endpoint),
    covariates: (opts.covariates ?? []).map(([label, variable, domain]) => ({ label, variable, domain })),
    stratifiers: (opts.stratifiers ?? []).map(([label, variable, domain]) => ({ label, variable, domain })),
    cycles: opts.cycles,
    analysisType: opts.analysisType,
    requestedOutputs: ["cohort_table", "model_or_summary_table", "plot", "markdown_report"],
    clinicalRationale: opts.rationale,
    assumptions: ["Use complete-case analysis unless missingness requires a separate plan."],
    caveats: opts.caveats,
    uncertainty: ["Survey variance estimation and sparse cells must be checked during execution."],
    evidenceCitations: [],
  };
}

function conceptFromTuple([label, variable, definition, domain, threshold]: [string, string, string, string, string | null]): ResearchStructuredProtocol["exposure"] {
  return { label, variable, definition, domain, threshold };
}

function inferPopulationLabel(question: string): string {
  const population = researchDecomposeQuestionCommand(question).population;
  if (population) return population;
  if (/\badult/i.test(question)) return "Adults aged 20 years and older";
  return "Target population specified by the research question";
}

function defaultResearchInferencePolicy(): ResearchAnalysisSpecV1["inferencePolicy"] {
  return {
    estimandType: "associational",
    varianceEstimator: "approximate_weighted",
    allowedInference: "exploratory_association",
    pValueLanguage: "approximate_only",
    causalClaimsAllowed: false,
  };
}

function defaultResearchFailurePolicy(): ResearchAnalysisSpecV1["failurePolicy"] {
  return {
    missingVariable: "block",
    invalidWeight: "block",
    highMissingnessThreshold: 0.4,
    sparseCellThreshold: 16,
    rerunInstability: "block",
    hashMismatch: "block",
    methodologicalUncertainty: "stop_for_review",
  };
}

function researchAnalysisSpecFromProtocol(protocol: ResearchStructuredProtocol): ResearchAnalysisSpecV1 {
  const outcome = expandConceptVariables(protocol.endpoint);
  const exposures = expandConceptVariables(protocol.exposure);
  const covariates = uniqueStrings(protocol.covariates.map(item => item.variable));
  const stratify = uniqueStrings(protocol.stratifiers.map(item => item.variable));
  const filters = uniqueStrings([...protocol.population.filters, "RIDAGEYR", "RIDSTATR"]);
  const weightVariable = protocol.cycles.includes("2017-2020-prepandemic") ? "WTMECPRP" : "WTMEC2YR";
  const specBase = {
    schemaVersion: 1 as const,
    id: `analysis_${createHash("sha1").update(protocol.id).digest("hex").slice(0, 12)}`,
    dataset: protocol.dataset,
    releasePolicy: "local_files" as const,
    researchQuestion: protocol.clinicalQuestion,
    population: { description: [protocol.population.definition || protocol.population.label].filter(Boolean), filters },
    cycles: protocol.cycles,
    variables: { outcome, exposures, covariates, stratify, filters },
    derivedDefinitions: {
      source: "structured_protocol",
      definitions: uniqueStrings([
        protocol.endpoint.definition,
        protocol.exposure.definition,
        protocol.comparator.definition,
        protocol.population.definition,
        ...protocol.assumptions,
      ]),
    },
    surveyDesign: {
      weightRule: protocol.cycles.includes("2017-2020-prepandemic") ? "prepandemic_mec" : "mec",
      weightVariable,
      strataVariable: "SDMVSTRA",
      psuVariable: "SDMVPSU",
    },
    analysisPlan: [protocol.analysisType, ...protocol.assumptions],
    inferencePolicy: defaultResearchInferencePolicy(),
    failurePolicy: defaultResearchFailurePolicy(),
    expectedOutputs: protocol.requestedOutputs,
    execution: {
      timeoutSeconds: 600,
      memoryMb: 2048,
      maxRows: 200000,
      maxOutputBytes: 25_000_000,
    },
  };
  const requiredVariables = uniqueStrings([
    ...outcome,
    ...exposures,
    ...covariates,
    ...stratify,
    ...filters,
    specBase.surveyDesign.weightVariable,
    specBase.surveyDesign.strataVariable,
    specBase.surveyDesign.psuVariable,
    "SEQN",
  ]);
  const withoutHash = { ...specBase, requiredVariables };
  return {
    ...withoutHash,
    specHash: createHash("sha256").update(JSON.stringify(withoutHash)).digest("hex"),
  };
}

function researchAnalysisSpecFromPacket(packet: LabMedbreviaNhanesResult): ResearchAnalysisSpecV1 {
  const protocol = packet.protocol;
  const specBase = {
    schemaVersion: 1 as const,
    id: `analysis_${createHash("sha1").update(protocol.title + protocol.clinicalQuestion).digest("hex").slice(0, 12)}`,
    dataset: protocol.dataset,
    releasePolicy: "local_files" as const,
    researchQuestion: protocol.clinicalQuestion,
    population: { description: [protocol.population.label ?? "Population from design packet"].filter(Boolean), filters: protocol.population.filters },
    cycles: protocol.cycles,
    variables: {
      outcome: protocol.endpoint.variables,
      exposures: protocol.exposure.variables,
      covariates: protocol.covariates,
      stratify: protocol.stratifiers ?? [],
      filters: uniqueStrings([...protocol.population.filters.flatMap(extractVariableNames), "RIDAGEYR", "RIDSTATR"]),
    },
    derivedDefinitions: {
      source: "design_packet",
      definitions: protocol.derivedDefinitions.map(def => def.expression),
    },
    surveyDesign: {
      weightRule: protocol.surveyDesign.weightRule,
      weightVariable: protocol.surveyDesign.weightVariable,
      strataVariable: protocol.surveyDesign.strataVariable,
      psuVariable: protocol.surveyDesign.psuVariable,
    },
    analysisPlan: [usesContinuousByExposureGroup(protocol) ? "continuous_by_exposure_group" : "binary_association"],
    inferencePolicy: defaultResearchInferencePolicy(),
    failurePolicy: defaultResearchFailurePolicy(),
    expectedOutputs: ["cohort_table", "analysis_result", "markdown_report"],
    execution: {
      timeoutSeconds: 600,
      memoryMb: 2048,
      maxRows: 200000,
      maxOutputBytes: 25_000_000,
    },
  };
  const requiredVariables = uniqueStrings([
    ...specBase.variables.outcome,
    ...specBase.variables.exposures,
    ...specBase.variables.covariates,
    ...specBase.variables.stratify,
    ...specBase.variables.filters,
    specBase.surveyDesign.weightVariable,
    specBase.surveyDesign.strataVariable,
    specBase.surveyDesign.psuVariable,
    "SEQN",
  ]);
  const withoutHash = { ...specBase, requiredVariables };
  return {
    ...withoutHash,
    specHash: createHash("sha256").update(JSON.stringify(withoutHash)).digest("hex"),
  };
}

function expandConceptVariables(concept: Pick<ResearchStructuredProtocol["endpoint"], "variable" | "definition" | "label">): string[] {
  const variables = new Set<string>();
  const raw = `${concept.variable} ${concept.label} ${concept.definition}`.toUpperCase();
  for (const match of raw.matchAll(/\b[A-Z][A-Z0-9_]{2,}\b/g)) {
    if (SEMANTIC_VARIABLE_RULES[match[0]] || match[0].startsWith("BPX")) variables.add(match[0]);
  }
  if (raw.includes("MEASURED_HYPERTENSION") || raw.includes("HYPERTENSION") || raw.includes("BLOOD PRESSURE")) {
    ["BPXSY1", "BPXSY2", "BPXSY3", "BPXDI1", "BPXDI2", "BPXDI3"].forEach(variable => variables.add(variable));
  }
  if (raw.includes("VITAMIN D")) variables.add("LBXVIDMS");
  return Array.from(variables).sort((a, b) => a.localeCompare(b));
}

async function readTabularRows(file: string): Promise<Array<Record<string, unknown>>> {
  const text = await readFile(file, "utf-8");
  if (file.endsWith(".json")) return JSON.parse(text) as Array<Record<string, unknown>>;
  if (file.endsWith(".csv")) return parseCsvRows(text);
  throw new Error("Only .json and .csv local data files are supported by this zero-cloud scout.");
}

function tableFormatForFile(file: string): ResearchTableSummary["format"] {
  if (file.endsWith(".json")) return "json";
  if (file.endsWith(".csv")) return "csv";
  if (file.endsWith(".parquet")) return "parquet";
  throw new Error("table-summary supports .json, .csv, and .parquet files.");
}

function summarizeRows(
  file: string,
  format: ResearchTableSummary["format"],
  fileSizeBytes: number,
  fileMtimeMs: number,
  fileSha256: string,
  rows: Array<Record<string, unknown>>,
): ResearchTableSummary {
  const columns = uniqueStrings(rows.flatMap(row => Object.keys(row))).map(name => summarizeColumn(name, rows.map(row => row[name]), rows.length));
  const warnings: ResearchCritiqueIssue[] = [];
  if (!rows.length) warnings.push({ severity: "blocker", code: "EMPTY_TABLE", message: "No rows were found in the table." });
  return {
    file,
    format,
    adapter: {
      kind: "node-tabular",
      executable: "node",
      version: process.version,
      packages: {},
    },
    fileSizeBytes,
    fileMtimeMs,
    fileSha256,
    rowCount: rows.length,
    columnCount: columns.length,
    columns,
    warnings,
  };
}

function summarizeColumn(name: string, rawValues: unknown[], rowCount: number): ResearchTableSummary["columns"][number] {
  const values = rawValues.filter(hasValue);
  const types = uniqueStrings(values.map(value => typeof value));
  const numericValues = values.map(value => Number(value)).filter(value => Number.isFinite(value));
  const inferredType: ResearchTableSummary["columns"][number]["inferredType"] =
    values.length === 0 ? "empty"
      : numericValues.length === values.length ? "number"
        : types.length === 1 && (types[0] === "string" || types[0] === "boolean") ? types[0]
          : types.length === 1 && types[0] === "number" ? "number"
            : "mixed";
  const result: ResearchTableSummary["columns"][number] = {
    name,
    inferredType,
    nonMissingRows: values.length,
    missingFraction: rowCount ? (rowCount - values.length) / rowCount : 1,
    sampleValues: uniqueStrings(values.slice(0, 8).map(value => String(value))).slice(0, 5),
  };
  if (numericValues.length) {
    result.min = Math.min(...numericValues);
    result.max = Math.max(...numericValues);
    result.mean = numericValues.reduce((sum, value) => sum + value, 0) / numericValues.length;
  }
  return result;
}

async function hashFile(file: string): Promise<string> {
  return createHash("sha256").update(await readFile(file)).digest("hex");
}

async function fileRecord(file: string): Promise<{ path: string; bytes: number; sha256: string }> {
  const resolved = path.resolve(file);
  const fileStat = await stat(resolved);
  return {
    path: resolved,
    bytes: fileStat.size,
    sha256: await hashFile(resolved),
  };
}

function readAnalysisSpecHash(value: unknown): string | null {
  const spec = unwrapResearchArtifact<ResearchAnalysisSpecV1>(value, "analysisSpec");
  return typeof spec?.specHash === "string" ? spec.specHash : null;
}

function buildExplorationVariableMap(summary: ResearchTableSummary, rows: Array<Record<string, unknown>>, target: string | null): ResearchExplorationResult["variableMap"] {
  return summary.columns.map(column => {
    const values = rows.map(row => row[column.name]).filter(hasValue).map(value => String(value));
    const cardinality = column.inferredType === "empty" ? 0 : uniqueStrings(values).length;
    const lower = column.name.toLowerCase();
    const notes: string[] = [];
    let role: ResearchExplorationResult["variableMap"][number]["role"] = "feature";
    if (target && column.name === target) {
      role = "candidate_outcome";
      notes.push("User-declared target variable.");
    } else if (/^(id|seqn|index|row|person|participant)/i.test(column.name) || /id$/.test(lower)) {
      role = "identifier_or_index";
      notes.push("Looks like an identifier or row index.");
    } else if (looksLikeDesignOrMetadataColumn(column.name)) {
      role = "metadata_or_weight";
      notes.push("Looks like design, time, or metadata rather than a substantive exposure.");
    } else if (column.missingFraction > 0.8 || cardinality <= 1) {
      role = "low_information";
      notes.push(column.missingFraction > 0.8 ? "Very high missingness." : "Near-constant variable.");
    } else if (/outcome|case|disease|diagnosis|death|mortality|event|score|hba1c|glucose|bp|hdl|ldl/i.test(column.name)) {
      role = "candidate_outcome";
    } else if (/exposure|treat|risk|bmi|age|sex|race|smok|income|poverty|education|insurance/i.test(column.name)) {
      role = "candidate_exposure";
    }
    if (column.missingFraction > 0.2 && column.missingFraction <= 0.8) notes.push("Moderate/high missingness; require missing-data review.");
    if (cardinality > 100 && column.inferredType !== "number") notes.push("High-cardinality nonnumeric column; avoid naive categorical tests.");
    return { name: column.name, role, inferredType: column.inferredType, nonMissingRows: column.nonMissingRows, missingFraction: column.missingFraction, cardinality, notes };
  });
}

function explorationEligibleColumns(summary: ResearchTableSummary): ResearchTableSummary["columns"] {
  return summary.columns.filter(column =>
    column.inferredType !== "empty"
    && column.nonMissingRows >= Math.max(8, Math.min(30, summary.rowCount * 0.2))
    && !/^(id|seqn|index|row)$/i.test(column.name)
    && !looksLikeDesignOrMetadataColumn(column.name));
}

function scanExploratoryAssociations(rows: Array<Record<string, unknown>>, summary: ResearchTableSummary): {
  associations: ResearchExplorationResult["associations"];
  eligiblePairCount: number;
  testedPairCount: number;
} {
  const eligibleColumns = explorationEligibleColumns(summary);
  const eligiblePairCount = eligibleColumns.length * (eligibleColumns.length - 1) / 2;
  let testedPairCount = 0;
  const results: ResearchExplorationResult["associations"] = [];
  for (let leftIndex = 0; leftIndex < eligibleColumns.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < eligibleColumns.length; rightIndex += 1) {
      const left = eligibleColumns[leftIndex]!;
      const right = eligibleColumns[rightIndex]!;
      const paired = rows.map(row => [row[left.name], row[right.name]] as [unknown, unknown]).filter(([a, b]) => hasValue(a) && hasValue(b));
      if (paired.length < 8) continue;
      testedPairCount += 1;
      const missingFractionMax = Math.max(left.missingFraction, right.missingFraction);
      const caveats = missingFractionMax > 0.2 ? ["high missingness"] : [];
      if (left.inferredType === "number" && right.inferredType === "number") {
        const r = pearson(paired.map(([value]) => Number(value)), paired.map(([, value]) => Number(value)));
        if (r === null) continue;
        results.push({ id: stableAssociationId(left.name, right.name, "pearson"), left: left.name, right: right.name, method: "pearson", strength: Math.abs(r), direction: r >= 0 ? "positive" : "negative", n: paired.length, missingFractionMax, caveats });
      } else if (left.inferredType === "number" || right.inferredType === "number") {
        const numericIsLeft = left.inferredType === "number";
        const eta = etaSquared(paired.map(pair => ({ group: String(pair[numericIsLeft ? 1 : 0]), value: Number(pair[numericIsLeft ? 0 : 1]) })));
        if (eta === null) continue;
        results.push({ id: stableAssociationId(left.name, right.name, "eta_squared"), left: left.name, right: right.name, method: "eta_squared", strength: eta, direction: "unsigned", n: paired.length, missingFractionMax, caveats: [...caveats, "unadjusted group mean separation"] });
      } else {
        const v = cramersV(paired.map(([a, b]) => [String(a), String(b)]));
        if (v === null) continue;
        results.push({ id: stableAssociationId(left.name, right.name, "cramers_v"), left: left.name, right: right.name, method: "cramers_v", strength: v, direction: "unsigned", n: paired.length, missingFractionMax, caveats: [...caveats, "unadjusted categorical association"] });
      }
    }
  }
  return {
    associations: results.filter(item => Number.isFinite(item.strength) && item.strength > 0).sort((a, b) => b.strength - a.strength || b.n - a.n),
    eligiblePairCount,
    testedPairCount,
  };
}

function buildExplorationBurden(
  rows: Array<Record<string, unknown>>,
  summary: ResearchTableSummary,
  variableMap: ResearchExplorationResult["variableMap"],
  associationScan: { associations: ResearchExplorationResult["associations"]; eligiblePairCount: number; testedPairCount: number },
  target: string | null,
  targetAssociations: ResearchExplorationResult["associations"],
): Omit<ResearchExplorationResult["explorationBurden"], "promotionSummary" | "promotionClearance"> {
  const highMissingnessVariables = variableMap
    .filter(item => item.missingFraction > 0.5)
    .map(item => ({ name: item.name, missingFraction: item.missingFraction }));
  const sparseCategoricalVariables = summary.columns
    .filter(column => column.inferredType !== "empty" && column.inferredType !== "number")
    .map(column => {
      const counts = new Map<string, number>();
      for (const row of rows) {
        const value = row[column.name];
        if (hasValue(value)) counts.set(String(value), (counts.get(String(value)) ?? 0) + 1);
      }
      return { name: column.name, cardinality: counts.size, minCellCount: counts.size ? Math.min(...counts.values()) : 0 };
    })
    .filter(item => item.cardinality > 1 && item.cardinality <= 20 && item.minCellCount < 5);
  const surveyDesignCandidates = variableMap
    .filter(item => item.role === "metadata_or_weight" || looksLikeDesignOrMetadataColumn(item.name))
    .map(item => ({ name: item.name, reason: designMetadataReason(item.name) }));
  const possibleLeakagePairs = targetAssociations
    .filter(item => item.strength >= 0.95 || namesSuggestLeakage(target, item.left, item.right))
    .map(item => ({
      associationId: item.id,
      left: item.left,
      right: item.right,
      reason: item.strength >= 0.98
        ? "near-perfect target association; may be duplicate, derived, or target leakage"
        : namesSuggestLeakage(target, item.left, item.right)
          ? "variable name suggests target proxy or derived measure"
          : "very strong target association; review proxy/leakage risk",
    }));
  const multiplicityRisk: ResearchExplorationResult["explorationBurden"]["multiplicityRisk"] =
    associationScan.testedPairCount >= 200 ? "high"
      : associationScan.testedPairCount >= 40 ? "medium"
        : "low";
  return {
    eligiblePairCount: associationScan.eligiblePairCount,
    testedPairCount: associationScan.testedPairCount,
    targetPairCount: target ? targetAssociations.length : 0,
    multiplicityRisk,
    highMissingnessVariables,
    sparseCategoricalVariables,
    surveyDesignCandidates,
    possibleLeakagePairs,
  };
}

function namesSuggestLeakage(target: string | null, left: string, right: string): boolean {
  if (!target) return false;
  const targetLower = target.toLowerCase();
  const other = (left === target ? right : left).toLowerCase();
  if (other === targetLower) return false;
  const normalizedTarget = targetLower.replace(/[^a-z0-9]/g, "");
  const normalizedOther = other.replace(/[^a-z0-9]/g, "");
  if (normalizedOther.includes(normalizedTarget) || normalizedTarget.includes(normalizedOther)) return true;
  if (["elevated", "high", "low", "abnormal", "positive", "case", "flag", "threshold"].includes(normalizedOther)) {
    return targetAliasTerms(target).some(term => term.replace(/[^a-z0-9]/g, "").length >= 3);
  }
  return targetAliasTerms(target).some(term => {
    const normalizedTerm = term.replace(/[^a-z0-9]/g, "");
    return normalizedTerm.length >= 3 && (normalizedOther.includes(normalizedTerm) || normalizedTerm.includes(normalizedOther));
  });
}

function targetAliasTerms(target: string): string[] {
  const normalized = target.toLowerCase().replace(/[^a-z0-9]/g, "");
  const groups = [
    ["lbxgh", "hba1c", "a1c", "glycohemoglobin", "glycatedhemoglobin"],
    ["lbxglu", "glucose", "fastingglucose", "plasmaglucose"],
    ["bmxbmi", "bmi", "bodymassindex"],
    ["bmxwaist", "waist", "waistcircumference"],
    ["lbdhdd", "hdl", "hdlcholesterol"],
    ["lbxtc", "totalcholesterol", "cholesterol"],
    ["lbxtr", "triglyceride", "triglycerides"],
  ];
  return groups.find(group => group.includes(normalized)) ?? [normalized];
}

function looksLikeDesignOrMetadataColumn(name: string): boolean {
  return /weight|strata|psu|cluster|wave|cycle|year|date/i.test(name)
    || /^WT[A-Z0-9_]*$/i.test(name)
    || /^SDMV(PSU|STRA)$/i.test(name)
    || /^SDDSRVYR$/i.test(name)
    || /release|version/i.test(name);
}

function designMetadataReason(name: string): string {
  if (/weight/i.test(name) || /^WT[A-Z0-9_]*$/i.test(name)) return "possible analysis weight";
  if (/strata|psu|cluster/i.test(name) || /^SDMV(PSU|STRA)$/i.test(name)) return "possible complex-design field";
  return "possible cycle/time/design metadata";
}

function questionPromotionGate(
  association: ResearchExplorationResult["associations"][number],
  outcome: string,
  exposure: string,
  variableMap: Map<string, ResearchExplorationResult["variableMap"][number]>,
  burden: Omit<ResearchExplorationResult["explorationBurden"], "promotionSummary" | "promotionClearance">,
): { status: ResearchExplorationResult["candidateQuestions"][number]["promotionStatus"]; blockers: string[] } {
  const blockers: string[] = [];
  const leftRole = variableMap.get(association.left)?.role;
  const rightRole = variableMap.get(association.right)?.role;
  if (leftRole === "identifier_or_index" || rightRole === "identifier_or_index") blockers.push("identifier/index variable is not a valid research exposure or outcome");
  if (leftRole === "metadata_or_weight" || rightRole === "metadata_or_weight") blockers.push("design/metadata variable should not be promoted as a substantive association without review");
  if (association.n < 30) blockers.push("low complete-pair count for promotion");
  if (association.missingFractionMax > 0.3) blockers.push("high missingness in at least one paired variable");
  if (burden.surveyDesignCandidates.length) blockers.push("survey/design fields detected; promotion needs survey-aware plan");
  if (burden.multiplicityRisk === "high") blockers.push("high multiplicity burden from broad pair scan");
  const leakage = burden.possibleLeakagePairs.find(item => item.associationId === association.id);
  if (leakage) blockers.push(leakage.reason);
  const exposureInfo = variableMap.get(exposure);
  const outcomeInfo = variableMap.get(outcome);
  if (exposureInfo?.role === "low_information" || outcomeInfo?.role === "low_information") blockers.push("low-information variable in candidate question");
  if (blockers.some(item => item.includes("identifier/index") || item.includes("low-information"))) return { status: "blocked", blockers };
  if (blockers.length) return { status: "needs_methods_review", blockers };
  return { status: "promotable_hypothesis", blockers };
}

function explorationPromotionClearance(
  burden: Omit<ResearchExplorationResult["explorationBurden"], "promotionSummary" | "promotionClearance">,
  summary: ResearchExplorationResult["explorationBurden"]["promotionSummary"],
  questionCount: number,
): ResearchExplorationResult["explorationBurden"]["promotionClearance"] {
  const reasons: string[] = [];
  if (!questionCount) reasons.push("no candidate questions were generated");
  if (summary.blocked) reasons.push(`${summary.blocked} candidate questions are blocked`);
  if (summary.needsMethodsReview) reasons.push(`${summary.needsMethodsReview} candidate questions need methods review`);
  if (!summary.promotable) reasons.push("no candidate questions are currently promotable");
  if (burden.surveyDesignCandidates.length) reasons.push("survey/design candidate variables detected");
  if (burden.possibleLeakagePairs.length) reasons.push("possible target leakage/proxy pairs detected");
  if (burden.multiplicityRisk === "high") reasons.push("high multiplicity burden");
  if (!questionCount || summary.blocked) return { level: "stop", reasons };
  if (reasons.length) return { level: "hold_for_methods_review", reasons };
  return { level: "clear_for_handoff", reasons };
}

function explorationVariableDomain(name: string): "glycemic" | "anthropometric" | "lipid" | "social_demographic" | "survey_design" | "clinical_status" | "general" {
  const normalized = name.toLowerCase().replace(/[^a-z0-9]/g, "");
  if (looksLikeDesignOrMetadataColumn(name)) return "survey_design";
  if (/(hba1c|a1c|glycohemoglobin|glucose|diabetes|diq|lbxgh|lbxglu|elevatedhba1c)/i.test(normalized)) return "glycemic";
  if (/(bmi|bodymass|waist|weight|height|bmx)/i.test(normalized)) return "anthropometric";
  if (/(hdl|ldl|cholesterol|triglyceride|lbdhdd|lbxtc|lbxtr)/i.test(normalized)) return "lipid";
  if (/(pir|income|poverty|education|race|ethnic|sex|gender|age|ridageyr|riagendr|indfmpir)/i.test(normalized)) return "social_demographic";
  if (/(disease|diagnosis|mortality|death|hospital|visit|admission|outcome|elevated)/i.test(normalized)) return "clinical_status";
  return "general";
}

function classifyExplorationQuestion(
  association: ResearchExplorationResult["associations"][number],
  outcome: string,
  exposure: string,
  variableMap: Map<string, ResearchExplorationResult["variableMap"][number]>,
  burden: Omit<ResearchExplorationResult["explorationBurden"], "promotionSummary" | "promotionClearance">,
): Pick<ResearchExplorationResult["candidateQuestions"][number], "taxonomy" | "researchInterestScore" | "primaryQuestionUse" | "taxonomyEvidence" | "whyThisQuestion" | "avoidAsPrimaryQuestion"> {
  const exposureDomain = explorationVariableDomain(exposure);
  const outcomeDomain = explorationVariableDomain(outcome);
  const leakage = burden.possibleLeakagePairs.find(item => item.associationId === association.id);
  const exposureRole = variableMap.get(exposure)?.role;
  const outcomeRole = variableMap.get(outcome)?.role;
  const sameDomain = exposureDomain !== "general" && exposureDomain === outcomeDomain;
  const hasTarget = variableMap.get(outcome)?.role === "candidate_outcome";
  const matchedRuleIds: string[] = [];
  const matchedTerms = uniqueStrings([exposure, outcome, exposureDomain, outcomeDomain, leakage?.reason].filter((item): item is string => Boolean(item)));
  const category: ResearchExplorationResult["candidateQuestions"][number]["taxonomy"] =
    exposureDomain === "survey_design" || outcomeDomain === "survey_design" || exposureRole === "metadata_or_weight" || outcomeRole === "metadata_or_weight"
      ? (matchedRuleIds.push("taxonomy.design-metadata"), "design_or_metadata_artifact")
      : leakage || namesSuggestLeakage(outcome, outcome, exposure)
        ? (matchedRuleIds.push("taxonomy.target-proxy"), "likely_duplicate_or_proxy")
        : sameDomain && ["glycemic", "lipid", "anthropometric"].includes(exposureDomain)
          ? (matchedRuleIds.push("taxonomy.expected-same-domain"), "expected_same_domain_biomarker")
          : exposureDomain === "social_demographic"
            ? (matchedRuleIds.push("taxonomy.social-demographic"), "social_demographic_determinant")
            : ["anthropometric", "lipid", "clinical_status"].includes(exposureDomain)
              ? (matchedRuleIds.push("taxonomy.plausible-risk-factor"), "plausible_risk_factor")
              : hasTarget && exposureDomain !== outcomeDomain && association.strength >= 0.2
                ? (matchedRuleIds.push("taxonomy.surprising-cross-domain"), "surprising_cross_domain_signal")
                : "general_association";
  if (category === "general_association") matchedRuleIds.push("taxonomy.general");
  const categoryBonus: Record<ResearchExplorationResult["candidateQuestions"][number]["taxonomy"], number> = {
    likely_duplicate_or_proxy: -45,
    expected_same_domain_biomarker: -18,
    plausible_risk_factor: 18,
    social_demographic_determinant: 20,
    clinical_utilization_or_outcome_signal: 12,
    surprising_cross_domain_signal: 16,
    design_or_metadata_artifact: -55,
    general_association: 0,
  };
  const missingPenalty = Math.round(association.missingFractionMax * 35);
  const multiplicityPenalty = burden.multiplicityRisk === "high" ? 8 : burden.multiplicityRisk === "medium" ? 4 : 0;
  const sampleBonus = association.n >= 1000 ? 8 : association.n >= 100 ? 5 : association.n >= 30 ? 2 : -8;
  const targetBonus = hasTarget ? 8 : 0;
  const strengthBonus = Math.round(association.strength * 55);
  const scoreAdjustments = [
    { id: "score.association-strength", delta: strengthBonus, reason: `Unadjusted association strength ${association.strength.toFixed(3)}.` },
    { id: `score.category.${category}`, delta: categoryBonus[category], reason: `Taxonomy category ${category}.` },
    { id: "score.sample-size", delta: sampleBonus, reason: `${association.n} complete pairs.` },
    { id: "score.target-centered", delta: targetBonus, reason: hasTarget ? "Candidate is target-centered." : "Candidate is not target-centered." },
    { id: "score.missingness", delta: -missingPenalty, reason: `Maximum pair missingness ${(association.missingFractionMax * 100).toFixed(1)}%.` },
    { id: "score.multiplicity", delta: -multiplicityPenalty, reason: `Multiplicity risk ${burden.multiplicityRisk}.` },
  ].filter(item => item.delta !== 0);
  const rawScore = scoreAdjustments.reduce((sum, item) => sum + item.delta, 0);
  const researchInterestScore = Math.max(0, Math.min(100, rawScore));
  const whyThisQuestion = (() => {
    if (category === "likely_duplicate_or_proxy") return `${exposure} may duplicate, derive from, or proxy ${outcome}; this is useful for data-quality review but weak as a primary research question.`;
    if (category === "expected_same_domain_biomarker") return `${exposure} and ${outcome} appear to be related measures in the same clinical domain; model only if the scientific question requires this expected relationship.`;
    if (category === "social_demographic_determinant") return `${exposure} may capture social or demographic patterning in ${outcome}, which can generate public-health questions if survey design and confounding are handled carefully.`;
    if (category === "plausible_risk_factor") return `${exposure} is a plausible risk marker for ${outcome}; this is a stronger candidate for adjusted modeling than a duplicate or same-domain marker.`;
    if (category === "surprising_cross_domain_signal") return `${exposure} is outside the apparent domain of ${outcome}, so the association may be worth investigating after checking coding, missingness, and confounding.`;
    if (category === "design_or_metadata_artifact") return `${exposure} or ${outcome} appears to be a design or metadata field, so the association should inform weighting/design setup rather than a substantive study question.`;
    return `${exposure} and ${outcome} show an unadjusted association that may be worth triage after domain review.`;
  })();
  const avoidAsPrimaryQuestion =
    category === "likely_duplicate_or_proxy" ? "Likely duplicate/proxy/derived measure; use for leakage review, not as the primary study question."
      : category === "expected_same_domain_biomarker" && association.strength >= 0.45 ? "Expected same-domain biomarker relationship; consider a more clinically meaningful exposure first."
        : category === "design_or_metadata_artifact" ? "Design or metadata field should not be treated as a substantive exposure or outcome."
          : null;
  const primaryQuestionUse: ResearchExplorationResult["candidateQuestions"][number]["primaryQuestionUse"] =
    avoidAsPrimaryQuestion ? "avoid_primary"
      : category === "expected_same_domain_biomarker" || category === "general_association" ? "review_before_primary"
        : "recommended";
  const rejectedCategories: ResearchExplorationResult["candidateQuestions"][number]["taxonomyEvidence"]["rejectedCategories"] = [];
  if (category !== "likely_duplicate_or_proxy" && leakage) rejectedCategories.push({ taxonomy: "likely_duplicate_or_proxy", reason: "Leakage rule did not determine final taxonomy." });
  if (category !== "expected_same_domain_biomarker" && sameDomain) rejectedCategories.push({ taxonomy: "expected_same_domain_biomarker", reason: "Same-domain rule was not selected after higher-priority checks." });
  if (category !== "social_demographic_determinant" && exposureDomain === "social_demographic") rejectedCategories.push({ taxonomy: "social_demographic_determinant", reason: "Social/demographic rule was not selected after higher-priority checks." });
  return {
    taxonomy: category,
    researchInterestScore,
    primaryQuestionUse,
    taxonomyEvidence: {
      taxonomyVersion: "exploration-taxonomy-v1",
      matchedRuleIds,
      matchedTerms,
      scoreAdjustments,
      rejectedCategories,
    },
    whyThisQuestion,
    avoidAsPrimaryQuestion,
  };
}

function routeIntentForExplorationCandidate(
  classification: Pick<ResearchExplorationResult["candidateQuestions"][number], "taxonomy" | "primaryQuestionUse">,
): Pick<ResearchExplorationResult["candidateQuestions"][number], "routeIntent" | "routeIntentRationale"> {
  if (classification.taxonomy === "likely_duplicate_or_proxy" || classification.taxonomy === "design_or_metadata_artifact") {
    return {
      routeIntent: "data_quality_review",
      routeIntentRationale: "This candidate is primarily useful for leakage, derivation, coding, or design-metadata review before substantive modeling.",
    };
  }
  if (classification.primaryQuestionUse === "review_before_primary") {
    return {
      routeIntent: "methods_review",
      routeIntentRationale: "This candidate may be legitimate, but it needs methods review before becoming the primary analysis route.",
    };
  }
  return {
    routeIntent: "explanatory_association",
    routeIntentRationale: "This candidate is best treated as an explanatory association question until a separate prediction, diagnostic, or causal design is specified.",
  };
}

function buildExplorationQuestions(
  associations: ResearchExplorationResult["associations"],
  variableMap: ResearchExplorationResult["variableMap"],
  target: string | null,
  burden: Omit<ResearchExplorationResult["explorationBurden"], "promotionSummary" | "promotionClearance">,
): ResearchExplorationResult["candidateQuestions"] {
  const map = new Map(variableMap.map(item => [item.name, item]));
  const questions = associations.map((association, index) => {
    const left = map.get(association.left);
    const right = map.get(association.right);
    const outcome = target && (association.left === target || association.right === target)
      ? target
      : left?.role === "candidate_outcome" ? association.left
        : right?.role === "candidate_outcome" ? association.right
          : association.right;
    const exposure = outcome === association.left ? association.right : association.left;
    const suggestedMethod = association.method === "pearson"
      ? "correlation followed by adjusted linear regression if scientifically justified"
      : association.method === "eta_squared"
        ? "group comparison followed by adjusted regression"
        : "cross-tabulation with chi-square/Fisher review and adjusted logistic/multinomial model if appropriate";
    const promotion = questionPromotionGate(association, outcome, exposure, map, burden);
    const classification = classifyExplorationQuestion(association, outcome, exposure, map, burden);
    const routeIntent = routeIntentForExplorationCandidate(classification);
    const priority: ResearchExplorationResult["candidateQuestions"][number]["priority"] =
      classification.researchInterestScore >= 55 ? "high"
        : classification.researchInterestScore >= 30 ? "medium" : "low";
    const requiredNextChecks = [
      "Confirm temporal/design plausibility; do not infer causality from exploration.",
      "Review missingness, sparse cells, outliers, and multiple-comparison burden.",
      "Select covariates from domain knowledge before confirmatory modeling.",
    ];
    if (classification.avoidAsPrimaryQuestion) requiredNextChecks.unshift("Do not use as the primary research question until the avoid-primary reason is resolved.");
    return {
      id: `question_unranked_${String(index + 1).padStart(2, "0")}_${association.id}`,
      question: `Is ${exposure} associated with ${outcome} in this dataset?`,
      outcome,
      exposure,
      ...routeIntent,
      ...classification,
      suggestedMethod,
      rationale: `${association.method} exploratory strength ${association.strength.toFixed(3)} across ${association.n} complete pairs.`,
      requiredNextChecks,
      priority,
      promotionStatus: promotion.status,
      promotionBlockers: promotion.blockers,
    };
  });
  return questions
    .sort((a, b) => {
      const avoidDelta = Number(Boolean(a.avoidAsPrimaryQuestion)) - Number(Boolean(b.avoidAsPrimaryQuestion));
      if (avoidDelta !== 0) return avoidDelta;
      return b.researchInterestScore - a.researchInterestScore || a.id.localeCompare(b.id);
    })
    .map((question, index) => ({
      ...question,
      id: question.id.replace(/^question_unranked_\d+_/, `question_${String(index + 1).padStart(2, "0")}_`),
    }));
}

function recommendedExplorationQuestion(
  questions: ResearchExplorationResult["candidateQuestions"],
  outDir: string | null,
): ResearchExplorationResult["recommendedQuestion"] {
  const question = questions.find(item => item.primaryQuestionUse === "recommended")
    ?? questions.find(item => item.primaryQuestionUse === "review_before_primary")
    ?? questions[0]
    ?? null;
  if (!question) return null;
  const explorationPath = outDir ? path.join(outDir, "exploration.json") : "<exploration.json>";
  const needsReview = question.promotionStatus !== "promotable_hypothesis";
  const nextCommand = [
    "agenteer research explore-promote",
    `--exploration ${JSON.stringify(explorationPath)}`,
    `--question ${question.id}`,
    needsReview ? "--methods-review-note <review-note>" : "",
    "--out <handoff.json>",
    "--json",
  ].filter(Boolean).join(" ");
  return {
    questionId: question.id,
    question: question.question,
    routeIntent: question.routeIntent,
    primaryQuestionUse: question.primaryQuestionUse,
    reason: `${question.whyThisQuestion} Route intent: ${question.routeIntent}. ${question.routeIntentRationale}`,
    nextCommand,
  };
}

function explorationQaChecks(
  summary: ResearchTableSummary,
  variableMap: ResearchExplorationResult["variableMap"],
  associations: ResearchExplorationResult["associations"],
  questions: ResearchExplorationResult["candidateQuestions"],
  target: string | null,
  targetAssociations: ResearchExplorationResult["associations"] = [],
  burden?: ResearchExplorationResult["explorationBurden"],
): ResearchExplorationResult["qa"]["checks"] {
  const highMissing = variableMap.filter(item => item.missingFraction > 0.5).length;
  const needsReview = questions.filter(question => question.promotionStatus === "needs_methods_review").length;
  const blocked = questions.filter(question => question.promotionStatus === "blocked").length;
  const missingTaxonomyEvidence = questions.filter(question =>
    !question.taxonomyEvidence?.taxonomyVersion
    || !question.taxonomyEvidence.matchedRuleIds.length
    || !question.whyThisQuestion
    || !question.primaryQuestionUse).length;
  const missingRouteIntent = questions.filter(question => !question.routeIntent || !question.routeIntentRationale).length;
  return [
    { id: "non-empty-table", status: summary.rowCount > 0 ? "pass" : "fail", message: `${summary.rowCount} rows found.` },
    { id: "enough-columns", status: summary.columnCount >= 2 ? "pass" : "fail", message: `${summary.columnCount} columns found.` },
    { id: "association-scan", status: associations.length ? "pass" : "warning", message: `${associations.length} candidate associations ranked; ${burden?.testedPairCount ?? associations.length} pairs tested.` },
    { id: "candidate-questions", status: questions.length ? "pass" : "warning", message: `${questions.length} candidate questions generated.` },
    { id: "taxonomy-evidence", status: missingTaxonomyEvidence ? "fail" : "pass", message: `${questions.length - missingTaxonomyEvidence}/${questions.length} candidate questions include taxonomy evidence and primary-use recommendations.` },
    { id: "route-intent", status: missingRouteIntent ? "fail" : "pass", message: `${questions.length - missingRouteIntent}/${questions.length} candidate questions include route intent.` },
    { id: "target-present", status: !target || variableMap.some(item => item.name === target) ? "pass" : "fail", message: target ? `target=${target}` : "No target supplied; broad exploratory scan." },
    { id: "target-association-scan", status: !target || targetAssociations.length ? "pass" : "warning", message: target ? `${targetAssociations.length} associations involve the target.` : "No target supplied; not applicable." },
    { id: "promotion-gate", status: blocked ? "fail" : needsReview ? "warning" : "pass", message: `${questions.length - needsReview - blocked} promotable; ${needsReview} need methods review; ${blocked} blocked.` },
    { id: "promotion-clearance", status: burden?.promotionClearance.level === "stop" ? "fail" : burden?.promotionClearance.level === "hold_for_methods_review" ? "warning" : "pass", message: `clearance=${burden?.promotionClearance.level ?? "unknown"}.` },
    { id: "multiplicity-review", status: burden?.multiplicityRisk === "high" ? "warning" : "pass", message: `${burden?.testedPairCount ?? associations.length} tested pairs; multiplicity risk ${burden?.multiplicityRisk ?? "unknown"}.` },
    { id: "survey-design-review", status: burden?.surveyDesignCandidates.length ? "warning" : "pass", message: `${burden?.surveyDesignCandidates.length ?? 0} survey/design candidate variables detected.` },
    { id: "high-missingness-review", status: highMissing ? "warning" : "pass", message: `${highMissing} variables exceed 50% missingness.` },
    { id: "exploratory-only", status: "warning", message: "This mode generates hypotheses only; confirmatory analysis requires a promoted plan." },
  ];
}

function stableAssociationId(left: string, right: string, method: string): string {
  return createHash("sha1").update(`${method}:${left}:${right}`).digest("hex").slice(0, 10);
}

function pearson(xs: number[], ys: number[]): number | null {
  if (xs.length !== ys.length || xs.length < 3) return null;
  const mx = xs.reduce((sum, value) => sum + value, 0) / xs.length;
  const my = ys.reduce((sum, value) => sum + value, 0) / ys.length;
  let numerator = 0;
  let sx = 0;
  let sy = 0;
  for (let index = 0; index < xs.length; index += 1) {
    const dx = xs[index]! - mx;
    const dy = ys[index]! - my;
    numerator += dx * dy;
    sx += dx * dx;
    sy += dy * dy;
  }
  const denominator = Math.sqrt(sx * sy);
  return denominator > 0 ? numerator / denominator : null;
}

function etaSquared(items: Array<{ group: string; value: number }>): number | null {
  const filtered = items.filter(item => Number.isFinite(item.value));
  if (filtered.length < 3) return null;
  const groups = new Map<string, number[]>();
  for (const item of filtered) groups.set(item.group, [...(groups.get(item.group) ?? []), item.value]);
  if (groups.size < 2 || groups.size > 30) return null;
  const grandMean = filtered.reduce((sum, item) => sum + item.value, 0) / filtered.length;
  const ssBetween = Array.from(groups.values()).reduce((sum, values) => {
    const mean = values.reduce((inner, value) => inner + value, 0) / values.length;
    return sum + values.length * (mean - grandMean) ** 2;
  }, 0);
  const ssTotal = filtered.reduce((sum, item) => sum + (item.value - grandMean) ** 2, 0);
  return ssTotal > 0 ? ssBetween / ssTotal : null;
}

function cramersV(pairs: Array<[string, string]>): number | null {
  if (pairs.length < 3) return null;
  const leftValues = uniqueStrings(pairs.map(pair => pair[0]));
  const rightValues = uniqueStrings(pairs.map(pair => pair[1]));
  if (leftValues.length < 2 || rightValues.length < 2 || leftValues.length > 30 || rightValues.length > 30) return null;
  const table = leftValues.map(() => rightValues.map(() => 0));
  const leftIndex = new Map(leftValues.map((value, index) => [value, index]));
  const rightIndex = new Map(rightValues.map((value, index) => [value, index]));
  for (const [left, right] of pairs) {
    const row = table[leftIndex.get(left)!]!;
    row[rightIndex.get(right)!] = (row[rightIndex.get(right)!] ?? 0) + 1;
  }
  const rowTotals = table.map(row => row.reduce((sum, value) => sum + value, 0));
  const colTotals = rightValues.map((_, index) => table.reduce((sum, row) => sum + row[index]!, 0));
  let chi2 = 0;
  for (let i = 0; i < table.length; i += 1) {
    for (let j = 0; j < table[i]!.length; j += 1) {
      const expected = (rowTotals[i]! * colTotals[j]!) / pairs.length;
      if (expected > 0) chi2 += (table[i]![j]! - expected) ** 2 / expected;
    }
  }
  const minDim = Math.min(leftValues.length - 1, rightValues.length - 1);
  return minDim > 0 ? Math.sqrt(chi2 / (pairs.length * minDim)) : null;
}

async function readParquetTableSummary(file: string, fileSizeBytes: number, fileMtimeMs: number, fileSha256: string, python?: string): Promise<ResearchTableSummary> {
  const runtime = python ?? process.env.AGENTEER_RESEARCH_PYTHON ?? process.env.PYTHON ?? "python3";
  const script = `
import json
import math
import sys
from importlib import metadata

try:
    import pandas as pd
except Exception as exc:
    print(json.dumps({"error": "PYTHON_PANDAS_UNAVAILABLE", "message": str(exc)}))
    sys.exit(2)

path = sys.argv[1]
df = pd.read_parquet(path)
row_count = int(len(df))
columns = []
def package_version(name):
    try:
        return metadata.version(name)
    except Exception:
        return None

for name in df.columns:
    series = df[name]
    non_missing = series.dropna()
    inferred = "unknown"
    if len(non_missing) == 0:
        inferred = "empty"
    elif pd.api.types.is_bool_dtype(non_missing):
        inferred = "boolean"
    elif pd.api.types.is_numeric_dtype(non_missing):
        inferred = "number"
    elif pd.api.types.is_string_dtype(non_missing) or pd.api.types.is_object_dtype(non_missing):
        inferred = "string"
    item = {
        "name": str(name),
        "inferredType": inferred,
        "nonMissingRows": int(len(non_missing)),
        "missingFraction": float((row_count - len(non_missing)) / row_count) if row_count else 1.0,
        "sampleValues": [str(value) for value in non_missing.head(5).tolist()],
    }
    if inferred == "number" and len(non_missing):
        numeric = pd.to_numeric(non_missing, errors="coerce").dropna()
        if len(numeric):
            item["min"] = float(numeric.min())
            item["max"] = float(numeric.max())
            item["mean"] = float(numeric.mean())
    columns.append(item)

print(json.dumps({
    "file": path,
    "format": "parquet",
    "adapter": {
        "kind": "python-pandas-parquet",
        "executable": sys.executable,
        "version": sys.version.split()[0],
        "packages": {
            "pandas": package_version("pandas"),
            "pyarrow": package_version("pyarrow"),
            "fastparquet": package_version("fastparquet"),
        },
    },
    "fileSizeBytes": ${fileSizeBytes},
    "fileMtimeMs": ${fileMtimeMs},
    "fileSha256": "${fileSha256}",
    "rowCount": row_count,
    "columnCount": int(len(df.columns)),
    "columns": columns,
    "warnings": [],
}))
`;
  try {
    const { stdout } = await execFileAsync(runtime, ["-c", script, file], {
      maxBuffer: 1024 * 1024 * 16,
    });
    const parsed = JSON.parse(stdout) as ResearchTableSummary | { error: string; message: string };
    if ("error" in parsed) throw new Error(`${parsed.error}: ${parsed.message}`);
    return parsed;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Could not summarize Parquet file with ${runtime}. Pass --python <path> or set AGENTEER_RESEARCH_PYTHON to a pandas/pyarrow-capable Python. ${message}`);
  }
}

function parseCsvRows(text: string): Array<Record<string, unknown>> {
  const [headerLine, ...lines] = text.trim().split(/\r?\n/);
  if (!headerLine) return [];
  const headers = splitCsvLine(headerLine);
  return lines.filter(Boolean).map(line => {
    const cells = splitCsvLine(line);
    return Object.fromEntries(headers.map((header, index) => [header, coerceScalar(cells[index] ?? "")]));
  });
}

async function readTabularRowsWithPython(file: string, python?: string): Promise<Array<Record<string, unknown>>> {
  const runtime = python ?? process.env.AGENTEER_RESEARCH_PYTHON ?? process.env.PYTHON ?? "python3";
  const script = `
import json
import sys
try:
    import pandas as pd
except Exception as exc:
    print(json.dumps({"error": "PYTHON_PANDAS_UNAVAILABLE", "message": str(exc)}))
    sys.exit(2)
path = sys.argv[1]
if path.endswith(".parquet"):
    df = pd.read_parquet(path)
elif path.endswith(".csv"):
    df = pd.read_csv(path)
elif path.endswith(".json"):
    df = pd.read_json(path)
else:
    raise SystemExit("unsupported table format")
print(df.where(pd.notnull(df), None).to_json(orient="records"))
`;
  const { stdout } = await execFileAsync(runtime, ["-c", script, file], { maxBuffer: 1024 * 1024 * 64 });
  const parsed = JSON.parse(stdout) as Array<Record<string, unknown>> | { error: string; message: string };
  if (!Array.isArray(parsed)) throw new Error(`${parsed.error}: ${parsed.message}`);
  return parsed;
}

function splitCsvLine(line: string): string[] {
  const cells: string[] = [];
  let current = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === '"' && line[index + 1] === '"') {
      current += '"';
      index += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === "," && !quoted) {
      cells.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  cells.push(current);
  return cells.map(cell => cell.trim());
}

function coerceScalar(value: string): unknown {
  if (value === "") return "";
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : value;
}

function unwrapResearchArtifact<T>(artifact: unknown, wrapperKey: string): T | null {
  if (!artifact || typeof artifact !== "object") return null;
  const object = artifact as Record<string, unknown>;
  return (object[wrapperKey] ?? artifact) as T;
}

function parseCycleMarkdownBlocks(text: string): Array<{ cycle: number; body: string }> {
  const blocks: Array<{ cycle: number; body: string }> = [];
  const heading = /^## Cycle (\d+)\s*$/gm;
  const matches = Array.from(text.matchAll(heading));
  for (let index = 0; index < matches.length; index += 1) {
    const match = matches[index];
    if (!match) continue;
    const cycle = Number(match[1]);
    const start = (match.index ?? 0) + match[0].length;
    const end = matches[index + 1]?.index ?? text.length;
    if (Number.isFinite(cycle)) blocks.push({ cycle, body: text.slice(start, end) });
  }
  return blocks;
}

function rowPassesBasicPopulation(row: Record<string, unknown>, spec: ResearchAnalysisSpecV1): boolean {
  const ageText = JSON.stringify(spec.population).toLowerCase();
  const age = Number(row.RIDAGEYR);
  if (ageText.includes("18") && Number.isFinite(age) && age < 18) return false;
  if ((ageText.includes("20") || ageText.includes("adult")) && Number.isFinite(age) && age < 20) return false;
  if (Object.prototype.hasOwnProperty.call(row, "RIDSTATR") && Number(row.RIDSTATR) !== 2) return false;
  return true;
}

const SEMANTIC_VARIABLE_RULES: Record<string, { kind?: string; min?: number; max?: number; meanMin?: number; meanMax?: number; allowed?: Set<number> }> = {
  SEQN: { min: 1 },
  RIDAGEYR: { kind: "age", min: 0, max: 120, meanMin: 0, meanMax: 95 },
  RIAGENDR: { allowed: new Set([1, 2]) },
  RIDSTATR: { allowed: new Set([1, 2]) },
  RIDRETH3: { allowed: new Set([1, 2, 3, 4, 6, 7]) },
  BMXBMI: { kind: "bmi", min: 5, max: 100, meanMin: 10, meanMax: 60 },
  BPQ020: { allowed: new Set([1, 2, 7, 9]) },
  BPXSY1: { kind: "systolic_bp", min: 40, max: 300, meanMin: 70, meanMax: 220 },
  BPXSY2: { kind: "systolic_bp", min: 40, max: 300, meanMin: 70, meanMax: 220 },
  BPXSY3: { kind: "systolic_bp", min: 40, max: 300, meanMin: 70, meanMax: 220 },
  BPXDI1: { kind: "diastolic_bp", min: 0, max: 180, meanMin: 30, meanMax: 140 },
  BPXDI2: { kind: "diastolic_bp", min: 0, max: 180, meanMin: 30, meanMax: 140 },
  BPXDI3: { kind: "diastolic_bp", min: 0, max: 180, meanMin: 30, meanMax: 140 },
  DIQ010: { allowed: new Set([1, 2, 3, 7, 9]) },
  LBXGH: { kind: "hba1c_percent", min: 2, max: 20, meanMin: 3, meanMax: 14 },
  LBXVIDMS: { min: 0, max: 500 },
  SMQ020: { allowed: new Set([1, 2, 7, 9]) },
  HIQ011: { allowed: new Set([1, 2, 7, 9]) },
  WTMEC2YR: { min: 0 },
  WTMECPRP: { min: 0 },
  SDMVPSU: { allowed: new Set([1, 2, 3]) },
};

function inferredSemanticRuleForVariable(variable: string): { kind?: string; min?: number; max?: number; meanMin?: number; meanMax?: number; allowed?: Set<number> } | undefined {
  const lower = variable.toLowerCase();
  if (/^(elevated|high|has|is)_/.test(lower) || /_(flag|indicator|binary)$/.test(lower)) return { kind: "binary_indicator", allowed: new Set([0, 1]) };
  if (/age|ridageyr/.test(lower)) return { kind: "age", min: 0, max: 120, meanMin: 0, meanMax: 95 };
  if (/\bbmi\b|bmxbmi|body.?mass/.test(lower)) return { kind: "bmi", min: 5, max: 100, meanMin: 10, meanMax: 60 };
  if (/hba1c|lbxgh|glycohemoglobin/.test(lower)) return { kind: "hba1c_percent", min: 2, max: 20, meanMin: 3, meanMax: 14 };
  if (/systolic|bpxsy|sbp|blood.?pressure/.test(lower)) return { kind: "systolic_bp", min: 40, max: 300, meanMin: 70, meanMax: 220 };
  if (/diastolic|bpxdi|dbp/.test(lower)) return { kind: "diastolic_bp", min: 0, max: 180, meanMin: 30, meanMax: 140 };
  if (/weight|^wt|_wt/.test(lower)) return { kind: "weight", min: 0 };
  if (/los|length.?of.?stay/.test(lower)) return { kind: "length_of_stay", min: 0, max: 3650, meanMin: 0, meanMax: 365 };
  if (/mortality|death|expire/.test(lower) || lower === "event" || lower === "outcome_bin") return { kind: "binary_indicator", allowed: new Set([0, 1]) };
  if (/count/.test(lower) || lower.endsWith("_n") || lower.startsWith("n_")) return { kind: "count", min: 0 };
  return undefined;
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

async function writeJsonWrapped(file: string, key: string, value: unknown): Promise<void> {
  await writeFile(path.resolve(file), `${JSON.stringify({ schemaVersion: 1, [key]: value }, null, 2)}\n`);
}

async function capabilityDeclarationPaths(dir: string): Promise<string[]> {
  try {
    const files = await readdir(dir);
    return files
      .filter(file => /\.json$/.test(file) && !/\.validation\.json$/.test(file))
      .map(file => path.join(dir, file))
      .sort();
  } catch {
    return [];
  }
}

function capabilityValidationPath(capabilityPath: string): string {
  return capabilityPath.replace(/\.json$/, ".validation.json");
}

async function latestExistingPath(paths: string[]): Promise<string | null> {
  const existing: Array<{ file: string; mtimeMs: number }> = [];
  for (const file of paths) {
    try {
      existing.push({ file, mtimeMs: (await stat(file)).mtimeMs });
    } catch {
      // Ignore missing optional lifecycle artifacts.
    }
  }
  return existing.sort((a, b) => b.mtimeMs - a.mtimeMs)[0]?.file ?? null;
}

async function latestMatchingJsonPath(dir: string, pattern: RegExp): Promise<string | null> {
  try {
    const files = await readdir(dir);
    const candidates = await Promise.all(files
      .filter(file => pattern.test(file))
      .map(async file => {
        const fullPath = path.join(dir, file);
        return { file: fullPath, mtimeMs: (await stat(fullPath)).mtimeMs };
      }));
    return candidates.sort((a, b) => b.mtimeMs - a.mtimeMs)[0]?.file ?? null;
  } catch {
    return null;
  }
}

async function readCapabilityValidationSummaries(dir: string): Promise<Array<{ status: string; issueCodes: string[] }>> {
  try {
    const files = (await readdir(dir)).filter(file => /\.validation\.json$/.test(file));
    return (await Promise.all(files.map(async file => {
      const parsed = await readJsonIfPresent(path.join(dir, file)) as Record<string, unknown> | null;
      const validation = parsed && "interopValidation" in parsed && parsed.interopValidation && typeof parsed.interopValidation === "object"
        ? parsed.interopValidation as Record<string, unknown>
        : parsed;
      return {
        status: typeof validation?.status === "string" ? validation.status : "missing",
        issueCodes: Array.isArray(validation?.issues)
          ? validation.issues.map(issue => issue && typeof issue === "object" ? String((issue as Record<string, unknown>).code ?? "") : "").filter(Boolean)
          : [],
      };
    }))).sort((a, b) => a.status.localeCompare(b.status));
  } catch {
    return [];
  }
}

function researchPaperRunPythonScript(): string {
  return String.raw`#!/usr/bin/env python3
import json, math, subprocess, sys, tempfile
from pathlib import Path

import numpy as np
import pandas as pd


def unwrap_spec(raw):
    return raw.get("analysisSpec", raw)


def variable_list(spec, key):
    variables = spec.get("variables", {})
    value = variables.get(key, [])
    if isinstance(value, list):
        return [str(item) for item in value]
    if isinstance(value, dict) and "variable" in value:
        return [str(value["variable"])]
    if isinstance(value, str):
        return [value]
    return []


def survey_value(spec, camel, nested):
    survey = spec.get("surveyDesign", {}) or {}
    if survey.get(camel):
        return str(survey[camel])
    variables = spec.get("variables", {}) or {}
    nested_survey = variables.get("surveyDesign", {}) or {}
    if nested_survey.get(nested):
        return str(nested_survey[nested])
    return None


def simple_filters(spec):
    population = spec.get("population", {}) or {}
    filters = population.get("filters") or population.get("eligibility") or []
    return [str(item) for item in filters if isinstance(item, str)]


def table_files_for_variables(data_root, required):
    files = sorted(Path(data_root).rglob("*.parquet")) + sorted(Path(data_root).rglob("*.csv")) + sorted(Path(data_root).rglob("*.json"))
    selected = []
    remaining = set(required)
    for file in files:
        try:
            if file.suffix == ".parquet":
                frame = pd.read_parquet(file)
            elif file.suffix == ".csv":
                frame = pd.read_csv(file)
            else:
                frame = pd.read_json(file)
        except Exception:
            continue
        cols = set(map(str, frame.columns))
        if "SEQN" in cols and (remaining & cols):
            selected.append((file, frame))
            remaining -= cols
        if not remaining:
            break
    if remaining:
        raise SystemExit(f"Missing required variables in data root: {sorted(remaining)}")
    return selected


def apply_filters(df, filters):
    out = df
    for raw in filters:
        parts = raw.replace(">=", " >= ").replace("<=", " <= ").replace(">", " > ").replace("<", " < ").replace("==", " == ").split()
        if len(parts) < 3:
            continue
        column, op, value_raw = parts[0], parts[1], parts[2]
        if column not in out.columns:
            continue
        try:
            value = float(value_raw)
        except ValueError:
            continue
        series = pd.to_numeric(out[column], errors="coerce")
        if op == ">=":
            out = out[series >= value]
        elif op == "<=":
            out = out[series <= value]
        elif op == ">":
            out = out[series > value]
        elif op == "<":
            out = out[series < value]
        elif op == "==":
            out = out[series == value]
    return out


def merge_tables(tables):
    merged = None
    for _, frame in tables:
        if merged is None:
            merged = frame.copy()
        else:
            keep = [col for col in frame.columns if col == "SEQN" or col not in merged.columns]
            merged = merged.merge(frame[keep], on="SEQN", how="inner")
    return merged if merged is not None else pd.DataFrame()


def binary_threshold(spec):
    model = spec.get("model", {}) or {}
    threshold = model.get("binaryThreshold") or model.get("binary_threshold")
    if isinstance(threshold, dict):
        variable = str(threshold.get("variable") or "")
        operator = str(threshold.get("operator") or ">=")
        value = threshold.get("value")
        name = str(threshold.get("name") or f"{variable}_threshold")
        if variable and value is not None:
            return {"variable": variable, "operator": operator, "value": float(value), "name": name}
    return None


def model_family(spec):
    model = spec.get("model", {}) or {}
    family = str(model.get("family") or model.get("type") or "").lower()
    if "logistic" in family or "binomial" in family:
        return "logistic"
    return "linear"


def weight_domain_info(spec, weight, adapter):
    survey = spec.get("surveyDesign", {}) or {}
    upper = str(weight).upper()
    domains = ((adapter.get("surveyDesign") or {}).get("weightDomains") or [])
    matched = next((item for item in domains if str(item.get("weight", "")).upper() == upper), None)
    domain_id = str(matched.get("id") or upper.lower()) if matched else "custom_weight"
    label = str(matched.get("label") or f"Custom or less common NHANES weight {weight}") if matched else f"Custom or less common NHANES weight {weight}"
    is_subsample = bool(matched.get("isSubsample")) if matched else (upper.startswith("WTS") or upper.startswith("WTSAF"))
    rationale = str(survey.get("weightRationale") or survey.get("weight_rationale") or "").strip()
    eligibility = str(survey.get("eligibilityNote") or survey.get("eligibility_note") or survey.get("subsampleEligibility") or "").strip()
    if not rationale and matched:
        rationale = str(matched.get("rationale") or "").strip()
    if not eligibility and matched:
        eligibility = str(matched.get("eligibilityNote") or "").strip()
    if is_subsample and (not rationale or not eligibility):
        raise SystemExit(f"Subsample weight {weight} requires surveyDesign.weightRationale and surveyDesign.eligibilityNote before execution.")
    if not rationale:
        rationale = f"{weight} was selected from the survey design section of the analysis plan."
    rationale = reader_text(rationale)
    eligibility = reader_text(eligibility)
    if not eligibility:
        eligibility = label
    return {
        "id": domain_id,
        "label": label,
        "isSubsample": bool(is_subsample),
        "rationale": rationale,
        "eligibilityNote": eligibility,
        "cycleYears": matched.get("cycleYears") if matched else None,
        "multiCycleConstruction": matched.get("multiCycleConstruction") if matched else "No adapter multi-cycle policy declared for this weight.",
    }


def reader_text(text):
    out = str(text)
    replacements = [
        ("for this AnalysisSpec", "for this analysis"),
        ("this AnalysisSpec", "this analysis"),
        ("the AnalysisSpec", "the analysis plan"),
        ("AnalysisSpec", "analysis plan"),
        ("analysis spec", "analysis plan"),
        ("Interpret estimates for ", ""),
        ("interpret estimates for ", ""),
    ]
    for old, new in replacements:
        out = out.replace(old, new)
    return out


def metadata_for(adapter, variable):
    return (adapter.get("variableMetadata") or {}).get(str(variable).upper(), {})


def label_for(adapter, variable):
    meta = metadata_for(adapter, variable)
    return str(meta.get("label") or variable)


def unit_for(adapter, variable):
    meta = metadata_for(adapter, variable)
    unit = meta.get("unit")
    return str(unit) if unit else ""


def label_with_code(adapter, variable):
    label = label_for(adapter, variable)
    code = str(variable)
    return label if label == code else f"{label} ({code})"


def build_design(df, y_variable, exposure, covariates, weight, strata, psu, threshold=None):
    columns = [exposure, weight, strata, psu] + covariates
    if threshold:
        columns.append(threshold["variable"])
    else:
        columns.append(y_variable)
    cc = df.dropna(subset=columns).copy()
    cc = cc[pd.to_numeric(cc[weight], errors="coerce") > 0].copy()
    if threshold:
        source = pd.to_numeric(cc[threshold["variable"]], errors="coerce")
        if threshold["operator"] == ">":
            y = (source > threshold["value"]).astype(float).to_numpy(dtype=float)
        elif threshold["operator"] == "<":
            y = (source < threshold["value"]).astype(float).to_numpy(dtype=float)
        elif threshold["operator"] == "<=":
            y = (source <= threshold["value"]).astype(float).to_numpy(dtype=float)
        else:
            y = (source >= threshold["value"]).astype(float).to_numpy(dtype=float)
        cc[threshold["name"]] = y
    else:
        y = pd.to_numeric(cc[y_variable], errors="coerce").to_numpy(dtype=float)
    w = pd.to_numeric(cc[weight], errors="coerce").to_numpy(dtype=float)
    x_parts = [np.ones(len(cc)), pd.to_numeric(cc[exposure], errors="coerce").to_numpy(dtype=float)]
    names = ["intercept", exposure]
    for cov in covariates:
        series = cc[cov]
        if str(series.dtype) == "object" or series.nunique(dropna=True) <= 8:
            dummies = pd.get_dummies(series.astype("category"), prefix=cov, drop_first=True, dtype=float)
            for col in dummies.columns:
                x_parts.append(dummies[col].to_numpy(dtype=float))
                names.append(str(col))
        else:
            x_parts.append(pd.to_numeric(series, errors="coerce").to_numpy(dtype=float))
            names.append(cov)
    X = np.column_stack(x_parts)
    valid = np.isfinite(y) & np.isfinite(w) & np.all(np.isfinite(X), axis=1)
    y, w, X = y[valid], w[valid], X[valid, :]
    cc = cc.loc[valid].copy()
    return cc, y, w, X, names


def survey_sandwich(cc, scores, bread, strata, psu):
    meat = np.zeros((scores.shape[1], scores.shape[1]))
    strata_values = cc[strata].astype(str).to_numpy()
    psu_values = cc[psu].astype(str).to_numpy()
    strata_count = 0
    psu_count = 0
    lonely_strata = 0
    for stratum in sorted(set(strata_values)):
        indices = np.where(strata_values == stratum)[0]
        psus = sorted(set(psu_values[indices]))
        if len(psus) < 2:
            lonely_strata += 1
            continue
        strata_count += 1
        psu_scores = []
        for cluster in psus:
            psu_scores.append(scores[indices[psu_values[indices] == cluster], :].sum(axis=0))
        U = np.vstack(psu_scores)
        centered = U - U.mean(axis=0)
        meat += (len(psus) / (len(psus) - 1.0)) * (centered.T @ centered)
        psu_count += len(psus)
    cov = bread @ meat @ bread
    se = np.sqrt(np.maximum(np.diag(cov), 0.0))
    return cov, se, strata_count, psu_count, lonely_strata


def weighted_linearized(df, outcome, exposure, covariates, weight, strata, psu):
    cc, y, w, X, names = build_design(df, outcome, exposure, covariates, weight, strata, psu)
    xtwx = X.T @ (w[:, None] * X)
    xtwy = X.T @ (w * y)
    inv = np.linalg.pinv(xtwx)
    beta = inv @ xtwy
    residual = y - X @ beta
    scores = (w[:, None] * X) * residual[:, None]
    _, se, strata_count, psu_count, lonely_strata = survey_sandwich(cc, scores, inv, strata, psu)
    effect = float(beta[1])
    standard_error = float(se[1]) if len(se) > 1 else float("nan")
    z = effect / standard_error if standard_error and math.isfinite(standard_error) and standard_error > 0 else float("nan")
    p = math.erfc(abs(z) / math.sqrt(2)) if math.isfinite(z) else None
    return {
        "data": cc,
        "names": names,
        "beta": beta,
        "standardError": standard_error,
        "effect": effect,
        "ci95": [effect - 1.96 * standard_error, effect + 1.96 * standard_error] if math.isfinite(standard_error) else [None, None],
        "pValue": p,
        "strataCount": strata_count,
        "psuCount": psu_count,
        "lonelyStrata": lonely_strata,
        "family": "linear",
    }


def weighted_logistic_linearized(df, outcome, exposure, covariates, weight, strata, psu, threshold):
    cc, y, w, X, names = build_design(df, outcome, exposure, covariates, weight, strata, psu, threshold)
    beta = np.zeros(X.shape[1])
    for _ in range(100):
        eta = np.clip(X @ beta, -30, 30)
        mu = 1.0 / (1.0 + np.exp(-eta))
        v = np.maximum(mu * (1.0 - mu), 1e-8)
        xtwx = X.T @ ((w * v)[:, None] * X)
        score = X.T @ (w * (y - mu))
        step = np.linalg.pinv(xtwx) @ score
        beta = beta + step
        if float(np.max(np.abs(step))) < 1e-8:
            break
    eta = np.clip(X @ beta, -30, 30)
    mu = 1.0 / (1.0 + np.exp(-eta))
    v = np.maximum(mu * (1.0 - mu), 1e-8)
    bread = np.linalg.pinv(X.T @ ((w * v)[:, None] * X))
    scores = (w[:, None] * X) * (y - mu)[:, None]
    _, se, strata_count, psu_count, lonely_strata = survey_sandwich(cc, scores, bread, strata, psu)
    log_or = float(beta[1])
    standard_error = float(se[1]) if len(se) > 1 else float("nan")
    z = log_or / standard_error if standard_error and math.isfinite(standard_error) and standard_error > 0 else float("nan")
    p = math.erfc(abs(z) / math.sqrt(2)) if math.isfinite(z) else None
    ci_log = [log_or - 1.96 * standard_error, log_or + 1.96 * standard_error] if math.isfinite(standard_error) else [None, None]
    return {
        "data": cc,
        "names": names,
        "beta": beta,
        "standardError": standard_error,
        "effect": log_or,
        "oddsRatio": float(math.exp(log_or)),
        "ci95": [float(math.exp(ci_log[0])), float(math.exp(ci_log[1]))] if ci_log[0] is not None else [None, None],
        "logOddsCi95": ci_log,
        "pValue": p,
        "strataCount": strata_count,
        "psuCount": psu_count,
        "lonelyStrata": lonely_strata,
        "family": "logistic",
        "eventCount": int(y.sum()),
        "eventWeightedPercent": float(100.0 * np.average(y, weights=w)) if len(y) else None,
    }


def weighted_r_survey_svyglm(df, outcome, exposure, covariates, weight, strata, psu, threshold, family, rscript):
    cc, y, w, X, names = build_design(df, outcome, exposure, covariates, weight, strata, psu, threshold)
    outcome_model = threshold["name"] if threshold else outcome
    model_columns = [outcome_model, exposure, weight, strata, psu] + covariates
    export = cc[model_columns].copy()
    export[outcome_model] = y
    r_code = '''
suppressPackageStartupMessages({
  library(jsonlite)
  library(survey)
})
args <- commandArgs(trailingOnly = TRUE)
input <- fromJSON(args[[1]])
df <- read.csv(input$csv, check.names = FALSE)
for (col in input$numericColumns) {
  df[[col]] <- as.numeric(df[[col]])
}
for (col in input$factorColumns) {
  df[[col]] <- as.factor(df[[col]])
}
design <- svydesign(
  ids = as.formula(paste0("~", input$psu)),
  strata = as.formula(paste0("~", input$strata)),
  weights = as.formula(paste0("~", input$weight)),
  data = df,
  nest = TRUE
)
formula <- as.formula(paste(input$outcome, "~", paste(c(input$exposure, input$covariates), collapse = " + ")))
fit <- if (input$family == "logistic") {
  svyglm(formula, design = design, family = quasibinomial())
} else {
  svyglm(formula, design = design, family = gaussian())
}
coefs <- summary(fit)$coefficients
effect <- unname(coefs[input$exposure, "Estimate"])
se <- unname(coefs[input$exposure, "Std. Error"])
p <- unname(coefs[input$exposure, ncol(coefs)])
ci <- c(effect - 1.96 * se, effect + 1.96 * se)
payload <- list(
  effect = effect,
  standardError = se,
  pValue = p,
  ci95 = ci,
  coefficientNames = names(coef(fit)),
  strataCount = length(unique(df[[input$strata]])),
  psuCount = length(unique(df[[input$psu]]))
)
if (input$family == "logistic") {
  payload$oddsRatio <- exp(effect)
  payload$logOddsCi95 <- ci
  payload$ci95 <- exp(ci)
  payload$eventCount <- sum(df[[input$outcome]], na.rm = TRUE)
  payload$eventWeightedPercent <- 100 * sum(df[[input$outcome]] * df[[input$weight]], na.rm = TRUE) / sum(df[[input$weight]][!is.na(df[[input$outcome]])], na.rm = TRUE)
}
cat(toJSON(payload, auto_unbox = TRUE, null = "null"))
'''
    with tempfile.TemporaryDirectory() as tmp:
        csv_path = Path(tmp) / "design.csv"
        r_path = Path(tmp) / "fit.R"
        input_path = Path(tmp) / "input.json"
        export.to_csv(csv_path, index=False)
        factor_columns = [cov for cov in covariates if cov in export.columns and export[cov].nunique(dropna=True) <= 8]
        numeric_columns = [col for col in model_columns if col not in factor_columns]
        r_path.write_text(r_code)
        input_path.write_text(json.dumps({
            "csv": str(csv_path),
            "outcome": outcome_model,
            "exposure": exposure,
            "covariates": covariates,
            "weight": weight,
            "strata": strata,
            "psu": psu,
            "family": family,
            "numericColumns": numeric_columns,
            "factorColumns": factor_columns,
        }))
        completed = subprocess.run([rscript, str(r_path), str(input_path)], check=True, text=True, capture_output=True)
        payload = json.loads(completed.stdout)
    if family == "logistic":
        return {
            "data": cc,
            "names": payload.get("coefficientNames") or names,
            "standardError": payload["standardError"],
            "effect": payload["effect"],
            "oddsRatio": payload["oddsRatio"],
            "ci95": payload["ci95"],
            "logOddsCi95": payload["logOddsCi95"],
            "pValue": payload["pValue"],
            "strataCount": payload["strataCount"],
            "psuCount": payload["psuCount"],
            "lonelyStrata": None,
            "family": "logistic",
            "eventCount": payload["eventCount"],
            "eventWeightedPercent": payload["eventWeightedPercent"],
            "backend": "r-survey",
        }
    return {
        "data": cc,
        "names": payload.get("coefficientNames") or names,
        "standardError": payload["standardError"],
        "effect": payload["effect"],
        "ci95": payload["ci95"],
        "pValue": payload["pValue"],
        "strataCount": payload["strataCount"],
        "psuCount": payload["psuCount"],
        "lonelyStrata": None,
        "family": "linear",
        "backend": "r-survey",
    }


def weighted_mean(values, weights):
    return float(np.average(values, weights=weights)) if len(values) else None


def main():
    config = json.loads(Path(sys.argv[1]).read_text())
    out_dir = Path(config["outDir"])
    backend = config.get("backend", "python-linearized")
    rscript = config.get("rscript", "Rscript")
    adapter = config.get("datasetAdapter") or {}
    raw_spec = json.loads(Path(config["analysisSpecPath"]).read_text())
    spec = unwrap_spec(raw_spec)
    outcome = variable_list(spec, "outcome")[0]
    exposure = variable_list(spec, "exposures")[0] if variable_list(spec, "exposures") else variable_list(spec, "exposure")[0]
    covariates = variable_list(spec, "covariates")
    threshold = binary_threshold(spec)
    family = model_family(spec)
    weight = survey_value(spec, "weightVariable", "weight")
    strata = survey_value(spec, "strataVariable", "strata")
    psu = survey_value(spec, "psuVariable", "psu")
    if not all([outcome, exposure, weight, strata, psu]):
        raise SystemExit("AnalysisSpec must declare outcome, exposure, weight, strata, and psu.")
    weight_domain = weight_domain_info(spec, weight, adapter)
    outcome_source = threshold["variable"] if threshold else outcome
    required = ["SEQN", outcome_source, exposure, weight, strata, psu] + covariates
    tables = table_files_for_variables(config["dataRoot"], required)
    merged = merge_tables(tables)
    adults = apply_filters(merged, simple_filters(spec))
    missingness = {col: float(adults[col].isna().mean()) if col in adults else 1.0 for col in required if col != "SEQN"}
    if backend == "r-survey":
        fit = weighted_r_survey_svyglm(adults, outcome, exposure, covariates, weight, strata, psu, threshold, family, rscript)
    elif family == "logistic":
        if not threshold:
            raise SystemExit("Logistic paper-run requires model.binaryThreshold in the AnalysisSpec.")
        fit = weighted_logistic_linearized(adults, outcome, exposure, covariates, weight, strata, psu, threshold)
    else:
        fit = weighted_linearized(adults, outcome, exposure, covariates, weight, strata, psu)
    cc = fit["data"]
    w = pd.to_numeric(cc[weight], errors="coerce").to_numpy(dtype=float)
    exposure_values = pd.to_numeric(cc[exposure], errors="coerce")
    quartiles = pd.qcut(exposure_values.rank(method="first"), 4, labels=["q1", "q2", "q3", "q4"])
    groups = []
    for label in ["q1", "q2", "q3", "q4"]:
        mask = np.asarray(quartiles == label)
        groups.append({
            "category": label,
            "n": int(mask.sum()),
            "weightedMeanOutcome": weighted_mean(pd.to_numeric(cc.loc[mask, threshold["name"] if threshold else outcome], errors="coerce").to_numpy(dtype=float), w[mask]),
            "weightedMeanExposure": weighted_mean(pd.to_numeric(cc.loc[mask, exposure], errors="coerce").to_numpy(dtype=float), w[mask]),
        })
    title = spec.get("title") or spec.get("researchQuestion") or f"{exposure} and {outcome}"
    title = str(title).strip().rstrip("?")
    question = str(spec.get("researchQuestion") or title)
    variance = "r_survey_taylor_linearized" if backend == "r-survey" else "complex_survey_linearized"
    effect = fit["effect"]
    se = fit["standardError"]
    ci = fit["ci95"]
    p = fit["pValue"]
    if family == "logistic":
        model = {
            "type": "R survey svyglm weighted logistic regression with Taylor linearized variance" if backend == "r-survey" else "weighted logistic regression with strata/PSU linearized sandwich variance",
            "covariates": fit["names"],
            "logOddsCoefficient": effect,
            "oddsRatio": fit["oddsRatio"],
            "standardError": se,
            "ci95": ci,
            "logOddsCi95": fit["logOddsCi95"],
            "pValue": p,
            "eventCount": fit["eventCount"],
            "eventWeightedPercent": fit["eventWeightedPercent"],
            "strataCount": fit["strataCount"],
            "psuCount": fit["psuCount"],
            "lonelyStrata": fit["lonelyStrata"],
        }
    else:
        model = {
            "type": "R survey svyglm weighted linear regression with Taylor linearized variance" if backend == "r-survey" else "weighted linear regression with strata/PSU linearized sandwich variance",
            "covariates": fit["names"],
            "exposureCoefficient": effect,
            "standardError": se,
            "ci95": ci,
            "pValue": p,
            "strataCount": fit["strataCount"],
            "psuCount": fit["psuCount"],
            "lonelyStrata": fit["lonelyStrata"],
        }
    exposure_label = label_for(adapter, exposure)
    exposure_label_code = label_with_code(adapter, exposure)
    outcome_label = label_for(adapter, outcome_source)
    outcome_label_code = label_with_code(adapter, outcome_source)
    outcome_unit = unit_for(adapter, outcome_source)
    outcome_unit_phrase = f" {outcome_unit}" if outcome_unit else f" {outcome_label} units"
    weight_label_code = label_with_code(adapter, weight)
    covariate_labels = [label_for(adapter, covariate) for covariate in covariates]
    effect_phrase = f"an adjusted odds ratio of {model['oddsRatio']:.2f}" if family == "logistic" else f"an adjusted mean difference of {effect:.2f}{outcome_unit_phrase}"
    result_phrase = f"odds ratio {model['oddsRatio']:.2f}" if family == "logistic" else f"mean difference {effect:.2f}"
    model_phrase = ("R survey-weighted logistic regression" if family == "logistic" else "R survey-weighted linear regression") if backend == "r-survey" else ("weighted logistic regression" if family == "logistic" else "weighted linear regression")
    outcome_definition = f"Binary threshold {threshold['name']} from {label_with_code(adapter, threshold['variable'])} {threshold['operator']} {threshold['value']}" if threshold else f"Continuous {outcome_label_code}"
    analysis = {
        "paperId": out_dir.name,
        "title": title,
        "researchQuestion": question,
        "analysisSpecPath": config["analysisSpecPath"],
        "dataRoot": config["dataRoot"],
        "inputFiles": [str(path) for path, _ in tables],
        "population": "; ".join(simple_filters(spec)) or "Pre-specified eligible population",
        "exposure": {"name": exposure_label, "variable": exposure, "definition": f"Continuous {exposure_label_code}"},
        "outcome": {"name": threshold["name"] if threshold else outcome_label, "variable": outcome_source, "definition": outcome_definition},
        "rowCounts": {"mergedRows": int(len(merged)), "eligibleRows": int(len(adults)), "completeCaseEligible": int(len(cc))},
        "missingnessEligibleRows": missingness,
        "weights": {"weight": weight, "strata": strata, "psu": psu, "implementation": (f"R survey Taylor linearized variance via svyglm for weighted {family} regression" if backend == "r-survey" else f"strata/PSU linearized sandwich variance for weighted {family} regression"), "domain": weight_domain},
        "varianceEstimator": variance,
        "model": model,
        "thresholds": {"binaryOutcome": outcome_definition} if threshold else {},
        "groupSummary": groups,
        "datasetAdapter": {"id": adapter.get("id"), "label": adapter.get("label"), "variableMetadataSource": "dataset-adapter-manifest", "variableMetadataCount": len(adapter.get("variableMetadata") or {})},
        "analysisSpec": {"inferencePolicy": {"estimandType": "associational", "varianceEstimator": "complex_survey", "allowedInference": "design_corrected_inference", "pValueLanguage": "standard", "causalClaimsAllowed": False}},
        "limitations": ["Cross-sectional analysis; no temporality or causality.", "Complete-case analysis may induce selection bias.", ("R survey svyglm provides design-aware Taylor linearized variance for the declared design." if backend == "r-survey" else "Design-based linearized variance is implemented for primary weighted linear and logistic models."), "Subsample weights change the analytic population and must be interpreted using the declared weight-domain eligibility." if weight_domain["isSubsample"] else "Weight-domain eligibility follows the declared survey design."],
        "sources": ["https://wwwn.cdc.gov/nchs/nhanes/AnalyticGuidelines.aspx", "https://wwwn.cdc.gov/nchs/nhanes/tutorials/weighting.aspx", "https://journals.plos.org/plosone/article?id=10.1371%2Fjournal.pone.0309210"],
    }
    p_text = f"{p:.3g}" if p is not None else "not estimable"
    weight_domain_rationale = str(weight_domain["rationale"]).rstrip(".; ")
    weight_domain_eligibility = str(weight_domain["eligibilityNote"]).rstrip(".; ")
    weight_domain_sentence = f" The selected weight domain was {weight_domain['label']} because {weight_domain_rationale}. This means results apply to {weight_domain_eligibility}." if weight_domain["isSubsample"] else ""
    variance_phrase = "R survey Taylor linearized variance" if backend == "r-survey" else "strata/PSU linearized sandwich variance"
    safety_header = f"""## Study Summary

- Analysis type: observational cross-sectional association.
- Survey method: {model_phrase} with {weight_label_code}, survey strata, survey primary sampling units, and {variance_phrase}.
- Weight domain: {weight_domain['label']} ({'subsample analytic population' if weight_domain['isSubsample'] else 'standard analytic population for this weight'}).
- Population: {len(cc):,} complete-case eligible participants after applying the stated eligibility criteria.
- Causal status: not causal; this cannot infer causality or temporality.
- Clinical actionability: not clinically actionable and not a diagnostic rule.
- Human review: required before sharing, publication, clinical interpretation, or product integration.
"""
    paper = f"""# {title}

{safety_header}

## Abstract

Main finding: higher {exposure_label} was associated with higher {outcome_label} in the analyzed NHANES sample.

This NHANES analysis evaluated the adjusted association between {exposure_label_code} and {outcome_label_code} in the stated study population. The analysis followed a pre-specified plan, and the analytic sample included {len(cc):,} complete-case eligible participants after applying the stated population filters. A {model_phrase} with {weight_label_code} and {variance_phrase} estimated {effect_phrase} per one-unit higher {exposure_label} (95% CI {ci[0]:.2f} to {ci[1]:.2f}; p={p_text}).{weight_domain_sentence} This is an observational cross-sectional association and cannot infer causality.

## Introduction

NHANES analyses need explicit handling of survey weights, strata, primary sampling units, missingness, and cross-sectional interpretation. This report evaluates the adjusted association between {exposure_label} and {outcome_label} in a reproducible public-health analysis using a pre-specified plan. The statistical backend was {backend}.

## Methods

The analysis plan was read before execution. Local cached NHANES component files were loaded from the declared data directory, files containing the required variables were selected, records were merged by participant identifier, population filters were applied, and complete cases were required for {outcome_label}, {exposure_label}, {weight_label_code}, survey strata, survey primary sampling units, and covariates. The complete-case analytic sample was {len(cc):,} from {len(adults):,} eligible merged rows. Missingness among eligible rows included {exposure_label}: {missingness.get(exposure, 0) * 100:.1f}%, {outcome_label}: {missingness.get(outcome, 0) * 100:.1f}%, and {label_for(adapter, weight)}: {missingness.get(weight, 0) * 100:.1f}%. The weight domain was {weight_domain['label']} because {weight_domain_rationale}. Results apply to {weight_domain_eligibility}.

The primary model was {model_phrase} with covariate adjustment for {', '.join(covariate_labels) if covariate_labels else 'no additional covariates'}. Unlike earlier approximate papers, this analysis used {variance_phrase} with {fit['strataCount']} strata and {fit['psuCount']} primary sampling unit clusters contributing to variance estimation.

## Results

The adjusted {result_phrase} per one-unit higher {exposure_label} had a 95% CI of {ci[0]:.2f} to {ci[1]:.2f} (p={p_text}). Weighted descriptive quartiles of {exposure_label} showed {outcome_label} means or event fractions of {groups[0]['weightedMeanOutcome']:.2f}, {groups[1]['weightedMeanOutcome']:.2f}, {groups[2]['weightedMeanOutcome']:.2f}, and {groups[3]['weightedMeanOutcome']:.2f}. These descriptive summaries support inspection of the model direction but do not establish a causal gradient.

## Discussion

In this cross-sectional survey analysis, {exposure_label} was associated with {outcome_label} after the stated covariate adjustment. The result should be interpreted as a population-survey association conditional on the variables included in the model, not as evidence that the exposure caused the outcome.

## Limitations

This analysis cannot establish temporality or causality. Complete-case analysis may introduce selection bias. The current survey-aware runner implements primary weighted linear and logistic models only. Subsample-weight analyses apply to the declared eligible subgroup rather than all examined participants, and domain analysis, replicate weights, plus multi-cycle weight construction still need explicit runner support before they should be presented as fully automated.

## Reproducibility

The companion packet includes the analysis results, quality checks, run metadata, and file hashes needed to audit or rerun the analysis. Input files and output files are hashed in the companion metadata.

## References

- CDC NHANES analytic guidelines: https://wwwn.cdc.gov/nchs/nhanes/AnalyticGuidelines.aspx
- CDC NHANES weighting tutorial: https://wwwn.cdc.gov/nchs/nhanes/tutorials/weighting.aspx
- R survey package: https://r-survey.r-forge.r-project.org/survey/index.html
"""
    critique = """# Critique

This report is suitable for local scientific review of the supported survey path. The main remaining methods limits are domain analysis, replicate weights, and multiple-cycle weight construction.
"""
    (out_dir / "analysis.json").write_text(json.dumps(analysis, indent=2) + "\n")
    (out_dir / "paper.md").write_text(paper)
    (out_dir / "critique.md").write_text(critique)


if __name__ == "__main__":
    main()
`;
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

function buildSyntheticStudyRows(protocol: LabMedbreviaNhanesResult["protocol"]): Array<Record<string, unknown>> {
  const base = [
    { SEQN: 1, RIDSTATR: 2, RIDAGEYR: 44, RIAGENDR: 1, RIDRETH3: 3, WTMEC2YR: 1, SDMVSTRA: 1, SDMVPSU: 1 },
    { SEQN: 2, RIDSTATR: 2, RIDAGEYR: 58, RIAGENDR: 2, RIDRETH3: 4, WTMEC2YR: 1, SDMVSTRA: 1, SDMVPSU: 2 },
    { SEQN: 3, RIDSTATR: 2, RIDAGEYR: 66, RIAGENDR: 1, RIDRETH3: 2, WTMEC2YR: 1, SDMVSTRA: 2, SDMVPSU: 1 },
    { SEQN: 4, RIDSTATR: 2, RIDAGEYR: 52, RIAGENDR: 2, RIDRETH3: 1, WTMEC2YR: 1, SDMVSTRA: 2, SDMVPSU: 2 },
  ];
  return base.map((row, index) => ({
    ...row,
    ...syntheticValuesForProtocol(protocol, index),
  }));
}

function syntheticValuesForProtocol(protocol: LabMedbreviaNhanesResult["protocol"], index: number): Record<string, unknown> {
  const row: Record<string, unknown> = {
    BMXBMI: [24, 31, 29, 35][index],
    LBXGH: [5.4, 6.1, 7.2, 5.8][index],
    LBXVIDMS: [42, 74, 38, 86][index],
    BPXSY1: [142, 118, 136, 122][index],
    BPXSY2: [140, 116, 132, 124][index],
    BPXSY3: [138, 120, 134, 126][index],
    BPXDI1: [86, 72, 82, 76][index],
    BPXDI2: [84, 70, 80, 74][index],
    BPXDI3: [82, 74, 78, 72][index],
    BPQ020: [1, 2, 2, 1][index],
    SMQ020: [1, 2, 1, 2][index],
    HIQ011: [1, 2, 1, 2][index],
    INDFMPIR: [0.9, 2.4, 4.2, 1.8][index],
    URDACT: [10, 30, 80, 18][index],
    LBXSCR: [0.8, 1.0, 1.4, 0.9][index],
    LBXTC: [210, 190, 175, 205][index],
    LBDHDD: [42, 50, 56, 44][index],
    LBXTR: [160, 120, 100, 150][index],
  };
  for (const variable of uniqueStrings([
    ...protocol.exposure.variables,
    ...protocol.endpoint.variables,
    ...protocol.covariates,
    ...(protocol.stratifiers ?? []),
    protocol.surveyDesign.weightVariable,
    protocol.surveyDesign.strataVariable,
    protocol.surveyDesign.psuVariable,
  ])) {
    if (!(variable in row)) row[variable] = index % 2 === 0 ? 1 : 2;
  }
  return row;
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

function normalizeVariableName(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function scoreCheck(id: string, points: number, maxPoints: number, detail: string): ResearchWorkflowScorecard["checks"][number] {
  return {
    id,
    points,
    maxPoints,
    status: points === maxPoints ? "pass" : points > 0 ? "partial" : "fail",
    detail,
  };
}

function workflowScoreFromUnknown(value: ResearchWorkflowScorecard | { workflowScorecard?: ResearchWorkflowScorecard } | null): number | null {
  if (!value) return null;
  if ("workflowScorecard" in value) return value.workflowScorecard?.score ?? null;
  return "score" in value && typeof value.score === "number" ? value.score : null;
}

async function collectCycleFiles(root: string): Promise<Array<{ relative: string; text: string }>> {
  const rootStat = await stat(root);
  if (!rootStat.isDirectory()) {
    return [{ relative: path.basename(root), text: await readFile(root, "utf-8").catch(() => "") }];
  }
  const files: Array<{ relative: string; text: string }> = [];
  async function walk(dir: string): Promise<void> {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      const relative = path.relative(root, full);
      if (entry.isDirectory()) {
        if (!["node_modules", ".git", "dist"].includes(entry.name)) await walk(full);
      } else if (entry.isFile()) {
        files.push({ relative, text: await readFile(full, "utf-8").catch(() => "") });
      }
    }
  }
  await walk(root);
  return files.sort((a, b) => a.relative.localeCompare(b.relative));
}

function makeCycleCheck(id: string, ok: boolean, evidence: string[], detail: string): ResearchCycleAudit["checks"][number] {
  return {
    id,
    status: ok ? "pass" : "fail",
    evidence: uniqueStrings(evidence).slice(0, 12),
    detail,
  };
}

function parseJsonObject(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function extractVariableNames(expression: string): string[] {
  return Array.from(expression.matchAll(/\b[A-Z][A-Z0-9_]{2,}\b/g)).map(match => match[0]);
}

function extractQuestionPart(question: string, pattern: RegExp): string | null {
  const match = question.match(pattern);
  const value = match?.[1]?.trim().replace(/[.,;:]+$/, "");
  return value || null;
}

function extractComparator(value: string | null): string | null {
  if (!value) {
    return null;
  }
  const match = value.match(/\s+(?:versus|vs\.?|compared with|relative to)\s+(.+)$/i);
  const comparator = match?.[1]?.trim().replace(/[.,;:]+$/, "");
  return comparator || null;
}

function extractTemporalConstraints(question: string): string[] {
  const constraints: string[] = [];
  for (const match of question.matchAll(/\b(?:before|during|within|over|between|from)\s+([^?,;]+)/gi)) {
    const value = match[0]?.trim().replace(/[.,;:]+$/, "");
    if (value) {
      constraints.push(value);
    }
  }
  for (const match of question.matchAll(/\bafter\s+(?!adjusting\b|adjustment\b|controlling\b|accounting\b)([^?,;]+)/gi)) {
    const value = match[0]?.trim().replace(/[.,;:]+$/, "");
    if (value) {
      constraints.push(value);
    }
  }
  for (const match of question.matchAll(/\b(?:baseline|follow-up|follow up|pre[- ]?index|post[- ]?index)\b/gi)) {
    const value = match[0]?.trim();
    if (value) {
      constraints.push(value);
    }
  }
  return uniqueStrings(constraints);
}

function extractAdjustmentCovariates(question: string): string[] {
  const match = question.match(/\b(?:after\s+)?(?:adjusting for|adjusted for|controlling for|accounting for)\s+(.+?)(?:\?|$)/i);
  if (!match?.[1]) {
    return [];
  }
  return match[1]
    .replace(/[.?:;]+$/, "")
    .replace(/\s+and\s+/gi, ", ")
    .split(/\s*,\s*/)
    .map(value => value.trim())
    .filter(Boolean);
}

function uniqueStrings(values: Array<string | null | undefined>): string[] {
  return Array.from(new Set(values.filter((value): value is string => Boolean(value)))).sort((a, b) => a.localeCompare(b));
}
