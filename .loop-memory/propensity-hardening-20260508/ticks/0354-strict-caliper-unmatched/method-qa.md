# Methods-Aware QA

Run directory: /Users/saleh/TechProjects/agenteer/.loop-memory/propensity-hardening-20260508/ticks/0354-strict-caliper-unmatched/analysis-run

Overall status: fail

Readiness: blocked

## Checks

### artifact_integrity: pass

Run directory contains 17 artifact(s).

Recommended action: Continue with artifact-level QA.

Evidence: /Users/saleh/TechProjects/agenteer/.loop-memory/propensity-hardening-20260508/ticks/0354-strict-caliper-unmatched/analysis-run

### artifact_integrity: pass

A reader-facing report artifact is present.

Recommended action: Run manuscript QA before promotion.

Evidence: /Users/saleh/TechProjects/agenteer/.loop-memory/propensity-hardening-20260508/ticks/0354-strict-caliper-unmatched/analysis-run/paper.md, /Users/saleh/TechProjects/agenteer/.loop-memory/propensity-hardening-20260508/ticks/0354-strict-caliper-unmatched/analysis-run/manuscript.md

### convergence: pass

No convergence failure was detected in available estimate/issue artifacts.

Recommended action: Preserve convergence evidence with the run artifacts.

Evidence: /Users/saleh/TechProjects/agenteer/.loop-memory/propensity-hardening-20260508/ticks/0354-strict-caliper-unmatched/analysis-run/stats-run/diagnostics.json, /Users/saleh/TechProjects/agenteer/.loop-memory/propensity-hardening-20260508/ticks/0354-strict-caliper-unmatched/analysis-run/stats-run/stats-qa.json

### separation: warning

Logistic-type model detected; explicit separation diagnostic evidence was not found.

Recommended action: Record separation diagnostics for logistic models before publication.

Evidence: /Users/saleh/TechProjects/agenteer/.loop-memory/propensity-hardening-20260508/ticks/0354-strict-caliper-unmatched/analysis-run/stats-run/diagnostics.json, /Users/saleh/TechProjects/agenteer/.loop-memory/propensity-hardening-20260508/ticks/0354-strict-caliper-unmatched/analysis-run/stats-run/stats-qa.json

### overfitting: pass

No events-per-predictor issue was detected.

Recommended action: Keep event counts and predictor counts in the report supplement.

Evidence: /Users/saleh/TechProjects/agenteer/.loop-memory/propensity-hardening-20260508/ticks/0354-strict-caliper-unmatched/analysis-run/stats-run/stats-run.json

### missingness: pass

Missingness/complete-case evidence is present.

Recommended action: Report complete-case N and per-variable missingness.

Evidence: /Users/saleh/TechProjects/agenteer/.loop-memory/propensity-hardening-20260508/ticks/0354-strict-caliper-unmatched/analysis-run/stats-run/diagnostics.json, /Users/saleh/TechProjects/agenteer/.loop-memory/propensity-hardening-20260508/ticks/0354-strict-caliper-unmatched/analysis-run/stats-run/stats-qa.json

### collinearity: warning

No explicit collinearity diagnostic evidence was found.

Recommended action: For adjusted regression, record VIF/condition-number or justify why collinearity is not material.

Evidence: /Users/saleh/TechProjects/agenteer/.loop-memory/propensity-hardening-20260508/ticks/0354-strict-caliper-unmatched/analysis-run/stats-run/diagnostics.json, /Users/saleh/TechProjects/agenteer/.loop-memory/propensity-hardening-20260508/ticks/0354-strict-caliper-unmatched/analysis-run/stats-run/stats-qa.json

### influence: warning

No explicit influence diagnostic evidence was found.

Recommended action: Record influential-point review for model-based papers, especially small cohorts.

Evidence: /Users/saleh/TechProjects/agenteer/.loop-memory/propensity-hardening-20260508/ticks/0354-strict-caliper-unmatched/analysis-run/stats-run/diagnostics.json, /Users/saleh/TechProjects/agenteer/.loop-memory/propensity-hardening-20260508/ticks/0354-strict-caliper-unmatched/analysis-run/stats-run/stats-qa.json

### effect_size: pass

Checked 1 estimate-like record(s) for p-value/interval consistency.

Recommended action: Report effect sizes with intervals; avoid p-value-only conclusions.

Evidence: /Users/saleh/TechProjects/agenteer/.loop-memory/propensity-hardening-20260508/ticks/0354-strict-caliper-unmatched/analysis-run/stats-run/stats-run.json

### claim_alignment: fail

Reader-facing report appears to use causal language without a causal design policy.

Recommended action: Rewrite claims as association/prediction/diagnostic-performance statements or add a reviewed causal design.

Evidence: /Users/saleh/TechProjects/agenteer/.loop-memory/propensity-hardening-20260508/ticks/0354-strict-caliper-unmatched/analysis-run/paper.md

### semantic_plausibility: pass

No dataset-specific semantic plausibility issue was detected in available artifacts.

Recommended action: For clinical/public-health datasets, attach semantic QA evidence before share/export.

Evidence: /Users/saleh/TechProjects/agenteer/.loop-memory/propensity-hardening-20260508/ticks/0354-strict-caliper-unmatched/analysis-run/stats-run/stats-qa.json

### survey_design: pass

No complex survey design requirement was detected.

Recommended action: If the source dataset is a complex survey, encode survey design before inference.

Evidence: none

## Next Action

Rewrite claims as association/prediction/diagnostic-performance statements or add a reviewed causal design.
