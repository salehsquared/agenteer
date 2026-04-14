/**
 * `agenteer resume` — re-run a suspended session with recorded answers.
 *
 * Library form: `resumeWorkflow({ sessionDir, modelProvider?, interactive? })`.
 * CLI form:     `agenteer resume --session DIR`
 *
 * If `interactive: true` and there are pending prompts with no recorded
 * answers, we prompt on stdin to collect them before running.
 */

import type { ModelProvider, NodeRegistry, RuntimeOutcome, ToolRegistry } from "@agenteer/core";
import {
  loadSession,
  recordAnswer,
  sessionStatePath,
} from "@agenteer/core";
import { buildRuntime, buildStdlibRegistry, sessionResolvers } from "../workflow.js";
import { promptForAnswer } from "../resolvers/stdin-prompt.js";

export interface ResumeWorkflowOptions {
  sessionDir: string;
  modelProvider?: ModelProvider;
  /** Tool registry forwarded to the Runtime for tool_call dispatch. */
  toolRegistry?: ToolRegistry;
  /** Build a custom registry (default: stdlib). Bypasses session resolvers. */
  registry?: NodeRegistry;
  /**
   * Extra registrations layered on top of the default stdlib registry.
   * Prefer this to `registry` when you want the CLI-side resolvers to
   * see freshly-recorded answers automatically.
   */
  extraRegistrations?: (registry: NodeRegistry) => void;
  /** When true, unanswered prompts are collected from stdin before running. */
  interactive?: boolean;
  /** Override for tests: answer pending prompts without stdin. */
  answerProvider?: (p: {
    manifestId: string;
    prompt: string;
    resume_hint: string;
  }) => Promise<unknown> | unknown;
}

export interface ResumeWorkflowResult {
  sessionDir: string;
  sessionId: string;
  outcome: RuntimeOutcome;
}

export async function resumeWorkflow(
  opts: ResumeWorkflowOptions,
): Promise<ResumeWorkflowResult> {
  const state = await loadSession(opts.sessionDir);
  if (!state) {
    throw new Error(`resumeWorkflow: no session at ${sessionStatePath(opts.sessionDir)}`);
  }

  if (state.status === "completed" || state.status === "failed" || state.status === "cancelled") {
    return {
      sessionDir: opts.sessionDir,
      sessionId: state.session_id,
      outcome: {
        sessionId: state.session_id,
        finalStatus: state.status,
        totalSteps: 0,
        durationMs: 0,
      },
    };
  }

  // Ensure every pending prompt has an answer.
  if (state.pending_prompts.length > 0) {
    const answer = opts.answerProvider;
    const isInteractive = opts.interactive ?? true;
    if (!answer && !isInteractive) {
      throw new Error(
        `resumeWorkflow: ${state.pending_prompts.length} pending prompt(s) with no answer provider and interactive=false`,
      );
    }
    for (const p of state.pending_prompts) {
      const answered = state.user_answers.some((a) => a.resume_hint === p.resume_hint);
      if (answered) continue;
      const value = answer
        ? await answer({
            manifestId: p.manifest_id ?? "",
            prompt: p.prompt,
            resume_hint: p.resume_hint,
          })
        : await promptForAnswer({ manifestId: p.manifest_id ?? "", prompt: p.prompt });
      await recordAnswer(opts.sessionDir, {
        resume_hint: p.resume_hint,
        answer: value,
        answered_at: new Date().toISOString(),
        by: "user",
      });
    }
  }

  // Reload state after answers were persisted.
  const refreshed = (await loadSession(opts.sessionDir))!;
  const { approval, askUser } = sessionResolvers(refreshed);
  const registry =
    opts.registry ??
    buildStdlibRegistry({
      ...(opts.modelProvider ? { modelProvider: opts.modelProvider } : {}),
      approvalResolver: approval,
      askUserResolver: askUser,
      ...(opts.extraRegistrations ? { extra: opts.extraRegistrations } : {}),
    });

  const { runtime, recorder } = await buildRuntime({
    sessionDir: opts.sessionDir,
    sessionId: refreshed.session_id,
    registry,
    ...(opts.modelProvider ? { modelProvider: opts.modelProvider } : {}),
    ...(opts.toolRegistry ? { toolRegistry: opts.toolRegistry } : {}),
  });

  const outcome = await runtime.run(
    {
      manifest_id: refreshed.root.manifest_id,
      input: refreshed.root.input,
      correlation: refreshed.root.correlation,
      ...(refreshed.root.attenuate ? { attenuate: refreshed.root.attenuate } : {}),
    },
    refreshed.granted_root,
  );
  await recorder.flush();

  return { sessionDir: opts.sessionDir, sessionId: refreshed.session_id, outcome };
}
