/**
 * M6 acceptance test (master plan §M6 verification):
 *
 *   "Publish a toy third-party node to local npm registry (verdaccio);
 *    install and run with constrained permissions; unauthorized actions
 *    are denied at spawn."
 *
 * This test exercises that story in a hermetic form — no real verdaccio.
 * The NpmRunner is mocked with a file-copy `install` and a no-op
 * `publish`, so we can:
 *   - Run `publishCommand` against a fixture package (simulates
 *     `agenteer publish`).
 *   - Run `installCommand` into a temp workflow dir (simulates
 *     `agenteer install` end-to-end: validation → confirmation →
 *     manifest cache → framework.lock).
 *   - Register the cached manifest into a live runtime with workflow
 *     grants NARROWER than what the node requires, and confirm the
 *     kernel denies the spawn at auth time.
 *
 * The verdaccio script for real E2E verification lives in
 * `packages/registry/VERDACCIO.md`; CI doesn't run it.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cp, mkdtemp, mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  loadManifestFromPackage,
  publishNode,
  installNode,
  readLockfile,
  readWorkflowConfig,
  type NpmRunner,
} from "@agenteer/registry";
import {
  InMemoryContextStore,
  InMemoryNodeRegistry,
  MemoryEvidenceSink,
  Runtime,
  type Node,
  type NodeResult,
} from "@agenteer/core";

const here = dirname(fileURLToPath(import.meta.url));
const toyFixture = join(here, "..", "..", "registry", "tests", "fixtures", "node-toy");

/** A mock npm: publish is no-op; install copies from fixture dir. */
function mockNpm(fixtureDir: string, pkgName: string): NpmRunner & { events: string[] } {
  const events: string[] = [];
  return {
    events,
    publish: async () => {
      events.push("publish");
    },
    install: async (opts) => {
      events.push(`install:${opts.spec}`);
      const dest = join(opts.cwd, "node_modules", pkgName);
      await mkdir(dest, { recursive: true });
      await cp(fixtureDir, dest, { recursive: true });
    },
    uninstall: async () => {
      events.push("uninstall");
    },
    search: async () => [],
    view: async () => null,
  } as never;
}

describe("M6 acceptance — publish + install + permission enforcement", () => {
  let workflowDir: string;

  beforeEach(async () => {
    workflowDir = await mkdtemp(join(tmpdir(), "agenteer-m6-"));
  });

  afterEach(async () => {
    await rm(workflowDir, { recursive: true, force: true });
  });

  it("publishes toy node → installs under narrower grants → runtime denies the spawn", async () => {
    const pkgName = "@toy/node-triage";
    const npm = mockNpm(toyFixture, pkgName);

    // 1. Publish — validates the fixture and logs (mocked).
    const publishResult = await publishNode({
      pkgDir: toyFixture,
      npm,
      provenance: false,
      dryRun: true,
      registry: "http://verdaccio.local",
    });
    expect(publishResult.ok).toBe(true);
    expect(publishResult.manifest_id).toBe(pkgName);
    expect(npm.events).toContain("publish");

    // 2. Install into a workflow with grants NARROWER than required.
    //    The toy node wants: net.http:api.github.com/**, context.read:issue.*,
    //                        context.write:triage.*.
    //    We grant only net.http:api.github.com/** — missing the two ctx caps.
    const grants = ["net.http:api.github.com/**", `spawn:${pkgName}`];
    const installResult = await installNode({
      workflowDir,
      spec: `${pkgName}@^1.2.0`,
      workflowId: "m6-demo",
      grants,
      npm,
      autoApprove: true,
    });
    expect(installResult.ok).toBe(true);
    // The permissions diff surfaces the missing caps at install time —
    // the user saw these and approved anyway (autoApprove). Framework
    // enforces them at spawn time regardless.
    expect(installResult.diff?.new_required.sort()).toEqual([
      "context.read:issue.*",
      "context.write:triage.*",
    ]);

    // 3. Lockfile captures the resolved manifest hash (supply-chain pin).
    const lock = await readLockfile(workflowDir);
    expect(lock.entries).toHaveLength(1);
    expect(lock.entries[0]!.id).toBe(pkgName);
    expect(lock.entries[0]!.manifest_hash).toMatch(/^[0-9a-f]{64}$/);

    const config = (await readWorkflowConfig(workflowDir))!;
    expect(config.nodes[0]?.id).toBe(pkgName);

    // 4. Load the cached manifest and wire a no-op node; try to spawn it.
    const installedPath = join(workflowDir, "node_modules", pkgName);
    const loaded = await loadManifestFromPackage(installedPath);
    const node: Node<unknown, { ok: boolean }> = {
      manifest: loaded.manifest,
      ctx: [],
      model: null,
      async execute(): Promise<NodeResult<{ ok: boolean }>> {
        return { kind: "output", value: { ok: true }, evidence: { verdict: "pass" } };
      },
    };

    const registry = new InMemoryNodeRegistry();
    registry.register(loaded.manifest, () => node);
    const runtime = new Runtime({
      registry,
      contextStore: new InMemoryContextStore(),
      evidenceSink: new MemoryEvidenceSink(),
    });

    const outcome = await runtime.run(
      { manifest_id: pkgName, input: {}, correlation: "root" },
      grants,
    );

    // The kernel must deny the root spawn because the narrower grants do
    // NOT cover the node's `required_actions`. That's the master plan §M6
    // verification: "unauthorized actions are denied at spawn".
    expect(outcome.finalStatus).toBe("failed");
    if (outcome.rootResult?.kind !== "failed") throw new Error("unreachable");
    expect(outcome.rootResult.reason).toMatch(/root_spawn_denied|permission_denied/);
  });

  it("install → run when grants DO cover required_actions → node executes", async () => {
    const pkgName = "@toy/node-triage";
    const npm = mockNpm(toyFixture, pkgName);
    const grants = [
      "net.http:api.github.com/**",
      "context.read:issue.*",
      "context.write:triage.*",
      `spawn:${pkgName}`,
    ];
    const res = await installNode({
      workflowDir,
      spec: pkgName,
      workflowId: "m6-demo-ok",
      grants,
      npm,
      autoApprove: true,
    });
    expect(res.ok).toBe(true);
    expect(res.diff?.new_required).toEqual([]);

    const installedPath = join(workflowDir, "node_modules", pkgName);
    const loaded = await loadManifestFromPackage(installedPath);
    const node: Node<unknown, { ok: boolean }> = {
      manifest: loaded.manifest,
      ctx: [],
      model: null,
      async execute(): Promise<NodeResult<{ ok: boolean }>> {
        return { kind: "output", value: { ok: true }, evidence: { verdict: "pass" } };
      },
    };
    const registry = new InMemoryNodeRegistry();
    registry.register(loaded.manifest, () => node);
    const runtime = new Runtime({
      registry,
      contextStore: new InMemoryContextStore(),
      evidenceSink: new MemoryEvidenceSink(),
    });
    const outcome = await runtime.run(
      { manifest_id: pkgName, input: {}, correlation: "root" },
      grants,
    );
    expect(outcome.finalStatus).toBe("completed");
  });
});
