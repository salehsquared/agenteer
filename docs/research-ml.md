# Research ML Modeling

Agenteer now has a modular tabular ML layer under `research-machine/ml`. The TypeScript side owns the stable CLI/API contract, model registry, validation, artifact manifests, and comparison output. The execution side uses a generated Python bridge around scikit-learn so the platform relies on mature estimators instead of custom algorithms.

## Commands

Choose modeling strategies before execution:

```bash
agenteer research modeling-plan \
  --question "Can BMI and demographics predict elevated HbA1c?" \
  --outcome binary \
  --study-design cross_sectional \
  --table rows.csv \
  --feasibility feasibility-gate.json \
  --target elevated_hba1c \
  --survey \
  --predict
```

List supported adapters:

```bash
agenteer research ml-models --task binary_classification
agenteer research ml-models --include-unavailable --json
```

Run one model:

```bash
agenteer research ml-run \
  --task binary_classification \
  --model logistic-regression \
  --data rows.csv \
  --target outcome \
  --out-dir .research/ml/binary-logistic \
  --scale \
  --cv 5
```

Compare models on a shared task/split:

```bash
agenteer research ml-compare \
  --task regression \
  --data rows.csv \
  --target target \
  --model ridge-regression \
  --model random-forest-regressor \
  --primary-metric rmse \
  --out-dir .research/ml/regression-compare
```

Inspect a persisted run:

```bash
agenteer research ml-inspect --run .research/ml/binary-logistic/ml-run.json
```

## Supported Tasks

The first production pass covers tabular:

- `binary_classification`
- `multiclass_classification`
- `regression`
- `clustering`
- `dimensionality_reduction`

Supervised tasks require `--target`. Unsupervised tasks use all columns unless `--feature` is supplied. When feature columns are explicit and accidentally include the target, the runner excludes the target and records a leakage warning.

## Modeling Decision Layer

`research modeling-plan` is the decision layer that should run after a protocol or AnalysisSpec exists and before selecting an executable backend. It combines the statistical methods ontology, ML adapter registry, and workflow policies into one ranked plan. The output separates:

- primary modeling candidates
- transparent baselines
- sensitivity analyses
- workflow policies such as complex-survey design, missingness sensitivity, causal stop-for-review, and survival required fields
- required artifacts and metrics before execution

The plan also includes `methodSelectionEvidence`: the underlying method-selection id/hash, primary method id, recommended backend/archetype, review flag, issue codes, and a `method-apply` command hint. This makes `modeling-plan` the single decision artifact that links the method ontology to ML adapter selection. Generic independent two-group continuous comparisons default to Welch's t-test at the method-selection layer; the equal-variance/pooled two-sample t-test remains available when that assumption is explicitly requested and justified.
For standard-table methods that `stats-run` can execute, candidate `commandHint` values point directly to `research stats-run` and expected artifacts include `stats-run.json`, `estimates.csv`, `diagnostics.json`, `stats-report.md`, and `stats-qa.json`. Survey-shaped methods continue to route through survey-aware planning instead of standard `stats-run`.
The `routeRecommendation` field is the current analysis front door: it chooses `paper-run`, `stats-run`, `ml-run`, `method-select`, or `stop-for-review`, with the next command and required artifacts.
When the controller or a prior `research feasibility-gate` run has already evaluated dataset feasibility, pass the saved artifact with `--feasibility <feasibility-gate.json|controller-feasibility-verdict.json>`. `modeling-plan` carries that verdict as `feasibilityEvidence` and prints a `feasibility:` line in the text report with status, verdict, score, artifact path, and the most important blocker or warning. Feasibility warnings downgrade method readiness and add an explicit pre-execution acceptance/repair requirement; feasibility blockers become method-selection blockers. This keeps the state machine from discarding earlier evidence about unsupported variables, fragile event support, semantic implausibility, or leakage when it reaches method planning or repair.

The planner does not treat prediction and inference as interchangeable. For example, a survey-weighted explanatory question keeps survey-design policy and design-aware statistical methods ahead of plain sklearn models; a prediction request adds sklearn model candidates with train/test and calibration requirements.
Use `--prior-run <stats-run.json|ml-run.json>` to feed the previous execution posture back into planning. A blocked survey stats run routes to a survey-aware `paper-run`, exploratory standard-table output routes back through method/spec binding, failed or invalid bindings route to repair/review, and locally validated ML output stops for stronger validation design before deployment-style claims.

Use `research analysis-manifest --run-dir <dir>` after `stats-run` or `ml-run` to create `analysis-run-manifest.json`, a compact packet record with run kind, run status, result posture, artifact completeness, feasibility readiness, method-decision readiness, companion readiness, hashes, and next action. Add `--require-ready` in benchmark or promotion scripts to fail unless the run is `local_review_ready`. For stats runs, missing feasibility evidence now keeps the packet `exploratory_only`; attach a parent `feasibility-gate.json`, run through `analysis-run`, or provide modeling-plan feasibility evidence before promotion. Feasibility warnings from the parent `modeling-plan.json` or `feasibility-gate.json` also downgrade the manifest to `exploratory_only`; blocked or unverifiable feasibility evidence blocks promotion. Critical stats-QA warnings also keep a stats packet exploratory, including unresolved semantic plausibility warnings, complete-case attrition, selected-variable missingness burden, weak sample/event support, survival/competing-risk/recurrent-event warnings for censoring context, RMST or CIF horizon support, proportional-hazards diagnostics, competing-event accounting, risk-set support, recurrent-event burden, and longitudinal/repeated-measures warnings for cluster support, residual/fitted-value evidence, GLMM calibration/optimization, and sphericity. The same lifecycle gate covers core inference, categorical, and correlation warnings for missing effect sizes, uncertainty intervals, orientation evidence, sparse cells, permutation/bootstrap sensitivity, source artifacts, normality/variance review, post-hoc contrasts, and influence sensitivity. Regression/GLM diagnostic warnings for parameter burden, collinearity, influence, heteroskedasticity, residual shape/pattern, separation, class balance, count overdispersion/offset support, positive-outcome GLM fit support, penalized-model inference/validation provenance, diagnostic positive-class orientation, diagnostic precision or sparse-cell warnings, prediction validation-design or subject-leakage warnings, weak prediction class support, non-probability score boundaries, unstable prediction bootstrap/slice evidence, missing figure manifests, required figure-family gaps, or rendered-figure QA problems are lifecycle-critical. Causal and quasi-experimental warnings are also lifecycle-critical: unresolved treatment/time orientation, post-treatment adjustment screens, residual-confounding sensitivity, propensity or causal overlap/effective sample size, matching or weight-tail instability, DiD parallel-trends/pretrend review, ITS autocorrelation, RDD cutoff-density/covariate-continuity screens, IV first-stage/exclusion/balance evidence, target-trial gaps, and AIPW/entropy diagnostics all keep the packet exploratory until repaired or explicitly justified. Missing-data, reliability/agreement, PCA/clustering, multiple-comparison, and power warnings now do the same when mechanism screens, imputation variability/distribution checks, IPW stability, reliability uncertainty, proportional-bias evidence, component/cluster support, adjusted-p-value artifacts, or observed-versus-required sample support are weak or missing. For binary classification ML, calibration evidence is a required manifest artifact before local review readiness.

For stats runs, manifest readiness now includes method-decision readiness. `local_review_ready` requires the requested method to be classified as the data-preferred primary route by `method-decision-support.json`; fallback-only or sensitivity-only methods remain `exploratory_only` even when they executed successfully and were bound to a method-selection artifact. The manifest reads embedded preflight evidence first, then falls back to standalone `method-decision-support.json` and `stats-preflight.json` artifacts for older or repaired packets. This prevents a technically successful equal-variance `t-test`, ordinary Cox run with competing-event coding, or unpenalized sparse logistic run from being promoted when the preflight-supported primary route is different.
Methods-aware QA enforces the same method-decision evidence through a dedicated `method-decision-readiness` check. Preferred primary methods pass the check; blocked decisions block the run; missing, fallback-only, sensitivity-only, or not-recommended method decisions keep the packet in `needs_methods_review` until the preferred route is run or the deviation is justified.
`research run-inspect` prints the same method-decision status in the unified lifecycle view, so operators do not have to open individual preflight files to learn whether the executed model was primary evidence or only exploratory/sensitivity evidence.
The same manifest command also accepts an `ml-compare` directory containing `comparison.json` and `model-review-card.md`; `--require-ready` then requires `baseline_comparison_ready` plus the review-card artifact.
Use `research analysis-benchmark --run-dir <dir> --run-dir <dir> --require-ready --out benchmark.json --report benchmark.md` to check multiple stats, ML, or ML-comparison directories through the same manifest readiness gate. The benchmark reports route coverage across `stats`, `ml`, and `ml-comparison`, per-route readiness, artifact completeness, interpretation-boundary checks, and an explicit narrow-versus-multi-route coverage posture. Add `--require-multi-route` in promotion scripts when a single passing route should not count as benchmark maturity. This is the preferred gate for golden stats/ML route promotion.
Benchmark reports include `feasibility-readiness`, `qa-readiness`, `critical-stats-qa-warnings`, `method-decision-readiness`, and `method-decision-consistency` as first-class checks. Blocked or unverifiable feasibility evidence fails the benchmark; warning-level or missing feasibility evidence warns and keeps stats manifests out of `local_review_ready` until feasibility-gate or analysis-run evidence is attached, accepted, or repaired. Analysis manifests split warning-level stats QA into `criticalWarningChecks` and `advisoryWarningChecks`, with `warningCounts` recording total, critical, and advisory counts; critical warnings are promotion-blocking, while advisory warnings remain visible without by themselves blocking local review. Critical stats-QA warning names are printed in JSON, compact text, and Markdown benchmark output so an agent-runner can repair the exact issue rather than digging through nested artifacts. Blocked stats method decisions fail the benchmark; fallback-only, sensitivity-only, not-recommended, or missing method-decision evidence warns even when `--require-ready` is not used. Non-route warning checks now produce a repair-or-justify next action, even outside strict `--require-ready` mode. Contradictory method-decision evidence across embedded stats-run, sidecar, or preflight artifacts also warns and keeps stats manifests out of `local_review_ready` until the packet is regenerated from one coherent decision source.

For standard-table statistics, `research analysis-run` composes the golden route in one bounded command while preserving intermediate artifacts: initial `feasibility-gate.json`, `modeling-plan.json`, `stats-run/`, `feasibility-trial.json`, `analysis-run-manifest.json`, and `modeling-plan-after-prior.json`. It accepts `--method-selection` and `--analysis-spec` and can enforce `--require-bound` so benchmark or paper-like runs fail unless execution is tied to upstream method/spec evidence. The pre-execution feasibility gate is fed into both modeling plans, so warning/block evidence from dataset fitness checks remains active before and after the stats run. If that gate blocks, `analysis-run` stops before `stats-run` by default after writing the feasibility and modeling artifacts; use `--allow-blocked-feasibility` only for explicit negative/debug runs where a failed or invalid stats packet is the intended output. The feasibility trial records requested versus observed variables, complete-case fraction, typed blocker codes, and semantic plausibility issue codes so a user-suggested or agent-suggested idea is explicitly marked feasible, needs methods review, or blocked before promotion. Stats preflight also emits a named `selected-variable-semantic-plausibility` check, which keeps impossible range/coding failures attached to execution packets and rerun inspection. It also accepts `--literature <literature-search.json>` to copy MedBrevia search evidence into the run and produce `literature-qa.json` / `literature-qa.md` against the generated reader-facing paper when one exists. It is intentionally limited to the stats route for now; survey-aware paper generation remains under `paper-run`.
`research golden-run` wraps this route with method QA, manuscript generation, unified run inspection, benchmark, and a consolidated `golden-run.json/.md`. The consolidated packet now includes a `finalReadiness` summary with blocker/warning counts, method QA, manuscript QA, feasibility readiness/verdict, stats QA readiness, benchmark status, route coverage, and figure QA status/counts/failing IDs so a runner can see feasibility and visual-artifact problems without opening nested inspection JSON.
`research run-inspect` and `research golden-run` also emit `recommendedCommands`. These are executable recovery commands for the next controller step, such as rerunning figure QA against `figures.json`, refreshing method QA, rebuilding an analysis manifest, or rerunning unified inspection. This keeps readiness reports actionable for autonomous runners instead of leaving them as status-only summaries.
For `diagnostic-accuracy`, `analysis-run` also writes a concise `paper.md` and `paper-qa.json` at the analysis-run root. This diagnostic paper wrapper consumes the stats-run estimates, thresholds, intervals, QA posture, and manifest readiness; it is intended for local review and does not replace a full survey-aware or externally validated diagnostic paper workflow.

