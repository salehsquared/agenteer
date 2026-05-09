import { getArchetypeManifest, getBackendManifest } from "./catalog.js";
import { stableHash } from "./runtime.js";
import type {
  AnalysisMethod,
  AnalysisMethodCategory,
  AnalysisSpecV2,
  BackendId,
  DataStructure,
  DatasetAdapterId,
  MachineIssue,
  MethodCandidate,
  MethodSelectionRequest,
  MethodSelectionResult,
  ModelFamily,
  OutcomeType,
  StudyArchetypeId,
  StudyDesign,
} from "./schemas.js";

type ExposureType = AnalysisMethod["exposureTypes"][number];
type MethodInput = Omit<AnalysisMethod, "schemaVersion" | "aliases" | "exposureTypes" | "artifactExpectations" | "missingDataRequirements" | "multiplicityRequirements" | "selection"> & {
  aliases?: string[];
  exposureTypes?: ExposureType[];
  artifactExpectations?: string[];
  missingDataRequirements?: string[];
  multiplicityRequirements?: string[];
  keywords: string[];
  antiKeywords?: string[];
  minScore?: number;
};

const defaultArtifacts = ["analysis.json", "method-report.md", "diagnostics.json"];

function method(input: MethodInput): AnalysisMethod {
  return {
    schemaVersion: 1,
    aliases: input.aliases ?? [],
    exposureTypes: input.exposureTypes ?? ["continuous", "binary", "categorical"],
    artifactExpectations: input.artifactExpectations ?? defaultArtifacts,
    missingDataRequirements: input.missingDataRequirements ?? ["missingness summary", "complete-case count"],
    multiplicityRequirements: input.multiplicityRequirements ?? [],
    selection: { keywords: input.keywords, antiKeywords: input.antiKeywords ?? [], minScore: input.minScore ?? 0.35 },
    ...input,
  };
}

const commonClaimGates = ["claim-safety", "effect-size-reporting", "methods-disclosure"];
const commonDiagnostics = ["sample-size", "missingness", "outlier-review"];

