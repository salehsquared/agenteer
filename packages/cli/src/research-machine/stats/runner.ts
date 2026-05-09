import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
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
      issues: [...binding.issues, ...parsed.issues],
      warnings: stderr.trim() ? [...parsed.warnings, stderr.trim()] : parsed.warnings,
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
      warnings: [],
      errors: [stderr.trim() || message],
      artifacts: [{ kind: "config", path: configPath }],
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

export function normalizeStatsRunRequest(rawRequest: StatsRunRequest): StatsRunRequest {
  const parsed = statsRunRequestSchema.parse(rawRequest);
  return { ...parsed, dataPath: path.resolve(parsed.dataPath), outDir: path.resolve(parsed.outDir) };
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
        out.update({
            "aic": clean_value(getattr(model, "aic", None)),
            "bic": clean_value(getattr(model, "bic", None)),
            "df_resid": clean_value(getattr(model, "df_resid", None)),
            "residual_mean": clean_value(resid.mean()),
            "residual_sd": clean_value(resid.std(ddof=1)),
        })
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
        for t in sorted(data["time"].unique()):
            at_risk = int((data["time"] >= t).sum())
            events = int(((data["time"] == t) & (data["event"] == 1)).sum())
            censored = int(((data["time"] == t) & (data["event"] == 0)).sum())
            if at_risk > 0 and events > 0:
                survival *= (1 - events / at_risk)
            rows.append({"group": clean_value(g), "time": clean_value(t), "at_risk": at_risk, "events": events, "censored": censored, "survival": clean_value(survival)})
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
                estimates = [{"term": f"{v1} - {v0}", "n": int(ok.sum()), "mean_difference": clean_value(diff.mean()), "sd_difference": clean_value(diff.std(ddof=1)), "statistic": clean_value(stat), "p_value": clean_value(p)}]
                diagnostics = {"test": "paired t-test"}
            else:
                stat, p = stats.wilcoxon(y1[ok], y0[ok])
                estimates = [{"term": f"{v1} - {v0}", "n": int(ok.sum()), "median_difference": clean_value((y1[ok] - y0[ok]).median()), "statistic": clean_value(stat), "p_value": clean_value(p)}]
                diagnostics = {"test": "Wilcoxon signed-rank"}
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
                pooled = math.sqrt(((len(y0)-1)*y0.var(ddof=1) + (len(y1)-1)*y1.var(ddof=1)) / max(1, len(y0)+len(y1)-2))
                estimates = [{"term": str(group), "group_a": clean_value(groups[0]), "group_b": clean_value(groups[1]), "n_a": len(y0), "n_b": len(y1), "mean_a": clean_value(y0.mean()), "mean_b": clean_value(y1.mean()), "mean_difference": clean_value(y1.mean() - y0.mean()), "cohen_d": clean_value((y1.mean() - y0.mean()) / pooled if pooled else None), "statistic": clean_value(stat), "p_value": clean_value(p)}]
                diagnostics = {"test": "two-sample t-test", "equal_variance_assumed": equal_var, "levene_p_value": clean_value(stats.levene(y0, y1)[1]) if len(y0) > 1 and len(y1) > 1 else None}
            else:
                stat, p = stats.mannwhitneyu(y1, y0, alternative="two-sided")
                estimates = [{"term": str(group), "group_a": clean_value(groups[0]), "group_b": clean_value(groups[1]), "n_a": len(y0), "n_b": len(y1), "median_a": clean_value(y0.median()), "median_b": clean_value(y1.median()), "statistic": clean_value(stat), "p_value": clean_value(p)}]
                diagnostics = {"test": "Mann-Whitney U", "ties_possible": True}
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
            estimates = [{"term": str(exposure), "statistic": clean_value(result.statistic), "p_value": clean_value(result.pvalue)}]
            diagnostics = {"test": "McNemar", "table": table.to_dict()}
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
            estimates = [{"term": str(exposure), "z_statistic": clean_value(z), "p_value": clean_value(p), "groups": int(len(ordered))}]
            diagnostics = {"test": "Cochran-Armitage trend", "ordered_groups": [clean_value(v) for v in ordered], "table": table.to_dict()}
        elif method == "fisher-exact":
            if table.shape != (2, 2):
                raise ValueError("Fisher exact test requires a 2x2 table.")
            odds, p = stats.fisher_exact(table.to_numpy())
            estimates = [{"term": str(exposure), "odds_ratio": clean_value(odds), "p_value": clean_value(p)}]
            diagnostics = {"test": "Fisher exact", "table": table.to_dict()}
        else:
            chi2, p, dof, expected = stats.chi2_contingency(table)
            if np.any(expected < 5):
                warnings.append("At least one expected cell count is below 5; consider Fisher/exact or sparse-cell policy.")
                issues.append({"severity": "warning", "code": "SPARSE_EXPECTED_CELL", "message": "At least one expected cell count is below 5.", "evidenceRefs": ["expected_counts"]})
            estimates = [{"term": str(exposure), "chi_square": clean_value(chi2), "degrees_of_freedom": int(dof), "p_value": clean_value(p), "cramers_v": cramers_v(table)}]
            diagnostics = {"test": "Chi-square independence", "table": table.to_dict(), "min_expected": clean_value(np.min(expected))}
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
        elif method == "spearman":
            r, p = stats.spearmanr(x[ok], y[ok])
        elif method == "kendall":
            r, p = stats.kendalltau(x[ok], y[ok])
        else:
            if sm is None:
                raise ValueError("statsmodels is required for partial correlation.")
            cov = data.loc[ok, covariates].apply(pd.to_numeric, errors="coerce").dropna()
            aligned = data.loc[cov.index]
            x_res = sm.OLS(pd.to_numeric(aligned[exposure], errors="coerce"), sm.add_constant(cov, has_constant="add")).fit().resid
            y_res = sm.OLS(pd.to_numeric(aligned[outcome], errors="coerce"), sm.add_constant(cov, has_constant="add")).fit().resid
            r, p = stats.pearsonr(x_res, y_res)
            ok = pd.Series(True, index=cov.index)
        estimates = [{"term": str(exposure), "correlation": clean_value(r), "p_value": clean_value(p), "n": int(ok.sum()), "adjusted_for": ", ".join(covariates) if method == "partial-correlation" else ""}]
        diagnostics = {"test": method, "n": int(ok.sum())}
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
                estimates = [{"term": str(g), "time": clean_value(max([r["time"] for r in rows if r["group"] == g], default=None)), "survival": clean_value([r for r in rows if r["group"] == g][-1]["survival"] if [r for r in rows if r["group"] == g] else None)} for g in sorted(set(r["group"] for r in rows), key=str)]
                diagnostics = {"test": "Kaplan-Meier", "curve_path": curve_path, "groups": sorted(set(r["group"] for r in rows), key=str)}
                figures.append(save_fig(out_dir, "kaplan-meier.png", "Kaplan-Meier Survival Curve", "Estimated survival curves by group.", variables, lambda: [plt.step([r["time"] for r in rows if r["group"] == g], [r["survival"] for r in rows if r["group"] == g], where="post", label=str(g)) for g in sorted(set(r["group"] for r in rows), key=str)] and plt.legend(title=group or "Group"), "Time", "Survival probability"))
            elif method == "log-rank":
                result = logrank_two_group(data[time_col], data[event_col], data[group])
                estimates = [{"term": str(group), **result}]
                diagnostics = {"test": "log-rank", "groups": list(data[group].dropna().unique())}
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
                diagnostics = {"test": method, "events": int(event_indicator(data[event_col]).sum()), "n_predictors": int(x.shape[1]), "strata": strata_col}
            elif method == "aalen-johansen-cif":
                rows = cif_curve(data[time_col], data[event_col], event_of_interest=1, group=data[group] if group else None)
                curve_path = os.path.join(out_dir, "cumulative-incidence.csv")
                write_csv(curve_path, rows)
                estimates = [{"term": str(g), "final_cumulative_incidence": clean_value([r for r in rows if r["group"] == g][-1]["cumulative_incidence"] if [r for r in rows if r["group"] == g] else None)} for g in sorted(set(r["group"] for r in rows), key=str)]
                diagnostics = {"test": "Aalen-Johansen cumulative incidence", "curve_path": curve_path, "event_of_interest_code": 1}
                figures.append(save_fig(out_dir, "cumulative-incidence.png", "Cumulative Incidence", "Nonparametric cumulative incidence for event code 1 with other nonzero codes treated as competing events.", variables, lambda: [plt.step([r["time"] for r in rows if r["group"] == g], [r["cumulative_incidence"] for r in rows if r["group"] == g], where="post", label=str(g)) for g in sorted(set(r["group"] for r in rows), key=str)] and plt.legend(title=group or "Group"), "Time", "Cumulative incidence"))
            else:
                denom_time = pd.to_numeric(data[time_col], errors="coerce").sum()
                events = event_indicator(data[event_col]).sum()
                estimates = [{"term": "event_rate", "events": clean_value(events), "person_time": clean_value(denom_time), "rate": safe_divide(events, denom_time)}]
                diagnostics = {"test": "recurrent event rate", "id": id_col, "unique_subjects": int(data[id_col].nunique()) if id_col else None}
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
            diagnostics = {"test": "repeated-measures ANOVA", "subject": subject, "within": within}
            model = None
        else:
            issues.append({"severity": "blocker", "code": "GLMM_BACKEND_NOT_AVAILABLE", "message": "Generalized mixed models require a validated GLMM backend; use GEE for population-average binary/continuous repeated measures in this runtime.", "evidenceRefs": ["method"]})
            estimates = [{"term": method, "status": "blocked", "reason": "backend_not_available"}]
            diagnostics = {"test": method}
            model = None
        if method in ("linear-mixed-model", "gee"):
            ci = model.conf_int()
            estimates = [{"term": str(term), "estimate": clean_value(model.params[term]), "std_error": clean_value(model.bse[term]), "ci_low": clean_value(ci.loc[term, 0]), "ci_high": clean_value(ci.loc[term, 1]), "p_value": clean_value(model.pvalues[term])} for term in model.params.index]
            diagnostics = {"test": method, "cluster": cluster, "clusters": int(data[cluster].nunique()), "aic": clean_value(getattr(model, "aic", None))}
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
            diagnostics = {"test": method, "propensity_model": {"aic": clean_value(getattr(ps_model, "aic", None))}, "balance": balance_summary(balance), "positivity": positivity_summary(ps, data["_t"]), "artifacts": {"balance": balance_path}}
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
            diagnostics = {"test": "entropy balancing", "optimized": bool(opt.success), "balance": balance_summary(balance), "artifacts": {}}
            complete = int(data.shape[0])
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
            diagnostics["parallel_trends_review_required"] = True
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
            diagnostics = {"test": "2SLS", "first_stage_f_statistic": clean_value(float(first.fvalue) if first.fvalue is not None else None), "instrument": instrument, "exclusion_restriction_review_required": True}
            complete = int(data.shape[0])
    elif method in ("prediction-evaluation", "missingness-summary", "multiple-imputation-mice", "missingness-ipw", "complete-case-sensitivity", "mnar-sensitivity", "model-diagnostics", "reliability-kappa", "intraclass-correlation", "cronbach-alpha", "pca", "clustering-validation", "bland-altman", "multiple-comparison-correction", "power-sample-size"):
        variables = req.get("variables") or [c for c in [req.get("outcome"), req.get("exposure"), req.get("group")] + (req.get("covariates") or []) if c]
        require_columns(df, variables)
        data = df[variables].copy()
        complete = int(data.dropna().shape[0])
        if method == "missingness-summary":
            estimates = [{"term": col, "missing": int(data[col].isna().sum()), "non_missing": int(data[col].notna().sum()), "missing_fraction": clean_value(data[col].isna().mean())} for col in variables]
            diagnostics = {"test": method, "complete_case_n": complete, "input_rows": int(data.shape[0])}
            figures.append(save_fig(out_dir, "missingness-bar.png", "Missingness By Variable", "Fraction missing by variable.", variables, lambda: plt.bar([r["term"] for r in estimates], [r["missing_fraction"] for r in estimates]), "Variable", "Fraction missing"))
        elif method == "multiple-imputation-mice":
            numeric = data.apply(pd.to_numeric, errors="coerce")
            imputed = IterativeImputer(random_state=1, max_iter=10).fit_transform(numeric)
            imputed_path = os.path.join(out_dir, "imputed-data.csv")
            pd.DataFrame(imputed, columns=variables).to_csv(imputed_path, index=False)
            estimates = [{"term": col, "missing_before": int(data[col].isna().sum()), "imputed_values": int(data[col].isna().sum())} for col in variables]
            diagnostics = {"test": "MICE-style iterative imputation", "imputed_data": imputed_path, "assumption": "MAR sensitivity required"}
            issues.append({"severity": "warning", "code": "IMPUTATION_ASSUMPTION_REVIEW", "message": "Multiple imputation relies on MAR/model assumptions; compare against complete-case and sensitivity analyses.", "evidenceRefs": ["imputed-data.csv"]})
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
            estimates = [{"term": outcome, "observed_fraction": clean_value(frame["_observed"].mean()), "max_ipw": clean_value((1 / p_obs).max())}]
            diagnostics = {"test": method, "weights": weights_path}
        elif method in ("complete-case-sensitivity", "mnar-sensitivity"):
            outcome = req.get("outcome") or variables[0]
            numeric = pd.to_numeric(data[outcome], errors="coerce")
            observed_mean = numeric.dropna().mean()
            scenarios = [-1, -0.5, 0, 0.5, 1] if method == "mnar-sensitivity" else [0]
            sd = numeric.dropna().std(ddof=1)
            estimates = []
            for delta in scenarios:
                filled = numeric.fillna(observed_mean + delta * sd)
                estimates.append({"term": f"delta_{delta}", "mean": clean_value(filled.mean()), "assumption": "missing values shifted by delta SD from observed mean"})
            diagnostics = {"test": method, "observed_n": int(numeric.notna().sum()), "missing_n": int(numeric.isna().sum())}
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
            estimates = [{"term": "cohen_kappa", "kappa": clean_value(kappa), "observed_agreement": clean_value(po), "expected_agreement": clean_value(pe)}]
            diagnostics = {"test": "Cohen kappa", "table": table.to_dict()}
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
            estimates = [{"term": "ICC(1,k)-approx", "icc": clean_value(icc), "subjects": n, "raters_or_measures": k}]
            diagnostics = {"test": "intraclass correlation approximate one-way random effects"}
        elif method == "cronbach-alpha":
            mat = data[variables].apply(pd.to_numeric, errors="coerce").dropna()
            k = mat.shape[1]
            alpha = k / (k - 1) * (1 - mat.var(axis=0, ddof=1).sum() / mat.sum(axis=1).var(ddof=1)) if k > 1 else np.nan
            estimates = [{"term": "cronbach_alpha", "alpha": clean_value(alpha), "items": k, "n": int(mat.shape[0])}]
            diagnostics = {"test": "Cronbach alpha"}
        elif method == "pca":
            mat = data[variables].apply(pd.to_numeric, errors="coerce").dropna()
            pca = PCA(n_components=min(len(variables), mat.shape[0], int(req.get("outcomeThreshold") or len(variables)))).fit(mat)
            transformed_path = os.path.join(out_dir, "pca-transformed.csv")
            pd.DataFrame(pca.transform(mat)).to_csv(transformed_path, index=False)
            estimates = [{"term": f"PC{i+1}", "explained_variance_ratio": clean_value(v)} for i, v in enumerate(pca.explained_variance_ratio_)]
            diagnostics = {"test": "PCA", "transformed": transformed_path, "components": pca.components_.tolist()}
            figures.append(save_fig(out_dir, "pca-scree.png", "PCA Scree Plot", "Explained variance ratio by component.", variables, lambda: plt.plot(range(1, len(pca.explained_variance_ratio_) + 1), pca.explained_variance_ratio_, marker="o"), "Principal component", "Explained variance ratio"))
        elif method == "clustering-validation":
            mat = data[variables].apply(pd.to_numeric, errors="coerce").dropna()
            k = int(req.get("outcomeThreshold") or 3)
            labels = KMeans(n_clusters=k, random_state=1, n_init=10).fit_predict(mat)
            estimates = [{"term": "kmeans", "clusters": k, "silhouette": clean_value(silhouette_score(mat, labels) if k > 1 else None), "davies_bouldin": clean_value(davies_bouldin_score(mat, labels) if k > 1 else None), "calinski_harabasz": clean_value(calinski_harabasz_score(mat, labels) if k > 1 else None)}]
            diagnostics = {"test": "clustering validation", "cluster_counts": pd.Series(labels).value_counts().to_dict()}
        elif method == "bland-altman":
            if len(variables) < 2:
                raise ValueError("Bland-Altman requires two measurement variables.")
            a = pd.to_numeric(data[variables[0]], errors="coerce")
            b = pd.to_numeric(data[variables[1]], errors="coerce")
            ok = a.notna() & b.notna()
            diff = a[ok] - b[ok]
            mean = (a[ok] + b[ok]) / 2
            bias = diff.mean()
            loa_low = bias - 1.96 * diff.std(ddof=1)
            loa_high = bias + 1.96 * diff.std(ddof=1)
            estimates = [{"term": "bland_altman", "bias": clean_value(bias), "loa_low": clean_value(loa_low), "loa_high": clean_value(loa_high), "n": int(ok.sum())}]
            diagnostics = {"test": "Bland-Altman agreement"}
            figures.append(save_fig(out_dir, "bland-altman.png", "Bland-Altman Plot", "Difference versus mean for two measurements.", variables[:2], lambda: plt.scatter(mean, diff, alpha=0.6), "Mean of measurements", "Difference between measurements"))
        elif method == "multiple-comparison-correction":
            pvals = pd.to_numeric(data[variables[0]], errors="coerce").dropna()
            if multipletests is None:
                raise ValueError("statsmodels multipletests is required.")
            corrected = {}
            estimates = []
            for m in ["bonferroni", "holm", "fdr_bh", "fdr_by"]:
                reject, p_adj, _, _ = multipletests(pvals, alpha=req.get("alpha", 0.05), method=m)
                estimates.append({"term": m, "tests": int(len(pvals)), "rejected": int(reject.sum()), "min_adjusted_p": clean_value(np.min(p_adj))})
                corrected[m] = [clean_value(v) for v in p_adj]
            diagnostics = {"test": "multiple comparison correction", "methods": list(corrected.keys())}
        elif method == "power-sample-size":
            effect = float(req.get("outcomeThreshold") if req.get("outcomeThreshold") is not None else 0.5)
            alpha = float(req.get("alpha", 0.05))
            power = float(req.get("exposureThreshold") if req.get("exposureThreshold") is not None else 0.8)
            n = TTestIndPower().solve_power(effect_size=effect, alpha=alpha, power=power) if TTestIndPower else None
            estimates = [{"term": "two_sample_t_test_per_group", "effect_size": effect, "alpha": alpha, "power": power, "n_per_group": clean_value(n)}]
            diagnostics = {"test": "power/sample size"}
        else:
            outcome = req.get("outcome")
            exposure = req.get("exposure")
            require_columns(df, [outcome, exposure])
            y = as_binary_numeric(df[outcome])[0]
            score = pd.to_numeric(df[exposure], errors="coerce")
            ok = y.notna() & score.notna()
            auc = roc_auc_score(y[ok], score[ok])
            brier = brier_score_loss(y[ok], score[ok])
            estimates = [{"term": str(exposure), "auroc": clean_value(auc), "brier_score": clean_value(brier), "n": int(ok.sum())}]
            fpr, tpr, _ = roc_curve(y[ok], score[ok])
            diagnostics = {"test": "prediction evaluation", "roc_points": len(fpr)}
            figures.append(save_fig(out_dir, "roc-curve.png", "ROC Curve", "Receiver operating characteristic curve.", [outcome, exposure], lambda: (plt.plot(fpr, tpr), plt.plot([0, 1], [0, 1], linestyle="--", color="gray", linewidth=1)), "False positive rate", "True positive rate"))
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
