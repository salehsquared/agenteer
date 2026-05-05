# Tick 022: Approval Event Metadata

Axis: add a primitive.

## Deliverable

Made approval artifacts event-like records.

Changes:

- `ResearchApprovalRecord` now includes `schemaVersion`.
- Added `eventType: "research.packet.approval"`.
- Added a 16-character `decisionId`.
- Added a SHA-256 `recordHash`.

This creates a second event-producing stage without inventing a general event bus yet.

## Verification

- `node npm-cli.js run build` passed.
- Ran `research design`, `research scout`, and `research approve` against the read-only MedBrevia repo as input. `approval.json` included `eventType`, `decisionId`, and `recordHash`.

## Counter-Design Rejected

Rejected: adding `approval-trace.jsonl`.

Reason: approval already writes a durable packet artifact. Making that artifact event-shaped is simpler than adding another side-channel trace file.

## Next Tick

Tick 023, axis 5 challenge: critique whether approval event metadata is enough, or whether the next step should extract shared event hashing.
