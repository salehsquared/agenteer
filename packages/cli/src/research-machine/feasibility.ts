import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { researchTableSummaryCommand, type ResearchTableSummary } from "../commands/research.js";
import { identifierLikeColumnReason, outcomeOrFutureLeakageReason, postTreatmentAdjustmentReason, semanticPlausibilityIssuesForColumn } from "./semantic-plausibility.js";
import { requiredContractArgumentsForMethod, type StatsContractArgumentName } from "./stats/contracts.js";
import type { StatsMethod } from "./stats/schemas.js";

export type FeasibilityVerdict = "reject" | "needs_data_profiling" | "needs_phenotype_review" | "exploratory_only" | "formal_analysis_ready";
export type FeasibilityDomainStatus = "pass" | "warning" | "block" | "unknown";
export type FeasibilityAction = "reject" | "profile_data" | "review_phenotype" | "revise_design" | "ask_clarification" | "explore_only" | "run_formal_analysis";

export interface FeasibilityVariableRole {
  role: "outcome" | "exposure" | "group" | "time" | "start" | "stop" | "event" | "id" | "strata" | "cluster" | "period" | "post" | "running_variable" | "instrument" | "variable" | "covariate" | "exact_covariate" | "weight" | "offset" | "phenotype" | string;
  name: string;
  required?: boolean;
}

export interface FeasibilityGateOptions {
  question: string;
  dataPath?: string | null;
  datasetDir?: string | null;
  tableSummary?: ResearchTableSummary | null;
  method?: StatsMethod | null;
  outcome?: string | null;
  exposure?: string | null;
  group?: string | null;
  outcomeThreshold?: number | null;
  exposureThreshold?: number | null;
  time?: string | null;
  start?: string | null;
  stop?: string | null;
  event?: string | null;
  id?: string | null;
  strata?: string | null;
  cluster?: string | null;
  period?: string | null;
  post?: string | null;
  runningVariable?: string | null;
  cutoff?: number | null;
  instrument?: string | null;
  weight?: string | null;
  offset?: string | null;
  variables?: string[];
  covariates?: string[];
  exactCovariates?: string[];
  phenotypeIds?: string[];
  phenotypeConfidence?: number | null;
  phenotypeReviewed?: boolean;
  temporalStartYear?: number | null;
  temporalEndYear?: number | null;
  expectedFollowupYears?: number | null;
  minRows?: number;
  minEvents?: number;
  maxMissingness?: number;
  surveyDesign?: boolean;
  allowSurveyApproximation?: boolean;
  python?: string;
  outDir?: string;
}

export interface FeasibilityDomainScore {
  id: "data_availability" | "cohort_size" | "event_count" | "missingness" | "phenotype_confidence" | "temporal_validity" | "outcome_observability" | "method_suitability" | "semantic_plausibility" | "expected_statistical_power" | "expected_reviewer_risk" | "design_specificity" | "artifact_readiness" | "cost_and_access";
  label: string;
  score: number;
  status: FeasibilityDomainStatus;
  weight: number;
  rationale: string;
  evidenceRefs: string[];
  blockers: string[];
  warnings: string[];
  suggestedFixes: string[];
}

export interface FeasibilityInternalReview {
  reviewerId: "data_agent" | "methods_agent" | "phenotype_temporal_agent" | "semantic_power_agent" | "skeptical_reviewer_agent";
  stance: "approve" | "approve_with_modifications" | "exploratory_only" | "needs_review" | "reject";
  confidence: number;
  primaryConcerns: string[];
  requiredActions: string[];
  suggestedVerdict: FeasibilityVerdict;
  evidenceRefs: string[];
}

export interface FeasibilityVariableCheck {
  role: string;
  name: string;
  required: boolean;
  present: boolean;
  inferredType: ResearchTableSummary["columns"][number]["inferredType"] | "missing";
  nonMissingRows: number;
  missingFraction: number;
  min: number | null;
  max: number | null;
  mean: number | null;
  uniqueCount: number | null;
  valueCounts: Array<{ value: string; count: number; fraction: number }>;
  sampleValues: string[];
  issues: Array<{ severity: "blocker" | "warning" | "note"; code: string; message: string }>;
}

export interface FeasibilityIssue {
  severity: "blocker" | "warning" | "note";
  code: string;
  message: string;
  source: "domain" | "variable" | "internal_review";
  domainId?: FeasibilityDomainScore["id"];
  variable?: string;
  role?: string;
  reviewerId?: FeasibilityInternalReview["reviewerId"];
  evidenceRefs: string[];
  suggestedFixes: string[];
}

export interface FeasibilityGateResult {
  schemaVersion: 1;
  generatedAtIso: string;
  question: string;
  verdict: FeasibilityVerdict;
  status: "pass" | "warning" | "block";
  score: number;
  confidence: number;
  readinessLabel: string;
  primaryAction: FeasibilityAction;
  rowCount: number | null;
  columnCount: number | null;
  method: StatsMethod | null;
  requiredVariables: string[];
  variableChecks: FeasibilityVariableCheck[];
  completeCase: {
    scanned: boolean;
    scannedRows: number;
    completeRows: number | null;
    completeFraction: number | null;
    completeValueCounts: Record<string, Record<string, number>>;
    completePairCounts?: Record<string, { rowVariable: string; columnVariable: string; counts: Record<string, Record<string, number>> }>;
    scanReason: string;
  };
  outcomeDiagnostics: {
    outcome: string | null;
    observedLevels: Array<{ value: string; count: number }>;
    observedLevelCount: number | null;
    binarySupported: boolean | null;
    eventCount: number | null;
    nonEventCount: number | null;
    eventRate: number | null;
    analysisObservedLevels: Array<{ value: string; count: number }>;
    analysisObservedLevelCount: number | null;
    analysisBinarySupported: boolean | null;
    analysisEventCount: number | null;
    analysisNonEventCount: number | null;
    analysisEventRate: number | null;
    usable: boolean | null;
  };
  domains: FeasibilityDomainScore[];
  internalReviews: FeasibilityInternalReview[];
  issues: FeasibilityIssue[];
  blockers: string[];
  warnings: string[];
  notes: string[];
  clarifyingQuestions: string[];
  requiredModifications: string[];
  optionalModifications: string[];
  alternativeStudyIdeas: Array<{ title: string; reason: string; expectedVerdict: FeasibilityVerdict }>;
  studyDesignAdvice: {
    recommendedPosture: "reject" | "profile_first" | "coding_review_first" | "exploratory" | "formal";
    methodRecommendation: string;
    estimandOrDesignWarning: string | null;
    reviewerRiskSummary: string;
  };
  evidenceRefs: string[];
  nextAction: string;
  outPath?: string | null;
  reportPath?: string | null;
}

interface RowScan {
  scannedRows: number;
  completeRows: number;
  truncated: boolean;
  valueCounts: Record<string, Record<string, number>>;
  completeValueCounts: Record<string, Record<string, number>>;
  completePairCounts: Record<string, { rowVariable: string; columnVariable: string; counts: Record<string, Record<string, number>> }>;
}

interface TemporalCoverageAssessment {
  score: number;
  requestedStartYear: number | null;
  requestedEndYear: number | null;
  observedStartYear: number | null;
  observedEndYear: number | null;
  observedColumn: string | null;
  blockers: string[];
  warnings: string[];
  rationale: string;
  suggestedFixes: string[];
}

export async function researchFeasibilityGateCommand(opts: FeasibilityGateOptions): Promise<FeasibilityGateResult> {
  let tableSummary = opts.tableSummary ?? null;
  const evidenceRefs = new Set<string>();
  if (opts.dataPath) evidenceRefs.add(path.resolve(opts.dataPath));
  if (opts.datasetDir) evidenceRefs.add(path.resolve(opts.datasetDir));
  if (!tableSummary && opts.dataPath) {
    tableSummary = await researchTableSummaryCommand({ file: opts.dataPath, python: opts.python });
  }
  const result = await evaluateFeasibilityGate({ ...opts, tableSummary });
  result.evidenceRefs = [...new Set([...result.evidenceRefs, ...evidenceRefs])];
  if (opts.outDir) {
    const outDir = path.resolve(opts.outDir);
    await mkdir(outDir, { recursive: true });
    const outPath = path.join(outDir, "feasibility-gate.json");
    const reportPath = path.join(outDir, "feasibility-gate.md");
    result.outPath = outPath;
    result.reportPath = reportPath;
    await writeFile(outPath, renderResearchFeasibilityGateJson(result));
    await writeFile(reportPath, renderResearchFeasibilityGateMarkdown(result));
  }
  return result;
}

export async function evaluateFeasibilityGate(opts: FeasibilityGateOptions): Promise<FeasibilityGateResult> {
  const summary = opts.tableSummary ?? null;
  const variables = feasibilityVariableRoles(opts);
  const requiredVariables = unique(variables.filter(item => item.required !== false).map(item => item.name));
  const rowScan = await scanRows(opts.dataPath ?? null, requiredVariables);
  const byName = new Map((summary?.columns ?? []).map(column => [column.name, column]));
  const completeCase = buildCompleteCase(rowScan, summary, opts.dataPath ?? null);
  const variableChecks = variables.map(item => buildVariableCheck(item, byName, Boolean(summary), summary?.rowCount ?? null, completeCase));
  const outcomeDiagnostics = buildOutcomeDiagnostics(opts, rowScan, byName);
  const domains = buildDomainScores(opts, summary, variableChecks, completeCase, outcomeDiagnostics, rowScan);
  const internalReviews = buildInternalReviews(domains, opts, outcomeDiagnostics);
  const issues = buildFeasibilityIssues(domains, variableChecks, internalReviews);
  const blockers = unique([
    ...domains.flatMap(domain => domain.blockers),
    ...variableChecks.flatMap(check => check.issues.filter(issue => issue.severity === "blocker").map(issue => issue.message)),
    ...internalReviews.flatMap(review => review.stance === "reject" ? review.primaryConcerns : []),
  ]);
  const warnings = unique([
    ...domains.flatMap(domain => domain.warnings),
    ...variableChecks.flatMap(check => check.issues.filter(issue => issue.severity === "warning").map(issue => issue.message)),
    ...internalReviews.flatMap(review => review.stance !== "approve" && review.stance !== "reject" ? review.primaryConcerns : []),
  ]).filter(item => !blockers.includes(item));
  const notes = unique([
    ...variableChecks.flatMap(check => check.issues.filter(issue => issue.severity === "note").map(issue => issue.message)),
    ...domains.filter(domain => domain.status === "pass").map(domain => domain.rationale),
  ]).slice(0, 16);
  const score = round(weightedScore(domains), 4);
  const verdict = chooseVerdict(domains, blockers, warnings, internalReviews, score);
  const status: FeasibilityGateResult["status"] = verdict === "reject" ? "block" : verdict === "formal_analysis_ready" && warnings.length === 0 ? "pass" : "warning";
  const primaryAction = primaryActionForVerdict(verdict, domains, warnings);
  const confidence = round(Math.min(0.98, Math.max(0.35, internalReviews.reduce((sum, review) => sum + review.confidence, 0) / Math.max(internalReviews.length, 1))), 3);
  const requiredModifications = requiredActionsForVerdict(verdict, domains, variableChecks, internalReviews);
  const clarifyingQuestions = clarifyingQuestionsFor(opts, domains, variableChecks);
  const optionalModifications = optionalActionsFor(opts, domains);
  const alternativeStudyIdeas = alternativesFor(opts, verdict, domains);
  const readinessLabel = labelForVerdict(verdict);
  const studyDesignAdvice = designAdviceFor(opts, verdict, domains, outcomeDiagnostics, internalReviews);
  const evidenceRefs = unique([
    opts.dataPath ? path.resolve(opts.dataPath) : null,
    opts.datasetDir ? path.resolve(opts.datasetDir) : null,
    summary?.file ? path.resolve(summary.file) : null,
  ].filter((item): item is string => Boolean(item)));
  return {
    schemaVersion: 1,
    generatedAtIso: new Date().toISOString(),
    question: opts.question,
    verdict,
    status,
    score,
    confidence,
    readinessLabel,
    primaryAction,
    rowCount: summary?.rowCount ?? null,
    columnCount: summary?.columnCount ?? null,
    method: opts.method ?? null,
    requiredVariables,
    variableChecks,
    completeCase,
    outcomeDiagnostics,
    domains,
    internalReviews,
    issues,
    blockers,
    warnings,
    notes,
    clarifyingQuestions,
    requiredModifications,
    optionalModifications,
    alternativeStudyIdeas,
    studyDesignAdvice,
    evidenceRefs,
    nextAction: nextActionFor(verdict, primaryAction, requiredModifications),
    outPath: null,
    reportPath: null,
  };
}

function buildDomainScores(
  opts: FeasibilityGateOptions,
  summary: ResearchTableSummary | null,
  variables: FeasibilityVariableCheck[],
  completeCase: FeasibilityGateResult["completeCase"],
  outcome: FeasibilityGateResult["outcomeDiagnostics"],
  rowScan: RowScan | null,
): FeasibilityDomainScore[] {
  const minRows = opts.minRows ?? 50;
  const minEvents = opts.minEvents ?? conservativeMinEvents(opts);
  const maxMissingness = opts.maxMissingness ?? 0.4;
  const required = variables.filter(item => item.required);
  const missingRequired = required.filter(item => !item.present);
  const highMissing = required.filter(item => item.present && item.missingFraction > maxMissingness);
  const semanticIssues = variables.flatMap(item => item.issues.filter(issue => issue.code.startsWith("IMPLAUSIBLE") || issue.code.startsWith("INVALID") || issue.code.startsWith("NEGATIVE")));
  const phenotypeConfidence = clamp(opts.phenotypeConfidence ?? (opts.phenotypeIds?.length ? opts.phenotypeReviewed ? 0.82 : 0.58 : 0.9));
  const hasTemporalQuestion = /(longitudinal|follow.?up|survival|readmission|reintervention|over time|time to|incident|subsequent|from \d{4}|to \d{4}|post[-\s]?(operative|procedure|treatment|discharge|admission|index)|\b(before|after)\s+(index|baseline|admission|discharge|procedure|surgery|operation|treatment|therapy|diagnosis|intervention|tavr|savr|avr)\b)/i.test(opts.question);
  const temporalCoverage = assessTemporalCoverage(opts, summary);
  const temporalComplete = !hasTemporalQuestion || Boolean(opts.time || opts.stop || opts.period || opts.temporalStartYear || opts.temporalEndYear || opts.expectedFollowupYears || temporalCoverage.requestedStartYear || temporalCoverage.requestedEndYear);
  const method = opts.method;
  const completeRows = completeCase.completeRows ?? summary?.rowCount ?? null;
  const completeCaseAttrition = completeCaseAttritionAssessment(completeCase, minRows);
  const dataProfileNeeded = !summary;
  const eventCount = analyticEventCount(outcome);
  const rawPredictorCount = unique([opts.exposure, opts.group, ...(opts.covariates ?? []), ...(opts.variables ?? [])].filter((item): item is string => Boolean(item))).length;
  const modeledTermCount = expectedPowerModeledTermCount(opts, summary, completeCase, outcome, rawPredictorCount);
  const epv = eventCount !== null && modeledTermCount > 0 ? eventCount / modeledTermCount : null;
  const reviewerRisk = reviewerRiskScore(opts, semanticIssues.length, highMissing.length, phenotypeConfidence, temporalComplete, method, outcome);
  const eventCountDetail = outcome.analysisEventCount !== null && outcome.eventCount !== null && outcome.analysisEventCount !== outcome.eventCount
    ? `${outcome.analysisEventCount} analysis-complete event(s) detected (${outcome.eventCount} marginal event(s)); preferred minimum is ${minEvents}.`
    : eventCount === null ? "Event count is not available or not required for the proposed method." : `${eventCount} event(s) detected; preferred minimum is ${minEvents}.`;
  const outcomeExpected = requiresOutcomeOrEvent(opts.method);

  const add = (
    id: FeasibilityDomainScore["id"],
    label: string,
    score: number,
    weight: number,
    rationale: string,
    blockers: string[] = [],
    warnings: string[] = [],
    fixes: string[] = [],
    evidenceRefs: string[] = [],
  ): FeasibilityDomainScore => ({
    id,
    label,
    score: round(clamp(score), 4),
    weight,
    status: blockers.length ? "block" : warnings.length || score < 0.75 ? "warning" : "pass",
    rationale,
    evidenceRefs,
    blockers,
    warnings,
    suggestedFixes: fixes,
  });

  return [
    add(
      "data_availability",
      "Data Availability",
      dataProfileNeeded ? 0.35 : missingRequired.length ? 0.1 : 0.95,
      1.2,
      dataProfileNeeded ? "No table summary is available; the idea cannot be scored against actual columns yet." : missingRequired.length ? `${missingRequired.length} required variable(s) are missing.` : "Required data source and variables are visible.",
      dataProfileNeeded ? [] : missingRequired.map(item => `Required ${item.role} variable '${item.name}' is missing.`),
      dataProfileNeeded ? ["Data must be summarized before formal analysis."] : [],
      dataProfileNeeded ? ["Run feasibility-gate with --data or provide a dataset profile/table summary."] : missingRequired.map(item => `Map or add ${item.role} variable '${item.name}'.`),
    ),
    add(
      "cohort_size",
      "Cohort Size",
      summary ? Math.min(1, (completeRows ?? summary.rowCount) / Math.max(minRows * 2, 1)) : 0.45,
      1.1,
      summary ? `${completeRows ?? summary.rowCount} usable row(s) compared with minimum ${minRows}.` : "Cohort size is unknown until data profiling runs.",
      summary && (completeRows ?? 0) < Math.max(10, Math.floor(minRows / 2)) ? [`Only ${completeRows ?? 0} usable row(s), far below minimum ${minRows}.`] : [],
      summary && (completeRows ?? 0) < minRows && (completeRows ?? 0) >= Math.max(10, Math.floor(minRows / 2)) ? [`Usable rows ${completeRows ?? 0} are below preferred minimum ${minRows}.`] : [],
      ["Broaden eligibility, simplify subgrouping, or downgrade to descriptive/exploratory analysis."],
    ),
    add(
      "event_count",
      "Event Count",
      eventCount === null ? methodRequiresEvents(method) ? 0.45 : 0.82 : Math.min(1, eventCount / Math.max(minEvents * 2, 1)),
      1.15,
      eventCountDetail,
      eventCount !== null && eventCount < Math.max(3, Math.floor(minEvents / 2)) ? [`Only ${eventCount} event(s), too sparse for the requested inferential design.`] : [],
      eventCount === null && methodRequiresEvents(method) ? ["Event count must be profiled before time-to-event or binary-outcome inference."] : eventCount !== null && eventCount < minEvents ? [`Event count ${eventCount} is below preferred minimum ${minEvents}.`] : [],
      ["Use a broader endpoint, longer horizon, descriptive event counts, or exploratory-only posture."],
    ),
    add(
      "missingness",
      "Missingness",
      completeCaseAttrition.blockers.length
        ? 0.2
        : highMissing.length
          ? Math.max(0.15, 1 - highMissing.length * 0.25)
          : completeCaseAttrition.warnings.length
            ? 0.62
            : required.length
              ? 0.94
              : 0.7,
      1,
      [
        highMissing.length ? `${highMissing.length} required variable(s) exceed missingness threshold ${maxMissingness}.` : "Required-variable missingness is within configured threshold or not yet applicable.",
        completeCaseAttrition.rationale,
      ].filter(Boolean).join(" "),
      [
        ...highMissing.filter(item => item.missingFraction > 0.8).map(item => `${item.name} is ${(item.missingFraction * 100).toFixed(1)}% missing.`),
        ...completeCaseAttrition.blockers,
      ],
      [
        ...highMissing.filter(item => item.missingFraction <= 0.8).map(item => `${item.name} is ${(item.missingFraction * 100).toFixed(1)}% missing.`),
        ...completeCaseAttrition.warnings,
      ],
      unique(["Add missingness mechanism review, complete-case sensitivity, imputation, or choose less-missing variables.", ...completeCaseAttrition.suggestedFixes]),
    ),
    add(
      "phenotype_confidence",
      "Code / Phenotype Confidence",
      phenotypeConfidence,
      1.1,
      opts.phenotypeIds?.length ? `Phenotype confidence is ${phenotypeConfidence}; reviewed=${Boolean(opts.phenotypeReviewed)}.` : "No coded phenotype dependency was declared.",
      opts.phenotypeIds?.length && phenotypeConfidence < 0.45 ? ["Declared phenotypes have low confidence and cannot support a serious coded study."] : [],
      opts.phenotypeIds?.length && (!opts.phenotypeReviewed || phenotypeConfidence < 0.75) ? ["Phenotype/code definitions need review before formal analysis."] : [],
      ["Run phenotype-review, record code systems/timing/sensitivity definitions, and report matched-code evidence."],
    ),
    add(
      "temporal_validity",
      "Temporal Validity",
      temporalComplete ? Math.min(0.9, temporalCoverage.score) : 0.42,
      0.95,
      temporalComplete
        ? `Temporal requirements have at least one time/horizon signal. ${temporalCoverage.rationale}`
        : `The question implies longitudinal timing but no time, period, follow-up, or horizon signal is declared. ${temporalCoverage.rationale}`,
      temporalCoverage.blockers,
      [
        ...(temporalComplete ? [] : ["Temporal direction and follow-up observability are underspecified."]),
        ...temporalCoverage.warnings,
      ],
      unique(["Declare index date/time, baseline window, follow-up window, censoring, and outcome timing.", ...temporalCoverage.suggestedFixes]),
    ),
    add(
      "outcome_observability",
      "Outcome Observability",
      !outcomeExpected ? 0.9 : outcome.outcome ? outcome.usable === false ? 0.2 : eventCount === null ? 0.7 : eventCount > 0 ? 0.92 : 0.2 : 0.45,
      1.15,
      !outcomeExpected ? "The requested method is variable-only or design-only and does not require a separate outcome/event variable." : outcome.outcome ? `Outcome ${outcome.outcome} observability: usable=${outcome.usable}; analysis-complete events=${eventCount ?? "unknown"}${outcome.eventCount !== null && outcome.eventCount !== eventCount ? `; marginal events=${outcome.eventCount}` : ""}.` : "No outcome/event variable is declared.",
      outcomeExpected && outcome.outcome && outcome.usable === false ? [`Outcome '${outcome.outcome}' is not usable as observed.`] : [],
      outcomeExpected && !outcome.outcome ? ["Outcome/event must be declared or the study must remain exploratory/descriptive."] : outcomeExpected && eventCount === 0 ? ["No observed outcome events in analysis-complete data."] : [],
      ["Map an observable endpoint, broaden endpoint definition, or use descriptive profiling."],
    ),
    add(
      "method_suitability",
      "Method Suitability",
      methodSuitabilityScore(opts, outcome, summary, completeCase),
      1.2,
      method ? `Requested method ${method} was checked against available design signals.` : "No method supplied; method selection can still proceed after data profiling.",
      methodSuitabilityBlockers(opts, outcome, summary, completeCase),
      methodSuitabilityWarnings(opts, outcome, summary, completeCase),
      ["Use method-select/modeling-plan after feasibility, simplify the model, or choose descriptive/exploratory methods."],
    ),
    add(
      "semantic_plausibility",
      "Semantic Plausibility",
      semanticIssues.some(issue => issue.severity === "blocker") ? 0.15 : semanticIssues.length ? 0.62 : 0.94,
      1.05,
      semanticIssues.length ? `${semanticIssues.length} semantic plausibility issue(s) detected.` : "No generic semantic plausibility issues were detected in required variables.",
      semanticIssues.filter(issue => issue.severity === "blocker").map(issue => issue.message),
      semanticIssues.filter(issue => issue.severity === "warning").map(issue => issue.message),
      ["Audit units, coding, impossible values, cohort filters, and derived-variable definitions."],
    ),
    add(
      "expected_statistical_power",
      "Expected Statistical Power",
      powerScore(summary?.rowCount ?? null, completeRows, eventCount, modeledTermCount, epv),
      0.95,
      epv === null ? "Power is approximated from row count and complete-case count." : `Approximate events per modeled term/parameter slot: ${round(epv, 2)}.`,
      epv !== null && epv < 3 ? [`Events per modeled term/parameter slot is ${round(epv, 2)}, too low for stable adjusted modeling.`] : [],
      epv !== null && epv >= 3 && epv < 10 ? [`Events per modeled term/parameter slot is ${round(epv, 2)}, below the conservative 10 EPV heuristic.`] : [],
      ["Reduce predictors, use penalized/descriptive methods, bootstrap uncertainty, or collect/profile more data."],
    ),
    add(
      "expected_reviewer_risk",
      "Expected Reviewer Risk",
      1 - reviewerRisk,
      0.8,
      `Reviewer risk score is ${round(reviewerRisk, 3)} from design, phenotype, missingness, timing, and method concerns.`,
      reviewerRisk > 0.75 ? ["Expected reviewer risk is high enough to block formal promotion."] : [],
      reviewerRisk > 0.35 && reviewerRisk <= 0.75 ? ["Expected reviewer risk is material; require limitations and targeted QA."] : [],
      ["Pre-register assumptions, add sensitivity analyses, run cold reviewer panel, and downgrade unsupported claims."],
    ),
    add(
      "design_specificity",
      "Design Specificity",
      designSpecificityScore(opts),
      0.75,
      "The question and supplied fields were checked for population, exposure, outcome, comparator, time, and covariate specificity.",
      [],
      designSpecificityScore(opts) < 0.65 ? ["Study design is underspecified and likely needs clarifying questions."] : [],
      ["Clarify PICO elements, estimand, index time, comparator, covariate policy, and sensitivity analyses."],
    ),
    add(
      "artifact_readiness",
      "Artifact Readiness",
      summary ? 0.8 : 0.35,
      0.55,
      summary ? "A data summary is available; downstream specs and QA artifacts are still required." : "No profiling artifact is available yet.",
      [],
      summary ? ["Formal analysis still requires AnalysisSpec/method selection, execution artifacts, QA, and report review."] : ["No profile artifact available."],
      ["Write feasibility-gate.json, AnalysisSpec, method-selection, QA gates, and artifact manifest before promotion."],
    ),
    add(
      "cost_and_access",
      "Cost And Access",
      opts.dataPath || summary ? 0.9 : opts.datasetDir ? 0.75 : 0.5,
      0.45,
      opts.dataPath ? "A local or explicit data path is available for bounded profiling." : opts.datasetDir ? "A dataset directory is declared; table-level profiling may still be needed." : "Data access path is not explicit.",
      [],
      !opts.dataPath && !summary ? ["Data access/profiling path is not explicit."] : [],
      ["Use local/cache-bounded data reads and record cost receipts for cloud-backed datasets."],
    ),
  ];
}

