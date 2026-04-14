/**
 * ModelProvider — minimal surface the runtime uses to dispatch `callModel`.
 *
 * The full structured-output wrapper (Anthropic tool_use / OpenAI
 * json_schema with text-parse fallback + retry) lives in
 * `@agenteer/trust/structured`. Production users wire a `ProviderLike`
 * (raw LLM access) through `StructuredModelProvider` which uses trust's
 * `StructuredProvider` internally. `MockModelProvider` remains the fast
 * path for deterministic tests.
 */

import type { z } from "zod";
import {
  StructuredProvider,
  type ProviderLike,
  type StructuredGenerateOpts,
} from "@agenteer/trust/structured";

export interface ModelCallDispatch<T = unknown> {
  readonly model_id: string;
  readonly prompt: string;
  readonly system?: string;
  readonly schema?: z.ZodType<T>;
  readonly temperature?: number;
  readonly max_tokens?: number;
  readonly signal?: AbortSignal;
}

export interface ModelCallDispatchResult<T = unknown> {
  readonly value: T;
  readonly model: string;
  readonly tokens: { prompt: number; completion: number };
  readonly method: "native" | "text_parse" | "mock";
}

export interface ModelProvider {
  /** Whether this provider handles this model id. */
  supports(model_id: string): boolean;
  /** Do the call. Throws on unrecoverable error. */
  dispatch<T>(req: ModelCallDispatch<T>): Promise<ModelCallDispatchResult<T>>;
}

/**
 * Test provider: seed a map of `model_id → response function`. Matches
 * simply by id. Throws "no handler" otherwise.
 */
export class MockModelProvider implements ModelProvider {
  private readonly handlers: Map<string, (req: ModelCallDispatch<unknown>) => unknown>;

  constructor(handlers: Record<string, (req: ModelCallDispatch<unknown>) => unknown>) {
    this.handlers = new Map(Object.entries(handlers));
  }

  supports(model_id: string): boolean {
    return this.handlers.has(model_id);
  }

  async dispatch<T>(req: ModelCallDispatch<T>): Promise<ModelCallDispatchResult<T>> {
    const handler = this.handlers.get(req.model_id);
    if (!handler) {
      throw new Error(`MockModelProvider: no handler for model '${req.model_id}'`);
    }
    const value = handler(req as ModelCallDispatch<unknown>) as T;
    if (req.schema) {
      const parsed = req.schema.safeParse(value);
      if (!parsed.success) {
        throw new Error(
          `MockModelProvider: response failed schema for '${req.model_id}': ${parsed.error.message}`,
        );
      }
    }
    return {
      value,
      model: req.model_id,
      tokens: { prompt: 0, completion: 0 },
      method: "mock",
    };
  }
}

/**
 * Router provider — dispatches to the first sub-provider whose `supports`
 * returns true. Useful when a workflow is wired with one real provider
 * for real models and a mock for deterministic test fixtures.
 */
export class RoutingModelProvider implements ModelProvider {
  constructor(private readonly providers: ReadonlyArray<ModelProvider>) {}
  supports(model_id: string): boolean {
    return this.providers.some((p) => p.supports(model_id));
  }
  async dispatch<T>(req: ModelCallDispatch<T>): Promise<ModelCallDispatchResult<T>> {
    for (const p of this.providers) {
      if (p.supports(req.model_id)) return p.dispatch(req);
    }
    throw new Error(`RoutingModelProvider: no provider supports '${req.model_id}'`);
  }
}

/**
 * Bridges a raw `ProviderLike` (from `@agenteer/trust/structured`) into
 * the runtime's `ModelProvider` surface via `StructuredProvider`. Gives
 * stdlib nodes (e.g. `llm_call`) structured-output retry + native-first
 * dispatch without each node wiring the wrapper itself.
 */
export class StructuredModelProvider implements ModelProvider {
  readonly #structured: StructuredProvider;
  readonly #modelId: string;

  constructor(provider: ProviderLike) {
    this.#structured = new StructuredProvider(provider);
    this.#modelId = provider.modelId;
  }

  supports(model_id: string): boolean {
    return this.#modelId === model_id;
  }

  async dispatch<T>(req: ModelCallDispatch<T>): Promise<ModelCallDispatchResult<T>> {
    const opts: StructuredGenerateOpts<T> = {
      systemPrompt: req.system ?? "",
      userPrompt: req.prompt,
      schema: (req.schema ??
        (await import("zod")).z.unknown()) as NonNullable<typeof req.schema>,
      schemaName: "model_call",
      ...(req.temperature !== undefined ? { temperature: req.temperature } : {}),
      ...(req.max_tokens !== undefined ? { max_tokens: req.max_tokens } : {}),
      ...(req.signal ? { signal: req.signal } : {}),
    };
    const value = await this.#structured.generate(opts);
    return {
      value,
      model: this.#modelId,
      tokens: { prompt: 0, completion: 0 },
      method: this.#structured.lastMethod === "text_parse" ? "text_parse" : "native",
    };
  }
}
