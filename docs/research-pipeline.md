# Research Pipeline

The research pipeline is Agenteer's first serious dogfood application: a CLI-first workflow that turns a dataset-backed research question into a reproducible, inspectable research packet.

MedBrevia/NHANES is the first domain substrate. It provides realistic dataset metadata, clinical constraints, existing analytics attempts, and runner contracts. The pipeline itself should stay general enough to support other datasets and domains later.

## Purpose

Agenteer should prove that it can orchestrate long-running, high-friction work where correctness depends on more than a single model answer. A research pipeline stresses the framework in the right ways: human review, deterministic validation, bounded execution, generated code, artifact lineage, session replay, and evidence-backed reporting.

The pipeline's target shape is:

```txt
question
-> clarify
-> retrieve literature/evidence when useful
-> register or load dataset intelligence
-> inspect dataset registry/profile/relationships/watchouts
-> design candidate protocols
-> validate feasibility
-> scout cohort/data quality
-> require human approval
-> generate bounded analysis bundle
-> execute with a safe runner or fixture
-> review artifacts
-> write report
-> validate report against literature
-> critique report
-> export research packet
-> recommend framework/pipeline improvements
```

## Ownership

Agenteer owns the orchestration substrate:

- workflow definitions and node composition
- session state, pause/resume, and replay
- permission boundaries for model, tool, filesystem, and runner access
- deterministic validators before generated code can execute
- evidence records and artifact lineage
- CLI execution and inspection
- improvement recommendations after each run

The research pipeline owns reusable research workflow logic:

- dataset intelligence bundles for new datasets
- literature intake and post-report literature QA
- dataset registry loading
- question decomposition
- protocol design
- clarification planning
- feasibility validation
- cohort scouting interfaces
- statistical method selection
- semantic data quality checks
- analysis bundle generation
- artifact manifests
- report writing and critique

MedBrevia owns product concerns:

- auth and user accounts
- clinical UI and review policy
- Firestore/GCS/Cloud Run integration
- hosted datasets and artifacts
- final user-facing presentation

By default, Agenteer should inspect MedBrevia read-only and emit packets that MedBrevia can consume later.

## CLI Direction

The prototype command is:

```bash
agenteer lab medbrevia-nhanes \
  --repo /path/to/medbrevia_v3 \
  --question "In NHANES adults, is vitamin D deficiency associated with measured hypertension?" \
  --out ./packet
```

The durable command family is intentionally stage-based:

```bash
agenteer research design \
  --project medbrevia-nhanes \
  --repo /path/to/medbrevia_v3 \
  --question "..." \
  --out ./packet

agenteer research critique --packet ./packet
agenteer research scout --packet ./packet [--fixture ./rows.json]
agenteer research approve --packet ./packet --note "review note"
agenteer research approval-verify --packet ./packet --json
agenteer research analyze --packet ./packet --fixture ./rows.json
agenteer research review-report --packet ./packet --json
agenteer research manifest --packet ./packet --json
agenteer research runner-spec --packet ./packet
agenteer research export --packet ./packet --out ./exports/packet
agenteer research packet-summary --packet ./packet --json
agenteer research loop-status --state ./.agenteer/research-loop --json
agenteer research loop-note --state ./.agenteer/research-loop --cycle 6 --summary "..." --next "..."
agenteer research checkpoint --packet ./packet --json
agenteer research next --packet ./packet --trace --exit-zero-on-blocked --json
agenteer research navigation-trace --packet ./packet --json
agenteer research packet-verify --packet ./packet --json
```

The base CLI remains stage-based so each artifact can be inspected. For autonomous operation, use the research controller, which persists state and executes the same stages with feasibility gates, bounded actions, reviewer-driven repair, reviewer re-entry, and explicit stop reasons:

```bash
agenteer research controller-run \
  --question "..." \
  --out-dir ./controller-run \
  --data ./rows.csv \
  --method linear-regression \
  --outcome outcome \
  --exposure exposure \
  --use-model \
  --require-controller-model \
  --external-review
```

