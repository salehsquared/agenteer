/**
 * OpenAI `ProviderLike` adapter. Uses `fetch` directly — no SDK
 * dependency. Supports native structured output via
 * `response_format: { type: "json_schema" }`, which is preferred for
 * gpt-4o+ and falls back to text-parse-retry on older models.
 *
 * Auth: `OPENAI_API_KEY` env var, or `apiKey` option.
 * Docs: https://platform.openai.com/docs/api-reference/chat
 */

import type { NativeStructuredOpts, ProviderLike } from "@agenteer/trust/structured";
import { zodToJsonSchema } from "../util/zod-to-json-schema.js";

const DEFAULT_BASE = "https://api.openai.com/v1";

export interface OpenAIProviderOptions {
  modelId: string;
  apiKey?: string;
  baseUrl?: string;
  fetchImpl?: typeof fetch;
}

interface OpenAIChatResponse {
  choices: Array<{
    message?: { content?: string | null; refusal?: string | null };
    finish_reason?: string;
  }>;
}

export class OpenAIProvider implements ProviderLike {
  readonly modelId: string;
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;

  constructor(opts: OpenAIProviderOptions) {
    this.modelId = opts.modelId;
    const key = opts.apiKey ?? process.env["OPENAI_API_KEY"];
    if (!key) {
      throw new Error("OpenAIProvider: missing OPENAI_API_KEY (or pass apiKey option).");
    }
    this.apiKey = key;
    this.baseUrl = opts.baseUrl ?? DEFAULT_BASE;
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
      messages: [
        ...(system ? [{ role: "system", content: system }] : []),
        { role: "user", content: user },
      ],
      ...(temperature !== undefined ? { temperature } : {}),
    };
    const res = await this.call<OpenAIChatResponse>(body, signal);
    const text = res.choices[0]?.message?.content;
    if (!text) throw new Error("OpenAIProvider: empty response");
    return text;
  }

  async generateStructured<T>(opts: NativeStructuredOpts<T>): Promise<T> {
    const schema = opts.jsonSchema ?? zodToJsonSchema(opts.schema);
    const body = {
      model: this.modelId,
      messages: [
        ...(opts.systemPrompt ? [{ role: "system", content: opts.systemPrompt }] : []),
        { role: "user", content: opts.userPrompt },
      ],
      ...(opts.temperature !== undefined ? { temperature: opts.temperature } : {}),
      response_format: {
        type: "json_schema",
        json_schema: {
          name: opts.schemaName,
          schema,
          strict: true,
        },
      },
    };
    const res = await this.call<OpenAIChatResponse>(body, opts.signal);
    const text = res.choices[0]?.message?.content;
    if (!text) throw new Error("OpenAIProvider: empty structured response");
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch (err) {
      throw new Error(
        `OpenAIProvider: JSON parse error: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
    const validated = opts.schema.safeParse(parsed);
    if (!validated.success) {
      throw new Error(
        `OpenAIProvider: response failed schema: ${validated.error.message}`,
      );
    }
    return validated.data;
  }

  private async call<R>(body: unknown, signal?: AbortSignal): Promise<R> {
    const url = `${this.baseUrl}/chat/completions`;
    const res = await this.fetchImpl(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify(body),
      ...(signal ? { signal } : {}),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`OpenAIProvider: ${res.status} ${res.statusText}: ${text}`);
    }
    return (await res.json()) as R;
  }
}
