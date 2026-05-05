# Open Questions

## Modeling Decision Layer

- Tick 178 added a deterministic modeling-plan command. It should next consume table summaries, AnalysisSpec V2, and backend availability so recommendations are driven by actual data evidence rather than flags alone.
- The planner currently treats survival and text/image modeling as stop-for-review/contract areas. Future ticks need executable adapters only when backed by mature libraries and tests.
- Tick 179 challenge: `modeling-plan` should split blocking policies from executable candidates and show different recommendations for small/high-missingness versus large/clean tables.
- Resolved partly: Tick 181 added table/table-summary evidence ingestion and split blocking policies. Remaining gap: consume AnalysisSpec V2, backend status, and prior run outcomes.
- Tick 182 added binary ML calibration artifacts. Remaining gap: `modeling-plan` and paper QA should eventually require calibration/decision-threshold evidence for clinical prediction tasks rather than treating AUROC as enough.
- Resolved partly: Tick 183 embedded method-selection evidence in `modeling-plan`. Remaining gap: use backend-status/prior-run evidence to hide or downgrade candidates unavailable in the local runtime.
- Tick 184 added `stats-run` for standard table methods. Remaining gap: bind `stats-run` to AnalysisSpec V2/method-selection evidence so it cannot silently run a method that the planner did not approve.
- Tick 185 challenge target: `stats-run` needs typed diagnostics/refusals for survey misuse, low complete-case N, sparse cells, separation, convergence, and overdispersion before it should feed generated papers.
- Resolved partly: Tick 186 added typed stats issues and survey refusal/explicit-approximation behavior. Remaining gap: feed these issues into paper lifecycle/readiness and make `stats-run` consume method-selection/spec hashes.
- Resolved partly: Tick 187 connected executable standard-table method candidates to `stats-run` command hints. Remaining gap: execute a real stats-run-backed paper packet and bind the run to method-selection/spec hashes.
- Resolved partly: Tick 188 added method-selection/spec binding to `stats-run`. Remaining gap: share the method-to-stats mapping so modeling and binding validation cannot drift.
- Resolved: Tick 189 extracted the shared method-to-`stats-run` mapping. Remaining gap: make execution contracts consume the same mapping.
- Tick 190 challenge target: prove the stats path through packet lifecycle/readiness, not only command tests; otherwise `stats-run` becomes a separate execution island.
- Tick 191 challenge target: add an analysis front-door projection so users/agents know whether to use `paper-run`, `stats-run`, `ml-run`, or stop for review.
- Resolved partly: Tick 192 added `routeRecommendation` to `modeling-plan`. Remaining gap: prove the route by generating a stats-backed packet and making lifecycle consume stats artifacts.
- Resolved partly: Tick 193 made `paper-lifecycle` consume `stats-run.json` and block failed stats runs. Remaining gap: generate a complete stats-backed packet wrapper with report/QA/task artifacts from `StatsRunResult`, not only lifecycle visibility.
- Resolved partly: Tick 194 made `modeling-plan` consume backend-status evidence. Remaining gap: feed prior run outcomes and lifecycle status into route recommendations, not only runtime availability.
- Tick 195 challenge target: fix duplicate stats bridge JSON output and make standard-table stats execution produce packet-grade report/QA artifacts before adding method breadth.
- Resolved partly: Tick 196 made stats execution produce report/QA artifacts. Remaining gap: generate task/evidence envelopes and lifecycle summaries automatically for stats packets.
- Tick 197 challenge target: add explicit result posture and interpretation boundary for stats/ML runs before expanding method families.

## Research Pipeline

- Should `checkpoint` become the primary user-facing guide for all stage transitions, with specialized commands remaining lower-level?
- Should packet stage artifacts use one normalized manifest file for stage completion instead of inferring completion from scattered filenames?
- How should MedBrevia's richer candidate/protocol/session workflow map to Agenteer's CLI without copying product-specific UI state?

## Agenteer

- Should execution memory become a default input to `plan-v2`, or remain opt-in through `--context-pack`?
- Should `agent plan-critic` understand research stage gates natively, or should that stay in `research stage-gate`?

## Verification Environment

- Vitest currently fails under the bundled Codex Node because Rollup's native optional dependency has a macOS code-signature/team mismatch. Build succeeds, and CLI verification works. A future tick should decide whether to repair local dependencies or document an alternate test command.

