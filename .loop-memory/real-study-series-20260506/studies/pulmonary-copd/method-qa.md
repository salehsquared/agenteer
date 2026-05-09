# Methods-Aware QA

Run directory: /Users/saleh/TechProjects/agenteer/.loop-memory/mimic-executed-studies-20260506/runs/0308-mimic-pulmonary-copd-respiratory-failure

Overall status: warning

Readiness: needs_methods_review

## Checks

### artifact_integrity: pass

Run directory contains 8 artifact(s).

Recommended action: Continue with artifact-level QA.

Evidence: /Users/saleh/TechProjects/agenteer/.loop-memory/mimic-executed-studies-20260506/runs/0308-mimic-pulmonary-copd-respiratory-failure

### artifact_integrity: pass

A reader-facing report artifact is present.

Recommended action: Run manuscript QA before promotion.

Evidence: /Users/saleh/TechProjects/agenteer/.loop-memory/mimic-executed-studies-20260506/runs/0308-mimic-pulmonary-copd-respiratory-failure/paper.md, /Users/saleh/TechProjects/agenteer/.loop-memory/mimic-executed-studies-20260506/runs/0308-mimic-pulmonary-copd-respiratory-failure/manuscript.md

### convergence: pass

No convergence failure was detected in available estimate/issue artifacts.

Recommended action: Preserve convergence evidence with the run artifacts.

Evidence: /Users/saleh/TechProjects/agenteer/.loop-memory/mimic-executed-studies-20260506/runs/0308-mimic-pulmonary-copd-respiratory-failure/analysis-results.json

### separation: warning

Logistic-type model detected; explicit separation diagnostic evidence was not found.

Recommended action: Record separation diagnostics for logistic models before publication.

Evidence: /Users/saleh/TechProjects/agenteer/.loop-memory/mimic-executed-studies-20260506/runs/0308-mimic-pulmonary-copd-respiratory-failure/analysis-results.json

### overfitting: pass

Approximate events per predictor: 159.43.

Recommended action: Keep event counts and predictor counts in the report supplement.

Evidence: /Users/saleh/TechProjects/agenteer/.loop-memory/mimic-executed-studies-20260506/runs/0308-mimic-pulmonary-copd-respiratory-failure/analysis-results.json

### missingness: warning

Model complete-case denominator is 18.1% of the cohort (4679 of 25835).

Recommended action: Add missingness mechanism review and sensitivity analysis before promotion.

Evidence: /Users/saleh/TechProjects/agenteer/.loop-memory/mimic-executed-studies-20260506/runs/0308-mimic-pulmonary-copd-respiratory-failure/analysis-results.json

### collinearity: warning

No explicit collinearity diagnostic evidence was found.

Recommended action: For adjusted regression, record VIF/condition-number or justify why collinearity is not material.

Evidence: /Users/saleh/TechProjects/agenteer/.loop-memory/mimic-executed-studies-20260506/runs/0308-mimic-pulmonary-copd-respiratory-failure/analysis-results.json

### influence: warning

No explicit influence diagnostic evidence was found.

Recommended action: Record influential-point review for model-based papers, especially small cohorts.

Evidence: /Users/saleh/TechProjects/agenteer/.loop-memory/mimic-executed-studies-20260506/runs/0308-mimic-pulmonary-copd-respiratory-failure/analysis-results.json

### effect_size: pass

Checked 7 estimate-like record(s) for p-value/interval consistency.

Recommended action: Report effect sizes with intervals; avoid p-value-only conclusions.

Evidence: /Users/saleh/TechProjects/agenteer/.loop-memory/mimic-executed-studies-20260506/runs/0308-mimic-pulmonary-copd-respiratory-failure/analysis-results.json

### claim_alignment: pass

Reader-facing report avoids obvious framework jargon and causal overclaiming.

Recommended action: Keep internal framework details in companion artifacts, not the manuscript.

Evidence: /Users/saleh/TechProjects/agenteer/.loop-memory/mimic-executed-studies-20260506/runs/0308-mimic-pulmonary-copd-respiratory-failure/paper.md

### semantic_plausibility: pass

No dataset-specific semantic plausibility issue was detected in available artifacts.

Recommended action: For clinical/public-health datasets, attach semantic QA evidence before share/export.

Evidence: /Users/saleh/TechProjects/agenteer/.loop-memory/mimic-executed-studies-20260506/runs/0308-mimic-pulmonary-copd-respiratory-failure/analysis-results.json, /Users/saleh/TechProjects/agenteer/.loop-memory/mimic-executed-studies-20260506/runs/0308-mimic-pulmonary-copd-respiratory-failure/matched-icd-codes.csv, /Users/saleh/TechProjects/agenteer/.loop-memory/mimic-executed-studies-20260506/runs/0308-mimic-pulmonary-copd-respiratory-failure/qa.json

### survey_design: pass

No complex survey design requirement was detected.

Recommended action: If the source dataset is a complex survey, encode survey design before inference.

Evidence: none

## Next Action

Add missingness mechanism review and sensitivity analysis before promotion.
