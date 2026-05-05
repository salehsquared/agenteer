import { createHash } from "node:crypto";
import { copyFile, mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { builtInResearchMethodsSpecialist } from "./builtins.js";
import {
  type BaselineResult,
  type CandidateCritique,
  type CandidateEvaluation,
  type CandidateLineage,
  type CandidatePromotion,
  type CandidateRepair,
  type CandidateVariant,
  type PromotionDecision,
  type SpecializationArtifact,
  type SpecializationFixture,
  type SpecializationIssue,
  type SpecializationManifest,
  type SpecializationReport,
  type SpecializationRun,
  candidateCritiqueSchema,
  candidateEvaluationSchema,
  candidateLineageSchema,
  candidatePromotionSchema,
  candidateRepairSchema,
  candidateVariantSchema,
  promotionDecisionSchema,
  specializationArtifactSchema,
  specializationManifestSchema,
  specializationReportSchema,
  specializationRunSchema,
} from "./schemas.js";

export interface SpecializationInitOptions {
  outDir: string;
  name?: string;
  domain?: string;
  purpose?: string;
  builtin?: "research-methods-specialist";
}

export interface SpecializationPlan {
  specializationId: string;
  purpose: string;
  domain: string;
  candidateGenerators: string[];
  evaluators: string[];
  critics: string[];
  fixtures: string[];
  promotionGates: string[];
  risks: string[];
  nextCommands: string[];
}

export interface SpecializationInspect {
  specializationId: string;
  rootDir: string;
  candidates: Array<{ id: string; status: CandidateVariant["status"]; parentCandidateId: string | null; artifactCount: number }>;
  evaluations: Array<{ id: string; candidateId: string; fixtureId: string; result: CandidateEvaluation["result"]; score: number }>;
  critiques: Array<{ id: string; candidateId: string; recommendation: CandidateCritique["recommendation"]; blockers: number }>;
  promotions: Array<{ id: string; candidateId: string; decision: PromotionDecision["decision"]; criteriaSatisfied: boolean }>;
  latestReport: SpecializationReport | null;
  nextRecommendedImprovements: string[];
}

const MANIFEST_FILE = "specialization.json";
const LATEST_REPORT_FILE = "latest.json";
const LATEST_REPORT_MD = "latest.md";

export async function specializationInitCommand(opts: SpecializationInitOptions): Promise<SpecializationManifest> {
  const rootDir = path.resolve(opts.outDir);
  const manifest = opts.builtin === "research-methods-specialist"
    ? builtInResearchMethodsSpecialist(rootDir)
    : genericSpecializationManifest(rootDir, opts);
  await ensureSpecializationDirs(manifest);
  await writeJson(manifestPath(rootDir), specializationManifestSchema.parse(manifest));
  return manifest;
}

export async function specializationPlanCommand(rootDir: string): Promise<SpecializationPlan> {
  const manifest = await readManifest(rootDir);
  const risks: string[] = [];
  if (manifest.fixtures.length === 0) risks.push("No fixtures are defined; evaluation cannot prove behavior.");
  if (manifest.candidateGenerators.length === 0) risks.push("No candidate generators are defined.");
  if (manifest.evaluators.length === 0) risks.push("No evaluators are defined.");
  if (manifest.critics.length === 0) risks.push("No critics are defined.");
  if (manifest.artifactSchemas.length === 0) risks.push("No artifact schemas are defined; promotion will be weak.");
  return {
    specializationId: manifest.id,
    purpose: manifest.purpose,
    domain: manifest.domain,
    candidateGenerators: manifest.candidateGenerators.map((g) => `${g.id}:${g.strategy}`),
    evaluators: manifest.evaluators.map((e) => `${e.id}:${e.type}`),
    critics: manifest.critics.map((c) => `${c.id}:${c.type}`),
    fixtures: manifest.fixtures.map((f) => f.id),
    promotionGates: [
      "candidate has required artifacts",
      "all candidate artifact schemas validate",
      "candidate has at least one evaluation",
      "candidate has critique",
      "baseline comparison exists",
      "cost/safety limits respected",
      `score >= ${manifest.promotionCriteria.minScore}`,
      `baseline delta >= ${manifest.promotionCriteria.minBaselineDelta}`,
      "lineage exists",
    ],
    risks,
    nextCommands: [
      `agenteer specialize generate --dir ${manifest.persistence.rootDir} --count 3`,
      `agenteer specialize evaluate --dir ${manifest.persistence.rootDir}`,
      `agenteer specialize critique --dir ${manifest.persistence.rootDir}`,
      `agenteer specialize promote --dir ${manifest.persistence.rootDir}`,
      `agenteer specialize inspect --dir ${manifest.persistence.rootDir}`,
    ],
  };
}

export async function specializationGenerateCommand(rootDir: string, count = 3): Promise<CandidateVariant[]> {
  if (!Number.isFinite(count) || count < 1) throw new Error("--count must be a positive integer");
  const manifest = await readManifest(rootDir);
  await ensureSpecializationDirs(manifest);
  const existing = await readCandidates(manifest);
  const generated: CandidateVariant[] = [];
  for (let i = 0; i < count; i++) {
    const generator = manifest.candidateGenerators[(existing.length + generated.length) % Math.max(1, manifest.candidateGenerators.length)] ?? {
      id: "default-generator",
      strategy: "baseline" as const,
      description: "Default deterministic baseline generator.",
    };
    const id = nextCandidateId(existing.length + generated.length + 1, generator.strategy);
    const candidate = await createCandidate(manifest, id, generator.id, generator.strategy, null);
    await writeCandidate(manifest, candidate);
    await writeLineage(manifest, {
      candidateId: candidate.id,
      parentCandidateId: null,
      rootCandidateId: candidate.id,
      generation: 0,
      events: [{ atIso: nowIso(), type: "generated", artifactPath: candidatePath(manifest, candidate.id), summary: `Generated via ${generator.id}.` }],
    });
    generated.push(candidate);
  }
  return generated;
}

export async function specializationEvaluateCommand(rootDir: string, candidateId?: string): Promise<CandidateEvaluation[]> {
  const manifest = await readManifest(rootDir);
  const candidates = await selectCandidates(manifest, candidateId, ["generated", "repaired", "evaluated"]);
  const evaluations: CandidateEvaluation[] = [];
  for (const candidate of candidates) {
    for (const fixture of manifest.fixtures) {
      const evaluation = await evaluateCandidateFixture(manifest, candidate, fixture);
      await writeEvaluation(manifest, evaluation);
      evaluations.push(evaluation);
    }
    candidate.status = "evaluated";
    candidate.artifactRefs = await refreshArtifacts(candidate.artifactRefs);
    await writeCandidate(manifest, candidate);
    await appendLineageEvent(manifest, candidate.id, "evaluated", `Evaluated against ${manifest.fixtures.length} fixture(s).`, evaluations.at(-1)?.id ?? null);
  }
  return evaluations;
}

export async function specializationCritiqueCommand(rootDir: string, candidateId?: string): Promise<CandidateCritique[]> {
  const manifest = await readManifest(rootDir);
  const candidates = await selectCandidates(manifest, candidateId, ["generated", "evaluated", "repaired"]);
  const critiques: CandidateCritique[] = [];
  for (const candidate of candidates) {
    const evaluations = await readEvaluationsForCandidate(manifest, candidate.id);
    const critique = await critiqueCandidate(manifest, candidate, evaluations);
    await writeCritique(manifest, critique);
    critiques.push(critique);
    await appendLineageEvent(manifest, candidate.id, "critiqued", `Critique recommendation: ${critique.recommendation}.`, critique.id);
  }
  return critiques;
}

export async function specializationPromoteCommand(rootDir: string, candidateId?: string): Promise<PromotionDecision[]> {
  const manifest = await readManifest(rootDir);
  const candidates = await selectCandidates(manifest, candidateId, ["generated", "evaluated", "repaired", "rejected"]);
  const decisions: PromotionDecision[] = [];
  for (const candidate of candidates) {
    const decision = await decidePromotion(manifest, candidate);
    await writePromotionDecision(manifest, decision);
    decisions.push(decision);
    if (decision.decision === "promoted") {
      const promotion: CandidatePromotion = candidatePromotionSchema.parse({
        schemaVersion: 1,
        id: `promotion-${candidate.id}`,
        decision,
        promotedAtIso: nowIso(),
        reusableArtifacts: decision.artifactsPromoted,
      });
      await mkdir(path.join(promotionsDir(manifest), candidate.id), { recursive: true });
      for (const artifact of decision.artifactsPromoted) {
        await copyPromotedArtifact(manifest, candidate.id, artifact);
      }
      await writeJson(promotionPath(manifest, promotion.id), promotion);
      candidate.status = "promoted";
      await appendLineageEvent(manifest, candidate.id, "promoted", decision.reason, decision.id);
    } else if (decision.decision === "rejected") {
      candidate.status = "rejected";
      await appendLineageEvent(manifest, candidate.id, "rejected", decision.reason, decision.id);
    }
    await writeCandidate(manifest, candidate);
  }
  return decisions;
}

export async function specializationRunLoopCommand(rootDir: string, opts: { count?: number; maxRepairAttempts?: number } = {}): Promise<SpecializationReport> {
  const manifest = await readManifest(rootDir);
  await ensureSpecializationDirs(manifest);
  const run: SpecializationRun = specializationRunSchema.parse({
    schemaVersion: 1,
    id: `run-${Date.now()}`,
    specializationId: manifest.id,
    startedAtIso: nowIso(),
    endedAtIso: null,
    status: "running",
    selectedTaskOrStressCase: manifest.fixtures[0]?.id ?? null,
    candidateIds: [],
    evaluationIds: [],
    critiqueIds: [],
    repairIds: [],
    promotionDecisionIds: [],
    reportId: null,
    cycleCounted: false,
  });
  const generated = await specializationGenerateCommand(rootDir, opts.count ?? 3);
  run.candidateIds.push(...generated.map((c) => c.id));
  const evaluations = await specializationEvaluateCommand(rootDir);
  run.evaluationIds.push(...evaluations.map((e) => e.id));
  const critiques = await specializationCritiqueCommand(rootDir);
  run.critiqueIds.push(...critiques.map((c) => c.id));

  const repairs: CandidateRepair[] = [];
  const maxRepairAttempts = opts.maxRepairAttempts ?? 1;
  if (maxRepairAttempts > 0) {
    for (const critique of critiques.filter((c) => c.recommendation === "repair")) {
      const repair = await repairCandidateFromCritique(manifest, critique);
      if (repair.status === "repaired") {
        repairs.push(repair);
        run.repairIds.push(repair.id);
        run.candidateIds.push(repair.repairedCandidateId);
      }
    }
  }
  if (repairs.length > 0) {
    const repairedIds = repairs.map((r) => r.repairedCandidateId);
    const repairEvaluations = (await Promise.all(repairedIds.map((id) => specializationEvaluateCommand(rootDir, id)))).flat();
    const repairCritiques = (await Promise.all(repairedIds.map((id) => specializationCritiqueCommand(rootDir, id)))).flat();
    run.evaluationIds.push(...repairEvaluations.map((e) => e.id));
    run.critiqueIds.push(...repairCritiques.map((c) => c.id));
  }

  const candidates = await readCandidates(manifest);
  const terminalCandidateIds = candidates
    .filter((c) => run.candidateIds.includes(c.id))
    .map((c) => c.id);
  const decisions = (await Promise.all(terminalCandidateIds.map((id) => specializationPromoteCommand(rootDir, id)))).flat();
  run.promotionDecisionIds.push(...decisions.map((d) => d.id));

  const report = await buildReport(manifest, run, decisions);
  await writeReport(manifest, report);
  run.endedAtIso = nowIso();
  run.status = report.cycleAccounting.fullCycle ? "completed" : "incomplete";
  run.reportId = report.id;
  run.cycleCounted = report.cycleAccounting.fullCycle;
  await writeJson(runPath(manifest, run.id), run);
  return report;
}

export async function specializationInspectCommand(rootDir: string): Promise<SpecializationInspect> {
  const manifest = await readManifest(rootDir);
  const candidates = await readCandidates(manifest);
  const evaluations = await readAllEvaluations(manifest);
  const critiques = await readAllCritiques(manifest);
  const promotions = await readAllPromotionDecisions(manifest);
  const latestReport = await readLatestReport(manifest);
  return {
    specializationId: manifest.id,
    rootDir: manifest.persistence.rootDir,
    candidates: candidates.map((c) => ({ id: c.id, status: c.status, parentCandidateId: c.parentCandidateId, artifactCount: c.artifactRefs.length })),
    evaluations: evaluations.map((e) => ({ id: e.id, candidateId: e.candidateId, fixtureId: e.fixtureId, result: e.result, score: e.metrics.score ?? 0 })),
    critiques: critiques.map((c) => ({
      id: c.id,
      candidateId: c.candidateId,
      recommendation: c.recommendation,
      blockers: flattenCritiqueIssues(c).filter((i) => i.severity === "blocker").length,
    })),
    promotions: promotions.map((p) => ({ id: p.id, candidateId: p.candidateId, decision: p.decision, criteriaSatisfied: p.criteriaSatisfied })),
    latestReport,
    nextRecommendedImprovements: latestReport?.nextRecommendedImprovements ?? [
      "Run specialize run-loop to create evaluation, critique, and promotion artifacts.",
    ],
  };
}

export function renderSpecializationPlan(plan: SpecializationPlan): string {
  const lines = [
    `specialization: ${plan.specializationId}`,
    `domain: ${plan.domain}`,
    `purpose: ${plan.purpose}`,
    "",
    `generators: ${plan.candidateGenerators.join(", ") || "none"}`,
    `evaluators: ${plan.evaluators.join(", ") || "none"}`,
    `critics: ${plan.critics.join(", ") || "none"}`,
    `fixtures: ${plan.fixtures.join(", ") || "none"}`,
    "",
    "promotion gates:",
    ...plan.promotionGates.map((g) => `  - ${g}`),
  ];
  if (plan.risks.length > 0) lines.push("", "risks:", ...plan.risks.map((r) => `  - ${r}`));
  lines.push("", "next commands:", ...plan.nextCommands.map((c) => `  ${c}`));
  return lines.join("\n");
}

export function renderSpecializationInspect(inspect: SpecializationInspect): string {
  const byStatus = countBy(inspect.candidates.map((c) => c.status));
  const lines = [
    `specialization: ${inspect.specializationId}`,
    `root: ${inspect.rootDir}`,
    `candidates: ${inspect.candidates.length} (${Object.entries(byStatus).map(([k, v]) => `${k}=${v}`).join(", ") || "none"})`,
    `evaluations: ${inspect.evaluations.length}`,
    `critiques: ${inspect.critiques.length}`,
    `promotion decisions: ${inspect.promotions.length}`,
  ];
  const latest = inspect.latestReport;
  if (latest) {
    lines.push(
      `latest report: ${latest.id}`,
      `cycle counted: ${latest.cycleAccounting.fullCycle ? "yes" : "no"}`,
      `promoted: ${latest.promotedCandidates.join(", ") || "none"}`,
      `rejected: ${latest.rejectedCandidates.join(", ") || "none"}`,
    );
  }
  if (inspect.nextRecommendedImprovements.length > 0) {
    lines.push("", "next recommended improvements:", ...inspect.nextRecommendedImprovements.map((n) => `  - ${n}`));
  }
  return lines.join("\n");
}

export function renderSpecializationReport(report: SpecializationReport): string {
  const cycle = report.cycleAccounting;
  return [
    `report: ${report.id}`,
    `specialization: ${report.specializationId}`,
    `run: ${report.runId}`,
    `generated: ${report.generatedCandidates.join(", ") || "none"}`,
    `evaluated: ${report.evaluatedCandidates.join(", ") || "none"}`,
    `critiqued: ${report.critiquedCandidates.join(", ") || "none"}`,
    `repaired: ${report.repairedCandidates.join(", ") || "none"}`,
    `promoted: ${report.promotedCandidates.join(", ") || "none"}`,
    `rejected: ${report.rejectedCandidates.join(", ") || "none"}`,
    `cycle counted: ${cycle.fullCycle ? "yes" : "no"}`,
    "",
    "cycle accounting:",
    ...Object.entries(cycle).map(([k, v]) => `  - ${k}: ${v ? "yes" : "no"}`),
    "",
    "next:",
    ...report.nextRecommendedImprovements.map((n) => `  - ${n}`),
  ].join("\n");
}

function genericSpecializationManifest(rootDir: string, opts: SpecializationInitOptions): SpecializationManifest {
  const id = slugify(opts.name ?? "custom-specialization");
  return specializationManifestSchema.parse({
    schemaVersion: 1,
    id,
    name: opts.name ?? "Custom Specialization",
    version: "0.1.0",
    purpose: opts.purpose ?? "Generate, evaluate, critique, and promote domain-specific agent variants.",
    domain: opts.domain ?? "general",
    allowedCapabilities: ["local.evaluate", "artifact.write"],
    allowedTools: ["local-fixtures", "json-schema", "deterministic-rubric"],
    allowedActions: ["fs.read", "fs.write", "evaluate.fixture", "promote.artifact"],
    requiredInputs: ["task", "fixture", "rubric"],
    expectedOutputs: ["candidate", "evaluation", "critique", "promotion decision"],
    workflowTemplates: [{ id: "generic-loop", description: "Generate -> evaluate -> critique -> promote/reject.", steps: ["generate", "evaluate", "critique", "promote"] }],
    candidateGenerators: [
      { id: "generic-baseline", strategy: "baseline", description: "Safe default local candidate generator." },
      { id: "generic-strict", strategy: "strict", description: "Stricter candidate with more validation gates." },
      { id: "generic-adversarial", strategy: "adversarial", description: "Known-bad candidate used to verify rejection." },
    ],
    evaluators: [
      { id: "fixture", type: "fixture-test", description: "Deterministic fixture evaluator." },
      { id: "schema", type: "schema-validation", description: "Artifact shape evaluator." },
      { id: "baseline", type: "baseline-comparison", description: "Baseline comparison evaluator." },
      { id: "cost", type: "cost-time-budget", description: "Local cost/time evaluator." },
      { id: "artifact", type: "artifact-completeness", description: "Required artifact evaluator." },
    ],
    critics: [{ id: "deterministic-critic", type: "deterministic", rubricId: "generic-rubric" }],
    repairPolicies: [{ id: "add-missing-artifact", trigger: "missing required artifact", action: "Add required artifact and rerun.", maxAttempts: 1 }],
    baselineStrategies: [{ id: "manual-baseline", description: "Conservative baseline.", expectedMetric: 0.5 }],
    promotionCriteria: { minScore: 0.7, minBaselineDelta: 0.05, requireCritiquePass: true, requireAllFixturesPass: true, maxCostUsd: 0, maxRiskFlags: 1 },
    artifactSchemas: [
      { kind: "workflow", requiredFields: ["steps", "validationGates", "outputs"] },
      { kind: "qa-report", requiredFields: ["status", "issues", "recommendation"] },
    ],
    fixtures: [{
      id: "generic-fixture",
      title: "Generic fixture",
      task: "Produce a workflow with artifacts, evaluation, critique, validation, and promotion decision.",
      expectedOutputs: ["workflow", "qa-report"],
      expectedKeywords: ["artifact", "evaluation", "critique", "validation"],
      forbiddenKeywords: ["trust me", "validated without tests"],
      requiredArtifacts: ["workflow", "qa-report"],
      baselineMetric: 0.5,
      tags: ["generic"],
    }],
    evaluationRubrics: [{
      id: "generic-rubric",
      title: "Generic specialization rubric",
      requiredKeywords: ["artifact", "evaluation", "critique", "validation"],
      forbiddenKeywords: ["trust me", "validated without tests"],
      requiredArtifactKinds: ["workflow", "qa-report"],
      minScore: 0.7,
      weights: { fixtureFit: 0.4, artifactCompleteness: 0.25, safety: 0.2, baselineDelta: 0.15 },
    }],
    safetyLimits: { maxCostUsd: 0, maxRuntimeSeconds: 60, maxModelCalls: 0, networkAllowed: false, cloudAllowed: false },
    persistence: {
      rootDir: path.resolve(rootDir),
      candidatesDir: "candidates",
      evaluationsDir: "evaluations",
      critiquesDir: "critiques",
      repairsDir: "repairs",
      promotionsDir: "promotions",
      artifactsDir: "artifacts",
      reportsDir: "reports",
    },
  });
}

async function createCandidate(
  manifest: SpecializationManifest,
  id: string,
  generatorId: string,
  strategy: "baseline" | "strict" | "creative" | "adversarial" | "repair",
  parentCandidateId: string | null,
): Promise<CandidateVariant> {
  const requiredKinds = unique([
    ...manifest.artifactSchemas.map((s) => s.kind),
    ...manifest.fixtures.flatMap((f) => f.requiredArtifacts),
  ]);
  const riskFlags = strategy === "adversarial" ? ["unsupported-claim", "missing-validation"] : strategy === "creative" ? ["novelty-risk"] : [];
  const text = candidateText(manifest, strategy);
  const candidate: CandidateVariant = candidateVariantSchema.parse({
    schemaVersion: 1,
    id,
    specializationId: manifest.id,
    parentCandidateId,
    status: parentCandidateId ? "repaired" : "generated",
    generationMethod: generatorId,
    proposedChanges: {
      workflow: strategy === "adversarial"
        ? ["skip validation", "claim validated without tests"]
        : ["declare task", "produce artifact manifest", "evaluate fixtures", "critique failure modes", "promote only with evidence"],
      nodes: strategy === "creative" ? ["adversarial-fixture-generator", "novelty-distance-scorer"] : ["fixture-evaluator", "promotion-gate"],
      tools: ["json-schema", "local-files"],
      prompts: [text],
      config: { strategy },
      strategy,
    },
    requiredCapabilities: manifest.allowedCapabilities.slice(0, 3),
    expectedOutputs: manifest.expectedOutputs,
    riskFlags,
    costEstimateUsd: 0,
    artifactRefs: [],
    createdAtIso: nowIso(),
  });
  const artifacts: SpecializationArtifact[] = [];
  const emittedKinds = strategy === "adversarial" ? requiredKinds.filter((k) => k !== "analysis-plan") : requiredKinds;
  for (const kind of emittedKinds) {
    artifacts.push(await writeCandidateArtifact(manifest, candidate, kind, artifactPayload(manifest, kind, strategy)));
  }
  candidate.artifactRefs = artifacts;
  return candidateVariantSchema.parse(candidate);
}

function candidateText(manifest: SpecializationManifest, strategy: string): string {
  const researchCoverage = manifest.id === "research-methods-specialist"
    ? " It covers binary classification, calibration, leakage, train/test splits, regression, residual diagnostics, limitations, protocol feasibility, approval, overclaim detection, unsupported inference, explicit reject decisions, and artifact-backed evaluation."
    : "";
  const common = `This candidate records artifact evidence, evaluation output, critique results, schema validation, and promotion gates for ${manifest.domain}.${researchCoverage}`;
  if (strategy === "adversarial") return `${common} It says validated without tests and trust me; caused outcomes are proven effective.`;
  if (strategy === "creative") return `${common} It adds adversarial stress cases, novelty search, rerun stability, and explicit rejection paths.`;
  if (strategy === "strict") return `${common} It emphasizes safety limits, evidence receipts, baseline delta, and refusal on missing validation.`;
  return `${common} It uses conservative fixture evaluation and critique before promotion.`;
}

function artifactPayload(manifest: SpecializationManifest, kind: string, strategy: string): Record<string, unknown> {
  const safeLimitations = strategy === "adversarial"
    ? ["caused", "proven effective", "validated without tests"]
    : ["exploratory only", "requires evaluation evidence", "do not overclaim"];
  if (kind === "workflow") {
    return {
      kind,
      steps: strategy === "adversarial" ? ["generate", "skip validation", "promote"] : ["generate", "evaluate", "critique", "repair-or-reject", "promote"],
      validationGates: strategy === "adversarial" ? [] : ["artifact completeness", "schema validation", "baseline comparison", "cost limit", "critique"],
      outputs: manifest.expectedOutputs,
      notes: candidateText(manifest, strategy),
    };
  }
  if (kind === "analysis-plan") {
    return {
      kind,
      method: strategy === "creative" ? "candidate portfolio with adversarial QA" : "deterministic baseline comparison",
      variables: ["task", "fixture", "artifact", "evaluation", "critique"],
      limitations: safeLimitations,
      notes: strategy === "adversarial" ? "trust me" : "artifact-backed evaluation before claims",
    };
  }
  if (kind === "qa-report") {
    return {
      kind,
      status: strategy === "adversarial" ? "fail" : "pass",
      issues: strategy === "adversarial" ? ["missing validation", "unsupported claim"] : [],
      recommendation: strategy === "adversarial" ? "reject" : "promote if evaluation passes",
      evidence: ["artifact", "evaluation", "critique"],
    };
  }
  return { kind, status: strategy === "adversarial" ? "fail" : "pass", artifact: true, evaluation: true, critique: true };
}

async function evaluateCandidateFixture(
  manifest: SpecializationManifest,
  candidate: CandidateVariant,
  fixture: SpecializationFixture,
): Promise<CandidateEvaluation> {
  const start = Date.now();
  const startedAtIso = nowIso();
  const refreshedArtifacts = await refreshArtifacts(candidate.artifactRefs);
  const artifactKinds = new Set(refreshedArtifacts.map((a) => a.kind));
  const issues: SpecializationIssue[] = [];
  const failureModes: string[] = [];
  const content = JSON.stringify({ candidate, artifacts: await readArtifactPayloads(refreshedArtifacts) }).toLowerCase();
  for (const required of fixture.requiredArtifacts) {
    if (!artifactKinds.has(required)) addIssue(issues, failureModes, "blocker", "REQUIRED_ARTIFACT_MISSING", `Missing required artifact kind '${required}' for fixture '${fixture.id}'.`);
  }
  for (const schema of manifest.artifactSchemas) {
    const artifact = refreshedArtifacts.find((a) => a.kind === schema.kind);
    if (!artifact) continue;
    if (!artifact.schemaValid) addIssue(issues, failureModes, "blocker", "ARTIFACT_SCHEMA_INVALID", `Artifact '${artifact.id}' failed schema validation.`);
  }
  for (const word of fixture.forbiddenKeywords) {
    if (content.includes(word.toLowerCase())) addIssue(issues, failureModes, "blocker", "FORBIDDEN_KEYWORD", `Forbidden phrase detected: '${word}'.`);
  }
  if (candidate.costEstimateUsd > manifest.safetyLimits.maxCostUsd || candidate.costEstimateUsd > manifest.promotionCriteria.maxCostUsd) {
    addIssue(issues, failureModes, "blocker", "COST_LIMIT_EXCEEDED", `Candidate cost ${candidate.costEstimateUsd} exceeds specialization budget.`);
  }
  if (candidate.riskFlags.length > manifest.promotionCriteria.maxRiskFlags) {
    addIssue(issues, failureModes, "warning", "RISK_FLAG_LIMIT", `Candidate has ${candidate.riskFlags.length} risk flags.`);
  }
  const expectedHits = countHits(content, fixture.expectedKeywords);
  const rubric = manifest.evaluationRubrics[0];
  const rubricHits = rubric ? countHits(content, rubric.requiredKeywords) : { hits: 0, total: 0 };
  const artifactScore = fixture.requiredArtifacts.length === 0
    ? 1
    : fixture.requiredArtifacts.filter((kind) => artifactKinds.has(kind)).length / fixture.requiredArtifacts.length;
  const safetyScore = failureModes.includes("FORBIDDEN_KEYWORD") || candidate.riskFlags.includes("unsupported-claim") ? 0 : candidate.riskFlags.length > 0 ? 0.75 : 1;
  const fixtureScore = expectedHits.total === 0 ? 1 : expectedHits.hits / expectedHits.total;
  const rubricScore = rubricHits.total === 0 ? 1 : rubricHits.hits / rubricHits.total;
  const score = clamp01(0.35 * fixtureScore + 0.25 * artifactScore + 0.2 * safetyScore + 0.2 * rubricScore);
  const baseline = manifest.baselineStrategies[0];
  const baselineMetric = fixture.baselineMetric ?? baseline?.expectedMetric ?? 0.5;
  const result = issues.some((i) => i.severity === "blocker") || score < (rubric?.minScore ?? manifest.promotionCriteria.minScore) ? "fail" : "pass";
  if (result === "fail" && failureModes.length === 0) failureModes.push("SCORE_BELOW_THRESHOLD");
  const endedAtIso = nowIso();
  return candidateEvaluationSchema.parse({
    schemaVersion: 1,
    id: `eval-${candidate.id}-${fixture.id}-${shortHash(`${Date.now()}-${Math.random()}`)}`,
    candidateId: candidate.id,
    specializationId: manifest.id,
    fixtureId: fixture.id,
    evaluatorTypes: manifest.evaluators.map((e) => e.type),
    baselineComparison: {
      baselineId: baseline?.id ?? null,
      baselineMetric,
      candidateMetric: score,
      delta: round3(score - baselineMetric),
    },
    metrics: {
      score: round3(score),
      fixtureFit: round3(fixtureScore),
      artifactCompleteness: round3(artifactScore),
      safety: round3(safetyScore),
      rubricCoverage: round3(rubricScore),
      keywordHits: expectedHits.hits,
    },
    result,
    failureModes,
    reproducibility: {
      deterministic: true,
      inputHash: hashJson({ fixture, manifestId: manifest.id }),
      candidateHash: hashJson(candidate),
      artifactHashes: refreshedArtifacts.map((a) => a.sha256 ?? "missing"),
    },
    execution: {
      startedAtIso,
      endedAtIso,
      runtimeMs: Date.now() - start,
      costUsd: candidate.costEstimateUsd,
      logs: [
        `fixture=${fixture.id}`,
        `score=${round3(score)}`,
        `baseline=${baselineMetric}`,
        `result=${result}`,
      ],
      artifacts: refreshedArtifacts,
    },
    issues,
  });
}

async function critiqueCandidate(
  manifest: SpecializationManifest,
  candidate: CandidateVariant,
  evaluations: CandidateEvaluation[],
): Promise<CandidateCritique> {
  const correctnessIssues: SpecializationIssue[] = [];
  const safetyIssues: SpecializationIssue[] = [];
  const evidenceIssues: SpecializationIssue[] = [];
  const brittlenessIssues: SpecializationIssue[] = [];
  const overclaimingIssues: SpecializationIssue[] = [];
  const missingValidation: SpecializationIssue[] = [];
  const suggestedRepairs: string[] = [];
  const content = JSON.stringify({ candidate, artifacts: await readArtifactPayloads(candidate.artifactRefs) }).toLowerCase();
  if (evaluations.length === 0) {
    missingValidation.push(issue("blocker", "EVALUATION_MISSING", "Candidate has not been evaluated."));
  }
  for (const evaluation of evaluations) {
    if (evaluation.result === "fail") {
      correctnessIssues.push(issue("blocker", "EVALUATION_FAILED", `Fixture '${evaluation.fixtureId}' failed: ${evaluation.failureModes.join(", ") || "unknown"}.`, [evaluation.id]));
      for (const mode of evaluation.failureModes) {
        if (mode === "REQUIRED_ARTIFACT_MISSING") suggestedRepairs.push("Add missing required artifact.");
        if (mode === "FORBIDDEN_KEYWORD") suggestedRepairs.push("Remove unsupported or overclaiming language.");
      }
    }
    if (evaluation.baselineComparison.baselineId === null) {
      evidenceIssues.push(issue("blocker", "BASELINE_MISSING", `Fixture '${evaluation.fixtureId}' has no baseline comparison.`, [evaluation.id]));
    }
  }
  if (candidate.artifactRefs.length === 0) evidenceIssues.push(issue("blocker", "ARTIFACTS_MISSING", "Candidate has no artifact references."));
  if (!await lineageExists(manifest, candidate.id)) evidenceIssues.push(issue("blocker", "LINEAGE_MISSING", "Candidate lineage file is missing."));
  if (candidate.costEstimateUsd > manifest.safetyLimits.maxCostUsd) safetyIssues.push(issue("blocker", "COST_LIMIT_EXCEEDED", "Candidate exceeds specialization cost limit."));
  if (candidate.riskFlags.includes("unsupported-claim")) safetyIssues.push(issue("blocker", "UNSUPPORTED_CLAIM_RISK", "Candidate carries unsupported-claim risk."));
  if (candidate.riskFlags.length > 0 && candidate.riskFlags.length <= manifest.promotionCriteria.maxRiskFlags) {
    brittlenessIssues.push(issue("warning", "RISK_FLAGS_PRESENT", `Candidate has risk flags: ${candidate.riskFlags.join(", ")}.`));
  }
  const rubric = manifest.evaluationRubrics[0];
  const forbidden = unique([...(rubric?.forbiddenKeywords ?? []), "caused", "proven effective", "validated without tests", "trust me"]);
  for (const word of forbidden) {
    if (content.includes(word.toLowerCase())) overclaimingIssues.push(issue("blocker", "OVERCLAIM", `Unsupported or forbidden phrase detected: '${word}'.`));
  }
  for (const critic of manifest.critics.filter((c) => c.type === "llm-optional")) {
    brittlenessIssues.push(issue("note", "LLM_CRITIC_NOT_CONFIGURED", `Optional LLM critic '${critic.id}' skipped; deterministic critique still ran.`));
  }
  const allIssues = [...correctnessIssues, ...safetyIssues, ...evidenceIssues, ...brittlenessIssues, ...overclaimingIssues, ...missingValidation];
  const blockers = allIssues.filter((i) => i.severity === "blocker");
  const repairable = blockers.every((i) => ["EVALUATION_FAILED", "ARTIFACTS_MISSING", "OVERCLAIM"].includes(i.code)) && suggestedRepairs.length > 0 && !candidate.riskFlags.includes("unsupported-claim");
  const passEvaluations = evaluations.length > 0 && evaluations.every((e) => e.result === "pass");
  const recommendation = blockers.length === 0 && passEvaluations ? "promote" : repairable ? "repair" : "reject";
  return candidateCritiqueSchema.parse({
    schemaVersion: 1,
    id: `critique-${candidate.id}-${shortHash(`${Date.now()}-${Math.random()}`)}`,
    candidateId: candidate.id,
    specializationId: manifest.id,
    correctnessIssues,
    safetyIssues,
    evidenceIssues,
    brittlenessIssues,
    overclaimingIssues,
    missingValidation,
    suggestedRepairs: unique(suggestedRepairs),
    recommendation,
    confidence: blockers.length === 0 ? 0.86 : 0.78,
  });
}

async function repairCandidateFromCritique(manifest: SpecializationManifest, critique: CandidateCritique): Promise<CandidateRepair> {
  const original = await readCandidate(manifest, critique.candidateId);
  if (!original || critique.recommendation !== "repair") {
    throw new Error(`candidate ${critique.candidateId} is not repairable`);
  }
  const repairedId = `${original.id}-repair-${Date.now()}`;
  const repaired = candidateVariantSchema.parse({
    ...original,
    id: repairedId,
    parentCandidateId: original.id,
    status: "repaired",
    generationMethod: "repair-policy",
    proposedChanges: {
      ...original.proposedChanges,
      workflow: unique([...original.proposedChanges.workflow.filter((s) => !/skip validation|validated without tests/i.test(s)), "rerun schema validation", "rerun critique before promotion"]),
      prompts: original.proposedChanges.prompts.map((p) => p.replace(/validated without tests|trust me|caused|proven effective/gi, "requires evidence and remains exploratory")),
      config: { ...original.proposedChanges.config, repairedFrom: original.id },
    },
    riskFlags: original.riskFlags.filter((r) => r !== "missing-validation"),
    artifactRefs: [],
    createdAtIso: nowIso(),
  });
  const requiredKinds = unique([...manifest.artifactSchemas.map((s) => s.kind), ...manifest.fixtures.flatMap((f) => f.requiredArtifacts)]);
  repaired.artifactRefs = [];
  for (const kind of requiredKinds) {
    repaired.artifactRefs.push(await writeCandidateArtifact(manifest, repaired, kind, artifactPayload(manifest, kind, "strict")));
  }
  await writeCandidate(manifest, repaired);
  const parentLineage = await readLineage(manifest, original.id);
  const lineage = candidateLineageSchema.parse({
    candidateId: repaired.id,
    parentCandidateId: original.id,
    rootCandidateId: parentLineage?.rootCandidateId ?? original.id,
    generation: (parentLineage?.generation ?? 0) + 1,
    events: [
      ...(parentLineage?.events ?? []),
      { atIso: nowIso(), type: "repaired", artifactPath: candidatePath(manifest, repaired.id), summary: `Repaired from ${original.id} after critique ${critique.id}.` },
    ],
  });
  await writeLineage(manifest, lineage);
  const repair: CandidateRepair = candidateRepairSchema.parse({
    schemaVersion: 1,
    id: `repair-${original.id}-${shortHash(repaired.id)}`,
    candidateId: original.id,
    repairedCandidateId: repaired.id,
    repairActions: critique.suggestedRepairs.length > 0 ? critique.suggestedRepairs : ["Added validation gates and required artifacts."],
    sourceCritiqueId: critique.id,
    status: "repaired",
    lineage,
  });
  await writeJson(repairPath(manifest, repair.id), repair);
  return repair;
}

async function decidePromotion(manifest: SpecializationManifest, candidate: CandidateVariant): Promise<PromotionDecision> {
  const evaluations = await readEvaluationsForCandidate(manifest, candidate.id);
  const critiques = await readCritiquesForCandidate(manifest, candidate.id);
  const latestCritique = critiques.at(-1);
  const issues: string[] = [];
  const evidence: string[] = [];
  if (candidate.status === "promoted") {
    issues.push("Candidate is already promoted.");
  }
  if (candidate.status === "generated") issues.push("Generated candidate has not completed evaluation.");
  if (evaluations.length === 0) issues.push("No evaluation exists.");
  if (!latestCritique) issues.push("No critique exists.");
  if (latestCritique?.recommendation === "reject") issues.push("Latest critique recommends rejection.");
  if (candidate.costEstimateUsd > manifest.safetyLimits.maxCostUsd || candidate.costEstimateUsd > manifest.promotionCriteria.maxCostUsd) issues.push("Cost limit exceeded.");
  if (candidate.riskFlags.length > manifest.promotionCriteria.maxRiskFlags) issues.push("Risk flag limit exceeded.");
  const requiredKinds = unique([...manifest.artifactSchemas.map((s) => s.kind), ...manifest.evaluationRubrics.flatMap((r) => r.requiredArtifactKinds)]);
  const artifactKinds = new Set(candidate.artifactRefs.map((a) => a.kind));
  for (const kind of requiredKinds) {
    if (!artifactKinds.has(kind)) issues.push(`Missing required artifact kind '${kind}'.`);
  }
  if (candidate.artifactRefs.some((a) => !a.schemaValid)) issues.push("One or more artifacts failed schema validation.");
  if (!evaluations.every((e) => e.baselineComparison.baselineId !== null)) issues.push("Baseline comparison missing.");
  const avgScore = average(evaluations.map((e) => e.metrics.score ?? e.baselineComparison.candidateMetric));
  const avgDelta = average(evaluations.map((e) => e.baselineComparison.delta));
  if (avgScore < manifest.promotionCriteria.minScore) issues.push(`Score ${round3(avgScore)} below ${manifest.promotionCriteria.minScore}.`);
  if (avgDelta < manifest.promotionCriteria.minBaselineDelta) issues.push(`Baseline delta ${round3(avgDelta)} below ${manifest.promotionCriteria.minBaselineDelta}.`);
  if (manifest.promotionCriteria.requireAllFixturesPass && evaluations.some((e) => e.result === "fail")) issues.push("At least one fixture failed.");
  if (!await lineageExists(manifest, candidate.id)) issues.push("Lineage is missing.");
  if (manifest.promotionCriteria.requireCritiquePass && latestCritique?.recommendation !== "promote") issues.push("Critique did not recommend promotion.");
  evidence.push(...evaluations.map((e) => e.id), ...(latestCritique ? [latestCritique.id] : []), ...candidate.artifactRefs.map((a) => a.path));
  const criteriaSatisfied = issues.length === 0;
  const decision = criteriaSatisfied ? "promoted" : latestCritique?.recommendation === "repair" ? "retry" : "rejected";
  return promotionDecisionSchema.parse({
    schemaVersion: 1,
    id: `decision-${candidate.id}-${shortHash(`${Date.now()}-${Math.random()}`)}`,
    candidateId: candidate.id,
    specializationId: manifest.id,
    decision,
    reason: criteriaSatisfied ? `Promoted with score ${round3(avgScore)} and baseline delta ${round3(avgDelta)}.` : issues.join(" "),
    baselineDelta: round3(avgDelta),
    evidence,
    remainingRisks: candidate.riskFlags,
    artifactsPromoted: criteriaSatisfied ? candidate.artifactRefs : [],
    criteriaSatisfied,
  });
}

async function buildReport(
  manifest: SpecializationManifest,
  run: SpecializationRun,
  decisions: PromotionDecision[],
): Promise<SpecializationReport> {
  const evaluations = await readAllEvaluations(manifest);
  const critiques = await readAllCritiques(manifest);
  const generatedCandidates = run.candidateIds;
  const evaluatedCandidates = unique(evaluations.filter((e) => run.candidateIds.includes(e.candidateId)).map((e) => e.candidateId));
  const critiquedCandidates = unique(critiques.filter((c) => run.candidateIds.includes(c.candidateId)).map((c) => c.candidateId));
  const promotedCandidates = decisions.filter((d) => d.decision === "promoted").map((d) => d.candidateId);
  const rejectedCandidates = decisions.filter((d) => d.decision === "rejected").map((d) => d.candidateId);
  const retryCandidates = decisions.filter((d) => d.decision === "retry").map((d) => d.candidateId);
  const baselineSummary: BaselineResult[] = manifest.fixtures.map((f) => ({
    baselineId: manifest.baselineStrategies[0]?.id ?? "none",
    fixtureId: f.id,
    metric: f.baselineMetric,
    summary: `Fixture baseline metric is ${f.baselineMetric}.`,
  }));
  const repairMutationOrExplicitRejection = run.repairIds.length > 0 || rejectedCandidates.length > 0 || retryCandidates.length > 0;
  const rerunOrJustifiedStop = run.repairIds.length > 0 || retryCandidates.length === 0 || decisions.length > 0;
  const cycleAccounting = {
    selectedTaskOrStressCase: run.selectedTaskOrStressCase !== null,
    executedCandidates: generatedCandidates.length > 0,
    evaluationResult: evaluatedCandidates.length > 0,
    critiqueFailureAttribution: critiquedCandidates.length > 0,
    repairMutationOrExplicitRejection,
    rerunOrJustifiedStop,
    finalPromotionOrRejection: decisions.some((d) => d.decision === "promoted" || d.decision === "rejected"),
    nextStepRecommendation: true,
    fullCycle: false,
  };
  cycleAccounting.fullCycle = Object.entries(cycleAccounting)
    .filter(([k]) => k !== "fullCycle")
    .every(([, value]) => value === true);
  const issues: SpecializationIssue[] = [];
  if (!cycleAccounting.fullCycle) {
    issues.push(issue("blocker", "INCOMPLETE_SPECIALIZATION_LOOP", "Loop is not counted because one or more cycle-accounting gates are missing."));
  }
  const nextRecommendedImprovements = [
    promotedCandidates.length > 0 ? "Export promoted artifacts into reusable workflow/node packages." : "Tighten candidate generators until at least one variant satisfies promotion criteria.",
    "Add a second domain specialization to prove the framework is not research-only.",
    "Add a richer evaluator when fixture failures become too coarse.",
  ];
  return specializationReportSchema.parse({
    schemaVersion: 1,
    id: `report-${run.id}`,
    specializationId: manifest.id,
    runId: run.id,
    generatedCandidates,
    evaluatedCandidates,
    critiquedCandidates,
    repairedCandidates: run.repairIds,
    promotedCandidates,
    rejectedCandidates,
    baselineSummary,
    cycleAccounting,
    issues,
    nextRecommendedImprovements,
    reportPath: null,
  });
}

async function writeCandidateArtifact(
  manifest: SpecializationManifest,
  candidate: CandidateVariant,
  kind: string,
  payload: Record<string, unknown>,
): Promise<SpecializationArtifact> {
  const dir = path.join(artifactsDir(manifest), candidate.id);
  await mkdir(dir, { recursive: true });
  const file = path.join(dir, `${kind}.json`);
  await writeJson(file, payload);
  const schema = manifest.artifactSchemas.find((s) => s.kind === kind);
  const schemaValid = !schema || schema.requiredFields.every((field) => Object.prototype.hasOwnProperty.call(payload, field));
  return specializationArtifactSchema.parse({
    id: `${candidate.id}-${kind}`,
    kind,
    path: file,
    sha256: await hashFileOrNull(file),
    producedBy: candidate.id,
    schemaValid,
    required: manifest.fixtures.some((f) => f.requiredArtifacts.includes(kind)) || manifest.evaluationRubrics.some((r) => r.requiredArtifactKinds.includes(kind)),
  });
}

async function refreshArtifacts(artifacts: SpecializationArtifact[]): Promise<SpecializationArtifact[]> {
  return Promise.all(artifacts.map(async (artifact) => ({
    ...artifact,
    sha256: await hashFileOrNull(artifact.path),
  })));
}

async function readArtifactPayloads(artifacts: SpecializationArtifact[]): Promise<unknown[]> {
  const payloads: unknown[] = [];
  for (const artifact of artifacts) {
    try {
      payloads.push(await readJson(artifact.path));
    } catch {
      payloads.push({ missing: artifact.path });
    }
  }
  return payloads;
}

async function ensureSpecializationDirs(manifest: SpecializationManifest): Promise<void> {
  await mkdir(manifest.persistence.rootDir, { recursive: true });
  await Promise.all([
    candidatesDir(manifest),
    evaluationsDir(manifest),
    critiquesDir(manifest),
    repairsDir(manifest),
    promotionsDir(manifest),
    artifactsDir(manifest),
    reportsDir(manifest),
    runsDir(manifest),
    lineageDir(manifest),
  ].map((dir) => mkdir(dir, { recursive: true })));
}

async function selectCandidates(manifest: SpecializationManifest, candidateId: string | undefined, statuses: CandidateVariant["status"][]): Promise<CandidateVariant[]> {
  const candidates = candidateId ? [await readCandidate(manifest, candidateId)] : await readCandidates(manifest);
  const filtered = candidates.filter((c): c is CandidateVariant => c !== null).filter((c) => statuses.includes(c.status));
  if (candidateId && filtered.length === 0) throw new Error(`candidate not found or not in selectable state: ${candidateId}`);
  return filtered;
}

async function readManifest(rootDir: string): Promise<SpecializationManifest> {
  return specializationManifestSchema.parse(await readJson(manifestPath(path.resolve(rootDir))));
}

async function readCandidates(manifest: SpecializationManifest): Promise<CandidateVariant[]> {
  return readJsonDir(candidatesDir(manifest), candidateVariantSchema.parse);
}

async function readCandidate(manifest: SpecializationManifest, id: string): Promise<CandidateVariant | null> {
  try {
    return candidateVariantSchema.parse(await readJson(candidatePath(manifest, id)));
  } catch {
    return null;
  }
}

async function writeCandidate(manifest: SpecializationManifest, candidate: CandidateVariant): Promise<void> {
  await writeJson(candidatePath(manifest, candidate.id), candidateVariantSchema.parse(candidate));
}

async function writeEvaluation(manifest: SpecializationManifest, evaluation: CandidateEvaluation): Promise<void> {
  await writeJson(evaluationPath(manifest, evaluation.id), candidateEvaluationSchema.parse(evaluation));
}

async function readAllEvaluations(manifest: SpecializationManifest): Promise<CandidateEvaluation[]> {
  return readJsonDir(evaluationsDir(manifest), candidateEvaluationSchema.parse);
}

async function readEvaluationsForCandidate(manifest: SpecializationManifest, candidateId: string): Promise<CandidateEvaluation[]> {
  return (await readAllEvaluations(manifest)).filter((e) => e.candidateId === candidateId);
}

async function writeCritique(manifest: SpecializationManifest, critique: CandidateCritique): Promise<void> {
  await writeJson(critiquePath(manifest, critique.id), candidateCritiqueSchema.parse(critique));
}

async function readAllCritiques(manifest: SpecializationManifest): Promise<CandidateCritique[]> {
  return readJsonDir(critiquesDir(manifest), candidateCritiqueSchema.parse);
}

async function readCritiquesForCandidate(manifest: SpecializationManifest, candidateId: string): Promise<CandidateCritique[]> {
  return (await readAllCritiques(manifest)).filter((c) => c.candidateId === candidateId);
}

async function writePromotionDecision(manifest: SpecializationManifest, decision: PromotionDecision): Promise<void> {
  await writeJson(promotionDecisionPath(manifest, decision.id), promotionDecisionSchema.parse(decision));
}

async function readAllPromotionDecisions(manifest: SpecializationManifest): Promise<PromotionDecision[]> {
  return readJsonDir(promotionsDir(manifest), promotionDecisionSchema.parse);
}

async function writeLineage(manifest: SpecializationManifest, lineage: CandidateLineage): Promise<void> {
  await writeJson(lineagePath(manifest, lineage.candidateId), candidateLineageSchema.parse(lineage));
}

async function readLineage(manifest: SpecializationManifest, candidateId: string): Promise<CandidateLineage | null> {
  try {
    return candidateLineageSchema.parse(await readJson(lineagePath(manifest, candidateId)));
  } catch {
    return null;
  }
}

async function lineageExists(manifest: SpecializationManifest, candidateId: string): Promise<boolean> {
  return (await readLineage(manifest, candidateId)) !== null;
}

async function appendLineageEvent(
  manifest: SpecializationManifest,
  candidateId: string,
  type: CandidateLineage["events"][number]["type"],
  summary: string,
  artifactPath: string | null,
): Promise<void> {
  const existing = await readLineage(manifest, candidateId);
  if (!existing) return;
  existing.events.push({ atIso: nowIso(), type, artifactPath, summary });
  await writeLineage(manifest, existing);
}

async function writeReport(manifest: SpecializationManifest, report: SpecializationReport): Promise<void> {
  const reportFile = path.join(reportsDir(manifest), `${report.id}.json`);
  const withPath = specializationReportSchema.parse({ ...report, reportPath: reportFile });
  await writeJson(reportFile, withPath);
  await writeJson(path.join(reportsDir(manifest), LATEST_REPORT_FILE), withPath);
  await writeFile(path.join(reportsDir(manifest), LATEST_REPORT_MD), renderSpecializationReport(withPath), "utf8");
}

async function readLatestReport(manifest: SpecializationManifest): Promise<SpecializationReport | null> {
  try {
    return specializationReportSchema.parse(await readJson(path.join(reportsDir(manifest), LATEST_REPORT_FILE)));
  } catch {
    return null;
  }
}

async function copyPromotedArtifact(manifest: SpecializationManifest, candidateId: string, artifact: SpecializationArtifact): Promise<void> {
  const target = path.join(promotionsDir(manifest), candidateId, path.basename(artifact.path));
  await copyFile(artifact.path, target);
}

async function readJsonDir<T>(dir: string, parse: (value: unknown) => T): Promise<T[]> {
  try {
    const entries = await readdir(dir);
    const out: T[] = [];
    for (const entry of entries.filter((e) => e.endsWith(".json"))) {
      try {
        out.push(parse(await readJson(path.join(dir, entry))));
      } catch {
        // Invalid sidecar files are ignored by readers and surfaced by command-specific validators.
      }
    }
    return out.sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
  } catch {
    return [];
  }
}

async function readJson(file: string): Promise<unknown> {
  return JSON.parse(await readFile(file, "utf8"));
}

async function writeJson(file: string, value: unknown): Promise<void> {
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function hashFileOrNull(file: string): Promise<string | null> {
  try {
    const s = await stat(file);
    if (!s.isFile()) return null;
    return createHash("sha256").update(await readFile(file)).digest("hex");
  } catch {
    return null;
  }
}

function hashJson(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function shortHash(value: string): string {
  return createHash("sha256").update(value).digest("hex").slice(0, 10);
}

function manifestPath(rootDir: string): string {
  return path.join(rootDir, MANIFEST_FILE);
}

function candidatesDir(manifest: SpecializationManifest): string {
  return path.join(manifest.persistence.rootDir, manifest.persistence.candidatesDir);
}

function evaluationsDir(manifest: SpecializationManifest): string {
  return path.join(manifest.persistence.rootDir, manifest.persistence.evaluationsDir);
}

function critiquesDir(manifest: SpecializationManifest): string {
  return path.join(manifest.persistence.rootDir, manifest.persistence.critiquesDir);
}

function repairsDir(manifest: SpecializationManifest): string {
  return path.join(manifest.persistence.rootDir, manifest.persistence.repairsDir);
}

function promotionsDir(manifest: SpecializationManifest): string {
  return path.join(manifest.persistence.rootDir, manifest.persistence.promotionsDir);
}

function artifactsDir(manifest: SpecializationManifest): string {
  return path.join(manifest.persistence.rootDir, manifest.persistence.artifactsDir);
}

function reportsDir(manifest: SpecializationManifest): string {
  return path.join(manifest.persistence.rootDir, manifest.persistence.reportsDir);
}

function runsDir(manifest: SpecializationManifest): string {
  return path.join(manifest.persistence.rootDir, "runs");
}

function lineageDir(manifest: SpecializationManifest): string {
  return path.join(manifest.persistence.rootDir, "lineage");
}

function candidatePath(manifest: SpecializationManifest, id: string): string {
  return path.join(candidatesDir(manifest), `${id}.json`);
}

function evaluationPath(manifest: SpecializationManifest, id: string): string {
  return path.join(evaluationsDir(manifest), `${id}.json`);
}

function critiquePath(manifest: SpecializationManifest, id: string): string {
  return path.join(critiquesDir(manifest), `${id}.json`);
}

function repairPath(manifest: SpecializationManifest, id: string): string {
  return path.join(repairsDir(manifest), `${id}.json`);
}

function promotionDecisionPath(manifest: SpecializationManifest, id: string): string {
  return path.join(promotionsDir(manifest), `${id}.json`);
}

function promotionPath(manifest: SpecializationManifest, id: string): string {
  return path.join(promotionsDir(manifest), `${id}.promotion.json`);
}

function runPath(manifest: SpecializationManifest, id: string): string {
  return path.join(runsDir(manifest), `${id}.json`);
}

function lineagePath(manifest: SpecializationManifest, candidateId: string): string {
  return path.join(lineageDir(manifest), `${candidateId}.json`);
}

function nextCandidateId(n: number, strategy: string): string {
  return `cand-${String(n).padStart(4, "0")}-${slugify(strategy)}`;
}

function slugify(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "specialization";
}

function nowIso(): string {
  return new Date().toISOString();
}

function unique<T>(values: T[]): T[] {
  return [...new Set(values)];
}

function countHits(content: string, words: readonly string[]): { hits: number; total: number } {
  return { hits: words.filter((w) => content.includes(w.toLowerCase())).length, total: words.length };
}

function addIssue(issues: SpecializationIssue[], failureModes: string[], severity: SpecializationIssue["severity"], code: string, message: string): void {
  issues.push(issue(severity, code, message));
  if (!failureModes.includes(code)) failureModes.push(code);
}

function issue(severity: SpecializationIssue["severity"], code: string, message: string, evidenceRefs: string[] = []): SpecializationIssue {
  return { severity, code, message, evidenceRefs };
}

function flattenCritiqueIssues(critique: CandidateCritique): SpecializationIssue[] {
  return [
    ...critique.correctnessIssues,
    ...critique.safetyIssues,
    ...critique.evidenceIssues,
    ...critique.brittlenessIssues,
    ...critique.overclaimingIssues,
    ...critique.missingValidation,
  ];
}

function average(values: number[]): number {
  return values.length === 0 ? 0 : values.reduce((sum, value) => sum + value, 0) / values.length;
}

function round3(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function countBy(values: string[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const value of values) counts[value] = (counts[value] ?? 0) + 1;
  return counts;
}
