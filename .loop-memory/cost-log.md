# Cost log - session ceiling: $10.00

Current run override: user lowered the cloud/GCP ceiling to $10 for ticks 0077-0106. Local reads from already-cached NHANES Parquet are treated as $0.

| Tick | Action | Estimate | Running total |
|---|---|---:|---:|
| 0294 | MIMIC execution runner implementation; no cloud data read | $0.00 | $0.00 |
| 0378 | MIMIC dialysis/cardiac surgery bounded dictionary and derived table reads for 10 papers | $0.25 | $0.25 |
| 0387 | MIMIC paper-series consistency reruns for propensity artifacts | $0.05 | $0.30 |