When `--table` or `--table-summary` is supplied, the planner derives row count, feature count, target class count, maximum missingness, small-sample status, and high-dimensional status. These evidence fields affect ranking: small or high-missingness tables downgrade high-capacity ML, and high missingness emits a blocking policy for diagnostics/sensitivity before interpretation.

## Dataset Exploration Mode

Use `research explore` before a protocol exists, when the task is to understand a dataset, map variables, find plausible associations, and propose research questions:

```bash
agenteer research explore \
  --data ./rows.csv \
  --target hba1c \
  --out-dir ./exploration \
  --max-pairs 25 \
  --json
```

Exploration writes `exploration.json`, `exploration-report.md`, and `candidate-questions.json`. The output includes table summary, variable roles, ranked unadjusted associations, candidate research questions, QA checks, limitations, and artifact hashes. When `--target` is supplied, the report and JSON foreground target-centered associations/questions separately from the broader background correlation map.

Candidate questions are not ranked by association strength alone. Each candidate includes a `routeIntent`, `taxonomy`, `researchInterestScore`, `primaryQuestionUse`, `taxonomyEvidence`, `whyThisQuestion`, and optional `avoidAsPrimaryQuestion` reason. This separates likely duplicate/proxy relationships and expected same-domain biomarker signals from more useful public-health candidates such as plausible risk factors, social/demographic determinants, or surprising cross-domain signals. `taxonomyEvidence` records the taxonomy version, matched rule ids, matched terms, score adjustments, and rejected category candidates so the ranking can be audited and overridden. `routeIntent` separates data-quality review, explanatory association, prediction, diagnosis, causal-design review, and descriptive profiling before the question reaches modeling.

The Markdown report starts with `Recommended Next Question`, which is the concise operator view over the longer signal map and question agenda.

The JSON also includes an `explorationBurden` section and question-level `promotionStatus`. This records how many pairs were tested, target-centered pair count, multiplicity risk, high-missingness variables, sparse categorical variables, survey/design candidate columns, possible target leakage/proxy pairs, and whether each candidate is currently a `promotable_hypothesis`, `needs_methods_review`, or `blocked`. The burden object also emits `promotionClearance`: `clear_for_handoff`, `hold_for_methods_review`, or `stop`.

The posture is always hypothesis generation. Associations are unadjusted and should not be treated as confirmatory evidence. Before any paper or inference, promote one candidate question into `method-select` / `modeling-plan`, add design constraints and covariates, review missingness and sparse cells, and account for survey design or clustering when applicable.

Use `research explore-promote` to create that handoff safely:

```bash
agenteer research explore-promote \
  --exploration ./exploration/exploration.json \
  --question question_01_288de2dac7 \
  --methods-review-note "Reviewed low-N and proxy risk; handoff is for planning only." \
  --out ./exploration/handoff.json \
  --json
```

The handoff refuses blocked questions and requires a methods-review note when clearance is `hold_for_methods_review`.

Pass the handoff directly into `modeling-plan` when moving from exploration to analysis design:

```bash
agenteer research modeling-plan \
  --exploration-handoff ./exploration/handoff.json \
  --survey \
  --json
```

The planner reads the candidate question, target/outcome seed, table path when available, route intent, source exploration hash, blocker list, and review status from the handoff. Held handoffs remain visible as warnings after methods review; held handoffs without a review note and blocked handoffs stop the plan.

The handoff also includes an `analysisSpecCandidate`. This is not executable by itself. It is the pre-spec bridge that records route intent, research question, estimand boundary, source population, outcome/exposure, excluded variables pending review, design requirements, suggested model family, required pre-execution checks, and exploration provenance. Use it to author or validate a real AnalysisSpec before runner execution.

`explore-plan` is the stricter bridge when the next step should be a formal planning artifact rather than a loose handoff:

```bash
agenteer research explore-plan \
  --exploration ./exploration/exploration.json \
  --question question_01_abcd1234 \
  --dataset mimic \
  --methods-review-note "Reviewed exploratory multiplicity and proxy-variable risk; planning only." \
  --out ./exploration/formal-plan.json \
  --json
```

The output contains a formal plan, an AnalysisSpec V2 draft, validation status, blockers, warnings, required pre-execution checks, and recommended next commands. This makes exploration useful for hypothesis generation without letting unadjusted correlation search become an executable study by accident.

The feasibility gate is method-family aware before execution. It rejects logistic routes with continuous-looking outcomes, count models with negative or non-integer outcomes, positive GLMs with zero/negative outcomes, categorical tests with continuous-looking inputs, propensity routes with nonbinary treatment variables or fewer than 5 complete-case treated/control rows in either arm, diagnostic-accuracy routes without binary reference/index inputs, and ordinary survival routes with invalid time/event domains. It also checks selected-variable complete-case retention: extreme attrition rejects inferential modeling, while high attrition downgrades the study to exploratory-only until missingness, imputation, or variable-selection policy is reviewed. Propensity routes with fewer than 20 complete-case rows in either arm are exploratory-only until the cohort, exposure definition, or method is revised. Logistic, propensity, and 2x2 categorical routes also inspect the complete-case binary outcome-by-exposure table; zero or sparse event/non-event cells downgrade the idea to exploratory-only before adjusted, causal, or comparative claims can be promoted. Grouped survival routes inspect complete-case events by comparison group; zero-event or sparse-event groups keep log-rank, Cox, recurrent-event, and cumulative-incidence contrasts exploratory until the cohort or endpoint has adequate event support. Regression preflight also checks categorical/discrete predictor support, blocking one-row levels and warning on sparse modeled levels before they become separated or non-reproducible adjusted estimates. Binary logistic preflight checks analysis-complete minority-class rows per modeled parameter after categorical expansion, so an adjusted model with adequate marginal event counts can still be blocked when most event rows are missing required treatment, covariate, timing, or design variables. Direct `stats-run` writes a `binary-outcome-marginal-event-support` warning when marginal and complete-case event counts diverge, and it blocks on the analysis-complete count when inference would be under-supported. During ordinary regression execution, the runner screens the expanded design matrix for exact rank deficiency or severe numerical ill-conditioning and blocks classical coefficient inference before fitting. During ordinary logistic execution, it also screens discrete predictor levels that perfectly predict the binary outcome and blocks maximum-likelihood logistic inference with a typed separation issue. These checks happen before `stats-run` promotes any estimates, so a bad method choice becomes a feasibility/design problem rather than a failed model artifact.

Modeling plans now run the same semantic plausibility screen used by the feasibility gate for target, declared role, inferred role, and candidate prediction-feature columns. Implausible analysis-role values, such as ages above 120, BMI values beyond human ranges, binary flags outside 0/1, invalid propensity/probability values, or negative event counts, block the plan before it can be treated as ready. Nonblocking aggregate plausibility warnings still downgrade readiness and add a required unit/coding audit, so bypassing `feasibility-gate` does not let an impossible-looking dataset proceed through method selection as if it were valid.

Event-dependent feasibility now separates marginal endpoint counts from analysis-complete endpoint counts. When the local row scan can inspect required variables, `analysisEventCount` and `analysisNonEventCount` are the counts used for event support, power, reviewer-risk, and method-suitability decisions. Local CSV/JSON scans inspect all parsed rows for selected variables, so sorted files do not lose events merely because they appear after the first few thousand rows. This catches common false feasibility where the dataset has enough events overall, but most event rows are missing treatment, timing, covariate, or design variables needed by the requested model.

Two-by-two categorical feasibility also uses analysis-complete levels when possible. Fisher exact, McNemar, and Cochran-Armitage trend methods are no longer rejected simply because the raw profile contains pending, screened-only, or otherwise incomplete marginal categories that do not enter the complete-case table. Those marginal categories stay visible as data-quality context, but method suitability is tied to the analyzable table.

The same analyzed-level policy applies to logistic, propensity, diagnostic-accuracy, and binary survival-event feasibility. Raw pending, unknown, or indeterminate categories are not allowed to make a valid complete-case binary endpoint, treatment, diagnostic reference/index, or event indicator look invalid, but nonbinary analyzed rows still block before execution.

Grouped numeric and correlation feasibility also inspect analyzed variation. ANOVA/t-test/Kruskal-style routes need at least two complete-case groups and a varying complete-case outcome. Pearson/Spearman/Kendall/partial-correlation routes need complete-case variation in every requested numeric input. Marginal variation in rows that cannot enter the method is not treated as feasibility evidence.

Count, positive-outcome, and survival time-domain feasibility now use complete-case numeric summaries too. Poisson/negative-binomial routes require integer-like nonnegative analyzed counts, Gamma/inverse-Gaussian routes require strictly positive analyzed outcomes, and survival routes require nonnegative analyzed follow-up time. This avoids false method rejection from marginal invalid values in rows excluded by missing required analysis variables while still surfacing those values through profiling and semantic QA.

Paired and repeated-measure feasibility is checked before execution, but method-specific estimability failures still flow through the stats runner so the packet carries the right repeated-measure diagnostics. Missing repeated variables, duplicate repeated variables, nonnumeric Friedman inputs, nonbinary Cochran's Q inputs, absent clusters, or absent repeated exposure support block at preflight. Degenerate paired differences, no Friedman within-subject variation, no Cochran's Q discordance, and no long-form repeated-measures outcome variation are flagged by feasibility and then returned as explicit blocked method diagnostics with the method's normal QA codes.

Clustered longitudinal routes now receive the same feasibility treatment before model execution. Mixed models, GEE, binary GLMM, and repeated-measures ANOVA require an id/cluster role with at least eight complete-case clusters and repeated complete-case observations without singleton clusters. Tables that are cross-sectional after complete-case filtering are blocked before they can produce misleading clustered-model artifacts.

When a longitudinal route is requested with a valid `--cluster` or `--id`, method-decision support now treats the repeated structure as part of the data shape. For repeated numeric outcomes, linear mixed models and GEE become primary candidates while ordinary linear regression is fallback-only because it ignores within-subject dependence. For repeated binary outcomes, marginal GEE is primary and binary GLMM is a bounded subject-specific sensitivity.

Measurement, unsupervised, and utility routes have explicit feasibility gates too. Kappa requires two varying rater/classifier columns; ICC, Cronbach alpha, PCA, clustering validation, and Bland-Altman require enough varying numeric inputs; p-value correction rejects values outside `[0, 1]`; and power/sample-size rejects nonpositive effect sizes or invalid target-power settings before execution.

