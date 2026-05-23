# Improvements

## Tick 0389

- Added a challenge note for the expanded statistics implementation. The validation bar now requires representative CLI execution, reader-facing artifacts, figure contracts, explicit backend blockers, and a durable validation index before treating the broad method surface as mature.

## Tick 0390

- Added a framework-minimalist challenge for stats validation and trimmed `MEMORY.md` below 200 lines. The next validation tick must distinguish implemented-and-validated methods from review-limited or backend-blocked routes.

## Tick 0391

- Created `.loop-memory/stats-method-validation-20260509/validation-data.csv` and validated five core inference/association routes through the CLI. The ANOVA route now has manuscript QA and run inspection evidence.

## Tick 0392

- Web-grounded the expanded stats validation against STROBE, ASA p-value guidance, and TRIPOD+AI reporting expectations.
- Validated 12 regression/GLM routes through the CLI, including robust linear, logistic, ordinal, multinomial, count, zero-inflated, Gamma, inverse Gaussian, quantile, and penalized models. Penalized routes correctly emit inference caveats.

## Tick 0393

- Validated survival and longitudinal stats routes. Fixed a runner bug where recurrent-event `--id` and stratified-Cox `--strata` variables could be dropped from the complete-case frame, then added targeted regression coverage.
- Confirmed Fine-Gray, time-varying Cox, and GLMM routes fail as explicit backend blockers rather than partial successes.

## Tick 0394

- Validated 12 causal/quasi-experimental routes. Propensity matching and weighting now have fresh validation packets with reader-facing papers and passing paper QA; target-trial and propensity warnings remain explicit design-review boundaries.

## Tick 0395

- Added a skeptical-statistician challenge requiring the final validation index to distinguish execution-validated routes from assumption-validated or review-limited routes.

## Tick 0396

- Validated 28 additional stats routes covering remaining core inference, missingness, diagnostics, reliability, PCA, clustering, agreement, multiple-comparison, power, and prediction evaluation. All 28 succeeded; MICE preserved its assumption-review issue.

## Tick 0397

- Generated the stats validation index at `.loop-memory/stats-method-validation-20260509/VALIDATION_INDEX.md` / `.json`.
- Added zero-inflated negative binomial validation: one nonconverged stress run and one successful better-shaped fixture run, both preserved in the index.

## Tick 0398

- Ran verification gates for the expanded stats implementation: build passed, targeted stats/ML tests passed (28 tests), full suite passed (58 files / 413 tests), and `git diff --check` passed.

## Ticks 0399-0408

- Added deterministic `research figure-qa` and integrated automatic `figure-qa.json` generation into `stats-run`.
- Figure QA now checks PNG readability, dimensions, file size, nonblank sampled pixels, color detail, title, caption, alt text, axis-label metadata, and source columns.
- Improved generated figures with axis labels, alt text, survival legend titles, heatmap tick labels/colorbar, and ROC no-skill diagonal reference line.
- Generated 10 study papers under `.loop-memory/figure-study-suite-20260509/studies/`, spanning descriptive, Welch t-test, chi-square, Pearson correlation, adjusted linear regression, Kaplan-Meier, Aalen-Johansen CIF, PCA, Bland-Altman, and ROC/prediction evaluation.
- All 10 study-level figure QA runs passed; the suite index is `.loop-memory/figure-study-suite-20260509/STUDY_INDEX.md`.

## Ticks 0409-0428

- Added `deepseek-dual` as a first-class external-review panel: two DeepSeek v4 Pro reviewers with distinct methods and reproducibility/reporting roles.
- Ran 20 generated manuscripts through 40 final DeepSeek reviewer calls; all 40 calls succeeded, with estimated final panel cost `$1.046148`.
- Preserved two earlier audit batches (`papers-initial`, `papers-unbound-fixed-results`) before the final bound batch.
- Bound all final batch stats runs to method-selection artifacts so they are no longer classified as ungoverned exploratory runs.
- Hardened reviewer reliability: parallel execution after budget checks, lower DeepSeek prompt/output settings, raw response preservation, near-valid JSON normalization, and tests for the dual panel/parser.
- Hardened manuscript generation from reviewer feedback: `stats-config.json` discovery, prediction metric extraction, correlation extraction, tiny p-value formatting as `p<0.0001`, stable title/question selection from reviewer context, and removal of self-referential no-paper warnings from generated limitations.
- Recorded the resulting stress-suite index at `.loop-memory/deepseek-reviewed-papers-20260509/DEEPSEEK_REVIEWED_PAPER_INDEX.md` and the post-review repair summary at `.loop-memory/deepseek-reviewed-papers-20260509/POST_REVIEW_REPAIR_SUMMARY.md`.

## Tick 0388

- Committed and pushed prior research-machine progress to `origin/main` as `f37215a8`.
- Added a bounded MIMIC-IV SAVR/TAVR dialysis-status longitudinal runner under `.loop-memory/mimic-savr-tavr-dialysis-20260509/`.
- Generated a local-review packet for 4,255 first observed SAVR/TAVR admissions with outcome tables, model estimates, code-match evidence, literature evidence, QA, cost receipt, source inventory, artifact index, and unified run inspection.
- The run makes the core feasibility boundary explicit: MIMIC supports same-hospital EHR follow-up and ICD-driven SAVR/TAVR cohorts, but not complete national CPT/claims longitudinal capture.

## Ticks 0378-0387

- Built `.loop-memory/mimic-dialysis-cardiac-papers-20260509/run_mimic_paper_series.py`, a bounded MIMIC paper-series runner for dialysis and cardiac-surgery ICU studies.
- Generated 10 real local-review papers under `.loop-memory/mimic-dialysis-cardiac-papers-20260509/papers/`, each with `paper.md`, `analysis-results.json`, `paper-qa.json`, `qa.json`, `table-one.csv`, `model-coefficients.csv`, `missingness.csv`, matched diagnosis/procedure code CSVs, cost receipt, run manifest, artifact index, critique, and run inspection.
- Added propensity matching throughout the series: 10/10 final papers now include `propensity-balance.csv`, `matched-pairs.csv`, and `propensity-scores.csv`.
- Hardened sparse derived-table merges by zero-filling binary exposure flags after left joins and adding exposure-denominator QA.
- Hardened cardiac-surgery models with event-count-aware predictor caps so sparse mortality outcomes do not create low-events-per-predictor blockers.
- Added bounded retry behavior for idempotent GCS table reads after a transient copy failure.
- Final batch status: 10/10 paper QA pass, 10/10 packet QA pass, 10/10 propensity fits, 0 inspection blockers, estimated GCS-read cost `$0.2958` of `$10.00`.

## Ticks 358-377

- Added a MedBrevia literature context layer: search packets now become planning-grade evidence with source strength, design signals, method signals, follow-up searches, and issue records.
- `modeling-plan --literature` now consumes raw literature search packets or derived context packets and can route broad study classes such as diagnostic accuracy from literature signals.
- `analysis-run --literature` now persists literature search, literature context, literature context report, literature QA, and literature QA report into the run packet.
- Analysis manifests now expose literature context artifacts, not only search and QA files.
- `run-inspect` now surfaces literature status, source counts, cited source counts, blocker/warning counts, and literature next action; failed literature blocks readiness and warning-level literature downgrades readiness.
- Added deterministic mock MedBrevia SSE and local mock-packet tests so the connector can be exercised without localhost, cloud, or domain-repo writes.
- Updated research docs and command catalog so future agents use the connector as a cross-cutting evidence layer rather than a standalone search command.

## Tick 178

- Added `agenteer research modeling-plan`, a modeling decision layer that ranks statistical methods, ML adapters, and workflow policies before execution.
- The plan now distinguishes primary, baseline, sensitivity, exploratory, and non-executable candidates.
- Added policy candidates for complex survey design, high missingness, causal stop-for-review, and survival required fields.
- Added targeted tests proving survey prediction recommends both survey policy and ML baselines, and causal/survival questions force design review.

## Tick 181

- Made `research modeling-plan` evidence-aware through `--table`, `--table-summary`, and `--target`.
- The modeling plan now derives row count, feature count, target class count, missingness, small-sample status, and high-dimensional status.
- Split `blockingPolicies` from executable candidates so policies can gate execution without hiding the runnable model path.
- Added adaptive-ranking tests proving small/high-missingness tables downgrade high-capacity ML relative to large clean tables.

## Tick 182

- Web search grounded clinical prediction ML in TRIPOD+AI calibration/discrimination reporting and scikit-learn calibration curves.
- Binary probabilistic ML runs now write `calibration.csv` and report `calibration_bins`.
- Added `calibration` as an ML artifact kind and updated docs/tests accordingly.

## Tick 193

- Made `research paper-lifecycle` consume packet-local `stats-run.json`.
- Lifecycle now reports stats-run status, method, binding, issue codes, and path.
- Failed stats runs now block local-review lifecycle status, reducing the risk that standard-table stats execution becomes a hidden island.

