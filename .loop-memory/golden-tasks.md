# Golden Tasks

## Active Golden Path

- Spec-governed NHANES paper-run packets with local cached data.
- Standard-table stats-run packet path using `modeling-plan -> analysis-run --require-bound -> analysis-manifest -> analysis-benchmark`.
- ML prediction path using `modeling-plan -> ml-run/ml-compare -> model-review-card -> analysis-manifest`.
- Strict stats/ML route benchmark using `.loop-memory/golden/0216-bound-stats-route` plus `.loop-memory/golden/0212-ml-comparison-route` with `analysis-benchmark --require-ready --require-multi-route`.

## Recurring Checks

- TypeScript build.
- Targeted Vitest for changed runner/planner/lifecycle surfaces.
- CLI smoke for at least one golden route every few ticks.
- Memory validation after memory updates.

## Near-Term Gap

The stats/ML routes now have a strict two-route benchmark. The remaining gap is whether paper-run routes should join this benchmark family or remain under paper lifecycle/packet benchmarks.