The controller is not a hidden success path: it stops as `blocked` or `needs_human_review` when data feasibility, methods QA, manuscript QA, external review, bounded repair, or promotion evidence is insufficient.
Use `--require-controller-model` when the controller must be a real model-driven runner. In that mode unavailable or invalid model responses stop the run instead of falling back to deterministic stage automation.
The same runtime policy flags can be added to `controller-run --state <controller-state.json>`; explicit changes are persisted as `controller-policy-update` artifacts before the run continues.

### Primary Path

Use this path when driving a packet forward:

```bash
agenteer research dataset-register --id my-dataset --source /path/to/data --out-dir ./.loop-memory/datasets
agenteer research dataset-describe --dataset-dir ./.loop-memory/datasets/my-dataset
agenteer research literature-search --question "..." --out ./packet/literature-search.json --report ./packet/literature-search.md
agenteer research design --project medbrevia-nhanes --repo /path/to/medbrevia_v3 --question "..." --out ./packet
agenteer research next --packet ./packet --trace --exit-zero-on-blocked --json
agenteer research validate-methods --packet ./packet --json
agenteer research scout --packet ./packet
agenteer research runner-spec --packet ./packet
agenteer research approve --packet ./packet --note "review note"
agenteer research analyze --packet ./packet --fixture ./rows.json
agenteer research review-report --packet ./packet --json
agenteer research literature-qa --literature ./packet/literature-search.json --paper ./packet/report.md --out ./packet/literature-qa.json --report ./packet/literature-qa.md
agenteer research manifest --packet ./packet --json
agenteer research packet-readiness --packet ./packet --json
agenteer research export --packet ./packet --out ./exports/packet
```

For non-MedBrevia datasets, start with `dataset-register` and read the generated `DATASET_CONTEXT.md` before method selection or exploration. The dataset intelligence directory is the standard place for source facts, variable roles, inferred relationships, missingness, semantic oddities, access restrictions, and question seeds.

### MedBrevia Literature Search

Agenteer can use the local MedBrevia search API as a literature-intake and literature-QA stage without writing to the MedBrevia repository:

```bash
agenteer research literature-search \
  --question "Among ICU patients with hip fracture, what predicts mortality?" \
  --base-url http://localhost:3000 \
  --depth standard \
  --date-range 5y \
  --out ./packet/literature-search.json \
  --report ./packet/literature-search.md

agenteer research literature-qa \
  --literature ./packet/literature-search.json \
  --paper ./packet/paper.md \
  --out ./packet/literature-qa.json \
  --report ./packet/literature-qa.md
```

`literature-search` posts to MedBrevia's `/api/search` SSE endpoint, normalizes PubMed articles, trials, guidelines, DailyMed, and ChEMBL lanes into one evidence packet, ranks source quality conservatively, stores the briefing text, and preserves raw events for audit. The command is designed for local development against `localhost:3000`.

Convert the search packet into planning evidence before route selection:

```bash
agenteer research literature-context \
  --literature ./packet/literature-search.json \
  --out ./packet/literature-context.json \
  --report ./packet/literature-context.md

agenteer research modeling-plan \
  --question "Among ICU patients with hip fracture, what predicts mortality?" \
  --literature ./packet/literature-context.json \
  --table ./rows.csv \
  --target mortality \
  --json
```

`literature-context` does not replace dataset evidence or AnalysisSpec validation. It turns retrieved sources into auditable planning signals: evidence strength, source sufficiency, design signals such as diagnostic accuracy or prediction validation, method signals such as propensity, survival, survey design, missing data, calibration, and follow-up searches. `modeling-plan --literature` consumes either a raw search packet or a context packet and carries literature warnings into route selection. `analysis-run --literature` persists the search, context, and post-report literature QA into the packet so later inspection can see whether the paper actually used the evidence. Every `analysis-run` also writes `feasibility-trial.json`, which is the standard artifact for trialing whether a proposed idea is practically analyzable against the supplied data before it becomes a paper or benchmark case.

