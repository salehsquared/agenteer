# Tick 023 Challenge: Event Metadata Extraction

Axis: challenge tick.

## Critique

Approval records now share the basic event pattern with navigation decisions: schema version, event type, decision id, and record hash. That is a useful convergence, but it is still not a complete event system.

Weaknesses:

- Navigation events are chained; approval events are standalone.
- Navigation hashing uses a helper; approval hashing is inline.
- The hash canonicalization is plain `JSON.stringify`, which is deterministic enough for local Node objects but not a cross-language canonical JSON guarantee.
- There is no shared interface for "packet event" yet.
- There is no event verification command for approval records.

## Recommendation

Extract only the smallest shared hashing primitive next.

Small target:

- Add a local `hashResearchEventRecord` helper.
- Use it for navigation and approval records.
- Do not create a public event framework, event bus, or generic event CLI yet.

This removes duplication while avoiding a fake architecture.

## Counter-Design Rejected

Rejected: immediately add chain fields to `approval.json`.

Reason: approval is already a durable artifact, not an append-only stream. Chaining standalone artifacts should be designed as part of packet manifest/provenance, not one-off approval metadata.
