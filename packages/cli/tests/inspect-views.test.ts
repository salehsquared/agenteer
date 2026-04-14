import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { z } from "zod";
import {
  FileContextStore,
  InMemoryNodeRegistry,
  Runtime,
  RuntimeEvents,
  SessionRecorder,
  asArtifact,
  createSession,
  makeManifest,
  sessionEvidenceDir,
  type Node,
  type NodeResult,
} from "@agenteer/core";
import { YamlEvidenceStore } from "@agenteer/trust/evidence";
import {
  inspectSession,
  renderCtxTimeline,
  renderEvidenceTree,
  renderPermissionDenials,
} from "../src/index.js";

const EmitterManifest = makeManifest({
  id: "@agenteer/node-test-emit",
  name: "emitter",
  description: "Emits ctx patches + evidence for inspect-view test coverage.",
  determinism: "deterministic",
});

function emitterFactory(): Node<{ key: string }, { ok: true }> {
  return {
    manifest: EmitterManifest,
    inputSchema: z.object({ key: z.string() }),
    outputSchema: z.object({ ok: z.literal(true) }),
    ctx: [],
    model: null,
    async execute(input): Promise<NodeResult<{ ok: true }>> {
      return {
        kind: "output",
        value: { ok: true },
        ctx_patch: {
          set: {
            [input.original.key]: asArtifact(
              { answer: 42 },
              { media_type: "application/json" },
            ),
          },
        },
        evidence: { verdict: "pass" },
      };
    },
  };
}

describe("agenteer inspect detail views", () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "agenteer-inspect-"));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("ctx_timeline captures each node_run's set/del/append keys", async () => {
    await createSession({
      sessionDir: dir,
      sessionId: "i-1",
      root: { manifest_id: EmitterManifest.id, input: { key: "demo.k" }, correlation: "r" },
      grantedRoot: [`spawn:${EmitterManifest.id}`],
    });
    const registry = new InMemoryNodeRegistry();
    registry.register(EmitterManifest, emitterFactory);
    const contextStore = new FileContextStore({ sessionDir: dir });
    await contextStore.load();
    const evidenceSink = new YamlEvidenceStore({ dir: sessionEvidenceDir(dir), duplicates: "dedupe" });
    const events = new RuntimeEvents();
    const recorder = new SessionRecorder({ sessionDir: dir, events });
    const runtime = new Runtime({ registry, contextStore, evidenceSink, events });
    await runtime.run(
      { manifest_id: EmitterManifest.id, input: { key: "demo.k" }, correlation: "r" },
      [`spawn:${EmitterManifest.id}`],
    );
    await recorder.flush();

    const report = await inspectSession(dir);
    expect(report.ctx_timeline).toHaveLength(1);
    expect(report.ctx_timeline[0]!.set_keys).toEqual(["demo.k"]);
    expect(report.ctx_timeline[0]!.manifest).toBe(EmitterManifest.id);

    // Rendered form includes the key.
    const rendered = renderCtxTimeline(report.ctx_timeline);
    expect(rendered).toMatch(/set=demo\.k/);
  });

  it("evidence_tree groups records by lineage_id; renders ok/FAIL marker", async () => {
    await createSession({
      sessionDir: dir,
      sessionId: "i-2",
      root: { manifest_id: EmitterManifest.id, input: { key: "k" }, correlation: "r" },
      grantedRoot: [`spawn:${EmitterManifest.id}`],
    });
    const registry = new InMemoryNodeRegistry();
    registry.register(EmitterManifest, emitterFactory);
    const contextStore = new FileContextStore({ sessionDir: dir });
    await contextStore.load();
    const evidenceSink = new YamlEvidenceStore({ dir: sessionEvidenceDir(dir), duplicates: "dedupe" });
    const events = new RuntimeEvents();
    const recorder = new SessionRecorder({ sessionDir: dir, events });
    const runtime = new Runtime({ registry, contextStore, evidenceSink, events });
    await runtime.run(
      { manifest_id: EmitterManifest.id, input: { key: "k" }, correlation: "r" },
      [`spawn:${EmitterManifest.id}`],
    );
    await recorder.flush();

    const report = await inspectSession(dir);
    expect(report.evidence_tree.length).toBeGreaterThan(0);
    expect(report.evidence_tree[0]!.has_failure).toBe(false);
    const rendered = renderEvidenceTree(report.evidence_tree);
    expect(rendered).toMatch(/\[ok\]/);
  });

  it("permission_denials surfaces a denied spawn with reason text", async () => {
    // Manifest that requires a cap the workflow won't have — triggers
    // denial at root spawn authorization.
    const NeedsNet = makeManifest({
      id: "@agenteer/node-test-needs-net",
      name: "needs_net",
      description: "Requires net.http; denied under empty grants.",
      determinism: "deterministic",
      required_actions: ["net.http:api.example.com/**"],
    });
    await createSession({
      sessionDir: dir,
      sessionId: "i-3",
      root: { manifest_id: NeedsNet.id, input: {}, correlation: "r" },
      grantedRoot: [],
    });
    const registry = new InMemoryNodeRegistry();
    registry.register(NeedsNet, () => ({
      manifest: NeedsNet,
      ctx: [],
      model: null,
      async execute(): Promise<NodeResult<unknown>> {
        return { kind: "output", value: {} };
      },
    }));
    const contextStore = new FileContextStore({ sessionDir: dir });
    await contextStore.load();
    const evidenceSink = new YamlEvidenceStore({ dir: sessionEvidenceDir(dir), duplicates: "dedupe" });
    const events = new RuntimeEvents();
    const recorder = new SessionRecorder({ sessionDir: dir, events });
    const runtime = new Runtime({ registry, contextStore, evidenceSink, events });
    await runtime.run(
      { manifest_id: NeedsNet.id, input: {}, correlation: "r" },
      [], // empty grants → root spawn denied
    );
    await recorder.flush();

    const report = await inspectSession(dir);
    const denials = report.permission_denials.filter((d) => d.kind === "permission_denied");
    expect(denials.length).toBeGreaterThan(0);

    const rendered = renderPermissionDenials(report.permission_denials);
    expect(rendered).toMatch(/DENY/);
    expect(rendered).not.toMatch(/\(no denials/);
  });
});
