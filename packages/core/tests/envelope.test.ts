import { describe, it, expect } from "vitest";
import { EMPTY_ENVELOPE, intersectEnvelope, isSpawnAllowed } from "../src/index.js";

describe("PermissionEnvelope.intersect", () => {
  const parent = {
    models_allowed: ["claude-opus-4", "gpt-4"],
    actions_allowed: ["fs.read", "net.http"],
    new_node_states_allowed: ["a", "b"],
    ctx_keys: ["x", "y"],
  };

  it("null request returns parent unchanged", () => {
    expect(intersectEnvelope(parent, null)).toEqual(parent);
  });

  it("undefined field in request inherits parent's value", () => {
    const out = intersectEnvelope(parent, { models_allowed: ["claude-opus-4"] });
    expect(out.models_allowed).toEqual(["claude-opus-4"]);
    expect(out.actions_allowed).toEqual(parent.actions_allowed);
  });

  it("asking for more than parent silently drops the excess (M1; M2 kernel will raise)", () => {
    const out = intersectEnvelope(parent, { actions_allowed: ["fs.read", "shell.exec"] });
    expect(out.actions_allowed).toEqual(["fs.read"]);
  });
});

describe("isSpawnAllowed", () => {
  it("allows anything when parent's allowlist is empty (M1 convention)", () => {
    expect(isSpawnAllowed(EMPTY_ENVELOPE, "anything@1").allowed).toBe(true);
  });

  it("denies when manifest is absent from a non-empty allowlist", () => {
    const env = { ...EMPTY_ENVELOPE, new_node_states_allowed: ["a@1"] };
    const r = isSpawnAllowed(env, "b@1");
    expect(r.allowed).toBe(false);
    expect(r.reason).toMatch(/not in parent/);
  });
});
