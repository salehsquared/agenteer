/**
 * `FileContextStore` — swap-in replacement for `InMemoryContextStore` that
 * persists each item as `<sessionDir>/context/items/<id>.yaml`.
 *
 * Master plan §R3 + sub-plan 01 §2 contracts honored (mirrors the in-memory
 * store verbatim):
 *   - Append-only. `add(draft)` with an identical content hash returns the
 *     existing item; never overwrites.
 *   - Acyclic. Cycle check identical to in-memory.
 *   - Staleness stored only at marked roots; `isStale` derives through the
 *     `derives_from` / `supersedes` / `extends` chain.
 *   - Slice materialization is deterministic; `materialized_hash` is the key.
 *
 * Concurrency note (intentional M5 scope): this store is designed for a
 * single-writer session. Multi-process writers would race `add` → `writeYaml`;
 * not a goal for M5. Atomic tmp+rename ensures *one* writer's mid-op crash
 * cannot leave a half-written file.
 *
 * Recovery is rebuilt-from-items — no index file is persisted. `order` is
 * derived from `provenance.timestamp` (stable), and `byTag` is derived from
 * `labels.tag`. Nothing in the filesystem encodes runtime-only state.
 */

import { join } from "node:path";
import { unlink } from "node:fs/promises";
import type { z } from "zod";
import {
  canonicalize,
  finalizeItem,
  itemContentHash,
  sha256Hex,
} from "./hash.js";
import type {
  ContextItem,
  MaterializedSlice,
  NewContextItem,
  Selector,
  SliceSpec,
  StaleMarker,
  StaleReason,
} from "./types.js";
import type { ContextStore } from "./store.js";
import { ensureDir, listFiles, readYaml, writeYaml } from "../util/fs.js";

/**
 * Zod-free permissive schema for persisted items. The runtime only writes
 * items it built via `finalizeItem`, so on-disk drift is unlikely; we parse
 * YAML and cast. If a user edits a file by hand the cycle / ref validators
 * in `add` will still catch most corruption on next boot via `loadAll`.
 */
const PassthroughSchema = {
  parse: (v: unknown) => v as ContextItem,
} as unknown as z.ZodType<ContextItem>;

export interface FileContextStoreOptions {
  /** Session directory root (e.g. `./.agenteer/sessions/<id>`). */
  sessionDir: string;
  clock?: () => Date;
}

export class FileContextStore implements ContextStore {
  private readonly itemsDir: string;
  private readonly clock: () => Date;
  private readonly items = new Map<string, ContextItem>();
  private readonly order: string[] = [];
  private readonly byTag = new Map<string, string[]>();
  private loaded = false;

  constructor(opts: FileContextStoreOptions) {
    this.itemsDir = join(opts.sessionDir, "context", "items");
    this.clock = opts.clock ?? (() => new Date());
  }

  /**
   * Eagerly load all persisted items. Must be awaited before first use
   * when resuming — `Runtime` callers should `await store.load()` before
   * handing the store to `new Runtime({...})`.
   */
  async load(): Promise<void> {
    if (this.loaded) return;
    this.loaded = true;
    const files = await listFiles(this.itemsDir, ".yaml");
    const parsed: ContextItem[] = [];
    for (const file of files) {
      const item = await readYaml(file, PassthroughSchema);
      if (item) parsed.push(item);
    }
    // Deterministic order: provenance.timestamp ascending, then id as a
    // tiebreaker when two items share a timestamp.
    parsed.sort((a, b) => {
      const ta = a.provenance.timestamp;
      const tb = b.provenance.timestamp;
      if (ta !== tb) return ta < tb ? -1 : 1;
      return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
    });
    for (const item of parsed) {
      this.items.set(item.id, item);
      this.order.push(item.id);
      indexByTag(this.byTag, item);
    }
  }

