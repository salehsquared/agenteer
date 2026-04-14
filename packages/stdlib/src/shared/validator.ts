/**
 * Validator shape (sub-plan 03 §Part B; master plan ratified resolution).
 *
 * Validators emit `verdict: "fail"` as DATA on `Output`, not via `Failed`.
 * `Failed` is reserved for "couldn't run at all" (binary missing,
 * unreadable input, capability denied). This helper normalizes the
 * output shape so downstream meta-nodes (repair_loop, judge) can switch
 * on a single field.
 */

import { z } from "zod";

export const ValidatorIssueSchema = z.object({
  path: z.string().optional(),
  message: z.string(),
  code: z.string().optional(),
  severity: z.enum(["error", "warning"]).default("error"),
});
export type ValidatorIssue = z.infer<typeof ValidatorIssueSchema>;

export const ValidatorOutputSchema = z.object({
  verdict: z.enum(["pass", "fail"]),
  issues: z.array(ValidatorIssueSchema),
  /** Short human-readable summary for logs / evidence. */
  summary: z.string(),
  /** Tool-level exit code if applicable; 0 for pass, non-zero for fail. */
  exit_code: z.number().int().optional(),
  /** Tail of raw tool output, bounded. */
  stdout_tail: z.string().optional(),
  stderr_tail: z.string().optional(),
});
export type ValidatorOutput = z.infer<typeof ValidatorOutputSchema>;

export function passOutput(summary: string): ValidatorOutput {
  return { verdict: "pass", issues: [], summary, exit_code: 0 };
}

export function failOutput(
  issues: ValidatorIssue[],
  summary: string,
  extra?: { exit_code?: number; stdout_tail?: string; stderr_tail?: string },
): ValidatorOutput {
  return {
    verdict: "fail",
    issues,
    summary,
    ...(extra?.exit_code !== undefined ? { exit_code: extra.exit_code } : {}),
    ...(extra?.stdout_tail ? { stdout_tail: extra.stdout_tail } : {}),
    ...(extra?.stderr_tail ? { stderr_tail: extra.stderr_tail } : {}),
  };
}
