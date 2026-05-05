# Golden Route 0216 - Bound Standard-Table Stats

Purpose: prove the standard-table stats path can be benchmarked as `local_review_ready` when it is bound to upstream method-selection evidence.

Research idea: in a local adult screening table, compare mean systolic blood pressure between high and lower sodium intake groups using a Welch two-sample t-test.

Generated artifacts:

- `stats.csv`: deterministic local fixture.
- `method-selection.json`: selected `two-sample-t-test` evidence.
- `modeling-plan.json`: pre-run route projection.
- `analysis-run/`: bounded stats route output.
- `two-route-analysis-benchmark.json`: strict benchmark over this stats route plus the golden ML comparison route.

Status:

- Stats posture: `bound_standard_table`.
- Stats manifest readiness: `local_review_ready`.
- Two-route benchmark: `pass`.

Limitations:

- This is a synthetic local-table fixture, not NHANES.
- It is intended to prove route mechanics and benchmark pressure, not make a public-health claim.
