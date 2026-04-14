import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { scaffoldNode } from "../src/index.js";

describe("scaffoldNode", () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "agenteer-create-"));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("produces a valid package layout for a well-formed name", async () => {
    const res = await scaffoldNode({
      targetDir: dir,
      packageName: "@acme/node-bug-triage",
      description: "Triages GitHub issues",
      author: "acme-engineering",
    });
    expect(res.packageDir).toMatch(/node-bug-triage$/);
    expect(res.filesWritten).toContain("package.json");
    expect(res.filesWritten).toContain("framework.json");
    expect(res.filesWritten).toContain("src/index.ts");
    expect(res.filesWritten).toContain("tests/node.test.ts");
    expect(res.filesWritten).toContain("README.md");

    // package.json has the right convention.
    const pkg = JSON.parse(
      await readFile(join(res.packageDir, "package.json"), "utf-8"),
    );
    expect(pkg.name).toBe("@acme/node-bug-triage");
    expect(pkg.keywords).toContain("framework-node");
    expect(pkg.framework.manifest).toBe("./framework.json");

    // framework.json id matches package name.
    const man = JSON.parse(
      await readFile(join(res.packageDir, "framework.json"), "utf-8"),
    );
    expect(man.id).toBe("@acme/node-bug-triage");
    expect(man.manifest_version).toBe(1);
    expect(man.version).toBe("0.1.0");
    expect(man.determinism).toBe("deterministic");
    expect(man.description).toBe("Triages GitHub issues");

    // README mentions the package name.
    const readme = await readFile(join(res.packageDir, "README.md"), "utf-8");
    expect(readme).toMatch(/@acme\/node-bug-triage/);
  });

  it("rejects an invalid package name with an actionable error", async () => {
    await expect(
      scaffoldNode({ targetDir: dir, packageName: "bad-name" }),
    ).rejects.toThrow(/@<scope>\/node-<name>/);
  });

  it("refuses to overwrite without --force", async () => {
    await scaffoldNode({ targetDir: dir, packageName: "@toy/node-x" });
    await expect(
      scaffoldNode({ targetDir: dir, packageName: "@toy/node-x" }),
    ).rejects.toThrow(/already exists/);
  });

  it("force:true overwrites", async () => {
    await scaffoldNode({ targetDir: dir, packageName: "@toy/node-x" });
    await scaffoldNode({ targetDir: dir, packageName: "@toy/node-x", force: true });
    // No throw — success.
  });
});
