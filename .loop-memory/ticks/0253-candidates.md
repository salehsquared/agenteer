# Tick 0253 Tail-Sample Candidates

Default-likelihood ranking:

1. Make `modeling-plan` consume `--exploration-handoff`.
2. Add an actual-data exploration benchmark manifest.
3. Add report redaction for exploration handoff absolute paths.
4. Add derived-variable/proxy detection for target aliases such as `LBXGH` / HbA1c.
5. Add row-sampling controls for very wide/large exploration scans.
6. Add codebook-backed labels to exploration reports.
7. Add a second actual-data exploration target from lipids or blood pressure.

Ranks 1-3 are obvious and useful, but tail-sample protocol discards them. I picked rank 4 because the actual NHANES run surfaced `elevated_hba1c` as a target-derived variable, which is a subtle correctness issue the framework should catch before planning.
