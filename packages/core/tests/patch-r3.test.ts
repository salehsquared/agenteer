import { describe, it, expect } from "vitest";
import { InMemoryContextStore, applyPatch, asArtifact } from "../src/index.js";

describe("applyPatch — master plan §R3 translation", () => {
  const ctx = {
    sourceNode: "tester@1",
    sourceNodeRunId: "run_1",
    sourceInputHash: "h",
  };

  it("set(k, v) appends a Decision with supersedes chain on repeat", () => {
    const store = new InMemoryContextStore(() => new Date("2026-04-13T00:00:00Z"));
    const first = applyPatch(store, { set: { k: 1 } }, ctx);
    expect(first.added.length).toBe(1);
    expect(first.added[0]!.type).toBe("decision");
    expect(first.added[0]!.refs).toEqual([]);

    const second = applyPatch(store, { set: { k: 2 } }, { ...ctx, sourceNodeRunId: "run_2" });
    expect(second.added.length).toBe(1);
    expect(second.added[0]!.refs).toEqual([
      { kind: "supersedes", target: { scope: "ctx", id: first.added[0]!.id } },
    ]);
    // Head is the most recent.
    expect(store.getHeadByTag("k")?.id).toBe(second.added[0]!.id);
  });

  it("delete(k) appends a tombstone Decision linked to prior head", () => {
    const store = new InMemoryContextStore(() => new Date("2026-04-13T00:00:00Z"));
    const a = applyPatch(store, { set: { k: 1 } }, ctx);
    const b = applyPatch(store, { delete: ["k"] }, { ...ctx, sourceNodeRunId: "run_d" });
    expect(b.added[0]!.content.kind).toBe("decision");
    if (b.added[0]!.content.kind !== "decision") throw new Error("unreachable");
    expect(b.added[0]!.content.choice).toBe("tombstone");
    expect(b.added[0]!.refs[0]).toEqual({
      kind: "supersedes",
      target: { scope: "ctx", id: a.added[0]!.id },
    });
  });

  it("append(k, [...]) appends an Artifact with refs.extends link", () => {
    const store = new InMemoryContextStore(() => new Date("2026-04-13T00:00:00Z"));
    const first = applyPatch(store, { append: { k: [1, 2] } }, ctx);
    expect(first.added[0]!.type).toBe("artifact");
    const second = applyPatch(store, { append: { k: [3] } }, { ...ctx, sourceNodeRunId: "run_2" });
    expect(second.added[0]!.refs).toEqual([
      { kind: "extends", target: { scope: "ctx", id: first.added[0]!.id } },
    ]);
  });

  it("R3-A: set(k, asArtifact(body)) produces an Artifact, not a Decision", () => {
    const store = new InMemoryContextStore(() => new Date("2026-04-13T00:00:00Z"));
    const plan = { steps: [{ id: "A" }, { id: "B" }] };
    const out = applyPatch(store, { set: { "plan.head": asArtifact(plan) } }, ctx);
    expect(out.added[0]!.type).toBe("artifact");
    if (out.added[0]!.content.kind !== "artifact") throw new Error("unreachable");
    expect(out.added[0]!.content.body).toEqual(plan);
    expect(out.added[0]!.content.media_type).toBe("application/json");
  });

  it("R3-A: asArtifact carries media_type through to the stored item", () => {
    const store = new InMemoryContextStore(() => new Date("2026-04-13T00:00:00Z"));
    const body = "# plan\n- step 1\n";
    const out = applyPatch(
      store,
      { set: { "plan.markdown": asArtifact(body, { media_type: "text/markdown" }) } },
      ctx,
    );
    if (out.added[0]!.content.kind !== "artifact") throw new Error("unreachable");
    expect(out.added[0]!.content.media_type).toBe("text/markdown");
    expect(out.added[0]!.content.body).toBe(body);
  });

  it("never mutates existing items — store stays append-only", () => {
    const store = new InMemoryContextStore(() => new Date("2026-04-13T00:00:00Z"));
    applyPatch(store, { set: { k: 1 } }, ctx);
    const first = store.snapshot()[0]!;
    applyPatch(store, { set: { k: 2 } }, { ...ctx, sourceNodeRunId: "run_2" });
    const afterFirst = store.get(first.id)!;
    expect(afterFirst).toEqual(first);
    expect(store.snapshot().length).toBe(2);
  });
});
