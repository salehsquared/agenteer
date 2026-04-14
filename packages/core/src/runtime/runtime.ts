/**
 * Runtime loop (post-M2).
 *
 * Responsibilities:
 *   - Dispatch nodes, interpret NodeResult, handle ReplaceMe / SpawnChildren / NeedsUser.
 *   - Validate I/O against Zod schemas (sub-plan 02 §2.4) before execute and after.
 *   - Authorize every spawn via the kernel (sub-plan 02 §1.3, §1.5 Layer A).
 *   - Expose `callModel` / `callAction` through a permission-checked dispatcher.
 *   - Emit typed events and one primary evidence record per completed execute (R2).
 *   - Compile CtxPatch → store.add per master plan §R3.
 *
 * M1 behavior removed:
 *   - The naive PermissionEnvelope + "empty-allowlist allows everything" is gone.
 *     Strict-deny is on: every child spawn requires capabilities the parent holds.
 */

import { ZodError } from "zod";
import {
  collectFromNodeRun,
  type CollectFromNodeRunInput,
  type EvidenceStore,
  type EvidenceRecord,
} from "@agenteer/trust/evidence";
import {
  diffSnapshots,
  snapshot as fsSnapshot,
  type AccessViolation,
  type ResourceSnapshot,
} from "@agenteer/trust/access";
import { validateManifest, type NodeManifest, type NodeManifestInput } from "../manifest/index.js";
import type { ContextStore } from "../context/store.js";
import { sliceToReadonly } from "../context/slice.js";
import type { NodeRegistry } from "../node/registry.js";
import type {
  JoinMode,
  Node,
  NodeInput,
  NodeResult,
  NodeSpawn,
  NodeRuntimeHandle,
  NodeLineage,
  EvidenceDelta,
  ModelCallRequest,
  ModelCallResult,
} from "../node/types.js";
import { RuntimeEvents, type NodeResultKind } from "../events/events.js";
import {
  type CapabilitySet,
  capabilitySet,
  authorizeSpawn,
  type AuthorizeSpawnDeny,
  rawsOf,
  augmentRequired,
} from "../permissions/index.js";
import { applyPatch } from "./patch.js";
import { createChildAbort, createRootAbort, type AbortHandle } from "./abort.js";
import { newNodeRunId, newSessionId } from "../util/ids.js";
import {
  type ActionRegistry,
  type DispatchContext,
  type ToolRegistry,
  DispatchError,
  StdActionRegistry,
} from "./dispatch.js";
import type { ModelProvider } from "./providers.js";

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
  /** @agenteer/trust evidence store (YamlEvidenceStore in production, MemoryEvidenceSink in tests). */
  evidenceSink: EvidenceStore;
  events?: RuntimeEvents;
  caps?: Partial<RuntimeCaps>;
  clock?: () => Date;
  modelProvider?: ModelProvider;
  toolRegistry?: ToolRegistry;
  actionRegistry?: ActionRegistry;
  /**
   * Root for the §R1 access-guard snapshot. Defaults to process.cwd().
   * Only nodes whose manifest declares `side_effects.writes_fs: true` or
   * `shell.exec` required_actions trigger snapshotting.
   */
  accessSnapshotRoot?: string;
  /** Policy when an access violation is detected. Defaults to "fail". */
  accessViolationPolicy?: "fail" | "warn" | "off";
}

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

interface Frame {
  readonly correlation: string;
  readonly depth: number;
  readonly parentNodeId?: string;
  readonly lineageId: string;
  replacement_history: Array<{ nodeId: string; manifest_id: string; reason: string }>;
  granted: CapabilitySet;
  chainLength: number;
  /**
   * Context-capability delegation bound (master plan §Pillar 3 invariant:
   * "a parent's slice-view bounds the child's selector scope"). Undefined
   * at root (unrestricted). Set by `runChildren` to
   *   parent.ctx ∪ ctx_grants.keys
   * Children can declare more keys, but what they actually see is the
   * intersection with this set — delegation mirrors the permission model.
   */
  ctxScope?: ReadonlySet<string>;
}

export class Runtime {
  readonly events: RuntimeEvents;
  readonly registry: NodeRegistry;
  readonly contextStore: ContextStore;
  readonly actions: ActionRegistry;
  readonly evidenceStore: EvidenceStore;

  private readonly caps: RuntimeCaps;
  private readonly clock: () => Date;
  private readonly sessionId: string;
  private readonly accessSnapshotRoot: string;
  private readonly accessViolationPolicy: "fail" | "warn" | "off";

