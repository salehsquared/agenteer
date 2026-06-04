import { createHash } from "node:crypto";
import path from "node:path";
import { mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises";
import {
  datasetAdapterIdSchema,
  type AnalysisSpecV2,
  type DatasetAdapterId,
  type ModelFamily,
  type StudyArchetypeId,
} from "./schemas.js";
import { migrateToAnalysisSpecV2, stableHash } from "./runtime.js";

export type MethodQaStatus = "pass" | "warning" | "fail";
export type RunReadiness = "local_review_ready" | "needs_methods_review" | "blocked";

export interface MethodQaCheck {
  id: string;
  category:
    | "convergence"
    | "separation"
    | "overfitting"
    | "missingness"
    | "collinearity"
    | "influence"
    | "effect_size"
    | "claim_alignment"
    | "semantic_plausibility"
    | "survey_design"
    | "artifact_integrity"
    | "method_selection"
    | "runner_capability";
  status: MethodQaStatus;
  severity: "info" | "minor" | "major" | "blocker";
  message: string;
  evidenceRefs: string[];
  recommendedAction: string;
}

export interface MethodQaResult {
  schemaVersion: 1;
  generatedAtIso: string;
  runDir: string;
  overallStatus: MethodQaStatus;
  readiness: RunReadiness;
  checks: MethodQaCheck[];
  blockerCount: number;
  warningCount: number;
  methodSummary: {
    detectedRunKind: string;
    detectedModelFamilies: string[];
    completeCaseN: number | null;
    eventCount: number | null;
    predictorCount: number | null;
    resultPosture: string | null;
  };
  runnerCapability: RunnerCapabilityInspection;
  nextAction: string;
  outPath: string | null;
  reportPath: string | null;
}

export interface ManuscriptQaResult {
  schemaVersion: 1;
  generatedAtIso: string;
  manuscriptPath: string | null;
  status: MethodQaStatus;
  checks: MethodQaCheck[];
  sectionStatus: Record<string, boolean>;
  readability: {
    internalJargonHits: string[];
    sentenceCount: number;
    averageSentenceWords: number;
  };
  nextAction: string;
}

export interface ManuscriptResult {
  schemaVersion: 1;
  generatedAtIso: string;
  runDir: string;
  manuscriptPath: string | null;
  qaPath: string | null;
  methodQa: MethodQaResult;
  manuscriptQa: ManuscriptQaResult;
  manuscriptMarkdown: string;
}

export interface RunInspectionResult {
  schemaVersion: 1;
  generatedAtIso: string;
  runDir: string;
  readiness: RunReadiness;
  blockers: string[];
  warnings: string[];
  cost: {
    estimatedUsd: number | null;
    source: string | null;
    hardStopUsd: number | null;
  };
  provenance: {
    analysisSpecPath: string | null;
    analysisSpecHash: string | null;
    runnerRecordPath: string | null;
    manifestPaths: string[];
    artifactCount: number;
    artifactHash: string;
  };
  qa: {
    methodQaStatus: MethodQaStatus;
    methodDecisionReadinessStatus: string | null;
    methodDecisionRequestedMethod: string | null;
    methodDecisionVerdict: string | null;
    methodDecisionConsistencyStatus: string | null;
    methodDecisionConsistencySummary: string | null;
    methodDecisionConsistencyMismatchedSources: string[];
    statsQaReadinessStatus: string | null;
    statsQaFailingChecks: string[];
    statsQaWarningChecks: string[];
    figureReadinessStatus: string | null;
    figureCount: number | null;
    figureFailingIds: string[];
    figureWarningIds: string[];
    paperQaStatus: string | null;
    literatureQaStatus: string | null;
    manuscriptQaStatus: MethodQaStatus | null;
    lifecycleStatus: string | null;
    rerunStabilityStatus: string | null;
    reviewerPanelStatus: string | null;
    reviewerAdjudicationVerdict: string | null;
  };
  literature: {
    searchPath: string | null;
    qaPath: string | null;
    contextPath: string | null;
    status: string | null;
    sourceCount: number | null;
    highQualitySourceCount: number | null;
    citedSourceCount: number | null;
    blockerCount: number;
    warningCount: number;
    nextAction: string | null;
  };
  companionReadiness: {
    status: string | null;
    requiredMethods: string[];
    satisfiedMethods: string[];
    missingMethods: string[];
    evidenceRefs: string[];
    path: string | null;
  };
  feasibilityReadiness: {
    status: string | null;
    verdict: string | null;
    score: number | null;
    confidence: number | null;
    blockers: string[];
    warnings: string[];
    requiredModifications: string[];
    nextAction: string | null;
    evidenceRefs: string[];
    path: string | null;
  };
  runnerCapability: RunnerCapabilityInspection;
  paperPath: string | null;
  manuscriptPath: string | null;
  nextRecommendedAction: string;
  recommendedCommands: string[];
  methodQa: MethodQaResult;
  outPath: string | null;
  reportPath: string | null;
}

export interface RunnerCapabilityInspection {
  method: string | null;
  status: "executable" | "bounded_approximation" | "backend_blocked" | null;
  reason: string | null;
  requiredFollowUp: string[];
  cannotSupport: string[];
  evidenceRefs: string[];
}

export interface ExplorationPlanResult {
  schemaVersion: 1;
  generatedAtIso: string;
  sourceExplorationPath: string;
  sourceExplorationSha256: string;
  questionId: string;
  status: "ready_for_spec_review" | "needs_methods_review" | "blocked";
  blockers: string[];
  warnings: string[];
  formalPlan: {
    researchQuestion: string;
    dataset: DatasetAdapterId;
    routeIntent: string;
    estimandBoundary: string;
    selectedOutcome: string;
    selectedExposure: string;
    requiredBeforeExecution: string[];
    recommendedCommands: string[];
  };
  analysisSpecV2: AnalysisSpecV2;
  validation: ReturnType<typeof migrateToAnalysisSpecV2>["validation"];
  nextAction: string;
  outPath: string | null;
}

export interface ContinuousBenchmarkCaseResult {
  id: string;
  runDir: string;
  readiness: RunReadiness;
  score: number;
  categoryScores: Record<string, number>;
  blockers: string[];
  warnings: string[];
  nextAction: string;
}

export interface ContinuousBenchmarkSuiteResult {
  schemaVersion: 1;
  generatedAtIso: string;
  suiteDir: string;
  caseCount: number;
  passCount: number;
  warningCount: number;
  failCount: number;
  meanScore: number;
  cases: ContinuousBenchmarkCaseResult[];
  regressions: string[];
  nextAction: string;
  outPath: string | null;
  reportPath: string | null;
}

export interface ContinuousBenchmarkTrendResult {
  schemaVersion: 1;
  generatedAtIso: string;
  historyDir: string;
  runCount: number;
  latestScore: number | null;
  previousScore: number | null;
  delta: number | null;
  trend: "insufficient_history" | "improving" | "stable" | "regressing";
  regressions: string[];
  nextAction: string;
  outPath: string | null;
  reportPath: string | null;
}

interface RunEvidence {
  runDir: string;
  files: ArtifactInventoryEntry[];
  json: Record<string, unknown | null>;
  jsonPaths: Record<string, string | null>;
  text: Record<string, string | null>;
  textPaths: Record<string, string | null>;
  spec: AnalysisSpecV2 | null;
  specPath: string | null;
}

interface ArtifactInventoryEntry {
  path: string;
  relativePath: string;
  bytes: number;
  sha256: string;
}

const knownJsonFiles = [
  "analysis-results.json",
  "dataset-run.json",
  "stats-run.json",
  "ml-run.json",
  "comparison.json",
  "analysis.json",
  "qa.json",
  "qa-cli.json",
  "paper-qa.json",
  "literature-search.json",
  "literature-qa.json",
  "literature-context.json",
  "manuscript-qa.json",
  "stats-config.json",
  "stats-preflight.json",
  "stats-qa.json",
  "figures.json",
  "figure-qa.json",
  "method-decision-support.json",
  "method-contract.json",
  "diagnostics.json",
  "feasibility-trial.json",
  "analysis-run-manifest.json",
  "run-manifest.json",
  "runner-record.json",
  "lifecycle.json",
  "rerun-stability.json",
  "review-panel.json",
  "review-adjudication.json",
  "review-response.json",
  "state-reentry.json",
  "cost-receipt.json",
  "analysis-spec-v2.json",
  "analysis-spec.json",
];

const knownTextFiles = ["paper.md", "manuscript.md", "stats-report.md", "stats-preflight.md", "method-decision-support.md", "critique.md", "reviewer-context.md"];

export async function researchMethodQaCommand(opts: {
  runDir: string;
  outPath?: string;
  reportPath?: string;
}): Promise<MethodQaResult> {
  const evidence = await collectRunEvidence(opts.runDir);
  const checks: MethodQaCheck[] = [];
  const add = (check: Omit<MethodQaCheck, "id"> & { id?: string }) => {
    checks.push({
      id: check.id ?? `${check.category}_${String(checks.length + 1).padStart(2, "0")}`,
      category: check.category,
      status: check.status,
      severity: check.severity,
      message: check.message,
      evidenceRefs: check.evidenceRefs,
      recommendedAction: check.recommendedAction,
    });
  };

  const allIssues = collectIssueRecords(evidence.json);
  const issueText = JSON.stringify(allIssues).toLowerCase();
  const estimates = collectEstimateLikeRecords(evidence.json);
  const detected = detectRunSummary(evidence, estimates);
  const runnerCapability = extractRunnerCapabilityInspection(evidence);
  const statsQaReadiness = extractStatsQaReadinessInspection(evidence);
  const methodDecision = extractMethodDecisionInspection(evidence);
  const methodDecisionConsistency = inspectMethodDecisionEvidenceConsistency(evidence);
  const needsRegressionDiagnostics = detected.detectedModelFamilies.some(family => ["linear", "logistic", "count", "glm"].includes(family));
  const diagnosticRoute = detected.detectedModelFamilies.includes("diagnostic_accuracy");
  const paper = evidence.text["paper.md"] ?? evidence.text["manuscript.md"] ?? "";

  add({
    category: "artifact_integrity",
    status: evidence.files.length > 0 ? "pass" : "fail",
    severity: evidence.files.length > 0 ? "info" : "blocker",
    message: evidence.files.length > 0 ? `Run directory contains ${evidence.files.length} artifact(s).` : "Run directory does not contain inspectable artifacts.",
    evidenceRefs: [evidence.runDir],
    recommendedAction: evidence.files.length > 0 ? "Continue with artifact-level QA." : "Run or export the analysis before methods QA.",
  });

  const requiredReaderArtifacts = ["paper.md", "manuscript.md"];
  const hasReadableReport = requiredReaderArtifacts.some(name => Boolean(evidence.text[name]));
  add({
    category: "artifact_integrity",
    status: hasReadableReport ? "pass" : "warning",
    severity: hasReadableReport ? "info" : "major",
    message: hasReadableReport ? "A reader-facing report artifact is present." : "No reader-facing paper/manuscript artifact was found.",
    evidenceRefs: requiredReaderArtifacts.map(name => path.join(evidence.runDir, name)),
    recommendedAction: hasReadableReport ? "Run manuscript QA before promotion." : "Generate a publication-grade manuscript before promotion.",
  });

  const hasStatsRun = Boolean(evidence.json["stats-run.json"]);
  const statsPreflightStatus = firstStatus(evidence.json["stats-preflight.json"]);
  if (hasStatsRun) {
    add({
      id: "stats-qa-readiness",
      category: "artifact_integrity",
      status: statsQaReadiness.status === "fail" || statsQaReadiness.status === "missing" || statsQaReadiness.status === "unreadable"
        ? "fail"
        : statsQaReadiness.status === "warning" || statsQaReadiness.status === null
          ? "warning"
          : "pass",
      severity: statsQaReadiness.status === "fail" || statsQaReadiness.status === "missing" || statsQaReadiness.status === "unreadable"
        ? "blocker"
        : statsQaReadiness.status === "warning" || statsQaReadiness.status === null
          ? "major"
          : "info",
      message: statsQaReadiness.status === "fail"
        ? `Stats QA failed: ${statsQaReadiness.failingChecks.join(", ") || "unknown failed check"}.`
        : statsQaReadiness.status === "missing" || statsQaReadiness.status === "unreadable"
          ? `Stats QA is ${statsQaReadiness.status}; method QA cannot treat this run as locally review-ready.`
          : statsQaReadiness.status === "warning"
            ? `Stats QA has warning-level checks: ${statsQaReadiness.warningChecks.join(", ") || "review stats-qa.json"}.`
            : statsQaReadiness.status === "pass"
              ? "Stats QA passed and is available as lifecycle evidence."
              : "Stats-run artifact is present, but stats QA readiness is missing from stats-qa.json and analysis-run-manifest.json.",
      evidenceRefs: statsQaReadiness.evidenceRefs.length ? statsQaReadiness.evidenceRefs : refsForExisting(evidence, ["stats-qa.json", "analysis-run-manifest.json"]),
      recommendedAction: statsQaReadiness.status === "fail"
        ? "Resolve failed stats QA checks, rerun the method if needed, and regenerate downstream reports."
        : statsQaReadiness.status === "missing" || statsQaReadiness.status === "unreadable" || statsQaReadiness.status === null
          ? "Regenerate stats-run so stats-qa.json is present, readable, and linked in the analysis manifest."
          : statsQaReadiness.status === "warning"
            ? "Review or justify warning-level stats QA findings before promotion."
            : "Preserve stats QA evidence with the packet.",
    });
    add({
      category: "artifact_integrity",
      status: statsPreflightStatus === "block" ? "fail" : statsPreflightStatus === "pass" ? "pass" : "warning",
      severity: statsPreflightStatus === "block" ? "blocker" : statsPreflightStatus === "pass" ? "info" : "major",
      message: statsPreflightStatus === "block"
        ? "Stats preflight blocked execution or promotion; feasibility/method suitability must be repaired."
        : statsPreflightStatus === "warning"
          ? "Stats preflight produced warnings; review feasibility and method-suitability warnings before promotion."
          : statsPreflightStatus === "pass"
            ? "Stats preflight feasibility and method-suitability evidence is present and passing."
            : "Stats-run artifact is present, but stats-preflight evidence is missing or unreadable.",
      evidenceRefs: refsForExisting(evidence, ["stats-preflight.json", "stats-preflight.md", "stats-run.json"]),
      recommendedAction: statsPreflightStatus === "block"
        ? "Resolve stats-preflight blockers, rerun the method, and keep the updated preflight artifact."
        : statsPreflightStatus === "warning"
          ? "Resolve or explicitly justify stats-preflight warnings before treating the run as locally review-ready."
          : statsPreflightStatus === "pass"
            ? "Preserve preflight artifacts with the packet."
            : "Regenerate the stats run with the current runner so feasibility preflight artifacts are produced.",
    });
    add({
      id: "method-decision-readiness",
      category: "method_selection",
      status: methodDecision.status === "blocked"
        ? "fail"
        : methodDecision.status === "preferred"
          ? "pass"
          : "warning",
      severity: methodDecision.status === "blocked"
        ? "blocker"
        : methodDecision.status === "preferred"
          ? "info"
          : "major",
      message: methodDecision.status === "blocked"
        ? `Method-selection evidence blocked the selected method${methodDecision.requestedMethod ? ` (${methodDecision.requestedMethod})` : ""}: ${methodDecision.nextAction ?? methodDecision.verdict ?? "method decision support requires redesign"}.`
        : methodDecision.status === "preferred"
          ? `Method-selection evidence classified ${methodDecision.requestedMethod ?? "the selected method"} as a preferred method for this data.`
          : methodDecision.status === "review_required"
            ? `Method-selection evidence requires review for ${methodDecision.requestedMethod ?? "the selected method"}${methodDecision.requestedRole ? ` (${methodDecision.requestedRole})` : ""}.${methodDecision.primaryMethods.length ? ` Preferred method(s): ${methodDecision.primaryMethods.join(", ")}.` : ""}`
            : "Stats-run artifact is present, but method-selection evidence is missing; method QA cannot verify that the selected method was data-appropriate.",
      evidenceRefs: methodDecision.evidenceRefs.length ? methodDecision.evidenceRefs : refsForExisting(evidence, ["method-decision-support.json", "method-decision-support.md", "stats-preflight.json", "stats-run.json"]),
      recommendedAction: methodDecision.status === "blocked"
        ? "Redesign the analysis around a supported method or repair the data/method mismatch, then rerun before promotion."
        : methodDecision.status === "preferred"
          ? "Preserve method-decision evidence with the packet."
          : methodDecision.status === "review_required"
            ? methodDecision.nextAction ?? "Treat the run as exploratory until the preferred primary method is run or the fallback/sensitivity choice is explicitly justified."
            : "Regenerate the stats run with current method-decision support artifacts before treating the result as locally review-ready.",
    });
    add({
      id: "method-decision-evidence-consistency",
      category: "method_selection",
      status: methodDecisionConsistency.status,
      severity: methodDecisionConsistency.status === "warning" ? "major" : "info",
      message: methodDecisionConsistency.message,
      evidenceRefs: methodDecisionConsistency.evidenceRefs,
      recommendedAction: methodDecisionConsistency.status === "warning"
        ? "Regenerate downstream method-decision, preflight, and manifest artifacts from the executed stats run before promotion."
        : "Preserve consistent method-decision evidence with the packet.",
    });
    add({
      category: "runner_capability",
      status: runnerCapability.status === "backend_blocked"
        ? "fail"
        : runnerCapability.status === "bounded_approximation" || runnerCapability.status === null
          ? "warning"
          : "pass",
      severity: runnerCapability.status === "backend_blocked"
        ? "blocker"
        : runnerCapability.status === "bounded_approximation" || runnerCapability.status === null
          ? "major"
          : "info",
      message: runnerCapability.status === "backend_blocked"
        ? `The selected statistical method is backend-blocked: ${runnerCapability.reason ?? "validated backend unavailable"}.`
        : runnerCapability.status === "bounded_approximation"
          ? `The selected statistical method ran as a bounded approximation: ${runnerCapability.reason ?? "methods review required"}.`
          : runnerCapability.status === "executable"
            ? `Runner capability is executable for ${runnerCapability.method ?? "the selected method"}.`
            : "Stats-run artifact is present, but runner capability maturity was not recorded.",
      evidenceRefs: runnerCapability.evidenceRefs.length ? runnerCapability.evidenceRefs : refsForExisting(evidence, ["stats-run.json", "method-contract.json"]),
      recommendedAction: runnerCapability.status === "backend_blocked"
        ? "Route to the required validated backend or redesign the analysis before promotion."
        : runnerCapability.status === "bounded_approximation"
          ? "Run the required follow-up backend/methods review before presenting confirmatory results."
          : runnerCapability.status === "executable"
            ? "Keep runner-capability evidence with the packet."
            : "Regenerate the stats run with the current runner so packet-level method capability is recorded.",
    });
  }

  const convergenceBad = /\b(convergence|converge|singular|non[-_ ]?finite|nan|infinite|overflow)\b/.test(issueText);
  add({
    category: "convergence",
    status: convergenceBad ? "fail" : estimates.length || detected.detectedRunKind !== "unknown" ? "pass" : "warning",
    severity: convergenceBad ? "blocker" : estimates.length || detected.detectedRunKind !== "unknown" ? "info" : "minor",
    message: convergenceBad ? "The run recorded numerical convergence or non-finite estimate concerns." : estimates.length ? "No convergence failure was detected in available estimate/issue artifacts." : "No model estimate artifact was available to check convergence.",
    evidenceRefs: refsForExisting(evidence, ["diagnostics.json", "stats-qa.json", "analysis-results.json", "analysis.json"]),
    recommendedAction: convergenceBad ? "Refit with simpler model, penalization, exact/small-sample method, or stop for methods review." : "Preserve convergence evidence with the run artifacts.",
  });

  const separationBad = /\b(separation|perfect[_ -]?prediction|complete[_ -]?separation|quasi[_ -]?separation)\b/.test(issueText);
  add({
    category: "separation",
    status: separationBad ? "fail" : detected.detectedModelFamilies.includes("logistic") ? "warning" : "pass",
    severity: separationBad ? "blocker" : detected.detectedModelFamilies.includes("logistic") ? "minor" : "info",
    message: separationBad ? "The run recorded separation/perfect-prediction risk." : detected.detectedModelFamilies.includes("logistic") ? "Logistic-type model detected; explicit separation diagnostic evidence was not found." : "No logistic separation-sensitive model was detected.",
    evidenceRefs: refsForExisting(evidence, ["diagnostics.json", "stats-qa.json", "analysis-results.json"]),
    recommendedAction: separationBad ? "Use penalized/exact model or collapse sparse categories; do not present unstable odds ratios." : "Record separation diagnostics for logistic models before publication.",
  });

  const eventsPerPredictor = detected.eventCount !== null && detected.predictorCount !== null && detected.predictorCount > 0
    ? detected.eventCount / detected.predictorCount
    : null;
  const overfitFail = /\b(low_events_per_predictor|overfit|too many predictors|events per predictor)\b/.test(issueText) || (eventsPerPredictor !== null && eventsPerPredictor < 5);
  add({
    category: "overfitting",
    status: overfitFail ? "fail" : eventsPerPredictor !== null && eventsPerPredictor < 10 ? "warning" : "pass",
    severity: overfitFail ? "blocker" : eventsPerPredictor !== null && eventsPerPredictor < 10 ? "major" : "info",
    message: eventsPerPredictor !== null
      ? `Approximate events per predictor: ${formatNumber(eventsPerPredictor, 2)}.`
      : overfitFail ? "The run recorded overfitting or low-events-per-predictor concerns." : "No events-per-predictor issue was detected.",
    evidenceRefs: refsForExisting(evidence, ["analysis-results.json", "dataset-run.json", "stats-run.json"]),
    recommendedAction: overfitFail ? "Reduce predictors, use shrinkage/penalization, or treat the result as exploratory only." : "Keep event counts and predictor counts in the report supplement.",
  });

  const missingnessIssues = allIssues.filter(issue => /missing|complete.case|complete-case/i.test(JSON.stringify(issue)));
  const missingnessArtifact = evidence.json["diagnostics.json"] || evidence.json["stats-run.json"] || evidence.json["analysis-results.json"];
  const cohortN = bestCohortN(evidence);
  const denominatorFraction = detected.completeCaseN !== null && cohortN !== null && cohortN > 0 ? detected.completeCaseN / cohortN : null;
  const highMissingnessVariables = highMissingnessVariableNames(evidence, 0.2);
  const missingnessWarn = missingnessIssues.some(issue => /high|block|sensitivity/i.test(JSON.stringify(issue)))
    || (denominatorFraction !== null && denominatorFraction < 0.8)
    || highMissingnessVariables.length > 0;
  add({
    category: "missingness",
    status: missingnessWarn ? "warning" : missingnessArtifact ? "pass" : "warning",
    severity: missingnessWarn ? "major" : missingnessArtifact ? "info" : "major",
    message: missingnessIssues.length
      ? `Detected ${missingnessIssues.length} missingness-related issue(s).`
      : denominatorFraction !== null && denominatorFraction < 0.8
        ? `Model complete-case denominator is ${formatNumber(denominatorFraction * 100, 1)}% of the cohort (${detected.completeCaseN} of ${cohortN}).`
        : highMissingnessVariables.length
          ? `High missingness detected for ${highMissingnessVariables.slice(0, 4).join(", ")}${highMissingnessVariables.length > 4 ? ", ..." : ""}.`
          : missingnessArtifact ? "Missingness/complete-case evidence is present." : "No missingness diagnostic artifact was found.",
    evidenceRefs: refsForExisting(evidence, ["diagnostics.json", "stats-qa.json", "analysis-results.json", "analysis.json"]),
    recommendedAction: missingnessWarn ? "Add missingness mechanism review and sensitivity analysis before promotion." : "Report complete-case N and per-variable missingness.",
  });

  const collinearityFound = /\b(vif|variance inflation|collinear|condition number|singular)\b/.test(JSON.stringify(evidence.json).toLowerCase());
  add({
    category: "collinearity",
    status: collinearityFound || !needsRegressionDiagnostics ? "pass" : "warning",
    severity: collinearityFound || !needsRegressionDiagnostics ? "info" : "minor",
    message: collinearityFound
      ? "Collinearity diagnostic evidence was found."
      : !needsRegressionDiagnostics ? "Collinearity diagnostics are not applicable to this route family." : "No explicit collinearity diagnostic evidence was found.",
    evidenceRefs: refsForExisting(evidence, ["diagnostics.json", "stats-qa.json", "analysis-results.json"]),
    recommendedAction: "For adjusted regression, record VIF/condition-number or justify why collinearity is not material.",
  });

  const influenceFound = /\b(cook|leverage|influential|dfbeta|outlier)\b/.test(JSON.stringify(evidence.json).toLowerCase());
  add({
    category: "influence",
    status: influenceFound || !needsRegressionDiagnostics ? "pass" : "warning",
    severity: influenceFound || !needsRegressionDiagnostics ? "info" : "minor",
    message: influenceFound
      ? "Influence/outlier diagnostic evidence was found."
      : !needsRegressionDiagnostics ? "Influence diagnostics are not applicable to this route family." : "No explicit influence diagnostic evidence was found.",
    evidenceRefs: refsForExisting(evidence, ["diagnostics.json", "stats-qa.json", "analysis-results.json"]),
    recommendedAction: "Record influential-point review for model-based papers, especially small cohorts.",
  });

  const inconsistent = estimates.filter(isPValueEffectInconsistent);
  const diagnosticEstimateCount = estimates.filter(isDiagnosticEstimateRecord).length;
  add({
    category: "effect_size",
    status: inconsistent.length ? "fail" : estimates.length ? "pass" : "warning",
    severity: inconsistent.length ? "blocker" : estimates.length ? "info" : "minor",
    message: inconsistent.length
      ? `Detected ${inconsistent.length} p-value/effect-size inconsistency candidate(s).`
      : diagnosticEstimateCount
        ? `Checked ${diagnosticEstimateCount} diagnostic performance record(s) with sensitivity/specificity or predictive-value evidence.`
        : estimates.length ? `Checked ${estimates.length} estimate-like record(s) for p-value/interval consistency.` : "No estimate-like records were available for p-value/effect-size checks.",
    evidenceRefs: refsForExisting(evidence, ["stats-run.json", "analysis-results.json", "analysis.json"]),
    recommendedAction: inconsistent.length ? "Recompute estimates and intervals before reporting results." : "Report effect sizes with intervals; avoid p-value-only conclusions.",
  });

  const causalOverclaim = !evidence.spec?.estimand.causalClaimsAllowed && containsUnsupportedCausalClaim(paper);
  const internalJargon = readerFacingJargonHits(paper);
  add({
    category: "claim_alignment",
    status: causalOverclaim || internalJargon.length ? "fail" : paper ? "pass" : "warning",
    severity: causalOverclaim ? "blocker" : internalJargon.length ? "major" : paper ? "info" : "major",
    message: causalOverclaim
      ? "Reader-facing report appears to use causal language without a causal design policy."
      : internalJargon.length ? `Reader-facing report contains internal framework terms: ${internalJargon.join(", ")}.`
        : paper ? "Reader-facing report avoids obvious framework jargon and causal overclaiming." : "No reader-facing report was available for claim alignment.",
    evidenceRefs: refsForExisting(evidence, ["paper.md", "manuscript.md", "analysis-spec-v2.json", "analysis-spec.json"]),
    recommendedAction: causalOverclaim ? "Rewrite claims as association/prediction/diagnostic-performance statements or add a reviewed causal design." : "Keep internal framework details in companion artifacts, not the manuscript.",
  });

  const jsonText = JSON.stringify(evidence.json);
  const sparseDiagnostic = /\b(SPARSE_DIAGNOSTIC_CELL|sparse diagnostic cell)\b/i.test(jsonText);
  const clinicalCodingConcern = /\b(coding review|needs_clinical_review|invalid code|matched icd|icd9|icd10|diagnosis[-_ ]code)\b/i.test(jsonText);
  const implausibleValueConcern = hasNonPassingSemanticPlausibilityCheck(evidence) || /\b(SEMANTIC_PLAUSIBILITY_FAIL|SEMANTIC_PLAUSIBILITY_WARNING|IMPOSSIBLE_VALUE|NEGATIVE_LOS|INVALID_AGE|UNPROFILED_REQUIRED_TABLE|KDIGO_DERIVED_WARNING)\b/i.test(jsonText);
  const semanticBad = sparseDiagnostic || clinicalCodingConcern || implausibleValueConcern;
  add({
    category: "semantic_plausibility",
    status: semanticBad ? "warning" : evidence.spec?.dataset === "mimic" || evidence.spec?.dataset === "nhanes" ? "warning" : "pass",
    severity: semanticBad ? "major" : evidence.spec?.dataset === "mimic" || evidence.spec?.dataset === "nhanes" ? "minor" : "info",
    message: sparseDiagnostic && diagnosticRoute
      ? "Sparse diagnostic accuracy cells were detected; sensitivity, specificity, and predictive values may be unstable."
      : clinicalCodingConcern ? "Clinical coding or phenotype review concerns were detected."
        : implausibleValueConcern ? "Dataset-specific semantic plausibility concerns were detected."
          : "No dataset-specific semantic plausibility issue was detected in available artifacts.",
    evidenceRefs: refsForExisting(evidence, ["analysis-results.json", "matched-icd-codes.csv", "stats-qa.json", "qa.json"]),
    recommendedAction: sparseDiagnostic && diagnosticRoute
      ? "Review sparse diagnostic cells, consider exact intervals or threshold revision, and keep the precision caveat in the report."
      : semanticBad ? "Resolve coding/plausibility issues or state them prominently as limitations." : "For clinical/public-health datasets, attach semantic QA evidence before share/export.",
  });

  const surveyRequired = Boolean(evidence.spec?.surveyDesign.required);
  const surveyEvidence = /\b(weight|strata|psu|survey|design)\b/i.test(JSON.stringify(evidence.json));
  add({
    category: "survey_design",
    status: surveyRequired && !surveyEvidence ? "fail" : surveyRequired ? "pass" : "pass",
    severity: surveyRequired && !surveyEvidence ? "blocker" : "info",
    message: surveyRequired ? "Survey-design-aware spec detected." : "No complex survey design requirement was detected.",
    evidenceRefs: refsForExisting(evidence, ["analysis-spec-v2.json", "analysis-spec.json", "analysis.json", "runner-record.json"]),
    recommendedAction: surveyRequired ? "Verify weights, strata, PSU, subsample eligibility, and cycle pooling in the report." : "If the source dataset is a complex survey, encode survey design before inference.",
  });

  const blockerCount = checks.filter(check => check.status === "fail" || check.severity === "blocker").length;
  const warningCount = checks.filter(check => check.status === "warning").length;
  const overallStatus: MethodQaStatus = blockerCount ? "fail" : warningCount ? "warning" : "pass";
  const readiness: RunReadiness = blockerCount ? "blocked" : warningCount ? "needs_methods_review" : "local_review_ready";
  const result: MethodQaResult = {
    schemaVersion: 1,
    generatedAtIso: new Date().toISOString(),
    runDir: evidence.runDir,
    overallStatus,
    readiness,
    checks,
    blockerCount,
    warningCount,
    methodSummary: detected,
    runnerCapability,
    nextAction: methodQaNextAction(readiness, checks),
    outPath: null,
    reportPath: null,
  };
  return await writeMethodQaOutputs(result, opts.outPath, opts.reportPath);
}

export function renderResearchMethodQa(result: MethodQaResult): string {
  return [
    "research method QA",
    `  run: ${result.runDir}`,
    `  status: ${result.overallStatus}`,
    `  readiness: ${result.readiness}`,
    `  blockers: ${result.blockerCount}`,
    `  warnings: ${result.warningCount}`,
    `  run kind: ${result.methodSummary.detectedRunKind}`,
    `  model families: ${result.methodSummary.detectedModelFamilies.join(", ") || "(unknown)"}`,
    `  next: ${result.nextAction}`,
  ].join("\n");
}

export function renderResearchMethodQaJson(result: MethodQaResult): string {
  return `${JSON.stringify({ schemaVersion: 1, methodQa: result }, null, 2)}\n`;
}

export async function researchManuscriptCommand(opts: {
  runDir: string;
  outPath?: string;
  qaOutPath?: string;
}): Promise<ManuscriptResult> {
  const evidence = await collectRunEvidence(opts.runDir);
  const manuscriptPath = opts.outPath ? path.resolve(opts.outPath) : path.join(evidence.runDir, "manuscript.md");
  await mkdir(path.dirname(manuscriptPath), { recursive: true });
  const draftMethodQa = await researchMethodQaCommand({ runDir: evidence.runDir });
  const draftMarkdown = renderManuscriptMarkdown(evidence, draftMethodQa);
  await writeFile(manuscriptPath, draftMarkdown);
  const finalEvidence = await collectRunEvidence(opts.runDir);
  const methodQa = await researchMethodQaCommand({ runDir: finalEvidence.runDir });
  const manuscriptMarkdown = renderManuscriptMarkdown(finalEvidence, methodQa);
  await writeFile(manuscriptPath, manuscriptMarkdown);
  const manuscriptQa = buildManuscriptQa(manuscriptMarkdown, manuscriptPath, methodQa);
  const qaPath = opts.qaOutPath ? path.resolve(opts.qaOutPath) : path.join(evidence.runDir, "manuscript-qa.json");
  await mkdir(path.dirname(qaPath), { recursive: true });
  await writeFile(qaPath, `${JSON.stringify({ schemaVersion: 1, manuscriptQa }, null, 2)}\n`);
  return {
    schemaVersion: 1,
    generatedAtIso: new Date().toISOString(),
    runDir: evidence.runDir,
    manuscriptPath,
    qaPath,
    methodQa,
    manuscriptQa: { ...manuscriptQa, manuscriptPath },
    manuscriptMarkdown,
  };
}

export function renderResearchManuscript(result: ManuscriptResult): string {
  return [
    "research manuscript",
    `  run: ${result.runDir}`,
    `  manuscript: ${result.manuscriptPath ?? "(not written)"}`,
    `  qa: ${result.manuscriptQa.status}`,
    `  method QA: ${result.methodQa.overallStatus}`,
    `  next: ${result.manuscriptQa.nextAction}`,
  ].join("\n");
}

export function renderResearchManuscriptJson(result: ManuscriptResult): string {
  return `${JSON.stringify({ schemaVersion: 1, manuscript: result }, null, 2)}\n`;
}

export async function researchRunInspectCommand(opts: {
  runDir: string;
  outPath?: string;
  reportPath?: string;
}): Promise<RunInspectionResult> {
  const evidence = await collectRunEvidence(opts.runDir);
  const methodQa = await researchMethodQaCommand({ runDir: evidence.runDir });
  const paperQa =
    firstStatus(evidence.json["paper-qa.json"]) ??
    firstStatus(evidence.json["qa-cli.json"]) ??
    firstStatus(evidence.json["qa.json"]);
  const literature = extractLiteratureInspection(evidence);
  const companionReadiness = extractCompanionReadinessInspection(evidence);
  const feasibilityReadiness = extractFeasibilityReadinessInspection(evidence);
  const statsQaReadiness = extractStatsQaReadinessInspection(evidence);
  const figureReadiness = extractFigureReadinessInspection(evidence);
  const methodDecision = extractMethodDecisionInspection(evidence);
  const methodDecisionConsistency = extractMethodDecisionConsistencyInspection(evidence, methodQa);
  const runnerCapability = extractRunnerCapabilityInspection(evidence);
  const manuscriptQa = evidence.json["manuscript-qa.json"] ? firstStatus(evidence.json["manuscript-qa.json"]) as MethodQaStatus | null : null;
  const lifecycleStatus = firstStatus(evidence.json["lifecycle.json"], "lifecycleStatus", "status");
  const rerunStabilityStatus = firstStatus(evidence.json["rerun-stability.json"], "status", "stabilityStatus");
  const reviewerPanelStatus = firstStatus(evidence.json["review-panel.json"], "status");
  const reviewerAdjudicationVerdict = firstStatus(evidence.json["review-adjudication.json"], "verdict");
  const cost = extractCost(evidence);
  const manifestPaths = evidence.files
    .filter(file => /manifest|runner-record|receipt|lifecycle|spec/i.test(file.relativePath))
    .map(file => file.path);
  const blockers = methodQa.checks.filter(check => check.status === "fail").map(check => check.message);
  const warnings = methodQa.checks.filter(check => check.status === "warning").map(check => check.message);
  if (paperQa && !["pass", "valid", "local_review_ready", "ready"].includes(paperQa)) warnings.push(`Paper QA status is ${paperQa}.`);
  if (literature.status === "fail" || literature.status === "failed") {
    blockers.push("Literature evidence retrieval or QA failed.");
  } else if (literature.status && !["pass", "ready", "succeeded"].includes(literature.status)) {
    warnings.push(`Literature evidence status is ${literature.status}.`);
  }
  if (literature.blockerCount > 0) blockers.push(`Literature QA has ${literature.blockerCount} blocker(s).`);
  if (literature.warningCount > 0) warnings.push(`Literature QA has ${literature.warningCount} warning(s).`);
  if (companionReadiness.status === "missing") {
    blockers.push(`Required companion analysis missing: ${companionReadiness.missingMethods.join(", ") || "unknown companion method"}.`);
  } else if (companionReadiness.status === "unverifiable") {
    blockers.push("Companion-analysis readiness could not be verified from the analysis manifest.");
  } else if (companionReadiness.status === "advisory" && companionReadiness.missingMethods.length) {
    warnings.push(`Advisory companion analysis not yet run: ${companionReadiness.missingMethods.join(", ")}.`);
  }
	  if (feasibilityReadiness.status === "blocked") {
	    blockers.push(`Feasibility readiness blocked promotion: ${feasibilityReadiness.blockers.join("; ") || feasibilityReadiness.nextAction || feasibilityReadiness.verdict || "blocked feasibility evidence"}.`);
	  } else if (feasibilityReadiness.status === "unverifiable") {
	    blockers.push(`Feasibility readiness is unverifiable: ${feasibilityReadiness.nextAction ?? "repair feasibility evidence"}.`);
	  } else if (feasibilityReadiness.status === "warning") {
	    warnings.push(`Feasibility readiness has warnings: ${[...feasibilityReadiness.warnings, ...feasibilityReadiness.requiredModifications, feasibilityReadiness.nextAction].filter(Boolean).slice(0, 3).join("; ") || feasibilityReadiness.verdict || "review feasibility evidence"}.`);
	  } else if (feasibilityReadiness.status === "not_supplied") {
	    warnings.push("Feasibility readiness evidence is not supplied; run or attach feasibility-gate or analysis-run evidence before local review promotion.");
	  }
  if (statsQaReadiness.status === "fail") {
    blockers.push(`Stats QA readiness failed: ${statsQaReadiness.failingChecks.join(", ") || "unknown failed check"}.`);
  } else if (statsQaReadiness.status === "missing" || statsQaReadiness.status === "unreadable") {
    blockers.push(`Stats QA readiness is ${statsQaReadiness.status}.`);
  } else if (statsQaReadiness.status === "warning") {
    warnings.push(`Stats QA readiness has warning checks: ${statsQaReadiness.warningChecks.join(", ") || "review stats-qa.json"}.`);
  } else if (evidence.json["stats-run.json"] && !statsQaReadiness.status) {
    warnings.push("Stats QA readiness is missing from the analysis manifest or stats QA artifact.");
  }
  if (figureReadiness.status === "fail") {
    blockers.push(`Figure QA failed for figure(s): ${figureReadiness.failingFigureIds.join(", ") || "unknown figure"}.`);
  } else if (figureReadiness.status === "warning") {
    warnings.push(`Figure QA needs review: ${figureReadiness.warningFigureIds.join(", ") || figureReadiness.summary || "review figure-qa.json"}.`);
  } else if (figureReadiness.status === "missing") {
    warnings.push("Figure manifest exists but figure-qa.json is missing.");
  }
  if (runnerCapability.status === "backend_blocked") {
    blockers.push(`Runner capability is backend_blocked for ${runnerCapability.method ?? "the selected method"}: ${runnerCapability.reason ?? "validated backend unavailable"}.`);
  } else if (runnerCapability.status === "bounded_approximation") {
    warnings.push(`Runner capability is bounded_approximation for ${runnerCapability.method ?? "the selected method"}; required follow-up: ${runnerCapability.requiredFollowUp.join("; ") || "methods review"}.`);
  } else if (evidence.json["stats-run.json"] && runnerCapability.status === null) {
    warnings.push("Runner capability maturity is missing from the stats-run packet.");
  }
  if (rerunStabilityStatus && !["pass", "stable"].includes(rerunStabilityStatus)) warnings.push(`Rerun stability status is ${rerunStabilityStatus}.`);
  if (reviewerAdjudicationVerdict === "block") blockers.push("External reviewer adjudication blocked the run.");
  else if (reviewerAdjudicationVerdict === "revise") warnings.push("External reviewer adjudication requires revision.");
  else if (reviewerPanelStatus && !["pass"].includes(reviewerPanelStatus) && !reviewerAdjudicationVerdict) warnings.push(`Reviewer panel status is ${reviewerPanelStatus}.`);
  const readiness: RunReadiness = blockers.length ? "blocked" : warnings.length ? "needs_methods_review" : "local_review_ready";
  const artifactHash = stableHash(evidence.files.map(file => ({ path: file.relativePath, bytes: file.bytes, sha256: file.sha256 })));
  const paperPath = evidence.textPaths["paper.md"] ?? findCanonicalArtifactFile(evidence.files, "paper.md")?.path ?? null;
  const manuscriptPath = evidence.textPaths["manuscript.md"] ?? findCanonicalArtifactFile(evidence.files, "manuscript.md")?.path ?? null;
  const nextActionContext = {
    readiness,
    methodQa,
    statsQaReadiness,
    figureReadiness,
    literature,
    companionReadiness,
    feasibilityReadiness,
    runnerCapability,
    reviewerAdjudicationVerdict,
    reviewerPanelStatus,
    runDir: evidence.runDir,
  };
  const result: RunInspectionResult = {
    schemaVersion: 1,
    generatedAtIso: new Date().toISOString(),
    runDir: evidence.runDir,
    readiness,
    blockers,
    warnings: uniqueStrings(warnings),
    cost,
    provenance: {
      analysisSpecPath: evidence.specPath,
      analysisSpecHash: evidence.spec?.specHash ?? null,
      runnerRecordPath: evidence.files.find(file => file.relativePath === "runner-record.json")?.path ?? null,
      manifestPaths,
      artifactCount: evidence.files.length,
      artifactHash,
    },
    qa: {
      methodQaStatus: methodQa.overallStatus,
      methodDecisionReadinessStatus: methodDecision.status,
      methodDecisionRequestedMethod: methodDecision.requestedMethod,
      methodDecisionVerdict: methodDecision.verdict,
      methodDecisionConsistencyStatus: methodDecisionConsistency.status,
      methodDecisionConsistencySummary: methodDecisionConsistency.summary,
      methodDecisionConsistencyMismatchedSources: methodDecisionConsistency.mismatchedSources,
      statsQaReadinessStatus: statsQaReadiness.status,
      statsQaFailingChecks: statsQaReadiness.failingChecks,
      statsQaWarningChecks: statsQaReadiness.warningChecks,
      figureReadinessStatus: figureReadiness.status,
      figureCount: figureReadiness.figureCount,
      figureFailingIds: figureReadiness.failingFigureIds,
      figureWarningIds: figureReadiness.warningFigureIds,
      paperQaStatus: paperQa,
      literatureQaStatus: literature.status,
      manuscriptQaStatus: manuscriptQa,
      lifecycleStatus,
      rerunStabilityStatus,
      reviewerPanelStatus,
      reviewerAdjudicationVerdict,
    },
    literature,
    companionReadiness,
    feasibilityReadiness,
    runnerCapability,
    paperPath,
    manuscriptPath,
    nextRecommendedAction: runInspectionNextAction(nextActionContext),
    recommendedCommands: runInspectionRecommendedCommands(nextActionContext),
    methodQa,
    outPath: null,
    reportPath: null,
  };
  return await writeRunInspectionOutputs(result, opts.outPath, opts.reportPath);
}

export function renderResearchRunInspect(result: RunInspectionResult): string {
  return [
    "research run inspection",
    `  run: ${result.runDir}`,
    `  readiness: ${result.readiness}`,
    `  blockers: ${result.blockers.length}`,
    `  warnings: ${result.warnings.length}`,
    `  cost: ${result.cost.estimatedUsd === null ? "(unknown)" : `$${formatNumber(result.cost.estimatedUsd, 4)}`}`,
    `  artifact count: ${result.provenance.artifactCount}`,
    `  method QA: ${result.qa.methodQaStatus}`,
    `  method decision: ${result.qa.methodDecisionReadinessStatus ?? "(missing)"}${result.qa.methodDecisionRequestedMethod ? ` method=${result.qa.methodDecisionRequestedMethod}` : ""}${result.qa.methodDecisionVerdict ? ` verdict=${result.qa.methodDecisionVerdict}` : ""}`,
    `  method decision consistency: ${result.qa.methodDecisionConsistencyStatus ?? "(missing)"}${result.qa.methodDecisionConsistencyMismatchedSources.length ? ` mismatched=${result.qa.methodDecisionConsistencyMismatchedSources.join(",")}` : ""}`,
    `  stats QA readiness: ${result.qa.statsQaReadinessStatus ?? "(missing)"}${result.qa.statsQaFailingChecks.length ? ` failing=${result.qa.statsQaFailingChecks.join(",")}` : ""}${result.qa.statsQaWarningChecks.length ? ` warnings=${result.qa.statsQaWarningChecks.join(",")}` : ""}`,
    `  figure QA readiness: ${result.qa.figureReadinessStatus ?? "(missing)"}${result.qa.figureCount === null ? "" : ` figures=${result.qa.figureCount}`}${result.qa.figureFailingIds.length ? ` failing=${result.qa.figureFailingIds.join(",")}` : ""}${result.qa.figureWarningIds.length ? ` warnings=${result.qa.figureWarningIds.join(",")}` : ""}`,
    `  paper QA: ${result.qa.paperQaStatus ?? "(missing)"}`,
    `  literature: ${result.literature.status ?? "(missing)"}; sources=${result.literature.sourceCount ?? "?"}; high-quality=${result.literature.highQualitySourceCount ?? "?"}`,
    `  feasibility: ${result.feasibilityReadiness.status ?? "(missing)"}${result.feasibilityReadiness.verdict ? ` verdict=${result.feasibilityReadiness.verdict}` : ""}`,
    `  companions: ${result.companionReadiness.status ?? "(missing)"}; missing=${result.companionReadiness.missingMethods.join(",") || "(none)"}`,
    `  runner capability: ${result.runnerCapability.status ?? "(missing)"}${result.runnerCapability.method ? ` method=${result.runnerCapability.method}` : ""}`,
    `  lifecycle: ${result.qa.lifecycleStatus ?? "(missing)"}`,
    `  rerun stability: ${result.qa.rerunStabilityStatus ?? "(missing)"}`,
    `  external review: ${result.qa.reviewerAdjudicationVerdict ?? result.qa.reviewerPanelStatus ?? "(missing)"}`,
    `  paper: ${result.paperPath ?? "(missing)"}`,
    `  manuscript: ${result.manuscriptPath ?? "(missing)"}`,
    `  next: ${result.nextRecommendedAction}`,
    ...(result.recommendedCommands.length
      ? result.recommendedCommands.map((command, index) => `  command ${index + 1}: ${command}`)
      : ["  commands: (none)"]),
  ].join("\n");
}

export function renderResearchRunInspectJson(result: RunInspectionResult): string {
  return `${JSON.stringify({ schemaVersion: 1, runInspection: result }, null, 2)}\n`;
}

export async function researchExplorePlanCommand(opts: {
  explorationPath: string;
  questionId: string;
  dataset?: DatasetAdapterId;
  methodsReviewNote?: string;
  outPath?: string;
}): Promise<ExplorationPlanResult> {
  const explorationPath = path.resolve(opts.explorationPath);
  const raw = await readJsonMaybe(explorationPath);
  const exploration = unwrapObject(raw, "exploration");
  const questions = Array.isArray(exploration.candidateQuestions) ? exploration.candidateQuestions as Array<Record<string, unknown>> : [];
  const question = questions.find(candidate => candidate.id === opts.questionId);
  if (!question) throw new Error(`candidate question not found: ${opts.questionId}`);
  const clearance = unwrapObject(exploration.explorationBurden, "promotionClearance");
  const clearanceLevel = stringValue(clearance.level) ?? "hold_for_methods_review";
  const promotionStatus = stringValue(question.promotionStatus) ?? "needs_methods_review";
  const methodsReviewNote = opts.methodsReviewNote?.trim() ?? "";
  const blockers = stringArray(question.promotionBlockers);
  if (clearanceLevel === "stop" || promotionStatus === "blocked") blockers.push(...stringArray(clearance.reasons));
  const needsReview = clearanceLevel === "hold_for_methods_review" || promotionStatus === "needs_methods_review";
  if (needsReview && !methodsReviewNote) blockers.push("Methods-review note is required before formal planning.");
  const dataset = opts.dataset ?? inferDatasetFromPath(stringValue(exploration.dataPath) ?? "");
  const routeIntent = stringValue(question.routeIntent) ?? "explanatory_association";
  const modelFamily = modelFamilyFromRouteIntent(routeIntent);
  const archetype = archetypeFromRouteIntent(routeIntent);
  const outcome = stringValue(question.outcome) ?? "OUTCOME_REVIEW_REQUIRED";
  const exposure = stringValue(question.exposure) ?? "EXPOSURE_REVIEW_REQUIRED";
  const researchQuestion = stringValue(question.question) ?? `Is ${exposure} associated with ${outcome}?`;
  const specInput = {
    id: `explore_plan_${stableHash({ explorationPath, questionId: opts.questionId, outcome, exposure }).slice(0, 12)}`,
    researchQuestion,
    dataset,
    variables: { outcome: [outcome], exposure: [exposure], covariates: [] },
    population: {
      description: [`Rows in ${stringValue(exploration.dataPath) ?? "the explored dataset"} after future eligibility review.`],
      filters: [],
    },
    surveyDesign: {},
    inferencePolicy: {
      estimandType: routeIntent === "descriptive_profile" ? "descriptive" : "associational",
      causalClaimsAllowed: false,
      allowedInference: "exploratory_association",
      pValueLanguage: "approximate_only",
    },
    model: {
      family: modelFamily,
      binaryThreshold: routeIntent === "prediction_modeling" || routeIntent === "diagnostic_accuracy" ? 1 : null,
    },
    failurePolicy: { highMissingnessThreshold: 0.35 },
  };
  const migrated = migrateToAnalysisSpecV2(specInput);
  const baseSpec = migrated.spec;
  const specWithoutHash = {
    ...baseSpec,
    dataset,
    archetype,
    estimand: {
      ...baseSpec.estimand,
      type: estimandTypeFromRouteIntent(routeIntent),
      targetQuantity: targetQuantityFromRouteIntent(routeIntent),
      populationLevel: false,
      causalClaimsAllowed: false,
    },
    model: {
      ...baseSpec.model,
      family: modelFamily,
      link: modelFamily === "logistic" ? "logit" : modelFamily === "linear" ? "identity" : null,
      binaryThreshold: modelFamily === "logistic" || modelFamily === "diagnostic_accuracy" || modelFamily === "prediction" ? 1 : null,
      formula: `${outcome} ~ ${exposure}`,
      diagnostics: diagnosticsForModelFamily(modelFamily),
    },
    sensitivityAnalyses: [
      { id: "missingness-boundary", description: "Repeat or bound interpretation under stricter missingness exclusions.", required: true },
      { id: "unadjusted-vs-adjusted", description: "Compare unadjusted association to a prespecified adjusted model after covariate review.", required: routeIntent === "explanatory_association" },
    ],
    artifactExpectations: [
      { path: "analysis-results.json", role: "statistical-results", required: true, validator: "json-schema" },
      { path: "paper.md", role: "reader-facing-report", required: true, validator: "paper-qa" },
      { path: "method-qa.json", role: "methods-aware-qa", required: true, validator: "method-qa" },
      { path: "run-inspection.json", role: "unified-run-inspection", required: true, validator: "run-inspect" },
    ],
    claimPolicy: {
      allowedInference: routeIntent === "prediction_modeling" ? "predictive_performance" as const : "exploratory_association" as const,
      pValueLanguage: "approximate_only" as const,
      causalLanguage: "forbidden" as const,
      actionability: "hypothesis_generating" as const,
    },
  };
  const analysisSpecV2 = { ...specWithoutHash, specHash: stableHash(specWithoutHash) };
  const validation = migrateToAnalysisSpecV2(analysisSpecV2).validation;
  const requiredBeforeExecution = uniqueStrings([
    ...stringArray(question.requiredNextChecks),
    "Confirm the outcome and exposure are not duplicate/proxy variables.",
    "Declare covariates before adjusted inference.",
    "Run method-select/modeling-plan against this spec before execution.",
    "Run method-qa and run-inspect after execution.",
  ]);
  const warnings = uniqueStrings([
    ...stringArray(clearance.reasons),
    ...(needsReview ? ["Exploration handoff requires methods review before execution."] : []),
    ...(validation.issues.map(issue => issue.message)),
  ]);
  const status: ExplorationPlanResult["status"] = blockers.length || validation.status === "blocked"
    ? "blocked"
    : warnings.length ? "needs_methods_review" : "ready_for_spec_review";
  const result: ExplorationPlanResult = {
    schemaVersion: 1,
    generatedAtIso: new Date().toISOString(),
    sourceExplorationPath: explorationPath,
    sourceExplorationSha256: await hashFile(explorationPath),
    questionId: opts.questionId,
    status,
    blockers: uniqueStrings(blockers),
    warnings,
    formalPlan: {
      researchQuestion,
      dataset,
      routeIntent,
      estimandBoundary: "Exploratory hypothesis-generation only until the spec, covariates, missingness, survey/cluster design, and QA gates are reviewed.",
      selectedOutcome: outcome,
      selectedExposure: exposure,
      requiredBeforeExecution,
      recommendedCommands: [
        "agenteer research method-select --question <question> --dataset <dataset> --json",
        "agenteer research modeling-plan --question <question> --target <outcome> --json",
        "agenteer research method-qa --run-dir <run-dir> --json",
        "agenteer research run-inspect --run-dir <run-dir> --json",
      ],
    },
    analysisSpecV2,
    validation,
    nextAction: status === "ready_for_spec_review"
      ? "Review the generated AnalysisSpec V2, bind method selection, then execute a bounded runner."
      : status === "blocked"
        ? "Resolve blockers before execution; do not fit a model from this exploration yet."
        : "Record methods review and strengthen the spec before execution.",
    outPath: null,
  };
  if (opts.outPath) {
    const outPath = path.resolve(opts.outPath);
    await mkdir(path.dirname(outPath), { recursive: true });
    await writeFile(outPath, renderResearchExplorePlanJson({ ...result, outPath }));
    return { ...result, outPath };
  }
  return result;
}

export function renderResearchExplorePlan(result: ExplorationPlanResult): string {
  return [
    "research exploration formal plan",
    `  status: ${result.status}`,
    `  dataset: ${result.formalPlan.dataset}`,
    `  question: ${result.formalPlan.researchQuestion}`,
    `  outcome: ${result.formalPlan.selectedOutcome}`,
    `  exposure: ${result.formalPlan.selectedExposure}`,
    `  validation: ${result.validation.status}`,
    `  blockers: ${result.blockers.length}`,
    `  warnings: ${result.warnings.length}`,
    `  next: ${result.nextAction}`,
  ].join("\n");
}

export function renderResearchExplorePlanJson(result: ExplorationPlanResult): string {
  return `${JSON.stringify({ schemaVersion: 1, explorationPlan: result }, null, 2)}\n`;
}

export async function researchBenchmarkSuiteRunCommand(opts: {
  suiteDir: string;
  outDir?: string;
  outPath?: string;
  reportPath?: string;
}): Promise<ContinuousBenchmarkSuiteResult> {
  const suiteDir = path.resolve(opts.suiteDir);
  const runDirs = await discoverRunDirs(suiteDir);
  const cases: ContinuousBenchmarkCaseResult[] = [];
  for (const runDir of runDirs) {
    const inspection = await researchRunInspectCommand({ runDir });
    const categoryScores = scoreInspection(inspection);
    const score = mean(Object.values(categoryScores));
    cases.push({
      id: path.basename(runDir),
      runDir,
      readiness: inspection.readiness,
      score,
      categoryScores,
      blockers: inspection.blockers,
      warnings: inspection.warnings,
      nextAction: inspection.nextRecommendedAction,
    });
  }
  const passCount = cases.filter(item => item.readiness === "local_review_ready").length;
  const failCount = cases.filter(item => item.readiness === "blocked").length;
  const warningCount = cases.length - passCount - failCount;
  const regressions = cases
    .filter(item => item.score < 0.65 || item.readiness === "blocked")
    .map(item => `${item.id}: score ${formatNumber(item.score, 2)} (${item.readiness})`);
  const result: ContinuousBenchmarkSuiteResult = {
    schemaVersion: 1,
    generatedAtIso: new Date().toISOString(),
    suiteDir,
    caseCount: cases.length,
    passCount,
    warningCount,
    failCount,
    meanScore: mean(cases.map(item => item.score)),
    cases,
    regressions,
    nextAction: regressions.length
      ? "Fix benchmark regressions before promoting framework or research-pipeline changes."
      : cases.length ? "Benchmark suite is passing; add harder archetypes or record this as the new baseline." : "No benchmarkable run directories were found.",
    outPath: null,
    reportPath: null,
  };
  return await writeBenchmarkSuiteOutputs(result, opts.outPath ?? (opts.outDir ? path.join(opts.outDir, "benchmark-suite-run.json") : undefined), opts.reportPath ?? (opts.outDir ? path.join(opts.outDir, "benchmark-suite-run.md") : undefined));
}

export function renderResearchBenchmarkSuiteRun(result: ContinuousBenchmarkSuiteResult): string {
  return [
    "research continuous benchmark suite",
    `  suite: ${result.suiteDir}`,
    `  cases: ${result.caseCount}`,
    `  mean score: ${formatNumber(result.meanScore, 3)}`,
    `  pass/warn/fail: ${result.passCount}/${result.warningCount}/${result.failCount}`,
    `  regressions: ${result.regressions.length}`,
    `  next: ${result.nextAction}`,
  ].join("\n");
}

export function renderResearchBenchmarkSuiteRunJson(result: ContinuousBenchmarkSuiteResult): string {
  return `${JSON.stringify({ schemaVersion: 1, continuousBenchmarkSuite: result }, null, 2)}\n`;
}

export async function researchBenchmarkTrendCommand(opts: {
  historyDir: string;
  outPath?: string;
  reportPath?: string;
}): Promise<ContinuousBenchmarkTrendResult> {
  const historyDir = path.resolve(opts.historyDir);
  const files = (await listFilesRecursive(historyDir)).filter(file => /benchmark-suite-run.*\.json$|continuous-benchmark.*\.json$/i.test(file.relativePath));
  const runs: Array<{ path: string; score: number; regressions: string[]; generatedAtIso: string }> = [];
  for (const file of files) {
    const raw = await readJsonMaybe(file.path);
    const suite = unwrapObject(raw, "continuousBenchmarkSuite");
    const score = numberValue(suite.meanScore);
    if (score !== null) runs.push({ path: file.path, score, regressions: stringArray(suite.regressions), generatedAtIso: stringValue(suite.generatedAtIso) ?? file.relativePath });
  }
  runs.sort((a, b) => a.generatedAtIso.localeCompare(b.generatedAtIso) || a.path.localeCompare(b.path));
  const latest = runs.at(-1) ?? null;
  const previous = runs.at(-2) ?? null;
  const delta = latest && previous ? latest.score - previous.score : null;
  const trend: ContinuousBenchmarkTrendResult["trend"] = delta === null
    ? "insufficient_history"
    : delta < -0.01 ? "regressing"
      : delta > 0.01 ? "improving" : "stable";
  const result: ContinuousBenchmarkTrendResult = {
    schemaVersion: 1,
    generatedAtIso: new Date().toISOString(),
    historyDir,
    runCount: runs.length,
    latestScore: latest?.score ?? null,
    previousScore: previous?.score ?? null,
    delta,
    trend,
    regressions: latest?.regressions ?? [],
    nextAction: trend === "regressing"
      ? "Investigate benchmark regressions before merging research-machine changes."
      : trend === "insufficient_history"
        ? "Run benchmark-suite-run at least twice to establish trend evidence."
        : "Keep benchmark trend artifacts with each substantive framework change.",
    outPath: null,
    reportPath: null,
  };
  return await writeBenchmarkTrendOutputs(result, opts.outPath, opts.reportPath);
}

export function renderResearchBenchmarkTrend(result: ContinuousBenchmarkTrendResult): string {
  return [
    "research benchmark trend",
    `  history: ${result.historyDir}`,
    `  runs: ${result.runCount}`,
    `  latest: ${result.latestScore === null ? "(none)" : formatNumber(result.latestScore, 3)}`,
    `  previous: ${result.previousScore === null ? "(none)" : formatNumber(result.previousScore, 3)}`,
    `  delta: ${result.delta === null ? "(n/a)" : formatNumber(result.delta, 3)}`,
    `  trend: ${result.trend}`,
    `  regressions: ${result.regressions.length}`,
    `  next: ${result.nextAction}`,
  ].join("\n");
}

export function renderResearchBenchmarkTrendJson(result: ContinuousBenchmarkTrendResult): string {
  return `${JSON.stringify({ schemaVersion: 1, benchmarkTrend: result }, null, 2)}\n`;
}

async function collectRunEvidence(runDir: string): Promise<RunEvidence> {
  const resolved = path.resolve(runDir);
  const files = await listFilesRecursive(resolved);
  const json: Record<string, unknown | null> = {};
  const jsonPaths: Record<string, string | null> = {};
  for (const name of knownJsonFiles) {
    const file = findCanonicalArtifactFile(files, name);
    jsonPaths[name] = file?.path ?? null;
    json[name] = file ? await readJsonMaybe(file.path) : null;
  }
  const text: Record<string, string | null> = {};
  const textPaths: Record<string, string | null> = {};
  for (const name of knownTextFiles) {
    const file = findCanonicalArtifactFile(files, name);
    textPaths[name] = file?.path ?? null;
    text[name] = file ? await readTextMaybe(file.path) : null;
  }
  let spec: AnalysisSpecV2 | null = null;
  let specPath: string | null = null;
  for (const name of ["analysis-spec-v2.json", "analysis-spec.json"]) {
    const raw = json[name];
    if (!raw) continue;
    try {
      spec = migrateToAnalysisSpecV2(raw).spec;
      specPath = jsonPaths[name] ?? path.join(resolved, name);
      break;
    } catch {
      // Invalid specs are reported through artifact/method QA instead of making inspection unusable.
    }
  }
  return { runDir: resolved, files, json, jsonPaths, text, textPaths, spec, specPath };
}

function findCanonicalArtifactFile(files: ArtifactInventoryEntry[], basename: string): ArtifactInventoryEntry | null {
  const candidates = files.filter(file => path.basename(file.path) === basename);
  if (!candidates.length) return null;
  return candidates
    .slice()
    .sort((a, b) => {
      const aDepth = a.relativePath.split(path.sep).length;
      const bDepth = b.relativePath.split(path.sep).length;
      const aRepeat = /\brepeat\b/i.test(a.relativePath) ? 1 : 0;
      const bRepeat = /\brepeat\b/i.test(b.relativePath) ? 1 : 0;
      const aEnvelope = /envelope/i.test(a.relativePath) ? 1 : 0;
      const bEnvelope = /envelope/i.test(b.relativePath) ? 1 : 0;
      return aRepeat - bRepeat || aEnvelope - bEnvelope || aDepth - bDepth || a.relativePath.localeCompare(b.relativePath);
    })[0] ?? null;
}

async function listFilesRecursive(root: string): Promise<ArtifactInventoryEntry[]> {
  const out: ArtifactInventoryEntry[] = [];
  async function walk(dir: string): Promise<void> {
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true, encoding: "utf8" });
    } catch {
      return;
    }
    for (const entry of entries) {
      const name = String(entry.name);
      const full = path.join(dir, name);
      if (entry.isDirectory()) {
        if (!["node_modules", ".git", "dist"].includes(name)) await walk(full);
      } else if (entry.isFile()) {
        const info = await stat(full);
        out.push({ path: full, relativePath: path.relative(root, full), bytes: info.size, sha256: await hashFile(full) });
      }
    }
  }
  await walk(root);
  return out.sort((a, b) => a.relativePath.localeCompare(b.relativePath));
}

