import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { stableHash } from "../runtime.js";
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
  const resultWithPosture: StatsRunResult = { ...result, resultPosture: deriveStatsResultPosture(result, request) };
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
  return [...new Set([request.outcome, request.exposure, request.group, request.weight, ...request.variables, ...request.covariates].filter((item): item is string => Boolean(item)))];
}

function statsBridgeSource(): string {
  return String.raw`
import json
import math
import os
import sys
from pathlib import Path

import numpy as np
import pandas as pd
from scipy import stats

try:
    import statsmodels.api as sm
except Exception:
    sm = None

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

def write_csv(path, rows):
    pd.DataFrame(rows).to_csv(path, index=False)

def require_columns(df, cols):
    missing = [c for c in cols if c and c not in df.columns]
    if missing:
        raise ValueError("Missing required columns: " + ", ".join(missing))

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

    if method == "descriptive":
        estimates, extra = descriptive(df, req)
        variables = req.get("variables") or list(df.columns)
        complete = extra["complete_case_n"]
    elif method in ("t-test", "mann-whitney"):
        outcome = req.get("outcome")
        group = req.get("group") or req.get("exposure")
        require_columns(df, [outcome, group])
        variables = [outcome, group]
        data = df[variables].dropna()
        groups = list(data[group].unique())
        if len(groups) != 2:
            raise ValueError("Expected exactly two groups.")
        y0 = pd.to_numeric(data[data[group] == groups[0]][outcome], errors="coerce").dropna()
        y1 = pd.to_numeric(data[data[group] == groups[1]][outcome], errors="coerce").dropna()
        if method == "t-test":
            stat, p = stats.ttest_ind(y1, y0, equal_var=False, nan_policy="omit")
            pooled = math.sqrt(((len(y0)-1)*y0.var(ddof=1) + (len(y1)-1)*y1.var(ddof=1)) / max(1, len(y0)+len(y1)-2))
            estimates = [{"term": str(group), "group_a": clean_value(groups[0]), "group_b": clean_value(groups[1]), "n_a": len(y0), "n_b": len(y1), "mean_a": clean_value(y0.mean()), "mean_b": clean_value(y1.mean()), "mean_difference": clean_value(y1.mean() - y0.mean()), "cohen_d": clean_value((y1.mean() - y0.mean()) / pooled if pooled else None), "statistic": clean_value(stat), "p_value": clean_value(p)}]
            diagnostics = {"test": "Welch two-sample t-test", "equal_variance_assumed": False}
        else:
            stat, p = stats.mannwhitneyu(y1, y0, alternative="two-sided")
            estimates = [{"term": str(group), "group_a": clean_value(groups[0]), "group_b": clean_value(groups[1]), "n_a": len(y0), "n_b": len(y1), "median_a": clean_value(y0.median()), "median_b": clean_value(y1.median()), "statistic": clean_value(stat), "p_value": clean_value(p)}]
            diagnostics = {"test": "Mann-Whitney U", "ties_possible": True}
        complete = int(len(y0) + len(y1))
    elif method in ("chi-square", "fisher-exact"):
        outcome = req.get("outcome")
        exposure = req.get("exposure") or req.get("group")
        require_columns(df, [outcome, exposure])
        variables = [outcome, exposure]
        data = df[variables].dropna()
        table = pd.crosstab(data[exposure], data[outcome])
        if method == "fisher-exact":
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
            estimates = [{"term": str(exposure), "chi_square": clean_value(chi2), "degrees_of_freedom": int(dof), "p_value": clean_value(p)}]
            diagnostics = {"test": "Chi-square independence", "table": table.to_dict(), "min_expected": clean_value(np.min(expected))}
        complete = int(data.shape[0])
    elif method in ("pearson", "spearman"):
        outcome = req.get("outcome")
        exposure = req.get("exposure")
        require_columns(df, [outcome, exposure])
        variables = [outcome, exposure]
        data = df[variables].dropna()
        x = pd.to_numeric(data[exposure], errors="coerce")
        y = pd.to_numeric(data[outcome], errors="coerce")
        ok = x.notna() & y.notna()
        if method == "pearson":
            r, p = stats.pearsonr(x[ok], y[ok])
        else:
            r, p = stats.spearmanr(x[ok], y[ok])
        estimates = [{"term": str(exposure), "correlation": clean_value(r), "p_value": clean_value(p)}]
        diagnostics = {"test": method, "n": int(ok.sum())}
        complete = int(ok.sum())
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
    elif method in ("linear-regression", "logistic-regression", "poisson-regression"):
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
        elif method == "logistic-regression":
            y, levels = binary_series(y_raw)
            model = sm.GLM(y, x, family=sm.families.Binomial(), freq_weights=weights).fit()
            diagnostics["outcome_levels"] = [clean_value(v) for v in levels]
        else:
            y = pd.to_numeric(y_raw, errors="coerce")
            model = sm.GLM(y, x, family=sm.families.Poisson(), freq_weights=weights).fit()
            if model.pearson_chi2 / max(1, model.df_resid) > 2:
                warnings.append("Poisson overdispersion diagnostic is high; consider negative binomial or robust variance.")
                issues.append({"severity": "warning", "code": "POISSON_OVERDISPERSION", "message": "Poisson overdispersion diagnostic is high; consider negative binomial or robust variance.", "evidenceRefs": ["diagnostics.pearson_chi2"]})
        ci = model.conf_int()
        for term in model.params.index:
            row = {"term": str(term), "estimate": clean_value(model.params[term]), "std_error": clean_value(model.bse[term]), "p_value": clean_value(model.pvalues[term]), "ci_low": clean_value(ci.loc[term, 0]), "ci_high": clean_value(ci.loc[term, 1])}
            if method == "logistic-regression":
                row.update({"odds_ratio": clean_value(safe_exp(model.params[term])), "or_ci_low": clean_value(safe_exp(ci.loc[term, 0])), "or_ci_high": clean_value(safe_exp(ci.loc[term, 1]))})
            if method == "poisson-regression":
                row.update({"rate_ratio": clean_value(safe_exp(model.params[term])), "rr_ci_low": clean_value(safe_exp(ci.loc[term, 0])), "rr_ci_high": clean_value(safe_exp(ci.loc[term, 1]))})
            estimates.append(row)
        diagnostics.update({"model_family": method, "aic": clean_value(getattr(model, "aic", None)), "df_resid": clean_value(model.df_resid), "weighted": weight is not None})
        if hasattr(model, "converged") and not bool(model.converged):
            issues.append({"severity": "blocker", "code": "REGRESSION_DID_NOT_CONVERGE", "message": "The regression model did not converge.", "evidenceRefs": ["diagnostics.converged"]})
        extreme_terms = [str(term) for term in model.params.index if abs(float(model.params[term])) > 20]
        if method == "logistic-regression" and extreme_terms:
            issues.append({"severity": "warning", "code": "POSSIBLE_SEPARATION_OR_EXTREME_LOG_ODDS", "message": "One or more logistic coefficients are extreme; review possible separation or sparse predictors.", "evidenceRefs": extreme_terms})
        complete = int(data.shape[0])
    else:
        raise ValueError(f"Unsupported stats method: {method}")

    if complete < 30:
        issues.append({"severity": "warning", "code": "LOW_COMPLETE_CASE_N", "message": f"Complete-case N is {complete}; estimates may be unstable.", "evidenceRefs": ["completeCaseN"]})
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
    return {
        "schemaVersion": 1,
        "runId": "statsrun_" + str(abs(hash(json.dumps({"method": method, "vars": variables, "n": complete}, sort_keys=True)))),
        "method": method,
        "status": "succeeded",
        "rowCount": int(df.shape[0]),
        "completeCaseN": int(complete),
        "variables": variables,
        "parameters": params,
        "estimates": estimates,
        "diagnostics": diagnostics,
        "issues": issues,
        "warnings": warnings,
        "errors": [],
        "artifacts": [
            {"kind": "config", "path": os.path.join(out_dir, "stats-config.json")},
            {"kind": "summary", "path": summary_path},
            {"kind": "table", "path": table_path},
            {"kind": "diagnostics", "path": diagnostics_path},
        ],
        "outDir": out_dir,
    }

def main():
    config_path = sys.argv[1]
    with open(config_path) as f:
        req = json.load(f)
    try:
        print(json.dumps(run(req)))
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
            "errors": [str(exc)],
            "artifacts": [{"kind": "config", "path": config_path}],
            "outDir": req.get("outDir"),
        }))

if __name__ == "__main__":
    main()
`;
}
