# Research Controller Agent

The research controller is the first persistent runner layer above the research-machine commands. It is designed to do the orchestration work that previously required a human agent in chat: inspect state, choose the next bounded action, run the pipeline stage, record artifacts, honor feasibility gates, route reviewer feedback back into the state machine, and stop when the next move is unsafe or underspecified.

It does not replace deterministic research-machine commands. It coordinates them.

## Commands

```bash
agenteer research controller-init \
  --question "Is exposure associated with outcome?" \
  --out-dir ./controller-run \
  --data ./rows.csv \
  --method linear-regression \
  --outcome outcome \
  --exposure exposure

agenteer research controller-step --state ./controller-run/controller-state.json

agenteer research controller-patch \
  --state ./controller-run/controller-state.json \
  --patch '{"exposure":"age","covariates":["sex"]}' \
  --reason "Manual correction after review"

agenteer research controller-resume \
  --state ./controller-run/controller-state.json

agenteer research controller-tool \
  --state ./controller-run/controller-state.json \
  --tool controller-inspect \
  --reason "Verify controller state integrity"

agenteer research controller-tool \
  --state ./controller-run/controller-state.json \
  --tool controller-read-artifact \
  --arg manuscript \
  --reason "Read the generated manuscript before deciding whether to patch"

agenteer research controller-agenda \
  --state ./controller-run/controller-state.json \
  --reason "Refresh the bounded command queue before autonomous pickup"

agenteer research controller-audit \
  --state ./controller-run/controller-state.json \
  --reason "Prove controller readiness before unattended pickup"

agenteer research controller-capabilities \
  --state ./controller-run/controller-state.json \
  --reason "List controller powers, evidence, tests, and missing coverage"

agenteer research controller-env \
  --state ./controller-run/controller-state.json \
  --reason "Check local runtime before autonomous pickup"

agenteer research controller-goal-audit \
  --state ./controller-run/controller-state.json \
  --objective "Complete Research Controller Agent build"

agenteer research controller-completion-audit \
  --state ./controller-run/controller-state.json \
  --reason "Refuse false completion before promotion"

agenteer research controller-doctor \
  --state ./controller-run/controller-state.json \
  --reason "Show one readiness report before handoff"

agenteer research controller-repair-cycle \
  --state ./controller-run/controller-state.json \
  --max-steps 4 \
  --reason "Apply eligible bounded repair and verify"

agenteer research controller-runner-packet \
  --state ./controller-run/controller-state.json \
  --reason "Prepare a fresh GPT-5.4 runner handoff"

agenteer research controller-self-test \
  --out-dir ./controller-self-test \
  --objective "Verify local controller runner readiness"

agenteer research controller-follow-agenda \
  --state ./controller-run/controller-state.json \
  --max-steps 4 \
  --reason "Execute the next safe agenda item"

agenteer research controller-follow-loop \
  --state ./controller-run/controller-state.json \
  --max-iterations 5 \
  --max-steps-per-run 4 \
  --reason "Keep following safe agenda items until stop criteria"

agenteer research controller-operate \
  --state ./controller-run/controller-state.json \
  --max-cycles 4 \
  --max-rounds 3 \
  --max-iterations-per-round 3 \
  --max-steps-per-run 4 \
  --reason "Let the doctor-driven runner continue safely"

agenteer research controller-supervise \
  --state ./controller-run/controller-state.json \
  --max-rounds 3 \
  --max-iterations-per-round 3 \
  --max-steps-per-run 4 \
  --reason "Refresh packet, follow safe agenda, and audit each round"

agenteer research controller-run \
  --question "Is exposure associated with outcome?" \
  --out-dir ./controller-run \
  --data ./rows.csv \
  --method linear-regression \
  --outcome outcome \
  --exposure exposure \
  --literature \
  --external-review \
  --mock-review

agenteer research controller-inspect --state ./controller-run/controller-state.json
```

`agenteer research run-autonomous` is an alias for `controller-run`.

`controller-inspect` is durable. It writes `controller-internal-inspection.json` and `controller-internal-inspection.md`, records both in `controller-state.json`, and checks state integrity, run directory presence, stage/status consistency, required artifact hashes, feasibility-verdict presence for row-level runs, re-entry plans for stopped runs, and promotion/inspection consistency. Use it as the first command when a new runner picks up an existing controller run.

