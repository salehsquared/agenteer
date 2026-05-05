import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  assertMlModelCompatible,
  getMlModelManifest,
  listMlModels,
  researchMlCompareCommand,
  researchMlInspectCommand,
  researchMlModelsCommand,
  researchMlRunCommand,
  researchModelingPlanCommand,
} from "../src/index.js";

const python = path.resolve(".research-runtime/python/bin/python");

describe("research ML modeling layer", () => {
  it("builds a modeling decision plan with statistical, policy, and ML candidates", () => {
    const plan = researchModelingPlanCommand({
      question: "In NHANES adults, can BMI and demographics predict elevated HbA1c?",
      outcomeType: "binary",
      studyDesign: "cross_sectional",
      dataStructures: ["complex_survey"],
      surveyDesign: true,
      requiresPrediction: true,
      maxCandidates: 10,
    });

    expect(plan.inferredGoal).toBe("classify");
    expect(plan.inferredOutcomeType).toBe("binary");
    expect(plan.candidates.map(candidate => candidate.id)).toEqual(expect.arrayContaining([
      "ml:logistic-regression",
      "ml:random-forest-classifier",
      "policy:complex-survey-design",
    ]));
    expect(plan.baselines.map(candidate => candidate.id)).toContain("ml:logistic-regression");
    expect(plan.blockingPolicies.map(candidate => candidate.id)).toContain("policy:complex-survey-design");
    expect(plan.primary?.source).not.toBe("workflow-policy");
    expect(plan.candidates.find(candidate => candidate.id === "policy:complex-survey-design")?.requiredBeforeExecution).toEqual(expect.arrayContaining(["survey weight variable", "strata variable", "PSU variable"]));
    expect(plan.primary?.compatible).toBe(true);
  });

  it("adapts modeling recommendations to table evidence instead of only flags", () => {
    const question = "Can clinical variables predict elevated HbA1c?";
    const smallSparse = researchModelingPlanCommand({
      question,
      outcomeType: "binary",
      requiresPrediction: true,
      target: "outcome",
      tableSummary: syntheticSummary({ rows: 80, missing: 0.42, columns: 24, targetClasses: ["0", "1"] }),
      maxCandidates: 12,
    });
    const largeClean = researchModelingPlanCommand({
      question,
      outcomeType: "binary",
      requiresPrediction: true,
      target: "outcome",
      tableSummary: syntheticSummary({ rows: 5000, missing: 0.02, columns: 24, targetClasses: ["0", "1"] }),
      maxCandidates: 12,
    });

    expect(smallSparse.dataEvidence.source).toBe("table-summary");
    expect(smallSparse.dataEvidence.smallSample).toBe(true);
    expect(smallSparse.dataEvidence.highMissingness).toBe(true);
    expect(smallSparse.blockingPolicies.map(candidate => candidate.id)).toContain("policy:missing-data-sensitivity");
    expect(smallSparse.candidates.find(candidate => candidate.id === "ml:random-forest-classifier")!.score).toBeLessThan(
      largeClean.candidates.find(candidate => candidate.id === "ml:random-forest-classifier")!.score,
    );
    expect(largeClean.dataEvidence.smallSample).toBe(false);
    expect(largeClean.dataEvidence.highMissingness).toBe(false);
  });

  it("recommends design stop-for-review for causal and survival-shaped questions", () => {
    const causal = researchModelingPlanCommand({
      question: "What is the causal effect of treatment on mortality?",
      goal: "causal",
      outcomeType: "binary",
      studyDesign: "cohort",
      maxCandidates: 8,
    });
    const survival = researchModelingPlanCommand({
      question: "Does treatment predict time to readmission?",
      timeToEvent: true,
      outcomeType: "time_to_event",
      studyDesign: "cohort",
      maxCandidates: 8,
    });

    expect(causal.blockingPolicies.map(candidate => candidate.id)).toContain("policy:causal-stop-for-review");
    expect(causal.blockingPolicies.find(candidate => candidate.id === "policy:causal-stop-for-review")?.requiredBeforeExecution).toEqual(expect.arrayContaining(["DAG/confounder rationale", "positivity diagnostics"]));
    expect(causal.primary?.source).toBe("statistical-method");
    expect(survival.issues.map(issue => issue.code)).toContain("SURVIVAL_BACKEND_NOT_YET_EXECUTABLE");
    expect(survival.candidates.some(candidate => candidate.id.includes("cox"))).toBe(true);
  });

  it("lists registered adapters by task and reports optional dependency requirements", () => {
    const binary = researchMlModelsCommand({ task: "binary_classification", includeUnavailable: true });
    const regression = listMlModels({ task: "regression" });
    const optional = getMlModelManifest("xgboost-classifier");

    expect(binary.models.map(model => model.id)).toEqual(expect.arrayContaining(["logistic-regression", "random-forest-classifier", "svm-classifier"]));
    expect(regression.map(model => model.id)).toEqual(expect.arrayContaining(["linear-regression", "ridge-regression", "random-forest-regressor"]));
    expect(optional.availability).toBe("optional_missing");
    expect(optional.requiredPackage).toBe("xgboost");
    expect(() => assertMlModelCompatible("linear-regression", "binary_classification")).toThrow(/not compatible/);
    expect(() => assertMlModelCompatible("xgboost-classifier", "binary_classification")).toThrow(/optional package/);
  });

  it("fits and evaluates binary classification with leakage-safe preprocessing", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "agenteer-ml-binary-"));
    try {
      const data = path.join(dir, "binary.csv");
      await writeFile(data, binaryCsv());
      const result = await researchMlRunCommand({
        task: "binary_classification",
        modelId: "logistic-regression",
        dataPath: data,
        target: "outcome",
        features: ["age", "sex", "bmi", "outcome"],
        outDir: path.join(dir, "run"),
        scale: true,
        cvFolds: 3,
        python,
      });

      expect(result.status).toBe("succeeded");
      expect(result.preprocessing.excludedColumns).toContain("outcome");
      expect(result.preprocessing.numericFeatures).toEqual(expect.arrayContaining(["age", "bmi"]));
      expect(result.preprocessing.categoricalFeatures).toContain("sex");
      expect(result.metrics.accuracy).toBeGreaterThanOrEqual(0.7);
      expect(result.metrics.auroc).toBeGreaterThanOrEqual(0.7);
      expect(result.explanation.coefficients?.length).toBeGreaterThan(0);
      expect(result.explanation.permutationImportance?.some(item => item.feature === "bmi")).toBe(true);
      expect(result.artifacts.map(artifact => artifact.kind)).toEqual(expect.arrayContaining(["predictions", "model", "summary"]));

      const inspected = await researchMlInspectCommand({ runPath: path.join(dir, "run", "ml-run.json") });
      expect(inspected.runId).toBe(result.runId);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }, 30_000);

  it("fits and evaluates multiclass classification", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "agenteer-ml-multiclass-"));
    try {
      const data = path.join(dir, "multi.csv");
      await writeFile(data, multiclassCsv());
      const result = await researchMlRunCommand({
        task: "multiclass_classification",
        modelId: "random-forest-classifier",
        dataPath: data,
        target: "class",
        outDir: path.join(dir, "run"),
        python,
      });

      expect(result.status).toBe("succeeded");
      expect(result.metrics.accuracy).toBeGreaterThanOrEqual(0.7);
      expect(result.metrics.macro_f1).toBeGreaterThanOrEqual(0.7);
      expect(Array.isArray(result.metrics.per_class)).toBe(true);
      expect(result.explanation.featureImportances?.length).toBeGreaterThan(0);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }, 30_000);

  it("fits and evaluates regression with standard metrics", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "agenteer-ml-regression-"));
    try {
      const data = path.join(dir, "regression.csv");
      await writeFile(data, regressionCsv());
      const result = await researchMlRunCommand({
        task: "regression",
        modelId: "ridge-regression",
        dataPath: data,
        target: "target",
        outDir: path.join(dir, "run"),
        scale: true,
        python,
      });

      expect(result.status).toBe("succeeded");
      expect(result.metrics.rmse).toBeLessThan(3);
      expect(result.metrics.r2).toBeGreaterThan(0.8);
      expect(result.explanation.coefficients?.length).toBeGreaterThan(0);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }, 30_000);

  it("runs clustering and dimensionality reduction on tabular data", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "agenteer-ml-unsupervised-"));
    try {
      const data = path.join(dir, "clusters.csv");
      await writeFile(data, clusterCsv());
      const cluster = await researchMlRunCommand({
        task: "clustering",
        modelId: "k-means",
        dataPath: data,
        outDir: path.join(dir, "cluster"),
        scale: true,
        params: { n_clusters: 3 },
        python,
      });
      const pca = await researchMlRunCommand({
        task: "dimensionality_reduction",
        modelId: "pca",
        dataPath: data,
        outDir: path.join(dir, "pca"),
        scale: true,
        params: { n_components: 2 },
        python,
      });

      expect(cluster.status).toBe("succeeded");
      expect(cluster.metrics.cluster_count).toBe(3);
      expect(cluster.metrics.silhouette).toBeGreaterThan(0.2);
      expect(pca.status).toBe("succeeded");
      expect(pca.metrics.transformed_columns).toBe(2);
      expect(pca.metrics.explained_variance_ratio_sum).toBeGreaterThan(0.5);
      const transformed = await readFile(path.join(dir, "pca", "transformed.csv"), "utf-8");
      expect(transformed.split("\n")[0]).toContain("component_1");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }, 30_000);

  it("compares compatible models and ranks by the requested metric", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "agenteer-ml-compare-"));
    try {
      const data = path.join(dir, "binary.csv");
      await writeFile(data, binaryCsv());
      const result = await researchMlCompareCommand({
        task: "binary_classification",
        modelIds: ["logistic-regression", "decision-tree-classifier", "xgboost-classifier"],
        dataPath: data,
        target: "outcome",
        outDir: path.join(dir, "compare"),
        primaryMetric: "accuracy",
        python,
      });

      expect(result.primaryMetric).toBe("accuracy");
      expect(result.ranked[0]?.score).not.toBeNull();
      expect(result.ranked.map(item => item.modelId)).toContain("xgboost-classifier");
      expect(result.runs.find(run => run.modelId === "xgboost-classifier")?.status).toBe("failed");
      expect(result.ranked.filter(item => item.status === "succeeded").length).toBeGreaterThanOrEqual(2);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }, 45_000);

  it("fails clearly when the target column is missing", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "agenteer-ml-missing-target-"));
    try {
      await mkdir(path.join(dir, "run"));
      const data = path.join(dir, "binary.csv");
      await writeFile(data, binaryCsv());
      const result = await researchMlRunCommand({
        task: "binary_classification",
        modelId: "logistic-regression",
        dataPath: data,
        target: "missing_target",
        outDir: path.join(dir, "run"),
        python,
      });

      expect(result.status).toBe("failed");
      expect(result.errors.join("\n")).toContain("Target column 'missing_target' not found");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }, 30_000);
});

