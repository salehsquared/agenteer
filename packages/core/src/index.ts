// Public surface for @agenteer/core (M2).

export type {
  Node,
  NodeFactory,
  NodeManifest,
  NodeResult,
  NodeSpawn,
  JoinMode,
  CtxPatch,
  CtxArtifactMarker,
  CtxGrant,
  EvidenceDelta,
  NodeRuntimeHandle,
  NodeLineage,
  NodeInput,
  ModelCallRequest,
  ModelCallResult,
} from "./node/types.js";

export { asArtifact, isArtifactMarker } from "./node/types.js";

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

export { FileContextStore, type FileContextStoreOptions } from "./context/file-store.js";

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
  makeManifest,
} from "./runtime/runtime.js";

export { applyPatch, type ApplyPatchContext, type ApplyPatchOutcome } from "./runtime/patch.js";

export {
  type ModelProvider,
  type ModelCallDispatch,
  type ModelCallDispatchResult,
  MockModelProvider,
  RoutingModelProvider,
  StructuredModelProvider,
} from "./runtime/providers.js";

export {
  type ActionRegistry,
  type DispatchContext,
  type ToolHandler,
  type ToolRegistry,
  DispatchError,
  StdActionRegistry,
  InMemoryToolRegistry,
} from "./runtime/dispatch.js";

// Permissions — sub-plan 02.
export {
  RESOURCE_TYPES,
  type ResourceType,
  type Capability,
  type ParsedCapability,
  type CapabilitySet,
  type SubsetResult,
  type AuthorizeSpawnArgs,
  type AuthorizeSpawnResult,
  type AuthorizeSpawnAllow,
  type AuthorizeSpawnDeny,
  type Operation,
  CapabilityParseError,
  OperationDenied,
  DenylistViolation,
  parseCapability,
  parseCapabilitySet,
  capabilitySet,
  emptyCapabilitySet,
  isSubset,
  intersect as intersectCapabilities,
  covers,
  capabilityCoversOperation,
  authorizeSpawn,
  authorizeOperation,
  isOperationAllowed,
  assertNotDenied,
  isDenied,
  rawsOf,
  unsafeCapability,
} from "./permissions/index.js";

// Manifest — sub-plan 02.
export {
  NodeManifestSchema,
  validateManifest,
  tryValidateManifest,
  ManifestValidationError,
  type NodeManifestInput,
} from "./manifest/index.js";

export {
  type EvidenceStore,
  type EvidenceRecord,
  type EvidencePutInput,
  type EvidenceKind,
  type EvidenceVerdict,
  type StaleMarker as EvidenceStaleMarker,
  type CollectFromNodeRunInput,
  MemoryEvidenceSink,
} from "./evidence/sink.js";

export { newCorrelationId, newNodeRunId, newSessionId } from "./util/ids.js";

// Session persistence + resume (M5).
export {
  type SessionState,
  type SessionStatus,
  type PendingPrompt,
  type UserAnswer,
  type RootSpawnSnapshot,
  SessionStateSchema,
  createSession,
  loadSession,
  saveSession,
  updateSession,
  setSessionStatus,
  recordPendingPrompt,
  recordAnswer,
  sessionStatePath,
  sessionEventsPath,
  sessionEvidenceDir,
  SessionRecorder,
  type SessionRecorderOptions,
  recordedAnswerResolver,
  type RecordedAnswerResolver,
} from "./session/index.js";