export const analysisMethodCatalog: AnalysisMethod[] = [
  method({
    id: "table-one-descriptive-summary",
    label: "Table 1 descriptive summary",
    category: "descriptive",
    modelFamily: "descriptive",
    purpose: "Summarize cohort demographics, outcomes, exposures, missingness, and baseline characteristics before inferential testing.",
    outcomeTypes: ["none", "continuous", "binary", "categorical"],
    studyDesigns: ["cross_sectional", "cohort", "randomized_trial", "case_control"],
    dataStructures: ["single_table", "complex_survey", "clustered"],
    compatibleBackends: ["duckdb-polars", "r-survey", "python-statsmodels"],
    implementationStatus: "contract-ready",
    requiredFields: ["analysis population", "variable roles"],
    assumptions: ["Variables are correctly typed and units are known."],
    diagnostics: ["mean/SD or median/IQR", "counts/percentages", "missingness by variable", "distribution checks"],
    effectMeasures: ["mean", "median", "standard deviation", "interquartile range", "count", "percentage"],
    qaGates: ["missingness", "distribution-plausibility", "cell-suppression", ...commonClaimGates],
    commonFailureModes: ["wrong variable type", "unsuppressed sparse cells", "unit mismatch"],
    stopForHumanReviewWhen: ["baseline table is used to imply causal balance outside randomized data"],
    keywords: ["describe", "summary", "table 1", "baseline", "characteristics", "frequencies", "missing"],
  }),
  method({
    id: "survey-weighted-descriptive-summary",
    label: "Survey-weighted descriptive summary",
    category: "descriptive",
    modelFamily: "descriptive",
    purpose: "Estimate weighted means, proportions, and missingness for complex survey data.",
    outcomeTypes: ["continuous", "binary", "categorical"],
    studyDesigns: ["cross_sectional"],
    dataStructures: ["complex_survey"],
    compatibleBackends: ["r-survey"],
    implementationStatus: "contract-ready",
    requiredFields: ["weight", "strata", "psu", "analysis population"],
    assumptions: ["Correct survey design variables and weight domain are declared."],
    diagnostics: ["unweighted N", "weighted estimate", "standard error", "design degrees of freedom"],
    effectMeasures: ["weighted mean", "weighted proportion", "standard error", "confidence interval"],
    qaGates: ["survey-design", "weight-domain", "small-cell-suppression", ...commonClaimGates],
    commonFailureModes: ["invalid weight", "wrong subsample weight", "lonely PSU", "domain analysis ambiguity"],
    stopForHumanReviewWhen: ["multi-cycle weight construction is requested without evidence"],
    keywords: ["survey", "weighted", "nhanes", "prevalence", "proportion", "mean"],
  }),
  method({
    id: "two-sample-t-test",
    label: "Independent two-sample t-test",
    category: "group_comparison",
    modelFamily: "hypothesis_test",
    purpose: "Compare the mean of a continuous outcome between two independent groups.",
    outcomeTypes: ["continuous"],
    studyDesigns: ["cross_sectional", "randomized_trial", "cohort"],
    dataStructures: ["single_table"],
    compatibleBackends: ["python-scipy", "python-statsmodels"],
    implementationStatus: "contract-ready",
    requiredFields: ["continuous outcome", "binary group"],
    assumptions: ["Independent observations", "approximately normal residuals or adequate sample size", "variance policy declared"],
    diagnostics: ["group sizes", "variance ratio", "histogram", "outlier check"],
    effectMeasures: ["mean difference", "Cohen's d", "confidence interval"],
    qaGates: ["normality-review", "variance-review", ...commonClaimGates],
    commonFailureModes: ["non-independent groups", "extreme skew", "unequal variance without Welch correction"],
    stopForHumanReviewWhen: ["paired design detected"],
    keywords: ["t-test", "compare two groups", "difference in means", "mean difference"],
  }),
  method({
    id: "paired-t-test",
    label: "Paired t-test",
    category: "group_comparison",
    modelFamily: "hypothesis_test",
    purpose: "Compare two paired continuous measurements within the same units.",
    outcomeTypes: ["continuous", "repeated_continuous"],
    studyDesigns: ["longitudinal_cohort", "randomized_trial"],
    dataStructures: ["paired", "repeated_measures"],
    compatibleBackends: ["python-scipy", "python-statsmodels"],
    implementationStatus: "contract-ready",
    requiredFields: ["paired identifier", "pre measurement", "post measurement"],
    assumptions: ["Pairing is correct", "within-pair differences are approximately normal"],
    diagnostics: ["paired completeness", "difference distribution"],
    effectMeasures: ["mean paired difference", "standardized paired difference"],
    qaGates: ["pairing-integrity", "missing-pairs", ...commonClaimGates],
    commonFailureModes: ["unpaired records", "time ordering ambiguity"],
    stopForHumanReviewWhen: ["more than two repeated measurements are detected"],
    keywords: ["paired", "pre post", "before after", "same participants"],
  }),
  method({
    id: "anova-one-way",
    label: "One-way ANOVA",
    category: "group_comparison",
    modelFamily: "hypothesis_test",
    purpose: "Compare a continuous outcome across more than two independent groups.",
    outcomeTypes: ["continuous"],
    studyDesigns: ["cross_sectional", "randomized_trial", "cohort"],
    dataStructures: ["single_table"],
    compatibleBackends: ["python-statsmodels", "python-scipy"],
    implementationStatus: "contract-ready",
    requiredFields: ["continuous outcome", "categorical group with >2 levels"],
    assumptions: ["Independent observations", "within-group variance policy", "post-hoc correction policy"],
    diagnostics: ["group counts", "residual diagnostics", "variance homogeneity"],
    effectMeasures: ["eta-squared", "partial eta-squared", "mean differences"],
    qaGates: ["posthoc-multiplicity", "variance-review", ...commonClaimGates],
    commonFailureModes: ["sparse groups", "multiple comparisons without correction"],
    stopForHumanReviewWhen: ["repeated-measures design detected"],
    multiplicityRequirements: ["Tukey, Dunnett, Holm, or explicit contrast correction"],
    keywords: ["anova", "more than two groups", "three groups", "multiple groups"],
  }),
  method({
    id: "chi-square-independence",
    label: "Chi-square test of independence",
    category: "group_comparison",
    modelFamily: "hypothesis_test",
    purpose: "Test association between two categorical variables.",
    outcomeTypes: ["binary", "categorical"],
    studyDesigns: ["cross_sectional", "case_control", "cohort", "randomized_trial"],
    dataStructures: ["single_table", "complex_survey"],
    compatibleBackends: ["python-scipy", "r-survey"],
    implementationStatus: "contract-ready",
    requiredFields: ["categorical outcome", "categorical exposure"],
    assumptions: ["Expected cell counts are adequate or exact test is selected", "independence or survey design is handled"],
    diagnostics: ["cell counts", "expected counts", "sparse cells"],
    effectMeasures: ["risk difference", "risk ratio", "odds ratio", "Cramer's V"],
    qaGates: ["sparse-cell-check", "effect-size-reporting", ...commonClaimGates],
    commonFailureModes: ["expected cell count too small", "survey design ignored"],
    stopForHumanReviewWhen: ["small expected counts require exact or suppressed analysis"],
    keywords: ["chi-square", "categorical", "cross-tab", "crosstab", "proportions"],
  }),
  method({
    id: "fisher-exact-test",
    label: "Fisher's exact test",
    category: "group_comparison",
    modelFamily: "hypothesis_test",
    purpose: "Exact test for small 2x2 categorical tables.",
    outcomeTypes: ["binary"],
    studyDesigns: ["cross_sectional", "case_control", "randomized_trial"],
    dataStructures: ["single_table"],
    compatibleBackends: ["python-scipy"],
    implementationStatus: "contract-ready",
    requiredFields: ["2x2 table"],
    assumptions: ["Fixed margins or exact-test interpretation is appropriate"],
    diagnostics: ["observed cell counts", "expected counts"],
    effectMeasures: ["odds ratio", "exact p-value"],
    qaGates: ["small-cell-policy", ...commonClaimGates],
    commonFailureModes: ["table not 2x2", "matched data should use McNemar"],
    stopForHumanReviewWhen: ["survey weighted exact testing is requested"],
    keywords: ["fisher", "small cell", "exact test", "2x2"],
  }),
  method({
    id: "mann-whitney-u",
    label: "Mann-Whitney U test",
    category: "nonparametric_resampling",
    modelFamily: "nonparametric",
    purpose: "Compare independent groups on ordinal or non-normal continuous outcomes.",
    outcomeTypes: ["continuous", "ordinal"],
    studyDesigns: ["cross_sectional", "randomized_trial", "cohort"],
    dataStructures: ["single_table"],
    compatibleBackends: ["python-scipy"],
    implementationStatus: "contract-ready",
    requiredFields: ["outcome", "binary group"],
    assumptions: ["Independent samples", "distribution-shape interpretation is declared"],
    diagnostics: ["group sizes", "tie frequency", "distribution plots"],
    effectMeasures: ["rank-biserial correlation", "median difference"],
    qaGates: ["rank-method-disclosure", ...commonClaimGates],
    commonFailureModes: ["interpreting as median test when shapes differ"],
    stopForHumanReviewWhen: ["paired measurements are detected"],
    keywords: ["mann-whitney", "wilcoxon rank sum", "non-normal", "rank"],
  }),
  method({
    id: "pearson-correlation",
    label: "Pearson correlation",
    category: "correlation_association",
    modelFamily: "correlation",
    purpose: "Estimate linear association between two continuous variables.",
    outcomeTypes: ["continuous"],
    studyDesigns: ["cross_sectional", "cohort"],
    dataStructures: ["single_table"],
    compatibleBackends: ["python-scipy", "python-statsmodels"],
    implementationStatus: "contract-ready",
    requiredFields: ["two continuous variables"],
    assumptions: ["Approximate linear relationship", "outliers assessed"],
    diagnostics: ["scatterplot", "outlier influence", "linearity"],
    effectMeasures: ["Pearson r", "r-squared"],
    qaGates: ["linearity", "outlier-review", ...commonClaimGates],
    commonFailureModes: ["nonlinear relationship", "outlier-driven association"],
    stopForHumanReviewWhen: ["causal interpretation is requested"],
    keywords: ["correlation", "pearson", "linear relationship"],
  }),
  method({
    id: "spearman-correlation",
    label: "Spearman rank correlation",
    category: "correlation_association",
    modelFamily: "correlation",
    purpose: "Estimate monotonic rank association for ordinal or non-normal variables.",
    outcomeTypes: ["continuous", "ordinal"],
    studyDesigns: ["cross_sectional", "cohort"],
    dataStructures: ["single_table"],
    compatibleBackends: ["python-scipy"],
    implementationStatus: "contract-ready",
    requiredFields: ["two rankable variables"],
    assumptions: ["Monotonic association", "ties handled"],
    diagnostics: ["scatterplot", "tie frequency"],
    effectMeasures: ["Spearman rho"],
    qaGates: ["monotonicity", ...commonClaimGates],
    commonFailureModes: ["non-monotonic relationship"],
    stopForHumanReviewWhen: ["partial correlation is needed for confounding control"],
    keywords: ["spearman", "rank correlation", "monotonic", "ordinal"],
  }),
  method({
    id: "multiple-linear-regression",
    label: "Multiple linear regression",
    category: "linear_regression",
    modelFamily: "linear",
    purpose: "Model a continuous outcome as a function of exposure and covariates.",
    outcomeTypes: ["continuous"],
    studyDesigns: ["cross_sectional", "cohort", "randomized_trial"],
    dataStructures: ["single_table", "complex_survey"],
    compatibleBackends: ["r-survey", "python-linearized", "python-statsmodels"],
    implementationStatus: "executable",
    requiredFields: ["continuous outcome", "exposure", "covariates"],
    assumptions: ["Linearity", "model residual policy", "confounder set declared"],
    diagnostics: ["residual plots", "influence", "VIF", "heteroscedasticity"],
    effectMeasures: ["beta coefficient", "mean difference", "standardized beta"],
    qaGates: ["numeric-consistency", "diagnostics", "confounder-disclosure", ...commonClaimGates],
    commonFailureModes: ["multicollinearity", "nonlinearity", "outlier influence"],
    stopForHumanReviewWhen: ["causal interpretation requested without causal design"],
    keywords: ["linear regression", "continuous outcome", "adjusted mean", "slope", "biomarker"],
  }),
  method({
    id: "interaction-regression",
    label: "Interaction/effect-modification regression",
    category: "sensitivity_subgroup_secondary",
    modelFamily: "linear",
    purpose: "Test whether an exposure-outcome association differs by a moderator or subgroup.",
    outcomeTypes: ["continuous", "binary"],
    studyDesigns: ["cross_sectional", "cohort", "randomized_trial"],
    dataStructures: ["single_table", "complex_survey"],
    compatibleBackends: ["r-survey", "python-statsmodels"],
    implementationStatus: "contract-ready",
    requiredFields: ["outcome", "exposure", "moderator", "interaction term"],
    assumptions: ["Interaction scale is prespecified", "subgroup cell sizes are adequate"],
    diagnostics: ["cell counts by subgroup", "interaction contrast", "multiplicity review"],
    effectMeasures: ["interaction coefficient", "stratum-specific effects"],
    qaGates: ["subgroup-prespecification", "small-cell-suppression", "multiplicity", ...commonClaimGates],
    commonFailureModes: ["underpowered subgroup", "post-hoc interaction overclaim"],
    stopForHumanReviewWhen: ["clinical subgroup conclusion requested"],
    multiplicityRequirements: ["Prespecified interaction or multiple-comparison correction"],
    keywords: ["interaction", "effect modification", "moderation", "subgroup"],
  }),
  method({
    id: "binary-logistic-regression",
    label: "Binary logistic regression",
    category: "logistic_regression",
    modelFamily: "logistic",
    purpose: "Model a binary outcome using exposure and covariates.",
    outcomeTypes: ["binary"],
    studyDesigns: ["cross_sectional", "case_control", "cohort", "randomized_trial"],
    dataStructures: ["single_table", "complex_survey"],
    compatibleBackends: ["r-survey", "python-linearized", "python-statsmodels"],
    implementationStatus: "executable",
    requiredFields: ["binary outcome", "exposure", "covariates"],
    assumptions: ["Outcome threshold is justified", "adequate events per parameter", "linearity in logit for continuous predictors"],
    diagnostics: ["event count", "separation", "calibration if predictive", "influence"],
    effectMeasures: ["odds ratio", "marginal risk difference"],
    qaGates: ["threshold-provenance", "sparse-cells", "odds-ratio-consistency", ...commonClaimGates],
    commonFailureModes: ["complete separation", "rare outcome bias", "threshold without provenance"],
    stopForHumanReviewWhen: ["diagnostic or causal language is requested"],
    keywords: ["logistic", "odds", "binary", "yes no", "elevated", "disease status"],
  }),
  method({
    id: "ordinal-logistic-regression",
    label: "Ordinal logistic regression",
    category: "logistic_regression",
    modelFamily: "ordinal",
    purpose: "Model ordered categorical outcomes.",
    outcomeTypes: ["ordinal"],
    studyDesigns: ["cross_sectional", "cohort", "randomized_trial"],
    dataStructures: ["single_table", "clustered"],
    compatibleBackends: ["python-statsmodels"],
    implementationStatus: "contract-ready",
    requiredFields: ["ordered categorical outcome", "exposure", "covariates"],
    assumptions: ["Proportional odds or alternative link is evaluated"],
    diagnostics: ["category counts", "proportional odds check"],
    effectMeasures: ["cumulative odds ratio"],
    qaGates: ["ordinal-scale-validity", "proportional-odds", ...commonClaimGates],
    commonFailureModes: ["violated proportional odds", "sparse categories"],
    stopForHumanReviewWhen: ["ordered categories are clinically ambiguous"],
    keywords: ["ordinal", "ordered categories", "severity scale", "likert outcome"],
  }),
  method({
    id: "poisson-regression",
    label: "Poisson count regression",
    category: "count_regression",
    modelFamily: "count",
    purpose: "Model count or incidence-rate outcomes.",
    outcomeTypes: ["count", "rate"],
    studyDesigns: ["cohort", "cross_sectional"],
    dataStructures: ["single_table", "clustered"],
    compatibleBackends: ["python-statsmodels"],
    implementationStatus: "contract-ready",
    requiredFields: ["count outcome", "exposure", "offset when modeling rates"],
    assumptions: ["Mean-variance relationship is checked", "offset/exposure time is valid"],
    diagnostics: ["overdispersion", "zero count frequency", "offset distribution"],
    effectMeasures: ["incidence rate ratio", "count ratio"],
    qaGates: ["overdispersion", "offset-validity", ...commonClaimGates],
    commonFailureModes: ["overdispersion", "excess zeros", "missing person-time"],
    stopForHumanReviewWhen: ["overdispersion suggests negative binomial or quasi-Poisson"],
    keywords: ["poisson", "count", "number of", "incidence rate", "visits"],
  }),
  method({
    id: "negative-binomial-regression",
    label: "Negative binomial regression",
    category: "count_regression",
    modelFamily: "count",
    purpose: "Model overdispersed count outcomes.",
    outcomeTypes: ["count", "rate"],
    studyDesigns: ["cohort", "cross_sectional"],
    dataStructures: ["single_table", "clustered"],
    compatibleBackends: ["python-statsmodels"],
    implementationStatus: "contract-ready",
    requiredFields: ["count outcome", "exposure", "offset when modeling rates"],
    assumptions: ["Overdispersion is present", "zero inflation is assessed"],
    diagnostics: ["dispersion parameter", "zero frequency", "residual plots"],
    effectMeasures: ["incidence rate ratio"],
    qaGates: ["overdispersion", "zero-inflation-review", ...commonClaimGates],
    commonFailureModes: ["zero-inflated process", "unstable dispersion"],
    stopForHumanReviewWhen: ["hurdle or zero-inflated mechanism is clinically plausible"],
    keywords: ["negative binomial", "overdispersed", "count", "ed visits", "hospitalizations"],
  }),
  method({
    id: "kaplan-meier-log-rank",
    label: "Kaplan-Meier curves and log-rank test",
    category: "survival_time_to_event",
    modelFamily: "survival",
    purpose: "Describe survival curves and compare groups without covariate adjustment.",
    outcomeTypes: ["time_to_event"],
    studyDesigns: ["cohort", "randomized_trial"],
    dataStructures: ["survival", "longitudinal"],
    compatibleBackends: ["r-survival", "python-lifelines"],
    implementationStatus: "contract-ready",
    requiredFields: ["time at risk", "event indicator", "group"],
    assumptions: ["Censoring is non-informative", "time origin is valid"],
    diagnostics: ["number at risk", "censoring distribution", "event count"],
    effectMeasures: ["survival probability", "median survival", "log-rank p-value"],
    qaGates: ["time-origin", "censoring", "event-coding", ...commonClaimGates],
    commonFailureModes: ["immortal time", "invalid censoring", "too few events"],
    stopForHumanReviewWhen: ["time origin or censoring is ambiguous"],
    keywords: ["kaplan", "survival curve", "log-rank", "time to event"],
  }),
  method({
    id: "cox-proportional-hazards",
    label: "Cox proportional hazards regression",
    category: "survival_time_to_event",
    modelFamily: "survival",
    purpose: "Estimate adjusted hazard ratios for time-to-event outcomes.",
    outcomeTypes: ["time_to_event"],
    studyDesigns: ["cohort", "randomized_trial"],
    dataStructures: ["survival", "longitudinal"],
    compatibleBackends: ["r-survival", "python-lifelines"],
    implementationStatus: "contract-ready",
    requiredFields: ["time at risk", "event indicator", "exposure", "covariates"],
    assumptions: ["Proportional hazards", "independent censoring", "valid time zero"],
    diagnostics: ["Schoenfeld residuals", "log-log plots", "event-per-variable count"],
    effectMeasures: ["hazard ratio"],
    qaGates: ["proportional-hazards", "time-origin", "censoring", ...commonClaimGates],
    commonFailureModes: ["non-proportional hazards", "immortal time bias", "too few events"],
    stopForHumanReviewWhen: ["competing risks are present"],
    keywords: ["cox", "hazard", "time to death", "readmission", "survival"],
  }),
  method({
    id: "fine-gray-competing-risks",
    label: "Fine-Gray competing risks model",
    category: "survival_time_to_event",
    modelFamily: "survival",
    purpose: "Estimate subdistribution hazards when competing event types preclude the event of interest.",
    outcomeTypes: ["time_to_event"],
    studyDesigns: ["cohort", "randomized_trial"],
    dataStructures: ["survival"],
    compatibleBackends: ["r-survival"],
    implementationStatus: "design-only",
    requiredFields: ["time", "event type", "competing event indicator", "covariates"],
    assumptions: ["Competing event coding is complete", "subdistribution estimand is appropriate"],
    diagnostics: ["cumulative incidence functions", "event type counts"],
    effectMeasures: ["subdistribution hazard ratio"],
    qaGates: ["competing-risk-definition", "event-coding", ...commonClaimGates],
    commonFailureModes: ["treating competing events as censoring without justification"],
    stopForHumanReviewWhen: ["competing risks are clinically material"],
    keywords: ["competing risks", "fine-gray", "cumulative incidence"],
  }),
  method({
    id: "linear-mixed-effects-model",
    label: "Linear mixed-effects model",
    category: "longitudinal_repeated_measures",
    modelFamily: "mixed_effects",
    purpose: "Model continuous repeated or clustered outcomes with random effects.",
    outcomeTypes: ["repeated_continuous", "continuous", "clustered"],
    studyDesigns: ["longitudinal_cohort", "randomized_trial", "cohort"],
    dataStructures: ["repeated_measures", "clustered", "nested", "longitudinal"],
    compatibleBackends: ["r-lme4", "python-statsmodels"],
    implementationStatus: "contract-ready",
    requiredFields: ["outcome", "time or cluster id", "subject id", "fixed effects"],
    assumptions: ["Random-effects structure is justified", "within-cluster correlation is modeled"],
    diagnostics: ["random-effect variance", "residual diagnostics", "convergence"],
    effectMeasures: ["fixed-effect coefficient", "random-effect variance", "intraclass correlation"],
    qaGates: ["cluster-id", "convergence", "random-effects-policy", ...commonClaimGates],
    commonFailureModes: ["singular fit", "non-convergence", "wrong correlation structure"],
    stopForHumanReviewWhen: ["cluster count is small"],
    keywords: ["mixed model", "random intercept", "random slope", "repeated measures", "longitudinal"],
  }),
  method({
    id: "generalized-estimating-equations",
    label: "Generalized estimating equations",
    category: "longitudinal_repeated_measures",
    modelFamily: "gee",
    purpose: "Estimate population-average effects for correlated repeated or clustered outcomes.",
    outcomeTypes: ["repeated_continuous", "repeated_binary", "clustered"],
    studyDesigns: ["longitudinal_cohort", "cohort", "randomized_trial"],
    dataStructures: ["repeated_measures", "clustered", "longitudinal"],
    compatibleBackends: ["python-statsmodels"],
    implementationStatus: "contract-ready",
    requiredFields: ["cluster id", "outcome", "exposure", "working correlation"],
    assumptions: ["Cluster correlation structure is declared", "robust variance is used"],
    diagnostics: ["cluster count", "working correlation", "robust standard errors"],
    effectMeasures: ["population-average coefficient", "odds ratio", "risk ratio"],
    qaGates: ["cluster-count", "correlation-structure", ...commonClaimGates],
    commonFailureModes: ["too few clusters", "missing cluster id"],
    stopForHumanReviewWhen: ["cluster count below robust-variance threshold"],
    keywords: ["gee", "population average", "correlated", "repeated binary"],
  }),
  method({
    id: "multilevel-logistic-model",
    label: "Multilevel logistic model",
    category: "multilevel_hierarchical",
    modelFamily: "multilevel",
    purpose: "Model binary outcomes with nested units or clustered random effects.",
    outcomeTypes: ["binary", "clustered"],
    studyDesigns: ["cohort", "cross_sectional", "longitudinal_cohort"],
    dataStructures: ["nested", "clustered"],
    compatibleBackends: ["r-lme4", "bayesian"],
    implementationStatus: "contract-ready",
    requiredFields: ["binary outcome", "cluster id", "exposure", "covariates"],
    assumptions: ["Nested structure is correct", "random effect distribution is acceptable"],
    diagnostics: ["cluster count", "ICC", "convergence"],
    effectMeasures: ["cluster-specific odds ratio", "ICC"],
    qaGates: ["cluster-structure", "convergence", ...commonClaimGates],
    commonFailureModes: ["too few clusters", "separation within clusters"],
    stopForHumanReviewWhen: ["cross-classified structure is present"],
    keywords: ["multilevel", "hierarchical", "patients within hospitals", "clustered binary"],
  }),
  method({
    id: "gamma-glm",
    label: "Gamma GLM",
    category: "generalized_linear_model",
    modelFamily: "glm",
    purpose: "Model positive skewed continuous outcomes such as cost or length of stay.",
    outcomeTypes: ["continuous"],
    studyDesigns: ["cohort", "cross_sectional", "economic_evaluation"],
    dataStructures: ["single_table", "clustered"],
    compatibleBackends: ["python-statsmodels"],
    implementationStatus: "contract-ready",
    requiredFields: ["positive continuous outcome", "link function", "covariates"],
    assumptions: ["Outcome is strictly positive", "link and variance family are justified"],
    diagnostics: ["zero values", "skewness", "deviance residuals"],
    effectMeasures: ["mean ratio", "marginal mean"],
    qaGates: ["positive-outcome", "link-policy", ...commonClaimGates],
    commonFailureModes: ["zero-inflated cost", "wrong variance family"],
    stopForHumanReviewWhen: ["many zero costs require two-part model"],
    keywords: ["gamma", "skewed", "cost", "length of stay", "positive continuous"],
  }),
  method({
    id: "propensity-score-matching",
    label: "Propensity score matching",
    category: "causal_inference",
    modelFamily: "propensity_weighting",
    purpose: "Construct a matched comparison set with similar measured baseline covariates before estimating an observational treatment contrast.",
    outcomeTypes: ["continuous", "binary"],
    studyDesigns: ["cohort", "case_control"],
    dataStructures: ["single_table"],
    compatibleBackends: ["python-statsmodels"],
    implementationStatus: "executable",
    requiredFields: ["binary treatment/exposure", "outcome", "baseline confounders", "match ratio", "caliper policy"],
    assumptions: ["Exchangeability conditional on measured baseline covariates", "positivity/overlap", "consistency", "no post-treatment covariates in the propensity model"],
    diagnostics: ["standardized mean differences before/after matching", "propensity overlap", "caliper unmatched count", "matched treated/control counts"],
    effectMeasures: ["ATT mean difference", "ATT risk difference", "ATT odds ratio"],
    qaGates: ["dag-review", "balance", "positivity", "causal-claim-review", ...commonClaimGates],
    commonFailureModes: ["unmeasured confounding", "poor overlap", "many unmatched treated rows", "post-treatment covariates", "residual imbalance"],
    stopForHumanReviewWhen: ["any causal claim is made", "post-match absolute SMD remains above threshold", "positivity is weak"],
    keywords: ["propensity", "matching", "nearest neighbor", "caliper", "causal", "treatment effect", "balance"],
  }),
  method({
    id: "propensity-score-weighting",
    label: "Propensity score weighting/IPTW",
    category: "causal_inference",
    modelFamily: "propensity_weighting",
    purpose: "Balance measured confounders between exposure groups for observational causal effect estimation.",
    outcomeTypes: ["continuous", "binary", "time_to_event"],
    studyDesigns: ["cohort", "case_control"],
    dataStructures: ["single_table", "longitudinal"],
    compatibleBackends: ["python-statsmodels"],
    implementationStatus: "executable",
    requiredFields: ["treatment", "outcome", "confounders", "positivity diagnostics"],
    assumptions: ["Exchangeability", "positivity", "consistency", "correct treatment model"],
    diagnostics: ["standardized mean differences", "weight distribution", "overlap"],
    effectMeasures: ["ATE", "ATT", "risk difference", "risk ratio"],
    qaGates: ["dag-review", "balance", "positivity", "causal-claim-review"],
    commonFailureModes: ["unmeasured confounding", "extreme weights", "post-treatment covariates"],
    stopForHumanReviewWhen: ["any causal claim is made"],
    keywords: ["propensity", "iptw", "causal", "treatment effect", "balance"],
  }),
  method({
    id: "difference-in-differences",
    label: "Difference-in-differences",
    category: "causal_inference",
    modelFamily: "difference_in_differences",
    purpose: "Estimate policy or intervention effects using treated and comparison groups over time.",
    outcomeTypes: ["continuous", "binary", "count", "rate"],
    studyDesigns: ["time_series", "cohort"],
    dataStructures: ["longitudinal", "time_series"],
    compatibleBackends: ["causal", "python-statsmodels"],
    implementationStatus: "design-only",
    requiredFields: ["treatment group", "comparison group", "pre period", "post period"],
    assumptions: ["Parallel trends", "no spillover", "stable composition"],
    diagnostics: ["pretrend plot", "event study", "placebo tests"],
    effectMeasures: ["average treatment effect on treated"],
    qaGates: ["parallel-trends", "cointervention", "causal-claim-review"],
    commonFailureModes: ["parallel trends violation", "differential composition change"],
    stopForHumanReviewWhen: ["policy causal conclusion requested"],
    keywords: ["difference in differences", "did", "policy", "treated control", "pre post"],
  }),
  method({
    id: "regression-discontinuity",
    label: "Regression discontinuity",
    category: "causal_inference",
    modelFamily: "glm",
    purpose: "Estimate causal effects near an assignment cutoff.",
    outcomeTypes: ["continuous", "binary"],
    studyDesigns: ["cohort"],
    dataStructures: ["single_table"],
    compatibleBackends: ["causal", "python-statsmodels"],
    implementationStatus: "design-only",
    requiredFields: ["running variable", "cutoff", "treatment assignment", "outcome"],
    assumptions: ["No manipulation around cutoff", "local continuity"],
    diagnostics: ["density test", "bandwidth sensitivity", "covariate continuity"],
    effectMeasures: ["local average treatment effect"],
    qaGates: ["cutoff-validity", "bandwidth-sensitivity", "causal-claim-review"],
    commonFailureModes: ["manipulated running variable", "arbitrary bandwidth"],
    stopForHumanReviewWhen: ["assignment mechanism is not deterministic or fuzzy RD not specified"],
    keywords: ["regression discontinuity", "cutoff", "threshold assigned"],
  }),
  method({
    id: "tmle-doubly-robust",
    label: "Targeted maximum likelihood / doubly robust estimation",
    category: "causal_inference",
    modelFamily: "propensity_weighting",
    purpose: "Estimate causal effects with doubly robust outcome and treatment modeling.",
    outcomeTypes: ["continuous", "binary"],
    studyDesigns: ["cohort"],
    dataStructures: ["single_table", "longitudinal"],
    compatibleBackends: ["causal"],
    implementationStatus: "design-only",
    requiredFields: ["outcome", "treatment", "confounders", "identification assumptions"],
    assumptions: ["Exchangeability", "positivity", "consistency", "correct nuisance-model strategy"],
    diagnostics: ["positivity", "nuisance model performance", "influence curve"],
    effectMeasures: ["ATE", "risk difference", "risk ratio"],
    qaGates: ["identification", "positivity", "causal-claim-review"],
    commonFailureModes: ["positivity violation", "unmeasured confounding"],
    stopForHumanReviewWhen: ["causal estimand not explicitly reviewed"],
    keywords: ["tmle", "doubly robust", "g-computation", "causal"],
  }),
  method({
    id: "diagnostic-accuracy-basic",
    label: "Diagnostic accuracy metrics",
    category: "diagnostic_prognostic",
    modelFamily: "diagnostic_accuracy",
    purpose: "Estimate sensitivity, specificity, predictive values, likelihood ratios, and confusion matrix metrics.",
    outcomeTypes: ["binary"],
    studyDesigns: ["diagnostic"],
    dataStructures: ["single_table"],
    compatibleBackends: ["python-statsmodels"],
    implementationStatus: "contract-ready",
    requiredFields: ["index test", "gold standard", "threshold"],
    assumptions: ["Reference standard is valid", "spectrum bias is addressed"],
    diagnostics: ["confusion matrix", "prevalence", "indeterminate results"],
    effectMeasures: ["sensitivity", "specificity", "PPV", "NPV", "LR+", "LR-"],
    qaGates: ["gold-standard", "threshold-provenance", "spectrum-bias", ...commonClaimGates],
    commonFailureModes: ["no gold standard", "case-control sampling affects predictive values"],
    stopForHumanReviewWhen: ["screening recommendation is implied"],
    keywords: ["sensitivity", "specificity", "ppv", "npv", "diagnostic", "confusion matrix"],
  }),
  method({
    id: "roc-auc-calibration",
    label: "ROC/AUC and calibration analysis",
    category: "diagnostic_prognostic",
    modelFamily: "diagnostic_accuracy",
    purpose: "Evaluate discrimination and calibration for diagnostic or prognostic predictions.",
    outcomeTypes: ["binary"],
    studyDesigns: ["diagnostic", "prediction", "cohort"],
    dataStructures: ["single_table"],
    compatibleBackends: ["sklearn", "python-statsmodels"],
    implementationStatus: "contract-ready",
    requiredFields: ["binary outcome", "predicted probabilities"],
    assumptions: ["Validation sample is independent or resampling policy is declared"],
    diagnostics: ["ROC curve", "calibration plot", "Brier score"],
    effectMeasures: ["AUC", "C-statistic", "Brier score", "calibration slope"],
    qaGates: ["validation-split", "calibration", "class-imbalance", ...commonClaimGates],
    commonFailureModes: ["optimism bias", "rare outcome precision-recall mismatch"],
    stopForHumanReviewWhen: ["clinical deployment or action threshold is proposed"],
    keywords: ["roc", "auc", "c-statistic", "calibration", "brier", "decision curve"],
  }),
  method({
    id: "penalized-regression-elastic-net",
    label: "Penalized regression / elastic net",
    category: "prediction_machine_learning",
    modelFamily: "prediction",
    purpose: "Build regularized predictive models with shrinkage or feature selection.",
    outcomeTypes: ["continuous", "binary"],
    studyDesigns: ["prediction", "cohort", "cross_sectional"],
    dataStructures: ["single_table", "high_dimensional"],
    compatibleBackends: ["sklearn"],
    implementationStatus: "contract-ready",
    requiredFields: ["outcome", "feature matrix", "validation plan"],
    assumptions: ["Training/validation split prevents leakage", "preprocessing is fit inside resampling"],
    diagnostics: ["cross-validation", "calibration", "coefficient path"],
    effectMeasures: ["RMSE", "AUC", "calibration slope", "selected features"],
    qaGates: ["leakage-check", "validation", "calibration", "model-card"],
    commonFailureModes: ["data leakage", "unstable feature selection", "overfitting"],
    stopForHumanReviewWhen: ["clinical risk score is implied"],
    keywords: ["lasso", "ridge", "elastic net", "prediction", "feature selection"],
  }),
  method({
    id: "tree-ensemble-prediction",
    label: "Tree ensemble prediction",
    category: "prediction_machine_learning",
    modelFamily: "prediction",
    purpose: "Build nonlinear predictive models using random forests or gradient boosting.",
    outcomeTypes: ["continuous", "binary", "time_to_event"],
    studyDesigns: ["prediction", "cohort"],
    dataStructures: ["single_table", "high_dimensional"],
    compatibleBackends: ["sklearn"],
    implementationStatus: "contract-ready",
    requiredFields: ["outcome", "features", "validation plan"],
    assumptions: ["Validation and calibration are explicit", "feature leakage is prevented"],
    diagnostics: ["cross-validation", "feature importance stability", "calibration"],
    effectMeasures: ["AUC", "RMSE", "calibration", "decision curve"],
    qaGates: ["leakage-check", "external-validation-plan", "model-card"],
    commonFailureModes: ["overfitting", "poor calibration", "leakage from future variables"],
    stopForHumanReviewWhen: ["deployment or clinical action threshold is requested"],
    keywords: ["random forest", "gradient boosting", "xgboost", "machine learning", "predict"],
  }),
  method({
    id: "cross-validation-bootstrap-validation",
    label: "Cross-validation and bootstrap model validation",
    category: "model_validation",
    modelFamily: "prediction",
    purpose: "Estimate model performance and optimism using resampling.",
    outcomeTypes: ["continuous", "binary", "time_to_event"],
    studyDesigns: ["prediction"],
    dataStructures: ["single_table", "high_dimensional"],
    compatibleBackends: ["sklearn", "python-statsmodels"],
    implementationStatus: "contract-ready",
    requiredFields: ["model specification", "resampling policy", "performance metrics"],
    assumptions: ["Resampling respects clustering/time", "preprocessing occurs inside folds"],
    diagnostics: ["fold performance", "optimism correction", "calibration"],
    effectMeasures: ["validated AUC", "validated RMSE", "optimism-corrected calibration"],
    qaGates: ["resampling-integrity", "leakage-check", "calibration"],
    commonFailureModes: ["fold leakage", "wrong temporal split", "cluster leakage"],
    stopForHumanReviewWhen: ["external validation is required but unavailable"],
    keywords: ["cross-validation", "bootstrap validation", "train test", "external validation"],
  }),
  method({
    id: "pca-dimensionality-reduction",
    label: "Principal component analysis",
    category: "dimensionality_latent",
    modelFamily: "dimension_reduction",
    purpose: "Reduce correlated continuous variables into orthogonal components.",
    outcomeTypes: ["high_dimensional", "continuous"],
    studyDesigns: ["cross_sectional", "prediction"],
    dataStructures: ["high_dimensional", "single_table"],
    compatibleBackends: ["sklearn"],
    implementationStatus: "contract-ready",
    requiredFields: ["numeric feature matrix", "scaling policy"],
    assumptions: ["Variables are comparable after scaling", "linear component interpretation is acceptable"],
    diagnostics: ["scree plot", "explained variance", "loadings"],
    effectMeasures: ["component scores", "explained variance ratio"],
    qaGates: ["scaling-policy", "component-interpretability"],
    commonFailureModes: ["unscaled variables dominate", "overinterpreting components"],
    stopForHumanReviewWhen: ["latent clinical construct is claimed"],
    keywords: ["pca", "principal component", "dimension reduction", "many variables"],
  }),
  method({
    id: "factor-analysis",
    label: "Exploratory/confirmatory factor analysis",
    category: "dimensionality_latent",
    modelFamily: "dimension_reduction",
    purpose: "Identify or test latent constructs underlying observed items.",
    outcomeTypes: ["high_dimensional", "ordinal", "continuous"],
    studyDesigns: ["measurement", "cross_sectional"],
    dataStructures: ["single_table", "high_dimensional"],
    compatibleBackends: ["r-lavaan", "sklearn"],
    implementationStatus: "design-only",
    requiredFields: ["item matrix", "factor count or model", "rotation policy"],
    assumptions: ["Measurement level and sample size are adequate", "factor model is theoretically justified"],
    diagnostics: ["factor loadings", "fit indices", "residual correlations"],
    effectMeasures: ["factor loadings", "fit indices"],
    qaGates: ["sample-size", "measurement-validity", "factor-interpretability"],
    commonFailureModes: ["underidentified model", "poor fit", "ordinal items treated incorrectly"],
    stopForHumanReviewWhen: ["clinical scale validity is claimed"],
    keywords: ["factor analysis", "latent construct", "confirmatory factor", "efa", "cfa"],
  }),
  method({
    id: "kmeans-clustering",
    label: "K-means clustering",
    category: "clustering_subgroup_discovery",
    modelFamily: "clustering",
    purpose: "Discover continuous-feature subgroups using partition clustering.",
    outcomeTypes: ["high_dimensional", "continuous"],
    studyDesigns: ["cross_sectional", "prediction"],
    dataStructures: ["single_table", "high_dimensional"],
    compatibleBackends: ["sklearn"],
    implementationStatus: "contract-ready",
    requiredFields: ["feature matrix", "scaling policy", "cluster count policy"],
    assumptions: ["Euclidean cluster structure is plausible", "features are scaled"],
    diagnostics: ["silhouette score", "elbow plot", "cluster stability"],
    effectMeasures: ["cluster membership", "cluster centroids"],
    qaGates: ["scaling-policy", "cluster-stability", "interpretability"],
    commonFailureModes: ["arbitrary k", "unstable clusters", "non-spherical clusters"],
    stopForHumanReviewWhen: ["clinical phenotype labels are assigned"],
    keywords: ["cluster", "k-means", "subgroup discovery", "phenotype"],
  }),
  method({
    id: "arima-time-series",
    label: "ARIMA/SARIMA forecasting",
    category: "time_series",
    modelFamily: "time_series",
    purpose: "Forecast ordered observations with autocorrelation and seasonality.",
    outcomeTypes: ["continuous", "count", "rate"],
    studyDesigns: ["time_series"],
    dataStructures: ["time_series"],
    compatibleBackends: ["python-statsmodels"],
    implementationStatus: "contract-ready",
    requiredFields: ["time index", "outcome series", "frequency"],
    assumptions: ["Stationarity or differencing policy", "seasonality policy"],
    diagnostics: ["ACF/PACF", "residual autocorrelation", "forecast error"],
    effectMeasures: ["forecast", "prediction interval", "trend"],
    qaGates: ["time-index-integrity", "autocorrelation", "seasonality"],
    commonFailureModes: ["missing time points", "unmodeled seasonality", "structural breaks"],
    stopForHumanReviewWhen: ["policy effect interpretation is requested"],
    keywords: ["arima", "forecast", "seasonality", "autocorrelation", "time series"],
  }),
  method({
    id: "interrupted-time-series",
    label: "Interrupted time series",
    category: "time_series",
    modelFamily: "time_series",
    purpose: "Estimate level/slope changes after an intervention in ordered data.",
    outcomeTypes: ["continuous", "count", "rate"],
    studyDesigns: ["time_series"],
    dataStructures: ["time_series"],
    compatibleBackends: ["python-statsmodels"],
    implementationStatus: "contract-ready",
    requiredFields: ["time index", "intervention time", "outcome"],
    assumptions: ["No cointervention", "autocorrelation handled", "stable pre-period"],
    diagnostics: ["pretrend", "autocorrelation", "seasonality", "change-point sensitivity"],
    effectMeasures: ["level change", "slope change"],
    qaGates: ["preperiod-length", "autocorrelation", "cointervention-review"],
    commonFailureModes: ["short pre-period", "unmodeled cointervention"],
    stopForHumanReviewWhen: ["causal policy conclusion requested"],
    keywords: ["interrupted time series", "policy change", "before after trend", "joinpoint"],
  }),
  method({
    id: "random-effects-meta-analysis",
    label: "Random-effects meta-analysis",
    category: "meta_analysis",
    modelFamily: "meta_analysis",
    purpose: "Pool study-level effects while allowing between-study heterogeneity.",
    outcomeTypes: ["continuous", "binary", "time_to_event"],
    studyDesigns: ["meta_analysis"],
    dataStructures: ["study_level_effects"],
    compatibleBackends: ["r-meta"],
    implementationStatus: "contract-ready",
    requiredFields: ["effect estimate", "standard error or confidence interval", "study id"],
    assumptions: ["Study effects are sufficiently comparable", "heterogeneity model is declared"],
    diagnostics: ["I-squared", "tau-squared", "forest plot", "funnel plot"],
    effectMeasures: ["pooled effect", "prediction interval"],
    qaGates: ["heterogeneity", "publication-bias", "study-comparability"],
    commonFailureModes: ["incompatible effect measures", "publication bias", "double-counted studies"],
    stopForHumanReviewWhen: ["network or IPD meta-analysis is requested"],
    keywords: ["meta-analysis", "forest plot", "heterogeneity", "i2", "random effects"],
  }),
  method({
    id: "bayesian-hierarchical-model",
    label: "Bayesian hierarchical model",
    category: "bayesian",
    modelFamily: "bayesian",
    purpose: "Estimate multilevel effects with prior distributions and posterior uncertainty.",
    outcomeTypes: ["continuous", "binary", "count", "time_to_event"],
    studyDesigns: ["cohort", "cross_sectional", "longitudinal_cohort"],
    dataStructures: ["nested", "clustered", "longitudinal"],
    compatibleBackends: ["bayesian"],
    implementationStatus: "design-only",
    requiredFields: ["likelihood", "priors", "hierarchy", "MCMC settings"],
    assumptions: ["Priors are justified", "chains converge", "posterior predictive checks are satisfactory"],
    diagnostics: ["R-hat", "effective sample size", "posterior predictive checks"],
    effectMeasures: ["posterior mean", "credible interval", "posterior probability"],
    qaGates: ["prior-review", "convergence", "posterior-predictive-check"],
    commonFailureModes: ["non-convergence", "prior sensitivity", "divergences"],
    stopForHumanReviewWhen: ["informative priors drive conclusions"],
    keywords: ["bayesian", "posterior", "credible interval", "mcmc", "hierarchical bayesian"],
  }),
  method({
    id: "multiple-imputation-mice",
    label: "Multiple imputation by chained equations",
    category: "missing_data",
    modelFamily: "missing_data",
    purpose: "Address missing covariates or outcomes under a MAR-style imputation strategy.",
    outcomeTypes: ["continuous", "binary", "categorical", "ordinal"],
    studyDesigns: ["cross_sectional", "cohort", "randomized_trial", "longitudinal_cohort"],
    dataStructures: ["single_table", "clustered", "longitudinal"],
    compatibleBackends: ["r-mice"],
    implementationStatus: "contract-ready",
    requiredFields: ["missingness map", "imputation model", "analysis model", "pooling rules"],
    assumptions: ["Missing at random is plausible or sensitivity analysis planned"],
    diagnostics: ["missingness patterns", "trace plots", "imputed distribution checks"],
    effectMeasures: ["pooled estimate", "fraction missing information"],
    qaGates: ["missingness-mechanism", "imputation-model", "pooling-rules"],
    commonFailureModes: ["MNAR ignored", "outcome omitted from imputation model", "incompatible imputation model"],
    stopForHumanReviewWhen: ["missingness is likely MNAR"],
    keywords: ["multiple imputation", "mice", "missing data", "mar", "mnar"],
  }),
  method({
    id: "bootstrap-uncertainty",
    label: "Bootstrap uncertainty estimation",
    category: "nonparametric_resampling",
    modelFamily: "nonparametric",
    purpose: "Estimate uncertainty through resampling when analytic variance is weak or complex.",
    outcomeTypes: ["continuous", "binary", "count"],
    studyDesigns: ["cross_sectional", "cohort", "prediction"],
    dataStructures: ["single_table", "clustered"],
    compatibleBackends: ["python-scipy", "python-statsmodels"],
    implementationStatus: "contract-ready",
    requiredFields: ["statistic", "resampling unit", "number of replicates"],
    assumptions: ["Resampling respects clustering and design", "sample is representative"],
    diagnostics: ["bootstrap distribution", "replicate failures", "CI method"],
    effectMeasures: ["bootstrap confidence interval", "standard error"],
    qaGates: ["resampling-unit", "replicate-count", "stability"],
    commonFailureModes: ["wrong resampling unit", "unstable replicates"],
    stopForHumanReviewWhen: ["complex survey bootstrap is requested without replicate design"],
    keywords: ["bootstrap", "resampling", "permutation", "uncertainty"],
  }),
  method({
    id: "multiple-comparison-fdr",
    label: "False discovery rate correction",
    category: "multiple_comparisons",
    modelFamily: "multiple_comparison",
    purpose: "Control expected false discoveries across many hypothesis tests.",
    outcomeTypes: ["continuous", "binary", "high_dimensional"],
    studyDesigns: ["cross_sectional", "cohort", "prediction"],
    dataStructures: ["single_table", "high_dimensional"],
    compatibleBackends: ["python-scipy", "python-statsmodels"],
    implementationStatus: "contract-ready",
    requiredFields: ["family of tests", "raw p-values", "correction method"],
    assumptions: ["Hypothesis family is defined before correction"],
    diagnostics: ["number of tests", "adjusted p-values"],
    effectMeasures: ["q-value", "adjusted p-value"],
    qaGates: ["hypothesis-family", "correction-method", "selective-reporting"],
    commonFailureModes: ["post-hoc family definition", "unadjusted multiple testing"],
    stopForHumanReviewWhen: ["confirmatory claim after exploratory multiplicity"],
    multiplicityRequirements: ["Benjamini-Hochberg, Benjamini-Yekutieli, Holm, or Bonferroni policy"],
    keywords: ["multiple comparisons", "fdr", "benjamini", "bonferroni", "holm"],
  }),
  method({
    id: "effect-size-suite",
    label: "Effect size estimation suite",
    category: "effect_size",
    modelFamily: "descriptive",
    purpose: "Report magnitude of findings in interpretable effect-size units.",
    outcomeTypes: ["continuous", "binary", "time_to_event", "count"],
    studyDesigns: ["cross_sectional", "cohort", "randomized_trial", "case_control"],
    dataStructures: ["single_table", "complex_survey", "survival"],
    compatibleBackends: ["python-statsmodels", "r-survey", "r-survival"],
    implementationStatus: "contract-ready",
    requiredFields: ["primary effect estimate", "uncertainty interval"],
    assumptions: ["Effect measure matches design and sampling scheme"],
    diagnostics: ["scale interpretation", "absolute vs relative effect"],
    effectMeasures: ["mean difference", "standardized mean difference", "odds ratio", "risk ratio", "hazard ratio", "NNT"],
    qaGates: ["effect-measure-match", "clinical-interpretability", ...commonClaimGates],
    commonFailureModes: ["odds ratio interpreted as risk ratio", "p-values without magnitude"],
    stopForHumanReviewWhen: ["number-needed-to-treat is derived from observational data"],
    keywords: ["effect size", "cohen", "odds ratio", "risk ratio", "hazard ratio", "nnt"],
  }),
  method({
    id: "cohens-kappa-icc",
    label: "Agreement and reliability analysis",
    category: "agreement_reliability",
    modelFamily: "agreement",
    purpose: "Assess agreement between raters, instruments, or repeated measurements.",
    outcomeTypes: ["continuous", "binary", "ordinal", "categorical"],
    studyDesigns: ["measurement", "diagnostic"],
    dataStructures: ["paired", "repeated_measures"],
    compatibleBackends: ["python-statsmodels", "python-scipy"],
    implementationStatus: "contract-ready",
    requiredFields: ["rater/test id", "subject id", "paired ratings or measurements"],
    assumptions: ["Rater design and scale type match statistic"],
    diagnostics: ["agreement table", "bias plot", "within-subject variance"],
    effectMeasures: ["Cohen's kappa", "weighted kappa", "ICC", "Bland-Altman limits"],
    qaGates: ["scale-type", "rater-design", "agreement-not-correlation"],
    commonFailureModes: ["using correlation as agreement", "wrong ICC form"],
    stopForHumanReviewWhen: ["instrument equivalence is claimed"],
    keywords: ["kappa", "icc", "reliability", "agreement", "bland-altman", "cronbach"],
  }),
  method({
    id: "cronbach-alpha-scale",
    label: "Cronbach alpha and scale reliability",
    category: "survey_questionnaire",
    modelFamily: "reliability",
    purpose: "Evaluate internal consistency of questionnaire or scale items.",
    outcomeTypes: ["ordinal", "continuous"],
    studyDesigns: ["measurement", "cross_sectional"],
    dataStructures: ["single_table"],
    compatibleBackends: ["python-statsmodels", "r-lavaan"],
    implementationStatus: "contract-ready",
    requiredFields: ["item responses", "scale definition"],
    assumptions: ["Items measure a common construct", "reverse coding is handled"],
    diagnostics: ["item-total correlations", "alpha-if-deleted", "missing item pattern"],
    effectMeasures: ["Cronbach's alpha", "omega"],
    qaGates: ["scale-definition", "reverse-coding", "item-missingness"],
    commonFailureModes: ["mixing constructs", "uncoded reverse items"],
    stopForHumanReviewWhen: ["clinical scale validity is claimed"],
    keywords: ["cronbach", "scale", "questionnaire", "likert", "omega"],
  }),
  method({
    id: "epidemiologic-2x2-measures",
    label: "Epidemiologic 2x2 measures",
    category: "epidemiologic",
    modelFamily: "epidemiologic",
    purpose: "Estimate prevalence, incidence, relative risk, odds ratio, risk difference, and attributable measures.",
    outcomeTypes: ["binary", "rate"],
    studyDesigns: ["cross_sectional", "case_control", "cohort"],
    dataStructures: ["single_table", "complex_survey"],
    compatibleBackends: ["r-survey", "python-statsmodels"],
    implementationStatus: "contract-ready",
    requiredFields: ["exposure", "outcome", "person-time for incidence when needed"],
    assumptions: ["Effect measure matches study design", "case-control designs do not estimate risk directly without sampling information"],
    diagnostics: ["2x2 counts", "person-time", "sampling design"],
    effectMeasures: ["prevalence", "incidence", "risk ratio", "odds ratio", "risk difference", "attributable risk"],
    qaGates: ["design-effect-measure-match", "cell-counts", ...commonClaimGates],
    commonFailureModes: ["risk ratio from case-control data", "incidence without time"],
    stopForHumanReviewWhen: ["population attributable fraction is requested"],
    keywords: ["incidence", "prevalence", "relative risk", "attributable", "epidemiologic"],
  }),
  method({
    id: "clinical-trial-itt-analysis",
    label: "Clinical trial ITT/superiority analysis",
    category: "clinical_trial",
    modelFamily: "glm",
    purpose: "Analyze randomized trials by assigned group with superiority, safety, or repeated-measure endpoints.",
    outcomeTypes: ["continuous", "binary", "time_to_event", "repeated_continuous"],
    studyDesigns: ["randomized_trial"],
    dataStructures: ["single_table", "repeated_measures", "survival"],
    compatibleBackends: ["python-statsmodels", "r-survival", "r-lme4"],
    implementationStatus: "design-only",
    requiredFields: ["randomization group", "analysis population", "endpoint", "protocol deviations"],
    assumptions: ["Randomization is preserved", "ITT population is defined"],
    diagnostics: ["CONSORT flow", "baseline balance", "missing endpoints", "adverse events"],
    effectMeasures: ["mean difference", "risk difference", "hazard ratio"],
    qaGates: ["itt-definition", "protocol-deviation", "safety-reporting"],
    commonFailureModes: ["post-randomization exclusions", "unblinded interim analysis"],
    stopForHumanReviewWhen: ["noninferiority/equivalence margin is involved"],
    keywords: ["trial", "randomized", "itt", "per protocol", "noninferiority", "safety"],
  }),
  method({
    id: "cost-effectiveness-icer",
    label: "Cost-effectiveness and ICER analysis",
    category: "health_economics",
    modelFamily: "health_economics",
    purpose: "Compare costs and outcomes using ICERs, QALYs, decision trees, or Markov models.",
    outcomeTypes: ["continuous"],
    studyDesigns: ["economic_evaluation"],
    dataStructures: ["single_table", "longitudinal"],
    compatibleBackends: ["python-statsmodels", "bayesian"],
    implementationStatus: "design-only",
    requiredFields: ["costs", "outcome utility", "time horizon", "perspective"],
    assumptions: ["Perspective, discounting, and horizon are declared"],
    diagnostics: ["cost distribution", "uncertainty intervals", "sensitivity analysis"],
    effectMeasures: ["ICER", "net monetary benefit", "QALY", "budget impact"],
    qaGates: ["perspective", "time-horizon", "sensitivity-analysis"],
    commonFailureModes: ["missing perspective", "skewed costs mishandled", "no uncertainty analysis"],
    stopForHumanReviewWhen: ["policy recommendation is made"],
    keywords: ["cost effectiveness", "icer", "qaly", "budget impact", "markov"],
  }),
  method({
    id: "spatial-autocorrelation-moran",
    label: "Spatial autocorrelation and hotspot analysis",
    category: "spatial_geographic",
    modelFamily: "spatial",
    purpose: "Assess geographic clustering or hotspots in area-level or geocoded outcomes.",
    outcomeTypes: ["spatial", "rate", "continuous"],
    studyDesigns: ["spatial", "cross_sectional"],
    dataStructures: ["spatial_units"],
    compatibleBackends: ["python-statsmodels"],
    implementationStatus: "design-only",
    requiredFields: ["geographic units", "adjacency or coordinates", "outcome"],
    assumptions: ["Spatial unit definitions and privacy policy are valid"],
    diagnostics: ["Moran's I", "map", "neighbor graph"],
    effectMeasures: ["Moran's I", "hotspot statistic"],
    qaGates: ["geography-privacy", "adjacency-definition", "multiple-testing"],
    commonFailureModes: ["modifiable areal unit problem", "privacy leakage"],
    stopForHumanReviewWhen: ["small-area disease maps are generated"],
    keywords: ["spatial", "gis", "moran", "hotspot", "geographic"],
  }),
  method({
    id: "network-centrality-community",
    label: "Network centrality and community detection",
    category: "network",
    modelFamily: "network",
    purpose: "Analyze relationships among entities using graph structure.",
    outcomeTypes: ["network"],
    studyDesigns: ["network"],
    dataStructures: ["network_graph"],
    compatibleBackends: ["python-networkx"],
    implementationStatus: "contract-ready",
    requiredFields: ["nodes", "edges", "edge definition"],
    assumptions: ["Network construction rules are valid", "missing edges are considered"],
    diagnostics: ["degree distribution", "connected components", "community stability"],
    effectMeasures: ["centrality", "modularity", "community membership"],
    qaGates: ["edge-definition", "missing-edge-bias", "privacy"],
    commonFailureModes: ["ambiguous tie definition", "sampling-induced centrality bias"],
    stopForHumanReviewWhen: ["individual-level network privacy is implicated"],
    keywords: ["network", "graph", "centrality", "community detection", "nodes", "edges"],
  }),
  method({
    id: "topic-modeling-text",
    label: "Topic modeling and text feature analysis",
    category: "text_nlp",
    modelFamily: "nlp",
    purpose: "Discover or quantify themes in text corpora using NLP features or topic models.",
    outcomeTypes: ["text"],
    studyDesigns: ["cross_sectional", "qualitative", "mixed_methods"],
    dataStructures: ["text_corpus"],
    compatibleBackends: ["python-nlp"],
    implementationStatus: "contract-ready",
    requiredFields: ["documents", "preprocessing policy", "privacy policy"],
    assumptions: ["Text preprocessing preserves meaning", "PHI/PII handling is compliant"],
    diagnostics: ["vocabulary", "topic coherence", "manual exemplar review"],
    effectMeasures: ["topic prevalence", "TF-IDF", "embedding similarity"],
    qaGates: ["privacy-redaction", "manual-review", "topic-stability"],
    commonFailureModes: ["PHI leakage", "unstable topics", "overinterpreting topics"],
    stopForHumanReviewWhen: ["qualitative interpretation or clinical recommendation is made"],
    keywords: ["text", "nlp", "topic", "sentiment", "tf-idf", "embedding"],
  }),
  method({
    id: "qualitative-thematic-analysis",
    label: "Qualitative thematic analysis",
    category: "qualitative",
    modelFamily: "qualitative",
    purpose: "Identify themes in qualitative data with traceable coding and reviewer agreement.",
    outcomeTypes: ["qualitative", "text"],
    studyDesigns: ["qualitative", "mixed_methods"],
    dataStructures: ["qualitative_corpus"],
    compatibleBackends: ["python-nlp"],
    implementationStatus: "design-only",
    requiredFields: ["corpus", "coding framework", "coder identities or roles"],
    assumptions: ["Coding approach is explicit", "reflexivity and audit trail are maintained"],
    diagnostics: ["codebook", "intercoder reliability", "theme saturation"],
    effectMeasures: ["theme frequency", "coding agreement"],
    qaGates: ["codebook", "audit-trail", "intercoder-reliability"],
    commonFailureModes: ["LLM-only coding without human audit", "unsupported thematic claims"],
    stopForHumanReviewWhen: ["any qualitative theme is presented as final"],
    keywords: ["qualitative", "thematic", "grounded theory", "content analysis", "coding"],
  }),
  method({
    id: "mixed-methods-triangulation",
    label: "Mixed-methods triangulation",
    category: "mixed_methods",
    modelFamily: "mixed_methods",
    purpose: "Integrate quantitative and qualitative evidence in a prespecified mixed-methods design.",
    outcomeTypes: ["mixed"],
    studyDesigns: ["mixed_methods"],
    dataStructures: ["mixed_methods"],
    compatibleBackends: ["python-statsmodels", "python-nlp"],
    implementationStatus: "design-only",
    requiredFields: ["quantitative result", "qualitative themes", "integration design"],
    assumptions: ["Integration design is declared", "discordant findings are handled"],
    diagnostics: ["joint display", "triangulation matrix", "discordance log"],
    effectMeasures: ["integrated inference", "theme-by-statistic mapping"],
    qaGates: ["integration-design", "discordance-handling", "human-review"],
    commonFailureModes: ["parallel analyses with no integration", "qualitative evidence overclaimed"],
    stopForHumanReviewWhen: ["mixed-methods conclusion is finalized"],
    keywords: ["mixed methods", "triangulation", "explanatory sequential", "convergent"],
  }),
  method({
    id: "mediation-analysis",
    label: "Mediation analysis",
    category: "mediation_moderation_path",
    modelFamily: "mediation",
    purpose: "Estimate whether an exposure-outcome association operates through a mediator.",
    outcomeTypes: ["continuous", "binary"],
    studyDesigns: ["cohort", "cross_sectional"],
    dataStructures: ["single_table", "longitudinal"],
    compatibleBackends: ["causal", "python-statsmodels"],
    implementationStatus: "design-only",
    requiredFields: ["exposure", "mediator", "outcome", "confounders"],
    assumptions: ["Temporal ordering", "no unmeasured exposure-mediator/outcome confounding"],
    diagnostics: ["path estimates", "sensitivity to mediator-outcome confounding"],
    effectMeasures: ["natural direct effect", "natural indirect effect", "proportion mediated"],
    qaGates: ["temporal-order", "causal-mediation-assumptions", "sensitivity-analysis"],
    commonFailureModes: ["cross-sectional mediation overclaim", "post-treatment confounding"],
    stopForHumanReviewWhen: ["mechanistic causal claim is requested"],
    keywords: ["mediation", "mediator", "indirect effect", "path"],
  }),
  method({
    id: "structural-equation-model",
    label: "Structural equation model",
    category: "structural_equation_modeling",
    modelFamily: "sem",
    purpose: "Model latent and observed variable relationships with measurement and structural components.",
    outcomeTypes: ["continuous", "ordinal", "high_dimensional"],
    studyDesigns: ["measurement", "cross_sectional", "longitudinal_cohort"],
    dataStructures: ["single_table", "longitudinal"],
    compatibleBackends: ["r-lavaan"],
    implementationStatus: "design-only",
    requiredFields: ["measurement model", "structural paths", "sample size"],
    assumptions: ["Model identification", "measurement invariance if comparing groups"],
    diagnostics: ["CFI", "TLI", "RMSEA", "SRMR", "modification indices"],
    effectMeasures: ["path coefficient", "factor loading", "fit indices"],
    qaGates: ["identification", "fit-indices", "measurement-invariance"],
    commonFailureModes: ["underidentified model", "post-hoc model fishing"],
    stopForHumanReviewWhen: ["causal path language is used"],
    keywords: ["sem", "structural equation", "path analysis", "measurement invariance"],
  }),
  method({
    id: "omics-differential-expression",
    label: "High-dimensional differential expression",
    category: "high_dimensional",
    modelFamily: "high_dimensional",
    purpose: "Analyze genomics/proteomics-style high-dimensional features with multiple-testing control.",
    outcomeTypes: ["high_dimensional"],
    studyDesigns: ["cross_sectional", "case_control", "cohort"],
    dataStructures: ["high_dimensional"],
    compatibleBackends: ["sklearn", "python-statsmodels"],
    implementationStatus: "design-only",
    requiredFields: ["feature matrix", "batch variables", "group labels"],
    assumptions: ["Batch effects and multiple testing are handled"],
    diagnostics: ["PCA/UMAP", "batch effect plots", "FDR distribution"],
    effectMeasures: ["log fold-change", "FDR", "pathway enrichment"],
    qaGates: ["batch-effect", "fdr-control", "feature-provenance"],
    commonFailureModes: ["batch confounding", "uncorrected multiplicity", "p-hacking"],
    stopForHumanReviewWhen: ["biological pathway claim is made"],
    keywords: ["omics", "genomics", "proteomics", "differential expression", "fdr"],
  }),
  method({
    id: "image-signal-feature-analysis",
    label: "Image/signal feature analysis",
    category: "image_signal",
    modelFamily: "image_signal",
    purpose: "Extract and model features from medical images or biomedical signals.",
    outcomeTypes: ["image", "signal"],
    studyDesigns: ["prediction", "diagnostic"],
    dataStructures: ["image_collection", "signal_series"],
    compatibleBackends: ["sklearn"],
    implementationStatus: "design-only",
    requiredFields: ["image/signal files", "labels", "preprocessing pipeline"],
    assumptions: ["Preprocessing, segmentation, and leakage policy are declared"],
    diagnostics: ["quality control", "segmentation review", "train/test split by subject"],
    effectMeasures: ["AUC", "Dice coefficient", "signal feature estimate"],
    qaGates: ["subject-level-split", "preprocessing-provenance", "quality-control"],
    commonFailureModes: ["slice-level leakage", "scanner batch effects", "unreviewed segmentation"],
    stopForHumanReviewWhen: ["clinical image interpretation is claimed"],
    keywords: ["image", "radiomics", "segmentation", "ecg", "eeg", "signal"],
  }),
  method({
    id: "power-sample-size",
    label: "Power and sample size analysis",
    category: "power_sample_size",
    modelFamily: "power",
    purpose: "Estimate required sample size, power, or minimum detectable effect.",
    outcomeTypes: ["continuous", "binary", "time_to_event", "count"],
    studyDesigns: ["randomized_trial", "cohort", "diagnostic", "measurement"],
    dataStructures: ["single_table", "clustered", "survival"],
    compatibleBackends: ["python-statsmodels", "python-scipy"],
    implementationStatus: "contract-ready",
    requiredFields: ["effect size", "alpha", "power target", "allocation ratio"],
    assumptions: ["Effect size and variance assumptions are justified"],
    diagnostics: ["sensitivity grid", "event count for survival"],
    effectMeasures: ["required N", "power", "minimum detectable effect"],
    qaGates: ["assumption-source", "sensitivity-grid", "design-effect"],
    commonFailureModes: ["optimistic effect size", "ignoring clustering", "event count ignored"],
    stopForHumanReviewWhen: ["trial feasibility or funding decision depends on estimate"],
    keywords: ["power", "sample size", "minimum detectable", "precision", "event based"],
  }),
  method({
    id: "model-diagnostics-linear-logistic",
    label: "Regression model diagnostics",
    category: "model_diagnostics",
    modelFamily: "diagnostics",
    purpose: "Check assumptions and model fit for linear/logistic/count/survival models.",
    outcomeTypes: ["continuous", "binary", "count", "time_to_event"],
    studyDesigns: ["cross_sectional", "cohort", "randomized_trial"],
    dataStructures: ["single_table", "complex_survey", "survival"],
    compatibleBackends: ["python-statsmodels", "r-survey", "r-survival"],
    implementationStatus: "contract-ready",
    requiredFields: ["fitted model", "design matrix", "residuals or influence metrics"],
    assumptions: ["Diagnostics match model family"],
    diagnostics: ["residuals", "VIF", "influence", "overdispersion", "proportional hazards", "calibration"],
    effectMeasures: ["diagnostic status", "assumption violation flags"],
    qaGates: ["assumption-checks", "diagnostic-artifacts", "repair-plan"],
    commonFailureModes: ["diagnostics omitted", "failed convergence ignored"],
    stopForHumanReviewWhen: ["diagnostic failure changes interpretation"],
    keywords: ["diagnostics", "assumption", "vif", "residual", "overdispersion", "calibration", "convergence"],
  }),
];

