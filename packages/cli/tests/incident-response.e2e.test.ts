/**
 * Incident response — reference-domain E2E (M5 §5.5).
 *
 * The scenario demonstrates every substantive M5 surface in one flow:
 *   1. CLI `run` creates a session and launches an `incident_driver`.
 *   2. The driver asks the user for severity. `ask_user` returns NeedsUser;
 *      the session suspends and `session.yaml` records the pending prompt.
 *   3. CLI `resume` collects the answer ("high") and re-enters the driver.
 *   4. The driver advances via ReplaceMe to the approval phase and spawns
 *      `approval_gate`. NeedsUser again; session suspends a second time.
 *   5. Resume with "approve" → driver enters its log-scan phase, spawns
 *      a domain `log_scan` node (deterministic mock — simulates a search).
 *   6. Scan output is folded into an `incident.report` Artifact in ctx.
 *   7. `inspectSession` confirms: completed state, both answers recorded,
 *      3+ engine_start events (first run + 2 resumes), ctx artifact present.
 *
 * This is the pitch: debuggable context (ctx artifact), hardened stdlib
 * nodes (ask_user / approval_gate / etc.), dynamic composition (driver
 * advances through phases via SpawnChildren + ReplaceMe), and the whole
 * thing is pause-resumable through the CLI.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { z } from "zod";
import {
  asArtifact,
  loadSession,
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
} from "@agenteer/stdlib";
import {
  ctxList,
  inspectSession,
  runWorkflow,
  resumeWorkflow,
} from "../src/index.js";

// ---------- Domain node: log_scan (stub) ---------------------------------

const LogScanManifest: NodeManifest = makeManifest({
  id: "@agenteer/node-example-log-scan",
  name: "log_scan",
  description: "Deterministic log scan stub for the incident-response demo.",
  determinism: "deterministic",
  tags: ["example", "investigation"],
});

const LogScanInput = z.object({ severity: z.string() });
const LogScanOutput = z.object({
  findings: z.array(z.string()),
  pattern: z.string(),
});

function logScanFactory(): Node<z.input<typeof LogScanInput>, z.infer<typeof LogScanOutput>> {
  return {
    manifest: LogScanManifest,
    inputSchema: LogScanInput,
    outputSchema: LogScanOutput,
    ctx: [],
    model: null,
    async execute(input): Promise<NodeResult<z.infer<typeof LogScanOutput>>> {
      const sev = input.original.severity;
      const base = ["[auth] session token expired", "[auth] 401 upstream"];
      const extra = sev === "high" ? ["[auth] refresh_failed: rate_limited"] : [];
      return {
        kind: "output",
        value: { findings: [...base, ...extra], pattern: "auth.*" },
        evidence: { verdict: "pass" },
      };
    },
  };
}

// ---------- Driver: incident_driver --------------------------------------

const DriverManifest: NodeManifest = makeManifest({
  id: "@agenteer/node-example-incident-driver",
  name: "incident_driver",
  description:
    "Incident response state machine. Severity → approval → log scan → artifact report.",
  determinism: "deterministic",
  tags: ["example", "meta"],
  required_actions: [
    `spawn:${askUserManifest.id}`,
    `spawn:${approvalGateManifest.id}`,
    `spawn:${LogScanManifest.id}`,
  ],
});

type DriverPhase = "start" | "post-sev" | "post-approval";
const DriverInput = z.object({
  case_id: z.string(),
  state: z
    .object({
      phase: z.enum(["start", "post-sev", "post-approval"]),
      severity: z.string().optional(),
      approved: z.boolean().optional(),
    })
    .default({ phase: "start" }),
});
const DriverOutput = z.object({
  case_id: z.string(),
  status: z.enum(["resolved", "aborted_by_user"]),
  severity: z.string().optional(),
  findings: z.array(z.string()).optional(),
});

function incidentDriverFactory(): Node<
  z.input<typeof DriverInput>,
  z.infer<typeof DriverOutput>
> {
  return {
    manifest: DriverManifest,
    inputSchema: DriverInput,
    outputSchema: DriverOutput,
    ctx: [],
    model: null,
    async execute(
      input: NodeInput<z.input<typeof DriverInput>>,
    ): Promise<NodeResult<z.infer<typeof DriverOutput>>> {
      const i = input.original;
      const phase = i.state?.phase ?? "start";
      const kids = input.children;

      // Pre-spawn: decide what to fan out for this phase.
      if (!kids) {
        if (phase === "start") {
          return spawnOne({
            manifest_id: askUserManifest.id,
            correlation: "sev",
            input: {
              prompt: `Severity for ${i.case_id}?`,
              question_id: `incident.${i.case_id}.severity`,
            },
          });
        }
        if (phase === "post-sev") {
          return spawnOne({
            manifest_id: approvalGateManifest.id,
            correlation: "approve",
            input: {
              prompt: `Approve remediation for ${i.case_id}?`,
              decision_id: `incident.${i.case_id}.approve`,
            },
          });
        }
        if (phase === "post-approval") {
          return spawnOne({
            manifest_id: LogScanManifest.id,
            correlation: "scan",
            input: { severity: i.state?.severity ?? "unknown" },
          });
        }
      }

      // Post-join: process children, advance phase.
      const child = kids![0]!;
      const r = child.result;
      if (r.kind === "needs_user") {
        return { kind: "needs_user", prompt: r.prompt, ...(r.resume_hint ? { resume_hint: r.resume_hint } : {}) };
      }
      if (r.kind === "failed") {
        return { kind: "failed", reason: r.reason, retryable: r.retryable };
      }
      if (r.kind !== "output") {
        return { kind: "failed", reason: `unexpected child kind: ${r.kind}`, retryable: false };
      }

      if (phase === "start") {
        const severity = (r.value as { answer: string }).answer;
        return replaceSelf({
          case_id: i.case_id,
          state: { phase: "post-sev", severity },
        });
      }
      if (phase === "post-sev") {
        const decision = (r.value as { decision: string }).decision;
        if (decision === "deny") {
          return {
            kind: "output",
            value: {
              case_id: i.case_id,
              status: "aborted_by_user",
              ...(i.state?.severity ? { severity: i.state.severity } : {}),
            },
            evidence: { verdict: "pass" },
          };
        }
        return replaceSelf({
          case_id: i.case_id,
          state: {
            phase: "post-approval",
            ...(i.state?.severity !== undefined ? { severity: i.state.severity } : {}),
            approved: true,
          },
        });
      }
      // phase === "post-approval"
      const scan = r.value as { findings: string[]; pattern: string };
      return {
        kind: "output",
        value: {
          case_id: i.case_id,
          status: "resolved",
          ...(i.state?.severity ? { severity: i.state.severity } : {}),
          findings: scan.findings,
        },
        ctx_patch: {
          set: {
            [`incident.${i.case_id}.report`]: asArtifact(
              {
                case_id: i.case_id,
                severity: i.state?.severity,
                pattern: scan.pattern,
                findings: scan.findings,
              },
              { media_type: "application/json" },
            ),
          },
        },
        evidence: { verdict: "pass" },
      };
    },
  };
}

function spawnOne(spec: NodeSpawn): NodeResult<never> {
  return {
    kind: "spawn_children",
    children: [spec],
    join: { mode: "all" },
  };
}

function replaceSelf(input: z.input<typeof DriverInput>): NodeResult<never> {
  return {
    kind: "replace_me",
    successor: {
      manifest_id: DriverManifest.id,
      input,
      correlation: "driver",
    },
    reason: `phase -> ${input.state?.phase}`,
  };
}

// ---------- The end-to-end test -----------------------------------------

describe("incident response E2E (CLI run → suspend → resume x2 → complete)", () => {
  let dir: string;
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "agenteer-incident-"));
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("walks through severity → approval → log scan → incident report artifact", async () => {
    const spec = {
      manifest_id: DriverManifest.id,
      input: { case_id: "CASE-42" },
      granted: [
        `spawn:${DriverManifest.id}`,
        `spawn:${askUserManifest.id}`,
        `spawn:${approvalGateManifest.id}`,
        `spawn:${LogScanManifest.id}`,
      ],
      correlation: "root",
      title: "incident CASE-42",
    };

    const registerDomain = (r: import("@agenteer/core").NodeRegistry) => {
      r.register(DriverManifest, incidentDriverFactory);
      r.register(LogScanManifest, logScanFactory);
    };

    // --- First run: suspends on ask_user (severity) ---
    const first = await runWorkflow({
      sessionDir: dir,
      spec,
      extraRegistrations: registerDomain,
    });
    expect(first.outcome.finalStatus).toBe("suspended");

    const s1 = await loadSession(dir);
    expect(s1?.pending_prompts).toHaveLength(1);
    expect(s1?.pending_prompts[0]!.resume_hint).toBe("incident.CASE-42.severity");

    // --- Resume 1: answer severity → suspends on approval ---
    const resume1 = await resumeWorkflow({
      sessionDir: dir,
      interactive: false,
      extraRegistrations: registerDomain,
      answerProvider: ({ resume_hint }) => {
        if (resume_hint === "incident.CASE-42.severity") return "high";
        throw new Error(`unexpected: ${resume_hint}`);
      },
    });
    expect(resume1.outcome.finalStatus).toBe("suspended");

    const s2 = await loadSession(dir);
    expect(s2?.pending_prompts).toHaveLength(1);
    expect(s2?.pending_prompts[0]!.resume_hint).toBe("incident.CASE-42.approve");

    // --- Resume 2: approve → driver advances, log_scan runs, completes ---
    const resume2 = await resumeWorkflow({
      sessionDir: dir,
      interactive: false,
      extraRegistrations: registerDomain,
      answerProvider: ({ resume_hint }) => {
        if (resume_hint === "incident.CASE-42.approve") return "approve";
        throw new Error(`unexpected: ${resume_hint}`);
      },
    });
    expect(resume2.outcome.finalStatus).toBe("completed");
    if (resume2.outcome.rootResult?.kind !== "output") throw new Error("unreachable");
    const report = resume2.outcome.rootResult.value as {
      case_id: string;
      status: string;
      severity: string;
      findings: string[];
    };
    expect(report.case_id).toBe("CASE-42");
    expect(report.status).toBe("resolved");
    expect(report.severity).toBe("high");
    expect(report.findings).toContain("[auth] refresh_failed: rate_limited");

    // --- Ctx artifact: incident.CASE-42.report landed as an Artifact ---
    const artifacts = await ctxList(dir, { tag: "incident.CASE-42.report" });
    expect(artifacts).toHaveLength(1);
    expect(artifacts[0]!.type).toBe("artifact");

    // --- Full inspection report ---
    const inspect = await inspectSession(dir);
    expect(inspect.state.status).toBe("completed");
    expect(inspect.state.user_answers.map((a) => a.resume_hint).sort()).toEqual([
      "incident.CASE-42.approve",
      "incident.CASE-42.severity",
    ]);
    expect(inspect.event_types["engine_start"]).toBeGreaterThanOrEqual(3);
    expect(inspect.context_item_count).toBeGreaterThanOrEqual(1);
    expect(inspect.evidence_count).toBeGreaterThan(0);
  });

  it("denial path: approval_gate 'deny' short-circuits with status aborted_by_user", async () => {
    const spec = {
      manifest_id: DriverManifest.id,
      input: { case_id: "CASE-deny" },
      granted: [
        `spawn:${DriverManifest.id}`,
        `spawn:${askUserManifest.id}`,
        `spawn:${approvalGateManifest.id}`,
        `spawn:${LogScanManifest.id}`,
      ],
      correlation: "root",
    };

    const registerDomain = (r: import("@agenteer/core").NodeRegistry) => {
      r.register(DriverManifest, incidentDriverFactory);
      r.register(LogScanManifest, logScanFactory);
    };

    await runWorkflow({
      sessionDir: dir,
      spec,
      extraRegistrations: registerDomain,
    });

    await resumeWorkflow({
      sessionDir: dir,
      interactive: false,
      extraRegistrations: registerDomain,
      answerProvider: ({ resume_hint }) =>
        resume_hint === "incident.CASE-deny.severity" ? "low" : "deny",
    });

    const final = await resumeWorkflow({
      sessionDir: dir,
      interactive: false,
      extraRegistrations: registerDomain,
      answerProvider: ({ resume_hint }) =>
        resume_hint === "incident.CASE-deny.approve" ? "deny" : "skip",
    });
    expect(final.outcome.finalStatus).toBe("completed");
    if (final.outcome.rootResult?.kind !== "output") throw new Error("unreachable");
    const v = final.outcome.rootResult.value as { status: string; severity: string };
    expect(v.status).toBe("aborted_by_user");
    expect(v.severity).toBe("low");
  });
});
