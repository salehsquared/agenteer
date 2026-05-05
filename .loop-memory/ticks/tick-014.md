# Tick 014: Audit-Friendly Blocked Exit

Axis: more robust.

## Deliverable

Added `--exit-zero-on-blocked` to `agenteer research next`.

Default behavior remains strict: blocked navigation exits nonzero. Audit workflows can now combine `--trace --exit-zero-on-blocked` when they want to record the decision without treating an expected blocked state as a shell failure.

## Verification

- `node npm-cli.js run build` passed.
- Ran a blocked packet twice:
  - default `research next --json` returned exit code `1`.
  - `research next --exit-zero-on-blocked --json` returned exit code `0`.

## Counter-Design Rejected

Rejected: changing blocked navigation to always return zero.

Reason: the default CLI should still protect scripts from accidentally continuing past a blocked gate.

## Next Tick

Tick 015, axis 3 remove/merge plus web/creativity: inspect whether `checkpoint` and `next` are now redundant enough to document clearer ownership instead of adding more commands.
