import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { getStatisticalMethodSpec, listStatisticalMethodSpecs, researchFigureQaCommand, researchStatsContractsCommand, researchStatsRunCommand, renderResearchStatsContracts, renderResearchStatsContractsJson, statisticalMethodSpecSchema, statsMethodSchema, statsRunMethodForAnalysisMethod } from "../src/index.js";

const python = path.resolve(".research-runtime/python/bin/python");

async function writeStatsFixture(): Promise<{ dir: string; dataPath: string }> {
  const dir = await mkdtemp(path.join(os.tmpdir(), "agenteer-stats-methods-"));
  const rows = ["x,g,cat,y,ybin,count,time,event,comp_event,post,treat,running,instrument,cluster,score,r1,r2,wide1,wide2,wide3,miss,pval"];
  for (let i = 0; i < 90; i++) {
    const x = (i % 17) / 5;
    const g = i % 2;
    const cat = i % 3 === 0 ? "A" : "B";
    const y = 1 + x * 1.3 + g * 0.8 + (i % 5) / 10;
    const ybin = y > 3 ? 1 : 0;
    const count = Math.max(0, Math.round(1 + x + g + (i % 4)));
    const time = 5 + i;
    const event = i % 4 === 0 ? 1 : 0;
    const compEvent = i % 5 === 0 ? 2 : event;
    const post = i >= 45 ? 1 : 0;
    const treat = g;
    const running = (i - 45) / 10;
    const instrument = i % 3 === 0 ? 1 : 0;
    const cluster = Math.floor(i / 3);
    const score = Math.min(0.98, Math.max(0.02, 0.2 + x / 5 + g * 0.15));
    const r1 = ybin ? "yes" : "no";
    const r2 = (score > 0.52) ? "yes" : "no";
    const wide1 = x + (i % 4) / 10;
    const wide2 = wide1 + 0.25;
    const wide3 = wide1 + 0.5;
    const miss = i % 9 === 0 ? "" : y.toFixed(4);
    const pval = (0.001 + i * 0.002).toFixed(4);
    rows.push([x, g, cat, y.toFixed(4), ybin, count, time, event, compEvent, post, treat, running.toFixed(4), instrument, cluster, score.toFixed(4), r1, r2, wide1.toFixed(4), wide2.toFixed(4), wide3.toFixed(4), miss, pval].join(","));
  }
  const dataPath = path.join(dir, "data.csv");
  await writeFile(dataPath, `${rows.join("\n")}\n`);
  return { dir, dataPath };
}

