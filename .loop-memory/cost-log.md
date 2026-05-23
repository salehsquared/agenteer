# Cost log - session ceiling: $10.00

Current run override: user lowered the cloud/GCP ceiling to $10 for ticks 0077-0106. Local reads from already-cached NHANES Parquet are treated as $0.

| Tick | Action | Estimate | Running total |
|---|---|---:|---:|
| 0294 | MIMIC execution runner implementation; no cloud data read | $0.00 | $0.00 |
| 0378 | MIMIC dialysis/cardiac surgery bounded dictionary and derived table reads for 10 papers | $0.25 | $0.25 |
| 0387 | MIMIC paper-series consistency reruns for propensity artifacts | $0.05 | $0.30 |
| 0388 | MIMIC SAVR/TAVR dialysis longitudinal bounded hospital-table read | $0.02 | $0.32 |
| 0388 | MIMIC SAVR/TAVR dialysis rerun after HCPCS/CPT wording fix | $0.02 | $0.34 |
| 0388 | MIMIC SAVR/TAVR dialysis rerun after trust-inspection fix | $0.02 | $0.36 |
| 0388 | MIMIC SAVR/TAVR dialysis full rerun with user-specified manual ICD/CPT/HCPCS code sets | $0.0126 | $0.3726 |
| 0388 | MIMIC SAVR/TAVR dialysis full rerun after paper-generator QA hardening | $0.0126 | $0.3852 |
| 0388 | MIMIC SAVR/TAVR dialysis final full rerun after evidence-limitations hardening | $0.0126 | $0.3978 |
| 0409 | 20 DeepSeek-dual reviewer paper QA calls | $1.25 | $1.65 |
| 0409 | rerun 20 DeepSeek-dual reviews after manuscript repairs | $1.10 | $2.75 |
| 0409 | final bound 20-paper DeepSeek-dual review rerun | $1.10 | $3.85 |
| 0429 | MIMIC SAVR/TAVR dialysis redo GCS read plus two DeepSeek-triple review gates | $1.75 | $5.60 |
