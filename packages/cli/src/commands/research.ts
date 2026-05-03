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
  outcome: string | null;
  stratifierOrModifier: string | null;
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
  outcome: string | null;
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
    status: "pass" | "missing";
    detail: string;
  }>;
  nextAction: string;
}

export interface ResearchDataAccessManifest {
  packetDir: string;
  manifestPath: string;
  dataset: string;
  files: Array<{ path: string; role: string; exists: boolean }>;
  readOnly: true;
  notes: string[];
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
    { id: "design", nodeId: "@agenteer/node-research-protocol-design", purpose: "Create a protocol packet from a question and dataset registry.", humanReview: false },
    { id: "critique", nodeId: "@agenteer/node-research-protocol-critique", purpose: "Run deterministic methodology checks before execution.", humanReview: false },
    { id: "methods-validation", nodeId: "@agenteer/node-research-methods-validation", purpose: "Validate packet methods against broader medical research policy.", humanReview: false },
    { id: "scout", nodeId: "@agenteer/node-research-scout-plan", purpose: "Plan or compute cohort and complete-case feasibility.", humanReview: false },
    { id: "data-quality", nodeId: "@agenteer/node-research-data-quality", purpose: "Profile fixture data quality, missingness, and coded unknown values.", humanReview: false },
    { id: "runner-spec", nodeId: "@agenteer/node-research-runner-spec", purpose: "Define the zero-cloud execution contract.", humanReview: false },
    { id: "approval", nodeId: "human:approval", purpose: "Record human-in-the-loop approval before analysis.", humanReview: true },
    { id: "analysis", nodeId: "@agenteer/node-research-analyze-local", purpose: "Run bounded local fixture analysis.", humanReview: false },
    { id: "report-review", nodeId: "@agenteer/node-research-report-review", purpose: "Check report artifacts against packet-specific QA requirements.", humanReview: false },
    { id: "manifest", nodeId: "@agenteer/node-research-artifact-manifest", purpose: "Hash packet artifacts for reproducibility.", humanReview: false },
    { id: "ro-crate", nodeId: "@agenteer/node-research-ro-crate", purpose: "Write RO-Crate-style metadata for research packet artifacts.", humanReview: false },
    { id: "provenance", nodeId: "@agenteer/node-research-provenance", purpose: "Write a PROV-style graph for packet artifacts and activities.", humanReview: false },
    { id: "export", nodeId: "@agenteer/node-research-export", purpose: "Copy manifest-backed artifacts into a durable export directory.", humanReview: false },
    { id: "qa-dashboard", nodeId: "@agenteer/node-research-qa-dashboard", purpose: "Summarize lifecycle, methods, reproducibility, and export readiness.", humanReview: false },
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
  const stratifierOrModifier = extractQuestionPart(normalized, /\b(?:by|across|stratified by|differently by)\s+([^?]+?)(?:\s+among|\s+in|\?|$)/i);
  const exposureOrPredictor =
    extractQuestionPart(normalized, /\bis\s+(.+?)\s+(?:associated with|related to|predictive of|patterned by)\s+/i)
    ?? extractQuestionPart(normalized, /\bdoes\s+(.+?)\s+(?:relate to|predict|affect|impact)\s+/i)
    ?? extractQuestionPart(normalized, /\b(?:effect of|impact of)\s+(.+?)\s+on\s+/i);
  const outcome =
    extractQuestionPart(normalized, /\b(?:associated with|related to|predictive of|relate to|predict|affect|impact)\s+(.+?)(?:\s+differently by|\s+after|\s+among|\s+in|\s+by|\?|$)/i)
    ?? extractQuestionPart(normalized, /\bon\s+(.+?)(?:\s+after|\s+among|\s+in|\s+by|\?|$)/i);
  const requiredMethods = uniqueStrings([
    "strobe",
    intent === "causal" ? "target-trial-emulation" : null,
    intent === "prediction" ? "tripod" : null,
    intent === "diagnostic" ? "diagnostic-performance" : null,
    "missing-data",
  ]);
  const clarificationPrompts = [
    population ? null : "Specify the target population and eligibility criteria.",
    exposureOrPredictor ? null : "Specify the primary exposure, predictor, or grouping variable.",
    outcome ? null : "Specify the primary outcome or endpoint.",
    intent === "causal" ? "Specify target-trial components before using causal language." : null,
    stratifierOrModifier ? "Clarify whether the modifier is for stratification, interaction testing, or adjustment." : null,
  ].filter((prompt): prompt is string => Boolean(prompt));
  return {
    question: normalized,
    intent,
    population,
    exposureOrPredictor,
    outcome,
    stratifierOrModifier,
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
    `  outcome: ${result.outcome ?? "(needs clarification)"}`,
    `  stratifier/modifier: ${result.stratifierOrModifier ?? "(none)"}`,
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
  const contrast = decomposition.intent === "diagnostic"
    ? "test-positive versus reference-standard-positive classification"
    : decomposition.intent === "prediction"
      ? "predicted risk versus observed outcome"
      : decomposition.intent === "causal"
        ? "intervention strategy A versus strategy B"
        : decomposition.exposureOrPredictor
          ? `${decomposition.exposureOrPredictor} groups or levels`
          : "comparison groups require clarification";
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
    outcome: decomposition.outcome,
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
    `  outcome: ${result.outcome ?? "(needs clarification)"}`,
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
  const design = await readJsonIfPresent(path.join(resolved, "design.json")) as LabMedbreviaNhanesResult | null;
  const requirements: ResearchRealStudyReadiness["requirements"] = [
    {
      id: "design-packet",
      status: design ? "pass" : "missing",
      detail: design ? "design.json is present." : "design.json is required.",
    },
    {
      id: "fixture-runner-spec",
      status: runner ? "pass" : "missing",
      detail: runner ? `Fixture runner mode is ${runner.mode}.` : "runner-spec.json is useful for synthetic fixture execution.",
    },
    {
      id: "real-data-runner",
      status: realRunner?.mode === "real_local_files" ? "pass" : "missing",
      detail: realRunner ? "real-runner-spec.json declares real_local_files execution." : "real-runner-spec.json is required for real local dataset execution.",
    },
    {
      id: "data-access-manifest",
      status: await exists(path.join(resolved, "data-access.json")) ? "pass" : "missing",
      detail: "data-access.json should describe local data files, schemas, and access constraints.",
    },
    {
      id: "survey-methods",
      status: design?.protocol.surveyDesign.weightVariable ? "pass" : "missing",
      detail: design?.protocol.surveyDesign.weightVariable
        ? `Survey weight ${design.protocol.surveyDesign.weightVariable} is specified.`
        : "Survey or sampling design requirements must be explicit for population estimates.",
    },
  ];
  const status = requirements.every(requirement => requirement.status === "pass") ? "ready_for_local_real_data" : "not_ready";
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
    ...result.requirements.map(requirement => `    - [${requirement.status}] ${requirement.id}: ${requirement.detail}`),
  ].join("\n");
}