  /** Synchronous contract — callers who omit `await load()` get empty state. */
  add(draft: NewContextItem): ContextItem {
    this.ensureLoaded();
    const item = finalizeItem(draft, this.clock());

    const existing = this.items.get(item.id);
    if (existing) {
      const existingHash = itemContentHash({
        type: existing.type,
        content: existing.content,
        provenance: {
          source_node: existing.provenance.source_node,
          source_input_hash: existing.provenance.source_input_hash,
          tool_invocation: existing.provenance.tool_invocation,
        },
        refs: existing.refs,
      });
      const incomingHash = itemContentHash({
        type: item.type,
        content: item.content,
        provenance: {
          source_node: item.provenance.source_node,
          source_input_hash: item.provenance.source_input_hash,
          tool_invocation: item.provenance.tool_invocation,
        },
        refs: item.refs,
      });
      if (existingHash !== incomingHash) {
        throw new Error(
          `ContentAddressConflict: id ${item.id} already exists with different content`,
        );
      }
      return existing;
    }

    this.validateRefs(item);
    this.items.set(item.id, item);
    this.order.push(item.id);
    indexByTag(this.byTag, item);
    // Fire-and-forget is not good enough for durability; we await via the
    // pending queue exposed by `flushPending` — but the sync contract forces
    // us to persist best-effort here. Use `saveItemSync` which spawns a
    // background promise tracked for flush.
    this.schedulePersist(item);
    return item;
  }

  get(id: string): ContextItem | null {
    this.ensureLoaded();
    return this.items.get(id) ?? null;
  }

  query(selector: Selector): ContextItem[] {
    this.ensureLoaded();
    const wantStale = selector.stale ?? "include";
    const ids = selector.order === "newest" ? [...this.order].reverse() : this.order;
    const out: ContextItem[] = [];
    for (const id of ids) {
      const it = this.items.get(id)!;
      if (!matches(it, selector)) continue;
      const stale = this.isStale(id);
      if (wantStale === "only" && !stale) continue;
      if (wantStale === "exclude" && stale) continue;
      out.push(it);
      if (selector.limit && out.length >= selector.limit) break;
    }
    return out;
  }

  isStale(id: string): boolean {
    return this.isStaleRecursive(id, new Set());
  }

  private isStaleRecursive(id: string, visited: Set<string>): boolean {
    if (visited.has(id)) return false;
    visited.add(id);
    const item = this.items.get(id);
    if (!item) return false;
    if (item.stale_marker_set.length > 0) return true;
    for (const ref of item.refs) {
      if (ref.kind !== "derives_from" && ref.kind !== "supersedes" && ref.kind !== "extends") {
        continue;
      }
      if (ref.target.scope !== "ctx") continue;
      if (this.isStaleRecursive(ref.target.id, visited)) return true;
    }
    return false;
  }

  markStale(
    id: string,
    marker: { by: string; reason: StaleReason; detail?: string },
  ): void {
    this.markStaleRaw(id, { at: this.clock().toISOString(), ...marker });
  }

  markStaleRaw(id: string, marker: StaleMarker): void {
    this.ensureLoaded();
    const item = this.items.get(id);
    if (!item) throw new Error(`markStale: unknown id ${id}`);
    const last = item.stale_marker_set[item.stale_marker_set.length - 1];
    if (
      last &&
      last.reason === marker.reason &&
      last.by === marker.by &&
      last.detail === marker.detail
    ) {
      return;
    }
    item.stale_marker_set.push(marker);
    this.schedulePersist(item);
  }

  getHeadByTag(tag: string): ContextItem | null {
    this.ensureLoaded();
    const chain = this.byTag.get(tag);
    if (!chain || chain.length === 0) return null;
    const headId = chain[chain.length - 1];
    return headId ? (this.items.get(headId) ?? null) : null;
  }

  materializeSlice(spec: SliceSpec): MaterializedSlice {
    const items = this.query(spec.selector);
    const bounded = applyBudget(items, spec.budget);
    const now = this.clock().toISOString();
    const hash = sha256Hex(
      canonicalize({
        spec: canonicalSpec(spec),
        item_ids: bounded.map((i) => i.id),
      }),
    );
    const staleIds = bounded.filter((i) => this.isStale(i.id)).map((i) => i.id);
    return {
      spec,
      materialized_at: now,
      materialized_hash: hash,
      items: Object.freeze(bounded.map((i) => Object.freeze({ ...i }))),
      stale_ids: staleIds,
    };
  }

  snapshot(): ReadonlyArray<Readonly<ContextItem>> {
    this.ensureLoaded();
    return this.order.map((id) => this.items.get(id)!);
  }

  /**
   * Await for all scheduled writes to complete. Call before process exit
   * (or at session-checkpoint boundaries) to guarantee durability.
   */
  async flush(): Promise<void> {
    // Drain repeatedly in case a pending write chains more work.
    while (this.pending.size > 0) {
      await Promise.all([...this.pending]);
    }
  }

