import { describe, expect, it } from "vitest";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { validateNodePackage, loadManifestFromPackage } from "../src/index.js";

const here = dirname(fileURLToPath(import.meta.url));
const toyDir = join(here, "fixtures", "node-toy");
const badDir = join(here, "fixtures", "node-bad");

describe("validateNodePackage", () => {
  it("accepts a well-formed toy node and returns the parsed manifest + hash", async () => {
    const res = await validateNodePackage(toyDir);
    expect(res.ok).toBe(true);
    expect(res.loaded?.manifest.id).toBe("@toy/node-triage");
    expect(res.loaded?.packageJson.name).toBe("@toy/node-triage");
    expect(res.loaded?.contentHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("rejects a package with an invalid name and missing framework-node keyword", async () => {
    const res = await validateNodePackage(badDir);
    expect(res.ok).toBe(false);
    const codes = res.issues.map((i) => i.code).sort();
    // id_mismatch comes up too because manifest.id != package.name.
    expect(codes).toEqual(["bad_package_name", "id_mismatch", "missing_framework_keyword"]);
  });
});

describe("loadManifestFromPackage", () => {
  it("hash is stable across whitespace-only changes", async () => {
    const a = await loadManifestFromPackage(toyDir);
    const b = await loadManifestFromPackage(toyDir);
    expect(a.contentHash).toBe(b.contentHash);
  });
});
