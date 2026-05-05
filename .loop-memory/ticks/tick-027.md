# Tick 027: Approval Verify Scope

Axis: remove or merge a primitive.

## Deliverable

Wrote `.loop-memory/ticks/tick-027-approval-verify-scope.md`.

Decision: keep `approval-verify` narrow until a real `packet-verify` aggregator exists.

## Verification

- Verified by reading loop memory and writing the design note.
- No code changed this tick.

## Counter-Design Rejected

Rejected: adding approval verification into `checkpoint`.

Reason: checkpoint answers workflow position, not artifact integrity.

## Next Tick

Tick 028, axis 4 add primitive: add a first narrow `packet-verify` aggregator only if it can reuse existing verifiers without new validation logic.
