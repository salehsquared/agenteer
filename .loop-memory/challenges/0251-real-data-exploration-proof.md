# Tick 0251 Challenge - Reliability Engineer

## Critique

The next tick should not merely "try actual data." It needs a repeatable proof. A one-off local script that happens to work would not establish exploration-mode reliability.

## Acceptance Criteria

The implementation tick should produce:

- deterministic local extract under `.loop-memory/golden` or `.loop-memory/actual-nhanes`;
- no writes to MedBrevia/domain repos;
- source file hashes and extract script/command provenance;
- `research explore` output on the extracted public-health table;
- evidence that survey/design variables are detected when present;
- burden sanity: pair counts, missingness, sparse categories, target pair count, clearance level;
- `explore-promote` refusal without methods note and successful held handoff with a note;
- a short review note describing whether the output is useful or noisy.

## Failure Modes To Watch

- Parquet bridge silently changes row/column types.
- The extract omits survey variables, making survey detection look better than it is.
- High-cardinality identifiers leak into associations.
- Near-perfect proxy warnings swamp everything.
- The handoff command records a local absolute table path without a future redaction plan.

## Evidence That Would Change This Critique

A saved actual-data exploration packet that satisfies the acceptance criteria above and remains stable on rerun.
