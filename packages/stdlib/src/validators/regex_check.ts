/**
 * `@agenteer/node-regex-check` — deterministic regex assertion validator.
 *
 * Runs N `must_match` / `must_not_match` patterns against an input string.
 * Returns `verdict: "fail"` as data per ratified resolution — `Failed`
 * is reserved for "couldn't run at all" (invalid regex, missing input).
 */

import { z } from "zod";
import {
  makeManifest,
  type Node,
  type NodeInput,
  type NodeManifest,
  type NodeResult,
} from "@agenteer/core";
import {
  failOutput,
  passOutput,
  type ValidatorIssue,
  type ValidatorOutput,
  ValidatorOutputSchema,
} from "../shared/index.js";

const MANIFEST: NodeManifest = makeManifest({
  id: "@agenteer/node-regex-check",
  name: "regex_check",
  description: "Assert an input satisfies a set of must-match / must-not-match regex rules.",
  determinism: "deterministic",
  tags: ["validator"],
});

const RuleSchema = z.object({
  id: z.string().min(1),
  pattern: z.string().min(1),
  kind: z.enum(["must_match", "must_not_match"]),
  /** Regex flags (e.g. `i`, `m`). Invalid flags → Failed. */
  flags: z.string().optional(),
  /** Human-readable message used when this rule fails. */
  message: z.string().optional(),
});
type Rule = z.infer<typeof RuleSchema>;

const InputSchema = z.object({
  input: z.string(),
  rules: z.array(RuleSchema).min(1),
});

type Input = z.input<typeof InputSchema>;

export function regexCheckFactory(): Node<Input, ValidatorOutput> {
  return {
    manifest: MANIFEST,
    inputSchema: InputSchema,
    outputSchema: ValidatorOutputSchema,
    ctx: [],
    model: null,
    async execute(input: NodeInput<Input>): Promise<NodeResult<ValidatorOutput>> {
      const { input: text, rules } = input.original;

      const issues: ValidatorIssue[] = [];
      for (const rule of rules as Rule[]) {
        let re: RegExp;
        try {
          re = new RegExp(rule.pattern, rule.flags);
        } catch (err) {
          return {
            kind: "failed",
            reason: `invalid_regex:${rule.id}`,
            retryable: false,
            details: { error: err instanceof Error ? err.message : String(err) },
            evidence: { verdict: "fail" },
          };
        }
        const matched = re.test(text);
        if (rule.kind === "must_match" && !matched) {
          issues.push({
            path: rule.id,
            message: rule.message ?? `expected /${rule.pattern}/ to match`,
            code: "must_match",
            severity: "error",
          });
        } else if (rule.kind === "must_not_match" && matched) {
          issues.push({
            path: rule.id,
            message: rule.message ?? `expected /${rule.pattern}/ NOT to match`,
            code: "must_not_match",
            severity: "error",
          });
        }
      }

      const out: ValidatorOutput =
        issues.length === 0
          ? passOutput(`all ${rules.length} regex rule(s) passed`)
          : failOutput(issues, `${issues.length} of ${rules.length} regex rule(s) failed`);

      return {
        kind: "output",
        value: out,
        evidence: { verdict: out.verdict },
      };
    },
  };
}

export const regexCheckManifest = MANIFEST;
