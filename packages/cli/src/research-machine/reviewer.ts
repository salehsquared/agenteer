import { createHash } from "node:crypto";
import { access, mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";

export const reviewStageSchema = z.enum(["protocol", "analysis_spec", "feasibility", "method", "execution", "manuscript", "final"]);
export type ReviewStage = z.infer<typeof reviewStageSchema>;

export const reviewAutonomySchema = z.enum(["conservative", "balanced", "aggressive"]);
export type ReviewAutonomy = z.infer<typeof reviewAutonomySchema>;

export const reviewerProviderSchema = z.enum(["openai", "anthropic", "google", "deepseek", "xai", "mock"]);
export type ReviewerProviderId = z.infer<typeof reviewerProviderSchema>;

export const reviewerCategorySchema = z.enum([
  "study_design",
  "cohort",
  "variables",
  "method_choice",
  "model_diagnostics",
  "missingness",
  "causal_claims",
  "data_plausibility",
  "literature",
  "reporting",
  "figures",
  "reproducibility",
  "cost_privacy",
]);
export type ReviewerCategory = z.infer<typeof reviewerCategorySchema>;

export const reentryPointSchema = z.enum([
  "exploration",
  "protocol",
  "analysis_spec",
  "dataset_feasibility",
  "method_selection",
  "execution",
  "qa",
  "manuscript",
  "literature",
  "human_review",
  "promotion",
]);
export type ReviewReentryPoint = z.infer<typeof reentryPointSchema>;

export const reviewerFindingSchema = z.object({
  id: z.string().min(1),
  severity: z.enum(["info", "minor", "major", "blocker"]),
  category: reviewerCategorySchema,
  title: z.string().min(1),
  evidenceRefs: z.array(z.string()).default([]),
  whyItMatters: z.string().min(1),
  actionableFix: z.string().min(1),
  reentryPoint: reentryPointSchema,
  deterministicVerification: z.string().nullable().default(null),
  confidence: z.number().min(0).max(1),
});
export type ReviewerFinding = z.infer<typeof reviewerFindingSchema>;

export const modelReviewPayloadSchema = z.object({
  verdict: z.enum(["pass", "revise", "block"]),
  summary: z.string().min(1),
  findings: z.array(reviewerFindingSchema).default([]),
  missingEvidence: z.array(z.string()).default([]),
  recommendedNextStage: reentryPointSchema,
});
export type ModelReviewPayload = z.infer<typeof modelReviewPayloadSchema>;

export interface ReviewerProviderConfig {
  id: ReviewerProviderId;
  label: string;
  defaultModel: string;
  envVar: string | null;
  baseUrl: string | null;
  available: boolean;
  notes: string[];
}

export interface ReviewerModelConfig {
  id: string;
  provider: ReviewerProviderId;
  model: string;
  role: string;
  enabled: boolean;
  maxInputChars: number;
  maxOutputTokens: number;
  timeoutMs: number;
}

export interface ReviewerBudget {
  maxPerCallUsd: number;
  maxPanelUsd: number;
  maxStudyLoopUsd: number;
}

export interface ReviewPacketArtifact {
  path: string;
  relativePath: string;
  kind: "json" | "markdown" | "text" | "csv" | "other";
  bytes: number;
  sha256: string;
  included: boolean;
  inclusionReason: string;
  contentPreview: string | null;
}

export interface ReviewPacket {
  schemaVersion: 1;
  generatedAtIso: string;
  stage: ReviewStage;
  runDir: string;
  packetHash: string;
  privacyPolicy: {
    rawRowsAllowed: boolean;
    phiAllowed: boolean;
    maxArtifactBytes: number;
    maxPromptChars: number;
  };
  artifactSummary: {
    totalFiles: number;
    includedFiles: number;
    totalBytes: number;
    includedBytes: number;
  };
  artifacts: ReviewPacketArtifact[];
  promptContext: string;
}

export interface ReviewRedactionReport {
  schemaVersion: 1;
  generatedAtIso: string;
  runDir: string;
  rawRowsAllowed: boolean;
  phiAllowed: boolean;
  skippedArtifacts: Array<{ relativePath: string; reason: string; bytes: number }>;
  includedArtifacts: Array<{ relativePath: string; bytes: number; sha256: string }>;
}

export interface ModelReviewResult {
  schemaVersion: 1;
  generatedAtIso: string;
  reviewId: string;
  reviewer: ReviewerModelConfig;
  stage: ReviewStage;
  status: "succeeded" | "failed" | "skipped";
  verdict: "pass" | "revise" | "block" | "unavailable";
  summary: string;
  findings: ReviewerFinding[];
  missingEvidence: string[];
  recommendedNextStage: ReviewReentryPoint;
  costEstimate: {
    inputTokens: number;
    outputTokens: number;
    estimatedUsd: number;
    maxPerCallUsd: number;
  };
  error: string | null;
  rawTextPath: string | null;
  outPath: string | null;
}

export interface ReviewPanelResult {
  schemaVersion: 1;
  generatedAtIso: string;
  panelId: string;
  stage: ReviewStage;
  runDir: string;
  autonomy: ReviewAutonomy;
  budget: ReviewerBudget;
  packetPath: string;
  redactionReportPath: string;
  reviewers: ModelReviewResult[];
  status: "pass" | "revise" | "block" | "partial" | "unavailable";
  costEstimateUsd: number;
  failureCount: number;
  nextAction: string;
  outPath: string | null;
}

export interface ReviewAdjudicationResult {
  schemaVersion: 1;
  generatedAtIso: string;
  panelPath: string;
  verdict: "pass" | "revise" | "block";
  consensus: "unanimous" | "majority" | "split" | "single_reviewer" | "unavailable";
  acceptedFindings: Array<ReviewerFinding & { reviewerIds: string[]; supportCount: number }>;
  rejectedFindings: Array<{ finding: ReviewerFinding; reason: string; reviewerIds: string[] }>;
  conflictNotes: string[];
  reentryPoint: ReviewReentryPoint;
  nextAction: string;
  outPath: string | null;
}

export interface ReviewResponseResult {
  schemaVersion: 1;
  generatedAtIso: string;
  adjudicationPath: string;
  autonomy: ReviewAutonomy;
  decisions: Array<{
    findingId: string;
    decision: "accepted" | "rejected" | "modified" | "needs_human_review";
    reason: string;
    repairAction: string;
    reentryPoint: ReviewReentryPoint;
  }>;
  stateReentry: {
    status: "ready_to_continue" | "needs_replan" | "needs_human_review" | "blocked";
    reentryPoint: ReviewReentryPoint;
    suggestedCommands: string[];
    rerunReviewAfterRepair: boolean;
  };
  outPath: string | null;
  stateReentryPath: string | null;
}

export interface StudyCriticResult {
  schemaVersion: 1;
  generatedAtIso: string;
  runDir: string;
  stage: ReviewStage;
  autonomy: ReviewAutonomy;
  generatedFiles: {
    reviewPacket: string;
    redactionReport: string;
    panel: string;
    adjudication: string;
    response: string;
    stateReentry: string;
  };
  panel: ReviewPanelResult;
  adjudication: ReviewAdjudicationResult;
  response: ReviewResponseResult;
}

export function reviewerProviderConfigs(env: NodeJS.ProcessEnv = process.env): ReviewerProviderConfig[] {
  return [
    {
      id: "openai",
      label: "OpenAI",
      defaultModel: "gpt-5.4",
      envVar: "OPENAI_API_KEY",
      baseUrl: "https://api.openai.com/v1",
      available: Boolean(env.OPENAI_API_KEY),
      notes: ["OpenAI-compatible chat completions path."],
    },
    {
      id: "anthropic",
      label: "Anthropic",
      defaultModel: "claude-opus-4-7",
      envVar: "ANTHROPIC_API_KEY",
      baseUrl: "https://api.anthropic.com/v1",
      available: Boolean(env.ANTHROPIC_API_KEY),
      notes: ["Default reviewer role is high-rigor clinical/methodological critique."],
    },
    {
      id: "google",
      label: "Google Gemini",
      defaultModel: "gemini-3.1-pro",
      envVar: "GOOGLE_API_KEY",
      baseUrl: "https://generativelanguage.googleapis.com/v1beta",
      available: Boolean(env.GOOGLE_API_KEY ?? env.GEMINI_API_KEY),
      notes: ["Gemini 3.1 Pro is the default latest Pro-tier reviewer model."],
    },
    {
      id: "deepseek",
      label: "DeepSeek",
      defaultModel: "deepseek-v4-pro",
      envVar: "DEEPSEEK_API_KEY",
      baseUrl: "https://api.deepseek.com/v1",
      available: Boolean(env.DEEPSEEK_API_KEY),
      notes: ["OpenAI-compatible low-cost reviewer path."],
    },
    {
      id: "xai",
      label: "xAI",
      defaultModel: "grok-4",
      envVar: "XAI_API_KEY",
      baseUrl: "https://api.x.ai/v1",
      available: Boolean(env.XAI_API_KEY),
      notes: ["xAI is a provider, not a universal router for other model families."],
    },
    {
      id: "mock",
      label: "Mock reviewer",
      defaultModel: "mock-reviewer",
      envVar: null,
      baseUrl: null,
      available: true,
      notes: ["Deterministic local reviewer for tests and offline dry runs."],
    },
  ];
}

export function defaultReviewerPanel(panel: "default" | "cheap" | "strict" | "all" = "default"): ReviewerModelConfig[] {
  const make = (provider: ReviewerProviderId, model: string, role: string): ReviewerModelConfig => ({
    id: `${provider}:${model}`,
    provider,
    model,
    role,
    enabled: true,
    maxInputChars: 36000,
    maxOutputTokens: 1800,
    timeoutMs: 90000,
  });
  if (panel === "cheap") {
    return [
      make("deepseek", "deepseek-v4-pro", "cheap broad methodological critic"),
      make("xai", "grok-4", "independent skeptical reviewer"),
    ];
  }
  if (panel === "strict") {
    return [
      make("anthropic", "claude-opus-4-7", "clinical methods reviewer"),
      make("openai", "gpt-5.4", "statistical reviewer"),
      make("google", "gemini-3.1-pro", "long-context reproducibility reviewer"),
    ];
  }
  if (panel === "all") {
    return [
      make("anthropic", "claude-opus-4-7", "clinical methods reviewer"),
      make("deepseek", "deepseek-v4-pro", "low-cost adversarial reviewer"),
      make("openai", "gpt-5.4", "statistical reviewer"),
      make("google", "gemini-3.1-pro", "long-context reproducibility reviewer"),
      make("xai", "grok-4", "independent skeptical reviewer"),
    ];
  }
  return [
    make("anthropic", "claude-opus-4-7", "clinical methods reviewer"),
    make("deepseek", "deepseek-v4-pro", "low-cost adversarial reviewer"),
  ];
}

export function defaultReviewerBudget(): ReviewerBudget {
  return { maxPerCallUsd: 0.5, maxPanelUsd: 2, maxStudyLoopUsd: 5 };
}

export async function researchReviewerProvidersCommand(env: NodeJS.ProcessEnv = process.env): Promise<{ schemaVersion: 1; providers: ReviewerProviderConfig[]; defaultPanel: ReviewerModelConfig[]; budget: ReviewerBudget }> {
  return {
    schemaVersion: 1,
    providers: reviewerProviderConfigs(env),
    defaultPanel: defaultReviewerPanel(),
    budget: defaultReviewerBudget(),
  };
}

export async function researchStudyCriticCommand(opts: {
  runDir: string;
  outDir?: string;
  stage?: ReviewStage;
  autonomy?: ReviewAutonomy;
  panel?: "default" | "cheap" | "strict" | "all";
  reviewers?: string[];
  budget?: Partial<ReviewerBudget>;
  includeRaw?: boolean;
  allowPhi?: boolean;
  maxPromptChars?: number;
  maxArtifactBytes?: number;
  mock?: boolean;
  env?: NodeJS.ProcessEnv;
  fetchImpl?: typeof fetch;
}): Promise<StudyCriticResult> {
  const runDir = path.resolve(opts.runDir);
  const outDir = path.resolve(opts.outDir ?? path.join(runDir, "review"));
  await mkdir(outDir, { recursive: true });
  const stage = reviewStageSchema.parse(opts.stage ?? "final");
  const autonomy = reviewAutonomySchema.parse(opts.autonomy ?? "aggressive");
  const budget = { ...defaultReviewerBudget(), ...definedBudget(opts.budget) };
  const reviewers = parseReviewerConfigs(opts.reviewers?.length ? opts.reviewers : [], opts.panel ?? "default", Boolean(opts.mock));
  const packet = await buildReviewPacket({
    runDir,
    stage,
    rawRowsAllowed: opts.includeRaw ?? true,
    phiAllowed: opts.allowPhi ?? true,
    maxPromptChars: opts.maxPromptChars ?? 70000,
    maxArtifactBytes: opts.maxArtifactBytes ?? 120000,
  });
  const redactionReport = buildRedactionReport(packet);
  const packetPath = path.join(outDir, "review-packet.json");
  const redactionReportPath = path.join(outDir, "review-redaction-report.json");
  await writeJson(packetPath, packet);
  await writeJson(redactionReportPath, redactionReport);
  const panel = await runReviewPanel({
    runDir,
    outDir,
    stage,
    autonomy,
    budget,
    packet,
    packetPath,
    redactionReportPath,
    reviewers,
    env: opts.env ?? process.env,
    fetchImpl: opts.fetchImpl ?? fetch,
  });
  const panelPath = path.join(outDir, "review-panel.json");
  panel.outPath = panelPath;
  await writeJson(panelPath, { schemaVersion: 1, reviewPanel: panel });
  const adjudication = await researchReviewAdjudicateCommand({ panelPath, outPath: path.join(outDir, "review-adjudication.json") });
  const response = await researchReviewResponseCommand({
    adjudicationPath: adjudication.outPath ?? path.join(outDir, "review-adjudication.json"),
    runDir,
    autonomy,
    outPath: path.join(outDir, "review-response.json"),
    stateReentryPath: path.join(outDir, "state-reentry.json"),
  });
  return {
    schemaVersion: 1,
    generatedAtIso: nowIso(),
    runDir,
    stage,
    autonomy,
    generatedFiles: {
      reviewPacket: packetPath,
      redactionReport: redactionReportPath,
      panel: panelPath,
      adjudication: adjudication.outPath ?? path.join(outDir, "review-adjudication.json"),
      response: response.outPath ?? path.join(outDir, "review-response.json"),
      stateReentry: response.stateReentryPath ?? path.join(outDir, "state-reentry.json"),
    },
    panel,
    adjudication,
    response,
  };
}

export async function researchReviewAdjudicateCommand(opts: { panelPath: string; outPath?: string }): Promise<ReviewAdjudicationResult> {
  const panel = unwrap<ReviewPanelResult>(JSON.parse(await readFile(path.resolve(opts.panelPath), "utf-8")), "reviewPanel");
  const successful = panel.reviewers.filter(review => review.status === "succeeded");
  const findingsByKey = new Map<string, { finding: ReviewerFinding; reviewerIds: string[] }>();
  for (const review of successful) {
    for (const finding of review.findings) {
      const key = `${finding.category}:${normalizeTitle(finding.title)}:${finding.reentryPoint}`;
      const existing = findingsByKey.get(key);
      if (existing) {
        existing.reviewerIds.push(review.reviewer.id);
        if (severityRank(finding.severity) > severityRank(existing.finding.severity)) existing.finding = finding;
      } else {
        findingsByKey.set(key, { finding, reviewerIds: [review.reviewer.id] });
      }
    }
  }
  const acceptedFindings: ReviewAdjudicationResult["acceptedFindings"] = [];
  const rejectedFindings: ReviewAdjudicationResult["rejectedFindings"] = [];
  for (const item of findingsByKey.values()) {
    const supportCount = item.reviewerIds.length;
    const severe = severityRank(item.finding.severity) >= severityRank("major");
    const highConfidence = item.finding.confidence >= 0.65;
    if (severe || supportCount > 1 || highConfidence) {
      acceptedFindings.push({ ...item.finding, reviewerIds: item.reviewerIds, supportCount });
    } else {
      rejectedFindings.push({ finding: item.finding, reviewerIds: item.reviewerIds, reason: "Low-severity single-reviewer finding kept as advisory but not accepted for automatic repair." });
    }
  }
  const successfulVerdicts = successful.map(review => review.verdict);
  const verdict = acceptedFindings.some(finding => finding.severity === "blocker") || successfulVerdicts.filter(v => v === "block").length >= Math.max(1, Math.ceil(successful.length / 2))
    ? "block"
    : acceptedFindings.length || successfulVerdicts.includes("revise")
      ? "revise"
      : "pass";
  const consensus = successful.length === 0
    ? "unavailable"
    : successful.length === 1
      ? "single_reviewer"
      : new Set(successfulVerdicts).size === 1
        ? "unanimous"
        : Math.max(...["pass", "revise", "block"].map(v => successfulVerdicts.filter(item => item === v).length)) > successful.length / 2
          ? "majority"
          : "split";
  const reentryPoint = chooseReentryPoint(acceptedFindings.map(finding => finding.reentryPoint));
  const result: ReviewAdjudicationResult = {
    schemaVersion: 1,
    generatedAtIso: nowIso(),
    panelPath: path.resolve(opts.panelPath),
    verdict,
    consensus,
    acceptedFindings: acceptedFindings.sort((a, b) => severityRank(b.severity) - severityRank(a.severity) || b.supportCount - a.supportCount),
    rejectedFindings,
    conflictNotes: buildConflictNotes(successful),
    reentryPoint,
    nextAction: verdict === "pass" ? "Proceed to the next pipeline gate." : `Route back to ${reentryPoint} with review-response decisions.`,
    outPath: opts.outPath ? path.resolve(opts.outPath) : null,
  };
  if (result.outPath) await writeJson(result.outPath, { schemaVersion: 1, reviewAdjudication: result });
  return result;
}

export async function researchReviewResponseCommand(opts: { adjudicationPath: string; runDir?: string; autonomy?: ReviewAutonomy; outPath?: string; stateReentryPath?: string }): Promise<ReviewResponseResult> {
  const adjudication = unwrap<ReviewAdjudicationResult>(JSON.parse(await readFile(path.resolve(opts.adjudicationPath), "utf-8")), "reviewAdjudication");
  const autonomy = reviewAutonomySchema.parse(opts.autonomy ?? "aggressive");
  const decisions = adjudication.acceptedFindings.map(finding => {
    const decision = responseDecision(finding, autonomy);
    return {
      findingId: finding.id,
      decision,
      reason: responseReason(finding, autonomy, decision),
      repairAction: finding.actionableFix,
      reentryPoint: finding.reentryPoint,
    };
  });
  const stateReentry = {
    status: adjudication.verdict === "pass"
      ? "ready_to_continue" as const
      : decisions.some(decision => decision.decision === "needs_human_review")
        ? "needs_human_review" as const
        : adjudication.verdict === "block"
          ? "blocked" as const
          : "needs_replan" as const,
    reentryPoint: adjudication.reentryPoint,
    suggestedCommands: suggestedReentryCommands(adjudication.reentryPoint, opts.runDir),
    rerunReviewAfterRepair: adjudication.verdict !== "pass",
  };
  const result: ReviewResponseResult = {
    schemaVersion: 1,
    generatedAtIso: nowIso(),
    adjudicationPath: path.resolve(opts.adjudicationPath),
    autonomy,
    decisions,
    stateReentry,
    outPath: opts.outPath ? path.resolve(opts.outPath) : null,
    stateReentryPath: opts.stateReentryPath ? path.resolve(opts.stateReentryPath) : null,
  };
  if (result.outPath) await writeJson(result.outPath, { schemaVersion: 1, reviewResponse: result });
  if (result.stateReentryPath) await writeJson(result.stateReentryPath, { schemaVersion: 1, stateReentry });
  return result;
}

async function runReviewPanel(opts: {
  runDir: string;
  outDir: string;
  stage: ReviewStage;
  autonomy: ReviewAutonomy;
  budget: ReviewerBudget;
  packet: ReviewPacket;
  packetPath: string;
  redactionReportPath: string;
  reviewers: ReviewerModelConfig[];
  env: NodeJS.ProcessEnv;
  fetchImpl: typeof fetch;
}): Promise<ReviewPanelResult> {
  const reviews: ModelReviewResult[] = [];
  let panelCost = 0;
  for (const reviewer of opts.reviewers) {
    const estimated = estimateReviewCost(reviewer, opts.packet.promptContext);
    if (estimated.estimatedUsd > opts.budget.maxPerCallUsd) {
      reviews.push(skippedReview(reviewer, opts.stage, estimated, `Estimated call cost $${estimated.estimatedUsd.toFixed(4)} exceeds per-call ceiling $${opts.budget.maxPerCallUsd.toFixed(2)}.`));
      continue;
    }
    if (panelCost + estimated.estimatedUsd > opts.budget.maxPanelUsd) {
      reviews.push(skippedReview(reviewer, opts.stage, estimated, `Estimated panel cost would exceed $${opts.budget.maxPanelUsd.toFixed(2)}.`));
      continue;
    }
    const result = await callReviewer(reviewer, opts.stage, opts.packet, opts.budget, opts.env, opts.fetchImpl, opts.outDir);
    panelCost += result.costEstimate.estimatedUsd;
    reviews.push(result);
  }
  const succeeded = reviews.filter(review => review.status === "succeeded");
  const status = succeeded.length === 0
    ? "unavailable"
    : succeeded.some(review => review.verdict === "block")
      ? "block"
      : succeeded.some(review => review.verdict === "revise")
        ? "revise"
        : reviews.some(review => review.status !== "succeeded")
          ? "partial"
          : "pass";
  return {
    schemaVersion: 1,
    generatedAtIso: nowIso(),
    panelId: `review_panel_${stableHash({ runDir: opts.runDir, stage: opts.stage, reviewers: opts.reviewers.map(r => r.id), at: nowIso() }).slice(0, 12)}`,
    stage: opts.stage,
    runDir: opts.runDir,
    autonomy: opts.autonomy,
    budget: opts.budget,
    packetPath: opts.packetPath,
    redactionReportPath: opts.redactionReportPath,
    reviewers: reviews,
    status,
    costEstimateUsd: round(panelCost, 6),
    failureCount: reviews.filter(review => review.status === "failed").length,
    nextAction: status === "pass" ? "Proceed to deterministic QA or next review gate." : status === "unavailable" ? "Run deterministic QA and configure at least one reviewer provider." : "Adjudicate findings and route accepted repairs back into the pipeline.",
    outPath: null,
  };
}

async function callReviewer(reviewer: ReviewerModelConfig, stage: ReviewStage, packet: ReviewPacket, budget: ReviewerBudget, env: NodeJS.ProcessEnv, fetchImpl: typeof fetch, outDir: string): Promise<ModelReviewResult> {
  const estimated = estimateReviewCost(reviewer, packet.promptContext);
  const reviewId = `review_${sanitizeId(reviewer.id)}_${Date.now()}`;
  const startedAt = nowIso();
  const rawTextPath = path.join(outDir, `${reviewId}.raw.txt`);
  try {
    const prompt = buildReviewerPrompt(stage, reviewer, packet);
    const raw = await providerGenerate(reviewer, prompt.system, prompt.user, env, fetchImpl);
    await writeFile(rawTextPath, raw);
    const parsed = parseReviewerResponse(raw, reviewer, stage);
    const outPath = path.join(outDir, `${reviewId}.json`);
    const result: ModelReviewResult = {
      schemaVersion: 1,
      generatedAtIso: startedAt,
      reviewId,
      reviewer,
      stage,
      status: "succeeded",
      verdict: parsed.verdict,
      summary: parsed.summary,
      findings: parsed.findings,
      missingEvidence: parsed.missingEvidence,
      recommendedNextStage: parsed.recommendedNextStage,
      costEstimate: estimated,
      error: null,
      rawTextPath,
      outPath,
    };
    await writeJson(outPath, { schemaVersion: 1, modelReview: result });
    return result;
  } catch (error) {
    return {
      schemaVersion: 1,
      generatedAtIso: startedAt,
      reviewId,
      reviewer,
      stage,
      status: "failed",
      verdict: "unavailable",
      summary: "Reviewer call failed; deterministic QA and other reviewers should continue.",
      findings: [],
      missingEvidence: [],
      recommendedNextStage: "human_review",
      costEstimate: estimated,
      error: error instanceof Error ? error.message : String(error),
      rawTextPath: null,
      outPath: null,
    };
  }
}

async function buildReviewPacket(opts: {
  runDir: string;
  stage: ReviewStage;
  rawRowsAllowed: boolean;
  phiAllowed: boolean;
  maxArtifactBytes: number;
  maxPromptChars: number;
}): Promise<ReviewPacket> {
  const files = await listFilesRecursive(opts.runDir);
  const artifacts: ReviewPacketArtifact[] = [];
  let prompt = [
    `Review stage: ${opts.stage}`,
    `Run directory: ${opts.runDir}`,
    `Raw row-level data allowed: ${opts.rawRowsAllowed}`,
    `PHI-sensitive content allowed by caller: ${opts.phiAllowed}`,
    "",
  ].join("\n");
  for (const file of files) {
    const kind = artifactKind(file.path);
    const include = shouldIncludeArtifact(file, kind, opts);
    let contentPreview: string | null = null;
    let reason = include ? "included in reviewer context" : skippedReason(file, kind, opts);
    if (include && prompt.length < opts.maxPromptChars) {
      const raw = await readFile(file.path, "utf-8").catch(() => "");
      const remaining = Math.max(0, opts.maxPromptChars - prompt.length - 400);
      const slice = raw.slice(0, Math.min(raw.length, remaining));
      contentPreview = slice;
      prompt += `\n\n--- ARTIFACT ${file.relativePath} (${kind}, ${file.bytes} bytes, sha256=${file.sha256}) ---\n${slice}`;
      if (slice.length < raw.length) reason = "included but truncated for prompt budget";
    } else if (include) {
      reason = "selected but excluded because prompt budget was exhausted";
    }
    artifacts.push({ ...file, kind, included: include && contentPreview !== null, inclusionReason: reason, contentPreview });
  }
  const included = artifacts.filter(artifact => artifact.included);
  const packetWithoutHash = {
    schemaVersion: 1 as const,
    generatedAtIso: nowIso(),
    stage: opts.stage,
    runDir: opts.runDir,
    packetHash: "",
    privacyPolicy: {
      rawRowsAllowed: opts.rawRowsAllowed,
      phiAllowed: opts.phiAllowed,
      maxArtifactBytes: opts.maxArtifactBytes,
      maxPromptChars: opts.maxPromptChars,
    },
    artifactSummary: {
      totalFiles: artifacts.length,
      includedFiles: included.length,
      totalBytes: artifacts.reduce((sum, artifact) => sum + artifact.bytes, 0),
      includedBytes: included.reduce((sum, artifact) => sum + artifact.bytes, 0),
    },
    artifacts,
    promptContext: prompt,
  };
  return { ...packetWithoutHash, packetHash: stableHash({ ...packetWithoutHash, packetHash: "" }) };
}

function buildRedactionReport(packet: ReviewPacket): ReviewRedactionReport {
  return {
    schemaVersion: 1,
    generatedAtIso: nowIso(),
    runDir: packet.runDir,
    rawRowsAllowed: packet.privacyPolicy.rawRowsAllowed,
    phiAllowed: packet.privacyPolicy.phiAllowed,
    skippedArtifacts: packet.artifacts.filter(artifact => !artifact.included).map(artifact => ({ relativePath: artifact.relativePath, reason: artifact.inclusionReason, bytes: artifact.bytes })),
    includedArtifacts: packet.artifacts.filter(artifact => artifact.included).map(artifact => ({ relativePath: artifact.relativePath, bytes: artifact.bytes, sha256: artifact.sha256 })),
  };
}

function buildReviewerPrompt(stage: ReviewStage, reviewer: ReviewerModelConfig, packet: ReviewPacket): { system: string; user: string } {
  return {
    system: [
      "You are an independent cold reviewer for a medical/public-health research pipeline.",
      "You have no access to prior chat history. Judge only the supplied artifacts.",
      "Be skeptical, specific, and actionable. Do not praise. Do not invent missing data.",
      "Return strict JSON only, with no markdown fences.",
    ].join(" "),
    user: [
      `Reviewer role: ${reviewer.role}`,
      `Review stage: ${stage}`,
      "Critique the study for methodological, statistical, reporting, reproducibility, data plausibility, literature, and claim-safety issues.",
      "If the artifact is not sufficient to judge a point, list the missing evidence instead of guessing.",
      "Schema:",
      JSON.stringify(z.toJSONSchema(modelReviewPayloadSchema), null, 2),
      "Allowed reentry points: exploration, protocol, analysis_spec, dataset_feasibility, method_selection, execution, qa, manuscript, literature, human_review, promotion.",
      "Artifact packet:",
      packet.promptContext.slice(0, reviewer.maxInputChars),
    ].join("\n\n"),
  };
}

async function providerGenerate(reviewer: ReviewerModelConfig, system: string, user: string, env: NodeJS.ProcessEnv, fetchImpl: typeof fetch): Promise<string> {
  if (reviewer.provider === "mock") return mockReview(user, reviewer);
  if (reviewer.provider === "anthropic") return anthropicGenerate(reviewer, system, user, env, fetchImpl);
  if (reviewer.provider === "google") return googleGenerate(reviewer, system, user, env, fetchImpl);
  return openAiCompatibleGenerate(reviewer, system, user, env, fetchImpl);
}

async function openAiCompatibleGenerate(reviewer: ReviewerModelConfig, system: string, user: string, env: NodeJS.ProcessEnv, fetchImpl: typeof fetch): Promise<string> {
  const provider = reviewerProviderConfigs(env).find(item => item.id === reviewer.provider);
  const key = provider?.envVar ? env[provider.envVar] : null;
  if (!key) throw new Error(`${reviewer.provider} reviewer missing ${provider?.envVar ?? "API key"}.`);
  const base = provider?.baseUrl ?? "https://api.openai.com/v1";
  const response = await fetchWithTimeout(fetchImpl, `${base}/chat/completions`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model: reviewer.model,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      max_tokens: reviewer.maxOutputTokens,
      temperature: 0.1,
      response_format: { type: "json_object" },
    }),
  }, reviewer.timeoutMs);
  if (!response.ok) throw new Error(`${reviewer.provider} reviewer ${response.status} ${response.statusText}: ${await response.text().catch(() => "")}`);
  const json = await response.json() as { choices?: Array<{ message?: { content?: string | null } }> };
  const text = json.choices?.[0]?.message?.content;
  if (!text) throw new Error(`${reviewer.provider} reviewer returned empty content.`);
  return text;
}

