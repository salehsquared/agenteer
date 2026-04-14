/**
 * A5: ajv-backed JSON Schema → Zod bridge.
 *
 * Sub-plan 02 §2 notes: "JSON-Schema export (ajv at runtime) is deferred
 * to the registry work." This module is that work. Publishers who do not
 * ship a Zod schema can author `input_schema` / `output_schema` in
 * `framework.json` as plain JSON Schema objects; we compile them via
 * ajv and wrap the result in a `z.ZodType`-compatible shape so the core
 * runtime's `safeParse`-based validation path is unchanged.
 *
 * Why not swap the runtime to a validator interface? `node.inputSchema`
 * is typed as `z.ZodType<T>` across the stdlib + every existing test.
 * Wrapping ajv inside a Zod schema keeps every caller unchanged and
 * gives us native Zod error shapes for the downstream consumer.
 */

// Ajv ships both `export class Ajv` (named) and `export default Ajv`. Named
// import works across TS/ESM/CJS consumers. ajv-formats is CJS-default;
// some bundlers wrap it in `{ default: fn }`, so we normalize.
import { Ajv, type ErrorObject, type ValidateFunction } from "ajv";
import * as addFormatsNs from "ajv-formats";
type AddFormatsFn = (ajv: Ajv) => Ajv;
const addFormats: AddFormatsFn =
  ((addFormatsNs as unknown as { default?: AddFormatsFn }).default ??
    (addFormatsNs as unknown as AddFormatsFn));
type AjvType = InstanceType<typeof Ajv>;
import { z } from "zod";
import type { NodeManifest } from "@agenteer/core";

/** Ajv config defensibly permissive: allow unknown keywords + format hints. */
let sharedAjv: AjvType | null = null;
function ajvInstance(): AjvType {
  if (sharedAjv) return sharedAjv;
  const inst = new Ajv({
    strict: false,
    allErrors: true,
    useDefaults: true,
  });
  addFormats(inst);
  sharedAjv = inst;
  return inst;
}

/**
 * Compile a JSON Schema object into a Zod schema whose `safeParse`
 * delegates to ajv. Ajv errors become Zod issues with paths preserved
 * so the runtime's "input_schema_violation" message shows the offending
 * field, not a generic "JSON schema failed".
 */
export function jsonSchemaToZod<T = unknown>(
  schema: Record<string, unknown>,
): z.ZodType<T> {
  const validate: ValidateFunction = ajvInstance().compile(schema);
  return z.unknown().superRefine((val, ctx) => {
    if (validate(val)) return;
    for (const err of validate.errors ?? []) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: formatAjvError(err),
        path: ajvPath(err),
      });
    }
  }) as unknown as z.ZodType<T>;
}

/**
 * Derive the input/output validators for a manifest loaded from a
 * published package. Returns `undefined` for a side when the manifest
 * doesn't ship a schema (runtime treats this as "trust caller").
 */
export function compileNodeSchemas(manifest: NodeManifest): {
  inputSchema?: z.ZodType<unknown>;
  outputSchema?: z.ZodType<unknown>;
} {
  const out: { inputSchema?: z.ZodType<unknown>; outputSchema?: z.ZodType<unknown> } = {};
  if (isPlainJsonSchema(manifest.input_schema)) {
    out.inputSchema = jsonSchemaToZod(manifest.input_schema);
  }
  if (isPlainJsonSchema(manifest.output_schema)) {
    out.outputSchema = jsonSchemaToZod(manifest.output_schema);
  }
  return out;
}

function isPlainJsonSchema(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function formatAjvError(err: ErrorObject): string {
  const at = err.instancePath || "/";
  const want = err.schemaPath ? ` (schema ${err.schemaPath})` : "";
  const extra =
    err.params && Object.keys(err.params).length > 0
      ? ` — ${JSON.stringify(err.params)}`
      : "";
  return `${at} ${err.message ?? "invalid"}${want}${extra}`;
}

function ajvPath(err: ErrorObject): (string | number)[] {
  // instancePath is a JSON pointer like "/foo/0/bar". Convert to segments.
  const raw = err.instancePath;
  if (!raw) return [];
  return raw
    .split("/")
    .slice(1)
    .map((seg) => {
      const n = Number(seg);
      return Number.isInteger(n) && String(n) === seg ? n : seg;
    });
}
