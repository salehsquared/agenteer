# Tick 012: Self-Describing Navigation Events

Axis: question the research question itself.

## Deliverable

Responded to the Tick 011 challenge by making `research next` trace records self-describing.

Changes:

- Added `schemaVersion: 1` to `ResearchPacketNext`.
- Added `eventType: "research.packet.next"` to `ResearchPacketNext`.
- Trace JSONL records now carry their own schema and event type, instead of relying only on the renderer envelope.
- Updated focused test expectations.

This sharpens the question from "what did next output?" to "what kind of event is this record, and can future tooling classify it?"

## Verification

- `node npm-cli.js run build` passed.
- Ran `agenteer research next --packet <tmp> --trace --json`; the trace line included `schemaVersion` and `eventType`.

## Counter-Design Rejected

Rejected: adding artifact hashes to `research next` trace records.

Reason: hashes belong to manifest/provenance stages. `next` should identify navigation decisions, not become artifact validation.

## Next Tick

Tick 013, axis 1 faster/simpler: make trace verification easier by exposing a compact CLI-readable trace summary or improving render output only if it stays small.
