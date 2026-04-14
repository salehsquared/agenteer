#!/usr/bin/env node
/**
 * `create-agenteer-node` CLI — thin wrapper over `scaffoldNode`.
 *
 * Usage:
 *   npx @agenteer/create-node @acme/node-bug-triage
 *   npx @agenteer/create-node @acme/node-bug-triage --dir ./packages --force
 */

import { scaffoldNode } from "../index.js";

interface Parsed {
  positional: string[];
  flags: Record<string, string | true>;
}

function parseArgs(argv: readonly string[]): Parsed {
  const positional: string[] = [];
  const flags: Record<string, string | true> = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (!a.startsWith("--")) {
      positional.push(a);
      continue;
    }
    const eq = a.indexOf("=");
    if (eq >= 0) {
      flags[a.slice(2, eq)] = a.slice(eq + 1);
      continue;
    }
    const key = a.slice(2);
    const next = argv[i + 1];
    if (next === undefined || next.startsWith("--")) {
      flags[key] = true;
    } else {
      flags[key] = next;
      i += 1;
    }
  }
  return { positional, flags };
}

async function main(argv: readonly string[]): Promise<number> {
  const { positional, flags } = parseArgs(argv);
  if (positional.length === 0 || flags["help"] === true || flags["h"] === true) {
    printHelp();
    return 0;
  }
  const packageName = positional[0]!;
  const targetDir = typeof flags["dir"] === "string" ? flags["dir"] : ".";
  try {
    const opts: Parameters<typeof scaffoldNode>[0] = {
      packageName,
      targetDir,
      force: flags["force"] === true,
    };
    if (typeof flags["description"] === "string") opts.description = flags["description"];
    if (typeof flags["author"] === "string") opts.author = flags["author"];
    if (flags["stochastic"] === true) opts.determinism = "stochastic";
    const result = await scaffoldNode(opts);
    console.log(`created ${result.packageDir}`);
    for (const f of result.filesWritten) console.log(`  + ${f}`);
    console.log(``);
    console.log(`next steps:`);
    console.log(`  cd ${result.packageDir}`);
    console.log(`  npm install`);
    console.log(`  npm test`);
    console.log(`  agenteer publish --dir . --dry-run   # validate before publishing`);
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
                            [--stochastic]

Args:
  <@scope/node-name>    Package name (must match '@<scope>/node-<name>').
                        The node directory is created inside --dir (default: .).

Flags:
  --dir <parent>        Parent directory for the new package. Default: cwd.
  --force               Overwrite files if the target directory already exists.
  --description "..."   Short description for framework.json + README.
  --author "..."        Author string for package.json.
  --stochastic          Mark the node as stochastic (defaults to deterministic).

Examples:
  npx @agenteer/create-node @acme/node-bug-triage
  npx @agenteer/create-node @acme/node-bug-triage --dir ./packages --stochastic
  `.trim());
}

main(process.argv.slice(2))
  .then((code) => process.exit(code))
  .catch((err) => {
    console.error(err instanceof Error ? err.stack ?? err.message : String(err));
    process.exit(1);
  });
