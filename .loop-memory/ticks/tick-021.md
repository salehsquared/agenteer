# Tick 021: Hash Chain Scope Decision

Axis: remove or merge a primitive.

## Deliverable

Wrote `.loop-memory/ticks/tick-021-hash-chain-scope.md`.

Decision: keep navigation hash-chain helpers local until another packet stage emits chained events.

## Verification

- Verified by reading loop memory and writing the design note.
- No code changed this tick.

## Counter-Design Rejected

Rejected: immediately moving the helper into a shared provenance module.

Reason: shared provenance utilities should be designed around at least two event types. Extracting now would make navigation assumptions look generic.

## Next Tick

Tick 022, axis 4 add primitive: add one more event-producing stage only if it is small and clearly useful; approval tracing is the likely candidate.
