import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  CrossCheckEngine,
  DEFAULT_POLICY,
  ComparatorRegistry,
  projectCanonical,
  diffPaths,
} from "../src/crosscheck/index.js";
import type { StructuredGenerator, StructuredGenerateOpts } from "../src/structured/index.js";

function fixedGen(value: unknown, id = "gen"): StructuredGenerator {
  let calls = 0;
  return {
    async generate<T>(_opts: StructuredGenerateOpts<T>): Promise<T> {
      calls += 1;
      return value as T;
    },
    get modelId() {
      return id;
    },
    get apiCallCount() {
      return calls;
    },
  };
}

const Schema = z.object({ verdict: z.string(), items: z.array(z.string()) });

describe("projectCanonical + diffPaths", () => {
  it("strips prose keys and sorts", () => {
    const a = projectCanonical({ summary: "nope", answer: 1, b: 2 });
    const b = projectCanonical({ b: 2, answer: 1, summary: "different" });
    expect(diffPaths(a, b)).toEqual([]);
  });

  it("flags differing paths", () => {
    const a = projectCanonical({ items: ["x", "y"] });
    const b = projectCanonical({ items: ["x", "z"] });
    const diffs = diffPaths(a, b);
    expect(diffs.length).toBe(1);
    expect(diffs[0]).toMatch(/items\[1\]/);
  });
});

describe("CrossCheckEngine", () => {
  it("agreement when primary and secondary match under canonical projection", async () => {
    const primary = fixedGen({ verdict: "pass", items: ["a", "b"] }, "p");
    const secondary = fixedGen({ verdict: "pass", items: ["a", "b"] }, "s");
    const engine = new CrossCheckEngine(primary, secondary, DEFAULT_POLICY);
    const out = await engine.run({
      systemPrompt: "",
      userPrompt: "",
      schema: Schema,
      schemaName: "Thing",
    });
    expect(out.kind).toBe("agreement");
  });

  it("disagreement returns disagreementKeys + stable fingerprint", async () => {
    const primary = fixedGen({ verdict: "pass", items: ["a"] }, "p");
    const secondary = fixedGen({ verdict: "pass", items: ["b"] }, "s");
    const engine = new CrossCheckEngine(primary, secondary, DEFAULT_POLICY);
    const out = await engine.run({
      systemPrompt: "",
      userPrompt: "",
      schema: Schema,
      schemaName: "Thing",
    });
    if (out.kind !== "disagreement") throw new Error("expected disagreement");
    expect(out.disagreementKeys.length).toBeGreaterThan(0);
    expect(out.fingerprint).toMatch(/^[0-9a-f]{12}$/);
  });

  it("missing_secondary_skip yields primary-only output", async () => {
    const primary = fixedGen({ verdict: "pass", items: [] }, "p");
    const engine = new CrossCheckEngine(primary, undefined, {
      ...DEFAULT_POLICY,
      on_missing_secondary: "warn_skip",
    });
    const out = await engine.run({
      systemPrompt: "",
      userPrompt: "",
      schema: Schema,
      schemaName: "Thing",
    });
    expect(out.kind).toBe("missing_secondary_skip");
  });

  it("ComparatorRegistry exact + prefix registration", () => {
    const reg = new ComparatorRegistry();
    reg.register("Exact", () => "E");
    reg.registerPrefix("Prefix", () => "P");
    expect(reg.projectOrCanonical("Exact", {})).toBe("E");
    expect(reg.projectOrCanonical("PrefixThing", {})).toBe("P");
    expect(reg.projectOrCanonical("Other", { x: 1 })).toEqual({ x: 1 });
  });
});