For reusable pre-analysis triage outside a full controller run, use `feasibility-gate`. It is the stricter study-idea filter: it scores data availability, cohort size, event counts, missingness, phenotype/code confidence, temporal validity, outcome observability, method fit, semantic plausibility, approximate power, reviewer risk, design specificity, artifact readiness, and cost/access. It also emits deterministic internal reviews from data, methods, phenotype/timing, semantic/power, and skeptical-reviewer agents. The output verdict is one of `reject`, `needs_data_profiling`, `needs_phenotype_review`, `exploratory_only`, or `formal_analysis_ready`; downstream planning should not treat exploratory or review-needed verdicts as formal study approval.

Authentication is intentionally explicit. Agenteer supports `--bearer-token`, `--cookie`, or `--auth-secret` for a locally signed mobile JWT. It also sends a local dev API-key header by default (`x-agenteer-api-key`) using `agenteer-local-literature-dev-key-2026`. The matching MedBrevia local patch accepts that key only when `NODE_ENV` is not `production` and the request host is `localhost`, `127.0.0.1`, or `[::1]`; set `MEDBREVIA_AGENT_API_KEY` in MedBrevia if you want to override the default local key.

`literature-qa` is the later review gate. It checks that the search succeeded, enough sources were retrieved, high-quality sources exist, the evidence overlaps the question, the paper cites or discusses retrieved PMIDs/guidelines/trials, and the paper keeps causal/clinical claims bounded. A search artifact can also be attached to a standard-table run:

```bash
agenteer research analysis-run \
  --question "How accurately does waist circumference identify elevated HbA1c?" \
  --method diagnostic-accuracy \
  --data rows.csv \
  --outcome hba1c_pct \
  --exposure waist_cm \
  --outcome-threshold 6.5 \
  --exposure-threshold 100 \
  --literature ./packet/literature-search.json \
  --out-dir ./packet/analysis-run
```

That route copies `literature-search.json` into the run directory, writes `literature-qa.json` and `literature-qa.md`, and includes them in the analysis manifest when present.

### AnalysisSpec-To-Paper Path

For actual public-health paper generation, prefer the spec-first golden path:

```bash
agenteer research paper-run \
  --analysis-spec ./analysis-spec.json \
  --data-root /path/to/public-health-data-root \
  --out-dir ./papers/my-paper \
  --backend r-survey \
  --python /path/to/python \
  --rscript /path/to/Rscript \
  --capability-dir ./.loop-memory/capabilities/research-paper-v1 \
  --json
```

`paper-run` is intentionally a composed command rather than a hidden shortcut. It performs the full local review path:

1. reads a pre-run `AnalysisSpec`
2. executes the supported local runner
3. writes `analysis.json`, `paper.md`, and `critique.md`
4. runs `paper-qa`
5. writes hashed runner provenance
6. creates task envelopes and evidence receipts
7. validates task/capability envelopes
8. exports MCP/A2A-shaped task views
9. writes `lifecycle.md` and `lifecycle.json`

`paper.md` is the reader-facing scientific report. It should explain the question, population, variables, methods, results, interpretation, limitations, and reproducibility in ordinary research language. It must not rely on Agenteer-specific terms such as `AnalysisSpec`, result posture, task envelopes, evidence receipts, or runner records. Those details belong in `analysis.json`, runner provenance, lifecycle files, receipts, and QA artifacts.

Current paper QA enforces this boundary. It checks for internal framework language, a plain-language main finding for generated paper packets, excessive raw variable-code exposure, known awkward generator phrases, survey-design disclosure, sample construction, missingness, causal overclaiming, threshold caveats, numeric consistency, and companion evidence readability. `paper-index` also reports a `Reader Language` status so older pre-contract papers are not mistaken for current output quality.

### Trust-Layer Review Path

After any real run, the preferred review path is now:

