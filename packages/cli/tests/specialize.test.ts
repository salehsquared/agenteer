import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  specializationCritiqueCommand,
  specializationEvaluateCommand,
  specializationGenerateCommand,
  specializationInitCommand,
  specializationInspectCommand,
  specializationManifestSchema,
  specializationPlanCommand,
  specializationPromoteCommand,
  specializationRunLoopCommand,
  type CandidateVariant,
  type SpecializationManifest,
} from "../src/index.js";

describe("specialization factory", () => {
  it("validates the built-in manifest and scaffolds durable state", async () => {
    const dir = await tempDir();
    try {
      const manifest = await specializationInitCommand({ outDir: dir, builtin: "research-methods-specialist" });
      const parsed = specializationManifestSchema.parse(JSON.parse(await readFile(path.join(dir, "specialization.json"), "utf8")));
      const plan = await specializationPlanCommand(dir);

      expect(manifest.id).toBe("research-methods-specialist");
      expect(parsed.fixtures.map((fixture) => fixture.id)).toEqual(expect.arrayContaining([
        "binary-classification-fixture",
        "regression-fixture",
        "deliberately-flawed-fixture",
      ]));
      expect(plan.risks).toEqual([]);
      await expect(readFile(path.join(dir, "candidates", ".missing"), "utf8")).rejects.toThrow();
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("generates candidates with lineage and artifact references", async () => {
    const dir = await initialized();
    try {
      const candidates = await specializationGenerateCommand(dir, 4);
      const lineage = JSON.parse(await readFile(path.join(dir, "lineage", `${candidates[0]!.id}.json`), "utf8"));

      expect(candidates).toHaveLength(4);
      expect(candidates.map((candidate) => candidate.parentCandidateId)).toEqual([null, null, null, null]);
      expect(candidates.map((candidate) => candidate.generationMethod)).toEqual([
        "baseline-conservative",
        "strict-methods",
        "creative-tail",
        "known-bad",
      ]);
      expect(candidates[0]!.artifactRefs.length).toBeGreaterThan(0);
      expect(lineage.events.map((event: { type: string }) => event.type)).toContain("generated");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("requires artifacts during evaluation", async () => {
    const dir = await initialized();
    try {
      const [candidate] = await specializationGenerateCommand(dir, 1);
      await writeCandidate(dir, { ...candidate!, artifactRefs: [] });

      const evaluations = await specializationEvaluateCommand(dir, candidate!.id);

      expect(evaluations).toHaveLength(5);
      expect(evaluations.some((evaluation) => evaluation.failureModes.includes("REQUIRED_ARTIFACT_MISSING"))).toBe(true);
      expect(evaluations.some((evaluation) => evaluation.result === "fail")).toBe(true);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("blocks generated-only promotion and rejected candidates", async () => {
    const dir = await initialized();
    try {
      const candidates = await specializationGenerateCommand(dir, 4);
      const generatedDecision = await specializationPromoteCommand(dir, candidates[0]!.id);
      const bad = candidates.find((candidate) => candidate.generationMethod === "known-bad")!;
      await specializationEvaluateCommand(dir, bad.id);
      const critiques = await specializationCritiqueCommand(dir, bad.id);
      const badDecision = await specializationPromoteCommand(dir, bad.id);

      expect(generatedDecision[0]!.decision).not.toBe("promoted");
      expect(generatedDecision[0]!.reason).toMatch(/Generated candidate/);
      expect(critiques[0]!.recommendation).toBe("reject");
      expect(badDecision[0]!.decision).toBe("rejected");
      expect(badDecision[0]!.reason).toMatch(/rejection|unsupported|failed/i);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("runs a complete loop, records cycle accounting, and preserves repaired lineage", async () => {
    const dir = await initialized();
    try {
      const report = await specializationRunLoopCommand(dir, { count: 4 });
      const inspect = await specializationInspectCommand(dir);
      const repaired = inspect.candidates.find((candidate) => candidate.parentCandidateId !== null);
      const lineage = repaired
        ? JSON.parse(await readFile(path.join(dir, "lineage", `${repaired.id}.json`), "utf8"))
        : null;

      expect(report.cycleAccounting.fullCycle).toBe(true);
      expect(report.generatedCandidates.length).toBeGreaterThanOrEqual(4);
      expect(report.evaluatedCandidates.length).toBeGreaterThan(0);
      expect(report.critiquedCandidates.length).toBeGreaterThan(0);
      expect(report.promotedCandidates.length + report.rejectedCandidates.length).toBeGreaterThan(0);
      expect(inspect.latestReport?.id).toBe(report.id);
      if (repaired) {
        expect(lineage.parentCandidateId).toBe(repaired.parentCandidateId);
        expect(lineage.events.map((event: { type: string }) => event.type)).toContain("repaired");
      }
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("does not count incomplete generated-only work as a full cycle", async () => {
    const dir = await initialized();
    try {
      await specializationGenerateCommand(dir, 1);
      const inspect = await specializationInspectCommand(dir);

      expect(inspect.latestReport).toBeNull();
      expect(inspect.candidates[0]!.status).toBe("generated");
      expect(inspect.nextRecommendedImprovements[0]).toContain("run-loop");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("degrades gracefully when optional LLM critics are configured", async () => {
    const dir = await initialized();
    try {
      const manifestPath = path.join(dir, "specialization.json");
      const manifest = JSON.parse(await readFile(manifestPath, "utf8")) as SpecializationManifest;
      manifest.critics.push({ id: "cold-llm-review", type: "llm-optional", rubricId: "research-methods-rubric" });
      await writeFile(manifestPath, JSON.stringify(manifest, null, 2));
      const [candidate] = await specializationGenerateCommand(dir, 1);
      await specializationEvaluateCommand(dir, candidate!.id);
      const critiques = await specializationCritiqueCommand(dir, candidate!.id);

      expect(critiques[0]!.brittlenessIssues.map((issue) => issue.code)).toContain("LLM_CRITIC_NOT_CONFIGURED");
      expect(["promote", "repair", "reject"]).toContain(critiques[0]!.recommendation);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

async function initialized(): Promise<string> {
  const dir = await tempDir();
  await specializationInitCommand({ outDir: dir, builtin: "research-methods-specialist" });
  return dir;
}

async function tempDir(): Promise<string> {
  const dir = await mkdtemp(path.join(os.tmpdir(), "agenteer-specialize-"));
  await mkdir(dir, { recursive: true });
  return dir;
}

async function writeCandidate(dir: string, candidate: CandidateVariant): Promise<void> {
  await writeFile(path.join(dir, "candidates", `${candidate.id}.json`), JSON.stringify(candidate, null, 2));
}