## Tick 194

- Made `research modeling-plan` accept `--backend-status <machine-status.json>`.
- Added backend evidence to modeling plans and downgraded candidates whose backend is missing.
- Complex-survey route selection now falls back to `paper-run --backend python-linearized` when R survey is unavailable but the local linearized runner is available.

## Tick 196

- Web search:
  - Query: `statistical analysis reproducible research report artifacts estimates diagnostics machine readable 2024`
    - Source: https://www.amstat.org/asa/files/pdfs/P-ValueStatement.pdf
    - Finding: p-values need full reporting/context and are not measures of effect size or practical importance.
    - Applicability: `stats-report.md` now includes p-value/effect-size cautions and requires estimates/uncertainty context in QA.
  - Query: `ASA statement p-values statistical significance reporting cautions official`
    - Source: https://hdsr.mitpress.mit.edu/pub/50vl2b07/release/2
    - Finding: replicability concerns include inadequate model-choice/procedure descriptions and selective reporting.
    - Applicability: stats reports now include method, variables, complete-case N, diagnostics, issues, and warnings.
  - Query: `TRIPOD AI calibration reporting prediction model checklist 2024`
    - Source: https://www.tripod-statement.org/wp-content/uploads/2024/04/TRIPODAI-Supplement.pdf
    - Finding: model reports should include performance/uncertainty, calibration for prediction, implementation details, limitations, and avoid overinterpretation.
    - Applicability: kept calibration work in ML path and mirrored the same limitation/overinterpretation posture in stats report safety headers.
- `research stats-run` now writes `stats-report.md` and `stats-qa.json` with artifact hashes.
- `modeling-plan` expected stats artifacts now include `stats-report.md` and `stats-qa.json`.

## Tick 216

- Created a bound standard-table stats golden route at `.loop-memory/golden/0216-bound-stats-route`.
- Proved `analysis-run --require-bound` can produce `bound_standard_table` and `local_review_ready` from method-selection evidence.
- Ran `analysis-benchmark --require-ready` across the bound stats route and golden ML comparison route; strict benchmark passed 2/2.

## Tick 217

- Added route coverage to `research analysis-benchmark`: counts by `stats`, `ml`, and `ml-comparison`, plus ready counts and coverage posture.
- Added benchmark checks for artifact completeness, readiness gate, route coverage, and interpretation boundaries.
- Added `--out` and `--report` support so benchmark evidence can be saved as JSON and Markdown.
- Updated `docs/research-ml.md` and targeted tests.
- Live golden benchmark report: `.loop-memory/golden/0216-bound-stats-route/two-route-analysis-benchmark.md`.

Web grounding:

- Agentic Benchmark Checklist paper: benchmark gates should define tasks/rewards and failure accounting explicitly.
- PROV-AGENT paper: agentic workflows need provenance that links decisions, artifacts, and workflow outcomes.
- STROBE/TRIPOD+AI: research reports should preserve design, methods, limitations, intended use, and validation boundaries.

## Tick 243

- Added `agenteer research explore`, a dataset exploration mode for hypothesis generation rather than confirmatory analysis.
- The command summarizes a CSV/JSON/Parquet table, maps variable roles, ranks unadjusted numeric/categorical associations, proposes candidate research questions, emits QA checks, and writes `exploration.json`, `exploration-report.md`, and `candidate-questions.json`.
- Added docs, CLI help, exports, a targeted unit test, and a golden smoke run at `.loop-memory/golden/0243-exploration-mode`.
- The mode deliberately labels output as `exploratory_hypothesis_generation`; associations are not adjusted, causal, survey-aware, or publication-ready.

## Tick 244

- Made `research explore --target` target-centered instead of only globally ranking pairwise associations.
- Added `targetAssociations` and `backgroundAssociations` to the exploration JSON contract.
- The Markdown report now separates target-centered associations from the background correlation map.
- Candidate questions now begin with target-focused questions when a target is supplied, and QA includes `target-association-scan`.
- Regenerated `.loop-memory/golden/0243-exploration-mode` to prove the `hba1c` target is foregrounded.

## Tick 246

- Added `explorationBurden` to `research explore`, including eligible/tested pair counts, target-pair count, multiplicity risk, high-missingness variables, sparse categorical variables, survey/design candidate variables, possible leakage/proxy pairs, and promotion summary.
- Added `promotionStatus` and `promotionBlockers` to each candidate question.
- Added QA checks for promotion gate, multiplicity review, and survey-design review.
- Updated docs/tests and regenerated the golden exploration packet; the tiny fixture now correctly marks all questions `needs_methods_review` rather than directly promotable.

## Tick 247

- Cross-domain search:
  - Query: `astronomy blind source catalog cross matching false discovery rate threshold candidate vetting`
    - Finding: source catalogs and candidate vetting separate detection from confirmation; applied as a keep-exploration-separate principle.
  - Query: `cryptography certificate transparency gossip protocol evidence receipts audit logs`
    - Source: https://developer.mozilla.org/en-US/docs/Web/Security/Defenses/Certificate_Transparency
    - Finding: certificate transparency uses logged evidence plus efficient inclusion/audit proof rather than trust in issuer assertion.
    - Applicability: future exploration handoff should carry evidence receipts rather than only copied question text.
  - Query: `air traffic control conflict alert runway incursion safety net levels false alarms`
    - Source: https://skybrary.aero/articles/autonomous-runway-incursion-warning-system-ariws
    - Finding: runway warning systems act as independent safety nets and red-light warnings indicate unsafe entry/crossing until cleared.
    - Applicability: added `promotionClearance` with `clear_for_handoff`, `hold_for_methods_review`, and `stop`.
- Exploration burden now includes promotion clearance, and QA/report output surfaces it directly.

## Tick 248

- Added `research explore-promote` to convert one exploration candidate question into a modeling-plan handoff artifact.
- The command refuses blocked questions and refuses held questions unless `--methods-review-note` is supplied.
- The handoff records source exploration hash, selected question, clearance level, blockers, modeling-plan seed, recommended command, and artifact hash.
- Added docs, CLI help, exports, test coverage, and golden handoff smoke artifacts.

## Tick 252

- Built `.loop-memory/golden/0252-actual-nhanes-exploration/nhanes-adult-exploration.csv` from cached read-only NHANES Parquet inputs, with `extract-manifest.json` recording source hashes and derived variables.
- Ran `research explore --target LBXGH` on 31,849 adult rows and 22 columns.
- Actual-data pressure exposed a design-variable bug; fixed detection/exclusion for NHANES-style `WT*`, `SDMVPSU`, and `SDMVSTRA` columns.
- The resulting exploration packet detects 6 survey/design candidates, 4 high-missingness variables, 105 tested pairs, 14 target-centered pairs, medium multiplicity risk, and `promotionClearance=hold_for_methods_review`.
- Proved `explore-promote` refusal without a methods-review note and successful held handoff with a note.

## Ticks 293-322

- Corrected the MIMIC loop from design-only ticks into real bounded execution ticks.
- Added a conservative MIMIC execution runner under `.loop-memory/mimic-executed-studies-20260506/run_mimic_study.py`.
- Executed 22 MIMIC study packets across orthopedic, cardiology, pulmonary, renal, endocrine, neurologic, GI/liver, hematologic, cognitive, metabolic, and toxicology domains.
- Added runner QA guards for sparse binary outcomes, low events per predictor, small cohorts, and non-finite LOS percent-change estimates.
- Wrote final executed-study index and audit with cumulative estimated cost `$0.2704` under the `$1.00` ceiling.

## Tick 323

- Hardened the new trust-layer artifact collector to resolve canonical artifacts from nested packet roots, such as `analysis-run/stats-run/stats-run.json` and `analysis-run/paper.md`.
- Added source-path tracking for JSON and text artifacts so `run-inspect` and method QA evidence references point to the actual nested file rather than only the packet root.
- Added regression coverage proving nested analysis-run packet roots expose stats-run kind, paper QA, rerun stability, complete-case N, and missingness evidence.

## Tick 324

- Wrote a capability-rave audit at `.loop-memory/malleability/0324.md`.
- Method QA now treats diagnostic accuracy sensitivity, specificity, PPV, NPV, likelihood ratio, accuracy, and prevalence records as estimate evidence when paired with diagnostic counts or intervals.
- Added targeted regression coverage and manually re-smoked the threshold diagnostic golden route.

## Tick 326

- Added route-specific QA applicability to the trust layer so diagnostic accuracy does not inherit regression-only collinearity and influence warnings.
- Split sparse diagnostic-cell messaging from broad clinical coding / semantic plausibility wording.
- `run-inspect` next actions now prioritize the dominant unresolved issue, such as sparse diagnostic cell stability.

## Tick 327

