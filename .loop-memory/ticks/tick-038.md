# Tick 038: Manifest Drift Smoke Test

Axis: more robust.

## Deliverable

Smoke-tested `manifest-verify` against a real changed packet artifact.

Procedure:

- Created a design packet from the read-only MedBrevia repo.
- Generated `artifact-manifest.json`.
- Mutated `design.json`.
- Ran `research manifest-verify --json`.

Result: the verifier returned `status: invalid`, exit code `1`, and clear issues for `design.json byte count changed` and `design.json sha256 changed`.

## Verification

- CLI smoke test described above.

## Counter-Design Rejected

Rejected: changing manifest verifier messaging this tick.

Reason: the current drift messages are already specific enough for the common changed-artifact case.

## Next Tick

Tick 039, axis 3 remove/merge: decide whether manifest verification should be documented under event records or under packet export/reproducibility.
