# Tick 026: Approval Hash Verification

Axis: more robust.

## Deliverable

Added `agenteer research approval-verify --packet <dir> [--json]`.

The command verifies `approval.json` by recomputing the record hash without the `recordHash` field and comparing it with the stored hash.

## Verification

- `node npm-cli.js run build` passed.
- Ran design, scout, approve, and approval-verify against the read-only MedBrevia repo as input. Verification returned `status: valid`.

## Counter-Design Rejected

Rejected: wait for a broader packet event verifier before checking approval hashes.

Reason: approval already has a hash, so leaving it unverifiable would make the integrity field decorative.

## Next Tick

Tick 027, axis 3 remove/merge: decide whether `approval-verify` should be folded into `checkpoint`/`packet-summary` or remain a narrow verifier.
