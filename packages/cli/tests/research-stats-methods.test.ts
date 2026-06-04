import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { auditStatisticalMethodFigureAliases, auditStatisticalMethodFigureSourceColumns, auditStatisticalMethodQaGateAliases, auditStatisticalMethodRequiredArguments, auditStatisticalMethodTableArtifacts, buildEstimateSanityQaChecks, contractArgumentNameFor, contractArgumentRequestFields, expectedTableArtifactFiles, figureContractAliases, figureSourceColumnRequestFields, getStatisticalMethodSpec, listStatisticalMethodSpecs, qaGateContractAliases, requiredContractArgumentsForMethod, researchAnalysisBenchmarkCommand, researchAnalysisManifestCommand, researchFigureQaCommand, researchMethodSelectCommand, researchStatsContractsCommand, researchStatsRunCommand, renderResearchStatsContracts, renderResearchStatsContractsJson, statisticalMethodSpecSchema, statsMethodSchema, statsRunMethodForAnalysisMethod } from "../src/index.js";
import { classifyStatsQaWarningChecks, criticalStatsQaWarningChecks } from "../src/research-machine/analysis-manifest.js";

const python = path.resolve(".research-runtime/python/bin/python");
const statsMethodTestTimeout = 24 * 60 * 60 * 1000;

vi.setConfig({ testTimeout: statsMethodTestTimeout });

async function writeStatsFixture(): Promise<{ dir: string; dataPath: string }> {
  const dir = await mkdtemp(path.join(os.tmpdir(), "agenteer-stats-methods-"));
  const rows = ["x,g,cat,y,ybin,ord,multi,count,zi_count,time,event,comp_event,post,treat,running,instrument,cluster,visit,score,r1,r2,wide1,wide2,wide3,bin1,bin2,bin3,miss,pval"];
  for (let i = 0; i < 90; i++) {
    const x = (i % 17) / 5;
    const g = i % 2;
    const cat = i % 3 === 0 ? "A" : "B";
    const y = 1 + x * 1.3 + g * 0.8 + (i % 5) / 10;
    const ybin = y > 3 ? 1 : 0;
    const ord = y < 2.6 ? 0 : y < 4.0 ? 1 : 2;
    const multi = i % 3 === 0 ? "home" : i % 3 === 1 ? "rehab" : "snf";
    const count = Math.max(0, Math.round(1 + x + g + (i % 4)));
    const ziCount = i % 3 === 0 ? 0 : Math.max(1, Math.round(1 + x + g + (i % 4)));
    const time = 5 + i;
    const event = i % 4 === 0 || i % 10 === 1 ? 1 : 0;
    const compEvent = i % 5 === 0 ? 2 : event;
    const post = i >= 45 ? 1 : 0;
    const treat = g;
    const running = (i - 45) / 10;
    const instrument = i % 3 === 0 ? 1 : 0;
    const cluster = Math.floor(i / 3);
    const visit = i % 3;
    const score = Math.min(0.98, Math.max(0.02, 0.2 + x / 5 + g * 0.15));
    const r1 = ybin ? "yes" : "no";
    const r2 = (score > 0.52) ? "yes" : "no";
    const wide1 = x + (i % 4) / 10;
    const wide2 = wide1 + 0.2 + (i % 5) * 0.03;
    const wide3 = wide1 + 0.45 + (i % 7) * 0.02;
    const bin1 = i % 2;
    const bin2 = i % 3 === 0 ? 1 : 0;
    const bin3 = i % 5 === 0 || i % 2 === 0 ? 1 : 0;
    const miss = i % 9 === 0 ? "" : y.toFixed(4);
    const pval = (0.001 + i * 0.002).toFixed(4);
    rows.push([x, g, cat, y.toFixed(4), ybin, ord, multi, count, ziCount, time, event, compEvent, post, treat, running.toFixed(4), instrument, cluster, visit, score.toFixed(4), r1, r2, wide1.toFixed(4), wide2.toFixed(4), wide3.toFixed(4), bin1, bin2, bin3, miss, pval].join(","));
  }
  const dataPath = path.join(dir, "data.csv");
  await writeFile(dataPath, `${rows.join("\n")}\n`);
  return { dir, dataPath };
}

describe("research stats methods expansion", () => {
  it("keeps stats semantic plausibility centralized in the TypeScript preflight", async () => {
    const runnerSource = await readFile(path.resolve("packages/cli/src/research-machine/stats/runner.ts"), "utf-8");

    expect(runnerSource).toContain("researchFeasibilityGateCommand");
    expect(runnerSource).toContain("preflightSemanticPlausibilityCheck");
    expect(runnerSource).not.toContain("def semantic_rule_for_column");
    expect(runnerSource).not.toContain("def semantic_issues_for_dataframe");
    expect(runnerSource).not.toContain("SEMANTIC_VALUE_ABOVE_RANGE");
    expect(runnerSource).not.toContain("SEMANTIC_MEAN_ABOVE_EXPECTED");
  });

  it("flags impossible estimate, interval, p-value, standard-error, count, probability, correlation, and ratio outputs", () => {
    const checks = buildEstimateSanityQaChecks({
      method: "linear-regression",
      estimates: [
        { term: "x", estimate: 2, ci_low: 3, ci_high: 1, p_value: 1.4, std_error: -0.2, n: -8 },
        { term: "therapy", odds_ratio: -0.75, or_ci_low: 0.9, or_ci_high: 1.2, p_value: 0.04, events: 10 },
        { term: "diagnostic", sensitivity: 1.2, correlation: -1.3, true_positive: 3.4 },
        { term: "nonfinite", estimate: Number.NaN },
      ],
    });
    const byId = Object.fromEntries(checks.map(check => [check.id, check]));
    expect(byId["estimate-numeric-fields-finite"]?.status).toBe("fail");
    expect(byId["estimate-p-values-in-domain"]?.status).toBe("fail");
    expect(byId["estimate-ci-order"]?.status).toBe("fail");
    expect(byId["estimate-within-ci"]?.status).toBe("fail");
    expect(byId["estimate-standard-errors-nonnegative"]?.status).toBe("fail");
    expect(byId["estimate-counts-nonnegative"]?.status).toBe("fail");
    expect(byId["estimate-counts-integer"]?.status).toBe("fail");
    expect(byId["estimate-probabilities-in-domain"]?.status).toBe("fail");
    expect(byId["estimate-correlations-in-domain"]?.status).toBe("fail");
    expect(byId["estimate-ratios-nonnegative"]?.status).toBe("fail");
    expect(byId["estimate-p-value-ci-null-consistency"]?.status).toBe("warning");

    const transformedMismatch = buildEstimateSanityQaChecks({
      method: "logistic-regression",
      estimates: [
        {
          term: "therapy",
          estimate: Math.log(2),
          ci_low: Math.log(1.5),
          ci_high: Math.log(2.5),
          odds_ratio: 3,
          or_ci_low: 1.2,
          or_ci_high: 2.7,
          p_value: 0.01,
        },
      ],
    });
    expect(Object.fromEntries(transformedMismatch.map(check => [check.id, check]))["estimate-effect-scale-consistency"]?.status).toBe("fail");

    const transformedValid = buildEstimateSanityQaChecks({
      method: "logistic-regression",
      estimates: [
        {
          term: "therapy",
          estimate: Math.log(2),
          ci_low: Math.log(1.5),
          ci_high: Math.log(2.5),
          odds_ratio: 2,
          or_ci_low: 1.5,
          or_ci_high: 2.5,
          p_value: 0.01,
        },
      ],
    });
    expect(Object.fromEntries(transformedValid.map(check => [check.id, check]))["estimate-effect-scale-consistency"]?.status).toBe("pass");

    const valid = buildEstimateSanityQaChecks({
      method: "pearson",
      estimates: [{ term: "x", correlation: 0.32, ci_low: 0.12, ci_high: 0.49, p_value: 0.01, n: 80, sensitivity: 0.84, odds_ratio: 1.7, true_positive: 21 }],
    });
    expect(valid.every(check => check.status === "pass")).toBe(true);

    const continuousPower = buildEstimateSanityQaChecks({
      method: "power-sample-size",
      estimates: [{ term: "two_sample_t_test_per_group", power: 0.8, n_per_group: 25.4, total_n: 50.8 }],
    });
    expect(Object.fromEntries(continuousPower.map(check => [check.id, check]))["estimate-counts-integer"]?.status).toBe("pass");

    const logScaleHazard = buildEstimateSanityQaChecks({
      method: "cox-proportional-hazards",
      estimates: [{ term: "therapy", log_hazard_ratio: -0.4, hazard_ratio: 0.67, p_value: 0.03, events: 12 }],
    });
    expect(Object.fromEntries(logScaleHazard.map(check => [check.id, check]))["estimate-ratios-nonnegative"]?.status).toBe("pass");

    const contradictoryInference = buildEstimateSanityQaChecks({
      method: "linear-regression",
      estimates: [{ term: "x", estimate: 0.8, ci_low: 0.2, ci_high: 1.4, p_value: 0.2, n: 90 }],
    });
    expect(Object.fromEntries(contradictoryInference.map(check => [check.id, check]))["estimate-p-value-ci-null-consistency"]?.status).toBe("warning");

    const impossibleHazardRatio = buildEstimateSanityQaChecks({
      method: "cox-proportional-hazards",
      estimates: [{ term: "therapy", log_hazard_ratio: -0.22, hazard_ratio: 0.8, ci_low: 1.1, ci_high: 1.5, p_value: 0.2, events: 30 }],
    });
    const impossibleHazardChecks = Object.fromEntries(impossibleHazardRatio.map(check => [check.id, check]));
    expect(impossibleHazardChecks["estimate-within-ci"]?.status).toBe("fail");
    expect(impossibleHazardChecks["estimate-p-value-ci-null-consistency"]?.status).toBe("warning");
  });

  it("treats scientific-readiness warnings as lifecycle-critical across method families", () => {
    const warningIds = [
      "core-inference-effect-size",
      "method-contract-qa-gate-coverage",
      "core-inference-uncertainty",
      "core-inference-permutation-sensitivity",
      "categorical-sparse-cell-policy",
      "categorical-effect-bootstrap-uncertainty",
      "correlation-bootstrap-uncertainty",
      "cox-model-frame-artifact",
      "time-varying-cox-interval-validity",
      "recurrent-event-cox-robust-variance-boundary",
      "longitudinal-model-frame-artifact",
      "glmm-random-effects-artifact",
      "propensity-match-distance",
      "did-parallel-trends-review",
      "iv-first-stage-strength",
      "missingness-mechanism-screen",
      "imputation-distribution-shift",
      "missingness-ipw-stability",
      "agreement-proportional-bias",
      "pca-variance-captured",
      "clustering-validation-metrics",
      "power-observed-sample-size-support",
      "ordinal-proportional-odds-artifact",
      "quantile-fit-artifact",
      "penalized-validation-artifact",
      "positive-glm-relative-error",
      "prediction-validation-split-artifact",
      "prediction-calibration-model",
    ];

    expect(criticalStatsQaWarningChecks(warningIds)).toEqual(warningIds);
    expect(criticalStatsQaWarningChecks(["method-decision-support-artifact", "diagnostic-core-metrics"])).toEqual([]);
    expect(classifyStatsQaWarningChecks(["core-inference-effect-size", "diagnostic-core-metrics"])).toEqual({
      critical: ["core-inference-effect-size"],
      advisory: ["diagnostic-core-metrics"],
    });
  });

  it("defines inspectable method contracts for every executable stats method", () => {
    const specs = listStatisticalMethodSpecs();
    expect(specs.map(spec => spec.method).sort()).toEqual([...statsMethodSchema.options].sort());
    for (const spec of specs) {
      expect(() => statisticalMethodSpecSchema.parse(spec)).not.toThrow();
      expect(spec.assumptions.length, spec.method).toBeGreaterThan(0);
      expect(spec.diagnostics.length, spec.method).toBeGreaterThan(0);
      expect(spec.expectedTables.length, spec.method).toBeGreaterThan(0);
      expect(spec.qaGates.length, spec.method).toBeGreaterThan(0);
      expect(spec.failureModes.length, spec.method).toBeGreaterThan(0);
      expect(spec.interpretationBoundary.length, spec.method).toBeGreaterThan(20);
      expect(spec.qaGates).toEqual(expect.arrayContaining([
        "estimate-numeric-fields-finite",
        "estimate-p-values-in-domain",
        "estimate-ci-order",
        "estimate-within-ci",
        "estimate-effect-scale-consistency",
      ]));
    }
    const cox = getStatisticalMethodSpec("cox-proportional-hazards");
    expect(cox.family).toBe("survival");
    expect(cox.requiredArguments).toEqual(expect.arrayContaining(["time", "event", "exposure"]));
    expect(cox.assumptions.join(" ")).toMatch(/time zero|censoring/i);
    expect(cox.expectedFigures.filter(figure => figure.required).map(figure => figure.type)).toEqual(["forest", "diagnostic", "diagnostic"]);
    const km = getStatisticalMethodSpec("kaplan-meier");
    expect(km.requiredArguments).toEqual(["time", "event"]);
    expect(km.expectedFigures.find(figure => figure.id === "survival-curve")?.sourceColumns).toEqual(["time", "event"]);
    expect(km.expectedFigures.filter(figure => figure.required).map(figure => figure.type)).toEqual(["survival", "risk_table", "diagnostic"]);
    expect(getStatisticalMethodSpec("log-rank").expectedFigures.filter(figure => figure.required).map(figure => figure.type)).toEqual(["survival", "risk_table", "diagnostic"]);
    expect(getStatisticalMethodSpec("aalen-johansen-cif").expectedTables).toEqual(expect.arrayContaining(["cumulative-incidence-horizon-summary.csv"]));
    expect(getStatisticalMethodSpec("aalen-johansen-cif").expectedFigures.map(figure => figure.id)).toEqual(expect.arrayContaining(["cumulative-incidence", "cumulative-incidence-horizon-summary"]));
    expect(getStatisticalMethodSpec("fine-gray").allowedBackends).toEqual(expect.arrayContaining(["python-scipy", "r-cmprsk", "manual-review"]));
    expect(getStatisticalMethodSpec("fine-gray").expectedTables).toEqual(expect.arrayContaining(["fine-gray-model-frame.csv", "fine-gray-risk-sets.csv", "fine-gray-baseline-subdistribution.csv", "fine-gray-predictions.csv"]));
    expect(getStatisticalMethodSpec("fine-gray").expectedFigures.filter(figure => figure.required).map(figure => figure.id)).toEqual(["fine-gray-subdistribution-hazard", "fine-gray-baseline-cif", "cumulative-incidence"]);
    expect(getStatisticalMethodSpec("fine-gray").qaGates).toEqual(expect.arrayContaining(["competing-risk-accounting", "fine-gray-convergence", "fine-gray-risk-set-support", "fine-gray-artifacts", "fine-gray-approximation-boundary"]));
    expect(getStatisticalMethodSpec("time-varying-cox").requiredArguments).toEqual(expect.arrayContaining(["time or stop", "event", "exposure"]));
    expect(getStatisticalMethodSpec("time-varying-cox").expectedTables).toEqual(expect.arrayContaining(["time-varying-cox-intervals.csv", "time-varying-cox-subject-summary.csv"]));
    expect(getStatisticalMethodSpec("time-varying-cox").expectedFigures.filter(figure => figure.required).map(figure => figure.id)).toEqual(["hazard-ratio-forest", "time-varying-cox-interval-support", "ph-diagnostic", "cox-risk-score-distribution"]);
    expect(getStatisticalMethodSpec("time-varying-cox").qaGates).toEqual(expect.arrayContaining(["time-varying-cox-interval-validity", "time-varying-cox-interval-artifacts", "time-varying-cox-subject-support", "time-varying-cox-execution-mode"]));
    expect(getStatisticalMethodSpec("linear-mixed-model").expectedFigures.filter(figure => figure.required).map(figure => figure.id)).toEqual(["longitudinal-cluster-size", "longitudinal-observed-vs-fitted"]);
    expect(getStatisticalMethodSpec("generalized-mixed-model").expectedTables).toEqual(expect.arrayContaining(["longitudinal-fitted-values.csv", "glmm-random-effects.csv", "glmm-cluster-calibration.csv"]));
    expect(getStatisticalMethodSpec("generalized-mixed-model").expectedFigures.filter(figure => figure.required).map(figure => figure.id)).toEqual(["longitudinal-cluster-size", "longitudinal-observed-vs-fitted", "glmm-cluster-calibration", "glmm-random-effects"]);
    expect(getStatisticalMethodSpec("instrumental-variables-2sls").expectedFigures.filter(figure => figure.required).map(figure => figure.id)).toEqual(["iv-first-stage-support", "iv-first-stage-observed-vs-predicted", "iv-reduced-form-coefficients"]);
    expect(getStatisticalMethodSpec("overlap-weighting").expectedTables).toEqual(expect.arrayContaining(["causal-weight-summary.csv"]));
    expect(getStatisticalMethodSpec("overlap-weighting").expectedFigures.filter(figure => figure.required).map(figure => figure.id)).toEqual(["covariate-balance-love-plot", "propensity-overlap", "causal-weight-distribution"]);
    expect(getStatisticalMethodSpec("overlap-weighting").qaGates).toEqual(expect.arrayContaining(["causal-treatment-orientation-evidence", "causal-weight-summary-artifact", "causal-weight-distribution-figure", "causal-weight-tail", "causal-effective-sample-size-fraction"]));
    expect(getStatisticalMethodSpec("propensity-score-matching").expectedTables).toEqual(expect.arrayContaining(["matched-pairs.csv", "propensity-match-quality.csv"]));
    expect(getStatisticalMethodSpec("propensity-score-matching").expectedFigures.filter(figure => figure.required).map(figure => figure.id)).toEqual(["covariate-balance-love-plot", "propensity-overlap", "propensity-match-distances"]);
    expect(getStatisticalMethodSpec("propensity-score-matching").qaGates).toEqual(expect.arrayContaining(["propensity-treatment-orientation-evidence"]));
    expect(getStatisticalMethodSpec("propensity-score-weighting").expectedTables).toEqual(expect.arrayContaining(["weights.csv", "propensity-weight-summary.csv"]));
    expect(getStatisticalMethodSpec("propensity-score-weighting").expectedFigures.filter(figure => figure.required).map(figure => figure.id)).toEqual(["covariate-balance-love-plot", "propensity-overlap", "propensity-weight-distribution"]);
    expect(getStatisticalMethodSpec("propensity-score-weighting").qaGates).toEqual(expect.arrayContaining(["propensity-treatment-orientation-evidence"]));
    expect(getStatisticalMethodSpec("doubly-robust-aipw").expectedTables).toEqual(expect.arrayContaining(["causal-weight-summary.csv", "aipw-nuisance-predictions.csv", "aipw-influence.csv", "aipw-component-summary.csv"]));
    expect(getStatisticalMethodSpec("doubly-robust-aipw").expectedFigures.filter(figure => figure.required).map(figure => figure.id)).toEqual(["covariate-balance-love-plot", "propensity-overlap", "causal-weight-distribution", "aipw-contribution-distribution"]);
    expect(getStatisticalMethodSpec("doubly-robust-aipw").qaGates).toEqual(expect.arrayContaining(["causal-treatment-orientation-evidence", "causal-weight-summary-artifact", "causal-weight-distribution-figure", "causal-weight-tail", "causal-effective-sample-size-fraction"]));
    expect(getStatisticalMethodSpec("entropy-balancing").expectedTables).toEqual(expect.arrayContaining(["entropy-balance-constraints.csv"]));
    expect(getStatisticalMethodSpec("entropy-balancing").expectedFigures.filter(figure => figure.required).map(figure => figure.id)).toEqual(["covariate-balance-love-plot", "entropy-balance-constraints", "entropy-balance-weights"]);
    expect(getStatisticalMethodSpec("difference-in-differences").expectedTables).toEqual(expect.arrayContaining(["did-cell-support.csv", "did-contrast-summary.csv"]));
    expect(getStatisticalMethodSpec("difference-in-differences").expectedFigures.filter(figure => figure.required).map(figure => figure.id)).toEqual(["did-outcome-by-period", "did-contrast-summary"]);
    expect(getStatisticalMethodSpec("difference-in-differences").qaGates).toEqual(expect.arrayContaining(["causal-treatment-orientation-evidence"]));
    expect(getStatisticalMethodSpec("event-study-did").expectedTables).toEqual(expect.arrayContaining(["event-study-estimates.csv", "event-study-period-support.csv", "event-study-pretrend.csv"]));
    expect(getStatisticalMethodSpec("event-study-did").expectedFigures.filter(figure => figure.required).map(figure => figure.id)).toEqual(["event-study-plot", "event-study-period-support", "event-study-pretrend"]);
    expect(getStatisticalMethodSpec("interrupted-time-series").expectedTables).toEqual(expect.arrayContaining(["its-fitted-trend.csv", "its-autocorrelation.csv"]));
    expect(getStatisticalMethodSpec("interrupted-time-series").expectedFigures.filter(figure => figure.required).map(figure => figure.id)).toEqual(["its-observed-trend", "its-fitted-trend", "its-residual-autocorrelation"]);
    expect(getStatisticalMethodSpec("regression-discontinuity").expectedTables).toEqual(expect.arrayContaining(["rdd-fitted-values.csv", "rdd-covariate-continuity.csv"]));
    expect(getStatisticalMethodSpec("regression-discontinuity").expectedFigures.filter(figure => figure.required).map(figure => figure.id)).toEqual(["rdd-running-variable-support", "rdd-fitted-support", "rdd-bandwidth-sensitivity", "rdd-covariate-continuity"]);
    expect(getStatisticalMethodSpec("missingness-ipw").expectedTables).toEqual(expect.arrayContaining(["missingness-ipw.csv"]));
    expect(getStatisticalMethodSpec("missingness-ipw").expectedFigures.filter(figure => figure.required).map(figure => figure.id)).toEqual(["missingness-ipw-weight-distribution"]);
    expect(getStatisticalMethodSpec("recurrent-event-rate").expectedFigures.filter(figure => figure.required).map(figure => figure.id)).toEqual(["event-rate-summary"]);
    expect(getStatisticalMethodSpec("recurrent-event-cox").requiredArguments).toEqual(expect.arrayContaining(["start", "stop", "event", "id", "exposure"]));
    expect(getStatisticalMethodSpec("recurrent-event-cox").expectedTables).toEqual(expect.arrayContaining(["recurrent-event-cox-intervals.csv", "recurrent-event-cox-subject-summary.csv", "cox-cluster-robust-variance.csv"]));
    expect(getStatisticalMethodSpec("recurrent-event-cox").expectedFigures.filter(figure => figure.required).map(figure => figure.id)).toEqual(["recurrent-event-cox-hazard-ratios", "recurrent-event-cox-interval-support", "recurrent-event-cox-subject-events", "cox-risk-score-distribution"]);
    expect(getStatisticalMethodSpec("recurrent-event-cox").qaGates).toEqual(expect.arrayContaining(["recurrent-event-cox-interval-validity", "recurrent-event-cox-interval-artifacts", "recurrent-event-cox-subject-support", "recurrent-event-cox-event-burden", "recurrent-event-cox-cluster-robust-variance", "recurrent-event-cox-robust-variance-boundary"]));
    expect(getStatisticalMethodSpec("ancova").requiredArguments).toEqual(expect.arrayContaining(["outcome", "group", "covariates"]));
    expect(getStatisticalMethodSpec("anova").expectedTables).toEqual(expect.arrayContaining(["omnibus-effect-bootstrap.csv"]));
    expect(getStatisticalMethodSpec("anova").qaGates).toEqual(expect.arrayContaining(["omnibus-effect-size", "omnibus-effect-bootstrap", "posthoc-contrasts"]));
    expect(getStatisticalMethodSpec("ancova").qaGates).toEqual(expect.arrayContaining(["omnibus-effect-size", "omnibus-effect-bootstrap", "permutation-sensitivity"]));
    expect(getStatisticalMethodSpec("mann-whitney").expectedTables).toEqual(expect.arrayContaining(["group-summary.csv", "analysis-values.csv", "permutation-sensitivity.csv", "nonparametric-bootstrap.csv"]));
    expect(getStatisticalMethodSpec("welch-t-test").qaGates).toEqual(expect.arrayContaining(["core-inference-group-orientation-evidence"]));
    expect(getStatisticalMethodSpec("mann-whitney").qaGates).toEqual(expect.arrayContaining(["core-inference-group-orientation-evidence"]));
    expect(getStatisticalMethodSpec("partial-correlation").requiredArguments).toEqual(expect.arrayContaining(["outcome", "exposure", "covariates"]));
    expect(getStatisticalMethodSpec("partial-correlation").expectedTables).toEqual(expect.arrayContaining(["correlation-source.csv", "correlation-influence.csv", "correlation-bootstrap.csv"]));
    expect(getStatisticalMethodSpec("spearman").expectedTables).toEqual(expect.arrayContaining(["correlation-bootstrap.csv"]));
    expect(getStatisticalMethodSpec("paired-t-test").requiredArguments).toEqual(["variables"]);
    expect(getStatisticalMethodSpec("wilcoxon").requiredArguments).toEqual(["variables"]);
    expect(getStatisticalMethodSpec("wilcoxon").expectedTables).toEqual(expect.arrayContaining(["paired-differences.csv", "nonparametric-bootstrap.csv"]));
    expect(getStatisticalMethodSpec("friedman").requiredArguments).toEqual(["variables"]);
    expect(getStatisticalMethodSpec("friedman").expectedTables).toEqual(expect.arrayContaining(["omnibus-effect-bootstrap.csv"]));
    expect(getStatisticalMethodSpec("friedman").qaGates).toEqual(expect.arrayContaining(["omnibus-effect-size", "omnibus-effect-bootstrap", "posthoc-contrasts"]));
    expect(getStatisticalMethodSpec("chi-square").expectedTables).toEqual(expect.arrayContaining(["categorical-cell-diagnostics.csv", "categorical-permutation-sensitivity.csv", "categorical-effect-bootstrap.csv when a 2x2 table is analyzed"]));
    expect(getStatisticalMethodSpec("chi-square").qaGates).toEqual(expect.arrayContaining(["categorical-cell-diagnostics-artifact", "categorical-sparse-cell-policy", "categorical-cell-residual-review", "categorical-binary-orientation-evidence", "categorical-permutation-sensitivity", "categorical-effect-bootstrap-uncertainty"]));
    expect(getStatisticalMethodSpec("fisher-exact").expectedTables).toEqual(expect.arrayContaining(["categorical-effect-bootstrap.csv"]));
    expect(getStatisticalMethodSpec("cochran-armitage-trend").expectedTables).toEqual(expect.arrayContaining(["trend-support.csv", "trend-effect-bootstrap.csv"]));
    expect(getStatisticalMethodSpec("cochran-armitage-trend").qaGates).toEqual(expect.arrayContaining(["trend-ordering-evidence", "trend-support-artifact", "trend-binary-outcome-orientation", "trend-risk-gradient", "trend-effect-bootstrap"]));
    expect(getStatisticalMethodSpec("mcnemar").expectedTables).toEqual(expect.arrayContaining(["mcnemar-paired-effect.csv"]));
    expect(getStatisticalMethodSpec("mcnemar").qaGates).toEqual(expect.arrayContaining(["mcnemar-paired-effect-artifact"]));
    expect(getStatisticalMethodSpec("cochran-q").requiredArguments).toEqual(["variables"]);
    expect(getStatisticalMethodSpec("cochran-q").expectedTables).toEqual(expect.arrayContaining(["omnibus-effect-bootstrap.csv"]));
    expect(getStatisticalMethodSpec("cochran-q").qaGates).toEqual(expect.arrayContaining(["effect-size", "omnibus-effect-bootstrap", "posthoc-contrasts"]));
    expect(getStatisticalMethodSpec("paired-t-test").expectedFigures.filter(figure => figure.required).map(figure => figure.id)).toEqual(["paired-difference-distribution"]);
    expect(getStatisticalMethodSpec("friedman").expectedFigures.filter(figure => figure.required).map(figure => figure.id)).toEqual(["repeated-measure-profile"]);
    expect(getStatisticalMethodSpec("cochran-q").expectedFigures.filter(figure => figure.required).map(figure => figure.id)).toEqual(["repeated-binary-profile"]);
    expect(getStatisticalMethodSpec("poisson-regression").expectedTables).toEqual(expect.arrayContaining(["count-fit-summary.csv", "count-zero-diagnostics.csv"]));
    expect(getStatisticalMethodSpec("poisson-regression").expectedFigures.map(figure => figure.id)).toEqual(expect.arrayContaining(["count-observed-vs-fitted"]));
    expect(getStatisticalMethodSpec("ordinal-logistic-regression").expectedTables).toEqual(expect.arrayContaining(["ordinal-proportional-odds-check.csv"]));
    expect(getStatisticalMethodSpec("ordinal-logistic-regression").expectedFigures.map(figure => figure.id)).toEqual(expect.arrayContaining(["ordinal-proportional-odds"]));
    expect(getStatisticalMethodSpec("multinomial-logistic-regression").expectedTables).toEqual(expect.arrayContaining(["multinomial-confusion-matrix.csv", "multinomial-class-metrics.csv"]));
    expect(getStatisticalMethodSpec("multinomial-logistic-regression").expectedFigures.map(figure => figure.id)).toEqual(expect.arrayContaining(["multinomial-confusion-matrix", "multinomial-class-metrics"]));
    expect(getStatisticalMethodSpec("robust-linear-regression").expectedTables).toEqual(expect.arrayContaining(["robust-linear-weights.csv"]));
    expect(getStatisticalMethodSpec("robust-linear-regression").expectedFigures.map(figure => figure.id)).toEqual(expect.arrayContaining(["robust-linear-weights"]));
    expect(getStatisticalMethodSpec("logistic-regression").qaGates).toEqual(expect.arrayContaining(["model-binary-outcome-orientation-evidence"]));
    expect(getStatisticalMethodSpec("penalized-linear-regression").expectedTables).toEqual(expect.arrayContaining(["penalized-feature-scaling.csv", "penalized-coefficient-profile.csv", "penalized-cv-summary.csv"]));
    expect(getStatisticalMethodSpec("penalized-logistic-regression").expectedFigures.map(figure => figure.id)).toEqual(expect.arrayContaining(["penalized-coefficient-profile", "penalized-cv-performance"]));
    expect(getStatisticalMethodSpec("penalized-logistic-regression").qaGates).toEqual(expect.arrayContaining(["model-binary-outcome-orientation-evidence"]));
    expect(getStatisticalMethodSpec("prediction-evaluation").qaGates).toEqual(expect.arrayContaining(["prediction-outcome-orientation-evidence"]));
    expect(getStatisticalMethodSpec("diagnostic-accuracy").qaGates).toEqual(expect.arrayContaining(["diagnostic-reference-orientation-evidence", "diagnostic-index-orientation-evidence"]));
    expect(getStatisticalMethodSpec("gamma-glm").expectedTables).toEqual(expect.arrayContaining(["positive-glm-fit-summary.csv"]));
    expect(getStatisticalMethodSpec("gamma-glm").expectedFigures.map(figure => figure.id)).toEqual(expect.arrayContaining(["positive-glm-observed-vs-fitted"]));
    expect(getStatisticalMethodSpec("inverse-gaussian-glm").expectedTables).toEqual(expect.arrayContaining(["positive-glm-fit-summary.csv"]));
    expect(getStatisticalMethodSpec("quantile-regression").expectedTables).toEqual(expect.arrayContaining(["quantile-fit-summary.csv"]));
    expect(getStatisticalMethodSpec("quantile-regression").expectedFigures.map(figure => figure.id)).toEqual(expect.arrayContaining(["quantile-residual-balance"]));
  });

  it("audits method contract QA gate aliases without executing methods", () => {
    const audit = auditStatisticalMethodQaGateAliases();
    expect(audit.totalMethods).toBe(statsMethodSchema.options.length);
    expect(audit.totalUniqueGates).toBeGreaterThan(30);
    expect(audit.abstractGateCount).toBeGreaterThan(20);
    expect(audit.unmappedAbstractGates).toEqual([]);
    expect(audit.gateAliases.find(row => row.gate === "effect-size")).toMatchObject({
      aliasStatus: "abstract_mapped",
      acceptedIds: expect.arrayContaining(["core-inference-effect-size", "categorical-association-effect-size", "correlation-effect-size"]),
      methods: expect.arrayContaining(["t-test", "cochran-q", "pearson"]),
    });
    expect(qaGateContractAliases("proportional-hazards-or-competing-risk-review")).toEqual(expect.arrayContaining([
      "cox-proportional-hazards-diagnostic",
      "cox-ph-diagnostic-artifact",
      "competing-risk-accounting",
    ]));
    expect(qaGateContractAliases("model-binary-outcome-orientation-evidence")).toEqual(["model-binary-outcome-orientation-evidence"]);
  });

  it("audits required method argument contracts without executing methods", () => {
    const audit = auditStatisticalMethodRequiredArguments();
    expect(audit.totalMethods).toBe(statsMethodSchema.options.length);
    expect(audit.totalRequiredArgumentReferences).toBeGreaterThan(statsMethodSchema.options.length);
    expect(audit.uniqueRequiredArguments).toEqual(expect.arrayContaining([
      "outcome",
      "exposure",
      "time or stop",
      "running variable",
      "cluster or id",
      "variables",
    ]));
    expect(audit.unsupportedRequiredArguments).toEqual([]);
    expect(audit.requiredArguments.find(row => row.argument === "time or stop")).toMatchObject({
      contractArgumentName: "timeOrStop",
      acceptedRequestFields: ["time", "stop"],
      status: "mapped",
    });
    expect(audit.requiredArguments.find(row => row.argument === "running variable")).toMatchObject({
      contractArgumentName: "runningVariable",
      acceptedRequestFields: ["runningVariable"],
      status: "mapped",
    });
    expect(contractArgumentNameFor("cluster or id")).toBe("clusterOrId");
    expect(contractArgumentRequestFields("cluster or id")).toEqual(["cluster", "id"]);
    expect(contractArgumentRequestFields("unknown argument")).toEqual([]);
    expect(requiredContractArgumentsForMethod("time-varying-cox")).toEqual(expect.arrayContaining(["timeOrStop", "event", "exposure"]));
    expect(requiredContractArgumentsForMethod("regression-discontinuity")).toEqual(expect.arrayContaining(["outcome", "runningVariable", "cutoff"]));
  });

  it("audits required figure contract aliases without executing methods", () => {
    const audit = auditStatisticalMethodFigureAliases();
    expect(audit.totalMethods).toBe(statsMethodSchema.options.length);
    expect(audit.totalFigures).toBeGreaterThan(audit.requiredFigureCount);
    expect(audit.requiredFigureCount).toBeGreaterThan(30);
    expect(audit.abstractFigureCount).toBeGreaterThan(10);
    expect(audit.unmappedAbstractFigures).toEqual([]);
    expect(audit.figureAliases.find(row => row.method === "cox-proportional-hazards" && row.figureId === "hazard-ratio-forest")).toMatchObject({
      aliasStatus: "abstract_mapped",
      acceptedIds: expect.arrayContaining(["cox-hazard-ratios"]),
      required: true,
    });
    expect(audit.figureAliases.find(row => row.method === "propensity-score-matching" && row.figureId === "covariate-balance-love-plot")).toMatchObject({
      aliasStatus: "abstract_mapped",
      acceptedIds: expect.arrayContaining(["propensity-love-plot", "causal-love-plot"]),
      required: true,
    });
    expect(figureContractAliases("time-varying-cox", "hazard-ratio-forest")).toEqual(expect.arrayContaining([
      "hazard-ratio-forest",
      "cox-hazard-ratios",
      "time-varying-cox-hazard-ratios",
    ]));
    expect(figureContractAliases("descriptive", "numeric-distributions")).toEqual(expect.arrayContaining(["numeric-distributions", "descriptive-histograms"]));
    expect(figureContractAliases("aalen-johansen-cif", "cumulative-incidence")).toEqual(["cumulative-incidence"]);
  });

  it("audits figure source-column roles without executing methods", () => {
    const audit = auditStatisticalMethodFigureSourceColumns();
    expect(audit.totalMethods).toBe(statsMethodSchema.options.length);
    expect(audit.totalFigures).toBeGreaterThan(30);
    expect(audit.totalSourceColumnReferences).toBeGreaterThan(audit.totalFigures);
    expect(audit.unknownSourceColumns).toEqual([]);
    expect(audit.uniqueSourceColumns).toEqual(expect.arrayContaining([
      "outcome",
      "exposure",
      "covariates",
      "running variable",
      "variables",
    ]));
    expect(audit.sourceColumns.find(row => row.sourceColumn === "running variable")).toMatchObject({
      normalizedRole: "running variable",
      acceptedRequestFields: ["runningVariable"],
      status: "known_role",
    });
    expect(audit.sourceColumns.find(row => row.method === "time-varying-cox" && row.figureId === "hazard-ratio-forest" && row.sourceColumn === "stop")).toMatchObject({
      acceptedRequestFields: ["stop"],
      status: "known_role",
    });
    expect(figureSourceColumnRequestFields("running variable")).toEqual(["runningVariable"]);
    expect(figureSourceColumnRequestFields("time")).toEqual(["time", "stop"]);
    expect(figureSourceColumnRequestFields("unknown analysis role")).toEqual([]);
  });

  it("audits expected table artifact contracts without executing methods", () => {
    const audit = auditStatisticalMethodTableArtifacts();
    expect(audit.totalMethods).toBe(statsMethodSchema.options.length);
    expect(audit.totalExpectedTableEntries).toBeGreaterThan(statsMethodSchema.options.length * 3);
    expect(audit.requiredFileExpectationCount).toBeGreaterThan(statsMethodSchema.options.length * 3);
    expect(audit.conditionalFileExpectationCount).toBeGreaterThan(0);
    expect(audit.narrativeExpectationCount).toBeGreaterThan(0);
    expect(audit.missingCoreArtifacts).toEqual([]);
    expect(audit.tableArtifacts.find(row => row.method === "chi-square" && row.expectation.includes("categorical-effect-bootstrap.csv"))).toMatchObject({
      fileNames: ["categorical-effect-bootstrap.csv"],
      requirementStatus: "conditional_file",
    });
    expect(audit.tableArtifacts.find(row => row.method === "kaplan-meier" && row.expectation === "survival/cumulative-incidence curve table")).toMatchObject({
      fileNames: [],
      requirementStatus: "narrative_or_embedded",
    });
    expect(expectedTableArtifactFiles(getStatisticalMethodSpec("chi-square").expectedTables)).toEqual(expect.arrayContaining([
      "stats-summary.json",
      "estimates.csv",
      "diagnostics.json",
      "contingency-table.csv",
      "categorical-source.csv",
      "categorical-cell-diagnostics.csv",
      "categorical-permutation-sensitivity.csv",
    ]));
    expect(expectedTableArtifactFiles(getStatisticalMethodSpec("chi-square").expectedTables)).not.toContain("categorical-effect-bootstrap.csv");
    expect(expectedTableArtifactFiles(getStatisticalMethodSpec("time-varying-cox").expectedTables)).not.toContain("cox-cluster-robust-variance.csv");
    expect(expectedTableArtifactFiles(getStatisticalMethodSpec("recurrent-event-cox").expectedTables)).toContain("cox-cluster-robust-variance.csv");
  });

  it("exposes stats contracts through an operator-facing command renderer", () => {
    const single = researchStatsContractsCommand({ method: "prediction-evaluation" });
    expect(single.contracts).toHaveLength(1);
    expect(single.contracts[0]).toMatchObject({
      method: "prediction-evaluation",
      family: "prediction",
      requiredArguments: expect.arrayContaining(["outcome", "exposure"]),
    });
    expect(single.contracts[0]?.expectedFigures.map(figure => figure.type)).toEqual(expect.arrayContaining(["roc", "precision_recall", "calibration"]));
    expect(single.capabilities[0]).toMatchObject({ method: "prediction-evaluation", status: "executable" });
    expect(single.figureAliasAudit.unmappedAbstractFigures).toEqual([]);
    expect(single.figureSourceColumnAudit.unknownSourceColumns).toEqual([]);
    expect(single.qaGateAliasAudit.unmappedAbstractGates).toEqual([]);
    expect(single.requiredArgumentAudit.unsupportedRequiredArguments).toEqual([]);
    expect(single.tableArtifactAudit.missingCoreArtifacts).toEqual([]);
    expect(renderResearchStatsContracts(single)).toContain("prediction-evaluation: prediction");
    expect(renderResearchStatsContracts(single)).toContain("runner: executable");
    expect(renderResearchStatsContracts(single)).toContain("required arguments:");
    expect(renderResearchStatsContracts(single)).toContain("required figures");
    expect(renderResearchStatsContracts(single)).toContain("table artifacts:");
    expect(renderResearchStatsContracts(single)).toContain("figure aliases:");
    expect(renderResearchStatsContracts(single)).toContain("figure sources:");
    expect(renderResearchStatsContracts(single)).toContain("qa gate aliases:");
    const parsed = JSON.parse(renderResearchStatsContractsJson(single)) as { statsContracts: { contracts: Array<{ method: string; qaGates: string[] }>; capabilities: Array<{ method: string; status: string }>; figureAliasAudit: { unmappedAbstractFigures: Array<{ method: string; figureId: string }> }; figureSourceColumnAudit: { unknownSourceColumns: string[] }; qaGateAliasAudit: { unmappedAbstractGates: string[] }; requiredArgumentAudit: { unsupportedRequiredArguments: string[] }; tableArtifactAudit: { missingCoreArtifacts: Array<{ method: string; missingFiles: string[] }> } } };
    expect(parsed.statsContracts.contracts[0]?.method).toBe("prediction-evaluation");
    expect(parsed.statsContracts.contracts[0]?.qaGates).toContain("calibration");
    expect(parsed.statsContracts.capabilities[0]).toMatchObject({ method: "prediction-evaluation", status: "executable" });
    expect(parsed.statsContracts.figureAliasAudit.unmappedAbstractFigures).toEqual([]);
    expect(parsed.statsContracts.figureSourceColumnAudit.unknownSourceColumns).toEqual([]);
    expect(parsed.statsContracts.qaGateAliasAudit.unmappedAbstractGates).toEqual([]);
    expect(parsed.statsContracts.requiredArgumentAudit.unsupportedRequiredArguments).toEqual([]);
    expect(parsed.statsContracts.tableArtifactAudit.missingCoreArtifacts).toEqual([]);

    const fineGray = researchStatsContractsCommand({ method: "fine-gray" });
    expect(fineGray.capabilities[0]).toMatchObject({ method: "fine-gray", status: "bounded_approximation" });
    expect(fineGray.capabilities[0]?.cannotSupport.join(" ")).toContain("publication-grade Fine-Gray claim");
    expect(renderResearchStatsContracts(fineGray)).toContain("runner: bounded_approximation");
  });

  it("executes representative core, regression, survival, causal, missingness, and psychometric methods", async () => {
    const { dir, dataPath } = await writeStatsFixture();
    const runs = [
      ["welch-t-test", { outcome: "y", group: "g" }],
      ["paired-t-test", { variables: ["wide1", "wide2"] }],
      ["wilcoxon", { variables: ["wide1", "wide2"] }],
      ["kruskal-wallis", { outcome: "y", group: "cat" }],
      ["friedman", { variables: ["wide1", "wide2", "wide3"] }],
      ["cochran-q", { variables: ["bin1", "bin2", "bin3"] }],
      ["cochran-armitage-trend", { outcome: "ybin", exposure: "g" }],
      ["partial-correlation", { outcome: "y", exposure: "x", covariates: ["g"] }],
      ["robust-linear-regression", { outcome: "y", exposure: "x", covariates: ["g"] }],
      ["ordinal-logistic-regression", { outcome: "ord", exposure: "x", covariates: ["g"] }],
      ["multinomial-logistic-regression", { outcome: "multi", exposure: "x", covariates: ["g"] }],
      ["negative-binomial-regression", { outcome: "count", exposure: "x", covariates: ["g"] }],
      ["kaplan-meier", { time: "time", event: "event", group: "g" }],
      ["cox-proportional-hazards", { time: "time", event: "event", exposure: "x", covariates: ["g"] }],
      ["stratified-cox", { time: "time", event: "event", exposure: "x", strata: "cat", covariates: ["g"] }],
      ["aalen-johansen-cif", { time: "time", event: "comp_event", group: "g" }],
      ["recurrent-event-rate", { time: "time", event: "event", id: "cluster" }],
      ["overlap-weighting", { outcome: "y", exposure: "treat", covariates: ["x", "cat"] }],
      ["difference-in-differences", { outcome: "y", exposure: "treat", post: "post", covariates: ["x"] }],
      ["missingness-summary", { variables: ["miss", "x", "cat"] }],
      ["multiple-imputation-mice", { variables: ["miss", "x", "g"] }],
      ["cronbach-alpha", { variables: ["wide1", "wide2", "wide3"] }],
      ["pca", { variables: ["wide1", "wide2", "wide3"] }],
      ["bland-altman", { variables: ["wide1", "wide2"] }],
      ["multiple-comparison-correction", { variables: ["pval"] }],
      ["prediction-evaluation", { outcome: "ybin", exposure: "score" }],
    ] as const;

    for (const [method, opts] of runs) {
      const outDir = path.join(dir, method);
      const result = await researchStatsRunCommand({
        method,
        dataPath,
        outDir,
        variables: [],
        covariates: [],
        exactCovariates: [],
        estimand: "ATT",
        matchRatio: 1,
        replacement: false,
        trimThreshold: 0.01,
        stabilizeWeights: true,
        surveyDesign: false,
        allowSurveyApproximation: false,
        alpha: 0.05,
        python,
        ...opts,
      });

      expect(result.status, method).toBe("succeeded");
      expect(result.estimates.length, method).toBeGreaterThan(0);
      expect(result.artifacts.some(artifact => artifact.kind === "preflight"), method).toBe(true);
      expect(result.artifacts.some(artifact => artifact.kind === "preflight-report"), method).toBe(true);
      expect(result.diagnostics.preflight, method).toMatchObject({ status: expect.any(String), verdict: expect.any(String) });
      expect(result.artifacts.some(artifact => artifact.kind === "figure-manifest"), method).toBe(true);
      expect(result.artifacts.some(artifact => artifact.kind === "figure-qa"), method).toBe(true);
      const qa = JSON.parse(await readFile(path.join(outDir, "stats-qa.json"), "utf-8")) as { status: string; checks: Array<{ id: string; status: string }> };
      expect(["pass", "warning"]).toContain(qa.status);
      expect(qa.checks.find(check => check.id === "preflight-reliability-gate")?.status).toMatch(/pass|warning/);
    }
  });

  it("smoke-runs the remaining executable stats methods so contracts cannot drift from implementation", async () => {
    const { dir, dataPath } = await writeStatsFixture();
    const runs = [
      ["descriptive", { variables: ["y", "x", "cat"] }],
      ["t-test", { outcome: "y", group: "g" }],
      ["anova", { outcome: "y", group: "multi" }],
      ["ancova", { outcome: "y", group: "g", covariates: ["x"] }],
      ["chi-square", { outcome: "ybin", exposure: "g" }],
      ["fisher-exact", { outcome: "ybin", exposure: "g" }],
      ["mcnemar", { outcome: "r1", exposure: "r2" }],
      ["pearson", { outcome: "y", exposure: "x" }],
      ["spearman", { outcome: "y", exposure: "x" }],
      ["kendall", { outcome: "y", exposure: "x" }],
      ["linear-regression", { outcome: "y", exposure: "x", covariates: ["g"] }],
      ["logistic-regression", { outcome: "ybin", exposure: "x", covariates: ["g"] }],
      ["poisson-regression", { outcome: "count", exposure: "x", covariates: ["g"] }],
      ["zero-inflated-poisson", { outcome: "zi_count", exposure: "x", covariates: ["g"] }],
      ["gamma-glm", { outcome: "y", exposure: "x", covariates: ["g"] }],
      ["inverse-gaussian-glm", { outcome: "y", exposure: "x", covariates: ["g"] }],
      ["quantile-regression", { outcome: "y", exposure: "x", covariates: ["g"] }],
      ["penalized-linear-regression", { outcome: "y", exposure: "x", covariates: ["g"], alphaPenalty: 0.05, l1Ratio: 0.5 }],
      ["penalized-logistic-regression", { outcome: "ybin", exposure: "x", covariates: ["g"], alphaPenalty: 0.05, l1Ratio: 0.5 }],
      ["log-rank", { time: "time", event: "event", group: "g" }],
      ["fine-gray", { time: "time", event: "comp_event", exposure: "x", covariates: ["g"] }],
      ["time-varying-cox", { time: "time", event: "event", exposure: "x", covariates: ["g"] }],
      ["linear-mixed-model", { outcome: "y", exposure: "x", cluster: "cluster", covariates: ["g"] }],
      ["generalized-mixed-model", { outcome: "ybin", exposure: "x", cluster: "cluster", covariates: ["g"] }],
      ["repeated-measures-anova", { outcome: "y", exposure: "visit", cluster: "cluster" }],
      ["entropy-balancing", { outcome: "y", exposure: "treat", covariates: ["x", "cat"] }],
      ["doubly-robust-aipw", { outcome: "y", exposure: "treat", covariates: ["x", "cat"] }],
      ["event-study-did", { outcome: "y", exposure: "treat", period: "visit", covariates: ["x"] }],
      ["interrupted-time-series", { outcome: "y", time: "time", post: "post" }],
      ["regression-discontinuity", { outcome: "y", runningVariable: "running", cutoff: 0, covariates: ["x"] }],
      ["instrumental-variables-2sls", { outcome: "y", exposure: "treat", instrument: "instrument", covariates: ["x"] }],
      ["target-trial-emulation-spec", { outcome: "y", exposure: "treat", covariates: ["x"] }],
      ["unmeasured-confounding-sensitivity", { outcome: "ybin", exposure: "treat" }],
      ["complete-case-sensitivity", { outcome: "miss", variables: ["miss", "x", "g"] }],
      ["mnar-sensitivity", { outcome: "miss", variables: ["miss", "x", "g"] }],
      ["intraclass-correlation", { variables: ["wide1", "wide2", "wide3"] }],
      ["model-diagnostics", { outcome: "y", exposure: "x", covariates: ["g"] }],
      ["propensity-score-matching", { outcome: "y", exposure: "treat", covariates: ["x", "cat"], matchRatio: 1, caliper: 0.5 }],
      ["propensity-score-weighting", { outcome: "y", exposure: "treat", covariates: ["x", "cat"] }],
    ] as const;

    for (const [method, opts] of runs) {
      const outDir = path.join(dir, `smoke-${method}`);
      const result = await researchStatsRunCommand({
        method,
        dataPath,
        outDir,
        variables: [],
        covariates: [],
        exactCovariates: [],
        estimand: "ATT",
        matchRatio: 1,
        replacement: false,
        trimThreshold: 0.01,
        stabilizeWeights: true,
        surveyDesign: false,
        allowSurveyApproximation: false,
        alpha: 0.05,
        python,
        ...opts,
      });

      expect(result.status, method).toBe("succeeded");
      expect(result.estimates.length, method).toBeGreaterThan(0);
      expect(result.artifacts.some(artifact => artifact.kind === "method-contract"), method).toBe(true);
      expect(result.artifacts.some(artifact => artifact.kind === "preflight"), method).toBe(true);
      expect(result.artifacts.some(artifact => artifact.kind === "qa"), method).toBe(true);
      expect(result.runnerCapability?.status, method).not.toBe("backend_blocked");
      const qa = JSON.parse(await readFile(path.join(outDir, "stats-qa.json"), "utf-8")) as { checks: Array<{ id: string; status: string }> };
      expect(qa.checks.map(check => check.id), method).toContain("method-contract-artifact");
      expect(qa.checks.find(check => check.id === "runner-capability-recorded")?.status, method).toBe("pass");
    }

  });

  it("writes method contracts into stats packets and QA checks the contract", async () => {
    const { dir, dataPath } = await writeStatsFixture();
    const outDir = path.join(dir, "contracted-welch");
    const result = await researchStatsRunCommand({
      method: "welch-t-test",
      dataPath,
      outDir,
      outcome: "y",
      group: "g",
      variables: [],
      covariates: [],
      exactCovariates: [],
      estimand: "ATT",
      matchRatio: 1,
      replacement: false,
      trimThreshold: 0.01,
      stabilizeWeights: true,
      imputations: 4,
      surveyDesign: false,
      allowSurveyApproximation: false,
      alpha: 0.05,
      python,
    });
    expect(result.status).toBe("succeeded");
    expect(result.artifacts.some(artifact => artifact.kind === "method-contract")).toBe(true);
    const contract = JSON.parse(await readFile(path.join(outDir, "method-contract.json"), "utf-8")) as {
      statisticalMethodSpec: {
        method: string;
        family: string;
        requiredArguments: string[];
        assumptions: string[];
        expectedFigures: Array<{ id: string; required: boolean }>;
        qaGates: string[];
      };
      runnerCapability: {
        method: string;
        status: string;
        reason: string;
        requiredFollowUp: string[];
        cannotSupport: string[];
      };
    };
    expect(contract.statisticalMethodSpec).toMatchObject({
      method: "welch-t-test",
      family: "core_inference",
      requiredArguments: expect.arrayContaining(["outcome", "group"]),
    });
    expect(contract.statisticalMethodSpec.assumptions.join(" ")).toMatch(/distributional|p-values/i);
    expect(contract.statisticalMethodSpec.expectedFigures.some(figure => figure.required)).toBe(true);
    expect(result.runnerCapability).toMatchObject({ method: "welch-t-test", status: "executable" });
    expect(contract.runnerCapability).toMatchObject({ method: "welch-t-test", status: "executable" });
    const qa = JSON.parse(await readFile(path.join(outDir, "stats-qa.json"), "utf-8")) as { checks: Array<{ id: string; status: string }> };
    expect(qa.checks.map(check => check.id)).toEqual(expect.arrayContaining([
      "runner-capability-recorded",
      "runner-capability-promotion-boundary",
      "method-contract-artifact",
      "method-contract-required-inputs",
      "method-contract-diagnostics",
      "method-contract-artifact-coverage",
      "method-contract-figure-coverage",
      "method-contract-qa-gate-coverage",
      "method-contract-escalation-rules",
    ]));
    expect(qa.checks.find(check => check.id === "runner-capability-recorded")?.status).toBe("pass");
    expect(qa.checks.find(check => check.id === "runner-capability-promotion-boundary")?.status).toBe("pass");
    expect(qa.checks.find(check => check.id === "method-contract-artifact")?.status).toBe("pass");
    expect(qa.checks.find(check => check.id === "method-contract-artifact-coverage")?.status).toBe("pass");
    expect(qa.checks.find(check => check.id === "method-contract-figure-coverage")).toMatchObject({
      status: "pass",
      detail: expect.stringContaining("outcome-distribution-by-group->group-distribution"),
    });
    expect(qa.checks.find(check => check.id === "method-contract-qa-gate-coverage")).toMatchObject({
      status: "pass",
      detail: expect.stringContaining("effect-size->core-inference-effect-size"),
    });
  });

  it("inspects rendered figures for dimensions, blankness, captions, alt text, and source columns", async () => {
    const { dir, dataPath } = await writeStatsFixture();
    const outDir = path.join(dir, "figure-qa");
    const result = await researchStatsRunCommand({
      method: "prediction-evaluation",
      dataPath,
      outDir,
      outcome: "ybin",
      exposure: "score",
      group: "g",
      variables: [],
      covariates: [],
      exactCovariates: [],
      estimand: "ATT",
      matchRatio: 1,
      replacement: false,
      trimThreshold: 0.01,
      stabilizeWeights: true,
      surveyDesign: false,
      allowSurveyApproximation: false,
      alpha: 0.05,
      python,
    });
    expect(result.status).toBe("succeeded");
    const qa = await researchFigureQaCommand({
      manifestPath: path.join(outDir, "figures.json"),
      outPath: path.join(outDir, "figure-qa-repeat.json"),
      reportPath: path.join(outDir, "figure-qa-repeat.md"),
    });
    expect(qa.status).toBe("pass");
    expect(qa.figures.length).toBeGreaterThan(0);
    expect(qa.figures[0]?.width).toBeGreaterThanOrEqual(900);
    expect(qa.figures[0]?.height).toBeGreaterThanOrEqual(600);
    expect(qa.figures[0]?.nonBlankRatio ?? 0).toBeGreaterThan(0.006);
    expect(qa.figures[0]?.altText).toBeTruthy();
    expect(qa.figures[0]?.sourceDataPath).toBeTruthy();
    expect(qa.figures[0]?.sourceDataRows ?? 0).toBeGreaterThan(0);
    expect(qa.figures[0]?.sourceDataColumns).toEqual(expect.arrayContaining(["ybin", "score"]));
    expect(qa.figures[0]?.checks.map(check => check.id)).toEqual(expect.arrayContaining([
      "source-data-path-recorded",
      "source-data-file-exists",
      "source-data-nonempty",
      "source-data-columns",
    ]));
  });

  it("records core inference effect sizes, intervals, and assumption evidence", async () => {
    const { dir, dataPath } = await writeStatsFixture();

    const welchOut = path.join(dir, "welch-core-evidence");
    const welch = await researchStatsRunCommand({
      method: "welch-t-test",
      dataPath,
      outDir: welchOut,
      outcome: "y",
      group: "g",
      variables: [],
      covariates: [],
      exactCovariates: [],
      estimand: "ATT",
      matchRatio: 1,
      replacement: false,
      trimThreshold: 0.01,
      stabilizeWeights: true,
      surveyDesign: false,
      allowSurveyApproximation: false,
      alpha: 0.05,
      python,
    });
    expect(welch.status).toBe("succeeded");
    expect(welch.estimates[0]).toMatchObject({
      mean_difference: expect.any(Number),
      standard_error: expect.any(Number),
      degrees_of_freedom: expect.any(Number),
      ci_low: expect.any(Number),
      ci_high: expect.any(Number),
      cohen_d: expect.any(Number),
      hedges_g: expect.any(Number),
    });
    expect(welch.diagnostics).toMatchObject({
      test: "two-sample t-test",
      equal_variance_assumed: false,
      group_counts: expect.any(Object),
      levene_p_value: expect.any(Number),
      variance_ratio: expect.any(Number),
      group_shapiro_min_p_value: expect.any(Number),
      artifacts: expect.objectContaining({
        group_summary: expect.stringContaining("group-summary.csv"),
        analysis_values: expect.stringContaining("analysis-values.csv"),
        permutation_sensitivity: expect.stringContaining("permutation-sensitivity.csv"),
      }),
      permutation_sensitivity: expect.objectContaining({
        permutation_p_value: expect.any(Number),
        permutations_evaluated: expect.any(Number),
        route: "welch-t-test",
      }),
    });
    expect(welch.artifacts.some(artifact => artifact.path.endsWith("group-summary.csv"))).toBe(true);
    expect(welch.artifacts.some(artifact => artifact.path.endsWith("analysis-values.csv"))).toBe(true);
    expect(welch.artifacts.some(artifact => artifact.path.endsWith("permutation-sensitivity.csv"))).toBe(true);
    const groupSummary = await readFile(path.join(welchOut, "group-summary.csv"), "utf-8");
    expect(groupSummary).toContain("mean");
    const analysisValues = await readFile(path.join(welchOut, "analysis-values.csv"), "utf-8");
    expect(analysisValues).toContain("outcome_value");
    const permutationSensitivity = await readFile(path.join(welchOut, "permutation-sensitivity.csv"), "utf-8");
    expect(permutationSensitivity).toContain("permutation_p_value");
    const welchQa = JSON.parse(await readFile(path.join(welchOut, "stats-qa.json"), "utf-8")) as { checks: Array<{ id: string; status: string }> };
    expect(welchQa.checks.map(check => check.id)).toEqual(expect.arrayContaining([
      "core-inference-sample-size",
      "core-inference-effect-size",
      "core-inference-uncertainty",
      "core-inference-assumptions",
      "core-inference-source-artifact",
      "core-inference-group-orientation-evidence",
      "core-inference-permutation-sensitivity",
      "mean-comparison-variance-balance",
      "mean-comparison-normality-evidence",
    ]));
    expect(welchQa.checks.find(check => check.id === "core-inference-group-orientation-evidence")?.status).toBe("pass");
    expect(welchQa.checks.find(check => check.id === "core-inference-permutation-sensitivity")?.status).toBe("pass");

    const anovaOut = path.join(dir, "anova-core-posthoc");
    const anova = await researchStatsRunCommand({
      method: "anova",
      dataPath,
      outDir: anovaOut,
      outcome: "y",
      group: "multi",
      variables: [],
      covariates: [],
      exactCovariates: [],
      estimand: "ATT",
      matchRatio: 1,
      replacement: false,
      trimThreshold: 0.01,
      stabilizeWeights: true,
      surveyDesign: false,
      allowSurveyApproximation: false,
      alpha: 0.05,
      python,
    });
    expect(anova.status).toBe("succeeded");
    expect(anova.estimates[0]).toMatchObject({
      term: "C(multi)",
      eta_squared: expect.any(Number),
      eta_squared_ci_low: expect.any(Number),
      eta_squared_ci_high: expect.any(Number),
      partial_eta_squared: expect.any(Number),
      omega_squared: expect.any(Number),
      effect_measure: "eta_squared",
      ci_method: "stratified row bootstrap percentile",
    });
    expect(anova.diagnostics).toMatchObject({
      artifacts: expect.objectContaining({
        group_summary: expect.stringContaining("group-summary.csv"),
        analysis_values: expect.stringContaining("analysis-values.csv"),
        posthoc_contrasts: expect.stringContaining("posthoc-contrasts.csv"),
        permutation_sensitivity: expect.stringContaining("permutation-sensitivity.csv"),
        omnibus_effect_bootstrap: expect.stringContaining("omnibus-effect-bootstrap.csv"),
      }),
      permutation_sensitivity: expect.objectContaining({
        permutation_p_value: expect.any(Number),
        permutations_evaluated: expect.any(Number),
        route: "anova",
      }),
      omnibus_effect_bootstrap_interval: expect.objectContaining({
        available_metrics: expect.arrayContaining(["eta_squared"]),
      }),
      posthoc_contrast_count: 3,
      posthoc_adjustment: "Holm",
    });
    expect(anova.artifacts.some(artifact => artifact.path.endsWith("posthoc-contrasts.csv"))).toBe(true);
    expect(anova.artifacts.some(artifact => artifact.path.endsWith("permutation-sensitivity.csv"))).toBe(true);
    expect(anova.artifacts.some(artifact => artifact.path.endsWith("omnibus-effect-bootstrap.csv"))).toBe(true);
    const posthocRows = await readFile(path.join(anovaOut, "posthoc-contrasts.csv"), "utf-8");
    expect(posthocRows).toContain("adjusted_p_value");
    expect(posthocRows).toContain("p_adjust_method");
    await expect(readFile(path.join(anovaOut, "permutation-sensitivity.csv"), "utf-8")).resolves.toContain("label permutation sensitivity");
    await expect(readFile(path.join(anovaOut, "omnibus-effect-bootstrap.csv"), "utf-8")).resolves.toContain("eta_squared");
    const anovaQa = JSON.parse(await readFile(path.join(anovaOut, "stats-qa.json"), "utf-8")) as { checks: Array<{ id: string; status: string }> };
    expect(anovaQa.checks).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "core-inference-omnibus-effect-size", status: "pass" }),
      expect.objectContaining({ id: "core-inference-omnibus-effect-bootstrap", status: "pass" }),
      expect.objectContaining({ id: "core-inference-posthoc-contrasts", status: "pass" }),
      expect.objectContaining({ id: "core-inference-permutation-sensitivity", status: "pass" }),
    ]));

    const categoricalOut = path.join(dir, "chi-core-evidence");
    const categorical = await researchStatsRunCommand({
      method: "chi-square",
      dataPath,
      outDir: categoricalOut,
      outcome: "ybin",
      exposure: "g",
      variables: [],
      covariates: [],
      exactCovariates: [],
      estimand: "ATT",
      matchRatio: 1,
      replacement: false,
      trimThreshold: 0.01,
      stabilizeWeights: true,
      surveyDesign: false,
      allowSurveyApproximation: false,
      alpha: 0.05,
      python,
    });
    expect(categorical.status).toBe("succeeded");
    expect(categorical.estimates[0]).toMatchObject({
      cramers_v: expect.any(Number),
      odds_ratio: expect.any(Number),
      or_ci_low: expect.any(Number),
      or_ci_high: expect.any(Number),
      risk_ratio: expect.any(Number),
      risk_difference: expect.any(Number),
      odds_ratio_bootstrap_ci_low: expect.any(Number),
      odds_ratio_bootstrap_ci_high: expect.any(Number),
      risk_ratio_bootstrap_ci_low: expect.any(Number),
      risk_ratio_bootstrap_ci_high: expect.any(Number),
      risk_difference_bootstrap_ci_low: expect.any(Number),
      risk_difference_bootstrap_ci_high: expect.any(Number),
      permutation_p_value: expect.any(Number),
      permutation_method: "fixed-margin outcome-label permutation",
      bootstrap_ci_method: "multinomial cell-count bootstrap percentile",
    });
    expect(categorical.diagnostics).toMatchObject({
      table: expect.any(Object),
      expected_counts: expect.any(Array),
      min_expected: expect.any(Number),
      two_by_two_effects: true,
      categorical_permutation_sensitivity: expect.objectContaining({
        status: "available",
        permutation_p_value: expect.any(Number),
      }),
      two_by_two_bootstrap_interval: expect.objectContaining({
        available_metrics: expect.arrayContaining(["risk_difference", "risk_ratio", "odds_ratio"]),
      }),
      artifacts: expect.objectContaining({
        contingency_table: expect.stringContaining("contingency-table.csv"),
        categorical_source: expect.stringContaining("categorical-source.csv"),
        categorical_cell_diagnostics: expect.stringContaining("categorical-cell-diagnostics.csv"),
        categorical_permutation_sensitivity: expect.stringContaining("categorical-permutation-sensitivity.csv"),
        categorical_effect_bootstrap: expect.stringContaining("categorical-effect-bootstrap.csv"),
      }),
      categorical_cell_diagnostics: expect.objectContaining({
        cell_count: expect.any(Number),
        sparse_expected_cell_count: expect.any(Number),
        max_abs_standardized_residual: expect.any(Number),
      }),
    });
    expect(categorical.artifacts.some(artifact => artifact.path.endsWith("contingency-table.csv"))).toBe(true);
    expect(categorical.artifacts.some(artifact => artifact.path.endsWith("categorical-source.csv"))).toBe(true);
    expect(categorical.artifacts.some(artifact => artifact.path.endsWith("categorical-cell-diagnostics.csv"))).toBe(true);
    expect(categorical.artifacts.some(artifact => artifact.path.endsWith("categorical-permutation-sensitivity.csv"))).toBe(true);
    expect(categorical.artifacts.some(artifact => artifact.path.endsWith("categorical-effect-bootstrap.csv"))).toBe(true);
    const categoricalCells = await readFile(path.join(categoricalOut, "categorical-cell-diagnostics.csv"), "utf-8");
    expect(categoricalCells).toContain("expected");
    expect(categoricalCells).toContain("standardized_residual");
    expect(categoricalCells).toContain("chi_square_contribution");
    const categoricalBootstrap = await readFile(path.join(categoricalOut, "categorical-effect-bootstrap.csv"), "utf-8");
    expect(categoricalBootstrap).toContain("multinomial_resampled_2x2_cell_counts");
    const categoricalPermutation = await readFile(path.join(categoricalOut, "categorical-permutation-sensitivity.csv"), "utf-8");
    expect(categoricalPermutation).toContain("fixed-margin outcome-label permutation");
    expect(categoricalPermutation).toContain("permutation_p_value");
    const categoricalQa = JSON.parse(await readFile(path.join(categoricalOut, "stats-qa.json"), "utf-8")) as { checks: Array<{ id: string; status: string }> };
    expect(categoricalQa.checks.map(check => check.id)).toEqual(expect.arrayContaining([
      "categorical-association-table",
      "categorical-association-effect-size",
      "categorical-expected-counts",
      "categorical-source-artifact",
      "categorical-cell-diagnostics-artifact",
      "categorical-sparse-cell-policy",
      "categorical-cell-residual-review",
      "categorical-binary-orientation-evidence",
      "categorical-permutation-sensitivity",
      "categorical-effect-bootstrap-uncertainty",
    ]));
    expect(categoricalQa.checks.find(check => check.id === "categorical-permutation-sensitivity")?.status).toBe("pass");
    expect(categoricalQa.checks.find(check => check.id === "categorical-effect-bootstrap-uncertainty")?.status).toBe("pass");

    const correlationOut = path.join(dir, "pearson-core-evidence");
    const correlation = await researchStatsRunCommand({
      method: "pearson",
      dataPath,
      outDir: correlationOut,
      outcome: "y",
      exposure: "x",
      variables: [],
      covariates: [],
      exactCovariates: [],
      estimand: "ATT",
      matchRatio: 1,
      replacement: false,
      trimThreshold: 0.01,
      stabilizeWeights: true,
      surveyDesign: false,
      allowSurveyApproximation: false,
      alpha: 0.05,
      python,
    });
    expect(correlation.status).toBe("succeeded");
    expect(correlation.estimates[0]).toMatchObject({
      correlation: expect.any(Number),
      ci_low: expect.any(Number),
      ci_high: expect.any(Number),
      bootstrap_ci_low: expect.any(Number),
      bootstrap_ci_high: expect.any(Number),
      bootstrap_ci_method: "row bootstrap percentile",
      n: expect.any(Number),
    });
    expect(correlation.diagnostics).toMatchObject({
      ci_method: "Fisher z confidence interval",
      ci_available: true,
      bootstrap_interval: expect.objectContaining({
        available_metrics: expect.arrayContaining(["correlation"]),
      }),
      source_pairs: expect.any(Number),
      leave_one_out_influence: expect.objectContaining({ available: true, max_abs_delta: expect.any(Number) }),
      artifacts: expect.objectContaining({
        correlation_source: expect.stringContaining("correlation-source.csv"),
        correlation_influence: expect.stringContaining("correlation-influence.csv"),
        correlation_bootstrap: expect.stringContaining("correlation-bootstrap.csv"),
      }),
    });
    expect(correlation.artifacts.some(artifact => artifact.path.endsWith("correlation-source.csv"))).toBe(true);
    expect(correlation.artifacts.some(artifact => artifact.path.endsWith("correlation-influence.csv"))).toBe(true);
    expect(correlation.artifacts.some(artifact => artifact.path.endsWith("correlation-bootstrap.csv"))).toBe(true);
    const sourceRows = await readFile(path.join(correlationOut, "correlation-source.csv"), "utf-8");
    expect(sourceRows).toContain("correlation_x");
    const influenceRows = await readFile(path.join(correlationOut, "correlation-influence.csv"), "utf-8");
    expect(influenceRows).toContain("delta_from_full_correlation");
    const bootstrapRows = await readFile(path.join(correlationOut, "correlation-bootstrap.csv"), "utf-8");
    expect(bootstrapRows).toContain("row bootstrap percentile");
    const correlationQa = JSON.parse(await readFile(path.join(correlationOut, "stats-qa.json"), "utf-8")) as { checks: Array<{ id: string; status: string }> };
    expect(correlationQa.checks.map(check => check.id)).toEqual(expect.arrayContaining([
      "estimate-p-values-in-domain",
      "estimate-ci-order",
      "estimate-within-ci",
      "estimate-standard-errors-nonnegative",
      "estimate-counts-nonnegative",
      "correlation-effect-size",
      "correlation-uncertainty",
      "correlation-source-artifact",
      "correlation-bootstrap-uncertainty",
      "correlation-influence-sensitivity",
    ]));
    expect(correlationQa.checks.find(check => check.id === "correlation-bootstrap-uncertainty")?.status).toBe("pass");
    expect(correlationQa.checks.filter(check => check.id.startsWith("estimate-")).every(check => check.status === "pass")).toBe(true);

    const partialOut = path.join(dir, "partial-core-evidence");
    const partial = await researchStatsRunCommand({
      method: "partial-correlation",
      dataPath,
      outDir: partialOut,
      outcome: "y",
      exposure: "x",
      covariates: ["g"],
      variables: [],
      exactCovariates: [],
      estimand: "ATT",
      matchRatio: 1,
      replacement: false,
      trimThreshold: 0.01,
      stabilizeWeights: true,
      surveyDesign: false,
      allowSurveyApproximation: false,
      alpha: 0.05,
      python,
    });
    expect(partial.status).toBe("succeeded");
    expect(partial.diagnostics).toMatchObject({
      ci_method: "Fisher z confidence interval on residualized Pearson correlation",
      artifacts: expect.objectContaining({
        correlation_source: expect.stringContaining("correlation-source.csv"),
        correlation_influence: expect.stringContaining("correlation-influence.csv"),
        correlation_bootstrap: expect.stringContaining("correlation-bootstrap.csv"),
      }),
    });
    expect(partial.estimates[0]).toMatchObject({
      bootstrap_ci_low: expect.any(Number),
      bootstrap_ci_high: expect.any(Number),
    });
    const partialSourceRows = await readFile(path.join(partialOut, "correlation-source.csv"), "utf-8");
    expect(partialSourceRows).toContain("True");
  });

  it("orients two-group numeric and rank contrasts by semantic group labels", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "agenteer-stats-group-orientation-"));
    try {
      const welchPath = path.join(dir, "exposed-unexposed.csv");
      const welchRows = ["y,group"];
      welchRows.push(...Array.from({ length: 36 }, (_, index) => `${(10 + (index % 5) * 0.2).toFixed(3)},exposed`));
      welchRows.push(...Array.from({ length: 36 }, (_, index) => `${(2 + (index % 5) * 0.2).toFixed(3)},unexposed`));
      await writeFile(welchPath, `${welchRows.join("\n")}\n`);

      const base = {
        outcome: "y",
        group: "group",
        variables: [],
        covariates: [],
        exactCovariates: [],
        estimand: "ATT" as const,
        matchRatio: 1,
        replacement: false,
        trimThreshold: 0.01,
        stabilizeWeights: true,
        surveyDesign: false,
        allowSurveyApproximation: false,
        alpha: 0.05,
        bootstrapReplicates: 80,
        python,
      };
      const welchOut = path.join(dir, "welch");
      const welch = await researchStatsRunCommand({
        ...base,
        method: "welch-t-test",
        dataPath: welchPath,
        outDir: welchOut,
      });

      expect(welch.status).toBe("succeeded");
      expect(welch.estimates[0]).toMatchObject({
        group_a: "unexposed",
        group_b: "exposed",
        mean_difference: expect.any(Number),
      });
      expect(Number(welch.estimates[0]?.mean_difference)).toBeGreaterThan(7.5);
      expect(welch.diagnostics).toMatchObject({
        group_orientation: expect.objectContaining({
          group_a: "unexposed",
          group_b: "exposed",
          ordering_evidence: "semantic binary labels",
        }),
      });
      const welchSummary = await readFile(path.join(welchOut, "group-summary.csv"), "utf-8");
      expect(welchSummary.indexOf("unexposed")).toBeLessThan(welchSummary.indexOf("exposed"));
      const welchQa = JSON.parse(await readFile(path.join(welchOut, "stats-qa.json"), "utf-8")) as { checks: Array<{ id: string; status: string }> };
      expect(welchQa.checks).toEqual(expect.arrayContaining([
        expect.objectContaining({ id: "core-inference-group-orientation-evidence", status: "pass" }),
      ]));

      const rankPath = path.join(dir, "case-control.csv");
      const rankRows = ["y,group"];
      rankRows.push(...Array.from({ length: 34 }, (_, index) => `${(14 + (index % 7)).toFixed(3)},case`));
      rankRows.push(...Array.from({ length: 34 }, (_, index) => `${(5 + (index % 7)).toFixed(3)},control`));
      await writeFile(rankPath, `${rankRows.join("\n")}\n`);
      const mannOut = path.join(dir, "mann-whitney");
      const mannWhitney = await researchStatsRunCommand({
        ...base,
        method: "mann-whitney",
        dataPath: rankPath,
        outDir: mannOut,
      });

      expect(mannWhitney.status).toBe("succeeded");
      expect(mannWhitney.estimates[0]).toMatchObject({
        group_a: "control",
        group_b: "case",
        median_difference: expect.any(Number),
        rank_biserial_correlation: expect.any(Number),
      });
      expect(Number(mannWhitney.estimates[0]?.median_difference)).toBeGreaterThan(8);
      expect(Number(mannWhitney.estimates[0]?.rank_biserial_correlation)).toBeGreaterThan(0.9);
      expect(mannWhitney.diagnostics).toMatchObject({
        group_orientation: expect.objectContaining({
          group_a: "control",
          group_b: "case",
          ordering_evidence: "semantic binary labels",
        }),
      });
      const mannQa = JSON.parse(await readFile(path.join(mannOut, "stats-qa.json"), "utf-8")) as { checks: Array<{ id: string; status: string }> };
      expect(mannQa.checks).toEqual(expect.arrayContaining([
        expect.objectContaining({ id: "core-inference-group-orientation-evidence", status: "pass" }),
      ]));
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("warns when two-group numeric effect direction relies on lexical group labels", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "agenteer-stats-group-lexical-orientation-"));
    try {
      const dataPath = path.join(dir, "ambiguous-groups.csv");
      const rows = ["y,group"];
      rows.push(...Array.from({ length: 36 }, (_, index) => `${(8 + (index % 5) * 0.2).toFixed(3)},alpha`));
      rows.push(...Array.from({ length: 36 }, (_, index) => `${(4 + (index % 5) * 0.2).toFixed(3)},beta`));
      await writeFile(dataPath, `${rows.join("\n")}\n`);
      const outDir = path.join(dir, "welch");
      const result = await researchStatsRunCommand({
        method: "welch-t-test",
        dataPath,
        outDir,
        outcome: "y",
        group: "group",
        variables: [],
        covariates: [],
        exactCovariates: [],
        estimand: "ATT",
        matchRatio: 1,
        replacement: false,
        trimThreshold: 0.01,
        stabilizeWeights: true,
        surveyDesign: false,
        allowSurveyApproximation: false,
        alpha: 0.05,
        bootstrapReplicates: 80,
        python,
      });

      expect(result.status).toBe("succeeded");
      expect(result.diagnostics).toMatchObject({
        group_orientation: expect.objectContaining({
          group_a: "alpha",
          group_b: "beta",
          ordering_evidence: "lexical fallback",
        }),
      });
      const qa = JSON.parse(await readFile(path.join(outDir, "stats-qa.json"), "utf-8")) as { checks: Array<{ id: string; status: string; detail: string }> };
      expect(qa.checks).toEqual(expect.arrayContaining([
        expect.objectContaining({ id: "core-inference-group-orientation-evidence", status: "warning" }),
      ]));
      expect(qa.checks.find(check => check.id === "core-inference-group-orientation-evidence")?.detail).toContain("confirm that group_a=alpha");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("uses complete-case group levels for independent group-test eligibility", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "agenteer-stats-complete-case-groups-"));
    try {
      const dataPath = path.join(dir, "marginal-third-group.csv");
      await writeFile(dataPath, [
        "y,group",
        ...Array.from({ length: 30 }, (_, index) => `${(2 + index * 0.04).toFixed(4)},control`),
        ...Array.from({ length: 30 }, (_, index) => `${(3 + index * 0.05).toFixed(4)},treated`),
        ...Array.from({ length: 12 }, () => ",screened_only"),
      ].join("\n"));
      const result = await researchStatsRunCommand({
        method: "welch-t-test",
        dataPath,
        outDir: path.join(dir, "welch"),
        outcome: "y",
        group: "group",
        variables: [],
        covariates: [],
        exactCovariates: [],
        estimand: "ATT",
        matchRatio: 1,
        replacement: false,
        trimThreshold: 0.01,
        stabilizeWeights: true,
        surveyDesign: false,
        allowSurveyApproximation: false,
        alpha: 0.05,
        python,
      });

      expect(result.status).toBe("succeeded");
      expect(result.diagnostics).toMatchObject({
        group_counts: {
          control: 30,
          treated: 30,
        },
      });
      const preflight = result.diagnostics.preflight as { checks?: Array<{ id: string; status: string; detail: string }>; methodDecisionSupport?: { dataSignals?: Record<string, unknown> } };
      expect(preflight.checks?.map(check => check.id)).not.toContain("two-group-method-levels");
      expect(preflight.checks?.find(check => check.id === "group-complete-case-support")).toMatchObject({
        status: "pass",
      });
      expect(preflight.methodDecisionSupport?.dataSignals).toMatchObject({
        groupComparisonLevelCount: 2,
        groupComparisonMinGroupCount: 30,
      });
      const summary = await readFile(path.join(dir, "welch", "group-summary.csv"), "utf-8");
      expect(summary).toContain("control");
      expect(summary).toContain("treated");
      expect(summary).not.toContain("screened_only");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("flags equal-variance t-tests when group variances are badly imbalanced", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "agenteer-stats-variance-balance-"));
    const dataPath = path.join(dir, "variance-imbalance.csv");
    await writeFile(dataPath, [
      "y,g",
      ...Array.from({ length: 80 }, (_, index) => {
        const g = index < 40 ? 0 : 1;
        const within = index % 40;
        const y = g === 0 ? 10 + within * 0.01 : 10 + within * 1.5;
        return `${y.toFixed(4)},${g}`;
      }),
    ].join("\n"));

    const equalVariance = await researchStatsRunCommand({
      method: "t-test",
      dataPath,
      outDir: path.join(dir, "equal-variance"),
      outcome: "y",
      group: "g",
      variables: [],
      covariates: [],
      exactCovariates: [],
      estimand: "ATT",
      matchRatio: 1,
      replacement: false,
      trimThreshold: 0.01,
      stabilizeWeights: true,
      surveyDesign: false,
      allowSurveyApproximation: false,
      alpha: 0.05,
      python,
    });
    expect(equalVariance.status).toBe("succeeded");
    const equalQa = JSON.parse(await readFile(path.join(dir, "equal-variance", "stats-qa.json"), "utf-8")) as { status: string; checks: Array<{ id: string; status: string; detail: string }> };
    expect(equalQa.status).toBe("fail");
    expect(equalQa.checks.find(check => check.id === "mean-comparison-variance-balance")).toMatchObject({
      status: "fail",
    });

    const welch = await researchStatsRunCommand({
      method: "welch-t-test",
      dataPath,
      outDir: path.join(dir, "welch"),
      outcome: "y",
      group: "g",
      variables: [],
      covariates: [],
      exactCovariates: [],
      estimand: "ATT",
      matchRatio: 1,
      replacement: false,
      trimThreshold: 0.01,
      stabilizeWeights: true,
      surveyDesign: false,
      allowSurveyApproximation: false,
      alpha: 0.05,
      python,
    });
    expect(welch.status).toBe("succeeded");
    const welchQa = JSON.parse(await readFile(path.join(dir, "welch", "stats-qa.json"), "utf-8")) as { status: string; checks: Array<{ id: string; status: string }> };
    expect(welchQa.checks.find(check => check.id === "mean-comparison-variance-balance")?.status).toBe("pass");
  });

  it("records data-driven method decision support before executing a statistical route", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "agenteer-stats-method-decision-"));
    const dataPath = path.join(dir, "two-group.csv");
    await writeFile(dataPath, [
      "y,g",
      ...Array.from({ length: 72 }, (_, index) => {
        const g = index < 36 ? 0 : 1;
        const y = g === 0 ? 10 + (index % 6) * 0.2 : 13 + (index % 6) * 0.35;
        return `${y.toFixed(4)},${g}`;
      }),
    ].join("\n"));
    const analysisSpecPath = path.join(dir, "analysis-spec.json");
    await writeFile(analysisSpecPath, JSON.stringify({ specHash: "spec_method_decision_fallback", method: "t-test" }));

    const result = await researchStatsRunCommand({
      method: "t-test",
      dataPath,
      outDir: path.join(dir, "run"),
      analysisSpecPath,
      outcome: "y",
      group: "g",
      variables: [],
      covariates: [],
      exactCovariates: [],
      estimand: "ATT",
      matchRatio: 1,
      replacement: false,
      trimThreshold: 0.01,
      stabilizeWeights: true,
      surveyDesign: false,
      allowSurveyApproximation: false,
      alpha: 0.05,
      python,
    });

    expect(result.status).toBe("succeeded");
    expect(result.resultPosture).toMatchObject({
      status: "exploratory_standard_table",
      label: "Exploratory method-choice result",
    });
    expect(result.resultPosture?.cannotSupport).toContain("primary-method inference");
    expect(result.artifacts.map(artifact => artifact.kind)).toEqual(expect.arrayContaining([
      "method-decision-support",
      "method-decision-support-report",
    ]));
    const preflight = result.diagnostics.preflight as { methodDecisionSupport?: { requestedRole?: string; verdict?: string; primaryMethods?: Array<{ method: string }>; fallbackMethods?: Array<{ method: string }> } };
    expect(preflight.methodDecisionSupport).toMatchObject({
      requestedRole: "fallback",
      verdict: "fallback_only",
    });
    expect(preflight.methodDecisionSupport?.primaryMethods?.map(candidate => candidate.method)).toContain("welch-t-test");
    expect(preflight.methodDecisionSupport?.fallbackMethods?.map(candidate => candidate.method)).toContain("t-test");
    const decision = JSON.parse(await readFile(path.join(dir, "run", "method-decision-support.json"), "utf-8")) as { methodDecisionSupport: { requestedMethod: string; primaryMethods: Array<{ method: string }>; fallbackMethods: Array<{ method: string }> } };
    expect(decision.methodDecisionSupport.requestedMethod).toBe("t-test");
    expect(decision.methodDecisionSupport.primaryMethods.map(candidate => candidate.method)).toContain("welch-t-test");
    expect(decision.methodDecisionSupport.fallbackMethods.map(candidate => candidate.method)).toContain("t-test");
    const decisionReport = await readFile(path.join(dir, "run", "method-decision-support.md"), "utf-8");
    expect(decisionReport).toContain("Primary Methods");
    const qa = JSON.parse(await readFile(path.join(dir, "run", "stats-qa.json"), "utf-8")) as { checks: Array<{ id: string; status: string }> };
    expect(qa.checks).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "preflight-reliability-gate", status: "warning" }),
      expect.objectContaining({ id: "method-decision-support-artifact", status: "pass" }),
      expect.objectContaining({ id: "method-decision-alignment", status: "warning" }),
      expect.objectContaining({ id: "result-posture", status: "warning" }),
    ]));
  });

  it("uses complete-case categorical table support to choose chi-square versus Fisher", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "agenteer-stats-categorical-decision-"));
    try {
      const sparsePath = path.join(dir, "sparse-2x2.csv");
      const densePath = path.join(dir, "dense-2x2.csv");
      await writeFile(sparsePath, [
        "outcome,exposure",
        ...Array.from({ length: 60 }, () => "0,0"),
        ...Array.from({ length: 30 }, () => "1,0"),
        ...Array.from({ length: 28 }, () => "0,1"),
        ...Array.from({ length: 2 }, () => "1,1"),
      ].join("\n"));
      await writeFile(densePath, [
        "outcome,exposure",
        ...Array.from({ length: 30 }, () => "0,0"),
        ...Array.from({ length: 30 }, () => "1,0"),
        ...Array.from({ length: 30 }, () => "0,1"),
        ...Array.from({ length: 30 }, () => "1,1"),
      ].join("\n"));
      const base = {
        outcome: "outcome",
        exposure: "exposure",
        variables: [],
        covariates: [],
        exactCovariates: [],
        estimand: "ATT" as const,
        matchRatio: 1,
        replacement: false,
        trimThreshold: 0.01,
        stabilizeWeights: true,
        surveyDesign: false,
        allowSurveyApproximation: false,
        alpha: 0.05,
        python,
      };
      const sparseChi = await researchStatsRunCommand({
        ...base,
        method: "chi-square",
        dataPath: sparsePath,
        outDir: path.join(dir, "sparse-chi"),
      });
      const sparseFisher = await researchStatsRunCommand({
        ...base,
        method: "fisher-exact",
        dataPath: sparsePath,
        outDir: path.join(dir, "sparse-fisher"),
      });
      const denseChi = await researchStatsRunCommand({
        ...base,
        method: "chi-square",
        dataPath: densePath,
        outDir: path.join(dir, "dense-chi"),
      });

      expect(sparseChi.status).toBe("succeeded");
      const sparseChiDecision = (sparseChi.diagnostics.preflight as { methodDecisionSupport?: { requestedRole?: string; verdict?: string; dataSignals?: Record<string, unknown>; primaryMethods?: Array<{ method: string }>; fallbackMethods?: Array<{ method: string }> } }).methodDecisionSupport;
      expect(sparseChiDecision).toMatchObject({
        requestedRole: "fallback",
        verdict: "fallback_only",
        dataSignals: expect.objectContaining({
          categoricalTableShape: "2x2",
          categoricalTableMinObserved: 2,
        }),
        primaryMethods: expect.arrayContaining([expect.objectContaining({ method: "fisher-exact" })]),
        fallbackMethods: expect.arrayContaining([expect.objectContaining({ method: "chi-square" })]),
      });

      expect(sparseFisher.status).toBe("succeeded");
      const sparseFisherDecision = (sparseFisher.diagnostics.preflight as { methodDecisionSupport?: { requestedRole?: string; verdict?: string; primaryMethods?: Array<{ method: string }>; fallbackMethods?: Array<{ method: string }> } }).methodDecisionSupport;
      expect(sparseFisherDecision).toMatchObject({
        requestedRole: "primary",
        verdict: "preferred",
        primaryMethods: expect.arrayContaining([expect.objectContaining({ method: "fisher-exact" })]),
        fallbackMethods: expect.arrayContaining([expect.objectContaining({ method: "chi-square" })]),
      });
      expect(sparseFisher.estimates[0]).toMatchObject({
        odds_ratio_bootstrap_ci_low: expect.any(Number),
        odds_ratio_bootstrap_ci_high: expect.any(Number),
        risk_ratio_bootstrap_ci_low: expect.any(Number),
        risk_ratio_bootstrap_ci_high: expect.any(Number),
        risk_difference_bootstrap_ci_low: expect.any(Number),
        risk_difference_bootstrap_ci_high: expect.any(Number),
        bootstrap_ci_method: "multinomial cell-count bootstrap percentile",
      });
      expect(sparseFisher.artifacts.some(artifact => artifact.path.endsWith("categorical-effect-bootstrap.csv"))).toBe(true);
      const sparseFisherQa = JSON.parse(await readFile(path.join(dir, "sparse-fisher", "stats-qa.json"), "utf-8")) as { checks: Array<{ id: string; status: string }> };
      expect(sparseFisherQa.checks).toEqual(expect.arrayContaining([
        expect.objectContaining({ id: "categorical-effect-bootstrap-uncertainty", status: "pass" }),
        expect.objectContaining({ id: "method-contract-artifact-coverage", status: "pass" }),
      ]));

      expect(denseChi.status).toBe("succeeded");
      const denseChiDecision = (denseChi.diagnostics.preflight as { methodDecisionSupport?: { requestedRole?: string; verdict?: string; dataSignals?: Record<string, unknown>; primaryMethods?: Array<{ method: string }>; sensitivityMethods?: Array<{ method: string }> } }).methodDecisionSupport;
      expect(denseChiDecision).toMatchObject({
        requestedRole: "primary",
        verdict: "preferred",
        dataSignals: expect.objectContaining({
          categoricalTableShape: "2x2",
          categoricalTableMinObserved: 30,
          categoricalTableMinExpected: 30,
        }),
        primaryMethods: expect.arrayContaining([expect.objectContaining({ method: "chi-square" })]),
        sensitivityMethods: expect.arrayContaining([expect.objectContaining({ method: "fisher-exact" })]),
      });
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("records permutation sensitivity for sparse multi-level chi-square tables", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "agenteer-stats-chi-permutation-"));
    try {
      const dataPath = path.join(dir, "sparse-multilevel.csv");
      const rows = ["group,outcome"];
      [
        ["A", "x", 18],
        ["A", "y", 2],
        ["A", "z", 1],
        ["B", "x", 4],
        ["B", "y", 12],
        ["B", "z", 4],
        ["C", "x", 1],
        ["C", "y", 3],
        ["C", "z", 17],
      ].forEach(([group, outcome, count]) => {
        rows.push(...Array.from({ length: Number(count) }, () => `${group},${outcome}`));
      });
      const outDir = path.join(dir, "chi");
      await writeFile(dataPath, rows.join("\n"));

      const result = await researchStatsRunCommand({
        method: "chi-square",
        dataPath,
        outDir,
        outcome: "outcome",
        exposure: "group",
        variables: [],
        covariates: [],
        exactCovariates: [],
        estimand: "ATT",
        matchRatio: 1,
        replacement: false,
        trimThreshold: 0.01,
        stabilizeWeights: true,
        surveyDesign: false,
        allowSurveyApproximation: false,
        alpha: 0.05,
        bootstrapReplicates: 80,
        python,
      });

      expect(result.status).toBe("succeeded");
      expect(result.estimates[0]).toMatchObject({
        chi_square: expect.any(Number),
        permutation_p_value: expect.any(Number),
        permutation_method: "fixed-margin outcome-label permutation",
      });
      expect(result.diagnostics).toMatchObject({
        categorical_permutation_sensitivity: expect.objectContaining({
          status: "available",
          table_shape: "3x3",
          permutations_evaluated: 80,
          permutation_p_value: expect.any(Number),
        }),
        artifacts: expect.objectContaining({
          categorical_permutation_sensitivity: expect.stringContaining("categorical-permutation-sensitivity.csv"),
        }),
      });
      const permutation = await readFile(path.join(outDir, "categorical-permutation-sensitivity.csv"), "utf-8");
      expect(permutation).toContain("sparse_expected_cell_count");
      expect(permutation).toContain("permutation_p_value");
      const qa = JSON.parse(await readFile(path.join(outDir, "stats-qa.json"), "utf-8")) as { checks: Array<{ id: string; status: string }> };
      expect(qa.checks).toEqual(expect.arrayContaining([
        expect.objectContaining({ id: "categorical-permutation-sensitivity", status: "pass" }),
        expect.objectContaining({ id: "method-contract-artifact-coverage", status: "pass" }),
      ]));
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("orients semantic binary labels before computing independent 2x2 categorical effects", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "agenteer-stats-categorical-orientation-"));
    try {
      const dataPath = path.join(dir, "dead-survived.csv");
      const rows = ["group,outcome"];
      rows.push(...Array.from({ length: 90 }, () => "control,survived"));
      rows.push(...Array.from({ length: 10 }, () => "control,dead"));
      rows.push(...Array.from({ length: 80 }, () => "treated,survived"));
      rows.push(...Array.from({ length: 20 }, () => "treated,dead"));
      await writeFile(dataPath, `${rows.join("\n")}\n`);

      const outDir = path.join(dir, "chi-square");
      const result = await researchStatsRunCommand({
        method: "chi-square",
        dataPath,
        outDir,
        outcome: "outcome",
        exposure: "group",
        variables: [],
        covariates: [],
        exactCovariates: [],
        estimand: "ATT",
        matchRatio: 1,
        replacement: false,
        trimThreshold: 0.01,
        stabilizeWeights: true,
        surveyDesign: false,
        allowSurveyApproximation: false,
        alpha: 0.05,
        bootstrapReplicates: 80,
        python,
      });

      expect(result.status).toBe("succeeded");
      const estimate = result.estimates[0] as Record<string, unknown>;
      expect(estimate).toMatchObject({
        exposure_negative_level: "control",
        exposure_positive_level: "treated",
        outcome_negative_level: "survived",
        outcome_positive_level: "dead",
        unexposed_positive: 10,
        exposed_positive: 20,
      });
      expect(Number(estimate.risk_unexposed)).toBeCloseTo(0.1, 4);
      expect(Number(estimate.risk_exposed)).toBeCloseTo(0.2, 4);
      expect(Number(estimate.risk_difference)).toBeCloseTo(0.1, 4);
      expect(Number(estimate.risk_ratio)).toBeCloseTo(2, 4);
      expect(result.diagnostics).toMatchObject({
        categorical_binary_orientation: {
          exposure_ordering_evidence: "semantic binary labels",
          outcome_ordering_evidence: "semantic binary labels",
        },
      });

      const contingency = await readFile(path.join(outDir, "contingency-table.csv"), "utf-8");
      expect(contingency.indexOf("control,survived,90")).toBeLessThan(contingency.indexOf("control,dead,10"));
      expect(contingency.indexOf("control,dead,10")).toBeLessThan(contingency.indexOf("treated,survived,80"));
      expect(contingency.indexOf("treated,survived,80")).toBeLessThan(contingency.indexOf("treated,dead,20"));
      const qa = JSON.parse(await readFile(path.join(outDir, "stats-qa.json"), "utf-8")) as { checks: Array<{ id: string; status: string }> };
      expect(qa.checks).toEqual(expect.arrayContaining([
        expect.objectContaining({ id: "categorical-binary-orientation-evidence", status: "pass" }),
      ]));
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("warns when independent 2x2 categorical effects rely on lexical binary labels", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "agenteer-stats-categorical-lexical-orientation-"));
    try {
      const dataPath = path.join(dir, "ambiguous-labels.csv");
      const rows = ["arm,state"];
      rows.push(...Array.from({ length: 24 }, () => "alpha,east"));
      rows.push(...Array.from({ length: 16 }, () => "alpha,west"));
      rows.push(...Array.from({ length: 12 }, () => "beta,east"));
      rows.push(...Array.from({ length: 28 }, () => "beta,west"));
      await writeFile(dataPath, `${rows.join("\n")}\n`);

      const outDir = path.join(dir, "chi-square");
      const result = await researchStatsRunCommand({
        method: "chi-square",
        dataPath,
        outDir,
        outcome: "state",
        exposure: "arm",
        variables: [],
        covariates: [],
        exactCovariates: [],
        estimand: "ATT",
        matchRatio: 1,
        replacement: false,
        trimThreshold: 0.01,
        stabilizeWeights: true,
        surveyDesign: false,
        allowSurveyApproximation: false,
        alpha: 0.05,
        bootstrapReplicates: 80,
        python,
      });

      expect(result.status).toBe("succeeded");
      expect(result.diagnostics).toMatchObject({
        categorical_binary_orientation: {
          exposure_ordering_evidence: "lexical fallback",
          outcome_ordering_evidence: "lexical fallback",
        },
      });
      const qa = JSON.parse(await readFile(path.join(outDir, "stats-qa.json"), "utf-8")) as { checks: Array<{ id: string; status: string; detail: string }> };
      expect(qa.checks).toEqual(expect.arrayContaining([
        expect.objectContaining({
          id: "categorical-binary-orientation-evidence",
          status: "warning",
        }),
      ]));
      expect(qa.checks.find(check => check.id === "categorical-binary-orientation-evidence")?.detail).toContain("confirm exposed and event levels");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("uses numeric shape support to choose Pearson, Spearman, and Kendall correlation routes", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "agenteer-stats-correlation-decision-"));
    try {
      const skewedPath = path.join(dir, "skewed-correlation.csv");
      const ordinalPath = path.join(dir, "ordinal-correlation.csv");
      await writeFile(skewedPath, [
        "x,y",
        ...Array.from({ length: 72 }, (_, index) => {
          const x = index + 1;
          const y = Math.exp(index / 12);
          return `${x},${y.toFixed(6)}`;
        }),
      ].join("\n"));
      await writeFile(ordinalPath, [
        "x,y",
        ...Array.from({ length: 18 }, (_, index) => {
          const x = (index % 3) + 1;
          const y = ((index + Math.floor(index / 3)) % 3) + 1;
          return `${x},${y}`;
        }),
      ].join("\n"));
      const base = {
        outcome: "y",
        exposure: "x",
        variables: [],
        covariates: [],
        exactCovariates: [],
        estimand: "ATT" as const,
        matchRatio: 1,
        replacement: false,
        trimThreshold: 0.01,
        stabilizeWeights: true,
        surveyDesign: false,
        allowSurveyApproximation: false,
        alpha: 0.05,
        python,
      };
      const skewedPearson = await researchStatsRunCommand({
        ...base,
        method: "pearson",
        dataPath: skewedPath,
        outDir: path.join(dir, "skewed-pearson"),
      });
      const skewedSpearman = await researchStatsRunCommand({
        ...base,
        method: "spearman",
        dataPath: skewedPath,
        outDir: path.join(dir, "skewed-spearman"),
      });
      const ordinalKendall = await researchStatsRunCommand({
        ...base,
        method: "kendall",
        dataPath: ordinalPath,
        outDir: path.join(dir, "ordinal-kendall"),
      });

      expect(skewedPearson.status).toBe("succeeded");
      const pearsonDecision = (skewedPearson.diagnostics.preflight as { methodDecisionSupport?: { requestedRole?: string; verdict?: string; dataSignals?: Record<string, unknown>; primaryMethods?: Array<{ method: string }>; fallbackMethods?: Array<{ method: string }> } }).methodDecisionSupport;
      expect(pearsonDecision).toMatchObject({
        requestedRole: "fallback",
        verdict: "fallback_only",
        dataSignals: expect.objectContaining({
          correlationRankPreferred: true,
          correlationKendallPreferred: false,
        }),
        primaryMethods: expect.arrayContaining([expect.objectContaining({ method: "spearman" })]),
        fallbackMethods: expect.arrayContaining([expect.objectContaining({ method: "pearson" })]),
      });
      const pearsonQa = JSON.parse(await readFile(path.join(dir, "skewed-pearson", "stats-qa.json"), "utf-8")) as { checks: Array<{ id: string; status: string }> };
      expect(pearsonQa.checks).toEqual(expect.arrayContaining([
        expect.objectContaining({ id: "method-decision-alignment", status: "warning" }),
      ]));

      expect(skewedSpearman.status).toBe("succeeded");
      const spearmanDecision = (skewedSpearman.diagnostics.preflight as { methodDecisionSupport?: { requestedRole?: string; verdict?: string; primaryMethods?: Array<{ method: string }>; fallbackMethods?: Array<{ method: string }> } }).methodDecisionSupport;
      expect(spearmanDecision).toMatchObject({
        requestedRole: "primary",
        verdict: "preferred",
        primaryMethods: expect.arrayContaining([expect.objectContaining({ method: "spearman" })]),
        fallbackMethods: expect.arrayContaining([expect.objectContaining({ method: "pearson" })]),
      });
      expect(skewedSpearman.estimates[0]).toMatchObject({
        bootstrap_ci_low: expect.any(Number),
        bootstrap_ci_high: expect.any(Number),
      });
      expect(skewedSpearman.artifacts.some(artifact => artifact.path.endsWith("correlation-bootstrap.csv"))).toBe(true);

      expect(ordinalKendall.status).toBe("succeeded");
      const kendallDecision = (ordinalKendall.diagnostics.preflight as { methodDecisionSupport?: { requestedRole?: string; verdict?: string; dataSignals?: Record<string, unknown>; primaryMethods?: Array<{ method: string }>; sensitivityMethods?: Array<{ method: string }>; fallbackMethods?: Array<{ method: string }> } }).methodDecisionSupport;
      expect(kendallDecision).toMatchObject({
        requestedRole: "primary",
        verdict: "preferred",
        dataSignals: expect.objectContaining({
          correlationCompleteRows: 18,
          correlationOutcomeUniqueValues: 3,
          correlationExposureUniqueValues: 3,
          correlationKendallPreferred: true,
        }),
        primaryMethods: expect.arrayContaining([expect.objectContaining({ method: "kendall" })]),
        sensitivityMethods: expect.arrayContaining([expect.objectContaining({ method: "spearman" })]),
        fallbackMethods: expect.arrayContaining([expect.objectContaining({ method: "pearson" })]),
      });
      expect(ordinalKendall.estimates[0]).toMatchObject({
        bootstrap_ci_low: expect.any(Number),
        bootstrap_ci_high: expect.any(Number),
      });
      expect(ordinalKendall.artifacts.some(artifact => artifact.path.endsWith("correlation-bootstrap.csv"))).toBe(true);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("uses count distribution support to choose Poisson, negative binomial, and zero-inflated routes", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "agenteer-stats-count-decision-"));
    try {
      const overdispersedPath = path.join(dir, "overdispersed-count.csv");
      const zeroInflatedPath = path.join(dir, "zero-heavy-count.csv");
      const manyRepeatedLevelsPath = path.join(dir, "many-repeated-levels-count.csv");
      await writeFile(overdispersedPath, [
        "count,x",
        ...Array.from({ length: 120 }, (_, index) => {
          const x = index % 2;
          const base = [1, 2, 3, 12, 15][index % 5]!;
          return `${base + x},${x}`;
        }),
      ].join("\n"));
      await writeFile(zeroInflatedPath, [
        "count,x",
        ...Array.from({ length: 120 }, (_, index) => {
          const x = index % 2;
          const count = index < 72 ? 0 : (index % 3 === 0 ? 2 : 1);
          return `${count},${x}`;
        }),
      ].join("\n"));
      await writeFile(manyRepeatedLevelsPath, [
        "count,x",
        ...Array.from({ length: 9500 }, (_, index) => {
          const x = index % 2;
          const count = index < 3500 ? 0 : 1;
          return `${count},${x}`;
        }),
      ].join("\n"));
      const base = {
        outcome: "count",
        exposure: "x",
        variables: [],
        covariates: [],
        exactCovariates: [],
        estimand: "ATT" as const,
        matchRatio: 1,
        replacement: false,
        trimThreshold: 0.01,
        stabilizeWeights: true,
        surveyDesign: false,
        allowSurveyApproximation: false,
        alpha: 0.05,
        python,
      };
      const overdispersedPoisson = await researchStatsRunCommand({
        ...base,
        method: "poisson-regression",
        dataPath: overdispersedPath,
        outDir: path.join(dir, "overdispersed-poisson"),
      });
      const overdispersedNb = await researchStatsRunCommand({
        ...base,
        method: "negative-binomial-regression",
        dataPath: overdispersedPath,
        outDir: path.join(dir, "overdispersed-nb"),
      });
      const zeroHeavyPoisson = await researchStatsRunCommand({
        ...base,
        method: "poisson-regression",
        dataPath: zeroInflatedPath,
        outDir: path.join(dir, "zero-heavy-poisson"),
      });
      const repeatedLevelPoisson = await researchStatsRunCommand({
        ...base,
        method: "poisson-regression",
        dataPath: manyRepeatedLevelsPath,
        outDir: path.join(dir, "repeated-level-poisson"),
      });

      expect(overdispersedPoisson.status).toBe("succeeded");
      const poissonDecision = (overdispersedPoisson.diagnostics.preflight as { methodDecisionSupport?: { requestedRole?: string; verdict?: string; dataSignals?: Record<string, unknown>; primaryMethods?: Array<{ method: string }>; fallbackMethods?: Array<{ method: string }> } }).methodDecisionSupport;
      expect(poissonDecision).toMatchObject({
        requestedRole: "fallback",
        verdict: "fallback_only",
        dataSignals: expect.objectContaining({
          countOutcomeZeroFraction: 0,
        }),
        primaryMethods: expect.arrayContaining([expect.objectContaining({ method: "negative-binomial-regression" })]),
        fallbackMethods: expect.arrayContaining([expect.objectContaining({ method: "poisson-regression" })]),
      });
      expect(Number(poissonDecision?.dataSignals?.countOutcomeVarianceMeanRatio)).toBeGreaterThan(2);

      expect(overdispersedNb.status).toBe("succeeded");
      const nbDecision = (overdispersedNb.diagnostics.preflight as { methodDecisionSupport?: { requestedRole?: string; verdict?: string; primaryMethods?: Array<{ method: string }>; fallbackMethods?: Array<{ method: string }> } }).methodDecisionSupport;
      expect(nbDecision).toMatchObject({
        requestedRole: "primary",
        verdict: "preferred",
        primaryMethods: expect.arrayContaining([expect.objectContaining({ method: "negative-binomial-regression" })]),
        fallbackMethods: expect.arrayContaining([expect.objectContaining({ method: "poisson-regression" })]),
      });

      expect(zeroHeavyPoisson.status).toBe("succeeded");
      const zeroDecision = (zeroHeavyPoisson.diagnostics.preflight as { methodDecisionSupport?: { requestedRole?: string; verdict?: string; dataSignals?: Record<string, unknown>; primaryMethods?: Array<{ method: string }>; fallbackMethods?: Array<{ method: string }> } }).methodDecisionSupport;
      expect(zeroDecision).toMatchObject({
        requestedRole: "fallback",
        verdict: "fallback_only",
        dataSignals: expect.objectContaining({
          countOutcomeZeroFraction: 0.6,
        }),
        primaryMethods: expect.arrayContaining([expect.objectContaining({ method: "zero-inflated-poisson" })]),
        fallbackMethods: expect.arrayContaining([expect.objectContaining({ method: "poisson-regression" })]),
      });

      expect(repeatedLevelPoisson.status).toBe("succeeded");
      const repeatedDecision = (repeatedLevelPoisson.diagnostics.preflight as { checks?: Array<{ id: string; status: string }>; methodDecisionSupport?: { requestedRole?: string; verdict?: string; dataSignals?: Record<string, unknown>; primaryMethods?: Array<{ method: string }>; fallbackMethods?: Array<{ method: string }> } }).methodDecisionSupport;
      expect(repeatedDecision).toMatchObject({
        requestedRole: "primary",
        verdict: "preferred",
        dataSignals: expect.objectContaining({
          countOutcomeN: 9500,
        }),
        primaryMethods: expect.arrayContaining([expect.objectContaining({ method: "poisson-regression" })]),
      });
      expect(Number(repeatedDecision?.dataSignals?.countOutcomeZeroFraction)).toBeCloseTo(3500 / 9500, 5);
      expect(repeatedDecision?.fallbackMethods ?? []).not.toEqual(expect.arrayContaining([expect.objectContaining({ method: "poisson-regression" })]));
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("blocks count regression on ordered score-like outcomes", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "agenteer-stats-count-ordinal-score-"));
    try {
      const scorePath = path.join(dir, "severity-score.csv");
      await writeFile(scorePath, [
        "severity_score,x",
        ...Array.from({ length: 120 }, (_, index) => {
          const x = index % 2;
          const severity = Math.min(3, Math.floor(index / 30));
          return `${severity},${x}`;
        }),
      ].join("\n"));

      const result = await researchStatsRunCommand({
        method: "poisson-regression",
        dataPath: scorePath,
        outDir: path.join(dir, "poisson-severity"),
        outcome: "severity_score",
        exposure: "x",
        variables: [],
        covariates: [],
        exactCovariates: [],
        estimand: "ATT",
        matchRatio: 1,
        replacement: false,
        trimThreshold: 0.01,
        stabilizeWeights: true,
        surveyDesign: false,
        allowSurveyApproximation: false,
        alpha: 0.05,
        python,
      });

      expect(result.status).toBe("failed");
      expect(result.issues.map(issue => issue.code)).toContain("STATS_COUNT_OUTCOME_ORDINAL_SCORE_INVALID");
      const decision = (result.diagnostics.preflight as { methodDecisionSupport?: { requestedRole?: string; verdict?: string; dataSignals?: Record<string, unknown>; primaryMethods?: Array<{ method: string }>; notRecommendedMethods?: Array<{ method: string }> } }).methodDecisionSupport;
      expect(decision).toMatchObject({
        requestedRole: "not_recommended",
        verdict: "blocked",
        dataSignals: expect.objectContaining({
          countOutcomeOrderedCategorySupport: true,
          countOutcomeOrderingEvidence: "numeric ordered category codes",
          countOutcomeOrdinalScoreName: true,
          countOutcomeCountEndpointName: false,
          countOutcomeOrdinalScoreConflict: true,
          multiCategoryOutcomeRecommendedMethod: "ordinal-logistic-regression",
        }),
        primaryMethods: expect.arrayContaining([expect.objectContaining({ method: "ordinal-logistic-regression" })]),
        notRecommendedMethods: expect.arrayContaining([expect.objectContaining({ method: "poisson-regression" })]),
      });
      const preflight = JSON.parse(await readFile(path.join(dir, "poisson-severity", "stats-preflight.json"), "utf-8")) as { statsPreflight: { checks: Array<{ id: string; status: string }> } };
      expect(preflight.statsPreflight.checks).toEqual(expect.arrayContaining([
        expect.objectContaining({ id: "count-outcome-ordinal-score", status: "block" }),
      ]));
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("uses exact McNemar inference for small discordant paired categorical support", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "agenteer-stats-mcnemar-exact-"));
    try {
      const smallDiscordancePath = path.join(dir, "small-discordance.csv");
      const largeDiscordancePath = path.join(dir, "large-discordance.csv");
      await writeFile(smallDiscordancePath, [
        "before,after",
        ...Array.from({ length: 20 }, () => "0,0"),
        ...Array.from({ length: 20 }, () => "1,1"),
        ...Array.from({ length: 4 }, () => "0,1"),
        ...Array.from({ length: 2 }, () => "1,0"),
      ].join("\n"));
      await writeFile(largeDiscordancePath, [
        "before,after",
        ...Array.from({ length: 30 }, () => "0,0"),
        ...Array.from({ length: 30 }, () => "1,1"),
        ...Array.from({ length: 18 }, () => "0,1"),
        ...Array.from({ length: 14 }, () => "1,0"),
      ].join("\n"));
      const base = {
        method: "mcnemar" as const,
        outcome: "after",
        exposure: "before",
        variables: [],
        covariates: [],
        exactCovariates: [],
        estimand: "ATT" as const,
        matchRatio: 1,
        replacement: false,
        trimThreshold: 0.01,
        stabilizeWeights: true,
        surveyDesign: false,
        allowSurveyApproximation: false,
        alpha: 0.05,
        python,
      };

      const small = await researchStatsRunCommand({
        ...base,
        dataPath: smallDiscordancePath,
        outDir: path.join(dir, "small"),
      });
      expect(small.status).toBe("succeeded");
      expect(small.diagnostics).toMatchObject({
        discordant_pairs: 6,
        exact_test_used: true,
        exact_test_threshold: 25,
        continuity_correction_used: false,
        mcnemar_method: "exact binomial",
        mcnemar_paired_effect: expect.objectContaining({
          paired_risk_difference: expect.any(Number),
          paired_risk_difference_ci_low: expect.any(Number),
          paired_risk_difference_ci_high: expect.any(Number),
          discordant_shift_fraction: expect.any(Number),
        }),
        artifacts: expect.objectContaining({
          mcnemar_paired_effect: expect.stringContaining("mcnemar-paired-effect.csv"),
        }),
      });
      expect(small.estimates[0]).toMatchObject({
        paired_risk_difference: expect.any(Number),
        paired_risk_difference_ci_low: expect.any(Number),
        paired_risk_difference_ci_high: expect.any(Number),
        baseline_positive_fraction: expect.any(Number),
        followup_positive_fraction: expect.any(Number),
      });
      expect(Number(small.estimates[0]?.paired_risk_difference)).toBeCloseTo((4 - 2) / 46, 6);
      expect(small.artifacts.some(artifact => artifact.path.endsWith("mcnemar-paired-effect.csv"))).toBe(true);
      const smallEffect = await readFile(path.join(dir, "small", "mcnemar-paired-effect.csv"), "utf-8");
      expect(smallEffect).toContain("paired_risk_difference");
      expect(smallEffect).toContain("matched-pair Wald interval");
      const smallQa = JSON.parse(await readFile(path.join(dir, "small", "stats-qa.json"), "utf-8")) as { checks: Array<{ id: string; status: string }> };
      expect(smallQa.checks).toEqual(expect.arrayContaining([
        expect.objectContaining({ id: "mcnemar-exact-discordance-policy", status: "pass" }),
        expect.objectContaining({ id: "mcnemar-paired-effect-artifact", status: "pass" }),
        expect.objectContaining({ id: "method-contract-artifact-coverage", status: "pass" }),
      ]));

      const large = await researchStatsRunCommand({
        ...base,
        dataPath: largeDiscordancePath,
        outDir: path.join(dir, "large"),
      });
      expect(large.status).toBe("succeeded");
      expect(large.diagnostics).toMatchObject({
        discordant_pairs: 32,
        exact_test_used: false,
        exact_test_threshold: 25,
        continuity_correction_used: true,
        mcnemar_method: "asymptotic chi-square with continuity correction",
        artifacts: expect.objectContaining({
          mcnemar_paired_effect: expect.stringContaining("mcnemar-paired-effect.csv"),
        }),
      });
      expect(Number(large.estimates[0]?.paired_risk_difference)).toBeCloseTo((18 - 14) / 92, 6);
      const largeQa = JSON.parse(await readFile(path.join(dir, "large", "stats-qa.json"), "utf-8")) as { checks: Array<{ id: string; status: string }> };
      expect(largeQa.checks).toEqual(expect.arrayContaining([
        expect.objectContaining({ id: "mcnemar-exact-discordance-policy", status: "pass" }),
        expect.objectContaining({ id: "mcnemar-paired-effect-artifact", status: "pass" }),
      ]));
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("orients semantic binary outcome labels before scoring Cochran-Armitage trend", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "agenteer-stats-trend-outcome-orientation-"));
    try {
      const dataPath = path.join(dir, "dead-survived-trend.csv");
      const rows = ["dose,outcome"];
      [
        [0, 2, 28],
        [1, 8, 22],
        [2, 14, 16],
        [3, 22, 8],
      ].forEach(([dose, deaths, survivors]) => {
        rows.push(...Array.from({ length: Number(deaths) }, () => `${dose},dead`));
        rows.push(...Array.from({ length: Number(survivors) }, () => `${dose},survived`));
      });
      await writeFile(dataPath, `${rows.join("\n")}\n`);

      const outDir = path.join(dir, "trend");
      const result = await researchStatsRunCommand({
        method: "cochran-armitage-trend",
        dataPath,
        outDir,
        outcome: "outcome",
        exposure: "dose",
        variables: [],
        covariates: [],
        exactCovariates: [],
        estimand: "ATT",
        matchRatio: 1,
        replacement: false,
        trimThreshold: 0.01,
        stabilizeWeights: true,
        surveyDesign: false,
        allowSurveyApproximation: false,
        alpha: 0.05,
        bootstrapReplicates: 80,
        python,
      });

      expect(result.status).toBe("succeeded");
      const estimate = result.estimates[0] as Record<string, unknown>;
      expect(estimate.outcome_positive_level).toBe("dead");
      expect(Number(estimate.risk_slope_per_score)).toBeGreaterThan(0);
      expect(Number(estimate.risk_difference_low_to_high)).toBeGreaterThan(0.5);
      expect(result.diagnostics).toMatchObject({
        ordering_evidence: "numeric ordered category codes",
        categorical_binary_orientation: expect.objectContaining({
          exposure_ordering_evidence: "numeric ordered category codes",
          outcome_ordering_evidence: "semantic binary labels",
        }),
        trend_support: expect.objectContaining({
          outcome_positive_level: "dead",
          outcome_negative_level: "survived",
          outcome_ordering_evidence: "semantic binary labels",
        }),
      });

      const support = await readFile(path.join(outDir, "trend-support.csv"), "utf-8");
      expect(support).toContain("dead");
      expect(support).toContain("survived");
      expect(support).toContain("trend_component");
      const qa = JSON.parse(await readFile(path.join(outDir, "stats-qa.json"), "utf-8")) as { checks: Array<{ id: string; status: string }> };
      expect(qa.checks).toEqual(expect.arrayContaining([
        expect.objectContaining({ id: "trend-binary-outcome-orientation", status: "pass" }),
      ]));
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("records ordered support and bootstrap uncertainty for Cochran-Armitage trend", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "agenteer-stats-trend-support-"));
    try {
      const dataPath = path.join(dir, "ordered-trend.csv");
      const rows = ["dose,event"];
      [
        [0, 2, 28],
        [1, 8, 22],
        [2, 14, 16],
        [3, 22, 8],
      ].forEach(([dose, events, nonEvents]) => {
        rows.push(...Array.from({ length: events }, () => `${dose},1`));
        rows.push(...Array.from({ length: nonEvents }, () => `${dose},0`));
      });
      await writeFile(dataPath, rows.join("\n"));

      const outDir = path.join(dir, "trend");
      const result = await researchStatsRunCommand({
        method: "cochran-armitage-trend",
        dataPath,
        outDir,
        outcome: "event",
        exposure: "dose",
        variables: [],
        covariates: [],
        exactCovariates: [],
        estimand: "ATT",
        matchRatio: 1,
        replacement: false,
        trimThreshold: 0.01,
        stabilizeWeights: true,
        surveyDesign: false,
        allowSurveyApproximation: false,
        alpha: 0.05,
        bootstrapReplicates: 80,
        python,
      });

      expect(result.status).toBe("succeeded");
      const estimate = result.estimates[0] as Record<string, unknown>;
      expect(Number(estimate.risk_slope_per_score)).toBeGreaterThan(0);
      expect(Number(estimate.risk_difference_low_to_high)).toBeGreaterThan(0.5);
      expect(estimate.risk_slope_ci_low).not.toBeNull();
      expect(estimate.risk_difference_low_to_high_ci_high).not.toBeNull();
      expect(result.diagnostics).toMatchObject({
        risk_monotonic_direction: "increasing",
        artifacts: expect.objectContaining({
          trend_support: expect.stringContaining("trend-support.csv"),
          trend_effect_bootstrap: expect.stringContaining("trend-effect-bootstrap.csv"),
        }),
      });
      expect(result.diagnostics.preflight).toMatchObject({
        methodDecisionSupport: expect.objectContaining({
          dataSignals: expect.objectContaining({
            trendExposureOrderedSupport: true,
            trendExposureOrderingEvidence: "numeric ordered category codes",
          }),
        }),
        checks: expect.arrayContaining([
          expect.objectContaining({ id: "trend-test-ordering-evidence", status: "pass" }),
        ]),
      });
      const support = await readFile(path.join(outDir, "trend-support.csv"), "utf-8");
      expect(support).toContain("expected_successes_under_null");
      expect(support).toContain("trend_component");
      const bootstrap = await readFile(path.join(outDir, "trend-effect-bootstrap.csv"), "utf-8");
      expect(bootstrap).toContain("risk_slope_per_score");
      expect(bootstrap).toContain("risk_difference_low_to_high");
      const qa = JSON.parse(await readFile(path.join(outDir, "stats-qa.json"), "utf-8")) as { checks: Array<{ id: string; status: string }> };
      expect(qa.checks).toEqual(expect.arrayContaining([
        expect.objectContaining({ id: "trend-support-artifact", status: "pass" }),
        expect.objectContaining({ id: "trend-ordering-evidence", status: "pass" }),
        expect.objectContaining({ id: "trend-risk-gradient", status: "pass" }),
        expect.objectContaining({ id: "trend-effect-bootstrap", status: "pass" }),
        expect.objectContaining({ id: "method-contract-artifact-coverage", status: "pass" }),
      ]));
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("blocks Cochran-Armitage trend for unordered nominal exposure levels", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "agenteer-stats-trend-unordered-"));
    try {
      const dataPath = path.join(dir, "unordered-trend.csv");
      const rows = ["group,event"];
      [
        ["red", 2, 18],
        ["blue", 10, 10],
        ["green", 16, 4],
      ].forEach(([group, events, nonEvents]) => {
        rows.push(...Array.from({ length: Number(events) }, () => `${group},1`));
        rows.push(...Array.from({ length: Number(nonEvents) }, () => `${group},0`));
      });
      const outDir = path.join(dir, "trend");
      await writeFile(dataPath, rows.join("\n"));

      const result = await researchStatsRunCommand({
        method: "cochran-armitage-trend",
        dataPath,
        outDir,
        outcome: "event",
        exposure: "group",
        variables: [],
        covariates: [],
        exactCovariates: [],
        estimand: "ATT",
        matchRatio: 1,
        replacement: false,
        trimThreshold: 0.01,
        stabilizeWeights: true,
        surveyDesign: false,
        allowSurveyApproximation: false,
        alpha: 0.05,
        python,
      });

      expect(result.status).toBe("failed");
      expect(result.issues.map(issue => issue.code)).toContain("STATS_TREND_TEST_ORDERING_EVIDENCE_MISSING");
      expect(result.diagnostics.preflight).toMatchObject({
        methodDecisionSupport: expect.objectContaining({
          dataSignals: expect.objectContaining({
            trendExposureOrderedSupport: false,
            trendExposureOrderingEvidence: null,
          }),
        }),
        checks: expect.arrayContaining([
          expect.objectContaining({ id: "trend-test-ordering-evidence", status: "block" }),
        ]),
      });
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("scores Cochran-Armitage ordinal labels in semantic order rather than alphabetical order", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "agenteer-stats-trend-label-order-"));
    try {
      const dataPath = path.join(dir, "label-trend.csv");
      const rows = ["severity,event"];
      [
        ["low", 2, 18],
        ["medium", 10, 10],
        ["high", 16, 4],
      ].forEach(([severity, events, nonEvents]) => {
        rows.push(...Array.from({ length: Number(events) }, () => `${severity},1`));
        rows.push(...Array.from({ length: Number(nonEvents) }, () => `${severity},0`));
      });
      const outDir = path.join(dir, "trend");
      await writeFile(dataPath, rows.join("\n"));

      const result = await researchStatsRunCommand({
        method: "cochran-armitage-trend",
        dataPath,
        outDir,
        outcome: "event",
        exposure: "severity",
        variables: [],
        covariates: [],
        exactCovariates: [],
        estimand: "ATT",
        matchRatio: 1,
        replacement: false,
        trimThreshold: 0.01,
        stabilizeWeights: true,
        surveyDesign: false,
        allowSurveyApproximation: false,
        alpha: 0.05,
        bootstrapReplicates: 80,
        python,
      });

      expect(result.status).toBe("succeeded");
      expect(result.diagnostics).toMatchObject({
        ordered_groups: ["low", "medium", "high"],
        ordering_evidence: "low/medium/high labels",
        risk_monotonic_direction: "increasing",
      });
      const estimate = result.estimates[0] as Record<string, unknown>;
      expect(Number(estimate.risk_slope_per_score)).toBeGreaterThan(0);
      expect(Number(estimate.risk_difference_low_to_high)).toBeCloseTo(0.7, 3);
      const support = await readFile(path.join(outDir, "trend-support.csv"), "utf-8");
      expect(support.indexOf("low")).toBeLessThan(support.indexOf("medium"));
      expect(support.indexOf("medium")).toBeLessThan(support.indexOf("high"));
      const qa = JSON.parse(await readFile(path.join(outDir, "stats-qa.json"), "utf-8")) as { checks: Array<{ id: string; status: string }> };
      expect(qa.checks).toEqual(expect.arrayContaining([
        expect.objectContaining({ id: "trend-ordering-evidence", status: "pass" }),
        expect.objectContaining({ id: "trend-risk-gradient", status: "pass" }),
      ]));
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("uses positive-outcome distribution support to choose Gamma versus linear routes", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "agenteer-stats-positive-decision-"));
    try {
      const skewedPath = path.join(dir, "skewed-positive.csv");
      const symmetricPath = path.join(dir, "symmetric-positive.csv");
      await writeFile(skewedPath, [
        "y,x",
        ...Array.from({ length: 96 }, (_, index) => {
          const x = index % 2;
          const y = Math.exp(index / 48) + x * 0.5;
          return `${y.toFixed(6)},${x}`;
        }),
      ].join("\n"));
      await writeFile(symmetricPath, [
        "y,x",
        ...Array.from({ length: 96 }, (_, index) => {
          const x = index % 2;
          const y = 10 + x * 0.25 + ((index % 8) - 3.5) * 0.05;
          return `${y.toFixed(6)},${x}`;
        }),
      ].join("\n"));
      const base = {
        outcome: "y",
        exposure: "x",
        variables: [],
        covariates: [],
        exactCovariates: [],
        estimand: "ATT" as const,
        matchRatio: 1,
        replacement: false,
        trimThreshold: 0.01,
        stabilizeWeights: true,
        surveyDesign: false,
        allowSurveyApproximation: false,
        alpha: 0.05,
        python,
      };
      const skewedLinear = await researchStatsRunCommand({
        ...base,
        method: "linear-regression",
        dataPath: skewedPath,
        outDir: path.join(dir, "skewed-linear"),
      });
      const skewedGamma = await researchStatsRunCommand({
        ...base,
        method: "gamma-glm",
        dataPath: skewedPath,
        outDir: path.join(dir, "skewed-gamma"),
      });
      const symmetricGamma = await researchStatsRunCommand({
        ...base,
        method: "gamma-glm",
        dataPath: symmetricPath,
        outDir: path.join(dir, "symmetric-gamma"),
      });

      expect(skewedLinear.status).toBe("succeeded");
      const skewedLinearDecision = (skewedLinear.diagnostics.preflight as { methodDecisionSupport?: { requestedRole?: string; verdict?: string; dataSignals?: Record<string, unknown>; primaryMethods?: Array<{ method: string }>; fallbackMethods?: Array<{ method: string }> } }).methodDecisionSupport;
      expect(skewedLinearDecision).toMatchObject({
        requestedRole: "fallback",
        verdict: "fallback_only",
        primaryMethods: expect.arrayContaining([expect.objectContaining({ method: "gamma-glm" })]),
        fallbackMethods: expect.arrayContaining([expect.objectContaining({ method: "linear-regression" })]),
      });
      expect(Number(skewedLinearDecision?.dataSignals?.positiveOutcomeSkewness)).toBeGreaterThan(0.5);

      expect(skewedGamma.status).toBe("succeeded");
      const skewedGammaDecision = (skewedGamma.diagnostics.preflight as { methodDecisionSupport?: { requestedRole?: string; verdict?: string; primaryMethods?: Array<{ method: string }>; fallbackMethods?: Array<{ method: string }> } }).methodDecisionSupport;
      expect(skewedGammaDecision).toMatchObject({
        requestedRole: "primary",
        verdict: "preferred",
        primaryMethods: expect.arrayContaining([expect.objectContaining({ method: "gamma-glm" })]),
        fallbackMethods: expect.arrayContaining([expect.objectContaining({ method: "linear-regression" })]),
      });

      expect(symmetricGamma.status).toBe("succeeded");
      const symmetricGammaDecision = (symmetricGamma.diagnostics.preflight as { methodDecisionSupport?: { requestedRole?: string; verdict?: string; primaryMethods?: Array<{ method: string }>; fallbackMethods?: Array<{ method: string }> } }).methodDecisionSupport;
      expect(symmetricGammaDecision).toMatchObject({
        requestedRole: "fallback",
        verdict: "fallback_only",
        primaryMethods: expect.arrayContaining([expect.objectContaining({ method: "linear-regression" })]),
        fallbackMethods: expect.arrayContaining([expect.objectContaining({ method: "gamma-glm" })]),
      });
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("uses continuous-regression shape support to choose robust regression when ordinary OLS is fragile", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "agenteer-stats-continuous-regression-decision-"));
    try {
      const dataPath = path.join(dir, "outlier-continuous-regression.csv");
      await writeFile(dataPath, [
        "y,x",
        ...Array.from({ length: 96 }, (_, index) => {
          const x = (index % 24) - 12;
          const baseline = -2 + x * 0.35 + ((index % 5) - 2) * 0.08;
          const y = index % 16 === 0 ? baseline + 45 : baseline;
          return `${y.toFixed(6)},${x}`;
        }),
      ].join("\n"));
      const base = {
        dataPath,
        outcome: "y",
        exposure: "x",
        variables: [],
        covariates: [],
        exactCovariates: [],
        estimand: "ATT" as const,
        matchRatio: 1,
        replacement: false,
        trimThreshold: 0.01,
        stabilizeWeights: true,
        surveyDesign: false,
        allowSurveyApproximation: false,
        alpha: 0.05,
        python,
      };
      const ordinaryLinear = await researchStatsRunCommand({
        ...base,
        method: "linear-regression",
        outDir: path.join(dir, "linear"),
      });
      const robustLinear = await researchStatsRunCommand({
        ...base,
        method: "robust-linear-regression",
        outDir: path.join(dir, "robust"),
      });

      expect(ordinaryLinear.status).toBe("succeeded");
      const linearPreflight = ordinaryLinear.diagnostics.preflight as { methodDecisionSupport?: { requestedRole?: string; verdict?: string; dataSignals?: Record<string, unknown>; primaryMethods?: Array<{ method: string }>; sensitivityMethods?: Array<{ method: string }> }; checks?: Array<{ id: string; status: string }> };
      expect(linearPreflight.methodDecisionSupport).toMatchObject({
        requestedRole: "sensitivity",
        verdict: "acceptable_sensitivity",
        dataSignals: expect.objectContaining({
          continuousRegressionRobustPreferred: true,
          continuousRegressionQuantilePreferred: false,
        }),
        primaryMethods: expect.arrayContaining([expect.objectContaining({ method: "robust-linear-regression" })]),
        sensitivityMethods: expect.arrayContaining([
          expect.objectContaining({ method: "linear-regression" }),
          expect.objectContaining({ method: "quantile-regression" }),
        ]),
      });
      expect(Number(linearPreflight.methodDecisionSupport?.dataSignals?.continuousRegressionOutcomeOutlierFraction)).toBeGreaterThan(0.03);
      expect(linearPreflight.checks).toEqual(expect.arrayContaining([
        expect.objectContaining({ id: "linear-regression-shape-review", status: "warning" }),
      ]));

      expect(robustLinear.status).toBe("succeeded");
      const robustDecision = (robustLinear.diagnostics.preflight as { methodDecisionSupport?: { requestedRole?: string; verdict?: string; primaryMethods?: Array<{ method: string }>; sensitivityMethods?: Array<{ method: string }> } }).methodDecisionSupport;
      expect(robustDecision).toMatchObject({
        requestedRole: "primary",
        verdict: "preferred",
        primaryMethods: expect.arrayContaining([expect.objectContaining({ method: "robust-linear-regression" })]),
        sensitivityMethods: expect.arrayContaining([expect.objectContaining({ method: "linear-regression" })]),
      });
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("uses multicategory outcome support to choose ordinal versus multinomial logistic routes", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "agenteer-stats-multicategory-decision-"));
    try {
      const orderedPath = path.join(dir, "ordered-severity.csv");
      const nominalPath = path.join(dir, "nominal-disposition.csv");
      const pseudoNoise = (index: number) => {
        const raw = Math.sin(index * 31.77) * 9471.31;
        return raw - Math.floor(raw) - 0.5;
      };
      await writeFile(orderedPath, [
        "severity,x",
        ...Array.from({ length: 180 }, (_, index) => {
          const x = -2 + (4 * index) / 179;
          const latent = x + pseudoNoise(index) * 1.3;
          const severity = latent < -0.65 ? "mild" : latent < 0.65 ? "moderate" : "severe";
          return `${severity},${x.toFixed(6)}`;
        }),
      ].join("\n"));
      await writeFile(nominalPath, [
        "disposition,x",
        ...Array.from({ length: 180 }, (_, index) => {
          const x = -2 + (4 * index) / 179;
          const disposition = index % 3 === 0 ? "home" : index % 3 === 1 ? "rehab" : "snf";
          return `${disposition},${x.toFixed(6)}`;
        }),
      ].join("\n"));
      const base = {
        exposure: "x",
        variables: [],
        covariates: [],
        exactCovariates: [],
        estimand: "ATT" as const,
        matchRatio: 1,
        replacement: false,
        trimThreshold: 0.01,
        stabilizeWeights: true,
        surveyDesign: false,
        allowSurveyApproximation: false,
        alpha: 0.05,
        python,
      };

      const orderedMultinomial = await researchStatsRunCommand({
        ...base,
        method: "multinomial-logistic-regression",
        dataPath: orderedPath,
        outDir: path.join(dir, "ordered-multinomial"),
        outcome: "severity",
      });
      expect(orderedMultinomial.status).toBe("succeeded");
      const orderedDecision = (orderedMultinomial.diagnostics.preflight as { methodDecisionSupport?: { requestedRole?: string; verdict?: string; dataSignals?: Record<string, unknown>; primaryMethods?: Array<{ method: string }>; sensitivityMethods?: Array<{ method: string }> }; checks?: Array<{ id: string; status: string }> }).methodDecisionSupport;
      expect(orderedDecision).toMatchObject({
        requestedRole: "sensitivity",
        verdict: "acceptable_sensitivity",
        dataSignals: expect.objectContaining({
          multiCategoryOutcomeLevelCount: 3,
          multiCategoryOutcomeOrderedSupport: true,
          multiCategoryOutcomeRecommendedMethod: "ordinal-logistic-regression",
        }),
        primaryMethods: expect.arrayContaining([expect.objectContaining({ method: "ordinal-logistic-regression" })]),
        sensitivityMethods: expect.arrayContaining([expect.objectContaining({ method: "multinomial-logistic-regression" })]),
      });
      const orderedPreflight = orderedMultinomial.diagnostics.preflight as { checks?: Array<{ id: string; status: string }> };
      expect(orderedPreflight.checks).toEqual(expect.arrayContaining([
        expect.objectContaining({ id: "multinomial-ordered-outcome-review", status: "warning" }),
      ]));

      const nominalMultinomial = await researchStatsRunCommand({
        ...base,
        method: "multinomial-logistic-regression",
        dataPath: nominalPath,
        outDir: path.join(dir, "nominal-multinomial"),
        outcome: "disposition",
      });
      expect(nominalMultinomial.status).toBe("succeeded");
      const nominalDecision = (nominalMultinomial.diagnostics.preflight as { methodDecisionSupport?: { requestedRole?: string; verdict?: string; dataSignals?: Record<string, unknown>; primaryMethods?: Array<{ method: string }>; fallbackMethods?: Array<{ method: string }> } }).methodDecisionSupport;
      expect(nominalDecision).toMatchObject({
        requestedRole: "primary",
        verdict: "preferred",
        dataSignals: expect.objectContaining({
          multiCategoryOutcomeLevelCount: 3,
          multiCategoryOutcomeOrderedSupport: false,
          multiCategoryOutcomeRecommendedMethod: "multinomial-logistic-regression",
        }),
        primaryMethods: expect.arrayContaining([expect.objectContaining({ method: "multinomial-logistic-regression" })]),
        fallbackMethods: expect.arrayContaining([expect.objectContaining({ method: "ordinal-logistic-regression" })]),
      });
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("uses binary score support to choose prediction evaluation versus logistic modeling", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "agenteer-stats-binary-score-decision-"));
    try {
      const scorePath = path.join(dir, "probability-score.csv");
      const repeatedScorePath = path.join(dir, "repeated-probability-score.csv");
      const predictorPath = path.join(dir, "ordinary-predictor.csv");
      await writeFile(scorePath, [
        "outcome,risk_score",
        ...Array.from({ length: 120 }, (_, index) => {
          const riskScore = Math.min(0.98, Math.max(0.02, 0.08 + (index % 40) / 45));
          const outcome = riskScore > 0.56 || index % 17 === 0 ? 1 : 0;
          return `${outcome},${riskScore.toFixed(6)}`;
        }),
      ].join("\n"));
      await writeFile(repeatedScorePath, [
        "outcome,risk_score",
        ...Array.from({ length: 7500 }, (_, index) => {
          const level = index < 5500 ? 0.05 : 0.15 + Math.floor((index - 5500) / 400) * 0.16;
          const outcome = level >= 0.63 ? (index % 5 === 0 ? 0 : 1) : (index % 7 === 0 ? 1 : 0);
          return `${outcome},${level.toFixed(2)}`;
        }),
      ].join("\n"));
      await writeFile(predictorPath, [
        "outcome,age",
        ...Array.from({ length: 120 }, (_, index) => {
          const age = 35 + (index % 50);
          const outcome = age > 66 || index % 19 === 0 ? 1 : 0;
          return `${outcome},${age}`;
        }),
      ].join("\n"));
      const base = {
        outcome: "outcome",
        variables: [],
        covariates: [],
        exactCovariates: [],
        estimand: "ATT" as const,
        matchRatio: 1,
        replacement: false,
        trimThreshold: 0.01,
        stabilizeWeights: true,
        surveyDesign: false,
        allowSurveyApproximation: false,
        alpha: 0.05,
        python,
      };

      const logisticScore = await researchStatsRunCommand({
        ...base,
        method: "logistic-regression",
        dataPath: scorePath,
        outDir: path.join(dir, "logistic-score"),
        exposure: "risk_score",
      });
      expect(logisticScore.status).toBe("succeeded");
      const scorePreflight = logisticScore.diagnostics.preflight as { methodDecisionSupport?: { requestedRole?: string; verdict?: string; dataSignals?: Record<string, unknown>; primaryMethods?: Array<{ method: string }>; sensitivityMethods?: Array<{ method: string }> }; checks?: Array<{ id: string; status: string }> };
      expect(scorePreflight.methodDecisionSupport).toMatchObject({
        requestedRole: "sensitivity",
        verdict: "acceptable_sensitivity",
        dataSignals: expect.objectContaining({
          binaryPredictionScoreProbabilityLike: true,
          binaryPredictionScoreNameLike: true,
          binaryPredictionScoreLike: true,
          predictionScoreProbabilityLike: true,
          predictionScoreNameLike: true,
          predictionScoreSupported: true,
          predictionScoreLike: true,
          predictionValidationMode: "apparent",
        }),
        primaryMethods: expect.arrayContaining([expect.objectContaining({ method: "prediction-evaluation" })]),
        sensitivityMethods: expect.arrayContaining([expect.objectContaining({ method: "logistic-regression" })]),
      });
      expect(scorePreflight.checks).toEqual(expect.arrayContaining([
        expect.objectContaining({ id: "binary-score-evaluation-route-review", status: "warning" }),
      ]));

      const repeatedScore = await researchStatsRunCommand({
        ...base,
        method: "logistic-regression",
        dataPath: repeatedScorePath,
        outDir: path.join(dir, "repeated-logistic-score"),
        exposure: "risk_score",
      });
      expect(repeatedScore.status).toBe("succeeded");
      const repeatedDecision = (repeatedScore.diagnostics.preflight as { methodDecisionSupport?: { requestedRole?: string; verdict?: string; dataSignals?: Record<string, unknown>; primaryMethods?: Array<{ method: string }>; sensitivityMethods?: Array<{ method: string }> } }).methodDecisionSupport;
      expect(repeatedDecision).toMatchObject({
        requestedRole: "sensitivity",
        verdict: "acceptable_sensitivity",
        dataSignals: expect.objectContaining({
          completeRows: 7500,
          binaryPredictionScoreN: 7500,
          binaryPredictionScoreUniqueValues: 6,
          binaryPredictionScoreProbabilityLike: true,
          binaryPredictionScoreNameLike: true,
          binaryPredictionScoreLike: true,
        }),
        primaryMethods: expect.arrayContaining([expect.objectContaining({ method: "prediction-evaluation" })]),
        sensitivityMethods: expect.arrayContaining([expect.objectContaining({ method: "logistic-regression" })]),
      });

      const predictionEvaluation = await researchStatsRunCommand({
        ...base,
        method: "prediction-evaluation",
        dataPath: scorePath,
        outDir: path.join(dir, "prediction-evaluation"),
        exposure: "risk_score",
      });
      expect(predictionEvaluation.status).toBe("succeeded");
      const predictionDecision = (predictionEvaluation.diagnostics.preflight as { methodDecisionSupport?: { requestedRole?: string; verdict?: string; dataSignals?: Record<string, unknown>; primaryMethods?: Array<{ method: string }> } }).methodDecisionSupport;
      expect(predictionDecision).toMatchObject({
        requestedRole: "primary",
        verdict: "preferred",
        dataSignals: expect.objectContaining({
          predictionScoreProbabilityLike: true,
          predictionScoreNameLike: true,
          predictionScoreSupported: true,
          predictionScoreLike: true,
          predictionValidationMode: "apparent",
          predictionValidationSupported: false,
        }),
        primaryMethods: expect.arrayContaining([expect.objectContaining({ method: "prediction-evaluation" })]),
      });

      const logisticPredictor = await researchStatsRunCommand({
        ...base,
        method: "logistic-regression",
        dataPath: predictorPath,
        outDir: path.join(dir, "logistic-predictor"),
        exposure: "age",
      });
      expect(logisticPredictor.status).toBe("succeeded");
      const predictorDecision = (logisticPredictor.diagnostics.preflight as { methodDecisionSupport?: { requestedRole?: string; verdict?: string; dataSignals?: Record<string, unknown>; primaryMethods?: Array<{ method: string }>; sensitivityMethods?: Array<{ method: string }> } }).methodDecisionSupport;
      expect(predictorDecision).toMatchObject({
        requestedRole: "primary",
        verdict: "preferred",
        dataSignals: expect.objectContaining({
          binaryPredictionScoreLike: false,
          predictionScoreSupported: true,
          predictionScoreProbabilityLike: false,
          predictionScoreNameLike: false,
          predictionScoreLike: false,
        }),
        primaryMethods: expect.arrayContaining([expect.objectContaining({ method: "logistic-regression" })]),
        sensitivityMethods: expect.arrayContaining([expect.objectContaining({ method: "prediction-evaluation" })]),
      });
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("uses weighted complete-case numeric support for large repeated preflight gates", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "agenteer-stats-weighted-preflight-"));
    try {
      const dataPath = path.join(dir, "weighted-preflight.csv");
      await writeFile(dataPath, [
        "y,ybin,score,validation_order,survival_time,event,running,p_value,x",
        ...Array.from({ length: 7500 }, (_, index) => {
          const y = 1 + index / 1000;
          const ybin = index % 3 === 0 ? 1 : 0;
          const score = 0.05 + (index % 6) * 0.15;
          const validationOrder = 1;
          const survivalTime = index < 5500 ? 0 : index < 6000 ? -1 : 1;
          const event = index % 4 === 0 ? 1 : 0;
          const running = 0.1 + index / 10000;
          const pValue = index < 6000 ? 1.2 : 0.02;
          const x = index % 2;
          return [y.toFixed(4), ybin, score.toFixed(3), validationOrder, survivalTime, event, running.toFixed(5), pValue, x].join(",");
        }),
      ].join("\n"));
      const base = {
        dataPath,
        variables: [],
        covariates: [],
        exactCovariates: [],
        estimand: "ATT" as const,
        matchRatio: 1,
        replacement: false,
        trimThreshold: 0.01,
        stabilizeWeights: true,
        surveyDesign: false,
        allowSurveyApproximation: false,
        alpha: 0.05,
        python,
      };

      const temporalPrediction = await researchStatsRunCommand({
        ...base,
        method: "prediction-evaluation",
        outDir: path.join(dir, "prediction-temporal-one-sided"),
        outcome: "ybin",
        exposure: "score",
        validationTime: "validation_order",
        validationCutoff: 50,
      });
      expect(temporalPrediction.status).toBe("failed");
      const temporalPreflight = temporalPrediction.diagnostics.preflight as { checks?: Array<{ id: string; status: string; detail: string }>; methodDecisionSupport?: { dataSignals?: Record<string, unknown> } };
      expect(temporalPreflight.methodDecisionSupport?.dataSignals).toMatchObject({
        predictionScoreN: 7500,
        predictionValidationMode: "temporal_holdout",
        predictionValidationEvaluationRows: 0,
        predictionValidationDevelopmentRows: 7500,
      });
      expect(temporalPreflight.checks?.find(check => check.id === "prediction-validation-time-support")).toMatchObject({
        status: "block",
        detail: expect.stringContaining("7500 earlier development row"),
      });

      const rdd = await researchStatsRunCommand({
        ...base,
        method: "regression-discontinuity",
        outDir: path.join(dir, "rdd-one-sided-repeated"),
        outcome: "y",
        runningVariable: "running",
        cutoff: 0,
      });
      expect(rdd.status).toBe("failed");
      expect((rdd.diagnostics.preflight as { methodDecisionSupport?: { dataSignals?: Record<string, unknown> } }).methodDecisionSupport?.dataSignals).toMatchObject({
        causalDesignFamily: "rdd",
        causalRunningBelowCutoff: 0,
        causalRunningAtOrAboveCutoff: 7500,
      });

      const survival = await researchStatsRunCommand({
        ...base,
        method: "kaplan-meier",
        outDir: path.join(dir, "survival-repeated-time-domain"),
        time: "survival_time",
        event: "event",
      });
      expect(survival.status).toBe("failed");
      const survivalPreflight = survival.diagnostics.preflight as { checks?: Array<{ id: string; status: string; detail: string }>; methodDecisionSupport?: { dataSignals?: Record<string, unknown> } };
      expect(survivalPreflight.methodDecisionSupport?.dataSignals).toMatchObject({
        survivalZeroTimeCount: 5500,
        survivalUniqueTimeCount: 3,
      });
      expect(survivalPreflight.checks?.find(check => check.id === "time-domain")).toMatchObject({
        status: "block",
        detail: expect.stringContaining("500 negative complete-case value"),
      });
      expect(survivalPreflight.checks?.find(check => check.id === "time-zero-support")).toMatchObject({
        status: "warning",
        detail: expect.stringContaining("5500 zero-time complete-case row"),
      });

      const pValues = await researchStatsRunCommand({
        ...base,
        method: "multiple-comparison-correction",
        outDir: path.join(dir, "repeated-invalid-p-values"),
        variables: ["p_value"],
      });
      expect(pValues.status).toBe("failed");
      const pValuePreflight = pValues.diagnostics.preflight as { checks?: Array<{ id: string; status: string; detail: string }>; methodDecisionSupport?: { dataSignals?: Record<string, unknown> } };
      expect(pValuePreflight.methodDecisionSupport?.dataSignals).toMatchObject({
        measurementPValueInvalidCount: 6000,
        measurementPValueCorrectionSupported: false,
      });
      expect(pValuePreflight.checks?.find(check => check.id === "pvalue-domain")).toMatchObject({
        status: "block",
        detail: expect.stringContaining("6000 invalid complete-case value"),
      });
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("uses survival support to downgrade weak grouped log-rank and sparse Cox routes", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "agenteer-stats-survival-decision-"));
    try {
      const zeroEventGroupPath = path.join(dir, "zero-event-group-survival.csv");
      const semanticEventPath = path.join(dir, "semantic-event-survival.csv");
      const sparseCoxPath = path.join(dir, "sparse-cox-events.csv");
      await writeFile(zeroEventGroupPath, [
        "time,event,arm",
        ...Array.from({ length: 90 }, (_, index) => {
          const arm = index % 3 === 0 ? "control" : index % 3 === 1 ? "low" : "high";
          const time = 5 + index;
          const event = arm === "high" ? 0 : index % 4 === 0 ? 1 : 0;
          return `${time},${event},${arm}`;
        }),
      ].join("\n"));
      await writeFile(semanticEventPath, [
        "time,event_status,arm",
        ...["control", "low", "high"].flatMap((arm, armIndex) => Array.from({ length: 30 }, (_, index) => {
          const eventLimit = arm === "control" ? 8 : arm === "low" ? 10 : 12;
          const eventStatus = index < eventLimit ? "dead" : "alive";
          const time = 5 + armIndex * 3 + index;
          return `${time},${eventStatus},${arm}`;
        })),
      ].join("\n"));
      await writeFile(sparseCoxPath, [
        "time,event,x,z",
        ...Array.from({ length: 120 }, (_, index) => {
          const event = index < 18 ? 1 : 0;
          const x = ((index % 17) - 8) / 10;
          const z = index % 2;
          return `${index + 1},${event},${x.toFixed(3)},${z}`;
        }),
      ].join("\n"));
      const base = {
        variables: [],
        covariates: [],
        exactCovariates: [],
        estimand: "ATT" as const,
        matchRatio: 1,
        replacement: false,
        trimThreshold: 0.01,
        stabilizeWeights: true,
        surveyDesign: false,
        allowSurveyApproximation: false,
        alpha: 0.05,
        python,
      };

      const logRank = await researchStatsRunCommand({
        ...base,
        method: "log-rank",
        dataPath: zeroEventGroupPath,
        outDir: path.join(dir, "log-rank"),
        time: "time",
        event: "event",
        group: "arm",
      });
      expect(logRank.status).toBe("succeeded");
      const logRankPreflight = logRank.diagnostics.preflight as { methodDecisionSupport?: { requestedRole?: string; verdict?: string; dataSignals?: Record<string, unknown>; primaryMethods?: Array<{ method: string }>; fallbackMethods?: Array<{ method: string }> }; checks?: Array<{ id: string; status: string }> };
      expect(logRankPreflight.methodDecisionSupport).toMatchObject({
        requestedRole: "fallback",
        verdict: "fallback_only",
        dataSignals: expect.objectContaining({
          survivalGroupVariable: "arm",
          survivalMinGroupEvents: 0,
          survivalGroupedComparisonSupported: false,
        }),
        primaryMethods: expect.arrayContaining([expect.objectContaining({ method: "kaplan-meier" })]),
        fallbackMethods: expect.arrayContaining([expect.objectContaining({ method: "log-rank" })]),
      });
      expect(logRankPreflight.methodDecisionSupport?.dataSignals?.survivalZeroEventGroups).toEqual(expect.arrayContaining(["high"]));
      expect(logRankPreflight.checks).toEqual(expect.arrayContaining([
        expect.objectContaining({ id: "survival-group-event-support-preflight", status: "warning" }),
      ]));

      const semanticLogRank = await researchStatsRunCommand({
        ...base,
        method: "log-rank",
        dataPath: semanticEventPath,
        outDir: path.join(dir, "semantic-log-rank"),
        time: "time",
        event: "event_status",
        group: "arm",
      });
      expect(semanticLogRank.status).toBe("succeeded");
      const semanticLogRankPreflight = semanticLogRank.diagnostics.preflight as { methodDecisionSupport?: { requestedRole?: string; verdict?: string; dataSignals?: Record<string, unknown>; primaryMethods?: Array<{ method: string }> }; checks?: Array<{ id: string; status: string }> };
      expect(semanticLogRankPreflight.methodDecisionSupport).toMatchObject({
        requestedRole: "primary",
        verdict: "preferred",
        dataSignals: expect.objectContaining({
          survivalEventCount: 30,
          survivalCensoredCount: 60,
          survivalEventOrientationEvidence: "semantic binary labels",
          survivalGroupVariable: "arm",
          survivalMinGroupEvents: 8,
          survivalGroupedComparisonSupported: true,
        }),
        primaryMethods: expect.arrayContaining([expect.objectContaining({ method: "log-rank" })]),
      });
      expect(semanticLogRankPreflight.checks?.map(check => check.id)).not.toContain("event-indicator-coding");
      expect(semanticLogRankPreflight.checks?.map(check => check.id)).not.toContain("event-indicator-orientation-review");
      expect(semanticLogRankPreflight.checks?.map(check => check.id)).not.toContain("survival-group-event-support-preflight");

      const cox = await researchStatsRunCommand({
        ...base,
        method: "cox-proportional-hazards",
        dataPath: sparseCoxPath,
        outDir: path.join(dir, "cox"),
        time: "time",
        event: "event",
        exposure: "x",
        covariates: ["z"],
      });
      expect(cox.status).toBe("succeeded");
      const coxPreflight = cox.diagnostics.preflight as { methodDecisionSupport?: { requestedRole?: string; verdict?: string; dataSignals?: Record<string, unknown>; primaryMethods?: Array<{ method: string }>; sensitivityMethods?: Array<{ method: string }> }; checks?: Array<{ id: string; status: string }> };
      expect(coxPreflight.methodDecisionSupport).toMatchObject({
        requestedRole: "sensitivity",
        verdict: "acceptable_sensitivity",
        dataSignals: expect.objectContaining({
          survivalEventCount: 18,
          survivalCoxSupported: false,
        }),
        primaryMethods: expect.arrayContaining([expect.objectContaining({ method: "kaplan-meier" })]),
        sensitivityMethods: expect.arrayContaining([expect.objectContaining({ method: "cox-proportional-hazards" })]),
      });
      expect(Number(coxPreflight.methodDecisionSupport?.dataSignals?.survivalEventsPerPredictor)).toBeLessThan(10);
      expect(coxPreflight.checks).toEqual(expect.arrayContaining([
        expect.objectContaining({ id: "cox-events-per-predictor-preflight-review", status: "warning" }),
      ]));
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("uses group-comparison shape support to choose rank-based routes when mean-scale assumptions are fragile", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "agenteer-stats-group-decision-"));
    try {
      const twoGroupPath = path.join(dir, "skewed-two-group.csv");
      const threeGroupPath = path.join(dir, "skewed-three-group.csv");
      await writeFile(twoGroupPath, [
        "y,g",
        ...Array.from({ length: 72 }, (_, index) => {
          const g = index < 36 ? 0 : 1;
          const within = index % 36;
          const y = Math.exp(within / 7) + g * 0.35 + (within % 3) * 0.01;
          return `${y.toFixed(6)},${g}`;
        }),
      ].join("\n"));
      await writeFile(threeGroupPath, [
        "y,g",
        ...Array.from({ length: 90 }, (_, index) => {
          const groupIndex = Math.floor(index / 30);
          const within = index % 30;
          const g = ["a", "b", "c"][groupIndex]!;
          const y = Math.exp(within / 6) + groupIndex * 0.4 + (within % 4) * 0.02;
          return `${y.toFixed(6)},${g}`;
        }),
      ].join("\n"));
      const base = {
        outcome: "y",
        variables: [],
        covariates: [],
        exactCovariates: [],
        estimand: "ATT" as const,
        matchRatio: 1,
        replacement: false,
        trimThreshold: 0.01,
        stabilizeWeights: true,
        surveyDesign: false,
        allowSurveyApproximation: false,
        alpha: 0.05,
        python,
      };

      const skewedWelch = await researchStatsRunCommand({
        ...base,
        method: "welch-t-test",
        dataPath: twoGroupPath,
        outDir: path.join(dir, "skewed-welch"),
        group: "g",
      });
      const mannWhitneyOut = path.join(dir, "skewed-mann-whitney");
      const skewedMannWhitney = await researchStatsRunCommand({
        ...base,
        method: "mann-whitney",
        dataPath: twoGroupPath,
        outDir: mannWhitneyOut,
        group: "g",
      });
      const skewedAnova = await researchStatsRunCommand({
        ...base,
        method: "anova",
        dataPath: threeGroupPath,
        outDir: path.join(dir, "skewed-anova"),
        group: "g",
      });
      const skewedKruskal = await researchStatsRunCommand({
        ...base,
        method: "kruskal-wallis",
        dataPath: threeGroupPath,
        outDir: path.join(dir, "skewed-kruskal"),
        group: "g",
      });

      expect(skewedWelch.status).toBe("succeeded");
      const welchDecision = (skewedWelch.diagnostics.preflight as { methodDecisionSupport?: { requestedRole?: string; verdict?: string; dataSignals?: Record<string, unknown>; primaryMethods?: Array<{ method: string }>; sensitivityMethods?: Array<{ method: string }>; fallbackMethods?: Array<{ method: string }> } }).methodDecisionSupport;
      expect(welchDecision).toMatchObject({
        requestedRole: "sensitivity",
        verdict: "acceptable_sensitivity",
        dataSignals: expect.objectContaining({
          groupComparisonLevelCount: 2,
          groupComparisonMinGroupCount: 36,
          groupComparisonRankPreferred: true,
        }),
        primaryMethods: expect.arrayContaining([expect.objectContaining({ method: "mann-whitney" })]),
        sensitivityMethods: expect.arrayContaining([expect.objectContaining({ method: "welch-t-test" })]),
        fallbackMethods: expect.arrayContaining([expect.objectContaining({ method: "t-test" })]),
      });
      expect(Number(welchDecision?.dataSignals?.groupComparisonOutcomeSkewness)).toBeGreaterThan(1);
      const welchPreflight = skewedWelch.diagnostics.preflight as { checks?: Array<{ id: string; status: string }> };
      expect(welchPreflight.checks).toEqual(expect.arrayContaining([
        expect.objectContaining({ id: "group-comparison-rank-route-review", status: "warning" }),
      ]));
      const welchQa = JSON.parse(await readFile(path.join(dir, "skewed-welch", "stats-qa.json"), "utf-8")) as { checks: Array<{ id: string; status: string }> };
      expect(welchQa.checks).toEqual(expect.arrayContaining([
        expect.objectContaining({ id: "method-decision-alignment", status: "warning" }),
      ]));

      expect(skewedMannWhitney.status).toBe("succeeded");
      const mannWhitneyDecision = (skewedMannWhitney.diagnostics.preflight as { methodDecisionSupport?: { requestedRole?: string; verdict?: string; primaryMethods?: Array<{ method: string }>; sensitivityMethods?: Array<{ method: string }> } }).methodDecisionSupport;
      expect(mannWhitneyDecision).toMatchObject({
        requestedRole: "primary",
        verdict: "preferred",
        primaryMethods: expect.arrayContaining([expect.objectContaining({ method: "mann-whitney" })]),
        sensitivityMethods: expect.arrayContaining([expect.objectContaining({ method: "welch-t-test" })]),
      });
      expect(skewedMannWhitney.estimates[0]).toMatchObject({
        median_difference: expect.any(Number),
        median_difference_ci_low: expect.any(Number),
        median_difference_ci_high: expect.any(Number),
        rank_biserial_correlation: expect.any(Number),
        rank_biserial_ci_low: expect.any(Number),
        rank_biserial_ci_high: expect.any(Number),
        ci_method: "row bootstrap percentile",
      });
      expect(skewedMannWhitney.diagnostics).toMatchObject({
        artifacts: expect.objectContaining({
          permutation_sensitivity: expect.stringContaining("permutation-sensitivity.csv"),
          nonparametric_bootstrap: expect.stringContaining("nonparametric-bootstrap.csv"),
        }),
        nonparametric_bootstrap_interval: expect.objectContaining({
          available_metrics: expect.arrayContaining(["median_difference", "rank_biserial_correlation"]),
        }),
      });
      expect(skewedMannWhitney.artifacts.some(artifact => artifact.path.endsWith("nonparametric-bootstrap.csv"))).toBe(true);
      await expect(readFile(path.join(mannWhitneyOut, "nonparametric-bootstrap.csv"), "utf-8")).resolves.toContain("row bootstrap percentile");
      const mannWhitneyQa = JSON.parse(await readFile(path.join(mannWhitneyOut, "stats-qa.json"), "utf-8")) as { checks: Array<{ id: string; status: string }> };
      expect(mannWhitneyQa.checks).toEqual(expect.arrayContaining([
        expect.objectContaining({ id: "core-inference-nonparametric-bootstrap", status: "pass" }),
        expect.objectContaining({ id: "core-inference-permutation-sensitivity", status: "pass" }),
      ]));

      expect(skewedAnova.status).toBe("succeeded");
      const anovaDecision = (skewedAnova.diagnostics.preflight as { methodDecisionSupport?: { requestedRole?: string; verdict?: string; dataSignals?: Record<string, unknown>; primaryMethods?: Array<{ method: string }>; fallbackMethods?: Array<{ method: string }> } }).methodDecisionSupport;
      expect(anovaDecision).toMatchObject({
        requestedRole: "fallback",
        verdict: "fallback_only",
        dataSignals: expect.objectContaining({
          groupComparisonLevelCount: 3,
          groupComparisonMinGroupCount: 30,
          groupComparisonRankPreferred: true,
        }),
        primaryMethods: expect.arrayContaining([expect.objectContaining({ method: "kruskal-wallis" })]),
        fallbackMethods: expect.arrayContaining([expect.objectContaining({ method: "anova" })]),
      });

      expect(skewedKruskal.status).toBe("succeeded");
      expect(skewedKruskal.estimates[0]).toMatchObject({
        epsilon_squared: expect.any(Number),
        epsilon_squared_ci_low: expect.any(Number),
        epsilon_squared_ci_high: expect.any(Number),
        effect_measure: "epsilon_squared",
        ci_method: "stratified row bootstrap percentile",
      });
      expect(skewedKruskal.diagnostics).toMatchObject({
        artifacts: expect.objectContaining({
          omnibus_effect_bootstrap: expect.stringContaining("omnibus-effect-bootstrap.csv"),
        }),
        omnibus_effect_bootstrap_interval: expect.objectContaining({
          available_metrics: expect.arrayContaining(["epsilon_squared"]),
        }),
      });
      const kruskalDecision = (skewedKruskal.diagnostics.preflight as { methodDecisionSupport?: { requestedRole?: string; verdict?: string; primaryMethods?: Array<{ method: string }>; fallbackMethods?: Array<{ method: string }> } }).methodDecisionSupport;
      expect(kruskalDecision).toMatchObject({
        requestedRole: "primary",
        verdict: "preferred",
        primaryMethods: expect.arrayContaining([expect.objectContaining({ method: "kruskal-wallis" })]),
        fallbackMethods: expect.arrayContaining([expect.objectContaining({ method: "anova" })]),
      });
      const kruskalQa = JSON.parse(await readFile(path.join(dir, "skewed-kruskal", "stats-qa.json"), "utf-8")) as { checks: Array<{ id: string; status: string }> };
      expect(kruskalQa.checks).toEqual(expect.arrayContaining([
        expect.objectContaining({ id: "core-inference-omnibus-effect-size", status: "pass" }),
        expect.objectContaining({ id: "core-inference-omnibus-effect-bootstrap", status: "pass" }),
      ]));
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("uses paired-difference shape support to choose Wilcoxon when paired mean assumptions are fragile", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "agenteer-stats-paired-decision-"));
    try {
      const dataPath = path.join(dir, "skewed-paired.csv");
      await writeFile(dataPath, [
        "before,after",
        ...Array.from({ length: 48 }, (_, index) => {
          const before = 10 + (index % 6) * 0.1;
          const difference = Math.exp(index / 9) + (index % 4 === 0 ? 0 : 0.02);
          const after = before + difference;
          return `${before.toFixed(6)},${after.toFixed(6)}`;
        }),
      ].join("\n"));
      const base = {
        dataPath,
        variables: ["before", "after"],
        covariates: [],
        exactCovariates: [],
        estimand: "ATT" as const,
        matchRatio: 1,
        replacement: false,
        trimThreshold: 0.01,
        stabilizeWeights: true,
        surveyDesign: false,
        allowSurveyApproximation: false,
        alpha: 0.05,
        python,
      };
      const pairedT = await researchStatsRunCommand({
        ...base,
        method: "paired-t-test",
        outDir: path.join(dir, "paired-t"),
      });
      const wilcoxonOut = path.join(dir, "wilcoxon");
      const wilcoxon = await researchStatsRunCommand({
        ...base,
        method: "wilcoxon",
        outDir: wilcoxonOut,
      });

      expect(pairedT.status).toBe("succeeded");
      const pairedDecision = (pairedT.diagnostics.preflight as { methodDecisionSupport?: { requestedRole?: string; verdict?: string; dataSignals?: Record<string, unknown>; primaryMethods?: Array<{ method: string }>; sensitivityMethods?: Array<{ method: string }> }; checks?: Array<{ id: string; status: string }> }).methodDecisionSupport;
      expect(pairedDecision).toMatchObject({
        requestedRole: "sensitivity",
        verdict: "acceptable_sensitivity",
        dataSignals: expect.objectContaining({
          pairedDifferenceCompletePairs: 48,
          pairedDifferenceRankPreferred: true,
        }),
        primaryMethods: expect.arrayContaining([expect.objectContaining({ method: "wilcoxon" })]),
        sensitivityMethods: expect.arrayContaining([expect.objectContaining({ method: "paired-t-test" })]),
      });
      expect(Number(pairedDecision?.dataSignals?.pairedDifferenceSkewness)).toBeGreaterThan(1);
      const pairedPreflight = pairedT.diagnostics.preflight as { checks?: Array<{ id: string; status: string }> };
      expect(pairedPreflight.checks).toEqual(expect.arrayContaining([
        expect.objectContaining({ id: "paired-difference-rank-route-review", status: "warning" }),
      ]));

      expect(wilcoxon.status).toBe("succeeded");
      const wilcoxonDecision = (wilcoxon.diagnostics.preflight as { methodDecisionSupport?: { requestedRole?: string; verdict?: string; primaryMethods?: Array<{ method: string }>; sensitivityMethods?: Array<{ method: string }> } }).methodDecisionSupport;
      expect(wilcoxonDecision).toMatchObject({
        requestedRole: "primary",
        verdict: "preferred",
        primaryMethods: expect.arrayContaining([expect.objectContaining({ method: "wilcoxon" })]),
        sensitivityMethods: expect.arrayContaining([expect.objectContaining({ method: "paired-t-test" })]),
      });
      expect(wilcoxon.estimates[0]).toMatchObject({
        median_difference: expect.any(Number),
        median_difference_ci_low: expect.any(Number),
        median_difference_ci_high: expect.any(Number),
        matched_rank_biserial_correlation: expect.any(Number),
        matched_rank_biserial_ci_low: expect.any(Number),
        matched_rank_biserial_ci_high: expect.any(Number),
        ci_method: "row bootstrap percentile",
      });
      expect(wilcoxon.diagnostics).toMatchObject({
        artifacts: expect.objectContaining({
          paired_differences: expect.stringContaining("paired-differences.csv"),
          nonparametric_bootstrap: expect.stringContaining("nonparametric-bootstrap.csv"),
        }),
        nonparametric_bootstrap_interval: expect.objectContaining({
          available_metrics: expect.arrayContaining(["median_difference", "matched_rank_biserial_correlation"]),
        }),
      });
      expect(wilcoxon.artifacts.some(artifact => artifact.path.endsWith("nonparametric-bootstrap.csv"))).toBe(true);
      await expect(readFile(path.join(wilcoxonOut, "nonparametric-bootstrap.csv"), "utf-8")).resolves.toContain("matched_rank_biserial_correlation");
      const wilcoxonQa = JSON.parse(await readFile(path.join(wilcoxonOut, "stats-qa.json"), "utf-8")) as { checks: Array<{ id: string; status: string }> };
      expect(wilcoxonQa.checks).toEqual(expect.arrayContaining([
        expect.objectContaining({ id: "core-inference-nonparametric-bootstrap", status: "pass" }),
      ]));
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("uses weighted paired-difference support when repeated zero changes exceed expansion caps", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "agenteer-stats-paired-weighted-decision-"));
    try {
      const dataPath = path.join(dir, "many-zero-paired-differences.csv");
      await writeFile(dataPath, [
        "before,after",
        ...Array.from({ length: 7500 }, (_, index) => {
          const before = 10;
          const after = index < 5500 ? 10 : 11;
          return `${before},${after}`;
        }),
      ].join("\n"));
      const result = await researchStatsRunCommand({
        method: "paired-t-test",
        dataPath,
        outDir: path.join(dir, "paired-t-many-zero"),
        variables: ["before", "after"],
        covariates: [],
        exactCovariates: [],
        estimand: "ATT",
        matchRatio: 1,
        replacement: false,
        trimThreshold: 0.01,
        stabilizeWeights: true,
        surveyDesign: false,
        allowSurveyApproximation: false,
        alpha: 0.05,
        python,
      });

      expect(result.status).toBe("succeeded");
      const preflight = result.diagnostics.preflight as { checks?: Array<{ id: string; status: string; detail: string }>; methodDecisionSupport?: { requestedRole?: string; verdict?: string; dataSignals?: Record<string, unknown>; primaryMethods?: Array<{ method: string }>; sensitivityMethods?: Array<{ method: string }> } };
      expect(preflight.methodDecisionSupport).toMatchObject({
        requestedRole: "sensitivity",
        verdict: "acceptable_sensitivity",
        dataSignals: expect.objectContaining({
          pairedDifferenceCompletePairs: 7500,
          pairedDifferenceUniqueValues: 2,
          pairedDifferenceRankPreferred: true,
        }),
        primaryMethods: expect.arrayContaining([expect.objectContaining({ method: "wilcoxon" })]),
        sensitivityMethods: expect.arrayContaining([expect.objectContaining({ method: "paired-t-test" })]),
      });
      expect(Number(preflight.methodDecisionSupport?.dataSignals?.pairedDifferenceZeroFraction)).toBeCloseTo(5500 / 7500, 5);
      expect(result.issues.map(issue => issue.code)).not.toContain("NO_ROLE_VARIATION");
      expect(result.issues.map(issue => issue.code)).not.toContain("STATS_SELECTED_VARIABLE_SEMANTIC_PLAUSIBILITY_INVALID");
      expect(result.issues.map(issue => issue.code)).not.toContain("STATS_PREFLIGHT_FEASIBILITY_BLOCKERS");
      expect(preflight.checks).toEqual(expect.arrayContaining([
        expect.objectContaining({
          id: "feasibility-gate-verdict",
          status: "warning",
          detail: expect.stringContaining("constant individual repeated-measure column"),
        }),
        expect.objectContaining({
          id: "selected-variable-semantic-plausibility",
          status: "pass",
        }),
        expect.objectContaining({
          id: "paired-difference-rank-route-review",
          status: "warning",
          detail: expect.stringContaining("pairs=7500"),
        }),
      ]));
      expect(preflight.checks?.some(check => check.id === "feasibility-blockers")).toBe(false);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("flags equal-variance ANOVA routes when group variances are badly imbalanced", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "agenteer-stats-anova-variance-"));
    const dataPath = path.join(dir, "anova-variance-imbalance.csv");
    await writeFile(dataPath, [
      "y,g",
      ...Array.from({ length: 90 }, (_, index) => {
        const groupIndex = Math.floor(index / 30);
        const within = index % 30;
        const g = ["a", "b", "c"][groupIndex];
        const spread = groupIndex === 0 ? 0.01 : groupIndex === 1 ? 0.2 : 2.5;
        const y = 20 + groupIndex * 0.4 + within * spread;
        return `${y.toFixed(4)},${g}`;
      }),
    ].join("\n"));

    const anova = await researchStatsRunCommand({
      method: "anova",
      dataPath,
      outDir: path.join(dir, "anova"),
      outcome: "y",
      group: "g",
      variables: [],
      covariates: [],
      exactCovariates: [],
      estimand: "ATT",
      matchRatio: 1,
      replacement: false,
      trimThreshold: 0.01,
      stabilizeWeights: true,
      surveyDesign: false,
      allowSurveyApproximation: false,
      alpha: 0.05,
      python,
    });
    expect(anova.status).toBe("succeeded");
    expect(anova.diagnostics).toMatchObject({
      test: "ANOVA",
      group_counts: expect.any(Object),
      levene_p_value: expect.any(Number),
      variance_ratio: expect.any(Number),
      group_shapiro_min_p_value: expect.any(Number),
    });
    const anovaQa = JSON.parse(await readFile(path.join(dir, "anova", "stats-qa.json"), "utf-8")) as { status: string; checks: Array<{ id: string; status: string; detail: string }> };
    expect(anovaQa.status).toBe("fail");
    expect(anovaQa.checks.find(check => check.id === "mean-comparison-variance-balance")).toMatchObject({
      status: "fail",
    });

    const kruskal = await researchStatsRunCommand({
      method: "kruskal-wallis",
      dataPath,
      outDir: path.join(dir, "kruskal"),
      outcome: "y",
      group: "g",
      variables: [],
      covariates: [],
      exactCovariates: [],
      estimand: "ATT",
      matchRatio: 1,
      replacement: false,
      trimThreshold: 0.01,
      stabilizeWeights: true,
      surveyDesign: false,
      allowSurveyApproximation: false,
      alpha: 0.05,
      python,
    });
    expect(kruskal.status).toBe("succeeded");
    const kruskalQa = JSON.parse(await readFile(path.join(dir, "kruskal", "stats-qa.json"), "utf-8")) as { status: string; checks: Array<{ id: string; status: string }> };
    expect(kruskalQa.status).toBe("warning");
    expect(kruskalQa.checks.find(check => check.id === "mean-comparison-variance-balance")?.status).toBe("warning");
  });

  it("records family-specific reliability QA for count, survival, and longitudinal routes", async () => {
    const { dir, dataPath } = await writeStatsFixture();
    const countOut = path.join(dir, "count-reliability");
    const count = await researchStatsRunCommand({
      method: "poisson-regression",
      dataPath,
      outDir: countOut,
      outcome: "count",
      exposure: "x",
      covariates: ["g"],
      variables: [],
      exactCovariates: [],
      estimand: "ATT",
      matchRatio: 1,
      replacement: false,
      trimThreshold: 0.01,
      stabilizeWeights: true,
      surveyDesign: false,
      allowSurveyApproximation: false,
      alpha: 0.05,
      python,
    });
    expect(count.status).toBe("succeeded");
	    expect(count.diagnostics).toMatchObject({
	      model_family: "poisson-regression",
	      n_predictors: expect.any(Number),
	      overdispersion_ratio: expect.any(Number),
	      zero_fraction: expect.any(Number),
	      count_fit_row_count: expect.any(Number),
	      count_zero_diagnostic_row_count: expect.any(Number),
	      count_observed_mean: expect.any(Number),
	      count_fitted_mean: expect.any(Number),
	      count_observed_to_fitted_mean_ratio: expect.any(Number),
	      count_observed_zero_fraction: expect.any(Number),
	    });
    expect(count.diagnostics).toMatchObject({
      high_influence_rows: expect.any(Number),
      artifacts: expect.objectContaining({
        model_diagnostics: expect.stringContaining("model-diagnostics.csv"),
	        regression_model_frame: expect.stringContaining("regression-model-frame.csv"),
	        regression_design_matrix: expect.stringContaining("regression-design-matrix.csv"),
	        regression_predictions: expect.stringContaining("regression-predictions.csv"),
	        count_fit_summary: expect.stringContaining("count-fit-summary.csv"),
	        count_zero_diagnostics: expect.stringContaining("count-zero-diagnostics.csv"),
	      }),
	    });
    expect(count.artifacts.map(artifact => artifact.kind)).toContain("model-diagnostics");
	    expect(count.artifacts.some(artifact => artifact.path.endsWith("regression-model-frame.csv"))).toBe(true);
	    expect(count.artifacts.some(artifact => artifact.path.endsWith("regression-design-matrix.csv"))).toBe(true);
	    expect(count.artifacts.some(artifact => artifact.path.endsWith("regression-predictions.csv"))).toBe(true);
	    expect(count.artifacts.some(artifact => artifact.path.endsWith("count-fit-summary.csv"))).toBe(true);
	    expect(count.artifacts.some(artifact => artifact.path.endsWith("count-zero-diagnostics.csv"))).toBe(true);
    const modelDiagnostics = await readFile(path.join(countOut, "model-diagnostics.csv"), "utf-8");
    expect(modelDiagnostics).toContain("fitted");
    expect(modelDiagnostics).toContain("residual");
    expect(modelDiagnostics).toContain("cooks_distance");
    expect(modelDiagnostics).toContain("high_influence_flag");
    const regressionModelFrame = await readFile(path.join(countOut, "regression-model-frame.csv"), "utf-8");
    expect(regressionModelFrame).toContain("count");
    expect(regressionModelFrame).toContain("x");
    const regressionDesign = await readFile(path.join(countOut, "regression-design-matrix.csv"), "utf-8");
    expect(regressionDesign).toContain("const");
	    const regressionPredictions = await readFile(path.join(countOut, "regression-predictions.csv"), "utf-8");
	    expect(regressionPredictions).toContain("fitted");
	    expect(regressionPredictions).toContain("residual");
	    const countFitSummary = await readFile(path.join(countOut, "count-fit-summary.csv"), "utf-8");
	    expect(countFitSummary).toContain("observed_to_fitted_mean_ratio");
	    expect(countFitSummary).toContain("expected_zero_fraction");
	    const countZeroDiagnostics = await readFile(path.join(countOut, "count-zero-diagnostics.csv"), "utf-8");
	    expect(countZeroDiagnostics).toContain("observed_to_expected_zero_ratio");
	    const countFigures = JSON.parse(await readFile(path.join(countOut, "figures.json"), "utf-8")) as { figures: Array<{ path: string; title: string; sourceColumns: string[] }> };
	    expect(countFigures.figures.map(figure => path.basename(figure.path))).toEqual(expect.arrayContaining(["model-residuals.png", "model-influence.png", "model-coefficients.png", "count-observed-vs-fitted.png"]));
    expect(countFigures.figures.find(figure => path.basename(figure.path) === "model-coefficients.png")?.sourceColumns).toEqual(expect.arrayContaining(["count", "x", "g"]));
    const countQa = JSON.parse(await readFile(path.join(countOut, "stats-qa.json"), "utf-8")) as { checks: Array<{ id: string; status: string }> };
    expect(countQa.checks.map(check => check.id)).toEqual(expect.arrayContaining([
	      "model-diagnostics-present",
	      "model-count-overdispersion",
	      "model-count-offset-validity",
	      "model-count-fit-artifacts",
	      "model-count-fitted-mean-calibration",
	      "model-count-zero-calibration",
	      "model-collinearity",
	      "model-diagnostics-artifact",
	      "regression-model-source-artifacts",
	    ]));
	    expect(countQa.checks.find(check => check.id === "regression-model-source-artifacts")?.status).toBe("pass");
	    expect(countQa.checks.find(check => check.id === "model-count-fit-artifacts")?.status).toBe("pass");
	    expect(countQa.checks.find(check => check.id === "model-count-offset-validity")?.status).toBe("warning");

    const ratePath = path.join(dir, "rate-count.csv");
    await writeFile(ratePath, [
      "count,x,person_time",
      ...Array.from({ length: 140 }, (_, index) => {
        const x = index % 2;
        const personTime = 0.75 + (index % 7) * 0.35;
        const baseRate = x ? 0.95 : 0.45;
        const seasonal = index % 11 === 0 ? 1 : 0;
        const countValue = Math.max(0, Math.round(personTime * baseRate + seasonal));
        return `${countValue},${x},${personTime.toFixed(3)}`;
      }),
    ].join("\n"));
    const rateOut = path.join(dir, "poisson-offset-rate");
    const rate = await researchStatsRunCommand({
      method: "poisson-regression",
      dataPath: ratePath,
      outDir: rateOut,
      outcome: "count",
      exposure: "x",
      offset: "person_time",
      covariates: [],
      variables: [],
      exactCovariates: [],
      estimand: "ATT",
      matchRatio: 1,
      replacement: false,
      trimThreshold: 0.01,
      stabilizeWeights: true,
      surveyDesign: false,
      allowSurveyApproximation: false,
      alpha: 0.05,
      python,
    });
    expect(rate.status).toBe("succeeded");
	    expect(rate.diagnostics).toMatchObject({
	      offset_variable: "person_time",
	      offset_scale: "log",
	      offset_min: expect.any(Number),
	      offset_max: expect.any(Number),
	      count_observed_incidence_rate: expect.any(Number),
	      count_fitted_incidence_rate: expect.any(Number),
	    });
    expect(rate.estimates.find(row => row.term === "x")).toMatchObject({
      effect_measure: "incidence_rate_ratio",
      offset_variable: "person_time",
      rate_ratio: expect.any(Number),
    });
    const rateQa = JSON.parse(await readFile(path.join(rateOut, "stats-qa.json"), "utf-8")) as { checks: Array<{ id: string; status: string }> };
    expect(rateQa.checks.find(check => check.id === "model-count-offset-validity")?.status).toBe("pass");
    const ratePreflight = JSON.parse(await readFile(path.join(rateOut, "stats-preflight.json"), "utf-8")) as { statsPreflight: { checks: Array<{ id: string; status: string }> } };
    expect(ratePreflight.statsPreflight.checks.find(check => check.id === "offset-positive-domain")?.status).toBe("pass");

    const zinbPath = path.join(dir, "zero-inflated-overdispersed-count.csv");
    await writeFile(zinbPath, [
      "count,exposure",
      ...Array.from({ length: 240 }, (_, index) => {
        const exposure = index % 2;
        const slot = index % 20;
        const countValue = slot < 12
          ? 0
          : exposure
            ? [2, 3, 4, 7, 12, 15, 3, 9][slot - 12]
            : [1, 1, 2, 3, 8, 10, 2, 5][slot - 12];
        return `${countValue},${exposure}`;
      }),
    ].join("\n"));
    const zinbOut = path.join(dir, "zinb-reliability");
    const zinb = await researchStatsRunCommand({
      method: "zero-inflated-negative-binomial",
      dataPath: zinbPath,
      outDir: zinbOut,
      outcome: "count",
      exposure: "exposure",
      covariates: [],
      variables: [],
      exactCovariates: [],
      estimand: "ATT",
      matchRatio: 1,
      replacement: false,
      trimThreshold: 0.01,
      stabilizeWeights: true,
      surveyDesign: false,
      allowSurveyApproximation: false,
      alpha: 0.05,
      python,
    });
    expect(zinb.status).toBe("succeeded");
	    expect(zinb.diagnostics).toMatchObject({
	      model_family: "zero-inflated-negative-binomial",
	      zero_fraction: expect.any(Number),
	      count_fit_row_count: expect.any(Number),
	    });
    expect(zinb.diagnostics.zero_fraction).toBeGreaterThan(0.5);
    const zinbQa = JSON.parse(await readFile(path.join(zinbOut, "stats-qa.json"), "utf-8")) as { checks: Array<{ id: string; status: string }> };
    expect(zinbQa.checks.map(check => check.id)).toEqual(expect.arrayContaining([
	      "model-count-overdispersion",
	      "model-count-zero-inflation",
	      "model-count-fit-artifacts",
	    ]));
    expect(zinbQa.checks.find(check => check.id === "model-count-zero-inflation")?.status).toBe("pass");

    const kmOut = path.join(dir, "km-reliability");
    const km = await researchStatsRunCommand({
      method: "kaplan-meier",
      dataPath,
      outDir: kmOut,
      time: "time",
      event: "event",
      group: "g",
      variables: [],
      covariates: [],
      exactCovariates: [],
      estimand: "ATT",
      matchRatio: 1,
      replacement: false,
      trimThreshold: 0.01,
      stabilizeWeights: true,
      surveyDesign: false,
      allowSurveyApproximation: false,
      alpha: 0.05,
      python,
    });
    expect(km.status).toBe("succeeded");
    expect(km.estimates[0]).toMatchObject({
      survival: expect.any(Number),
      survival_ci_low: expect.any(Number),
      survival_ci_high: expect.any(Number),
      events: expect.any(Number),
      last_at_risk: expect.any(Number),
    });
    expect(km.diagnostics).toMatchObject({
      curve_path: expect.stringContaining("kaplan-meier-curve.csv"),
      risk_table_path: expect.stringContaining("survival-risk-table.csv"),
      rmst_path: expect.stringContaining("survival-rmst.csv"),
      risk_table_rows: expect.any(Number),
      risk_table_horizons: expect.any(Array),
      rmst: expect.objectContaining({
        status: "ok",
        tau: expect.any(Number),
        rmst_row_count: expect.any(Number),
      }),
      group_summary: expect.any(Array),
      ci_method: "Greenwood normal approximation for survival probabilities; bootstrap percentile intervals for RMST",
      artifacts: expect.objectContaining({
        survival_curve: expect.stringContaining("kaplan-meier-curve.csv"),
        survival_risk_table: expect.stringContaining("survival-risk-table.csv"),
        survival_rmst: expect.stringContaining("survival-rmst.csv"),
      }),
    });
    expect(km.artifacts.some(artifact => artifact.kind === "table" && artifact.path.endsWith("kaplan-meier-curve.csv"))).toBe(true);
    expect(km.artifacts.some(artifact => artifact.kind === "table" && artifact.path.endsWith("survival-risk-table.csv"))).toBe(true);
    expect(km.artifacts.some(artifact => artifact.kind === "table" && artifact.path.endsWith("survival-rmst.csv"))).toBe(true);
    const kmRiskRows = (await readFile(path.join(kmOut, "survival-risk-table.csv"), "utf-8")).trim().split("\n");
    expect(kmRiskRows.length).toBeGreaterThan(2);
    expect(kmRiskRows[0]).toContain("at_risk");
    const kmRmstRows = (await readFile(path.join(kmOut, "survival-rmst.csv"), "utf-8")).trim().split("\n");
    expect(kmRmstRows.length).toBeGreaterThan(2);
    expect(kmRmstRows[0]).toContain("rmst");
    const kmFigures = JSON.parse(await readFile(path.join(kmOut, "figures.json"), "utf-8")) as { figures: Array<{ path: string; title: string; sourceColumns: string[] }> };
    expect(kmFigures.figures.map(figure => path.basename(figure.path))).toEqual(expect.arrayContaining(["kaplan-meier.png", "survival-risk-table.png", "survival-rmst.png"]));
    const kmQa = JSON.parse(await readFile(path.join(kmOut, "stats-qa.json"), "utf-8")) as { checks: Array<{ id: string; status: string }> };
    expect(kmQa.checks.map(check => check.id)).toEqual(expect.arrayContaining([
      "survival-event-count",
      "survival-censoring-context",
      "survival-curve-artifact",
      "survival-risk-table-artifact",
      "survival-rmst-artifact",
      "survival-rmst-horizon",
    ]));
    expect(kmQa.checks.find(check => check.id === "survival-risk-table-artifact")?.status).toBe("pass");
    expect(kmQa.checks.find(check => check.id === "survival-rmst-artifact")?.status).toBe("pass");

    const logRankOut = path.join(dir, "log-rank-reliability");
    const logRank = await researchStatsRunCommand({
      method: "log-rank",
      dataPath,
      outDir: logRankOut,
      time: "time",
      event: "event",
      group: "g",
      variables: [],
      covariates: [],
      exactCovariates: [],
      estimand: "ATT",
      matchRatio: 1,
      replacement: false,
      trimThreshold: 0.01,
      stabilizeWeights: true,
      surveyDesign: false,
      allowSurveyApproximation: false,
      alpha: 0.05,
      python,
    });
    expect(logRank.status).toBe("succeeded");
    expect(logRank.diagnostics).toMatchObject({
      curve_path: expect.stringContaining("log-rank-survival-curve.csv"),
      risk_table_path: expect.stringContaining("survival-risk-table.csv"),
      rmst_path: expect.stringContaining("survival-rmst.csv"),
      risk_table_rows: expect.any(Number),
      rmst: expect.objectContaining({
        status: "ok",
        tau: expect.any(Number),
        rmst_row_count: expect.any(Number),
      }),
      artifacts: expect.objectContaining({
        survival_curve: expect.stringContaining("log-rank-survival-curve.csv"),
        survival_risk_table: expect.stringContaining("survival-risk-table.csv"),
        survival_rmst: expect.stringContaining("survival-rmst.csv"),
      }),
    });
    expect(logRank.artifacts.some(artifact => artifact.kind === "table" && artifact.path.endsWith("log-rank-survival-curve.csv"))).toBe(true);
    expect(logRank.artifacts.some(artifact => artifact.kind === "table" && artifact.path.endsWith("survival-risk-table.csv"))).toBe(true);
    expect(logRank.artifacts.some(artifact => artifact.kind === "table" && artifact.path.endsWith("survival-rmst.csv"))).toBe(true);
    await expect(readFile(path.join(logRankOut, "survival-rmst.csv"), "utf-8")).resolves.toContain("rmst_pairwise_contrast");
    const logRankFigures = JSON.parse(await readFile(path.join(logRankOut, "figures.json"), "utf-8")) as { figures: Array<{ path: string; title: string; sourceColumns: string[] }> };
    expect(logRankFigures.figures.map(figure => path.basename(figure.path))).toEqual(expect.arrayContaining(["log-rank-survival.png", "survival-risk-table.png", "survival-rmst.png"]));
    const logRankQa = JSON.parse(await readFile(path.join(logRankOut, "stats-qa.json"), "utf-8")) as { checks: Array<{ id: string; status: string }> };
    expect(logRankQa.checks.find(check => check.id === "survival-curve-artifact")?.status).toBe("pass");
    expect(logRankQa.checks.find(check => check.id === "survival-risk-table-artifact")?.status).toBe("pass");
    expect(logRankQa.checks.find(check => check.id === "survival-rmst-artifact")?.status).toBe("pass");

    const cifOut = path.join(dir, "cif-reliability");
    const cif = await researchStatsRunCommand({
      method: "aalen-johansen-cif",
      dataPath,
      outDir: cifOut,
      time: "time",
      event: "comp_event",
      group: "g",
      variables: [],
      covariates: [],
      exactCovariates: [],
      estimand: "ATT",
      matchRatio: 1,
      replacement: false,
      trimThreshold: 0.01,
      stabilizeWeights: true,
      surveyDesign: false,
      allowSurveyApproximation: false,
      alpha: 0.05,
      python,
    });
    expect(cif.status).toBe("succeeded");
    expect(cif.issues.map(issue => issue.code)).toContain("CIF_GROUP_CONTRAST_NONPARAMETRIC_APPROXIMATION");
    expect(cif.diagnostics).toMatchObject({
      test: "Aalen-Johansen cumulative incidence",
      events: expect.any(Number),
      competing_events: expect.any(Number),
      group_count: 2,
      cif_contrast_count: 1,
      cif_contrast_method: expect.stringContaining("bootstrap"),
      cif_horizon_rows: expect.any(Number),
      cif_horizon_summary: expect.objectContaining({
        status: "available",
        horizon_row_count: expect.any(Number),
        horizon_count: expect.any(Number),
        min_at_risk_at_horizon: expect.any(Number),
      }),
      artifacts: expect.objectContaining({
        cumulative_incidence_curve: expect.stringContaining("cumulative-incidence.csv"),
        cumulative_incidence_horizon_summary: expect.stringContaining("cumulative-incidence-horizon-summary.csv"),
        cumulative_incidence_contrasts: expect.stringContaining("cumulative-incidence-contrasts.csv"),
      }),
    });
    expect(cif.estimates.map(row => row.role)).toEqual(expect.arrayContaining([
      "cumulative_incidence_group_summary",
      "cumulative_incidence_group_contrast",
    ]));
    expect(cif.artifacts.some(artifact => artifact.kind === "table" && artifact.path.endsWith("cumulative-incidence-contrasts.csv"))).toBe(true);
    expect(cif.artifacts.some(artifact => artifact.kind === "table" && artifact.path.endsWith("cumulative-incidence-horizon-summary.csv"))).toBe(true);
    expect(cif.artifacts.some(artifact => artifact.kind === "figure" && artifact.path.endsWith("cumulative-incidence-horizon-summary.png"))).toBe(true);
    const cifHorizons = await readFile(path.join(cifOut, "cumulative-incidence-horizon-summary.csv"), "utf-8");
    expect(cifHorizons).toContain("cumulative_target_events");
    expect(cifHorizons).toContain("cumulative_competing_events");
    expect(cifHorizons).toContain("target_event_fraction_among_events");
    const cifContrasts = await readFile(path.join(cifOut, "cumulative-incidence-contrasts.csv"), "utf-8");
    expect(cifContrasts).toContain("permutation_p_value");
    expect(cifContrasts).toContain("not a Fine-Gray");
    const cifFigures = JSON.parse(await readFile(path.join(cifOut, "figures.json"), "utf-8")) as { figures: Array<{ path: string }> };
    expect(cifFigures.figures.map(figure => path.basename(figure.path))).toEqual(expect.arrayContaining(["cumulative-incidence.png", "cumulative-incidence-horizon-summary.png"]));
    const cifQa = JSON.parse(await readFile(path.join(cifOut, "stats-qa.json"), "utf-8")) as { checks: Array<{ id: string; status: string }> };
    expect(cifQa.checks.map(check => check.id)).toEqual(expect.arrayContaining([
      "competing-risk-accounting",
      "cif-group-contrast-artifact",
      "cif-horizon-summary-artifact",
      "cif-horizon-support",
      "cif-horizon-figure",
      "cif-fine-gray-boundary",
    ]));
    expect(cifQa.checks.find(check => check.id === "cif-group-contrast-artifact")?.status).toBe("pass");
    expect(cifQa.checks.find(check => check.id === "cif-horizon-summary-artifact")?.status).toBe("pass");
    expect(cifQa.checks.find(check => check.id === "cif-horizon-figure")?.status).toBe("pass");

    const fineGrayOut = path.join(dir, "fine-gray-reliability");
    const fineGray = await researchStatsRunCommand({
      method: "fine-gray",
      dataPath,
      outDir: fineGrayOut,
      time: "time",
      event: "comp_event",
      exposure: "x",
      covariates: ["g"],
      variables: [],
      exactCovariates: [],
      estimand: "ATT",
      matchRatio: 1,
      replacement: false,
      trimThreshold: 0.01,
      stabilizeWeights: true,
      surveyDesign: false,
      allowSurveyApproximation: false,
      alpha: 0.05,
      python,
    });
    expect(fineGray.status).toBe("succeeded");
    expect(fineGray.runnerCapability).toMatchObject({ method: "fine-gray", status: "bounded_approximation" });
    expect(fineGray.resultPosture?.status).toBe("exploratory_standard_table");
    expect(fineGray.issues.map(issue => issue.code)).toContain("FINE_GRAY_LOCAL_APPROXIMATION");
    expect(fineGray.estimates.find(row => row.role === "fine_gray_subdistribution_hazard")).toMatchObject({
      subdistribution_hazard_ratio: expect.any(Number),
      p_value: expect.any(Number),
    });
    expect(fineGray.diagnostics).toMatchObject({
      test: "Fine-Gray subdistribution hazards",
      events: expect.any(Number),
      competing_events: expect.any(Number),
      fine_gray: expect.objectContaining({
        target_event_times: expect.any(Number),
        min_risk_set_n: expect.any(Number),
        approximation: "fine_gray_subdistribution_partial_likelihood_no_ipcw",
      }),
      artifacts: expect.objectContaining({
        fine_gray_model_frame: expect.stringContaining("fine-gray-model-frame.csv"),
        fine_gray_design_matrix: expect.stringContaining("fine-gray-design-matrix.csv"),
        fine_gray_risk_sets: expect.stringContaining("fine-gray-risk-sets.csv"),
        fine_gray_baseline_subdistribution: expect.stringContaining("fine-gray-baseline-subdistribution.csv"),
        fine_gray_predictions: expect.stringContaining("fine-gray-predictions.csv"),
        cumulative_incidence_curve: expect.stringContaining("cumulative-incidence.csv"),
      }),
    });
    expect(fineGray.artifacts.some(artifact => artifact.kind === "table" && artifact.path.endsWith("fine-gray-model-frame.csv"))).toBe(true);
    expect(fineGray.artifacts.some(artifact => artifact.kind === "table" && artifact.path.endsWith("fine-gray-risk-sets.csv"))).toBe(true);
    expect(fineGray.artifacts.some(artifact => artifact.kind === "table" && artifact.path.endsWith("fine-gray-baseline-subdistribution.csv"))).toBe(true);
    expect(fineGray.artifacts.some(artifact => artifact.kind === "table" && artifact.path.endsWith("fine-gray-predictions.csv"))).toBe(true);
    await expect(readFile(path.join(fineGrayOut, "fine-gray-risk-sets.csv"), "utf-8")).resolves.toContain("retained_competing_events");
    await expect(readFile(path.join(fineGrayOut, "fine-gray-predictions.csv"), "utf-8")).resolves.toContain("predicted_cif_at_final_target_time");
    const fineGrayFigures = JSON.parse(await readFile(path.join(fineGrayOut, "figures.json"), "utf-8")) as { figures: Array<{ path: string }> };
    expect(fineGrayFigures.figures.map(figure => path.basename(figure.path))).toEqual(expect.arrayContaining([
      "fine-gray-subdistribution-hazards.png",
      "fine-gray-baseline-cif.png",
      "cumulative-incidence.png",
    ]));
    const fineGrayQa = JSON.parse(await readFile(path.join(fineGrayOut, "stats-qa.json"), "utf-8")) as { checks: Array<{ id: string; status: string }> };
    expect(fineGrayQa.checks.map(check => check.id)).toEqual(expect.arrayContaining([
      "competing-risk-accounting",
      "fine-gray-convergence",
      "fine-gray-risk-set-support",
      "fine-gray-artifacts",
      "fine-gray-approximation-boundary",
    ]));
    expect(fineGrayQa.checks.find(check => check.id === "fine-gray-artifacts")?.status).toBe("pass");
    expect(fineGrayQa.checks.find(check => check.id === "fine-gray-approximation-boundary")?.status).toBe("warning");

    const survivalOut = path.join(dir, "cox-reliability");
    const survival = await researchStatsRunCommand({
      method: "cox-proportional-hazards",
      dataPath,
      outDir: survivalOut,
      time: "time",
      event: "event",
      exposure: "x",
      covariates: ["g"],
      variables: [],
      exactCovariates: [],
      estimand: "ATT",
      matchRatio: 1,
      replacement: false,
      trimThreshold: 0.01,
      stabilizeWeights: true,
      surveyDesign: false,
      allowSurveyApproximation: false,
      alpha: 0.05,
      python,
    });
    expect(survival.status).toBe("succeeded");
    expect(survival.diagnostics).toMatchObject({
      events: expect.any(Number),
      censored: expect.any(Number),
      events_per_predictor: expect.any(Number),
      harrell_c_index: expect.any(Number),
      concordance_comparable_pairs: expect.any(Number),
      tied_event_times: expect.any(Number),
      risk_score_summary: expect.objectContaining({
        rows: expect.any(Number),
        risk_strata_rows: expect.any(Number),
        median: expect.any(Number),
      }),
      proportional_hazards_check: expect.stringMatching(/pass|warning|underpowered|not_available/),
      proportional_hazards_diagnostic: expect.objectContaining({
        method: "time_interaction_approximation",
        status: expect.stringMatching(/pass|warning|underpowered|not_available/),
      }),
      schoenfeld_ph_diagnostic: expect.objectContaining({
        method: "schoenfeld_residual_trend",
        status: expect.stringMatching(/pass|warning|underpowered|not_available/),
      }),
      artifacts: expect.objectContaining({
        cox_ph_diagnostics: expect.stringContaining("cox-ph-diagnostics.csv"),
        cox_model_frame: expect.stringContaining("cox-model-frame.csv"),
        cox_design_matrix: expect.stringContaining("cox-design-matrix.csv"),
        cox_risk_scores: expect.stringContaining("cox-risk-scores.csv"),
        cox_risk_strata: expect.stringContaining("cox-risk-strata.csv"),
      }),
    });
    const phRows = (await readFile(path.join(survivalOut, "cox-ph-diagnostics.csv"), "utf-8")).trim().split("\n");
    expect(phRows.length).toBeGreaterThan(1);
    expect(phRows[0]).toContain("p_value");
    await expect(readFile(path.join(survivalOut, "cox-model-frame.csv"), "utf-8")).resolves.toContain("event");
    await expect(readFile(path.join(survivalOut, "cox-design-matrix.csv"), "utf-8")).resolves.toContain("analysis_row");
    await expect(readFile(path.join(survivalOut, "cox-risk-scores.csv"), "utf-8")).resolves.toContain("centered_relative_hazard");
    await expect(readFile(path.join(survivalOut, "cox-risk-strata.csv"), "utf-8")).resolves.toContain("event_fraction");
    expect(survival.artifacts.map(artifact => path.basename(artifact.path))).toEqual(expect.arrayContaining([
      "cox-model-frame.csv",
      "cox-design-matrix.csv",
      "cox-risk-scores.csv",
      "cox-risk-strata.csv",
    ]));
    const survivalQa = JSON.parse(await readFile(path.join(survivalOut, "stats-qa.json"), "utf-8")) as { checks: Array<{ id: string; status: string }> };
    expect(survivalQa.checks.map(check => check.id)).toEqual(expect.arrayContaining([
      "survival-event-count",
      "survival-censoring-context",
      "survival-events-per-predictor",
      "cox-model-frame-artifact",
      "cox-risk-score-artifact",
      "cox-risk-score-figure",
      "cox-schoenfeld-diagnostic",
      "cox-ph-diagnostic-artifact",
      "cox-discrimination-diagnostic",
      "cox-tie-burden",
      "cox-proportional-hazards-diagnostic",
      "cox-hazard-ratio-figure",
    ]));
    expect(survivalQa.checks.find(check => check.id === "cox-proportional-hazards-diagnostic")?.status).toMatch(/pass|warning/);
    expect(survivalQa.checks.find(check => check.id === "cox-ph-diagnostic-artifact")?.status).toBe("pass");
    expect(survivalQa.checks.find(check => check.id === "cox-hazard-ratio-figure")?.status).toBe("pass");
    expect(survivalQa.checks.find(check => check.id === "cox-model-frame-artifact")?.status).toBe("pass");
    expect(survivalQa.checks.find(check => check.id === "cox-risk-score-artifact")?.status).toBe("pass");
    const survivalFigures = JSON.parse(await readFile(path.join(survivalOut, "figures.json"), "utf-8")) as { figures: Array<{ path: string; title: string; sourceColumns: string[] }> };
    expect(survivalFigures.figures.map(figure => path.basename(figure.path))).toEqual(expect.arrayContaining(["cox-hazard-ratios.png", "cox-ph-diagnostics.png", "cox-risk-scores.png"]));
    expect(survivalFigures.figures.find(figure => path.basename(figure.path) === "cox-hazard-ratios.png")?.sourceColumns).toEqual(expect.arrayContaining(["time", "event", "x", "g"]));

    const tvDataPath = path.join(dir, "time-varying-cox.csv");
    const tvRows = ["subject,start,stop,event,tv_exposure,age"];
    for (let subject = 0; subject < 80; subject += 1) {
      const eventInterval = subject % 5 === 0 ? 1 : subject % 7 === 0 ? 2 : subject % 3 === 0 ? 3 : null;
      for (let interval = 0; interval < 3; interval += 1) {
        if (eventInterval !== null && interval + 1 > eventInterval) break;
        const start = interval;
        const stop = interval + 1;
        const event = eventInterval === interval + 1 ? 1 : 0;
        const tvExposure = (subject % 2) + interval * 0.25 + (subject % 5) * 0.04;
        const age = 45 + (subject % 25);
        tvRows.push([subject, start, stop, event, tvExposure.toFixed(4), age].join(","));
      }
    }
    await writeFile(tvDataPath, `${tvRows.join("\n")}\n`);
    const tvOut = path.join(dir, "time-varying-cox-start-stop");
    const tvCox = await researchStatsRunCommand({
      method: "time-varying-cox",
      dataPath: tvDataPath,
      outDir: tvOut,
      start: "start",
      stop: "stop",
      event: "event",
      id: "subject",
      exposure: "tv_exposure",
      covariates: ["age"],
      variables: [],
      exactCovariates: [],
      estimand: "ATT",
      matchRatio: 1,
      replacement: false,
      trimThreshold: 0.01,
      stabilizeWeights: true,
      surveyDesign: false,
      allowSurveyApproximation: false,
      alpha: 0.05,
      python,
    });
    expect(tvCox.status).toBe("succeeded");
    expect(tvCox.runnerCapability).toMatchObject({ method: "time-varying-cox", status: "executable" });
    expect(tvCox.runnerCapability?.reason).toContain("explicit start/stop interval-expanded Cox data");
    expect(tvCox.issues.map(issue => issue.code)).not.toContain("TIME_VARYING_COX_APPROXIMATION");
    expect(tvCox.issues.map(issue => issue.code)).not.toContain("TIME_VARYING_COX_ROBUST_VARIANCE_UNAVAILABLE");
    expect(tvCox.diagnostics).toMatchObject({
      test: "time-varying-cox",
      execution_mode: "counting_process_start_stop",
      cluster_robust_variance: expect.objectContaining({
        available: true,
        id: "subject",
      }),
      time_varying_cox: expect.objectContaining({
        start: "start",
        stop: "stop",
        id: "subject",
        interval_rows: expect.any(Number),
        subject_count: 80,
        subjects_with_multiple_intervals: expect.any(Number),
        invalid_intervals: 0,
        cluster_robust_variance: expect.objectContaining({ available: true }),
      }),
      artifacts: expect.objectContaining({
        cox_cluster_robust_variance: expect.stringContaining("cox-cluster-robust-variance.csv"),
        time_varying_cox_intervals: expect.stringContaining("time-varying-cox-intervals.csv"),
        time_varying_cox_subject_summary: expect.stringContaining("time-varying-cox-subject-summary.csv"),
      }),
    });
    expect(tvCox.estimates.find(row => row.term === "tv_exposure")).toMatchObject({
      hazard_ratio: expect.any(Number),
      p_value: expect.any(Number),
      variance_estimator: "subject_cluster_robust",
      cluster_robust_std_error: expect.any(Number),
      cluster_robust_p_value: expect.any(Number),
    });
    await expect(readFile(path.join(tvOut, "time-varying-cox-intervals.csv"), "utf-8")).resolves.toContain("start_time");
    await expect(readFile(path.join(tvOut, "time-varying-cox-subject-summary.csv"), "utf-8")).resolves.toContain("overlapping_intervals");
    await expect(readFile(path.join(tvOut, "cox-cluster-robust-variance.csv"), "utf-8")).resolves.toContain("cluster_robust_std_error");
    const tvFigures = JSON.parse(await readFile(path.join(tvOut, "figures.json"), "utf-8")) as { figures: Array<{ path: string; sourceColumns: string[] }> };
    expect(tvFigures.figures.map(figure => path.basename(figure.path))).toEqual(expect.arrayContaining(["time-varying-cox-hazard-ratios.png", "time-varying-cox-interval-support.png", "cox-risk-scores.png"]));
    expect(tvFigures.figures.find(figure => path.basename(figure.path) === "time-varying-cox-interval-support.png")?.sourceColumns).toEqual(expect.arrayContaining(["start", "stop", "event", "subject"]));
    const tvQa = JSON.parse(await readFile(path.join(tvOut, "stats-qa.json"), "utf-8")) as { checks: Array<{ id: string; status: string }> };
    expect(tvQa.checks.map(check => check.id)).toEqual(expect.arrayContaining([
      "time-varying-cox-execution-mode",
      "time-varying-cox-interval-artifacts",
      "time-varying-cox-interval-validity",
      "time-varying-cox-subject-support",
      "time-varying-cox-approximation-boundary",
      "time-varying-cox-cluster-robust-variance",
    ]));
    expect(tvQa.checks.find(check => check.id === "time-varying-cox-execution-mode")?.status).toBe("pass");
    expect(tvQa.checks.find(check => check.id === "time-varying-cox-interval-artifacts")?.status).toBe("pass");
    expect(tvQa.checks.find(check => check.id === "time-varying-cox-approximation-boundary")?.status).toBe("pass");
    expect(tvQa.checks.find(check => check.id === "time-varying-cox-cluster-robust-variance")?.status).toBe("pass");
    expect(tvQa.checks.find(check => check.id === "runner-capability-promotion-boundary")?.status).toBe("pass");
    const tvPacket = JSON.parse(await readFile(path.join(tvOut, "stats-run.json"), "utf-8")) as { runnerCapability?: { status: string; reason: string } };
    expect(tvPacket.runnerCapability).toMatchObject({ status: "executable", reason: expect.stringContaining("explicit start/stop") });
    const tvContract = JSON.parse(await readFile(path.join(tvOut, "method-contract.json"), "utf-8")) as { runnerCapability?: { status: string; reason: string } };
    expect(tvContract.runnerCapability).toMatchObject({ status: "executable", reason: expect.stringContaining("explicit start/stop") });

    const recurrentDataPath = path.join(dir, "recurrent-events.csv");
    await writeFile(recurrentDataPath, [
      "subject,arm,start,stop,interval_time,event,severity",
      ...Array.from({ length: 90 }, (_, index) => {
        const subject = Math.floor(index / 3);
        const visit = index % 3;
        const arm = subject % 2;
        const start = visit * 1.7 + (subject % 7) * 0.01;
        const intervalTimeValue = 0.9 + visit * 0.17 + arm * 0.05 + (subject % 5) * 0.015;
        const stop = start + intervalTimeValue;
        const intervalTime = intervalTimeValue.toFixed(2);
        const eventScore = (subject * 13 + visit * 7) % 17;
        const event = (subject % 10 === 0 || subject % 10 === 5) && visit < 2
          ? 1
          : eventScore < (arm === 1 ? 6 : 4) ? 1 : 0;
        const severity = 40 + (subject % 18) + visit * 0.7 + arm * 1.5 + (subject % 4) * 0.2;
        return `${subject},${arm},${start.toFixed(2)},${stop.toFixed(2)},${intervalTime},${event},${severity.toFixed(3)}`;
      }),
    ].join("\n"));
    const recurrentOut = path.join(dir, "recurrent-reliability");
    const recurrent = await researchStatsRunCommand({
      method: "recurrent-event-rate",
      dataPath: recurrentDataPath,
      outDir: recurrentOut,
      time: "interval_time",
      event: "event",
      group: "arm",
      id: "subject",
      variables: [],
      covariates: [],
      exactCovariates: [],
      estimand: "ATT",
      matchRatio: 1,
      replacement: false,
      trimThreshold: 0.01,
      stabilizeWeights: true,
      surveyDesign: false,
      allowSurveyApproximation: false,
      alpha: 0.05,
      python,
    });
    expect(recurrent.status).toBe("succeeded");
    expect(recurrent.issues.map(issue => issue.code)).toContain("RECURRENT_EVENT_RATE_AGGREGATE_ONLY");
    expect(recurrent.estimates.find(row => row.role === "recurrent_event_group_rate")).toMatchObject({
      events: expect.any(Number),
      person_time: expect.any(Number),
      rate: expect.any(Number),
      rate_ci_low: expect.any(Number),
      rate_ci_high: expect.any(Number),
      event_count_overdispersion_index: expect.any(Number),
    });
    expect(recurrent.estimates.find(row => row.role === "recurrent_event_rate_ratio")).toMatchObject({
      rate_ratio: expect.any(Number),
      rate_ratio_ci_low: expect.any(Number),
      rate_ratio_ci_high: expect.any(Number),
      method_note: expect.stringContaining("not a subject-level recurrent-event model"),
    });
    expect(recurrent.diagnostics).toMatchObject({
      rate_ci_method: "exact Poisson interval",
      rate_contrast_method: expect.stringContaining("Poisson"),
      unique_subjects: 30,
      group_count: 2,
      rate_contrast_count: 1,
      recurrent_event_subjects: expect.any(Number),
      max_event_count_overdispersion_index: expect.any(Number),
      model_boundary: expect.stringContaining("Aggregate event-rate"),
      artifacts: expect.objectContaining({
        recurrent_event_rate_summary: expect.stringContaining("recurrent-event-rate-summary.csv"),
        recurrent_event_subject_summary: expect.stringContaining("recurrent-event-subject-summary.csv"),
        recurrent_event_rate_contrasts: expect.stringContaining("recurrent-event-rate-contrasts.csv"),
      }),
    });
    expect(recurrent.artifacts.some(artifact => artifact.kind === "table" && artifact.path.endsWith("recurrent-event-rate-summary.csv"))).toBe(true);
    expect(recurrent.artifacts.some(artifact => artifact.kind === "table" && artifact.path.endsWith("recurrent-event-subject-summary.csv"))).toBe(true);
    expect(recurrent.artifacts.some(artifact => artifact.kind === "table" && artifact.path.endsWith("recurrent-event-rate-contrasts.csv"))).toBe(true);
    const recurrentSummary = await readFile(path.join(recurrentOut, "recurrent-event-rate-summary.csv"), "utf-8");
    expect(recurrentSummary).toContain("event_count_overdispersion_index");
    const recurrentContrasts = await readFile(path.join(recurrentOut, "recurrent-event-rate-contrasts.csv"), "utf-8");
    expect(recurrentContrasts).toContain("rate_ratio");
    const recurrentQa = JSON.parse(await readFile(path.join(recurrentOut, "stats-qa.json"), "utf-8")) as { checks: Array<{ id: string; status: string }> };
    expect(recurrentQa.checks.map(check => check.id)).toEqual(expect.arrayContaining([
      "recurrent-event-rate-artifacts",
      "recurrent-event-person-time-support",
      "recurrent-event-subject-support",
      "recurrent-event-overdispersion",
      "recurrent-event-rate-contrast-artifact",
      "recurrent-event-model-boundary",
      "recurrent-event-group-stability",
    ]));
    expect(recurrentQa.checks.find(check => check.id === "recurrent-event-rate-artifacts")?.status).toBe("pass");
    const recurrentFigures = JSON.parse(await readFile(path.join(recurrentOut, "figures.json"), "utf-8")) as { figures: Array<{ path: string; title: string; sourceColumns: string[] }> };
    expect(recurrentFigures.figures.map(figure => path.basename(figure.path))).toContain("recurrent-event-rate.png");

    const recurrentCoxOut = path.join(dir, "recurrent-cox-reliability");
    const recurrentCox = await researchStatsRunCommand({
      method: "recurrent-event-cox",
      dataPath: recurrentDataPath,
      outDir: recurrentCoxOut,
      start: "start",
      stop: "stop",
      event: "event",
      id: "subject",
      exposure: "arm",
      covariates: ["severity"],
      variables: [],
      exactCovariates: [],
      estimand: "ATT",
      matchRatio: 1,
      replacement: false,
      trimThreshold: 0.01,
      stabilizeWeights: true,
      surveyDesign: false,
      allowSurveyApproximation: false,
      alpha: 0.05,
      python,
    });
    expect(recurrentCox.status).toBe("succeeded");
    expect(recurrentCox.runnerCapability).toMatchObject({ method: "recurrent-event-cox", status: "bounded_approximation" });
    expect(recurrentCox.issues.map(issue => issue.code)).not.toContain("RECURRENT_EVENT_COX_ROBUST_VARIANCE_UNAVAILABLE");
    expect(recurrentCox.estimates.find(row => row.term === "arm")).toMatchObject({
      component: "andersen_gill",
      hazard_ratio: expect.any(Number),
      p_value: expect.any(Number),
      variance_estimator: "subject_cluster_robust",
      cluster_robust_std_error: expect.any(Number),
      cluster_robust_p_value: expect.any(Number),
    });
    expect(recurrentCox.diagnostics).toMatchObject({
      test: "recurrent-event-cox",
      execution_mode: "andersen_gill_start_stop",
      cluster_robust_variance: expect.objectContaining({
        available: true,
        id: "subject",
      }),
      recurrent_event_cox: expect.objectContaining({
        start: "start",
        stop: "stop",
        id: "subject",
        interval_rows: 90,
        subject_count: 30,
        recurrent_event_subjects: expect.any(Number),
        invalid_intervals: 0,
        model_boundary: expect.stringContaining("Andersen-Gill"),
        cluster_robust_variance: expect.objectContaining({ available: true }),
      }),
      artifacts: expect.objectContaining({
        cox_cluster_robust_variance: expect.stringContaining("cox-cluster-robust-variance.csv"),
        recurrent_event_cox_intervals: expect.stringContaining("recurrent-event-cox-intervals.csv"),
        recurrent_event_cox_subject_summary: expect.stringContaining("recurrent-event-cox-subject-summary.csv"),
      }),
    });
    expect(recurrentCox.artifacts.some(artifact => artifact.kind === "table" && artifact.path.endsWith("recurrent-event-cox-intervals.csv"))).toBe(true);
    expect(recurrentCox.artifacts.some(artifact => artifact.kind === "table" && artifact.path.endsWith("recurrent-event-cox-subject-summary.csv"))).toBe(true);
    expect(recurrentCox.artifacts.some(artifact => artifact.kind === "table" && artifact.path.endsWith("cox-cluster-robust-variance.csv"))).toBe(true);
    await expect(readFile(path.join(recurrentCoxOut, "recurrent-event-cox-intervals.csv"), "utf-8")).resolves.toContain("start_time");
    await expect(readFile(path.join(recurrentCoxOut, "recurrent-event-cox-subject-summary.csv"), "utf-8")).resolves.toContain("events");
    await expect(readFile(path.join(recurrentCoxOut, "cox-cluster-robust-variance.csv"), "utf-8")).resolves.toContain("cluster_robust_p_value");
    const recurrentCoxFigures = JSON.parse(await readFile(path.join(recurrentCoxOut, "figures.json"), "utf-8")) as { figures: Array<{ path: string; sourceColumns: string[] }> };
    expect(recurrentCoxFigures.figures.map(figure => path.basename(figure.path))).toEqual(expect.arrayContaining([
      "recurrent-event-cox-hazard-ratios.png",
      "recurrent-event-cox-interval-support.png",
      "recurrent-event-cox-subject-events.png",
      "cox-risk-scores.png",
    ]));
    expect(recurrentCoxFigures.figures.find(figure => path.basename(figure.path) === "recurrent-event-cox-subject-events.png")?.sourceColumns).toEqual(expect.arrayContaining(["start", "stop", "event", "subject"]));
    const recurrentCoxQa = JSON.parse(await readFile(path.join(recurrentCoxOut, "stats-qa.json"), "utf-8")) as { checks: Array<{ id: string; status: string }> };
    expect(recurrentCoxQa.checks.map(check => check.id)).toEqual(expect.arrayContaining([
      "recurrent-event-cox-execution-mode",
      "recurrent-event-cox-interval-artifacts",
      "recurrent-event-cox-interval-validity",
      "recurrent-event-cox-subject-support",
      "recurrent-event-cox-event-burden",
      "recurrent-event-cox-cluster-robust-variance",
      "recurrent-event-cox-robust-variance-boundary",
    ]));
    expect(recurrentCoxQa.checks.find(check => check.id === "recurrent-event-cox-execution-mode")?.status).toBe("pass");
    expect(recurrentCoxQa.checks.find(check => check.id === "recurrent-event-cox-interval-artifacts")?.status).toBe("pass");
    expect(recurrentCoxQa.checks.find(check => check.id === "recurrent-event-cox-cluster-robust-variance")?.status).toBe("pass");

    const mixedOut = path.join(dir, "mixed-reliability");
    const mixed = await researchStatsRunCommand({
      method: "linear-mixed-model",
      dataPath,
      outDir: mixedOut,
      outcome: "y",
      exposure: "x",
      cluster: "cluster",
      covariates: ["g"],
      variables: [],
      exactCovariates: [],
      estimand: "ATT",
      matchRatio: 1,
      replacement: false,
      trimThreshold: 0.01,
      stabilizeWeights: true,
      surveyDesign: false,
      allowSurveyApproximation: false,
      alpha: 0.05,
      python,
    });
    expect(mixed.status).toBe("succeeded");
    expect(mixed.diagnostics).toMatchObject({
      clusters: expect.any(Number),
      random_intercept_variance: expect.any(Number),
      residual_variance: expect.any(Number),
      intraclass_correlation: expect.any(Number),
      residual_summary: expect.objectContaining({
        rows: expect.any(Number),
        mean_abs_residual: expect.any(Number),
      }),
      artifacts: expect.objectContaining({
        longitudinal_cluster_summary: expect.stringContaining("longitudinal-cluster-summary.csv"),
        longitudinal_model_frame: expect.stringContaining("longitudinal-model-frame.csv"),
        longitudinal_design_matrix: expect.stringContaining("longitudinal-design-matrix.csv"),
        longitudinal_fitted_values: expect.stringContaining("longitudinal-fitted-values.csv"),
        longitudinal_cluster_residuals: expect.stringContaining("longitudinal-cluster-residuals.csv"),
      }),
    });
    expect(mixed.artifacts.some(artifact => artifact.kind === "table" && artifact.path.endsWith("longitudinal-cluster-summary.csv"))).toBe(true);
    expect(mixed.artifacts.some(artifact => artifact.kind === "table" && artifact.path.endsWith("longitudinal-model-frame.csv"))).toBe(true);
    expect(mixed.artifacts.some(artifact => artifact.kind === "table" && artifact.path.endsWith("longitudinal-design-matrix.csv"))).toBe(true);
    expect(mixed.artifacts.some(artifact => artifact.kind === "table" && artifact.path.endsWith("longitudinal-fitted-values.csv"))).toBe(true);
    expect(mixed.artifacts.some(artifact => artifact.kind === "table" && artifact.path.endsWith("longitudinal-cluster-residuals.csv"))).toBe(true);
    const mixedClusterRows = (await readFile(path.join(mixedOut, "longitudinal-cluster-summary.csv"), "utf-8")).trim().split("\n");
    expect(mixedClusterRows.length).toBeGreaterThan(2);
    expect(mixedClusterRows[0]).toContain("observations");
    await expect(readFile(path.join(mixedOut, "longitudinal-model-frame.csv"), "utf-8")).resolves.toContain("fitted_value");
    await expect(readFile(path.join(mixedOut, "longitudinal-design-matrix.csv"), "utf-8")).resolves.toContain("analysis_row");
    await expect(readFile(path.join(mixedOut, "longitudinal-cluster-residuals.csv"), "utf-8")).resolves.toContain("mean_abs_residual");
    const mixedQa = JSON.parse(await readFile(path.join(mixedOut, "stats-qa.json"), "utf-8")) as { checks: Array<{ id: string; status: string }> };
    expect(mixedQa.checks.map(check => check.id)).toEqual(expect.arrayContaining([
      "longitudinal-cluster-summary-artifact",
      "longitudinal-model-frame-artifact",
      "longitudinal-fitted-values-artifact",
      "longitudinal-residual-summary",
      "longitudinal-observed-fitted-figure",
      "mixed-model-random-effect-variance",
    ]));
    expect(mixedQa.checks.find(check => check.id === "longitudinal-cluster-summary-artifact")?.status).toBe("pass");
    expect(mixedQa.checks.find(check => check.id === "longitudinal-model-frame-artifact")?.status).toBe("pass");
    expect(mixedQa.checks.find(check => check.id === "longitudinal-fitted-values-artifact")?.status).toBe("pass");
    const mixedFigures = JSON.parse(await readFile(path.join(mixedOut, "figures.json"), "utf-8")) as { figures: Array<{ path: string; title: string; sourceColumns: string[] }> };
    expect(mixedFigures.figures.map(figure => path.basename(figure.path))).toContain("longitudinal-cluster-size.png");
    expect(mixedFigures.figures.map(figure => path.basename(figure.path))).toContain("longitudinal-observed-vs-fitted.png");

    const longitudinalOut = path.join(dir, "gee-reliability");
    const longitudinal = await researchStatsRunCommand({
      method: "gee",
      dataPath,
      outDir: longitudinalOut,
      outcome: "y",
      exposure: "x",
      cluster: "cluster",
      covariates: ["g"],
      variables: [],
      exactCovariates: [],
      estimand: "ATT",
      matchRatio: 1,
      replacement: false,
      trimThreshold: 0.01,
      stabilizeWeights: true,
      surveyDesign: false,
      allowSurveyApproximation: false,
      alpha: 0.05,
      python,
    });
    expect(longitudinal.status).toBe("succeeded");
    expect(longitudinal.diagnostics).toMatchObject({
      clusters: expect.any(Number),
      min_observations_per_cluster: expect.any(Number),
      working_correlation: "exchangeable",
      dependence_parameter: expect.any(Number),
      residual_summary: expect.objectContaining({
        rows: expect.any(Number),
        mean_abs_residual: expect.any(Number),
      }),
      artifacts: expect.objectContaining({
        longitudinal_cluster_summary: expect.stringContaining("longitudinal-cluster-summary.csv"),
        longitudinal_model_frame: expect.stringContaining("longitudinal-model-frame.csv"),
        longitudinal_design_matrix: expect.stringContaining("longitudinal-design-matrix.csv"),
        longitudinal_fitted_values: expect.stringContaining("longitudinal-fitted-values.csv"),
        longitudinal_cluster_residuals: expect.stringContaining("longitudinal-cluster-residuals.csv"),
      }),
    });
    await expect(readFile(path.join(longitudinalOut, "longitudinal-fitted-values.csv"), "utf-8")).resolves.toContain("residual");
    const longitudinalQa = JSON.parse(await readFile(path.join(longitudinalOut, "stats-qa.json"), "utf-8")) as { checks: Array<{ id: string; status: string }> };
    expect(longitudinalQa.checks.map(check => check.id)).toEqual(expect.arrayContaining([
      "longitudinal-cluster-count",
      "longitudinal-observations-per-cluster",
      "longitudinal-cluster-summary-artifact",
      "longitudinal-model-frame-artifact",
      "longitudinal-fitted-values-artifact",
      "longitudinal-residual-summary",
      "longitudinal-observed-fitted-figure",
      "gee-working-correlation",
    ]));
    expect(longitudinalQa.checks.find(check => check.id === "longitudinal-cluster-summary-artifact")?.status).toBe("pass");
    expect(longitudinalQa.checks.find(check => check.id === "longitudinal-model-frame-artifact")?.status).toBe("pass");
    expect(longitudinalQa.checks.find(check => check.id === "longitudinal-fitted-values-artifact")?.status).toBe("pass");
    expect(longitudinalQa.checks.find(check => check.id === "gee-working-correlation")?.status).toBe("pass");

    const glmmOut = path.join(dir, "glmm-reliability");
    const glmm = await researchStatsRunCommand({
      method: "generalized-mixed-model",
      dataPath,
      outDir: glmmOut,
      outcome: "ybin",
      exposure: "x",
      cluster: "cluster",
      covariates: ["g"],
      variables: [],
      exactCovariates: [],
      estimand: "ATT",
      matchRatio: 1,
      replacement: false,
      trimThreshold: 0.01,
      stabilizeWeights: true,
      surveyDesign: false,
      allowSurveyApproximation: false,
      alpha: 0.05,
      python,
    });
    expect(glmm.status).toBe("succeeded");
    expect(glmm.issues.map(issue => issue.code)).not.toContain("GLMM_BACKEND_NOT_AVAILABLE");
    expect(glmm.issues.map(issue => issue.code)).toContain("GLMM_VARIATIONAL_BAYES_APPROXIMATION");
    expect(glmm.estimates.find(row => row.term === "x")).toMatchObject({
      estimate: expect.any(Number),
      std_error: expect.any(Number),
      odds_ratio: expect.any(Number),
      or_ci_low: expect.any(Number),
      or_ci_high: expect.any(Number),
    });
    expect(glmm.diagnostics).toMatchObject({
      backend: "statsmodels BinomialBayesMixedGLM",
      approximation: "variational_bayes",
      clusters: expect.any(Number),
      event_count: expect.any(Number),
      random_effect_count: expect.any(Number),
      residual_summary: expect.objectContaining({
        rows: expect.any(Number),
        mean_abs_residual: expect.any(Number),
      }),
      glmm_cluster_calibration: expect.objectContaining({
        clusters: expect.any(Number),
        mean_abs_cluster_calibration_error: expect.any(Number),
      }),
      glmm_random_effect_rows: expect.any(Number),
      glmm_cluster_calibration_rows: expect.any(Number),
      artifacts: expect.objectContaining({
        longitudinal_cluster_summary: expect.stringContaining("longitudinal-cluster-summary.csv"),
        longitudinal_model_frame: expect.stringContaining("longitudinal-model-frame.csv"),
        longitudinal_design_matrix: expect.stringContaining("longitudinal-design-matrix.csv"),
        longitudinal_fitted_values: expect.stringContaining("longitudinal-fitted-values.csv"),
        longitudinal_cluster_residuals: expect.stringContaining("longitudinal-cluster-residuals.csv"),
        glmm_random_effects: expect.stringContaining("glmm-random-effects.csv"),
        glmm_cluster_calibration: expect.stringContaining("glmm-cluster-calibration.csv"),
      }),
    });
    expect(glmm.artifacts.some(artifact => artifact.kind === "table" && artifact.path.endsWith("longitudinal-model-frame.csv"))).toBe(true);
    expect(glmm.artifacts.some(artifact => artifact.kind === "table" && artifact.path.endsWith("longitudinal-fitted-values.csv"))).toBe(true);
    expect(glmm.artifacts.some(artifact => artifact.kind === "table" && artifact.path.endsWith("longitudinal-cluster-residuals.csv"))).toBe(true);
    expect(glmm.artifacts.some(artifact => artifact.kind === "table" && artifact.path.endsWith("glmm-random-effects.csv"))).toBe(true);
    expect(glmm.artifacts.some(artifact => artifact.kind === "table" && artifact.path.endsWith("glmm-cluster-calibration.csv"))).toBe(true);
    await expect(readFile(path.join(glmmOut, "longitudinal-fitted-values.csv"), "utf-8")).resolves.toContain("fitted_value");
    await expect(readFile(path.join(glmmOut, "glmm-random-effects.csv"), "utf-8")).resolves.toContain("random_effect_mean");
    await expect(readFile(path.join(glmmOut, "glmm-cluster-calibration.csv"), "utf-8")).resolves.toContain("mean_fitted_probability");
    const glmmQa = JSON.parse(await readFile(path.join(glmmOut, "stats-qa.json"), "utf-8")) as { checks: Array<{ id: string; status: string }> };
    expect(glmmQa.checks.map(check => check.id)).toEqual(expect.arrayContaining([
      "longitudinal-cluster-count",
      "longitudinal-observations-per-cluster",
      "longitudinal-cluster-summary-artifact",
      "longitudinal-model-frame-artifact",
      "longitudinal-fitted-values-artifact",
      "longitudinal-residual-summary",
      "longitudinal-observed-fitted-figure",
      "glmm-random-effects-artifact",
      "glmm-cluster-calibration-artifact",
      "glmm-cluster-calibration",
      "glmm-optimization-status",
      "glmm-approximation-boundary",
      "estimate-ci-order",
      "estimate-within-ci",
    ]));
    expect(glmmQa.checks.find(check => check.id === "longitudinal-model-frame-artifact")?.status).toBe("pass");
    expect(glmmQa.checks.find(check => check.id === "longitudinal-fitted-values-artifact")?.status).toBe("pass");
    expect(glmmQa.checks.find(check => check.id === "glmm-random-effects-artifact")?.status).toBe("pass");
    expect(glmmQa.checks.find(check => check.id === "glmm-cluster-calibration-artifact")?.status).toBe("pass");
    expect(glmmQa.checks.find(check => check.id === "glmm-approximation-boundary")?.status).toBe("warning");
    const glmmFigures = JSON.parse(await readFile(path.join(glmmOut, "figures.json"), "utf-8")) as { figures: Array<{ path: string; title: string; sourceColumns: string[] }> };
    expect(glmmFigures.figures.map(figure => path.basename(figure.path))).toEqual(expect.arrayContaining([
      "longitudinal-cluster-size.png",
      "longitudinal-observed-vs-fitted.png",
      "glmm-cluster-calibration.png",
      "glmm-random-effects.png",
    ]));

    const repeatedPath = path.join(dir, "repeated-measures-balanced.csv");
    await writeFile(repeatedPath, [
      "subject,period,y",
      ...Array.from({ length: 36 }, (_, subject) => [0, 1, 2].map(period => {
        const y = 10 + subject * 0.08 + period * 0.65 + ((subject * 3 + period * 5) % 11) / 20;
        return `${subject},${period},${y.toFixed(4)}`;
      })).flat(),
    ].join("\n"));
    const repeatedOut = path.join(dir, "repeated-measures-reliability");
    const repeated = await researchStatsRunCommand({
      method: "repeated-measures-anova",
      dataPath: repeatedPath,
      outDir: repeatedOut,
      outcome: "y",
      exposure: "period",
      cluster: "subject",
      variables: [],
      covariates: [],
      exactCovariates: [],
      estimand: "ATT",
      matchRatio: 1,
      replacement: false,
      trimThreshold: 0.01,
      stabilizeWeights: true,
      surveyDesign: false,
      allowSurveyApproximation: false,
      alpha: 0.05,
      python,
    });
    expect(repeated.status).toBe("succeeded");
    expect(repeated.estimates.find(row => row.term === "period")).toMatchObject({
      f_statistic: expect.any(Number),
      df_num: expect.any(Number),
      df_den: expect.any(Number),
      p_value: expect.any(Number),
      greenhouse_geisser_epsilon: expect.any(Number),
      greenhouse_geisser_p_value: expect.any(Number),
      sphericity_status: expect.stringMatching(/pass|warning|not_required|not_available/),
    });
    expect(repeated.diagnostics).toMatchObject({
      test: "repeated-measures ANOVA",
      clusters: 36,
      within_levels: 3,
      duplicate_subject_within_rows: 0,
      source_rows: 108,
      cell_summary_rows: 3,
      greenhouse_geisser_epsilon: expect.any(Number),
      sphericity_diagnostic: expect.objectContaining({
        method: "mauchly_sphericity_approximation",
        status: expect.stringMatching(/pass|warning/),
        epsilon_greenhouse_geisser: expect.any(Number),
      }),
      artifacts: expect.objectContaining({
        repeated_measures_source: expect.stringContaining("repeated-measures-source.csv"),
        repeated_measures_cell_summary: expect.stringContaining("repeated-measures-cell-summary.csv"),
        repeated_measures_sphericity: expect.stringContaining("repeated-measures-sphericity.csv"),
      }),
    });
    expect(repeated.artifacts.some(artifact => artifact.kind === "table" && artifact.path.endsWith("repeated-measures-source.csv"))).toBe(true);
    expect(repeated.artifacts.some(artifact => artifact.kind === "table" && artifact.path.endsWith("repeated-measures-cell-summary.csv"))).toBe(true);
    expect(repeated.artifacts.some(artifact => artifact.kind === "table" && artifact.path.endsWith("repeated-measures-sphericity.csv"))).toBe(true);
    const repeatedSource = await readFile(path.join(repeatedOut, "repeated-measures-source.csv"), "utf-8");
    expect(repeatedSource).toContain("within_level");
    const repeatedCells = await readFile(path.join(repeatedOut, "repeated-measures-cell-summary.csv"), "utf-8");
    expect(repeatedCells).toContain("within_level");
    const repeatedSphericity = await readFile(path.join(repeatedOut, "repeated-measures-sphericity.csv"), "utf-8");
    expect(repeatedSphericity).toContain("epsilon_greenhouse_geisser");
    const repeatedQa = JSON.parse(await readFile(path.join(repeatedOut, "stats-qa.json"), "utf-8")) as { checks: Array<{ id: string; status: string }> };
    expect(repeatedQa.checks.map(check => check.id)).toEqual(expect.arrayContaining([
      "repeated-measures-source-artifacts",
      "repeated-measures-duplicate-subject-level",
      "repeated-measures-sphericity-diagnostic",
      "repeated-measures-sphericity-artifact",
      "repeated-measures-epsilon-correction",
    ]));
    expect(repeatedQa.checks.find(check => check.id === "repeated-measures-source-artifacts")?.status).toBe("pass");
    expect(repeatedQa.checks.find(check => check.id === "repeated-measures-duplicate-subject-level")?.status).toBe("pass");
    const repeatedFigures = JSON.parse(await readFile(path.join(repeatedOut, "figures.json"), "utf-8")) as { figures: Array<{ path: string; title: string; sourceColumns: string[] }> };
    expect(repeatedFigures.figures.map(figure => path.basename(figure.path))).toEqual(expect.arrayContaining(["longitudinal-cluster-size.png", "repeated-measures-profile.png"]));
  });

  it("profiles missingness mechanisms and records imputation, IPW, and sensitivity QA", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "agenteer-stats-missingness-"));
    const dataPath = path.join(dir, "missingness.csv");
    await writeFile(dataPath, [
      "y,x,g,z",
      ...Array.from({ length: 120 }, (_, index) => {
        const x = index / 10;
        const g = index % 2;
        const z = (index % 5) / 5;
        const y = 2 + x * 0.4 + g + z;
        const yCell = (index % 7 === 0 || (index > 75 && index % 4 === 0)) ? "" : y.toFixed(4);
        return `${yCell},${x.toFixed(3)},${g},${z.toFixed(3)}`;
      }),
    ].join("\n"));

    const summaryOut = path.join(dir, "missingness-summary");
    const summary = await researchStatsRunCommand({
      method: "missingness-summary",
      dataPath,
      outDir: summaryOut,
      variables: ["y", "x", "g", "z"],
      covariates: [],
      exactCovariates: [],
      estimand: "ATT",
      matchRatio: 1,
      replacement: false,
      trimThreshold: 0.01,
      stabilizeWeights: true,
      surveyDesign: false,
      allowSurveyApproximation: false,
      alpha: 0.05,
      python,
    });
    expect(summary.status).toBe("succeeded");
    expect(summary.diagnostics).toMatchObject({
      complete_case_fraction: expect.any(Number),
      max_missing_fraction: expect.any(Number),
      missingness_pattern_count: expect.any(Number),
      missingness_patterns_path: expect.stringContaining("missingness-patterns.csv"),
      missingness_mechanism_path: expect.stringContaining("missingness-mechanism-screen.csv"),
      mechanism_screen: expect.objectContaining({ comparisons: expect.any(Number) }),
    });
    expect(summary.artifacts.filter(artifact => artifact.kind === "table").map(artifact => path.basename(artifact.path))).toEqual(expect.arrayContaining([
      "estimates.csv",
      "missingness-patterns.csv",
      "missingness-indicator-correlations.csv",
      "missingness-mechanism-screen.csv",
    ]));
    const summaryQa = JSON.parse(await readFile(path.join(summaryOut, "stats-qa.json"), "utf-8")) as { checks: Array<{ id: string; status: string }> };
    expect(summaryQa.checks.map(check => check.id)).toEqual(expect.arrayContaining([
      "missingness-profile-present",
      "missingness-complete-case-retention",
      "missingness-variable-burden",
      "missingness-mechanism-screen",
    ]));

    const imputeOut = path.join(dir, "mice");
    const impute = await researchStatsRunCommand({
      method: "multiple-imputation-mice",
      dataPath,
      outDir: imputeOut,
      variables: ["y", "x", "g", "z"],
      covariates: [],
      exactCovariates: [],
      estimand: "ATT",
      matchRatio: 1,
      replacement: false,
      trimThreshold: 0.01,
      stabilizeWeights: true,
      imputations: 4,
      surveyDesign: false,
      allowSurveyApproximation: false,
      alpha: 0.05,
      python,
    });
    expect(impute.status).toBe("succeeded");
    expect(impute.runnerCapability?.status).toBe("bounded_approximation");
    expect(impute.resultPosture).toMatchObject({
      status: "exploratory_standard_table",
      label: "Exploratory bounded-runner result",
    });
    expect(impute.artifacts.some(artifact => artifact.kind === "imputed-data")).toBe(true);
    expect(impute.artifacts.filter(artifact => artifact.kind === "imputed-data").length).toBeGreaterThanOrEqual(4);
    expect(impute.artifacts.some(artifact => artifact.kind === "table" && artifact.path.endsWith("imputation-summary.csv"))).toBe(true);
    expect(impute.artifacts.some(artifact => artifact.kind === "table" && artifact.path.endsWith("imputation-distribution-check.csv"))).toBe(true);
    expect(impute.diagnostics).toMatchObject({
      imputed_data: expect.stringContaining("imputed-data.csv"),
      imputed_data_paths: expect.arrayContaining([
        expect.stringContaining("imputed-data-1.csv"),
        expect.stringContaining("imputed-data-4.csv"),
      ]),
      imputation_summary: expect.stringContaining("imputation-summary.csv"),
      imputation_distribution_check: expect.stringContaining("imputation-distribution-check.csv"),
      imputation_distribution_rows: expect.any(Number),
      max_abs_observed_imputed_smd: expect.any(Number),
      imputation_metadata: expect.objectContaining({
        numeric_only: true,
        imputations: 4,
        sample_posterior: true,
        pooling_status: "not_pooled_for_inference",
        included_variables: expect.arrayContaining(["y", "x", "g", "z"]),
      }),
    });
    expect(impute.issues.map(issue => issue.code)).toContain("IMPUTATION_NOT_POOLED_FOR_INFERENCE");
    expect(impute.estimates.find(row => row.term === "y")).toMatchObject({
      imputed_values: expect.any(Number),
      imputation_count: 4,
      mean_within_cell_imputation_sd: expect.any(Number),
      observed_imputed_smd: expect.any(Number),
      ks_statistic: expect.any(Number),
    });
    const imputationSummary = await readFile(path.join(imputeOut, "imputation-summary.csv"), "utf-8");
    expect(imputationSummary).toContain("mean_within_cell_imputation_sd");
    expect(imputationSummary).toContain("observed_imputed_smd");
    const imputationDistributionCheck = await readFile(path.join(imputeOut, "imputation-distribution-check.csv"), "utf-8");
    expect(imputationDistributionCheck).toContain("observed_imputed_smd");
    const imputeFigures = JSON.parse(await readFile(path.join(imputeOut, "figures.json"), "utf-8")) as { figures: Array<{ path: string; title: string; sourceColumns: string[] }> };
    expect(imputeFigures.figures.map(figure => path.basename(figure.path))).toContain("imputation-distribution-shift.png");
    const imputeQa = JSON.parse(await readFile(path.join(imputeOut, "stats-qa.json"), "utf-8")) as { checks: Array<{ id: string; status: string }> };
    expect(imputeQa.checks.map(check => check.id)).toEqual(expect.arrayContaining([
      "imputation-artifact-present",
      "imputation-dataset-count",
      "imputation-variability-recorded",
      "imputation-distribution-shift",
      "imputation-method-boundary",
    ]));
    expect(imputeQa.checks.find(check => check.id === "imputation-dataset-count")?.status).toBe("pass");
    expect(imputeQa.checks.find(check => check.id === "imputation-variability-recorded")?.status).toBe("pass");
    expect(imputeQa.checks.find(check => check.id === "imputation-distribution-shift")?.status).toMatch(/pass|warning/);

    const ipwOut = path.join(dir, "ipw");
    const ipw = await researchStatsRunCommand({
      method: "missingness-ipw",
      dataPath,
      outDir: ipwOut,
      outcome: "y",
      variables: ["y", "x", "g", "z"],
      covariates: ["x", "g", "z"],
      exactCovariates: [],
      estimand: "ATT",
      matchRatio: 1,
      replacement: false,
      trimThreshold: 0.01,
      stabilizeWeights: true,
      surveyDesign: false,
      allowSurveyApproximation: false,
      alpha: 0.05,
      python,
    });
    expect(ipw.status).toBe("succeeded");
    const ipwDecision = (ipw.diagnostics.preflight as { methodDecisionSupport?: { requestedRole?: string; verdict?: string; dataSignals?: Record<string, unknown>; primaryMethods?: Array<{ method: string }>; sensitivityMethods?: Array<{ method: string }> } }).methodDecisionSupport;
    expect(ipwDecision).toMatchObject({
      requestedRole: "sensitivity",
      verdict: "acceptable_sensitivity",
      dataSignals: expect.objectContaining({
        missingnessTargetVariable: "y",
        missingnessIpwSupported: true,
        missingnessIpwPredictorCount: 3,
      }),
    });
    expect(ipwDecision?.primaryMethods?.map(item => item.method)).toContain("missingness-summary");
    expect(ipwDecision?.sensitivityMethods?.map(item => item.method)).toEqual(expect.arrayContaining(["missingness-ipw", "multiple-imputation-mice", "complete-case-sensitivity", "mnar-sensitivity"]));
    expect(ipw.estimates[0]).toMatchObject({
      observed_fraction: expect.any(Number),
      min_prob_observed: expect.any(Number),
      max_ipw: expect.any(Number),
      effective_sample_size: expect.any(Number),
      effective_sample_size_fraction: expect.any(Number),
      model_sample_rows: expect.any(Number),
    });
    expect(ipw.artifacts.some(artifact => artifact.kind === "table" && artifact.path.endsWith("missingness-ipw.csv"))).toBe(true);
    expect(ipw.diagnostics).toMatchObject({
      weights: expect.stringContaining("missingness-ipw.csv"),
      max_ipw: expect.any(Number),
      effective_sample_size_fraction: expect.any(Number),
      observed_rows_in_missingness_model: expect.any(Number),
      missing_rows_in_missingness_model: expect.any(Number),
      missingness_ipw_weight_rows: expect.any(Number),
    });
    const ipwFigures = JSON.parse(await readFile(path.join(ipwOut, "figures.json"), "utf-8")) as { figures: Array<{ path: string; title: string }> };
    expect(ipwFigures.figures.map(figure => path.basename(figure.path))).toContain("missingness-ipw-weight-distribution.png");
    const ipwQa = JSON.parse(await readFile(path.join(ipwOut, "stats-qa.json"), "utf-8")) as { checks: Array<{ id: string; status: string }> };
    expect(ipwQa.checks.map(check => check.id)).toEqual(expect.arrayContaining([
      "missingness-ipw-artifact",
      "missingness-ipw-model-support",
      "missingness-ipw-stability",
      "missingness-ipw-effective-sample-size",
      "missingness-ipw-weight-figure",
    ]));
    expect(ipwQa.checks.find(check => check.id === "missingness-ipw-artifact")?.status).toBe("pass");
    expect(ipwQa.checks.find(check => check.id === "missingness-ipw-weight-figure")?.status).toBe("pass");

    const ipwNoMissingDataPath = path.join(dir, "ipw-no-missing.csv");
    await writeFile(ipwNoMissingDataPath, [
      "y,x,g,z",
      ...Array.from({ length: 24 }, (_, index) => `${10 + index / 10},${index % 5},${index % 2},${(index + 2) % 4}`),
    ].join("\n"));
    const ipwNoMissingOut = path.join(dir, "ipw-no-missing");
    const ipwNoMissing = await researchStatsRunCommand({
      method: "missingness-ipw",
      dataPath: ipwNoMissingDataPath,
      outDir: ipwNoMissingOut,
      outcome: "y",
      variables: ["y", "x", "g", "z"],
      covariates: ["x", "g", "z"],
      exactCovariates: [],
      estimand: "ATT",
      matchRatio: 1,
      replacement: false,
      trimThreshold: 0.01,
      stabilizeWeights: true,
      surveyDesign: false,
      allowSurveyApproximation: false,
      alpha: 0.05,
      python,
    });
    expect(ipwNoMissing.status).toBe("succeeded");
    const ipwNoMissingDecision = (ipwNoMissing.diagnostics.preflight as { methodDecisionSupport?: { requestedRole?: string; verdict?: string; dataSignals?: Record<string, unknown>; notRecommendedMethods?: Array<{ method: string }> } }).methodDecisionSupport;
    expect(ipwNoMissingDecision).toMatchObject({
      requestedRole: "not_recommended",
      verdict: "not_recommended",
      dataSignals: expect.objectContaining({
        missingnessTargetVariable: "y",
        missingnessTargetFraction: 0,
        missingnessIpwSupported: false,
      }),
    });
    expect(ipwNoMissingDecision?.notRecommendedMethods?.map(item => item.method)).toContain("missingness-ipw");
    expect(ipwNoMissing.issues.map(issue => issue.code)).toContain("MISSINGNESS_IPW_NO_OUTCOME_MISSING");
    expect(ipwNoMissing.estimates[0]).toMatchObject({
      max_ipw: 1,
      effective_sample_size_fraction: 1,
    });
    const ipwNoMissingQa = JSON.parse(await readFile(path.join(ipwNoMissingOut, "stats-qa.json"), "utf-8")) as { checks: Array<{ id: string; status: string }> };
    expect(ipwNoMissingQa.checks.find(check => check.id === "missingness-ipw-model-support")?.status).toBe("warning");

    const sensitivityOut = path.join(dir, "sensitivity");
    const sensitivity = await researchStatsRunCommand({
      method: "complete-case-sensitivity",
      dataPath,
      outDir: sensitivityOut,
      outcome: "y",
      variables: ["y", "x", "g", "z"],
      covariates: [],
      exactCovariates: [],
      estimand: "ATT",
      matchRatio: 1,
      replacement: false,
      trimThreshold: 0.01,
      stabilizeWeights: true,
      surveyDesign: false,
      allowSurveyApproximation: false,
      alpha: 0.05,
      python,
    });
    expect(sensitivity.status).toBe("succeeded");
    expect(sensitivity.estimates.map(row => row.term)).toEqual(expect.arrayContaining(["available_outcome", "complete_case_all_selected_variables"]));
    expect(sensitivity.artifacts.some(artifact => artifact.kind === "table" && artifact.path.endsWith("missingness-sensitivity.csv"))).toBe(true);
    expect(sensitivity.artifacts.some(artifact => artifact.kind === "figure" && artifact.path.endsWith("missingness-sensitivity.png"))).toBe(true);
    expect(sensitivity.diagnostics).toMatchObject({
      sensitivity_table: expect.stringContaining("missingness-sensitivity.csv"),
      sensitivity_scenario_count: expect.any(Number),
      sensitivity_mean_range: expect.any(Number),
      max_abs_shift_from_available: expect.any(Number),
      missingness_sensitivity_metadata: expect.objectContaining({
        outcome: "y",
        method: "complete-case-sensitivity",
        interpretation: expect.stringContaining("not proof"),
      }),
    });
    const sensitivityRows = await readFile(path.join(sensitivityOut, "missingness-sensitivity.csv"), "utf-8");
    expect(sensitivityRows).toContain("mean_difference_vs_available");
    expect(sensitivityRows).toContain("standardized_difference_vs_available");
    const sensitivityQa = JSON.parse(await readFile(path.join(sensitivityOut, "stats-qa.json"), "utf-8")) as { checks: Array<{ id: string; status: string }> };
    expect(sensitivityQa.checks.map(check => check.id)).toEqual(expect.arrayContaining([
      "missingness-sensitivity-scenarios",
      "missingness-sensitivity-artifact",
      "missingness-sensitivity-quantified",
      "missingness-sensitivity-shift",
    ]));
    expect(sensitivityQa.checks.find(check => check.id === "missingness-sensitivity-artifact")?.status).toBe("pass");

    const mnarOut = path.join(dir, "mnar");
    const mnar = await researchStatsRunCommand({
      method: "mnar-sensitivity",
      dataPath,
      outDir: mnarOut,
      outcome: "y",
      variables: ["y", "x", "g", "z"],
      covariates: [],
      exactCovariates: [],
      estimand: "ATT",
      matchRatio: 1,
      replacement: false,
      trimThreshold: 0.01,
      stabilizeWeights: true,
      surveyDesign: false,
      allowSurveyApproximation: false,
      alpha: 0.05,
      python,
    });
    expect(mnar.status).toBe("succeeded");
    const mnarDecision = (mnar.diagnostics.preflight as { methodDecisionSupport?: { requestedRole?: string; verdict?: string; dataSignals?: Record<string, unknown>; sensitivityMethods?: Array<{ method: string }> } }).methodDecisionSupport;
    expect(mnarDecision).toMatchObject({
      requestedRole: "sensitivity",
      verdict: "acceptable_sensitivity",
      dataSignals: expect.objectContaining({
        missingnessMnarSupported: true,
        missingnessTargetVariable: "y",
      }),
    });
    expect(mnarDecision?.sensitivityMethods?.map(item => item.method)).toContain("mnar-sensitivity");
    expect(mnar.estimates.map(row => row.term)).toEqual(expect.arrayContaining(["delta_-1", "delta_0", "delta_1"]));
    expect(mnar.diagnostics).toMatchObject({
      sensitivity_table: expect.stringContaining("missingness-sensitivity.csv"),
      sensitivity_scenario_count: 5,
      missingness_sensitivity_metadata: expect.objectContaining({
        method: "mnar-sensitivity",
        delta_sd_grid: expect.arrayContaining([-1, 0, 1]),
      }),
    });
    const mnarQa = JSON.parse(await readFile(path.join(mnarOut, "stats-qa.json"), "utf-8")) as { checks: Array<{ id: string; status: string }> };
    expect(mnarQa.checks.map(check => check.id)).toEqual(expect.arrayContaining([
      "missingness-sensitivity-artifact",
      "missingness-sensitivity-quantified",
      "missingness-sensitivity-shift",
    ]));
  });

  it("diagnoses binary logistic model support and low events-per-predictor in standalone model diagnostics", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "agenteer-binary-model-diagnostics-"));
    const dataPath = path.join(dir, "binary-diagnostics.csv");
    await writeFile(dataPath, [
      "outcome,exposure,age,score",
      ...Array.from({ length: 90 }, (_, index) => {
        const outcome = ((index * 37 + 11) % 100) < 28 ? 1 : 0;
        const exposure = index % 2;
        const age = 45 + (index % 22);
        const score = (index % 9) / 10;
        return `${outcome},${exposure},${age},${score}`;
      }),
    ].join("\n"));
    const run = await researchStatsRunCommand({
      method: "model-diagnostics",
      dataPath,
      outDir: path.join(dir, "model-diagnostics"),
      outcome: "outcome",
      exposure: "exposure",
      covariates: ["age", "score"],
      variables: ["outcome", "exposure", "age", "score"],
      exactCovariates: [],
      estimand: "ATT",
      matchRatio: 1,
      replacement: false,
      trimThreshold: 0.01,
      stabilizeWeights: true,
      surveyDesign: false,
      allowSurveyApproximation: false,
      alpha: 0.05,
      python,
    });

    expect(run.status).toBe("succeeded");
    expect(run.diagnostics).toMatchObject({
      test: "model-diagnostics",
      diagnosed_model_family: "logistic-regression",
      event_count: 25,
      non_event_count: 65,
      events_per_predictor_min_class: expect.any(Number),
      artifacts: expect.objectContaining({
        model_diagnostics: expect.stringContaining("model-diagnostics.csv"),
        residuals_table: expect.stringContaining("residuals.csv"),
        vif_table: expect.stringContaining("vif.csv"),
        regression_model_frame: expect.stringContaining("regression-model-frame.csv"),
        regression_design_matrix: expect.stringContaining("regression-design-matrix.csv"),
        regression_predictions: expect.stringContaining("regression-predictions.csv"),
      }),
    });
    expect(run.artifacts.some(artifact => artifact.path.endsWith("regression-model-frame.csv"))).toBe(true);
    expect(run.artifacts.some(artifact => artifact.path.endsWith("regression-design-matrix.csv"))).toBe(true);
    expect(run.artifacts.some(artifact => artifact.path.endsWith("regression-predictions.csv"))).toBe(true);
    expect(run.issues.map(issue => issue.code)).toContain("MODEL_DIAGNOSTICS_LOW_EVENTS_PER_PREDICTOR");
    expect(run.artifacts.map(artifact => artifact.kind)).toEqual(expect.arrayContaining(["model-diagnostics", "table", "figure"]));
    const runPreflight = run.diagnostics.preflight as { methodDecisionSupport?: { requestedRole?: string; verdict?: string; dataSignals?: Record<string, unknown>; primaryMethods?: Array<{ method: string }>; sensitivityMethods?: Array<{ method: string }> }; checks?: Array<{ id: string; status: string }> };
    expect(runPreflight.methodDecisionSupport).toMatchObject({
      requestedRole: "primary",
      verdict: "preferred",
      dataSignals: expect.objectContaining({
        modelDiagnosticsSupported: true,
        modelDiagnosticsDiagnosedFamily: "logistic-regression",
        modelDiagnosticsOutcomeVariable: "outcome",
        modelDiagnosticsExposureVariable: "exposure",
        modelDiagnosticsSparseSupport: true,
      }),
    });
    expect(runPreflight.checks?.map(check => check.id)).toEqual(expect.arrayContaining([
      "model-diagnostics-outcome-family",
      "model-diagnostics-parameter-support",
      "model-diagnostics-event-support",
    ]));
    const residuals = await readFile(path.join(dir, "model-diagnostics", "residuals.csv"), "utf-8");
    expect(residuals).toContain("absolute_residual");
    const diagnosticPredictions = await readFile(path.join(dir, "model-diagnostics", "regression-predictions.csv"), "utf-8");
    expect(diagnosticPredictions).toContain("probability_");
  });

  it("blocks unsupported standalone model diagnostics before fitting", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "agenteer-invalid-model-diagnostics-"));
    const dataPath = path.join(dir, "invalid-diagnostics.csv");
    await writeFile(dataPath, [
      "outcome,exposure",
      ...Array.from({ length: 60 }, (_, index) => {
        const outcome = index % 3 === 0 ? "home" : index % 3 === 1 ? "rehab" : "snf";
        const exposure = index % 2;
        return `${outcome},${exposure}`;
      }),
    ].join("\n"));

    const invalidOutcome = await researchStatsRunCommand({
      method: "model-diagnostics",
      dataPath,
      outDir: path.join(dir, "invalid-outcome"),
      outcome: "outcome",
      exposure: "exposure",
      covariates: [],
      variables: ["outcome", "exposure"],
      exactCovariates: [],
      estimand: "ATT",
      matchRatio: 1,
      replacement: false,
      trimThreshold: 0.01,
      stabilizeWeights: true,
      surveyDesign: false,
      allowSurveyApproximation: false,
      alpha: 0.05,
      python,
    });
    expect(invalidOutcome.status).toBe("failed");
    expect(invalidOutcome.issues.map(issue => issue.code)).toContain("STATS_MODEL_DIAGNOSTICS_OUTCOME_FAMILY_INVALID");
    const invalidPreflight = invalidOutcome.diagnostics.preflight as { methodDecisionSupport?: { requestedRole?: string; verdict?: string; dataSignals?: Record<string, unknown>; notRecommendedMethods?: Array<{ method: string }> }; checks?: Array<{ id: string; status: string }> };
    expect(invalidPreflight.methodDecisionSupport).toMatchObject({
      requestedRole: "not_recommended",
      verdict: "blocked",
      dataSignals: expect.objectContaining({
        modelDiagnosticsSupported: false,
        modelDiagnosticsDiagnosedFamily: null,
        modelDiagnosticsOutcomeVariable: "outcome",
      }),
    });
    expect(invalidPreflight.checks?.find(check => check.id === "model-diagnostics-outcome-family")?.status).toBe("block");

    const missingExposure = await researchStatsRunCommand({
      method: "model-diagnostics",
      dataPath,
      outDir: path.join(dir, "missing-exposure"),
      outcome: "outcome",
      covariates: [],
      variables: ["outcome"],
      exactCovariates: [],
      estimand: "ATT",
      matchRatio: 1,
      replacement: false,
      trimThreshold: 0.01,
      stabilizeWeights: true,
      surveyDesign: false,
      allowSurveyApproximation: false,
      alpha: 0.05,
      python,
    });
    expect(missingExposure.status).toBe("failed");
    expect(missingExposure.issues.map(issue => issue.code)).toContain("STATS_REQUIRED_ARGUMENT_MISSING");
    expect((missingExposure.diagnostics.preflight as { checks?: Array<{ id: string; status: string }> }).checks?.find(check => check.id === "required-method-arguments")?.status).toBe("block");
  });

  it("records heteroskedasticity evidence for ordinary linear models", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "agenteer-linear-heteroskedasticity-"));
    const dataPath = path.join(dir, "heteroskedastic.csv");
    const selectionPath = path.join(dir, "linear-method-selection.json");
    await writeFile(dataPath, [
      "y,x",
      ...Array.from({ length: 180 }, (_, index) => {
        const x = index / 10;
        const centeredPattern = [-2, -1, 0, 1, 2][index % 5];
        const noise = centeredPattern * (0.15 + x * 0.18);
        const y = -4 + x * 0.45 + noise;
        return `${y.toFixed(6)},${x.toFixed(6)}`;
      }),
    ].join("\n"));
    await researchMethodSelectCommand({
      question: "Estimate the linear association between x and a continuous outcome.",
      goal: "associate",
      outcomeType: "continuous",
      dataStructures: ["single_table"],
      outPath: selectionPath,
    });
    const base = {
      dataPath,
      outcome: "y",
      exposure: "x",
      variables: [],
      covariates: [],
      exactCovariates: [],
      estimand: "ATT" as const,
      matchRatio: 1,
      replacement: false,
      trimThreshold: 0.01,
      stabilizeWeights: true,
      surveyDesign: false,
      allowSurveyApproximation: false,
      alpha: 0.05,
      python,
    };

    const diagnostics = await researchStatsRunCommand({
      ...base,
      method: "model-diagnostics",
      outDir: path.join(dir, "model-diagnostics"),
    });
    expect(diagnostics.status).toBe("succeeded");
    expect(diagnostics.diagnostics).toMatchObject({
      diagnosed_model_family: "linear-regression",
      heteroskedasticity_screen: expect.objectContaining({
        status: "warning",
        method: "Breusch-Pagan test",
        p_value: expect.any(Number),
      }),
      breusch_pagan_p_value: expect.any(Number),
      residual_pattern_screen: expect.objectContaining({
        status: expect.stringMatching(/pass|warning|not_available/),
      }),
      qq_rows: expect.any(Number),
      artifacts: expect.objectContaining({
        qq_table: expect.stringContaining("model-qq.csv"),
      }),
    });
    expect((diagnostics.diagnostics.preflight as { methodDecisionSupport?: { requestedRole?: string; verdict?: string; dataSignals?: Record<string, unknown> } }).methodDecisionSupport).toMatchObject({
      requestedRole: "primary",
      verdict: "preferred",
      dataSignals: expect.objectContaining({
        modelDiagnosticsSupported: true,
        modelDiagnosticsDiagnosedFamily: "linear-regression",
        modelDiagnosticsSparseSupport: false,
      }),
    });
    expect(diagnostics.issues.map(issue => issue.code)).toContain("MODEL_DIAGNOSTICS_HETEROSKEDASTICITY");
    expect(diagnostics.artifacts.some(artifact => artifact.kind === "table" && artifact.path.endsWith("model-qq.csv"))).toBe(true);
    expect(diagnostics.artifacts.some(artifact => artifact.kind === "figure" && artifact.path.endsWith("model-qq.png"))).toBe(true);
    const diagnosticsQa = JSON.parse(await readFile(path.join(dir, "model-diagnostics", "stats-qa.json"), "utf-8")) as { checks: Array<{ id: string; status: string }> };
    expect(diagnosticsQa.checks.find(check => check.id === "model-heteroskedasticity")?.status).toBe("warning");
    expect(diagnosticsQa.checks.map(check => check.id)).toEqual(expect.arrayContaining([
      "model-residual-distribution",
      "model-residual-pattern",
      "model-qq-artifact",
    ]));

    const linear = await researchStatsRunCommand({
      ...base,
      method: "linear-regression",
      outDir: path.join(dir, "linear"),
      methodSelectionPath: selectionPath,
    });
    expect(linear.status).toBe("succeeded");
    expect(linear.binding.status).toBe("bound");
    expect(linear.resultPosture?.status).toBe("bound_standard_table");
    expect(linear.diagnostics).toMatchObject({
      heteroskedasticity_screen: expect.objectContaining({ status: "warning" }),
      breusch_pagan_p_value: expect.any(Number),
      robust_covariance: expect.objectContaining({ type: "HC3", available: true }),
      residual_pattern_screen: expect.objectContaining({
        status: expect.stringMatching(/pass|warning|not_available/),
      }),
      qq_rows: expect.any(Number),
      artifacts: expect.objectContaining({
        qq_table: expect.stringContaining("model-qq.csv"),
      }),
    });
    expect(linear.issues.map(issue => issue.code)).toContain("LINEAR_MODEL_HETEROSKEDASTICITY");
    expect(linear.artifacts.some(artifact => artifact.kind === "table" && artifact.path.endsWith("model-qq.csv"))).toBe(true);
    expect(linear.artifacts.some(artifact => artifact.kind === "figure" && artifact.path.endsWith("model-qq.png"))).toBe(true);
    expect(linear.estimates.find(row => row.term === "x")).toMatchObject({
      robust_covariance_type: "HC3",
      robust_hc3_std_error: expect.any(Number),
      robust_hc3_p_value: expect.any(Number),
      robust_hc3_ci_low: expect.any(Number),
      robust_hc3_ci_high: expect.any(Number),
    });
    const linearQa = JSON.parse(await readFile(path.join(dir, "linear", "stats-qa.json"), "utf-8")) as { checks: Array<{ id: string; status: string }> };
    expect(linearQa.checks.find(check => check.id === "model-heteroskedasticity")?.status).toBe("warning");
    expect(linearQa.checks.find(check => check.id === "model-residual-distribution")?.status).toMatch(/pass|warning/);
    expect(linearQa.checks.find(check => check.id === "model-residual-pattern")?.status).toMatch(/pass|warning/);
    expect(linearQa.checks.find(check => check.id === "model-qq-artifact")?.status).toBe("pass");
    expect(linearQa.checks.find(check => check.id === "linear-robust-se-sensitivity")?.status).toBe("pass");
    const linearManifest = await researchAnalysisManifestCommand({ runDir: path.join(dir, "linear") });
    expect(linearManifest.qaReadiness.warningChecks).toContain("model-heteroskedasticity");
    expect(linearManifest.readiness).toBe("exploratory_only");
    expect(linearManifest.nextAction).toContain("model-heteroskedasticity");
    await expect(researchAnalysisManifestCommand({ runDir: path.join(dir, "linear"), requireReady: true })).rejects.toThrow(/model-heteroskedasticity|not local_review_ready/i);

    const nonlinearPath = path.join(dir, "nonlinear.csv");
    await writeFile(nonlinearPath, [
      "y,x",
      ...Array.from({ length: 160 }, (_, index) => {
        const x = -4 + index * 0.05;
        const noise = [-0.04, -0.01, 0.02, 0.04, -0.02][index % 5];
        const y = 2 + 0.7 * x + 0.45 * x * x + noise;
        return `${y.toFixed(6)},${x.toFixed(6)}`;
      }),
    ].join("\n"));
    const nonlinear = await researchStatsRunCommand({
      ...base,
      dataPath: nonlinearPath,
      method: "linear-regression",
      outDir: path.join(dir, "linear-nonlinear-pattern"),
    });
    expect(nonlinear.status).toBe("succeeded");
    expect(nonlinear.diagnostics).toMatchObject({
      residual_pattern_screen: expect.objectContaining({
        status: "warning",
        quadratic_p_value: expect.any(Number),
        r_squared: expect.any(Number),
      }),
    });
    expect(nonlinear.issues.map(issue => issue.code)).toContain("LINEAR_MODEL_RESIDUAL_PATTERN");
    const nonlinearQa = JSON.parse(await readFile(path.join(dir, "linear-nonlinear-pattern", "stats-qa.json"), "utf-8")) as { checks: Array<{ id: string; status: string }> };
    expect(nonlinearQa.checks.find(check => check.id === "model-residual-pattern")?.status).toBe("warning");
  });

  it("surfaces causal design warnings with actionable manifest details", async () => {
    const { dir, dataPath } = await writeStatsFixture();
    const outDir = path.join(dir, "causal-manifest-psm");
    const result = await researchStatsRunCommand({
      method: "propensity-score-matching",
      dataPath,
      outDir,
      outcome: "y",
      exposure: "treat",
      covariates: ["x", "cat"],
      variables: [],
      exactCovariates: [],
      estimand: "ATT",
      matchRatio: 1,
      replacement: false,
      caliper: 0.8,
      trimThreshold: 0.01,
      stabilizeWeights: true,
      surveyDesign: false,
      allowSurveyApproximation: false,
      alpha: 0.05,
      python,
    });
    expect(result.status).toBe("succeeded");

    const manifest = await researchAnalysisManifestCommand({ runDir: outDir });
    expect(manifest.readiness).toBe("exploratory_only");
    expect(manifest.qaReadiness.warningChecks).toEqual(expect.arrayContaining([
      "temporality",
      "unmeasured-confounding-sensitivity",
    ]));
    expect(manifest.qaReadiness.criticalWarningChecks).toEqual(expect.arrayContaining([
      "temporality",
      "unmeasured-confounding-sensitivity",
    ]));
    expect(manifest.qaReadiness.warningCounts.critical).toBeGreaterThanOrEqual(2);
    expect(manifest.qaReadiness.warningCounts.total).toBe(manifest.qaReadiness.warningChecks.length);
    expect(manifest.qaReadiness.advisoryWarningChecks).not.toContain("temporality");
    expect(manifest.qaReadiness.warningDetails["temporality"]?.join(" ")).toContain("Treatment/index time");
    expect(manifest.qaReadiness.warningDetails["unmeasured-confounding-sensitivity"]?.join(" ")).toContain("No linked unmeasured-confounding");
    expect(manifest.nextAction).toContain("temporality");
    expect(manifest.nextAction).toContain("Treatment/index time");
    expect(manifest.nextAction).toContain("unmeasured-confounding-sensitivity");
    expect(manifest.nextAction).toContain("No linked unmeasured-confounding");
    await expect(researchAnalysisManifestCommand({ runDir: outDir, requireReady: true })).rejects.toThrow(/temporality|unmeasured-confounding-sensitivity|not local_review_ready/i);
  });

  it("surfaces quasi-experimental design-review warnings with manifest details", async () => {
    const { dir, dataPath } = await writeStatsFixture();
    const outDir = path.join(dir, "causal-manifest-did");
    const result = await researchStatsRunCommand({
      method: "difference-in-differences",
      dataPath,
      outDir,
      outcome: "y",
      exposure: "treat",
      post: "post",
      covariates: ["x"],
      variables: [],
      exactCovariates: [],
      estimand: "ATT",
      matchRatio: 1,
      replacement: false,
      trimThreshold: 0.01,
      stabilizeWeights: true,
      surveyDesign: false,
      allowSurveyApproximation: false,
      alpha: 0.05,
      python,
    });
    expect(result.status).toBe("succeeded");

    const manifest = await researchAnalysisManifestCommand({ runDir: outDir });
    expect(manifest.readiness).toBe("exploratory_only");
    expect(manifest.qaReadiness.warningChecks).toEqual(expect.arrayContaining([
      "did-parallel-trends-review",
      "temporality",
    ]));
    expect(manifest.qaReadiness.criticalWarningChecks).toEqual(expect.arrayContaining([
      "did-parallel-trends-review",
      "temporality",
    ]));
    expect(manifest.qaReadiness.warningCounts.critical).toBeGreaterThanOrEqual(2);
    expect(manifest.qaReadiness.warningDetails["did-parallel-trends-review"]?.join(" ")).toContain("Parallel trends review");
    expect(manifest.nextAction).toContain("did-parallel-trends-review");
    expect(manifest.nextAction).toContain("Parallel trends review");
    await expect(researchAnalysisManifestCommand({ runDir: outDir, requireReady: true })).rejects.toThrow(/did-parallel-trends-review|not local_review_ready/i);
  });

  it("surfaces non-causal scientific-readiness warnings in manifest readiness", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "agenteer-measurement-manifest-"));
    const dataPath = path.join(dir, "bland-altman-proportional-bias.csv");
    await writeFile(dataPath, [
      "method_a,method_b",
      ...Array.from({ length: 80 }, (_, index) => {
        const methodA = 10 + index * 0.7;
        const difference = methodA * 0.12 + ((index % 5) - 2) * 0.03;
        const methodB = methodA - difference;
        return `${methodA.toFixed(4)},${methodB.toFixed(4)}`;
      }),
    ].join("\n"));
    const outDir = path.join(dir, "measurement-manifest-bland-altman");
    const result = await researchStatsRunCommand({
      method: "bland-altman",
      dataPath,
      outDir,
      variables: ["method_a", "method_b"],
      covariates: [],
      exactCovariates: [],
      estimand: "ATT",
      matchRatio: 1,
      replacement: false,
      trimThreshold: 0.01,
      stabilizeWeights: true,
      surveyDesign: false,
      allowSurveyApproximation: false,
      alpha: 0.05,
      python,
    });
    expect(result.status).toBe("succeeded");

    const manifest = await researchAnalysisManifestCommand({ runDir: outDir });
    expect(manifest.readiness).toBe("exploratory_only");
    expect(manifest.qaReadiness.warningChecks).toContain("agreement-proportional-bias");
    expect(manifest.qaReadiness.criticalWarningChecks).toContain("agreement-proportional-bias");
    expect(manifest.qaReadiness.warningCounts.critical).toBeGreaterThanOrEqual(1);
    expect(manifest.qaReadiness.advisoryWarningChecks).not.toContain("agreement-proportional-bias");
    expect(manifest.qaReadiness.warningDetails["agreement-proportional-bias"]?.join(" ")).toContain("Proportional-bias screen flagged");
    expect(manifest.nextAction).toContain("agreement-proportional-bias");
    expect(manifest.nextAction).toContain("Proportional-bias screen flagged");
    await expect(researchAnalysisManifestCommand({ runDir: outDir, requireReady: true })).rejects.toThrow(/agreement-proportional-bias|not local_review_ready/i);
  });

  it("records causal design diagnostics, artifacts, and assumption QA gates", async () => {
    const { dir, dataPath } = await writeStatsFixture();

    const overlapOut = path.join(dir, "causal-overlap");
    const overlap = await researchStatsRunCommand({
      method: "overlap-weighting",
      dataPath,
      outDir: overlapOut,
      outcome: "y",
      exposure: "treat",
      covariates: ["x", "cat"],
      variables: [],
      exactCovariates: [],
      estimand: "ATT",
      matchRatio: 1,
      replacement: false,
      trimThreshold: 0.01,
      stabilizeWeights: true,
      surveyDesign: false,
      allowSurveyApproximation: false,
      alpha: 0.05,
      python,
    });
    expect(overlap.status).toBe("succeeded");
    expect(overlap.runnerCapability?.status).toBe("bounded_approximation");
    expect(overlap.resultPosture).toMatchObject({
      status: "causal_design_review_required",
      label: "Bounded causal-design approximation",
    });
    expect(overlap.diagnostics).toMatchObject({
      treatment: expect.objectContaining({ treated_n: expect.any(Number), control_n: expect.any(Number) }),
      propensity_model: expect.objectContaining({ propensity_min: expect.any(Number), propensity_max: expect.any(Number) }),
      balance: expect.objectContaining({ max_abs_smd_after: expect.any(Number) }),
      positivity: expect.objectContaining({ common_support_fraction: expect.any(Number) }),
      effective_sample_size: expect.any(Number),
      effective_sample_size_fraction: expect.any(Number),
      max_weight: expect.any(Number),
      weight_p99: expect.any(Number),
      artifacts: expect.objectContaining({
        balance: expect.stringContaining("balance.csv"),
        weights: expect.stringContaining("causal-weights.csv"),
        causal_weight_summary: expect.stringContaining("causal-weight-summary.csv"),
        propensity_overlap: expect.stringContaining("propensity-overlap.csv"),
      }),
    });
    expect(overlap.artifacts.map(artifact => artifact.kind)).toEqual(expect.arrayContaining(["balance", "weights", "propensity-overlap"]));
    expect(overlap.artifacts.some(artifact => artifact.kind === "table" && artifact.path.endsWith("causal-weight-summary.csv"))).toBe(true);
    const overlapDecision = (overlap.diagnostics.preflight as { methodDecisionSupport?: { requestedRole?: string; verdict?: string; dataSignals?: Record<string, unknown>; primaryMethods?: Array<{ method: string }>; sensitivityMethods?: Array<{ method: string }> } }).methodDecisionSupport;
    expect(overlapDecision).toMatchObject({
      requestedRole: "sensitivity",
      verdict: "acceptable_sensitivity",
      dataSignals: expect.objectContaining({
        causalDesignSupported: true,
        causalDesignFamily: "propensity",
        causalTreatmentVariable: "treat",
        causalCovariateCount: 2,
      }),
    });
    expect(overlapDecision?.primaryMethods?.map(candidate => candidate.method)).toEqual(expect.arrayContaining(["target-trial-emulation-spec", "propensity-score-weighting"]));
    expect(overlapDecision?.sensitivityMethods?.map(candidate => candidate.method)).toEqual(expect.arrayContaining(["overlap-weighting", "unmeasured-confounding-sensitivity"]));
    await expect(readFile(path.join(overlapOut, "causal-weight-summary.csv"), "utf-8")).resolves.toContain("effective_sample_size");
    expect(overlap.artifacts.map(artifact => artifact.kind)).toEqual(expect.arrayContaining(["figure", "figure-manifest", "figure-qa"]));
    const overlapFigures = JSON.parse(await readFile(path.join(overlapOut, "figures.json"), "utf-8")) as { figures: Array<{ path: string; title: string }> };
    expect(overlapFigures.figures.map(figure => path.basename(figure.path))).toEqual(expect.arrayContaining(["causal-love-plot.png", "causal-propensity-overlap.png", "causal-weight-distribution.png"]));
    const overlapQa = JSON.parse(await readFile(path.join(overlapOut, "stats-qa.json"), "utf-8")) as { checks: Array<{ id: string; status: string; detail?: string }> };
    expect(overlapQa.checks.map(check => check.id)).toEqual(expect.arrayContaining([
      "causal-design-boundary",
      "temporality",
      "no-post-treatment-adjustment",
      "unmeasured-confounding-sensitivity",
      "causal-balance-after-adjustment",
      "causal-positivity-support",
      "causal-effective-sample-size",
      "causal-weight-summary-artifact",
      "causal-weight-distribution-figure",
      "causal-weight-tail",
      "causal-effective-sample-size-fraction",
    ]));
    expect(overlapQa.checks.find(check => check.id === "causal-weight-summary-artifact")?.status).toBe("pass");
    expect(overlapQa.checks.find(check => check.id === "causal-weight-distribution-figure")?.status).toBe("pass");
    expect(overlapQa.checks.find(check => check.id === "method-contract-figure-coverage")).toMatchObject({
      status: "pass",
      detail: expect.stringContaining("causal-weight-distribution->causal-weight-distribution"),
    });
    expect(overlapQa.checks.find(check => check.id === "unmeasured-confounding-sensitivity")?.status).toBe("warning");

    const psmOut = path.join(dir, "causal-psm");
    const psm = await researchStatsRunCommand({
      method: "propensity-score-matching",
      dataPath,
      outDir: psmOut,
      outcome: "y",
      exposure: "treat",
      covariates: ["x", "cat"],
      variables: [],
      exactCovariates: [],
      estimand: "ATT",
      matchRatio: 1,
      replacement: false,
      caliper: 0.8,
      trimThreshold: 0.01,
      stabilizeWeights: true,
      surveyDesign: false,
      allowSurveyApproximation: false,
      alpha: 0.05,
      python,
    });
    expect(psm.status).toBe("succeeded");
    expect(psm.diagnostics).toMatchObject({
      matching: expect.objectContaining({
        quality: expect.objectContaining({
          matched_treated_fraction: expect.any(Number),
          max_logit_distance: expect.any(Number),
        }),
      }),
      artifacts: expect.objectContaining({
        matched_pairs: expect.stringContaining("matched-pairs.csv"),
        propensity_match_quality: expect.stringContaining("propensity-match-quality.csv"),
      }),
    });
    expect(psm.artifacts.some(artifact => artifact.kind === "table" && artifact.path.endsWith("propensity-match-quality.csv"))).toBe(true);
    const psmQuality = await readFile(path.join(psmOut, "propensity-match-quality.csv"), "utf-8");
    expect(psmQuality).toContain("matched_treated_fraction");
    const psmFigures = JSON.parse(await readFile(path.join(psmOut, "figures.json"), "utf-8")) as { figures: Array<{ path: string; title: string }> };
    expect(psmFigures.figures.map(figure => path.basename(figure.path))).toEqual(expect.arrayContaining(["propensity-love-plot.png", "propensity-overlap.png", "propensity-match-distances.png"]));
    const psmQa = JSON.parse(await readFile(path.join(psmOut, "stats-qa.json"), "utf-8")) as { checks: Array<{ id: string; status: string }> };
    expect(psmQa.checks.map(check => check.id)).toEqual(expect.arrayContaining([
      "temporality",
      "propensity-balance-artifact",
      "propensity-overlap-artifact",
      "propensity-match-quality-artifact",
      "propensity-match-retention",
      "propensity-match-distance",
      "unmeasured-confounding-sensitivity",
    ]));
    expect(psmQa.checks.find(check => check.id === "propensity-match-quality-artifact")?.status).toBe("pass");
    expect(psmQa.checks.find(check => check.id === "unmeasured-confounding-sensitivity")?.status).toBe("warning");

    const pswOut = path.join(dir, "causal-psw");
    const psw = await researchStatsRunCommand({
      method: "propensity-score-weighting",
      dataPath,
      outDir: pswOut,
      outcome: "y",
      exposure: "treat",
      covariates: ["x", "cat"],
      variables: [],
      exactCovariates: [],
      estimand: "ATE",
      matchRatio: 1,
      replacement: false,
      trimThreshold: 0.01,
      stabilizeWeights: true,
      surveyDesign: false,
      allowSurveyApproximation: false,
      alpha: 0.05,
      python,
    });
    expect(psw.status).toBe("succeeded");
    expect(psw.diagnostics).toMatchObject({
      weighting: expect.objectContaining({
        effective_sample_size: expect.any(Number),
        effective_sample_size_fraction: expect.any(Number),
        weight_p99: expect.any(Number),
      }),
      artifacts: expect.objectContaining({
        weights: expect.stringContaining("weights.csv"),
        propensity_weight_summary: expect.stringContaining("propensity-weight-summary.csv"),
      }),
    });
    expect(psw.artifacts.some(artifact => artifact.kind === "table" && artifact.path.endsWith("propensity-weight-summary.csv"))).toBe(true);
    const pswSummary = await readFile(path.join(pswOut, "propensity-weight-summary.csv"), "utf-8");
    expect(pswSummary).toContain("effective_sample_size");
    const pswFigures = JSON.parse(await readFile(path.join(pswOut, "figures.json"), "utf-8")) as { figures: Array<{ path: string; title: string }> };
    expect(pswFigures.figures.map(figure => path.basename(figure.path))).toEqual(expect.arrayContaining(["propensity-love-plot.png", "propensity-overlap.png", "propensity-weight-distribution.png"]));
    const pswQa = JSON.parse(await readFile(path.join(pswOut, "stats-qa.json"), "utf-8")) as { checks: Array<{ id: string; status: string }> };
    expect(pswQa.checks.map(check => check.id)).toEqual(expect.arrayContaining([
      "temporality",
      "propensity-treatment-orientation-evidence",
      "propensity-balance-artifact",
      "propensity-overlap-artifact",
      "propensity-weight-summary-artifact",
      "propensity-weight-tail",
      "propensity-weight-effective-sample-size-fraction",
      "unmeasured-confounding-sensitivity",
    ]));
    expect(pswQa.checks.find(check => check.id === "propensity-weight-summary-artifact")?.status).toBe("pass");
    expect(pswQa.checks.find(check => check.id === "propensity-treatment-orientation-evidence")?.status).toBe("pass");

    const aipwOut = path.join(dir, "causal-aipw");
    const aipw = await researchStatsRunCommand({
      method: "doubly-robust-aipw",
      dataPath,
      outDir: aipwOut,
      outcome: "y",
      exposure: "treat",
      covariates: ["x", "cat"],
      variables: [],
      exactCovariates: [],
      estimand: "ATT",
      matchRatio: 1,
      replacement: false,
      trimThreshold: 0.01,
      stabilizeWeights: true,
      surveyDesign: false,
      allowSurveyApproximation: false,
      alpha: 0.05,
      python,
    });
    expect(aipw.status).toBe("succeeded");
    expect(aipw.estimates.find(row => row.effect_measure === "AIPW mean difference")).toMatchObject({
      estimate: expect.any(Number),
      std_error: expect.any(Number),
      ci_low: expect.any(Number),
      ci_high: expect.any(Number),
      p_value: expect.any(Number),
    });
    expect(aipw.diagnostics).toMatchObject({
      effective_sample_size_fraction: expect.any(Number),
      weight_p99: expect.any(Number),
      outcome_model: expect.objectContaining({
        model: expect.stringContaining("outcome nuisance"),
      }),
      aipw: expect.objectContaining({
        estimate: expect.any(Number),
        std_error: expect.any(Number),
        contribution_rows: expect.any(Number),
        max_abs_influence: expect.any(Number),
      }),
      artifacts: expect.objectContaining({
        causal_weight_summary: expect.stringContaining("causal-weight-summary.csv"),
        aipw_nuisance_predictions: expect.stringContaining("aipw-nuisance-predictions.csv"),
        aipw_influence: expect.stringContaining("aipw-influence.csv"),
        aipw_component_summary: expect.stringContaining("aipw-component-summary.csv"),
      }),
    });
    expect(aipw.artifacts.some(artifact => artifact.kind === "table" && artifact.path.endsWith("causal-weight-summary.csv"))).toBe(true);
    expect(aipw.artifacts.some(artifact => artifact.kind === "table" && artifact.path.endsWith("aipw-nuisance-predictions.csv"))).toBe(true);
    expect(aipw.artifacts.some(artifact => artifact.kind === "table" && artifact.path.endsWith("aipw-influence.csv"))).toBe(true);
    expect(aipw.artifacts.some(artifact => artifact.kind === "table" && artifact.path.endsWith("aipw-component-summary.csv"))).toBe(true);
    await expect(readFile(path.join(aipwOut, "causal-weight-summary.csv"), "utf-8")).resolves.toContain("effective_sample_size");
    await expect(readFile(path.join(aipwOut, "aipw-nuisance-predictions.csv"), "utf-8")).resolves.toContain("aipw_contribution");
    await expect(readFile(path.join(aipwOut, "aipw-component-summary.csv"), "utf-8")).resolves.toContain("outcome_regression_contrast");
    const aipwFigures = JSON.parse(await readFile(path.join(aipwOut, "figures.json"), "utf-8")) as { figures: Array<{ path: string; title: string }> };
    expect(aipwFigures.figures.map(figure => path.basename(figure.path))).toEqual(expect.arrayContaining([
      "causal-love-plot.png",
      "causal-propensity-overlap.png",
      "causal-weight-distribution.png",
      "aipw-contribution-distribution.png",
    ]));
    const aipwQa = JSON.parse(await readFile(path.join(aipwOut, "stats-qa.json"), "utf-8")) as { checks: Array<{ id: string; status: string; detail?: string }> };
    expect(aipwQa.checks.map(check => check.id)).toEqual(expect.arrayContaining([
      "causal-treatment-orientation-evidence",
      "causal-balance-after-adjustment",
      "causal-positivity-support",
      "causal-effective-sample-size",
      "causal-weight-summary-artifact",
      "causal-weight-distribution-figure",
      "causal-weight-tail",
      "causal-effective-sample-size-fraction",
      "aipw-nuisance-artifacts",
      "aipw-influence-support",
      "aipw-standard-error",
      "aipw-contribution-figure",
    ]));
    expect(aipwQa.checks.find(check => check.id === "causal-treatment-orientation-evidence")?.status).toBe("pass");
    expect(aipwQa.checks.find(check => check.id === "causal-weight-summary-artifact")?.status).toBe("pass");
    expect(aipwQa.checks.find(check => check.id === "causal-weight-distribution-figure")?.status).toBe("pass");
    expect(aipwQa.checks.find(check => check.id === "method-contract-figure-coverage")).toMatchObject({
      status: "pass",
      detail: expect.stringContaining("causal-weight-distribution->causal-weight-distribution"),
    });
    expect(aipwQa.checks.find(check => check.id === "aipw-nuisance-artifacts")?.status).toBe("pass");
    expect(aipwQa.checks.find(check => check.id === "aipw-influence-support")?.status).toBe("pass");
    expect(aipwQa.checks.find(check => check.id === "aipw-standard-error")?.status).toBe("pass");

    const entropyOut = path.join(dir, "causal-entropy");
    const entropy = await researchStatsRunCommand({
      method: "entropy-balancing",
      dataPath,
      outDir: entropyOut,
      outcome: "y",
      exposure: "treat",
      covariates: ["x", "cat"],
      variables: [],
      exactCovariates: [],
      estimand: "ATT",
      matchRatio: 1,
      replacement: false,
      trimThreshold: 0.01,
      stabilizeWeights: true,
      surveyDesign: false,
      allowSurveyApproximation: false,
      alpha: 0.05,
      python,
    });
    expect(entropy.status).toBe("succeeded");
    expect(entropy.diagnostics).toMatchObject({
      optimized: expect.any(Boolean),
      optimizer: expect.objectContaining({
        method: "BFGS",
        objective: expect.any(Number),
      }),
      entropy_balance: expect.objectContaining({
        constraint_rows: expect.any(Number),
        max_abs_constraint_difference: expect.any(Number),
        mean_abs_constraint_difference: expect.any(Number),
      }),
      artifacts: expect.objectContaining({
        entropy_balance_constraints: expect.stringContaining("entropy-balance-constraints.csv"),
        weights: expect.stringContaining("causal-weights.csv"),
      }),
    });
    expect(entropy.artifacts.some(artifact => artifact.kind === "table" && artifact.path.endsWith("entropy-balance-constraints.csv"))).toBe(true);
    await expect(readFile(path.join(entropyOut, "entropy-balance-constraints.csv"), "utf-8")).resolves.toContain("weighted_control_mean");
    const entropyFigures = JSON.parse(await readFile(path.join(entropyOut, "figures.json"), "utf-8")) as { figures: Array<{ path: string; title: string }> };
    expect(entropyFigures.figures.map(figure => path.basename(figure.path))).toEqual(expect.arrayContaining([
      "entropy-balance-love-plot.png",
      "entropy-balance-constraints.png",
      "entropy-balance-weights.png",
    ]));
    const entropyQa = JSON.parse(await readFile(path.join(entropyOut, "stats-qa.json"), "utf-8")) as { checks: Array<{ id: string; status: string }> };
    expect(entropyQa.checks.map(check => check.id)).toEqual(expect.arrayContaining([
      "entropy-balance-constraint-artifact",
      "entropy-balance-constraint-fit",
      "entropy-balance-constraint-figure",
      "entropy-balance-weight-diagnostics",
    ]));
    expect(entropyQa.checks.find(check => check.id === "entropy-balance-constraint-artifact")?.status).toBe("pass");
    expect(entropyQa.checks.find(check => check.id === "entropy-balance-constraint-figure")?.status).toBe("pass");
    expect(entropyQa.checks.find(check => check.id === "entropy-balance-weight-diagnostics")?.status).toBe("pass");

    const didOut = path.join(dir, "causal-did");
    const did = await researchStatsRunCommand({
      method: "difference-in-differences",
      dataPath,
      outDir: didOut,
      outcome: "y",
      exposure: "treat",
      post: "post",
      covariates: ["x"],
      variables: [],
      exactCovariates: [],
      estimand: "ATT",
      matchRatio: 1,
      replacement: false,
      trimThreshold: 0.01,
      stabilizeWeights: true,
      surveyDesign: false,
      allowSurveyApproximation: false,
      alpha: 0.05,
      python,
    });
    expect(did.status).toBe("succeeded");
    expect(did.diagnostics).toMatchObject({
      treatment_period_table: expect.any(Object),
      treatment_period_cells: expect.any(Array),
      min_treatment_period_cell_n: expect.any(Number),
      parallel_trends_review_required: true,
      did_contrast: expect.objectContaining({
        contrast_rows: 1,
        has_model_interaction: true,
      }),
      artifacts: expect.objectContaining({
        did_cell_support: expect.stringContaining("did-cell-support.csv"),
        did_contrast_summary: expect.stringContaining("did-contrast-summary.csv"),
      }),
    });
    expect(did.artifacts.map(artifact => artifact.kind)).toEqual(expect.arrayContaining(["table", "figure"]));
    expect((did.diagnostics.preflight as { methodDecisionSupport?: { requestedRole?: string; verdict?: string; dataSignals?: Record<string, unknown>; primaryMethods?: Array<{ method: string }>; sensitivityMethods?: Array<{ method: string }> } }).methodDecisionSupport).toMatchObject({
      requestedRole: "primary",
      verdict: "preferred",
      dataSignals: expect.objectContaining({
        causalDesignSupported: true,
        causalDesignFamily: "did",
        causalTreatmentVariable: "treat",
        causalPostVariable: "post",
        causalPostLevelCount: 2,
      }),
    });
    const didSupport = await readFile(path.join(didOut, "did-cell-support.csv"), "utf-8");
    expect(didSupport).toContain("outcome_mean");
    const didContrast = await readFile(path.join(didOut, "did-contrast-summary.csv"), "utf-8");
    expect(didContrast).toContain("unadjusted_did");
    expect(didContrast).toContain("model_adjusted_did");
    const didFigures = JSON.parse(await readFile(path.join(didOut, "figures.json"), "utf-8")) as { figures: Array<{ path: string; title: string }> };
    expect(didFigures.figures.map(figure => path.basename(figure.path))).toContain("did-outcome-by-period.png");
    expect(didFigures.figures.map(figure => path.basename(figure.path))).toContain("did-contrast-summary.png");
    const didQa = JSON.parse(await readFile(path.join(didOut, "stats-qa.json"), "utf-8")) as { checks: Array<{ id: string; status: string }> };
    expect(didQa.checks.map(check => check.id)).toEqual(expect.arrayContaining([
      "causal-treatment-orientation-evidence",
      "did-cell-support",
      "did-parallel-trends-review",
      "did-support-artifact",
      "did-contrast-artifact",
      "did-estimand-term",
      "did-contrast-figure",
    ]));
    expect(didQa.checks.find(check => check.id === "causal-treatment-orientation-evidence")?.status).toBe("pass");
    expect(didQa.checks.find(check => check.id === "did-contrast-artifact")?.status).toBe("pass");
    expect(didQa.checks.find(check => check.id === "did-estimand-term")?.status).toBe("pass");
    expect(didQa.checks.find(check => check.id === "did-contrast-figure")?.status).toBe("pass");

    const eventStudyPath = path.join(dir, "event-study.csv");
    await writeFile(eventStudyPath, [
      "y,treat,period,x",
      ...[-2, -1, 0, 1, 2].flatMap(period => [0, 1].flatMap(treat => Array.from({ length: 20 }, (_, index) => {
        const x = (index % 7) / 10;
        const dynamicEffect = treat === 1 && period >= 0 ? 0.4 + period * 0.3 : 0;
        const y = 10 + period * 0.35 + treat * 0.25 + dynamicEffect + x * 0.2 + (index % 4) * 0.03;
        return `${y.toFixed(4)},${treat},${period},${x.toFixed(3)}`;
      }))),
    ].join("\n"));
    const eventStudyOut = path.join(dir, "causal-event-study");
    const eventStudy = await researchStatsRunCommand({
      method: "event-study-did",
      dataPath: eventStudyPath,
      outDir: eventStudyOut,
      outcome: "y",
      exposure: "treat",
      period: "period",
      covariates: ["x"],
      variables: [],
      exactCovariates: [],
      estimand: "ATT",
      matchRatio: 1,
      replacement: false,
      trimThreshold: 0.01,
      stabilizeWeights: true,
      surveyDesign: false,
      allowSurveyApproximation: false,
      alpha: 0.05,
      python,
    });
    expect(eventStudy.status).toBe("succeeded");
    expect(eventStudy.runnerCapability?.status).toBe("bounded_approximation");
    expect(eventStudy.resultPosture).toMatchObject({
      status: "causal_design_review_required",
      label: "Bounded causal-design approximation",
    });
    expect(eventStudy.issues.map(issue => issue.code)).not.toContain("EVENT_STUDY_ROUTE_IS_TWO_PERIOD_DID");
    expect(eventStudy.diagnostics).toMatchObject({
      test: "event-study DiD",
      event_study_model: expect.stringContaining("treatment-by-period interactions"),
      reference_period: -1,
      event_study_estimate_count: 4,
      pre_treatment_periods: 2,
      event_study_pretrend: expect.objectContaining({
        pre_treatment_periods: 2,
        testable_pretrend_estimates: 1,
      }),
      treatment_period_cells: expect.any(Array),
      min_treatment_period_cell_n: 20,
      parallel_trends_review_required: true,
      artifacts: expect.objectContaining({
        event_study_estimates: expect.stringContaining("event-study-estimates.csv"),
        event_study_period_support: expect.stringContaining("event-study-period-support.csv"),
        event_study_pretrend: expect.stringContaining("event-study-pretrend.csv"),
      }),
    });
    expect(eventStudy.estimates.filter(row => row.role === "event_time_interaction").map(row => row.event_time)).toEqual([-2, 0, 1, 2]);
    expect(eventStudy.artifacts.map(artifact => artifact.kind)).toEqual(expect.arrayContaining(["table", "figure"]));
    expect((eventStudy.diagnostics.preflight as { methodDecisionSupport?: { requestedRole?: string; verdict?: string; dataSignals?: Record<string, unknown> } }).methodDecisionSupport).toMatchObject({
      requestedRole: "primary",
      verdict: "preferred",
      dataSignals: expect.objectContaining({
        causalDesignSupported: true,
        causalDesignFamily: "event_study",
        causalTreatmentVariable: "treat",
        causalPeriodVariable: "period",
        causalPeriodLevelCount: 5,
      }),
    });
    const eventStudyEstimates = await readFile(path.join(eventStudyOut, "event-study-estimates.csv"), "utf-8");
    expect(eventStudyEstimates).toContain("reference_period");
    const eventStudySupport = await readFile(path.join(eventStudyOut, "event-study-period-support.csv"), "utf-8");
    expect(eventStudySupport).toContain("outcome_mean");
    const eventStudyPretrend = await readFile(path.join(eventStudyOut, "event-study-pretrend.csv"), "utf-8");
    expect(eventStudyPretrend).toContain("pretrend_signal");
    const eventStudyFigures = JSON.parse(await readFile(path.join(eventStudyOut, "figures.json"), "utf-8")) as { figures: Array<{ path: string; title: string; sourceColumns: string[] }> };
    expect(eventStudyFigures.figures.map(figure => path.basename(figure.path))).toContain("event-study.png");
    expect(eventStudyFigures.figures.map(figure => path.basename(figure.path))).toContain("event-study-period-support.png");
    expect(eventStudyFigures.figures.map(figure => path.basename(figure.path))).toContain("event-study-pretrend.png");
    const eventStudyQa = JSON.parse(await readFile(path.join(eventStudyOut, "stats-qa.json"), "utf-8")) as { checks: Array<{ id: string; status: string }> };
    expect(eventStudyQa.checks.map(check => check.id)).toEqual(expect.arrayContaining([
      "causal-treatment-orientation-evidence",
      "did-cell-support",
      "did-parallel-trends-review",
      "did-support-artifact",
      "event-study-coefficient-support",
      "event-study-period-support",
      "event-study-pretrend-review",
      "event-study-pretrend-artifact",
      "event-study-pretrend-screen",
      "event-study-pretrend-figure",
      "event-study-support-artifact",
    ]));
    expect(eventStudyQa.checks.find(check => check.id === "causal-treatment-orientation-evidence")?.status).toBe("pass");
    expect(eventStudyQa.checks.find(check => check.id === "event-study-pretrend-artifact")?.status).toBe("pass");
    expect(eventStudyQa.checks.find(check => check.id === "event-study-pretrend-figure")?.status).toBe("pass");

    const itsOut = path.join(dir, "causal-its");
    const its = await researchStatsRunCommand({
      method: "interrupted-time-series",
      dataPath,
      outDir: itsOut,
      outcome: "y",
      time: "time",
      post: "post",
      variables: [],
      covariates: [],
      exactCovariates: [],
      estimand: "ATT",
      matchRatio: 1,
      replacement: false,
      trimThreshold: 0.01,
      stabilizeWeights: true,
      surveyDesign: false,
      allowSurveyApproximation: false,
      alpha: 0.05,
      python,
    });
    expect(its.status).toBe("succeeded");
    expect(its.diagnostics).toMatchObject({
      pre_period_observations: expect.any(Number),
      post_period_observations: expect.any(Number),
      pre_period_time_points: expect.any(Number),
      post_period_time_points: expect.any(Number),
      unique_time_points: expect.any(Number),
      hac_maxlags: expect.any(Number),
      autocorrelation: expect.objectContaining({
        autocorrelation_lag_count: expect.any(Number),
      }),
      artifacts: expect.objectContaining({
        its_segment_support: expect.stringContaining("its-segment-support.csv"),
        its_time_trend: expect.stringContaining("its-time-trend.csv"),
        its_fitted_trend: expect.stringContaining("its-fitted-trend.csv"),
        its_autocorrelation: expect.stringContaining("its-autocorrelation.csv"),
      }),
    });
    expect((its.diagnostics.preflight as { methodDecisionSupport?: { requestedRole?: string; verdict?: string; dataSignals?: Record<string, unknown> } }).methodDecisionSupport).toMatchObject({
      requestedRole: "primary",
      verdict: "preferred",
      dataSignals: expect.objectContaining({
        causalDesignSupported: true,
        causalDesignFamily: "its",
        causalTimeVariable: "time",
        causalPostVariable: "post",
      }),
    });
    const itsFittedTrend = await readFile(path.join(itsOut, "its-fitted-trend.csv"), "utf-8");
    expect(itsFittedTrend).toContain("fitted_mean");
    const itsAutocorrelation = await readFile(path.join(itsOut, "its-autocorrelation.csv"), "utf-8");
    expect(itsAutocorrelation).toContain("autocorrelation");
    const itsFigures = JSON.parse(await readFile(path.join(itsOut, "figures.json"), "utf-8")) as { figures: Array<{ path: string; title: string }> };
    expect(itsFigures.figures.map(figure => path.basename(figure.path))).toContain("its-time-trend.png");
    expect(itsFigures.figures.map(figure => path.basename(figure.path))).toContain("its-fitted-trend.png");
    expect(itsFigures.figures.map(figure => path.basename(figure.path))).toContain("its-residual-autocorrelation.png");
    const itsQa = JSON.parse(await readFile(path.join(itsOut, "stats-qa.json"), "utf-8")) as { checks: Array<{ id: string; status: string }> };
    expect(itsQa.checks.map(check => check.id)).toContain("its-segment-support");
    expect(itsQa.checks.map(check => check.id)).toContain("its-time-point-support");
    expect(itsQa.checks.map(check => check.id)).toContain("its-trend-artifact");
    expect(itsQa.checks.map(check => check.id)).toContain("its-fitted-trend-artifact");
    expect(itsQa.checks.map(check => check.id)).toContain("its-autocorrelation-artifact");
    expect(itsQa.checks.map(check => check.id)).toContain("its-autocorrelation-screen");
    expect(itsQa.checks.find(check => check.id === "its-fitted-trend-artifact")?.status).toBe("pass");
    expect(itsQa.checks.find(check => check.id === "its-autocorrelation-artifact")?.status).toBe("pass");

    const rddOut = path.join(dir, "causal-rdd");
    const rdd = await researchStatsRunCommand({
      method: "regression-discontinuity",
      dataPath,
      outDir: rddOut,
      outcome: "y",
      runningVariable: "running",
      cutoff: 0,
      variables: [],
      covariates: ["x"],
      exactCovariates: [],
      estimand: "ATT",
      matchRatio: 1,
      replacement: false,
      trimThreshold: 0.01,
      stabilizeWeights: true,
      surveyDesign: false,
      allowSurveyApproximation: false,
      alpha: 0.05,
      python,
    });
    expect(rdd.status).toBe("succeeded");
    expect(rdd.diagnostics).toMatchObject({
      below_cutoff_n: expect.any(Number),
      above_cutoff_n: expect.any(Number),
      bandwidth_rule: expect.stringContaining("bandwidth"),
      local_linear_specification: expect.stringContaining("side-specific"),
      bandwidth_sensitivity_count: expect.any(Number),
      bandwidth_sensitivity_estimate_range: expect.any(Number),
      cutoff_density_min_p_value: expect.any(Number),
      cutoff_density_screen: expect.objectContaining({
        method: expect.stringContaining("symmetric-window"),
        status: expect.stringMatching(/pass|warning/),
      }),
      fitted_value_rows: expect.any(Number),
      covariate_continuity: expect.objectContaining({
        covariate_screen_count: expect.any(Number),
      }),
      artifacts: expect.objectContaining({
        rdd_running_support: expect.stringContaining("rdd-running-support.csv"),
        rdd_fitted_values: expect.stringContaining("rdd-fitted-values.csv"),
        rdd_bandwidth_sensitivity: expect.stringContaining("rdd-bandwidth-sensitivity.csv"),
        rdd_cutoff_density: expect.stringContaining("rdd-cutoff-density.csv"),
        rdd_covariate_continuity: expect.stringContaining("rdd-covariate-continuity.csv"),
      }),
    });
    expect(rdd.artifacts.some(artifact => artifact.kind === "table" && artifact.path.endsWith("rdd-fitted-values.csv"))).toBe(true);
    expect(rdd.artifacts.some(artifact => artifact.kind === "table" && artifact.path.endsWith("rdd-bandwidth-sensitivity.csv"))).toBe(true);
    expect(rdd.artifacts.some(artifact => artifact.kind === "table" && artifact.path.endsWith("rdd-cutoff-density.csv"))).toBe(true);
    expect(rdd.artifacts.some(artifact => artifact.kind === "table" && artifact.path.endsWith("rdd-covariate-continuity.csv"))).toBe(true);
    expect((rdd.diagnostics.preflight as { methodDecisionSupport?: { requestedRole?: string; verdict?: string; dataSignals?: Record<string, unknown> } }).methodDecisionSupport).toMatchObject({
      requestedRole: "primary",
      verdict: "preferred",
      dataSignals: expect.objectContaining({
        causalDesignSupported: true,
        causalDesignFamily: "rdd",
        causalRunningVariable: "running",
        causalRunningBelowCutoff: expect.any(Number),
        causalRunningAtOrAboveCutoff: expect.any(Number),
      }),
    });
    const rddFitted = await readFile(path.join(rddOut, "rdd-fitted-values.csv"), "utf-8");
    expect(rddFitted).toContain("fitted_value");
    const rddSensitivity = await readFile(path.join(rddOut, "rdd-bandwidth-sensitivity.csv"), "utf-8");
    expect(rddSensitivity).toContain("local_linear_side_specific_slope");
    const rddDensity = await readFile(path.join(rddOut, "rdd-cutoff-density.csv"), "utf-8");
    expect(rddDensity).toContain("binomial_balance_p_value");
    const rddCovariateContinuity = await readFile(path.join(rddOut, "rdd-covariate-continuity.csv"), "utf-8");
    expect(rddCovariateContinuity).toContain("flagged_discontinuity");
    const rddFigures = JSON.parse(await readFile(path.join(rddOut, "figures.json"), "utf-8")) as { figures: Array<{ path: string; title: string }> };
    expect(rddFigures.figures.map(figure => path.basename(figure.path))).toContain("rdd-running-support.png");
    expect(rddFigures.figures.map(figure => path.basename(figure.path))).toContain("rdd-fitted-support.png");
    expect(rddFigures.figures.map(figure => path.basename(figure.path))).toContain("rdd-bandwidth-sensitivity.png");
    expect(rddFigures.figures.map(figure => path.basename(figure.path))).toContain("rdd-covariate-continuity.png");
    const rddQa = JSON.parse(await readFile(path.join(rddOut, "stats-qa.json"), "utf-8")) as { checks: Array<{ id: string; status: string }> };
    expect(rddQa.checks.map(check => check.id)).toContain("rdd-cutoff-support");
    expect(rddQa.checks.map(check => check.id)).toContain("rdd-running-support-artifact");
    expect(rddQa.checks.map(check => check.id)).toEqual(expect.arrayContaining([
      "rdd-fitted-values-artifact",
      "rdd-bandwidth-sensitivity-artifact",
      "rdd-bandwidth-sensitivity-support",
      "rdd-cutoff-density-screen",
      "rdd-cutoff-density-artifact",
      "rdd-covariate-continuity-artifact",
      "rdd-covariate-continuity-screen",
    ]));
    expect(rddQa.checks.find(check => check.id === "rdd-fitted-values-artifact")?.status).toBe("pass");
    expect(rddQa.checks.find(check => check.id === "rdd-bandwidth-sensitivity-artifact")?.status).toBe("pass");
    expect(rddQa.checks.find(check => check.id === "rdd-cutoff-density-artifact")?.status).toBe("pass");
    expect(rddQa.checks.find(check => check.id === "rdd-covariate-continuity-artifact")?.status).toBe("pass");

    const ivOut = path.join(dir, "causal-iv");
    const iv = await researchStatsRunCommand({
      method: "instrumental-variables-2sls",
      dataPath,
      outDir: ivOut,
      outcome: "y",
      exposure: "treat",
      instrument: "instrument",
      covariates: ["x"],
      variables: [],
      exactCovariates: [],
      estimand: "ATT",
      matchRatio: 1,
      replacement: false,
      trimThreshold: 0.01,
      stabilizeWeights: true,
      surveyDesign: false,
      allowSurveyApproximation: false,
      alpha: 0.05,
      python,
    });
    expect(iv.status).toBe("succeeded");
    expect(iv.diagnostics).toMatchObject({
      first_stage_f_statistic: expect.any(Number),
      first_stage_partial_f_statistic: expect.any(Number),
      first_stage_partial_r_squared: expect.any(Number),
      first_stage_r_squared: expect.any(Number),
      first_stage_prediction_rmse: expect.any(Number),
      first_stage_residual_mean: expect.any(Number),
      first_stage_predicted_treatment_min: expect.any(Number),
      first_stage_predicted_treatment_max: expect.any(Number),
      reduced_form_instrument_p_value: expect.any(Number),
      endogeneity_residual_inclusion_p_value: expect.any(Number),
      analysis_frame_rows: expect.any(Number),
      exclusion_restriction_review_required: true,
      artifacts: expect.objectContaining({
        iv_first_stage: expect.stringContaining("iv-first-stage.csv"),
        iv_first_stage_support: expect.stringContaining("iv-first-stage-support.csv"),
        iv_reduced_form: expect.stringContaining("iv-reduced-form.csv"),
        iv_endogeneity_diagnostics: expect.stringContaining("iv-endogeneity-diagnostics.csv"),
        iv_covariate_balance: expect.stringContaining("iv-covariate-balance.csv"),
        iv_analysis_frame: expect.stringContaining("iv-analysis-frame.csv"),
      }),
    });
    expect((iv.diagnostics.preflight as { methodDecisionSupport?: { requestedRole?: string; verdict?: string; dataSignals?: Record<string, unknown> } }).methodDecisionSupport).toMatchObject({
      requestedRole: "primary",
      verdict: "preferred",
      dataSignals: expect.objectContaining({
        causalDesignSupported: true,
        causalDesignFamily: "iv",
        causalInstrumentVariable: "instrument",
        causalInstrumentLevelCount: 2,
      }),
    });
    await expect(readFile(path.join(ivOut, "iv-reduced-form.csv"), "utf-8")).resolves.toContain("reduced_form");
    await expect(readFile(path.join(ivOut, "iv-endogeneity-diagnostics.csv"), "utf-8")).resolves.toContain("durbin_wu_hausman_residual_inclusion_screen");
    await expect(readFile(path.join(ivOut, "iv-covariate-balance.csv"), "utf-8")).resolves.toContain("covariate");
    await expect(readFile(path.join(ivOut, "iv-analysis-frame.csv"), "utf-8")).resolves.toContain("first_stage_residual");
    expect(iv.artifacts.map(artifact => path.basename(artifact.path))).toEqual(expect.arrayContaining([
      "iv-reduced-form.csv",
      "iv-endogeneity-diagnostics.csv",
      "iv-covariate-balance.csv",
      "iv-analysis-frame.csv",
    ]));
    const ivFigures = JSON.parse(await readFile(path.join(ivOut, "figures.json"), "utf-8")) as { figures: Array<{ path: string; title: string }> };
    expect(ivFigures.figures.map(figure => path.basename(figure.path))).toEqual(expect.arrayContaining([
      "iv-first-stage-support.png",
      "iv-first-stage-observed-vs-predicted.png",
      "iv-reduced-form-coefficients.png",
      "iv-covariate-balance.png",
    ]));
    const ivQa = JSON.parse(await readFile(path.join(ivOut, "stats-qa.json"), "utf-8")) as { checks: Array<{ id: string; status: string }> };
    expect(ivQa.checks.map(check => check.id)).toEqual(expect.arrayContaining([
      "iv-first-stage-strength",
      "iv-exclusion-review",
      "iv-first-stage-artifact",
      "iv-first-stage-prediction-diagnostic",
      "iv-first-stage-figures",
      "iv-reduced-form-artifact",
      "iv-reduced-form-evidence",
      "iv-reduced-form-figure",
      "iv-endogeneity-diagnostic-artifact",
      "iv-analysis-frame-artifact",
      "iv-covariate-balance-artifact",
      "iv-instrument-covariate-balance",
      "iv-covariate-balance-figure",
    ]));
    expect(ivQa.checks.find(check => check.id === "iv-first-stage-prediction-diagnostic")?.status).toBe("pass");
    expect(ivQa.checks.find(check => check.id === "iv-first-stage-figures")?.status).toBe("pass");
    expect(ivQa.checks.find(check => check.id === "iv-reduced-form-figure")?.status).toBe("pass");
    expect(ivQa.checks.find(check => check.id === "iv-covariate-balance-figure")?.status).toBe("pass");

    const categoricalIvPath = path.join(dir, "categorical-iv.csv");
    const categoricalIvRows = ["y,treat,instrument_label,x"];
    for (let i = 0; i < 72; i++) {
      const x = (i % 12) / 10;
      const instrumentLabel = i % 2 === 0 ? "near" : "far";
      const instrumentShift = instrumentLabel === "near" ? 0.75 : 0.1;
      const treatValue = instrumentShift + 0.25 * x + ((i % 3) - 1) * 0.03;
      const y = 1.5 + 1.1 * treatValue + 0.4 * x + ((i % 5) - 2) * 0.02;
      categoricalIvRows.push([y.toFixed(5), treatValue.toFixed(5), instrumentLabel, x.toFixed(5)].join(","));
    }
    await writeFile(categoricalIvPath, `${categoricalIvRows.join("\n")}\n`);
    const categoricalIvOut = path.join(dir, "categorical-iv");
    const categoricalIv = await researchStatsRunCommand({
      method: "instrumental-variables-2sls",
      dataPath: categoricalIvPath,
      outDir: categoricalIvOut,
      outcome: "y",
      exposure: "treat",
      instrument: "instrument_label",
      covariates: ["x"],
      variables: [],
      exactCovariates: [],
      estimand: "ATT",
      matchRatio: 1,
      replacement: false,
      trimThreshold: 0.01,
      stabilizeWeights: true,
      surveyDesign: false,
      allowSurveyApproximation: false,
      alpha: 0.05,
      python,
    });
    expect(categoricalIv.status).toBe("succeeded");
    expect(categoricalIv.diagnostics).toMatchObject({
      instrument_term_count: expect.any(Number),
      first_stage_partial_f_statistic: expect.any(Number),
      artifacts: expect.objectContaining({
        iv_first_stage: expect.stringContaining("iv-first-stage.csv"),
        iv_analysis_frame: expect.stringContaining("iv-analysis-frame.csv"),
      }),
    });
    expect(categoricalIv.diagnostics.instrument_term_count).toBeGreaterThan(0);
    await expect(readFile(path.join(categoricalIvOut, "iv-first-stage.csv"), "utf-8")).resolves.toContain("instrument_label_");

    const targetTrialOut = path.join(dir, "target-trial");
    const targetTrial = await researchStatsRunCommand({
      method: "target-trial-emulation-spec",
      dataPath,
      outDir: targetTrialOut,
      outcome: "ybin",
      exposure: "treat",
      time: "time",
      id: "cluster",
      covariates: ["x", "cat"],
      variables: [],
      exactCovariates: [],
      estimand: "ATT",
      matchRatio: 1,
      replacement: false,
      trimThreshold: 0.01,
      stabilizeWeights: true,
      surveyDesign: false,
      allowSurveyApproximation: false,
      alpha: 0.05,
      python,
    });
    expect(targetTrial.status).toBe("succeeded");
    expect(targetTrial.resultPosture).toMatchObject({
      status: "causal_design_review_required",
      label: "Target-trial design review required",
    });
    expect(targetTrial.diagnostics).toMatchObject({
      test: "target trial emulation protocol",
      readiness_status: "design_review_ready",
      treatment_level_count: 2,
      min_treatment_level_n: expect.any(Number),
      outcome_support: expect.objectContaining({
        type: "binary",
        event_count: expect.any(Number),
        non_event_count: expect.any(Number),
      }),
      artifacts: expect.objectContaining({
        target_trial_protocol: expect.stringContaining("target-trial-protocol.json"),
        target_trial_report: expect.stringContaining("target-trial-protocol.md"),
        target_trial_checklist: expect.stringContaining("target-trial-checklist.csv"),
      }),
    });
    expect(targetTrial.artifacts.map(artifact => artifact.kind)).toEqual(expect.arrayContaining(["protocol", "report", "table"]));
    const targetTrialProtocol = JSON.parse(await readFile(path.join(targetTrialOut, "target-trial-protocol.json"), "utf-8")) as {
      kind: string;
      checklist: Array<{ item: string; status: string }>;
      recommended_primary_methods: string[];
    };
    expect(targetTrialProtocol.kind).toBe("target-trial-emulation-spec");
    expect(targetTrialProtocol.checklist.map(row => row.item)).toEqual(expect.arrayContaining([
      "eligibility_criteria",
      "treatment_strategies",
      "assignment_time_zero_and_follow_up",
      "outcome_definition",
      "adjustment_set",
      "positivity_support",
      "missingness_support",
      "sensitivity_analysis_plan",
    ]));
    expect(targetTrialProtocol.recommended_primary_methods.join(" ")).toMatch(/propensity|cox/i);
    const targetTrialQa = JSON.parse(await readFile(path.join(targetTrialOut, "stats-qa.json"), "utf-8")) as { checks: Array<{ id: string; status: string }> };
    expect(targetTrialQa.checks.map(check => check.id)).toEqual(expect.arrayContaining([
      "temporality",
      "unmeasured-confounding-sensitivity",
      "target-trial-required-items",
      "target-trial-protocol-artifact",
      "target-trial-treatment-support",
      "target-trial-time-zero",
      "target-trial-adjustment-set",
      "target-trial-emulation-gaps",
    ]));
    expect(targetTrialQa.checks.find(check => check.id === "temporality")?.status).toBe("pass");
    expect(targetTrialQa.checks.find(check => check.id === "unmeasured-confounding-sensitivity")?.status).toBe("warning");
    expect(targetTrialQa.checks.find(check => check.id === "target-trial-protocol-artifact")?.status).toBe("pass");
    const targetTrialReport = await readFile(path.join(targetTrialOut, "stats-report.md"), "utf-8");
    expect(targetTrialReport).toContain("Target Trial Emulation Protocol");
    expect(targetTrialReport).toContain("causal design artifact");

    const sensitivityPath = path.join(dir, "unmeasured-confounding.csv");
    await writeFile(sensitivityPath, [
      "outcome,treat",
      ...Array.from({ length: 40 }, () => "0,0"),
      ...Array.from({ length: 10 }, () => "1,0"),
      ...Array.from({ length: 25 }, () => "0,1"),
      ...Array.from({ length: 25 }, () => "1,1"),
    ].join("\n"));
    const sensitivityOut = path.join(dir, "unmeasured-confounding");
    const sensitivity = await researchStatsRunCommand({
      method: "unmeasured-confounding-sensitivity",
      dataPath: sensitivityPath,
      outDir: sensitivityOut,
      outcome: "outcome",
      exposure: "treat",
      variables: [],
      covariates: [],
      exactCovariates: [],
      estimand: "ATT",
      matchRatio: 1,
      replacement: false,
      trimThreshold: 0.01,
      stabilizeWeights: true,
      surveyDesign: false,
      allowSurveyApproximation: false,
      alpha: 0.05,
      python,
    });
    expect(sensitivity.status).toBe("succeeded");
    expect(sensitivity.estimates[0]).toMatchObject({
      risk_ratio: expect.any(Number),
      rr_ci_low: expect.any(Number),
      rr_ci_high: expect.any(Number),
      e_value: expect.any(Number),
      e_value_ci_limit: expect.any(Number),
      treated_events: 25,
      control_events: 10,
      continuity_correction_used: false,
    });
    expect(sensitivity.diagnostics).toMatchObject({
      treated_events: 25,
      control_events: 10,
      artifacts: expect.objectContaining({
        unmeasured_confounding_sensitivity: expect.stringContaining("unmeasured-confounding-sensitivity.csv"),
      }),
    });
    expect(sensitivity.artifacts.some(artifact => artifact.path.endsWith("unmeasured-confounding-sensitivity.csv"))).toBe(true);
    const sensitivityTable = await readFile(path.join(sensitivityOut, "unmeasured-confounding-sensitivity.csv"), "utf-8");
    expect(sensitivityTable).toContain("e_value_ci_limit");
    const sensitivityQa = JSON.parse(await readFile(path.join(sensitivityOut, "stats-qa.json"), "utf-8")) as { checks: Array<{ id: string; status: string }> };
    expect(sensitivityQa.checks).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "temporality", status: "warning" }),
      expect.objectContaining({ id: "causal-treatment-orientation-evidence", status: "pass" }),
      expect.objectContaining({ id: "causal-outcome-orientation-evidence", status: "pass" }),
      expect.objectContaining({ id: "unmeasured-confounding-sensitivity", status: "pass" }),
      expect.objectContaining({ id: "unmeasured-confounding-effect-bound", status: "warning" }),
      expect.objectContaining({ id: "unmeasured-confounding-ci-bound", status: "pass" }),
      expect.objectContaining({ id: "unmeasured-confounding-source-artifact", status: "pass" }),
    ]));
  });

  it("records semantic treatment orientation for propensity contrasts", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "agenteer-propensity-orientation-"));
    const dataPath = path.join(dir, "semantic-propensity.csv");
    await writeFile(dataPath, [
      "outcome,treatment,age,severity",
      ...Array.from({ length: 120 }, (_, index) => {
        const treated = index % 3 === 0;
        const age = 45 + (index % 35);
        const severity = 0.5 + ((index * 7) % 20) / 10;
        const outcome = 5 + (treated ? 1.2 : 0) + age * 0.03 + severity * 0.4 + ((index * 11) % 13) / 50;
        return [outcome.toFixed(3), treated ? "treated" : "untreated", age, severity.toFixed(3)].join(",");
      }),
    ].join("\n"));

    const result = await researchStatsRunCommand({
      method: "propensity-score-weighting",
      dataPath,
      outDir: path.join(dir, "run"),
      outcome: "outcome",
      exposure: "treatment",
      covariates: ["age", "severity"],
      variables: [],
      exactCovariates: [],
      estimand: "ATE",
      matchRatio: 1,
      replacement: false,
      trimThreshold: 0.01,
      stabilizeWeights: true,
      surveyDesign: false,
      allowSurveyApproximation: false,
      alpha: 0.05,
      python,
    });

    expect(result.status).toBe("succeeded");
    const preflight = result.diagnostics.preflight as { methodDecisionSupport?: { dataSignals?: Record<string, unknown> }; checks?: Array<{ id: string; status: string }> };
    expect(preflight.methodDecisionSupport?.dataSignals).toMatchObject({
      causalTreatmentPositiveLevel: "treated",
      causalTreatmentNegativeLevel: "untreated",
      causalTreatmentOrientationEvidence: "semantic binary labels",
      causalTreatmentTreatedRows: 40,
      causalTreatmentControlRows: 80,
      causalTreatmentMinGroup: 40,
    });
    expect(preflight.checks?.map(check => check.id)).not.toContain("propensity-treatment-orientation-review");
    expect(result.diagnostics).toMatchObject({
      treatment_orientation: expect.objectContaining({
        negative_level: "untreated",
        positive_level: "treated",
        ordering_evidence: "semantic binary labels",
      }),
    });
    const qa = JSON.parse(await readFile(path.join(dir, "run", "stats-qa.json"), "utf-8")) as { checks: Array<{ id: string; status: string }> };
    expect(qa.checks.find(check => check.id === "propensity-treatment-orientation-evidence")?.status).toBe("pass");
  });

  it("orients semantic pre/post timing labels for quasi-experimental routes", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "agenteer-temporal-orientation-"));
    const didPath = path.join(dir, "semantic-did.csv");
    await writeFile(didPath, [
      "outcome,treatment,period,age",
      ...["pre", "post"].flatMap(period => ["untreated", "treated"].flatMap(treatment => Array.from({ length: 24 }, (_, index) => {
        const treated = treatment === "treated";
        const post = period === "post";
        const age = 50 + (index % 12);
        const outcome = 10 + (treated ? 0.4 : 0) + (post ? 0.7 : 0) + (treated && post ? 1.1 : 0) + age * 0.02 + (index % 5) * 0.03;
        return [outcome.toFixed(4), treatment, period, age].join(",");
      }))),
    ].join("\n"));

    const did = await researchStatsRunCommand({
      method: "difference-in-differences",
      dataPath: didPath,
      outDir: path.join(dir, "did"),
      outcome: "outcome",
      exposure: "treatment",
      post: "period",
      covariates: ["age"],
      variables: [],
      exactCovariates: [],
      estimand: "ATT",
      matchRatio: 1,
      replacement: false,
      trimThreshold: 0.01,
      stabilizeWeights: true,
      surveyDesign: false,
      allowSurveyApproximation: false,
      alpha: 0.05,
      python,
    });
    expect(did.status).toBe("succeeded");
    expect(did.diagnostics).toMatchObject({
      post_negative_level: "pre",
      post_positive_level: "post",
      post_orientation_evidence: "semantic pre/post labels",
      post_orientation: expect.objectContaining({
        negative_level: "pre",
        positive_level: "post",
        ordering_evidence: "semantic pre/post labels",
      }),
      did_contrast: expect.objectContaining({ has_model_interaction: true }),
    });
    const didPreflight = did.diagnostics.preflight as { methodDecisionSupport?: { dataSignals?: Record<string, unknown> }; checks?: Array<{ id: string; status: string }> };
    expect(didPreflight.methodDecisionSupport?.dataSignals).toMatchObject({
      causalPostPositiveLevel: "post",
      causalPostNegativeLevel: "pre",
      causalPostOrientationEvidence: "semantic pre/post labels",
      causalPostPostRows: 48,
      causalPostPreRows: 48,
    });
    expect(didPreflight.checks?.map(check => check.id)).not.toContain("post-indicator-coding");
    const didQa = JSON.parse(await readFile(path.join(dir, "did", "stats-qa.json"), "utf-8")) as { checks: Array<{ id: string; status: string }> };
    expect(didQa.checks.find(check => check.id === "causal-post-orientation-evidence")?.status).toBe("pass");

    const itsPath = path.join(dir, "semantic-its.csv");
    await writeFile(itsPath, [
      "outcome,time,period",
      ...Array.from({ length: 120 }, (_, index) => {
        const time = Math.floor(index / 10);
        const period = time < 6 ? "before" : "after";
        const outcome = 4 + time * 0.12 + (time >= 6 ? 0.9 + (time - 5) * 0.04 : 0) + (index % 10) * 0.01;
        return [outcome.toFixed(4), time, period].join(",");
      }),
    ].join("\n"));
    const its = await researchStatsRunCommand({
      method: "interrupted-time-series",
      dataPath: itsPath,
      outDir: path.join(dir, "its"),
      outcome: "outcome",
      time: "time",
      post: "period",
      covariates: [],
      variables: [],
      exactCovariates: [],
      estimand: "ATT",
      matchRatio: 1,
      replacement: false,
      trimThreshold: 0.01,
      stabilizeWeights: true,
      surveyDesign: false,
      allowSurveyApproximation: false,
      alpha: 0.05,
      python,
    });
    expect(its.status).toBe("succeeded");
    expect(its.diagnostics).toMatchObject({
      post_negative_level: "before",
      post_positive_level: "after",
      post_orientation_evidence: "semantic pre/post labels",
      pre_period_time_points: 6,
      post_period_time_points: 6,
    });
    const itsPreflight = its.diagnostics.preflight as { methodDecisionSupport?: { dataSignals?: Record<string, unknown> }; checks?: Array<{ id: string; status: string }> };
    expect(itsPreflight.methodDecisionSupport?.dataSignals).toMatchObject({
      causalPostPositiveLevel: "after",
      causalPostNegativeLevel: "before",
      causalPostOrientationEvidence: "semantic pre/post labels",
      causalPostPostRows: 60,
      causalPostPreRows: 60,
    });
    expect(itsPreflight.checks?.map(check => check.id)).not.toContain("post-indicator-coding");
    const itsQa = JSON.parse(await readFile(path.join(dir, "its", "stats-qa.json"), "utf-8")) as { checks: Array<{ id: string; status: string }> };
    expect(itsQa.checks.find(check => check.id === "causal-post-orientation-evidence")?.status).toBe("pass");
  });

  it("blocks invalid propensity treatment coding and unsupported thresholds during preflight", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "agenteer-propensity-preflight-"));
    const multiLevelPath = path.join(dir, "multilevel-treatment.csv");
    await writeFile(multiLevelPath, [
      "y,treatment,age,sex",
      ...Array.from({ length: 36 }, (_, index) => {
        const treatment = index % 3;
        const age = 40 + (index % 20);
        const sex = index % 2;
        const y = 2 + treatment * 0.2 + age * 0.01 + sex * 0.1;
        return `${y.toFixed(4)},${treatment},${age},${sex}`;
      }),
    ].join("\n"));

    const invalidTreatment = await researchStatsRunCommand({
      method: "propensity-score-matching",
      dataPath: multiLevelPath,
      outDir: path.join(dir, "invalid-treatment"),
      outcome: "y",
      exposure: "treatment",
      covariates: ["age", "sex"],
      variables: [],
      exactCovariates: [],
      estimand: "ATT",
      matchRatio: 1,
      replacement: false,
      trimThreshold: 0.01,
      stabilizeWeights: true,
      surveyDesign: false,
      allowSurveyApproximation: false,
      alpha: 0.05,
      python,
    });

    expect(invalidTreatment.status).toBe("failed");
    expect(invalidTreatment.issues.map(issue => issue.code)).toContain("STATS_PROPENSITY_TREATMENT_CODING_INVALID");
    expect(invalidTreatment.errors.join(" ")).toContain("Stats preflight blocked execution");
    expect(invalidTreatment.artifacts.map(artifact => artifact.kind)).toContain("preflight");
    expect(invalidTreatment.artifacts.map(artifact => artifact.kind)).not.toContain("propensity-scores");
    const invalidPreflight = JSON.parse(await readFile(path.join(dir, "invalid-treatment", "stats-preflight.json"), "utf-8")) as { statsPreflight: { checks: Array<{ id: string; status: string }> } };
    expect(invalidPreflight.statsPreflight.checks.find(check => check.id === "propensity-treatment-coding")?.status).toBe("block");

    const thresholdPath = path.join(dir, "unsupported-threshold.csv");
    await writeFile(thresholdPath, [
      "y,dose,age,sex",
      ...Array.from({ length: 36 }, (_, index) => {
        const dose = 1 + (index % 6);
        const age = 45 + (index % 15);
        const sex = index % 2;
        const y = 3 + dose * 0.1 + sex * 0.2;
        return `${y.toFixed(4)},${dose},${age},${sex}`;
      }),
    ].join("\n"));

    const unsupportedThreshold = await researchStatsRunCommand({
      method: "propensity-score-weighting",
      dataPath: thresholdPath,
      outDir: path.join(dir, "unsupported-threshold"),
      outcome: "y",
      exposure: "dose",
      exposureThreshold: 10,
      covariates: ["age", "sex"],
      variables: [],
      exactCovariates: [],
      estimand: "ATT",
      matchRatio: 1,
      replacement: false,
      trimThreshold: 0.01,
      stabilizeWeights: true,
      surveyDesign: false,
      allowSurveyApproximation: false,
      alpha: 0.05,
      python,
    });

    expect(unsupportedThreshold.status).toBe("failed");
    expect(unsupportedThreshold.issues.map(issue => issue.code)).toContain("STATS_PROPENSITY_TREATMENT_THRESHOLD_SUPPORT_INVALID");
    const thresholdPreflight = JSON.parse(await readFile(path.join(dir, "unsupported-threshold", "stats-preflight.json"), "utf-8")) as { statsPreflight: { checks: Array<{ id: string; status: string }> } };
    expect(thresholdPreflight.statsPreflight.checks.find(check => check.id === "propensity-treatment-threshold-support")?.status).toBe("block");
    expect(thresholdPreflight.statsPreflight.checks.find(check => check.id === "propensity-treatment-model-capacity")?.status).toBe("block");
  });

  it("blocks outcome-derived or post-index adjustment covariates before ordinary regression execution", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "agenteer-regression-outcome-leakage-"));
    const dataPath = path.join(dir, "post-index-covariate.csv");
    await writeFile(dataPath, [
      "y,treat,age,post_discharge_los,prior_hf",
      ...Array.from({ length: 80 }, (_, index) => {
        const treat = index % 2;
        const age = 45 + (index % 25);
        const postDischargeLos = 2 + (index % 11);
        const priorHf = index % 6 === 0 ? 1 : 0;
        const y = 2 + treat * 0.2 + age * 0.03 + postDischargeLos * 0.4 + priorHf * 0.15;
        return `${y.toFixed(4)},${treat},${age},${postDischargeLos},${priorHf}`;
      }),
    ].join("\n"));

    const outDir = path.join(dir, "linear");
    const result = await researchStatsRunCommand({
      method: "linear-regression",
      dataPath,
      outDir,
      outcome: "y",
      exposure: "treat",
      covariates: ["age", "post_discharge_los", "prior_hf"],
      variables: [],
      exactCovariates: [],
      estimand: "ATT",
      matchRatio: 1,
      replacement: false,
      trimThreshold: 0.01,
      stabilizeWeights: true,
      surveyDesign: false,
      allowSurveyApproximation: false,
      alpha: 0.05,
      python,
    });

    expect(result.status).toBe("failed");
    expect(result.issues.map(issue => issue.code)).toContain("STATS_OUTCOME_LEAKAGE_VARIABLE_REVIEW");
    const preflight = JSON.parse(await readFile(path.join(outDir, "stats-preflight.json"), "utf-8")) as { statsPreflight: { checks: Array<{ id: string; status: string; detail: string }> } };
    const leakageCheck = preflight.statsPreflight.checks.find(check => check.id === "outcome-leakage-variable-review");
    expect(leakageCheck?.status).toBe("block");
    expect(leakageCheck?.detail).toContain("post_discharge_los");
    expect(leakageCheck?.detail).not.toContain("prior_hf");
  });

  it("blocks post-treatment adjustment covariates before ordinary regression execution", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "agenteer-regression-post-treatment-adjustment-"));
    const dataPath = path.join(dir, "post-treatment-adjustment.csv");
    await writeFile(dataPath, [
      "y,treat,age,in_hospital_procedure,history_surgery",
      ...Array.from({ length: 80 }, (_, index) => {
        const treat = index % 2;
        const age = 45 + (index % 25);
        const inHospitalProcedure = index % 4 === 0 ? 1 : 0;
        const historySurgery = index % 6 === 0 ? 1 : 0;
        const y = 2 + treat * 0.2 + age * 0.03 + inHospitalProcedure * 0.4 + historySurgery * 0.15;
        return `${y.toFixed(4)},${treat},${age},${inHospitalProcedure},${historySurgery}`;
      }),
    ].join("\n"));

    const outDir = path.join(dir, "linear");
    const result = await researchStatsRunCommand({
      method: "linear-regression",
      dataPath,
      outDir,
      outcome: "y",
      exposure: "treat",
      covariates: ["age", "in_hospital_procedure", "history_surgery"],
      variables: [],
      exactCovariates: [],
      estimand: "ATT",
      matchRatio: 1,
      replacement: false,
      trimThreshold: 0.01,
      stabilizeWeights: true,
      surveyDesign: false,
      allowSurveyApproximation: false,
      alpha: 0.05,
      python,
    });

    expect(result.status).toBe("failed");
    expect(result.issues.map(issue => issue.code)).toContain("STATS_POST_TREATMENT_ADJUSTMENT_REVIEW");
    const preflight = JSON.parse(await readFile(path.join(outDir, "stats-preflight.json"), "utf-8")) as { statsPreflight: { checks: Array<{ id: string; status: string; detail: string }> } };
    const postTreatmentCheck = preflight.statsPreflight.checks.find(check => check.id === "post-treatment-adjustment-review");
    expect(postTreatmentCheck?.status).toBe("block");
    expect(postTreatmentCheck?.detail).toContain("in_hospital_procedure");
    expect(postTreatmentCheck?.detail).not.toContain("history_surgery");

    const repaired = await researchStatsRunCommand({
      method: "linear-regression",
      dataPath,
      outDir: path.join(dir, "linear-repaired"),
      outcome: "y",
      exposure: "treat",
      covariates: ["age", "history_surgery"],
      variables: [],
      exactCovariates: [],
      estimand: "ATT",
      matchRatio: 1,
      replacement: false,
      trimThreshold: 0.01,
      stabilizeWeights: true,
      surveyDesign: false,
      allowSurveyApproximation: false,
      alpha: 0.05,
      python,
    });
    expect(repaired.status).toBe("succeeded");
    expect(repaired.issues.map(issue => issue.code)).not.toContain("STATS_POST_TREATMENT_ADJUSTMENT_REVIEW");
  });

  it("warns on complete-case attrition and selected-variable missingness before ordinary regression execution", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "agenteer-regression-completeness-"));
    const dataPath = path.join(dir, "complete-case-attrition.csv");
    await writeFile(dataPath, [
      "y,x,z",
      ...Array.from({ length: 120 }, (_, index) => {
        const x = (index % 17) / 5;
        const z = index < 70 ? "" : ((index % 9) / 4).toFixed(4);
        const zValue = z ? Number(z) : 0;
        const y = 1 + x * 0.7 + zValue * 0.4 + (index % 5) * 0.03;
        return `${y.toFixed(4)},${x.toFixed(4)},${z}`;
      }),
    ].join("\n"));

    const outDir = path.join(dir, "linear");
    const result = await researchStatsRunCommand({
      method: "linear-regression",
      dataPath,
      outDir,
      outcome: "y",
      exposure: "x",
      covariates: ["z"],
      variables: [],
      exactCovariates: [],
      estimand: "ATT",
      matchRatio: 1,
      replacement: false,
      trimThreshold: 0.01,
      stabilizeWeights: true,
      surveyDesign: false,
      allowSurveyApproximation: false,
      alpha: 0.05,
      python,
    });

    expect(result.status).toBe("succeeded");
    expect(result.completeCaseN).toBe(50);
    expect(result.issues.map(issue => issue.code)).toEqual(expect.arrayContaining([
      "STATS_COMPLETE_CASE_RETENTION_LOW",
      "STATS_REQUIRED_VARIABLE_MISSINGNESS_BURDEN_HIGH",
    ]));
    const preflight = JSON.parse(await readFile(path.join(outDir, "stats-preflight.json"), "utf-8")) as { statsPreflight: { checks: Array<{ id: string; status: string; detail: string }> } };
    expect(preflight.statsPreflight.checks.find(check => check.id === "complete-case-retention")).toMatchObject({
      status: "warning",
    });
    expect(preflight.statsPreflight.checks.find(check => check.id === "complete-case-retention")?.detail).toContain("50 of 120");
    expect(preflight.statsPreflight.checks.find(check => check.id === "required-variable-missingness-burden")?.detail).toContain("z");
    const qa = JSON.parse(await readFile(path.join(outDir, "stats-qa.json"), "utf-8")) as { checks: Array<{ id: string; status: string; detail: string }> };
    expect(qa.checks.find(check => check.id === "analysis-complete-case-retention")?.status).toBe("warning");
    expect(qa.checks.find(check => check.id === "analysis-variable-missingness-burden")?.status).toBe("warning");
  });

  it("blocks outcome-like causal adjustment covariates before propensity execution", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "agenteer-propensity-covariate-timing-"));
    const dataPath = path.join(dir, "post-treatment-covariate.csv");
    await writeFile(dataPath, [
      "y,treat,age,post_readmission,prior_mi",
      ...Array.from({ length: 80 }, (_, index) => {
        const treat = index % 2;
        const age = 45 + (index % 25);
        const postReadmission = index % 5 === 0 ? 1 : 0;
        const priorMi = index % 7 === 0 ? 1 : 0;
        const y = 2 + treat * 0.25 + age * 0.02 + postReadmission * 0.4 + priorMi * 0.15;
        return `${y.toFixed(4)},${treat},${age},${postReadmission},${priorMi}`;
      }),
    ].join("\n"));

    const outDir = path.join(dir, "psw");
    const result = await researchStatsRunCommand({
      method: "propensity-score-weighting",
      dataPath,
      outDir,
      outcome: "y",
      exposure: "treat",
      covariates: ["age", "post_readmission", "prior_mi"],
      variables: [],
      exactCovariates: [],
      estimand: "ATE",
      matchRatio: 1,
      replacement: false,
      trimThreshold: 0.01,
      stabilizeWeights: true,
      surveyDesign: false,
      allowSurveyApproximation: false,
      alpha: 0.05,
      python,
    });

    expect(result.status).toBe("failed");
    expect(result.issues.map(issue => issue.code)).toContain("STATS_CAUSAL_COVARIATE_TIMING_REVIEW");
    expect(result.issues.map(issue => issue.code)).toContain("STATS_OUTCOME_LEAKAGE_VARIABLE_REVIEW");
    const preflight = JSON.parse(await readFile(path.join(outDir, "stats-preflight.json"), "utf-8")) as { statsPreflight: { checks: Array<{ id: string; status: string; detail: string }> } };
    const timingCheck = preflight.statsPreflight.checks.find(check => check.id === "causal-covariate-timing-review");
    expect(timingCheck?.status).toBe("warning");
    expect(timingCheck?.detail).toContain("post_readmission");
    expect(timingCheck?.detail).not.toContain("prior_mi");
    const leakageCheck = preflight.statsPreflight.checks.find(check => check.id === "outcome-leakage-variable-review");
    expect(leakageCheck?.status).toBe("block");
    expect(leakageCheck?.detail).toContain("post_readmission");
    expect(leakageCheck?.detail).not.toContain("prior_mi");
    const qa = JSON.parse(await readFile(path.join(outDir, "stats-qa.json"), "utf-8")) as { checks: Array<{ id: string; status: string; detail: string }> };
    const timingQa = qa.checks.find(check => check.id === "no-post-treatment-adjustment");
    expect(timingQa?.status).toBe("warning");
    expect(timingQa?.detail).toContain("post_readmission");
  });

  it("blocks unusable longitudinal cluster support during preflight", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "agenteer-longitudinal-preflight-"));
    const singletonPath = path.join(dir, "singleton-clusters.csv");
    await writeFile(singletonPath, [
      "y,x,cluster",
      ...Array.from({ length: 30 }, (_, index) => {
        const x = index % 2;
        const y = 1 + x * 0.4 + (index % 5) * 0.1;
        return `${y.toFixed(4)},${x},subject_${index}`;
      }),
    ].join("\n"));

    const singleton = await researchStatsRunCommand({
      method: "gee",
      dataPath: singletonPath,
      outDir: path.join(dir, "singleton-gee"),
      outcome: "y",
      exposure: "x",
      cluster: "cluster",
      covariates: [],
      variables: [],
      exactCovariates: [],
      estimand: "ATT",
      matchRatio: 1,
      replacement: false,
      trimThreshold: 0.01,
      stabilizeWeights: true,
      surveyDesign: false,
      allowSurveyApproximation: false,
      alpha: 0.05,
      python,
    });

    expect(singleton.status).toBe("failed");
    expect(singleton.issues.map(issue => issue.code)).toContain("STATS_LONGITUDINAL_OBSERVATION_SUPPORT_LOW");
    expect(singleton.artifacts.map(artifact => artifact.kind)).toContain("preflight");
    const singletonPreflight = JSON.parse(await readFile(path.join(dir, "singleton-gee", "stats-preflight.json"), "utf-8")) as { statsPreflight: { checks: Array<{ id: string; status: string }> } };
    expect(singletonPreflight.statsPreflight.checks.find(check => check.id === "longitudinal-observation-support")?.status).toBe("block");

    const lowClusterPath = path.join(dir, "low-cluster-glmm.csv");
    await writeFile(lowClusterPath, [
      "ybin,x,cluster",
      ...Array.from({ length: 32 }, (_, index) => {
        const cluster = Math.floor(index / 8);
        const x = index % 2;
        const ybin = (index + cluster) % 3 === 0 ? 1 : 0;
        return `${ybin},${x},cluster_${cluster}`;
      }),
    ].join("\n"));

    const lowCluster = await researchStatsRunCommand({
      method: "generalized-mixed-model",
      dataPath: lowClusterPath,
      outDir: path.join(dir, "low-cluster-glmm"),
      outcome: "ybin",
      exposure: "x",
      cluster: "cluster",
      covariates: [],
      variables: [],
      exactCovariates: [],
      estimand: "ATT",
      matchRatio: 1,
      replacement: false,
      trimThreshold: 0.01,
      stabilizeWeights: true,
      surveyDesign: false,
      allowSurveyApproximation: false,
      alpha: 0.05,
      python,
    });

    expect(lowCluster.status).toBe("failed");
    expect(lowCluster.issues.map(issue => issue.code)).toContain("STATS_LONGITUDINAL_CLUSTER_SUPPORT_LOW");
    const lowClusterPreflight = JSON.parse(await readFile(path.join(dir, "low-cluster-glmm", "stats-preflight.json"), "utf-8")) as { statsPreflight: { checks: Array<{ id: string; status: string }> } };
    expect(lowClusterPreflight.statsPreflight.checks.find(check => check.id === "longitudinal-cluster-support")?.status).toBe("block");
  });

  it("records prediction discrimination, calibration, threshold metrics, artifacts, and QA gates", async () => {
    const { dir, dataPath } = await writeStatsFixture();
    const outDir = path.join(dir, "prediction-evidence");
    const result = await researchStatsRunCommand({
      method: "prediction-evaluation",
      dataPath,
      outDir,
      outcome: "ybin",
      exposure: "score",
      group: "g",
      variables: [],
      covariates: [],
      exactCovariates: [],
      estimand: "ATT",
      matchRatio: 1,
      replacement: false,
      trimThreshold: 0.01,
      stabilizeWeights: true,
      surveyDesign: false,
      allowSurveyApproximation: false,
      bootstrapReplicates: 80,
      alpha: 0.05,
      python,
    });

    expect(result.status).toBe("succeeded");
    const apparentDecision = (result.diagnostics.preflight as { methodDecisionSupport?: { dataSignals?: Record<string, unknown> } }).methodDecisionSupport;
    expect(apparentDecision?.dataSignals).toMatchObject({
      predictionScoreProbabilityLike: true,
      predictionScoreSupported: true,
      predictionScoreLike: true,
      predictionValidationMode: "apparent",
      predictionValidationSupported: false,
    });
    expect(result.estimates[0]).toMatchObject({
      auroc: expect.any(Number),
      auroc_ci_low: expect.any(Number),
      auroc_ci_high: expect.any(Number),
      auprc: expect.any(Number),
      auprc_ci_low: expect.any(Number),
      auprc_ci_high: expect.any(Number),
      brier_score: expect.any(Number),
      brier_score_ci_low: expect.any(Number),
      brier_score_ci_high: expect.any(Number),
      calibration_mean_absolute_error: expect.any(Number),
      calibration_mean_absolute_error_ci_low: expect.any(Number),
      calibration_mean_absolute_error_ci_high: expect.any(Number),
      calibration_intercept: expect.any(Number),
      calibration_slope: expect.any(Number),
      max_net_benefit: expect.any(Number),
      max_net_benefit_threshold: expect.any(Number),
      max_net_benefit_over_treat_all: expect.any(Number),
      threshold: expect.any(Number),
      sensitivity: expect.any(Number),
      specificity: expect.any(Number),
      precision: expect.any(Number),
      f1: expect.any(Number),
      accuracy: expect.any(Number),
    });
    expect(result.diagnostics).toMatchObject({
      event_count: expect.any(Number),
      non_event_count: expect.any(Number),
      prevalence: expect.any(Number),
      binary_outcome_orientation: expect.objectContaining({
        negative_level: 0,
        positive_level: 1,
        ordering_evidence: "semantic binary labels",
      }),
      score_is_probability_like: true,
      roc_points: expect.any(Number),
      pr_points: expect.any(Number),
      confusion_matrix: expect.objectContaining({ tp: expect.any(Number), fp: expect.any(Number), tn: expect.any(Number), fn: expect.any(Number) }),
      calibration_bins: expect.any(Number),
      calibration_model: expect.objectContaining({
        status: "available",
        calibration_intercept: expect.any(Number),
        calibration_slope: expect.any(Number),
      }),
      decision_curve_thresholds: expect.any(Number),
      max_net_benefit: expect.objectContaining({
        threshold: expect.any(Number),
        net_benefit_model: expect.any(Number),
      }),
      bootstrap_intervals: expect.objectContaining({
        replicates_requested: 80,
        available_metrics: expect.arrayContaining(["auroc", "auprc", "brier_score", "calibration_mean_absolute_error"]),
        metrics: expect.arrayContaining([
          expect.objectContaining({
            metric: "auroc",
            ci_low: expect.any(Number),
            ci_high: expect.any(Number),
            successful_replicates: expect.any(Number),
            status: "available",
          }),
        ]),
        artifacts: expect.objectContaining({
          prediction_bootstrap: expect.stringContaining("prediction-bootstrap.csv"),
        }),
      }),
      validation_design: expect.objectContaining({
        mode: "apparent",
        evaluation_rows: expect.any(Number),
        development_or_prior_rows: 0,
        split_artifact: expect.stringContaining("prediction-validation-split.csv"),
      }),
      slice_performance: expect.objectContaining({
        requested: true,
        group_count: expect.any(Number),
        min_slice_n: expect.any(Number),
      }),
      artifacts: expect.objectContaining({
        roc_curve: expect.stringContaining("roc-curve.csv"),
        precision_recall_curve: expect.stringContaining("precision-recall-curve.csv"),
        calibration: expect.stringContaining("calibration-bins.csv"),
        confusion_matrix: expect.stringContaining("confusion-matrix.csv"),
        decision_curve: expect.stringContaining("decision-curve.csv"),
        prediction_bootstrap: expect.stringContaining("prediction-bootstrap.csv"),
        prediction_validation_split: expect.stringContaining("prediction-validation-split.csv"),
        prediction_slices: expect.stringContaining("prediction-slices.csv"),
      }),
    });
    expect(result.artifacts.filter(artifact => artifact.kind === "table").map(artifact => path.basename(artifact.path))).toEqual(expect.arrayContaining([
      "roc-curve.csv",
      "precision-recall-curve.csv",
      "calibration-bins.csv",
      "confusion-matrix.csv",
      "decision-curve.csv",
      "prediction-bootstrap.csv",
      "prediction-validation-split.csv",
      "prediction-slices.csv",
    ]));
    expect(result.issues.map(issue => issue.code)).toContain("PREDICTION_APPARENT_VALIDATION_ONLY");
    expect(result.artifacts.filter(artifact => artifact.kind === "figure").map(artifact => path.basename(artifact.path))).toEqual(expect.arrayContaining([
      "roc-curve.png",
      "precision-recall-curve.png",
      "calibration-plot.png",
      "decision-curve.png",
      "prediction-slices.png",
    ]));
    const sliceRows = (await readFile(path.join(outDir, "prediction-slices.csv"), "utf-8")).trim().split("\n");
    expect(sliceRows.length).toBeGreaterThan(2);
    expect(sliceRows[0]).toContain("auroc");
    expect(sliceRows[0]).toContain("brier_score");
    const bootstrapRows = (await readFile(path.join(outDir, "prediction-bootstrap.csv"), "utf-8")).trim().split("\n");
    expect(bootstrapRows.length).toBeGreaterThan(2);
    expect(bootstrapRows[0]).toContain("ci_low");
    expect(bootstrapRows.join("\n")).toContain("auroc");
    const validationRows = (await readFile(path.join(outDir, "prediction-validation-split.csv"), "utf-8")).trim().split("\n");
    expect(validationRows.length).toBeGreaterThan(2);
    expect(validationRows[0]).toContain("validation_mode");
    const qa = JSON.parse(await readFile(path.join(outDir, "stats-qa.json"), "utf-8")) as { checks: Array<{ id: string; status: string }> };
    expect(qa.checks.map(check => check.id)).toEqual(expect.arrayContaining([
      "prediction-validation-design",
      "prediction-validation-split-artifact",
      "prediction-validation-subject-leakage",
      "prediction-outcome-orientation-evidence",
      "prediction-class-balance",
      "prediction-discrimination",
      "prediction-threshold-operating-point",
      "prediction-calibration",
      "prediction-calibration-model",
      "prediction-score-probability-boundary",
      "prediction-decision-curve",
      "prediction-bootstrap-uncertainty",
      "prediction-artifact-completeness",
      "prediction-slice-performance",
    ]));
    expect(qa.checks.find(check => check.id === "prediction-validation-design")?.status).toBe("warning");
    expect(qa.checks.find(check => check.id === "prediction-validation-split-artifact")?.status).toBe("pass");
    expect(qa.checks.find(check => check.id === "prediction-validation-subject-leakage")?.status).toBe("warning");
    expect(qa.checks.find(check => check.id === "prediction-outcome-orientation-evidence")?.status).toBe("pass");
    expect(qa.checks.find(check => check.id === "prediction-bootstrap-uncertainty")?.status).toMatch(/pass|warning/);
    expect(qa.checks.find(check => check.id === "prediction-slice-performance")?.status).toMatch(/pass|warning/);
    const apparentManifest = await researchAnalysisManifestCommand({ runDir: outDir });
    expect(apparentManifest.qaReadiness.warningChecks).toEqual(expect.arrayContaining([
      "prediction-validation-design",
      "prediction-validation-subject-leakage",
    ]));
    expect(apparentManifest.readiness).toBe("exploratory_only");
    expect(apparentManifest.nextAction).toContain("prediction-validation-design");
    await expect(researchAnalysisManifestCommand({ runDir: outDir, requireReady: true })).rejects.toThrow(/prediction-validation-design|not local_review_ready/i);
    const apparentBenchmark = await researchAnalysisBenchmarkCommand({ runDirs: [outDir] });
    expect(apparentBenchmark.checks).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "critical-stats-qa-warnings", status: "warning" }),
    ]));
    expect(apparentBenchmark.checks.find(check => check.id === "critical-stats-qa-warnings")?.detail).toContain("prediction-validation-design");
    expect(apparentBenchmark.nextAction).toContain("prediction-validation-design");

    const temporalOut = path.join(dir, "prediction-temporal-validation");
    const temporal = await researchStatsRunCommand({
      method: "prediction-evaluation",
      dataPath,
      outDir: temporalOut,
      outcome: "ybin",
      exposure: "score",
      group: "g",
      id: "cluster",
      validationTime: "time",
      validationCutoff: 50,
      variables: [],
      covariates: [],
      exactCovariates: [],
      estimand: "ATT",
      matchRatio: 1,
      replacement: false,
      trimThreshold: 0.01,
      stabilizeWeights: true,
      surveyDesign: false,
      allowSurveyApproximation: false,
      bootstrapReplicates: 80,
      alpha: 0.05,
      python,
    });
    expect(temporal.status).toBe("succeeded");
    const temporalDecision = (temporal.diagnostics.preflight as { methodDecisionSupport?: { dataSignals?: Record<string, unknown> } }).methodDecisionSupport;
    expect(temporalDecision?.dataSignals).toMatchObject({
      predictionScoreProbabilityLike: true,
      predictionScoreSupported: true,
      predictionScoreLike: true,
      predictionValidationMode: "temporal_holdout",
      predictionValidationSupported: true,
    });
    expect(temporal.issues.map(issue => issue.code)).not.toContain("PREDICTION_APPARENT_VALIDATION_ONLY");
    expect(temporal.diagnostics).toMatchObject({
      validation_design: expect.objectContaining({
        mode: "temporal_holdout",
        validation_time: "time",
        validation_cutoff: 50,
        evaluation_rows: expect.any(Number),
        development_or_prior_rows: expect.any(Number),
        id: "cluster",
        subject_count: expect.any(Number),
        overlapping_subject_count: 0,
        split_artifact: expect.stringContaining("prediction-validation-split.csv"),
        subject_artifact: expect.stringContaining("prediction-validation-subjects.csv"),
      }),
      artifacts: expect.objectContaining({
        prediction_validation_split: expect.stringContaining("prediction-validation-split.csv"),
        prediction_validation_subjects: expect.stringContaining("prediction-validation-subjects.csv"),
      }),
    });
    await expect(readFile(path.join(temporalOut, "prediction-validation-subjects.csv"), "utf-8")).resolves.toContain("split_status");
    const temporalQa = JSON.parse(await readFile(path.join(temporalOut, "stats-qa.json"), "utf-8")) as { checks: Array<{ id: string; status: string }> };
    expect(temporalQa.checks.find(check => check.id === "prediction-validation-design")?.status).toBe("pass");
    expect(temporalQa.checks.find(check => check.id === "prediction-validation-split-artifact")?.status).toBe("pass");
    expect(temporalQa.checks.find(check => check.id === "prediction-validation-subject-leakage")?.status).toBe("pass");
    const temporalManifest = await researchAnalysisManifestCommand({ runDir: temporalOut });
    expect(temporalManifest.qaReadiness.warningChecks).not.toEqual(expect.arrayContaining([
      "prediction-validation-design",
      "prediction-validation-subject-leakage",
    ]));

    const overlapDataPath = path.join(dir, "prediction-overlap.csv");
    await writeFile(overlapDataPath, [
      "subject,time,ybin,score",
      ...Array.from({ length: 80 }, (_, index) => {
        const subject = `s${index % 20}`;
        const time = index < 40 ? 1 : 2;
        const base = index % 20;
        const ybin = base >= 8 || (time === 2 && base >= 6) ? 1 : 0;
        const score = Math.min(0.95, Math.max(0.05, 0.18 + base / 24 + time * 0.08));
        return [subject, time, ybin, score.toFixed(4)].join(",");
      }),
    ].join("\n"));
    const overlapOut = path.join(dir, "prediction-overlap-validation");
    const overlap = await researchStatsRunCommand({
      method: "prediction-evaluation",
      dataPath: overlapDataPath,
      outDir: overlapOut,
      outcome: "ybin",
      exposure: "score",
      id: "subject",
      validationTime: "time",
      validationCutoff: 2,
      variables: [],
      covariates: [],
      exactCovariates: [],
      estimand: "ATT",
      matchRatio: 1,
      replacement: false,
      trimThreshold: 0.01,
      stabilizeWeights: true,
      surveyDesign: false,
      allowSurveyApproximation: false,
      bootstrapReplicates: 80,
      alpha: 0.05,
      python,
    });
    expect(overlap.status).toBe("succeeded");
    expect(overlap.issues.map(issue => issue.code)).toContain("PREDICTION_VALIDATION_SUBJECT_OVERLAP");
    expect(overlap.diagnostics).toMatchObject({
      validation_design: expect.objectContaining({
        mode: "temporal_holdout",
        id: "subject",
        overlapping_subject_count: 20,
      }),
    });
    const overlapQa = JSON.parse(await readFile(path.join(overlapOut, "stats-qa.json"), "utf-8")) as { checks: Array<{ id: string; status: string }> };
    expect(overlapQa.checks.find(check => check.id === "prediction-validation-subject-leakage")?.status).toBe("fail");
  });

  it("records measurement, psychometric, PCA, clustering, agreement, correction, and power QA evidence", async () => {
    const { dir, dataPath } = await writeStatsFixture();

    const kappaOut = path.join(dir, "measurement-kappa");
    const kappa = await researchStatsRunCommand({
      method: "reliability-kappa",
      dataPath,
      outDir: kappaOut,
      variables: ["r1", "r2"],
      covariates: [],
      exactCovariates: [],
      estimand: "ATT",
      matchRatio: 1,
      replacement: false,
      trimThreshold: 0.01,
      stabilizeWeights: true,
      surveyDesign: false,
      allowSurveyApproximation: false,
      alpha: 0.05,
      python,
    });
    expect(kappa.status).toBe("succeeded");
    expect(kappa.estimates[0]).toMatchObject({ kappa: expect.any(Number), ci_low: expect.any(Number), ci_high: expect.any(Number), n: expect.any(Number) });
    expect(kappa.artifacts.some(artifact => artifact.path.endsWith("kappa-table.csv"))).toBe(true);
    expect((kappa.diagnostics.preflight as { methodDecisionSupport?: { requestedRole?: string; verdict?: string; dataSignals?: Record<string, unknown>; primaryMethods?: Array<{ method: string }> } }).methodDecisionSupport).toMatchObject({
      requestedRole: "primary",
      verdict: "preferred",
      dataSignals: expect.objectContaining({
        measurementKappaSupported: true,
        measurementRaterLevelCounts: expect.objectContaining({ r1: 2, r2: 2 }),
      }),
    });
    const kappaQa = JSON.parse(await readFile(path.join(kappaOut, "stats-qa.json"), "utf-8")) as { checks: Array<{ id: string; status: string }> };
    expect(kappaQa.checks.map(check => check.id)).toEqual(expect.arrayContaining(["agreement-kappa-interval", "agreement-contingency-table"]));

    const iccOut = path.join(dir, "measurement-icc");
    const icc = await researchStatsRunCommand({
      method: "intraclass-correlation",
      dataPath,
      outDir: iccOut,
      variables: ["wide1", "wide2", "wide3"],
      covariates: [],
      exactCovariates: [],
      estimand: "ATT",
      matchRatio: 1,
      replacement: false,
      trimThreshold: 0.01,
      stabilizeWeights: true,
      surveyDesign: false,
      allowSurveyApproximation: false,
      alpha: 0.05,
      bootstrapReplicates: 60,
      python,
    });
    expect(icc.status).toBe("succeeded");
    expect(icc.estimates[0]).toMatchObject({ icc: expect.any(Number), ci_low: expect.any(Number), ci_high: expect.any(Number), ci_method: "row bootstrap percentile", ms_between: expect.any(Number), ms_within: expect.any(Number) });
    expect(icc.diagnostics).toMatchObject({
      subjects: expect.any(Number),
      raters_or_measures: 3,
      bootstrap_interval: expect.objectContaining({ metric: "icc", status: "available", successful_replicates: expect.any(Number) }),
      artifacts: expect.objectContaining({ reliability_bootstrap: expect.stringContaining("reliability-bootstrap.csv") }),
    });
    expect(icc.artifacts.some(artifact => artifact.path.endsWith("reliability-bootstrap.csv"))).toBe(true);
    const iccQa = JSON.parse(await readFile(path.join(iccOut, "stats-qa.json"), "utf-8")) as { checks: Array<{ id: string; status: string }> };
    expect(iccQa.checks.map(check => check.id)).toEqual(expect.arrayContaining(["scale-reliability-uncertainty-interval", "scale-reliability-bootstrap-support"]));

    const alphaOut = path.join(dir, "measurement-alpha");
    const alpha = await researchStatsRunCommand({
      method: "cronbach-alpha",
      dataPath,
      outDir: alphaOut,
      variables: ["wide1", "wide2", "wide3"],
      covariates: [],
      exactCovariates: [],
      estimand: "ATT",
      matchRatio: 1,
      replacement: false,
      trimThreshold: 0.01,
      stabilizeWeights: true,
      surveyDesign: false,
      allowSurveyApproximation: false,
      alpha: 0.05,
      bootstrapReplicates: 60,
      python,
    });
    expect(alpha.status).toBe("succeeded");
    expect(alpha.estimates[0]).toMatchObject({ alpha: expect.any(Number), ci_low: expect.any(Number), ci_high: expect.any(Number), ci_method: "row bootstrap percentile", min_item_total_correlation: expect.any(Number) });
    expect(alpha.artifacts.some(artifact => artifact.path.endsWith("cronbach-item-diagnostics.csv"))).toBe(true);
    expect(alpha.artifacts.some(artifact => artifact.path.endsWith("reliability-bootstrap.csv"))).toBe(true);
    expect(alpha.diagnostics).toMatchObject({
      bootstrap_interval: expect.objectContaining({ metric: "cronbach_alpha", status: "available", successful_replicates: expect.any(Number) }),
      artifacts: expect.objectContaining({ reliability_bootstrap: expect.stringContaining("reliability-bootstrap.csv") }),
    });
    expect((alpha.diagnostics.preflight as { methodDecisionSupport?: { requestedRole?: string; verdict?: string; dataSignals?: Record<string, unknown>; primaryMethods?: Array<{ method: string }> } }).methodDecisionSupport).toMatchObject({
      requestedRole: "primary",
      verdict: "preferred",
      dataSignals: expect.objectContaining({
        measurementVaryingNumericVariableCount: 3,
        measurementFeatureMatrixSupported: true,
      }),
    });
    const alphaQa = JSON.parse(await readFile(path.join(alphaOut, "stats-qa.json"), "utf-8")) as { checks: Array<{ id: string; status: string }> };
    expect(alphaQa.checks.map(check => check.id)).toEqual(expect.arrayContaining(["scale-reliability-sample-size", "scale-reliability-item-count", "scale-reliability-uncertainty-interval", "scale-reliability-bootstrap-support"]));

    const pcaOut = path.join(dir, "measurement-pca");
    const pca = await researchStatsRunCommand({
      method: "pca",
      dataPath,
      outDir: pcaOut,
      variables: ["wide1", "wide2", "wide3"],
      covariates: [],
      exactCovariates: [],
      estimand: "ATT",
      matchRatio: 1,
      replacement: false,
      trimThreshold: 0.01,
      stabilizeWeights: true,
      surveyDesign: false,
      allowSurveyApproximation: false,
      alpha: 0.05,
      python,
    });
    expect(pca.status).toBe("succeeded");
    expect(pca.estimates[0]).toMatchObject({ explained_variance_ratio: expect.any(Number), cumulative_explained_variance: expect.any(Number) });
    expect(pca.diagnostics).toMatchObject({
      cumulative_explained_variance: expect.any(Number),
      n_components: expect.any(Number),
      preprocessing: "z_score_standardized_complete_cases",
      artifacts: expect.objectContaining({ pca_feature_scaling: expect.stringContaining("pca-feature-scaling.csv") }),
    });
    expect(pca.artifacts.some(artifact => artifact.path.endsWith("pca-transformed.csv"))).toBe(true);
    expect(pca.artifacts.some(artifact => artifact.path.endsWith("pca-loadings.csv"))).toBe(true);
    expect(pca.artifacts.some(artifact => artifact.path.endsWith("pca-feature-scaling.csv"))).toBe(true);
    const pcaFigures = JSON.parse(await readFile(path.join(pcaOut, "figures.json"), "utf-8")) as { figures: Array<{ path: string; title: string }> };
    expect(pcaFigures.figures.map(figure => path.basename(figure.path))).toEqual(expect.arrayContaining(["pca-scree.png", "pca-scores.png"]));
    const pcaQa = JSON.parse(await readFile(path.join(pcaOut, "stats-qa.json"), "utf-8")) as { checks: Array<{ id: string; status: string }> };
    expect(pcaQa.checks.map(check => check.id)).toEqual(expect.arrayContaining(["pca-variance-captured", "pca-artifacts", "pca-feature-scaling-artifact"]));

    const clusterOut = path.join(dir, "measurement-clustering");
    const clustering = await researchStatsRunCommand({
      method: "clustering-validation",
      dataPath,
      outDir: clusterOut,
      variables: ["wide1", "wide2", "wide3"],
      covariates: [],
      exactCovariates: [],
      estimand: "ATT",
      matchRatio: 1,
      replacement: false,
      trimThreshold: 0.01,
      stabilizeWeights: true,
      surveyDesign: false,
      allowSurveyApproximation: false,
      alpha: 0.05,
      python,
    });
    expect(clustering.status).toBe("succeeded");
    expect(clustering.estimates[0]).toMatchObject({ silhouette: expect.any(Number), davies_bouldin: expect.any(Number), calinski_harabasz: expect.any(Number), min_cluster_size: expect.any(Number) });
    expect(clustering.diagnostics).toMatchObject({
      preprocessing: "z_score_standardized_complete_cases",
      artifacts: expect.objectContaining({
        cluster_feature_scaling: expect.stringContaining("cluster-feature-scaling.csv"),
        cluster_profile: expect.stringContaining("cluster-profile.csv"),
      }),
    });
    expect(clustering.artifacts.some(artifact => artifact.path.endsWith("cluster-labels.csv"))).toBe(true);
    expect(clustering.artifacts.some(artifact => artifact.path.endsWith("cluster-feature-scaling.csv"))).toBe(true);
    expect(clustering.artifacts.some(artifact => artifact.path.endsWith("cluster-profile.csv"))).toBe(true);
    const clusteringDecision = (clustering.diagnostics.preflight as { methodDecisionSupport?: { requestedRole?: string; verdict?: string; dataSignals?: Record<string, unknown>; primaryMethods?: Array<{ method: string }>; sensitivityMethods?: Array<{ method: string }> } }).methodDecisionSupport;
    expect(clusteringDecision).toMatchObject({
      requestedRole: "primary",
      verdict: "preferred",
      dataSignals: expect.objectContaining({
        measurementClusteringSupported: true,
        measurementClusteringK: 3,
      }),
    });
    expect(clusteringDecision?.sensitivityMethods?.map(candidate => candidate.method)).toEqual(expect.arrayContaining(["pca", "missingness-summary"]));
    const clusterFigures = JSON.parse(await readFile(path.join(clusterOut, "figures.json"), "utf-8")) as { figures: Array<{ path: string; title: string }> };
    expect(clusterFigures.figures.map(figure => path.basename(figure.path))).toEqual(expect.arrayContaining(["cluster-size.png", "cluster-pca-projection.png"]));
    const clusterQa = JSON.parse(await readFile(path.join(clusterOut, "stats-qa.json"), "utf-8")) as { checks: Array<{ id: string; status: string }> };
    expect(clusterQa.checks.map(check => check.id)).toEqual(expect.arrayContaining(["clustering-cluster-size", "clustering-validation-metrics", "clustering-profile-artifact"]));

    const baOut = path.join(dir, "measurement-bland-altman");
    const blandAltman = await researchStatsRunCommand({
      method: "bland-altman",
      dataPath,
      outDir: baOut,
      variables: ["wide1", "wide2"],
      covariates: [],
      exactCovariates: [],
      estimand: "ATT",
      matchRatio: 1,
      replacement: false,
      trimThreshold: 0.01,
      stabilizeWeights: true,
      surveyDesign: false,
      allowSurveyApproximation: false,
      alpha: 0.05,
      python,
    });
    expect(blandAltman.status).toBe("succeeded");
    expect(blandAltman.estimates[0]).toMatchObject({ bias: expect.any(Number), bias_ci_low: expect.any(Number), bias_ci_high: expect.any(Number), loa_low: expect.any(Number), loa_high: expect.any(Number) });
    expect(blandAltman.diagnostics).toMatchObject({ proportional_bias_screen: expect.objectContaining({ status: expect.any(String) }) });
    expect(blandAltman.artifacts.some(artifact => artifact.path.endsWith("bland-altman-source.csv"))).toBe(true);
    const baQa = JSON.parse(await readFile(path.join(baOut, "stats-qa.json"), "utf-8")) as { checks: Array<{ id: string; status: string }> };
    expect(baQa.checks.map(check => check.id)).toEqual(expect.arrayContaining(["agreement-limits-of-agreement", "agreement-proportional-bias"]));

    const proportionalBiasPath = path.join(dir, "bland-altman-proportional-bias.csv");
    await writeFile(proportionalBiasPath, [
      "method_a,method_b",
      ...Array.from({ length: 80 }, (_, index) => {
        const methodA = 10 + index * 0.7;
        const difference = methodA * 0.12 + ((index % 5) - 2) * 0.03;
        const methodB = methodA - difference;
        return `${methodA.toFixed(4)},${methodB.toFixed(4)}`;
      }),
    ].join("\n"));
    const proportionalBiasOut = path.join(dir, "measurement-bland-altman-proportional-bias");
    const proportionalBias = await researchStatsRunCommand({
      method: "bland-altman",
      dataPath: proportionalBiasPath,
      outDir: proportionalBiasOut,
      variables: ["method_a", "method_b"],
      covariates: [],
      exactCovariates: [],
      estimand: "ATT",
      matchRatio: 1,
      replacement: false,
      trimThreshold: 0.01,
      stabilizeWeights: true,
      surveyDesign: false,
      allowSurveyApproximation: false,
      alpha: 0.05,
      python,
    });
    expect(proportionalBias.status).toBe("succeeded");
    expect(proportionalBias.issues.map(issue => issue.code)).toContain("BLAND_ALTMAN_PROPORTIONAL_BIAS");
    expect(proportionalBias.estimates[0]).toMatchObject({
      proportional_bias_slope: expect.any(Number),
      proportional_bias_slope_p_value: expect.any(Number),
      proportional_bias_status: "warning",
    });
    const proportionalBiasQa = JSON.parse(await readFile(path.join(proportionalBiasOut, "stats-qa.json"), "utf-8")) as { checks: Array<{ id: string; status: string }> };
    expect(proportionalBiasQa.checks.find(check => check.id === "agreement-proportional-bias")?.status).toBe("warning");

    const correctionOut = path.join(dir, "measurement-correction");
    const correction = await researchStatsRunCommand({
      method: "multiple-comparison-correction",
      dataPath,
      outDir: correctionOut,
      variables: ["pval"],
      covariates: [],
      exactCovariates: [],
      estimand: "ATT",
      matchRatio: 1,
      replacement: false,
      trimThreshold: 0.01,
      stabilizeWeights: true,
      surveyDesign: false,
      allowSurveyApproximation: false,
      alpha: 0.05,
      python,
    });
    expect(correction.status).toBe("succeeded");
    expect(correction.artifacts.some(artifact => artifact.path.endsWith("adjusted-p-values.csv"))).toBe(true);
    expect((correction.diagnostics.preflight as { methodDecisionSupport?: { requestedRole?: string; verdict?: string; dataSignals?: Record<string, unknown> } }).methodDecisionSupport).toMatchObject({
      requestedRole: "primary",
      verdict: "preferred",
      dataSignals: expect.objectContaining({
        measurementPValueVariable: "pval",
        measurementPValueInvalidCount: 0,
        measurementPValueCorrectionSupported: true,
      }),
    });
    const correctionQa = JSON.parse(await readFile(path.join(correctionOut, "stats-qa.json"), "utf-8")) as { checks: Array<{ id: string; status: string }> };
    expect(correctionQa.checks.map(check => check.id)).toEqual(expect.arrayContaining(["multiple-comparison-methods", "multiple-comparison-artifact"]));

    const powerOut = path.join(dir, "measurement-power");
    const power = await researchStatsRunCommand({
      method: "power-sample-size",
      dataPath,
      outDir: powerOut,
      variables: ["y"],
      outcomeThreshold: 0.5,
      exposureThreshold: 0.8,
      covariates: [],
      exactCovariates: [],
      estimand: "ATT",
      matchRatio: 1,
      replacement: false,
      trimThreshold: 0.01,
      stabilizeWeights: true,
      surveyDesign: false,
      allowSurveyApproximation: false,
      alpha: 0.05,
      python,
    });
    expect(power.status).toBe("succeeded");
    expect(power.estimates[0]).toMatchObject({ n_per_group: expect.any(Number), total_n: expect.any(Number) });
    expect(power.estimates.find(estimate => estimate.term === "observed_sample_size_support")).toMatchObject({
      variable: "y",
      observed_n: 90,
      required_total_n: expect.any(Number),
      observed_to_required_ratio: expect.any(Number),
      status: "underpowered",
    });
    expect(power.diagnostics).toMatchObject({
      observed_sample_size_support: expect.objectContaining({
        variable: "y",
        observed_n: 90,
        status: "underpowered",
      }),
    });
    const powerQa = JSON.parse(await readFile(path.join(powerOut, "stats-qa.json"), "utf-8")) as { checks: Array<{ id: string; status: string }> };
    expect(powerQa.checks.map(check => check.id)).toContain("power-sample-size-finite");
    expect(powerQa.checks.find(check => check.id === "power-observed-sample-size-support")).toMatchObject({ status: "fail" });
  });

  it("records binary event support for power and precision review", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "agenteer-stats-power-binary-"));
    const dataPath = path.join(dir, "binary-events.csv");
    await writeFile(dataPath, [
      "mortality,age,severity",
      ...Array.from({ length: 120 }, (_, index) => `${index < 8 ? 1 : 0},${50 + (index % 30)},${1 + (index % 5)}`),
    ].join("\n"));

    const outDir = path.join(dir, "power-binary");
    const result = await researchStatsRunCommand({
      method: "power-sample-size",
      dataPath,
      outDir,
      variables: ["mortality"],
      covariates: ["age", "severity"],
      outcomeThreshold: 0.5,
      exposureThreshold: 0.8,
      exactCovariates: [],
      estimand: "ATT",
      matchRatio: 1,
      replacement: false,
      trimThreshold: 0.01,
      stabilizeWeights: true,
      surveyDesign: false,
      allowSurveyApproximation: false,
      alpha: 0.05,
      python,
    });

    expect(result.status).toBe("succeeded");
    expect(result.estimates.find(estimate => estimate.term === "binary_event_support")).toMatchObject({
      events: 8,
      non_events: 112,
      candidate_parameters: 3,
      minimum_events_for_stable_model: 30,
      status: "underpowered",
    });
    expect(result.estimates.find(estimate => estimate.term === "observed_sample_size_support")).toMatchObject({
      observed_n: 120,
      status: "warning",
    });
    expect(result.diagnostics).toMatchObject({
      observed_sample_size_support: expect.objectContaining({
        variable: "mortality",
        observed_n: 120,
        status: "warning",
      }),
      binary_event_support: {
        variable: "mortality",
        events: 8,
        status: "underpowered",
      },
    });
    const qa = JSON.parse(await readFile(path.join(outDir, "stats-qa.json"), "utf-8")) as { checks: Array<{ id: string; status: string }> };
    expect(qa.checks.find(check => check.id === "power-binary-event-support")).toMatchObject({
      status: "fail",
    });
    expect(qa.checks.find(check => check.id === "power-observed-sample-size-support")).toMatchObject({
      status: "warning",
    });
  });

  it("blocks execution when selected variables contain semantically impossible values", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "agenteer-stats-semantic-"));
    const dataPath = path.join(dir, "bad.csv");
    await writeFile(dataPath, [
      "age,bmi,outcome",
      ...Array.from({ length: 40 }, (_, index) => `${index === 0 ? 140 : 55 + (index % 20)},${65 + (index % 3)},${10 + index / 10}`),
    ].join("\n"));
    const result = await researchStatsRunCommand({
      method: "linear-regression",
      dataPath,
      outDir: path.join(dir, "run"),
      outcome: "outcome",
      exposure: "bmi",
      covariates: ["age"],
      variables: [],
      exactCovariates: [],
      estimand: "ATT",
      matchRatio: 1,
      replacement: false,
      trimThreshold: 0.01,
      stabilizeWeights: true,
      surveyDesign: false,
      allowSurveyApproximation: false,
      alpha: 0.05,
      python,
    });

    expect(result.status).toBe("failed");
    const preflight = result.diagnostics.preflight as { checks?: Array<{ id: string; status: string; detail: string }> };
    expect(preflight.checks).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "selected-variable-semantic-plausibility", status: "block" }),
    ]));
    expect(result.issues.map(issue => issue.code)).toEqual(expect.arrayContaining(["IMPLAUSIBLE_AGE_RANGE", "IMPLAUSIBLE_BMI_MEAN"]));
    expect(result.issues.map(issue => issue.code)).toContain("STATS_SELECTED_VARIABLE_SEMANTIC_PLAUSIBILITY_INVALID");
    const qa = JSON.parse(await readFile(path.join(dir, "run", "stats-qa.json"), "utf-8")) as { checks: Array<{ id: string; status: string; detail: string }> };
    expect(qa.checks.find(check => check.id === "analysis-semantic-plausibility")).toMatchObject({
      status: "fail",
    });
  });

  it("blocks binary models when the outcome is not actually binary", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "agenteer-stats-binary-preflight-"));
    const dataPath = path.join(dir, "multiclass.csv");
    await writeFile(dataPath, [
      "x,y",
      ...Array.from({ length: 80 }, (_, index) => `${index / 10},${index % 3}`),
    ].join("\n"));
    const result = await researchStatsRunCommand({
      method: "logistic-regression",
      dataPath,
      outDir: path.join(dir, "run"),
      outcome: "y",
      exposure: "x",
      variables: [],
      covariates: [],
      exactCovariates: [],
      estimand: "ATT",
      matchRatio: 1,
      replacement: false,
      trimThreshold: 0.01,
      stabilizeWeights: true,
      surveyDesign: false,
      allowSurveyApproximation: false,
      alpha: 0.05,
      python,
    });

    expect(result.status).toBe("failed");
    expect(result.estimates).toEqual([]);
    expect(result.artifacts.some(artifact => artifact.kind === "preflight")).toBe(true);
    expect(result.issues.map(issue => issue.code)).toContain("STATS_BINARY_OUTCOME_INVALID");
  });

  it("blocks binary models when both two-level outcome labels have the same semantic direction", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "agenteer-stats-binary-same-direction-preflight-"));
    const dataPath = path.join(dir, "same-direction.csv");
    await writeFile(dataPath, [
      "marker,outcome,age",
      ...Array.from({ length: 80 }, (_, index) => {
        const marker = index % 2;
        const outcome = index % 3 === 0 ? "alive" : "survived";
        const age = 50 + (index % 25);
        return [marker, outcome, age].join(",");
      }),
    ].join("\n"));
    const result = await researchStatsRunCommand({
      method: "logistic-regression",
      dataPath,
      outDir: path.join(dir, "run"),
      outcome: "outcome",
      exposure: "marker",
      variables: [],
      covariates: ["age"],
      exactCovariates: [],
      estimand: "ATT",
      matchRatio: 1,
      replacement: false,
      trimThreshold: 0.01,
      stabilizeWeights: true,
      surveyDesign: false,
      allowSurveyApproximation: false,
      alpha: 0.05,
      python,
    });

    expect(result.status).toBe("failed");
    expect(result.estimates).toEqual([]);
    expect(result.issues.map(issue => issue.code)).toContain("STATS_BINARY_OUTCOME_INVALID");
    const preflight = result.diagnostics.preflight as { checks?: Array<{ id: string; status: string; detail: string }> };
    expect(preflight.checks).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "binary-outcome-levels", status: "block" }),
    ]));
  });

  it("uses analysis-complete event counts for direct binary model preflight", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "agenteer-stats-binary-complete-event-preflight-"));
    const dataPath = path.join(dir, "complete-event-support.csv");
    await writeFile(dataPath, [
      "mortality,treatment,age,risk_score",
      ...Array.from({ length: 100 }, (_, index) => {
        const mortality = index < 20 ? 1 : 0;
        const riskScore = index > 0 && index < 20 ? "" : (0.2 + (index % 20) / 10).toFixed(2);
        return `${mortality},${index % 2},${45 + index % 40},${riskScore}`;
      }),
    ].join("\n"));
    const result = await researchStatsRunCommand({
      method: "logistic-regression",
      dataPath,
      outDir: path.join(dir, "run"),
      outcome: "mortality",
      exposure: "treatment",
      variables: [],
      covariates: ["age", "risk_score"],
      exactCovariates: [],
      estimand: "ATT",
      matchRatio: 1,
      replacement: false,
      trimThreshold: 0.01,
      stabilizeWeights: true,
      surveyDesign: false,
      allowSurveyApproximation: false,
      alpha: 0.05,
      python,
    });

    expect(result.status).toBe("failed");
    expect(result.estimates).toEqual([]);
    expect(result.issues.map(issue => issue.code)).toEqual(expect.arrayContaining([
      "STATS_BINARY_EVENT_COUNT_LOW",
      "STATS_BINARY_OUTCOME_MARGINAL_EVENT_SUPPORT_REVIEW",
    ]));
    const preflight = JSON.parse(await readFile(path.join(dir, "run", "stats-preflight.json"), "utf-8")) as { statsPreflight: { checks: Array<{ id: string; status: string; detail: string }> } };
    expect(preflight.statsPreflight.checks.find(check => check.id === "binary-outcome-marginal-event-support")).toMatchObject({
      status: "warning",
      detail: expect.stringContaining("complete-case binary outcome support is 1 event"),
    });
    expect(preflight.statsPreflight.checks.find(check => check.id === "binary-event-count")).toMatchObject({
      status: "block",
      detail: expect.stringContaining("1 event"),
    });
  });

  it("blocks ordinary logistic regression when a discrete predictor perfectly predicts the outcome", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "agenteer-stats-logistic-separation-"));
    const dataPath = path.join(dir, "separated-logistic.csv");
    await writeFile(dataPath, [
      "mortality,arm,age",
      ...Array.from({ length: 80 }, (_, index) => {
        const arm = index < 40 ? "control" : "treated";
        const mortality = arm === "treated" ? 1 : index % 4 === 0 ? 1 : 0;
        const age = 55 + (index % 20);
        return [mortality, arm, age].join(",");
      }),
    ].join("\n"));
    const result = await researchStatsRunCommand({
      method: "logistic-regression",
      dataPath,
      outDir: path.join(dir, "run"),
      outcome: "mortality",
      exposure: "arm",
      variables: [],
      covariates: ["age"],
      exactCovariates: [],
      estimand: "ATT",
      matchRatio: 1,
      replacement: false,
      trimThreshold: 0.01,
      stabilizeWeights: true,
      surveyDesign: false,
      allowSurveyApproximation: false,
      alpha: 0.05,
      python,
    });

    expect(result.status).toBe("failed");
    expect(result.issues.map(issue => issue.code)).toContain("LOGISTIC_COMPLETE_SEPARATION_SCREEN");
    expect(result.diagnostics).toMatchObject({
      separation_screen: expect.objectContaining({
        status: "block",
        flagged_terms: expect.arrayContaining([
          expect.objectContaining({ term: "arm_treated", events: 40, non_events: 0 }),
        ]),
      }),
    });
    const qa = JSON.parse(await readFile(path.join(dir, "run", "stats-qa.json"), "utf-8")) as { checks: Array<{ id: string; status: string }> };
    expect(qa.checks.find(check => check.id === "model-separation-screen")?.status).toBe("fail");
  });

  it("orients binary logistic outcomes by semantic event labels before estimating effects", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "agenteer-stats-logistic-orientation-"));
    const dataPath = path.join(dir, "semantic-logistic.csv");
    await writeFile(dataPath, [
      "outcome,marker,age",
      ...Array.from({ length: 140 }, (_, index) => {
        const marker = ((index % 35) / 10) + ((index * 7) % 13) / 20;
        const age = 45 + (index % 30);
        const signal = marker + ((index * 11) % 17) / 20 + (age - 60) / 100;
        const outcome = signal > 2.65 ? "dead" : "survived";
        return [outcome, marker.toFixed(3), age].join(",");
      }),
    ].join("\n"));
    const result = await researchStatsRunCommand({
      method: "logistic-regression",
      dataPath,
      outDir: path.join(dir, "run"),
      outcome: "outcome",
      exposure: "marker",
      variables: [],
      covariates: ["age"],
      exactCovariates: [],
      estimand: "ATT",
      matchRatio: 1,
      replacement: false,
      trimThreshold: 0.01,
      stabilizeWeights: true,
      surveyDesign: false,
      allowSurveyApproximation: false,
      alpha: 0.05,
      python,
    });

    expect(result.status).toBe("succeeded");
    expect(result.diagnostics).toMatchObject({
      binary_outcome_orientation: expect.objectContaining({
        negative_level: "survived",
        positive_level: "dead",
        ordering_evidence: "semantic binary labels",
      }),
    });
    const exposureRow = result.estimates.find(row => row.term === "marker");
    expect(exposureRow?.odds_ratio).toBeGreaterThan(1);
    const qa = JSON.parse(await readFile(path.join(dir, "run", "stats-qa.json"), "utf-8")) as { checks: Array<{ id: string; status: string }> };
    expect(qa.checks.find(check => check.id === "model-binary-outcome-orientation-evidence")?.status).toBe("pass");
  });

  it("warns when binary logistic outcome orientation relies on lexical fallback labels", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "agenteer-stats-logistic-lexical-orientation-"));
    const dataPath = path.join(dir, "ambiguous-logistic.csv");
    const selectionPath = path.join(dir, "logistic-method-selection.json");
    await writeFile(dataPath, [
      "state,marker,age",
      ...Array.from({ length: 240 }, (_, index) => {
        const marker = -2 + ((index % 60) / 15) + ((index * 5) % 11) / 35;
        const age = 40 + (index % 35);
        const probability = 1 / (1 + Math.exp(-(0.75 * marker + 0.015 * (age - 55))));
        const raw = Math.sin(index * 17.231) * 4159.331;
        const pseudoRandom = raw - Math.floor(raw);
        const state = pseudoRandom < probability ? "omega" : "alpha";
        return [state, marker.toFixed(3), age].join(",");
      }),
    ].join("\n"));
    await researchMethodSelectCommand({
      question: "Estimate the association between marker and a binary outcome.",
      goal: "associate",
      outcomeType: "binary",
      dataStructures: ["single_table"],
      outPath: selectionPath,
    });
    const result = await researchStatsRunCommand({
      method: "logistic-regression",
      dataPath,
      outDir: path.join(dir, "run"),
      outcome: "state",
      exposure: "marker",
      methodSelectionPath: selectionPath,
      variables: [],
      covariates: ["age"],
      exactCovariates: [],
      estimand: "ATT",
      matchRatio: 1,
      replacement: false,
      trimThreshold: 0.01,
      stabilizeWeights: true,
      surveyDesign: false,
      allowSurveyApproximation: false,
      alpha: 0.05,
      python,
    });

    expect(result.status).toBe("succeeded");
    expect(result.binding.status).toBe("bound");
    expect(result.resultPosture?.status).toBe("bound_standard_table");
    expect(result.diagnostics).toMatchObject({
      binary_outcome_orientation: expect.objectContaining({
        negative_level: "alpha",
        positive_level: "omega",
        ordering_evidence: "lexical fallback",
      }),
    });
    const qa = JSON.parse(await readFile(path.join(dir, "run", "stats-qa.json"), "utf-8")) as { checks: Array<{ id: string; status: string; detail: string }> };
    const orientationCheck = qa.checks.find(check => check.id === "model-binary-outcome-orientation-evidence");
    expect(orientationCheck?.status).toBe("warning");
    expect(orientationCheck?.detail).toContain("confirm that alpha is the reference/negative level");
    const manifest = await researchAnalysisManifestCommand({ runDir: path.join(dir, "run") });
    expect(manifest.qaReadiness.warningChecks).toContain("model-binary-outcome-orientation-evidence");
    expect(manifest.readiness).toBe("exploratory_only");
    expect(manifest.nextAction).toContain("model-binary-outcome-orientation-evidence");
    await expect(researchAnalysisManifestCommand({ runDir: path.join(dir, "run"), requireReady: true })).rejects.toThrow(/model-binary-outcome-orientation-evidence|not local_review_ready/i);
  });

  it("keeps bound longitudinal models exploratory when cluster support is below preferred reliability", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "agenteer-stats-longitudinal-readiness-"));
    const dataPath = path.join(dir, "small-cluster-gee.csv");
    await writeFile(dataPath, [
      "subject,visit,x,y",
      ...Array.from({ length: 10 }, (_, subject) => Array.from({ length: 4 }, (_, visit) => {
        const x = -1 + subject * 0.22 + visit * 0.15;
        const y = 3 + x * 0.7 + subject * 0.12 + visit * 0.08 + ((subject + visit * 3) % 5) * 0.03;
        return `${subject},${visit},${x.toFixed(4)},${y.toFixed(4)}`;
      })).flat(),
    ].join("\n"));
    const outDir = path.join(dir, "run");
    const analysisSpecPath = path.join(dir, "analysis-spec.json");
    await writeFile(analysisSpecPath, JSON.stringify({ specHash: "spec_small_cluster_gee", method: "gee" }));

    const result = await researchStatsRunCommand({
      method: "gee",
      dataPath,
      outDir,
      outcome: "y",
      exposure: "x",
      cluster: "subject",
      covariates: ["visit"],
      analysisSpecPath,
      variables: [],
      exactCovariates: [],
      estimand: "ATT",
      matchRatio: 1,
      replacement: false,
      trimThreshold: 0.01,
      stabilizeWeights: true,
      surveyDesign: false,
      allowSurveyApproximation: false,
      alpha: 0.05,
      python,
    });

    expect(result.status).toBe("succeeded");
    expect(result.binding.status).toBe("bound");
    expect(result.resultPosture?.status).toBe("bound_standard_table");
    const qa = JSON.parse(await readFile(path.join(outDir, "stats-qa.json"), "utf-8")) as { checks: Array<{ id: string; status: string; detail: string }> };
    expect(qa.checks.find(check => check.id === "longitudinal-cluster-count")).toMatchObject({
      status: "warning",
    });
    expect(qa.checks.find(check => check.id === "longitudinal-observed-fitted-figure")?.status).toBe("pass");
    const manifest = await researchAnalysisManifestCommand({ runDir: outDir });
    expect(manifest.qaReadiness.warningChecks).toContain("longitudinal-cluster-count");
    expect(manifest.readiness).toBe("exploratory_only");
    expect(manifest.nextAction).toContain("longitudinal-cluster-count");
    await expect(researchAnalysisManifestCommand({ runDir: outDir, requireReady: true })).rejects.toThrow(/longitudinal-cluster-count|not local_review_ready/i);
  });

  it("warns when fitted logistic probabilities suggest quasi-separation despite passing single-term screening", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "agenteer-stats-logistic-fit-boundary-"));
    const dataPath = path.join(dir, "quasi-separated-logistic.csv");
    const pseudoRandom = (index: number) => {
      const raw = Math.sin(index * 12.9898) * 43758.5453;
      return raw - Math.floor(raw);
    };
    await writeFile(dataPath, [
      "outcome,risk_score",
      ...Array.from({ length: 400 }, (_, index) => {
        const riskScore = -6 + (12 * index) / 399;
        const probability = 1 / (1 + Math.exp(-2.25 * riskScore));
        const outcome = probability > pseudoRandom(index) ? 1 : 0;
        return [outcome, riskScore.toFixed(6)].join(",");
      }),
    ].join("\n"));
    const result = await researchStatsRunCommand({
      method: "logistic-regression",
      dataPath,
      outDir: path.join(dir, "run"),
      outcome: "outcome",
      exposure: "risk_score",
      variables: [],
      covariates: [],
      exactCovariates: [],
      estimand: "ATT",
      matchRatio: 1,
      replacement: false,
      trimThreshold: 0.01,
      stabilizeWeights: true,
      surveyDesign: false,
      allowSurveyApproximation: false,
      alpha: 0.05,
      python,
    });

    expect(result.status).toBe("succeeded");
    expect(result.issues.map(issue => issue.code)).toContain("LOGISTIC_FITTED_PROBABILITY_BOUNDARY");
    expect(result.diagnostics.fitted_probability_screen).toMatchObject({
      status: "warning",
    });
    expect((result.diagnostics.fitted_probability_screen as { near_boundary_fraction: number }).near_boundary_fraction).toBeGreaterThan(0.2);
    const qa = JSON.parse(await readFile(path.join(dir, "run", "stats-qa.json"), "utf-8")) as { checks: Array<{ id: string; status: string }> };
    expect(qa.checks.find(check => check.id === "model-separation-screen")?.status).toBe("pass");
    expect(qa.checks.find(check => check.id === "model-fitted-probability-boundary")?.status).toBe("warning");
  });

  it("separates ordinal logistic predictor effects from threshold parameters", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "agenteer-stats-ordinal-output-"));
    const dataPath = path.join(dir, "ordinal.csv");
    const pseudoNoise = (index: number) => {
      const raw = Math.sin(index * 19.191) * 9137.171;
      return raw - Math.floor(raw) - 0.5;
    };
    await writeFile(dataPath, [
      "severity,x,site",
      ...Array.from({ length: 180 }, (_, index) => {
        const x = -2 + (4 * index) / 179;
        const site = index % 3 === 0 ? "A" : index % 3 === 1 ? "B" : "C";
        const latent = x + (site === "B" ? 0.25 : site === "C" ? -0.2 : 0) + pseudoNoise(index) * 0.9;
        const severity = latent < -0.6 ? "mild" : latent < 0.8 ? "moderate" : "severe";
        return [severity, x.toFixed(6), site].join(",");
      }),
    ].join("\n"));

    const result = await researchStatsRunCommand({
      method: "ordinal-logistic-regression",
      dataPath,
      outDir: path.join(dir, "run"),
      outcome: "severity",
      exposure: "x",
      variables: [],
      covariates: ["site"],
      exactCovariates: [],
      estimand: "ATT",
      matchRatio: 1,
      replacement: false,
      trimThreshold: 0.01,
      stabilizeWeights: true,
      surveyDesign: false,
      allowSurveyApproximation: false,
      alpha: 0.05,
      python,
    });

    expect(result.status).toBe("succeeded");
    expect(result.diagnostics.converged).toBe(true);
    expect(result.diagnostics).toMatchObject({
      artifacts: expect.objectContaining({
        regression_model_frame: expect.stringContaining("regression-model-frame.csv"),
        regression_design_matrix: expect.stringContaining("regression-design-matrix.csv"),
        regression_predictions: expect.stringContaining("regression-predictions.csv"),
        ordinal_proportional_odds: expect.stringContaining("ordinal-proportional-odds-check.csv"),
      }),
    });
    expect(result.diagnostics).toMatchObject({
      ordinal_proportional_odds_check: expect.stringMatching(/pass|warning|not_available/),
      ordinal_proportional_odds_threshold_models_attempted: expect.any(Number),
      ordinal_proportional_odds_threshold_models_estimated: expect.any(Number),
    });
    expect(result.artifacts.some(artifact => artifact.path.endsWith("ordinal-proportional-odds-check.csv"))).toBe(true);
    const predictionRows = await readFile(path.join(dir, "run", "regression-predictions.csv"), "utf-8");
    expect(predictionRows).toContain("predicted_class");
    expect(predictionRows).toContain("probability_mild");
    const proportionalOddsRows = await readFile(path.join(dir, "run", "ordinal-proportional-odds-check.csv"), "utf-8");
    expect(proportionalOddsRows).toContain("threshold_coefficient");
    expect(proportionalOddsRows).toContain("term_summary");
    const figures = JSON.parse(await readFile(path.join(dir, "run", "figures.json"), "utf-8")) as { figures: Array<{ path: string }> };
    expect(figures.figures.map(figure => path.basename(figure.path))).toEqual(expect.arrayContaining(["ordinal-proportional-odds.png"]));
    const predictorRows = result.estimates.filter(row => row.parameter_role === "predictor");
    const thresholdRows = result.estimates.filter(row => row.parameter_role === "threshold");
    expect(predictorRows.find(row => row.term === "x")).toMatchObject({
      effect_measure: "cumulative_odds_ratio",
      estimate: expect.any(Number),
      std_error: expect.any(Number),
      p_value: expect.any(Number),
      ci_low: expect.any(Number),
      ci_high: expect.any(Number),
      odds_ratio: expect.any(Number),
      or_ci_low: expect.any(Number),
      or_ci_high: expect.any(Number),
    });
    expect(thresholdRows.length).toBe(2);
    for (const row of thresholdRows) {
      expect(row).toMatchObject({
        threshold_parameter: true,
        threshold_label: expect.any(String),
        interpretation: expect.stringContaining("do not interpret"),
        estimate: expect.any(Number),
        std_error: expect.any(Number),
        p_value: expect.any(Number),
        ci_low: expect.any(Number),
        ci_high: expect.any(Number),
      });
      expect(row.odds_ratio).toBeUndefined();
      expect(row.or_ci_low).toBeUndefined();
      expect(row.or_ci_high).toBeUndefined();
    }
    const qa = JSON.parse(await readFile(path.join(dir, "run", "stats-qa.json"), "utf-8")) as { checks: Array<{ id: string; status: string }> };
    expect(qa.checks.find(check => check.id === "ordinal-parameter-roles")?.status).toBe("pass");
    expect(qa.checks.find(check => check.id === "ordinal-proportional-odds-artifact")?.status).toBe("pass");
    expect(qa.checks.find(check => check.id === "ordinal-proportional-odds-screen")?.status).toMatch(/pass|warning/);
    expect(qa.checks.find(check => check.id === "model-convergence")?.status).toBe("pass");
    expect(qa.checks.find(check => check.id === "estimate-ci-order")?.status).toBe("pass");
    const report = await readFile(path.join(dir, "run", "stats-report.md"), "utf-8");
    expect(report).toContain("effect measure");
    expect(report).toContain("cumulative_odds_ratio");
    expect(report).toContain("threshold");
  });

  it("records standard errors, confidence intervals, and p-values for multinomial logistic contrasts", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "agenteer-stats-multinomial-inference-"));
    const dataPath = path.join(dir, "multinomial.csv");
    const pseudoRandom = (index: number) => {
      const raw = Math.sin(index * 78.233) * 23123.123;
      return raw - Math.floor(raw);
    };
    await writeFile(dataPath, [
      "disposition,x,site",
      ...Array.from({ length: 240 }, (_, index) => {
        const x = -2 + (4 * index) / 239;
        const site = index % 3 === 0 ? "A" : index % 3 === 1 ? "B" : "C";
        const etaRehab = -0.15 + 0.55 * x + (site === "B" ? 0.25 : 0);
        const etaSnf = 0.05 - 0.45 * x + (site === "C" ? 0.35 : 0);
        const denominator = 1 + Math.exp(etaRehab) + Math.exp(etaSnf);
        const pHome = 1 / denominator;
        const pRehab = Math.exp(etaRehab) / denominator;
        const u = pseudoRandom(index);
        const disposition = u < pHome ? "home" : u < pHome + pRehab ? "rehab" : "snf";
        return [disposition, x.toFixed(6), site].join(",");
      }),
    ].join("\n"));

    const result = await researchStatsRunCommand({
      method: "multinomial-logistic-regression",
      dataPath,
      outDir: path.join(dir, "run"),
      outcome: "disposition",
      exposure: "x",
      variables: [],
      covariates: ["site"],
      exactCovariates: [],
      estimand: "ATT",
      matchRatio: 1,
      replacement: false,
      trimThreshold: 0.01,
      stabilizeWeights: true,
      surveyDesign: false,
      allowSurveyApproximation: false,
      alpha: 0.05,
      python,
    });

    expect(result.status).toBe("succeeded");
    const xContrasts = result.estimates.filter(row => String(row.term).startsWith("x:"));
    expect(xContrasts.length).toBe(2);
    for (const row of xContrasts) {
      expect(row).toMatchObject({
        baseline_level: "home",
        estimate: expect.any(Number),
        std_error: expect.any(Number),
        p_value: expect.any(Number),
        ci_low: expect.any(Number),
        ci_high: expect.any(Number),
        odds_ratio: expect.any(Number),
        or_ci_low: expect.any(Number),
        or_ci_high: expect.any(Number),
      });
      expect(row.p_value as number).toBeGreaterThanOrEqual(0);
      expect(row.p_value as number).toBeLessThanOrEqual(1);
    }
    const qa = JSON.parse(await readFile(path.join(dir, "run", "stats-qa.json"), "utf-8")) as { checks: Array<{ id: string; status: string }> };
    expect(qa.checks.find(check => check.id === "estimate-p-values-in-domain")?.status).toBe("pass");
    expect(qa.checks.find(check => check.id === "estimate-ci-order")?.status).toBe("pass");
    expect(qa.checks.find(check => check.id === "multinomial-class-diagnostic-artifacts")?.status).toBe("pass");
    expect(qa.checks.find(check => check.id === "multinomial-class-support")?.status).toMatch(/pass|warning/);
    expect(qa.checks.find(check => check.id === "multinomial-prediction-coverage")?.status).toMatch(/pass|warning/);
    expect(result.diagnostics).toMatchObject({
      multinomial_accuracy: expect.any(Number),
      multinomial_macro_f1: expect.any(Number),
      artifacts: expect.objectContaining({
        multinomial_confusion_matrix: expect.stringContaining("multinomial-confusion-matrix.csv"),
        multinomial_class_metrics: expect.stringContaining("multinomial-class-metrics.csv"),
      }),
    });
    expect(result.artifacts.some(artifact => artifact.path.endsWith("multinomial-confusion-matrix.csv"))).toBe(true);
    expect(result.artifacts.some(artifact => artifact.path.endsWith("multinomial-class-metrics.csv"))).toBe(true);
    const confusion = await readFile(path.join(dir, "run", "multinomial-confusion-matrix.csv"), "utf-8");
    expect(confusion).toContain("actual_level");
    expect(confusion).toContain("predicted_level");
    const metrics = await readFile(path.join(dir, "run", "multinomial-class-metrics.csv"), "utf-8");
    expect(metrics).toContain("macro_f1");
    expect(metrics).toContain("precision");
    const figures = JSON.parse(await readFile(path.join(dir, "run", "figures.json"), "utf-8")) as { figures: Array<{ path: string }> };
    expect(figures.figures.map(figure => path.basename(figure.path))).toEqual(expect.arrayContaining(["multinomial-confusion-matrix.png", "multinomial-class-metrics.png"]));
  });

  it("separates zero-inflated count and inflation component effects", async () => {
    const { dir, dataPath } = await writeStatsFixture();
    const result = await researchStatsRunCommand({
      method: "zero-inflated-poisson",
      dataPath,
      outDir: path.join(dir, "zero-inflated-components"),
      outcome: "zi_count",
      exposure: "x",
      variables: [],
      covariates: ["g"],
      exactCovariates: [],
      estimand: "ATT",
      matchRatio: 1,
      replacement: false,
      trimThreshold: 0.01,
      stabilizeWeights: true,
      surveyDesign: false,
      allowSurveyApproximation: false,
      alpha: 0.05,
      python,
    });

    expect(result.status).toBe("succeeded");
    const countRow = result.estimates.find(row => row.term === "x");
    expect(countRow).toMatchObject({
      component: "count",
      effect_measure: "count_rate_ratio",
      estimate: expect.any(Number),
      std_error: expect.any(Number),
      p_value: expect.any(Number),
      ci_low: expect.any(Number),
      ci_high: expect.any(Number),
      rate_ratio: expect.any(Number),
      rr_ci_low: expect.any(Number),
      rr_ci_high: expect.any(Number),
    });
    const inflationRow = result.estimates.find(row => row.term === "inflate_const");
    expect(inflationRow).toMatchObject({
      component: "inflation",
      effect_measure: "zero_inflation_odds_ratio",
      zero_inflation_odds_ratio: expect.any(Number),
      zero_inflation_odds_ratio_ci_low: expect.any(Number),
      zero_inflation_odds_ratio_ci_high: expect.any(Number),
      interpretation: expect.stringContaining("structural-zero process"),
    });
    expect(inflationRow?.rate_ratio).toBeUndefined();
    expect(inflationRow?.rr_ci_low).toBeUndefined();
    expect(inflationRow?.rr_ci_high).toBeUndefined();
    const qa = JSON.parse(await readFile(path.join(dir, "zero-inflated-components", "stats-qa.json"), "utf-8")) as { checks: Array<{ id: string; status: string }> };
    expect(qa.checks.find(check => check.id === "zero-inflated-component-semantics")?.status).toBe("pass");
    expect(qa.checks.find(check => check.id === "estimate-ratios-nonnegative")?.status).toBe("pass");
    expect(qa.checks.find(check => check.id === "estimate-ci-order")?.status).toBe("pass");
    const report = await readFile(path.join(dir, "zero-inflated-components", "stats-report.md"), "utf-8");
    expect(report).toContain("count_rate_ratio");
    expect(report).toContain("zero_inflation_odds_ratio");
    expect(report).toContain("| inflate_const |  | inflation | zero_inflation_odds_ratio |");
  });

  it("uses multiplicative mean-ratio semantics for positive continuous GLMs", async () => {
    const { dir, dataPath } = await writeStatsFixture();
    const result = await researchStatsRunCommand({
      method: "gamma-glm",
      dataPath,
      outDir: path.join(dir, "gamma-mean-ratio"),
      outcome: "y",
      exposure: "x",
      variables: [],
      covariates: ["g"],
      exactCovariates: [],
      estimand: "ATT",
      matchRatio: 1,
      replacement: false,
      trimThreshold: 0.01,
      stabilizeWeights: true,
      surveyDesign: false,
      allowSurveyApproximation: false,
      alpha: 0.05,
      python,
    });

    expect(result.status).toBe("succeeded");
    const exposureRow = result.estimates.find(row => row.term === "x");
    expect(exposureRow).toMatchObject({
      effect_measure: "multiplicative_mean_ratio",
      estimate: expect.any(Number),
      std_error: expect.any(Number),
      p_value: expect.any(Number),
      ci_low: expect.any(Number),
      ci_high: expect.any(Number),
      mean_ratio: expect.any(Number),
      mean_ratio_ci_low: expect.any(Number),
      mean_ratio_ci_high: expect.any(Number),
      interpretation: expect.stringContaining("multiplicative mean ratio"),
    });
    expect(exposureRow?.rate_ratio).toBeUndefined();
    expect(exposureRow?.rr_ci_low).toBeUndefined();
    expect(exposureRow?.rr_ci_high).toBeUndefined();
    expect(result.diagnostics).toMatchObject({
      positive_glm_fit_row_count: expect.any(Number),
      positive_glm_observed_mean: expect.any(Number),
      positive_glm_fitted_mean: expect.any(Number),
      positive_glm_observed_to_fitted_mean_ratio: expect.any(Number),
      positive_glm_mean_absolute_relative_error: expect.any(Number),
      artifacts: expect.objectContaining({
        positive_glm_fit_summary: expect.stringContaining("positive-glm-fit-summary.csv"),
      }),
    });
    expect(result.artifacts.some(artifact => artifact.path.endsWith("positive-glm-fit-summary.csv"))).toBe(true);
    const fitSummary = await readFile(path.join(dir, "gamma-mean-ratio", "positive-glm-fit-summary.csv"), "utf-8");
    expect(fitSummary).toContain("observed_to_fitted_mean_ratio");
    expect(fitSummary).toContain("mean_absolute_relative_error");
    const figures = JSON.parse(await readFile(path.join(dir, "gamma-mean-ratio", "figures.json"), "utf-8")) as { figures: Array<{ path: string }> };
    expect(figures.figures.map(figure => path.basename(figure.path))).toEqual(expect.arrayContaining(["positive-glm-observed-vs-fitted.png"]));
    const qa = JSON.parse(await readFile(path.join(dir, "gamma-mean-ratio", "stats-qa.json"), "utf-8")) as { checks: Array<{ id: string; status: string }> };
    expect(qa.checks.find(check => check.id === "positive-glm-mean-ratio-semantics")?.status).toBe("pass");
    expect(qa.checks.find(check => check.id === "positive-glm-fit-artifact")?.status).toBe("pass");
    expect(qa.checks.find(check => check.id === "positive-glm-fitted-mean-calibration")?.status).toMatch(/pass|warning/);
    expect(qa.checks.find(check => check.id === "positive-glm-relative-error")?.status).toMatch(/pass|warning/);
    expect(qa.checks.find(check => check.id === "estimate-ratios-nonnegative")?.status).toBe("pass");
    expect(qa.checks.find(check => check.id === "estimate-p-value-ci-null-consistency")?.status).toBe("pass");
    const report = await readFile(path.join(dir, "gamma-mean-ratio", "stats-report.md"), "utf-8");
    expect(report).toContain("multiplicative_mean_ratio");
    expect(report).toContain("| x |  |  | multiplicative_mean_ratio |");
  });

	  it("warns when positive continuous GLMs have weak skewed-outcome support", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "agenteer-stats-positive-glm-support-"));
    const dataPath = path.join(dir, "weak-positive-glm.csv");
    await writeFile(dataPath, [
      "y,x",
      ...Array.from({ length: 120 }, (_, index) => {
        const x = index / 119;
        const y = 10 + 0.02 * x + (index % 5) * 0.001;
        return [y.toFixed(6), x.toFixed(6)].join(",");
      }),
    ].join("\n"));

    const result = await researchStatsRunCommand({
      method: "gamma-glm",
      dataPath,
      outDir: path.join(dir, "run"),
      outcome: "y",
      exposure: "x",
      variables: [],
      covariates: [],
      exactCovariates: [],
      estimand: "ATT",
      matchRatio: 1,
      replacement: false,
      trimThreshold: 0.01,
      stabilizeWeights: true,
      surveyDesign: false,
      allowSurveyApproximation: false,
      alpha: 0.05,
      python,
    });

    expect(result.status).toBe("succeeded");
    expect(result.issues.map(issue => issue.code)).toContain("STATS_POSITIVE_GLM_DISTRIBUTION_SUPPORT_WEAK");
    expect(result.diagnostics).toMatchObject({
      positive_outcome_support_status: "weak",
      positive_outcome_skewness: expect.any(Number),
      positive_outcome_coefficient_of_variation: expect.any(Number),
    });
    const qa = JSON.parse(await readFile(path.join(dir, "run", "stats-qa.json"), "utf-8")) as { checks: Array<{ id: string; status: string }> };
    expect(qa.checks.find(check => check.id === "positive-glm-distribution-support")?.status).toBe("warning");
    expect(qa.checks.find(check => check.id === "positive-glm-mean-ratio-semantics")?.status).toBe("pass");
  });

  it("records quantile regression residual balance and pinball diagnostics", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "agenteer-stats-quantile-diagnostics-"));
    const dataPath = path.join(dir, "quantile.csv");
    await writeFile(dataPath, [
      "y,x,g",
      ...Array.from({ length: 180 }, (_, index) => {
        const x = -2 + (4 * index) / 179;
        const g = index % 2;
        const skew = index % 17 === 0 ? 6 : (index % 5) * 0.15;
        const y = 3 + 1.1 * x + 0.7 * g + skew;
        return [y.toFixed(6), x.toFixed(6), g].join(",");
      }),
    ].join("\n"));

    const result = await researchStatsRunCommand({
      method: "quantile-regression",
      dataPath,
      outDir: path.join(dir, "run"),
      outcome: "y",
      exposure: "x",
      variables: [],
      covariates: ["g"],
      exactCovariates: [],
      estimand: "ATT",
      matchRatio: 1,
      replacement: false,
      trimThreshold: 0.01,
      stabilizeWeights: true,
      surveyDesign: false,
      allowSurveyApproximation: false,
      alpha: 0.05,
      python,
    });

    expect(result.status).toBe("succeeded");
    expect(result.diagnostics).toMatchObject({
      quantile_tau: 0.5,
      quantile_fit_row_count: expect.any(Number),
      quantile_fraction_observed_at_or_below_fitted: expect.any(Number),
      quantile_mean_pinball_loss: expect.any(Number),
      artifacts: expect.objectContaining({
        quantile_fit_summary: expect.stringContaining("quantile-fit-summary.csv"),
      }),
    });
    expect(result.artifacts.some(artifact => artifact.path.endsWith("quantile-fit-summary.csv"))).toBe(true);
    const summary = await readFile(path.join(dir, "run", "quantile-fit-summary.csv"), "utf-8");
    expect(summary).toContain("mean_pinball_loss");
    expect(summary).toContain("fraction_observed_at_or_below_fitted");
    const figures = JSON.parse(await readFile(path.join(dir, "run", "figures.json"), "utf-8")) as { figures: Array<{ path: string }> };
    expect(figures.figures.map(figure => path.basename(figure.path))).toEqual(expect.arrayContaining(["quantile-residual-balance.png"]));
    const qa = JSON.parse(await readFile(path.join(dir, "run", "stats-qa.json"), "utf-8")) as { checks: Array<{ id: string; status: string }> };
    expect(qa.checks.find(check => check.id === "quantile-fit-artifact")?.status).toBe("pass");
    expect(qa.checks.find(check => check.id === "quantile-residual-balance")?.status).toMatch(/pass|warning/);
    expect(qa.checks.find(check => check.id === "quantile-pinball-loss")?.status).toBe("pass");
  });

  it("records robust linear Huber weights and downweighting diagnostics", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "agenteer-stats-robust-linear-"));
    const dataPath = path.join(dir, "robust.csv");
    await writeFile(dataPath, [
      "y,x,g",
      ...Array.from({ length: 160 }, (_, index) => {
        const x = -2 + (4 * index) / 159;
        const g = index % 2;
        const outlier = index % 53 === 0 ? 18 : index % 47 === 0 ? -14 : 0;
        const y = 5 + 1.4 * x + 0.6 * g + outlier + (index % 7) * 0.04;
        return [y.toFixed(6), x.toFixed(6), g].join(",");
      }),
    ].join("\n"));

    const result = await researchStatsRunCommand({
      method: "robust-linear-regression",
      dataPath,
      outDir: path.join(dir, "run"),
      outcome: "y",
      exposure: "x",
      variables: [],
      covariates: ["g"],
      exactCovariates: [],
      estimand: "ATT",
      matchRatio: 1,
      replacement: false,
      trimThreshold: 0.01,
      stabilizeWeights: true,
      surveyDesign: false,
      allowSurveyApproximation: false,
      alpha: 0.05,
      python,
    });

    expect(result.status).toBe("succeeded");
    expect(result.diagnostics).toMatchObject({
      robust_weight_row_count: expect.any(Number),
      robust_downweighted_rows: expect.any(Number),
      robust_downweighted_fraction: expect.any(Number),
      robust_min_weight: expect.any(Number),
      robust_max_abs_standardized_residual: expect.any(Number),
      artifacts: expect.objectContaining({
        robust_linear_weights: expect.stringContaining("robust-linear-weights.csv"),
      }),
    });
    expect((result.diagnostics.robust_downweighted_rows as number)).toBeGreaterThan(0);
    expect(result.artifacts.some(artifact => artifact.path.endsWith("robust-linear-weights.csv"))).toBe(true);
    const weights = await readFile(path.join(dir, "run", "robust-linear-weights.csv"), "utf-8");
    expect(weights).toContain("robust_weight");
    expect(weights).toContain("downweighted_flag");
    const figures = JSON.parse(await readFile(path.join(dir, "run", "figures.json"), "utf-8")) as { figures: Array<{ path: string }> };
    expect(figures.figures.map(figure => path.basename(figure.path))).toEqual(expect.arrayContaining(["robust-linear-weights.png"]));
    const qa = JSON.parse(await readFile(path.join(dir, "run", "stats-qa.json"), "utf-8")) as { checks: Array<{ id: string; status: string }> };
    expect(qa.checks.find(check => check.id === "robust-linear-weight-artifact")?.status).toBe("pass");
    expect(qa.checks.find(check => check.id === "robust-linear-downweighting")?.status).toMatch(/pass|warning/);
    expect(qa.checks.find(check => check.id === "robust-linear-residual-scale")?.status).toMatch(/pass|warning/);
  });

  it("records penalized regression scaling, coefficient profile, and validation diagnostics", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "agenteer-stats-penalized-diagnostics-"));
    const dataPath = path.join(dir, "penalized.csv");
    await writeFile(dataPath, [
      "y,ybin,x,z,cat",
      ...Array.from({ length: 180 }, (_, index) => {
        const x = -2 + (4 * index) / 179;
        const z = Math.cos(index / 9);
        const cat = index % 3 === 0 ? "a" : index % 3 === 1 ? "b" : "c";
        const catEffect = cat === "b" ? 0.55 : cat === "c" ? -0.35 : 0;
        const y = 4 + 1.6 * x - 0.8 * z + catEffect + (index % 11) * 0.035;
        const score = -0.1 + 1.15 * x - 0.75 * z + catEffect + (index % 7) * 0.04;
        const ybin = score > 0 ? 1 : 0;
        return [y.toFixed(6), ybin, x.toFixed(6), z.toFixed(6), cat].join(",");
      }),
    ].join("\n"));

    const base = {
      dataPath,
      variables: [],
      covariates: ["z", "cat"],
      exactCovariates: [],
      estimand: "ATT" as const,
      matchRatio: 1,
      replacement: false,
      trimThreshold: 0.01,
      stabilizeWeights: true,
      surveyDesign: false,
      allowSurveyApproximation: false,
      alpha: 0.05,
      python,
      alphaPenalty: 0.03,
      l1Ratio: 0.7,
    };

    const linear = await researchStatsRunCommand({
      ...base,
      method: "penalized-linear-regression",
      outDir: path.join(dir, "linear"),
      outcome: "y",
      exposure: "x",
    });

    expect(linear.status).toBe("succeeded");
    expect(linear.diagnostics).toMatchObject({
      coefficient_scale: "standardized_features",
      penalized_cv_status: "available",
      artifacts: expect.objectContaining({
        penalized_feature_scaling: expect.stringContaining("penalized-feature-scaling.csv"),
        penalized_coefficient_profile: expect.stringContaining("penalized-coefficient-profile.csv"),
        penalized_cv_summary: expect.stringContaining("penalized-cv-summary.csv"),
      }),
    });
    expect(linear.artifacts.some(artifact => artifact.path.endsWith("penalized-feature-scaling.csv"))).toBe(true);
    expect(linear.artifacts.some(artifact => artifact.path.endsWith("penalized-coefficient-profile.csv"))).toBe(true);
    expect(linear.artifacts.some(artifact => artifact.path.endsWith("penalized-cv-summary.csv"))).toBe(true);
    const scaling = await readFile(path.join(dir, "linear", "penalized-feature-scaling.csv"), "utf-8");
    expect(scaling).toContain("scale_used");
    const profile = await readFile(path.join(dir, "linear", "penalized-coefficient-profile.csv"), "utf-8");
    expect(profile).toContain("coefficient_scale");
    expect(profile).toContain("per_standard_deviation");
    const linearFigures = JSON.parse(await readFile(path.join(dir, "linear", "figures.json"), "utf-8")) as { figures: Array<{ path: string }> };
    expect(linearFigures.figures.map(figure => path.basename(figure.path))).toEqual(expect.arrayContaining(["penalized-coefficients.png", "penalized-cv-performance.png"]));
    const linearQa = JSON.parse(await readFile(path.join(dir, "linear", "stats-qa.json"), "utf-8")) as { checks: Array<{ id: string; status: string }> };
    expect(linearQa.checks.find(check => check.id === "penalized-feature-scaling-artifact")?.status).toBe("pass");
    expect(linearQa.checks.find(check => check.id === "penalized-coefficient-profile")?.status).toMatch(/pass|warning/);
    expect(linearQa.checks.find(check => check.id === "penalized-validation-artifact")?.status).toBe("pass");

    const logistic = await researchStatsRunCommand({
      ...base,
      method: "penalized-logistic-regression",
      outDir: path.join(dir, "logistic"),
      outcome: "ybin",
      exposure: "x",
    });

    expect(logistic.status).toBe("succeeded");
    expect(logistic.diagnostics).toMatchObject({
      coefficient_scale: "standardized_features",
      penalized_cv_status: "available",
      penalized_cv_mean_auc: expect.any(Number),
    });
    const logisticProfile = await readFile(path.join(dir, "logistic", "penalized-coefficient-profile.csv"), "utf-8");
    expect(logisticProfile).toContain("odds_ratio_per_standard_deviation");
    const logisticFigures = JSON.parse(await readFile(path.join(dir, "logistic", "figures.json"), "utf-8")) as { figures: Array<{ path: string }> };
    expect(logisticFigures.figures.map(figure => path.basename(figure.path))).toEqual(expect.arrayContaining(["penalized-coefficients.png", "penalized-cv-performance.png"]));
  });

  it("blocks group-comparison methods when a complete-case group is too small", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "agenteer-stats-group-support-"));
    const dataPath = path.join(dir, "sparse-group.csv");
    await writeFile(dataPath, [
      "y,g",
      ...Array.from({ length: 60 }, (_, index) => `${(10 + index / 10).toFixed(3)},0`),
      "16.500,1",
    ].join("\n"));
    const result = await researchStatsRunCommand({
      method: "welch-t-test",
      dataPath,
      outDir: path.join(dir, "run"),
      outcome: "y",
      group: "g",
      variables: [],
      covariates: [],
      exactCovariates: [],
      estimand: "ATT",
      matchRatio: 1,
      replacement: false,
      trimThreshold: 0.01,
      stabilizeWeights: true,
      surveyDesign: false,
      allowSurveyApproximation: false,
      alpha: 0.05,
      python,
    });

    expect(result.status).toBe("failed");
    expect(result.issues.map(issue => issue.code)).toContain("STATS_GROUP_COMPLETE_CASE_SUPPORT_LOW");
    const preflight = result.diagnostics.preflight as { status?: string; checks?: Array<{ id: string; status: string; detail: string }> };
    expect(preflight.status).toBe("block");
    const groupSupport = preflight.checks?.find(check => check.id === "group-complete-case-support");
    expect(groupSupport?.status).toBe("block");
    expect(groupSupport?.detail).toContain("1: 1");
  });

  it("blocks 2x2-only categorical tests when the table shape is incompatible", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "agenteer-stats-categorical-shape-"));
    const dataPath = path.join(dir, "three-level-outcome.csv");
    await writeFile(dataPath, [
      "outcome,exposure",
      ...Array.from({ length: 90 }, (_, index) => `${index % 3},${index % 2}`),
    ].join("\n"));
    const result = await researchStatsRunCommand({
      method: "fisher-exact",
      dataPath,
      outDir: path.join(dir, "run"),
      outcome: "outcome",
      exposure: "exposure",
      variables: [],
      covariates: [],
      exactCovariates: [],
      estimand: "ATT",
      matchRatio: 1,
      replacement: false,
      trimThreshold: 0.01,
      stabilizeWeights: true,
      surveyDesign: false,
      allowSurveyApproximation: false,
      alpha: 0.05,
      python,
    });

    expect(result.status).toBe("failed");
    expect(result.issues.map(issue => issue.code)).toContain("STATS_CATEGORICAL_TABLE_SHAPE_UNSUPPORTED");
    const preflight = result.diagnostics.preflight as { status?: string; checks?: Array<{ id: string; status: string; detail: string }> };
    expect(preflight.status).toBe("block");
    const shape = preflight.checks?.find(check => check.id === "two-by-two-categorical-levels");
    expect(shape?.status).toBe("block");
    expect(shape?.detail).toContain("outcome=3");
  });

  it("blocks count and positive GLMs when outcome domains are invalid", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "agenteer-stats-outcome-domain-"));
    const fractionalCountPath = path.join(dir, "fractional-count.csv");
    await writeFile(fractionalCountPath, [
      "y,x",
      ...Array.from({ length: 80 }, (_, index) => `${(index % 5) + 0.5},${(index / 10).toFixed(3)}`),
    ].join("\n"));
    const count = await researchStatsRunCommand({
      method: "poisson-regression",
      dataPath: fractionalCountPath,
      outDir: path.join(dir, "poisson"),
      outcome: "y",
      exposure: "x",
      variables: [],
      covariates: [],
      exactCovariates: [],
      estimand: "ATT",
      matchRatio: 1,
      replacement: false,
      trimThreshold: 0.01,
      stabilizeWeights: true,
      surveyDesign: false,
      allowSurveyApproximation: false,
      alpha: 0.05,
      python,
    });
    expect(count.status).toBe("failed");
    expect(count.issues.map(issue => issue.code)).toContain("STATS_COUNT_OUTCOME_DOMAIN_INVALID");
    expect(JSON.stringify(count.diagnostics.preflight)).toContain("non-integer");

    const marginalNegativeCountPath = path.join(dir, "marginal-negative-count.csv");
    await writeFile(marginalNegativeCountPath, [
      "y,x,age",
      "-1,1,",
      ...Array.from({ length: 80 }, (_, index) => `${index % 6},${index % 2},${45 + index % 30}`),
    ].join("\n"));
    const marginalNegativeCount = await researchStatsRunCommand({
      method: "poisson-regression",
      dataPath: marginalNegativeCountPath,
      outDir: path.join(dir, "poisson-marginal-negative"),
      outcome: "y",
      exposure: "x",
      variables: [],
      covariates: ["age"],
      exactCovariates: [],
      estimand: "ATT",
      matchRatio: 1,
      replacement: false,
      trimThreshold: 0.01,
      stabilizeWeights: true,
      surveyDesign: false,
      allowSurveyApproximation: false,
      alpha: 0.05,
      python,
    });
    expect(marginalNegativeCount.status).toBe("succeeded");
    expect(marginalNegativeCount.issues.map(issue => issue.code)).toContain("STATS_COUNT_OUTCOME_MARGINAL_DOMAIN_REVIEW");
    expect(marginalNegativeCount.issues.map(issue => issue.code)).not.toContain("STATS_COUNT_OUTCOME_DOMAIN_INVALID");
    const marginalCountPreflight = JSON.parse(await readFile(path.join(dir, "poisson-marginal-negative", "stats-preflight.json"), "utf-8")) as { statsPreflight: { checks: Array<{ id: string; status: string; detail: string }>; methodDecisionSupport: { requestedRole: string; verdict: string; dataSignals: Record<string, unknown>; primaryMethods: Array<{ method: string }> } } };
    expect(marginalCountPreflight.statsPreflight.checks.find(check => check.id === "count-outcome-marginal-domain")).toMatchObject({ status: "warning" });
    expect(marginalCountPreflight.statsPreflight.methodDecisionSupport).toMatchObject({
      requestedRole: "primary",
      verdict: "preferred",
      dataSignals: expect.objectContaining({
        countOutcomeNegativeValues: 0,
        countOutcomeNonIntegerValues: 0,
      }),
      primaryMethods: expect.arrayContaining([expect.objectContaining({ method: "poisson-regression" })]),
    });

    const badOffsetPath = path.join(dir, "bad-offset.csv");
    await writeFile(badOffsetPath, [
      "y,x,person_time",
      "1,0,1",
      "2,1,0",
      "3,1,-1",
      "4,0,2",
    ].join("\n"));
    const badOffset = await researchStatsRunCommand({
      method: "poisson-regression",
      dataPath: badOffsetPath,
      outDir: path.join(dir, "poisson-bad-offset"),
      outcome: "y",
      exposure: "x",
      offset: "person_time",
      variables: [],
      covariates: [],
      exactCovariates: [],
      estimand: "ATT",
      matchRatio: 1,
      replacement: false,
      trimThreshold: 0.01,
      stabilizeWeights: true,
      surveyDesign: false,
      allowSurveyApproximation: false,
      alpha: 0.05,
      python,
    });
    expect(badOffset.status).toBe("failed");
    expect(badOffset.issues.map(issue => issue.code)).toContain("STATS_OFFSET_POSITIVE_DOMAIN_INVALID");
    expect(JSON.stringify(badOffset.diagnostics.preflight)).toContain("strictly positive");

    const overdispersedZeroPath = path.join(dir, "overdispersed-zero-count.csv");
    await writeFile(overdispersedZeroPath, [
      "y,x",
      ...Array.from({ length: 120 }, (_, index) => {
        const x = Math.floor(index / 2) % 2;
        const slot = index % 10;
        const y = slot < 6 ? 0 : x ? 30 + slot : 3 + slot;
        return `${y},${x}`;
      }),
    ].join("\n"));
    const poissonSuitability = await researchStatsRunCommand({
      method: "poisson-regression",
      dataPath: overdispersedZeroPath,
      outDir: path.join(dir, "poisson-suitability"),
      outcome: "y",
      exposure: "x",
      variables: [],
      covariates: [],
      exactCovariates: [],
      estimand: "ATT",
      matchRatio: 1,
      replacement: false,
      trimThreshold: 0.01,
      stabilizeWeights: true,
      surveyDesign: false,
      allowSurveyApproximation: false,
      alpha: 0.05,
      python,
    });
    expect(poissonSuitability.status).toBe("succeeded");
    expect(poissonSuitability.issues.map(issue => issue.code)).toEqual(expect.arrayContaining([
      "STATS_POISSON_OVERDISPERSION_PRECHECK",
      "STATS_COUNT_ZERO_INFLATION_REVIEW",
    ]));
    const poissonPreflight = JSON.parse(await readFile(path.join(dir, "poisson-suitability", "stats-preflight.json"), "utf-8")) as { statsPreflight: { checks: Array<{ id: string; status: string }> } };
    expect(poissonPreflight.statsPreflight.checks.find(check => check.id === "poisson-overdispersion-support")?.status).toBe("warning");
    expect(poissonPreflight.statsPreflight.checks.find(check => check.id === "count-zero-inflation-review")?.status).toBe("warning");

    const zeroPath = path.join(dir, "zero-positive.csv");
    await writeFile(zeroPath, [
      "y,x",
      ...Array.from({ length: 80 }, (_, index) => `${index === 0 ? 0 : (1 + index / 10).toFixed(3)},${(index / 10).toFixed(3)}`),
    ].join("\n"));
    const gamma = await researchStatsRunCommand({
      method: "gamma-glm",
      dataPath: zeroPath,
      outDir: path.join(dir, "gamma"),
      outcome: "y",
      exposure: "x",
      variables: [],
      covariates: [],
      exactCovariates: [],
      estimand: "ATT",
      matchRatio: 1,
      replacement: false,
      trimThreshold: 0.01,
      stabilizeWeights: true,
      surveyDesign: false,
      allowSurveyApproximation: false,
      alpha: 0.05,
      python,
    });
    expect(gamma.status).toBe("failed");
    expect(gamma.issues.map(issue => issue.code)).toContain("STATS_POSITIVE_OUTCOME_REQUIRED");

    const marginalZeroPositivePath = path.join(dir, "marginal-zero-positive.csv");
    await writeFile(marginalZeroPositivePath, [
      "y,x,age",
      "0,1,",
      ...Array.from({ length: 80 }, (_, index) => `${(1 + index / 10).toFixed(3)},${(index / 10).toFixed(3)},${45 + index % 30}`),
    ].join("\n"));
    const marginalZeroGamma = await researchStatsRunCommand({
      method: "gamma-glm",
      dataPath: marginalZeroPositivePath,
      outDir: path.join(dir, "gamma-marginal-zero"),
      outcome: "y",
      exposure: "x",
      variables: [],
      covariates: ["age"],
      exactCovariates: [],
      estimand: "ATT",
      matchRatio: 1,
      replacement: false,
      trimThreshold: 0.01,
      stabilizeWeights: true,
      surveyDesign: false,
      allowSurveyApproximation: false,
      alpha: 0.05,
      python,
    });
    expect(marginalZeroGamma.status).toBe("succeeded");
    expect(marginalZeroGamma.issues.map(issue => issue.code)).toContain("STATS_POSITIVE_OUTCOME_MARGINAL_DOMAIN_REVIEW");
    expect(marginalZeroGamma.issues.map(issue => issue.code)).not.toContain("STATS_POSITIVE_OUTCOME_REQUIRED");
    const marginalGammaPreflight = JSON.parse(await readFile(path.join(dir, "gamma-marginal-zero", "stats-preflight.json"), "utf-8")) as { statsPreflight: { checks: Array<{ id: string; status: string; detail: string }>; methodDecisionSupport: { requestedRole: string; verdict: string; dataSignals: Record<string, unknown>; primaryMethods: Array<{ method: string }> } } };
    expect(marginalGammaPreflight.statsPreflight.checks.find(check => check.id === "positive-continuous-outcome-marginal-domain")).toMatchObject({ status: "warning" });
    expect(marginalGammaPreflight.statsPreflight.methodDecisionSupport).toMatchObject({
      requestedRole: "primary",
      verdict: "preferred",
      dataSignals: expect.objectContaining({
        positiveOutcomeMin: 1,
      }),
      primaryMethods: expect.arrayContaining([expect.objectContaining({ method: "gamma-glm" })]),
    });
  });

  it("blocks methods whose requested contrast has no complete-case variation", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "agenteer-stats-variation-"));
    const constantExposurePath = path.join(dir, "constant-exposure.csv");
    await writeFile(constantExposurePath, [
      "y,x,z",
      ...Array.from({ length: 80 }, (_, index) => `${(1 + index / 10).toFixed(3)},1,${index % 2}`),
    ].join("\n"));
    const regression = await researchStatsRunCommand({
      method: "linear-regression",
      dataPath: constantExposurePath,
      outDir: path.join(dir, "constant-exposure-run"),
      outcome: "y",
      exposure: "x",
      variables: [],
      covariates: ["z"],
      exactCovariates: [],
      estimand: "ATT",
      matchRatio: 1,
      replacement: false,
      trimThreshold: 0.01,
      stabilizeWeights: true,
      surveyDesign: false,
      allowSurveyApproximation: false,
      alpha: 0.05,
      python,
    });
    expect(regression.status).toBe("failed");
    expect(regression.issues.map(issue => issue.code)).toContain("STATS_EXPOSURE_VARIATION_INSUFFICIENT");

    const constantOutcomePath = path.join(dir, "constant-outcome.csv");
    await writeFile(constantOutcomePath, [
      "y,x,z",
      ...Array.from({ length: 80 }, (_, index) => `1,${(index / 10).toFixed(3)},${index % 2}`),
    ].join("\n"));
    const constantOutcome = await researchStatsRunCommand({
      method: "linear-regression",
      dataPath: constantOutcomePath,
      outDir: path.join(dir, "constant-outcome-run"),
      outcome: "y",
      exposure: "x",
      variables: [],
      covariates: ["z"],
      exactCovariates: [],
      estimand: "ATT",
      matchRatio: 1,
      replacement: false,
      trimThreshold: 0.01,
      stabilizeWeights: true,
      surveyDesign: false,
      allowSurveyApproximation: false,
      alpha: 0.05,
      python,
    });
    expect(constantOutcome.status).toBe("failed");
    expect(constantOutcome.issues.map(issue => issue.code)).toContain("STATS_OUTCOME_VARIATION_INSUFFICIENT");

    const oneGroupPath = path.join(dir, "one-group.csv");
    await writeFile(oneGroupPath, [
      "y,g",
      ...Array.from({ length: 80 }, (_, index) => `${(1 + index / 10).toFixed(3)},0`),
    ].join("\n"));
    const group = await researchStatsRunCommand({
      method: "welch-t-test",
      dataPath: oneGroupPath,
      outDir: path.join(dir, "one-group-run"),
      outcome: "y",
      group: "g",
      variables: [],
      covariates: [],
      exactCovariates: [],
      estimand: "ATT",
      matchRatio: 1,
      replacement: false,
      trimThreshold: 0.01,
      stabilizeWeights: true,
      surveyDesign: false,
      allowSurveyApproximation: false,
      alpha: 0.05,
      python,
    });
    expect(group.status).toBe("failed");
    expect(group.issues.map(issue => issue.code)).toContain("STATS_GROUP_LEVELS_INSUFFICIENT");

    const constantCovariatePath = path.join(dir, "constant-covariate.csv");
    await writeFile(constantCovariatePath, [
      "y,x,z",
      ...Array.from({ length: 80 }, (_, index) => `${(1 + index / 10).toFixed(3)},${(index / 10).toFixed(3)},1`),
    ].join("\n"));
    const partial = await researchStatsRunCommand({
      method: "partial-correlation",
      dataPath: constantCovariatePath,
      outDir: path.join(dir, "constant-covariate-run"),
      outcome: "y",
      exposure: "x",
      variables: [],
      covariates: ["z"],
      exactCovariates: [],
      estimand: "ATT",
      matchRatio: 1,
      replacement: false,
      trimThreshold: 0.01,
      stabilizeWeights: true,
      surveyDesign: false,
      allowSurveyApproximation: false,
      alpha: 0.05,
      python,
    });
    expect(partial.status).toBe("failed");
    expect(partial.issues.map(issue => issue.code)).toContain("STATS_COVARIATE_VARIATION_INSUFFICIENT");

    const constantCategoricalOutcomePath = path.join(dir, "constant-categorical-outcome.csv");
    await writeFile(constantCategoricalOutcomePath, [
      "y,g",
      ...Array.from({ length: 80 }, (_, index) => `case,${index % 2}`),
    ].join("\n"));
    const categorical = await researchStatsRunCommand({
      method: "chi-square",
      dataPath: constantCategoricalOutcomePath,
      outDir: path.join(dir, "constant-categorical-outcome-run"),
      outcome: "y",
      exposure: "g",
      variables: [],
      covariates: [],
      exactCovariates: [],
      estimand: "ATT",
      matchRatio: 1,
      replacement: false,
      trimThreshold: 0.01,
      stabilizeWeights: true,
      surveyDesign: false,
      allowSurveyApproximation: false,
      alpha: 0.05,
      python,
    });
    expect(categorical.status).toBe("failed");
    expect(categorical.issues.map(issue => issue.code)).toContain("STATS_OUTCOME_VARIATION_INSUFFICIENT");
  });

  it("blocks duplicated model terms and conflicting adjustment roles before execution", async () => {
    const { dir, dataPath } = await writeStatsFixture();
    const duplicatedCovariates = await researchStatsRunCommand({
      method: "linear-regression",
      dataPath,
      outDir: path.join(dir, "duplicate-model-covariates"),
      outcome: "y",
      exposure: "x",
      variables: [],
      covariates: ["g", "g"],
      exactCovariates: [],
      estimand: "ATT",
      matchRatio: 1,
      replacement: false,
      trimThreshold: 0.01,
      stabilizeWeights: true,
      surveyDesign: false,
      allowSurveyApproximation: false,
      alpha: 0.05,
      python,
    });
    expect(duplicatedCovariates.status).toBe("failed");
    expect(duplicatedCovariates.issues.map(issue => issue.code)).toContain("STATS_MODEL_COVARIATES_DUPLICATED");

    const exposureAsCovariate = await researchStatsRunCommand({
      method: "linear-regression",
      dataPath,
      outDir: path.join(dir, "exposure-as-covariate"),
      outcome: "y",
      exposure: "x",
      variables: [],
      covariates: ["x", "g"],
      exactCovariates: [],
      estimand: "ATT",
      matchRatio: 1,
      replacement: false,
      trimThreshold: 0.01,
      stabilizeWeights: true,
      surveyDesign: false,
      allowSurveyApproximation: false,
      alpha: 0.05,
      python,
    });
    expect(exposureAsCovariate.status).toBe("failed");
    expect(exposureAsCovariate.issues.map(issue => issue.code)).toContain("STATS_MODEL_ROLE_CONFLICT");

    const exactTreatmentConflict = await researchStatsRunCommand({
      method: "propensity-score-matching",
      dataPath,
      outDir: path.join(dir, "exact-treatment-conflict"),
      outcome: "y",
      exposure: "treat",
      variables: [],
      covariates: ["x", "cat"],
      exactCovariates: ["treat"],
      estimand: "ATT",
      matchRatio: 1,
      replacement: false,
      trimThreshold: 0.01,
      stabilizeWeights: true,
      surveyDesign: false,
      allowSurveyApproximation: false,
      alpha: 0.05,
      python,
    });
    expect(exactTreatmentConflict.status).toBe("failed");
    expect(exactTreatmentConflict.issues.map(issue => issue.code)).toContain("STATS_EXACT_MATCH_ROLE_CONFLICT");
  });

  it("blocks event models when event counts are too sparse for reliable inference", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "agenteer-stats-event-preflight-"));
    const dataPath = path.join(dir, "sparse-events.csv");
    await writeFile(dataPath, [
      "time,event,x,z",
      ...Array.from({ length: 90 }, (_, index) => `${index + 1},${index === 4 ? 1 : 0},${(index % 10) / 10},${index % 2}`),
    ].join("\n"));
    const result = await researchStatsRunCommand({
      method: "cox-proportional-hazards",
      dataPath,
      outDir: path.join(dir, "run"),
      time: "time",
      event: "event",
      exposure: "x",
      covariates: ["z"],
      variables: [],
      exactCovariates: [],
      estimand: "ATT",
      matchRatio: 1,
      replacement: false,
      trimThreshold: 0.01,
      stabilizeWeights: true,
      surveyDesign: false,
      allowSurveyApproximation: false,
      alpha: 0.05,
      python,
    });

    expect(result.status).toBe("failed");
    expect(result.issues.map(issue => issue.code)).toEqual(expect.arrayContaining(["STATS_EVENTS_PER_PREDICTOR_LOW"]));
    const preflight = result.diagnostics.preflight as { status?: string; checks?: Array<{ id: string; status: string }> };
    expect(preflight.status).toBe("block");
    expect(preflight.checks?.find(check => check.id === "events-per-predictor")?.status).toBe("block");
  });

  it("counts expanded categorical survival predictors before Cox execution", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "agenteer-stats-cox-expanded-preflight-"));
    try {
      const dataPath = path.join(dir, "expanded-categorical-events.csv");
      await writeFile(dataPath, [
        "time,event,x,site",
        ...Array.from({ length: 240 }, (_, index) => {
          const site = `site_${String(index % 12).padStart(2, "0")}`;
          const event = index < 24 ? 1 : 0;
          return `${index + 1},${event},${((index % 25) / 10).toFixed(2)},${site}`;
        }),
      ].join("\n"));

      const result = await researchStatsRunCommand({
        method: "cox-proportional-hazards",
        dataPath,
        outDir: path.join(dir, "run"),
        time: "time",
        event: "event",
        exposure: "x",
        covariates: ["site"],
        variables: [],
        exactCovariates: [],
        estimand: "ATT",
        matchRatio: 1,
        replacement: false,
        trimThreshold: 0.01,
        stabilizeWeights: true,
        surveyDesign: false,
        allowSurveyApproximation: false,
        alpha: 0.05,
        python,
      });

      expect(result.status).toBe("failed");
      expect(result.issues.map(issue => issue.code)).toContain("STATS_EVENTS_PER_PREDICTOR_LOW");
      const preflight = result.diagnostics.preflight as { status?: string; checks?: Array<{ id: string; status: string; detail: string }> };
      const epvCheck = preflight.checks?.find(check => check.id === "events-per-predictor");
      expect(preflight.status).toBe("block");
      expect(epvCheck).toMatchObject({ status: "block" });
      expect(epvCheck?.detail).toContain("24 events / 12 modeled predictor term(s)");
      expect(epvCheck?.detail).toContain("categorical expansion");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("blocks Cox regression when a discrete predictor level has no observed events", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "agenteer-stats-cox-event-support-"));
    try {
      const dataPath = path.join(dir, "cox-zero-event-level.csv");
      await writeFile(dataPath, [
        "time,event,x,site",
        ...Array.from({ length: 240 }, (_, index) => {
          const site = ["A", "B", "C", "D"][index % 4]!;
          const withinSite = Math.floor(index / 4);
          const event = site === "D" ? 0 : withinSite < 15 ? 1 : 0;
          const x = 0.25 + (index % 37) / 10;
          return `${index + 1},${event},${x.toFixed(2)},${site}`;
        }),
      ].join("\n"));

      const result = await researchStatsRunCommand({
        method: "cox-proportional-hazards",
        dataPath,
        outDir: path.join(dir, "run"),
        time: "time",
        event: "event",
        exposure: "x",
        covariates: ["site"],
        variables: [],
        exactCovariates: [],
        estimand: "ATT",
        matchRatio: 1,
        replacement: false,
        trimThreshold: 0.01,
        stabilizeWeights: true,
        surveyDesign: false,
        allowSurveyApproximation: false,
        alpha: 0.05,
        python,
      });

      expect(result.status).toBe("failed");
      expect(result.issues.map(issue => issue.code)).toContain("COX_PREDICTOR_EVENT_SUPPORT_ZERO");
      expect(result.estimates[0]).toMatchObject({ status: "blocked", reason: "zero_events_in_predictor_level" });
      expect(result.diagnostics).toMatchObject({
        predictor_event_support_screen: {
          status: "block",
          flagged_terms: expect.arrayContaining([
            expect.objectContaining({ term: "site", level: "D", events: 0, severity: "blocker" }),
          ]),
        },
      });
      const qa = JSON.parse(await readFile(path.join(dir, "run", "stats-qa.json"), "utf-8")) as { checks: Array<{ id: string; status: string; detail: string }> };
      expect(qa.checks.find(check => check.id === "cox-predictor-event-support")).toMatchObject({
        status: "fail",
      });
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("executes multi-group log-rank survival comparisons", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "agenteer-stats-logrank-multigroup-"));
    const dataPath = path.join(dir, "three-group-survival.csv");
    await writeFile(dataPath, [
      "time,event,arm",
      ...Array.from({ length: 90 }, (_, index) => {
        const arm = ["medical", "device", "surgery"][index % 3];
        const visit = Math.floor(index / 3);
        const baseline = arm === "medical" ? 12 : arm === "device" ? 18 : 24;
        const time = baseline + visit;
        const event = visit % 4 === 0 ? 1 : 0;
        return `${time},${event},${arm}`;
      }),
    ].join("\n"));

    const result = await researchStatsRunCommand({
      method: "log-rank",
      dataPath,
      outDir: path.join(dir, "run"),
      time: "time",
      event: "event",
      group: "arm",
      variables: [],
      covariates: [],
      exactCovariates: [],
      estimand: "ATT",
      matchRatio: 1,
      replacement: false,
      trimThreshold: 0.01,
      stabilizeWeights: true,
      surveyDesign: false,
      allowSurveyApproximation: false,
      alpha: 0.05,
      python,
    });

    expect(result.status).toBe("succeeded");
    expect(result.estimates[0]).toMatchObject({
      group_count: 3,
      degrees_of_freedom: 2,
      chi_square: expect.any(Number),
      p_value: expect.any(Number),
      observed_events: expect.any(Number),
    });
    expect(result.diagnostics).toMatchObject({
      test: "log-rank",
      groups: expect.arrayContaining(["medical", "device", "surgery"]),
    });
    const qa = JSON.parse(await readFile(path.join(dir, "run", "stats-qa.json"), "utf-8")) as { checks: Array<{ id: string; status: string }> };
    expect(qa.checks.map(check => check.id)).toEqual(expect.arrayContaining([
      "survival-event-count",
      "survival-censoring-context",
      "survival-curve-artifact",
      "survival-group-event-support",
    ]));
    expect(qa.checks.find(check => check.id === "survival-group-event-support")?.status).toBe("pass");
  });

  it("flags grouped survival comparisons when a group has no events", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "agenteer-stats-survival-group-support-"));
    const dataPath = path.join(dir, "zero-event-group-survival.csv");
    await writeFile(dataPath, [
      "time,event,arm",
      ...Array.from({ length: 72 }, (_, index) => {
        const arm = index % 3 === 0 ? "control" : index % 3 === 1 ? "low" : "high";
        const time = 10 + index;
        const event = arm === "high" ? 0 : index % 4 === 0 ? 1 : 0;
        return `${time},${event},${arm}`;
      }),
    ].join("\n"));

    const result = await researchStatsRunCommand({
      method: "log-rank",
      dataPath,
      outDir: path.join(dir, "run"),
      time: "time",
      event: "event",
      group: "arm",
      variables: [],
      covariates: [],
      exactCovariates: [],
      estimand: "ATT",
      matchRatio: 1,
      replacement: false,
      trimThreshold: 0.01,
      stabilizeWeights: true,
      surveyDesign: false,
      allowSurveyApproximation: false,
      alpha: 0.05,
      python,
    });

    expect(result.status).toBe("succeeded");
    const qa = JSON.parse(await readFile(path.join(dir, "run", "stats-qa.json"), "utf-8")) as { checks: Array<{ id: string; status: string; detail: string }> };
    expect(qa.checks.find(check => check.id === "survival-group-event-support")).toMatchObject({
      status: "fail",
    });
    expect(qa.checks.find(check => check.id === "survival-group-event-support")?.detail).toContain("high");
  });

  it("keeps bound competing-risk analyses exploratory when CIF horizon support is weak", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "agenteer-stats-cif-horizon-readiness-"));
    const dataPath = path.join(dir, "weak-horizon-cif.csv");
    await writeFile(dataPath, [
      "time,event,arm",
      ...Array.from({ length: 96 }, (_, index) => {
        const arm = index % 2 === 0 ? "dialysis" : "control";
        const time = 5 + index;
        const event = index % 7 === 0 ? 2 : index % 5 === 0 ? 1 : 0;
        return `${time},${event},${arm}`;
      }),
    ].join("\n"));
    const outDir = path.join(dir, "run");
    const analysisSpecPath = path.join(dir, "analysis-spec.json");
    await writeFile(analysisSpecPath, JSON.stringify({ specHash: "spec_cif_horizon_readiness", method: "aalen-johansen-cif" }));

    const result = await researchStatsRunCommand({
      method: "aalen-johansen-cif",
      dataPath,
      outDir,
      time: "time",
      event: "event",
      group: "arm",
      analysisSpecPath,
      variables: [],
      covariates: [],
      exactCovariates: [],
      estimand: "ATT",
      matchRatio: 1,
      replacement: false,
      trimThreshold: 0.01,
      stabilizeWeights: true,
      surveyDesign: false,
      allowSurveyApproximation: false,
      alpha: 0.05,
      python,
    });

    expect(result.status).toBe("succeeded");
    expect(result.binding.status).toBe("bound");
    expect(result.resultPosture?.status).toBe("bound_standard_table");
    const qa = JSON.parse(await readFile(path.join(outDir, "stats-qa.json"), "utf-8")) as { checks: Array<{ id: string; status: string; detail: string }> };
    expect(qa.checks.find(check => check.id === "competing-risk-accounting")?.status).toBe("pass");
    expect(qa.checks.find(check => check.id === "cif-horizon-support")).toMatchObject({
      status: "warning",
    });
    const manifest = await researchAnalysisManifestCommand({ runDir: outDir });
    expect(manifest.qaReadiness.warningChecks).toContain("cif-horizon-support");
    expect(manifest.readiness).toBe("exploratory_only");
    expect(manifest.nextAction).toContain("cif-horizon-support");
    await expect(researchAnalysisManifestCommand({ runDir: outDir, requireReady: true })).rejects.toThrow(/cif-horizon-support|not local_review_ready/i);
  });

  it("accounts for extra time-interaction parameters before time-varying Cox execution", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "agenteer-stats-tv-cox-preflight-"));
    const dataPath = path.join(dir, "sparse-time-varying-events.csv");
    await writeFile(dataPath, [
      "time,event,x",
      ...Array.from({ length: 90 }, (_, index) => `${index + 1},${index < 5 ? 1 : 0},${(index % 10) / 10}`),
    ].join("\n"));
    const result = await researchStatsRunCommand({
      method: "time-varying-cox",
      dataPath,
      outDir: path.join(dir, "run"),
      time: "time",
      event: "event",
      exposure: "x",
      variables: [],
      covariates: [],
      exactCovariates: [],
      estimand: "ATT",
      matchRatio: 1,
      replacement: false,
      trimThreshold: 0.01,
      stabilizeWeights: true,
      surveyDesign: false,
      allowSurveyApproximation: false,
      alpha: 0.05,
      python,
    });

    expect(result.status).toBe("failed");
    expect(result.issues.map(issue => issue.code)).toContain("STATS_EVENTS_PER_PREDICTOR_LOW");
    const preflight = result.diagnostics.preflight as { status?: string; checks?: Array<{ id: string; status: string; detail: string }> };
    const epvCheck = preflight.checks?.find(check => check.id === "events-per-predictor");
    expect(epvCheck).toMatchObject({ status: "block" });
    expect(epvCheck?.detail).toContain("including baseline and time-interaction terms");
  });

  it("blocks continuous-outcome models when the selected outcome is categorical text", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "agenteer-stats-type-preflight-"));
    const dataPath = path.join(dir, "categorical-outcome.csv");
    await writeFile(dataPath, [
      "x,y",
      ...Array.from({ length: 60 }, (_, index) => `${index / 10},${index % 2 === 0 ? "high" : "low"}`),
    ].join("\n"));
    const result = await researchStatsRunCommand({
      method: "linear-regression",
      dataPath,
      outDir: path.join(dir, "run"),
      outcome: "y",
      exposure: "x",
      variables: [],
      covariates: [],
      exactCovariates: [],
      estimand: "ATT",
      matchRatio: 1,
      replacement: false,
      trimThreshold: 0.01,
      stabilizeWeights: true,
      surveyDesign: false,
      allowSurveyApproximation: false,
      alpha: 0.05,
      python,
    });

    expect(result.status).toBe("failed");
    expect(result.issues.map(issue => issue.code)).toContain("STATS_NON_NUMERIC_OUTCOME");
  });

  it("executes Fine-Gray as an explicitly bounded competing-risk approximation", async () => {
    const { dir, dataPath } = await writeStatsFixture();
    const result = await researchStatsRunCommand({
      method: "fine-gray",
      dataPath,
      outDir: path.join(dir, "fine-gray"),
      time: "time",
      event: "comp_event",
      exposure: "g",
      variables: [],
      covariates: [],
      exactCovariates: [],
      estimand: "ATT",
      matchRatio: 1,
      replacement: false,
      trimThreshold: 0.01,
      stabilizeWeights: true,
      surveyDesign: false,
      allowSurveyApproximation: false,
      alpha: 0.05,
      python,
    });

    expect(result.status).toBe("succeeded");
    expect(result.runnerCapability).toMatchObject({ method: "fine-gray", status: "bounded_approximation" });
    expect(result.issues.map(issue => issue.code)).toContain("FINE_GRAY_LOCAL_APPROXIMATION");
    expect(result.artifacts.some(artifact => artifact.kind === "table" && artifact.path.endsWith("fine-gray-risk-sets.csv"))).toBe(true);
    const qa = JSON.parse(await readFile(path.join(dir, "fine-gray", "stats-qa.json"), "utf-8")) as { checks: Array<{ id: string; status: string }> };
    expect(qa.checks.find(check => check.id === "runner-capability-promotion-boundary")?.status).toBe("warning");
    expect(qa.checks.find(check => check.id === "fine-gray-artifacts")?.status).toBe("pass");
  });

  it("executes time-varying Cox as an explicitly bounded time-interaction approximation", async () => {
    const { dir, dataPath } = await writeStatsFixture();
    const outDir = path.join(dir, "time-varying-cox");
    const analysisSpecPath = path.join(dir, "analysis-spec.json");
    await writeFile(analysisSpecPath, JSON.stringify({ specHash: "spec_time_varying_cox", method: "time-varying-cox" }));
    const result = await researchStatsRunCommand({
      method: "time-varying-cox",
      dataPath,
      outDir,
      time: "time",
      event: "event",
      exposure: "x",
      covariates: ["g"],
      analysisSpecPath,
      variables: [],
      exactCovariates: [],
      estimand: "ATT",
      matchRatio: 1,
      replacement: false,
      trimThreshold: 0.01,
      stabilizeWeights: true,
      surveyDesign: false,
      allowSurveyApproximation: false,
      alpha: 0.05,
      python,
    });

    expect(result.status).toBe("succeeded");
    expect(result.binding.status).toBe("bound");
    expect(result.runnerCapability).toMatchObject({ method: "time-varying-cox", status: "bounded_approximation" });
    expect(result.resultPosture?.status).toBe("exploratory_standard_table");
    expect(result.resultPosture?.cannotSupport).toContain("confirmatory inference");
    expect(result.issues.map(issue => issue.code)).toContain("TIME_VARYING_COX_APPROXIMATION");
    expect(result.diagnostics).toMatchObject({
      approximation: "time_interaction_extended_cox",
      time_transform: "centered log(time)",
      time_interaction_predictors: expect.any(Number),
    });
    expect(result.estimates.some(row => row.component === "time_interaction")).toBe(true);
    expect(result.artifacts.some(artifact => artifact.kind === "figure" && artifact.path.endsWith("time-varying-cox-hazard-ratios.png"))).toBe(true);
    const qa = JSON.parse(await readFile(path.join(outDir, "stats-qa.json"), "utf-8")) as { checks: Array<{ id: string; status: string }> };
    expect(qa.checks.find(check => check.id === "runner-capability-recorded")?.status).toBe("pass");
    expect(qa.checks.find(check => check.id === "runner-capability-promotion-boundary")?.status).toBe("warning");
    expect(qa.checks.find(check => check.id === "time-varying-cox-approximation-boundary")?.status).toBe("warning");
    expect(qa.checks.find(check => check.id === "method-backend-availability")?.status).toBe("pass");
    const packet = JSON.parse(await readFile(path.join(outDir, "stats-run.json"), "utf-8")) as { runnerCapability?: { status: string } };
    expect(packet.runnerCapability?.status).toBe("bounded_approximation");
    const contract = JSON.parse(await readFile(path.join(outDir, "method-contract.json"), "utf-8")) as { runnerCapability?: { status: string } };
    expect(contract.runnerCapability?.status).toBe("bounded_approximation");
  });

  it("blocks missing required method arguments during stats preflight", async () => {
    const { dir, dataPath } = await writeStatsFixture();
    const result = await researchStatsRunCommand({
      method: "instrumental-variables-2sls",
      dataPath,
      outDir: path.join(dir, "missing-iv-argument"),
      outcome: "y",
      exposure: "treat",
      variables: [],
      covariates: [],
      exactCovariates: [],
      estimand: "ATT",
      matchRatio: 1,
      replacement: false,
      trimThreshold: 0.01,
      stabilizeWeights: true,
      surveyDesign: false,
      allowSurveyApproximation: false,
      alpha: 0.05,
      python,
    });

    expect(result.status).toBe("failed");
    expect(result.issues.map(issue => issue.code)).toContain("STATS_REQUIRED_ARGUMENT_MISSING");
    expect(result.errors.join(" ")).toContain("Stats preflight blocked execution");
    expect(result.diagnostics.preflight).toMatchObject({ status: "block" });
    expect(result.diagnostics.preflight).toHaveProperty("checks");
    expect(JSON.stringify(result.diagnostics.preflight)).toContain("--instrument");

    const partial = await researchStatsRunCommand({
      method: "partial-correlation",
      dataPath,
      outDir: path.join(dir, "missing-partial-correlation-covariates"),
      outcome: "y",
      exposure: "x",
      variables: [],
      covariates: [],
      exactCovariates: [],
      estimand: "ATT",
      matchRatio: 1,
      replacement: false,
      trimThreshold: 0.01,
      stabilizeWeights: true,
      surveyDesign: false,
      allowSurveyApproximation: false,
      alpha: 0.05,
      python,
    });
    expect(partial.status).toBe("failed");
    expect(partial.issues.map(issue => issue.code)).toContain("STATS_REQUIRED_ARGUMENT_MISSING");
    expect(JSON.stringify(partial.diagnostics.preflight)).toContain("--covariate");

    const rdd = await researchStatsRunCommand({
      method: "regression-discontinuity",
      dataPath,
      outDir: path.join(dir, "missing-rdd-cutoff"),
      outcome: "y",
      runningVariable: "running",
      variables: [],
      covariates: [],
      exactCovariates: [],
      estimand: "ATT",
      matchRatio: 1,
      replacement: false,
      trimThreshold: 0.01,
      stabilizeWeights: true,
      surveyDesign: false,
      allowSurveyApproximation: false,
      alpha: 0.05,
      python,
    });
    expect(rdd.status).toBe("failed");
    expect(rdd.issues.map(issue => issue.code)).toContain("STATS_REQUIRED_ARGUMENT_MISSING");
    expect(JSON.stringify(rdd.diagnostics.preflight)).toContain("--cutoff");

    const paired = await researchStatsRunCommand({
      method: "paired-t-test",
      dataPath,
      outDir: path.join(dir, "missing-paired-measures"),
      variables: ["wide1"],
      covariates: [],
      exactCovariates: [],
      estimand: "ATT",
      matchRatio: 1,
      replacement: false,
      trimThreshold: 0.01,
      stabilizeWeights: true,
      surveyDesign: false,
      allowSurveyApproximation: false,
      alpha: 0.05,
      python,
    });
    expect(paired.status).toBe("failed");
    expect(paired.issues.map(issue => issue.code)).toContain("STATS_REPEATED_MEASURE_VARIABLES_MISSING");

    const friedman = await researchStatsRunCommand({
      method: "friedman",
      dataPath,
      outDir: path.join(dir, "missing-friedman-measures"),
      variables: ["wide1", "wide2"],
      covariates: [],
      exactCovariates: [],
      estimand: "ATT",
      matchRatio: 1,
      replacement: false,
      trimThreshold: 0.01,
      stabilizeWeights: true,
      surveyDesign: false,
      allowSurveyApproximation: false,
      alpha: 0.05,
      python,
    });
    expect(friedman.status).toBe("failed");
    expect(friedman.issues.map(issue => issue.code)).toContain("STATS_REPEATED_MEASURE_VARIABLES_MISSING");

    const cochranQ = await researchStatsRunCommand({
      method: "cochran-q",
      dataPath,
      outDir: path.join(dir, "missing-cochran-q-measures"),
      variables: ["bin1", "bin2"],
      covariates: [],
      exactCovariates: [],
      estimand: "ATT",
      matchRatio: 1,
      replacement: false,
      trimThreshold: 0.01,
      stabilizeWeights: true,
      surveyDesign: false,
      allowSurveyApproximation: false,
      alpha: 0.05,
      python,
    });
    expect(cochranQ.status).toBe("failed");
    expect(cochranQ.issues.map(issue => issue.code)).toContain("STATS_REPEATED_MEASURE_VARIABLES_MISSING");

    const duplicateRepeated = await researchStatsRunCommand({
      method: "paired-t-test",
      dataPath,
      outDir: path.join(dir, "duplicate-paired-measures"),
      variables: ["wide1", "wide1"],
      covariates: [],
      exactCovariates: [],
      estimand: "ATT",
      matchRatio: 1,
      replacement: false,
      trimThreshold: 0.01,
      stabilizeWeights: true,
      surveyDesign: false,
      allowSurveyApproximation: false,
      alpha: 0.05,
      python,
    });
    expect(duplicateRepeated.status).toBe("failed");
    expect(duplicateRepeated.issues.map(issue => issue.code)).toContain("STATS_REPEATED_MEASURE_VARIABLES_DUPLICATED");
  });

  it("executes repeated-measure methods from variable-only contracts", async () => {
    const { dir, dataPath } = await writeStatsFixture();
    const paired = await researchStatsRunCommand({
      method: "paired-t-test",
      dataPath,
      outDir: path.join(dir, "paired-variable-contract"),
      variables: ["wide1", "wide2"],
      covariates: [],
      exactCovariates: [],
      estimand: "ATT",
      matchRatio: 1,
      replacement: false,
      trimThreshold: 0.01,
      stabilizeWeights: true,
      surveyDesign: false,
      allowSurveyApproximation: false,
      alpha: 0.05,
      python,
    });
    expect(paired.status).toBe("succeeded");
    expect(paired.estimates[0]?.term).toBe("wide2 - wide1");
    expect(paired.diagnostics).toMatchObject({
      artifacts: expect.objectContaining({ paired_differences: expect.stringContaining("paired-differences.csv") }),
    });
    expect((paired.diagnostics.preflight as { methodDecisionSupport?: { requestedRole?: string; primaryMethods?: Array<{ method: string }>; sensitivityMethods?: Array<{ method: string }> } }).methodDecisionSupport).toMatchObject({
      requestedRole: "primary",
      primaryMethods: expect.arrayContaining([expect.objectContaining({ method: "paired-t-test" })]),
      sensitivityMethods: expect.arrayContaining([expect.objectContaining({ method: "wilcoxon" })]),
    });
    expect(paired.artifacts.some(artifact => artifact.path.endsWith("paired-differences.csv"))).toBe(true);
    expect(paired.artifacts.some(artifact => artifact.kind === "figure" && artifact.path.endsWith("paired-difference.png"))).toBe(true);

    const friedman = await researchStatsRunCommand({
      method: "friedman",
      dataPath,
      outDir: path.join(dir, "friedman-variable-contract"),
      variables: ["wide1", "wide2", "wide3"],
      covariates: [],
      exactCovariates: [],
      estimand: "ATT",
      matchRatio: 1,
      replacement: false,
      trimThreshold: 0.01,
      stabilizeWeights: true,
      surveyDesign: false,
      allowSurveyApproximation: false,
      alpha: 0.05,
      python,
    });
    expect(friedman.status).toBe("succeeded");
    expect(friedman.estimates[0]).toMatchObject({
      term: "friedman",
      repeated_measures: 3,
      kendalls_w: expect.any(Number),
      kendalls_w_ci_low: expect.any(Number),
      kendalls_w_ci_high: expect.any(Number),
      effect_measure: "kendalls_w",
      ci_method: "subject row bootstrap percentile",
    });
    expect(friedman.diagnostics).toMatchObject({
      artifacts: expect.objectContaining({
        repeated_measure_source: expect.stringContaining("repeated-measure-source.csv"),
        posthoc_contrasts: expect.stringContaining("posthoc-contrasts.csv"),
        omnibus_effect_bootstrap: expect.stringContaining("omnibus-effect-bootstrap.csv"),
      }),
      omnibus_effect_bootstrap_interval: expect.objectContaining({
        available_metrics: expect.arrayContaining(["kendalls_w"]),
      }),
      posthoc_contrast_count: 3,
      posthoc_adjustment: "Holm",
    });
    expect((friedman.diagnostics.preflight as { methodDecisionSupport?: { requestedRole?: string; primaryMethods?: Array<{ method: string }>; sensitivityMethods?: Array<{ method: string }> } }).methodDecisionSupport).toMatchObject({
      requestedRole: "primary",
      primaryMethods: expect.arrayContaining([expect.objectContaining({ method: "friedman" })]),
      sensitivityMethods: expect.arrayContaining([expect.objectContaining({ method: "repeated-measures-anova" })]),
    });
    expect(friedman.artifacts.some(artifact => artifact.path.endsWith("repeated-measure-source.csv"))).toBe(true);
    expect(friedman.artifacts.some(artifact => artifact.path.endsWith("posthoc-contrasts.csv"))).toBe(true);
    expect(friedman.artifacts.some(artifact => artifact.path.endsWith("omnibus-effect-bootstrap.csv"))).toBe(true);
    expect(friedman.artifacts.some(artifact => artifact.kind === "figure" && artifact.path.endsWith("repeated-measure-profile.png"))).toBe(true);
    const friedmanPosthoc = await readFile(path.join(dir, "friedman-variable-contract", "posthoc-contrasts.csv"), "utf-8");
    expect(friedmanPosthoc).toContain("adjusted_p_value");
    await expect(readFile(path.join(dir, "friedman-variable-contract", "omnibus-effect-bootstrap.csv"), "utf-8")).resolves.toContain("kendalls_w");
    const friedmanQa = JSON.parse(await readFile(path.join(dir, "friedman-variable-contract", "stats-qa.json"), "utf-8")) as { checks: Array<{ id: string; status: string }> };
    expect(friedmanQa.checks).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "core-inference-omnibus-effect-size", status: "pass" }),
      expect.objectContaining({ id: "core-inference-omnibus-effect-bootstrap", status: "pass" }),
      expect.objectContaining({ id: "core-inference-posthoc-contrasts", status: "pass" }),
    ]));

    const cochranQ = await researchStatsRunCommand({
      method: "cochran-q",
      dataPath,
      outDir: path.join(dir, "cochran-q-variable-contract"),
      variables: ["bin1", "bin2", "bin3"],
      covariates: [],
      exactCovariates: [],
      estimand: "ATT",
      matchRatio: 1,
      replacement: false,
      trimThreshold: 0.01,
      stabilizeWeights: true,
      surveyDesign: false,
      allowSurveyApproximation: false,
      alpha: 0.05,
      python,
    });
    expect(cochranQ.status).toBe("succeeded");
    expect(cochranQ.estimates[0]).toMatchObject({
      term: "cochran_q",
      repeated_measures: 3,
      df: 2,
      cochran_q_w: expect.any(Number),
      cochran_q_w_ci_low: expect.any(Number),
      cochran_q_w_ci_high: expect.any(Number),
      effect_measure: "cochran_q_w",
      ci_method: "subject row bootstrap percentile",
    });
    expect(cochranQ.diagnostics).toMatchObject({
      test: "Cochran's Q",
      subjects_with_within_binary_variation: expect.any(Number),
      artifacts: expect.objectContaining({
        repeated_binary_source: expect.stringContaining("repeated-binary-source.csv"),
        posthoc_contrasts: expect.stringContaining("posthoc-contrasts.csv"),
        omnibus_effect_bootstrap: expect.stringContaining("omnibus-effect-bootstrap.csv"),
      }),
      omnibus_effect_bootstrap_interval: expect.objectContaining({
        available_metrics: expect.arrayContaining(["cochran_q_w"]),
      }),
      posthoc_contrast_count: 3,
      posthoc_adjustment: "Holm",
    });
    const cochranDecision = (cochranQ.diagnostics.preflight as { methodDecisionSupport?: { requestedRole?: string; primaryMethods?: Array<{ method: string }>; sensitivityMethods?: Array<{ method: string }> } }).methodDecisionSupport;
    expect(cochranDecision).toMatchObject({
      requestedRole: "primary",
      primaryMethods: expect.arrayContaining([expect.objectContaining({ method: "cochran-q" })]),
      sensitivityMethods: expect.arrayContaining([expect.objectContaining({ method: "mcnemar" })]),
    });
    expect(cochranDecision?.primaryMethods.map(item => item.method)).not.toContain("friedman");
    expect(cochranQ.artifacts.some(artifact => artifact.path.endsWith("repeated-binary-source.csv"))).toBe(true);
    expect(cochranQ.artifacts.some(artifact => artifact.path.endsWith("posthoc-contrasts.csv"))).toBe(true);
    expect(cochranQ.artifacts.some(artifact => artifact.path.endsWith("omnibus-effect-bootstrap.csv"))).toBe(true);
    expect(cochranQ.artifacts.some(artifact => artifact.kind === "figure" && artifact.path.endsWith("repeated-binary-profile.png"))).toBe(true);
    const cochranPosthoc = await readFile(path.join(dir, "cochran-q-variable-contract", "posthoc-contrasts.csv"), "utf-8");
    expect(cochranPosthoc).toContain("matched_odds_ratio");
    expect(cochranPosthoc).toContain("adjusted_p_value");
    await expect(readFile(path.join(dir, "cochran-q-variable-contract", "omnibus-effect-bootstrap.csv"), "utf-8")).resolves.toContain("cochran_q_w");
    const cochranQa = JSON.parse(await readFile(path.join(dir, "cochran-q-variable-contract", "stats-qa.json"), "utf-8")) as { checks: Array<{ id: string; status: string }> };
    expect(cochranQa.checks.map(check => check.id)).toContain("cochran-q-source-artifact");
    expect(cochranQa.checks).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "cochran-q-effect-size", status: "pass" }),
      expect.objectContaining({ id: "cochran-q-effect-bootstrap", status: "pass" }),
      expect.objectContaining({ id: "cochran-q-posthoc-contrasts", status: "pass" }),
    ]));
  });

  it("blocks repeated-measure tests when paired differences are degenerate", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "agenteer-stats-paired-degenerate-"));
    const dataPath = path.join(dir, "paired-degenerate.csv");
    await writeFile(dataPath, [
      "pre,post,followup",
      ...Array.from({ length: 40 }, (_, index) => `${index},${index},${index}`),
    ].join("\n"));

    const paired = await researchStatsRunCommand({
      method: "paired-t-test",
      dataPath,
      outDir: path.join(dir, "paired"),
      variables: ["pre", "post"],
      covariates: [],
      exactCovariates: [],
      estimand: "ATT",
      matchRatio: 1,
      replacement: false,
      trimThreshold: 0.01,
      stabilizeWeights: true,
      surveyDesign: false,
      allowSurveyApproximation: false,
      alpha: 0.05,
      python,
    });
    expect(paired.status).toBe("failed");
    expect(paired.issues.map(issue => issue.code)).toContain("PAIRED_DIFFERENCE_DEGENERATE");
    expect(paired.diagnostics).toMatchObject({ paired_difference_unique_values: 1 });

    const wilcoxon = await researchStatsRunCommand({
      method: "wilcoxon",
      dataPath,
      outDir: path.join(dir, "wilcoxon"),
      variables: ["pre", "post"],
      covariates: [],
      exactCovariates: [],
      estimand: "ATT",
      matchRatio: 1,
      replacement: false,
      trimThreshold: 0.01,
      stabilizeWeights: true,
      surveyDesign: false,
      allowSurveyApproximation: false,
      alpha: 0.05,
      python,
    });
    expect(wilcoxon.status).toBe("failed");
    expect(wilcoxon.issues.map(issue => issue.code)).toContain("PAIRED_DIFFERENCE_DEGENERATE");

    const friedman = await researchStatsRunCommand({
      method: "friedman",
      dataPath,
      outDir: path.join(dir, "friedman"),
      variables: ["pre", "post", "followup"],
      covariates: [],
      exactCovariates: [],
      estimand: "ATT",
      matchRatio: 1,
      replacement: false,
      trimThreshold: 0.01,
      stabilizeWeights: true,
      surveyDesign: false,
      allowSurveyApproximation: false,
      alpha: 0.05,
      python,
    });
    expect(friedman.status).toBe("failed");
    expect(friedman.issues.map(issue => issue.code)).toContain("REPEATED_MEASURE_WITHIN_SUBJECT_VARIATION_INSUFFICIENT");
    expect(friedman.estimates[0]).toMatchObject({ status: "blocked", reason: "insufficient_repeated_measure_variation" });

    const longDataPath = path.join(dir, "repeated-anova-degenerate.csv");
    await writeFile(longDataPath, [
      "subject,period,y",
      ...Array.from({ length: 40 }, (_, subject) => [
        `${subject},0,${subject}`,
        `${subject},1,${subject}`,
      ]).flat(),
    ].join("\n"));
    const repeatedAnova = await researchStatsRunCommand({
      method: "repeated-measures-anova",
      dataPath: longDataPath,
      outDir: path.join(dir, "repeated-anova"),
      outcome: "y",
      exposure: "period",
      cluster: "subject",
      variables: [],
      covariates: [],
      exactCovariates: [],
      estimand: "ATT",
      matchRatio: 1,
      replacement: false,
      trimThreshold: 0.01,
      stabilizeWeights: true,
      surveyDesign: false,
      allowSurveyApproximation: false,
      alpha: 0.05,
      python,
    });
    expect(repeatedAnova.status).toBe("failed");
    expect(repeatedAnova.issues.map(issue => issue.code)).toContain("REPEATED_MEASURE_WITHIN_SUBJECT_VARIATION_INSUFFICIENT");
    expect(repeatedAnova.estimates[0]).toMatchObject({ status: "blocked", reason: "insufficient_repeated_measures_anova_support" });
  });

  it("blocks invalid survival, causal timing, and design-role inputs before execution", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "agenteer-stats-design-preflight-"));
    const dataPath = path.join(dir, "design-preflight.csv");
    await writeFile(dataPath, [
      "y,time,bad_time,event,event_multistate,event_text,treat,post_bad,running_pos,instrument_const,x",
      ...Array.from({ length: 80 }, (_, index) => {
        const y = 1 + index / 20 + (index % 2);
        const time = 1 + index;
        const badTime = index < 10 ? -1 : 1 + index;
        const event = index % 4 === 0 ? 1 : 0;
        const eventMultistate = index % 5 === 0 ? 2 : event;
        const eventText = eventMultistate === 0 ? "censored" : eventMultistate === 1 ? "target" : "competing";
        const treat = index % 2;
        const postBad = index < 40 ? 0 : 2;
        const runningPos = 0.1 + index / 100;
        const instrumentConst = 1;
        const x = index / 10;
        return [y.toFixed(4), time, badTime, event, eventMultistate, eventText, treat, postBad, runningPos.toFixed(4), instrumentConst, x.toFixed(3)].join(",");
      }),
    ].join("\n"));

    const invalidTime = await researchStatsRunCommand({
      method: "kaplan-meier",
      dataPath,
      outDir: path.join(dir, "invalid-time"),
      time: "bad_time",
      event: "event",
      group: "treat",
      variables: [],
      covariates: [],
      exactCovariates: [],
      estimand: "ATT",
      matchRatio: 1,
      replacement: false,
      trimThreshold: 0.01,
      stabilizeWeights: true,
      surveyDesign: false,
      allowSurveyApproximation: false,
      alpha: 0.05,
      python,
    });
    expect(invalidTime.status).toBe("failed");
    expect(invalidTime.issues.map(issue => issue.code)).toContain("STATS_TIME_DOMAIN_INVALID");

    const invalidEvent = await researchStatsRunCommand({
      method: "cox-proportional-hazards",
      dataPath,
      outDir: path.join(dir, "invalid-event-coding"),
      time: "time",
      event: "event_multistate",
      exposure: "x",
      variables: [],
      covariates: [],
      exactCovariates: [],
      estimand: "ATT",
      matchRatio: 1,
      replacement: false,
      trimThreshold: 0.01,
      stabilizeWeights: true,
      surveyDesign: false,
      allowSurveyApproximation: false,
      alpha: 0.05,
      python,
    });
    expect(invalidEvent.status).toBe("failed");
    expect(invalidEvent.issues.map(issue => issue.code)).toContain("STATS_EVENT_INDICATOR_CODING_INVALID");

    const invalidCompetingEvent = await researchStatsRunCommand({
      method: "aalen-johansen-cif",
      dataPath,
      outDir: path.join(dir, "invalid-competing-event-coding"),
      time: "time",
      event: "event_text",
      group: "treat",
      variables: [],
      covariates: [],
      exactCovariates: [],
      estimand: "ATT",
      matchRatio: 1,
      replacement: false,
      trimThreshold: 0.01,
      stabilizeWeights: true,
      surveyDesign: false,
      allowSurveyApproximation: false,
      alpha: 0.05,
      python,
    });
    expect(invalidCompetingEvent.status).toBe("failed");
    expect(invalidCompetingEvent.issues.map(issue => issue.code)).toContain("STATS_COMPETING_EVENT_CODING_INVALID");

    const roleConflict = await researchStatsRunCommand({
      method: "cox-proportional-hazards",
      dataPath,
      outDir: path.join(dir, "role-conflict"),
      time: "time",
      event: "event",
      exposure: "time",
      variables: [],
      covariates: [],
      exactCovariates: [],
      estimand: "ATT",
      matchRatio: 1,
      replacement: false,
      trimThreshold: 0.01,
      stabilizeWeights: true,
      surveyDesign: false,
      allowSurveyApproximation: false,
      alpha: 0.05,
      python,
    });
    expect(roleConflict.status).toBe("failed");
    expect(roleConflict.issues.map(issue => issue.code)).toContain("STATS_PRIMARY_ROLE_CONFLICT");

    const did = await researchStatsRunCommand({
      method: "difference-in-differences",
      dataPath,
      outDir: path.join(dir, "did-invalid-post"),
      outcome: "y",
      exposure: "treat",
      post: "post_bad",
      variables: [],
      covariates: ["x"],
      exactCovariates: [],
      estimand: "ATT",
      matchRatio: 1,
      replacement: false,
      trimThreshold: 0.01,
      stabilizeWeights: true,
      surveyDesign: false,
      allowSurveyApproximation: false,
      alpha: 0.05,
      python,
    });
    expect(did.status).toBe("failed");
    expect(did.issues.map(issue => issue.code)).toContain("STATS_POST_INDICATOR_CODING_INVALID");
    expect((did.diagnostics.preflight as { methodDecisionSupport?: { requestedRole?: string; verdict?: string; dataSignals?: Record<string, unknown> } }).methodDecisionSupport).toMatchObject({
      requestedRole: "not_recommended",
      verdict: "blocked",
      dataSignals: expect.objectContaining({
        causalDesignSupported: false,
        causalDesignFamily: "did",
        causalPostVariable: "post_bad",
      }),
    });

    const rdd = await researchStatsRunCommand({
      method: "regression-discontinuity",
      dataPath,
      outDir: path.join(dir, "rdd-one-sided"),
      outcome: "y",
      runningVariable: "running_pos",
      cutoff: 0,
      variables: [],
      covariates: [],
      exactCovariates: [],
      estimand: "ATT",
      matchRatio: 1,
      replacement: false,
      trimThreshold: 0.01,
      stabilizeWeights: true,
      surveyDesign: false,
      allowSurveyApproximation: false,
      alpha: 0.05,
      python,
    });
    expect(rdd.status).toBe("failed");
    expect(rdd.issues.map(issue => issue.code)).toContain("STATS_RDD_CUTOFF_SUPPORT_INSUFFICIENT");
    expect((rdd.diagnostics.preflight as { methodDecisionSupport?: { requestedRole?: string; verdict?: string; dataSignals?: Record<string, unknown> } }).methodDecisionSupport).toMatchObject({
      requestedRole: "not_recommended",
      verdict: "blocked",
      dataSignals: expect.objectContaining({
        causalDesignSupported: false,
        causalDesignFamily: "rdd",
        causalRunningVariable: "running_pos",
        causalRunningBelowCutoff: 0,
      }),
    });

    const iv = await researchStatsRunCommand({
      method: "instrumental-variables-2sls",
      dataPath,
      outDir: path.join(dir, "iv-constant-instrument"),
      outcome: "y",
      exposure: "treat",
      instrument: "instrument_const",
      variables: [],
      covariates: ["x"],
      exactCovariates: [],
      estimand: "ATT",
      matchRatio: 1,
      replacement: false,
      trimThreshold: 0.01,
      stabilizeWeights: true,
      surveyDesign: false,
      allowSurveyApproximation: false,
      alpha: 0.05,
      python,
    });
    expect(iv.status).toBe("failed");
    expect(iv.issues.map(issue => issue.code)).toContain("STATS_INSTRUMENT_VARIATION_INSUFFICIENT");
    expect((iv.diagnostics.preflight as { methodDecisionSupport?: { requestedRole?: string; verdict?: string; dataSignals?: Record<string, unknown> } }).methodDecisionSupport).toMatchObject({
      requestedRole: "not_recommended",
      verdict: "blocked",
      dataSignals: expect.objectContaining({
        causalDesignSupported: false,
        causalDesignFamily: "iv",
        causalInstrumentVariable: "instrument_const",
        causalInstrumentLevelCount: 1,
      }),
    });
  });

  it("blocks unsupported regression outcome families and overloaded model parameterization before fitting", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "agenteer-stats-glm-preflight-"));
    const dataPath = path.join(dir, "glm-preflight.csv");
    await writeFile(dataPath, [
      "y,ybin,three_class,sparse_class,cat_many,x,x_copy,rare_pred,count",
      ...Array.from({ length: 90 }, (_, index) => {
        const y = 1 + index / 20;
        const ybin = index % 2;
        const threeClass = index % 3 === 0 ? "low" : index % 3 === 1 ? "medium" : "high";
        const sparseClass = index === 0 ? "rare" : index % 2 === 0 ? "common_a" : "common_b";
        const catMany = `level_${index % 25}`;
        const x = index / 10;
        const rarePred = index === 0 ? "rare" : "usual";
        const count = index % 3;
        return [y.toFixed(4), ybin, threeClass, sparseClass, catMany, x.toFixed(3), x.toFixed(3), rarePred, count].join(",");
      }),
    ].join("\n"));

    const ordinalBinary = await researchStatsRunCommand({
      method: "ordinal-logistic-regression",
      dataPath,
      outDir: path.join(dir, "ordinal-binary"),
      outcome: "ybin",
      exposure: "x",
      variables: [],
      covariates: [],
      exactCovariates: [],
      estimand: "ATT",
      matchRatio: 1,
      replacement: false,
      trimThreshold: 0.01,
      stabilizeWeights: true,
      surveyDesign: false,
      allowSurveyApproximation: false,
      alpha: 0.05,
      python,
    });
    expect(ordinalBinary.status).toBe("failed");
    expect(ordinalBinary.issues.map(issue => issue.code)).toContain("STATS_ORDINAL_OUTCOME_LEVELS_INVALID");

    const multinomialBinary = await researchStatsRunCommand({
      method: "multinomial-logistic-regression",
      dataPath,
      outDir: path.join(dir, "multinomial-binary"),
      outcome: "ybin",
      exposure: "x",
      variables: [],
      covariates: [],
      exactCovariates: [],
      estimand: "ATT",
      matchRatio: 1,
      replacement: false,
      trimThreshold: 0.01,
      stabilizeWeights: true,
      surveyDesign: false,
      allowSurveyApproximation: false,
      alpha: 0.05,
      python,
    });
    expect(multinomialBinary.status).toBe("failed");
    expect(multinomialBinary.issues.map(issue => issue.code)).toContain("STATS_MULTINOMIAL_OUTCOME_LEVELS_INVALID");

    const sparseMultinomial = await researchStatsRunCommand({
      method: "multinomial-logistic-regression",
      dataPath,
      outDir: path.join(dir, "multinomial-sparse"),
      outcome: "sparse_class",
      exposure: "x",
      variables: [],
      covariates: [],
      exactCovariates: [],
      estimand: "ATT",
      matchRatio: 1,
      replacement: false,
      trimThreshold: 0.01,
      stabilizeWeights: true,
      surveyDesign: false,
      allowSurveyApproximation: false,
      alpha: 0.05,
      python,
    });
    expect(sparseMultinomial.status).toBe("failed");
    expect(sparseMultinomial.issues.map(issue => issue.code)).toContain("STATS_MULTINOMIAL_OUTCOME_LEVEL_SPARSE");

    const overloaded = await researchStatsRunCommand({
      method: "linear-regression",
      dataPath,
      outDir: path.join(dir, "overloaded-model"),
      outcome: "y",
      exposure: "x",
      variables: [],
      covariates: ["cat_many"],
      exactCovariates: [],
      estimand: "ATT",
      matchRatio: 1,
      replacement: false,
      trimThreshold: 0.01,
      stabilizeWeights: true,
      surveyDesign: false,
      allowSurveyApproximation: false,
      alpha: 0.05,
      python,
    });
    expect(overloaded.status).toBe("failed");
    expect(overloaded.issues.map(issue => issue.code)).toContain("STATS_MODELED_PARAMETER_CAPACITY_LOW");

    const rankDeficient = await researchStatsRunCommand({
      method: "linear-regression",
      dataPath,
      outDir: path.join(dir, "rank-deficient-model"),
      outcome: "y",
      exposure: "x",
      variables: [],
      covariates: ["x_copy"],
      exactCovariates: [],
      estimand: "ATT",
      matchRatio: 1,
      replacement: false,
      trimThreshold: 0.01,
      stabilizeWeights: true,
      surveyDesign: false,
      allowSurveyApproximation: false,
      alpha: 0.05,
      python,
    });
    expect(rankDeficient.status).toBe("failed");
    expect(rankDeficient.issues.map(issue => issue.code)).toContain("REGRESSION_DESIGN_MATRIX_RANK_DEFICIENT");
    expect(rankDeficient.estimates[0]).toMatchObject({ status: "blocked", reason: "rank_deficient" });
    expect(rankDeficient.diagnostics.design_matrix_rank_screen).toMatchObject({
      status: "block",
      rank_deficiency: 1,
    });
    const rankQa = JSON.parse(await readFile(path.join(dir, "rank-deficient-model", "stats-qa.json"), "utf-8")) as { checks: Array<{ id: string; status: string }> };
    expect(rankQa.checks.find(check => check.id === "model-design-matrix-rank")?.status).toBe("fail");

    const logisticBurdenPath = path.join(dir, "logistic-expanded-burden.csv");
    await writeFile(logisticBurdenPath, [
      "ybin,x,site",
      ...Array.from({ length: 100 }, (_, index) => {
        const site = `site_${index % 5}`;
        const ybin = Math.floor(index / 5) < 4 ? 1 : 0;
        const x = Math.sin(index / 7) + index / 200;
        return [ybin, x.toFixed(5), site].join(",");
      }),
    ].join("\n"));
    const expandedLogisticBurden = await researchStatsRunCommand({
      method: "logistic-regression",
      dataPath: logisticBurdenPath,
      outDir: path.join(dir, "expanded-logistic-burden"),
      outcome: "ybin",
      exposure: "x",
      variables: [],
      covariates: ["site"],
      exactCovariates: [],
      estimand: "ATT",
      matchRatio: 1,
      replacement: false,
      trimThreshold: 0.01,
      stabilizeWeights: true,
      surveyDesign: false,
      allowSurveyApproximation: false,
      alpha: 0.05,
      python,
    });
    expect(expandedLogisticBurden.status).toBe("failed");
    expect(expandedLogisticBurden.issues.map(issue => issue.code)).toContain("STATS_BINARY_EVENTS_PER_MODELED_PARAMETER_LOW");
    const expandedBurdenPreflight = expandedLogisticBurden.diagnostics.preflight as { checks?: Array<{ id: string; status: string; detail: string }> };
    expect(expandedBurdenPreflight.checks?.find(check => check.id === "binary-event-count")?.status).toBeUndefined();
    expect(expandedBurdenPreflight.checks?.find(check => check.id === "binary-events-per-modeled-parameter")).toMatchObject({
      status: "block",
    });

    const sparsePredictor = await researchStatsRunCommand({
      method: "logistic-regression",
      dataPath,
      outDir: path.join(dir, "sparse-predictor-model"),
      outcome: "ybin",
      exposure: "x",
      variables: [],
      covariates: ["rare_pred"],
      exactCovariates: [],
      estimand: "ATT",
      matchRatio: 1,
      replacement: false,
      trimThreshold: 0.01,
      stabilizeWeights: true,
      surveyDesign: false,
      allowSurveyApproximation: false,
      alpha: 0.05,
      python,
    });
    expect(sparsePredictor.status).toBe("failed");
    expect(sparsePredictor.issues.map(issue => issue.code)).toContain("STATS_REGRESSION_CATEGORICAL_LEVEL_SUPPORT_LOW");
    const sparsePreflight = sparsePredictor.diagnostics.preflight as { checks?: Array<{ id: string; status: string; detail: string }> };
    expect(sparsePreflight.checks?.find(check => check.id === "regression-categorical-level-support")).toMatchObject({
      status: "block",
    });

    const weakNegativeBinomial = await researchStatsRunCommand({
      method: "negative-binomial-regression",
      dataPath,
      outDir: path.join(dir, "weak-nb"),
      outcome: "count",
      exposure: "x",
      variables: [],
      covariates: [],
      exactCovariates: [],
      estimand: "ATT",
      matchRatio: 1,
      replacement: false,
      trimThreshold: 0.01,
      stabilizeWeights: true,
      surveyDesign: false,
      allowSurveyApproximation: false,
      alpha: 0.05,
      python,
    });
    expect(weakNegativeBinomial.status).toBe("succeeded");
    expect(weakNegativeBinomial.issues.map(issue => issue.code)).toContain("STATS_NEGATIVE_BINOMIAL_OVERDISPERSION_WEAK");
  });

  it("validates analysis weight support before weighted regression execution", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "agenteer-stats-weight-preflight-"));
    const dataPath = path.join(dir, "weight-preflight.csv");
    await writeFile(dataPath, [
      "y,ybin,x,weight_good,weight_text,weight_negative,weight_zero,weight_extreme",
      ...Array.from({ length: 80 }, (_, index) => {
        const x = index / 10;
        const y = 2 + x * 1.4 + (index % 5) / 10;
        const ybin = y > 7 ? 1 : 0;
        const weightGood = index % 2 === 0 ? 1 : 2;
        const weightText = index % 2 === 0 ? "low" : "high";
        const weightNegative = index === 0 ? -1 : 1;
        const weightZero = 0;
        const weightExtreme = index === 0 ? 1000 : 1;
        return [y.toFixed(4), ybin, x.toFixed(3), weightGood, weightText, weightNegative, weightZero, weightExtreme].join(",");
      }),
    ].join("\n"));
    const base = {
      dataPath,
      outcome: "y",
      exposure: "x",
      variables: [],
      covariates: [],
      exactCovariates: [],
      estimand: "ATT",
      matchRatio: 1,
      replacement: false,
      trimThreshold: 0.01,
      stabilizeWeights: true,
      surveyDesign: false,
      allowSurveyApproximation: false,
      alpha: 0.05,
      python,
    };

    const unsupported = await researchStatsRunCommand({
      ...base,
      method: "robust-linear-regression",
      outDir: path.join(dir, "unsupported-weight"),
      weight: "weight_good",
    });
    expect(unsupported.status).toBe("failed");
    expect(unsupported.issues.map(issue => issue.code)).toContain("STATS_WEIGHT_METHOD_UNSUPPORTED");

    const nonnumeric = await researchStatsRunCommand({
      ...base,
      method: "linear-regression",
      outDir: path.join(dir, "nonnumeric-weight"),
      weight: "weight_text",
    });
    expect(nonnumeric.status).toBe("failed");
    expect(nonnumeric.issues.map(issue => issue.code)).toContain("STATS_WEIGHT_VARIABLE_NOT_NUMERIC");

    const negative = await researchStatsRunCommand({
      ...base,
      method: "linear-regression",
      outDir: path.join(dir, "negative-weight"),
      weight: "weight_negative",
    });
    expect(negative.status).toBe("failed");
    expect(negative.issues.map(issue => issue.code)).toContain("STATS_WEIGHT_DOMAIN_INVALID");

    const allZero = await researchStatsRunCommand({
      ...base,
      method: "linear-regression",
      outDir: path.join(dir, "zero-weight"),
      weight: "weight_zero",
    });
    expect(allZero.status).toBe("failed");
    expect(allZero.issues.map(issue => issue.code)).toContain("STATS_WEIGHT_SUPPORT_INVALID");

    const extreme = await researchStatsRunCommand({
      ...base,
      method: "linear-regression",
      outDir: path.join(dir, "extreme-weight"),
      weight: "weight_extreme",
    });
    expect(extreme.status).toBe("succeeded");
    expect(extreme.issues.map(issue => issue.code)).toEqual(expect.arrayContaining([
      "STATS_WEIGHT_EXTREME",
      "STATS_WEIGHT_EFFECTIVE_SAMPLE_SIZE_LOW",
    ]));
    expect(extreme.diagnostics).toMatchObject({ weighted: true, weight_variable: "weight_extreme" });

    const weighted = await researchStatsRunCommand({
      ...base,
      method: "linear-regression",
      outDir: path.join(dir, "weighted-ok"),
      weight: "weight_good",
    });
    expect(weighted.status).toBe("succeeded");
    expect(weighted.diagnostics).toMatchObject({ weighted: true, weight_variable: "weight_good" });
  });

  it("blocks invalid correlation inputs and warns on weak prediction-score domains", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "agenteer-stats-correlation-prediction-preflight-"));
    const dataPath = path.join(dir, "correlation-prediction.csv");
    await writeFile(dataPath, [
      "y,x_text,x_constant,x_coarse,x_perfect,z_perfect,ybin,score_text,score_raw,score_lowres,split_bad",
      ...Array.from({ length: 80 }, (_, index) => {
        const y = 1 + index / 10;
        const xText = index % 2 === 0 ? "low" : "high";
        const xConstant = 7;
        const xCoarse = index % 3;
        const zPerfect = 10 + index / 5;
        const xPerfect = zPerfect * 2;
        const ybin = index % 4 === 0 ? 1 : 0;
        const scoreText = index % 2 === 0 ? "low-risk" : "high-risk";
        const scoreRaw = 2 + index / 40;
        const scoreLowres = index % 2 === 0 ? 0.2 : 0.8;
        const splitBad = ybin === 1 ? "holdout" : "train";
        return [y.toFixed(3), xText, xConstant, xCoarse, xPerfect.toFixed(3), zPerfect.toFixed(3), ybin, scoreText, scoreRaw.toFixed(3), scoreLowres, splitBad].join(",");
      }),
    ].join("\n"));

    const nonnumericCorrelation = await researchStatsRunCommand({
      method: "pearson",
      dataPath,
      outDir: path.join(dir, "nonnumeric-correlation"),
      outcome: "y",
      exposure: "x_text",
      variables: [],
      covariates: [],
      exactCovariates: [],
      estimand: "ATT",
      matchRatio: 1,
      replacement: false,
      trimThreshold: 0.01,
      stabilizeWeights: true,
      surveyDesign: false,
      allowSurveyApproximation: false,
      alpha: 0.05,
      python,
    });
    expect(nonnumericCorrelation.status).toBe("failed");
    expect(nonnumericCorrelation.issues.map(issue => issue.code)).toContain("STATS_CORRELATION_VARIABLE_NOT_NUMERIC");

    const constantCorrelation = await researchStatsRunCommand({
      method: "spearman",
      dataPath,
      outDir: path.join(dir, "constant-correlation"),
      outcome: "y",
      exposure: "x_constant",
      variables: [],
      covariates: [],
      exactCovariates: [],
      estimand: "ATT",
      matchRatio: 1,
      replacement: false,
      trimThreshold: 0.01,
      stabilizeWeights: true,
      surveyDesign: false,
      allowSurveyApproximation: false,
      alpha: 0.05,
      python,
    });
    expect(constantCorrelation.status).toBe("failed");
    expect(constantCorrelation.issues.map(issue => issue.code)).toEqual(expect.arrayContaining([
      "STATS_EXPOSURE_VARIATION_INSUFFICIENT",
      "STATS_CORRELATION_VARIABLE_VARIATION_INSUFFICIENT",
    ]));

    const coarsePearson = await researchStatsRunCommand({
      method: "pearson",
      dataPath,
      outDir: path.join(dir, "coarse-pearson"),
      outcome: "y",
      exposure: "x_coarse",
      variables: [],
      covariates: [],
      exactCovariates: [],
      estimand: "ATT",
      matchRatio: 1,
      replacement: false,
      trimThreshold: 0.01,
      stabilizeWeights: true,
      surveyDesign: false,
      allowSurveyApproximation: false,
      alpha: 0.05,
      python,
    });
    expect(coarsePearson.status).toBe("succeeded");
    expect(coarsePearson.issues.map(issue => issue.code)).toContain("STATS_PEARSON_LOW_UNIQUE_VALUES");

    const collapsedPartial = await researchStatsRunCommand({
      method: "partial-correlation",
      dataPath,
      outDir: path.join(dir, "partial-correlation-collapsed"),
      outcome: "y",
      exposure: "x_perfect",
      variables: [],
      covariates: ["z_perfect"],
      exactCovariates: [],
      estimand: "ATT",
      matchRatio: 1,
      replacement: false,
      trimThreshold: 0.01,
      stabilizeWeights: true,
      surveyDesign: false,
      allowSurveyApproximation: false,
      alpha: 0.05,
      python,
    });
    expect(collapsedPartial.status).toBe("failed");
    expect(collapsedPartial.issues.map(issue => issue.code)).toContain("PARTIAL_CORRELATION_RESIDUAL_VARIATION_INSUFFICIENT");
    expect(collapsedPartial.estimates[0]).toMatchObject({ status: "blocked", reason: "residual_variation_insufficient" });
    expect(collapsedPartial.diagnostics).toMatchObject({
      residual_x_unique_values: 1,
      residual_y_unique_values: expect.any(Number),
    });

    const nonnumericScore = await researchStatsRunCommand({
      method: "prediction-evaluation",
      dataPath,
      outDir: path.join(dir, "nonnumeric-score"),
      outcome: "ybin",
      exposure: "score_text",
      variables: [],
      covariates: [],
      exactCovariates: [],
      estimand: "ATT",
      matchRatio: 1,
      replacement: false,
      trimThreshold: 0.01,
      stabilizeWeights: true,
      surveyDesign: false,
      allowSurveyApproximation: false,
      alpha: 0.05,
      python,
    });
    expect(nonnumericScore.status).toBe("failed");
    expect(nonnumericScore.issues.map(issue => issue.code)).toContain("STATS_PREDICTION_SCORE_NOT_NUMERIC");
    const nonnumericDecision = (nonnumericScore.diagnostics.preflight as { methodDecisionSupport?: { requestedRole?: string; verdict?: string; dataSignals?: Record<string, unknown> } }).methodDecisionSupport;
    expect(nonnumericDecision).toMatchObject({
      requestedRole: "not_recommended",
      verdict: "blocked",
      dataSignals: expect.objectContaining({
        predictionScoreVariable: "score_text",
        predictionScoreSupported: false,
        predictionScoreLike: false,
      }),
    });

    const rawScore = await researchStatsRunCommand({
      method: "prediction-evaluation",
      dataPath,
      outDir: path.join(dir, "raw-score"),
      outcome: "ybin",
      exposure: "score_raw",
      variables: [],
      covariates: [],
      exactCovariates: [],
      estimand: "ATT",
      matchRatio: 1,
      replacement: false,
      trimThreshold: 0.01,
      stabilizeWeights: true,
      surveyDesign: false,
      allowSurveyApproximation: false,
      alpha: 0.05,
      python,
    });
    expect(rawScore.status).toBe("succeeded");
    expect(rawScore.issues.map(issue => issue.code)).toContain("STATS_PREDICTION_SCORE_PROBABILITY_RANGE_WARNING");
    expect(rawScore.diagnostics).toMatchObject({ score_is_probability_like: false });
    const rawDecision = (rawScore.diagnostics.preflight as { methodDecisionSupport?: { requestedRole?: string; verdict?: string; dataSignals?: Record<string, unknown> } }).methodDecisionSupport;
    expect(rawDecision).toMatchObject({
      requestedRole: "primary",
      verdict: "preferred",
      dataSignals: expect.objectContaining({
        predictionScoreVariable: "score_raw",
        predictionScoreBounded01: false,
        predictionScoreNameLike: true,
        predictionScoreLowResolution: false,
        predictionScoreSupported: true,
        predictionScoreLike: true,
      }),
    });

    const lowResolutionScore = await researchStatsRunCommand({
      method: "prediction-evaluation",
      dataPath,
      outDir: path.join(dir, "low-resolution-score"),
      outcome: "ybin",
      exposure: "score_lowres",
      variables: [],
      covariates: [],
      exactCovariates: [],
      estimand: "ATT",
      matchRatio: 1,
      replacement: false,
      trimThreshold: 0.01,
      stabilizeWeights: true,
      surveyDesign: false,
      allowSurveyApproximation: false,
      alpha: 0.05,
      python,
    });
    expect(lowResolutionScore.status).toBe("succeeded");
    expect(lowResolutionScore.issues.map(issue => issue.code)).toContain("STATS_PREDICTION_SCORE_RESOLUTION_LOW");
    const lowResolutionDecision = (lowResolutionScore.diagnostics.preflight as { methodDecisionSupport?: { requestedRole?: string; verdict?: string; dataSignals?: Record<string, unknown>; primaryMethods?: Array<{ method: string }>; sensitivityMethods?: Array<{ method: string }> } }).methodDecisionSupport;
    expect(lowResolutionDecision).toMatchObject({
      requestedRole: "sensitivity",
      verdict: "acceptable_sensitivity",
      dataSignals: expect.objectContaining({
        predictionScoreVariable: "score_lowres",
        predictionScoreLowResolution: true,
        predictionScoreBinaryOrLowResolution: true,
        predictionScoreSupported: true,
        predictionScoreLike: false,
      }),
      primaryMethods: expect.arrayContaining([expect.objectContaining({ method: "diagnostic-accuracy" })]),
      sensitivityMethods: expect.arrayContaining([expect.objectContaining({ method: "prediction-evaluation" })]),
    });

    const oneClassValidation = await researchStatsRunCommand({
      method: "prediction-evaluation",
      dataPath,
      outDir: path.join(dir, "one-class-validation-score"),
      outcome: "ybin",
      exposure: "score_raw",
      validationColumn: "split_bad",
      validationValue: "holdout",
      variables: [],
      covariates: [],
      exactCovariates: [],
      estimand: "ATT",
      matchRatio: 1,
      replacement: false,
      trimThreshold: 0.01,
      stabilizeWeights: true,
      surveyDesign: false,
      allowSurveyApproximation: false,
      alpha: 0.05,
      python,
    });
    expect(oneClassValidation.status).toBe("failed");
    expect(oneClassValidation.issues.map(issue => issue.code)).toContain("STATS_PREDICTION_VALIDATION_CLASS_SUPPORT_INVALID");
    const oneClassDecision = (oneClassValidation.diagnostics.preflight as { methodDecisionSupport?: { verdict?: string; dataSignals?: Record<string, unknown> } }).methodDecisionSupport;
    expect(oneClassDecision).toMatchObject({
      verdict: "blocked",
      dataSignals: expect.objectContaining({
        predictionValidationMode: "external_or_holdout_column",
        predictionValidationEvaluationEvents: 20,
        predictionValidationEvaluationNonEvents: 0,
        predictionValidationClassSupported: false,
        predictionValidationSupported: false,
      }),
    });

    const semanticOutcomePath = path.join(dir, "semantic-outcome-validation.csv");
    await writeFile(semanticOutcomePath, [
      "outcome_text,risk_score,split",
      ...Array.from({ length: 80 }, (_, index) => {
        const outcomeText = index % 4 === 0 ? "dead" : "alive";
        const score = outcomeText === "dead" ? 0.72 + (index % 7) / 100 : 0.12 + (index % 11) / 100;
        const split = index >= 40 ? "holdout" : "train";
        return [outcomeText, score.toFixed(4), split].join(",");
      }),
    ].join("\n"));
    const semanticOutcomeValidation = await researchStatsRunCommand({
      method: "prediction-evaluation",
      dataPath: semanticOutcomePath,
      outDir: path.join(dir, "semantic-outcome-validation"),
      outcome: "outcome_text",
      exposure: "risk_score",
      validationColumn: "split",
      validationValue: "holdout",
      variables: [],
      covariates: [],
      exactCovariates: [],
      estimand: "ATT",
      matchRatio: 1,
      replacement: false,
      trimThreshold: 0.01,
      stabilizeWeights: true,
      surveyDesign: false,
      allowSurveyApproximation: false,
      alpha: 0.05,
      python,
    });
    expect(semanticOutcomeValidation.status).toBe("succeeded");
    expect(semanticOutcomeValidation.issues.map(issue => issue.code)).not.toContain("STATS_PREDICTION_VALIDATION_CLASS_SUPPORT_INVALID");
    expect(semanticOutcomeValidation.diagnostics).toMatchObject({
      binary_outcome_orientation: expect.objectContaining({
        negative_level: "alive",
        positive_level: "dead",
        ordering_evidence: "semantic binary labels",
      }),
    });
    const semanticDecision = (semanticOutcomeValidation.diagnostics.preflight as { methodDecisionSupport?: { dataSignals?: Record<string, unknown> } }).methodDecisionSupport;
    expect(semanticDecision?.dataSignals).toMatchObject({
      predictionValidationMode: "external_or_holdout_column",
      predictionValidationEvaluationEvents: 10,
      predictionValidationEvaluationNonEvents: 30,
      predictionValidationClassSupported: true,
      predictionValidationClassOrientationEvidence: "semantic binary labels",
      predictionValidationSupported: true,
    });
  });

  it("blocks invalid diagnostic accuracy domains before estimating performance metrics", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "agenteer-stats-diagnostic-preflight-"));
    const dataPath = path.join(dir, "diagnostic-preflight.csv");
    await writeFile(dataPath, [
      "ref3,index3,ref_text,ref_cont,index_cont,ref_binary,index_binary,index_ambiguous",
      ...Array.from({ length: 80 }, (_, index) => {
        const ref3 = index % 3 === 0 ? "A" : index % 3 === 1 ? "B" : "C";
        const index3 = index % 3 === 0 ? "low" : index % 3 === 1 ? "medium" : "high";
        const refText = index % 2 === 0 ? "positive" : "negative";
        const refCont = 0.2 + index / 100;
        const indexCont = 2 + index / 10;
        const refBinary = index % 2;
        const indexBinary = index % 4 === 0 ? 1 : 0;
        const indexAmbiguous = index % 2 === 0 ? "high" : "low";
        return [ref3, index3, refText, refCont.toFixed(3), indexCont.toFixed(3), refBinary, indexBinary, indexAmbiguous].join(",");
      }),
    ].join("\n"));
    const base = {
      dataPath,
      variables: [],
      covariates: [],
      exactCovariates: [],
      estimand: "ATT",
      matchRatio: 1,
      replacement: false,
      trimThreshold: 0.01,
      stabilizeWeights: true,
      surveyDesign: false,
      allowSurveyApproximation: false,
      alpha: 0.05,
      python,
    };

    const multiclassReference = await researchStatsRunCommand({
      ...base,
      method: "diagnostic-accuracy",
      outDir: path.join(dir, "multiclass-reference"),
      outcome: "ref3",
      exposure: "index_binary",
    });
    expect(multiclassReference.status).toBe("failed");
    expect(multiclassReference.issues.map(issue => issue.code)).toContain("STATS_DIAGNOSTIC_REFERENCE_NOT_BINARY");

    const ambiguousIndex = await researchStatsRunCommand({
      ...base,
      method: "diagnostic-accuracy",
      outDir: path.join(dir, "ambiguous-index"),
      outcome: "ref_binary",
      exposure: "index_ambiguous",
    });
    expect(ambiguousIndex.status).toBe("failed");
    expect(ambiguousIndex.issues.map(issue => issue.code)).toContain("STATS_DIAGNOSTIC_INDEX_NOT_BINARY");

    const nonnumericThreshold = await researchStatsRunCommand({
      ...base,
      method: "diagnostic-accuracy",
      outDir: path.join(dir, "nonnumeric-threshold"),
      outcome: "ref_text",
      exposure: "index_cont",
      outcomeThreshold: 0.5,
      exposureThreshold: 5,
    });
    expect(nonnumericThreshold.status).toBe("failed");
    expect(nonnumericThreshold.issues.map(issue => issue.code)).toContain("STATS_DIAGNOSTIC_THRESHOLD_DOMAIN_INVALID");

    const unsupportedThreshold = await researchStatsRunCommand({
      ...base,
      method: "diagnostic-accuracy",
      outDir: path.join(dir, "unsupported-threshold"),
      outcome: "ref_cont",
      exposure: "index_cont",
      outcomeThreshold: 0.5,
      exposureThreshold: 999,
    });
    expect(unsupportedThreshold.status).toBe("failed");
    expect(unsupportedThreshold.issues.map(issue => issue.code)).toContain("STATS_DIAGNOSTIC_THRESHOLD_CLASS_SUPPORT_INVALID");

    const sameReferenceAndIndex = await researchStatsRunCommand({
      ...base,
      method: "diagnostic-accuracy",
      outDir: path.join(dir, "same-reference-index"),
      outcome: "ref_binary",
      exposure: "ref_binary",
    });
    expect(sameReferenceAndIndex.status).toBe("failed");
    expect(sameReferenceAndIndex.issues.map(issue => issue.code)).toContain("STATS_DIAGNOSTIC_REFERENCE_INDEX_CONFLICT");

    const labelDataPath = path.join(dir, "diagnostic-detected-labels.csv");
    await writeFile(labelDataPath, [
      "reference_detected,index_detected",
      "detected,detected",
      "detected,detected",
      "detected,detected",
      "detected,not detected",
      "not detected,detected",
      "not detected,detected",
      "not detected,not detected",
      "not detected,not detected",
      "not detected,not detected",
      "not detected,not detected",
    ].join("\n"));
    const orientedLabels = await researchStatsRunCommand({
      ...base,
      dataPath: labelDataPath,
      method: "diagnostic-accuracy",
      outDir: path.join(dir, "oriented-detected-labels"),
      outcome: "reference_detected",
      exposure: "index_detected",
    });
    expect(orientedLabels.status).toBe("succeeded");
    expect(orientedLabels.diagnostics.confusion_matrix).toMatchObject({ tp: 3, fp: 2, tn: 4, fn: 1 });
    expect(orientedLabels.diagnostics).toMatchObject({
      reference_binary_orientation: expect.objectContaining({
        negative_level: "not detected",
        positive_level: "detected",
        ordering_evidence: "semantic binary labels",
      }),
      test_binary_orientation: expect.objectContaining({
        negative_level: "not detected",
        positive_level: "detected",
        ordering_evidence: "semantic binary labels",
      }),
    });
    expect(orientedLabels.estimates[0]?.sensitivity).toBe(0.75);
    expect(orientedLabels.estimates[0]?.specificity).toBeCloseTo(0.6666, 3);
    const orientedQa = JSON.parse(await readFile(path.join(dir, "oriented-detected-labels", "stats-qa.json"), "utf-8")) as { checks: Array<{ id: string; status: string }> };
    expect(orientedQa.checks.find(check => check.id === "diagnostic-reference-orientation-evidence")?.status).toBe("pass");
    expect(orientedQa.checks.find(check => check.id === "diagnostic-index-orientation-evidence")?.status).toBe("pass");
  });

  it("blocks invalid measurement, imputation, p-value, clustering, and power inputs before misleading execution", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "agenteer-stats-measurement-preflight-"));
    const dataPath = path.join(dir, "measurement-preflight.csv");
    await writeFile(dataPath, [
      "numeric_a,numeric_b,binary_num,constant_num,text_var,all_text,missing_y,p_value_bad,rater_constant,rater_var",
      ...Array.from({ length: 60 }, (_, index) => {
        const numericA = 1 + index / 10;
        const numericB = 2 + index / 8;
        const binaryNum = index % 2;
        const constantNum = 5;
        const textVar = index % 2 === 0 ? "low" : "high";
        const allText = index % 3 === 0 ? "red" : "blue";
        const missingY = index % 6 === 0 ? "" : (numericA + 0.5).toFixed(3);
        const pValueBad = index === 0 ? 1.2 : (0.001 + index * 0.002).toFixed(4);
        const raterConstant = "yes";
        const raterVar = index % 2 === 0 ? "yes" : "no";
        return [numericA.toFixed(3), numericB.toFixed(3), binaryNum, constantNum, textVar, allText, missingY, pValueBad, raterConstant, raterVar].join(",");
      }),
    ].join("\n"));

    const pcaText = await researchStatsRunCommand({
      method: "pca",
      dataPath,
      outDir: path.join(dir, "pca-text"),
      variables: ["numeric_a", "text_var"],
      covariates: [],
      exactCovariates: [],
      estimand: "ATT",
      matchRatio: 1,
      replacement: false,
      trimThreshold: 0.01,
      stabilizeWeights: true,
      surveyDesign: false,
      allowSurveyApproximation: false,
      alpha: 0.05,
      python,
    });
    expect(pcaText.status).toBe("failed");
    expect(pcaText.issues.map(issue => issue.code)).toEqual(expect.arrayContaining([
      "STATS_MEASUREMENT_VARIABLE_NOT_NUMERIC",
      "STATS_MEASUREMENT_NUMERIC_VARIABLE_COUNT_LOW",
    ]));
    expect((pcaText.diagnostics.preflight as { methodDecisionSupport?: { requestedRole?: string; verdict?: string; dataSignals?: Record<string, unknown>; fallbackMethods?: Array<{ method: string }> } }).methodDecisionSupport).toMatchObject({
      requestedRole: "not_recommended",
      verdict: "blocked",
      dataSignals: expect.objectContaining({
        measurementFeatureMatrixSupported: false,
        measurementNonNumericVariableCount: 1,
      }),
    });

    const cronbachConstant = await researchStatsRunCommand({
      method: "cronbach-alpha",
      dataPath,
      outDir: path.join(dir, "cronbach-constant"),
      variables: ["numeric_a", "constant_num"],
      covariates: [],
      exactCovariates: [],
      estimand: "ATT",
      matchRatio: 1,
      replacement: false,
      trimThreshold: 0.01,
      stabilizeWeights: true,
      surveyDesign: false,
      allowSurveyApproximation: false,
      alpha: 0.05,
      python,
    });
    expect(cronbachConstant.status).toBe("failed");
    expect(cronbachConstant.issues.map(issue => issue.code)).toContain("STATS_MEASUREMENT_VARIABLE_VARIATION_INSUFFICIENT");

    const clusteringK = await researchStatsRunCommand({
      method: "clustering-validation",
      dataPath,
      outDir: path.join(dir, "clustering-k"),
      variables: ["numeric_a", "numeric_b"],
      outcomeThreshold: 100,
      covariates: [],
      exactCovariates: [],
      estimand: "ATT",
      matchRatio: 1,
      replacement: false,
      trimThreshold: 0.01,
      stabilizeWeights: true,
      surveyDesign: false,
      allowSurveyApproximation: false,
      alpha: 0.05,
      python,
    });
    expect(clusteringK.status).toBe("failed");
    expect(clusteringK.issues.map(issue => issue.code)).toContain("STATS_CLUSTERING_K_SUPPORT_LOW");
    expect((clusteringK.diagnostics.preflight as { methodDecisionSupport?: { requestedRole?: string; verdict?: string; dataSignals?: Record<string, unknown>; notRecommendedMethods?: Array<{ method: string }> } }).methodDecisionSupport).toMatchObject({
      requestedRole: "not_recommended",
      verdict: "blocked",
      dataSignals: expect.objectContaining({
        measurementClusteringSupported: false,
        measurementClusteringK: 100,
      }),
    });

    const miceAllText = await researchStatsRunCommand({
      method: "multiple-imputation-mice",
      dataPath,
      outDir: path.join(dir, "mice-all-text"),
      variables: ["text_var", "all_text"],
      covariates: [],
      exactCovariates: [],
      estimand: "ATT",
      matchRatio: 1,
      replacement: false,
      trimThreshold: 0.01,
      stabilizeWeights: true,
      surveyDesign: false,
      allowSurveyApproximation: false,
      alpha: 0.05,
      python,
    });
    expect(miceAllText.status).toBe("failed");
    expect(miceAllText.issues.map(issue => issue.code)).toContain("STATS_IMPUTATION_NUMERIC_VARIABLES_UNUSABLE");

    const miceMixed = await researchStatsRunCommand({
      method: "multiple-imputation-mice",
      dataPath,
      outDir: path.join(dir, "mice-mixed"),
      variables: ["missing_y", "text_var"],
      covariates: [],
      exactCovariates: [],
      estimand: "ATT",
      matchRatio: 1,
      replacement: false,
      trimThreshold: 0.01,
      stabilizeWeights: true,
      surveyDesign: false,
      allowSurveyApproximation: false,
      alpha: 0.05,
      python,
    });
    expect(miceMixed.status).toBe("succeeded");
    expect(miceMixed.issues.map(issue => issue.code)).toContain("STATS_IMPUTATION_NUMERIC_VARIABLES_UNUSABLE");

    const miceNoMissing = await researchStatsRunCommand({
      method: "multiple-imputation-mice",
      dataPath,
      outDir: path.join(dir, "mice-no-missing"),
      variables: ["numeric_a", "numeric_b"],
      covariates: [],
      exactCovariates: [],
      estimand: "ATT",
      matchRatio: 1,
      replacement: false,
      trimThreshold: 0.01,
      stabilizeWeights: true,
      surveyDesign: false,
      allowSurveyApproximation: false,
      alpha: 0.05,
      python,
    });
    expect(miceNoMissing.status).toBe("failed");
    expect(miceNoMissing.issues.map(issue => issue.code)).toContain("STATS_IMPUTATION_MISSINGNESS_SUPPORT_INVALID");

    const ipwNoMissing = await researchStatsRunCommand({
      method: "missingness-ipw",
      dataPath,
      outDir: path.join(dir, "ipw-no-missing"),
      outcome: "numeric_a",
      variables: ["numeric_a", "numeric_b"],
      covariates: ["numeric_b"],
      exactCovariates: [],
      estimand: "ATT",
      matchRatio: 1,
      replacement: false,
      trimThreshold: 0.01,
      stabilizeWeights: true,
      surveyDesign: false,
      allowSurveyApproximation: false,
      alpha: 0.05,
      python,
    });
    expect(ipwNoMissing.status).toBe("succeeded");
    expect(ipwNoMissing.issues.map(issue => issue.code)).toContain("STATS_MISSINGNESS_IPW_TARGET_MISSINGNESS_INVALID");
    expect(ipwNoMissing.issues.map(issue => issue.code)).toContain("MISSINGNESS_IPW_NO_OUTCOME_MISSING");
    expect(ipwNoMissing.estimates[0]).toMatchObject({
      max_ipw: 1,
      effective_sample_size_fraction: 1,
    });

    const kappaConstant = await researchStatsRunCommand({
      method: "reliability-kappa",
      dataPath,
      outDir: path.join(dir, "kappa-constant"),
      variables: ["rater_constant", "rater_var"],
      covariates: [],
      exactCovariates: [],
      estimand: "ATT",
      matchRatio: 1,
      replacement: false,
      trimThreshold: 0.01,
      stabilizeWeights: true,
      surveyDesign: false,
      allowSurveyApproximation: false,
      alpha: 0.05,
      python,
    });
    expect(kappaConstant.status).toBe("failed");
    expect(kappaConstant.issues.map(issue => issue.code)).toContain("STATS_KAPPA_RATER_LEVELS_INVALID");
    expect((kappaConstant.diagnostics.preflight as { methodDecisionSupport?: { requestedRole?: string; verdict?: string; dataSignals?: Record<string, unknown>; notRecommendedMethods?: Array<{ method: string }> } }).methodDecisionSupport).toMatchObject({
      requestedRole: "not_recommended",
      verdict: "blocked",
      dataSignals: expect.objectContaining({
        measurementKappaSupported: false,
        measurementRaterLevelCounts: expect.objectContaining({ rater_constant: 1, rater_var: 2 }),
      }),
    });

    const badPValues = await researchStatsRunCommand({
      method: "multiple-comparison-correction",
      dataPath,
      outDir: path.join(dir, "bad-p-values"),
      variables: ["p_value_bad"],
      covariates: [],
      exactCovariates: [],
      estimand: "ATT",
      matchRatio: 1,
      replacement: false,
      trimThreshold: 0.01,
      stabilizeWeights: true,
      surveyDesign: false,
      allowSurveyApproximation: false,
      alpha: 0.05,
      python,
    });
    expect(badPValues.status).toBe("failed");
    expect(badPValues.issues.map(issue => issue.code)).toContain("STATS_PVALUE_DOMAIN_INVALID");
    expect((badPValues.diagnostics.preflight as { methodDecisionSupport?: { requestedRole?: string; verdict?: string; dataSignals?: Record<string, unknown> } }).methodDecisionSupport).toMatchObject({
      requestedRole: "not_recommended",
      verdict: "blocked",
      dataSignals: expect.objectContaining({
        measurementPValueVariable: "p_value_bad",
        measurementPValueInvalidCount: 1,
        measurementPValueCorrectionSupported: false,
      }),
    });

    const badPower = await researchStatsRunCommand({
      method: "power-sample-size",
      dataPath,
      outDir: path.join(dir, "bad-power"),
      variables: ["numeric_a"],
      outcomeThreshold: -0.25,
      exposureThreshold: 1.1,
      covariates: [],
      exactCovariates: [],
      estimand: "ATT",
      matchRatio: 1,
      replacement: false,
      trimThreshold: 0.01,
      stabilizeWeights: true,
      surveyDesign: false,
      allowSurveyApproximation: false,
      alpha: 0.05,
      python,
    });
    expect(badPower.status).toBe("failed");
    expect(badPower.issues.map(issue => issue.code)).toEqual(expect.arrayContaining([
      "STATS_POWER_EFFECT_SIZE_INVALID",
      "STATS_POWER_TARGET_INVALID",
    ]));
  });

  it("blocks degenerate core inference support before producing misleading test statistics", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "agenteer-stats-core-degenerate-"));
    const dataPath = path.join(dir, "core-degenerate.csv");
    await writeFile(dataPath, [
      "g,g3,y_step,y_by_g3,paired_left,paired_right",
      ...Array.from({ length: 60 }, (_, index) => {
        const g = index % 2;
        const g3 = index % 3;
        const yStep = g === 0 ? 1 : 2;
        const yByG3 = g3 + 1;
        return [g, g3, yStep, yByG3, g, g].join(",");
      }),
    ].join("\n"));
    const base = {
      dataPath,
      variables: [],
      covariates: [],
      exactCovariates: [],
      estimand: "ATT",
      matchRatio: 1,
      replacement: false,
      trimThreshold: 0.01,
      stabilizeWeights: true,
      surveyDesign: false,
      allowSurveyApproximation: false,
      alpha: 0.05,
      python,
    };

    const welch = await researchStatsRunCommand({
      ...base,
      method: "welch-t-test",
      outDir: path.join(dir, "welch-zero-variance"),
      outcome: "y_step",
      group: "g",
    });
    expect(welch.status).toBe("failed");
    expect(welch.issues.map(issue => issue.code)).toContain("GROUP_OUTCOME_VARIANCE_INSUFFICIENT");
    expect(welch.estimates[0]).toMatchObject({ status: "blocked", reason: "insufficient_group_numeric_support" });
    expect(welch.diagnostics).toMatchObject({
      group_numeric_summary: expect.arrayContaining([
        expect.objectContaining({ n: 30, unique_values: 1 }),
      ]),
    });

    const anova = await researchStatsRunCommand({
      ...base,
      method: "anova",
      outDir: path.join(dir, "anova-zero-variance"),
      outcome: "y_by_g3",
      group: "g3",
    });
    expect(anova.status).toBe("failed");
    expect(anova.issues.map(issue => issue.code)).toContain("GROUP_OUTCOME_VARIANCE_INSUFFICIENT");
    expect(anova.estimates[0]).toMatchObject({ status: "blocked", reason: "insufficient_group_model_support" });

    const mcnemar = await researchStatsRunCommand({
      ...base,
      method: "mcnemar",
      outDir: path.join(dir, "mcnemar-no-discordance"),
      outcome: "paired_left",
      exposure: "paired_right",
    });
    expect(mcnemar.status).toBe("failed");
    expect(mcnemar.issues.map(issue => issue.code)).toContain("MCNEMAR_NO_DISCORDANT_PAIRS");
    expect(mcnemar.estimates[0]).toMatchObject({ status: "blocked", reason: "no_discordant_pairs" });
    expect(mcnemar.diagnostics).toMatchObject({ discordant_pairs: 0 });
  });

  it("maps expanded method ontology ids to stats-run methods", () => {
    expect(statsRunMethodForAnalysisMethod("cox-proportional-hazards")).toBe("cox-proportional-hazards");
    expect(statsRunMethodForAnalysisMethod("fine-gray-competing-risks")).toBe("fine-gray");
    expect(statsRunMethodForAnalysisMethod("multiple-imputation-mice")).toBe("multiple-imputation-mice");
    expect(statsRunMethodForAnalysisMethod("anova-one-way")).toBe("anova");
    expect(statsRunMethodForAnalysisMethod("gamma-glm")).toBe("gamma-glm");
    expect(statsRunMethodForAnalysisMethod("inverse-gaussian-glm")).toBe("inverse-gaussian-glm");
    expect(statsRunMethodForAnalysisMethod("recurrent-event-cox-andersen-gill")).toBe("recurrent-event-cox");
    expect(statsRunMethodForAnalysisMethod("linear-mixed-effects-model")).toBe("linear-mixed-model");
    expect(statsRunMethodForAnalysisMethod("multilevel-logistic-model")).toBe("generalized-mixed-model");
    expect(statsRunMethodForAnalysisMethod("generalized-estimating-equations")).toBe("gee");
    expect(statsRunMethodForAnalysisMethod("roc-auc-calibration")).toBe("prediction-evaluation");
    expect(statsRunMethodForAnalysisMethod("pca-dimensionality-reduction")).toBe("pca");
    expect(statsRunMethodForAnalysisMethod("kmeans-clustering")).toBe("clustering-validation");
    expect(statsRunMethodForAnalysisMethod("cohens-kappa-icc")).toBe("reliability-kappa");
    expect(statsRunMethodForAnalysisMethod("cronbach-alpha-scale")).toBe("cronbach-alpha");
    expect(statsRunMethodForAnalysisMethod("multiple-comparison-fdr")).toBe("multiple-comparison-correction");
    expect(statsRunMethodForAnalysisMethod("model-diagnostics-linear-logistic")).toBe("model-diagnostics");
  });
});
