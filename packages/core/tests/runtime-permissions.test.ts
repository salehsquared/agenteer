/**
 * Runtime-level integration tests for the permission kernel.
 *
 * Covers master plan milestone M2 verification:
 *   "attempt over-permissioned child spawn → runtime refuses;
 *    5 stdlib nodes pass their own manifest tests."
 *
 * Stdlib checks live in packages/stdlib/tests. This file focuses on the
 * kernel-integration paths inside @agenteer/core.
 */

import { describe, expect, it } from "vitest";
import {
  InMemoryContextStore,
  InMemoryNodeRegistry,
  MemoryEvidenceSink,
  Runtime,
  RuntimeEvents,
  makeManifest,
  type Node,
  type NodeInput,
  type NodeResult,
  type NodeSpawn,
} from "../src/index.js";

const CHILD_ID = "@agenteer/node-over-permissioned";
const PARENT_ID = "@agenteer/node-requesting-parent";

describe("Runtime — permission kernel integration", () => {
  it("refuses a child spawn when the parent doesn't hold the required caps", async () => {
    const registry = new InMemoryNodeRegistry();
    const contextStore = new InMemoryContextStore();
    const evidenceSink = new MemoryEvidenceSink();
    const events = new RuntimeEvents();
    const permDenials: unknown[] = [];
    events.on("permission_denied", (e) => permDenials.push(e));

    // Child manifest requires fs.write:/out/** — parent won't hold it.
    const childManifest = makeManifest({
      id: CHILD_ID,
      name: "over_permissioned",
      description: "wants more than its parent will grant",
      determinism: "deterministic",
      required_actions: ["fs.write:/out/**"],
    });
    registry.register(childManifest, () => {
      const node: Node<{}, {}> = {
        manifest: childManifest,
        ctx: [],
        model: null,
        async execute() {
          return { kind: "output", value: {}, evidence: { verdict: "pass" } };
        },
      };
      return node;
    });

    // Parent only holds spawn rights — not fs.write.
    const parentManifest = makeManifest({
      id: PARENT_ID,
      name: "requesting_parent",
      description: "tries to spawn a child it cannot grant",
      determinism: "deterministic",
      required_actions: [`spawn:${CHILD_ID}`],
    });
    registry.register(parentManifest, () => {
      const node: Node<{}, { childKind: string }> = {
        manifest: parentManifest,
        ctx: [],
        model: null,
        async execute(input: NodeInput<{}>): Promise<NodeResult<{ childKind: string }>> {
          if (!input.children) {
            return {
              kind: "spawn_children",
              join: { mode: "all" },
              children: [
                {
                  manifest_id: CHILD_ID,
                  input: {},
                  correlation: "c1",
                },
              ],
            };
          }
          const r = input.children[0]!.result;
          return {
            kind: "output",
            value: { childKind: r.kind },
            evidence: { verdict: "pass" },
          };
        },
      };
      return node;
    });

    const runtime = new Runtime({ registry, contextStore, evidenceSink, events });
    const rootSpawn: NodeSpawn = {
      manifest_id: PARENT_ID,
      input: {},
      correlation: "root",
    };
    // Root grants: parent's spawn cap, but NOT fs.write.
    const outcome = await runtime.run(rootSpawn, [`spawn:${PARENT_ID}`, `spawn:${CHILD_ID}`]);

    expect(outcome.finalStatus).toBe("completed");
    if (outcome.rootResult?.kind !== "output") throw new Error("unreachable");
    const { childKind } = outcome.rootResult.value as { childKind: string };
    expect(childKind).toBe("failed"); // child result bubbles up as Failed, not a runtime abort

    // Kernel emitted permission_denied.
    expect(permDenials.length).toBe(1);
    const deny = permDenials[0] as { reason: string; attempted: { spawnManifest?: string } };
    expect(deny.reason).toMatch(/child_required_not_covered/);
    expect(deny.attempted.spawnManifest).toBe(CHILD_ID);
  });

  it("validates input against the node's Zod schema before execute", async () => {
    const registry = new InMemoryNodeRegistry();
    const contextStore = new InMemoryContextStore();
    const evidenceSink = new MemoryEvidenceSink();
    const events = new RuntimeEvents();

    const { z } = await import("zod");
    const InputSchema = z.object({ n: z.number().int() });
    const OutputSchema = z.object({ doubled: z.number().int() });
    const id = "@agenteer/node-strict-double";
    const manifest = makeManifest({
      id,
      name: "strict_double",
      description: "doubles an int",
      determinism: "deterministic",
    });
    registry.register(manifest, () => ({
      manifest,
      inputSchema: InputSchema,
      outputSchema: OutputSchema,
      ctx: [],
      model: null,
      async execute(input) {
        return {
          kind: "output",
          value: { doubled: (input.original as { n: number }).n * 2 },
          evidence: { verdict: "pass" },
        };
      },
    }));
    const runtime = new Runtime({ registry, contextStore, evidenceSink, events });
    const outcome = await runtime.run(
      { manifest_id: id, input: { n: "not a number" }, correlation: "r" },
      [`spawn:${id}`],
    );
    expect(outcome.finalStatus).toBe("failed");
    if (outcome.rootResult?.kind !== "failed") throw new Error("unreachable");
    expect(outcome.rootResult.reason).toBe("input_schema_violation");
  });
});
