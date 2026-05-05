# Tick 016: Navigation Trace Reader

Axis: add a primitive.

## Deliverable

Added `agenteer research navigation-trace --packet <dir> [--json]`.

The command reads `navigation-trace.jsonl` and reports whether it exists, how many events it contains, and the last navigation decision. It does not infer packet state or execute anything.

## Verification

- `node npm-cli.js run build` passed.
- Ran `research next --trace --exit-zero-on-blocked`, then `research navigation-trace --json`; the summary reported one event and returned the last `research.packet.next` decision.

## Counter-Design Rejected

Rejected: adding navigation trace data to `packet-summary`.

Reason: trace inspection is useful, but packet summary should not grow every side-channel artifact by default.

## Next Tick

Tick 017, axis 5 challenge: critique whether `navigation-trace` is too narrow or whether it should stay narrow until multiple trace event types exist.
