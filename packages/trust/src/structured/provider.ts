/**
 * ProviderLike — the minimal LLM provider interface trust consumes
 * (sub-plan 04 §2.3). Concrete Anthropic / OpenAI adapters live in
 * stdlib or user scripts; trust never imports an SDK.
 *
 * Two optional entry points:
 *   - `generate(system, user, signal?, temperature?)` — plain text.
 *   - `generateStructured<T>(opts)` — native structured output (Anthropic
 *     `tool_use`, OpenAI `json_schema`) when the provider supports it.
 *
 * When `generateStructured` is absent, the wrapper falls back to
 * text-parse-retry over `generate`.
 */

import type { z } from "zod";

export interface NativeStructuredOpts<T> {
  readonly systemPrompt: string;
  readonly userPrompt: string;
  readonly schema: z.ZodType<T>;
  readonly schemaName: string;
  readonly jsonSchema?: Record<string, unknown>;
  readonly signal?: AbortSignal;
  readonly temperature?: number;
}

export interface ProviderLike {
  readonly modelId: string;
  generate(
    system: string,
    user: string,
    signal?: AbortSignal,
    temperature?: number,
  ): Promise<string>;
  generateStructured?<T>(opts: NativeStructuredOpts<T>): Promise<T>;
}

export type StructuredOutputMethod =
  | "native_tool_use"
  | "native_json_schema"
  | "text_parse";

export function inferNativeMethod(provider: ProviderLike): StructuredOutputMethod {
  const id = provider.modelId.toLowerCase();
  if (id.startsWith("claude") || id.includes("anthropic")) return "native_tool_use";
  if (id.startsWith("gpt") || id.includes("openai")) return "native_json_schema";
  return "text_parse";
}