export function getAnalysisMethod(id: string): AnalysisMethod {
  const found = analysisMethodCatalog.find(item => item.id === id);
  if (!found) throw new Error(`Unknown analysis method: ${id}`);
  return found;
}

export function listAnalysisMethods(opts: { category?: AnalysisMethodCategory } = {}): AnalysisMethod[] {
  return opts.category ? analysisMethodCatalog.filter(method => method.category === opts.category) : analysisMethodCatalog;
}

export function selectAnalysisMethods(input: Partial<MethodSelectionRequest> & { question: string }): MethodSelectionResult {
  const request: MethodSelectionRequest = {
    question: input.question,
    outcomeType: input.outcomeType,
    studyDesign: input.studyDesign,
    dataStructures: input.dataStructures ?? [],
    dataset: input.dataset,
    goal: input.goal,
    surveyDesign: input.surveyDesign ?? false,
    repeatedMeasures: input.repeatedMeasures ?? false,
    clustered: input.clustered ?? false,
    timeToEvent: input.timeToEvent ?? false,
    highDimensional: input.highDimensional ?? false,
    text: input.text ?? false,
    image: input.image ?? false,
    spatial: input.spatial ?? false,
    network: input.network ?? false,
    maxCandidates: input.maxCandidates ?? 10,
  };
  const enriched = enrichRequest(request);
  const scored = analysisMethodCatalog.map(method => scoreMethod(method, enriched));
  const excluded = scored.filter(item => item.score < item.method.selection.minScore).map(item => ({ methodId: item.method.id, reason: `score ${item.score.toFixed(2)} below threshold ${item.method.selection.minScore.toFixed(2)}` }));
  const candidates = scored
    .filter(item => item.score >= item.method.selection.minScore)
    .sort((a, b) => b.score - a.score || a.method.id.localeCompare(b.method.id))
    .slice(0, request.maxCandidates)
    .map((item, index): MethodCandidate => ({
      method: item.method,
      score: Number(item.score.toFixed(4)),
      rank: index + 1,
      fitReasons: item.fitReasons,
      cautions: item.cautions,
      requiredBeforeExecution: requirementsBeforeExecution(item.method, enriched),
    }));
  const primary = candidates[0] ?? null;
  const recommendedArchetype = primary ? archetypeForMethod(primary.method, enriched) : "cross-sectional-association";
  const recommendedBackend = primary ? backendForMethod(primary.method, enriched) : "python-statsmodels";
  const issues = uniqueIssues([
    ...(primary ? primary.cautions : candidates.flatMap(candidate => candidate.cautions)),
    ...(primary ? [] : [issue("blocker", "NO_METHOD_SELECTED", "No method met the minimum selection threshold.")]),
  ]);
  const stopForHumanReview = issues.some(item => item.severity === "blocker")
    || Boolean(primary?.method.stopForHumanReviewWhen.length)
    || ["causal", "diagnose", "economic", "qualitative", "mixed"].includes(request.goal ?? "");
  return {
    schemaVersion: 1,
    selectionId: `method_selection_${stableHash({ request, primary: primary?.method.id, candidates: candidates.map(candidate => candidate.method.id) }).slice(0, 12)}`,
    request,
    primary,
    candidates,
    excluded,
    recommendedArchetype,
    recommendedBackend,
    stopForHumanReview,
    issues,
    nextAction: primary
      ? `Promote ${primary.method.id} into AnalysisSpec V2, then build an execution contract with ${recommendedBackend}.`
      : "Clarify outcome type, study design, and data structure before execution.",
  };
}

