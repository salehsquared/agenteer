/**
 * M4 integration: planner → repair_loop → validator → evidence chain.
 *
 * The framework's pitch in one flow:
 *   1. `default_planner` returns a plan as DATA + ctx artifact.
 *   2. A driver node reads the plan from ctx and spawns the first step
 *      via `repair_loop`.
 *   3. `repair_loop` iterates target × validator until convergence,
 *      driving progress with `ReplaceMe`.
 *   4. The full trace lives in the evidence store with stable
 *      `lineage_id` across the chain.
 */

import { describe, expect, it } from "vitest";
import {
  InMemoryContextStore,
  InMemoryNodeRegistry,
  MemoryEvidenceSink,
  MockModelProvider,
  Runtime,
  RuntimeEvents,
  makeManifest,
  type Node,
  type NodeInput,
  type NodeResult,
} from "@agenteer/core";
import {
  defaultPlannerFactory,
  defaultPlannerManifest,
  repairLoopFactory,
  repairLoopManifest,
} from "../src/index.js";

describe("M4 integration — planner → repair_loop → validator", () => {
  it("composes 3 nodes end-to-end with stable lineage and ReplaceMe convergence", async () => {
    const registry = new InMemoryNodeRegistry();
    const contextStore = new InMemoryContextStore();
    const evidenceSink = new MemoryEvidenceSink();
    const events = new RuntimeEvents();

    const targetId = "@agenteer/node-it-target";
    const validatorId = "@agenteer/node-it-validator";

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
        const orig = input.original as { prior_iteration?: number };
        const iter = (orig.prior_iteration ?? -1) + 1;
        return {
          kind: "output",
          value: { text: iter >= 1 ? "ok" : "broken", iter },
          evidence: { verdict: "pass" },
        };
      },
    }));

    const validatorManifest = makeManifest({
      id: validatorId,
      name: "checker",
      description: "passes when text === ok",
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
        return text === "ok"
          ? {
              kind: "output",
              value: { verdict: "pass", issues: [], summary: "ok" },
              evidence: { verdict: "pass" },
            }
          : {
              kind: "output",
              value: {
                verdict: "fail",
                issues: [{ message: `expected ok, got ${text ?? "<missing>"}` }],
                summary: "no",
              },
              evidence: { verdict: "fail" },
            };
      },
    }));

    registry.register(repairLoopManifest, repairLoopFactory);
    registry.register(defaultPlannerManifest, defaultPlannerFactory);

    // Driver node that takes the planner's plan from input.children[0]
    // and runs the first step's repair_loop.
    const driverId = "@agenteer/node-it-driver";
    const driverManifest = makeManifest({
      id: driverId,
      name: "driver",
      description: "consume plan; spawn repair_loop on first step",
      determinism: "deterministic",
      required_actions: [
        `spawn:${defaultPlannerManifest.id}`,
        `spawn:${repairLoopManifest.id}`,
        // repair_loop transitively needs to spawn the target + validator;
        // the driver must hold those so its grant covers the descendants.
        `spawn:${targetId}`,
        `spawn:${validatorId}`,
        // Planner uses model:mock/planner; the driver must hold it too.
        "model:mock/planner",
      ],
    });
    registry.register(driverManifest, () => ({
      manifest: driverManifest,
      ctx: [],
      model: null,
      async execute(
        input: NodeInput<{ goal: string }>,
      ): Promise<NodeResult<{ verdict: string; iterations: number }>> {
        if (!input.children) {
          return {
            kind: "spawn_children",
            join: { mode: "all" },
            children: [
              {
                manifest_id: defaultPlannerManifest.id,
                input: {
                  goal: input.original.goal,
                  available_manifests: [
                    {
                      id: targetId,
                      name: "target",
                      description: "produces text iteratively",
                      required_actions: [],
                    },
                  ],
                  model_id: "mock/planner",
                  emit_as: "plan.head",
                },
                correlation: "planner",
              },
            ],
          };
        }
        const planChild = input.children.find((c) => c.correlation === "planner");
        const repairChild = input.children.find((c) => c.correlation === "repair");
        if (!planChild || planChild.result.kind !== "output") {
          return { kind: "failed", reason: "planner failed", retryable: false };
        }
        if (!repairChild) {
          // Spawn repair_loop based on the plan's first step.
          const planValue = planChild.result as { value: { plan: { steps: { manifest_id: string; input: unknown }[] } } };
          const step = planValue.value.plan.steps[0]!;
          return {
            kind: "spawn_children",
            join: { mode: "all" },
            children: [
              {
                manifest_id: defaultPlannerManifest.id,
                input: {
                  goal: input.original.goal,
                  available_manifests: [
                    { id: targetId, name: "target", description: "", required_actions: [] },
                  ],
                  model_id: "mock/planner",
                  emit_as: "plan.head",
                },
                correlation: "planner",
              },
              {
                manifest_id: repairLoopManifest.id,
                input: {
                  target_manifest_id: step.manifest_id,
                  target_input: step.input,
                  validator_manifest_id: validatorId,
                  max_iterations: 4,
                  emit_as: "repair.final",
                },
                correlation: "repair",
              },
            ],
          };
        }
        if (repairChild.result.kind !== "output") {
          return { kind: "failed", reason: "repair failed", retryable: false };
        }
        const v = (repairChild.result as { value: { verdict: string; iterations: number } }).value;
        return {
          kind: "output",
          value: { verdict: v.verdict, iterations: v.iterations },
          evidence: { verdict: v.verdict === "pass" ? "pass" : "fail" },
        };
      },
    }));

    const modelProvider = new MockModelProvider({
      "mock/planner": () => ({
        goal: "make the target produce ok",
        steps: [
          {
            id: "fix",
            manifest_id: targetId,
            input: { seed: "needs_repair" },
            depends_on: [],
          },
        ],
        notes: "single-step plan",
      }),
    });

    const runtime = new Runtime({
      registry,
      contextStore,
      evidenceSink,
      events,
      modelProvider,
    });

    const outcome = await runtime.run(
      {
        manifest_id: driverId,
        input: { goal: "make the target produce ok" },
        correlation: "root",
      },
      [
        `spawn:${driverId}`,
        `spawn:${defaultPlannerManifest.id}`,
        `spawn:${repairLoopManifest.id}`,
        `spawn:${targetId}`,
        `spawn:${validatorId}`,
        "model:mock/planner",
      ],
    );

    expect(outcome.finalStatus).toBe("completed");
    if (outcome.rootResult?.kind !== "output") throw new Error("unreachable");
    const v = outcome.rootResult.value as { verdict: string; iterations: number };
    expect(v.verdict).toBe("pass");
    expect(v.iterations).toBeGreaterThanOrEqual(1);

    // Plan landed in ctx as an Artifact (R3-A).
    const planHead = contextStore.getHeadByTag("plan.head");
    expect(planHead).not.toBeNull();
    expect(planHead!.type).toBe("artifact");

    // Evidence chain spans planner + repair_loop chain + target/validator.
    const records = evidenceSink.records;
    expect(records.some((r) => r.run.node_id === defaultPlannerManifest.id)).toBe(true);
    expect(records.some((r) => r.run.node_id === repairLoopManifest.id)).toBe(true);
    expect(records.some((r) => r.run.node_id === targetId)).toBe(true);
    expect(records.some((r) => r.run.node_id === validatorId)).toBe(true);

    // Stable lineage_id across repair_loop's ReplaceMe chain.
    const repairRecords = records.filter((r) => r.run.node_id === repairLoopManifest.id);
    if (repairRecords.length > 1) {
      const lineageIds = new Set(repairRecords.map((r) => r.run.lineage_id));
      expect(lineageIds.size).toBe(1);
    }
  });
});
