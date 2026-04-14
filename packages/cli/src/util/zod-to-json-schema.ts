/**
 * Thin wrapper over `z.toJSONSchema` — keeps the provider files free of
 * zod version quirks. Providers need a plain JSON Schema object to pass
 * as `input_schema` (Anthropic) or `response_format.json_schema.schema`
 * (OpenAI).
 */

import { z, type ZodType } from "zod";

export function zodToJsonSchema(schema: ZodType<unknown>): Record<string, unknown> {
  // `z.toJSONSchema` landed in zod 4; we cast because the output type is
  // a JSONSchema but the providers just need `Record<string, unknown>`.
  return z.toJSONSchema(schema) as unknown as Record<string, unknown>;
}
