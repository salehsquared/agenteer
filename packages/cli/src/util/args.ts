/**
 * Tiny argv parser — intentionally minimal. No deps. Recognizes:
 *   --flag value
 *   --flag=value
 *   --bool
 *   positional args
 *
 * Not POSIX — no short flags, no `--` separator. Enough for our commands.
 *
 * Repeated flags accumulate into an array, so `--model a --model b` yields
 * `["a", "b"]`. Consumers use `flagString` (last value) or `flagList`
 * (all values, also splits comma-separated strings) depending on shape.
 */

export type FlagValue = string | string[] | true;

export interface ParsedArgs {
  positional: string[];
  flags: Record<string, FlagValue>;
}

export function parseArgs(argv: readonly string[]): ParsedArgs {
  const positional: string[] = [];
  const flags: Record<string, FlagValue> = {};
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
    assignFlag(flags, key, value);
  }
  return { positional, flags };
}

function assignFlag(
  flags: Record<string, FlagValue>,
  key: string,
  value: string | true,
): void {
  const existing = flags[key];
  if (existing === undefined) {
    flags[key] = value;
    return;
  }
  // Second+ occurrence. Only accumulate string values — `true` (bool) repeats
  // stay idempotent rather than turning into ["true", "true"].
  if (value === true) return;
  if (existing === true) {
    flags[key] = value;
    return;
  }
  if (Array.isArray(existing)) {
    existing.push(value);
    return;
  }
  flags[key] = [existing, value];
}

export function flagString(flags: ParsedArgs["flags"], key: string): string | undefined {
  const v = flags[key];
  if (typeof v === "string") return v;
  if (Array.isArray(v) && v.length > 0) return v[v.length - 1];
  return undefined;
}

export function requireFlagString(flags: ParsedArgs["flags"], key: string): string {
  const v = flagString(flags, key);
  if (v === undefined) throw new Error(`missing required --${key}`);
  return v;
}

/**
 * Return all values for a repeatable string flag. Merges repeated `--k v`
 * with comma-separated values (`--k a,b` → `["a", "b"]`). Bool-only flags
 * and missing keys return `[]`.
 */
export function flagList(flags: ParsedArgs["flags"], key: string): string[] {
  const v = flags[key];
  const raw: string[] = [];
  if (typeof v === "string") raw.push(v);
  else if (Array.isArray(v)) for (const s of v) raw.push(s);
  return raw.flatMap((s) => s.split(",").map((t) => t.trim()).filter(Boolean));
}
