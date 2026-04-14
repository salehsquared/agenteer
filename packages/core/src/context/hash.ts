import { createHash } from "node:crypto";
import type {
  ContextItem,
  ContextItemContent,
  ContextRef,
  NewContextItem,
} from "./types.js";

/**
 * Canonical JSON: sorted keys, no whitespace, NFC-normalized strings.
 * Used for every hash in the system so replays land on the same IDs.
 */
export function canonicalize(value: unknown): string {
  return JSON.stringify(canonicalValue(value));
}

function canonicalValue(value: unknown): unknown {
  if (value === null || value === undefined) return null;
  if (typeof value === "string") return value.normalize("NFC");
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new Error(`non-finite number cannot be canonicalized: ${value}`);
    }
    return value;
  }
  if (typeof value === "boolean") return value;
  if (Array.isArray(value)) return value.map(canonicalValue);
  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    const out: Record<string, unknown> = {};
    for (const [k, v] of entries) out[k] = canonicalValue(v);
    return out;
  }
  return String(value);
}

export function sha256Hex(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

/** Stable sort of refs for hashing (set-like semantics). */
function sortRefs(refs: readonly ContextRef[]): ContextRef[] {
  return [...refs].sort((a, b) => {
    const ka = refKey(a);
    const kb = refKey(b);
    return ka < kb ? -1 : ka > kb ? 1 : 0;
  });
}

function refKey(ref: ContextRef): string {
  const t = ref.target;
  if (t.scope === "ctx") return `${ref.kind}|ctx|${t.id}`;
  if (t.scope === "evidence") return `${ref.kind}|evidence|${t.id}`;
  return `${ref.kind}|external|${t.uri}|${t.content_hash ?? ""}`;
}

/**
 * Compute the deterministic content-address hash of an item. Excluded:
 * timestamp, source_node_run_id, tags, labels, stale_marker_set,
 * parent_node_run_id, size_bytes. See sub-plan 01 §3.2.
 */
export function itemContentHash(item: {
  type: string;
  content: ContextItemContent;
  provenance: { source_node: string; source_input_hash?: string; tool_invocation?: unknown };
  refs: readonly ContextRef[];
}): string {
  const payload = {
    type: item.type,
    content: item.content,
    provenance: {
      source_node: item.provenance.source_node,
      source_input_hash: item.provenance.source_input_hash ?? "",
      tool_invocation: item.provenance.tool_invocation ?? null,
    },
    refs: sortRefs(item.refs),
  };
  return sha256Hex(canonicalize(payload));
}

export function formatItemId(timestamp: string, contentHash: string): string {
  // ctx_YYYYMMDD_<sha256[0..11]>
  const yyyymmdd = timestamp.slice(0, 10).replace(/-/g, "");
  return `ctx_${yyyymmdd}_${contentHash.slice(0, 12)}`;
}

export function computeSizeBytes(content: ContextItemContent): number {
  // Serialized content length is a workable proxy for budget accounting.
  return Buffer.byteLength(canonicalize(content), "utf8");
}

/**
 * Fill in id + timestamp + size_bytes + source_input_hash for a new item.
 * Pure function — callers decide whether to persist.
 */
export function finalizeItem(draft: NewContextItem, now: Date): ContextItem {
  const timestamp = now.toISOString();
  const refs = draft.refs ?? [];
  const sourceInputHash = draft.provenance.source_input_hash ?? "";
  const contentHash = itemContentHash({
    type: draft.type,
    content: draft.content,
    provenance: {
      source_node: draft.provenance.source_node,
      source_input_hash: sourceInputHash,
      tool_invocation: draft.provenance.tool_invocation,
    },
    refs,
  });
  const id = formatItemId(timestamp, contentHash);
  return {
    context_version: 1,
    id,
    type: draft.type,
    content: draft.content,
    provenance: {
      ...draft.provenance,
      source_input_hash: sourceInputHash,
      timestamp,
    },
    refs,
    tags: draft.tags ?? [],
    labels: draft.labels ?? {},
    stale_marker_set: draft.stale_marker_set ?? [],
    size_bytes: computeSizeBytes(draft.content),
    ...(draft.redaction_level ? { redaction_level: draft.redaction_level } : {}),
  };
}