```bash
agenteer research method-qa \
  --run-dir ./papers/my-paper \
  --out ./papers/my-paper/method-qa.json \
  --report ./papers/my-paper/method-qa.md

agenteer research manuscript \
  --run-dir ./papers/my-paper

agenteer research study-critic \
  --run-dir ./papers/my-paper \
  --stage final \
  --panel default \
  --autonomy aggressive

agenteer research run-inspect \
  --run-dir ./papers/my-paper \
  --out ./papers/my-paper/run-inspection.json \
  --report ./papers/my-paper/run-inspection.md
```

`method-qa` is the methods-aware reviewer. It looks for convergence/separation problems, sparse or overfit models, missingness review gaps, collinearity/influence evidence gaps, p-value/effect-size inconsistencies, claim-method mismatch, dataset-specific semantic plausibility problems, survey-design mismatches, and artifact completeness.

`manuscript` writes a publication-style, reader-facing report with abstract, study design, cohort construction, variables, statistical analysis, results, limitations, interpretation boundaries, and reproducibility. It writes `manuscript-qa.json` and keeps internal framework terms out of reader-facing prose.

`run-inspect` is the one-command status view. It reports readiness, blockers, warnings, cost, data/provenance paths, QA state, literature evidence state, lifecycle state, rerun stability, paper/manuscript paths, artifact hash, and the next recommended action. Literature QA failures block readiness; literature warnings downgrade readiness to methods review. This is the command to run before deciding whether a packet is ready for human scientific review or benchmark promotion.

`study-critic` adds true cold external review. It can call Anthropic, DeepSeek, OpenAI, Gemini, xAI, or a mock reviewer, then writes reviewer panel, adjudication, response, and state-reentry artifacts. Accepted reviewer findings are actionable and explicitly route the run back to protocol, AnalysisSpec, feasibility, method selection, execution, QA, manuscript, literature, human review, or promotion.

Check local analysis runtime readiness before broadening a study:

```bash
agenteer research backend-status \
  --python /path/to/python \
  --rscript /path/to/Rscript \
  --json
```

The supported `paper-run` backends are:

- `r-survey`: the preferred NHANES/public-health survey backend. It uses the Python loader for local Parquet/CSV/JSON preparation, then calls R `survey::svydesign` and `survey::svyglm` for Taylor-linearized survey inference on supported weighted linear and logistic models.
- `python-linearized`: a local Python fallback that supports weighted linear and logistic models with strata/PSU linearized sandwich variance. It is useful for development and smoke tests, but it is not the reference complex-survey implementation.

Both backends require an AnalysisSpec with one exposure, one outcome, declared covariates, population filters, survey weight, strata, PSU, and explicit subsample-weight rationale when a subsample weight such as `WTSAF2YR` is used. The runner now supports binary endpoints and subsample-specific weights when the AnalysisSpec declares the binary threshold, weight rationale, and eligibility note.

The current path still deliberately does not claim automated support for replicate weights, domain/subpopulation variance semantics beyond prefiltered complete-case execution, or multi-cycle weight construction. Those should remain blocked or marked for methods review until the AnalysisSpec and dataset adapter can prove the required design.

### Research Machine Path

The newer research-machine layer wraps the older paper path with stronger typed contracts. Use it when building new studies or promoting packets into repeatable benchmarks:

```bash
agenteer research machine-status \
  --data-root /path/to/public-health-data-root \
  --python /path/to/python \
  --rscript /path/to/Rscript \
  --json

agenteer research spec-v2 \
  --spec ./analysis-spec.json \
  --out ./analysis-spec-v2.json \
  --json

agenteer research method-select \
  --question "In NHANES adults, is BMI associated with fasting glucose?" \
  --dataset nhanes \
  --outcome continuous \
  --survey \
  --out ./method-selection.json \
  --json

agenteer research method-apply \
  --spec ./analysis-spec-v2.json \
  --selection ./method-selection.json \
  --out ./analysis-spec-v2-method.json \
  --json

agenteer research execution-contract \
  --spec ./analysis-spec-v2-method.json \
  --backend r-survey \
  --data-root /path/to/public-health-data-root \
  --out-dir ./papers/my-paper \
  --json

agenteer research machine-benchmark \
  --packet ./papers/my-paper \
  --spec ./analysis-spec-v2.json \
  --out ./papers/my-paper/machine-benchmark.json \
  --json
```

