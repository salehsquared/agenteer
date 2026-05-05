# Tick 018: Navigation Trace Validation

Axis: question the research question itself.

## Deliverable

Responded to the Tick 017 challenge by validating the narrow `navigation-trace.jsonl` file instead of generalizing it.

Changes:

- Added `malformedLines` to `ResearchNavigationTraceSummary`.
- Added `eventTypes` counts.
- `research navigation-trace` now exits nonzero when the trace exists but contains malformed JSONL.
- Added focused tests for valid and malformed trace summaries.

This keeps the question narrow: "Is the navigation trace readable and what event types does it contain?"

## Verification

- `node npm-cli.js run build` passed.
- Ran `research navigation-trace --packet <tmp> --json` on a trace with one valid line and one malformed line; output reported `malformedLines: 1` and exit code `1`.

## Counter-Design Rejected

Rejected: generalizing this into a full event-log validator.

Reason: only navigation events are currently written through this path. General event validation should wait until there are multiple event-producing stages.

## Next Tick

Tick 019, axis 1 faster/simpler: simplify the trace summary output if it is too noisy for humans.
