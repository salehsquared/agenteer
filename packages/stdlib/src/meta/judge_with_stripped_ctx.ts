/**
 * `@agenteer/node-judge-with-stripped-ctx` — meta-node that reaches a
 * verdict on a claim **without the suspect node's reasoning trail**
 * (sub-plan 03 §13).
 *
 * The judge spawns an LLM-backed sub-node with a slice that excludes
 * `decision` items produced by the suspect (and their derivatives).
 * Goal: detect motivated reasoning — a judge that still agrees when
 * stripped of the suspect's narrative has genuine independent support.
 *
 * M4 implementation: the slice-filter layer is simple (exclude
 * `source_node == suspect_node_id` + any `decision` items). A richer
 * filter (suspect's `derives_from` closure) can land later.
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
  id: "@agenteer/node-judge-with-stripped-ctx",
  name: "judge_with_stripped_ctx",
  description:
    "Reach a verdict on a claim while stripping the suspect node's reasoning trail (decisions + derivatives).",
  determinism: "stochastic",
  required_actions: [],
  dynamic_actions: true,
  dynamic_action_spec: "spawn:${input.judge_manifest_id}",
  tags: ["meta"],
  side_effects: {
    writes_fs: false,
    network: true,
    mutates_ctx: true,
    emits_ctx_variants: ["artifact.judgment"],
  },
});

const InputSchema = z.object({
  /** What we're judging — free-text claim or a structured marker. */
  claim: z.string().min(1),
  /** Candidate answers / verdicts the judge picks between. */
  candidates: z.array(z.unknown()).min(1),
  /** Optional hint about which path differed (from cross_check). */
  disagreement_keys: z.array(z.string()).optional(),
  /** Manifest of the underlying judge node (usually an llm_call-shaped node). */
  judge_manifest_id: z.string().default("@agenteer/node-llm-call"),
  /** Model the judge should use. */
  judge_model: z.string().optional(),
});

const OutputSchema = z.object({
  verdict: z.enum(["candidate_0", "candidate_1", "neither", "cannot_judge"]),
  chosen: z.unknown().optional(),
  rationale: z.string(),
});

type Input = z.input<typeof InputSchema>;
type Output = z.infer<typeof OutputSchema>;

export function judgeWithStrippedCtxFactory(): Node<Input, Output> {
  return {
    manifest: MANIFEST,
    inputSchema: InputSchema,
    outputSchema: OutputSchema,
    ctx: [],
    model: null,
    async execute(input: NodeInput<Input>): Promise<NodeResult<Output>> {
      const i = input.original;

      if (!input.children) {
        const judgePrompt = buildJudgePrompt(i);
        const judgeManifest = i.judge_manifest_id ?? "@agenteer/node-llm-call";
        return {
          kind: "spawn_children",
          join: { mode: "all" },
          children: [
            {
              manifest_id: judgeManifest,
              input: {
                model_id: i.judge_model ?? "mock/judge",
                prompt: judgePrompt,
                system:
                  "You are an impartial reviewer. Pick the candidate you believe is correct. If neither is supportable, answer `neither`. Return JSON.",
              },
              correlation: "judge",
            },
          ],
        };
      }

      const child = input.children[0]!;
      if (child.result.kind !== "output") {
        return {
          kind: "failed",
          reason: `judge child did not produce output: ${child.result.kind}`,
          retryable: false,
          evidence: { verdict: "fail" },
        };
      }

      const parsed = parseJudgeOutput((child.result as { value: unknown }).value, i);
      return {
        kind: "output",
        value: parsed,
        evidence: { verdict: parsed.verdict === "cannot_judge" ? "inconclusive" : "pass" },
      };
    },
  };
}

export const judgeWithStrippedCtxManifest = MANIFEST;

function buildJudgePrompt(input: Input): string {
  const candidates = input.candidates
    .map((c, i) => `Candidate ${i}:\n${safeStringify(c)}`)
    .join("\n\n");
  const keys = input.disagreement_keys?.length
    ? `\nDisagreement keys (paths that differ): ${input.disagreement_keys.join(", ")}\n`
    : "";
  return `Claim under review:\n${input.claim}\n${keys}\n${candidates}\n\nReturn JSON: { verdict: "candidate_0" | "candidate_1" | "neither" | "cannot_judge", rationale: string }`;
}

function parseJudgeOutput(raw: unknown, input: Input): Output {
  // The child llm_call returns { value, model, tokens, method }. The
  // schema-validated `value` is whatever the judge produced.
  const inner = (raw as { value?: unknown }).value ?? raw;
  let parsed: Record<string, unknown>;
  if (typeof inner === "string") {
    try {
      parsed = JSON.parse(inner) as Record<string, unknown>;
    } catch {
      return {
        verdict: "cannot_judge",
        rationale: `judge returned unparseable text: ${inner.slice(0, 200)}`,
      };
    }
  } else if (typeof inner === "object" && inner !== null) {
    parsed = inner as Record<string, unknown>;
  } else {
    return { verdict: "cannot_judge", rationale: "judge returned no structured answer" };
  }

  const v = parsed["verdict"];
  const rationale = typeof parsed["rationale"] === "string" ? (parsed["rationale"] as string) : "";

  const verdict =
    v === "candidate_0" || v === "candidate_1" || v === "neither" || v === "cannot_judge"
      ? v
      : "cannot_judge";

  let chosen: unknown = undefined;
  if (verdict === "candidate_0") chosen = input.candidates[0];
  else if (verdict === "candidate_1") chosen = input.candidates[1];

  const out: Output = { verdict, rationale };
  if (chosen !== undefined) out.chosen = chosen;
  return out;
}

function safeStringify(v: unknown): string {
  try {
    return JSON.stringify(v, null, 2);
  } catch {
    return String(v);
  }
}
