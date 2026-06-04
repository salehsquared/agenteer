import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";

interface ManifestArtifact {
  kind: string;
  path: string;
  required: boolean;
  exists: boolean;
  sha256: string | null;
}

interface CompanionReadiness {
  status: "not_required" | "advisory" | "satisfied" | "missing" | "unverifiable";
  requiredMethods: string[];
  satisfiedMethods: string[];
  missingMethods: string[];
  evidenceRefs: string[];
}

interface RunnerCapabilityReadiness {
  method: string | null;
  status: "executable" | "bounded_approximation" | "backend_blocked" | null;
  reason: string | null;
  requiredFollowUp: string[];
  cannotSupport: string[];
}

interface MethodDecisionReadiness {
  status: "preferred" | "review_required" | "blocked" | "missing";
  requestedMethod: string | null;
  requestedRole: string | null;
  verdict: string | null;
  primaryMethods: string[];
  sensitivityMethods: string[];
  fallbackMethods: string[];
  nextAction: string | null;
  evidenceRefs: string[];
}

interface MethodDecisionEvidenceConsistency {
  status: "not_applicable" | "pass" | "warning";
  summary: string | null;
  sourceCount: number;
  mismatchedSources: string[];
  evidenceRefs: string[];
}

interface QaReadiness {
  status: "not_applicable" | "pass" | "warning" | "fail" | "missing" | "unreadable";
  summary: string | null;
  failingChecks: string[];
  warningChecks: string[];
  criticalWarningChecks: string[];
  advisoryWarningChecks: string[];
  warningCounts: {
    total: number;
    critical: number;
    advisory: number;
  };
  failingDetails: Record<string, string[]>;
  warningDetails: Record<string, string[]>;
  evidenceRefs: string[];
}

export interface StatsQaWarningClassification {
  critical: string[];
  advisory: string[];
}

interface FeasibilityReadiness {
  status: "not_supplied" | "pass" | "warning" | "blocked" | "unverifiable";
  verdict: string | null;
  score: number | null;
  confidence: number | null;
  blockers: string[];
  warnings: string[];
  requiredModifications: string[];
  nextAction: string | null;
  evidenceRefs: string[];
}

export interface AnalysisRunManifest {
  schemaVersion: 1;
  manifestId: string;
  runDir: string;
  runKind: "stats" | "ml" | "ml-comparison";
  runPath: string;
  runId: string;
  runStatus: string;
  methodOrModel: string | null;
  resultPosture: {
    status: string | null;
    interpretationBoundary: string | null;
    nextAction: string | null;
  };
  readiness: "local_review_ready" | "exploratory_only" | "blocked";
  qaReadiness: QaReadiness;
  runnerCapability: RunnerCapabilityReadiness;
  artifactCompleteness: {
    status: "pass" | "fail";
    missingRequired: string[];
  };
  companionReadiness: CompanionReadiness;
  feasibilityReadiness: FeasibilityReadiness;
  methodDecisionReadiness: MethodDecisionReadiness;
  methodDecisionEvidenceConsistency: MethodDecisionEvidenceConsistency;
  artifacts: ManifestArtifact[];
  issueCodes: string[];
  nextAction: string;
  outPath: string;
}

export async function buildAnalysisRunManifest(opts: { runDir: string; outPath?: string }): Promise<AnalysisRunManifest> {
  const runDir = path.resolve(opts.runDir);
  const statsPath = path.join(runDir, "stats-run.json");
  const mlPath = path.join(runDir, "ml-run.json");
  const comparisonPath = path.join(runDir, "comparison.json");
  const hasStats = existsSync(statsPath);
  const hasMl = existsSync(mlPath);
  const hasComparison = existsSync(comparisonPath);
  const detected = [hasStats, hasMl, hasComparison].filter(Boolean).length;
  if (detected > 1) throw new Error(`Run directory contains multiple analysis result roots: ${runDir}`);
  if (detected === 0) throw new Error(`Run directory must contain stats-run.json, ml-run.json, or comparison.json: ${runDir}`);
  const runKind = hasStats ? "stats" as const : hasMl ? "ml" as const : "ml-comparison" as const;
  const runPath = hasStats ? statsPath : hasMl ? mlPath : comparisonPath;
  const raw = JSON.parse(await readFile(runPath, "utf-8")) as Record<string, unknown>;
  const result = unwrapRun(raw, runKind);
  const posture = isRecord(result.resultPosture)
    ? result.resultPosture as Record<string, unknown>
    : isRecord(result.comparisonPosture)
      ? result.comparisonPosture as Record<string, unknown>
      : {};
  const artifactList = Array.isArray(result.artifacts) ? result.artifacts.filter(isRecord) as Array<Record<string, unknown>> : [];
  const required = requiredArtifacts(runKind, result);
  const artifacts = await buildManifestArtifacts(runDir, runPath, runKind, artifactList, required);
  const missingRequired = artifacts.filter(artifact => artifact.required && !artifact.exists).map(artifact => artifact.kind);
  const postureStatus = typeof posture.status === "string" ? posture.status : null;
  const runStatus = String(result.status ?? (runKind === "ml-comparison" && postureStatus ? "succeeded" : "unknown"));
  const companionReadiness = await buildCompanionReadiness(runDir, result);
  const feasibilityReadiness = await buildFeasibilityReadiness(runDir);
  const runnerCapability = runnerCapabilityForManifest(result);
  const methodDecisionReadiness = await methodDecisionReadinessForManifest(result, artifactList, runDir);
  const methodDecisionEvidenceConsistency = await methodDecisionEvidenceConsistencyForManifest(runKind, result, runDir);
  const qaReadiness = await buildQaReadiness(runKind, runDir, artifacts);
  const readiness = deriveReadiness(runKind, runStatus, postureStatus, missingRequired.length === 0, companionReadiness, feasibilityReadiness, runnerCapability, methodDecisionReadiness, methodDecisionEvidenceConsistency, qaReadiness);
  const outPath = path.resolve(opts.outPath ?? path.join(runDir, "analysis-run-manifest.json"));
  const manifest: AnalysisRunManifest = {
    schemaVersion: 1,
    manifestId: `analysis_manifest_${hash({ runPath, postureStatus, artifacts: artifacts.map(artifact => [artifact.kind, artifact.sha256]) }).slice(0, 16)}`,
    runDir,
    runKind,
    runPath,
    runId: String(result.runId ?? result.comparisonId ?? "(unknown)"),
    runStatus,
    methodOrModel: typeof result.method === "string" ? result.method : typeof result.modelId === "string" ? result.modelId : typeof result.task === "string" ? result.task : null,
    resultPosture: {
      status: postureStatus,
      interpretationBoundary: typeof posture.interpretationBoundary === "string" ? posture.interpretationBoundary : null,
      nextAction: typeof posture.nextAction === "string" ? posture.nextAction : null,
    },
    readiness,
    qaReadiness,
    runnerCapability,
    artifactCompleteness: {
      status: missingRequired.length === 0 ? "pass" : "fail",
      missingRequired,
    },
    companionReadiness,
    feasibilityReadiness,
    methodDecisionReadiness,
    methodDecisionEvidenceConsistency,
    artifacts,
    issueCodes: Array.isArray(result.issues)
      ? result.issues.filter(isRecord).map(issue => String(issue.code ?? "")).filter(Boolean)
      : [],
    nextAction: nextActionFor(readiness, postureStatus, companionReadiness, feasibilityReadiness, runnerCapability, methodDecisionReadiness, methodDecisionEvidenceConsistency, qaReadiness),
    outPath,
  };
  await mkdir(path.dirname(outPath), { recursive: true });
  await writeFile(outPath, `${JSON.stringify({ schemaVersion: 1, analysisRunManifest: manifest }, null, 2)}\n`);
  return manifest;
}

