/**
 * `@agenteer/node-context-curator` — the 18th v1 node (master plan open
 * #15 — **shipped in v1**). Sub-plan 01 §7.
 *
 * v1 scope: **query curator** only (sub-plan 01 §7.3 mode A). Given a
 * task description and a target manifest, emit a deterministic
 * `SliceSpec` that downstream nodes / planners can consume. Condensing
 * and pedagogical modes are v2.
 *
 * Emits a `Decision` item recording the curation choice so a later
 * `judge_with_stripped_ctx` can detect motivated reasoning.
 */

import { z } from "zod";
import {
  asArtifact,
  makeManifest,
  type Node,
  type NodeInput,
  type NodeManifest,
  type NodeResult,
} from "@agenteer/core";

const MANIFEST: NodeManifest = makeManifest({
  id: "@agenteer/node-context-curator",
  name: "context_curator",
  description:
    "Emit a deterministic SliceSpec for a downstream node based on task description and target manifest.",
  determinism: "deterministic",
  required_actions: [],
  tags: ["meta", "curator"],
  side_effects: {
    writes_fs: false,
    network: false,
    mutates_ctx: true,
    emits_ctx_variants: ["decision.curation", "artifact.slice_spec"],
  },
});

const ContextItemTypeSchema = z.enum([
  "artifact",
  "observation",
  "decision",
  "evidence_ref",
  "claim",
  "reference",
]);

const SelectorSchema = z.object({
  ids: z.array(z.string()).optional(),
  types: z.array(ContextItemTypeSchema).optional(),
  tags: z
    .object({
      any: z.array(z.string()).optional(),
      all: z.array(z.string()).optional(),
      none: z.array(z.string()).optional(),
    })
    .optional(),
  limit: z.number().int().positive().optional(),
  order: z.enum(["oldest", "newest"]).optional(),
});

type Selector = z.infer<typeof SelectorSchema>;

const InputSchema = z.object({
  task: z.string().min(1),
  target_manifest_id: z.string().min(1),
  /** Optional hints; the curator treats these as selector constraints. */
  hints: z
    .object({
      include_tags: z.array(z.string()).optional(),
      exclude_tags: z.array(z.string()).optional(),
      types: z.array(ContextItemTypeSchema).optional(),
      limit: z.number().int().positive().optional(),
    })
    .optional(),
  /** Name under which the slice spec is emitted to ctx. */
  emit_as: z.string().default("slice_spec"),
});

const SliceSpecSchema = z.object({
  name: z.string(),
  selector: SelectorSchema,
  stale_policy: z.enum(["reject", "recompute", "warn", "allow"]),
  freeze: z.enum(["snapshot", "live"]),
  budget: z
    .object({
      max_items: z.number().int().positive().optional(),
      max_bytes: z.number().int().positive().optional(),
    })
    .optional(),
});

const OutputSchema = z.object({
  slice_spec: SliceSpecSchema,
  rationale: z.string(),
});

type Input = z.input<typeof InputSchema>;
type Output = z.infer<typeof OutputSchema>;

export function contextCuratorFactory(): Node<Input, Output> {
  return {
    manifest: MANIFEST,
    inputSchema: InputSchema,
    outputSchema: OutputSchema,
    ctx: [],
    model: null,
    async execute(input: NodeInput<Input>): Promise<NodeResult<Output>> {
      const i = input.original;
      const hints = i.hints ?? {};
      const emitAs = i.emit_as ?? "slice_spec";

      const selector: Selector = { order: "newest" };
      if (hints.types && hints.types.length) selector.types = hints.types;
      if (hints.include_tags?.length || hints.exclude_tags?.length) {
        const tags: NonNullable<Selector["tags"]> = {};
        if (hints.include_tags?.length) tags.any = hints.include_tags;
        if (hints.exclude_tags?.length) tags.none = hints.exclude_tags;
        selector.tags = tags;
      }
      if (hints.limit !== undefined) selector.limit = hints.limit;

      const spec = {
        name: `curated.${i.target_manifest_id.replace(/[^a-z0-9]+/gi, "_")}`,
        selector,
        stale_policy: "warn" as const,
        freeze: "snapshot" as const,
        ...(hints.limit !== undefined ? { budget: { max_items: hints.limit } } : {}),
      };

      const rationale =
        `Curated a ${spec.freeze} slice for ${i.target_manifest_id} targeting "${i.task.slice(0, 80)}"` +
        (hints.include_tags ? `; include_tags=[${hints.include_tags.join(",")}]` : "") +
        (hints.exclude_tags ? `; exclude_tags=[${hints.exclude_tags.join(",")}]` : "") +
        (hints.types ? `; types=[${hints.types.join(",")}]` : "");

      return {
        kind: "output",
        value: { slice_spec: spec, rationale },
        ctx_patch: {
          // Decision item recording the curation choice — judge-friendly.
          set: {
            [`curator.choice.${spec.name}`]: rationale,
            [emitAs]: asArtifact(spec, { media_type: "application/json" }),
          },
        },
        evidence: { verdict: "pass" },
      };
    },
  };
}

export const contextCuratorManifest = MANIFEST;