async function anthropicGenerate(reviewer: ReviewerModelConfig, system: string, user: string, env: NodeJS.ProcessEnv, fetchImpl: typeof fetch): Promise<string> {
  const key = env.ANTHROPIC_API_KEY;
  if (!key) throw new Error("anthropic reviewer missing ANTHROPIC_API_KEY.");
  const response = await fetchWithTimeout(fetchImpl, "https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": key,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: reviewer.model,
      max_tokens: reviewer.maxOutputTokens,
      temperature: 0.1,
      system,
      messages: [{ role: "user", content: user }],
    }),
  }, reviewer.timeoutMs);
  if (!response.ok) throw new Error(`anthropic reviewer ${response.status} ${response.statusText}: ${await response.text().catch(() => "")}`);
  const json = await response.json() as { content?: Array<{ type: string; text?: string }> };
  const text = json.content?.find(item => item.type === "text")?.text;
  if (!text) throw new Error("anthropic reviewer returned empty content.");
  return text;
}

async function googleGenerate(reviewer: ReviewerModelConfig, system: string, user: string, env: NodeJS.ProcessEnv, fetchImpl: typeof fetch): Promise<string> {
  const key = env.GOOGLE_API_KEY ?? env.GEMINI_API_KEY;
  if (!key) throw new Error("google reviewer missing GOOGLE_API_KEY or GEMINI_API_KEY.");
  const model = reviewer.model.startsWith("models/") ? reviewer.model : `models/${reviewer.model}`;
  const response = await fetchWithTimeout(fetchImpl, `https://generativelanguage.googleapis.com/v1beta/${model}:generateContent?key=${encodeURIComponent(key)}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: system }] },
      contents: [{ role: "user", parts: [{ text: user }] }],
      generationConfig: {
        temperature: 0.1,
        maxOutputTokens: reviewer.maxOutputTokens,
        responseMimeType: "application/json",
      },
    }),
  }, reviewer.timeoutMs);
  if (!response.ok) throw new Error(`google reviewer ${response.status} ${response.statusText}: ${await response.text().catch(() => "")}`);
  const json = await response.json() as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };
  const text = json.candidates?.[0]?.content?.parts?.map(part => part.text ?? "").join("").trim();
  if (!text) throw new Error("google reviewer returned empty content.");
  return text;
}

async function fetchWithTimeout(fetchImpl: typeof fetch, url: string, init: RequestInit, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetchImpl(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

function parseReviewerResponse(raw: string, reviewer: ReviewerModelConfig, stage: ReviewStage): ModelReviewPayload {
  const stripped = raw.replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();
  const parsed = JSON.parse(stripped) as unknown;
  const result = modelReviewPayloadSchema.safeParse(parsed);
  if (!result.success) throw new Error(`reviewer output failed schema: ${result.error.message}`);
  return {
    ...result.data,
    findings: result.data.findings.map((finding, index) => ({ ...finding, id: finding.id || `${sanitizeId(reviewer.id)}_${stage}_${index + 1}` })),
  };
}

function mockReview(user: string, reviewer: ReviewerModelConfig): string {
  const artifactText = user.split("Artifact packet:").slice(1).join("Artifact packet:") || user;
  const findings: ReviewerFinding[] = [];
  if (/causal|causes?|effect of|impact of/i.test(artifactText) && !/target trial|cannot infer caus|sensitivity/i.test(artifactText)) {
    findings.push({
      id: `${sanitizeId(reviewer.id)}_causal_claim`,
      severity: "blocker",
      category: "causal_claims",
      title: "Causal language is not supported by the supplied design evidence",
      evidenceRefs: ["review-packet"],
      whyItMatters: "Associational or local-review artifacts cannot support causal conclusions without an identification strategy.",
      actionableFix: "Downgrade causal language or route to protocol/target-trial review with confounding and sensitivity analysis.",
      reentryPoint: "protocol",
      deterministicVerification: "Run claim-guard and method-qa after manuscript repair.",
      confidence: 0.84,
    });
  }
  if (/missing|missingness|complete-case/i.test(artifactText)) {
    findings.push({
      id: `${sanitizeId(reviewer.id)}_missingness`,
      severity: "major",
      category: "missingness",
      title: "Missingness requires explicit sensitivity review",
      evidenceRefs: ["method-qa", "diagnostics"],
      whyItMatters: "Complete-case estimates can be biased when missingness depends on exposure, outcome, or covariates.",
      actionableFix: "Add missingness summary, complete-case sensitivity, and imputation/IPW plan where appropriate.",
      reentryPoint: "qa",
      deterministicVerification: "Run missingness-summary and method-qa.",
      confidence: 0.78,
    });
  }
  const payload: ModelReviewPayload = {
    verdict: findings.some(f => f.severity === "blocker") ? "block" : findings.length ? "revise" : "pass",
    summary: findings.length ? "Mock reviewer found actionable methodological concerns." : "Mock reviewer found no blocking concerns in supplied artifacts.",
    findings,
    missingEvidence: [],
    recommendedNextStage: findings[0]?.reentryPoint ?? "promotion",
  };
  return JSON.stringify(payload);
}

function parseReviewerConfigs(values: string[], panel: "default" | "cheap" | "strict" | "all", mock: boolean): ReviewerModelConfig[] {
  if (mock) return [{ id: "mock:reviewer", provider: "mock", model: "mock-reviewer", role: "deterministic test reviewer", enabled: true, maxInputChars: 36000, maxOutputTokens: 1200, timeoutMs: 1000 }];
  if (!values.length) return defaultReviewerPanel(panel);
  return values.map(value => {
    const [providerText, ...modelParts] = value.split(":");
    const provider = reviewerProviderSchema.parse(providerText);
    const model = modelParts.join(":") || reviewerProviderConfigs().find(item => item.id === provider)?.defaultModel || value;
    return { id: `${provider}:${model}`, provider, model, role: "configured reviewer", enabled: true, maxInputChars: 36000, maxOutputTokens: 1800, timeoutMs: 90000 };
  });
}

function estimateReviewCost(reviewer: ReviewerModelConfig, context: string): ModelReviewResult["costEstimate"] {
  const inputTokens = Math.ceil(Math.min(context.length, reviewer.maxInputChars) / 4);
  const outputTokens = reviewer.maxOutputTokens;
  const rates = ratePerMillion(reviewer.provider);
  return {
    inputTokens,
    outputTokens,
    estimatedUsd: round(inputTokens / 1_000_000 * rates.input + outputTokens / 1_000_000 * rates.output, 6),
    maxPerCallUsd: defaultReviewerBudget().maxPerCallUsd,
  };
}

function ratePerMillion(provider: ReviewerProviderId): { input: number; output: number } {
  if (provider === "anthropic") return { input: 15, output: 75 };
  if (provider === "google") return { input: 2, output: 12 };
  if (provider === "openai") return { input: 5, output: 20 };
  if (provider === "deepseek") return { input: 1, output: 3 };
  if (provider === "xai") return { input: 3, output: 15 };
  return { input: 0, output: 0 };
}

function definedBudget(value: Partial<ReviewerBudget> | undefined): Partial<ReviewerBudget> {
  if (!value) return {};
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined)) as Partial<ReviewerBudget>;
}

function skippedReview(reviewer: ReviewerModelConfig, stage: ReviewStage, costEstimate: ModelReviewResult["costEstimate"], reason: string): ModelReviewResult {
  return {
    schemaVersion: 1,
    generatedAtIso: nowIso(),
    reviewId: `review_${sanitizeId(reviewer.id)}_${Date.now()}`,
    reviewer,
    stage,
    status: "skipped",
    verdict: "unavailable",
    summary: reason,
    findings: [],
    missingEvidence: [],
    recommendedNextStage: "human_review",
    costEstimate,
    error: reason,
    rawTextPath: null,
    outPath: null,
  };
}

async function listFilesRecursive(root: string): Promise<Array<{ path: string; relativePath: string; bytes: number; sha256: string }>> {
  const out: Array<{ path: string; relativePath: string; bytes: number; sha256: string }> = [];
  async function walk(dir: string): Promise<void> {
    const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (!["node_modules", ".git", "dist", "review"].includes(entry.name)) await walk(full);
      } else if (entry.isFile()) {
        const info = await stat(full);
        out.push({ path: full, relativePath: path.relative(root, full), bytes: info.size, sha256: await hashFile(full) });
      }
    }
  }
  await walk(root);
  return out.sort((a, b) => artifactPriority(a.relativePath) - artifactPriority(b.relativePath) || a.relativePath.localeCompare(b.relativePath));
}

function shouldIncludeArtifact(file: { relativePath: string; bytes: number }, kind: ReviewPacketArtifact["kind"], opts: { rawRowsAllowed: boolean; maxArtifactBytes: number }): boolean {
  if (file.bytes > opts.maxArtifactBytes) return false;
  if (kind === "other") return false;
  if (!opts.rawRowsAllowed && /\.(csv|tsv|parquet|arrow|jsonl)$/i.test(file.relativePath)) return false;
  return artifactPriority(file.relativePath) < 90 || /\.(md|json|csv|txt)$/i.test(file.relativePath);
}

function skippedReason(file: { relativePath: string; bytes: number }, kind: ReviewPacketArtifact["kind"], opts: { rawRowsAllowed: boolean; maxArtifactBytes: number }): string {
  if (file.bytes > opts.maxArtifactBytes) return `larger than maxArtifactBytes ${opts.maxArtifactBytes}`;
  if (kind === "other") return "binary or unsupported artifact type";
  if (!opts.rawRowsAllowed && /\.(csv|tsv|parquet|arrow|jsonl)$/i.test(file.relativePath)) return "row-level artifact excluded by privacy policy";
  return "not selected for stage packet";
}

function artifactKind(file: string): ReviewPacketArtifact["kind"] {
  const ext = path.extname(file).toLowerCase();
  if (ext === ".json") return "json";
  if (ext === ".md") return "markdown";
  if (ext === ".csv" || ext === ".tsv") return "csv";
  if ([".txt", ".log", ".yaml", ".yml"].includes(ext)) return "text";
  return "other";
}

function artifactPriority(relativePath: string): number {
  const base = path.basename(relativePath);
  const order = [
    "manuscript.md",
    "paper.md",
    "analysis-spec-v2.json",
    "analysis-spec.json",
    "method-qa.json",
    "stats-run.json",
    "ml-run.json",
    "comparison.json",
    "analysis-results.json",
    "diagnostics.json",
    "stats-qa.json",
    "figure-qa.json",
    "figures.json",
    "paper-qa.json",
    "manuscript-qa.json",
    "literature-context.json",
    "literature-qa.json",
    "feasibility-trial.json",
    "run-inspection.json",
    "analysis-run-manifest.json",
    "cost-receipt.json",
  ];
  const idx = order.indexOf(base);
  return idx === -1 ? 100 : idx;
}

function chooseReentryPoint(points: ReviewReentryPoint[]): ReviewReentryPoint {
  if (!points.length) return "promotion";
  const order: ReviewReentryPoint[] = ["exploration", "protocol", "analysis_spec", "dataset_feasibility", "method_selection", "execution", "qa", "manuscript", "literature", "human_review", "promotion"];
  return points.slice().sort((a, b) => order.indexOf(a) - order.indexOf(b))[0] ?? "human_review";
}

function buildConflictNotes(reviews: ModelReviewResult[]): string[] {
  const verdicts = new Set(reviews.map(review => review.verdict));
  const notes: string[] = [];
  if (verdicts.size > 1) notes.push(`Reviewer verdicts differed: ${Array.from(verdicts).join(", ")}.`);
  const failed = reviews.filter(review => review.status !== "succeeded");
  if (failed.length) notes.push(`${failed.length} reviewer(s) were unavailable or failed; do not treat missing reviewers as agreement.`);
  return notes;
}

function responseDecision(finding: ReviewerFinding, autonomy: ReviewAutonomy): "accepted" | "rejected" | "modified" | "needs_human_review" {
  if (autonomy === "conservative") return finding.severity === "info" || finding.severity === "minor" ? "accepted" : "needs_human_review";
  if (autonomy === "balanced") {
    if (["reporting", "figures", "reproducibility", "literature"].includes(finding.category)) return "accepted";
    return finding.severity === "blocker" ? "needs_human_review" : "modified";
  }
  return finding.severity === "info" ? "modified" : "accepted";
}

function responseReason(finding: ReviewerFinding, autonomy: ReviewAutonomy, decision: string): string {
  if (decision === "needs_human_review") return `${autonomy} autonomy stops for ${finding.severity} ${finding.category} finding.`;
  if (decision === "modified") return "Finding is actionable but should be translated into a bounded deterministic repair before execution.";
  return "Finding is actionable under the selected autonomy policy.";
}

function suggestedReentryCommands(point: ReviewReentryPoint, runDir?: string): string[] {
  const dir = runDir ? path.resolve(runDir) : "<run-dir>";
  const map: Record<ReviewReentryPoint, string[]> = {
    exploration: ["agenteer research explore --data <rows.csv> --out-dir <explore-dir>"],
    protocol: ["agenteer research protocol-candidates --question <revised-question> --json", "agenteer research method-select --question <revised-question> --json"],
    analysis_spec: ["agenteer research spec-v2 --spec <analysis-spec.json> --json", "agenteer research execution-contract --spec <analysis-spec-v2.json> --json"],
    dataset_feasibility: ["agenteer research dataset-profile --dataset-dir <dataset-dir> --json", "agenteer research dataset-run --analysis-spec <spec> --dataset-dir <dataset-dir> --out-dir <run> --json"],
    method_selection: ["agenteer research method-select --question <question> --json", `agenteer research modeling-plan --question <question> --prior-run ${dir}/stats-run.json --json`],
    execution: [`agenteer research analysis-run --question <question> --method <method> --data <rows.csv> --out-dir ${dir} --json`],
    qa: [`agenteer research method-qa --run-dir ${dir} --out ${dir}/method-qa.json --report ${dir}/method-qa.md`],
    manuscript: [`agenteer research manuscript --run-dir ${dir}`],
    literature: [`agenteer research literature-search --question <question> --out ${dir}/literature-search.json --json`, `agenteer research literature-qa --literature ${dir}/literature-search.json --paper ${dir}/manuscript.md --json`],
    human_review: ["Stop for human methodological review."],
    promotion: [`agenteer research run-inspect --run-dir ${dir} --out ${dir}/run-inspection.json --report ${dir}/run-inspection.md`],
  };
  return map[point];
}

function severityRank(value: ReviewerFinding["severity"]): number {
  return { info: 0, minor: 1, major: 2, blocker: 3 }[value];
}

function normalizeTitle(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function sanitizeId(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]+/g, "_").slice(0, 80);
}

function stableHash(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(sortJson(value))).digest("hex");
}

function sortJson(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortJson);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, sortJson(item)]));
  return value;
}

async function hashFile(file: string): Promise<string> {
  const hash = createHash("sha256");
  hash.update(await readFile(file));
  return hash.digest("hex");
}

async function writeJson(file: string, value: unknown): Promise<void> {
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, `${JSON.stringify(value, null, 2)}\n`);
}

async function pathExists(file: string): Promise<boolean> {
  try {
    await access(file);
    return true;
  } catch {
    return false;
  }
}

function unwrap<T>(value: unknown, key: string): T {
  if (value && typeof value === "object" && key in value) return (value as Record<string, unknown>)[key] as T;
  return value as T;
}

function round(value: number, digits: number): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function nowIso(): string {
  return new Date().toISOString();
}

export function renderResearchReviewerProviders(result: Awaited<ReturnType<typeof researchReviewerProvidersCommand>>): string {
  return [
    "research reviewer providers",
    ...result.providers.map(provider => `  - ${provider.id}: ${provider.available ? "available" : "missing"} default=${provider.defaultModel}${provider.envVar ? ` env=${provider.envVar}` : ""}`),
    `default panel: ${result.defaultPanel.map(item => item.id).join(", ")}`,
    `budget: per-call $${result.budget.maxPerCallUsd}, panel $${result.budget.maxPanelUsd}, study-loop $${result.budget.maxStudyLoopUsd}`,
  ].join("\n");
}

export function renderResearchReviewerProvidersJson(result: Awaited<ReturnType<typeof researchReviewerProvidersCommand>>): string {
  return `${JSON.stringify(result, null, 2)}\n`;
}

export function renderResearchStudyCritic(result: StudyCriticResult): string {
  return [
    `research study critic: ${result.adjudication.verdict}`,
    `  stage: ${result.stage}`,
    `  autonomy: ${result.autonomy}`,
    `  reviewers: ${result.panel.reviewers.map(review => `${review.reviewer.id}:${review.status}/${review.verdict}`).join(", ")}`,
    `  accepted findings: ${result.adjudication.acceptedFindings.length}`,
    `  reentry: ${result.response.stateReentry.status} -> ${result.response.stateReentry.reentryPoint}`,
    `  review: ${result.generatedFiles.panel}`,
    `  next: ${result.response.stateReentry.suggestedCommands[0] ?? result.adjudication.nextAction}`,
  ].join("\n");
}

export function renderResearchStudyCriticJson(result: StudyCriticResult): string {
  return `${JSON.stringify({ schemaVersion: 1, studyCritic: result }, null, 2)}\n`;
}

export function renderResearchReviewAdjudication(result: ReviewAdjudicationResult): string {
  return [
    `research review adjudication: ${result.verdict}`,
    `  consensus: ${result.consensus}`,
    `  accepted findings: ${result.acceptedFindings.length}`,
    `  rejected findings: ${result.rejectedFindings.length}`,
    `  reentry: ${result.reentryPoint}`,
    `  next: ${result.nextAction}`,
  ].join("\n");
}

export function renderResearchReviewAdjudicationJson(result: ReviewAdjudicationResult): string {
  return `${JSON.stringify({ schemaVersion: 1, reviewAdjudication: result }, null, 2)}\n`;
}

export function renderResearchReviewResponse(result: ReviewResponseResult): string {
  return [
    `research review response: ${result.stateReentry.status}`,
    `  autonomy: ${result.autonomy}`,
    `  decisions: ${result.decisions.length}`,
    `  reentry: ${result.stateReentry.reentryPoint}`,
    `  next: ${result.stateReentry.suggestedCommands[0] ?? "(none)"}`,
  ].join("\n");
}

export function renderResearchReviewResponseJson(result: ReviewResponseResult): string {
  return `${JSON.stringify({ schemaVersion: 1, reviewResponse: result }, null, 2)}\n`;
}
