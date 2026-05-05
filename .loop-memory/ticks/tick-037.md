# Tick 037: Reused Stage Commands In Packet Verify

Axis: faster/simpler.

## Deliverable

Simplified `packet-verify` missing-artifact next actions by reusing `commandForResearchStage` for approval and manifest commands.

This keeps command strings aligned with the stage-navigation helper instead of duplicating them in another verifier.

## Verification

- `node npm-cli.js run build` passed.
- Ran `research packet-verify` on a packet with only a navigation trace; `next` used the shared approval and manifest command forms.

## Counter-Design Rejected

Rejected: forcing navigation trace creation through `commandForResearchStage`.

Reason: `next --trace --exit-zero-on-blocked` is a navigation/audit action, not a pipeline stage command.

## Next Tick

Tick 038, axis 2 more robust: ensure manifest verification reports changed artifacts clearly with a CLI smoke test.
