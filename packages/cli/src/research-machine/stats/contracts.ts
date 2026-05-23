import { z } from "zod";
import { statsMethodSchema, type StatsMethod } from "./schemas.js";

export const figureSpecSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  type: z.enum([
    "histogram",
    "density",
    "boxplot",
    "heatmap",
    "scatter",
    "line",
    "forest",
    "coefficient",
    "residual",
    "qq",
    "influence",
    "survival",
    "cumulative_incidence",
    "risk_table",
    "love_plot",
    "overlap",
    "roc",
    "precision_recall",
    "calibration",
    "confusion_matrix",
    "missingness",
    "scree",
    "agreement",
    "diagnostic",
  ]),
  required: z.boolean(),
  sourceColumns: z.array(z.string()),
  qaGates: z.array(z.string()),
  captionRequirements: z.array(z.string()),
});
export type FigureSpec = z.infer<typeof figureSpecSchema>;

export const statisticalMethodSpecSchema = z.object({
  schemaVersion: z.literal(1),
  method: statsMethodSchema,
  family: z.enum([
    "descriptive",
    "core_inference",
    "correlation",
    "regression_glm",
    "survival",
    "longitudinal",
    "causal",
    "prediction",
    "missingness",
    "measurement",
    "dimension_reduction",
    "clustering",
    "power",
  ]),
  requiredArguments: z.array(z.string()),
  allowedBackends: z.array(z.enum(["python-scipy", "python-statsmodels", "python-sklearn", "python-lifelines", "r-survey", "r-survival", "r-cmprsk", "manual-review"])),
  assumptions: z.array(z.string()),
  diagnostics: z.array(z.string()),
  expectedTables: z.array(z.string()),
  expectedFigures: z.array(figureSpecSchema),
  qaGates: z.array(z.string()),
  failureModes: z.array(z.string()),
  interpretationBoundary: z.string().min(1),
  escalationRules: z.array(z.string()),
});
export type StatisticalMethodSpec = z.infer<typeof statisticalMethodSpecSchema>;

const coreInference = new Set<StatsMethod>([
  "t-test",
  "paired-t-test",
  "welch-t-test",
  "anova",
  "ancova",
  "mann-whitney",
  "wilcoxon",
  "kruskal-wallis",
  "friedman",
  "chi-square",
  "fisher-exact",
  "mcnemar",
  "cochran-armitage-trend",
]);

const correlations = new Set<StatsMethod>(["pearson", "spearman", "kendall", "partial-correlation"]);

const regressionGlm = new Set<StatsMethod>([
  "linear-regression",
  "robust-linear-regression",
  "logistic-regression",
  "ordinal-logistic-regression",
  "multinomial-logistic-regression",
  "poisson-regression",
  "negative-binomial-regression",
  "zero-inflated-poisson",
  "zero-inflated-negative-binomial",
  "gamma-glm",
  "inverse-gaussian-glm",
  "quantile-regression",
  "penalized-linear-regression",
  "penalized-logistic-regression",
]);

const survival = new Set<StatsMethod>([
  "kaplan-meier",
  "log-rank",
  "cox-proportional-hazards",
  "stratified-cox",
  "time-varying-cox",
  "fine-gray",
  "aalen-johansen-cif",
  "recurrent-event-rate",
]);

const longitudinal = new Set<StatsMethod>([
  "linear-mixed-model",
  "generalized-mixed-model",
  "gee",
  "repeated-measures-anova",
]);

const causal = new Set<StatsMethod>([
  "overlap-weighting",
  "entropy-balancing",
  "doubly-robust-aipw",
  "difference-in-differences",
  "event-study-did",
  "interrupted-time-series",
  "regression-discontinuity",
  "instrumental-variables-2sls",
  "target-trial-emulation-spec",
  "unmeasured-confounding-sensitivity",
  "propensity-score-matching",
  "propensity-score-weighting",
]);

const missingness = new Set<StatsMethod>([
  "missingness-summary",
  "multiple-imputation-mice",
  "missingness-ipw",
  "complete-case-sensitivity",
  "mnar-sensitivity",
]);

const measurement = new Set<StatsMethod>([
  "reliability-kappa",
  "intraclass-correlation",
  "cronbach-alpha",
  "bland-altman",
  "multiple-comparison-correction",
]);

