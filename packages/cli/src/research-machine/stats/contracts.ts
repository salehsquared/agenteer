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

export interface StatsRunnerCapability {
  method: StatsMethod;
  status: "executable" | "bounded_approximation" | "backend_blocked";
  reason: string;
  requiredFollowUp: string[];
  cannotSupport: string[];
}

export interface QaGateAliasAudit {
  totalMethods: number;
  totalUniqueGates: number;
  abstractGateCount: number;
  concreteGateCount: number;
  unmappedAbstractGates: string[];
  gateAliases: Array<{
    gate: string;
    acceptedIds: string[];
    methods: StatsMethod[];
    aliasStatus: "abstract_mapped" | "abstract_unmapped" | "concrete";
  }>;
}

export interface FigureAliasAudit {
  totalMethods: number;
  totalFigures: number;
  requiredFigureCount: number;
  optionalFigureCount: number;
  abstractFigureCount: number;
  concreteFigureCount: number;
  unmappedAbstractFigures: Array<{
    method: StatsMethod;
    figureId: string;
  }>;
  figureAliases: Array<{
    method: StatsMethod;
    figureId: string;
    label: string;
    type: FigureSpec["type"];
    required: boolean;
    acceptedIds: string[];
    aliasStatus: "abstract_mapped" | "abstract_unmapped" | "concrete";
  }>;
}

export interface FigureSourceColumnAudit {
  totalMethods: number;
  totalFigures: number;
  totalSourceColumnReferences: number;
  uniqueSourceColumns: string[];
  unknownSourceColumns: string[];
  sourceColumns: Array<{
    method: StatsMethod;
    figureId: string;
    sourceColumn: string;
    normalizedRole: string;
    acceptedRequestFields: string[];
    status: "known_role" | "unknown_role";
  }>;
}

export type StatsContractArgumentName =
  | "outcome"
  | "exposure"
  | "group"
  | "time"
  | "start"
  | "stop"
  | "timeOrStop"
  | "event"
  | "id"
  | "clusterOrId"
  | "strata"
  | "period"
  | "post"
  | "runningVariable"
  | "cutoff"
  | "instrument"
  | "variables"
  | "covariates";

export interface RequiredArgumentContractAudit {
  totalMethods: number;
  totalRequiredArgumentReferences: number;
  uniqueRequiredArguments: string[];
  unsupportedRequiredArguments: string[];
  requiredArguments: Array<{
    method: StatsMethod;
    argument: string;
    normalizedArgument: string;
    contractArgumentName: StatsContractArgumentName | null;
    acceptedRequestFields: string[];
    status: "mapped" | "unsupported";
  }>;
}

export interface TableArtifactContractAudit {
  totalMethods: number;
  totalExpectedTableEntries: number;
  requiredFileExpectationCount: number;
  conditionalFileExpectationCount: number;
  narrativeExpectationCount: number;
  missingCoreArtifacts: Array<{
    method: StatsMethod;
    missingFiles: string[];
  }>;
  tableArtifacts: Array<{
    method: StatsMethod;
    expectation: string;
    fileNames: string[];
    requirementStatus: "required_file" | "conditional_file" | "narrative_or_embedded";
  }>;
}