It also writes `controller-recovery-inspection.json` and `.md`. Recovery inspection compares the saved state against the latest step checkpoint and latest `controller_run_invocation_NNN` ledger. If it sees actions that are not covered by a run invocation, it marks the state as `possible_interruption` and recommends a short bounded `controller-run --state ... --max-steps 4` continuation.

The controller also maintains a durable work-plan trail. `controller_work_plan_NNN.json` and `.md` files record the stage checklist, applicability, status, evidence refs, assumptions, risks, and next action. This gives a model runner the same kind of explicit plan/replan context that a human operator would carry while working through a study.

Alongside the work plan, the controller writes `controller_issue_ledger_NNN.json` and `.md`. The issue ledger is the active triage list: blockers, major issues, minor warnings, source, category, evidence refs, suggested action, and re-entry stage. It is built from gates, feasibility verdicts, action readiness, failed actions, tool failures, rejected patches, missing required artifacts, self-evaluation, and stop reasons.

After each step, the controller writes `controller_stage_review_NNN.json` and `.md`. This is the operator-style critique for the just-finished stage: accepted evidence, blocking findings, warnings, repair actions, re-entry stage, suggested patch, and a recommended command. Stage-review findings feed into the next issue ledger and the next model decision context, so a future model runner sees the same “what just went wrong or what was accepted” handoff that a human operator would keep in working memory.

The controller also writes `controller_execution_agenda_NNN.json` and `.md`. The agenda is the bounded action queue for the next runner. It ranks concrete commands such as `controller-run`, `controller-step`, `controller-patch`, `controller-resume`, and `controller-inspect`, marks each item as executable, blocked, advisory, or complete, records safety status, and links the source issue ledger, stage review, work plan, next-action packet, and re-entry plan. Model-controlled decisions receive this agenda in their context bundle.

Use `controller-agenda` when a separate runner wakes up and needs the current command queue without executing a stage. It refreshes the agenda artifact, updates `controller-state.json`, and prints the primary command plus ranked alternatives.

Use `controller-audit` when a runner needs a single proof artifact before acting. It writes `controller_operator_audit_NNN.json/.md`, checks state integrity, recovery status, agenda readiness, default model configuration, model preflight evidence, feasibility, required artifact hashes, action/tool failures, issue ledger status, stage-review status, capability coverage, and cost boundaries. The audit emits `ready_to_follow`, `ready_for_review`, `blocked`, or `complete`.

Use `controller-capabilities` when a model runner needs a durable map of what the controller can do. It writes `controller_capabilities_NNN.json/.md`, classifies capabilities as `covered`, `available`, `missing`, or `not_applicable`, and links each capability to commands, artifact kinds, evidence refs, tests, and failure modes. This is different from `controller-audit`: the audit answers “is it safe to proceed now?”, while the capability manifest answers “what powers exist, what has been exercised, and what evidence would prove coverage?”

Use `controller-env` before a separate runner relies on local tooling. It writes `controller_environment_NNN.json/.md` and checks repository root, root build/test scripts, Node, npm, CLI dist presence/freshness/executability, git status readability, and controller tool policy. `controller-audit` embeds this environment preflight so readiness decisions can block or degrade when the local runtime is not trustworthy.

Use `controller-goal-audit` before claiming the controller-agent build is complete. It writes `controller_goal_audit_NNN.json/.md`, builds a requirement matrix from the objective, combines operator-audit evidence with the capability manifest, and labels each requirement as `proved`, `partial`, `missing`, or `not_applicable`. This is intentionally stricter than `controller-capabilities`: it asks whether the active goal is actually satisfied, what evidence proves it, what gaps remain, and what command should run next.

Use `controller-completion-audit` before treating a research-controller run as complete or promotion-ready. It reruns the same requirement checks used at promotion time and writes `controller-completion-audit.json/.md`: required stage coverage, gate outcomes, feasibility, method planning, analysis execution, artifact hashes, action contracts, checkpoints, stage reviews, execution agenda, manuscript/inspection evidence, external-review policy, cost boundary, and strict model-runner evidence when required. It exits nonzero when the audit fails, so scripts and future model runners cannot silently treat partial artifacts as complete.