- Continuous benchmark discovery now collapses nested candidate directories so packet roots are benchmarked instead of both parent packet folders and child runner folders.
- Added regression coverage for `analysis-run/stats-run` collapsing.
- Saved a diagnostic golden benchmark smoke at `.loop-memory/golden/0327-trust-benchmark-smoke/`.

## Tick 328

- Started `.loop-memory/real-study-series-20260506/`, a five-specialty real MIMIC packet validation series.
- Selected cardiology, pulmonary/critical care, nephrology, neurology, and hepatology/gastroenterology packets from the executed MIMIC corpus.
- Wrote a common validation contract and the first cardiology design note without new cloud reads or domain repo edits.

## Tick 329

- Web search:
  - Query: `MIMIC-IV critical care database official documentation diagnosis codes limitations observational ICU study`
    - Source: https://www.nature.com/articles/s41597-022-01899-x
    - Finding: MIMIC-IV is routine-care EHR data with modular hospital/ICU tables; clinical data can be sporadic/noisy and ICD interpretation depends on versioned coding references.
    - Applicability: real MIMIC packets must disclose routine-care data limits, diagnosis-code phenotype boundaries, and local EHR generalizability.
  - Query: `TRIPOD AI reporting clinical prediction model checklist 2024 official PDF calibration discrimination intended use`
    - Source: https://www.tripod-statement.org/wp-content/uploads/2024/04/TRIPODAI-Supplement.pdf
    - Finding: prediction-model reports should state performance measures, prediction calculation, class imbalance handling, model output, thresholds, and development/evaluation differences.
    - Applicability: ICU mortality modeling should carry diagnostics and intended-use limits before being treated as prediction evidence.
  - Query: `STROBE observational studies reporting guideline cohort cross sectional case control official checklist`
    - Source: https://www.strobe-statement.org/
    - Finding: observational reports should make clear what was planned, done, found, and meant; the checklist is reporting guidance, not proof of study quality.
    - Applicability: generated manuscripts should be reader-facing and should not confuse reporting completeness with methodological validity.
- Validated the heart failure MIMIC packet with `method-qa`, `run-inspect`, and `manuscript`.
- Fixed manuscript generation so internal readiness enums are translated into scientific-reader language.
- Manuscripts now prefer run-artifact study titles and avoid arbitrary nested `status` fields such as ICD verification statuses in result bullets.
- Added regression coverage for a `needs_methods_review` manuscript path.

## Tick 331

- Validated the real MIMIC COPD/respiratory-failure packet with `method-qa`, `run-inspect`, and `manuscript`.
- Fixed trust-layer method summaries to prefer model-specific denominators, event counts, and predictor counts over broad nested table counts.
- Missingness QA now downgrades model complete-case denominator shrinkage relative to cohort size and surfaces high-missingness variables.
- Model-family detection now infers logistic routes from odds-ratio/risk-ratio/hazard-ratio estimates.
- Added regression coverage for denominator shrinkage and logistic-family inference.

## Tick 333

- Validated the real MIMIC AKI packet with `method-qa`, `run-inspect`, and `manuscript`.
- Runner `qa.json` string warnings are now collected as method-QA issue records.
- Semantic-plausibility QA now recognizes unprofiled required tables and diagnosis-code timing / phenotype review warnings.
- Added regression coverage proving runner warning strings surface as semantic-plausibility warnings.
- Wrote `.loop-memory/malleability/0333.md` documenting trust-layer malleability found during real-packet validation.

## Tick 336

- Web search:
  - Query: `cirrhosis ICU mortality prediction MELD SOFA observational study methods limitations primary source`
    - Source: https://pubmed.ncbi.nlm.nih.gov/28240612/
    - Finding: ICU cirrhosis prognostic studies commonly compare MELD/MELD-Na and organ-failure scores with development/validation and AUROC-style performance.
    - Applicability: internal cirrhosis model discrimination should not be treated as validated prognosis.
  - Query: `AASLD cirrhosis acute decompensation ICU outcomes prognostic scores MELD official guidance`
    - Source: https://www.aasld.org/practice-guidelines/acute-chronic-liver-failure-and-management
    - Finding: cirrhosis/ACLF critical illness prognosis is organ-failure-context dependent.
    - Applicability: MELD-like and first-day lab findings should be framed as severity/prognostic markers.
  - Query: `transparent reporting prediction model cirrhosis MELD calibration validation study reporting`
    - Source: https://www.tripod-statement.org/wp-content/uploads/2024/04/TRIPODAI-Supplement.pdf
    - Finding: prediction reports should explain performance, model output, validation/evaluation differences, and calibration where applicable.
    - Applicability: cirrhosis mortality packets need validation/calibration evidence before prediction claims.
- Wrote the hepatology/cirrhosis design note for tick 0337 validation.

## Tick 337

- Validated the real MIMIC cirrhosis packet with `method-qa`, `run-inspect`, and `manuscript`.
- Completed `.loop-memory/real-study-series-20260506/SERIES_SUMMARY.md`.
- The five-study series now contains design notes, validation artifacts, and issue ledgers for cardiology, pulmonary, nephrology, neurology, and hepatology packets.
- Cross-study result: original runner QA pass consistently means execution success, while trust-layer readiness correctly stays at `needs_methods_review`.

## Tick 253

- Tail-sample selected derived-variable/proxy detection over the obvious modeling-plan handoff.
- Added target alias groups so `LBXGH` maps to HbA1c/glycohemoglobin terms, and similar aliases exist for common NHANES biomarkers.
- Regenerated the actual NHANES exploration packet; `elevated_hba1c` is now recorded in `possibleLeakagePairs` as a target proxy/derived measure for `LBXGH`.

## Tick 249

- Removed the now-unused `rankExploratoryAssociations` wrapper after `research explore` moved to the richer `scanExploratoryAssociations` result.
- Verified no references remain and reran the exploration handoff smoke.

## Tick 001

- Initialized `.loop-memory/` as the durable operating memory for the dogfood loop.
- Wrote a compact architecture note for the current research pipeline in `.loop-memory/ticks/tick-001-architecture.md`.
- Established the first near-term simplification target: make checkpoint/stage guidance easier to follow before adding more primitives.

## Tick 002

- Added `recommendedCommands` to research checkpoints.
- When a packet is nominally at an executable stage but blocked by stage gates, checkpoint JSON and human output now list the safe missing-gate commands.
- Added focused regression coverage in `packages/cli/tests/research.test.ts`.

## Tick 003

- Reduced visible CLI surface by making `research pipeline-stages` the documented/canonical stage-map command.
- Preserved `research stages` as a compatibility alias.
- Updated `docs/research-pipeline.md` and CLI help.

## Tick 004

- Added `agenteer research next --packet <dir>`.
- The command returns a compact packet navigator with current stage, gate status, target mode, recommended commands, and message.
- It exits nonzero when the gate is blocked, matching the command's actionability.

## Tick 006

- Added expected artifacts to `agenteer research next`.
- Navigation now reports both recommended commands and the packet-local evidence that should prove the next step worked.
- Added focused expectations for the new `expectedArtifacts` JSON and text output.

## Tick 007

- Replaced the expected-artifact switch with a compact `RESEARCH_STAGE_ARTIFACTS` metadata registry.
- Kept behavior stable while making future stage evidence updates easier to review.

## Tick 008

- Added artifact presence checks to `ResearchPacketExpectedArtifact`.
- `research next` now renders expected artifacts as present or missing.

## Tick 009

- Shared stage artifact path metadata between checkpoint detection and `research next`.
- Preserved the distinction between `report.md` as an analysis output and `report-review.json` as a QA output.

## Tick 010

- Added opt-in `agenteer research next --trace`.
- Navigation decisions now have `generatedAtIso`, `decisionId`, and optional `navigation-trace.jsonl` records.

## Tick 012

- Added self-describing `schemaVersion` and `eventType` fields to `ResearchPacketNext`.
- Trace lines are now classifiable without relying on external context.

## Tick 013

- Added `event: research.packet.next v1` to the human `research next` renderer.

## Tick 014

- Added `agenteer research next --exit-zero-on-blocked`.
- Preserved strict nonzero blocked exit by default while supporting audit-only trace workflows.

## Tick 015

- Documented `checkpoint`, `stage-gate`, and `next` ownership boundaries in `docs/research-pipeline.md`.
- Reduced conceptual duplication without removing compatibility.

## Tick 016

- Added `agenteer research navigation-trace --packet <dir> [--json]`.
- The command reads `navigation-trace.jsonl` and reports event count plus the last navigation decision.

## Tick 018

- Added malformed-line and event-type validation to `research navigation-trace`.
- The command now exits nonzero when the trace exists but contains malformed JSONL.

## Tick 019

- Added `status: missing | valid | invalid` to navigation trace summaries.
- Human output now gives a fast trace health signal before detailed counts.

