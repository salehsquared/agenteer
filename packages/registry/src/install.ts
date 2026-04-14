/**
 * `installNode` — the library entrypoint behind `agenteer install <pkg>`.
 *
 * Pipeline (sub-plan 02 §3.3):
 *   1. `npm install <pkg>` into <workflowDir>/node_modules.
 *   2. Load framework.json from the installed path.
 *   3. Run runtime-load validation; roll back `npm install` on failure.
 *   4. Compute permissions diff vs workflow grants.
 *   5. Surface provenance status.
 *   6. Present a plain-English prompt — unless `autoApprove` / --yes.
 *   7. On approve: write framework.workflow.yaml + framework.lock;
 *      cache the parsed manifest under <workflowDir>/.framework/manifests/.
 *   8. On decline: roll back `npm install`.
 *
 * `installNode` is pure library — the prompt UX is delegated to a
 * `confirm` callback so the CLI can use stdin and tests can inject a
 * canned answer.
 */

import { join, dirname } from "node:path";
import { writeFile, mkdir } from "node:fs/promises";
import {
  DefaultNpmRunner,
  type NpmRunner,
  type NpmViewResult,
} from "./npm-runner.js";
import { loadManifestFromPackage, type LoadedManifest } from "./manifest-file.js";
import { validateNodePackage } from "./validate.js";
import { diffPermissions, renderPermissionsDiff, type PermissionsDiff } from "./permissions-diff.js";
import { provenanceFromView, renderProvenanceLine, type ProvenanceStatus } from "./provenance.js";
import { ensureWorkflowConfig, recordInstall } from "./workflow-config.js";

export interface InstallOptions {
  /** Working directory of the workflow (node_modules + config live here). */
  workflowDir: string;
  /** `@acme/node-bug-triage@^1.4.0`. Range optional; npm resolves. */
  spec: string;
  /** Seed a workflow config if one doesn't yet exist. */
  workflowId?: string;
  /** Workflow root grants — used to compute the permission diff. */
  grants?: readonly string[];
  /** Auto-approve without invoking `confirm`. */
  autoApprove?: boolean;
  /** Bypass the confirmation prompt (tests). */
  confirm?: (summary: {
    packageName: string;
    version: string;
    description: string;
    license?: string;
    provenance: ProvenanceStatus;
    diff: PermissionsDiff;
    summary_text: string;
  }) => Promise<boolean> | boolean;
  /** Injected npm runner (tests). */
  npm?: NpmRunner;
  /** Alternate registry URL. */
  registry?: string;
  /** Forwarded env. */
  env?: NodeJS.ProcessEnv;
}

export interface InstallResult {
  ok: boolean;
  reason?:
    | "declined_by_user"
    | "validation_failed"
    | "first_party_provenance_required"
    | "third_party_dynamic_actions_requires_confirmation";
  spec: string;
  id?: string;
  version?: string;
  range?: string;
  manifest_hash?: string;
  provenance?: ProvenanceStatus;
  diff?: PermissionsDiff;
  /** True when R4-A hard-stop fired; the caller must confirm interactively. */
  dynamic_actions_hard_stop?: boolean;
}

