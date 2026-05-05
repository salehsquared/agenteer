import { chmod, mkdir, mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  agentAdversarialProtocolsCommand,
  agentCapabilityFromContractCommand,
  agentCapabilityValidateCommand,
  agentCognitivePoolCommand,
  agentContextImmuneCheckCommand,
  agentContextDenoiseCommand,
  agentContextManifestCommand,
  agentContextOutcomeCommand,
  agentContextPreflightCommand,
  agentContextScoreCommand,
  agentCreativitySynthCommand,
  agentCriticCommand,
  agentDreamCommand,
  agentEvidenceReceiptCommand,
  agentExecutionMemoryCommand,
  agentIdeaEvolveCommand,
  agentImprovementCandidatesCommand,
  agentImprovementRunCommand,
  agentNodeContractCommand,
  agentNodeContractsCommand,
  agentNodeContractValidateCommand,
  agentNodeIoValidateCommand,
  agentNodeOutputRecordCommand,
  agentPlanCriticCommand,
  agentPlanDiffCommand,
  agentPlanStateCreateCommand,
  agentPlanStateEventCommand,
  agentPlanStateReplanCommand,
  agentPlanStateResumeCommand,
  agentPlanV2Command,
  agentReplanCommand,
  agentRepairProvenanceCommand,
  agentRepairRunCommand,
  agentResearchIntakeCommand,
  agentResearchMarketCommand,
  agentReliabilityEvalCommand,
  agentSourceRankCommand,
  agentTaskCreateCommand,
  agentTaskExportCommand,
  agentTaskTransitionCommand,
  agentTaskValidateCommand,
  agentTrajectoryPolicyCommand,
  renderAgentContextPreflightJson,
  renderAgentContextManifestJson,
  renderAgentCreativitySynthesisJson,
  renderAgentCritique,
  renderAgentIdeaEvolutionJson,
  renderAgentImprovementCandidatesJson,
  renderAgentImprovementRunJson,
  renderAgentExecutionMemory,
  renderAgentEvidenceReceiptJson,
  renderAgentNodeContractValidationJson,
  renderAgentNodeExecutionRecordJson,
  renderAgentPlanPortfolioJson,
  renderAgentPlanStateJson,
  renderAgentRepairRunJson,
  renderAgentResearchIntakeJson,
  renderAgentSourceRankJson,
  renderAgentTaskEnvelopeJson,
} from "../src/commands/agent.js";

