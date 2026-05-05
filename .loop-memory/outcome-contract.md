# Outcome Contract

Agenteer should become a practical agent/research platform that can route from a research question or analysis proposal to an executable, inspectable, reproducible analysis path.

## Current Contract

- Choose an analysis route with evidence-aware planning, not string matching alone.
- Prefer executable `AnalysisSpec`, `method-selection`, backend availability, and table evidence before runner selection.
- Run the selected path locally when feasible and record typed artifacts.
- Surface runner outputs through lifecycle/readiness/index views.
- Treat complex survey analysis, missingness, sparse cells, subsample eligibility, and causal overclaiming as first-class review risks.
- Do not mutate MedBrevia/domain repos without explicit approval.

## Success Signal

A user or orchestrating agent can inspect one packet and see the selected route, executable contract, backend, input evidence, runner result, QA status, reproducibility posture, blockers, and next action.
