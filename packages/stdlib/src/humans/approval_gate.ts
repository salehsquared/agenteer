/**
 * `@agenteer/node-approval-gate` — human yes/no gate (sub-plan 03 §16).
 *
 * M4 scope (Q3-C decision): ship this, defer `ask_user` to M5 where the
 * CLI can prompt a real user. The approval_gate is deterministic given
 * its recorded decision, so tests can inject an `ApprovalResolver` that
 * returns a canned answer. Session resume wires a real CLI prompt in M5.
 *
 * When the resolver is absent, the node returns `NeedsUser` with a
 * prompt — that's the production-pause-for-CLI path.
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
  id: "@agenteer/node-approval-gate",
  name: "approval_gate",
  description:
    "Yes/no gate. When an ApprovalResolver is injected, resolves synchronously (tests + replay); otherwise returns NeedsUser.",
  determinism: "deterministic",
  tags: ["human"],
});

const InputSchema = z.object({
  prompt: z.string().min(1),
  /**
   * Deterministic marker — when `decision` is present, the gate echoes
   * it immediately without asking. Enables replay of a recorded session.
   */
  decision: z.enum(["approve", "deny"]).optional(),
  /** Opaque id the resolver / CLI uses to look up the canned answer. */
  decision_id: z.string().optional(),
});

const OutputSchema = z.object({
  decision: z.enum(["approve", "deny"]),
  /** Echo of the prompt for audit. */
  prompt: z.string(),
  source: z.enum(["recorded", "resolver", "user"]),
});

type Input = z.input<typeof InputSchema>;
type Output = z.infer<typeof OutputSchema>;

export interface ApprovalResolver {
  /** Return `null` to fall through to `NeedsUser`. */
  resolve(opts: { prompt: string; decision_id?: string }): "approve" | "deny" | null;
}

export function approvalGateFactory(
  resolver?: ApprovalResolver,
): () => Node<Input, Output> {
  return () => ({
    manifest: MANIFEST,
    inputSchema: InputSchema,
    outputSchema: OutputSchema,
    ctx: [],
    model: null,
    async execute(input: NodeInput<Input>): Promise<NodeResult<Output>> {
      const i = input.original;

      if (i.decision !== undefined) {
        return {
          kind: "output",
          value: { decision: i.decision, prompt: i.prompt, source: "recorded" },
          evidence: { verdict: i.decision === "approve" ? "pass" : "fail" },
        };
      }

      if (resolver) {
        const ans = resolver.resolve({
          prompt: i.prompt,
          ...(i.decision_id !== undefined ? { decision_id: i.decision_id } : {}),
        });
        if (ans !== null) {
          return {
            kind: "output",
            value: { decision: ans, prompt: i.prompt, source: "resolver" },
            evidence: { verdict: ans === "approve" ? "pass" : "fail" },
          };
        }
      }

      return {
        kind: "needs_user",
        prompt: i.prompt,
        schema: OutputSchema,
        resume_hint: i.decision_id ?? "approval_gate",
      };
    },
  });
}

export const approvalGateManifest = MANIFEST;