export function statsRunnerCapabilityForMethod(method: StatsMethod): StatsRunnerCapability {
  if (method === "fine-gray") {
    return {
      method,
      status: "bounded_approximation",
      reason: "The local route fits a transparent Fine-Gray-style subdistribution partial-likelihood approximation with competing events retained in risk sets, but without IPCW censoring weights from a validated competing-risk backend.",
      requiredFollowUp: ["Confirm subdistribution hazard ratios in R cmprsk/riskRegression or another validated competing-risk backend before confirmatory claims.", "Review competing-event coding, censoring support, risk-set support, and Aalen-Johansen CIF context."],
      cannotSupport: ["publication-grade Fine-Gray claim without backend confirmation", "IPCW censoring-weighted Fine-Gray inference", "unreviewed replacement of cause-specific Cox or Aalen-Johansen CIF"],
    };
  }
  if (method === "time-varying-cox") {
    return {
      method,
      status: "bounded_approximation",
      reason: "The local route fits start/stop counting-process Cox data when interval columns are provided, and otherwise falls back to predictor-by-log(time) interactions as a bounded extended-Cox approximation.",
      requiredFollowUp: ["Use --start and --stop for true interval-expanded time-varying covariates when available.", "Supply --id so subject-clustered robust variance and repeated-interval support are inspectable when subjects contribute multiple intervals.", "Review proportional-hazards diagnostics, interval support, and time-interaction fallback interpretation."],
      cannotSupport: ["strong time-varying covariate claim without interval support and backend confirmation", "unreviewed repeated-subject interval construction"],
    };
  }
  if (method === "recurrent-event-cox") {
    return {
      method,
      status: "bounded_approximation",
      reason: "The local route fits an Andersen-Gill-style start/stop recurrent-event Cox model through statsmodels PHReg and emits subject-clustered sandwich variance, but it does not provide frailty, ordered-event PWP, or negative-binomial recurrent-event inference.",
      requiredFollowUp: ["Confirm important recurrent-event hazard ratios in a dedicated survival backend when publication-grade recurrent-event inference is needed.", "Review interval construction, recurrent-event burden, within-subject dependence, event-order assumptions, robust variance, and overdispersion before confirmatory claims."],
      cannotSupport: ["publication-grade recurrent-event regression without robust/frailty/PWP confirmation", "ordered gap-time PWP inference", "frailty variance estimation", "negative-binomial recurrent-event inference"],
    };
  }
  if (method === "generalized-mixed-model") {
    return {
      method,
      status: "bounded_approximation",
      reason: "The local route uses statsmodels variational-Bayes binary random-intercept GLMM estimation.",
      requiredFollowUp: ["Confirm important GLMM results with a dedicated mixed-model backend.", "Review cluster support, convergence, and random-effect assumptions."],
      cannotSupport: ["confirmatory GLMM claim without backend confirmation", "complex random-slope or crossed random-effect inference"],
    };
  }
  if (method === "multiple-imputation-mice") {
    return {
      method,
      status: "bounded_approximation",
      reason: "The local route generates multiple seeded numeric IterativeImputer datasets and variability diagnostics; it does not Rubin-pool downstream model estimates.",
      requiredFollowUp: ["Run pooled imputation analysis with compatible imputation models before confirmatory inference.", "Compare complete-case, imputed, IPW, and MNAR sensitivity results.", "Use a mixed-type imputation backend when categorical variables need imputation."],
      cannotSupport: ["Rubin-pooled confirmatory estimate", "MAR/MNAR claim without human missingness review"],
    };
  }
  if (method === "target-trial-emulation-spec") {
    return {
      method,
      status: "bounded_approximation",
      reason: "The local route produces a target-trial protocol/checklist for design review; it does not estimate an effect by itself.",
      requiredFollowUp: ["Select and execute a downstream causal estimator after target-trial eligibility, timing, and adjustment review."],
      cannotSupport: ["causal effect estimate", "treatment recommendation", "completed emulation without downstream analysis"],
    };
  }
  if (["regression-discontinuity", "interrupted-time-series", "event-study-did", "instrumental-variables-2sls", "doubly-robust-aipw", "entropy-balancing", "overlap-weighting"].includes(method)) {
    return {
      method,
      status: "bounded_approximation",
      reason: "The local route is executable but intentionally bounded to standard-table diagnostics and assumption review for causal/quasi-experimental designs.",
      requiredFollowUp: ["Review identification assumptions.", "Inspect design support, balance/timing/positivity diagnostics, and sensitivity analyses before strong causal claims."],
      cannotSupport: ["automatic causal conclusion", "unreviewed policy or treatment recommendation"],
    };
  }
  return {
    method,
    status: "executable",
    reason: "The local standard-table runner has a direct execution path with preflight, method contract, artifacts, and QA.",
    requiredFollowUp: ["Review method-specific QA gates, diagnostics, and interpretation boundaries before promotion."],
    cannotSupport: ["claims beyond the declared study design and available diagnostics"],
  };
}

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
  "cochran-q",
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
  "recurrent-event-cox",
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
  if (method === "friedman" || method === "cochran-q") return ["variables"];
  if (["chi-square", "fisher-exact", "cochran-armitage-trend", "diagnostic-accuracy", "prediction-evaluation"].includes(method)) return ["outcome", "exposure"];
  if (method === "partial-correlation") return ["outcome", "exposure", "covariates"];
  if (correlations.has(method)) return ["outcome", "exposure"];
  if (regressionGlm.has(method)) return regression;
  if (method === "kaplan-meier") return ["time", "event"];
  if (method === "log-rank") return ["time", "event", "group"];
  if (method === "aalen-johansen-cif") return ["time", "event"];
  if (method === "time-varying-cox") return ["time or stop", "event", "exposure"];
  if (["cox-proportional-hazards", "fine-gray"].includes(method)) return ["time", "event", "exposure"];
  if (method === "stratified-cox") return ["time", "event", "exposure", "strata"];
  if (method === "recurrent-event-rate") return ["time", "event", "id"];
  if (method === "recurrent-event-cox") return ["start", "stop", "event", "id", "exposure"];
  if (longitudinal.has(method)) return ["outcome", "exposure", "cluster or id"];
  if (["overlap-weighting", "entropy-balancing", "doubly-robust-aipw", "propensity-score-matching", "propensity-score-weighting"].includes(method)) return ["outcome", "exposure", "covariates"];
  if (method === "difference-in-differences") return ["outcome", "exposure", "post"];
  if (method === "event-study-did") return ["outcome", "exposure", "period"];
  if (method === "interrupted-time-series") return ["outcome", "time", "post"];
  if (method === "regression-discontinuity") return ["outcome", "running variable", "cutoff"];
  if (method === "instrumental-variables-2sls") return ["outcome", "exposure", "instrument"];
  if (method === "target-trial-emulation-spec") return ["outcome", "exposure"];
  if (method === "model-diagnostics") return ["outcome", "exposure"];
  if (["missingness-ipw", "complete-case-sensitivity", "mnar-sensitivity"].includes(method)) return ["outcome"];
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
    if (["paired-t-test", "wilcoxon"].includes(method)) return [figure("paired-difference-distribution", "Paired difference distribution", "histogram", ["variables"], true)];
    if (method === "friedman") return [figure("repeated-measure-profile", "Repeated-measure profile", "line", ["variables"], true)];
    if (method === "cochran-q") return [figure("repeated-binary-profile", "Repeated binary profile", "line", ["variables"], true)];
    return [figure("outcome-distribution-by-group", "Outcome distribution by group", "boxplot", ["outcome", "group"], true)];
  }
  if (family === "correlation") return [figure("correlation-scatter", "Correlation scatterplot", "scatter", ["outcome", "exposure"], true)];
  if (family === "regression_glm") {
    const base = [
      figure("coefficient-plot", "Coefficient or effect-size plot", "coefficient", ["outcome", "exposure", "covariates"]),
      figure("residual-diagnostics", "Residual diagnostics", "residual", ["outcome", "exposure", "covariates"]),
      figure("residual-qq-plot", "Residual QQ plot", "qq", ["outcome", "exposure", "covariates"]),
      figure("influence-diagnostics", "Influence diagnostics", "influence", ["outcome", "exposure", "covariates"]),
    ];
    if (method === "ordinal-logistic-regression") return [
      ...base,
      figure("ordinal-proportional-odds", "Ordinal proportional-odds screen", "diagnostic", ["outcome", "exposure", "covariates"]),
    ];
    if (method === "multinomial-logistic-regression") return [
      ...base,
      figure("multinomial-confusion-matrix", "Multinomial confusion matrix", "heatmap", ["outcome", "exposure", "covariates"]),
      figure("multinomial-class-metrics", "Multinomial class metrics", "diagnostic", ["outcome", "exposure", "covariates"]),
    ];
    if (method === "robust-linear-regression") return [
      ...base,
      figure("robust-linear-weights", "Robust linear observation weights", "diagnostic", ["outcome", "exposure", "covariates"]),
    ];
    if (method === "penalized-linear-regression" || method === "penalized-logistic-regression") return [
      figure("coefficient-plot", "Coefficient or effect-size plot", "coefficient", ["outcome", "exposure", "covariates"]),
      figure("penalized-coefficient-profile", "Penalized coefficient profile", "diagnostic", ["outcome", "exposure", "covariates"]),
      figure("penalized-cv-performance", "Penalized validation performance", "diagnostic", ["outcome", "exposure", "covariates"]),
    ];
    if (["poisson-regression", "negative-binomial-regression", "zero-inflated-poisson", "zero-inflated-negative-binomial"].includes(method)) return [
      ...base,
      figure("count-observed-vs-fitted", "Observed versus fitted counts", "diagnostic", ["outcome", "exposure", "covariates", "offset"]),
    ];
    if (["gamma-glm", "inverse-gaussian-glm"].includes(method)) return [
      ...base,
      figure("positive-glm-observed-vs-fitted", "Observed versus fitted positive outcome", "diagnostic", ["outcome", "exposure", "covariates"]),
    ];
    if (method === "quantile-regression") return [
      ...base,
      figure("quantile-residual-balance", "Quantile residual balance", "diagnostic", ["outcome", "exposure", "covariates"]),
    ];
    return base;
  }
  if (family === "survival") {
    if (method === "aalen-johansen-cif") return [
      figure("cumulative-incidence", "Cumulative incidence", "cumulative_incidence", ["time", "event", "group"], true),
      figure("cumulative-incidence-horizon-summary", "Cumulative incidence horizon summary", "diagnostic", ["time", "event", "group"], true),
    ];
    if (method === "fine-gray") return [
      figure("fine-gray-subdistribution-hazard", "Fine-Gray subdistribution hazard ratios", "forest", ["time", "event", "exposure", "covariates"], true),
      figure("fine-gray-baseline-cif", "Fine-Gray baseline cumulative incidence", "cumulative_incidence", ["time", "event", "exposure", "covariates"], true),
      figure("cumulative-incidence", "Aalen-Johansen cumulative incidence context", "cumulative_incidence", ["time", "event", "group"], true),
    ];
    if (method === "time-varying-cox") return [
      figure("hazard-ratio-forest", "Hazard ratio forest plot", "forest", ["start", "stop", "time", "event", "exposure", "covariates"], true),
      figure("time-varying-cox-interval-support", "Time-varying Cox interval support", "diagnostic", ["start", "stop", "id", "event"], true),
      figure("ph-diagnostic", "Proportional-hazards diagnostic", "diagnostic", ["stop", "event", "exposure", "covariates"], true),
      figure("cox-risk-score-distribution", "Cox risk-score distribution", "diagnostic", ["stop", "event", "exposure", "covariates"], true),
    ];
    if (method === "cox-proportional-hazards" || method === "stratified-cox") return [
      figure("hazard-ratio-forest", "Hazard ratio forest plot", "forest", ["time", "event", "exposure", "covariates"], true),
      figure("ph-diagnostic", "Proportional-hazards diagnostic", "diagnostic", ["time", "event", "exposure", "covariates"], true),
      figure("cox-risk-score-distribution", "Cox risk-score distribution", "diagnostic", ["time", "event", "exposure", "covariates"], true),
    ];
    if (method === "recurrent-event-rate") return [
      figure("event-rate-summary", "Event-rate summary", "line", ["time", "event", "id"], true),
    ];
    if (method === "recurrent-event-cox") return [
      figure("recurrent-event-cox-hazard-ratios", "Recurrent-event Cox hazard ratios", "forest", ["start", "stop", "event", "id", "exposure", "covariates"], true),
      figure("recurrent-event-cox-interval-support", "Recurrent-event interval support", "diagnostic", ["start", "stop", "id", "event"], true),
      figure("recurrent-event-cox-subject-events", "Subject recurrent-event burden", "diagnostic", ["id", "event"], true),
      figure("cox-risk-score-distribution", "Recurrent-event Cox risk-score distribution", "diagnostic", ["stop", "event", "exposure", "covariates"], true),
    ];
    return [
      figure("survival-curve", "Survival curve", "survival", method === "kaplan-meier" ? ["time", "event"] : ["time", "event", "group"], true),
      figure("risk-table", "Risk table", "risk_table", method === "kaplan-meier" ? ["time", "event"] : ["time", "event", "group"], method === "kaplan-meier" || method === "log-rank"),
      figure("restricted-mean-survival-time", "Restricted mean survival time", "diagnostic", method === "kaplan-meier" ? ["time", "event"] : ["time", "event", "group"], method === "kaplan-meier" || method === "log-rank"),
    ];
  }
  if (family === "causal") {
    if (method === "doubly-robust-aipw") return [
      figure("covariate-balance-love-plot", "Covariate balance love plot", "love_plot", ["exposure", "covariates"], true),
      figure("propensity-overlap", "Propensity score overlap", "overlap", ["exposure", "covariates"], true),
      figure("causal-weight-distribution", "Causal weight distribution", "diagnostic", ["exposure", "covariates"], true),
      figure("aipw-contribution-distribution", "AIPW contribution distribution", "diagnostic", ["outcome", "exposure", "covariates"], true),
    ];
    if (method === "propensity-score-matching") return [
      figure("covariate-balance-love-plot", "Covariate balance love plot", "love_plot", ["exposure", "covariates"], true),
      figure("propensity-overlap", "Propensity score overlap", "overlap", ["exposure", "covariates"], true),
      figure("propensity-match-distances", "Propensity match distance distribution", "diagnostic", ["exposure", "covariates"], true),
    ];
    if (method === "propensity-score-weighting") return [
      figure("covariate-balance-love-plot", "Covariate balance love plot", "love_plot", ["exposure", "covariates"], true),
      figure("propensity-overlap", "Propensity score overlap", "overlap", ["exposure", "covariates"], true),
      figure("propensity-weight-distribution", "Propensity weight distribution", "diagnostic", ["exposure", "covariates"], true),
    ];
    if (method === "overlap-weighting") return [
      figure("covariate-balance-love-plot", "Covariate balance love plot", "love_plot", ["exposure", "covariates"], true),
      figure("propensity-overlap", "Propensity score overlap", "overlap", ["exposure", "covariates"], true),
      figure("causal-weight-distribution", "Causal weight distribution", "diagnostic", ["exposure", "covariates"], true),
    ];
    if (method === "entropy-balancing") return [
      figure("covariate-balance-love-plot", "Covariate balance love plot", "love_plot", ["exposure", "covariates"], true),
      figure("entropy-balance-constraints", "Entropy-balance moment constraints", "diagnostic", ["exposure", "covariates"], true),
      figure("entropy-balance-weights", "Entropy-balance weight distribution", "overlap", ["exposure", "covariates"], true),
    ];
    if (method === "difference-in-differences") return [
      figure("did-outcome-by-period", "Difference-in-differences outcome support", "line", ["outcome", "exposure", "post"], true),
      figure("did-contrast-summary", "Difference-in-differences contrast summary", "diagnostic", ["outcome", "exposure", "post"], true),
    ];
    if (method === "event-study-did") return [
      figure("event-study-plot", "Event-study coefficient plot", "line", ["outcome", "exposure", "period"], true),
      figure("event-study-period-support", "Event-study period support", "line", ["outcome", "exposure", "period"], true),
      figure("event-study-pretrend", "Event-study pretrend screen", "diagnostic", ["outcome", "exposure", "period"], true),
    ];
    if (method === "interrupted-time-series") return [
      figure("its-observed-trend", "Interrupted time-series observed trend", "line", ["outcome", "time", "post"], true),
      figure("its-fitted-trend", "Interrupted time-series fitted trend", "line", ["outcome", "time", "post"], true),
      figure("its-residual-autocorrelation", "Interrupted time-series residual autocorrelation", "diagnostic", ["outcome", "time", "post"], true),
    ];
    if (method === "regression-discontinuity") return [
      figure("rdd-running-variable-support", "RDD running-variable support", "scatter", ["outcome", "running variable"], true),
      figure("rdd-fitted-support", "RDD fitted cutoff trend", "diagnostic", ["outcome", "running variable"], true),
      figure("rdd-bandwidth-sensitivity", "RDD bandwidth sensitivity", "diagnostic", ["outcome", "running variable"], true),
      figure("rdd-covariate-continuity", "RDD covariate continuity screen", "diagnostic", ["running variable", "covariates"], true),
    ];
    if (method === "instrumental-variables-2sls") return [
      figure("iv-first-stage-support", "IV first-stage support", "scatter", ["exposure", "instrument"], true),
      figure("iv-first-stage-observed-vs-predicted", "IV first-stage observed versus predicted treatment", "scatter", ["exposure", "instrument"], true),
      figure("iv-reduced-form-coefficients", "IV reduced-form coefficients", "coefficient", ["outcome", "instrument"], true),
      figure("iv-covariate-balance", "IV instrument-covariate balance", "diagnostic", ["instrument", "covariates"]),
    ];
    return [figure("design-diagnostic-plot", "Quasi-experimental design diagnostic", "diagnostic", ["outcome", "exposure", "time"])];
  }
  if (family === "prediction") return [
    figure("roc-curve", "ROC curve", "roc", ["outcome", "exposure"], method === "prediction-evaluation"),
    figure("precision-recall-curve", "Precision-recall curve", "precision_recall", ["outcome", "exposure"], method === "prediction-evaluation"),
    figure("calibration-plot", "Calibration plot", "calibration", ["outcome", "exposure"], method === "prediction-evaluation"),
    figure("confusion-matrix", "Confusion matrix", "confusion_matrix", ["outcome", "exposure"]),
    figure("prediction-slice-performance", "Prediction performance by subgroup", "diagnostic", ["outcome", "exposure", "group"]),
  ];
  if (method === "generalized-mixed-model") return [
    figure("longitudinal-cluster-size", "Longitudinal cluster size distribution", "diagnostic", ["outcome", "exposure", "cluster"], true),
    figure("longitudinal-observed-vs-fitted", "GLMM observed versus fitted probabilities", "diagnostic", ["outcome", "exposure", "cluster"], true),
    figure("glmm-cluster-calibration", "GLMM cluster calibration", "calibration", ["outcome", "exposure", "cluster"], true),
    figure("glmm-random-effects", "GLMM random intercepts", "diagnostic", ["outcome", "exposure", "cluster"], true),
  ];
  if (method === "linear-mixed-model" || method === "gee") return [
    figure("longitudinal-cluster-size", "Longitudinal cluster size distribution", "diagnostic", ["outcome", "exposure", "cluster"], true),
    figure("longitudinal-observed-vs-fitted", "Longitudinal observed versus fitted values", "diagnostic", ["outcome", "exposure", "cluster"], true),
  ];
  if (family === "longitudinal") return [
    figure("longitudinal-cluster-size", "Longitudinal cluster size distribution", "diagnostic", ["outcome", "exposure", "cluster"], true),
  ];
  if (method === "missingness-ipw") return [
    figure("missingness-ipw-weight-distribution", "Missingness IPW weight distribution", "diagnostic", ["outcome", "covariates"], true),
  ];
  if (family === "missingness") return [
    figure("missingness-by-variable", "Missingness by variable", "missingness", ["variables"], true),
    figure("missingness-pattern-heatmap", "Missingness pattern heatmap", "heatmap", ["variables"]),
    ...(method === "multiple-imputation-mice" ? [figure("imputation-distribution-shift", "Observed versus imputed distribution shift", "diagnostic", ["variables"], true)] : []),
  ];
  if (family === "dimension_reduction") return [
    figure("pca-scree", "PCA scree plot", "scree", ["variables"], true),
    figure("pca-scores", "PCA score projection", "scatter", ["variables"], true),
  ];
  if (family === "clustering") return [
    figure("cluster-size", "Cluster size distribution", "diagnostic", ["variables"], true),
    figure("cluster-pca-projection", "Cluster PCA projection", "scatter", ["variables"]),
  ];
  if (family === "measurement") return [figure("agreement-or-scale-diagnostic", "Agreement or scale diagnostic", "agreement", ["variables"])];
  return [];
}

