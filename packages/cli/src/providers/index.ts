/**
 * Provider selection — picks an adapter based on model id.
 *
 *   claude-*, anthropic-*  → AnthropicProvider
 *   gpt-*, openai-*        → OpenAIProvider
 *
 * Wraps each adapter in `StructuredModelProvider` so nodes get native-first
 * structured output with text-parse-retry fallback. Multiple providers are
 * combined via `RoutingModelProvider` so a workflow can mix model families.
 */

import {
  RoutingModelProvider,
  StructuredModelProvider,
  type ModelProvider,
} from "@agenteer/core";
import { AnthropicProvider } from "./anthropic.js";
import { OpenAIProvider } from "./openai.js";

export { AnthropicProvider } from "./anthropic.js";
export { OpenAIProvider } from "./openai.js";

export interface BuildProviderOptions {
  /** Model ids this CLI invocation needs. */
  modelIds: readonly string[];
  /** Optional override for test harnesses. */
  fetchImpl?: typeof fetch;
  anthropicApiKey?: string;
  openaiApiKey?: string;
}

export function buildProviderForModels(opts: BuildProviderOptions): ModelProvider {
  const providers: ModelProvider[] = [];
  for (const id of opts.modelIds) {
    const normalized = id.toLowerCase();
    if (normalized.startsWith("claude") || normalized.startsWith("anthropic")) {
      providers.push(
        new StructuredModelProvider(
          new AnthropicProvider({
            modelId: id,
            ...(opts.anthropicApiKey ? { apiKey: opts.anthropicApiKey } : {}),
            ...(opts.fetchImpl ? { fetchImpl: opts.fetchImpl } : {}),
          }),
        ),
      );
    } else if (normalized.startsWith("gpt") || normalized.startsWith("openai")) {
      providers.push(
        new StructuredModelProvider(
          new OpenAIProvider({
            modelId: id,
            ...(opts.openaiApiKey ? { apiKey: opts.openaiApiKey } : {}),
            ...(opts.fetchImpl ? { fetchImpl: opts.fetchImpl } : {}),
          }),
        ),
      );
    } else {
      throw new Error(
        `buildProviderForModels: unknown model family for id '${id}' (expected claude-*, gpt-*, anthropic-*, or openai-*).`,
      );
    }
  }
  return new RoutingModelProvider(providers);
}
