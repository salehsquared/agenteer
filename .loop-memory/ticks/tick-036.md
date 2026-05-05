# Tick 036: Packet Verify Summary And Next Action

Axis: question the research question itself.

## Deliverable

Responded to the Tick 035 challenge by adding interpretive language to `packet-verify`.

Changes:

- Added `summary`.
- Added `nextAction`.
- `pass` now explicitly says available integrity checks passed, not that scientific methods or claims are valid.
- `incomplete` now recommends commands to create missing integrity artifacts.
- `fail` points users at the narrow failing verifiers.

No checks were broadened.

## Verification

- `node npm-cli.js run build` passed.
- Ran `research next --trace --exit-zero-on-blocked`, then `research packet-verify`; output included summary and next commands for missing approval and manifest artifacts.

## Counter-Design Rejected

Rejected: rename status `pass` to `integrity_pass` throughout the API.

Reason: `mode`, `scope`, and `summary` now disambiguate the status without creating awkward status strings.

## Next Tick

Tick 037, axis 1 faster/simpler: reduce repeated command strings in `packet-verify` next actions if it can reuse existing command helpers.