Causal and quasi-experimental routes now check design support at the feasibility layer. Difference-in-differences must have binary treatment, recognized pre/post timing, and nonempty treatment-by-period cells; event-study DiD must have treatment support in each period; interrupted time series must have numeric time with pre/post segment support; regression discontinuity must have a finite cutoff with rows on both sides; and IV must have numeric outcome/exposure variation plus instrument variation.

Missing-data routes now distinguish invalid requests from bounded no-op diagnostics. Local MICE blocks when no usable numeric selected variable has missingness. Missingness IPW blocks when there is no target or target missingness is too extreme to model, but a target with no missing values returns a succeeded no-op diagnostic with `MISSINGNESS_IPW_NO_OUTCOME_MISSING` and warning-level QA rather than a pretend weighted analysis. Complete-case/MNAR sensitivity requires a numeric target plus actual missingness in the target or selected analysis variables.

Prediction evaluation now requires real score support at feasibility time. The outcome must be binary and the score/exposure must be numeric with enough complete-case support. Binary or very low-resolution test indicators are routed to diagnostic-accuracy as the primary framing; if `prediction-evaluation` is run anyway, it is treated as sensitivity-only and receives prediction-score-resolution QA rather than being promoted as validated model-score evidence.

Identifier-like columns are also blocked from substantive roles. Patient, participant, admission, stay, encounter, row, and high-cardinality `_id` columns may be used for linkage, pairing, clustering, subject-level leakage checks, or validation splits, but they cannot be bound as outcomes, exposures, groups, covariates, endpoints, or ordinary prediction features. Prediction plans fail readiness when an undeclared identifier-like feature is visible, forcing the user or runner to exclude it or declare it as an id/cluster role before model development or validation.

Outcome-derived and post-index variables are blocked before method planning as well. Prediction feature sets and adjustment roles are screened for future/outcome markers such as death, mortality, readmission, later/subsequent events, follow-up, discharge disposition, post-operative complications, length of stay, labels, endpoints, and target-name tokens. Baseline or history qualifiers are allowed for legitimate pre-index comorbidities such as prior MI, prior stroke, or baseline heart failure, but unqualified future/outcome-like fields block readiness until the feature set or covariate set is repaired.

Every stats preflight also writes `method-decision-support.json` and `method-decision-support.md`. This is a data-shaped method-choice artifact, separate from the user's requested command. It records observed row support, outcome/exposure types, event coding, group support, parameter burden, primary methods, sensitivity methods, fallback methods, and whether the requested method is preferred, acceptable only as a sensitivity, fallback-only, not recommended, or blocked. QA includes `method-decision-support-artifact` and `method-decision-alignment`, so a successful run can still warn when, for example, an equal-variance `t-test` was requested but the data-preferred primary route is Welch's t-test with Mann-Whitney sensitivity, or when a skewed/sparse group comparison should use Mann-Whitney or Kruskal-Wallis as the primary route before mean-scale claims.

The same method-decision artifact now covers measurement and exploratory routes. Kappa records rater level counts and high-cardinality risk; ICC, Cronbach alpha, PCA, clustering, and Bland-Altman record how many requested variables are usable/varying numeric columns; clustering records requested `k` and complete rows per cluster; p-value correction records p-value count and invalid-domain count; and power/sample-size records effect-size, target-power, and observed sample support. These signals are visible in `dataSignals` before looking at the estimate table, so a route with invalid raters, invalid p-values, too few numeric features, or unsupported cluster count is blocked or downgraded before it can be promoted.

`model-diagnostics` is now classified by the same selector instead of being treated as a generic executable route. Preflight requires an outcome and exposure/group term, blocks unordered categorical outcomes before Python fitting, records the inferred diagnostic family (`linear-regression`, `logistic-regression`, or `poisson-regression`), and records complete rows, modeled parameters, row-per-parameter support, and binary event-per-parameter support. A valid standalone diagnostics run is therefore preferred diagnostic evidence; an unsupported diagnostics request is blocked rather than surfacing as a late runtime error.

Causal and quasi-experimental methods also emit data-shaped design-selection signals before execution. Propensity matching/weighting, overlap weighting, entropy balancing, and AIPW record treatment level support, semantic treated/control orientation, treated/control row counts, minority-treatment support, covariate count, treatment-model parameter burden, row-per-parameter support, and minority-treatment row-per-parameter support. DiD/event-study routes record treatment and post/period support; DiD and ITS post indicators record semantic pre/post orientation, pre/post row counts, and the evidence used to orient labels such as `pre/post`, `before/after`, or numeric `0/1`. ITS records time and intervention support; RDD records below/above-cutoff support; IV records instrument and exposure variation. These signals keep causal estimators from being selected as ordinary regression simply because the table has a numeric outcome.

For categorical tests, feasibility scanning records complete-case joint counts for selected variable pairs. This lets preflight choose Fisher exact over chi-square for sparse 2x2 tables before Python execution, keep chi-square primary for adequately supported tables, and record categorical table shape, minimum observed count, minimum expected count, and sparse expected-cell counts in method-decision support. Executed categorical tests also write `categorical-cell-diagnostics.csv` with expected counts, residuals, chi-square contribution, zero-cell, and sparse-cell flags so sparse-cell policy and cell-level interpretation are inspectable. Independent 2x2 chi-square and Fisher routes now write `categorical-effect-bootstrap.csv` with multinomial cell-count bootstrap intervals for risk difference, risk ratio, and odds ratio. Binary categorical effect estimates orient common semantic labels before calculation, so `dead`/`survived`, `treated`/`control`, `event`/`no event`, and similar pairs do not invert the reported positive outcome or exposed group by alphabetical crosstab order. QA warns when a 2x2 route has to rely on lexical fallback ordering, because the exposed and event levels are not self-evident.

For correlation tests, preflight records complete-case numeric shape for the outcome/exposure pair. Pearson is treated as the primary route only when the variables look sufficiently continuous and linear-scale; Spearman becomes primary for skew/outlier-prone monotonic questions; Kendall becomes primary for small or tie-heavy/ordinal-like numeric support. The decision support records unique counts, skewness, outlier fractions, and rank/Kendall routing flags so a successful Pearson run can still be held as fallback evidence when the data shape says it should be. Executed correlation routes now write `correlation-source.csv`, `correlation-influence.csv`, and `correlation-bootstrap.csv`; QA checks source-pair provenance, leave-one-out influence sensitivity, and row-bootstrap interval support.

For count models, preflight records complete-case mean, variance, variance/mean ratio, zero fraction, invalid count support, ordered-category support, and score-versus-count naming evidence. Poisson is primary only for ordinary count-like distributions; negative binomial becomes primary for overdispersed outcomes; zero-inflated Poisson becomes primary for high zero support; zero-inflated negative binomial becomes primary when excess zeros and overdispersion coexist. Poisson requests are downgraded to fallback when these diagnostics point elsewhere. Count regression is blocked for ordered score-like endpoints such as severity scores, grades, stages, scales, or ratings unless the column is clearly a count endpoint; those analyses should route to ordinal or multinomial methods instead.

For positive continuous outcomes, preflight records positivity, skewness, and coefficient of variation. Linear regression remains primary for near-symmetric positive outcomes, Gamma GLM becomes primary for skewed positive outcomes where multiplicative mean-ratio interpretation is plausible, and inverse-Gaussian GLM is reserved for more extreme skew/variation. Integer count-like outcomes are intentionally excluded from this routing and are sent through the count-model decision path.

For continuous regression, preflight records complete-case outcome N, unique count, skewness, outlier fraction, and robust/quantile route flags. Ordinary least squares is primary only when the outcome shape is acceptable and no stronger count or positive-GLM route is indicated. Robust linear regression becomes primary for outlier-prone outcomes; quantile regression becomes primary for strongly skewed, coarse, or tie-heavy continuous outcomes when a positive-outcome GLM is not the better family. Executed robust-linear runs write `robust-linear-weights.csv` and `robust-linear-weights.png`, exposing Huber observation weights, downweighted-row counts, minimum weight, residual scale, and maximum standardized residual so an outlier-resistant claim is inspectable. Executed median quantile-regression runs write `quantile-fit-summary.csv` and `quantile-residual-balance.png`, with pinball loss and observed-at-or-below-fitted residual balance checks so median-effect claims are audited on the quantile scale rather than treated as ordinary mean regression.

For multi-category outcomes, preflight records level count, minimum level support, sparse level count, high-cardinality status, ordering evidence, and the recommended categorical model. Ordered numeric category codes or recognized ordered labels route to ordinal logistic as the primary adjusted model, with multinomial logistic as a sensitivity. Nominal labels route to multinomial logistic as primary and keep ordinal logistic fallback-only until category order is explicitly justified. Sparse or high-cardinality outcomes route to descriptive/collapsing review before modeled contrasts.

For binary outcomes, preflight distinguishes existing score/probability columns from ordinary predictors. Probability-like or score-name-like numeric exposures route primarily to `prediction-evaluation` so discrimination, calibration, Brier score, thresholds, decision curves, and slice performance are reviewed before any model coefficient claims. Uncalibrated score-like variables remain evaluable for discrimination, but calibration and Brier interpretation are explicitly bounded. Binary or very low-resolution index variables are not treated as validated model scores; they route primarily to diagnostic/test accuracy, with prediction metrics only as sensitivity evidence. Logistic regression becomes a calibration/association sensitivity for well-resolved scores. Ordinary numeric predictors still route to logistic-family modeling, with penalized logistic preferred when minority-class rows per expanded modeled parameter are sparse. Binary model execution now writes explicit outcome-orientation metadata for logistic, penalized logistic, prediction evaluation, diagnostic accuracy, and binary sensitivity routes. Common labels such as `dead/survived`, `case/control`, `event/no event`, `detected/not detected`, and `treated/untreated` are oriented semantically; ambiguous two-level labels still run but receive a QA warning to confirm the event or positive class before any directional interpretation.

For independent group comparisons, preflight records complete-case N, complete-case group count, minimum group size, outcome unique count, skewness, outlier fraction, and a rank-route flag. Eligibility for two-group versus multi-group tests uses the complete-case analytic rows, not marginal dataset levels, so groups with no analyzable outcome support are excluded before method choice. Welch remains the two-group primary only when support and shape are acceptable; Mann-Whitney becomes primary when the outcome is sparse, skewed, tie-heavy, or outlier-prone. Directional two-group estimates orient common semantic labels before reporting `group_b - group_a`, so `exposed/unexposed`, `case/control`, `treated/untreated`, and similar pairs get a stable reference/comparison interpretation even if the data rows arrive in the opposite order. Lexical fallback orientation remains executable but gets a QA warning because the intended reference level is not self-evident. ANOVA remains the multi-group primary only when support and shape are acceptable; Kruskal-Wallis becomes primary when rank-based omnibus evidence is safer. Adjusted comparisons keep ANCOVA primary but require rank/robust/quantile sensitivities when outcome shape makes mean-scale interpretation fragile.

For paired numeric comparisons, preflight records complete-case pair count, paired-difference unique count, skewness, outlier fraction, zero-difference fraction, and a signed-rank route flag. Paired t-test remains primary only when the difference distribution is acceptable; Wilcoxon signed-rank becomes primary when paired differences are small-sample, skewed, tie-heavy, zero-heavy, or outlier-prone. A constant individual repeated-measure column does not by itself block paired tests when the paired differences have estimable variation; truly degenerate paired differences still block with paired-difference diagnostics.

