/**
 * EvidenceBridge — sub-plan 04 §1.7.
 *
 * The bridge is a thin adapter a host installs on an evidence store to
 * observe `put` / `stale` / `refresh` events. Trust never imports the
 * host's data model; the host writes a bridge that translates events
 * into its own calls (e.g., context store's `add` of an `evidence_ref`).
 */

import type { EvidenceRecord, StaleMarker } from "./schema.js";
import type { EvidenceStore, StalenessReport, Unsubscribe } from "./store.js";

export interface EvidenceBridge {
  onEvidencePut?(record: EvidenceRecord): void | Promise<void>;
  onEvidenceStale?(id: string, marker: StaleMarker): void | Promise<void>;
  onEvidenceRefresh?(report: StalenessReport): void | Promise<void>;
}

export function attachBridge(store: EvidenceStore, bridge: EvidenceBridge): Unsubscribe {
  const unsubs: Unsubscribe[] = [];
  if (bridge.onEvidencePut) {
    unsubs.push(store.on("put", bridge.onEvidencePut.bind(bridge)));
  }
  if (bridge.onEvidenceStale) {
    const handler = bridge.onEvidenceStale.bind(bridge);
    unsubs.push(store.on("stale", (payload) => handler(payload.id, payload.marker)));
  }
  if (bridge.onEvidenceRefresh) {
    unsubs.push(store.on("refresh", bridge.onEvidenceRefresh.bind(bridge)));
  }
  return () => {
    for (const u of unsubs) u();
  };
}
