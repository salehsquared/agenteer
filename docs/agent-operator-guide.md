# Agent Operator Guide

This is the start-here document for any agent running or extending Agenteer. Use it before jumping into source files or broad CLI experimentation.

Agenteer has grown into four connected systems:

- **Core framework**: runtime, nodes, manifests, context store, permission kernel, sessions, evidence, publish/install.
- **Agent improvement layer**: autocontext adapter, planner-v2, plan state, typed node contracts, repair-run, critics, creativity, improvement selection, task envelopes, evidence receipts.
- **Research machine**: research protocol, AnalysisSpec, method selection, stats/ML runners, paper generation, manifests, QA, benchmarks, public-health packet workflows.
- **Specialization factory**: generate/evaluate/critique/repair/promote reusable domain-specialist variants with lineage and promotion gates.

The rule is simple: generated work is not trusted until it has context, a plan, typed artifacts, evaluation, critique, and promotion or rejection evidence.

## Repository Map

| Area | Path | Purpose |
|---|---|---|
| Core runtime | `packages/core/src` | Node primitive, runtime loop, context store, permissions, sessions. |
| Trust layer | `packages/trust/src` | Evidence records, structured output, filesystem access guard, cross-checking. |
| Stdlib nodes | `packages/stdlib/src` | Built-in deterministic, validator, human, planner, meta, and context nodes. |
| CLI dispatcher | `packages/cli/src/bin/agenteer.ts` | Top-level command routing and help text. |
| CLI command APIs | `packages/cli/src/commands` | Workflow, inspect, publish/install/search, agent, research command functions. |
| Research machine | `packages/cli/src/research-machine` | AnalysisSpec v2, backend/dataset/archetype catalogs, method ontology, stats and ML runners. |
| ML layer | `packages/cli/src/research-machine/ml` | Model registry, sklearn bridge, run/compare/inspect commands. |
| Statistics layer | `packages/cli/src/research-machine/stats` | Classical statistical method schemas, runner, command rendering. |
| Specializations | `packages/cli/src/specialize` | Specialization manifests, candidate lifecycle, deterministic loop runtime. |
| Registry | `packages/registry/src` | Node package validation, npm publish/install/search, lockfile, permission diffs. |
| Examples | `examples/` | Runnable research assistant and research-pipeline node examples. |
| Docs | `docs/` | Architecture, capabilities, command catalog, research machine, specialization, operator guidance. |
| Loop memory | `.loop-memory/` | Local dogfood history, golden packets, challenge notes, research outputs. |

## First Commands

From the repo root:

```bash
npm install
npm run build
npm test
```

During development, prefer the built CLI:

```bash
node packages/cli/dist/bin/agenteer.js --help
```

The source dispatcher is `packages/cli/src/bin/agenteer.ts`. If docs and help disagree, treat the dispatcher as the source of truth and update the docs.

## Autocontext Operating Procedure

Autocontext lives at `/Users/saleh/TechProjects/context` in this environment. It is not Agenteer. It is the local context-intelligence layer Agenteer can wrap.

Use autocontext before planning:

```bash
node /Users/saleh/TechProjects/context/dist/index.js status --path /Users/saleh/TechProjects/agenteer --json
node /Users/saleh/TechProjects/context/dist/index.js pack --path /Users/saleh/TechProjects/agenteer --query "task description" --budget 9000
node /Users/saleh/TechProjects/context/dist/index.js impact --path /Users/saleh/TechProjects/agenteer packages/cli/src/bin/agenteer.ts
```

Or through Agenteer:

```bash
agenteer agent context-preflight --repo . --query "task description" --target packages/cli/src/bin/agenteer.ts --json
agenteer agent context-manifest --repo . --query "task description" --target packages/cli/src/bin/agenteer.ts --out ./context-manifest.json --json
agenteer agent context-score --manifest ./context-manifest.json --json
```

Current important caveat: this repo may not have committed `.context.yaml` scopes. If `context status` reports `missing`, do not treat an empty `context pack` as evidence. Either:

- proceed with direct source inventory and record that context is missing,
- initialize or promote autocontext scopes as a separate deliberate change, or
- use `agenteer agent context-manifest` and let planner/critic degrade or block plans that rely on missing context.

