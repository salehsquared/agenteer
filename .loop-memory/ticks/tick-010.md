# Tick 010: Traceable Next Decisions

Axis: add a primitive.

## Web / Creativity Injection

External signals reviewed this tick emphasized that agent checkpoints are not enough by themselves. The stronger pattern is decision-level provenance: record intent, observed state, recommended action, evidence chain, and human authorization context.

Useful concepts:

- Checkpoints preserve resumable state.
- Agent execution records preserve why a step was selected.
- Scientific AI governance benefits from research-object style provenance.
- Community practice is converging on granular evidence approval rather than final "approve" buttons.

Creative translation for this project: `research next` should be able to emit a tiny navigation trace, like a clearance record, without automatically executing the next stage.

## Deliverable

Added opt-in navigation tracing to `agenteer research next`.

Changes:

- Added `generatedAtIso`, `decisionId`, and `tracePath` to `ResearchPacketNext`.
- Added `ResearchPacketNextOptions`.
- Added `agenteer research next --packet <dir> --trace`.
- When `--trace` is set, the command appends the full navigation decision to `navigation-trace.jsonl`.
- Added focused test coverage for trace append behavior.

## Verification

- `node npm-cli.js run build` passed.
- Ran `agenteer research next --packet <tmp> --trace --json`; it wrote `navigation-trace.jsonl` with the decision id, stage, gate status, commands, and expected artifacts.

## Counter-Design Rejected

Rejected: making trace writing the default behavior.

Reason: `next` should remain read-only unless the user explicitly asks to mutate the packet. Opt-in `--trace` keeps provenance available without surprising scripts.

## Next Tick

Tick 011, axis 5 challenge: critique the growing navigation layer and decide whether the next implementation should be a schema hardening step or a simplification.
