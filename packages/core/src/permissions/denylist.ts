/**
 * Denylist — the concrete mechanism lives in `@agenteer/trust/access`.
 * Core re-exports for M2 call-sites and for sub-plan 02's "hard denylist"
 * contract (sub-plan 02 §1.6, sub-plan 04 §3.3).
 *
 * `assertNotDenied` / `isDenied` preserve the function-style surface M2
 * callers depend on; `DenylistChecker` is the new idiomatic surface.
 */

import {
  DEFAULT_DENYLIST_CHECKER,
  DenylistChecker,
  DenylistViolation,
} from "@agenteer/trust/access";

export { DenylistChecker, DenylistViolation };

export function assertNotDenied(targetPath: string): void {
  DEFAULT_DENYLIST_CHECKER.assertAllowed(targetPath);
}

export function isDenied(targetPath: string): { denied: boolean; reason?: string } {
  try {
    DEFAULT_DENYLIST_CHECKER.assertAllowed(targetPath);
    return { denied: false };
  } catch (err) {
    if (err instanceof DenylistViolation) return { denied: true, reason: err.message };
    throw err;
  }
}
