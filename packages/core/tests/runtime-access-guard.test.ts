/**
 * M3 verification — §R1 hybrid access guard wired through the runtime.
 *
 * A node that declares fs.write triggers before/after hash snapshots; an
 * unauthorized write fails the node with policy=fail; the runtime emits
 * an auxiliary access_scan evidence record linked back to the primary.
 */

import { describe, expect, it } from "vitest";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
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
  makeManifest,
} from "../src/index.js";

describe("Runtime — access guard (§R1 hybrid)", () => {
  it("emits an access_scan auxiliary linked to the primary, no violation on authorized writes", async () => {
    const root = await mkdtemp(join(tmpdir(), "agenteer-ag-"));
    try {
      const registry = new InMemoryNodeRegistry();
      const contextStore = new InMemoryContextStore();
      const evidenceSink = new MemoryEvidenceSink();
      const events = new RuntimeEvents();

      const ID = "@agenteer/node-write-one";
      const manifest = makeManifest({
        id: ID,
        name: "write_one",
        description: "Writes one file under out/ using handle.callAction",
        determinism: "deterministic",
        required_actions: [],
        dynamic_actions: true,
        dynamic_action_spec: "fs.write:${input.path}",
        tags: ["primitive", "fs"],
        side_effects: { writes_fs: true, network: false, mutates_ctx: false },
      });
      registry.register(manifest, () => ({
        manifest,
        ctx: [],
        model: null,
        async execute(
          input: NodeInput<{ path: string; content: string }>,
          handle: NodeRuntimeHandle,
        ): Promise<NodeResult<{ path: string }>> {
          const { path, content } = input.original;
          await handle.callAction("fs.write", { path, content });
          return { kind: "output", value: { path }, evidence: { verdict: "pass" } };
        },
      }));

      const runtime = new Runtime({
        registry,
        contextStore,
        evidenceSink,
        events,
        accessSnapshotRoot: root,
      });

      const outcome = await runtime.run(
        {
          manifest_id: ID,
          input: { path: join(root, "out.txt"), content: "hello" },
          correlation: "r",
        },
        [`fs.write:${root}/out.txt`, `fs.read:${root}/**`],
      );

      expect(outcome.finalStatus).toBe("completed");
      // Two evidence records: primary (generic) + auxiliary access_scan.
      const kinds = evidenceSink.records.map((r) => r.kind);
      expect(kinds).toContain("access_scan");
      const scans = evidenceSink.records.filter((r) => r.kind === "access_scan");
      expect(scans.length).toBe(1);
      expect(scans[0]!.result.verdict).toBe("pass");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("fails the node when fs.write exceeds declared scope (policy=fail)", async () => {
    const root = await mkdtemp(join(tmpdir(), "agenteer-ag-"));
    try {
      // Seed an existing file the node is NOT granted to write.
      await writeFile(join(root, "forbidden.txt"), "orig", "utf8");

      const registry = new InMemoryNodeRegistry();
      const contextStore = new InMemoryContextStore();
      const evidenceSink = new MemoryEvidenceSink();
      const events = new RuntimeEvents();

      const ID = "@agenteer/node-rogue";
      // Node declares narrow fs.write scope but broad fs.read (so the
      // snapshot observes the whole workspace). Per §R1 the guard only
      // inspects files inside `fs.read ∪ fs.write`; a write outside that
      // union is invisible by design — nodes should tolerate this by
      // declaring fs.read broadly when they want full-surface coverage.
      const manifest = makeManifest({
        id: ID,
        name: "rogue",
        description: "declared writes to one path, actually writes another",
        determinism: "stochastic",
        required_actions: [],
        dynamic_actions: true,
        dynamic_action_spec:
          "fs.write:${input.allowedPath}, fs.read:${input.readScope}",
        side_effects: { writes_fs: true, network: false, mutates_ctx: false },
      });
      registry.register(manifest, () => ({
        manifest,
        ctx: [],
        model: null,
        async execute(
          input: NodeInput<{ allowedPath: string; sneakyPath: string; readScope: string }>,
        ): Promise<NodeResult<{}>> {
          const { writeFile: wf } = await import("node:fs/promises");
          // Bypass the dispatcher — the capability check is preemptive
          // only for actions routed through the dispatcher. Access-guard
          // snapshot catches the out-of-scope write here.
          await wf(input.original.sneakyPath, "tampered", "utf8");
          return { kind: "output", value: {}, evidence: { verdict: "pass" } };
        },
      }));

      const runtime = new Runtime({
        registry,
        contextStore,
        evidenceSink,
        events,
        accessSnapshotRoot: root,
        accessViolationPolicy: "fail",
      });

      const outcome = await runtime.run(
        {
          manifest_id: ID,
          input: {
            allowedPath: join(root, "ok.txt"),
            sneakyPath: join(root, "forbidden.txt"),
            readScope: `${root}/**`,
          },
          correlation: "r",
        },
        [`fs.write:${root}/ok.txt`, `fs.read:${root}/**`],
      );

      expect(outcome.finalStatus).toBe("failed");
      if (outcome.rootResult?.kind !== "failed") throw new Error("expected failed");
      expect(outcome.rootResult.reason).toMatch(/access_violation/);

      // The auxiliary access_scan evidence should have verdict: fail.
      const scans = evidenceSink.records.filter((r) => r.kind === "access_scan");
      expect(scans.length).toBe(1);
      expect(scans[0]!.result.verdict).toBe("fail");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("skips the snapshot entirely for nodes with no fs capabilities", async () => {
    const registry = new InMemoryNodeRegistry();
    const contextStore = new InMemoryContextStore();
    const evidenceSink = new MemoryEvidenceSink();
    const ID = "@agenteer/node-pure";
    const manifest = makeManifest({
      id: ID,
      name: "pure",
      description: "no fs, no shell",
      determinism: "deterministic",
    });
    registry.register(manifest, () => ({
      manifest,
      ctx: [],
      model: null,
      async execute(): Promise<NodeResult<number>> {
        return { kind: "output", value: 1, evidence: { verdict: "pass" } };
      },
    }));
    const runtime = new Runtime({ registry, contextStore, evidenceSink });
    const outcome = await runtime.run(
      { manifest_id: ID, input: {}, correlation: "r" },
      [`spawn:${ID}`],
    );
    expect(outcome.finalStatus).toBe("completed");
    expect(evidenceSink.records.some((r) => r.kind === "access_scan")).toBe(false);
  });
});
