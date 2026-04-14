export {
  RESOURCE_TYPES,
  type ResourceType,
  type Capability,
  type ParsedCapability,
  CapabilityParseError,
  parseCapability,
  parseCapabilitySet,
  unsafeCapability,
} from "./capability.js";

export { covers, pathCovers } from "./cover.js";

export {
  type CapabilitySet,
  type SubsetResult,
  capabilitySet,
  emptyCapabilitySet,
  isSubset,
  intersect,
  capabilityCoversOperation,
  rawsOf,
} from "./subset.js";

export {
  type AuthorizeSpawnArgs,
  type AuthorizeSpawnResult,
  type AuthorizeSpawnAllow,
  type AuthorizeSpawnDeny,
  authorizeSpawn,
} from "./kernel.js";

export {
  type Operation,
  type FsReadOp,
  type FsWriteOp,
  type FsDeleteOp,
  type NetHttpOp,
  type ShellExecOp,
  type ModelOp,
  type SpawnOp,
  type ContextOp,
  OperationDenied,
  authorizeOperation,
  isOperationAllowed,
} from "./operation.js";

export { assertNotDenied, isDenied, DenylistViolation } from "./denylist.js";

export { augmentRequired, DynamicActionError } from "./dynamic.js";
