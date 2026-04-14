export {
  type ProviderLike,
  type NativeStructuredOpts,
  type StructuredOutputMethod,
  inferNativeMethod,
} from "./provider.js";

export {
  StructuredProvider,
  type StructuredGenerator,
  type StructuredGenerateOpts,
} from "./generator.js";

export { StructuredOutputError } from "./errors.js";

export {
  schemaToPromptDescription,
  formatZodErrors,
  stripFences,
} from "./schema-to-prompt.js";