function binaryCsv(): string {
  const rows = ["age,sex,bmi,outcome"];
  for (let i = 0; i < 120; i++) {
    const age = 25 + (i % 50);
    const bmi = 18 + (i % 35) * 0.7;
    const sex = i % 2 === 0 ? "F" : "M";
    const score = bmi + (sex === "M" ? 2 : 0) + age * 0.05;
    const outcome = score > 35 ? 1 : 0;
    const bmiText = i % 17 === 0 ? "" : bmi.toFixed(2);
    rows.push(`${age},${sex},${bmiText},${outcome}`);
  }
  return `${rows.join("\n")}\n`;
}

function syntheticSummary(opts: { rows: number; columns: number; missing: number; targetClasses: string[] }) {
  return {
    rowCount: opts.rows,
    columnCount: opts.columns + 1,
    columns: [
      {
        name: "outcome",
        inferredType: "number" as const,
        nonMissingRows: opts.rows,
        missingFraction: 0,
        sampleValues: opts.targetClasses,
      },
      ...Array.from({ length: opts.columns }, (_, index) => ({
        name: `x${index + 1}`,
        inferredType: "number" as const,
        nonMissingRows: Math.max(0, Math.round(opts.rows * (1 - opts.missing))),
        missingFraction: opts.missing,
        sampleValues: ["1", "2", "3"],
      })),
    ],
  };
}

