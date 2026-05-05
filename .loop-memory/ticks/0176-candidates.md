# Tick 176 Tail Candidates

1. Add a simple rerun command that compares only `analysis.json` effect and row count.
2. Add lifecycle text reminding users to rerun manually.
3. Add a manifest entry for `paper-run-result.json`.
4. Add a paper-level scientific-field stability primitive that compares a baseline packet to a repeat packet and writes `rerun-stability.json`.
5. Add a stochastic perturbation check that intentionally changes missingness thresholds and records sensitivity.
6. Add a "paper courtroom" adversarial reviewer that cross-examines every result sentence against evidence JSON.
7. Add a cache-lineage checker that proves every input Parquet file appears in both baseline and repeat runner records.

Selected rank 4. Ranks 1-3 are cheaper but too shallow; rank 4 creates the reusable primitive needed by the archivist challenge without adding speculative sensitivity machinery yet.
