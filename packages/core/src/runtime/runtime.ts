/**
 * Runtime loop. Dispatches nodes, interprets NodeResult, handles
 * ReplaceMe / SpawnChildren / NeedsUser, emits typed events, and enforces
 * global caps. M1 scope:
 *
 *   - One coherent tree execution per `run(rootSpawn, rootGrants)`.
 *   - In-memory context store (injected).
 *   - No caching, no resume, no LLM provider. callModel/callAction on the
 *     handle throw; those surfaces land in M2+.
 *   - Evidence is emitted via EvidenceSink; MemoryEvidenceSink suffices
 *     for M1 verification.
 *
 * Invariants (master plan, sub-plan 00):
 *   - Returned-intent composition (Q-1): no imperative spawn on the handle.
 *   - ReplaceMe inherits the retiring node's envelope, keeps correlation,
 *     same position in tree (sub-plan 00 §7).
 *   - Re-entry model A on SpawnChildren joins (sub-plan 00 §6.3).
 *   - applyPatch compiles CtxPatch → store.add per R3.
 *   - Evidence: one primary record per completed execute (R2).
 */

import type { ContextStore } from "../context/store.js";
import { sliceToReadonly } from "../context/slice.js";
import type { EvidenceInput, EvidenceSink } from "../evidence/sink.js";
import type { NodeRegistry } from "../node/registry.js";
import type {
  JoinMode,
  Node,
  NodeInput,
  NodeResult,
  NodeSpawn,
  NodeRuntimeHandle,
  NodeLineage,
  NodeManifest,
  EvidenceDelta,
  ModelCallRequest,
  ModelCallResult,
} from "../node/types.js";
import { RuntimeEvents, type NodeResultKind } from "../events/events.js";
import {
  type PermissionEnvelope,
  intersect as intersectEnv,
  isSpawnAllowed,
} from "../permissions/envelope.js";
import { applyPatch } from "./patch.js";
import { createChildAbort, createRootAbort, type AbortHandle } from "./abort.js";
import { newNodeRunId, newSessionId } from "../util/ids.js";

export interface RuntimeCaps {
  max_steps: number;
  max_wall_clock_ms: number;
  max_spawn_depth: number;
  max_replacement_chain: number;
  max_concurrent_children: number;
}

export const DEFAULT_CAPS: RuntimeCaps = {
  max_steps: 1000,
  max_wall_clock_ms: 30 * 60 * 1000,
  max_spawn_depth: 16,
  max_replacement_chain: 32,
  max_concurrent_children: 4,
};

export interface RuntimeOptions {
  sessionId?: string;
  registry: NodeRegistry;
  contextStore: ContextStore;
  evidenceSink: EvidenceSink;
  events?: RuntimeEvents;
  caps?: Partial<RuntimeCaps>;
  clock?: () => Date;
}

export type RootGrants = PermissionEnvelope;

export interface RuntimeOutcome {
  sessionId: string;
  finalStatus: "completed" | "failed" | "cancelled" | "exhausted" | "suspended";
  rootResult?: NodeResult;
  totalSteps: number;
  durationMs: number;
}

interface RunStats {
  steps: number;
}

/**
 * Frame metadata tracked per logical node position in the tree. The
 * position is stable across a replacement chain; `currentNodeId` and
 * `chainLength` track progression within it.
 */
interface Frame {
  readonly correlation: string;
  readonly depth: number;
  readonly parentNodeId?: string;
  readonly lineageId: string;
  replacement_history: Array<{ nodeId: string; manifest_id: string; reason: string }>;
  envelope: PermissionEnvelope;
  chainLength: number;
}

export class Runtime {
  readonly events: RuntimeEvents;
  readonly registry: NodeRegistry;
  readonly contextStore: ContextStore;

  private readonly evidenceSink: EvidenceSink;
  private readonly caps: RuntimeCaps;
  private readonly clock: () => Date;
  private readonly sessionId: string;

  constructor(opts: RuntimeOptions) {
    this.events = opts.events ?? new RuntimeEvents();
    this.registry = opts.registry;
    this.contextStore = opts.contextStore;
    this.evidenceSink = opts.evidenceSink;
    this.caps = { ...DEFAULT_CAPS, ...(opts.caps ?? {}) };
    this.clock = opts.clock ?? (() => new Date());
    this.sessionId = opts.sessionId ?? newSessionId();
  }

