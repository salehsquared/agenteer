/**
 * `@agenteer/node-cross-check` — meta-node over `trust.CrossCheckEngine`
 * (sub-plan 03 §11, sub-plan 04 §4.1).
 *
 * Three disagreement policies per master plan's ratified resolution:
 *   - `fail`              → return `Failed("cross_check_disagreement", retryable: true)`.
 *   - `return_both`       → return `Output({ primary, secondary, disagreement_keys })`.
 *   - `replace_me_with_judge` → return `ReplaceMe(judge_node)` so a
 *                               different node decides.
 *
 * Retry-on-disagreement uses `ReplaceMe` (sub-plan 00 §7); the engine
 * itself runs one pass.
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
import {
  CrossCheckEngine,
  ComparatorRegistry,
  DEFAULT_POLICY,
  StructuredProvider,
  type CrossCheckOutcome,
  type CrossCheckPolicy,
  type ProviderLike,
} from "@agenteer/trust";

const MANIFEST: NodeManifest = makeManifest({
  id: "@agenteer/node-cross-check",
  name: "cross_check",
  description:
    "Run the same prompt through two models; surface agreement / disagreement / fallback with policy.",
  determinism: "stochastic",
  required_actions: [],
  dynamic_actions: true,
  // Synthesizes `model:<primary>` at dispatch; secondary is optional.
  dynamic_action_spec: "model:${input.primary_model}",
  tags: ["meta", "llm"],
  side_effects: {
    writes_fs: false,
    network: true,
    mutates_ctx: true,
    emits_ctx_variants: ["artifact.cross_check"],
  },
});

const InputSchema = z.object({
  systemPrompt: z.string(),
  userPrompt: z.string(),
  schemaName: z.string().min(1),
  primary_model: z.string().min(1),
  secondary_model: z.string().optional(),
  /**
   * Policy fallbacks; `on_disagreement` picks the meta-node's response:
   *   - fail: `NodeResult.Failed(retryable: true)` for a parent to retry.
   *   - return_both: `NodeResult.Output({primary, secondary, disagreement_keys})`.
   *   - replace_me_with_judge: `NodeResult.ReplaceMe(judge_manifest_id)`.
   */
  on_disagreement: z
    .enum(["fail", "return_both", "replace_me_with_judge"])
    .default("return_both"),
  judge_manifest_id: z.string().optional(),
  temperature: z.number().min(0).max(2).optional(),
});

const OutputSchema = z.object({
  outcome: z.enum([
    "agreement",
    "disagreement",
    "missing_secondary_skip",
    "missing_secondary_fallback_disagreement",
  ]),
  value: z.unknown().optional(),
  primary: z.unknown().optional(),
  secondary: z.unknown().optional(),
  disagreement_keys: z.array(z.string()).optional(),
  fingerprint: z.string().optional(),
});

type Input = z.input<typeof InputSchema>;
type Output = z.infer<typeof OutputSchema>;

/**
 * Factory takes a resolver that maps model ids → ProviderLike instances.
 * Typical wiring: workflows register their provider adapters once and
 * hand a resolver to the factory.
 */
export interface ProviderResolver {
  resolve(model_id: string): ProviderLike | null;
}

export function crossCheckFactory(
  resolver: ProviderResolver,
  opts: { policy?: Partial<CrossCheckPolicy>; comparators?: ComparatorRegistry } = {},
): () => Node<Input, Output> {
  return () => {
    const policy: CrossCheckPolicy = { ...DEFAULT_POLICY, ...(opts.policy ?? {}) };
    const comparators = opts.comparators ?? new ComparatorRegistry();
    return {
      manifest: MANIFEST,
      inputSchema: InputSchema,
      outputSchema: OutputSchema,
      ctx: [],
      model: null,
      async execute(
        input: NodeInput<Input>,
        _handle: NodeRuntimeHandle,
      ): Promise<NodeResult<Output>> {
        const i = input.original;
        const primary = resolver.resolve(i.primary_model);
        if (!primary) {
          return {
            kind: "failed",
            reason: `no provider registered for primary model '${i.primary_model}'`,
            retryable: false,
            evidence: { verdict: "fail" },
          };
        }
        const secondary = i.secondary_model ? resolver.resolve(i.secondary_model) : undefined;

        const engine = new CrossCheckEngine(
          new StructuredProvider(primary),
          secondary ? new StructuredProvider(secondary) : undefined,
          policy,
          comparators,
        );

        const outcome = await engine.run({
          systemPrompt: i.systemPrompt,
          userPrompt: i.userPrompt,
          schema: z.unknown() as unknown as z.ZodType<unknown>,
          schemaName: i.schemaName,
          ...(i.temperature !== undefined ? { temperature: i.temperature } : {}),
        });

        return handleOutcome(outcome, i);
      },
    };
  };
}

export const crossCheckManifest = MANIFEST;

function handleOutcome(
  outcome: CrossCheckOutcome<unknown>,
  input: Input,
): NodeResult<Output> {
  if (outcome.kind === "agreement") {
    return {
      kind: "output",
      value: { outcome: "agreement", value: outcome.value },
      evidence: { verdict: "pass" },
    };
  }
  if (outcome.kind === "missing_secondary_skip") {
    return {
      kind: "output",
      value: { outcome: "missing_secondary_skip", value: outcome.value },
      evidence: { verdict: "pass" },
    };
  }

  const primary = outcome.kind === "missing_secondary_fallback_disagreement"
    ? outcome.primary
    : (outcome as { primary: unknown }).primary;
  const secondary = outcome.kind === "missing_secondary_fallback_disagreement"
    ? outcome.secondFallback
    : (outcome as { secondary: unknown }).secondary;
  const disagreement_keys = (outcome as { disagreementKeys?: string[] }).disagreementKeys ?? [];
  const fingerprint = (outcome as { fingerprint?: string }).fingerprint ?? "";

  const onDis = input.on_disagreement ?? "return_both";
  if (onDis === "fail") {
    return {
      kind: "failed",
      reason: `cross_check_disagreement:${fingerprint}`,
      retryable: true,
      details: { disagreement_keys, primary, secondary },
      evidence: { verdict: "fail" },
    };
  }
  if (onDis === "replace_me_with_judge") {
    const judgeId = input.judge_manifest_id ?? "@agenteer/node-judge-with-stripped-ctx";
    return {
      kind: "replace_me",
      reason: `cross_check_disagreement:${fingerprint}`,
      successor: {
        manifest_id: judgeId,
        input: {
          claim: "cross_check disagreement between primary and secondary outputs",
          candidates: [primary, secondary],
          disagreement_keys,
        },
        correlation: "cc-judge",
      },
    };
  }
  // return_both (default)
  return {
    kind: "output",
    value: {
      outcome:
        outcome.kind === "missing_secondary_fallback_disagreement"
          ? "missing_secondary_fallback_disagreement"
          : "disagreement",
      primary,
      secondary,
      disagreement_keys,
      fingerprint,
    },
    evidence: { verdict: "fail", tool_output: { command: `cross_check:${input.schemaName}` } },
  };
}