## Tick 020

- Added `previousRecordHash` and `recordHash` to navigation trace events.
- `research navigation-trace` now validates and reports hash-chain status.

## Tick 022

- Added event metadata to `ResearchApprovalRecord`: schema version, event type, decision id, and record hash.
- Approval artifacts now participate in the event-record pattern without adding a separate trace file.

## Tick 024

- Extracted `hashResearchEventRecord(event)`.
- Reused it for approval hashes and navigation trace hash-chain validation.

## Tick 025

- Documented the lightweight event-record pattern in `docs/research-pipeline.md`.
- Clarified that generic event-bus work should wait for more packet stages.

## Tick 026

- Added `agenteer research approval-verify --packet <dir> [--json]`.
- Approval record hashes can now be checked directly.

## Tick 028

- Added `agenteer research packet-verify --packet <dir> [--json]`.
- The command composes approval hash verification and navigation trace validation.

## Tick 030

- Added `mode` and `scope` metadata to `research packet-verify`.
- Human output now makes the verifier's limited integrity scope explicit.

## Tick 031

- Added `next`, `navigation-trace`, `approval-verify`, and `packet-verify` to the research pipeline docs command lists.

## Tick 032

- Verified TypeScript build and top-level CLI help include the new verification commands.

## Tick 034

- Added `agenteer research manifest-verify --packet <dir> [--json]`.
- `packet-verify` now includes `artifact-manifest-hashes` in its available-integrity scope.

## Tick 036

- Added `summary` and `nextAction` to `research packet-verify`.
- The command now states that integrity pass is not scientific validity.

## Tick 037

- Reused `commandForResearchStage` for approval and manifest next actions inside `packet-verify`.

## Tick 038

- Verified `manifest-verify` catches changed artifact byte counts and SHA-256 hashes with clear messages.

## Tick 040

- Added `exportIntegrityReady` to `research packet-verify`.
- Export readiness now reflects manifest hash validity without changing export behavior.

## Tick 042

- Added `exportIntegrityReason` to `research packet-verify`.
- The export integrity boolean now has a human-readable explanation.

## Tick 043

- Compressed human `packet-verify` export integrity readiness and reason into one line.

## Tick 044

- Smoke-tested the current integrity stack end-to-end on a MedBrevia-derived packet.
- Verified `packet-verify` can pass with valid approval, navigation trace, and manifest records.

## Tick 045

- Wrote the 40-tick run summary and identified `research-readiness` as the next layer to build separately from available-integrity verification.

## Tick 048

- Added `agenteer research packet-readiness --packet <dir> [--json]`.
- Kept it separate from `packet-verify` so integrity verification does not imply scientific validity.
- The output now includes scoped component statuses, next actions, and explicit limitations for survey/cross-sectional research review.

## Tick 049

- Added external `references` to `research packet-readiness`.
- Grounded readiness language in STROBE: observational-study reporting guidance helps transparency but is not a quality-certification instrument.

## Tick 094

- Added `research data-access-redact` as a packet-local export/share primitive.
- Redacted data-access evidence preserves source refs, file size, SHA-256, row/column counts, column missingness, adapter kind, runtime version, and package versions while removing absolute data and executable paths.
- Verified the actual NHANES redacted artifact has no `/Users/...` path strings.

## Tick 096

- Added derivation metadata to `data-access-redacted.json`: source manifest ref, source manifest SHA-256, and generation timestamp.
- Verified the actual NHANES redaction artifact carries a source hash and remains free of absolute local paths.

## Tick 097

- Added `redacted-data-access` to packet readiness so the single readiness view reports whether data-access redaction exists and matches the current source manifest hash.
- Verified the actual NHANES packet reports fresh redacted data-access while still warning that raw local-path evidence remains in the local packet.

## Tick 098

- Web search grounded export design in BagIt, LTER/SSECR reproducibility guidance, RO-Crate, and Workflow Run RO-Crate.
- Design direction: shareable exports should have relative-path manifests, checksum validation, derived-redacted data-access evidence, and an explicit local-path scan receipt.
- Tail-end idea: "path escrow" keeps local rerun paths in local-only metadata while the export payload carries only source refs, hashes, and environment/package facts.

## Tick 099

- Capability-rave identified `research export` as malleable from a file-copy command into a policy-mediated archive boundary.
- Proposed artifact classes: `shareable`, `local-only`, and `derived-redacted`.
- Scheduled export receipt/local-path scanning before altering copy/substitution policy.

## Tick 101

- Added an export receipt with copied artifact byte counts, SHA-256 hashes, and local absolute path scan findings.
- Ran it against the actual NHANES packet export; the receipt correctly fails because exported artifacts still contain local paths.
- This creates a measurable export-safety target for subsequent ticks.

## Tick 102

- First-principles pass clarified the target boundary: local packets may contain rerun paths; shareable exports need derived-redacted evidence, relative refs, and receipt scans.
- Selected artifact-class export policy as the next smallest correction before returning to actual-data study breadth.

## Tick 103

- Added first artifact-class export rule: fresh `data-access-redacted.json` replaces local-only `data-access.json` in exports.
- Export now writes an export-local artifact manifest using relative packet ref `"."`.
- Actual NHANES export receipt improved: raw data-access leaks are gone, remaining leaks are visible in design/readiness/runner artifacts.

## Tick 104

- Built a second actual NHANES packet using demographics, vitamin D, and blood pressure Parquet from the local MedBrevia cache.
- Verified all 13 expected variables were observed and the packet is `ready_for_local_real_data`.
- This reduces overfitting risk from the first diabetes/HbA1c packet.

## Tick 105

- Challenge identified a gap between variable/file readiness and analytic feasibility.
- Actual vitamin-D/BP summaries show high missingness in BP measurements and survey weights; next pipeline pressure should estimate merged eligible cohort size and variable usability by role.

## Tick 106

- Added a prototype actual-data cohort-feasibility artifact for the vitamin-D/BP packet.

## Tick 157

- Added `agenteer research paper-runner-record`.
- Runner provenance is now reusable instead of hand-written for each generated NHANES paper.
- The command hashes inputs/outputs and binds to AnalysisSpec hashes when available.
- The merged adult complete-case eligible cohort is 19,770 rows, showing that file-level missingness overstated feasibility concerns after domain overlap/adult eligibility.
- This artifact should become a reusable CLI command or a required pre-analysis evidence artifact.

## Tick 107

- Established a paper QA contract from STROBE, CDC NHANES analytic guidelines, ACC/AHA hypertension threshold guidance, and TARMOS missing-data reporting.
- Paper generation should now require companion evidence and QA artifacts, not standalone prose.

## Tick 108

- Generated first actual NHANES research paper from actual cached Parquet: vitamin D and measured hypertension.
- Saved analysis evidence, paper, QA JSON, and critique under `.loop-memory/actual-nhanes/papers/0108-vitamin-d-bp/`.
- Paper QA passed deterministic checks for sections, survey limitations, sample construction, citations, missingness language, and causal-overclaiming.

## Tick 109

- Added reusable `research paper-qa` CLI command.
- The command checks paper structure, survey design language, sample construction, missingness, citations, observational caveats, causal overclaiming, and evidence JSON.
- Rechecked the first actual NHANES paper through the CLI; 17/17 checks passed.

## Tick 110

- Web-guided second-paper selection: smoking/lipids is preferred because it differs from the vitamin-D/BP paper by domain, exposure construction, and continuous lipid endpoints.
- Memory hygiene confirmed `MEMORY.md` remains under the 200-line target.

## Tick 111

- Generated second actual NHANES paper: smoking history and HDL cholesterol.
- Used actual demographics, smoking, and lipids Parquet with a continuous endpoint and approximate weighted linear regression.
- Recorded a deliberate endpoint rejection: triglycerides were deferred due high missingness and likely fasting/subsample handling needs.

## Tick 112

- Web search selected kidney albuminuria/UACR and blood pressure as a high-value third paper direction.
- This stresses ratio/threshold construction and kidney-specific single-measure limitations, not just another generic association model.

## Tick 113

- Generated third actual NHANES paper: albuminuria/UACR and measured hypertension.
- The paper uses kidney threshold logic and explicitly avoids CKD/persistent albuminuria diagnostic overclaiming from one UACR measure.
- QA passed, but the paper exposed a new QA need: threshold provenance and diagnosis-overclaim checks should be deterministic.
- Future candidate: map report/method review issues to STROBE-style obligations without reducing them to a single score.

## Tick 051

- Added clinician-facing top-level posture to `research packet-readiness`.
- Split internal reading posture from sharing/export posture.
- Preserved detailed component statuses for audit/debugging.

## Tick 052

- Added `agenteer research stage-artifacts [--json]` as a public read-only view of stage artifact contracts.
- Corrected provenance stage metadata to use `provenance.json`, matching the artifact actually written by the provenance command.

