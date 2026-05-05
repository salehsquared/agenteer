# Tick 002

Axis: more robust.

## Deliverable

Added `recommendedCommands` to `ResearchCheckpoint`.

When checkpoint detects a blocked stage gate, the checkpoint now preserves the nominal `nextCommand` but also emits concrete safe commands for the missing gates.

## Verification

Commands run:

- `/Applications/Codex.app/Contents/Resources/node /usr/local/lib/node_modules/npm/bin/npm-cli.js run build`
- `node packages/cli/dist/bin/agenteer.js research checkpoint --packet /tmp/agenteer-tick-002-packet --json`

Build passed. CLI verification showed `recommendedCommands` for missing `critique`, `methods-validation`, and `data-quality` gates.

Focused Vitest was attempted but blocked by Rollup native optional dependency code-signature failure under the bundled Node.

## Counter-Design Rejected

Rejected replacing `nextCommand` with a gate command. `nextCommand` remains the nominal next stage; `recommendedCommands` is the safer gate-aware list.

## Next Tick

Tick 003, axis 3: remove or merge a primitive. Review whether stage-related command aliases and artifacts can be simplified without removing useful compatibility.