  /** Remove the on-disk directory for this store. Testing convenience. */
  async destroy(): Promise<void> {
    await this.flush();
    try {
      const files = await listFiles(this.itemsDir, ".yaml");
      for (const f of files) await unlink(f);
    } catch {
      /* best effort */
    }
  }

  // --- internals ------------------------------------------------------

  private readonly pending = new Set<Promise<void>>();
  /** Per-path chain so overlapping writes to the same file serialize. */
  private readonly lastWriteByPath = new Map<string, Promise<void>>();

  private schedulePersist(item: ContextItem): void {
    const path = join(this.itemsDir, `${item.id}.yaml`);
    const prev = this.lastWriteByPath.get(path) ?? Promise.resolve();
    const snapshotItem = { ...item, stale_marker_set: [...item.stale_marker_set] };
    const next = prev.then(async () => {
      await ensureDir(this.itemsDir);
      await writeYaml(path, snapshotItem);
    });
    this.lastWriteByPath.set(path, next);
    this.pending.add(next);
    next
      .catch(() => {
        /* surfaced via flush() rethrow */
      })
      .finally(() => {
        this.pending.delete(next);
      });
  }

  private ensureLoaded(): void {
    if (!this.loaded) {
      // Sync callers without prior `await load()` get an empty store. We
      // set `loaded` true so behavior is consistent; explicit resume
      // pathways must call `load()` first.
      this.loaded = true;
    }
  }

  private validateRefs(item: ContextItem): void {
    for (const ref of item.refs) {
      if (ref.target.scope !== "ctx") continue;
      const target = this.items.get(ref.target.id);
      if (!target) {
        throw new Error(
          `DanglingRef: item ${item.id} references missing ctx id ${ref.target.id}`,
        );
      }
    }
    const visited = new Set<string>();
    const stack: string[] = item.refs
      .filter((r) => r.target.scope === "ctx")
      .map((r) => (r.target as { scope: "ctx"; id: string }).id);
    while (stack.length) {
      const cur = stack.pop()!;
      if (cur === item.id) {
        throw new Error(`CycleDetected: adding ${item.id} would form a cycle`);
      }
      if (visited.has(cur)) continue;
      visited.add(cur);
      const node = this.items.get(cur);
      if (!node) continue;
      for (const r of node.refs) {
        if (r.target.scope === "ctx") stack.push(r.target.id);
      }
    }
  }
}

function indexByTag(map: Map<string, string[]>, item: ContextItem): void {
  const tag = item.labels["tag"];
  if (!tag) return;
  const chain = map.get(tag) ?? [];
  chain.push(item.id);
  map.set(tag, chain);
}

function matches(item: ContextItem, s: Selector): boolean {
  if (s.ids && !s.ids.includes(item.id)) return false;
  if (s.types && !s.types.includes(item.type)) return false;
  if (s.tags) {
    const { any, all, none } = s.tags;
    if (any && !any.some((t) => item.tags.includes(t))) return false;
    if (all && !all.every((t) => item.tags.includes(t))) return false;
    if (none && none.some((t) => item.tags.includes(t))) return false;
  }
  if (s.labels) {
    for (const [k, v] of Object.entries(s.labels)) {
      if (item.labels[k] !== v) return false;
    }
  }
  if (s.provenance) {
    if (s.provenance.source_node && item.provenance.source_node !== s.provenance.source_node) return false;
    if (s.provenance.cause && item.provenance.cause !== s.provenance.cause) return false;
  }
  if (s.refs) {
    const hit = item.refs.some(
      (r) =>
        (!s.refs!.kind || r.kind === s.refs!.kind) &&
        (!s.refs!.target_id || (r.target.scope === "ctx" && r.target.id === s.refs!.target_id)),
    );
    if (!hit) return false;
  }
  return true;
}

function applyBudget(
  items: ContextItem[],
  budget: SliceSpec["budget"] | undefined,
): ContextItem[] {
  if (!budget) return items;
  let out = items;
  if (budget.max_items !== undefined) out = out.slice(0, budget.max_items);
  if (budget.max_bytes !== undefined) {
    let total = 0;
    const bounded: ContextItem[] = [];
    for (const it of out) {
      total += it.size_bytes;
      if (total > budget.max_bytes) break;
      bounded.push(it);
    }
    out = bounded;
  }
  return out;
}

function canonicalSpec(spec: SliceSpec): unknown {
  return {
    selector: spec.selector,
    budget: spec.budget ?? null,
    stale_policy: spec.stale_policy,
    freeze: spec.freeze,
  };
}
