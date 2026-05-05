# Agenteer x MedBrevia NHANES Design Packet

Question: Among NHANES adults with doctor-diagnosed diabetes, what is the feasibility of estimating HbA1c distribution by sex and age group using curated demographics and diabetes domains?
MedBrevia repo: /Users/saleh/WebstormProjects/medbrevia_v3
Branch: codex/grandrounds-edition-redesign-4
Registry SHA-256: a7656b85d8b7ad62f1efe51f003e97c40d8761bab460b4ee89ce8b3615bb759e

## Candidate Protocol

Title: HbA1c and HbA1c
Dataset: nhanes
Population: Adults, age 20+ when clinically appropriate
Cycles: 2017-2020-prepandemic
Approved domains: demographics, diabetes
Survey design: prepandemic_mec / WTMECPRP

### Variables

Exposure: HbA1c (LBXGH, LBXGLU)
Endpoint: HbA1c (LBXGH)
Covariates: RIDAGEYR, RIDRETH3, INDFMPIR
Stratifiers: RIAGENDR

### Derived Definitions

- hba1c_defined_diabetes: LBXGH >= 6.5%

### Diagnostics

Blockers: none
Warnings: none

## CLI Product Shape

A CLI-only research design loop where Agenteer reads dataset metadata, proposes bounded analytic protocols, and returns traceable design packets without mutating the source project.

- `agenteer research design --project medbrevia-nhanes --repo <medbrevia_v3> --question '<clinical question>' --out <packet-dir>`
- `agenteer run --spec <packet-dir>/workflow.yaml --session <session-dir>`
- `agenteer inspect --session <session-dir> --evidence`

## Self-Reinforcing Loop

Agenteer improves by turning this workflow into reusable nodes and better inspection. The research pipeline improves by replacing hand-rolled orchestration with a replayable command-line contract while keeping domain/product ownership outside the framework.

### Agenteer Owns

- workflow state, session replay, permission envelopes, evidence records, node composition, and inspectable traces
- deterministic protocol validation before any model-generated code can run
- human approval and resume boundaries between design, scout, and execution

### Domain/Product Owns

- auth, UI, Firestore/GCS/Cloud Run integration, dataset hosting, and product-specific presentation
- curated dataset registries and medical domain constraints
- final clinical UX and staff review policy

### First Agenteer Backlog

- promote this lab command into a real workflow example with nodes for registry_load, protocol_design, protocol_validate, cohort_scout, and report_packet
- teach inspect to group failures by product concept: question, protocol, data, execution, artifact, report
- add artifact evidence records for generated code, tables, plots, runner logs, and validation reports
- add a fixture-driven long-running workflow test with human approval and resume