function unwrapRun(raw: Record<string, unknown>, runKind: AnalysisRunManifest["runKind"]): Record<string, unknown> {
  const key = runKind === "stats" ? "statsRun" : runKind === "ml" ? "mlRun" : "mlComparison";
  return isRecord(raw[key]) ? raw[key] as Record<string, unknown> : raw;
}

async function buildManifestArtifacts(
  runDir: string,
  runPath: string,
  runKind: AnalysisRunManifest["runKind"],
  artifactList: Array<Record<string, unknown>>,
  required: Set<string>,
): Promise<ManifestArtifact[]> {
  const byKind = new Map<string, string>();
  byKind.set(runKind === "stats" ? "stats-run" : runKind === "ml" ? "ml-run" : "comparison", runPath);
  for (const artifact of artifactList) {
    const kind = String(artifact.kind ?? "");
    const artifactPath = typeof artifact.path === "string" ? artifact.path : "";
    if (kind && artifactPath) byKind.set(kind, path.resolve(artifactPath));
  }
  for (const expected of expectedArtifactPaths(runKind, runDir)) {
    if (!byKind.has(expected.kind)) byKind.set(expected.kind, expected.path);
  }
  const artifacts: ManifestArtifact[] = [];
  for (const [kind, artifactPath] of byKind.entries()) {
    artifacts.push({
      kind,
      path: artifactPath,
      required: required.has(kind),
      exists: existsSync(artifactPath),
      sha256: existsSync(artifactPath) ? await fileHash(artifactPath) : null,
    });
  }
  return artifacts.sort((a, b) => Number(b.required) - Number(a.required) || a.kind.localeCompare(b.kind));
}

function requiredArtifacts(runKind: AnalysisRunManifest["runKind"], result: Record<string, unknown>): Set<string> {
  if (runKind === "stats") {
    const base = new Set(["stats-run", "method-contract", "summary", "table", "diagnostics", "report", "qa", "preflight", "preflight-report", "method-decision-support", "method-decision-support-report"]);
    if (result.method === "propensity-score-matching") {
      base.add("balance");
      base.add("propensity-scores");
      base.add("propensity-overlap");
      base.add("matched-pairs");
    }
    if (result.method === "propensity-score-weighting") {
      base.add("balance");
      base.add("propensity-scores");
      base.add("propensity-overlap");
      base.add("weights");
    }
    return base;
  }
  if (runKind === "ml-comparison") return new Set(["comparison", "model-review-card"]);
  const task = String(result.task ?? "");
  if (task === "binary_classification") return new Set(["ml-run", "summary", "predictions", "calibration"]);
  return new Set(task === "dimensionality_reduction" || task === "clustering"
    ? ["ml-run", "summary", "transformed"]
    : ["ml-run", "summary", "predictions"]);
}

function expectedArtifactPaths(runKind: AnalysisRunManifest["runKind"], runDir: string): Array<{ kind: string; path: string }> {
  if (runKind === "stats") {
    return [
      { kind: "stats-run", path: path.join(runDir, "stats-run.json") },
      { kind: "method-contract", path: path.join(runDir, "method-contract.json") },
      { kind: "summary", path: path.join(runDir, "stats-summary.json") },
      { kind: "table", path: path.join(runDir, "estimates.csv") },
      { kind: "diagnostics", path: path.join(runDir, "diagnostics.json") },
      { kind: "report", path: path.join(runDir, "stats-report.md") },
      { kind: "qa", path: path.join(runDir, "stats-qa.json") },
      { kind: "preflight", path: path.join(runDir, "stats-preflight.json") },
      { kind: "preflight-report", path: path.join(runDir, "stats-preflight.md") },
      { kind: "method-decision-support", path: path.join(runDir, "method-decision-support.json") },
      { kind: "method-decision-support-report", path: path.join(runDir, "method-decision-support.md") },
      { kind: "figure-manifest", path: path.join(runDir, "figures.json") },
      { kind: "figure-qa", path: path.join(runDir, "figure-qa.json") },
      { kind: "balance", path: path.join(runDir, "balance.csv") },
      { kind: "propensity-scores", path: path.join(runDir, "propensity-scores.csv") },
      { kind: "propensity-overlap", path: path.join(runDir, "propensity-overlap.csv") },
      { kind: "matched-pairs", path: path.join(runDir, "matched-pairs.csv") },
      { kind: "weights", path: path.join(runDir, "weights.csv") },
      { kind: "propensity-paper", path: path.join(path.dirname(runDir), "paper.md") },
      { kind: "propensity-paper-qa", path: path.join(path.dirname(runDir), "paper-qa.json") },
      { kind: "diagnostic-paper", path: path.join(path.dirname(runDir), "paper.md") },
      { kind: "diagnostic-paper-qa", path: path.join(path.dirname(runDir), "paper-qa.json") },
      { kind: "feasibility-gate", path: path.join(path.dirname(runDir), "feasibility-gate.json") },
      { kind: "feasibility-trial", path: path.join(path.dirname(runDir), "feasibility-trial.json") },
      { kind: "literature-search", path: path.join(path.dirname(runDir), "literature-search.json") },
      { kind: "literature-context", path: path.join(path.dirname(runDir), "literature-context.json") },
      { kind: "literature-context-report", path: path.join(path.dirname(runDir), "literature-context.md") },
      { kind: "literature-qa", path: path.join(path.dirname(runDir), "literature-qa.json") },
      { kind: "literature-qa-report", path: path.join(path.dirname(runDir), "literature-qa.md") },
    ];
  }
  if (runKind === "ml-comparison") {
    return [
      { kind: "comparison", path: path.join(runDir, "comparison.json") },
      { kind: "model-review-card", path: path.join(runDir, "model-review-card.md") },
    ];
  }
  return [
    { kind: "ml-run", path: path.join(runDir, "ml-run.json") },
    { kind: "summary", path: path.join(runDir, "model-summary.json") },
    { kind: "predictions", path: path.join(runDir, "predictions.csv") },
    { kind: "transformed", path: path.join(runDir, "transformed.csv") },
    { kind: "calibration", path: path.join(runDir, "calibration.csv") },
  ];
}

