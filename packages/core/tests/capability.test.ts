import { describe, expect, it } from "vitest";
import {
  CapabilityParseError,
  covers,
  parseCapability,
  isSubset,
  capabilitySet,
  capabilityCoversOperation,
  authorizeOperation,
  OperationDenied,
} from "../src/index.js";

describe("capability grammar (sub-plan 02 §1.1)", () => {
  it("parses each of the 11 resource types", () => {
    for (const raw of [
      "fs.read:/src/**",
      "fs.write:/out/**",
      "fs.delete:/tmp/**",
      "net.http:api.github.com/repos/**",
      "net.dns:*.internal",
      "shell.exec:",
      "model:anthropic/claude-opus-4-6",
      "context.read:spec.*",
      "context.write:findings.*",
      "spawn:@agenteer/node-*",
    ]) {
      expect(() => parseCapability(raw)).not.toThrow();
    }
  });

  it("rejects unknown resources and malformed scopes", () => {
    expect(() => parseCapability("fs.exec:/")).toThrow(CapabilityParseError);
    expect(() => parseCapability("shell.exec:foo")).toThrow(/scopeless/);
    expect(() => parseCapability("fs.read:relative/path")).toThrow(/start with '\/'/);
    expect(() => parseCapability("model:")).toThrow(/non-empty/);
    expect(() => parseCapability("fs.read:/src/*?")).toThrow(/'\?'/);
  });

  it("accepts '*' as entire scope for unconstrained", () => {
    expect(parseCapability("fs.read:*").scope).toBe("*");
    expect(parseCapability("model:*").scope).toBe("*");
  });
});

describe("covers() — glob and subset semantics", () => {
  const c = (s: string) => parseCapability(s);

  it("fs: parent's broader glob covers child's narrower glob", () => {
    expect(covers(c("fs.read:/src/**"), c("fs.read:/src/foo/bar.ts"))).toBe(true);
    expect(covers(c("fs.read:/src/**/*.ts"), c("fs.read:/src/a/b.ts"))).toBe(true);
    expect(covers(c("fs.read:/src/foo"), c("fs.read:/src/**"))).toBe(false);
  });

  it("fs: disjoint paths do not cover", () => {
    expect(covers(c("fs.read:/src/**"), c("fs.read:/etc/passwd"))).toBe(false);
  });

  it("fs: different resources never cover each other", () => {
    expect(covers(c("fs.read:/src/**"), c("fs.write:/src/foo"))).toBe(false);
  });

  it("net.http: host + optional path + optional port", () => {
    expect(covers(c("net.http:api.github.com"), c("net.http:api.github.com/repos/foo"))).toBe(true);
    expect(
      covers(c("net.http:api.github.com/repos/**"), c("net.http:api.github.com/repos/a/b")),
    ).toBe(true);
    expect(covers(c("net.http:*.github.com"), c("net.http:api.github.com"))).toBe(true);
    expect(covers(c("net.http:api.github.com"), c("net.http:*.github.com"))).toBe(false);
    expect(
      covers(c("net.http:api.github.com:443"), c("net.http:api.github.com:80")),
    ).toBe(false);
  });

  it("shell.exec: exact equality only", () => {
    expect(covers(c("shell.exec:"), c("shell.exec:"))).toBe(true);
  });

  it("model / spawn / context: glob over id", () => {
    expect(covers(c("model:*"), c("model:anthropic/claude-opus-4-6"))).toBe(true);
    expect(covers(c("spawn:@agenteer/node-*"), c("spawn:@agenteer/node-file-read"))).toBe(true);
    expect(covers(c("context.read:spec.*"), c("context.read:spec.draft"))).toBe(true);
  });

  it("'*' scope covers anything within the same resource", () => {
    expect(covers(c("fs.read:*"), c("fs.read:/any/path"))).toBe(true);
    expect(covers(c("fs.read:*"), c("fs.write:/any/path"))).toBe(false);
  });
});

describe("isSubset + capabilityCoversOperation", () => {
  it("returns missing capabilities for a superset child", () => {
    const parent = capabilitySet(["fs.read:/src/**", "model:*"]);
    const child = capabilitySet([
      "fs.read:/src/a.ts",
      "net.http:api.github.com/**",
    ]);
    const r = isSubset(child, parent);
    expect(r.ok).toBe(false);
    expect(r.missing.map((m) => m.raw)).toEqual(["net.http:api.github.com/**"]);
  });

  it("operation check on synthesized capability", () => {
    const granted = capabilitySet(["fs.read:/src/**"]);
    expect(capabilityCoversOperation(granted, parseCapability("fs.read:/src/a.ts"))).toBe(true);
    expect(() =>
      authorizeOperation(granted, { kind: "fs.write", path: "/src/a.ts" }),
    ).toThrow(OperationDenied);
  });
});