Before edits, use `context impact` or `agenteer agent context-impact` for high-risk files. After material edits, use `context verify` or Agenteer's normal build/test commands. Do not run paid services just to satisfy context verification.

## Choosing The Right Path

Use this decision table instead of starting with arbitrary commands.

| Goal | Primary path | Stop condition |
|---|---|---|
| Run a normal Agenteer workflow | `run` -> `inspect` or `resume` -> `ctx` | Session succeeded, suspended with human prompt, or failed with evidence. |
| Debug session state | `inspect --summary`, `inspect --evidence`, `ctx lineage`, `ctx diff` | You can name the blocking node, evidence, or permission denial. |
| Publish/install nodes | `publish --dry-run`, `install`, `search` | Manifest validation, permission diff, lockfile, or npm result explains outcome. |
| Improve Agenteer itself | `agent context-manifest` -> `plan-v2` -> `plan-critic` -> implement -> tests -> `improvement-run` | Improvement has benchmark evidence or is explicitly rejected. |
| Generate or evaluate research methods | `research method-select` -> `modeling-plan` -> `analysis-run`, `stats-run`, `ml-run`, or `paper-run` | Manifest and QA say local review ready or methods review blocks execution. |
| Compare ML models | `ml-models` -> `modeling-plan` -> `ml-compare` -> `analysis-manifest` | Comparison posture is ready or missing validation is explicit. |
| Produce a public-health paper | AnalysisSpec -> `paper-run` -> `paper-qa` -> `paper-lifecycle` -> benchmark | `paper.md` is reader-facing and passes language/readability QA; provenance lives in companion artifacts. |
| Create a reusable specialist | `specialize init` -> `plan` -> `run-loop` -> `inspect` | Candidates are promoted or rejected with evaluation, critique, and lineage. |
| Prove a result is repeatable | `analysis-manifest`, `analysis-benchmark`, benchmark suite, rerun stability | Reproducibility metadata and artifact hashes are stable or failure is typed. |

## Golden Research Path

For a standard local statistical analysis:

```bash
agenteer research method-select \
  --question "Is exposure associated with outcome?" \
  --outcome binary \
  --study-design cross_sectional \
  --dataset nhanes \
  --survey \
  --out ./method-selection.json \
  --json

agenteer research modeling-plan \
  --question "Is exposure associated with outcome?" \
  --outcome binary \
  --study-design cross_sectional \
  --table ./rows.csv \
  --target outcome \
  --survey \
  --json

agenteer research analysis-run \
  --question "Is exposure associated with outcome?" \
  --method logistic-regression \
  --data ./rows.csv \
  --outcome outcome \
  --exposure exposure \
  --literature ./literature-search.json \
  --method-selection ./method-selection.json \
  --analysis-spec ./analysis-spec.json \
  --require-bound \
  --out-dir ./analysis-run \
  --json

agenteer research analysis-manifest --run-dir ./analysis-run --require-ready --json
```

If `--survey` is required and complex survey variance matters, route to `paper-run --backend r-survey` instead of forcing `stats-run`. `stats-run --allow-survey-approximation` is exploratory and should not be presented as paper-ready survey inference.

For ML:

```bash
agenteer research ml-compare \
  --task binary_classification \
  --data ./rows.csv \
  --target outcome \
  --model logistic-regression \
  --model random-forest \
  --primary-metric auroc \
  --scale \
  --cv 5 \
  --out-dir ./ml-compare \
  --json

agenteer research analysis-manifest --run-dir ./ml-compare --require-ready --json
```

Binary ML comparison readiness requires calibration evidence and at least one transparent baseline.

## Golden Agent-Improvement Path

Use this when improving Agenteer as a framework:

```bash
agenteer agent context-manifest --repo . --query "improvement goal" --target packages/cli/src/bin/agenteer.ts --out ./context-manifest.json --json
agenteer agent plan-v2 --goal "improvement goal" --context-manifest ./context-manifest.json --repo . --json > ./plan.json
agenteer agent plan-critic --plan ./plan.json --repo . --json
```

After implementation and tests:

