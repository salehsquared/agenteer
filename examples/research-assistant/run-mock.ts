/**
 * Runnable mock-mode driver for the research-assistant demo.
 *
 * Seeds MockModelProvider answers, wires an in-process web_search tool,
 * pre-records user answers for ask_user + approval_gate, and drives the
 * workflow end-to-end. Run as:
 *
 *   node examples/research-assistant/run-mock.js [--question "..."] [--deny]
 */

import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { InMemoryToolRegistry, MockModelProvider, recordAnswer } from "@agenteer/core";
import {
  buildStdlibRegistry,
  inspectSession,
  renderCtxTimeline,
  renderInspectReport,
  resumeWorkflow,
  runWorkflow,
} from "@agenteer/cli";
import {
  approvalGateManifest,
  askUserManifest,
  defaultPlannerManifest,
  llmCallManifest,
  regexCheckManifest,
  toolCallManifest,
} from "@agenteer/stdlib";
import { ResearchDriverManifest, researchDriverFactory } from "./driver.js";

const DEFAULT_FINDINGS = [
  "Postgres replica lag spiked on 2026-02-14 during the shopping surge.",
  "Auth service CPU saturated after a config rollout on 2026-03-02.",
  "CDN origin failover masked a true upstream issue on 2026-03-21.",
];

export interface DemoOptions {
  question?: string;
  topic?: string;
  approve?: boolean;
  findings?: readonly string[];
  sessionDir?: string;
}

export async function runMockDemo(opts: DemoOptions = {}): Promise<{
  sessionDir: string;
  report: string;
}> {
  const question = opts.question ?? "What were the top 3 causes of last quarter's outages?";
  const topic = opts.topic ?? "demo";
  const approve = opts.approve ?? true;
  const findings = opts.findings ?? DEFAULT_FINDINGS;
  const sessionDir = opts.sessionDir ?? (await mkdtemp(join(tmpdir(), "research-assistant-")));

  const modelProvider = new MockModelProvider({
    "mock/planner": () => ({
      goal: question,
      steps: [
        {
          id: "s1",
          manifest_id: toolCallManifest.id,
          input: { tool_name: "web_search", args: { query: question } },
          depends_on: [],
        },
      ],
    }),
    "mock/synth": () =>
      `Report on: ${question}\n\n${findings
        .map((f, i) => `(${i + 1}) ${f}`)
        .join(" ")}\n\nValidation: pass.`,
  });

  const toolRegistry = new InMemoryToolRegistry();
  toolRegistry.register({
    name: "web_search",
    async invoke() {
      return { findings: [...findings] };
    },
  });

  const extraRegistrations = (
    r: Parameters<NonNullable<Parameters<typeof buildStdlibRegistry>[0]["extra"]>>[0],
  ) => {
    r.register(ResearchDriverManifest, researchDriverFactory);
  };

  const spec = {
    manifest_id: ResearchDriverManifest.id,
    input: { topic, planner_model_id: "mock/planner", synth_model_id: "mock/synth" },
    granted: [
      `spawn:${ResearchDriverManifest.id}`,
      `spawn:${askUserManifest.id}`,
      `spawn:${defaultPlannerManifest.id}`,
      `spawn:${approvalGateManifest.id}`,
      `spawn:${toolCallManifest.id}`,
      `spawn:${regexCheckManifest.id}`,
      `spawn:${llmCallManifest.id}`,
      "model:mock/planner",
      "model:mock/synth",
      "tool:web_search",
    ],
    correlation: "root",
    title: `research assistant (${topic})`,
    model_ids: [] as string[],
  };

  // First run — suspends on ask_user.
  await runWorkflow({
    sessionDir,
    spec,
    modelProvider,
    toolRegistry,
    extraRegistrations,
  });

  // Pre-record both user answers.
  await recordAnswer(sessionDir, {
    resume_hint: `research.${topic}.question`,
    answer: question,
    answered_at: new Date().toISOString(),
    by: "demo",
  });
  await recordAnswer(sessionDir, {
    resume_hint: `research.${topic}.approve`,
    answer: approve ? "approve" : "deny",
    answered_at: new Date().toISOString(),
    by: "demo",
  });

  // Resume loop — may suspend multiple times as we cross phases.
  let lastStatus: string = "suspended";
  let safety = 0;
  while (lastStatus === "suspended" && safety++ < 8) {
    const r = await resumeWorkflow({
      sessionDir,
      interactive: false,
      modelProvider,
      toolRegistry,
      extraRegistrations,
    });
    lastStatus = r.outcome.finalStatus;
  }

  const report = await inspectSession(sessionDir);
  const rendered = [
    renderInspectReport(report),
    "",
    renderCtxTimeline(report.ctx_timeline),
  ].join("\n");
  return { sessionDir, report: rendered };
}

// CLI entry when run directly via `node examples/research-assistant/run-mock.js`.
if (process.argv[1]?.endsWith("run-mock.js")) {
  const opts: DemoOptions = {};
  for (let i = 2; i < process.argv.length; i++) {
    const a = process.argv[i]!;
    if (a === "--question") opts.question = process.argv[++i]!;
    else if (a === "--topic") opts.topic = process.argv[++i]!;
    else if (a === "--session-dir") opts.sessionDir = process.argv[++i]!;
    else if (a === "--deny") opts.approve = false;
    else if (a === "--approve") opts.approve = true;
  }
  runMockDemo(opts)
    .then((r) => {
      console.log(r.report);
      console.log(`\n(session persisted at ${r.sessionDir})`);
      if (!opts.sessionDir) rm(r.sessionDir, { recursive: true, force: true });
    })
    .catch((err) => {
      console.error(err instanceof Error ? err.stack ?? err.message : String(err));
      process.exit(1);
    });
}
