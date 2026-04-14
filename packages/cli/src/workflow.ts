/**
 * Workflow orchestration helpers shared by `run` and `resume` commands.
 *
 * Responsibilities:
 *   - Build a fully-wired node registry (stdlib + M4 factories the
 *     `registerStdlib` export doesn't handle because they need resolvers
 *     or providers).
 *   - Produce a `Runtime` bound to `FileContextStore` + `YamlEvidenceStore`
 *     + `SessionRecorder`.
 *   - Bridge `RecordedAnswerResolver` → approval_gate / ask_user resolvers.
 *
 * Nothing here touches stdin — the CLI `resume` command layers that on
 * top, so tests can replace the interactive layer.
 */

import { YamlEvidenceStore } from "@agenteer/trust/evidence";
import {
  FileContextStore,
  InMemoryNodeRegistry,
  Runtime,
  RuntimeEvents,
  SessionRecorder,
  recordedAnswerResolver,
  sessionEvidenceDir,
  type ModelProvider,
  type NodeRegistry,
  type SessionState,
} from "@agenteer/core";
import {
  approvalGateFactory,
  approvalGateManifest,
  askUserFactory,
  askUserManifest,
  crossCheckFactory,
  crossCheckManifest,
  llmCallFactory,
  llmCallManifest,
  registerStdlib,
  type ApprovalResolver,
  type AskUserResolver,
  type ProviderResolver,
} from "@agenteer/stdlib";

export interface BuildRegistryOptions {
  modelProvider?: ModelProvider;
  approvalResolver?: ApprovalResolver;
  askUserResolver?: AskUserResolver;
  /** Optional cross-check provider resolver (used by the `cross_check` node). */
  crossCheckResolver?: ProviderResolver;
  /** Extra registrations (domain-specific nodes). */
  extra?: (registry: NodeRegistry) => void;
}

export function buildStdlibRegistry(opts: BuildRegistryOptions = {}): NodeRegistry {
  const registry = new InMemoryNodeRegistry();
  registerStdlib(registry);
  registry.register(approvalGateManifest, approvalGateFactory(opts.approvalResolver));
  registry.register(askUserManifest, askUserFactory({ ...(opts.askUserResolver ? { resolver: opts.askUserResolver } : {}) }));
  if (opts.modelProvider) {
    registry.register(llmCallManifest, llmCallFactory());
  }
  if (opts.crossCheckResolver) {
    registry.register(crossCheckManifest, crossCheckFactory(opts.crossCheckResolver));
  }
  opts.extra?.(registry);
  return registry;
}

/**
 * Build answer-bridge resolvers from session state. `approval_gate` expects
 * `"approve" | "deny"`; `ask_user` accepts any value. Nodes without a
 * `decision_id` / `question_id` cannot be satisfied via recorded answers;
 * they always fall through to `NeedsUser`.
 */
export function sessionResolvers(state: SessionState): {
  approval: ApprovalResolver;
  askUser: AskUserResolver;
} {
  const recorded = recordedAnswerResolver(state);
  return {
    approval: {
      resolve: ({ decision_id }) => {
        if (decision_id === undefined) return null;
        const v = recorded.get(decision_id);
        if (v === "approve" || v === "deny") return v;
        return null;
      },
    },
    askUser: {
      resolve: ({ question_id }) => {
        if (question_id === undefined) return null;
        const v = recorded.get(question_id);
        return v === undefined ? null : v;
      },
    },
  };
}

export interface BuildRuntimeOptions {
  sessionDir: string;
  sessionId: string;
  registry: NodeRegistry;
  modelProvider?: ModelProvider;
  events?: RuntimeEvents;
  accessSnapshotRoot?: string;
}

export async function buildRuntime(opts: BuildRuntimeOptions): Promise<{
  runtime: Runtime;
  recorder: SessionRecorder;
  contextStore: FileContextStore;
  events: RuntimeEvents;
}> {
  const contextStore = new FileContextStore({ sessionDir: opts.sessionDir });
  await contextStore.load();
  const evidenceSink = new YamlEvidenceStore({
    dir: sessionEvidenceDir(opts.sessionDir),
    duplicates: "dedupe",
  });
  const events = opts.events ?? new RuntimeEvents();
  const recorder = new SessionRecorder({ sessionDir: opts.sessionDir, events });
  const runtime = new Runtime({
    sessionId: opts.sessionId,
    registry: opts.registry,
    contextStore,
    evidenceSink,
    events,
    ...(opts.modelProvider ? { modelProvider: opts.modelProvider } : {}),
    ...(opts.accessSnapshotRoot ? { accessSnapshotRoot: opts.accessSnapshotRoot } : {}),
  });
  return { runtime, recorder, contextStore, events };
}