export function renderResearchRealStudyReadinessJson(result: ResearchRealStudyReadiness): string {
  return `${JSON.stringify({
    schemaVersion: 1,
    realStudyReadiness: result,
  }, null, 2)}\n`;
}

export async function researchDataAccessManifestCommand(packetDir: string, files: string[]): Promise<ResearchDataAccessManifest> {
  const resolved = path.resolve(packetDir);
  const design = await readJsonIfPresent(path.join(resolved, "design.json")) as LabMedbreviaNhanesResult | null;
  const manifestPath = path.join(resolved, "data-access.json");
  const manifest: ResearchDataAccessManifest = {
    packetDir: resolved,
    manifestPath,
    dataset: design?.protocol.dataset ?? "unknown",
    files: await Promise.all(files.map(async (file, index) => ({
      path: path.resolve(file),
      role: index === 0 ? "primary-data" : "supporting-data",
      exists: await exists(path.resolve(file)),
    }))),
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
    `  read-only: ${manifest.readOnly}`,
    `  files: ${manifest.files.length}`,
    ...manifest.files.map(file => `  - [${file.exists ? "present" : "missing"}] ${file.role}: ${file.path}`),
  ].join("\n");
}

export function renderResearchDataAccessManifestJson(manifest: ResearchDataAccessManifest): string {
  return `${JSON.stringify({
    schemaVersion: 1,
    dataAccess: manifest,
  }, null, 2)}\n`;
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

export async function researchSuggestVariableMapCommand(packetDir: string, file: string): Promise<ResearchVariableMapSuggestion> {
  const resolved = path.resolve(packetDir);
  const realRunner = await readJsonIfPresent(path.join(resolved, "real-runner-spec.json")) as ResearchRealLocalRunnerSpec | null;
  const requiredVariables = realRunner?.requiredVariables ?? [];
  const schema = await researchInferSchemaCommand(file);
  const columnsByName = new Map(schema.columns.map(column => [column.name, column]));
  const columnsByNormalizedName = new Map(schema.columns.map(column => [normalizeVariableName(column.name), column]));
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
    file: schema.file,
    requiredVariables,
    suggestions,
    unmatchedVariables,
    nextAction: unmatchedVariables.length
      ? "Review unmatched variables, then persist accepted mappings with research variable-map."
      : `Persist accepted mappings with: agenteer research variable-map --packet ${resolved} --file ${schema.file} ${suggestions.map(suggestion => `--map ${suggestion.variable}:${suggestion.column}`).join(" ")}`,
  };
}

export function renderResearchVariableMapSuggestion(result: ResearchVariableMapSuggestion): string {
  return [
    `research variable map suggestions: ${result.packetDir}`,
    `  file: ${result.file}`,
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
    nextAction: checkpoint.nextCommand,
  };
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
    "variable-map.json",
    "runner-spec.json",
    "approval.json",
    "analysis-result.json",
    "data-access.json",
    "evidence-gap-report.json",
    "methods-validation.json",
    "provenance.json",
    "qa-dashboard.json",
    "real-runner-spec.json",
    "report.md",
    "report-review.json",
    "ro-crate-metadata.json",
    "export-record.json",
  ]);
  return (await readdir(packetDir))
    .filter(name => artifactAllowlist.has(name))
    .sort((a, b) => a.localeCompare(b));
}

async function artifactDigestMap(packetDir: string): Promise<Map<string, string>> {
  const entries = await Promise.all((await listResearchArtifactNames(packetDir)).map(async name => {
    const bytes = await readFile(path.join(packetDir, name));
    return [name, createHash("sha256").update(bytes).digest("hex")] as const;
  }));
  return new Map(entries);
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

function extractVariableNames(expression: string): string[] {
  return Array.from(expression.matchAll(/\b[A-Z][A-Z0-9_]{2,}\b/g)).map(match => match[0]);
}

function extractQuestionPart(question: string, pattern: RegExp): string | null {
  const match = question.match(pattern);
  const value = match?.[1]?.trim().replace(/[.,;:]+$/, "");
  return value || null;
}

function uniqueStrings(values: Array<string | null | undefined>): string[] {
  return Array.from(new Set(values.filter((value): value is string => Boolean(value)))).sort((a, b) => a.localeCompare(b));
}
