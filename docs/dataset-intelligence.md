# Dataset Intelligence

Dataset intelligence is the reusable contract between raw data and the research pipeline. It gives agents a fixed place to look for source facts, variable meanings, table relationships, data-quality watchouts, and exploratory question seeds before any protocol or model is designed.

## Canonical Layout

`agenteer research dataset-register` creates one directory per dataset:

```text
<out-dir>/<dataset-id>/
  dataset-manifest.json
  variable-registry.json
  relationship-graph.json
  data-profile.json
  watchouts.json
  question-seeds.json
  dataset-summary.md
  DATASET_CONTEXT.md
  README.md
```

Agents should read `DATASET_CONTEXT.md` first on every planning round. The JSON files are the durable machine-readable source of truth.

## Commands

Register and profile a local dataset:

```bash
agenteer research dataset-register \
  --id local-icu \
  --source /path/to/parquet-or-csv-directory \
  --out-dir .loop-memory/datasets \
  --domain ehr \
  --json
```

Register a cloud/export-manifest dataset without downloading all rows:

```bash
agenteer research dataset-register \
  --id mimiciv-3-1 \
  --from-manifest .loop-memory/cloud/mimiciv-v31-full-export-20260506.json \
  --out-dir .loop-memory/datasets \
  --domain ehr \
  --json
```

Inspect persisted artifacts:

```bash
agenteer research dataset-inspect --dataset-dir .loop-memory/datasets/mimiciv-3-1
agenteer research dataset-profile --dataset-dir .loop-memory/datasets/mimiciv-3-1
agenteer research dataset-relationships --dataset-dir .loop-memory/datasets/mimiciv-3-1
agenteer research dataset-questions --dataset-dir .loop-memory/datasets/mimiciv-3-1
agenteer research dataset-describe --dataset-dir .loop-memory/datasets/mimiciv-3-1
```

Create and execute a manifest-backed study packet:

```bash
agenteer research dataset-spec \
  --study ./studies/hip-fracture-icu-outcomes.json \
  --dataset-dir .loop-memory/datasets/mimiciv-3-1 \
  --out ./runs/hip-fracture/analysis-spec-v2.json \
  --json

agenteer research dataset-run \
  --analysis-spec ./runs/hip-fracture/analysis-spec-v2.json \
  --dataset-dir .loop-memory/datasets/mimiciv-3-1 \
  --out-dir ./runs/hip-fracture \
  --max-usd 1 \
  --json

agenteer research dataset-run-index \
  --run-root ./runs \
  --out ./runs/dataset-run-index.json \
  --report ./runs/dataset-run-index.md
```

## Artifact Semantics

`dataset-manifest.json` records the dataset id, source URI, access risks, storage size, table inventory, and all canonical file paths.

`variable-registry.json` records each profiled variable with role, inferred type, semantic tags, missingness, sample values, and variable-level watchouts.

`relationship-graph.json` infers likely joins from shared identifier keys such as `subject_id`, `hadm_id`, `stay_id`, `SEQN`, and patient-style ids. Inferred joins are evidence, not approval; serious multi-table work still needs codebook/domain review.

`data-profile.json` stores table and column summaries. Local CSV/JSON files are profiled directly. Parquet files are profiled through pandas/pyarrow when available. Export manifests are registered as metadata-only until local files or samples are available.

`watchouts.json` consolidates blockers, warnings, and notes. Examples include high missingness, empty variables, high-cardinality strings, likely identifiers, negative weights, and broad semantic range issues such as impossible age or BMI values.

`question-seeds.json` proposes exploratory research questions from variable roles and relationships. These are not approved protocols. They exist to speed ideation and must pass method selection, protocol design, QA, and human review before confirmatory analysis.

`dataset-summary.md` is the reader-facing overview. `DATASET_CONTEXT.md` is the compact agent-facing context file.

`dataset-run.json` is the execution record for a manifest-backed study. It records the AnalysisSpec hash, selected tables, phenotype matching evidence, cohort counts, model summaries, typed method issues, artifact hashes, lifecycle state, and cost receipt. It is aggregate-only by default; row-level caches are blocked unless a future policy explicitly allows them.

`matched-icd-codes.csv` records the diagnosis dictionary terms that defined the executed cohort. For medical coding studies, this file is review evidence rather than a final coding authority. The study artifact should record external verification references for ICD families before execution is treated as review-ready.

## Pipeline Use

The standard path for a new dataset is:

```text
dataset-register
→ dataset-inspect/profile/relationships/questions
→ research explore when a concrete local analysis table exists
→ method-select/modeling-plan for a selected question
→ AnalysisSpec
→ execution-contract or dataset-run for manifest-backed multi-table studies
→ stats/ML/paper/dataset run
→ QA/benchmark/export
```

Dataset intelligence should happen before `research explore`. Exploration looks for associations in a table; dataset intelligence maps the dataset itself.

For EHR or claims-style datasets, prefer `dataset-spec` before execution. It turns the selected study into a strict AnalysisSpec v2 with declared phenotype tables, join keys, coding review status, required artifacts, sensitivity analyses, cost limits, and claim boundaries. `dataset-run` then performs bounded cohort construction and analysis from that contract instead of ad hoc Python scripts.

## Safety Rules

- Do not treat metadata-only registrations as fully profiled datasets.
- Do not join tables only because a key name matches; inspect `relationship-graph.json` and confirm with a codebook.
- Do not make population claims from survey data unless weights, strata, PSU, cycle policy, and subsample eligibility are explicit.
- Do not promote question seeds directly into papers. They are hypothesis-generation inputs.
- Treat EHR/claims datasets as high PHI/PII risk even when de-identified unless the dataset license and access policy say otherwise.
- Do not run GCS-backed dataset packets without an explicit cost ceiling and `--allow-gcs`; local/cache-first execution is the default.
- Do not promote diagnosis-code cohorts unless the code family has review evidence and the packet records the exact matched codes used.
