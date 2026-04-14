/**
 * Session store — reads/writes `<sessionDir>/session.yaml` and manages
 * the user-answers ledger that drives resume.
 *
 * A session is identified by its directory. The `session_id` inside is a
 * convention (opaque UUID-like string); the directory path is the handle.
 */

import { join } from "node:path";
import { ensureDir, readYaml, writeYaml } from "../util/fs.js";

/**
 * Per-path mutex: every `updateSession` / `saveSession` call on the same
 * session directory serializes here. Prevents the tmp-rename race that
 * surfaces when `needs_user` and `engine_finish` fire back-to-back.
 */
const sessionLocks = new Map<string, Promise<void>>();

async function withSessionLock<T>(sessionDir: string, fn: () => Promise<T>): Promise<T> {
  const prev = sessionLocks.get(sessionDir) ?? Promise.resolve();
  let release!: () => void;
  const next = new Promise<void>((resolve) => {
    release = resolve;
  });
  sessionLocks.set(sessionDir, prev.then(() => next));
  try {
    await prev;
    return await fn();
  } finally {
    release();
    // Allow GC when chain is idle.
    if (sessionLocks.get(sessionDir) === next) sessionLocks.delete(sessionDir);
  }
}
import {
  SessionStateSchema,
  type PendingPrompt,
  type RootSpawnSnapshot,
  type SessionState,
  type SessionStatus,
  type UserAnswer,
} from "./types.js";

export function sessionStatePath(sessionDir: string): string {
  return join(sessionDir, "session.yaml");
}

export function sessionEventsPath(sessionDir: string): string {
  return join(sessionDir, "events.jsonl");
}

export function sessionEvidenceDir(sessionDir: string): string {
  return join(sessionDir, "evidence");
}

export async function createSession(args: {
  sessionDir: string;
  sessionId: string;
  root: RootSpawnSnapshot;
  grantedRoot: readonly string[];
  title?: string;
  clock?: () => Date;
}): Promise<SessionState> {
  const clock = args.clock ?? (() => new Date());
  const now = clock().toISOString();
  const state: SessionState = {
    session_version: 1,
    session_id: args.sessionId,
    created_at: now,
    updated_at: now,
    status: "running",
    root: args.root,
    granted_root: [...args.grantedRoot],
    user_answers: [],
    pending_prompts: [],
    ...(args.title ? { title: args.title } : {}),
  };
  await ensureDir(args.sessionDir);
  await writeYaml(sessionStatePath(args.sessionDir), state);
  return state;
}

export async function loadSession(sessionDir: string): Promise<SessionState | null> {
  return readYaml(sessionStatePath(sessionDir), SessionStateSchema);
}

export async function saveSession(
  sessionDir: string,
  state: SessionState,
  clock: () => Date = () => new Date(),
): Promise<void> {
  await withSessionLock(sessionDir, async () => {
    const next = { ...state, updated_at: clock().toISOString() };
    await writeYaml(sessionStatePath(sessionDir), next);
  });
}

export async function updateSession(
  sessionDir: string,
  patch: (state: SessionState) => SessionState,
  clock: () => Date = () => new Date(),
): Promise<SessionState> {
  return withSessionLock(sessionDir, async () => {
    const existing = await loadSession(sessionDir);
    if (!existing) throw new Error(`loadSession: no session at ${sessionDir}`);
    const patched = patch(existing);
    const next = { ...patched, updated_at: clock().toISOString() };
    await writeYaml(sessionStatePath(sessionDir), next);
    return next;
  });
}

export async function setSessionStatus(
  sessionDir: string,
  status: SessionStatus,
): Promise<SessionState> {
  return updateSession(sessionDir, (s) => ({ ...s, status }));
}

/**
 * Append a pending prompt (from a `NeedsUser` result). Idempotent on
 * resume_hint — if the same hint is already pending, this is a no-op.
 */
export async function recordPendingPrompt(
  sessionDir: string,
  prompt: PendingPrompt,
): Promise<SessionState> {
  return updateSession(sessionDir, (s) => {
    if (s.pending_prompts.some((p) => p.resume_hint === prompt.resume_hint)) return s;
    return {
      ...s,
      pending_prompts: [...s.pending_prompts, prompt],
      status: "suspended",
    };
  });
}

/**
 * Accept a user answer. Drops the matching pending prompt; appends to
 * `user_answers`. Last answer wins if the user re-answers the same hint.
 */
export async function recordAnswer(
  sessionDir: string,
  answer: UserAnswer,
): Promise<SessionState> {
  return updateSession(sessionDir, (s) => {
    const pending = s.pending_prompts.filter((p) => p.resume_hint !== answer.resume_hint);
    const filteredAnswers = s.user_answers.filter((a) => a.resume_hint !== answer.resume_hint);
    const nextStatus: SessionStatus = pending.length === 0 ? "running" : "suspended";
    return {
      ...s,
      pending_prompts: pending,
      user_answers: [...filteredAnswers, answer],
      status: nextStatus,
    };
  });
}
