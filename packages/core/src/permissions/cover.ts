/**
 * `covers(parent, child)` — does the parent capability cover the child?
 *
 * Pure function over parsed capabilities. Implements the rules in sub-plan
 * 02 §1.2. Grammar is bounded (only `*` and `**` wildcards, no alternations),
 * so glob containment is decidable and cheap.
 */

import type { ParsedCapability } from "./capability.js";

export function covers(parent: ParsedCapability, child: ParsedCapability): boolean {
  if (parent.resource !== child.resource) return false;
  if (parent.scope === "*") return true;
  if (parent.raw === child.raw) return true;

  switch (parent.resource) {
    case "shell.exec":
      return parent.scope === "" && child.scope === "";

    case "fs.read":
    case "fs.write":
    case "fs.delete":
      return pathCovers(parent.scope, child.scope);

    case "net.http":
      return originCovers(parent.scope, child.scope);

    case "net.dns":
      return hostCovers(parent.scope, child.scope);

    case "model":
    case "spawn":
    case "context.read":
    case "context.write":
    case "tool":
      return idCovers(parent.scope, child.scope);
  }
}

// ─────────────────────────────────────────────────────────────
// Glob covers
// Uses the subset-of-patterns algorithm: a glob P covers C iff
// every string matching C also matches P. For `*` and `**` only,
// this reduces to segment-by-segment pattern containment.
// ─────────────────────────────────────────────────────────────

export function pathCovers(parent: string, child: string): boolean {
  const ps = parent.split("/");
  const cs = child.split("/");
  return segmentsCover(ps, cs);
}

/** Hostname cover: labels are ordered right-to-left for domain semantics. */
function hostCovers(parent: string, child: string): boolean {
  const pl = parent.toLowerCase().split(".");
  const cl = child.toLowerCase().split(".");
  // `*.foo.com` — leftmost `*` matches exactly one label.
  if (pl[0] === "*") {
    if (cl.length !== pl.length) return false;
    for (let i = 1; i < pl.length; i += 1) {
      if (pl[i] !== cl[i]) return false;
    }
    return true;
  }
  if (pl.length !== cl.length) return false;
  for (let i = 0; i < pl.length; i += 1) {
    if (pl[i] !== cl[i]) return false;
  }
  return true;
}

/**
 * origin-scope = host[:port][/path-scope]
 * Parent covers child iff parent's host covers child's host AND (parent
 * has no port OR ports match) AND (parent has no path OR parent path
 * covers child path).
 */
function originCovers(parent: string, child: string): boolean {
  const p = splitOrigin(parent);
  const c = splitOrigin(child);
  if (!hostCovers(p.host, c.host)) return false;
  if (p.port !== undefined) {
    if (c.port === undefined) return false;
    if (p.port !== c.port) return false;
  }
  if (p.path === null) return true; // parent has no path constraint
  if (c.path === null) return false; // child broader than parent
  return pathCovers(p.path, c.path);
}

function splitOrigin(scope: string): { host: string; port?: string; path: string | null } {
  const slash = scope.indexOf("/");
  const hostPort = slash < 0 ? scope : scope.slice(0, slash);
  const path = slash < 0 ? null : scope.slice(slash);
  const [host, port] = hostPort.split(":");
  return port !== undefined ? { host: host!, port, path } : { host: host!, path };
}

function idCovers(parent: string, child: string): boolean {
  // Ids use `/`, `-`, `.`, `:`, `@` and support `*`/`**` as wildcards.
  // Treat `/` as segment separator for coverage; other punctuation
  // literal. This handles `@framework/node-*` vs `@framework/node-foo`.
  const ps = parent.split("/");
  const cs = child.split("/");
  return segmentsCover(ps, cs);
}

/**
 * Segment-wise cover over globs with `*` (zero-or-more chars within a
 * segment) and `**` (zero or more whole segments). `*.ts` style globs
 * match within a segment; `**` spans segments.
 */
function segmentsCover(p: readonly string[], c: readonly string[]): boolean {
  function walk(pi: number, ci: number): boolean {
    while (pi < p.length && ci < c.length) {
      const pp = p[pi]!;
      const cc = c[ci]!;
      if (pp === "**") {
        for (let k = ci; k <= c.length; k += 1) {
          if (walk(pi + 1, k)) return true;
        }
        return false;
      }
      if (cc === "**") return false; // child broader than parent
      if (!segmentMatches(pp, cc)) return false;
      pi += 1;
      ci += 1;
    }
    while (pi < p.length && p[pi] === "**") pi += 1;
    return pi === p.length && ci === c.length;
  }
  return walk(0, 0);
}

/**
 * Does a parent segment pattern (possibly containing `*` within it)
 * cover a literal child segment? `*` matches zero or more chars that are
 * NOT the segment separator (already stripped by split). No regex, no
 * alternations — simple wildcard semantics.
 */
function segmentMatches(pattern: string, literal: string): boolean {
  if (pattern === literal) return true;
  if (!pattern.includes("*")) return false;
  // Compile pattern to a minimal matcher: split on '*' into literal parts;
  // ensure literal contains them in order with appropriate anchoring.
  const parts = pattern.split("*");
  let idx = 0;
  // Anchor start.
  if (parts[0] !== "") {
    if (!literal.startsWith(parts[0]!)) return false;
    idx = parts[0]!.length;
  }
  // Middle parts must appear in order.
  for (let i = 1; i < parts.length - 1; i += 1) {
    const part = parts[i]!;
    if (part === "") continue;
    const found = literal.indexOf(part, idx);
    if (found < 0) return false;
    idx = found + part.length;
  }
  // Anchor end.
  const last = parts[parts.length - 1]!;
  if (last !== "") {
    if (!literal.endsWith(last)) return false;
    if (literal.length - last.length < idx) return false;
  }
  return true;
}