export function validateMethodForSpec(spec: AnalysisSpecV2, method: AnalysisMethod): { status: "pass" | "warning" | "blocked"; issues: MachineIssue[] } {
  const issues: MachineIssue[] = [];
  if (!method.outcomeTypes.includes(outcomeTypeFromSpec(spec))) {
    issues.push(issue("blocker", "METHOD_OUTCOME_MISMATCH", `${method.id} does not support inferred outcome type ${outcomeTypeFromSpec(spec)}.`));
  }
  if (!method.compatibleBackends.includes(spec.backendRequirements.preferred)) {
    issues.push(issue("blocker", "METHOD_BACKEND_MISMATCH", `${method.id} is not compatible with preferred backend ${spec.backendRequirements.preferred}.`));
  }
  if (spec.surveyDesign.required && !method.dataStructures.includes("complex_survey") && !method.compatibleBackends.includes("r-survey")) {
    issues.push(issue("warning", "METHOD_SURVEY_LIMITED", `${method.id} does not explicitly support complex survey design.`));
  }
  for (const field of method.requiredFields) {
    if (field.includes("time") && !spec.variables.filters.concat(spec.variables.derived.map(item => item.name)).some(name => /time|date|follow/i.test(name))) {
      issues.push(issue("blocker", "METHOD_REQUIRED_TIME_FIELD_MISSING", `${method.id} requires ${field}.`));
    }
    if (field.includes("gold") && !spec.variables.derived.some(item => /gold|reference/i.test(item.name + item.expression))) {
      issues.push(issue("blocker", "METHOD_REQUIRED_GOLD_STANDARD_MISSING", `${method.id} requires ${field}.`));
    }
  }
  if (method.implementationStatus === "design-only" || method.implementationStatus === "blocked") {
    issues.push(issue("blocker", "METHOD_NOT_EXECUTABLE", `${method.id} is ${method.implementationStatus}; use it for design/contracting only until a verified runner exists.`));
  }
  return { status: issues.some(item => item.severity === "blocker") ? "blocked" : issues.length ? "warning" : "pass", issues };
}

