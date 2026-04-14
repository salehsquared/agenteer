/**
 * Node primitive (sub-plan 00 §3–§5, post-M2).
 *
 * M2 changes from M1:
 *   - NodeManifest is the Zod-validated manifest from sub-plan 02.
 *   - Capability envelope replaces the ad-hoc `models_allowed` /
 *     `actions_allowed` / `new_node_states_allowed` fields.
 *   - Authorization is the kernel's job (permissions/kernel.ts) and runs
 *     on every spawn; empty-allowlist-allows is gone.
 *   - Per-node Zod I/O schemas land on the Node instance (manifest carries
 *     JSON Schema for publish; M2 ships Zod directly).
 */

import type { z } from "zod";
import type { CapabilitySet } from "../permissions/index.js";
import type { NodeManifest } from "../manifest/index.js";
import type { ReadonlyContextSlice } from "../context/types.js";

export type { NodeManifest };

export interface Node<Input = unknown, Output = unknown> {
  readonly manifest: NodeManifest;

  /**
   * Zod schemas for in-process validation. Optional; absence means "trust
   * caller" (for test doubles). Publishers ship JSON Schema in the
   * manifest; the runtime prefers Zod when present for precise errors.
   */
  readonly inputSchema?: z.ZodType<Input>;
  readonly outputSchema?: z.ZodType<Output>;

  /** Declared ctx variants this node reads (namespace labels). */
  readonly ctx: readonly string[];

  /**
   * Null for deterministic/human nodes; a concrete model id otherwise.
   * The runtime enforces the matching `model:<id>` capability via the
   * action dispatcher when the node calls `handle.callModel`.
   */
  readonly model: string | null;

  /** User-authored entry point. */
  execute(input: NodeInput<Input>, runtime: NodeRuntimeHandle): Promise<NodeResult<Output>>;

  preflight?(ctx: ReadonlyContextSlice): string | null;
  postflight?(result: NodeResult<Output>): void | Promise<void>;
  onCancel?(): void | Promise<void>;
}

export type NodeFactory<I = unknown, O = unknown> = () => Node<I, O>;

export type NodeResult<Output = unknown> =
  | { kind: "output"; value: Output; ctx_patch?: CtxPatch; evidence?: EvidenceDelta }
  | { kind: "replace_me"; successor: NodeSpawn; reason: string; ctx_patch?: CtxPatch }
  | { kind: "spawn_children"; children: NodeSpawn[]; join: JoinMode; ctx_grants?: CtxGrant[] }
  | { kind: "needs_user"; prompt: string; schema?: unknown; resume_hint?: string }
  | { kind: "failed"; reason: string; retryable: boolean; evidence?: EvidenceDelta; details?: unknown };

export interface NodeSpawn {
  manifest_id: string;
  input: unknown;
  /**
   * Explicit capability attenuation — master plan pillar 3, sub-plan 02
   * §1.4. Must be a subset of the parent's effective caps. Absent →
   * inherit parent's full effective set (intersected with child's
   * manifest `required_actions` at the kernel).
   */
  attenuate?: readonly string[];
  correlation: string;
}

export type JoinMode =
  | { mode: "all" }
  | { mode: "any" }
  | { mode: "race_with_budget"; budget_ms: number; min_results: number }
  | { mode: "detached" };

/**
 * Authoring sugar over append-only item ops. Master plan §R3 translation:
 *   set(k, v)      → Decision item by default, or Artifact when value is
 *                    wrapped with `asArtifact(...)`; supersedes chain.
 *   delete(k)      → tombstone Decision item with supersedes link.
 *   append(k, [v]) → Artifact item with refs.extends link.
 *
 * The store is never mutated; the runtime compiles these to `store.add(...)`
 * calls in `runtime/patch.ts`.
 *
 * R3-A (M4): stdlib meta-nodes need Artifact-variant `set` so judge /
 * planner verdicts land as Artifacts (not Decisions). Raw values stay
 * Decision; `asArtifact()` marks a value as an Artifact at compile time.
 */
export interface CtxPatch {
  set?: Record<string, unknown>;
  delete?: readonly string[];
  append?: Record<string, unknown[]>;
}

/**
 * Marker produced by `asArtifact()`. The patch compiler recognizes it via
 * the reserved key `__ctx_variant` and emits an Artifact item instead of
 * the default Decision. Reserved-key marker (vs. separate ops per R3-A
 * option B) keeps the `set`/`delete`/`append` surface flat.
 */
export interface CtxArtifactMarker {
  readonly __ctx_variant: "artifact";
  readonly body: unknown;
  readonly media_type?: string;
  readonly schema_ref?: string;
}

export function asArtifact(
  body: unknown,
  opts: { media_type?: string; schema_ref?: string } = {},
): CtxArtifactMarker {
  return Object.freeze({
    __ctx_variant: "artifact" as const,
    body,
    ...(opts.media_type !== undefined ? { media_type: opts.media_type } : {}),
    ...(opts.schema_ref !== undefined ? { schema_ref: opts.schema_ref } : {}),
  });
}

export function isArtifactMarker(value: unknown): value is CtxArtifactMarker {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as { __ctx_variant?: unknown }).__ctx_variant === "artifact"
  );
}

export interface CtxGrant {
  keys: readonly string[];
  transform?: "identity" | "redact_secrets" | { fn_id: string };
}

export interface EvidenceDelta {
  verdict: "pass" | "fail" | "inconclusive";
  claims?: readonly string[];
  tool_output?: { command?: string; exit_code?: number; stdout_tail?: string };
}

export interface NodeLineage {
  readonly nodeId: string;
  readonly lineageId: string;
  readonly correlation: string;
  readonly depth: number;
  readonly parentNodeId?: string;
  readonly replacement_history: ReadonlyArray<{ nodeId: string; manifest_id: string; reason: string }>;
}

export interface NodeRuntimeHandle {
  readonly ctx: ReadonlyContextSlice;
  readonly signal: AbortSignal;
  readonly correlation: string;
  readonly lineage: NodeLineage;
  /** Capabilities granted to THIS node (sub-plan 02 §1.3 "granted"). */
  readonly granted: CapabilitySet;

  log(payload: { level: "debug" | "info" | "warn"; message: string; data?: unknown }): void;

  callModel<T>(req: ModelCallRequest<T>): Promise<ModelCallResult<T>>;
  callAction<T>(name: string, args: unknown): Promise<T>;
}

export interface ModelCallRequest<T = unknown> {
  readonly model_id: string;
  readonly prompt: string;
  readonly system?: string;
  readonly schema?: z.ZodType<T>;
  readonly temperature?: number;
  readonly max_tokens?: number;
}

export interface ModelCallResult<T = unknown> {
  readonly value: T;
  readonly model: string;
  readonly tokens: { prompt: number; completion: number };
  readonly method: "native" | "text_parse" | "mock";
}

/**
 * Execute's input envelope. First call: `{ original, children: undefined }`.
 * Re-entry after SpawnChildren join: `{ original, children: [...] }`.
 * Re-entry after ReplaceMe: `{ original: successor.input }`.
 */
export interface NodeInput<T = unknown> {
  original: T;
  children?: ReadonlyArray<{
    correlation: string;
    manifest_id: string;
    result: NodeResult<unknown>;
  }>;
}