## Trust Layer And Continuous Benchmarks

Use the trust layer after `stats-run`, `ml-run`, `analysis-run`, `paper-run`, or manifest-backed `dataset-run`:

```bash
agenteer research method-qa --run-dir ./run --out ./run/method-qa.json --report ./run/method-qa.md
agenteer research manuscript --run-dir ./run
agenteer research study-critic --run-dir ./run --stage final --panel default --autonomy aggressive
agenteer research run-inspect --run-dir ./run --out ./run/run-inspection.json --report ./run/run-inspection.md
```

`method-qa` is intentionally methods-aware rather than only artifact-aware. It checks numerical stability, separation, sparse or overfit models, missingness, regression diagnostics, effect-size consistency, claims, semantic plausibility, survey design, and artifact completeness. The stats packet also runs estimate-table sanity checks before manuscript generation: non-finite numeric fields, impossible p-values/probabilities/correlations/counts/ratios, reversed intervals, estimates outside confidence intervals, and log-scale/effect-scale mismatches are surfaced as QA failures. It also reads `stats-preflight.json` and `feasibility-trial.json` when present, so a blocked feasibility or method-suitability preflight remains visible during later run inspection instead of being hidden behind a successful-looking stats packet.

`run-inspect` is the preferred single status command for a run. It summarizes readiness, blockers, cost, provenance, paper/manuscript paths, feasibility readiness, QA, lifecycle state, figure QA readiness, rerun stability, and next action. Feasibility warnings from the manifest become inspection warnings; blocked or unverifiable feasibility evidence becomes an inspection blocker. If a `figures.json` manifest exists without `figure-qa.json`, inspection warns explicitly; failed figure QA blocks the unified readiness view so broken or missing visual artifacts cannot hide inside an otherwise polished manuscript.
Inspection next actions are ordered by blocking specificity: failed figure QA, failed or missing stats QA, blocked feasibility, missing companion analyses, blocked runner capability, and external-review blockers are reported before generic methods-review guidance. This makes the one-line `next` action suitable for autonomous repair loops instead of only human browsing.

Method binding is not enough by itself. A stats run can be bound to an `AnalysisSpec` or method-selection artifact and still be downgraded to an exploratory method-choice posture when preflight classifies the requested route as a sensitivity, fallback, or not-recommended method. In that case the run is useful as sensitivity evidence, but the preferred primary method must be executed or explicitly justified before the analysis can become local-review-ready.

The analysis manifest also reads `stats-qa.json` as evidence, not just as an artifact path. A missing, unreadable, or failing stats QA file blocks local-review readiness even if all required files exist and the method is otherwise bound. Warning-level QA remains visible for local review, but failed estimate sanity, posture, figure, or method-contract checks must be repaired before promotion.

`method-qa` applies the same rule directly. If `stats-qa.json` fails, is missing, or is unreadable for a stats run, methods-aware QA records a blocker-level `stats-qa-readiness` check. This keeps manuscript generation, run inspection, and benchmark readiness aligned on the same source of truth.

`study-critic` is the true external-review gate. It builds a cold review packet from the run directory, sends it to configured reviewers, writes `review-panel.json`, adjudicates accepted/rejected findings into `review-adjudication.json`, and writes `review-response.json` plus `state-reentry.json`. The default panel is Anthropic Opus 4.7 plus DeepSeek v4 Pro for a different perspective from the main runner; `--panel strict` adds OpenAI GPT-5.4 and Gemini 3.1 Pro. Use `--panel deepseek-dual` for two independent DeepSeek v4 Pro reviewers when cost discipline matters but you still want panel disagreement and role separation. Use `--panel deepseek-triple` for coding-heavy medical packets where a third phenotype/code reviewer should inspect diagnosis/procedure definitions separately from methods and reproducibility. Reviewer failures such as exhausted API credit are recorded as unavailable reviewer results rather than crashing the whole panel. The default autonomy is aggressive, with `--autonomy balanced` and `--autonomy conservative` available when reviewer feedback should require more human approval.

For regression pressure over the whole research machine, use:

```bash
agenteer research benchmark-suite-run --suite ./.loop-memory/golden --out-dir ./.loop-memory/benchmark-history
agenteer research benchmark-trend --history ./.loop-memory/benchmark-history
```

This continuous benchmark path scores packet completeness, methods correctness, QA pass/fail, rerun stability, cost discipline, report readability, and artifact integrity. It should run before major changes to the research-machine layer are promoted.

## Adapters

Classification adapters include logistic regression, k-nearest neighbors, SVM, decision tree, random forest, extra trees, gradient boosting, AdaBoost, and MLP. XGBoost, LightGBM, and CatBoost are registered as optional adapters and report the missing package instead of breaking the registry.

Regression adapters include linear regression, ridge, lasso, elastic net, SVR, k-nearest neighbors, decision tree, random forest, extra trees, gradient boosting, AdaBoost, and MLP. Optional XGBoost, LightGBM, and CatBoost regressors follow the same missing-dependency behavior.

Clustering adapters include k-means, mini-batch k-means, agglomerative clustering, DBSCAN, Gaussian mixture models, and spectral clustering.

Dimensionality reduction adapters include PCA, truncated SVD, NMF, and t-SNE. UMAP is registered as optional.

`research ml-run` writes a typed `resultPosture` into `ml-run.json` and renders it in text output. Supervised models with held-out or cross-validation evidence are marked `locally_validated_prediction`; clustering and dimensionality reduction remain `exploratory_unsupervised`; missing optional backends are marked `optional_dependency_missing`. These postures are deliberately conservative: local ML metrics support model comparison and debugging, not external validation, clinical deployment, causal claims, or fairness claims without additional evidence.

`research ml-compare` writes a `comparisonPosture`. A comparison is `baseline_comparison_ready` only when at least two scored models succeed and at least one transparent baseline is present; binary classification comparisons also require calibration artifacts from successful runs. Otherwise it is `insufficient_comparison`. It also writes `model-review-card.md` with intended use, intended non-use, validation boundary, leakage review, missing evidence, and ranked models.

## Classical Statistics Runner

`research stats-run` executes common table-based statistical methods through the local Python analysis runtime:

- `descriptive`
- `t-test`
- `welch-t-test`
- `paired-t-test`
- `anova`
- `ancova`
- `mann-whitney`
- `wilcoxon`
- `kruskal-wallis`
- `friedman`
- `chi-square`
- `fisher-exact`
- `mcnemar`
- `cochran-armitage-trend`
- `pearson`
- `spearman`
- `kendall`
- `partial-correlation`
- `linear-regression`
- `robust-linear-regression`
- `logistic-regression`
- `ordinal-logistic-regression`
- `multinomial-logistic-regression`
- `poisson-regression`
- `negative-binomial-regression`
- `zero-inflated-poisson`
- `zero-inflated-negative-binomial`
- `gamma-glm`
- `inverse-gaussian-glm`
- `quantile-regression`
- `penalized-linear-regression`
- `penalized-logistic-regression`
- `kaplan-meier`
- `log-rank`
- `cox-proportional-hazards`
- `stratified-cox`
- `aalen-johansen-cif`
- `recurrent-event-rate`
- `recurrent-event-cox`
- `linear-mixed-model`
- `gee`
- `repeated-measures-anova`
- `overlap-weighting`
- `entropy-balancing`
- `doubly-robust-aipw`
- `difference-in-differences`
- `event-study-did`
- `interrupted-time-series`
- `regression-discontinuity`
- `instrumental-variables-2sls`
- `target-trial-emulation-spec`
- `unmeasured-confounding-sensitivity`
- `prediction-evaluation`
- `missingness-summary`
- `multiple-imputation-mice`
- `missingness-ipw`
- `complete-case-sensitivity`
- `mnar-sensitivity`
- `model-diagnostics`
- `reliability-kappa`
- `intraclass-correlation`
- `cronbach-alpha`
- `pca`
- `clustering-validation`
- `bland-altman`
- `multiple-comparison-correction`
- `power-sample-size`
- `diagnostic-accuracy`
- `propensity-score-matching`
- `propensity-score-weighting`

Methods that need a validated backend not present in the local runtime are registered with an explicit capability posture rather than silently promoted:

- `fine-gray`: executable as a bounded local subdistribution partial-likelihood approximation. It records subdistribution hazard ratios, risk sets, baseline subdistribution hazard, predictions, and Aalen-Johansen CIF context, but it does not estimate IPCW censoring weights and still requires confirmation in R `cmprsk`/`riskRegression` or another validated competing-risk backend before confirmatory claims.

Methods with bounded local approximations run, but they carry explicit warnings and should not be promoted as confirmatory without a dedicated methods review:

- `time-varying-cox`: executable as start/stop counting-process Cox when `--start`, `--stop`, and `--id` are supplied, because interval validity, subject support, and subject-clustered robust variance are then inspectable. Without interval columns it falls back to the bounded predictor-by-log(time) extended Cox approximation; with interval columns but no subject id, treat it as needing methods review before repeated-subject claims.
- `recurrent-event-cox`: executable as an Andersen-Gill-style start/stop recurrent-event Cox route when `--start`, `--stop`, `--event`, `--id`, and `--exposure` are supplied. It writes interval, subject-burden, model-frame, design-matrix, risk-score, hazard-ratio, subject-clustered robust-variance, and figure artifacts. It still does not provide frailty, ordered-event PWP, or negative-binomial recurrent-event inference.
- `generalized-mixed-model`: executable for binary random-intercept models through `statsmodels` variational Bayes, not a production GLMM reference backend.

Example:

```bash
agenteer research stats-run \
  --method logistic-regression \
  --data ./rows.csv \
  --outcome elevated_hba1c \
  --exposure bmi \
  --covariate age \
  --covariate sex \
  --out-dir ./stats-run \
  --json
```

Each run writes `stats-run.json`, `stats-summary.json`, `estimates.csv`, `diagnostics.json`, `figures.json`, `stats-report.md`, and `stats-qa.json` with artifact hashes. Methods with natural visual checks also write PNG figures such as histograms, missingness bars, group boxplots, contingency heatmaps, scatterplots, residual plots, Kaplan-Meier curves, cumulative-incidence curves, PCA scree plots, Bland-Altman plots, and ROC curves. The figure manifest records title, caption, source columns, source-data CSV path, format, and figure QA so visual artifacts can be audited like tables. Every rendered figure gets a companion `figure-source-data/<figure-id>.csv` file containing the available raw source columns from the analyzed table, and `figure-qa` verifies that the file exists, is nonempty, and covers the declared source columns. Standard-table execution also performs generic semantic plausibility checks for common clinical/data variables such as age, BMI, HbA1c, blood pressure, binary outcomes, counts, and length of stay; impossible values block execution and implausible aggregate means force methods review. Direct stats preflight also blocks obvious outcome-derived or post-index predictors, adjustment terms, exact-match variables, instruments, and grouping variables so a generated spec cannot fit on mortality flags, readmissions, discharge disposition, length of stay, complications, endpoints, labels, or future events unless the role is explicitly a diagnostic/prediction score route that expects an index test. The same preflight records complete-case retention and selected-variable missingness burden for every requested method, so an otherwise successful regression, survival model, group test, or causal contrast remains in methods-review posture when it relies on heavy complete-case attrition.

