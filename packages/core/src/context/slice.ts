import type { ContextItem, MaterializedSlice, ReadonlyContextSlice } from "./types.js";

/**
 * Adapt a MaterializedSlice into the ReadonlyContextSlice surface that
 * `NodeRuntimeHandle.ctx` exposes. Keys = labels.tag of each item (head of
 * supersede chain semantics handled by the store query).
 */
export function sliceToReadonly(materialized: MaterializedSlice): ReadonlyContextSlice {
  const keyIndex = new Map<string, ContextItem>();
  for (const item of materialized.items) {
    const tag = item.labels["tag"];
    if (tag) keyIndex.set(tag, item);
  }
  const frozenItems = materialized.items;
  const hash = materialized.materialized_hash;
  return {
    get<T = unknown>(key: string): T | undefined {
      const item = keyIndex.get(key);
      if (!item) return undefined;
      return extractValue(item) as T;
    },
    has(key: string): boolean {
      return keyIndex.has(key);
    },
    keys(): readonly string[] {
      return Array.from(keyIndex.keys());
    },
    items(): ReadonlyArray<Readonly<ContextItem>> {
      return frozenItems;
    },
    materialized_hash: hash,
  };
}

function extractValue(item: ContextItem): unknown {
  const c = item.content;
  switch (c.kind) {
    case "artifact":
      return c.body;
    case "decision":
      // Items produced by `ctx.set(...)` via the R3 patch compiler carry
      // the original value JSON-encoded in `rationale`; decode so node
      // authors get back the primitive they wrote.
      if (item.labels["ctx_op"] === "set" && c.rationale !== undefined) {
        try {
          return JSON.parse(c.rationale);
        } catch {
          return c.rationale;
        }
      }
      return c.choice;
    case "observation":
      return c.observed;
    case "evidence_ref":
      return { evidence_id: c.evidence_id, verdict: c.verdict };
    case "claim":
      return c.statement;
    case "reference":
      return c.uri;
  }
}
