/**
 * `NpmRunner` — narrow interface over the npm CLI operations `@agenteer/registry`
 * needs. Production wires `DefaultNpmRunner`, which spawns `npm` via
 * `child_process`. Tests inject `MockNpmRunner` so the full publish /
 * install / search story is exercised without a network or registry.
 *
 * We do NOT import `npm`'s JS API: it's unstable between majors and
 * bundling it bloats this package. The `npm` CLI is universally
 * installed with Node ≥ 20, and its JSON outputs are documented and stable.
 */

import { spawn } from "node:child_process";

export interface NpmPublishOptions {
  cwd: string;
  provenance?: boolean;
  /** Extra args appended verbatim after the subcommand. */
  extra?: readonly string[];
  /** Alternate registry URL (e.g. verdaccio). */
  registry?: string;
  /** Forwarded env; merged onto process.env. Useful to set NPM_TOKEN in CI. */
  env?: NodeJS.ProcessEnv;
  /** --dry-run. */
  dryRun?: boolean;
}

export interface NpmInstallOptions {
  /** Where to install into (becomes that directory's package.json deps). */
  cwd: string;
  /** Package spec, e.g. `@acme/node-bug-triage@1.4.0`. */
  spec: string;
  /** Install into node_modules without editing package.json when true. */
  noSave?: boolean;
  registry?: string;
  env?: NodeJS.ProcessEnv;
}

export interface NpmSearchHit {
  name: string;
  version: string;
  description?: string;
  keywords?: string[];
  date?: string;
  links?: { npm?: string; homepage?: string };
  publisher?: { username?: string };
}

export interface NpmViewResult {
  name: string;
  version: string;
  versions?: string[];
  /** `framework.json` field embedded in `package.json`'s `"framework"` block. */
  framework?: { manifest?: string };
  keywords?: string[];
  dist?: { integrity?: string; tarball?: string; attestations?: unknown };
}

export interface NpmUninstallOptions {
  cwd: string;
  spec: string;
}

export interface NpmRunner {
  publish(opts: NpmPublishOptions): Promise<void>;
  install(opts: NpmInstallOptions): Promise<void>;
  uninstall(opts: NpmUninstallOptions): Promise<void>;
  search(query: string, opts?: { registry?: string }): Promise<NpmSearchHit[]>;
  view(spec: string, opts?: { registry?: string }): Promise<NpmViewResult | null>;
}

export class NpmCommandError extends Error {
  constructor(readonly code: number, readonly stderr: string, readonly command: string) {
    super(`${command} exited with code ${code}: ${stderr}`);
    this.name = "NpmCommandError";
  }
}

function runNpm(args: readonly string[], opts: { cwd: string; env?: NodeJS.ProcessEnv }): Promise<{
  stdout: string;
  stderr: string;
}> {
  return new Promise((resolve, reject) => {
    const child = spawn("npm", [...args], {
      cwd: opts.cwd,
      env: { ...process.env, ...(opts.env ?? {}) },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => (stdout += chunk));
    child.stderr.on("data", (chunk: string) => (stderr += chunk));
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve({ stdout, stderr });
      else reject(new NpmCommandError(code ?? -1, stderr, `npm ${args.join(" ")}`));
    });
  });
}

export class DefaultNpmRunner implements NpmRunner {
  async publish(opts: NpmPublishOptions): Promise<void> {
    const args: string[] = ["publish"];
    if (opts.provenance) args.push("--provenance");
    if (opts.dryRun) args.push("--dry-run");
    if (opts.registry) args.push("--registry", opts.registry);
    if (opts.extra) args.push(...opts.extra);
    await runNpm(args, { cwd: opts.cwd, ...(opts.env ? { env: opts.env } : {}) });
  }

  async install(opts: NpmInstallOptions): Promise<void> {
    const args: string[] = ["install", opts.spec];
    if (opts.noSave) args.push("--no-save");
    if (opts.registry) args.push("--registry", opts.registry);
    await runNpm(args, { cwd: opts.cwd, ...(opts.env ? { env: opts.env } : {}) });
  }

  async uninstall(opts: NpmUninstallOptions): Promise<void> {
    await runNpm(["uninstall", opts.spec], { cwd: opts.cwd });
  }

  async search(query: string, opts: { registry?: string } = {}): Promise<NpmSearchHit[]> {
    const args = ["search", query, "--json"];
    if (opts.registry) args.push("--registry", opts.registry);
    const { stdout } = await runNpm(args, { cwd: process.cwd() });
    const parsed = safeJson(stdout);
    if (!Array.isArray(parsed)) return [];
    return parsed as NpmSearchHit[];
  }

  async view(spec: string, opts: { registry?: string } = {}): Promise<NpmViewResult | null> {
    const args = ["view", spec, "--json"];
    if (opts.registry) args.push("--registry", opts.registry);
    try {
      const { stdout } = await runNpm(args, { cwd: process.cwd() });
      const parsed = safeJson(stdout);
      if (parsed && typeof parsed === "object") return parsed as NpmViewResult;
      return null;
    } catch (err) {
      if (err instanceof NpmCommandError && err.stderr.includes("E404")) return null;
      throw err;
    }
  }
}

function safeJson(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}
