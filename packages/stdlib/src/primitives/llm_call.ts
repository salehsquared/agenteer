/**
 * `@agenteer/node-llm-call` — typed prompt + typed output via a model (sub-plan 03 §1).
 *
 * M2 scope: the structured-output wrapper with native-first / text-parse
 * fallback lives in `@agenteer/trust/structured` (M3). Here we:
 *   - validate the input shape,
 *   - call `handle.callModel` which the runtime routes through the
 *     permission kernel + ModelProvider,
 *   - emit an Artifact ctx item with the validated value.
 *
 * Response schema is carried on `input.schema` as a Zod type. For
 * third-party wire delivery (JSON-only), the M6 registry serializes
 * schemas; that path is still future work.
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
  id: "@agenteer/node-llm-call",
  name: "llm_call",
  description: "Call a configured model with a structured schema; return the validated value.",
  determinism: "stochastic",
  required_actions: [],
  dynamic_actions: true,
  dynamic_action_spec: "model:${input.model_id}",
  tags: ["primitive", "llm"],
  side_effects: {
    writes_fs: false,
    network: true,
    mutates_ctx: true,
    emits_ctx_variants: ["artifact.llm_call"],
  },
});

const InputSchema = z.object({
  model_id: z.string().min(1),
  prompt: z.string().min(1),
  system: z.string().optional(),
  temperature: z.number().min(0).max(2).optional(),
  max_tokens: z.number().int().min(1).optional(),
  /** Tag under which the validated value is appended to context. */
  emit_as: z.string().optional(),
});

const OutputSchema = z.object({
  value: z.unknown(),
  model: z.string(),
  tokens: z.object({ prompt: z.number().int(), completion: z.number().int() }),
  method: z.enum(["native", "text_parse", "mock"]),
});

type Input = z.infer<typeof InputSchema>;
type Output = z.infer<typeof OutputSchema>;

/**
 * Factory. Accepts an optional response schema — nodes authored on top of
 * `llm_call` typically pass a concrete Zod here. When absent, the return
 * value is passed through unchecked (the manifest's `output_schema` still
 * enforces the outer wrapper shape).
 */
export function llmCallFactory(responseSchema?: z.ZodTypeAny): () => Node<Input, Output> {
  return () => ({
    manifest: MANIFEST,
    inputSchema: InputSchema,
    outputSchema: OutputSchema,
    ctx: [],
    model: null, // resolved dynamically via input.model_id
    async execute(input: NodeInput<Input>, handle: NodeRuntimeHandle): Promise<NodeResult<Output>> {
      const { model_id, prompt, system, temperature, max_tokens, emit_as } = input.original;
      try {
        const res = await handle.callModel({
          model_id,
          prompt,
          ...(system !== undefined ? { system } : {}),
          ...(temperature !== undefined ? { temperature } : {}),
          ...(max_tokens !== undefined ? { max_tokens } : {}),
          ...(responseSchema ? { schema: responseSchema } : {}),
        });
        const value: Output = {
          value: res.value,
          model: res.model,
          tokens: res.tokens,
          method: res.method,
        };
        return {
          kind: "output",
          value,
          ...(emit_as ? { ctx_patch: { set: { [emit_as]: res.value } } } : {}),
          evidence: { verdict: "pass" },
        };
      } catch (err) {
        const reason = err instanceof Error ? err.message : String(err);
        const retryable = /timeout|rate.?limit|5\d\d/i.test(reason);
        return {
          kind: "failed",
          reason,
          retryable,
          evidence: { verdict: "fail" },
        };
      }
    },
  });
}

export const llmCallManifest = MANIFEST;
