/**
 * `@agenteer/node-ask-user` — freeform user prompt (sub-plan 03 §16, M5).
 *
 * M5 scope (Q3-C follow-through from M4): now that session resume + CLI
 * ship together, we can pair `approval_gate`'s yes/no with `ask_user`'s
 * freeform answer. Both share the same resolver model — a pre-recorded
 * answer wins, else a resolver answers synchronously, else `NeedsUser`.
 *
 * The schema for the answer is caller-provided. Tests and production can
 * validate the string with a Zod schema passed at factory time.
 */

import { z, type ZodType } from "zod";
import {
  makeManifest,
  type Node,
  type NodeInput,
  type NodeManifest,
  type NodeResult,
} from "@agenteer/core";

const MANIFEST: NodeManifest = makeManifest({
  id: "@agenteer/node-ask-user",
  name: "ask_user",
  description:
    "Freeform user prompt. Recorded answer → resolver → NeedsUser fallback. Schema validates answers.",
  determinism: "deterministic",
  tags: ["human"],
});

const InputSchema = z.object({
  prompt: z.string().min(1),
  /** Deterministic marker — echo back the recorded answer without asking. */
  answer: z.unknown().optional(),
  /**
   * Opaque identifier used to match a resolver / CLI answer. If absent,
   * the NodeResult's resume_hint defaults to `ask_user:<prompt-slug>`.
   */
  question_id: z.string().optional(),
});

type Input = z.input<typeof InputSchema>;

export interface AskUserResolver {
  /**
   * Return the recorded answer for this prompt, or `null` to fall
   * through to NeedsUser. Implementations typically bind to a session
   * state; see `recordedAnswerResolver` from `@agenteer/core/session`.
   */
  resolve(opts: { prompt: string; question_id?: string }): unknown | null;
}

export interface AskUserFactoryOptions<T = string> {
  resolver?: AskUserResolver;
  /** Zod schema to validate any resolved/recorded answer. Defaults to string. */
  answerSchema?: ZodType<T>;
}

export function askUserFactory<T = string>(
  options: AskUserFactoryOptions<T> = {},
): () => Node<Input, { answer: T; prompt: string; source: "recorded" | "resolver" | "user" }> {
  const answerSchema = (options.answerSchema ?? z.string()) as ZodType<T>;
  const OutputSchema = z.object({
    answer: answerSchema,
    prompt: z.string(),
    source: z.enum(["recorded", "resolver", "user"]),
  });
  type Output = { answer: T; prompt: string; source: "recorded" | "resolver" | "user" };

  return () => ({
    manifest: MANIFEST,
    inputSchema: InputSchema,
    outputSchema: OutputSchema,
    ctx: [],
    model: null,
    async execute(input: NodeInput<Input>): Promise<NodeResult<Output>> {
      const i = input.original;
      const resumeHint = i.question_id ?? slugHint(i.prompt);

      if (i.answer !== undefined) {
        const parsed = answerSchema.safeParse(i.answer);
        if (!parsed.success) {
          return {
            kind: "failed",
            reason: `recorded_answer_schema_violation: ${parsed.error.message}`,
            retryable: false,
          };
        }
        return {
          kind: "output",
          value: { answer: parsed.data, prompt: i.prompt, source: "recorded" },
          evidence: { verdict: "pass" },
        };
      }

      if (options.resolver) {
        const raw = options.resolver.resolve({
          prompt: i.prompt,
          ...(i.question_id !== undefined ? { question_id: i.question_id } : {}),
        });
        if (raw !== null && raw !== undefined) {
          const parsed = answerSchema.safeParse(raw);
          if (!parsed.success) {
            return {
              kind: "failed",
              reason: `resolver_answer_schema_violation: ${parsed.error.message}`,
              retryable: false,
            };
          }
          return {
            kind: "output",
            value: { answer: parsed.data, prompt: i.prompt, source: "resolver" },
            evidence: { verdict: "pass" },
          };
        }
      }

      return {
        kind: "needs_user",
        prompt: i.prompt,
        schema: answerSchema,
        resume_hint: resumeHint,
      };
    },
  });
}

export const askUserManifest = MANIFEST;

function slugHint(prompt: string): string {
  const slug = prompt
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "")
    .slice(0, 40);
  return `ask_user:${slug || "prompt"}`;
}
