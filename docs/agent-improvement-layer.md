# Agent Improvement Layer

Agenteer now exposes a generic `agenteer agent ...` command group for context-aware planning, repair, creativity, critique, and self-improvement selection. The layer is additive: the existing stdlib `default_planner` and `repair_loop` remain supported, while these commands provide higher-level artifacts that can be used by any workflow.

The commands are intentionally local-first. They do not spend cloud money, and they do not fabricate live web or X evidence. When live retrieval is disabled, source records are marked as local seeds, unverified placeholders, or connector-required discovery signals so downstream ranking cannot silently treat them as evidence.

## Autocontext Adapter

Autocontext remains the context substrate. Agenteer wraps it through the CLI rather than taking a hard package dependency.

```bash
agenteer agent context-preflight --repo . --query "planner repair loop" --target packages/cli/src/bin/agenteer.ts --json
agenteer agent context-pack --repo . --query "research pipeline" --budget 4000 --json
agenteer agent context-manifest --repo . --query "research pipeline" --target packages/cli/src/commands/research.ts --out ./context-manifest.json --json
agenteer agent context-score --manifest ./context-manifest.json --json
agenteer agent context-outcome --manifest ./context-manifest.json --result ./benchmark-result.json --out ./context-manifest.updated.json --json
agenteer agent context-impact --repo . --target packages/cli/src/commands/agent.ts --json
agenteer agent context-verify --repo . --json
```

Use `--context-bin <path>` for tests or custom installs, and `--autocontext-root /Users/saleh/TechProjects/context` for the local project checkout.

`context-manifest` is the durable context contract. It records source hashes, freshness, relevance, contradiction risk, token budget, memory hits, missing context, downstream outcome history, policy thresholds, and an overall status:

- `ready`: safe to use for normal planner context.
- `degraded`: usable only with explicit review gates and lower confidence.
- `blocked`: should not drive high-confidence planning.

`plan-v2 --context-manifest <json>` applies the context-quality penalty directly to candidate confidence and risk. `plan-critic` blocks plans that remain high-confidence while their context manifest is degraded or blocked.

## Typed Node Contracts

Typed node contracts are the executable capability contract between planning and runtime. A contract declares a node's input schema, output schema, artifact side effects, verifier, typed failure modes, permission envelope, cost boundary, side effects, stability, and examples. Existing `framework.json` manifests can be converted into contracts, but explicit `node-contract.json` files are preferred for production paths.

```bash
agenteer agent node-contract --manifest ./nodes/cohort-scout/framework.json --out ./nodes/cohort-scout/node-contract.json --json
agenteer agent node-contracts --dir ./nodes --json
agenteer agent node-contract-validate --contract ./nodes/cohort-scout/node-contract.json --json
agenteer agent node-io-validate --contract ./nodes/cohort-scout/node-contract.json --kind input --value ./packet/input.json --json
agenteer agent node-output-record --contract ./nodes/cohort-scout/node-contract.json --input ./packet/input.json --output ./packet/output.json --artifact-base ./packet --out ./packet/node-execution-record.json --json
```

`plan-v2 --node-contracts <dir>` exposes contract capabilities to the planner, and executable plan steps may reference `contractId`. `plan-critic --node-contracts <dir>` blocks unknown executable nodes unless the step carries a reviewed `nodeProposal`, blocks invalid contracts, enforces failure-type presence, and compares contract cost boundaries against the rubric.

The intended execution shape is:

```text
contract registry -> input validation -> node run -> output validation -> artifact records -> typed failures -> repair-plan
```

This makes research nodes such as AnalysisSpec validation, cohort scout, semantic QA, runner generation, report QA, and packet export composable without hiding their side effects. Invalid inputs fail before execution. Invalid outputs fail before downstream provenance. Missing required artifacts become typed failures that repair tools can route deterministically.

## Planning And Repair

Planner v2 emits multiple ranked candidates with assumptions, steps, expected evidence, cost, risk, confidence, novelty, utility, discovered CLI capabilities, optional manifest references, node-proposal requirements, and evidence traces. Replanning preserves completed evidence unless the event explicitly invalidates it. `context-preflight` exits non-zero when autocontext reports stale or missing context, even if the underlying autocontext command itself completed.

```bash
agenteer agent plan-v2 --goal "Improve research workflow reliability" --context-manifest ./context-manifest.json --node-contracts ./nodes --repo . --json
agenteer agent plan-state-create --plan ./plan.json --out ./plan-state.json --json
agenteer agent plan-state-event --state ./plan-state.json --event '{"type":"step_completed","targetStepId":"step-1","evidenceRefs":["context.ready"]}' --out ./plan-state.json --json
agenteer agent plan-state-replan --state ./plan-state.json --event "failure: report QA failed but completed evidence remains valid" --out ./plan-state.json --json
agenteer agent plan-state-resume --state ./plan-state.json --json
agenteer agent replan --plan ./plan.json --event "failure: validator failed" --json
agenteer agent plan-critic --plan ./plan.json --node-contracts ./nodes --json
agenteer agent plan-diff --before ./plan.json --after ./replanned.json --json
agenteer agent repair-run --bundle ./bundle --qa "npm test" --repair-command "npm run fix" --max-attempts 3 --max-cost-usd 0 --max-risk-score 0.7 --allow-file "src/**" --analysis-spec ./analysis-spec.json --json
agenteer agent repair-provenance --repair-run ./repair-run.json --json
```