  async run(rootSpawn: NodeSpawn, rootGrants: RootGrants): Promise<RuntimeOutcome> {
    const start = Date.now();
    const rootAbort = createRootAbort();
    const stats: RunStats = { steps: 0 };
    this.events.emit("engine_start", {
      sessionId: this.sessionId,
      rootManifest: rootSpawn.manifest_id,
      timestamp: this.clock().toISOString(),
    });

    const rootFrame: Frame = {
      correlation: rootSpawn.correlation,
      depth: 0,
      lineageId: newNodeRunId(),
      replacement_history: [],
      envelope: rootGrants,
      chainLength: 0,
    };

    let status: RuntimeOutcome["finalStatus"] = "completed";
    let rootResult: NodeResult | undefined;
    try {
      rootResult = await this.runFrame(rootSpawn, rootFrame, rootAbort, stats);
      if (rootResult.kind === "failed") status = "failed";
      else if (rootResult.kind === "needs_user") status = "suspended";
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (message === "CAP_EXHAUSTED") {
        status = "exhausted";
      } else if (rootAbort.signal.aborted) {
        status = "cancelled";
      } else {
        status = "failed";
        this.events.emit("error", {
          error: message,
          fatal: true,
          timestamp: this.clock().toISOString(),
        });
      }
    } finally {
      const engineStatus: "completed" | "failed" | "cancelled" | "exhausted" =
        status === "suspended" ? "completed" : status;
      this.events.emit("engine_finish", {
        sessionId: this.sessionId,
        finalStatus: engineStatus,
        totalSteps: stats.steps,
        timestamp: this.clock().toISOString(),
      });
    }

    return {
      sessionId: this.sessionId,
      finalStatus: status,
      rootResult,
      totalSteps: stats.steps,
      durationMs: Date.now() - start,
    };
  }

