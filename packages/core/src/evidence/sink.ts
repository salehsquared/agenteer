/**
 * Evidence adapter — core consumes `@agenteer/trust/evidence`.
 *
 * Core does not own an evidence schema or store. The runtime constructs
 * records via trust's `collectFromNodeRun` (sub-plan 04 §9.1: "Core
 * imports only trust's interface types for wiring").
 *
 * `MemoryEvidenceSink` preserves the M2 test-ergonomic `.records` array
 * as a synchronous mirror of a `MemoryEvidenceStore`.
 */

import {
  MemoryEvidenceStore,
  type EvidenceStore as TrustEvidenceStore,
  type EvidenceRecord,
  type EvidencePutInput,
  type EvidenceKind,
  type CollectFromNodeRunInput,
  type StaleMarker,
} from "@agenteer/trust/evidence";

export type EvidenceVerdict = EvidenceRecord["result"]["verdict"];
export type EvidenceStore = TrustEvidenceStore;
export type {
  EvidenceRecord,
  EvidencePutInput,
  EvidenceKind,
  CollectFromNodeRunInput,
  StaleMarker,
};

/**
 * Test-ergonomic evidence sink. Extends trust's MemoryEvidenceStore with
 * a synchronous `records` array that mirrors every `put`.
 */
export class MemoryEvidenceSink extends MemoryEvidenceStore {
  readonly records: EvidenceRecord[] = [];

  constructor(options?: ConstructorParameters<typeof MemoryEvidenceStore>[0]) {
    super(options);
    this.on("put", (record) => {
      this.records.push(record);
    });
  }
}
