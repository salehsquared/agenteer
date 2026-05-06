# Actual NHANES Paper Index

Root: `/Users/saleh/TechProjects/agenteer/.loop-memory/actual-nhanes/papers`

| Paper | Title | Complete-case N | Latest QA | Reader Language | Runner | QA file |
|---|---|---:|---|---|---|---|
| `0108-vitamin-d-bp` | Serum 25-hydroxyvitamin D and measured hypertension in NHANES adults: a cross-sectional pipeline dogfood analysis | 19770 | pass (26/26 paper QA checks passed.) | legacy/fail: Agenteer | retrospective_succeeded | `qa-numeric-cli.json` |
| `0111-smoking-hdl` | Smoking history and HDL cholesterol in NHANES adults: a cross-sectional pipeline dogfood analysis | 20334 | pass (24/24 paper QA checks passed.) | legacy/fail: Agenteer | retrospective_succeeded | `qa-numeric-cli.json` |
| `0113-uacr-hypertension` | Albuminuria and measured hypertension in NHANES adults: a cross-sectional pipeline dogfood analysis | 20461 | pass (27/27 paper QA checks passed.) | legacy/fail: agenteer | retrospective_succeeded | `qa-numeric-cli.json` |
| `0121-insurance-hba1c` | Health insurance coverage and HbA1c in NHANES adults | 21653 | pass (25/25 paper QA checks passed.) | legacy/fail: Agenteer | succeeded | `qa-negation-cli.json` |
| `0158-bmi-hba1c` | Body mass index and HbA1c in NHANES adults | 20366 | pass (28/28 paper QA checks passed.) | legacy/fail: Agenteer, runner record | retrospective_succeeded | `qa-cli.json` |
| `0164-pir-hdl` | Family poverty-income ratio and HDL cholesterol in NHANES adults | 18394 | pass (26/26 paper QA checks passed.) | legacy/fail: AnalysisSpec | succeeded | `qa-cli.json` |
| `0167-pir-hdl-paper-run` | Among NHANES adults aged 20 years and older, is family poverty-income ratio associated with HDL cholesterol in an exploratory cross-sectional analysis | 25967 | pass (24/24 paper QA checks passed.) | legacy/fail: Agenteer, AnalysisSpec, interop, paper-run, spec-governed | succeeded | `qa-cli.json` |
| `0168-bmi-elevated-a1c-logistic` | Body mass index and elevated HbA1c threshold in NHANES adults | 24836 | pass (25/25 paper QA checks passed.) | legacy/fail: Agenteer, AnalysisSpec, interop, paper-run, spec-governed | succeeded | `qa-cli.json` |
| `0172-bmi-fasting-glucose-subsample` | BMI and fasting glucose in the NHANES fasting subsample | 11918 | pass (26/26 paper QA checks passed.) | legacy/fail: Agenteer, AnalysisSpec, interop, paper-run, spec-governed | succeeded | `qa-cli.json` |
| `0176-bmi-fasting-glucose-subsample-repeat` | BMI and fasting glucose in the NHANES fasting subsample | 11918 | pass (26/26 paper QA checks passed.) | legacy/fail: Agenteer, AnalysisSpec, interop, paper-run, spec-governed | succeeded | `qa-cli.json` |
| `0178-bmi-fasting-glucose-r-survey` | BMI and fasting glucose in the NHANES fasting subsample | 11918 | pass (26/26 paper QA checks passed.) | legacy/fail: Agenteer, AnalysisSpec, interop, paper-run, spec-governed | succeeded | `qa-cli.json` |
| `0179-bmi-fasting-glucose-r-survey` | BMI and fasting glucose in the NHANES fasting subsample | 11918 | pass (30/30 paper QA checks passed.) | pass | succeeded | `qa-cli.json` |

Use each paper directory for paper.md, analysis.json, `critique.md`, QA history, and runner-record.json when available. `Reader Language` separates current reader-facing papers from legacy outputs that still contain platform terminology.
