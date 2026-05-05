# Tick 001 Architecture Note

Axis: faster/simpler.

## Current Shape

The research pipeline is a CLI-first dogfood application inside Agenteer. Its target is to turn a dataset-grounded research question into a reproducible packet with design, validation, scout, approval, bounded execution, review, manifesting, provenance, and export.

The current public surface has three layers:

1. Question/protocol tools: `question-readiness`, `decompose-question`, `clarification-plan`, `select-method`, `estimand-sketch`, `protocol-candidates`, `protocol-steer`, `protocol-edit`, `protocol-promote`.
2. Packet execution tools: `design`, `inspect`, `critique`, `validate-methods`, `scout`, `data-quality`, `runner-spec`, `stage-gate`, `approve`, `analysis-spec`, `cohort-scout-file`, `semantic-quality`, `analyze`, `review-report`.
3. Reproducibility/control tools: `checkpoint`, `packet-summary`, `manifest`, `ro-crate`, `provenance`, `qa-dashboard`, `export`, `repair-plan`, `workflow-scorecard`, `evidence-gap`, `claim-guard`, `cost-ledger`.

The generic Agenteer layer adds cross-cutting support: `context-preflight`, `plan-v2`, `replan`, `plan-critic`, `repair-run`, `research-intake`, `source-rank`, `creativity-synth`, `critic`, `cognitive-pool`, `execution-memory`.

## Packet Shape

A research packet is currently file-backed. Important files include:

- `design.json`
- `critique.json`
- `methods-validation.json`
- `scout-plan.json`
- `data-quality.json`
- `runner-spec.json`
- `approval.json`
- `analysis-result.json`
- `report.md`
- `report-review.json`
- `artifact-manifest.json`
- `ro-crate-metadata.json`
- `provenance-graph.json`
- `export-record.json`

The packet is inspectable because each stage leaves an artifact. The tradeoff is that stage completion is inferred from many filenames, so the user has to know the packet convention.

## Node / Stage List

Current research stages from `research pipeline-stages`:

- `design`: exploratory protocol packet creation.
- `critique`: review gate before execution.
- `methods-validation`: review gate before execution.
- `scout`: review gate before execution.
- `data-quality`: review gate before execution.
- `runner-spec`: review gate before execution.
- `approval`: human review gate before execution.
- `analysis`: executable bounded local analysis.
- `report-review`: review gate before export.
- `manifest`: reproducibility step before export.
- `ro-crate`: reproducibility step before export.
- `provenance`: reproducibility step before export.
- `export`: reproducibility handoff.
- `qa-dashboard`: lifecycle readiness summary.

## MedBrevia Read-Only Inputs

MedBrevia's analytics layer currently contributes concepts Agenteer should keep learning from:

- `ResearchProtocol`: normalized clinical protocol object with endpoint, exposure, comparator, covariates, stratifiers, cycles, rationale, caveats, uncertainty, and citations.
- `AnalysisSpec`: executable contract with dataset, cycles, variables, derived definitions, survey design, outputs, limits, validation, and stable hashing.
- `AnalyticsResearchSession` / `ResearchWorkspaceAgent`: candidate protocols, steering, scout matrix, dataset fit, modeling plan, quality review, learning memory.
- `AnalyticsCohortScout` and semantic quality scripts: real-data feasibility and clinical plausibility checks.

## Simplification Opportunity

The pipeline has enough primitives for now. The faster/simpler improvement is not another command. The near-term simplification should be to make `checkpoint` and `packet-summary` the primary guide rails:

- show required missing stage artifacts directly,
- point to the exact next command,
- clarify whether the next step is exploratory, review gate, executable, or reproducibility,
- reduce the need to know every low-level command name.

## Counter-Design Rejected

Rejected: implement a single `research run-all` command now.

Reason: it would hide the human-in-the-loop review that is central to this project. The better simplification is a clearer checkpoint navigator, not an autopilot.

## Proposed Tick 002

Axis 2: more robust.

Take one packet-state path and make `checkpoint`/`packet-summary` more authoritative, likely by adding a normalized stage artifact map or improving the next-action text for missing pre-analysis gates.