Use `controller-doctor` when a human or fresh model runner needs the single best answer to “can I safely continue this controller run?” It refreshes the operator audit, completion audit, model-runner packet, capability manifest, and re-entry plan, then writes `controller_doctor_NNN.json/.md` with status, blockers, warnings, recommended command, safe-auto-continue flag, supervisor/repair evidence, artifact hash posture, and cost posture. Prefer it before handoff because it avoids forcing a new runner to reconcile scattered artifacts manually.

Use `controller-repair-cycle` when the controller has a repair-stage or auto-repair-eligible re-entry plan and a separate runner needs to close the loop explicitly. It refreshes the re-entry plan, refuses patch-required or non-aggressive repair states, enters the repair stage only when policy allows it, runs the existing bounded deterministic repair plugins through `controller-run`, refreshes the completion audit, and writes `controller_repair_cycle_NNN.json/.md`. This gives model runners a single artifact showing what repair was attempted, whether it was eligible, which invocation verified it, and whether completion evidence remains missing.

Use `controller-runner-packet` when a fresh model instance should take over as the controller. It writes `controller_model_runner_packet_NNN.json/.md` with a complete handoff: system prompt, user prompt, current state path, recommended command, safe-auto-execute flag, operating rules, allowed commands, forbidden actions, evidence refs, agenda summary, audit summary, environment summary, and capability summary. This is the closest artifact to “what I would tell a new GPT-5.4 runner before letting it continue”; it is intentionally explicit so a model can resume without prior chat context and without inventing unsafe commands.

Use `controller-runbook` when the handoff needs to become an actual launch envelope for an external, scheduled, or long-running model runner. It refreshes `controller-doctor`, reads the latest runner packet and environment audit, and writes `controller_runbook_NNN.json/.md` with a readiness command, launch command, inspection command, recovery commands, verification commands, allowed commands, forbidden actions, stop criteria, protected paths, cost budgets, required API-key environment variables, artifact paths to inspect, and a concise handoff prompt. This is stricter than `controller-runner-packet`: the packet tells a fresh model how to think; the runbook tells an operator or scheduler exactly when it is allowed to start, when it must stop, and how to prove it behaved.

Use `controller-self-test` when a separate model runner or scheduled process needs a one-command local proof that the controller substrate works before trusting it. It writes a synthetic dataset, runs a deterministic golden-path study, exercises bounded repo search/file-read/git-diff/read-only Agenteer tools, applies/verifies/rolls back a disposable source patch, runs a bounded supervised-pickup scenario, runs a mock external-review repair loop, runs a strict GPT-5.4-compatible model-controller smoke through a mocked provider transport, verifies infeasible-study rejection before execution, then writes `controller-self-test.json/.md`. The artifact includes an aggregate requirement matrix for persistent autonomous state, bounded supervised pickup, GPT-5.4 strict model control, dataset-grounded research execution, independent review/repair, implementation-change loop, safety/artifact integrity, and documented/tested public surface. A warning means the controller worked but at least one requirement or audit surface still needs review before unattended operation; a failure means do not rely on autonomous pickup.

Use `controller-follow-agenda` when a separate runner should execute exactly one safe agenda item. It refreshes the agenda, refuses blocked or review-required items by default, never auto-applies patches, and records `controller-follow-agenda-NNN.json`. This is the safest unattended pickup command because it is driven by the agenda rather than by a raw “continue” instruction.

Use `controller-follow-loop` for a bounded unattended pickup window. It repeatedly refreshes and follows safe agenda items until the controller reaches a terminal/paused state, a follow item refuses, or `--max-iterations` is reached. Each loop writes `controller_follow_loop_NNN.json/.md` with before/after stage, selected item, refusal status, follow-record paths, and stop reason.

Use `controller-operate` when a scheduled process or model runner should perform a full bounded wake-up instead of one agenda-following pass. Each cycle runs `controller-doctor`; if the doctor says safe-to-auto-continue, it runs `controller-supervise`; if the doctor finds an auto-repair-eligible re-entry plan, it runs `controller-repair-cycle`; otherwise it stops and records why. The command writes `controller_operate_NNN.json/.md` with every doctor report, selected action, after-state, and stop reason. This is the practical “pick up this state and keep moving until unsafe” command.

