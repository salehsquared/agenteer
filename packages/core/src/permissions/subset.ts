/**
 * Subset check and CapabilitySet — pure functions over parsed caps.
 *
 * Sub-plan 02 §1.2. `isSubset(child, parent)` is the authoritative gate
 * the kernel uses at spawn time.
 */

import { type Capability, parseCapability, type ParsedCapability } from "./capability.js";
import { covers } from "./cover.js";

export interface CapabilitySet {
  readonly caps: ReadonlyArray<ParsedCapability>;
}

export function capabilitySet(raws: readonly (string | Capability)[] | CapabilitySet): CapabilitySet {
  if (isCapabilitySet(raws)) return raws;
  const parsed = raws.map((r) => parseCapability(r as string));
  return { caps: dedupe(parsed) };
}

export function emptyCapabilitySet(): CapabilitySet {
  return { caps: [] };
}

function isCapabilitySet(x: unknown): x is CapabilitySet {
  return typeof x === "object" && x !== null && Array.isArray((x as CapabilitySet).caps);
}

function dedupe(caps: ParsedCapability[]): ParsedCapability[] {
  const seen = new Set<string>();
  const out: ParsedCapability[] = [];
  for (const c of caps) {
    if (seen.has(c.raw)) continue;
    seen.add(c.raw);
    out.push(c);
  }
  return out;
}

export interface SubsetResult {
  readonly ok: boolean;
  readonly missing: ReadonlyArray<ParsedCapability>;
}

export function isSubset(child: CapabilitySet, parent: CapabilitySet): SubsetResult {
  const missing: ParsedCapability[] = [];
  for (const c of child.caps) {
    if (!parent.caps.some((p) => covers(p, c))) missing.push(c);
  }
  return { ok: missing.length === 0, missing };
}

/** Pure intersection: keeps child caps covered by parent. */
export function intersect(child: CapabilitySet, parent: CapabilitySet): CapabilitySet {
  const caps: ParsedCapability[] = [];
  for (const c of child.caps) {
    if (parent.caps.some((p) => covers(p, c))) caps.push(c);
  }
  return { caps: dedupe(caps) };
}

/** Does the granted set cover a synthetic "operation" capability? */
export function capabilityCoversOperation(
  granted: CapabilitySet,
  op: ParsedCapability,
): boolean {
  return granted.caps.some((g) => covers(g, op));
}

export function rawsOf(set: CapabilitySet): readonly Capability[] {
  return set.caps.map((c) => c.raw);
}
