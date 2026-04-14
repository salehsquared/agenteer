/**
 * `RecordedAnswerResolver` — adapter between session state and the
 * `ApprovalResolver` / `AskUserResolver` contracts nodes consume.
 *
 * The stdlib's `approval_gate` (M4) + `ask_user` (M5) accept a resolver
 * that returns a canned answer synchronously. On resume, this resolver
 * reads the recorded answers from `session.yaml` and returns the match
 * for a given `resume_hint`; `null` falls through to `NeedsUser`.
 *
 * Intentionally NOT async: the node's `execute` is sync-return. So we
 * accept a pre-loaded `SessionState` and close over it. The CLI reads
 * the session once before starting the runtime.
 */

import type { SessionState } from "./types.js";

export interface RecordedAnswerResolver {
  /** Returns the recorded answer for `resume_hint`, or undefined. */
  get(resume_hint: string): unknown | undefined;
  /** True when every pending prompt has an answer. */
  isSatisfied(): boolean;
}

export function recordedAnswerResolver(state: SessionState): RecordedAnswerResolver {
  const answers = new Map<string, unknown>();
  for (const a of state.user_answers) answers.set(a.resume_hint, a.answer);
  const pendingHints = new Set(state.pending_prompts.map((p) => p.resume_hint));
  return {
    get(resume_hint) {
      return answers.get(resume_hint);
    },
    isSatisfied() {
      for (const hint of pendingHints) {
        if (!answers.has(hint)) return false;
      }
      return true;
    },
  };
}