`plan-state-*` turns planner output into an event-sourced, resumable artifact. It tracks selected candidate, current steps, assumptions, evidence requirements, completed evidence, invalidated evidence, confidence/risk timeline, and all plan events. `plan-critic` accepts either a plan candidate/portfolio or a plan state; state-aware criticism blocks invalidated required evidence, unresolved failures, and low-confidence transitions. `plan-diff` accepts plan states and reports changed steps, assumptions, evidence requirements, and confidence delta.

The state machine is intentionally strict:

- Completed evidence survives replanning unless the event explicitly invalidates it.
- Context changes and evidence invalidation move the state to `needs_replan`.
- Step failure and critic failure move the state to `blocked`.
- Repair or replanning returns the state to `ready`, but still requires `plan-critic` before execution.
- Final research packets should cite the plan state that produced them.

Repair-run is bounded and provenance-first. Each run has a `schemaVersion`, `repairRunId`, bundle path, QA command, max attempts, cost/risk boundaries, optional AnalysisSpec hash, attempts, final status, and stopping reason. Each attempt records the input failure, failure class, failure hash, repair action, changed files, per-file patch provenance, diff hash, validator output, and attempt status.

Repair-run stops on pass, repeated failure, methodological or semantic failure, max attempts, out-of-bundle writes, or cost/risk boundary violations. It can repair in two ways:

- Run an explicit `--repair-command <cmd>` inside the bundle.
- Apply deterministic bundle-local rules from `agenteer.repair.json`.

The rule file format is:

```json
{
  "repairs": [
    {
      "match": "test failed",
      "file": "src/example.ts",
      "replace": "broken",
      "with": "fixed",
      "reason": "repair known fixture failure"
    }
  ]
}
```

Each patch provenance record includes the changed file, before hash, after hash, diff hash, diff summary, reason, validator evidence, and validator evidence hash. Repair rules are preflighted before write: targets cannot escape the bundle, touch protected paths such as `.git`, `node_modules`, or `dist`, or violate `--allow-file` constraints. Methodological or semantic failures are deliberately not executable repairs; they must go back through protocol, AnalysisSpec, or report critique.

## Research, Creativity, And Evaluation

Research intake produces explicit source records for papers, official docs, X weak signals, classic references, and unrelated-field analogies. With default deterministic mode, records are labeled as local seeds, unverified, or connector-required. With `--live`, paper intake attempts Crossref retrieval and marks successful records as live anchors. X remains weak-signal discovery unless verified elsewhere.

```bash
agenteer agent research-intake --topic "agent memory" --web --x --papers --live --json
agenteer agent source-rank --sources ./sources.json --json
agenteer agent creativity-synth --sources ./ranked-sources.json --goal "Improve planning" --json
agenteer agent idea-evolve --ideas ./ideas.json --generations 2 --json
agenteer agent adversarial-protocols --domain "medical research" --json
agenteer agent critic --artifact ./artifact.md --rubric ./rubric.json --mode cold --json
agenteer agent cognitive-pool --artifact ./artifact.md --json
```

Reliability, context denoising, and trajectory-policy retrieval are the long-horizon safeguards. Reliability evaluation treats repeated runs as the unit of evidence rather than pass@1 alone. Context denoising detects failed-attempt drag before planner context packs are assembled. Trajectory policy retrieval ranks prior successful actions by state similarity, reward, and valid-action constraints without changing model weights.

```bash
agenteer agent reliability-eval --runs ./runs.json --json
agenteer agent context-denoise --context ./.autocontext/memory --json
agenteer agent trajectory-policy --trajectory ./trajectories.json --state "stale context before planning" --valid-action run-context-denoise --json
```

## Evolutionary Improvement Loop

The evolutionary loop turns creative ideas into benchmark-competing improvement candidates. It is intentionally bounded: candidates are generated from source-ranked ideas, plan state, repair provenance, or history, then evaluated against before/after golden benchmark evidence. Promotion is blocked unless relevant tests pass and the benchmark score improves, risk decreases, or an explicit neutral-score override is supplied with a reason.

```bash
agenteer agent improvement-candidates --goal "Improve benchmark-gated self-improvement" --ideas ./ideas.json --plan-state ./plan-state.json --repair-provenance ./repair-provenance.json --benchmark-target ./golden-suite.json --rejected-history ./.loop-memory/rejected --out ./improvement-candidates.json --json
agenteer agent improvement-run --candidates ./improvement-candidates.json --benchmark-before ./before-score.json --benchmark-after ./after-score.json --budget-usd 10 --rejected-dir ./.loop-memory/rejected --out ./improvement-run.json --json
```

