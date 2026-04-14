/**
 * R4-A verification — install-time hard-stop for third-party
 * dynamic_actions:true packages (master plan open question R4-A).
 *
 * Contract:
 *   - Third-party + dynamic_actions:true → auto-approve is IGNORED.
 *     A confirm callback must be supplied and must return true.
 *   - @agenteer/* + dynamic_actions:true → auto-approve still works
 *     (first-party review is the trust boundary).
 *   - Third-party + static manifest → auto-approve works as before.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { installNode, type NpmRunner } from "../src/index.js";

const here = dirname(fileURLToPath(import.meta.url));
const dynamicFixture = join(here, "fixtures", "node-dynamic");

function copyingNpm(args: { fixtureDir: string; pkgName: string; attestations?: unknown }): NpmRunner & {
  uninstalls: number;
} {
  const runner = {
    uninstalls: 0,
    publish: async () => {},
    install: async (opts: { cwd: string; spec: string }) => {
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
            version: "0.2.0",
            dist: { attestations: args.attestations },
          } as never)
        : null,
  };
  return runner as NpmRunner & { uninstalls: number };
}

describe("R4-A: third-party dynamic_actions install requires explicit confirm", () => {
  let workflowDir: string;
  beforeEach(async () => {
    workflowDir = await mkdtemp(join(tmpdir(), "agenteer-r4a-"));
  });
  afterEach(async () => {
    await rm(workflowDir, { recursive: true, force: true });
  });

  it("autoApprove alone does NOT install a third-party dynamic_actions package", async () => {
    const npm = copyingNpm({ fixtureDir: dynamicFixture, pkgName: "@toy/node-dynamic" });
    const res = await installNode({
      workflowDir,
      spec: "@toy/node-dynamic",
      workflowId: "d",
      grants: [],
      npm,
      autoApprove: true,
      // No confirm supplied — hard-stop fires.
    });
    expect(res.ok).toBe(false);
    expect(res.reason).toBe("third_party_dynamic_actions_requires_confirmation");
    expect(res.dynamic_actions_hard_stop).toBe(true);
    expect(npm.uninstalls).toBe(1);
  });

  it("install completes when confirm callback returns true — --yes is not enough", async () => {
    const npm = copyingNpm({ fixtureDir: dynamicFixture, pkgName: "@toy/node-dynamic" });
    let confirmCalled = false;
    const res = await installNode({
      workflowDir,
      spec: "@toy/node-dynamic",
      workflowId: "d",
      grants: [],
      npm,
      autoApprove: true, // must be ignored
      confirm: (summary) => {
        confirmCalled = true;
        expect(summary.summary_text).toMatch(/dynamic_actions: true/);
        expect(summary.summary_text).toMatch(/explicit confirmation required/);
        return true;
      },
    });
    expect(confirmCalled).toBe(true);
    expect(res.ok).toBe(true);
    expect(res.id).toBe("@toy/node-dynamic");
  });

  it("confirm returning false surfaces the hard-stop reason in the result", async () => {
    const npm = copyingNpm({ fixtureDir: dynamicFixture, pkgName: "@toy/node-dynamic" });
    const res = await installNode({
      workflowDir,
      spec: "@toy/node-dynamic",
      workflowId: "d",
      grants: [],
      npm,
      autoApprove: true,
      confirm: () => false,
    });
    expect(res.ok).toBe(false);
    expect(res.reason).toBe("declined_by_user");
    expect(res.dynamic_actions_hard_stop).toBe(true);
  });

  it("@agenteer/* dynamic_actions package is auto-approvable (first-party trust)", async () => {
    // Rewrite the fixture as @agenteer/node-dynamic and give it attestations.
    const scoped = await mkdtemp(join(tmpdir(), "agenteer-scoped-"));
    try {
      await cp(dynamicFixture, scoped, { recursive: true });
      const pkg = JSON.parse(await readFile(join(scoped, "package.json"), "utf-8"));
      pkg.name = "@agenteer/node-dynamic";
      await writeFile(join(scoped, "package.json"), JSON.stringify(pkg));
      const man = JSON.parse(await readFile(join(scoped, "framework.json"), "utf-8"));
      man.id = "@agenteer/node-dynamic";
      await writeFile(join(scoped, "framework.json"), JSON.stringify(man));

      const npm = copyingNpm({
        fixtureDir: scoped,
        pkgName: "@agenteer/node-dynamic",
        attestations: { provenance: { predicateType: "https://slsa.dev/v1" } },
      });
      const res = await installNode({
        workflowDir,
        spec: "@agenteer/node-dynamic",
        workflowId: "d",
        grants: [],
        npm,
        autoApprove: true,
        // No confirm — first-party auto-approve must still succeed.
      });
      expect(res.ok).toBe(true);
      expect(res.id).toBe("@agenteer/node-dynamic");
    } finally {
      await rm(scoped, { recursive: true, force: true });
    }
  });
});