export function applyMethodSelectionToSpec(spec: AnalysisSpecV2, selection: MethodSelectionResult): AnalysisSpecV2 {
  if (!selection.primary) return spec;
  const method = selection.primary.method;
  const preferred = selection.recommendedBackend;
  const allowed = [...new Set([preferred, ...method.compatibleBackends])].filter(isBackendUsable);
  const specWithoutHash = {
    ...spec,
    archetype: selection.recommendedArchetype,
    model: {
      ...spec.model,
      family: method.modelFamily,
      diagnostics: [...new Set([...spec.model.diagnostics, ...method.diagnostics])],
    },
    backendRequirements: {
      ...spec.backendRequirements,
      preferred,
      allowed: allowed.length ? allowed : spec.backendRequirements.allowed,
      minimumCapabilities: [...new Set([...spec.backendRequirements.minimumCapabilities, ...method.requiredFields, ...method.qaGates])],
    },
    artifactExpectations: mergeArtifactExpectations(spec, method),
    sensitivityAnalyses: mergeSensitivity(spec, method),
  };
  return { ...specWithoutHash, specHash: stableHash(specWithoutHash) };
}

function mergeArtifactExpectations(spec: AnalysisSpecV2, method: AnalysisMethod): AnalysisSpecV2["artifactExpectations"] {
  const existing = new Map(spec.artifactExpectations.map(item => [item.path, item]));
  for (const artifact of method.artifactExpectations) {
    if (!existing.has(artifact)) existing.set(artifact, { path: artifact, role: "method-required-artifact", required: true, validator: artifact.endsWith(".json") ? "json-schema" : "artifact-exists" });
  }
  return [...existing.values()];
}