## Tick 054

- Added drift coverage to keep provenance naming consistent across stage artifact metadata, QA dashboard checks, and packet readiness components.
- Recorded malleability inventory for future simplification and component-sharing work.

## Tick 056

- Added a primary research workflow path to `docs/research-pipeline.md`.
- Separated audit/debug commands from the normal packet-driving path.
- Grounded the documentation change in current CLI design guidance around discoverability, concise help, and grouping.

## Tick 057

- Added `stopReasons` to `research packet-readiness`.
- Applied Lean Andon/stop-the-line thinking so `decisionPosture: stop` names the blocking reason.

## Tick 058

- Added `recommendedCommands` to `research packet-readiness`.
- Reduced downstream need to scrape prose `nextAction` strings.

## Tick 061

- Documented the packet-readiness JSON contract in `docs/research-pipeline.md`.
- Clarified which readiness fields are stable for scripts and which are human-facing prose.

## Tick 062

- Added `packet-readiness.json` to the exportable research artifact allowlist.
- Updated export coverage to preserve readiness artifacts when present.

## Tick 063

- Recorded a capability-rave inventory for reducing artifact registry drift.
- Scheduled deriving the export allowlist from stage artifact metadata plus explicit extras.

## Tick 064

- Reduced artifact-name drift by deriving export artifact discovery from `RESEARCH_STAGE_ARTIFACTS` plus a small extras list.

## Tick 066

- Hardened `packet-readiness.recommendedCommands` against shell-chain ambiguity.
- Added tail-sample candidates and chose a lower-likelihood safety improvement over docs-only changes.

## Tick 067

- Simplified packet readiness semantics: export is now a share-posture concern, not a blocker for internal scientific review.

## Tick 072

- Added explicit `readinessProfile` metadata to `research packet-readiness`.
- Documented `observational-survey-v1` as the default profile and future extension boundary.

## Tick 073

- Extracted the default readiness profile into a single internal constant.

## Tick 074

- Added test coverage that the human packet-readiness renderer exposes the readiness profile.

## Tick 076

- Added profile caveat text to the human packet-readiness renderer.
- Recorded cartography map-legend transfer as the design rationale.

## Tick 077

- Established the first real-data dogfood artifact from MedBrevia's cached NHANES Parquet release.
- Confirmed actual curated domain sizes and a successful HbA1c cohort scout under zero GCP spend.
- Identified that Agenteer's local scout path still depends on JSON/CSV and should grow a generic Parquet/manifest bridge.

## Tick 078

- Added `research table-summary` for JSON, CSV, and optional Parquet summaries.
- Verified the new command on MedBrevia's actual NHANES `diabetes.parquet`.
- Kept Parquet support explicit through `--python`/`AGENTEER_RESEARCH_PYTHON` instead of adding mandatory data-science dependencies.

## Tick 079

- Reused `research table-summary` inside `suggest-variable-map`.
- Verified direct variable-map suggestions from actual NHANES `diabetes.parquet`.
- Reduced the need for manual Parquet-to-JSON/CSV conversion before mapping variables.

## Tick 081

- Added adapter/runtime provenance to `research table-summary`.
- Added file mtime and SHA-256 to table summaries.
- Verified provenance on actual NHANES `diabetes.parquet`.

## Tick 082

- Added table evidence provenance to variable-map suggestions.
- Bound actual NHANES Parquet variable mappings to file hash, adapter kind, mtime, and row/column counts.

## Tick 084

- Web finding: W3C PROV's entity/activity/agent distinction maps directly to source file, table-summary generation, and runtime/software.
- Web finding: RO-Crate supports file-level research metadata and provenance through JSON-LD; Agenteer can mirror the shape without requiring full JSON-LD in `data-access.json`.
- Web finding: Workflow Run RO-Crate supports bundling inputs, outputs, code, and execution provenance; Agenteer should bind real-data summaries and scouts to their inputs and runtime.

Sources:

- https://www.w3.org/TR/prov-overview/
- https://www.researchobject.org/ro-crate/specification/1.1/introduction.html
- https://arxiv.org/abs/2312.07852

## Tick 086

- Enriched `data-access.json` with table-summary provenance and human decision summary.
- Verified enriched data access on actual NHANES `diabetes.parquet`.
- Reduced need for a separate immediate `real-data-adapter.json` artifact.

## Tick 087

- Merged enriched data-access evidence into `real-study-readiness`.
- Added readiness checks for summarized files and expected-variable observations.
- Verified the actual NHANES scaffold passes data-access evidence checks while still blocked on missing full packet design.

## Tick 088

- Built the first full actual-NHANES design packet with two real Parquet domains.
- Verified all expected design variables are observed across summarized demographics and diabetes files.
- Identified that `fixture-runner-spec` should not block real-data readiness when real-data evidence is otherwise complete.

## Tick 091

- Web finding: RO-Crate training avoids absolute paths for folder-based crates so packages remain movable/archiveable.
- Web finding: DataCite manifests preserve filename, size, and SHA-256 as portable integrity evidence.
- Web finding: reproducibility guidance explicitly calls for converting absolute file paths to relative paths and identifying required packages.

Sources:

- https://training.galaxyproject.org/training-material/topics/fair/tutorials/ro-crate-intro/tutorial.html
- https://support.datacite.org/docs/datacite-monthly-data-file
- https://isps.yale.edu/sites/default/files/files/YSPH-reproducibility_April2018-Peer%281%29.pdf

## Tick 092

- Added blocking/advisory semantics to `real-study-readiness` requirements.
- Made fixture-runner evidence advisory for local real-data readiness.
- Verified the actual two-domain NHANES HbA1c packet is now `ready_for_local_real_data`.

## Tick 093

- Added `share-local-paths` to packet readiness.
- Local absolute paths now affect share posture without blocking internal review readiness.
- Preserved warning-only components as cautions rather than blockers.

## Tick 0114

- Added threshold-aware checks to `research paper-qa`.
- Threshold evidence now requires paper-level threshold provenance and source citations.
- Single UACR/kidney and blood-pressure threshold studies now require caveats against clinical diagnosis overclaims.
- Verified the UACR/hypertension paper passes the stronger 21-check QA gate.

## Tick 0116

- Added model-aware checks to `research paper-qa`.
- Logistic/binomial evidence must be described with odds-ratio/logistic language.
- Linear-regression evidence must be described with mean-difference/coefficient language.
- Approximate weighted models must disclose variance/complex-survey limitations.
- Papers must disclose broad covariate groups present in evidence JSON.

## Tick 0118

- Added numeric consistency checks to `research paper-qa`.
- The QA gate now compares reported effect estimates, CI bounds, and p values against `analysis.json` with rounding tolerance.
- Re-ran the stronger gate against all three generated NHANES papers.

## Tick 0119

- Web/creativity injection selected a fourth paper shape: health-access exposure and glycemic outcome.
- Verified actual cached `insurance_access.parquet` and `diabetes.parquet` contain candidate variables for the design.
- X search was attempted as weak-signal intake but returned no actionable recent signal.

Sources:

- https://diabetes.org/about-diabetes/diagnosis
- https://www.niddk.nih.gov/health-information/professionals/clinical-tools-patient-management/diabetes/diabetes-prediabetes
- https://pubmed.ncbi.nlm.nih.gov/41040761/

## Tick 0121

- Generated Paper 4 from actual NHANES data: insurance coverage and HbA1c in adults.
- Added a social-determinant/access paper shape to the paper corpus.
- Found a QA improvement target: negated causal-language phrases currently trigger the simple causal-overclaim guard.

## Tick 0122

- Made paper QA causal-language detection negation-aware.
- Restored explicit "not evidence that insurance status caused the difference" language in Paper 4 and verified it passes.

## Tick 0123

- Added `/Users/saleh/TechProjects/agenteer/.loop-memory/actual-nhanes/papers/INDEX.md`.
- The generated-paper corpus now has one lookup surface for title, complete-case N, latest QA status, and latest QA file.

## Tick 0124

- Added `agenteer research paper-index`.
- The paper corpus index is now generated by Agenteer rather than by tick-local Python.
- Added targeted test coverage for latest-QA selection and Markdown/JSON rendering.

## Tick 0126

- Added the first paper runner provenance record for Paper 4.
- Web grounding came from Workflow Run RO-Crate, Process Run Crate, and Ten Simple Rules for Reproducible Computational Research.
- Runner provenance records should become a CLI primitive and paper-index field next.

Sources:

- https://pmc.ncbi.nlm.nih.gov/articles/PMC11386446/
- https://www.researchobject.org/workflow-run-crate/profiles/0.3/process_run_crate.html
- https://journals.plos.org/ploscompbiol/article?id=10.1371/journal.pcbi.1003285

## Tick 0127

- Added runner status to `research paper-index`.
- The paper corpus now exposes which QA-passing papers still lack runner provenance.