function assumptionsFor(method: StatsMethod, family: StatisticalMethodSpec["family"]): string[] {
  const common = ["Variables are correctly typed, coded, and temporally eligible for the stated design.", "Missingness and complete-case exclusions are reported before inference."];
  if (family === "core_inference") return [...common, "Observations match the requested independent, paired, or repeated-measure design.", "Distributional or exact-test assumptions are checked before interpreting p-values."];
  if (family === "regression_glm") return [...common, "Outcome family and link function match the data-generating scale.", "Linearity, collinearity, influential observations, convergence, and separation/overdispersion are reviewed as applicable.", "Count-rate models use a strictly positive exposure/person-time offset when incidence-rate interpretation is intended."];
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
  if (family === "core_inference") return ["sample size", "group/cell counts", "effect size", "omnibus effect size where applicable", "confidence interval", "distribution or expected-cell diagnostics", "permutation sensitivity where applicable", "nonparametric bootstrap uncertainty where applicable", "omnibus effect-size bootstrap uncertainty where applicable"];
  if (family === "correlation") return ["sample size", "correlation coefficient", "confidence interval", "source pair artifact", "leave-one-out influence", "bootstrap uncertainty"];
  if (family === "regression_glm") return ["n_obs", "n_predictors", "convergence", "max_vif", "influence", "residuals", "residual QQ", "residual pattern", "ordinal proportional-odds screen", "robust observation weights", "quantile residual balance and pinball loss", "offset distribution for count/rate models", "observed-versus-fitted count mean calibration", "observed-versus-expected zero diagnostics", "positive-outcome observed-versus-fitted mean calibration", "family-specific diagnostics"];
  if (family === "survival") return ["event count", "censoring count", "time range", "risk table", "proportional hazards review", "competing event accounting"];
  if (family === "causal") return ["propensity overlap", "covariate balance", "positivity", "weight distribution", "estimand", "design support source tables", "sensitivity analysis"];
  if (family === "prediction") return ["event count", "AUROC/AUPRC", "bootstrap uncertainty intervals", "Brier score", "calibration", "confusion matrix", "threshold rule"];
  if (family === "missingness") return ["missing fraction", "missingness patterns", "imputation model metadata", "observed-vs-imputed distribution shift", "complete-case sensitivity"];
  if (family === "longitudinal") return ["cluster count", "records per cluster", "cluster support artifact", "working correlation, ICC, or random-effect support", "fitted-value and residual artifacts", "cluster calibration where applicable", "convergence"];
  if (family === "measurement") return ["item count", "rater/measure count", "agreement table", "confidence interval"];
  if (family === "dimension_reduction") return ["component count", "explained variance", "feature scaling", "loadings", "transformed scores"];
  if (family === "clustering") return ["feature scaling", "cluster count", "cluster profile", "minimum cluster size", "silhouette", "Davies-Bouldin", "Calinski-Harabasz"];
  if (family === "power") return ["effect size", "alpha", "target power", "required n"];
  return ["row count", "missingness", "distribution summaries"];
}

