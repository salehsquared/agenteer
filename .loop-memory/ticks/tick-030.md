# Tick 030: Packet Verify Scope Metadata

Axis: question the research question itself.

## Web / Creativity Injection

Provenance and supply-chain verification practices emphasize explicit predicate/scope: a verifier should say what class of evidence it checked, not imply universal validity. For research packets, this matters because integrity, reproducibility, methods validity, and claim validity are distinct.

Creative translation: `packet-verify` should be a dashboard of scoped verifiers, not a single "truth" stamp.

## Deliverable

Responded to the Tick 029 challenge by adding scope metadata to `packet-verify`.

Changes:

- Added `mode: "available-integrity"`.
- Added `scope: ["approval-record-hash", "navigation-trace-jsonl"]`.
- Human output now prints mode and scope before status.

No new checks were added.

## Verification

- `node npm-cli.js run build` passed.
- Ran `research next --trace --exit-zero-on-blocked`, then `research packet-verify`; output included `mode: available-integrity` and the exact scope list.

## Counter-Design Rejected

Rejected: broaden `packet-verify` into methods/report/manifest validation this tick.

Reason: scope metadata should land before broadening, so future additions are explicit and reviewable.

## Next Tick

Tick 031, axis 1 faster/simpler: consider whether command help/docs should show `packet-verify` near integrity commands.