## Tick 0128

- Backfilled retrospective runner records for Papers 1-3.
- Regenerated the paper index; all four generated NHANES papers now show runner status.
- Recorded a schema looseness finding: `analysis.weights` is not consistently shaped across paper evidence JSON.

## Tick 0129

- Established one canonical golden packet target: `/Users/saleh/TechProjects/agenteer/.loop-memory/golden/nhanes-insurance-hba1c/`.
- Maturity work should now harden this packet instead of spreading effort evenly across all generated papers.

## Tick 0130

- Added a typed `analysis-spec.json` target for the golden packet.
- Recorded a methodology-archivist critique that the spec is still retrospective and must govern a future rerun before it counts as spec-first execution.

## Tick 0131

- Added golden source validation artifact with typed failures for missing variables, survey design, missingness, and sparse cells.
- The current golden packet passes source validation with complete-case N 21,653.

## Tick 0132

- Strengthened `cohort-scout-file` with `NO_POSITIVE_WEIGHT_ROWS`, `SURVEY_WEIGHT_MISSING`, `SURVEY_STRATA_MISSING`, and `SURVEY_PSU_MISSING` typed failures.
- Added targeted invalid-weight test coverage.

## Tick 0133

- Added a spec-governed golden rerun artifact and rerun diff report.
- Golden insurance/HbA1c rerun is stable with zero numeric diffs against the original paper analysis.

## Tick 0134

- Added `golden-manifest.json` for the canonical golden packet.
- The manifest binds source validation, rerun stability, paper QA, runner record presence, and artifact hashes into one readiness artifact.

## Tick 0136

- Extended `research manifest-verify` to independently verify golden manifests.
- Added test coverage for golden manifest hash drift.
- Verified the live golden packet manifest as valid.

## Tick 0137

- Added golden share-safety scan.
- The canonical packet now distinguishes `ready_for_local_review` from `local_only_blocked_for_share`.

## Tick 0138

- Split golden manifest readiness into local review and share/export status.
- Included `share-safety.json` in the verified artifact set.

## Tick 0139

- Manifest verification now checks golden `localReviewStatus`.
- Added test coverage for a not-ready golden manifest failure.

## Tick 0141

- Added miniature golden-packet integration coverage without adding a new CLI command.
- Existing paper QA and manifest verification now compose in tests.

## Tick 0142

- Added typed failure records to `research manifest-verify`.
- Golden packet failures now expose blocker codes for rerun instability, local-review readiness, missing runner records, missing artifacts, byte-count drift, and SHA-256 drift.

## Tick 0143

- Made `research repair-plan` consume typed manifest verification failures.
- Rerun instability now flows into repair planning as `MANIFEST_RERUN_DIFF_UNSTABLE` with explicit stopping-aware repair guidance.

## Tick 0144

- Wrote a capability-rave inventory in `.loop-memory/malleability/0144.md`.
- Corrected the live golden packet status so it reflects current spec-governed rerun evidence instead of stale candidate wording.

## Tick 0146

- Added `inferencePolicy` and `failurePolicy` to `ResearchAnalysisSpecV1`.
- `research paper-qa` now blocks strong statistical-significance language when evidence declares approximate weighted/exploratory inference.
- Updated the canonical golden AnalysisSpec and manifest to include the new policy fields.

## Tick 0147

- Web search finding: CDC's NHANES sample-design tutorial says NHANES uses a complex multistage probability design, recommends sampling weights and design variables for all analyses, and warns that ignoring sampling parameters can bias estimates and overstate significance. Source: https://wwwn.cdc.gov/nchs/nhanes/tutorials/sampledesign.aspx
- Web search finding: CDC's NHANES analytic guidance page lists sample design, estimation/weighting, and analytic-guideline documents as core analyst resources, including recent guidance for 2021-2023 and 2017-March 2020 files. Source: https://wwwn.cdc.gov/nchs/nhanes/AnalyticGuidelines.aspx
- Applicability: golden packet documentation now states that stable reruns are not enough for design-correct inference; current CIs/p values remain approximate until a complex-survey variance runner exists.

## Tick 0148

- Added executable/methodological repair classification and `stoppingReasons` to `research repair-plan`.
- Paper-QA inference-policy failures now stop executable repair and require methods review.

## Tick 0151

- Added a manifest-tracked local review note to the canonical golden packet.
- The note leads with responsible interpretation, exploratory-only inference, not-for-share status, and hard caveats.

## Tick 0152

- Added AnalysisSpec hash binding between runner records and manifest verification.
- `research manifest-verify` now emits `RUNNER_SPEC_HASH_MISMATCH` when a runner receipt is stale relative to `analysis-spec.json`.

## Tick 0153

- Added a live `repair-plan.json` to the canonical golden packet and manifest.
- The golden packet now has an explicit no-repair-needed posture instead of implicit silence.

## Tick 0154

- Added a repeat-verification receipt to the canonical golden packet.
- The packet now records that two consecutive manifest verifications produced stable status and issue-code outputs.

## Tick 0156

- `research manifest-verify` now separates local validity from share/export validity with `validLocal`, `validForShare`, and `shareStatus`.
- Refreshed the golden repeat-verification receipt to include local/share posture.

## Tick 068

- Corrected checkpoint readiness semantics so packets at the export stage can be `review_ready`.
- Added coverage that review readiness can pass before export while share posture remains blocked.

## Tick 0158

- Generated an actual NHANES BMI/HbA1c paper from cached curated Parquet with paper markdown, analysis JSON, critique, paper QA, and CLI-generated runner provenance.
- Rebuilt the actual-paper index and exposed a useful Agenteer integration gap: `paper-index` does not yet unwrap the new `paper-runner-record` JSON envelope.

## Tick 0159

- `research paper-index` now accepts both older raw runner records and the JSON envelope emitted by `research paper-runner-record --json`.
- The actual NHANES paper index now shows all five generated papers with runner provenance and passing latest QA.

## Tick 0161

- Web search finding: Workflow Run RO-Crate distinguishes prospective workflow descriptions from retrospective execution provenance and packages inputs, outputs, code, and execution records for re-execution. Source: https://journals.plos.org/plosone/article?id=10.1371%2Fjournal.pone.0309210
- Web search finding: CDC's NHANES weighting tutorial states weights account for complex design, oversampling, non-response, and post-stratification, and combined-cycle analyses need appropriate combined weights. Source: https://wwwn.cdc.gov/nchs/nhanes/tutorials/weighting.aspx
- Implementation: `research paper-runner-record` now emits `RETROSPECTIVE_ANALYSIS_SPEC_BINDING` warnings, and `research paper-index` displays retrospective records as `retrospective_succeeded`.

## Tick 0162

- Created evidence receipts, task lifecycle artifacts, and MCP/A2A exports for the actual BMI/HbA1c paper.
- The task validation failed usefully because research capabilities were named but not declared; this is a real Agenteer interop gap exposed by dogfooding.

## Tick 0163

- Added capability declarations under `.loop-memory/capabilities/research-paper-v1/` for `research.paper.generate`, `research.paper.qa`, and `research.runner.provenance`.
- All three capability declarations validate with `pass`.
- Revalidated the BMI/HbA1c task against those declarations; task validation now passes with no issues.

## Tick 0164

- Generated a new actual NHANES paper, `0164-pir-hdl`, from a pre-run AnalysisSpec rather than a retrospective spec.
- `research paper-qa` now avoids treating generic numeric eligibility thresholds, such as `RIDAGEYR >= 20`, as blood-pressure threshold evidence.
- The PIR/HDL paper passes paper QA and has a `spec-governed` runner record with no warnings.

## Tick 0166

- Added `agenteer research paper-lifecycle` to join paper QA, runner record binding, task validation, capability validation, blockers, and next action.
- Lifecycle output distinguishes the retrospective BMI/HbA1c paper (`needs_methods_review`) from the spec-governed PIR/HDL paper (`needs_task_envelope`).
- Full targeted CLI verification passed across research and agent tests.

## Tick 0167

- Added `agenteer research paper-run`, a composed AnalysisSpec-to-paper command that executes a supported local survey-aware analysis, writes paper artifacts, runs paper QA, creates runner provenance, creates task/evidence receipts, validates capabilities, exports MCP/A2A task views, and writes lifecycle summaries.
- Implemented local strata/PSU linearized sandwich variance for weighted linear regression in the generated Python runner, replacing the previous approximate WLS variance for supported continuous-outcome studies.
- Generated `/Users/saleh/TechProjects/agenteer/.loop-memory/actual-nhanes/papers/0167-pir-hdl-paper-run` from actual cached NHANES Parquet; lifecycle is `ready_for_local_review`, QA passes, runner binding is `spec-governed`, task validation passes, and evidence receipts pass.
- Documented the AnalysisSpec-to-paper path in `docs/research-pipeline.md`.

## Tick 0168