function allowedBackendsFor(method: StatsMethod, family: StatisticalMethodSpec["family"]): StatisticalMethodSpec["allowedBackends"] {
  if (method === "fine-gray") return ["python-scipy", "r-cmprsk", "manual-review"];
  if (family === "survival") return ["python-lifelines", "r-survival", "r-cmprsk", "manual-review"];
  if (family === "causal" || family === "prediction" || family === "dimension_reduction" || family === "clustering") return ["python-sklearn", "python-statsmodels", "manual-review"];
  if (family === "core_inference" || family === "correlation" || family === "missingness" || family === "measurement" || family === "power") return ["python-scipy", "python-statsmodels", "python-sklearn", "manual-review"];
  return ["python-statsmodels", "python-scipy", "manual-review"];
}

function expectedTablesFor(method: StatsMethod, family: StatisticalMethodSpec["family"]): string[] {
  const base = ["stats-summary.json", "estimates.csv", "diagnostics.json"];
  if (method === "diagnostic-accuracy") return [...base, "confusion matrix in diagnostics.json", "sensitivity/specificity/predictive-value rows in estimates.csv"];
  if (method === "difference-in-differences") return [...base, "did-cell-support.csv", "did-contrast-summary.csv"];
  if (method === "event-study-did") return [...base, "event-study-estimates.csv", "event-study-period-support.csv", "event-study-pretrend.csv", "treatment-by-period support"];
  if (method === "interrupted-time-series") return [...base, "its-segment-support.csv", "its-time-trend.csv", "its-fitted-trend.csv", "its-autocorrelation.csv"];
  if (method === "regression-discontinuity") return [...base, "rdd-running-support.csv", "rdd-fitted-values.csv", "rdd-bandwidth-sensitivity.csv", "rdd-cutoff-density.csv", "rdd-covariate-continuity.csv"];
  if (method === "instrumental-variables-2sls") return [...base, "iv-first-stage.csv", "iv-first-stage-support.csv", "iv-reduced-form.csv", "iv-endogeneity-diagnostics.csv", "iv-covariate-balance.csv", "iv-analysis-frame.csv"];
  if (method === "propensity-score-matching") return [...base, "propensity-scores.csv", "propensity-overlap.csv", "balance.csv", "matched-pairs.csv", "propensity-match-quality.csv"];
  if (method === "propensity-score-weighting") return [...base, "propensity-scores.csv", "propensity-overlap.csv", "balance.csv", "weights.csv", "propensity-weight-summary.csv"];
  if (method === "overlap-weighting") return [...base, "balance.csv", "causal-weights.csv", "causal-weight-summary.csv", "propensity-overlap.csv"];
  if (method === "doubly-robust-aipw") return [...base, "balance diagnostics", "causal-weights.csv", "causal-weight-summary.csv", "propensity-overlap.csv", "aipw-nuisance-predictions.csv", "aipw-influence.csv", "aipw-component-summary.csv"];
  if (method === "entropy-balancing") return [...base, "balance.csv", "causal-weights.csv", "entropy-balance-constraints.csv"];
  if (family === "correlation") return [...base, "correlation-source.csv", "correlation-influence.csv", "correlation-bootstrap.csv"];
  if (method === "wilcoxon") return [...base, "paired-differences.csv", "nonparametric-bootstrap.csv"];
  if (method === "paired-t-test") return [...base, "paired-differences.csv"];
  if (method === "friedman") return [...base, "repeated-measure-source.csv", "posthoc-contrasts.csv", "omnibus-effect-bootstrap.csv"];
  if (method === "cochran-q") return [...base, "repeated-binary-source.csv", "posthoc-contrasts.csv", "omnibus-effect-bootstrap.csv"];
  if (["anova", "ancova", "kruskal-wallis"].includes(method)) return [...base, "group-summary.csv", "analysis-values.csv", "omnibus-effect-bootstrap.csv", "posthoc-contrasts.csv when more than two groups are analyzed"];
  if (method === "fisher-exact") return [...base, "contingency-table.csv", "categorical-source.csv", "categorical-cell-diagnostics.csv", "categorical-effect-bootstrap.csv"];
  if (method === "chi-square") return [...base, "contingency-table.csv", "categorical-source.csv", "categorical-cell-diagnostics.csv", "categorical-permutation-sensitivity.csv", "categorical-effect-bootstrap.csv when a 2x2 table is analyzed"];
  if (method === "cochran-armitage-trend") return [...base, "contingency-table.csv", "categorical-source.csv", "categorical-cell-diagnostics.csv", "trend-support.csv", "trend-effect-bootstrap.csv"];
  if (method === "mcnemar") return [...base, "contingency-table.csv", "categorical-source.csv", "categorical-cell-diagnostics.csv", "mcnemar-paired-effect.csv"];
  if (method === "mann-whitney") return [...base, "group-summary.csv", "analysis-values.csv", "permutation-sensitivity.csv", "nonparametric-bootstrap.csv"];
  if (["t-test", "welch-t-test"].includes(method)) return [...base, "group-summary.csv", "analysis-values.csv", "permutation-sensitivity.csv"];
  if (family === "core_inference") return [...base, "group-summary.csv and analysis-values.csv where group comparisons are used"];
  if (method === "ordinal-logistic-regression") return [...base, "regression-model-frame.csv", "regression-design-matrix.csv", "regression-predictions.csv where fitted class probabilities are available", "ordinal-proportional-odds-check.csv", "model diagnostics", "threshold/cutpoint rows in estimates.csv"];
  if (method === "multinomial-logistic-regression") return [...base, "regression-model-frame.csv", "regression-design-matrix.csv", "regression-predictions.csv with fitted class probabilities", "multinomial-confusion-matrix.csv", "multinomial-class-metrics.csv", "class-specific contrast rows in estimates.csv"];
  if (method === "robust-linear-regression") return [...base, "regression-model-frame.csv", "regression-design-matrix.csv", "regression-predictions.csv where fitted values are available", "robust-linear-weights.csv", "model diagnostics", "residual/influence tables where applicable", "QQ source table where applicable"];
  if (method === "penalized-linear-regression" || method === "penalized-logistic-regression") return [...base, "regression-model-frame.csv", "regression-design-matrix.csv with standardized features", "regression-predictions.csv where fitted values/probabilities are available", "penalized-feature-scaling.csv", "penalized-coefficient-profile.csv", "penalized-cv-summary.csv"];
  if (["poisson-regression", "negative-binomial-regression", "zero-inflated-poisson", "zero-inflated-negative-binomial"].includes(method)) return [...base, "regression-model-frame.csv", "regression-design-matrix.csv", "regression-predictions.csv where fitted values are available", "count-fit-summary.csv", "count-zero-diagnostics.csv", "model diagnostics", "residual/influence tables where applicable"];
  if (["gamma-glm", "inverse-gaussian-glm"].includes(method)) return [...base, "regression-model-frame.csv", "regression-design-matrix.csv", "regression-predictions.csv where fitted values are available", "positive-glm-fit-summary.csv", "model diagnostics", "residual/influence tables where applicable", "QQ source table where applicable"];
  if (method === "quantile-regression") return [...base, "regression-model-frame.csv", "regression-design-matrix.csv", "regression-predictions.csv where fitted values are available", "quantile-fit-summary.csv", "model diagnostics", "residual-balance table by fitted-value bin"];
  if (family === "regression_glm") return [...base, "regression-model-frame.csv", "regression-design-matrix.csv", "regression-predictions.csv where fitted values are available", "model diagnostics", "residual/influence tables where applicable", "QQ source table where applicable"];
  if (family === "causal") return [...base, "balance diagnostics", "propensity/weight artifacts where applicable"];
  if (method === "time-varying-cox") return [...base, "hazard ratio table", "cox-ph-diagnostics.csv", "cox-model-frame.csv", "cox-design-matrix.csv", "cox-risk-scores.csv", "cox-risk-strata.csv", "cox-cluster-robust-variance.csv when subject id is supplied", "time-varying-cox-intervals.csv", "time-varying-cox-subject-summary.csv"];
  if (method === "recurrent-event-cox") return [...base, "hazard ratio table", "cox-ph-diagnostics.csv", "cox-model-frame.csv", "cox-design-matrix.csv", "cox-risk-scores.csv", "cox-risk-strata.csv", "cox-cluster-robust-variance.csv", "recurrent-event-cox-intervals.csv", "recurrent-event-cox-subject-summary.csv"];
  if (method === "cox-proportional-hazards" || method === "stratified-cox") return [...base, "hazard ratio table", "cox-ph-diagnostics.csv", "cox-model-frame.csv", "cox-design-matrix.csv", "cox-risk-scores.csv", "cox-risk-strata.csv"];
  if (method === "fine-gray") return [...base, "fine-gray-model-frame.csv", "fine-gray-design-matrix.csv", "fine-gray-risk-sets.csv", "fine-gray-baseline-subdistribution.csv", "fine-gray-predictions.csv", "cumulative-incidence.csv"];
  if (method === "kaplan-meier" || method === "log-rank") return [...base, "survival/cumulative-incidence curve table", "survival-risk-table.csv", "survival-rmst.csv"];
  if (method === "aalen-johansen-cif") return [...base, "cumulative-incidence.csv", "cumulative-incidence-horizon-summary.csv", "cumulative-incidence-contrasts.csv when groups are analyzed"];
  if (family === "survival") return [...base, "survival/cumulative-incidence curve table", "risk table where survival curves are emitted"];
  if (family === "prediction") return [...base, "threshold metrics", "calibration table", "bootstrap interval table", "prediction-validation-split.csv", "prediction-validation-subjects.csv when subject id is supplied"];
  if (method === "multiple-imputation-mice") return [...base, "missingness table", "imputed data", "imputation-summary.csv", "imputation-distribution-check.csv"];
  if (method === "missingness-ipw") return [...base, "missingness table", "missingness-ipw.csv"];
  if (family === "missingness") return [...base, "missingness table", "imputed data or sensitivity table where applicable"];
  if (method === "repeated-measures-anova") return [...base, "longitudinal-cluster-summary.csv", "repeated-measures-source.csv", "repeated-measures-cell-summary.csv", "repeated-measures-sphericity.csv"];
  if (method === "generalized-mixed-model") return [...base, "longitudinal-cluster-summary.csv", "longitudinal-model-frame.csv", "longitudinal-design-matrix.csv", "longitudinal-fitted-values.csv", "longitudinal-cluster-residuals.csv", "glmm-random-effects.csv", "glmm-cluster-calibration.csv"];
  if (method === "linear-mixed-model" || method === "gee") return [...base, "longitudinal-cluster-summary.csv", "longitudinal-model-frame.csv", "longitudinal-design-matrix.csv", "longitudinal-fitted-values.csv", "longitudinal-cluster-residuals.csv"];
  if (family === "longitudinal") return [...base, "longitudinal-cluster-summary.csv"];
  if (family === "dimension_reduction") return [...base, "pca-loadings.csv", "pca-transformed.csv", "pca-feature-scaling.csv"];
  if (family === "clustering") return [...base, "cluster assignments", "cluster-feature-scaling.csv", "cluster-profile.csv"];
  if (method === "multiple-comparison-correction") return [...base, "adjusted-p-values.csv"];
  return base;
}

