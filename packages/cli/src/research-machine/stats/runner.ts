import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { researchFeasibilityGateCommand, renderResearchFeasibilityGateMarkdown, type FeasibilityGateResult } from "../feasibility.js";
import { stableHash } from "../runtime.js";
import { buildFigureQa } from "./figure-qa.js";
import { statsRunMethodForAnalysisMethod } from "./method-map.js";
import { statsRunRequestSchema, type StatsArtifact, type StatsIssue, type StatsResultPosture, type StatsRunRequest, type StatsRunResult } from "./schemas.js";

const execFileAsync = promisify(execFile);

export async function runStatsMethod(rawRequest: StatsRunRequest): Promise<StatsRunResult> {
  const request = normalizeStatsRunRequest(rawRequest);
  await mkdir(request.outDir, { recursive: true });
  const configPath = path.join(request.outDir, "stats-config.json");
  const scriptPath = path.join(await mkdtemp(path.join(os.tmpdir(), "agenteer-stats-")), "stats_bridge.py");
  const binding = await inspectStatsBinding(request);
  let preflight: StatsPreflightResult | null = null;
  let preflightArtifacts: StatsArtifact[] = [];
  await writeFile(scriptPath, statsBridgeSource());
  await writeFile(configPath, `${JSON.stringify(request, null, 2)}\n`);
  if (binding.issues.some(issue => issue.severity === "blocker")) {
    const failed = await attachHashes(await writeStatsPacketArtifacts({
      schemaVersion: 1,
      runId: `statsrun_${Date.now()}`,
      method: request.method,
      status: "failed",
      rowCount: 0,
      completeCaseN: 0,
      variables: variablesFor(request),
      binding: binding.binding,
      parameters: {},
      estimates: [],
      diagnostics: {},
      issues: binding.issues,
      warnings: [],
      errors: ["Stats run binding validation failed."],
      artifacts: [{ kind: "config", path: configPath }],
      outDir: request.outDir,
    }, request));
    await writeFile(path.join(request.outDir, "stats-run.json"), `${JSON.stringify(failed, null, 2)}\n`);
    return failed;
  }
  if (request.surveyDesign && !request.allowSurveyApproximation) {
    const failed = await attachHashes(await writeStatsPacketArtifacts({
      schemaVersion: 1,
      runId: `statsrun_${Date.now()}`,
      method: request.method,
      status: "failed",
      rowCount: 0,
      completeCaseN: 0,
      variables: variablesFor(request),
      binding: binding.binding,
      parameters: { surveyDesign: true, allowSurveyApproximation: false },
      estimates: [],
      diagnostics: {},
      issues: [{
        severity: "blocker",
        code: "SURVEY_DESIGN_REQUIRES_SURVEY_RUNNER",
        message: "stats-run does not provide complex-survey variance; use paper-run --backend r-survey or pass --allow-survey-approximation for an explicitly exploratory run.",
        evidenceRefs: ["request.surveyDesign"],
      }],
      warnings: [],
      errors: ["Complex-survey design requires a survey-aware runner."],
      artifacts: [{ kind: "config", path: configPath }],
      outDir: request.outDir,
    }, request));
    await writeFile(path.join(request.outDir, "stats-run.json"), `${JSON.stringify(failed, null, 2)}\n`);
    return failed;
  }
  preflight = await buildStatsPreflight(request);
  preflightArtifacts = await writeStatsPreflightArtifacts(preflight, request.outDir);
  if (preflight.status === "block") {
    const failed = await attachHashes(await writeStatsPacketArtifacts({
      schemaVersion: 1,
      runId: `statsrun_${Date.now()}`,
      method: request.method,
      status: "failed",
      rowCount: preflight.feasibilityGate.rowCount ?? 0,
      completeCaseN: preflight.feasibilityGate.completeCase.completeRows ?? 0,
      variables: variablesFor(request),
      binding: binding.binding,
      parameters: { preflightStatus: preflight.status, feasibilityVerdict: preflight.feasibilityGate.verdict },
      estimates: [],
      diagnostics: { preflight: summarizeStatsPreflight(preflight) },
      issues: [...binding.issues, ...preflight.issues],
      warnings: preflight.warnings,
      errors: [`Stats preflight blocked execution: ${preflight.nextAction}`],
      artifacts: [{ kind: "config", path: configPath }, ...preflightArtifacts],
      outDir: request.outDir,
    }, request));
    await writeFile(path.join(request.outDir, "stats-run.json"), `${JSON.stringify(failed, null, 2)}\n`);
    return failed;
  }
  const python = request.python ?? process.env.AGENTEER_RESEARCH_PYTHON ?? path.resolve(".research-runtime/python/bin/python");
  try {
    const { stdout, stderr } = await execFileAsync(python, [scriptPath, configPath], {
      maxBuffer: 1024 * 1024 * 24,
      cwd: process.cwd(),
      env: { ...process.env, PYTHONWARNINGS: "ignore" },
    });
      const parsed = JSON.parse(stdout) as StatsRunResult;
    const result = await attachHashes(await writeStatsPacketArtifacts({
      ...parsed,
      binding: binding.binding,
      diagnostics: { ...parsed.diagnostics, preflight: preflight ? summarizeStatsPreflight(preflight) : null },
      issues: [...binding.issues, ...(preflight?.issues ?? []), ...parsed.issues],
      warnings: stderr.trim() ? [...(preflight?.warnings ?? []), ...parsed.warnings, stderr.trim()] : [...(preflight?.warnings ?? []), ...parsed.warnings],
      artifacts: [...preflightArtifacts, ...parsed.artifacts],
    }, request));
    await writeFile(path.join(request.outDir, "stats-run.json"), `${JSON.stringify(result, null, 2)}\n`);
    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const stderr = typeof (error as { stderr?: unknown }).stderr === "string" ? (error as { stderr: string }).stderr : "";
    const failed: StatsRunResult = await writeStatsPacketArtifacts({
      schemaVersion: 1,
      runId: `statsrun_${Date.now()}`,
      method: request.method,
      status: "failed",
      rowCount: 0,
      completeCaseN: 0,
      variables: variablesFor(request),
      binding: binding.binding,
      parameters: {},
      estimates: [],
      diagnostics: {},
      issues: [],
      warnings: preflight?.warnings ?? [],
      errors: [stderr.trim() || message],
      artifacts: [{ kind: "config", path: configPath }, ...preflightArtifacts],
      outDir: request.outDir,
    }, request);
    const hashed = await attachHashes(failed);
    await writeFile(path.join(request.outDir, "stats-run.json"), `${JSON.stringify(hashed, null, 2)}\n`);
    return hashed;
  }
}

interface StatsBinding {
  binding: StatsRunResult["binding"];
  issues: StatsIssue[];
}

async function inspectStatsBinding(request: StatsRunRequest): Promise<StatsBinding> {
  const binding: StatsRunResult["binding"] = {
    methodSelectionPath: request.methodSelectionPath ? path.resolve(request.methodSelectionPath) : null,
    methodSelectionId: null,
    methodId: null,
    analysisSpecPath: request.analysisSpecPath ? path.resolve(request.analysisSpecPath) : null,
    specHash: null,
    status: request.methodSelectionPath || request.analysisSpecPath ? "bound" : "unbound",
  };
  const issues: StatsIssue[] = [];
  if (request.methodSelectionPath) {
    try {
      const raw = JSON.parse(await readFile(path.resolve(request.methodSelectionPath), "utf-8")) as Record<string, unknown>;
      const selection = "methodSelection" in raw ? raw.methodSelection as Record<string, unknown> : raw;
      binding.methodSelectionId = typeof selection.selectionId === "string" ? selection.selectionId : null;
      const primary = selection.primary as { method?: { id?: unknown } } | null | undefined;
      binding.methodId = typeof primary?.method?.id === "string" ? primary.method.id : null;
      const expectedStatsMethod = binding.methodId ? statsRunMethodForAnalysisMethod(binding.methodId) : null;
      if (!binding.methodSelectionId || !binding.methodId) {
        binding.status = "invalid";
        issues.push(issue("blocker", "METHOD_SELECTION_INVALID", "Method-selection artifact is missing selectionId or primary method id.", [request.methodSelectionPath]));
      } else if (expectedStatsMethod !== request.method) {
        binding.status = "mismatch";
        issues.push(issue("blocker", "METHOD_SELECTION_STATS_MISMATCH", `Method selection primary ${binding.methodId} maps to ${expectedStatsMethod ?? "no stats-run method"}, not requested ${request.method}.`, [request.methodSelectionPath]));
      }
    } catch (error) {
      binding.status = "invalid";
      issues.push(issue("blocker", "METHOD_SELECTION_UNREADABLE", error instanceof Error ? error.message : String(error), [request.methodSelectionPath]));
    }
  }
  if (request.analysisSpecPath) {
    try {
      const raw = JSON.parse(await readFile(path.resolve(request.analysisSpecPath), "utf-8")) as Record<string, unknown>;
      const candidate = "analysisSpecV2" in raw ? raw.analysisSpecV2 as Record<string, unknown> : "analysisSpec" in raw ? raw.analysisSpec as Record<string, unknown> : raw;
      binding.specHash = typeof candidate.specHash === "string" ? candidate.specHash : stableHash(candidate);
    } catch (error) {
      binding.status = "invalid";
      issues.push(issue("blocker", "ANALYSIS_SPEC_UNREADABLE", error instanceof Error ? error.message : String(error), [request.analysisSpecPath]));
    }
  }
  return { binding, issues };
}

function issue(severity: StatsIssue["severity"], code: string, message: string, evidenceRefs: string[]): StatsIssue {
  return { severity, code, message, evidenceRefs };
}

type StatsPreflightStatus = "pass" | "warning" | "block";

interface StatsPreflightCheck {
  id: string;
  status: StatsPreflightStatus;
  detail: string;
  evidenceRefs: string[];
  suggestedAction?: string;
}

interface StatsPreflightResult {
  schemaVersion: 1;
  generatedAtIso: string;
  method: StatsRunRequest["method"];
  dataPath: string;
  status: StatsPreflightStatus;
  feasibilityGate: FeasibilityGateResult;
  checks: StatsPreflightCheck[];
  issues: StatsIssue[];
  warnings: string[];
  nextAction: string;
}

export function normalizeStatsRunRequest(rawRequest: StatsRunRequest): StatsRunRequest {
  const parsed = statsRunRequestSchema.parse(rawRequest);
  return { ...parsed, dataPath: path.resolve(parsed.dataPath), outDir: path.resolve(parsed.outDir) };
}