async function buildCompanionReadiness(runDir: string, result: Record<string, unknown>): Promise<CompanionReadiness> {
  const planPath = path.join(path.dirname(runDir), "modeling-plan.json");
  if (!existsSync(planPath)) return { status: "not_required", requiredMethods: [], satisfiedMethods: [], missingMethods: [], evidenceRefs: [] };
  try {
    const raw = JSON.parse(await readFile(planPath, "utf-8")) as Record<string, unknown>;
    const plan = isRecord(raw.modelingPlan) ? raw.modelingPlan as Record<string, unknown> : raw;
    const guidance = isRecord(plan.statisticalMethodGuidance) ? plan.statisticalMethodGuidance as Record<string, unknown> : {};
    const readiness = isRecord(guidance.readiness) ? guidance.readiness as Record<string, unknown> : {};
    const requiredMethods = Array.isArray(readiness.requiredCompanionMethods)
      ? uniqueStrings(readiness.requiredCompanionMethods.map(value => String(value)))
      : [];
    const enforceCompanionReadiness = readiness.enforceCompanionReadiness === true;
    if (!requiredMethods.length) {
      return { status: "not_required", requiredMethods: [], satisfiedMethods: [], missingMethods: [], evidenceRefs: [planPath] };
    }
    const primaryMethod = typeof result.method === "string" ? result.method : null;
    const companionRuns = await collectCompanionStatsRuns(path.dirname(runDir), runDir);
    const satisfiedMethods = requiredMethods.filter(method =>
      method !== primaryMethod
      && companionRuns.some(run => run.method === method && run.status === "succeeded")
    );
    const missingMethods = requiredMethods.filter(method => !satisfiedMethods.includes(method));
    if (!enforceCompanionReadiness) {
      return {
        status: "advisory",
        requiredMethods,
        satisfiedMethods,
        missingMethods,
        evidenceRefs: [planPath, ...companionRuns.map(run => run.path)],
      };
    }
    return {
      status: missingMethods.length ? "missing" : "satisfied",
      requiredMethods,
      satisfiedMethods,
      missingMethods,
      evidenceRefs: [planPath, ...companionRuns.map(run => run.path)],
    };
  } catch (error) {
    return {
      status: "unverifiable",
      requiredMethods: [],
      satisfiedMethods: [],
      missingMethods: [],
      evidenceRefs: [planPath, error instanceof Error ? error.message : String(error)],
    };
  }
}

async function buildFeasibilityReadiness(runDir: string): Promise<FeasibilityReadiness> {
  const parentDir = path.dirname(runDir);
  const planPath = path.join(parentDir, "modeling-plan.json");
  const gatePath = path.join(parentDir, "feasibility-gate.json");
  try {
    const plan = existsSync(planPath) ? await readJsonObject(planPath) : null;
    const modelingPlan = plan && isRecord(plan.modelingPlan) ? plan.modelingPlan as Record<string, unknown> : plan;
    const planEvidence = modelingPlan && isRecord(modelingPlan.feasibilityEvidence)
      ? modelingPlan.feasibilityEvidence as Record<string, unknown>
      : null;
    const gate = existsSync(gatePath) ? await readJsonObject(gatePath) : null;
    const gateEvidence = gate && isRecord(gate.feasibilityGate) ? gate.feasibilityGate as Record<string, unknown> : gate;
    const evidence = planEvidence ?? gateEvidence;
    const evidenceRefs = uniqueStrings([
      ...(planEvidence ? [planPath] : []),
      ...(gateEvidence ? [gatePath] : []),
    ]);
    if (!evidence) {
      return {
        status: "not_supplied",
        verdict: null,
        score: null,
        confidence: null,
        blockers: [],
        warnings: [],
        requiredModifications: [],
        nextAction: null,
        evidenceRefs: [planPath, gatePath].filter(existsSync),
      };
    }
    const rawStatus = typeof evidence.status === "string" ? evidence.status : "unknown";
    const verdict = typeof evidence.verdict === "string" ? evidence.verdict : null;
    const blockers = stringArray(evidence.blockers);
    const warnings = stringArray((evidence as { warnings?: unknown }).warnings ?? (evidence as { warningsText?: unknown }).warningsText);
    const requiredModifications = stringArray(evidence.requiredModifications);
    const status: FeasibilityReadiness["status"] = rawStatus === "block" || rawStatus === "blocked" || verdict === "reject" || blockers.length
      ? "blocked"
      : verdict === "formal_analysis_ready" || rawStatus === "pass"
        ? "pass"
        : rawStatus === "warning" || rawStatus === "needs_methods_review" || (verdict !== null && verdict !== "unknown")
          ? "warning"
          : "unverifiable";
    return {
      status,
      verdict,
      score: numberOrNull(evidence.score),
      confidence: numberOrNull(evidence.confidence),
      blockers,
      warnings,
      requiredModifications,
      nextAction: typeof evidence.nextAction === "string" ? evidence.nextAction : null,
      evidenceRefs,
    };
  } catch (error) {
    return {
      status: "unverifiable",
      verdict: null,
      score: null,
      confidence: null,
      blockers: [],
      warnings: [],
      requiredModifications: [],
      nextAction: error instanceof Error ? error.message : String(error),
      evidenceRefs: [planPath, gatePath].filter(existsSync),
    };
  }
}

async function collectCompanionStatsRuns(rootDir: string, excludeRunDir: string, maxDepth = 3): Promise<Array<{ method: string; status: string; path: string }>> {
  const runs: Array<{ method: string; status: string; path: string }> = [];
  const exclude = path.resolve(excludeRunDir);
  async function visit(dir: string, depth: number): Promise<void> {
    if (depth < 0) return;
    const statsPath = path.join(dir, "stats-run.json");
    if (path.resolve(dir) !== exclude && existsSync(statsPath)) {
      try {
        const raw = JSON.parse(await readFile(statsPath, "utf-8")) as Record<string, unknown>;
        const result = isRecord(raw.statsRun) ? raw.statsRun as Record<string, unknown> : raw;
        if (typeof result.method === "string") {
          runs.push({ method: result.method, status: String(result.status ?? "unknown"), path: statsPath });
        }
      } catch {
        // Ignore unreadable sibling stats runs; the primary manifest will report missing required companions if needed.
      }
      return;
    }
    if (depth === 0) return;
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
      await visit(path.join(dir, entry.name), depth - 1);
    }
  }
  await visit(path.resolve(rootDir), maxDepth);
  return runs;
}

