# Controller Summary: SAVR/TAVR Dialysis Redo

## Status

The study was completely rerun from the MIMIC-IV GCS Parquet cache using the user-supplied primary ICD/CPT dialysis and valve codes, plus explicitly labeled auxiliary code scans where needed for MIMIC HCPCS rows and ICD-10-PCS valve classification.

Deterministic QA passed for the reader-facing paper and figures. The DeepSeek triple reviewer panel ran successfully after a reviewer-prompt hardening change. The final panel still recommends revision rather than promotion.

## Accepted Reviewer Repairs Implemented

- Mortality horizons now start at index admission rather than discharge, so in-hospital deaths are included in 30-day and later mortality horizons.
- Peritoneal dialysis and same-admission mixed SAVR/TAVR patients are descriptive only and excluded from formal adjusted models.
- Stroke phenotype now includes hemorrhagic and unspecified stroke families used in MACE.
- Outcome phenotype logic is exported in `outcome-phenotypes.json`.
- Matched valve procedure code evidence is exported in `valve-phenotype-code-list.csv`.
- Propensity matching now reports covariates, matched pairs, all-covariate balance, risk differences, 95% intervals, and McNemar p-values.
- Figure QA now passes by using proper FigureSpec x/y label metadata.
- Reviewer prompt was hardened to make DeepSeek JSON output more reliable.

## Residual Reviewer Blockers

The main unresolved blocker is phenotype scope, not execution failure. One reviewer argues the SAVR ICD-9 primary definition should include additional codes such as 35.23 and 35.24. I did not silently change the primary user-supplied code list because the current run was explicitly requested with 35.21 and 35.22. The correct next move is to run an expanded-code sensitivity analysis and compare cohort membership and estimates.

Other residual issues: Cox proportional hazards diagnostics are not implemented in this bespoke runner; Fine-Gray/subdistribution competing-risk models are not implemented; same-hospital readmission/reintervention outcomes remain hypothesis-generating because MIMIC lacks complete outside-hospital follow-up.

## Key Outputs

- `paper.md`
- `analysis-results.json`
- `outcome-phenotypes.json`
- `valve-phenotype-code-list.csv`
- `propensity-balance.csv`
- `figure-qa.json` / `figure-qa.md`
- `paper-qa.json`
- `run-inspection.json` / `run-inspection.md`
- `review-method/`
- `review-final-retry/`
- `review-final-postrepair/`
