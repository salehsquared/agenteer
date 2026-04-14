/**
 * `@agenteer/node-file-read` — permissioned filesystem read (sub-plan 03 §3).
 *
 * Deterministic. Declares `fs.read:*`; actual scope attenuation happens at
 * spawn time. At dispatch the permission kernel synthesizes the concrete
 * `fs.read:<path>` capability and checks against `granted`.
 */

import { z } from "zod";
import {
  makeManifest,
  type Node,
  type NodeInput,
  type NodeManifest,
  type NodeResult,
  type NodeRuntimeHandle,
} from "@agenteer/core";

const MANIFEST: NodeManifest = makeManifest({
  id: "@agenteer/node-file-read",
  name: "file_read",
  description: "Read a file from disk into a string. Capability-gated at dispatch.",
  determinism: "deterministic",
  // Static caps: none. Dynamic augmentation derives the concrete fs.read
  // scope from input.path at spawn time (master plan §R4).
  required_actions: [],
  dynamic_actions: true,
  dynamic_action_spec: "fs.read:${input.path}",
  tags: ["primitive", "fs"],
  side_effects: {
    writes_fs: false,
    network: false,
    mutates_ctx: true,
    emits_ctx_variants: ["artifact.file_read"],
  },
});

const InputSchema = z.object({
  path: z.string().min(1),
  /** Optional ctx tag to emit the content under via ctx_patch.set. */
  emit_as: z.string().optional(),
});

const OutputSchema = z.object({
  path: z.string(),
  content: z.string(),
  bytes: z.number().int().nonnegative(),
});

type Input = z.infer<typeof InputSchema>;
type Output = z.infer<typeof OutputSchema>;

export function fileReadFactory(): Node<Input, Output> {
  return {
    manifest: MANIFEST,
    inputSchema: InputSchema,
    outputSchema: OutputSchema,
    ctx: [],
    model: null,
    async execute(input: NodeInput<Input>, handle: NodeRuntimeHandle): Promise<NodeResult<Output>> {
      const { path, emit_as } = input.original;
      try {
        const content = await handle.callAction<string>("fs.read", { path });
        return {
          kind: "output",
          value: { path, content, bytes: Buffer.byteLength(content, "utf8") },
          ...(emit_as ? { ctx_patch: { set: { [emit_as]: content } } } : {}),
          evidence: { verdict: "pass" },
        };
      } catch (err) {
        return {
          kind: "failed",
          reason: err instanceof Error ? err.message : String(err),
          retryable: false,
          evidence: { verdict: "fail" },
        };
      }
    },
  };
}

export const fileReadManifest = MANIFEST;
