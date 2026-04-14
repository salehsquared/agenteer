import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { FileContextStore } from "../src/context/file-store.js";

describe("FileContextStore", () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "agenteer-ctx-"));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("persists items and reloads them with identical content hash + order", async () => {
    const clock = (() => {
      let t = 0;
      return () => new Date(Date.UTC(2026, 3, 13, 12, 0, t++));
    })();

    const store = new FileContextStore({ sessionDir: dir, clock });
    await store.load();

    const a = store.add({
      type: "observation",
      content: { kind: "observation", subject: "deploy", observed: { step: 1 } },
      provenance: { source_node: "t@1", source_node_run_id: "r1" },
      tags: ["ops"],
      labels: { tag: "deploy.state" },
    });
    const b = store.add({
      type: "decision",
      content: {
        kind: "decision",
        question: "roll forward?",
        choice: "yes",
        alternatives: ["no"],
      },
      provenance: { source_node: "t@1", source_node_run_id: "r2" },
      labels: { tag: "deploy.state" },
      refs: [{ kind: "supersedes", target: { scope: "ctx", id: a.id } }],
    });
    await store.flush();

    const reloaded = new FileContextStore({ sessionDir: dir, clock });
    await reloaded.load();
    expect(reloaded.snapshot().length).toBe(2);

    // Order is derived from timestamp; a was added first, b second.
    const ids = reloaded.snapshot().map((i) => i.id);
    expect(ids).toEqual([a.id, b.id]);

    // Head-of-tag is the latest in the supersede chain.
    expect(reloaded.getHeadByTag("deploy.state")?.id).toBe(b.id);
  });

  it("stale markers persist through reload", async () => {
    const store = new FileContextStore({ sessionDir: dir });
    await store.load();
    const root = store.add({
      type: "reference",
      content: { kind: "reference", uri: "file:///x" },
      provenance: { source_node: "t@1", source_node_run_id: "r1" },
    });
    const derived = store.add({
      type: "artifact",
      content: { kind: "artifact", media_type: "text/plain", encoding: "utf8", body: "x" },
      provenance: { source_node: "t@1", source_node_run_id: "r2" },
      refs: [{ kind: "derives_from", target: { scope: "ctx", id: root.id } }],
    });
    store.markStale(root.id, { by: "test", reason: "upstream_changed" });
    await store.flush();

    const reloaded = new FileContextStore({ sessionDir: dir });
    await reloaded.load();
    expect(reloaded.isStale(root.id)).toBe(true);
    expect(reloaded.isStale(derived.id)).toBe(true);
  });

  it("add is idempotent on identical content (dedupe within a session)", async () => {
    const store = new FileContextStore({ sessionDir: dir });
    await store.load();
    const draft = {
      type: "observation" as const,
      content: { kind: "observation" as const, subject: "x", observed: 1 },
      provenance: { source_node: "t@1", source_node_run_id: "r1" },
    };
    const a = store.add(draft);
    const b = store.add(draft);
    expect(a.id).toBe(b.id);
    expect(store.snapshot().length).toBe(1);
    await store.flush();
  });

  it("rejects dangling ctx refs", async () => {
    const store = new FileContextStore({ sessionDir: dir });
    await store.load();
    expect(() =>
      store.add({
        type: "artifact",
        content: { kind: "artifact", media_type: "text/plain", encoding: "utf8", body: "x" },
        provenance: { source_node: "t@1", source_node_run_id: "r2" },
        refs: [{ kind: "derives_from", target: { scope: "ctx", id: "ctx_nonexistent" } }],
      }),
    ).toThrow(/DanglingRef/);
  });

  it("materializeSlice yields a stable hash across reloads", async () => {
    const fixedClock = () => new Date("2026-04-13T00:00:00Z");
    const store = new FileContextStore({ sessionDir: dir, clock: fixedClock });
    await store.load();
    store.add({
      type: "observation",
      content: { kind: "observation", subject: "x", observed: "v1" },
      provenance: { source_node: "t@1", source_node_run_id: "r1" },
      tags: ["ops"],
    });
    store.add({
      type: "observation",
      content: { kind: "observation", subject: "y", observed: "v2" },
      provenance: { source_node: "t@1", source_node_run_id: "r2" },
      tags: ["ops"],
    });
    await store.flush();

    const spec = {
      name: "slice.a",
      selector: { tags: { any: ["ops"] } },
      stale_policy: "allow" as const,
      freeze: "snapshot" as const,
    };
    const h1 = store.materializeSlice(spec).materialized_hash;

    const reloaded = new FileContextStore({ sessionDir: dir, clock: fixedClock });
    await reloaded.load();
    const h2 = reloaded.materializeSlice(spec).materialized_hash;
    expect(h1).toBe(h2);
  });
});
