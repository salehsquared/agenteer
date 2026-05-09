import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  assertMlModelCompatible,
  getMlModelManifest,
  listMlModels,
  researchAnalysisBenchmarkCommand,
  researchAnalysisManifestCommand,
  researchAnalysisRunCommand,
  researchExploreCommand,
  researchExplorePromoteCommand,
  researchMlCompareCommand,
  researchMlInspectCommand,
  researchMlModelsCommand,
  researchMlRunCommand,
  researchMethodSelectCommand,
  researchModelingPlanCommand,
  researchStatsRunCommand,
  statsRunMethodForAnalysisMethod,
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
    expect(plan.methodSelectionEvidence.primaryMethodId).toBe("binary-logistic-regression");
    expect(plan.methodSelectionEvidence.recommendedBackend).toBe("r-survey");
    expect(plan.methodSelectionEvidence.selectionHash).toMatch(/^[a-f0-9]{64}$/);
    expect(plan.methodSelectionEvidence.applyCommandHint).toContain("method-apply");
    expect(plan.routeRecommendation.route).toBe("paper-run");
    expect(plan.routeRecommendation.commandHint).toContain("--backend r-survey");
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

  it("uses backend status evidence when routing complex survey inference", () => {
    const fallback = researchModelingPlanCommand({
      question: "In NHANES adults, is BMI associated with elevated HbA1c?",
      outcomeType: "binary",
      studyDesign: "cross_sectional",
      dataStructures: ["complex_survey"],
      surveyDesign: true,
      backendStatus: {
        backends: [
          { id: "r-survey", availability: "missing" },
          { id: "python-linearized", availability: "available" },
          { id: "sklearn", availability: "available" },
        ],
      },
      maxCandidates: 8,
    });
    const blocked = researchModelingPlanCommand({
      question: "In NHANES adults, is BMI associated with elevated HbA1c?",
      outcomeType: "binary",
      studyDesign: "cross_sectional",
      dataStructures: ["complex_survey"],
      surveyDesign: true,
      backendStatus: {
        backends: [
          { id: "r-survey", availability: "missing" },
          { id: "python-linearized", availability: "missing" },
          { id: "sklearn", availability: "available" },
        ],
      },
      maxCandidates: 8,
    });

    expect(fallback.backendEvidence.source).toBe("machine-status");
    expect(fallback.backendEvidence.missing).toContain("r-survey");
    expect(fallback.routeRecommendation.route).toBe("paper-run");
    expect(fallback.routeRecommendation.commandHint).toContain("--backend python-linearized");
    expect(fallback.issues.map(issue => issue.code)).toContain("BACKEND_UNAVAILABLE_FOR_MODELING");
    expect(blocked.routeRecommendation.route).toBe("stop-for-review");
    expect(blocked.routeRecommendation.reason).toContain("no available survey-capable local backend");
  });

  it("uses prior run posture to choose the next modeling route", () => {
    const surveyRecovery = researchModelingPlanCommand({
      question: "In NHANES adults, is BMI associated with HbA1c?",
      outcomeType: "continuous",
      studyDesign: "cross_sectional",
      dataStructures: ["complex_survey"],
      surveyDesign: true,
      priorRuns: [{
        kind: "stats",
        status: "failed",
        posture: "blocked_survey_required",
        methodOrModel: "linear-regression",
        issueCodes: ["SURVEY_DESIGN_REQUIRES_SURVEY_RUNNER"],
        errors: [],
      }],
      backendStatus: {
        backends: [
          { id: "r-survey", availability: "available" },
          { id: "python-linearized", availability: "available" },
        ],
      },
    });
    const mlValidation = researchModelingPlanCommand({
      question: "Can clinical variables predict elevated HbA1c?",
      outcomeType: "binary",
      requiresPrediction: true,
      priorRuns: [{
        kind: "ml",
        status: "succeeded",
        posture: "locally_validated_prediction",
        methodOrModel: "logistic-regression",
        issueCodes: [],
        errors: [],
      }],
    });

    expect(surveyRecovery.priorRunEvidence.runs[0]?.action).toBe("rerun-survey-aware");
    expect(surveyRecovery.routeRecommendation.route).toBe("paper-run");
    expect(surveyRecovery.routeRecommendation.reason).toContain("requires a survey-aware rerun");
    expect(mlValidation.priorRunEvidence.runs[0]?.action).toBe("stop-for-validation");
    expect(mlValidation.routeRecommendation.route).toBe("stop-for-review");
    expect(mlValidation.routeRecommendation.requiredArtifacts).toContain("validation-design-note.md");
  });

  it("points executable standard-table method candidates to stats-run", () => {
    const plan = researchModelingPlanCommand({
      question: "Compare mean HbA1c between two independent insurance groups.",
      goal: "compare_groups",
      outcomeType: "continuous",
      studyDesign: "cross_sectional",
      dataStructures: ["single_table"],
      maxCandidates: 8,
    });
    const ttest = plan.candidates.find(candidate => candidate.id === "method:two-sample-t-test");

    expect(ttest?.commandHint).toContain("research stats-run --method t-test");
    expect(ttest?.expectedArtifacts).toEqual(expect.arrayContaining(["stats-run.json", "estimates.csv", "diagnostics.json", "stats-report.md", "stats-qa.json"]));
    expect(statsRunMethodForAnalysisMethod("two-sample-t-test")).toBe("t-test");
    expect(plan.routeRecommendation.route).toBe("stats-run");
    expect(plan.nextAction).toContain("research stats-run --method t-test");
  });

  it("explores a dataset and generates bounded candidate research questions", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "agenteer-explore-"));
    try {
      const data = path.join(dir, "explore.csv");
      await writeFile(data, statsCsv());
      const result = await researchExploreCommand({
        dataPath: data,
        target: "hba1c",
        outDir: path.join(dir, "exploration"),
        maxPairs: 8,
      });

      expect(result.posture).toBe("exploratory_hypothesis_generation");
      expect(result.tableSummary.rowCount).toBe(140);
      expect(result.variableMap.find(item => item.name === "hba1c")?.role).toBe("candidate_outcome");
      expect(result.associations.length).toBeGreaterThan(0);
      expect(result.targetAssociations.length).toBeGreaterThan(0);
      expect(result.targetAssociations.every(item => item.left === "hba1c" || item.right === "hba1c")).toBe(true);
      expect(result.associations[0]?.left + result.associations[0]?.right).toContain("hba1c");
      expect(result.backgroundAssociations.every(item => item.left !== "hba1c" && item.right !== "hba1c")).toBe(true);
      expect(result.explorationBurden.testedPairCount).toBeGreaterThanOrEqual(result.associations.length);
      expect(result.explorationBurden.targetPairCount).toBe(result.targetAssociations.length);
      expect(result.explorationBurden.possibleLeakagePairs.length).toBeGreaterThan(0);
      expect(result.explorationBurden.promotionClearance.level).toBe("hold_for_methods_review");
      expect(result.candidateQuestions[0]?.outcome).toBe("hba1c");
      expect(result.candidateQuestions[0]?.taxonomy).toBe("surprising_cross_domain_signal");
      expect(result.candidateQuestions[0]?.routeIntent).toBe("explanatory_association");
      expect(result.recommendedQuestion?.questionId).toBe(result.candidateQuestions[0]?.id);
      expect(result.recommendedQuestion?.routeIntent).toBe("explanatory_association");
      expect(result.candidateQuestions[0]?.researchInterestScore).toBeGreaterThan(0);
      expect(result.candidateQuestions[0]?.primaryQuestionUse).toBe("recommended");
      expect(result.candidateQuestions[0]?.taxonomyEvidence.taxonomyVersion).toBe("exploration-taxonomy-v1");
      expect(result.candidateQuestions[0]?.taxonomyEvidence.matchedRuleIds.length).toBeGreaterThan(0);
      expect(result.candidateQuestions[0]?.whyThisQuestion).toContain("association");
      expect(result.candidateQuestions.find(question => question.exposure === "elevated")?.avoidAsPrimaryQuestion).toContain("proxy");
      expect(result.candidateQuestions.some(question => question.outcome === "hba1c")).toBe(true);
      expect(result.qa.checks.find(check => check.id === "target-association-scan")?.status).toBe("pass");
      expect(result.qa.checks.find(check => check.id === "taxonomy-evidence")?.status).toBe("pass");
      expect(result.qa.checks.find(check => check.id === "route-intent")?.status).toBe("pass");
      expect(result.qa.checks.find(check => check.id === "promotion-gate")?.status).toBe("warning");
      expect(result.qa.checks.find(check => check.id === "promotion-clearance")?.status).toBe("warning");
      expect(result.qa.checks.find(check => check.id === "exploratory-only")?.status).toBe("warning");
      expect(result.artifacts.map(artifact => artifact.kind)).toEqual(expect.arrayContaining(["exploration", "exploration-report", "candidate-questions"]));
      const report = await readFile(path.join(dir, "exploration", "exploration-report.md"), "utf-8");
      expect(report).toContain("Dataset Exploration Report");
      expect(report).toContain("Recommended Next Question");
      expect(report).toContain("Route intent");
      expect(report).toContain("Target-Centered Associations");
      expect(report).toContain("Background Correlation Map");
      expect(report).toContain("Exploration Burden");
      expect(report).toContain("Candidate promotion summary");
      expect(report).toContain("Promotion clearance");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("requires methods review before handing off held exploration questions", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "agenteer-explore-promote-"));
    try {
      const data = path.join(dir, "explore.csv");
      await writeFile(data, statsCsv());
      const exploration = await researchExploreCommand({
        dataPath: data,
        target: "hba1c",
        outDir: path.join(dir, "exploration"),
        maxPairs: 8,
      });
      const explorationPath = path.join(dir, "exploration", "exploration.json");
      const questionId = exploration.candidateQuestions[0]!.id;

      await expect(researchExplorePromoteCommand({
        explorationPath,
        questionId,
      })).rejects.toThrow(/methods review note is required/);

      const handoff = await researchExplorePromoteCommand({
        explorationPath,
        questionId,
        methodsReviewNote: "Reviewed low-N and proxy risk; use only as modeling-plan seed.",
        outPath: path.join(dir, "exploration", "handoff.json"),
      });

      expect(handoff.status).toBe("needs_methods_review");
      expect(handoff.clearanceLevel).toBe("hold_for_methods_review");
      expect(handoff.modelingPlanSeed.outcome).toBe("hba1c");
      expect(handoff.modelingPlanSeed.routeIntent).toBe("explanatory_association");
      expect(handoff.modelingPlanSeed.taxonomy).toBe("surprising_cross_domain_signal");
      expect(handoff.modelingPlanSeed.researchInterestScore).toBeGreaterThan(0);
      expect(handoff.modelingPlanSeed.primaryQuestionUse).toBe("recommended");
      expect(handoff.modelingPlanSeed.taxonomyEvidence.taxonomyVersion).toBe("exploration-taxonomy-v1");
      expect(handoff.modelingPlanSeed.whyThisQuestion).toContain("association");
      expect(handoff.analysisSpecCandidate.routeIntent).toBe("explanatory_association");
      expect(handoff.analysisSpecCandidate.status).toBe("needs_methods_review");
      expect(handoff.analysisSpecCandidate.variables.outcome).toBe("hba1c");
      expect(handoff.analysisSpecCandidate.requiredBeforeExecution).toEqual(expect.arrayContaining(["Write or approve an AnalysisSpec before execution."]));
      expect(handoff.analysisSpecCandidate.provenance.taxonomyVersion).toBe("exploration-taxonomy-v1");
      expect(handoff.recommendedCommand).toContain("agenteer research modeling-plan");
      expect(handoff.artifacts.map(artifact => artifact.kind)).toContain("exploration-handoff");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("carries exploration handoff review posture into modeling-plan decisions", () => {
    const reviewed = researchModelingPlanCommand({
      question: "Among adults, is BMI associated with HbA1c?",
      outcomeType: "continuous",
      target: "hba1c",
      explorationHandoff: {
        path: "exploration/handoff.json",
        status: "needs_methods_review",
        clearanceLevel: "hold_for_methods_review",
        sourceExplorationSha256: "abc123",
        questionId: "question_01",
        blockers: ["multiplicity review required"],
        methodsReviewNote: "Reviewed as hypothesis-generation only before modeling.",
      },
      maxCandidates: 8,
    });
    const unreviewed = researchModelingPlanCommand({
      question: "Among adults, is BMI associated with HbA1c?",
      outcomeType: "continuous",
      target: "hba1c",
      explorationHandoff: {
        path: "exploration/handoff.json",
        status: "needs_methods_review",
        clearanceLevel: "hold_for_methods_review",
        sourceExplorationSha256: "abc123",
        questionId: "question_01",
        blockers: ["multiplicity review required"],
      },
      maxCandidates: 8,
    });

    expect(reviewed.request.explorationHandoff?.questionId).toBe("question_01");
    expect(reviewed.issues.map(issue => issue.code)).toContain("EXPLORATION_HANDOFF_METHODS_REVIEW");
    expect(reviewed.issues.map(issue => issue.code)).not.toContain("EXPLORATION_HANDOFF_MISSING_REVIEW_NOTE");
    expect(unreviewed.blocked).toBe(true);
    expect(unreviewed.issues.map(issue => issue.code)).toContain("EXPLORATION_HANDOFF_MISSING_REVIEW_NOTE");
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
      expect(result.resultPosture?.status).toBe("locally_validated_prediction");
      expect(result.resultPosture?.supports).toContain("basic calibration review");
      expect(result.preprocessing.excludedColumns).toContain("outcome");
      expect(result.preprocessing.numericFeatures).toEqual(expect.arrayContaining(["age", "bmi"]));
      expect(result.preprocessing.categoricalFeatures).toContain("sex");
      expect(result.metrics.accuracy).toBeGreaterThanOrEqual(0.7);
      expect(result.metrics.auroc).toBeGreaterThanOrEqual(0.7);
      expect(result.metrics.calibration_bins).toBeGreaterThan(0);
      expect(result.explanation.coefficients?.length).toBeGreaterThan(0);
      expect(result.explanation.permutationImportance?.some(item => item.feature === "bmi")).toBe(true);
      expect(result.artifacts.map(artifact => artifact.kind)).toEqual(expect.arrayContaining(["predictions", "calibration", "model", "summary"]));

      const inspected = await researchMlInspectCommand({ runPath: path.join(dir, "run", "ml-run.json") });
      expect(inspected.runId).toBe(result.runId);
      const manifest = await researchAnalysisManifestCommand({ runDir: path.join(dir, "run") });
      expect(manifest.runKind).toBe("ml");
      expect(manifest.readiness).toBe("local_review_ready");
      expect(manifest.artifactCompleteness.status).toBe("pass");
      expect(manifest.resultPosture.status).toBe("locally_validated_prediction");
      expect(manifest.artifacts.find(artifact => artifact.kind === "calibration")?.required).toBe(true);
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
      expect(result.resultPosture?.status).toBe("locally_validated_prediction");
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
      expect(result.resultPosture?.status).toBe("locally_validated_prediction");
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
      expect(cluster.resultPosture?.status).toBe("exploratory_unsupervised");
      expect(cluster.metrics.cluster_count).toBe(3);
      expect(cluster.metrics.silhouette).toBeGreaterThan(0.2);
      expect(pca.status).toBe("succeeded");
      expect(pca.resultPosture?.status).toBe("exploratory_unsupervised");
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
      expect(result.comparisonPosture?.status).toBe("baseline_comparison_ready");
      expect(result.comparisonPosture?.cannotSupport).toContain("external validity");
      expect(result.reviewCard?.status).toBe("local_review_ready");
      expect(result.reviewCard?.missingEvidence).toContain("external or temporal validation evidence");
      expect(await readFile(path.join(dir, "compare", "model-review-card.md"), "utf-8")).toContain("ML Model Review Card");
      const manifest = await researchAnalysisManifestCommand({ runDir: path.join(dir, "compare"), requireReady: true });
      expect(manifest.runKind).toBe("ml-comparison");
      expect(manifest.readiness).toBe("local_review_ready");
      const benchmark = await researchAnalysisBenchmarkCommand({ runDirs: [path.join(dir, "compare")], requireReady: true });
      expect(benchmark.status).toBe("pass");
      expect(result.ranked[0]?.score).not.toBeNull();
      expect(result.ranked.map(item => item.modelId)).toContain("xgboost-classifier");
      expect(result.runs.find(run => run.modelId === "xgboost-classifier")?.status).toBe("failed");
      expect(result.runs.find(run => run.modelId === "xgboost-classifier")?.resultPosture?.status).toBe("optional_dependency_missing");
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
      expect(result.resultPosture?.status).toBe("failed");
      expect(result.errors.join("\n")).toContain("Target column 'missing_target' not found");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }, 30_000);

  it("runs classical statistics methods with hashed artifacts", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "agenteer-stats-"));
    try {
      const data = path.join(dir, "stats.csv");
      await writeFile(data, statsCsv());
      const ttest = await researchStatsRunCommand({
        method: "t-test",
        dataPath: data,
        outcome: "hba1c",
        group: "group",
        variables: [],
        covariates: [],
        outDir: path.join(dir, "ttest"),
        alpha: 0.05,
        python,
      });
      const logistic = await researchStatsRunCommand({
        method: "logistic-regression",
        dataPath: data,
        outcome: "elevated",
        exposure: "bmi",
        covariates: ["age", "sex"],
        variables: [],
        outDir: path.join(dir, "logistic"),
        alpha: 0.05,
        python,
      });

      expect(ttest.status).toBe("succeeded");
      expect(ttest.resultPosture?.status).toBe("exploratory_standard_table");
      expect(ttest.resultPosture?.cannotSupport).toContain("paper-ready conclusions");
      const manifest = await researchAnalysisManifestCommand({ runDir: path.join(dir, "ttest") });
      expect(manifest.runKind).toBe("stats");
      expect(manifest.readiness).toBe("exploratory_only");
      expect(manifest.artifactCompleteness.status).toBe("pass");
      await expect(researchAnalysisManifestCommand({ runDir: path.join(dir, "ttest"), requireReady: true })).rejects.toThrow(/not local_review_ready/);
      expect(ttest.estimates[0]?.mean_difference).toBeGreaterThan(0);
      expect(ttest.artifacts.every(artifact => artifact.sha256)).toBe(true);
      expect(ttest.artifacts.map(artifact => artifact.kind)).toEqual(expect.arrayContaining(["report", "qa"]));
      const report = await readFile(path.join(dir, "ttest", "stats-report.md"), "utf-8");
      expect(report).toContain("Local Review Safety Header");
      expect(report).toContain("Result posture: exploratory_standard_table");
      const qa = JSON.parse(await readFile(path.join(dir, "ttest", "stats-qa.json"), "utf-8")) as { status: string; checks: Array<{ id: string }> };
      expect(qa.status).toMatch(/pass|warning/);
      expect(qa.checks.map(check => check.id)).toContain("result-posture");
      expect(logistic.status).toBe("succeeded");
      expect(logistic.estimates.find(row => row.term === "bmi")?.odds_ratio).toBeGreaterThan(1);
      expect(logistic.diagnostics.model_family).toBe("logistic-regression");
      expect(logistic.issues.map(issue => issue.code)).toContain("POSSIBLE_SEPARATION_OR_EXTREME_LOG_ODDS");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }, 30_000);

  it("runs diagnostic accuracy as an executable stats method", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "agenteer-diagnostic-stats-"));
    try {
      const data = path.join(dir, "diagnostic.csv");
      const selectionPath = path.join(dir, "method-selection.json");
      await writeFile(data, [
        "screen_positive,elevated_hba1c",
        "1,1",
        "1,1",
        "1,1",
        "1,0",
        "1,0",
        "0,1",
        "0,0",
        "0,0",
        "0,0",
        "0,0",
      ].join("\n"));
      const selection = await researchMethodSelectCommand({
        question: "Estimate sensitivity and specificity for a screening threshold against elevated HbA1c.",
        outcomeType: "binary",
        studyDesign: "diagnostic",
        dataStructures: ["single_table"],
        goal: "diagnose",
        outPath: selectionPath,
      });
      expect(selection.primary?.method.id).toBe("diagnostic-accuracy-basic");
      const plan = researchModelingPlanCommand({
        question: "Estimate sensitivity and specificity for a screening threshold against elevated HbA1c.",
        outcomeType: "binary",
        studyDesign: "diagnostic",
        dataStructures: ["single_table"],
        goal: "diagnose",
      });
      expect(plan.routeRecommendation.route).toBe("stats-run");
      expect(plan.routeRecommendation.commandHint).toContain("--method diagnostic-accuracy");
      expect(plan.routeRecommendation.commandHint).toContain("<binary-reference-standard>");
      expect(plan.primary?.id).toBe("method:diagnostic-accuracy-basic");
      const result = await researchStatsRunCommand({
        method: "diagnostic-accuracy",
        dataPath: data,
        outcome: "elevated_hba1c",
        exposure: "screen_positive",
        methodSelectionPath: selectionPath,
        outDir: path.join(dir, "diagnostic-run"),
        python,
      });
      expect(result.status).toBe("succeeded");
      expect(result.binding.status).toBe("bound");
      expect(result.resultPosture?.status).toBe("bound_standard_table");
      expect(result.estimates[0]?.sensitivity).toBe(0.75);
      expect(result.estimates[0]?.sensitivity_ci_low).toBeGreaterThanOrEqual(0);
      expect(result.estimates[0]?.sensitivity_ci_high).toBeLessThanOrEqual(1);
      expect(result.estimates[0]?.specificity).toBeCloseTo(0.6666, 3);
      expect(result.estimates[0]?.positive_predictive_value_ci_low).toBeGreaterThanOrEqual(0);
      expect(result.diagnostics.confusion_matrix).toMatchObject({ tp: 3, fp: 2, tn: 4, fn: 1 });
      const manifest = await researchAnalysisManifestCommand({ runDir: path.join(dir, "diagnostic-run"), requireReady: true });
      expect(manifest.readiness).toBe("local_review_ready");
      const report = await readFile(path.join(dir, "diagnostic-run", "stats-report.md"), "utf-8");
      expect(report).toContain("diagnostic-accuracy");
      expect(report).toContain("Diagnostic Accuracy Boundary");
      expect(report).toContain("Reference standard: elevated_hba1c.");
      expect(report).toContain("Index test or screening indicator: screen_positive.");
      expect(report).toContain("PPV and NPV depend on the prevalence");
      expect(report).toContain("do not justify clinical screening recommendations");
      const qa = JSON.parse(await readFile(path.join(dir, "diagnostic-run", "stats-qa.json"), "utf-8")) as { checks: Array<{ id: string; status: string }> };
      expect(qa.checks.map(check => check.id)).toEqual(expect.arrayContaining([
        "diagnostic-reference-index-roles",
        "diagnostic-core-metrics",
        "diagnostic-predictive-value-context",
        "diagnostic-screening-overclaim-boundary",
        "diagnostic-precision-caveat",
      ]));
      expect(qa.checks.find(check => check.id === "diagnostic-precision-caveat")?.status).toBe("pass");
      const analysisRun = await researchAnalysisRunCommand({
        question: "Estimate sensitivity and specificity for a screening threshold against elevated HbA1c.",
        method: "diagnostic-accuracy",
        dataPath: data,
        outcome: "elevated_hba1c",
        exposure: "screen_positive",
        methodSelectionPath: selectionPath,
        requireBound: true,
        outDir: path.join(dir, "diagnostic-analysis-run"),
        python,
      });
      expect(analysisRun.modelingPlan.inferredGoal).toBe("diagnose");
      expect(analysisRun.modelingPlan.inferredStudyDesign).toBe("diagnostic");
      expect(analysisRun.modelingPlan.routeRecommendation.commandHint).toContain("--method diagnostic-accuracy");
      expect(analysisRun.analysisRunManifest.readiness).toBe("local_review_ready");
      expect(analysisRun.generatedFiles.diagnosticPaper).toBeTruthy();
      expect(analysisRun.generatedFiles.diagnosticPaperQa).toBeTruthy();
      const diagnosticPaper = await readFile(analysisRun.generatedFiles.diagnosticPaper!, "utf-8");
      expect(diagnosticPaper).toContain("Diagnostic Accuracy of screen_positive Against elevated_hba1c");
      expect(diagnosticPaper).toContain("## Summary");
      expect(diagnosticPaper).toContain("Positive and negative predictive values depend on the prevalence");
      expect(diagnosticPaper).not.toMatch(/Agenteer|AnalysisSpec|result posture|local_review_ready|Artifact Posture|paper-run/i);
      const diagnosticPaperQa = JSON.parse(await readFile(analysisRun.generatedFiles.diagnosticPaperQa!, "utf-8")) as { status: string };
      expect(diagnosticPaperQa.status).toBe("pass");
      expect(analysisRun.analysisRunManifest.artifacts.find(artifact => artifact.kind === "diagnostic-paper")?.exists).toBe(true);
      expect(analysisRun.analysisRunManifest.artifacts.find(artifact => artifact.kind === "diagnostic-paper-qa")?.exists).toBe(true);
      const thresholdData = path.join(dir, "diagnostic-thresholds.csv");
      await writeFile(thresholdData, [
        "waist_cm,hba1c_pct",
        "105,6.8",
        "102,6.6",
        "101,6.7",
        "99,5.7",
        "100,5.6",
        "88,6.9",
        "82,5.4",
        "84,5.5",
        "86,5.6",
        "87,5.7",
      ].join("\n"));
      const thresholdRun = await researchStatsRunCommand({
        method: "diagnostic-accuracy",
        dataPath: thresholdData,
        outcome: "hba1c_pct",
        exposure: "waist_cm",
        outcomeThreshold: 6.5,
        exposureThreshold: 100,
        methodSelectionPath: selectionPath,
        outDir: path.join(dir, "diagnostic-threshold-run"),
        python,
      });
      expect(thresholdRun.status).toBe("succeeded");
      expect(thresholdRun.diagnostics.reference_threshold).toBe(6.5);
      expect(thresholdRun.diagnostics.test_threshold).toBe(100);
      expect(thresholdRun.estimates[0]?.sensitivity).toBe(0.75);
      expect(thresholdRun.estimates[0]?.specificity).toBeCloseTo(0.8333, 3);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }, 30_000);

  it("runs propensity score matching with balance diagnostics and matched-pair artifacts", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "agenteer-propensity-match-"));
    try {
      const data = path.join(dir, "propensity.csv");
      const selectionPath = path.join(dir, "propensity-selection.json");
      await writeFile(data, propensityCsv());
      const selection = await researchMethodSelectCommand({
        question: "What is the causal effect of treatment on a binary outcome using propensity score matching?",
        goal: "causal",
        outcomeType: "binary",
        studyDesign: "cohort",
        dataStructures: ["single_table"],
        outPath: selectionPath,
      });
      expect(selection.primary?.method.id).toBe("propensity-score-matching");
      expect(statsRunMethodForAnalysisMethod("propensity-score-matching")).toBe("propensity-score-matching");
      const result = await researchStatsRunCommand({
        method: "propensity-score-matching",
        dataPath: data,
        outcome: "outcome",
        exposure: "treated",
        covariates: ["age", "bmi", "severity", "sex", "site"],
        exactCovariates: ["sex"],
        estimand: "ATT",
        matchRatio: 1,
        caliper: 0.25,
        methodSelectionPath: selectionPath,
        variables: [],
        outDir: path.join(dir, "matching"),
        alpha: 0.05,
        python,
      });

      expect(result.status).toBe("succeeded");
      expect(result.binding.status).toBe("bound");
      expect(result.resultPosture?.status).toBe("causal_design_review_required");
      expect(result.estimates[0]?.effect_measure).toContain("risk difference");
      expect(result.diagnostics.balance).toMatchObject({ covariate_terms: expect.any(Number) });
      expect((result.diagnostics.balance as { max_abs_smd_after: number }).max_abs_smd_after).toBeLessThan(0.6);
      expect(result.diagnostics.matching).toMatchObject({ matched_pairs: expect.any(Number), unmatched_treated: expect.any(Number) });
      expect(result.artifacts.map(artifact => artifact.kind)).toEqual(expect.arrayContaining(["balance", "propensity-scores", "propensity-overlap", "matched-pairs", "report", "qa"]));
      const balance = await readFile(path.join(dir, "matching", "balance.csv"), "utf-8");
      expect(balance).toContain("smd_before");
      expect(balance).toContain("smd_after");
      const report = await readFile(path.join(dir, "matching", "stats-report.md"), "utf-8");
      expect(report).toContain("Propensity Design Diagnostics");
      expect(report).toContain("nearest-neighbor greedy matching");
      expect(report).toContain("do not address unmeasured confounding");
      const qa = JSON.parse(await readFile(path.join(dir, "matching", "stats-qa.json"), "utf-8")) as { checks: Array<{ id: string; status: string }> };
      expect(qa.checks.map(check => check.id)).toEqual(expect.arrayContaining([
        "propensity-treatment-model",
        "propensity-balance",
        "propensity-positivity-overlap",
        "propensity-causal-claim-boundary",
      ]));
      const manifest = await researchAnalysisManifestCommand({ runDir: path.join(dir, "matching") });
      expect(manifest.readiness).toBe("exploratory_only");
      expect(manifest.resultPosture.status).toBe("causal_design_review_required");
      expect(manifest.artifactCompleteness.status).toBe("pass");
      expect(manifest.artifacts.filter(artifact => artifact.required).map(artifact => artifact.kind)).toEqual(expect.arrayContaining(["balance", "propensity-scores", "propensity-overlap", "matched-pairs"]));
      const analysisRun = await researchAnalysisRunCommand({
        question: "What is the causal effect of treatment on a binary outcome using propensity score matching?",
        method: "propensity-score-matching",
        dataPath: data,
        outcome: "outcome",
        exposure: "treated",
        covariates: ["age", "bmi", "severity", "sex", "site"],
        exactCovariates: ["sex"],
        estimand: "ATT",
        matchRatio: 1,
        caliper: 0.25,
        methodSelectionPath: selectionPath,
        requireBound: true,
        outDir: path.join(dir, "matching-analysis-run"),
        python,
      });
      expect(analysisRun.generatedFiles.propensityPaper).toBeTruthy();
      expect(analysisRun.generatedFiles.propensityPaperQa).toBeTruthy();
      expect(analysisRun.analysisRunManifest.artifacts.map(artifact => artifact.kind)).toEqual(expect.arrayContaining(["propensity-paper", "propensity-paper-qa"]));
      const paper = await readFile(analysisRun.generatedFiles.propensityPaper!, "utf-8");
      expect(paper).toContain("Propensity Score Matching Analysis");
      expect(paper).toContain("balance diagnostics");
      expect(paper).not.toContain("AnalysisSpec");
      const paperQa = JSON.parse(await readFile(analysisRun.generatedFiles.propensityPaperQa!, "utf-8")) as { status: string };
      expect(["pass", "warning"]).toContain(paperQa.status);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }, 30_000);

  it("runs propensity score weighting with IPTW diagnostics and weight artifacts", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "agenteer-propensity-weight-"));
    try {
      const data = path.join(dir, "propensity.csv");
      await writeFile(data, propensityCsv());
      const result = await researchStatsRunCommand({
        method: "propensity-score-weighting",
        dataPath: data,
        outcome: "outcome",
        exposure: "treated",
        covariates: ["age", "bmi", "severity", "sex", "site"],
        estimand: "ATE",
        trimThreshold: 0.02,
        stabilizeWeights: true,
        variables: [],
        outDir: path.join(dir, "weighting"),
        alpha: 0.05,
        python,
      });

      expect(result.status).toBe("succeeded");
      expect(result.resultPosture?.status).toBe("causal_design_review_required");
      expect(result.diagnostics.weighting).toMatchObject({
        estimand: "ATE",
        stabilized: true,
        effective_sample_size: expect.any(Number),
      });
      expect(result.artifacts.map(artifact => artifact.kind)).toEqual(expect.arrayContaining(["balance", "propensity-scores", "propensity-overlap", "weights"]));
      const weights = await readFile(path.join(dir, "weighting", "weights.csv"), "utf-8");
      expect(weights).toContain("analysis_weight");
      expect(result.issues.map(issue => issue.code)).not.toContain("PROPENSITY_POOR_OVERLAP");
      const manifest = await researchAnalysisManifestCommand({ runDir: path.join(dir, "weighting") });
      expect(manifest.artifacts.filter(artifact => artifact.required).map(artifact => artifact.kind)).toEqual(expect.arrayContaining(["balance", "propensity-scores", "propensity-overlap", "weights"]));
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }, 30_000);

  it("runs a bounded stats analysis route with manifest and post-run planning", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "agenteer-analysis-run-"));
    try {
      const data = path.join(dir, "stats.csv");
      await writeFile(data, statsCsv());
      const result = await researchAnalysisRunCommand({
        question: "Do groups differ in HbA1c?",
        method: "t-test",
        dataPath: data,
        outcome: "hba1c",
        group: "group",
        outDir: path.join(dir, "analysis-run"),
        python,
      });
      expect(result.statsRun.status).toBe("succeeded");
      expect(result.analysisRunManifest.artifactCompleteness.status).toBe("pass");
      expect(result.analysisRunManifest.readiness).toBe("exploratory_only");
      expect(result.postRunModelingPlan.priorRunEvidence.runs[0]?.action).toBe("rerun-with-binding");
      expect(await readFile(result.generatedFiles.modelingPlan, "utf-8")).toContain("modelingPlan");
      expect(await readFile(result.generatedFiles.postRunModelingPlan, "utf-8")).toContain("priorRunEvidence");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }, 30_000);

  it("summarizes route coverage and writes a benchmark report for stats and ML comparison routes", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "agenteer-analysis-benchmark-"));
    try {
      const statsCsvPath = path.join(dir, "stats.csv");
      const methodSelectionPath = path.join(dir, "method-selection.json");
      await writeFile(statsCsvPath, [
        "group,outcome",
        "0,10",
        "0,11",
        "0,12",
        "1,14",
        "1,15",
        "1,16",
        "1,17",
      ].join("\n"));
      const methodSelection = await researchMethodSelectCommand({
        question: "Use a two-sample t-test to compare the difference in means between two groups.",
        outcomeType: "continuous",
        studyDesign: "cross_sectional",
        dataStructures: ["single_table"],
        goal: "compare_groups",
        outPath: methodSelectionPath,
      });
      expect(methodSelection.primary?.method.id).toBe("two-sample-t-test");
      const stats = await researchAnalysisRunCommand({
        question: "Use a two-sample t-test to compare the difference in means between two groups.",
        method: "t-test",
        dataPath: statsCsvPath,
        group: "group",
        outcome: "outcome",
        methodSelectionPath,
        requireBound: true,
        outDir: path.join(dir, "analysis-run"),
        python,
      });
      const compareCsv = path.join(dir, "binary.csv");
      await writeFile(compareCsv, binaryCsv());
      await researchMlCompareCommand({
        task: "binary_classification",
        dataPath: compareCsv,
        target: "outcome",
        modelIds: ["logistic-regression", "decision-tree-classifier"],
        outDir: path.join(dir, "ml-compare"),
        primaryMetric: "auroc",
        python,
      });

      const benchmark = await researchAnalysisBenchmarkCommand({
        runDirs: [path.join(stats.outDir, "stats-run"), path.join(dir, "ml-compare")],
        requireReady: true,
        outPath: path.join(dir, "benchmark.json"),
        reportPath: path.join(dir, "benchmark.md"),
      });

      expect(benchmark.status).toBe("pass");
      expect(benchmark.routeCoverage.posture).toBe("multi_route_ready");
      expect(benchmark.routeCoverage.byKind.stats).toBe(1);
      expect(benchmark.routeCoverage.byKind["ml-comparison"]).toBe(1);
      expect(benchmark.checks.find(check => check.id === "route-coverage")?.status).toBe("pass");
      expect(await readFile(path.join(dir, "benchmark.md"), "utf-8")).toContain("Analysis Benchmark Report");
      const narrow = await researchAnalysisBenchmarkCommand({
        runDirs: [path.join(dir, "ml-compare")],
        requireReady: true,
      });
      expect(narrow.status).toBe("pass");
      expect(narrow.routeCoverage.posture).toBe("single_route");
      expect(narrow.checks.find(check => check.id === "route-coverage")?.status).toBe("warning");
      const strictNarrow = await researchAnalysisBenchmarkCommand({
        runDirs: [path.join(dir, "ml-compare")],
        requireReady: true,
        requireMultiRoute: true,
      });
      expect(strictNarrow.status).toBe("fail");
      expect(strictNarrow.nextAction).toContain("two local-review-ready route kinds");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }, 30_000);

  it("supports strict bound analysis routes", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "agenteer-analysis-run-bound-"));
    try {
      const data = path.join(dir, "stats.csv");
      const selectionPath = path.join(dir, "method-selection.json");
      await writeFile(data, statsCsv());
      await expect(researchAnalysisRunCommand({
        question: "Do groups differ in HbA1c?",
        method: "t-test",
        dataPath: data,
        outcome: "hba1c",
        group: "group",
        outDir: path.join(dir, "unbound"),
        requireBound: true,
        python,
      })).rejects.toThrow(/requires --method-selection or --analysis-spec/);
      await researchMethodSelectCommand({
        question: "Use a t-test to compare mean HbA1c between two independent groups",
        goal: "compare_groups",
        outcomeType: "continuous",
        dataStructures: ["single_table"],
        outPath: selectionPath,
      });
      const bound = await researchAnalysisRunCommand({
        question: "Do groups differ in HbA1c?",
        method: "t-test",
        dataPath: data,
        outcome: "hba1c",
        group: "group",
        methodSelectionPath: selectionPath,
        requireBound: true,
        outDir: path.join(dir, "bound"),
        python,
      });

      expect(bound.statsRun.binding.status).toBe("bound");
      expect(bound.statsRun.resultPosture?.status).toBe("bound_standard_table");
      expect(bound.analysisRunManifest.readiness).toBe("local_review_ready");
      await expect(researchAnalysisManifestCommand({ runDir: path.join(dir, "bound", "stats-run"), requireReady: true })).resolves.toMatchObject({ readiness: "local_review_ready" });
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }, 30_000);

  it("refuses standard stats execution for complex survey designs unless explicitly exploratory", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "agenteer-stats-survey-"));
    try {
      const data = path.join(dir, "stats.csv");
      await writeFile(data, statsCsv());
      const refused = await researchStatsRunCommand({
        method: "linear-regression",
        dataPath: data,
        outcome: "hba1c",
        exposure: "bmi",
        variables: [],
        covariates: ["age"],
        surveyDesign: true,
        outDir: path.join(dir, "refused"),
        alpha: 0.05,
        python,
      });
      const exploratory = await researchStatsRunCommand({
        method: "linear-regression",
        dataPath: data,
        outcome: "hba1c",
        exposure: "bmi",
        variables: [],
        covariates: ["age"],
        surveyDesign: true,
        allowSurveyApproximation: true,
        outDir: path.join(dir, "exploratory"),
        alpha: 0.05,
        python,
      });

      expect(refused.status).toBe("failed");
      expect(refused.resultPosture?.status).toBe("blocked_survey_required");
      expect(refused.issues.map(issue => issue.code)).toContain("SURVEY_DESIGN_REQUIRES_SURVEY_RUNNER");
      expect(exploratory.status).toBe("succeeded");
      expect(exploratory.resultPosture?.status).toBe("exploratory_survey_approximation");
      expect(exploratory.issues.map(issue => issue.code)).toContain("SURVEY_APPROXIMATION_EXPLICIT");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }, 30_000);

  it("binds stats-run to method-selection evidence and blocks mismatches", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "agenteer-stats-binding-"));
    try {
      const data = path.join(dir, "stats.csv");
      const selectionPath = path.join(dir, "selection.json");
      await writeFile(data, statsCsv());
      const selection = await researchMethodSelectCommand({
        question: "Use a t-test to compare mean HbA1c between two independent groups",
        goal: "compare_groups",
        outcomeType: "continuous",
        dataStructures: ["single_table"],
        outPath: selectionPath,
      });
      const bound = await researchStatsRunCommand({
        method: "t-test",
        dataPath: data,
        outcome: "hba1c",
        group: "group",
        variables: [],
        covariates: [],
        methodSelectionPath: selectionPath,
        outDir: path.join(dir, "bound"),
        alpha: 0.05,
        python,
      });
      const mismatch = await researchStatsRunCommand({
        method: "logistic-regression",
        dataPath: data,
        outcome: "elevated",
        exposure: "bmi",
        variables: [],
        covariates: [],
        methodSelectionPath: selectionPath,
        outDir: path.join(dir, "mismatch"),
        alpha: 0.05,
        python,
      });

      expect(selection.primary?.method.id).toBe("two-sample-t-test");
      expect(bound.status).toBe("succeeded");
      expect(bound.binding.status).toBe("bound");
      expect(bound.resultPosture?.status).toBe("bound_standard_table");
      expect(bound.binding.methodSelectionId).toBe(selection.selectionId);
      expect(bound.binding.methodId).toBe("two-sample-t-test");
      expect(mismatch.status).toBe("failed");
      expect(mismatch.binding.status).toBe("mismatch");
      expect(mismatch.resultPosture?.status).toBe("invalid_binding");
      expect(mismatch.issues.map(issue => issue.code)).toContain("METHOD_SELECTION_STATS_MISMATCH");
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

function statsCsv(): string {
  const rows = ["age,sex,bmi,group,hba1c,elevated"];
  for (let i = 0; i < 140; i++) {
    const age = 30 + (i % 45);
    const sex = i % 2 === 0 ? "F" : "M";
    const bmi = 20 + (i % 40) * 0.55;
    const group = bmi >= 31 ? "high" : "low";
    const hba1c = 4.8 + bmi * 0.045 + age * 0.006 + (sex === "M" ? 0.08 : 0);
    const elevated = hba1c >= 6.0 ? 1 : 0;
    rows.push(`${age},${sex},${bmi.toFixed(2)},${group},${hba1c.toFixed(3)},${elevated}`);
  }
  return `${rows.join("\n")}\n`;
}

function propensityCsv(): string {
  const rows = ["age,bmi,severity,sex,site,treated,outcome,continuous_outcome"];
  for (let i = 0; i < 240; i++) {
    const age = 35 + (i % 45);
    const bmi = 20 + ((i * 7) % 35) * 0.45;
    const severity = ((i * 11) % 20) / 4;
    const sex = i % 2 === 0 ? "F" : "M";
    const site = i % 3 === 0 ? "A" : i % 3 === 1 ? "B" : "C";
    const linearTreatment = -4.2 + age * 0.035 + bmi * 0.07 + severity * 0.28 + (sex === "M" ? 0.25 : -0.1) + (site === "C" ? 0.25 : 0);
    const propensity = 1 / (1 + Math.exp(-linearTreatment));
    const treated = ((i * 37) % 100) / 100 < propensity ? 1 : 0;
    const outcomeScore = -3.4 + treated * 0.75 + age * 0.025 + bmi * 0.045 + severity * 0.22 + (sex === "M" ? 0.15 : 0);
    const outcomeProb = 1 / (1 + Math.exp(-outcomeScore));
    const outcome = ((i * 53 + 7) % 100) / 100 < outcomeProb ? 1 : 0;
    const continuous = 10 + treated * 1.8 + age * 0.04 + bmi * 0.12 + severity * 0.5 + (site === "B" ? 0.4 : 0);
    rows.push(`${age},${bmi.toFixed(2)},${severity.toFixed(2)},${sex},${site},${treated},${outcome},${continuous.toFixed(3)}`);
  }
  return `${rows.join("\n")}\n`;
}
