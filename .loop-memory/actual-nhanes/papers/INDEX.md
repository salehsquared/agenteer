# Actual NHANES Paper Index

Root: `/Users/saleh/TechProjects/agenteer/.loop-memory/actual-nhanes/papers`

| Paper | Title | Complete-case N | Latest QA | Runner | QA file |
|---|---|---:|---|---|---|
| `0108-vitamin-d-bp` | Serum 25-hydroxyvitamin D and measured hypertension in NHANES adults: a cross-sectional pipeline dogfood analysis | 19770 | pass (26/26 paper QA checks passed.) | retrospective_succeeded | `qa-numeric-cli.json` |
| `0111-smoking-hdl` | Smoking history and HDL cholesterol in NHANES adults: a cross-sectional pipeline dogfood analysis | 20334 | pass (24/24 paper QA checks passed.) | retrospective_succeeded | `qa-numeric-cli.json` |
| `0113-uacr-hypertension` | Albuminuria and measured hypertension in NHANES adults: a cross-sectional pipeline dogfood analysis | 20461 | pass (27/27 paper QA checks passed.) | retrospective_succeeded | `qa-numeric-cli.json` |
| `0121-insurance-hba1c` | Health insurance coverage and HbA1c in NHANES adults | 21653 | pass (25/25 paper QA checks passed.) | succeeded | `qa-negation-cli.json` |
| `0158-bmi-hba1c` | Body mass index and HbA1c in NHANES adults | 20366 | pass (28/28 paper QA checks passed.) | retrospective_succeeded | `qa-cli.json` |
| `0164-pir-hdl` | Family poverty-income ratio and HDL cholesterol in NHANES adults | 18394 | pass (26/26 paper QA checks passed.) | succeeded | `qa-cli.json` |
| `0167-pir-hdl-paper-run` | Among NHANES adults aged 20 years and older, is family poverty-income ratio associated with HDL cholesterol in an exploratory cross-sectional analysis | 25967 | pass (24/24 paper QA checks passed.) | succeeded | `qa-cli.json` |

Use each paper directory for paper.md, analysis.json, `critique.md`, QA history, and runner-record.json when available. The `qa*.json` files preserve progression as QA got stricter across ticks.
