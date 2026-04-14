/**
 * M4 meta-node tests:
 *   - parallel_fanout: spawn N → re-enter → merged shape
 *   - cross_check (engine integration via mock providers)
 *   - judge_with_stripped_ctx
 *   - repair_loop (the load-bearing ReplaceMe-first test)
 */

import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  InMemoryContextStore,
  InMemoryNodeRegistry,
  MemoryEvidenceSink,
  Runtime,
  RuntimeEvents,
  type Node,
  type NodeInput,
  type NodeResult,
  asArtifact,
  makeManifest,
} from "@agenteer/core";
import {
  parallelFanoutFactory,
  parallelFanoutManifest,
  judgeWithStrippedCtxFactory,
  judgeWithStrippedCtxManifest,
  repairLoopFactory,
  repairLoopManifest,
  crossCheckFactory,
  crossCheckManifest,
  type ProviderResolver,
} from "../src/index.js";
import type { ProviderLike } from "@agenteer/trust";

function newRuntime() {
  const registry = new InMemoryNodeRegistry();
  const contextStore = new InMemoryContextStore();
  const evidenceSink = new MemoryEvidenceSink();
  const events = new RuntimeEvents();
  const runtime = new Runtime({ registry, contextStore, evidenceSink, events });
  return { runtime, registry, contextStore, evidenceSink, events };
}

// A trivial leaf that echoes its input.value back as Output.value, used
// to give parallel_fanout / repair_loop something to drive.
function echoLeaf(id: string) {
  const manifest = makeManifest({
    id,
    name: "echo",
    description: "echo",
    determinism: "deterministic",
  });
  return {
    manifest,
    factory: () => {
      const node: Node<NodeInput<unknown>, unknown> = {
        manifest,
        ctx: [],
        model: null,
        async execute(input: NodeInput<unknown>): Promise<NodeResult<unknown>> {
          return {
            kind: "output",
            value: input.original,
            evidence: { verdict: "pass" },
          };
        },
      };
      return node;
    },
  };
}

describe("parallel_fanout", () => {
  it("spawns N children and merges via concat (default)", async () => {
    const { runtime, registry } = newRuntime();
    const echo = echoLeaf("@agenteer/node-echo");
    registry.register(echo.manifest, echo.factory);
    registry.register(parallelFanoutManifest, parallelFanoutFactory);

    const outcome = await runtime.run(
      {
        manifest_id: parallelFanoutManifest.id,
        input: {
          manifest_id: echo.manifest.id,
          inputs: [{ n: 1 }, { n: 2 }, { n: 3 }],
        },
        correlation: "r",
      },
      [`spawn:${parallelFanoutManifest.id}`, `spawn:${echo.manifest.id}`],
    );
    expect(outcome.finalStatus).toBe("completed");
    if (outcome.rootResult?.kind !== "output") throw new Error("unreachable");
    const v = outcome.rootResult.value as {
      mode: string;
      children: Array<{ correlation: string; kind: string }>;
      merged: unknown;
    };
    expect(v.mode).toBe("all");
    expect(v.children).toHaveLength(3);
    expect(v.children.every((c) => c.kind === "output")).toBe(true);
    expect(v.merged).toEqual([{ n: 1 }, { n: 2 }, { n: 3 }]);
  });
});

