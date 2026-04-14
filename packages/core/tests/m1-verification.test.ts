/**
 * M1 verification per master plan:
 *   "spawn 3 nested nodes; assert ctx propagation; assert ReplaceMe swap;
 *    assert event emission."
 *
 * One file covers all three. Narrower unit tests live alongside.
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
  EMPTY_ENVELOPE,
  makeManifest,
} from "../src/index.js";

/** Collect all events with timestamps normalized for stable ordering. */
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

describe("M1 — core runtime, node primitive, context v0", () => {
  it("spawns a 3-level nested tree with ctx propagation, ReplaceMe swap, and events", async () => {
    // ──────────────────────────────────────────────────────────────────
    // Scene:
    //   root (planner) → spawns 3 children:
    //     - childA (leaf_counter):   returns output with ctx_patch { set: { counter_a: 1 }}
    //     - childB (refining):       first call returns ReplaceMe → successor
    //       emits output with ctx_patch { set: { counter_b: 2 }}
    //     - childC (aggregator):     spawns 1 grandchild, re-enters, emits output
    // After join {mode:"all"}, planner re-enters with input.children populated,
    // reads ctx keys (counter_a, counter_b, grandchild_val), and emits its own
    // output with ctx_patch summing them.
    // ──────────────────────────────────────────────────────────────────

    const registry = new InMemoryNodeRegistry();
    const contextStore = new InMemoryContextStore();
    const evidenceSink = new MemoryEvidenceSink();
    const events = new RuntimeEvents();
    const { list, byName } = collectEvents(events);

    // ── leaf_counter ───────────────────────────────────────────────────
    registry.register(
      makeManifest("agenteer/leaf_counter@0.1", "Emit a counter value via ctx_patch"),
      () => {
        const node: Node<NodeInput<{ key: string; value: number }>, number> = {
          manifest: makeManifest("agenteer/leaf_counter@0.1", "Emit a counter via ctx_patch"),
          ctx: [],
          models_allowed: [],
          actions_allowed: [],
          new_node_states_allowed: [],
          deterministic: true,
          model: null,
          async execute(input) {
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

    // ── refining ───────────────────────────────────────────────────────
    // First invocation returns replace_me with a successor that emits the
    // output. Demonstrates in-place replacement at the same tree position.
    registry.register(
      makeManifest("agenteer/refining@0.1", "First pass returns replace_me; successor returns output"),
      () => {
        const node: Node<NodeInput<{ draftValue: number }>, number> = {
          manifest: makeManifest("agenteer/refining@0.1", "Returns replace_me then output"),
          ctx: [],
          models_allowed: [],
          actions_allowed: [],
          new_node_states_allowed: [],
          deterministic: true,
          model: null,
          async execute(input) {
            const { draftValue } = input.original;
            return {
              kind: "replace_me",
              reason: "draft refined; emitting final",
              successor: {
                manifest_id: "agenteer/refining_final@0.1",
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
      makeManifest("agenteer/refining_final@0.1", "Successor of refining; emits final output"),
      () => {
        const node: Node<NodeInput<{ finalValue: number }>, number> = {
          manifest: makeManifest("agenteer/refining_final@0.1", "Emits final output with ctx_patch"),
          ctx: [],
          models_allowed: [],
          actions_allowed: [],
          new_node_states_allowed: [],
          deterministic: true,
          model: null,
          async execute(input) {
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

    // ── aggregator ─────────────────────────────────────────────────────
    // On first call: spawn a grandchild. On re-entry with children: read
    // its output, emit ctx_patch, return output. This exercises level 3.
    registry.register(
      makeManifest("agenteer/aggregator@0.1", "Spawns 1 grandchild and re-enters"),
      () => {
        const node: Node<{ grandchildInput: number }, number> = {
          manifest: makeManifest("agenteer/aggregator@0.1", "Spawns grandchild + re-enters"),
          ctx: [],
          models_allowed: [],
          actions_allowed: [],
          new_node_states_allowed: [],
          deterministic: true,
          model: null,
          async execute(input: NodeInput<{ grandchildInput: number }>) {
            if (!input.children) {
              return {
                kind: "spawn_children",
                join: { mode: "all" },
                children: [
                  {
                    manifest_id: "agenteer/leaf_counter@0.1",
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

    // ── planner (root) ─────────────────────────────────────────────────
    registry.register(
      makeManifest("agenteer/planner@0.1", "Root planner; fans out 3, re-enters, sums via ctx"),
      () => {
        const node: Node<{}, { sum: number; saw: string[] }> = {
          manifest: makeManifest("agenteer/planner@0.1", "Root planner"),
          ctx: ["counter_a", "counter_b", "counter_c"],
          models_allowed: [],
          actions_allowed: [],
          new_node_states_allowed: [
            "agenteer/leaf_counter@0.1",
            "agenteer/refining@0.1",
            "agenteer/aggregator@0.1",
          ],
          deterministic: true,
          model: null,
          async execute(input: NodeInput<{}>, runtime: NodeRuntimeHandle): Promise<NodeResult<{ sum: number; saw: string[] }>> {
            if (!input.children) {
              return {
                kind: "spawn_children",
                join: { mode: "all" },
                children: [
                  {
                    manifest_id: "agenteer/leaf_counter@0.1",
                    input: { key: "counter_a", value: 1 },
                    correlation: "child-a",
                  },
                  {
                    manifest_id: "agenteer/refining@0.1",
                    input: { draftValue: 1 },
                    correlation: "child-b",
                  },
                  {
                    manifest_id: "agenteer/aggregator@0.1",
                    input: { grandchildInput: 7 },
                    correlation: "child-c",
                  },
                ],
              };
            }
            // On re-entry: read ctx values the children wrote via ctx_patch.
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

    const runtime = new Runtime({
      registry,
      contextStore,
      evidenceSink,
      events,
    });

    const rootSpawn: NodeSpawn = {
      manifest_id: "agenteer/planner@0.1",
      input: {},
      correlation: "root",
    };

    const outcome = await runtime.run(rootSpawn, {
      ...EMPTY_ENVELOPE,
      new_node_states_allowed: [
        "agenteer/leaf_counter@0.1",
        "agenteer/refining@0.1",
        "agenteer/refining_final@0.1",
        "agenteer/aggregator@0.1",
      ],
      ctx_keys: ["counter_a", "counter_b", "counter_c", "grandchild_val", "planner_sum"],
    });

    // ── Final outcome ──
    expect(outcome.finalStatus).toBe("completed");
    expect(outcome.rootResult?.kind).toBe("output");
    if (outcome.rootResult?.kind !== "output") throw new Error("unreachable");
    const value = outcome.rootResult.value as { sum: number; saw: string[] };
    // counter_a = 1; counter_b = 2 (refining * 2); counter_c = 107 (7 + 100)
    expect(value.sum).toBe(1 + 2 + 107);
    expect(value.saw).toEqual([
      "child-a:agenteer/leaf_counter@0.1",
      "child-b:agenteer/refining@0.1",
      "child-c:agenteer/aggregator@0.1",
    ]);

    // ── Event emission ──
    const starts = byName.node_start;
    const completes = byName.node_complete;
    const spawns = byName.spawn;
    const replaces = byName.replace;
    const evidence = byName.evidence_emitted;
    const ctxPatched = byName.ctx_patched;
    const engineStart = byName.engine_start;
    const engineFinish = byName.engine_finish;
    const ctxReads = byName.ctx_read;

    expect(engineStart.length).toBe(1);
    expect(engineFinish.length).toBe(1);

    // Spawn events: planner fans 3, aggregator fans 1 → 2 spawn events.
    expect(spawns.length).toBe(2);
    const spawnSizes = (spawns as Array<{ childrenCount: number }>).map((s) => s.childrenCount).sort();
    expect(spawnSizes).toEqual([1, 3]);

    // Replace events: exactly one (refining → refining_final).
    expect(replaces.length).toBe(1);
    expect((replaces[0] as { successorManifest: string }).successorManifest).toBe(
      "agenteer/refining_final@0.1",
    );

    // node_start/complete counts:
    //   planner: starts twice (initial + re-entry)
    //   aggregator: starts twice (initial + re-entry)
    //   leaf_counter: starts twice (child-a + grandchild)
    //   refining: starts once
    //   refining_final: starts once
    // = 8 starts and 8 completes.
    expect(starts.length).toBe(8);
    expect(completes.length).toBe(8);

    // Every non-spawn_children completion has an evidence record (R2).
    // Completions of kind "spawn_children" do NOT emit evidence at that
    // step (the re-entry's output will).
    const nonSpawnCompletes = (completes as Array<{ kind: string }>).filter(
      (c) => c.kind !== "spawn_children",
    );
    expect(evidence.length).toBe(nonSpawnCompletes.length);

    // ctx_patched fires for every non-empty patch:
    //   child-a leaf_counter      → counter_a
    //   refining_final            → counter_b
    //   grandchild leaf_counter   → grandchild_val
    //   aggregator re-entry       → counter_c
    //   planner re-entry          → planner_sum
    // = 5.
    expect(ctxPatched.length).toBe(5);

    // ctx_read fires at every node_start.
    expect(ctxReads.length).toBe(8);

    // ── Context propagation assertions ──
    // The store should carry supersede chains for each tagged key.
    const counterA = contextStore.getHeadByTag("counter_a");
    expect(counterA).not.toBeNull();
    expect(counterA?.content.kind).toBe("decision");

    const counterB = contextStore.getHeadByTag("counter_b");
    expect(counterB).not.toBeNull();

    const plannerSum = contextStore.getHeadByTag("planner_sum");
    expect(plannerSum).not.toBeNull();

    // Planner's re-entry ctx slice should surface all three counters.
    // We verify this by looking at the ctx_read events for planner runs.
    const plannerCtxReads = (list
      .filter((e) => e.name === "ctx_read")
      .map((e) => e.payload) as Array<{ keys: string[] }>);
    // The final ctx_read for planner should include all three counters.
    const lastPlannerRead = [...plannerCtxReads]
      .reverse()
      .find((r) => r.keys.includes("counter_a") && r.keys.includes("counter_b") && r.keys.includes("counter_c"));
    expect(lastPlannerRead).toBeDefined();

    // Evidence sink received all records (lineage stable across chain).
    const refiningEvidence = evidenceSink.records.filter((r) =>
      r.manifest_id.startsWith("agenteer/refining"),
    );
    // One primary record for refining + one for refining_final; they share
    // the same lineage_id because refining_final was a ReplaceMe successor.
    expect(refiningEvidence.length).toBe(2);
    expect(new Set(refiningEvidence.map((r) => r.lineage_id)).size).toBe(1);
  });
});
