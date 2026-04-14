import type {
  ContextItem,
  ContextItemContent,
  ContextRef,
  NewContextItem,
  Selector,
  SliceSpec,
  MaterializedSlice,
} from "./types.js";
import { canonicalize, finalizeItem, itemContentHash, sha256Hex } from "./hash.js";

export interface ContextStoreReader {
  get(id: string): ContextItem | null;
  query(selector: Selector): ContextItem[];
  isStale(id: string): boolean;
  materializeSlice(spec: SliceSpec): MaterializedSlice;
  /** Returns the head of the supersede chain for a tag, or null. */
  getHeadByTag(tag: string): ContextItem | null;
}

export interface ContextStoreWriter {
  /**
   * Append-only. Idempotent: if an identical item (same content hash)
   * already exists, returns the existing item.
   */
  add(draft: NewContextItem): ContextItem;
  /** Append a marker to an item's stale_marker_set in-place (allowed). */
  markStale(
    id: string,
    marker: { by: string; reason: Parameters<ContextStoreWriter["markStaleRaw"]>[1]["reason"]; detail?: string },
  ): void;
  /** Internal: raw marker append (keeps ergonomic wrapper above). */
  markStaleRaw(
    id: string,
    marker: { at: string; by: string; reason: import("./types.js").StaleReason; detail?: string },
  ): void;
}

export interface ContextStore extends ContextStoreReader, ContextStoreWriter {
  /** Flat dump for debugging / serialization. */
  snapshot(): ReadonlyArray<Readonly<ContextItem>>;
}

/**
 * In-memory reference implementation of the context store.
 *
 * Contracts honored (sub-plan 01 §2, master plan §R3):
 *   - Append-only. `add` with the same canonical content returns the
 *     existing item; never overwrites.
 *   - Acyclic. `add` rejects items whose refs close a cycle.
 *   - Staleness stored only at marked roots; `isStale` derives the
 *     transitive flag through `derives_from` chains.
 *   - Slice materialization is deterministic given the same store state +
 *     spec; `materialized_hash` is the cache key.
 */
export class InMemoryContextStore implements ContextStore {
  private readonly items = new Map<string, ContextItem>();
  /** insertion order for deterministic query output */
  private readonly order: string[] = [];
  /** tag → ordered list of item ids (supersede chain heads at end) */
  private readonly byTag = new Map<string, string[]>();

  constructor(private readonly clock: () => Date = () => new Date()) {}

  add(draft: NewContextItem): ContextItem {
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
    return item;
  }

  get(id: string): ContextItem | null {
    return this.items.get(id) ?? null;
  }

  query(selector: Selector): ContextItem[] {
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
    return this.isStaleRecursive(id, new Set<string>());
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

  markStale(id: string, marker: { by: string; reason: import("./types.js").StaleReason; detail?: string }): void {
    this.markStaleRaw(id, { at: this.clock().toISOString(), ...marker });
  }

  markStaleRaw(
    id: string,
    marker: { at: string; by: string; reason: import("./types.js").StaleReason; detail?: string },
  ): void {
    const item = this.items.get(id);
    if (!item) throw new Error(`markStale: unknown id ${id}`);
    const last = item.stale_marker_set[item.stale_marker_set.length - 1];
    if (last && last.reason === marker.reason && last.by === marker.by && last.detail === marker.detail) {
      return; // idempotent: identical marker coalesces
    }
    item.stale_marker_set.push(marker);
  }

  getHeadByTag(tag: string): ContextItem | null {
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
    return this.order.map((id) => this.items.get(id)!);
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
    // Cycle check: since refs can only point to already-inserted items, and
    // item ids are content-derived, a cycle would require a collision. We
    // still guard defensively: walk ancestors and ensure item.id is absent.
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
  // Spec hash must ignore `name` so two slices with different slot names
  // but identical semantics can be deduped in downstream caches. Kept
  // conservative for now (include name); revisit with caching work.
  return {
    selector: spec.selector,
    budget: spec.budget ?? null,
    stale_policy: spec.stale_policy,
    freeze: spec.freeze,
  };
}

/** Helper exposing content-hash utility for callers outside the store. */
export function hashItemContent(content: ContextItemContent, refs: readonly ContextRef[], sourceNode: string): string {
  return itemContentHash({
    type: "artifact",
    content,
    provenance: { source_node: sourceNode, source_input_hash: "" },
    refs,
  });
}
