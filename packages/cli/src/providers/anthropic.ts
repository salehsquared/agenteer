/**
 * Anthropic `ProviderLike` adapter. Uses `fetch` directly — no SDK
 * dependency — so upgrades track API revisions, not SDK releases.
 *
 * Supports both plain-text `generate` (for text-parse-retry fallbacks) and
 * native structured output via `tool_use` (preferred for claude-*).
 *
 * Auth: `ANTHROPIC_API_KEY` env var, or `apiKey` option.
 * Docs: https://docs.anthropic.com/en/api/messages
 */

import type { NativeStructuredOpts, ProviderLike } from "@agenteer/trust/structured";
import { zodToJsonSchema } from "../util/zod-to-json-schema.js";

const DEFAULT_BASE = "https://api.anthropic.com/v1";
const DEFAULT_VERSION = "2023-06-01";
const DEFAULT_MAX_TOKENS = 4096;

export interface AnthropicProviderOptions {
  modelId: string;
  apiKey?: string;
  baseUrl?: string;
  apiVersion?: string;
  maxTokens?: number;
  /** Inject a fetch impl (tests). Defaults to global `fetch`. */
  fetchImpl?: typeof fetch;
}

interface AnthropicMessageResponse {
  content: Array<
    | { type: "text"; text: string }
    | { type: "tool_use"; id: string; name: string; input: unknown }
    | { type: string; [k: string]: unknown }
  >;
  stop_reason?: string;
}

export class AnthropicProvider implements ProviderLike {
  readonly modelId: string;
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly apiVersion: string;
  private readonly maxTokens: number;
  private readonly fetchImpl: typeof fetch;

  constructor(opts: AnthropicProviderOptions) {
    this.modelId = opts.modelId;
    const key = opts.apiKey ?? process.env["ANTHROPIC_API_KEY"];
    if (!key) {
      throw new Error(
        "AnthropicProvider: missing ANTHROPIC_API_KEY (or pass apiKey option).",
      );
    }
    this.apiKey = key;
    this.baseUrl = opts.baseUrl ?? DEFAULT_BASE;
    this.apiVersion = opts.apiVersion ?? DEFAULT_VERSION;
    this.maxTokens = opts.maxTokens ?? DEFAULT_MAX_TOKENS;
    this.fetchImpl = opts.fetchImpl ?? fetch;
  }

  async generate(
    system: string,
    user: string,
    signal?: AbortSignal,
    temperature?: number,
  ): Promise<string> {
    const body = {
      model: this.modelId,
      max_tokens: this.maxTokens,
      ...(system ? { system } : {}),
      messages: [{ role: "user", content: user }],
      ...(temperature !== undefined ? { temperature } : {}),
    };
    const res = await this.call<AnthropicMessageResponse>(body, signal);
    const first = res.content.find(
      (c): c is { type: "text"; text: string } => c.type === "text",
    );
    if (!first) throw new Error("AnthropicProvider: empty text response");
    return first.text;
  }

  async generateStructured<T>(opts: NativeStructuredOpts<T>): Promise<T> {
    const schema = opts.jsonSchema ?? zodToJsonSchema(opts.schema);
    const body = {
      model: this.modelId,
      max_tokens: this.maxTokens,
      ...(opts.systemPrompt ? { system: opts.systemPrompt } : {}),
      messages: [{ role: "user", content: opts.userPrompt }],
      ...(opts.temperature !== undefined ? { temperature: opts.temperature } : {}),
      tools: [
        {
          name: opts.schemaName,
          description: `Return data for schema: ${opts.schemaName}`,
          input_schema: schema,
        },
      ],
      tool_choice: { type: "tool", name: opts.schemaName },
    };
    const res = await this.call<AnthropicMessageResponse>(body, opts.signal);
    const use = res.content.find(
      (c): c is { type: "tool_use"; id: string; name: string; input: unknown } =>
        c.type === "tool_use",
    );
    if (!use) throw new Error("AnthropicProvider: missing tool_use block");
    const parsed = opts.schema.safeParse(use.input);
    if (!parsed.success) {
      throw new Error(
        `AnthropicProvider: tool_use failed schema: ${parsed.error.message}`,
      );
    }
    return parsed.data;
  }

  private async call<R>(body: unknown, signal?: AbortSignal): Promise<R> {
    const url = `${this.baseUrl}/messages`;
    const res = await this.fetchImpl(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": this.apiKey,
        "anthropic-version": this.apiVersion,
      },
      body: JSON.stringify(body),
      ...(signal ? { signal } : {}),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`AnthropicProvider: ${res.status} ${res.statusText}: ${text}`);
    }
    return (await res.json()) as R;
  }
}