async function discoverRunDirs(root: string): Promise<string[]> {
  const files = await listFilesRecursive(root);
  const markers = new Set(["analysis-results.json", "stats-run.json", "ml-run.json", "analysis.json", "paper.md", "run-inspection.json"]);
  const candidateDirs = uniqueStrings(files
    .filter(file => markers.has(path.basename(file.path)))
    .map(file => path.dirname(file.path)));
  const sorted = candidateDirs.sort((a, b) => a.length - b.length || a.localeCompare(b));
  const kept: string[] = [];
  for (const dir of sorted) {
    if (kept.some(parent => isSameOrAncestor(parent, dir))) continue;
    kept.push(dir);
  }
  return kept.sort((a, b) => a.localeCompare(b));
}

function isSameOrAncestor(parent: string, child: string): boolean {
  const relative = path.relative(parent, child);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

async function readJsonMaybe(file: string): Promise<unknown | null> {
  try {
    return JSON.parse(await readFile(file, "utf-8")) as unknown;
  } catch {
    return null;
  }
}

async function readTextMaybe(file: string): Promise<string | null> {
  try {
    return await readFile(file, "utf-8");
  } catch {
    return null;
  }
}

async function hashFile(file: string): Promise<string> {
  const hash = createHash("sha256");
  hash.update(await readFile(file));
  return hash.digest("hex");
}

async function writeMethodQaOutputs(result: MethodQaResult, outPath?: string, reportPath?: string): Promise<MethodQaResult> {
  const next = { ...result };
  if (outPath) {
    const resolved = path.resolve(outPath);
    await mkdir(path.dirname(resolved), { recursive: true });
    next.outPath = resolved;
    await writeFile(resolved, renderResearchMethodQaJson(next));
  }
  if (reportPath) {
    const resolved = path.resolve(reportPath);
    await mkdir(path.dirname(resolved), { recursive: true });
    next.reportPath = resolved;
    await writeFile(resolved, renderMethodQaMarkdown(next));
  }
  return next;
}

async function writeRunInspectionOutputs(result: RunInspectionResult, outPath?: string, reportPath?: string): Promise<RunInspectionResult> {
  const next = { ...result };
  if (outPath) {
    const resolved = path.resolve(outPath);
    await mkdir(path.dirname(resolved), { recursive: true });
    next.outPath = resolved;
    await writeFile(resolved, renderResearchRunInspectJson(next));
  }
  if (reportPath) {
    const resolved = path.resolve(reportPath);
    await mkdir(path.dirname(resolved), { recursive: true });
    next.reportPath = resolved;
    await writeFile(resolved, renderRunInspectionMarkdown(next));
  }
  return next;
}

async function writeBenchmarkSuiteOutputs(result: ContinuousBenchmarkSuiteResult, outPath?: string, reportPath?: string): Promise<ContinuousBenchmarkSuiteResult> {
  const next = { ...result };
  if (outPath) {
    const resolved = path.resolve(outPath);
    await mkdir(path.dirname(resolved), { recursive: true });
    next.outPath = resolved;
    await writeFile(resolved, renderResearchBenchmarkSuiteRunJson(next));
  }
  if (reportPath) {
    const resolved = path.resolve(reportPath);
    await mkdir(path.dirname(resolved), { recursive: true });
    next.reportPath = resolved;
    await writeFile(resolved, renderBenchmarkSuiteMarkdown(next));
  }
  return next;
}

async function writeBenchmarkTrendOutputs(result: ContinuousBenchmarkTrendResult, outPath?: string, reportPath?: string): Promise<ContinuousBenchmarkTrendResult> {
  const next = { ...result };
  if (outPath) {
    const resolved = path.resolve(outPath);
    await mkdir(path.dirname(resolved), { recursive: true });
    next.outPath = resolved;
    await writeFile(resolved, renderResearchBenchmarkTrendJson(next));
  }
  if (reportPath) {
    const resolved = path.resolve(reportPath);
    await mkdir(path.dirname(resolved), { recursive: true });
    next.reportPath = resolved;
    await writeFile(resolved, renderBenchmarkTrendMarkdown(next));
  }
  return next;
}

function renderMethodQaMarkdown(result: MethodQaResult): string {
  return [
    "# Methods-Aware QA",
    "",
    `Run directory: ${result.runDir}`,
    "",
    `Overall status: ${result.overallStatus}`,
    "",
    `Readiness: ${result.readiness}`,
    "",
    "## Checks",
    "",
    ...result.checks.map(check => [
      `### ${check.category}: ${check.status}`,
      "",
      check.message,
      "",
      `Recommended action: ${check.recommendedAction}`,
      "",
      check.evidenceRefs.length ? `Evidence: ${check.evidenceRefs.join(", ")}` : "Evidence: none",
      "",
    ].join("\n")),
    "## Next Action",
    "",
    result.nextAction,
    "",
  ].join("\n");
}

function renderRunInspectionMarkdown(result: RunInspectionResult): string {
  return [
    "# Unified Research Run Inspection",
    "",
    `Run directory: ${result.runDir}`,
    "",
    `Readiness: ${result.readiness}`,
    "",
    `Estimated cost: ${result.cost.estimatedUsd === null ? "unknown" : `$${formatNumber(result.cost.estimatedUsd, 4)}`}`,
    "",
    "## QA",
    "",
    `- Method QA: ${result.qa.methodQaStatus}`,
    `- Method decision: ${result.qa.methodDecisionReadinessStatus ?? "missing"}${result.qa.methodDecisionRequestedMethod ? `; method: ${result.qa.methodDecisionRequestedMethod}` : ""}${result.qa.methodDecisionVerdict ? `; verdict: ${result.qa.methodDecisionVerdict}` : ""}`,
    `- Method decision consistency: ${result.qa.methodDecisionConsistencyStatus ?? "missing"}${result.qa.methodDecisionConsistencyMismatchedSources.length ? `; mismatched sources: ${result.qa.methodDecisionConsistencyMismatchedSources.join(", ")}` : ""}${result.qa.methodDecisionConsistencySummary ? `; ${result.qa.methodDecisionConsistencySummary}` : ""}`,
    `- Stats QA readiness: ${result.qa.statsQaReadinessStatus ?? "missing"}${result.qa.statsQaFailingChecks.length ? `; failing checks: ${result.qa.statsQaFailingChecks.join(", ")}` : ""}${result.qa.statsQaWarningChecks.length ? `; warning checks: ${result.qa.statsQaWarningChecks.join(", ")}` : ""}`,
    `- Figure QA readiness: ${result.qa.figureReadinessStatus ?? "missing"}${result.qa.figureCount === null ? "" : `; figures: ${result.qa.figureCount}`}${result.qa.figureFailingIds.length ? `; failing: ${result.qa.figureFailingIds.join(", ")}` : ""}${result.qa.figureWarningIds.length ? `; warnings: ${result.qa.figureWarningIds.join(", ")}` : ""}`,
    `- Paper QA: ${result.qa.paperQaStatus ?? "missing"}`,
    `- Literature QA: ${result.qa.literatureQaStatus ?? "missing"}`,
    `- Manuscript QA: ${result.qa.manuscriptQaStatus ?? "missing"}`,
    `- Lifecycle: ${result.qa.lifecycleStatus ?? "missing"}`,
    `- Rerun stability: ${result.qa.rerunStabilityStatus ?? "missing"}`,
    `- Runner capability: ${result.runnerCapability.status ?? "missing"}${result.runnerCapability.method ? ` (${result.runnerCapability.method})` : ""}`,
    `- Feasibility readiness: ${result.feasibilityReadiness.status ?? "missing"}${result.feasibilityReadiness.verdict ? `; verdict: ${result.feasibilityReadiness.verdict}` : ""}`,
    "",
    "## Literature Evidence",
    "",
    `- Search artifact: ${result.literature.searchPath ?? "missing"}`,
    `- QA artifact: ${result.literature.qaPath ?? "missing"}`,
    `- Context artifact: ${result.literature.contextPath ?? "missing"}`,
    `- Status: ${result.literature.status ?? "missing"}`,
    `- Sources: ${result.literature.sourceCount ?? "unknown"}`,
    `- High-quality sources: ${result.literature.highQualitySourceCount ?? "unknown"}`,
    `- Cited sources: ${result.literature.citedSourceCount ?? "unknown"}`,
    `- Next action: ${result.literature.nextAction ?? "No literature artifact was found for this run."}`,
    "",
    "## Feasibility Readiness",
    "",
    `- Manifest: ${result.feasibilityReadiness.path ?? "missing"}`,
    `- Status: ${result.feasibilityReadiness.status ?? "missing"}`,
    `- Verdict: ${result.feasibilityReadiness.verdict ?? "missing"}`,
    `- Score: ${result.feasibilityReadiness.score === null ? "unknown" : formatNumber(result.feasibilityReadiness.score, 3)}`,
    `- Blockers: ${result.feasibilityReadiness.blockers.join("; ") || "none"}`,
    `- Warnings: ${result.feasibilityReadiness.warnings.join("; ") || "none"}`,
    `- Required modifications: ${result.feasibilityReadiness.requiredModifications.join("; ") || "none"}`,
    `- Next action: ${result.feasibilityReadiness.nextAction ?? "none recorded"}`,
    "",
    "## Companion Analyses",
    "",
    `- Manifest: ${result.companionReadiness.path ?? "missing"}`,
    `- Status: ${result.companionReadiness.status ?? "missing"}`,
    `- Required methods: ${result.companionReadiness.requiredMethods.join(", ") || "none"}`,
    `- Satisfied methods: ${result.companionReadiness.satisfiedMethods.join(", ") || "none"}`,
    `- Missing methods: ${result.companionReadiness.missingMethods.join(", ") || "none"}`,
    "",
    "## Runner Capability",
    "",
    `- Method: ${result.runnerCapability.method ?? "unknown"}`,
    `- Status: ${result.runnerCapability.status ?? "missing"}`,
    `- Reason: ${result.runnerCapability.reason ?? "No runner-capability artifact was found."}`,
    `- Required follow-up: ${result.runnerCapability.requiredFollowUp.join("; ") || "none recorded"}`,
    `- Cannot support: ${result.runnerCapability.cannotSupport.join("; ") || "none recorded"}`,
    "",
    "## Blockers",
    "",
    ...(result.blockers.length ? result.blockers.map(item => `- ${item}`) : ["- None"]),
    "",
    "## Warnings",
    "",
    ...(result.warnings.length ? result.warnings.map(item => `- ${item}`) : ["- None"]),
    "",
    "## Provenance",
    "",
    `- Analysis spec: ${result.provenance.analysisSpecPath ?? "missing"}`,
    `- Runner record: ${result.provenance.runnerRecordPath ?? "missing"}`,
    `- Artifact count: ${result.provenance.artifactCount}`,
    `- Artifact hash: ${result.provenance.artifactHash}`,
    "",
    "## Next Action",
    "",
    result.nextRecommendedAction,
    "",
    "## Recommended Commands",
    "",
    ...(result.recommendedCommands.length
      ? result.recommendedCommands.flatMap(command => ["```bash", command, "```", ""])
      : ["None recorded.", ""]),
  ].join("\n");
}

function renderBenchmarkSuiteMarkdown(result: ContinuousBenchmarkSuiteResult): string {
  return [
    "# Continuous Research Benchmark Suite",
    "",
    `Suite directory: ${result.suiteDir}`,
    "",
    `Mean score: ${formatNumber(result.meanScore, 3)}`,
    "",
    `Pass / warning / fail: ${result.passCount} / ${result.warningCount} / ${result.failCount}`,
    "",
    "## Cases",
    "",
    ...result.cases.map(item => `- ${item.id}: ${formatNumber(item.score, 3)} (${item.readiness})`),
    result.cases.length ? "" : "- No cases discovered.",
    "## Regressions",
    "",
    ...(result.regressions.length ? result.regressions.map(item => `- ${item}`) : ["- None"]),
    "",
    "## Next Action",
    "",
    result.nextAction,
    "",
  ].join("\n");
}

function renderBenchmarkTrendMarkdown(result: ContinuousBenchmarkTrendResult): string {
  return [
    "# Research Benchmark Trend",
    "",
    `History directory: ${result.historyDir}`,
    "",
    `Runs: ${result.runCount}`,
    "",
    `Latest score: ${result.latestScore === null ? "none" : formatNumber(result.latestScore, 3)}`,
    "",
    `Previous score: ${result.previousScore === null ? "none" : formatNumber(result.previousScore, 3)}`,
    "",
    `Delta: ${result.delta === null ? "n/a" : formatNumber(result.delta, 3)}`,
    "",
    `Trend: ${result.trend}`,
    "",
    "## Regressions",
    "",
    ...(result.regressions.length ? result.regressions.map(item => `- ${item}`) : ["- None"]),
    "",
    "## Next Action",
    "",
    result.nextAction,
    "",
  ].join("\n");
}

function renderManuscriptMarkdown(evidence: RunEvidence, methodQa: MethodQaResult): string {
  const existingPaper = evidence.text["paper.md"];
  if (existingPaper && isRichAnalysisPaper(existingPaper)) {
    return renderRichAnalysisManuscript(evidence, methodQa, existingPaper);
  }
  const title = deriveStudyTitle(evidence);
  const question = deriveResearchQuestion(evidence);
  const summary = methodQa.methodSummary;
  const resultBullets = deriveResultBullets(evidence);
  const primaryResult = resultBullets.find(item => !/^The complete-case analytic sample included/i.test(item)) ?? resultBullets[0];
  const limitations = deriveLimitations(evidence, methodQa);
  return [
    `# ${title}`,
    "",
    "## Abstract",
    "",
    `Background: This study analyzes a local research dataset to answer a ${evidence.spec ? "prespecified" : "declared"} clinical or public-health question.`,
    "",
    `Objective: ${question}`,
    "",
    `Design: ${designSentence(evidence, summary)}.`,
    "",
    `Participants: The analyzed sample included ${summary.completeCaseN === null ? "the complete-case rows available in the run artifacts" : `${summary.completeCaseN} complete-case records`}.`,
    "",
    `Methods: ${methodsSentence(evidence, summary)} The analysis used conservative claim language and was reviewed with deterministic methods checks.`,
    "",
    `Results: ${primaryResult ?? "The run produced local analysis artifacts but no extractable numeric result summary."}`,
    "",
    `Conclusion: ${conclusionSentence(evidence, methodQa)}`,
    "",
    "## Introduction",
    "",
    `This analysis asks: ${question} The goal is to summarize a dataset-grounded association, prediction signal, diagnostic-performance estimate, or cohort outcome in a way that is reproducible and clear about its limits.`,
    "",
    "## Methods",
    "",
    "### Study Design And Data Source",
    "",
    `${designSentence(evidence, summary)}. The report is based on local analysis artifacts in the run directory. It should be interpreted as a local research analysis unless an external validation or population-design correction is explicitly documented.`,
    "",
    "### Cohort Construction",
    "",
    `${cohortSentence(evidence, summary)} Missingness, eligibility, and sparse-cell concerns are handled as review items rather than hidden implementation details.`,
    "",
    "### Variables",
    "",
    variableSentence(evidence),
    "",
    "### Statistical Analysis",
    "",
    `${methodsSentence(evidence, summary)} Model diagnostics, missingness checks, semantic plausibility checks, and claim-alignment checks were reviewed before considering the result ready for promotion.`,
    "",
    "### Quality Control",
    "",
    readerFacingQualitySentence(methodQa),
    "",
    "## Results",
    "",
    ...(resultBullets.length ? resultBullets.map(item => `- ${item}`) : ["- No extractable numeric result summary was found in the run artifacts."]),
    "",
    "## Discussion",
    "",
    `${discussionSentence(evidence, methodQa)} These findings should be read as dataset-bound evidence, not as a clinical recommendation or causal proof unless the study design specifically supports that interpretation.`,
    "",
    "## Limitations",
    "",
    ...limitations.map(item => `- ${item}`),
    "",
    "## What This Does And Does Not Show",
    "",
    "- This report shows what the analyzed table or packet produced under the declared local methods.",
    "- It does not establish causality unless a causal design, confounding plan, and sensitivity analysis were explicitly reviewed.",
    "- It does not establish clinical deployability, external validity, or treatment recommendations.",
    "",
    "## Reproducibility",
    "",
    `The run directory contains ${evidence.files.length} artifact(s). The artifact inventory hash is ${stableHash(evidence.files.map(file => ({ path: file.relativePath, sha256: file.sha256 })))}. Companion JSON files contain machine-readable provenance, QA checks, and run inspection data.`,
    "",
  ].join("\n");
}

function isRichAnalysisPaper(markdown: string): boolean {
  const sectionCount = (markdown.match(/^##\s+/gm) ?? []).length;
  const hasModelResults = /^##\s+.*(Model|Cohort Characteristics|Missingness)/gim.test(markdown);
  return markdown.length > 900 && sectionCount >= 6 && hasModelResults;
}

function renderRichAnalysisManuscript(evidence: RunEvidence, methodQa: MethodQaResult, paperMarkdown: string): string {
  const title = deriveStudyTitle(evidence);
  const question = deriveResearchQuestion(evidence);
  const summary = methodQa.methodSummary;
  const sections = markdownSections(paperMarkdown);
  const cohort = sectionContent(sections, "Cohort");
  const methods = [
    renamedSectionContent(sections, "Data Source", "Study Design And Data Source"),
    renamedSectionContent(sections, "Cohort Definition", "Cohort Construction"),
    renamedSectionContent(sections, "Methods", "Statistical Analysis"),
  ].filter(Boolean).join("\n\n").trim();
  const results = sectionContent(
    sections,
    "Cohort Definition",
    "Cohort Characteristics",
    "Mortality Model",
    "ICU Length Of Stay Model",
    "ICU Length-Of-Stay Model",
    "Prolonged ICU Stay Model",
    "Missingness",
  );
  const interpretation = rawSection(sections, "Interpretation") || rawSection(sections, "Discussion");
  const limitations = rawSection(sections, "Limitations");
  const quality = sectionContent(sections, "Quality And Cost Controls", "Artifact Index");
  return [
    `# ${title}`,
    "",
    "## Abstract",
    "",
    `Background: This study analyzes ICU data to answer a prespecified clinical research question: ${question}`,
    "",
    `Objective: ${question}`,
    "",
    `Design: ${designSentence(evidence, summary)}.`,
    "",
    `Participants: ${participantSentence(evidence, summary)}`,
    "",
    `Methods: ${richMethodsAbstractSentence(evidence, summary)}`,
    "",
    `Results: ${richResultsAbstractSentence(evidence)}`,
    "",
    `Conclusion: ${conclusionSentence(evidence, methodQa)}`,
    "",
    "## Introduction",
    "",
    `The ${evidence.spec ? "prespecified" : "declared"} research question was: ${question} The intent is to provide a reproducible local analysis of cohort construction, baseline characteristics, model results, missingness, and limitations, while keeping causal and deployment claims out of scope.`,
    "",
    "## Methods",
    "",
    methods || "The available report did not contain a dedicated methods section. Review the companion analysis artifacts before using this manuscript.",
    "",
    "## Results",
    "",
    cohort || "",
    cohort && results ? "" : "",
    results || "No detailed model or cohort-result sections were extractable from the source report.",
    "",
    "## Discussion",
    "",
    interpretation || discussionSentence(evidence, methodQa),
    "",
    "The findings should be interpreted as local observational evidence from the analyzed ICU cohort. They should not be read as causal estimates, clinical recommendations, or externally validated prediction-model performance unless separate design and validation evidence is added.",
    "",
    "## Limitations",
    "",
    limitations || deriveLimitations(evidence, methodQa).map(item => `- ${item}`).join("\n"),
    "",
    "## What This Does And Does Not Show",
    "",
    "- This report describes the analyzed cohort, model results, missingness, quality checks, and reproducibility evidence.",
    "- It does not establish causality, treatment benefit, clinical deployability, or external validity.",
    "- Prediction or risk-marker language should be interpreted as internal/local evidence unless calibration and validation evidence are provided.",
    "",
    "## Reproducibility",
    "",
    quality || "Quality-control and artifact details are available in companion JSON files.",
    "",
    `Artifact inventory hash: ${stableHash(evidence.files.map(file => ({ path: file.relativePath, sha256: file.sha256 })))}.`,
    "",
  ].filter((line, index, lines) => !(line === "" && lines[index - 1] === "")).join("\n");
}

function markdownSections(markdown: string): Map<string, string> {
  const sections = new Map<string, string>();
  let current: string | null = null;
  let buffer: string[] = [];
  const flush = () => {
    if (current) sections.set(current.toLowerCase(), buffer.join("\n").trim());
    buffer = [];
  };
  for (const line of markdown.split(/\r?\n/)) {
    const match = /^##\s+(.+?)\s*$/.exec(line);
    if (match) {
      flush();
      current = match[1]?.trim() ?? null;
    } else if (current) {
      buffer.push(line);
    }
  }
  flush();
  return sections;
}

function sectionContent(sections: Map<string, string>, ...names: string[]): string {
  return names
    .map(name => {
      const content = sections.get(name.toLowerCase());
      return content ? `### ${name}\n\n${content}` : "";
    })
    .filter(Boolean)
    .join("\n\n")
    .trim();
}

function renamedSectionContent(sections: Map<string, string>, sourceName: string, headingName: string): string {
  const content = sections.get(sourceName.toLowerCase());
  return content ? `### ${headingName}\n\n${content}` : "";
}

function rawSection(sections: Map<string, string>, name: string): string {
  return sections.get(name.toLowerCase()) ?? "";
}

function participantSentence(evidence: RunEvidence, summary: MethodQaResult["methodSummary"]): string {
  const cohortN = bestCohortN(evidence);
  if (cohortN !== null && summary.completeCaseN !== null && cohortN !== summary.completeCaseN) {
    return `The source cohort included ${cohortN} records; the most restrictive model complete-case sample included ${summary.completeCaseN} records.`;
  }
  if (summary.completeCaseN !== null) return `The analytic sample included ${summary.completeCaseN} complete-case records.`;
  if (cohortN !== null) return `The source cohort included ${cohortN} records.`;
  return "The analyzed sample size should be reviewed in the companion analysis artifacts.";
}

function richMethodsAbstractSentence(evidence: RunEvidence, summary: MethodQaResult["methodSummary"]): string {
  const families = summary.detectedModelFamilies.join(", ") || "model-based";
  const predictors = summary.predictorCount === null ? "" : ` with ${summary.predictorCount} modeled predictors`;
  const source = evidence.json["analysis-results.json"] ? "Cohort construction, descriptive summaries, and model outputs were extracted from the runner analysis artifacts." : "Methods were reconstructed from available run artifacts.";
  return `${source} Detected model family: ${families}${predictors}.`;
}

function richResultsAbstractSentence(evidence: RunEvidence): string {
  const modelSummaries = summarizeModels(evidence);
  if (modelSummaries.length) return modelSummaries.join(" ");
  const bullets = deriveResultBullets(evidence);
  return bullets[0] ?? "The run produced local analysis artifacts but no extractable numeric result summary.";
}

function summarizeModels(evidence: RunEvidence): string[] {
  const summaries: string[] = [];
  const result = evidence.json["analysis-results.json"];
  if (!result || typeof result !== "object") return summaries;
  const models = (result as Record<string, unknown>).models;
  if (!models || typeof models !== "object" || Array.isArray(models)) return summaries;
  const mortality = (models as Record<string, unknown>).mortality;
  if (mortality && typeof mortality === "object" && !Array.isArray(mortality)) {
    const record = mortality as Record<string, unknown>;
    const n = numberValue(record.n);
    const events = numberValue(record.events);
    const metrics = record.metrics && typeof record.metrics === "object" ? record.metrics as Record<string, unknown> : {};
    const auroc = numberValue(metrics.auroc);
    const ap = numberValue(metrics.averagePrecision);
    const parts = [`The mortality model included ${n ?? "an extractable number of"} complete-case records`];
    if (events !== null) parts.push(`${events} deaths`);
    if (auroc !== null) parts.push(`AUROC ${formatNumber(auroc, 3)}`);
    if (ap !== null) parts.push(`average precision ${formatNumber(ap, 3)}`);
    summaries.push(`${parts.join(", ")}.`);
  }
  const los = (models as Record<string, unknown>).los;
  if (los && typeof los === "object" && !Array.isArray(los)) {
    const record = los as Record<string, unknown>;
    const n = numberValue(record.n);
    const r2 = numberValue(record.rSquared);
    if (n !== null || r2 !== null) summaries.push(`The ICU length-of-stay model included ${n ?? "an extractable number of"} complete-case records${r2 !== null ? ` with R-squared ${formatNumber(r2, 3)}` : ""}.`);
  }
  return summaries;
}

function buildManuscriptQa(markdown: string, manuscriptPath: string | null, methodQa: MethodQaResult): ManuscriptQaResult {
  const sections = ["Abstract", "Introduction", "Methods", "Results", "Discussion", "Limitations", "What This Does And Does Not Show", "Reproducibility"];
  const sectionStatus = Object.fromEntries(sections.map(section => [section, markdown.includes(`## ${section}`)]));
  const checks: MethodQaCheck[] = [];
  const missingSections = Object.entries(sectionStatus).filter(([, present]) => !present).map(([section]) => section);
  checks.push({
    id: "manuscript_sections",
    category: "artifact_integrity",
    status: missingSections.length ? "fail" : "pass",
    severity: missingSections.length ? "blocker" : "info",
    message: missingSections.length ? `Missing manuscript sections: ${missingSections.join(", ")}.` : "Required manuscript sections are present.",
    evidenceRefs: manuscriptPath ? [manuscriptPath] : [],
    recommendedAction: missingSections.length ? "Regenerate or manually revise the manuscript." : "Continue to method QA and run inspection.",
  });
  const jargonHits = readerFacingJargonHits(markdown);
  checks.push({
    id: "manuscript_reader_language",
    category: "claim_alignment",
    status: jargonHits.length ? "fail" : "pass",
    severity: jargonHits.length ? "major" : "info",
    message: jargonHits.length ? `Internal framework terms were found: ${jargonHits.join(", ")}.` : "Reader-facing manuscript language avoids internal framework jargon.",
    evidenceRefs: manuscriptPath ? [manuscriptPath] : [],
    recommendedAction: jargonHits.length ? "Move framework details to companion artifacts and rewrite the report for researchers/readers." : "Keep this boundary in future generated papers.",
  });
  if (methodQa.overallStatus === "fail") {
    checks.push({
      id: "manuscript_method_blockers",
      category: "claim_alignment",
      status: "fail",
      severity: "blocker",
      message: "The manuscript is not promotable because methods-aware QA has blocker-level findings.",
      evidenceRefs: [methodQa.runDir],
      recommendedAction: "Resolve method QA blockers before publication-style presentation.",
    });
  }
  const sentenceStats = sentenceStatistics(markdown);
  const tooDense = sentenceStats.averageSentenceWords > 32;
  checks.push({
    id: "manuscript_readability",
    category: "claim_alignment",
    status: tooDense ? "warning" : "pass",
    severity: tooDense ? "minor" : "info",
    message: `Average sentence length is ${formatNumber(sentenceStats.averageSentenceWords, 1)} words.`,
    evidenceRefs: manuscriptPath ? [manuscriptPath] : [],
    recommendedAction: tooDense ? "Shorten dense sections before sharing with non-technical readers." : "Readability is acceptable for local review.",
  });
  const blockerCount = checks.filter(check => check.status === "fail").length;
  const warningCount = checks.filter(check => check.status === "warning").length;
  return {
    schemaVersion: 1,
    generatedAtIso: new Date().toISOString(),
    manuscriptPath,
    status: blockerCount ? "fail" : warningCount ? "warning" : "pass",
    checks,
    sectionStatus,
    readability: {
      internalJargonHits: jargonHits,
      sentenceCount: sentenceStats.sentenceCount,
      averageSentenceWords: sentenceStats.averageSentenceWords,
    },
    nextAction: blockerCount ? "Fix manuscript blockers before run promotion." : warningCount ? "Review manuscript warnings before sharing." : "Manuscript is ready for unified run inspection.",
  };
}

function readerFacingQualitySentence(methodQa: MethodQaResult): string {
  const statusLabel = methodQa.overallStatus === "pass"
    ? "No deterministic methods blockers or warnings were found"
    : methodQa.overallStatus === "warning"
      ? "The methods review found advisory issues that need human review"
      : "The methods review found blocker-level issues";
  const readinessLabel = methodQa.readiness === "local_review_ready"
    ? "ready for local scientific review"
    : methodQa.readiness === "needs_methods_review"
      ? "not ready for stronger claims until the advisory methods issues are reviewed"
      : "not ready for scientific interpretation until blocker-level issues are resolved";
  return `${statusLabel}. The analysis is ${readinessLabel}. ${methodQa.nextAction}`;
}

function collectIssueRecords(json: Record<string, unknown | null>): unknown[] {
  const out: unknown[] = [];
  const seen = new Set<unknown>();
  function walk(value: unknown): void {
    if (!value || typeof value !== "object" || seen.has(value)) return;
    seen.add(value);
    if (Array.isArray(value)) {
      for (const item of value) {
        if (typeof item === "string" && item.trim()) out.push({ message: item.trim(), severity: "warning" });
        else walk(item);
      }
      return;
    }
    const record = value as Record<string, unknown>;
    if (typeof record.code === "string" || typeof record.severity === "string" || typeof record.message === "string" || typeof record.issue === "string") out.push(record);
    for (const key of ["issues", "methodIssues", "typedIssues", "warnings", "diagnostics", "checks"]) walk(record[key]);
  }
  for (const value of Object.values(json)) walk(value);
  return out;
}

function collectEstimateLikeRecords(json: Record<string, unknown | null>): Array<Record<string, unknown>> {
  const out: Array<Record<string, unknown>> = [];
  const seen = new Set<unknown>();
  function walk(value: unknown): void {
    if (!value || typeof value !== "object" || seen.has(value) || out.length > 500) return;
    seen.add(value);
    if (Array.isArray(value)) {
      for (const item of value) walk(item);
      return;
    }
    const record = value as Record<string, unknown>;
    const hasEffect = ["estimate", "coefficient", "correlation", "oddsRatio", "odds_ratio", "riskRatio", "risk_ratio", "meanDifference", "mean_difference", "effectEstimate", "effect_estimate", "hazardRatio", "hazard_ratio", "auroc", "auc", "brier_score", "brierScore", "rmse", "r2"].some(key => numberValue(record[key]) !== null);
    const hasP = ["p", "pValue", "p_value", "p.value"].some(key => numberValue(record[key]) !== null);
    const hasCi = ["ciLow", "ci_high", "confidenceInterval", "lower", "upper"].some(key => record[key] !== undefined);
    if ((hasEffect && (hasP || hasCi)) || isDiagnosticEstimateRecord(record) || isPredictionEstimateRecord(record)) out.push(record);
    for (const item of Object.values(record)) walk(item);
  }
  for (const value of Object.values(json)) walk(value);
  return out;
}

function isDiagnosticEstimateRecord(record: Record<string, unknown>): boolean {
  const metrics = [
    "sensitivity",
    "specificity",
    "positive_predictive_value",
    "negative_predictive_value",
    "positiveLikelihoodRatio",
    "negativeLikelihoodRatio",
    "positive_likelihood_ratio",
    "negative_likelihood_ratio",
    "accuracy",
    "prevalence",
  ];
  const hasMetric = metrics.some(key => numberValue(record[key]) !== null);
  const hasDiagnosticCounts = ["true_positive", "false_positive", "true_negative", "false_negative", "tp", "fp", "tn", "fn"].some(key => numberValue(record[key]) !== null);
  const hasInterval = Object.keys(record).some(key => /_(ci_low|ci_high)$|^ci(Low|High)$/.test(key));
  return hasMetric && (hasDiagnosticCounts || hasInterval);
}

function isPredictionEstimateRecord(record: Record<string, unknown>): boolean {
  return ["auroc", "auc", "brier_score", "brierScore", "calibration_slope", "calibrationSlope", "rmse", "r2"].some(key => numberValue(record[key]) !== null);
}

function hasNonPassingSemanticPlausibilityCheck(evidence: RunEvidence): boolean {
  const seen = new Set<unknown>();
  function walk(value: unknown): boolean {
    if (!value || typeof value !== "object" || seen.has(value)) return false;
    seen.add(value);
    if (Array.isArray(value)) return value.some(walk);
    const record = value as Record<string, unknown>;
    const id = stringValue(record.id) ?? stringValue(record.check) ?? stringValue(record.name);
    const status = stringValue(record.status);
    const severity = stringValue(record.severity);
    const detail = stringValue(record.detail) ?? stringValue(record.message) ?? "";
    const isSemanticCheck = /\bsemantic|plausibility\b/i.test([id, detail].filter(Boolean).join(" "));
    if (isSemanticCheck && (status === "fail" || status === "warning" || severity === "blocker" || severity === "major")) return true;
    return Object.values(record).some(walk);
  }
  return walk(evidence.json["stats-qa.json"]) || walk(evidence.json["qa.json"]) || walk(evidence.json["diagnostics.json"]);
}

function detectRunSummary(evidence: RunEvidence, estimates: Array<Record<string, unknown>>): MethodQaResult["methodSummary"] {
  const explicitMethod = primaryStatsMethod(evidence);
  const explicitFamily = explicitMethod ? modelFamilyFromMethodText(explicitMethod) : null;
  const contractFamily = methodContractFamily(evidence);
  const diagnosticOnly = detectedDiagnosticOnly(explicitFamily, estimates);
  const detectedModelFamilies = uniqueStrings([
    ...(contractFamily ? [contractFamily] : []),
    ...(explicitFamily ? [explicitFamily] : []),
    ...(estimates.some(isDiagnosticEstimateRecord) ? ["diagnostic_accuracy"] : []),
    ...(estimates.some(record => numberValue(record.oddsRatio) !== null || numberValue(record.or) !== null) ? ["logistic"] : []),
    ...(estimates.some(record => numberValue(record.riskRatio) !== null || numberValue(record.hazardRatio) !== null) ? ["logistic"] : []),
    ...(evidence.spec ? [evidence.spec.model.family] : []),
  ]).filter(family => !(diagnosticOnly && ["linear", "logistic", "count", "glm"].includes(family)));
  const detectedRunKind = evidence.json["dataset-run.json"] ? "dataset-run"
    : evidence.json["stats-run.json"] ? "stats-run"
      : evidence.json["ml-run.json"] ? "ml-run"
        : evidence.json["analysis.json"] ? "paper-run"
          : "unknown";
  const completeCaseN = bestCompleteCaseN(evidence);
  const eventCount = bestEventCount(evidence);
  const predictorCount = bestPredictorCount(evidence);
  const resultPosture = readerSafeResultPosture(evidence);
  if (!detectedModelFamilies.length && estimates.length) detectedModelFamilies.push("linear");
  return { detectedRunKind, detectedModelFamilies, completeCaseN, eventCount, predictorCount, resultPosture };
}

function primaryStatsMethod(evidence: RunEvidence): string | null {
  const statsConfig = unwrapObject(evidence.json["stats-config.json"]);
  const statsRun = unwrapObject(evidence.json["stats-run.json"]);
  const methodDecision = unwrapObject(evidence.json["method-decision-support.json"]);
  return stringValue(statsConfig.method)
    ?? stringValue(statsRun.method)
    ?? stringValue(methodDecision.requestedMethod)
    ?? stringValue(methodDecision.method)
    ?? firstStringInValue(evidence.json["method-contract.json"], ["method"]);
}

function methodContractFamily(evidence: RunEvidence): string | null {
  const contract = unwrapObject(evidence.json["method-contract.json"]);
  const spec = unwrapObject(contract.statisticalMethodSpec);
  const family = stringValue(spec.family) ?? stringValue(contract.family);
  return family ? normalizeReaderMethodFamily(family) : null;
}

function readerSafeResultPosture(evidence: RunEvidence): string | null {
  const statsRun = unwrapObject(evidence.json["stats-run.json"]);
  const posture = unwrapObject(statsRun.resultPosture);
  const boundary = stringValue(posture.interpretationBoundary);
  if (boundary) return boundary;
  const label = stringValue(posture.label);
  if (label && !containsInternalStatusToken(label)) return label;
  return null;
}

function bestCompleteCaseN(evidence: RunEvidence): number | null {
  const modelNs = modelRecords(evidence).map(model => numberValue(model.n)).filter((value): value is number => value !== null);
  if (modelNs.length) return Math.min(...modelNs);
  return firstNumberInJson(evidence.json, ["completeCaseN", "complete_case_n", "completeCaseEligible", "nComplete", "n"]);
}

function bestEventCount(evidence: RunEvidence): number | null {
  for (const model of modelRecords(evidence)) {
    const events = numberValue(model.events);
    if (events !== null) return events;
  }
  return firstNumberInJson(evidence.json, ["eventCount", "events", "positiveCount", "deaths", "mortalityEvents"]);
}

function bestPredictorCount(evidence: RunEvidence): number | null {
  const counts = modelRecords(evidence)
    .map(model => Array.isArray(model.predictors) ? model.predictors.length : numberValue(model.predictorCount) ?? numberValue(model.nPredictors) ?? numberValue(model.parameterCount))
    .filter((value): value is number => value !== null);
  if (counts.length) return Math.max(...counts);
  return firstNumberInJson(evidence.json, ["predictorCount", "nPredictors", "parameterCount"]);
}

function bestCohortN(evidence: RunEvidence): number | null {
  return firstNumberInJson(evidence.json, ["firstIcuStayRows", "cohortRows", "rowCount", "rows"]);
}

function modelRecords(evidence: RunEvidence): Array<Record<string, unknown>> {
  const records: Array<Record<string, unknown>> = [];
  for (const value of Object.values(evidence.json)) collectModelRecords(value, records);
  return records;
}

function collectModelRecords(value: unknown, records: Array<Record<string, unknown>>): void {
  if (!value || typeof value !== "object") return;
  if (Array.isArray(value)) {
    for (const item of value) collectModelRecords(item, records);
    return;
  }
  const record = value as Record<string, unknown>;
  if (record.models && typeof record.models === "object" && !Array.isArray(record.models)) {
    for (const model of Object.values(record.models as Record<string, unknown>)) {
      if (model && typeof model === "object" && !Array.isArray(model)) records.push(model as Record<string, unknown>);
    }
  }
  for (const item of Object.values(record)) collectModelRecords(item, records);
}

function highMissingnessVariableNames(evidence: RunEvidence, thresholdFraction: number): string[] {
  const names: string[] = [];
  const seen = new Set<unknown>();
  function walk(value: unknown): void {
    if (!value || typeof value !== "object" || seen.has(value)) return;
    seen.add(value);
    if (Array.isArray(value)) {
      for (const item of value) walk(item);
      return;
    }
    const record = value as Record<string, unknown>;
    const fraction = numberValue(record.missingFraction) ?? numberValue(record.missingRate);
    const percent = numberValue(record.missingPercent);
    const missingShare = fraction !== null ? fraction : percent !== null ? percent / 100 : null;
    if (missingShare !== null && missingShare >= thresholdFraction) {
      const name = stringValue(record.column) ?? stringValue(record.variable) ?? stringValue(record.name);
      if (name) names.push(name);
    }
    for (const item of Object.values(record)) walk(item);
  }
  for (const value of Object.values(evidence.json)) walk(value);
  return uniqueStrings(names);
}

function detectedDiagnosticOnly(explicitFamily: string | null, estimates: Array<Record<string, unknown>>): boolean {
  return explicitFamily === "diagnostic_accuracy" || estimates.some(isDiagnosticEstimateRecord);
}

function modelFamilyFromMethodText(method: string): string | null {
  const lower = method.toLowerCase().replace(/[-\s]+/g, "_");
  if (["t_test", "welch_t_test", "paired_t_test", "mann_whitney", "wilcoxon", "anova", "ancova", "kruskal_wallis", "friedman", "chi_square", "fisher_exact", "mcnemar"].some(token => lower.includes(token))) return "core_inference";
  if (lower.includes("correlation")) return "core_inference";
  if (lower.includes("diagnostic_accuracy")) return "diagnostic_accuracy";
  if (lower.includes("logistic")) return "logistic";
  if (lower.includes("linear")) return "linear";
  if (lower.includes("poisson") || lower.includes("negative_binomial")) return "count";
  if (lower.includes("prediction") || lower.includes("classification")) return "prediction";
  if (lower.includes("cluster")) return "clustering";
  if (lower.includes("descriptive")) return "descriptive";
  return null;
}

function normalizeReaderMethodFamily(family: string): string {
  const lower = family.toLowerCase().replace(/[-\s]+/g, "_");
  if (lower === "hypothesis_test" || lower === "core_inference" || lower === "nonparametric") return "core_inference";
  if (lower === "diagnostic_accuracy") return "diagnostic_accuracy";
  if (lower === "negative_binomial" || lower === "poisson" || lower === "count") return "count";
  return lower;
}

function readerMethodFamilyLabel(family: string): string {
  const normalized = normalizeReaderMethodFamily(family);
  switch (normalized) {
    case "core_inference": return "core statistical inference";
    case "diagnostic_accuracy": return "diagnostic accuracy";
    case "glm": return "generalized linear modeling";
    case "count": return "count regression";
    default: return normalized.replace(/_/g, " ");
  }
}

function containsInternalStatusToken(text: string): boolean {
  return /\b(local_review_ready|needs_methods_review|bound_standard_table|exploratory_only|backend_blocked|analysis_spec|analysisspec)\b/i.test(text);
}

function methodQaNextAction(readiness: RunReadiness, checks: MethodQaCheck[]): string {
  if (readiness === "local_review_ready") return "Add this packet to the benchmark suite or proceed to human scientific review.";
  const failing = checks.filter(check => check.status !== "pass");
  const sparseDiagnostic = failing.find(check => /sparse diagnostic/i.test(check.message));
  if (sparseDiagnostic) return "Review sparse diagnostic cell stability, keep precision caveats visible, and consider exact intervals or threshold revision before promotion.";
  const runnerCapability = failing.find(check => check.category === "runner_capability");
  if (runnerCapability) return runnerCapability.recommendedAction;
  const methodSelection = failing.find(check => check.category === "method_selection");
  if (methodSelection) return methodSelection.recommendedAction;
  const claim = failing.find(check => check.category === "claim_alignment");
  if (claim) return claim.recommendedAction;
  const missingness = failing.find(check => check.category === "missingness");
  if (missingness) return missingness.recommendedAction;
  if (readiness === "blocked") return "Resolve blocker-level method QA findings before rerun or promotion.";
  return "Complete method-review warnings, regenerate the manuscript if needed, and rerun inspection.";
}

function isPValueEffectInconsistent(record: Record<string, unknown>): boolean {
  const p = numberValue(record.pValue) ?? numberValue(record.p_value) ?? numberValue(record.p) ?? numberValue(record["p.value"]);
  if (p === null) return false;
  const effect = numberValue(record.oddsRatio) ?? numberValue(record.riskRatio) ?? numberValue(record.estimate) ?? numberValue(record.coefficient) ?? numberValue(record.effectEstimate);
  const ci = extractCi(record);
  if (effect === null || !ci) return false;
  const nullValue = record.oddsRatio !== undefined || record.riskRatio !== undefined ? 1 : 0;
  const excludesNull = ci.low > nullValue || ci.high < nullValue;
  return (p < 0.05 && !excludesNull) || (p >= 0.05 && excludesNull);
}

function extractCi(record: Record<string, unknown>): { low: number; high: number } | null {
  const directLow = numberValue(record.ciLow) ?? numberValue(record.ci_low) ?? numberValue(record.lower) ?? numberValue(record.confLow);
  const directHigh = numberValue(record.ciHigh) ?? numberValue(record.ci_high) ?? numberValue(record.upper) ?? numberValue(record.confHigh);
  if (directLow !== null && directHigh !== null) return { low: Math.min(directLow, directHigh), high: Math.max(directLow, directHigh) };
  const ci = record.confidenceInterval ?? record.ci;
  if (Array.isArray(ci) && ci.length >= 2) {
    const low = numberValue(ci[0]);
    const high = numberValue(ci[1]);
    if (low !== null && high !== null) return { low: Math.min(low, high), high: Math.max(low, high) };
  }
  return null;
}

function refsForExisting(evidence: RunEvidence, names: string[]): string[] {
  return names
    .map(name => evidence.jsonPaths[name] ?? evidence.textPaths[name] ?? findCanonicalArtifactFile(evidence.files, name)?.path ?? null)
    .filter((item): item is string => Boolean(item));
}

function firstStatus(value: unknown, ...keys: string[]): string | null {
  const searchKeys = keys.length ? keys : ["status", "qaStatus", "readiness", "lifecycleStatus"];
  const unwrapped = unwrapAny(value);
  if (!unwrapped || typeof unwrapped !== "object") return null;
  const record = unwrapped as Record<string, unknown>;
  for (const key of searchKeys) {
    if (typeof record[key] === "string") return String(record[key]);
  }
  for (const child of Object.values(record)) {
    if (child && typeof child === "object") {
      const nested = firstStatus(child, ...searchKeys);
      if (nested) return nested;
    }
  }
  return null;
}

function extractLiteratureInspection(evidence: RunEvidence): RunInspectionResult["literature"] {
  const search = unwrapObject(evidence.json["literature-search.json"], "literatureSearch");
  const qa = unwrapObject(evidence.json["literature-qa.json"], "literatureQa");
  const context = unwrapObject(evidence.json["literature-context.json"], "literatureContext");
  const searchSummary = unwrapObject(search.evidenceSummary);
  const contextSummary = unwrapObject(context.sourceSummary);
  const qaSummary = unwrapObject(qa.evidenceSummary);
  const checks = Array.isArray(qa.checks)
    ? qa.checks as Array<Record<string, unknown>>
    : Array.isArray(context.issues) ? context.issues as Array<Record<string, unknown>> : [];
  const blockerCount = checks.filter(check => stringValue(check.status) === "fail" || stringValue(check.severity) === "blocker").length;
  const warningCount = checks.filter(check => stringValue(check.status) === "warning").length;
  const sourceCount =
    numberValue(searchSummary.sourceCount) ??
    numberValue(contextSummary.sourceCount) ??
    numberValue(qaSummary.sourceCount);
  const highQualitySourceCount =
    numberValue(searchSummary.highQualitySourceCount) ??
    numberValue(contextSummary.highQualitySourceCount) ??
    numberValue(qaSummary.highQualitySourceCount);
  const citedSourceCount = Array.isArray(qa.citedSourceIds) ? qa.citedSourceIds.length : null;
  const status =
    firstStatus(evidence.json["literature-qa.json"]) ??
    firstStatus(evidence.json["literature-context.json"]) ??
    firstStatus(evidence.json["literature-search.json"]);
  return {
    searchPath: evidence.jsonPaths["literature-search.json"] ?? null,
    qaPath: evidence.jsonPaths["literature-qa.json"] ?? null,
    contextPath: evidence.jsonPaths["literature-context.json"] ?? null,
    status,
    sourceCount,
    highQualitySourceCount,
    citedSourceCount,
    blockerCount,
    warningCount,
    nextAction: stringValue(qa.nextAction) ?? (Array.isArray(context.followUpSearches) && context.followUpSearches.length
      ? `Run follow-up literature searches: ${context.followUpSearches.slice(0, 3).map(String).join("; ")}`
      : null),
  };
}

function extractCompanionReadinessInspection(evidence: RunEvidence): RunInspectionResult["companionReadiness"] {
  const manifest = unwrapObject(evidence.json["analysis-run-manifest.json"], "analysisRunManifest");
  const companion = unwrapObject(manifest.companionReadiness);
  return {
    status: stringValue(companion.status),
    requiredMethods: stringArray(companion.requiredMethods),
    satisfiedMethods: stringArray(companion.satisfiedMethods),
    missingMethods: stringArray(companion.missingMethods),
    evidenceRefs: stringArray(companion.evidenceRefs),
    path: evidence.jsonPaths["analysis-run-manifest.json"] ?? null,
  };
}

function extractFeasibilityReadinessInspection(evidence: RunEvidence): RunInspectionResult["feasibilityReadiness"] {
  const manifest = unwrapObject(evidence.json["analysis-run-manifest.json"], "analysisRunManifest");
  const readiness = unwrapObject(manifest.feasibilityReadiness);
  return {
    status: stringValue(readiness.status),
    verdict: stringValue(readiness.verdict),
    score: numberValue(readiness.score),
    confidence: numberValue(readiness.confidence),
    blockers: stringArray(readiness.blockers),
    warnings: stringArray(readiness.warnings),
    requiredModifications: stringArray(readiness.requiredModifications),
    nextAction: stringValue(readiness.nextAction),
    evidenceRefs: stringArray(readiness.evidenceRefs),
    path: evidence.jsonPaths["analysis-run-manifest.json"] ?? null,
  };
}

function extractStatsQaReadinessInspection(evidence: RunEvidence): {
  status: string | null;
  failingChecks: string[];
  warningChecks: string[];
  evidenceRefs: string[];
} {
  const manifest = unwrapObject(evidence.json["analysis-run-manifest.json"], "analysisRunManifest");
  const manifestQa = unwrapObject(manifest.qaReadiness);
  const manifestStatus = stringValue(manifestQa.status);
  if (manifestStatus) {
    return {
      status: manifestStatus,
      failingChecks: stringArray(manifestQa.failingChecks),
      warningChecks: stringArray(manifestQa.warningChecks),
      evidenceRefs: stringArray(manifestQa.evidenceRefs).length
        ? stringArray(manifestQa.evidenceRefs)
        : evidence.jsonPaths["analysis-run-manifest.json"] ? [evidence.jsonPaths["analysis-run-manifest.json"]] : [],
    };
  }
  const statsQa = unwrapObject(evidence.json["stats-qa.json"], "statsQa");
  const statsQaStatus = stringValue(statsQa.status);
  if (!statsQaStatus) {
    return { status: null, failingChecks: [], warningChecks: [], evidenceRefs: [] };
  }
  const checks = Array.isArray(statsQa.checks)
    ? statsQa.checks.filter((check): check is Record<string, unknown> => Boolean(check) && typeof check === "object" && !Array.isArray(check))
    : [];
  return {
    status: statsQaStatus,
    failingChecks: checks.filter(check => check.status === "fail").map(check => String(check.id ?? "(unknown)")),
    warningChecks: checks.filter(check => check.status === "warning").map(check => String(check.id ?? "(unknown)")),
    evidenceRefs: evidence.jsonPaths["stats-qa.json"] ? [evidence.jsonPaths["stats-qa.json"]] : [],
  };
}

function extractFigureReadinessInspection(evidence: RunEvidence): {
  status: "pass" | "warning" | "fail" | "missing" | null;
  figureCount: number | null;
  passingFigureCount: number | null;
  failingFigureIds: string[];
  warningFigureIds: string[];
  summary: string | null;
  evidenceRefs: string[];
} {
  const qa = unwrapObject(evidence.json["figure-qa.json"], "figureQa");
  const manifest = unwrapObject(evidence.json["figures.json"]);
  const manifestFigures = Array.isArray(manifest.figures) ? manifest.figures : [];
  const qaPath = evidence.jsonPaths["figure-qa.json"];
  if (!qaPath && evidence.jsonPaths["figures.json"]) {
    return {
      status: "missing",
      figureCount: manifestFigures.length,
      passingFigureCount: null,
      failingFigureIds: [],
      warningFigureIds: [],
      summary: "Figure manifest exists but figure-qa.json is missing.",
      evidenceRefs: [evidence.jsonPaths["figures.json"]].filter((item): item is string => Boolean(item)),
    };
  }
  if (!qaPath) {
    return {
      status: null,
      figureCount: null,
      passingFigureCount: null,
      failingFigureIds: [],
      warningFigureIds: [],
      summary: null,
      evidenceRefs: [],
    };
  }
  const status = stringValue(qa.status);
  const figures = Array.isArray(qa.figures)
    ? qa.figures.filter((figure): figure is Record<string, unknown> => Boolean(figure) && typeof figure === "object" && !Array.isArray(figure))
    : [];
  return {
    status: status === "pass" || status === "warning" || status === "fail" ? status : "warning",
    figureCount: figures.length,
    passingFigureCount: figures.filter(figure => stringValue(figure.status) === "pass").length,
    failingFigureIds: figures.filter(figure => stringValue(figure.status) === "fail").map(figure => stringValue(figure.figureId) ?? stringValue(figure.path) ?? "(unknown)"),
    warningFigureIds: figures.filter(figure => stringValue(figure.status) === "warning").map(figure => stringValue(figure.figureId) ?? stringValue(figure.path) ?? "(unknown)"),
    summary: stringValue(qa.summary),
    evidenceRefs: [qaPath, evidence.jsonPaths["figures.json"]].filter((item): item is string => Boolean(item)),
  };
}

function extractMethodDecisionConsistencyInspection(evidence: RunEvidence, methodQa: MethodQaResult): {
  status: string | null;
  summary: string | null;
  mismatchedSources: string[];
  evidenceRefs: string[];
} {
  const manifest = unwrapObject(evidence.json["analysis-run-manifest.json"], "analysisRunManifest");
  const consistency = unwrapObject(manifest.methodDecisionEvidenceConsistency);
  const manifestStatus = stringValue(consistency.status);
  if (manifestStatus) {
    return {
      status: manifestStatus,
      summary: stringValue(consistency.summary),
      mismatchedSources: stringArray(consistency.mismatchedSources),
      evidenceRefs: stringArray(consistency.evidenceRefs),
    };
  }
  const check = methodQa.checks.find(item => item.id === "method-decision-evidence-consistency");
  if (!check) return { status: null, summary: null, mismatchedSources: [], evidenceRefs: [] };
  return {
    status: check.status,
    summary: check.message,
    mismatchedSources: methodDecisionConsistencySourcesFromMessage(check.message),
    evidenceRefs: check.evidenceRefs,
  };
}

function methodDecisionConsistencySourcesFromMessage(message: string): string[] {
  const known = ["analysis-run-manifest", "stats-run", "method-decision-support", "stats-preflight"];
  return known.filter(source => message.includes(source));
}

function runInspectionNextAction(ctx: {
  runDir: string;
  readiness: RunReadiness;
  methodQa: MethodQaResult;
  statsQaReadiness: ReturnType<typeof extractStatsQaReadinessInspection>;
  figureReadiness: ReturnType<typeof extractFigureReadinessInspection>;
  literature: RunInspectionResult["literature"];
  companionReadiness: RunInspectionResult["companionReadiness"];
  feasibilityReadiness: RunInspectionResult["feasibilityReadiness"];
  runnerCapability: RunnerCapabilityInspection;
  reviewerAdjudicationVerdict: string | null;
  reviewerPanelStatus: string | null;
}): string {
  if (ctx.figureReadiness.status === "fail") {
    return `Repair or regenerate failed figure artifact(s), rerun figure QA, and rerun inspection: ${ctx.figureReadiness.failingFigureIds.join(", ") || "unknown figure"}.`;
  }
  if (ctx.statsQaReadiness.status === "fail") {
    return `Resolve failed stats QA check(s) and rerun inspection: ${ctx.statsQaReadiness.failingChecks.join(", ") || "unknown failed check"}.`;
  }
  if (ctx.statsQaReadiness.status === "missing" || ctx.statsQaReadiness.status === "unreadable") {
    return `Regenerate stats QA before promotion; stats QA readiness is ${ctx.statsQaReadiness.status}.`;
  }
  if (ctx.feasibilityReadiness.status === "blocked") {
    return `Repair blocked feasibility evidence before rerun or promotion: ${ctx.feasibilityReadiness.blockers.join("; ") || ctx.feasibilityReadiness.nextAction || "blocked feasibility evidence"}.`;
  }
	  if (ctx.feasibilityReadiness.status === "unverifiable") {
	    return `Repair or regenerate feasibility evidence before promotion: ${ctx.feasibilityReadiness.nextAction ?? "unverifiable feasibility evidence"}.`;
	  }
	  if (ctx.feasibilityReadiness.status === "not_supplied") {
	    return "Run or attach feasibility-gate or analysis-run feasibility evidence, regenerate the analysis manifest, and rerun inspection before promotion.";
	  }
  if (ctx.companionReadiness.status === "missing") {
    return `Run or attach required companion analysis before promotion: ${ctx.companionReadiness.missingMethods.join(", ") || "unknown companion method"}.`;
  }
  if (ctx.companionReadiness.status === "unverifiable") {
    return "Repair or regenerate analysis manifest evidence so companion-analysis readiness can be verified.";
  }
  if (ctx.runnerCapability.status === "backend_blocked") {
    return `Route to a validated backend or redesign before promotion: ${ctx.runnerCapability.requiredFollowUp.join(" ") || ctx.runnerCapability.reason || "backend unavailable"}.`;
  }
  if (ctx.reviewerAdjudicationVerdict === "block") {
    return "Resolve external reviewer adjudication blockers, rerun affected stages, and re-review before promotion.";
  }
  if (ctx.figureReadiness.status === "missing") {
    return "Run figure QA for the existing figure manifest, then rerun unified inspection.";
  }
  if (ctx.figureReadiness.status === "warning") {
    return `Review figure QA warning(s), repair visual artifacts if needed, and rerun inspection: ${ctx.figureReadiness.warningFigureIds.join(", ") || ctx.figureReadiness.summary || "figure QA warning"}.`;
  }
  if (ctx.statsQaReadiness.status === "warning") {
    return `Resolve or justify stats QA warning check(s) before promotion: ${ctx.statsQaReadiness.warningChecks.join(", ") || "review stats-qa.json"}.`;
  }
  if (ctx.feasibilityReadiness.status === "warning") {
    return `Resolve or explicitly accept feasibility warning(s) before promotion: ${[...ctx.feasibilityReadiness.warnings, ...ctx.feasibilityReadiness.requiredModifications, ctx.feasibilityReadiness.nextAction].filter(Boolean).slice(0, 3).join("; ") || "review feasibility evidence"}.`;
  }
  if (ctx.literature.blockerCount > 0 || ctx.literature.status === "fail" || ctx.literature.status === "failed") {
    return "Repair literature retrieval or literature QA blockers before promotion.";
  }
  if (ctx.literature.warningCount > 0) {
    return "Review literature QA warnings and rerun inspection after updating literature context or claims.";
  }
  if (ctx.runnerCapability.status === "bounded_approximation") {
    return `Complete required backend/method follow-up before stronger claims: ${ctx.runnerCapability.requiredFollowUp.join("; ") || ctx.runnerCapability.reason || "bounded approximation"}.`;
  }
  if (ctx.reviewerAdjudicationVerdict === "revise" || ctx.reviewerPanelStatus && ctx.reviewerPanelStatus !== "pass") {
    return "Address external reviewer revisions, rerun affected stages, and re-review before promotion.";
  }
  return methodQaNextAction(ctx.readiness, ctx.methodQa.checks);
}

function runInspectionRecommendedCommands(ctx: {
  runDir: string;
  readiness: RunReadiness;
  statsQaReadiness: ReturnType<typeof extractStatsQaReadinessInspection>;
  figureReadiness: ReturnType<typeof extractFigureReadinessInspection>;
  feasibilityReadiness: RunInspectionResult["feasibilityReadiness"];
  companionReadiness: RunInspectionResult["companionReadiness"];
  reviewerAdjudicationVerdict: string | null;
  reviewerPanelStatus: string | null;
}): string[] {
  const commands: string[] = [];
  const rerunInspection = `agenteer research run-inspect --run-dir ${quoteShellArg(ctx.runDir)} --out ${quoteShellArg(path.join(ctx.runDir, "run-inspection.json"))} --report ${quoteShellArg(path.join(ctx.runDir, "run-inspection.md"))} --json`;
  const add = (command: string | null) => {
    if (command && !commands.includes(command)) commands.push(command);
  };

  if (ctx.figureReadiness.status === "missing" || ctx.figureReadiness.status === "fail" || ctx.figureReadiness.status === "warning") {
    add(figureQaCommand(ctx.figureReadiness));
    add(rerunInspection);
  }
  if (ctx.statsQaReadiness.status === "missing" || ctx.statsQaReadiness.status === "unreadable" || ctx.statsQaReadiness.status === "fail" || ctx.statsQaReadiness.status === "warning") {
    add(`agenteer research method-qa --run-dir ${quoteShellArg(ctx.runDir)} --out ${quoteShellArg(path.join(ctx.runDir, "method-qa.json"))} --report ${quoteShellArg(path.join(ctx.runDir, "method-qa.md"))} --json`);
    add(rerunInspection);
  }
	  if (ctx.feasibilityReadiness.status === "blocked" || ctx.feasibilityReadiness.status === "unverifiable" || ctx.feasibilityReadiness.status === "warning" || ctx.feasibilityReadiness.status === "not_supplied") {
	    add(`agenteer research analysis-manifest --run-dir ${quoteShellArg(ctx.runDir)} --out ${quoteShellArg(path.join(ctx.runDir, "analysis-run-manifest.json"))} --json`);
	    add(rerunInspection);
	  }
  if (ctx.companionReadiness.status === "missing" || ctx.companionReadiness.status === "unverifiable") {
    add(`agenteer research analysis-manifest --run-dir ${quoteShellArg(ctx.runDir)} --out ${quoteShellArg(path.join(ctx.runDir, "analysis-run-manifest.json"))} --json`);
    add(rerunInspection);
  }
  if (ctx.reviewerAdjudicationVerdict === "block" || ctx.reviewerAdjudicationVerdict === "revise" || ctx.reviewerPanelStatus && ctx.reviewerPanelStatus !== "pass") {
    add(`agenteer research study-critic --run-dir ${quoteShellArg(ctx.runDir)} --stage final --json`);
    add(rerunInspection);
  }
  if (!commands.length && ctx.readiness !== "local_review_ready") {
    add(rerunInspection);
  }
  return commands;
}

function figureQaCommand(figureReadiness: ReturnType<typeof extractFigureReadinessInspection>): string | null {
  const manifestPath = figureReadiness.evidenceRefs.find(ref => path.basename(ref) === "figures.json");
  if (!manifestPath) return null;
  const dir = path.dirname(manifestPath);
  return [
    "agenteer research figure-qa",
    `--figures ${quoteShellArg(manifestPath)}`,
    `--out ${quoteShellArg(path.join(dir, "figure-qa.json"))}`,
    `--report ${quoteShellArg(path.join(dir, "figure-qa.md"))}`,
  ].join(" ");
}

function quoteShellArg(value: string): string {
  return JSON.stringify(value);
}

function extractMethodDecisionInspection(evidence: RunEvidence): {
  status: "preferred" | "review_required" | "blocked" | "missing" | null;
  requestedMethod: string | null;
  requestedRole: string | null;
  verdict: string | null;
  primaryMethods: string[];
  sensitivityMethods: string[];
  fallbackMethods: string[];
  nextAction: string | null;
  evidenceRefs: string[];
} {
  const manifest = unwrapObject(evidence.json["analysis-run-manifest.json"], "analysisRunManifest");
  const manifestDecision = unwrapObject(manifest.methodDecisionReadiness);
  const manifestStatus = stringValue(manifestDecision.status);
  if (manifestStatus) {
    const status = methodDecisionStatus(manifestStatus);
    return {
      status,
      requestedMethod: stringValue(manifestDecision.requestedMethod),
      requestedRole: stringValue(manifestDecision.requestedRole),
      verdict: stringValue(manifestDecision.verdict),
      primaryMethods: stringArray(manifestDecision.primaryMethods),
      sensitivityMethods: stringArray(manifestDecision.sensitivityMethods),
      fallbackMethods: stringArray(manifestDecision.fallbackMethods),
      nextAction: stringValue(manifestDecision.nextAction),
      evidenceRefs: uniqueStrings([
        ...stringArray(manifestDecision.evidenceRefs),
        ...(evidence.jsonPaths["analysis-run-manifest.json"] ? [evidence.jsonPaths["analysis-run-manifest.json"]] : []),
      ]),
    };
  }

  const statsRun = unwrapObject(evidence.json["stats-run.json"], "statsRun");
  const statsRunDecision = unwrapObject(unwrapObject(unwrapObject(statsRun.diagnostics).preflight).methodDecisionSupport);
  if (hasMethodDecisionShape(statsRunDecision)) {
    return methodDecisionFromRecord(statsRunDecision, [evidence.jsonPaths["stats-run.json"]]);
  }

  const decisionFile = unwrapObject(evidence.json["method-decision-support.json"], "methodDecisionSupport");
  if (hasMethodDecisionShape(decisionFile)) {
    return methodDecisionFromRecord(decisionFile, [
      evidence.jsonPaths["method-decision-support.json"],
      evidence.textPaths["method-decision-support.md"],
    ]);
  }

  const statsPreflight = unwrapObject(evidence.json["stats-preflight.json"], "statsPreflight");
  const preflightDecision = unwrapObject(statsPreflight.methodDecisionSupport);
  if (hasMethodDecisionShape(preflightDecision)) {
    return methodDecisionFromRecord(preflightDecision, [
      evidence.jsonPaths["stats-preflight.json"],
      evidence.textPaths["stats-preflight.md"],
    ]);
  }

  return {
    status: evidence.json["stats-run.json"] ? "missing" : null,
    requestedMethod: stringValue(statsRun.method),
    requestedRole: null,
    verdict: null,
    primaryMethods: [],
    sensitivityMethods: [],
    fallbackMethods: [],
    nextAction: evidence.json["stats-run.json"]
      ? "Regenerate the stats run with method-decision support artifacts before promotion."
      : null,
    evidenceRefs: evidence.json["stats-run.json"]
      ? uniqueStrings([
        path.join(evidence.runDir, "method-decision-support.json"),
        path.join(evidence.runDir, "method-decision-support.md"),
        ...refsForExisting(evidence, ["stats-run.json", "stats-preflight.json"]),
      ])
      : [],
  };
}

function inspectMethodDecisionEvidenceConsistency(evidence: RunEvidence): {
  status: "pass" | "warning";
  message: string;
  evidenceRefs: string[];
} {
  const sources = methodDecisionEvidenceSources(evidence);
  if (sources.length < 2) {
    return {
      status: "pass",
      message: sources.length === 1
        ? `One method-decision evidence source was found (${sources[0]?.label}).`
        : "No method-decision evidence sources were available for consistency comparison.",
      evidenceRefs: uniqueStrings(sources.flatMap(source => source.evidenceRefs)),
    };
  }
  const signatures = new Map<string, string[]>();
  for (const source of sources) {
    const labels = signatures.get(source.signature) ?? [];
    labels.push(source.label);
    signatures.set(source.signature, labels);
  }
  if (signatures.size <= 1) {
    return {
      status: "pass",
      message: `Method-decision evidence is consistent across ${sources.map(source => source.label).join(", ")}.`,
      evidenceRefs: uniqueStrings(sources.flatMap(source => source.evidenceRefs)),
    };
  }
  const summary = sources
    .map(source => `${source.label}: method=${source.requestedMethod ?? "missing"}, role=${source.requestedRole ?? "missing"}, verdict=${source.verdict ?? "missing"}, primary=${source.primaryMethods.join("/") || "missing"}`)
    .join("; ");
  return {
    status: "warning",
    message: `Method-decision evidence is contradictory across artifacts. ${summary}.`,
    evidenceRefs: uniqueStrings(sources.flatMap(source => source.evidenceRefs)),
  };
}

function methodDecisionEvidenceSources(evidence: RunEvidence): Array<{
  label: string;
  requestedMethod: string | null;
  requestedRole: string | null;
  verdict: string | null;
  primaryMethods: string[];
  signature: string;
  evidenceRefs: string[];
}> {
  const out: Array<{
    label: string;
    requestedMethod: string | null;
    requestedRole: string | null;
    verdict: string | null;
    primaryMethods: string[];
    signature: string;
    evidenceRefs: string[];
  }> = [];
  const push = (label: string, record: Record<string, unknown>, evidenceRefs: Array<string | null | undefined>, manifest = false) => {
    if (!hasMethodDecisionShape(record) && !stringValue(record.status)) return;
    const requestedMethod = stringValue(record.requestedMethod);
    const requestedRole = stringValue(record.requestedRole);
    const verdict = stringValue(record.verdict) ?? (manifest ? stringValue(record.status) : null);
    const primaryMethods = manifest ? stringArray(record.primaryMethods) : methodNamesFromDecisionRecords(record.primaryMethods);
    const sensitivityMethods = manifest ? stringArray(record.sensitivityMethods) : methodNamesFromDecisionRecords(record.sensitivityMethods);
    const fallbackMethods = manifest ? stringArray(record.fallbackMethods) : methodNamesFromDecisionRecords(record.fallbackMethods);
    out.push({
      label,
      requestedMethod,
      requestedRole,
      verdict,
      primaryMethods,
      signature: JSON.stringify({
        requestedMethod,
        requestedRole,
        verdict,
        primaryMethods: [...primaryMethods].sort(),
        sensitivityMethods: [...sensitivityMethods].sort(),
        fallbackMethods: [...fallbackMethods].sort(),
      }),
      evidenceRefs: uniqueStrings(evidenceRefs.filter((item): item is string => Boolean(item))),
    });
  };

  const manifest = unwrapObject(evidence.json["analysis-run-manifest.json"], "analysisRunManifest");
  push("analysis-run-manifest", unwrapObject(manifest.methodDecisionReadiness), [evidence.jsonPaths["analysis-run-manifest.json"]], true);

  const statsRun = unwrapObject(evidence.json["stats-run.json"], "statsRun");
  const statsRunDecision = unwrapObject(unwrapObject(unwrapObject(statsRun.diagnostics).preflight).methodDecisionSupport);
  push("stats-run", statsRunDecision, [evidence.jsonPaths["stats-run.json"]]);

  const decisionFile = unwrapObject(evidence.json["method-decision-support.json"], "methodDecisionSupport");
  push("method-decision-support", decisionFile, [
    evidence.jsonPaths["method-decision-support.json"],
    evidence.textPaths["method-decision-support.md"],
  ]);

  const statsPreflight = unwrapObject(evidence.json["stats-preflight.json"], "statsPreflight");
  push("stats-preflight", unwrapObject(statsPreflight.methodDecisionSupport), [
    evidence.jsonPaths["stats-preflight.json"],
    evidence.textPaths["stats-preflight.md"],
  ]);

  return out;
}

function hasMethodDecisionShape(value: Record<string, unknown>): boolean {
  return Boolean(
    stringValue(value.verdict) ||
    stringValue(value.requestedMethod) ||
    stringValue(value.requestedRole) ||
    stringArray(value.primaryMethods).length ||
    stringArray(value.sensitivityMethods).length ||
    stringArray(value.fallbackMethods).length ||
    Array.isArray(value.primaryMethods) ||
    Array.isArray(value.sensitivityMethods) ||
    Array.isArray(value.fallbackMethods),
  );
}

function methodDecisionFromRecord(value: Record<string, unknown>, evidenceRefs: Array<string | null | undefined>): ReturnType<typeof extractMethodDecisionInspection> {
  const verdict = stringValue(value.verdict);
  return {
    status: methodDecisionStatus(verdict),
    requestedMethod: stringValue(value.requestedMethod),
    requestedRole: stringValue(value.requestedRole),
    verdict,
    primaryMethods: methodNamesFromDecisionRecords(value.primaryMethods),
    sensitivityMethods: methodNamesFromDecisionRecords(value.sensitivityMethods),
    fallbackMethods: methodNamesFromDecisionRecords(value.fallbackMethods),
    nextAction: stringValue(value.nextAction),
    evidenceRefs: uniqueStrings(evidenceRefs.filter((item): item is string => Boolean(item))),
  };
}

function methodDecisionStatus(value: string | null): "preferred" | "review_required" | "blocked" | "missing" | null {
  if (value === "blocked") return "blocked";
  if (value === "preferred") return "preferred";
  if (value === "missing") return "missing";
  if (value === "review_required" || value === "acceptable_sensitivity" || value === "fallback_only" || value === "not_recommended") return "review_required";
  return value ? "review_required" : "missing";
}

function methodNamesFromDecisionRecords(value: unknown): string[] {
  if (!Array.isArray(value)) return stringArray(value);
  return uniqueStrings(value.map(item => {
    if (typeof item === "string") return item;
    if (item && typeof item === "object" && !Array.isArray(item)) return stringValue((item as Record<string, unknown>).method) ?? "";
    return "";
  }));
}

function extractRunnerCapabilityInspection(evidence: RunEvidence): RunnerCapabilityInspection {
  const statsRun = unwrapObject(evidence.json["stats-run.json"], "statsRun");
  const methodContract = unwrapObject(evidence.json["method-contract.json"]);
  const contractSpec = unwrapObject(methodContract.statisticalMethodSpec);
  const statsCapability = unwrapObject(statsRun.runnerCapability);
  const contractCapability = unwrapObject(methodContract.runnerCapability);
  const capability = stringValue(statsCapability.status) ? statsCapability : contractCapability;
  const rawStatus = stringValue(capability.status);
  const status = rawStatus === "executable" || rawStatus === "bounded_approximation" || rawStatus === "backend_blocked"
    ? rawStatus
    : null;
  return {
    method: stringValue(capability.method) ?? stringValue(statsRun.method) ?? stringValue(contractSpec.method),
    status,
    reason: stringValue(capability.reason),
    requiredFollowUp: stringArray(capability.requiredFollowUp),
    cannotSupport: stringArray(capability.cannotSupport),
    evidenceRefs: refsForExisting(evidence, ["stats-run.json", "method-contract.json"]),
  };
}

function extractCost(evidence: RunEvidence): RunInspectionResult["cost"] {
  const raw = evidence.json["cost-receipt.json"] ?? evidence.json["dataset-run.json"] ?? evidence.json["run-manifest.json"];
  const estimatedUsd = firstNumberInValue(raw, ["estimatedUsd", "costUsd", "totalUsd", "usd"]);
  const hardStopUsd = firstNumberInValue(raw, ["hardStopUsd", "maxUsd", "budgetUsd"]);
  return { estimatedUsd, hardStopUsd, source: raw ? refsForExisting(evidence, ["cost-receipt.json", "dataset-run.json", "run-manifest.json"])[0] ?? null : null };
}

function readerFacingJargonHits(text: string): string[] {
  if (!text) return [];
  const patterns: Array<[string, RegExp]> = [
    ["Agenteer", /\bAgenteer\b/i],
    ["AnalysisSpec", /\bAnalysisSpec\b/i],
    ["result posture", /\bresult posture\b/i],
    ["task envelope", /\btask envelope\b/i],
    ["evidence receipt", /\bevidence receipt\b/i],
    ["runner record", /\brunner record\b/i],
    ["local_review_ready", /\blocal_review_ready\b/i],
    ["needs_methods_review", /\bneeds_methods_review\b/i],
  ];
  return patterns.filter(([, pattern]) => pattern.test(text)).map(([label]) => label);
}

function containsUnsupportedCausalClaim(text: string): boolean {
  if (!text) return false;
  const causalPattern = /\b(cause[sd]?|causal|causality|effect of|leads to|prevents|reduces risk|increases risk)\b/i;
  const safeLimitationPattern = /\b(does not|do not|did not|cannot|can not|not|no|without|insufficient to|should not)\b[^.!?]{0,80}\b(cause[sd]?|causal|causality|causal proof|causal inference)\b/i;
  return text
    .split(/[.!?]\s+/)
    .map(sentence => sentence.trim())
    .filter(Boolean)
    .some(sentence => causalPattern.test(sentence) && !safeLimitationPattern.test(sentence));
}

function scoreInspection(inspection: RunInspectionResult): Record<string, number> {
  const artifacts = inspection.provenance.artifactCount > 0 ? 1 : 0;
  const method = inspection.qa.methodQaStatus === "pass" ? 1 : inspection.qa.methodQaStatus === "warning" ? 0.6 : 0;
  const paper = inspection.paperPath || inspection.manuscriptPath ? 1 : 0;
  const qa = inspection.qa.paperQaStatus && ["pass", "valid", "ready"].includes(inspection.qa.paperQaStatus) ? 1 : inspection.qa.paperQaStatus ? 0.6 : 0.3;
  const lifecycle = inspection.qa.lifecycleStatus && /ready|succeeded|valid|complete/i.test(inspection.qa.lifecycleStatus) ? 1 : inspection.qa.lifecycleStatus ? 0.6 : 0.3;
  const rerun = inspection.qa.rerunStabilityStatus === "pass" || inspection.qa.rerunStabilityStatus === "stable" ? 1 : inspection.qa.rerunStabilityStatus ? 0.5 : 0.3;
  const cost = inspection.cost.estimatedUsd === null ? 0.7 : inspection.cost.estimatedUsd <= (inspection.cost.hardStopUsd ?? 1) ? 1 : 0;
  return {
    packetCompleteness: artifacts,
    methodsCorrectness: method,
    reportReadability: paper,
    qaPassFail: qa,
    lifecycleInspection: lifecycle,
    rerunStability: rerun,
    costDiscipline: cost,
    artifactIntegrity: inspection.provenance.artifactHash ? 1 : 0,
  };
}

function deriveStudyTitle(evidence: RunEvidence): string {
  if (evidence.spec?.title) return evidence.spec.title;
  const contextQuestion = evidence.text["reviewer-context.md"]?.match(/^Research question:\s*(.+)$/im)?.[1]?.trim();
  if (contextQuestion) return contextQuestion.length < 90 ? contextQuestion.replace(/[?.!]\s*$/, "") : "Dataset-Grounded Research Analysis";
  const title = firstStringInJson(evidence.json, ["title"]);
  if (title) return title.replace(/[?.!]\s*$/, "");
  const question = deriveResearchQuestion(evidence);
  return question.length < 90 ? question.replace(/[?.!]\s*$/, "") : "Dataset-Grounded Research Analysis";
}

function deriveResearchQuestion(evidence: RunEvidence): string {
  if (evidence.spec?.researchQuestion) return evidence.spec.researchQuestion;
  const contextQuestion = evidence.text["reviewer-context.md"]?.match(/^Research question:\s*(.+)$/im)?.[1]?.trim();
  if (contextQuestion) return contextQuestion;
  const question = firstStringInJson(evidence.json, ["researchQuestion", "question"]);
  if (question) return question;
  return "What does the analyzed dataset show for the declared study question?";
}

function deriveResultBullets(evidence: RunEvidence): string[] {
  const bullets: string[] = [];
  const result = evidence.json["analysis-results.json"] ?? evidence.json["stats-run.json"] ?? evidence.json["analysis.json"] ?? evidence.json["ml-run.json"];
  const n = firstNumberInValue(result, ["completeCaseN", "completeCaseEligible", "n", "rowCount"]);
  if (n !== null) bullets.push(`The complete-case analytic sample included ${n} records.`);
  for (const estimate of primaryEstimateRecords(result).slice(0, 4)) {
    const summary = estimateSummarySentence(estimate);
    if (summary) bullets.push(summary);
  }
  const effect = bullets.length <= 1 ? firstNumberInValue(result, ["oddsRatio", "riskRatio", "estimate", "coefficient", "effectEstimate", "auroc", "auc", "r2", "rmse"]) : null;
  const p = firstNumberInValue(result, ["pValue", "p_value", "p"]);
  if (effect !== null && p !== null) bullets.push(`The primary numeric estimate was ${formatNumber(effect, 4)} with p-value ${formatNumber(p, 4)}.`);
  else if (effect !== null) bullets.push(`The primary numeric estimate was ${formatNumber(effect, 4)}.`);
  const qaStatus = firstStringInValue(evidence.json["qa.json"], ["status"]);
  if (qaStatus) bullets.push(`The original runner quality-control status was ${qaStatus}.`);
  return uniqueStrings(bullets);
}

function primaryEstimateRecords(value: unknown): Array<Record<string, unknown>> {
  const out: Array<Record<string, unknown>> = [];
  const seen = new Set<unknown>();
  function walk(candidate: unknown): void {
    if (!candidate || typeof candidate !== "object" || seen.has(candidate) || out.length > 20) return;
    seen.add(candidate);
    if (Array.isArray(candidate)) {
      for (const item of candidate) walk(item);
      return;
    }
    const record = candidate as Record<string, unknown>;
    if (["estimate", "coefficient", "correlation", "oddsRatio", "odds_ratio", "riskRatio", "risk_ratio", "hazardRatio", "hazard_ratio", "mean_difference", "statistic", "f_statistic", "chi_square", "cramers_v", "auroc", "auc", "brier_score", "rmse", "r2", "sensitivity", "specificity", "positive_predictive_value", "negative_predictive_value", "survival", "final_cumulative_incidence"].some(key => numberValue(record[key]) !== null)) out.push(record);
    for (const key of ["estimates", "results", "metrics"]) walk(record[key]);
  }
  walk(value);
  return out;
}

function estimateSummarySentence(record: Record<string, unknown>): string | null {
  const term = typeof record.term === "string" && record.term.trim() ? record.term : "primary contrast";
  const p = numberValue(record.p_value ?? record.pValue ?? record.p);
  const isRatio = numberValue(record.oddsRatio ?? record.odds_ratio ?? record.riskRatio ?? record.risk_ratio ?? record.hazardRatio ?? record.hazard_ratio) !== null;
  const ciLow = numberValue(isRatio ? (record.or_ci_low ?? record.rr_ci_low ?? record.hr_ci_low ?? record.ci_low ?? record.ciLow ?? record.lower) : (record.ci_low ?? record.ciLow ?? record.lower));
  const ciHigh = numberValue(isRatio ? (record.or_ci_high ?? record.rr_ci_high ?? record.hr_ci_high ?? record.ci_high ?? record.ciHigh ?? record.upper) : (record.ci_high ?? record.ciHigh ?? record.upper));
  const ci = ciLow !== null && ciHigh !== null ? ` (95% CI ${formatNumber(ciLow, 4)} to ${formatNumber(ciHigh, 4)})` : "";
  const pText = p !== null ? `; ${formatPValue(p)}` : "";
  const predictionMetrics = [
    ["AUROC", numberValue(record.auroc ?? record.auc)],
    ["Brier score", numberValue(record.brier_score ?? record.brierScore)],
  ].filter((item): item is [string, number] => item[1] !== null);
  if (predictionMetrics.length > 1) return `For ${term}, ${predictionMetrics.map(([label, value]) => `${label} was ${formatNumber(value, 4)}`).join(" and ")}.`;
  const metrics: Array<[string, unknown, string]> = [
    ["mean difference", record.meanDifference ?? record.mean_difference, ""],
    ["test statistic", record.statistic, ""],
    ["F statistic", record.f_statistic ?? record.fStatistic, ""],
    ["chi-square statistic", record.chi_square ?? record.chiSquare, ""],
    ["Cramer's V", record.cramers_v ?? record.cramersV, ""],
    ["correlation", record.correlation, ""],
    ["AUROC", record.auroc ?? record.auc, ""],
    ["Brier score", record.brier_score ?? record.brierScore, ""],
    ["odds ratio", record.oddsRatio ?? record.odds_ratio, ""],
    ["risk ratio", record.riskRatio ?? record.risk_ratio, ""],
    ["hazard ratio", record.hazardRatio ?? record.hazard_ratio, ""],
    ["estimate", record.estimate ?? record.coefficient, ""],
    ["sensitivity", record.sensitivity, ""],
    ["specificity", record.specificity, ""],
    ["positive predictive value", record.positive_predictive_value, ""],
    ["negative predictive value", record.negative_predictive_value, ""],
    ["survival probability", record.survival, ""],
    ["final cumulative incidence", record.final_cumulative_incidence, ""],
  ];
  const found = metrics.find(([, value]) => numberValue(value) !== null);
  if (!found) return null;
  const [label, value] = found;
  return `For ${term}, the ${label} was ${formatNumber(numberValue(value)!, 4)}${ci}${pText}.`;
}

function deriveLimitations(evidence: RunEvidence, methodQa: MethodQaResult): string[] {
  const limitations = [
    "The analysis is limited to the rows, variables, and eligibility rules represented in the run artifacts.",
    "Complete-case exclusion or missingness may affect the result if missingness is related to exposure, outcome, or covariates.",
  ];
  if (evidence.spec?.dataset === "mimic") limitations.push("MIMIC analyses reflect ICU/hospital EHR data and may not generalize outside the source health system or care context.");
  if (evidence.spec?.dataset === "nhanes") limitations.push("NHANES analyses require correct survey weights, strata, PSU handling, and cycle/subsample eligibility to support population inference.");
  if (methodQa.readiness !== "local_review_ready") limitations.push("Deterministic methods checks identified issues that require review before publication or external sharing.");
  for (const check of methodQa.checks.filter(item => item.status !== "pass")) {
    if (/No reader-facing (paper|report)|paper\/manuscript artifact/i.test(check.message)) continue;
    limitations.push(check.message);
    if (limitations.length >= 6) break;
  }
  return uniqueStrings(limitations);
}

function designSentence(evidence: RunEvidence, summary: MethodQaResult["methodSummary"]): string {
  if (evidence.spec?.archetype === "ehr-diagnosis-cohort-outcome") return "This was an EHR diagnosis-code cohort analysis using declared local cohort and outcome artifacts";
  if (evidence.spec?.archetype === "diagnostic-accuracy") return "This was a diagnostic accuracy analysis comparing an index test against a reference standard";
  if (summary.detectedModelFamilies.includes("prediction")) return "This was a local prediction-modeling analysis with performance metrics interpreted as internal evidence";
  return "This was an observational dataset analysis with interpretation bounded to the analyzed data";
}

function cohortSentence(evidence: RunEvidence, summary: MethodQaResult["methodSummary"]): string {
  const pop = evidence.spec?.population.description.join(" ") ?? "The cohort definition was read from available run artifacts.";
  return `${pop} ${summary.completeCaseN === null ? "The complete-case sample size was not extractable from the available artifacts." : `The complete-case sample size was ${summary.completeCaseN}.`}`;
}

function variableSentence(evidence: RunEvidence): string {
  if (!evidence.spec) {
    const config = unwrapObject(evidence.json["stats-config.json"]);
    const outcome = typeof config.outcome === "string" ? config.outcome : null;
    const exposure = typeof config.exposure === "string" ? config.exposure : null;
    const group = typeof config.group === "string" ? config.group : null;
    const variables = Array.isArray(config.variables) ? config.variables.filter((item): item is string => typeof item === "string") : [];
    const covariates = Array.isArray(config.covariates) ? config.covariates.filter((item): item is string => typeof item === "string") : [];
    const parts = [
      outcome ? `Outcome: ${outcome}.` : null,
      exposure ? `Exposure or predictor: ${exposure}.` : null,
      group ? `Grouping variable: ${group}.` : null,
      variables.length ? `Analyzed variables: ${variables.join(", ")}.` : null,
      covariates.length ? `Covariates: ${covariates.join(", ")}.` : null,
    ].filter(Boolean);
    return parts.length ? parts.join(" ") : "The primary outcome, exposure, and covariates were not fully encoded in the text report; review the companion variable artifact before external sharing.";
  }
  return [
    `Outcome: ${evidence.spec.variables.outcome.join(", ")}.`,
    `Exposure: ${evidence.spec.variables.exposure.join(", ")}.`,
    evidence.spec.variables.covariates.length ? `Covariates: ${evidence.spec.variables.covariates.join(", ")}.` : "No covariates were declared in the extracted spec.",
  ].join(" ");
}

function methodsSentence(evidence: RunEvidence, summary: MethodQaResult["methodSummary"]): string {
  if (evidence.spec) {
    return `The primary model family was ${evidence.spec.model.family}, with formula ${evidence.spec.model.formula}.`;
  }
  const config = unwrapObject(evidence.json["stats-config.json"]);
  const method = typeof config.method === "string" ? config.method : null;
  const readerFamilies = uniqueStrings(summary.detectedModelFamilies.map(readerMethodFamilyLabel));
  if (method) return `The statistical method was ${method}${readerFamilies.length ? `, a ${readerFamilies.join(", ")} approach` : ""}.`;
  return summary.detectedModelFamilies.length
    ? `The detected method family was ${readerFamilies.join(", ")}.`
    : "The statistical method was inferred from the available run artifacts and should be confirmed during review.";
}

function discussionSentence(evidence: RunEvidence, methodQa: MethodQaResult): string {
  const posture = methodQa.methodSummary.resultPosture;
  if (posture) return posture.replace(/[.]\s*$/, "") + ".";
  if (evidence.spec?.claimPolicy.allowedInference === "predictive_performance") return "The result should be interpreted as local predictive performance unless external validation is added.";
  return "The result should be interpreted conservatively as local evidence from the analyzed dataset.";
}

function conclusionSentence(evidence: RunEvidence, methodQa: MethodQaResult): string {
  if (methodQa.readiness === "blocked") return "The analysis produced inspectable artifacts, but blocker-level method issues prevent publication-style interpretation.";
  if (methodQa.readiness === "needs_methods_review") return "The analysis produced interpretable local evidence, but methods review is required before stronger claims.";
  if (evidence.spec?.claimPolicy.allowedInference === "predictive_performance") return "The result can support local model-review decisions, not clinical deployment or external performance claims.";
  return "The result can support local research review and future confirmatory analysis.";
}

function modelFamilyFromRouteIntent(routeIntent: string): ModelFamily {
  if (routeIntent === "prediction_modeling") return "prediction";
  if (routeIntent === "diagnostic_accuracy") return "diagnostic_accuracy";
  if (routeIntent === "descriptive_profile" || routeIntent === "data_quality_review") return "descriptive";
  return "linear";
}

function archetypeFromRouteIntent(routeIntent: string): StudyArchetypeId {
  if (routeIntent === "prediction_modeling") return "prediction-model";
  if (routeIntent === "diagnostic_accuracy") return "diagnostic-accuracy";
  if (routeIntent === "descriptive_profile") return "survey-prevalence";
  return "cross-sectional-association";
}

function estimandTypeFromRouteIntent(routeIntent: string): AnalysisSpecV2["estimand"]["type"] {
  if (routeIntent === "prediction_modeling") return "predictive";
  if (routeIntent === "diagnostic_accuracy") return "diagnostic";
  if (routeIntent === "descriptive_profile" || routeIntent === "data_quality_review") return "descriptive";
  return "associational";
}

function targetQuantityFromRouteIntent(routeIntent: string): string {
  if (routeIntent === "prediction_modeling") return "internal predictive performance";
  if (routeIntent === "diagnostic_accuracy") return "sensitivity, specificity, predictive values, and likelihood ratios";
  if (routeIntent === "descriptive_profile") return "descriptive distribution or prevalence";
  return "adjusted or unadjusted association estimate";
}

function diagnosticsForModelFamily(family: ModelFamily): string[] {
  if (family === "diagnostic_accuracy") return ["sparse diagnostic cells", "threshold review", "reference standard review"];
  if (family === "prediction") return ["train/test validation", "calibration", "class imbalance", "leakage review"];
  if (family === "linear") return ["missingness", "linearity", "influence", "collinearity"];
  return ["missingness", "semantic plausibility", "claim alignment"];
}

function inferDatasetFromPath(dataPath: string): DatasetAdapterId {
  const lower = dataPath.toLowerCase();
  if (lower.includes("nhanes")) return "nhanes";
  if (lower.includes("mimic")) return "mimic";
  if (lower.includes("brfss")) return "brfss";
  if (lower.includes("seer")) return "seer";
  const parsed = datasetAdapterIdSchema.safeParse(process.env.AGENTEER_DEFAULT_DATASET);
  return parsed.success ? parsed.data : "user-table";
}

function unwrapObject(value: unknown, key?: string): Record<string, unknown> {
  if (!value || typeof value !== "object") return {};
  const record = value as Record<string, unknown>;
  if (key && record[key] && typeof record[key] === "object") return record[key] as Record<string, unknown>;
  return record;
}

function unwrapAny(value: unknown): unknown {
  if (!value || typeof value !== "object") return value;
  const record = value as Record<string, unknown>;
  for (const key of ["methodQa", "manuscriptQa", "paperQa", "literatureQa", "literatureContext", "literatureSearch", "qa", "lifecycle", "paperLifecycle", "runInspection", "analysisRunManifest", "statsPreflight"]) {
    if (record[key] && typeof record[key] === "object") return record[key];
  }
  return value;
}

function firstNumberInJson(json: Record<string, unknown | null>, keys: string[]): number | null {
  for (const value of Object.values(json)) {
    const found = firstNumberInValue(value, keys);
    if (found !== null) return found;
  }
  return null;
}

function firstStringInJson(json: Record<string, unknown | null>, keys: string[]): string | null {
  for (const value of Object.values(json)) {
    const found = firstStringInValue(value, keys);
    if (found !== null) return found;
  }
  return null;
}

function firstNumberInValue(value: unknown, keys: string[]): number | null {
  const seen = new Set<unknown>();
  function walk(candidate: unknown): number | null {
    if (!candidate || typeof candidate !== "object" || seen.has(candidate)) return null;
    seen.add(candidate);
    if (Array.isArray(candidate)) {
      for (const item of candidate) {
        const found = walk(item);
        if (found !== null) return found;
      }
      return null;
    }
    const record = candidate as Record<string, unknown>;
    for (const key of keys) {
      const found = numberValue(record[key]);
      if (found !== null) return found;
    }
    for (const item of Object.values(record)) {
      const found = walk(item);
      if (found !== null) return found;
    }
    return null;
  }
  return walk(value);
}

function firstStringInValue(value: unknown, keys: string[]): string | null {
  const seen = new Set<unknown>();
  function walk(candidate: unknown): string | null {
    if (!candidate || typeof candidate !== "object" || seen.has(candidate)) return null;
    seen.add(candidate);
    if (Array.isArray(candidate)) {
      for (const item of candidate) {
        const found = walk(item);
        if (found !== null) return found;
      }
      return null;
    }
    const record = candidate as Record<string, unknown>;
    for (const key of keys) {
      const found = stringValue(record[key]);
      if (found !== null) return found;
    }
    for (const item of Object.values(record)) {
      const found = walk(item);
      if (found !== null) return found;
    }
    return null;
  }
  return walk(value);
}

function numberValue(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : typeof value === "string" && value.trim() && Number.isFinite(Number(value)) ? Number(value) : null;
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.map(item => stringValue(item)).filter((item): item is string => Boolean(item)) : [];
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values.map(item => item.trim()).filter(Boolean))];
}

function mean(values: number[]): number {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

function formatNumber(value: number, digits: number): string {
  return Number.isFinite(value) ? value.toFixed(digits) : "NaN";
}

function formatPValue(value: number): string {
  if (!Number.isFinite(value)) return "p=NaN";
  if (value > 0 && value < 0.0001) return "p<0.0001";
  return `p=${formatNumber(value, 4)}`;
}

function sentenceStatistics(text: string): { sentenceCount: number; averageSentenceWords: number } {
  const sentences = text.split(/[.!?]\s+/).map(item => item.trim()).filter(Boolean);
  const words = text.split(/\s+/).map(item => item.trim()).filter(Boolean);
  return { sentenceCount: sentences.length, averageSentenceWords: sentences.length ? words.length / sentences.length : 0 };
}