function qaGatesFor(method: StatsMethod, family: StatisticalMethodSpec["family"]): string[] {
  const common = [
    "preflight-reliability-gate",
    "required-variables",
    "semantic-plausibility",
    "effect-estimate-table",
    "estimate-numeric-fields-finite",
    "estimate-p-values-in-domain",
    "estimate-ci-order",
    "estimate-within-ci",
    "estimate-standard-errors-nonnegative",
    "estimate-counts-nonnegative",
    "estimate-counts-integer",
    "estimate-probabilities-in-domain",
    "estimate-correlations-in-domain",
    "estimate-ratios-nonnegative",
    "estimate-effect-scale-consistency",
    "estimate-p-value-ci-null-consistency",
    "figure-quality",
    "claim-boundary",
  ];
  if (method === "instrumental-variables-2sls") return [...common, "instrument-variation", "first-stage-strength", "first-stage-prediction-diagnostic", "first-stage-figures", "reduced-form-artifact", "reduced-form-evidence", "reduced-form-figure", "endogeneity-diagnostic-artifact", "instrument-covariate-balance", "covariate-balance-figure", "exclusion-restriction-review"];
  if (method === "ordinal-logistic-regression") return [...common, "convergence", "ordinal-parameter-roles", "ordinal-proportional-odds-artifact", "ordinal-proportional-odds-screen", "overfitting-risk"];
  if (method === "multinomial-logistic-regression") return [...common, "convergence", "multinomial-class-diagnostic-artifacts", "multinomial-class-support", "multinomial-prediction-coverage", "overfitting-risk"];
  if (method === "logistic-regression") return [...common, "convergence", "model-binary-outcome-orientation-evidence", "model-binary-class-balance", "model-separation-screen", "model-fitted-probability-boundary", "collinearity", "influence", "overfitting-risk"];
  if (method === "robust-linear-regression") return [...common, "convergence", "robust-linear-weight-artifact", "robust-linear-downweighting", "robust-linear-residual-scale", "overfitting-risk"];
  if (method === "quantile-regression") return [...common, "convergence", "quantile-fit-artifact", "quantile-residual-balance", "quantile-pinball-loss", "overfitting-risk"];
  if (method === "penalized-logistic-regression") return [...common, "model-binary-outcome-orientation-evidence", "model-binary-class-balance", "penalized-inference-boundary", "penalized-feature-scaling-artifact", "penalized-coefficient-profile", "penalized-validation-artifact", "overfitting-risk"];
  if (method === "penalized-linear-regression") return [...common, "penalized-inference-boundary", "penalized-feature-scaling-artifact", "penalized-coefficient-profile", "penalized-validation-artifact", "overfitting-risk"];
  const regressionGlmBase = [...common, "convergence", "collinearity", "influence", "overfitting-risk"];
  if (["poisson-regression", "negative-binomial-regression", "zero-inflated-poisson", "zero-inflated-negative-binomial"].includes(method)) {
    return [...regressionGlmBase, "count-rate-offset-validity", "count-fitted-mean-calibration", "count-zero-calibration"];
  }
  if (["gamma-glm", "inverse-gaussian-glm"].includes(method)) {
    return [...regressionGlmBase, "positive-glm-fit-artifact", "positive-glm-fitted-mean-calibration", "positive-glm-relative-error"];
  }
  if (family === "regression_glm") return [...regressionGlmBase, "residual-pattern", "residual-distribution"];
  if (method === "aalen-johansen-cif") return [...common, "event-count", "time-zero", "censoring", "competing-risk-accounting", "cif-horizon-summary-artifact", "cif-horizon-support", "cif-horizon-figure", "cif-fine-gray-boundary"];
  if (method === "fine-gray") return [...common, "event-count", "time-zero", "censoring", "competing-risk-accounting", "fine-gray-convergence", "fine-gray-risk-set-support", "fine-gray-artifacts", "fine-gray-approximation-boundary"];
  if (method === "time-varying-cox") return [...common, "event-count", "time-zero", "censoring", "risk-table", "time-varying-cox-interval-validity", "time-varying-cox-interval-artifacts", "time-varying-cox-subject-support", "time-varying-cox-execution-mode", "time-varying-cox-cluster-robust-variance", "proportional-hazards-or-competing-risk-review"];
  if (method === "recurrent-event-cox") return [...common, "event-count", "time-zero", "censoring", "recurrent-event-cox-interval-validity", "recurrent-event-cox-interval-artifacts", "recurrent-event-cox-subject-support", "recurrent-event-cox-event-burden", "recurrent-event-cox-cluster-robust-variance", "recurrent-event-cox-robust-variance-boundary", "proportional-hazards-or-competing-risk-review"];
  if (method === "cox-proportional-hazards" || method === "stratified-cox") return [...common, "event-count", "time-zero", "censoring", "cox-model-frame-artifact", "cox-risk-score-artifact", "proportional-hazards-or-competing-risk-review", "overfitting-risk"];
  if (method === "recurrent-event-rate") return [...common, "event-count", "time-zero", "censoring", "recurrent-event-rate-artifacts", "recurrent-event-person-time-support", "recurrent-event-subject-support", "recurrent-event-overdispersion", "recurrent-event-rate-contrast-artifact", "recurrent-event-model-boundary", "recurrent-event-group-stability"];
  if (method === "kaplan-meier") return [...common, "event-count", "time-zero", "censoring", "risk-table"];
  if (method === "log-rank") return [...common, "event-count", "time-zero", "censoring", "risk-table"];
  if (family === "survival") return [...common, "event-count", "time-zero", "censoring", "risk-table", "proportional-hazards-or-competing-risk-review"];
  if (method === "overlap-weighting") return [...common, "temporality", "causal-treatment-orientation-evidence", "balance", "positivity", "causal-weight-summary-artifact", "causal-weight-distribution-figure", "causal-weight-tail", "causal-effective-sample-size-fraction", "no-post-treatment-adjustment", "unmeasured-confounding-sensitivity"];
  if (method === "doubly-robust-aipw") return [...common, "temporality", "causal-treatment-orientation-evidence", "balance", "positivity", "causal-weight-summary-artifact", "causal-weight-distribution-figure", "causal-weight-tail", "causal-effective-sample-size-fraction", "aipw-nuisance-artifacts", "aipw-influence-support", "aipw-standard-error", "aipw-contribution-figure", "no-post-treatment-adjustment", "unmeasured-confounding-sensitivity"];
  if (method === "propensity-score-matching") return [...common, "temporality", "propensity-treatment-orientation-evidence", "propensity-treatment-model", "propensity-balance", "propensity-balance-artifact", "propensity-positivity-overlap", "propensity-overlap-artifact", "propensity-unmatched-treated", "propensity-match-quality-artifact", "propensity-match-retention", "propensity-match-distance", "propensity-complete-case-retention", "no-post-treatment-adjustment", "unmeasured-confounding-sensitivity"];
  if (method === "propensity-score-weighting") return [...common, "temporality", "propensity-treatment-orientation-evidence", "propensity-treatment-model", "propensity-balance", "propensity-balance-artifact", "propensity-positivity-overlap", "propensity-overlap-artifact", "propensity-effective-sample-size", "propensity-weight-summary-artifact", "propensity-weight-tail", "propensity-weight-effective-sample-size-fraction", "propensity-complete-case-retention", "no-post-treatment-adjustment", "unmeasured-confounding-sensitivity"];
  if (method === "entropy-balancing") return [...common, "temporality", "causal-treatment-orientation-evidence", "balance", "positivity", "entropy-balance-constraint-artifact", "entropy-balance-constraint-fit", "entropy-balance-constraint-figure", "entropy-balance-weight-diagnostics", "no-post-treatment-adjustment", "unmeasured-confounding-sensitivity"];
  if (method === "difference-in-differences") return [...common, "temporality", "causal-treatment-orientation-evidence", "causal-post-orientation-evidence", "did-cell-support", "did-parallel-trends-review", "did-support-artifact", "did-contrast-artifact", "did-estimand-term", "did-contrast-figure", "no-post-treatment-adjustment", "unmeasured-confounding-sensitivity"];
  if (method === "event-study-did") return [...common, "temporality", "causal-treatment-orientation-evidence", "did-cell-support", "did-parallel-trends-review", "did-support-artifact", "event-study-coefficient-support", "event-study-period-support", "event-study-pretrend-review", "event-study-pretrend-artifact", "event-study-pretrend-screen", "event-study-pretrend-figure", "event-study-support-artifact", "no-post-treatment-adjustment", "unmeasured-confounding-sensitivity"];
  if (method === "unmeasured-confounding-sensitivity") return [...common, "temporality", "causal-treatment-orientation-evidence", "causal-outcome-orientation-evidence", "unmeasured-confounding-effect-bound", "unmeasured-confounding-ci-bound", "unmeasured-confounding-source-artifact"];
  if (method === "interrupted-time-series") return [...common, "temporality", "causal-post-orientation-evidence", "its-segment-support", "its-time-point-support", "its-trend-artifact", "its-fitted-trend-artifact", "its-autocorrelation-artifact", "its-autocorrelation-screen", "no-post-treatment-adjustment", "unmeasured-confounding-sensitivity"];
  if (method === "regression-discontinuity") return [...common, "temporality", "rdd-cutoff-support", "rdd-running-support-artifact", "rdd-fitted-values-artifact", "rdd-bandwidth-sensitivity-artifact", "rdd-bandwidth-sensitivity-support", "rdd-cutoff-density-screen", "rdd-cutoff-density-artifact", "rdd-covariate-continuity-artifact", "rdd-covariate-continuity-screen", "no-post-treatment-adjustment", "unmeasured-confounding-sensitivity"];
  if (family === "causal") return [...common, "temporality", "balance", "positivity", "no-post-treatment-adjustment", "unmeasured-confounding-sensitivity"];
  if (method === "diagnostic-accuracy") return [...common, "diagnostic-reference-index-roles", "diagnostic-reference-orientation-evidence", "diagnostic-index-orientation-evidence", "diagnostic-core-metrics", "diagnostic-predictive-value-context", "diagnostic-screening-overclaim-boundary", "diagnostic-precision-caveat", "diagnostic-sparse-cell-policy"];
  if (family === "prediction") return [...common, "leakage", "prediction-outcome-orientation-evidence", "discrimination", "calibration", "bootstrap-uncertainty", "threshold-validity", "prediction-score-probability-boundary", "prediction-decision-curve", "prediction-artifact-completeness", "prediction-validation-design", "prediction-validation-split-artifact", "prediction-validation-subject-leakage", "validation-split"];
  if (method === "missingness-ipw") return [...common, "missingness-mechanism", "missingness-ipw-artifact", "missingness-ipw-model-support", "missingness-ipw-stability", "missingness-ipw-effective-sample-size", "missingness-ipw-weight-figure"];
  if (method === "missingness-summary") return [...common, "missingness-profile-present", "missingness-complete-case-retention", "missingness-variable-burden", "missingness-mechanism"];
  if (method === "multiple-imputation-mice") return [...common, "missingness-profile-present", "missingness-complete-case-retention", "missingness-variable-burden", "missingness-mechanism", "imputation-provenance", "imputation-distribution-shift", "imputation-method-boundary"];
  if (method === "complete-case-sensitivity" || method === "mnar-sensitivity") return [...common, "missingness-profile-present", "missingness-complete-case-retention", "missingness-variable-burden", "missingness-mechanism", "complete-case-sensitivity", "missingness-sensitivity-quantified", "missingness-sensitivity-shift"];
  if (family === "missingness") return [...common, "missingness-mechanism", "imputation-provenance", "imputation-distribution-shift", "complete-case-sensitivity"];
  if (method === "generalized-mixed-model") return [...common, "cluster-count", "within-cluster-support", "cluster-summary-artifact", "model-frame-artifact", "fitted-values-artifact", "glmm-random-effects-artifact", "glmm-cluster-calibration-artifact", "glmm-cluster-calibration", "glmm-optimization-status", "glmm-approximation-boundary"];
  if (method === "gee") return [...common, "cluster-count", "within-cluster-support", "cluster-summary-artifact", "correlation-or-icc", "model-frame-artifact", "fitted-values-artifact"];
  if (method === "linear-mixed-model") return [...common, "cluster-count", "within-cluster-support", "cluster-summary-artifact", "correlation-or-icc", "model-frame-artifact", "fitted-values-artifact"];
  if (method === "repeated-measures-anova") return [...common, "cluster-count", "within-cluster-support", "cluster-summary-artifact", "model-frame-artifact", "fitted-values-artifact"];
  if (family === "longitudinal") return [...common, "cluster-count", "within-cluster-support", "cluster-summary-artifact", "correlation-or-icc"];
  if (family === "correlation") return [...common, "sample-size", "effect-size", "confidence-interval", "source-pair-artifact", "leave-one-out-influence", "bootstrap-uncertainty"];
  if (method === "chi-square") return [...common, "sample-size", "categorical-association-table", "categorical-association-effect-size", "categorical-source-artifact", "categorical-cell-diagnostics-artifact", "categorical-sparse-cell-policy", "categorical-cell-residual-review", "categorical-binary-orientation-evidence", "categorical-permutation-sensitivity", "categorical-effect-bootstrap-uncertainty"];
  if (method === "fisher-exact") return [...common, "sample-size", "categorical-association-table", "categorical-association-effect-size", "categorical-source-artifact", "categorical-cell-diagnostics-artifact", "categorical-sparse-cell-policy", "categorical-cell-residual-review", "categorical-binary-orientation-evidence", "categorical-effect-bootstrap-uncertainty"];
  if (method === "cochran-armitage-trend") return [...common, "sample-size", "categorical-association-table", "categorical-association-effect-size", "categorical-source-artifact", "categorical-cell-diagnostics-artifact", "categorical-sparse-cell-policy", "categorical-cell-residual-review", "trend-ordering-evidence", "trend-support-artifact", "trend-binary-outcome-orientation", "trend-risk-gradient", "trend-effect-bootstrap"];
  if (method === "mcnemar") return [...common, "sample-size", "categorical-association-table", "categorical-association-effect-size", "categorical-source-artifact", "categorical-cell-diagnostics-artifact", "categorical-sparse-cell-policy", "categorical-cell-residual-review", "mcnemar-paired-effect-artifact"];
  if (["anova", "ancova", "kruskal-wallis"].includes(method)) return [...common, "sample-size", "assumption-review", "effect-size", "omnibus-effect-size", "omnibus-effect-bootstrap", "permutation-sensitivity", "posthoc-contrasts"];
  if (method === "friedman") return [...common, "sample-size", "assumption-review", "effect-size", "omnibus-effect-size", "omnibus-effect-bootstrap", "posthoc-contrasts"];
  if (method === "cochran-q") return [...common, "sample-size", "assumption-review", "effect-size", "omnibus-effect-bootstrap", "posthoc-contrasts"];
  if (method === "t-test" || method === "welch-t-test") return [...common, "sample-size", "assumption-review", "effect-size", "core-inference-group-orientation-evidence"];
  if (method === "mann-whitney") return [...common, "sample-size", "assumption-review", "effect-size", "core-inference-group-orientation-evidence", "nonparametric-bootstrap-uncertainty"];
  if (method === "wilcoxon") return [...common, "sample-size", "assumption-review", "effect-size", "nonparametric-bootstrap-uncertainty"];
  if (family === "core_inference") return [...common, "sample-size", "assumption-review", "effect-size"];
  return common;
}