The run declares a typed `resultPosture` such as `exploratory_standard_table`, `bound_standard_table`, `exploratory_survey_approximation`, `blocked_survey_required`, or `invalid_binding`. It also writes a `runnerCapability` object into `stats-run.json`, `method-contract.json`, the report, and QA checks. `executable` methods can proceed to ordinary packet review; `bounded_approximation` methods force a promotion warning and required follow-up; `backend_blocked` methods force a QA failure. Method QA, `run-inspect`, `analysis-run-manifest`, paper lifecycle, and controller completion audit all consume this same capability field, so a downstream packet cannot become local-review-ready by ignoring a bounded or backend-blocked runner. This runner is for standard table methods and does not replace survey-aware `paper-run --backend r-survey` when complex survey variance is required.

Modeling plans apply an executable-first policy. A bounded method can remain primary when the question explicitly asks for that design, such as event-study DiD or time-varying Cox, or when no same-intent executable route exists. The planner now treats interval-expanded survival roles as materially different evidence: when `start`, `stop`, and `id` are declared for a time-to-event association, `time-varying-cox` is selected with an interval-aware command hint and executable request-level runner capability; without those roles it remains a bounded fallback requiring method review. If a bounded method is only suggested by literature/context signals and an executable same-intent method is available, the executable method becomes primary and the bounded method is retained as a reviewed sensitivity route.

`analysis-run-manifest.json` also records `companionReadiness`. Modeling plans can distinguish advisory sensitivity suggestions from enforced companion requirements. When a plan marks companion readiness as enforced, the primary run is downgraded to exploratory until sibling companion runs, such as `missingness-summary`, `power-sample-size`, `model-diagnostics`, or `aalen-johansen-cif`, exist and succeeded. Regression/GLM plans with meaningful adjustment or parameter burden now require `model-diagnostics` before promotion so collinearity, influence, residual, heteroskedasticity, separation/convergence, overdispersion, and overfitting checks are not left as after-the-fact manuscript QA. Ordinary linear-model diagnostics include a Breusch-Pagan screen; a low p-value emits `MODEL_DIAGNOSTICS_HETEROSKEDASTICITY` or `LINEAR_MODEL_HETEROSKEDASTICITY`. Linear diagnostics also write `model-qq.csv`/`model-qq.png` and record a quadratic residual-vs-fitted screen; a warning emits `MODEL_DIAGNOSTICS_RESIDUAL_PATTERN` or `LINEAR_MODEL_RESIDUAL_PATTERN` so visible curvature cannot be hidden behind a converged linear coefficient table. Direct `linear-regression` estimate rows also include HC3 robust-standard-error, robust p-value, and robust confidence-interval sensitivity fields, but heteroskedasticity or residual-pattern warnings should still trigger transformation, nonlinear terms, weighted/sensitivity review, or a different model family before relying on ordinary least-squares inference.

Method contracts are now active QA inputs, not documentation-only records. `method-contract-artifact-coverage` checks that required table files named in the `StatisticalMethodSpec` actually appear in the run artifact inventory, while conditional files such as subject-cluster robust variance remain conditional on the design. `method-contract-figure-coverage` checks required figure families by semantic alias, so a contract-level requirement such as `hazard-ratio-forest`, `outcome-distribution-by-group`, or `covariate-balance-love-plot` must be represented by the concrete runner artifact for that method rather than merely increasing the figure count. `method-contract-qa-gate-coverage` maps declared contract QA gates to concrete emitted QA checks, so abstract gates such as `effect-size`, `positivity`, `calibration`, or `proportional-hazards-or-competing-risk-review` must be represented by an executable check or explicit alias. `research stats-contracts` also includes static `requiredArgumentAudit`, `tableArtifactAudit`, `figureAliasAudit`, `figureSourceColumnAudit`, and `qaGateAliasAudit` sections, allowing planners, tests, and reviewers to detect unsupported required method inputs, missing core table expectations, unmapped required figure families, unknown figure source roles, or abstract QA gates before running a heavy method smoke test. The required-argument audit maps contract phrases such as `time or stop`, `cluster or id`, and `running variable` to enforceable stats-run request fields; unsupported phrases are treated as contract drift rather than silently passing. The table audit distinguishes required file artifacts, conditional file artifacts, and narrative/embedded expectations such as "hazard ratio table" or "missingness table"; only required concrete files are enforced by runtime artifact coverage. The source-column audit maps figure roles such as `outcome`, `exposure`, `covariates`, `variables`, or `running variable` back to recognized stats-run request fields so a misspelled role cannot silently break figure provenance. Critical QA warnings from `analysis-semantic-plausibility`, `analysis-complete-case-retention`, `analysis-variable-missingness-burden`, core sample-size support, survival event support, propensity/causal overlap or effective-sample-size support, `figure-manifest`, `figure-quality`, `method-contract-figure-coverage`, or `method-contract-qa-gate-coverage` now keep `analysis-run-manifest.json` at `exploratory_only`; a run cannot be `local_review_ready` while implausible units/coding, heavy complete-case attrition, high selected-variable missingness, weak support, missing figure manifests, required figure-family gaps, unrepresented contract QA gates, or figure QA are unresolved. This is intentionally stricter for rank routes, where `nonparametric-bootstrap.csv` is required for Mann-Whitney and Wilcoxon reviewability.

Regression and GLM routes also emit source artifacts for auditability: `regression-model-frame.csv` records the complete-case variables used by the run, `regression-design-matrix.csv` records the encoded model matrix, and `regression-predictions.csv` records fitted values, residuals where meaningful, predicted classes, and class probabilities where available. This applies to classical, penalized, ordinal, multinomial, count, and positive-outcome GLM routes so a later QA pass can inspect what was actually modeled instead of relying only on coefficient tables.

The feasibility gate now catches common regression failures before execution. It estimates the modeled parameter count after categorical expansion, checks rows per parameter, checks binary minority-class rows per parameter, verifies complete-case variation in every modeled term, warns on sparse/high-cardinality categorical levels, and blocks ordinary logistic regression when a complete-case predictor level perfectly separates events from non-events. These checks complement stats preflight and make the controller reject fragile adjusted models earlier in the state machine.

Feasibility also performs model-term integrity checks before a statistical runner is invoked. Duplicate covariates, primary role reuse inside adjustment/exact-match covariates, obvious outcome-derived or post-index terms, and obvious post-baseline treatment/procedure/care adjustment terms are blockers at the study-idea stage. This is intentionally heuristic, but it prevents plans that adjust for `post_discharge_los`, `death_date`, readmission/follow-up flags, endpoint labels, `in_hospital_procedure`, post-treatment therapy, or similar variables from looking ready just because a model could technically be fit. Baseline/history-qualified terms such as prior MI or history of surgery remain allowed, with the expectation that the protocol proves timing.

Controller feasibility uses the same shared plausibility and identifier hygiene helpers as the standalone feasibility gate. The controller verdict now surfaces comprehensive feasibility domains, warnings, and blockers as individual `methodChecks`, so controller inspection and model-runner packets can see concrete blockers such as leakage, low events-per-parameter, identifier misuse, or implausible values without digging through nested feasibility internals.
Controller dataset feasibility also writes `controller_dataset_semantic_audit_NNN.json/.md`, a dataset-wide semantic plausibility audit over every summarized column. Selected-role issues are promoted into feasibility blockers or warnings; unused-column issues remain visible as dataset warnings so a runner knows which variables need unit/coding review before selecting them in a future plan.

Method planning and `stats-run` preflight both estimate regression burden after categorical expansion, not just raw column count. A twelve-level site or facility covariate is treated as eleven modeled terms, so `modeling-plan` can recommend penalized regression, power/precision review, and model-diagnostics before the runner later blocks or downgrades an over-parameterized adjusted model. Binary-outcome plans and runs use minority-class rows per expanded candidate parameter, so ordinary logistic regression is not treated as stable simply because the event count looks adequate before dummy-variable expansion.

Additional argument conventions:

- Survival methods use `--time`, `--event`, optional `--group`, optional `--strata`, and repeated `--covariate`. `time-varying-cox` can instead use `--start` and `--stop` for interval-expanded counting-process data; `--id` is strongly recommended so repeated intervals can be audited by subject and `cox-cluster-robust-variance.csv` can be emitted. `log-rank` now supports two or more groups and reports the omnibus chi-square test with degrees of freedom rather than silently assuming only a binary comparison. Kaplan-Meier and log-rank routes write `survival-risk-table.csv` and `survival-risk-table.png` so the at-risk counts, cumulative events, cumulative censoring, and survival estimates at data-driven reporting horizons travel with every curve. They also write `survival-rmst.csv` and `survival-rmst.png`, which report restricted mean survival time through a common data-supported horizon `tau` with bootstrap percentile intervals and pairwise RMST differences when groups are present. RMST gives a nonparametric time-horizon summary that is easier to interpret than a hazard ratio and remains useful when proportional hazards are uncertain. Grouped Kaplan-Meier, log-rank, and cumulative-incidence outputs include QA for group-level event support so a curve/test with a zero-event comparison group cannot look ready without review. Cox-style preflight estimates events per modeled term after categorical expansion, so a multi-level site/facility adjustment cannot silently pass as one predictor. Cox execution also screens discrete predictor levels for zero or sparse events and blocks hazard-ratio fitting when any modeled level has no observed events. Cox routes write `cox-model-frame.csv`, `cox-design-matrix.csv`, `cox-risk-scores.csv`, and `cox-risk-strata.csv` so the complete-case rows, dummy-expanded predictors, fitted linear predictor, relative hazards, and event fractions by risk stratum are inspectable. Start/stop time-varying Cox additionally writes `time-varying-cox-intervals.csv`, `time-varying-cox-subject-summary.csv`, `time-varying-cox-interval-support.png`, and, when `--id` is supplied, `cox-cluster-robust-variance.csv`; QA checks interval validity, subject support, execution mode, robust variance, and whether the run used true interval data or the fallback log-time approximation. Cox routes also write `cox-risk-scores.png` for fitted-risk distribution review. Cox PH diagnostics still write `cox-ph-diagnostics.csv` and `cox-ph-diagnostics.png` from Schoenfeld-residual trend screening, alongside the predictor-by-log(time) PH approximation, so proportional-hazards review is inspectable instead of being only a JSON note.
- The research controller carries these same method-specific roles. `controller-init` and `controller-run` preserve diagnostic thresholds, weights, offsets, penalized-model tuning fields, and survival interval roles through feasibility, method-selection role hints where applicable, model-runner decision bundles, stats execution, and patch invalidation. Recurrent-event Cox is blocked before execution unless the interval roles required by the method contract are present.
- Recurrent-event routes now produce inspectable support rather than a single opaque denominator. `recurrent-event-rate` writes `recurrent-event-rate-summary.csv`, `recurrent-event-subject-summary.csv`, and `recurrent-event-rate-contrasts.csv`, records unique-subject support, recurrent-event subjects, subject-level event-count overdispersion, group stability, and log Poisson rate-ratio contrasts when a group is supplied. `recurrent-event-cox` uses `--start`, `--stop`, `--event`, `--id`, `--exposure`, and optional covariates to fit an Andersen-Gill-style start/stop PHReg route. It writes `recurrent-event-cox-intervals.csv`, `recurrent-event-cox-subject-summary.csv`, `cox-cluster-robust-variance.csv`, `recurrent-event-cox-hazard-ratios.png`, `recurrent-event-cox-interval-support.png`, and `recurrent-event-cox-subject-events.png`. QA checks interval validity, subject support, recurrent-event burden, artifacts, cluster-robust variance, and the remaining frailty/PWP boundary. This is stronger than aggregate rates, but it remains bounded local evidence until ordered-event PWP, frailty, or another dedicated recurrent-event sensitivity is reviewed when strong claims depend on within-subject recurrence structure.
- Repeated/clustered methods use `--cluster` or `--id`.
- Difference-in-differences and interrupted time series use `--post` or `--period`.
- Regression discontinuity uses `--running-variable` and `--cutoff`.
- Instrumental variables use `--instrument`.
- Penalized models use `--alpha-penalty` and `--l1-ratio`.
- Partial correlation uses repeated `--covariate` arguments and now checks residualized exposure/outcome support after adjustment. If the covariates fully explain the exposure or outcome, the run blocks instead of reporting an undefined adjusted correlation.

