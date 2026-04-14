import { describe, expect, it } from "vitest";
import {
  explainManifestIssues,
  explainPermissionDenial,
  renderExplainedIssues,
  tryValidateManifest,
  parseCapability,
} from "../src/index.js";

describe("explainPermissionDenial", () => {
  it("lists missing caps + current grants + fix options", () => {
    const text = explainPermissionDenial({
      denial: {
        ok: false,
        reason: "child_required_not_covered",
        missing: [parseCapability("net.http:api.github.com/**")],
      },
      childManifestId: "@acme/node-triage",
      grantedCaps: ["fs.read:/tmp/**"],
      context: "root spawn",
    });
    expect(text).toMatch(/root spawn/);
    expect(text).toMatch(/@acme\/node-triage/);
    expect(text).toMatch(/Missing caps/);
    expect(text).toMatch(/net\.http:api\.github\.com\/\*\*/);
    expect(text).toMatch(/Add the missing caps/);
    expect(text).toMatch(/Attenuate the spawn/);
  });

  it("says 'no grants' when the parent had none", () => {
    const text = explainPermissionDenial({
      denial: {
        ok: false,
        reason: "child_required_not_covered",
        missing: [parseCapability("spawn:@x/node-y")],
      },
      childManifestId: "@x/node-y",
      grantedCaps: [],
    });
    expect(text).toMatch(/Parent has NO grants/);
  });
});

describe("explainManifestIssues + renderExplainedIssues", () => {
  it("hints on id regex violation with the canonical fix text", () => {
    const res = tryValidateManifest({
      manifest_version: 1,
      id: "bad-name",
      version: "1.0.0",
      name: "x",
      description: "y",
      determinism: "deterministic",
    });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    const issues = explainManifestIssues(res.issues);
    const idIssue = issues.find((i) => i.path === "id");
    expect(idIssue).toBeDefined();
    expect(idIssue!.hint).toMatch(/@<scope>\/node-<name>/);
  });

  it("hints on semver / dynamic_action_spec / required_actions", () => {
    const res = tryValidateManifest({
      manifest_version: 1,
      id: "@acme/node-x",
      version: "not-semver",
      name: "x",
      description: "y",
      determinism: "deterministic",
      dynamic_actions: true,
      // missing dynamic_action_spec → one issue
    });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    const explained = explainManifestIssues(res.issues);
    expect(explained.some((e) => e.hint?.includes("semver"))).toBe(true);
    expect(explained.some((e) => e.hint?.includes("dynamic_action_spec"))).toBe(true);
    const rendered = renderExplainedIssues(explained);
    expect(rendered).toMatch(/hint:/);
  });
});
