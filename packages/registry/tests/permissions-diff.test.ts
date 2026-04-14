import { describe, expect, it } from "vitest";
import { diffPermissions, renderPermissionsDiff } from "../src/index.js";

describe("diffPermissions", () => {
  it("returns all caps as covered when fully subsumed by granted", () => {
    const diff = diffPermissions({
      required: ["fs.read:/tmp/**", "model:claude-sonnet-4-5"],
      granted: ["fs.read:/**", "model:claude-*"],
    });
    expect(diff.new_required).toEqual([]);
    expect(diff.already_covered).toEqual(["fs.read:/tmp/**", "model:claude-sonnet-4-5"]);
  });

  it("surfaces caps that exceed the workflow grants", () => {
    const diff = diffPermissions({
      required: [
        "fs.read:/tmp/**",
        "net.http:api.github.com/**",
        "context.write:triage.*",
      ],
      granted: ["fs.read:/**"],
    });
    expect(diff.new_required.sort()).toEqual([
      "context.write:triage.*",
      "net.http:api.github.com/**",
    ]);
    expect(diff.already_covered).toEqual(["fs.read:/tmp/**"]);
  });

  it("empty required trivially covered", () => {
    const diff = diffPermissions({ required: [], granted: [] });
    expect(diff.already_covered).toEqual([]);
    expect(diff.new_required).toEqual([]);
  });

  it("renderPermissionsDiff mentions the new caps required", () => {
    const diff = diffPermissions({
      required: ["net.http:api.github.com/**"],
      granted: [],
    });
    const text = renderPermissionsDiff("@toy/node-triage", "1.2.0", diff);
    expect(text).toMatch(/Installing @toy\/node-triage@1\.2\.0/);
    expect(text).toMatch(/\+ net\.http:api\.github\.com\/\*\*/);
  });
});
