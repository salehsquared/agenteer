/**
 * `publishNode` — the library entrypoint behind `agenteer publish`.
 *
 * Pipeline (sub-plan 02 §3.1):
 *   1. Validate the package (layout + framework.json + manifest shape).
 *   2. Compute the canonical manifest hash (for caller telemetry; npm
 *      records the tarball hash on its side).
 *   3. Delegate to `npm publish` via the injected `NpmRunner`. Default
 *      turns `--provenance` on for `@agenteer/*` (first-party) packages;
 *      third-party publishers opt in.
 *
 * Return shape includes hash + package metadata so the CLI can log the
 * success line without re-reading files.
 */

import type { NpmRunner } from "./npm-runner.js";
import { DefaultNpmRunner } from "./npm-runner.js";
import {
  validateNodePackage,
  type PackageValidationResult,
} from "./validate.js";

export interface PublishOptions {
  /** Directory of the package to publish (must contain package.json + framework.json). */
  pkgDir: string;
  /** Override `--provenance`. Defaults: first-party → true, third-party → false. */
  provenance?: boolean;
  /** Alternate registry URL; verdaccio-friendly. */
  registry?: string;
  /** `npm publish --dry-run`: no network side-effects. */
  dryRun?: boolean;
  /** Injected runner (tests). */
  npm?: NpmRunner;
  /** Extra args passed through to `npm publish`. */
  extraArgs?: readonly string[];
  /** Extra env forwarded to the npm invocation (e.g. NPM_TOKEN). */
  env?: NodeJS.ProcessEnv;
}

export interface PublishResult {
  ok: boolean;
  /** Present on both success and validation-only failures. */
  validation: PackageValidationResult;
  manifest_id?: string;
  version?: string;
  manifest_hash?: string;
  provenance_enabled?: boolean;
  dry_run?: boolean;
}

export async function publishNode(opts: PublishOptions): Promise<PublishResult> {
  const validation = await validateNodePackage(opts.pkgDir);
  if (!validation.ok || !validation.loaded) {
    return { ok: false, validation };
  }
  const loaded = validation.loaded;
  const isFirstParty = loaded.packageJson.name.startsWith("@agenteer/");
  const provenance = opts.provenance ?? isFirstParty;
  const npm = opts.npm ?? new DefaultNpmRunner();
  await npm.publish({
    cwd: opts.pkgDir,
    provenance,
    ...(opts.dryRun !== undefined ? { dryRun: opts.dryRun } : {}),
    ...(opts.registry ? { registry: opts.registry } : {}),
    ...(opts.extraArgs ? { extra: opts.extraArgs } : {}),
    ...(opts.env ? { env: opts.env } : {}),
  });
  return {
    ok: true,
    validation,
    manifest_id: loaded.manifest.id,
    version: loaded.packageJson.version,
    manifest_hash: loaded.contentHash,
    provenance_enabled: provenance,
    dry_run: Boolean(opts.dryRun),
  };
}
