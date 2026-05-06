# Challenge 0240 - Readability QA Needs A Spec, Not A Vibe

## Critique

The previous challenge identified that the regenerated paper is still too code-heavy. The deeper issue is that “readable” is currently subjective. Without a deterministic readability spec, future generated papers can pass QA while still forcing readers to decode dataset variables.

## Required Reader-Facing Checks

The next implementation should make these checks concrete:

- `human-variable-labels`: common raw NHANES codes in prose should be accompanied by labels or replaced with labels.
- `main-finding`: summary or abstract should contain a short sentence beginning with `Main finding:` or equivalent.
- `code-density`: a reader-facing paragraph should not contain too many raw all-caps variable codes.
- `awkward-generator-phrases`: block phrases such as `whether, among`, `this the analysis`, `outcome units` when the outcome label is known, and repeated `Eligibility note:` text.
- `weight-domain-plain-language`: subsample weight rationale should explain the analytic population in ordinary prose.

## Implementation Target

Add the checks to `researchPaperQaCommand`, update `paper-run` generation to use a small NHANES variable-label map, regenerate `0179`, and ensure the latest paper still reaches `ready_for_local_review`.

## Counter-Design Rejected

Do not rely on an LLM rewrite step for this pass. The pipeline needs deterministic readability gates before optional prose polishing.
