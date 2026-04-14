/**
 * context_curator, approval_gate, default_planner — M4 unit coverage.
 */

import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  InMemoryContextStore,
  InMemoryNodeRegistry,
  MemoryEvidenceSink,
  MockModelProvider,
  Runtime,
  RuntimeEvents,
} from "@agenteer/core";
import {
  contextCuratorFactory,
  contextCuratorManifest,
  approvalGateFactory,
  approvalGateManifest,
  defaultPlannerFactory,
  defaultPlannerManifest,
  type ApprovalResolver,
} from "../src/index.js";

function newRuntime(opts?: { modelProvider?: MockModelProvider }) {
  const registry = new InMemoryNodeRegistry();
  const contextStore = new InMemoryContextStore();
  const evidenceSink = new MemoryEvidenceSink();
  const events = new RuntimeEvents();
  const runtime = new Runtime({
    registry,
    contextStore,
    evidenceSink,
    events,
    ...(opts?.modelProvider ? { modelProvider: opts.modelProvider } : {}),
  });
  return { runtime, registry, contextStore, evidenceSink, events };
}

describe("context_curator (query mode)", () => {
  it("emits a deterministic SliceSpec under emit_as", async () => {
    const { runtime, registry, contextStore } = newRuntime();
    registry.register(contextCuratorManifest, contextCuratorFactory);

    const outcome = await runtime.run(
      {
        manifest_id: contextCuratorManifest.id,
        input: {
          task: "Find recent observations about deployment",
          target_manifest_id: "@agenteer/node-llm-call",
          hints: { include_tags: ["ops"], types: ["observation"], limit: 10 },
          emit_as: "deploy.slice",
        },
        correlation: "r",
      },
      [`spawn:${contextCuratorManifest.id}`],
    );

    expect(outcome.finalStatus).toBe("completed");
    if (outcome.rootResult?.kind !== "output") throw new Error("unreachable");
    const v = outcome.rootResult.value as {
      slice_spec: { name: string; selector: { tags?: { any?: string[] } } };
      rationale: string;
    };
    expect(v.slice_spec.name).toMatch(/curated\./);
    expect(v.slice_spec.selector.tags?.any).toEqual(["ops"]);

    // Ctx item exists (Artifact-variant per R3-A).
    const head = contextStore.getHeadByTag("deploy.slice");
    expect(head).not.toBeNull();
    expect(head!.type).toBe("artifact");
  });
});

describe("approval_gate", () => {
  it("returns the recorded `decision` immediately when present (replay shape)", async () => {
    const { runtime, registry } = newRuntime();
    registry.register(approvalGateManifest, approvalGateFactory());
    const outcome = await runtime.run(
      {
        manifest_id: approvalGateManifest.id,
        input: { prompt: "Deploy to prod?", decision: "approve" },
        correlation: "r",
      },
      [`spawn:${approvalGateManifest.id}`],
    );
    expect(outcome.finalStatus).toBe("completed");
    if (outcome.rootResult?.kind !== "output") throw new Error("unreachable");
    const v = outcome.rootResult.value as { decision: string; source: string };
    expect(v.decision).toBe("approve");
    expect(v.source).toBe("recorded");
  });

  it("uses the injected ApprovalResolver when no decision is recorded", async () => {
    const resolver: ApprovalResolver = {
      resolve: () => "deny",
    };
    const { runtime, registry } = newRuntime();
    registry.register(approvalGateManifest, approvalGateFactory(resolver));
    const outcome = await runtime.run(
      {
        manifest_id: approvalGateManifest.id,
        input: { prompt: "Deploy to prod?", decision_id: "deploy.42" },
        correlation: "r",
      },
      [`spawn:${approvalGateManifest.id}`],
    );
    expect(outcome.finalStatus).toBe("completed");
    if (outcome.rootResult?.kind !== "output") throw new Error("unreachable");
    const v = outcome.rootResult.value as { decision: string; source: string };
    expect(v.decision).toBe("deny");
    expect(v.source).toBe("resolver");
  });

  it("falls through to NeedsUser when neither decision nor resolver answers", async () => {
    const { runtime, registry } = newRuntime();
    registry.register(approvalGateManifest, approvalGateFactory());
    const outcome = await runtime.run(
      {
        manifest_id: approvalGateManifest.id,
        input: { prompt: "Continue?" },
        correlation: "r",
      },
      [`spawn:${approvalGateManifest.id}`],
    );
    expect(outcome.finalStatus).toBe("suspended");
    if (outcome.rootResult?.kind !== "needs_user") throw new Error("expected needs_user");
    expect(outcome.rootResult.prompt).toBe("Continue?");
  });
});

