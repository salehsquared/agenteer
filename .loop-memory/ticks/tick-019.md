# Tick 019: Trace Summary Status

Axis: faster/simpler.

## Deliverable

Added a compact `status` field to `ResearchNavigationTraceSummary`.

Values:

- `missing`: no `navigation-trace.jsonl`.
- `valid`: trace exists and all lines parse.
- `invalid`: trace exists but has malformed lines.

This makes trace inspection faster for humans while preserving detailed counts.

## Verification

- `node npm-cli.js run build` passed.
- Ran `research navigation-trace --packet <tmp>` on a valid one-line trace and confirmed human output starts with `status: valid`.

## Counter-Design Rejected

Rejected: hiding malformed line and event type details once status exists.

Reason: the status is the fast read; the details are still needed for debugging and scripts.

## Next Tick

Tick 020, axis 2 more robust plus web/creativity: research trace/provenance robustness and decide whether navigation trace records need chaining or whether that belongs elsewhere.
