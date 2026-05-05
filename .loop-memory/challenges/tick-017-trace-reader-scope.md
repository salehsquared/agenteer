# Tick 017 Challenge: Trace Reader Scope

Axis: challenge tick.

## Critique

`research navigation-trace` is intentionally narrow, but it creates a naming question: will the packet eventually have many trace files, or one event stream?

Current narrow design is good because:

- It inspects exactly the side-effect created by `research next --trace`.
- It does not pretend to be a full packet event log.
- It gives scripts a cheap way to verify that audit-only navigation actually wrote an event.

Current narrow design is weak because:

- The command name may become obsolete if we later add approval, repair, execution, and critique trace events.
- It only reports event count and last event, not malformed lines or event-type distribution.
- It duplicates future provenance/event-log concerns if generalized too early.

## Recommended Response

Keep it narrow for now, but add validation rather than expansion.

Small target:

- Make `navigation-trace` count malformed JSONL lines.
- Report event-type counts.
- Return nonzero if the trace exists but contains malformed lines.

This makes the existing primitive trustworthy without turning it into a general event bus.

## Counter-Design Rejected

Rejected: immediately replace `navigation-trace` with a generic `research events` command.

Reason: there is currently only one event type written by this path. A generic event reader would imply an event architecture that does not exist yet.