- Web search finding: CDC's NHANES weighting tutorial says analysts should use the "least common denominator" weight, and fasting lab analyses should use fasting subsample weights when those variables are the limiting component. Source: https://wwwn.cdc.gov/nchs/nhanes/tutorials/weighting.aspx
- Web search finding: survey software documentation describes linearized variance using sampling weights, strata, and cluster/PSU identifiers. Source: https://www.stata.com/capabilities/survey-commands/
- Implementation: `paper-run` now supports survey-weighted logistic regression with strata/PSU linearized sandwich variance for binary-threshold outcomes.
- Generated `/Users/saleh/TechProjects/agenteer/.loop-memory/actual-nhanes/papers/0168-bmi-elevated-a1c-logistic`; lifecycle is `ready_for_local_review`, QA passes 25/25, runner binding is `spec-governed`, and task validation passes.
- Tick 169: `research paper-qa` now distinguishes complex-survey linearized weighted models from approximate/frequency-weighted models, and logistic numeric consistency prefers odds ratio over log-odds when both are present.
- Tick 171: `research paper-run` now treats NHANES subsample weights as an explicit clearance contract requiring AnalysisSpec rationale and eligibility notes; `paper-qa` enforces subsample disclosure and evidence.
- Tick 172: Real NHANES paper `0172-bmi-fasting-glucose-subsample` proves `paper-run` can execute a fasting subsample AnalysisSpec with `WTSAF2YR`; `paper-qa` no longer treats AnalysisSpec policy threshold fields as clinical endpoint thresholds.
- Tick 174: Generated `paper-run` papers now start with a standardized local-review safety header; `paper-qa` requires this header for paper-run evidence.
- Tick 176: Added `research paper-rerun-stability`, a scientific-field repeatability checker for generated paper packets; `0172` fasting-subsample paper passes 15/15 checks against a fresh repeat run.
- Tick 177: `research paper-lifecycle` now surfaces rerun-stability status; failed rerun stability blocks local review and missing stability remains an archive-promotion advisory.
- Analysis engine infrastructure: created ignored local `.research-runtime/` resources with Python data/analysis packages, DuckDB/Polars, and an R 4.5 `survey`/`srvyr`/`gtsummary` stack for zero-cloud local execution.
- Added `agenteer research backend-status` to report analysis backend readiness for `python-linearized`, `r-survey`, and `duckdb-polars`; tests use fake runtimes so CI does not require local R.
- Added `paper-run --backend r-survey`, which keeps Python for local data loading but delegates supported NHANES/public-health survey inference to R `survey::svydesign` and `survey::svyglm`.
- Generated real cached NHANES packet `0179-bmi-fasting-glucose-r-survey`; lifecycle `ready_for_local_review`, paper QA `pass`, task validation `pass`, complete-case N 11,918, variance `r_survey_taylor_linearized`.
- Verified `0179` against prior R-survey packet `0178` with `paper-rerun-stability`; 15/15 scientific-field checks passed.
- Added `docs/research-machine-build-tracks.md` to make the seven-track machine build explicit: execution core, analysis engines, AnalysisSpec V2, study archetypes, dataset adapters, QA/benchmarks, and planner/product.
- Implemented the typed research-machine layer under `packages/cli/src/research-machine/`: Zod schemas, backend catalog, dataset adapter catalog, study archetype catalog, AnalysisSpec V2 migration/validation, execution contracts, deterministic planner, dataset/runtime inspection, and machine benchmark evaluation.
- Added CLI commands for the new layer: `machine-status`, `spec-v2`, `execution-contract`, `archetypes`, `dataset-adapter`, `machine-plan`, and `machine-benchmark`.
- Added `packages/cli/tests/research-machine.test.ts` covering all seven build tracks with fake runtimes, NHANES adapter inspection, V1->V2 migration, blocked unsupported backend contracts, planner output, archetype catalog, and benchmark scoring.
- CLI smoke verified real local resources: machine status sees R survey and NHANES cache as available; `0172` migrates to AnalysisSpec V2; execution contract validates with NHANES + `r-survey`; real `0179` packet scores `pass` with machine benchmark.
- Added a comprehensive analysis-method ontology and selector covering 59 methods across 40 statistical/methodological categories, including classical tests, regression, survey methods, survival, repeated measures, multilevel, causal inference, diagnostics, prediction/ML, validation, latent methods, clustering, time series, meta-analysis, Bayesian methods, missing data, reliability, epidemiology, trials, economics, spatial/network/NLP/qualitative methods, high-dimensional data, image/signal analysis, power, diagnostics, and multiplicity.
- Added method-layer CLI commands: `methods-catalog`, `method-select`, `method-apply`, and `method-validate`; selections can be persisted and merged into AnalysisSpec V2 before execution-contract creation.
- Method selection now conservatively distinguishes `executable`, `contract-ready`, `design-only`, and unavailable-backend methods; survival selection correctly chooses Cox/R-survival while requiring human review because no production survival backend is verified.
- Tick 0182: Binary ML runs now persist calibration evidence (`calibration.csv`, `calibration_bins`, and a `calibration` artifact kind), grounded in TRIPOD+AI and probability calibration guidance.
- Tick 0183: `research modeling-plan` now embeds `methodSelectionEvidence` with selection id/hash, primary method, backend/archetype recommendation, review flag, issue codes, and a method-apply hint, reducing drift between method selection and modeling decisions.
- Tick 0184: Added `research stats-run`, a Python-backed executable classical statistics runner covering descriptive summaries, group tests, correlations, linear/logistic/Poisson regression, diagnostics, and hashed artifacts.
- Tick 0186: `stats-run` now has typed diagnostic issues and refuses declared complex-survey execution unless `--allow-survey-approximation` makes the exploratory posture explicit.
- Tick 0187: `modeling-plan` now maps executable standard-table method candidates to direct `stats-run` command hints and stats artifact expectations, while leaving survey-shaped methods on the survey-aware path.
- Tick 0188: `stats-run` can bind to method-selection and AnalysisSpec evidence, records method/spec provenance, and blocks method-selection mismatches before execution.
- Tick 0189: Extracted a shared method-to-`stats-run` mapping so modeling-plan command hints and stats-run binding validation cannot drift silently.
- Tick 0192: `modeling-plan` now includes `routeRecommendation`, making it the analysis front door for `paper-run`, `stats-run`, `ml-run`, `method-select`, or stop-for-review.
- Tick 0198: `stats-run` now declares typed `resultPosture` values (`exploratory_standard_table`, `bound_standard_table`, `exploratory_survey_approximation`, `blocked_survey_required`, `invalid_binding`, `failed`) with supports/cannot-support boundaries; `paper-lifecycle` renders that posture so reviewers can distinguish artifact presence from interpretable research output.
- Tick 0199: `ml-run` now declares typed `resultPosture` values for locally validated supervised prediction, exploratory unsupervised output, optional dependency gaps, and failed runs; CLI rendering exposes the boundary directly.
- Tick 0201: `modeling-plan` now consumes `--prior-run` stats/ML artifacts and converts posture into route decisions: survey-aware rerun, method/spec binding, repair review, baseline comparison, or external-validation stop.
- Tick 0202: Added `research analysis-manifest`, a single compact manifest for stats/ML run directories covering run kind, posture, readiness, artifact completeness, hashes, issue codes, and next action.
- Tick 0203: Saved a golden stats route at `.loop-memory/golden/0203-stats-route` proving `modeling-plan -> stats-run -> analysis-manifest -> modeling-plan --prior-run` works and routes exploratory output back to method/spec binding.
- Tick 0204: Added `research analysis-run`, a bounded standard-table stats route command that writes initial `modeling-plan.json`, executes `stats-run`, writes `analysis-run-manifest.json`, and writes `modeling-plan-after-prior.json`.
- Tick 0206: `analysis-run` now supports `--method-selection`, `--analysis-spec`, and `--require-bound`; strict mode blocks unbound execution and bound method-selection routes produce `bound_standard_table` / `local_review_ready`.
- Tick 0207: `analysis-manifest --require-ready` now fails exploratory/blocked runs, giving benchmark and promotion scripts a hard local-review-ready gate.
- Tick 0208: Binary classification ML manifests now require `calibration` artifacts before local-review readiness; `--require-ready` enforces that gate.
- Tick 0209: `ml-compare` now emits `comparisonPosture`, with `baseline_comparison_ready` requiring at least two successful scored models, a transparent baseline, and binary calibration artifacts.
- Tick 0211: `ml-compare` now writes `model-review-card.md` plus JSON review-card fields covering intended use, intended non-use, validation boundary, leakage review, missing evidence, and ranked models.
- Tick 0212: Saved golden ML comparison route `.loop-memory/golden/0212-ml-comparison-route` proving modeling-plan, ml-compare posture, and model-review-card composition.
- Tick 0213: `analysis-manifest` now supports `ml-comparison` directories, allowing `analysis-manifest --require-ready` to gate `comparison.json` plus `model-review-card.md`.
- Tick 0214: Added `research analysis-benchmark`, aggregating analysis manifests across stats, ML, and ML-comparison directories with optional `--require-ready` gating.

