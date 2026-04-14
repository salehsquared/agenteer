/**
 * ctx_patch builders for stdlib authors (sub-plan 03 §S.4).
 *
 * Keeps stdlib code terse: `mergeSetArtifacts({ "plan.head": plan })`
 * instead of spelling out the `asArtifact` wrapper per entry.
 */

import { asArtifact, type CtxArtifactMarker, type CtxPatch } from "@agenteer/core";

export function setArtifacts(
  entries: Record<string, { body: unknown; media_type?: string; schema_ref?: string }>,
): Pick<CtxPatch, "set"> {
  const set: Record<string, CtxArtifactMarker> = {};
  for (const [key, spec] of Object.entries(entries)) {
    set[key] = asArtifact(spec.body, {
      ...(spec.media_type !== undefined ? { media_type: spec.media_type } : {}),
      ...(spec.schema_ref !== undefined ? { schema_ref: spec.schema_ref } : {}),
    });
  }
  return { set };
}

export function mergePatches(...patches: (CtxPatch | undefined)[]): CtxPatch | undefined {
  const set: Record<string, unknown> = {};
  const del: string[] = [];
  const append: Record<string, unknown[]> = {};
  let any = false;
  for (const p of patches) {
    if (!p) continue;
    any = true;
    if (p.set) Object.assign(set, p.set);
    if (p.delete) del.push(...p.delete);
    if (p.append) {
      for (const [k, vs] of Object.entries(p.append)) {
        append[k] = [...(append[k] ?? []), ...vs];
      }
    }
  }
  if (!any) return undefined;
  const out: CtxPatch = {};
  if (Object.keys(set).length) out.set = set;
  if (del.length) out.delete = del;
  if (Object.keys(append).length) out.append = append;
  return out;
}
