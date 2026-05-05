# Tick 020: Lightweight Trace Hash Chain

Axis: more robust.

## Web / Creativity Injection

Recent agent audit tooling and papers repeatedly point toward tamper-evident traces: hash chains, signatures, receipts, and externally anchored audit records. The useful idea for this project is not full compliance infrastructure yet; it is a local integrity check that detects accidental edits, truncation, or malformed trace lines.

Tail-end idea considered: every research packet eventually gets a signed "research flight recorder" whose event chain spans planning, critique, approval, execution, repair, report QA, and export.

## Deliverable

Added lightweight hash chaining to navigation trace events.

Changes:

- `ResearchPacketNext` now includes `previousRecordHash` and `recordHash`.
- `research next --trace` links each new event to the previous trace record hash.
- `research navigation-trace` now reports `hashChainStatus`.
- Trace status becomes `invalid` if the chain is broken.

## Verification

- `node npm-cli.js run build` passed.
- Wrote two `research next --trace` events, then ran `research navigation-trace`; it reported `events: 2` and `hash chain: valid`.

## Counter-Design Rejected

Rejected: Ed25519 signatures or external timestamp anchoring now.

Reason: local SHA-256 chaining is enough for a research packet dogfood loop. Signatures and anchoring belong in a later provenance/security layer.

## Next Tick

Tick 021, axis 3 remove/merge: decide whether trace hash-chain logic should stay local to navigation or be isolated for later provenance reuse.
