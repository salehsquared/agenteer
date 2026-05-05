# Tick 006: Evidence-Centered Navigation

Axis: question the research question itself.

## Deliverable

Responded to the Tick 005 challenge by making `agenteer research next` evidence-centered instead of command-only.

Changes:

- Added `ResearchPacketExpectedArtifact`.
- Extended `ResearchPacketNext` with `expectedArtifacts`.
- Derived expected artifacts from missing stage gates or the current stage.
- Updated text and JSON rendering so `next` reports both commands and success conditions.
- Updated the focused `research next` test expectations.

This reframes the question from "what command should I run?" to "what artifact proves the next step worked?"

## Verification

- `node npm-cli.js run build` passed.
- Ran `agenteer research next --packet <tmp> --json` against a hand-built packet with design, scout, runner spec, and approval artifacts. It correctly returned blocked analysis gates plus expected artifacts for `critique.json`, `methods-validation.json`, and `data-quality.json`.

## Counter-Design Rejected

Rejected: adding expected artifacts directly to `ResearchCheckpoint`.

Reason: `checkpoint` is the state engine; `next` is the human-facing navigation projection. Keeping the richer clearance language in `next` reduces drift while avoiding extra checkpoint payload churn.

## Next Tick

Tick 007, axis 1 faster/simpler: make the expected-artifact mapping less repetitive or more reusable without expanding scope.
