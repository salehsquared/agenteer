/**
 * Node primitive, NodeResult discriminated union, and the runtime handle
 * shape. Sub-plan 00 §3–§5 is the canonical design. Key invariants
 * enforced in M1:
 *
 *   I1. NodeResult is the only channel a node uses to express composition
 *       intent. No imperative `spawnChild` on the handle.
 *   I4. `execute` never mutates shared state; the runtime is the only
 *       writer.
 *   I5. Every completed `execute` produces exactly one primary evidence
 *       record (master plan §R2).
 */

import type { PermissionEnvelope } from "../permissions/envelope.js";
import type { ReadonlyContextSlice } from "../context/types.js";

export interface NodeManifest {
  readonly id: string;
  readonly version: string;
  readonly publisher: "agenteer" | "user" | "community";
  /** SHA-256 of the implementation. Optional in M1; M2 publishes will set it. */
  readonly sha256?: string;
  readonly description: string;
}

export interface Node<Input = unknown, Output = unknown> {
  readonly manifest: NodeManifest;

  /** Which context tags this node declares it will read. */
  readonly ctx: readonly string[];

  /** null = inherit parent's set. M2 kernel intersects at spawn. */
  readonly models_allowed: readonly string[] | null;
  readonly actions_allowed: readonly string[] | null;
  readonly new_node_states_allowed: readonly string[] | null;

  /** Pure-function flag. Enables cache-on-(manifest, input, ctx). */
  readonly deterministic: boolean;

  /** Concrete model, or null for deterministic/human nodes. */
  readonly model: string | null;

  /** User-authored entry point. */
  execute(input: Input, runtime: NodeRuntimeHandle): Promise<NodeResult<Output>>;

  preflight?(ctx: ReadonlyContextSlice): string | null;
  postflight?(result: NodeResult<Output>): void | Promise<void>;
  onCancel?(): void | Promise<void>;
}

/** A node factory — produced by `registerNode`. */
export type NodeFactory<I = unknown, O = unknown> = () => Node<I, O>;

/** Sub-plan 00 §4.1. */
export type NodeResult<Output = unknown> =
  | { kind: "output"; value: Output; ctx_patch?: CtxPatch; evidence?: EvidenceDelta }
  | { kind: "replace_me"; successor: NodeSpawn; reason: string; ctx_patch?: CtxPatch }
  | { kind: "spawn_children"; children: NodeSpawn[]; join: JoinMode; ctx_grants?: CtxGrant[] }
  | { kind: "needs_user"; prompt: string; schema?: unknown; resume_hint?: string }
  | { kind: "failed"; reason: string; retryable: boolean; evidence?: EvidenceDelta };

export interface NodeSpawn {
  manifest_id: string;
  input: unknown;
  grants?: Partial<{
    models_allowed: readonly string[];
    actions_allowed: readonly string[];
    new_node_states_allowed: readonly string[];
    ctx_keys: readonly string[];
  }>;
  correlation: string;
}

export type JoinMode =
  | { mode: "all" }
  | { mode: "any" }
  | { mode: "race_with_budget"; budget_ms: number; min_results: number }
  | { mode: "detached" };

/**
 * Authoring sugar over append-only item ops. Master plan §R3 translation:
 *   set(k, v)      → Decision item, labels.tag = k, refs.supersedes chain.
 *   delete(k)      → tombstone Decision item with supersedes link.
 *   append(k, [v]) → Artifact item with refs.extends link.
 *
 * The store is never mutated; the runtime compiles these to `store.add(...)`
 * calls in `runtime/patch.ts`.
 */
export interface CtxPatch {
  set?: Record<string, unknown>;
  delete?: readonly string[];
  append?: Record<string, unknown[]>;
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

/** Opaque to nodes; runtime-side debugging. */
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
  readonly envelope: PermissionEnvelope;

  log(payload: { level: "debug" | "info" | "warn"; message: string; data?: unknown }): void;

  /**
   * Model call surface. M1: throws "not implemented in M1" — LLM invocation
   * wiring is M2's provider layer. Kept on the handle so node authors
   * write against the final surface from day one.
   */
  callModel<T>(req: ModelCallRequest<T>): Promise<ModelCallResult<T>>;

  /**
   * Action dispatcher. M1: throws "not implemented in M1". Full capability
   * enforcement lives in M2 (permissions kernel) and M3 (trust/access).
   */
  callAction<T>(name: string, args: unknown): Promise<T>;
}

export interface ModelCallRequest<T = unknown> {
  readonly prompt: string;
  readonly system?: string;
  readonly schema?: unknown;
  readonly max_tokens?: number;
  readonly __result_type_marker?: T;
}

export interface ModelCallResult<T = unknown> {
  readonly value: T;
  readonly model: string;
  readonly tokens: { prompt: number; completion: number };
}

/** Input shape at spawn time. Sub-plan 00 §6.3: same-manifest re-entry. */
export interface NodeInput<T = unknown> {
  original: T;
  children?: ReadonlyArray<{
    correlation: string;
    manifest_id: string;
    result: NodeResult<unknown>;
  }>;
}
