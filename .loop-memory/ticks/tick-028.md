# Tick 028: Packet Verification Aggregator

Axis: add a primitive.

## Deliverable

Added `agenteer research packet-verify --packet <dir> [--json]`.

The command only composes existing verifiers:

- `approval-verify`
- `navigation-trace`

It returns:

- `pass` when both are valid.
- `fail` when any present verifier is invalid.
- `incomplete` when expected integrity artifacts are missing.

## Verification

- `node npm-cli.js run build` passed.
- Ran `research next --trace --exit-zero-on-blocked`, then `research packet-verify --json`; it reported `status: incomplete` because approval was missing while navigation trace was valid.

## Counter-Design Rejected

Rejected: adding new packet-level validation rules inside `packet-verify`.

Reason: this tick was only allowed to aggregate existing verifiers. New integrity rules need their own focused tick.

## Next Tick

Tick 029, axis 5 challenge: critique whether `packet-verify` is too early or whether its incomplete/pass/fail model is useful enough.
