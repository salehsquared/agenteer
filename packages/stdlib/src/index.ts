/**
 * @agenteer/stdlib — v1 standard library (M4 complete: 18 nodes).
 *
 *   Primitives (5):  file_read, file_write, shell_exec, llm_call, tool_call
 *   Validators (5):  compile, test_run, regex_check, typecheck, json_schema_validate
 *   Meta (4):        parallel_fanout, cross_check, judge_with_stripped_ctx, repair_loop
 *   Humans (1):      approval_gate          (ask_user deferred to M5)
 *   Planner (1):     default_planner
 *   Context (1):     context_curator        (master plan open #15 — shipped)
 *
 * `registerStdlib` registers M2-shape nodes (file_read/write/shell_exec/
 * json_schema_validate/llm_call). M4 nodes with external dependencies
 * (provider/resolver/tool registry) are exported as factories for the
 * caller to wire and register individually.
 */

import type { NodeRegistry } from "@agenteer/core";

// Primitives
import { fileReadFactory, fileReadManifest } from "./primitives/file_read.js";
import { fileWriteFactory, fileWriteManifest } from "./primitives/file_write.js";
import { shellExecFactory, shellExecManifest } from "./primitives/shell_exec.js";
import { llmCallFactory, llmCallManifest } from "./primitives/llm_call.js";
import { toolCallFactory, toolCallManifest } from "./primitives/tool_call.js";

// Validators
import {
  jsonSchemaValidateFactory,
  jsonSchemaValidateManifest,
} from "./validators/json_schema_validate.js";
import { regexCheckFactory, regexCheckManifest } from "./validators/regex_check.js";
import { compileFactory, compileManifest } from "./validators/compile.js";
import { testRunFactory, testRunManifest } from "./validators/test_run.js";
import { typecheckFactory, typecheckManifest } from "./validators/typecheck.js";

// Meta
import { parallelFanoutFactory, parallelFanoutManifest } from "./meta/parallel_fanout.js";
import { crossCheckFactory, crossCheckManifest } from "./meta/cross_check.js";
import {
  judgeWithStrippedCtxFactory,
  judgeWithStrippedCtxManifest,
} from "./meta/judge_with_stripped_ctx.js";
import { repairLoopFactory, repairLoopManifest } from "./meta/repair_loop.js";

// Context, humans, planner
import { contextCuratorFactory, contextCuratorManifest } from "./context/context_curator.js";
import { approvalGateFactory, approvalGateManifest } from "./humans/approval_gate.js";
import { defaultPlannerFactory, defaultPlannerManifest } from "./planner/default_planner.js";

export {
  // Primitives
  fileReadFactory,
  fileReadManifest,
  fileWriteFactory,
  fileWriteManifest,
  shellExecFactory,
  shellExecManifest,
  llmCallFactory,
  llmCallManifest,
  toolCallFactory,
  toolCallManifest,
  // Validators
  jsonSchemaValidateFactory,
  jsonSchemaValidateManifest,
  regexCheckFactory,
  regexCheckManifest,
  compileFactory,
  compileManifest,
  testRunFactory,
  testRunManifest,
  typecheckFactory,
  typecheckManifest,
  // Meta
  parallelFanoutFactory,
  parallelFanoutManifest,
  crossCheckFactory,
  crossCheckManifest,
  judgeWithStrippedCtxFactory,
  judgeWithStrippedCtxManifest,
  repairLoopFactory,
  repairLoopManifest,
  // Context / humans / planner
  contextCuratorFactory,
  contextCuratorManifest,
  approvalGateFactory,
  approvalGateManifest,
  defaultPlannerFactory,
  defaultPlannerManifest,
};

export type { CompileAdapter } from "./validators/compile.js";
export type { TestAdapter, TestReport } from "./validators/test_run.js";
export type { ApprovalResolver } from "./humans/approval_gate.js";
export type { ProviderResolver } from "./meta/cross_check.js";
export * from "./shared/index.js";

/**
 * Register M4 nodes that have zero external wiring. Nodes that need a
 * provider resolver, tool registry, approval resolver, or response
 * schema are exported as factories — wire and register them yourself.
 */
export function registerStdlib(registry: NodeRegistry): void {
  // Primitives (except tool_call / llm_call which need wiring)
  registry.register(fileReadManifest, fileReadFactory);
  registry.register(fileWriteManifest, fileWriteFactory);
  registry.register(shellExecManifest, shellExecFactory);
  registry.register(toolCallManifest, toolCallFactory);

  // Validators
  registry.register(jsonSchemaValidateManifest, jsonSchemaValidateFactory);
  registry.register(regexCheckManifest, regexCheckFactory);
  registry.register(compileManifest, compileFactory);
  registry.register(testRunManifest, testRunFactory);
  registry.register(typecheckManifest, typecheckFactory);

  // Meta (parallel_fanout/judge/repair_loop are self-contained)
  registry.register(parallelFanoutManifest, parallelFanoutFactory);
  registry.register(judgeWithStrippedCtxManifest, judgeWithStrippedCtxFactory);
  registry.register(repairLoopManifest, repairLoopFactory);

  // Context + planner
  registry.register(contextCuratorManifest, contextCuratorFactory);
  registry.register(defaultPlannerManifest, defaultPlannerFactory);
}

export const STDLIB_MANIFEST_IDS = [
  fileReadManifest.id,
  fileWriteManifest.id,
  shellExecManifest.id,
  llmCallManifest.id,
  toolCallManifest.id,
  jsonSchemaValidateManifest.id,
  regexCheckManifest.id,
  compileManifest.id,
  testRunManifest.id,
  typecheckManifest.id,
  parallelFanoutManifest.id,
  crossCheckManifest.id,
  judgeWithStrippedCtxManifest.id,
  repairLoopManifest.id,
  contextCuratorManifest.id,
  approvalGateManifest.id,
  defaultPlannerManifest.id,
] as const;
