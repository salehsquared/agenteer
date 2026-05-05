# Tick 007: Centralized Stage Evidence

Axis: faster/simpler.

## Deliverable

Simplified `research next` expected-artifact maintenance by replacing a long switch with a single `RESEARCH_STAGE_ARTIFACTS` registry.

The behavior is unchanged, but the success-condition mapping is now easier to scan and less likely to drift when a stage artifact filename or description changes.

## Verification

- `node npm-cli.js run build` passed.
- Ran `agenteer research next --packet <tmp> --json` and confirmed the expected artifact output still includes `methods-validation.json` and `data-quality.json` for a blocked analysis packet.

## Counter-Design Rejected

Rejected: introducing a new exported public stage metadata API now.

Reason: the current need is internal maintainability. A public API would create compatibility expectations before the stage registry is stable enough.

## Next Tick

Tick 008, axis 2 more robust: make expected artifacts report whether the artifact already exists so `next` can distinguish missing evidence from satisfied evidence.
