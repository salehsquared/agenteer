/**
 * `@agenteer/node-parallel-fanout` — meta-node that spawns N children
 * of a target manifest (sub-plan 03 §12), collects their results, and
 * applies an optional merger. Children run in parallel up to the
 * runtime's `max_concurrent_children`.
 *
 * Typical shape: run the same `llm_call` N times with different prompts,
 * or run a validator against several candidate patches and take the
 * best-verdict one.
 */

import { z } from "zod";
import {
  makeManifest,
  type Node,
  type NodeInput,
  type NodeManifest,
  type NodeResult,
} from "@agenteer/core";

const MANIFEST: NodeManifest = makeManifest({
  id: "@agenteer/node-parallel-fanout",
  name: "parallel_fanout",
  description:
    "Spawn N children of a target manifest with per-child inputs; collect and optionally merge results.",
  determinism: "stochastic",
  // Children handle their own capabilities; the fanout itself only
  // spawns. Runtime narrows via the parent's envelope.
  required_actions: [],
  dynamic_actions: true,
  dynamic_action_spec: "spawn:${input.manifest_id}",
  tags: ["meta"],
});

const InputSchema = z.object({
  manifest_id: z.string().min(1),
  /** Per-child input payload. Length decides the fan-out degree. */
  inputs: z.array(z.unknown()).min(1),
  /** How to consume children. `all` re-enters with every result; `any`
   *  short-circuits on the first output; `race` bounds by a budget. */
  join: z
    .union([
      z.object({ mode: z.literal("all") }),
      z.object({ mode: z.literal("any") }),
      z.object({
        mode: z.literal("race_with_budget"),
        budget_ms: z.number().int().positive(),
        min_results: z.number().int().positive(),
      }),
    ])
    .default({ mode: "all" }),
  /** Optional merger — defaults to returning the raw array. */
  merge: z
    .union([
      z.literal("concat"),
      z.literal("first_pass"),
      z.literal("first_output"),
    ])
    .default("concat"),
  attenuate: z.array(z.string()).optional(),
});

const OutputSchema = z.object({
  mode: z.enum(["all", "any", "race_with_budget"]),
  /** Per-child summary: correlation + result-kind + (for output) value. */
  children: z.array(
    z.object({
      correlation: z.string(),
      kind: z.string(),
      value: z.unknown().optional(),
      reason: z.string().optional(),
    }),
  ),
  /** Merged payload per `merge`. */
  merged: z.unknown(),
});

type Input = z.input<typeof InputSchema>;
type Output = z.infer<typeof OutputSchema>;

export function parallelFanoutFactory(): Node<Input, Output> {
  return {
    manifest: MANIFEST,
    inputSchema: InputSchema,
    outputSchema: OutputSchema,
    ctx: [],
    model: null,
    async execute(input: NodeInput<Input>): Promise<NodeResult<Output>> {
      const spec = input.original;

      if (!input.children) {
        // First call: fan out.
        return {
          kind: "spawn_children",
          join: spec.join ?? { mode: "all" },
          children: spec.inputs.map((childInput, i) => ({
            manifest_id: spec.manifest_id,
            input: childInput,
            correlation: `fan-${i}`,
            ...(spec.attenuate ? { attenuate: spec.attenuate } : {}),
          })),
        };
      }

      // Re-entry: collect + merge.
      const children = input.children.map((c) => {
        const base = { correlation: c.correlation, kind: c.result.kind };
        if (c.result.kind === "output") {
          return { ...base, value: (c.result as { value: unknown }).value };
        }
        if (c.result.kind === "failed") {
          return { ...base, reason: (c.result as { reason: string }).reason };
        }
        return base;
      });

      const mergeMode = spec.merge ?? "concat";
      const values: unknown[] = [];
      for (const c of children) {
        if (c.kind === "output" && "value" in c) values.push((c as { value: unknown }).value);
      }
      const merged =
        mergeMode === "first_output"
          ? (values[0] ?? null)
          : mergeMode === "first_pass"
            ? (values.find((v) => !!v) ?? null)
            : values;

      const mode = (spec.join ?? { mode: "all" }).mode;
      return {
        kind: "output",
        value: { mode, children, merged },
        evidence: {
          verdict:
            children.some((c) => c.kind === "output") ? "pass" : "fail",
        },
      };
    },
  };
}

export const parallelFanoutManifest = MANIFEST;
