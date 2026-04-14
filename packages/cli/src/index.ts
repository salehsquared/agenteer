/**
 * Public surface of `@agenteer/cli`. Consumers can import the library
 * primitives (workflow runner, provider factory, ctx/inspect helpers)
 * without depending on the bin script.
 */

export {
  runWorkflow,
  WorkflowSpecSchema,
  type WorkflowSpec,
  type RunWorkflowOptions,
  type RunWorkflowResult,
} from "./commands/run.js";

export {
  resumeWorkflow,
  type ResumeWorkflowOptions,
  type ResumeWorkflowResult,
} from "./commands/resume.js";

export {
  ctxList,
  ctxGet,
  ctxLineage,
  ctxDiff,
  type CtxListEntry,
  type CtxDiffResult,
} from "./commands/ctx.js";

export {
  inspectSession,
  renderInspectReport,
  type InspectReport,
} from "./commands/inspect.js";

export {
  buildStdlibRegistry,
  buildRuntime,
  sessionResolvers,
  type BuildRegistryOptions,
  type BuildRuntimeOptions,
} from "./workflow.js";

export {
  AnthropicProvider,
  OpenAIProvider,
  buildProviderForModels,
  type BuildProviderOptions,
} from "./providers/index.js";

export {
  promptForAnswer,
  stdinApprovalResolver,
  stdinAskUserResolver,
} from "./resolvers/stdin-prompt.js";

// Registry commands (M6).
export { publishCommand, renderPublishResult } from "./commands/publish.js";
export { installCommand, renderInstallResult, cliConfirm } from "./commands/install.js";
export { searchCommand, renderSearchHits } from "./commands/search.js";