`spec-v2` migrates the current AnalysisSpec shape into a richer `AnalysisSpecV2`: estimand, population, variables, survey design, missingness policy, model family, sensitivity analyses, backend requirements, artifact expectations, claim policy, failure policy, execution bounds, and stable hash. `method-select` chooses from the comprehensive method ontology using the research question, outcome type, study design, data structure, dataset, and method flags. `method-apply` merges the selected method's diagnostics, backend requirements, artifacts, QA gates, and sensitivity requirements into the spec. `execution-contract` then joins that spec to the selected backend, dataset adapter, archetype, runner command, typed outputs, policy envelope, and repeatability requirements. `machine-benchmark` evaluates whether the generated packet has the artifacts and review posture needed for trustworthy local review.

Use `paper-lifecycle` when reviewing existing generated papers:

```bash
agenteer research paper-lifecycle \
  --paper-dir ./papers/my-paper \
  --capability-dir ./.loop-memory/capabilities/research-paper-v1
```

Lifecycle status is stricter than paper QA. A paper can pass QA while still requiring methods review if its AnalysisSpec binding is retrospective, or while still needing task envelopes if provenance has not been integrated.

### Manifest-Backed Dataset Run Path

Use this path when the source data is a registered dataset directory and the study needs cohort construction across multiple tables, such as an EHR diagnosis-code cohort with outcomes and severity covariates. This is the promoted version of the earlier loop-memory study scripts: the run starts from AnalysisSpec v2, reads the dataset manifest, enforces cost and cache policy, executes locally or against explicitly allowed GCS Parquet, and writes a reviewable aggregate-only packet.

```bash
agenteer research dataset-spec \
  --study ./studies/hip-fracture-icu-outcomes.json \
  --dataset-dir ./.loop-memory/datasets/mimiciv-3-1 \
  --out ./runs/hip-fracture/analysis-spec-v2.json \
  --json

agenteer research dataset-run \
  --analysis-spec ./runs/hip-fracture/analysis-spec-v2.json \
  --dataset-dir ./.loop-memory/datasets/mimiciv-3-1 \
  --out-dir ./runs/hip-fracture \
  --max-usd 1 \
  --json

agenteer research dataset-run-index \
  --run-root ./runs \
  --out ./runs/dataset-run-index.json \
  --report ./runs/dataset-run-index.md
```

`dataset-spec` converts a study artifact into a strict `AnalysisSpecV2`. For diagnosis/procedure-code cohorts it records legacy ICD families when present plus versioned phenotype IDs, expected dictionary terms, coding verification references, phenotype tables, join keys, missingness policy, sensitivity analyses, artifact expectations, and conservative claim language. This makes the study contract explicit before any runner code touches the data.

`dataset-run` currently supports the `ehr-diagnosis-cohort-outcome` archetype. It constructs the cohort from diagnosis/procedure event tables and dictionaries, records the exact matched codes, applies exact/prefix/range/regex/ICD-10-PCS-axis matching from the phenotype registry, merges requested outcome/covariate tables through declared keys, fits supported mortality and ICU length-of-stay models when the data are adequate, and downgrades the packet to methods review when sparse events, small cohorts, low events-per-predictor, missing tables, unsafe cache policy, or incomplete coding review make promotion unsafe.

The packet includes:

