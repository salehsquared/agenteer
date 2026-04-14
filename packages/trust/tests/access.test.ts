import { describe, expect, it } from "vitest";
import { mkdtemp, rm, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  DEFAULT_DENYLIST_CHECKER,
  DenylistChecker,
  DenylistViolation,
  snapshot,
  diffSnapshots,
} from "../src/access/index.js";

describe("DenylistChecker", () => {
  it("rejects sensitive system prefixes", () => {
    expect(() => DEFAULT_DENYLIST_CHECKER.assertAllowed("/etc/passwd")).toThrow(DenylistViolation);
    expect(() => DEFAULT_DENYLIST_CHECKER.assertAllowed("/proc/cpuinfo")).toThrow(DenylistViolation);
  });

  it("allows ordinary temp paths", () => {
    expect(() => DEFAULT_DENYLIST_CHECKER.assertAllowed("/tmp/agenteer-test")).not.toThrow();
  });

  it("extend adds paths; never removes defaults", () => {
    const extended = new DenylistChecker({ extend: ["/my/secret"] });
    expect(extended.isAllowed("/my/secret/file")).toBe(false);
    expect(extended.isAllowed("/etc/passwd")).toBe(false);
  });
});

describe("snapshot + diffSnapshots", () => {
  it("detects authorized writes vs. unauthorized writes", async () => {
    const root = await mkdtemp(join(tmpdir(), "agenteer-snap-"));
    try {
      await mkdir(join(root, "src"), { recursive: true });
      await mkdir(join(root, "out"), { recursive: true });
      await writeFile(join(root, "src", "a.ts"), "export {};", "utf8");
      await writeFile(join(root, "out", "existing.js"), "// old", "utf8");

      const before = await snapshot(
        { include: ["src/**", "out/**"] },
        root,
      );

      // Authorized: write to out/
      await writeFile(join(root, "out", "new.js"), "// new", "utf8");
      // Unauthorized: modify src/
      await writeFile(join(root, "src", "a.ts"), "export const x = 1;", "utf8");

      const after = await snapshot(
        { include: ["src/**", "out/**"] },
        root,
      );

      const violations = diffSnapshots(before, after, ["out/**"], [], "@agenteer/test");
      expect(violations.map((v) => v.path).sort()).toEqual(["src/a.ts"]);
      expect(violations[0]!.type).toBe("unauthorized_write");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("new files outside allowed write scope are unauthorized_write", async () => {
    const root = await mkdtemp(join(tmpdir(), "agenteer-snap-"));
    try {
      await mkdir(join(root, "a"), { recursive: true });
      await mkdir(join(root, "b"), { recursive: true });

      const before = await snapshot({ include: ["a/**", "b/**"] }, root);
      await writeFile(join(root, "a", "created.txt"), "x", "utf8");
      const after = await snapshot({ include: ["a/**", "b/**"] }, root);

      const v = diffSnapshots(before, after, ["b/**"], [], "@test");
      expect(v).toHaveLength(1);
      expect(v[0]!.path).toBe("a/created.txt");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("no changes → no violations", async () => {
    const root = await mkdtemp(join(tmpdir(), "agenteer-snap-"));
    try {
      await writeFile(join(root, "f.txt"), "x", "utf8");
      const snap = await snapshot({ include: ["**"] }, root);
      expect(diffSnapshots(snap, snap, [], [], "@t")).toEqual([]);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
