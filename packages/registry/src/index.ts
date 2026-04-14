/**
 * `@agenteer/registry` — publish, install, search, pin node packages.
 *
 * See sub-plan 02 §3 for the full design; this module exports the
 * programmatic surface that the CLI `agenteer publish/install/search`
 * subcommands are built on.
 */

export {
  type NpmRunner,
  type NpmPublishOptions,
  type NpmInstallOptions,
  type NpmUninstallOptions,
  type NpmSearchHit,
  type NpmViewResult,
  NpmCommandError,
  DefaultNpmRunner,
} from "./npm-runner.js";

export {
  loadManifestFromPackage,
  canonicalSha256,
  type LoadedManifest,
  type PackageJson,
  MANIFEST_FILENAME,
} from "./manifest-file.js";

export {
  validateNodePackage,
  type PackageValidationResult,
  type PackageValidationIssue,
} from "./validate.js";

export {
  diffPermissions,
  renderPermissionsDiff,
  capsOf,
  capStrings,
  type PermissionsDiff,
} from "./permissions-diff.js";

export {
  provenanceFromView,
  renderProvenanceLine,
  type ProvenanceStatus,
} from "./provenance.js";

export {
  readWorkflowConfig,
  writeWorkflowConfig,
  ensureWorkflowConfig,
  readLockfile,
  writeLockfile,
  recordInstall,
  removeInstall,
  WORKFLOW_CONFIG,
  WORKFLOW_LOCK,
  WorkflowConfigSchema,
  LockFileSchema,
  type WorkflowConfig,
  type WorkflowNodeEntry,
  type LockFile,
  type LockEntry,
} from "./workflow-config.js";

export { publishNode, type PublishOptions, type PublishResult } from "./publish.js";
export { installNode, type InstallOptions, type InstallResult } from "./install.js";
export {
  searchNodes,
  type SearchOptions,
  type SearchHit,
  type CuratedEntry,
} from "./search.js";

// A5: ajv JSON Schema → Zod bridge for non-Zod publishers.
export { jsonSchemaToZod, compileNodeSchemas } from "./ajv-adapter.js";
