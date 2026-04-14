/**
 * `@agenteer/node-tool-call` — primitive for invoking a registered tool
 * (sub-plan 03 §2). §R4 honest dynamic-action disclosure:
 *   dynamic_actions: true
 *   dynamic_action_spec: "tool:${input.tool_name}"
 *
 * The permission kernel synthesizes `tool:<concrete_name>` at spawn time
 * and checks against the parent's granted set. Tools themselves are
 * adapters injected via `Runtime({ toolRegistry })`.
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
  id: "@agenteer/node-tool-call",
  name: "tool_call",
  description:
    "Invoke a registered tool by name. §R4-compliant: declared tool capability is synthesized from input at dispatch.",
  determinism: "stochastic",
  required_actions: [],
  dynamic_actions: true,
  dynamic_action_spec: "tool:${input.tool_name}",
  tags: ["primitive"],
  side_effects: {
    writes_fs: false,
    network: true,
    mutates_ctx: false,
  },
});

const InputSchema = z.object({
  tool_name: z.string().min(1),
  args: z.unknown(),
});

const OutputSchema = z.object({
  tool_name: z.string(),
  value: z.unknown(),
});

type Input = z.input<typeof InputSchema>;
type Output = z.infer<typeof OutputSchema>;

export function toolCallFactory(): Node<Input, Output> {
  return {
    manifest: MANIFEST,
    inputSchema: InputSchema,
    outputSchema: OutputSchema,
    ctx: [],
    model: null,
    async execute(input: NodeInput<Input>, handle: NodeRuntimeHandle): Promise<NodeResult<Output>> {
      const { tool_name, args } = input.original;
      try {
        const value = await handle.callAction<unknown>("tool.invoke", {
          tool_name,
          args,
        });
        return {
          kind: "output",
          value: { tool_name, value },
          evidence: { verdict: "pass", tool_output: { command: `tool:${tool_name}` } },
        };
      } catch (err) {
        const reason = err instanceof Error ? err.message : String(err);
        return {
          kind: "failed",
          reason,
          retryable: /rate.?limit|timeout|5\d\d/i.test(reason),
          evidence: { verdict: "fail" },
        };
      }
    },
  };
}

export const toolCallManifest = MANIFEST;
