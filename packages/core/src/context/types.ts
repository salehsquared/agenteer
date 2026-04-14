/**
 * Context Layer — type surface (sub-plan 01).
 *
 * Items are immutable, content-addressable, append-only. Updates are modeled
 * via new items linked with `refs.supersedes`. Staleness is stored only at
 * roots and derived on read per master plan §R3 + sub-plan 01 §5.
 */

export type ContextItemType =
  | "artifact"
  | "observation"
  | "decision"
  | "evidence_ref"
  | "claim"
  | "reference";

export type StaleReason =
  | "upstream_changed"
  | "explicit"
  | "superseded"
  | "evidence_invalidated"
  | "redaction";

export interface StaleMarker {
  at: string;
  by: string;
  reason: StaleReason;
  detail?: string;
}

export type RefKind =
  | "derives_from"
  | "refines"
  | "contradicts"
  | "cites"
  | "supersedes"
  | "attaches_to"
  | "extends";

export type RefTarget =
  | { scope: "ctx"; id: string }
  | { scope: "evidence"; id: string }
  | { scope: "external"; uri: string; content_hash?: string };

export interface ContextRef {
  kind: RefKind;
  target: RefTarget;
}

export interface Provenance {
  source_node: string;
  source_node_run_id: string;
  source_input_hash: string;
  parent_node_run_id?: string;
  timestamp: string;
  tool_invocation?: {
    name: string;
    command?: string;
    exit_code?: number;
    duration_ms?: number;
  };
  cause?: "initial" | "repair" | "refine" | "user_correction" | "patch";
}

export type ContextItemContent =
  | {
      kind: "artifact";
      media_type: string;
      encoding: "utf8" | "base64" | "inline_json";
      body: string | Record<string, unknown> | unknown[];
      schema_ref?: string;
    }
  | {
      kind: "observation";
      subject: string;
      observed: unknown;
      observer_tool?: string;
    }
  | {
      kind: "decision";
      question: string;
      choice: string;
      alternatives: string[];
      rationale?: string;
      confidence?: number;
    }
  | {
      kind: "evidence_ref";
      evidence_id: string;
      verdict: "pass" | "fail" | "error" | "skip" | "timeout";
    }
  | {
      kind: "claim";
      statement: string;
      claim_type: "constraint" | "acceptance_criterion" | "invariant" | "requirement" | "assumption";
      attaches_to?: string;
    }
  | {
      kind: "reference";
      uri: string;
      content_hash?: string;
      media_type?: string;
      last_seen_at?: string;
    };

export interface ContextItem {
  context_version: 1;
  id: string;
  type: ContextItemType;
  content: ContextItemContent;
  provenance: Provenance;
  refs: ContextRef[];
  tags: string[];
  labels: Record<string, string>;
  stale_marker_set: StaleMarker[];
  size_bytes: number;
  redaction_level?: "public" | "internal" | "secret";
}

/** Fields a caller supplies; the store fills in id + timestamp + size_bytes. */
export interface NewContextItem {
  type: ContextItemType;
  content: ContextItemContent;
  provenance: Omit<Provenance, "timestamp" | "source_input_hash"> & {
    source_input_hash?: string;
  };
  refs?: ContextRef[];
  tags?: string[];
  labels?: Record<string, string>;
  stale_marker_set?: StaleMarker[];
  redaction_level?: ContextItem["redaction_level"];
}

export interface Selector {
  ids?: string[];
  types?: ContextItemType[];
  tags?: { any?: string[]; all?: string[]; none?: string[] };
  labels?: Record<string, string>;
  provenance?: { source_node?: string; cause?: Provenance["cause"] };
  refs?: { kind?: RefKind; target_id?: string };
  stale?: "only" | "exclude" | "include";
  limit?: number;
  order?: "oldest" | "newest";
}

/** Slice specification: what a node actually sees. */
export interface SliceSpec {
  name: string;
  selector: Selector;
  budget?: { max_items?: number; max_bytes?: number };
  stale_policy: "reject" | "recompute" | "warn" | "allow";
  freeze: "snapshot" | "live";
}

export interface MaterializedSlice {
  spec: SliceSpec;
  materialized_at: string;
  materialized_hash: string;
  items: ReadonlyArray<Readonly<ContextItem>>;
  stale_ids: readonly string[];
}

/**
 * ReadonlyContextSlice — what a node receives via its runtime handle.
 * Mirrors sub-plan 00 §16.1's interface and is the only context surface
 * exposed to `execute`.
 */
export interface ReadonlyContextSlice {
  get<T = unknown>(key: string): T | undefined;
  has(key: string): boolean;
  keys(): readonly string[];
  items(): ReadonlyArray<Readonly<ContextItem>>;
  readonly materialized_hash: string;
}
