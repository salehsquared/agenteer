# Tick 033: Help Scope Decision

Axis: remove or merge a primitive.

## Deliverable

Wrote `.loop-memory/ticks/tick-033-help-scope.md`.

Decision: defer subcommand-scoped help until there is a broader CLI command registry or help ergonomics pass.

## Verification

- Verified by reading loop memory and writing the design note.
- No code changed this tick.

## Counter-Design Rejected

Rejected: implement `agenteer research --help` now by printing the same global usage.

Reason: that would be a shallow alias, not real scoped help.

## Next Tick

Tick 034, axis 4 add primitive: add one narrowly useful verifier scope if it composes an existing artifact check, likely manifest presence/coverage.
