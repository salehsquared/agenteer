# Tick 040: Export Integrity Readiness

Axis: add a primitive.

## Web / Creativity Injection

Workflow Run RO-Crate and related reproducible research packaging work emphasize bundling artifacts with provenance and checksums. For Agenteer, the immediate practical bridge is simple: export readiness should know whether the recorded packet manifest still matches packet bytes.

Creative tail idea: future packet export could refuse to export unless integrity scope passes, then embed the verifier result into RO-Crate metadata as a machine-readable conformance note.

## Deliverable

Added `exportIntegrityReady` to `research packet-verify`.

It is true when `manifest-verify` is valid, independent of whether other available integrity checks are missing.

## Verification

- `node npm-cli.js run build` passed.
- Created a temp packet with `design.json`, generated a manifest, then ran `packet-verify`; output showed `export integrity ready: true` and `manifest: valid`.

## Counter-Design Rejected

Rejected: block `research export` on `packet-verify` immediately.

Reason: export behavior changes are higher impact. Readiness should be observable before it becomes enforced.

## Next Tick

Tick 041, axis 5 challenge: critique whether export readiness as a boolean is too coarse.
