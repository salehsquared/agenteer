# Actual NHANES Exploration Review - Tick 0252

## What Worked

`research explore` produced a useful first map of a real public-health table. The target-centered section for glycohemoglobin (`LBXGH`) surfaced clinically plausible relationships: fasting plasma glucose, diabetes questionnaire response, age, waist circumference, BMI, HDL cholesterol, triglycerides, and income ratio.

The burden gate was valuable. It detected high missingness for fasting/subsample fields, held promotion because survey/design fields were present, and recorded a medium multiplicity burden after metadata fields were excluded from the pair scan.

`research explore-promote` correctly refused handoff without a methods-review note, then wrote a held handoff artifact when the note explicitly acknowledged high missingness and survey-design requirements.

## What Failed Or Was Tuned

The first actual-data run exposed a design-variable bug: `WTMEC2YR`, `WTMECPRP`, `WTSAF2YR`, and `SDMVSTRA` were not all detected/excluded. The scanner now recognizes NHANES-style `WT*`, `SDMVPSU`, and `SDMVSTRA` fields as metadata/design fields before association ranking.

## Remaining Risks

The extract is local-review only and contains absolute local paths in manifests and handoff commands. Before sharing, it needs redaction/export policy. Exploration also needs better derived-variable/proxy detection for variables such as `elevated_hba1c`, which is constructed from the target.