async function buildQaReadiness(runKind: AnalysisRunManifest["runKind"], runDir: string, artifacts: ManifestArtifact[]): Promise<QaReadiness> {
  if (runKind !== "stats") {
    return {
      status: "not_applicable",
      summary: "No stats QA artifact is expected for this run kind.",
      failingChecks: [],
      warningChecks: [],
      criticalWarningChecks: [],
      advisoryWarningChecks: [],
      warningCounts: { total: 0, critical: 0, advisory: 0 },
      failingDetails: {},
      warningDetails: {},
      evidenceRefs: [],
    };
  }
  const qaArtifact = artifacts.find(artifact => artifact.kind === "qa");
  const qaPath = qaArtifact?.path ?? path.join(runDir, "stats-qa.json");
  if (!existsSync(qaPath)) {
    return {
      status: "missing",
      summary: "Stats QA artifact is missing.",
      failingChecks: [],
      warningChecks: [],
      criticalWarningChecks: [],
      advisoryWarningChecks: [],
      warningCounts: { total: 0, critical: 0, advisory: 0 },
      failingDetails: {},
      warningDetails: {},
      evidenceRefs: [qaPath],
    };
  }
  try {
    const raw = JSON.parse(await readFile(qaPath, "utf-8")) as Record<string, unknown>;
    const qa = isRecord(raw.statsQa) ? raw.statsQa as Record<string, unknown> : raw;
    const checks = Array.isArray(qa.checks) ? qa.checks.filter(isRecord) as Array<Record<string, unknown>> : [];
    const failingChecks = checks
      .filter(check => check.status === "fail")
      .map(check => String(check.id ?? "(unknown)"));
    const warningChecks = checks
      .filter(check => check.status === "warning")
      .map(check => String(check.id ?? "(unknown)"));
    const failingDetails = checkDetailsById(checks, "fail");
    const warningDetails = checkDetailsById(checks, "warning");
    const uniqueWarningChecks = uniqueStrings(warningChecks);
    const warningClassification = classifyStatsQaWarningChecks(uniqueWarningChecks);
    const rawStatus = typeof qa.status === "string" ? qa.status : null;
    const status: QaReadiness["status"] = failingChecks.length
      ? "fail"
      : warningChecks.length
        ? "warning"
        : rawStatus === "pass" || rawStatus === "warning" || rawStatus === "fail"
          ? rawStatus
          : "unreadable";
    return {
      status,
      summary: typeof qa.summary === "string" ? qa.summary : null,
      failingChecks: uniqueStrings(failingChecks),
      warningChecks: uniqueWarningChecks,
      criticalWarningChecks: warningClassification.critical,
      advisoryWarningChecks: warningClassification.advisory,
      warningCounts: {
        total: uniqueWarningChecks.length,
        critical: warningClassification.critical.length,
        advisory: warningClassification.advisory.length,
      },
      failingDetails,
      warningDetails,
      evidenceRefs: [qaPath],
    };
  } catch (error) {
    return {
      status: "unreadable",
      summary: error instanceof Error ? error.message : String(error),
      failingChecks: [],
      warningChecks: [],
      criticalWarningChecks: [],
      advisoryWarningChecks: [],
      warningCounts: { total: 0, critical: 0, advisory: 0 },
      failingDetails: {},
      warningDetails: {},
      evidenceRefs: [qaPath],
    };
  }
}

function deriveReadiness(
  runKind: AnalysisRunManifest["runKind"],
  runStatus: string,
  posture: string | null,
  complete: boolean,
  companionReadiness: CompanionReadiness,
  feasibilityReadiness: FeasibilityReadiness,
  runnerCapability: RunnerCapabilityReadiness,
  methodDecisionReadiness: MethodDecisionReadiness,
  methodDecisionEvidenceConsistency: MethodDecisionEvidenceConsistency,
  qaReadiness: QaReadiness,
): AnalysisRunManifest["readiness"] {
  if (runStatus !== "succeeded" || !complete) return "blocked";
  if (runKind === "stats" && (qaReadiness.status === "fail" || qaReadiness.status === "missing" || qaReadiness.status === "unreadable")) return "blocked";
  if (runKind === "stats" && feasibilityReadiness.status === "blocked") return "blocked";
  if (runKind === "stats" && runnerCapability.status === "backend_blocked") return "blocked";
  if (runKind === "stats" && methodDecisionReadiness.status === "blocked") return "blocked";
  if (runKind === "stats" && effectiveCriticalQaWarningChecks(qaReadiness, companionReadiness).length > 0) return "exploratory_only";
  if (runKind === "stats" && (feasibilityReadiness.status === "warning" || feasibilityReadiness.status === "unverifiable" || feasibilityReadiness.status === "not_supplied")) return "exploratory_only";
  if (runKind === "stats" && runnerCapability.status === "bounded_approximation") return "exploratory_only";
  if (runKind === "stats" && methodDecisionReadiness.status !== "preferred") return "exploratory_only";
  if (runKind === "stats" && methodDecisionEvidenceConsistency.status === "warning") return "exploratory_only";
  if (companionReadiness.status === "missing" || companionReadiness.status === "unverifiable") return "exploratory_only";
  if (runKind === "stats" && posture === "bound_standard_table") return "local_review_ready";
  if (runKind === "ml" && posture === "locally_validated_prediction") return "local_review_ready";
  if (runKind === "ml-comparison" && posture === "baseline_comparison_ready") return "local_review_ready";
  return "exploratory_only";
}

