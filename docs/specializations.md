# Agenteer Specializations

A specialization is a durable, domain-specific factory for improving an agent capability. It is not a single agent run. A specialization records what the domain needs, generates candidate variants, evaluates them against local evidence, critiques failures, repairs or rejects weak variants, promotes strong variants, and leaves an inspectable report.

The first built-in specialization is `research-methods-specialist`, but the framework is generic. It can be used for research workflows, support agents, code-review agents, data-quality agents, or any domain where variants must survive explicit evaluation before they are treated as reusable capability.

## Commands

Create a built-in specialization:

```bash
agenteer specialize init --builtin research-methods-specialist --out .agenteer/specializations/research-methods
```

Create a custom specialization:

```bash
agenteer specialize init \
  --out .agenteer/specializations/support-triage \
  --name "Support Triage Specialist" \
  --domain support \
  --purpose "Generate and evaluate support-ticket triage workflow variants."
```

Plan the specialization:

```bash
agenteer specialize plan --dir .agenteer/specializations/research-methods
```

Run the bounded loop:

```bash
agenteer specialize run-loop --dir .agenteer/specializations/research-methods --count 4
```

Inspect state:

```bash
agenteer specialize inspect --dir .agenteer/specializations/research-methods
```

Each command supports `--json` for automation.

## State Layout

A specialization directory contains:

- `specialization.json`: the manifest.
- `candidates/`: generated, repaired, promoted, and rejected candidate records.
- `artifacts/`: candidate output artifacts.
- `evaluations/`: fixture, schema, artifact, baseline, cost, and reproducibility evaluation records.
- `critiques/`: correctness, safety, evidence, brittleness, overclaiming, and validation critiques.
- `repairs/`: repair records and parent lineage.
- `promotions/`: promotion decisions and copied reusable artifacts.
- `lineage/`: candidate lineage event logs.
- `runs/`: loop run records.
- `reports/`: full loop reports plus `latest.json` and `latest.md`.

## Manifest

`SpecializationManifest` defines:

- identity: `id`, `name`, `version`, `purpose`, `domain`
- permission envelope: allowed capabilities, tools, and actions
- domain contract: required inputs and expected outputs
- workflow templates
- candidate generators
- evaluators
- critics
- repair policies
- baselines
- promotion criteria
- artifact schemas
- fixtures
- rubrics
- safety limits
- persistence paths

The manifest is validated with Zod and is intentionally explicit. Missing fixtures, evaluators, critics, or artifact schemas are surfaced by `specialize plan`.

## Candidate Lifecycle

Candidates cannot skip states:

- `generated`: proposed variant plus artifact references.
- `evaluated`: ran against fixtures and gates.
- `repaired`: child candidate derived from a critique.
- `promoted`: passed evaluation, critique, baseline, safety, artifact, and lineage gates.
- `rejected`: failed a hard gate or critique.

Generated candidates are not promotable. Promotion requires evaluation records, critique records, baseline comparison, valid required artifacts, safety compliance, and lineage.

## Evaluation Types

The current deterministic evaluator covers:

- fixture-based behavior checks
- artifact completeness checks
- artifact schema validation
- baseline comparison
- cost/time budget checks
- reproducibility hashing

The evaluator is local and deterministic by default. Cloud, network, model calls, X, or paid services are not required.

## Critique

Critiques classify issues into:

- correctness
- safety
- evidence/provenance
- brittleness
- overclaiming
- missing validation

The recommendation is one of `promote`, `repair`, or `reject`. Optional LLM critics are allowed in manifests, but if they are unavailable the deterministic critic records a note instead of pretending a model review happened.

## Promotion Criteria

Promotion criteria can require:

- minimum score
- minimum baseline delta
- critique pass
- all fixtures pass
- maximum cost
- maximum risk flags

Promotion also always checks required artifacts, schema validity, evaluation existence, critique existence, baseline comparison, safety limits, and lineage.

## Adding an Evaluator

Add an evaluator entry to the manifest and implement it in the specialization runtime or a future evaluator registry. The evaluator should emit `CandidateEvaluation` records with:

- candidate id
- fixture or task id
- baseline comparison
- metrics
- pass/fail result
- failure modes
- reproducibility metadata
- execution logs and artifact references
- typed issues

Do not mark a candidate promoted just because a generator produced plausible text.

## Adding a Generator

Add a `candidateGenerators` entry with a strategy and description. A generator should produce a `CandidateVariant` with:

- proposed workflow/node/tool/prompt/config changes
- required capabilities
- expected outputs
- risk flags
- cost estimate
- artifact references
- lineage event

If a generator uses an LLM or external tool, its dependency and cost envelope must be represented in the manifest and evaluation artifacts.

## How This Differs From Running An Agent Once

A one-off agent run can produce useful output but often leaves unclear whether the output was tested, compared to a baseline, critiqued, repaired, or safe to reuse. A specialization loop is accounting-heavy on purpose. A run does not count as a completed improvement cycle unless it has:

- selected task or stress case
- executed candidate
- evaluation result
- critique or failure attribution
- repair/mutation or explicit rejection
- rerun or justified stop
- final promotion or rejection decision
- next-step recommendation

That structure is the core product: Agenteer should make it difficult for generated work to masquerade as validated work.