Core inference routes emit source/support tables for auditability. Two-sample and multi-group comparisons write `group-summary.csv` plus `analysis-values.csv`; eligible independent group comparisons also write `permutation-sensitivity.csv` with a deterministic label-permutation p-value so small-sample, skewed, or rank-routed results carry a nonparametric sensitivity check. Independent two-group estimates record group-orientation evidence before directional mean, median, and rank-biserial effects are interpreted. Mann-Whitney and Wilcoxon additionally write `nonparametric-bootstrap.csv` and attach row-bootstrap percentile intervals for their distributional effect estimates, including median differences and rank-biserial contrasts. Paired routes write `paired-differences.csv`; Friedman writes `repeated-measure-source.csv`; Cochran's Q writes `repeated-binary-source.csv`; categorical association routes write `contingency-table.csv`, `categorical-source.csv`, and `categorical-cell-diagnostics.csv`; chi-square also writes `categorical-permutation-sensitivity.csv` with a fixed-margin outcome-label permutation p-value for the global independence statistic; independent 2x2 categorical routes also write `categorical-effect-bootstrap.csv` with bootstrap uncertainty for risk difference, risk ratio, and odds ratio. Binary categorical source tables and effect estimates record orientation evidence so semantic positive outcomes and exposed groups are explicit rather than inferred from lexical crosstab order, and QA downgrades lexical-only orientation to a review warning. McNemar writes `mcnemar-paired-effect.csv` with paired transition counts, baseline/follow-up positive fractions, paired risk difference, and a matched-pair interval so paired binary changes are not reported as p-values alone. Cochran-Armitage trend requires explicit ordered exposure evidence before execution, reindexes recognized ordinal labels into semantic order rather than alphabetical crosstab order, orients binary outcome labels semantically, writes `trend-support.csv` with ordered group risks, null-expected successes, and trend components, then writes `trend-effect-bootstrap.csv` with row-bootstrap intervals for the ordered risk slope and low-to-high risk contrast. McNemar records discordant-pair support and uses exact binomial inference when discordant pairs are small, switching to asymptotic continuity-corrected inference only when support is larger. Omnibus multi-group and repeated-measure routes also report scale-appropriate effect sizes: ANOVA/ANCOVA add eta-squared, partial eta-squared, and omega-squared where estimable; Kruskal-Wallis adds epsilon-squared; Friedman adds Kendall's W; Cochran's Q adds a repeated-binary W-style effect-size scale. They write `omnibus-effect-bootstrap.csv` with stratified group-row or subject-row bootstrap intervals for those effect sizes, and they write `posthoc-contrasts.csv` with Holm-adjusted pairwise contrasts when pairwise interpretation is needed. These files make complete-case exclusions, group support, group orientation, repeated-measure rows, categorical cell construction, categorical orientation, sparse expected cells, residual/contribution drivers, ordered trend support, permutation sensitivity, bootstrap uncertainty, omnibus effect-size scale, and multiplicity-adjusted follow-up comparisons inspectable alongside assumption diagnostics.

Reliability routes leave uncertainty artifacts. `reliability-kappa` reports an approximate confidence interval and contingency table. `intraclass-correlation` and `cronbach-alpha` now write `reliability-bootstrap.csv`, attach row-bootstrap percentile intervals to the estimate row, and emit QA checks for interval presence and successful bootstrap support.

Power and precision review compares the declared effect-size target with the data actually available. `power-sample-size` still reports the required n per group for the planned two-sample effect, but when an observed variable is supplied it also records `observed_sample_size_support`, the observed-to-required sample-size ratio, and QA status. Binary outcomes additionally keep the event-support gate so a dataset can be large in rows but still underpowered for adjusted event modeling.

Correlation routes write `correlation-source.csv`, `correlation-influence.csv`, and `correlation-bootstrap.csv` in addition to `correlation-scatter.png`. The source table records the exact complete pairs used for the estimate; partial correlation includes the residualized values used after adjustment. The influence table reruns the correlation after dropping each pair once and QA flags estimates that are highly sensitive to a single observation. The bootstrap table provides row-resampling interval evidence for Pearson, Spearman, Kendall, and residualized partial-correlation routes, which is especially useful when the chosen route is rank-based or the sample is sensitive to individual pairs.

The runner is intentionally conservative. Successful execution does not mean publication readiness. Fine-Gray, time-varying Cox fallback runs, and binary GLMM routes emit bounded-approximation QA warnings requiring dedicated backend/methods review before confirmatory claims. Start/stop time-varying and recurrent-event Cox routes now emit subject-clustered sandwich variance when `--id` is supplied, but ordered-event, frailty, and dedicated recurrent-event sensitivities remain follow-up items when the scientific claim depends on within-subject recurrence structure. Penalized models run, but their QA warns that shrinkage coefficients are not classical inference and need bootstrap or post-selection methods before inferential claims.

Count-model routes also run distribution-suitability preflight. They block negative or non-integer analyzed count outcomes, block score-like ordered endpoints from being treated as event counts, warn when invalid marginal count values exist outside analyzed complete-case rows, warn when Poisson is visibly overdispersed before fitting, warn when standard Poisson/negative-binomial routes see high zero fractions that may need a zero-inflated or hurdle sensitivity model, and warn when negative-binomial regression lacks overdispersion support. For incidence-rate or person-time models, pass `--offset <positive_exposure_or_person_time_column>`; feasibility and runner preflight both verify that the analyzed offset values are numeric and strictly positive before the runner fits a log-offset model, records the offset distribution in diagnostics, and labels exponentiated coefficients as incidence-rate ratios. Supplied analysis weights are validated on analyzed complete-case rows as numeric nonnegative weights with positive total weight; zero-weight rows are a review warning rather than a hard failure when positive total weight remains. If no offset is supplied, count-model QA emits `model-count-offset-validity=warning` so unoffset count ratios cannot be mistaken for person-time incidence-rate ratios. Count models now also write `count-fit-summary.csv`, `count-zero-diagnostics.csv`, and `count-observed-vs-fitted.png`; QA checks observed-versus-fitted mean calibration and observed-versus-expected zero counts so a count model cannot be treated as adequate from coefficients alone. These warnings are method-selection evidence, not automatic proof that a more complex count model is valid.

Count and positive-outcome method decisions use the same analyzed complete-case evidence as execution preflight. Distribution summaries for count-model zero fraction, mean, variance/mean ratio, and positive-GLM skew/CV are computed from weighted complete-case value counts rather than capped expanded samples, so repeated common values in larger local files do not distort method selection. The same weighted complete-case numeric-shape support is used for prediction-score routing, group comparisons, correlations, continuous regression, and measurement routes; large repeated score or lab values therefore preserve their true analyzed N, unique-value support, skewness, and outlier evidence in `method-decision-support.json`. Numeric domain and threshold gates are weighted too: temporal validation split sizes, RDD cutoff-side support, survival zero/negative/unique-time counts, p-value invalid counts, count non-integer support, and positive-GLM positivity checks use exact complete-case value counts instead of capped sample expansions. Invalid marginal count or nonpositive positive-GLM rows that are excluded by required covariate/design missingness remain visible as warnings, but they do not stop the selector from choosing Poisson, negative-binomial, Gamma, or inverse-Gaussian routes when the analyzed rows support that family. Invalid analyzed rows still block or downgrade the route before estimates can be promoted.

Zero-inflated count output is component-aware. Count-process rows carry `component: count` and count rate ratios. Inflation-process rows, such as `inflate_const`, carry `component: inflation` and a zero-inflation odds ratio for the structural-zero process, not a rate ratio. ZINB ancillary rows carry `component: dispersion` and are not interpreted as effect estimates. Method QA enforces this with the `zero-inflated-component-semantics` check.

Positive continuous log-link GLMs use mean-ratio semantics. Gamma and inverse-Gaussian rows expose `mean_ratio`, `mean_ratio_ci_low`, and `mean_ratio_ci_high`, and intentionally do not expose count-model `rate_ratio` fields. Runner preflight blocks nonpositive analyzed outcomes and records a warning, not a hard block, when nonpositive marginal rows are excluded before complete-case fitting. Method QA enforces mean-ratio semantics with `positive-glm-mean-ratio-semantics` so skewed-cost or length-of-stay models are not described with count-rate language. Executed Gamma and inverse-Gaussian runs also write `positive-glm-fit-summary.csv` and `positive-glm-observed-vs-fitted.png`; these artifacts record observed/fitted mean calibration, relative-error summaries, and Pearson residual summaries when available.

Positive continuous GLM preflight also records distribution support, not just positivity. Gamma/inverse-Gaussian routes warn with `STATS_POSITIVE_GLM_DISTRIBUTION_SUPPORT_WEAK` when the complete-case outcome is strictly positive but has weak skew/coefficient-of-variation evidence. Those runs can still be useful sensitivity checks, but near-symmetric positive outcomes should be compared against linear, robust-linear, or quantile routes before strong claims.

Adjusted regression routes record a `design_matrix_rank_screen` diagnostic. Classical regression methods fail with `REGRESSION_DESIGN_MATRIX_RANK_DEFICIENT` when the expanded model matrix is rank deficient or severely ill-conditioned, for example when a covariate is a deterministic copy of the exposure. Penalized routes may continue with a warning because prediction can remain useful, but their coefficient interpretation stays bounded by the penalized-inference caveat.

Penalized linear and logistic regression now fit elastic-net models on standardized predictors and write the penalty-scale evidence needed to interpret the run. Each penalized route emits `penalized-feature-scaling.csv`, `penalized-coefficient-profile.csv`, `penalized-cv-summary.csv`, `penalized-coefficients.png`, and `penalized-cv-performance.png`. The coefficient table is explicitly on a per-standard-deviation feature scale, and QA requires feature-scaling, coefficient-profile, and bounded K-fold validation artifacts before treating the result as reviewable. These routes remain prediction/stability tools; they do not report classical post-selection p-values or confidence intervals.

Multinomial logistic output now preserves inferential fields for each non-baseline outcome contrast: coefficient, standard error, p-value, confidence interval, odds ratio, odds-ratio interval, baseline outcome level, and compared outcome level. It also writes `multinomial-confusion-matrix.csv`, `multinomial-class-metrics.csv`, `multinomial-confusion-matrix.png`, and `multinomial-class-metrics.png`, with QA gates for class support and prediction coverage. This keeps multinomial routes aligned with the rest of the regression family and prevents class-specific claims from relying only on coefficient rows.

Ordinal logistic output separates predictor effects from cutpoint/threshold parameters. Predictor rows carry `parameter_role: predictor`, cumulative odds ratios, and odds-ratio intervals. Threshold rows carry `parameter_role: threshold` and an explicit interpretation note, and they intentionally do not receive odds ratios. Method QA enforces this separation with the `ordinal-parameter-roles` check so cutpoints cannot be mistaken for exposure effects. The route now also writes `ordinal-proportional-odds-check.csv` and `ordinal-proportional-odds.png`, using threshold-specific binary splits as a bounded local screen for proportional-odds slope instability before cumulative-odds claims are promoted.