Use `controller-supervise` when an unattended runner needs a safer outer loop than plain `controller-follow-loop`. Each supervisor round writes or refreshes a model-runner packet, verifies that the packet's primary agenda command is executable and safe unless `--force` is supplied, runs a bounded follow loop, runs a post-round operator audit, and writes `controller_supervisor_NNN.json/.md`. This gives a scheduled or fresh-model runner a durable record of what it was allowed to do, what it actually did, why it stopped, and what evidence it used.

When the controller reaches `complete`, `human_review`, or `blocked`, it writes `controller-next-action.json` and `.md`. This is the pickup packet for a future model runner: recommended command, safe-to-auto-resume flag, re-entry plan summary, active top issues, must-review artifacts, suggested patch, safe patch fields, and the source handoff/re-entry/ledger artifacts used to build the packet.

Terminal controller states also automatically receive a `controller_model_runner_packet_NNN.json/.md` if one is not already present. That packet is the model-facing handoff for a fresh GPT-style runner: it includes the exact prompt envelope, current state path, operating rules, allowed commands, forbidden actions, audit/capability/environment summaries, evidence refs, and the recommended next command. The explicit `controller-runner-packet` command remains available to refresh the packet after repo, environment, or state changes.

Every controller decision also gets a durable context bundle: `controller_decision_context_NNN.json` and `.md`. This is the exact structured situation report supplied to the model runner when model control is enabled: current inputs, policy limits, gate result, deterministic recommendation, latest work plan, feasibility verdict, recent actions, recent tool results, recent artifacts, missing required artifacts, allowed actions, and operating instructions. Treat this as the audit record for what the runner knew before choosing an action.

Before the selected action executes, the controller writes `controller_action_readiness_NNN_<action>.json` and `.md`. Readiness is the pre-action safety check: stage/action compatibility, gate status, policy limits, required prior artifacts, method/data prerequisites, feasibility evidence, and action-specific dependencies. A failed readiness check stops the run for human review before execution mutates downstream artifacts.

## State Machine

The controller persists `controller-state.json` and advances through:

```text
intake
-> context                # optional
-> dataset_feasibility
-> exploration
-> literature            # optional
-> method_selection
-> execution
-> qa
-> manuscript
-> literature_qa         # optional
-> external_review
-> repair
-> inspection
-> promotion_decision
-> complete | human_review | blocked
```

Each step writes:

- an updated controller work plan/checklist
- an updated controller issue ledger
- an operator-style stage review
- a bounded execution agenda
- a gate result
- a decision context bundle
- a controller decision
- a pre-action readiness check
- an executed action record
- a point-in-time controller state snapshot before the transition
- a durable step checkpoint
- an action contract check
- artifact references with hashes when available
- a next recommended action

The controller does not count progress by intent. It records whether the command actually ran and whether required artifacts exist. Before each executable step, it writes `controller_state_snapshot_NNN.json` and `.md`, capturing the current stage, status, counts, state hash, and a point-in-time copy of controller state before any gate/action mutation. Before choosing an action, it writes `controller_decision_context_NNN.json` and `.md` so model and deterministic decisions are tied to the same inspectable context. Before executing the selected action, it writes `controller_action_readiness_NNN_<action>.json` and `.md`; failed readiness blocks execution and routes to human review. After the transition, it writes a new `controller_stage_review_NNN.json` and `.md` to critique the just-completed step, then writes a new `controller_issue_ledger_NNN.json` and `.md` so the next runner has a prioritized active issue list, then writes a new `controller_work_plan_NNN.json` and `.md` so the next runner sees completed, pending, blocked, skipped, and non-applicable stages with evidence refs, then writes a new `controller_execution_agenda_NNN.json` and `.md` so the next runner has a bounded command queue. Each executed step then writes `controller_checkpoint_NNN.json` with before/after stage, status, gate, decision, action/tool pointers, artifact delta, cost delta, stop reason, and next action. After each action, it writes `controller-action-contract-NNN-<action>.json` and `.md`. A successful action cannot advance if the contract says an expected artifact is missing or an artifact required for promotion cannot be hashed.

