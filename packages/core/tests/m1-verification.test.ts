/**
 * M1 verification per master plan — updated for M2 manifest/capability shape:
 *   "spawn 3 nested nodes; assert ctx propagation; assert ReplaceMe swap;
 *    assert event emission."
 *
 * The scenario is unchanged from M1; the plumbing now routes through the
 * capability kernel. Root spawn is authorized against workflow-root
 * capabilities; every child spawn the planner issues must be covered by
 * the parent's granted set.
 */

import { describe, expect, it } from "vitest";
import {
  InMemoryContextStore,
  InMemoryNodeRegistry,
  MemoryEvidenceSink,
  Runtime,
  RuntimeEvents,
  type Node,
  type NodeInput,
  type NodeResult,
  type NodeRuntimeHandle,
  type NodeSpawn,
  type RuntimeEventMap,
  makeManifest,
} from "../src/index.js";

function collectEvents(events: RuntimeEvents): {
  list: Array<{ name: string; payload: unknown }>;
  byName: Record<string, Array<unknown>>;
} {
  const list: Array<{ name: string; payload: unknown }> = [];
  const names: (keyof RuntimeEventMap)[] = [
    "engine_start",
    "engine_finish",
    "node_start",
    "node_complete",
    "node_failed",
    "node_cancelled",
    "spawn",
    "replace",
    "needs_user",
    "ctx_read",
    "ctx_patched",
    "permission_denied",
    "evidence_emitted",
    "cache_hit",
    "cache_miss",
    "error",
  ];
  for (const name of names) {
    events.on(name, (payload) => list.push({ name, payload }));
  }
  const byName = new Proxy(
    {},
    {
      get(_, prop: string) {
        return list.filter((e) => e.name === prop).map((e) => e.payload);
      },
    },
  ) as Record<string, Array<unknown>>;
  return { list, byName };
}

const LEAF_ID = "@agenteer/node-leaf-counter";
const REFINING_ID = "@agenteer/node-refining";
const REFINING_FINAL_ID = "@agenteer/node-refining-final";
const AGGREGATOR_ID = "@agenteer/node-aggregator";
const PLANNER_ID = "@agenteer/node-planner";

