/**
 * `@agenteer/node-repair-loop` — meta-node that drives a validate →
 * repair → validate cycle via ReplaceMe (sub-plan 03 §14).
 *
 * **ReplaceMe-first.** Per master plan ratified resolutions, the retry
 * mechanism is data-driven convergence: each repair pass returns
 * `replace_me` with a successor carrying the narrowed target. A bounded
 * `max_iterations` ceiling exists only as a runaway backstop.
 *
 * Shape of one iteration:
 *   1. Run the target node (via `SpawnChildren`).
 *   2. Run the validator against the target's output.
 *   3. If validator.verdict === "pass" → Output(final).
 *      If validator.verdict === "fail" and iter < ceiling →
 *        ReplaceMe(self with target_input augmented by the failing issues).
 *      Otherwise → Failed("repair_exhausted").
 *
 * This is the node that earns the framework's "self-obsolescence"
 * pillar — it's where ReplaceMe pays rent in day-to-day workflows.
 */

import { z } from "zod";
import {
  asArtifact,
  makeManifest,
  type Node,
  type NodeInput,
  type NodeManifest,
  type NodeResult,
  type NodeSpawn,
} from "@agenteer/core";
import { ValidatorOutputSchema, type ValidatorOutput } from "../shared/index.js";

const MANIFEST: NodeManifest = makeManifest({
  id: "@agenteer/node-repair-loop",
  name: "repair_loop",
  description:
    "ReplaceMe-first validate/repair loop. Max-iterations is a runaway backstop; progress is data-driven.",
  determinism: "stochastic",
  required_actions: [],
  dynamic_actions: true,
  // We spawn whichever target + validator the caller names.
  dynamic_action_spec: "spawn:${input.target_manifest_id}, spawn:${input.validator_manifest_id}",
  tags: ["meta"],
  side_effects: {
    writes_fs: false,
    network: false,
    mutates_ctx: true,
    emits_ctx_variants: ["artifact.repair_loop.result"],
  },
});

const InputSchema = z.object({
  target_manifest_id: z.string().min(1),
  target_input: z.unknown(),
  validator_manifest_id: z.string().min(1),
  validator_input: z.unknown().optional(),
  max_iterations: z.number().int().min(1).max(32).default(4),
  iteration: z.number().int().min(0).default(0),
  /**
   * Optional ctx tag: final result is emitted as an Artifact under this
   * name so downstream nodes can read it via ctx.
   */
  emit_as: z.string().optional(),
});

const OutputSchema = z.object({
  verdict: z.enum(["pass", "fail"]),
  iterations: z.number().int().nonnegative(),
  final_output: z.unknown(),
  last_issues: z
    .array(
      z.object({
        path: z.string().optional(),
        message: z.string(),
        code: z.string().optional(),
        severity: z.enum(["error", "warning"]).optional(),
      }),
    )
    .optional(),
});

type Input = z.input<typeof InputSchema>;
type Output = z.infer<typeof OutputSchema>;

const TARGET_CORRELATION = "repair.target";
const VALIDATOR_CORRELATION = "repair.validator";

