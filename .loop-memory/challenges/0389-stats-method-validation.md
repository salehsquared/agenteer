# Tick 0389 Challenge: Expanded Stats Surface Validation

## Critique

The expanded `research stats-run` surface is now broad enough that the main risk is no longer missing command names. The risk is false confidence: a method can be registered, return a JSON file, and still be unsuitable for a real paper if the result lacks interpretable estimates, denominator accounting, QA posture, or visual artifacts.

The validation should therefore stress five things, not just unit-test success:

1. **Executable families**: core inference, GLM/regression, survival, causal/quasi-experimental, missingness/reliability, and prediction routes should each run from CLI with realistic columns.
2. **Clear blockers**: backend-missing methods such as Fine-Gray, time-varying Cox, and production GLMM must fail as blockers rather than produce partial-looking success.
3. **Reader artifacts**: at least several routes should produce paper/manuscript-style artifacts or reports that avoid framework jargon and explain the method boundary.
4. **Figure contracts**: runs with natural visual output should write `figures.json` plus actual image files, not just tabular JSON.
5. **Benchmarkability**: the validation output should be summarized in a durable index so future agents know which method families were exercised and where the weak spots remain.

## Falsifiable Bar For The Next Ticks

The next validation ticks should produce a local validation corpus under `.loop-memory/stats-method-validation-20260509/`, run a representative command suite, generate several reviewable paper/manuscript artifacts, run targeted tests, and explicitly record any unsupported method family.

## Promotion Decision

Keep the expanded stats surface experimental until the validation corpus proves that outputs are inspectable across method families.
