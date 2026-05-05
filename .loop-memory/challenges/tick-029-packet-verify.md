# Tick 029 Challenge: Packet Verify Timing

Axis: challenge tick.

## Critique

`packet-verify` is useful, but it is early. It currently verifies integrity side channels, not the whole research packet.

What it does well:

- Gives scripts one command to check available integrity artifacts.
- Keeps `checkpoint` focused on workflow position.
- Makes missing integrity artifacts explicit as `incomplete`.
- Avoids inventing new validation rules.

What it does poorly:

- The name sounds broader than the implementation.
- It does not verify manifest coverage, report review, methods validation, claim guard, or provenance graph.
- `incomplete` may be ambiguous: a packet can be legitimately early-stage or incorrectly missing final integrity artifacts.
- It treats missing navigation trace as incomplete even though `next --trace` is opt-in.

## Recommendation

Keep the command, but make expectations explicit.

Small target:

- Add `mode: "available-integrity"` or similar to the result.
- Add a short `scope` list naming exactly what was checked.
- Do not broaden checks this tick.

## Counter-Design Rejected

Rejected: rename `packet-verify` to `integrity-verify`.

Reason: the future direction is packet verification. The current problem is scope clarity, not necessarily the command name.