async function buildStatsPreflight(request: StatsRunRequest): Promise<StatsPreflightResult> {
  let gate: FeasibilityGateResult;
  try {
    gate = await researchFeasibilityGateCommand({
      question: statsQuestionFor(request),
      dataPath: request.dataPath,
      method: request.method,
      outcome: request.outcome,
      exposure: request.exposure,
      group: request.group,
      time: request.time,
      event: request.event,
      id: request.id,
      strata: request.strata,
      cluster: request.cluster,
      period: request.period,
      post: request.post,
      runningVariable: request.runningVariable,
      instrument: request.instrument,
      weight: request.weight,
      variables: request.variables,
      covariates: request.covariates,
      exactCovariates: request.exactCovariates,
      surveyDesign: request.surveyDesign,
      allowSurveyApproximation: request.allowSurveyApproximation,
      minRows: minimumRowsFor(request),
      minEvents: minimumEventsFor(request),
      maxMissingness: 0.65,
      python: request.python,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    gate = {
      schemaVersion: 1,
      generatedAtIso: new Date().toISOString(),
      question: statsQuestionFor(request),
      verdict: "reject",
      status: "block",
      score: 0,
      confidence: 0.95,
      readinessLabel: "Data profiling failed",
      primaryAction: "profile_data",
      rowCount: null,
      columnCount: null,
      method: request.method,
      requiredVariables: variablesFor(request),
      variableChecks: [],
      completeCase: { scanned: false, scannedRows: 0, completeRows: null, completeFraction: null, scanReason: "Stats preflight could not summarize the table." },
      outcomeDiagnostics: { outcome: request.outcome ?? request.event ?? null, observedLevels: [], eventCount: null, nonEventCount: null, eventRate: null, usable: null },
      domains: [],
      internalReviews: [],
      blockers: [`Unable to profile data before stats execution: ${message}`],
      warnings: [],
      notes: [],
      clarifyingQuestions: [],
      requiredModifications: ["Fix the data path or runtime used for table profiling before running statistical methods."],
      optionalModifications: [],
      alternativeStudyIdeas: [],
      studyDesignAdvice: {
        recommendedPosture: "reject",
        methodRecommendation: "Run table profiling before method execution.",
        estimandOrDesignWarning: null,
        reviewerRiskSummary: "Stats preflight failed before data suitability could be assessed.",
      },
      evidenceRefs: [request.dataPath],
      nextAction: "Fix data profiling before executing the statistical method.",
      outPath: null,
      reportPath: null,
    };
  }
  const checks = [
    ...preflightGateChecks(gate),
    ...preflightMethodChecks(request, gate),
    ...preflightAlternativeChecks(request, gate),
  ];
  const blockerChecks = checks.filter(check => check.status === "block");
  const warningChecks = checks.filter(check => check.status === "warning");
  const status: StatsPreflightStatus = blockerChecks.length ? "block" : warningChecks.length || gate.status !== "pass" ? "warning" : "pass";
  const issues = checks.flatMap(check => checkToIssue(check));
  const warnings = [
    ...gate.warnings,
    ...warningChecks.map(check => check.detail),
  ];
  return {
    schemaVersion: 1,
    generatedAtIso: new Date().toISOString(),
    method: request.method,
    dataPath: request.dataPath,
    status,
    feasibilityGate: gate,
    checks,
    issues,
    warnings: uniqueStrings(warnings),
    nextAction: blockerChecks[0]?.suggestedAction ?? gate.nextAction,
  };
}

async function writeStatsPreflightArtifacts(preflight: StatsPreflightResult, outDir: string): Promise<StatsArtifact[]> {
  const preflightPath = path.join(outDir, "stats-preflight.json");
  const reportPath = path.join(outDir, "stats-preflight.md");
  await writeFile(preflightPath, `${JSON.stringify({ schemaVersion: 1, statsPreflight: preflight }, null, 2)}\n`, "utf-8");
  await writeFile(reportPath, renderStatsPreflightMarkdown(preflight), "utf-8");
  return [
    { kind: "preflight", path: preflightPath },
    { kind: "preflight-report", path: reportPath },
  ];
}

function preflightGateChecks(gate: FeasibilityGateResult): StatsPreflightCheck[] {
  const checks: StatsPreflightCheck[] = [
    {
      id: "feasibility-gate-verdict",
      status: gate.verdict === "reject" ? "block" : gate.verdict === "formal_analysis_ready" ? "pass" : "warning",
      detail: `Feasibility gate verdict is ${gate.verdict} with score ${gate.score}.`,
      evidenceRefs: gate.evidenceRefs,
      suggestedAction: gate.nextAction,
    },
    {
      id: "data-profile-available",
      status: gate.rowCount === null || gate.columnCount === null ? "block" : "pass",
      detail: gate.rowCount === null || gate.columnCount === null
        ? "Stats execution requires a table profile before running."
        : `Profiled ${gate.rowCount} row(s) and ${gate.columnCount} column(s).`,
      evidenceRefs: gate.evidenceRefs,
      suggestedAction: "Profile or repair the dataset path before executing the method.",
    },
  ];
  if (gate.blockers.length) {
    checks.push({
      id: "feasibility-blockers",
      status: "block",
      detail: gate.blockers.join("; "),
      evidenceRefs: gate.evidenceRefs,
      suggestedAction: gate.requiredModifications[0] ?? gate.nextAction,
    });
  }
  return checks;
}

function preflightMethodChecks(request: StatsRunRequest, gate: FeasibilityGateResult): StatsPreflightCheck[] {
  const checks: StatsPreflightCheck[] = [];
  const completeRows = gate.completeCase.completeRows ?? gate.rowCount ?? 0;
  const variables = variableChecksByName(gate);
  const outcomeName = request.outcome ?? request.event ?? null;
  const outcome = outcomeName ? variables.get(outcomeName) : null;
  const exposure = request.exposure ? variables.get(request.exposure) : null;
  const group = request.group ? variables.get(request.group) : null;
  const requiredMissing = gate.variableChecks.filter(check => check.required && !check.present);
  if (requiredMissing.length) {
    checks.push({
      id: "required-variables-present",
      status: "block",
      detail: `Missing required variable(s): ${requiredMissing.map(check => `${check.role}:${check.name}`).join(", ")}.`,
      evidenceRefs: [request.dataPath],
      suggestedAction: "Map variables to real columns or revise the requested method before execution.",
    });
  }
  checks.push({
    id: "complete-case-count",
    status: completeRows < hardMinimumRowsFor(request) ? "block" : completeRows < minimumRowsFor(request) ? "warning" : "pass",
    detail: `${completeRows} complete-case row(s) available; preferred minimum is ${minimumRowsFor(request)}.`,
    evidenceRefs: [request.dataPath],
    suggestedAction: "Use a simpler/descriptive analysis, broaden eligibility, or repair missingness before inference.",
  });
  if (outcomeName && outcome && !isNumericMethodExempt(request.method) && continuousOutcomeMethods().has(request.method) && outcome.inferredType !== "number") {
    checks.push({
      id: "continuous-outcome-type",
      status: "block",
      detail: `Method ${request.method} requires a numeric/continuous outcome, but ${outcomeName} is ${outcome.inferredType}.`,
      evidenceRefs: [request.dataPath, outcomeName],
      suggestedAction: "Choose a categorical method or map a numeric outcome.",
    });
  }
  if (binaryOutcomeMethods().has(request.method)) {
    const events = gate.outcomeDiagnostics.eventCount;
    const nonEvents = gate.outcomeDiagnostics.nonEventCount;
    if (events === null || nonEvents === null) {
      checks.push({
        id: "binary-outcome-levels",
        status: "block",
        detail: `Method ${request.method} requires a binary outcome/event, but preflight could not verify two binary levels for ${outcomeName ?? "(missing)"}.`,
        evidenceRefs: [request.dataPath, outcomeName ?? "outcome"],
        suggestedAction: "Recode the outcome to 0/1 or choose a method for the observed outcome type.",
      });
    } else if (events < minimumEventsFor(request) || nonEvents < minimumEventsFor(request)) {
      checks.push({
        id: "binary-event-count",
        status: events < hardMinimumEventsFor(request) || nonEvents < hardMinimumEventsFor(request) ? "block" : "warning",
        detail: `Binary outcome has ${events} event(s) and ${nonEvents} non-event(s); preferred minimum per class is ${minimumEventsFor(request)}.`,
        evidenceRefs: [request.dataPath, outcomeName ?? "outcome"],
        suggestedAction: "Broaden the endpoint/horizon, simplify predictors, or use descriptive/exact methods.",
      });
    }
  }
  if (eventDependentMethods().has(request.method)) {
    const events = gate.outcomeDiagnostics.eventCount;
    if (events !== null) {
      const predictors = Math.max(1, uniqueStrings([request.exposure, request.group, ...request.covariates].filter((item): item is string => Boolean(item))).length);
      const epv = events / predictors;
      checks.push({
        id: "events-per-predictor",
        status: epv < 3 ? "block" : epv < 10 ? "warning" : "pass",
        detail: `Approximate events per modeled predictor is ${round(epv, 2)} (${events} events / ${predictors} predictor term groups).`,
        evidenceRefs: [request.dataPath],
        suggestedAction: "Reduce predictors, broaden events, or use penalized/descriptive methods before formal modeling.",
      });
    }
  }
  if (groupRequiredMethods().has(request.method)) {
    const grouping = group ?? exposure;
    const levelCount = grouping?.sampleValues.length ?? 0;
    if (!grouping) {
      checks.push({
        id: "group-variable-present",
        status: "block",
        detail: `${request.method} requires a group/exposure variable.`,
        evidenceRefs: [request.dataPath],
        suggestedAction: "Provide --group or --exposure.",
      });
    } else if (twoGroupMethods().has(request.method) && levelCount > 2) {
      checks.push({
        id: "two-group-method-levels",
        status: "block",
        detail: `${request.method} expects two groups, but ${grouping.name} appears to have ${levelCount} sampled level(s).`,
        evidenceRefs: [request.dataPath, grouping.name],
        suggestedAction: "Use ANOVA/Kruskal-Wallis or collapse to a prespecified binary contrast.",
      });
    } else if ((request.method === "anova" || request.method === "kruskal-wallis") && levelCount < 3) {
      checks.push({
        id: "multi-group-method-levels",
        status: "warning",
        detail: `${request.method} is usually for more than two groups; ${grouping.name} appears to have ${levelCount} sampled level(s).`,
        evidenceRefs: [request.dataPath, grouping.name],
        suggestedAction: "Use a two-sample test if the contrast is binary.",
      });
    }
  }
  if (backendUnavailableMethods().has(request.method)) {
    checks.push({
      id: "method-backend-available",
      status: "block",
      detail: `${request.method} requires a validated backend that is not available in this local stats runner.`,
      evidenceRefs: ["method", request.method],
      suggestedAction: "Route to an R/survival-specialized backend or choose a supported approximation with explicit methods review.",
    });
  }
  if (request.surveyDesign && !request.allowSurveyApproximation) {
    checks.push({
      id: "survey-aware-runner-required",
      status: "block",
      detail: "Complex-survey design was declared but this stats runner is a standard-table runner.",
      evidenceRefs: ["request.surveyDesign"],
      suggestedAction: "Use a survey-aware backend or explicitly mark this run as an exploratory approximation.",
    });
  }
  return checks;
}

function preflightAlternativeChecks(request: StatsRunRequest, gate: FeasibilityGateResult): StatsPreflightCheck[] {
  const checks: StatsPreflightCheck[] = [];
  if (request.method === "chi-square") {
    const hasSparseWarning = gate.warnings.some(warning => /sparse|cell/i.test(warning));
    if (hasSparseWarning) {
      checks.push({
        id: "alternative-exact-test",
        status: "warning",
        detail: "Sparse categorical cells may make Fisher exact or suppressed descriptive reporting more appropriate than chi-square.",
        evidenceRefs: [request.dataPath],
        suggestedAction: "Review cell counts and prefer Fisher exact for a 2x2 sparse table.",
      });
    }
  }
  if ((request.method === "t-test" || request.method === "welch-t-test") && gate.completeCase.completeRows !== null && gate.completeCase.completeRows < 40) {
    checks.push({
      id: "alternative-nonparametric-test",
      status: "warning",
      detail: "Small complete-case count for a mean-comparison test; Mann-Whitney or exact/permutation review may be more robust.",
      evidenceRefs: [request.dataPath],
      suggestedAction: "Review distribution plots and consider a rank-based or resampling method.",
    });
  }
  if (request.method.includes("regression") && request.covariates.length > 12) {
    checks.push({
      id: "high-dimensional-model-review",
      status: "warning",
      detail: `Model includes ${request.covariates.length} covariates; collinearity, overfitting, and multiplicity diagnostics are mandatory.`,
      evidenceRefs: [request.dataPath],
      suggestedAction: "Run model-diagnostics, VIF/collinearity review, and sensitivity analyses.",
    });
  }
  return checks;
}

function checkToIssue(check: StatsPreflightCheck): StatsIssue[] {
  if (check.status === "pass") return [];
  const severity: StatsIssue["severity"] = check.status === "block" ? "blocker" : "warning";
  return [issue(severity, issueCodeForCheck(check.id), check.detail, check.evidenceRefs)];
}

function issueCodeForCheck(id: string): string {
  const explicit: Record<string, string> = {
    "method-backend-available": "METHOD_BACKEND_NOT_AVAILABLE",
    "survey-aware-runner-required": "SURVEY_DESIGN_REQUIRES_SURVEY_RUNNER",
    "binary-outcome-levels": "STATS_BINARY_OUTCOME_INVALID",
    "binary-event-count": "STATS_BINARY_EVENT_COUNT_LOW",
    "events-per-predictor": "STATS_EVENTS_PER_PREDICTOR_LOW",
    "complete-case-count": "STATS_COMPLETE_CASE_TOO_SMALL",
    "required-variables-present": "STATS_REQUIRED_VARIABLE_MISSING",
    "continuous-outcome-type": "STATS_NON_NUMERIC_OUTCOME",
  };
  return explicit[id] ?? `STATS_PREFLIGHT_${id.toUpperCase().replaceAll("-", "_")}`;
}

function summarizeStatsPreflight(preflight: StatsPreflightResult): Record<string, unknown> {
  return {
    status: preflight.status,
    verdict: preflight.feasibilityGate.verdict,
    score: preflight.feasibilityGate.score,
    confidence: preflight.feasibilityGate.confidence,
    rowCount: preflight.feasibilityGate.rowCount,
    completeCaseN: preflight.feasibilityGate.completeCase.completeRows,
    checks: preflight.checks.map(check => ({ id: check.id, status: check.status, detail: check.detail })),
    nextAction: preflight.nextAction,
  };
}

function renderStatsPreflightMarkdown(preflight: StatsPreflightResult): string {
  return [
    "# Stats Preflight Reliability Gate",
    "",
    `Method: ${preflight.method}`,
    `Status: ${preflight.status}`,
    `Feasibility verdict: ${preflight.feasibilityGate.verdict}`,
    `Feasibility score: ${preflight.feasibilityGate.score}`,
    `Rows: ${preflight.feasibilityGate.rowCount ?? "unknown"}`,
    `Complete-case rows: ${preflight.feasibilityGate.completeCase.completeRows ?? "unknown"}`,
    `Next action: ${preflight.nextAction}`,
    "",
    "## Checks",
    "",
    ...preflight.checks.map(check => `- [${check.status}] ${check.id}: ${check.detail}${check.suggestedAction ? ` Action: ${check.suggestedAction}` : ""}`),
    "",
    "## Feasibility Detail",
    "",
    renderResearchFeasibilityGateMarkdown(preflight.feasibilityGate),
    "",
    "## Machine-Readable Feasibility JSON",
    "",
    "The companion stats-preflight.json file includes the full feasibility gate, reliability checks, issue codes, and evidence references.",
  ].join("\n");
}

function statsQuestionFor(request: StatsRunRequest): string {
  const parts = [
    `Run ${request.method}`,
    request.outcome ? `outcome=${request.outcome}` : null,
    request.exposure ? `exposure=${request.exposure}` : null,
    request.group ? `group=${request.group}` : null,
    request.time ? `time=${request.time}` : null,
    request.event ? `event=${request.event}` : null,
  ].filter(Boolean);
  return `${parts.join("; ")}.`;
}

function variableChecksByName(gate: FeasibilityGateResult): Map<string, FeasibilityGateResult["variableChecks"][number]> {
  return new Map(gate.variableChecks.map(check => [check.name, check]));
}

function minimumRowsFor(request: StatsRunRequest): number {
  if (request.method === "descriptive" || request.method === "missingness-summary") return 10;
  if (request.method === "fisher-exact" || request.method === "mcnemar" || request.method === "diagnostic-accuracy") return 10;
  if (eventDependentMethods().has(request.method) || request.method.includes("regression") || request.method.includes("glm")) return Math.max(50, (uniqueStrings([request.exposure, request.group, ...request.covariates].filter((item): item is string => Boolean(item))).length + 1) * 20);
  return 30;
}

function hardMinimumRowsFor(request: StatsRunRequest): number {
  if (request.method === "descriptive" || request.method === "missingness-summary") return 3;
  if (request.method === "fisher-exact" || request.method === "mcnemar") return 6;
  return Math.min(25, Math.max(8, Math.floor(minimumRowsFor(request) / 3)));
}

function minimumEventsFor(request: StatsRunRequest): number {
  const predictors = uniqueStrings([request.exposure, request.group, ...request.covariates].filter((item): item is string => Boolean(item))).length;
  if (request.method === "diagnostic-accuracy") return 6;
  if (eventDependentMethods().has(request.method) || binaryOutcomeMethods().has(request.method)) return Math.max(10, predictors * 10, 10);
  return 10;
}

function hardMinimumEventsFor(request: StatsRunRequest): number {
  return request.method === "prediction-evaluation" ? 5 : 3;
}

function eventDependentMethods(): Set<StatsRunRequest["method"]> {
  return new Set(["kaplan-meier", "log-rank", "cox-proportional-hazards", "stratified-cox", "time-varying-cox", "fine-gray", "aalen-johansen-cif", "recurrent-event-rate"]);
}

function binaryOutcomeMethods(): Set<StatsRunRequest["method"]> {
  return new Set(["logistic-regression", "penalized-logistic-regression", "prediction-evaluation"]);
}

function continuousOutcomeMethods(): Set<StatsRunRequest["method"]> {
  return new Set(["t-test", "paired-t-test", "welch-t-test", "anova", "ancova", "mann-whitney", "wilcoxon", "kruskal-wallis", "friedman", "pearson", "spearman", "kendall", "partial-correlation", "linear-regression", "robust-linear-regression", "gamma-glm", "inverse-gaussian-glm", "quantile-regression", "penalized-linear-regression", "linear-mixed-model", "gee", "repeated-measures-anova"]);
}

function groupRequiredMethods(): Set<StatsRunRequest["method"]> {
  return new Set(["t-test", "paired-t-test", "welch-t-test", "anova", "ancova", "mann-whitney", "wilcoxon", "kruskal-wallis", "friedman", "chi-square", "fisher-exact", "mcnemar", "cochran-armitage-trend", "log-rank"]);
}

function twoGroupMethods(): Set<StatsRunRequest["method"]> {
  return new Set(["t-test", "paired-t-test", "welch-t-test", "mann-whitney", "wilcoxon", "fisher-exact", "mcnemar"]);
}

function backendUnavailableMethods(): Set<StatsRunRequest["method"]> {
  return new Set(["fine-gray", "time-varying-cox", "generalized-mixed-model"]);
}

function isNumericMethodExempt(method: StatsRunRequest["method"]): boolean {
  return ["chi-square", "fisher-exact", "mcnemar", "cochran-armitage-trend", "logistic-regression", "ordinal-logistic-regression", "multinomial-logistic-regression", "penalized-logistic-regression", "prediction-evaluation", "diagnostic-accuracy"].includes(method);
}

function uniqueStrings(items: string[]): string[] {
  return [...new Set(items)];
}

function round(value: number, digits = 4): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

async function attachHashes(result: StatsRunResult): Promise<StatsRunResult> {
  const artifacts: StatsArtifact[] = [];
  for (const artifact of result.artifacts) {
    try {
      const raw = await readFile(artifact.path);
      artifacts.push({ ...artifact, sha256: createHash("sha256").update(raw).digest("hex") });
    } catch {
      artifacts.push(artifact);
    }
  }
  return { ...result, artifacts };
}

async function writeStatsPacketArtifacts(result: StatsRunResult, request: StatsRunRequest): Promise<StatsRunResult> {
  const reportPath = path.join(request.outDir, "stats-report.md");
  const qaPath = path.join(request.outDir, "stats-qa.json");
  await mkdir(request.outDir, { recursive: true });
  let augmentedResult = result;
  const figureManifest = result.artifacts.find(artifact => artifact.kind === "figure-manifest");
  if (figureManifest?.path) {
    try {
      const figureQa = await buildFigureQa({ manifestPath: figureManifest.path });
      const figureQaPath = path.join(request.outDir, "figure-qa.json");
      await writeFile(figureQaPath, `${JSON.stringify(figureQa, null, 2)}\n`, "utf-8");
      const figureQaIssue = figureQa.status === "fail"
        ? issue("blocker", "FIGURE_QA_FAILED", figureQa.summary, [figureQaPath])
        : figureQa.status === "warning"
          ? issue("warning", "FIGURE_QA_WARNING", figureQa.summary, [figureQaPath])
          : null;
      augmentedResult = {
        ...augmentedResult,
        issues: figureQaIssue ? [...augmentedResult.issues, figureQaIssue] : augmentedResult.issues,
        artifacts: [...augmentedResult.artifacts, { kind: "figure-qa", path: figureQaPath }],
      };
    } catch (error) {
      augmentedResult = {
        ...augmentedResult,
        issues: [
          ...augmentedResult.issues,
          issue("blocker", "FIGURE_QA_UNREADABLE", error instanceof Error ? error.message : String(error), [figureManifest.path]),
        ],
      };
    }
  }
  const resultWithPosture: StatsRunResult = { ...augmentedResult, resultPosture: deriveStatsResultPosture(augmentedResult, request) };
  const qa = statsQa(resultWithPosture);
  await writeFile(reportPath, renderStatsReport(resultWithPosture, request, qa), "utf-8");
  await writeFile(qaPath, `${JSON.stringify(qa, null, 2)}\n`, "utf-8");
  const existingKinds = new Set(resultWithPosture.artifacts.map(artifact => `${artifact.kind}:${artifact.path}`));
  const artifacts = [...resultWithPosture.artifacts];
  for (const artifact of [
    { kind: "report" as const, path: reportPath },
    { kind: "qa" as const, path: qaPath },
  ]) {
    if (!existingKinds.has(`${artifact.kind}:${artifact.path}`)) artifacts.push(artifact);
  }
  return { ...resultWithPosture, artifacts };
}

function statsQa(result: StatsRunResult): {
  schemaVersion: 1;
  status: "pass" | "warning" | "fail";
  summary: string;
  checks: Array<{ id: string; status: "pass" | "warning" | "fail"; detail: string }>;
} {
  const blockerIssues = result.issues.filter(issue => issue.severity === "blocker");
  const warningIssues = result.issues.filter(issue => issue.severity === "warning");
  const checks = [
    {
      id: "execution-status",
      status: result.status === "succeeded" ? "pass" as const : "fail" as const,
      detail: result.status === "succeeded" ? "Stats runner completed." : `Stats runner failed: ${result.errors.join("; ") || "unknown error"}`,
    },
    {
      id: "effect-estimate-table",
      status: result.estimates.length > 0 ? "pass" as const : result.status === "failed" ? "fail" as const : "warning" as const,
      detail: result.estimates.length > 0 ? `${result.estimates.length} estimate row(s) produced.` : "No estimate rows were produced.",
    },
    {
      id: "uncertainty-and-pvalue-context",
      status: result.estimates.some(row => "p_value" in row || "ci_low" in row || "ci_high" in row) ? "pass" as const : "warning" as const,
      detail: "Report includes ASA-style caution that p-values are not effect size or practical importance.",
    },
    {
      id: "binding-status",
      status: result.binding.status === "bound" ? "pass" as const : result.binding.status === "unbound" ? "warning" as const : "fail" as const,
      detail: `Stats run binding is ${result.binding.status}.`,
    },
    {
      id: "preflight-reliability-gate",
      status: preflightQaStatus(result),
      detail: preflightQaDetail(result),
    },
    {
      id: "standard-table-boundary",
      status: result.issues.some(issue => issue.code === "SURVEY_DESIGN_REQUIRES_SURVEY_RUNNER") ? "fail" as const : result.issues.some(issue => issue.code === "SURVEY_APPROXIMATION_EXPLICIT") ? "warning" as const : "pass" as const,
      detail: "Standard-table runner is not a complex-survey variance engine.",
    },
    {
      id: "method-backend-availability",
      status: result.issues.some(issue => issue.code === "METHOD_BACKEND_NOT_AVAILABLE" || issue.code === "GLMM_BACKEND_NOT_AVAILABLE") ? "fail" as const : "pass" as const,
      detail: result.issues.some(issue => issue.code === "METHOD_BACKEND_NOT_AVAILABLE" || issue.code === "GLMM_BACKEND_NOT_AVAILABLE")
        ? "Requested method needs a backend that is not available in this local runtime."
        : "No missing-backend blocker was reported.",
    },
    {
      id: "figure-manifest",
      status: result.artifacts.some(artifact => artifact.kind === "figure-manifest") ? "pass" as const : "warning" as const,
      detail: result.artifacts.some(artifact => artifact.kind === "figure-manifest")
        ? `${result.artifacts.filter(artifact => artifact.kind === "figure").length} rendered figure artifact(s) recorded.`
        : "Figure manifest is missing; generated outputs are harder to inspect visually.",
    },
    {
      id: "figure-quality",
      status: !result.artifacts.some(artifact => artifact.kind === "figure-manifest")
        ? "warning" as const
        : result.issues.some(issue => issue.code === "FIGURE_QA_FAILED" || issue.code === "FIGURE_QA_UNREADABLE")
          ? "fail" as const
          : result.artifacts.some(artifact => artifact.kind === "figure-qa")
            ? result.issues.some(issue => issue.code === "FIGURE_QA_WARNING") ? "warning" as const : "pass" as const
            : "fail" as const,
      detail: result.artifacts.some(artifact => artifact.kind === "figure-qa")
        ? "Rendered figures were inspected for readability, dimensions, blankness, captions, alt text, and source columns."
        : "Figure QA artifact is missing.",
    },
    {
      id: "result-posture",
      status: !result.resultPosture
        ? "fail" as const
        : result.resultPosture.status === "failed" || result.resultPosture.status === "blocked_survey_required" || result.resultPosture.status === "invalid_binding"
          ? "fail" as const
          : result.resultPosture.status === "exploratory_survey_approximation" || result.resultPosture.status === "exploratory_standard_table"
            ? "warning" as const
            : "pass" as const,
      detail: result.resultPosture
        ? `${result.resultPosture.status}: ${result.resultPosture.interpretationBoundary}`
        : "Stats run did not declare an interpretation posture.",
    },
    ...diagnosticAccuracyQaChecks(result),
    ...propensityQaChecks(result),
    ...coreInferenceQaChecks(result),
    ...missingnessQaChecks(result),
    ...causalQaChecks(result),
    ...predictionQaChecks(result),
    ...measurementAndExplorationQaChecks(result),
    ...modelReliabilityQaChecks(result),
  ];
  const status = result.status === "failed" || blockerIssues.length > 0 || checks.some(check => check.status === "fail")
    ? "fail"
    : warningIssues.length > 0 || result.warnings.length > 0 || checks.some(check => check.status === "warning")
      ? "warning"
      : "pass";
  return {
    schemaVersion: 1,
    status,
    summary: `${checks.filter(check => check.status === "pass").length}/${checks.length} stats QA checks passed; status=${status}.`,
    checks,
  };
}

function deriveStatsResultPosture(result: StatsRunResult, request: StatsRunRequest): StatsResultPosture {
  const issueCodes = new Set(result.issues.map(issue => issue.code));
  if (issueCodes.has("STATS_PREFLIGHT_FEASIBILITY_BLOCKERS") || issueCodes.has("STATS_REQUIRED_VARIABLE_MISSING") || issueCodes.has("STATS_BINARY_OUTCOME_INVALID") || issueCodes.has("STATS_NON_NUMERIC_OUTCOME") || issueCodes.has("STATS_COMPLETE_CASE_TOO_SMALL")) {
    return {
      status: "failed",
      label: "Blocked: data/method preflight failed",
      interpretationBoundary: "This run cannot be interpreted because the requested statistical method was not compatible with the profiled data.",
      supports: ["pre-run failure attribution", "method redesign", "data repair planning"],
      cannotSupport: ["effect estimates", "p-values", "paper-ready inference"],
      nextAction: "Resolve stats-preflight blockers, revise the method, or choose an exploratory/descriptive analysis before execution.",
    };
  }
  if (issueCodes.has("SURVEY_DESIGN_REQUIRES_SURVEY_RUNNER")) {
    return {
      status: "blocked_survey_required",
      label: "Blocked: survey-aware runner required",
      interpretationBoundary: "This run cannot support inferential research claims because complex-survey variance was declared but not executed.",
      supports: ["failure attribution", "runner routing decision"],
      cannotSupport: ["effect estimates", "confidence intervals", "p-values", "paper-ready inference"],
      nextAction: "Run a survey-aware backend such as paper-run --backend r-survey, or explicitly mark any approximation as exploratory.",
    };
  }
  if (result.binding.status === "invalid" || result.binding.status === "mismatch") {
    return {
      status: "invalid_binding",
      label: "Blocked: method binding invalid",
      interpretationBoundary: "This run cannot be interpreted because the executable method does not match or cannot read the selected method/spec evidence.",
      supports: ["binding failure diagnosis", "repair planning"],
      cannotSupport: ["method-governed estimates", "paper-ready inference"],
      nextAction: "Repair the method-selection or AnalysisSpec binding and rerun before reviewing estimates.",
    };
  }
  if (result.status === "failed" || result.issues.some(issue => issue.severity === "blocker")) {
    return {
      status: "failed",
      label: "Failed execution",
      interpretationBoundary: "This run failed before producing a locally reviewable statistical result.",
      supports: ["failure attribution", "repair planning"],
      cannotSupport: ["effect estimates", "confidence intervals", "p-values", "paper-ready inference"],
      nextAction: "Resolve blocker issues and rerun the stats method.",
    };
  }
  if (issueCodes.has("SURVEY_APPROXIMATION_EXPLICIT")) {
    return {
      status: "exploratory_survey_approximation",
      label: "Exploratory survey approximation",
      interpretationBoundary: "This run may support local debugging and directional exploration, but not survey-valid inference.",
      supports: ["local debugging", "rough descriptive direction", "artifact smoke testing"],
      cannotSupport: ["complex-survey confidence intervals", "complex-survey p-values", "paper-ready inference"],
      nextAction: "Use this only to debug data/model shape; rerun with a survey-aware backend for methods review.",
    };
  }
  if (request.method === "propensity-score-matching" || request.method === "propensity-score-weighting") {
    return {
      status: "causal_design_review_required",
      label: "Causal design review required",
      interpretationBoundary: "This run produces propensity-score balance and treatment-contrast artifacts for local causal-design review; it does not by itself establish a causal effect.",
      supports: ["propensity score diagnostics", "balance review", "overlap/positivity review", "local treatment-contrast estimation under declared assumptions"],
      cannotSupport: ["causal claims without target-trial/DAG review", "unmeasured-confounding control", "clinical recommendations", "external validity"],
      nextAction: "Review the target trial, confounding set, positivity, balance, missingness, and sensitivity plan before using causal language.",
    };
  }
  if (result.binding.status === "bound") {
    return {
      status: "bound_standard_table",
      label: "Bound standard-table result",
      interpretationBoundary: "This run is bound to method/spec evidence and can support local methods review for non-survey standard-table analyses.",
      supports: ["method-bound estimates", "standard-table diagnostics", "local methods review"],
      cannotSupport: request.surveyDesign
        ? ["complex-survey inference", "causal claims without design support", "clinical recommendations"]
        : ["causal claims without design support", "clinical recommendations"],
      nextAction: "Review diagnostics, missingness, and claim language before packet promotion.",
    };
  }
  return {
    status: "exploratory_standard_table",
    label: "Exploratory standard-table result",
    interpretationBoundary: "This run is not bound to a method-selection artifact or AnalysisSpec, so treat it as exploratory until governed by pre-run evidence.",
    supports: ["local data debugging", "rough statistical exploration", "candidate method smoke testing"],
    cannotSupport: ["method-governed inference", "paper-ready conclusions", "causal claims"],
    nextAction: "Create or bind method-selection and AnalysisSpec evidence, then rerun before paper lifecycle promotion.",
  };
}

function renderStatsReport(result: StatsRunResult, request: StatsRunRequest, qa: ReturnType<typeof statsQa>): string {
  const table = renderEstimateTable(result);
  const diagnosticSection = renderDiagnosticAccuracySection(result, request);
  const propensitySection = renderPropensitySection(result, request);
  const preflightSection = renderPreflightSection(result);
  return [
    `# Stats Run Report`,
    "",
    "## Local Review Safety Header",
    "",
    "- This is a standard-table statistical run, not proof of causal effect or clinical validity.",
    "- Interpret estimates with uncertainty, diagnostics, data quality, and study design context.",
    "- P-values are reported as compatibility measures under a model; they are not effect sizes or practical importance.",
    `- Binding status: ${result.binding.status}.`,
    `- Result posture: ${result.resultPosture?.status ?? "missing"} (${result.resultPosture?.label ?? "no posture declared"}).`,
    `- Interpretation boundary: ${result.resultPosture?.interpretationBoundary ?? "No interpretation boundary declared."}`,
    request.surveyDesign
      ? request.allowSurveyApproximation
        ? "- Complex survey design was declared, but this run was explicitly allowed as exploratory standard-table approximation."
        : "- Complex survey design was declared; use a survey-aware runner for inferential claims."
      : "- No complex survey design was declared for this standard-table run.",
    "",
    "## Methods",
    "",
    `- Method: ${result.method}`,
    `- Rows: ${result.rowCount}`,
    `- Complete-case N: ${result.completeCaseN}`,
    `- Variables: ${result.variables.join(", ") || "(none)"}`,
    `- Weight: ${request.weight ?? "(none)"}`,
    `- Supports: ${result.resultPosture?.supports.join("; ") ?? "(not declared)"}`,
    `- Cannot support: ${result.resultPosture?.cannotSupport.join("; ") ?? "(not declared)"}`,
    `- Next action: ${result.resultPosture?.nextAction ?? "Declare result posture and rerun."}`,
    "",
    ...preflightSection,
    "",
    "## Results",
    "",
    table,
    ...diagnosticSection,
    ...propensitySection,
    "",
    "## Diagnostics And QA",
    "",
    `- Stats QA: ${qa.status} (${qa.summary})`,
    `- Issues: ${result.issues.map(issue => issue.code).join(", ") || "(none)"}`,
    `- Warnings: ${result.warnings.join("; ") || "(none)"}`,
    `- Errors: ${result.errors.join("; ") || "(none)"}`,
    "",
    "## References",
    "",
    "- American Statistical Association. Statement on Statistical Significance and P-Values. 2016.",
    "- ASA President's Task Force Statement on Statistical Significance and Replicability. 2021.",
    ...(result.method === "diagnostic-accuracy"
      ? [
          "- STARD 2015 diagnostic accuracy reporting guideline.",
          "- STARD-AI 2025 reporting guideline for AI-centered diagnostic accuracy studies.",
        ]
      : []),
    ...(result.method === "propensity-score-matching" || result.method === "propensity-score-weighting"
      ? [
          "- Austin PC. An Introduction to Propensity Score Methods for Reducing the Effects of Confounding in Observational Studies. Multivariate Behavioral Research. 2011.",
          "- Austin PC. Balance diagnostics for comparing the distribution of baseline covariates between treatment groups in propensity-score matched samples. Statistics in Medicine. 2009.",
          "- MatchIt and cobalt documentation informed the balance-table and Love-plot-style standardized mean-difference artifact conventions.",
        ]
      : []),
  ].join("\n");
}

function diagnosticAccuracyQaChecks(result: StatsRunResult): Array<{ id: string; status: "pass" | "warning" | "fail"; detail: string }> {
  if (result.method !== "diagnostic-accuracy") return [];
  const first = result.estimates[0] ?? {};
  const diagnostics = result.diagnostics as Record<string, unknown>;
  const confusionMatrix = diagnostics.confusion_matrix as Record<string, unknown> | undefined;
  const hasRoles = result.variables.length >= 2
    && typeof diagnostics.reference_positive_level !== "undefined"
    && typeof diagnostics.test_positive_level !== "undefined";
  const hasPredictiveValues = typeof first.positive_predictive_value === "number"
    && typeof first.negative_predictive_value === "number"
    && typeof first.prevalence === "number";
  const hasAccuracyCore = typeof first.sensitivity === "number"
    && typeof first.specificity === "number"
    && Boolean(confusionMatrix);
  const hasIntervals = typeof first.sensitivity_ci_low === "number"
    && typeof first.sensitivity_ci_high === "number"
    && typeof first.specificity_ci_low === "number"
    && typeof first.specificity_ci_high === "number"
    && typeof first.positive_predictive_value_ci_low === "number"
    && typeof first.negative_predictive_value_ci_low === "number";
  const sparse = result.issues.some(issue => issue.code === "SPARSE_DIAGNOSTIC_CELL");
  return [
    {
      id: "diagnostic-reference-index-roles",
      status: hasRoles ? "pass" : "fail",
      detail: hasRoles
        ? "Diagnostic run records reference-standard and index-test roles through variables and level metadata."
        : "Diagnostic accuracy requires explicit reference-standard and index-test roles.",
    },
    {
      id: "diagnostic-core-metrics",
      status: hasAccuracyCore ? "pass" : "fail",
      detail: hasAccuracyCore
        ? "Confusion matrix, sensitivity, and specificity are available."
        : "Diagnostic accuracy output is missing confusion matrix, sensitivity, or specificity.",
    },
    {
      id: "diagnostic-predictive-value-context",
      status: hasPredictiveValues ? "pass" : "fail",
      detail: hasPredictiveValues
        ? "PPV/NPV are paired with prevalence so the report can state their sample-prevalence dependence."
        : "PPV/NPV require a prevalence context before local review.",
    },
    {
      id: "diagnostic-screening-overclaim-boundary",
      status: "pass",
      detail: "Generated diagnostic reports state that local accuracy estimates do not justify clinical screening recommendations or deployment.",
    },
    {
      id: "diagnostic-precision-caveat",
      status: hasIntervals ? "pass" : "warning",
      detail: hasIntervals
        ? "Wilson binomial intervals are available for sensitivity, specificity, PPV, and NPV."
        : "Accuracy estimates are point estimates; add exact/binomial or bootstrap intervals before publication-grade diagnostic claims.",
    },
    {
      id: "diagnostic-sparse-cell-policy",
      status: sparse ? "warning" : "pass",
      detail: sparse
        ? "At least one diagnostic cell is sparse; diagnostic metrics may be unstable."
        : "No sparse diagnostic cell warning was emitted.",
    },
  ];
}

function preflightQaStatus(result: StatsRunResult): "pass" | "warning" | "fail" {
  const hasPreflightArtifact = result.artifacts.some(artifact => artifact.kind === "preflight");
  const preflight = preflightSummaryFromResult(result);
  if (!hasPreflightArtifact || !preflight) return "fail";
  if (preflight.status === "block") return "fail";
  if (preflight.status === "warning") return "warning";
  return "pass";
}

function preflightQaDetail(result: StatsRunResult): string {
  const preflight = preflightSummaryFromResult(result);
  if (!result.artifacts.some(artifact => artifact.kind === "preflight")) return "Stats preflight artifact is missing.";
  if (!preflight) return "Stats preflight summary is missing from diagnostics.";
  return `Stats preflight status=${preflight.status}, verdict=${preflight.verdict}, score=${preflight.score}, completeCaseN=${preflight.completeCaseN ?? "unknown"}.`;
}

function preflightSummaryFromResult(result: StatsRunResult): Record<string, unknown> | null {
  const diagnostics = result.diagnostics as Record<string, unknown>;
  return diagnostics.preflight && typeof diagnostics.preflight === "object"
    ? diagnostics.preflight as Record<string, unknown>
    : null;
}

function renderPreflightSection(result: StatsRunResult): string[] {
  const preflight = preflightSummaryFromResult(result);
  const checks = Array.isArray(preflight?.checks) ? preflight.checks as Array<Record<string, unknown>> : [];
  return [
    "## Preflight Reliability",
    "",
    preflight
      ? `- Status: ${cell(preflight.status)}; verdict: ${cell(preflight.verdict)}; score: ${cell(preflight.score)}; complete-case N: ${cell(preflight.completeCaseN)}.`
      : "- No preflight summary was recorded.",
    preflight?.nextAction ? `- Next action: ${cell(preflight.nextAction)}` : "- Next action: rerun with stats preflight evidence.",
    ...checks.slice(0, 8).map(check => `- [${cell(check.status)}] ${cell(check.id)}: ${cell(check.detail)}`),
  ];
}

function propensityQaChecks(result: StatsRunResult): Array<{ id: string; status: "pass" | "warning" | "fail"; detail: string }> {
  if (result.method !== "propensity-score-matching" && result.method !== "propensity-score-weighting") return [];
  const diagnostics = result.diagnostics as Record<string, unknown>;
  const balance = diagnostics.balance as Record<string, unknown> | undefined;
  const positivity = diagnostics.positivity as Record<string, unknown> | undefined;
  const matching = diagnostics.matching as Record<string, unknown> | undefined;
  const weighting = diagnostics.weighting as Record<string, unknown> | undefined;
  const missingness = diagnostics.missingness as Record<string, unknown> | undefined;
  const maxAfter = typeof balance?.max_abs_smd_after === "number" ? balance.max_abs_smd_after : null;
  const maxBefore = typeof balance?.max_abs_smd_before === "number" ? balance.max_abs_smd_before : null;
  const afterImbalanced = typeof balance?.covariates_over_0_1_after === "number" ? balance.covariates_over_0_1_after : null;
  const commonSupportFraction = typeof positivity?.common_support_fraction === "number" ? positivity.common_support_fraction : null;
  const unmatchedTreated = typeof matching?.unmatched_treated === "number" ? matching.unmatched_treated : 0;
  const effectiveN = typeof weighting?.effective_sample_size === "number" ? weighting.effective_sample_size : null;
  const completeN = result.completeCaseN || 0;
  return [
    {
      id: "propensity-treatment-model",
      status: typeof diagnostics.propensity_model === "object" ? "pass" : "fail",
      detail: typeof diagnostics.propensity_model === "object"
        ? "Propensity scores were estimated and recorded with model diagnostics."
        : "Propensity methods require a recorded treatment model.",
    },
    {
      id: "propensity-balance",
      status: maxAfter === null ? "fail" : maxAfter <= 0.1 && afterImbalanced === 0 ? "pass" : "warning",
      detail: maxAfter === null
        ? "No post-adjustment standardized mean difference diagnostics were recorded."
        : `Maximum absolute SMD changed from ${maxBefore?.toFixed(3) ?? "unknown"} to ${maxAfter.toFixed(3)}; ${afterImbalanced ?? "unknown"} covariate term(s) remain above 0.10.`,
    },
    {
      id: "propensity-positivity-overlap",
      status: commonSupportFraction === null ? "fail" : commonSupportFraction >= 0.9 ? "pass" : commonSupportFraction >= 0.75 ? "warning" : "fail",
      detail: commonSupportFraction === null
        ? "No common-support/overlap diagnostic was recorded."
        : `${(commonSupportFraction * 100).toFixed(1)}% of complete cases lie inside the observed cross-arm propensity support.`,
    },
    {
      id: "propensity-unmatched-treated",
      status: result.method !== "propensity-score-matching" ? "pass" : unmatchedTreated === 0 ? "pass" : "warning",
      detail: result.method !== "propensity-score-matching"
        ? "Not applicable to weighting."
        : `${unmatchedTreated} treated row(s) were unmatched under the declared caliper and exact-match policy.`,
    },
    {
      id: "propensity-effective-sample-size",
      status: effectiveN === null ? "pass" : effectiveN >= completeN * 0.5 ? "pass" : effectiveN >= completeN * 0.25 ? "warning" : "fail",
      detail: effectiveN === null
        ? "Not applicable or not recorded for this method."
        : `Weighted effective sample size is ${effectiveN.toFixed(1)} of ${completeN} complete cases.`,
    },
    {
      id: "propensity-complete-case-retention",
      status: typeof missingness?.complete_case_fraction !== "number" ? "fail" : missingness.complete_case_fraction >= 0.8 ? "pass" : missingness.complete_case_fraction >= 0.6 ? "warning" : "fail",
      detail: typeof missingness?.complete_case_fraction !== "number"
        ? "No missingness/complete-case retention diagnostic was recorded."
        : `${(missingness.complete_case_fraction * 100).toFixed(1)}% of rows were retained after requiring treatment, outcome, and propensity covariates.`,
    },
    {
      id: "propensity-causal-claim-boundary",
      status: "pass",
      detail: "The result posture requires target-trial, DAG/confounder, positivity, missingness, and sensitivity review before causal claims.",
    },
  ];
}

function modelReliabilityQaChecks(result: StatsRunResult): Array<{ id: string; status: "pass" | "warning" | "fail"; detail: string }> {
  if (regressionFamilyMethods().has(result.method)) return regressionReliabilityQaChecks(result);
  if (survivalFamilyMethods().has(result.method)) return survivalReliabilityQaChecks(result);
  if (longitudinalFamilyMethods().has(result.method)) return longitudinalReliabilityQaChecks(result);
  return [];
}

function missingnessQaChecks(result: StatsRunResult): Array<{ id: string; status: "pass" | "warning" | "fail"; detail: string }> {
  if (!missingnessMethods().has(result.method)) return [];
  const diagnostics = result.diagnostics as Record<string, unknown>;
  const maxMissing = numericDiagnostic(diagnostics, "max_missing_fraction");
  const completeCaseFraction = numericDiagnostic(diagnostics, "complete_case_fraction");
  const mechanismScreen = diagnostics.mechanism_screen as Record<string, unknown> | undefined;
  const checks: Array<{ id: string; status: "pass" | "warning" | "fail"; detail: string }> = [
    {
      id: "missingness-profile-present",
      status: diagnostics.missingness_pattern_count || diagnostics.missingness_patterns_path ? "pass" : "fail",
      detail: diagnostics.missingness_patterns_path
        ? "Missingness pattern artifact was recorded."
        : "Missingness pattern evidence is missing.",
    },
    {
      id: "missingness-complete-case-retention",
      status: completeCaseFraction === null ? "warning" : completeCaseFraction >= 0.8 ? "pass" : completeCaseFraction >= 0.6 ? "warning" : "fail",
      detail: completeCaseFraction === null
        ? "Complete-case retention fraction is missing."
        : `${(completeCaseFraction * 100).toFixed(1)}% of rows remain complete across selected variables.`,
    },
    {
      id: "missingness-variable-burden",
      status: maxMissing === null ? "warning" : maxMissing <= 0.2 ? "pass" : maxMissing <= 0.5 ? "warning" : "fail",
      detail: maxMissing === null
        ? "Maximum variable-level missingness is missing."
        : `Maximum selected-variable missingness is ${(maxMissing * 100).toFixed(1)}%.`,
    },
    {
      id: "missingness-mechanism-screen",
      status: !mechanismScreen ? "warning" : Number(mechanismScreen.associations_below_0_05 ?? 0) > 0 ? "warning" : "pass",
      detail: !mechanismScreen
        ? "Missingness mechanism association screen is missing."
        : `${mechanismScreen.associations_below_0_05 ?? 0} missingness association(s) had p<0.05; this is a screen, not proof of MAR/MNAR.`,
    },
  ];
  if (result.method === "multiple-imputation-mice") {
    const metadata = diagnostics.imputation_metadata as Record<string, unknown> | undefined;
    checks.push({
      id: "imputation-artifact-present",
      status: diagnostics.imputed_data ? "pass" : "fail",
      detail: diagnostics.imputed_data ? "Imputed data artifact was recorded." : "Imputed data artifact is missing.",
    });
    checks.push({
      id: "imputation-method-boundary",
      status: metadata?.numeric_only === true ? "warning" : "pass",
      detail: metadata?.numeric_only === true
        ? "Current MICE-style route is numeric-only; categorical imputation requires a categorical model before paper-grade use."
        : "Imputation metadata was recorded.",
    });
  }
  if (result.method === "missingness-ipw") {
    const maxIpw = numericDiagnostic(diagnostics, "max_ipw");
    checks.push({
      id: "missingness-ipw-stability",
      status: maxIpw === null ? "warning" : maxIpw <= 10 ? "pass" : maxIpw <= 25 ? "warning" : "fail",
      detail: maxIpw === null ? "Maximum missingness IPW is missing." : `Maximum missingness IPW is ${maxIpw.toFixed(3)}.`,
    });
  }
  if (result.method === "complete-case-sensitivity" || result.method === "mnar-sensitivity") {
    checks.push({
      id: "missingness-sensitivity-scenarios",
      status: result.estimates.length >= (result.method === "mnar-sensitivity" ? 5 : 2) ? "pass" : "warning",
      detail: `${result.estimates.length} missingness sensitivity scenario row(s) were produced.`,
    });
  }
  return checks;
}

function causalQaChecks(result: StatsRunResult): Array<{ id: string; status: "pass" | "warning" | "fail"; detail: string }> {
  if (!causalMethods().has(result.method)) return [];
  const diagnostics = result.diagnostics as Record<string, unknown>;
  const checks: Array<{ id: string; status: "pass" | "warning" | "fail"; detail: string }> = [
    {
      id: "causal-design-boundary",
      status: "warning",
      detail: "Causal/quasi-experimental routes require design review for exchangeability, positivity, consistency, timing, and unsupported causal claim prevention.",
    },
  ];
  if (["overlap-weighting", "entropy-balancing", "doubly-robust-aipw"].includes(result.method)) {
    const balance = diagnostics.balance as Record<string, unknown> | undefined;
    const positivity = diagnostics.positivity as Record<string, unknown> | undefined;
    const maxAfter = typeof balance?.max_abs_smd_after === "number" ? balance.max_abs_smd_after : null;
    const commonSupportFraction = typeof positivity?.common_support_fraction === "number" ? positivity.common_support_fraction : null;
    const effectiveN = numericDiagnostic(diagnostics, "effective_sample_size");
    checks.push({
      id: "causal-balance-after-adjustment",
      status: maxAfter === null ? "fail" : maxAfter <= 0.1 ? "pass" : maxAfter <= 0.2 ? "warning" : "fail",
      detail: maxAfter === null ? "Post-adjustment balance summary is missing." : `Maximum post-adjustment absolute SMD is ${maxAfter.toFixed(3)}.`,
    });
    checks.push({
      id: "causal-positivity-support",
      status: commonSupportFraction === null ? "fail" : commonSupportFraction >= 0.9 ? "pass" : commonSupportFraction >= 0.75 ? "warning" : "fail",
      detail: commonSupportFraction === null ? "Common-support fraction is missing." : `${(commonSupportFraction * 100).toFixed(1)}% of complete cases are inside observed cross-arm propensity support.`,
    });
    checks.push({
      id: "causal-effective-sample-size",
      status: effectiveN === null ? "warning" : effectiveN >= result.completeCaseN * 0.5 ? "pass" : effectiveN >= result.completeCaseN * 0.25 ? "warning" : "fail",
      detail: effectiveN === null ? "Effective sample size is missing." : `Effective sample size is ${effectiveN.toFixed(1)} of ${result.completeCaseN} complete cases.`,
    });
  }
  if (result.method === "difference-in-differences" || result.method === "event-study-did") {
    const minCell = numericDiagnostic(diagnostics, "min_treatment_period_cell_n");
    checks.push({
      id: "did-cell-support",
      status: minCell === null ? "warning" : minCell >= 10 ? "pass" : minCell >= 3 ? "warning" : "fail",
      detail: minCell === null ? "Treatment-by-period support is missing." : `Smallest treatment-by-period cell has ${minCell} row(s).`,
    });
    checks.push({
      id: "did-parallel-trends-review",
      status: diagnostics.parallel_trends_review_required === true ? "warning" : "fail",
      detail: diagnostics.parallel_trends_review_required === true ? "Parallel trends review is explicitly required before causal interpretation." : "Parallel trends review flag is missing.",
    });
  }
  if (result.method === "interrupted-time-series") {
    const pre = numericDiagnostic(diagnostics, "pre_period_observations");
    const post = numericDiagnostic(diagnostics, "post_period_observations");
    checks.push({
      id: "its-segment-support",
      status: pre === null || post === null ? "warning" : pre >= 8 && post >= 8 ? "pass" : pre >= 3 && post >= 3 ? "warning" : "fail",
      detail: pre === null || post === null ? "Pre/post segment counts are missing." : `${pre} pre-intervention and ${post} post-intervention observation(s) were recorded.`,
    });
  }
  if (result.method === "regression-discontinuity") {
    const below = numericDiagnostic(diagnostics, "below_cutoff_n");
    const above = numericDiagnostic(diagnostics, "above_cutoff_n");
    checks.push({
      id: "rdd-cutoff-support",
      status: below === null || above === null ? "warning" : below >= 20 && above >= 20 ? "pass" : below >= 5 && above >= 5 ? "warning" : "fail",
      detail: below === null || above === null ? "Cutoff side counts are missing." : `${below} row(s) below and ${above} row(s) at/above the cutoff.`,
    });
  }
  if (result.method === "instrumental-variables-2sls") {
    const firstStage = numericDiagnostic(diagnostics, "first_stage_f_statistic");
    checks.push({
      id: "iv-first-stage-strength",
      status: firstStage === null ? "warning" : firstStage >= 10 ? "pass" : firstStage >= 5 ? "warning" : "fail",
      detail: firstStage === null ? "First-stage F statistic is missing." : `First-stage F statistic is ${firstStage.toFixed(3)}.`,
    });
    checks.push({
      id: "iv-exclusion-review",
      status: diagnostics.exclusion_restriction_review_required === true ? "warning" : "fail",
      detail: diagnostics.exclusion_restriction_review_required === true ? "Exclusion restriction review is explicitly required." : "Exclusion restriction review flag is missing.",
    });
  }
  if (result.method === "target-trial-emulation-spec") {
    checks.push({
      id: "target-trial-required-items",
      status: Array.isArray(diagnostics.required_protocol_items) && diagnostics.required_protocol_items.length >= 6 ? "warning" : "fail",
      detail: Array.isArray(diagnostics.required_protocol_items) ? `${diagnostics.required_protocol_items.length} target-trial protocol item(s) were recorded for human review.` : "Target-trial protocol items are missing.",
    });
  }
  if (result.method === "unmeasured-confounding-sensitivity") {
    checks.push({
      id: "unmeasured-confounding-effect-bound",
      status: hasAnyNumeric(result.estimates[0] ?? {}, ["e_value"]) ? "warning" : "fail",
      detail: hasAnyNumeric(result.estimates[0] ?? {}, ["e_value"]) ? "E-value-style sensitivity bound was recorded; it does not prove absence of confounding." : "E-value-style sensitivity estimate is missing.",
    });
  }
  return checks;
}

function predictionQaChecks(result: StatsRunResult): Array<{ id: string; status: "pass" | "warning" | "fail"; detail: string }> {
  if (result.method !== "prediction-evaluation") return [];
  const diagnostics = result.diagnostics as Record<string, unknown>;
  const first = result.estimates[0] ?? {};
  const auroc = typeof first.auroc === "number" && Number.isFinite(first.auroc) ? first.auroc : null;
  const auprc = typeof first.auprc === "number" && Number.isFinite(first.auprc) ? first.auprc : null;
  const brier = typeof first.brier_score === "number" && Number.isFinite(first.brier_score) ? first.brier_score : null;
  const eventCount = numericDiagnostic(diagnostics, "event_count");
  const nonEventCount = numericDiagnostic(diagnostics, "non_event_count");
  const checks: Array<{ id: string; status: "pass" | "warning" | "fail"; detail: string }> = [
    {
      id: "prediction-class-balance",
      status: eventCount === null || nonEventCount === null ? "warning" : Math.min(eventCount, nonEventCount) >= 20 ? "pass" : Math.min(eventCount, nonEventCount) >= 5 ? "warning" : "fail",
      detail: eventCount === null || nonEventCount === null ? "Binary class counts are missing." : `${eventCount} event(s) and ${nonEventCount} non-event(s) were evaluated.`,
    },
    {
      id: "prediction-discrimination",
      status: auroc === null ? "fail" : auroc >= 0.7 ? "pass" : auroc >= 0.55 ? "warning" : "fail",
      detail: auroc === null ? "AUROC is missing." : `AUROC is ${auroc.toFixed(3)}${auprc === null ? "" : ` and AUPRC is ${auprc.toFixed(3)}`}.`,
    },
    {
      id: "prediction-threshold-operating-point",
      status: diagnostics.confusion_matrix && hasAnyNumeric(first, ["sensitivity", "specificity", "f1"]) ? "pass" : "fail",
      detail: diagnostics.confusion_matrix ? `Threshold ${String(first.threshold ?? "unknown")} has sensitivity/specificity/F1 recorded.` : "Confusion matrix and threshold metrics are missing.",
    },
    {
      id: "prediction-calibration",
      status: brier === null ? "warning" : brier <= 0.25 ? "pass" : brier <= 0.35 ? "warning" : "fail",
      detail: brier === null ? "Brier score is missing." : `Brier score is ${brier.toFixed(3)}.`,
    },
    {
      id: "prediction-score-probability-boundary",
      status: diagnostics.score_is_probability_like === true ? "pass" : "warning",
      detail: diagnostics.score_is_probability_like === true ? "Scores are bounded in [0, 1], so calibration/Brier interpretation is probability-like." : "Scores are not bounded in [0, 1]; calibration and Brier score should be treated as score diagnostics only.",
    },
    {
      id: "prediction-artifact-completeness",
      status: result.artifacts.some(artifact => artifact.kind === "table" && /roc-curve/i.test(artifact.path))
        && result.artifacts.some(artifact => artifact.kind === "table" && /precision-recall/i.test(artifact.path))
        && result.artifacts.some(artifact => artifact.kind === "table" && /calibration/i.test(artifact.path))
        ? "pass"
        : "fail",
      detail: "Prediction evaluation should emit ROC, precision-recall, calibration, and confusion-matrix source artifacts.",
    },
  ];
  return checks;
}

function measurementAndExplorationQaChecks(result: StatsRunResult): Array<{ id: string; status: "pass" | "warning" | "fail"; detail: string }> {
  if (!measurementAndExplorationMethods().has(result.method)) return [];
  const diagnostics = result.diagnostics as Record<string, unknown>;
  const first = result.estimates[0] ?? {};
  const checks: Array<{ id: string; status: "pass" | "warning" | "fail"; detail: string }> = [];
  if (result.method === "reliability-kappa") {
    checks.push({
      id: "agreement-kappa-interval",
      status: hasAnyNumeric(first, ["ci_low", "ci_high"]) ? "pass" : "warning",
      detail: hasAnyNumeric(first, ["ci_low", "ci_high"]) ? "Approximate kappa confidence interval was recorded." : "Kappa confidence interval is missing.",
    });
    checks.push({
      id: "agreement-contingency-table",
      status: Boolean(diagnostics.table) ? "pass" : "fail",
      detail: Boolean(diagnostics.table) ? "Rater contingency table was recorded." : "Rater contingency table is missing.",
    });
  }
  if (result.method === "intraclass-correlation" || result.method === "cronbach-alpha") {
    checks.push({
      id: "scale-reliability-sample-size",
      status: result.completeCaseN >= 30 ? "pass" : result.completeCaseN >= 10 ? "warning" : "fail",
      detail: `${result.completeCaseN} complete row(s) were available for reliability estimation.`,
    });
    checks.push({
      id: "scale-reliability-item-count",
      status: numericDiagnostic(diagnostics, "items") === null && numericDiagnostic(diagnostics, "raters_or_measures") === null ? "warning" : "pass",
      detail: `Reliability route recorded ${diagnostics.items ?? diagnostics.raters_or_measures ?? "unknown"} item/measure column(s).`,
    });
  }
  if (result.method === "pca") {
    const cumulative = numericDiagnostic(diagnostics, "cumulative_explained_variance");
    checks.push({
      id: "pca-variance-captured",
      status: cumulative === null ? "warning" : cumulative >= 0.7 ? "pass" : cumulative >= 0.5 ? "warning" : "fail",
      detail: cumulative === null ? "Cumulative explained variance is missing." : `Selected components explain ${(cumulative * 100).toFixed(1)}% of variance.`,
    });
    checks.push({
      id: "pca-artifacts",
      status: result.artifacts.some(artifact => /pca-transformed|pca-loadings/i.test(artifact.path)) ? "pass" : "fail",
      detail: "PCA should emit transformed scores and loadings artifacts.",
    });
  }
  if (result.method === "clustering-validation") {
    const minCluster = numericDiagnostic(diagnostics, "min_cluster_size");
    checks.push({
      id: "clustering-cluster-size",
      status: minCluster === null ? "warning" : minCluster >= 5 ? "pass" : minCluster >= 2 ? "warning" : "fail",
      detail: minCluster === null ? "Minimum cluster size is missing." : `Smallest cluster has ${minCluster} row(s).`,
    });
    checks.push({
      id: "clustering-validation-metrics",
      status: hasAnyNumeric(first, ["silhouette"]) && hasAnyNumeric(first, ["davies_bouldin", "calinski_harabasz"]) ? "pass" : "warning",
      detail: "Clustering route should report silhouette, Davies-Bouldin, and Calinski-Harabasz metrics where feasible.",
    });
  }
  if (result.method === "bland-altman") {
    checks.push({
      id: "agreement-limits-of-agreement",
      status: hasAnyNumeric(first, ["loa_low", "loa_high"]) ? "pass" : "fail",
      detail: hasAnyNumeric(first, ["loa_low", "loa_high"]) ? "Bland-Altman limits of agreement were recorded." : "Limits of agreement are missing.",
    });
  }
  if (result.method === "multiple-comparison-correction") {
    checks.push({
      id: "multiple-comparison-methods",
      status: Array.isArray(diagnostics.methods) && diagnostics.methods.length >= 4 ? "pass" : "warning",
      detail: Array.isArray(diagnostics.methods) ? `${diagnostics.methods.length} correction method(s) were applied.` : "Correction method list is missing.",
    });
    checks.push({
      id: "multiple-comparison-artifact",
      status: result.artifacts.some(artifact => /adjusted-p-values/i.test(artifact.path)) ? "pass" : "fail",
      detail: "Adjusted p-value artifact should be recorded for auditability.",
    });
  }
  if (result.method === "power-sample-size") {
    const n = typeof first.n_per_group === "number" && Number.isFinite(first.n_per_group) ? first.n_per_group : null;
    checks.push({
      id: "power-sample-size-finite",
      status: n === null ? "fail" : n > 0 ? "pass" : "fail",
      detail: n === null ? "Power calculation did not return a finite sample size." : `Estimated required n per group is ${n.toFixed(1)}.`,
    });
  }
  return checks;
}

function coreInferenceQaChecks(result: StatsRunResult): Array<{ id: string; status: "pass" | "warning" | "fail"; detail: string }> {
  if (!coreInferenceMethods().has(result.method)) return [];
  const first = result.estimates[0] ?? {};
  const diagnostics = result.diagnostics as Record<string, unknown>;
  const checks: Array<{ id: string; status: "pass" | "warning" | "fail"; detail: string }> = [
    {
      id: "core-inference-sample-size",
      status: result.completeCaseN >= 40 ? "pass" : result.completeCaseN >= 10 ? "warning" : "fail",
      detail: `${result.completeCaseN} complete row(s) were available for the inferential route.`,
    },
  ];
  if (meanComparisonMethods().has(result.method)) {
    const hasEffect = hasAnyNumeric(first, ["mean_difference", "median_difference", "cohen_d", "hedges_g", "rank_biserial_correlation", "matched_rank_biserial_correlation"]);
    const hasInterval = hasAnyNumeric(first, ["ci_low", "ci_high"]) || result.method === "mann-whitney" || result.method === "wilcoxon";
    checks.push({
      id: "core-inference-effect-size",
      status: hasEffect ? "pass" : "warning",
      detail: hasEffect ? "Comparison includes an interpretable effect size or distributional contrast." : "Comparison is missing an interpretable effect size beyond a test statistic.",
    });
    checks.push({
      id: "core-inference-uncertainty",
      status: hasInterval ? "pass" : "warning",
      detail: hasInterval ? "Comparison includes a confidence interval or is a nonparametric route with an explicit effect-size contrast." : "Comparison is missing confidence-interval evidence.",
    });
    checks.push({
      id: "core-inference-assumptions",
      status: diagnostics.test || diagnostics.group_counts ? "pass" : "warning",
      detail: diagnostics.test || diagnostics.group_counts ? "Assumption/context diagnostics were recorded for the comparison." : "Comparison diagnostics are sparse.",
    });
  }
  if (categoricalAssociationMethods().has(result.method)) {
    const hasTable = Boolean(diagnostics.table);
    const hasAssociation = hasAnyNumeric(first, ["cramers_v", "odds_ratio", "risk_ratio", "risk_difference", "matched_odds_ratio", "trend_z_statistic"]);
    checks.push({
      id: "categorical-association-table",
      status: hasTable ? "pass" : "fail",
      detail: hasTable ? "Observed contingency table was recorded." : "Observed contingency table is missing.",
    });
    checks.push({
      id: "categorical-association-effect-size",
      status: hasAssociation ? "pass" : "warning",
      detail: hasAssociation ? "Categorical association includes an effect-size measure." : "Categorical association is missing an effect-size measure beyond a p-value.",
    });
    if (result.method === "chi-square") {
      checks.push({
        id: "categorical-expected-counts",
        status: numericDiagnostic(diagnostics, "min_expected") === null ? "warning" : numericDiagnostic(diagnostics, "min_expected")! >= 5 ? "pass" : "warning",
        detail: numericDiagnostic(diagnostics, "min_expected") === null ? "Minimum expected cell count is missing." : `Minimum expected cell count is ${numericDiagnostic(diagnostics, "min_expected")!.toFixed(3)}.`,
      });
    }
  }
  if (correlationMethods().has(result.method)) {
    checks.push({
      id: "correlation-effect-size",
      status: hasAnyNumeric(first, ["correlation"]) ? "pass" : "fail",
      detail: hasAnyNumeric(first, ["correlation"]) ? "Correlation coefficient was recorded." : "Correlation coefficient is missing.",
    });
    checks.push({
      id: "correlation-uncertainty",
      status: hasAnyNumeric(first, ["ci_low", "ci_high"]) ? "pass" : "warning",
      detail: hasAnyNumeric(first, ["ci_low", "ci_high"]) ? String(diagnostics.ci_method ?? "Correlation confidence interval was recorded.") : "Correlation confidence interval is missing or unavailable for the sample size.",
    });
  }
  return checks;
}

function hasAnyNumeric(row: Record<string, unknown>, keys: string[]): boolean {
  return keys.some(key => typeof row[key] === "number" && Number.isFinite(row[key] as number));
}

function coreInferenceMethods(): Set<StatsRunRequest["method"]> {
  return new Set([...meanComparisonMethods(), ...categoricalAssociationMethods(), ...correlationMethods()]);
}

function meanComparisonMethods(): Set<StatsRunRequest["method"]> {
  return new Set(["t-test", "welch-t-test", "paired-t-test", "mann-whitney", "wilcoxon", "anova", "ancova", "kruskal-wallis", "friedman"]);
}

function categoricalAssociationMethods(): Set<StatsRunRequest["method"]> {
  return new Set(["chi-square", "fisher-exact", "mcnemar", "cochran-armitage-trend"]);
}

function correlationMethods(): Set<StatsRunRequest["method"]> {
  return new Set(["pearson", "spearman", "kendall", "partial-correlation"]);
}

function regressionReliabilityQaChecks(result: StatsRunResult): Array<{ id: string; status: "pass" | "warning" | "fail"; detail: string }> {
  const diagnostics = result.diagnostics as Record<string, unknown>;
  const maxVif = numericDiagnostic(diagnostics, "max_vif");
  const maxCooks = numericDiagnostic(diagnostics, "max_cooks_distance");
  const nObs = numericDiagnostic(diagnostics, "n_obs") ?? result.completeCaseN;
  const nPredictors = numericDiagnostic(diagnostics, "n_predictors");
  const overdispersion = numericDiagnostic(diagnostics, "overdispersion_ratio");
  const eventCount = numericDiagnostic(diagnostics, "event_count");
  const nonEventCount = numericDiagnostic(diagnostics, "non_event_count");
  const converged = diagnostics.converged;
  const checks: Array<{ id: string; status: "pass" | "warning" | "fail"; detail: string }> = [
    {
      id: "model-diagnostics-present",
      status: diagnostics.model_family || diagnostics.test ? "pass" : "fail",
      detail: diagnostics.model_family || diagnostics.test
        ? `Diagnostics recorded for ${String(diagnostics.model_family ?? diagnostics.test)}.`
        : "Model diagnostics are missing.",
    },
    {
      id: "model-convergence",
      status: result.issues.some(issue => issue.code === "REGRESSION_DID_NOT_CONVERGE") || converged === false ? "fail" : converged === undefined ? "warning" : "pass",
      detail: converged === undefined
        ? "Convergence evidence is not exposed by this backend/model class."
        : `Backend convergence flag is ${String(converged)}.`,
    },
    {
      id: "model-parameter-burden",
      status: nPredictors === null ? "warning" : nObs / Math.max(nPredictors, 1) >= 20 ? "pass" : nObs / Math.max(nPredictors, 1) >= 10 ? "warning" : "fail",
      detail: nPredictors === null
        ? "Predictor count is missing from diagnostics."
        : `${nObs} complete rows for ${nPredictors} modeled predictor term(s).`,
    },
    {
      id: "model-collinearity",
      status: maxVif === null ? "warning" : maxVif <= 5 ? "pass" : maxVif <= 10 ? "warning" : "fail",
      detail: maxVif === null
        ? "VIF/collinearity diagnostics are unavailable."
        : `Maximum VIF is ${maxVif.toFixed(3)}.`,
    },
  ];
  if (maxCooks !== null) {
    const threshold = 4 / Math.max(nObs, 1);
    checks.push({
      id: "model-influence",
      status: maxCooks <= threshold ? "pass" : maxCooks <= threshold * 3 ? "warning" : "fail",
      detail: `Maximum Cook's distance is ${maxCooks.toFixed(4)}; heuristic threshold is ${threshold.toFixed(4)}.`,
    });
  }
  if (result.method === "logistic-regression" || result.method === "penalized-logistic-regression") {
    const minClass = eventCount !== null && nonEventCount !== null ? Math.min(eventCount, nonEventCount) : null;
    checks.push({
      id: "model-binary-class-balance",
      status: minClass === null ? "warning" : minClass >= 20 ? "pass" : minClass >= 5 ? "warning" : "fail",
      detail: minClass === null
        ? "Binary event/non-event counts are missing from diagnostics."
        : `Binary outcome has ${eventCount} event(s) and ${nonEventCount} non-event(s).`,
    });
  }
  if (countRegressionMethods().has(result.method)) {
    checks.push({
      id: "model-count-overdispersion",
      status: overdispersion === null ? "warning" : result.method === "poisson-regression" && overdispersion > 2 ? "warning" : "pass",
      detail: overdispersion === null
        ? "Count overdispersion diagnostic is missing."
        : `Pearson overdispersion ratio is ${overdispersion.toFixed(3)}.`,
    });
  }
  if (result.method.startsWith("penalized-")) {
    checks.push({
      id: "penalized-inference-boundary",
      status: "warning",
      detail: "Penalized coefficients are shrinkage estimates; classical p-values/CIs require bootstrap or post-selection inference.",
    });
  }
  return checks;
}

function survivalReliabilityQaChecks(result: StatsRunResult): Array<{ id: string; status: "pass" | "warning" | "fail"; detail: string }> {
  const diagnostics = result.diagnostics as Record<string, unknown>;
  const events = numericDiagnostic(diagnostics, "events");
  const censored = numericDiagnostic(diagnostics, "censored");
  const nPredictors = numericDiagnostic(diagnostics, "n_predictors");
  const epv = numericDiagnostic(diagnostics, "events_per_predictor") ?? (events !== null && nPredictors !== null ? events / Math.max(nPredictors, 1) : null);
  const cIndex = numericDiagnostic(diagnostics, "harrell_c_index");
  const tiedEventTimes = numericDiagnostic(diagnostics, "tied_event_times");
  const checks: Array<{ id: string; status: "pass" | "warning" | "fail"; detail: string }> = [
    {
      id: "survival-event-count",
      status: events === null ? "warning" : events >= 20 ? "pass" : events >= 5 ? "warning" : "fail",
      detail: events === null ? "Survival event count is missing." : `${events} event(s) are available for the survival route.`,
    },
    {
      id: "survival-censoring-context",
      status: events === null || censored === null ? "warning" : events > 0 && censored >= 0 ? "pass" : "fail",
      detail: events === null || censored === null ? "Censoring/event context is incomplete." : `${events} event(s) and ${censored} censored observation(s) were recorded.`,
    },
  ];
  if (result.method === "kaplan-meier" || result.method === "aalen-johansen-cif") {
    checks.push({
      id: "survival-curve-artifact",
      status: result.artifacts.some(artifact => artifact.kind === "table" && /curve|incidence/i.test(artifact.path)) ? "pass" : "fail",
      detail: result.artifacts.some(artifact => artifact.kind === "table" && /curve|incidence/i.test(artifact.path))
        ? "Machine-readable survival/cumulative-incidence curve artifact was recorded."
        : "Survival/cumulative-incidence curve table artifact is missing.",
    });
  }
  if (result.method === "cox-proportional-hazards" || result.method === "stratified-cox") {
    checks.push({
      id: "survival-events-per-predictor",
      status: epv === null ? "warning" : epv >= 10 ? "pass" : epv >= 3 ? "warning" : "fail",
      detail: epv === null ? "Events-per-predictor is missing." : `Events per predictor is ${epv.toFixed(3)}.`,
    });
    checks.push({
      id: "cox-discrimination-diagnostic",
      status: cIndex === null ? "warning" : cIndex >= 0.55 && cIndex <= 1 ? "pass" : "warning",
      detail: cIndex === null ? "Harrell C-index diagnostic is missing." : `Harrell C-index is ${cIndex.toFixed(3)}.`,
    });
    checks.push({
      id: "cox-tie-burden",
      status: tiedEventTimes === null ? "warning" : tiedEventTimes <= Math.max((events ?? 0) * 0.5, 10) ? "pass" : "warning",
      detail: tiedEventTimes === null ? "Tied event-time burden is missing." : `${tiedEventTimes} event time(s) have tied events.`,
    });
    checks.push({
      id: "cox-proportional-hazards-diagnostic",
      status: diagnostics.proportional_hazards_check === "not_available" ? "warning" : "pass",
      detail: diagnostics.proportional_hazards_check === "not_available"
        ? "This runtime fitted Cox coefficients but did not compute Schoenfeld/proportional-hazards diagnostics."
        : "Proportional-hazards diagnostic evidence was recorded.",
    });
  }
  return checks;
}

function longitudinalReliabilityQaChecks(result: StatsRunResult): Array<{ id: string; status: "pass" | "warning" | "fail"; detail: string }> {
  const diagnostics = result.diagnostics as Record<string, unknown>;
  const clusters = numericDiagnostic(diagnostics, "clusters");
  const minObsPerCluster = numericDiagnostic(diagnostics, "min_observations_per_cluster");
  return [
    {
      id: "longitudinal-cluster-count",
      status: clusters === null ? "warning" : clusters >= 20 ? "pass" : clusters >= 8 ? "warning" : "fail",
      detail: clusters === null ? "Cluster count is missing." : `${clusters} cluster(s)/subject(s) are available.`,
    },
    {
      id: "longitudinal-observations-per-cluster",
      status: minObsPerCluster === null ? "warning" : minObsPerCluster >= 2 ? "pass" : "fail",
      detail: minObsPerCluster === null ? "Within-cluster observation counts are missing." : `Minimum observations per cluster is ${minObsPerCluster}.`,
    },
  ];
}

function numericDiagnostic(diagnostics: Record<string, unknown>, key: string): number | null {
  const value = diagnostics[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function regressionFamilyMethods(): Set<StatsRunRequest["method"]> {
  return new Set(["linear-regression", "robust-linear-regression", "logistic-regression", "ordinal-logistic-regression", "multinomial-logistic-regression", "poisson-regression", "negative-binomial-regression", "zero-inflated-poisson", "zero-inflated-negative-binomial", "gamma-glm", "inverse-gaussian-glm", "quantile-regression", "penalized-linear-regression", "penalized-logistic-regression"]);
}

function countRegressionMethods(): Set<StatsRunRequest["method"]> {
  return new Set(["poisson-regression", "negative-binomial-regression", "zero-inflated-poisson", "zero-inflated-negative-binomial"]);
}

function survivalFamilyMethods(): Set<StatsRunRequest["method"]> {
  return new Set(["kaplan-meier", "log-rank", "cox-proportional-hazards", "stratified-cox", "time-varying-cox", "fine-gray", "aalen-johansen-cif", "recurrent-event-rate"]);
}

function longitudinalFamilyMethods(): Set<StatsRunRequest["method"]> {
  return new Set(["linear-mixed-model", "generalized-mixed-model", "gee", "repeated-measures-anova"]);
}

function missingnessMethods(): Set<StatsRunRequest["method"]> {
  return new Set(["missingness-summary", "multiple-imputation-mice", "missingness-ipw", "complete-case-sensitivity", "mnar-sensitivity"]);
}

function causalMethods(): Set<StatsRunRequest["method"]> {
  return new Set([
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

function measurementAndExplorationMethods(): Set<StatsRunRequest["method"]> {
  return new Set([
    "reliability-kappa",
    "intraclass-correlation",
    "cronbach-alpha",
    "pca",
    "clustering-validation",
    "bland-altman",
    "multiple-comparison-correction",
    "power-sample-size",
  ]);
}

function renderEstimateTable(result: StatsRunResult): string {
  const firstRows = result.estimates.slice(0, 12);
  if (!firstRows.length) return "_No estimate rows were produced._";
  if (result.method === "diagnostic-accuracy") {
    return [
      "| index test | reference standard | TP | FP | TN | FN | sensitivity | specificity | PPV | NPV | LR+ | LR- | prevalence |",
      "|---|---|---:|---:|---:|---:|---|---|---|---|---:|---:|---:|",
      ...firstRows.map(row => `| ${cell(row.term)} | ${cell(row.reference)} | ${cell(row.true_positive)} | ${cell(row.false_positive)} | ${cell(row.true_negative)} | ${cell(row.false_negative)} | ${estimateWithCi(row.sensitivity, row.sensitivity_ci_low, row.sensitivity_ci_high)} | ${estimateWithCi(row.specificity, row.specificity_ci_low, row.specificity_ci_high)} | ${estimateWithCi(row.positive_predictive_value, row.positive_predictive_value_ci_low, row.positive_predictive_value_ci_high)} | ${estimateWithCi(row.negative_predictive_value, row.negative_predictive_value_ci_low, row.negative_predictive_value_ci_high)} | ${cell(row.positive_likelihood_ratio)} | ${cell(row.negative_likelihood_ratio)} | ${cell(row.prevalence)} |`),
    ].join("\n");
  }
  if (result.method === "propensity-score-matching" || result.method === "propensity-score-weighting") {
    return [
      "| contrast | estimand | effect measure | estimate | ci_low | ci_high | p_value | treated n | control n |",
      "|---|---|---|---:|---:|---:|---:|---:|---:|",
      ...firstRows.map(row => `| ${cell(row.term)} | ${cell(row.estimand)} | ${cell(row.effect_measure)} | ${cell(row.estimate ?? row.risk_difference ?? row.mean_difference ?? row.odds_ratio)} | ${cell(row.ci_low ?? row.or_ci_low)} | ${cell(row.ci_high ?? row.or_ci_high)} | ${cell(row.p_value)} | ${cell(row.treated_n)} | ${cell(row.control_n)} |`),
    ].join("\n");
  }
  return [
    "| term | estimate | p_value | ci_low | ci_high |",
    "|---|---:|---:|---:|---:|",
    ...firstRows.map(row => `| ${cell(row.term)} | ${cell(row.estimate ?? row.mean_difference ?? row.correlation ?? row.odds_ratio ?? row.rate_ratio ?? row.chi_square)} | ${cell(row.p_value)} | ${cell(row.ci_low ?? row.or_ci_low ?? row.rr_ci_low)} | ${cell(row.ci_high ?? row.or_ci_high ?? row.rr_ci_high)} |`),
  ].join("\n");
}

function renderDiagnosticAccuracySection(result: StatsRunResult, request: StatsRunRequest): string[] {
  if (result.method !== "diagnostic-accuracy") return [];
  const diagnostics = result.diagnostics as Record<string, unknown>;
  return [
    "",
    "## Diagnostic Accuracy Boundary",
    "",
    `- Reference standard: ${request.outcome}.`,
    `- Index test or screening indicator: ${request.exposure ?? request.group ?? "(missing)"}.`,
    `- Reference positive level: ${cell(diagnostics.reference_positive_level)}; index-test positive level: ${cell(diagnostics.test_positive_level)}.`,
    "- PPV and NPV depend on the prevalence in this analyzed table and should not be generalized without external validation or a target-population prevalence model.",
    "- Sensitivity, specificity, PPV, and NPV include Wilson binomial intervals when denominators are available; likelihood ratios remain point estimates in this standard-table route.",
    "- These estimates do not justify clinical screening recommendations, deployment, or diagnostic replacement claims without prospective validation and clinical-utility evidence.",
    result.issues.some(issue => issue.code === "SPARSE_DIAGNOSTIC_CELL")
      ? "- Sparse diagnostic cells were detected; treat all accuracy metrics as unstable until more data or exact interval evidence is available."
      : "- No sparse diagnostic cell warning was emitted.",
  ];
}

function renderPropensitySection(result: StatsRunResult, request: StatsRunRequest): string[] {
  if (result.method !== "propensity-score-matching" && result.method !== "propensity-score-weighting") return [];
  const diagnostics = result.diagnostics as Record<string, unknown>;
  const balance = diagnostics.balance as Record<string, unknown> | undefined;
  const positivity = diagnostics.positivity as Record<string, unknown> | undefined;
  const matching = diagnostics.matching as Record<string, unknown> | undefined;
  const weighting = diagnostics.weighting as Record<string, unknown> | undefined;
  const missingness = diagnostics.missingness as Record<string, unknown> | undefined;
  return [
    "",
    "## Propensity Design Diagnostics",
    "",
    `- Treatment/exposure: ${request.exposure ?? "(missing)"}.`,
    `- Outcome: ${request.outcome ?? "(missing)"}.`,
    `- Estimand: ${request.estimand}; method: ${result.method}.`,
    `- Covariates in propensity model: ${request.covariates.join(", ") || "(none)"}.`,
    `- Exact-match covariates: ${request.exactCovariates.join(", ") || "(none)"}.`,
    result.method === "propensity-score-matching"
      ? `- Matching: nearest-neighbor greedy matching, ratio ${request.matchRatio}:1, ${request.replacement ? "with" : "without"} replacement, caliper ${request.caliper ?? 0.2} SD of the logit propensity score.`
      : `- Weighting: ${request.estimand} inverse-probability weights${request.stabilizeWeights ? " with stabilization" : ""}; trim threshold ${request.trimThreshold}.`,
    `- Maximum absolute standardized mean difference before adjustment: ${cell(balance?.max_abs_smd_before)}.`,
    `- Maximum absolute standardized mean difference after adjustment: ${cell(balance?.max_abs_smd_after)}.`,
    `- Covariate terms above absolute SMD 0.10 after adjustment: ${cell(balance?.covariates_over_0_1_after)}.`,
    `- Common-support fraction: ${cell(positivity?.common_support_fraction)}.`,
    `- Complete-case fraction for treatment, outcome, and propensity covariates: ${cell(missingness?.complete_case_fraction)}.`,
    matching ? `- Matched treated rows: ${cell(matching.matched_treated)}; matched control rows: ${cell(matching.matched_controls)}; unmatched treated rows: ${cell(matching.unmatched_treated)}.` : "",
    weighting ? `- Weight range: ${cell(weighting.min_weight)} to ${cell(weighting.max_weight)}; effective sample size ${cell(weighting.effective_sample_size)}.` : "",
    "- These diagnostics address measured-covariate balance only. They do not address unmeasured confounding, treatment timing, immortal time, consistency, or causal transportability.",
  ].filter(Boolean);
}

function cell(value: unknown): string {
  if (value === undefined || value === null || (typeof value === "number" && !Number.isFinite(value))) return "";
  if (typeof value === "number") return Number.isInteger(value) ? String(value) : value.toPrecision(4);
  return String(value).replaceAll("|", "\\|");
}

function estimateWithCi(value: unknown, low: unknown, high: unknown): string {
  if (typeof value === "number" && typeof low === "number" && typeof high === "number") {
    return `${cell(value)} (${cell(low)}, ${cell(high)})`;
  }
  return cell(value);
}

function variablesFor(request: StatsRunRequest): string[] {
  return [...new Set([
    request.outcome,
    request.exposure,
    request.group,
    request.time,
    request.event,
    request.id,
    request.strata,
    request.cluster,
    request.period,
    request.post,
    request.runningVariable,
    request.instrument,
    request.weight,
    ...request.variables,
    ...request.covariates,
    ...request.exactCovariates,
  ].filter((item): item is string => Boolean(item)))];
}

function statsBridgeSource(): string {
  return String.raw`
import json
import math
import os
import sys
import traceback
from pathlib import Path

import numpy as np
import pandas as pd
from scipy import stats
from scipy.optimize import minimize
from sklearn.decomposition import PCA
from sklearn.cluster import KMeans
from sklearn.metrics import (
    adjusted_rand_score,
    average_precision_score,
    brier_score_loss,
    calinski_harabasz_score,
    confusion_matrix,
    davies_bouldin_score,
    precision_recall_curve,
    roc_auc_score,
    roc_curve,
    silhouette_score,
)
from sklearn.model_selection import KFold, StratifiedKFold, cross_val_score
from sklearn.linear_model import LogisticRegression, LinearRegression, Lasso, Ridge, ElasticNet
from sklearn.experimental import enable_iterative_imputer  # noqa: F401
from sklearn.impute import IterativeImputer
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt

try:
    import statsmodels.api as sm
except Exception:
    sm = None

try:
    import statsmodels.formula.api as smf
except Exception:
    smf = None

try:
    from statsmodels.miscmodels.ordinal_model import OrderedModel
    from statsmodels.discrete.count_model import ZeroInflatedPoisson, ZeroInflatedNegativeBinomialP
    from statsmodels.duration.hazard_regression import PHReg
    from statsmodels.stats.contingency_tables import mcnemar as sm_mcnemar
    from statsmodels.stats.multitest import multipletests
    from statsmodels.stats.power import TTestIndPower, NormalIndPower, FTestAnovaPower
except Exception:
    OrderedModel = None
    ZeroInflatedPoisson = None
    ZeroInflatedNegativeBinomialP = None
    PHReg = None
    sm_mcnemar = None
    multipletests = None
    TTestIndPower = None
    NormalIndPower = None
    FTestAnovaPower = None

def load_table(path):
    suffix = Path(path).suffix.lower()
    if suffix == ".csv":
        return pd.read_csv(path)
    if suffix in (".json", ".jsonl"):
        return pd.read_json(path, lines=(suffix == ".jsonl"))
    if suffix == ".parquet":
        return pd.read_parquet(path)
    raise ValueError(f"Unsupported table format: {suffix}")

def clean_value(value):
    if value is None:
        return None
    if isinstance(value, (np.integer,)):
        return int(value)
    if isinstance(value, (np.floating, float)):
        if math.isnan(float(value)) or math.isinf(float(value)):
            return None
        return float(value)
    if isinstance(value, (np.bool_, bool)):
        return bool(value)
    return value

def safe_exp(value):
    if value is None or pd.isna(value):
        return None
    value = float(value)
    if value > 709:
        return 1e308
    if value < -745:
        return 0.0
    return math.exp(value)

def semantic_rule_for_column(name):
    lower = str(name).lower()
    if lower.startswith(("elevated_", "high_", "has_", "is_")) or lower.endswith(("_flag", "_indicator", "_binary")):
        return {"kind": "binary_indicator", "allowed": {0, 1}}
    if "age" in lower or "ridageyr" in lower:
        return {"kind": "age", "min": 0, "max": 120, "mean_min": 0, "mean_max": 95}
    if "bmi" in lower or "bmxbmi" in lower or "body_mass" in lower or "body mass" in lower:
        return {"kind": "bmi", "min": 5, "max": 100, "mean_min": 10, "mean_max": 60}
    if "hba1c" in lower or "lbxgh" in lower or "glycohemoglobin" in lower:
        return {"kind": "hba1c_percent", "min": 2, "max": 20, "mean_min": 3, "mean_max": 14}
    if "systolic" in lower or "bpxsy" in lower or "sbp" in lower or "blood_pressure" in lower or "blood pressure" in lower:
        return {"kind": "systolic_bp", "min": 40, "max": 300, "mean_min": 70, "mean_max": 220}
    if "diastolic" in lower or "bpxdi" in lower or "dbp" in lower:
        return {"kind": "diastolic_bp", "min": 0, "max": 180, "mean_min": 30, "mean_max": 140}
    if "weight" in lower or lower.startswith("wt") or "_wt" in lower:
        return {"kind": "weight", "min": 0}
    if "los" in lower or "length_of_stay" in lower or "length of stay" in lower:
        return {"kind": "length_of_stay", "min": 0, "max": 3650, "mean_min": 0, "mean_max": 365}
    if "mortality" in lower or "death" in lower or "expire" in lower or lower in ("event", "outcome_bin"):
        return {"kind": "binary_indicator", "allowed": {0, 1}}
    if "count" in lower or lower.endswith("_n") or lower.startswith("n_"):
        return {"kind": "count", "min": 0}
    return None

def semantic_issues_for_dataframe(df, variables):
    issues = []
    selected = [c for c in variables if c in df.columns] if variables else list(df.columns)
    for column in selected:
        rule = semantic_rule_for_column(column)
        if not rule:
            continue
        numeric = pd.to_numeric(df[column], errors="coerce").dropna()
        if numeric.empty:
            continue
        values = numeric.to_numpy()
        min_value = float(np.nanmin(values))
        max_value = float(np.nanmax(values))
        mean_value = float(np.nanmean(values))
        evidence = [f"semantic:{column}"]
        if "allowed" in rule:
            observed = set(int(v) for v in values if float(v).is_integer())
            invalid = sorted(str(int(v)) for v in observed if v not in rule["allowed"])
            non_integer = [float(v) for v in values if not float(v).is_integer()]
            if invalid or non_integer:
                issues.append({"severity": "blocker", "code": "SEMANTIC_INVALID_CODE_VALUES", "message": f"{column} was inferred as {rule['kind']} but contains values outside {sorted(rule['allowed'])}.", "evidenceRefs": evidence})
        if "min" in rule and min_value < rule["min"]:
            issues.append({"severity": "blocker", "code": "SEMANTIC_VALUE_BELOW_RANGE", "message": f"{column} minimum {min_value:.4g} is below plausible {rule['kind']} lower bound {rule['min']}.", "evidenceRefs": evidence})
        if "max" in rule and max_value > rule["max"]:
            issues.append({"severity": "blocker", "code": "SEMANTIC_VALUE_ABOVE_RANGE", "message": f"{column} maximum {max_value:.4g} is above plausible {rule['kind']} upper bound {rule['max']}.", "evidenceRefs": evidence})
        if len(values) >= 30 and "mean_min" in rule and mean_value < rule["mean_min"]:
            issues.append({"severity": "warning", "code": "SEMANTIC_MEAN_BELOW_EXPECTED", "message": f"{column} mean {mean_value:.4g} is outside the broad expected range for {rule['kind']}; confirm units/coding.", "evidenceRefs": evidence})
        if len(values) >= 30 and "mean_max" in rule and mean_value > rule["mean_max"]:
            issues.append({"severity": "warning", "code": "SEMANTIC_MEAN_ABOVE_EXPECTED", "message": f"{column} mean {mean_value:.4g} is outside the broad expected range for {rule['kind']}; confirm units/coding.", "evidenceRefs": evidence})
        if rule["kind"] == "count" and max_value > len(df) and len(values) >= 5:
            issues.append({"severity": "warning", "code": "SEMANTIC_COUNT_EXCEEDS_ROWS", "message": f"{column} includes counts larger than the table row count; confirm this is an aggregate count, not row-level data.", "evidenceRefs": evidence})
    return issues

def write_csv(path, rows):
    pd.DataFrame(rows).to_csv(path, index=False)

def write_figure_manifest(out_dir, figures):
    manifest_path = os.path.join(out_dir, "figures.json")
    with open(manifest_path, "w") as f:
        json.dump({"schemaVersion": 1, "figures": figures}, f, indent=2)
    return manifest_path

def save_fig(out_dir, name, title, caption, source_columns, draw, x_label=None, y_label=None):
    path = os.path.join(out_dir, name)
    try:
        plt.figure(figsize=(7.5, 5.0))
        draw()
        plt.title(title)
        if x_label:
            plt.xlabel(x_label)
        if y_label:
            plt.ylabel(y_label)
        plt.tight_layout()
        plt.savefig(path, dpi=150)
        plt.close()
        return {
            "path": path,
            "title": title,
            "caption": caption,
            "altText": caption,
            "xLabel": x_label,
            "yLabel": y_label,
            "sourceColumns": source_columns,
            "format": Path(path).suffix.lower().lstrip("."),
            "qa": {
                "status": "pass",
                "checks": [
                    {"id": "file-written", "status": "pass"},
                    {"id": "title-present", "status": "pass" if title else "fail"},
                    {"id": "caption-present", "status": "pass" if caption else "fail"},
                    {"id": "x-axis-label-present", "status": "pass" if x_label else "warning"},
                    {"id": "y-axis-label-present", "status": "pass" if y_label else "warning"},
                    {"id": "source-columns-recorded", "status": "pass" if source_columns else "warning"},
                ],
            },
        }
    except Exception as exc:
        plt.close()
        return {
            "path": path,
            "title": title,
            "caption": caption,
            "altText": caption,
            "xLabel": x_label,
            "yLabel": y_label,
            "sourceColumns": source_columns,
            "format": Path(path).suffix.lower().lstrip("."),
            "qa": {"status": "fail", "checks": [{"id": "render-error", "status": "fail", "message": str(exc)}]},
        }

def require_columns(df, cols):
    missing = [c for c in cols if c and c not in df.columns]
    if missing:
        raise ValueError("Missing required columns: " + ", ".join(missing))

def numeric_clean(series):
    return pd.to_numeric(series, errors="coerce").dropna()

def as_binary_numeric(series, threshold=None):
    if threshold is not None:
        out, neg, pos = deterministic_binary_indicator(series, threshold)
        return out, neg, pos
    observed = pd.Series(series).dropna()
    values = list(observed.unique())
    if len(values) != 2:
        raise ValueError("Expected binary variable with exactly two observed levels.")
    try:
        ordered = sorted(values, key=lambda value: float(value))
    except Exception:
        ordered = sorted(values, key=lambda value: str(value))
    negative, positive = ordered[0], ordered[-1]
    return pd.Series(series).map(lambda value: np.nan if pd.isna(value) else int(value == positive)), clean_value(negative), clean_value(positive)

def event_indicator(series):
    observed = pd.Series(series).dropna()
    if set(observed.unique()).issubset({0, 1, 0.0, 1.0, True, False}):
        return pd.Series(series).map(lambda value: np.nan if pd.isna(value) else int(bool(value)))
    return as_binary_numeric(series)[0]

def cramers_v(table):
    arr = np.asarray(table, dtype=float)
    chi2, _, _, _ = stats.chi2_contingency(arr)
    n = arr.sum()
    if n == 0:
        return None
    r, k = arr.shape
    return clean_value(math.sqrt((chi2 / n) / max(1, min(k - 1, r - 1))))

def confidence_level(alpha):
    return clean_value(1 - float(alpha))

def mean_ci(mean, se, df, alpha):
    if se is None or pd.isna(se) or df is None or df <= 0:
        return None, None
    crit = float(stats.t.ppf(1 - float(alpha) / 2, df))
    return clean_value(mean - crit * se), clean_value(mean + crit * se)

def hedges_correction(df):
    return clean_value(1 - (3 / (4 * df - 1))) if df and df > 1 else None

def two_sample_summary(y0, y1, equal_var, alpha):
    y0 = pd.Series(y0).dropna().astype(float)
    y1 = pd.Series(y1).dropna().astype(float)
    n0 = int(len(y0))
    n1 = int(len(y1))
    mean0 = float(y0.mean())
    mean1 = float(y1.mean())
    var0 = float(y0.var(ddof=1)) if n0 > 1 else np.nan
    var1 = float(y1.var(ddof=1)) if n1 > 1 else np.nan
    diff = mean1 - mean0
    pooled_var = ((n0 - 1) * var0 + (n1 - 1) * var1) / max(1, n0 + n1 - 2)
    pooled_sd = math.sqrt(max(0.0, pooled_var)) if not pd.isna(pooled_var) else np.nan
    if equal_var:
        se = pooled_sd * math.sqrt((1 / n0) + (1 / n1)) if n0 and n1 and not pd.isna(pooled_sd) else np.nan
        dfree = n0 + n1 - 2
    else:
        se = math.sqrt((var0 / n0) + (var1 / n1)) if n0 and n1 and not pd.isna(var0) and not pd.isna(var1) else np.nan
        numerator = ((var0 / n0) + (var1 / n1)) ** 2
        denominator = ((var0 / n0) ** 2 / max(1, n0 - 1)) + ((var1 / n1) ** 2 / max(1, n1 - 1))
        dfree = numerator / denominator if denominator else np.nan
    ci_low, ci_high = mean_ci(diff, se, dfree, alpha)
    cohen_d = diff / pooled_sd if pooled_sd and not pd.isna(pooled_sd) else np.nan
    correction = hedges_correction(n0 + n1 - 2)
    return {
        "mean_difference": clean_value(diff),
        "standard_error": clean_value(se),
        "degrees_of_freedom": clean_value(dfree),
        "ci_low": ci_low,
        "ci_high": ci_high,
        "ci_level": confidence_level(alpha),
        "cohen_d": clean_value(cohen_d),
        "hedges_g": clean_value(cohen_d * correction if correction is not None and not pd.isna(cohen_d) else None),
        "pooled_sd": clean_value(pooled_sd),
        "variance_ratio": clean_value(var1 / var0 if var0 and not pd.isna(var0) and not pd.isna(var1) else None),
    }

def paired_difference_summary(diff, alpha):
    diff = pd.Series(diff).dropna().astype(float)
    n = int(len(diff))
    mean_diff = float(diff.mean()) if n else np.nan
    sd_diff = float(diff.std(ddof=1)) if n > 1 else np.nan
    se = sd_diff / math.sqrt(n) if n > 0 and not pd.isna(sd_diff) else np.nan
    ci_low, ci_high = mean_ci(mean_diff, se, n - 1, alpha)
    return {
        "mean_difference": clean_value(mean_diff),
        "sd_difference": clean_value(sd_diff),
        "standard_error": clean_value(se),
        "degrees_of_freedom": clean_value(n - 1),
        "ci_low": ci_low,
        "ci_high": ci_high,
        "ci_level": confidence_level(alpha),
        "standardized_mean_change": clean_value(mean_diff / sd_diff if sd_diff and not pd.isna(sd_diff) else None),
    }

def fisher_z_ci(r, n, alpha):
    if r is None or pd.isna(r) or n is None or n <= 3 or abs(float(r)) >= 1:
        return None, None
    z = math.atanh(float(r))
    se = 1 / math.sqrt(n - 3)
    crit = float(stats.norm.ppf(1 - float(alpha) / 2))
    return clean_value(math.tanh(z - crit * se)), clean_value(math.tanh(z + crit * se))

def two_by_two_effects(table, alpha):
    if table.shape != (2, 2):
        return {}
    arr_raw = np.asarray(table, dtype=float)
    exposure_negative = clean_value(table.index[0])
    exposure_positive = clean_value(table.index[1])
    outcome_negative = clean_value(table.columns[0])
    outcome_positive = clean_value(table.columns[1])
    exposed_negative = float(arr_raw[1, 0])
    exposed_positive = float(arr_raw[1, 1])
    unexposed_negative = float(arr_raw[0, 0])
    unexposed_positive = float(arr_raw[0, 1])
    correction_used = bool(np.any(arr_raw == 0))
    arr = arr_raw + 0.5 if correction_used else arr_raw.copy()
    b = float(arr[1, 0])
    a = float(arr[1, 1])
    d = float(arr[0, 0])
    c = float(arr[0, 1])
    exposed_total = a + b
    unexposed_total = c + d
    risk_exposed = a / exposed_total if exposed_total else np.nan
    risk_unexposed = c / unexposed_total if unexposed_total else np.nan
    odds_ratio = (a * d) / (b * c) if b * c else np.nan
    risk_ratio = risk_exposed / risk_unexposed if risk_unexposed else np.nan
    risk_difference = risk_exposed - risk_unexposed
    z = float(stats.norm.ppf(1 - float(alpha) / 2))
    log_or_se = math.sqrt((1 / a) + (1 / b) + (1 / c) + (1 / d)) if min(a, b, c, d) > 0 else np.nan
    log_rr_se = math.sqrt(max(0.0, (1 / a) - (1 / exposed_total) + (1 / c) - (1 / unexposed_total))) if a > 0 and c > 0 and exposed_total > 0 and unexposed_total > 0 else np.nan
    rd_se = math.sqrt((risk_exposed * (1 - risk_exposed) / exposed_total) + (risk_unexposed * (1 - risk_unexposed) / unexposed_total)) if exposed_total and unexposed_total else np.nan
    return {
        "exposure_negative_level": exposure_negative,
        "exposure_positive_level": exposure_positive,
        "outcome_negative_level": outcome_negative,
        "outcome_positive_level": outcome_positive,
        "exposed_positive": clean_value(exposed_positive),
        "exposed_negative": clean_value(exposed_negative),
        "unexposed_positive": clean_value(unexposed_positive),
        "unexposed_negative": clean_value(unexposed_negative),
        "risk_exposed": clean_value(risk_exposed),
        "risk_unexposed": clean_value(risk_unexposed),
        "risk_difference": clean_value(risk_difference),
        "risk_difference_ci_low": clean_value(risk_difference - z * rd_se if not pd.isna(rd_se) else None),
        "risk_difference_ci_high": clean_value(risk_difference + z * rd_se if not pd.isna(rd_se) else None),
        "risk_ratio": clean_value(risk_ratio),
        "rr_ci_low": clean_value(math.exp(math.log(risk_ratio) - z * log_rr_se) if risk_ratio and risk_ratio > 0 and not pd.isna(log_rr_se) else None),
        "rr_ci_high": clean_value(math.exp(math.log(risk_ratio) + z * log_rr_se) if risk_ratio and risk_ratio > 0 and not pd.isna(log_rr_se) else None),
        "odds_ratio": clean_value(odds_ratio),
        "or_ci_low": clean_value(math.exp(math.log(odds_ratio) - z * log_or_se) if odds_ratio and odds_ratio > 0 and not pd.isna(log_or_se) else None),
        "or_ci_high": clean_value(math.exp(math.log(odds_ratio) + z * log_or_se) if odds_ratio and odds_ratio > 0 and not pd.isna(log_or_se) else None),
        "continuity_correction_used": correction_used,
        "ci_level": confidence_level(alpha),
    }

def effect_ci_from_model(model, term):
    ci = model.conf_int()
    if hasattr(ci, "loc"):
        return clean_value(ci.loc[term, 0]), clean_value(ci.loc[term, 1])
    idx = list(model.params.index).index(term)
    return clean_value(ci[idx][0]), clean_value(ci[idx][1])

def regression_diagnostics(model, x, y, family):
    out = {"model_family": family}
    try:
        fitted = pd.Series(model.fittedvalues)
        resid = pd.Series(getattr(model, "resid", getattr(model, "resid_response", y - fitted)))
        predictor_cols = [c for c in x.columns if c != "const"]
        out.update({
            "aic": clean_value(getattr(model, "aic", None)),
            "bic": clean_value(getattr(model, "bic", None)),
            "n_obs": int(len(y)),
            "n_predictors": int(len(predictor_cols)),
            "df_resid": clean_value(getattr(model, "df_resid", None)),
            "residual_mean": clean_value(resid.mean()),
            "residual_sd": clean_value(resid.std(ddof=1)),
            "converged": clean_value(getattr(model, "converged", None)),
        })
        if hasattr(model, "pearson_chi2"):
            out["pearson_chi2"] = clean_value(getattr(model, "pearson_chi2", None))
            out["overdispersion_ratio"] = clean_value(float(model.pearson_chi2) / max(1, float(getattr(model, "df_resid", 1))))
        try:
            out["condition_number"] = clean_value(float(np.linalg.cond(np.asarray(x, dtype=float))))
        except Exception:
            pass
        if len(resid) >= 8:
            out["shapiro_p_value"] = clean_value(stats.shapiro(resid.sample(min(len(resid), 5000), random_state=1))[1])
        if hasattr(model, "get_influence"):
            infl = model.get_influence()
            hat = getattr(infl, "hat_matrix_diag", None)
            cooks = infl.cooks_distance[0] if hasattr(infl, "cooks_distance") else None
            if hat is not None:
                out["max_leverage"] = clean_value(np.nanmax(hat))
            if cooks is not None:
                out["max_cooks_distance"] = clean_value(np.nanmax(cooks))
    except Exception as exc:
        out["diagnostic_error"] = str(exc)
    try:
        cols = [c for c in x.columns if c != "const"]
        vif = []
        for col in cols:
            yv = x[col].astype(float)
            xv = sm.add_constant(x[[c for c in cols if c != col]].astype(float), has_constant="add")
            r2 = sm.OLS(yv, xv).fit().rsquared if xv.shape[1] > 1 else 0
            vif.append({"term": col, "vif": clean_value(1 / max(1e-9, 1 - r2))})
        out["vif"] = vif
        out["max_vif"] = clean_value(max([r["vif"] for r in vif if r["vif"] is not None], default=None))
    except Exception as exc:
        out["vif_error"] = str(exc)
    return out

def km_curve(time, event, group=None):
    frame = pd.DataFrame({"time": pd.to_numeric(time, errors="coerce"), "event": event_indicator(event)})
    if group is not None:
        frame["group"] = group
    frame = frame.dropna()
    rows = []
    groups = [("__all__", frame)] if group is None else list(frame.groupby("group", dropna=False))
    for g, data in groups:
        data = data.sort_values("time")
        survival = 1.0
        greenwood_sum = 0.0
        for t in sorted(data["time"].unique()):
            at_risk = int((data["time"] >= t).sum())
            events = int(((data["time"] == t) & (data["event"] == 1)).sum())
            censored = int(((data["time"] == t) & (data["event"] == 0)).sum())
            if at_risk > 0 and events > 0:
                survival *= (1 - events / at_risk)
                if at_risk > events:
                    greenwood_sum += events / (at_risk * (at_risk - events))
            se = survival * math.sqrt(greenwood_sum) if greenwood_sum >= 0 else np.nan
            lower = max(0.0, survival - 1.96 * se) if not pd.isna(se) else None
            upper = min(1.0, survival + 1.96 * se) if not pd.isna(se) else None
            rows.append({"group": clean_value(g), "time": clean_value(t), "at_risk": at_risk, "events": events, "censored": censored, "survival": clean_value(survival), "survival_ci_low": clean_value(lower), "survival_ci_high": clean_value(upper), "greenwood_se": clean_value(se)})
    return rows

def logrank_two_group(time, event, group):
    frame = pd.DataFrame({"time": pd.to_numeric(time, errors="coerce"), "event": event_indicator(event), "group": group}).dropna()
    groups = list(frame["group"].unique())
    if len(groups) != 2:
        raise ValueError("Log-rank test requires exactly two groups.")
    g1 = groups[1]
    o1 = e1 = v1 = 0.0
    for t in sorted(frame.loc[frame["event"] == 1, "time"].unique()):
        risk = frame["time"] >= t
        d = int(((frame["time"] == t) & (frame["event"] == 1)).sum())
        n = int(risk.sum())
        n1 = int((risk & (frame["group"] == g1)).sum())
        d1 = int(((frame["time"] == t) & (frame["event"] == 1) & (frame["group"] == g1)).sum())
        if n > 1:
            o1 += d1
            e1 += d * n1 / n
            v1 += (n1 / n) * (1 - n1 / n) * d * (n - d) / max(1, n - 1)
    z = (o1 - e1) / math.sqrt(v1) if v1 > 0 else np.nan
    chi2 = z * z if not pd.isna(z) else np.nan
    p = 1 - stats.chi2.cdf(chi2, 1) if not pd.isna(chi2) else np.nan
    return {"group_contrast": f"{groups[1]} vs {groups[0]}", "observed_events": clean_value(o1), "expected_events": clean_value(e1), "chi_square": clean_value(chi2), "p_value": clean_value(p)}

def survival_group_summary(time, event, group=None):
    frame = pd.DataFrame({"time": pd.to_numeric(time, errors="coerce"), "event": event_indicator(event)})
    if group is None:
        frame = frame.dropna()
        grouped = [("__all__", frame)]
    else:
        frame["group"] = group
        frame = frame.dropna()
        grouped = list(frame.groupby("group", dropna=False))
    rows = []
    for label, data in grouped:
        rows.append({
            "group": clean_value(label),
            "n": int(data.shape[0]),
            "events": int(data["event"].sum()),
            "censored": int((data["event"] == 0).sum()),
            "time_min": clean_value(data["time"].min()),
            "time_max": clean_value(data["time"].max()),
            "median_followup_time": clean_value(data["time"].median()),
        })
    return rows

def km_final_summary(rows):
    out = []
    groups = sorted(set(r["group"] for r in rows), key=str)
    for g in groups:
        group_rows = [r for r in rows if r["group"] == g]
        if not group_rows:
            continue
        median_rows = [r for r in group_rows if r.get("survival") is not None and r["survival"] <= 0.5]
        out.append({
            "term": str(g),
            "time": clean_value(max([r["time"] for r in group_rows], default=None)),
            "survival": clean_value(group_rows[-1]["survival"]),
            "survival_ci_low": clean_value(group_rows[-1].get("survival_ci_low")),
            "survival_ci_high": clean_value(group_rows[-1].get("survival_ci_high")),
            "median_survival_time": clean_value(median_rows[0]["time"] if median_rows else None),
            "events": int(sum(r.get("events", 0) for r in group_rows)),
            "last_at_risk": int(group_rows[-1].get("at_risk", 0)),
        })
    return out

def harrell_c_index(time, event, risk_score):
    frame = pd.DataFrame({"time": pd.to_numeric(time, errors="coerce"), "event": event_indicator(event), "risk": pd.to_numeric(risk_score, errors="coerce")}).dropna()
    concordant = 0.0
    comparable = 0.0
    tied_risk = 0.0
    values = frame[["time", "event", "risk"]].to_numpy(dtype=float)
    for i in range(len(values)):
        for j in range(i + 1, len(values)):
            ti, ei, ri = values[i]
            tj, ej, rj = values[j]
            if ti == tj:
                continue
            if ei == 1 and ti < tj:
                comparable += 1
                if ri > rj:
                    concordant += 1
                elif ri == rj:
                    tied_risk += 1
            elif ej == 1 and tj < ti:
                comparable += 1
                if rj > ri:
                    concordant += 1
                elif ri == rj:
                    tied_risk += 1
    return clean_value((concordant + 0.5 * tied_risk) / comparable if comparable else None), int(comparable)

def tied_event_time_count(time, event):
    frame = pd.DataFrame({"time": pd.to_numeric(time, errors="coerce"), "event": event_indicator(event)}).dropna()
    counts = frame.loc[frame["event"] == 1, "time"].value_counts()
    return int((counts > 1).sum())

def poisson_rate_interval(events, person_time, alpha):
    events = float(events)
    person_time = float(person_time)
    if person_time <= 0:
        return None, None
    low = 0.0 if events == 0 else stats.chi2.ppf(float(alpha) / 2, 2 * events) / (2 * person_time)
    high = stats.chi2.ppf(1 - float(alpha) / 2, 2 * (events + 1)) / (2 * person_time)
    return clean_value(low), clean_value(high)

def cif_curve(time, event_code, event_of_interest=1, competing_codes=None, group=None):
    frame = pd.DataFrame({"time": pd.to_numeric(time, errors="coerce"), "event_code": pd.to_numeric(event_code, errors="coerce")})
    if group is not None:
        frame["group"] = group
    frame = frame.dropna()
    rows = []
    groups = [("__all__", frame)] if group is None else list(frame.groupby("group", dropna=False))
    for g, data in groups:
        surv = 1.0
        cif = 0.0
        for t in sorted(data.loc[data["event_code"] != 0, "time"].unique()):
            at_risk = int((data["time"] >= t).sum())
            all_events = int(((data["time"] == t) & (data["event_code"] != 0)).sum())
            target_events = int(((data["time"] == t) & (data["event_code"] == event_of_interest)).sum())
            if at_risk > 0:
                cif += surv * target_events / at_risk
                surv *= (1 - all_events / at_risk)
            rows.append({"group": clean_value(g), "time": clean_value(t), "at_risk": at_risk, "target_events": target_events, "all_events": all_events, "cumulative_incidence": clean_value(cif), "survival_free_of_any_event": clean_value(surv)})
    return rows

def binary_series(series):
    values = list(pd.Series(series).dropna().unique())
    if len(values) != 2:
        raise ValueError("Expected binary outcome/group with exactly two observed levels.")
    mapping = {values[0]: 0, values[1]: 1}
    return pd.Series(series).map(mapping).astype(float), values

def binary_indicator(series):
    observed = pd.Series(series).dropna()
    values = list(observed.unique())
    if len(values) != 2:
        raise ValueError("Expected binary diagnostic test/reference with exactly two observed levels.")
    try:
        ordered = sorted(values, key=lambda value: float(value))
    except Exception:
        ordered = sorted(values, key=lambda value: str(value))
    negative, positive = ordered[0], ordered[-1]
    return pd.Series(series).map(lambda value: np.nan if pd.isna(value) else bool(value == positive)), negative, positive

def threshold_indicator(series, threshold):
    numeric = pd.to_numeric(series, errors="coerce")
    return numeric.map(lambda value: np.nan if pd.isna(value) else bool(value >= float(threshold)))

def safe_divide(num, den):
    return clean_value(float(num) / float(den)) if den else None

def wilson_interval(successes, total, alpha=0.05):
    if not total:
        return (None, None)
    z = float(stats.norm.ppf(1 - alpha / 2))
    p = float(successes) / float(total)
    denom = 1 + (z * z / total)
    center = (p + (z * z) / (2 * total)) / denom
    half = (z / denom) * math.sqrt((p * (1 - p) / total) + ((z * z) / (4 * total * total)))
    return (clean_value(max(0.0, center - half)), clean_value(min(1.0, center + half)))

def design_matrix(df, exposure, covariates):
    cols = [exposure] + list(covariates)
    x = pd.get_dummies(df[cols], drop_first=True, dtype=float)
    return sm.add_constant(x, has_constant="add")

def covariate_matrix(df, covariates):
    if not covariates:
        raise ValueError("Propensity methods require at least one baseline covariate.")
    x = pd.get_dummies(df[list(covariates)], drop_first=True, dtype=float)
    if x.shape[1] == 0:
        raise ValueError("Propensity covariates produced an empty design matrix.")
    return x

def deterministic_binary_indicator(series, threshold=None):
    if threshold is not None:
        numeric = pd.to_numeric(series, errors="coerce")
        return numeric.map(lambda value: np.nan if pd.isna(value) else int(value >= float(threshold))), f"<{threshold}", f">={threshold}"
    observed = pd.Series(series).dropna()
    values = list(observed.unique())
    if len(values) != 2:
        raise ValueError("Propensity treatment/exposure must be binary or have an exposure threshold.")
    try:
        ordered = sorted(values, key=lambda value: float(value))
    except Exception:
        ordered = sorted(values, key=lambda value: str(value))
    negative, positive = ordered[0], ordered[-1]
    return pd.Series(series).map(lambda value: np.nan if pd.isna(value) else int(value == positive)), clean_value(negative), clean_value(positive)

def safe_logit(p):
    p = np.clip(pd.to_numeric(p, errors="coerce").astype(float), 1e-6, 1 - 1e-6)
    return np.log(p / (1 - p))

def fit_propensity_scores(data, treatment, covariates):
    if sm is None:
        raise ValueError("statsmodels is required for propensity score methods.")
    x = covariate_matrix(data, covariates)
    x_model = sm.add_constant(x, has_constant="add")
    model = sm.GLM(data[treatment].astype(float), x_model, family=sm.families.Binomial()).fit()
    ps = pd.Series(model.predict(x_model), index=data.index).clip(1e-6, 1 - 1e-6)
    return ps, x, model

def weighted_mean(values, weights):
    values = pd.to_numeric(values, errors="coerce").astype(float)
    weights = pd.to_numeric(weights, errors="coerce").astype(float)
    total = float(weights.sum())
    if total <= 0:
        return np.nan
    return float((values * weights).sum() / total)

def weighted_var(values, weights):
    values = pd.to_numeric(values, errors="coerce").astype(float)
    weights = pd.to_numeric(weights, errors="coerce").astype(float)
    total = float(weights.sum())
    if total <= 0:
        return np.nan
    mean = weighted_mean(values, weights)
    return float((weights * (values - mean) ** 2).sum() / total)

def balance_rows(x, treatment, adjusted_weights=None, baseline_denominators=None):
    rows = []
    t = pd.Series(treatment).astype(int)
    treated = t == 1
    control = t == 0
    if adjusted_weights is None:
        adjusted_weights = pd.Series(1.0, index=x.index)
    else:
        adjusted_weights = pd.Series(adjusted_weights, index=x.index).astype(float)
    denominators = {}
    for column_index, col in enumerate(x.columns):
        values = pd.to_numeric(x.iloc[:, column_index], errors="coerce").astype(float)
        mt = float(values[treated].mean()) if treated.any() else np.nan
        mc = float(values[control].mean()) if control.any() else np.nan
        vt = float(values[treated].var(ddof=1)) if treated.sum() > 1 else 0.0
        vc = float(values[control].var(ddof=1)) if control.sum() > 1 else 0.0
        denom = math.sqrt(max(0.0, (vt + vc) / 2))
        if not denom or math.isnan(denom):
            denom = 1.0 if abs(mt - mc) > 0 else 1.0
        denominators[col] = denom
        base = baseline_denominators[col] if baseline_denominators and col in baseline_denominators else denom
        w_t = adjusted_weights[treated]
        w_c = adjusted_weights[control]
        adj_mt = weighted_mean(values[treated], w_t)
        adj_mc = weighted_mean(values[control], w_c)
        adj_vt = weighted_var(values[treated], w_t)
        adj_vc = weighted_var(values[control], w_c)
        rows.append({
            "covariate": str(col),
            "treated_mean_before": clean_value(mt),
            "control_mean_before": clean_value(mc),
            "smd_before": clean_value((mt - mc) / denom),
            "treated_mean_after": clean_value(adj_mt),
            "control_mean_after": clean_value(adj_mc),
            "smd_after": clean_value((adj_mt - adj_mc) / base if base else None),
            "variance_ratio_after": clean_value(adj_vt / adj_vc if adj_vc and not math.isnan(adj_vc) else None),
        })
    return rows, denominators

def balance_summary(rows):
    before = [abs(r["smd_before"]) for r in rows if r.get("smd_before") is not None]
    after = [abs(r["smd_after"]) for r in rows if r.get("smd_after") is not None]
    return {
        "max_abs_smd_before": clean_value(max(before) if before else None),
        "max_abs_smd_after": clean_value(max(after) if after else None),
        "mean_abs_smd_before": clean_value(float(np.mean(before)) if before else None),
        "mean_abs_smd_after": clean_value(float(np.mean(after)) if after else None),
        "covariates_over_0_1_before": int(sum(v > 0.1 for v in before)),
        "covariates_over_0_1_after": int(sum(v > 0.1 for v in after)),
        "covariate_terms": int(len(rows)),
    }

def positivity_summary(ps, treatment):
    t = pd.Series(treatment).astype(int)
    treated_ps = pd.Series(ps)[t == 1]
    control_ps = pd.Series(ps)[t == 0]
    lower = max(float(treated_ps.min()), float(control_ps.min()))
    upper = min(float(treated_ps.max()), float(control_ps.max()))
    in_support = (pd.Series(ps) >= lower) & (pd.Series(ps) <= upper)
    return {
        "treated_min": clean_value(treated_ps.min()),
        "treated_max": clean_value(treated_ps.max()),
        "control_min": clean_value(control_ps.min()),
        "control_max": clean_value(control_ps.max()),
        "common_support_lower": clean_value(lower),
        "common_support_upper": clean_value(upper),
        "common_support_fraction": clean_value(float(in_support.mean())),
    }

def overlap_rows(ps, treatment, bins=10):
    frame = pd.DataFrame({"propensity_score": pd.Series(ps).astype(float), "treatment": pd.Series(treatment).astype(int)})
    edges = np.linspace(0.0, 1.0, bins + 1)
    rows = []
    for i in range(bins):
        low = float(edges[i])
        high = float(edges[i + 1])
        if i == bins - 1:
            subset = frame[(frame["propensity_score"] >= low) & (frame["propensity_score"] <= high)]
        else:
            subset = frame[(frame["propensity_score"] >= low) & (frame["propensity_score"] < high)]
        treated = int((subset["treatment"] == 1).sum())
        control = int((subset["treatment"] == 0).sum())
        rows.append({
            "bin": i + 1,
            "lower": clean_value(low),
            "upper": clean_value(high),
            "treated": treated,
            "control": control,
            "both_groups_present": bool(treated > 0 and control > 0),
        })
    return rows

def exact_key(row, exact_covariates):
    if not exact_covariates:
        return "__all__"
    return tuple(row[col] for col in exact_covariates)

def nearest_neighbor_match(data, treatment_col, ps, exact_covariates, ratio, caliper_sd, replacement):
    logits = pd.Series(safe_logit(ps), index=data.index)
    sd = float(logits.std(ddof=1)) if len(logits) > 1 else 0.0
    caliper_width = float(caliper_sd) * sd if sd > 0 else float("inf")
    treated_idx = list(data.index[data[treatment_col] == 1])
    control_idx = list(data.index[data[treatment_col] == 0])
    control_available = set(control_idx)
    control_use_count = {idx: 0 for idx in control_idx}
    pairs = []
    matched_indices = set()
    unmatched = []
    ordered_treated = sorted(treated_idx, key=lambda idx: float(logits.loc[idx]))
    for tidx in ordered_treated:
        candidates = control_idx if replacement else [idx for idx in control_idx if idx in control_available]
        tkey = exact_key(data.loc[tidx], exact_covariates)
        scored = []
        for cidx in candidates:
            if exact_key(data.loc[cidx], exact_covariates) != tkey:
                continue
            distance = abs(float(logits.loc[tidx]) - float(logits.loc[cidx]))
            if distance <= caliper_width:
                scored.append((distance, cidx))
        scored.sort(key=lambda item: (item[0], str(item[1])))
        chosen = [cidx for _, cidx in scored[:ratio]]
        if len(chosen) < ratio:
            unmatched.append(tidx)
            continue
        matched_indices.add(tidx)
        for cidx in chosen:
            matched_indices.add(cidx)
            control_use_count[cidx] += 1
            if not replacement and cidx in control_available:
                control_available.remove(cidx)
            pairs.append({
                "pair_id": len(pairs) + 1,
                "treated_row_index": int(tidx) if isinstance(tidx, (int, np.integer)) else str(tidx),
                "control_row_index": int(cidx) if isinstance(cidx, (int, np.integer)) else str(cidx),
                "treated_propensity_score": clean_value(ps.loc[tidx]),
                "control_propensity_score": clean_value(ps.loc[cidx]),
                "logit_distance": clean_value(abs(float(logits.loc[tidx]) - float(logits.loc[cidx]))),
            })
    weights = pd.Series(0.0, index=data.index)
    for idx in matched_indices:
        if data.loc[idx, treatment_col] == 1:
            weights.loc[idx] = 1.0
    for idx, count in control_use_count.items():
        if count:
            weights.loc[idx] = float(count) / float(ratio)
    return pairs, weights, {
        "match_ratio": int(ratio),
        "replacement": bool(replacement),
        "caliper_logit_sd": clean_value(caliper_sd),
        "caliper_logit_width": clean_value(caliper_width),
        "treated_total": int(len(treated_idx)),
        "control_total": int(len(control_idx)),
        "matched_treated": int(len(set([p["treated_row_index"] for p in pairs]))),
        "matched_controls": int(len(set([p["control_row_index"] for p in pairs]))),
        "matched_pairs": int(len(pairs)),
        "unmatched_treated": int(len(unmatched)),
        "control_reuse_max": int(max(control_use_count.values()) if control_use_count else 0),
    }

def propensity_weights(treatment, ps, estimand, stabilize=True):
    t = pd.Series(treatment).astype(int)
    p_treat = float(t.mean())
    if estimand == "ATE":
        w = t / ps + (1 - t) / (1 - ps)
        if stabilize:
            w = t * p_treat / ps + (1 - t) * (1 - p_treat) / (1 - ps)
    else:
        w = t + (1 - t) * ps / (1 - ps)
        if stabilize:
            w = t * 1.0 + (1 - t) * p_treat / max(1e-6, 1 - p_treat) * ps / (1 - ps)
    return pd.Series(w, index=ps.index).astype(float)

def effective_sample_size(weights):
    weights = pd.Series(weights).astype(float)
    denom = float((weights ** 2).sum())
    if denom <= 0:
        return None
    return clean_value(float(weights.sum() ** 2 / denom))

def treatment_effect_estimate(data, treatment_col, outcome_col, weights, estimand, method_label):
    y_raw = data[outcome_col]
    t = data[treatment_col].astype(int)
    weights = pd.Series(weights, index=data.index).astype(float)
    active = weights > 0
    y_num = pd.to_numeric(y_raw, errors="coerce")
    binary_outcome = set(pd.Series(y_raw[active]).dropna().unique()).issubset({0, 1, 0.0, 1.0, True, False})
    x = sm.add_constant(pd.DataFrame({treatment_col: t[active].astype(float)}), has_constant="add")
    treated_n = int(((t == 1) & active).sum())
    control_n = int(((t == 0) & active).sum())
    treated_mean = weighted_mean(y_num[(t == 1) & active], weights[(t == 1) & active])
    control_mean = weighted_mean(y_num[(t == 0) & active], weights[(t == 0) & active])
    if binary_outcome:
        y = pd.Series(y_raw).astype(float)
        model = sm.GLM(y[active], x, family=sm.families.Binomial(), freq_weights=weights[active]).fit()
        ci = model.conf_int()
        log_or = float(model.params[treatment_col])
        p_value = float(model.pvalues[treatment_col])
        risk_difference = treated_mean - control_mean
        return {
            "term": str(treatment_col),
            "method": method_label,
            "estimand": estimand,
            "effect_measure": "risk difference and odds ratio",
            "estimate": clean_value(risk_difference),
            "risk_difference": clean_value(risk_difference),
            "treated_risk": clean_value(treated_mean),
            "control_risk": clean_value(control_mean),
            "log_odds_ratio": clean_value(log_or),
            "odds_ratio": clean_value(safe_exp(log_or)),
            "or_ci_low": clean_value(safe_exp(ci.loc[treatment_col, 0])),
            "or_ci_high": clean_value(safe_exp(ci.loc[treatment_col, 1])),
            "p_value": clean_value(p_value),
            "treated_n": treated_n,
            "control_n": control_n,
        }
    y = y_num
    model = sm.WLS(y[active], x, weights=weights[active]).fit()
    ci = model.conf_int()
    effect = float(model.params[treatment_col])
    return {
        "term": str(treatment_col),
        "method": method_label,
        "estimand": estimand,
        "effect_measure": "mean difference",
        "estimate": clean_value(effect),
        "mean_difference": clean_value(effect),
        "treated_mean": clean_value(treated_mean),
        "control_mean": clean_value(control_mean),
        "std_error": clean_value(model.bse[treatment_col]),
        "ci_low": clean_value(ci.loc[treatment_col, 0]),
        "ci_high": clean_value(ci.loc[treatment_col, 1]),
        "p_value": clean_value(model.pvalues[treatment_col]),
        "treated_n": treated_n,
        "control_n": control_n,
    }

def treatment_group_summary(data, treatment_col):
    t = pd.Series(data[treatment_col]).astype(int)
    return {
        "treated_n": int((t == 1).sum()),
        "control_n": int((t == 0).sum()),
        "treated_fraction": clean_value(float((t == 1).mean()) if len(t) else None),
    }

def treatment_period_summary(data, treatment_col, post_col):
    frame = pd.DataFrame({"treatment": pd.Series(data[treatment_col]).astype(int), "post": pd.Series(data[post_col]).astype(int)})
    table = pd.crosstab(frame["treatment"], frame["post"])
    cells = []
    for treatment_level in sorted(frame["treatment"].dropna().unique()):
        for post_level in sorted(frame["post"].dropna().unique()):
            cells.append({
                "treatment": clean_value(treatment_level),
                "post": clean_value(post_level),
                "n": int(((frame["treatment"] == treatment_level) & (frame["post"] == post_level)).sum()),
            })
    return {
        "table": table.to_dict(),
        "cells": cells,
        "min_cell_n": int(min([cell["n"] for cell in cells], default=0)),
    }

def prediction_calibration_rows(y, score, bins=10):
    frame = pd.DataFrame({"y": pd.Series(y).astype(float), "score": pd.Series(score).astype(float)}).dropna()
    if frame.empty:
        return []
    try:
        frame["bin"] = pd.qcut(frame["score"], q=min(bins, frame["score"].nunique()), duplicates="drop")
    except Exception:
        frame["bin"] = pd.cut(frame["score"], bins=min(bins, max(1, frame["score"].nunique())), include_lowest=True, duplicates="drop")
    rows = []
    for label, data in frame.groupby("bin", observed=False):
        rows.append({
            "bin": str(label),
            "n": int(data.shape[0]),
            "mean_score": clean_value(data["score"].mean()),
            "observed_event_rate": clean_value(data["y"].mean()),
            "event_count": int(data["y"].sum()),
        })
    return rows

def threshold_metrics(y, score, threshold):
    y = pd.Series(y).astype(int)
    score = pd.Series(score).astype(float)
    pred = (score >= threshold).astype(int)
    tn, fp, fn, tp = confusion_matrix(y, pred, labels=[0, 1]).ravel()
    sensitivity = safe_divide(tp, tp + fn)
    specificity = safe_divide(tn, tn + fp)
    precision = safe_divide(tp, tp + fp)
    npv = safe_divide(tn, tn + fn)
    recall = sensitivity
    f1 = safe_divide(2 * precision * recall, precision + recall) if precision is not None and recall is not None else None
    accuracy = safe_divide(tp + tn, tp + tn + fp + fn)
    return {
        "threshold": clean_value(threshold),
        "true_positive": int(tp),
        "false_positive": int(fp),
        "true_negative": int(tn),
        "false_negative": int(fn),
        "sensitivity": sensitivity,
        "specificity": specificity,
        "precision": precision,
        "positive_predictive_value": precision,
        "negative_predictive_value": npv,
        "f1": clean_value(f1),
        "accuracy": accuracy,
    }

def cronbach_alpha_for_matrix(mat):
    k = mat.shape[1]
    return k / (k - 1) * (1 - mat.var(axis=0, ddof=1).sum() / mat.sum(axis=1).var(ddof=1)) if k > 1 else np.nan

def item_total_rows(mat):
    rows = []
    total = mat.sum(axis=1)
    for col in mat.columns:
        remainder = total - mat[col]
        corr = stats.pearsonr(mat[col], remainder)[0] if len(mat) > 3 and remainder.std(ddof=1) > 0 and mat[col].std(ddof=1) > 0 else np.nan
        subset = mat[[c for c in mat.columns if c != col]]
        rows.append({
            "item": str(col),
            "mean": clean_value(mat[col].mean()),
            "sd": clean_value(mat[col].std(ddof=1)),
            "item_total_correlation": clean_value(corr),
            "alpha_if_deleted": clean_value(cronbach_alpha_for_matrix(subset)) if subset.shape[1] > 1 else None,
        })
    return rows

def descriptive(df, req):
    variables = req.get("variables") or list(df.columns)
    require_columns(df, variables)
    rows = []
    for col in variables:
        s = df[col]
        base = {
            "variable": col,
            "non_missing": int(s.notna().sum()),
            "missing": int(s.isna().sum()),
            "missing_fraction": clean_value(float(s.isna().mean())),
            "inferred_type": str(s.dtype),
        }
        numeric = pd.to_numeric(s, errors="coerce")
        if numeric.notna().sum() >= max(2, s.notna().sum() * 0.8):
            q = numeric.quantile([0.25, 0.5, 0.75])
            base.update({
                "mean": clean_value(numeric.mean()),
                "sd": clean_value(numeric.std(ddof=1)),
                "median": clean_value(q.loc[0.5]),
                "iqr": clean_value(q.loc[0.75] - q.loc[0.25]),
                "min": clean_value(numeric.min()),
                "max": clean_value(numeric.max()),
            })
        else:
            counts = s.astype(str).value_counts(dropna=True).head(10)
            base.update({"levels": len(counts), "top_values": "; ".join([f"{idx}:{int(val)}" for idx, val in counts.items()])})
        rows.append(base)
    return rows, {"complete_case_n": int(df[variables].dropna().shape[0])}

def missingness_profile(data, variables, out_dir):
    selected = data[variables].copy()
    missing = selected.isna()
    input_rows = int(selected.shape[0])
    complete_case_n = int(selected.dropna().shape[0])
    summary_rows = []
    for col in variables:
        miss = int(missing[col].sum())
        summary_rows.append({
            "term": col,
            "missing": miss,
            "non_missing": int(selected[col].notna().sum()),
            "missing_fraction": clean_value(miss / input_rows if input_rows else None),
        })
    pattern_counts = missing.apply(lambda row: "".join("1" if bool(value) else "0" for value in row), axis=1).value_counts(dropna=False)
    pattern_rows = []
    for pattern, count in pattern_counts.items():
        missing_vars = [variables[index] for index, char in enumerate(str(pattern)) if char == "1"]
        pattern_rows.append({
            "pattern": str(pattern),
            "count": int(count),
            "fraction": clean_value(int(count) / input_rows if input_rows else None),
            "missing_variables": ";".join(missing_vars),
        })
    patterns_path = os.path.join(out_dir, "missingness-patterns.csv")
    write_csv(patterns_path, pattern_rows)
    indicators = missing.astype(float)
    pairwise_path = os.path.join(out_dir, "missingness-indicator-correlations.csv")
    pairwise_rows = []
    if len(variables) > 1:
        corr = indicators.corr().fillna(0.0)
        for left in variables:
            for right in variables:
                pairwise_rows.append({"left": left, "right": right, "phi_correlation": clean_value(corr.loc[left, right])})
    write_csv(pairwise_path, pairwise_rows)
    mechanism_rows = []
    for target in variables:
        indicator = missing[target].astype(int)
        if indicator.nunique(dropna=True) < 2:
            continue
        for predictor in variables:
            if predictor == target:
                continue
            pred = selected[predictor]
            numeric = pd.to_numeric(pred, errors="coerce")
            if numeric.notna().sum() >= max(8, pred.notna().sum() * 0.75):
                observed_group = numeric[indicator == 0].dropna()
                missing_group = numeric[indicator == 1].dropna()
                if len(observed_group) >= 3 and len(missing_group) >= 3:
                    stat, p = stats.ttest_ind(missing_group, observed_group, equal_var=False, nan_policy="omit")
                    denom = math.sqrt((observed_group.var(ddof=1) + missing_group.var(ddof=1)) / 2)
                    mechanism_rows.append({
                        "missing_variable": target,
                        "predictor": predictor,
                        "predictor_type": "numeric",
                        "observed_mean": clean_value(observed_group.mean()),
                        "missing_mean": clean_value(missing_group.mean()),
                        "standardized_difference": clean_value((missing_group.mean() - observed_group.mean()) / denom if denom else None),
                        "p_value": clean_value(p),
                    })
            else:
                frame = pd.DataFrame({"missing": indicator, "predictor": pred.astype(str)}).dropna()
                if frame["missing"].nunique() == 2 and frame["predictor"].nunique() > 1:
                    table = pd.crosstab(frame["missing"], frame["predictor"])
                    if table.shape[0] == 2 and table.shape[1] > 1:
                        chi2, p, _, expected = stats.chi2_contingency(table)
                        mechanism_rows.append({
                            "missing_variable": target,
                            "predictor": predictor,
                            "predictor_type": "categorical",
                            "chi_square": clean_value(chi2),
                            "min_expected": clean_value(np.min(expected)),
                            "levels": int(table.shape[1]),
                            "p_value": clean_value(p),
                        })
    mechanism_rows = sorted(mechanism_rows, key=lambda row: (row.get("p_value") is None, row.get("p_value") if row.get("p_value") is not None else 1, str(row.get("missing_variable")), str(row.get("predictor"))))
    mechanism_path = os.path.join(out_dir, "missingness-mechanism-screen.csv")
    write_csv(mechanism_path, mechanism_rows)
    max_missing = max([row["missing_fraction"] for row in summary_rows if row["missing_fraction"] is not None], default=0.0)
    profile = {
        "input_rows": input_rows,
        "complete_case_n": complete_case_n,
        "complete_case_fraction": clean_value(complete_case_n / input_rows if input_rows else None),
        "variables_with_missing": int(sum(row["missing"] > 0 for row in summary_rows)),
        "max_missing_fraction": clean_value(max_missing),
        "missingness_pattern_count": int(len(pattern_rows)),
        "missingness_patterns_path": patterns_path,
        "missingness_pairwise_path": pairwise_path,
        "missingness_mechanism_path": mechanism_path,
        "mechanism_screen": {
            "comparisons": int(len(mechanism_rows)),
            "associations_below_0_05": int(sum((row.get("p_value") is not None and row.get("p_value") < 0.05) for row in mechanism_rows)),
            "minimum_p_value": clean_value(min([row.get("p_value") for row in mechanism_rows if row.get("p_value") is not None], default=None)),
            "interpretation": "Association screening can reject a simple MCAR story but cannot prove MAR or MNAR.",
        },
        "artifacts": {
            "missingness_patterns": patterns_path,
            "missingness_pairwise": pairwise_path,
            "missingness_mechanism": mechanism_path,
        },
    }
    return summary_rows, profile

def run(req):
    df = load_table(req["dataPath"])
    method = req["method"]
    out_dir = req["outDir"]
    warnings = []
    estimates = []
    diagnostics = {}
    params = {"alpha": req.get("alpha", 0.05)}
    issues = []
    variables = []
    figures = []

    if method == "descriptive":
        estimates, extra = descriptive(df, req)
        variables = req.get("variables") or list(df.columns)
        complete = extra["complete_case_n"]
        numeric_vars = [c for c in variables if pd.to_numeric(df[c], errors="coerce").notna().sum() >= 3][:6]
        if numeric_vars:
            figures.append(save_fig(out_dir, "descriptive-histograms.png", "Numeric Distributions", "Histograms for the first numeric variables in the descriptive run.", numeric_vars, lambda: pd.DataFrame({c: pd.to_numeric(df[c], errors="coerce") for c in numeric_vars}).hist(ax=plt.gca()), "Value", "Frequency"))
        missing = df[variables].isna().mean().sort_values(ascending=False)
        figures.append(save_fig(out_dir, "missingness-bar.png", "Missingness By Variable", "Fraction missing for variables included in the run.", variables, lambda: plt.bar(missing.index.astype(str), missing.values), "Variable", "Fraction missing"))
    elif method in ("t-test", "welch-t-test", "paired-t-test", "mann-whitney", "wilcoxon"):
        outcome = req.get("outcome")
        group = req.get("group") or req.get("exposure")
        require_columns(df, [outcome, group])
        variables = [outcome, group]
        data = df[variables].dropna()
        if method in ("paired-t-test", "wilcoxon"):
            if len(req.get("variables") or []) < 2:
                raise ValueError("Paired tests require two repeated-measure variables via --variable.")
            v0, v1 = req.get("variables")[:2]
            require_columns(df, [v0, v1])
            variables = [v0, v1]
            data = df[variables].dropna()
            y0 = pd.to_numeric(data[v0], errors="coerce")
            y1 = pd.to_numeric(data[v1], errors="coerce")
            ok = y0.notna() & y1.notna()
            if method == "paired-t-test":
                stat, p = stats.ttest_rel(y1[ok], y0[ok], nan_policy="omit")
                diff = y1[ok] - y0[ok]
                effect = paired_difference_summary(diff, params["alpha"])
                estimates = [{"term": f"{v1} - {v0}", "n": int(ok.sum()), **effect, "statistic": clean_value(stat), "p_value": clean_value(p)}]
                diagnostics = {"test": "paired t-test", "n_pairs": int(ok.sum())}
            else:
                stat, p = stats.wilcoxon(y1[ok], y0[ok])
                diff = y1[ok] - y0[ok]
                nonzero = diff[diff != 0]
                abs_rank = stats.rankdata(np.abs(nonzero)) if len(nonzero) else []
                signed_rank_sum = float(np.sum(np.sign(nonzero) * abs_rank)) if len(nonzero) else np.nan
                rank_total = float(np.sum(abs_rank)) if len(nonzero) else np.nan
                matched_rank_biserial = signed_rank_sum / rank_total if rank_total else np.nan
                estimates = [{"term": f"{v1} - {v0}", "n": int(ok.sum()), "median_difference": clean_value(diff.median()), "matched_rank_biserial_correlation": clean_value(matched_rank_biserial), "statistic": clean_value(stat), "p_value": clean_value(p)}]
                diagnostics = {"test": "Wilcoxon signed-rank", "n_pairs": int(ok.sum()), "zero_differences": int((diff == 0).sum())}
            complete = int(ok.sum())
        else:
            groups = list(data[group].unique())
            if len(groups) != 2:
                raise ValueError("Expected exactly two groups.")
            y0 = pd.to_numeric(data[data[group] == groups[0]][outcome], errors="coerce").dropna()
            y1 = pd.to_numeric(data[data[group] == groups[1]][outcome], errors="coerce").dropna()
            if method in ("t-test", "welch-t-test"):
                equal_var = method == "t-test"
                stat, p = stats.ttest_ind(y1, y0, equal_var=equal_var, nan_policy="omit")
                effect = two_sample_summary(y0, y1, equal_var, params["alpha"])
                estimates = [{"term": str(group), "group_a": clean_value(groups[0]), "group_b": clean_value(groups[1]), "n_a": len(y0), "n_b": len(y1), "mean_a": clean_value(y0.mean()), "mean_b": clean_value(y1.mean()), **effect, "statistic": clean_value(stat), "p_value": clean_value(p)}]
                diagnostics = {
                    "test": "two-sample t-test",
                    "equal_variance_assumed": equal_var,
                    "group_counts": {str(groups[0]): int(len(y0)), str(groups[1]): int(len(y1))},
                    "sd_a": clean_value(y0.std(ddof=1)),
                    "sd_b": clean_value(y1.std(ddof=1)),
                    "variance_ratio": effect.get("variance_ratio"),
                    "levene_p_value": clean_value(stats.levene(y0, y1)[1]) if len(y0) > 1 and len(y1) > 1 else None,
                }
            else:
                stat, p = stats.mannwhitneyu(y1, y0, alternative="two-sided")
                rank_biserial = (2 * float(stat) / max(1, len(y0) * len(y1))) - 1
                estimates = [{"term": str(group), "group_a": clean_value(groups[0]), "group_b": clean_value(groups[1]), "n_a": len(y0), "n_b": len(y1), "median_a": clean_value(y0.median()), "median_b": clean_value(y1.median()), "median_difference": clean_value(y1.median() - y0.median()), "rank_biserial_correlation": clean_value(rank_biserial), "statistic": clean_value(stat), "p_value": clean_value(p)}]
                diagnostics = {"test": "Mann-Whitney U", "ties_possible": True, "group_counts": {str(groups[0]): int(len(y0)), str(groups[1]): int(len(y1))}}
            complete = int(len(y0) + len(y1))
            figures.append(save_fig(out_dir, "group-distribution.png", "Outcome Distribution By Group", "Boxplot of the numeric outcome by comparison group.", [outcome, group], lambda: data.boxplot(column=outcome, by=group, grid=False), group, outcome))
    elif method in ("anova", "ancova", "kruskal-wallis"):
        outcome = req.get("outcome")
        group = req.get("group") or req.get("exposure")
        covariates = req.get("covariates") or []
        require_columns(df, [outcome, group] + (covariates if method == "ancova" else []))
        variables = [outcome, group] + (covariates if method == "ancova" else [])
        data = df[variables].dropna()
        if method == "kruskal-wallis":
            groups = [pd.to_numeric(sub[outcome], errors="coerce").dropna() for _, sub in data.groupby(group)]
            stat, p = stats.kruskal(*groups)
            estimates = [{"term": str(group), "statistic": clean_value(stat), "p_value": clean_value(p), "groups": int(len(groups))}]
            diagnostics = {"test": "Kruskal-Wallis", "group_counts": data[group].value_counts().to_dict()}
        else:
            if smf is None:
                raise ValueError("statsmodels formula API is required for ANOVA/ANCOVA.")
            formula = f"{outcome} ~ C({group})"
            for cov in covariates:
                formula += f" + {cov}"
            model = smf.ols(formula, data=data).fit()
            table = sm.stats.anova_lm(model, typ=2)
            estimates = [{"term": str(idx), "sum_sq": clean_value(row.get("sum_sq")), "df": clean_value(row.get("df")), "f_statistic": clean_value(row.get("F")), "p_value": clean_value(row.get("PR(>F)"))} for idx, row in table.iterrows()]
            diagnostics = regression_diagnostics(model, sm.add_constant(pd.get_dummies(data[[group] + covariates], drop_first=True, dtype=float), has_constant="add"), pd.to_numeric(data[outcome], errors="coerce"), method)
            diagnostics["test"] = "ANCOVA" if method == "ancova" else "ANOVA"
        complete = int(data.shape[0])
        figures.append(save_fig(out_dir, "anova-group-distribution.png", "Outcome Distribution By Group", "Outcome distribution across groups.", [outcome, group], lambda: data.boxplot(column=outcome, by=group, grid=False), group, outcome))
    elif method == "friedman":
        variables = req.get("variables") or []
        if len(variables) < 3:
            raise ValueError("Friedman test requires at least three repeated-measure variables via --variable.")
        require_columns(df, variables)
        data = df[variables].dropna().apply(pd.to_numeric, errors="coerce").dropna()
        stat, p = stats.friedmanchisquare(*[data[c] for c in variables])
        estimates = [{"term": "friedman", "statistic": clean_value(stat), "p_value": clean_value(p), "repeated_measures": len(variables), "n": int(data.shape[0])}]
        diagnostics = {"test": "Friedman repeated-measures rank test"}
        complete = int(data.shape[0])
    elif method in ("chi-square", "fisher-exact", "mcnemar", "cochran-armitage-trend"):
        outcome = req.get("outcome")
        exposure = req.get("exposure") or req.get("group")
        require_columns(df, [outcome, exposure])
        variables = [outcome, exposure]
        data = df[variables].dropna()
        table = pd.crosstab(data[exposure], data[outcome])
        if method == "mcnemar":
            if sm_mcnemar is None:
                raise ValueError("statsmodels contingency tables are required for McNemar test.")
            if table.shape != (2, 2):
                raise ValueError("McNemar test requires a paired 2x2 table.")
            result = sm_mcnemar(table.to_numpy(), exact=False, correction=True)
            arr = np.asarray(table, dtype=float)
            discordant_01 = float(arr[0, 1])
            discordant_10 = float(arr[1, 0])
            matched_or = (discordant_01 + 0.5) / (discordant_10 + 0.5)
            se_log = math.sqrt((1 / (discordant_01 + 0.5)) + (1 / (discordant_10 + 0.5)))
            z = float(stats.norm.ppf(1 - params["alpha"] / 2))
            estimates = [{"term": str(exposure), "statistic": clean_value(result.statistic), "p_value": clean_value(result.pvalue), "matched_odds_ratio": clean_value(matched_or), "or_ci_low": clean_value(math.exp(math.log(matched_or) - z * se_log)), "or_ci_high": clean_value(math.exp(math.log(matched_or) + z * se_log)), "discordant_01": clean_value(discordant_01), "discordant_10": clean_value(discordant_10), "ci_level": confidence_level(params["alpha"])}]
            diagnostics = {"test": "McNemar", "table": table.to_dict(), "discordant_pairs": clean_value(discordant_01 + discordant_10), "continuity_correction_used": True}
        elif method == "cochran-armitage-trend":
            if table.shape[1] != 2:
                raise ValueError("Cochran-Armitage trend test requires a binary outcome.")
            ordered = list(table.index)
            scores = np.arange(len(ordered), dtype=float)
            successes = table.iloc[:, 1].to_numpy(dtype=float)
            totals = table.sum(axis=1).to_numpy(dtype=float)
            p_hat = successes.sum() / totals.sum()
            score_mean = np.average(scores, weights=totals)
            numerator = np.sum(scores * (successes - totals * p_hat))
            denominator = math.sqrt(p_hat * (1 - p_hat) * np.sum(totals * (scores - score_mean) ** 2))
            z = numerator / denominator if denominator else np.nan
            p = 2 * (1 - stats.norm.cdf(abs(z))) if not pd.isna(z) else np.nan
            slope_proxy = numerator / np.sum(totals * (scores - score_mean) ** 2) if np.sum(totals * (scores - score_mean) ** 2) else np.nan
            estimates = [{"term": str(exposure), "trend_z_statistic": clean_value(z), "p_value": clean_value(p), "groups": int(len(ordered)), "risk_slope_per_score": clean_value(slope_proxy), "outcome_positive_level": clean_value(table.columns[1])}]
            diagnostics = {"test": "Cochran-Armitage trend", "ordered_groups": [clean_value(v) for v in ordered], "table": table.to_dict(), "group_totals": [clean_value(v) for v in totals], "group_successes": [clean_value(v) for v in successes]}
        elif method == "fisher-exact":
            if table.shape != (2, 2):
                raise ValueError("Fisher exact test requires a 2x2 table.")
            odds, p = stats.fisher_exact(table.to_numpy())
            effects = two_by_two_effects(table, params["alpha"])
            effects["fisher_exact_odds_ratio"] = clean_value(odds)
            estimates = [{"term": str(exposure), **effects, "p_value": clean_value(p)}]
            diagnostics = {"test": "Fisher exact", "table": table.to_dict(), "two_by_two_effects": bool(effects)}
        else:
            chi2, p, dof, expected = stats.chi2_contingency(table)
            if np.any(expected < 5):
                warnings.append("At least one expected cell count is below 5; consider Fisher/exact or sparse-cell policy.")
                issues.append({"severity": "warning", "code": "SPARSE_EXPECTED_CELL", "message": "At least one expected cell count is below 5.", "evidenceRefs": ["expected_counts"]})
            effects = two_by_two_effects(table, params["alpha"]) if table.shape == (2, 2) else {}
            estimates = [{"term": str(exposure), "chi_square": clean_value(chi2), "degrees_of_freedom": int(dof), "p_value": clean_value(p), "cramers_v": cramers_v(table), **effects}]
            diagnostics = {"test": "Chi-square independence", "table": table.to_dict(), "expected_counts": clean_value(expected.tolist()), "min_expected": clean_value(np.min(expected)), "two_by_two_effects": bool(effects)}
        complete = int(data.shape[0])
        figures.append(save_fig(out_dir, "contingency-heatmap.png", "Contingency Table", "Observed counts for the categorical association test.", [outcome, exposure], lambda: (plt.imshow(table.to_numpy(), aspect="auto"), plt.xticks(range(len(table.columns)), [str(c) for c in table.columns]), plt.yticks(range(len(table.index)), [str(i) for i in table.index]), plt.colorbar(label="Count")), exposure, outcome))
    elif method in ("pearson", "spearman", "kendall", "partial-correlation"):
        outcome = req.get("outcome")
        exposure = req.get("exposure")
        covariates = req.get("covariates") or []
        require_columns(df, [outcome, exposure] + (covariates if method == "partial-correlation" else []))
        variables = [outcome, exposure] + (covariates if method == "partial-correlation" else [])
        data = df[variables].dropna()
        x = pd.to_numeric(data[exposure], errors="coerce")
        y = pd.to_numeric(data[outcome], errors="coerce")
        ok = x.notna() & y.notna()
        if method == "pearson":
            r, p = stats.pearsonr(x[ok], y[ok])
            ci_method = "Fisher z confidence interval"
        elif method == "spearman":
            r, p = stats.spearmanr(x[ok], y[ok])
            ci_method = "Fisher z confidence interval on rank correlation approximation"
        elif method == "kendall":
            r, p = stats.kendalltau(x[ok], y[ok])
            ci_method = "Fisher z confidence interval on Kendall tau approximation"
        else:
            if sm is None:
                raise ValueError("statsmodels is required for partial correlation.")
            cov = data.loc[ok, covariates].apply(pd.to_numeric, errors="coerce").dropna()
            aligned = data.loc[cov.index]
            x_res = sm.OLS(pd.to_numeric(aligned[exposure], errors="coerce"), sm.add_constant(cov, has_constant="add")).fit().resid
            y_res = sm.OLS(pd.to_numeric(aligned[outcome], errors="coerce"), sm.add_constant(cov, has_constant="add")).fit().resid
            r, p = stats.pearsonr(x_res, y_res)
            ok = pd.Series(True, index=cov.index)
            ci_method = "Fisher z confidence interval on residualized Pearson correlation"
        ci_low, ci_high = fisher_z_ci(r, int(ok.sum()), params["alpha"])
        estimates = [{"term": str(exposure), "correlation": clean_value(r), "ci_low": ci_low, "ci_high": ci_high, "ci_level": confidence_level(params["alpha"]), "p_value": clean_value(p), "n": int(ok.sum()), "adjusted_for": ", ".join(covariates) if method == "partial-correlation" else ""}]
        diagnostics = {"test": method, "n": int(ok.sum()), "ci_method": ci_method, "ci_available": bool(ci_low is not None and ci_high is not None)}
        complete = int(ok.sum())
        figures.append(save_fig(out_dir, "correlation-scatter.png", "Correlation Scatterplot", "Scatterplot for the two variables used in the correlation run.", [outcome, exposure], lambda: plt.scatter(x[ok], y[ok], alpha=0.6), exposure, outcome))
    elif method == "diagnostic-accuracy":
        reference = req.get("outcome")
        test = req.get("exposure") or req.get("group")
        require_columns(df, [reference, test])
        variables = [reference, test]
        data = df[variables].dropna()
        reference_threshold = req.get("outcomeThreshold")
        test_threshold = req.get("exposureThreshold")
        if reference_threshold is None:
            ref_pos, ref_neg_level, ref_pos_level = binary_indicator(data[reference])
        else:
            ref_pos = threshold_indicator(data[reference], reference_threshold)
            ref_neg_level = f"<{reference_threshold}"
            ref_pos_level = f">={reference_threshold}"
        if test_threshold is None:
            test_pos, test_neg_level, test_pos_level = binary_indicator(data[test])
        else:
            test_pos = threshold_indicator(data[test], test_threshold)
            test_neg_level = f"<{test_threshold}"
            test_pos_level = f">={test_threshold}"
        valid = ref_pos.notna() & test_pos.notna()
        ref_pos = ref_pos[valid].astype(bool)
        test_pos = test_pos[valid].astype(bool)
        tp = int((ref_pos & test_pos).sum())
        tn = int((~ref_pos & ~test_pos).sum())
        fp = int((~ref_pos & test_pos).sum())
        fn = int((ref_pos & ~test_pos).sum())
        sensitivity = safe_divide(tp, tp + fn)
        specificity = safe_divide(tn, tn + fp)
        ppv = safe_divide(tp, tp + fp)
        npv = safe_divide(tn, tn + fn)
        accuracy = safe_divide(tp + tn, tp + tn + fp + fn)
        prevalence = safe_divide(tp + fn, tp + tn + fp + fn)
        lr_positive = clean_value(float(sensitivity) / (1 - float(specificity))) if sensitivity is not None and specificity not in (None, 1) else None
        lr_negative = clean_value((1 - float(sensitivity)) / float(specificity)) if specificity not in (None, 0) and sensitivity is not None else None
        sens_low, sens_high = wilson_interval(tp, tp + fn, params["alpha"])
        spec_low, spec_high = wilson_interval(tn, tn + fp, params["alpha"])
        ppv_low, ppv_high = wilson_interval(tp, tp + fp, params["alpha"])
        npv_low, npv_high = wilson_interval(tn, tn + fn, params["alpha"])
        estimates = [{
            "term": str(test),
            "reference": str(reference),
            "true_positive": tp,
            "false_positive": fp,
            "true_negative": tn,
            "false_negative": fn,
            "sensitivity": sensitivity,
            "sensitivity_ci_low": sens_low,
            "sensitivity_ci_high": sens_high,
            "specificity": specificity,
            "specificity_ci_low": spec_low,
            "specificity_ci_high": spec_high,
            "positive_predictive_value": ppv,
            "positive_predictive_value_ci_low": ppv_low,
            "positive_predictive_value_ci_high": ppv_high,
            "negative_predictive_value": npv,
            "negative_predictive_value_ci_low": npv_low,
            "negative_predictive_value_ci_high": npv_high,
            "accuracy": accuracy,
            "prevalence": prevalence,
            "positive_likelihood_ratio": lr_positive,
            "negative_likelihood_ratio": lr_negative,
        }]
        diagnostics = {
            "test": "diagnostic-accuracy",
            "confusion_matrix": {"tp": tp, "fp": fp, "tn": tn, "fn": fn},
            "reference_positive_level": clean_value(ref_pos_level),
            "reference_negative_level": clean_value(ref_neg_level),
            "test_positive_level": clean_value(test_pos_level),
            "test_negative_level": clean_value(test_neg_level),
            "reference_threshold": clean_value(reference_threshold),
            "test_threshold": clean_value(test_threshold),
        }
        complete = int(valid.sum())
        if min(tp, fp, tn, fn) < 5:
            warnings.append("At least one diagnostic accuracy cell count is below 5; performance metrics may be unstable.")
            issues.append({"severity": "warning", "code": "SPARSE_DIAGNOSTIC_CELL", "message": "At least one diagnostic accuracy cell count is below 5.", "evidenceRefs": ["diagnostics.confusion_matrix"]})
    elif method in ("propensity-score-matching", "propensity-score-weighting"):
        if sm is None:
            raise ValueError("statsmodels is required for propensity score methods.")
        outcome = req.get("outcome")
        treatment = req.get("exposure") or req.get("group")
        covariates = req.get("covariates") or []
        exact_covariates = req.get("exactCovariates") or []
        leakage = [c for c in covariates + exact_covariates if c in (outcome, treatment)]
        if leakage:
            raise ValueError("Propensity covariates cannot include the treatment/exposure or outcome: " + ", ".join(sorted(set(leakage))))
        require_columns(df, [outcome, treatment] + covariates + exact_covariates)
        variables = list(dict.fromkeys([outcome, treatment] + covariates + exact_covariates))
        raw_all = df[variables].copy()
        missing_counts = {col: int(raw_all[col].isna().sum()) for col in variables}
        raw = raw_all.dropna()
        excluded_missing = int(raw_all.shape[0] - raw.shape[0])
        if raw_all.shape[0] and excluded_missing / raw_all.shape[0] > 0.2:
            issues.append({"severity": "warning", "code": "PROPENSITY_HIGH_COMPLETE_CASE_EXCLUSION", "message": f"{excluded_missing} of {raw_all.shape[0]} rows were excluded before propensity estimation because of missing treatment, outcome, or covariates.", "evidenceRefs": ["diagnostics.missingness"]})
        t_indicator, control_level, treated_level = deterministic_binary_indicator(raw[treatment], req.get("exposureThreshold"))
        raw["_agenteer_treatment"] = t_indicator
        data = raw.dropna(subset=["_agenteer_treatment"]).copy()
        data["_agenteer_treatment"] = data["_agenteer_treatment"].astype(int)
        if data["_agenteer_treatment"].nunique() != 2:
            raise ValueError("Propensity methods require both treated and control rows after complete-case filtering.")
        if int((data["_agenteer_treatment"] == 1).sum()) < 5 or int((data["_agenteer_treatment"] == 0).sum()) < 5:
            issues.append({"severity": "blocker", "code": "PROPENSITY_GROUP_TOO_SMALL", "message": "Both treatment groups need at least 5 complete-case rows for propensity analysis.", "evidenceRefs": ["completeCaseN"]})
        ps, x_cov, ps_model = fit_propensity_scores(data, "_agenteer_treatment", covariates)
        logits = pd.Series(safe_logit(ps), index=data.index)
        before_rows, denominators = balance_rows(x_cov, data["_agenteer_treatment"])
        estimand = req.get("estimand", "ATT")
        score_rows = pd.DataFrame({
            "row_index": [int(idx) if isinstance(idx, (int, np.integer)) else str(idx) for idx in data.index],
            "treatment": data["_agenteer_treatment"].astype(int).values,
            "propensity_score": ps.values,
            "logit_propensity_score": logits.values,
        })
        propensity_path = os.path.join(out_dir, "propensity-scores.csv")
        score_rows.to_csv(propensity_path, index=False)
        overlap_path = os.path.join(out_dir, "propensity-overlap.csv")
        write_csv(overlap_path, overlap_rows(ps, data["_agenteer_treatment"]))
        pair_path = None
        weight_path = None
        if method == "propensity-score-matching":
            ratio = int(req.get("matchRatio", 1))
            caliper = float(req.get("caliper") if req.get("caliper") is not None else 0.2)
            pairs, analysis_weights, match_diag = nearest_neighbor_match(
                data,
                "_agenteer_treatment",
                ps,
                exact_covariates,
                ratio,
                caliper,
                bool(req.get("replacement", False)),
            )
            pair_path = os.path.join(out_dir, "matched-pairs.csv")
            write_csv(pair_path, pairs)
            if match_diag["unmatched_treated"] > 0:
                issues.append({"severity": "warning", "code": "PROPENSITY_UNMATCHED_TREATED", "message": f"{match_diag['unmatched_treated']} treated rows were unmatched under the caliper/exact-match policy.", "evidenceRefs": ["matched-pairs.csv"]})
            if match_diag["matched_treated"] < 5 or match_diag["matched_controls"] < 5:
                issues.append({"severity": "blocker", "code": "PROPENSITY_MATCHED_SAMPLE_TOO_SMALL", "message": "Matched sample is too small for a stable treatment contrast.", "evidenceRefs": ["diagnostics.matching"]})
            diagnostics["matching"] = match_diag
            method_label = "nearest-neighbor propensity score matching"
        else:
            trim = float(req.get("trimThreshold", 0.01))
            base_weights = propensity_weights(data["_agenteer_treatment"], ps, estimand, bool(req.get("stabilizeWeights", True)))
            keep = (ps >= trim) & (ps <= (1 - trim))
            analysis_weights = pd.Series(0.0, index=data.index)
            analysis_weights.loc[keep] = base_weights.loc[keep]
            if int((~keep).sum()) > 0:
                issues.append({"severity": "warning", "code": "PROPENSITY_TRIMMED_NONOVERLAP", "message": f"{int((~keep).sum())} rows were assigned zero weight by the trim threshold.", "evidenceRefs": ["weights.csv"]})
            if float(base_weights.max()) > 10:
                issues.append({"severity": "warning", "code": "PROPENSITY_EXTREME_WEIGHTS", "message": "Maximum inverse-probability weight exceeded 10; review positivity and stabilization.", "evidenceRefs": ["diagnostics.weighting"]})
            weight_path = os.path.join(out_dir, "weights.csv")
            pd.DataFrame({
                "row_index": [int(idx) if isinstance(idx, (int, np.integer)) else str(idx) for idx in data.index],
                "treatment": data["_agenteer_treatment"].astype(int).values,
                "propensity_score": ps.values,
                "analysis_weight": analysis_weights.values,
            }).to_csv(weight_path, index=False)
            diagnostics["weighting"] = {
                "estimand": estimand,
                "stabilized": bool(req.get("stabilizeWeights", True)),
                "trim_threshold": clean_value(trim),
                "trimmed_rows": int((~keep).sum()),
                "min_weight": clean_value(analysis_weights[analysis_weights > 0].min() if (analysis_weights > 0).any() else None),
                "max_weight": clean_value(analysis_weights.max()),
                "mean_weight": clean_value(analysis_weights[analysis_weights > 0].mean() if (analysis_weights > 0).any() else None),
                "effective_sample_size": effective_sample_size(analysis_weights),
            }
            method_label = "inverse-probability treatment weighting"
        after_rows, _ = balance_rows(x_cov, data["_agenteer_treatment"], analysis_weights, denominators)
        # Preserve before/after rows as one table; after_rows already carries both original and adjusted columns.
        balance_path = os.path.join(out_dir, "balance.csv")
        write_csv(balance_path, after_rows)
        summary = balance_summary(after_rows)
        if summary["covariates_over_0_1_after"] and summary["covariates_over_0_1_after"] > 0:
            issues.append({"severity": "warning", "code": "PROPENSITY_RESIDUAL_IMBALANCE", "message": f"{summary['covariates_over_0_1_after']} covariate terms have post-adjustment absolute SMD above 0.10.", "evidenceRefs": ["balance.csv"]})
        positivity = positivity_summary(ps, data["_agenteer_treatment"])
        if positivity["common_support_fraction"] is not None and positivity["common_support_fraction"] < 0.75:
            issues.append({"severity": "blocker", "code": "PROPENSITY_POOR_OVERLAP", "message": "Less than 75% of complete cases lie in common propensity-score support.", "evidenceRefs": ["diagnostics.positivity"]})
        effect_row = treatment_effect_estimate(data, "_agenteer_treatment", outcome, analysis_weights, estimand, method_label)
        effect_row["term"] = str(treatment)
        estimates = [effect_row]
        diagnostics.update({
            "test": method,
            "treatment_column": treatment,
            "treatment_positive_level": treated_level,
            "treatment_negative_level": control_level,
            "covariates": covariates,
            "exact_covariates": exact_covariates,
            "propensity_model": {
                "family": "logistic",
                "n_parameters": int(len(ps_model.params)),
                "aic": clean_value(getattr(ps_model, "aic", None)),
                "converged": bool(getattr(ps_model, "converged", True)),
                "propensity_min": clean_value(ps.min()),
                "propensity_max": clean_value(ps.max()),
            },
            "missingness": {
                "input_rows": int(raw_all.shape[0]),
                "complete_case_rows": int(data.shape[0]),
                "excluded_missing_rows": excluded_missing,
                "complete_case_fraction": clean_value(float(data.shape[0]) / float(raw_all.shape[0]) if raw_all.shape[0] else None),
                "missing_counts": missing_counts,
            },
            "balance": summary,
            "positivity": positivity,
            "artifacts": {
                "propensity_scores": propensity_path,
                "propensity_overlap": overlap_path,
                "balance": balance_path,
                "matched_pairs": pair_path,
                "weights": weight_path,
            },
        })
        params.update({
            "estimand": estimand,
            "matchRatio": req.get("matchRatio", 1),
            "caliper": req.get("caliper") if req.get("caliper") is not None else 0.2,
            "replacement": bool(req.get("replacement", False)),
            "trimThreshold": req.get("trimThreshold", 0.01),
            "stabilizeWeights": bool(req.get("stabilizeWeights", True)),
            "treatmentPositiveLevel": treated_level,
            "treatmentNegativeLevel": control_level,
        })
        complete = int(data.shape[0])
    elif method in ("linear-regression", "robust-linear-regression", "logistic-regression", "ordinal-logistic-regression", "multinomial-logistic-regression", "poisson-regression", "negative-binomial-regression", "zero-inflated-poisson", "zero-inflated-negative-binomial", "gamma-glm", "inverse-gaussian-glm", "quantile-regression", "penalized-linear-regression", "penalized-logistic-regression"):
        if sm is None:
            raise ValueError("statsmodels is required for regression methods.")
        outcome = req.get("outcome")
        exposure = req.get("exposure")
        covariates = req.get("covariates") or []
        weight = req.get("weight")
        require_columns(df, [outcome, exposure] + covariates + ([weight] if weight else []))
        variables = [outcome, exposure] + covariates + ([weight] if weight else [])
        data = df[variables].dropna()
        y_raw = data[outcome]
        x = design_matrix(data, exposure, covariates)
        weights = pd.to_numeric(data[weight], errors="coerce") if weight else None
        if method == "linear-regression":
            y = pd.to_numeric(y_raw, errors="coerce")
            ok = y.notna()
            model = sm.WLS(y[ok], x.loc[ok], weights=weights.loc[ok] if weights is not None else None).fit() if weights is not None else sm.OLS(y[ok], x.loc[ok]).fit()
        elif method == "robust-linear-regression":
            y = pd.to_numeric(y_raw, errors="coerce")
            ok = y.notna()
            model = sm.RLM(y[ok], x.loc[ok], M=sm.robust.norms.HuberT()).fit()
        elif method == "quantile-regression":
            y = pd.to_numeric(y_raw, errors="coerce")
            ok = y.notna()
            model = sm.QuantReg(y[ok], x.loc[ok]).fit(q=0.5)
        elif method in ("penalized-linear-regression", "penalized-logistic-regression"):
            alpha_penalty = float(req.get("alphaPenalty") if req.get("alphaPenalty") is not None else 1.0)
            l1_ratio = float(req.get("l1Ratio") if req.get("l1Ratio") is not None else 0.5)
            x_sklearn = pd.get_dummies(data[[exposure] + covariates], drop_first=True, dtype=float)
            if method == "penalized-linear-regression":
                y = pd.to_numeric(y_raw, errors="coerce")
                ok = y.notna()
                estimator = ElasticNet(alpha=alpha_penalty, l1_ratio=l1_ratio, random_state=1, max_iter=10000).fit(x_sklearn.loc[ok], y[ok])
                estimates = [{"term": str(term), "estimate": clean_value(coef), "p_value": None, "ci_low": None, "ci_high": None, "penalized_inference_caveat": "Penalized regression coefficients are shrinkage estimates; standard p-values/CIs are not reported in this route."} for term, coef in zip(x_sklearn.columns, estimator.coef_)]
                estimates.insert(0, {"term": "intercept", "estimate": clean_value(estimator.intercept_), "p_value": None, "ci_low": None, "ci_high": None, "penalized_inference_caveat": "No classical inference reported."})
                diagnostics.update({"model_family": method, "alpha_penalty": alpha_penalty, "l1_ratio": l1_ratio, "r_squared": clean_value(estimator.score(x_sklearn.loc[ok], y[ok])), "nonzero_coefficients": int(np.sum(np.abs(estimator.coef_) > 1e-12))})
                complete = int(ok.sum())
                issues.append({"severity": "warning", "code": "PENALIZED_INFERENCE_CAVEAT", "message": "Penalized regression coefficients are shrinkage estimates; bootstrap or post-selection inference is required for classical inference.", "evidenceRefs": ["diagnostics"]})
                model = None
            else:
                y, levels = binary_series(y_raw)
                estimator = LogisticRegression(penalty="elasticnet", solver="saga", C=1 / max(alpha_penalty, 1e-9), l1_ratio=l1_ratio, max_iter=10000, random_state=1).fit(x_sklearn, y)
                estimates = [{"term": str(term), "estimate": clean_value(coef), "odds_ratio": clean_value(safe_exp(coef)), "p_value": None, "ci_low": None, "ci_high": None, "penalized_inference_caveat": "Penalized logistic coefficients are shrinkage estimates; standard p-values/CIs are not reported in this route."} for term, coef in zip(x_sklearn.columns, estimator.coef_[0])]
                estimates.insert(0, {"term": "intercept", "estimate": clean_value(estimator.intercept_[0]), "odds_ratio": clean_value(safe_exp(estimator.intercept_[0])), "p_value": None, "ci_low": None, "ci_high": None, "penalized_inference_caveat": "No classical inference reported."})
                diagnostics.update({"model_family": method, "alpha_penalty": alpha_penalty, "l1_ratio": l1_ratio, "accuracy_in_sample": clean_value(estimator.score(x_sklearn, y)), "outcome_levels": [clean_value(v) for v in levels], "nonzero_coefficients": int(np.sum(np.abs(estimator.coef_) > 1e-12))})
                complete = int(len(y))
                issues.append({"severity": "warning", "code": "PENALIZED_INFERENCE_CAVEAT", "message": "Penalized logistic coefficients are shrinkage estimates; bootstrap or post-selection inference is required for classical inference.", "evidenceRefs": ["diagnostics"]})
                model = None
        elif method == "logistic-regression":
            y, levels = binary_series(y_raw)
            model = sm.GLM(y, x, family=sm.families.Binomial(), freq_weights=weights).fit()
            diagnostics["outcome_levels"] = [clean_value(v) for v in levels]
        elif method == "ordinal-logistic-regression":
            if OrderedModel is None:
                raise ValueError("statsmodels OrderedModel is required for ordinal logistic regression.")
            y_codes, uniques = pd.factorize(y_raw, sort=True)
            x_ord = pd.get_dummies(data[[exposure] + covariates], drop_first=True, dtype=float)
            model = OrderedModel(y_codes, x_ord, distr="logit").fit(method="bfgs", disp=False)
            diagnostics["outcome_levels"] = [clean_value(v) for v in uniques]
        elif method == "multinomial-logistic-regression":
            y_codes, uniques = pd.factorize(y_raw, sort=True)
            model = sm.MNLogit(y_codes, x).fit(method="newton", disp=False, maxiter=100)
            diagnostics["outcome_levels"] = [clean_value(v) for v in uniques]
        elif method == "poisson-regression":
            y = pd.to_numeric(y_raw, errors="coerce")
            model = sm.GLM(y, x, family=sm.families.Poisson(), freq_weights=weights).fit()
            if model.pearson_chi2 / max(1, model.df_resid) > 2:
                warnings.append("Poisson overdispersion diagnostic is high; consider negative binomial or robust variance.")
                issues.append({"severity": "warning", "code": "POISSON_OVERDISPERSION", "message": "Poisson overdispersion diagnostic is high; consider negative binomial or robust variance.", "evidenceRefs": ["diagnostics.pearson_chi2"]})
        elif method == "negative-binomial-regression":
            y = pd.to_numeric(y_raw, errors="coerce")
            model = sm.GLM(y, x, family=sm.families.NegativeBinomial(), freq_weights=weights).fit()
        elif method in ("gamma-glm", "inverse-gaussian-glm"):
            y = pd.to_numeric(y_raw, errors="coerce")
            if (y <= 0).any():
                raise ValueError(f"{method} requires positive continuous outcomes.")
            family = sm.families.Gamma(sm.families.links.Log()) if method == "gamma-glm" else sm.families.InverseGaussian(sm.families.links.Log())
            model = sm.GLM(y, x, family=family, freq_weights=weights).fit()
        elif method in ("zero-inflated-poisson", "zero-inflated-negative-binomial"):
            y = pd.to_numeric(y_raw, errors="coerce")
            if method == "zero-inflated-poisson":
                if ZeroInflatedPoisson is None:
                    raise ValueError("statsmodels ZeroInflatedPoisson is required.")
                model = ZeroInflatedPoisson(y, x, exog_infl=np.ones((x.shape[0], 1))).fit(disp=False, maxiter=100)
            else:
                if ZeroInflatedNegativeBinomialP is None:
                    raise ValueError("statsmodels ZeroInflatedNegativeBinomialP is required.")
                model = ZeroInflatedNegativeBinomialP(y, x, exog_infl=np.ones((x.shape[0], 1))).fit(disp=False, maxiter=100)
        if model is not None:
            ci = model.conf_int()
            params_obj = model.params
            if isinstance(params_obj, pd.DataFrame):
                for outcome_level in params_obj.columns:
                    for term in params_obj.index:
                        est = params_obj.loc[term, outcome_level]
                        estimates.append({"term": f"{term}:{outcome_level}", "estimate": clean_value(est), "std_error": None, "p_value": None, "ci_low": None, "ci_high": None})
            else:
                terms = list(params_obj.index) if hasattr(params_obj, "index") else [str(i) for i in range(len(params_obj))]
                for i, term in enumerate(terms):
                    est = params_obj[term] if hasattr(params_obj, "index") else params_obj[i]
                    se = model.bse[term] if hasattr(getattr(model, "bse", []), "index") and term in model.bse.index else (model.bse[i] if hasattr(model, "bse") and len(model.bse) > i else None)
                    pval = model.pvalues[term] if hasattr(getattr(model, "pvalues", []), "index") and term in model.pvalues.index else (model.pvalues[i] if hasattr(model, "pvalues") and len(model.pvalues) > i else None)
                    try:
                        low, high = effect_ci_from_model(model, term)
                    except Exception:
                        low, high = None, None
                    row = {"term": str(term), "estimate": clean_value(est), "std_error": clean_value(se), "p_value": clean_value(pval), "ci_low": low, "ci_high": high}
                    if method in ("logistic-regression", "ordinal-logistic-regression", "multinomial-logistic-regression"):
                        row.update({"odds_ratio": clean_value(safe_exp(est)), "or_ci_low": clean_value(safe_exp(low)), "or_ci_high": clean_value(safe_exp(high))})
                    if method in ("poisson-regression", "negative-binomial-regression", "zero-inflated-poisson", "zero-inflated-negative-binomial", "gamma-glm", "inverse-gaussian-glm"):
                        row.update({"rate_ratio": clean_value(safe_exp(est)), "rr_ci_low": clean_value(safe_exp(low)), "rr_ci_high": clean_value(safe_exp(high))})
                    estimates.append(row)
            diagnostics.update(regression_diagnostics(model, x, pd.to_numeric(y_raw, errors="coerce"), method))
            diagnostics["weighted"] = weight is not None
            if method in ("logistic-regression", "penalized-logistic-regression"):
                try:
                    y_binary, _levels_for_counts = binary_series(y_raw)
                    diagnostics["event_count"] = int(pd.Series(y_binary).sum())
                    diagnostics["non_event_count"] = int(len(y_binary) - pd.Series(y_binary).sum())
                    diagnostics["event_rate"] = clean_value(float(pd.Series(y_binary).mean()))
                except Exception:
                    pass
            if method in ("poisson-regression", "negative-binomial-regression", "zero-inflated-poisson", "zero-inflated-negative-binomial"):
                try:
                    y_count = pd.to_numeric(y_raw, errors="coerce")
                    diagnostics["zero_fraction"] = clean_value(float((y_count == 0).mean()))
                    diagnostics["outcome_min"] = clean_value(y_count.min())
                    diagnostics["outcome_max"] = clean_value(y_count.max())
                except Exception:
                    pass
            if hasattr(model, "converged") and not bool(model.converged):
                issues.append({"severity": "blocker", "code": "REGRESSION_DID_NOT_CONVERGE", "message": "The regression model did not converge.", "evidenceRefs": ["diagnostics.converged"]})
            try:
                extreme_terms = [str(term) for term in terms if abs(float(params_obj[term] if hasattr(params_obj, "index") else params_obj[int(term)])) > 20]
                if method in ("logistic-regression", "ordinal-logistic-regression", "multinomial-logistic-regression") and extreme_terms:
                    issues.append({"severity": "warning", "code": "POSSIBLE_SEPARATION_OR_EXTREME_LOG_ODDS", "message": "One or more logistic coefficients are extreme; review possible separation or sparse predictors.", "evidenceRefs": extreme_terms})
            except Exception:
                pass
            complete = int(data.shape[0])
            if method not in ("ordinal-logistic-regression", "multinomial-logistic-regression"):
                try:
                    figures.append(save_fig(out_dir, "model-residuals.png", "Residuals Versus Fitted", "Residual diagnostic plot for the fitted model.", [outcome, exposure] + covariates, lambda: plt.scatter(model.fittedvalues, getattr(model, "resid_response", getattr(model, "resid", pd.to_numeric(y_raw, errors="coerce") - model.fittedvalues)), alpha=0.6), "Fitted value", "Residual"))
                except Exception:
                    pass
    elif method in ("kaplan-meier", "log-rank", "cox-proportional-hazards", "stratified-cox", "time-varying-cox", "fine-gray", "aalen-johansen-cif", "recurrent-event-rate"):
        time_col = req.get("time") or (req.get("variables") or [None])[0]
        event_col = req.get("event") or req.get("outcome")
        group = req.get("group") or req.get("exposure")
        covariates = req.get("covariates") or []
        if method in ("fine-gray", "time-varying-cox"):
            issues.append({"severity": "blocker", "code": "METHOD_BACKEND_NOT_AVAILABLE", "message": f"{method} requires a dedicated survival/competing-risk backend that is not available in the local runtime.", "evidenceRefs": ["r-survival/cmprsk or lifelines/scikit-survival"]})
            estimates = [{"term": method, "status": "blocked", "reason": "backend_not_available"}]
            diagnostics = {"test": method, "required_backend": "R survival/cmprsk or equivalent validated survival backend"}
            variables = [c for c in [time_col, event_col, group] + covariates if c]
            complete = int(df[variables].dropna().shape[0]) if variables else 0
        else:
            strata_col = req.get("strata") if method == "stratified-cox" else None
            id_col = req.get("id") if method == "recurrent-event-rate" else None
            require_columns(df, [time_col, event_col] + ([group] if group else []) + ([strata_col] if strata_col else []) + ([id_col] if id_col else []) + covariates)
            variables = [c for c in [time_col, event_col, group, strata_col, id_col] + covariates if c]
            data = df[variables].dropna()
            complete = int(data.shape[0])
            if method == "kaplan-meier":
                rows = km_curve(data[time_col], data[event_col], data[group] if group else None)
                curve_path = os.path.join(out_dir, "kaplan-meier-curve.csv")
                write_csv(curve_path, rows)
                estimates = km_final_summary(rows)
                ev = event_indicator(data[event_col])
                diagnostics = {"test": "Kaplan-Meier", "curve_path": curve_path, "groups": sorted(set(r["group"] for r in rows), key=str), "events": int(ev.sum()), "censored": int((ev == 0).sum()), "time_min": clean_value(pd.to_numeric(data[time_col], errors="coerce").min()), "time_max": clean_value(pd.to_numeric(data[time_col], errors="coerce").max()), "group_summary": survival_group_summary(data[time_col], data[event_col], data[group] if group else None), "ci_method": "Greenwood normal approximation", "artifacts": {"survival_curve": curve_path}}
                figures.append(save_fig(out_dir, "kaplan-meier.png", "Kaplan-Meier Survival Curve", "Estimated survival curves by group.", variables, lambda: [plt.step([r["time"] for r in rows if r["group"] == g], [r["survival"] for r in rows if r["group"] == g], where="post", label=str(g)) for g in sorted(set(r["group"] for r in rows), key=str)] and plt.legend(title=group or "Group"), "Time", "Survival probability"))
            elif method == "log-rank":
                result = logrank_two_group(data[time_col], data[event_col], data[group])
                estimates = [{"term": str(group), **result}]
                ev = event_indicator(data[event_col])
                diagnostics = {"test": "log-rank", "groups": list(data[group].dropna().unique()), "events": int(ev.sum()), "censored": int((ev == 0).sum()), "group_summary": survival_group_summary(data[time_col], data[event_col], data[group]), "time_min": clean_value(pd.to_numeric(data[time_col], errors="coerce").min()), "time_max": clean_value(pd.to_numeric(data[time_col], errors="coerce").max())}
            elif method in ("cox-proportional-hazards", "stratified-cox"):
                if PHReg is None:
                    raise ValueError("statsmodels PHReg is required for Cox models.")
                x = pd.get_dummies(data[[group] + covariates] if group else data[covariates], drop_first=True, dtype=float)
                if x.shape[1] == 0:
                    raise ValueError("Cox model requires at least one group, exposure, or covariate predictor.")
                model = PHReg(pd.to_numeric(data[time_col], errors="coerce"), x, status=event_indicator(data[event_col]), strata=data[strata_col] if strata_col else None).fit()
                ci = model.conf_int()
                terms = list(x.columns)
                estimates = []
                for i, term in enumerate(terms):
                    est = model.params[i]
                    estimates.append({"term": str(term), "log_hazard_ratio": clean_value(est), "hazard_ratio": clean_value(safe_exp(est)), "ci_low": clean_value(safe_exp(ci[i][0])), "ci_high": clean_value(safe_exp(ci[i][1])), "p_value": clean_value(model.pvalues[i])})
                event_count = int(event_indicator(data[event_col]).sum())
                risk_score = pd.Series(np.dot(np.asarray(x, dtype=float), np.asarray(model.params, dtype=float)), index=data.index)
                c_index, comparable_pairs = harrell_c_index(data[time_col], data[event_col], risk_score)
                diagnostics = {"test": method, "events": event_count, "censored": int((event_indicator(data[event_col]) == 0).sum()), "n_predictors": int(x.shape[1]), "events_per_predictor": clean_value(event_count / max(1, int(x.shape[1]))), "strata": strata_col, "time_min": clean_value(pd.to_numeric(data[time_col], errors="coerce").min()), "time_max": clean_value(pd.to_numeric(data[time_col], errors="coerce").max()), "tied_event_times": tied_event_time_count(data[time_col], data[event_col]), "harrell_c_index": c_index, "concordance_comparable_pairs": comparable_pairs, "proportional_hazards_check": "not_available"}
            elif method == "aalen-johansen-cif":
                rows = cif_curve(data[time_col], data[event_col], event_of_interest=1, group=data[group] if group else None)
                curve_path = os.path.join(out_dir, "cumulative-incidence.csv")
                write_csv(curve_path, rows)
                estimates = [{"term": str(g), "final_cumulative_incidence": clean_value([r for r in rows if r["group"] == g][-1]["cumulative_incidence"] if [r for r in rows if r["group"] == g] else None), "last_at_risk": int([r for r in rows if r["group"] == g][-1]["at_risk"] if [r for r in rows if r["group"] == g] else 0), "target_events": int(sum(r.get("target_events", 0) for r in rows if r["group"] == g)), "all_events": int(sum(r.get("all_events", 0) for r in rows if r["group"] == g))} for g in sorted(set(r["group"] for r in rows), key=str)]
                event_codes = pd.Series(data[event_col]).dropna()
                any_event = pd.to_numeric(data[event_col], errors="coerce").map(lambda value: np.nan if pd.isna(value) else int(value != 0))
                diagnostics = {"test": "Aalen-Johansen cumulative incidence", "curve_path": curve_path, "event_of_interest_code": 1, "events": int((event_codes == 1).sum()), "censored": int((event_codes == 0).sum()), "competing_events": int(((event_codes != 0) & (event_codes != 1)).sum()), "event_codes": [clean_value(v) for v in sorted(event_codes.unique())], "group_summary": survival_group_summary(data[time_col], any_event, data[group] if group else None), "artifacts": {"cumulative_incidence_curve": curve_path}}
                figures.append(save_fig(out_dir, "cumulative-incidence.png", "Cumulative Incidence", "Nonparametric cumulative incidence for event code 1 with other nonzero codes treated as competing events.", variables, lambda: [plt.step([r["time"] for r in rows if r["group"] == g], [r["cumulative_incidence"] for r in rows if r["group"] == g], where="post", label=str(g)) for g in sorted(set(r["group"] for r in rows), key=str)] and plt.legend(title=group or "Group"), "Time", "Cumulative incidence"))
            else:
                denom_time = pd.to_numeric(data[time_col], errors="coerce").sum()
                events = event_indicator(data[event_col]).sum()
                rate_low, rate_high = poisson_rate_interval(events, denom_time, params["alpha"])
                estimates = [{"term": "event_rate", "events": clean_value(events), "person_time": clean_value(denom_time), "rate": safe_divide(events, denom_time), "rate_ci_low": rate_low, "rate_ci_high": rate_high, "ci_level": confidence_level(params["alpha"])}]
                diagnostics = {"test": "recurrent event rate", "id": id_col, "events": int(events), "censored": int((event_indicator(data[event_col]) == 0).sum()), "person_time": clean_value(denom_time), "unique_subjects": int(data[id_col].nunique()) if id_col else None, "rate_ci_method": "exact Poisson interval"}
    elif method in ("linear-mixed-model", "generalized-mixed-model", "gee", "repeated-measures-anova"):
        outcome = req.get("outcome")
        exposure = req.get("exposure") or req.get("group")
        cluster = req.get("cluster") or req.get("id")
        covariates = req.get("covariates") or []
        require_columns(df, [outcome, exposure, cluster] + covariates)
        variables = [outcome, exposure, cluster] + covariates
        data = df[variables].dropna()
        complete = int(data.shape[0])
        if smf is None:
            raise ValueError("statsmodels formula API is required for longitudinal models.")
        formula = f"{outcome} ~ {exposure}" + "".join([f" + {c}" for c in covariates])
        if method == "linear-mixed-model":
            model = smf.mixedlm(formula, data=data, groups=data[cluster]).fit(reml=False)
        elif method == "gee":
            y_indicator = None
            try:
                y_indicator, _, _ = as_binary_numeric(data[outcome])
            except Exception:
                pass
            if y_indicator is not None and y_indicator.nunique() == 2:
                data = data.copy()
                data["_agenteer_y"] = y_indicator
                formula = f"_agenteer_y ~ {exposure}" + "".join([f" + {c}" for c in covariates])
                model = smf.gee(formula, groups=cluster, data=data, family=sm.families.Binomial()).fit()
            else:
                model = smf.gee(formula, groups=cluster, data=data, family=sm.families.Gaussian()).fit()
        elif method == "repeated-measures-anova":
            within = req.get("period") or exposure
            subject = cluster
            anova = sm.stats.AnovaRM(data, depvar=outcome, subject=subject, within=[within]).fit()
            table = anova.anova_table
            estimates = [{"term": str(idx), "f_statistic": clean_value(row.get("F Value")), "df_num": clean_value(row.get("Num DF")), "df_den": clean_value(row.get("Den DF")), "p_value": clean_value(row.get("Pr > F"))} for idx, row in table.iterrows()]
            counts = data.groupby(subject).size()
            diagnostics = {"test": "repeated-measures ANOVA", "subject": subject, "within": within, "clusters": int(data[subject].nunique()), "min_observations_per_cluster": int(counts.min()), "median_observations_per_cluster": clean_value(float(counts.median()))}
            model = None
        else:
            issues.append({"severity": "blocker", "code": "GLMM_BACKEND_NOT_AVAILABLE", "message": "Generalized mixed models require a validated GLMM backend; use GEE for population-average binary/continuous repeated measures in this runtime.", "evidenceRefs": ["method"]})
            estimates = [{"term": method, "status": "blocked", "reason": "backend_not_available"}]
            diagnostics = {"test": method}
            model = None
        if method in ("linear-mixed-model", "gee"):
            ci = model.conf_int()
            estimates = [{"term": str(term), "estimate": clean_value(model.params[term]), "std_error": clean_value(model.bse[term]), "ci_low": clean_value(ci.loc[term, 0]), "ci_high": clean_value(ci.loc[term, 1]), "p_value": clean_value(model.pvalues[term])} for term in model.params.index]
            counts = data.groupby(cluster).size()
            diagnostics = {"test": method, "cluster": cluster, "clusters": int(data[cluster].nunique()), "min_observations_per_cluster": int(counts.min()), "median_observations_per_cluster": clean_value(float(counts.median())), "aic": clean_value(getattr(model, "aic", None)), "converged": clean_value(getattr(model, "converged", None))}
    elif method in ("overlap-weighting", "entropy-balancing", "doubly-robust-aipw", "difference-in-differences", "event-study-did", "interrupted-time-series", "regression-discontinuity", "instrumental-variables-2sls", "target-trial-emulation-spec", "unmeasured-confounding-sensitivity"):
        outcome = req.get("outcome")
        treatment = req.get("exposure") or req.get("group")
        covariates = req.get("covariates") or []
        if method == "target-trial-emulation-spec":
            variables = [c for c in [outcome, treatment, req.get("time"), req.get("id")] + covariates if c]
            estimates = [{"term": "target_trial_emulation_scaffold", "status": "review_required"}]
            diagnostics = {"required_protocol_items": ["eligibility criteria", "treatment strategies", "assignment time zero", "follow-up", "outcome", "causal contrast", "analysis plan", "emulation gaps"], "declared_variables": variables}
            issues.append({"severity": "warning", "code": "TARGET_TRIAL_REVIEW_REQUIRED", "message": "Target trial emulation is a design scaffold; human causal design review is required before execution claims.", "evidenceRefs": ["diagnostics.required_protocol_items"]})
            complete = int(df[variables].dropna().shape[0]) if variables else int(df.shape[0])
        elif method == "unmeasured-confounding-sensitivity":
            require_columns(df, [outcome, treatment])
            variables = [outcome, treatment]
            data = df[variables].dropna()
            y, _, _ = as_binary_numeric(data[outcome])
            t, _, _ = as_binary_numeric(data[treatment])
            table = pd.crosstab(t, y)
            if table.shape != (2, 2):
                raise ValueError("E-value sensitivity requires binary treatment and binary outcome.")
            risk_t = table.loc[1, 1] / table.loc[1].sum()
            risk_c = table.loc[0, 1] / table.loc[0].sum()
            rr = risk_t / risk_c if risk_c else np.nan
            rr_use = rr if rr >= 1 else 1 / rr
            evalue = rr_use + math.sqrt(rr_use * (rr_use - 1)) if rr_use and rr_use >= 1 else np.nan
            estimates = [{"term": str(treatment), "risk_ratio": clean_value(rr), "e_value": clean_value(evalue), "treated_risk": clean_value(risk_t), "control_risk": clean_value(risk_c)}]
            diagnostics = {"test": "E-value-style unmeasured confounding sensitivity", "table": table.to_dict()}
            complete = int(data.shape[0])
        elif method in ("overlap-weighting", "doubly-robust-aipw"):
            require_columns(df, [outcome, treatment] + covariates)
            variables = [outcome, treatment] + covariates
            data = df[variables].dropna()
            t, _, _ = as_binary_numeric(data[treatment])
            data = data.copy()
            data["_t"] = t.astype(int)
            ps, x_cov, ps_model = fit_propensity_scores(data, "_t", covariates)
            weights = pd.Series(np.where(data["_t"] == 1, 1 - ps, ps), index=data.index)
            if method == "overlap-weighting":
                estimates = [treatment_effect_estimate(data, "_t", outcome, weights, "overlap", "overlap weighting")]
            else:
                y = pd.to_numeric(data[outcome], errors="coerce")
                x_out = sm.add_constant(pd.concat([data["_t"], x_cov], axis=1), has_constant="add")
                out_model = sm.OLS(y, x_out).fit()
                x1 = x_out.copy(); x1["_t"] = 1
                x0 = x_out.copy(); x0["_t"] = 0
                mu1 = out_model.predict(x1)
                mu0 = out_model.predict(x0)
                aipw = np.mean(mu1 - mu0 + data["_t"] * (y - mu1) / ps - (1 - data["_t"]) * (y - mu0) / (1 - ps))
                estimates = [{"term": str(treatment), "estimand": "ATE", "effect_measure": "AIPW mean difference", "estimate": clean_value(aipw)}]
            balance, den = balance_rows(x_cov, data["_t"], weights)
            balance_path = os.path.join(out_dir, "balance.csv")
            write_csv(balance_path, balance)
            weights_path = os.path.join(out_dir, "causal-weights.csv")
            pd.DataFrame({"row_index": data.index, "treatment": data["_t"], "propensity_score": ps, "weight": weights}).to_csv(weights_path, index=False)
            overlap_path = os.path.join(out_dir, "propensity-overlap.csv")
            write_csv(overlap_path, overlap_rows(ps, data["_t"]))
            diagnostics = {
                "test": method,
                "treatment": treatment_group_summary(data, "_t"),
                "propensity_model": {"aic": clean_value(getattr(ps_model, "aic", None)), "converged": bool(getattr(ps_model, "converged", True)), "propensity_min": clean_value(ps.min()), "propensity_max": clean_value(ps.max())},
                "balance": balance_summary(balance),
                "positivity": positivity_summary(ps, data["_t"]),
                "effective_sample_size": effective_sample_size(weights),
                "max_weight": clean_value(weights.max()),
                "artifacts": {"balance": balance_path, "weights": weights_path, "propensity_overlap": overlap_path},
            }
            complete = int(data.shape[0])
        elif method == "entropy-balancing":
            require_columns(df, [outcome, treatment] + covariates)
            variables = [outcome, treatment] + covariates
            data = df[variables].dropna()
            t, _, _ = as_binary_numeric(data[treatment])
            data = data.copy(); data["_t"] = t.astype(int)
            x_cov = covariate_matrix(data, covariates)
            treated = data["_t"] == 1
            target = x_cov[treated].mean().values
            control_x = x_cov[~treated].values
            def obj(theta):
                z = control_x @ theta
                z = z - z.max()
                w = np.exp(z)
                w = w / w.sum()
                diff = w @ control_x - target
                return float(np.sum(diff ** 2))
            opt = minimize(obj, np.zeros(control_x.shape[1]), method="BFGS")
            z = control_x @ opt.x; z = z - z.max()
            cw = np.exp(z); cw = cw / cw.sum() * treated.sum()
            weights = pd.Series(0.0, index=data.index)
            weights.loc[treated] = 1.0
            weights.loc[~treated] = cw
            estimates = [treatment_effect_estimate(data, "_t", outcome, weights, "ATT", "entropy balancing")]
            balance, _ = balance_rows(x_cov, data["_t"], weights)
            balance_path = os.path.join(out_dir, "balance.csv")
            write_csv(balance_path, balance)
            weights_path = os.path.join(out_dir, "causal-weights.csv")
            pd.DataFrame({"row_index": data.index, "treatment": data["_t"], "weight": weights}).to_csv(weights_path, index=False)
            pseudo_ps = pd.Series(np.where(data["_t"] == 1, 0.5, np.clip(weights / max(1.0, float(weights.max())), 1e-6, 1 - 1e-6)), index=data.index)
            diagnostics = {
                "test": "entropy balancing",
                "optimized": bool(opt.success),
                "treatment": treatment_group_summary(data, "_t"),
                "balance": balance_summary(balance),
                "positivity": positivity_summary(pseudo_ps, data["_t"]),
                "effective_sample_size": effective_sample_size(weights),
                "max_weight": clean_value(weights.max()),
                "artifacts": {"balance": balance_path, "weights": weights_path},
            }
            complete = int(data.shape[0])
            if not bool(opt.success):
                issues.append({"severity": "warning", "code": "ENTROPY_BALANCING_OPTIMIZATION_WARNING", "message": "Entropy balancing optimizer did not report success; review balance diagnostics before interpretation.", "evidenceRefs": ["diagnostics.optimized"]})
        elif method in ("difference-in-differences", "event-study-did"):
            post = req.get("post") or req.get("period")
            require_columns(df, [outcome, treatment, post])
            variables = [outcome, treatment, post] + covariates
            require_columns(df, variables)
            data = df[variables].dropna()
            if smf is None:
                raise ValueError("statsmodels formula API is required for DiD.")
            formula = f"{outcome} ~ {treatment} * {post}" + "".join([f" + {c}" for c in covariates])
            model = smf.ols(formula, data=data).fit(cov_type="HC1")
            ci = model.conf_int()
            estimates = [{"term": str(term), "estimate": clean_value(model.params[term]), "std_error": clean_value(model.bse[term]), "ci_low": clean_value(ci.loc[term, 0]), "ci_high": clean_value(ci.loc[term, 1]), "p_value": clean_value(model.pvalues[term])} for term in model.params.index]
            diagnostics = regression_diagnostics(model, sm.add_constant(pd.get_dummies(data[[treatment, post] + covariates], drop_first=True, dtype=float), has_constant="add"), pd.to_numeric(data[outcome], errors="coerce"), method)
            tp_summary = treatment_period_summary(data, treatment, post)
            diagnostics["treatment_period_table"] = tp_summary["table"]
            diagnostics["treatment_period_cells"] = tp_summary["cells"]
            diagnostics["min_treatment_period_cell_n"] = tp_summary["min_cell_n"]
            diagnostics["treated_n"] = int((pd.to_numeric(data[treatment], errors="coerce") == 1).sum())
            diagnostics["control_n"] = int((pd.to_numeric(data[treatment], errors="coerce") == 0).sum())
            diagnostics["post_n"] = int((pd.to_numeric(data[post], errors="coerce") == 1).sum())
            diagnostics["pre_n"] = int((pd.to_numeric(data[post], errors="coerce") == 0).sum())
            diagnostics["parallel_trends_review_required"] = True
            if method == "event-study-did":
                diagnostics["event_study_limitation"] = "This route validates DiD/event-study inputs but fits a two-period interaction model unless richer period/event-time inputs are supplied by a specialized backend."
                issues.append({"severity": "warning", "code": "EVENT_STUDY_ROUTE_IS_TWO_PERIOD_DID", "message": "event-study-did currently records event-study design expectations but fits the bounded two-period DiD route.", "evidenceRefs": ["diagnostics.event_study_limitation"]})
            complete = int(data.shape[0])
        elif method == "interrupted-time-series":
            time_col = req.get("time") or (req.get("variables") or [None])[0]
            post = req.get("post") or req.get("period")
            require_columns(df, [outcome, time_col, post])
            variables = [outcome, time_col, post]
            data = df[variables].dropna()
            data["_time"] = pd.to_numeric(data[time_col], errors="coerce")
            data["_post"] = pd.to_numeric(data[post], errors="coerce")
            data["_time_after"] = data["_time"] * data["_post"]
            model = sm.OLS(pd.to_numeric(data[outcome], errors="coerce"), sm.add_constant(data[["_time", "_post", "_time_after"]], has_constant="add")).fit(cov_type="HAC", cov_kwds={"maxlags": 1})
            ci = model.conf_int()
            estimates = [{"term": str(term), "estimate": clean_value(model.params[term]), "std_error": clean_value(model.bse[term]), "ci_low": clean_value(ci.loc[term, 0]), "ci_high": clean_value(ci.loc[term, 1]), "p_value": clean_value(model.pvalues[term])} for term in model.params.index]
            diagnostics = regression_diagnostics(model, sm.add_constant(data[["_time", "_post", "_time_after"]], has_constant="add"), pd.to_numeric(data[outcome], errors="coerce"), method)
            diagnostics["pre_period_observations"] = int((data["_post"] == 0).sum())
            diagnostics["post_period_observations"] = int((data["_post"] == 1).sum())
            diagnostics["unique_time_points"] = int(data["_time"].nunique())
            diagnostics["hac_maxlags"] = 1
            complete = int(data.shape[0])
        elif method == "regression-discontinuity":
            running = req.get("runningVariable")
            cutoff = float(req.get("cutoff") if req.get("cutoff") is not None else 0)
            require_columns(df, [outcome, running])
            variables = [outcome, running] + covariates
            data = df[variables].dropna()
            data["_running_centered"] = pd.to_numeric(data[running], errors="coerce") - cutoff
            data["_above_cutoff"] = (data["_running_centered"] >= 0).astype(int)
            x = sm.add_constant(pd.concat([data[["_above_cutoff", "_running_centered"]], pd.get_dummies(data[covariates], drop_first=True, dtype=float) if covariates else pd.DataFrame(index=data.index)], axis=1), has_constant="add")
            model = sm.OLS(pd.to_numeric(data[outcome], errors="coerce"), x).fit(cov_type="HC1")
            ci = model.conf_int()
            estimates = [{"term": str(term), "estimate": clean_value(model.params[term]), "std_error": clean_value(model.bse[term]), "ci_low": clean_value(ci.loc[term, 0]), "ci_high": clean_value(ci.loc[term, 1]), "p_value": clean_value(model.pvalues[term])} for term in model.params.index]
            diagnostics = regression_diagnostics(model, x, pd.to_numeric(data[outcome], errors="coerce"), method)
            diagnostics["cutoff"] = cutoff
            diagnostics["below_cutoff_n"] = int((data["_running_centered"] < 0).sum())
            diagnostics["above_cutoff_n"] = int((data["_running_centered"] >= 0).sum())
            diagnostics["running_min"] = clean_value(data["_running_centered"].min())
            diagnostics["running_max"] = clean_value(data["_running_centered"].max())
            diagnostics["bandwidth_rule"] = "global linear local-design approximation; use specialized RDD bandwidth selection before publication-grade claims"
            issues.append({"severity": "warning", "code": "RDD_BANDWIDTH_REVIEW_REQUIRED", "message": "Regression discontinuity route uses a bounded global linear approximation; bandwidth and manipulation diagnostics require review.", "evidenceRefs": ["diagnostics.bandwidth_rule"]})
            complete = int(data.shape[0])
        else:
            instrument = req.get("instrument")
            require_columns(df, [outcome, treatment, instrument] + covariates)
            variables = [outcome, treatment, instrument] + covariates
            data = df[variables].dropna()
            z = sm.add_constant(pd.concat([pd.to_numeric(data[instrument], errors="coerce"), pd.get_dummies(data[covariates], drop_first=True, dtype=float) if covariates else pd.DataFrame(index=data.index)], axis=1), has_constant="add")
            first = sm.OLS(pd.to_numeric(data[treatment], errors="coerce"), z).fit()
            predicted = first.fittedvalues.rename("_t_hat")
            second_x = sm.add_constant(pd.concat([predicted, pd.get_dummies(data[covariates], drop_first=True, dtype=float) if covariates else pd.DataFrame(index=data.index)], axis=1), has_constant="add")
            second = sm.OLS(pd.to_numeric(data[outcome], errors="coerce"), second_x).fit(cov_type="HC1")
            ci = second.conf_int()
            estimates = [{"term": str(term), "estimate": clean_value(second.params[term]), "std_error": clean_value(second.bse[term]), "ci_low": clean_value(ci.loc[term, 0]), "ci_high": clean_value(ci.loc[term, 1]), "p_value": clean_value(second.pvalues[term])} for term in second.params.index]
            diagnostics = {"test": "2SLS", "first_stage_f_statistic": clean_value(float(first.fvalue) if first.fvalue is not None else None), "first_stage_r_squared": clean_value(first.rsquared), "instrument": instrument, "exclusion_restriction_review_required": True, "endogenous_treatment": treatment, "covariates": covariates}
            if first.fvalue is not None and float(first.fvalue) < 10:
                issues.append({"severity": "warning", "code": "WEAK_INSTRUMENT_WARNING", "message": "First-stage F statistic is below the common rule-of-thumb threshold of 10.", "evidenceRefs": ["diagnostics.first_stage_f_statistic"]})
            complete = int(data.shape[0])
    elif method in ("prediction-evaluation", "missingness-summary", "multiple-imputation-mice", "missingness-ipw", "complete-case-sensitivity", "mnar-sensitivity", "model-diagnostics", "reliability-kappa", "intraclass-correlation", "cronbach-alpha", "pca", "clustering-validation", "bland-altman", "multiple-comparison-correction", "power-sample-size"):
        variables = req.get("variables") or [c for c in [req.get("outcome"), req.get("exposure"), req.get("group")] + (req.get("covariates") or []) if c]
        require_columns(df, variables)
        data = df[variables].copy()
        complete = int(data.dropna().shape[0])
        missing_rows, missing_profile = missingness_profile(data, variables, out_dir)
        if method == "missingness-summary":
            estimates = missing_rows
            diagnostics = {"test": method, **missing_profile}
            figures.append(save_fig(out_dir, "missingness-bar.png", "Missingness By Variable", "Fraction missing by variable.", variables, lambda: plt.bar([r["term"] for r in estimates], [r["missing_fraction"] for r in estimates]), "Variable", "Fraction missing"))
            figures.append(save_fig(out_dir, "missingness-heatmap.png", "Missingness Pattern Heatmap", "Rows by selected variables, with darker cells indicating missing values.", variables, lambda: plt.imshow(data[variables].isna().astype(int).to_numpy(), aspect="auto", interpolation="nearest"), "Variable index", "Row index"))
            if missing_profile["max_missing_fraction"] is not None and missing_profile["max_missing_fraction"] > 0.5:
                issues.append({"severity": "warning", "code": "HIGH_VARIABLE_MISSINGNESS", "message": "At least one selected variable is missing in more than half of rows.", "evidenceRefs": ["diagnostics.max_missing_fraction"]})
            if missing_profile["mechanism_screen"]["associations_below_0_05"] > 0:
                issues.append({"severity": "warning", "code": "MISSINGNESS_ASSOCIATED_WITH_OBSERVED_DATA", "message": "Missingness is associated with at least one observed variable in the deterministic screen; complete-case analysis may be biased.", "evidenceRefs": ["diagnostics.mechanism_screen"]})
        elif method == "multiple-imputation-mice":
            numeric = data.apply(pd.to_numeric, errors="coerce")
            all_missing = [col for col in variables if numeric[col].notna().sum() == 0]
            usable = [col for col in variables if col not in all_missing]
            if not usable:
                raise ValueError("No numeric variables are available for MICE-style imputation.")
            imputer = IterativeImputer(random_state=1, max_iter=10, sample_posterior=False)
            imputed = imputer.fit_transform(numeric[usable])
            imputed_path = os.path.join(out_dir, "imputed-data.csv")
            pd.DataFrame(imputed, columns=usable).to_csv(imputed_path, index=False)
            estimates = [{"term": col, "missing_before": int(data[col].isna().sum()), "imputed_values": int(numeric[col].isna().sum()), "included_in_imputation": col in usable} for col in variables]
            diagnostics = {"test": "MICE-style iterative imputation", **missing_profile, "imputed_data": imputed_path, "assumption": "MAR sensitivity required", "imputation_metadata": {"numeric_only": True, "included_variables": usable, "excluded_all_missing_or_nonnumeric": all_missing, "iterations": int(getattr(imputer, "n_iter_", 10)), "random_state": 1}}
            issues.append({"severity": "warning", "code": "IMPUTATION_ASSUMPTION_REVIEW", "message": "Multiple imputation relies on MAR/model assumptions; compare against complete-case and sensitivity analyses.", "evidenceRefs": ["imputed-data.csv"]})
            if all_missing:
                issues.append({"severity": "warning", "code": "IMPUTATION_DROPPED_NONNUMERIC_OR_ALL_MISSING", "message": "Some requested variables could not be included in numeric MICE-style imputation.", "evidenceRefs": ["diagnostics.imputation_metadata"]})
        elif method == "missingness-ipw":
            outcome = req.get("outcome") or variables[0]
            covariates = req.get("covariates") or [c for c in variables if c != outcome]
            require_columns(df, [outcome] + covariates)
            frame = df[[outcome] + covariates].copy()
            frame["_observed"] = frame[outcome].notna().astype(int)
            model_data = frame.drop(columns=[outcome]).dropna()
            x = sm.add_constant(pd.get_dummies(model_data[covariates], drop_first=True, dtype=float), has_constant="add")
            model = sm.GLM(model_data["_observed"], x, family=sm.families.Binomial()).fit()
            p_obs = pd.Series(model.predict(x), index=model_data.index).clip(1e-6, 1)
            weights_path = os.path.join(out_dir, "missingness-ipw.csv")
            pd.DataFrame({"row_index": model_data.index, "observed": model_data["_observed"], "prob_observed": p_obs, "ipw": 1 / p_obs}).to_csv(weights_path, index=False)
            max_ipw = float((1 / p_obs).max())
            estimates = [{"term": outcome, "observed_fraction": clean_value(frame["_observed"].mean()), "min_prob_observed": clean_value(p_obs.min()), "max_ipw": clean_value(max_ipw), "effective_sample_size": effective_sample_size(1 / p_obs)}]
            diagnostics = {"test": method, **missing_profile, "weights": weights_path, "observed_fraction": clean_value(frame["_observed"].mean()), "min_prob_observed": clean_value(p_obs.min()), "max_ipw": clean_value(max_ipw), "effective_sample_size": effective_sample_size(1 / p_obs), "model": {"aic": clean_value(getattr(model, "aic", None)), "covariates": covariates}}
            if max_ipw > 25:
                issues.append({"severity": "blocker", "code": "MISSINGNESS_IPW_EXTREME_WEIGHTS", "message": "Missingness IPW produced extreme weights; revise missingness model or truncate weights before inference.", "evidenceRefs": ["diagnostics.max_ipw"]})
            elif max_ipw > 10:
                issues.append({"severity": "warning", "code": "MISSINGNESS_IPW_HIGH_WEIGHTS", "message": "Missingness IPW produced high weights; review positivity and consider truncation.", "evidenceRefs": ["diagnostics.max_ipw"]})
        elif method in ("complete-case-sensitivity", "mnar-sensitivity"):
            outcome = req.get("outcome") or variables[0]
            numeric = pd.to_numeric(data[outcome], errors="coerce")
            observed_mean = numeric.dropna().mean()
            scenarios = [-1, -0.5, 0, 0.5, 1] if method == "mnar-sensitivity" else [0]
            sd = numeric.dropna().std(ddof=1)
            estimates = []
            complete_case_mean = pd.to_numeric(data.dropna()[outcome], errors="coerce").mean() if outcome in data.columns and data.dropna().shape[0] else np.nan
            if method == "complete-case-sensitivity":
                estimates.append({"term": "available_outcome", "mean": clean_value(observed_mean), "n": int(numeric.notna().sum()), "assumption": "uses all non-missing outcome values"})
                estimates.append({"term": "complete_case_all_selected_variables", "mean": clean_value(complete_case_mean), "n": int(data.dropna().shape[0]), "mean_difference_vs_available": clean_value(complete_case_mean - observed_mean if not pd.isna(complete_case_mean) and not pd.isna(observed_mean) else None), "assumption": "requires all selected variables observed"})
            for delta in scenarios:
                filled = numeric.fillna(observed_mean + delta * sd)
                estimates.append({"term": f"delta_{delta}", "mean": clean_value(filled.mean()), "assumption": "missing values shifted by delta SD from observed mean"})
            diagnostics = {"test": method, **missing_profile, "observed_n": int(numeric.notna().sum()), "missing_n": int(numeric.isna().sum()), "available_outcome_mean": clean_value(observed_mean), "complete_case_mean": clean_value(complete_case_mean), "outcome_sd": clean_value(sd)}
        elif method == "model-diagnostics":
            estimates = [{"term": "diagnostics-request", "status": "review_artifacts"}]
            diagnostics = {"required_diagnostics": ["residuals", "VIF/collinearity", "Cook distance", "leverage", "convergence", "overdispersion", "sparse cells/events per variable", "effect-size/CI/p-value consistency"]}
        elif method == "reliability-kappa":
            if len(variables) < 2:
                raise ValueError("Kappa requires two rater/classification variables.")
            table = pd.crosstab(data[variables[0]], data[variables[1]])
            n = table.to_numpy().sum()
            po = np.trace(table.to_numpy()) / n
            pe = np.sum(table.sum(axis=0).to_numpy() * table.sum(axis=1).to_numpy()) / (n * n)
            kappa = (po - pe) / (1 - pe) if pe != 1 else np.nan
            se = math.sqrt(max(0.0, po * (1 - po) / max(1, n))) / max(1e-9, (1 - pe)) if n else np.nan
            z = float(stats.norm.ppf(1 - params["alpha"] / 2))
            table_path = os.path.join(out_dir, "kappa-table.csv")
            write_csv(table_path, [{"rater_a": clean_value(idx), **{str(col): int(table.loc[idx, col]) for col in table.columns}} for idx in table.index])
            estimates = [{"term": "cohen_kappa", "kappa": clean_value(kappa), "std_error": clean_value(se), "ci_low": clean_value(kappa - z * se if not pd.isna(se) else None), "ci_high": clean_value(kappa + z * se if not pd.isna(se) else None), "observed_agreement": clean_value(po), "expected_agreement": clean_value(pe), "n": int(n)}]
            diagnostics = {"test": "Cohen kappa", "table": table.to_dict(), "levels_a": int(table.shape[0]), "levels_b": int(table.shape[1]), "artifacts": {"kappa_table": table_path}}
        elif method == "intraclass-correlation":
            if len(variables) < 2:
                raise ValueError("ICC requires at least two measurement columns.")
            mat = data[variables].apply(pd.to_numeric, errors="coerce").dropna()
            n, k = mat.shape
            mean_rows = mat.mean(axis=1)
            mean_cols = mat.mean(axis=0)
            grand = mat.values.mean()
            ss_between = k * ((mean_rows - grand) ** 2).sum()
            ss_within = ((mat.sub(mean_rows, axis=0)) ** 2).sum().sum()
            ms_between = ss_between / max(1, n - 1)
            ms_within = ss_within / max(1, n * (k - 1))
            icc = (ms_between - ms_within) / (ms_between + (k - 1) * ms_within)
            estimates = [{"term": "ICC(1,k)-approx", "icc": clean_value(icc), "subjects": n, "raters_or_measures": k, "ms_between": clean_value(ms_between), "ms_within": clean_value(ms_within)}]
            diagnostics = {"test": "intraclass correlation approximate one-way random effects", "subjects": int(n), "raters_or_measures": int(k), "ms_between": clean_value(ms_between), "ms_within": clean_value(ms_within)}
        elif method == "cronbach-alpha":
            mat = data[variables].apply(pd.to_numeric, errors="coerce").dropna()
            k = mat.shape[1]
            alpha = cronbach_alpha_for_matrix(mat)
            item_rows = item_total_rows(mat)
            item_path = os.path.join(out_dir, "cronbach-item-diagnostics.csv")
            write_csv(item_path, item_rows)
            estimates = [{"term": "cronbach_alpha", "alpha": clean_value(alpha), "items": k, "n": int(mat.shape[0]), "min_item_total_correlation": clean_value(min([row["item_total_correlation"] for row in item_rows if row["item_total_correlation"] is not None], default=None))}]
            diagnostics = {"test": "Cronbach alpha", "items": int(k), "n": int(mat.shape[0]), "item_diagnostics": item_rows, "artifacts": {"cronbach_item_diagnostics": item_path}}
        elif method == "pca":
            mat = data[variables].apply(pd.to_numeric, errors="coerce").dropna()
            pca = PCA(n_components=min(len(variables), mat.shape[0], int(req.get("outcomeThreshold") or len(variables)))).fit(mat)
            transformed_path = os.path.join(out_dir, "pca-transformed.csv")
            pd.DataFrame(pca.transform(mat)).to_csv(transformed_path, index=False)
            loadings_path = os.path.join(out_dir, "pca-loadings.csv")
            loadings_rows = []
            for component_index, component in enumerate(pca.components_):
                for variable, loading in zip(variables, component):
                    loadings_rows.append({"component": f"PC{component_index + 1}", "variable": variable, "loading": clean_value(loading)})
            write_csv(loadings_path, loadings_rows)
            cumulative = np.cumsum(pca.explained_variance_ratio_)
            estimates = [{"term": f"PC{i+1}", "explained_variance_ratio": clean_value(v), "cumulative_explained_variance": clean_value(cumulative[i])} for i, v in enumerate(pca.explained_variance_ratio_)]
            diagnostics = {"test": "PCA", "transformed": transformed_path, "loadings": loadings_path, "components": pca.components_.tolist(), "n_components": int(len(pca.explained_variance_ratio_)), "cumulative_explained_variance": clean_value(cumulative[-1] if len(cumulative) else None), "artifacts": {"pca_transformed": transformed_path, "pca_loadings": loadings_path}}
            figures.append(save_fig(out_dir, "pca-scree.png", "PCA Scree Plot", "Explained variance ratio by component.", variables, lambda: plt.plot(range(1, len(pca.explained_variance_ratio_) + 1), pca.explained_variance_ratio_, marker="o"), "Principal component", "Explained variance ratio"))
        elif method == "clustering-validation":
            mat = data[variables].apply(pd.to_numeric, errors="coerce").dropna()
            k = int(req.get("outcomeThreshold") or 3)
            labels = KMeans(n_clusters=k, random_state=1, n_init=10).fit_predict(mat)
            labels_path = os.path.join(out_dir, "cluster-labels.csv")
            pd.DataFrame({"row_index": mat.index, "cluster": labels}).to_csv(labels_path, index=False)
            counts = pd.Series(labels).value_counts().sort_index()
            estimates = [{"term": "kmeans", "clusters": k, "silhouette": clean_value(silhouette_score(mat, labels) if k > 1 else None), "davies_bouldin": clean_value(davies_bouldin_score(mat, labels) if k > 1 else None), "calinski_harabasz": clean_value(calinski_harabasz_score(mat, labels) if k > 1 else None), "min_cluster_size": int(counts.min())}]
            diagnostics = {"test": "clustering validation", "cluster_counts": counts.to_dict(), "min_cluster_size": int(counts.min()), "max_cluster_size": int(counts.max()), "artifacts": {"cluster_labels": labels_path}}
        elif method == "bland-altman":
            if len(variables) < 2:
                raise ValueError("Bland-Altman requires two measurement variables.")
            a = pd.to_numeric(data[variables[0]], errors="coerce")
            b = pd.to_numeric(data[variables[1]], errors="coerce")
            ok = a.notna() & b.notna()
            diff = a[ok] - b[ok]
            mean = (a[ok] + b[ok]) / 2
            bias = diff.mean()
            sd_diff = diff.std(ddof=1)
            loa_low = bias - 1.96 * sd_diff
            loa_high = bias + 1.96 * sd_diff
            se_bias = sd_diff / math.sqrt(max(1, int(ok.sum())))
            z = float(stats.norm.ppf(1 - params["alpha"] / 2))
            ba_path = os.path.join(out_dir, "bland-altman-source.csv")
            pd.DataFrame({"mean": mean, "difference": diff}).to_csv(ba_path, index=False)
            estimates = [{"term": "bland_altman", "bias": clean_value(bias), "bias_ci_low": clean_value(bias - z * se_bias), "bias_ci_high": clean_value(bias + z * se_bias), "sd_difference": clean_value(sd_diff), "loa_low": clean_value(loa_low), "loa_high": clean_value(loa_high), "n": int(ok.sum())}]
            diagnostics = {"test": "Bland-Altman agreement", "artifacts": {"bland_altman_source": ba_path}}
            figures.append(save_fig(out_dir, "bland-altman.png", "Bland-Altman Plot", "Difference versus mean for two measurements.", variables[:2], lambda: plt.scatter(mean, diff, alpha=0.6), "Mean of measurements", "Difference between measurements"))
        elif method == "multiple-comparison-correction":
            pvals = pd.to_numeric(data[variables[0]], errors="coerce").dropna()
            if multipletests is None:
                raise ValueError("statsmodels multipletests is required.")
            corrected = {}
            estimates = []
            adjusted_rows = []
            for m in ["bonferroni", "holm", "fdr_bh", "fdr_by"]:
                reject, p_adj, _, _ = multipletests(pvals, alpha=req.get("alpha", 0.05), method=m)
                estimates.append({"term": m, "tests": int(len(pvals)), "rejected": int(reject.sum()), "min_adjusted_p": clean_value(np.min(p_adj))})
                corrected[m] = [clean_value(v) for v in p_adj]
                for i, (raw_p, adj_p, keep) in enumerate(zip(pvals, p_adj, reject)):
                    adjusted_rows.append({"test_index": int(i), "method": m, "raw_p_value": clean_value(raw_p), "adjusted_p_value": clean_value(adj_p), "reject": bool(keep)})
            adjusted_path = os.path.join(out_dir, "adjusted-p-values.csv")
            write_csv(adjusted_path, adjusted_rows)
            diagnostics = {"test": "multiple comparison correction", "methods": list(corrected.keys()), "adjusted_p_values": adjusted_path, "artifacts": {"adjusted_p_values": adjusted_path}}
        elif method == "power-sample-size":
            effect = float(req.get("outcomeThreshold") if req.get("outcomeThreshold") is not None else 0.5)
            alpha = float(req.get("alpha", 0.05))
            power = float(req.get("exposureThreshold") if req.get("exposureThreshold") is not None else 0.8)
            n = TTestIndPower().solve_power(effect_size=effect, alpha=alpha, power=power) if TTestIndPower else None
            estimates = [{"term": "two_sample_t_test_per_group", "effect_size": effect, "alpha": alpha, "power": power, "n_per_group": clean_value(n), "total_n": clean_value(n * 2 if n is not None else None)}]
            diagnostics = {"test": "power/sample size", "solver": "statsmodels TTestIndPower" if TTestIndPower else "unavailable", "finite_result": bool(n is not None and np.isfinite(n))}
        else:
            outcome = req.get("outcome")
            exposure = req.get("exposure")
            require_columns(df, [outcome, exposure])
            y = as_binary_numeric(df[outcome])[0]
            score = pd.to_numeric(df[exposure], errors="coerce")
            ok = y.notna() & score.notna()
            y_eval = y[ok].astype(int)
            score_eval = score[ok].astype(float)
            score_min = float(score_eval.min())
            score_max = float(score_eval.max())
            score_is_probability = score_min >= 0 and score_max <= 1
            probability_score = score_eval.clip(0, 1)
            auc = roc_auc_score(y_eval, score_eval)
            auprc = average_precision_score(y_eval, score_eval)
            brier = brier_score_loss(y_eval, probability_score)
            fpr, tpr, roc_thresholds = roc_curve(y_eval, score_eval)
            precision, recall, pr_thresholds = precision_recall_curve(y_eval, score_eval)
            finite = np.isfinite(roc_thresholds)
            youden = tpr - fpr
            valid_indices = np.where(finite)[0]
            best_index = int(valid_indices[np.argmax(youden[valid_indices])]) if len(valid_indices) else int(np.argmax(youden))
            threshold = float(roc_thresholds[best_index]) if np.isfinite(roc_thresholds[best_index]) else float(score_eval.median())
            operating = threshold_metrics(y_eval, score_eval, threshold)
            default_operating = threshold_metrics(y_eval, probability_score, 0.5) if score_is_probability else None
            calibration_rows = prediction_calibration_rows(y_eval, probability_score)
            roc_path = os.path.join(out_dir, "roc-curve.csv")
            pr_path = os.path.join(out_dir, "precision-recall-curve.csv")
            calibration_path = os.path.join(out_dir, "calibration-bins.csv")
            confusion_path = os.path.join(out_dir, "confusion-matrix.csv")
            write_csv(roc_path, [{"false_positive_rate": clean_value(a), "true_positive_rate": clean_value(b), "threshold": clean_value(c)} for a, b, c in zip(fpr, tpr, roc_thresholds)])
            write_csv(pr_path, [{"precision": clean_value(p), "recall": clean_value(r), "threshold": clean_value(pr_thresholds[i]) if i < len(pr_thresholds) else None} for i, (p, r) in enumerate(zip(precision, recall))])
            write_csv(calibration_path, calibration_rows)
            write_csv(confusion_path, [{"cell": "true_positive", "count": operating["true_positive"]}, {"cell": "false_positive", "count": operating["false_positive"]}, {"cell": "true_negative", "count": operating["true_negative"]}, {"cell": "false_negative", "count": operating["false_negative"]}])
            calibration_abs_error = float(np.average([abs(row["observed_event_rate"] - row["mean_score"]) for row in calibration_rows if row["observed_event_rate"] is not None and row["mean_score"] is not None], weights=[row["n"] for row in calibration_rows if row["observed_event_rate"] is not None and row["mean_score"] is not None])) if calibration_rows else np.nan
            estimates = [{
                "term": str(exposure),
                "auroc": clean_value(auc),
                "auprc": clean_value(auprc),
                "brier_score": clean_value(brier),
                "calibration_mean_absolute_error": clean_value(calibration_abs_error),
                "n": int(ok.sum()),
                **operating,
            }]
            diagnostics = {
                "test": "prediction evaluation",
                "event_count": int(y_eval.sum()),
                "non_event_count": int(len(y_eval) - y_eval.sum()),
                "prevalence": clean_value(float(y_eval.mean())),
                "score_min": clean_value(score_min),
                "score_max": clean_value(score_max),
                "score_is_probability_like": bool(score_is_probability),
                "roc_points": len(fpr),
                "pr_points": len(precision),
                "threshold_rule": "max Youden index",
                "threshold": clean_value(threshold),
                "confusion_matrix": {"tp": operating["true_positive"], "fp": operating["false_positive"], "tn": operating["true_negative"], "fn": operating["false_negative"]},
                "default_threshold_0_5": default_operating,
                "calibration_bins": len(calibration_rows),
                "calibration_mean_absolute_error": clean_value(calibration_abs_error),
                "artifacts": {"roc_curve": roc_path, "precision_recall_curve": pr_path, "calibration": calibration_path, "confusion_matrix": confusion_path},
            }
            if not score_is_probability:
                issues.append({"severity": "warning", "code": "PREDICTION_SCORE_NOT_PROBABILITY", "message": "Prediction scores are outside [0, 1]; calibration and Brier score are score diagnostics only unless scores are calibrated probabilities.", "evidenceRefs": ["diagnostics.score_min", "diagnostics.score_max"]})
            figures.append(save_fig(out_dir, "roc-curve.png", "ROC Curve", "Receiver operating characteristic curve.", [outcome, exposure], lambda: (plt.plot(fpr, tpr), plt.plot([0, 1], [0, 1], linestyle="--", color="gray", linewidth=1)), "False positive rate", "True positive rate"))
            figures.append(save_fig(out_dir, "precision-recall-curve.png", "Precision-Recall Curve", "Precision-recall curve for the prediction score.", [outcome, exposure], lambda: plt.plot(recall, precision), "Recall", "Precision"))
            figures.append(save_fig(out_dir, "calibration-plot.png", "Calibration Plot", "Observed event rate by score bin.", [outcome, exposure], lambda: (plt.plot([0, 1], [0, 1], linestyle="--", color="gray", linewidth=1), plt.scatter([r["mean_score"] for r in calibration_rows], [r["observed_event_rate"] for r in calibration_rows], s=[max(20, r["n"] * 4) for r in calibration_rows])), "Mean predicted score", "Observed event rate"))
    else:
        raise ValueError(f"Unsupported stats method: {method}")

    if complete < 30:
        issues.append({"severity": "warning", "code": "LOW_COMPLETE_CASE_N", "message": f"Complete-case N is {complete}; estimates may be unstable.", "evidenceRefs": ["completeCaseN"]})
    issues.extend(semantic_issues_for_dataframe(df, variables))
    if req.get("surveyDesign") and req.get("allowSurveyApproximation"):
        issues.append({"severity": "warning", "code": "SURVEY_APPROXIMATION_EXPLICIT", "message": "Complex-survey design was declared but standard stats-run was allowed explicitly; treat as exploratory only.", "evidenceRefs": ["request.allowSurveyApproximation"]})

    summary_path = os.path.join(out_dir, "stats-summary.json")
    table_path = os.path.join(out_dir, "estimates.csv")
    diagnostics_path = os.path.join(out_dir, "diagnostics.json")
    with open(summary_path, "w") as f:
        json.dump({"method": method, "rowCount": int(df.shape[0]), "completeCaseN": complete, "variables": variables, "parameters": params, "warnings": warnings}, f, indent=2)
    write_csv(table_path, estimates)
    with open(diagnostics_path, "w") as f:
        json.dump(diagnostics, f, indent=2, default=clean_value)
    figure_manifest_path = write_figure_manifest(out_dir, figures)
    artifacts = [
        {"kind": "config", "path": os.path.join(out_dir, "stats-config.json")},
        {"kind": "summary", "path": summary_path},
        {"kind": "table", "path": table_path},
        {"kind": "diagnostics", "path": diagnostics_path},
        {"kind": "figure-manifest", "path": figure_manifest_path},
    ]
    for fig in figures:
        if fig.get("qa", {}).get("status") == "pass":
            artifacts.append({"kind": "figure", "path": fig["path"]})
    if diagnostics.get("imputed_data") if isinstance(diagnostics, dict) else False:
        artifacts.append({"kind": "imputed-data", "path": diagnostics["imputed_data"]})
    propensity_artifacts = diagnostics.get("artifacts") if isinstance(diagnostics, dict) else None
    if isinstance(propensity_artifacts, dict):
        if propensity_artifacts.get("balance"):
            artifacts.append({"kind": "balance", "path": propensity_artifacts["balance"]})
        if propensity_artifacts.get("propensity_scores"):
            artifacts.append({"kind": "propensity-scores", "path": propensity_artifacts["propensity_scores"]})
        if propensity_artifacts.get("propensity_overlap"):
            artifacts.append({"kind": "propensity-overlap", "path": propensity_artifacts["propensity_overlap"]})
        if propensity_artifacts.get("matched_pairs"):
            artifacts.append({"kind": "matched-pairs", "path": propensity_artifacts["matched_pairs"]})
        if propensity_artifacts.get("weights"):
            artifacts.append({"kind": "weights", "path": propensity_artifacts["weights"]})
        for key in ["missingness_patterns", "missingness_pairwise", "missingness_mechanism", "survival_curve", "cumulative_incidence_curve", "roc_curve", "precision_recall_curve", "calibration", "confusion_matrix", "kappa_table", "cronbach_item_diagnostics", "pca_transformed", "pca_loadings", "cluster_labels", "bland_altman_source", "adjusted_p_values"]:
            if propensity_artifacts.get(key):
                artifacts.append({"kind": "table", "path": propensity_artifacts[key]})
    run_status = "failed" if any(item.get("severity") == "blocker" for item in issues) else "succeeded"
    return {
        "schemaVersion": 1,
        "runId": "statsrun_" + str(abs(hash(json.dumps({"method": method, "vars": variables, "n": complete}, sort_keys=True)))),
        "method": method,
        "status": run_status,
        "rowCount": int(df.shape[0]),
        "completeCaseN": int(complete),
        "variables": variables,
        "parameters": params,
        "estimates": estimates,
        "diagnostics": diagnostics,
        "issues": issues,
        "warnings": warnings,
        "errors": [],
        "artifacts": artifacts,
        "outDir": out_dir,
    }

def main():
    config_path = sys.argv[1]
    with open(config_path) as f:
        req = json.load(f)
    try:
        print(json.dumps(run(req), default=clean_value))
    except Exception as exc:
        print(json.dumps({
            "schemaVersion": 1,
            "runId": "statsrun_failed",
            "method": req.get("method"),
            "status": "failed",
            "rowCount": 0,
            "completeCaseN": 0,
            "variables": [],
            "binding": {"methodSelectionPath": req.get("methodSelectionPath"), "methodSelectionId": None, "methodId": None, "analysisSpecPath": req.get("analysisSpecPath"), "specHash": None, "status": "invalid"},
            "parameters": {},
            "estimates": [],
            "diagnostics": {},
            "issues": [],
            "warnings": [],
            "errors": [str(exc), traceback.format_exc()],
            "artifacts": [{"kind": "config", "path": config_path}],
            "outDir": req.get("outDir"),
        }))

if __name__ == "__main__":
    main()
`;
}
