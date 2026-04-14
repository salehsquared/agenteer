/**
 * AccessViolation discriminator — sub-plan 04 §3.4. Marked experimental
 * at v1; the set of violation types may grow as the access model
 * generalizes beyond fs (net egress, ctx mutation).
 */

export type AccessViolation =
  | { type: "unauthorized_write"; path: string; nodeId: string; reason: string }
  | { type: "unauthorized_delete"; path: string; nodeId: string; reason: string }
  | { type: "unauthorized_read"; path: string; nodeId: string; reason: string }
  | { type: "denylist_hit"; path: string; nodeId: string; rule: string }
  | { type: "snapshot_mismatch"; path: string; nodeId: string; beforeHash?: string; afterHash?: string };

export type AccessViolationPolicy = "fail" | "warn" | "off";

export class AccessViolationError extends Error {
  constructor(readonly violations: readonly AccessViolation[]) {
    super(
      `access violations: ${violations.map((v) => `${v.type}:${v.path ?? "(n/a)"}`).join(", ")}`,
    );
    this.name = "AccessViolationError";
  }
}
