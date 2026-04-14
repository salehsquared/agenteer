/**
 * Session state — the persistent shape of a single workflow run.
 *
 * M5 scope:
 *   - Captures the root spawn + root grants so a resume can re-enter the
 *     exact same starting frame.
 *   - Records pending user prompts (from NeedsUser) and their subsequent
 *     answers — enables the ask_user / approval_gate loop.
 *   - Status is a simple finite state machine; a session flips from
 *     `running` → `suspended` → `running` → `completed` across resumes.
 *
 * Durability:
 *   - `session.yaml` is the canonical state; written atomically on every
 *     structural change (answer recorded, status flipped).
 *   - `events.jsonl` is append-only and exists only for introspection /
 *     trace rendering. Resume does NOT need `events.jsonl` — state lives
 *     in `session.yaml` + context + evidence stores.
 */

import { z } from "zod";

export const SessionStatusSchema = z.enum([
  "running",
  "suspended",
  "completed",
  "failed",
  "cancelled",
  "exhausted",
]);
export type SessionStatus = z.infer<typeof SessionStatusSchema>;

export const PendingPromptSchema = z.object({
  resume_hint: z.string(),
  prompt: z.string(),
  node_id: z.string().optional(),
  manifest_id: z.string().optional(),
  at: z.string(),
});
export type PendingPrompt = z.infer<typeof PendingPromptSchema>;

export const UserAnswerSchema = z.object({
  resume_hint: z.string(),
  /**
   * Answer payload — string for ask_user, "approve"/"deny" for
   * approval_gate, or structured JSON if the node schema'd it. We keep
   * this as `unknown` at this layer; resolvers narrow.
   */
  answer: z.unknown(),
  answered_at: z.string(),
  by: z.string().default("user"),
});
export type UserAnswer = z.infer<typeof UserAnswerSchema>;

export const RootSpawnSnapshotSchema = z.object({
  manifest_id: z.string(),
  input: z.unknown(),
  correlation: z.string(),
  attenuate: z.array(z.string()).optional(),
});
export type RootSpawnSnapshot = z.infer<typeof RootSpawnSnapshotSchema>;

export const SessionStateSchema = z.object({
  session_version: z.literal(1),
  session_id: z.string(),
  created_at: z.string(),
  updated_at: z.string(),
  status: SessionStatusSchema,
  root: RootSpawnSnapshotSchema,
  granted_root: z.array(z.string()),
  user_answers: z.array(UserAnswerSchema).default([]),
  pending_prompts: z.array(PendingPromptSchema).default([]),
  /** Freeform label — useful for CLI `inspect` UIs. */
  title: z.string().optional(),
});
export type SessionState = z.infer<typeof SessionStateSchema>;
