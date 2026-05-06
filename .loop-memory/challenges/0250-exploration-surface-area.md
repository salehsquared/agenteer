# Tick 0250 Challenge - Framework Minimalist

## Critique

Exploration mode is becoming conceptually strong, but it has started to grow a mini-pipeline:

1. `research explore`
2. `research explore-promote`
3. future `modeling-plan` consumption
4. future paper/spec execution

That is justified only if the current artifacts make actual data work easier. Right now the golden proof is still a tiny fixture. The strongest risk is not statistical misuse anymore; it is framework sprawl: a new command family that is internally coherent but not yet necessary for a real dataset-grounded study.

Specific concerns:

- `explore-promote` may be a temporary adapter that should eventually collapse into `modeling-plan --exploration-handoff`.
- The burden gate is conservative on the tiny fixture, but we do not yet know whether it is useful or noisy on actual NHANES/public-health tables.
- The handoff recommended command copies question/outcome/exposure/table path, but `modeling-plan` does not consume the handoff hash or blockers yet.
- More exploration outputs would be premature until actual data proves which fields are useful.

## Actionable Implications

The next implementation should do one of two things:

- Run `research explore` on actual cached NHANES/public-health data and record what breaks, what is noisy, and what is useful.
- Or merge the new handoff into `modeling-plan --exploration-handoff` so the surface area pays off immediately.

Do not add another exploration command first.

## Evidence That Would Change This Critique

I would accept the surface if a real-data exploration packet:

- detects survey fields correctly;
- produces plausible candidate questions;
- identifies missingness/proxy risks without swamping the output;
- feeds a modeling plan without manual copy/paste;
- records hashes so the handoff is auditable.

Until then, treat exploration as promising but not yet mature.