## Actual NHANES Data

- Should Agenteer add a small Python-backed Parquet reader bridge, or should it define an external real-data manifest contract and keep tabular execution outside TypeScript?
- The real NHANES scout used MedBrevia's script successfully; the next design question is how much of that logic should be generalized into Agenteer versus referenced as a domain runner.
- `research table-summary` now provides a minimal Parquet bridge. Remaining question: should `cohort-scout-file`, `semantic-quality`, and variable-map suggestions call the same bridge or stay JSON/CSV-only?
- Variable-map suggestions now call the bridge. Remaining question: should semantic quality and cohort scout also summarize/read Parquet, or should they require a curated analysis bundle?
- Tick 080 challenge: what exact provenance fields make a Python-backed real-data adapter reproducible enough for packet export?
- Tick 083 challenge: should `data-access.json` absorb table-summary provenance and eventually replace parts of `real-runner-spec`?
- Tick 085 challenge: what human decision summary belongs in `data-access.json` so provenance supports clinical/research review instead of burying it?
- `data-access.json` now absorbs table-summary provenance; next question is whether `real-study-readiness` should require at least one summarized file and report missing expected variables.
- Tick 088 finding: should `fixture-runner-spec` be a note rather than a blocker for `real-study-readiness` when real-data runner/data-access/survey requirements pass?
- Tick 089 challenge answer target: add blocking/advisory semantics to real-study readiness.
- Tick 090 challenge: how should export/share posture redact or warn on absolute local paths while preserving local rerunability?
- Resolved: blocking/advisory semantics added in Tick 092; fixture runner is advisory for real-data readiness.
- Resolved partially: Tick 094 added `data-access-redact`; remaining question is whether `research export` should automatically substitute this artifact for raw `data-access.json`.
- Tick 095 challenge: how should export prove it used redacted data-access evidence and that shareable artifacts contain no absolute local paths?
- Tick 098 search answer target: implement an export receipt with relative artifact refs, SHA-256 hashes, and a local-path scan over shareable artifacts.
- Tick 100 challenge: after the export receipt, what second actual NHANES research question should stress different domains and methods enough to avoid overfitting the HbA1c packet?
- Tick 102 answer target: implement artifact classes without converting the entire export format to BagIt/RO-Crate yet.
- Resolved partly: Tick 104 created a second actual NHANES vitamin-D/blood-pressure packet; next question is what semantic/cohort checks should distinguish it from the diabetes packet.
- Tick 105 challenge: should `ready_for_local_real_data` be renamed or complemented with a stricter `ready_for_analysis_generation` status after merged cohort scouting?
- Tick 106 finding: cohort-feasibility should likely be a required artifact before analysis generation for actual-data packets.
- Tick 107 paper contract: should `research review-report` evolve into a stricter `paper-qa` command with STROBE/NHANES/missingness/causal-language checks?
- Tick 108 finding: paper QA should become a reusable CLI command instead of a one-off Python JSON writer.
- Resolved: Tick 109 added `research paper-qa`.
- Next paper QA gap: should `paper-qa` require paper-specific confounder omissions and model-limitations checks from evidence JSON?
- Tick 110 candidate: are actual cached smoking/lipids variables sufficient for a continuous-outcome paper, or should the second paper pivot to kidney/albuminuria or socioeconomic-HbA1c?
- Resolved: Tick 111 generated smoking/HDL paper; triglycerides were rejected for now.
- Paper QA gap: add endpoint-type-aware checks and require a rejected-endpoint rationale when analysis JSON includes one.
- Tick 112 candidate: does actual `kidney.parquet` include enough albumin/creatinine or UACR variables to generate a kidney/BP paper?
- Resolved: Tick 113 generated UACR/hypertension paper.
- Resolved: Tick 0114 added threshold provenance and single-measure diagnostic-overclaim checks to `research paper-qa`.
- Resolved partly: Tick 0116 added model-family, effect-measure, covariate, and approximate-variance consistency checks.
- Paper QA gap: should `paper-qa` also validate endpoint-type-specific tables, p-value/CI numeric consistency, and rejected-endpoint rationale?
- Tick 0117 selected answer target: implement p-value/effect/CI numeric consistency before adding more generated papers.
- Resolved partly: Tick 0118 added p-value/effect/CI numeric consistency checks; endpoint-specific tables and rejected-endpoint rationale remain open.
- Tick 0119 candidate: health insurance coverage and HbA1c should stress social determinant exposure, threshold sensitivity, and diagnosis caveats.
- Tick 0120 constraint: Paper 4 must define all-adult versus diagnosed-diabetes population before claiming anything about glycemic control.
- Resolved: Tick 0121 generated the all-adult insurance/HbA1c paper.
- Paper QA gap: causal-language checks should become negation-aware so "not evidence that X caused Y" is not treated the same as a causal claim.
- Resolved: Tick 0122 made causal-language checks negation-aware for paper QA.
- Paper corpus gap: should the index be generated by a CLI command rather than by tick-local Python?
- Resolved: Tick 0124 added `agenteer research paper-index`.
- Tick 0125 challenge: should each generated paper directory require a runner provenance record before being considered reproducible?
- Resolved partly: Tick 0126 added the first `runner-record.json` for Paper 4; remaining work is a reusable CLI command and backfill for Papers 1-3.
- Tick 0127 finding: paper index now shows Papers 1-3 have missing runner provenance; backfill or verify them next.
- Resolved: Tick 0128 backfilled runner records for Papers 1-3.
- Evidence schema gap: paper `analysis.json` files need typed `AnalysisSpec`/model-audit fields so runner provenance does not need ad hoc normalization.
- Golden packet target: `/Users/saleh/TechProjects/agenteer/.loop-memory/golden/nhanes-insurance-hba1c/` needs typed AnalysisSpec, survey-aware validation, typed failures, and rerun stability.
- Resolved partly: Tick 0130 added `analysis-spec.json`; remaining work is validation and spec-governed rerun.
- Resolved partly: Tick 0131 added source-table validation; remaining work is reusable code/test coverage and spec-governed rerun stability.
- Resolved partly: Tick 0132 strengthened `cohort-scout-file` typed failures; Parquet-backed golden scout still needs a reusable adapter path.
- Resolved partly: Tick 0133 proved the golden model can rerun stably from the AnalysisSpec using local cached Parquet. Remaining work is reusable CLI/test integration and manifest/readiness surfacing.
- Resolved partly: Tick 0134 added a golden manifest; remaining work is reusable verification/test integration.
- Tick 0135 challenge: golden manifest is self-attested; add independent hash/readiness verification and keep it local-only until redacted.
- Resolved partly: Tick 0136 added independent golden manifest verification; local-only/share-safe distinction remains open.
- Resolved partly: Tick 0137 added share-safety scan; next step is redacted/share-safe manifest or readiness integration.
- Resolved partly: Tick 0138 integrated share-safety into the golden manifest. Redacted/share-safe export remains open.
- Resolved partly: Tick 0139 made local review status independently verified.
- Tick 0140 challenge: avoid a hidden golden subsystem; prove golden readiness through existing primitives and integration tests.
- Resolved partly: Tick 0141 added a miniature golden-packet integration test using existing primitives.
- Resolved partly: Tick 0142 made manifest verification failures typed; next question is whether repair plans should consume these typed failures directly.
- Resolved: Tick 0143 made repair plans consume typed manifest verifier failures.
- Tick 0144 finding: AnalysisSpec should carry explicit failure policy and rerun thresholds instead of leaving those rules distributed across verifier prose.
- Tick 0145 challenge response target: add machine-checkable inference/failure policy to AnalysisSpec and QA enforcement for approximate survey variance language.
- Resolved partly: Tick 0146 added AnalysisSpec inference/failure policy and paper-QA enforcement. Remaining gap: repair-plan should distinguish executable repair from methodological stop-for-review.
- Tick 0147 source-backed gap: implement complex-survey variance or keep p-value/CI language explicitly exploratory; repair-plan should not treat this as a normal executable patch.
- Resolved partly: Tick 0148 added executable/methodological repair classification. Remaining gap: runner records should declare which class each attempted repair belongs to.
- Tick 0149 challenge response target: add a live golden repair-plan artifact or spec-hash runner receipt check.
- Tick 0150 challenge response target: add a manifest-tracked first-read local review note for the golden packet.
- Resolved: Tick 0151 added a manifest-tracked first-read local review note.
- Resolved partly: Tick 0152 added spec-hash runner receipt checking. Remaining gap: live golden repair-plan artifact should show repair classification on the canonical packet.
- Resolved: Tick 0153 added a live golden repair-plan artifact.
- Resolved partly: Tick 0154 added a repeat-verification receipt; remaining gap is a full packet diff receipt across substantive artifact changes.
- Tick 0155 challenge response target: make manifest verification output explicit `validLocal` and `validForShare` style posture.
- Resolved: Tick 0156 added local/share validity posture to manifest verification.
- Tick 0157 finding: paper generation can now produce runner records consistently, but the actual generation itself is still outside a reusable runner adapter.
- Tick 0158 finding: `paper-index` should accept both raw runner records and `research paper-runner-record --json` envelopes so provenance created by the CLI is visible in the index.
- Resolved: Tick 0159 made `paper-index` unwrap the CLI paper-runner-record envelope.
- Tick 0160 challenge response target: make actual paper task/evidence envelopes first-class and make retrospective AnalysisSpec binding visibly downgraded in reviewer-facing outputs.
- Resolved partly: Tick 0161 made retrospective AnalysisSpec binding visibly downgraded in runner records and paper index output. Remaining work is task/evidence envelopes.
- Resolved partly: Tick 0162 created task/evidence envelopes for the BMI/HbA1c paper. New blocker: task validation needs capability declarations for `research.paper.generate`, `research.paper.qa`, and `research.runner.provenance`.
- Resolved: Tick 0163 added local capability declarations and validated the BMI/HbA1c task successfully.
- Tick 0164 finding: `paper-qa` threshold heuristics should be tied to explicit threshold evidence objects or clinical threshold terms, not any `>=`/`<=` eligibility expression.
- Resolved partly: Tick 0164 produced one actual spec-governed paper. Remaining gap: task/evidence envelopes should be generated for spec-governed papers too, and index/readiness should surface binding posture.
- Tick 0165 challenge response target: consolidate paper QA, runner binding, task validation, capability validation, and next blocker into a compact lifecycle summary instead of adding more manual wrappers.
- Resolved partly: Tick 0166 added `research paper-lifecycle`. Remaining gap: lifecycle task/evidence envelopes are still manually created rather than generated as part of paper execution.
- Resolved: Tick 0167 made `paper-run` generate task/evidence envelopes and lifecycle artifacts automatically.
- Tick 0167 remaining methods gap: `paper-run` currently supports continuous-outcome weighted linear models; binary endpoints, subsample-specific weights, domain analysis, and multi-cycle weight construction still need explicit runner support.
- Resolved partly: Tick 0168 added binary-threshold logistic support to `paper-run`. Remaining methods gaps: subsample-specific eligibility/weights, domain analysis, and multi-cycle weight construction.
- How should fresh `paper-run` packets prove rerun stability without doubling every routine run cost?
- Should the local-review safety header be exported into lifecycle/task metadata so downstream UI can display the same interpretation boundary without parsing Markdown?
- Should future `paper-run` optionally create the repeat run and rerun-stability artifact automatically when `--archive-check` or a benchmark mode is requested?
- Tick 0198 resolved the stats-run posture gap for lifecycle; remaining analogous gap is ML run posture and a smoother packet command that joins modeling-plan -> stats/ml/paper-run -> lifecycle.
- Tick 0199 resolved ML run posture. Remaining gap: make `modeling-plan` consume prior stats/ML run posture and route failures into repair/replan instead of requiring the operator to inspect each run manually.
- Tick 0201 resolved prior-run posture routing in `modeling-plan`. Remaining gap: generate a single stats/ML packet manifest that records route -> execution -> prior-run response -> lifecycle without adding a maze of commands.
- Resolved: Tick 0219 updated the active golden-task record to point at the bound stats route and strict two-route benchmark rather than the old exploratory stats route.
- Tick 0206 added strict binding to stats `analysis-run`. Remaining gap: define the equivalent strictness rule for ML, likely baseline comparison + calibration + validation-design note rather than method-selection binding.
- Tick 0207 added manifest readiness gating. Remaining gap: create an ML-ready gate that requires baseline comparison and calibration, not just a single `ml-run` manifest.
- Tick 0208 added binary ML calibration readiness. Remaining gap: require model comparison/baseline evidence before counting prediction routes as benchmark-successful.
- Tick 0209 added comparison posture. Remaining gap: connect comparison posture to a prediction-route manifest or bounded ML route.
- Tick 0211 added model-review cards. Remaining gap: make claim generation/report QA cite model-review-card fields as a claim firewall.
- Tick 0212 saved a golden ML route. Remaining gap: create a benchmark checker for golden stats/ML routes that validates posture/card/readiness without manual JSON inspection.
- Tick 0213 unified ML comparison readiness into `analysis-manifest`. Remaining gap: use both golden stats and ML routes in one benchmark summary.
- Tick 0214 added `analysis-benchmark`. Remaining gap: create a bound golden stats route so strict benchmark can pass both stats and ML routes together.
- Tick 0215 challenge: `analysis-benchmark` should not be treated as mature until it proves at least one bound stats route and one ML comparison route together, ideally with coverage/report artifacts rather than ad hoc JSON inspection.
- Resolved partly: Tick 0216 created a bound stats route and strict two-route benchmark. Remaining gap: benchmark output should include route coverage and a durable report artifact rather than requiring manual JSON capture.
- Resolved: Tick 0217 added benchmark route coverage and durable JSON/Markdown output.
- Resolved partly: Tick 0218 added an explicit multi-route benchmark gate. Remaining gap: decide whether paper-run routes should join the same suite or remain separate under paper lifecycle/packet benchmarks.
- Tick 0220 answer: do not flatten paper-run into `analysis-benchmark` yet; add a thin composed health summary that references analysis benchmark and paper lifecycle artifacts.
- Resolved partly: Tick 0221 created a composed health summary artifact. Remaining gap: automate this summary through an existing command or a small health command if it proves repeatedly useful.
# Tick 0223

