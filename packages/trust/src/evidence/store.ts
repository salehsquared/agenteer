/**
 * EvidenceStore interface — sub-plan 04 §1.5.
 *
 * The store is pluggable. YamlEvidenceStore is the default; MemoryEvidenceStore
 * backs tests. Third-party stores (Postgres, GitHub-issues) can ship in v2.
 */

import type {
  ClaimType,
  EvidenceKind,
  EvidenceRecord,
  StaleMarker,
} from "./schema.js";

export interface EvidenceFilter {
  kinds?: EvidenceKind[];
  verdicts?: EvidenceRecord["result"]["verdict"][];
  since?: string;
  until?: string;
  nodeId?: string;
  claim?: { type: ClaimType; id: string };
  stale?: "only" | "exclude" | "include";
}

export type EvidencePutInput = Omit<EvidenceRecord, "id" | "stale" | "stale_markers"> & {
  id?: string;
  stale?: boolean;
  stale_markers?: StaleMarker[];
};

export interface StalenessReport {
  stale_ids: string[];
  claim_refs: Array<{ type: ClaimType; id: string; evidenceIds: string[] }>;
}

export type EvidenceEventKind = "put" | "stale" | "refresh";

export interface EvidenceStoreEventMap {
  put: EvidenceRecord;
  stale: { id: string; marker: StaleMarker };
  refresh: StalenessReport;
}

export interface EvidenceStore {
  put(record: EvidencePutInput): Promise<EvidenceRecord>;
  get(id: string): Promise<EvidenceRecord | null>;
  list(filter?: EvidenceFilter): Promise<EvidenceRecord[]>;
  queryByClaim(claim: { type: ClaimType; id: string }): Promise<EvidenceRecord[]>;

  markStale(id: string, marker: Omit<StaleMarker, "at">): Promise<void>;
  markAllStale(filter?: EvidenceFilter, marker?: Partial<StaleMarker>): Promise<number>;
  refreshStaleness(): Promise<StalenessReport>;

  on<K extends EvidenceEventKind>(event: K, handler: (payload: EvidenceStoreEventMap[K]) => void | Promise<void>): Unsubscribe;
}

export type Unsubscribe = () => void;

/**
 * Dedup policy (sub-plan 04 §1.2).
 *   - `"distinct"` (default): every put creates a record; colliding hashes
 *     get a numeric suffix.
 *   - `"dedupe"`: identical hash inputs return the existing record unchanged.
 */
export type DuplicatePolicy = "distinct" | "dedupe";

export interface EvidenceStoreOptions {
  duplicates?: DuplicatePolicy;
}
