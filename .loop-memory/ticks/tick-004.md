# Tick 004

Axis: add a primitive.

## Deliverable

Added `agenteer research next --packet <dir>`.

The command wraps checkpoint and stage-gate state into a small navigator:

- current stage
- gate status
- target mode
- recommended commands
- short message

## Verification

Commands run:

- `/Applications/Codex.app/Contents/Resources/node /usr/local/lib/node_modules/npm/bin/npm-cli.js run build`
- `node packages/cli/dist/bin/agenteer.js research next --packet /tmp/agenteer-tick-004-packet --json`

Build passed. The CLI returned blocked gate status and recommended the missing gate commands before analysis.

## Counter-Design Rejected

Rejected folding this entirely into `packet-summary`. That command should stay broad; `next` is a narrow navigation primitive.

## Next Tick

Tick 005, axis 5: challenge tick. Critique the current checkpoint/navigation design and write the critique under `.loop-memory/challenges/`. No code.