describe("agent improvement layer", () => {
  it("wraps autocontext preflight with status, pack, impact, and memory hits", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "agent-context-"));
    try {
      const bin = path.join(dir, "fake-context.js");
      await writeFakeContextBin(bin);
      await mkdir(path.join(dir, ".autocontext", "memory"), { recursive: true });
      await writeFile(path.join(dir, ".autocontext", "memory", "lesson.md"), "planner repair context lesson passed");

      const result = await agentContextPreflightCommand(dir, "planner repair", {
        target: "src/index.ts",
        contextBin: bin,
      });
      const parsed = JSON.parse(renderAgentContextPreflightJson(result)) as {
        contextPreflight: { memoryHits: Array<{ file: string }>; status: { ok: boolean }; pack: { ok: boolean }; impact: { ok: boolean } };
      };

      expect(result.status.ok).toBe(true);
      expect(result.pack.ok).toBe(true);
      expect(result.impact?.ok).toBe(true);
      expect(result.memoryHits.length).toBe(1);
      expect(parsed.contextPreflight.memoryHits[0]?.file).toContain("lesson.md");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("marks autocontext missing states as stale or missing", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "agent-context-missing-"));
    try {
      const bin = path.join(dir, "fake-context.js");
      await writeFakeContextBin(bin, "missing");

      const result = await agentContextPreflightCommand(dir, "planner repair", { contextBin: bin });

      expect(result.status.ok).toBe(true);
      expect(result.staleOrMissing).toBe(true);
      expect(result.nextAction).toContain("Refresh");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("builds, scores, and updates context pack manifests", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "agent-context-manifest-"));
    try {
      const bin = path.join(dir, "fake-context.js");
      await writeFakeContextBin(bin);
      await mkdir(path.join(dir, ".autocontext", "memory"), { recursive: true });
      await writeFile(path.join(dir, ".autocontext", "memory", "lesson.md"), "planner repair context lesson passed and verified");
      const manifestPath = path.join(dir, "context-manifest.json");
      const resultPath = path.join(dir, "result.json");
      const updatedPath = path.join(dir, "context-manifest-updated.json");

      const manifest = await agentContextManifestCommand(dir, "planner repair", {
        target: "src/index.ts",
        contextBin: bin,
        outPath: manifestPath,
      });
      const score = await agentContextScoreCommand(manifestPath);
      await writeFile(resultPath, JSON.stringify({ status: "success", summary: "planner repair passed" }, null, 2));
      const updated = await agentContextOutcomeCommand(manifestPath, resultPath, { outPath: updatedPath });
      const parsed = JSON.parse(renderAgentContextManifestJson(updated)) as { contextManifest: { contextPackId: string; downstreamOutcomeHistory: unknown[] } };

      expect(manifest.contextPackId).toMatch(/^ctx_/);
      expect(manifest.status).toBe("ready");
      expect(manifest.sources.some(source => source.sourceType === "memory")).toBe(true);
      expect(manifest.sourceHashes.length).toBe(manifest.sources.length);
      expect(score.status).toBe("ready");
      expect(updated.downstreamOutcomeHistory).toHaveLength(1);
      expect(updated.score).toBeGreaterThanOrEqual(manifest.score);
      expect(parsed.contextManifest.contextPackId).toBe(manifest.contextPackId);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("blocks high-confidence planning against blocked context manifests", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "agent-context-blocked-"));
    try {
      const bin = path.join(dir, "fake-context.js");
      await writeFakeContextBin(bin, "missing");
      const manifestPath = path.join(dir, "context-manifest.json");
      const manifest = await agentContextManifestCommand(dir, "planner repair", { contextBin: bin, outPath: manifestPath });
      const portfolio = await agentPlanV2Command("Improve research pipeline reliability", { contextManifestPath: manifestPath, repo: dir });
      const forcedHighConfidence = {
        ...portfolio.candidates[0],
        confidence: 0.91,
        contextQuality: {
          ...(portfolio.candidates[0]?.contextQuality ?? {}),
          status: "blocked",
          score: manifest.score,
          freshness: manifest.freshness,
          relevanceScore: manifest.relevanceScore,
          contradictionRisk: manifest.contradictionRisk,
          coverage: manifest.coverage,
        },
      };
      const planPath = path.join(dir, "bad-context-plan.json");
      await writeFile(planPath, JSON.stringify(forcedHighConfidence, null, 2));

      const critique = await agentPlanCriticCommand(planPath);

      expect(manifest.status).toBe("blocked");
      expect(portfolio.contextManifestId).toBe(manifest.contextPackId);
      expect(portfolio.candidates[0]?.confidence).toBeLessThan(0.75);
      expect(critique.status).toBe("blocked");
      expect(critique.issues.map(issue => issue.code)).toEqual(expect.arrayContaining(["CONTEXT_MANIFEST_BLOCKED", "HIGH_CONFIDENCE_WITH_WEAK_CONTEXT"]));
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("emits plan candidates, critiques plans, replans, and diffs changes", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "agent-plan-"));
    try {
      const plan = await agentPlanV2Command("Improve research pipeline reliability");
      const planPath = path.join(dir, "plan.json");
      await writeFile(planPath, renderAgentPlanPortfolioJson(plan));

      const critique = await agentPlanCriticCommand(planPath);
      const replanned = await agentReplanCommand(planPath, "failure: validator failed but evidence remains valid");
      const afterPath = path.join(dir, "after.json");
      await writeFile(afterPath, JSON.stringify(replanned.after, null, 2));
      const diff = await agentPlanDiffCommand(planPath, afterPath);
      const gateReplan = await agentReplanCommand(planPath, JSON.stringify({
        schemaVersion: 1,
        stageGate: {
          target: "analysis",
          status: "blocked",
          missingRequiredStages: ["approval", "data-quality"],
          nextAction: "Complete required stages before analysis: approval, data-quality.",
        },
      }));

      expect(plan.candidates.length).toBe(3);
      expect(plan.selectedCandidateId).toBeTruthy();
      expect(plan.candidates[0]?.capabilitiesUsed?.some(command => command.includes("agent"))).toBe(true);
      expect(plan.candidates.flatMap(candidate => candidate.steps.map(step => step.mode))).toEqual(expect.arrayContaining(["exploratory", "review_gate", "executable"]));
      expect(critique.status).toBe("pass");
      expect(replanned.preservedEvidence.length).toBeGreaterThan(0);
      expect(diff.addedSteps).toContain(`step-${replanned.before.steps.length + 1}`);
      expect(diff.changedEvidenceRequirements.length).toBeGreaterThan(0);
      expect(diff.confidenceDelta).toBeLessThan(0);
      expect(gateReplan.event.kind).toBe("verification_result");
      expect(gateReplan.event.detail).toContain("approval, data-quality");
      expect(gateReplan.after.steps.map(step => step.title)).toEqual(expect.arrayContaining([
        "Complete missing research gate: approval",
        "Complete missing research gate: data-quality",
      ]));
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("maintains resumable plan state with evidence, invalidation, confidence timeline, and state diffs", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "agent-plan-state-"));
    try {
      const portfolio = await agentPlanV2Command("Run a reproducible research packet");
      const planPath = path.join(dir, "portfolio.json");
      const statePath = path.join(dir, "state.json");
      const completedPath = path.join(dir, "completed.json");
      const invalidatedPath = path.join(dir, "invalidated.json");
      const replannedPath = path.join(dir, "replanned.json");
      await writeFile(planPath, renderAgentPlanPortfolioJson(portfolio));

      const state = await agentPlanStateCreateCommand(planPath, { outPath: statePath });
      const firstEvidence = state.steps[0]!.expectedEvidence[0]!;
      const completed = await agentPlanStateEventCommand(statePath, JSON.stringify({
        type: "step_completed",
        targetStepId: state.steps[0]!.id,
        evidenceRefs: [firstEvidence],
        detail: "Context preflight completed.",
      }), { outPath: completedPath });
      const invalidated = await agentPlanStateEventCommand(completedPath, JSON.stringify({
        type: "context_changed",
        evidenceRefs: [firstEvidence],
        invalidatesEvidence: true,
        confidenceDelta: -0.2,
        detail: "Context pack became stale after file changes.",
      }), { outPath: invalidatedPath });
      const replanned = await agentPlanStateReplanCommand(completedPath, "failure: report QA failed but completed context evidence remains valid", { outPath: replannedPath });
      const resumed = await agentPlanStateResumeCommand(replannedPath);
      const diff = await agentPlanDiffCommand(completedPath, replannedPath);
      const invalidatedCritique = await agentPlanCriticCommand(invalidatedPath);

      expect(state.currentStatus).toBe("draft");
      expect(state.evidenceRequirements.length).toBe(portfolio.candidates[0]?.expectedEvidence.length);
      expect(completed.completedEvidence).toContain(firstEvidence);
      expect(completed.steps[0]?.status).toBe("completed");
      expect(invalidated.completedEvidence).not.toContain(firstEvidence);
      expect(invalidated.invalidatedEvidence).toContain(firstEvidence);
      expect(invalidated.confidenceTimeline.at(-1)?.confidence).toBeLessThan(completed.confidenceTimeline.at(-1)!.confidence);
      expect(replanned.completedEvidence).toContain(firstEvidence);
      expect(replanned.events.at(-1)?.type).toBe("replanned");
      expect(resumed.planId).toBe(replanned.planId);
      expect(diff.addedSteps.length).toBeGreaterThan(0);
      expect(diff.changedAssumptions.length).toBeGreaterThan(0);
      expect(diff.confidenceDelta).toBeLessThan(0);
      expect(invalidatedCritique.status).toBe("blocked");
      expect(invalidatedCritique.issues.map(issue => issue.code)).toEqual(expect.arrayContaining(["PLAN_STATE_NOT_READY", "PLAN_STATE_INVALIDATED_EVIDENCE"]));
      expect(JSON.parse(renderAgentPlanStateJson(replanned)).planState.events.length).toBe(replanned.events.length);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("blocks invalid plan dependencies and unsafe cost assumptions", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "agent-plan-critic-"));
    try {
      const plan = await agentPlanV2Command("Expensive cloud runner");
      const bad = {
        ...plan.candidates[0],
        estimatedCostUsd: 50,
        steps: [{ ...plan.candidates[0]!.steps[0]!, dependsOn: ["missing-step"], command: "curl https://example.com" }],
      };
      const planPath = path.join(dir, "bad-plan.json");
      const rubricPath = path.join(dir, "rubric.json");
      await writeFile(planPath, JSON.stringify(bad, null, 2));
      await writeFile(rubricPath, JSON.stringify({ maxCostUsd: 1, allowedCommands: ["agenteer agent"] }, null, 2));

      const critique = await agentPlanCriticCommand(planPath, rubricPath);

      expect(critique.status).toBe("blocked");
      expect(critique.issues.map(issue => issue.code)).toEqual(expect.arrayContaining(["COST_EXCEEDS_RUBRIC", "IMPOSSIBLE_DEPENDENCY", "COMMAND_NOT_ALLOWED"]));
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("uses typed node contracts to gate planning, IO validation, artifacts, and repair failures", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "agent-node-contract-"));
    try {
      const contractPath = path.join(dir, "node-contract.json");
      const validInputPath = path.join(dir, "input.json");
      const invalidInputPath = path.join(dir, "invalid-input.json");
      const validOutputPath = path.join(dir, "output.json");
      const invalidOutputPath = path.join(dir, "invalid-output.json");
      await writeFile(contractPath, JSON.stringify(makeTestNodeContract(), null, 2));
      await writeFile(validInputPath, JSON.stringify({ packetDir: dir, variables: ["LBXGH"], maxCostUsd: 0 }, null, 2));
      await writeFile(invalidInputPath, JSON.stringify({ variables: [] }, null, 2));
      await writeFile(validOutputPath, JSON.stringify({ status: "pass", artifacts: ["report.md"], failures: [] }, null, 2));
      await writeFile(invalidOutputPath, JSON.stringify({ status: "maybe" }, null, 2));
      await writeFile(path.join(dir, "report.md"), "verified report");

      const registry = await agentNodeContractsCommand(dir);
      const validation = await agentNodeContractValidateCommand(contractPath);
      const fromManifest = await agentNodeContractCommand(contractPath);
      const invalidInput = await agentNodeIoValidateCommand(contractPath, "input", invalidInputPath);
      const invalidOutput = await agentNodeIoValidateCommand(contractPath, "output", invalidOutputPath);
      const record = await agentNodeOutputRecordCommand(contractPath, validInputPath, validOutputPath, { artifactBaseDir: dir });
      const badRecord = await agentNodeOutputRecordCommand(contractPath, validInputPath, invalidOutputPath, { artifactBaseDir: dir });
      const portfolio = await agentPlanV2Command("Run a survey-aware research packet", { nodeContractDir: dir, repo: dir });

      expect(registry.contracts.map(contract => contract.nodeId)).toContain("@agenteer/node-test-survey-scout");
      expect(validation.status).toBe("pass");
      expect(fromManifest.contract.nodeId).toBe("@agenteer/node-test-survey-scout");
      expect(JSON.parse(renderAgentNodeContractValidationJson(validation)).nodeContractValidation.contract.nodeId).toBe("@agenteer/node-test-survey-scout");
      expect(invalidInput.status).toBe("fail");
      expect(invalidInput.typedFailures.map(failure => failure.code)).toContain("NODE_INPUT_INVALID");
      expect(invalidOutput.status).toBe("fail");
      expect(record.status).toBe("passed");
      expect(record.artifactRecords[0]?.exists).toBe(true);
      expect(badRecord.status).toBe("failed");
      expect(badRecord.typedFailures.map(failure => failure.code)).toContain("NODE_OUTPUT_INVALID");
      expect(JSON.parse(renderAgentNodeExecutionRecordJson(record)).nodeExecutionRecord.provenance.contractHash).toBeTruthy();
      expect(portfolio.nodeContracts.map(contract => contract.nodeId)).toContain("@agenteer/node-test-survey-scout");
      expect(portfolio.candidates[0]?.capabilitiesUsed?.some(capability => capability.includes("@agenteer/node-test-survey-scout"))).toBe(true);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("blocks unknown executable nodes while allowing reviewed node proposals", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "agent-node-plan-critic-"));
    try {
      await writeFile(path.join(dir, "node-contract.json"), JSON.stringify(makeTestNodeContract(), null, 2));
      const plan = await agentPlanV2Command("Execute a known node contract", { nodeContractDir: dir, repo: dir });
      const unknown = {
        ...plan.candidates[0],
        steps: [{
          ...plan.candidates[0]!.steps[0]!,
          mode: "executable",
          manifestId: "@agenteer/node-missing",
          contractId: "@agenteer/node-missing",
          command: undefined,
        }],
      };
      const proposed = {
        ...unknown,
        steps: [{ ...unknown.steps[0], nodeProposal: "node-proposal:@agenteer/node-missing" }],
      };
      const known = {
        ...unknown,
        steps: [{ ...unknown.steps[0], manifestId: "@agenteer/node-test-survey-scout", contractId: "@agenteer/node-test-survey-scout" }],
      };
      const unknownPath = path.join(dir, "unknown-plan.json");
      const proposedPath = path.join(dir, "proposed-plan.json");
      const knownPath = path.join(dir, "known-plan.json");
      await writeFile(unknownPath, JSON.stringify(unknown, null, 2));
      await writeFile(proposedPath, JSON.stringify(proposed, null, 2));
      await writeFile(knownPath, JSON.stringify(known, null, 2));

      const unknownCritique = await agentPlanCriticCommand(unknownPath, undefined, { nodeContractDir: dir, repo: dir });
      const proposedCritique = await agentPlanCriticCommand(proposedPath, undefined, { nodeContractDir: dir, repo: dir });
      const knownCritique = await agentPlanCriticCommand(knownPath, undefined, { nodeContractDir: dir, repo: dir });

      expect(unknownCritique.status).toBe("blocked");
      expect(unknownCritique.issues.map(issue => issue.code)).toContain("UNKNOWN_NODE_CONTRACT");
      expect(proposedCritique.issues.map(issue => issue.code)).not.toContain("UNKNOWN_NODE_CONTRACT");
      expect(knownCritique.status).toBe("pass");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("blocks execution plans that rely only on weak or rejected source-ranked inputs", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "agent-plan-weak-sources-"));
    try {
      const intake = await agentResearchIntakeCommand("agent workflow trend", { web: true, x: true, papers: true });
      const sourcesPath = path.join(dir, "sources.json");
      await writeFile(sourcesPath, renderAgentResearchIntakeJson(intake));
      const rank = await agentSourceRankCommand(sourcesPath);
      const rankPath = path.join(dir, "rank.json");
      await writeFile(rankPath, renderAgentSourceRankJson(rank));
      const plan = await agentPlanV2Command("Use weak X signals and local creativity to implement a new workflow node");
      const planPath = path.join(dir, "plan.json");
      await writeFile(planPath, renderAgentPlanPortfolioJson(plan));

      const critique = await agentPlanCriticCommand(planPath, rankPath);

      expect(critique.status).toBe("blocked");
      expect(critique.issues.map(issue => issue.code)).toContain("WEAK_SIGNAL_EXECUTION_GUARD");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("standardizes repair-run with actual patch provenance", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "agent-repair-"));
    try {
      await writeFile(path.join(dir, "subject.js"), "throw new Error('broken')\n");
      await writeFile(path.join(dir, "agenteer.repair.json"), JSON.stringify({
        repairs: [{
          match: "broken",
          file: "subject.js",
          replace: "throw new Error('broken')",
          with: "console.log('fixed')",
          reason: "replace failing throw with executable success",
        }],
      }, null, 2));
      const passed = await agentRepairRunCommand(dir, "node -e \"process.exit(0)\"");
      const repaired = await agentRepairRunCommand(dir, "node subject.js", { maxAttempts: 3 });
      const repeated = await agentRepairRunCommand(dir, "node -e \"console.error('test failed'); process.exit(1)\"", { maxAttempts: 3 });
      const semanticArtifact = path.join(dir, "qa.txt");
      await writeFile(semanticArtifact, "semantic claim failure");
      const semantic = await agentRepairRunCommand(dir, "qa.txt", { maxAttempts: 3 });
      const analysisSpecPath = path.join(dir, "analysis-spec.json");
      await writeFile(analysisSpecPath, JSON.stringify({ dataset: "nhanes", variables: ["LBXGH"] }, null, 2));
      const runPath = path.join(dir, "repair-run.json");
      await writeFile(runPath, renderAgentRepairRunJson(repaired));
      const provenance = await agentRepairProvenanceCommand(runPath);
      const repairedWithSpec = await agentRepairRunCommand(dir, "node -e \"process.exit(0)\"", { analysisSpecPath });

      expect(repaired.schemaVersion).toBe(1);
      expect(repaired.repairRunId).toMatch(/^repair_/);
      expect(passed.finalStatus).toBe("passed");
      expect(repaired.finalStatus).toBe("passed");
      expect(repaired.attempts[0]?.changedFiles).toContain("subject.js");
      expect(repaired.attempts[0]?.patchProvenance[0]?.changedFile).toBe("subject.js");
      expect(repaired.attempts[0]?.patchProvenance[0]?.beforeHash).not.toBe(repaired.attempts[0]?.patchProvenance[0]?.afterHash);
      expect(repaired.attempts[0]?.patchProvenance[0]?.diffHash).toBeTruthy();
      expect(repaired.attempts[0]?.diffHash).toBeTruthy();
      expect(repeated.stoppingReason).toBe("repeated_failure");
      expect(semantic.stoppingReason).toBe("methodological_or_semantic");
      expect(semantic.attempts[0]?.changedFiles).toEqual([]);
      expect(provenance.repairRunId).toBe(repaired.repairRunId);
      expect(provenance.patchProvenance[0]?.validatorEvidenceHash).toBe(repaired.attempts[0]?.inputFailure.validatorEvidenceHash);
      expect(repairedWithSpec.analysisSpecHash).toBeTruthy();
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("blocks repair attempts that escape the bundle or exceed risk boundaries", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "agent-repair-boundary-"));
    try {
      await writeFile(path.join(dir, "subject.js"), "throw new Error('broken')\n");
      await writeFile(path.join(dir, "agenteer.repair.json"), JSON.stringify({
        repairs: [{
          match: "broken",
          file: "../outside.js",
          create: "console.log('escape')",
          reason: "attempt to write outside the bundle",
        }],
      }, null, 2));

      const escaped = await agentRepairRunCommand(dir, "node subject.js", { maxAttempts: 2 });

      await writeFile(path.join(dir, "agenteer.repair.json"), JSON.stringify({
        repairs: [{
          match: "broken",
          file: "subject.js",
          replace: "throw new Error('broken')",
          with: "console.log('fixed')",
          reason: "valid repair but disallowed by allowlist",
        }],
      }, null, 2));
      const disallowed = await agentRepairRunCommand(dir, "node subject.js", { maxAttempts: 2, allowedFiles: ["allowed.js"] });

      await writeFile(path.join(dir, "subject.js"), "throw new Error('broken')\n");
      await writeFile(path.join(dir, "agenteer.repair.json"), JSON.stringify({
        repairs: [
          { match: "broken", file: "subject.js", replace: "throw new Error('broken')", with: "console.log('fixed')", reason: "fix subject" },
          { match: "broken", file: "extra.js", create: "console.log('extra')", reason: "create extra artifact" },
        ],
      }, null, 2));
      const risky = await agentRepairRunCommand(dir, "node subject.js", { maxAttempts: 2, maxRiskScore: 0.1 });

      expect(escaped.finalStatus).toBe("stopped");
      expect(escaped.stoppingReason).toBe("out_of_bundle");
      expect(escaped.attempts[0]?.failureClass).toBe("boundary");
      expect(escaped.attempts[0]?.patchSummary).toContain("escapes bundle");
      expect(disallowed.finalStatus).toBe("stopped");
      expect(disallowed.stoppingReason).toBe("out_of_bundle");
      expect(disallowed.attempts[0]?.patchSummary).toContain("outside allowed files");
      expect(risky.finalStatus).toBe("stopped");
      expect(risky.stoppingReason).toBe("cost_or_risk_boundary");
      expect(risky.attempts[0]?.changedFiles).toEqual(expect.arrayContaining(["extra.js", "subject.js"]));
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("ranks sources, synthesizes creative ideas, evolves them, and funds a research market", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "agent-creativity-"));
    try {
      const intake = await agentResearchIntakeCommand("agent memory", { web: true, x: true, papers: true });
      const sourcesPath = path.join(dir, "sources.json");
      await writeFile(sourcesPath, renderAgentResearchIntakeJson(intake));
      const rank = await agentSourceRankCommand(sourcesPath);
      const rankPath = path.join(dir, "rank.json");
      await writeFile(rankPath, renderAgentSourceRankJson(rank));
      const synthesis = await agentCreativitySynthCommand(rankPath, "Improve planning");
      const ideasPath = path.join(dir, "ideas.json");
      await writeFile(ideasPath, renderAgentCreativitySynthesisJson(synthesis));
      const critique = await agentCriticCommand(ideasPath, rankPath, "cold");
      const evolved = await agentIdeaEvolveCommand(ideasPath, 2);
      const evolvedPath = path.join(dir, "evolved.json");
      await writeFile(evolvedPath, renderAgentIdeaEvolutionJson(evolved));
      const market = await agentResearchMarketCommand(evolvedPath, 0);

      expect(rank.ranked.find(source => source.sourceType === "x")?.use).toBe("weak_signal");
      expect(rank.ranked.find(source => source.sourceType === "paper")?.use).not.toBe("anchor");
      expect(synthesis.ideas.some(idea => idea.sourceAnalogies.includes("compiler optimization"))).toBe(true);
      expect(synthesis.ideas.some(idea => idea.tail)).toBe(true);
      expect(critique.issues.map(issue => issue.code)).toContain("NO_USABLE_SOURCE_ANCHOR");
      expect(evolved.promoted.length).toBe(3);
      expect(market.funded.length).toBeGreaterThan(0);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("runs bounded evolutionary improvement selection against benchmark deltas", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "agent-improvement-run-"));
    try {
      const intake = await agentResearchIntakeCommand("golden packet evaluator", { web: true, papers: true });
      const sourcesPath = path.join(dir, "sources.json");
      await writeFile(sourcesPath, renderAgentResearchIntakeJson(intake));
      const rank = await agentSourceRankCommand(sourcesPath);
      const rankPath = path.join(dir, "rank.json");
      await writeFile(rankPath, renderAgentSourceRankJson(rank));
      const synthesis = await agentCreativitySynthCommand(rankPath, "Improve benchmark-gated self-improvement");
      const ideasPath = path.join(dir, "ideas.json");
      await writeFile(ideasPath, renderAgentCreativitySynthesisJson(synthesis));
      const candidatesPath = path.join(dir, "improvement-candidates.json");
      const candidates = await agentImprovementCandidatesCommand({
        goal: "Improve benchmark-gated self-improvement",
        ideasPath,
        benchmarkTarget: "golden-suite.json",
        outPath: candidatesPath,
      });
      const beforePath = path.join(dir, "before-score.json");
      const afterPath = path.join(dir, "after-score.json");
      await writeBenchmarkScore(beforePath, 0.72, "needs_revision", 2, 1);
      await writeBenchmarkScore(afterPath, 0.84, "pass", 0, 0);
      const runPath = path.join(dir, "improvement-run.json");
      const run = await agentImprovementRunCommand({
        candidatesPath,
        benchmarkBeforePath: beforePath,
        benchmarkAfterPath: afterPath,
        budgetUsd: 10,
        outPath: runPath,
      });

      expect(candidates.length).toBeGreaterThan(3);
      expect(candidates.every(candidate => candidate.parentIds.length > 0)).toBe(true);
      expect(candidates.map(candidate => candidate.mutationType)).toEqual(expect.arrayContaining(["benchmark_case", "failure_classifier", "typed_contract_replacement", "tail_analogy"]));
      expect(run.scoreDelta).toBeGreaterThan(0);
      expect(run.riskDelta).toBeLessThan(0);
      expect(run.promoted.length).toBeGreaterThan(0);
      expect(run.rejected.every(candidate => candidate.reason.length > 0)).toBe(true);
      expect(run.selectedCandidateIds).toEqual(run.promoted.map(item => item.candidate.candidateId));
      expect(JSON.parse(renderAgentImprovementCandidatesJson(candidates)).improvementCandidates.length).toBe(candidates.length);
      expect(JSON.parse(renderAgentImprovementRunJson(run)).improvementRun.promoted.length).toBe(run.promoted.length);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("rejects or queues evolutionary candidates without benchmark gain, tests, or budget", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "agent-improvement-reject-"));
    try {
      const candidates = await agentImprovementCandidatesCommand({ goal: "Tighten repair provenance" });
      const candidatesPath = path.join(dir, "candidates.json");
      const beforePath = path.join(dir, "before.json");
      const neutralAfterPath = path.join(dir, "neutral-after.json");
      const improvedAfterPath = path.join(dir, "improved-after.json");
      const failedAfterPath = path.join(dir, "failed-after.json");
      const rejectedDir = path.join(dir, "rejected");
      await writeFile(candidatesPath, renderAgentImprovementCandidatesJson(candidates));
      await writeBenchmarkScore(beforePath, 0.8, "pass", 0, 0);
      await writeBenchmarkScore(neutralAfterPath, 0.8, "pass", 0, 0);
      await writeBenchmarkScore(improvedAfterPath, 0.9, "pass", 0, 0);
      await writeBenchmarkScore(failedAfterPath, 0.9, "fail", 1, 1);

      const noGain = await agentImprovementRunCommand({
        candidatesPath,
        benchmarkBeforePath: beforePath,
        benchmarkAfterPath: neutralAfterPath,
        budgetUsd: 10,
        rejectedDir,
      });
      const failedTests = await agentImprovementRunCommand({
        candidatesPath,
        benchmarkBeforePath: beforePath,
        benchmarkAfterPath: improvedAfterPath,
        budgetUsd: 10,
        testsPassed: false,
      });
      const noBudget = await agentImprovementRunCommand({
        candidatesPath,
        benchmarkBeforePath: beforePath,
        benchmarkAfterPath: improvedAfterPath,
        budgetUsd: 0,
      });
      const override = await agentImprovementRunCommand({
        candidatesPath,
        benchmarkBeforePath: beforePath,
        benchmarkAfterPath: neutralAfterPath,
        budgetUsd: 10,
        overrideNeutral: true,
        overrideReason: "Risk was manually reduced outside normalized benchmark scoring.",
      });
      const failedAfter = await agentImprovementRunCommand({
        candidatesPath,
        benchmarkBeforePath: beforePath,
        benchmarkAfterPath: failedAfterPath,
        budgetUsd: 10,
      });
      const repeatedCandidates = await agentImprovementCandidatesCommand({
        goal: "Tighten repair provenance",
        rejectedHistoryDir: rejectedDir,
      });
      const rejectedFiles = await readdir(rejectedDir);

      expect(noGain.promoted).toHaveLength(0);
      expect(noGain.rejected.map(candidate => candidate.reason).join("\n")).toContain("no benchmark score gain or risk reduction");
      expect(rejectedFiles.some(file => file.endsWith(".rejected.json"))).toBe(true);
      expect(failedTests.promoted).toHaveLength(0);
      expect(failedTests.rejected.map(candidate => candidate.reason).join("\n")).toContain("relevant tests did not pass");
      expect(noBudget.promoted).toHaveLength(0);
      expect(noBudget.costBoundary.withinBoundary).toBe(false);
      expect(override.promoted.length).toBeGreaterThan(0);
      expect(override.override.used).toBe(true);
      expect(failedAfter.promoted).toHaveLength(0);
      expect([...failedAfter.rejected.map(candidate => candidate.reason), ...failedAfter.queued.flatMap(candidate => candidate.reasons)].join("\n")).toContain("after benchmark did not pass");
      expect(failedAfter.promotionPolicy.requiresPassingBenchmark).toBe(true);
      expect(repeatedCandidates.some(candidate => candidate.priorRejectionCount > 0)).toBe(true);
      expect(repeatedCandidates.find(candidate => candidate.priorRejectionCount > 0)?.priorRejectionReasons.join("\n")).toContain("no benchmark score gain or risk reduction");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("adapts plan portfolios into creativity synthesis sources", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "agent-plan-creativity-"));
    try {
      const portfolio = await agentPlanV2Command("Improve research-agent reflection with evidence checkpoints");
      const planPath = path.join(dir, "plan.json");
      await writeFile(planPath, renderAgentPlanPortfolioJson(portfolio));

      const synthesis = await agentCreativitySynthCommand(planPath, "Generate breakthrough agent workflow improvements");
      const synthesisPath = path.join(dir, "synthesis.json");
      await writeFile(synthesisPath, renderAgentCreativitySynthesisJson(synthesis));
      const critique = await agentCriticCommand(synthesisPath, planPath, "cold");

      expect(synthesis.ideas.length).toBeGreaterThan(0);
      expect(synthesis.ideas.some(idea => idea.lineage.some(item => item.startsWith("official_doc_") || item.startsWith("classic_")))).toBe(true);
      expect(synthesis.nextAction).toContain("idea-evolve");
      expect(critique.status).toBe("needs_revision");
      expect(critique.issues.map(issue => issue.code)).toContain("LOCAL_ONLY_IDEATION");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("generates adversarial protocols, critic reviews, and cognitive-pool consensus", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "agent-critic-"));
    try {
      const protocols = agentAdversarialProtocolsCommand("medical research");
      const artifact = path.join(dir, "artifact.md");
      const rubric = path.join(dir, "rubric.json");
      await writeFile(artifact, "This plan causes better outcomes without tests.");
      await writeFile(rubric, JSON.stringify({ required: ["evidence", "validation"] }, null, 2));

      const critique = await agentCriticCommand(artifact, rubric, "cold");
      const pool = await agentCognitivePoolCommand(artifact);

      expect(protocols.protocols.map(item => item.id)).toContain("causal-wording-trap");
      expect(critique.status).toBe("blocked");
      expect(renderAgentCritique(critique)).toContain("UNSUPPORTED_CLAIM");
      expect(pool.reviews.length).toBe(5);
      expect(pool.consensus).toBe("blocked");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("scores context immunity and creates dream proposals from history", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "agent-tail-"));
    try {
      await writeFile(path.join(dir, "good.md"), "verified pass evidence used cycle");
      await writeFile(path.join(dir, "bad.md"), "stale contradiction failed obsolete");

      const immune = await agentContextImmuneCheckCommand(dir);
      const dream = await agentDreamCommand(dir);

      expect(immune.items.find(item => item.id === "good.md")?.action).toBe("keep");
      expect(immune.items.find(item => item.id === "bad.md")?.action).not.toBe("keep");
      expect(dream.proposals.length).toBe(3);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("distills execution memory guards from repeated history artifacts", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "agent-execution-memory-"));
    try {
      await mkdir(path.join(dir, "cycle-1"), { recursive: true });
      await mkdir(path.join(dir, "cycle-2"), { recursive: true });
      await writeFile(path.join(dir, "cycle-1", "agent-record.json"), JSON.stringify({ agentRecord: { observation: "stage-gate blocked analysis because approval and data-quality were missing" } }, null, 2));
      await writeFile(path.join(dir, "cycle-2", "replan.json"), JSON.stringify({ replan: { event: { detail: "missing required stages: approval, data-quality" } } }, null, 2));

      const memory = await agentExecutionMemoryCommand(dir);
      const memoryPath = path.join(dir, "execution-memory.json");
      await writeFile(memoryPath, JSON.stringify({ executionMemory: memory }, null, 2));
      const plan = await agentPlanV2Command("Avoid repeated stage-gate failures", { contextPackPath: memoryPath });

      expect(memory.repeatedThemes.find(theme => theme.theme === "stage-gate")?.count).toBe(2);
      expect(memory.retryGuards).toContain("Run stage-gate before executable analysis and replan missing gates explicitly.");
      expect(plan.candidates[0]?.assumptions).toContain("Execution memory guard: Run stage-gate before executable analysis and replan missing gates explicitly.");
      expect(renderAgentExecutionMemory(memory)).toContain("agent execution memory");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("evaluates reliability decay, denoises risky context, and retrieves valid trajectory actions", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "agent-reliability-"));
    try {
      const runs = [
        { taskId: "a", durationBucket: "short", domain: "research", attempt: 1, status: "pass" },
        { taskId: "a", durationBucket: "short", domain: "research", attempt: 2, status: "pass" },
        { taskId: "b", durationBucket: "medium", domain: "research", attempt: 1, status: "pass" },
        { taskId: "b", durationBucket: "medium", domain: "research", attempt: 2, status: "fail" },
        { taskId: "c", durationBucket: "long", domain: "research", attempt: 1, status: "fail" },
        { taskId: "c", durationBucket: "long", domain: "research", attempt: 2, status: "meltdown" },
        { taskId: "d", durationBucket: "long", domain: "research", attempt: 1, status: "meltdown" },
      ];
      const runsPath = path.join(dir, "runs.json");
      await writeFile(runsPath, JSON.stringify({ runs }, null, 2));
      const reliability = await agentReliabilityEvalCommand(runsPath);

      const contextPath = path.join(dir, "context.md");
      await writeFile(contextPath, "failed attempt with incorrect patch and repeated_failure\nverified lesson: run claim guard");
      const denoised = await agentContextDenoiseCommand(contextPath);

      const trajectoryPath = path.join(dir, "trajectory.json");
      await writeFile(trajectoryPath, JSON.stringify({
        trajectories: [
          { id: "bad", state: "stale context failed plan", action: "skip-verification", reward: -2, outcome: "failure" },
          { id: "good", state: "stale context before plan", action: "run-context-denoise", reward: 2, outcome: "success" },
        ],
      }, null, 2));
      const policy = await agentTrajectoryPolicyCommand(trajectoryPath, "stale context before planner", ["run-context-denoise"]);

      expect(reliability.metrics.meltdownOnsetPoint).toBe("long");
      expect(reliability.issues.map(issue => issue.code)).toContain("MELTDOWN_ONSET");
      expect(denoised.quarantined).toBe(1);
      expect(denoised.denoisedText).toContain("QUARANTINED");
      expect(policy.recommendedAction).toBe("run-context-denoise");
      expect(policy.ranked[0]?.valid).toBe(true);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("maps node contracts to capability declarations and blocks unsafe task envelopes", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "agent-interop-capability-"));
    try {
      const contract = makeTestNodeContract() as Record<string, unknown>;
      contract.permissions = { requiredActions: ["fs.write", "network.fetch"], dynamicActions: false, dynamicActionSpec: null };
      contract.costBoundary = { maxUsd: 2, maxRuntimeSeconds: 60, cloudAllowed: false };
      const contractPath = path.join(dir, "node-contract.json");
      const capabilityPath = path.join(dir, "capability.json");
      const taskPath = path.join(dir, "task.json");
      await writeFile(contractPath, JSON.stringify(contract, null, 2));

      const capability = await agentCapabilityFromContractCommand(contractPath, { outPath: capabilityPath });
      const capabilityValidation = await agentCapabilityValidateCommand(capabilityPath);
      const task = await agentTaskCreateCommand({
        goal: "Run public-health cohort scout",
        requester: "tester",
        capabilities: [capability.capabilityId],
        deniedActions: ["fs.write"],
        maxUsd: 0,
        outPath: taskPath,
      });
      const taskValidation = await agentTaskValidateCommand(taskPath, { capabilityPaths: [capabilityPath] });

      expect(capability.capabilityId).toBe("@agenteer/node-test-survey-scout");
      expect(capability.permissionsRequired).toEqual(["fs.write", "network.fetch"]);
      expect(capabilityValidation.status).toBe("pass");
      expect(task.capabilitiesRequired).toContain(capability.capabilityId);
      expect(taskValidation.status).toBe("blocked");
      expect(taskValidation.issues.map(issue => issue.code)).toEqual(expect.arrayContaining([
        "PERMISSION_EXPLICITLY_DENIED",
        "PERMISSION_NOT_ALLOWED",
        "NETWORK_NOT_ALLOWED",
        "WRITE_ROOT_MISSING",
        "CAPABILITY_COST_EXCEEDS_TASK",
      ]));
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("verifies evidence receipt hashes and lifecycle transitions", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "agent-interop-evidence-"));
    try {
      const artifactPath = path.join(dir, "report.md");
      const receiptPath = path.join(dir, "receipt.json");
      const taskPath = path.join(dir, "task.json");
      const queuedPath = path.join(dir, "task-queued.json");
      const runningPath = path.join(dir, "task-running.json");
      const succeededPath = path.join(dir, "task-succeeded.json");
      await writeFile(artifactPath, "verified analysis artifact\n");

      const receipt = await agentEvidenceReceiptCommand({
        artifact: artifactPath,
        producedBy: "@agenteer/node-test-survey-scout",
        validator: "vitest",
        status: "pass",
        outPath: receiptPath,
      });
      const task = await agentTaskCreateCommand({
        goal: "Publish reproducible packet",
        requester: "tester",
        capabilities: [],
        artifacts: [artifactPath],
        outPath: taskPath,
      });
      const invalid = await agentTaskTransitionCommand(taskPath, "running");
      const queued = await agentTaskTransitionCommand(taskPath, "queued", { outPath: queuedPath });
      const running = await agentTaskTransitionCommand(queuedPath, "running", { outPath: runningPath });
      const succeeded = await agentTaskTransitionCommand(runningPath, "succeeded", { evidencePaths: [receiptPath], outPath: succeededPath });
      const valid = await agentTaskValidateCommand(succeededPath);
      await writeFile(artifactPath, "tampered analysis artifact\n");
      const tampered = await agentTaskValidateCommand(succeededPath);

      expect(receipt.hash).toMatch(/^[a-f0-9]{64}$/);
      expect(JSON.parse(renderAgentEvidenceReceiptJson(receipt)).evidenceReceipt.receiptId).toBe(receipt.receiptId);
      expect(task.status).toBe("created");
      expect(invalid.allowed).toBe(false);
      expect(invalid.issues.map(issue => issue.code)).toContain("INVALID_STATUS_TRANSITION");
      expect(queued.allowed).toBe(true);
      expect(running.allowed).toBe(true);
      expect(succeeded.allowed).toBe(true);
      expect(succeeded.taskEnvelope.status).toBe("succeeded");
      expect(valid.status).toBe("pass");
      expect(tampered.status).toBe("blocked");
      expect(tampered.issues.map(issue => issue.code)).toContain("RECEIPT_HASH_MISMATCH");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("exports task envelopes into MCP and A2A shaped payloads without losing receipts", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "agent-interop-export-"));
    try {
      const artifactPath = path.join(dir, "artifact.json");
      const receiptPath = path.join(dir, "receipt.json");
      const taskPath = path.join(dir, "task.json");
      const donePath = path.join(dir, "task-done.json");
      await writeFile(artifactPath, JSON.stringify({ status: "pass" }, null, 2));
      const receipt = await agentEvidenceReceiptCommand({ artifact: artifactPath, producedBy: "tester", validator: "hash", status: "pass", outPath: receiptPath });
      const task = await agentTaskCreateCommand({
        goal: "Interop export test",
        requester: "tester",
        capabilities: ["capability.alpha"],
        inputs: [JSON.stringify({ packet: "golden" })],
        artifacts: [artifactPath],
        allowedActions: ["*"],
        maxUsd: 0,
        outPath: taskPath,
      });
      await agentTaskTransitionCommand(taskPath, "queued", { outPath: taskPath });
      await agentTaskTransitionCommand(taskPath, "running", { outPath: taskPath });
      await agentTaskTransitionCommand(taskPath, "succeeded", { evidencePaths: [receiptPath], outPath: donePath });

      const mcp = await agentTaskExportCommand(donePath, "mcp");
      const a2a = await agentTaskExportCommand(donePath, "a2a");
      const local = await agentTaskExportCommand(donePath, "local");
      const localParsed = JSON.parse(renderAgentTaskEnvelopeJson(task)).taskEnvelope as { taskId: string };

      expect(localParsed.taskId).toBe(task.taskId);
      expect(mcp.evidenceReceipts).toHaveLength(1);
      expect(a2a.evidenceReceipts[0]?.receiptId).toBe(receipt.receiptId);
      expect(JSON.stringify(mcp.payload)).toContain("capability.alpha");
      expect(JSON.stringify(a2a.payload)).toContain("Interop export test");
      expect(JSON.stringify(local.payload)).toContain(task.taskId);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

async function writeFakeContextBin(file: string, statusState = "fresh"): Promise<void> {
  await writeFile(file, `#!/usr/bin/env node
const [cmd] = process.argv.slice(2);
if (cmd === "status") console.log(JSON.stringify({ scopes: [{ scope: ".", state: "${statusState}" }] }));
else if (cmd === "pack") console.log(JSON.stringify({ seed: { kind: "query", value: "planner repair" }, scopes: [{ scope: ".", score: 1 }] }));
else if (cmd === "impact") console.log(JSON.stringify({ target: process.argv[3], affected: ["packages/cli/src/index.ts"] }));
else if (cmd === "verify") console.log(JSON.stringify({ status: "passed", checks: [] }));
else { console.error("unknown fake context command"); process.exit(2); }
`);
  await chmod(file, 0o755);
}

async function writeBenchmarkScore(file: string, normalizedScore: number, status: string, issueCount: number, blockerCount: number): Promise<void> {
  await writeFile(file, JSON.stringify({
    schemaVersion: 1,
    benchmarkScore: {
      status,
      normalizedScore,
      issueCount,
      riskScore: Math.max(0, 1 - normalizedScore + blockerCount * 0.1),
      issues: Array.from({ length: issueCount }, (_, index) => ({
        severity: index < blockerCount ? "blocker" : "warning",
        code: `ISSUE_${index + 1}`,
        message: "Synthetic benchmark issue for evolutionary tests.",
      })),
      summary: `${status} score=${normalizedScore}`,
    },
  }, null, 2));
}

function makeTestNodeContract(): unknown {
  return {
    schemaVersion: 1,
    nodeId: "@agenteer/node-test-survey-scout",
    displayName: "Test survey scout",
    domain: "research",
    inputSchema: {
      type: "object",
      required: ["packetDir", "variables", "maxCostUsd"],
      properties: {
        packetDir: { type: "string", minLength: 1 },
        variables: { type: "array", items: { type: "string", minLength: 1 } },
        maxCostUsd: { type: "number", maximum: 0 },
      },
    },
    outputSchema: {
      type: "object",
      required: ["status", "artifacts", "failures"],
      properties: {
        status: { type: "string", enum: ["pass", "fail"] },
        artifacts: { type: "array", items: { type: "string" } },
        failures: { type: "array", items: { type: "string" } },
      },
    },
    artifactEffects: [{
      id: "report",
      kind: "write",
      pathTemplate: "report.md",
      required: true,
      description: "Research report emitted by the node.",
    }],
    failureTypes: [
      { code: "NODE_INPUT_INVALID", severity: "blocker", category: "execution", retryable: false, repairAction: "Repair upstream packet input.", description: "Input schema failed." },
      { code: "NODE_OUTPUT_INVALID", severity: "blocker", category: "execution", retryable: true, repairAction: "Repair output adapter or implementation.", description: "Output schema failed." },
      { code: "NODE_ARTIFACT_MISSING", severity: "blocker", category: "execution", retryable: true, repairAction: "Regenerate the required report artifact.", description: "Required artifact missing." },
    ],
    verifier: { kind: "json-schema", inputRequired: true, outputRequired: true, command: null, evidenceRefs: ["schema:survey-scout"] },
    permissions: { requiredActions: [], dynamicActions: false, dynamicActionSpec: null },
    costBoundary: { maxUsd: 0, maxRuntimeSeconds: 30, cloudAllowed: false },
    sideEffects: { writesFs: true, network: false, mutatesCtx: false, emitsCtxVariants: [] },
    stability: { determinism: "deterministic", maturity: "stable" },
    examples: [{
      name: "valid scout",
      input: { packetDir: "/tmp/packet", variables: ["LBXGH"], maxCostUsd: 0 },
      output: { status: "pass", artifacts: ["report.md"], failures: [] },
    }],
  };
}
