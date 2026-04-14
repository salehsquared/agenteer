/**
 * Typed event emitter for the runtime. Pattern and semantics borrowed
 * from OpenEngine `src/orchestrator/events.ts`:
 *   - Sync `emit`.
 *   - Listeners wrapped in try/catch; a throwing listener never prevents
 *     other listeners from running.
 *   - Fire-and-forget; no back-pressure.
 *
 * `NodeResult["kind"]` is mirrored here as a string literal union so this
 * module doesn't import from `../node/types` (keeps event typing cheap).
 */

import type { JoinMode } from "../node/types.js";

export type NodeResultKind = "output" | "replace_me" | "spawn_children" | "needs_user" | "failed";

export interface RuntimeEventMap {
  engine_start: { sessionId: string; rootManifest: string; timestamp: string };
  engine_finish: {
    sessionId: string;
    finalStatus: "completed" | "failed" | "cancelled" | "exhausted";
    totalSteps: number;
    timestamp: string;
  };

  node_start: {
    nodeId: string;
    manifest: string;
    correlation: string;
    depth: number;
    timestamp: string;
  };
  node_complete: {
    nodeId: string;
    manifest: string;
    correlation: string;
    kind: NodeResultKind;
    durationMs: number;
    timestamp: string;
  };
  node_cancelled: {
    nodeId: string;
    manifest: string;
    reason: "parent_abort" | "timeout" | "cap" | "any_winner";
    timestamp: string;
  };
  node_failed: {
    nodeId: string;
    manifest: string;
    reason: string;
    retryable: boolean;
    timestamp: string;
  };

  spawn: {
    parentNodeId: string;
    childrenCount: number;
    joinMode: JoinMode["mode"];
    correlations: string[];
    timestamp: string;
  };
  replace: {
    nodeId: string;
    successorManifest: string;
    reason: string;
    chainLength: number;
    timestamp: string;
  };
  needs_user: {
    nodeId: string;
    manifest: string;
    prompt: string;
    resume_hint: string;
    timestamp: string;
  };

  ctx_read: { nodeId: string; keys: string[]; materializedHash: string; timestamp: string };
  ctx_patched: {
    nodeId: string;
    setKeys: string[];
    deletedKeys: string[];
    appendedKeys: string[];
    timestamp: string;
  };
  permission_denied: {
    nodeId: string;
    attempted: { action?: string; model?: string; spawnManifest?: string };
    reason: string;
    timestamp: string;
  };
  /**
   * C1: child declared ctx keys outside the parent's slice-view bound
   * (parent.ctx ∪ ctx_grants.keys). Keys outside the bound are dropped
   * from the child's materialized slice. Master plan §Pillar 3 invariant.
   */
  ctx_scope_restricted: {
    nodeId: string;
    requested: readonly string[];
    allowed: readonly string[];
    restricted: readonly string[];
    timestamp: string;
  };

  cache_hit: { nodeId: string; manifest: string; keyHash: string; timestamp: string };
  cache_miss: { nodeId: string; manifest: string; keyHash: string; timestamp: string };

  evidence_emitted: {
    evidenceId: string;
    nodeId: string;
    verdict: "pass" | "fail" | "inconclusive";
    timestamp: string;
  };

  error: { nodeId?: string; error: string; fatal: boolean; timestamp: string };
}

export type RuntimeEventName = keyof RuntimeEventMap;
type Listener<K extends RuntimeEventName> = (payload: RuntimeEventMap[K]) => void;

export class RuntimeEvents {
  private listeners: Partial<{ [K in RuntimeEventName]: Array<Listener<K>> }> = {};

  on<K extends RuntimeEventName>(event: K, listener: Listener<K>): this {
    const list = (this.listeners[event] ??= []) as Array<Listener<K>>;
    list.push(listener);
    return this;
  }

  off<K extends RuntimeEventName>(event: K, listener: Listener<K>): this {
    const list = this.listeners[event] as Array<Listener<K>> | undefined;
    if (!list) return this;
    const i = list.indexOf(listener);
    if (i >= 0) list.splice(i, 1);
    return this;
  }

  once<K extends RuntimeEventName>(event: K, listener: Listener<K>): this {
    const wrap: Listener<K> = (payload) => {
      this.off(event, wrap);
      listener(payload);
    };
    return this.on(event, wrap);
  }

  emit<K extends RuntimeEventName>(event: K, payload: RuntimeEventMap[K]): void {
    const list = this.listeners[event] as Array<Listener<K>> | undefined;
    if (!list) return;
    for (const l of [...list]) {
      try {
        l(payload);
      } catch (err) {
        // OpenEngine precedent: log + continue. No console.error in tests
        // by default; swallow. A tee adapter is the right place to
        // surface listener exceptions.
      }
    }
  }

  removeAll(event?: RuntimeEventName): void {
    if (event) {
      delete this.listeners[event];
    } else {
      this.listeners = {};
    }
  }

  listenerCount(event: RuntimeEventName): number {
    return this.listeners[event]?.length ?? 0;
  }
}
