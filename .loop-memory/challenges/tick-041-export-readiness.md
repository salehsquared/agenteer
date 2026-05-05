# Tick 041 Challenge: Export Readiness Granularity

Axis: challenge tick.

## Critique

`exportIntegrityReady` is useful, but a boolean is intentionally coarse. It currently means the artifact manifest exists and verifies. It does not mean the packet is ready to be exported as a scientifically complete research object.

Risk:

- Users may read `exportIntegrityReady: true` as "safe to publish."
- It ignores approval, navigation trace, report review, methods validation, provenance graph, and RO-Crate metadata.
- It does not tell users whether export would copy a stale or incomplete packet; it only confirms the manifest matches current bytes.

## Recommendation

Keep the boolean, but add a more explicit readiness level or reason.

Small target:

- Add `exportIntegrityReason`.
- For true: "artifact manifest exists and matches packet artifacts."
- For false: include manifest verifier status and first issue.

Do not enforce export blocking yet.

## Counter-Design Rejected

Rejected: replace the boolean with a multi-level export readiness enum now.

Reason: the current field is specifically about integrity readiness, not full export readiness. A reason string should be enough for the next iteration.
