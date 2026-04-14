import { describe, expect, it } from "vitest";
import { authorizeSpawn, capabilitySet } from "../src/index.js";

const PARENT = capabilitySet([
  "fs.read:/src/**",
  "model:*",
  "spawn:@agenteer/node-*",
  "net.http:api.github.com/**",
]);

describe("authorizeSpawn (sub-plan 02 §1.3)", () => {
  it("grants the intersection of child's required with parent's effective", () => {
    const child = capabilitySet(["fs.read:/src/a.ts", "model:anthropic/claude-opus-4-6"]);
    const r = authorizeSpawn({
      parentEffective: PARENT,
      childManifestRequired: child,
      childManifestId: "@agenteer/node-foo",
      parentNodeId: "p1",
    });
    expect(r.ok).toBe(true);
    if (!r.ok) throw new Error("unreachable");
    expect(r.granted.caps.map((c) => c.raw).sort()).toEqual(
      ["fs.read:/src/a.ts", "model:anthropic/claude-opus-4-6"].sort(),
    );
  });

  it("denies when child requires capabilities parent doesn't hold", () => {
    const child = capabilitySet(["shell.exec:", "fs.read:/src/a.ts"]);
    const r = authorizeSpawn({
      parentEffective: PARENT,
      childManifestRequired: child,
      childManifestId: "@agenteer/node-evil",
      parentNodeId: "p1",
    });
    expect(r.ok).toBe(false);
    if (r.ok) throw new Error("unreachable");
    expect(r.reason).toBe("child_required_not_covered");
    expect(r.missing.map((c) => c.raw)).toEqual(["shell.exec:"]);
  });

  it("denies when parent attenuation exceeds its own effective set", () => {
    const child = capabilitySet(["fs.read:/src/a.ts"]);
    const attn = capabilitySet(["fs.read:/src/a.ts", "fs.write:/out/**"]);
    const r = authorizeSpawn({
      parentEffective: PARENT,
      childManifestRequired: child,
      parentAttenuation: attn,
      childManifestId: "@agenteer/node-foo",
      parentNodeId: "p1",
    });
    expect(r.ok).toBe(false);
    if (r.ok) throw new Error("unreachable");
    expect(r.reason).toBe("parent_cannot_attenuate_beyond_effective");
  });

  it("attenuation narrows the grant below what the child asked for", () => {
    const child = capabilitySet(["model:*"]);
    const attn = capabilitySet(["model:anthropic/claude-opus-4-6"]);
    const r = authorizeSpawn({
      parentEffective: PARENT,
      childManifestRequired: child,
      parentAttenuation: attn,
      childManifestId: "@agenteer/node-llm",
      parentNodeId: "p1",
    });
    // Attenuation `model:anthropic/claude-opus-4-6` doesn't cover `model:*`
    // (specific doesn't cover wildcard) — this should DENY per invariant 2.
    expect(r.ok).toBe(false);
    if (r.ok) throw new Error("unreachable");
    expect(r.reason).toBe("child_required_not_covered");
  });
});