function buildVariableCheck(item: FeasibilityVariableRole, byName: Map<string, ResearchTableSummary["columns"][number]>, hasTableSummary: boolean, rowCount: number | null, completeCase: FeasibilityGateResult["completeCase"]): FeasibilityVariableCheck {
  const column = byName.get(item.name);
  const issues: FeasibilityVariableCheck["issues"] = [];
  const required = item.required !== false;
  if (!column) {
    if (required && hasTableSummary) issues.push({ severity: "blocker", code: "MISSING_REQUIRED_VARIABLE", message: `${item.role} variable '${item.name}' is missing.` });
    else if (required) issues.push({ severity: "warning", code: "VARIABLE_NOT_PROFILED", message: `${item.role} variable '${item.name}' cannot be verified until data profiling runs.` });
  } else {
    if (required && column.nonMissingRows === 0) issues.push({ severity: "blocker", code: "EMPTY_REQUIRED_VARIABLE", message: `${item.role} variable '${item.name}' has no observed values.` });
    if (required && column.missingFraction > 0.8) issues.push({ severity: "blocker", code: "EXTREME_REQUIRED_MISSINGNESS", message: `${item.role} variable '${item.name}' is ${(column.missingFraction * 100).toFixed(1)}% missing.` });
    if (required && column.missingFraction > 0.4 && column.missingFraction <= 0.8) issues.push({ severity: "warning", code: "HIGH_REQUIRED_MISSINGNESS", message: `${item.role} variable '${item.name}' is ${(column.missingFraction * 100).toFixed(1)}% missing.` });
    if ((item.role === "time" || item.role === "running_variable") && column.inferredType !== "number") issues.push({ severity: "blocker", code: "NON_NUMERIC_TIME", message: `${item.role} variable '${item.name}' must be numeric.` });
    if (item.role === "weight") {
      if (column.inferredType !== "number") {
        issues.push({ severity: "blocker", code: "NON_NUMERIC_WEIGHT", message: `Weight variable '${item.name}' must be numeric.` });
      } else {
        issues.push(...weightDomainIssues(item.name, column, completeCase));
      }
    }
    if (item.role === "offset") {
      if (column.inferredType !== "number") {
        issues.push({ severity: "blocker", code: "NON_NUMERIC_OFFSET", message: `Offset/person-time variable '${item.name}' must be numeric before log-offset count-rate modeling.` });
      } else {
        issues.push(...offsetDomainIssues(item.name, column, completeCase));
      }
    }
    issues.push(...semanticIssuesForRole(column, rowCount, item.role, completeCase));
    issues.push(...roleVariationIssues(item.role, item.name, column, completeCase));
    const identifierReason = identifierLikeColumnReason(column, rowCount);
    if (identifierReason && !identifierAllowedForRole(item.role)) {
      issues.push({
        severity: "blocker",
        code: "IDENTIFIER_USED_AS_ANALYSIS_VARIABLE",
        message: `${item.role} variable '${item.name}' appears to be an identifier (${identifierReason}) and cannot be used as a substantive outcome, exposure, group, covariate, weight, or endpoint role.`,
      });
    }
  }
  return {
    role: item.role,
    name: item.name,
    required,
    present: Boolean(column),
    inferredType: column?.inferredType ?? "missing",
    nonMissingRows: column?.nonMissingRows ?? 0,
    missingFraction: column?.missingFraction ?? 1,
    min: column?.min ?? null,
    max: column?.max ?? null,
    mean: column?.mean ?? null,
    uniqueCount: column?.uniqueCount ?? null,
    valueCounts: column?.valueCounts ?? [],
    sampleValues: column?.sampleValues ?? [],
    issues,
  };
}

function semanticIssuesForRole(column: FeasibilityColumn, rowCount: number | null, role: string, completeCase: FeasibilityGateResult["completeCase"]): FeasibilityVariableCheck["issues"] {
  const semanticIssues = semanticIssuesForColumn(column, rowCount);
  if (role !== "weight") return semanticIssues;
  const support = completeCaseNumericDomainSupport(completeCase, column.name);
  if (!support || support.negativeRows > 0 || support.numericRows === 0) return semanticIssues;
  return semanticIssues.filter(issue => issue.code !== "NEGATIVE_WEIGHT_VALUE");
}

function weightDomainIssues(variable: string, column: FeasibilityColumn, completeCase: FeasibilityGateResult["completeCase"]): FeasibilityVariableCheck["issues"] {
  const support = completeCaseNumericDomainSupport(completeCase, variable);
  if (support) {
    const issues: FeasibilityVariableCheck["issues"] = [];
    if (support.nonNumericRows > 0) {
      issues.push({ severity: "blocker", code: "NON_NUMERIC_WEIGHT", message: `Weight variable '${variable}' has ${support.nonNumericRows} nonnumeric complete-case value(s).` });
    }
    if (support.numericRows === 0) {
      issues.push({ severity: "blocker", code: "NO_NUMERIC_WEIGHT_SUPPORT", message: `Weight variable '${variable}' has no numeric complete-case support.` });
    } else {
      if (support.negativeRows > 0) issues.push({ severity: "blocker", code: "NEGATIVE_WEIGHT", message: `Weight variable '${variable}' must be nonnegative in analyzed rows; observed ${support.negativeRows} negative complete-case value(s).` });
      if (support.positiveRows === 0) issues.push({ severity: "blocker", code: "NO_POSITIVE_WEIGHT_SUPPORT", message: `Weight variable '${variable}' has no positive complete-case weight support.` });
      else if (support.zeroRows > 0) issues.push({ severity: "warning", code: "ZERO_WEIGHT_ROWS", message: `Weight variable '${variable}' assigns zero weight to ${support.zeroRows} complete-case row(s); confirm this exclusion/trimming/design policy before treating results as weighted evidence.` });
      if (support.numericUniqueCount <= 1) issues.push({ severity: "warning", code: "CONSTANT_WEIGHT", message: `Weight variable '${variable}' has no complete-case numeric variation; confirm this is intentional before treating the run as weighted evidence.` });
    }
    if (typeof column.min === "number" && column.min < 0 && support.negativeRows === 0) {
      issues.push({ severity: "warning", code: "MARGINAL_NEGATIVE_WEIGHT", message: `Weight variable '${variable}' has negative marginal values outside the analyzed complete-case rows; confirm exclusions are intentional.` });
    }
    return issues;
  }
  if (typeof column.min === "number" && column.min < 0) return [{ severity: "blocker", code: "NEGATIVE_WEIGHT", message: `Weight variable '${variable}' must be nonnegative; observed minimum ${column.min}.` }];
  if (typeof column.max === "number" && column.max <= 0) return [{ severity: "blocker", code: "NO_POSITIVE_WEIGHT_SUPPORT", message: `Weight variable '${variable}' has no positive observed weight support; observed maximum ${column.max}.` }];
  const issues: FeasibilityVariableCheck["issues"] = [];
  if (typeof column.min === "number" && column.min === 0) issues.push({ severity: "warning", code: "ZERO_WEIGHT_ROWS", message: `Weight variable '${variable}' contains zero weights; confirm this exclusion/trimming/design policy before treating results as weighted evidence.` });
  if (typeof column.uniqueCount === "number" && column.uniqueCount <= 1) issues.push({ severity: "warning", code: "CONSTANT_WEIGHT", message: `Weight variable '${variable}' has no detected variation; confirm this is intentional before treating the run as weighted evidence.` });
  return issues;
}

function offsetDomainIssues(variable: string, column: FeasibilityColumn, completeCase: FeasibilityGateResult["completeCase"]): FeasibilityVariableCheck["issues"] {
  const support = completeCaseNumericDomainSupport(completeCase, variable);
  if (support) {
    const issues: FeasibilityVariableCheck["issues"] = [];
    if (support.nonNumericRows > 0) {
      issues.push({ severity: "blocker", code: "NON_NUMERIC_OFFSET", message: `Offset/person-time variable '${variable}' has ${support.nonNumericRows} nonnumeric complete-case value(s).` });
    }
    if (support.numericRows === 0) {
      issues.push({ severity: "blocker", code: "NO_NUMERIC_OFFSET_SUPPORT", message: `Offset/person-time variable '${variable}' has no numeric complete-case support.` });
    } else {
      if (support.negativeRows > 0 || support.zeroRows > 0 || support.positiveRows === 0) {
        issues.push({ severity: "blocker", code: "NONPOSITIVE_OFFSET", message: `Offset/person-time variable '${variable}' must be strictly positive in analyzed rows before log-offset count-rate modeling; complete cases include ${support.negativeRows} negative and ${support.zeroRows} zero value(s).` });
      }
      if (support.numericUniqueCount <= 1) issues.push({ severity: "warning", code: "CONSTANT_OFFSET", message: `Offset/person-time variable '${variable}' has no complete-case numeric variation; confirm a rate model is still the intended interpretation.` });
    }
    if (typeof column.min === "number" && column.min <= 0 && support.negativeRows === 0 && support.zeroRows === 0) {
      issues.push({ severity: "warning", code: "MARGINAL_NONPOSITIVE_OFFSET", message: `Offset/person-time variable '${variable}' has nonpositive marginal values outside the analyzed complete-case rows; confirm exclusions are intentional.` });
    }
    return issues;
  }
  if (typeof column.min === "number" && column.min <= 0) return [{ severity: "blocker", code: "NONPOSITIVE_OFFSET", message: `Offset/person-time variable '${variable}' must be strictly positive before log-offset count-rate modeling; observed minimum ${column.min}.` }];
  const issues: FeasibilityVariableCheck["issues"] = [];
  if (typeof column.uniqueCount === "number" && column.uniqueCount <= 1) issues.push({ severity: "warning", code: "CONSTANT_OFFSET", message: `Offset/person-time variable '${variable}' has no detected variation; confirm a rate model is still the intended interpretation.` });
  return issues;
}

interface CompleteCaseNumericDomainSupport {
  numericRows: number;
  nonNumericRows: number;
  negativeRows: number;
  zeroRows: number;
  positiveRows: number;
  numericUniqueCount: number;
  min: number | null;
  max: number | null;
}

function completeCaseNumericDomainSupport(completeCase: FeasibilityGateResult["completeCase"], variableName: string | null | undefined): CompleteCaseNumericDomainSupport | null {
  if (!variableName) return null;
  const counts = completeCase.completeValueCounts[variableName];
  if (!counts) return null;
  let numericRows = 0;
  let nonNumericRows = 0;
  let negativeRows = 0;
  let zeroRows = 0;
  let positiveRows = 0;
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;
  const numericValues = new Set<string>();
  for (const [rawValue, count] of Object.entries(counts)) {
    if (count <= 0) continue;
    const value = Number(rawValue);
    if (!Number.isFinite(value)) {
      nonNumericRows += count;
      continue;
    }
    numericRows += count;
    numericValues.add(String(value));
    min = Math.min(min, value);
    max = Math.max(max, value);
    if (value < 0) negativeRows += count;
    else if (value === 0) zeroRows += count;
    else positiveRows += count;
  }
  return {
    numericRows,
    nonNumericRows,
    negativeRows,
    zeroRows,
    positiveRows,
    numericUniqueCount: numericValues.size,
    min: Number.isFinite(min) ? min : null,
    max: Number.isFinite(max) ? max : null,
  };
}

function identifierAllowedForRole(role: string): boolean {
  return ["id", "cluster", "strata"].includes(role);
}

function roleVariationIssues(role: string, variable: string, column: FeasibilityColumn, completeCase: FeasibilityGateResult["completeCase"]): FeasibilityVariableCheck["issues"] {
  if (role === "id" || role === "weight" || role === "offset") return [];
  const completeLevels = completeCaseLevelCount(completeCase, variable);
  const marginalLevels = typeof column.uniqueCount === "number" ? column.uniqueCount : null;
  const observedLevels = completeLevels ?? marginalLevels;
  const source = completeLevels !== null ? "analysis-complete" : "marginal";
  if (observedLevels === null || observedLevels > 1 || column.nonMissingRows === 0) return [];

  if (roleRequiresVariation(role)) {
    return [{
      severity: "blocker",
      code: "NO_ROLE_VARIATION",
      message: `${role} variable '${variable}' has only ${observedLevels} ${source} level(s); it cannot support the requested comparison, association, prediction, or time-to-event role.`,
    }];
  }
  if (roleVariationWarning(role)) {
    return [{
      severity: "warning",
      code: "LOW_SIGNAL_ROLE_VARIATION",
      message: `${role} variable '${variable}' has only ${observedLevels} ${source} level(s); it adds no estimable variation and should usually be removed or reviewed before formal modeling.`,
    }];
  }
  return [];
}

function roleRequiresVariation(role: string): boolean {
  return ["outcome", "exposure", "group", "time", "start", "stop", "event", "period", "post", "running_variable", "instrument", "variable"].includes(role);
}

function roleVariationWarning(role: string): boolean {
  return ["covariate", "exact_covariate", "strata", "cluster"].includes(role);
}

