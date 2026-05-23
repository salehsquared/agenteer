import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { researchTableSummaryCommand, type ResearchTableSummary } from "../commands/research.js";
import type { StatsMethod } from "./stats/schemas.js";

export type FeasibilityVerdict = "reject" | "needs_data_profiling" | "needs_phenotype_review" | "exploratory_only" | "formal_analysis_ready";
export type FeasibilityDomainStatus = "pass" | "warning" | "block" | "unknown";
export type FeasibilityAction = "reject" | "profile_data" | "review_phenotype" | "revise_design" | "ask_clarification" | "explore_only" | "run_formal_analysis";

export interface FeasibilityVariableRole {
  role: "outcome" | "exposure" | "group" | "time" | "event" | "id" | "strata" | "cluster" | "period" | "post" | "running_variable" | "instrument" | "variable" | "covariate" | "exact_covariate" | "weight" | "phenotype" | string;
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
  time?: string | null;
  event?: string | null;
  id?: string | null;
  strata?: string | null;
  cluster?: string | null;
  period?: string | null;
  post?: string | null;
  runningVariable?: string | null;
  instrument?: string | null;
  weight?: string | null;
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
  domains: FeasibilityDomainScore[];
  internalReviews: FeasibilityInternalReview[];
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
  const variableChecks = variables.map(item => buildVariableCheck(item, byName, Boolean(summary)));
  const completeCase = buildCompleteCase(rowScan, summary, opts.dataPath ?? null);
  const outcomeDiagnostics = buildOutcomeDiagnostics(opts, rowScan, byName);
  const domains = buildDomainScores(opts, summary, variableChecks, completeCase, outcomeDiagnostics, rowScan);
  const internalReviews = buildInternalReviews(domains, opts, outcomeDiagnostics);
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
  const hasTemporalQuestion = /(longitudinal|follow.?up|survival|readmission|reintervention|over time|time to|incident|subsequent|before|after|from \d{4}|to \d{4})/i.test(opts.question);
  const temporalComplete = !hasTemporalQuestion || Boolean(opts.time || opts.period || opts.temporalStartYear || opts.temporalEndYear || opts.expectedFollowupYears);
  const method = opts.method;
  const completeRows = completeCase.completeRows ?? summary?.rowCount ?? null;
  const dataProfileNeeded = !summary;
  const eventCount = outcome.eventCount;
  const predictorCount = unique([opts.exposure, opts.group, ...(opts.covariates ?? []), ...(opts.variables ?? [])].filter((item): item is string => Boolean(item))).length;
  const epv = eventCount !== null && predictorCount > 0 ? eventCount / predictorCount : null;
  const reviewerRisk = reviewerRiskScore(opts, semanticIssues.length, highMissing.length, phenotypeConfidence, temporalComplete, method, outcome);

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
      eventCount === null ? "Event count is not available or not required for the proposed method." : `${eventCount} event(s) detected; preferred minimum is ${minEvents}.`,
      eventCount !== null && eventCount < Math.max(3, Math.floor(minEvents / 2)) ? [`Only ${eventCount} event(s), too sparse for the requested inferential design.`] : [],
      eventCount === null && methodRequiresEvents(method) ? ["Event count must be profiled before time-to-event or binary-outcome inference."] : eventCount !== null && eventCount < minEvents ? [`Event count ${eventCount} is below preferred minimum ${minEvents}.`] : [],
      ["Use a broader endpoint, longer horizon, descriptive event counts, or exploratory-only posture."],
    ),
    add(
      "missingness",
      "Missingness",
      highMissing.length ? Math.max(0.15, 1 - highMissing.length * 0.25) : required.length ? 0.94 : 0.7,
      1,
      highMissing.length ? `${highMissing.length} required variable(s) exceed missingness threshold ${maxMissingness}.` : "Required-variable missingness is within configured threshold or not yet applicable.",
      highMissing.filter(item => item.missingFraction > 0.8).map(item => `${item.name} is ${(item.missingFraction * 100).toFixed(1)}% missing.`),
      highMissing.filter(item => item.missingFraction <= 0.8).map(item => `${item.name} is ${(item.missingFraction * 100).toFixed(1)}% missing.`),
      ["Add missingness mechanism review, complete-case sensitivity, imputation, or choose less-missing variables."],
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
      temporalComplete ? 0.9 : 0.42,
      0.95,
      temporalComplete ? "Temporal requirements are either not central or have at least one time/horizon signal." : "The question implies longitudinal timing but no time, period, follow-up, or horizon signal is declared.",
      [],
      temporalComplete ? [] : ["Temporal direction and follow-up observability are underspecified."],
      ["Declare index date/time, baseline window, follow-up window, censoring, and outcome timing."],
    ),
    add(
      "outcome_observability",
      "Outcome Observability",
      outcome.outcome ? outcome.usable === false ? 0.2 : outcome.eventCount === null ? 0.7 : outcome.eventCount > 0 ? 0.92 : 0.2 : 0.45,
      1.15,
      outcome.outcome ? `Outcome ${outcome.outcome} observability: usable=${outcome.usable}; events=${outcome.eventCount ?? "unknown"}.` : "No outcome/event variable is declared.",
      outcome.outcome && outcome.usable === false ? [`Outcome '${outcome.outcome}' is not usable as observed.`] : [],
      !outcome.outcome ? ["Outcome/event must be declared or the study must remain exploratory/descriptive."] : outcome.eventCount === 0 ? ["No observed outcome events in scanned data."] : [],
      ["Map an observable endpoint, broaden endpoint definition, or use descriptive profiling."],
    ),
    add(
      "method_suitability",
      "Method Suitability",
      methodSuitabilityScore(opts, outcome, summary),
      1.2,
      method ? `Requested method ${method} was checked against available design signals.` : "No method supplied; method selection can still proceed after data profiling.",
      methodSuitabilityBlockers(opts, outcome),
      methodSuitabilityWarnings(opts, outcome, summary),
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
      powerScore(summary?.rowCount ?? null, completeRows, eventCount, predictorCount, epv),
      0.95,
      epv === null ? "Power is approximated from row count and complete-case count." : `Approximate events per modeled predictor: ${round(epv, 2)}.`,
      epv !== null && epv < 3 ? [`Events per predictor is ${round(epv, 2)}, too low for stable adjusted modeling.`] : [],
      epv !== null && epv >= 3 && epv < 10 ? [`Events per predictor is ${round(epv, 2)}, below the conservative 10 EPV heuristic.`] : [],
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

function buildVariableCheck(item: FeasibilityVariableRole, byName: Map<string, ResearchTableSummary["columns"][number]>, hasTableSummary: boolean): FeasibilityVariableCheck {
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
    issues.push(...semanticIssuesForColumn(column));
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

function feasibilityVariableRoles(opts: FeasibilityGateOptions): FeasibilityVariableRole[] {
  const pairs: FeasibilityVariableRole[] = [
    ...role("outcome", opts.outcome, true),
    ...role("exposure", opts.exposure, requiresExposure(opts.method)),
    ...role("group", opts.group, requiresGroup(opts.method)),
    ...role("time", opts.time, requiresTime(opts.method)),
    ...role("event", opts.event, requiresEvent(opts.method)),
    ...role("id", opts.id, requiresId(opts.method)),
    ...role("strata", opts.strata, false),
    ...role("cluster", opts.cluster, false),
    ...role("period", opts.period, requiresPeriod(opts.method)),
    ...role("post", opts.post, requiresPost(opts.method)),
    ...role("running_variable", opts.runningVariable, requiresRunningVariable(opts.method)),
    ...role("instrument", opts.instrument, requiresInstrument(opts.method)),
    ...role("weight", opts.weight, opts.surveyDesign === true),
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
      scanReason: rowScan.truncated ? `Scanned first ${rowScan.scannedRows} rows for feasibility.` : `Scanned ${rowScan.scannedRows} rows for feasibility.`,
    };
  }
  return {
    scanned: false,
    scannedRows: 0,
    completeRows: null,
    completeFraction: null,
    scanReason: dataPath ? "Complete-case row scan is available for CSV/JSON inputs; this format could not be parsed cheaply." : summary ? "Only aggregate table summary was available." : "No data path or table summary was available.",
  };
}

function buildOutcomeDiagnostics(opts: FeasibilityGateOptions, rowScan: RowScan | null, byName: Map<string, ResearchTableSummary["columns"][number]>): FeasibilityGateResult["outcomeDiagnostics"] {
  const outcome = opts.outcome ?? opts.event ?? null;
  const observedLevels = outcome && rowScan?.valueCounts[outcome]
    ? Object.entries(rowScan.valueCounts[outcome]).map(([value, count]) => ({ value, count })).sort((a, b) => b.count - a.count).slice(0, 20)
    : outcome && byName.get(outcome)?.valueCounts?.length
      ? byName.get(outcome)!.valueCounts!.map(item => ({ value: item.value, count: item.count })).sort((a, b) => b.count - a.count).slice(0, 20)
    : [];
  const binary = binaryCounts(observedLevels);
  const column = outcome ? byName.get(outcome) : undefined;
  return {
    outcome,
    observedLevels,
    eventCount: binary?.eventCount ?? null,
    nonEventCount: binary?.nonEventCount ?? null,
    eventRate: binary && binary.eventCount + binary.nonEventCount > 0 ? round(binary.eventCount / (binary.eventCount + binary.nonEventCount), 4) : null,
    usable: outcome ? column ? column.nonMissingRows > 0 && (observedLevels.length !== 1 || !rowScan) : rowScan ? false : null : null,
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
  if (methodRequiresEvents(opts.method) && outcome.eventCount === null) {
    reviews[1] = { ...reviews[1]!, stance: "needs_review", suggestedVerdict: "needs_data_profiling", primaryConcerns: unique([...reviews[1]!.primaryConcerns, "Event count is unknown for an event-dependent method."]) };
  }
  return reviews;
}

function chooseVerdict(domains: FeasibilityDomainScore[], blockers: string[], warnings: string[], reviews: FeasibilityInternalReview[], score: number): FeasibilityVerdict {
  const domain = (id: FeasibilityDomainScore["id"]) => domains.find(item => item.id === id);
  if (blockers.length || reviews.some(review => review.stance === "reject")) return "reject";
  if (domain("data_availability")?.status !== "pass" || domain("cohort_size")?.score! < 0.5 || domain("event_count")?.warnings.some(w => /profiled|unknown/i.test(w))) return "needs_data_profiling";
  if (domain("phenotype_confidence")?.status !== "pass") return "needs_phenotype_review";
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
  if (!opts.outcome && !opts.event) questions.push("What exact outcome or endpoint should be analyzed, and how is it observed in the dataset?");
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
    reviewerRiskSummary: reviews.find(item => item.reviewerId === "skeptical_reviewer_agent")?.primaryConcerns.join("; ") ?? `Outcome events=${outcome.eventCount ?? "unknown"}.`,
  };
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
  if (methodRequiresEvents(method) && (outcome.eventCount === null || outcome.eventCount < conservativeMinEvents(opts))) risk += 0.18;
  if (semanticIssues) risk += Math.min(0.25, semanticIssues * 0.08);
  if (highMissing) risk += Math.min(0.2, highMissing * 0.06);
  if (phenotypeConfidence < 0.75) risk += 0.18;
  if (!temporalComplete) risk += 0.16;
  if (opts.surveyDesign && !opts.allowSurveyApproximation && !opts.weight) risk += 0.12;
  return clamp(risk);
}

function methodSuitabilityScore(opts: FeasibilityGateOptions, outcome: FeasibilityGateResult["outcomeDiagnostics"], summary: ResearchTableSummary | null): number {
  if (!opts.method) return 0.72;
  const blockers = methodSuitabilityBlockers(opts, outcome);
  if (blockers.length) return 0.2;
  const warnings = methodSuitabilityWarnings(opts, outcome, summary);
  return warnings.length ? 0.68 : 0.9;
}

function methodSuitabilityBlockers(opts: FeasibilityGateOptions, outcome: FeasibilityGateResult["outcomeDiagnostics"]): string[] {
  const blockers: string[] = [];
  if (requiresTime(opts.method) && !opts.time) blockers.push(`${opts.method} requires a time variable.`);
  if (requiresEvent(opts.method) && !opts.event) blockers.push(`${opts.method} requires an event variable.`);
  if (requiresGroup(opts.method) && !opts.group && !opts.exposure) blockers.push(`${opts.method} requires a group/exposure variable.`);
  if (requiresPeriod(opts.method) && !opts.period) blockers.push(`${opts.method} requires a period variable.`);
  if (requiresPost(opts.method) && !opts.post) blockers.push(`${opts.method} requires a post/intervention indicator.`);
  if (requiresRunningVariable(opts.method) && !opts.runningVariable) blockers.push(`${opts.method} requires a running variable.`);
  if (requiresInstrument(opts.method) && !opts.instrument) blockers.push(`${opts.method} requires an instrument.`);
  if (methodRequiresEvents(opts.method) && outcome.eventCount !== null && outcome.eventCount < 3) blockers.push(`Only ${outcome.eventCount} event(s) observed for event-dependent method ${opts.method}.`);
  return blockers;
}

function methodSuitabilityWarnings(opts: FeasibilityGateOptions, outcome: FeasibilityGateResult["outcomeDiagnostics"], _summary: ResearchTableSummary | null): string[] {
  const warnings: string[] = [];
  if (!opts.method) warnings.push("Method has not been selected yet.");
  if (methodRequiresEvents(opts.method) && outcome.eventCount === null) warnings.push("Event count is unknown for an event-dependent method.");
  if (opts.surveyDesign && !opts.weight) warnings.push("Survey design was declared but no weight variable was supplied.");
  if (opts.method?.includes("propensity") && (opts.covariates ?? []).length < 2) warnings.push("Propensity design has too few measured covariates to support serious confounding adjustment.");
  return warnings;
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
  if (opts.time || opts.period || /\b(year|follow|longitudinal|before|after|index)\b/.test(q)) score += 0.1;
  if ((opts.covariates ?? []).length || /\badjust|covariate|confound/.test(q)) score += 0.1;
  if (opts.method) score += 0.05;
  return clamp(score);
}

function methodRequiresEvents(method: StatsMethod | null | undefined): boolean {
  return Boolean(method && ["logistic-regression", "penalized-logistic-regression", "kaplan-meier", "log-rank", "cox-proportional-hazards", "stratified-cox", "time-varying-cox", "fine-gray", "aalen-johansen-cif", "recurrent-event-rate", "prediction-evaluation"].includes(method));
}

function requiresExposure(method: StatsMethod | null | undefined): boolean {
  return Boolean(method && !["descriptive", "missingness-summary", "pca", "clustering-validation", "power-sample-size", "interrupted-time-series", "regression-discontinuity"].includes(method));
}
function requiresGroup(method: StatsMethod | null | undefined): boolean {
  return Boolean(method && ["t-test", "paired-t-test", "welch-t-test", "anova", "ancova", "mann-whitney", "wilcoxon", "kruskal-wallis", "friedman", "chi-square", "fisher-exact", "mcnemar", "cochran-armitage-trend", "log-rank"].includes(method));
}
function requiresTime(method: StatsMethod | null | undefined): boolean {
  return Boolean(method && ["kaplan-meier", "log-rank", "cox-proportional-hazards", "stratified-cox", "time-varying-cox", "fine-gray", "aalen-johansen-cif", "recurrent-event-rate", "interrupted-time-series"].includes(method));
}
function requiresEvent(method: StatsMethod | null | undefined): boolean {
  return Boolean(method && ["kaplan-meier", "log-rank", "cox-proportional-hazards", "stratified-cox", "time-varying-cox", "fine-gray", "aalen-johansen-cif", "recurrent-event-rate"].includes(method));
}
function requiresId(method: StatsMethod | null | undefined): boolean {
  return Boolean(method && ["paired-t-test", "wilcoxon", "mcnemar", "friedman", "linear-mixed-model", "generalized-mixed-model", "gee", "repeated-measures-anova", "time-varying-cox", "recurrent-event-rate"].includes(method));
}
function requiresPeriod(method: StatsMethod | null | undefined): boolean {
  return method === "event-study-did";
}
function requiresPost(method: StatsMethod | null | undefined): boolean {
  return Boolean(method && ["difference-in-differences", "event-study-did", "interrupted-time-series"].includes(method));
}
function requiresRunningVariable(method: StatsMethod | null | undefined): boolean {
  return method === "regression-discontinuity";
}
function requiresInstrument(method: StatsMethod | null | undefined): boolean {
  return method === "instrumental-variables-2sls";
}

function conservativeMinEvents(opts: FeasibilityGateOptions): number {
  const predictors = unique([opts.exposure, opts.group, ...(opts.covariates ?? []), ...(opts.variables ?? [])].filter((item): item is string => Boolean(item))).length;
  return Math.max(opts.minEvents ?? 10, predictors * 10, 10);
}

function semanticIssuesForColumn(column: ResearchTableSummary["columns"][number]): FeasibilityVariableCheck["issues"] {
  const issues: FeasibilityVariableCheck["issues"] = [];
  const lower = column.name.toLowerCase();
  if (column.inferredType !== "number") return issues;
  if (/(^|_)age($|_)/.test(lower) && ((column.min ?? 0) < 0 || (column.max ?? 0) > 120)) issues.push({ severity: "warning", code: "IMPLAUSIBLE_AGE_RANGE", message: `Age-like column ${column.name} has implausible range ${column.min} to ${column.max}.` });
  if (/(bmi|body.?mass)/.test(lower) && ((column.min ?? 20) < 5 || (column.max ?? 20) > 100)) issues.push({ severity: "warning", code: "IMPLAUSIBLE_BMI_RANGE", message: `BMI-like column ${column.name} has implausible range ${column.min} to ${column.max}.` });
  if (/(los|length.?of.?stay)/.test(lower) && (column.min ?? 0) < 0) issues.push({ severity: "warning", code: "NEGATIVE_LENGTH_OF_STAY", message: `Length-of-stay-like column ${column.name} has negative values.` });
  if (/(death|mortality|flag|stroke|mace)/.test(lower) && column.min !== undefined && column.max !== undefined && (column.min < 0 || column.max > 1)) issues.push({ severity: "blocker", code: "INVALID_BINARY_EVENT_RANGE", message: `Binary-event-like column ${column.name} is not bounded to 0/1 (${column.min} to ${column.max}).` });
  if (/(event)/.test(lower) && !/(death|mortality|flag|stroke|mace)/.test(lower) && column.min !== undefined && column.max !== undefined && column.min < 0) issues.push({ severity: "blocker", code: "INVALID_EVENT_CODE_RANGE", message: `Event-like column ${column.name} has negative event codes (${column.min} to ${column.max}).` });
  if (/(event)/.test(lower) && !/(death|mortality|flag|stroke|mace)/.test(lower) && column.min !== undefined && column.max !== undefined && column.max > 1) issues.push({ severity: "warning", code: "MULTISTATE_EVENT_CODES", message: `Event-like column ${column.name} has codes beyond 0/1 (${column.min} to ${column.max}); verify the selected method supports competing or multistate event coding.` });
  if (/(year)/.test(lower) && column.min !== undefined && column.max !== undefined && (column.min < 1800 || column.max > 2200)) issues.push({ severity: "warning", code: "IMPLAUSIBLE_YEAR_RANGE", message: `Year-like column ${column.name} has implausible range ${column.min} to ${column.max}.` });
  return issues;
}

async function scanRows(dataPath: string | null, variables: string[], limit = 5000): Promise<RowScan | null> {
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
  const scanned = rows.slice(0, limit);
  const valueCounts: Record<string, Record<string, number>> = {};
  for (const variable of variables) valueCounts[variable] = {};
  let completeRows = 0;
  for (const row of scanned) {
    if (variables.every(variable => hasValue(row[variable]))) completeRows += 1;
    for (const variable of variables) {
      const value = row[variable];
      if (!hasValue(value)) continue;
      const key = String(value);
      valueCounts[variable]![key] = (valueCounts[variable]![key] ?? 0) + 1;
    }
  }
  return { scannedRows: scanned.length, completeRows, truncated: rows.length > scanned.length, valueCounts };
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
