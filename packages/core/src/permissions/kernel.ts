/**
 * Permission kernel — `authorizeSpawn` entry point.
 *
 * Sub-plan 02 §1.3. No I/O, no state. Every spawn flows through this
 * function. The runtime calls it; tests can import it directly.
 *
 * Invariants (enforced here):
 *   1. granted = intersect(childManifestRequired, parentAttenuation ?? parentEffective)
 *   2. childManifestRequired ⊆ (parentAttenuation ?? parentEffective) else deny
 *   3. parentAttenuation ⊆ parentEffective else deny  (parent cannot inject caps it doesn't hold)
 *   4. Deny returns structured reason + missing[]; never a stringly error.
 */

import type { ParsedCapability } from "./capability.js";
import {
  type CapabilitySet,
  intersect,
  isSubset,
} from "./subset.js";

export type AuthorizeSpawnAllow = {
  readonly ok: true;
  readonly granted: CapabilitySet;
};

export type AuthorizeSpawnDeny = {
  readonly ok: false;
  readonly reason:
    | "parent_cannot_attenuate_beyond_effective"
    | "child_required_not_covered"
    | "denylist_violation";
  readonly missing: ReadonlyArray<ParsedCapability>;
  readonly detail?: string;
};

export type AuthorizeSpawnResult = AuthorizeSpawnAllow | AuthorizeSpawnDeny;

export interface AuthorizeSpawnArgs {
  readonly parentEffective: CapabilitySet;
  readonly childManifestRequired: CapabilitySet;
  /** Explicit grant; defaults to parentEffective. */
  readonly parentAttenuation?: CapabilitySet;
  readonly childManifestId: string;
  readonly parentNodeId: string;
}

export function authorizeSpawn(args: AuthorizeSpawnArgs): AuthorizeSpawnResult {
  const attn = args.parentAttenuation ?? args.parentEffective;

  // Invariant 3: attenuation ⊆ parentEffective.
  const attnCheck = isSubset(attn, args.parentEffective);
  if (!attnCheck.ok) {
    return {
      ok: false,
      reason: "parent_cannot_attenuate_beyond_effective",
      missing: attnCheck.missing,
      detail: `parent ${args.parentNodeId} attempted attenuation that exceeds its effective set`,
    };
  }

  // Invariant 2: every child-required cap must be covered by the attenuation.
  const requiredCheck = isSubset(args.childManifestRequired, attn);
  if (!requiredCheck.ok) {
    return {
      ok: false,
      reason: "child_required_not_covered",
      missing: requiredCheck.missing,
      detail: `child manifest ${args.childManifestId} requires capabilities not held by parent`,
    };
  }

  // Invariant 1: granted = intersection(childRequired, attenuation).
  const granted = intersect(args.childManifestRequired, attn);
  return { ok: true, granted };
}