export async function installNode(opts: InstallOptions): Promise<InstallResult> {
  const npm = opts.npm ?? new DefaultNpmRunner();
  const { spec } = opts;
  const parsedSpec = parsePackageSpec(spec);
  const pkgName = parsedSpec.name;

  await ensureWorkflowConfig(opts.workflowDir, {
    workflow_id: opts.workflowId ?? "workflow",
    ...(opts.grants ? { granted: opts.grants } : {}),
  });

  // 1. Install.
  await npm.install({
    cwd: opts.workflowDir,
    spec,
    ...(opts.registry ? { registry: opts.registry } : {}),
    ...(opts.env ? { env: opts.env } : {}),
  });
  const installedPkgDir = join(opts.workflowDir, "node_modules", pkgName);

  // 2. Validate.
  const validation = await validateNodePackage(installedPkgDir);
  if (!validation.ok || !validation.loaded) {
    await safeUninstall(npm, opts.workflowDir, pkgName);
    return {
      ok: false,
      reason: "validation_failed",
      spec,
      diff: {
        required: [],
        granted: opts.grants ?? [],
        already_covered: [],
        new_required: [],
      },
    };
  }
  const loaded: LoadedManifest = validation.loaded;

  // 3. Provenance + permission diff.
  let provenance: ProvenanceStatus = { present: false, is_first_party: pkgName.startsWith("@agenteer/") };
  try {
    const view: NpmViewResult | null = await npm.view(spec, opts.registry ? { registry: opts.registry } : {});
    provenance = provenanceFromView(pkgName, view);
  } catch {
    /* offline / unknown — treat as "missing" */
  }
  if (provenance.is_first_party && !provenance.present) {
    await safeUninstall(npm, opts.workflowDir, pkgName);
    return {
      ok: false,
      reason: "first_party_provenance_required",
      spec,
      id: loaded.manifest.id,
      version: loaded.packageJson.version,
      manifest_hash: loaded.contentHash,
      provenance,
    };
  }

  const requiredActions = loaded.manifest.required_actions ?? [];
  const diff = diffPermissions({
    required: requiredActions,
    granted: opts.grants ?? [],
  });

  // R4-A — install-time hard-stop for third-party dynamic_actions:true.
  //
  // Master plan ratification: packages that synthesize caps at dispatch
  // time (master plan §R4 disclosure) turn the static permissions diff
  // into a lower bound; actual caps exercised at runtime can be wider.
  // For @agenteer/* we trust first-party review and let --yes stand.
  // For everything else the disclosure flag must cost a real confirmation
  // — otherwise the flag is cosmetic.
  const isFirstParty = pkgName.startsWith("@agenteer/");
  const dynamicActions = Boolean(loaded.manifest.dynamic_actions);
  const hardStop = dynamicActions && !isFirstParty;

  // 4. Prompt.
  const summaryText = [
    `Installing ${loaded.packageJson.name}@${loaded.packageJson.version}`,
    `  Description: ${loaded.packageJson.description ?? "(none)"}`,
    `  License:     ${loaded.packageJson.license ?? "(unspecified)"}`,
    `  ${renderProvenanceLine(provenance)}`,
    ...(dynamicActions
      ? [
          `  dynamic_actions: true — this node synthesizes capabilities`,
          `    at dispatch time; required_actions below is a LOWER BOUND.`,
          ...(loaded.manifest.dynamic_action_spec
            ? [`    Spec: ${loaded.manifest.dynamic_action_spec}`]
            : []),
          ...(hardStop
            ? [`    Third-party dynamic_actions — explicit confirmation required.`]
            : []),
        ]
      : []),
    renderPermissionsDiff(loaded.packageJson.name, loaded.packageJson.version, diff)
      .split("\n")
      .slice(1)
      .join("\n"),
  ].join("\n");

  // Auto-approve is allowed for first-party AND third-party static
  // manifests. For third-party dynamic_actions, it's IGNORED — the
  // confirm callback is always invoked (hard-stop). A caller that wants
  // scripted installs must supply a confirm that returns true; --yes
  // alone no longer bypasses the prompt for these packages.
  let approved = Boolean(opts.autoApprove) && !hardStop;
  if (!approved) {
    if (!opts.confirm) {
      await safeUninstall(npm, opts.workflowDir, pkgName);
      return {
        ok: false,
        reason: hardStop
          ? "third_party_dynamic_actions_requires_confirmation"
          : "declined_by_user",
        spec,
        id: loaded.manifest.id,
        version: loaded.packageJson.version,
        manifest_hash: loaded.contentHash,
        provenance,
        diff,
        ...(hardStop ? { dynamic_actions_hard_stop: true } : {}),
      };
    }
    approved = await opts.confirm({
      packageName: loaded.packageJson.name,
      version: loaded.packageJson.version,
      description: loaded.packageJson.description ?? "",
      ...(loaded.packageJson.license ? { license: loaded.packageJson.license } : {}),
      provenance,
      diff,
      summary_text: summaryText,
    });
  }
  if (!approved) {
    await safeUninstall(npm, opts.workflowDir, pkgName);
    return {
      ok: false,
      reason: "declined_by_user",
      spec,
      id: loaded.manifest.id,
      version: loaded.packageJson.version,
      manifest_hash: loaded.contentHash,
      provenance,
      diff,
      ...(hardStop ? { dynamic_actions_hard_stop: true } : {}),
    };
  }

  // 5. Record + cache.
  await recordInstall(opts.workflowDir, {
    id: loaded.manifest.id,
    version: loaded.packageJson.version,
    range: parsedSpec.range ?? `^${loaded.packageJson.version}`,
    manifestHash: loaded.contentHash,
  });
  const cachePath = join(
    opts.workflowDir,
    ".framework",
    "manifests",
    `${sanitizeId(loaded.manifest.id)}@${loaded.packageJson.version}.json`,
  );
  await mkdir(dirname(cachePath), { recursive: true });
  await writeFile(cachePath, JSON.stringify(loaded.manifest, null, 2), "utf-8");

  return {
    ok: true,
    spec,
    id: loaded.manifest.id,
    version: loaded.packageJson.version,
    range: parsedSpec.range ?? `^${loaded.packageJson.version}`,
    manifest_hash: loaded.contentHash,
    provenance,
    diff,
  };
}

async function safeUninstall(npm: NpmRunner, cwd: string, spec: string): Promise<void> {
  try {
    await npm.uninstall({ cwd, spec });
  } catch {
    /* best-effort rollback */
  }
}

function parsePackageSpec(spec: string): { name: string; range?: string } {
  // A scoped spec looks like "@scope/name@range". Split on the LAST '@'.
  const atAfterScope = spec.startsWith("@") ? spec.indexOf("@", 1) : spec.indexOf("@");
  if (atAfterScope <= 0) return { name: spec };
  return { name: spec.slice(0, atAfterScope), range: spec.slice(atAfterScope + 1) };
}

function sanitizeId(id: string): string {
  return id.replace(/[^a-zA-Z0-9._-]+/g, "_");
}
