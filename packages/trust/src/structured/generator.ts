/**
 * StructuredProvider — native-first with text-parse-retry fallback
 * (sub-plan 04 §2.1–§2.2). Ported from OpenEngine's `StructuredProvider`
 * with the framework's naming.
 */

import { parse as parseYaml } from "yaml";
import { z } from "zod";
import { StructuredOutputError } from "./errors.js";
import {
  inferNativeMethod,
  type ProviderLike,
  type StructuredOutputMethod,
} from "./provider.js";
import {
  formatZodErrors,
  schemaToPromptDescription,
  stripFences,
} from "./schema-to-prompt.js";

export interface StructuredGenerateOpts<T> {
  readonly systemPrompt: string;
  readonly userPrompt: string;
  readonly schema: z.ZodType<T>;
  readonly schemaName: string;
  readonly maxRetries?: number;
  readonly format?: "yaml" | "json";
  readonly signal?: AbortSignal;
  readonly temperature?: number;
}

export interface StructuredGenerator {
  generate<T>(opts: StructuredGenerateOpts<T>): Promise<T>;
  readonly modelId?: string;
  readonly apiCallCount: number;
  readonly lastMethod?: StructuredOutputMethod;
}

export class StructuredProvider implements StructuredGenerator {
  #provider: ProviderLike;
  #apiCallCount = 0;
  #lastMethod?: StructuredOutputMethod;

  constructor(provider: ProviderLike) {
    this.#provider = provider;
  }

  get modelId(): string {
    return this.#provider.modelId;
  }

  get apiCallCount(): number {
    return this.#apiCallCount;
  }

  get lastMethod(): StructuredOutputMethod | undefined {
    return this.#lastMethod;
  }

  async generate<T>(opts: StructuredGenerateOpts<T>): Promise<T> {
    if (this.#provider.generateStructured) {
      try {
        this.#apiCallCount += 1;
        const jsonSchema = z.toJSONSchema(opts.schema) as Record<string, unknown>;
        const result = await this.#provider.generateStructured<T>({
          systemPrompt: opts.systemPrompt,
          userPrompt: opts.userPrompt,
          schema: opts.schema,
          schemaName: opts.schemaName,
          jsonSchema,
          ...(opts.signal ? { signal: opts.signal } : {}),
          ...(opts.temperature !== undefined ? { temperature: opts.temperature } : {}),
        });
        // Validate even the native path; native tool-use can drift over time.
        const parse = opts.schema.safeParse(result);
        if (parse.success) {
          this.#lastMethod = inferNativeMethod(this.#provider);
          return parse.data;
        }
        // Fall through to text-parse-retry, carrying the validation error.
      } catch {
        // Fall through.
      }
    }
    return await this.#textParseRetry(opts);
  }

  async #textParseRetry<T>(opts: StructuredGenerateOpts<T>): Promise<T> {
    const {
      systemPrompt,
      userPrompt,
      schema,
      schemaName,
      maxRetries = 2,
      format = "yaml",
    } = opts;

    const schemaDesc = schemaToPromptDescription(schema);
    const augmented = `${systemPrompt}\n\nRespond with a single ${format} block conforming to this schema:\n${schemaDesc}`;

    let lastError: z.ZodError | undefined;
    let lastRaw = "";

    for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
      if (opts.signal?.aborted) throw new Error("structured_output_aborted");
      const userMsg =
        attempt === 0
          ? userPrompt
          : `Your previous output failed validation:\n${formatZodErrors(lastError!)}\n\nOriginal request:\n${userPrompt}\n\nFix and try again.`;

      this.#apiCallCount += 1;
      const raw = await this.#provider.generate(augmented, userMsg, opts.signal, opts.temperature);
      lastRaw = raw;
      const stripped = stripFences(raw);

      let parsed: unknown;
      try {
        parsed = format === "yaml" ? parseYaml(stripped) : JSON.parse(stripped);
      } catch {
        lastError = syntheticParseError(format, stripped);
        continue;
      }

      const result = schema.safeParse(parsed);
      if (result.success) {
        this.#lastMethod = "text_parse";
        return result.data;
      }
      lastError = result.error;
    }

    throw new StructuredOutputError(schemaName, lastError!, lastRaw);
  }
}

function syntheticParseError(format: string, raw: string): z.ZodError {
  const message = `failed to parse ${format}: ${raw.slice(0, 200)}`;
  return new z.ZodError([
    {
      code: "custom",
      path: [],
      message,
      input: raw,
    },
  ]);
}
