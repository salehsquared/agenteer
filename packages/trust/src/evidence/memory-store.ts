/**
 * MemoryEvidenceStore — tests and ephemeral scripts.
 *
 * Implements the full EvidenceStore surface with in-memory state. Honors
 * `duplicates` mode. Event hooks fire synchronously before return so
 * EvidenceBridge tests can observe reliably.
 */

import type {
  EvidenceEventKind,
  EvidenceFilter,
  EvidencePutInput,
  EvidenceStore,
  EvidenceStoreEventMap,
  EvidenceStoreOptions,
  StalenessReport,
  Unsubscribe,
} from "./store.js";
import {
  type EvidenceRecord,
  type StaleMarker,
  EvidenceRecordSchema,
} from "./schema.js";
import { generateEvidenceId, nextDedupeSuffix } from "./id.js";
import { createHash } from "node:crypto";

export class MemoryEvidenceStore implements EvidenceStore {
  private readonly byId = new Map<string, EvidenceRecord>();
  private readonly order: string[] = [];
  private readonly duplicates: "distinct" | "dedupe";
  private readonly listeners: {
    [K in EvidenceEventKind]: Array<(p: EvidenceStoreEventMap[K]) => void | Promise<void>>;
  } = { put: [], stale: [], refresh: [] };

  constructor(options: EvidenceStoreOptions = {}) {
    this.duplicates = options.duplicates ?? "distinct";
  }

  async put(input: EvidencePutInput): Promise<EvidenceRecord> {
    const id = input.id ?? this.computeId(input);
    const existing = this.byId.get(id);
    if (existing && this.duplicates === "dedupe") {
      return existing;
    }
    const finalId =
      existing && this.duplicates === "distinct"
        ? nextDedupeSuffix(id, new Set(this.byId.keys()))
        : id;

    const draft: EvidenceRecord = {
      evidence_version: 1,
      id: finalId,
      claim_refs: input.claim_refs ?? [],
      run: input.run,
      tool: input.tool,
      result: input.result,
      ...(input.artifacts ? { artifacts: input.artifacts } : {}),
      ...(input.kind ? { kind: input.kind } : {}),
      stale: input.stale ?? false,
      stale_markers: input.stale_markers ?? [],
    };
    // Strict validate to match persistent stores' contract.
    const record = EvidenceRecordSchema.parse(draft);
    this.byId.set(finalId, record);
    this.order.push(finalId);
    await this.fire("put", record);
    return record;
  }

  async get(id: string): Promise<EvidenceRecord | null> {
    return this.byId.get(id) ?? null;
  }

  async list(filter?: EvidenceFilter): Promise<EvidenceRecord[]> {
    const out: EvidenceRecord[] = [];
    for (const id of this.order) {
      const rec = this.byId.get(id)!;
      if (matches(rec, filter)) out.push(rec);
    }
    return out.sort((a, b) => a.run.timestamp.localeCompare(b.run.timestamp));
  }

  async queryByClaim(claim: { type: EvidenceRecord["claim_refs"][number]["type"]; id: string }): Promise<EvidenceRecord[]> {
    return (await this.list()).filter((r) =>
      r.claim_refs.some((c) => c.type === claim.type && c.id === claim.id),
    );
  }

  async markStale(id: string, marker: Omit<StaleMarker, "at">): Promise<void> {
    const rec = this.byId.get(id);
    if (!rec) throw new Error(`markStale: unknown evidence ${id}`);
    const full: StaleMarker = { at: new Date().toISOString(), ...marker };
    const last = rec.stale_markers[rec.stale_markers.length - 1];
    if (!last || last.reason !== full.reason || last.by !== full.by || last.detail !== full.detail) {
      rec.stale_markers.push(full);
      rec.stale = true;
    }
    await this.fire("stale", { id, marker: full });
  }

  async markAllStale(filter?: EvidenceFilter, marker?: Partial<StaleMarker>): Promise<number> {
    const records = await this.list(filter);
    let count = 0;
    for (const r of records) {
      if (!r.stale) {
        const m: Omit<StaleMarker, "at"> = {
          by: marker?.by ?? "system",
          reason: marker?.reason ?? "upstream_changed",
          ...(marker?.detail ? { detail: marker.detail } : {}),
        };
        await this.markStale(r.id, m);
        count += 1;
      }
    }
    return count;
  }

  async refreshStaleness(): Promise<StalenessReport> {
    const stale = (await this.list()).filter((r) => r.stale);
    const claimMap = new Map<string, { type: EvidenceRecord["claim_refs"][number]["type"]; id: string; evidenceIds: string[] }>();
    for (const rec of stale) {
      for (const ref of rec.claim_refs) {
        const key = `${ref.type}:${ref.id}`;
        const entry = claimMap.get(key) ?? { ...ref, evidenceIds: [] };
        entry.evidenceIds.push(rec.id);
        claimMap.set(key, entry);
      }
    }
    const report: StalenessReport = {
      stale_ids: stale.map((r) => r.id),
      claim_refs: Array.from(claimMap.values()),
    };
    await this.fire("refresh", report);
    return report;
  }

  on<K extends EvidenceEventKind>(
    event: K,
    handler: (payload: EvidenceStoreEventMap[K]) => void | Promise<void>,
  ): Unsubscribe {
    const list = this.listeners[event] as Array<(p: EvidenceStoreEventMap[K]) => void | Promise<void>>;
    list.push(handler);
    return () => {
      const i = list.indexOf(handler);
      if (i >= 0) list.splice(i, 1);
    };
  }

  private async fire<K extends EvidenceEventKind>(
    event: K,
    payload: EvidenceStoreEventMap[K],
  ): Promise<void> {
    for (const h of [...this.listeners[event]]) {
      try {
        await h(payload);
      } catch {
        // bridge errors are non-fatal for the store
      }
    }
  }

  private computeId(input: EvidencePutInput): string {
    return generateEvidenceId({
      command: input.tool.command,
      verdict: input.result.verdict,
      timestamp: input.run.timestamp,
      ...(input.run.node_id !== undefined ? { nodeId: input.run.node_id } : {}),
      ...(input.run.node_run_id !== undefined ? { nodeRunId: input.run.node_run_id } : {}),
      ...(input.artifacts?.content_hash !== undefined
        ? { contentHash: input.artifacts.content_hash }
        : {}),
    });
  }
}

function matches(record: EvidenceRecord, filter?: EvidenceFilter): boolean {
  if (!filter) return true;
  if (filter.kinds && !(record.kind && filter.kinds.includes(record.kind))) return false;
  if (filter.verdicts && !filter.verdicts.includes(record.result.verdict)) return false;
  if (filter.since && record.run.timestamp < filter.since) return false;
  if (filter.until && record.run.timestamp > filter.until) return false;
  if (filter.nodeId && record.run.node_id !== filter.nodeId) return false;
  if (filter.claim) {
    const hit = record.claim_refs.some(
      (r) => r.type === filter.claim!.type && r.id === filter.claim!.id,
    );
    if (!hit) return false;
  }
  const wantStale = filter.stale ?? "include";
  if (wantStale === "only" && !record.stale) return false;
  if (wantStale === "exclude" && record.stale) return false;
  return true;
}

/** Compute the sha256 content hash convention: `sha256:<hex>`. */
export function computeContentHash(bytes: string | Buffer): string {
  const hex = createHash("sha256").update(bytes).digest("hex");
  return `sha256:${hex}`;
}