function familyFor(method: StatsMethod): StatisticalMethodSpec["family"] {
  if (method === "descriptive") return "descriptive";
  if (method === "prediction-evaluation" || method === "diagnostic-accuracy") return "prediction";
  if (method === "model-diagnostics") return "regression_glm";
  if (method === "pca") return "dimension_reduction";
  if (method === "clustering-validation") return "clustering";
  if (method === "power-sample-size") return "power";
  if (coreInference.has(method)) return "core_inference";
  if (correlations.has(method)) return "correlation";
  if (regressionGlm.has(method)) return "regression_glm";
  if (survival.has(method)) return "survival";
  if (longitudinal.has(method)) return "longitudinal";
  if (causal.has(method)) return "causal";
  if (missingness.has(method)) return "missingness";
  if (measurement.has(method)) return "measurement";
  return "descriptive";
}

function requiredArgumentsFor(method: StatsMethod): string[] {
  const regression = ["outcome", "exposure"];
  if (method === "descriptive" || method === "missingness-summary" || method === "multiple-imputation-mice" || method === "pca" || method === "clustering-validation" || method === "cronbach-alpha" || method === "multiple-comparison-correction" || method === "power-sample-size" || method === "reliability-kappa" || method === "intraclass-correlation" || method === "bland-altman") return ["variables"];
  if (["t-test", "welch-t-test", "mann-whitney", "anova", "kruskal-wallis"].includes(method)) return ["outcome", "group"];
  if (method === "ancova") return ["outcome", "group", "covariates"];
  if (["paired-t-test", "wilcoxon"].includes(method)) return ["variables"];
  if (method === "mcnemar") return ["outcome", "exposure"];
  if (method === "friedman") return ["variables"];
  if (["chi-square", "fisher-exact", "cochran-armitage-trend", "diagnostic-accuracy", "prediction-evaluation"].includes(method)) return ["outcome", "exposure"];
  if (method === "partial-correlation") return ["outcome", "exposure", "covariates"];
  if (correlations.has(method)) return ["outcome", "exposure"];
  if (regressionGlm.has(method)) return regression;
  if (method === "kaplan-meier" || method === "log-rank") return ["time", "event", "group"];
  if (method === "aalen-johansen-cif") return ["time", "event"];
  if (["cox-proportional-hazards", "time-varying-cox", "fine-gray"].includes(method)) return ["time", "event", "exposure"];
  if (method === "stratified-cox") return ["time", "event", "exposure", "strata"];
  if (method === "recurrent-event-rate") return ["time", "event", "id"];
  if (longitudinal.has(method)) return ["outcome", "exposure", "cluster or id"];
  if (["overlap-weighting", "entropy-balancing", "doubly-robust-aipw", "propensity-score-matching", "propensity-score-weighting"].includes(method)) return ["outcome", "exposure", "covariates"];
  if (["difference-in-differences", "event-study-did"].includes(method)) return ["outcome", "exposure", "post"];
  if (method === "interrupted-time-series") return ["outcome", "time", "post"];
  if (method === "regression-discontinuity") return ["outcome", "running variable", "cutoff"];
  if (method === "instrumental-variables-2sls") return ["outcome", "exposure", "instrument"];
  if (["missingness-ipw", "complete-case-sensitivity", "mnar-sensitivity", "model-diagnostics"].includes(method)) return ["outcome"];
  return [];
}

function figure(id: string, label: string, type: FigureSpec["type"], sourceColumns: string[], required = false): FigureSpec {
  return {
    id,
    label,
    type,
    required,
    sourceColumns,
    qaGates: ["file-written", "nonblank-render", "axis-labels", "caption", "source-data"],
    captionRequirements: ["state analyzed variables", "state design boundary", "avoid causal language unless design supports it"],
  };
}

