/**
 * A5 acceptance — disk-loaded JSON-Schema-only node plugs into the
 * runtime's existing safeParse validation path. Demonstrates that a
 * non-Zod publisher can ship a node package and get runtime-enforced
 * input/output validation for free.
 */

import { describe, expect, it } from "vitest";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  InMemoryContextStore,
  InMemoryNodeRegistry,
  MemoryEvidenceSink,
  Runtime,
  type Node,
  type NodeResult,
} from "@agenteer/core";
import {
  compileNodeSchemas,
  loadManifestFromPackage,
} from "@agenteer/registry";

const here = dirname(fileURLToPath(import.meta.url));
const fixtureDir = join(here, "..", "..", "registry", "tests", "fixtures", "node-jsonschema");

describe("A5: JSON-Schema-only node — runtime end-to-end", () => {
  it("valid input passes, bad input fails with ajv-sourced issue message", async () => {
    const loaded = await loadManifestFromPackage(fixtureDir);
    const { inputSchema, outputSchema } = compileNodeSchemas(loaded.manifest);
    expect(inputSchema).toBeDefined();
    expect(outputSchema).toBeDefined();

    type In = { finding: string; severity: "low" | "medium" | "high" };
    type Out = { score: number };

    const node: Node<In, Out> = {
      manifest: loaded.manifest,
      ...(inputSchema ? { inputSchema: inputSchema as never } : {}),
      ...(outputSchema ? { outputSchema: outputSchema as never } : {}),
      ctx: [],
      model: null,
      async execute(input): Promise<NodeResult<Out>> {
        const i = input.original;
        const base = i.severity === "high" ? 90 : i.severity === "medium" ? 50 : 20;
        return {
          kind: "output",
          value: { score: base + i.finding.length },
          evidence: { verdict: "pass" },
        };
      },
    };

    const registry = new InMemoryNodeRegistry();
    registry.register(loaded.manifest, () => node);
    const runtime = new Runtime({
      registry,
      contextStore: new InMemoryContextStore(),
      evidenceSink: new MemoryEvidenceSink(),
    });

    // Valid input completes.
    const good = await runtime.run(
      {
        manifest_id: loaded.manifest.id,
        input: { finding: "auth", severity: "high" },
        correlation: "root",
      },
      [`spawn:${loaded.manifest.id}`],
    );
    expect(good.finalStatus).toBe("completed");
    if (good.rootResult?.kind !== "output") throw new Error("unreachable");
    expect((good.rootResult.value as Out).score).toBe(94);

    // Invalid severity enum rejected at input validation (ajv → Zod issue).
    const bad = await runtime.run(
      {
        manifest_id: loaded.manifest.id,
        input: { finding: "x", severity: "enormous" },
        correlation: "root",
      },
      [`spawn:${loaded.manifest.id}`],
    );
    expect(bad.finalStatus).toBe("failed");
    if (bad.rootResult?.kind !== "failed") throw new Error("unreachable");
    expect(bad.rootResult.reason).toMatch(/input_schema_violation/);
    // The issues carry the ajv message — actionable, not just "invalid".
    const details = bad.rootResult.details as { path: (string | number)[]; message: string }[];
    expect(Array.isArray(details)).toBe(true);
    expect(details.some((d) => d.path.includes("severity"))).toBe(true);
  });
});
