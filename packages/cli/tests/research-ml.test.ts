import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  assertMlModelCompatible,
  evaluateFeasibilityGate,
  getMlModelManifest,
  listMlModels,
  researchAnalysisBenchmarkCommand,
  researchGoldenRunCommand,
  researchAnalysisManifestCommand,
  researchAnalysisRunCommand,
  researchExploreCommand,
  researchExplorePromoteCommand,
  researchMlCompareCommand,
  researchMlInspectCommand,
  researchMlModelsCommand,
  researchMlRunCommand,
  researchMethodSelectCommand,
  researchModelingFeasibilityEvidenceFromFile,
  researchModelingPlanCommand,
  renderResearchAnalysisBenchmark,
  renderResearchGoldenRun,
  renderResearchAnalysisManifest,
  renderResearchModelingPlan,
  renderResearchRunInspect,
  researchRunInspectCommand,
  researchStatsRunCommand,
  statsRunMethodForAnalysisMethod,
} from "../src/index.js";

const python = path.resolve(".research-runtime/python/bin/python");
const mlIntegrationTestTimeout = 24 * 60 * 60 * 1000;

vi.setConfig({ testTimeout: mlIntegrationTestTimeout });

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

  it("carries feasibility-gate warnings and blockers into modeling guidance", () => {
    const tableSummary = {
      rowCount: 500,
      columnCount: 3,
      columns: [
        { name: "outcome", inferredType: "number" as const, nonMissingRows: 500, missingFraction: 0, uniqueCount: 2, valueCounts: [{ value: "0", count: 400, fraction: 0.8 }, { value: "1", count: 100, fraction: 0.2 }], sampleValues: ["0", "1"], min: 0, max: 1 },
        { name: "treatment", inferredType: "number" as const, nonMissingRows: 500, missingFraction: 0, uniqueCount: 2, valueCounts: [{ value: "0", count: 250, fraction: 0.5 }, { value: "1", count: 250, fraction: 0.5 }], sampleValues: ["0", "1"], min: 0, max: 1 },
        { name: "age", inferredType: "number" as const, nonMissingRows: 500, missingFraction: 0, uniqueCount: 70, sampleValues: ["45", "65", "80"], min: 18, max: 95, mean: 67 },
      ],
    };
    const warningPlan = researchModelingPlanCommand({
      question: "Is treatment associated with mortality after adjustment for age?",
      goal: "associate",
      outcomeType: "binary",
      target: "outcome",
      roleHints: { outcome: "outcome", exposure: "treatment", covariates: ["age"], variables: [], exactCovariates: [] },
      tableSummary,
      feasibilityEvidence: {
        path: "fixtures/controller-feasibility-verdict.json",
        verdict: "needs_data_profiling",
        status: "warning",
        score: 0.62,
        confidence: 0.76,
        blockers: [],
        warnings: ["Complete-case support should be confirmed before adjusted modeling."],
        requiredModifications: ["Document explicit missingness handling."],
        nextAction: "Run table-summary and missingness-summary before execution.",
      },
    });
    const blockedPlan = researchModelingPlanCommand({
      question: "Is treatment associated with mortality after adjustment for age?",
      goal: "associate",
      outcomeType: "binary",
      target: "outcome",
      roleHints: { outcome: "outcome", exposure: "treatment", covariates: ["age"], variables: [], exactCovariates: [] },
      tableSummary,
      feasibilityEvidence: {
        path: "fixtures/controller-feasibility-verdict.json",
        verdict: "reject",
        status: "block",
        score: 0.14,
        confidence: 0.91,
        blockers: ["Outcome is not available after applying the proposed cohort definition."],
        warnings: [],
        requiredModifications: ["Choose an outcome present in the dataset."],
        nextAction: "Patch outcome or reject the study idea.",
      },
    });

    expect(warningPlan.blocked).toBe(false);
    expect(warningPlan.feasibilityEvidence).toMatchObject({
      source: "controller-feasibility",
      verdict: "needs_data_profiling",
      status: "warning",
      score: 0.62,
    });
    expect(warningPlan.issues.map(issue => issue.code)).toContain("FEASIBILITY_GATE_WARNING");
    expect(warningPlan.statisticalMethodGuidance.warnings.map(issue => issue.code)).toContain("METHOD_GUIDANCE_FEASIBILITY_WARNING");
    expect(warningPlan.statisticalMethodGuidance.readiness).toMatchObject({
      status: "ready_with_sensitivity",
      requiredBeforeExecution: expect.arrayContaining(["resolve or explicitly accept feasibility-gate warnings before execution"]),
    });

    expect(blockedPlan.blocked).toBe(true);
    expect(blockedPlan.feasibilityEvidence).toMatchObject({
      source: "controller-feasibility",
      verdict: "reject",
      status: "block",
      blockers: ["Outcome is not available after applying the proposed cohort definition."],
    });
    expect(blockedPlan.issues.map(issue => issue.code)).toContain("FEASIBILITY_GATE_BLOCKED");
    expect(blockedPlan.statisticalMethodGuidance.blockers.map(issue => issue.code)).toContain("METHOD_GUIDANCE_FEASIBILITY_BLOCKED");
    expect(blockedPlan.statisticalMethodGuidance.readiness).toMatchObject({
      status: "blocked",
      promotionBlockers: expect.arrayContaining([
        expect.stringContaining("Outcome is not available after applying the proposed cohort definition"),
      ]),
    });
    expect(renderResearchModelingPlan(warningPlan)).toContain("feasibility: controller-feasibility; status=warning; verdict=needs_data_profiling");
    expect(renderResearchModelingPlan(warningPlan)).toContain("Document explicit missingness handling");
    expect(renderResearchModelingPlan(blockedPlan)).toContain("feasibility: controller-feasibility; status=block; verdict=reject");
    expect(renderResearchModelingPlan(blockedPlan)).toContain("Outcome is not available after applying the proposed cohort definition");
  });

  it("loads saved feasibility artifacts for standalone modeling-plan decisions", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "agenteer-modeling-feasibility-evidence-"));
    try {
      const feasibilityGatePath = path.join(dir, "feasibility-gate.json");
      const controllerVerdictPath = path.join(dir, "controller-feasibility-verdict.json");
      await writeFile(feasibilityGatePath, `${JSON.stringify({
        schemaVersion: 1,
        feasibilityGate: {
          verdict: "reject",
          status: "block",
          score: 0.08,
          confidence: 0.93,
          blockers: ["Outcome is nonbinary after complete-case filtering."],
          warnings: [],
          requiredModifications: ["Recode the endpoint before logistic modeling."],
          nextAction: "Patch outcome coding and rerun feasibility-gate.",
        },
      }, null, 2)}\n`);
      await writeFile(controllerVerdictPath, `${JSON.stringify({
        schemaVersion: 1,
        controllerFeasibilityVerdict: {
          verdict: "needs_data_profiling",
          status: "warning",
          score: 0.64,
          confidence: 0.75,
          blockers: [],
          warnings: ["Complete-case support should be reviewed."],
          requiredModifications: ["Run missingness-summary before promotion."],
          nextAction: "Accept or repair feasibility warnings before execution.",
        },
      }, null, 2)}\n`);

      const blockedEvidence = await researchModelingFeasibilityEvidenceFromFile(feasibilityGatePath);
      const warningEvidence = await researchModelingFeasibilityEvidenceFromFile(controllerVerdictPath);
      const blockedPlan = researchModelingPlanCommand({
        question: "Is treatment associated with mortality?",
        goal: "associate",
        outcomeType: "binary",
        target: "outcome",
        tableSummary: syntheticSummary({ rows: 500, missing: 0.02, columns: 6, targetClasses: ["0", "1"] }),
        feasibilityEvidence: blockedEvidence,
      });
      const warningPlan = researchModelingPlanCommand({
        question: "Is treatment associated with mortality?",
        goal: "associate",
        outcomeType: "binary",
        target: "outcome",
        tableSummary: syntheticSummary({ rows: 500, missing: 0.02, columns: 6, targetClasses: ["0", "1"] }),
        feasibilityEvidence: warningEvidence,
      });

      expect(blockedEvidence).toMatchObject({
        path: feasibilityGatePath,
        verdict: "reject",
        status: "block",
        blockers: ["Outcome is nonbinary after complete-case filtering."],
      });
      expect(warningEvidence).toMatchObject({
        path: controllerVerdictPath,
        verdict: "needs_data_profiling",
        status: "warning",
      });
      expect(blockedPlan.blocked).toBe(true);
      expect(blockedPlan.issues.map(issue => issue.code)).toContain("FEASIBILITY_GATE_BLOCKED");
      expect(blockedPlan.statisticalMethodGuidance.blockers.map(issue => issue.code)).toContain("METHOD_GUIDANCE_FEASIBILITY_BLOCKED");
      expect(warningPlan.blocked).toBe(false);
      expect(warningPlan.statisticalMethodGuidance.warnings.map(issue => issue.code)).toContain("METHOD_GUIDANCE_FEASIBILITY_WARNING");
      expect(renderResearchModelingPlan(blockedPlan)).toContain(`path=${feasibilityGatePath}`);
      expect(renderResearchModelingPlan(warningPlan)).toContain("Complete-case support should be reviewed");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("rejects semantically impossible variables during feasibility before method execution", async () => {
    const result = await evaluateFeasibilityGate({
      question: "Is age associated with mortality in a local clinical table?",
      method: "logistic-regression",
      outcome: "death_flag",
      exposure: "age_years",
      variables: ["bmi", "hba1c_pct", "propensity_score", "event_count"],
      tableSummary: {
        rowCount: 100,
        columnCount: 6,
        columns: [
          {
            name: "death_flag",
            inferredType: "number",
            nonMissingRows: 100,
            missingFraction: 0,
            uniqueCount: 3,
            valueCounts: [{ value: "0", count: 80, fraction: 0.8 }, { value: "1", count: 15, fraction: 0.15 }, { value: "2", count: 5, fraction: 0.05 }],
            sampleValues: ["0", "1", "2"],
            min: 0,
            max: 2,
            mean: 0.25,
          },
          {
            name: "age_years",
            inferredType: "number",
            nonMissingRows: 100,
            missingFraction: 0,
            sampleValues: ["45", "150"],
            min: 45,
            max: 150,
            mean: 76,
          },
          {
            name: "bmi",
            inferredType: "number",
            nonMissingRows: 100,
            missingFraction: 0,
            sampleValues: ["24", "180"],
            min: 14,
            max: 180,
            mean: 66,
          },
          {
            name: "hba1c_pct",
            inferredType: "number",
            nonMissingRows: 100,
            missingFraction: 0,
            sampleValues: ["5.4", "32"],
            min: 4,
            max: 32,
            mean: 8,
          },
          {
            name: "propensity_score",
            inferredType: "number",
            nonMissingRows: 100,
            missingFraction: 0,
            sampleValues: ["0.2", "1.4"],
            min: 0.2,
            max: 1.4,
            mean: 0.8,
          },
          {
            name: "event_count",
            inferredType: "number",
            nonMissingRows: 100,
            missingFraction: 0,
            sampleValues: ["-1", "9"],
            min: -1,
            max: 9,
            mean: 2,
          },
        ],
      },
    });
    const issueCodes = result.variableChecks.flatMap(check => check.issues.map(issue => issue.code));

    expect(result.status).toBe("block");
    expect(result.verdict).toBe("reject");
    expect(issueCodes).toEqual(expect.arrayContaining([
      "INVALID_BINARY_EVENT_RANGE",
      "IMPLAUSIBLE_AGE_RANGE",
      "IMPLAUSIBLE_BMI_RANGE",
      "IMPLAUSIBLE_HBA1C_RANGE",
      "INVALID_PROPORTION_RANGE",
      "INVALID_EVENT_CODE_RANGE",
    ]));
    expect(result.domains.find(domain => domain.id === "semantic_plausibility")?.status).toBe("block");
  });

  it("blocks modeling guidance when target or role columns are semantically impossible", () => {
    const plan = researchModelingPlanCommand({
      question: "Is age associated with mortality after adjustment for propensity score?",
      goal: "associate",
      outcomeType: "binary",
      target: "death_flag",
      roleHints: {
        outcome: "death_flag",
        exposure: "age_years",
        covariates: ["propensity_score"],
        variables: [],
        exactCovariates: [],
      },
      tableSummary: {
        rowCount: 100,
        columnCount: 4,
        columns: [
          {
            name: "death_flag",
            inferredType: "number",
            nonMissingRows: 100,
            missingFraction: 0,
            uniqueCount: 3,
            valueCounts: [{ value: "0", count: 80, fraction: 0.8 }, { value: "1", count: 15, fraction: 0.15 }, { value: "2", count: 5, fraction: 0.05 }],
            sampleValues: ["0", "1", "2"],
            min: 0,
            max: 2,
          },
          {
            name: "age_years",
            inferredType: "number",
            nonMissingRows: 100,
            missingFraction: 0,
            uniqueCount: 65,
            sampleValues: ["45", "150"],
            min: 45,
            max: 150,
            mean: 76,
          },
          {
            name: "propensity_score",
            inferredType: "number",
            nonMissingRows: 100,
            missingFraction: 0,
            uniqueCount: 95,
            sampleValues: ["0.2", "1.4"],
            min: 0.2,
            max: 1.4,
            mean: 0.8,
          },
          {
            name: "bmi",
            inferredType: "number",
            nonMissingRows: 100,
            missingFraction: 0,
            uniqueCount: 90,
            sampleValues: ["22", "35"],
            min: 18,
            max: 38,
            mean: 27,
          },
        ],
      },
    });

    expect(plan.blocked).toBe(true);
    expect(plan.statisticalMethodGuidance.readiness.status).toBe("blocked");
    expect(plan.statisticalMethodGuidance.blockers.map(issue => issue.code)).toEqual(expect.arrayContaining([
      "METHOD_GUIDANCE_SEMANTIC_INVALID_BINARY_EVENT_RANGE",
      "METHOD_GUIDANCE_SEMANTIC_IMPLAUSIBLE_AGE_RANGE",
      "METHOD_GUIDANCE_SEMANTIC_INVALID_PROPORTION_RANGE",
    ]));
    expect(plan.statisticalMethodGuidance.alternatives.find(alternative => alternative.method === "descriptive")).toMatchObject({
      tier: "sensitivity",
    });
  });

  it("blocks identifier misuse in modeling roles and prediction feature sets", () => {
    const roleMisuse = researchModelingPlanCommand({
      question: "Is patient identifier associated with mortality?",
      goal: "associate",
      outcomeType: "binary",
      target: "mortality",
      roleHints: {
        outcome: "mortality",
        exposure: "patient_id",
        variables: [],
        covariates: [],
        exactCovariates: [],
      },
      tableSummary: {
        rowCount: 200,
        columnCount: 3,
        columns: [
          { name: "mortality", inferredType: "number", nonMissingRows: 200, missingFraction: 0, uniqueCount: 2, valueCounts: [{ value: "0", count: 150, fraction: 0.75 }, { value: "1", count: 50, fraction: 0.25 }], sampleValues: ["0", "1"], min: 0, max: 1 },
          { name: "patient_id", inferredType: "number", nonMissingRows: 200, missingFraction: 0, uniqueCount: 200, sampleValues: ["1", "2", "3"], min: 1, max: 200 },
          { name: "age", inferredType: "number", nonMissingRows: 200, missingFraction: 0, uniqueCount: 65, sampleValues: ["45", "60", "80"], min: 18, max: 95 },
        ],
      },
    });
    const leakyPrediction = researchModelingPlanCommand({
      question: "Predict mortality from local clinical variables.",
      goal: "classify",
      outcomeType: "binary",
      target: "mortality",
      requiresPrediction: true,
      tableSummary: {
        rowCount: 200,
        columnCount: 4,
        columns: [
          { name: "mortality", inferredType: "number", nonMissingRows: 200, missingFraction: 0, uniqueCount: 2, valueCounts: [{ value: "0", count: 150, fraction: 0.75 }, { value: "1", count: 50, fraction: 0.25 }], sampleValues: ["0", "1"], min: 0, max: 1 },
          { name: "patient_id", inferredType: "number", nonMissingRows: 200, missingFraction: 0, uniqueCount: 200, sampleValues: ["1", "2", "3"], min: 1, max: 200 },
          { name: "age", inferredType: "number", nonMissingRows: 200, missingFraction: 0, uniqueCount: 65, sampleValues: ["45", "60", "80"], min: 18, max: 95 },
          { name: "bmi", inferredType: "number", nonMissingRows: 200, missingFraction: 0, uniqueCount: 95, sampleValues: ["24", "31"], min: 18, max: 48 },
        ],
      },
    });
    const declaredIdPrediction = researchModelingPlanCommand({
      question: "Predict mortality from local clinical variables with subject-level validation tracking.",
      goal: "classify",
      outcomeType: "binary",
      target: "mortality",
      requiresPrediction: true,
      roleHints: { id: "patient_id", variables: [], covariates: [], exactCovariates: [] },
      tableSummary: leakyPrediction.request.tableSummary,
    });

    expect(roleMisuse.blocked).toBe(true);
    expect(roleMisuse.statisticalMethodGuidance.blockers.map(issue => issue.code)).toContain("METHOD_GUIDANCE_IDENTIFIER_ROLE_MISUSE");
    expect(leakyPrediction.blocked).toBe(true);
    expect(leakyPrediction.statisticalMethodGuidance.blockers.map(issue => issue.code)).toContain("METHOD_GUIDANCE_IDENTIFIER_FEATURE_LEAKAGE");
    expect(declaredIdPrediction.statisticalMethodGuidance.blockers.map(issue => issue.code)).not.toContain("METHOD_GUIDANCE_IDENTIFIER_FEATURE_LEAKAGE");
  });

  it("blocks outcome-derived and post-index leakage variables before modeling", () => {
    const leakyPrediction = researchModelingPlanCommand({
      question: "Predict mortality from local clinical variables.",
      goal: "classify",
      outcomeType: "binary",
      target: "mortality",
      requiresPrediction: true,
      tableSummary: {
        rowCount: 300,
        columnCount: 5,
        columns: [
          { name: "mortality", inferredType: "number", nonMissingRows: 300, missingFraction: 0, uniqueCount: 2, valueCounts: [{ value: "0", count: 230, fraction: 0.767 }, { value: "1", count: 70, fraction: 0.233 }], sampleValues: ["0", "1"], min: 0, max: 1 },
          { name: "death_date", inferredType: "string", nonMissingRows: 70, missingFraction: 0.767, uniqueCount: 65, sampleValues: ["2024-01-01", "2024-02-01"] },
          { name: "post_discharge_complication", inferredType: "number", nonMissingRows: 300, missingFraction: 0, uniqueCount: 2, valueCounts: [{ value: "0", count: 210, fraction: 0.7 }, { value: "1", count: 90, fraction: 0.3 }], sampleValues: ["0", "1"], min: 0, max: 1 },
          { name: "age", inferredType: "number", nonMissingRows: 300, missingFraction: 0, uniqueCount: 70, sampleValues: ["45", "60", "80"], min: 18, max: 95 },
          { name: "baseline_sofa", inferredType: "number", nonMissingRows: 300, missingFraction: 0, uniqueCount: 20, sampleValues: ["2", "8"], min: 0, max: 20 },
        ],
      },
    });
    const leakyAdjustment = researchModelingPlanCommand({
      question: "Is treatment associated with mortality after adjustment?",
      goal: "causal",
      outcomeType: "binary",
      target: "mortality",
      roleHints: {
        outcome: "mortality",
        exposure: "treatment",
        covariates: ["age", "post_discharge_complication"],
        variables: [],
        exactCovariates: [],
      },
      tableSummary: {
        rowCount: 300,
        columnCount: 4,
        columns: [
          { name: "mortality", inferredType: "number", nonMissingRows: 300, missingFraction: 0, uniqueCount: 2, valueCounts: [{ value: "0", count: 230, fraction: 0.767 }, { value: "1", count: 70, fraction: 0.233 }], sampleValues: ["0", "1"], min: 0, max: 1 },
          { name: "treatment", inferredType: "number", nonMissingRows: 300, missingFraction: 0, uniqueCount: 2, valueCounts: [{ value: "0", count: 150, fraction: 0.5 }, { value: "1", count: 150, fraction: 0.5 }], sampleValues: ["0", "1"], min: 0, max: 1 },
          { name: "age", inferredType: "number", nonMissingRows: 300, missingFraction: 0, uniqueCount: 70, sampleValues: ["45", "60", "80"], min: 18, max: 95 },
          { name: "post_discharge_complication", inferredType: "number", nonMissingRows: 300, missingFraction: 0, uniqueCount: 2, valueCounts: [{ value: "0", count: 210, fraction: 0.7 }, { value: "1", count: 90, fraction: 0.3 }], sampleValues: ["0", "1"], min: 0, max: 1 },
        ],
      },
    });

    expect(leakyPrediction.blocked).toBe(true);
    expect(leakyPrediction.statisticalMethodGuidance.blockers.map(issue => issue.code)).toContain("METHOD_GUIDANCE_OUTCOME_LEAKAGE_FEATURE");
    expect(leakyPrediction.statisticalMethodGuidance.readiness.promotionBlockers.join(" ")).toMatch(/death_date|post_discharge_complication/);
    expect(leakyAdjustment.blocked).toBe(true);
    expect(leakyAdjustment.statisticalMethodGuidance.blockers.map(issue => issue.code)).toContain("METHOD_GUIDANCE_OUTCOME_LEAKAGE_ROLE");
    expect(leakyAdjustment.statisticalMethodGuidance.readiness.requiredBeforeExecution).toContain("remove outcome-derived or post-index leakage variables from predictors and adjustment roles");
  });

  it("selects data-aware executable statistical methods from table shape", () => {
    const continuousTwoGroup = researchModelingPlanCommand({
      question: "Compare outcome between two treatment groups.",
      goal: "compare_groups",
      outcomeType: "continuous",
      target: "outcome",
      tableSummary: {
        rowCount: 120,
        columnCount: 3,
        columns: [
          { name: "outcome", inferredType: "number", nonMissingRows: 118, missingFraction: 0.016, sampleValues: ["1.2", "2.4", "3.8"] },
          { name: "treatment_group", inferredType: "number", nonMissingRows: 120, missingFraction: 0, sampleValues: ["0", "1"], min: 0, max: 1 },
          { name: "age", inferredType: "number", nonMissingRows: 120, missingFraction: 0, sampleValues: ["45", "50", "55"], min: 20, max: 90 },
        ],
      },
    });
    expect(continuousTwoGroup.statisticalMethodGuidance.recommendedStatsRunMethod).toBe("welch-t-test");
    expect(continuousTwoGroup.statisticalMethodGuidance.contract).toMatchObject({
      method: "welch-t-test",
      family: "core_inference",
      requiredArguments: expect.arrayContaining(["outcome", "group"]),
      qaGates: expect.arrayContaining(["assumption-review", "effect-size"]),
    });
    expect(continuousTwoGroup.statisticalMethodGuidance.contract?.requiredFigures).toContain("Outcome distribution by group");
    expect(continuousTwoGroup.statisticalMethodGuidance.alternatives.map(item => item.method)).toEqual(expect.arrayContaining(["welch-t-test", "mann-whitney"]));
    expect(continuousTwoGroup.statisticalMethodGuidance.alternatives[0]?.commandHint).toContain("--group treatment_group");
    expect(continuousTwoGroup.statisticalMethodGuidance.readiness).toMatchObject({
      status: "ready",
      requiredBeforeExecution: expect.arrayContaining(["run stats preflight", "verify stats-qa estimate sanity checks"]),
      promotionBlockers: [],
    });

    const roleHintedTwoGroup = researchModelingPlanCommand({
      question: "Compare outcome between the treatment groups.",
      goal: "compare_groups",
      outcomeType: "continuous",
      target: "outcome",
      roleHints: { group: "treatment_group", variables: [], covariates: [], exactCovariates: [] },
      tableSummary: {
        rowCount: 120,
        columnCount: 4,
        columns: [
          { name: "outcome", inferredType: "number", nonMissingRows: 120, missingFraction: 0, uniqueCount: 95, sampleValues: ["1.2", "2.4", "3.8"], min: 0, max: 10 },
          { name: "sex", inferredType: "string", nonMissingRows: 120, missingFraction: 0, uniqueCount: 2, valueCounts: [{ value: "F", count: 60, fraction: 0.5 }, { value: "M", count: 60, fraction: 0.5 }], sampleValues: ["F", "M"] },
          { name: "treatment_group", inferredType: "string", nonMissingRows: 120, missingFraction: 0, uniqueCount: 2, valueCounts: [{ value: "usual", count: 58, fraction: 0.483 }, { value: "intervention", count: 62, fraction: 0.517 }], sampleValues: ["usual", "intervention"] },
          { name: "age", inferredType: "number", nonMissingRows: 120, missingFraction: 0, uniqueCount: 60, sampleValues: ["45", "50", "55"], min: 20, max: 90 },
        ],
      },
    });
    expect(roleHintedTwoGroup.statisticalMethodGuidance.recommendedStatsRunMethod).toBe("welch-t-test");
    expect(roleHintedTwoGroup.statisticalMethodGuidance.alternatives[0]?.commandHint).toContain("--group treatment_group");
    expect(roleHintedTwoGroup.statisticalMethodGuidance.alternatives[0]?.commandHint).not.toContain("--group sex");

    const misspelledGroupHint = researchModelingPlanCommand({
      question: "Compare outcome between the treatment groups.",
      goal: "compare_groups",
      outcomeType: "continuous",
      target: "outcome",
      roleHints: { group: "treatment_arm", variables: [], covariates: [], exactCovariates: [] },
      tableSummary: {
        rowCount: 120,
        columnCount: 4,
        columns: [
          { name: "outcome", inferredType: "number", nonMissingRows: 120, missingFraction: 0, uniqueCount: 95, sampleValues: ["1.2", "2.4", "3.8"], min: 0, max: 10 },
          { name: "sex", inferredType: "string", nonMissingRows: 120, missingFraction: 0, uniqueCount: 2, valueCounts: [{ value: "F", count: 60, fraction: 0.5 }, { value: "M", count: 60, fraction: 0.5 }], sampleValues: ["F", "M"] },
          { name: "treatment_group", inferredType: "string", nonMissingRows: 120, missingFraction: 0, uniqueCount: 2, valueCounts: [{ value: "usual", count: 58, fraction: 0.483 }, { value: "intervention", count: 62, fraction: 0.517 }], sampleValues: ["usual", "intervention"] },
          { name: "age", inferredType: "number", nonMissingRows: 120, missingFraction: 0, uniqueCount: 60, sampleValues: ["45", "50", "55"], min: 20, max: 90 },
        ],
      },
    });
    expect(misspelledGroupHint.blocked).toBe(true);
    expect(misspelledGroupHint.statisticalMethodGuidance.readiness.status).toBe("blocked");
    expect(misspelledGroupHint.statisticalMethodGuidance.blockers.map(issue => issue.code)).toContain("METHOD_GUIDANCE_ROLE_HINT_COLUMN_MISSING");
    expect(misspelledGroupHint.statisticalMethodGuidance.alternatives[0]?.commandHint).toContain("--group treatment_arm");
    expect(misspelledGroupHint.statisticalMethodGuidance.alternatives[0]?.commandHint).not.toContain("--group sex");

    const continuousGroupHint = researchModelingPlanCommand({
      question: "Compare outcome between treatment groups.",
      goal: "compare_groups",
      outcomeType: "continuous",
      target: "outcome",
      roleHints: { group: "age", variables: [], covariates: [], exactCovariates: [] },
      tableSummary: {
        rowCount: 120,
        columnCount: 3,
        columns: [
          { name: "outcome", inferredType: "number", nonMissingRows: 120, missingFraction: 0, uniqueCount: 95, sampleValues: ["1.2", "2.4", "3.8"], min: 0, max: 10 },
          { name: "age", inferredType: "number", nonMissingRows: 120, missingFraction: 0, uniqueCount: 60, sampleValues: ["45", "50", "55"], min: 20, max: 90 },
          { name: "treatment_group", inferredType: "string", nonMissingRows: 120, missingFraction: 0, uniqueCount: 2, valueCounts: [{ value: "usual", count: 58, fraction: 0.483 }, { value: "intervention", count: 62, fraction: 0.517 }], sampleValues: ["usual", "intervention"] },
        ],
      },
    });
    expect(continuousGroupHint.blocked).toBe(true);
    expect(continuousGroupHint.statisticalMethodGuidance.blockers.map(issue => issue.code)).toContain("METHOD_GUIDANCE_ROLE_HINT_GROUP_NOT_DISCRETE");

    const smallCategorical = researchModelingPlanCommand({
      question: "Compare binary complications between two procedure groups.",
      goal: "compare_groups",
      outcomeType: "binary",
      target: "complication",
      tableSummary: {
        rowCount: 28,
        columnCount: 3,
        columns: [
          { name: "complication", inferredType: "number", nonMissingRows: 28, missingFraction: 0, sampleValues: ["0", "1"], min: 0, max: 1 },
          { name: "procedure_group", inferredType: "string", nonMissingRows: 28, missingFraction: 0, sampleValues: ["A", "B"] },
          { name: "age", inferredType: "number", nonMissingRows: 28, missingFraction: 0, sampleValues: ["45", "50", "55"], min: 20, max: 90 },
        ],
      },
    });
    expect(smallCategorical.statisticalMethodGuidance.recommendedStatsRunMethod).toBe("fisher-exact");
    expect(smallCategorical.statisticalMethodGuidance.warnings.map(issue => issue.code)).toContain("METHOD_GUIDANCE_SMALL_SAMPLE");

    const countAssociation = researchModelingPlanCommand({
      question: "Associate exposure with number of admissions.",
      goal: "associate",
      outcomeType: "count",
      target: "admission_count",
      tableSummary: {
        rowCount: 300,
        columnCount: 3,
        columns: [
          { name: "admission_count", inferredType: "number", nonMissingRows: 300, missingFraction: 0, sampleValues: ["0", "1", "2", "3"], min: 0, max: 12 },
          { name: "exposure", inferredType: "number", nonMissingRows: 300, missingFraction: 0, sampleValues: ["0.2", "0.5", "0.8"], min: 0, max: 1 },
          { name: "site", inferredType: "string", nonMissingRows: 290, missingFraction: 0.033, sampleValues: ["A", "B", "C"] },
        ],
      },
    });
    expect(countAssociation.statisticalMethodGuidance.recommendedStatsRunMethod).toBe("poisson-regression");
    expect(countAssociation.statisticalMethodGuidance.alternatives.map(item => item.method)).toEqual(expect.arrayContaining(["negative-binomial-regression", "zero-inflated-poisson"]));

    const prediction = researchModelingPlanCommand({
      question: "Predict elevated HbA1c from clinical variables.",
      goal: "classify",
      outcomeType: "binary",
      target: "elevated",
      requiresPrediction: true,
      tableSummary: syntheticSummary({ rows: 500, missing: 0.01, columns: 8, targetClasses: ["0", "1"] }),
    });
    expect(prediction.statisticalMethodGuidance.recommendedStatsRunMethod).toBe("prediction-evaluation");
    expect(prediction.statisticalMethodGuidance.contract).toMatchObject({
      method: "prediction-evaluation",
      family: "prediction",
      requiredFigures: expect.arrayContaining(["ROC curve", "Precision-recall curve", "Calibration plot"]),
      qaGates: expect.arrayContaining(["leakage", "discrimination", "calibration"]),
    });
    expect(prediction.statisticalMethodGuidance.alternatives.map(item => item.method)).toContain("logistic-regression");
  });

  it("distinguishes treatment group comparison wording from causal-effect wording", () => {
    const tableSummary = {
      rowCount: 200,
      columnCount: 3,
      columns: [
        { name: "mortality", inferredType: "number" as const, nonMissingRows: 200, missingFraction: 0, uniqueCount: 2, valueCounts: [{ value: "0", count: 150, fraction: 0.75 }, { value: "1", count: 50, fraction: 0.25 }], sampleValues: ["0", "1"], min: 0, max: 1 },
        { name: "treatment_group", inferredType: "number" as const, nonMissingRows: 200, missingFraction: 0, uniqueCount: 2, valueCounts: [{ value: "0", count: 100, fraction: 0.5 }, { value: "1", count: 100, fraction: 0.5 }], sampleValues: ["0", "1"], min: 0, max: 1 },
        { name: "age", inferredType: "number" as const, nonMissingRows: 200, missingFraction: 0, uniqueCount: 70, sampleValues: ["50", "65", "80"], min: 40, max: 95 },
      ],
    };
    const comparison = researchModelingPlanCommand({
      question: "Compare mortality between treatment groups.",
      outcomeType: "binary",
      target: "mortality",
      tableSummary,
    });
    expect(comparison.inferredGoal).toBe("compare_groups");
    expect(comparison.statisticalMethodGuidance.recommendedStatsRunMethod).toBe("chi-square");
    expect(comparison.primary?.source).toBe("statistical-method");

    const causal = researchModelingPlanCommand({
      question: "What is the causal effect of treatment on mortality?",
      outcomeType: "binary",
      target: "mortality",
      tableSummary,
    });
    expect(causal.inferredGoal).toBe("causal");
    expect(causal.blockingPolicies.map(candidate => candidate.id)).toContain("policy:causal-stop-for-review");
    expect(causal.statisticalMethodGuidance.alternatives.map(item => item.method)).toContain("propensity-score-matching");
  });

  it("routes adjusted group comparisons to adjusted models instead of unadjusted tests", () => {
    const adjustedContinuous = researchModelingPlanCommand({
      question: "Compare recovery score between procedure groups after adjustment for age and sex.",
      goal: "compare_groups",
      outcomeType: "continuous",
      target: "recovery_score",
      tableSummary: {
        rowCount: 240,
        columnCount: 4,
        columns: [
          { name: "recovery_score", inferredType: "number", nonMissingRows: 240, missingFraction: 0, uniqueCount: 120, sampleValues: ["2.1", "4.0", "6.5"], min: 0, max: 10, mean: 4.5, median: 4.4, sd: 1.6, variance: 2.56, skewness: 0.2, outlierFraction: 0 },
          { name: "procedure_group", inferredType: "string", nonMissingRows: 240, missingFraction: 0, uniqueCount: 2, valueCounts: [{ value: "A", count: 120, fraction: 0.5 }, { value: "B", count: 120, fraction: 0.5 }], sampleValues: ["A", "B"] },
          { name: "age", inferredType: "number", nonMissingRows: 240, missingFraction: 0, uniqueCount: 70, sampleValues: ["45", "60", "75"], min: 18, max: 95 },
          { name: "sex", inferredType: "string", nonMissingRows: 240, missingFraction: 0, uniqueCount: 2, valueCounts: [{ value: "F", count: 130, fraction: 0.542 }, { value: "M", count: 110, fraction: 0.458 }], sampleValues: ["F", "M"] },
        ],
      },
    });

    expect(adjustedContinuous.statisticalMethodGuidance.recommendedStatsRunMethod).toBe("ancova");
    expect(adjustedContinuous.statisticalMethodGuidance.contract).toMatchObject({
      method: "ancova",
      requiredArguments: expect.arrayContaining(["outcome", "group", "covariates"]),
    });
    expect(adjustedContinuous.statisticalMethodGuidance.alternatives[0]?.commandHint).toContain("--outcome recovery_score --group procedure_group");
    expect(adjustedContinuous.statisticalMethodGuidance.alternatives[0]?.commandHint).toContain("--covariate age");
    expect(adjustedContinuous.statisticalMethodGuidance.alternatives.map(item => item.method)).toEqual(expect.arrayContaining(["welch-t-test", "robust-linear-regression"]));

    const adjustedBinary = researchModelingPlanCommand({
      question: "Compare complications between treatment groups controlling for age and baseline severity.",
      goal: "compare_groups",
      outcomeType: "binary",
      target: "complication",
      tableSummary: {
        rowCount: 300,
        columnCount: 4,
        columns: [
          { name: "complication", inferredType: "number", nonMissingRows: 300, missingFraction: 0, uniqueCount: 2, valueCounts: [{ value: "0", count: 260, fraction: 0.867 }, { value: "1", count: 40, fraction: 0.133 }], sampleValues: ["0", "1"], min: 0, max: 1 },
          { name: "treatment_group", inferredType: "number", nonMissingRows: 300, missingFraction: 0, uniqueCount: 2, valueCounts: [{ value: "0", count: 150, fraction: 0.5 }, { value: "1", count: 150, fraction: 0.5 }], sampleValues: ["0", "1"], min: 0, max: 1 },
          { name: "age", inferredType: "number", nonMissingRows: 300, missingFraction: 0, uniqueCount: 75, sampleValues: ["45", "60", "75"], min: 18, max: 95 },
          { name: "baseline_severity", inferredType: "number", nonMissingRows: 300, missingFraction: 0, uniqueCount: 5, valueCounts: [{ value: "1", count: 60, fraction: 0.2 }, { value: "2", count: 60, fraction: 0.2 }, { value: "3", count: 60, fraction: 0.2 }, { value: "4", count: 60, fraction: 0.2 }, { value: "5", count: 60, fraction: 0.2 }], sampleValues: ["1", "2", "3"], min: 1, max: 5 },
        ],
      },
    });

    expect(adjustedBinary.statisticalMethodGuidance.recommendedStatsRunMethod).toBe("logistic-regression");
    expect(adjustedBinary.statisticalMethodGuidance.alternatives[0]?.commandHint).toContain("--outcome complication --exposure treatment_group");
    expect(adjustedBinary.statisticalMethodGuidance.alternatives[0]?.commandHint).toContain("--covariate age");
    expect(adjustedBinary.statisticalMethodGuidance.alternatives.map(item => item.method)).toContain("chi-square");

    const missingCovariates = researchModelingPlanCommand({
      question: "Compare recovery score between treatment groups after adjustment.",
      goal: "compare_groups",
      outcomeType: "continuous",
      target: "recovery_score",
      tableSummary: {
        rowCount: 160,
        columnCount: 2,
        columns: [
          { name: "recovery_score", inferredType: "number", nonMissingRows: 160, missingFraction: 0, uniqueCount: 100, sampleValues: ["2", "4", "6"], min: 0, max: 10, mean: 4, median: 4, sd: 1.4, variance: 1.96, skewness: 0.1, outlierFraction: 0 },
          { name: "treatment_group", inferredType: "number", nonMissingRows: 160, missingFraction: 0, uniqueCount: 2, valueCounts: [{ value: "0", count: 80, fraction: 0.5 }, { value: "1", count: 80, fraction: 0.5 }], sampleValues: ["0", "1"], min: 0, max: 1 },
        ],
      },
    });

    expect(missingCovariates.blocked).toBe(true);
    expect(missingCovariates.statisticalMethodGuidance.blockers.map(issue => issue.code)).toContain("METHOD_GUIDANCE_ADJUSTMENT_COVARIATES_MISSING");
  });

  it("does not recommend 2x2-only exact tests for sparse multi-level categorical tables", () => {
    const sparseTwoByTwo = researchModelingPlanCommand({
      question: "Compare binary complications between two procedure groups.",
      goal: "compare_groups",
      outcomeType: "binary",
      target: "complication",
      tableSummary: {
        rowCount: 60,
        columnCount: 2,
        columns: [
          { name: "complication", inferredType: "number", nonMissingRows: 60, missingFraction: 0, uniqueCount: 2, valueCounts: [{ value: "0", count: 56, fraction: 0.933 }, { value: "1", count: 4, fraction: 0.067 }], sampleValues: ["0", "1"], min: 0, max: 1 },
          { name: "procedure_group", inferredType: "string", nonMissingRows: 60, missingFraction: 0, uniqueCount: 2, valueCounts: [{ value: "A", count: 30, fraction: 0.5 }, { value: "B", count: 30, fraction: 0.5 }], sampleValues: ["A", "B"] },
        ],
      },
    });
    expect(sparseTwoByTwo.statisticalMethodGuidance.recommendedStatsRunMethod).toBe("fisher-exact");
    expect(sparseTwoByTwo.statisticalMethodGuidance.alternatives.map(item => item.method)).toContain("chi-square");

    const sparseMultiLevel = researchModelingPlanCommand({
      question: "Compare discharge disposition categories between two procedure groups.",
      goal: "compare_groups",
      outcomeType: "categorical",
      target: "disposition",
      tableSummary: {
        rowCount: 80,
        columnCount: 2,
        columns: [
          { name: "disposition", inferredType: "string", nonMissingRows: 80, missingFraction: 0, uniqueCount: 3, valueCounts: [{ value: "home", count: 70, fraction: 0.875 }, { value: "rehab", count: 7, fraction: 0.0875 }, { value: "other", count: 3, fraction: 0.0375 }], sampleValues: ["home", "rehab", "other"] },
          { name: "procedure_group", inferredType: "string", nonMissingRows: 80, missingFraction: 0, uniqueCount: 2, valueCounts: [{ value: "A", count: 40, fraction: 0.5 }, { value: "B", count: 40, fraction: 0.5 }], sampleValues: ["A", "B"] },
        ],
      },
    });

    expect(sparseMultiLevel.statisticalMethodGuidance.recommendedStatsRunMethod).toBe("chi-square");
    expect(sparseMultiLevel.statisticalMethodGuidance.warnings.map(issue => issue.code)).toContain("METHOD_GUIDANCE_EXACT_TEST_REQUIRES_2X2");
    expect(sparseMultiLevel.statisticalMethodGuidance.alternatives.map(item => item.method)).not.toContain("fisher-exact");
    expect(sparseMultiLevel.statisticalMethodGuidance.alternatives.map(item => item.method)).toContain("descriptive");
  });

  it("selects ordinal and multinomial association routes from categorical outcome shape", () => {
    const ordinalSeverity = researchModelingPlanCommand({
      question: "How is treatment associated with functional severity class?",
      goal: "associate",
      outcomeType: "ordinal",
      target: "severity_class",
      tableSummary: {
        rowCount: 600,
        columnCount: 4,
        columns: [
          { name: "severity_class", inferredType: "number", nonMissingRows: 600, missingFraction: 0, uniqueCount: 4, valueCounts: [{ value: "0", count: 160, fraction: 0.267 }, { value: "1", count: 180, fraction: 0.3 }, { value: "2", count: 170, fraction: 0.283 }, { value: "3", count: 90, fraction: 0.15 }], sampleValues: ["0", "1", "2", "3"], min: 0, max: 3 },
          { name: "treatment", inferredType: "number", nonMissingRows: 600, missingFraction: 0, uniqueCount: 2, valueCounts: [{ value: "0", count: 300, fraction: 0.5 }, { value: "1", count: 300, fraction: 0.5 }], sampleValues: ["0", "1"], min: 0, max: 1 },
          { name: "age", inferredType: "number", nonMissingRows: 595, missingFraction: 0.008, uniqueCount: 70, sampleValues: ["55", "70", "82"], min: 40, max: 95 },
          { name: "site", inferredType: "string", nonMissingRows: 600, missingFraction: 0, uniqueCount: 3, valueCounts: [{ value: "A", count: 200, fraction: 0.333 }, { value: "B", count: 200, fraction: 0.333 }, { value: "C", count: 200, fraction: 0.333 }], sampleValues: ["A", "B", "C"] },
        ],
      },
    });

    expect(ordinalSeverity.statisticalMethodGuidance.recommendedStatsRunMethod).toBe("ordinal-logistic-regression");
    expect(ordinalSeverity.statisticalMethodGuidance.rationale).toMatch(/proportional-odds/i);
    expect(ordinalSeverity.statisticalMethodGuidance.alternatives.map(item => item.method)).toEqual(expect.arrayContaining([
      "ordinal-logistic-regression",
      "multinomial-logistic-regression",
    ]));
    expect(ordinalSeverity.statisticalMethodGuidance.alternatives.find(item => item.method === "ordinal-logistic-regression")?.commandHint).toContain("--outcome severity_class");
    expect(ordinalSeverity.statisticalMethodGuidance.contract).toMatchObject({
      method: "ordinal-logistic-regression",
      family: "regression_glm",
    });

    const dischargeDisposition = researchModelingPlanCommand({
      question: "How is procedure type associated with discharge disposition?",
      goal: "associate",
      outcomeType: "categorical",
      target: "disposition",
      tableSummary: {
        rowCount: 450,
        columnCount: 3,
        columns: [
          { name: "disposition", inferredType: "string", nonMissingRows: 450, missingFraction: 0, uniqueCount: 4, valueCounts: [{ value: "home", count: 250, fraction: 0.556 }, { value: "rehab", count: 120, fraction: 0.267 }, { value: "snf", count: 60, fraction: 0.133 }, { value: "other", count: 20, fraction: 0.044 }], sampleValues: ["home", "rehab", "snf", "other"] },
          { name: "procedure_type", inferredType: "string", nonMissingRows: 450, missingFraction: 0, uniqueCount: 2, valueCounts: [{ value: "A", count: 225, fraction: 0.5 }, { value: "B", count: 225, fraction: 0.5 }], sampleValues: ["A", "B"] },
          { name: "age", inferredType: "number", nonMissingRows: 450, missingFraction: 0, uniqueCount: 65, sampleValues: ["50", "68", "81"], min: 20, max: 95 },
        ],
      },
    });

    expect(dischargeDisposition.statisticalMethodGuidance.recommendedStatsRunMethod).toBe("multinomial-logistic-regression");
    expect(dischargeDisposition.statisticalMethodGuidance.alternatives.map(item => item.method)).toContain("descriptive");
    expect(dischargeDisposition.statisticalMethodGuidance.alternatives.find(item => item.method === "multinomial-logistic-regression")?.commandHint).toContain("--outcome disposition");
    expect(dischargeDisposition.statisticalMethodGuidance.contract).toMatchObject({
      method: "multinomial-logistic-regression",
      family: "regression_glm",
    });

    const sparseOrdinal = researchModelingPlanCommand({
      question: "How is treatment associated with sparse ordinal severity grade?",
      goal: "associate",
      outcomeType: "ordinal",
      target: "severity_grade",
      tableSummary: {
        rowCount: 120,
        columnCount: 3,
        columns: [
          { name: "severity_grade", inferredType: "number", nonMissingRows: 120, missingFraction: 0, uniqueCount: 4, valueCounts: [{ value: "0", count: 70, fraction: 0.583 }, { value: "1", count: 35, fraction: 0.292 }, { value: "2", count: 12, fraction: 0.1 }, { value: "3", count: 3, fraction: 0.025 }], sampleValues: ["0", "1", "2", "3"], min: 0, max: 3 },
          { name: "treatment", inferredType: "number", nonMissingRows: 120, missingFraction: 0, uniqueCount: 2, valueCounts: [{ value: "0", count: 60, fraction: 0.5 }, { value: "1", count: 60, fraction: 0.5 }], sampleValues: ["0", "1"], min: 0, max: 1 },
          { name: "age", inferredType: "number", nonMissingRows: 120, missingFraction: 0, uniqueCount: 40, sampleValues: ["55", "70", "82"], min: 40, max: 95 },
        ],
      },
    });

    expect(sparseOrdinal.statisticalMethodGuidance.recommendedStatsRunMethod).toBe("multinomial-logistic-regression");
    expect(sparseOrdinal.statisticalMethodGuidance.warnings.map(issue => issue.code)).toContain("METHOD_GUIDANCE_SPARSE_CATEGORICAL_OUTCOME_MODEL");
    expect(sparseOrdinal.statisticalMethodGuidance.alternatives.find(item => item.method === "ordinal-logistic-regression")?.tier).toBe("sensitivity");
  });

  it("selects repeated-measure statistical routes and executable variable-based command hints", () => {
    const paired = researchModelingPlanCommand({
      question: "Compare blood pressure before and after treatment in the same patients.",
      goal: "compare_groups",
      outcomeType: "continuous",
      repeatedMeasures: true,
      dataStructures: ["repeated_measures"],
      tableSummary: {
        rowCount: 120,
        columnCount: 3,
        columns: [
          { name: "patient_id", inferredType: "number", nonMissingRows: 120, missingFraction: 0, uniqueCount: 120, sampleValues: ["1", "2", "3"], min: 1, max: 120 },
          { name: "bp_pre", inferredType: "number", nonMissingRows: 118, missingFraction: 0.016, uniqueCount: 78, sampleValues: ["130", "142", "118"], min: 92, max: 188 },
          { name: "bp_post", inferredType: "number", nonMissingRows: 117, missingFraction: 0.025, uniqueCount: 80, sampleValues: ["126", "137", "116"], min: 88, max: 181 },
        ],
      },
    });

    expect(paired.statisticalMethodGuidance.recommendedStatsRunMethod).toBe("paired-t-test");
    expect(paired.statisticalMethodGuidance.contract).toMatchObject({
      method: "paired-t-test",
      requiredArguments: ["variables"],
    });
    expect(paired.statisticalMethodGuidance.alternatives[0]?.commandHint).toContain("--variable bp_pre --variable bp_post");
    expect(paired.candidates.find(candidate => candidate.id === "method:paired-t-test")?.commandHint).toContain("--variable <pre-measure> --variable <post-measure>");

    const repeated = researchModelingPlanCommand({
      question: "Compare symptom score across baseline, month 1, and month 3 in the same participants.",
      goal: "compare_groups",
      outcomeType: "continuous",
      repeatedMeasures: true,
      dataStructures: ["repeated_measures"],
      tableSummary: {
        rowCount: 90,
        columnCount: 4,
        columns: [
          { name: "baseline_score", inferredType: "number", nonMissingRows: 90, missingFraction: 0, uniqueCount: 40, sampleValues: ["8", "12", "15"], min: 0, max: 40 },
          { name: "month_1_score", inferredType: "number", nonMissingRows: 86, missingFraction: 0.044, uniqueCount: 38, sampleValues: ["7", "10", "14"], min: 0, max: 39 },
          { name: "month_3_score", inferredType: "number", nonMissingRows: 82, missingFraction: 0.089, uniqueCount: 37, sampleValues: ["6", "9", "12"], min: 0, max: 37 },
          { name: "treatment_group", inferredType: "string", nonMissingRows: 90, missingFraction: 0, uniqueCount: 2, valueCounts: [{ value: "A", count: 45, fraction: 0.5 }, { value: "B", count: 45, fraction: 0.5 }], sampleValues: ["A", "B"] },
        ],
      },
    });

    expect(repeated.statisticalMethodGuidance.recommendedStatsRunMethod).toBe("friedman");
    expect(repeated.statisticalMethodGuidance.contract).toMatchObject({
      method: "friedman",
      requiredArguments: ["variables"],
    });
    expect(repeated.statisticalMethodGuidance.alternatives[0]?.commandHint).toContain("--variable baseline_score --variable month_1_score --variable month_3_score");
    expect(repeated.statisticalMethodGuidance.alternatives.map(item => item.method)).toContain("repeated-measures-anova");

    const pairedBinary = researchModelingPlanCommand({
      question: "Compare symptom resolution before and after treatment in the same participants.",
      goal: "compare_groups",
      outcomeType: "binary",
      repeatedMeasures: true,
      dataStructures: ["repeated_measures"],
      target: "symptom_before",
      tableSummary: {
        rowCount: 140,
        columnCount: 3,
        columns: [
          { name: "patient_id", inferredType: "number", nonMissingRows: 140, missingFraction: 0, uniqueCount: 140, sampleValues: ["1", "2", "3"], min: 1, max: 140 },
          { name: "symptom_before", inferredType: "number", nonMissingRows: 140, missingFraction: 0, uniqueCount: 2, valueCounts: [{ value: "0", count: 30, fraction: 0.214 }, { value: "1", count: 110, fraction: 0.786 }], sampleValues: ["0", "1"], min: 0, max: 1 },
          { name: "symptom_after", inferredType: "number", nonMissingRows: 138, missingFraction: 0.014, uniqueCount: 2, valueCounts: [{ value: "0", count: 80, fraction: 0.58 }, { value: "1", count: 58, fraction: 0.42 }], sampleValues: ["0", "1"], min: 0, max: 1 },
        ],
      },
    });
    expect(pairedBinary.statisticalMethodGuidance.recommendedStatsRunMethod).toBe("mcnemar");
    expect(pairedBinary.statisticalMethodGuidance.alternatives[0]?.commandHint).toContain("--outcome symptom_before --exposure symptom_after");

    const repeatedBinary = researchModelingPlanCommand({
      question: "Compare detection rates across baseline, month 1, and month 3 in the same participants.",
      goal: "compare_groups",
      outcomeType: "binary",
      repeatedMeasures: true,
      dataStructures: ["repeated_measures"],
      target: "detect_baseline",
      tableSummary: {
        rowCount: 160,
        columnCount: 4,
        columns: [
          { name: "detect_baseline", inferredType: "number", nonMissingRows: 160, missingFraction: 0, uniqueCount: 2, valueCounts: [{ value: "0", count: 90, fraction: 0.563 }, { value: "1", count: 70, fraction: 0.438 }], sampleValues: ["0", "1"], min: 0, max: 1 },
          { name: "detect_month_1", inferredType: "number", nonMissingRows: 158, missingFraction: 0.013, uniqueCount: 2, valueCounts: [{ value: "0", count: 80, fraction: 0.506 }, { value: "1", count: 78, fraction: 0.494 }], sampleValues: ["0", "1"], min: 0, max: 1 },
          { name: "detect_month_3", inferredType: "number", nonMissingRows: 154, missingFraction: 0.038, uniqueCount: 2, valueCounts: [{ value: "0", count: 70, fraction: 0.455 }, { value: "1", count: 84, fraction: 0.545 }], sampleValues: ["0", "1"], min: 0, max: 1 },
          { name: "treatment_group", inferredType: "string", nonMissingRows: 160, missingFraction: 0, uniqueCount: 2, valueCounts: [{ value: "A", count: 80, fraction: 0.5 }, { value: "B", count: 80, fraction: 0.5 }], sampleValues: ["A", "B"] },
        ],
      },
    });
    expect(repeatedBinary.statisticalMethodGuidance.recommendedStatsRunMethod).toBe("cochran-q");
    expect(repeatedBinary.statisticalMethodGuidance.contract).toMatchObject({
      method: "cochran-q",
      requiredArguments: ["variables"],
    });
    expect(repeatedBinary.statisticalMethodGuidance.alternatives[0]?.commandHint).toContain("--variable detect_baseline --variable detect_month_1 --variable detect_month_3");
  });

  it("uses table value counts to avoid fragile methods before execution", () => {
    const rareBinary = researchModelingPlanCommand({
      question: "Is treatment associated with mortality after adjustment?",
      goal: "associate",
      outcomeType: "binary",
      target: "mortality",
      tableSummary: {
        rowCount: 500,
        columnCount: 4,
        columns: [
          { name: "mortality", inferredType: "number", nonMissingRows: 500, missingFraction: 0, uniqueCount: 2, valueCounts: [{ value: "0", count: 494, fraction: 0.988 }, { value: "1", count: 6, fraction: 0.012 }], sampleValues: ["0", "1"], min: 0, max: 1 },
          { name: "treatment", inferredType: "number", nonMissingRows: 500, missingFraction: 0, uniqueCount: 2, valueCounts: [{ value: "0", count: 250, fraction: 0.5 }, { value: "1", count: 250, fraction: 0.5 }], sampleValues: ["0", "1"], min: 0, max: 1 },
          { name: "age", inferredType: "number", nonMissingRows: 500, missingFraction: 0, uniqueCount: 50, sampleValues: ["50", "55", "60"], min: 20, max: 90 },
          { name: "sex", inferredType: "string", nonMissingRows: 500, missingFraction: 0, uniqueCount: 2, valueCounts: [{ value: "F", count: 260, fraction: 0.52 }, { value: "M", count: 240, fraction: 0.48 }], sampleValues: ["F", "M"] },
        ],
      },
    });
    expect(rareBinary.statisticalMethodGuidance.dataShape.eventCount).toBe(6);
    expect(rareBinary.statisticalMethodGuidance.dataShape.nonEventCount).toBe(494);
    expect(rareBinary.statisticalMethodGuidance.recommendedStatsRunMethod).toBe("penalized-logistic-regression");
    expect(rareBinary.statisticalMethodGuidance.warnings.map(issue => issue.code)).toContain("METHOD_GUIDANCE_RARE_BINARY_EVENT");
    expect(rareBinary.statisticalMethodGuidance.warnings.map(issue => issue.code)).toContain("METHOD_GUIDANCE_POWER_REVIEW_RECOMMENDED");
    expect(rareBinary.statisticalMethodGuidance.alternatives.find(item => item.method === "logistic-regression")?.tier).toBe("blocked");
    expect(rareBinary.statisticalMethodGuidance.alternatives.find(item => item.method === "power-sample-size")).toMatchObject({
      tier: "sensitivity",
      expectedQa: expect.arrayContaining(["minimum detectable effect", "target power"]),
    });
    expect(rareBinary.statisticalMethodGuidance.alternatives.find(item => item.method === "power-sample-size")?.commandHint).toContain("--variable mortality");
    expect(rareBinary.statisticalMethodGuidance.readiness).toMatchObject({
      status: "ready_with_sensitivity",
      requiredBeforeExecution: expect.arrayContaining(["run power-sample-size or document precision limits"]),
      requiredCompanionMethods: expect.arrayContaining(["power-sample-size"]),
      promotionBlockers: [],
    });

    const expandedCategoricalBinary = researchModelingPlanCommand({
      question: "Is treatment associated with mortality across hospitals after adjustment?",
      goal: "associate",
      outcomeType: "binary",
      target: "mortality",
      tableSummary: {
        rowCount: 500,
        columnCount: 5,
        columns: [
          { name: "mortality", inferredType: "number", nonMissingRows: 500, missingFraction: 0, uniqueCount: 2, valueCounts: [{ value: "0", count: 430, fraction: 0.86 }, { value: "1", count: 70, fraction: 0.14 }], sampleValues: ["0", "1"], min: 0, max: 1 },
          { name: "treatment", inferredType: "number", nonMissingRows: 500, missingFraction: 0, uniqueCount: 2, valueCounts: [{ value: "0", count: 250, fraction: 0.5 }, { value: "1", count: 250, fraction: 0.5 }], sampleValues: ["0", "1"], min: 0, max: 1 },
          { name: "age", inferredType: "number", nonMissingRows: 500, missingFraction: 0, uniqueCount: 60, sampleValues: ["45", "50", "55"], min: 18, max: 95 },
          { name: "comorbidity_count", inferredType: "number", nonMissingRows: 500, missingFraction: 0, uniqueCount: 9, valueCounts: [{ value: "0", count: 40, fraction: 0.08 }, { value: "1", count: 60, fraction: 0.12 }, { value: "2", count: 80, fraction: 0.16 }, { value: "3", count: 90, fraction: 0.18 }, { value: "4", count: 80, fraction: 0.16 }, { value: "5", count: 60, fraction: 0.12 }, { value: "6", count: 45, fraction: 0.09 }, { value: "7", count: 30, fraction: 0.06 }, { value: "8", count: 15, fraction: 0.03 }], sampleValues: ["0", "2", "4"], min: 0, max: 8 },
          { name: "hospital_site", inferredType: "string", nonMissingRows: 500, missingFraction: 0, uniqueCount: 12, valueCounts: [
            { value: "A", count: 55, fraction: 0.11 },
            { value: "B", count: 50, fraction: 0.10 },
            { value: "C", count: 48, fraction: 0.096 },
            { value: "D", count: 45, fraction: 0.09 },
            { value: "E", count: 44, fraction: 0.088 },
            { value: "F", count: 42, fraction: 0.084 },
            { value: "G", count: 40, fraction: 0.08 },
            { value: "H", count: 38, fraction: 0.076 },
            { value: "I", count: 36, fraction: 0.072 },
            { value: "J", count: 34, fraction: 0.068 },
            { value: "K", count: 34, fraction: 0.068 },
            { value: "L", count: 34, fraction: 0.068 },
          ], sampleValues: ["A", "B", "C"] },
        ],
      },
    });
    expect(expandedCategoricalBinary.statisticalMethodGuidance.recommendedStatsRunMethod).toBe("penalized-logistic-regression");
    expect(expandedCategoricalBinary.statisticalMethodGuidance.rationale).toMatch(/categorical expansion/i);
    expect(expandedCategoricalBinary.statisticalMethodGuidance.warnings.map(issue => issue.code)).toContain("METHOD_GUIDANCE_POWER_REVIEW_RECOMMENDED");
    expect(expandedCategoricalBinary.statisticalMethodGuidance.alternatives.find(item => item.method === "logistic-regression")?.tier).toBe("blocked");

    const zeroInflated = researchModelingPlanCommand({
      question: "Are exposures associated with number of admissions?",
      goal: "associate",
      outcomeType: "count",
      target: "admission_count",
      tableSummary: {
        rowCount: 300,
        columnCount: 3,
        columns: [
          { name: "admission_count", inferredType: "number", nonMissingRows: 300, missingFraction: 0, uniqueCount: 6, valueCounts: [{ value: "0", count: 180, fraction: 0.6 }, { value: "1", count: 45, fraction: 0.15 }, { value: "2", count: 35, fraction: 0.1167 }, { value: "3", count: 20, fraction: 0.0667 }, { value: "4", count: 12, fraction: 0.04 }, { value: "5", count: 8, fraction: 0.0267 }], sampleValues: ["0", "1", "2"], min: 0, max: 5 },
          { name: "exposure", inferredType: "number", nonMissingRows: 300, missingFraction: 0, uniqueCount: 2, valueCounts: [{ value: "0", count: 150, fraction: 0.5 }, { value: "1", count: 150, fraction: 0.5 }], sampleValues: ["0", "1"], min: 0, max: 1 },
          { name: "age", inferredType: "number", nonMissingRows: 300, missingFraction: 0, uniqueCount: 60, sampleValues: ["45", "50", "55"], min: 18, max: 95 },
        ],
      },
    });
    expect(zeroInflated.statisticalMethodGuidance.recommendedStatsRunMethod).toBe("zero-inflated-poisson");
    expect(zeroInflated.statisticalMethodGuidance.alternatives.find(item => item.method === "poisson-regression")?.tier).toBe("fallback");
  });

  it("adds power and precision review when table shape suggests fragile inference", () => {
    const smallTwoGroup = researchModelingPlanCommand({
      question: "Compare mobility score between two surgical groups.",
      goal: "compare_groups",
      outcomeType: "continuous",
      target: "mobility_score",
      tableSummary: {
        rowCount: 36,
        columnCount: 3,
        columns: [
          { name: "mobility_score", inferredType: "number", nonMissingRows: 36, missingFraction: 0, uniqueCount: 30, sampleValues: ["12", "18", "22"], min: 0, max: 40, mean: 18, median: 18, sd: 8, variance: 64, skewness: 0.4, outlierFraction: 0 },
          { name: "procedure_group", inferredType: "string", nonMissingRows: 36, missingFraction: 0, uniqueCount: 2, valueCounts: [{ value: "A", count: 18, fraction: 0.5 }, { value: "B", count: 18, fraction: 0.5 }], sampleValues: ["A", "B"] },
          { name: "age", inferredType: "number", nonMissingRows: 36, missingFraction: 0, uniqueCount: 24, sampleValues: ["45", "55", "65"], min: 30, max: 82 },
        ],
      },
    });

    expect(smallTwoGroup.statisticalMethodGuidance.recommendedStatsRunMethod).toBe("mann-whitney");
    expect(smallTwoGroup.statisticalMethodGuidance.warnings.map(issue => issue.code)).toEqual(expect.arrayContaining([
      "METHOD_GUIDANCE_SMALL_SAMPLE",
      "METHOD_GUIDANCE_POWER_REVIEW_RECOMMENDED",
    ]));
    expect(smallTwoGroup.statisticalMethodGuidance.alternatives.find(item => item.method === "power-sample-size")?.commandHint).toContain("--outcome-threshold 0.5");

    const highParameterPlan = researchModelingPlanCommand({
      question: "Is treatment associated with a continuous recovery score after adjustment?",
      goal: "associate",
      outcomeType: "continuous",
      target: "recovery_score",
      highDimensional: true,
      tableSummary: {
        rowCount: 90,
        columnCount: 13,
        columns: [
          { name: "recovery_score", inferredType: "number", nonMissingRows: 90, missingFraction: 0, uniqueCount: 85, sampleValues: ["1.2", "2.3", "3.8"], min: 0.5, max: 9.8, mean: 4.5, median: 4.3, sd: 1.4, variance: 1.96, skewness: 0.1, outlierFraction: 0 },
          { name: "treatment", inferredType: "number", nonMissingRows: 90, missingFraction: 0, uniqueCount: 2, valueCounts: [{ value: "0", count: 45, fraction: 0.5 }, { value: "1", count: 45, fraction: 0.5 }], sampleValues: ["0", "1"], min: 0, max: 1 },
          ...Array.from({ length: 11 }, (_, index) => ({
            name: `covariate_${index + 1}`,
            inferredType: "number" as const,
            nonMissingRows: 90,
            missingFraction: 0,
            uniqueCount: 50,
            sampleValues: ["1", "2", "3"],
            min: 0,
            max: 10,
          })),
        ],
      },
    });

    expect(highParameterPlan.statisticalMethodGuidance.recommendedStatsRunMethod).toBe("penalized-linear-regression");
    expect(highParameterPlan.statisticalMethodGuidance.warnings.map(issue => issue.code)).toContain("METHOD_GUIDANCE_POWER_REVIEW_RECOMMENDED");
    expect(highParameterPlan.statisticalMethodGuidance.warnings.map(issue => issue.code)).toContain("METHOD_GUIDANCE_MODEL_DIAGNOSTICS_REQUIRED");
    expect(highParameterPlan.statisticalMethodGuidance.alternatives.find(item => item.method === "power-sample-size")).toMatchObject({
      tier: "sensitivity",
      reason: expect.stringMatching(/minimum detectable effect|required sample size/i),
    });
    expect(highParameterPlan.statisticalMethodGuidance.alternatives.find(item => item.method === "model-diagnostics")).toMatchObject({
      tier: "sensitivity",
      expectedQa: expect.arrayContaining(["VIF/collinearity", "Cook distance/leverage"]),
    });
    expect(highParameterPlan.statisticalMethodGuidance.readiness).toMatchObject({
      status: "ready_with_sensitivity",
      requiredBeforeExecution: expect.arrayContaining(["run model-diagnostics companion analysis"]),
      requiredCompanionMethods: expect.arrayContaining(["model-diagnostics"]),
      enforceCompanionReadiness: true,
    });

    const categoricalExpansionBurden = researchModelingPlanCommand({
      question: "Is treatment associated with continuous recovery after adjustment for site and age?",
      goal: "associate",
      outcomeType: "continuous",
      target: "recovery_score",
      tableSummary: {
        rowCount: 120,
        columnCount: 4,
        columns: [
          { name: "recovery_score", inferredType: "number", nonMissingRows: 120, missingFraction: 0, uniqueCount: 100, sampleValues: ["1.2", "2.3", "3.8"], min: 0.5, max: 9.8, mean: 4.5, median: 4.3, sd: 1.4, variance: 1.96, skewness: 0.1, outlierFraction: 0 },
          { name: "treatment", inferredType: "number", nonMissingRows: 120, missingFraction: 0, uniqueCount: 2, valueCounts: [{ value: "0", count: 60, fraction: 0.5 }, { value: "1", count: 60, fraction: 0.5 }], sampleValues: ["0", "1"], min: 0, max: 1 },
          { name: "site", inferredType: "string", nonMissingRows: 120, missingFraction: 0, uniqueCount: 12, valueCounts: Array.from({ length: 12 }, (_, index) => ({ value: `site_${index + 1}`, count: 10, fraction: 1 / 12 })), sampleValues: ["site_1", "site_2", "site_3"] },
          { name: "age", inferredType: "number", nonMissingRows: 120, missingFraction: 0, uniqueCount: 70, sampleValues: ["45", "60", "75"], min: 18, max: 95 },
        ],
      },
    });
    expect(categoricalExpansionBurden.statisticalMethodGuidance.recommendedStatsRunMethod).toBe("penalized-linear-regression");
    expect(categoricalExpansionBurden.statisticalMethodGuidance.rationale).toMatch(/categorical expansion/i);
    expect(categoricalExpansionBurden.statisticalMethodGuidance.warnings.map(issue => issue.code)).toEqual(expect.arrayContaining([
      "METHOD_GUIDANCE_POWER_REVIEW_RECOMMENDED",
      "METHOD_GUIDANCE_MODEL_DIAGNOSTICS_REQUIRED",
    ]));
    expect(categoricalExpansionBurden.statisticalMethodGuidance.alternatives.find(item => item.method === "linear-regression")?.tier).toBe("baseline");
  });

  it("downgrades or blocks method guidance when role-complete support is too low", () => {
    const lowRoleComplete = researchModelingPlanCommand({
      question: "Is biomarker exposure associated with functional score?",
      goal: "associate",
      outcomeType: "continuous",
      target: "functional_score",
      tableSummary: {
        rowCount: 500,
        columnCount: 3,
        columns: [
          { name: "functional_score", inferredType: "number", nonMissingRows: 350, missingFraction: 0.3, uniqueCount: 120, sampleValues: ["1.2", "3.4", "4.0"], min: 0.1, max: 9.8, mean: 4.2, median: 4.1, sd: 1.3, variance: 1.69, skewness: 0.2, outlierFraction: 0.01, zeroFraction: 0 },
          { name: "biomarker_exposure", inferredType: "number", nonMissingRows: 50, missingFraction: 0.9, uniqueCount: 45, sampleValues: ["0.1", "0.5", "0.8"], min: 0.01, max: 2.5, mean: 0.7, median: 0.6, sd: 0.4, variance: 0.16, skewness: 0.5, outlierFraction: 0.02, zeroFraction: 0 },
          { name: "age", inferredType: "number", nonMissingRows: 500, missingFraction: 0, uniqueCount: 60, sampleValues: ["50", "70", "80"], min: 18, max: 96 },
        ],
      },
    });
    expect(lowRoleComplete.blocked).toBe(false);
    expect(lowRoleComplete.statisticalMethodGuidance.dataShape.estimatedRoleCompleteRows).toBe(35);
    expect(lowRoleComplete.statisticalMethodGuidance.warnings.map(issue => issue.code)).toContain("METHOD_GUIDANCE_ROLE_COMPLETE_SUPPORT_LOW");
    expect(lowRoleComplete.statisticalMethodGuidance.readiness).toMatchObject({
      status: "ready_with_sensitivity",
      requiredBeforeExecution: expect.arrayContaining(["run complete-case flow and role-missingness review"]),
    });

    const blockedRoleComplete = researchModelingPlanCommand({
      question: "Is biomarker exposure associated with functional score?",
      goal: "associate",
      outcomeType: "continuous",
      target: "functional_score",
      tableSummary: {
        rowCount: 1000,
        columnCount: 3,
        columns: [
          { name: "functional_score", inferredType: "number", nonMissingRows: 50, missingFraction: 0.95, uniqueCount: 45, sampleValues: ["1.2", "3.4", "4.0"], min: 0.1, max: 9.8, mean: 4.2, median: 4.1, sd: 1.3, variance: 1.69, skewness: 0.2, outlierFraction: 0.01, zeroFraction: 0 },
          { name: "biomarker_exposure", inferredType: "number", nonMissingRows: 100, missingFraction: 0.9, uniqueCount: 80, sampleValues: ["0.1", "0.5", "0.8"], min: 0.01, max: 2.5, mean: 0.7, median: 0.6, sd: 0.4, variance: 0.16, skewness: 0.5, outlierFraction: 0.02, zeroFraction: 0 },
          { name: "age", inferredType: "number", nonMissingRows: 1000, missingFraction: 0, uniqueCount: 60, sampleValues: ["50", "70", "80"], min: 18, max: 96 },
        ],
      },
    });
    expect(blockedRoleComplete.blocked).toBe(true);
    expect(blockedRoleComplete.statisticalMethodGuidance.dataShape.estimatedRoleCompleteRows).toBe(5);
    expect(blockedRoleComplete.statisticalMethodGuidance.blockers.map(issue => issue.code)).toContain("METHOD_GUIDANCE_ROLE_COMPLETE_SUPPORT_TOO_LOW");
    expect(blockedRoleComplete.statisticalMethodGuidance.readiness.status).toBe("blocked");
  });

  it("routes explicit correlation questions to correlation methods instead of default regression", () => {
    const pearsonPlan = researchModelingPlanCommand({
      question: "What is the correlation between BMI and HbA1c?",
      goal: "associate",
      outcomeType: "continuous",
      target: "hba1c",
      tableSummary: {
        rowCount: 240,
        columnCount: 3,
        columns: [
          { name: "hba1c", inferredType: "number", nonMissingRows: 238, missingFraction: 0.008, uniqueCount: 100, sampleValues: ["5.1", "6.2", "7.4"], min: 4, max: 12, mean: 6.1, median: 5.9, sd: 1.2, variance: 1.44, skewness: 0.3, outlierFraction: 0 },
          { name: "bmi", inferredType: "number", nonMissingRows: 240, missingFraction: 0, uniqueCount: 95, sampleValues: ["22", "29", "34"], min: 17, max: 55, mean: 29, median: 28, sd: 6, variance: 36, skewness: 0.4, outlierFraction: 0.01 },
          { name: "age", inferredType: "number", nonMissingRows: 240, missingFraction: 0, uniqueCount: 70, sampleValues: ["45", "50", "55"], min: 18, max: 90 },
        ],
      },
    });

    expect(pearsonPlan.statisticalMethodGuidance.recommendedStatsRunMethod).toBe("pearson");
    expect(pearsonPlan.statisticalMethodGuidance.alternatives[0]?.commandHint).toContain("--outcome hba1c --exposure bmi");
    expect(pearsonPlan.statisticalMethodGuidance.alternatives.map(item => item.method)).toEqual(expect.arrayContaining(["spearman", "partial-correlation"]));

    const skewedPlan = researchModelingPlanCommand({
      question: "Assess the relationship between inflammatory marker level and recovery score.",
      goal: "associate",
      outcomeType: "continuous",
      target: "recovery_score",
      tableSummary: {
        rowCount: 80,
        columnCount: 2,
        columns: [
          { name: "recovery_score", inferredType: "number", nonMissingRows: 80, missingFraction: 0, uniqueCount: 55, sampleValues: ["1", "3", "12"], min: 0, max: 30, mean: 8, median: 5, sd: 6, variance: 36, skewness: 2.1, outlierFraction: 0.08 },
          { name: "inflammatory_marker_level", inferredType: "number", nonMissingRows: 78, missingFraction: 0.025, uniqueCount: 60, sampleValues: ["0.2", "2.4", "12.5"], min: 0.1, max: 40, mean: 5, median: 2.2, sd: 7, variance: 49, skewness: 2.8, outlierFraction: 0.1 },
        ],
      },
    });

    expect(skewedPlan.statisticalMethodGuidance.recommendedStatsRunMethod).toBe("spearman");
    expect(skewedPlan.statisticalMethodGuidance.alternatives.map(item => item.method)).toContain("pearson");

    const partialPlan = researchModelingPlanCommand({
      question: "What is the adjusted partial correlation between biomarker level and recovery score controlling for age?",
      goal: "associate",
      outcomeType: "continuous",
      target: "recovery_score",
      tableSummary: {
        rowCount: 160,
        columnCount: 3,
        columns: [
          { name: "recovery_score", inferredType: "number", nonMissingRows: 160, missingFraction: 0, uniqueCount: 110, sampleValues: ["2", "4", "8"], min: 0, max: 12, mean: 5, median: 5, sd: 2, variance: 4, skewness: 0.2, outlierFraction: 0 },
          { name: "biomarker_level", inferredType: "number", nonMissingRows: 160, missingFraction: 0, uniqueCount: 100, sampleValues: ["1.0", "2.5", "5.0"], min: 0.2, max: 8, mean: 3, median: 3, sd: 1.5, variance: 2.25, skewness: 0.1, outlierFraction: 0 },
          { name: "age", inferredType: "number", nonMissingRows: 160, missingFraction: 0, uniqueCount: 60, sampleValues: ["45", "60", "75"], min: 18, max: 90, mean: 61, median: 62, sd: 12, variance: 144, skewness: 0.1, outlierFraction: 0 },
        ],
      },
    });

    expect(partialPlan.statisticalMethodGuidance.recommendedStatsRunMethod).toBe("partial-correlation");
    expect(partialPlan.statisticalMethodGuidance.alternatives[0]?.commandHint).toContain("--outcome recovery_score --exposure biomarker_level --covariate age");
  });

  it("routes quasi-experimental causal questions to design-specific methods with required design columns", () => {
    const didPlan = researchModelingPlanCommand({
      question: "Estimate the difference-in-differences effect of a policy program on hospital utilization using treated and control groups before and after implementation.",
      outcomeType: "continuous",
      target: "utilization_rate",
      tableSummary: {
        rowCount: 400,
        columnCount: 5,
        columns: [
          { name: "utilization_rate", inferredType: "number", nonMissingRows: 400, missingFraction: 0, uniqueCount: 180, sampleValues: ["1.2", "2.4", "3.1"], min: 0, max: 12, mean: 3, median: 2.8, sd: 1.5, variance: 2.25, skewness: 0.2, outlierFraction: 0 },
          { name: "treated", inferredType: "number", nonMissingRows: 400, missingFraction: 0, uniqueCount: 2, valueCounts: [{ value: "0", count: 200, fraction: 0.5 }, { value: "1", count: 200, fraction: 0.5 }], sampleValues: ["0", "1"], min: 0, max: 1 },
          { name: "post_period", inferredType: "number", nonMissingRows: 400, missingFraction: 0, uniqueCount: 2, valueCounts: [{ value: "0", count: 200, fraction: 0.5 }, { value: "1", count: 200, fraction: 0.5 }], sampleValues: ["0", "1"], min: 0, max: 1 },
          { name: "age", inferredType: "number", nonMissingRows: 400, missingFraction: 0, uniqueCount: 70, sampleValues: ["45", "60", "75"], min: 18, max: 95 },
          { name: "site", inferredType: "string", nonMissingRows: 400, missingFraction: 0, uniqueCount: 4, sampleValues: ["A", "B", "C"] },
        ],
      },
    });

    expect(didPlan.inferredGoal).toBe("causal");
    expect(didPlan.statisticalMethodGuidance.recommendedStatsRunMethod).toBe("difference-in-differences");
    expect(didPlan.statisticalMethodGuidance.alternatives[0]?.commandHint).toContain("--outcome utilization_rate --exposure treated --post post_period");
    expect(didPlan.statisticalMethodGuidance.blockers).toHaveLength(0);

    const eventStudyPlan = researchModelingPlanCommand({
      question: "Run an event-study analysis of treatment timing and outcome changes across event time.",
      outcomeType: "continuous",
      target: "outcome_score",
      roleHints: { exposure: "treatment_group", period: "event_period", variables: [], covariates: [], exactCovariates: [] },
      tableSummary: {
        rowCount: 320,
        columnCount: 4,
        columns: [
          { name: "outcome_score", inferredType: "number", nonMissingRows: 320, missingFraction: 0, uniqueCount: 120, sampleValues: ["3", "4", "5"], min: 0, max: 10, mean: 4, median: 4, sd: 1.2, variance: 1.44, skewness: 0.1, outlierFraction: 0 },
          { name: "treatment_group", inferredType: "number", nonMissingRows: 320, missingFraction: 0, uniqueCount: 2, valueCounts: [{ value: "0", count: 160, fraction: 0.5 }, { value: "1", count: 160, fraction: 0.5 }], sampleValues: ["0", "1"], min: 0, max: 1 },
          { name: "event_period", inferredType: "number", nonMissingRows: 320, missingFraction: 0, uniqueCount: 5, sampleValues: ["-2", "-1", "0", "1", "2"], min: -2, max: 2 },
          { name: "age", inferredType: "number", nonMissingRows: 320, missingFraction: 0, uniqueCount: 65, sampleValues: ["50", "60", "70"], min: 18, max: 90 },
        ],
      },
    });

    expect(eventStudyPlan.statisticalMethodGuidance.recommendedStatsRunMethod).toBe("event-study-did");
    expect(eventStudyPlan.statisticalMethodGuidance.runnerCapability).toMatchObject({
      method: "event-study-did",
      status: "bounded_approximation",
    });
    expect(eventStudyPlan.statisticalMethodGuidance.warnings.map(issue => issue.code)).toContain("METHOD_GUIDANCE_RUNNER_BOUNDED_APPROXIMATION");
    expect(eventStudyPlan.statisticalMethodGuidance.readiness).toMatchObject({
      status: "ready_with_sensitivity",
      enforceCompanionReadiness: true,
      requiredBeforeExecution: expect.arrayContaining(["Review identification assumptions."]),
    });
    expect(eventStudyPlan.statisticalMethodGuidance.alternatives.map(item => item.method)).toContain("difference-in-differences");
    expect(eventStudyPlan.statisticalMethodGuidance.alternatives[0]?.commandHint).toContain("--outcome outcome_score --exposure treatment_group --period event_period");
    expect(eventStudyPlan.statisticalMethodGuidance.alternatives[0]?.commandHint).not.toContain("--post");
    expect(eventStudyPlan.routeRecommendation).toMatchObject({
      route: "stop-for-review",
      commandHint: null,
    });
    expect(eventStudyPlan.routeRecommendation.reason).toMatch(/causal inference/i);

    const literatureSuggestedEventStudy = researchModelingPlanCommand({
      question: "Evaluate whether treatment is associated with outcome changes over time using treated and comparison groups.",
      goal: "causal",
      outcomeType: "continuous",
      target: "outcome_score",
      roleHints: { exposure: "treatment_group", period: "event_period", variables: [], covariates: [], exactCovariates: [] },
      literatureEvidence: {
        status: "ready",
        evidenceStrength: "adequate",
        sourceCount: 5,
        highQualitySourceCount: 3,
        latestPublicationYear: 2026,
        questionTokenCoverage: 0.82,
        designSignals: ["observational-cohort"],
        methodSignals: ["event-study"],
        planningImplications: ["Some prior work used event-study estimators, but the present question has not explicitly requested event-time inference."],
        followUpSearches: [],
        issueCodes: [],
      },
      tableSummary: {
        rowCount: 320,
        columnCount: 5,
        columns: [
          { name: "outcome_score", inferredType: "number", nonMissingRows: 320, missingFraction: 0, uniqueCount: 120, sampleValues: ["3", "4", "5"], min: 0, max: 10, mean: 4, median: 4, sd: 1.2, variance: 1.44, skewness: 0.1, outlierFraction: 0 },
          { name: "treatment_group", inferredType: "number", nonMissingRows: 320, missingFraction: 0, uniqueCount: 2, valueCounts: [{ value: "0", count: 160, fraction: 0.5 }, { value: "1", count: 160, fraction: 0.5 }], sampleValues: ["0", "1"], min: 0, max: 1 },
          { name: "event_period", inferredType: "number", nonMissingRows: 320, missingFraction: 0, uniqueCount: 5, sampleValues: ["-2", "-1", "0", "1", "2"], min: -2, max: 2 },
          { name: "post_period", inferredType: "number", nonMissingRows: 320, missingFraction: 0, uniqueCount: 2, valueCounts: [{ value: "0", count: 160, fraction: 0.5 }, { value: "1", count: 160, fraction: 0.5 }], sampleValues: ["0", "1"], min: 0, max: 1 },
          { name: "age", inferredType: "number", nonMissingRows: 320, missingFraction: 0, uniqueCount: 65, sampleValues: ["50", "60", "70"], min: 18, max: 90 },
        ],
      },
    });

    expect(literatureSuggestedEventStudy.statisticalMethodGuidance.recommendedStatsRunMethod).toBe("difference-in-differences");
    expect(literatureSuggestedEventStudy.statisticalMethodGuidance.runnerCapability).toMatchObject({
      method: "difference-in-differences",
      status: "executable",
    });
    expect(literatureSuggestedEventStudy.statisticalMethodGuidance.warnings.map(issue => issue.code)).toContain("METHOD_GUIDANCE_EXECUTABLE_ROUTE_PREFERRED");
    expect(literatureSuggestedEventStudy.statisticalMethodGuidance.alternatives.find(alternative => alternative.method === "difference-in-differences")).toMatchObject({
      tier: "primary",
      runnerCapability: { status: "executable" },
    });
    expect(literatureSuggestedEventStudy.statisticalMethodGuidance.alternatives.find(alternative => alternative.method === "event-study-did")).toMatchObject({
      tier: "sensitivity",
      runnerCapability: { status: "bounded_approximation" },
    });

    const itsPlan = researchModelingPlanCommand({
      question: "Use interrupted time series to estimate whether a policy change altered monthly admission rates.",
      outcomeType: "continuous",
      target: "admission_rate",
      tableSummary: {
        rowCount: 60,
        columnCount: 3,
        columns: [
          { name: "admission_rate", inferredType: "number", nonMissingRows: 60, missingFraction: 0, uniqueCount: 55, sampleValues: ["10", "11", "12"], min: 4, max: 22, mean: 12, median: 12, sd: 3, variance: 9, skewness: 0.2, outlierFraction: 0 },
          { name: "calendar_month", inferredType: "number", nonMissingRows: 60, missingFraction: 0, uniqueCount: 60, sampleValues: ["1", "2", "3"], min: 1, max: 60 },
          { name: "post_policy", inferredType: "number", nonMissingRows: 60, missingFraction: 0, uniqueCount: 2, valueCounts: [{ value: "0", count: 30, fraction: 0.5 }, { value: "1", count: 30, fraction: 0.5 }], sampleValues: ["0", "1"], min: 0, max: 1 },
        ],
      },
    });

    expect(itsPlan.statisticalMethodGuidance.recommendedStatsRunMethod).toBe("interrupted-time-series");
    expect(itsPlan.statisticalMethodGuidance.alternatives[0]?.commandHint).toContain("--time calendar_month --post post_policy");

    const rddPlan = researchModelingPlanCommand({
      question: "Use regression discontinuity around an eligibility score cutoff to estimate impact on follow-up biomarker.",
      outcomeType: "continuous",
      target: "followup_biomarker",
      tableSummary: {
        rowCount: 260,
        columnCount: 3,
        columns: [
          { name: "followup_biomarker", inferredType: "number", nonMissingRows: 260, missingFraction: 0, uniqueCount: 120, sampleValues: ["4", "5", "6"], min: 1, max: 12, mean: 5, median: 5, sd: 1.3, variance: 1.69, skewness: 0.1, outlierFraction: 0 },
          { name: "eligibility_score", inferredType: "number", nonMissingRows: 260, missingFraction: 0, uniqueCount: 180, sampleValues: ["48", "50", "52"], min: 20, max: 80 },
          { name: "assigned_program", inferredType: "number", nonMissingRows: 260, missingFraction: 0, uniqueCount: 2, valueCounts: [{ value: "0", count: 130, fraction: 0.5 }, { value: "1", count: 130, fraction: 0.5 }], sampleValues: ["0", "1"], min: 0, max: 1 },
        ],
      },
    });

    expect(rddPlan.statisticalMethodGuidance.recommendedStatsRunMethod).toBe("regression-discontinuity");
    expect(rddPlan.statisticalMethodGuidance.alternatives[0]?.commandHint).toContain("--running-variable eligibility_score --cutoff <cutoff>");

    const ivPlan = researchModelingPlanCommand({
      question: "Use instrumental variables 2SLS with distance instrument to estimate the effect of treatment on recovery.",
      outcomeType: "continuous",
      target: "recovery_score",
      tableSummary: {
        rowCount: 420,
        columnCount: 4,
        columns: [
          { name: "recovery_score", inferredType: "number", nonMissingRows: 420, missingFraction: 0, uniqueCount: 180, sampleValues: ["1", "2", "3"], min: 0, max: 10, mean: 4, median: 4, sd: 1.5, variance: 2.25, skewness: 0.1, outlierFraction: 0 },
          { name: "treatment", inferredType: "number", nonMissingRows: 420, missingFraction: 0, uniqueCount: 2, valueCounts: [{ value: "0", count: 210, fraction: 0.5 }, { value: "1", count: 210, fraction: 0.5 }], sampleValues: ["0", "1"], min: 0, max: 1 },
          { name: "distance_instrument", inferredType: "number", nonMissingRows: 420, missingFraction: 0, uniqueCount: 110, sampleValues: ["1.2", "3.4", "7.8"], min: 0, max: 30 },
          { name: "age", inferredType: "number", nonMissingRows: 420, missingFraction: 0, uniqueCount: 70, sampleValues: ["50", "60", "70"], min: 18, max: 95 },
        ],
      },
    });

    expect(ivPlan.statisticalMethodGuidance.recommendedStatsRunMethod).toBe("instrumental-variables-2sls");
    expect(ivPlan.statisticalMethodGuidance.alternatives[0]?.commandHint).toContain("--outcome recovery_score --exposure treatment --instrument distance_instrument");

    const ordinaryQuestion = researchModelingPlanCommand({
      question: "Did treatment affect recovery score?",
      outcomeType: "continuous",
      target: "recovery_score",
      tableSummary: {
        rowCount: 180,
        columnCount: 2,
        columns: [
          { name: "recovery_score", inferredType: "number", nonMissingRows: 180, missingFraction: 0, uniqueCount: 120, sampleValues: ["1", "2", "3"], min: 0, max: 10, mean: 4, median: 4, sd: 1.4, variance: 1.96, skewness: 0.1, outlierFraction: 0 },
          { name: "treatment", inferredType: "number", nonMissingRows: 180, missingFraction: 0, uniqueCount: 2, valueCounts: [{ value: "0", count: 90, fraction: 0.5 }, { value: "1", count: 90, fraction: 0.5 }], sampleValues: ["0", "1"], min: 0, max: 1 },
        ],
      },
    });
    expect(ordinaryQuestion.statisticalMethodGuidance.recommendedStatsRunMethod).toBe("linear-regression");
    expect(ordinaryQuestion.statisticalMethodGuidance.alternatives.map(item => item.method)).not.toContain("difference-in-differences");
  });

  it("uses numeric shape diagnostics to choose robust, skew-aware, and overdispersed methods", () => {
    const skewedTwoGroup = researchModelingPlanCommand({
      question: "Compare length of stay between procedure groups.",
      goal: "compare_groups",
      outcomeType: "continuous",
      target: "los_days",
      tableSummary: {
        rowCount: 300,
        columnCount: 3,
        columns: [
          { name: "los_days", inferredType: "number", nonMissingRows: 300, missingFraction: 0, uniqueCount: 120, sampleValues: ["1", "2", "40"], min: 1, max: 120, mean: 9.1, median: 3.2, sd: 14.5, variance: 210.25, skewness: 3.1, outlierFraction: 0.09, zeroFraction: 0 },
          { name: "procedure_group", inferredType: "string", nonMissingRows: 300, missingFraction: 0, uniqueCount: 2, valueCounts: [{ value: "A", count: 150, fraction: 0.5 }, { value: "B", count: 150, fraction: 0.5 }], sampleValues: ["A", "B"] },
          { name: "age", inferredType: "number", nonMissingRows: 300, missingFraction: 0, uniqueCount: 75, sampleValues: ["45", "60", "75"], min: 18, max: 96, mean: 65, median: 66, sd: 12, variance: 144, skewness: 0.1, outlierFraction: 0 },
        ],
      },
    });
    expect(skewedTwoGroup.statisticalMethodGuidance.recommendedStatsRunMethod).toBe("mann-whitney");
    expect(skewedTwoGroup.statisticalMethodGuidance.warnings.map(issue => issue.code)).toEqual(expect.arrayContaining([
      "METHOD_GUIDANCE_TARGET_SKEWED",
      "METHOD_GUIDANCE_TARGET_OUTLIERS",
    ]));
    expect(skewedTwoGroup.statisticalMethodGuidance.dataShape.targetSkewness).toBe(3.1);
    expect(skewedTwoGroup.statisticalMethodGuidance.alternatives.find(item => item.method === "welch-t-test")?.tier).toBe("sensitivity");

    const skewedPositiveAssociation = researchModelingPlanCommand({
      question: "Are exposures associated with hospital cost?",
      goal: "associate",
      outcomeType: "continuous",
      target: "cost_usd",
      tableSummary: {
        rowCount: 500,
        columnCount: 3,
        columns: [
          { name: "cost_usd", inferredType: "number", nonMissingRows: 500, missingFraction: 0, uniqueCount: 380, sampleValues: ["1200", "2400", "50000"], min: 100, max: 250000, mean: 18000, median: 5200, sd: 30000, variance: 900000000, skewness: 4.2, outlierFraction: 0.12, zeroFraction: 0 },
          { name: "exposure", inferredType: "number", nonMissingRows: 500, missingFraction: 0, uniqueCount: 2, valueCounts: [{ value: "0", count: 250, fraction: 0.5 }, { value: "1", count: 250, fraction: 0.5 }], sampleValues: ["0", "1"], min: 0, max: 1 },
          { name: "age", inferredType: "number", nonMissingRows: 500, missingFraction: 0, uniqueCount: 80, sampleValues: ["45", "60", "75"], min: 18, max: 95, mean: 63, median: 64, sd: 14, variance: 196, skewness: 0.1, outlierFraction: 0 },
        ],
      },
    });
    expect(skewedPositiveAssociation.statisticalMethodGuidance.recommendedStatsRunMethod).toBe("gamma-glm");
    expect(skewedPositiveAssociation.statisticalMethodGuidance.alternatives.find(item => item.method === "linear-regression")?.tier).toBe("baseline");

    const overdispersedCount = researchModelingPlanCommand({
      question: "Are exposures associated with number of hospitalizations?",
      goal: "associate",
      outcomeType: "count",
      target: "hospitalizations",
      tableSummary: {
        rowCount: 400,
        columnCount: 3,
        columns: [
          { name: "hospitalizations", inferredType: "number", nonMissingRows: 400, missingFraction: 0, uniqueCount: 9, valueCounts: [{ value: "0", count: 60, fraction: 0.15 }, { value: "1", count: 140, fraction: 0.35 }, { value: "2", count: 90, fraction: 0.225 }, { value: "3", count: 50, fraction: 0.125 }], sampleValues: ["0", "1", "2"], min: 0, max: 12, mean: 1.8, median: 1, sd: 2.4, variance: 5.76, skewness: 2.2, outlierFraction: 0.06, zeroFraction: 0.15 },
          { name: "exposure", inferredType: "number", nonMissingRows: 400, missingFraction: 0, uniqueCount: 2, valueCounts: [{ value: "0", count: 200, fraction: 0.5 }, { value: "1", count: 200, fraction: 0.5 }], sampleValues: ["0", "1"], min: 0, max: 1 },
          { name: "site", inferredType: "string", nonMissingRows: 400, missingFraction: 0, uniqueCount: 4, sampleValues: ["A", "B", "C"] },
        ],
      },
    });
    expect(overdispersedCount.statisticalMethodGuidance.recommendedStatsRunMethod).toBe("negative-binomial-regression");
    expect(overdispersedCount.statisticalMethodGuidance.dataShape.targetVarianceMeanRatio).toBeCloseTo(3.2);
    expect(overdispersedCount.statisticalMethodGuidance.alternatives.find(item => item.method === "poisson-regression")?.tier).toBe("fallback");

    const zeroInflatedOverdispersedCount = researchModelingPlanCommand({
      question: "Are exposures associated with number of recurrent admissions?",
      goal: "associate",
      outcomeType: "count",
      target: "recurrent_admissions",
      tableSummary: {
        rowCount: 500,
        columnCount: 3,
        columns: [
          { name: "recurrent_admissions", inferredType: "number", nonMissingRows: 500, missingFraction: 0, uniqueCount: 12, valueCounts: [{ value: "0", count: 310, fraction: 0.62 }, { value: "1", count: 70, fraction: 0.14 }, { value: "2", count: 45, fraction: 0.09 }, { value: "6", count: 30, fraction: 0.06 }], sampleValues: ["0", "1", "6"], min: 0, max: 20, mean: 1.5, median: 0, sd: 3.3, variance: 10.89, skewness: 3.8, outlierFraction: 0.08, zeroFraction: 0.62 },
          { name: "exposure", inferredType: "number", nonMissingRows: 500, missingFraction: 0, uniqueCount: 2, valueCounts: [{ value: "0", count: 250, fraction: 0.5 }, { value: "1", count: 250, fraction: 0.5 }], sampleValues: ["0", "1"], min: 0, max: 1 },
          { name: "site", inferredType: "string", nonMissingRows: 500, missingFraction: 0, uniqueCount: 4, sampleValues: ["A", "B", "C"] },
        ],
      },
    });
    expect(zeroInflatedOverdispersedCount.statisticalMethodGuidance.recommendedStatsRunMethod).toBe("zero-inflated-negative-binomial");
    expect(zeroInflatedOverdispersedCount.statisticalMethodGuidance.rationale).toMatch(/zeros and variance\/mean/i);
    expect(zeroInflatedOverdispersedCount.statisticalMethodGuidance.alternatives.find(item => item.method === "zero-inflated-poisson")?.tier).toBe("sensitivity");
  });

  it("uses count and skew diagnostics for prediction baselines instead of defaulting to linear regression", () => {
    const countPrediction = researchModelingPlanCommand({
      question: "Predict recurrent admission counts from clinical variables.",
      goal: "predict",
      outcomeType: "count",
      requiresPrediction: true,
      target: "recurrent_admissions",
      tableSummary: {
        rowCount: 700,
        columnCount: 4,
        columns: [
          { name: "recurrent_admissions", inferredType: "number", nonMissingRows: 700, missingFraction: 0, uniqueCount: 14, valueCounts: [{ value: "0", count: 420, fraction: 0.6 }, { value: "1", count: 120, fraction: 0.171 }, { value: "2", count: 70, fraction: 0.1 }, { value: "5", count: 45, fraction: 0.064 }], sampleValues: ["0", "1", "5"], min: 0, max: 30, mean: 1.7, median: 0, sd: 3.5, variance: 12.25, skewness: 4.0, outlierFraction: 0.1, zeroFraction: 0.6 },
          { name: "age", inferredType: "number", nonMissingRows: 700, missingFraction: 0, uniqueCount: 75, sampleValues: ["44", "63", "80"], min: 18, max: 96 },
          { name: "prior_admission", inferredType: "number", nonMissingRows: 700, missingFraction: 0, uniqueCount: 2, valueCounts: [{ value: "0", count: 350, fraction: 0.5 }, { value: "1", count: 350, fraction: 0.5 }], sampleValues: ["0", "1"], min: 0, max: 1 },
          { name: "site", inferredType: "string", nonMissingRows: 700, missingFraction: 0, uniqueCount: 4, sampleValues: ["A", "B", "C"] },
        ],
      },
    });

    expect(countPrediction.statisticalMethodGuidance.recommendedStatsRunMethod).toBe("zero-inflated-negative-binomial");
    expect(countPrediction.statisticalMethodGuidance.rationale).toMatch(/transparent statistical baseline/i);
    expect(countPrediction.statisticalMethodGuidance.alternatives.find(item => item.method === "poisson-regression")?.tier).toBe("fallback");
    expect(countPrediction.statisticalMethodGuidance.alternatives.find(item => item.method === "linear-regression")).toBeUndefined();
    expect(countPrediction.statisticalMethodGuidance.contract).toMatchObject({
      method: "zero-inflated-negative-binomial",
      family: "regression_glm",
    });

    const skewedContinuousPrediction = researchModelingPlanCommand({
      question: "Predict total hospitalization cost from clinical variables.",
      goal: "predict",
      outcomeType: "continuous",
      requiresPrediction: true,
      target: "cost_usd",
      tableSummary: {
        rowCount: 900,
        columnCount: 4,
        columns: [
          { name: "cost_usd", inferredType: "number", nonMissingRows: 900, missingFraction: 0, uniqueCount: 720, sampleValues: ["800", "3500", "85000"], min: 50, max: 400000, mean: 22000, median: 6500, sd: 44000, variance: 1936000000, skewness: 5.2, outlierFraction: 0.15, zeroFraction: 0 },
          { name: "age", inferredType: "number", nonMissingRows: 900, missingFraction: 0, uniqueCount: 80, sampleValues: ["40", "65", "88"], min: 18, max: 99 },
          { name: "icu_flag", inferredType: "number", nonMissingRows: 900, missingFraction: 0, uniqueCount: 2, valueCounts: [{ value: "0", count: 650, fraction: 0.722 }, { value: "1", count: 250, fraction: 0.278 }], sampleValues: ["0", "1"], min: 0, max: 1 },
          { name: "site", inferredType: "string", nonMissingRows: 900, missingFraction: 0, uniqueCount: 5, sampleValues: ["A", "B", "C"] },
        ],
      },
    });

    expect(skewedContinuousPrediction.statisticalMethodGuidance.recommendedStatsRunMethod).toBe("gamma-glm");
    expect(skewedContinuousPrediction.statisticalMethodGuidance.rationale).toMatch(/strictly positive and strongly right-skewed/i);
    expect(skewedContinuousPrediction.statisticalMethodGuidance.alternatives.find(item => item.method === "linear-regression")?.tier).toBe("baseline");
    expect(skewedContinuousPrediction.statisticalMethodGuidance.alternatives.map(item => item.method)).toEqual(expect.arrayContaining(["robust-linear-regression", "quantile-regression"]));
  });

  it("selects correlated-outcome methods for clustered association questions", () => {
    const clusteredBinary = researchModelingPlanCommand({
      question: "Is treatment associated with mortality among patients clustered within hospitals?",
      goal: "associate",
      outcomeType: "binary",
      clustered: true,
      dataStructures: ["clustered"],
      target: "mortality",
      tableSummary: {
        rowCount: 720,
        columnCount: 4,
        columns: [
          { name: "mortality", inferredType: "number", nonMissingRows: 720, missingFraction: 0, uniqueCount: 2, valueCounts: [{ value: "0", count: 540, fraction: 0.75 }, { value: "1", count: 180, fraction: 0.25 }], sampleValues: ["0", "1"], min: 0, max: 1 },
          { name: "hospital_id", inferredType: "number", nonMissingRows: 720, missingFraction: 0, uniqueCount: 18, sampleValues: ["1", "2", "3"], min: 1, max: 18 },
          { name: "treatment", inferredType: "number", nonMissingRows: 720, missingFraction: 0, uniqueCount: 2, valueCounts: [{ value: "0", count: 360, fraction: 0.5 }, { value: "1", count: 360, fraction: 0.5 }], sampleValues: ["0", "1"], min: 0, max: 1 },
          { name: "age", inferredType: "number", nonMissingRows: 720, missingFraction: 0, uniqueCount: 70, sampleValues: ["45", "65", "88"], min: 18, max: 98 },
        ],
      },
    });

    expect(clusteredBinary.statisticalMethodGuidance.recommendedStatsRunMethod).toBe("gee");
    expect(clusteredBinary.statisticalMethodGuidance.rationale).toMatch(/hospital_id/i);
    expect(clusteredBinary.statisticalMethodGuidance.alternatives.find(item => item.method === "gee")?.commandHint).toContain("--cluster hospital_id");
    expect(clusteredBinary.statisticalMethodGuidance.alternatives.find(item => item.method === "gee")?.commandHint).toContain("--exposure treatment");
    expect(clusteredBinary.statisticalMethodGuidance.alternatives.find(item => item.method === "logistic-regression")?.tier).toBe("baseline");
    expect(clusteredBinary.statisticalMethodGuidance.alternatives.find(item => item.method === "generalized-mixed-model")?.tier).toBe("sensitivity");
    expect(clusteredBinary.statisticalMethodGuidance.contract).toMatchObject({
      method: "gee",
      family: "longitudinal",
    });

    const clusteredContinuous = researchModelingPlanCommand({
      question: "Is treatment associated with functional score among patients clustered within hospitals?",
      goal: "associate",
      outcomeType: "continuous",
      clustered: true,
      dataStructures: ["clustered"],
      target: "functional_score",
      tableSummary: {
        rowCount: 640,
        columnCount: 4,
        columns: [
          { name: "functional_score", inferredType: "number", nonMissingRows: 640, missingFraction: 0, uniqueCount: 110, sampleValues: ["42", "55", "71"], min: 0, max: 100, mean: 58, median: 59, sd: 14, variance: 196, skewness: 0.2, outlierFraction: 0.01 },
          { name: "hospital_id", inferredType: "number", nonMissingRows: 640, missingFraction: 0, uniqueCount: 16, sampleValues: ["1", "2", "3"], min: 1, max: 16 },
          { name: "treatment", inferredType: "number", nonMissingRows: 640, missingFraction: 0, uniqueCount: 2, valueCounts: [{ value: "0", count: 320, fraction: 0.5 }, { value: "1", count: 320, fraction: 0.5 }], sampleValues: ["0", "1"], min: 0, max: 1 },
          { name: "age", inferredType: "number", nonMissingRows: 640, missingFraction: 0, uniqueCount: 75, sampleValues: ["40", "67", "90"], min: 18, max: 98 },
        ],
      },
    });

    expect(clusteredContinuous.statisticalMethodGuidance.recommendedStatsRunMethod).toBe("linear-mixed-model");
    expect(clusteredContinuous.statisticalMethodGuidance.alternatives.find(item => item.method === "linear-mixed-model")?.commandHint).toContain("--cluster hospital_id");
    expect(clusteredContinuous.statisticalMethodGuidance.alternatives.find(item => item.method === "linear-mixed-model")?.commandHint).toContain("--exposure treatment");
    expect(clusteredContinuous.statisticalMethodGuidance.alternatives.find(item => item.method === "gee")?.tier).toBe("sensitivity");
    expect(clusteredContinuous.statisticalMethodGuidance.alternatives.find(item => item.method === "linear-regression")?.tier).toBe("baseline");

    const missingCluster = researchModelingPlanCommand({
      question: "Is treatment associated with mortality among clustered patients?",
      goal: "associate",
      outcomeType: "binary",
      clustered: true,
      dataStructures: ["clustered"],
      target: "mortality",
      tableSummary: {
        rowCount: 200,
        columnCount: 3,
        columns: [
          { name: "mortality", inferredType: "number", nonMissingRows: 200, missingFraction: 0, uniqueCount: 2, valueCounts: [{ value: "0", count: 140, fraction: 0.7 }, { value: "1", count: 60, fraction: 0.3 }], sampleValues: ["0", "1"], min: 0, max: 1 },
          { name: "treatment", inferredType: "number", nonMissingRows: 200, missingFraction: 0, uniqueCount: 2, valueCounts: [{ value: "0", count: 100, fraction: 0.5 }, { value: "1", count: 100, fraction: 0.5 }], sampleValues: ["0", "1"], min: 0, max: 1 },
          { name: "age", inferredType: "number", nonMissingRows: 200, missingFraction: 0, uniqueCount: 65, sampleValues: ["45", "65", "88"], min: 18, max: 98 },
        ],
      },
    });
    expect(missingCluster.blocked).toBe(true);
    expect(missingCluster.statisticalMethodGuidance.blockers.map(issue => issue.code)).toContain("METHOD_GUIDANCE_CLUSTER_ID_MISSING");
  });

  it("prioritizes time-to-event structure over binary event shape during method guidance", () => {
    const survivalAssociation = researchModelingPlanCommand({
      question: "Is treatment associated with time to death?",
      goal: "associate",
      outcomeType: "time_to_event",
      timeToEvent: true,
      target: "death",
      tableSummary: {
        rowCount: 260,
        columnCount: 4,
        columns: [
          { name: "followup_days", inferredType: "number", nonMissingRows: 260, missingFraction: 0, uniqueCount: 210, sampleValues: ["10", "20", "90"], min: 1, max: 1000 },
          { name: "death", inferredType: "number", nonMissingRows: 260, missingFraction: 0, uniqueCount: 2, valueCounts: [{ value: "0", count: 170, fraction: 0.6538 }, { value: "1", count: 90, fraction: 0.3462 }], sampleValues: ["0", "1"], min: 0, max: 1 },
          { name: "treatment", inferredType: "number", nonMissingRows: 260, missingFraction: 0, uniqueCount: 2, valueCounts: [{ value: "0", count: 130, fraction: 0.5 }, { value: "1", count: 130, fraction: 0.5 }], sampleValues: ["0", "1"], min: 0, max: 1 },
          { name: "age", inferredType: "number", nonMissingRows: 260, missingFraction: 0, uniqueCount: 75, sampleValues: ["60", "72", "84"], min: 45, max: 95 },
        ],
      },
    });
    expect(survivalAssociation.statisticalMethodGuidance.recommendedStatsRunMethod).toBe("cox-proportional-hazards");
    expect(survivalAssociation.statisticalMethodGuidance.alternatives.map(item => item.method)).toEqual(expect.arrayContaining(["kaplan-meier", "aalen-johansen-cif"]));
    expect(survivalAssociation.statisticalMethodGuidance.rationale).toMatch(/do not collapse/i);
    expect(survivalAssociation.statisticalMethodGuidance.alternatives.find(item => item.method === "cox-proportional-hazards")?.commandHint).toContain("--exposure treatment");
    expect(survivalAssociation.statisticalMethodGuidance.alternatives.find(item => item.method === "cox-proportional-hazards")?.commandHint).toContain("--time followup_days");
    expect(survivalAssociation.statisticalMethodGuidance.alternatives.find(item => item.method === "kaplan-meier")?.commandHint).not.toContain("--group <group>");

    const survivalComparison = researchModelingPlanCommand({
      question: "Compare survival between treatment groups.",
      goal: "compare_groups",
      outcomeType: "time_to_event",
      timeToEvent: true,
      target: "death",
      tableSummary: {
        rowCount: 180,
        columnCount: 3,
        columns: [
          { name: "death", inferredType: "number", nonMissingRows: 180, missingFraction: 0, uniqueCount: 2, valueCounts: [{ value: "0", count: 110, fraction: 0.6111 }, { value: "1", count: 70, fraction: 0.3889 }], sampleValues: ["0", "1"], min: 0, max: 1 },
          { name: "treatment_group", inferredType: "string", nonMissingRows: 180, missingFraction: 0, uniqueCount: 2, valueCounts: [{ value: "A", count: 90, fraction: 0.5 }, { value: "B", count: 90, fraction: 0.5 }], sampleValues: ["A", "B"] },
          { name: "followup_days", inferredType: "number", nonMissingRows: 180, missingFraction: 0, uniqueCount: 160, sampleValues: ["30", "365", "730"], min: 1, max: 1200 },
        ],
      },
    });
    expect(survivalComparison.statisticalMethodGuidance.recommendedStatsRunMethod).toBe("log-rank");
    expect(survivalComparison.statisticalMethodGuidance.alternatives.find(item => item.method === "cox-proportional-hazards")?.tier).toBe("sensitivity");
    expect(survivalComparison.statisticalMethodGuidance.alternatives.find(item => item.method === "log-rank")?.commandHint).toContain("--group treatment_group");
    expect(survivalComparison.statisticalMethodGuidance.alternatives.find(item => item.method === "log-rank")?.commandHint).toContain("--time followup_days");
  });

  it("routes multistate time-to-event endpoints to cumulative incidence before survival regression", () => {
    const competingRiskPlan = researchModelingPlanCommand({
      question: "Compare infection incidence between dialysis groups with death as a competing event.",
      goal: "compare_groups",
      outcomeType: "time_to_event",
      timeToEvent: true,
      target: "event_status",
      tableSummary: {
        rowCount: 420,
        columnCount: 4,
        columns: [
          { name: "followup_days", inferredType: "number", nonMissingRows: 420, missingFraction: 0, uniqueCount: 320, sampleValues: ["30", "365", "1800"], min: 1, max: 3650 },
          { name: "event_status", inferredType: "number", nonMissingRows: 420, missingFraction: 0, uniqueCount: 3, valueCounts: [{ value: "0", count: 250, fraction: 0.5952 }, { value: "1", count: 70, fraction: 0.1667 }, { value: "2", count: 100, fraction: 0.2381 }], sampleValues: ["0", "1", "2"], min: 0, max: 2 },
          { name: "dialysis_group", inferredType: "string", nonMissingRows: 420, missingFraction: 0, uniqueCount: 2, valueCounts: [{ value: "dialysis", count: 110, fraction: 0.2619 }, { value: "none", count: 310, fraction: 0.7381 }], sampleValues: ["dialysis", "none"] },
          { name: "age", inferredType: "number", nonMissingRows: 420, missingFraction: 0, uniqueCount: 70, sampleValues: ["55", "70", "85"], min: 18, max: 98 },
        ],
      },
    });

    expect(competingRiskPlan.statisticalMethodGuidance.recommendedStatsRunMethod).toBe("aalen-johansen-cif");
    expect(competingRiskPlan.statisticalMethodGuidance.warnings.map(issue => issue.code)).toContain("METHOD_GUIDANCE_COMPETING_EVENT_STATES");
    expect(competingRiskPlan.statisticalMethodGuidance.readiness).toMatchObject({
      status: "ready_with_sensitivity",
      requiredBeforeExecution: expect.arrayContaining(["run cumulative-incidence analysis and competing-event coding review"]),
    });
    expect(competingRiskPlan.statisticalMethodGuidance.alternatives.find(item => item.method === "aalen-johansen-cif")).toMatchObject({
      tier: "primary",
      commandHint: expect.stringContaining("--method aalen-johansen-cif"),
    });
    expect(competingRiskPlan.statisticalMethodGuidance.alternatives.find(item => item.method === "cox-proportional-hazards")?.tier).toBe("blocked");
    const fineGrayAlternative = competingRiskPlan.statisticalMethodGuidance.alternatives.find(item => item.method === "fine-gray");
    expect(fineGrayAlternative?.tier).toBe("sensitivity");
    expect(fineGrayAlternative?.runnerCapability).toMatchObject({
      method: "fine-gray",
      status: "bounded_approximation",
    });
    expect(competingRiskPlan.statisticalMethodGuidance.runnerCapability).toMatchObject({
      method: "aalen-johansen-cif",
      status: "executable",
    });
    expect(competingRiskPlan.routeRecommendation).toMatchObject({
      route: "stats-run",
      commandHint: expect.stringContaining("--method aalen-johansen-cif"),
    });
  });

  it("blocks group-comparison guidance when no usable grouping variable is present", () => {
    const missingGroup = researchModelingPlanCommand({
      question: "Compare survival between treatment groups.",
      goal: "compare_groups",
      outcomeType: "time_to_event",
      timeToEvent: true,
      target: "death",
      tableSummary: {
        rowCount: 160,
        columnCount: 2,
        columns: [
          { name: "death", inferredType: "number", nonMissingRows: 160, missingFraction: 0, uniqueCount: 2, valueCounts: [{ value: "0", count: 100, fraction: 0.625 }, { value: "1", count: 60, fraction: 0.375 }], sampleValues: ["0", "1"], min: 0, max: 1 },
          { name: "followup_days", inferredType: "number", nonMissingRows: 160, missingFraction: 0, uniqueCount: 150, sampleValues: ["30", "365", "730"], min: 1, max: 1200 },
        ],
      },
    });

    expect(missingGroup.blocked).toBe(true);
    expect(missingGroup.statisticalMethodGuidance.recommendedStatsRunMethod).toBe("kaplan-meier");
    expect(missingGroup.statisticalMethodGuidance.blockers.map(issue => issue.code)).toContain("METHOD_GUIDANCE_GROUPING_MISSING");
    expect(missingGroup.statisticalMethodGuidance.rationale).toMatch(/does not answer the requested group comparison/i);

    const missingTime = researchModelingPlanCommand({
      question: "Is treatment associated with time to death?",
      goal: "associate",
      outcomeType: "time_to_event",
      timeToEvent: true,
      target: "death",
      tableSummary: {
        rowCount: 160,
        columnCount: 3,
        columns: [
          { name: "death", inferredType: "number", nonMissingRows: 160, missingFraction: 0, uniqueCount: 2, valueCounts: [{ value: "0", count: 100, fraction: 0.625 }, { value: "1", count: 60, fraction: 0.375 }], sampleValues: ["0", "1"], min: 0, max: 1 },
          { name: "treatment", inferredType: "number", nonMissingRows: 160, missingFraction: 0, uniqueCount: 2, valueCounts: [{ value: "0", count: 80, fraction: 0.5 }, { value: "1", count: 80, fraction: 0.5 }], sampleValues: ["0", "1"], min: 0, max: 1 },
          { name: "age", inferredType: "number", nonMissingRows: 160, missingFraction: 0, uniqueCount: 70, sampleValues: ["50", "70", "85"], min: 40, max: 95 },
        ],
      },
    });
    expect(missingTime.blocked).toBe(true);
    expect(missingTime.statisticalMethodGuidance.blockers.map(issue => issue.code)).toContain("METHOD_GUIDANCE_TIME_VARIABLE_MISSING");
    expect(missingTime.statisticalMethodGuidance.alternatives.find(item => item.method === "cox-proportional-hazards")?.commandHint).toContain("--time <time>");
  });

  it("blocks method guidance when the declared target has no inferential support", () => {
    const noVariation = researchModelingPlanCommand({
      question: "Is exposure associated with a constant biomarker?",
      goal: "associate",
      outcomeType: "continuous",
      target: "constant_y",
      tableSummary: {
        rowCount: 120,
        columnCount: 2,
        columns: [
          { name: "constant_y", inferredType: "number", nonMissingRows: 120, missingFraction: 0, uniqueCount: 1, sampleValues: ["5"], min: 5, max: 5, mean: 5, median: 5, sd: 0, variance: 0, skewness: 0, outlierFraction: 0, zeroFraction: 0 },
          { name: "exposure", inferredType: "number", nonMissingRows: 120, missingFraction: 0, uniqueCount: 2, valueCounts: [{ value: "0", count: 60, fraction: 0.5 }, { value: "1", count: 60, fraction: 0.5 }], sampleValues: ["0", "1"], min: 0, max: 1 },
        ],
      },
    });
    expect(noVariation.blocked).toBe(true);
    expect(noVariation.statisticalMethodGuidance.blockers.map(issue => issue.code)).toContain("METHOD_GUIDANCE_TARGET_VARIATION_INSUFFICIENT");

    const mostlyMissing = researchModelingPlanCommand({
      question: "Is exposure associated with a sparse biomarker?",
      goal: "associate",
      outcomeType: "continuous",
      target: "sparse_y",
      tableSummary: {
        rowCount: 200,
        columnCount: 2,
        columns: [
          { name: "sparse_y", inferredType: "number", nonMissingRows: 5, missingFraction: 0.975, uniqueCount: 5, sampleValues: ["1", "2", "3"], min: 1, max: 5, mean: 3, median: 3, sd: 1.58, variance: 2.5, skewness: 0, outlierFraction: 0, zeroFraction: 0 },
          { name: "exposure", inferredType: "number", nonMissingRows: 200, missingFraction: 0, uniqueCount: 2, valueCounts: [{ value: "0", count: 100, fraction: 0.5 }, { value: "1", count: 100, fraction: 0.5 }], sampleValues: ["0", "1"], min: 0, max: 1 },
        ],
      },
    });
    expect(mostlyMissing.blocked).toBe(true);
    expect(mostlyMissing.statisticalMethodGuidance.blockers.map(issue => issue.code)).toContain("METHOD_GUIDANCE_TARGET_SUPPORT_TOO_LOW");
  });

  it("recommends design stop-for-review for causal and survival-shaped questions", () => {
    const causal = researchModelingPlanCommand({
      question: "What is the causal effect of treatment on mortality?",
      goal: "causal",
      outcomeType: "binary",
      studyDesign: "cohort",
      target: "mortality",
      tableSummary: {
        rowCount: 400,
        columnCount: 4,
        columns: [
          { name: "mortality", inferredType: "number", nonMissingRows: 400, missingFraction: 0, uniqueCount: 2, valueCounts: [{ value: "0", count: 320, fraction: 0.8 }, { value: "1", count: 80, fraction: 0.2 }], sampleValues: ["0", "1"], min: 0, max: 1 },
          { name: "treatment", inferredType: "number", nonMissingRows: 400, missingFraction: 0, uniqueCount: 2, valueCounts: [{ value: "0", count: 200, fraction: 0.5 }, { value: "1", count: 200, fraction: 0.5 }], sampleValues: ["0", "1"], min: 0, max: 1 },
          { name: "age", inferredType: "number", nonMissingRows: 400, missingFraction: 0, uniqueCount: 70, sampleValues: ["45", "55", "65"], min: 18, max: 95 },
          { name: "severity", inferredType: "number", nonMissingRows: 400, missingFraction: 0, uniqueCount: 90, sampleValues: ["1", "3", "5"], min: 0, max: 10 },
        ],
      },
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
    expect(causal.routeRecommendation.route).toBe("stop-for-review");
    expect(causal.routeRecommendation.reason).toContain("Causal inference was requested");
    expect(causal.routeRecommendation.requiredArtifacts).toEqual(expect.arrayContaining(["causal-design-note.md", "positivity-diagnostics.json"]));
    expect(survival.issues.map(issue => issue.code)).toContain("SURVIVAL_ADVANCED_BACKEND_LIMITED");
    expect(survival.candidates.some(candidate => candidate.id.includes("cox"))).toBe(true);
  });

  it("prefers interval-expanded time-varying Cox when start stop and subject roles are declared", () => {
    const plan = researchModelingPlanCommand({
      question: "Estimate whether a time-varying exposure is associated with time to clinical failure using start-stop interval data.",
      goal: "associate",
      outcomeType: "time_to_event",
      timeToEvent: true,
      studyDesign: "cohort",
      target: "failure",
      roleHints: {
        start: "interval_start",
        stop: "interval_stop",
        event: "failure",
        id: "patient_id",
        exposure: "current_exposure",
        variables: [],
        covariates: ["age"],
        exactCovariates: [],
      },
      tableSummary: {
        rowCount: 360,
        columnCount: 6,
        columns: [
          { name: "patient_id", inferredType: "number", nonMissingRows: 360, missingFraction: 0, uniqueCount: 120, sampleValues: ["1", "2", "3"], min: 1, max: 120 },
          { name: "interval_start", inferredType: "number", nonMissingRows: 360, missingFraction: 0, uniqueCount: 3, sampleValues: ["0", "30", "60"], min: 0, max: 60 },
          { name: "interval_stop", inferredType: "number", nonMissingRows: 360, missingFraction: 0, uniqueCount: 3, sampleValues: ["30", "60", "90"], min: 30, max: 90 },
          { name: "failure", inferredType: "number", nonMissingRows: 360, missingFraction: 0, uniqueCount: 2, valueCounts: [{ value: "0", count: 310, fraction: 0.8611 }, { value: "1", count: 50, fraction: 0.1389 }], sampleValues: ["0", "1"], min: 0, max: 1 },
          { name: "current_exposure", inferredType: "number", nonMissingRows: 360, missingFraction: 0, uniqueCount: 80, sampleValues: ["0.1", "0.8", "1.2"], min: 0, max: 2, mean: 0.8, median: 0.7, sd: 0.35, variance: 0.1225 },
          { name: "age", inferredType: "number", nonMissingRows: 360, missingFraction: 0, uniqueCount: 70, sampleValues: ["45", "60", "75"], min: 18, max: 95 },
        ],
      },
    });

    expect(plan.statisticalMethodGuidance.recommendedStatsRunMethod).toBe("time-varying-cox");
    expect(plan.statisticalMethodGuidance.runnerCapability).toMatchObject({
      method: "time-varying-cox",
      status: "executable",
    });
    expect(plan.statisticalMethodGuidance.warnings.map(issue => issue.code)).not.toContain("METHOD_GUIDANCE_RUNNER_BOUNDED_APPROXIMATION");
    expect(plan.statisticalMethodGuidance.alternatives.find(item => item.method === "time-varying-cox")).toMatchObject({
      tier: "primary",
      commandHint: expect.stringContaining("--start interval_start --stop interval_stop --event failure --id patient_id --exposure current_exposure"),
      runnerCapability: expect.objectContaining({ status: "executable" }),
    });
    expect(plan.statisticalMethodGuidance.alternatives.find(item => item.method === "cox-proportional-hazards")?.tier).toBe("sensitivity");
    expect(plan.statisticalMethodGuidance.readiness.status).toMatch(/ready/);
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
    expect(fallback.statisticalMethodGuidance.readiness).toMatchObject({
      status: "exploratory_only",
      promotionBlockers: expect.arrayContaining(["No table summary/profile evidence was supplied; do not promote beyond exploratory planning."]),
    });
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
      target: "hba1c",
      tableSummary: {
        rowCount: 120,
        columnCount: 3,
        columns: [
          { name: "hba1c", inferredType: "number", nonMissingRows: 120, missingFraction: 0, sampleValues: ["5.4", "6.1", "7.2"], min: 4.8, max: 9.5, mean: 6.2, median: 6.0, sd: 1.1, variance: 1.21 },
          { name: "insurance_group", inferredType: "string", nonMissingRows: 120, missingFraction: 0, uniqueCount: 2, valueCounts: [{ value: "private", count: 70, fraction: 0.583 }, { value: "public", count: 50, fraction: 0.417 }], sampleValues: ["private", "public"] },
          { name: "age", inferredType: "number", nonMissingRows: 120, missingFraction: 0, sampleValues: ["45", "55", "65"], min: 18, max: 85 },
        ],
      },
      maxCandidates: 8,
    });
    const ttest = plan.candidates.find(candidate => candidate.id === "method:two-sample-t-test");

    expect(ttest?.commandHint).toContain("research stats-run --method t-test");
    expect(ttest?.expectedArtifacts).toEqual(expect.arrayContaining(["stats-run.json", "estimates.csv", "diagnostics.json", "stats-report.md", "stats-qa.json"]));
    expect(statsRunMethodForAnalysisMethod("two-sample-t-test")).toBe("t-test");
    expect(plan.routeRecommendation.route).toBe("stats-run");
    expect(plan.nextAction).toContain("research stats-run --method welch-t-test");
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
  }, 45_000);

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
  }, mlIntegrationTestTimeout);

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
  }, mlIntegrationTestTimeout);

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
  }, mlIntegrationTestTimeout);

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
  }, mlIntegrationTestTimeout);

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

      const imputationData = path.join(dir, "stats-with-missingness.csv");
      await writeFile(imputationData, statsCsvWithMissingness());
      const imputation = await researchStatsRunCommand({
        method: "multiple-imputation-mice",
        dataPath: imputationData,
        variables: ["hba1c", "bmi", "age"],
        covariates: [],
        outDir: path.join(dir, "bounded-imputation"),
        alpha: 0.05,
        python,
      });
      const boundedManifest = await researchAnalysisManifestCommand({ runDir: path.join(dir, "bounded-imputation") });
      expect(imputation.runnerCapability?.status).toBe("bounded_approximation");
      expect(boundedManifest.runnerCapability).toMatchObject({ method: "multiple-imputation-mice", status: "bounded_approximation" });
      expect(boundedManifest.readiness).toBe("exploratory_only");
      expect(boundedManifest.nextAction).toContain("required follow-up");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }, mlIntegrationTestTimeout);

  it("runs diagnostic accuracy as an executable stats method", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "agenteer-diagnostic-stats-"));
    try {
      const data = path.join(dir, "diagnostic.csv");
      const selectionPath = path.join(dir, "method-selection.json");
      const diagnosticRows = [
        "screen_positive,elevated_hba1c",
        ...Array.from({ length: 15 }).flatMap(() => [
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
        ]),
      ];
      await writeFile(data, diagnosticRows.join("\n"));
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
        target: "elevated_hba1c",
        tableSummary: {
          rowCount: 150,
          columnCount: 2,
          columns: [
            { name: "elevated_hba1c", inferredType: "number", nonMissingRows: 150, missingFraction: 0, uniqueCount: 2, valueCounts: [{ value: "1", count: 60, fraction: 0.4 }, { value: "0", count: 90, fraction: 0.6 }], sampleValues: ["0", "1"], min: 0, max: 1 },
            { name: "screen_positive", inferredType: "number", nonMissingRows: 150, missingFraction: 0, uniqueCount: 2, valueCounts: [{ value: "1", count: 75, fraction: 0.5 }, { value: "0", count: 75, fraction: 0.5 }], sampleValues: ["0", "1"], min: 0, max: 1 },
          ],
        },
      });
      expect(plan.routeRecommendation.route).toBe("stats-run");
      expect(plan.routeRecommendation.commandHint).toContain("--method diagnostic-accuracy");
      expect(plan.routeRecommendation.commandHint).toContain("--outcome elevated_hba1c");
      expect(plan.routeRecommendation.commandHint).toContain("--exposure screen_positive");
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
      expect(result.diagnostics.confusion_matrix).toMatchObject({ tp: 45, fp: 30, tn: 60, fn: 15 });
	      expect(result.artifacts.filter(artifact => artifact.kind === "figure").map(artifact => path.basename(artifact.path))).toEqual(expect.arrayContaining([
	        "confusion-matrix.png",
	        "diagnostic-performance-metrics.png",
	      ]));
	      await writeFile(path.join(dir, "feasibility-gate.json"), `${JSON.stringify({
	        schemaVersion: 1,
	        feasibilityGate: {
	          verdict: "formal_analysis_ready",
	          status: "pass",
	          score: 0.94,
	          confidence: 0.9,
	          blockers: [],
	          warnings: [],
	          requiredModifications: [],
	          nextAction: "Proceed with bounded diagnostic stats execution.",
	        },
	      }, null, 2)}\n`);
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
      expect(analysisRun.modelingPlan.statisticalMethodGuidance.recommendedStatsRunMethod).toBe("diagnostic-accuracy");
      expect(analysisRun.modelingPlan.feasibilityEvidence.source).toBe("controller-feasibility");
      expect(analysisRun.analysisRunManifest.readiness).toBe("local_review_ready");
      expect(analysisRun.analysisRunManifest.companionReadiness).toMatchObject({
        status: "not_required",
        missingMethods: [],
      });
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
      expect(thresholdRun.issues.map(issue => issue.code)).toContain("SPARSE_DIAGNOSTIC_CELL");
      const thresholdQa = JSON.parse(await readFile(path.join(dir, "diagnostic-threshold-run", "stats-qa.json"), "utf-8")) as { checks: Array<{ id: string; status: string }> };
      expect(thresholdQa.checks.find(check => check.id === "diagnostic-sparse-cell-policy")?.status).toBe("warning");
      const thresholdManifest = await researchAnalysisManifestCommand({ runDir: path.join(dir, "diagnostic-threshold-run") });
      expect(thresholdManifest.readiness).toBe("exploratory_only");
      expect(thresholdManifest.nextAction).toContain("diagnostic-sparse-cell-policy");
      await expect(researchAnalysisManifestCommand({ runDir: path.join(dir, "diagnostic-threshold-run"), requireReady: true })).rejects.toThrow(/diagnostic-sparse-cell-policy|not local_review_ready/i);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }, mlIntegrationTestTimeout);

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
        replacement: true,
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
      expect(result.artifacts.map(artifact => artifact.kind)).toEqual(expect.arrayContaining(["balance", "propensity-scores", "propensity-overlap", "matched-pairs", "figure", "figure-manifest", "figure-qa", "report", "qa"]));
      const figures = JSON.parse(await readFile(path.join(dir, "matching", "figures.json"), "utf-8")) as { figures: Array<{ path: string; title: string; sourceColumns: string[] }> };
      expect(figures.figures.map(figure => path.basename(figure.path))).toEqual(expect.arrayContaining(["propensity-love-plot.png", "propensity-overlap.png"]));
      expect(figures.figures.find(figure => path.basename(figure.path) === "propensity-love-plot.png")?.sourceColumns).toEqual(expect.arrayContaining(["treated", "age", "bmi"]));
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
      expect(manifest.qaReadiness.status).toBe("warning");
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
        replacement: true,
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
  }, mlIntegrationTestTimeout);

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
      expect(result.artifacts.map(artifact => artifact.kind)).toEqual(expect.arrayContaining(["balance", "propensity-scores", "propensity-overlap", "weights", "figure", "figure-manifest", "figure-qa"]));
      const figures = JSON.parse(await readFile(path.join(dir, "weighting", "figures.json"), "utf-8")) as { figures: Array<{ path: string; title: string; sourceColumns: string[] }> };
      expect(figures.figures.map(figure => path.basename(figure.path))).toEqual(expect.arrayContaining(["propensity-love-plot.png", "propensity-overlap.png"]));
      const weights = await readFile(path.join(dir, "weighting", "weights.csv"), "utf-8");
      expect(weights).toContain("analysis_weight");
      expect(result.issues.map(issue => issue.code)).not.toContain("PROPENSITY_POOR_OVERLAP");
      const manifest = await researchAnalysisManifestCommand({ runDir: path.join(dir, "weighting") });
      expect(manifest.artifacts.filter(artifact => artifact.required).map(artifact => artifact.kind)).toEqual(expect.arrayContaining(["balance", "propensity-scores", "propensity-overlap", "weights"]));
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }, mlIntegrationTestTimeout);

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
      expect(result.generatedFiles.feasibilityGate).toBeTruthy();
      expect(result.modelingPlan.feasibilityEvidence).toMatchObject({
        source: "controller-feasibility",
        path: result.generatedFiles.feasibilityGate,
      });
      expect(result.postRunModelingPlan.feasibilityEvidence).toMatchObject({
        source: "controller-feasibility",
        path: result.generatedFiles.feasibilityGate,
      });
      const feasibilityGate = JSON.parse(await readFile(result.generatedFiles.feasibilityGate!, "utf-8")) as { feasibilityGate: { status: string; verdict: string } };
      expect(["pass", "warning", "block"]).toContain(feasibilityGate.feasibilityGate.status);
      expect(await readFile(result.generatedFiles.modelingPlan, "utf-8")).toContain("modelingPlan");
      const feasibilityTrial = JSON.parse(await readFile(result.generatedFiles.feasibilityTrial, "utf-8")) as { feasibilityTrial: { status: string; issueCodes: string[] } };
      expect(feasibilityTrial.feasibilityTrial.status).toBe("needs_methods_review");
      expect(feasibilityTrial.feasibilityTrial.issueCodes).toContain("STATS_METHOD_DECISION_ALIGNMENT_REVIEW");
      expect(await readFile(result.generatedFiles.postRunModelingPlan, "utf-8")).toContain("priorRunEvidence");
      expect(result.analysisRunManifest.artifacts.map(artifact => artifact.kind)).toContain("feasibility-trial");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }, mlIntegrationTestTimeout);

  it("fails fast before stats execution when analysis-run feasibility blocks", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "agenteer-analysis-run-feasibility-block-"));
    try {
      const data = path.join(dir, "invalid-binary.csv");
      const outDir = path.join(dir, "analysis-run");
      await writeFile(data, [
        "death_flag,age",
        "0,55",
        "1,60",
        "2,70",
        "1,80",
        "0,65",
      ].join("\n") + "\n");

      await expect(researchAnalysisRunCommand({
        question: "Is age associated with mortality?",
        method: "logistic-regression",
        dataPath: data,
        outcome: "death_flag",
        exposure: "age",
        outDir,
        python,
      })).rejects.toThrow(/feasibility gate blocked execution before stats-run/i);

      const feasibilityGate = JSON.parse(await readFile(path.join(outDir, "feasibility-gate.json"), "utf-8")) as { feasibilityGate: { status: string; verdict: string; blockers: string[] } };
      const modelingEnvelope = JSON.parse(await readFile(path.join(outDir, "modeling-plan.json"), "utf-8")) as { modelingPlan: { blocked: boolean; feasibilityEvidence: { status: string; verdict: string }; issues: Array<{ code: string }> } };

      expect(feasibilityGate.feasibilityGate).toMatchObject({
        status: "block",
        verdict: "reject",
      });
      expect(modelingEnvelope.modelingPlan.blocked).toBe(true);
      expect(modelingEnvelope.modelingPlan.feasibilityEvidence).toMatchObject({
        status: "block",
        verdict: "reject",
      });
      expect(modelingEnvelope.modelingPlan.issues.map(issue => issue.code)).toContain("FEASIBILITY_GATE_BLOCKED");
      await expect(readFile(path.join(outDir, "stats-run", "stats-run.json"), "utf-8")).rejects.toThrow();
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }, mlIntegrationTestTimeout);

  it("summarizes route coverage and writes a benchmark report for stats and ML comparison routes", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "agenteer-analysis-benchmark-"));
    try {
      const statsCsvPath = path.join(dir, "stats.csv");
      const methodSelectionPath = path.join(dir, "method-selection.json");
      await writeFile(statsCsvPath, [
        "group,outcome",
        ...Array.from({ length: 120 }, (_, index) => {
          const group = index < 60 ? 0 : 1;
          const outcome = group === 0 ? 10 + (index % 6) * 0.4 : 14 + (index % 6) * 0.45;
          return `${group},${outcome.toFixed(2)}`;
        }),
      ].join("\n"));
      const methodSelection = await researchMethodSelectCommand({
        question: "Use Welch unequal-variance comparison for mean outcome by group.",
        outcomeType: "continuous",
        studyDesign: "cross_sectional",
        dataStructures: ["single_table"],
        goal: "compare_groups",
        outPath: methodSelectionPath,
      });
      expect(methodSelection.primary?.method.id).toBe("welch-t-test");
      const stats = await researchAnalysisRunCommand({
        question: "Use Welch unequal-variance comparison for mean outcome by group.",
        method: "welch-t-test",
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
  }, mlIntegrationTestTimeout);

  it("runs the standard golden path and writes consolidated inspection artifacts", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "agenteer-golden-run-"));
    try {
      const dataPath = path.join(dir, "stats.csv");
      await writeFile(dataPath, [
        "group,outcome",
        ...Array.from({ length: 100 }, (_, index) => {
          const group = index < 50 ? 0 : 1;
          const outcome = group === 0 ? 10 + (index % 5) * 0.25 : 12 + (index % 5) * 0.28;
          return `${group},${outcome.toFixed(2)}`;
        }),
      ].join("\n"));
      const outDir = path.join(dir, "golden");

      const golden = await researchGoldenRunCommand({
        question: "Use Welch unequal-variance comparison for mean outcome by group.",
        method: "welch-t-test",
        dataPath,
        outDir,
        outcome: "outcome",
        group: "group",
        variables: [],
        covariates: [],
        alpha: 0.05,
        python,
      });

      expect(golden.status).toBe("needs_methods_review");
      expect(golden.stages.map(stage => stage.id)).toEqual([
        "analysis-run",
        "analysis-manifest",
        "method-qa",
        "manuscript",
        "run-inspect",
        "analysis-benchmark",
      ]);
      expect(golden.stages.every(stage => stage.evidenceRefs.length > 0)).toBe(true);
      expect(golden.analysisManifest.readiness).toBe("local_review_ready");
      expect(golden.inspection.readiness).toBe("needs_methods_review");
      expect(golden.methodQa.overallStatus).toMatch(/pass|warning/);
      expect(golden.manuscript.manuscriptQa.status).toBe("pass");
      expect(golden.finalReadiness).toMatchObject({
        readiness: golden.inspection.readiness,
        blockers: golden.inspection.blockers.length,
	        warnings: golden.inspection.warnings.length,
	        methodQaStatus: golden.methodQa.overallStatus,
	        manuscriptQaStatus: golden.manuscript.manuscriptQa.status,
	        feasibilityReadinessStatus: golden.analysisManifest.feasibilityReadiness.status,
	        feasibilityVerdict: golden.analysisManifest.feasibilityReadiness.verdict,
	        figureReadinessStatus: golden.inspection.qa.figureReadinessStatus,
	        benchmarkStatus: golden.benchmark.status,
	        recommendedCommands: golden.inspection.recommendedCommands,
	      });
	      expect(golden.finalReadiness.feasibilityReadinessStatus).toBe("pass");
	      expect(golden.finalReadiness.feasibilityVerdict).toBe("formal_analysis_ready");
	      expect(golden.finalReadiness.recommendedCommands).toEqual(golden.inspection.recommendedCommands);
      expect(golden.stages.some(stage => stage.status === "fail")).toBe(false);
      expect(golden.benchmark.status).toBe("pass");
      expect(golden.generatedFiles).toMatchObject({
        goldenRun: expect.stringContaining("golden-run.json"),
        goldenReport: expect.stringContaining("golden-run.md"),
        analysisManifest: expect.stringContaining("analysis-run-manifest.json"),
        methodQa: expect.stringContaining("method-qa.json"),
        methodQaReport: expect.stringContaining("method-qa.md"),
        manuscript: expect.stringContaining("manuscript.md"),
        manuscriptQa: expect.stringContaining("manuscript-qa.json"),
        runInspection: expect.stringContaining("run-inspection.json"),
        runInspectionReport: expect.stringContaining("run-inspection.md"),
        benchmark: expect.stringContaining("analysis-benchmark.json"),
        benchmarkReport: expect.stringContaining("analysis-benchmark.md"),
      });
      const goldenReport = await readFile(golden.generatedFiles.goldenReport, "utf-8");
	      expect(goldenReport).toContain("research golden run");
	      expect(goldenReport).toContain("final readiness:");
	      expect(goldenReport).toContain("feasibility: pass; verdict=formal_analysis_ready");
	      expect(goldenReport).toContain("figure QA:");
      expect(goldenReport).toContain("command 1:");
      expect(await readFile(golden.generatedFiles.manuscript ?? "", "utf-8")).toContain("## Abstract");
      expect(renderResearchGoldenRun(golden)).toContain("research golden run: needs_methods_review");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }, mlIntegrationTestTimeout);

  it("supports strict bound analysis routes", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "agenteer-analysis-run-bound-"));
    try {
      const data = path.join(dir, "stats.csv");
      const ttestSelectionPath = path.join(dir, "method-selection-t-test.json");
      const welchSelectionPath = path.join(dir, "method-selection-welch.json");
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
        question: "Use an equal-variance pooled Student t-test to compare mean HbA1c between two independent groups",
        goal: "compare_groups",
        outcomeType: "continuous",
        dataStructures: ["single_table"],
        outPath: ttestSelectionPath,
      });
      const boundFallback = await researchAnalysisRunCommand({
        question: "Do groups differ in HbA1c?",
        method: "t-test",
        dataPath: data,
        outcome: "hba1c",
        group: "group",
        methodSelectionPath: ttestSelectionPath,
        requireBound: true,
        outDir: path.join(dir, "bound-fallback"),
        python,
      });

      expect(boundFallback.statsRun.binding.status).toBe("bound");
      expect(boundFallback.statsRun.resultPosture?.status).toBe("exploratory_standard_table");
      expect(boundFallback.statsRun.resultPosture?.label).toBe("Exploratory method-choice result");
      expect(boundFallback.analysisRunManifest.readiness).toBe("exploratory_only");
      expect(boundFallback.analysisRunManifest.methodDecisionReadiness).toMatchObject({
        status: "review_required",
        verdict: "fallback_only",
        requestedRole: "fallback",
      });
      const fallbackBenchmark = await researchAnalysisBenchmarkCommand({ runDirs: [path.join(dir, "bound-fallback", "stats-run")] });
      expect(fallbackBenchmark.checks).toEqual(expect.arrayContaining([
        expect.objectContaining({ id: "method-decision-readiness", status: "warning" }),
      ]));
      await expect(researchAnalysisManifestCommand({ runDir: path.join(dir, "bound-fallback", "stats-run"), requireReady: true })).rejects.toThrow(/method|preferred|Welch|review/i);

      await researchMethodSelectCommand({
        question: "Use Welch unequal-variance comparison for mean HbA1c by group",
        goal: "compare_groups",
        outcomeType: "continuous",
        dataStructures: ["single_table"],
        outPath: welchSelectionPath,
      });
      const bound = await researchAnalysisRunCommand({
        question: "Do groups differ in HbA1c?",
        method: "welch-t-test",
        dataPath: data,
        outcome: "hba1c",
        group: "group",
        methodSelectionPath: welchSelectionPath,
        requireBound: true,
        outDir: path.join(dir, "bound"),
        python,
      });

      expect(bound.statsRun.binding.status).toBe("bound");
      expect(bound.statsRun.resultPosture?.status).toBe("bound_standard_table");
      expect(bound.analysisRunManifest.methodDecisionReadiness.status).toBe("preferred");
      expect(bound.analysisRunManifest.readiness).toBe("local_review_ready");
      await expect(researchAnalysisManifestCommand({ runDir: path.join(dir, "bound", "stats-run"), requireReady: true })).resolves.toMatchObject({ readiness: "local_review_ready" });
      await writeFile(path.join(dir, "bound", "stats-run", "method-decision-support.json"), `${JSON.stringify({
        schemaVersion: 1,
        methodDecisionSupport: {
          requestedMethod: "welch-t-test",
          requestedRole: "fallback",
          verdict: "fallback_only",
          primaryMethods: [{ method: "mann-whitney", rationale: "Injected stale sidecar to verify consistency gating." }],
          sensitivityMethods: [{ method: "welch-t-test", rationale: "Injected stale sidecar." }],
          fallbackMethods: [{ method: "t-test", rationale: "Injected stale sidecar." }],
          nextAction: "Injected stale sidecar should not be promotion-ready.",
        },
      }, null, 2)}\n`);
      const staleSidecarManifest = await researchAnalysisManifestCommand({ runDir: path.join(dir, "bound", "stats-run") });
      expect(staleSidecarManifest.methodDecisionReadiness.status).toBe("preferred");
      expect(staleSidecarManifest.methodDecisionEvidenceConsistency).toMatchObject({
        status: "warning",
        sourceCount: 3,
      });
      expect(staleSidecarManifest.methodDecisionEvidenceConsistency.mismatchedSources).toEqual(expect.arrayContaining(["stats-run", "method-decision-support", "stats-preflight"]));
      expect(staleSidecarManifest.readiness).toBe("exploratory_only");
      await expect(researchAnalysisManifestCommand({ runDir: path.join(dir, "bound", "stats-run"), requireReady: true })).rejects.toThrow(/method-decision|contradictory|not local_review_ready/i);
      const staleBenchmark = await researchAnalysisBenchmarkCommand({ runDirs: [path.join(dir, "bound", "stats-run")] });
      expect(staleBenchmark.checks).toEqual(expect.arrayContaining([
        expect.objectContaining({ id: "method-decision-consistency", status: "warning" }),
      ]));
      await writeFile(path.join(dir, "bound", "stats-run", "stats-qa.json"), `${JSON.stringify({
        schemaVersion: 1,
        status: "fail",
        summary: "Injected regression fixture: estimate sanity failed.",
        checks: [
          { id: "estimate-effect-scale-consistency", status: "fail", detail: "Injected effect-scale mismatch." },
        ],
      }, null, 2)}\n`);
      const qaBlocked = await researchAnalysisManifestCommand({ runDir: path.join(dir, "bound", "stats-run") });
      expect(qaBlocked.qaReadiness).toMatchObject({
        status: "fail",
        failingChecks: ["estimate-effect-scale-consistency"],
      });
      expect(qaBlocked.readiness).toBe("blocked");
      await expect(researchAnalysisManifestCommand({ runDir: path.join(dir, "bound", "stats-run"), requireReady: true })).rejects.toThrow(/stats QA|estimate-effect-scale-consistency|not local_review_ready/i);
      const inspection = await researchRunInspectCommand({ runDir: path.join(dir, "bound", "stats-run") });
      expect(inspection.readiness).toBe("blocked");
      expect(inspection.qa.statsQaReadinessStatus).toBe("fail");
      expect(inspection.qa.statsQaFailingChecks).toContain("estimate-effect-scale-consistency");
      expect(inspection.blockers.join(" ")).toContain("Stats QA readiness failed");
      const benchmark = await researchAnalysisBenchmarkCommand({ runDirs: [path.join(dir, "bound", "stats-run")] });
      expect(benchmark.status).toBe("fail");
      expect(benchmark.checks).toEqual(expect.arrayContaining([
        expect.objectContaining({ id: "qa-readiness", status: "fail" }),
        expect.objectContaining({ id: "method-decision-readiness", status: "pass" }),
      ]));
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }, mlIntegrationTestTimeout);

  it("uses standalone method-decision artifacts when building analysis manifests", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "agenteer-manifest-method-decision-"));
    try {
      const runDir = path.join(dir, "stats-run");
      await mkdir(runDir, { recursive: true });
      await writeFile(path.join(dir, "feasibility-gate.json"), `${JSON.stringify({
        schemaVersion: 1,
        feasibilityGate: {
          verdict: "formal_analysis_ready",
          status: "pass",
          score: 0.94,
          confidence: 0.9,
          blockers: [],
          warnings: [],
          requiredModifications: [],
          nextAction: "Proceed with bounded stats execution.",
        },
      }, null, 2)}\n`);
      await writeFile(path.join(runDir, "stats-run.json"), `${JSON.stringify({
        schemaVersion: 1,
        status: "succeeded",
        method: "welch-t-test",
        resultPosture: {
          status: "bound_standard_table",
          interpretationBoundary: "Local standard-table group comparison.",
          nextAction: "Proceed to methods review.",
        },
        completeCaseN: 48,
        estimates: [{ term: "group", estimate: 3.1, ciLow: 2.3, ciHigh: 3.9, pValue: 0.001 }],
        diagnostics: {},
        runnerCapability: {
          method: "welch-t-test",
          status: "executable",
          reason: "Local fixture runner capability.",
        },
      }, null, 2)}\n`);
      await writeFile(path.join(runDir, "method-contract.json"), `${JSON.stringify({ statisticalMethodSpec: { method: "welch-t-test" } }, null, 2)}\n`);
      await writeFile(path.join(runDir, "stats-summary.json"), `${JSON.stringify({ completeCaseN: 48 }, null, 2)}\n`);
      await writeFile(path.join(runDir, "estimates.csv"), "term,estimate,p_value\ngroup,3.1,0.001\n");
      await writeFile(path.join(runDir, "diagnostics.json"), `${JSON.stringify({ completeCaseN: 48 }, null, 2)}\n`);
      await writeFile(path.join(runDir, "stats-report.md"), "# Stats Report\n\nWelch comparison.\n");
      await writeFile(path.join(runDir, "stats-qa.json"), `${JSON.stringify({ schemaVersion: 1, status: "pass", checks: [] }, null, 2)}\n`);
      await writeFile(path.join(runDir, "stats-preflight.json"), `${JSON.stringify({ schemaVersion: 1, statsPreflight: { status: "pass", method: "welch-t-test", checks: [] } }, null, 2)}\n`);
      await writeFile(path.join(runDir, "stats-preflight.md"), "# Stats Preflight\n\nPassed.\n");
      await writeFile(path.join(runDir, "method-decision-support.json"), `${JSON.stringify({
        schemaVersion: 1,
        methodDecisionSupport: {
          requestedMethod: "welch-t-test",
          requestedRole: "primary",
          verdict: "preferred",
          primaryMethods: [{ method: "welch-t-test", rationale: "Unequal-variance comparison is the data-shaped primary method." }],
          sensitivityMethods: [{ method: "mann-whitney", rationale: "Rank-based sensitivity." }],
          fallbackMethods: [{ method: "t-test", rationale: "Equal-variance fallback only." }],
          nextAction: "Proceed with local methods review.",
        },
      }, null, 2)}\n`);
      await writeFile(path.join(runDir, "method-decision-support.md"), "# Method Decision\n\nWelch is preferred.\n");

      const manifest = await researchAnalysisManifestCommand({ runDir, requireReady: true });

      expect(manifest.methodDecisionReadiness).toMatchObject({
        status: "preferred",
        requestedMethod: "welch-t-test",
        requestedRole: "primary",
        verdict: "preferred",
        primaryMethods: ["welch-t-test"],
      });
      expect(manifest.methodDecisionReadiness.evidenceRefs).toContain(path.join(runDir, "method-decision-support.json"));
      expect(manifest.feasibilityReadiness.status).toBe("pass");
      expect(manifest.artifacts.find(artifact => artifact.kind === "feasibility-gate")?.exists).toBe(true);
      expect(manifest.readiness).toBe("local_review_ready");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("keeps bound stats packets exploratory when feasibility evidence is missing", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "agenteer-manifest-missing-feasibility-"));
    try {
      await writeFile(path.join(dir, "stats-run.json"), `${JSON.stringify({
        schemaVersion: 1,
        status: "succeeded",
        method: "welch-t-test",
        resultPosture: {
          status: "bound_standard_table",
          interpretationBoundary: "Local standard-table group comparison.",
          nextAction: "Proceed to methods review.",
        },
        completeCaseN: 48,
        estimates: [{ term: "group", estimate: 3.1, ciLow: 2.3, ciHigh: 3.9, pValue: 0.001 }],
        diagnostics: {},
        runnerCapability: {
          method: "welch-t-test",
          status: "executable",
          reason: "Local fixture runner capability.",
        },
      }, null, 2)}\n`);
      await writeFile(path.join(dir, "method-contract.json"), `${JSON.stringify({ statisticalMethodSpec: { method: "welch-t-test" } }, null, 2)}\n`);
      await writeFile(path.join(dir, "stats-summary.json"), `${JSON.stringify({ completeCaseN: 48 }, null, 2)}\n`);
      await writeFile(path.join(dir, "estimates.csv"), "term,estimate,p_value\ngroup,3.1,0.001\n");
      await writeFile(path.join(dir, "diagnostics.json"), `${JSON.stringify({ completeCaseN: 48 }, null, 2)}\n`);
      await writeFile(path.join(dir, "stats-report.md"), "# Stats Report\n\nWelch comparison.\n");
      await writeFile(path.join(dir, "stats-qa.json"), `${JSON.stringify({ schemaVersion: 1, status: "pass", checks: [] }, null, 2)}\n`);
      await writeFile(path.join(dir, "stats-preflight.json"), `${JSON.stringify({ schemaVersion: 1, statsPreflight: { status: "pass", method: "welch-t-test", checks: [] } }, null, 2)}\n`);
      await writeFile(path.join(dir, "stats-preflight.md"), "# Stats Preflight\n\nPassed.\n");
      await writeFile(path.join(dir, "method-decision-support.json"), `${JSON.stringify({
        schemaVersion: 1,
        methodDecisionSupport: {
          requestedMethod: "welch-t-test",
          requestedRole: "primary",
          verdict: "preferred",
          primaryMethods: [{ method: "welch-t-test", rationale: "Unequal-variance comparison is the data-shaped primary method." }],
          sensitivityMethods: [],
          fallbackMethods: [],
          nextAction: "Proceed with local methods review.",
        },
      }, null, 2)}\n`);
      await writeFile(path.join(dir, "method-decision-support.md"), "# Method Decision\n\nWelch is preferred.\n");

      const manifest = await researchAnalysisManifestCommand({ runDir: dir });

      expect(manifest.feasibilityReadiness.status).toBe("not_supplied");
      expect(manifest.readiness).toBe("exploratory_only");
	      expect(manifest.nextAction).toContain("feasibility-gate");
	      expect(renderResearchAnalysisManifest(manifest)).toContain("feasibility: not_supplied");
	      const benchmark = await researchAnalysisBenchmarkCommand({ runDirs: [dir] });
	      expect(benchmark.status).toBe("pass");
	      expect(benchmark.checks).toEqual(expect.arrayContaining([
	        expect.objectContaining({
	          id: "feasibility-readiness",
	          status: "warning",
	          detail: expect.stringContaining("missing feasibility-gate or analysis-run feasibility evidence"),
	        }),
	      ]));
	      expect(benchmark.summary).toContain("warnings=feasibility-readiness");
	      expect(benchmark.nextAction).toContain("feasibility-readiness");
	      expect(renderResearchAnalysisBenchmark(benchmark)).toContain("feasibility=not_supplied");
	      await expect(researchAnalysisManifestCommand({ runDir: dir, requireReady: true })).rejects.toThrow(/feasibility|not local_review_ready/i);
	    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("downgrades analysis manifests when required visual evidence has QA warnings", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "agenteer-manifest-visual-qa-warning-"));
    try {
      await writeFile(path.join(dir, "stats-run.json"), `${JSON.stringify({
        schemaVersion: 1,
        status: "succeeded",
        method: "welch-t-test",
        resultPosture: {
          status: "bound_standard_table",
          interpretationBoundary: "Local standard-table group comparison.",
          nextAction: "Proceed to methods review.",
        },
        completeCaseN: 48,
        estimates: [{ term: "group", estimate: 3.1, ciLow: 2.3, ciHigh: 3.9, pValue: 0.001 }],
        diagnostics: {},
        runnerCapability: {
          method: "welch-t-test",
          status: "executable",
          reason: "Local fixture runner capability.",
        },
      }, null, 2)}\n`);
      await writeFile(path.join(dir, "method-contract.json"), `${JSON.stringify({ statisticalMethodSpec: { method: "welch-t-test" } }, null, 2)}\n`);
      await writeFile(path.join(dir, "stats-summary.json"), `${JSON.stringify({ completeCaseN: 48 }, null, 2)}\n`);
      await writeFile(path.join(dir, "estimates.csv"), "term,estimate,p_value\ngroup,3.1,0.001\n");
      await writeFile(path.join(dir, "diagnostics.json"), `${JSON.stringify({ completeCaseN: 48 }, null, 2)}\n`);
      await writeFile(path.join(dir, "stats-report.md"), "# Stats Report\n\nWelch comparison.\n");
      await writeFile(path.join(dir, "stats-qa.json"), `${JSON.stringify({
        schemaVersion: 1,
        status: "warning",
        summary: "Required visual evidence is incomplete.",
        checks: [
          { id: "figure-manifest", status: "warning", detail: "Figure manifest is missing." },
          { id: "method-contract-figure-coverage", status: "warning", detail: "Missing required figure family: outcome-distribution-by-group." },
          { id: "execution-status", status: "pass", detail: "Stats runner completed." },
        ],
      }, null, 2)}\n`);
      await writeFile(path.join(dir, "stats-preflight.json"), `${JSON.stringify({ schemaVersion: 1, statsPreflight: { status: "pass", method: "welch-t-test", checks: [] } }, null, 2)}\n`);
      await writeFile(path.join(dir, "stats-preflight.md"), "# Stats Preflight\n\nPassed.\n");
      await writeFile(path.join(dir, "method-decision-support.json"), `${JSON.stringify({
        schemaVersion: 1,
        methodDecisionSupport: {
          requestedMethod: "welch-t-test",
          requestedRole: "primary",
          verdict: "preferred",
          primaryMethods: [{ method: "welch-t-test", rationale: "Unequal-variance comparison is the data-shaped primary method." }],
          sensitivityMethods: [{ method: "mann-whitney", rationale: "Rank-based sensitivity." }],
          fallbackMethods: [{ method: "t-test", rationale: "Equal-variance fallback only." }],
          nextAction: "Proceed with local methods review.",
        },
      }, null, 2)}\n`);
      await writeFile(path.join(dir, "method-decision-support.md"), "# Method Decision\n\nWelch is preferred.\n");

      const manifest = await researchAnalysisManifestCommand({ runDir: dir });

      expect(manifest.qaReadiness).toMatchObject({
        status: "warning",
        warningChecks: ["figure-manifest", "method-contract-figure-coverage"],
      });
      expect(manifest.readiness).toBe("exploratory_only");
      expect(manifest.nextAction).toContain("Resolve critical stats QA warning");
      const benchmark = await researchAnalysisBenchmarkCommand({
        runDirs: [dir],
        reportPath: path.join(dir, "benchmark.md"),
      });
      expect(benchmark.checks).toEqual(expect.arrayContaining([
        expect.objectContaining({
          id: "critical-stats-qa-warnings",
          status: "warning",
          detail: expect.stringContaining("figure-manifest"),
        }),
      ]));
      expect(benchmark.summary).toContain("warnings=qa-readiness, critical-stats-qa-warnings");
      expect(benchmark.nextAction).toContain("Resolve or explicitly justify warning-level benchmark checks");
      expect(benchmark.nextAction).toContain("critical-stats-qa-warnings");
      expect(renderResearchAnalysisBenchmark(benchmark)).toContain("qa=warning[warning:figure-manifest,warning:method-contract-figure-coverage]");
      const benchmarkReport = await readFile(path.join(dir, "benchmark.md"), "utf-8");
      expect(benchmarkReport).toContain("warning:figure-manifest");
      expect(benchmarkReport).toContain("warning:method-contract-figure-coverage");
      await expect(researchAnalysisManifestCommand({ runDir: dir, requireReady: true })).rejects.toThrow(/critical|figure|not local_review_ready/i);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("downgrades analysis manifests when complete-case or selected-variable missingness warnings remain unresolved", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "agenteer-manifest-missingness-qa-warning-"));
    try {
      await writeFile(path.join(dir, "stats-run.json"), `${JSON.stringify({
        schemaVersion: 1,
        status: "succeeded",
        method: "linear-regression",
        resultPosture: {
          status: "bound_standard_table",
          interpretationBoundary: "Local adjusted regression.",
          nextAction: "Proceed to methods review.",
        },
        completeCaseN: 42,
        estimates: [{ term: "exposure", estimate: 1.2, ciLow: 0.4, ciHigh: 2.0, pValue: 0.004 }],
        diagnostics: {},
        runnerCapability: {
          method: "linear-regression",
          status: "executable",
          reason: "Local fixture runner capability.",
        },
      }, null, 2)}\n`);
      await writeFile(path.join(dir, "method-contract.json"), `${JSON.stringify({ statisticalMethodSpec: { method: "linear-regression" } }, null, 2)}\n`);
      await writeFile(path.join(dir, "stats-summary.json"), `${JSON.stringify({ completeCaseN: 42 }, null, 2)}\n`);
      await writeFile(path.join(dir, "estimates.csv"), "term,estimate,p_value\nexposure,1.2,0.004\n");
      await writeFile(path.join(dir, "diagnostics.json"), `${JSON.stringify({ completeCaseN: 42 }, null, 2)}\n`);
      await writeFile(path.join(dir, "stats-report.md"), "# Stats Report\n\nLinear regression.\n");
      await writeFile(path.join(dir, "stats-qa.json"), `${JSON.stringify({
        schemaVersion: 1,
        status: "warning",
        summary: "Complete-case retention and selected-variable missingness require sensitivity review.",
        checks: [
          { id: "analysis-complete-case-retention", status: "warning", detail: "42 of 120 row(s) (35.0%) remain after requiring all selected analysis variables." },
          { id: "analysis-variable-missingness-burden", status: "warning", detail: "2 selected required variable(s) exceed 20% missingness; worst is albumin at 44.0%." },
          { id: "figure-manifest", status: "pass", detail: "Figure manifest was written." },
          { id: "method-contract-figure-coverage", status: "pass", detail: "Required figure families are represented." },
          { id: "execution-status", status: "pass", detail: "Stats runner completed." },
        ],
      }, null, 2)}\n`);
      await writeFile(path.join(dir, "stats-preflight.json"), `${JSON.stringify({
        schemaVersion: 1,
        statsPreflight: {
          status: "warning",
          method: "linear-regression",
          checks: [
            { id: "complete-case-retention", status: "warning", detail: "42 of 120 row(s) (35.0%) remain after requiring all selected analysis variables." },
            { id: "required-variable-missingness-burden", status: "warning", detail: "2 selected required variable(s) exceed 20% missingness; worst is albumin at 44.0%." },
          ],
        },
      }, null, 2)}\n`);
      await writeFile(path.join(dir, "stats-preflight.md"), "# Stats Preflight\n\nMissingness review required.\n");
      await writeFile(path.join(dir, "method-decision-support.json"), `${JSON.stringify({
        schemaVersion: 1,
        methodDecisionSupport: {
          requestedMethod: "linear-regression",
          requestedRole: "primary",
          verdict: "preferred",
          primaryMethods: [{ method: "linear-regression", rationale: "Adjusted continuous-outcome model is data-shaped primary method." }],
          sensitivityMethods: [{ method: "robust-linear-regression", rationale: "Robust sensitivity." }],
          fallbackMethods: [],
          nextAction: "Proceed with local methods review.",
        },
      }, null, 2)}\n`);
      await writeFile(path.join(dir, "method-decision-support.md"), "# Method Decision\n\nLinear regression is preferred.\n");

      const manifest = await researchAnalysisManifestCommand({ runDir: dir });

      expect(manifest.qaReadiness).toMatchObject({
        status: "warning",
        warningChecks: ["analysis-complete-case-retention", "analysis-variable-missingness-burden"],
      });
      expect(manifest.readiness).toBe("exploratory_only");
      expect(manifest.nextAction).toContain("Resolve critical stats QA warning");
      expect(manifest.nextAction).toContain("analysis-complete-case-retention");
      await expect(researchAnalysisManifestCommand({ runDir: dir, requireReady: true })).rejects.toThrow(/complete-case|missingness|not local_review_ready/i);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("downgrades actual stats-run manifests and inspection when missingness warnings remain unresolved", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "agenteer-real-missingness-manifest-"));
    try {
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
      const outDir = path.join(dir, "stats-run");

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
      const qa = JSON.parse(await readFile(path.join(outDir, "stats-qa.json"), "utf-8")) as { status: string; checks: Array<{ id: string; status: string; detail: string }> };
      const manifest = await researchAnalysisManifestCommand({ runDir: outDir });
      const inspection = await researchRunInspectCommand({ runDir: outDir });

      expect(result.status).toBe("succeeded");
      expect(result.completeCaseN).toBe(50);
      expect(qa.status).toBe("warning");
      expect(qa.checks.find(check => check.id === "analysis-complete-case-retention")).toMatchObject({
        status: "warning",
      });
      expect(qa.checks.find(check => check.id === "analysis-variable-missingness-burden")).toMatchObject({
        status: "warning",
      });
      expect(manifest.qaReadiness.warningChecks).toEqual(expect.arrayContaining([
        "analysis-complete-case-retention",
        "analysis-variable-missingness-burden",
      ]));
      expect(manifest.readiness).toBe("exploratory_only");
      expect(manifest.nextAction).toContain("analysis-complete-case-retention");
      expect(inspection.readiness).toBe("needs_methods_review");
      expect(inspection.qa.statsQaWarningChecks).toEqual(expect.arrayContaining([
        "analysis-complete-case-retention",
        "analysis-variable-missingness-burden",
      ]));
      await expect(researchAnalysisManifestCommand({ runDir: outDir, requireReady: true })).rejects.toThrow(/complete-case|missingness|not local_review_ready/i);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("downgrades analysis manifests when semantic plausibility warnings remain unresolved", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "agenteer-manifest-semantic-qa-warning-"));
    try {
      await writeFile(path.join(dir, "stats-run.json"), `${JSON.stringify({
        schemaVersion: 1,
        status: "succeeded",
        method: "linear-regression",
        resultPosture: {
          status: "bound_standard_table",
          interpretationBoundary: "Local adjusted regression.",
          nextAction: "Proceed to methods review.",
        },
        completeCaseN: 90,
        estimates: [{ term: "bmi", estimate: 0.8, ciLow: 0.3, ciHigh: 1.3, pValue: 0.002 }],
        diagnostics: {},
        runnerCapability: {
          method: "linear-regression",
          status: "executable",
          reason: "Local fixture runner capability.",
        },
      }, null, 2)}\n`);
      await writeFile(path.join(dir, "method-contract.json"), `${JSON.stringify({ statisticalMethodSpec: { method: "linear-regression" } }, null, 2)}\n`);
      await writeFile(path.join(dir, "stats-summary.json"), `${JSON.stringify({ completeCaseN: 90 }, null, 2)}\n`);
      await writeFile(path.join(dir, "estimates.csv"), "term,estimate,p_value\nbmi,0.8,0.002\n");
      await writeFile(path.join(dir, "diagnostics.json"), `${JSON.stringify({ completeCaseN: 90 }, null, 2)}\n`);
      await writeFile(path.join(dir, "stats-report.md"), "# Stats Report\n\nLinear regression.\n");
      await writeFile(path.join(dir, "stats-qa.json"), `${JSON.stringify({
        schemaVersion: 1,
        status: "warning",
        summary: "Semantic plausibility requires unit or coding review.",
        checks: [
          { id: "analysis-semantic-plausibility", status: "warning", detail: "1 semantic plausibility issue was found in selected analysis variables: bmi (exposure; SEMANTIC_MEAN_ABOVE_EXPECTED)." },
          { id: "analysis-complete-case-retention", status: "pass", detail: "90 of 100 row(s) remain after requiring all selected analysis variables." },
          { id: "analysis-variable-missingness-burden", status: "pass", detail: "No selected required variable exceeds 20% missingness." },
          { id: "figure-manifest", status: "pass", detail: "Figure manifest was written." },
          { id: "method-contract-figure-coverage", status: "pass", detail: "Required figure families are represented." },
          { id: "execution-status", status: "pass", detail: "Stats runner completed." },
        ],
      }, null, 2)}\n`);
      await writeFile(path.join(dir, "stats-preflight.json"), `${JSON.stringify({
        schemaVersion: 1,
        statsPreflight: {
          status: "warning",
          method: "linear-regression",
          checks: [
            { id: "selected-variable-semantic-plausibility", status: "warning", detail: "1 semantic plausibility issue was found in selected analysis variables: bmi (exposure; SEMANTIC_MEAN_ABOVE_EXPECTED)." },
          ],
        },
      }, null, 2)}\n`);
      await writeFile(path.join(dir, "stats-preflight.md"), "# Stats Preflight\n\nSemantic plausibility review required.\n");
      await writeFile(path.join(dir, "method-decision-support.json"), `${JSON.stringify({
        schemaVersion: 1,
        methodDecisionSupport: {
          requestedMethod: "linear-regression",
          requestedRole: "primary",
          verdict: "preferred",
          primaryMethods: [{ method: "linear-regression", rationale: "Adjusted continuous-outcome model is data-shaped primary method." }],
          sensitivityMethods: [{ method: "robust-linear-regression", rationale: "Robust sensitivity." }],
          fallbackMethods: [],
          nextAction: "Proceed with local methods review.",
        },
      }, null, 2)}\n`);
      await writeFile(path.join(dir, "method-decision-support.md"), "# Method Decision\n\nLinear regression is preferred.\n");

      const manifest = await researchAnalysisManifestCommand({ runDir: dir });

      expect(manifest.qaReadiness).toMatchObject({
        status: "warning",
        warningChecks: ["analysis-semantic-plausibility"],
      });
      expect(manifest.readiness).toBe("exploratory_only");
      expect(manifest.nextAction).toContain("analysis-semantic-plausibility");
      await expect(researchAnalysisManifestCommand({ runDir: dir, requireReady: true })).rejects.toThrow(/semantic|plausibility|not local_review_ready/i);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("downgrades actual stats-run manifests when runner semantic plausibility warnings remain unresolved", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "agenteer-real-semantic-manifest-"));
    try {
      const dataPath = path.join(dir, "semantic-warning.csv");
      await writeFile(dataPath, [
        "outcome,bmi,age",
        ...Array.from({ length: 80 }, (_, index) => {
          const bmi = 61 + (index % 4) * 0.4;
          const age = 45 + (index % 20);
          const outcome = 4 + bmi * 0.15 + age * 0.02 + (index % 5) * 0.01;
          return `${outcome.toFixed(4)},${bmi.toFixed(2)},${age}`;
        }),
      ].join("\n"));
      const outDir = path.join(dir, "stats-run");

      const result = await researchStatsRunCommand({
        method: "linear-regression",
        dataPath,
        outDir,
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
      const qa = JSON.parse(await readFile(path.join(outDir, "stats-qa.json"), "utf-8")) as { status: string; checks: Array<{ id: string; status: string; detail: string }> };
      const manifest = await researchAnalysisManifestCommand({ runDir: outDir });

      expect(result.status).toBe("succeeded");
      expect(qa.status).toBe("warning");
      expect(qa.checks.find(check => check.id === "analysis-semantic-plausibility")).toMatchObject({
        status: "warning",
      });
      expect(manifest.qaReadiness.warningChecks).toContain("analysis-semantic-plausibility");
      expect(manifest.readiness).toBe("exploratory_only");
      expect(manifest.nextAction).toContain("analysis-semantic-plausibility");
      await expect(researchAnalysisManifestCommand({ runDir: outDir, requireReady: true })).rejects.toThrow(/semantic|plausibility|not local_review_ready/i);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("blocks actual stats-run manifests when semantic plausibility failures block execution", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "agenteer-real-semantic-blocked-manifest-"));
    try {
      const dataPath = path.join(dir, "semantic-blocked.csv");
      await writeFile(dataPath, [
        "outcome,bmi,age",
        ...Array.from({ length: 40 }, (_, index) => {
          const age = index === 0 ? 140 : 55 + (index % 20);
          const bmi = 65 + (index % 3);
          const outcome = 10 + index / 10;
          return `${outcome.toFixed(4)},${bmi},${age}`;
        }),
      ].join("\n"));
      const outDir = path.join(dir, "stats-run");

      const result = await researchStatsRunCommand({
        method: "linear-regression",
        dataPath,
        outDir,
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
      const qa = JSON.parse(await readFile(path.join(outDir, "stats-qa.json"), "utf-8")) as { status: string; checks: Array<{ id: string; status: string; detail: string }> };
      const manifest = await researchAnalysisManifestCommand({ runDir: outDir });

      expect(result.status).toBe("failed");
      expect(qa.status).toBe("fail");
      expect(qa.checks.find(check => check.id === "analysis-semantic-plausibility")).toMatchObject({
        status: "fail",
      });
      expect(manifest.qaReadiness).toMatchObject({
        status: "fail",
        failingChecks: expect.arrayContaining(["analysis-semantic-plausibility"]),
      });
      expect(manifest.readiness).toBe("blocked");
      await expect(researchAnalysisManifestCommand({ runDir: outDir, requireReady: true })).rejects.toThrow(/semantic|plausibility|stats QA|not local_review_ready/i);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("downgrades actual stats-run manifests when inferential sample support is weak", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "agenteer-real-support-manifest-"));
    try {
      const dataPath = path.join(dir, "weak-support.csv");
      await writeFile(dataPath, [
        "y,arm",
        ...Array.from({ length: 12 }, (_, index) => `${(3.0 + index * 0.08).toFixed(3)},control`),
        ...Array.from({ length: 12 }, (_, index) => `${(4.2 + index * 0.07).toFixed(3)},treated`),
      ].join("\n"));
      const outDir = path.join(dir, "stats-run");

      const result = await researchStatsRunCommand({
        method: "welch-t-test",
        dataPath,
        outDir,
        outcome: "y",
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
      const qa = JSON.parse(await readFile(path.join(outDir, "stats-qa.json"), "utf-8")) as { status: string; checks: Array<{ id: string; status: string; detail: string }> };
      const manifest = await researchAnalysisManifestCommand({ runDir: outDir });

      expect(result.status).toBe("succeeded");
      expect(result.resultPosture?.status).not.toBe("failed");
      expect(qa.status).toBe("warning");
      expect(qa.checks.find(check => check.id === "core-inference-sample-size")).toMatchObject({
        status: "warning",
      });
      expect(manifest.qaReadiness.warningChecks).toContain("core-inference-sample-size");
      expect(manifest.readiness).toBe("exploratory_only");
      expect(manifest.nextAction).toContain("core-inference-sample-size");
      await expect(researchAnalysisManifestCommand({ runDir: outDir, requireReady: true })).rejects.toThrow(/sample|support|not local_review_ready/i);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("downgrades actual stats-run manifests when the requested method is only a sensitivity route", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "agenteer-real-method-choice-manifest-"));
    try {
      const dataPath = path.join(dir, "skewed-two-group.csv");
      await writeFile(dataPath, [
        "outcome,group",
        ...Array.from({ length: 72 }, (_, index) => {
          const group = index < 36 ? "control" : "treated";
          const within = index % 36;
          const outcome = Math.exp(within / 7) + (group === "treated" ? 0.35 : 0) + (within % 3) * 0.01;
          return `${outcome.toFixed(6)},${group}`;
        }),
      ].join("\n"));
      const outDir = path.join(dir, "stats-run");

      const result = await researchStatsRunCommand({
        method: "welch-t-test",
        dataPath,
        outDir,
        outcome: "outcome",
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
      const qa = JSON.parse(await readFile(path.join(outDir, "stats-qa.json"), "utf-8")) as { status: string; checks: Array<{ id: string; status: string; detail: string }> };
      const manifest = await researchAnalysisManifestCommand({ runDir: outDir });

      expect(result.status).toBe("succeeded");
      expect(result.resultPosture).toMatchObject({
        status: "exploratory_standard_table",
        label: "Exploratory method-choice result",
      });
      expect(qa.checks).toEqual(expect.arrayContaining([
        expect.objectContaining({ id: "method-decision-alignment", status: "warning" }),
        expect.objectContaining({ id: "result-posture", status: "warning" }),
      ]));
      expect(manifest.methodDecisionReadiness).toMatchObject({
        status: "review_required",
        requestedMethod: "welch-t-test",
        requestedRole: "sensitivity",
        verdict: "acceptable_sensitivity",
        primaryMethods: expect.arrayContaining(["mann-whitney"]),
      });
      expect(manifest.methodDecisionEvidenceConsistency.status).toBe("pass");
      expect(manifest.readiness).toBe("exploratory_only");
      expect(manifest.nextAction).toMatch(/primary method|Preferred method|mann-whitney/i);
      await expect(researchAnalysisManifestCommand({ runDir: outDir, requireReady: true })).rejects.toThrow(/method|preferred|mann-whitney|not local_review_ready/i);
      const benchmark = await researchAnalysisBenchmarkCommand({ runDirs: [outDir] });
      expect(benchmark.checks).toEqual(expect.arrayContaining([
        expect.objectContaining({ id: "method-decision-readiness", status: "warning" }),
      ]));
      const inspection = await researchRunInspectCommand({ runDir: outDir });
      expect(inspection.readiness).toBe("needs_methods_review");
      expect(inspection.qa.methodDecisionReadinessStatus).toBe("review_required");
      expect(inspection.qa.methodDecisionRequestedMethod).toBe("welch-t-test");
      expect(inspection.warnings.join(" ")).toMatch(/method-selection|method-decision|Preferred method/i);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("downgrades analysis manifests when statistical support warnings remain unresolved", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "agenteer-manifest-support-qa-warning-"));
    try {
      await writeFile(path.join(dir, "stats-run.json"), `${JSON.stringify({
        schemaVersion: 1,
        status: "succeeded",
        method: "welch-t-test",
        resultPosture: {
          status: "bound_standard_table",
          interpretationBoundary: "Local standard-table group comparison.",
          nextAction: "Proceed to methods review.",
        },
        completeCaseN: 18,
        estimates: [{ term: "group", estimate: 1.1, ciLow: 0.1, ciHigh: 2.1, pValue: 0.04 }],
        diagnostics: {},
        runnerCapability: {
          method: "welch-t-test",
          status: "executable",
          reason: "Local fixture runner capability.",
        },
      }, null, 2)}\n`);
      await writeFile(path.join(dir, "method-contract.json"), `${JSON.stringify({ statisticalMethodSpec: { method: "welch-t-test" } }, null, 2)}\n`);
      await writeFile(path.join(dir, "stats-summary.json"), `${JSON.stringify({ completeCaseN: 18 }, null, 2)}\n`);
      await writeFile(path.join(dir, "estimates.csv"), "term,estimate,p_value\ngroup,1.1,0.04\n");
      await writeFile(path.join(dir, "diagnostics.json"), `${JSON.stringify({ completeCaseN: 18 }, null, 2)}\n`);
      await writeFile(path.join(dir, "stats-report.md"), "# Stats Report\n\nWelch comparison.\n");
      await writeFile(path.join(dir, "stats-qa.json"), `${JSON.stringify({
        schemaVersion: 1,
        status: "warning",
        summary: "Inferential support is weak.",
        checks: [
          { id: "core-inference-sample-size", status: "warning", detail: "18 complete row(s) were available for the inferential route." },
          { id: "analysis-semantic-plausibility", status: "pass", detail: "Selected variables passed semantic plausibility screening." },
          { id: "analysis-complete-case-retention", status: "pass", detail: "18 of 20 row(s) remain after requiring all selected analysis variables." },
          { id: "analysis-variable-missingness-burden", status: "pass", detail: "No selected required variable exceeds 20% missingness." },
          { id: "figure-manifest", status: "pass", detail: "Figure manifest was written." },
          { id: "method-contract-figure-coverage", status: "pass", detail: "Required figure families are represented." },
          { id: "execution-status", status: "pass", detail: "Stats runner completed." },
        ],
      }, null, 2)}\n`);
      await writeFile(path.join(dir, "stats-preflight.json"), `${JSON.stringify({ schemaVersion: 1, statsPreflight: { status: "pass", method: "welch-t-test", checks: [] } }, null, 2)}\n`);
      await writeFile(path.join(dir, "stats-preflight.md"), "# Stats Preflight\n\nPassed.\n");
      await writeFile(path.join(dir, "method-decision-support.json"), `${JSON.stringify({
        schemaVersion: 1,
        methodDecisionSupport: {
          requestedMethod: "welch-t-test",
          requestedRole: "primary",
          verdict: "preferred",
          primaryMethods: [{ method: "welch-t-test", rationale: "Unequal-variance comparison is the data-shaped primary method." }],
          sensitivityMethods: [{ method: "mann-whitney", rationale: "Rank-based sensitivity." }],
          fallbackMethods: [],
          nextAction: "Proceed with local methods review.",
        },
      }, null, 2)}\n`);
      await writeFile(path.join(dir, "method-decision-support.md"), "# Method Decision\n\nWelch is preferred.\n");

      const manifest = await researchAnalysisManifestCommand({ runDir: dir });

      expect(manifest.qaReadiness).toMatchObject({
        status: "warning",
        warningChecks: ["core-inference-sample-size"],
      });
      expect(manifest.readiness).toBe("exploratory_only");
      expect(manifest.nextAction).toContain("core-inference-sample-size");
      await expect(researchAnalysisManifestCommand({ runDir: dir, requireReady: true })).rejects.toThrow(/sample|support|not local_review_ready/i);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("downgrades analysis manifests when modeling-plan feasibility evidence has warnings", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "agenteer-manifest-feasibility-warning-"));
    try {
      const runDir = path.join(dir, "stats-run");
      await mkdir(runDir, { recursive: true });
      await writeFile(path.join(dir, "modeling-plan.json"), `${JSON.stringify({
        schemaVersion: 1,
        modelingPlan: {
          feasibilityEvidence: {
            source: "controller-feasibility",
            path: path.join(dir, "feasibility-gate.json"),
            verdict: "needs_data_profiling",
            status: "warning",
            score: 0.58,
            confidence: 0.82,
            blockers: [],
            warningsText: ["Complete-case support should be confirmed before promotion."],
            requiredModifications: ["Run missingness-summary before treating this as local-review-ready."],
            nextAction: "Resolve or explicitly accept feasibility warnings.",
          },
          statisticalMethodGuidance: {
            readiness: {
              requiredCompanionMethods: [],
              enforceCompanionReadiness: false,
            },
          },
        },
      }, null, 2)}\n`);
      await writeFile(path.join(dir, "feasibility-gate.json"), `${JSON.stringify({
        schemaVersion: 1,
        feasibilityGate: {
          verdict: "needs_data_profiling",
          status: "warning",
          score: 0.58,
          confidence: 0.82,
          blockers: [],
          warnings: ["Complete-case support should be confirmed before promotion."],
          requiredModifications: ["Run missingness-summary before treating this as local-review-ready."],
          nextAction: "Resolve or explicitly accept feasibility warnings.",
        },
      }, null, 2)}\n`);
      await writeFile(path.join(runDir, "stats-run.json"), `${JSON.stringify({
        schemaVersion: 1,
        status: "succeeded",
        method: "welch-t-test",
        resultPosture: {
          status: "bound_standard_table",
          interpretationBoundary: "Local standard-table group comparison.",
          nextAction: "Proceed to methods review.",
        },
        completeCaseN: 80,
        estimates: [{ term: "group", estimate: 3.1, ciLow: 2.3, ciHigh: 3.9, pValue: 0.001 }],
        diagnostics: {},
        runnerCapability: {
          method: "welch-t-test",
          status: "executable",
          reason: "Local fixture runner capability.",
        },
      }, null, 2)}\n`);
      await writeFile(path.join(runDir, "method-contract.json"), `${JSON.stringify({ statisticalMethodSpec: { method: "welch-t-test" } }, null, 2)}\n`);
      await writeFile(path.join(runDir, "stats-summary.json"), `${JSON.stringify({ completeCaseN: 80 }, null, 2)}\n`);
      await writeFile(path.join(runDir, "estimates.csv"), "term,estimate,p_value\ngroup,3.1,0.001\n");
      await writeFile(path.join(runDir, "diagnostics.json"), `${JSON.stringify({ completeCaseN: 80 }, null, 2)}\n`);
      await writeFile(path.join(runDir, "stats-report.md"), "# Stats Report\n\nWelch comparison.\n");
      await writeFile(path.join(runDir, "stats-qa.json"), `${JSON.stringify({ schemaVersion: 1, status: "pass", checks: [] }, null, 2)}\n`);
      await writeFile(path.join(runDir, "stats-preflight.json"), `${JSON.stringify({ schemaVersion: 1, statsPreflight: { status: "pass", method: "welch-t-test", checks: [] } }, null, 2)}\n`);
      await writeFile(path.join(runDir, "stats-preflight.md"), "# Stats Preflight\n\nPassed.\n");
      await writeFile(path.join(runDir, "method-decision-support.json"), `${JSON.stringify({
        schemaVersion: 1,
        methodDecisionSupport: {
          requestedMethod: "welch-t-test",
          requestedRole: "primary",
          verdict: "preferred",
          primaryMethods: [{ method: "welch-t-test", rationale: "Unequal-variance comparison is the data-shaped primary method." }],
          sensitivityMethods: [{ method: "mann-whitney", rationale: "Rank-based sensitivity." }],
          fallbackMethods: [{ method: "t-test", rationale: "Equal-variance fallback only." }],
          nextAction: "Proceed with local methods review.",
        },
      }, null, 2)}\n`);
      await writeFile(path.join(runDir, "method-decision-support.md"), "# Method Decision\n\nWelch is preferred.\n");

      const manifest = await researchAnalysisManifestCommand({ runDir });

      expect(manifest.feasibilityReadiness).toMatchObject({
        status: "warning",
        verdict: "needs_data_profiling",
        score: 0.58,
        warnings: ["Complete-case support should be confirmed before promotion."],
      });
      expect(manifest.artifacts.find(artifact => artifact.kind === "feasibility-gate")?.exists).toBe(true);
      expect(manifest.readiness).toBe("exploratory_only");
      expect(manifest.nextAction).toContain("Resolve or explicitly accept feasibility warning");
      expect(renderResearchAnalysisManifest(manifest)).toContain("feasibility: warning; verdict=needs_data_profiling");
      const inspection = await researchRunInspectCommand({ runDir });
      expect(inspection.readiness).toBe("needs_methods_review");
      expect(inspection.feasibilityReadiness).toMatchObject({
        status: "warning",
        verdict: "needs_data_profiling",
      });
      expect(inspection.warnings.join(" ")).toContain("Feasibility readiness has warnings");
      expect(renderResearchRunInspect(inspection)).toContain("feasibility: warning verdict=needs_data_profiling");
      await expect(researchAnalysisManifestCommand({ runDir, requireReady: true })).rejects.toThrow(/not local_review_ready/i);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("enforces model-diagnostics companions for high-burden bound regression plans", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "agenteer-regression-diagnostics-companion-"));
    try {
      const data = path.join(dir, "regression.csv");
      const selectionPath = path.join(dir, "method-selection.json");
      const analysisDir = path.join(dir, "bound-regression");
      await writeFile(data, highBurdenRegressionCsv());
      await writeFile(selectionPath, `${JSON.stringify({
        schemaVersion: 1,
        methodSelection: {
          selectionId: "linear-regression-selection",
          primary: {
            method: { id: "multiple-linear-regression" },
          },
        },
      }, null, 2)}\n`);

      const run = await researchAnalysisRunCommand({
        question: "Is x1 associated with y after adjustment for x2, x3, x4, and x5?",
        method: "linear-regression",
        dataPath: data,
        outcome: "y",
        exposure: "x1",
        covariates: ["x2", "x3", "x4", "x5"],
        methodSelectionPath: selectionPath,
        requireBound: true,
        outDir: analysisDir,
        python,
      });

      expect(run.statsRun.status).toBe("succeeded");
      expect(run.statsRun.resultPosture?.status).toBe("bound_standard_table");
      expect(run.modelingPlan.statisticalMethodGuidance.warnings.map(issue => issue.code)).toContain("METHOD_GUIDANCE_MODEL_DIAGNOSTICS_REQUIRED");
      expect(run.modelingPlan.statisticalMethodGuidance.readiness).toMatchObject({
        requiredCompanionMethods: expect.arrayContaining(["model-diagnostics"]),
        enforceCompanionReadiness: true,
      });
      expect(run.analysisRunManifest.readiness).toBe("exploratory_only");
      expect(run.analysisRunManifest.companionReadiness).toMatchObject({
        status: "missing",
        requiredMethods: expect.arrayContaining(["model-diagnostics"]),
        missingMethods: expect.arrayContaining(["model-diagnostics"]),
      });

      const diagnosticsRun = await researchStatsRunCommand({
        method: "model-diagnostics",
        dataPath: data,
        outcome: "y",
        exposure: "x1",
        covariates: ["x2", "x3", "x4", "x5"],
        variables: ["y", "x1", "x2", "x3", "x4", "x5"],
        outDir: path.join(analysisDir, "model-diagnostics-companion"),
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
      expect(diagnosticsRun.status).toBe("succeeded");
      expect(diagnosticsRun.diagnostics).toMatchObject({
        test: "model-diagnostics",
        diagnosed_model_family: "linear-regression",
        max_vif: expect.any(Number),
        max_cooks_distance: expect.any(Number),
        artifacts: expect.objectContaining({
          model_diagnostics: expect.stringContaining("model-diagnostics.csv"),
          residuals_table: expect.stringContaining("residuals.csv"),
          vif_table: expect.stringContaining("vif.csv"),
        }),
      });
      expect(diagnosticsRun.artifacts.map(artifact => artifact.kind)).toEqual(expect.arrayContaining(["model-diagnostics", "table", "figure"]));
      const diagnosticsCsv = await readFile(path.join(analysisDir, "model-diagnostics-companion", "model-diagnostics.csv"), "utf-8");
      expect(diagnosticsCsv).toContain("cooks_distance");
      expect(diagnosticsCsv).toContain("high_influence_flag");
      const vifCsv = await readFile(path.join(analysisDir, "model-diagnostics-companion", "vif.csv"), "utf-8");
      expect(vifCsv).toContain("vif");
      const satisfied = await researchAnalysisManifestCommand({ runDir: path.join(analysisDir, "stats-run") });

      expect(satisfied.readiness).toBe("local_review_ready");
      expect(satisfied.companionReadiness).toMatchObject({
        status: "satisfied",
        satisfiedMethods: expect.arrayContaining(["model-diagnostics"]),
        missingMethods: [],
      });
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }, mlIntegrationTestTimeout);

  it("downgrades bound analysis manifests when required companion methods are missing", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "agenteer-analysis-companion-gate-"));
    try {
      const data = path.join(dir, "stats.csv");
      const selectionPath = path.join(dir, "method-selection.json");
      const analysisDir = path.join(dir, "bound");
      await writeFile(data, statsCsv());
      await researchMethodSelectCommand({
        question: "Use Welch unequal-variance comparison for mean HbA1c by group",
        goal: "compare_groups",
        outcomeType: "continuous",
        dataStructures: ["single_table"],
        outPath: selectionPath,
      });
      await researchAnalysisRunCommand({
        question: "Do groups differ in HbA1c?",
        method: "welch-t-test",
        dataPath: data,
        outcome: "hba1c",
        group: "group",
        methodSelectionPath: selectionPath,
        requireBound: true,
        outDir: analysisDir,
        python,
      });
      const modelingPlanPath = path.join(analysisDir, "modeling-plan.json");
      const modelingEnvelope = JSON.parse(await readFile(modelingPlanPath, "utf-8")) as { modelingPlan: { statisticalMethodGuidance: { readiness: { requiredCompanionMethods: string[]; enforceCompanionReadiness?: boolean } } } };
      modelingEnvelope.modelingPlan.statisticalMethodGuidance.readiness.requiredCompanionMethods = ["power-sample-size"];
      modelingEnvelope.modelingPlan.statisticalMethodGuidance.readiness.enforceCompanionReadiness = true;
      await writeFile(modelingPlanPath, `${JSON.stringify(modelingEnvelope, null, 2)}\n`);

      const missing = await researchAnalysisManifestCommand({ runDir: path.join(analysisDir, "stats-run") });
      expect(missing.readiness).toBe("exploratory_only");
      expect(missing.companionReadiness).toMatchObject({
        status: "missing",
        requiredMethods: ["power-sample-size"],
        missingMethods: ["power-sample-size"],
      });
      expect(missing.nextAction).toContain("power-sample-size");

      await researchStatsRunCommand({
        method: "power-sample-size",
        dataPath: data,
        outDir: path.join(analysisDir, "power-companion"),
        variables: ["hba1c"],
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
      const satisfied = await researchAnalysisManifestCommand({ runDir: path.join(analysisDir, "stats-run") });
      expect(satisfied.readiness).toBe("local_review_ready");
      expect(satisfied.companionReadiness).toMatchObject({
        status: "satisfied",
        requiredMethods: ["power-sample-size"],
        satisfiedMethods: ["power-sample-size"],
        missingMethods: [],
      });
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }, mlIntegrationTestTimeout);

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
  }, mlIntegrationTestTimeout);

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
      const equalVarianceSelection = await researchMethodSelectCommand({
        question: "Use an equal-variance pooled Student t-test to compare mean HbA1c between two independent groups",
        goal: "compare_groups",
        outcomeType: "continuous",
        dataStructures: ["single_table"],
      });
      const bound = await researchStatsRunCommand({
        method: "welch-t-test",
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

      expect(selection.primary?.method.id).toBe("welch-t-test");
      expect(selection.primary?.fitReasons).toContain("Welch is the default independent two-group mean comparison unless equal variances are justified");
      expect(equalVarianceSelection.primary?.method.id).toBe("two-sample-t-test");
      expect(bound.status).toBe("succeeded");
      expect(bound.binding.status).toBe("bound");
      expect(bound.resultPosture?.status).toBe("bound_standard_table");
      expect(bound.binding.methodSelectionId).toBe(selection.selectionId);
      expect(bound.binding.methodId).toBe("welch-t-test");
      expect(mismatch.status).toBe("failed");
      expect(mismatch.binding.status).toBe("mismatch");
      expect(mismatch.resultPosture?.status).toBe("invalid_binding");
      expect(mismatch.issues.map(issue => issue.code)).toContain("METHOD_SELECTION_STATS_MISMATCH");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }, mlIntegrationTestTimeout);
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

function highBurdenRegressionCsv(): string {
  const rows = ["y,x1,x2,x3,x4,x5"];
  for (let i = 0; i < 180; i++) {
    const x1 = (i % 17) / 3;
    const x2 = ((i * 3) % 19) / 4;
    const x3 = (i % 5 === 0 ? 1 : 0);
    const x4 = ((i * 7) % 23) / 5;
    const x5 = ((i * 11) % 29) / 6;
    const y = 4 + 0.6 * x1 - 0.35 * x2 + 0.8 * x3 + 0.15 * x4 - 0.1 * x5 + (i % 9) * 0.03;
    rows.push([y, x1, x2, x3, x4, x5].map(value => value.toFixed(4)).join(","));
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
    const elevated = hba1c >= 6.2 ? 1 : 0;
    rows.push(`${age},${sex},${bmi.toFixed(2)},${group},${hba1c.toFixed(3)},${elevated}`);
  }
  return `${rows.join("\n")}\n`;
}

function statsCsvWithMissingness(): string {
  const rows = ["age,sex,bmi,group,hba1c,elevated"];
  for (let i = 0; i < 140; i++) {
    const age = 30 + (i % 45);
    const sex = i % 2 === 0 ? "F" : "M";
    const bmi = 20 + (i % 40) * 0.55;
    const group = bmi >= 31 ? "high" : "low";
    const hba1c = 4.8 + bmi * 0.045 + age * 0.006 + (sex === "M" ? 0.08 : 0);
    const elevated = hba1c >= 6.2 ? 1 : 0;
    const observedHba1c = i % 11 === 0 ? "" : hba1c.toFixed(3);
    const observedBmi = i % 17 === 0 ? "" : bmi.toFixed(2);
    rows.push(`${age},${sex},${observedBmi},${group},${observedHba1c},${elevated}`);
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
