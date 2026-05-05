# Tick 015: Checkpoint / Next Ownership

Axis: remove or merge a primitive.

## Web / Creativity Injection

Recent HITL and agent provenance discussions keep separating three concerns:

- Checkpoints preserve resumable state.
- Gates decide whether action is allowed.
- Audit or trace records explain decisions and human oversight.

Creative translation: do not merge these commands mechanically; merge their mental model. A clean ownership rule can remove more confusion than another CLI alias.

## Deliverable

Updated `docs/research-pipeline.md` to document command ownership:

- `checkpoint` owns durable state projection.
- `stage-gate` owns deterministic policy checks.
- `next` owns human/script clearance and optional navigation tracing.

## Verification

- `node npm-cli.js run build` passed.

## Counter-Design Rejected

Rejected: deleting `checkpoint` now and forcing all consumers through `next`.

Reason: `checkpoint` is a better stable state primitive, while `next` is a higher-level projection for humans and scripts.

## Next Tick

Tick 016, axis 4 add primitive: add a tiny trace reader if it helps verify navigation traces without expanding the state model.
