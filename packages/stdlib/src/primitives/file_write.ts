/**
 * `@agenteer/node-file-write` — permissioned filesystem write (sub-plan 03 §4).
 *
 * Deterministic w.r.t. (path, content), though authors often want to
 * mark it stochastic if the upstream producer was an LLM — the wrapper
 * node is the right place for that. `fs.write:<path>` is checked at
 * dispatch; the hard denylist applies unconditionally.
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
  id: "@agenteer/node-file-write",
  name: "file_write",
  description: "Write a file to disk. Capability-gated; denylist enforced.",
  determinism: "deterministic",
  required_actions: [],
  dynamic_actions: true,
  dynamic_action_spec: "fs.write:${input.path}",
  tags: ["primitive", "fs"],
  side_effects: {
    writes_fs: true,
    network: false,
    mutates_ctx: false,
  },
});

const InputSchema = z.object({
  path: z.string().min(1),
  content: z.string(),
});

const OutputSchema = z.object({
  path: z.string(),
  bytes: z.number().int().nonnegative(),
});

type Input = z.infer<typeof InputSchema>;
type Output = z.infer<typeof OutputSchema>;

export function fileWriteFactory(): Node<Input, Output> {
  return {
    manifest: MANIFEST,
    inputSchema: InputSchema,
    outputSchema: OutputSchema,
    ctx: [],
    model: null,
    async execute(input: NodeInput<Input>, handle: NodeRuntimeHandle): Promise<NodeResult<Output>> {
      const { path, content } = input.original;
      try {
        const { bytes } = await handle.callAction<{ bytes: number }>("fs.write", {
          path,
          content,
        });
        return {
          kind: "output",
          value: { path, bytes },
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

export const fileWriteManifest = MANIFEST;