- `analysis-results.json`: cohort counts, matched code evidence, model summaries, and method issues.
- `paper.md`: reader-facing study report without Agenteer-specific framework language.
- `qa.json`: promotion status, readiness, typed issues, and next action.
- `run-manifest.json`: artifact inventory with hashes.
- `cost-receipt.json`: estimated bytes read and estimated cost.
- `matched-icd-codes.csv`: cohort-code evidence for human coding review.
- `phenotype-coding-review.json`: phenotype IDs, matched-code count, timing warnings, sensitivity definitions, and coding-review status.
- `lifecycle.json`: execution status and remaining review needs.
- `critique.md`: conservative methods critique.

This path is intentionally stricter than a manual notebook. A run can succeed technically while remaining `needs_methods_review`; that is the expected outcome when the data are too sparse, the coding evidence is incomplete, or the fitted model is not stable enough for a research claim.

### Audit And Debug Commands

Use these when inspecting why the primary path is blocked or when validating reproducibility:

```bash
agenteer research checkpoint --packet ./packet --json
agenteer research packet-verify --packet ./packet --json
agenteer research qa-dashboard --packet ./packet --json
agenteer research navigation-trace --packet ./packet --json
agenteer research approval-verify --packet ./packet --json
agenteer research manifest-verify --packet ./packet --json
agenteer research benchmark-register --packet ./.loop-memory/golden/nhanes-insurance-hba1c --out ./.loop-memory/golden/nhanes-insurance-hba1c/golden-benchmark.json --json
agenteer research benchmark-run --benchmark ./.loop-memory/golden/nhanes-insurance-hba1c/golden-benchmark.json --json
agenteer research benchmark-score --run ./.loop-memory/golden/nhanes-insurance-hba1c/benchmark-run.json --json
agenteer research benchmark-suite --dir ./.loop-memory/golden --json
agenteer research stage-artifacts --json
agenteer research ro-crate --packet ./packet --json
agenteer research provenance --packet ./packet --json
```

The primary path should stay short enough to remember. Audit/debug commands can be numerous because they are used when the orchestrating agent is diagnosing a specific failure.

### Golden Benchmarks

Golden packets are executable benchmark cases, not only examples. A benchmark captures expected artifacts, expected failures, method requirements, rerun thresholds, QA rubrics, local/share policy, and score weights. `benchmark-run` composes existing packet validators such as manifest verification, AnalysisSpec policy checks, rerun stability, paper QA, claim guard, repair plan, and local review evidence.

Expected failures can count as passing benchmark pressure when they are intentionally declared. For example, the current NHANES insurance/HbA1c golden packet is valid for local review but intentionally blocked for external sharing until absolute local paths are redacted.

### Packet Readiness JSON Contract

`agenteer research packet-readiness --packet ./packet --json` is the script-facing readiness projection. Consumers should treat these fields as stable within schema version 1:

- `packetReadiness.mode`
- `packetReadiness.readinessProfile.id`
- `packetReadiness.readinessProfile.domain`
- `packetReadiness.readinessProfile.selection`
- `packetReadiness.scope`
- `packetReadiness.status`
- `packetReadiness.decisionPosture`
- `packetReadiness.sharePosture`
- `packetReadiness.stopReasons`
- `packetReadiness.recommendedCommands`
- `packetReadiness.components[].id`
- `packetReadiness.components[].status`
- `packetReadiness.references[].id`
- `packetReadiness.references[].url`

Consumers should treat these fields as human-facing and wording-stable only by convention, not by API contract:

- `packetReadiness.summary`
- `packetReadiness.clinicianSummary`
- `packetReadiness.components[].detail`
- `packetReadiness.components[].nextAction`
- `packetReadiness.limitations`
- `packetReadiness.references[].title`
- `packetReadiness.references[].applicability`

The command may recompute current artifact status when run. Exported packets that need durable audit should preserve `packet-readiness.json` alongside the report, manifest, provenance, and review artifacts.

The current default readiness profile is `observational-survey-v1`. It is intended for observational/survey-style research packets. Future domains should add explicit profiles rather than silently stretching this default profile.

