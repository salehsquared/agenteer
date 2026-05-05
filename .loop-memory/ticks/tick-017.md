# Tick 017: Trace Reader Scope Challenge

Axis: challenge tick.

## Deliverable

Wrote `.loop-memory/challenges/tick-017-trace-reader-scope.md`.

The critique recommends keeping `navigation-trace` narrow while adding validation: malformed line counts and event-type counts.

## Verification

- Verified by reading loop memory and writing the challenge artifact.
- No code was changed, as required for a challenge tick.

## Counter-Design Rejected

Rejected: immediately replace `navigation-trace` with a generic `research events` command.

Reason: there is currently only one event type written by this path, so a generic event reader would imply an architecture that does not exist yet.

## Next Tick

Tick 018, axis 6 question: respond by adding trace validation fields without generalizing into an event bus.
