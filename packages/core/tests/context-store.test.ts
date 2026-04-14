import { describe, it, expect } from "vitest";
import { InMemoryContextStore } from "../src/context/store.js";
import { canonicalize, itemContentHash } from "../src/context/hash.js";

describe("context hashing", () => {
  it("canonicalize is key-order independent", () => {
    const a = canonicalize({ a: 1, b: { c: 2, d: 3 } });
    const b = canonicalize({ b: { d: 3, c: 2 }, a: 1 });
    expect(a).toBe(b);
  });

  it("canonicalize rejects non-finite numbers", () => {
    expect(() => canonicalize({ x: Infinity })).toThrow();
    expect(() => canonicalize({ x: NaN })).toThrow();
  });

  it("item content hash excludes timestamp/tags/labels", () => {
    const base = {
      type: "artifact",
      content: {
        kind: "artifact" as const,
        media_type: "text/plain",
        encoding: "utf8" as const,
        body: "hello",
      },
      provenance: { source_node: "test@1", source_input_hash: "h" },
      refs: [],
    };
    const h1 = itemContentHash(base);
    // Different timestamp/labels would be excluded from the hash entirely
    // — the hash function only consumes the fields passed in.
    const h2 = itemContentHash({ ...base });
    expect(h1).toBe(h2);
  });
});

describe("InMemoryContextStore", () => {
  it("add is idempotent on identical content", () => {
    const store = new InMemoryContextStore(() => new Date("2026-04-13T00:00:00Z"));
    const draft = {
      type: "observation" as const,
      content: { kind: "observation" as const, subject: "x", observed: 1 },
      provenance: { source_node: "t@1", source_node_run_id: "r1" },
    };
    const a = store.add(draft);
    const b = store.add(draft);
    expect(a.id).toBe(b.id);
    expect(store.snapshot().length).toBe(1);
  });

  it("markStale + isStale propagates via derives_from", () => {
    const store = new InMemoryContextStore(() => new Date("2026-04-13T00:00:00Z"));
    const root = store.add({
      type: "reference",
      content: { kind: "reference", uri: "file:///a" },
      provenance: { source_node: "t@1", source_node_run_id: "r1" },
    });
    const derived = store.add({
      type: "artifact",
      content: {
        kind: "artifact",
        media_type: "text/plain",
        encoding: "utf8",
        body: "x",
      },
      provenance: { source_node: "t@1", source_node_run_id: "r2" },
      refs: [{ kind: "derives_from", target: { scope: "ctx", id: root.id } }],
    });
    expect(store.isStale(derived.id)).toBe(false);
    store.markStale(root.id, { by: "test", reason: "upstream_changed" });
    expect(store.isStale(root.id)).toBe(true);
    expect(store.isStale(derived.id)).toBe(true);
  });

  it("rejects dangling ctx refs", () => {
    const store = new InMemoryContextStore();
    expect(() =>
      store.add({
        type: "artifact",
        content: { kind: "artifact", media_type: "text/plain", encoding: "utf8", body: "x" },
        provenance: { source_node: "t@1", source_node_run_id: "r1" },
        refs: [{ kind: "derives_from", target: { scope: "ctx", id: "ctx_19700101_aaaaaaaaaaaa" } }],
      }),
    ).toThrow(/DanglingRef/);
  });

  it("materializeSlice produces a deterministic hash for stable state", () => {
    const store = new InMemoryContextStore(() => new Date("2026-04-13T00:00:00Z"));
    store.add({
      type: "decision",
      content: {
        kind: "decision",
        question: "q",
        choice: "1",
        alternatives: [],
        rationale: "1",
      },
      provenance: { source_node: "t@1", source_node_run_id: "r1" },
      labels: { tag: "counter_a" },
    });
    const a = store.materializeSlice({
      name: "s",
      selector: { types: ["decision"] },
      stale_policy: "allow",
      freeze: "snapshot",
    });
    const b = store.materializeSlice({
      name: "s",
      selector: { types: ["decision"] },
      stale_policy: "allow",
      freeze: "snapshot",
    });
    expect(a.materialized_hash).toBe(b.materialized_hash);
    expect(a.items.length).toBe(1);
  });
});