function mergeSensitivity(spec: AnalysisSpecV2, method: AnalysisMethod): AnalysisSpecV2["sensitivityAnalyses"] {
  const existing = new Map(spec.sensitivityAnalyses.map(item => [item.id, item]));
  for (const diagnostic of [...method.missingDataRequirements, ...method.multiplicityRequirements]) {
    const id = diagnostic.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    if (id && !existing.has(id)) existing.set(id, { id, description: diagnostic, required: true });
  }
  return [...existing.values()];
}

function enrichRequest(request: MethodSelectionRequest): MethodSelectionRequest {
  const lower = request.question.toLowerCase();
  const dataStructures = new Set(request.dataStructures);
  if (request.surveyDesign || lower.includes("survey") || lower.includes("nhanes") || request.dataset === "nhanes" || request.dataset === "brfss") dataStructures.add("complex_survey");
  if (request.repeatedMeasures || /repeated|monthly|longitudinal|trajectory|growth/.test(lower)) dataStructures.add("repeated_measures");
  if (request.clustered || /cluster|hospital|school|provider|nested/.test(lower)) dataStructures.add("clustered");
  if (request.timeToEvent || /survival|time to|hazard|readmission|death over time/.test(lower)) dataStructures.add("survival");
  if (request.highDimensional || /omics|gene|proteomic|many variables|high-dimensional/.test(lower)) dataStructures.add("high_dimensional");
  if (request.text || /text|note|nlp|topic|sentiment/.test(lower)) dataStructures.add("text_corpus");
  if (request.image || /image|radiology|signal|ecg|eeg|wavelet/.test(lower)) dataStructures.add("image_collection");
  if (request.spatial || /spatial|geographic|gis|hotspot|moran/.test(lower)) dataStructures.add("spatial_units");
  if (request.network || /network|graph|centrality|community/.test(lower)) dataStructures.add("network_graph");
  return {
    ...request,
    outcomeType: request.outcomeType ?? inferOutcomeType(lower),
    studyDesign: request.studyDesign ?? inferStudyDesign(lower),
    dataStructures: [...dataStructures],
    goal: request.goal ?? inferGoal(lower),
  };
}

