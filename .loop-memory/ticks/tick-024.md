# Tick 024: Shared Event Hash Helper

Axis: question the research question itself.

## Deliverable

Responded to the Tick 023 challenge by extracting only a tiny shared event hash helper.

Changes:

- Added `hashResearchEventRecord(event)`.
- Used it for approval record hashes.
- Used it for navigation trace record hashes and validation.
- Removed the navigation-specific hash helper name.

This asks: "What is the minimum shared event abstraction that reduces duplication without inventing a framework?"

## Verification

- `node npm-cli.js run build` passed.
- Ran design, scout, and approve against the read-only MedBrevia repo as input; `approval.json` still included a `recordHash`.

## Counter-Design Rejected

Rejected: introducing a public `ResearchEvent` union type now.

Reason: the shared behavior is hashing, not yet lifecycle management. A union type can wait until there are more event-shaped artifacts.

## Next Tick

Tick 025, axis 1 faster/simpler plus web/creativity: simplify or document the event pattern before more event-shaped artifacts are added.
