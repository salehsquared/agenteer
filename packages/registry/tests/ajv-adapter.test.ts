/**
 * A5: ajv JSON Schema → Zod bridge. A publisher ships `input_schema` /
 * `output_schema` as JSON Schema (no Zod), we wrap it so the core
 * runtime's `safeParse`-based validator accepts or rejects with
 * actionable paths.
 */

import { describe, expect, it } from "vitest";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  compileNodeSchemas,
  jsonSchemaToZod,
  loadManifestFromPackage,
} from "../src/index.js";

const here = dirname(fileURLToPath(import.meta.url));
const fixtureDir = join(here, "fixtures", "node-jsonschema");

describe("jsonSchemaToZod", () => {
  it("accepts valid input and rejects invalid with ajv path+message", () => {
    const schema = jsonSchemaToZod<{ n: number }>({
      type: "object",
      required: ["n"],
      properties: { n: { type: "integer", minimum: 0 } },
      additionalProperties: false,
    });
    const ok = schema.safeParse({ n: 5 });
    expect(ok.success).toBe(true);

    const bad = schema.safeParse({ n: -1 });
    expect(bad.success).toBe(false);
    if (!bad.success) {
      const msg = bad.error.issues.map((i) => i.message).join(" | ");
      expect(msg).toMatch(/must be >= 0|minimum/i);
    }

    const missing = schema.safeParse({});
    expect(missing.success).toBe(false);

    const extra = schema.safeParse({ n: 1, oops: true });
    expect(extra.success).toBe(false);
  });

  it("preserves ajv path into Zod issue path for actionable errors", () => {
    const schema = jsonSchemaToZod({
      type: "object",
      required: ["items"],
      properties: {
        items: { type: "array", items: { type: "integer" } },
      },
    });
    const bad = schema.safeParse({ items: [1, "two", 3] });
    expect(bad.success).toBe(false);
    if (!bad.success) {
      const issue = bad.error.issues[0]!;
      expect(issue.path).toEqual(["items", 1]);
    }
  });
});

describe("compileNodeSchemas on a JSON-Schema-only fixture", () => {
  it("loads the manifest and compiles input + output validators", async () => {
    const loaded = await loadManifestFromPackage(fixtureDir);
    const { inputSchema, outputSchema } = compileNodeSchemas(loaded.manifest);
    expect(inputSchema).toBeDefined();
    expect(outputSchema).toBeDefined();

    // Valid input.
    const good = inputSchema!.safeParse({ finding: "auth timeout", severity: "high" });
    expect(good.success).toBe(true);

    // Wrong enum value.
    const bad = inputSchema!.safeParse({ finding: "x", severity: "enormous" });
    expect(bad.success).toBe(false);

    // Empty finding.
    const empty = inputSchema!.safeParse({ finding: "", severity: "low" });
    expect(empty.success).toBe(false);

    // Output bounds.
    expect(outputSchema!.safeParse({ score: 50 }).success).toBe(true);
    expect(outputSchema!.safeParse({ score: 150 }).success).toBe(false);
    expect(outputSchema!.safeParse({ score: "high" }).success).toBe(false);
  });

  it("returns undefined for a side when the manifest doesn't ship a schema there", async () => {
    // Reuse a manifest that has no schemas — the earlier node-toy fixture.
    const toy = await loadManifestFromPackage(join(here, "fixtures", "node-toy"));
    const { inputSchema, outputSchema } = compileNodeSchemas(toy.manifest);
    expect(inputSchema).toBeUndefined();
    expect(outputSchema).toBeUndefined();
  });
});
