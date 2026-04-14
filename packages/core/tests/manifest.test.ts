import { describe, expect, it } from "vitest";
import { validateManifest, ManifestValidationError } from "../src/index.js";

const base = {
  manifest_version: 1 as const,
  id: "@agenteer/node-sample",
  version: "0.1.0",
  name: "sample",
  description: "A sample",
  determinism: "stochastic" as const,
};

describe("NodeManifestSchema", () => {
  it("accepts a minimal well-formed manifest", () => {
    const m = validateManifest(base);
    expect(m.id).toBe("@agenteer/node-sample");
    expect(m.required_actions).toEqual([]);
    expect(m.dynamic_actions).toBe(false);
  });

  it("rejects a malformed id or version", () => {
    expect(() => validateManifest({ ...base, id: "not-scoped" })).toThrow(ManifestValidationError);
    expect(() => validateManifest({ ...base, version: "1.0" })).toThrow(ManifestValidationError);
  });

  it("rejects a capability string that fails to parse", () => {
    expect(() =>
      validateManifest({ ...base, required_actions: ["fs.read:relative/path"] }),
    ).toThrow(/start with '\/'/);
  });

  it("enforces §R4 — dynamic_action_spec required iff dynamic_actions=true", () => {
    expect(() =>
      validateManifest({ ...base, dynamic_actions: true }),
    ).toThrow(/dynamic_action_spec is required/);
    expect(() =>
      validateManifest({ ...base, dynamic_actions: false, dynamic_action_spec: "tool:${x}" }),
    ).toThrow(/only valid when dynamic_actions is true/);
    expect(() =>
      validateManifest({
        ...base,
        dynamic_actions: true,
        dynamic_action_spec: "tool:${input.tool_name}",
        side_effects: { writes_fs: false, network: false, mutates_ctx: false, emits_ctx_variants: [], reads_ctx_variants: [] },
      }),
    ).not.toThrow();
  });

  it("enforces side-effects consistency with required_actions", () => {
    expect(() =>
      validateManifest({
        ...base,
        required_actions: ["fs.write:/out/**"],
        side_effects: { writes_fs: false, network: false, mutates_ctx: false, emits_ctx_variants: [], reads_ctx_variants: [] },
      }),
    ).toThrow(/writes_fs/);

    expect(() =>
      validateManifest({
        ...base,
        required_actions: ["net.http:api.example.com/**"],
        side_effects: { writes_fs: false, network: false, mutates_ctx: false, emits_ctx_variants: [], reads_ctx_variants: [] },
      }),
    ).toThrow(/network/);
  });

  it("strict mode rejects unknown fields", () => {
    expect(() => validateManifest({ ...base, unexpected: true })).toThrow(ManifestValidationError);
  });
});
