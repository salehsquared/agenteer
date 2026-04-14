/**
 * `searchNodes` — npm search filtered to our `framework-node` keyword,
 * with an optional curated-index annotation (sub-plan 02 §3.2).
 *
 * The curated index is a flat JSON array `[{ id, note }]` in the
 * framework's docs repo. For this package we accept a pre-loaded array
 * so consumers can fetch / cache it however they like — keeps this
 * module free of HTTP concerns.
 */

import { DefaultNpmRunner, type NpmRunner, type NpmSearchHit } from "./npm-runner.js";

const KEYWORD = "framework-node";

export interface CuratedEntry {
  id: string;
  note?: string;
}

export interface SearchHit {
  name: string;
  version: string;
  description: string;
  keywords: string[];
  date?: string;
  curated: boolean;
  /** Free-text note from the curated index when curated=true. */
  curated_note?: string;
}

export interface SearchOptions {
  npm?: NpmRunner;
  curated?: readonly CuratedEntry[];
  registry?: string;
}

export async function searchNodes(
  query: string,
  opts: SearchOptions = {},
): Promise<SearchHit[]> {
  const npm = opts.npm ?? new DefaultNpmRunner();
  const hits: NpmSearchHit[] = await npm.search(`keywords:${KEYWORD} ${query}`, {
    ...(opts.registry ? { registry: opts.registry } : {}),
  });
  const curated = new Map<string, CuratedEntry>();
  for (const c of opts.curated ?? []) curated.set(c.id, c);

  return hits
    .filter((h) => (h.keywords ?? []).includes(KEYWORD))
    .map((h) => {
      const note = curated.get(h.name);
      return {
        name: h.name,
        version: h.version,
        description: h.description ?? "",
        keywords: h.keywords ?? [],
        ...(h.date ? { date: h.date } : {}),
        curated: note !== undefined,
        ...(note?.note !== undefined ? { curated_note: note.note } : {}),
      };
    })
    .sort((a, b) => {
      // Curated results first, then alphabetical.
      if (a.curated !== b.curated) return a.curated ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
}