  constructor(opts: RuntimeOptions) {
    this.events = opts.events ?? new RuntimeEvents();
    this.registry = opts.registry;
    this.contextStore = opts.contextStore;
    this.evidenceStore = opts.evidenceSink;
    this.caps = { ...DEFAULT_CAPS, ...(opts.caps ?? {}) };
    this.clock = opts.clock ?? (() => new Date());
    this.sessionId = opts.sessionId ?? newSessionId();
    this.actions =
      opts.actionRegistry ??
      new StdActionRegistry({
        ...(opts.modelProvider ? { modelProvider: opts.modelProvider } : {}),
        ...(opts.toolRegistry ? { toolRegistry: opts.toolRegistry } : {}),
      });
    this.accessSnapshotRoot = opts.accessSnapshotRoot ?? process.cwd();
    this.accessViolationPolicy = opts.accessViolationPolicy ?? "fail";
  }

  /**
   * Run a root spawn to completion.
   * `rootGrants` is the workflow-root capability set (the "actor as workflow" from
   * sub-plan 02 §1.5). Every descendant can only attenuate downward.
   */
  async run(
    rootSpawn: NodeSpawn,
    rootGrants: CapabilitySet | readonly string[],
  ): Promise<RuntimeOutcome> {
    const start = Date.now();
    const rootAbort = createRootAbort();
    const stats: RunStats = { steps: 0 };
    const grants = capabilitySet(rootGrants);

    this.events.emit("engine_start", {
      sessionId: this.sessionId,
      rootManifest: rootSpawn.manifest_id,
      timestamp: this.clock().toISOString(),
    });

    // Root frame: we authorize the root spawn against itself so the
    // "granted" set is what the root's own manifest required. The root
    // IS the workflow; its "parent effective" is `rootGrants`. Dynamic
    // actions (§R4) are augmented from rootSpawn.input before auth.
    const rootEntry = this.registry.lookup(rootSpawn.manifest_id);
    const rootRequired = buildEffectiveRequired(rootEntry.manifest, rootSpawn.input);
    const rootAuth = authorizeSpawn({
      parentEffective: grants,
      childManifestRequired: rootRequired,
      parentAttenuation: rootSpawn.attenuate ? capabilitySet(rootSpawn.attenuate) : undefined,
      childManifestId: rootSpawn.manifest_id,
      parentNodeId: "<root>",
    });

    let status: RuntimeOutcome["finalStatus"] = "completed";
    let rootResult: NodeResult | undefined;

    if (!rootAuth.ok) {
      this.emitPermissionDenied("<root>", rootAuth);
      rootResult = {
        kind: "failed",
        reason: `root_spawn_denied:${rootAuth.reason}`,
        retryable: false,
        details: { missing: rootAuth.missing.map((c) => c.raw) },
      };
      status = "failed";
    } else {
      const rootFrame: Frame = {
        correlation: rootSpawn.correlation,
        depth: 0,
        lineageId: newNodeRunId(),
        replacement_history: [],
        granted: rootAuth.granted,
        chainLength: 0,
      };
      try {
        rootResult = await this.runFrame(rootSpawn, rootFrame, rootAbort, stats);
        if (rootResult.kind === "failed") status = "failed";
        else if (rootResult.kind === "needs_user") status = "suspended";
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        if (message === "CAP_EXHAUSTED") status = "exhausted";
        else if (rootAbort.signal.aborted) status = "cancelled";
        else {
          status = "failed";
          this.events.emit("error", {
            error: message,
            fatal: true,
            timestamp: this.clock().toISOString(),
          });
        }
      }
    }

    const engineStatus: "completed" | "failed" | "cancelled" | "exhausted" =
      status === "suspended" ? "completed" : status;
    this.events.emit("engine_finish", {
      sessionId: this.sessionId,
      finalStatus: engineStatus,
      totalSteps: stats.steps,
      timestamp: this.clock().toISOString(),
    });

    return {
      sessionId: this.sessionId,
      finalStatus: status,
      rootResult,
      totalSteps: stats.steps,
      durationMs: Date.now() - start,
    };
  }

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