function figuresFor(method: StatsMethod, family: StatisticalMethodSpec["family"]): FigureSpec[] {
  if (method === "descriptive") return [
    figure("numeric-distributions", "Numeric distributions", "histogram", ["variables"], true),
    figure("missingness-by-variable", "Missingness by variable", "missingness", ["variables"], true),
  ];
  if (family === "core_inference") {
    if (["chi-square", "fisher-exact", "mcnemar", "cochran-armitage-trend"].includes(method)) return [figure("contingency-table-heatmap", "Contingency table heatmap", "heatmap", ["outcome", "exposure"], true)];
    return [figure("outcome-distribution-by-group", "Outcome distribution by group", "boxplot", ["outcome", "group"], true)];
  }
  if (family === "correlation") return [figure("correlation-scatter", "Correlation scatterplot", "scatter", ["outcome", "exposure"], true)];
  if (family === "regression_glm") return [
    figure("coefficient-plot", "Coefficient or effect-size plot", "coefficient", ["outcome", "exposure", "covariates"]),
    figure("residual-diagnostics", "Residual diagnostics", "residual", ["outcome", "exposure", "covariates"]),
    figure("influence-diagnostics", "Influence diagnostics", "influence", ["outcome", "exposure", "covariates"]),
  ];
  if (family === "survival") {
    if (method === "aalen-johansen-cif" || method === "fine-gray") return [figure("cumulative-incidence", "Cumulative incidence", "cumulative_incidence", ["time", "event", "group"], true)];
    if (method === "cox-proportional-hazards" || method === "stratified-cox" || method === "time-varying-cox") return [
      figure("hazard-ratio-forest", "Hazard ratio forest plot", "forest", ["time", "event", "exposure", "covariates"], true),
      figure("ph-diagnostic", "Proportional-hazards diagnostic", "diagnostic", ["time", "event", "exposure", "covariates"]),
    ];
    if (method === "recurrent-event-rate") return [
      figure("event-rate-summary", "Event-rate summary", "line", ["time", "event", "id"], true),
    ];
    return [
      figure("survival-curve", "Survival curve", "survival", ["time", "event", "group"], true),
      figure("risk-table", "Risk table", "risk_table", ["time", "event", "group"]),
    ];
  }
  if (family === "causal") {
    if (method.includes("propensity") || method === "overlap-weighting" || method === "doubly-robust-aipw") return [
      figure("covariate-balance-love-plot", "Covariate balance love plot", "love_plot", ["exposure", "covariates"], true),
      figure("propensity-overlap", "Propensity score overlap", "overlap", ["exposure", "covariates"], true),
    ];
    if (method === "entropy-balancing") return [
      figure("covariate-balance-love-plot", "Covariate balance love plot", "love_plot", ["exposure", "covariates"], true),
      figure("weight-overlap-diagnostic", "Weight overlap diagnostic", "overlap", ["exposure", "covariates"]),
    ];
    return [figure("design-diagnostic-plot", "Quasi-experimental design diagnostic", "diagnostic", ["outcome", "exposure", "time"])];
  }
  if (family === "prediction") return [
    figure("roc-curve", "ROC curve", "roc", ["outcome", "exposure"], method === "prediction-evaluation"),
    figure("precision-recall-curve", "Precision-recall curve", "precision_recall", ["outcome", "exposure"], method === "prediction-evaluation"),
    figure("calibration-plot", "Calibration plot", "calibration", ["outcome", "exposure"], method === "prediction-evaluation"),
    figure("confusion-matrix", "Confusion matrix", "confusion_matrix", ["outcome", "exposure"]),
  ];
  if (family === "missingness") return [
    figure("missingness-by-variable", "Missingness by variable", "missingness", ["variables"], true),
    figure("missingness-pattern-heatmap", "Missingness pattern heatmap", "heatmap", ["variables"]),
  ];
  if (family === "dimension_reduction") return [figure("pca-scree", "PCA scree plot", "scree", ["variables"], true)];
  if (family === "clustering") return [figure("cluster-diagnostic", "Cluster diagnostic plot", "scatter", ["variables"])];
  if (family === "measurement") return [figure("agreement-or-scale-diagnostic", "Agreement or scale diagnostic", "agreement", ["variables"])];
  return [];
}