  /**
   * Run one logical tree-position to a terminal result, consuming the
   * replacement chain internally. The returned NodeResult is what the
   * position reports upward (either Output, Failed, or NeedsUser).
   */
  private async runFrame(
    spawn: NodeSpawn,
    frame: Frame,
    abort: AbortHandle,
    stats: RunStats,
  ): Promise<NodeResult> {
    if (frame.depth > this.caps.max_spawn_depth) {
      return { kind: "failed", reason: "max_spawn_depth exceeded", retryable: false };
    }

    let currentSpawn = spawn;
    let currentInput: NodeInput<unknown> = { original: spawn.input };

    // Replacement chain loop. Exits on output / failed / needs_user, or by
    // re-entering through spawn_children (which drives recursion).
    while (true) {
      stats.steps += 1;
      if (stats.steps > this.caps.max_steps) throw new Error("CAP_EXHAUSTED");

      const node = this.registry.instantiate(currentSpawn.manifest_id);
      const nodeId = newNodeRunId();
      const envelope = frame.envelope; // replacement inherits the retiring node's envelope
      const ctxSlice = this.materializeSliceForNode(node, envelope);

      this.events.emit("ctx_read", {
        nodeId,
        keys: [...ctxSlice.keys()],
        materializedHash: ctxSlice.materialized_hash,
        timestamp: this.clock().toISOString(),
      });

      const handle = this.buildHandle({
        nodeId,
        correlation: frame.correlation,
        lineage: {
          nodeId,
          lineageId: frame.lineageId,
          correlation: frame.correlation,
          depth: frame.depth,
          parentNodeId: frame.parentNodeId,
          replacement_history: [...frame.replacement_history],
        },
        envelope,
        ctxSliceHandle: ctxSlice,
        signal: abort.signal,
      });

      this.events.emit("node_start", {
        nodeId,
        manifest: currentSpawn.manifest_id,
        correlation: frame.correlation,
        depth: frame.depth,
        timestamp: this.clock().toISOString(),
      });

      const startMs = Date.now();
      let result: NodeResult;
      try {
        const pre = node.preflight?.(ctxSlice);
        if (typeof pre === "string") {
          result = { kind: "failed", reason: `preflight: ${pre}`, retryable: false };
        } else {
          result = await node.execute(currentInput, handle);
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        result = { kind: "failed", reason: message, retryable: false };
      }
      const durationMs = Date.now() - startMs;

      await this.safePostflight(node, result);

      // Apply ctx_patch in the frame's scope BEFORE downstream dispatch.
      // Applies to output / replace_me (sub-plan 00 §4.3).
      this.applyPatchFromResult(result, {
        nodeId,
        nodeRunId: nodeId,
        manifestId: currentSpawn.manifest_id,
        parentNodeRunId: frame.parentNodeId,
        ctxSliceHash: ctxSlice.materialized_hash,
      });

      // Emit a primary evidence record for the completed execute (R2).
      // We skip emission for spawn_children (the parent will emit on its
      // re-entry) and for needs_user (separate lifecycle).
      const evidenceKinds: ReadonlyArray<NodeResult["kind"]> = [
        "output",
        "failed",
        "replace_me",
      ];
      if (evidenceKinds.includes(result.kind)) {
        await this.emitEvidence({
          nodeId,
          manifest_id: currentSpawn.manifest_id,
          lineage_id: frame.lineageId,
          correlation: frame.correlation,
          duration_ms: durationMs,
          delta: extractDelta(result),
          parent_node_run_id: frame.parentNodeId,
        });
      }

      this.events.emit("node_complete", {
        nodeId,
        manifest: currentSpawn.manifest_id,
        correlation: frame.correlation,
        kind: result.kind as NodeResultKind,
        durationMs,
        timestamp: this.clock().toISOString(),
      });

      switch (result.kind) {
        case "output":
          return result;

        case "failed":
          this.events.emit("node_failed", {
            nodeId,
            manifest: currentSpawn.manifest_id,
            reason: result.reason,
            retryable: result.retryable,
            timestamp: this.clock().toISOString(),
          });
          return result;

        case "needs_user":
          this.events.emit("needs_user", {
            nodeId,
            prompt: result.prompt,
            timestamp: this.clock().toISOString(),
          });
          return result;

        case "replace_me": {
          frame.chainLength += 1;
          if (frame.chainLength > this.caps.max_replacement_chain) {
            return {
              kind: "failed",
              reason: `max_replacement_chain (${this.caps.max_replacement_chain}) exceeded`,
              retryable: false,
            };
          }
          frame.replacement_history.push({
            nodeId,
            manifest_id: currentSpawn.manifest_id,
            reason: result.reason,
          });
          this.events.emit("replace", {
            nodeId,
            successorManifest: result.successor.manifest_id,
            reason: result.reason,
            chainLength: frame.chainLength,
            timestamp: this.clock().toISOString(),
          });
          currentSpawn = result.successor;
          currentInput = { original: result.successor.input };
          continue;
        }

        case "spawn_children": {
          const childrenResults = await this.runChildren({
            parentNodeId: nodeId,
            parentManifestId: currentSpawn.manifest_id,
            parentCorrelation: frame.correlation,
            parentEnvelope: envelope,
            parentDepth: frame.depth,
            parentLineageId: frame.lineageId,
            parentAbort: abort,
            stats,
            children: result.children,
            join: result.join,
          });

          // Detached: resolve as empty output, no re-entry (sub-plan 00 §6.4).
          if (result.join.mode === "detached") {
            return { kind: "output", value: undefined };
          }

          // Re-enter same manifest with augmented input (model A; Q-2).
          currentInput = {
            original: currentInput.original,
            children: childrenResults.map((c) => ({
              correlation: c.correlation,
              manifest_id: c.manifest_id,
              result: c.result,
            })),
          };
          continue;
        }
      }
    }
  }

  private async runChildren(args: {
    parentNodeId: string;
    parentManifestId: string;
    parentCorrelation: string;
    parentEnvelope: PermissionEnvelope;
    parentDepth: number;
    parentLineageId: string;
    parentAbort: AbortHandle;
    stats: RunStats;
    children: NodeSpawn[];
    join: JoinMode;
  }): Promise<Array<{ correlation: string; manifest_id: string; result: NodeResult }>> {
    this.events.emit("spawn", {
      parentNodeId: args.parentNodeId,
      childrenCount: args.children.length,
      joinMode: args.join.mode,
      correlations: args.children.map((c) => c.correlation),
      timestamp: this.clock().toISOString(),
    });

    // Validate each child spawn against parent's envelope.
    for (const spawn of args.children) {
      const ok = isSpawnAllowed(args.parentEnvelope, spawn.manifest_id);
      if (!ok.allowed) {
        this.events.emit("permission_denied", {
          nodeId: args.parentNodeId,
          attempted: { spawnManifest: spawn.manifest_id },
          reason: ok.reason ?? "spawn_not_allowed",
          timestamp: this.clock().toISOString(),
        });
      }
    }

    const launch = args.children.map((spawn) => {
      const childEnvelope = intersectEnv(args.parentEnvelope, spawn.grants ?? null);
      const childAbort = createChildAbort(args.parentAbort.signal);
      const frame: Frame = {
        correlation: spawn.correlation,
        depth: args.parentDepth + 1,
        parentNodeId: args.parentNodeId,
        lineageId: newNodeRunId(),
        replacement_history: [],
        envelope: childEnvelope,
        chainLength: 0,
      };
      return async () => {
        const result = await this.runFrame(spawn, frame, childAbort, args.stats);
        return { correlation: spawn.correlation, manifest_id: spawn.manifest_id, result, childAbort };
      };
    });

    // Bounded concurrency. "any"/"race_with_budget" short-circuit.
    return await this.joinChildren(launch, args.join);
  }

  private async joinChildren(
    launch: Array<() => Promise<{ correlation: string; manifest_id: string; result: NodeResult; childAbort: AbortHandle }>>,
    join: JoinMode,
  ): Promise<Array<{ correlation: string; manifest_id: string; result: NodeResult }>> {
    const limit = Math.max(1, this.caps.max_concurrent_children);
    const pending = launch.slice();
    const inFlight: Array<Promise<{
      correlation: string;
      manifest_id: string;
      result: NodeResult;
      childAbort: AbortHandle;
    }>> = [];
    const settled: Array<{ correlation: string; manifest_id: string; result: NodeResult; childAbort: AbortHandle }> = [];
    let completed = 0;

    const startNext = () => {
      while (inFlight.length < limit && pending.length) {
        const next = pending.shift()!;
        inFlight.push(next());
      }
    };

    startNext();

    // race_with_budget: fire a wall clock timer.
    let budgetTimer: NodeJS.Timeout | null = null;
    let budgetHit = false;
    if (join.mode === "race_with_budget") {
      budgetTimer = setTimeout(() => {
        budgetHit = true;
      }, join.budget_ms);
    }

    try {
      while (inFlight.length > 0) {
        const winner = await Promise.race(
          inFlight.map((p, idx) => p.then((r) => ({ r, idx }))),
        );
        // Remove the settled promise from inFlight.
        inFlight.splice(winner.idx, 1);
        settled.push(winner.r);
        completed += 1;

        if (join.mode === "any" && winner.r.result.kind === "output") {
          // Cancel the rest.
          for (const launcher of pending.splice(0)) void launcher; // drop
          // Signal abort on remaining in-flight via their abort handles.
          // Child aborts are captured in `winner.r`/settled entries; the
          // simple approach: we track abort via pending array — but
          // in-flight children had their aborts captured by the launcher
          // closures. For M1 we rely on the next await to observe aborts
          // via the child frame's own signals, which are parented to the
          // shared parent abort. We DON'T force-cancel siblings here
          // beyond letting them settle; the runtime's global cap catches
          // runaways. (M2 improves this via a sibling abort group.)
          break;
        }

        if (join.mode === "race_with_budget") {
          const enough = completed >= join.min_results;
          if (enough || budgetHit) {
            for (const _launcher of pending.splice(0)) void _launcher;
            break;
          }
        }

        startNext();
      }
    } finally {
      if (budgetTimer) clearTimeout(budgetTimer);
    }

    return settled.map(({ correlation, manifest_id, result }) => ({
      correlation,
      manifest_id,
      result,
    }));
  }

  private materializeSliceForNode(node: Node, envelope: PermissionEnvelope) {
    // M1 slice semantics: the node's declared `ctx` keys are intersected
    // with the envelope's `ctx_keys` (if non-empty); each key resolves to
    // the head of its supersede chain in the store. Tombstones excluded.
    const declared = node.ctx;
    const keys = envelope.ctx_keys.length === 0
      ? declared
      : declared.filter((k) => envelope.ctx_keys.includes(k));

    const items = [];
    for (const key of keys) {
      const head = this.contextStore.getHeadByTag(key);
      if (!head) continue;
      // Skip tombstones.
      if (head.content.kind === "decision" && head.content.choice === "tombstone") continue;
      items.push(head);
    }

    const spec = {
      name: "__node_slice__",
      selector: { tags: {} },
      stale_policy: "allow" as const,
      freeze: "snapshot" as const,
    };
    // Build a MaterializedSlice manually for determinism.
    const materialized = {
      spec,
      materialized_at: this.clock().toISOString(),
      materialized_hash: hashKeysAndHeads(keys, items),
      items: Object.freeze(items.map((i) => Object.freeze({ ...i }))),
      stale_ids: items.filter((i) => this.contextStore.isStale(i.id)).map((i) => i.id),
    };
    return sliceToReadonly(materialized);
  }

  private buildHandle(args: {
    nodeId: string;
    correlation: string;
    lineage: NodeLineage;
    envelope: PermissionEnvelope;
    ctxSliceHandle: ReturnType<typeof sliceToReadonly>;
    signal: AbortSignal;
  }): NodeRuntimeHandle {
    const events = this.events;
    const nodeId = args.nodeId;
    return {
      ctx: args.ctxSliceHandle,
      signal: args.signal,
      correlation: args.correlation,
      lineage: args.lineage,
      envelope: args.envelope,
      log(payload) {
        events.emit("error", {
          nodeId,
          error: `[${payload.level}] ${payload.message}`,
          fatal: false,
          timestamp: new Date().toISOString(),
        });
      },
      async callModel<T>(_req: ModelCallRequest<T>): Promise<ModelCallResult<T>> {
        throw new Error("callModel not implemented in M1 (provider layer ships in M2)");
      },
      async callAction<T>(_name: string, _args: unknown): Promise<T> {
        throw new Error("callAction not implemented in M1 (action dispatcher ships in M2)");
      },
    };
  }

  private applyPatchFromResult(
    result: NodeResult,
    ctx: {
      nodeId: string;
      nodeRunId: string;
      manifestId: string;
      parentNodeRunId?: string;
      ctxSliceHash: string;
    },
  ): void {
    const patch = result.kind === "output" || result.kind === "replace_me"
      ? result.ctx_patch
      : undefined;
    if (!patch) return;
    const outcome = applyPatch(this.contextStore, patch, {
      sourceNode: ctx.manifestId,
      sourceNodeRunId: ctx.nodeRunId,
      sourceInputHash: ctx.ctxSliceHash,
      ...(ctx.parentNodeRunId ? { parentNodeRunId: ctx.parentNodeRunId } : {}),
    });
    if (outcome.added.length === 0) return;
    this.events.emit("ctx_patched", {
      nodeId: ctx.nodeId,
      setKeys: outcome.setKeys,
      deletedKeys: outcome.deletedKeys,
      appendedKeys: outcome.appendedKeys,
      timestamp: this.clock().toISOString(),
    });
  }

  private async emitEvidence(partial: Omit<EvidenceInput, "timestamp" | "verdict" | "kind">): Promise<void> {
    const timestamp = this.clock().toISOString();
    const verdict = partial.delta?.verdict ?? "inconclusive";
    const record: EvidenceInput = {
      ...partial,
      timestamp,
      verdict,
      kind: "generic",
    };
    const { id } = await this.evidenceSink.emit(record);
    this.events.emit("evidence_emitted", {
      evidenceId: id,
      nodeId: record.nodeId,
      verdict,
      timestamp,
    });
  }

  private async safePostflight(node: Node, result: NodeResult): Promise<void> {
    if (!node.postflight) return;
    try {
      await node.postflight(result);
    } catch {
      // postflight errors are non-fatal per sub-plan 00 §3.2.
    }
  }
}

function extractDelta(result: NodeResult): EvidenceDelta | undefined {
  if (result.kind === "output") return result.evidence;
  if (result.kind === "failed") {
    return result.evidence ?? { verdict: "fail" };
  }
  if (result.kind === "replace_me") return { verdict: "inconclusive" };
  return undefined;
}

function hashKeysAndHeads(keys: readonly string[], items: ReadonlyArray<{ id: string }>): string {
  const payload = keys.map((k, i) => `${k}:${items[i]?.id ?? ""}`).join("|");
  // Stable short hash — not a security hash, just an identity.
  let h = 0;
  for (let i = 0; i < payload.length; i += 1) {
    h = (h * 31 + payload.charCodeAt(i)) | 0;
  }
  return `sl_${(h >>> 0).toString(16).padStart(8, "0")}`;
}

/** Provide NodeManifest-typed default for tests / bootstrap. */
export function makeManifest(
  id: string,
  description: string,
  overrides: Partial<NodeManifest> = {},
): NodeManifest {
  return {
    id,
    version: "0.0.1",
    publisher: "agenteer",
    description,
    ...overrides,
  };
}
