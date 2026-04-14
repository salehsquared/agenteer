/**
 * Reads a node package's `framework.json` (the published manifest shape
 * from sub-plan 02 §3.1) and computes its content hash.
 *
 * The hash is over canonical JSON so a reformat-only diff doesn't change
 * the integrity value — matches the canonicalization the context layer
 * already uses.
 */

import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { join } from "node:path";
import { z } from "zod";
import {
  NodeManifestSchema,
  validateManifest,
  type NodeManifest,
} from "@agenteer/core";

export const MANIFEST_FILENAME = "framework.json";

const PackageJsonSchema = z.object({
  name: z.string(),
  version: z.string(),
  description: z.string().optional(),
  keywords: z.array(z.string()).default([]),
  license: z.string().optional(),
  author: z
    .union([
      z.string(),
      z.object({ name: z.string(), email: z.string().optional() }).partial(),
    ])
    .optional(),
  framework: z
    .object({
      manifest: z.string().default(`./${MANIFEST_FILENAME}`),
    })
    .optional(),
});
export type PackageJson = z.infer<typeof PackageJsonSchema>;

export interface LoadedManifest {
  /** Absolute path the manifest was read from. */
  path: string;
  /** The parsed + validated manifest. */
  manifest: NodeManifest;
  /** sha256 of the canonical JSON — the integrity pin for `framework.lock`. */
  contentHash: string;
  /** The package.json metadata, for provenance / author / license checks. */
  packageJson: PackageJson;
}

export async function loadManifestFromPackage(pkgDir: string): Promise<LoadedManifest> {
  const pkgRaw = await readFile(join(pkgDir, "package.json"), "utf-8");
  const packageJson = PackageJsonSchema.parse(JSON.parse(pkgRaw));
  const manifestRel = packageJson.framework?.manifest ?? `./${MANIFEST_FILENAME}`;
  const manifestPath = join(pkgDir, manifestRel);
  const manifestRaw = await readFile(manifestPath, "utf-8");
  const parsedJson = JSON.parse(manifestRaw);
  // validateManifest throws ManifestValidationError on bad shape — callers
  // bubble this up as "package validation failed".
  const manifest = validateManifest(parsedJson);
  // Extra: re-run NodeManifestSchema on the parsed JSON to surface field
  // issues the kernel's combined validator may coalesce.
  NodeManifestSchema.parse(parsedJson);
  const contentHash = canonicalSha256(parsedJson);
  return { path: manifestPath, manifest, contentHash, packageJson };
}

/**
 * Canonical JSON sha256: sort object keys recursively, drop `undefined`,
 * no whitespace. Mirrors `@agenteer/core`'s context canonicalization.
 */
export function canonicalSha256(value: unknown): string {
  const canonical = JSON.stringify(canonicalize(value));
  return createHash("sha256").update(canonical).digest("hex");
}

function canonicalize(value: unknown): unknown {
  if (value === null || value === undefined) return null;
  if (typeof value === "string") return value.normalize("NFC");
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new Error(`non-finite number cannot be canonicalized: ${value}`);
    }
    return value;
  }
  if (typeof value === "boolean") return value;
  if (Array.isArray(value)) return value.map(canonicalize);
  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    const out: Record<string, unknown> = {};
    for (const [k, v] of entries) out[k] = canonicalize(v);
    return out;
  }
  return String(value);
}