Candidate generation uses seven bounded mutation operators:

- `validator_threshold`: tighten a validator or benchmark threshold.
- `node_recombination`: recombine two node/contract designs.
- `benchmark_case`: add a harder golden benchmark case.
- `workflow_simplification`: remove or merge a step that does not improve the benchmark.
- `failure_classifier`: strengthen typed failure classification.
- `typed_contract_replacement`: replace broad prompt logic with typed contract logic.
- `tail_analogy`: introduce a tail-end analogy, then extract a practical subcomponent.

Each `ImprovementCandidate` records origin, mutation type, parent lineage, hypothesis, expected gain/risk, scope, cost estimate, novelty, benchmark target, complexity delta, and a rejected counter-design. Each `ImprovementRun` records before/after benchmark evidence, score delta, risk delta, promoted candidates, queued candidates, rejected candidates, lessons, cost boundary, tests status, and override state.

Promotion policy:

- The after benchmark must pass.
- Relevant tests must pass.
- Total candidate cost must remain within the declared budget.
- Golden benchmark score must improve, measured risk must decrease, or `--override-neutral --override-reason <reason>` must be explicit.
- Added complexity must be justified by expected gain.
- Counter-designs must be recorded.
- Rejections are written as durable `.rejected.json` records when `--rejected-dir` is provided, and `improvement-candidates --rejected-history` marks repeated candidates with prior rejection reasons so they are not retried without new evidence.

## Interop Standardization

Agenteer now has one internal shape for task, capability, artifact, status, permission, cost, and evidence records. This is MCP/A2A-shaped without pretending to be a complete external protocol implementation. The goal is a stable internal standard that future MCP tools, A2A task routers, research packets, MedBrevia comparison artifacts, and node contracts can map onto.

```bash
agenteer agent capability-from-contract --contract ./nodes/cohort-scout/node-contract.json --out ./capability.json --json
agenteer agent capability-validate --capability ./capability.json --json
agenteer agent evidence-receipt --artifact ./packet/report.md --produced-by cohort-scout --validator claim-guard --status pass --out ./receipt.json --json
agenteer agent task-create --goal "Run cohort scout" --requester researcher --capability cohort-scout --allow-action fs.write --write-root ./packet --max-usd 0 --out ./task.json --json
agenteer agent task-validate --task ./task.json --capability ./capability.json --json
agenteer agent task-transition --task ./task.json --status queued --out ./task.queued.json --json
agenteer agent task-transition --task ./task.queued.json --status running --out ./task.running.json --json
agenteer agent task-transition --task ./task.running.json --status succeeded --evidence ./receipt.json --out ./task.done.json --json
agenteer agent task-export --task ./task.done.json --shape mcp --json
agenteer agent task-export --task ./task.done.json --shape a2a --json
```

Core contracts:

- `CapabilityDeclaration`: capability id, description, input/output schemas, required permissions, typed failures, cost profile, source, and interop shape.
- `TaskEnvelope`: task id, goal, requester, required capabilities, inputs, artifact refs, permission envelope, cost boundary, status, evidence receipts, failure records, and next action.
- `EvidenceReceipt`: artifact ref, hash, producer, timestamp, validator, status, and evidence refs.

The lifecycle is deliberately narrow: `created`, `queued`, `running`, `blocked`, `needs_human_review`, `succeeded`, `failed`, `canceled`, and `superseded`. Invalid transitions are blocked. A task cannot move directly from `created` to `running`, and it cannot be marked `succeeded` without at least one passing evidence receipt.

Validation checks:

- Required fields are present.
- Capability declarations include JSON-schema-like input/output schemas.
- Task capabilities have matching declarations.
- Capability permissions fit the task permission envelope.
- Denied actions override allowed actions.
- Network/cloud actions require explicit task allowance.
- File-write capabilities require bounded filesystem write roots.
- Capability cost/runtime profiles cannot exceed task boundaries.
- Evidence receipts rehash local artifacts and block hash mismatches or missing files.

Export shapes are intentionally conservative. `--shape mcp` emits a tool-like payload with input schema, capability annotations, permissions, artifacts, and status. `--shape a2a` emits a task-like payload with id, goal, requester, status, capabilities, artifacts, permissions, cost boundary, and receipts. In both exports, Agenteer keeps the original evidence receipts intact.

## Tail-End Systems

These commands support more speculative self-improvement loops while staying deterministic and inspectable.

```bash
agenteer agent context-immune-check --context ./.autocontext/memory --json
agenteer agent dream --history ./.agenteer/research-loop --json
agenteer agent research-market --candidates ./ideas.json --budget-usd 0 --json
```

The intended dogfood flow is:

```text
context-preflight -> plan-v2 -> plan-critic -> repair-run -> critic/cognitive-pool -> improvement-candidates -> improvement-run
```

For the research pipeline, run this before protocol generation, AnalysisSpec promotion, execution, and report export.