function multiclassCsv(): string {
  const rows = ["x1,x2,site,class"];
  for (let i = 0; i < 150; i++) {
    const bucket = i % 3;
    const x1 = bucket * 5 + (i % 7) * 0.2;
    const x2 = bucket * -3 + (i % 11) * 0.1;
    rows.push(`${x1.toFixed(2)},${x2.toFixed(2)},${bucket === 0 ? "A" : bucket === 1 ? "B" : "C"},${bucket}`);
  }
  return `${rows.join("\n")}\n`;
}

function regressionCsv(): string {
  const rows = ["x1,x2,group,target"];
  for (let i = 0; i < 120; i++) {
    const x1 = i / 4;
    const x2 = (i % 9) - 4;
    const group = i % 2 === 0 ? "low" : "high";
    const target = 3 * x1 - 2 * x2 + (group === "high" ? 5 : -1);
    rows.push(`${x1.toFixed(3)},${x2.toFixed(3)},${group},${target.toFixed(3)}`);
  }
  return `${rows.join("\n")}\n`;
}

function clusterCsv(): string {
  const rows = ["x,y,label"];
  const centers = [[0, 0], [8, 8], [-8, 7]];
  for (let i = 0; i < 150; i++) {
    const center = centers[i % centers.length]!;
    const x = center[0] + (i % 5) * 0.2;
    const y = center[1] + (i % 7) * 0.15;
    rows.push(`${x.toFixed(3)},${y.toFixed(3)},c${i % centers.length}`);
  }
  return `${rows.join("\n")}\n`;
}
