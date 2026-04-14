/**
 * `agenteer ctx` — read-only queries against a session's persisted
 * `FileContextStore`. Subcommands:
 *
 *   list     — all items (id, type, tag, timestamp, stale)
 *   get      — full item by id
 *   lineage  — walk supersedes/derives_from from an id to its roots
 *   diff     — side-by-side diff of two items' content
 *
 * Library forms are exported so tests can call without shell plumbing.
 */

import { FileContextStore } from "@agenteer/core";
import type { ContextItem } from "@agenteer/core";

export interface CtxListEntry {
  id: string;
  type: ContextItem["type"];
  tag: string | null;
  timestamp: string;
  stale: boolean;
  source_node: string;
}

export async function ctxList(
  sessionDir: string,
  filter: { tag?: string; type?: ContextItem["type"] } = {},
): Promise<CtxListEntry[]> {
  const store = new FileContextStore({ sessionDir });
  await store.load();
  return store.snapshot().flatMap((i) => {
    if (filter.type && i.type !== filter.type) return [];
    const tag = i.labels["tag"] ?? null;
    if (filter.tag && tag !== filter.tag) return [];
    return [
      {
        id: i.id,
        type: i.type,
        tag,
        timestamp: i.provenance.timestamp,
        stale: store.isStale(i.id),
        source_node: i.provenance.source_node,
      },
    ];
  });
}

export async function ctxGet(sessionDir: string, id: string): Promise<ContextItem | null> {
  const store = new FileContextStore({ sessionDir });
  await store.load();
  return store.get(id);
}

/**
 * Walk `supersedes` + `derives_from` back from `id` to its roots, yielding
 * each item in traversal order (id first, then its predecessors).
 */
export async function ctxLineage(sessionDir: string, id: string): Promise<ContextItem[]> {
  const store = new FileContextStore({ sessionDir });
  await store.load();
  const out: ContextItem[] = [];
  const visited = new Set<string>();
  const stack: string[] = [id];
  while (stack.length > 0) {
    const cur = stack.pop()!;
    if (visited.has(cur)) continue;
    visited.add(cur);
    const item = store.get(cur);
    if (!item) continue;
    out.push(item);
    for (const ref of item.refs) {
      if (ref.target.scope !== "ctx") continue;
      if (ref.kind !== "supersedes" && ref.kind !== "derives_from" && ref.kind !== "extends") {
        continue;
      }
      stack.push(ref.target.id);
    }
  }
  return out;
}

export interface CtxDiffResult {
  left: ContextItem | null;
  right: ContextItem | null;
  /** JSON-string diff — line-oriented, suitable for terminal print. */
  text: string;
}

export async function ctxDiff(
  sessionDir: string,
  idLeft: string,
  idRight: string,
): Promise<CtxDiffResult> {
  const store = new FileContextStore({ sessionDir });
  await store.load();
  const left = store.get(idLeft);
  const right = store.get(idRight);
  const leftText = left ? JSON.stringify(left.content, null, 2) : "<missing>";
  const rightText = right ? JSON.stringify(right.content, null, 2) : "<missing>";
  return { left, right, text: simpleLineDiff(leftText, rightText) };
}

function simpleLineDiff(a: string, b: string): string {
  const aLines = a.split("\n");
  const bLines = b.split("\n");
  const maxLen = Math.max(aLines.length, bLines.length);
  const lines: string[] = [];
  for (let i = 0; i < maxLen; i++) {
    const la = aLines[i];
    const lb = bLines[i];
    if (la === lb) {
      lines.push(`  ${la ?? ""}`);
    } else {
      if (la !== undefined) lines.push(`- ${la}`);
      if (lb !== undefined) lines.push(`+ ${lb}`);
    }
  }
  return lines.join("\n");
}