function assumptionsFor(method: StatsMethod, family: StatisticalMethodSpec["family"]): string[] {
  const common = ["Variables are correctly typed, coded, and temporally eligible for the stated design.", "Missingness and complete-case exclusions are reported before inference."];
  if (family === "core_inference") return [...common, "Observations match the requested independent, paired, or repeated-measure design.", "Distributional or exact-test assumptions are checked before interpreting p-values."];
  if (family === "regression_glm") return [...common, "Outcome family and link function match the data-generating scale.", "Linearity, collinearity, influential observations, convergence, and separation/overdispersion are reviewed as applicable."];
  if (family === "survival") return [...common, "Time zero, event coding, censoring, and competing events are explicitly defined.", "Proportional hazards or competing-risk assumptions are reviewed before model promotion."];
  if (family === "causal") return [...common, "Treatment/exposure is temporally before outcome.", "Exchangeability, positivity, consistency, and no post-treatment adjustment are assessed.", "Balance diagnostics must be reviewed before outcome claims."];
  if (family === "prediction") return [...common, "Scores are generated without target leakage.", "Discrimination, calibration, threshold behavior, and validation split provenance are reviewed."];
  if (family === "missingness") return [...common, "The missing-data mechanism is reviewed and sensitivity analyses are reported for complete-case or imputed estimates."];
  if (family === "longitudinal") return [...common, "Within-unit correlation structure and clustering identifiers are valid.", "Repeated records have coherent timing and no duplicate impossible measurements."];
  if (family === "measurement") return [...common, "Items/raters measure comparable constructs and coding direction is reviewed."];
  if (family === "dimension_reduction" || family === "clustering") return [...common, "Variables are scaled or transformed consistently and unsupervised outputs are not overinterpreted as validated clinical classes."];
  if (family === "power") return ["Effect size, alpha, power target, allocation ratio, and test family are prespecified before using sample-size estimates."];
  return common;
}

function diagnosticsFor(method: StatsMethod, family: StatisticalMethodSpec["family"]): string[] {
  if (family === "core_inference") return ["sample size", "group/cell counts", "effect size", "confidence interval", "distribution or expected-cell diagnostics"];
  if (family === "regression_glm") return ["n_obs", "n_predictors", "convergence", "max_vif", "influence", "residuals", "family-specific diagnostics"];
  if (family === "survival") return ["event count", "censoring count", "time range", "proportional hazards review", "competing event accounting"];
  if (family === "causal") return ["propensity overlap", "covariate balance", "positivity", "weight distribution", "estimand", "sensitivity analysis"];
  if (family === "prediction") return ["event count", "AUROC/AUPRC", "Brier score", "calibration", "confusion matrix", "threshold rule"];
  if (family === "missingness") return ["missing fraction", "missingness patterns", "imputation model metadata", "complete-case sensitivity"];
  if (family === "longitudinal") return ["cluster count", "records per cluster", "correlation structure", "convergence"];
  if (family === "measurement") return ["item count", "rater/measure count", "agreement table", "confidence interval"];
  if (family === "dimension_reduction") return ["component count", "explained variance", "loadings", "transformed scores"];
  if (family === "clustering") return ["cluster count", "minimum cluster size", "silhouette", "Davies-Bouldin", "Calinski-Harabasz"];
  if (family === "power") return ["effect size", "alpha", "target power", "required n"];
  return ["row count", "missingness", "distribution summaries"];
}

function allowedBackendsFor(method: StatsMethod, family: StatisticalMethodSpec["family"]): StatisticalMethodSpec["allowedBackends"] {
  if (method === "fine-gray") return ["r-cmprsk", "manual-review"];
  if (family === "survival") return ["python-lifelines", "r-survival", "r-cmprsk", "manual-review"];
  if (family === "causal" || family === "prediction" || family === "dimension_reduction" || family === "clustering") return ["python-sklearn", "python-statsmodels", "manual-review"];
  if (family === "core_inference" || family === "correlation" || family === "missingness" || family === "measurement" || family === "power") return ["python-scipy", "python-statsmodels", "python-sklearn", "manual-review"];
  return ["python-statsmodels", "python-scipy", "manual-review"];
}

function expectedTablesFor(method: StatsMethod, family: StatisticalMethodSpec["family"]): string[] {
  const base = ["stats-summary.json", "estimates.csv", "diagnostics.json"];
  if (family === "causal") return [...base, "balance diagnostics", "propensity/weight artifacts where applicable"];
  if (family === "prediction") return [...base, "threshold metrics", "calibration table"];
  if (family === "missingness") return [...base, "missingness table", "imputed data or sensitivity table where applicable"];
  if (family === "dimension_reduction") return [...base, "pca-loadings.csv", "pca-transformed.csv"];
  if (family === "clustering") return [...base, "cluster assignments"];
  if (method === "multiple-comparison-correction") return [...base, "adjusted-p-values.csv"];
  return base;
}