    while (true) {
      stats.steps += 1;
      if (stats.steps > this.caps.max_steps) throw new Error("CAP_EXHAUSTED");

      const entry = this.registry.lookup(currentSpawn.manifest_id);
      const node = entry.instantiate();
      const nodeId = newNodeRunId();
      const granted = frame.granted;
      const ctxSlice = this.materializeSliceForNode(node, frame.ctxScope, nodeId);

      // Input schema validation — sub-plan 02 §2.4.
      const inputValidation = validateInput(node, currentInput);
      if (!inputValidation.ok) {
        const result: NodeResult = {
          kind: "failed",
          reason: "input_schema_violation",
          retryable: false,
          details: inputValidation.issues,
        };
        this.events.emit("node_start", this.startPayload(nodeId, currentSpawn.manifest_id, frame));
        this.events.emit("node_complete", this.completePayload(nodeId, currentSpawn.manifest_id, frame, "failed", 0));
        this.events.emit("node_failed", {
          nodeId,
          manifest: currentSpawn.manifest_id,
          reason: result.reason,
          retryable: result.retryable,
          timestamp: this.clock().toISOString(),
        });
        await this.emitPrimaryEvidence({
          nodeId,
          manifestId: currentSpawn.manifest_id,
          lineageId: frame.lineageId,
          manifest: entry.manifest,
          correlation: frame.correlation,
          parentNodeRunId: frame.parentNodeId,
          durationMs: 0,
          result,
          kindHint: inferEvidenceKind(entry.manifest),
        });
        return result;
      }

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
        granted,
        ctxSliceHandle: ctxSlice,
        signal: abort.signal,
      });

      this.events.emit("node_start", this.startPayload(nodeId, currentSpawn.manifest_id, frame));

      // Access guard (§R1): pre-snapshot for fs.write-capable / shell.exec
      // nodes. Other nodes pay nothing.
      const accessScope = deriveAccessScope(entry.manifest, rawsOf(granted));
      const beforeSnapshot: ResourceSnapshot | null = accessScope
        ? await fsSnapshot(
            { include: accessScope.include, exclude: [".agenteer-session/**"] },
            this.accessSnapshotRoot,
          )
        : null;

      const startMs = Date.now();
      let result: NodeResult;
      try {
        const pre = node.preflight?.(ctxSlice);
        if (typeof pre === "string") {
          result = { kind: "failed", reason: `preflight: ${pre}`, retryable: false };
        } else {
          result = await node.execute(currentInput as NodeInput<unknown>, handle);
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        result = { kind: "failed", reason: message, retryable: false };
      }
      const durationMs = Date.now() - startMs;

      // Output schema validation — sub-plan 02 §2.4.
      if (result.kind === "output") {
        const outCheck = validateOutput(node, result.value);
        if (!outCheck.ok) {
          result = {
            kind: "failed",
            reason: "output_schema_violation",
            retryable: false,
            details: outCheck.issues,
          };
        }
      }

      await this.safePostflight(node, result);

      this.applyPatchFromResult(result, {
        nodeId,
        nodeRunId: nodeId,
        manifestId: currentSpawn.manifest_id,
        parentNodeRunId: frame.parentNodeId,
        ctxSliceHash: ctxSlice.materialized_hash,
      });

      const evidenceKinds: ReadonlyArray<NodeResult["kind"]> = [
        "output",
        "failed",
        "replace_me",
      ];
      const primaryKind = inferEvidenceKind(entry.manifest);
      let primaryRecord: EvidenceRecord | null = null;
      if (evidenceKinds.includes(result.kind)) {
        primaryRecord = await this.emitPrimaryEvidence({
          nodeId,
          manifestId: currentSpawn.manifest_id,
          lineageId: frame.lineageId,
          manifest: entry.manifest,
          correlation: frame.correlation,
          parentNodeRunId: frame.parentNodeId,
          durationMs,
          result,
          kindHint: primaryKind,
        });
      }

      // Post-snapshot + access_scan auxiliary evidence (§R1 + §R2).
      if (beforeSnapshot && accessScope) {
        const afterSnapshot = await fsSnapshot(
          { include: accessScope.include, exclude: [".agenteer-session/**"] },
          this.accessSnapshotRoot,
        );
        const violations = diffSnapshots(
          beforeSnapshot,
          afterSnapshot,
          accessScope.allowedWrites,
          accessScope.allowedDeletes,
          currentSpawn.manifest_id,
        );
        const writes = Array.from(afterSnapshot.files.keys()).filter(
          (p) => beforeSnapshot.files.get(p)?.sha256 !== afterSnapshot.files.get(p)?.sha256,
        );
        const reads = accessScope.allowedReads.length > 0
          ? Array.from(afterSnapshot.files.keys())
          : [];
        await this.emitAccessScanEvidence({
          nodeId,
          manifestId: currentSpawn.manifest_id,
          lineageId: frame.lineageId,
          parentNodeRunId: primaryRecord?.run.node_run_id ?? frame.parentNodeId,
          scope: accessScope,
          violations,
          writes,
          reads,
        });
        if (violations.length > 0 && this.accessViolationPolicy === "fail") {
          result = {
            kind: "failed",
            reason: `access_violation:${violations[0]!.type}`,
            retryable: false,
            details: { violations },
          };
        } else if (violations.length > 0 && this.accessViolationPolicy === "warn") {
          this.events.emit("error", {
            nodeId,
            error: `access_violations: ${violations.length}`,
            fatal: false,
            timestamp: this.clock().toISOString(),
          });
        }
      }

      this.events.emit(
        "node_complete",
        this.completePayload(nodeId, currentSpawn.manifest_id, frame, result.kind as NodeResultKind, durationMs),
      );

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
            manifest: currentSpawn.manifest_id,
            prompt: result.prompt,
            resume_hint: result.resume_hint ?? nodeId,
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
          // ReplaceMe inherits the retiring node's envelope — but the successor's
          // manifest's `required_actions` may be narrower. Re-authorize to
          // recompute the granted set. Dynamic actions (§R4) are augmented
          // from the successor's input.
          const successorEntry = this.registry.lookup(result.successor.manifest_id);
          const successorAuth = authorizeSpawn({
            parentEffective: frame.granted, // successor may not escalate
            childManifestRequired: buildEffectiveRequired(
              successorEntry.manifest,
              result.successor.input,
            ),
            parentAttenuation: result.successor.attenuate
              ? capabilitySet(result.successor.attenuate)
              : frame.granted,
            childManifestId: result.successor.manifest_id,
            parentNodeId: nodeId,
          });
          if (!successorAuth.ok) {
            this.emitPermissionDenied(nodeId, successorAuth);
            return {
              kind: "failed",
              reason: `replace_me_denied:${successorAuth.reason}`,
              retryable: false,
              details: { missing: successorAuth.missing.map((c) => c.raw) },
            };
          }
          frame.granted = successorAuth.granted;
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
          // C1: compute the child ctxScope as parent.ctx ∪ ctx_grants.keys.
          const scopeKeys = new Set<string>(node.ctx);
          for (const g of result.ctx_grants ?? []) {
            for (const k of g.keys) scopeKeys.add(k);
          }
          const childrenResults = await this.runChildren({
            parentNodeId: nodeId,
            parentManifestId: currentSpawn.manifest_id,
            parentGranted: frame.granted,
            parentDepth: frame.depth,
            parentLineageId: frame.lineageId,
            parentAbort: abort,
            stats,
            children: result.children,
            join: result.join,
            parentCtxScope: scopeKeys,
          });

          if (result.join.mode === "detached") {
            return { kind: "output", value: undefined };
          }

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
    parentGranted: CapabilitySet;
    parentDepth: number;
    parentLineageId: string;
    parentAbort: AbortHandle;
    stats: RunStats;
    children: NodeSpawn[];
    join: JoinMode;
    /** C1: parent ctx ∪ ctx_grants.keys — the delegation bound. */
    parentCtxScope: ReadonlySet<string>;
  }): Promise<Array<{ correlation: string; manifest_id: string; result: NodeResult }>> {
    this.events.emit("spawn", {
      parentNodeId: args.parentNodeId,
      childrenCount: args.children.length,
      joinMode: args.join.mode,
      correlations: args.children.map((c) => c.correlation),
      timestamp: this.clock().toISOString(),
    });

    // Authorize each child against parent's effective + child manifest's
    // required_actions. Denials are materialized as Failed results so the
    // parent sees them on re-entry instead of the whole runtime aborting.
    const launch: Array<() => Promise<{ correlation: string; manifest_id: string; result: NodeResult }>> = [];
    for (const spawn of args.children) {
      const entry = (() => {
        try {
          return this.registry.lookup(spawn.manifest_id);
        } catch {
          return null;
        }
      })();
      if (!entry) {
        launch.push(async () => ({
          correlation: spawn.correlation,
          manifest_id: spawn.manifest_id,
          result: {
            kind: "failed" as const,
            reason: "manifest_not_found",
            retryable: false,
            details: { manifest_id: spawn.manifest_id },
          },
        }));
        continue;
      }
      const auth = authorizeSpawn({
        parentEffective: args.parentGranted,
        childManifestRequired: buildEffectiveRequired(entry.manifest, spawn.input),
        parentAttenuation: spawn.attenuate ? capabilitySet(spawn.attenuate) : undefined,
        childManifestId: spawn.manifest_id,
        parentNodeId: args.parentNodeId,
      });
      if (!auth.ok) {
        this.emitPermissionDenied(args.parentNodeId, auth, spawn.manifest_id);
        launch.push(async () => ({
          correlation: spawn.correlation,
          manifest_id: spawn.manifest_id,
          result: {
            kind: "failed" as const,
            reason: `permission_denied:${auth.reason}`,
            retryable: false,
            details: { missing: auth.missing.map((c) => c.raw) },
          },
        }));
        continue;
      }
      const childAbort = createChildAbort(args.parentAbort.signal);
      const frame: Frame = {
        correlation: spawn.correlation,
        depth: args.parentDepth + 1,
        parentNodeId: args.parentNodeId,
        lineageId: newNodeRunId(),
        replacement_history: [],
        granted: auth.granted,
        chainLength: 0,
        ctxScope: args.parentCtxScope,
      };
      launch.push(async () => {
        const r = await this.runFrame(spawn, frame, childAbort, args.stats);
        return { correlation: spawn.correlation, manifest_id: spawn.manifest_id, result: r };
      });
    }

    return this.joinChildren(launch, args.join);
  }

  private async joinChildren(
    launch: Array<() => Promise<{ correlation: string; manifest_id: string; result: NodeResult }>>,
    join: JoinMode,
  ): Promise<Array<{ correlation: string; manifest_id: string; result: NodeResult }>> {
    const limit = Math.max(1, this.caps.max_concurrent_children);
    const pending = launch.slice();
    const inFlight: Array<Promise<{ correlation: string; manifest_id: string; result: NodeResult }>> = [];
    const settled: Array<{ correlation: string; manifest_id: string; result: NodeResult }> = [];
    let completed = 0;

    const startNext = () => {
      while (inFlight.length < limit && pending.length) {
        const next = pending.shift()!;
        inFlight.push(next());
      }
    };
    startNext();

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
        inFlight.splice(winner.idx, 1);
        settled.push(winner.r);
        completed += 1;

        if (join.mode === "any" && winner.r.result.kind === "output") {
          pending.splice(0);
          break;
        }
        if (join.mode === "race_with_budget") {
          const enough = completed >= join.min_results;
          if (enough || budgetHit) {
            pending.splice(0);
            break;
          }
        }
        startNext();
      }
    } finally {
      if (budgetTimer) clearTimeout(budgetTimer);
    }

    return settled;
  }

  private materializeSliceForNode(
    node: Node,
    ctxScope: ReadonlySet<string> | undefined,
    nodeId: string,
  ) {
    // C1: filter the child's declared ctx keys against the parent's
    // slice-view bound. Keys outside the bound are silently dropped; the
    // node's slice for those tags is empty. We also emit a restriction
    // event so debugging the "my node got no data" case is possible.
    let keys = node.ctx;
    if (ctxScope) {
      const allowed: string[] = [];
      const restricted: string[] = [];
      for (const k of keys) {
        if (ctxScope.has(k)) allowed.push(k);
        else restricted.push(k);
      }
      if (restricted.length > 0) {
        this.events.emit("ctx_scope_restricted", {
          nodeId,
          requested: [...keys],
          allowed,
          restricted,
          timestamp: this.clock().toISOString(),
        });
      }
      keys = allowed;
    }
    const items = [];
    for (const key of keys) {
      const head = this.contextStore.getHeadByTag(key);
      if (!head) continue;
      if (head.content.kind === "decision" && head.content.choice === "tombstone") continue;
      items.push(head);
    }
    const spec = {
      name: "__node_slice__",
      selector: { tags: {} },
      stale_policy: "allow" as const,
      freeze: "snapshot" as const,
    };
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
    granted: CapabilitySet;
    ctxSliceHandle: ReturnType<typeof sliceToReadonly>;
    signal: AbortSignal;
  }): NodeRuntimeHandle {
    const events = this.events;
    const actions = this.actions;
    const nodeId = args.nodeId;
    const granted = args.granted;
    const signal = args.signal;
    const dispatchCtx: DispatchContext = { granted, signal };
    return {
      ctx: args.ctxSliceHandle,
      signal,
      correlation: args.correlation,
      lineage: args.lineage,
      granted,
      log(payload) {
        events.emit("error", {
          nodeId,
          error: `[${payload.level}] ${payload.message}`,
          fatal: false,
          timestamp: new Date().toISOString(),
        });
      },
      async callModel<T>(req: ModelCallRequest<T>): Promise<ModelCallResult<T>> {
        try {
          const res = await actions.dispatchModel<T>({ ...req }, dispatchCtx);
          return {
            value: res.value,
            model: res.model,
            tokens: res.tokens,
            method: res.method,
          };
        } catch (err) {
          if (err instanceof DispatchError) {
            events.emit("permission_denied", {
              nodeId,
              attempted: { model: req.model_id },
              reason: err.message,
              timestamp: new Date().toISOString(),
            });
          }
          throw err;
        }
      },
      async callAction<T>(name: string, callArgs: unknown): Promise<T> {
        try {
          return (await actions.dispatch(name, callArgs, dispatchCtx)) as T;
        } catch (err) {
          if (err instanceof DispatchError) {
            events.emit("permission_denied", {
              nodeId,
              attempted: { action: name },
              reason: err.message,
              timestamp: new Date().toISOString(),
            });
          }
          throw err;
        }
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

  private async emitPrimaryEvidence(args: {
    nodeId: string;
    manifestId: string;
    manifest: NodeManifest;
    lineageId: string;
    correlation: string;
    parentNodeRunId?: string;
    durationMs: number;
    result: NodeResult;
    kindHint?: CollectFromNodeRunInput["kind"];
  }): Promise<EvidenceRecord> {
    const verdict = verdictFromResult(args.result);
    const summary = summaryForResult(args.result);
    const command = `${args.manifestId}#${args.kindHint ?? "generic"}`;
    const input: CollectFromNodeRunInput = {
      kind: args.kindHint ?? "generic",
      nodeId: args.manifestId,
      nodeRunId: args.nodeId,
      ...(args.parentNodeRunId ? { parentNodeRunId: args.parentNodeRunId } : {}),
      lineageId: args.lineageId,
      tool: { name: args.manifestId, command },
      run: { timestamp: this.clock().toISOString(), trigger: "agent" },
      result: {
        verdict: verdict === "inconclusive" ? "skip" : verdict,
        summary,
      },
    };
    const record = await this.evidenceStore.put(this.asPrimaryEvidenceInput(input, args.lineageId));
    this.events.emit("evidence_emitted", {
      evidenceId: record.id,
      nodeId: args.nodeId,
      verdict: verdict === "skip" ? "inconclusive" : (verdict as "pass" | "fail" | "inconclusive"),
      timestamp: record.run.timestamp,
    });
    return record;
  }

  private async emitAccessScanEvidence(args: {
    nodeId: string;
    manifestId: string;
    lineageId: string;
    parentNodeRunId?: string;
    scope: AccessScope;
    violations: readonly AccessViolation[];
    writes: readonly string[];
    reads: readonly string[];
  }): Promise<void> {
    const verdict = args.violations.length === 0 ? "pass" : "fail";
    const summary =
      args.violations.length === 0
        ? `access scan: ${args.writes.length} writes within declared fs.write scope`
        : `access scan: ${args.violations.length} violation(s)`;
    const input: CollectFromNodeRunInput = {
      kind: "access_scan",
      nodeId: args.manifestId,
      nodeRunId: `scan_${args.nodeId}`,
      ...(args.parentNodeRunId ? { parentNodeRunId: args.parentNodeRunId } : {}),
      tool: {
        name: "access_guard",
        command: `snapshot_diff:${args.scope.allowedWrites.join(",")}`,
      },
      run: { timestamp: this.clock().toISOString(), trigger: "agent" },
      result: { verdict, summary, exit_code: args.violations.length },
      writes: [...args.writes],
      reads: [...args.reads],
    };
    await collectFromNodeRun(this.evidenceStore, input);
  }

  private asPrimaryEvidenceInput(
    input: CollectFromNodeRunInput,
    lineageId: string,
  ): Parameters<EvidenceStore["put"]>[0] {
    // Funnel through trust's collector for consistency with auxiliaries.
    // `collectFromNodeRun` builds the record and calls `store.put`, but
    // we need the Record back. Trust's collector returns it; just call
    // through and mirror the shape here.
    return {
      evidence_version: 1,
      claim_refs: [],
      run: {
        timestamp: input.run.timestamp,
        trigger: input.run.trigger,
        ...(input.run.commit_sha ? { commit_sha: input.run.commit_sha } : {}),
        node_id: input.nodeId,
        node_run_id: input.nodeRunId,
        ...(input.parentNodeRunId ? { parent_node_run_id: input.parentNodeRunId } : {}),
        lineage_id: lineageId,
      },
      tool: {
        name: input.tool.name,
        command: input.tool.command,
        exit_code: input.result.exit_code ?? (input.result.verdict === "pass" ? 0 : 1),
      },
      result: {
        verdict: input.result.verdict,
        summary: input.result.summary ?? `${input.tool.name} ${input.result.verdict}`,
      },
      kind: input.kind,
    };
  }

  private async safePostflight(node: Node, result: NodeResult): Promise<void> {
    if (!node.postflight) return;
    try {
      await node.postflight(result);
    } catch {
      /* non-fatal */
    }
  }

  private emitPermissionDenied(
    parentNodeId: string,
    deny: AuthorizeSpawnDeny,
    spawnManifest?: string,
  ): void {
    this.events.emit("permission_denied", {
      nodeId: parentNodeId,
      attempted: spawnManifest ? { spawnManifest } : {},
      reason: `${deny.reason}: missing=${deny.missing.map((c) => c.raw).join(",")}`,
      timestamp: this.clock().toISOString(),
    });
  }

  private startPayload(nodeId: string, manifest: string, frame: Frame) {
    return {
      nodeId,
      manifest,
      correlation: frame.correlation,
      depth: frame.depth,
      timestamp: this.clock().toISOString(),
    };
  }

  private completePayload(
    nodeId: string,
    manifest: string,
    frame: Frame,
    kind: NodeResultKind,
    durationMs: number,
  ) {
    return {
      nodeId,
      manifest,
      correlation: frame.correlation,
      kind,
      durationMs,
      timestamp: this.clock().toISOString(),
    };
  }
}

function verdictFromResult(
  result: NodeResult,
): "pass" | "fail" | "inconclusive" | "skip" {
  if (result.kind === "output") {
    return result.evidence?.verdict ?? "pass";
  }
  if (result.kind === "failed") {
    return result.evidence?.verdict ?? "fail";
  }
  if (result.kind === "replace_me") return "inconclusive";
  return "inconclusive";
}

function summaryForResult(result: NodeResult): string {
  if (result.kind === "output") return "node produced output";
  if (result.kind === "failed") return `failed: ${result.reason}`;
  if (result.kind === "replace_me") return `replaced: ${result.reason}`;
  if (result.kind === "needs_user") return "awaiting user input";
  return "spawn";
}

function inferEvidenceKind(
  manifest: NodeManifest,
): CollectFromNodeRunInput["kind"] {
  if (manifest.required_actions.some((r) => r.startsWith("shell.exec"))) {
    return "shell_exec";
  }
  if (manifest.tags.includes("llm")) return "llm_call";
  if (manifest.tags.includes("validator")) return "gate_check";
  return "generic";
}

/**
 * Derive the access-guard scope from a manifest + granted caps. Returns
 * null when no snapshot is needed (per sub-plan §R1: only nodes with
 * fs.write caps or shell.exec). Scope globs come from the node's granted
 * capability set, not the declared manifest — dynamic augmentation may
 * narrow them.
 */
interface AccessScope {
  include: string[];
  allowedWrites: string[];
  allowedDeletes: string[];
  allowedReads: string[];
}

function deriveAccessScope(
  manifest: NodeManifest,
  grantedCaps: readonly string[],
): AccessScope | null {
  const hasShell = grantedCaps.some((c) => c.startsWith("shell.exec:"));
  const hasWrite = grantedCaps.some((c) => c.startsWith("fs.write:"));
  if (!hasShell && !hasWrite && !manifest.side_effects.writes_fs) return null;

  const reads = grantedCaps.filter((c) => c.startsWith("fs.read:")).map(scopeOf);
  const writes = grantedCaps.filter((c) => c.startsWith("fs.write:")).map(scopeOf);
  const deletes = grantedCaps.filter((c) => c.startsWith("fs.delete:")).map(scopeOf);

  // If shell.exec is held but no fs scopes, we snapshot nothing — shell
  // is coarse by design (sub-plan 02 §1.1.4). Any fs-visible effect of a
  // subprocess is captured only when the declared fs.read/write scopes
  // include it. No snapshot, no auxiliary evidence; spawn-time cap check
  // + denylist still apply.
  const include = [...new Set([...reads, ...writes, ...deletes])].filter((s) => s !== "*");
  if (include.length === 0) return null;

  return {
    include,
    allowedWrites: writes.filter((s) => s !== "*"),
    allowedDeletes: [...deletes.filter((s) => s !== "*"), ...writes.filter((s) => s !== "*")],
    allowedReads: reads.filter((s) => s !== "*"),
  };
}

function scopeOf(cap: string): string {
  const colon = cap.indexOf(":");
  return colon < 0 ? cap : cap.slice(colon + 1);
}

/**
 * Compose the effective `childManifestRequired` capability set for spawn
 * auth. Parses declared `required_actions` and augments from
 * `dynamic_action_spec` per master plan §R4 using the spawn's input.
 */
function buildEffectiveRequired(manifest: NodeManifest, input: unknown): CapabilitySet {
  const declared = capabilitySet(manifest.required_actions);
  if (!manifest.dynamic_actions) return declared;
  const augmented = augmentRequired(
    declared.caps,
    manifest.dynamic_actions,
    manifest.dynamic_action_spec,
    input,
  );
  return { caps: augmented };
}

function hashKeysAndHeads(keys: readonly string[], items: ReadonlyArray<{ id: string }>): string {
  const payload = keys.map((k, i) => `${k}:${items[i]?.id ?? ""}`).join("|");
  let h = 0;
  for (let i = 0; i < payload.length; i += 1) {
    h = (h * 31 + payload.charCodeAt(i)) | 0;
  }
  return `sl_${(h >>> 0).toString(16).padStart(8, "0")}`;
}

function validateInput(
  node: Node,
  input: NodeInput<unknown>,
): { ok: true } | { ok: false; issues: unknown } {
  if (!node.inputSchema) return { ok: true };
  // Validate the "original" payload; children presence is runtime-managed.
  const parse = node.inputSchema.safeParse(input.original);
  if (parse.success) return { ok: true };
  const errors: readonly unknown[] = parse.error instanceof ZodError ? parse.error.issues : [];
  return { ok: false, issues: errors };
}

function validateOutput(
  node: Node,
  output: unknown,
): { ok: true } | { ok: false; issues: unknown } {
  if (!node.outputSchema) return { ok: true };
  const parse = node.outputSchema.safeParse(output);
  if (parse.success) return { ok: true };
  const errors: readonly unknown[] = parse.error instanceof ZodError ? parse.error.issues : [];
  return { ok: false, issues: errors };
}

/** Test/bootstrap helper — builds a minimal manifest with safe defaults. */
export function makeManifest(input: {
  id: string;
  name: string;
  description: string;
  determinism: "deterministic" | "stochastic";
  required_actions?: readonly string[];
  version?: string;
  side_effects?: Partial<NodeManifest["side_effects"]>;
  tags?: string[];
  dynamic_actions?: boolean;
  dynamic_action_spec?: string;
}): NodeManifest {
  const required_actions = [...(input.required_actions ?? [])];
  const dynamic_spec = input.dynamic_action_spec ?? "";
  const combinedForDetect = [...required_actions, dynamic_spec].join(" ");
  const needsFs =
    /\bfs\.write:|\bfs\.delete:|\bshell\.exec:/.test(combinedForDetect);
  const needsNet =
    /\bnet\.(http|dns):|\bshell\.exec:/.test(combinedForDetect);
  const raw: NodeManifestInput = {
    manifest_version: 1,
    id: input.id,
    version: input.version ?? "0.1.0",
    name: input.name,
    description: input.description,
    required_actions,
    determinism: input.determinism,
    side_effects: {
      writes_fs: needsFs || (input.side_effects?.writes_fs ?? false),
      network: needsNet || (input.side_effects?.network ?? false),
      mutates_ctx: input.side_effects?.mutates_ctx ?? false,
      emits_ctx_variants: input.side_effects?.emits_ctx_variants ?? [],
      reads_ctx_variants: input.side_effects?.reads_ctx_variants ?? [],
    },
    tags: input.tags ?? [],
    ...(input.dynamic_actions
      ? { dynamic_actions: true as const, dynamic_action_spec: input.dynamic_action_spec ?? "" }
      : {}),
  };
  return validateManifest(raw);
}
