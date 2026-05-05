# Tick 031: Verification Command Discoverability

Axis: faster/simpler.

## Deliverable

Updated `docs/research-pipeline.md` command lists to include:

- `research next`
- `research navigation-trace`
- `research approval-verify`
- `research packet-verify`

This keeps the new verification path discoverable without adding new prose sections.

## Verification

- Documentation-only tick; verified by patch review.

## Counter-Design Rejected

Rejected: adding a separate "Integrity CLI" docs section now.

Reason: the command list is enough while the integrity surface is still small.

## Next Tick

Tick 032, axis 2 more robust: verify command help and TypeScript build still agree with docs.
