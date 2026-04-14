import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import {
  installNode,
  readWorkflowConfig,
  readLockfile,
  type NpmRunner,
} from "../src/index.js";

const here = dirname(fileURLToPath(import.meta.url));
const toyDir = join(here, "fixtures", "node-toy");

/**
 * Build a runner that simulates `npm install` by copying the fixture
 * into <workflowDir>/node_modules/<pkg>. No network needed.
 */
function simulatingNpm(args: {
  /** Where to copy the fixture FROM. */
  fixtureDir: string;
  /** The package name we pretend to install. */
  pkgName: string;
  /** Inject attestations returned by `view`, or null for missing. */
  attestations?: unknown;
}): NpmRunner & { installs: number; uninstalls: number } {
  const runner = {
    installs: 0,
    uninstalls: 0,
    publish: async () => {
      /* not used */
    },
    install: async (opts: { cwd: string; spec: string }) => {
      runner.installs += 1;
      const dest = join(opts.cwd, "node_modules", args.pkgName);
      await mkdir(dest, { recursive: true });
      await cp(args.fixtureDir, dest, { recursive: true });
    },
    uninstall: async () => {
      runner.uninstalls += 1;
    },
    search: async () => [],
    view: async () =>
      args.attestations !== undefined
        ? ({
            name: args.pkgName,
            version: "1.2.0",
            dist: { attestations: args.attestations },
          } as never)
        : null,
  } as const;
  return runner as NpmRunner & { installs: number; uninstalls: number };
}

describe("installNode", () => {
  let workflowDir: string;

  beforeEach(async () => {
    workflowDir = await mkdtemp(join(tmpdir(), "agenteer-install-"));
  });

  afterEach(async () => {
    await rm(workflowDir, { recursive: true, force: true });
  });

  it("installs a valid toy node end-to-end and writes workflow + lock files", async () => {
    const npm = simulatingNpm({ fixtureDir: toyDir, pkgName: "@toy/node-triage" });
    const res = await installNode({
      workflowDir,
      spec: "@toy/node-triage@^1.2.0",
      workflowId: "demo",
      grants: ["net.http:api.github.com/**", "context.read:issue.*", "context.write:triage.*"],
      npm,
      autoApprove: true,
    });
    expect(res.ok).toBe(true);
    expect(res.id).toBe("@toy/node-triage");
    expect(res.version).toBe("1.2.0");
    expect(res.range).toBe("^1.2.0");
    expect(res.manifest_hash).toMatch(/^[0-9a-f]{64}$/);

    const config = (await readWorkflowConfig(workflowDir))!;
    expect(config.nodes.map((n) => n.id)).toEqual(["@toy/node-triage"]);

    const lock = await readLockfile(workflowDir);
    expect(lock.entries[0]?.manifest_hash).toBe(res.manifest_hash);

    // Cached manifest file exists under .framework/manifests/.
    const cachePath = join(
      workflowDir,
      ".framework",
      "manifests",
      "_toy_node-triage@1.2.0.json",
    );
    const cached = JSON.parse(await readFile(cachePath, "utf-8"));
    expect(cached.id).toBe("@toy/node-triage");
  });

  it("rolls back npm install when a confirm prompt declines", async () => {
    const npm = simulatingNpm({ fixtureDir: toyDir, pkgName: "@toy/node-triage" });
    const res = await installNode({
      workflowDir,
      spec: "@toy/node-triage",
      workflowId: "d",
      grants: [],
      npm,
      confirm: () => false,
    });
    expect(res.ok).toBe(false);
    expect(res.reason).toBe("declined_by_user");
    expect(npm.uninstalls).toBe(1);
    // No lock entry written.
    const lock = await readLockfile(workflowDir);
    expect(lock.entries).toEqual([]);
  });

  it("rolls back when the installed package fails validation", async () => {
    // Build a runner that drops a malformed package.json into node_modules.
    const badPkgDir = await mkdtemp(join(tmpdir(), "agenteer-bad-fixture-"));
    try {
      await writeFile(
        join(badPkgDir, "package.json"),
        JSON.stringify({ name: "not-a-valid-node-name", version: "0.1.0", keywords: [] }),
      );
      await writeFile(
        join(badPkgDir, "framework.json"),
        JSON.stringify({
          manifest_version: 1,
          id: "@toy/node-different",
          version: "0.1.0",
          name: "x",
          description: "y",
          determinism: "deterministic",
          required_actions: [],
          tags: [],
        }),
      );
      const npm = simulatingNpm({ fixtureDir: badPkgDir, pkgName: "not-a-valid-node-name" });
      const res = await installNode({
        workflowDir,
        spec: "not-a-valid-node-name",
        workflowId: "d",
        grants: [],
        npm,
        autoApprove: true,
      });
      expect(res.ok).toBe(false);
      expect(res.reason).toBe("validation_failed");
      expect(npm.uninstalls).toBe(1);
    } finally {
      await rm(badPkgDir, { recursive: true, force: true });
    }
  });

  it("blocks install of @agenteer/* without provenance attestations", async () => {
    // Copy the toy fixture but rename it to @agenteer/node-triage.
    const scopedDir = await mkdtemp(join(tmpdir(), "agenteer-scoped-"));
    try {
      await cp(toyDir, scopedDir, { recursive: true });
      // Overwrite package.json + framework.json with an @agenteer/ name.
      const pkg = JSON.parse(await readFile(join(scopedDir, "package.json"), "utf-8"));
      pkg.name = "@agenteer/node-triage";
      await writeFile(join(scopedDir, "package.json"), JSON.stringify(pkg));
      const man = JSON.parse(await readFile(join(scopedDir, "framework.json"), "utf-8"));
      man.id = "@agenteer/node-triage";
      await writeFile(join(scopedDir, "framework.json"), JSON.stringify(man));

      const npm = simulatingNpm({
        fixtureDir: scopedDir,
        pkgName: "@agenteer/node-triage",
        // No attestations → provenance missing.
      });
      const res = await installNode({
        workflowDir,
        spec: "@agenteer/node-triage",
        workflowId: "d",
        grants: [],
        npm,
        autoApprove: true,
      });
      expect(res.ok).toBe(false);
      expect(res.reason).toBe("first_party_provenance_required");
      expect(npm.uninstalls).toBe(1);
    } finally {
      await rm(scopedDir, { recursive: true, force: true });
    }
  });
});
