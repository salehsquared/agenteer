# Tick 035 Challenge: Verification Stack Scope

Axis: challenge tick.

## Web / Creativity Inputs

Recent reproducibility and provenance work separates several verification layers:

- artifact integrity: files match hashes or manifests
- workflow provenance: steps and inputs can be traced
- environment reproducibility: code, dependencies, and runtime can be recreated
- methods validity: statistical assumptions and design constraints are defensible
- claim validity: report claims are supported and not overgeneralized

The pipeline now has the first pieces of artifact integrity, but not the full stack.

## Critique

`packet-verify` is useful, but its name will become dangerous if users interpret `pass` as "the study is correct." Right now, `pass` means available integrity records are internally consistent.

Current strengths:

- `packet-verify` is scoped and compositional.
- Manifest verification catches changed packet artifacts.
- Approval and navigation events are no longer decorative.

Current weaknesses:

- The command still says `status: pass`, which may sound broader than `mode: available-integrity`.
- It does not include report review, methods validation, claim guard, or provenance graph consistency.
- It does not explain what a user should run next when status is incomplete.

## Recommended Response

Next tick should improve language and next action, not broaden checks.

Small target:

- Add `summary` or `nextAction` to `packet-verify`.
- For `pass`: say available integrity checks passed, not research validity.
- For `incomplete`: list the command(s) that would create missing integrity artifacts.
- For `fail`: recommend inspecting the narrow failing verifier.

## Counter-Design Rejected

Rejected: add methods/report/claim checks to `packet-verify` immediately.

Reason: that would mix artifact integrity with scientific validity before the verifier contract is clear.
