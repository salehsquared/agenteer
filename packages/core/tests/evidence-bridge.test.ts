/**
 * Evidence → context bridge round-trip.
 *
 * The host (core) wires a bridge that translates `put` / `stale` events
 * from trust's EvidenceStore into `context.add` / `context.markStale`.
 * Sub-plan 04 §1.7; sub-plan 01 §10.
 */

import { describe, expect, it } from "vitest";
import {
  MemoryEvidenceStore,
  attachBridge,
  collectFromNodeRun,
} from "@agenteer/trust/evidence";
import { InMemoryContextStore } from "../src/index.js";

describe("EvidenceBridge → context round-trip", () => {
  it("adds an evidence_ref item on put and marks it stale on evidence staleness", async () => {
    const store = new MemoryEvidenceStore();
    const ctx = new InMemoryContextStore();

    const evidenceToCtxId = new Map<string, string>();

    attachBridge(store, {
      onEvidencePut: async (rec) => {
        const added = ctx.add({
          type: "evidence_ref",
          content: {
            kind: "evidence_ref",
            evidence_id: rec.id,
            verdict: rec.result.verdict,
          },
          provenance: {
            source_node: rec.run.node_id ?? "system",
            source_node_run_id: rec.run.node_run_id ?? "system",
          },
          tags: ["evidence"],
        });
        evidenceToCtxId.set(rec.id, added.id);
      },
      onEvidenceStale: async (evId, marker) => {
        const ctxId = evidenceToCtxId.get(evId);
        if (ctxId) {
          ctx.markStale(ctxId, {
            by: "evidence-bridge",
            reason: "evidence_invalidated",
            detail: marker.reason,
          });
        }
      },
    });

    const rec = await collectFromNodeRun(store, {
      kind: "gate_check",
      nodeId: "@agenteer/node-compile",
      nodeRunId: "run_1",
      tool: { name: "tsc", command: "tsc --noEmit" },
      run: { timestamp: "2026-04-13T10:00:00Z", trigger: "agent" },
      result: { verdict: "pass", summary: "ok" },
    });

    const ctxId = evidenceToCtxId.get(rec.id);
    expect(ctxId).toBeDefined();
    const item = ctx.get(ctxId!);
    expect(item).not.toBeNull();
    expect(item!.type).toBe("evidence_ref");
    if (item!.content.kind !== "evidence_ref") throw new Error("unreachable");
    expect(item!.content.evidence_id).toBe(rec.id);

    expect(ctx.isStale(ctxId!)).toBe(false);
    await store.markStale(rec.id, { by: "test", reason: "upstream_changed" });
    expect(ctx.isStale(ctxId!)).toBe(true);
  });
});