function feasibilityVariableRoles(opts: FeasibilityGateOptions): FeasibilityVariableRole[] {
  const idLikeRequired = requiresId(opts.method);
  const pairs: FeasibilityVariableRole[] = [
    ...role("outcome", opts.outcome, true),
    ...role("exposure", opts.exposure, requiresExposure(opts.method)),
    ...role("group", opts.group, requiresGroup(opts.method)),
    ...role("time", opts.time, requiresTime(opts.method) && !opts.stop),
    ...role("start", opts.start, requiresStart(opts.method)),
    ...role("stop", opts.stop, requiresStop(opts.method) || (requiresTime(opts.method) && !opts.time)),
    ...role("event", opts.event, requiresEvent(opts.method)),
    ...role("id", opts.id, idLikeRequired && !opts.cluster),
    ...role("strata", opts.strata, false),
    ...role("cluster", opts.cluster, idLikeRequired),
    ...role("period", opts.period, requiresPeriod(opts.method)),
    ...role("post", opts.post, requiresPost(opts.method)),
    ...role("running_variable", opts.runningVariable, requiresRunningVariable(opts.method)),
    ...role("instrument", opts.instrument, requiresInstrument(opts.method)),
    ...role("weight", opts.weight, true),
    ...role("offset", opts.offset, true),
    ...(opts.variables ?? []).map(name => ({ role: "variable", name, required: true })),
    ...(opts.covariates ?? []).map(name => ({ role: "covariate", name, required: true })),
    ...(opts.exactCovariates ?? []).map(name => ({ role: "exact_covariate", name, required: true })),
  ];
  const seen = new Set<string>();
  return pairs.filter(item => {
    const key = `${item.role}:${item.name}`;
    if (!item.name || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function role(roleName: FeasibilityVariableRole["role"], name: string | null | undefined, required: boolean): FeasibilityVariableRole[] {
  return name ? [{ role: roleName, name, required }] : [];
}

function buildCompleteCase(rowScan: RowScan | null, summary: ResearchTableSummary | null, dataPath: string | null): FeasibilityGateResult["completeCase"] {
  if (rowScan) {
    return {
      scanned: true,
      scannedRows: rowScan.scannedRows,
      completeRows: rowScan.completeRows,
      completeFraction: rowScan.scannedRows ? round(rowScan.completeRows / rowScan.scannedRows, 4) : null,
      completeValueCounts: rowScan.completeValueCounts,
      completePairCounts: rowScan.completePairCounts,
      scanReason: rowScan.truncated ? `Scanned first ${rowScan.scannedRows} rows for feasibility.` : `Scanned ${rowScan.scannedRows} rows for feasibility.`,
    };
  }
  return {
    scanned: false,
    scannedRows: 0,
    completeRows: null,
    completeFraction: null,
    completeValueCounts: {},
    completePairCounts: {},
    scanReason: dataPath ? "Complete-case row scan is available for CSV/JSON inputs; this format could not be parsed cheaply." : summary ? "Only aggregate table summary was available." : "No data path or table summary was available.",
  };
}

function completeCaseAttritionAssessment(
  completeCase: FeasibilityGateResult["completeCase"],
  minRows: number,
): { blockers: string[]; warnings: string[]; rationale: string; suggestedFixes: string[] } {
  if (!completeCase.scanned || completeCase.completeRows === null || completeCase.completeFraction === null) {
    return {
      blockers: [],
      warnings: [],
      rationale: "Selected-variable complete-case retention could not be directly measured.",
      suggestedFixes: [],
    };
  }
  if (completeCase.scannedRows === 0) {
    return {
      blockers: ["COMPLETE_CASE_ATTRITION_EXTREME: no rows were available to evaluate selected-variable complete-case retention."],
      warnings: [],
      rationale: "Selected-variable complete-case retention is 0/0 rows.",
      suggestedFixes: ["Profile the intended cohort table and verify the selected variables before method selection."],
    };
  }
  const completeRows = completeCase.completeRows;
  const scannedRows = completeCase.scannedRows;
  const percent = (completeCase.completeFraction * 100).toFixed(1);
  const message = `selected analysis variables retain ${completeRows}/${scannedRows} complete-case row(s) (${percent}%).`;
  if (completeCase.completeFraction < 0.15) {
    return {
      blockers: [`COMPLETE_CASE_ATTRITION_EXTREME: ${message}`],
      warnings: [],
      rationale: `Selected-variable complete-case attrition is extreme; ${message}`,
      suggestedFixes: ["Redesign the variable set, audit missingness mechanisms, use prespecified imputation/weighting sensitivity, or keep the study descriptive."],
    };
  }
  if (completeCase.completeFraction < 0.35 && completeRows < minRows) {
    return {
      blockers: [`COMPLETE_CASE_ATTRITION_HIGH_AND_UNDERPOWERED: ${message} Preferred complete-case minimum is ${minRows}.`],
      warnings: [],
      rationale: `Selected-variable complete-case attrition is high and under the configured row minimum; ${message}`,
      suggestedFixes: ["Remove nonessential high-missingness variables, broaden the cohort, or run a missingness-focused feasibility study before formal modeling."],
    };
  }
  if (completeCase.completeFraction < 0.6) {
    return {
      blockers: [],
      warnings: [`COMPLETE_CASE_ATTRITION_HIGH: ${message}`],
      rationale: `Selected-variable complete-case attrition is high; ${message}`,
      suggestedFixes: ["Review complete-case exclusions, report missingness/nonmissing counts, and add complete-case sensitivity or imputation before formal claims."],
    };
  }
  return {
    blockers: [],
    warnings: [],
    rationale: `Selected-variable complete-case retention is ${completeRows}/${scannedRows} row(s) (${percent}%).`,
    suggestedFixes: [],
  };
}

function buildOutcomeDiagnostics(opts: FeasibilityGateOptions, rowScan: RowScan | null, byName: Map<string, ResearchTableSummary["columns"][number]>): FeasibilityGateResult["outcomeDiagnostics"] {
  const outcome = opts.outcome ?? opts.event ?? null;
  const fullObservedLevels = outcome && rowScan?.valueCounts[outcome]
    ? Object.entries(rowScan.valueCounts[outcome]).map(([value, count]) => ({ value, count })).sort((a, b) => b.count - a.count)
    : outcome && byName.get(outcome)?.valueCounts?.length
      ? byName.get(outcome)!.valueCounts!.map(item => ({ value: item.value, count: item.count })).sort((a, b) => b.count - a.count)
    : [];
  const observedLevels = fullObservedLevels.slice(0, 20);
  const fullAnalysisObservedLevels = outcome && rowScan?.completeValueCounts[outcome]
    ? Object.entries(rowScan.completeValueCounts[outcome]).map(([value, count]) => ({ value, count })).sort((a, b) => b.count - a.count)
    : [];
  const analysisObservedLevels = fullAnalysisObservedLevels.slice(0, 20);
  const binary = binaryCounts(fullObservedLevels);
  const analysisBinary = binaryCounts(fullAnalysisObservedLevels);
  const column = outcome ? byName.get(outcome) : undefined;
  return {
    outcome,
    observedLevels,
    observedLevelCount: fullObservedLevels.length || null,
    binarySupported: fullObservedLevels.length ? Boolean(binary) : null,
    eventCount: binary?.eventCount ?? null,
    nonEventCount: binary?.nonEventCount ?? null,
    eventRate: binary && binary.eventCount + binary.nonEventCount > 0 ? round(binary.eventCount / (binary.eventCount + binary.nonEventCount), 4) : null,
    analysisObservedLevels,
    analysisObservedLevelCount: fullAnalysisObservedLevels.length || null,
    analysisBinarySupported: fullAnalysisObservedLevels.length ? Boolean(analysisBinary) : null,
    analysisEventCount: analysisBinary?.eventCount ?? null,
    analysisNonEventCount: analysisBinary?.nonEventCount ?? null,
    analysisEventRate: analysisBinary && analysisBinary.eventCount + analysisBinary.nonEventCount > 0 ? round(analysisBinary.eventCount / (analysisBinary.eventCount + analysisBinary.nonEventCount), 4) : null,
    usable: outcome ? column ? column.nonMissingRows > 0 && (fullObservedLevels.length !== 1 || !rowScan) : rowScan ? false : null : null,
  };
}

function buildInternalReviews(domains: FeasibilityDomainScore[], opts: FeasibilityGateOptions, outcome: FeasibilityGateResult["outcomeDiagnostics"]): FeasibilityInternalReview[] {
  const domain = (id: FeasibilityDomainScore["id"]) => domains.find(item => item.id === id);
  const mk = (
    reviewerId: FeasibilityInternalReview["reviewerId"],
    watched: FeasibilityDomainScore["id"][],
    approveMessage: string,
  ): FeasibilityInternalReview => {
    const selected = watched.map(id => domain(id)).filter((item): item is FeasibilityDomainScore => Boolean(item));
    const blockers = selected.flatMap(item => item.blockers);
    const warnings = selected.flatMap(item => item.warnings);
    const avg = selected.reduce((sum, item) => sum + item.score, 0) / Math.max(selected.length, 1);
    const stance: FeasibilityInternalReview["stance"] = blockers.length ? "reject" : avg < 0.55 ? "needs_review" : warnings.length ? "approve_with_modifications" : "approve";
    const suggestedVerdict = blockers.length ? "reject" : selected.some(item => item.id === "phenotype_confidence" && item.status !== "pass") ? "needs_phenotype_review" : selected.some(item => item.id === "data_availability" && item.status !== "pass") ? "needs_data_profiling" : avg < 0.7 ? "exploratory_only" : "formal_analysis_ready";
    return {
      reviewerId,
      stance,
      confidence: round(Math.max(0.45, Math.min(0.95, avg)), 3),
      primaryConcerns: blockers.length ? blockers : warnings.length ? warnings.slice(0, 5) : [approveMessage],
      requiredActions: blockers.length || warnings.length ? unique(selected.flatMap(item => item.suggestedFixes)).slice(0, 6) : [],
      suggestedVerdict,
      evidenceRefs: unique(selected.flatMap(item => item.evidenceRefs)),
    };
  };
  const reviews = [
    mk("data_agent", ["data_availability", "cohort_size", "missingness", "artifact_readiness", "cost_and_access"], "Data profile is adequate for the proposed next step."),
    mk("methods_agent", ["method_suitability", "expected_statistical_power", "outcome_observability", "design_specificity"], "Methods appear compatible with observable data."),
    mk("phenotype_temporal_agent", ["phenotype_confidence", "temporal_validity", "outcome_observability"], "Phenotype and timing risks are not blocking."),
    mk("semantic_power_agent", ["semantic_plausibility", "expected_statistical_power", "event_count", "missingness"], "Semantic and power checks do not block analysis."),
    mk("skeptical_reviewer_agent", ["expected_reviewer_risk", "method_suitability", "phenotype_confidence", "temporal_validity"], "Expected reviewer risk is acceptable."),
  ];
  if (methodRequiresEvents(opts.method) && analyticEventCount(outcome) === null) {
    reviews[1] = { ...reviews[1]!, stance: "needs_review", suggestedVerdict: "needs_data_profiling", primaryConcerns: unique([...reviews[1]!.primaryConcerns, "Event count is unknown for an event-dependent method."]) };
  }
  return reviews;
}

function buildFeasibilityIssues(
  domains: FeasibilityDomainScore[],
  variables: FeasibilityVariableCheck[],
  reviews: FeasibilityInternalReview[],
): FeasibilityIssue[] {
  const issues: FeasibilityIssue[] = [];
  for (const domain of domains) {
    for (const message of domain.blockers) {
      issues.push({
        severity: "blocker",
        code: issueCodeFromMessage(message, `${domain.id}_blocker`),
        message,
        source: "domain",
        domainId: domain.id,
        evidenceRefs: domain.evidenceRefs,
        suggestedFixes: domain.suggestedFixes,
      });
    }
    for (const message of domain.warnings) {
      issues.push({
        severity: "warning",
        code: issueCodeFromMessage(message, `${domain.id}_warning`),
        message,
        source: "domain",
        domainId: domain.id,
        evidenceRefs: domain.evidenceRefs,
        suggestedFixes: domain.suggestedFixes,
      });
    }
  }
  for (const variable of variables) {
    for (const issue of variable.issues) {
      issues.push({
        severity: issue.severity,
        code: issue.code,
        message: issue.message,
        source: "variable",
        variable: variable.name,
        role: variable.role,
        evidenceRefs: [variable.name],
        suggestedFixes: [],
      });
    }
  }
  for (const review of reviews) {
    if (review.stance === "approve") continue;
    const severity: FeasibilityIssue["severity"] = review.stance === "reject" ? "blocker" : "warning";
    for (const concern of review.primaryConcerns) {
      issues.push({
        severity,
        code: issueCodeFromMessage(concern, `${review.reviewerId}_${severity}`),
        message: concern,
        source: "internal_review",
        reviewerId: review.reviewerId,
        evidenceRefs: review.evidenceRefs,
        suggestedFixes: review.requiredActions,
      });
    }
  }
  return uniqueFeasibilityIssues(issues);
}

function uniqueFeasibilityIssues(issues: FeasibilityIssue[]): FeasibilityIssue[] {
  const seen = new Set<string>();
  const out: FeasibilityIssue[] = [];
  for (const issue of issues) {
    const key = `${issue.severity}:${issue.code}:${issue.message}:${issue.source}:${issue.domainId ?? ""}:${issue.variable ?? ""}:${issue.reviewerId ?? ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(issue);
  }
  return out;
}

function issueCodeFromMessage(message: string, fallback: string): string {
  const explicit = message.match(/^\s*([A-Z][A-Z0-9_]{2,})\s*:/);
  if (explicit?.[1]) return explicit[1];
  const normalized = fallback
    .replace(/([a-z])([A-Z])/g, "$1_$2")
    .replace(/[^A-Za-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .toUpperCase();
  return normalized || "FEASIBILITY_ISSUE";
}

function chooseVerdict(domains: FeasibilityDomainScore[], blockers: string[], warnings: string[], reviews: FeasibilityInternalReview[], score: number): FeasibilityVerdict {
  const domain = (id: FeasibilityDomainScore["id"]) => domains.find(item => item.id === id);
  if (blockers.length || reviews.some(review => review.stance === "reject")) return "reject";
  if (domain("data_availability")?.status !== "pass" || domain("cohort_size")?.score! < 0.5 || domain("event_count")?.warnings.some(w => /profiled|unknown/i.test(w))) return "needs_data_profiling";
  if (domain("phenotype_confidence")?.status !== "pass") return "needs_phenotype_review";
  if (domain("temporal_validity")?.warnings.some(warning => warning.includes("TEMPORAL_WINDOW_"))) return "exploratory_only";
  if (domain("missingness")?.warnings.some(warning => warning.includes("COMPLETE_CASE_ATTRITION_"))) return "exploratory_only";
  if (domain("method_suitability")?.warnings.length) return "exploratory_only";
  if (score < 0.72 || warnings.length > 4 || reviews.some(review => review.suggestedVerdict === "exploratory_only")) return "exploratory_only";
  return "formal_analysis_ready";
}

function primaryActionForVerdict(verdict: FeasibilityVerdict, domains: FeasibilityDomainScore[], warnings: string[]): FeasibilityAction {
  if (verdict === "reject") return "reject";
  if (verdict === "needs_data_profiling") return "profile_data";
  if (verdict === "needs_phenotype_review") return "review_phenotype";
  if (verdict === "exploratory_only") return warnings.some(item => /clarif|specific|underspecified/i.test(item)) ? "ask_clarification" : "explore_only";
  if (domains.some(item => item.status === "warning")) return "revise_design";
  return "run_formal_analysis";
}

function requiredActionsForVerdict(verdict: FeasibilityVerdict, domains: FeasibilityDomainScore[], variables: FeasibilityVariableCheck[], reviews: FeasibilityInternalReview[]): string[] {
  if (verdict === "formal_analysis_ready") {
    return domains.some(item => item.blockers.length || item.warnings.length)
      ? unique(domains.flatMap(item => item.blockers.length || item.warnings.length ? item.suggestedFixes : [])).slice(0, 6)
      : [];
  }
  return unique([
    ...domains.flatMap(item => item.status !== "pass" ? item.suggestedFixes : []),
    ...variables.flatMap(item => item.issues.filter(issue => issue.severity !== "note").map(issue => issue.message)),
    ...reviews.flatMap(review => review.requiredActions),
  ]).slice(0, 12);
}

function clarifyingQuestionsFor(opts: FeasibilityGateOptions, domains: FeasibilityDomainScore[], variables: FeasibilityVariableCheck[]): string[] {
  const questions: string[] = [];
  if (requiresOutcomeOrEvent(opts.method) && !opts.outcome && !opts.event) questions.push("What exact outcome or endpoint should be analyzed, and how is it observed in the dataset?");
  if (!opts.exposure && !opts.group && requiresExposure(opts.method)) questions.push("What exposure, treatment, group, or comparator defines the primary contrast?");
  if (domains.find(item => item.id === "temporal_validity")?.status !== "pass") questions.push("What is the index time, baseline window, follow-up window, and censoring rule?");
  if (domains.find(item => item.id === "phenotype_confidence")?.status !== "pass") questions.push("Which versioned phenotype/code definitions should be used, and have inclusions/exclusions/timing rules been reviewed?");
  if (variables.some(item => !item.present)) questions.push("Should missing requested variables be mapped to alternative columns or should the study question be changed?");
  if (opts.surveyDesign && !opts.weight) questions.push("Which survey weight, strata, PSU, and domain/subsample rules apply?");
  return questions.slice(0, 8);
}

function optionalActionsFor(opts: FeasibilityGateOptions, domains: FeasibilityDomainScore[]): string[] {
  const actions = ["Record an AnalysisSpec before execution.", "Run method-select/modeling-plan after feasibility.", "Carry feasibility limitations into manuscript QA and reviewer context."];
  if (domains.find(item => item.id === "expected_reviewer_risk")?.status !== "pass") actions.push("Run a cold reviewer panel before promotion.");
  if (opts.method?.includes("propensity")) actions.push("Add balance diagnostics, positivity/overlap review, and unmeasured-confounding sensitivity.");
  if (methodRequiresEvents(opts.method)) actions.push("Add horizon-specific event counts and censoring/competing-risk notes.");
  return unique(actions);
}

function alternativesFor(opts: FeasibilityGateOptions, verdict: FeasibilityVerdict, domains: FeasibilityDomainScore[]): FeasibilityGateResult["alternativeStudyIdeas"] {
  const alternatives: FeasibilityGateResult["alternativeStudyIdeas"] = [];
  if (verdict === "reject" || verdict === "exploratory_only") {
    alternatives.push({ title: `Descriptive profile for: ${opts.question}`, reason: "A descriptive profile often remains valid when inference is underpowered or underspecified.", expectedVerdict: "formal_analysis_ready" });
  }
  if (domains.find(item => item.id === "event_count")?.status !== "pass") alternatives.push({ title: "Broader composite or longer follow-up endpoint", reason: "Sparse events may become observable with a broader endpoint or longer horizon, but this must be clinically justified.", expectedVerdict: "needs_data_profiling" });
  if (domains.find(item => item.id === "phenotype_confidence")?.status !== "pass") alternatives.push({ title: "Phenotype validation study before outcomes analysis", reason: "Coding uncertainty can be turned into a reviewable phenotype/code-definition deliverable.", expectedVerdict: "needs_phenotype_review" });
  if (domains.find(item => item.id === "missingness")?.status !== "pass") alternatives.push({ title: "Missingness and measurement-quality study", reason: "High missingness may itself be the first useful research-quality question.", expectedVerdict: "exploratory_only" });
  return alternatives.slice(0, 5);
}

function designAdviceFor(opts: FeasibilityGateOptions, verdict: FeasibilityVerdict, domains: FeasibilityDomainScore[], outcome: FeasibilityGateResult["outcomeDiagnostics"], reviews: FeasibilityInternalReview[]): FeasibilityGateResult["studyDesignAdvice"] {
  const posture: FeasibilityGateResult["studyDesignAdvice"]["recommendedPosture"] = verdict === "reject" ? "reject" : verdict === "needs_data_profiling" ? "profile_first" : verdict === "needs_phenotype_review" ? "coding_review_first" : verdict === "exploratory_only" ? "exploratory" : "formal";
  const methodRecommendation = opts.method
    ? domains.find(item => item.id === "method_suitability")?.status === "pass" ? `Requested method ${opts.method} is compatible with current feasibility evidence.` : `Requested method ${opts.method} needs revision or stronger evidence before formal use.`
    : "Run method-select after feasibility; do not choose a confirmatory model from the question alone.";
  const causalQuestion = /(effect|impact|cause|causal|treated|treatment|therapy|intervention|versus|vs\b)/i.test(opts.question);
  return {
    recommendedPosture: posture,
    methodRecommendation,
    estimandOrDesignWarning: causalQuestion ? "Question may imply causality; require explicit estimand, time zero, confounder policy, exchangeability/positivity review, and sensitivity analysis." : null,
    reviewerRiskSummary: reviews.find(item => item.reviewerId === "skeptical_reviewer_agent")?.primaryConcerns.join("; ") ?? `Outcome events=${analyticEventCount(outcome) ?? "unknown"}.`,
  };
}

function assessTemporalCoverage(opts: FeasibilityGateOptions, summary: ResearchTableSummary | null): TemporalCoverageAssessment {
  const questionWindow = parseYearWindowFromQuestion(opts.question);
  const requestedStartYear = opts.temporalStartYear ?? questionWindow.startYear;
  const requestedEndYear = opts.temporalEndYear ?? questionWindow.endYear;
  const base: Omit<TemporalCoverageAssessment, "score" | "rationale"> = {
    requestedStartYear,
    requestedEndYear,
    observedStartYear: null,
    observedEndYear: null,
    observedColumn: null,
    blockers: [],
    warnings: [],
    suggestedFixes: [],
  };
  if (requestedStartYear !== null && requestedEndYear !== null && requestedStartYear > requestedEndYear) {
    return {
      ...base,
      score: 0.2,
      blockers: [`TEMPORAL_WINDOW_INVALID: requested start year ${requestedStartYear} is after requested end year ${requestedEndYear}.`],
      rationale: `Requested calendar window is invalid (${requestedStartYear}-${requestedEndYear}).`,
      suggestedFixes: ["Correct the requested calendar years and rerun feasibility."],
    };
  }
  if (requestedStartYear === null && requestedEndYear === null) {
    return {
      ...base,
      score: 0.9,
      rationale: "No explicit calendar-year window was requested.",
    };
  }
  if (!summary) {
    return {
      ...base,
      score: 0.5,
      warnings: ["TEMPORAL_WINDOW_UNPROFILED: requested calendar-year window cannot be compared with observed data until the dataset is profiled."],
      rationale: `Requested calendar window ${formatYearWindow(requestedStartYear, requestedEndYear)} is not yet profiled against observed data.`,
      suggestedFixes: ["Profile a table with an index/admission/procedure year column and rerun feasibility."],
    };
  }
  const observed = observedYearCoverage(opts, summary);
  if (!observed) {
    return {
      ...base,
      score: 0.55,
      warnings: [`TEMPORAL_WINDOW_COLUMN_MISSING: requested calendar window ${formatYearWindow(requestedStartYear, requestedEndYear)} was found, but no numeric year-like column was profiled.`],
      rationale: `Requested calendar window ${formatYearWindow(requestedStartYear, requestedEndYear)} has no observed year-column evidence in the table summary.`,
      suggestedFixes: ["Map a period/index/admission/procedure year column with observed min/max values and rerun feasibility."],
    };
  }
  const withObserved = {
    ...base,
    observedStartYear: observed.startYear,
    observedEndYear: observed.endYear,
    observedColumn: observed.column.name,
  };
  const requestedStart = requestedStartYear ?? requestedEndYear;
  const requestedEnd = requestedEndYear ?? requestedStartYear;
  if (requestedStart !== null && requestedEnd !== null && (observed.endYear < requestedStart || observed.startYear > requestedEnd)) {
    return {
      ...withObserved,
      score: 0.18,
      blockers: [`TEMPORAL_WINDOW_NOT_OBSERVED: requested ${formatYearWindow(requestedStartYear, requestedEndYear)} does not overlap observed ${observed.column.name} range ${observed.startYear}-${observed.endYear}.`],
      rationale: `Requested calendar window ${formatYearWindow(requestedStartYear, requestedEndYear)} does not overlap observed ${observed.column.name} range ${observed.startYear}-${observed.endYear}.`,
      suggestedFixes: ["Use a dataset/table covering the requested years, change the calendar window, or downgrade to the observed period."],
    };
  }
  const warnings: string[] = [];
  if (requestedStartYear !== null && observed.startYear > requestedStartYear) {
    warnings.push(`TEMPORAL_WINDOW_LEFT_TRUNCATED: requested start year ${requestedStartYear}, but observed ${observed.column.name} starts at ${observed.startYear}.`);
  }
  if (requestedEndYear !== null && observed.endYear < requestedEndYear) {
    warnings.push(`TEMPORAL_WINDOW_RIGHT_TRUNCATED: requested end year ${requestedEndYear}, but observed ${observed.column.name} ends at ${observed.endYear}.`);
  }
  return {
    ...withObserved,
    score: warnings.length ? 0.68 : 0.9,
    warnings,
    rationale: warnings.length
      ? `Requested calendar window ${formatYearWindow(requestedStartYear, requestedEndYear)} is only partially covered by observed ${observed.column.name} range ${observed.startYear}-${observed.endYear}.`
      : `Requested calendar window ${formatYearWindow(requestedStartYear, requestedEndYear)} is covered by observed ${observed.column.name} range ${observed.startYear}-${observed.endYear}.`,
    suggestedFixes: warnings.length ? ["Revise the stated study window, restrict the estimand to observed years, or add data covering the missing calendar period."] : [],
  };
}

function parseYearWindowFromQuestion(question: string): { startYear: number | null; endYear: number | null } {
  const years = [...question.matchAll(/\b(18\d{2}|19\d{2}|20\d{2}|21\d{2}|2200)\b/g)]
    .map(match => Number(match[1]))
    .filter(year => Number.isFinite(year) && year >= 1800 && year <= 2200);
  const uniqueYears = unique(years).sort((a, b) => a - b);
  if (!uniqueYears.length) return { startYear: null, endYear: null };
  if (uniqueYears.length === 1) return { startYear: uniqueYears[0]!, endYear: uniqueYears[0]! };
  return { startYear: uniqueYears[0]!, endYear: uniqueYears[uniqueYears.length - 1]! };
}

function observedYearCoverage(opts: FeasibilityGateOptions, summary: ResearchTableSummary): { column: FeasibilityColumn; startYear: number; endYear: number } | null {
  const requestedNames = unique([opts.period, opts.time, opts.start, opts.stop].filter((item): item is string => Boolean(item)));
  const requestedCandidates = requestedNames
    .map(name => columnByName(summary, name))
    .filter((column): column is FeasibilityColumn => Boolean(column))
    .filter(column => yearLikeColumn(column, true));
  const inferredCandidates = summary.columns.filter(column => yearLikeColumn(column, false));
  const candidates = uniqueColumns([...requestedCandidates, ...inferredCandidates]);
  const usable = candidates
    .map(column => {
      const startYear = yearBoundary(column.min, "floor");
      const endYear = yearBoundary(column.max, "ceil");
      return startYear !== null && endYear !== null ? { column, startYear, endYear } : null;
    })
    .filter((item): item is { column: FeasibilityColumn; startYear: number; endYear: number } => Boolean(item));
  if (!usable.length) return null;
  usable.sort((a, b) => {
    const aRequested = requestedNames.includes(a.column.name) ? 0 : 1;
    const bRequested = requestedNames.includes(b.column.name) ? 0 : 1;
    if (aRequested !== bRequested) return aRequested - bRequested;
    return (b.endYear - b.startYear) - (a.endYear - a.startYear);
  });
  return usable[0] ?? null;
}

function yearLikeColumn(column: FeasibilityColumn, explicitRole: boolean): boolean {
  if (!columnIsNumeric(column)) return false;
  if (typeof column.min !== "number" || typeof column.max !== "number") return false;
  const plausibleRange = column.min >= 1800 && column.max <= 2200;
  if (!plausibleRange) return false;
  if (explicitRole) return true;
  return /(^|_)(year|yr|calendar_year|index_year|admission_year|admit_year|procedure_year|surgery_year|encounter_year|visit_year|fiscal_year)(_|$)|(^|_)(year|yr)$/i.test(column.name);
}

function yearBoundary(value: number | null | undefined, mode: "floor" | "ceil"): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return mode === "floor" ? Math.floor(value) : Math.ceil(value);
}

function formatYearWindow(startYear: number | null, endYear: number | null): string {
  if (startYear !== null && endYear !== null) return `${startYear}-${endYear}`;
  if (startYear !== null) return `starting ${startYear}`;
  if (endYear !== null) return `through ${endYear}`;
  return "unspecified";
}

function uniqueColumns(columns: FeasibilityColumn[]): FeasibilityColumn[] {
  const seen = new Set<string>();
  return columns.filter(column => {
    if (seen.has(column.name)) return false;
    seen.add(column.name);
    return true;
  });
}

function analyticEventCount(outcome: FeasibilityGateResult["outcomeDiagnostics"]): number | null {
  return outcome.analysisEventCount ?? outcome.eventCount;
}

function analyticNonEventCount(outcome: FeasibilityGateResult["outcomeDiagnostics"]): number | null {
  return outcome.analysisNonEventCount ?? outcome.nonEventCount;
}

function expectedPowerModeledTermCount(
  opts: FeasibilityGateOptions,
  summary: ResearchTableSummary | null,
  completeCase: FeasibilityGateResult["completeCase"],
  outcome: FeasibilityGateResult["outcomeDiagnostics"],
  rawPredictorCount: number,
): number {
  if (opts.method && regressionFamilyMethods().has(opts.method)) {
    return regressionFeasibilitySupport(opts.method, opts, summary, completeCase, outcome).modeledParameters;
  }
  return Math.max(1, rawPredictorCount);
}

function nextActionFor(verdict: FeasibilityVerdict, action: FeasibilityAction, required: string[]): string {
  if (verdict === "reject") return `Reject or redesign the paper idea before execution. ${required[0] ?? ""}`.trim();
  if (verdict === "needs_data_profiling") return "Profile the dataset/cohort and rerun feasibility before method selection.";
  if (verdict === "needs_phenotype_review") return "Run phenotype/code review, update phenotype confidence, and rerun feasibility.";
  if (verdict === "exploratory_only") return "Proceed only as exploratory hypothesis generation or revise the design before formal analysis.";
  if (action === "revise_design") return "Formal analysis can proceed after the listed minor design modifications are accepted and documented.";
  return "Proceed to AnalysisSpec/method selection, execution, QA, and reviewer gates.";
}

function labelForVerdict(verdict: FeasibilityVerdict): string {
  switch (verdict) {
    case "reject": return "Reject study idea";
    case "needs_data_profiling": return "Needs data profiling";
    case "needs_phenotype_review": return "Needs phenotype/code review";
    case "exploratory_only": return "Exploratory only";
    case "formal_analysis_ready": return "Formal analysis ready";
  }
}

function reviewerRiskScore(opts: FeasibilityGateOptions, semanticIssues: number, highMissing: number, phenotypeConfidence: number, temporalComplete: boolean, method: StatsMethod | null | undefined, outcome: FeasibilityGateResult["outcomeDiagnostics"]): number {
  let risk = 0.1;
  if (/(cause|effect|impact|treatment|versus|vs\b|mortality|survival|reintervention)/i.test(opts.question)) risk += 0.12;
  if (method?.includes("propensity") || method?.includes("cox") || method === "fine-gray") risk += 0.08;
  const eventCount = analyticEventCount(outcome);
  if (methodRequiresEvents(method) && (eventCount === null || eventCount < conservativeMinEvents(opts))) risk += 0.18;
  if (semanticIssues) risk += Math.min(0.25, semanticIssues * 0.08);
  if (highMissing) risk += Math.min(0.2, highMissing * 0.06);
  if (phenotypeConfidence < 0.75) risk += 0.18;
  if (!temporalComplete) risk += 0.16;
  if (opts.surveyDesign && !opts.allowSurveyApproximation && !opts.weight) risk += 0.12;
  return clamp(risk);
}

function methodSuitabilityScore(
  opts: FeasibilityGateOptions,
  outcome: FeasibilityGateResult["outcomeDiagnostics"],
  summary: ResearchTableSummary | null,
  completeCase: FeasibilityGateResult["completeCase"],
): number {
  if (!opts.method) return 0.72;
  const blockers = methodSuitabilityBlockers(opts, outcome, summary, completeCase);
  if (blockers.length) return 0.2;
  const warnings = methodSuitabilityWarnings(opts, outcome, summary, completeCase);
  return warnings.length ? 0.68 : 0.9;
}

function methodSuitabilityBlockers(
  opts: FeasibilityGateOptions,
  outcome: FeasibilityGateResult["outcomeDiagnostics"],
  summary: ResearchTableSummary | null,
  completeCase: FeasibilityGateResult["completeCase"],
): string[] {
  const blockers: string[] = [];
  const method = opts.method;
  const hasSummary = Boolean(summary);
  const outcomeColumn = columnByName(summary, opts.outcome ?? null);
  const eventColumn = columnByName(summary, opts.event ?? null);
  const exposureColumn = columnByName(summary, opts.exposure ?? opts.group ?? null);
  const groupColumn = columnByName(summary, opts.group ?? opts.exposure ?? null);
  const timeColumn = columnByName(summary, opts.stop ?? opts.time ?? null);
  const requestedVariables = opts.variables ?? [];
  const missingContractArguments = missingFeasibilityContractArguments(opts);
  if (missingContractArguments.length) blockers.push(`METHOD_REQUIRED_ARGUMENTS: ${method} requires missing role(s): ${missingContractArguments.join(", ")}.`);
  if (requiresTime(opts.method) && !opts.time && !opts.stop) blockers.push(`${opts.method} requires a time or stop variable.`);
  if (requiresStart(opts.method) && !opts.start) blockers.push(`${opts.method} requires a start variable.`);
  if (requiresStop(opts.method) && !opts.stop) blockers.push(`${opts.method} requires a stop variable.`);
  if (requiresEvent(opts.method) && !opts.event) blockers.push(`${opts.method} requires an event variable.`);
  if (requiresGroup(opts.method) && !opts.group && !opts.exposure) blockers.push(`${opts.method} requires a group/exposure variable.`);
  if (requiresPeriod(opts.method) && !opts.period) blockers.push(`${opts.method} requires a period variable.`);
  if (requiresPost(opts.method) && !opts.post) blockers.push(`${opts.method} requires a post/intervention indicator.`);
  if (requiresRunningVariable(opts.method) && !opts.runningVariable) blockers.push(`${opts.method} requires a running variable.`);
  if (requiresCutoff(opts.method) && (opts.cutoff === null || opts.cutoff === undefined || !Number.isFinite(opts.cutoff))) blockers.push(`${opts.method} requires a finite numeric cutoff.`);
  if (requiresInstrument(opts.method) && !opts.instrument) blockers.push(`${opts.method} requires an instrument.`);
  if (requiresId(opts.method) && !opts.id && !opts.cluster) blockers.push(`${opts.method} requires an id or cluster variable.`);
  const repeatedRequiredCount = repeatedVariableRequirement(method);
  if (repeatedRequiredCount !== null) {
    if (requestedVariables.length < repeatedRequiredCount) blockers.push(`METHOD_REPEATED_VARIABLES_REQUIRED: ${method} requires at least ${repeatedRequiredCount} repeated-measure variable(s), but ${requestedVariables.length} were supplied.`);
    const duplicates = duplicatedValues(requestedVariables);
    if (duplicates.length) blockers.push(`METHOD_REPEATED_VARIABLES_DISTINCT_REQUIRED: ${method} requires distinct repeated-measure variables, but duplicate variable(s) were supplied: ${duplicates.join(", ")}.`);
  }
  if ((method === "paired-t-test" || method === "wilcoxon") && requestedVariables.length >= 2) {
    const [left, right] = requestedVariables;
    const leftColumn = columnByName(summary, left);
    const rightColumn = columnByName(summary, right);
    if (leftColumn && !columnIsNumeric(leftColumn)) blockers.push(`METHOD_PAIRED_NUMERIC_VARIABLES_REQUIRED: ${method} requires numeric paired measurements, but '${leftColumn.name}' was inferred as ${leftColumn.inferredType}.`);
    if (rightColumn && !columnIsNumeric(rightColumn)) blockers.push(`METHOD_PAIRED_NUMERIC_VARIABLES_REQUIRED: ${method} requires numeric paired measurements, but '${rightColumn.name}' was inferred as ${rightColumn.inferredType}.`);
  }
  if (method === "friedman" && requestedVariables.length >= 3) {
    const nonNumeric = requestedVariables
      .map(variable => columnByName(summary, variable))
      .filter((column): column is FeasibilityColumn => column !== null && !columnIsNumeric(column));
    if (nonNumeric.length) blockers.push(`METHOD_REPEATED_NUMERIC_VARIABLES_REQUIRED: friedman requires numeric repeated measurements, but ${nonNumeric.map(column => `${column.name} is ${column.inferredType}`).join(", ")}.`);
  }
  if (method === "cochran-q" && requestedVariables.length >= 3) {
    const invalidBinary = requestedVariables
      .filter(variable => {
        const levels = completeCaseLevels(completeCase, variable);
        return levels.length > 0 && !binaryCounts(levels);
      });
    if (invalidBinary.length) blockers.push(`METHOD_REPEATED_BINARY_VARIABLES_REQUIRED: cochran-q requires binary analyzed repeated measurements; invalid variable(s): ${invalidBinary.join(", ")}.`);
  }
  const idLikeVariable = opts.cluster ?? opts.id;
  if (method && longitudinalFamilyMethods().has(method) && idLikeVariable) {
    const clusterSupport = completeCaseClusterSupport(completeCase, idLikeVariable);
    if (clusterSupport) {
      if (clusterSupport.clusterCount < 8) blockers.push(`METHOD_LONGITUDINAL_CLUSTER_SUPPORT_REQUIRED: ${method} requires at least 8 complete-case subjects/clusters for the local longitudinal route, but found ${clusterSupport.clusterCount}.`);
      if (clusterSupport.maxRowsPerCluster < 2 || clusterSupport.averageRowsPerCluster < 2 || clusterSupport.singletonClusters > 0) blockers.push(`METHOD_LONGITUDINAL_REPEATED_OBSERVATIONS_REQUIRED: ${method} requires repeated complete-case observations without singleton subjects/clusters; observed min=${clusterSupport.minRowsPerCluster}, max=${clusterSupport.maxRowsPerCluster}, average=${round(clusterSupport.averageRowsPerCluster, 2)}, singleton clusters=${clusterSupport.singletonClusters}.`);
    }
  }
  if (method === "repeated-measures-anova" && idLikeVariable && opts.exposure && opts.outcome) {
    const repeatedSupport = completeCaseLongRepeatedSupport(completeCase, idLikeVariable, opts.exposure, opts.outcome);
    if (repeatedSupport) {
      if (repeatedSupport.clustersWithRepeatedExposure < 2) blockers.push(`METHOD_REPEATED_CLUSTER_SUPPORT_REQUIRED: repeated-measures-anova requires at least two complete-case subjects/clusters with repeated exposure levels, but found ${repeatedSupport.clustersWithRepeatedExposure}.`);
    }
  }
  const eventCount = analyticEventCount(outcome);
  if (methodRequiresEvents(opts.method) && eventCount !== null && eventCount < 3) blockers.push(`Only ${eventCount} analysis-complete event(s) observed for event-dependent method ${opts.method}.`);
  if (method && binaryOutcomeMethods().has(method)) {
    const binaryOutcomeSupported = outcomeColumn
      ? outcome.analysisBinarySupported !== null ? outcome.analysisBinarySupported : columnIsBinaryLike(outcomeColumn, outcome.observedLevels)
      : false;
    if (!outcomeColumn && hasSummary) blockers.push(`METHOD_BINARY_OUTCOME_REQUIRED: ${method} requires an observed binary outcome variable.`);
    else if (outcomeColumn && !binaryOutcomeSupported) blockers.push(`METHOD_BINARY_OUTCOME_REQUIRED: ${method} requires a binary analyzed outcome, but '${outcomeColumn.name}' appears ${columnShapeLabel(outcomeColumn)}.`);
  }
  if (method && multinomialOutcomeMethods().has(method) && outcomeColumn) {
    if (columnIsContinuousLike(outcomeColumn)) blockers.push(`METHOD_CATEGORICAL_OUTCOME_REQUIRED: ${method} requires a categorical outcome, but '${outcomeColumn.name}' appears continuous.`);
    else if ((outcomeColumn.uniqueCount ?? 0) < 3) blockers.push(`METHOD_MULTICLASS_OUTCOME_REQUIRED: ${method} requires at least three outcome classes, but '${outcomeColumn.name}' has ${outcomeColumn.uniqueCount ?? "unknown"}.`);
  }
  if (method && continuousOutcomeMethods().has(method)) {
    if (!outcomeColumn && hasSummary) blockers.push(`METHOD_NUMERIC_OUTCOME_REQUIRED: ${method} requires an observed numeric outcome variable.`);
    else if (outcomeColumn && !columnIsNumeric(outcomeColumn)) blockers.push(`METHOD_NUMERIC_OUTCOME_REQUIRED: ${method} requires a numeric outcome, but '${outcomeColumn.name}' was inferred as ${outcomeColumn.inferredType}.`);
  }
  if (method && countOutcomeMethods().has(method)) {
    const analyzedOutcome = completeCaseNumericSummary(completeCase, outcomeColumn?.name);
    const minCountOutcome = analyzedOutcome?.min ?? outcomeColumn?.min;
    const nonIntegerAnalyzedCount = analyzedOutcome?.nonIntegerCount ?? null;
    if (!outcomeColumn && hasSummary) blockers.push(`METHOD_COUNT_OUTCOME_REQUIRED: ${method} requires an observed count outcome variable.`);
    else if (outcomeColumn && !columnIsNumeric(outcomeColumn)) blockers.push(`METHOD_COUNT_OUTCOME_REQUIRED: ${method} requires a numeric count outcome, but '${outcomeColumn.name}' was inferred as ${outcomeColumn.inferredType}.`);
    else if (outcomeColumn && typeof minCountOutcome === "number" && minCountOutcome < 0) blockers.push(`METHOD_COUNT_OUTCOME_REQUIRED: ${method} requires nonnegative analyzed counts, but '${outcomeColumn.name}' has complete-case minimum ${minCountOutcome}.`);
    else if (outcomeColumn && (nonIntegerAnalyzedCount !== null ? nonIntegerAnalyzedCount > 0 : !columnLooksIntegerValued(outcomeColumn))) blockers.push(`METHOD_COUNT_OUTCOME_REQUIRED: ${method} requires integer-like analyzed counts, but '${outcomeColumn.name}' has non-integer values or insufficient integer evidence.`);
  }
  if (method && positiveContinuousOutcomeMethods().has(method)) {
    const analyzedOutcome = completeCaseNumericSummary(completeCase, outcomeColumn?.name);
    const minPositiveOutcome = analyzedOutcome?.min ?? outcomeColumn?.min;
    if (!outcomeColumn && hasSummary) blockers.push(`METHOD_POSITIVE_OUTCOME_REQUIRED: ${method} requires an observed positive numeric outcome variable.`);
    else if (outcomeColumn && !columnIsNumeric(outcomeColumn)) blockers.push(`METHOD_POSITIVE_OUTCOME_REQUIRED: ${method} requires a numeric outcome, but '${outcomeColumn.name}' was inferred as ${outcomeColumn.inferredType}.`);
    else if (outcomeColumn && typeof minPositiveOutcome === "number" && minPositiveOutcome <= 0) blockers.push(`METHOD_POSITIVE_OUTCOME_REQUIRED: ${method} requires strictly positive analyzed outcomes, but '${outcomeColumn.name}' has complete-case minimum ${minPositiveOutcome}.`);
  }
  if (method && groupedNumericOutcomeMethods().has(method)) {
    if (!outcomeColumn && hasSummary) blockers.push(`METHOD_GROUP_NUMERIC_OUTCOME_REQUIRED: ${method} requires an observed numeric outcome variable.`);
    else if (outcomeColumn && !columnIsNumeric(outcomeColumn)) blockers.push(`METHOD_GROUP_NUMERIC_OUTCOME_REQUIRED: ${method} requires a numeric outcome, but '${outcomeColumn.name}' was inferred as ${outcomeColumn.inferredType}.`);
    const groupUniqueCount = completeCaseLevelCount(completeCase, groupColumn?.name) ?? groupColumn?.uniqueCount ?? 0;
    const outcomeUniqueCount = completeCaseLevelCount(completeCase, outcomeColumn?.name) ?? outcomeColumn?.uniqueCount ?? 0;
    if (groupColumn && groupUniqueCount > 0 && groupUniqueCount < 2) blockers.push(`METHOD_GROUP_LEVELS_REQUIRED: ${method} requires at least two analyzed groups, but '${groupColumn.name}' has ${groupUniqueCount} complete-case group(s).`);
    if (groupColumn && twoGroupOnlyMethods().has(method) && groupUniqueCount > 0 && groupUniqueCount !== 2) blockers.push(`METHOD_TWO_GROUP_REQUIRED: ${method} requires exactly two analyzed groups, but '${groupColumn.name}' has ${groupUniqueCount} complete-case group(s).`);
    if (outcomeColumn && outcomeUniqueCount > 0 && outcomeUniqueCount < 2) blockers.push(`METHOD_GROUP_OUTCOME_VARIATION_REQUIRED: ${method} requires analyzed outcome variation, but '${outcomeColumn.name}' has ${outcomeUniqueCount} complete-case value(s).`);
  }
  if (method && categoricalAssociationMethods().has(method)) {
    if (outcomeColumn && columnIsContinuousLike(outcomeColumn)) blockers.push(`METHOD_CATEGORICAL_INPUT_REQUIRED: ${method} requires categorical/indicator inputs, but outcome '${outcomeColumn.name}' appears continuous.`);
    if (exposureColumn && columnIsContinuousLike(exposureColumn)) blockers.push(`METHOD_CATEGORICAL_INPUT_REQUIRED: ${method} requires categorical/indicator inputs, but exposure/group '${exposureColumn.name}' appears continuous.`);
    const outcomeLevelCount = completeCaseLevelCount(completeCase, outcomeColumn?.name) ?? outcomeColumn?.uniqueCount ?? 0;
    const exposureLevelCount = completeCaseLevelCount(completeCase, exposureColumn?.name) ?? exposureColumn?.uniqueCount ?? 0;
    if (twoByTwoCategoricalMethods().has(method)) {
      if (outcomeColumn && outcomeLevelCount > 0 && outcomeLevelCount !== 2) blockers.push(`METHOD_2X2_REQUIRED: ${method} requires a binary analyzed outcome, but '${outcomeColumn.name}' has ${outcomeLevelCount} complete-case level(s).`);
      if (exposureColumn && exposureLevelCount > 0 && exposureLevelCount !== 2) blockers.push(`METHOD_2X2_REQUIRED: ${method} requires a binary analyzed exposure/group, but '${exposureColumn.name}' has ${exposureLevelCount} complete-case level(s).`);
    }
    if (method === "cochran-armitage-trend") {
      if (outcomeColumn && outcomeLevelCount > 0 && outcomeLevelCount !== 2) blockers.push(`METHOD_BINARY_OUTCOME_REQUIRED: ${method} requires a binary analyzed outcome, but '${outcomeColumn.name}' has ${outcomeLevelCount} complete-case level(s).`);
      if (exposureColumn && exposureLevelCount > 0 && exposureLevelCount < 2) blockers.push(`METHOD_ORDERED_EXPOSURE_REQUIRED: ${method} requires at least two ordered analyzed exposure/group levels, but '${exposureColumn.name}' has ${exposureLevelCount} complete-case level(s).`);
    }
  }
  if (method && correlationMethods().has(method)) {
    const variables = unique([opts.outcome, opts.exposure, ...(method === "partial-correlation" ? opts.covariates ?? [] : [])].filter((item): item is string => Boolean(item)));
    for (const variable of variables) {
      const column = columnByName(summary, variable);
      if (column && !columnIsNumeric(column)) blockers.push(`METHOD_NUMERIC_INPUT_REQUIRED: ${method} requires numeric inputs, but '${column.name}' was inferred as ${column.inferredType}.`);
      const analyzedLevelCount = completeCaseLevelCount(completeCase, variable) ?? column?.uniqueCount ?? 0;
      if (column && analyzedLevelCount > 0 && analyzedLevelCount < 2) blockers.push(`METHOD_CORRELATION_VARIATION_REQUIRED: ${method} requires analyzed variation in '${column.name}', but it has ${analyzedLevelCount} complete-case value(s).`);
    }
  }
  if (method && propensityTreatmentMethods().has(method)) {
    const treatmentLevels = completeCaseLevels(completeCase, exposureColumn?.name);
    const binaryTreatmentSupported = exposureColumn
      ? treatmentLevels.length ? Boolean(binaryCounts(treatmentLevels)) : columnIsBinaryLike(exposureColumn, columnValueLevels(exposureColumn))
      : false;
    if (!exposureColumn && hasSummary) blockers.push(`METHOD_BINARY_TREATMENT_REQUIRED: ${method} requires an observed binary treatment/exposure variable.`);
    else if (exposureColumn && !binaryTreatmentSupported) blockers.push(`METHOD_BINARY_TREATMENT_REQUIRED: ${method} requires a binary analyzed treatment/exposure, but '${exposureColumn.name}' appears ${columnShapeLabel(exposureColumn)}.`);
    const armSupport = completeCaseBinaryArmSupport(completeCase, exposureColumn?.name, opts.exposureThreshold);
    if (armSupport && armSupport.minArmRows < 5) blockers.push(`METHOD_TREATMENT_ARM_SUPPORT_REQUIRED: ${method} requires at least 5 complete-case rows in each treated/control arm before propensity estimation; observed treated=${armSupport.treatedRows}, control=${armSupport.controlRows} using ${armSupport.source}.`);
  }
  if (method && diagnosticAccuracyMethods().has(method)) {
    const binaryReferenceSupported = outcomeColumn
      ? outcome.analysisBinarySupported !== null ? outcome.analysisBinarySupported : columnIsBinaryLike(outcomeColumn, outcome.observedLevels)
      : false;
    const indexLevels = completeCaseLevels(completeCase, exposureColumn?.name);
    const binaryIndexSupported = exposureColumn
      ? indexLevels.length ? Boolean(binaryCounts(indexLevels)) : columnIsBinaryLike(exposureColumn, columnValueLevels(exposureColumn))
      : false;
    if (!outcomeColumn && hasSummary) blockers.push(`METHOD_DIAGNOSTIC_REFERENCE_REQUIRED: ${method} requires an observed reference-standard outcome.`);
    else if (outcomeColumn && !binaryReferenceSupported && opts.outcomeThreshold === undefined) blockers.push(`METHOD_DIAGNOSTIC_REFERENCE_REQUIRED: ${method} requires a binary analyzed reference standard or an explicit threshold, but '${outcomeColumn.name}' appears ${columnShapeLabel(outcomeColumn)}.`);
    else if (outcomeColumn && opts.outcomeThreshold !== undefined && !columnIsNumeric(outcomeColumn)) blockers.push(`METHOD_DIAGNOSTIC_REFERENCE_REQUIRED: ${method} can threshold only numeric reference standards, but '${outcomeColumn.name}' was inferred as ${outcomeColumn.inferredType}.`);
    if (!exposureColumn && hasSummary) blockers.push(`METHOD_DIAGNOSTIC_INDEX_REQUIRED: ${method} requires an observed binary index-test exposure/group.`);
    else if (exposureColumn && !binaryIndexSupported && opts.exposureThreshold === undefined) blockers.push(`METHOD_DIAGNOSTIC_INDEX_REQUIRED: ${method} requires a binary analyzed index test or an explicit threshold, but '${exposureColumn.name}' appears ${columnShapeLabel(exposureColumn)}.`);
    else if (exposureColumn && opts.exposureThreshold !== undefined && !columnIsNumeric(exposureColumn)) blockers.push(`METHOD_DIAGNOSTIC_INDEX_REQUIRED: ${method} can threshold only numeric index tests, but '${exposureColumn.name}' was inferred as ${exposureColumn.inferredType}.`);
  }
  if (method && survivalEventMethods().has(method)) {
    const analyzedTime = completeCaseNumericSummary(completeCase, timeColumn?.name);
    const minTime = analyzedTime?.min ?? timeColumn?.min;
    if (timeColumn && !columnIsNumeric(timeColumn)) blockers.push(`METHOD_NUMERIC_TIME_REQUIRED: ${method} requires numeric follow-up time, but '${timeColumn.name}' was inferred as ${timeColumn.inferredType}.`);
    if (timeColumn && typeof minTime === "number" && minTime < 0) blockers.push(`METHOD_NONNEGATIVE_TIME_REQUIRED: ${method} requires nonnegative analyzed follow-up time, but '${timeColumn.name}' has complete-case minimum ${minTime}.`);
    const binaryEventSupported = eventColumn
      ? outcome.analysisBinarySupported !== null ? outcome.analysisBinarySupported : columnIsBinaryLike(eventColumn, outcome.observedLevels)
      : false;
    if (eventColumn && !binaryEventSupported && binarySurvivalEventMethods().has(method)) blockers.push(`METHOD_BINARY_EVENT_REQUIRED: ${method} requires a binary analyzed event indicator; multistate/competing event coding should route to Aalen-Johansen or a validated competing-risk backend.`);
    if (eventColumn && typeof eventColumn.min === "number" && eventColumn.min < 0) blockers.push(`METHOD_EVENT_CODE_RANGE_INVALID: ${method} cannot use negative event codes from '${eventColumn.name}'.`);
  }
  blockers.push(...modelTermIntegrityBlockers(method, opts));
  blockers.push(...causalQuasiExperimentalBlockers(method, opts, summary, completeCase, outcomeColumn, exposureColumn, timeColumn));
  blockers.push(...regressionFamilyBlockers(method, opts, summary, completeCase, outcome, outcomeColumn));
  blockers.push(...missingnessMethodBlockers(method, opts, summary, requestedVariables));
  blockers.push(...predictionEvaluationBlockers(method, opts, summary, completeCase, outcomeColumn, exposureColumn, outcome));
  blockers.push(...measurementAndExplorationBlockers(method, requestedVariables, summary, completeCase, opts));
  return blockers;
}

function missingFeasibilityContractArguments(opts: FeasibilityGateOptions): StatsContractArgumentName[] {
  if (!opts.method) return [];
  return requiredContractArgumentsForMethod(opts.method).filter(argument => !feasibilityContractArgumentPresent(opts, argument));
}

function feasibilityContractArgumentPresent(opts: FeasibilityGateOptions, argument: StatsContractArgumentName): boolean {
  if (argument === "outcome") return Boolean(opts.outcome);
  if (argument === "exposure") return Boolean(opts.exposure);
  if (argument === "group") return Boolean(opts.group);
  if (argument === "time") return Boolean(opts.time);
  if (argument === "timeOrStop") return Boolean(opts.time || opts.stop);
  if (argument === "start") return Boolean(opts.start);
  if (argument === "stop") return Boolean(opts.stop);
  if (argument === "event") return Boolean(opts.event);
  if (argument === "id") return Boolean(opts.id);
  if (argument === "strata") return Boolean(opts.strata);
  if (argument === "period") return Boolean(opts.period);
  if (argument === "post") return Boolean(opts.post);
  if (argument === "instrument") return Boolean(opts.instrument);
  if (argument === "runningVariable") return Boolean(opts.runningVariable);
  if (argument === "cutoff") return opts.cutoff !== undefined && opts.cutoff !== null && Number.isFinite(opts.cutoff);
  if (argument === "covariates") return (opts.covariates ?? []).length > 0;
  if (argument === "clusterOrId") return Boolean(opts.cluster || opts.id);
  if (argument === "variables") {
    const variables = opts.variables ?? [];
    if (opts.method === "paired-t-test" || opts.method === "wilcoxon") return variables.length >= 2;
    if (opts.method === "friedman" || opts.method === "repeated-measures-anova") return variables.length >= 3;
    return variables.length > 0 || feasibilityVariableRoles(opts).length > 0;
  }
  return false;
}

function methodSuitabilityWarnings(
  opts: FeasibilityGateOptions,
  outcome: FeasibilityGateResult["outcomeDiagnostics"],
  summary: ResearchTableSummary | null,
  completeCase: FeasibilityGateResult["completeCase"],
): string[] {
  const warnings: string[] = [];
  const method = opts.method;
  const outcomeColumn = columnByName(summary, opts.outcome ?? null);
  const eventColumn = columnByName(summary, opts.event ?? null);
  const exposureColumn = columnByName(summary, opts.exposure ?? opts.group ?? null);
  const requestedVariables = opts.variables ?? [];
  if (!opts.method) warnings.push("Method has not been selected yet.");
  if (methodRequiresEvents(opts.method) && analyticEventCount(outcome) === null) warnings.push("Event count is unknown for an event-dependent method.");
  if (opts.surveyDesign && !opts.weight) warnings.push("Survey design was declared but no weight variable was supplied.");
  if (opts.method?.includes("propensity") && (opts.covariates ?? []).length < 2) warnings.push("Propensity design has too few measured covariates to support serious confounding adjustment.");
  if (method && linearContinuousMethods().has(method) && outcomeColumn && columnIsBinaryLike(outcomeColumn, outcome.observedLevels)) warnings.push(`${method} is being considered for a binary-looking outcome; logistic or binomial methods are usually the primary inferential route unless a linear-probability sensitivity is explicitly justified.`);
  if (method && binaryOutcomeMethods().has(method) && outcomeColumn && (analyticEventCount(outcome) === null || analyticNonEventCount(outcome) === null)) warnings.push(`${method} needs binary outcome class counts before formal promotion.`);
  if (method && countOutcomeMethods().has(method) && outcomeColumn && typeof outcomeColumn.zeroFraction === "number" && outcomeColumn.zeroFraction > 0.4 && !method.includes("zero-inflated")) warnings.push(`${method} sees zero fraction ${round(outcomeColumn.zeroFraction, 3)}; consider a zero-inflated or hurdle sensitivity route.`);
  if (method && groupedNumericOutcomeMethods().has(method) && exposureColumn && columnIsContinuousLike(exposureColumn)) warnings.push(`${method} uses a continuous-looking group/exposure '${exposureColumn.name}'; bin or redefine groups before interpreting a group comparison.`);
  const exposureCompleteLevelCount = completeCaseLevelCount(completeCase, exposureColumn?.name);
  const groupSupport = exposureColumn ? completeCaseGroupSupport(completeCase, exposureColumn.name) : null;
  if (method && groupedNumericOutcomeMethods().has(method) && groupSupport && groupSupport.minGroupRows < 5) warnings.push(`METHOD_GROUP_SUPPORT_SPARSE: ${method} has sparse analyzed group support; smallest complete-case group '${groupSupport.minGroupValue}' has ${groupSupport.minGroupRows} row(s).`);
  if (method && ["anova", "ancova", "kruskal-wallis"].includes(method) && (exposureCompleteLevelCount ?? exposureColumn?.uniqueCount) === 2) warnings.push(`${method} is executable with two analyzed groups, but a two-group-specific method may be easier to interpret unless adjustment or a prespecified omnibus framework justifies this route.`);
  if (method && propensityTreatmentMethods().has(method)) {
    const armSupport = completeCaseBinaryArmSupport(completeCase, exposureColumn?.name, opts.exposureThreshold);
    if (armSupport && armSupport.minArmRows >= 5 && armSupport.minArmRows < 20) warnings.push(`METHOD_TREATMENT_ARM_SUPPORT_SPARSE: ${method} has limited treated/control complete-case support; observed treated=${armSupport.treatedRows}, control=${armSupport.controlRows} using ${armSupport.source}.`);
  }
  if (method && (binaryOutcomeMethods().has(method) || propensityTreatmentMethods().has(method) || twoByTwoCategoricalMethods().has(method))) {
    const outcomeByArm = completeCaseBinaryOutcomeByExposureSupport(completeCase, outcomeColumn?.name, exposureColumn?.name, opts.exposureThreshold);
    if (outcomeByArm) {
      if (outcomeByArm.zeroCells.length) {
        warnings.push(`METHOD_BINARY_OUTCOME_BY_ARM_ZERO_CELL: ${method} has zero complete-case outcome-by-exposure cell(s): ${outcomeByArm.zeroCells.join(", ")}. Treat contrasts as exploratory or use exact/descriptive reporting with explicit sparse-cell limitations.`);
      } else if (outcomeByArm.minCellRows < 5) {
        warnings.push(`METHOD_BINARY_OUTCOME_BY_ARM_SPARSE_CELL: ${method} has sparse complete-case outcome-by-exposure support; smallest cell ${outcomeByArm.minCellLabel} has ${outcomeByArm.minCellRows} row(s). Treat adjusted, causal, or comparative claims as exploratory until the endpoint/cohort is broadened.`);
      }
    }
  }
  if (method && survivalEventMethods().has(method)) {
    const survivalGroupVariable = opts.group ?? (opts.exposure && exposureColumn && !columnIsContinuousLike(exposureColumn) ? opts.exposure : null);
    const survivalGroupSupport = completeCaseSurvivalGroupEventSupport(completeCase, eventColumn?.name, survivalGroupVariable);
    if (survivalGroupSupport?.zeroEventGroups.length) {
      warnings.push(`METHOD_SURVIVAL_GROUP_ZERO_EVENTS: ${method} has grouped survival comparison arm(s) with zero complete-case events: ${survivalGroupSupport.zeroEventGroups.join(", ")}. Use descriptive Kaplan-Meier/risk-table reporting or broaden the cohort/endpoint before formal group contrasts.`);
    } else if (survivalGroupSupport?.sparseEventGroups.length) {
      warnings.push(`METHOD_SURVIVAL_GROUP_SPARSE_EVENTS: ${method} has sparse grouped survival event support: ${survivalGroupSupport.sparseEventGroups.join(", ")}. Treat log-rank, Cox, or cumulative-incidence group contrasts as exploratory until each group has adequate events.`);
    }
  }
  if ((method === "paired-t-test" || method === "wilcoxon") && requestedVariables.length >= 2) {
    const [left, right] = requestedVariables;
    const pairShape = left && right ? completeCasePairedDifferenceSummary(completeCase, left, right) : null;
    if (pairShape && pairShape.uniqueDifferenceCount < 2) {
      warnings.push(`METHOD_PAIRED_DIFFERENCE_VARIATION_REQUIRED: ${method} has degenerate analyzed paired differences; ${left} and ${right} have ${pairShape.uniqueDifferenceCount} complete-case difference value(s), so the method runner will return a blocked paired-inference diagnostic.`);
    }
  }
  if (method === "friedman" && requestedVariables.length >= 3) {
    const variation = completeCaseWideRepeatedVariationSummary(completeCase, requestedVariables);
    if (variation && variation.nonzeroDifferencePairs === 0) {
      warnings.push("METHOD_REPEATED_WITHIN_SUBJECT_VARIATION_REQUIRED: friedman has no analyzed within-subject repeated-measure variation; the method runner will return a blocked repeated-measure diagnostic.");
    }
  }
  if (method === "cochran-q" && requestedVariables.length >= 3) {
    const variation = completeCaseWideRepeatedVariationSummary(completeCase, requestedVariables);
    if (variation && variation.discordantPairCount === 0) {
      warnings.push("METHOD_REPEATED_BINARY_DISCORDANCE_REQUIRED: cochran-q has no analyzed within-subject discordance across repeated binary measurements; the method runner will return a blocked repeated-binary diagnostic.");
    }
  }
  const idLikeVariable = opts.cluster ?? opts.id;
  if (method === "repeated-measures-anova" && idLikeVariable && opts.exposure && opts.outcome) {
    const repeatedSupport = completeCaseLongRepeatedSupport(completeCase, idLikeVariable, opts.exposure, opts.outcome);
    if (repeatedSupport && repeatedSupport.clustersWithOutcomeVariation === 0) {
      warnings.push("METHOD_REPEATED_OUTCOME_VARIATION_REQUIRED: repeated-measures-anova has no within-subject outcome variation in analyzed rows; the method runner will return a blocked repeated-measures diagnostic.");
    }
  }
  if (method === "prediction-evaluation" && exposureColumn && exposureColumn.inferredType === "number") {
    const scoreShape = completeCaseNumericSummary(completeCase, exposureColumn.name);
    const uniqueScoreCount = scoreShape?.uniqueCount ?? exposureColumn.uniqueCount ?? 0;
    if (uniqueScoreCount < 3) {
      warnings.push(`METHOD_PREDICTION_SCORE_RESOLUTION_REQUIRED: prediction-evaluation received low-resolution score '${exposureColumn.name}' with ${uniqueScoreCount} complete-case value(s); diagnostic accuracy should be primary and prediction metrics are sensitivity-only.`);
    }
  }
  if (method === "missingness-ipw") {
    const target = opts.outcome ?? requestedVariables[0] ?? null;
    const targetColumn = columnByName(summary, target);
    if (targetColumn && targetColumn.missingFraction === 0) {
      warnings.push(`METHOD_MISSINGNESS_TARGET_REQUIRED: missingness-ipw requires target missingness, but '${targetColumn.name}' has no missing values; the run is a bounded no-op diagnostic rather than an analysis to promote.`);
    }
  }
  if (method && multinomialOutcomeMethods().has(method) && outcomeColumn && columnIsOrdinalName(outcomeColumn.name) && method === "multinomial-logistic-regression") warnings.push("Outcome name suggests ordinal categories; ordinal logistic regression may be more appropriate than multinomial logistic regression if proportional-odds assumptions are acceptable.");
  warnings.push(...modelTermIntegrityWarnings(method, opts));
  warnings.push(...regressionFamilyWarnings(method, opts, summary, completeCase, outcome, outcomeColumn));
  return warnings;
}

function modelTermIntegrityBlockers(method: StatsMethod | null | undefined, opts: FeasibilityGateOptions): string[] {
  if (!method || !modelTermIntegrityMethods().has(method)) return [];
  const blockers: string[] = [];
  const duplicateCovariates = duplicatedValues(opts.covariates ?? []);
  if (duplicateCovariates.length) blockers.push(`METHOD_DUPLICATE_COVARIATES: ${method} received duplicate adjustment covariate(s): ${duplicateCovariates.join(", ")}.`);

  const protectedRoles = new Map<string, string>();
  for (const [role, value] of [
    ["outcome", opts.outcome],
    ["event", opts.event],
    ["time", opts.time],
    ["start", opts.start],
    ["stop", opts.stop],
    ["exposure", opts.exposure],
    ["group", opts.group],
    ["id", opts.id],
    ["cluster", opts.cluster],
    ["strata", opts.strata],
    ["period", opts.period],
    ["post", opts.post],
    ["weight", opts.weight],
    ["running variable", opts.runningVariable],
    ["instrument", opts.instrument],
  ] as Array<[string, string | null | undefined]>) {
    if (value) protectedRoles.set(value, role);
  }

  const roleConflicts = (opts.covariates ?? [])
    .map(covariate => ({ covariate, role: protectedRoles.get(covariate) }))
    .filter((item): item is { covariate: string; role: string } => Boolean(item.role));
  if (roleConflicts.length) {
    blockers.push(`METHOD_MODEL_ROLE_CONFLICT: ${method} cannot use primary-role variable(s) as adjustment covariates: ${roleConflicts.map(item => `${item.covariate} is ${item.role}`).join(", ")}.`);
  }

  const exactRoleConflicts = (opts.exactCovariates ?? [])
    .map(covariate => ({ covariate, role: protectedRoles.get(covariate) }))
    .filter((item): item is { covariate: string; role: string } => Boolean(item.role));
  if (exactRoleConflicts.length) {
    blockers.push(`METHOD_EXACT_MATCH_ROLE_CONFLICT: ${method} cannot exact-match on primary-role variable(s): ${exactRoleConflicts.map(item => `${item.covariate} is ${item.role}`).join(", ")}.`);
  }

  const leakageFindings = modelTermLeakageFindings(method, opts);
  if (leakageFindings.length) {
    blockers.push(`METHOD_OUTCOME_LEAKAGE_TERM_REVIEW: potential outcome-derived or post-index model term(s) detected: ${leakageFindings.map(item => `${item.column} (${item.role}; ${item.reason})`).join("; ")}.`);
  }
  const postTreatmentFindings = modelTermPostTreatmentAdjustmentFindings(method, opts);
  if (postTreatmentFindings.length) {
    blockers.push(`METHOD_POST_TREATMENT_ADJUSTMENT_REVIEW: potential post-baseline treatment/procedure/care adjustment term(s) detected: ${postTreatmentFindings.map(item => `${item.column} (${item.role}; ${item.reason})`).join("; ")}.`);
  }

  return blockers;
}

function modelTermIntegrityWarnings(method: StatsMethod | null | undefined, opts: FeasibilityGateOptions): string[] {
  if (!method || !causalOrPropensityMethods().has(method)) return [];
  const reviewedTerms = [...(opts.covariates ?? []), ...(opts.exactCovariates ?? [])];
  if (!reviewedTerms.length) return [];
  const flagged = reviewedTerms
    .map(column => ({ column, reason: outcomeOrFutureLeakageReason(column, opts.outcome ?? opts.event ?? null) }))
    .filter((item): item is { column: string; reason: string } => Boolean(item.reason));
  if (!flagged.length) return ["Causal adjustment covariate names did not contain obvious post-treatment or outcome markers; protocol-level baseline timing review is still required."];
  return [`Causal adjustment includes terms requiring baseline-timing review: ${flagged.map(item => `${item.column} (${item.reason})`).join("; ")}.`];
}

function modelTermLeakageFindings(method: StatsMethod, opts: FeasibilityGateOptions): Array<{ column: string; role: string; reason: string }> {
  const protectedTerms = new Set([
    opts.outcome,
    opts.event,
    opts.time,
    opts.start,
    opts.stop,
    opts.id,
    opts.cluster,
    opts.strata,
    opts.period,
    opts.post,
    opts.weight,
  ].filter((value): value is string => Boolean(value)));
  const terms: Array<{ column: string | null | undefined; role: string; allowLeakage?: boolean }> = [
    ...(opts.covariates ?? []).map(column => ({ column, role: "adjustment covariate" })),
    ...(opts.exactCovariates ?? []).map(column => ({ column, role: "exact-match covariate" })),
    { column: opts.exposure, role: "exposure/index variable", allowLeakage: outcomeLeakageExposureAllowedMethods().has(method) },
    { column: opts.group, role: "grouping variable" },
    { column: opts.runningVariable, role: "running variable" },
    { column: opts.instrument, role: "instrument" },
  ];
  const seen = new Set<string>();
  const findings: Array<{ column: string; role: string; reason: string }> = [];
  for (const term of terms) {
    if (!term.column || term.allowLeakage || protectedTerms.has(term.column)) continue;
    const reason = outcomeOrFutureLeakageReason(term.column, opts.outcome ?? opts.event ?? null);
    if (!reason) continue;
    const key = `${term.role}:${term.column}`;
    if (seen.has(key)) continue;
    seen.add(key);
    findings.push({ column: term.column, role: term.role, reason });
  }
  return findings;
}

function modelTermPostTreatmentAdjustmentFindings(method: StatsMethod, opts: FeasibilityGateOptions): Array<{ column: string; role: string; reason: string }> {
  if (!modelTermIntegrityMethods().has(method)) return [];
  const terms: Array<{ column: string | null | undefined; role: string }> = [
    ...(opts.covariates ?? []).map(column => ({ column, role: "adjustment covariate" })),
    ...(opts.exactCovariates ?? []).map(column => ({ column, role: "exact-match covariate" })),
    { column: opts.runningVariable, role: "running variable" },
    { column: opts.instrument, role: "instrument" },
    { column: opts.weight, role: "weight" },
    { column: opts.offset, role: "offset" },
  ];
  const protectedTerms = new Set([opts.outcome, opts.event, opts.time, opts.start, opts.stop, opts.id, opts.cluster, opts.strata, opts.period, opts.post, opts.exposure, opts.group].filter((value): value is string => Boolean(value)));
  const seen = new Set<string>();
  const findings: Array<{ column: string; role: string; reason: string }> = [];
  for (const term of terms) {
    if (!term.column || protectedTerms.has(term.column)) continue;
    const reason = postTreatmentAdjustmentReason(term.column);
    if (!reason) continue;
    const key = `${term.role}:${term.column}`;
    if (seen.has(key)) continue;
    seen.add(key);
    findings.push({ column: term.column, role: term.role, reason });
  }
  return findings;
}

interface RegressionFeasibilitySupport {
  completeRows: number | null;
  modeledParameters: number;
  rowsPerParameter: number | null;
  minorityClassRows: number | null;
  minorityRowsPerParameter: number | null;
  terms: string[];
}

function regressionFamilyBlockers(
  method: StatsMethod | null | undefined,
  opts: FeasibilityGateOptions,
  summary: ResearchTableSummary | null,
  completeCase: FeasibilityGateResult["completeCase"],
  outcome: FeasibilityGateResult["outcomeDiagnostics"],
  outcomeColumn: FeasibilityColumn | null,
): string[] {
  if (!method || !regressionFamilyMethods().has(method)) return [];
  const blockers: string[] = [];
  const support = regressionFeasibilitySupport(method, opts, summary, completeCase, outcome);

  if (support.rowsPerParameter !== null && support.rowsPerParameter < 5) {
    blockers.push(`METHOD_PARAMETER_SUPPORT_REQUIRED: ${method} has approximately ${support.modeledParameters} modeled parameter(s) after categorical expansion and ${support.completeRows} complete-case row(s) (${round(support.rowsPerParameter, 2)} rows/parameter), below the minimum 5 rows/parameter feasibility guard.`);
  }

  for (const term of support.terms) {
    const column = columnByName(summary, term);
    const levelCount = completeCaseLevelCount(completeCase, term) ?? column?.uniqueCount ?? 0;
    if (column && levelCount > 0 && levelCount < 2) {
      blockers.push(`METHOD_REGRESSION_TERM_VARIATION_REQUIRED: ${method} requires analyzed variation in predictor '${term}', but it has ${levelCount} complete-case level(s).`);
    }
    const levels = regressionTermLevels(column, completeCase, term);
    const sparseLevel = levels.filter(level => level.count > 0).sort((a, b) => a.count - b.count)[0];
    if (column && regressionTermIsCategoricalLike(column, levels) && sparseLevel && sparseLevel.count < 2) {
      blockers.push(`METHOD_REGRESSION_LEVEL_SUPPORT_REQUIRED: ${method} predictor '${term}' has complete-case level '${sparseLevel.value}' with only ${sparseLevel.count} row(s), which cannot support a stable modeled level.`);
    }
  }

  if (method === "logistic-regression") {
    if (support.minorityRowsPerParameter !== null && support.minorityRowsPerParameter < 5) {
      blockers.push(`METHOD_LOGISTIC_EVENTS_PER_PARAMETER_REQUIRED: logistic-regression has ${round(support.minorityRowsPerParameter, 2)} minority-class row(s) per modeled parameter after categorical expansion (${support.minorityClassRows} minority-class row(s) / ${support.modeledParameters} parameter(s)); ordinary maximum-likelihood logistic inference is too fragile.`);
    }
  }

  if (method === "ordinal-logistic-regression" || method === "multinomial-logistic-regression") {
    const levels = outcomeColumn ? completeCaseLevels(completeCase, outcomeColumn.name) : [];
    const levelCount = levels.length || outcomeColumn?.uniqueCount || 0;
    if (levelCount >= 3) {
      const sparseOutcome = levels.filter(level => level.count > 0).sort((a, b) => a.count - b.count)[0];
      if (sparseOutcome && sparseOutcome.count < 3) {
        blockers.push(`METHOD_MULTICLASS_OUTCOME_SUPPORT_REQUIRED: ${method} outcome '${outcomeColumn?.name ?? "outcome"}' has complete-case class '${sparseOutcome.value}' with only ${sparseOutcome.count} row(s).`);
      }
    }
  }

  return blockers;
}

function regressionFamilyWarnings(
  method: StatsMethod | null | undefined,
  opts: FeasibilityGateOptions,
  summary: ResearchTableSummary | null,
  completeCase: FeasibilityGateResult["completeCase"],
  outcome: FeasibilityGateResult["outcomeDiagnostics"],
  outcomeColumn: FeasibilityColumn | null,
): string[] {
  if (!method || !regressionFamilyMethods().has(method)) return [];
  const warnings: string[] = [];
  const support = regressionFeasibilitySupport(method, opts, summary, completeCase, outcome);

  if (support.rowsPerParameter !== null && support.rowsPerParameter >= 5 && support.rowsPerParameter < 10) {
    warnings.push(`${method} has only ${round(support.rowsPerParameter, 2)} complete-case rows per modeled parameter after categorical expansion; simplify predictors or treat estimates as exploratory until diagnostics pass.`);
  }
  if (method === "penalized-logistic-regression" && support.minorityRowsPerParameter !== null && support.minorityRowsPerParameter < 5) {
    warnings.push(`penalized-logistic-regression has ${round(support.minorityRowsPerParameter, 2)} minority-class rows per modeled parameter; penalization helps stability but does not make sparse-event inference confirmatory.`);
  } else if (method && binaryOutcomeMethods().has(method) && support.minorityRowsPerParameter !== null && support.minorityRowsPerParameter >= 5 && support.minorityRowsPerParameter < 10) {
    warnings.push(`${method} has ${round(support.minorityRowsPerParameter, 2)} minority-class rows per modeled parameter, below the conservative 10 EPV heuristic.`);
  }
  if (method === "logistic-regression") {
    const separation = completeCaseLogisticSeparationRisk(completeCase, outcomeColumn?.name, support.terms);
    if (separation.length) {
      warnings.push(`METHOD_LOGISTIC_SEPARATION_RISK: logistic-regression has complete-case predictor level(s) that perfectly separate the binary outcome: ${separation.slice(0, 5).map(item => `${item.term}=${item.level} (${item.rowCount} rows, ${item.eventCount} events, ${item.nonEventCount} non-events)`).join("; ")}. The method runner should block ordinary maximum-likelihood estimates and recommend penalized/simplified alternatives.`);
    }
  }

  for (const term of support.terms) {
    const column = columnByName(summary, term);
    if (!column) continue;
    const levels = regressionTermLevels(column, completeCase, term);
    const levelCount = levels.length || column.uniqueCount || 0;
    const sparseLevel = levels.filter(level => level.count > 0).sort((a, b) => a.count - b.count)[0];
    if (regressionTermIsCategoricalLike(column, levels) && sparseLevel && sparseLevel.count >= 2 && sparseLevel.count < (binaryOutcomeMethods().has(method) ? 10 : 5)) {
      warnings.push(`${method} predictor '${term}' has sparse complete-case level '${sparseLevel.value}' with ${sparseLevel.count} row(s); collapse prespecified levels or keep this as a sensitivity model.`);
    }
    if (column.inferredType !== "number" && levelCount > 30) {
      warnings.push(`${method} predictor '${term}' has ${levelCount} complete-case level(s), which may over-parameterize the model or indicate an identifier-like categorical term.`);
    }
  }

  if ((method === "ordinal-logistic-regression" || method === "multinomial-logistic-regression") && outcomeColumn) {
    const levels = completeCaseLevels(completeCase, outcomeColumn.name);
    const levelCount = levels.length || outcomeColumn.uniqueCount || 0;
    if (method === "ordinal-logistic-regression" && levelCount > 12) warnings.push(`ordinal-logistic-regression outcome '${outcomeColumn.name}' has ${levelCount} levels; verify these are meaningful ordered categories rather than a near-continuous scale.`);
    const sparseOutcome = levels.filter(level => level.count > 0).sort((a, b) => a.count - b.count)[0];
    if (sparseOutcome && sparseOutcome.count >= 3 && sparseOutcome.count < Math.max(5, support.modeledParameters)) {
      warnings.push(`${method} outcome '${outcomeColumn.name}' has sparse class '${sparseOutcome.value}' with ${sparseOutcome.count} row(s); class-specific estimates may be unstable.`);
    }
  }

  return warnings;
}

function regressionFeasibilitySupport(
  method: StatsMethod,
  opts: FeasibilityGateOptions,
  summary: ResearchTableSummary | null,
  completeCase: FeasibilityGateResult["completeCase"],
  outcome: FeasibilityGateResult["outcomeDiagnostics"],
): RegressionFeasibilitySupport {
  const terms = unique([
    opts.exposure,
    opts.exposure ? null : opts.group,
    ...(opts.covariates ?? []),
  ].filter((item): item is string => Boolean(item)));
  const baseParameters = terms.reduce((sum, term) => {
    const column = columnByName(summary, term);
    if (!column) return sum + 1;
    const levels = regressionTermLevels(column, completeCase, term);
    const levelCount = levels.length || column.uniqueCount || 0;
    const termParameters = regressionTermIsCategoricalLike(column, levels)
      ? Math.max(1, levelCount - 1)
      : 1;
    return sum + termParameters;
  }, 1);
  const outcomeLevels = opts.outcome ? completeCaseLevelCount(completeCase, opts.outcome) ?? columnByName(summary, opts.outcome)?.uniqueCount ?? 0 : 0;
  const modeledParameters = method === "multinomial-logistic-regression"
    ? baseParameters * Math.max(1, outcomeLevels - 1)
    : method === "ordinal-logistic-regression"
      ? baseParameters + Math.max(1, outcomeLevels - 1)
      : baseParameters;
  const completeRows = completeCase.completeRows ?? summary?.rowCount ?? null;
  const minorityClassRows = analyticEventCount(outcome) !== null && analyticNonEventCount(outcome) !== null
    ? Math.min(analyticEventCount(outcome)!, analyticNonEventCount(outcome)!)
    : null;
  return {
    completeRows,
    modeledParameters: Math.max(1, modeledParameters),
    rowsPerParameter: completeRows !== null ? completeRows / Math.max(1, modeledParameters) : null,
    minorityClassRows,
    minorityRowsPerParameter: minorityClassRows !== null ? minorityClassRows / Math.max(1, modeledParameters) : null,
    terms,
  };
}

function regressionTermLevels(column: FeasibilityColumn | null, completeCase: FeasibilityGateResult["completeCase"], term: string): Array<{ value: string; count: number }> {
  const completeLevels = completeCaseLevels(completeCase, term);
  if (completeLevels.length) return completeLevels;
  return column ? columnValueLevels(column) : [];
}

function regressionTermIsCategoricalLike(column: FeasibilityColumn, levels: Array<{ value: string; count: number }>): boolean {
  const levelCount = levels.length || column.uniqueCount || 0;
  if (column.inferredType !== "number") return true;
  if (levelCount > 0 && levelCount <= 12) return true;
  return levels.some(level => !Number.isFinite(Number(level.value)));
}

interface LogisticSeparationRisk {
  term: string;
  level: string;
  rowCount: number;
  eventCount: number;
  nonEventCount: number;
}

function completeCaseLogisticSeparationRisk(
  completeCase: FeasibilityGateResult["completeCase"],
  outcomeName: string | null | undefined,
  terms: string[],
): LogisticSeparationRisk[] {
  if (!outcomeName) return [];
  const outcomeSupport = binaryLevelOrientation(completeCaseLevels(completeCase, outcomeName));
  if (!outcomeSupport) return [];
  const risks: LogisticSeparationRisk[] = [];
  for (const term of terms) {
    const termLevels = completeCaseLevels(completeCase, term);
    if (termLevels.length < 2 || termLevels.length > 12) continue;
    const pairs = completeCasePairValues(completeCase, outcomeName, term);
    if (!pairs.length) continue;
    const byLevel = new Map<string, { rowCount: number; eventCount: number; nonEventCount: number }>();
    for (const pair of pairs) {
      const current = byLevel.get(pair.rightValue) ?? { rowCount: 0, eventCount: 0, nonEventCount: 0 };
      current.rowCount += pair.count;
      if (normalizeBinaryLevel(pair.leftValue) === normalizeBinaryLevel(outcomeSupport.positiveLevel)) current.eventCount += pair.count;
      if (normalizeBinaryLevel(pair.leftValue) === normalizeBinaryLevel(outcomeSupport.negativeLevel)) current.nonEventCount += pair.count;
      byLevel.set(pair.rightValue, current);
    }
    for (const [level, counts] of byLevel.entries()) {
      if (counts.rowCount >= 5 && (counts.eventCount === 0 || counts.nonEventCount === 0)) {
        risks.push({ term, level, ...counts });
      }
    }
  }
  return risks;
}

function binaryLevelOrientation(levels: Array<{ value: string; count: number }>): { negativeLevel: string; positiveLevel: string } | null {
  if (levels.length !== 2) return null;
  const positive = levels.find(level => semanticBinaryLevelRole(level.value) === "positive");
  const negative = levels.find(level => semanticBinaryLevelRole(level.value) === "negative");
  if (positive && negative && normalizeBinaryLevel(positive.value) !== normalizeBinaryLevel(negative.value)) {
    return { negativeLevel: negative.value, positiveLevel: positive.value };
  }
  const numeric = [...levels].sort((a, b) => Number(a.value) - Number(b.value));
  if (numeric.every(level => Number.isFinite(Number(level.value))) && Number(numeric[0]!.value) !== Number(numeric[1]!.value)) {
    return { negativeLevel: numeric[0]!.value, positiveLevel: numeric[1]!.value };
  }
  const lexical = [...levels].sort((a, b) => String(a.value).localeCompare(String(b.value)));
  return { negativeLevel: lexical[0]!.value, positiveLevel: lexical[1]!.value };
}

function causalQuasiExperimentalBlockers(
  method: StatsMethod | null | undefined,
  opts: FeasibilityGateOptions,
  summary: ResearchTableSummary | null,
  completeCase: FeasibilityGateResult["completeCase"],
  outcomeColumn: FeasibilityColumn | null,
  exposureColumn: FeasibilityColumn | null,
  timeColumn: FeasibilityColumn | null,
): string[] {
  if (!method) return [];
  const blockers: string[] = [];
  const outcomeLevelCount = completeCaseLevelCount(completeCase, outcomeColumn?.name) ?? outcomeColumn?.uniqueCount ?? 0;
  const exposureName = opts.exposure ?? opts.group ?? null;
  const exposureLevels = completeCaseLevels(completeCase, exposureName);
  const exposureLevelCount = exposureLevels.length || exposureColumn?.uniqueCount || 0;
  const postLevels = completeCaseLevels(completeCase, opts.post ?? null);
  const periodLevels = completeCaseLevels(completeCase, opts.period ?? null);

  const requireNumericOutcome = (): void => {
    if (!outcomeColumn && summary) blockers.push(`METHOD_NUMERIC_OUTCOME_REQUIRED: ${method} requires an observed numeric outcome variable.`);
    else if (outcomeColumn && outcomeColumn.inferredType !== "number") blockers.push(`METHOD_NUMERIC_OUTCOME_REQUIRED: ${method} requires a numeric outcome, but '${outcomeColumn.name}' was inferred as ${outcomeColumn.inferredType}.`);
    else if (outcomeColumn && outcomeLevelCount < 2) blockers.push(`METHOD_OUTCOME_VARIATION_REQUIRED: ${method} requires analyzed outcome variation, but '${outcomeColumn.name}' has ${outcomeLevelCount} complete-case value(s).`);
  };

  if (method === "difference-in-differences" || method === "event-study-did" || method === "interrupted-time-series" || method === "regression-discontinuity") {
    requireNumericOutcome();
  }

  if (method === "difference-in-differences" || method === "event-study-did" || method === "target-trial-emulation-spec" || method === "unmeasured-confounding-sensitivity") {
    if (!exposureColumn && summary) blockers.push(`METHOD_BINARY_TREATMENT_REQUIRED: ${method} requires an observed binary treatment/exposure variable.`);
    else if (exposureColumn && !binaryTreatmentSupported(completeCase, exposureColumn.name, opts.exposureThreshold)) blockers.push(`METHOD_BINARY_TREATMENT_REQUIRED: ${method} requires a binary analyzed treatment/exposure or a threshold that creates both treated and control rows, but '${exposureColumn.name}' has ${exposureLevelCount} complete-case level(s).`);
  }

  if (method === "difference-in-differences") {
    const postSupport = temporalBinarySupport(postLevels);
    if (!postSupport.supported) blockers.push(`METHOD_POST_INDICATOR_REQUIRED: difference-in-differences requires an analyzed binary pre/post indicator with recognizable orientation, but '${opts.post ?? "post"}' has levels ${postLevels.map(level => level.value).join(", ") || "(none)"}.`);
    if (exposureName && postSupport.supported) {
      const cellSupport = completeCaseTwoWayCellSupport(completeCase, exposureName, opts.post!, exposureLevels.map(level => level.value), postLevels.map(level => level.value));
      if (cellSupport && cellSupport.missingCells > 0) blockers.push(`METHOD_DID_CELL_SUPPORT_REQUIRED: difference-in-differences requires complete treatment-by-period support, but ${cellSupport.missingCells}/4 analyzed cell(s) are empty.`);
    }
  }

  if (method === "event-study-did") {
    if (periodLevels.length < 2) blockers.push(`METHOD_EVENT_STUDY_PERIOD_SUPPORT_REQUIRED: event-study-did requires at least two analyzed period/event-time levels, but '${opts.period ?? "period"}' has ${periodLevels.length}.`);
    if (exposureName && periodLevels.length >= 2) {
      const cellSupport = completeCaseTwoWayCellSupport(completeCase, exposureName, opts.period!, exposureLevels.map(level => level.value), periodLevels.map(level => level.value));
      if (cellSupport && cellSupport.missingCells > 0) blockers.push(`METHOD_EVENT_STUDY_CELL_SUPPORT_REQUIRED: event-study-did requires treated and control support in each analyzed period, but ${cellSupport.missingCells}/${cellSupport.totalCells} treatment-period cell(s) are empty.`);
    }
  }

  if (method === "interrupted-time-series") {
    if (timeColumn && timeColumn.inferredType !== "number") blockers.push(`METHOD_NUMERIC_TIME_REQUIRED: interrupted-time-series requires numeric time/order, but '${timeColumn.name}' was inferred as ${timeColumn.inferredType}.`);
    const postSupport = temporalBinarySupport(postLevels);
    if (!postSupport.supported) blockers.push(`METHOD_POST_INDICATOR_REQUIRED: interrupted-time-series requires an analyzed binary pre/post intervention indicator with recognizable orientation, but '${opts.post ?? "post"}' has levels ${postLevels.map(level => level.value).join(", ") || "(none)"}.`);
    if (opts.time && opts.post && postSupport.supported) {
      const segmentSupport = completeCaseTimeByTemporalSegmentSupport(completeCase, opts.time, opts.post, postSupport);
      if (segmentSupport && (segmentSupport.preUniqueTimePoints < 2 || segmentSupport.postUniqueTimePoints < 2)) blockers.push(`METHOD_ITS_SEGMENT_TIME_SUPPORT_REQUIRED: interrupted-time-series requires at least two analyzed time points before and after intervention; observed pre=${segmentSupport.preUniqueTimePoints}, post=${segmentSupport.postUniqueTimePoints}.`);
    }
  }

  if (method === "regression-discontinuity") {
    if (opts.runningVariable) {
      const runningColumn = columnByName(summary, opts.runningVariable);
      if (runningColumn && runningColumn.inferredType !== "number") blockers.push(`METHOD_RUNNING_VARIABLE_NUMERIC_REQUIRED: regression-discontinuity requires a numeric running variable, but '${runningColumn.name}' was inferred as ${runningColumn.inferredType}.`);
      if (typeof opts.cutoff === "number" && Number.isFinite(opts.cutoff)) {
        const support = completeCaseThresholdSupport(completeCase, opts.runningVariable, opts.cutoff);
        if (support && (support.negativeRows < 5 || support.positiveRows < 5)) blockers.push(`METHOD_RDD_CUTOFF_SUPPORT_REQUIRED: regression-discontinuity cutoff ${opts.cutoff} requires at least five complete-case rows on each side for the local route; observed below=${support.negativeRows}, at/above=${support.positiveRows}.`);
      }
    }
  }

  if (method === "instrumental-variables-2sls") {
    requireNumericOutcome();
    if (!exposureColumn && summary) blockers.push("METHOD_IV_EXPOSURE_REQUIRED: instrumental-variables-2sls requires an observed numeric exposure/treatment variable.");
    else if (exposureColumn && exposureColumn.inferredType !== "number") blockers.push(`METHOD_IV_EXPOSURE_NUMERIC_REQUIRED: instrumental-variables-2sls requires a numeric exposure/treatment, but '${exposureColumn.name}' was inferred as ${exposureColumn.inferredType}.`);
    else if (exposureColumn && exposureLevelCount < 2) blockers.push(`METHOD_IV_EXPOSURE_VARIATION_REQUIRED: instrumental-variables-2sls requires analyzed exposure variation, but '${exposureColumn.name}' has ${exposureLevelCount} complete-case value(s).`);
    const instrumentColumn = columnByName(summary, opts.instrument ?? null);
    const instrumentLevelCount = completeCaseLevelCount(completeCase, instrumentColumn?.name) ?? instrumentColumn?.uniqueCount ?? 0;
    if (!instrumentColumn && summary) blockers.push("METHOD_INSTRUMENT_REQUIRED: instrumental-variables-2sls requires an observed instrument variable.");
    else if (instrumentColumn && instrumentLevelCount < 2) blockers.push(`METHOD_INSTRUMENT_VARIATION_REQUIRED: instrumental-variables-2sls requires analyzed instrument variation, but '${instrumentColumn.name}' has ${instrumentLevelCount} complete-case level(s).`);
  }

  if (method === "unmeasured-confounding-sensitivity" && outcomeColumn) {
    const levels = completeCaseLevels(completeCase, outcomeColumn.name);
    if (levels.length > 0 && !binaryCounts(levels)) blockers.push(`METHOD_BINARY_OUTCOME_REQUIRED: unmeasured-confounding-sensitivity requires a binary analyzed outcome/event, but '${outcomeColumn.name}' has ${levels.length} complete-case level(s).`);
  }

  return blockers;
}

function missingnessMethodBlockers(
  method: StatsMethod | null | undefined,
  opts: FeasibilityGateOptions,
  summary: ResearchTableSummary | null,
  requestedVariables: string[],
): string[] {
  if (!method || !missingnessMethods().has(method)) return [];
  const blockers: string[] = [];
  const target = opts.outcome ?? requestedVariables[0] ?? null;
  const selectedVariables = unique([
    target,
    ...requestedVariables,
    ...(opts.covariates ?? []),
  ].filter((item): item is string => Boolean(item)));
  const selectedColumns = selectedVariables
    .map(variable => columnByName(summary, variable))
    .filter((column): column is FeasibilityColumn => column !== null);

  if ((method === "missingness-summary" || method === "multiple-imputation-mice") && requestedVariables.length === 0) {
    blockers.push(`METHOD_VARIABLES_REQUIRED: ${method} requires at least one selected variable for missingness review.`);
  }

  if (method === "multiple-imputation-mice") {
    const numericUsable = selectedColumns.filter(column => column.inferredType === "number" && column.nonMissingRows > 0);
    const numericWithMissingness = numericUsable.filter(column => column.missingFraction > 0);
    if (summary && numericUsable.length === 0) blockers.push("METHOD_IMPUTATION_NUMERIC_VARIABLES_REQUIRED: multiple-imputation-mice is numeric-only and no selected variable has observed numeric values.");
    else if (numericUsable.length > 0 && numericWithMissingness.length === 0) blockers.push("METHOD_IMPUTATION_MISSINGNESS_REQUIRED: multiple-imputation-mice requires at least one usable numeric selected variable with observed missingness.");
  }

  if (method === "missingness-ipw") {
    const targetColumn = columnByName(summary, target);
    if (!target && summary) blockers.push("METHOD_MISSINGNESS_TARGET_REQUIRED: missingness-ipw requires an outcome or selected target variable.");
    else if (targetColumn && targetColumn.missingFraction >= 0.95) blockers.push(`METHOD_MISSINGNESS_TARGET_SUPPORT_REQUIRED: missingness-ipw cannot estimate stable observation weights because '${targetColumn.name}' is ${(targetColumn.missingFraction * 100).toFixed(1)}% missing.`);
  }

  if (method === "complete-case-sensitivity" || method === "mnar-sensitivity") {
    const targetColumn = columnByName(summary, target);
    if (!target && summary) blockers.push(`METHOD_MISSINGNESS_TARGET_REQUIRED: ${method} requires an outcome or selected target variable.`);
    else if (targetColumn && targetColumn.inferredType !== "number") blockers.push(`METHOD_NUMERIC_OUTCOME_REQUIRED: ${method} requires a numeric target/outcome, but '${targetColumn.name}' was inferred as ${targetColumn.inferredType}.`);
    else if (targetColumn && targetColumn.nonMissingRows === 0) blockers.push(`METHOD_OBSERVED_TARGET_REQUIRED: ${method} requires at least one observed target/outcome value, but '${targetColumn.name}' is fully missing.`);
    const anySelectedMissingness = selectedColumns.some(column => column.missingFraction > 0);
    if (summary && selectedColumns.length > 0 && !anySelectedMissingness) blockers.push(`METHOD_MISSINGNESS_SENSITIVITY_REQUIRED: ${method} requires missingness in the target or selected analysis variables, but none was detected.`);
    if (method === "mnar-sensitivity" && targetColumn) {
      if (targetColumn.missingFraction === 0) blockers.push(`METHOD_MNAR_TARGET_MISSINGNESS_REQUIRED: mnar-sensitivity requires missing target/outcome values, but '${targetColumn.name}' has none.`);
      else if (targetColumn.missingFraction >= 0.95) blockers.push(`METHOD_MNAR_TARGET_SUPPORT_REQUIRED: mnar-sensitivity requires enough observed target/outcome values to anchor scenarios, but '${targetColumn.name}' is ${(targetColumn.missingFraction * 100).toFixed(1)}% missing.`);
    }
  }

  return blockers;
}

function predictionEvaluationBlockers(
  method: StatsMethod | null | undefined,
  opts: FeasibilityGateOptions,
  summary: ResearchTableSummary | null,
  completeCase: FeasibilityGateResult["completeCase"],
  outcomeColumn: FeasibilityColumn | null,
  scoreColumn: FeasibilityColumn | null,
  outcome: FeasibilityGateResult["outcomeDiagnostics"],
): string[] {
  if (method !== "prediction-evaluation") return [];
  const blockers: string[] = [];
  if (!outcomeColumn && summary) blockers.push("METHOD_BINARY_OUTCOME_REQUIRED: prediction-evaluation requires an observed binary outcome variable.");
  else if (outcomeColumn && outcome.analysisBinarySupported === false) blockers.push(`METHOD_BINARY_OUTCOME_REQUIRED: prediction-evaluation requires a binary analyzed outcome, but '${outcomeColumn.name}' has ${outcome.analysisObservedLevelCount ?? outcome.observedLevelCount ?? "unknown"} analyzed level(s).`);
  else if (outcomeColumn && outcome.analysisBinarySupported === null && !columnIsBinaryLike(outcomeColumn, outcome.observedLevels)) blockers.push(`METHOD_BINARY_OUTCOME_REQUIRED: prediction-evaluation requires a binary analyzed outcome, but '${outcomeColumn.name}' appears ${columnShapeLabel(outcomeColumn)}.`);

  if (!scoreColumn && summary) blockers.push("METHOD_PREDICTION_SCORE_REQUIRED: prediction-evaluation requires an observed model score, risk score, or predicted-probability exposure variable.");
  else if (scoreColumn && scoreColumn.inferredType !== "number") blockers.push(`METHOD_PREDICTION_SCORE_REQUIRED: prediction-evaluation requires a numeric score, but '${scoreColumn.name}' was inferred as ${scoreColumn.inferredType}.`);
  else if (scoreColumn) {
    const scoreShape = completeCaseNumericSummary(completeCase, scoreColumn.name);
    if (scoreShape && scoreShape.n < 10) blockers.push(`METHOD_PREDICTION_SCORE_SUPPORT_REQUIRED: prediction-evaluation requires at least 10 analyzed score/outcome rows, but '${scoreColumn.name}' has ${scoreShape.n}.`);
  }

  if (!opts.exposure && !opts.group && summary) blockers.push("METHOD_PREDICTION_SCORE_REQUIRED: prediction-evaluation requires --exposure or --group to identify the score column.");
  return blockers;
}

function measurementAndExplorationBlockers(
  method: StatsMethod | null | undefined,
  requestedVariables: string[],
  summary: ResearchTableSummary | null,
  completeCase: FeasibilityGateResult["completeCase"],
  opts: FeasibilityGateOptions,
): string[] {
  if (!method) return [];
  const blockers: string[] = [];
  const requireVariables = (count: number): boolean => {
    if (requestedVariables.length >= count) return true;
    blockers.push(`METHOD_VARIABLES_REQUIRED: ${method} requires at least ${count} variable(s), but ${requestedVariables.length} were supplied.`);
    return false;
  };
  const requireDistinct = (variables: string[]): void => {
    const duplicates = duplicatedValues(variables);
    if (duplicates.length) blockers.push(`METHOD_VARIABLES_DISTINCT_REQUIRED: ${method} requires distinct variable names, but duplicate variable(s) were supplied: ${duplicates.join(", ")}.`);
  };
  const numericVariables = (variables: string[]): number => {
    let varyingNumericCount = 0;
    for (const variable of variables) {
      const column = columnByName(summary, variable);
      if (!column) continue;
      if (column.inferredType !== "number") {
        blockers.push(`METHOD_NUMERIC_VARIABLE_REQUIRED: ${method} requires numeric variable '${column.name}', but it was inferred as ${column.inferredType}.`);
        continue;
      }
      const levelCount = completeCaseLevelCount(completeCase, column.name) ?? column.uniqueCount ?? 0;
      if (levelCount < 2) blockers.push(`METHOD_NUMERIC_VARIATION_REQUIRED: ${method} requires analyzed variation in '${column.name}', but it has ${levelCount} complete-case value(s).`);
      else varyingNumericCount += 1;
    }
    return varyingNumericCount;
  };

  if (method === "reliability-kappa") {
    if (requireVariables(2)) {
      const raters = requestedVariables.slice(0, 2);
      requireDistinct(raters);
      for (const variable of raters) {
        const column = columnByName(summary, variable);
        const levelCount = completeCaseLevelCount(completeCase, variable) ?? column?.uniqueCount ?? 0;
        if (column && levelCount < 2) blockers.push(`METHOD_KAPPA_RATER_LEVELS_REQUIRED: reliability-kappa requires each rater/classifier to have at least two analyzed levels, but '${column.name}' has ${levelCount}.`);
      }
    }
  }

  if (method === "intraclass-correlation" || method === "cronbach-alpha" || method === "pca" || method === "clustering-validation" || method === "bland-altman") {
    const requiredCount = method === "bland-altman" ? 2 : 2;
    if (requireVariables(requiredCount)) {
      const variables = method === "bland-altman" ? requestedVariables.slice(0, 2) : requestedVariables;
      requireDistinct(variables);
      const varyingNumericCount = numericVariables(variables);
      if ((method === "intraclass-correlation" || method === "cronbach-alpha" || method === "pca" || method === "clustering-validation") && varyingNumericCount < 2) {
        blockers.push(`METHOD_NUMERIC_VARIABLE_COUNT_REQUIRED: ${method} requires at least two usable varying numeric variables, but ${varyingNumericCount} were verified.`);
      }
    }
  }

  if (method === "multiple-comparison-correction") {
    if (requireVariables(1)) {
      const variable = requestedVariables[0]!;
      const column = columnByName(summary, variable);
      const analyzed = completeCaseNumericSummary(completeCase, variable);
      if (column && column.inferredType !== "number") blockers.push(`METHOD_PVALUE_VARIABLE_REQUIRED: multiple-comparison-correction requires a numeric p-value column, but '${column.name}' was inferred as ${column.inferredType}.`);
      if (column && typeof (analyzed?.min ?? column.min) === "number" && (analyzed?.min ?? column.min ?? 0) < 0) blockers.push(`METHOD_PVALUE_DOMAIN_REQUIRED: multiple-comparison-correction requires p-values in [0, 1], but '${column.name}' has complete-case minimum ${analyzed?.min ?? column.min}.`);
      if (column && typeof (analyzed?.max ?? column.max) === "number" && (analyzed?.max ?? column.max ?? 1) > 1) blockers.push(`METHOD_PVALUE_DOMAIN_REQUIRED: multiple-comparison-correction requires p-values in [0, 1], but '${column.name}' has complete-case maximum ${analyzed?.max ?? column.max}.`);
    }
  }

  if (method === "power-sample-size") {
    const effect = Number(opts.outcomeThreshold ?? 0.5);
    const targetPower = Number(opts.exposureThreshold ?? 0.8);
    if (!Number.isFinite(effect) || effect <= 0) blockers.push(`METHOD_POWER_EFFECT_SIZE_REQUIRED: power-sample-size requires a positive effect size, but received ${opts.outcomeThreshold ?? 0.5}.`);
    if (!Number.isFinite(targetPower) || targetPower <= 0 || targetPower >= 1) blockers.push(`METHOD_POWER_TARGET_REQUIRED: power-sample-size requires target power between 0 and 1, but received ${opts.exposureThreshold ?? 0.8}.`);
  }

  return blockers;
}

function completeCaseLevelCount(completeCase: FeasibilityGateResult["completeCase"], variableName: string | null | undefined): number | null {
  const levels = completeCaseLevels(completeCase, variableName);
  return levels.length ? levels.length : null;
}

function completeCaseLevels(completeCase: FeasibilityGateResult["completeCase"], variableName: string | null | undefined): Array<{ value: string; count: number }> {
  if (!variableName) return [];
  const counts = completeCase.completeValueCounts[variableName];
  if (!counts) return [];
  return Object.entries(counts)
    .filter(([, count]) => count > 0)
    .map(([value, count]) => ({ value, count }))
    .sort((a, b) => b.count - a.count);
}

interface CompleteCaseBinaryArmSupport {
  treatedRows: number;
  controlRows: number;
  minArmRows: number;
  source: string;
}

interface CompleteCaseGroupSupport {
  minGroupValue: string;
  minGroupRows: number;
  groupCount: number;
}

interface CompleteCaseBinaryOutcomeByExposureSupport {
  minCellRows: number;
  minCellLabel: string;
  zeroCells: string[];
}

interface CompleteCaseSurvivalGroupEventSupport {
  groupLevelCount: number;
  minGroupEvents: number | null;
  zeroEventGroups: string[];
  sparseEventGroups: string[];
}

function completeCaseBinaryArmSupport(completeCase: FeasibilityGateResult["completeCase"], variableName: string | null | undefined, threshold: number | null | undefined): CompleteCaseBinaryArmSupport | null {
  if (!variableName) return null;
  if (typeof threshold === "number" && Number.isFinite(threshold)) {
    const support = completeCaseThresholdSupport(completeCase, variableName, threshold);
    if (!support || support.numericRows === 0 || support.negativeRows === 0 || support.positiveRows === 0) return null;
    return {
      treatedRows: support.positiveRows,
      controlRows: support.negativeRows,
      minArmRows: Math.min(support.positiveRows, support.negativeRows),
      source: `${variableName} threshold ${threshold}`,
    };
  }
  const counts = binaryCounts(completeCaseLevels(completeCase, variableName));
  if (!counts) return null;
  return {
    treatedRows: counts.eventCount,
    controlRows: counts.nonEventCount,
    minArmRows: Math.min(counts.eventCount, counts.nonEventCount),
    source: `${variableName} binary complete-case levels`,
  };
}

function completeCaseGroupSupport(completeCase: FeasibilityGateResult["completeCase"], variableName: string): CompleteCaseGroupSupport | null {
  const levels = completeCaseLevels(completeCase, variableName);
  if (levels.length < 2) return null;
  const sorted = [...levels].sort((a, b) => a.count - b.count);
  const min = sorted[0];
  if (!min) return null;
  return {
    minGroupValue: min.value,
    minGroupRows: min.count,
    groupCount: levels.length,
  };
}

function completeCaseBinaryOutcomeByExposureSupport(
  completeCase: FeasibilityGateResult["completeCase"],
  outcomeName: string | null | undefined,
  exposureName: string | null | undefined,
  exposureThreshold: number | null | undefined,
): CompleteCaseBinaryOutcomeByExposureSupport | null {
  if (!outcomeName || !exposureName) return null;
  const outcomeOrientation = binaryLevelOrientation(completeCaseLevels(completeCase, outcomeName));
  if (!outcomeOrientation) return null;
  const exposureOrientation = typeof exposureThreshold === "number" && Number.isFinite(exposureThreshold)
    ? null
    : binaryLevelOrientation(completeCaseLevels(completeCase, exposureName));
  if (!exposureOrientation && (typeof exposureThreshold !== "number" || !Number.isFinite(exposureThreshold))) return null;
  const pairs = completeCasePairValues(completeCase, outcomeName, exposureName);
  if (!pairs.length) return null;
  const cellCounts = new Map<string, number>();
  const exposureCellLabels = typeof exposureThreshold === "number" && Number.isFinite(exposureThreshold)
    ? ["control", "treated"] as const
    : ["control", "treated"] as const;
  const outcomeCellLabels = ["non-event", "event"] as const;
  for (const exposureLabel of exposureCellLabels) {
    for (const outcomeLabel of outcomeCellLabels) cellCounts.set(`${exposureLabel}/${outcomeLabel}`, 0);
  }
  for (const pair of pairs) {
    const outcomeRole = normalizeBinaryLevel(pair.leftValue) === normalizeBinaryLevel(outcomeOrientation.positiveLevel)
      ? "event"
      : normalizeBinaryLevel(pair.leftValue) === normalizeBinaryLevel(outcomeOrientation.negativeLevel)
        ? "non-event"
        : null;
    if (!outcomeRole) continue;
    const exposureRole = exposureThresholdRole(pair.rightValue, exposureThreshold, exposureOrientation);
    if (!exposureRole) continue;
    const key = `${exposureRole}/${outcomeRole}`;
    cellCounts.set(key, (cellCounts.get(key) ?? 0) + pair.count);
  }
  const cells = [...cellCounts.entries()];
  if (!cells.length) return null;
  const sorted = [...cells].sort((a, b) => a[1] - b[1]);
  const min = sorted[0];
  if (!min) return null;
  return {
    minCellLabel: min[0],
    minCellRows: min[1],
    zeroCells: cells.filter(([, count]) => count === 0).map(([label]) => label),
  };
}

function exposureThresholdRole(value: string, threshold: number | null | undefined, orientation: { negativeLevel: string; positiveLevel: string } | null): "control" | "treated" | null {
  if (typeof threshold === "number" && Number.isFinite(threshold)) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return null;
    return numeric >= threshold ? "treated" : "control";
  }
  if (!orientation) return null;
  if (normalizeBinaryLevel(value) === normalizeBinaryLevel(orientation.positiveLevel)) return "treated";
  if (normalizeBinaryLevel(value) === normalizeBinaryLevel(orientation.negativeLevel)) return "control";
  return null;
}

function completeCaseSurvivalGroupEventSupport(
  completeCase: FeasibilityGateResult["completeCase"],
  eventName: string | null | undefined,
  groupName: string | null | undefined,
): CompleteCaseSurvivalGroupEventSupport | null {
  if (!eventName || !groupName) return null;
  const eventOrientation = binaryLevelOrientation(completeCaseLevels(completeCase, eventName));
  if (!eventOrientation) return null;
  const groups = completeCaseLevels(completeCase, groupName).map(level => level.value);
  if (groups.length < 2) return null;
  const pairs = completeCasePairValues(completeCase, eventName, groupName);
  if (!pairs.length) return null;
  const eventCounts = new Map<string, number>();
  for (const group of groups) eventCounts.set(group, 0);
  for (const pair of pairs) {
    if (normalizeBinaryLevel(pair.leftValue) !== normalizeBinaryLevel(eventOrientation.positiveLevel)) continue;
    if (!eventCounts.has(pair.rightValue)) continue;
    eventCounts.set(pair.rightValue, (eventCounts.get(pair.rightValue) ?? 0) + pair.count);
  }
  const counts = groups.map(group => eventCounts.get(group) ?? 0);
  return {
    groupLevelCount: groups.length,
    minGroupEvents: counts.length ? Math.min(...counts) : null,
    zeroEventGroups: groups.filter(group => (eventCounts.get(group) ?? 0) === 0),
    sparseEventGroups: groups.filter(group => {
      const count = eventCounts.get(group) ?? 0;
      return count > 0 && count < 5;
    }).map(group => `${group} (${eventCounts.get(group) ?? 0})`),
  };
}

interface ThresholdSupport {
  numericRows: number;
  negativeRows: number;
  positiveRows: number;
  nonNumericRows: number;
}

interface TemporalBinarySupport {
  supported: boolean;
  negativeLevel: string | null;
  positiveLevel: string | null;
}

function binaryTreatmentSupported(completeCase: FeasibilityGateResult["completeCase"], variableName: string, threshold: number | null | undefined): boolean {
  if (typeof threshold === "number" && Number.isFinite(threshold)) {
    const support = completeCaseThresholdSupport(completeCase, variableName, threshold);
    return Boolean(support && support.negativeRows > 0 && support.positiveRows > 0);
  }
  const levels = completeCaseLevels(completeCase, variableName);
  return Boolean(levels.length && binaryCounts(levels));
}

function completeCaseThresholdSupport(completeCase: FeasibilityGateResult["completeCase"], variableName: string | null | undefined, threshold: number): ThresholdSupport | null {
  const levels = completeCaseLevels(completeCase, variableName);
  if (!levels.length) return null;
  let numericRows = 0;
  let negativeRows = 0;
  let positiveRows = 0;
  let nonNumericRows = 0;
  for (const level of levels) {
    const value = Number(level.value);
    if (!Number.isFinite(value)) {
      nonNumericRows += level.count;
      continue;
    }
    numericRows += level.count;
    if (value >= threshold) positiveRows += level.count;
    else negativeRows += level.count;
  }
  return { numericRows, negativeRows, positiveRows, nonNumericRows };
}

function temporalBinarySupport(levels: Array<{ value: string; count: number }>): TemporalBinarySupport {
  if (levels.length !== 2) return { supported: false, negativeLevel: null, positiveLevel: null };
  const negative = levels.find(level => temporalBinaryRole(level.value) === "negative");
  const positive = levels.find(level => temporalBinaryRole(level.value) === "positive");
  if (negative && positive && normalizeBinaryLevel(negative.value) !== normalizeBinaryLevel(positive.value)) return { supported: true, negativeLevel: negative.value, positiveLevel: positive.value };
  const numeric = [...levels].sort((a, b) => Number(a.value) - Number(b.value));
  if (numeric.every(level => Number.isFinite(Number(level.value))) && Number(numeric[0]!.value) !== Number(numeric[1]!.value)) return { supported: true, negativeLevel: numeric[0]!.value, positiveLevel: numeric[1]!.value };
  return { supported: false, negativeLevel: null, positiveLevel: null };
}

function temporalBinaryRole(value: string): "negative" | "positive" | null {
  const normalized = normalizeBinaryLevel(value);
  const negative = new Set(["0", "false", "f", "no", "n", "pre", "before", "baseline", "prior", "pre intervention", "preintervention", "control period"]);
  const positive = new Set(["1", "true", "t", "yes", "y", "post", "after", "followup", "follow up", "intervention", "post intervention", "postintervention", "treatment period"]);
  if (negative.has(normalized)) return "negative";
  if (positive.has(normalized)) return "positive";
  return null;
}

function completeCaseTwoWayCellSupport(
  completeCase: FeasibilityGateResult["completeCase"],
  left: string,
  right: string,
  leftLevels: string[],
  rightLevels: string[],
): { totalCells: number; missingCells: number; minCellCount: number } | null {
  if (leftLevels.length < 2 || rightLevels.length < 2) return null;
  const pairs = completeCasePairValues(completeCase, left, right);
  if (!pairs.length) return null;
  let missingCells = 0;
  let minCellCount = Number.POSITIVE_INFINITY;
  for (const leftLevel of leftLevels) {
    for (const rightLevel of rightLevels) {
      const count = pairs
        .filter(pair => String(pair.leftValue) === String(leftLevel) && String(pair.rightValue) === String(rightLevel))
        .reduce((sum, pair) => sum + pair.count, 0);
      if (count <= 0) missingCells += 1;
      minCellCount = Math.min(minCellCount, count);
    }
  }
  const totalCells = leftLevels.length * rightLevels.length;
  return { totalCells, missingCells, minCellCount: Number.isFinite(minCellCount) ? minCellCount : 0 };
}

function completeCaseTimeByTemporalSegmentSupport(
  completeCase: FeasibilityGateResult["completeCase"],
  time: string,
  post: string,
  support: TemporalBinarySupport,
): { preUniqueTimePoints: number; postUniqueTimePoints: number } | null {
  if (!support.negativeLevel || !support.positiveLevel) return null;
  const pairs = completeCasePairValues(completeCase, time, post);
  if (!pairs.length) return null;
  const pre = new Set<string>();
  const after = new Set<string>();
  for (const pair of pairs) {
    const numericTime = Number(pair.leftValue);
    if (!Number.isFinite(numericTime)) continue;
    if (String(pair.rightValue) === String(support.negativeLevel)) pre.add(String(pair.leftValue));
    if (String(pair.rightValue) === String(support.positiveLevel)) after.add(String(pair.leftValue));
  }
  return { preUniqueTimePoints: pre.size, postUniqueTimePoints: after.size };
}

interface CompleteCaseNumericSummary {
  n: number;
  min: number;
  max: number;
  uniqueCount: number;
  nonIntegerCount: number;
  zeroCount: number;
  negativeCount: number;
  positiveCount: number;
}

function completeCaseNumericSummary(completeCase: FeasibilityGateResult["completeCase"], variableName: string | null | undefined): CompleteCaseNumericSummary | null {
  if (!variableName) return null;
  const counts = completeCase.completeValueCounts[variableName];
  if (!counts) return null;
  let n = 0;
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;
  let uniqueCount = 0;
  let nonIntegerCount = 0;
  let zeroCount = 0;
  let negativeCount = 0;
  let positiveCount = 0;
  for (const [rawValue, count] of Object.entries(counts)) {
    if (count <= 0) continue;
    const value = Number(rawValue);
    if (!Number.isFinite(value)) continue;
    n += count;
    uniqueCount += 1;
    min = Math.min(min, value);
    max = Math.max(max, value);
    if (!Number.isInteger(value)) nonIntegerCount += count;
    if (value === 0) zeroCount += count;
    else if (value < 0) negativeCount += count;
    else positiveCount += count;
  }
  if (n === 0) return null;
  return { n, min, max, uniqueCount, nonIntegerCount, zeroCount, negativeCount, positiveCount };
}

interface CompleteCasePairValue {
  leftValue: string;
  rightValue: string;
  count: number;
}

interface CompleteCasePairedDifferenceSummary {
  pairedCount: number;
  uniqueDifferenceCount: number;
  nonzeroDifferenceCount: number;
  discordantCount: number;
}

interface CompleteCaseClusterSupport {
  clusterCount: number;
  completeRows: number;
  minRowsPerCluster: number;
  maxRowsPerCluster: number;
  averageRowsPerCluster: number;
  singletonClusters: number;
}

function completeCasePairValues(completeCase: FeasibilityGateResult["completeCase"], left: string, right: string): CompleteCasePairValue[] {
  const direct = completeCase.completePairCounts?.[pairKey(left, right)];
  if (direct) return flattenPairCounts(direct.counts, false);
  const reverse = completeCase.completePairCounts?.[pairKey(right, left)];
  if (reverse) return flattenPairCounts(reverse.counts, true);
  return [];
}

function flattenPairCounts(counts: Record<string, Record<string, number>>, swap: boolean): CompleteCasePairValue[] {
  const rows: CompleteCasePairValue[] = [];
  for (const [rowValue, columnCounts] of Object.entries(counts)) {
    for (const [columnValue, count] of Object.entries(columnCounts)) {
      if (count <= 0) continue;
      rows.push(swap
        ? { leftValue: columnValue, rightValue: rowValue, count }
        : { leftValue: rowValue, rightValue: columnValue, count });
    }
  }
  return rows;
}

function completeCasePairedDifferenceSummary(completeCase: FeasibilityGateResult["completeCase"], left: string, right: string): CompleteCasePairedDifferenceSummary | null {
  const pairs = completeCasePairValues(completeCase, left, right);
  if (!pairs.length) return null;
  let pairedCount = 0;
  let nonzeroDifferenceCount = 0;
  let discordantCount = 0;
  const differences = new Set<string>();
  for (const pair of pairs) {
    pairedCount += pair.count;
    const leftNumeric = Number(pair.leftValue);
    const rightNumeric = Number(pair.rightValue);
    if (!Number.isFinite(leftNumeric) || !Number.isFinite(rightNumeric)) {
      if (normalizeBinaryLevel(pair.leftValue) !== normalizeBinaryLevel(pair.rightValue)) discordantCount += pair.count;
      continue;
    }
    const difference = rightNumeric - leftNumeric;
    const roundedDifference = String(round(difference, 12));
    differences.add(roundedDifference);
    if (difference !== 0) nonzeroDifferenceCount += pair.count;
    if (difference !== 0 || normalizeBinaryLevel(pair.leftValue) !== normalizeBinaryLevel(pair.rightValue)) discordantCount += pair.count;
  }
  if (pairedCount === 0) return null;
  return { pairedCount, uniqueDifferenceCount: differences.size, nonzeroDifferenceCount, discordantCount };
}

function completeCaseClusterSupport(completeCase: FeasibilityGateResult["completeCase"], cluster: string): CompleteCaseClusterSupport | null {
  const levels = completeCaseLevels(completeCase, cluster).filter(level => level.count > 0);
  if (!levels.length) return null;
  const counts = levels.map(level => level.count);
  const completeRows = counts.reduce((sum, count) => sum + count, 0);
  const clusterCount = counts.length;
  return {
    clusterCount,
    completeRows,
    minRowsPerCluster: Math.min(...counts),
    maxRowsPerCluster: Math.max(...counts),
    averageRowsPerCluster: completeRows / Math.max(clusterCount, 1),
    singletonClusters: counts.filter(count => count < 2).length,
  };
}

function completeCaseWideRepeatedVariationSummary(completeCase: FeasibilityGateResult["completeCase"], variables: string[]): { pairCount: number; nonzeroDifferencePairs: number; discordantPairCount: number } | null {
  let pairCount = 0;
  let nonzeroDifferencePairs = 0;
  let discordantPairCount = 0;
  for (let i = 0; i < variables.length; i += 1) {
    for (let j = i + 1; j < variables.length; j += 1) {
      const left = variables[i]!;
      const right = variables[j]!;
      const summary = completeCasePairedDifferenceSummary(completeCase, left, right);
      if (!summary) continue;
      pairCount += 1;
      if (summary.nonzeroDifferenceCount > 0) nonzeroDifferencePairs += 1;
      discordantPairCount += summary.discordantCount;
    }
  }
  return pairCount ? { pairCount, nonzeroDifferencePairs, discordantPairCount } : null;
}

function completeCaseLongRepeatedSupport(completeCase: FeasibilityGateResult["completeCase"], cluster: string, exposure: string, outcome: string): { clustersWithRepeatedExposure: number; clustersWithOutcomeVariation: number } | null {
  const exposurePairs = completeCasePairValues(completeCase, cluster, exposure);
  const outcomePairs = completeCasePairValues(completeCase, cluster, outcome);
  if (!exposurePairs.length && !outcomePairs.length) return null;
  const exposureByCluster = levelsByLeftValue(exposurePairs);
  const outcomeByCluster = levelsByLeftValue(outcomePairs);
  return {
    clustersWithRepeatedExposure: [...exposureByCluster.values()].filter(levels => levels.size >= 2).length,
    clustersWithOutcomeVariation: [...outcomeByCluster.values()].filter(levels => levels.size >= 2).length,
  };
}

function levelsByLeftValue(pairs: CompleteCasePairValue[]): Map<string, Set<string>> {
  const levels = new Map<string, Set<string>>();
  for (const pair of pairs) {
    const current = levels.get(pair.leftValue) ?? new Set<string>();
    current.add(pair.rightValue);
    levels.set(pair.leftValue, current);
  }
  return levels;
}

type FeasibilityColumn = ResearchTableSummary["columns"][number];

function columnByName(summary: ResearchTableSummary | null, name: string | null | undefined): FeasibilityColumn | null {
  if (!summary || !name) return null;
  return summary.columns.find(column => column.name === name) ?? null;
}

function columnIsNumeric(column: FeasibilityColumn): boolean {
  return column.inferredType === "number" || column.inferredType === "boolean";
}

function columnValueLevels(column: FeasibilityColumn): Array<{ value: string; count: number }> {
  return column.valueCounts?.map(item => ({ value: item.value, count: item.count })) ?? [];
}

function columnIsBinaryLike(column: FeasibilityColumn, observedLevels: Array<{ value: string; count: number }>): boolean {
  if (column.inferredType === "boolean") return true;
  const levels = observedLevels.length ? observedLevels : columnValueLevels(column);
  if (binaryCounts(levels)) return true;
  if (typeof column.uniqueCount === "number" && column.uniqueCount === 2 && !columnIsContinuousLike(column)) return true;
  if (column.inferredType === "number" && column.min !== undefined && column.max !== undefined && column.min >= 0 && column.max <= 1 && (column.uniqueCount ?? 2) <= 2) return true;
  return false;
}

function columnIsContinuousLike(column: FeasibilityColumn): boolean {
  if (column.inferredType !== "number") return false;
  const uniqueCount = column.uniqueCount ?? null;
  if (uniqueCount === null) return false;
  const nonMissing = Math.max(column.nonMissingRows, 1);
  const continuousThreshold = Math.min(20, Math.max(8, Math.floor(nonMissing * 0.2)));
  return uniqueCount > continuousThreshold;
}

function columnLooksIntegerValued(column: FeasibilityColumn): boolean {
  if (!columnIsNumeric(column)) return false;
  const values = [
    ...(column.sampleValues ?? []),
    ...(column.valueCounts ?? []).map(item => item.value),
  ].slice(0, 100);
  if (values.length > 0) {
    return values.every(value => {
      const numeric = Number(value);
      return Number.isFinite(numeric) && Number.isInteger(numeric);
    });
  }
  const bounds = [column.min, column.max].filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  return bounds.length > 0 && bounds.every(value => Number.isInteger(value));
}

function columnShapeLabel(column: FeasibilityColumn): string {
  const parts = [`type=${column.inferredType}`];
  if (typeof column.uniqueCount === "number") parts.push(`unique=${column.uniqueCount}`);
  if (typeof column.min === "number" || typeof column.max === "number") parts.push(`range=${column.min ?? "unknown"} to ${column.max ?? "unknown"}`);
  return parts.join(", ");
}

function regressionFamilyMethods(): Set<StatsMethod> {
  return new Set([
    "linear-regression",
    "robust-linear-regression",
    "logistic-regression",
    "ordinal-logistic-regression",
    "multinomial-logistic-regression",
    "poisson-regression",
    "negative-binomial-regression",
    "zero-inflated-poisson",
    "zero-inflated-negative-binomial",
    "gamma-glm",
    "inverse-gaussian-glm",
    "quantile-regression",
    "penalized-linear-regression",
    "penalized-logistic-regression",
  ]);
}

function binaryOutcomeMethods(): Set<StatsMethod> {
  return new Set(["logistic-regression", "penalized-logistic-regression"]);
}

function multinomialOutcomeMethods(): Set<StatsMethod> {
  return new Set(["ordinal-logistic-regression", "multinomial-logistic-regression"]);
}

function continuousOutcomeMethods(): Set<StatsMethod> {
  return new Set([
    "linear-regression",
    "robust-linear-regression",
    "quantile-regression",
    "penalized-linear-regression",
    "linear-mixed-model",
    "repeated-measures-anova",
    ...groupedNumericOutcomeMethods(),
  ]);
}

function linearContinuousMethods(): Set<StatsMethod> {
  return new Set(["linear-regression", "robust-linear-regression", "quantile-regression", "penalized-linear-regression"]);
}

function countOutcomeMethods(): Set<StatsMethod> {
  return new Set(["poisson-regression", "negative-binomial-regression", "zero-inflated-poisson", "zero-inflated-negative-binomial"]);
}

function positiveContinuousOutcomeMethods(): Set<StatsMethod> {
  return new Set(["gamma-glm", "inverse-gaussian-glm"]);
}

function groupedNumericOutcomeMethods(): Set<StatsMethod> {
  return new Set(["t-test", "welch-t-test", "anova", "ancova", "mann-whitney", "kruskal-wallis"]);
}

function twoGroupOnlyMethods(): Set<StatsMethod> {
  return new Set(["t-test", "welch-t-test", "mann-whitney"]);
}

function categoricalAssociationMethods(): Set<StatsMethod> {
  return new Set(["chi-square", "fisher-exact", "mcnemar", "cochran-armitage-trend"]);
}

function twoByTwoCategoricalMethods(): Set<StatsMethod> {
  return new Set(["fisher-exact", "mcnemar"]);
}

function correlationMethods(): Set<StatsMethod> {
  return new Set(["pearson", "spearman", "kendall", "partial-correlation"]);
}

function propensityTreatmentMethods(): Set<StatsMethod> {
  return new Set(["propensity-score-matching", "propensity-score-weighting", "overlap-weighting", "entropy-balancing", "doubly-robust-aipw"]);
}

function diagnosticAccuracyMethods(): Set<StatsMethod> {
  return new Set(["diagnostic-accuracy"]);
}

function modelTermIntegrityMethods(): Set<StatsMethod> {
  return new Set([
    ...regressionFamilyMethods(),
    ...survivalEventMethods(),
    ...longitudinalFamilyMethods(),
    ...propensityTreatmentMethods(),
    ...causalOrPropensityMethods(),
    "ancova",
    "partial-correlation",
    "model-diagnostics",
    "missingness-ipw",
  ]);
}

function causalOrPropensityMethods(): Set<StatsMethod> {
  return new Set([
    "propensity-score-matching",
    "propensity-score-weighting",
    "overlap-weighting",
    "entropy-balancing",
    "doubly-robust-aipw",
    "difference-in-differences",
    "event-study-did",
    "interrupted-time-series",
    "regression-discontinuity",
    "instrumental-variables-2sls",
    "target-trial-emulation-spec",
    "unmeasured-confounding-sensitivity",
  ]);
}

function outcomeLeakageExposureAllowedMethods(): Set<StatsMethod> {
  return new Set(["diagnostic-accuracy", "prediction-evaluation"]);
}

function missingnessMethods(): Set<StatsMethod> {
  return new Set(["missingness-summary", "multiple-imputation-mice", "missingness-ipw", "complete-case-sensitivity", "mnar-sensitivity"]);
}

function survivalEventMethods(): Set<StatsMethod> {
  return new Set(["kaplan-meier", "log-rank", "cox-proportional-hazards", "stratified-cox", "time-varying-cox", "fine-gray", "aalen-johansen-cif", "recurrent-event-rate", "recurrent-event-cox"]);
}

function binarySurvivalEventMethods(): Set<StatsMethod> {
  return new Set(["kaplan-meier", "log-rank", "cox-proportional-hazards", "stratified-cox", "time-varying-cox", "recurrent-event-rate", "recurrent-event-cox"]);
}

function longitudinalFamilyMethods(): Set<StatsMethod> {
  return new Set(["linear-mixed-model", "generalized-mixed-model", "gee", "repeated-measures-anova"]);
}

function repeatedVariableRequirement(method: StatsMethod | null | undefined): number | null {
  if (method === "paired-t-test" || method === "wilcoxon") return 2;
  if (method === "friedman" || method === "cochran-q") return 3;
  return null;
}

function columnIsOrdinalName(name: string): boolean {
  return /ordinal|stage|grade|class|severity|level|category/i.test(name);
}

function powerScore(rowCount: number | null, completeRows: number | null, eventCount: number | null, predictorCount: number, epv: number | null): number {
  if (epv !== null) return epv < 3 ? 0.15 : epv < 10 ? 0.55 : epv < 20 ? 0.8 : 0.95;
  const n = completeRows ?? rowCount;
  if (n === null) return 0.45;
  if (eventCount !== null) return eventCount < 5 ? 0.2 : eventCount < 20 ? 0.55 : 0.85;
  if (predictorCount > 0 && n / predictorCount < 10) return 0.55;
  return n >= 100 ? 0.85 : n >= 50 ? 0.7 : 0.45;
}

function designSpecificityScore(opts: FeasibilityGateOptions): number {
  const q = opts.question.toLowerCase();
  let score = 0.35;
  if (opts.outcome || /\b(outcome|mortality|death|readmission|score|risk|length|event)\b/.test(q)) score += 0.15;
  if (opts.exposure || opts.group || /\b(exposure|treatment|dialysis|group|versus|vs|among)\b/.test(q)) score += 0.15;
  if (/(among|patients|adults|cohort|population)/.test(q)) score += 0.1;
  if (opts.time || opts.stop || opts.period || /\b(year|follow|longitudinal|before|after|index)\b/.test(q)) score += 0.1;
  if ((opts.covariates ?? []).length || /\badjust|covariate|confound/.test(q)) score += 0.1;
  if (opts.method) score += 0.05;
  return clamp(score);
}

function methodRequiresEvents(method: StatsMethod | null | undefined): boolean {
  return Boolean(method && ["logistic-regression", "penalized-logistic-regression", "kaplan-meier", "log-rank", "cox-proportional-hazards", "stratified-cox", "time-varying-cox", "fine-gray", "aalen-johansen-cif", "recurrent-event-rate", "recurrent-event-cox", "prediction-evaluation"].includes(method));
}

function requiresExposure(method: StatsMethod | null | undefined): boolean {
  return Boolean(method && [
    "chi-square",
    "fisher-exact",
    "mcnemar",
    "cochran-armitage-trend",
    "pearson",
    "spearman",
    "kendall",
    "partial-correlation",
    "linear-regression",
    "robust-linear-regression",
    "logistic-regression",
    "ordinal-logistic-regression",
    "multinomial-logistic-regression",
    "poisson-regression",
    "negative-binomial-regression",
    "zero-inflated-poisson",
    "zero-inflated-negative-binomial",
    "gamma-glm",
    "inverse-gaussian-glm",
    "quantile-regression",
    "penalized-linear-regression",
    "penalized-logistic-regression",
    "cox-proportional-hazards",
    "stratified-cox",
    "time-varying-cox",
    "fine-gray",
    "recurrent-event-cox",
    "overlap-weighting",
    "entropy-balancing",
    "doubly-robust-aipw",
    "difference-in-differences",
    "event-study-did",
    "instrumental-variables-2sls",
    "target-trial-emulation-spec",
    "unmeasured-confounding-sensitivity",
    "prediction-evaluation",
    "diagnostic-accuracy",
    "propensity-score-matching",
    "propensity-score-weighting",
    "model-diagnostics",
    "linear-mixed-model",
    "generalized-mixed-model",
    "gee",
    "repeated-measures-anova",
  ].includes(method));
}
function requiresGroup(method: StatsMethod | null | undefined): boolean {
  return Boolean(method && ["t-test", "welch-t-test", "anova", "ancova", "mann-whitney", "kruskal-wallis", "chi-square", "fisher-exact", "mcnemar", "cochran-armitage-trend", "log-rank"].includes(method));
}
function requiresTime(method: StatsMethod | null | undefined): boolean {
  return Boolean(method && ["kaplan-meier", "log-rank", "cox-proportional-hazards", "stratified-cox", "time-varying-cox", "fine-gray", "aalen-johansen-cif", "recurrent-event-rate", "recurrent-event-cox", "interrupted-time-series"].includes(method));
}
function requiresStart(method: StatsMethod | null | undefined): boolean {
  return method === "recurrent-event-cox";
}
function requiresStop(method: StatsMethod | null | undefined): boolean {
  return method === "recurrent-event-cox";
}
function requiresEvent(method: StatsMethod | null | undefined): boolean {
  return Boolean(method && ["kaplan-meier", "log-rank", "cox-proportional-hazards", "stratified-cox", "time-varying-cox", "fine-gray", "aalen-johansen-cif", "recurrent-event-rate", "recurrent-event-cox"].includes(method));
}
function requiresId(method: StatsMethod | null | undefined): boolean {
  return Boolean(method && ["linear-mixed-model", "generalized-mixed-model", "gee", "repeated-measures-anova", "recurrent-event-rate", "recurrent-event-cox"].includes(method));
}
function requiresPeriod(method: StatsMethod | null | undefined): boolean {
  return method === "event-study-did";
}
function requiresPost(method: StatsMethod | null | undefined): boolean {
  return Boolean(method && ["difference-in-differences", "interrupted-time-series"].includes(method));
}
function requiresRunningVariable(method: StatsMethod | null | undefined): boolean {
  return method === "regression-discontinuity";
}
function requiresCutoff(method: StatsMethod | null | undefined): boolean {
  return method === "regression-discontinuity";
}
function requiresInstrument(method: StatsMethod | null | undefined): boolean {
  return method === "instrumental-variables-2sls";
}

function requiresOutcomeOrEvent(method: StatsMethod | null | undefined): boolean {
  return Boolean(method && ![
    "descriptive",
    "paired-t-test",
    "wilcoxon",
    "friedman",
    "cochran-q",
    "missingness-summary",
    "multiple-imputation-mice",
    "reliability-kappa",
    "intraclass-correlation",
    "cronbach-alpha",
    "pca",
    "clustering-validation",
    "bland-altman",
    "multiple-comparison-correction",
    "power-sample-size",
  ].includes(method));
}

function conservativeMinEvents(opts: FeasibilityGateOptions): number {
  const predictors = unique([opts.exposure, opts.group, ...(opts.covariates ?? []), ...(opts.variables ?? [])].filter((item): item is string => Boolean(item))).length;
  return Math.max(opts.minEvents ?? 10, predictors * 10, 10);
}

function semanticIssuesForColumn(column: ResearchTableSummary["columns"][number], rowCount: number | null): FeasibilityVariableCheck["issues"] {
  return semanticPlausibilityIssuesForColumn(column, rowCount);
}

async function scanRows(dataPath: string | null, variables: string[], limit = Number.POSITIVE_INFINITY): Promise<RowScan | null> {
  if (!dataPath || !variables.length) return null;
  const ext = path.extname(dataPath).toLowerCase();
  let rows: Array<Record<string, unknown>>;
  try {
    if (ext === ".csv") rows = parseCsv(await readFile(dataPath, "utf-8"));
    else if (ext === ".json") {
      const parsed = JSON.parse(await readFile(dataPath, "utf-8")) as unknown;
      rows = Array.isArray(parsed) ? parsed.filter(item => item && typeof item === "object") as Array<Record<string, unknown>> : [];
    } else return null;
  } catch {
    return null;
  }
  const scanned = Number.isFinite(limit) ? rows.slice(0, limit) : rows;
  const valueCounts: Record<string, Record<string, number>> = {};
  const completeValueCounts: Record<string, Record<string, number>> = {};
  const completePairCounts: Record<string, { rowVariable: string; columnVariable: string; counts: Record<string, Record<string, number>> }> = {};
  for (const variable of variables) valueCounts[variable] = {};
  for (const variable of variables) completeValueCounts[variable] = {};
  const uniqueVariables = unique(variables);
  for (let i = 0; i < uniqueVariables.length; i += 1) {
    for (let j = i + 1; j < uniqueVariables.length; j += 1) {
      const rowVariable = uniqueVariables[i]!;
      const columnVariable = uniqueVariables[j]!;
      completePairCounts[pairKey(rowVariable, columnVariable)] = { rowVariable, columnVariable, counts: {} };
    }
  }
  let completeRows = 0;
  for (const row of scanned) {
    const complete = variables.every(variable => hasValue(row[variable]));
    if (complete) completeRows += 1;
    for (const variable of variables) {
      const value = row[variable];
      if (!hasValue(value)) continue;
      const key = String(value);
      valueCounts[variable]![key] = (valueCounts[variable]![key] ?? 0) + 1;
      if (complete) completeValueCounts[variable]![key] = (completeValueCounts[variable]![key] ?? 0) + 1;
    }
    if (complete) {
      for (const entry of Object.values(completePairCounts)) {
        const rowValue = String(row[entry.rowVariable]);
        const columnValue = String(row[entry.columnVariable]);
        entry.counts[rowValue] ??= {};
        entry.counts[rowValue]![columnValue] = (entry.counts[rowValue]![columnValue] ?? 0) + 1;
      }
    }
  }
  return { scannedRows: scanned.length, completeRows, truncated: rows.length > scanned.length, valueCounts, completeValueCounts, completePairCounts };
}

function pairKey(left: string, right: string): string {
  return `${left}\u001f${right}`;
}

function parseCsv(raw: string): Array<Record<string, unknown>> {
  const lines = raw.split(/\r?\n/).filter(line => line.trim().length);
  if (lines.length < 2) return [];
  const headers = parseCsvLine(lines[0] ?? "").map(header => header.trim());
  return lines.slice(1).map(line => {
    const values = parseCsvLine(line);
    const row: Record<string, unknown> = {};
    for (let i = 0; i < headers.length; i += 1) row[headers[i] ?? `col${i}`] = parseScalar(values[i] ?? "");
    return row;
  });
}

function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let value = "";
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (char === "\"" && line[i + 1] === "\"") {
      value += "\"";
      i += 1;
    } else if (char === "\"") quoted = !quoted;
    else if (char === "," && !quoted) {
      result.push(value);
      value = "";
    } else value += char;
  }
  result.push(value);
  return result;
}

function parseScalar(value: string): unknown {
  const trimmed = value.trim();
  if (trimmed === "") return null;
  const numeric = Number(trimmed);
  return Number.isFinite(numeric) ? numeric : trimmed;
}

function binaryCounts(levels: Array<{ value: string; count: number }>): { eventCount: number; nonEventCount: number } | null {
  const compact = [...levels.reduce((map, level) => {
    if (level.count <= 0) return map;
    const normalized = normalizeBinaryLevel(level.value);
    map.set(normalized, { value: normalized, count: (map.get(normalized)?.count ?? 0) + level.count });
    return map;
  }, new Map<string, { value: string; count: number }>()).values()];
  if (compact.length === 2) {
    const positives = compact.filter(level => semanticBinaryLevelRole(level.value) === "positive");
    const negatives = compact.filter(level => semanticBinaryLevelRole(level.value) === "negative");
    if (positives.length === 1 && negatives.length === 1) {
      return {
        eventCount: positives[0]?.count ?? 0,
        nonEventCount: negatives[0]?.count ?? 0,
      };
    }
    if (positives.length === 1 && negatives.length === 0) {
      return {
        eventCount: positives[0]?.count ?? 0,
        nonEventCount: compact.filter(level => normalizeBinaryLevel(level.value) !== normalizeBinaryLevel(positives[0]?.value ?? "")).reduce((sum, level) => sum + level.count, 0),
      };
    }
    if (negatives.length === 1 && positives.length === 0) {
      return {
        nonEventCount: negatives[0]?.count ?? 0,
        eventCount: compact.filter(level => normalizeBinaryLevel(level.value) !== normalizeBinaryLevel(negatives[0]?.value ?? "")).reduce((sum, level) => sum + level.count, 0),
      };
    }
    if (positives.length > 0 || negatives.length > 0) return null;
    const sorted = [...compact].sort((a, b) => Number(a.value) - Number(b.value));
    if (sorted.every(level => Number.isFinite(Number(level.value)))) return { nonEventCount: sorted[0]?.count ?? 0, eventCount: sorted[1]?.count ?? 0 };
    const lexical = [...compact].sort((a, b) => String(a.value).localeCompare(String(b.value)));
    return { nonEventCount: lexical[0]?.count ?? 0, eventCount: lexical[1]?.count ?? 0 };
  }
  return null;
}

function normalizeBinaryLevel(value: string): string {
  return value.trim().toLowerCase().replace(/[_-]+/g, " ").replace(/\s+/g, " ");
}

function semanticBinaryLevelRole(value: string): "negative" | "positive" | null {
  const normalized = normalizeBinaryLevel(value);
  const negative = new Set([
    "0", "false", "f", "no", "n", "control", "comparison", "reference", "baseline",
    "placebo", "usual care", "standard care", "unexposed", "non exposed", "not exposed", "untreated",
    "negative", "neg", "absent", "none", "normal", "not detected", "noncase", "non case",
    "alive", "survived", "survivor", "survival", "no event", "no disease", "without",
  ]);
  const positive = new Set([
    "1", "true", "t", "yes", "y", "case", "event", "exposed", "treated", "treatment",
    "intervention", "active", "therapy", "positive", "pos", "present", "detected", "abnormal",
    "disease", "diseased", "dead", "death", "died", "deceased", "mortality", "failure",
    "readmitted", "complication", "with",
  ]);
  if (negative.has(normalized) || normalized.startsWith("no ") || normalized.startsWith("non ") || normalized.startsWith("without ")) return "negative";
  if (positive.has(normalized)) return "positive";
  return null;
}

function weightedScore(domains: FeasibilityDomainScore[]): number {
  const denominator = domains.reduce((sum, item) => sum + item.weight, 0);
  return domains.reduce((sum, item) => sum + item.score * item.weight, 0) / Math.max(denominator, 1);
}

function hasValue(value: unknown): boolean {
  return value !== null && value !== undefined && String(value).trim() !== "";
}

function clamp(value: number): number {
  return Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
}

function round(value: number, digits = 4): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function unique<T>(items: T[]): T[] {
  return [...new Set(items)];
}

function duplicatedValues(values: string[]): string[] {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) duplicates.add(value);
    seen.add(value);
  }
  return [...duplicates].sort();
}

export function renderResearchFeasibilityGate(result: FeasibilityGateResult): string {
  return [
    "research feasibility gate",
    `  verdict: ${result.verdict}`,
    `  status: ${result.status}`,
    `  score: ${result.score}`,
    `  confidence: ${result.confidence}`,
    `  rows: ${result.rowCount ?? "unknown"}`,
    `  method: ${result.method ?? "(not selected)"}`,
    `  blockers: ${result.blockers.length}`,
    `  warnings: ${result.warnings.length}`,
    `  next: ${result.nextAction}`,
    `  out: ${result.outPath ?? "(not written)"}`,
  ].join("\n");
}

export function renderResearchFeasibilityGateJson(result: FeasibilityGateResult): string {
  return `${JSON.stringify({ schemaVersion: 1, feasibilityGate: result }, null, 2)}\n`;
}

export function renderResearchFeasibilityGateMarkdown(result: FeasibilityGateResult): string {
  return [
    "# Research Feasibility Gate",
    "",
    `Question: ${result.question}`,
    `Verdict: ${result.verdict}`,
    `Status: ${result.status}`,
    `Score: ${result.score}`,
    `Confidence: ${result.confidence}`,
    `Readiness: ${result.readinessLabel}`,
    `Primary action: ${result.primaryAction}`,
    "",
    "## Domain Scores",
    "",
    ...result.domains.map(domain => `- [${domain.status}] ${domain.label}: ${domain.score} - ${domain.rationale}`),
    "",
    "## Internal Reviews",
    "",
    ...result.internalReviews.flatMap(review => [
      `### ${review.reviewerId}`,
      "",
      `- Stance: ${review.stance}`,
      `- Suggested verdict: ${review.suggestedVerdict}`,
      `- Confidence: ${review.confidence}`,
      ...(review.primaryConcerns.length ? review.primaryConcerns.map(item => `- Concern: ${item}`) : ["- Concern: none"]),
      ...(review.requiredActions.length ? review.requiredActions.map(item => `- Required action: ${item}`) : ["- Required action: none"]),
      "",
    ]),
    "## Blockers",
    "",
    ...(result.blockers.length ? result.blockers.map(item => `- ${item}`) : ["- None."]),
    "",
    "## Warnings",
    "",
    ...(result.warnings.length ? result.warnings.map(item => `- ${item}`) : ["- None."]),
    "",
    "## Typed Issues",
    "",
    ...(result.issues.length ? result.issues.map(item => `- [${item.severity}] ${item.code}: ${item.message}${item.domainId ? ` (domain: ${item.domainId})` : item.variable ? ` (variable: ${item.variable})` : item.reviewerId ? ` (reviewer: ${item.reviewerId})` : ""}`) : ["- None."]),
    "",
    "## Required Modifications",
    "",
    ...(result.requiredModifications.length ? result.requiredModifications.map(item => `- ${item}`) : ["- None."]),
    "",
    "## Clarifying Questions",
    "",
    ...(result.clarifyingQuestions.length ? result.clarifyingQuestions.map(item => `- ${item}`) : ["- None."]),
    "",
    "## Alternative Study Ideas",
    "",
    ...(result.alternativeStudyIdeas.length ? result.alternativeStudyIdeas.map(item => `- ${item.title}: ${item.reason} (${item.expectedVerdict})`) : ["- None."]),
    "",
    "## Study Design Advice",
    "",
    `- Recommended posture: ${result.studyDesignAdvice.recommendedPosture}`,
    `- Method recommendation: ${result.studyDesignAdvice.methodRecommendation}`,
    `- Estimand/design warning: ${result.studyDesignAdvice.estimandOrDesignWarning ?? "none"}`,
    `- Reviewer risk: ${result.studyDesignAdvice.reviewerRiskSummary}`,
    "",
    `Next action: ${result.nextAction}`,
    "",
  ].join("\n");
}
