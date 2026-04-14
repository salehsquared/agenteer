// Public surface for @agenteer/core (M1).

export type {
  Node,
  NodeFactory,
  NodeManifest,
  NodeResult,
  NodeSpawn,
  JoinMode,
  CtxPatch,
  CtxGrant,
  EvidenceDelta,
  NodeRuntimeHandle,
  NodeLineage,
  NodeInput,
  ModelCallRequest,
  ModelCallResult,
} from "./node/types.js";

export {
  InMemoryNodeRegistry,
  type NodeRegistry,
  type NodeManifestEntry,
} from "./node/registry.js";

export type {
  ContextItem,
  ContextItemContent,
  ContextItemType,
  ContextRef,
  RefKind,
  RefTarget,
  Provenance,
  StaleMarker,
  StaleReason,
  Selector,
  SliceSpec,
  MaterializedSlice,
  NewContextItem,
  ReadonlyContextSlice,
} from "./context/types.js";

export {
  InMemoryContextStore,
  type ContextStore,
  type ContextStoreReader,
  type ContextStoreWriter,
  hashItemContent,
} from "./context/store.js";

export { sliceToReadonly } from "./context/slice.js";
export { canonicalize, sha256Hex, itemContentHash, finalizeItem } from "./context/hash.js";

export {
  RuntimeEvents,
  type RuntimeEventMap,
  type RuntimeEventName,
  type NodeResultKind,
} from "./events/events.js";

export {
  Runtime,
  DEFAULT_CAPS,
  type RuntimeOptions,
  type RuntimeOutcome,
  type RuntimeCaps,
  type RootGrants,
  makeManifest,
} from "./runtime/runtime.js";

export { applyPatch, type ApplyPatchContext, type ApplyPatchOutcome } from "./runtime/patch.js";

export {
  type PermissionEnvelope,
  EMPTY_ENVELOPE,
  intersect as intersectEnvelope,
  isSpawnAllowed,
} from "./permissions/envelope.js";

export {
  type EvidenceSink,
  type EvidenceInput,
  type EvidenceRecord,
  type EvidenceVerdict,
  MemoryEvidenceSink,
} from "./evidence/sink.js";

export { newCorrelationId, newNodeRunId, newSessionId } from "./util/ids.js";