function scoreMethod(method: AnalysisMethod, request: MethodSelectionRequest): { method: AnalysisMethod; score: number; fitReasons: string[]; cautions: MachineIssue[] } {
  const lower = request.question.toLowerCase();
  let score = 0.05;
  const fitReasons: string[] = [];
  const cautions: MachineIssue[] = [];
  const keywordHits = method.selection.keywords.filter(keyword => lower.includes(keyword.toLowerCase()));
  if (keywordHits.length) {
    score += Math.min(0.36, keywordHits.length * 0.09);
    fitReasons.push(`question keyword match: ${keywordHits.slice(0, 4).join(", ")}`);
  }
  const antiHits = method.selection.antiKeywords.filter(keyword => lower.includes(keyword.toLowerCase()));
  if (antiHits.length) score -= Math.min(0.35, antiHits.length * 0.12);
  if (request.outcomeType && method.outcomeTypes.includes(request.outcomeType)) {
    score += 0.18;
    fitReasons.push(`supports outcome type ${request.outcomeType}`);
  }
  if (request.studyDesign && method.studyDesigns.includes(request.studyDesign)) {
    score += 0.12;
    fitReasons.push(`supports study design ${request.studyDesign}`);
  }
  const structureHits = request.dataStructures.filter(structure => method.dataStructures.includes(structure));
  if (structureHits.length) {
    score += Math.min(0.18, structureHits.length * 0.08);
    fitReasons.push(`supports data structure ${structureHits.join(", ")}`);
  }
  if (request.goal && goalMatchesMethod(request.goal, method)) {
    score += 0.14;
    fitReasons.push(`matches goal ${request.goal}`);
  }
  if ((request.dataset === "nhanes" || request.dataset === "brfss" || request.surveyDesign) && method.compatibleBackends.includes("r-survey")) {
    score += 0.07;
    fitReasons.push("compatible with survey backend");
  }
  if (method.implementationStatus === "executable") score += 0.08;
  if (method.implementationStatus === "design-only") cautions.push(issue("blocker", "METHOD_DESIGN_ONLY", `${method.id} is design-only until a verified runner is available.`));
  if (method.implementationStatus === "blocked") cautions.push(issue("blocker", "METHOD_BLOCKED", `${method.id} is blocked.`));
  if (method.compatibleBackends.every(backend => getBackendManifest(backend).productionStatus === "future" || getBackendManifest(backend).productionStatus === "blocked")) {
    cautions.push(issue("blocker", "METHOD_NO_PRODUCTION_BACKEND", `${method.id} has no production-ready backend yet.`));
  }
  if (method.stopForHumanReviewWhen.length) cautions.push(issue("note", "HUMAN_REVIEW_GATE", method.stopForHumanReviewWhen[0] ?? "Human review required."));
  if (request.surveyDesign && !method.dataStructures.includes("complex_survey") && !method.compatibleBackends.includes("r-survey")) {
    cautions.push(issue("warning", "SURVEY_SUPPORT_NOT_EXPLICIT", `${method.id} does not explicitly support complex survey design.`));
    score -= 0.08;
  }
  return { method, score: Math.max(0, Math.min(1, score)), fitReasons, cautions };
}