describe("judge_with_stripped_ctx", () => {
  it("spawns the configured judge, parses verdict, and returns chosen candidate", async () => {
    const { runtime, registry } = newRuntime();
    // Mock judge: an LLM-shaped node that returns { value: { verdict, rationale } }.
    const judgeId = "@agenteer/node-mock-judge";
    const judgeManifest = makeManifest({
      id: judgeId,
      name: "mock_judge",
      description: "Returns a fixed verdict for tests",
      determinism: "deterministic",
    });
    registry.register(judgeManifest, () => ({
      manifest: judgeManifest,
      ctx: [],
      model: null,
      async execute(): Promise<NodeResult<{ value: unknown; model: string; method: string }>> {
        return {
          kind: "output",
          value: {
            value: { verdict: "candidate_1", rationale: "candidate 1 is more conservative" },
            model: "mock/judge",
            method: "mock",
          },
          evidence: { verdict: "pass" },
        };
      },
    }));
    registry.register(judgeWithStrippedCtxManifest, judgeWithStrippedCtxFactory);

    const outcome = await runtime.run(
      {
        manifest_id: judgeWithStrippedCtxManifest.id,
        input: {
          claim: "Which patch is correct?",
          candidates: [{ patch: "diff A" }, { patch: "diff B" }],
          judge_manifest_id: judgeId,
        },
        correlation: "r",
      },
      [`spawn:${judgeWithStrippedCtxManifest.id}`, `spawn:${judgeId}`],
    );
    expect(outcome.finalStatus).toBe("completed");
    if (outcome.rootResult?.kind !== "output") throw new Error("unreachable");
    const v = outcome.rootResult.value as { verdict: string; chosen?: { patch: string } };
    expect(v.verdict).toBe("candidate_1");
    expect(v.chosen).toEqual({ patch: "diff B" });
  });
});

describe("repair_loop (ReplaceMe-first)", () => {
  it("retries until validator passes; ReplaceMe drives convergence", async () => {
    const { runtime, registry, evidenceSink } = newRuntime();

    // Target node that returns iter-aware output: input includes
    // prior_iteration; on iteration 0/1 it returns "broken", on 2 "ok".
    const targetId = "@agenteer/node-target-fix";
    const targetManifest = makeManifest({
      id: targetId,
      name: "target",
      description: "improves with each repair iteration",
      determinism: "deterministic",
    });
    registry.register(targetManifest, () => ({
      manifest: targetManifest,
      ctx: [],
      model: null,
      async execute(input: NodeInput<unknown>): Promise<NodeResult<{ text: string; iter: number }>> {
        const orig = input.original as { prior_iteration?: number; seed?: string };
        const iter = (orig.prior_iteration ?? -1) + 1;
        const text = iter >= 2 ? "ok" : "broken";
        return {
          kind: "output",
          value: { text, iter },
          evidence: { verdict: "pass" },
        };
      },
    }));

    // Validator: passes if input.candidate.text === "ok".
    const validatorId = "@agenteer/node-mock-validator";
    const validatorManifest = makeManifest({
      id: validatorId,
      name: "mock_validator",
      description: "checks candidate.text === ok",
      determinism: "deterministic",
    });
    registry.register(validatorManifest, () => ({
      manifest: validatorManifest,
      ctx: [],
      model: null,
      async execute(
        input: NodeInput<{ candidate?: { text?: string } }>,
      ): Promise<NodeResult<{ verdict: "pass" | "fail"; issues: { message: string }[]; summary: string }>> {
        const text = input.original.candidate?.text;
        if (text === "ok") {
          return {
            kind: "output",
            value: { verdict: "pass", issues: [], summary: "looks good" },
            evidence: { verdict: "pass" },
          };
        }
        return {
          kind: "output",
          value: {
            verdict: "fail",
            issues: [{ message: `expected ok, got ${text ?? "<missing>"}` }],
            summary: "not ok yet",
          },
          evidence: { verdict: "fail" },
        };
      },
    }));

    registry.register(repairLoopManifest, repairLoopFactory);

    const outcome = await runtime.run(
      {
        manifest_id: repairLoopManifest.id,
        input: {
          target_manifest_id: targetId,
          target_input: { seed: "x" },
          validator_manifest_id: validatorId,
          max_iterations: 5,
          emit_as: "repair.final",
        },
        correlation: "r",
      },
      [
        `spawn:${repairLoopManifest.id}`,
        `spawn:${targetId}`,
        `spawn:${validatorId}`,
      ],
    );

    expect(outcome.finalStatus).toBe("completed");
    if (outcome.rootResult?.kind !== "output") throw new Error("unreachable");
    const v = outcome.rootResult.value as {
      verdict: string;
      iterations: number;
      final_output: { text: string };
    };
    expect(v.verdict).toBe("pass");
    expect(v.iterations).toBeGreaterThanOrEqual(2);
    expect(v.final_output.text).toBe("ok");
    // ReplaceMe events were emitted during convergence.
    const replaceCount = evidenceSink.records.filter((r) => r.kind === "generic").length;
    expect(replaceCount).toBeGreaterThan(0);
  });

  it("returns verdict=fail (as data) when max_iterations exhausted", async () => {
    const { runtime, registry } = newRuntime();

    const targetId = "@agenteer/node-target-stuck";
    const targetManifest = makeManifest({
      id: targetId,
      name: "stuck_target",
      description: "never converges",
      determinism: "deterministic",
    });
    registry.register(targetManifest, () => ({
      manifest: targetManifest,
      ctx: [],
      model: null,
      async execute(): Promise<NodeResult<{ text: string }>> {
        return {
          kind: "output",
          value: { text: "broken" },
          evidence: { verdict: "pass" },
        };
      },
    }));

    const validatorId = "@agenteer/node-strict-validator";
    const validatorManifest = makeManifest({
      id: validatorId,
      name: "strict",
      description: "always fails",
      determinism: "deterministic",
    });
    registry.register(validatorManifest, () => ({
      manifest: validatorManifest,
      ctx: [],
      model: null,
      async execute(): Promise<NodeResult<{ verdict: "fail"; issues: { message: string }[]; summary: string }>> {
        return {
          kind: "output",
          value: {
            verdict: "fail",
            issues: [{ message: "always fail" }],
            summary: "no",
          },
          evidence: { verdict: "fail" },
        };
      },
    }));

    registry.register(repairLoopManifest, repairLoopFactory);

    const outcome = await runtime.run(
      {
        manifest_id: repairLoopManifest.id,
        input: {
          target_manifest_id: targetId,
          target_input: {},
          validator_manifest_id: validatorId,
          max_iterations: 2,
        },
        correlation: "r",
      },
      [
        `spawn:${repairLoopManifest.id}`,
        `spawn:${targetId}`,
        `spawn:${validatorId}`,
      ],
    );
    expect(outcome.finalStatus).toBe("completed");
    if (outcome.rootResult?.kind !== "output") throw new Error("unreachable");
    const v = outcome.rootResult.value as { verdict: string; iterations: number };
    expect(v.verdict).toBe("fail");
    expect(v.iterations).toBe(2);
  });
});

