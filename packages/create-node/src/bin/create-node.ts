#!/usr/bin/env node
/**
 * `create-agenteer-node` CLI — thin wrapper over `scaffoldNode`.
 *
 * Usage:
 *   npx @agenteer/create-node @acme/node-bug-triage
 *   npx @agenteer/create-node @acme/node-bug-triage --dir ./packages --force
 */

import { scaffoldNode } from "../index.js";

const KNOWN_FLAGS = new Set([
  "dir",
  "force",
  "description",
  "author",
  "determinism",
  "required-action",
  "help",
  "h",
]);

interface Parsed {
  positional: string[];
  flags: Record<string, string | string[] | true>;
}

function parseArgs(argv: readonly string[]): Parsed {
  const positional: string[] = [];
  const flags: Record<string, string | string[] | true> = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (!a.startsWith("--")) {
      positional.push(a);
      continue;
    }
    const eq = a.indexOf("=");
    let key: string;
    let value: string | true;
    if (eq >= 0) {
      key = a.slice(2, eq);
      value = a.slice(eq + 1);
    } else {
      key = a.slice(2);
      const next = argv[i + 1];
      if (next === undefined || next.startsWith("--")) {
        value = true;
      } else {
        value = next;
        i += 1;
      }
    }
    const existing = flags[key];
    if (existing === undefined) {
      flags[key] = value;
    } else if (value === true) {
      // idempotent bool repeat
    } else if (existing === true) {
      flags[key] = value;
    } else if (Array.isArray(existing)) {
      existing.push(value);
    } else {
      flags[key] = [existing, value];
    }
  }
  return { positional, flags };
}

function flagString(flags: Parsed["flags"], key: string): string | undefined {
  const v = flags[key];
  if (typeof v === "string") return v;
  if (Array.isArray(v) && v.length > 0) return v[v.length - 1];
  return undefined;
}

function flagList(flags: Parsed["flags"], key: string): string[] {
  const v = flags[key];
  const raw: string[] = [];
  if (typeof v === "string") raw.push(v);
  else if (Array.isArray(v)) for (const s of v) raw.push(s);
  return raw.flatMap((s) => s.split(",").map((t) => t.trim()).filter(Boolean));
}

async function main(argv: readonly string[]): Promise<number> {
  const { positional, flags } = parseArgs(argv);

  const unknown = Object.keys(flags).filter((k) => !KNOWN_FLAGS.has(k));
  if (unknown.length > 0) {
    console.error(
      `create-agenteer-node: unknown flag${unknown.length === 1 ? "" : "s"}: ` +
        unknown.map((k) => `--${k}`).join(", "),
    );
    printHelp();
    return 2;
  }

  if (positional.length === 0 || flags["help"] === true || flags["h"] === true) {
    printHelp();
    return positional.length === 0 ? 2 : 0;
  }

  const packageName = positional[0]!;
  const targetDir = flagString(flags, "dir") ?? ".";

  const determinismRaw = flagString(flags, "determinism");
  let determinism: "deterministic" | "stochastic" | undefined;
  if (determinismRaw !== undefined) {
    if (determinismRaw !== "deterministic" && determinismRaw !== "stochastic") {
      console.error(
        `create-agenteer-node: --determinism must be 'deterministic' or 'stochastic' (got '${determinismRaw}')`,
      );
      return 2;
    }
    determinism = determinismRaw;
  }

  const requiredActions = flagList(flags, "required-action");

  try {
    const opts: Parameters<typeof scaffoldNode>[0] = {
      packageName,
      targetDir,
      force: flags["force"] === true,
    };
    const description = flagString(flags, "description");
    if (description !== undefined) opts.description = description;
    const author = flagString(flags, "author");
    if (author !== undefined) opts.author = author;
    if (determinism !== undefined) opts.determinism = determinism;
    if (requiredActions.length > 0) opts.requiredActions = requiredActions;
    const result = await scaffoldNode(opts);
    console.log(`created ${result.packageDir}`);
    for (const f of result.filesWritten) console.log(`  + ${f}`);
    console.log(``);
    console.log(`next steps:`);
    console.log(`  cd ${result.packageDir}`);
    console.log(`  npm install`);
    console.log(`  npm test`);
    console.log(`  npx @agenteer/cli publish --dir . --dry-run   # validate before publishing`);
    return 0;
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err));
    return 1;
  }
}

function printHelp(): void {
  console.log(`
create-agenteer-node — scaffold a new Agenteer node package.

Usage:
  npx @agenteer/create-node <@scope/node-name> [--dir <parent>] [--force]
                            [--description "..."] [--author "..."]
                            [--determinism deterministic|stochastic]
                            [--required-action <cap>]*

Args:
  <@scope/node-name>    Package name (must match '@<scope>/node-<name>').
                        The node directory is created inside --dir (default: .).

Flags:
  --dir <parent>             Parent directory for the new package. Default: cwd.
  --force                    Overwrite files if the target directory already exists.
  --description "..."        Short description for framework.json + README.
  --author "..."             Author string for package.json.
  --determinism <d>          'deterministic' (default) or 'stochastic'.
  --required-action <cap>    Seed required_actions. Repeat for multiple caps,
                             or pass a comma-separated list.

Examples:
  npx @agenteer/create-node @acme/node-bug-triage
  npx @agenteer/create-node @acme/node-bug-triage --dir ./packages \\
    --determinism stochastic --required-action 'model:claude-*'
  `.trim());
}

main(process.argv.slice(2))
  .then((code) => process.exit(code))
  .catch((err) => {
    console.error(err instanceof Error ? err.stack ?? err.message : String(err));
    process.exit(1);
  });
