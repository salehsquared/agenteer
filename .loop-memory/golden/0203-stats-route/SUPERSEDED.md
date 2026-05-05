# Superseded Golden Route

This route is intentionally preserved as a historical exploratory stats route.

Do not use it as the active standard-table stats benchmark. Its `stats-run.json` has:

- `resultPosture.status`: `exploratory_standard_table`
- binding status: `unbound`

Active replacement:

- `.loop-memory/golden/0216-bound-stats-route`

Why this remains useful:

- It demonstrates why unbound stats runs must not satisfy `analysis-benchmark --require-ready`.
- It gives future agents a concrete before/after comparison for the strict bound route.