describe("cross_check (meta over trust.CrossCheckEngine)", () => {
  // Two providers that disagree on the `verdict` field.
  const A: ProviderLike = {
    modelId: "mock/a",
    async generate() {
      return "verdict: pass\nitems:\n  - one";
    },
  };
  const B: ProviderLike = {
    modelId: "mock/b",
    async generate() {
      return "verdict: pass\nitems:\n  - two";
    },
  };

  const resolver: ProviderResolver = {
    resolve(id) {
      if (id === "mock/a") return A;
      if (id === "mock/b") return B;
      return null;
    },
  };

  it("on_disagreement=return_both yields a structured Output", async () => {
    const { runtime, registry } = newRuntime();
    registry.register(crossCheckManifest, crossCheckFactory(resolver, {}));

    const outcome = await runtime.run(
      {
        manifest_id: crossCheckManifest.id,
        input: {
          systemPrompt: "be precise",
          userPrompt: "list two items",
          schemaName: "ItemList",
          primary_model: "mock/a",
          secondary_model: "mock/b",
          on_disagreement: "return_both",
        },
        correlation: "r",
      },
      ["model:mock/a", "model:mock/b"],
    );
    expect(outcome.finalStatus).toBe("completed");
    if (outcome.rootResult?.kind !== "output") throw new Error("unreachable");
    const v = outcome.rootResult.value as { outcome: string; disagreement_keys?: string[] };
    expect(v.outcome).toMatch(/disagreement/);
    expect((v.disagreement_keys ?? []).length).toBeGreaterThan(0);
  });
});
