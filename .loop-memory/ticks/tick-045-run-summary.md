# Tick 045 Run Summary: Navigation And Integrity Layer

Axis: remove or merge a primitive.

## Web / Creativity Injection

The latest agent workflow material points in a consistent direction:

- Durable checkpoints prevent lost state and duplicate work.
- Structured human-in-the-loop records are more useful than final approval buttons.
- Verification should be layered: integrity, provenance, methods, claims, and execution environment are different checks.
- Research-object style packaging should include artifact bytes, provenance, and accountability records.

Tail-end idea for later: a `research flight recorder` that emits one append-only, hash-chained event stream across design, critique, approval, execution, repair, report QA, export, and user overrides, then exports a replayable research object with selective disclosure.

## What This Run Built

Ticks 006-045 turned the research packet navigation and integrity layer from simple command suggestions into a small, inspectable verification subsystem.

Major improvements:

- `research next` now reports expected artifacts and whether they are present.
- `research next --trace` writes self-describing `research.packet.next` events.
- Navigation trace events have decision ids, schema/event type, and lightweight SHA-256 hash chaining.
- `research navigation-trace` reads and validates the trace, including malformed line counts, event types, and hash-chain status.
- Approval artifacts are event-shaped with schema, event type, decision id, and record hash.
- `research approval-verify` validates approval hashes.
- `research manifest-verify` validates artifact manifest hashes, byte counts, and missing files.
- `research packet-verify` aggregates available integrity checks with explicit `mode`, `scope`, `summary`, `nextAction`, and export integrity readiness.
- Docs now distinguish checkpoint state, stage gates, next-action clearance, event records, and manifest integrity.

## What Not To Merge Yet

Do not merge all integrity concepts into one generic event framework yet.

The next remove/merge target should be narrower:

- Keep `checkpoint` as workflow state.
- Keep `stage-gate` as deterministic policy.
- Keep `next` as human/script clearance.
- Keep `packet-verify` as an aggregator.
- Eventually extract a shared packet-event utility only when execution, repair, or report QA also emit event-shaped artifacts.

## Best Next Implementation Target

Add one scientific validity verifier to `packet-verify` as a separate mode/scope, not mixed into available integrity.

Candidate:

```txt
mode: available-integrity
scope: approval-record-hash, navigation-trace-jsonl, artifact-manifest-hashes

future mode: research-readiness
scope: methods-validation, report-review, claim-guard, provenance-graph
```

The next useful implementation is probably `research packet-readiness --packet <dir> [--json]`, which composes checkpoint, methods validation, report review, claim guard, provenance, and packet verification while clearly saying it is still not causal/scientific truth.

## Counter-Design Rejected

Rejected: fold everything into `packet-verify` immediately.

Reason: integrity verification and research validity are different layers. The pipeline is stronger if those layers stay explicit and then are composed.