function failureModesFor(method: StatsMethod, family: StatisticalMethodSpec["family"]): string[] {
  const common = ["missing required columns", "high missingness", "semantically impossible values", "too few complete cases", "unsupported claim language"];
  if (family === "regression_glm") return [...common, "non-convergence", "perfect separation", "high collinearity", "influential observations", "wrong outcome family", "unoffset count model misread as a person-time rate model"];
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

export function contractArgumentNameFor(argument: string): StatsContractArgumentName | null {
  const normalized = normalizeContractArgument(argument);
  const fields = contractArgumentRoleMap();
  return fields[normalized] ?? null;
}

export function contractArgumentRequestFields(argument: string): string[] {
  const name = contractArgumentNameFor(argument);
  if (!name) return [];
  if (name === "clusterOrId") return ["cluster", "id"];
  if (name === "timeOrStop") return ["time", "stop"];
  if (name === "variables") return ["variables"];
  if (name === "covariates") return ["covariates"];
  if (name === "runningVariable") return ["runningVariable"];
  return [name];
}

export function requiredContractArgumentsForMethod(method: StatsMethod): StatsContractArgumentName[] {
  return getStatisticalMethodSpec(method).requiredArguments.map(argument => {
    const mapped = contractArgumentNameFor(argument);
    if (!mapped) {
      throw new Error(`Stats method contract for ${method} declares unsupported required argument '${argument}'.`);
    }
    return mapped;
  });
}

export function auditStatisticalMethodRequiredArguments(specs: StatisticalMethodSpec[] = listStatisticalMethodSpecs()): RequiredArgumentContractAudit {
  const requiredArguments = specs.flatMap(spec => spec.requiredArguments.map(argument => {
    const normalizedArgument = normalizeContractArgument(argument);
    const contractArgumentName = contractArgumentNameFor(argument);
    return {
      method: spec.method,
      argument,
      normalizedArgument,
      contractArgumentName,
      acceptedRequestFields: contractArgumentRequestFields(argument),
      status: contractArgumentName ? "mapped" as const : "unsupported" as const,
    };
  }));
  return {
    totalMethods: specs.length,
    totalRequiredArgumentReferences: requiredArguments.length,
    uniqueRequiredArguments: uniqueStrings(requiredArguments.map(row => row.argument)).sort(),
    unsupportedRequiredArguments: uniqueStrings(requiredArguments
      .filter(row => row.status === "unsupported")
      .map(row => row.argument))
      .sort(),
    requiredArguments,
  };
}

export function qaGateContractAliases(gate: string): string[] {
  const id = gate.toLowerCase().replace(/_/g, "-");
  const aliases = qaGateAliasMap();
  return uniqueStrings([id, ...(aliases[id] ?? [])]);
}

export function auditStatisticalMethodQaGateAliases(specs: StatisticalMethodSpec[] = listStatisticalMethodSpecs()): QaGateAliasAudit {
  const methodsByGate = new Map<string, Set<StatsMethod>>();
  for (const spec of specs) {
    for (const gate of spec.qaGates) {
      const normalized = gate.toLowerCase().replace(/_/g, "-");
      if (!methodsByGate.has(normalized)) methodsByGate.set(normalized, new Set());
      methodsByGate.get(normalized)!.add(spec.method);
    }
  }
  const aliases = qaGateAliasMap();
  const abstractGatePolicy = new Set(abstractQaGatePolicyIds());
  const gateAliases = [...methodsByGate.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([gate, methods]) => {
      const acceptedIds = qaGateContractAliases(gate);
      const aliasStatus = abstractGatePolicy.has(gate)
        ? aliases[gate]?.length ? "abstract_mapped" as const : "abstract_unmapped" as const
        : "concrete" as const;
      return {
        gate,
        acceptedIds,
        methods: [...methods].sort(),
        aliasStatus,
      };
    });
  const abstractGateCount = gateAliases.filter(row => row.aliasStatus.startsWith("abstract_")).length;
  const concreteGateCount = gateAliases.filter(row => row.aliasStatus === "concrete").length;
  return {
    totalMethods: specs.length,
    totalUniqueGates: gateAliases.length,
    abstractGateCount,
    concreteGateCount,
    unmappedAbstractGates: gateAliases
      .filter(row => row.aliasStatus === "abstract_unmapped")
      .map(row => row.gate),
    gateAliases,
  };
}

export function figureContractAliases(method: StatsMethod, expectedId: string): string[] {
  const id = expectedId.toLowerCase().replace(/_/g, "-");
  const aliases = figureContractAliasMap();
  const methodSpecificAliases = figureContractMethodAliasMap();
  return uniqueStrings([id, ...(aliases[id] ?? []), ...(methodSpecificAliases[method]?.[id] ?? [])]);
}

export function auditStatisticalMethodFigureAliases(specs: StatisticalMethodSpec[] = listStatisticalMethodSpecs()): FigureAliasAudit {
  const figureAliases = specs.flatMap(spec => spec.expectedFigures.map(figureSpec => {
    const acceptedIds = figureContractAliases(spec.method, figureSpec.id);
    const nonSelfAliases = acceptedIds.filter(id => id !== figureSpec.id.toLowerCase().replace(/_/g, "-"));
    const aliasStatus = nonSelfAliases.length
      ? "abstract_mapped" as const
      : figureAliasHasPolicy(spec.method, figureSpec.id) && acceptedIds.length === 0
        ? "abstract_unmapped" as const
        : "concrete" as const;
    return {
      method: spec.method,
      figureId: figureSpec.id,
      label: figureSpec.label,
      type: figureSpec.type,
      required: figureSpec.required,
      acceptedIds,
      aliasStatus,
    };
  }));
  const abstractFigureCount = figureAliases.filter(row => row.aliasStatus.startsWith("abstract_")).length;
  const concreteFigureCount = figureAliases.filter(row => row.aliasStatus === "concrete").length;
  return {
    totalMethods: specs.length,
    totalFigures: figureAliases.length,
    requiredFigureCount: figureAliases.filter(row => row.required).length,
    optionalFigureCount: figureAliases.filter(row => !row.required).length,
    abstractFigureCount,
    concreteFigureCount,
    unmappedAbstractFigures: figureAliases
      .filter(row => row.aliasStatus === "abstract_unmapped")
      .map(row => ({ method: row.method, figureId: row.figureId })),
    figureAliases,
  };
}

export function figureSourceColumnRequestFields(sourceColumn: string): string[] {
  const normalizedRole = normalizeFigureSourceColumnRole(sourceColumn);
  return figureSourceColumnRoleMap()[normalizedRole] ?? [];
}

export function auditStatisticalMethodFigureSourceColumns(specs: StatisticalMethodSpec[] = listStatisticalMethodSpecs()): FigureSourceColumnAudit {
  const sourceColumns = specs.flatMap(spec => spec.expectedFigures.flatMap(figureSpec => figureSpec.sourceColumns.map(sourceColumn => {
    const normalizedRole = normalizeFigureSourceColumnRole(sourceColumn);
    const acceptedRequestFields = figureSourceColumnRequestFields(sourceColumn);
    return {
      method: spec.method,
      figureId: figureSpec.id,
      sourceColumn,
      normalizedRole,
      acceptedRequestFields,
      status: acceptedRequestFields.length ? "known_role" as const : "unknown_role" as const,
    };
  })));
  const uniqueSourceColumns = uniqueStrings(sourceColumns.map(row => row.sourceColumn)).sort();
  return {
    totalMethods: specs.length,
    totalFigures: specs.reduce((sum, spec) => sum + spec.expectedFigures.length, 0),
    totalSourceColumnReferences: sourceColumns.length,
    uniqueSourceColumns,
    unknownSourceColumns: uniqueStrings(sourceColumns
      .filter(row => row.status === "unknown_role")
      .map(row => row.sourceColumn))
      .sort(),
    sourceColumns,
  };
}

export function expectedTableArtifactFiles(expectedTables: string[]): string[] {
  return uniqueStrings(expectedTables
    .filter(expectation => !isConditionalTableExpectation(expectation))
    .flatMap(expectation => tableArtifactFileNames(expectation)));
}

export function auditStatisticalMethodTableArtifacts(specs: StatisticalMethodSpec[] = listStatisticalMethodSpecs()): TableArtifactContractAudit {
  const tableArtifacts = specs.flatMap(spec => tableArtifactExpectationRows(spec.method, spec.expectedTables));
  const coreFiles = ["stats-summary.json", "estimates.csv", "diagnostics.json"];
  const missingCoreArtifacts = specs
    .map(spec => {
      const requiredFiles = new Set(expectedTableArtifactFiles(spec.expectedTables));
      return {
        method: spec.method,
        missingFiles: coreFiles.filter(file => !requiredFiles.has(file)),
      };
    })
    .filter(row => row.missingFiles.length > 0);
  return {
    totalMethods: specs.length,
    totalExpectedTableEntries: tableArtifacts.length,
    requiredFileExpectationCount: tableArtifacts.filter(row => row.requirementStatus === "required_file").length,
    conditionalFileExpectationCount: tableArtifacts.filter(row => row.requirementStatus === "conditional_file").length,
    narrativeExpectationCount: tableArtifacts.filter(row => row.requirementStatus === "narrative_or_embedded").length,
    missingCoreArtifacts,
    tableArtifacts,
  };
}

function tableArtifactExpectationRows(method: StatsMethod, expectedTables: string[]): TableArtifactContractAudit["tableArtifacts"] {
  return expectedTables.map(expectation => {
    const fileNames = tableArtifactFileNames(expectation);
    const conditional = isConditionalTableExpectation(expectation);
    return {
      method,
      expectation,
      fileNames,
      requirementStatus: fileNames.length === 0
        ? "narrative_or_embedded" as const
        : conditional
          ? "conditional_file" as const
          : "required_file" as const,
    };
  });
}

function tableArtifactFileNames(expectation: string): string[] {
  return uniqueStrings([...expectation.matchAll(/[A-Za-z0-9][A-Za-z0-9._-]*\.(?:csv|json)/g)].map(match => match[0]));
}

function isConditionalTableExpectation(expectation: string): boolean {
  return /\b(when|where|if|optional|wherever|applicable)\b/i.test(expectation);
}

function abstractQaGatePolicyIds(): string[] {
  return Object.keys(qaGateAliasMap());
}

function normalizeContractArgument(argument: string): string {
  return argument.trim().toLowerCase().replace(/_/g, " ").replace(/\s+/g, " ");
}

function contractArgumentRoleMap(): Record<string, StatsContractArgumentName> {
  return {
    "cluster or id": "clusterOrId",
    "running variable": "runningVariable",
    "outcome": "outcome",
    "exposure": "exposure",
    "group": "group",
    "time or stop": "timeOrStop",
    "time": "time",
    "start": "start",
    "stop": "stop",
    "event": "event",
    "id": "id",
    "strata": "strata",
    "period": "period",
    "post": "post",
    "cutoff": "cutoff",
    "instrument": "instrument",
    "variables": "variables",
    "covariates": "covariates",
  };
}

function figureAliasHasPolicy(method: StatsMethod, expectedId: string): boolean {
  const id = expectedId.toLowerCase().replace(/_/g, "-");
  return Object.prototype.hasOwnProperty.call(figureContractAliasMap(), id)
    || Object.prototype.hasOwnProperty.call(figureContractMethodAliasMap()[method] ?? {}, id);
}

function normalizeFigureSourceColumnRole(sourceColumn: string): string {
  return sourceColumn.trim().toLowerCase().replace(/_/g, " ").replace(/\s+/g, " ");
}

function figureSourceColumnRoleMap(): Record<string, string[]> {
  return {
    cluster: ["cluster", "id"],
    covariates: ["covariates"],
    event: ["event"],
    exposure: ["exposure", "group"],
    group: ["group", "exposure"],
    id: ["id", "cluster"],
    instrument: ["instrument"],
    offset: ["offset"],
    outcome: ["outcome"],
    period: ["period"],
    post: ["post"],
    "running variable": ["runningVariable"],
    start: ["start"],
    stop: ["stop"],
    time: ["time", "stop"],
    variables: ["variables"],
  };
}

function figureContractAliasMap(): Record<string, string[]> {
  return {
    "numeric-distributions": ["descriptive-histograms"],
    "missingness-by-variable": ["missingness-bar"],
    "missingness-pattern-heatmap": ["missingness-heatmap"],
    "outcome-distribution-by-group": ["group-distribution", "anova-group-distribution"],
    "paired-difference-distribution": ["paired-difference"],
    "contingency-table-heatmap": ["contingency-heatmap"],
    "coefficient-plot": ["model-coefficients"],
    "residual-diagnostics": ["model-residuals"],
    "residual-qq-plot": ["model-qq"],
    "influence-diagnostics": ["model-influence"],
    "penalized-coefficient-profile": ["penalized-coefficients"],
    "fine-gray-subdistribution-hazard": ["fine-gray-subdistribution-hazards"],
    "hazard-ratio-forest": ["cox-hazard-ratios", "time-varying-cox-hazard-ratios", "recurrent-event-cox-hazard-ratios"],
    "ph-diagnostic": ["cox-ph-diagnostics"],
    "cox-risk-score-distribution": ["cox-risk-scores"],
    "survival-curve": ["kaplan-meier", "log-rank-survival"],
    "risk-table": ["survival-risk-table"],
    "restricted-mean-survival-time": ["survival-rmst"],
    "event-rate-summary": ["recurrent-event-rate"],
    "covariate-balance-love-plot": ["propensity-love-plot", "causal-love-plot", "entropy-balance-love-plot"],
    "propensity-overlap": ["causal-propensity-overlap"],
    "event-study-plot": ["event-study"],
    "its-observed-trend": ["its-time-trend"],
    "rdd-running-variable-support": ["rdd-running-support"],
    "prediction-slice-performance": ["prediction-slices"],
    "agreement-or-scale-diagnostic": ["bland-altman"],
  };
}

function figureContractMethodAliasMap(): Partial<Record<StatsMethod, Record<string, string[]>>> {
  return {
    "overlap-weighting": {
      "causal-weight-distribution": ["causal-weight-distribution"],
    },
    "doubly-robust-aipw": {
      "causal-weight-distribution": ["causal-weight-distribution"],
    },
    "propensity-score-weighting": {
      "propensity-weight-distribution": ["propensity-weight-distribution"],
    },
  };
}

function qaGateAliasMap(): Record<string, string[]> {
  return {
    "required-variables": ["preflight-reliability-gate", "method-contract-required-inputs"],
    "semantic-plausibility": ["analysis-semantic-plausibility", "selected-variable-semantic-plausibility"],
    "claim-boundary": ["result-posture", "standard-table-boundary", "runner-capability-promotion-boundary"],
    "instrument-variation": ["iv-first-stage-strength", "temporality"],
    "first-stage-strength": ["iv-first-stage-strength"],
    "first-stage-prediction-diagnostic": ["iv-first-stage-prediction-diagnostic"],
    "first-stage-figures": ["iv-first-stage-figures"],
    "reduced-form-artifact": ["iv-reduced-form-artifact"],
    "reduced-form-evidence": ["iv-reduced-form-evidence"],
    "reduced-form-figure": ["iv-reduced-form-figure"],
    "endogeneity-diagnostic-artifact": ["iv-endogeneity-diagnostic-artifact"],
    "instrument-covariate-balance": ["iv-instrument-covariate-balance", "iv-covariate-balance-artifact"],
    "covariate-balance-figure": ["iv-covariate-balance-figure"],
    "exclusion-restriction-review": ["iv-exclusion-review"],
    "convergence": ["model-convergence", "fine-gray-convergence", "glmm-optimization-status"],
    "collinearity": ["model-collinearity"],
    "influence": ["model-influence"],
    "overfitting-risk": ["model-parameter-burden", "survival-events-per-predictor", "cox-predictor-event-support"],
    "residual-pattern": ["model-residual-pattern"],
    "residual-distribution": ["model-residual-distribution"],
    "count-rate-offset-validity": ["model-count-offset-validity"],
    "count-fitted-mean-calibration": ["model-count-fitted-mean-calibration"],
    "count-zero-calibration": ["model-count-zero-calibration"],
    "event-count": ["survival-event-count"],
    "time-zero": ["survival-censoring-context", "temporality"],
    "censoring": ["survival-censoring-context"],
    "risk-table": ["survival-risk-table-artifact"],
    "proportional-hazards-or-competing-risk-review": ["cox-proportional-hazards-diagnostic", "cox-ph-diagnostic-artifact", "competing-risk-accounting"],
    "balance": ["propensity-balance", "causal-balance-after-adjustment", "entropy-balance-constraint-fit"],
    "positivity": ["propensity-positivity-overlap", "causal-positivity-support"],
    "discrimination": ["prediction-discrimination", "cox-discrimination-diagnostic"],
    "calibration": ["prediction-calibration", "prediction-calibration-model"],
    "bootstrap-uncertainty": ["prediction-bootstrap-uncertainty", "correlation-bootstrap-uncertainty", "categorical-effect-bootstrap-uncertainty"],
    "threshold-validity": ["prediction-threshold-operating-point"],
    "slice-performance": ["prediction-slice-performance"],
    "validation-split": ["prediction-validation-split-artifact", "prediction-validation-design"],
    "leakage": ["prediction-validation-subject-leakage", "prediction-validation-design"],
    "missingness-mechanism": ["missingness-mechanism-screen"],
    "imputation-provenance": ["imputation-artifact-present", "imputation-dataset-count", "imputation-variability-recorded"],
    "complete-case-sensitivity": ["missingness-sensitivity-artifact", "missingness-sensitivity-scenarios"],
    "cluster-count": ["longitudinal-cluster-count"],
    "within-cluster-support": ["longitudinal-observations-per-cluster"],
    "cluster-summary-artifact": ["longitudinal-cluster-summary-artifact"],
    "correlation-or-icc": ["gee-working-correlation", "mixed-model-random-effect-variance"],
    "model-frame-artifact": ["longitudinal-model-frame-artifact"],
    "fitted-values-artifact": ["longitudinal-fitted-values-artifact"],
    "sample-size": ["core-inference-sample-size", "scale-reliability-sample-size", "survival-event-count"],
    "effect-size": ["core-inference-effect-size", "categorical-association-effect-size", "correlation-effect-size", "cochran-q-effect-size"],
    "confidence-interval": ["core-inference-uncertainty", "correlation-uncertainty", "scale-reliability-uncertainty-interval"],
    "source-pair-artifact": ["correlation-source-artifact"],
    "leave-one-out-influence": ["correlation-influence-sensitivity"],
    "assumption-review": ["core-inference-assumptions", "mean-comparison-normality-evidence", "mean-comparison-variance-balance", "cochran-q-within-subject-variation"],
    "omnibus-effect-size": ["core-inference-omnibus-effect-size", "cochran-q-effect-size"],
    "omnibus-effect-bootstrap": ["core-inference-omnibus-effect-bootstrap", "cochran-q-effect-bootstrap"],
    "permutation-sensitivity": ["core-inference-permutation-sensitivity", "categorical-permutation-sensitivity"],
    "posthoc-contrasts": ["core-inference-posthoc-contrasts", "cochran-q-posthoc-contrasts"],
    "nonparametric-bootstrap-uncertainty": ["core-inference-nonparametric-bootstrap"],
  };
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values.filter(value => value.trim().length > 0))];
}
