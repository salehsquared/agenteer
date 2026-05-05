# Golden Packet: NHANES Insurance Coverage and HbA1c

Maturity label: reproducibility, truth, methods.

This is the current canonical golden-path packet for the Agenteer research pipeline. It deliberately narrows the corpus to one packet that should become increasingly executable, inspectable, and reproducible.

## Why This Packet

- Uses actual cached NHANES-shaped public-health data from MedBrevia's read-only local cache.
- Exercises a social-determinant exposure (`HIQ011`) rather than only physiologic/lab exposures.
- Uses a continuous outcome (`LBXGH`) plus a threshold sensitivity (`LBXGH >= 6.5%`).
- Has paper QA, critique, runner provenance, input hashes, output hashes, and a corpus index entry.
- Exposes a real maturity gap: the current runner is reproducible and weight-aware, but confidence intervals and p values remain approximate until a complex-survey variance runner is added.

## Source Artifacts

- Paper directory: `/Users/saleh/TechProjects/agenteer/.loop-memory/actual-nhanes/papers/0121-insurance-hba1c`
- Paper: `paper.md`
- Evidence: `analysis.json`
- Critique: `critique.md`
- QA: `qa-negation-cli.json`
- Runner provenance: `runner-record.json`

## Golden Requirements

The packet is local-review ready because all of these are true:

1. A typed `AnalysisSpec` exists and records inference/failure policy.
2. Dataset inputs are represented through local-cache evidence and source validation.
3. Survey design fields, weights, strata, PSU, cycle handling, missingness, and sparse cells are validated before modeling.
4. Typed failures exist for invalid weights, missing variables, report overclaim, missing artifact, hash mismatch, and rerun instability.
5. The runner can rerun from the spec and produce stable artifacts or a typed instability failure.
6. Paper QA passes against the rerun outputs.
7. The packet has an artifact manifest and reproducibility metadata suitable for local rerun.

## Current Status

Current status: `ready_for_local_review_spec_governed_rerun`.

Immediate gap: implement a complex-survey variance runner or continue forcing exploratory/approximate inferential language.

## Source-Backed Methods Boundary

CDC's NHANES analytic guidance page lists sample design, estimation/weighting, and analytic-guideline documents as required analyst resources, including the 2017-March 2020 prepandemic sample design and estimation guidance. The NHANES sample-design tutorial states that NHANES is a complex, multistage probability sample and that analyses should account for weights and sample design variables; it warns that failing to account for sampling parameters can bias estimates and overstate significance. The same tutorial names `SDMVSTRA` and `SDMVPSU` as the public masked variance-unit fields used for variance estimation.

Implication for this golden packet: the current model is reproducible and weight-aware, but its confidence intervals and p values remain approximate until a complex-survey variance runner is added. Therefore the AnalysisSpec policy permits only exploratory association language and the paper QA gate should reject strong statistical-significance wording.

## References

- CDC NHANES analytic guidance: https://wwwn.cdc.gov/nchs/nhanes/AnalyticGuidelines.aspx
- CDC NHANES sample design tutorial: https://wwwn.cdc.gov/nchs/nhanes/tutorials/sampledesign.aspx
- Workflow Run RO-Crate provenance profile: https://www.researchobject.org/workflow-run-crate/
- Workflow Run RO-Crate paper: https://pmc.ncbi.nlm.nih.gov/articles/PMC11386446/