function nextActionFor(
  readiness: AnalysisRunManifest["readiness"],
  posture: string | null,
  companionReadiness: CompanionReadiness,
  feasibilityReadiness: FeasibilityReadiness,
  runnerCapability: RunnerCapabilityReadiness,
  methodDecisionReadiness: MethodDecisionReadiness,
  methodDecisionEvidenceConsistency: MethodDecisionEvidenceConsistency,
  qaReadiness: QaReadiness,
): string {
  if (qaReadiness.status === "fail") return `Resolve failed stats QA check(s) before promotion: ${qaReadiness.failingChecks.join(", ") || qaReadiness.summary || "unknown failure"}.`;
  if (qaReadiness.status === "missing") return "Regenerate stats-run so stats-qa.json exists before promotion.";
  if (qaReadiness.status === "unreadable") return `Repair unreadable stats QA before promotion: ${qaReadiness.summary ?? "unknown parse error"}.`;
  const criticalQaWarnings = effectiveCriticalQaWarningChecks(qaReadiness, companionReadiness);
  if (criticalQaWarnings.length > 0) return `Resolve critical stats QA warning(s) before promotion: ${formatCriticalQaWarnings(criticalQaWarnings, qaReadiness)}.`;
  if (runnerCapability.status === "backend_blocked") return `Route to a validated backend or redesign before promotion: ${runnerCapability.requiredFollowUp.join(" ") || runnerCapability.reason || "backend unavailable"}`;
  if (runnerCapability.status === "bounded_approximation") return `Treat this run as exploratory until required follow-up is complete: ${runnerCapability.requiredFollowUp.join(" ") || runnerCapability.reason || "bounded approximation"}`;
  if (methodDecisionReadiness.status === "blocked") return methodDecisionReadiness.nextAction ?? "Repair blocked method-decision support before promotion.";
  if (methodDecisionReadiness.status === "review_required") {
    const primary = methodDecisionReadiness.primaryMethods.length ? ` Preferred method(s): ${methodDecisionReadiness.primaryMethods.join(", ")}.` : "";
    return `${methodDecisionReadiness.nextAction ?? "Rerun or document the data-preferred primary method before promotion."}${primary}`;
  }
  if (feasibilityReadiness.status === "blocked") return `Repair blocked feasibility evidence before promotion: ${feasibilityReadiness.blockers.join("; ") || feasibilityReadiness.nextAction || feasibilityReadiness.verdict || "blocked feasibility gate"}.`;
  if (feasibilityReadiness.status === "unverifiable") return `Repair or regenerate feasibility evidence before promotion: ${feasibilityReadiness.nextAction ?? "unverifiable feasibility evidence"}.`;
  if (feasibilityReadiness.status === "warning") return `Resolve or explicitly accept feasibility warning(s) before promotion: ${[...feasibilityReadiness.warnings, ...feasibilityReadiness.requiredModifications, feasibilityReadiness.nextAction].filter(Boolean).slice(0, 3).join("; ") || feasibilityReadiness.verdict || "review feasibility evidence"}.`;
  if (feasibilityReadiness.status === "not_supplied") return "Run or attach feasibility-gate or analysis-run feasibility-trial evidence before treating this stats packet as local-review-ready.";
  if (companionReadiness.status === "missing") return `Run or attach required companion method(s) before promotion: ${companionReadiness.missingMethods.join(", ")}.`;
  if (companionReadiness.status === "unverifiable") return "Repair or regenerate modeling-plan.json so companion-analysis requirements can be verified before promotion.";
  if (methodDecisionReadiness.status === "missing" && posture !== "blocked_survey_required") return "Regenerate stats-run so method-decision-support artifacts prove the requested method is data-appropriate before promotion.";
  if (methodDecisionEvidenceConsistency.status === "warning") return `Regenerate method-decision/preflight artifacts from the executed stats run before promotion: ${methodDecisionEvidenceConsistency.summary ?? "contradictory method-decision evidence"}.`;
  if (readiness === "local_review_ready") return "Proceed to local methods review; do not promote beyond the declared posture without stronger validation artifacts.";
  if (posture === "blocked_survey_required") return "Run modeling-plan with --prior-run and reroute to a survey-aware paper runner.";
  if (posture === "optional_dependency_missing") return "Install the optional backend or compare available baseline models.";
  if (posture === "exploratory_standard_table" || posture === "exploratory_prediction") return "Bind method/spec evidence or add validation evidence before stronger claims.";
  return "Resolve missing artifacts, failed execution, or design-review blockers before local review.";
}

