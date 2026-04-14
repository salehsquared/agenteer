/**
 * npm provenance helpers (sub-plan 02 §3.5).
 *
 * v1 stance: we treat provenance presence as a signal, not a gate, except
 * for `@agenteer/*` packages which REQUIRE it. The actual cryptographic
 * verification is done by `npm` itself during install (it raises a
 * warning with `npm install --provenance`). We read the attestations
 * block from `npm view` output so the install prompt can surface status.
 */

import type { NpmViewResult } from "./npm-runner.js";

export interface ProvenanceStatus {
  present: boolean;
  /** True when the package is `@agenteer/*` — triggers "required" enforcement. */
  is_first_party: boolean;
  /** The first provenance identifier when present; helpful for the UI. */
  predicate_type?: string;
  /** Raw attestations block for advanced inspection. */
  raw?: unknown;
}

export function provenanceFromView(
  pkgName: string,
  view: NpmViewResult | null,
): ProvenanceStatus {
  const isFirstParty = pkgName.startsWith("@agenteer/");
  const attestations = view?.dist?.attestations as
    | {
        url?: string;
        provenance?: { predicateType?: string };
      }
    | undefined;
  const present = Boolean(attestations && attestations.provenance);
  const status: ProvenanceStatus = { present, is_first_party: isFirstParty };
  if (attestations?.provenance?.predicateType) {
    status.predicate_type = attestations.provenance.predicateType;
  }
  if (attestations !== undefined) status.raw = attestations;
  return status;
}

export function renderProvenanceLine(status: ProvenanceStatus): string {
  if (status.present) {
    return `Provenance: [OK]${status.predicate_type ? ` (${status.predicate_type})` : ""}`;
  }
  return `Provenance: [missing]${status.is_first_party ? " (REQUIRED for @agenteer/*)" : ""}`;
}
