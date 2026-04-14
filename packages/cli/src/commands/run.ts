/**
 * `agenteer run` — start a new session.
 *
 * Library form: `runWorkflow({ sessionDir, spec, modelProvider? })`.
 * CLI form:     `agenteer run --spec workflow.json --session DIR`
 *
 * A workflow spec is a JSON/YAML object: root manifest, input, granted
 * capabilities, optional title + model ids (used to build providers).
 */

import { z } from "zod";
import {
  createSession,
  newSessionId,
  type NodeRegistry,
  type RuntimeOutcome,
  type ModelProvider,
  type ToolRegistry,
} from "@agenteer/core";
import { buildRuntime, buildStdlibRegistry, sessionResolvers } from "../workflow.js";
import { loadSession } from "@agenteer/core";

export const WorkflowSpecSchema = z.object({
  manifest_id: z.string(),
  input: z.unknown(),
  granted: z.array(z.string()),
  correlation: z.string().default("root"),
  attenuate: z.array(z.string()).optional(),
  title: z.string().optional(),
  /** Model ids the workflow will dispatch; only used for CLI provider setup. */
  model_ids: z.array(z.string()).default([]),
});
export type WorkflowSpec = z.input<typeof WorkflowSpecSchema>;

export interface RunWorkflowOptions {
  sessionDir: string;
  sessionId?: string;
  spec: WorkflowSpec;
  modelProvider?: ModelProvider;
  /** Tool registry forwarded to the Runtime for tool_call dispatch. */
  toolRegistry?: ToolRegistry;
  /** Build a custom registry (default: stdlib). Bypasses session resolvers. */
  registry?: NodeRegistry;
  /** Extra registrations layered on top of the default stdlib registry. */
  extraRegistrations?: (registry: NodeRegistry) => void;
}

export interface RunWorkflowResult {
  sessionDir: string;
  sessionId: string;
  outcome: RuntimeOutcome;
}

export async function runWorkflow(opts: RunWorkflowOptions): Promise<RunWorkflowResult> {
  const spec = WorkflowSpecSchema.parse(opts.spec);
  const sessionId = opts.sessionId ?? newSessionId();

  // Fresh session on disk. A resume path reuses an existing session.yaml.
  await createSession({
    sessionDir: opts.sessionDir,
    sessionId,
    root: {
      manifest_id: spec.manifest_id,
      input: spec.input,
      correlation: spec.correlation,
      ...(spec.attenuate ? { attenuate: spec.attenuate } : {}),
    },
    grantedRoot: spec.granted,
    ...(spec.title ? { title: spec.title } : {}),
  });

  // We need session state to wire resolvers even on first run — no
  // recorded answers yet, but the resolver shape is what nodes expect.
  const state = (await loadSession(opts.sessionDir))!;
  const { approval, askUser } = sessionResolvers(state);
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
    sessionId,
    registry,
    ...(opts.modelProvider ? { modelProvider: opts.modelProvider } : {}),
    ...(opts.toolRegistry ? { toolRegistry: opts.toolRegistry } : {}),
  });

  const outcome = await runtime.run(
    {
      manifest_id: spec.manifest_id,
      input: spec.input,
      correlation: spec.correlation,
      ...(spec.attenuate ? { attenuate: spec.attenuate } : {}),
    },
    spec.granted,
  );
  await recorder.flush();

  return { sessionDir: opts.sessionDir, sessionId, outcome };
}
