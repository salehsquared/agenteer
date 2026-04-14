/**
 * Dynamic-action augmentation — master plan §R4.
 *
 * A manifest with `dynamic_actions: true` carries a `dynamic_action_spec`
 * template that synthesizes additional required capabilities from the
 * spawn's input. At authorization time the runtime calls `augmentRequired`
 * to produce the effective (declared + augmented) `required_actions`.
 *
 * Spec grammar is deliberately minimal:
 *   "<capability-string-with-placeholders>"
 *   placeholder = "${input.<path>}"   where <path> is dot-separated
 * Multiple caps are comma-separated in the spec.
 *
 * Examples:
 *   "fs.read:${input.path}"
 *   "model:${input.model_id}"
 *   "net.http:${input.host}/${input.path}"
 */

import { parseCapability, type ParsedCapability } from "./capability.js";

export class DynamicActionError extends Error {
  constructor(readonly spec: string, readonly why: string) {
    super(`dynamic_action_spec error (${spec}): ${why}`);
  }
}

export function augmentRequired(
  declared: readonly ParsedCapability[],
  dynamic_actions: boolean,
  dynamic_action_spec: string | undefined,
  input: unknown,
): ParsedCapability[] {
  if (!dynamic_actions || !dynamic_action_spec) return [...declared];
  const parts = dynamic_action_spec
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  const augmented: ParsedCapability[] = [...declared];
  for (const part of parts) {
    const concrete = substitute(part, input);
    try {
      augmented.push(parseCapability(concrete));
    } catch (err) {
      throw new DynamicActionError(
        part,
        `synthesized cap '${concrete}' invalid: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }
  return augmented;
}

const PLACEHOLDER_RE = /\$\{input\.([a-zA-Z_][a-zA-Z0-9_.]*)\}/g;

function substitute(template: string, input: unknown): string {
  return template.replace(PLACEHOLDER_RE, (_, path: string) => {
    const value = resolvePath(input, path);
    if (value === undefined || value === null) {
      throw new DynamicActionError(template, `input.${path} is undefined`);
    }
    if (typeof value !== "string" && typeof value !== "number") {
      throw new DynamicActionError(
        template,
        `input.${path} must be string or number; got ${typeof value}`,
      );
    }
    return String(value);
  });
}

function resolvePath(input: unknown, path: string): unknown {
  const segments = path.split(".");
  let cur: unknown = input;
  for (const seg of segments) {
    if (cur === null || cur === undefined) return undefined;
    if (typeof cur !== "object") return undefined;
    cur = (cur as Record<string, unknown>)[seg];
  }
  return cur;
}
