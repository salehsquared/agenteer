/**
 * Semantic projectors — sub-plan 04 §4.4.
 *
 * Trust ships the canonical baseline (sort keys, strip prose, normalize
 * whitespace); per-schema projectors register explicitly in the
 * ComparatorRegistry. OpenEngine's workload-specific projectors
 * (`projectSpecIR`, `projectIntakeOutput`, etc.) do NOT ship in trust —
 * applications register their own.
 */

export type JsonLike =
  | null
  | boolean
  | number
  | string
  | JsonLike[]
  | { [k: string]: JsonLike };

const DEFAULT_PROSE_KEYS = new Set([
  "summary",
  "reasoning",
  "description",
  "rationale",
  "title",
  "explanation",
]);

export function projectCanonical(value: unknown): JsonLike {
  return canonicalize(value);
}

function canonicalize(value: unknown): JsonLike {
  if (value === null || value === undefined) return null;
  if (typeof value === "string") return normalizeString(value);
  if (typeof value === "number") {
    if (!Number.isFinite(value)) return null;
    return value;
  }
  if (typeof value === "boolean") return value;
  if (Array.isArray(value)) return value.map(canonicalize);
  if (typeof value === "object") {
    const obj = value as Record<string, unknown>;
    const sorted = Object.keys(obj).sort();
    const out: Record<string, JsonLike> = {};
    for (const key of sorted) {
      if (DEFAULT_PROSE_KEYS.has(key)) continue;
      out[key] = canonicalize(obj[key]);
    }
    return out;
  }
  return String(value);
}

function normalizeString(s: string): string {
  return s.trim().toLowerCase().normalize("NFC");
}

/** Recursively diff two canonical projections; returns dot-paths that differ. */
export function diffPaths(a: JsonLike, b: JsonLike, prefix = ""): string[] {
  if (equal(a, b)) return [];
  if (isObject(a) && isObject(b)) {
    const out: string[] = [];
    const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
    for (const k of [...keys].sort()) {
      const p = prefix ? `${prefix}.${k}` : k;
      out.push(...diffPaths(a[k] ?? null, b[k] ?? null, p));
    }
    return out;
  }
  if (Array.isArray(a) && Array.isArray(b)) {
    const out: string[] = [];
    const len = Math.max(a.length, b.length);
    for (let i = 0; i < len; i += 1) {
      const p = `${prefix}[${i}]`;
      out.push(...diffPaths(a[i] ?? null, b[i] ?? null, p));
    }
    return out;
  }
  return [prefix || "<root>"];
}

function equal(a: JsonLike, b: JsonLike): boolean {
  if (a === b) return true;
  if (a === null || b === null) return false;
  if (typeof a !== typeof b) return false;
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    return a.every((v, i) => equal(v, b[i]!));
  }
  if (isObject(a) && isObject(b)) {
    const ak = Object.keys(a).sort();
    const bk = Object.keys(b).sort();
    if (ak.length !== bk.length) return false;
    if (!ak.every((k, i) => k === bk[i])) return false;
    return ak.every((k) => equal(a[k] ?? null, b[k] ?? null));
  }
  return false;
}

function isObject(v: JsonLike): v is { [k: string]: JsonLike } {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}