```bash
agenteer research questions --project medbrevia-nhanes --repo /path/to/medbrevia_v3
agenteer research methods-framework --json
agenteer research validate-methods --packet ./packet --json
agenteer research registry-inspect --registry ./registry.json --json
agenteer research registry-search --registry ./registry.json --query "blood pressure" --json
agenteer research decompose-question --question "..." --json
agenteer research clarification-plan --question "..." --json
agenteer research data-quality --fixture ./rows.json --json
agenteer research select-method --question "..." --json
agenteer research estimand-sketch --question "..." --json
agenteer research simulate-study --project medbrevia-nhanes --repo /path/to/medbrevia_v3 --question "..." --out ./packet --json
agenteer research real-study-readiness --packet ./packet --json
agenteer research data-access --packet ./packet --file ./rows.parquet --json
agenteer research real-runner-spec --packet ./packet --json
agenteer research real-study-checklist --packet ./packet --json
agenteer research adapter-gap-report --packet ./packet --json
agenteer research variable-map --packet ./packet --file ./rows.parquet --map BPXSY1:systolic --json
agenteer research suggest-variable-map --packet ./packet --file ./rows.json --json
agenteer research apply-variable-map-suggestions --packet ./packet --file ./rows.json --json
agenteer research workflow-scorecard --packet ./packet --json
agenteer research evidence-gap --packet ./packet --json
agenteer research packet-diff --base ./packet-v1 --compare ./packet-v2 --json
agenteer research node-proposal --id evidence-gap --purpose "..." --evaluator "..." --rollback "..." --json
agenteer research node-registry --dir ./node-proposals --json
agenteer research cost-ledger --packet ./packet --proposal-dir ./node-proposals --json
agenteer research question-bank --domain medical --json
agenteer research question-readiness --question "..." --json
agenteer research protocol-candidates --question "..." --json
agenteer research protocol-steer --portfolio ./protocol-candidates.json --prefer "vitamin d" --avoid "descriptive only" --require-variable LBXVIDMS --json
agenteer research protocol-promote --portfolio ./protocol-candidates.json --json
agenteer research protocol-edit --protocol ./protocol-promotion.json --add-covariate "Smoking status:SMQ020:smoking" --json
agenteer research analysis-spec --packet ./packet --json
agenteer research cohort-scout-file --spec ./analysis-spec.json --file ./rows.csv --json
agenteer research semantic-quality --file ./rows.csv --json
agenteer research analysis-run --question "..." --method linear-regression --data ./rows.csv --outcome y --exposure x --out-dir ./analysis-run
agenteer research progress --phase cohort_scout_complete --next-step "Review scout counts" --json
agenteer research job-lifecycle --job job_123 --status queued --json
agenteer research repair-plan --packet ./packet --json
agenteer research agent-record --cycle 72 --intent "Improve loop memory" --observation "Repeated validation patterns" --inference "Distill reusable routines" --action "Generate workflow memory" --json
agenteer research workflow-memory --source /Users/saleh/Desktop/research/updates-upgrades.md --json
agenteer research uncertainty-budget --spec ./analysis-spec.json --scout ./cohort-scout.json --comparisons 6 --json
agenteer research dataset-candidate --id hf:example/health --modality tabular --row-count 10000 --license cc-by-4.0 --intended-use empirical_analysis --json
agenteer research improvement-agenda --budget-usd 1 --candidate local-repair-loop:0.8:0.8:0:0.2:"Local repair loop" --json
agenteer research claim-guard --report ./report.md --spec ./analysis-spec.json --json
agenteer research infer-schema --file ./rows.json --json
agenteer research ro-crate --packet ./packet --json
agenteer research provenance --packet ./packet --json
agenteer research qa-dashboard --packet ./packet --json
agenteer research suppression-policy --count 12 --json
agenteer research pipeline-stages
agenteer research pipeline-stages --json
agenteer research design --project medbrevia-nhanes --repo /path/to/medbrevia_v3 --question "..." --out ./packet
agenteer research inspect --packet ./packet
agenteer research critique --packet ./packet
agenteer research scout --packet ./packet [--fixture ./rows.json]
agenteer research checkpoint --packet ./packet
agenteer research next --packet ./packet
agenteer research navigation-trace --packet ./packet
agenteer research approval-verify --packet ./packet
agenteer research packet-verify --packet ./packet
agenteer research approve --packet ./packet --note "review note"
agenteer research analyze --packet ./packet --fixture ./rows.json
agenteer research review-report --packet ./packet
agenteer research manifest --packet ./packet
agenteer research runner-spec --packet ./packet
agenteer research export --packet ./packet --out ./exports/packet
agenteer research loop-status --state ./.agenteer/research-loop
agenteer research loop-note --state ./.agenteer/research-loop --cycle 6 --summary "..." --next "..."
```

