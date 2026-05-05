# Tick 025: Event Pattern Documentation

Axis: faster/simpler.

## Web / Creativity Injection

Recent event/provenance standards and proposals emphasize stable event envelopes: schema version, event type, timestamp, event identity, actor or agent context, payload, and integrity metadata. The useful part for Agenteer right now is the envelope, not standards compliance.

Creative tail idea: a future research packet could emit a compact "research black box" event chain, with every approval, repair, execution, and report claim linked into one verifiable replay graph.

## Deliverable

Documented the local event-record pattern in `docs/research-pipeline.md`.

The note clarifies when packet artifacts should become event-shaped and what fields are expected.

## Verification

- Documentation-only tick; no build required for the doc text.

## Counter-Design Rejected

Rejected: adopting an external event schema wholesale right now.

Reason: the project needs a small local pattern first. External schema alignment should happen after the packet has enough real event types to map.

## Next Tick

Tick 026, axis 2 more robust: add a focused verifier for approval record hashes or defer that to a broader packet event verifier.
