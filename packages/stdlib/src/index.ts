/**
 * @agenteer/stdlib — seed set (M2).
 *
 * Five nodes: 3 primitives + 1 validator + 1 LLM. Remaining ~13 from
 * sub-plan 03 arrive in M4.
 */

import type { NodeRegistry } from "@agenteer/core";
import { fileReadFactory, fileReadManifest } from "./primitives/file_read.js";
import { fileWriteFactory, fileWriteManifest } from "./primitives/file_write.js";
import { shellExecFactory, shellExecManifest } from "./primitives/shell_exec.js";
import { llmCallFactory, llmCallManifest } from "./primitives/llm_call.js";
import {
  jsonSchemaValidateFactory,
  jsonSchemaValidateManifest,
} from "./validators/json_schema_validate.js";

export {
  fileReadFactory,
  fileReadManifest,
  fileWriteFactory,
  fileWriteManifest,
  shellExecFactory,
  shellExecManifest,
  llmCallFactory,
  llmCallManifest,
  jsonSchemaValidateFactory,
  jsonSchemaValidateManifest,
};

/**
 * Register all M2 stdlib seed nodes into a registry. Callers may also
 * register nodes individually; this helper is the typical case.
 */
export function registerStdlib(registry: NodeRegistry): void {
  registry.register(fileReadManifest, fileReadFactory);
  registry.register(fileWriteManifest, fileWriteFactory);
  registry.register(shellExecManifest, shellExecFactory);
  registry.register(llmCallManifest, llmCallFactory());
  registry.register(jsonSchemaValidateManifest, jsonSchemaValidateFactory);
}

export const STDLIB_MANIFEST_IDS = [
  fileReadManifest.id,
  fileWriteManifest.id,
  shellExecManifest.id,
  llmCallManifest.id,
  jsonSchemaValidateManifest.id,
] as const;
