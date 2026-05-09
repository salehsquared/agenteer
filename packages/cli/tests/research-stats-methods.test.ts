import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { researchFigureQaCommand, researchStatsRunCommand, statsRunMethodForAnalysisMethod } from "../src/index.js";

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
      expect(result.artifacts.some(artifact => artifact.kind === "figure-manifest"), method).toBe(true);
      expect(result.artifacts.some(artifact => artifact.kind === "figure-qa"), method).toBe(true);
      const qa = JSON.parse(await readFile(path.join(outDir, "stats-qa.json"), "utf-8")) as { status: string };
      expect(["pass", "warning"]).toContain(qa.status);
    }
  }, 240_000);

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

  it("maps expanded method ontology ids to stats-run methods", () => {
    expect(statsRunMethodForAnalysisMethod("cox-proportional-hazards")).toBe("cox-proportional-hazards");
    expect(statsRunMethodForAnalysisMethod("fine-gray-competing-risks")).toBe("fine-gray");
    expect(statsRunMethodForAnalysisMethod("multiple-imputation-mice")).toBe("multiple-imputation-mice");
    expect(statsRunMethodForAnalysisMethod("principal-component-analysis")).toBe("pca");
  });
});
