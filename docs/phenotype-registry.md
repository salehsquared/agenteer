# Phenotype Registry

Agenteer has a versioned phenotype layer for diagnosis/procedure-code studies. It is designed for longitudinal EHR and claims work where a study needs reusable definitions for exposures, index procedures, comorbidities, outcomes, and sensitivity analyses.

The initial built-in registry includes:

- `savr`
- `tavr`
- `hemodialysis`
- `peritoneal_dialysis`
- `myocardial_infarction`
- `ischemic_stroke`
- `heart_failure`
- `aortic_valve_reintervention`

Each definition records `phenotypeId`, `version`, `author`, `reviewStatus`, inclusion/exclusion rules, timing semantics, sensitivity definitions, code rules, and evidence sources. Built-ins are intentionally marked `needs_clinical_review` until a project-specific coding review artifact is attached.

## Phenotype QA

Matching a code is not enough. Every serious phenotype review should validate the code against the dataset dictionary and report:

- matched codes and matched row counts
- code systems declared but not observed
- matched labels that miss expected terms
- matched labels that contain forbidden terms
- ambiguous matched labels such as `other`, `unspecified`, `history`, or similarly weak wording
- near-miss codes declared by the phenotype
- unmatched lookalike codes in the dictionary that may need a new rule or an explicit exclusion
- broad/narrow and primary-position sensitivity counts
- a promotion gate with blockers and warnings

Rule-level concept QA supports:

- `includeAll`: terms that must all appear in the dataset title
- `includeAny`: at least one expected concept term
- `exclude`: terms that contradict the rule and block promotion when hit
- `ambiguity`: terms that do not necessarily invalidate the code but require review

This is what prevents a code-pattern match from masquerading as a reviewed phenotype. For example, an ICD-10-PCS code may match the aortic-valve axis pattern, but if the dataset title says `mitral valve`, the phenotype review blocks it.

## Code Matching

Rules support:

- exact codes
- prefixes
- numeric ranges
- regular expressions over code/title
- ICD-10-PCS axis constraints

ICD-10-PCS axis matching is preferred for serious procedure cohorts. For example, TAVR uses aortic valve body part `F`, replacement root operation `R`, and percutaneous/endoscopic approaches `3` or `4`; SAVR uses open approach `0`.

## Source Policy

Use authoritative sources for code-system structure:

- CMS ICD-10-CM/PCS files
- CDC/NCHS ICD-9-CM archives
- CMS HCPCS Level II files
- NLM Clinical Tables as a lookup aid
- Licensed CPT resources or registry/payer specifications for final CPT text review

The registry stores short operational CPT labels only. Publication or claims-grade use still needs licensed CPT review or a study-specific source.

## CLI

List built-ins:

```bash
agenteer research phenotype-list --json
```

Inspect a phenotype definition:

```bash
agenteer research phenotype-inspect --id tavr --json
```

Review a phenotype against a dictionary:

```bash
agenteer research phenotype-review \
  --id tavr \
  --dictionary /path/to/d_icd_procedures.csv \
  --system icd10pcs \
  --web \
  --out-dir /tmp/tavr-review
```

Export matched codes for a named sensitivity:

```bash
agenteer research phenotype-match \
  --id tavr \
  --dictionary /path/to/d_icd_procedures.csv \
  --system icd10pcs \
  --sensitivity narrow-all-positions \
  --out /tmp/tavr-matches.json
```

## Dataset Runs

`research dataset-spec` accepts `study.phenotypes` or top-level `phenotypes` entries:

```json
{
  "study": {
    "id": "tavr-outcomes",
    "title": "TAVR outcomes",
    "question": "How do outcomes differ after TAVR?",
    "phenotypes": [
      { "phenotypeId": "tavr", "role": "index" },
      { "phenotypeId": "hemodialysis", "role": "baseline" }
    ]
  }
}
```

The generated AnalysisSpec records these IDs and the dataset runner writes:

- `matched-icd-codes.csv`
- `phenotype-coding-review.json`
- `run-manifest.json`
- `qa.json`

Serious papers should report which codes actually matched rows and should include broad/narrow sensitivity results when the phenotype offers them.

## Timing Semantics

The phenotype layer distinguishes:

- baseline codes before index
- index procedure codes during the index admission/encounter
- post-index outcome codes after discharge or a declared landmark

The runner records these semantics, but final longitudinal studies still need event-date-aware construction. Do not use post-treatment variables as baseline covariates.
