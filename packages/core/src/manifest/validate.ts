import { ZodError } from "zod";
import { NodeManifestSchema, type NodeManifest, type NodeManifestInput } from "./schema.js";

export class ManifestValidationError extends Error {
  constructor(
    readonly rawInput: unknown,
    readonly issues: ZodError["issues"],
  ) {
    super(
      `manifest validation failed: ${issues
        .map((i) => `${i.path.join(".") || "<root>"}: ${i.message}`)
        .join("; ")}`,
    );
  }
}

/**
 * Runtime-load validation (sub-plan 02 §2.3). Blocks on any error.
 * Parses, defaults, and freezes the manifest for downstream consumption.
 */
export function validateManifest(raw: NodeManifestInput | unknown): NodeManifest {
  const result = NodeManifestSchema.safeParse(raw);
  if (!result.success) {
    throw new ManifestValidationError(raw, result.error.issues);
  }
  return Object.freeze(result.data) as NodeManifest;
}

export function tryValidateManifest(
  raw: unknown,
): { ok: true; manifest: NodeManifest } | { ok: false; issues: ZodError["issues"] } {
  const result = NodeManifestSchema.safeParse(raw);
  if (!result.success) return { ok: false, issues: result.error.issues };
  return { ok: true, manifest: Object.freeze(result.data) as NodeManifest };
}
