/**
 * End-to-end: run a workflow that suspends on `ask_user`/`approval_gate`,
 * persist to disk, "the user answers", resume — and everything completes.
 *
 * This is the pitch for M5: `@agenteer/cli` builds on exactly this flow.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { YamlEvidenceStore } from "@agenteer/trust/evidence";
import {
  FileContextStore,
  InMemoryNodeRegistry,
  Runtime,
  RuntimeEvents,
  SessionRecorder,
  createSession,
  loadSession,
  recordAnswer,
  recordedAnswerResolver,
  sessionEventsPath,
  sessionEvidenceDir,
  type SessionState,
} from "@agenteer/core";
import {
  approvalGateFactory,
  approvalGateManifest,
  askUserFactory,
  askUserManifest,
  type ApprovalResolver,
  type AskUserResolver,
} from "../src/index.js";

/** Bridge session answers → approval_gate / ask_user resolvers. */
function buildResolvers(state: SessionState) {
  const sess = recordedAnswerResolver(state);
  const approval: ApprovalResolver = {
    resolve: ({ decision_id }) => {
      if (decision_id === undefined) return null;
      const v = sess.get(decision_id);
      if (v === "approve" || v === "deny") return v;
      return null;
    },
  };
  const askUser: AskUserResolver = {
    resolve: ({ question_id }) => {
      if (question_id === undefined) return null;
      const v = sess.get(question_id);
      return v === undefined ? null : v;
    },
  };
  return { approval, askUser };
}

async function buildRuntime(sessionDir: string, state: SessionState) {
  const contextStore = new FileContextStore({ sessionDir });
  await contextStore.load();
  const evidenceSink = new YamlEvidenceStore({
    dir: sessionEvidenceDir(sessionDir),
    duplicates: "dedupe",
  });
  const events = new RuntimeEvents();
  const recorder = new SessionRecorder({ sessionDir, events });
  const registry = new InMemoryNodeRegistry();
  const { approval, askUser } = buildResolvers(state);
  registry.register(approvalGateManifest, approvalGateFactory(approval));
  registry.register(askUserManifest, askUserFactory({ resolver: askUser }));
  const runtime = new Runtime({
    sessionId: state.session_id,
    registry,
    contextStore,
    evidenceSink,
    events,
  });
  return { runtime, recorder, contextStore };
}

describe("session resume: suspend → answer → resume → complete", () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "agenteer-e2e-"));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("approval_gate suspends, user answers, resume completes", async () => {
    const root = {
      manifest_id: approvalGateManifest.id,
      input: { prompt: "Deploy to prod?", decision_id: "deploy.prod" },
      correlation: "r",
    };
    const state = await createSession({
      sessionDir: dir,
      sessionId: "sess-1",
      root: {
        manifest_id: root.manifest_id,
        input: root.input,
        correlation: root.correlation,
      },
      grantedRoot: [`spawn:${approvalGateManifest.id}`],
    });

    // First run — no recorded answer yet, so `needs_user`.
    {
      const { runtime, recorder } = await buildRuntime(dir, state);
      const outcome = await runtime.run(root, state.granted_root);
      await recorder.flush();
      expect(outcome.finalStatus).toBe("suspended");
    }

    const after1 = await loadSession(dir);
    expect(after1?.status).toBe("suspended");
    expect(after1?.pending_prompts).toHaveLength(1);
    expect(after1?.pending_prompts[0]!.resume_hint).toBe("deploy.prod");

    // User answers.
    await recordAnswer(dir, {
      resume_hint: "deploy.prod",
      answer: "approve",
      answered_at: new Date().toISOString(),
      by: "user",
    });

    const after2 = await loadSession(dir);
    expect(after2?.status).toBe("running");

    // Resume — recorded answer satisfies the gate; runtime completes.
    {
      const { runtime, recorder } = await buildRuntime(dir, after2!);
      const outcome = await runtime.run(root, after2!.granted_root);
      await recorder.flush();
      expect(outcome.finalStatus).toBe("completed");
      if (outcome.rootResult?.kind !== "output") throw new Error("unreachable");
      const v = outcome.rootResult.value as { decision: string; source: string };
      expect(v.decision).toBe("approve");
      expect(v.source).toBe("resolver");
    }

    // events.jsonl accumulates across runs.
    const jsonl = await readFile(sessionEventsPath(dir), "utf-8");
    const types = jsonl.trim().split("\n").map((l) => JSON.parse(l).type);
    expect(types).toContain("engine_start");
    expect(types).toContain("needs_user");
    expect(types.filter((t) => t === "engine_start")).toHaveLength(2);
  });

  it("ask_user + structured answer schema round-trips through resume", async () => {
    const root = {
      manifest_id: askUserManifest.id,
      input: { prompt: "Confirm severity?", question_id: "incident.sev" },
      correlation: "r",
    };
    const state = await createSession({
      sessionDir: dir,
      sessionId: "sess-2",
      root: {
        manifest_id: root.manifest_id,
        input: root.input,
        correlation: root.correlation,
      },
      grantedRoot: [`spawn:${askUserManifest.id}`],
    });

    {
      const { runtime, recorder } = await buildRuntime(dir, state);
      const outcome = await runtime.run(root, state.granted_root);
      await recorder.flush();
      expect(outcome.finalStatus).toBe("suspended");
    }

    await recordAnswer(dir, {
      resume_hint: "incident.sev",
      answer: "high",
      answered_at: new Date().toISOString(),
      by: "user",
    });

    const resumed = await loadSession(dir);
    const { runtime, recorder } = await buildRuntime(dir, resumed!);
    const outcome = await runtime.run(root, resumed!.granted_root);
    await recorder.flush();
    expect(outcome.finalStatus).toBe("completed");
    if (outcome.rootResult?.kind !== "output") throw new Error("unreachable");
    const v = outcome.rootResult.value as { answer: string; source: string };
    expect(v.answer).toBe("high");
    expect(v.source).toBe("resolver");
  });
});
