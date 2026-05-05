# Tick 021 Design Note: Hash Chain Scope

Axis: remove or merge a primitive.

## Decision

Keep the hash-chain helpers local to navigation tracing for now.

Current helper responsibilities:

- Find the last valid navigation trace record hash.
- Hash a single `research.packet.next` event.
- Validate that each line links to the previous record.

These are not yet general enough for provenance reuse because they assume:

- JSONL location: `navigation-trace.jsonl`.
- Event shape: `ResearchPacketNext`.
- Chain root: first event starts with `previousRecordHash: null`.
- Failure behavior: trace inspection reports status, not repair guidance.

## Extraction Trigger

Extract a generic event-chain utility only after at least one more stage writes chained events, such as approval, repair, execution, or report QA.

Candidate future shape:

```ts
appendChainedEvent(path, eventWithoutHash): Promise<ChainedEvent>
readChainedEvents(path): Promise<ChainedEventSummary>
```

## Counter-Design Rejected

Rejected: immediately moving the helper into a shared provenance module.

Reason: shared provenance utilities should be designed around at least two event types. Extracting now would make navigation assumptions look generic.