## Tick 218

- Added `--require-multi-route` to `research analysis-benchmark`.
- Single-route benchmark suites still pass by default but surface `single_route` coverage as a warning.
- Promotion scripts can now fail narrow benchmark suites unless at least two local-review-ready route kinds are present.
- Live smoke: golden ML-only benchmark exits nonzero with `single_route`; stats+ML benchmark passes with `multi_route_ready`.

## Tick 221

- Ran `research machine-benchmark` on the actual R-survey NHANES paper packet `0179-bmi-fasting-glucose-r-survey`.
- Machine benchmark passed with normalized score `1`.
- Created `.loop-memory/golden/research-machine-health-0221.md`, a composed health note that keeps analysis-route benchmark and paper-route benchmark distinct but visible together.
# Tick 0223

- Added executable `diagnostic-accuracy` to `research stats-run`.
- Mapped method ontology `diagnostic-accuracy-basic` to the runner.
- Added binary reference/test handling, confusion matrix, sensitivity, specificity, PPV, NPV, accuracy, prevalence, likelihood ratios, and sparse-cell warnings.
- Added targeted regression coverage and documentation.
- Created `.loop-memory/golden/0223-diagnostic-accuracy-route` and strict three-route benchmark evidence.

# Tick 0224

- Made diagnostic accuracy route planning explicit in `modeling-plan` and `analysis-run`.
- `analysis-run --method diagnostic-accuracy` now stores diagnostic goal/study-design semantics in saved planning artifacts.
- `modeling-plan` now names `<binary-reference-standard>` and `<binary-index-test>` in diagnostic command hints.
- Refreshed the diagnostic golden route and kept the strict three-route benchmark passing.
- Added STARD/STARD-AI caveats to research ML documentation.

# Tick 0226

- Added diagnostic-specific report and QA gates to `stats-run`.
- Diagnostic reports now render a dedicated diagnostic metrics table instead of hiding sensitivity/specificity inside generic estimate columns.
- Reports now include a `Diagnostic Accuracy Boundary` section with reference standard, index test, PPV/NPV prevalence dependence, precision caveat, and no-screening-recommendation boundary.
- Diagnostic QA now records role, metric, predictive-value context, overclaim boundary, precision, and sparse-cell checks.

# Tick 0228

- Added Wilson binomial intervals for sensitivity, specificity, PPV, and NPV in `diagnostic-accuracy`.
- Rendered intervals in diagnostic reports.
- Made diagnostic precision QA pass when deterministic intervals are present.
- Refreshed the diagnostic golden route and preserved strict multi-route benchmark readiness.

# Tick 0229

- Added explicit threshold derivation for diagnostic accuracy through `--outcome-threshold` and `--exposure-threshold`.
- Stored reference/test thresholds in diagnostics.
- Added targeted coverage for threshold-derived diagnostic metrics.
- Created `.loop-memory/golden/0229-diagnostic-threshold-route` and passed a strict four-route benchmark.

# Tick 0231

- Added diagnostic paper wrapper artifacts to `analysis-run`.
- Diagnostic `paper.md` includes thresholds, confusion matrix values, Wilson intervals, PPV/NPV prevalence caveat, and screening-overclaim boundary.
- Diagnostic `paper-qa.json` verifies safety header, reference/index roles, prevalence caveat, intervals, screening boundary, and manifest readiness.
- Refreshed the threshold diagnostic golden route and preserved strict benchmark readiness.

# Tick 0232

- Added optional manifest visibility for diagnostic paper artifacts.
- `analysis-run` now rebuilds the stats manifest after diagnostic paper generation so hashed paper files appear in inspection.
- Preserved stats-route readiness semantics by keeping paper artifacts optional.

# Tick 0234

- Added a saved rerun-stability receipt for the threshold-derived diagnostic golden route.
- Proved diagnostic `estimates` and `diagnostics` are stable across baseline and repeat route executions.

# Tick 0254

- `research modeling-plan` now accepts `--exploration-handoff`, reads `modelingPlanSeed`, carries review/blocked posture into typed modeling issues, and can use the handoff's table path to derive table evidence.
- Saved actual-data handoff planning proof at `.loop-memory/golden/0252-actual-nhanes-exploration/modeling-plan-from-handoff.json`.
- The actual NHANES exploration handoff routes to `paper-run` under `--survey` while preserving `EXPLORATION_HANDOFF_METHODS_REVIEW`.

# Tick 0256

- Added exploration candidate taxonomy, research-interest scoring, `whyThisQuestion`, and `avoidAsPrimaryQuestion`.
- Regenerated the actual NHANES exploration proof; the top handoff is now an age/HbA1c public-health candidate rather than a glucose/HbA1c same-domain biomarker relationship.
- `explore-promote` now carries taxonomy and research-interest fields into `modelingPlanSeed`.

# Tick 0258

- Added `primaryQuestionUse` and `taxonomyEvidence` to exploration candidates.
- `taxonomyEvidence` records `exploration-taxonomy-v1`, matched rule ids, matched terms, score adjustments, and rejected categories.
- Added `taxonomy-evidence` QA and regenerated actual NHANES exploration/handoff/modeling-plan artifacts.

# Tick 0259

- Web-search finding from QUIS (https://arxiv.org/abs/2410.10270): exploration should be question-guided, not only association-ranked; Agenteer should separate signal maps from question agendas.
- Web-search finding from Graph-RAG dataset discovery (https://link.springer.com/article/10.1007/s41019-025-00313-x): explainable ranking criteria and semantic metadata are central to trustworthy discovery; Agenteer taxonomy evidence is directionally right but needs codebook/adapter backing.
- Web-search finding from TRIPOD+AI (https://pmc.ncbi.nlm.nih.gov/articles/PMC11025451/): exploratory association, explanatory modeling, and prediction-model development need different reporting/evaluation routes.

# Tick 0261

- Added `routeIntent` and `routeIntentRationale` to exploration candidates.
- Added run-level `recommendedQuestion` so reports start with one concise next question and command.
- Handoffs now carry route intent into `modelingPlanSeed`; `modeling-plan --exploration-handoff` defaults `goal=associate` for explanatory association handoffs.

# Tick 0262

- Added `analysisSpecCandidate` to exploration handoffs.
- The candidate records route intent, research question, estimand boundary, source population, outcome/exposure, excluded variables pending review, design requirements, suggested model family, required pre-execution checks, and provenance.
- Regenerated the actual NHANES handoff and modeling-plan artifacts with the pre-spec bridge.

# Ticks 0338-0357

- Ran a 20-scenario full propensity hardening suite covering matching, weighting, exact matching, 2:1 matching, replacement, continuous outcomes, missingness, poor overlap, extreme weights, categorical burden, wide covariate sets, threshold-derived exposure, no-covariate refusal, tiny treated groups, ATT weighting, loose/strict calipers, rerun stability, and method-binding mismatch.
- Added required propensity manifest artifacts: `propensity-scores.csv`, `propensity-overlap.csv`, `balance.csv`, and either `matched-pairs.csv` or `weights.csv`.
- Added complete-case/drop accounting to propensity diagnostics and QA, including high complete-case exclusion warnings.
- Added `propensity-overlap.csv` with treated/control bin counts so overlap can be audited without opening model internals.
- Added reader-facing propensity `paper.md` and `paper-qa.json` from `analysis-run` for successful propensity runs.
- Prevented failed/invalid propensity runs from generating reader-facing papers.
- Added automated coverage for full propensity `analysis-run` paper generation and manifest visibility.
- Saved all tick artifacts under `.loop-memory/propensity-hardening-20260508/`; the suite passed 20/20 expectations.

# Tick 0429

- Added `deepseek-triple` and tightened reviewer prompts so a three-role DeepSeek panel can complete with valid structured output.
- Rebuilt the MIMIC SAVR/TAVR dialysis redo packet with deterministic paper QA pass, figure QA pass, reviewer context, outcome phenotype artifact, valve code-list artifact, missingness summary, propensity balance, propensity intervals, and post-repair review records.
- Accepted and implemented reviewer repairs for admission-time mortality horizons, descriptive-only tiny strata, expanded stroke phenotype, and reviewer-visible phenotype/provenance artifacts.
- Remaining gap: reviewer-accepted repairs are still manually enacted by the orchestrating agent; the state machine should automatically convert accepted findings into executable repair branches.
- Remaining gap: phenotype sensitivity should become first-class. The reviewer flagged additional SAVR ICD-9 codes beyond the user-supplied primary set; the right implementation is primary-vs-expanded phenotype comparison, not silent replacement.
