# Research Methods Foundation

This document records the methods standards and workflow principles that should guide the Agenteer research pipeline beyond any single dataset.

## Reporting and Study Design

STROBE is the baseline reporting checklist for observational cohort, case-control, and cross-sectional studies. The pipeline should use it as a structured report QA target for observational medical analyses, especially for population definition, variables, bias, study size, statistical methods, participant flow, descriptive data, outcome data, main results, limitations, and generalizability.

TRIPOD and TRIPOD+AI are relevant when the workflow designs or evaluates diagnostic or prognostic prediction models. The pipeline should distinguish exploratory association questions from prediction-model questions because prediction work needs explicit handling of model development, validation, performance metrics, calibration, and intended clinical use.

Target trial emulation is the right framework when an observational analysis attempts a causal treatment or intervention comparison. The pipeline should require explicit target trial components before causal language is allowed: eligibility, treatment strategies, assignment, follow-up, outcomes, causal contrast, assumptions, and analysis plan.

## Dataset Fitness and Statistical Validity

Medical datasets should be evaluated for fitness for purpose before analysis. For real-world data, this means relevance to the question and reliability of key fields, timing, coding, completeness, and outcome ascertainment.

Complex survey datasets require design-aware methods. For NHANES-like sources, the pipeline must track weights, strata, PSU variables, subsample weights, cycle-pooling rules, subgroup estimation constraints, and whether an analysis is only a local fixture rather than a population estimate.

Missing data should be treated as a design and reporting problem rather than a nuisance. The pipeline should require missingness summaries for population filters, exposures, outcomes, covariates, stratifiers, and weights, plus an explicit plan for complete-case analysis, imputation, inverse probability weighting, or sensitivity analysis.

Small-cell and reliability checks should be first-class. The pipeline should flag sparse strata, unstable proportions, suppressed counts, and privacy/reliability thresholds before report generation.

## Provenance and Reproducibility

FAIR principles push the workflow toward machine-actionable metadata for finding, accessing, interoperating with, and reusing datasets and artifacts.

RO-Crate is a strong fit for reproducible research packet export because it packages data, code, workflow files, outputs, and metadata into a structured research object.

W3C PROV gives Agenteer a general model for entities, activities, and agents. The research packet should evolve toward provenance records that connect prompts, validations, approvals, commands, inputs, generated code, outputs, and human-in-the-loop judgments.

## Agenteer Product Implications

The orchestrating agent should remain part of each stage. Automation should not hide the decision boundaries; it should make them inspectable.

The CLI should expose structured state for every boundary:

- pipeline shape
- packet checkpoint
- loop status
- packet summary
- methodology validation
- data quality profile
- runner contract
- artifact/provenance graph

Each structured output should have a schema version and stable field names so future nodes can compose and mutate the workflow safely.

## Sources

- STROBE Statement: https://www.strobe-statement.org/
- STROBE checklist paper: https://pmc.ncbi.nlm.nih.gov/articles/PMC2636253/
- TRIPOD statement: https://pmc.ncbi.nlm.nih.gov/articles/PMC4297220/
- TRIPOD+AI: https://pubmed.ncbi.nlm.nih.gov/38626948/
- OHDSI: https://www.ohdsi.org/
- FDA Real-World Evidence: https://www.fda.gov/science-research/science-and-research-special-topics/real-world-evidence
- NHANES analytic guidelines: https://wwwn.cdc.gov/nchs/nhanes/AnalyticGuidelines.aspx
- CDC statistical reliability: https://www.cdc.gov/nchs/hus/sources-definitions/statistical-reliability.htm
- Target trial emulation framework: https://jamanetwork.com/journals/jama/fullarticle/2799678
- Missing data in observational studies: https://pmc.ncbi.nlm.nih.gov/articles/PMC8168830/
- FAIR principles: https://www.nature.com/articles/sdata201618
- RO-Crate specification: https://www.researchobject.org/ro-crate/specification/1.2/introduction.html
- Workflow Run RO-Crate: https://pmc.ncbi.nlm.nih.gov/articles/PMC11386446/
- W3C PROV: https://www.w3.org/TR/prov-overview/
