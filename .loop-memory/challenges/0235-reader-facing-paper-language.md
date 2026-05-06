# Challenge 0235 - Reader-Facing Paper Language

## Critique

Generated `paper.md` files are mixing two audiences:

- scientific readers who need a clear question, thesis, methods, results, interpretation, and limitations
- framework operators who need provenance, readiness, lifecycle state, QA, and runner internals

The result is confusing. Terms such as `AnalysisSpec`, `result posture`, `local_review_ready`, and repeated third-person mentions of Agenteer make the output sound like the framework is critiquing itself instead of presenting the study.

## User-Facing Failure

A user opening `paper.md` should not need to know Agenteer internals. They should understand:

- what question was asked
- what data population was analyzed
- what variables were used
- what statistical method was used in ordinary language
- what the primary result was
- what the result does and does not mean
- what limitations matter scientifically

## Required Response

Next implementation ticks should separate audience boundaries:

- `paper.md`: reader-facing scientific prose only
- `stats-report.md`, `runner-record.json`, lifecycle files, manifests: framework/provenance language allowed
- QA should fail or warn when `paper.md` contains framework jargon or third-person framework references

## Initial Forbidden Terms For Paper Markdown

- `Agenteer`
- `AnalysisSpec`
- `result posture`
- `local_review_ready`
- `artifact posture`
- `runner record`
- `task envelope`
- `evidence receipt`
- `interop`
- `spec-governed`

Some concepts can remain but must be translated, e.g. `AnalysisSpec` -> `pre-specified analysis plan`.

## Counter-Design Rejected

Do not fix this with a one-sentence caveat. The paper templates and QA gates need to make the audience boundary structural.
