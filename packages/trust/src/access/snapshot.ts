/**
 * File-tree snapshot + diff — sub-plan 04 §3.2.
 *
 * Generalizes OpenEngine's `snapshotResources` (which walked a fixed
 * `spec-ir.yaml / issue-ledger.yaml / output/**` layout) to a scope-glob
 * model. A node declaring `fs.read:/src/**` and `fs.write:/out/**`
 * snapshots only those two subtrees.
 *
 * Design calls from sub-plan 04:
 *   - Per-file sha256 (not truncated — cost is already paid on full file read).
 *   - `mtimeNs` stored as a fast-skip hint; not trusted for correctness.
 *   - Globs resolve via simple include/exclude matching against paths
 *     relative to `rootPath`.
 *   - Budget: if total-bytes-hashed exceeds `budget_bytes`, an advisory
 *     flag is set on the snapshot; the caller decides policy.
 */

import { readFile, readdir, stat } from "node:fs/promises";
import type { Dirent } from "node:fs";
import { createHash } from "node:crypto";
import { join, resolve, relative, sep } from "node:path";
import type { AccessViolation } from "./violation.js";

export interface FileFingerprint {
  sha256: string; // "<hex>"
  size: number;
  mtimeNs?: bigint;
}

export interface ResourceSnapshot {
  takenAt: string;
  rootPath: string;
  files: ReadonlyMap<string, FileFingerprint>;
  truncated: boolean;
  bytesHashed: number;
}

export interface SnapshotScope {
  /** Absolute-path or root-relative globs (e.g., `src/**`, `/abs/out/**`). */
  include: readonly string[];
  /** Runtime-owned globs to exclude (`.agenteer-session/**`, `node_modules/**`). */
  exclude?: readonly string[];
  budget_bytes?: number;
}

const DEFAULT_EXCLUDES = [
  "node_modules/**",
  ".git/**",
  "dist/**",
  ".agenteer-session/**",
  ".trust/**",
] as const;

export async function snapshot(
  scope: SnapshotScope,
  rootPath: string,
): Promise<ResourceSnapshot> {
  const root = resolve(rootPath);
  const include = scope.include.map((p) => toRelative(root, p));
  const exclude = [...DEFAULT_EXCLUDES, ...(scope.exclude ?? [])].map((p) =>
    toRelative(root, p),
  );
  const budget = scope.budget_bytes ?? Infinity;

  const files = new Map<string, FileFingerprint>();
  let bytesHashed = 0;
  let truncated = false;

  await walk(root, root, include, exclude, async (absPath, rel) => {
    if (bytesHashed >= budget) {
      truncated = true;
      return;
    }
    try {
      const s = await stat(absPath);
      if (!s.isFile()) return;
      const bytes = await readFile(absPath);
      const sha256 = createHash("sha256").update(bytes).digest("hex");
      const fp: FileFingerprint = { sha256, size: s.size };
      const mtNs = (s as { mtimeNs?: bigint }).mtimeNs;
      if (typeof mtNs === "bigint") fp.mtimeNs = mtNs;
      files.set(rel, fp);
      bytesHashed += s.size;
    } catch {
      /* file vanished; skip */
    }
  });

  return {
    takenAt: new Date().toISOString(),
    rootPath: root,
    files,
    truncated,
    bytesHashed,
  };
}

/**
 * diffSnapshots: returns violations for files that changed / were created
 * outside the `allowedWrites` glob list, and for files that were deleted
 * outside `allowedDeletes`.
 */
export function diffSnapshots(
  before: ResourceSnapshot,
  after: ResourceSnapshot,
  allowedWrites: readonly string[],
  allowedDeletes: readonly string[],
  nodeId: string = "<unknown>",
): AccessViolation[] {
  const violations: AccessViolation[] = [];
  const allowedWritePatterns = allowedWrites.map((g) => toRelative(before.rootPath, g));
  const allowedDeletePatterns = allowedDeletes.map((g) => toRelative(before.rootPath, g));

  for (const [rel, fp] of after.files) {
    const was = before.files.get(rel);
    if (!was) {
      if (!matchesAny(rel, allowedWritePatterns)) {
        violations.push({
          type: "unauthorized_write",
          path: rel,
          nodeId,
          reason: `created outside allowed fs.write scope`,
        });
      }
      continue;
    }
    if (was.sha256 !== fp.sha256) {
      if (!matchesAny(rel, allowedWritePatterns)) {
        violations.push({
          type: "unauthorized_write",
          path: rel,
          nodeId,
          reason: `modified outside allowed fs.write scope`,
        });
      }
    }
  }

  for (const [rel] of before.files) {
    if (after.files.has(rel)) continue;
    if (!matchesAny(rel, allowedDeletePatterns) && !matchesAny(rel, allowedWritePatterns)) {
      violations.push({
        type: "unauthorized_delete",
        path: rel,
        nodeId,
        reason: `deleted outside allowed fs.delete scope`,
      });
    }
  }

  return violations;
}