describe("research stats methods expansion", () => {
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
    }
    const cox = getStatisticalMethodSpec("cox-proportional-hazards");
    expect(cox.family).toBe("survival");
    expect(cox.requiredArguments).toEqual(expect.arrayContaining(["time", "event", "exposure"]));
    expect(cox.assumptions.join(" ")).toMatch(/time zero|censoring/i);
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
    expect(renderResearchStatsContracts(single)).toContain("prediction-evaluation: prediction");
    expect(renderResearchStatsContracts(single)).toContain("required figures");
    const parsed = JSON.parse(renderResearchStatsContractsJson(single)) as { statsContracts: { contracts: Array<{ method: string; qaGates: string[] }> } };
    expect(parsed.statsContracts.contracts[0]?.method).toBe("prediction-evaluation");
    expect(parsed.statsContracts.contracts[0]?.qaGates).toContain("calibration");
  });

  it("executes representative core, regression, survival, causal, missingness, and psychometric methods", async () => {
    const { dir, dataPath } = await writeStatsFixture();
    const runs = [
      ["welch-t-test", { outcome: "y", group: "g" }],
      ["kruskal-wallis", { outcome: "y", group: "cat" }],
      ["cochran-armitage-trend", { outcome: "ybin", exposure: "g" }],
      ["partial-correlation", { outcome: "y", exposure: "x", covariates: ["g"] }],
      ["robust-linear-regression", { outcome: "y", exposure: "x", covariates: ["g"] }],
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
  }, 240_000);

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
    };
    expect(contract.statisticalMethodSpec).toMatchObject({
      method: "welch-t-test",
      family: "core_inference",
      requiredArguments: expect.arrayContaining(["outcome", "group"]),
    });
    expect(contract.statisticalMethodSpec.assumptions.join(" ")).toMatch(/distributional|p-values/i);
    expect(contract.statisticalMethodSpec.expectedFigures.some(figure => figure.required)).toBe(true);
    const qa = JSON.parse(await readFile(path.join(outDir, "stats-qa.json"), "utf-8")) as { checks: Array<{ id: string; status: string }> };
    expect(qa.checks.map(check => check.id)).toEqual(expect.arrayContaining([
      "method-contract-artifact",
      "method-contract-required-inputs",
      "method-contract-diagnostics",
      "method-contract-figure-coverage",
      "method-contract-escalation-rules",
    ]));
    expect(qa.checks.find(check => check.id === "method-contract-artifact")?.status).toBe("pass");
  }, 60_000);

  it("inspects rendered figures for dimensions, blankness, captions, alt text, and source columns", async () => {
    const { dir, dataPath } = await writeStatsFixture();
    const outDir = path.join(dir, "figure-qa");
    const result = await researchStatsRunCommand({
      method: "prediction-evaluation",
      dataPath,
      outDir,
      outcome: "ybin",
      exposure: "score",
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
  }, 60_000);

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
    });
    const welchQa = JSON.parse(await readFile(path.join(welchOut, "stats-qa.json"), "utf-8")) as { checks: Array<{ id: string; status: string }> };
    expect(welchQa.checks.map(check => check.id)).toEqual(expect.arrayContaining([
      "core-inference-sample-size",
      "core-inference-effect-size",
      "core-inference-uncertainty",
      "core-inference-assumptions",
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
    });
    expect(categorical.diagnostics).toMatchObject({
      table: expect.any(Object),
      expected_counts: expect.any(Array),
      min_expected: expect.any(Number),
      two_by_two_effects: true,
    });
    const categoricalQa = JSON.parse(await readFile(path.join(categoricalOut, "stats-qa.json"), "utf-8")) as { checks: Array<{ id: string; status: string }> };
    expect(categoricalQa.checks.map(check => check.id)).toEqual(expect.arrayContaining([
      "categorical-association-table",
      "categorical-association-effect-size",
      "categorical-expected-counts",
    ]));

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
      n: expect.any(Number),
    });
    expect(correlation.diagnostics).toMatchObject({
      ci_method: "Fisher z confidence interval",
      ci_available: true,
    });
    const correlationQa = JSON.parse(await readFile(path.join(correlationOut, "stats-qa.json"), "utf-8")) as { checks: Array<{ id: string; status: string }> };
    expect(correlationQa.checks.map(check => check.id)).toEqual(expect.arrayContaining([
      "correlation-effect-size",
      "correlation-uncertainty",
    ]));
  }, 120_000);

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
    expect(count.diagnostics).toMatchObject({ model_family: "poisson-regression", n_predictors: expect.any(Number), overdispersion_ratio: expect.any(Number), zero_fraction: expect.any(Number) });
    expect(count.diagnostics).toMatchObject({ high_influence_rows: expect.any(Number), artifacts: expect.objectContaining({ model_diagnostics: expect.stringContaining("model-diagnostics.csv") }) });
    expect(count.artifacts.map(artifact => artifact.kind)).toContain("model-diagnostics");
    const modelDiagnostics = await readFile(path.join(countOut, "model-diagnostics.csv"), "utf-8");
    expect(modelDiagnostics).toContain("fitted");
    expect(modelDiagnostics).toContain("residual");
    expect(modelDiagnostics).toContain("cooks_distance");
    expect(modelDiagnostics).toContain("high_influence_flag");
    const countFigures = JSON.parse(await readFile(path.join(countOut, "figures.json"), "utf-8")) as { figures: Array<{ path: string; title: string; sourceColumns: string[] }> };
    expect(countFigures.figures.map(figure => path.basename(figure.path))).toEqual(expect.arrayContaining(["model-residuals.png", "model-influence.png", "model-coefficients.png"]));
    expect(countFigures.figures.find(figure => path.basename(figure.path) === "model-coefficients.png")?.sourceColumns).toEqual(expect.arrayContaining(["count", "x", "g"]));
    const countQa = JSON.parse(await readFile(path.join(countOut, "stats-qa.json"), "utf-8")) as { checks: Array<{ id: string; status: string }> };
    expect(countQa.checks.map(check => check.id)).toEqual(expect.arrayContaining([
      "model-diagnostics-present",
      "model-count-overdispersion",
      "model-collinearity",
      "model-diagnostics-artifact",
    ]));

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
      group_summary: expect.any(Array),
      ci_method: "Greenwood normal approximation",
      artifacts: expect.objectContaining({ survival_curve: expect.stringContaining("kaplan-meier-curve.csv") }),
    });
    expect(km.artifacts.some(artifact => artifact.kind === "table" && artifact.path.endsWith("kaplan-meier-curve.csv"))).toBe(true);
    const kmQa = JSON.parse(await readFile(path.join(kmOut, "stats-qa.json"), "utf-8")) as { checks: Array<{ id: string; status: string }> };
    expect(kmQa.checks.map(check => check.id)).toEqual(expect.arrayContaining([
      "survival-event-count",
      "survival-censoring-context",
      "survival-curve-artifact",
    ]));

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
      proportional_hazards_check: expect.stringMatching(/pass|warning|underpowered|not_available/),
      proportional_hazards_diagnostic: expect.objectContaining({
        method: "time_interaction_approximation",
        status: expect.stringMatching(/pass|warning|underpowered|not_available/),
      }),
    });
    const survivalQa = JSON.parse(await readFile(path.join(survivalOut, "stats-qa.json"), "utf-8")) as { checks: Array<{ id: string; status: string }> };
    expect(survivalQa.checks.map(check => check.id)).toEqual(expect.arrayContaining([
      "survival-event-count",
      "survival-censoring-context",
      "survival-events-per-predictor",
      "cox-discrimination-diagnostic",
      "cox-tie-burden",
      "cox-proportional-hazards-diagnostic",
    ]));
    expect(survivalQa.checks.find(check => check.id === "cox-proportional-hazards-diagnostic")?.status).toMatch(/pass|warning/);

    const recurrentOut = path.join(dir, "recurrent-reliability");
    const recurrent = await researchStatsRunCommand({
      method: "recurrent-event-rate",
      dataPath,
      outDir: recurrentOut,
      time: "time",
      event: "event",
      id: "cluster",
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
    expect(recurrent.estimates[0]).toMatchObject({
      events: expect.any(Number),
      person_time: expect.any(Number),
      rate: expect.any(Number),
      rate_ci_low: expect.any(Number),
      rate_ci_high: expect.any(Number),
    });
    expect(recurrent.diagnostics).toMatchObject({ rate_ci_method: "exact Poisson interval", unique_subjects: expect.any(Number) });

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
    expect(longitudinal.diagnostics).toMatchObject({ clusters: expect.any(Number), min_observations_per_cluster: expect.any(Number) });
    const longitudinalQa = JSON.parse(await readFile(path.join(longitudinalOut, "stats-qa.json"), "utf-8")) as { checks: Array<{ id: string; status: string }> };
    expect(longitudinalQa.checks.map(check => check.id)).toEqual(expect.arrayContaining([
      "longitudinal-cluster-count",
      "longitudinal-observations-per-cluster",
    ]));
  }, 180_000);

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
      surveyDesign: false,
      allowSurveyApproximation: false,
      alpha: 0.05,
      python,
    });
    expect(impute.status).toBe("succeeded");
    expect(impute.artifacts.some(artifact => artifact.kind === "imputed-data")).toBe(true);
    expect(impute.diagnostics).toMatchObject({
      imputed_data: expect.stringContaining("imputed-data.csv"),
      imputation_metadata: expect.objectContaining({
        numeric_only: true,
        included_variables: expect.arrayContaining(["y", "x", "g", "z"]),
      }),
    });
    const imputeQa = JSON.parse(await readFile(path.join(imputeOut, "stats-qa.json"), "utf-8")) as { checks: Array<{ id: string; status: string }> };
    expect(imputeQa.checks.map(check => check.id)).toEqual(expect.arrayContaining([
      "imputation-artifact-present",
      "imputation-method-boundary",
    ]));

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
    expect(ipw.estimates[0]).toMatchObject({
      observed_fraction: expect.any(Number),
      min_prob_observed: expect.any(Number),
      max_ipw: expect.any(Number),
      effective_sample_size: expect.any(Number),
    });
    expect(ipw.diagnostics).toMatchObject({ weights: expect.stringContaining("missingness-ipw.csv"), max_ipw: expect.any(Number) });
    const ipwQa = JSON.parse(await readFile(path.join(ipwOut, "stats-qa.json"), "utf-8")) as { checks: Array<{ id: string; status: string }> };
    expect(ipwQa.checks.map(check => check.id)).toContain("missingness-ipw-stability");

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
    const sensitivityQa = JSON.parse(await readFile(path.join(sensitivityOut, "stats-qa.json"), "utf-8")) as { checks: Array<{ id: string; status: string }> };
    expect(sensitivityQa.checks.map(check => check.id)).toContain("missingness-sensitivity-scenarios");
  }, 120_000);

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
    expect(overlap.diagnostics).toMatchObject({
      treatment: expect.objectContaining({ treated_n: expect.any(Number), control_n: expect.any(Number) }),
      propensity_model: expect.objectContaining({ propensity_min: expect.any(Number), propensity_max: expect.any(Number) }),
      balance: expect.objectContaining({ max_abs_smd_after: expect.any(Number) }),
      positivity: expect.objectContaining({ common_support_fraction: expect.any(Number) }),
      effective_sample_size: expect.any(Number),
      max_weight: expect.any(Number),
      artifacts: expect.objectContaining({
        balance: expect.stringContaining("balance.csv"),
        weights: expect.stringContaining("causal-weights.csv"),
        propensity_overlap: expect.stringContaining("propensity-overlap.csv"),
      }),
    });
    expect(overlap.artifacts.map(artifact => artifact.kind)).toEqual(expect.arrayContaining(["balance", "weights", "propensity-overlap"]));
    expect(overlap.artifacts.map(artifact => artifact.kind)).toEqual(expect.arrayContaining(["figure", "figure-manifest", "figure-qa"]));
    const overlapFigures = JSON.parse(await readFile(path.join(overlapOut, "figures.json"), "utf-8")) as { figures: Array<{ path: string; title: string }> };
    expect(overlapFigures.figures.map(figure => path.basename(figure.path))).toEqual(expect.arrayContaining(["causal-love-plot.png", "causal-propensity-overlap.png"]));
    const overlapQa = JSON.parse(await readFile(path.join(overlapOut, "stats-qa.json"), "utf-8")) as { checks: Array<{ id: string; status: string }> };
    expect(overlapQa.checks.map(check => check.id)).toEqual(expect.arrayContaining([
      "causal-design-boundary",
      "causal-balance-after-adjustment",
      "causal-positivity-support",
      "causal-effective-sample-size",
    ]));

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
    });
    const didQa = JSON.parse(await readFile(path.join(didOut, "stats-qa.json"), "utf-8")) as { checks: Array<{ id: string; status: string }> };
    expect(didQa.checks.map(check => check.id)).toEqual(expect.arrayContaining([
      "did-cell-support",
      "did-parallel-trends-review",
    ]));

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
      unique_time_points: expect.any(Number),
      hac_maxlags: 1,
    });
    const itsQa = JSON.parse(await readFile(path.join(itsOut, "stats-qa.json"), "utf-8")) as { checks: Array<{ id: string; status: string }> };
    expect(itsQa.checks.map(check => check.id)).toContain("its-segment-support");

    const rddOut = path.join(dir, "causal-rdd");
    const rdd = await researchStatsRunCommand({
      method: "regression-discontinuity",
      dataPath,
      outDir: rddOut,
      outcome: "y",
      runningVariable: "running",
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
    expect(rdd.status).toBe("succeeded");
    expect(rdd.diagnostics).toMatchObject({
      below_cutoff_n: expect.any(Number),
      above_cutoff_n: expect.any(Number),
      bandwidth_rule: expect.stringContaining("bandwidth"),
    });
    const rddQa = JSON.parse(await readFile(path.join(rddOut, "stats-qa.json"), "utf-8")) as { checks: Array<{ id: string; status: string }> };
    expect(rddQa.checks.map(check => check.id)).toContain("rdd-cutoff-support");

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
      first_stage_r_squared: expect.any(Number),
      exclusion_restriction_review_required: true,
    });
    const ivQa = JSON.parse(await readFile(path.join(ivOut, "stats-qa.json"), "utf-8")) as { checks: Array<{ id: string; status: string }> };
    expect(ivQa.checks.map(check => check.id)).toEqual(expect.arrayContaining([
      "iv-first-stage-strength",
      "iv-exclusion-review",
    ]));
  }, 180_000);

  it("records prediction discrimination, calibration, threshold metrics, artifacts, and QA gates", async () => {
    const { dir, dataPath } = await writeStatsFixture();
    const outDir = path.join(dir, "prediction-evidence");
    const result = await researchStatsRunCommand({
      method: "prediction-evaluation",
      dataPath,
      outDir,
      outcome: "ybin",
      exposure: "score",
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
      auroc: expect.any(Number),
      auprc: expect.any(Number),
      brier_score: expect.any(Number),
      calibration_mean_absolute_error: expect.any(Number),
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
      score_is_probability_like: true,
      roc_points: expect.any(Number),
      pr_points: expect.any(Number),
      confusion_matrix: expect.objectContaining({ tp: expect.any(Number), fp: expect.any(Number), tn: expect.any(Number), fn: expect.any(Number) }),
      calibration_bins: expect.any(Number),
      artifacts: expect.objectContaining({
        roc_curve: expect.stringContaining("roc-curve.csv"),
        precision_recall_curve: expect.stringContaining("precision-recall-curve.csv"),
        calibration: expect.stringContaining("calibration-bins.csv"),
        confusion_matrix: expect.stringContaining("confusion-matrix.csv"),
      }),
    });
    expect(result.artifacts.filter(artifact => artifact.kind === "table").map(artifact => path.basename(artifact.path))).toEqual(expect.arrayContaining([
      "roc-curve.csv",
      "precision-recall-curve.csv",
      "calibration-bins.csv",
      "confusion-matrix.csv",
    ]));
    expect(result.artifacts.filter(artifact => artifact.kind === "figure").map(artifact => path.basename(artifact.path))).toEqual(expect.arrayContaining([
      "roc-curve.png",
      "precision-recall-curve.png",
      "calibration-plot.png",
    ]));
    const qa = JSON.parse(await readFile(path.join(outDir, "stats-qa.json"), "utf-8")) as { checks: Array<{ id: string; status: string }> };
    expect(qa.checks.map(check => check.id)).toEqual(expect.arrayContaining([
      "prediction-class-balance",
      "prediction-discrimination",
      "prediction-threshold-operating-point",
      "prediction-calibration",
      "prediction-score-probability-boundary",
      "prediction-artifact-completeness",
    ]));
  }, 60_000);

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
      python,
    });
    expect(icc.status).toBe("succeeded");
    expect(icc.estimates[0]).toMatchObject({ icc: expect.any(Number), ms_between: expect.any(Number), ms_within: expect.any(Number) });
    expect(icc.diagnostics).toMatchObject({ subjects: expect.any(Number), raters_or_measures: 3 });

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
      python,
    });
    expect(alpha.status).toBe("succeeded");
    expect(alpha.estimates[0]).toMatchObject({ alpha: expect.any(Number), min_item_total_correlation: expect.any(Number) });
    expect(alpha.artifacts.some(artifact => artifact.path.endsWith("cronbach-item-diagnostics.csv"))).toBe(true);
    const alphaQa = JSON.parse(await readFile(path.join(alphaOut, "stats-qa.json"), "utf-8")) as { checks: Array<{ id: string; status: string }> };
    expect(alphaQa.checks.map(check => check.id)).toEqual(expect.arrayContaining(["scale-reliability-sample-size", "scale-reliability-item-count"]));

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
    expect(pca.diagnostics).toMatchObject({ cumulative_explained_variance: expect.any(Number), n_components: expect.any(Number) });
    expect(pca.artifacts.some(artifact => artifact.path.endsWith("pca-transformed.csv"))).toBe(true);
    expect(pca.artifacts.some(artifact => artifact.path.endsWith("pca-loadings.csv"))).toBe(true);
    const pcaQa = JSON.parse(await readFile(path.join(pcaOut, "stats-qa.json"), "utf-8")) as { checks: Array<{ id: string; status: string }> };
    expect(pcaQa.checks.map(check => check.id)).toEqual(expect.arrayContaining(["pca-variance-captured", "pca-artifacts"]));

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
    expect(clustering.artifacts.some(artifact => artifact.path.endsWith("cluster-labels.csv"))).toBe(true);
    const clusterQa = JSON.parse(await readFile(path.join(clusterOut, "stats-qa.json"), "utf-8")) as { checks: Array<{ id: string; status: string }> };
    expect(clusterQa.checks.map(check => check.id)).toEqual(expect.arrayContaining(["clustering-cluster-size", "clustering-validation-metrics"]));

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
    expect(blandAltman.artifacts.some(artifact => artifact.path.endsWith("bland-altman-source.csv"))).toBe(true);

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
    const powerQa = JSON.parse(await readFile(path.join(powerOut, "stats-qa.json"), "utf-8")) as { checks: Array<{ id: string; status: string }> };
    expect(powerQa.checks.map(check => check.id)).toContain("power-sample-size-finite");
  }, 180_000);

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
    expect(result.issues.map(issue => issue.code)).toEqual(expect.arrayContaining(["SEMANTIC_VALUE_ABOVE_RANGE", "SEMANTIC_MEAN_ABOVE_EXPECTED"]));
  }, 60_000);

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
  }, 60_000);

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
  }, 60_000);

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
  }, 60_000);

  it("blocks methods whose validated backend is not available", async () => {
    const { dir, dataPath } = await writeStatsFixture();
    const result = await researchStatsRunCommand({
      method: "fine-gray",
      dataPath,
      outDir: path.join(dir, "fine-gray"),
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

    expect(result.status).toBe("failed");
    expect(result.issues.map(issue => issue.code)).toContain("METHOD_BACKEND_NOT_AVAILABLE");
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
  });

  it("maps expanded method ontology ids to stats-run methods", () => {
    expect(statsRunMethodForAnalysisMethod("cox-proportional-hazards")).toBe("cox-proportional-hazards");
    expect(statsRunMethodForAnalysisMethod("fine-gray-competing-risks")).toBe("fine-gray");
    expect(statsRunMethodForAnalysisMethod("multiple-imputation-mice")).toBe("multiple-imputation-mice");
    expect(statsRunMethodForAnalysisMethod("anova-one-way")).toBe("anova");
    expect(statsRunMethodForAnalysisMethod("gamma-glm")).toBe("gamma-glm");
    expect(statsRunMethodForAnalysisMethod("linear-mixed-effects-model")).toBe("linear-mixed-model");
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