const CRITICAL_STATS_QA_WARNING_CHECKS = new Set([
  "figure-manifest",
  "figure-quality",
  "method-contract-qa-gate-coverage",
  "method-contract-figure-coverage",
  "analysis-semantic-plausibility",
  "analysis-complete-case-retention",
  "analysis-variable-missingness-burden",
  "core-inference-sample-size",
  "core-inference-effect-size",
  "core-inference-uncertainty",
  "core-inference-nonparametric-bootstrap",
  "core-inference-assumptions",
  "core-inference-source-artifact",
  "core-inference-group-orientation-evidence",
  "mean-comparison-variance-balance",
  "core-inference-permutation-sensitivity",
  "core-inference-omnibus-effect-size",
  "core-inference-omnibus-effect-bootstrap",
  "core-inference-posthoc-contrasts",
  "categorical-association-table",
  "categorical-association-effect-size",
  "categorical-source-artifact",
  "categorical-cell-diagnostics-artifact",
  "categorical-sparse-cell-policy",
  "categorical-cell-residual-review",
  "categorical-binary-orientation-evidence",
  "categorical-effect-bootstrap-uncertainty",
  "categorical-expected-counts",
  "categorical-permutation-sensitivity",
  "mcnemar-exact-discordance-policy",
  "mcnemar-paired-effect-artifact",
  "trend-ordering-evidence",
  "trend-support-artifact",
  "trend-binary-outcome-orientation",
  "trend-risk-gradient",
  "trend-effect-bootstrap",
  "cochran-q-statistic",
  "cochran-q-effect-size",
  "cochran-q-effect-bootstrap",
  "cochran-q-within-subject-variation",
  "cochran-q-source-artifact",
  "cochran-q-posthoc-contrasts",
  "correlation-effect-size",
  "correlation-uncertainty",
  "correlation-source-artifact",
  "correlation-bootstrap-uncertainty",
  "correlation-influence-sensitivity",
  "estimate-effect-scale-consistency",
  "estimate-p-value-ci-null-consistency",
  "survival-event-count",
  "survival-censoring-context",
  "survival-curve-artifact",
  "survival-risk-table-artifact",
  "survival-rmst-artifact",
  "survival-rmst-horizon",
  "survival-events-per-predictor",
  "survival-group-event-support",
  "cox-predictor-event-support",
  "cox-hazard-ratio-figure",
  "cox-model-frame-artifact",
  "cox-risk-score-artifact",
  "cox-risk-score-figure",
  "cox-schoenfeld-diagnostic",
  "cox-discrimination-diagnostic",
  "competing-risk-accounting",
  "cif-group-contrast-artifact",
  "cif-horizon-summary-artifact",
  "cif-horizon-support",
  "cif-horizon-figure",
  "cif-fine-gray-boundary",
  "fine-gray-convergence",
  "fine-gray-risk-set-support",
  "fine-gray-artifacts",
  "fine-gray-approximation-boundary",
  "recurrent-event-rate-artifacts",
  "recurrent-event-person-time-support",
  "recurrent-event-subject-support",
  "recurrent-event-overdispersion",
  "recurrent-event-rate-contrast-artifact",
  "recurrent-event-model-boundary",
  "recurrent-event-group-stability",
  "cox-ph-diagnostic-artifact",
  "cox-proportional-hazards-diagnostic",
  "cox-tie-burden",
  "time-varying-cox-execution-mode",
  "time-varying-cox-interval-artifacts",
  "time-varying-cox-interval-validity",
  "time-varying-cox-subject-support",
  "time-varying-cox-approximation-boundary",
  "time-varying-cox-cluster-robust-variance",
  "recurrent-event-cox-execution-mode",
  "recurrent-event-cox-interval-artifacts",
  "recurrent-event-cox-interval-validity",
  "recurrent-event-cox-subject-support",
  "recurrent-event-cox-event-burden",
  "recurrent-event-cox-cluster-robust-variance",
  "recurrent-event-cox-robust-variance-boundary",
  "longitudinal-cluster-count",
  "longitudinal-observations-per-cluster",
  "longitudinal-cluster-summary-artifact",
  "longitudinal-model-frame-artifact",
  "longitudinal-fitted-values-artifact",
  "longitudinal-residual-summary",
  "longitudinal-observed-fitted-figure",
  "mixed-model-random-effect-variance",
  "gee-working-correlation",
  "glmm-random-effects-artifact",
  "glmm-cluster-calibration-artifact",
  "glmm-cluster-calibration",
  "glmm-optimization-status",
  "glmm-approximation-boundary",
  "repeated-measures-source-artifacts",
  "repeated-measures-duplicate-subject-level",
  "repeated-measures-sphericity-diagnostic",
  "repeated-measures-sphericity-artifact",
  "repeated-measures-epsilon-correction",
  "propensity-positivity-overlap",
  "propensity-effective-sample-size",
  "propensity-complete-case-retention",
  "propensity-treatment-orientation-evidence",
  "propensity-balance",
  "propensity-balance-artifact",
  "propensity-overlap-artifact",
  "propensity-unmatched-treated",
  "propensity-match-quality-artifact",
  "propensity-match-retention",
  "propensity-match-distance",
  "propensity-weight-summary-artifact",
  "propensity-weight-tail",
  "propensity-weight-effective-sample-size-fraction",
  "temporality",
  "no-post-treatment-adjustment",
  "unmeasured-confounding-sensitivity",
  "causal-design-boundary",
  "causal-treatment-orientation-evidence",
  "causal-post-orientation-evidence",
  "causal-outcome-orientation-evidence",
  "causal-balance-after-adjustment",
  "causal-positivity-support",
  "causal-effective-sample-size",
  "causal-weight-summary-artifact",
  "causal-weight-distribution-figure",
  "causal-weight-tail",
  "causal-effective-sample-size-fraction",
  "aipw-nuisance-artifacts",
  "aipw-influence-support",
  "aipw-standard-error",
  "aipw-contribution-figure",
  "entropy-balance-constraint-artifact",
  "entropy-balance-constraint-fit",
  "entropy-balance-constraint-figure",
  "entropy-balance-weight-diagnostics",
  "did-cell-support",
  "did-parallel-trends-review",
  "did-support-artifact",
  "did-contrast-artifact",
  "did-estimand-term",
  "did-contrast-figure",
  "event-study-coefficient-support",
  "event-study-period-support",
  "event-study-pretrend-review",
  "event-study-pretrend-artifact",
  "event-study-pretrend-screen",
  "event-study-pretrend-figure",
  "event-study-support-artifact",
  "its-segment-support",
  "its-time-point-support",
  "its-trend-artifact",
  "its-fitted-trend-artifact",
  "its-autocorrelation-artifact",
  "its-autocorrelation-screen",
  "rdd-cutoff-support",
  "rdd-running-support-artifact",
  "rdd-fitted-values-artifact",
  "rdd-bandwidth-sensitivity-artifact",
  "rdd-bandwidth-sensitivity-support",
  "rdd-cutoff-density-screen",
  "rdd-cutoff-density-artifact",
  "rdd-covariate-continuity-artifact",
  "rdd-covariate-continuity-screen",
  "iv-first-stage-strength",
  "iv-exclusion-review",
  "iv-first-stage-artifact",
  "iv-first-stage-prediction-diagnostic",
  "iv-first-stage-figures",
  "iv-reduced-form-artifact",
  "iv-reduced-form-evidence",
  "iv-reduced-form-figure",
  "iv-endogeneity-diagnostic-artifact",
  "iv-analysis-frame-artifact",
  "iv-covariate-balance-artifact",
  "iv-instrument-covariate-balance",
  "iv-covariate-balance-figure",
  "target-trial-required-items",
  "target-trial-protocol-artifact",
  "target-trial-treatment-support",
  "target-trial-time-zero",
  "target-trial-adjustment-set",
  "target-trial-emulation-gaps",
  "unmeasured-confounding-effect-bound",
  "unmeasured-confounding-ci-bound",
  "unmeasured-confounding-source-artifact",
  "missingness-complete-case-retention",
  "missingness-variable-burden",
  "missingness-mechanism-screen",
  "imputation-dataset-count",
  "imputation-variability-recorded",
  "imputation-distribution-shift",
  "missingness-ipw-artifact",
  "missingness-ipw-model-support",
  "missingness-ipw-stability",
  "missingness-ipw-effective-sample-size",
  "missingness-ipw-weight-figure",
  "missingness-sensitivity-scenarios",
  "missingness-sensitivity-artifact",
  "missingness-sensitivity-quantified",
  "missingness-sensitivity-shift",
  "agreement-kappa-interval",
  "agreement-contingency-table",
  "scale-reliability-sample-size",
  "scale-reliability-item-count",
  "scale-reliability-uncertainty-interval",
  "scale-reliability-bootstrap-support",
  "pca-variance-captured",
  "pca-artifacts",
  "pca-feature-scaling-artifact",
  "clustering-cluster-size",
  "clustering-validation-metrics",
  "clustering-profile-artifact",
  "agreement-limits-of-agreement",
  "agreement-proportional-bias",
  "multiple-comparison-methods",
  "multiple-comparison-artifact",
  "power-sample-size-finite",
  "power-observed-sample-size-support",
  "power-binary-event-support",
  "power-continuous-precision-support",
  "multinomial-class-support",
  "diagnostic-reference-orientation-evidence",
  "diagnostic-index-orientation-evidence",
  "diagnostic-precision-caveat",
  "diagnostic-sparse-cell-policy",
  "model-parameter-burden",
  "model-collinearity",
  "model-design-matrix-rank",
  "model-diagnostics-artifact",
  "regression-model-source-artifacts",
  "model-influence",
  "model-heteroskedasticity",
  "model-residual-distribution",
  "model-residual-pattern",
  "model-qq-artifact",
  "linear-robust-se-sensitivity",
  "model-separation-screen",
  "model-fitted-probability-boundary",
  "model-binary-class-balance",
  "model-binary-outcome-orientation-evidence",
  "ordinal-parameter-roles",
  "ordinal-proportional-odds-artifact",
  "ordinal-proportional-odds-screen",
  "multinomial-class-diagnostic-artifacts",
  "multinomial-prediction-coverage",
  "robust-linear-weight-artifact",
  "robust-linear-downweighting",
  "robust-linear-residual-scale",
  "quantile-fit-artifact",
  "quantile-residual-balance",
  "quantile-pinball-loss",
  "model-count-overdispersion",
  "model-count-offset-validity",
  "model-count-fit-artifacts",
  "model-count-fitted-mean-calibration",
  "model-count-zero-calibration",
  "model-count-zero-inflation",
  "zero-inflated-component-semantics",
  "positive-glm-mean-ratio-semantics",
  "positive-glm-distribution-support",
  "positive-glm-fit-artifact",
  "positive-glm-fitted-mean-calibration",
  "positive-glm-relative-error",
  "penalized-inference-boundary",
  "penalized-feature-scaling-artifact",
  "penalized-coefficient-profile",
  "penalized-validation-artifact",
  "prediction-validation-design",
  "prediction-validation-split-artifact",
  "prediction-validation-subject-leakage",
  "prediction-outcome-orientation-evidence",
  "prediction-class-balance",
  "prediction-discrimination",
  "prediction-threshold-operating-point",
  "prediction-calibration",
  "prediction-calibration-model",
  "prediction-score-probability-boundary",
  "prediction-decision-curve",
  "prediction-bootstrap-uncertainty",
  "prediction-artifact-completeness",
  "prediction-slice-performance",
]);

