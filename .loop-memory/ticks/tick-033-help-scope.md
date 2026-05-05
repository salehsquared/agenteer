# Tick 033 Design Note: Help Scope

Axis: remove or merge a primitive.

## Decision

Do not add subcommand-scoped help yet.

The current top-level help is long, but it is still the single source of command discovery. Adding `agenteer research --help` or per-command help would be useful later, but it should be done as a general CLI ergonomics pass, not as a reaction to four new commands.

## Trigger For Future Work

Revisit subcommand-scoped help when one of these happens:

- The top-level help becomes too large to scan.
- Commands gain enough option detail that one-line usage is inadequate.
- Users begin asking for examples per command.
- The CLI parser gets a structured command registry.

## Counter-Design Rejected

Rejected: implement `agenteer research --help` now by printing the same global usage.

Reason: that would be a shallow alias, not real scoped help.
