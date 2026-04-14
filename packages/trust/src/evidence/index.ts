export {
  type EvidenceRecord,
  type EvidenceRecordInput,
  type EvidenceKind,
  type ClaimType,
  type ClaimRef,
  type StaleMarker,
  EvidenceRecordSchema,
  EvidenceKindSchema,
  ClaimTypeSchema,
  ClaimRefSchema,
  StaleMarkerSchema,
} from "./schema.js";

export { generateEvidenceId, nextDedupeSuffix } from "./id.js";

export {
  type EvidenceStore,
  type EvidenceStoreOptions,
  type DuplicatePolicy,
  type EvidenceFilter,
  type EvidencePutInput,
  type StalenessReport,
  type EvidenceEventKind,
  type EvidenceStoreEventMap,
  type Unsubscribe,
} from "./store.js";

export { MemoryEvidenceStore, computeContentHash } from "./memory-store.js";
export { YamlEvidenceStore, type YamlEvidenceStoreOptions } from "./yaml-store.js";

export {
  collectFromNodeRun,
  collectFromGateCheck,
  collectFromHookResult,
  type CollectFromNodeRunInput,
} from "./collect.js";

export { type EvidenceBridge, attachBridge } from "./bridge.js";
