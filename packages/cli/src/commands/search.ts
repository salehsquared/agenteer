/**
 * `agenteer search <query>` — wraps `@agenteer/registry#searchNodes`.
 * Library form returns hits; bin renders a per-line summary.
 */

import { searchNodes, type SearchHit, type SearchOptions } from "@agenteer/registry";

export async function searchCommand(query: string, opts: SearchOptions = {}): Promise<SearchHit[]> {
  return searchNodes(query, opts);
}

export function renderSearchHits(hits: readonly SearchHit[]): string {
  if (hits.length === 0) return "  (no matching packages)";
  return hits
    .map((h) => {
      const tag = h.curated ? "[curated]" : "         ";
      const note = h.curated_note ? ` — ${h.curated_note}` : "";
      return `  ${tag} ${h.name}@${h.version}  ${h.description}${note}`;
    })
    .join("\n");
}
