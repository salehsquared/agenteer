# Tick 034: Manifest Verification

Axis: add a primitive.

## Deliverable

Added `agenteer research manifest-verify --packet <dir> [--json]`.

Changes:

- Added `ResearchManifestVerification`.
- Verifies `artifact-manifest.json` entries by checking artifact presence, byte count, and SHA-256.
- Added manifest verification into `packet-verify` scope as `artifact-manifest-hashes`.
- Added focused test expectations.

## Verification

- `node npm-cli.js run build` passed.
- Ran `research manifest` and `research manifest-verify --json` against a temp packet; verifier returned `status: valid`.

## Counter-Design Rejected

Rejected: make `manifest-verify` regenerate the manifest automatically.

Reason: verification should compare current files to the recorded manifest. Regeneration would hide drift instead of reporting it.

## Next Tick

Tick 035, axis 5 challenge plus web/creativity: critique the verification stack now that it includes approval, navigation trace, and manifest checks.
