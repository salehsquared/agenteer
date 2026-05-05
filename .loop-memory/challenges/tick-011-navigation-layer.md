# Tick 011 Challenge: Navigation Layer Growth

Axis: challenge tick.

## Critique

The `research next` layer is becoming useful, but it now carries four responsibilities:

1. Project checkpoint state into a human-facing next action.
2. Explain missing gate commands.
3. Describe expected artifacts and artifact presence.
4. Optionally append a provenance trace.

That is acceptable for now, but the risk is that `next` becomes an informal state machine parallel to `checkpoint`, `pipeline-stages`, and `stage-gate`.

## Main Risks

- Schema drift: `ResearchPacketNext` is now a real contract, but it has no explicit schema version inside the object. Only the renderer wraps it with `schemaVersion`.
- Trace fragility: `navigation-trace.jsonl` records raw full objects. If the object changes, old traces remain readable but harder to compare.
- Decision id semantics: the id includes a timestamp, so it is unique but not content-stable. That is fine for event identity, not fine for deduplication.
- Exit status ambiguity: blocked navigation exits nonzero even when `--trace` succeeds. This is script-friendly for gating but awkward for audit-only runs.
- Evidence incompleteness: `expectedArtifacts.exists` reports presence, but not hash, size, or validation status.

## Recommended Response

Next implementation should harden schema rather than add more behavior.

Small target:

- Add `schemaVersion` and `eventType` directly to traced navigation records.
- Keep JSON renderer's envelope for compatibility, but make trace lines self-describing.
- Do not add hashing or validation yet; that belongs in manifest/provenance, not `next`.

## Counter-Design Rejected

Rejected: split `next` into separate `next`, `next-evidence`, and `next-trace` commands now.

Reason: that would make the CLI harder to learn before the contract has stabilized. A schema hardening pass is cheaper and gives us a better basis for future splitting if needed.
