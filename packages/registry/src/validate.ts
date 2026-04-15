/**
 * Publish-time + install-time package validation (sub-plan 02 §2.3 + §3.1).
 *
 * Checks, in order:
 *   1. package.json exists + parses; name matches `@<scope>/node-<name>`;
 *      keywords include `framework-node`.
 *   2. framework.json exists at the declared (or default) path and
 *      parses as a NodeManifest.
 *   3. manifest.id matches `@<scope>/node-<name>` and matches package.name.
 *   4. required_actions / side_effects consistency (handled inside
 *      validateManifest already; we bubble the error through).
 *
 * Return shape is a result object so callers can render a nice
 * install-time summary without a try/catch dance.
 */

import { loadManifestFromPackage, type LoadedManifest } from "./manifest-file.js";

const PACKAGE_NAME_RE = /^@[a-z0-9][a-z0-9_-]*\/node-[a-z0-9][a-z0-9_-]*$/;

export interface PackageValidationIssue {
  code:
    | "bad_package_name"
    | "missing_framework_keyword"
    | "id_mismatch"
    | "version_mismatch"
    | "manifest_load_failed";
  message: string;
}

export interface PackageValidationResult {
  ok: boolean;
  issues: PackageValidationIssue[];
  /** Populated when `ok` is true (manifest loaded + matches package). */
  loaded?: LoadedManifest;
}

export async function validateNodePackage(pkgDir: string): Promise<PackageValidationResult> {
  const issues: PackageValidationIssue[] = [];
  let loaded: LoadedManifest;

  try {
    loaded = await loadManifestFromPackage(pkgDir);
  } catch (err) {
    issues.push({
      code: "manifest_load_failed",
      message: err instanceof Error ? err.message : String(err),
    });
    return { ok: false, issues };
  }

  if (!PACKAGE_NAME_RE.test(loaded.packageJson.name)) {
    issues.push({
      code: "bad_package_name",
      message: `package.json name '${loaded.packageJson.name}' does not match '@<scope>/node-<name>' convention`,
    });
  }

  if (!loaded.packageJson.keywords.includes("framework-node")) {
    issues.push({
      code: "missing_framework_keyword",
      message: `package.json keywords must include 'framework-node' so 'agenteer search' can find it`,
    });
  }

  if (loaded.manifest.id !== loaded.packageJson.name) {
    issues.push({
      code: "id_mismatch",
      message: `framework.json id '${loaded.manifest.id}' does not match package.json name '${loaded.packageJson.name}'`,
    });
  }

  if (
    typeof loaded.manifest.version === "string" &&
    loaded.manifest.version !== loaded.packageJson.version
  ) {
    issues.push({
      code: "version_mismatch",
      message:
        `framework.json version '${loaded.manifest.version}' does not match package.json version '${loaded.packageJson.version}'. ` +
        `Bump both together so publish/install consumers see a consistent version.`,
    });
  }

  if (issues.length > 0) return { ok: false, issues };
  return { ok: true, issues: [], loaded };
}