describe("default_planner", () => {
  it("returns plan as DATA (not SpawnChildren) and emits it as an Artifact", async () => {
    const PlanSchemaInline = z.object({
      goal: z.string(),
      steps: z.array(
        z.object({
          id: z.string(),
          manifest_id: z.string(),
          input: z.unknown(),
          rationale: z.string().optional(),
          depends_on: z.array(z.string()).default([]),
          attenuate: z.array(z.string()).optional(),
        }),
      ),
      notes: z.string().optional(),
    });

    const planObject = {
      goal: "fix the failing build",
      steps: [
        {
          id: "compile",
          manifest_id: "@agenteer/node-compile",
          input: { language: "typescript", cwd: "/repo" },
          rationale: "see the type errors",
          depends_on: [],
        },
      ],
      notes: "minimal first pass",
    };

    const modelProvider = new MockModelProvider({
      "mock/planner": () => planObject,
    });

    const { runtime, registry, contextStore } = newRuntime({ modelProvider });
    registry.register(defaultPlannerManifest, defaultPlannerFactory);

    const outcome = await runtime.run(
      {
        manifest_id: defaultPlannerManifest.id,
        input: {
          goal: "fix the failing build",
          available_manifests: [
            {
              id: "@agenteer/node-compile",
              name: "compile",
              description: "Run tsc",
              required_actions: ["shell.exec:"],
            },
          ],
          model_id: "mock/planner",
          emit_as: "plan.head",
        },
        correlation: "r",
      },
      ["model:mock/planner"],
    );

    expect(outcome.finalStatus).toBe("completed");
    if (outcome.rootResult?.kind !== "output") throw new Error("unreachable");
    const v = outcome.rootResult.value as { plan: typeof planObject; method: string };
    expect(v.plan.goal).toBe("fix the failing build");
    expect(v.plan.steps).toHaveLength(1);

    // Plan landed in ctx as an Artifact (R3-A).
    const head = contextStore.getHeadByTag("plan.head");
    expect(head).not.toBeNull();
    expect(head!.type).toBe("artifact");
  });

  it("rejects plans referencing manifests outside available_manifests", async () => {
    const modelProvider = new MockModelProvider({
      "mock/planner": () => ({
        goal: "x",
        steps: [
          {
            id: "rogue",
            manifest_id: "@evil/node-rce",
            input: {},
            depends_on: [],
          },
        ],
      }),
    });
    const { runtime, registry } = newRuntime({ modelProvider });
    registry.register(defaultPlannerManifest, defaultPlannerFactory);

    const outcome = await runtime.run(
      {
        manifest_id: defaultPlannerManifest.id,
        input: {
          goal: "x",
          available_manifests: [
            { id: "@agenteer/node-compile", name: "compile", description: "" },
          ],
          model_id: "mock/planner",
        },
        correlation: "r",
      },
      ["model:mock/planner"],
    );
    expect(outcome.finalStatus).toBe("failed");
    if (outcome.rootResult?.kind !== "failed") throw new Error("unreachable");
    expect(outcome.rootResult.reason).toMatch(/outside available_manifests/);
  });
});