`checkpoint` exists to preserve stage-by-stage judgment. It is the state projection: current artifact presence, current stage, nominal next command, and stage-gate status.

`next` exists to provide human-facing clearance. It is the action projection: recommended commands, expected artifacts, artifact presence, event identity, and optional navigation tracing. It should remain a projection of checkpoint state, not a second state machine.

`stage-gate` exists for deterministic policy checks. It answers whether a requested target stage is allowed from a supplied list of completed stages.

Ownership rule: when these commands overlap, put durable state inference in `checkpoint`, deterministic policy in `stage-gate`, and human/script ergonomics in `next`.

## Event Records

Research packet artifacts can become event-shaped when they represent a human or agent decision. The current lightweight event pattern is:

- `schemaVersion`: integer schema version for the record shape.
- `eventType`: stable event type such as `research.packet.next` or `research.packet.approval`.
- `generatedAtIso` or domain-specific timestamp such as `approvedAtIso`.
- `decisionId`: short event identity for humans and logs.
- `recordHash`: SHA-256 hash of the event payload before `recordHash` is attached.
- optional `previousRecordHash`: only for append-only JSONL traces that should be locally tamper-evident.

Keep this pattern narrow. Do not introduce a generic event bus until multiple packet stages need shared event reading, validation, or replay.

The first implementation can keep `lab medbrevia-nhanes` as a compatibility alias while `research design` remains the intended interface.

## Research Packet

A packet is the handoff artifact between the pipeline, CLI, and eventual product consumers. The v0 packet should include:

- original question
- source registry path and registry metadata
- registry snapshot hash
- candidate protocol
- validation blockers and warnings
- inferred variables, domains, cycles, and survey design
- derived definitions, stratifiers or effect modifiers, and local fixture analysis shape
- clarification questions when needed
- workflow skeleton or executable spec
- evidence and artifact manifest placeholders
- framework/pipeline improvement notes

Later packets should add:

- cohort scout metrics
- local fixture analysis result
- generated analysis bundle
- runner logs when a runner adapter is deliberately introduced
- tables and plots
- report markdown
- report critique
- reproducibility metadata

## First Domain: NHANES

The first test case is:

```txt
In NHANES adults, is vitamin D deficiency associated with measured hypertension after BMI and smoking adjustment?
```

A valid design packet should infer:

- exposure: `LBXVIDMS`
- endpoint: measured blood pressure readings
- covariates: age, sex, race/ethnicity, BMI, smoking
- cycle: `2017-2018` for vitamin D compatibility
- survey design: MEC weight `WTMEC2YR`, strata `SDMVSTRA`, PSU `SDMVPSU`
- caveat: observational, cross-sectional, non-causal analysis

## Self-Reinforcing Loop

The agent operating this pipeline should continuously enforce:

```txt
research need
-> pipeline run
-> inspect failures and friction
-> classify issue by layer
-> patch Agenteer or the pipeline
-> test
-> rerun
-> increase difficulty
```

Each cycle should improve at least one of:

- research output quality
- pipeline architecture
- Agenteer framework capability
- CLI usability
- validation safety
- artifact traceability
- reproducibility
- methodological rigor

There is no fixed endpoint. The loop continues until explicitly stopped.
