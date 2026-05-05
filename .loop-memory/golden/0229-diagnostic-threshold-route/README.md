# Diagnostic Threshold Golden Route

## Question

How accurately does a waist circumference threshold identify elevated HbA1c from continuous values?

## Purpose

This route proves that `diagnostic-accuracy` can derive binary reference/index-test indicators from continuous columns through explicit thresholds:

- `--outcome hba1c_pct --outcome-threshold 6.5`
- `--exposure waist_cm --exposure-threshold 100`

## Current Evidence

- Analysis readiness: `local_review_ready`.
- Reference threshold: HbA1c `>= 6.5`.
- Index-test threshold: waist circumference `>= 100`.
- Sensitivity: 0.8590.
- Specificity: 0.9608.
- Diagnostic QA includes Wilson intervals and prevalence/overclaim safeguards.

## Benchmark Evidence

`four-route-analysis-benchmark.md` verifies this route alongside:

- bound t-test stats route
- binary diagnostic route
- threshold-derived diagnostic route
- ML comparison route

The benchmark passes `--require-ready --require-multi-route`.

## Rerun Stability

`rerun-stability.json` compares `estimates` and `diagnostics` between `analysis-run` and `analysis-run-repeat`; current status is `pass`.