function qaGatesFor(_method: StatsMethod, family: StatisticalMethodSpec["family"]): string[] {
  const common = ["preflight-reliability-gate", "required-variables", "semantic-plausibility", "effect-estimate-table", "figure-quality", "claim-boundary"];
  if (family === "regression_glm") return [...common, "convergence", "collinearity", "influence", "overfitting-risk"];
  if (family === "survival") return [...common, "event-count", "time-zero", "censoring", "proportional-hazards-or-competing-risk-review"];
  if (family === "causal") return [...common, "temporality", "balance", "positivity", "no-post-treatment-adjustment", "unmeasured-confounding-sensitivity"];
  if (family === "prediction") return [...common, "leakage", "discrimination", "calibration", "threshold-validity", "validation-split"];
  if (family === "missingness") return [...common, "missingness-mechanism", "imputation-provenance", "complete-case-sensitivity"];
  if (family === "core_inference") return [...common, "sample-size", "assumption-review", "effect-size"];
  return common;
}

function failureModesFor(method: StatsMethod, family: StatisticalMethodSpec["family"]): string[] {
  const common = ["missing required columns", "high missingness", "semantically impossible values", "too few complete cases", "unsupported claim language"];
  if (family === "regression_glm") return [...common, "non-convergence", "perfect separation", "high collinearity", "influential observations", "wrong outcome family"];
  if (family === "survival") return [...common, "ambiguous time zero", "few events", "invalid censoring", "proportional hazards violation", "unmodeled competing risk"];
  if (family === "causal") return [...common, "positivity violation", "poor covariate balance", "post-treatment adjustment", "immortal time bias", "unmeasured confounding"];
  if (family === "prediction") return [...common, "target leakage", "uncalibrated scores", "class imbalance", "invalid validation split"];
  if (family === "missingness") return [...common, "MNAR sensitivity absent", "imputation model mismatch", "complete-case bias"];
  if (method.includes("zero-inflated")) return [...common, "insufficient zeros", "zero-inflation unsupported by data"];
  return common;
}

function interpretationBoundaryFor(family: StatisticalMethodSpec["family"]): string {
  if (family === "causal") return "Causal language is allowed only when design assumptions, temporality, balance/identification diagnostics, and sensitivity analyses are explicitly satisfied.";
  if (family === "prediction") return "Prediction claims are bounded to the validation design and cannot imply clinical deployability without external validation and calibration review.";
  if (family === "survival") return "Time-to-event estimates depend on correct time zero, event/censoring definitions, and assumption checks; competing-risk claims require competing-risk machinery.";
  if (family === "missingness") return "Missing-data outputs describe robustness under declared assumptions, not proof that missingness is ignorable.";
  if (family === "dimension_reduction" || family === "clustering") return "Unsupervised structure is hypothesis-generating unless externally validated.";
  return "Associational or descriptive outputs are bounded to the analyzed table and declared design; they do not imply causality by default.";
}

export function getStatisticalMethodSpec(method: StatsMethod): StatisticalMethodSpec {
  const family = familyFor(method);
  return statisticalMethodSpecSchema.parse({
    schemaVersion: 1,
    method,
    family,
    requiredArguments: requiredArgumentsFor(method),
    allowedBackends: allowedBackendsFor(method, family),
    assumptions: assumptionsFor(method, family),
    diagnostics: diagnosticsFor(method, family),
    expectedTables: expectedTablesFor(method, family),
    expectedFigures: figuresFor(method, family),
    qaGates: qaGatesFor(method, family),
    failureModes: failureModesFor(method, family),
    interpretationBoundary: interpretationBoundaryFor(family),
    escalationRules: [
      "Block execution when required arguments or required variables are missing.",
      "Route to human/methods review when assumptions are not verifiable from available artifacts.",
      "Prefer redesign over repair when the failure is semantic, causal-identification, temporality, or data-quality related.",
    ],
  });
}

export function listStatisticalMethodSpecs(): StatisticalMethodSpec[] {
  return statsMethodSchema.options.map(method => getStatisticalMethodSpec(method));
}