export function classifyStatsQaWarningChecks(warningChecks: string[]): StatsQaWarningClassification {
  const unique = uniqueStrings(warningChecks);
  return {
    critical: unique.filter(check => CRITICAL_STATS_QA_WARNING_CHECKS.has(check)),
    advisory: unique.filter(check => !CRITICAL_STATS_QA_WARNING_CHECKS.has(check)),
  };
}

export function criticalStatsQaWarningChecks(warningChecks: string[]): string[] {
  return classifyStatsQaWarningChecks(warningChecks).critical;
}

const MODEL_DIAGNOSTICS_COMPANION_RESOLVED_WARNING_CHECKS = new Set([
  "model-parameter-burden",
  "model-collinearity",
  "model-design-matrix-rank",
  "model-diagnostics-artifact",
  "regression-model-source-artifacts",
  "model-influence",
  "model-heteroskedasticity",
  "model-residual-distribution",
  "model-residual-pattern",
  "model-qq-artifact",
]);

function criticalQaWarningChecks(qaReadiness: QaReadiness): string[] {
  if (qaReadiness.status !== "warning") return [];
  return qaReadiness.criticalWarningChecks.length
    ? qaReadiness.criticalWarningChecks
    : criticalStatsQaWarningChecks(qaReadiness.warningChecks);
}

function effectiveCriticalQaWarningChecks(qaReadiness: QaReadiness, companionReadiness: CompanionReadiness): string[] {
  const critical = criticalQaWarningChecks(qaReadiness);
  if (!critical.length) return [];
  if (!companionReadiness.satisfiedMethods.includes("model-diagnostics")) return critical;
  return critical.filter(check => !MODEL_DIAGNOSTICS_COMPANION_RESOLVED_WARNING_CHECKS.has(check));
}

function checkDetailsById(checks: Array<Record<string, unknown>>, status: "fail" | "warning"): Record<string, string[]> {
  const details: Record<string, string[]> = {};
  for (const check of checks) {
    if (check.status !== status) continue;
    const id = String(check.id ?? "").trim();
    if (!id) continue;
    const detail = typeof check.detail === "string" && check.detail.trim().length > 0
      ? check.detail.trim()
      : typeof check.summary === "string" && check.summary.trim().length > 0
        ? check.summary.trim()
        : "";
    if (!detail) continue;
    details[id] = uniqueStrings([...(details[id] ?? []), detail]);
  }
  return details;
}

function formatCriticalQaWarnings(warningChecks: string[], qaReadiness: QaReadiness): string {
  const formatted = warningChecks.slice(0, 6).map(check => {
    const detail = qaReadiness.warningDetails[check]?.[0];
    return detail ? `${check}: ${truncateForNextAction(detail)}` : check;
  });
  const remaining = warningChecks.length - formatted.length;
  return remaining > 0 ? `${formatted.join("; ")}; and ${remaining} more` : formatted.join("; ");
}

function truncateForNextAction(value: string, limit = 220): string {
  const compact = value.replace(/\s+/g, " ").trim();
  return compact.length > limit ? `${compact.slice(0, limit - 1)}...` : compact;
}

function runnerCapabilityForManifest(result: Record<string, unknown>): RunnerCapabilityReadiness {
  const capability = isRecord(result.runnerCapability) ? result.runnerCapability : {};
  const rawStatus = typeof capability.status === "string" ? capability.status : null;
  const status = rawStatus === "executable" || rawStatus === "bounded_approximation" || rawStatus === "backend_blocked"
    ? rawStatus
    : null;
  return {
    method: typeof capability.method === "string" ? capability.method : typeof result.method === "string" ? result.method : null,
    status,
    reason: typeof capability.reason === "string" ? capability.reason : null,
    requiredFollowUp: Array.isArray(capability.requiredFollowUp) ? capability.requiredFollowUp.map(String).filter(Boolean) : [],
    cannotSupport: Array.isArray(capability.cannotSupport) ? capability.cannotSupport.map(String).filter(Boolean) : [],
  };
}

async function methodDecisionReadinessForManifest(
  result: Record<string, unknown>,
  artifactList: Array<Record<string, unknown>>,
  runDir: string,
): Promise<MethodDecisionReadiness> {
  const diagnostics = isRecord(result.diagnostics) ? result.diagnostics as Record<string, unknown> : {};
  const preflight = isRecord(diagnostics.preflight) ? diagnostics.preflight as Record<string, unknown> : {};
  const evidenceRefs = artifactList
    .filter(artifact => artifact.kind === "method-decision-support" || artifact.kind === "method-decision-support-report")
    .map(artifact => String(artifact.path ?? ""))
    .filter(Boolean);
  const expectedRefs = [
    path.join(runDir, "method-decision-support.json"),
    path.join(runDir, "method-decision-support.md"),
  ];
  const embeddedDecision = isRecord(preflight.methodDecisionSupport) ? preflight.methodDecisionSupport as Record<string, unknown> : null;
  const standaloneDecision = embeddedDecision
    ? null
    : await readMethodDecisionSupport(path.join(runDir, "method-decision-support.json"), "methodDecisionSupport");
  const preflightDecision = embeddedDecision || standaloneDecision
    ? null
    : await readMethodDecisionSupport(path.join(runDir, "stats-preflight.json"), "statsPreflight.methodDecisionSupport");
  const decision = embeddedDecision ?? standaloneDecision ?? preflightDecision;
  if (!decision) {
    return {
      status: "missing",
      requestedMethod: typeof result.method === "string" ? result.method : null,
      requestedRole: null,
      verdict: null,
      primaryMethods: [],
      sensitivityMethods: [],
      fallbackMethods: [],
      nextAction: "Regenerate the stats run with method-decision support before promotion.",
      evidenceRefs: uniqueStrings([...evidenceRefs, ...expectedRefs]),
    };
  }
  const verdict = typeof decision.verdict === "string" ? decision.verdict : null;
  const requestedRole = typeof decision.requestedRole === "string" ? decision.requestedRole : null;
  const primaryMethods = methodNamesFromDecision(decision.primaryMethods);
  const sensitivityMethods = methodNamesFromDecision(decision.sensitivityMethods);
  const fallbackMethods = methodNamesFromDecision(decision.fallbackMethods);
  const status: MethodDecisionReadiness["status"] = verdict === "blocked"
    ? "blocked"
    : verdict === "preferred"
      ? "preferred"
      : "review_required";
  return {
    status,
    requestedMethod: typeof decision.requestedMethod === "string" ? decision.requestedMethod : typeof result.method === "string" ? result.method : null,
    requestedRole,
    verdict,
    primaryMethods,
    sensitivityMethods,
    fallbackMethods,
    nextAction: typeof decision.nextAction === "string" ? decision.nextAction : null,
    evidenceRefs: uniqueStrings([...evidenceRefs, ...expectedRefs]),
  };
}