describe("M1 — core runtime, node primitive, context v0 (M2-shape manifests)", () => {
  it("spawns a 3-level nested tree with ctx propagation, ReplaceMe swap, and events", async () => {
    const registry = new InMemoryNodeRegistry();
    const contextStore = new InMemoryContextStore();
    const evidenceSink = new MemoryEvidenceSink();
    const events = new RuntimeEvents();
    const { list, byName } = collectEvents(events);

    registry.register(
      makeManifest({
        id: LEAF_ID,
        name: "leaf_counter",
        description: "Emit a counter value via ctx_patch",
        determinism: "deterministic",
      }),
      () => {
        const node: Node<{ key: string; value: number }, number> = {
          manifest: makeManifest({
            id: LEAF_ID,
            name: "leaf_counter",
            description: "Emit a counter value via ctx_patch",
            determinism: "deterministic",
          }),
          ctx: [],
          model: null,
          async execute(input: NodeInput<{ key: string; value: number }>) {
            const { key, value } = input.original;
            return {
              kind: "output",
              value,
              ctx_patch: { set: { [key]: value } },
              evidence: { verdict: "pass" },
            };
          },
        };
        return node;
      },
    );

    registry.register(
      makeManifest({
        id: REFINING_ID,
        name: "refining",
        description: "First pass returns replace_me",
        determinism: "deterministic",
      }),
      () => {
        const node: Node<{ draftValue: number }, number> = {
          manifest: makeManifest({
            id: REFINING_ID,
            name: "refining",
            description: "First pass returns replace_me",
            determinism: "deterministic",
          }),
          ctx: [],
          model: null,
          async execute(input: NodeInput<{ draftValue: number }>) {
            const { draftValue } = input.original;
            return {
              kind: "replace_me",
              reason: "draft refined; emitting final",
              successor: {
                manifest_id: REFINING_FINAL_ID,
                input: { finalValue: draftValue * 2 },
                correlation: "child-b",
              },
            };
          },
        };
        return node;
      },
    );

    registry.register(
      makeManifest({
        id: REFINING_FINAL_ID,
        name: "refining_final",
        description: "Successor of refining; emits final output",
        determinism: "deterministic",
      }),
      () => {
        const node: Node<{ finalValue: number }, number> = {
          manifest: makeManifest({
            id: REFINING_FINAL_ID,
            name: "refining_final",
            description: "Successor of refining; emits final output",
            determinism: "deterministic",
          }),
          ctx: [],
          model: null,
          async execute(input: NodeInput<{ finalValue: number }>) {
            const { finalValue } = input.original;
            return {
              kind: "output",
              value: finalValue,
              ctx_patch: { set: { counter_b: finalValue } },
              evidence: { verdict: "pass" },
            };
          },
        };
        return node;
      },
    );

    registry.register(
      makeManifest({
        id: AGGREGATOR_ID,
        name: "aggregator",
        description: "Spawns 1 grandchild and re-enters",
        determinism: "deterministic",
        required_actions: [`spawn:${LEAF_ID}`],
      }),
      () => {
        const node: Node<{ grandchildInput: number }, number> = {
          manifest: makeManifest({
            id: AGGREGATOR_ID,
            name: "aggregator",
            description: "Spawns 1 grandchild and re-enters",
            determinism: "deterministic",
            required_actions: [`spawn:${LEAF_ID}`],
          }),
          ctx: [],
          model: null,
          async execute(input: NodeInput<{ grandchildInput: number }>) {
            if (!input.children) {
              return {
                kind: "spawn_children",
                join: { mode: "all" },
                children: [
                  {
                    manifest_id: LEAF_ID,
                    input: { key: "grandchild_val", value: input.original.grandchildInput },
                    correlation: "grandchild-1",
                  },
                ],
              };
            }
            const child = input.children[0]!;
            if (child.result.kind !== "output") {
              return { kind: "failed", reason: "grandchild did not emit output", retryable: false };
            }
            const v = child.result.value as number;
            return {
              kind: "output",
              value: v + 100,
              ctx_patch: { set: { counter_c: v + 100 } },
              evidence: { verdict: "pass" },
            };
          },
        };
        return node;
      },
    );

    const plannerRequiredActions = [
      `spawn:${LEAF_ID}`,
      `spawn:${REFINING_ID}`,
      `spawn:${REFINING_FINAL_ID}`,
      `spawn:${AGGREGATOR_ID}`,
    ];

    registry.register(
      makeManifest({
        id: PLANNER_ID,
        name: "planner",
        description: "Root planner; fans out 3, re-enters, sums via ctx",
        determinism: "deterministic",
        required_actions: plannerRequiredActions,
      }),
      () => {
        const node: Node<{}, { sum: number; saw: string[] }> = {
          manifest: makeManifest({
            id: PLANNER_ID,
            name: "planner",
            description: "Root planner; fans out 3, re-enters, sums via ctx",
            determinism: "deterministic",
            required_actions: plannerRequiredActions,
          }),
          ctx: ["counter_a", "counter_b", "counter_c"],
          model: null,
          async execute(
            input: NodeInput<{}>,
            runtime: NodeRuntimeHandle,
          ): Promise<NodeResult<{ sum: number; saw: string[] }>> {
            if (!input.children) {
              return {
                kind: "spawn_children",
                join: { mode: "all" },
                children: [
                  {
                    manifest_id: LEAF_ID,
                    input: { key: "counter_a", value: 1 },
                    correlation: "child-a",
                  },
                  {
                    manifest_id: REFINING_ID,
                    input: { draftValue: 1 },
                    correlation: "child-b",
                  },
                  {
                    manifest_id: AGGREGATOR_ID,
                    input: { grandchildInput: 7 },
                    correlation: "child-c",
                  },
                ],
              };
            }
            const a = runtime.ctx.get<number>("counter_a") ?? 0;
            const b = runtime.ctx.get<number>("counter_b") ?? 0;
            const c = runtime.ctx.get<number>("counter_c") ?? 0;
            const sum = a + b + c;
            const saw = input.children.map((ch) => `${ch.correlation}:${ch.manifest_id}`);
            return {
              kind: "output",
              value: { sum, saw },
              ctx_patch: { set: { planner_sum: sum } },
              evidence: { verdict: "pass" },
            };
          },
        };
        return node;
      },
    );

    const runtime = new Runtime({ registry, contextStore, evidenceSink, events });

    const rootSpawn: NodeSpawn = {
      manifest_id: PLANNER_ID,
      input: {},
      correlation: "root",
    };

    // Workflow-root grants: spawn rights for every manifest we'll invoke
    // transitively. The aggregator also needs spawn:LEAF, but that flows
    // as part of its own manifest's required_actions intersected with what
    // its parent (planner) holds — planner holds spawn:LEAF too.
    const outcome = await runtime.run(rootSpawn, [
      `spawn:${PLANNER_ID}`,
      `spawn:${LEAF_ID}`,
      `spawn:${REFINING_ID}`,
      `spawn:${REFINING_FINAL_ID}`,
      `spawn:${AGGREGATOR_ID}`,
    ]);

    expect(outcome.finalStatus).toBe("completed");
    expect(outcome.rootResult?.kind).toBe("output");
    if (outcome.rootResult?.kind !== "output") throw new Error("unreachable");
    const value = outcome.rootResult.value as { sum: number; saw: string[] };
    expect(value.sum).toBe(1 + 2 + 107);
    expect(value.saw).toEqual([
      `child-a:${LEAF_ID}`,
      `child-b:${REFINING_ID}`,
      `child-c:${AGGREGATOR_ID}`,
    ]);

    const starts = byName.node_start;
    const completes = byName.node_complete;
    const spawns = byName.spawn;
    const replaces = byName.replace;
    const evidence = byName.evidence_emitted;
    const ctxPatched = byName.ctx_patched;
    const engineStart = byName.engine_start;
    const engineFinish = byName.engine_finish;
    const ctxReads = byName.ctx_read;
    const permDenied = byName.permission_denied;

    expect(engineStart.length).toBe(1);
    expect(engineFinish.length).toBe(1);
    expect(permDenied.length).toBe(0);

    expect(spawns.length).toBe(2);
    const spawnSizes = (spawns as Array<{ childrenCount: number }>)
      .map((s) => s.childrenCount)
      .sort();
    expect(spawnSizes).toEqual([1, 3]);

    expect(replaces.length).toBe(1);
    expect((replaces[0] as { successorManifest: string }).successorManifest).toBe(REFINING_FINAL_ID);

    expect(starts.length).toBe(8);
    expect(completes.length).toBe(8);

    const nonSpawnCompletes = (completes as Array<{ kind: string }>).filter(
      (c) => c.kind !== "spawn_children",
    );
    expect(evidence.length).toBe(nonSpawnCompletes.length);

    expect(ctxPatched.length).toBe(5);
    expect(ctxReads.length).toBe(8);

    expect(contextStore.getHeadByTag("counter_a")).not.toBeNull();
    expect(contextStore.getHeadByTag("counter_b")).not.toBeNull();
    expect(contextStore.getHeadByTag("planner_sum")).not.toBeNull();

    const plannerCtxReads = list
      .filter((e) => e.name === "ctx_read")
      .map((e) => e.payload) as Array<{ keys: string[] }>;
    const lastPlannerRead = [...plannerCtxReads]
      .reverse()
      .find(
        (r) =>
          r.keys.includes("counter_a") &&
          r.keys.includes("counter_b") &&
          r.keys.includes("counter_c"),
      );
    expect(lastPlannerRead).toBeDefined();

    const refiningEvidence = evidenceSink.records.filter((r) => {
      const nodeId = r.run.node_id ?? "";
      return nodeId === REFINING_ID || nodeId === REFINING_FINAL_ID;
    });
    expect(refiningEvidence.length).toBe(2);
    // Sub-plan 00 §16.4: lineage_id is stable across the ReplaceMe chain.
    const lineageIds = new Set(refiningEvidence.map((r) => r.run.lineage_id));
    expect(lineageIds.size).toBe(1);
  });
});
