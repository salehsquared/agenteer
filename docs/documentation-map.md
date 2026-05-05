# Documentation Map

Use this map to choose the right document before opening source. It is intentionally operator-oriented: each document has a job.

## Start Here

| Document | Audience | Use it for |
|---|---|---|
| [README](../README.md) | Humans and agents new to the repo | High-level project identity, package list, install/build/test, docs index. |
| [Agent Operator Guide](agent-operator-guide.md) | Agents operating Agenteer | Decision flow, autocontext use, golden paths, artifact discipline, verification expectations. |
| [Command Catalog](command-catalog.md) | Agents and CLI users | Discovering the correct command family by intent. |
| [CLI Reference](cli.md) | CLI users | Detailed base workflow CLI reference plus namespace pointers. |

## Core Framework

| Document | Covers |
|---|---|
| [Architecture](architecture.md) | Runtime loop, context store, evidence, permission kernel, sessions, packages. |
| [Capabilities](capabilities.md) | Capability grammar, intersection, dynamic actions, permission boundaries. |
| [Nodes](nodes.md) | Node contract, manifests, schemas, intents, context patches, evidence. |
| [Evidence](evidence.md) | Evidence record semantics, lineage, stale evidence, trace reading. |
| [Publishing A Node](publishing-a-node.md) | Node package scaffold, framework manifest, validation, publish/install troubleshooting. |

## Agent Improvement Layer

| Document | Covers |
|---|---|
| [Agent Improvement Layer](agent-improvement-layer.md) | Autocontext adapter, ContextPackManifest, planner-v2, plan state, typed node contracts, repair-run, critics, creativity, improvement candidates, task envelopes, evidence receipts, interop exports. |
| [Agentic Workflow Research Notes](agentic-workflow-research-notes.md) | Research notes that informed recent agentic workflow design choices. |

## Research Machine

| Document | Covers |
|---|---|
| [Research Pipeline](research-pipeline.md) | Research packet ownership, stage-based workflow, AnalysisSpec-to-paper path, research machine path, audit commands, packet readiness. |
| [Research ML Modeling](research-ml.md) | ML adapter registry, `modeling-plan`, stats runner, ML run/compare/inspect, analysis manifests, benchmark readiness, preprocessing, metrics, artifacts, explainability. |
| [Research Methods Foundation](research-methods-foundation.md) | Method ontology, analysis selection, classical statistics, survey and biomedical methods foundations. |
| [Research Machine Build Tracks](research-machine-build-tracks.md) | Long-term tracks: execution core, engines, AnalysisSpec, study archetypes, dataset adapters, QA harness, planner/product layer. |
| [Research Pipeline Nodes](../examples/research-pipeline-nodes/README.md) | Deterministic node examples for protocol design, critique, scout, analysis, QA, manifest, export. |

## Specialization Factory

| Document | Covers |
|---|---|
| [Specializations](specializations.md) | Specialization manifest, state layout, candidate lifecycle, evaluation, critique, promotion, generators, evaluators, loop accounting. |

## Examples And Package READMEs

| Document | Covers |
|---|---|
| [Research Assistant Demo](../examples/research-assistant/README.md) | Runnable six-node stdlib composition. |
| [`packages/core/README.md`](../packages/core/README.md) | Core package public API orientation. |
| [`packages/cli/README.md`](../packages/cli/README.md) | CLI package orientation. |
| [`packages/stdlib/README.md`](../packages/stdlib/README.md) | Standard library package orientation. |
| [`packages/trust/README.md`](../packages/trust/README.md) | Trust package orientation. |
| [`packages/registry/README.md`](../packages/registry/README.md) | Registry package orientation. |
| [`packages/create-node/README.md`](../packages/create-node/README.md) | Node scaffold package orientation. |

## How To Keep Docs Current

When adding or changing a command:

1. Update the dispatcher help in `packages/cli/src/bin/agenteer.ts`.
2. Update [Command Catalog](command-catalog.md).
3. Update the domain doc that explains semantics, not only flags.
4. Add or update examples if the command is part of a golden path.
5. Run `npm run build` and `npm test`.

When adding a new framework primitive:

1. Update [Architecture](architecture.md) if it changes runtime shape.
2. Update [Agent Operator Guide](agent-operator-guide.md) if it changes how agents should work.
3. Update [Agent Improvement Layer](agent-improvement-layer.md) if it belongs under `agenteer agent`.
4. Update [Command Catalog](command-catalog.md) if it adds CLI surface.

When adding a new research capability:

1. Update [Research ML Modeling](research-ml.md) for stats/ML/modeling execution.
2. Update [Research Pipeline](research-pipeline.md) for packet/paper/golden-path behavior.
3. Update [Research Methods Foundation](research-methods-foundation.md) for method selection semantics.
4. Update [Research Machine Build Tracks](research-machine-build-tracks.md) if it changes long-term architecture.

