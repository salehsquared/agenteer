# Tick 003

Axis: remove or merge a primitive.

## Deliverable

Made `agenteer research pipeline-stages` the canonical visible command for the stage map.

`agenteer research stages` remains available as an undocumented compatibility alias.

## Verification

Commands run:

- `/Applications/Codex.app/Contents/Resources/node /usr/local/lib/node_modules/npm/bin/npm-cli.js run build`
- `node packages/cli/dist/bin/agenteer.js research pipeline-stages --json`
- `node packages/cli/dist/bin/agenteer.js research stages --json`
- `cmp -s /tmp/tick-003-pipeline-stages.json /tmp/tick-003-stages-alias.json`

Build passed, and both command names produced identical output.

## Counter-Design Rejected

Rejected deleting the alias. Compatibility costs less than the confusion of breaking existing notes or scripts.

## Next Tick

Tick 004, axis 4: add a primitive. Add a small packet navigation primitive or summary field that consolidates checkpoint, stage gate, and recommended commands.