Each `controller-run` batch also writes `controller_run_invocation_NNN.json` and `.md`. This is the outer run ledger: started/finished time, max steps, executed step count, before/after stage and status, action delta, policy-update delta, artifact delta, cost delta, terminal flag, stop reason, and next recommended action. Use it to audit what an autonomous process actually did during a single wake-up or cron-style run.

When a resumed `controller-run --state ...` applies runtime policy overrides, the controller writes a state snapshot before checking/applying those overrides. This gives an unattended runner a rollback-oriented audit point before changes such as enabling strict model control, changing cost budgets, or enabling external review.

## Input Patches

The controller can safely modify its own study inputs when a model, human, or bounded repair identifies a better specification. Patches are limited to study fields such as outcome, exposure, group, method, covariates, time/event fields, and survey flags. They cannot change data paths, run directories, Python executables, or other environment-sensitive fields.

Every patch writes `patch_NNN.json` with:

- source: model decision, manual correction, or repair plugin
- reason
- changed fields
- validation reasons
- before/after input hashes
- invalidated downstream stages

When a patch changes analytical intent, downstream stages such as method selection, execution, QA, manuscript, review, inspection, and promotion are invalidated and must rerun. This lets the controller behave more like an operator without silently reusing stale artifacts.

## Feasibility Gates

Before execution, the controller summarizes the dataset and blocks studies that do not meet basic data requirements. Current gates include:

- minimum row count
- required variable presence
- required variable missingness ceiling
- empty dataset/column checks
- semantic plausibility warnings for age, BMI, length of stay, and binary-event-like columns
- complete-case scan for CSV/JSON inputs
- outcome/event class-count checks where row-level scanning is available
- method-specific feasibility checks such as numeric continuous outcomes, binary outcome classes, event counts, and rough events-per-variable warnings

This is the first line of defense against generating polished papers from weak or inappropriate data.

The gate writes:

- `table-summary.json`
- `controller-feasibility-verdict.json`
- `controller-feasibility-verdict.md`

The feasibility verdict is the durable authority for whether a study idea can proceed. It records the row/column counts, required-variable checks, semantic issues, complete-case evidence, outcome diagnostics, method-specific checks, blockers, warnings, notes, score, and next action. A blocked verdict stops the controller before analysis execution.

## Context Preflight

When `--context` is enabled, the controller runs Agenteer's autocontext preflight before dataset feasibility or method planning:

```bash
agenteer research controller-run ... \
  --context \
  --context-repo /Users/saleh/TechProjects/agenteer \
  --context-target packages/cli/src/research-machine/controller.ts \
  --context-budget 4000
```

The controller writes:

- `controller-context-preflight.json`
- `controller-context-manifest.json`

The preflight calls the existing `agent context-preflight` adapter, which can use `/Users/saleh/TechProjects/context` or a configured `--context-bin`. It records status, prompt-pack evidence, impact evidence when a target is supplied, memory hits from `.autocontext/memory`, freshness/staleness, source hashes, and a context score.

Use `--require-context` when planning should stop if context is stale, missing, blocked, or too weak. Without `--require-context`, weak context is still recorded as an artifact and can surface in self-evaluation, but the controller may continue under the current policy.

## Literature Intake

When `--literature` is enabled, the controller runs literature intake before method selection and literature QA after manuscript generation:

```bash
agenteer research controller-run ... \
  --literature \
  --literature-base-url http://localhost:3000 \
  --literature-depth standard \
  --literature-top-k 12
```

For deterministic testing or offline runs, pass `--literature-mock-response <json>` with a saved MedBrevia literature-search response.

The controller writes:

- `literature/literature-search.json`
- `literature/literature-search.md`
- `literature/literature-context.json`
- `literature/literature-context.md`
- `analysis-run/literature-qa.json`
- `analysis-run/literature-qa.md`

This lets the runner use current evidence as planning context and then check whether the generated manuscript actually reflects the retrieved evidence and claim boundaries.

## Modeling Plan

The controller writes `controller-modeling-plan.json` during `method_selection`. This is broader than picking a single stats command. It combines:

