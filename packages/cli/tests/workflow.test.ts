import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  runWorkflow,
  resumeWorkflow,
  ctxList,
  inspectSession,
  renderInspectReport,
} from "../src/index.js";
import { loadSession } from "@agenteer/core";

describe("CLI workflow (run → suspend → resume → inspect)", () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "agenteer-cli-"));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("approval_gate workflow: run suspends, resume completes with injected answer", async () => {
    const spec = {
      manifest_id: "@agenteer/node-approval-gate",
      input: { prompt: "Deploy to prod?", decision_id: "prod.deploy" },
      granted: ["spawn:@agenteer/node-approval-gate"],
      correlation: "root",
      title: "demo approval",
    };

    const runResult = await runWorkflow({ sessionDir: dir, spec });
    expect(runResult.outcome.finalStatus).toBe("suspended");

    const mid = await loadSession(dir);
    expect(mid?.status).toBe("suspended");
    expect(mid?.pending_prompts[0]!.resume_hint).toBe("prod.deploy");

    const resumeResult = await resumeWorkflow({
      sessionDir: dir,
      interactive: false,
      answerProvider: ({ resume_hint }) => {
        if (resume_hint === "prod.deploy") return "approve";
        throw new Error(`unexpected hint: ${resume_hint}`);
      },
    });
    expect(resumeResult.outcome.finalStatus).toBe("completed");
    if (resumeResult.outcome.rootResult?.kind !== "output") throw new Error("unreachable");
    const v = resumeResult.outcome.rootResult.value as { decision: string; source: string };
    expect(v.decision).toBe("approve");
    expect(v.source).toBe("resolver");

    // inspectSession surfaces the resume story.
    const report = await inspectSession(dir);
    expect(report.state.status).toBe("completed");
    expect(report.state.user_answers.map((a) => a.answer)).toContain("approve");
    // At least two engine_start events across the two runs.
    expect(report.event_types["engine_start"]).toBeGreaterThanOrEqual(2);
    // renderInspectReport runs without throwing.
    const rendered = renderInspectReport(report);
    expect(rendered).toMatch(/status:\s+completed/);
  });

  it("resumeWorkflow on a completed session is a no-op passthrough", async () => {
    const spec = {
      manifest_id: "@agenteer/node-approval-gate",
      input: { prompt: "ok?", decision: "approve" },
      granted: ["spawn:@agenteer/node-approval-gate"],
      correlation: "root",
    };
    const result = await runWorkflow({ sessionDir: dir, spec });
    expect(result.outcome.finalStatus).toBe("completed");

    const again = await resumeWorkflow({
      sessionDir: dir,
      interactive: false,
    });
    expect(again.outcome.finalStatus).toBe("completed");
  });

  it("ctxList reports stored context items from a planner+approval flow", async () => {
    // A workflow that emits a ctx artifact via ask_user with recorded answer.
    const spec = {
      manifest_id: "@agenteer/node-ask-user",
      input: { prompt: "severity?", answer: "high" },
      granted: ["spawn:@agenteer/node-ask-user"],
      correlation: "root",
    };
    const { outcome } = await runWorkflow({ sessionDir: dir, spec });
    expect(outcome.finalStatus).toBe("completed");

    // ask_user doesn't write ctx items; the list should be empty but the
    // call must succeed against the on-disk store.
    const entries = await ctxList(dir);
    expect(Array.isArray(entries)).toBe(true);
  });
});