Ordinary logistic regression records both a single-term `separation_screen` and a post-fit `fitted_probability_screen`. The fitted-probability screen warns with `LOGISTIC_FITTED_PROBABILITY_BOUNDARY` when fitted probabilities concentrate near 0 or 1, which can happen with multivariable quasi-separation, deterministic labels, or a brittle risk score even when no single dummy level perfectly predicts the outcome. Treat those runs as local diagnostics until a simplified, penalized, or externally validated model is reviewed.

Mean-comparison QA now checks variance-balance and normality evidence for parametric group-comparison routes. Equal-variance `t-test`, `anova`, and `ancova` runs fail packet QA when variance imbalance is severe; moderate imbalance remains a warning. Welch remains the supported two-group route for unequal variances. Kruskal-Wallis records the same spread evidence and warns, rather than passes silently, when large spread differences may change rank-test interpretation.

Longitudinal routes now preflight the subject/cluster structure before fitting. Mixed-model, GEE, binary GLMM, and repeated-measures ANOVA runs block when the declared `--cluster`/`--id` column has fewer than eight complete-case clusters, when every subject is observed only once, or when any singleton complete-case subject would make the local repeated/clustered route unreliable. Repeated-measures ANOVA also verifies that the within-subject factor has at least two complete-case levels. These checks create typed preflight issues such as `STATS_LONGITUDINAL_CLUSTER_SUPPORT_LOW` and `STATS_LONGITUDINAL_OBSERVATION_SUPPORT_LOW` so a study plan can reroute to descriptive/non-clustered analysis or repair the longitudinal table before model fitting. Successful longitudinal routes write `longitudinal-cluster-summary.csv` and `longitudinal-cluster-size.png`, so the actual complete-case subject/cluster distribution is inspectable. Linear mixed models record random-intercept variance, residual variance, and ICC; GEE uses an explicit exchangeable working correlation and records its dependence parameter.

Mixed-model, GEE, and binary GLMM runs write `longitudinal-model-frame.csv`, `longitudinal-design-matrix.csv`, `longitudinal-fitted-values.csv`, `longitudinal-cluster-residuals.csv`, and `longitudinal-observed-vs-fitted.png`, making complete-case rows, dummy expansion, fitted values/probabilities, residuals, and cluster-level residual behavior reviewable before interpretation. Binary GLMM runs additionally write `glmm-random-effects.csv`, `glmm-cluster-calibration.csv`, `glmm-random-effects.png`, and `glmm-cluster-calibration.png`; QA requires these random-intercept and calibration artifacts while still warning that the local backend is a variational-Bayes approximation that should be confirmed in a dedicated GLMM backend before strong claims. Repeated-measures ANOVA now writes `repeated-measures-source.csv`, `repeated-measures-cell-summary.csv`, `repeated-measures-sphericity.csv`, and `repeated-measures-profile.png`; it blocks duplicate subject-by-level rows, records an approximate Mauchly/Greenhouse-Geisser sphericity screen for three or more levels, and emits QA gates so uncorrected repeated-measures ANOVA does not look paper-ready without sphericity review. QA gates warn when this correlation/sphericity evidence or the cluster-summary artifact is missing.

Missing-data routes are also gated for method fit. The local MICE route is numeric-only and now blocks when none of the usable numeric variables actually has missing values, rather than producing an imputation artifact that cannot change the analysis. It writes multiple seeded imputed datasets by default (`imputed-data-1.csv` through `imputed-data-5.csv`), keeps `imputed-data.csv` as the first imputation for backward compatibility, and writes `imputation-summary.csv` with per-variable imputation counts and between-imputation variability across cells that were missing. It also writes `imputation-distribution-check.csv` and `imputation-distribution-shift.png`, comparing observed values with imputed cell means by standardized mean difference and KS diagnostics, so an imputation that fills cells but shifts distributions sharply is flagged by QA. Use `--imputations <n>` to change the number of local imputations. Mixed-type imputation and Rubin-pooled downstream inference remain dedicated-backend problems; the local route records warnings when requested nonnumeric variables are excluded and when results are not pooled for confirmatory inference.

For time-to-event planning, multistate event columns are treated as competing-risk evidence rather than ordinary binary censoring. If the event column appears to contain codes such as `0=censored`, `1=event of interest`, and `2=death/competing event`, modeling guidance routes the primary executable pass to `aalen-johansen-cif`, marks ordinary Cox/Kaplan-Meier routes as blocked until an event-specific recode is reviewed, and treats Fine-Gray as a sensitivity route that must be backend-confirmed before subdistribution-hazard claims are promoted.

`fine-gray` writes `fine-gray-model-frame.csv`, `fine-gray-design-matrix.csv`, `fine-gray-risk-sets.csv`, `fine-gray-baseline-subdistribution.csv`, `fine-gray-predictions.csv`, and `cumulative-incidence.csv`. It renders a subdistribution hazard-ratio forest plot, a baseline cumulative-incidence plot, and a nonparametric Aalen-Johansen CIF context plot. QA checks convergence, competing-risk accounting, risk-set support, artifact completeness, and the approximation boundary.

`aalen-johansen-cif` now writes more than the step curve. Each run emits `cumulative-incidence.csv`, `cumulative-incidence-horizon-summary.csv`, and, for grouped analyses, `cumulative-incidence-contrasts.csv`. The horizon summary reports at-risk counts plus cumulative target events, competing events, all events, censoring, cumulative incidence, and event fractions at data-supported reporting horizons. It also renders `cumulative-incidence-horizon-summary.png` and adds QA gates for horizon support so competing-risk papers can report event-count tables alongside CIF curves instead of relying only on a final curve value.

For binary time-to-event runs, preflight records event count, censoring count, unique time support, zero-time rows, grouped event support, event-orientation evidence, and Cox events-per-predictor support. Event indicators use semantic binary orientation when possible, so `dead/alive`, `event/no event`, `detected/not detected`, and numeric 0/1 coding count events consistently before grouped support is assessed. Ambiguous two-level event labels remain executable but receive an orientation warning. Grouped log-rank is primary only when every group has adequate event support; otherwise Kaplan-Meier/risk-table review stays primary and log-rank is fallback-only. Cox is primary only when event-per-predictor support is adequate; warning-level event support keeps Cox as sensitivity evidence even if the local runner can execute it.

`diagnostic-accuracy` expects a binary reference outcome in `--outcome` and a binary test/screen indicator in `--exposure` or `--group`. If the reference or index-test columns are continuous, pass `--outcome-threshold <n>` and/or `--exposure-threshold <n>` to derive positive indicators using `>= threshold`. It reports a confusion matrix, sensitivity, specificity, PPV, NPV, likelihood ratios, accuracy, prevalence, and Wilson intervals for sensitivity/specificity/PPV/NPV. Treat PPV/NPV as prevalence-dependent and local to the analyzed table unless external validation is supplied. Ambiguous reference/index positive-class orientation, missing interval evidence, or sparse diagnostic cells are lifecycle-critical warnings; they keep the run exploratory until the positive class, precision evidence, or sparse-cell instability is repaired or explicitly justified.
Diagnostic accuracy planning follows the STARD framing: keep the reference standard and index test explicit, preserve participant/sampling context, and do not promote screening recommendations from local accuracy estimates alone. STARD-AI adds additional dataset-practice, algorithmic-bias, and fairness disclosure pressure for AI-centered diagnostic tests; Agenteer's current diagnostic route is a classical standard-table route, not a deployment-ready AI diagnostic workflow.

`propensity-score-matching` and `propensity-score-weighting` are executable causal-design-review routes. Use `--exposure` or `--group` for the binary treatment/exposure, `--outcome` for the endpoint, and repeat `--covariate` for baseline confounders. Matching supports `--match-ratio`, `--caliper` in standard deviations of the logit propensity score, `--replacement`, and repeated `--exact-covariate` constraints. Weighting supports `--estimand ATE|ATT`, `--trim-threshold`, and `--no-stabilize-weights`. Both routes estimate propensity scores with a logistic treatment model and write standardized mean-difference balance diagnostics before and after adjustment.

Propensity routes now run treatment-model preflight before fitting. The preflight blocks nonbinary treatment coding unless a numeric `--exposure-threshold` is supplied, blocks thresholds that create only treated or only control rows, orients semantic treatment labels such as `treated/untreated` before counting group support, checks treatment-group support, checks baseline covariate variation, warns when exact-match constraints or high-cardinality covariates make matching fragile, and flags adjustment or exact-match covariate names that look like post-treatment, outcome, follow-up, death, readmission, or length-of-stay variables. Obvious outcome-derived or post-index adjustment sets are blocked before propensity-score artifacts are produced; weaker timing concerns remain QA warnings that require protocol review. This name-based timing screen is deliberately conservative: it can catch obvious bad adjustment sets, but it does not prove that unflagged variables are baseline measurements. These checks are written into `stats-preflight.json` / `stats-preflight.md` and converted to typed issue codes before any propensity-score artifact is produced.

Example:

```bash
agenteer research stats-run \
  --method propensity-score-matching \
  --data ./rows.csv \
  --outcome mortality \
  --exposure treatment \
  --covariate age \
  --covariate sex \
  --covariate severity_score \
  --exact-covariate sex \
  --match-ratio 1 \
  --caliper 0.2 \
  --out-dir ./psm-run \
  --json
```

Propensity runs write the standard stats artifacts plus `propensity-scores.csv`, `propensity-overlap.csv`, and `balance.csv`. Matching also writes `matched-pairs.csv` and `propensity-match-quality.csv`, and renders `propensity-match-distances.png` so reviewers can inspect matched-treated retention, control reuse, and logit-distance pressure relative to the caliper. Weighting also writes `weights.csv` and `propensity-weight-summary.csv`, and renders `propensity-weight-distribution.png` so reviewers can inspect weight tails and effective-sample-size loss. Their `resultPosture` is `causal_design_review_required`, not `bound_standard_table`, because a successful match or IPTW run still cannot prove a causal effect by itself. Causal and propensity QA always includes explicit `temporality`, `no-post-treatment-adjustment`, and `unmeasured-confounding-sensitivity` gates where applicable; these gates usually remain warnings until target-trial timing and residual-confounding sensitivity evidence are reviewed. Before causal language, review the target-trial framing, treatment time zero, measured confounder set, post-treatment variable exclusion, positivity/overlap, residual imbalance, missingness, and sensitivity to unmeasured confounding.

Overlap weighting now has the same weight-stability evidence as IPTW. `overlap-weighting` writes `causal-weights.csv`, `causal-weight-summary.csv`, `propensity-overlap.csv`, and `balance.csv`, then renders `causal-weight-distribution.png` alongside the Love plot and propensity-overlap plot. QA checks the weight-summary artifact, weight-distribution figure, weight tails, and effective-sample-size fraction so overlap-weighted estimates cannot be promoted from balance evidence alone.

AIPW is treated as an evidence-heavy causal-design estimator rather than a single magic coefficient. `doubly-robust-aipw` now writes `causal-weight-summary.csv`, `aipw-nuisance-predictions.csv`, `aipw-influence.csv`, and `aipw-component-summary.csv` in addition to measured-balance, causal-weight, and propensity-overlap artifacts. The estimate row includes an influence-function standard error and confidence interval, and the run renders `causal-weight-distribution.png` plus `aipw-contribution-distribution.png` so reviewers can inspect whether the doubly robust estimate is driven by heavy-tailed augmentation terms, weak overlap, or poor positivity.

