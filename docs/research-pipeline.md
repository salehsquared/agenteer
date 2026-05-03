# Research Pipeline

The research pipeline is Agenteer's first serious dogfood application: a CLI-first workflow that turns a dataset-backed research question into a reproducible, inspectable research packet.

MedBrevia/NHANES is the first domain substrate. It provides realistic dataset metadata, clinical constraints, existing analytics attempts, and runner contracts. The pipeline itself should stay general enough to support other datasets and domains later.

## Purpose

Agenteer should prove that it can orchestrate long-running, high-friction work where correctness depends on more than a single model answer. A research pipeline stresses the framework in the right ways: human review, deterministic validation, bounded execution, generated code, artifact lineage, session replay, and evidence-backed reporting.

The pipeline's target shape is:

```txt
question
-> clarify
-> retrieve evidence when useful
-> load dataset registry
-> design candidate protocols
-> validate feasibility
-> scout cohort/data quality
-> require human approval
-> generate bounded analysis bundle
-> execute with a safe runner or fixture
-> review artifacts
-> write report
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
agenteer research analyze --packet ./packet --fixture ./rows.json
agenteer research review-report --packet ./packet --json
agenteer research manifest --packet ./packet --json
agenteer research runner-spec --packet ./packet
agenteer research export --packet ./packet --out ./exports/packet
agenteer research packet-summary --packet ./packet --json
agenteer research loop-status --state ./.agenteer/research-loop --json
agenteer research loop-note --state ./.agenteer/research-loop --cycle 6 --summary "..." --next "..."
agenteer research checkpoint --packet ./packet --json
```

The current CLI is intentionally stage-based rather than a single hidden "run everything" command. The orchestrating agent must remain involved between stages as the human-in-the-loop reviewer.

```bash
agenteer research questions --project medbrevia-nhanes --repo /path/to/medbrevia_v3
agenteer research methods-framework --json
agenteer research validate-methods --packet ./packet --json
agenteer research registry-inspect --registry ./registry.json --json
agenteer research decompose-question --question "..." --json
agenteer research clarification-plan --question "..." --json
agenteer research data-quality --fixture ./rows.json --json
agenteer research select-method --question "..." --json
agenteer research ro-crate --packet ./packet --json
agenteer research provenance --packet ./packet --json
agenteer research qa-dashboard --packet ./packet --json
agenteer research stages
agenteer research stages --json
agenteer research design --project medbrevia-nhanes --repo /path/to/medbrevia_v3 --question "..." --out ./packet
agenteer research inspect --packet ./packet
agenteer research critique --packet ./packet
agenteer research scout --packet ./packet [--fixture ./rows.json]
agenteer research checkpoint --packet ./packet
agenteer research approve --packet ./packet --note "review note"
agenteer research analyze --packet ./packet --fixture ./rows.json
agenteer research review-report --packet ./packet
agenteer research manifest --packet ./packet
agenteer research runner-spec --packet ./packet
agenteer research export --packet ./packet --out ./exports/packet
agenteer research loop-status --state ./.agenteer/research-loop
agenteer research loop-note --state ./.agenteer/research-loop --cycle 6 --summary "..." --next "..."
```

`checkpoint` exists to preserve stage-by-stage judgment. It reports the packet's current artifacts and recommends the next command without executing it.

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