- the research question
- inferred outcome and design signals
- table-summary evidence when row-level data are available
- literature-context evidence when `--literature` is enabled
- survey/time-to-event flags
- candidate method families, route recommendation, and blockers

The selected executable stats route is then chosen from the modeling plan and method-selection evidence. Promotion self-evaluation requires this artifact so a controller run cannot claim that method choice was made without a durable rationale.

## Controller Model

By default, the controller stores OpenAI `gpt-5.4` as the model configuration but uses deterministic policy unless model decisions are explicitly enabled:

```bash
agenteer research controller-run ... --controller openai:gpt-5.4 --use-model
```

Model decisions are constrained to the allowed action for the current stage plus `stop_for_human` and `block`. Invalid, over-budget, unavailable, or malformed model responses fall back to deterministic policy and are recorded.

Use `--require-controller-model` when the run should only count as model-controlled. This implies model use and refuses deterministic fallback: if the provider is unavailable, the response is malformed, the requested action is not allowed for the current stage, or the controller budget is exceeded, the controller stops for human review instead of quietly continuing deterministically. This is the right mode when you want a fresh model instance to act as the actual runner rather than using deterministic automation with optional model advice.

Runtime policy flags can be applied when continuing an existing state:

```bash
agenteer research controller-run \
  --state ./controller-run/controller-state.json \
  --use-model \
  --require-controller-model \
  --controller openai:gpt-5.4
```

When those flags change saved policy, the controller writes a `controller-policy-update` artifact with changed fields, before/after policy hashes, and any invalidated stages. This prevents a resumed autonomous run from silently using stale configuration.

Before each model-controlled decision, the controller also writes `controller_model_preflight_NNN.json` and `.md`. The preflight records provider, model, required/fallback policy, API-key availability, estimated cost, budget limits, token/input limits, timeout, and pass/fail checks. In `--require-controller-model` mode, failed preflight checks stop the run before any deterministic fallback or model request occurs.

After parsing a model response, the controller writes `controller_decision_quality_NNN.json` and `.md`. This quality gate checks confidence, rationale specificity, high-risk flags, input patch validity, and tool-request validity. Low-confidence or high-risk non-terminal model decisions stop strict model-runner mode before execution; non-strict runs may fall back to deterministic policy with the quality failure recorded.

Model decisions may also include a safe `inputPatch`. The controller validates and records the patch before executing the action. Invalid patches stop for human review rather than being applied.

Model decisions may also request bounded tool actions. These are not arbitrary shell commands. The controller validates each request against policy, records execution metadata, captures stdout/stderr when applicable, and stores every result as an artifact. Current tool IDs are:

- `controller-inspect`: internal state integrity inspection. This does not spawn a subprocess.
- `controller-read-artifact`: reads a bounded preview of one controller-owned artifact by kind, basename, or in-run path. It cannot read outside the controller root or run directory.
- `controller-read-file`: reads a bounded preview of a repository-relative source or documentation file. It blocks absolute paths, parent traversal, generated/cache-heavy directories, binary files, and obvious secret/key files.
- `controller-search-repo`: searches bounded repository text files for a literal query, optionally scoped to a repository-relative directory or file. It skips generated/cache-heavy directories and truncates large result sets.
- `controller-run-agenteer`: runs a small allowlist of read-only Agenteer research introspection commands, such as `research methods-catalog --json`, `research archetypes --json`, `research machine-status --json`, `research phenotype-list --json`, and `research reviewer-providers --json`. It does not allow arbitrary shell commands, paths, output flags, mutation commands, or analysis execution.
- `controller-git-diff`: captures bounded `git status`, `git diff --stat`, and `git diff` previews for the repository, optionally scoped to one in-repo path.
- `controller-propose-patch`: validates and records a non-applying source patch proposal. Proposals must target repository paths, include a rationale, declare risk, and list verification commands.
- `controller-apply-patch`: applies a reviewed full-file patch proposal after repository path checks, before-hash checks, replacement-payload hash checks, and backup creation. Unified-diff-only proposals remain review-only.
- `controller-verify-patch`: runs the bounded verification commands declared by an applied patch proposal, records command output, and captures the resulting source diff.
- `controller-rollback-patch`: restores backups or removes newly created files from an applied patch, then records a post-rollback source diff.
- `npm-build`: runs `npm run build` from the repository root.
- `npm-test`: runs `npm test -- <test-file...>` with sanitized test-file arguments only.