Entropy balancing now exposes the actual moment constraints it is trying to satisfy. `entropy-balancing` writes `entropy-balance-constraints.csv`, `causal-weights.csv`, and `balance.csv`, records optimizer status/objective, maximum and mean absolute moment residuals, weight percentiles, maximum weight, and effective sample size, and renders `entropy-balance-constraints.png` plus `entropy-balance-weights.png`. QA requires the moment-constraint artifact and flags constraint residuals or unstable weight distributions before the ATT estimate can be treated as more than design-review evidence.

Unmeasured-confounding sensitivity is explicit about what it can and cannot show. `unmeasured-confounding-sensitivity` computes the observed binary risk ratio, a log risk-ratio interval, the point E-value, and the E-value for the confidence-limit closest to the null. It writes `unmeasured-confounding-sensitivity.csv` with the treated/control event table and contrast rows. QA keeps the effect-bound check at warning posture because an E-value is sensitivity evidence, not proof that unmeasured confounding is absent.

Missing-data sensitivity routes now leave durable evidence instead of narrative-only caveats. The method-decision layer records target missingness, selected-variable missingness, usable numeric missingness for local MICE, missingness-IPW predictor support, and MNAR scenario support before execution. `missingness-summary` remains the primary first route; MICE, missingness IPW, complete-case sensitivity, and MNAR sensitivity become sensitivity routes only when the observed missingness pattern supports them. If the target has no missingness, `missingness-ipw` remains not recommended rather than being mistaken for a useful weighted analysis. `missingness-ipw` writes `missingness-ipw.csv` into the artifact list, records missingness-model support, maximum weight, weight percentiles, effective sample size, effective sample-size fraction, and renders `missingness-ipw-weight-distribution.png` so unstable inverse-probability weights are visually inspectable. `complete-case-sensitivity` and `mnar-sensitivity` write `missingness-sensitivity.csv`, quantify available-case, complete-case, and delta-SD scenario means, record the mean range and standardized shift from the available-case estimate, and render `missingness-sensitivity.png`. QA requires the scenario/weight artifacts and flags large dependence on missing-data assumptions or unstable IPW support.

Quasi-experimental routes emit design-support artifacts rather than relying only on model coefficients. Difference-in-differences writes `did-cell-support.csv`, `did-contrast-summary.csv`, `did-outcome-by-period.png`, and `did-contrast-summary.png`, so the raw treated/control pre-post means, raw DiD contrast, and model interaction estimate are inspectable together. Event-study DiD writes `event-study-estimates.csv`, `event-study-period-support.csv`, `event-study-pretrend.csv`, `event-study.png`, `event-study-period-support.png`, and `event-study-pretrend.png`; QA records period support, non-reference pre-period estimates, and deterministic pretrend signals while still requiring human parallel-trends review. Binary treatment labels are oriented before DiD, event-study, propensity, overlap-weighting, entropy-balancing, and AIPW contrasts are interpreted, DiD/ITS pre-post labels are oriented before timing support is counted, and QA records the reference/control, treated/active, pre, and post levels. Interrupted time series writes `its-segment-support.csv`, `its-time-trend.csv`, `its-fitted-trend.csv`, `its-autocorrelation.csv`, `its-time-trend.png`, `its-fitted-trend.png`, and `its-residual-autocorrelation.png`; QA records pre/post unique time-point support, HAC lag choice, fitted trend evidence, Durbin-Watson and Ljung-Box/autocorrelation screens. Regression discontinuity writes `rdd-running-support.csv`, `rdd-fitted-values.csv`, `rdd-bandwidth-sensitivity.csv`, `rdd-cutoff-density.csv`, `rdd-covariate-continuity.csv`, `rdd-running-support.png`, `rdd-fitted-support.png`, `rdd-bandwidth-sensitivity.png`, and `rdd-covariate-continuity.png`; QA records cutoff-side support, fitted-value provenance, bandwidth sensitivity, simple cutoff-density balance, and covariate continuity screens. IV/2SLS writes `iv-first-stage.csv`, `iv-first-stage-support.csv`, `iv-reduced-form.csv`, `iv-endogeneity-diagnostics.csv`, `iv-covariate-balance.csv`, `iv-analysis-frame.csv`, `iv-first-stage-support.png`, `iv-first-stage-observed-vs-predicted.png`, `iv-reduced-form-coefficients.png`, and, when covariates are supplied, `iv-covariate-balance.png`. The IV diagnostics include partial first-stage F evidence, partial R-squared, fitted-treatment RMSE, reduced-form instrument evidence, residual-inclusion endogeneity screening, instrument-versus-covariate balance, and the exact analysis frame used for fitting. These source tables and figures make support, timing, cutoff, first-stage fit, reduced-form evidence, pretrend screens, serial-correlation risks, and covariate jumps inspectable, but they do not verify parallel trends, continuity, exclusion restriction, monotonicity, absence of cointerventions, or adequate time-series/model form by themselves.

Regression discontinuity now uses a side-specific local-linear cutoff specification and records sensitivity evidence instead of reporting only one global jump. Each RDD run writes `rdd-fitted-values.csv` with row-level fitted values and residuals, `rdd-bandwidth-sensitivity.csv` with cutoff estimates across symmetric bandwidths, `rdd-cutoff-density.csv` with a simple symmetric-window count-balance screen for possible manipulation, and `rdd-covariate-continuity.csv` with local-linear covariate jump screens at the cutoff. Matching figures show binned running-variable support, fitted side-specific trends, bandwidth sensitivity, and covariate continuity. QA requires those artifacts and keeps the result in methods-review posture because the density screen is not a formal McCrary test, covariate continuity is only a design screen, and bandwidth choice still requires design review.

If `--survey` is supplied, `stats-run` refuses execution unless `--allow-survey-approximation` is also supplied. The approximation flag records a warning issue and should be treated as exploratory, not paper-ready inference.
The runner emits typed issues such as sparse expected cells, low complete-case N, possible logistic separation/extreme log-odds, fitted logistic probability boundary warnings, regression non-convergence, Poisson overdispersion, poor propensity overlap, residual imbalance, unmatched treated rows, extreme IPTW weights, and trimmed non-overlap rows.

`prediction-evaluation` is more than an AUROC route. It writes ROC, precision-recall, calibration-bin, confusion-matrix, bootstrap-interval, validation-split, and decision-curve source tables plus matching figures where applicable. Probability-like scores also receive a logistic calibration intercept/slope screen, Brier score, calibration absolute error, percentile bootstrap intervals for AUROC/AUPRC/Brier/calibration error, and decision-curve net-benefit summaries against treat-all and treat-none reference strategies. By default, prediction evaluation is labeled as apparent/local performance because all complete rows are evaluated. For stronger validation provenance, use `--validation-column <split_column> --validation-value <heldout_or_external_value>` or `--validation-time <time_column> --validation-cutoff <n>`; temporal validation evaluates rows at or after the cutoff and records earlier rows as development/prior-reference support. Preflight records event/non-event counts inside the held-out or temporal evaluation split and blocks validation splits with only one outcome class, because discrimination, calibration, and threshold metrics are invalid there. Every run writes `prediction-validation-split.csv`, and QA warns when the design is only apparent. If `--id <subject_column>` is supplied, the run also writes `prediction-validation-subjects.csv` and QA fails patient-level validation claims when the same subject appears in both validation and non-validation rows. Use `--bootstrap-replicates <n>` to change the bounded interval run size; the default is 200 replicates. If `--group` is supplied, it also writes `prediction-slices.csv` and `prediction-slices.png` with subgroup AUROC/AUPRC, Brier score, calibration error, threshold metrics, support counts, and sparse/unstable-slice warnings. QA includes outcome-orientation, validation-design, subject-leakage, calibration-model, bootstrap-uncertainty, decision-curve, and slice-performance gates so a model cannot look complete solely because global discrimination is high. The lifecycle treats apparent-only validation, missing subject-leakage audit evidence, weak class support, non-probability scores used for calibration-like interpretation, unstable bootstrap intervals, and requested subgroup instability as critical warnings that must be repaired or explicitly justified before local-review readiness.

Agreement routes also record method-specific validity screens. `bland-altman` writes the source mean/difference table, limits of agreement, and an OLS proportional-bias screen of pair difference versus pair mean. A significant slope emits `BLAND_ALTMAN_PROPORTIONAL_BIAS` and a warning QA gate because constant limits of agreement may not summarize the full measurement range.

Unsupervised statistical routes standardize numeric features before fitting. `pca` writes `pca-feature-scaling.csv`, `pca-loadings.csv`, `pca-transformed.csv`, `pca-scree.png`, and `pca-scores.png`; loadings and scores therefore refer to z-score standardized complete cases, while the scaling artifact preserves the original means and standard deviations. `clustering-validation` runs K-means on the same standardized complete-case matrix and writes `cluster-feature-scaling.csv`, `cluster-profile.csv`, `cluster-labels.csv`, `cluster-size.png`, and a two-component `cluster-pca-projection.png` when possible. These artifacts are required for review because PCA and clustering can otherwise look meaningful solely because one variable has a larger unit scale.

Use `--method-selection <selection.json>` and `--analysis-spec <spec.json>` to bind a stats run back to upstream planning evidence. A method-selection mismatch, such as trying to run logistic regression from a t-test selection, fails before execution.

## Preprocessing

The bridge performs deterministic tabular preprocessing:

- numeric column detection
- median imputation for numeric features
- most-frequent imputation for categorical features
- one-hot encoding for categorical features
- optional standard scaling
- target leakage exclusion
- reproducible train/test split
- optional cross-validation

Preprocessing is fit only on training data for supervised runs through a scikit-learn pipeline.

## Metrics

Binary classification reports AUROC, AUPRC, accuracy, precision, recall/sensitivity, specificity, F1, confusion matrix, log loss, and Brier score when probabilities are available.
It also writes `calibration.csv` for binary probabilistic classifiers, with mean predicted probability and observed fraction positive by bin.

Multiclass classification reports accuracy, macro F1, weighted F1, per-class precision/recall/F1, confusion matrix, and log loss when probabilities are available.

Regression reports MAE, MSE, RMSE, R2, and adjusted R2 when feasible.

Clustering reports cluster count, noise count, silhouette, Davies-Bouldin, and Calinski-Harabasz when the fitted labels make those metrics valid.

Dimensionality reduction reports transformed shape and explained variance ratios where the estimator exposes them.

## Artifacts

Each run writes:

- `ml-config.json`
- `ml-run.json`
- `predictions.csv` for supervised models
- `calibration.csv` for binary probabilistic classification
- `transformed.csv` for clustering and dimensionality reduction
- `model.joblib` when serialization is supported and enabled
- `model-summary.json`

Each artifact is returned with a SHA-256 hash when available. Comparisons write `comparison.json` and keep each model run in a model-specific subdirectory.

## Explainability

The run output includes coefficients for linear/logistic estimators, feature importances for tree-based estimators, and permutation importance when feasible. SHAP is intentionally an extension point rather than a hard dependency; missing SHAP never blocks a run.

## Adding A Model Adapter

Add a manifest to `packages/cli/src/research-machine/ml/catalog.ts`, then add a factory branch in the Python bridge inside `packages/cli/src/research-machine/ml/runner.ts`. The adapter must declare compatible tasks, probability support, serialization support, explanation capabilities, default parameters, limitations, and optional dependency requirements. Add at least one synthetic-data test if the dependency is required by the default runtime; optional adapters should have missing-dependency tests instead.
