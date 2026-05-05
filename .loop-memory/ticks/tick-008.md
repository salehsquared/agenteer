# Tick 008: Artifact Presence In Navigation

Axis: more robust.

## Deliverable

Extended `ResearchPacketExpectedArtifact` with `exists` and made `research next` check packet-local artifact presence before rendering.

This makes navigation more robust because a human or script can see whether each success-condition artifact is already present or still missing.

## Verification

- `node npm-cli.js run build` passed.
- Ran `agenteer research next --packet <tmp>` against a blocked analysis packet. Output now labels expected artifacts as `required, missing`.

## Counter-Design Rejected

Rejected: treating a present artifact as sufficient proof of correctness.

Reason: presence only proves the artifact exists. Correctness still belongs to validation, critique, review, and manifest checks.

## Next Tick

Tick 009, axis 3 remove/merge: reduce duplicated stage-to-artifact filename logic between checkpoint artifact detection and the new expected artifact registry.
