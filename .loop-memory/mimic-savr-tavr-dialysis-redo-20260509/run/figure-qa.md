# Figure QA

Status: pass

4/4 figure(s) passed; status=pass.

Manifest: /Users/saleh/TechProjects/agenteer/.loop-memory/mimic-savr-tavr-dialysis-redo-20260509/run/figures.json

## One-year MACE by valve strategy and dialysis group

Status: pass
Path: /Users/saleh/TechProjects/agenteer/.loop-memory/mimic-savr-tavr-dialysis-redo-20260509/run/figure-1-mace-by-group.png
Dimensions: 1800 x 1050
Nonblank ratio: 0.2142
Caption: MACE is death, MI, or stroke within 365 days in available same-hospital/death-date follow-up.
Alt text: Horizontal bar chart of one-year MACE proportions by valve strategy and dialysis group.
X axis: MACE proportion
Y axis: Valve/dialysis group

- PASS path-recorded: /Users/saleh/TechProjects/agenteer/.loop-memory/mimic-savr-tavr-dialysis-redo-20260509/run/figure-1-mace-by-group.png
- PASS file-exists: Found figure file (62854 bytes).
- PASS file-size: Figure byte size is 62854; expected at least 8000 bytes for a readable plot.
- PASS png-decodable: PNG decoded at 1800x1050.
- PASS dimensions: Figure dimensions are 1800x1050; expected at least 900x600.
- PASS nonblank-pixels: Non-white sampled pixel ratio is 0.2142.
- PASS color-detail: Sampled color buckets: 18.
- PASS title-present: Title: One-year MACE by valve strategy and dialysis group
- PASS caption-present: Caption: MACE is death, MI, or stroke within 365 days in available same-hospital/death-date follow-up.
- PASS alt-text-present: Alt text is present.
- PASS x-axis-label-present: X axis: MACE proportion
- PASS y-axis-label-present: Y axis: Valve/dialysis group
- PASS source-columns-recorded: Source columns: mace_n, n, valve_strategy, dialysis_group

## Mortality horizons by dialysis group

Status: pass
Path: /Users/saleh/TechProjects/agenteer/.loop-memory/mimic-savr-tavr-dialysis-redo-20260509/run/figure-2-mortality-horizons.png
Dimensions: 1350 x 900
Nonblank ratio: 0.0342
Caption: Mortality horizons use MIMIC death-date availability and are not national follow-up.
Alt text: Line chart of death proportions at 30 days, 1 year, 3 years, 5 years, and 10 years by dialysis group.
X axis: Days after index discharge
Y axis: Mortality proportion

- PASS path-recorded: /Users/saleh/TechProjects/agenteer/.loop-memory/mimic-savr-tavr-dialysis-redo-20260509/run/figure-2-mortality-horizons.png
- PASS file-exists: Found figure file (77131 bytes).
- PASS file-size: Figure byte size is 77131; expected at least 8000 bytes for a readable plot.
- PASS png-decodable: PNG decoded at 1350x900.
- PASS dimensions: Figure dimensions are 1350x900; expected at least 900x600.
- PASS nonblank-pixels: Non-white sampled pixel ratio is 0.0342.
- PASS color-detail: Sampled color buckets: 77.
- PASS title-present: Title: Mortality horizons by dialysis group
- PASS caption-present: Caption: Mortality horizons use MIMIC death-date availability and are not national follow-up.
- PASS alt-text-present: Alt text is present.
- PASS x-axis-label-present: X axis: Days after index discharge
- PASS y-axis-label-present: Y axis: Mortality proportion
- PASS source-columns-recorded: Source columns: death_n, n, dialysis_group, horizon_days

## Adjusted dialysis-group hazard ratios

Status: pass
Path: /Users/saleh/TechProjects/agenteer/.loop-memory/mimic-savr-tavr-dialysis-redo-20260509/run/figure-3-cox-forest.png
Dimensions: 1500 x 600
Nonblank ratio: 0.0363
Caption: Cox models use available same-hospital/death-date timelines and complete-case covariates.
Alt text: Forest plot of dialysis-group hazard ratios for time-to-event outcomes.
X axis: Hazard ratio
Y axis: Outcome and dialysis term

- PASS path-recorded: /Users/saleh/TechProjects/agenteer/.loop-memory/mimic-savr-tavr-dialysis-redo-20260509/run/figure-3-cox-forest.png
- PASS file-exists: Found figure file (45964 bytes).
- PASS file-size: Figure byte size is 45964; expected at least 8000 bytes for a readable plot.
- PASS png-decodable: PNG decoded at 1500x600.
- PASS dimensions: Figure dimensions are 1500x600; expected at least 900x600.
- PASS nonblank-pixels: Non-white sampled pixel ratio is 0.0363.
- PASS color-detail: Sampled color buckets: 21.
- PASS title-present: Title: Adjusted dialysis-group hazard ratios
- PASS caption-present: Caption: Cox models use available same-hospital/death-date timelines and complete-case covariates.
- PASS alt-text-present: Alt text is present.
- PASS x-axis-label-present: X axis: Hazard ratio
- PASS y-axis-label-present: Y axis: Outcome and dialysis term
- PASS source-columns-recorded: Source columns: hazard_ratio, ci_low, ci_high, term, outcome

## Propensity balance for HD/unspecified vs non-dialysis

Status: pass
Path: /Users/saleh/TechProjects/agenteer/.loop-memory/mimic-savr-tavr-dialysis-redo-20260509/run/figure-4-propensity-love-plot.png
Dimensions: 1350 x 750
Nonblank ratio: 0.0387
Caption: Balance is shown for numeric covariates only in the matched sensitivity analysis.
Alt text: Love plot comparing absolute standardized mean differences before and after matching.
X axis: Absolute standardized mean difference
Y axis: Covariate

- PASS path-recorded: /Users/saleh/TechProjects/agenteer/.loop-memory/mimic-savr-tavr-dialysis-redo-20260509/run/figure-4-propensity-love-plot.png
- PASS file-exists: Found figure file (78128 bytes).
- PASS file-size: Figure byte size is 78128; expected at least 8000 bytes for a readable plot.
- PASS png-decodable: PNG decoded at 1350x750.
- PASS dimensions: Figure dimensions are 1350x750; expected at least 900x600.
- PASS nonblank-pixels: Non-white sampled pixel ratio is 0.0387.
- PASS color-detail: Sampled color buckets: 29.
- PASS title-present: Title: Propensity balance for HD/unspecified vs non-dialysis
- PASS caption-present: Caption: Balance is shown for numeric covariates only in the matched sensitivity analysis.
- PASS alt-text-present: Alt text is present.
- PASS x-axis-label-present: X axis: Absolute standardized mean difference
- PASS y-axis-label-present: Y axis: Covariate
- PASS source-columns-recorded: Source columns: smd_before, smd_after, covariate