- Resolved partly: executable diagnostic accuracy and a golden route now exist. Remaining gap: `modeling-plan` and `analysis-run` should natively understand diagnostic route semantics instead of relying on older inference defaults.

# Tick 0224

- Resolved: diagnostic route semantics now flow through `modeling-plan` and `analysis-run`.
- New diagnostic QA gap: `stats-report.md` and `stats-qa.json` should explicitly enforce reference-standard/index-test language, predictive-value prevalence caveats, and screening recommendation overclaim checks.

# Tick 0225

- Challenge response target: add diagnostic report/QA gates for reference-standard/index-test wording, predictive-value prevalence caveats, precision caveats, screening overclaim detection, and sparse-cell escalation.

# Tick 0226

- Resolved partly: diagnostic report/QA gates exist for `stats-run`. Remaining gap: generate an actual diagnostic paper packet and decide whether intervals should be Wilson/exact/binomial or bootstrap by default.

# Tick 0227

- Challenge response target: avoid another clean 2x2 synthetic diagnostic example; add interval estimates, threshold derivation, or indeterminate-result accounting before a diagnostic paper.

# Tick 0228

- Resolved partly: Wilson intervals now exist. Remaining gap: threshold derivation and indeterminate-result accounting before a real diagnostic paper.

# Tick 0229

- Resolved partly: explicit threshold derivation exists. Remaining gap: indeterminate-result accounting and diagnostic paper packet generation from stats-run artifacts.

# Tick 0230

- Challenge response target: add a narrow diagnostic stats-run-to-paper packet path with paper prose, paper QA/receipt, thresholds, intervals, and analysis-manifest compatibility.

# Tick 0231

- Resolved partly: diagnostic stats-run-to-paper artifacts now exist inside `analysis-run`. Remaining gap: decide whether `analysis-manifest` should include root-level paper artifacts or leave them to route-specific packet manifests.

# Tick 0232

- Resolved: `analysis-manifest` includes diagnostic paper artifacts as optional inspection evidence. Remaining gap: real/public-data diagnostic paper packet.

# Tick 0233

- Challenge response target: add diagnostic rerun stability, lifecycle/index visibility, or actual NHANES-shaped diagnostic packet pressure.

# Tick 0234

- Resolved partly: diagnostic rerun stability exists as a saved golden artifact. Remaining gap: make rerun stability a reusable analysis-route command if the pattern repeats.