async function readMethodDecisionSupport(filePath: string, selector: "methodDecisionSupport" | "statsPreflight.methodDecisionSupport"): Promise<Record<string, unknown> | null> {
  if (!existsSync(filePath)) return null;
  try {
    const raw = JSON.parse(await readFile(filePath, "utf-8")) as Record<string, unknown>;
    if (selector === "methodDecisionSupport") {
      if (isRecord(raw.methodDecisionSupport)) return raw.methodDecisionSupport as Record<string, unknown>;
      return isRecord(raw) && hasMethodDecisionShape(raw) ? raw : null;
    }
    const statsPreflight = isRecord(raw.statsPreflight) ? raw.statsPreflight as Record<string, unknown> : raw;
    return isRecord(statsPreflight.methodDecisionSupport) ? statsPreflight.methodDecisionSupport as Record<string, unknown> : null;
  } catch {
    return null;
  }
}

function hasMethodDecisionShape(value: Record<string, unknown>): boolean {
  return typeof value.verdict === "string"
    || typeof value.requestedMethod === "string"
    || typeof value.requestedRole === "string"
    || Array.isArray(value.primaryMethods)
    || Array.isArray(value.sensitivityMethods)
    || Array.isArray(value.fallbackMethods);
}

async function methodDecisionEvidenceConsistencyForManifest(
  runKind: AnalysisRunManifest["runKind"],
  result: Record<string, unknown>,
  runDir: string,
): Promise<MethodDecisionEvidenceConsistency> {
  if (runKind !== "stats") {
    return { status: "not_applicable", summary: null, sourceCount: 0, mismatchedSources: [], evidenceRefs: [] };
  }
  const sources = await methodDecisionEvidenceSourcesForManifest(result, runDir);
  if (sources.length < 2) {
    return {
      status: "pass",
      summary: sources.length === 1 ? `One method-decision source found: ${sources[0]?.label}.` : "No method-decision sources were available for consistency comparison.",
      sourceCount: sources.length,
      mismatchedSources: [],
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
      summary: `Method-decision evidence is consistent across ${sources.map(source => source.label).join(", ")}.`,
      sourceCount: sources.length,
      mismatchedSources: [],
      evidenceRefs: uniqueStrings(sources.flatMap(source => source.evidenceRefs)),
    };
  }
  return {
    status: "warning",
    summary: `Method-decision evidence is contradictory across artifacts: ${sources.map(source => `${source.label} method=${source.requestedMethod ?? "missing"} role=${source.requestedRole ?? "missing"} verdict=${source.verdict ?? "missing"} primary=${source.primaryMethods.join("/") || "missing"}`).join("; ")}.`,
    sourceCount: sources.length,
    mismatchedSources: sources.map(source => source.label),
    evidenceRefs: uniqueStrings(sources.flatMap(source => source.evidenceRefs)),
  };
}

async function methodDecisionEvidenceSourcesForManifest(
  result: Record<string, unknown>,
  runDir: string,
): Promise<Array<{
  label: string;
  requestedMethod: string | null;
  requestedRole: string | null;
  verdict: string | null;
  primaryMethods: string[];
  signature: string;
  evidenceRefs: string[];
}>> {
  const sources: Array<{
    label: string;
    requestedMethod: string | null;
    requestedRole: string | null;
    verdict: string | null;
    primaryMethods: string[];
    signature: string;
    evidenceRefs: string[];
  }> = [];
  const push = (label: string, value: Record<string, unknown> | null, evidenceRefs: string[]) => {
    if (!value || !hasMethodDecisionShape(value)) return;
    const requestedMethod = typeof value.requestedMethod === "string" ? value.requestedMethod : typeof result.method === "string" ? result.method : null;
    const requestedRole = typeof value.requestedRole === "string" ? value.requestedRole : null;
    const verdict = typeof value.verdict === "string" ? value.verdict : null;
    const primaryMethods = methodNamesFromDecision(value.primaryMethods);
    const sensitivityMethods = methodNamesFromDecision(value.sensitivityMethods);
    const fallbackMethods = methodNamesFromDecision(value.fallbackMethods);
    sources.push({
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
      evidenceRefs: uniqueStrings(evidenceRefs),
    });
  };
  const diagnostics = isRecord(result.diagnostics) ? result.diagnostics as Record<string, unknown> : {};
  const preflight = isRecord(diagnostics.preflight) ? diagnostics.preflight as Record<string, unknown> : {};
  push("stats-run", isRecord(preflight.methodDecisionSupport) ? preflight.methodDecisionSupport as Record<string, unknown> : null, [path.join(runDir, "stats-run.json")]);
  push("method-decision-support", await readMethodDecisionSupport(path.join(runDir, "method-decision-support.json"), "methodDecisionSupport"), [
    path.join(runDir, "method-decision-support.json"),
    path.join(runDir, "method-decision-support.md"),
  ].filter(existsSync));
  push("stats-preflight", await readMethodDecisionSupport(path.join(runDir, "stats-preflight.json"), "statsPreflight.methodDecisionSupport"), [
    path.join(runDir, "stats-preflight.json"),
    path.join(runDir, "stats-preflight.md"),
  ].filter(existsSync));
  return sources;
}

function methodNamesFromDecision(value: unknown): string[] {
  return Array.isArray(value)
    ? value.map(item => {
      if (typeof item === "string") return item;
      return isRecord(item) ? String(item.method ?? "") : "";
    }).filter(Boolean)
    : [];
}

async function fileHash(filePath: string): Promise<string> {
  return createHash("sha256").update(await readFile(filePath)).digest("hex");
}

function hash(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values.filter(value => value.trim().length > 0))];
}

function stringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return uniqueStrings(value.map(item => {
    if (typeof item === "string") return item;
    if (isRecord(item)) {
      for (const key of ["message", "summary", "detail", "rationale", "code"]) {
        const candidate = item[key];
        if (typeof candidate === "string" && candidate.trim().length > 0) return candidate;
      }
    }
    return "";
  }));
}

function numberOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

async function readJsonObject(filePath: string): Promise<Record<string, unknown>> {
  const parsed = JSON.parse(await readFile(filePath, "utf-8")) as unknown;
  return isRecord(parsed) ? parsed : {};
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}
