/**
 * research_assistant — domain driver for the demo workflow.
 *
 * Six stdlib nodes composed via ReplaceMe state transitions:
 *   start        → ask_user (research question)
 *   post-question → default_planner (plan from question)
 *   post-plan    → approval_gate (human sign-off)
 *   post-approve → tool_call (web_search)
 *   post-search  → regex_check (validate findings look reasonable)
 *   post-check   → llm_call (synthesize report)
 *   done         → Artifact in ctx + Output
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
import {
  approvalGateManifest,
  askUserManifest,
  defaultPlannerManifest,
  llmCallManifest,
  regexCheckManifest,
  toolCallManifest,
} from "@agenteer/stdlib";

export const ResearchDriverManifest: NodeManifest = makeManifest({
  id: "@agenteer/node-example-research-driver",
  name: "research_assistant",
  description:
    "Demo: six-stdlib-node research assistant. Question → plan → approve → search → check → report.",
  determinism: "deterministic",
  required_actions: [
    `spawn:${askUserManifest.id}`,
    `spawn:${defaultPlannerManifest.id}`,
    `spawn:${approvalGateManifest.id}`,
    `spawn:${toolCallManifest.id}`,
    `spawn:${regexCheckManifest.id}`,
    `spawn:${llmCallManifest.id}`,
    // Driver must hold these so the kernel's intersection at child spawn
    // preserves them for default_planner / tool_call / llm_call to use.
    "model:mock/planner",
    "model:mock/synth",
    "tool:web_search",
  ],
});

type Phase =
  | "start"
  | "post-question"
  | "post-plan"
  | "post-approve"
  | "post-search"
  | "post-check";

const DriverInput = z.object({
  topic: z.string().default("generic"),
  planner_model_id: z.string().default("mock/planner"),
  synth_model_id: z.string().default("mock/synth"),
  state: z
    .object({
      phase: z.enum([
        "start",
        "post-question",
        "post-plan",
        "post-approve",
        "post-search",
        "post-check",
      ]),
      question: z.string().optional(),
      plan: z.unknown().optional(),
      findings: z.array(z.string()).optional(),
      validation_verdict: z.enum(["pass", "fail"]).optional(),
    })
    .default({ phase: "start" }),
});

const DriverOutput = z.object({
  topic: z.string(),
  question: z.string(),
  findings: z.array(z.string()),
  report: z.string(),
  validation_verdict: z.enum(["pass", "fail"]),
});

function spawnOne(spec: NodeSpawn): NodeResult<never> {
  return { kind: "spawn_children", children: [spec], join: { mode: "all" } };
}

function replaceSelf(input: z.input<typeof DriverInput>): NodeResult<never> {
  return {
    kind: "replace_me",
    successor: {
      manifest_id: ResearchDriverManifest.id,
      input,
      correlation: "driver",
    },
    reason: `phase -> ${input.state?.phase}`,
  };
}

export function researchDriverFactory(): Node<
  z.input<typeof DriverInput>,
  z.infer<typeof DriverOutput>
> {
  return {
    manifest: ResearchDriverManifest,
    inputSchema: DriverInput,
    outputSchema: DriverOutput,
    ctx: [],
    model: null,
    async execute(
      input: NodeInput<z.input<typeof DriverInput>>,
    ): Promise<NodeResult<z.infer<typeof DriverOutput>>> {
      const i = input.original;
      const phase: Phase = (i.state?.phase ?? "start") as Phase;
      const kids = input.children;

      if (!kids) {
        switch (phase) {
          case "start":
            return spawnOne({
              manifest_id: askUserManifest.id,
              input: {
                prompt: `Research question?`,
                question_id: `research.${i.topic ?? "generic"}.question`,
              },
              correlation: "q",
            });
          case "post-question":
            return spawnOne({
              manifest_id: defaultPlannerManifest.id,
              input: {
                goal: i.state?.question ?? "",
                available_manifests: [
                  {
                    id: toolCallManifest.id,
                    name: "tool_call",
                    description: "Invoke the web_search tool for this demo.",
                    required_actions: ["tool:web_search"],
                  },
                ],
                model_id: i.planner_model_id ?? "mock/planner",
                emit_as: `research.${i.topic ?? "generic"}.plan`,
              },
              correlation: "plan",
            });
          case "post-plan":
            return spawnOne({
              manifest_id: approvalGateManifest.id,
              input: {
                prompt: "Approve plan and execute?",
                decision_id: `research.${i.topic ?? "generic"}.approve`,
              },
              correlation: "approve",
            });
          case "post-approve":
            return spawnOne({
              manifest_id: toolCallManifest.id,
              input: {
                tool_name: "web_search",
                args: { query: i.state?.question ?? "" },
              },
              correlation: "search",
            });
          case "post-search":
            return spawnOne({
              manifest_id: regexCheckManifest.id,
              input: {
                input: (i.state?.findings ?? []).join("\n"),
                rules: [
                  {
                    id: "has-content",
                    pattern: "\\w{3,}",
                    kind: "must_match",
                    message: "findings are empty or below minimum length",
                  },
                ],
              },
              correlation: "check",
            });
          case "post-check":
            return spawnOne({
              manifest_id: llmCallManifest.id,
              input: {
                model_id: i.synth_model_id ?? "mock/synth",
                prompt: synthPrompt(i),
              },
              correlation: "synth",
            });
        }
      }

      const r = kids[0]!.result;
      if (r.kind === "needs_user") {
        return {
          kind: "needs_user",
          prompt: r.prompt,
          ...(r.resume_hint ? { resume_hint: r.resume_hint } : {}),
        };
      }
      if (r.kind === "failed") {
        return { kind: "failed", reason: r.reason, retryable: r.retryable };
      }
      if (r.kind !== "output") {
        return {
          kind: "failed",
          reason: `unexpected child kind: ${r.kind}`,
          retryable: false,
        };
      }

      switch (phase) {
        case "start": {
          const question = (r.value as { answer: string }).answer;
          return replaceSelf({ ...i, state: { phase: "post-question", question } });
        }
        case "post-question": {
          const plan = (r.value as { plan: unknown }).plan;
          return replaceSelf({
            ...i,
            state: { ...i.state!, phase: "post-plan", plan },
          });
        }
        case "post-plan": {
          const decision = (r.value as { decision: string }).decision;
          if (decision === "deny") {
            return {
              kind: "output",
              value: {
                topic: i.topic ?? "generic",
                question: i.state?.question ?? "",
                findings: [],
                report: "(aborted — plan not approved)",
                validation_verdict: "fail",
              },
              evidence: { verdict: "pass" },
            };
          }
          return replaceSelf({
            ...i,
            state: { ...i.state!, phase: "post-approve" },
          });
        }
        case "post-approve": {
          const output = r.value as { output: { findings?: string[] } };
          const findings = output.output?.findings ?? [];
          return replaceSelf({
            ...i,
            state: { ...i.state!, phase: "post-search", findings },
          });
        }
        case "post-search": {
          const verdict = (r.value as { verdict: "pass" | "fail" }).verdict;
          return replaceSelf({
            ...i,
            state: { ...i.state!, phase: "post-check", validation_verdict: verdict },
          });
        }
        case "post-check": {
          const report = (r.value as { value: string }).value;
          return {
            kind: "output",
            value: {
              topic: i.topic ?? "generic",
              question: i.state?.question ?? "",
              findings: i.state?.findings ?? [],
              report,
              validation_verdict: i.state?.validation_verdict ?? "pass",
            },
            ctx_patch: {
              set: {
                [`research.${i.topic ?? "generic"}.report`]: asArtifact(
                  {
                    question: i.state?.question,
                    findings: i.state?.findings,
                    report,
                    validation_verdict: i.state?.validation_verdict,
                  },
                  { media_type: "application/json" },
                ),
              },
            },
            evidence: { verdict: "pass" },
          };
        }
      }
    },
  };
}

function synthPrompt(i: {
  state?: { question?: string; findings?: string[]; validation_verdict?: "pass" | "fail" };
}): string {
  const question = i.state?.question ?? "(no question recorded)";
  const findings = (i.state?.findings ?? []).map((f) => `- ${f}`).join("\n");
  return [
    `Synthesize a short research report (3-5 sentences, plain prose).`,
    ``,
    `Question: ${question}`,
    `Validation verdict: ${i.state?.validation_verdict ?? "pass"}`,
    ``,
    `Findings:`,
    findings || "(none)",
  ].join("\n");
}
