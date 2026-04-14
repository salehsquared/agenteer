/**
 * `@agenteer/node-json-schema-validate` — deterministic validator (sub-plan 03 §8).
 *
 * Validates a value against a Zod schema in-process. The "JSON Schema"
 * name reflects the published wire contract (sub-plan 02 §2.4); we use
 * Zod as the runtime validator for M2 since all stdlib consumers are
 * TypeScript. ajv-backed JSON-Schema validation lands alongside the
 * registry in M6.
 *
 * R3 note: validators emit `verdict: "fail"` as DATA on output, not as
 * `Failed`. `Failed` is reserved for "couldn't run at all."
 */

import { z } from "zod";
import {
  makeManifest,
  type Node,
  type NodeInput,
  type NodeManifest,
  type NodeResult,
} from "@agenteer/core";

const MANIFEST: NodeManifest = makeManifest({
  id: "@agenteer/node-json-schema-validate",
  name: "json_schema_validate",
  description: "Validate a value against a caller-supplied schema; return verdict + errors.",
  determinism: "deterministic",
  tags: ["validator"],
});

// We accept either a Zod schema reference or a raw "any" schema marker.
// At M2 the common case is Zod; the JSON-Schema path ships later.
const InputSchema = z.object({
  /** Value to validate. */
  value: z.unknown(),
  /** Zod schema (pass a z.ZodType directly through the factory; runtime accepts unknown to satisfy I/O shape). */
  schema: z.unknown(),
});

const ValidationIssueSchema = z.object({
  path: z.array(z.union([z.string(), z.number()])),
  message: z.string(),
  code: z.string().optional(),
});

const OutputSchema = z.object({
  verdict: z.enum(["pass", "fail"]),
  errors: z.array(ValidationIssueSchema),
  value: z.unknown().optional(),
});

type Input = z.infer<typeof InputSchema>;
type Output = z.infer<typeof OutputSchema>;

export function jsonSchemaValidateFactory(): Node<Input, Output> {
  return {
    manifest: MANIFEST,
    inputSchema: InputSchema,
    outputSchema: OutputSchema,
    ctx: [],
    model: null,
    async execute(input: NodeInput<Input>): Promise<NodeResult<Output>> {
      const { value, schema } = input.original;
      if (!isZodType(schema)) {
        return {
          kind: "failed",
          reason: "invalid_input:schema_not_zod",
          retryable: false,
          evidence: { verdict: "fail" },
        };
      }
      const parsed = schema.safeParse(value);
      if (parsed.success) {
        return {
          kind: "output",
          value: { verdict: "pass", errors: [], value: parsed.data },
          evidence: { verdict: "pass" },
        };
      }
      const errors = parsed.error.issues.map((i) => ({
        path: [...i.path] as (string | number)[],
        message: i.message,
        code: i.code,
      }));
      return {
        kind: "output",
        value: { verdict: "fail", errors },
        evidence: { verdict: "fail" },
      };
    },
  };
}

function isZodType(x: unknown): x is z.ZodTypeAny {
  return (
    typeof x === "object" &&
    x !== null &&
    "_def" in (x as object) &&
    typeof (x as { safeParse?: unknown }).safeParse === "function"
  );
}

export const jsonSchemaValidateManifest = MANIFEST;