Tool behavior is governed by `allowToolActions`, `allowedToolIds`, `maxToolActions`, and `toolTimeoutMs` in controller policy. CLI runs can disable model/manual tool execution with `--no-tool-actions`, cap it with `--max-tool-actions`, restrict tools with `--allowed-tool <id>`, and set `--tool-timeout-ms <n>`.

Tool results are not dead-end logs. The next model-controller prompt includes a compact `recentToolResults` section with controller inspections, artifact-read previews, repository file previews, repository search matches, read-only Agenteer command output, source-diff previews, patch-proposal summaries, patch-application summaries, patch-verification summaries, and rollback summaries. This lets a model read `stats-qa`, `manuscript`, `run-inspection`, reviewer artifacts, methods catalogs, current source files, or current source changes, then make the next patch/repair/stop/proceed decision from observed content instead of artifact names alone.

When a model requests an evidence-gathering tool such as `controller-inspect`, `controller-read-artifact`, `controller-read-file`, `controller-search-repo`, `controller-run-agenteer`, or `controller-git-diff`, the controller records the tool result and pauses before executing the originally selected stage action. The next `controller-step` re-enters the same stage with `recentToolResults` visible. This avoids executing stale actions that were chosen before the requested evidence was available.

The controller also rejects repeated evidence-tool requests at the same unchanged stage. If `controller-inspect`, `controller-read-artifact`, or `controller-git-diff` already succeeded and no stage action has run since then, the model must use `recentToolResults`, choose the stage action, patch the study inputs, propose a source patch, or stop for review instead of looping on the same read.

`controller-propose-patch` does not apply code. It creates `controller_patch_proposal_NNN.json/.md` plus replacement payload files for full-file changes, so a future runner or human can review the exact intended source changes, path bounds, before/after hashes, diff hash, risk, rationale, and declared tests before any file mutation occurs.

`controller-apply-patch` is deliberately narrower than a coding agent. It only applies valid, low/medium-risk, full-file replacement proposals with matching current `beforeHash` and matching replacement payload `afterHash`. It writes `controller_patch_apply_NNN.json/.md`, backup files under `controller-patch-backups/`, and a post-apply git-diff snapshot.

`controller-verify-patch` closes the loop after application. It reads the applied proposal, runs only sanitized verification commands declared by that proposal (`npm run build`, `npm test`, or focused `npm test -- ...`), stores stdout/stderr/status for each command, and captures a post-verification git diff. If verification fails, the next controller decision can repair, stop, or call rollback with concrete failure evidence.

`controller-rollback-patch` restores the exact backups written by `controller-apply-patch` or removes files that were created by the patch. It records every restored/removed file, validation failures, and a post-rollback git diff. Rollback is still an auditable tool action rather than a silent reset; it does not run broad destructive git commands.

Supported controller providers use the reviewer provider transport:

- `openai:gpt-5.4`
- `anthropic:claude-opus-4-7`
- `google:<model>`
- `deepseek:deepseek-v4-pro`
- `xai:<model>`

Use `--env-file /Users/saleh/env_file` or `AGENTEER_ENV_FILE` when credentials are not in the process environment.

## External Review And Re-Entry

When `--external-review` is enabled, the controller runs `research study-critic` after manuscript generation. It writes:

- `review/review-packet.json`
- `review/review-panel.json`
- `review/review-adjudication.json`
- `review/review-response.json`
- `review/state-reentry.json`
- `review/controller-repair-plan.json`

In aggressive mode, accepted reviewer findings can enter a bounded repair stage before re-entering one earlier deterministic stage. Repairs are plugin-like deterministic actions; they are recorded in `review/controller-repair-execution-NN.json` and linked from controller state.

Current bounded repair plugins:

