import { describe, expect, it } from "vitest";
import { assertNotDenied, DenylistViolation, isDenied } from "../src/index.js";

describe("hard denylist (sub-plan 02 §1.6)", () => {
  it("throws on sensitive system prefixes", () => {
    expect(() => assertNotDenied("/etc/passwd")).toThrow(DenylistViolation);
    expect(() => assertNotDenied("/proc/cpuinfo")).toThrow(DenylistViolation);
    expect(() => assertNotDenied("/dev/null")).toThrow(DenylistViolation);
  });

  it("allows ordinary paths", () => {
    expect(() => assertNotDenied("/tmp/agenteer-test-ok")).not.toThrow();
  });

  it("rejects null-byte paths", () => {
    const r = isDenied("/tmp/foo\0bar");
    expect(r.denied).toBe(true);
  });

  it("isDenied returns structured result", () => {
    const r = isDenied("/etc/shadow");
    expect(r.denied).toBe(true);
    expect(r.reason).toMatch(/sensitive/);
  });
});
