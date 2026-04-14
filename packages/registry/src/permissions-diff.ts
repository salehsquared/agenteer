/**
 * Permission-diff at install time (sub-plan 02 §3.7 UX).
 *
 * The install prompt must tell the user *specifically* which caps a
 * package requires that are NOT already in the workflow's root grants —
 * that's the value the prompt adds over a plain `npm install`.
 *
 * We reuse the kernel's subset algorithm (`isSubset`) to compute the
 * additional caps needed, rather than hand-rolling a glob comparison
 * that'd drift out of sync with the kernel.
 */

import {
  capabilitySet,
  isSubset,
  parseCapabilitySet,
  rawsOf,
  type CapabilitySet,
  type Capability,
} from "@agenteer/core";

export interface PermissionsDiff {
  required: readonly string[];
  granted: readonly string[];
  /** Already covered by `granted`. */
  already_covered: readonly string[];
  /** NOT covered; user must grant to install safely. */
  new_required: readonly string[];
}

export function diffPermissions(args: {
  required: readonly string[];
  granted: readonly string[];
}): PermissionsDiff {
  const requiredSet = parseCapabilitySet(args.required);
  const grantedSet = parseCapabilitySet(args.granted);

  if (isSubset(requiredSet, grantedSet).ok) {
    return {
      required: args.required,
      granted: args.granted,
      already_covered: args.required,
      new_required: [],
    };
  }

  // Per-capability subset check: each required cap individually tested
  // against the full granted set.
  const covered: string[] = [];
  const missing: string[] = [];
  for (const cap of args.required) {
    const singleton = parseCapabilitySet([cap]);
    if (isSubset(singleton, grantedSet).ok) {
      covered.push(cap);
    } else {
      missing.push(cap);
    }
  }
  return {
    required: args.required,
    granted: args.granted,
    already_covered: covered,
    new_required: missing,
  };
}

/** Pretty-print a diff for a CLI prompt. */
export function renderPermissionsDiff(
  pkgName: string,
  pkgVersion: string,
  diff: PermissionsDiff,
): string {
  const out: string[] = [];
  out.push(`Installing ${pkgName}@${pkgVersion}`);
  if (diff.required.length === 0) {
    out.push(`  Required actions: (none)`);
  } else {
    out.push(`  Required actions:`);
    for (const c of diff.required) out.push(`    - ${c}`);
  }
  if (diff.new_required.length === 0) {
    out.push(`  All required actions already covered by workflow grants.`);
  } else {
    out.push(`  These permissions exceed your current workflow root by:`);
    for (const c of diff.new_required) out.push(`    + ${c}   (not currently granted)`);
  }
  return out.join("\n");
}

// Helpers consumed elsewhere: expose a pre-parsed CapabilitySet shape so
// callers can also diff directly against an internal CapabilitySet.
export function capsOf(raws: readonly string[]): CapabilitySet {
  return capabilitySet(raws);
}

export function capStrings(set: CapabilitySet): string[] {
  return rawsOf(set).map((c: Capability) => c as unknown as string);
}
