/**
 * `@agenteer/node-default-planner` — LLM-driven plan composer (sub-plan 03 §17).
 *
 * **Returns a plan as DATA**, not as `SpawnChildren` (master plan ratified
 * resolution). This enables:
 *   - Replay: a plan is a value you can serialize, review, and diff.
 *   - Human approval: pair with `approval_gate` to require sign-off before exec.
 *   - Judge review: `judge_with_stripped_ctx` can score the plan.
 *   - Swapping planners: another node consumes the plan and spawns.
 *
 * The node emits the plan as an Artifact via `ctx.set(asArtifact(...))`
 * (uses R3-A) so downstream nodes see it via their context slice.
 */

import { z } from "zod";
import {
  asArtifact,
  makeManifest,
  type Node,
  type NodeInput,
  type NodeManifest,
  type NodeResult,
  type NodeRuntimeHandle,
} from "@agenteer/core";

const MANIFEST: NodeManifest = makeManifest({
  id: "@agenteer/node-default-planner",
  name: "default_planner",
  description:
    "LLM-driven planner. Returns a plan (as data + ctx artifact); does NOT spawn the plan itself.",
  determinism: "stochastic",
  required_actions: [],
  dynamic_actions: true,
  dynamic_action_spec: "model:${input.model_id}",
  tags: ["meta", "planner"],
  side_effects: {
    writes_fs: false,
    network: true,
    mutates_ctx: true,
    emits_ctx_variants: ["artifact.plan"],
  },
});

const PlanStepSchema = z.object({
  id: z.string().min(1),
  manifest_id: z.string().min(1),
  input: z.unknown(),
  rationale: z.string().optional(),
  depends_on: z.array(z.string()).default([]),
  attenuate: z.array(z.string()).optional(),
});

const PlanSchema = z.object({
  goal: z.string(),
  steps: z.array(PlanStepSchema).min(1),
  notes: z.string().optional(),
});

const InputSchema = z.object({
  goal: z.string().min(1),
  /**
   * Manifests the planner is allowed to include. Structural filter —
   * the planner picks from this set and only this set. No semantic
   * "free-for-all"; matches the "planner filters structurally first"
   * invariant.
   */
  available_manifests: z
    .array(
      z.object({
        id: z.string().min(1),
        name: z.string(),
        description: z.string(),
        required_actions: z.array(z.string()).default([]),
      }),
    )
    .min(1),
  model_id: z.string().min(1),
  /** Tag under which the plan is emitted to ctx (default: "plan"). */
  emit_as: z.string().default("plan"),
});

const OutputSchema = z.object({
  plan: PlanSchema,
  model: z.string(),
  method: z.enum(["native", "text_parse", "mock"]),
});

type Input = z.input<typeof InputSchema>;
type Output = z.infer<typeof OutputSchema>;

export function defaultPlannerFactory(): Node<Input, Output> {
  return {
    manifest: MANIFEST,
    inputSchema: InputSchema,
    outputSchema: OutputSchema,
    ctx: [],
    model: null,
    async execute(input: NodeInput<Input>, handle: NodeRuntimeHandle): Promise<NodeResult<Output>> {
      const i = input.original;
      const emitAs = i.emit_as ?? "plan";

      const systemPrompt = buildSystemPrompt();
      const userPrompt = buildUserPrompt(i);

      try {
        const res = await handle.callModel<z.infer<typeof PlanSchema>>({
          model_id: i.model_id,
          prompt: userPrompt,
          system: systemPrompt,
          schema: PlanSchema,
        });
        const plan = res.value;

        // Defensive: reject plans whose steps reference manifests outside
        // the allowed set. The kernel would refuse at spawn anyway, but
        // we fail fast here so the planner sees feedback as a `Failed`
        // that a repair_loop can digest.
        const allowed = new Set(i.available_manifests.map((m) => m.id));
        const illegal = plan.steps.filter((s) => !allowed.has(s.manifest_id));
        if (illegal.length > 0) {
          return {
            kind: "failed",
            reason: `planner chose manifests outside available_manifests: ${illegal.map((s) => s.manifest_id).join(", ")}`,
            retryable: true,
            evidence: { verdict: "fail" },
          };
        }

        return {
          kind: "output",
          value: { plan, model: res.model, method: res.method },
          ctx_patch: {
            set: {
              [emitAs]: asArtifact(plan, {
                media_type: "application/json",
                schema_ref: "@agenteer/default_planner.plan.v1",
              }),
            },
          },
          evidence: { verdict: "pass" },
        };
      } catch (err) {
        const reason = err instanceof Error ? err.message : String(err);
        return {
          kind: "failed",
          reason,
          retryable: /timeout|rate.?limit|5\d\d|structured_output_exhausted/i.test(reason),
          evidence: { verdict: "fail" },
        };
      }
    },
  };
}

export const defaultPlannerManifest = MANIFEST;

function buildSystemPrompt(): string {
  return [
    "You are a software-engineering planner.",
    "You produce a JSON plan whose steps can be executed by the given manifests.",
    "Constraints:",
    "- Every step.manifest_id MUST be drawn from the provided `available_manifests` list.",
    "- Every step.id is unique within the plan.",
    "- `depends_on` references earlier step ids only; no cycles.",
    "- `input` must match what the named manifest expects.",
    "- Keep plans minimal — no speculative steps.",
  ].join("\n");
}

function buildUserPrompt(input: Input): string {
  const catalog = input.available_manifests
    .map((m) => `- ${m.id} (${m.name}): ${m.description}`)
    .join("\n");
  return [
    `Goal: ${input.goal}`,
    ``,
    `Available manifests:`,
    catalog,
    ``,
    `Return JSON matching: { goal, steps: [{ id, manifest_id, input, rationale?, depends_on[] }], notes? }`,
  ].join("\n");
}