function requirementsBeforeExecution(method: AnalysisMethod, request: MethodSelectionRequest): string[] {
  return [
    ...method.requiredFields.map(field => `provide ${field}`),
    ...method.assumptions.map(assumption => `confirm assumption: ${assumption}`),
    ...method.diagnostics.map(diagnostic => `produce diagnostic: ${diagnostic}`),
    ...(request.surveyDesign ? ["verify survey weight/strata/PSU and domain/subsample eligibility"] : []),
  ];
}

function archetypeForMethod(method: AnalysisMethod, request: MethodSelectionRequest): StudyArchetypeId {
  if (method.category === "diagnostic_prognostic") return "diagnostic-accuracy";
  if (method.category === "prediction_machine_learning" || method.category === "model_validation") return "prediction-model";
  if (method.category === "causal_inference" || method.id.includes("mediation")) return "target-trial-emulation-sketch";
  if (method.category === "time_series") return "interrupted-time-series";
  if (method.id === "difference-in-differences") return "difference-in-differences";
  if (method.category === "survival_time_to_event") return "target-trial-emulation-sketch";
  if (request.dataStructures.includes("complex_survey") && method.category === "descriptive") return "survey-prevalence";
  if (request.dataStructures.includes("complex_survey") && method.category === "sensitivity_subgroup_secondary") return "subgroup-domain-analysis";
  if (request.dataStructures.includes("complex_survey") && method.id.includes("subsample")) return "subsample-high-missingness";
  if (method.modelFamily === "logistic" || method.outcomeTypes.includes("binary")) return "binary-outcome-model";
  if (method.modelFamily === "linear" || method.outcomeTypes.includes("continuous")) return "continuous-biomarker-model";
  return "cross-sectional-association";
}

function backendForMethod(method: AnalysisMethod, request: MethodSelectionRequest): BackendId {
  const preferred = method.compatibleBackends.find(backend => {
    if ((request.surveyDesign || request.dataStructures.includes("complex_survey")) && backend === "r-survey") return true;
    return getBackendManifest(backend).productionStatus === "available";
  });
  return preferred ?? method.compatibleBackends[0] ?? "python-statsmodels";
}

function isBackendUsable(backend: BackendId): boolean {
  return getBackendManifest(backend).productionStatus !== "blocked";
}

function issue(severity: MachineIssue["severity"], code: string, message: string, evidenceRefs: string[] = []): MachineIssue {
  return { severity, code, message, evidenceRefs };
}

function uniqueIssues(issues: MachineIssue[]): MachineIssue[] {
  const seen = new Set<string>();
  const out: MachineIssue[] = [];
  for (const item of issues) {
    const key = `${item.severity}:${item.code}:${item.message}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

function inferOutcomeType(lower: string): OutcomeType {
  if (/survival|time to|hazard|recurrence|readmission/.test(lower)) return "time_to_event";
  if (/count|number of|visits|infections|hospitalizations/.test(lower)) return "count";
  if (/binary|yes\/no|death|disease|admitted|complication|elevated|odds/.test(lower)) return "binary";
  if (/ordinal|severity|likert|ordered/.test(lower)) return "ordinal";
  if (/text|note|nlp|sentiment/.test(lower)) return "text";
  if (/image|ecg|eeg|signal|radiology/.test(lower)) return "image";
  if (/spatial|geographic|gis/.test(lower)) return "spatial";
  if (/network|graph/.test(lower)) return "network";
  if (/omics|gene|high-dimensional|many variables/.test(lower)) return "high_dimensional";
  if (/qualitative|theme|interview/.test(lower)) return "qualitative";
  if (/category|multinomial|class/.test(lower)) return "categorical";
  return "continuous";
}

function inferStudyDesign(lower: string): StudyDesign {
  if (/randomized|trial|itt|noninferiority/.test(lower)) return "randomized_trial";
  if (/case-control|case control/.test(lower)) return "case_control";
  if (/cohort|follow-up|follow up|incidence/.test(lower)) return "cohort";
  if (/diagnostic|sensitivity|specificity/.test(lower)) return "diagnostic";
  if (/predict|risk score|validation/.test(lower)) return "prediction";
  if (/meta-analysis|systematic review|forest plot/.test(lower)) return "meta_analysis";
  if (/qualitative|thematic|interview/.test(lower)) return "qualitative";
  if (/mixed methods|triangulation/.test(lower)) return "mixed_methods";
  if (/time series|forecast|policy change/.test(lower)) return "time_series";
  if (/spatial|geographic|gis/.test(lower)) return "spatial";
  if (/network|graph/.test(lower)) return "network";
  if (/cost|qaly|icer/.test(lower)) return "economic_evaluation";
  if (/reliability|agreement|scale|questionnaire/.test(lower)) return "measurement";
  return "cross_sectional";
}

function inferGoal(lower: string): MethodSelectionRequest["goal"] {
  if (/describe|summary|baseline|table 1|prevalence/.test(lower)) return "describe";
  if (/compare|difference between|t-test|anova|chi-square/.test(lower)) return "compare_groups";
  if (/predict|classification|risk score|auc/.test(lower)) return "predict";
  if (/diagnostic|sensitivity|specificity|roc/.test(lower)) return "diagnose";
  if (/causal|effect of|treatment effect|propensity|difference in differences/.test(lower)) return "causal";
  if (/validate|calibration|cross-validation/.test(lower)) return "validate";
  if (/cluster|discover|pca|factor/.test(lower)) return "discover";
  if (/meta-analysis|systematic review/.test(lower)) return "synthesize";
  if (/reliability|agreement|scale/.test(lower)) return "measure";
  if (/cost|qaly|icer/.test(lower)) return "economic";
  if (/qualitative|thematic/.test(lower)) return "qualitative";
  if (/mixed methods|triangulation/.test(lower)) return "mixed";
  return "associate";
}

function goalMatchesMethod(goal: NonNullable<MethodSelectionRequest["goal"]>, method: AnalysisMethod): boolean {
  const map: Record<typeof goal, AnalysisMethodCategory[]> = {
    describe: ["descriptive", "epidemiologic", "survey_questionnaire"],
    compare_groups: ["group_comparison", "nonparametric_resampling", "clinical_trial"],
    associate: ["correlation_association", "linear_regression", "logistic_regression", "generalized_linear_model", "count_regression", "epidemiologic"],
    predict: ["prediction_machine_learning", "diagnostic_prognostic", "model_validation"],
    diagnose: ["diagnostic_prognostic"],
    causal: ["causal_inference", "mediation_moderation_path", "clinical_trial"],
    validate: ["model_validation", "model_diagnostics", "agreement_reliability"],
    discover: ["dimensionality_latent", "clustering_subgroup_discovery", "high_dimensional"],
    synthesize: ["meta_analysis"],
    measure: ["agreement_reliability", "survey_questionnaire", "structural_equation_modeling"],
    economic: ["health_economics"],
    qualitative: ["qualitative", "text_nlp"],
    mixed: ["mixed_methods"],
  };
  return map[goal].includes(method.category);
}

function outcomeTypeFromSpec(spec: AnalysisSpecV2): OutcomeType {
  if (spec.model.family === "logistic") return "binary";
  if (spec.model.family === "survival") return "time_to_event";
  if (spec.model.family === "count") return "count";
  if (spec.model.family === "ordinal") return "ordinal";
  if (spec.model.family === "prediction") return "binary";
  return "continuous";
}
