/**
 * Tiny argv parser — intentionally minimal. No deps. Recognizes:
 *   --flag value
 *   --flag=value
 *   --bool
 *   positional args
 *
 * Not POSIX — no short flags, no `--` separator. Enough for our 4 commands.
 */

export interface ParsedArgs {
  positional: string[];
  flags: Record<string, string | true>;
}

export function parseArgs(argv: readonly string[]): ParsedArgs {
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

export function flagString(flags: ParsedArgs["flags"], key: string): string | undefined {
  const v = flags[key];
  return typeof v === "string" ? v : undefined;
}

export function requireFlagString(flags: ParsedArgs["flags"], key: string): string {
  const v = flagString(flags, key);
  if (v === undefined) throw new Error(`missing required --${key}`);
  return v;
}