- `regenerate-manuscript-and-qa`: regenerates `manuscript.md` and `manuscript-qa.json`.
- `refresh-method-qa-and-inspection`: reruns method QA and run inspection.
- `refresh-method-selection`: reruns method selection and updates the selected executable method when safe.
- `rerun-analysis`: reruns the current stats analysis with the existing data, method, and variables.
- `refresh-dataset-feasibility`: recomputes the table summary used for feasibility gates.

Use `--no-auto-repair` to disable this behavior. Use `--max-auto-repairs <n>` to cap repair attempts. If review remains unresolved after the bounded repair ceiling, the controller stops for human review instead of looping indefinitely.

## Promotion Rule

The controller only reaches `complete` when its own gates are satisfied. If method QA, manuscript QA, run inspection, self-evaluation, or external-review artifacts show blockers or unresolved warnings, it stops as `needs_human_review` or `blocked`.

This is intentional: generated does not mean validated.

Before promotion, the controller writes:

- `controller-completion-audit.json`
- `controller-completion-audit.md`
- `controller-self-evaluation.json`
- `controller-self-evaluation.md`

The completion audit is a requirement-by-requirement proof artifact. It checks stage coverage, action outcomes, blocking gates, step checkpoints, stage reviews, execution agenda, study feasibility, method planning, analysis execution, artifact hashes, action contracts, manuscript/inspection artifacts, external-review policy, and model cost boundaries. Promotion cannot pass if the completion audit fails.

The self-evaluation checks required stage coverage, failed actions, action contracts, stage-review coverage, execution-agenda coverage, required artifact hashes, context-preflight artifacts when enabled, feasibility-verdict artifacts for row-level data, modeling-plan evidence, successful analysis execution, method QA, manuscript artifacts, run inspection readiness, literature lifecycle when enabled, external review when required, model-controller usage when enabled, patch governance, and tool governance. It also records capability coverage so a future runner can see which controller powers were actually used versus merely available.

Promotion is blocked when self-evaluation fails. A warning keeps the study in local-review territory and should be resolved before external sharing.

## Terminal Handoff

Whenever the controller reaches `blocked`, `needs_human_review`, or `complete`, it writes:

- `controller-terminal-handoff.json`
- `controller-terminal-handoff.md`
- `controller-next-action.json`
- `controller-next-action.md`
- `controller-reentry-plan.json`
- `controller-reentry-plan.md`
- the latest `controller_stage_review_NNN.json/.md`
- the latest `controller_execution_agenda_NNN.json/.md`

This is the operator-facing packet that replaces a terse stop reason. It contains:

- status, stage, and trigger
- the last gate, decision, action, and tool action
- failure attribution by category: context, data, methods, execution, review, artifact, policy, or unknown
- completed and missing stages
- required artifacts and missing artifact hashes
- suggested commands to inspect, patch, resume, or inspect the run directory
- the safe fields that can be changed with `controller-patch`
- a typed re-entry plan with recommended stage, status, confidence, triggering evidence, safe patch, auto-repair eligibility, repair plugin, and commands

The purpose is to make a stopped autonomous run actionable. A blocked run should tell the next runner or human exactly what failed, what evidence supports that conclusion, and which command is safe to run next.

Use `controller-resume` after a stopped run when the re-entry plan says the next stage can be safely resumed. Patch-required plans intentionally refuse to resume unless `--force` is provided, because the controller should not restart from known-invalid study inputs. The usual sequence is:

```bash
agenteer research controller-inspect --state ./controller-run/controller-state.json
agenteer research controller-patch --state ./controller-run/controller-state.json --patch '{"outcome":"correct_column"}' --reason "Reviewed correction"
agenteer research controller-resume --state ./controller-run/controller-state.json --force
agenteer research controller-run --state ./controller-run/controller-state.json
```

The first command creates a durable `controller-internal-inspection` artifact, so a later model controller or human reviewer can see exactly which state checks passed, warned, or failed.

## Current Scope

The controller is production-wired for local tabular research-machine flows:

- dataset feasibility
- exploration
- method selection
- stats execution
- methods QA
- manuscript generation
- external reviewer panels
- run inspection
- promotion decision

It is not yet a free-form code-writing agent. Repairs are currently constrained to re-entering existing deterministic stages and recording the reviewer-derived repair plan. New tool/node implementation remains a higher-level development workflow.