// ───────────────────────────────────────────────────────────────────
// Internal: glob walk + matching. Same `**` / `*` semantics as the
// permission kernel's cover.ts, but scoped to file paths.
// ───────────────────────────────────────────────────────────────────

function toRelative(root: string, p: string): string {
  if (p.startsWith("/")) {
    const rel = relative(root, p);
    return rel === "" ? "." : rel.replaceAll(sep, "/");
  }
  return p.replaceAll(sep, "/");
}

async function walk(
  dir: string,
  root: string,
  include: readonly string[],
  exclude: readonly string[],
  visit: (absPath: string, rel: string) => Promise<void>,
): Promise<void> {
  let entries: Dirent[];
  try {
    entries = (await readdir(dir, { withFileTypes: true })) as Dirent[];
  } catch {
    return;
  }
  for (const entry of entries) {
    const name = String(entry.name);
    const abs = join(dir, name);
    const rel = relative(root, abs).replaceAll(sep, "/");
    if (matchesAny(rel, exclude)) continue;
    if (entry.isDirectory()) {
      // Only recurse if any include glob could match something below `rel`.
      if (include.some((g) => globCouldMatchPrefix(g, rel))) {
        await walk(abs, root, include, exclude, visit);
      }
    } else if (entry.isFile()) {
      if (matchesAny(rel, include)) {
        await visit(abs, rel);
      }
    }
  }
}

function matchesAny(rel: string, patterns: readonly string[]): boolean {
  return patterns.some((p) => matchesGlob(rel, p));
}

/** Full glob match: identical semantics to permissions/cover.ts. */
function matchesGlob(path: string, pattern: string): boolean {
  const ps = path.split("/");
  const pat = pattern.split("/");
  return walkSegments(pat, ps, 0, 0);
}

/** Prefix glob match — true if `pattern` could match something under `rel`. */
function globCouldMatchPrefix(pattern: string, rel: string): boolean {
  const pat = pattern.split("/");
  const ps = rel.split("/");
  // If any prefix of pat matches ps, we could recurse further.
  for (let i = 0; i <= pat.length; i += 1) {
    if (walkSegments(pat.slice(0, i) as string[], ps, 0, 0)) return true;
  }
  // Or pattern's first `**` lets it match anywhere.
  return pat.includes("**");
}

function walkSegments(p: readonly string[], c: readonly string[], pi: number, ci: number): boolean {
  while (pi < p.length && ci < c.length) {
    const pp = p[pi]!;
    const cc = c[ci]!;
    if (pp === "**") {
      for (let k = ci; k <= c.length; k += 1) {
        if (walkSegments(p, c, pi + 1, k)) return true;
      }
      return false;
    }
    if (!segmentMatch(pp, cc)) return false;
    pi += 1;
    ci += 1;
  }
  while (pi < p.length && p[pi] === "**") pi += 1;
  return pi === p.length && ci === c.length;
}

function segmentMatch(pattern: string, literal: string): boolean {
  if (pattern === literal) return true;
  if (!pattern.includes("*")) return false;
  const parts = pattern.split("*");
  let idx = 0;
  if (parts[0] !== "") {
    if (!literal.startsWith(parts[0]!)) return false;
    idx = parts[0]!.length;
  }
  for (let i = 1; i < parts.length - 1; i += 1) {
    const part = parts[i]!;
    if (part === "") continue;
    const found = literal.indexOf(part, idx);
    if (found < 0) return false;
    idx = found + part.length;
  }
  const last = parts[parts.length - 1]!;
  if (last !== "") {
    if (!literal.endsWith(last)) return false;
    if (literal.length - last.length < idx) return false;
  }
  return true;
}
