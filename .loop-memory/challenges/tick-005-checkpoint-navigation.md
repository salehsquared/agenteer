# Tick 005 Challenge: Checkpoint / Next Navigation

Axis: challenge tick.

## Web / Creativity Inputs

Current external signals reinforce that human-in-the-loop is not just an approval button. It needs stateful pauses, resumable checkpoints, and trace-level inspectability.

Sources reviewed:

- Microsoft Agent Framework checkpoint docs emphasize saving executor state into workflow checkpoints.
- OpenAI Agents SDK HITL docs show terminal approval while preserving run state.
- Apple HCI work on computer-use agents highlights UX issues around normal, error-prone, and risky execution.
- Recent workflow/provenance research argues AI-assisted scientific outputs need explicit, inspectable provenance records.
- Community discussions are converging on "HITL throughout the workflow," not only final approval.

Creative tail idea: treat `research next` as an air-traffic-control clearance, not a TODO printer. It should not merely say the next command; it should state why this command is cleared, what remains unsafe, what evidence will be created, and what state transition should result.

## Critique

The new `research next` command improves ergonomics, but it risks becoming a thin wrapper over `checkpoint` rather than a true state navigator.

Current weaknesses:

1. `next` reports commands but not expected output artifacts. A user can run a recommended command without knowing which file should appear or how success will be judged.
2. Gate status is stage-oriented, not evidence-oriented. It knows `methods-validation` is missing, but it does not say which evidence record or artifact satisfies that requirement.
3. `recommendedCommands` are strings. They are useful for humans, but weak for programmatic continuation because arguments like `<rows.json>` remain placeholders.
4. The design still infers state from filenames. That is simple, but it is fragile as soon as real runners produce richer artifact names, partial failures, or multiple attempts.
5. There is no trace event for the navigation decision itself. For a reproducible research packet, "the agent chose this next step because gate X was missing" should be an auditable decision.
6. `next` exits nonzero when blocked, which is correct for scripts but awkward for human pacing because blocked is an expected navigation state, not necessarily a command failure.

## Strongest Concern

The pipeline now has two concepts that could drift:

- `checkpoint`: state inference and nominal next command.
- `next`: user-facing navigation over checkpoint.

If these diverge, we will create confusion. The next tick should either make `next` a richer projection of checkpoint with expected artifacts, or decide that `checkpoint` should own this entirely and `next` should stay a very thin alias.

## Recommended Response In Tick 006

Add expected artifacts to the navigation layer before adding more commands.

Small target:

- Extend `ResearchPacketNext` with `expectedArtifacts`.
- Derive those artifacts from the recommended stage commands.
- Keep `checkpoint` unchanged unless necessary.

This turns `next` from "command suggestion" into "command plus success condition."

## Counter-Design Rejected

Rejected: make `next` execute the first safe command automatically.

Reason: execution would collapse the human-paced loop. The better design is a richer clearance object: what to run, why, and what artifact proves it worked.
