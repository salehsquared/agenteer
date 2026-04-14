import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  createSession,
  loadSession,
  recordAnswer,
  recordPendingPrompt,
  SessionRecorder,
  sessionEventsPath,
} from "../src/session/index.js";
import { RuntimeEvents } from "../src/events/events.js";

describe("session store", () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "agenteer-session-"));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("createSession writes a loadable state", async () => {
    const state = await createSession({
      sessionDir: dir,
      sessionId: "test-1",
      root: { manifest_id: "x@1", input: { a: 1 }, correlation: "r" },
      grantedRoot: ["model:mock", "fs.read:/tmp/**"],
      title: "demo",
    });
    expect(state.status).toBe("running");
    const reloaded = await loadSession(dir);
    expect(reloaded?.session_id).toBe("test-1");
    expect(reloaded?.granted_root).toEqual(["model:mock", "fs.read:/tmp/**"]);
    expect(reloaded?.title).toBe("demo");
  });

  it("pending prompt flips status to suspended; answer flips back to running", async () => {
    await createSession({
      sessionDir: dir,
      sessionId: "test-2",
      root: { manifest_id: "x@1", input: {}, correlation: "r" },
      grantedRoot: [],
    });
    const afterPending = await recordPendingPrompt(dir, {
      resume_hint: "approve.deploy",
      prompt: "Approve deploy?",
      at: new Date().toISOString(),
    });
    expect(afterPending.status).toBe("suspended");
    expect(afterPending.pending_prompts).toHaveLength(1);

    const afterAnswer = await recordAnswer(dir, {
      resume_hint: "approve.deploy",
      answer: "approve",
      answered_at: new Date().toISOString(),
      by: "user",
    });
    expect(afterAnswer.status).toBe("running");
    expect(afterAnswer.pending_prompts).toHaveLength(0);
    expect(afterAnswer.user_answers).toHaveLength(1);
    expect(afterAnswer.user_answers[0]!.answer).toBe("approve");
  });

  it("re-answering the same hint replaces the prior answer (last wins)", async () => {
    await createSession({
      sessionDir: dir,
      sessionId: "t",
      root: { manifest_id: "x", input: {}, correlation: "r" },
      grantedRoot: [],
    });
    await recordAnswer(dir, { resume_hint: "h", answer: "a", answered_at: "t1", by: "user" });
    const s = await recordAnswer(dir, {
      resume_hint: "h",
      answer: "b",
      answered_at: "t2",
      by: "user",
    });
    expect(s.user_answers).toHaveLength(1);
    expect(s.user_answers[0]!.answer).toBe("b");
  });
});

describe("SessionRecorder", () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "agenteer-recorder-"));
    await createSession({
      sessionDir: dir,
      sessionId: "rec-1",
      root: { manifest_id: "x@1", input: {}, correlation: "r" },
      grantedRoot: [],
    });
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("appends JSONL lines, captures needs_user, and flips engine_finish status", async () => {
    const events = new RuntimeEvents();
    const recorder = new SessionRecorder({ sessionDir: dir, events });

    events.emit("engine_start", {
      sessionId: "rec-1",
      rootManifest: "x@1",
      timestamp: "2026-04-13T00:00:00Z",
    });
    events.emit("needs_user", {
      nodeId: "node_1",
      manifest: "@agenteer/node-approval-gate",
      prompt: "Deploy?",
      resume_hint: "deploy.q1",
      timestamp: "2026-04-13T00:00:01Z",
    });
    events.emit("engine_finish", {
      sessionId: "rec-1",
      finalStatus: "completed",
      totalSteps: 1,
      timestamp: "2026-04-13T00:00:02Z",
    });

    await recorder.flush();

    const jsonl = await readFile(sessionEventsPath(dir), "utf-8");
    const lines = jsonl.trim().split("\n");
    expect(lines).toHaveLength(3);
    const types = lines.map((l) => JSON.parse(l).type);
    expect(types).toEqual(["engine_start", "needs_user", "engine_finish"]);

    // `needs_user` moved status to suspended; engine_finish should NOT
    // overwrite that even though the runtime reported "completed".
    const state = await loadSession(dir);
    expect(state?.status).toBe("suspended");
    expect(state?.pending_prompts[0]?.resume_hint).toBe("deploy.q1");
  });

  it("terminal status wins when no needs_user fired", async () => {
    const events = new RuntimeEvents();
    const recorder = new SessionRecorder({ sessionDir: dir, events });

    events.emit("engine_finish", {
      sessionId: "rec-1",
      finalStatus: "completed",
      totalSteps: 0,
      timestamp: "2026-04-13T00:00:00Z",
    });

    await recorder.flush();
    const state = await loadSession(dir);
    expect(state?.status).toBe("completed");
  });
});
