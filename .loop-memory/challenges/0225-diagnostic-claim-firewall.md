# Challenge 0225 - Diagnostic Claim Firewall

## Critique

The diagnostic accuracy route is now executable and benchmarked, but the reporting/QA layer is not yet strict enough for diagnostic studies.

Current strengths:

- method selection can choose `diagnostic-accuracy-basic`
- `stats-run` computes a confusion matrix and diagnostic metrics
- `analysis-run` stores diagnostic goal/study-design semantics
- analysis manifests and benchmarks can count the route only after binding/readiness

Remaining risks:

- `stats-report.md` does not yet have a diagnostic-specific safety section.
- `stats-qa.json` does not verify that the report names the reference standard and index test.
- PPV/NPV are computed, but no deterministic QA check ensures the report says they are prevalence-dependent.
- Sensitivity/specificity estimates are presented without a precision/uncertainty caveat.
- The route does not yet block screening recommendation language such as "should screen" or "clinical screening tool" when only local table accuracy is available.
- Indeterminate/missing test results are not distinguished from ordinary complete-case missingness.
- Sparse diagnostic cells are a warning, but promotion is still possible unless a stricter policy asks for more data or exact intervals.

## Failure Mode

The platform could generate a polished diagnostic report that sounds clinically actionable even though it only proves local 2x2 table arithmetic.

## Required Response

The next implementation tick should add diagnostic-specific report and QA gates:

- reference-standard/index-test wording
- predictive-value prevalence caveat
- screening recommendation overclaim detection
- precision/uncertainty caveat for accuracy estimates
- sparse-cell escalation in the report

## Counter-Design Rejected

Do not defer all diagnostic safeguards to a later paper writer. `stats-run` is already producing local-review reports, so it must carry the first claim firewall.