export function repairLoopFactory(): Node<Input, Output> {
  return {
    manifest: MANIFEST,
    inputSchema: InputSchema,
    outputSchema: OutputSchema,
    ctx: [],
    model: null,
    async execute(input: NodeInput<Input>): Promise<NodeResult<Output>> {
      const i = input.original;
      const iter = i.iteration ?? 0;
      const maxIter = i.max_iterations ?? 4;

      if (!input.children) {
        // No children yet → we're on entry; spawn the target.
        return {
          kind: "spawn_children",
          join: { mode: "all" },
          children: [
            {
              manifest_id: i.target_manifest_id,
              input: i.target_input,
              correlation: TARGET_CORRELATION,
            },
          ],
        };
      }

      // Re-entry. Two shapes to handle:
      //   (a) only target-result present → spawn validator
      //   (b) target + validator present → decide
      const target = input.children.find((c) => c.correlation === TARGET_CORRELATION);
      const validator = input.children.find((c) => c.correlation === VALIDATOR_CORRELATION);

      if (!target) {
        return {
          kind: "failed",
          reason: "repair_loop: no target child on re-entry",
          retryable: false,
          evidence: { verdict: "fail" },
        };
      }
      if (target.result.kind !== "output") {
        return {
          kind: "failed",
          reason: `repair_loop: target failed (${(target.result as { reason?: string }).reason ?? target.result.kind})`,
          retryable: false,
          details: { target: target.result },
          evidence: { verdict: "fail" },
        };
      }

      const targetOutput = (target.result as { value: unknown }).value;

      if (!validator) {
        // Spawn the validator with the target's output merged in.
        const validatorInput = buildValidatorInput(i.validator_input, targetOutput);
        return {
          kind: "spawn_children",
          join: { mode: "all" },
          children: [
            {
              manifest_id: i.target_manifest_id,
              input: i.target_input,
              correlation: TARGET_CORRELATION,
            },
            {
              manifest_id: i.validator_manifest_id,
              input: validatorInput,
              correlation: VALIDATOR_CORRELATION,
            },
          ],
        };
      }

      // Validator present — interpret.
      if (validator.result.kind !== "output") {
        return {
          kind: "failed",
          reason: `repair_loop: validator failed (${(validator.result as { reason?: string }).reason ?? validator.result.kind})`,
          retryable: false,
          evidence: { verdict: "fail" },
        };
      }
      const vParsed = ValidatorOutputSchema.safeParse((validator.result as { value: unknown }).value);
      if (!vParsed.success) {
        return {
          kind: "failed",
          reason: `repair_loop: validator output not a ValidatorOutput shape`,
          retryable: false,
          details: { issues: vParsed.error.issues },
          evidence: { verdict: "fail" },
        };
      }
      const vout: ValidatorOutput = vParsed.data;

      if (vout.verdict === "pass") {
        const base: Output = {
          verdict: "pass",
          iterations: iter,
          final_output: targetOutput,
        };
        const patch = i.emit_as
          ? {
              set: {
                [i.emit_as]: asArtifact(
                  { verdict: "pass", iterations: iter, output: targetOutput },
                  { media_type: "application/json" },
                ),
              },
            }
          : undefined;
        return {
          kind: "output",
          value: base,
          ...(patch ? { ctx_patch: patch } : {}),
          evidence: { verdict: "pass" },
        };
      }

      // Validator failed.
      if (iter + 1 >= maxIter) {
        return {
          kind: "output",
          value: {
            verdict: "fail",
            iterations: iter + 1,
            final_output: targetOutput,
            last_issues: vout.issues,
          },
          evidence: { verdict: "fail" },
        };
      }

      // Repair step: ReplaceMe self with `iteration + 1`, feeding the
      // validator's issues back into target_input as a hint.
      const successor: NodeSpawn = {
        manifest_id: MANIFEST.id,
        // Runtime preserves the frame's correlation on ReplaceMe; this
        // value is only used for lineage tracking on the successor's
        // own spawn event.
        correlation: `repair-iter-${iter + 1}`,
        input: {
          ...i,
          iteration: iter + 1,
          target_input: {
            ...(typeof i.target_input === "object" && i.target_input !== null
              ? (i.target_input as Record<string, unknown>)
              : { original: i.target_input }),
            prior_issues: vout.issues,
            prior_iteration: iter,
          },
        },
      };

      return {
        kind: "replace_me",
        reason: `repair_iteration:${iter + 1}:${vout.issues.length}_issues`,
        successor,
      };
    },
  };
}

export const repairLoopManifest = MANIFEST;

function buildValidatorInput(
  baseValidatorInput: unknown,
  targetOutput: unknown,
): unknown {
  // If the caller didn't specify, pass the target output through as
  // `candidate` — a reasonable default for validators that inspect output.
  if (baseValidatorInput === undefined || baseValidatorInput === null) {
    return { candidate: targetOutput };
  }
  if (typeof baseValidatorInput === "object") {
    return { ...(baseValidatorInput as Record<string, unknown>), candidate: targetOutput };
  }
  return baseValidatorInput;
}