```bash
agenteer agent improvement-candidates \
  --goal "improvement goal" \
  --history ./.loop-memory \
  --benchmark-target ./.loop-memory/golden \
  --out ./improvement-candidates.json \
  --json

agenteer agent improvement-run \
  --candidates ./improvement-candidates.json \
  --benchmark-before ./before.json \
  --benchmark-after ./after.json \
  --budget-usd 0 \
  --out ./improvement-run.json \
  --json
```

Do not claim a full improvement cycle unless there is a selected stress case, executed candidate or implementation, evaluation result, critique/failure attribution, repair/mutation or rejection, rerun or justified stop, final decision, and next-step recommendation.

## Golden Specialization Path

Use specializations when the user wants Agenteer to become good at a domain rather than execute one task.

```bash
agenteer specialize init --builtin research-methods-specialist --out ./.agenteer/specializations/research-methods --json
agenteer specialize plan --dir ./.agenteer/specializations/research-methods --json
agenteer specialize run-loop --dir ./.agenteer/specializations/research-methods --count 4 --json
agenteer specialize inspect --dir ./.agenteer/specializations/research-methods --json
```

A candidate is only useful if it moves through generated -> evaluated -> critiqued -> promoted/rejected. The system intentionally blocks “generated” from masquerading as “validated.”

## Artifact Discipline

Prefer durable JSON artifacts over prose-only progress:

- Context: `context-manifest.json`, `context-score.json`, `context-outcome.json`.
- Plans: `plan.json`, `plan-state.json`, `plan-critique.json`, `plan-diff.json`.
- Node execution: `node-contract.json`, `node-execution-record.json`.
- Repairs: `repair-run.json`, `repair-provenance.json`.
- Tasks: `task.json`, evidence receipts, MCP/A2A exports.
- Research: `method-selection.json`, `modeling-plan.json`, `analysis-spec-v2.json`, `execution-contract.json`, `literature-search.json`, `literature-qa.json`, `stats-run.json`, `ml-run.json`, `comparison.json`, `analysis-run-manifest.json`, `benchmark-eval.json`.
- Papers: `paper.md` for reader-facing scientific prose; `analysis.json`, `critique.md`, `paper-qa.json`, runner record, lifecycle files, and receipts for audit/provenance.
- Specializations: `specialization.json`, candidate/evaluation/critique/repair/promotion records, report JSON/Markdown.

When a command has `--json`, use it in automation and save the output. Human-readable output is for inspection, not provenance.

## Failure Postures To Respect

Several commands deliberately return conservative postures. Do not override them in prose:

- `blocked_survey_required`: route to survey-aware paper/backend execution.
- `exploratory_survey_approximation`: local exploration only; not paper-ready.
- `invalid_binding`: upstream method/spec evidence does not match execution.
- `needs_methods_review`: methodological uncertainty, not executable repair.
- `optional_dependency_missing`: install optional dependency or choose another model.
- `insufficient_comparison`: model comparison is not ready for promotion.
- `degraded` or `blocked` context manifest: lower confidence or stop before planning.

## Adding New Capability

Add the narrowest reusable primitive that closes a real loop failure:

1. Reproduce the failure with a command or fixture.
2. Decide whether it belongs in core, agent, research-machine, ML/stats, specialization, registry, trust, or docs.
3. Add typed schemas first.
4. Add command/API implementation.
5. Add tests for success and failure.
6. Add docs and examples.
7. Run build and targeted tests.
8. Record any loop-memory note only if it captures durable operational learning.

Avoid broad new CLI surface unless the golden path needs it.

## Verification Checklist

Minimum after docs-only edits:

```bash
npm run build
npm test
```

Minimum after CLI/source edits:

```bash
npm run build
npm test
node packages/cli/dist/bin/agenteer.js --help
```

Minimum after research-machine edits:

```bash
npm run build
npm test -- packages/cli/tests/research-ml.test.ts
```

Minimum after specialization edits:

```bash
npm run build
npm test -- packages/cli/tests/specialize.test.ts
```

If a verifier cannot run because a local backend such as R, Python package, or optional ML library is unavailable, record the exact command, missing dependency, and the fallback posture.
