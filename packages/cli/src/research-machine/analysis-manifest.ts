import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

interface ManifestArtifact {
  kind: string;
  path: string;
  required: boolean;
  exists: boolean;
  sha256: string | null;
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
  artifactCompleteness: {
    status: "pass" | "fail";
    missingRequired: string[];
  };
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
  const readiness = deriveReadiness(runKind, runStatus, postureStatus, missingRequired.length === 0);
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
    artifactCompleteness: {
      status: missingRequired.length === 0 ? "pass" : "fail",
      missingRequired,
    },
    artifacts,
    issueCodes: Array.isArray(result.issues)
      ? result.issues.filter(isRecord).map(issue => String(issue.code ?? "")).filter(Boolean)
      : [],
    nextAction: nextActionFor(readiness, postureStatus),
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
    const base = new Set(["stats-run", "summary", "table", "diagnostics", "report", "qa"]);
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
      { kind: "summary", path: path.join(runDir, "stats-summary.json") },
      { kind: "table", path: path.join(runDir, "estimates.csv") },
      { kind: "diagnostics", path: path.join(runDir, "diagnostics.json") },
      { kind: "report", path: path.join(runDir, "stats-report.md") },
      { kind: "qa", path: path.join(runDir, "stats-qa.json") },
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

function deriveReadiness(runKind: AnalysisRunManifest["runKind"], runStatus: string, posture: string | null, complete: boolean): AnalysisRunManifest["readiness"] {
  if (runStatus !== "succeeded" || !complete) return "blocked";
  if (runKind === "stats" && posture === "bound_standard_table") return "local_review_ready";
  if (runKind === "ml" && posture === "locally_validated_prediction") return "local_review_ready";
  if (runKind === "ml-comparison" && posture === "baseline_comparison_ready") return "local_review_ready";
  return "exploratory_only";
}

function nextActionFor(readiness: AnalysisRunManifest["readiness"], posture: string | null): string {
  if (readiness === "local_review_ready") return "Proceed to local methods review; do not promote beyond the declared posture without stronger validation artifacts.";
  if (posture === "blocked_survey_required") return "Run modeling-plan with --prior-run and reroute to a survey-aware paper runner.";
  if (posture === "optional_dependency_missing") return "Install the optional backend or compare available baseline models.";
  if (posture === "exploratory_standard_table" || posture === "exploratory_prediction") return "Bind method/spec evidence or add validation evidence before stronger claims.";
  return "Resolve missing artifacts, failed execution, or design-review blockers before local review.";
}

async function fileHash(filePath: string): Promise<string> {
  return createHash("sha256").update(await readFile(filePath)).digest("hex");
}

function hash(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}
