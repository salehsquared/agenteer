import { createHash } from "node:crypto";
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  renderResearchPacketCritique,
  renderResearchPacketInspect,
  renderResearchQuestions,
  renderResearchScoutPlan,
  renderResearchApproval,
  renderResearchApprovalVerification,
  renderResearchApprovalVerificationJson,
  renderResearchAnalysisResult,
  renderResearchArtifactManifest,
  renderResearchArtifactManifestJson,
  renderResearchManifestVerification,
  renderResearchManifestVerificationJson,
  renderResearchLoopStatus,
  renderResearchLoopStatusJson,
  renderResearchLoopNote,
  renderResearchLoopNoteJson,
  renderResearchCycleAudit,
  renderResearchCycleAuditJson,
  renderResearchRunnerSpec,
  renderResearchPacketExport,
  renderResearchPacketSummary,
  renderResearchPacketSummaryJson,
  renderResearchPacketNext,
  renderResearchPacketNextJson,
  renderResearchNavigationTrace,
  renderResearchNavigationTraceJson,
  renderResearchPacketVerification,
  renderResearchPacketVerificationJson,
  renderResearchPacketReadiness,
  renderResearchPacketReadinessJson,
  renderResearchMethodsFramework,
  renderResearchMethodsFrameworkJson,
  renderResearchMethodsValidation,
  renderResearchMethodsValidationJson,
  renderResearchRegistryInspect,
  renderResearchRegistryInspectJson,
  renderResearchQuestionDecomposition,
  renderResearchQuestionDecompositionJson,
  renderResearchClarificationPlan,
  renderResearchClarificationPlanJson,
  renderResearchDataQuality,
  renderResearchDataQualityJson,
  renderResearchMethodSelection,
  renderResearchMethodSelectionJson,
  renderResearchRoCrate,
  renderResearchRoCrateJson,
  renderResearchProvenance,
  renderResearchProvenanceJson,
  renderResearchQaDashboard,
  renderResearchQaDashboardJson,
  renderResearchSuppressionPolicy,
  renderResearchSuppressionPolicyJson,
  renderResearchRegistrySearch,
  renderResearchRegistrySearchJson,
  renderResearchEstimandSketch,
  renderResearchEstimandSketchJson,
  renderResearchStudySimulation,
  renderResearchStudySimulationJson,
  renderResearchRealStudyReadiness,
  renderResearchRealStudyReadinessJson,
  renderResearchDataAccessManifest,
  renderResearchDataAccessManifestJson,
  renderResearchDataAccessRedaction,
  renderResearchDataAccessRedactionJson,
  renderResearchRealLocalRunnerSpec,
  renderResearchRealLocalRunnerSpecJson,
  renderResearchRealStudyChecklist,
  renderResearchRealStudyChecklistJson,
  renderResearchAdapterGapReport,
  renderResearchAdapterGapReportJson,
  renderResearchVariableMap,
  renderResearchVariableMapJson,
  renderResearchVariableMapSuggestion,
  renderResearchVariableMapSuggestionJson,
  renderResearchVariableMapApplyResult,
  renderResearchVariableMapApplyResultJson,
  renderResearchWorkflowScorecard,
  renderResearchWorkflowScorecardJson,
  renderResearchEvidenceGapReport,
  renderResearchEvidenceGapReportJson,
  renderResearchPacketDiff,
  renderResearchPacketDiffJson,
  renderResearchNodeProposal,
  renderResearchNodeProposalJson,
  renderResearchNodeProposalRegistry,
  renderResearchNodeProposalRegistryJson,
  renderResearchCostLedger,
  renderResearchCostLedgerJson,
  renderResearchQuestionBank,
  renderResearchQuestionBankJson,
  renderResearchQuestionReadiness,
  renderResearchQuestionReadinessJson,
  renderResearchProtocolCandidates,
  renderResearchProtocolCandidatesJson,
  renderResearchProtocolSteer,
  renderResearchProtocolSteerJson,
  renderResearchProtocolPromotion,
  renderResearchProtocolPromotionJson,
  renderResearchProtocolEdit,
  renderResearchProtocolEditJson,
  renderResearchAnalysisSpec,
  renderResearchAnalysisSpecJson,
  renderResearchCohortScoutFile,
  renderResearchCohortScoutFileJson,
  renderResearchSemanticQuality,
  renderResearchSemanticQualityJson,
  renderResearchProgress,
  renderResearchProgressJson,
  renderResearchJobLifecycle,
  renderResearchJobLifecycleJson,
  renderResearchRepairPlan,
  renderResearchRepairPlanJson,
  renderResearchAgentExecutionRecord,
  renderResearchAgentExecutionRecordJson,
  renderResearchWorkflowMemory,
  renderResearchWorkflowMemoryJson,
  renderResearchUncertaintyBudget,
  renderResearchUncertaintyBudgetJson,
  renderResearchDatasetCandidate,
  renderResearchDatasetCandidateJson,
  renderResearchImprovementAgenda,
  renderResearchImprovementAgendaJson,
  renderResearchClaimGuard,
  renderResearchClaimGuardJson,
  renderResearchBackendStatus,
  renderResearchBackendStatusJson,
  renderResearchPaperIndex,
  renderResearchPaperIndexJson,
  renderResearchPaperLifecycle,
  renderResearchPaperLifecycleJson,
  renderResearchPaperQa,
  renderResearchPaperQaJson,
  renderResearchPaperRunnerRecord,
  renderResearchPaperRunnerRecordJson,
  renderResearchBenchmark,
  renderResearchBenchmarkJson,
  renderResearchBenchmarkRun,
  renderResearchBenchmarkRunJson,
  renderResearchBenchmarkScore,
  renderResearchBenchmarkScoreJson,
  renderResearchBenchmarkSuite,
  renderResearchBenchmarkSuiteJson,
  renderResearchTableSummary,
  renderResearchTableSummaryJson,
  renderResearchSchemaInference,
  renderResearchSchemaInferenceJson,
  renderResearchPipelineStages,
  renderResearchPipelineStagesJson,
  renderResearchStageArtifacts,
  renderResearchStageArtifactsJson,
  renderResearchStageGate,
  renderResearchStageGateJson,
  renderResearchCheckpoint,
  renderResearchCheckpointJson,
  renderResearchReportReview,
  renderResearchReportReviewJson,
  researchAnalyzeLocalCommand,
  researchArtifactManifestCommand,
  researchManifestVerifyCommand,
  researchApprovalVerifyCommand,
  researchLoopStatusCommand,
  researchLoopNoteCommand,
  researchCycleAuditCommand,
  researchRunnerSpecCommand,
  researchExportPacketCommand,
  researchPacketSummaryCommand,
  researchPacketNextCommand,
  researchNavigationTraceCommand,
  researchPacketVerifyCommand,
  researchPacketReadinessCommand,
  researchMethodsFrameworkCommand,
  researchValidateMethodsCommand,
  researchRegistryInspectCommand,
  researchDecomposeQuestionCommand,
  researchClarificationPlanCommand,
  researchDataQualityCommand,
  researchSelectMethodCommand,
  researchRoCrateCommand,
  researchProvenanceCommand,
  researchQaDashboardCommand,
  researchSuppressionPolicyCommand,
  researchRegistrySearchCommand,
  researchEstimandSketchCommand,
  researchSimulateStudyCommand,
  researchRealStudyReadinessCommand,
  researchDataAccessManifestCommand,
  researchDataAccessRedactCommand,
  researchRealLocalRunnerSpecCommand,
  researchRealStudyChecklistCommand,
  researchAdapterGapReportCommand,
  researchVariableMapCommand,
  researchSuggestVariableMapCommand,
  researchApplyVariableMapSuggestionsCommand,
  researchWorkflowScorecardCommand,
  researchEvidenceGapReportCommand,
  researchPacketDiffCommand,
  researchNodeProposalCommand,
  researchNodeProposalRegistryCommand,
  researchCostLedgerCommand,
  researchQuestionBankCommand,
  researchQuestionReadinessCommand,
  researchProtocolCandidatesCommand,
  researchProtocolSteerCommand,
  researchProtocolPromoteCommand,
  researchProtocolEditCommand,
  researchAnalysisSpecCommand,
  researchCohortScoutFileCommand,
  researchSemanticQualityCommand,
  researchProgressCommand,
  researchJobLifecycleCommand,
  researchRepairPlanCommand,
  researchAgentExecutionRecordCommand,
  researchWorkflowMemoryCommand,
  researchUncertaintyBudgetCommand,
  researchDatasetCandidateCommand,
  researchImprovementAgendaCommand,
  researchClaimGuardCommand,
  researchBackendStatusCommand,
  researchPaperIndexCommand,
  researchPaperLifecycleCommand,
  researchPaperQaCommand,
  researchPaperRerunStabilityCommand,
  researchPaperRunnerRecordCommand,
  researchBenchmarkRegisterCommand,
  researchBenchmarkRunCommand,
  researchBenchmarkScoreCommand,
  researchBenchmarkSuiteCommand,
  researchTableSummaryCommand,
  researchInferSchemaCommand,
  researchPipelineStagesCommand,
  researchStageArtifactsCommand,
  researchStageGateCommand,
  researchApprovePacketCommand,
  researchCheckpointCommand,
  researchCritiquePacketCommand,
  researchDesignCommand,
  researchInspectPacketCommand,
  researchQuestionsCommand,
  researchReviewReportCommand,
  researchScoutPlanCommand,
} from "../src/commands/research.js";

describe("researchDesignCommand", () => {
  it("routes medbrevia-nhanes design through the research CLI surface", async () => {
    const repo = await makeRepo();
    try {
      const result = await researchDesignCommand({
        project: "medbrevia-nhanes",
        repoDir: repo,
        question: "Vitamin D deficiency and measured hypertension in NHANES adults",
      });

      expect(result.protocol.exposure.variables).toContain("LBXVIDMS");
      expect(result.protocol.endpoint.variables).toContain("BPXSY1");
      expect(result.commandLineProduct.proposedCommands[0]).toContain("agenteer research design");
    } finally {
      await rm(repo, { recursive: true, force: true });
    }
  });

  it("generates question candidates from available registry domains", async () => {
    const repo = await makeRepo();
    try {
      const questions = await researchQuestionsCommand({
        project: "medbrevia-nhanes",
        repoDir: repo,
      });

      expect(questions.map(q => q.id)).toContain("vitd-hypertension");
      expect(renderResearchQuestions(questions)).toContain("Research question candidates");
    } finally {
      await rm(repo, { recursive: true, force: true });
    }
  });

  it("reports local analysis backend readiness without requiring real runtimes in tests", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "research-backend-status-"));
    try {
      const fakePython = path.join(dir, "fake-python");
      const fakeRscript = path.join(dir, "fake-Rscript");
      await writeFile(fakePython, `#!/bin/sh
cat <<'JSON'
{"version":"3.12.0","packages":{"numpy":"2.0.0","pandas":"2.2.0","pyarrow":"16.0.0","statsmodels":"0.14.0","duckdb":"1.0.0","polars":"1.0.0"}}
JSON
`);
      await writeFile(fakeRscript, `#!/bin/sh
cat <<'JSON'
{"version":"4.4.0","packages":{"survey":"4.4","srvyr":"1.2","gtsummary":"2.0","arrow":"16.0","jsonlite":"1.8","dplyr":"1.1","broom":"1.0"}}
JSON
`);
      await chmod(fakePython, 0o755);
      await chmod(fakeRscript, 0o755);

      const status = await researchBackendStatusCommand({ python: fakePython, rscript: fakeRscript });
      const parsed = JSON.parse(renderResearchBackendStatusJson(status)) as {
        backendStatus: { backends: Array<{ id: string; status: string }> };
      };

      expect(status.backends.map(backend => backend.status)).toEqual(["available", "available", "available"]);
      expect(status.recommendedDefault).toContain("r-survey");
      expect(renderResearchBackendStatus(status)).toContain("duckdb-polars");
      expect(parsed.backendStatus.backends.find(backend => backend.id === "r-survey")?.status).toBe("available");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("reports missing optional analysis backends as status instead of throwing", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "research-backend-missing-"));
    try {
      const status = await researchBackendStatusCommand({
        python: path.join(dir, "missing-python"),
        rscript: path.join(dir, "missing-Rscript"),
      });

      expect(status.backends.map(backend => backend.status)).toEqual(["missing", "missing", "missing"]);
      expect(status.nextAction).toContain("Install");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("inspects generic dataset registries without NHANES-specific paths", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "research-generic-registry-"));
    const registryPath = path.join(dir, "registry.json");
    try {
      await writeFile(registryPath, `${JSON.stringify({
        dataset: "hospital-registry",
        cycles: [{ id: "2024" }],
        domains: { demographics: {}, labs: {} },
        variables: [
          { name: "AGE", domain: "demographics" },
          { name: "A1C", domain: "labs" },
        ],
        weightRules: [],
      }, null, 2)}\n`);

      const inspected = await researchRegistryInspectCommand(registryPath);
      const parsed = JSON.parse(renderResearchRegistryInspectJson(inspected)) as {
        schemaVersion: number;
        registry: { dataset: string; variableCount: number };
      };

      expect(inspected.dataset).toBe("hospital-registry");
      expect(inspected.variableCount).toBe(2);
      expect(inspected.warnings.map(issue => issue.code)).toContain("NO_WEIGHT_RULES");
      expect(renderResearchRegistryInspect(inspected)).toContain("research registry inspect");
      expect(parsed.schemaVersion).toBe(1);
      expect(parsed.registry.variableCount).toBe(2);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("searches registry variables by query terms", async () => {
    const repo = await makeRepo();
    const registryPath = path.join(repo, "data", "analytics", "nhanes", "registry.json");
    try {
      const result = await researchRegistrySearchCommand(registryPath, "blood pressure");
      const parsed = JSON.parse(renderResearchRegistrySearchJson(result)) as {
        schemaVersion: number;
        registrySearch: { matches: Array<{ name: string }> };
      };

      expect(result.matches.map(match => match.name)).toEqual(expect.arrayContaining(["BPXSY1", "BPXDI1"]));
      expect(renderResearchRegistrySearch(result)).toContain("research registry search");
      expect(parsed.schemaVersion).toBe(1);
    } finally {
      await rm(repo, { recursive: true, force: true });
    }
  });

  it("decomposes research questions before protocol design", () => {
    const result = researchDecomposeQuestionCommand("Among adults with diabetes, is medication adherence associated with hospitalization differently by sex?");
    const parsed = JSON.parse(renderResearchQuestionDecompositionJson(result)) as {
      schemaVersion: number;
      decomposition: { intent: string; requiredMethods: string[] };
    };

    expect(result.intent).toBe("association");
    expect(result.population).toBe("adults with diabetes");
    expect(result.exposureOrPredictor).toBe("medication adherence");
    expect(result.outcome).toBe("hospitalization");
    expect(result.stratifierOrModifier).toBe("sex");
    expect(result.requiredMethods).toContain("strobe");
    expect(renderResearchQuestionDecomposition(result)).toContain("research question decomposition");
    expect(parsed.schemaVersion).toBe(1);
  });

  it("decomposes plural exposure association questions", () => {
    const result = researchDecomposeQuestionCommand("Among adults, are self-reported sleep problems associated with measured hypertension in survey data?");

    expect(result.exposureOrPredictor).toBe("self-reported sleep problems");
    expect(result.outcome).toBe("measured hypertension");
    expect(result.clarificationPrompts).not.toContain("Specify the primary exposure, predictor, or grouping variable.");
  });

  it("separates explicit comparators from exposure phrases", () => {
    const result = researchDecomposeQuestionCommand("Among adults with hypertension, are home blood pressure monitors versus usual care associated with better blood pressure control?");
    const estimand = researchEstimandSketchCommand("Among adults with hypertension, are home blood pressure monitors versus usual care associated with better blood pressure control?");

    expect(result.exposureOrPredictor).toBe("home blood pressure monitors");
    expect(result.comparatorOrReference).toBe("usual care");
    expect(estimand.contrast).toBe("home blood pressure monitors versus usual care");
    expect(renderResearchQuestionDecomposition(result)).toContain("comparator/reference: usual care");
  });

  it("extracts temporal constraints from cohort and outcome phrasing", () => {
    const result = researchDecomposeQuestionCommand("Among adults diagnosed with diabetes before 2010, is baseline A1c associated with kidney disease within five years?");
    const estimand = researchEstimandSketchCommand("Among adults diagnosed with diabetes before 2010, is baseline A1c associated with kidney disease within five years?");

    expect(result.temporalConstraints).toEqual(expect.arrayContaining(["baseline", "before 2010", "within five years"]));
    expect(estimand.temporalConstraints).toEqual(expect.arrayContaining(["baseline", "before 2010", "within five years"]));
    expect(renderResearchEstimandSketch(estimand)).toContain("temporal constraints:");
  });

  it("separates adjustment covariates from temporal constraints", () => {
    const result = researchDecomposeQuestionCommand("Among adults, is dietary sodium associated with systolic blood pressure after adjusting for age, sex, and BMI?");
    const estimand = researchEstimandSketchCommand("Among adults, is dietary sodium associated with systolic blood pressure after adjusting for age, sex, and BMI?");

    expect(result.outcome).toBe("systolic blood pressure");
    expect(result.temporalConstraints).toEqual([]);
    expect(result.adjustmentCovariates).toEqual(["age", "sex", "BMI"]);
    expect(estimand.adjustmentCovariates).toEqual(["age", "sex", "BMI"]);
    expect(renderResearchQuestionDecomposition(result)).toContain("adjustment covariates: age, sex, BMI");
  });

  it("keeps modifiers separate from later adjustment clauses", () => {
    const result = researchDecomposeQuestionCommand("Among adults, is physical activity associated with depressive symptoms differently by sex after adjusting for age and income?");

    expect(result.stratifierOrModifier).toBe("sex");
    expect(result.adjustmentCovariates).toEqual(["age", "income"]);
    expect(result.clarificationPrompts).toContain("Clarify whether the modifier is for stratification, interaction testing, or adjustment.");
  });

  it("adds target-trial clarification for causal questions", () => {
    const result = researchDecomposeQuestionCommand("What is the effect of beta blockers on mortality among adults with heart failure?");

    expect(result.intent).toBe("causal");
    expect(result.requiredMethods).toContain("target-trial-emulation");
    expect(result.clarificationPrompts).toContain("Specify target-trial components before using causal language.");
  });

  it("creates a clarification plan from decomposition gaps", () => {
    const plan = researchClarificationPlanCommand("Does exposure improve outcomes?");
    const parsed = JSON.parse(renderResearchClarificationPlanJson(plan)) as {
      schemaVersion: number;
      clarificationPlan: { status: string; items: Array<{ priority: string }> };
    };

    expect(plan.status).toBe("needs_clarification");
    expect(plan.items.some(item => item.priority === "required")).toBe(true);
    expect(plan.items.map(item => item.prompt)).toEqual(expect.arrayContaining([
      "Specify the target population and eligibility criteria.",
      "Specify target-trial components before using causal language.",
    ]));
    expect(renderResearchClarificationPlan(plan)).toContain("research clarification plan");
    expect(parsed.schemaVersion).toBe(1);
  });

  it("profiles fixture data quality before analysis", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "research-data-quality-"));
    const fixture = path.join(dir, "rows.json");
    try {
      await writeFile(fixture, `${JSON.stringify([
        { AGE: 44, SEX: 1, EXPOSURE: 1, OUTCOME: 0 },
        { AGE: null, SEX: 2, EXPOSURE: 9, OUTCOME: 1 },
        { AGE: "", SEX: 9, EXPOSURE: 2, OUTCOME: 1 },
      ], null, 2)}\n`);

      const profile = await researchDataQualityCommand(fixture);
      const parsed = JSON.parse(renderResearchDataQualityJson(profile)) as {
        schemaVersion: number;
        dataQuality: { rowCount: number; variableCount: number };
      };

      expect(profile.rowCount).toBe(3);
      expect(profile.variables.find(variable => variable.name === "AGE")?.missing).toBe(2);
      expect(profile.variables.find(variable => variable.name === "EXPOSURE")?.codedUnknown).toBe(1);
      expect(profile.warnings.map(issue => issue.code)).toEqual(expect.arrayContaining(["HIGH_MISSINGNESS", "CODED_UNKNOWN_VALUES"]));
      expect(renderResearchDataQuality(profile)).toContain("research data quality");
      expect(parsed.schemaVersion).toBe(1);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("selects statistical method families from question intent", () => {
    const selection = researchSelectMethodCommand("Among adults, is self-reported hypertension associated with measured hypertension?");
    const parsed = JSON.parse(renderResearchMethodSelectionJson(selection)) as {
      schemaVersion: number;
      methodSelection: { recommendedAnalysis: string; requiredChecks: string[] };
    };

    expect(selection.intent).toBe("diagnostic");
    expect(selection.recommendedAnalysis).toBe("diagnostic_accuracy_table");
    expect(selection.requiredChecks).toContain("sensitivity_specificity_ppv_npv");
    expect(renderResearchMethodSelection(selection)).toContain("research method selection");
    expect(parsed.schemaVersion).toBe(1);
  });

  it("renders reusable research pipeline stages", () => {
    const stages = researchPipelineStagesCommand();

    expect(stages.map(stage => stage.id)).toEqual([
      "design",
      "critique",
      "methods-validation",
      "scout",
      "data-quality",
      "runner-spec",
      "approval",
      "analysis",
      "report-review",
      "manifest",
      "ro-crate",
      "provenance",
      "export",
      "qa-dashboard",
    ]);
    expect(renderResearchPipelineStages(stages)).toContain("@agenteer/node-research-protocol-design");
    expect(stages.find(stage => stage.id === "approval")?.humanReview).toBe(true);
    expect(stages.find(stage => stage.id === "analysis")?.mode).toBe("executable");
    expect(stages.find(stage => stage.id === "approval")?.requiredBefore).toContain("analysis");
    expect(renderResearchPipelineStages(stages)).toContain("mode: executable");
  });

  it("exposes reusable research stage artifact definitions", () => {
    const artifacts = researchStageArtifactsCommand();
    const parsed = JSON.parse(renderResearchStageArtifactsJson(artifacts)) as {
      schemaVersion: number;
      stageArtifacts: Array<{ stage: string; fileName: string; required: boolean }>;
    };

    expect(artifacts.find(artifact => artifact.stage === "design")?.fileName).toBe("design.json");
    expect(artifacts.find(artifact => artifact.stage === "provenance")?.fileName).toBe("provenance.json");
    expect(renderResearchStageArtifacts(artifacts)).toContain("research stage artifacts");
    expect(parsed.schemaVersion).toBe(1);
    expect(parsed.stageArtifacts.find(artifact => artifact.stage === "approval")?.required).toBe(true);
  });

  it("keeps provenance naming consistent across stage artifacts, QA, and readiness", async () => {
    const packetDir = await mkdtemp(path.join(os.tmpdir(), "research-provenance-drift-"));
    try {
      await writeFile(path.join(packetDir, "design.json"), "{}\n");
      await writeFile(path.join(packetDir, "provenance.json"), "{}\n");

      const stageArtifact = researchStageArtifactsCommand().find(artifact => artifact.stage === "provenance");
      const qa = await researchQaDashboardCommand(packetDir);
      const readiness = await researchPacketReadinessCommand(packetDir);

      expect(stageArtifact?.fileName).toBe("provenance.json");
      expect(qa.checks.find(check => check.id === "provenance")?.status).toBe("pass");
      expect(readiness.components.find(component => component.id === "provenance")?.status).toBe("pass");
    } finally {
      await rm(packetDir, { recursive: true, force: true });
    }
  });

  it("gates research stages before executable analysis", () => {
    const blocked = researchStageGateCommand(["design", "critique"], "analysis");
    const passed = researchStageGateCommand(["design", "critique", "methods-validation", "scout", "data-quality", "runner-spec", "approval"], "analysis");
    const parsed = JSON.parse(renderResearchStageGateJson(blocked)) as {
      schemaVersion: number;
      stageGate: { status: string; missingRequiredStages: string[] };
    };

    expect(blocked.status).toBe("blocked");
    expect(blocked.missingRequiredStages).toEqual(expect.arrayContaining(["methods-validation", "scout", "data-quality", "runner-spec", "approval"]));
    expect(passed.status).toBe("pass");
    expect(renderResearchStageGate(blocked)).toContain("research stage gate: blocked");
    expect(parsed.schemaVersion).toBe(1);
  });

  it("evaluates small-count suppression policy", () => {
    const suppressed = researchSuppressionPolicyCommand(7);
    const displayed = researchSuppressionPolicyCommand(20);

    expect(suppressed.status).toBe("suppress");
    expect(displayed.status).toBe("display");
    expect(renderResearchSuppressionPolicy(suppressed)).toContain("status: suppress");
    expect(JSON.parse(renderResearchSuppressionPolicyJson(suppressed)).schemaVersion).toBe(1);
  });

  it("sketches estimands from research question intent", () => {
    const causal = researchEstimandSketchCommand("What is the effect of beta blockers on mortality among adults with heart failure?");
    const diagnostic = researchEstimandSketchCommand("Among adults, is self-reported hypertension associated with measured hypertension?");

    expect(causal.intent).toBe("causal");
    expect(causal.targetQuantity).toContain("causal effect");
    expect(causal.requiredAssumptions).toContain("exchangeability/positivity/consistency");
    expect(diagnostic.intent).toBe("diagnostic");
    expect(diagnostic.targetQuantity).toContain("diagnostic accuracy");
    expect(renderResearchEstimandSketch(causal)).toContain("research estimand sketch");
    expect(JSON.parse(renderResearchEstimandSketchJson(causal)).schemaVersion).toBe(1);
  });

  it("runs a complete synthetic study simulation from a realistic question", async () => {
    const repo = await makeRepo();
    const outDir = await mkdtemp(path.join(os.tmpdir(), "research-simulated-study-"));
    try {
      const result = await researchSimulateStudyCommand({
        project: "medbrevia-nhanes",
        repoDir: repo,
        question: "Among NHANES adults, is self-reported high blood pressure associated with measured hypertension?",
        outDir,
      });
      const parsed = JSON.parse(renderResearchStudySimulationJson(result)) as {
        schemaVersion: number;
        studySimulation: { completedStages: string[] };
      };

      expect(result.completedStages).toEqual(expect.arrayContaining([
        "design",
        "analysis",
        "ro-crate",
        "provenance",
        "qa-dashboard",
      ]));
      expect(result.qaStatus).not.toBe("blocked");
      expect(renderResearchStudySimulation(result)).toContain("research study simulation");
      expect(parsed.schemaVersion).toBe(1);
    } finally {
      await rm(repo, { recursive: true, force: true });
      await rm(outDir, { recursive: true, force: true });
    }
  });

  it("distinguishes synthetic packets from real-study readiness", async () => {
    const repo = await makeRepo();
    const outDir = await mkdtemp(path.join(os.tmpdir(), "research-real-readiness-"));
    try {
      await researchSimulateStudyCommand({
        project: "medbrevia-nhanes",
        repoDir: repo,
        question: "Among NHANES adults, is self-reported high blood pressure associated with measured hypertension?",
        outDir,
      });

      const readiness = await researchRealStudyReadinessCommand(outDir);
      const parsed = JSON.parse(renderResearchRealStudyReadinessJson(readiness)) as {
        schemaVersion: number;
        realStudyReadiness: { status: string };
      };

      expect(readiness.status).toBe("not_ready");
      expect(readiness.requirements.find(requirement => requirement.id === "real-data-runner")?.status).toBe("missing");
      expect(renderResearchRealStudyReadiness(readiness)).toContain("research real-study readiness");
      expect(parsed.schemaVersion).toBe(1);
    } finally {
      await rm(repo, { recursive: true, force: true });
      await rm(outDir, { recursive: true, force: true });
    }
  });

  it("recognizes data-access and real-runner specs as real-study readiness progress", async () => {
    const repo = await makeRepo();
    const outDir = await mkdtemp(path.join(os.tmpdir(), "research-real-ready-"));
    const dataFile = path.join(outDir, "rows.json");
    try {
      await researchDesignCommand({
        project: "medbrevia-nhanes",
        repoDir: repo,
        question: "Vitamin D deficiency and measured hypertension in NHANES adults",
        outDir,
      });
      await writeFile(dataFile, "[]\n");
      await researchDataAccessManifestCommand(outDir, [dataFile]);
      await researchRealLocalRunnerSpecCommand(outDir);

      const readiness = await researchRealStudyReadinessCommand(outDir);

      expect(readiness.requirements.find(requirement => requirement.id === "real-data-runner")?.status).toBe("pass");
      expect(readiness.requirements.find(requirement => requirement.id === "data-access-manifest")?.status).toBe("pass");
    } finally {
      await rm(repo, { recursive: true, force: true });
      await rm(outDir, { recursive: true, force: true });
    }
  });

  it("writes a read-only data access manifest for real-data adapters", async () => {
    const repo = await makeRepo();
    const outDir = await mkdtemp(path.join(os.tmpdir(), "research-data-access-"));
    const dataFile = path.join(outDir, "rows.json");
    try {
      await researchDesignCommand({
        project: "medbrevia-nhanes",
        repoDir: repo,
        question: "Vitamin D deficiency and measured hypertension in NHANES adults",
        outDir,
      });
      await writeFile(dataFile, "[]\n");

      const manifest = await researchDataAccessManifestCommand(outDir, [dataFile]);
      const parsed = JSON.parse(renderResearchDataAccessManifestJson(manifest)) as {
        schemaVersion: number;
        dataAccess: { readOnly: boolean };
      };

      expect(manifest.readOnly).toBe(true);
      expect(manifest.files[0]?.exists).toBe(true);
      expect(renderResearchDataAccessManifest(manifest)).toContain("research data access manifest");
      expect(parsed.schemaVersion).toBe(1);
    } finally {
      await rm(repo, { recursive: true, force: true });
      await rm(outDir, { recursive: true, force: true });
    }
  });

  it("writes a share-safe redacted data access view", async () => {
    const repo = await makeRepo();
    const outDir = await mkdtemp(path.join(os.tmpdir(), "research-data-access-redact-"));
    const exportDir = await mkdtemp(path.join(os.tmpdir(), "research-data-access-redact-export-"));
    const dataFile = path.join(outDir, "rows.json");
    try {
      await researchDesignCommand({
        project: "medbrevia-nhanes",
        repoDir: repo,
        question: "Vitamin D deficiency and measured hypertension in NHANES adults",
        outDir,
      });
      await writeFile(dataFile, "[]\n");
      await researchDataAccessManifestCommand(outDir, [dataFile]);

      const redaction = await researchDataAccessRedactCommand(outDir);
      const parsed = JSON.parse(renderResearchDataAccessRedactionJson(redaction)) as {
        schemaVersion: number;
        dataAccessRedaction: { sourceManifestSha256: string; files: Array<{ sourceRef: string; path?: string }> };
      };

      expect(redaction.files[0]).toMatchObject({ sourceRef: "rows.json", exists: true });
      expect(redaction.sourceManifestSha256).toMatch(/^[a-f0-9]{64}$/);
      expect(redaction.generatedAtIso).toMatch(/T/);
      expect("path" in redaction.files[0]!).toBe(false);
      expect(redaction.expectedVariables.every(variable => !("files" in variable))).toBe(true);
      expect(redaction.redactions.map(item => item.field)).toContain("files[].path");
      expect(renderResearchDataAccessRedaction(redaction)).toContain("research data access redaction");
      expect(parsed.schemaVersion).toBe(1);
      expect(parsed.dataAccessRedaction.sourceManifestSha256).toMatch(/^[a-f0-9]{64}$/);
      expect(parsed.dataAccessRedaction.files[0]?.path).toBeUndefined();

      const readiness = await researchPacketReadinessCommand(outDir);
      expect(readiness.components.find(component => component.id === "redacted-data-access")).toMatchObject({
        status: "pass",
      });

      const exported = await researchExportPacketCommand(outDir, exportDir);
      expect(exported.copiedArtifacts).toContain("data-access-redacted.json");
      expect(exported.copiedArtifacts).not.toContain("data-access.json");
    } finally {
      await rm(repo, { recursive: true, force: true });
      await rm(outDir, { recursive: true, force: true });
      await rm(exportDir, { recursive: true, force: true });
    }
  });

  it("writes a real-local runner spec separate from fixture execution", async () => {
    const repo = await makeRepo();
    const outDir = await mkdtemp(path.join(os.tmpdir(), "research-real-runner-"));
    const dataFile = path.join(outDir, "rows.json");
    try {
      await researchDesignCommand({
        project: "medbrevia-nhanes",
        repoDir: repo,
        question: "Vitamin D deficiency and measured hypertension in NHANES adults",
        outDir,
      });
      await writeFile(dataFile, "[]\n");
      await researchDataAccessManifestCommand(outDir, [dataFile]);

      const spec = await researchRealLocalRunnerSpecCommand(outDir);
      const parsed = JSON.parse(renderResearchRealLocalRunnerSpecJson(spec)) as {
        schemaVersion: number;
        realLocalRunnerSpec: { mode: string };
      };

      expect(spec.mode).toBe("real_local_files");
      expect(spec.dataAccessManifest).toContain("data-access.json");
      expect(spec.safety.readOnlyData).toBe(true);
      expect(renderResearchRealLocalRunnerSpec(spec)).toContain("real-local runner");
      expect(parsed.schemaVersion).toBe(1);
    } finally {
      await rm(repo, { recursive: true, force: true });
      await rm(outDir, { recursive: true, force: true });
    }
  });

  it("emits an ordered checklist for moving packets to real local execution", async () => {
    const repo = await makeRepo();
    const outDir = await mkdtemp(path.join(os.tmpdir(), "research-real-checklist-"));
    try {
      await researchDesignCommand({
        project: "medbrevia-nhanes",
        repoDir: repo,
        question: "Vitamin D deficiency and measured hypertension in NHANES adults",
        outDir,
      });

      const checklist = await researchRealStudyChecklistCommand(outDir);
      const parsed = JSON.parse(renderResearchRealStudyChecklistJson(checklist)) as {
        schemaVersion: number;
        realStudyChecklist: { nextCommand: string | null };
      };

      expect(checklist.items[0]?.command).toContain("research data-access");
      expect(checklist.nextCommand).toContain("research data-access");
      expect(renderResearchRealStudyChecklist(checklist)).toContain("research real-study checklist");
      expect(parsed.schemaVersion).toBe(1);
    } finally {
      await rm(repo, { recursive: true, force: true });
      await rm(outDir, { recursive: true, force: true });
    }
  });

  it("reports adapter gaps for required variable mapping evidence", async () => {
    const repo = await makeRepo();
    const outDir = await mkdtemp(path.join(os.tmpdir(), "research-adapter-gap-"));
    const dataFile = path.join(outDir, "rows.json");
    try {
      await researchDesignCommand({
        project: "medbrevia-nhanes",
        repoDir: repo,
        question: "Vitamin D deficiency and measured hypertension in NHANES adults",
        outDir,
      });
      await writeFile(dataFile, "[]\n");
      await researchDataAccessManifestCommand(outDir, [dataFile]);
      await researchRealLocalRunnerSpecCommand(outDir);

      const report = await researchAdapterGapReportCommand(outDir);
      const parsed = JSON.parse(renderResearchAdapterGapReportJson(report)) as {
        schemaVersion: number;
        adapterGapReport: { status: string };
      };

      expect(report.status).toBe("needs_mapping");
      expect(report.missingEvidence.some(item => item.startsWith("variable:"))).toBe(true);
      expect(renderResearchAdapterGapReport(report)).toContain("research adapter gap report");
      expect(parsed.schemaVersion).toBe(1);
    } finally {
      await rm(repo, { recursive: true, force: true });
      await rm(outDir, { recursive: true, force: true });
    }
  });

  it("records variable mappings for real local data adapters", async () => {
    const repo = await makeRepo();
    const outDir = await mkdtemp(path.join(os.tmpdir(), "research-variable-map-"));
    const dataFile = path.join(outDir, "rows.json");
    try {
      await researchDesignCommand({
        project: "medbrevia-nhanes",
        repoDir: repo,
        question: "Vitamin D deficiency and measured hypertension in NHANES adults",
        outDir,
      });
      await writeFile(dataFile, "[]\n");

      const map = await researchVariableMapCommand(outDir, dataFile, ["LBXVIDMS:vitamin_d", "BPXSY1:systolic"]);
      const parsed = JSON.parse(renderResearchVariableMapJson(map)) as {
        schemaVersion: number;
        variableMap: { mappings: unknown[] };
      };

      expect(map.mappings).toHaveLength(2);
      expect(map.mappings[0]?.column).toBe("vitamin_d");
      expect(renderResearchVariableMap(map)).toContain("research variable map");
      expect(parsed.schemaVersion).toBe(1);
    } finally {
      await rm(repo, { recursive: true, force: true });
      await rm(outDir, { recursive: true, force: true });
    }
  });

  it("infers schema from local JSON rows", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "research-schema-infer-"));
    const file = path.join(dir, "rows.json");
    try {
      await writeFile(file, `${JSON.stringify([
        { AGE: 44, SEX: "male", HTN: true },
        { AGE: 58, SEX: "female", HTN: false },
      ], null, 2)}\n`);

      const schema = await researchInferSchemaCommand(file);
      const parsed = JSON.parse(renderResearchSchemaInferenceJson(schema)) as {
        schemaVersion: number;
        schemaInference: { columns: Array<{ name: string }> };
      };

      expect(schema.columns.find(column => column.name === "AGE")?.inferredType).toBe("number");
      expect(schema.columns.find(column => column.name === "SEX")?.inferredType).toBe("string");
      expect(renderResearchSchemaInference(schema)).toContain("research schema inference");
      expect(parsed.schemaVersion).toBe(1);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("summarizes local tabular files before real-data execution", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "research-table-summary-"));
    const file = path.join(dir, "rows.csv");
    try {
      await writeFile(file, [
        "SEQN,RIDAGEYR,RIAGENDR,LBXGH",
        "1,44,1,5.6",
        "2,57,2,",
        "3,61,2,7.2",
      ].join("\n"));

      const summary = await researchTableSummaryCommand({ file });
      const parsed = JSON.parse(renderResearchTableSummaryJson(summary)) as {
        schemaVersion: number;
        tableSummary: { rowCount: number; columns: Array<{ name: string; missingFraction: number }> };
      };

      expect(summary.format).toBe("csv");
      expect(summary.rowCount).toBe(3);
      expect(summary.columns.find(column => column.name === "LBXGH")?.missingFraction).toBeCloseTo(1 / 3);
      expect(renderResearchTableSummary(summary)).toContain("research table summary");
      expect(parsed.schemaVersion).toBe(1);
      expect(parsed.tableSummary.rowCount).toBe(3);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("suggests variable mappings from required runner variables and inferred schema", async () => {
    const repo = await makeRepo();
    const outDir = await mkdtemp(path.join(os.tmpdir(), "research-variable-map-suggest-"));
    const dataFile = path.join(outDir, "rows.json");
    try {
      await researchDesignCommand({
        project: "medbrevia-nhanes",
        repoDir: repo,
        question: "Vitamin D deficiency and measured hypertension in NHANES adults",
        outDir,
      });
      await writeFile(dataFile, `${JSON.stringify([
        { LBXVIDMS: 19, BPXSY1: 132, WTMEC2YR: 0.4 },
        { LBXVIDMS: 33, BPXSY1: 118, WTMEC2YR: 0.6 },
      ], null, 2)}\n`);
      await researchDataAccessManifestCommand(outDir, [dataFile]);
      await researchRealLocalRunnerSpecCommand(outDir);

      const result = await researchSuggestVariableMapCommand(outDir, dataFile);
      const parsed = JSON.parse(renderResearchVariableMapSuggestionJson(result)) as {
        schemaVersion: number;
        variableMapSuggestion: { suggestions: Array<{ variable: string; column: string }> };
      };

      expect(result.suggestions).toContainEqual(expect.objectContaining({ variable: "BPXSY1", column: "BPXSY1" }));
      expect(result.suggestions).toContainEqual(expect.objectContaining({ variable: "LBXVIDMS", column: "LBXVIDMS" }));
      expect(renderResearchVariableMapSuggestion(result)).toContain("research variable map suggestions");
      expect(parsed.schemaVersion).toBe(1);
      expect(parsed.variableMapSuggestion.suggestions.some(suggestion => suggestion.variable === "WTMEC2YR")).toBe(true);
    } finally {
      await rm(repo, { recursive: true, force: true });
      await rm(outDir, { recursive: true, force: true });
    }
  });

  it("applies variable map suggestions and closes adapter gaps when all variables match", async () => {
    const repo = await makeRepo();
    const outDir = await mkdtemp(path.join(os.tmpdir(), "research-variable-map-apply-"));
    const dataFile = path.join(outDir, "rows.json");
    try {
      await researchDesignCommand({
        project: "medbrevia-nhanes",
        repoDir: repo,
        question: "Vitamin D deficiency and measured hypertension in NHANES adults",
        outDir,
      });
      await researchScoutPlanCommand(outDir);
      const scout = JSON.parse(await readFile(path.join(outDir, "scout-plan.json"), "utf-8")) as { requiredVariables: string[] };
      const row = Object.fromEntries(scout.requiredVariables.map(variable => [variable, variable === "RIAGENDR" ? 1 : 10]));
      await writeFile(dataFile, `${JSON.stringify([row], null, 2)}\n`);
      await researchDataAccessManifestCommand(outDir, [dataFile]);
      await researchRealLocalRunnerSpecCommand(outDir);

      const applied = await researchApplyVariableMapSuggestionsCommand(outDir, dataFile);
      const parsed = JSON.parse(renderResearchVariableMapApplyResultJson(applied)) as {
        schemaVersion: number;
        variableMapApplyResult: { adapterStatus: string };
      };

      expect(applied.adapterStatus).toBe("mapping_ready");
      expect(applied.skippedVariables).toHaveLength(0);
      expect(renderResearchVariableMapApplyResult(applied)).toContain("research apply variable map suggestions");
      expect(parsed.schemaVersion).toBe(1);
      expect(parsed.variableMapApplyResult.adapterStatus).toBe("mapping_ready");
    } finally {
      await rm(repo, { recursive: true, force: true });
      await rm(outDir, { recursive: true, force: true });
    }
  });

  it("scores workflow packets with evaluator-first checks", async () => {
    const repo = await makeRepo();
    const outDir = await mkdtemp(path.join(os.tmpdir(), "research-workflow-scorecard-"));
    try {
      await researchSimulateStudyCommand({
        project: "medbrevia-nhanes",
        repoDir: repo,
        question: "Is smoking history associated with measured blood pressure differently by sex among NHANES adults?",
        outDir,
      });
      await researchDataAccessManifestCommand(outDir, [path.join(outDir, "rows.json")]);
      await researchRealLocalRunnerSpecCommand(outDir);
      await researchApplyVariableMapSuggestionsCommand(outDir, path.join(outDir, "rows.json"));

      const scorecard = await researchWorkflowScorecardCommand(outDir);
      const parsed = JSON.parse(renderResearchWorkflowScorecardJson(scorecard)) as {
        schemaVersion: number;
        workflowScorecard: { score: number; checks: unknown[] };
      };

      expect(scorecard.score).toBeGreaterThanOrEqual(60);
      expect(scorecard.status).not.toBe("blocked");
      expect(renderResearchWorkflowScorecard(scorecard)).toContain("research workflow scorecard");
      expect(parsed.schemaVersion).toBe(1);
      expect(parsed.workflowScorecard.checks).toHaveLength(8);
    } finally {
      await rm(repo, { recursive: true, force: true });
      await rm(outDir, { recursive: true, force: true });
    }
  });

  it("reports evidence gaps for generated research reports", async () => {
    const repo = await makeRepo();
    const outDir = await mkdtemp(path.join(os.tmpdir(), "research-evidence-gap-"));
    try {
      await researchSimulateStudyCommand({
        project: "medbrevia-nhanes",
        repoDir: repo,
        question: "Among NHANES adults, is self-reported high blood pressure associated with measured hypertension?",
        outDir,
      });
      await researchArtifactManifestCommand(outDir);
      await researchProvenanceCommand(outDir);

      const report = await researchEvidenceGapReportCommand(outDir);
      const parsed = JSON.parse(renderResearchEvidenceGapReportJson(report)) as {
        schemaVersion: number;
        evidenceGapReport: { checks: Array<{ id: string }> };
      };

      expect(report.checks.map(check => check.id)).toEqual(expect.arrayContaining(["report", "analysis-artifact", "fixture-caveat", "citation-coverage"]));
      expect(report.checks.find(check => check.id === "fixture-caveat")?.status).toBe("pass");
      expect(renderResearchEvidenceGapReport(report)).toContain("research evidence gap report");
      expect(parsed.schemaVersion).toBe(1);
      expect(parsed.evidenceGapReport.checks.length).toBeGreaterThan(3);
      expect(JSON.parse(await readFile(path.join(outDir, "evidence-gap-report.json"), "utf-8"))).toMatchObject({ status: report.status });
    } finally {
      await rm(repo, { recursive: true, force: true });
      await rm(outDir, { recursive: true, force: true });
    }
  });

  it("diffs tracked artifacts between research packets", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "research-packet-diff-"));
    const base = path.join(dir, "base");
    const compare = path.join(dir, "compare");
    try {
      await mkdir(base);
      await mkdir(compare);
      await writeFile(path.join(base, "design.json"), "{\"version\":1}\n");
      await writeFile(path.join(compare, "design.json"), "{\"version\":2}\n");
      await writeFile(path.join(compare, "report.md"), "# Report\n");

      const diff = await researchPacketDiffCommand(base, compare);
      const parsed = JSON.parse(renderResearchPacketDiffJson(diff)) as {
        schemaVersion: number;
        packetDiff: { addedArtifacts: string[]; changedArtifacts: string[] };
      };

      expect(diff.addedArtifacts).toContain("report.md");
      expect(diff.changedArtifacts).toContain("design.json");
      expect(renderResearchPacketDiff(diff)).toContain("research packet diff");
      expect(parsed.schemaVersion).toBe(1);
      expect(parsed.packetDiff.addedArtifacts).toContain("report.md");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("creates node proposals with evaluator and cost metadata", () => {
    const proposal = researchNodeProposalCommand({
      id: "citation-coverage",
      purpose: "Check report claims against cited evidence records.",
      evaluator: "research evidence-gap --packet <packet>",
      rollback: "Remove node if it blocks fixture-only packets without factual claims.",
      costUsd: 0,
    });
    const parsed = JSON.parse(renderResearchNodeProposalJson(proposal)) as {
      schemaVersion: number;
      nodeProposal: { status: string; promotionCriteria: string[] };
    };

    expect(proposal.status).toBe("candidate");
    expect(proposal.promotionCriteria.length).toBeGreaterThan(1);
    expect(renderResearchNodeProposal(proposal)).toContain("research node proposal");
    expect(parsed.schemaVersion).toBe(1);
    expect(parsed.nodeProposal.status).toBe("candidate");
  });

  it("loads node proposal registries from JSON proposal files", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "research-node-registry-"));
    try {
      const proposal = researchNodeProposalCommand({
        id: "scorecard",
        purpose: "Evaluate packet promotion readiness.",
        evaluator: "research workflow-scorecard --packet <packet>",
        rollback: "Rollback if scorecard creates false blockers.",
        costUsd: 0,
      });
      await writeFile(path.join(dir, "scorecard.json"), renderResearchNodeProposalJson(proposal));

      const registry = await researchNodeProposalRegistryCommand(dir);
      const parsed = JSON.parse(renderResearchNodeProposalRegistryJson(registry)) as {
        schemaVersion: number;
        nodeProposalRegistry: { proposals: Array<{ id: string }> };
      };

      expect(registry.proposals.map(item => item.id)).toContain("scorecard");
      expect(registry.totalCostEnvelopeUsd).toBe(0);
      expect(renderResearchNodeProposalRegistry(registry)).toContain("research node proposal registry");
      expect(parsed.schemaVersion).toBe(1);
      expect(parsed.nodeProposalRegistry.proposals[0]?.id).toBe("scorecard");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("summarizes observed and proposed research loop costs", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "research-cost-ledger-"));
    const packet = path.join(dir, "packet");
    const proposals = path.join(dir, "proposals");
    try {
      await mkdir(packet);
      await mkdir(proposals);
      await writeFile(path.join(packet, "runner-spec.json"), JSON.stringify({
        safety: { cloudSpendUsd: 0 },
      }));
      await writeFile(path.join(proposals, "candidate.json"), renderResearchNodeProposalJson(researchNodeProposalCommand({
        id: "candidate",
        purpose: "Try a local evaluator.",
        evaluator: "npm test",
        rollback: "Remove if noisy.",
        costUsd: 0,
      })));

      const ledger = await researchCostLedgerCommand({ packetDir: packet, proposalDir: proposals });
      const parsed = JSON.parse(renderResearchCostLedgerJson(ledger)) as {
        schemaVersion: number;
        costLedger: { status: string };
      };

      expect(ledger.status).toBe("within_budget");
      expect(ledger.observedCloudSpendUsd).toBe(0);
      expect(renderResearchCostLedger(ledger)).toContain("research cost ledger");
      expect(parsed.schemaVersion).toBe(1);
      expect(parsed.costLedger.status).toBe("within_budget");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("provides general medical research question bank candidates", () => {
    const bank = researchQuestionBankCommand("medical");
    const parsed = JSON.parse(renderResearchQuestionBankJson(bank)) as {
      schemaVersion: number;
      questionBank: { questions: Array<{ id: string; datasetNeeds: string[] }> };
    };

    expect(bank.questions.map(question => question.id)).toContain("clinical-prediction-calibration");
    expect(bank.questions.every(question => question.datasetNeeds.length > 1)).toBe(true);
    expect(renderResearchQuestionBank(bank)).toContain("research question bank");
    expect(parsed.schemaVersion).toBe(1);
    expect(parsed.questionBank.questions[0]?.datasetNeeds.length).toBeGreaterThan(1);
  });

  it("scores registry-independent question readiness before protocol design", () => {
    const readiness = researchQuestionReadinessCommand("Among adults with hypertension, is medication adherence associated with blood pressure control?");
    const parsed = JSON.parse(renderResearchQuestionReadinessJson(readiness)) as {
      schemaVersion: number;
      questionReadiness: { score: number; status: string };
    };

    expect(readiness.status).toBe("ready_for_protocol");
    expect(readiness.score).toBe(100);
    expect(renderResearchQuestionReadiness(readiness)).toContain("research question readiness");
    expect(parsed.schemaVersion).toBe(1);
    expect(parsed.questionReadiness.status).toBe("ready_for_protocol");
  });

  it("builds and promotes a candidate protocol portfolio into an AnalysisSpec", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "research-protocol-portfolio-"));
    try {
      const portfolio = researchProtocolCandidatesCommand("Among adults, is vitamin D deficiency associated with measured hypertension?");
      const parsedPortfolio = JSON.parse(renderResearchProtocolCandidatesJson(portfolio)) as {
        schemaVersion: number;
        protocolCandidates: { selectedCandidateId: string | null; candidates: Array<{ id: string; rank: number }> };
      };
      const portfolioPath = path.join(dir, "protocol-candidates.json");
      await writeFile(portfolioPath, renderResearchProtocolCandidatesJson(portfolio));

      const promotion = await researchProtocolPromoteCommand(portfolioPath);
      const parsedPromotion = JSON.parse(renderResearchProtocolPromotionJson(promotion)) as {
        schemaVersion: number;
        protocolPromotion: { analysisSpec: { requiredVariables: string[]; specHash: string; inferencePolicy: { varianceEstimator: string } } };
      };

      expect(portfolio.candidates.length).toBeGreaterThan(1);
      expect(portfolio.selectedCandidateId).toBeTruthy();
      expect(parsedPortfolio.schemaVersion).toBe(1);
      expect(parsedPortfolio.protocolCandidates.candidates[0]?.rank).toBe(1);
      expect(promotion.analysisSpec.requiredVariables).toEqual(expect.arrayContaining(["LBXVIDMS", "BPXSY1", "WTMEC2YR", "SDMVSTRA", "SDMVPSU"]));
      expect(promotion.analysisSpec.inferencePolicy.varianceEstimator).toBe("approximate_weighted");
      expect(promotion.analysisSpec.specHash).toMatch(/^[a-f0-9]{64}$/);
      expect(renderResearchProtocolCandidates(portfolio)).toContain("research protocol candidates");
      expect(renderResearchProtocolPromotion(promotion)).toContain("research protocol promotion");
      expect(parsedPromotion.schemaVersion).toBe(1);
      expect(parsedPromotion.protocolPromotion.analysisSpec.specHash).toBe(promotion.analysisSpec.specHash);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("steers and edits candidate protocols before promotion", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "research-protocol-steer-edit-"));
    try {
      const portfolio = researchProtocolCandidatesCommand("Among adults, is vitamin D deficiency associated with measured hypertension?");
      const portfolioPath = path.join(dir, "protocol-candidates.json");
      await writeFile(portfolioPath, renderResearchProtocolCandidatesJson(portfolio));

      const steered = await researchProtocolSteerCommand(portfolioPath, {
        prefer: ["vitamin d"],
        avoid: ["prevalence"],
        requireVariables: ["LBXVIDMS"],
      });
      const steeredPath = path.join(dir, "steered.json");
      await writeFile(steeredPath, renderResearchProtocolCandidatesJson(steered.updatedPortfolio));
      const promoted = await researchProtocolPromoteCommand(steeredPath);
      const promotedPath = path.join(dir, "promoted.json");
      await writeFile(promotedPath, renderResearchProtocolPromotionJson(promoted));

      const edited = await researchProtocolEditCommand(promotedPath, {
        title: "Edited vitamin D and measured hypertension protocol",
        cycles: ["2017-2018"],
        addCovariate: ["Smoking status:SMQ020:smoking"],
        addCaveat: ["Edited locally before scout execution."],
      });
      const parsedEdit = JSON.parse(renderResearchProtocolEditJson(edited)) as {
        schemaVersion: number;
        protocolEdit: { protocol: { covariates: Array<{ variable: string }> }; analysisSpec: { requiredVariables: string[] } };
      };

      expect(steered.updatedPortfolio.selectedCandidateId).toBe(promoted.candidateId);
      expect(steered.changes.length).toBeGreaterThan(0);
      expect(edited.protocol.title).toBe("Edited vitamin D and measured hypertension protocol");
      expect(edited.analysisSpec.requiredVariables).toContain("SMQ020");
      expect(renderResearchProtocolSteer(steered)).toContain("research protocol steer");
      expect(renderResearchProtocolEdit(edited)).toContain("research protocol edit");
      expect(JSON.parse(renderResearchProtocolSteerJson(steered)).schemaVersion).toBe(1);
      expect(parsedEdit.schemaVersion).toBe(1);
      expect(parsedEdit.protocolEdit.protocol.covariates.map(item => item.variable)).toContain("SMQ020");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("derives an AnalysisSpec from an existing packet design", async () => {
    const repo = await makeRepo();
    const outDir = await mkdtemp(path.join(os.tmpdir(), "research-analysis-spec-packet-"));
    try {
      await researchDesignCommand({
        project: "medbrevia-nhanes",
        repoDir: repo,
        question: "Vitamin D deficiency and measured hypertension in NHANES adults",
        outDir,
      });

      const spec = await researchAnalysisSpecCommand({ packetDir: outDir });
      const parsed = JSON.parse(renderResearchAnalysisSpecJson(spec)) as {
        schemaVersion: number;
        analysisSpec: { requiredVariables: string[]; specHash: string; failurePolicy: { rerunInstability: string } };
      };

      expect(spec.requiredVariables).toEqual(expect.arrayContaining(["LBXVIDMS", "BPXSY1", "RIDAGEYR", "RIDSTATR", "SEQN"]));
      expect(spec.releasePolicy).toBe("local_files");
      expect(spec.failurePolicy.rerunInstability).toBe("block");
      expect(spec.specHash).toMatch(/^[a-f0-9]{64}$/);
      expect(renderResearchAnalysisSpec(spec)).toContain("research AnalysisSpec");
      expect(parsed.schemaVersion).toBe(1);
      expect(parsed.analysisSpec.specHash).toBe(spec.specHash);
      expect(parsed.analysisSpec.failurePolicy.rerunInstability).toBe("block");
    } finally {
      await rm(repo, { recursive: true, force: true });
      await rm(outDir, { recursive: true, force: true });
    }
  });

  it("scouts local cohort rows and applies semantic quality checks", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "research-local-scout-"));
    try {
      const portfolio = researchProtocolCandidatesCommand("Among adults, is vitamin D deficiency associated with measured hypertension?");
      const portfolioPath = path.join(dir, "portfolio.json");
      await writeFile(portfolioPath, renderResearchProtocolCandidatesJson(portfolio));
      const promotion = await researchProtocolPromoteCommand(portfolioPath);
      const specPath = path.join(dir, "analysis-spec.json");
      await writeFile(specPath, renderResearchAnalysisSpecJson(promotion.analysisSpec));
      const rowsPath = path.join(dir, "rows.csv");
      await writeFile(rowsPath, [
        "SEQN,RIDAGEYR,RIDSTATR,LBXVIDMS,BPXSY1,BPXSY2,BPXSY3,BPXDI1,BPXDI2,BPXDI3,RIDRETH3,RIAGENDR,BMXBMI,WTMEC2YR,SDMVSTRA,SDMVPSU",
        "1,45,2,35,138,134,136,82,84,80,3,1,29.1,3450,101,1",
        "2,62,2,80,118,120,116,70,72,74,2,2,24.3,2890,101,2",
        "3,30,2,55,128,130,126,78,76,80,1,1,31.4,3100,102,1",
        "4,17,2,42,122,120,124,76,78,74,4,2,22.2,2700,102,2",
      ].join("\n"));

      const scout = await researchCohortScoutFileCommand(specPath, rowsPath);
      const quality = await researchSemanticQualityCommand(rowsPath);
      const badRowsPath = path.join(dir, "bad-rows.json");
      await writeFile(badRowsPath, `${JSON.stringify([{ RIDAGEYR: 45, BPXSY1: 500, BPXDI1: 80, WTMEC2YR: 1 }], null, 2)}\n`);
      const badQuality = await researchSemanticQualityCommand(badRowsPath);
      const implausibleMeanPath = path.join(dir, "implausible-mean.csv");
      await writeFile(implausibleMeanPath, [
        "age,bmi,outcome_bin",
        ...Array.from({ length: 36 }, (_, index) => `${55 + (index % 10)},65,${index % 2}`),
      ].join("\n"));
      const meanQuality = await researchSemanticQualityCommand(implausibleMeanPath);

      expect(scout.status).toBe("passed");
      expect(scout.eligibleRows).toBe(3);
      expect(scout.completeCaseRows).toBe(3);
      expect(scout.positiveWeightRows).toBe(3);
      expect(quality.status).toBe("passed");
      expect(badQuality.status).toBe("failed");
      expect(meanQuality.status).toBe("warning");
      expect(meanQuality.warnings.map(issue => issue.code)).toContain("MEAN_ABOVE_EXPECTED_RANGE");
      expect(renderResearchCohortScoutFile(scout)).toContain("research cohort scout file");
      expect(renderResearchSemanticQuality(quality)).toContain("research semantic quality");
      expect(JSON.parse(renderResearchCohortScoutFileJson(scout)).schemaVersion).toBe(1);
      expect(JSON.parse(renderResearchSemanticQualityJson(quality)).schemaVersion).toBe(1);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("blocks cohort scout execution when survey weights are invalid", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "research-local-scout-weight-"));
    try {
      const portfolio = researchProtocolCandidatesCommand("Among adults, is vitamin D deficiency associated with measured hypertension?");
      const portfolioPath = path.join(dir, "portfolio.json");
      await writeFile(portfolioPath, renderResearchProtocolCandidatesJson(portfolio));
      const promotion = await researchProtocolPromoteCommand(portfolioPath);
      const specPath = path.join(dir, "analysis-spec.json");
      await writeFile(specPath, renderResearchAnalysisSpecJson(promotion.analysisSpec));
      const rowsPath = path.join(dir, "rows.csv");
      await writeFile(rowsPath, [
        "SEQN,RIDAGEYR,RIDSTATR,LBXVIDMS,BPXSY1,BPXSY2,BPXSY3,BPXDI1,BPXDI2,BPXDI3,RIDRETH3,RIAGENDR,BMXBMI,WTMEC2YR,SDMVSTRA,SDMVPSU",
        "1,45,2,35,138,134,136,82,84,80,3,1,29.1,0,101,1",
        "2,62,2,80,118,120,116,70,72,74,2,2,24.3,0,101,2",
      ].join("\n"));

      const scout = await researchCohortScoutFileCommand(specPath, rowsPath);
      expect(scout.status).toBe("blocked");
      expect(scout.warnings.map(issue => issue.code)).toContain("NO_POSITIVE_WEIGHT_ROWS");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("models durable progress, async job lifecycle, and repair plans", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "research-repair-plan-"));
    try {
      const progress = researchProgressCommand({
        phase: "cohort_scout_complete",
        label: "Cohort scout complete",
        detail: "Fixture scout found enough complete cases.",
        nextStep: "Promote candidate protocol.",
      });
      const job = researchJobLifecycleCommand({
        jobId: "job_123",
        status: "cancel_requested",
        phase: "analysis_run",
        nextStep: "Stop runner and preserve partial artifacts.",
      });
      await writeFile(path.join(dir, "workflow-scorecard.json"), renderResearchWorkflowScorecardJson({
        packetDir: dir,
        status: "needs_work",
        score: 70,
        checks: [
          { id: "semantic-quality", status: "fail", detail: "Semantic quality artifact is missing." },
        ],
        nextAction: "Run semantic quality.",
      }));
      await writeFile(path.join(dir, "golden-manifest.json"), `${JSON.stringify({
        schemaVersion: 1,
        localReviewStatus: "ready_for_local_review",
        checks: {
          sourceValidation: "passed",
          rerunDiff: "changed",
          paperQa: "pass",
          runnerRecord: "present",
        },
        artifacts: [],
      }, null, 2)}\n`);
      await writeFile(path.join(dir, "paper-qa.json"), renderResearchPaperQaJson({
        paperPath: path.join(dir, "paper.md"),
        evidencePath: path.join(dir, "analysis.json"),
        status: "fail",
        checks: [
          {
            id: "inference-policy-no-strong-significance",
            status: "fail",
            severity: "critical",
            detail: "Approximate-inference AnalysisSpecs should not use strong statistical-significance language.",
          },
        ],
        summary: "0/1 paper QA checks passed.",
        nextAction: "Revise the paper.",
      }));

      const repair = await researchRepairPlanCommand(dir);
      const parsedRepair = JSON.parse(renderResearchRepairPlanJson(repair)) as {
        schemaVersion: number;
        repairPlan: { status: string; issues: Array<{ code: string }>; stoppingReasons: string[] };
      };

      expect(progress.terminal).toBe(false);
      expect(job.progress.terminal).toBe(false);
      expect(repair.status).toBe("repair_recommended");
      expect(repair.issues.map(issue => issue.code)).toContain("SCORECARD_SEMANTIC_QUALITY");
      expect(repair.issues.map(issue => issue.code)).toContain("MANIFEST_RERUN_DIFF_UNSTABLE");
      expect(repair.issues.map(issue => issue.code)).toContain("PAPER_QA_INFERENCE_POLICY_NO_STRONG_SIGNIFICANCE");
      expect(repair.repairClasses.methodological.map(issue => issue.code)).toContain("PAPER_QA_INFERENCE_POLICY_NO_STRONG_SIGNIFICANCE");
      expect(repair.stoppingReasons).toContain("methodological uncertainty requires human review before executable repair");
      expect(repair.proposedActions).toContain("Rerun from the AnalysisSpec, compare deterministic outputs, and stop if instability repeats.");
      expect(repair.proposedActions).toContain("Stop for methodological review; revise the AnalysisSpec, estimator, or report inference policy before executable repair.");
      expect(renderResearchProgress(progress)).toContain("research progress");
      expect(renderResearchJobLifecycle(job)).toContain("research job");
      expect(renderResearchRepairPlan(repair)).toContain("research repair plan");
      expect(JSON.parse(renderResearchProgressJson(progress)).schemaVersion).toBe(1);
      expect(JSON.parse(renderResearchJobLifecycleJson(job)).schemaVersion).toBe(1);
      expect(parsedRepair.schemaVersion).toBe(1);
      expect(parsedRepair.repairPlan.status).toBe("repair_recommended");
      expect(parsedRepair.repairPlan.stoppingReasons.length).toBe(1);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("distills workflow memory and records agent execution provenance", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "research-workflow-memory-"));
    try {
      const journal = path.join(dir, "updates-upgrades.md");
      await writeFile(journal, [
        "## Cycle 1",
        "- Added semantic quality and cohort scout validation.",
        "- Saved a live sample run with artifact manifest.",
        "",
        "## Cycle 2",
        "- Added protocol candidates and promoted an AnalysisSpec.",
        "- Verification passed with workflow-scorecard.",
      ].join("\n"));

      const memory = await researchWorkflowMemoryCommand({ source: journal });
      const record = researchAgentExecutionRecordCommand({
        cycle: 2,
        intent: "Improve reusable loop memory.",
        observation: "Cycle notes contain repeated validation and artifact patterns.",
        inference: "The loop needs a machine-readable routine distillation artifact.",
        action: "Generate workflow memory before selecting the next improvement.",
        evidence: [journal],
        confidence: 0.84,
        tags: ["memory", "provenance"],
      });

      expect(memory.cyclesObserved).toEqual([1, 2]);
      expect(memory.routines.map(routine => routine.id)).toContain("deterministic-validation-before-run");
      expect(record.recordHash).toMatch(/^[a-f0-9]{64}$/);
      expect(record.confidence).toBe(0.84);
      expect(renderResearchWorkflowMemory(memory)).toContain("research workflow memory");
      expect(renderResearchAgentExecutionRecord(record)).toContain("research agent execution record");
      expect(JSON.parse(renderResearchWorkflowMemoryJson(memory)).schemaVersion).toBe(1);
      expect(JSON.parse(renderResearchAgentExecutionRecordJson(record)).agentExecutionRecord.tags).toContain("memory");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("audits whether a directory is a real human-reviewed cycle or a batch sweep", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "research-cycle-audit-"));
    try {
      const batch = path.join(dir, "cycle-122");
      await mkdir(batch);
      await writeFile(path.join(batch, "summary.md"), [
        "# Cycle 122: Reliability Gate Stress",
        "",
        "Question: Does missingness bias a diabetes quality measure?",
        "",
        "Ran repeated-run reliability evaluation.",
      ].join("\n"));
      await writeFile(path.join(batch, "reliability-eval.json"), JSON.stringify({ reliabilityEval: { metrics: {} } }, null, 2));
      await writeFile(path.join(batch, "reliability-eval.meta.json"), JSON.stringify({ status: 0 }, null, 2));

      const full = path.join(dir, "cycle-123");
      await mkdir(full);
      await writeFile(path.join(full, "summary.md"), [
        "# Cycle 123: Cycle Accounting Repair",
        "",
        "Question: Can the loop distinguish batch sweeps from full cycles?",
        "",
        "Human-in-the-loop diagnosis: friction belongs to loop accounting and evidence quality.",
        "Implemented new validator: research cycle-audit.",
        "Verification passed with focused test and rerun.",
        "Next action: audit generated directories before counting them.",
      ].join("\n"));
      await writeFile(path.join(full, "agent-record.json"), JSON.stringify({ intent: "Improve cycle quality", action: "added cycle audit" }, null, 2));
      await writeFile(path.join(full, "cycle-audit.meta.json"), JSON.stringify({ status: 0 }, null, 2));

      const batchAudit = await researchCycleAuditCommand(batch);
      const fullAudit = await researchCycleAuditCommand(full);

      expect(batchAudit.status).toBe("batch_sweep");
      expect(batchAudit.countsAsCycle).toBe(false);
      expect(batchAudit.correctiveActions[0]).toContain("Relabel");
      expect(fullAudit.status).toBe("full_cycle");
      expect(fullAudit.countsAsCycle).toBe(true);
      expect(renderResearchCycleAudit(batchAudit)).toContain("research cycle audit");
      expect(JSON.parse(renderResearchCycleAuditJson(fullAudit)).cycleAudit.status).toBe("full_cycle");
      expect(JSON.parse(renderResearchLoopNoteJson(await researchLoopNoteCommand({
        stateDir: path.join(dir, "loop-state"),
        cycle: 1,
        summary: "Cycle audit added.",
      }))).schemaVersion).toBe(1);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("computes an uncertainty budget from AnalysisSpec and cohort scout artifacts", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "research-uncertainty-budget-"));
    try {
      const portfolio = researchProtocolCandidatesCommand("Among adults, is vitamin D deficiency associated with measured hypertension?");
      const portfolioPath = path.join(dir, "portfolio.json");
      await writeFile(portfolioPath, renderResearchProtocolCandidatesJson(portfolio));
      const promotion = await researchProtocolPromoteCommand(portfolioPath);
      const specPath = path.join(dir, "analysis-spec.json");
      await writeFile(specPath, renderResearchAnalysisSpecJson(promotion.analysisSpec));
      const rowsPath = path.join(dir, "rows.csv");
      await writeFile(rowsPath, [
        "SEQN,RIDAGEYR,RIDSTATR,LBXVIDMS,BPXSY1,BPXSY2,BPXSY3,BPXDI1,BPXDI2,BPXDI3,RIDRETH3,RIAGENDR,BMXBMI,WTMEC2YR,SDMVSTRA,SDMVPSU",
        "1,45,2,35,138,134,136,82,84,80,3,1,29.1,3450,101,1",
        "2,62,2,80,118,120,116,70,72,74,2,2,24.3,2890,101,2",
        "3,30,2,55,128,130,126,78,76,80,1,1,31.4,3100,102,1",
      ].join("\n"));
      const scout = await researchCohortScoutFileCommand(specPath, rowsPath);
      const scoutPath = path.join(dir, "cohort-scout.json");
      await writeFile(scoutPath, renderResearchCohortScoutFileJson(scout));

      const budget = await researchUncertaintyBudgetCommand({ specPath, scoutPath, comparisons: 6 });
      const parsed = JSON.parse(renderResearchUncertaintyBudgetJson(budget)) as {
        schemaVersion: number;
        uncertaintyBudget: { status: string; adjustedAlphaBonferroni: number };
      };

      expect(budget.status).toBe("underpowered_or_fragile");
      expect(budget.adjustedAlphaBonferroni).toBeCloseTo(0.05 / 6);
      expect(budget.components.map(component => component.id)).toContain("sparse-cells");
      expect(renderResearchUncertaintyBudget(budget)).toContain("research uncertainty budget");
      expect(parsed.schemaVersion).toBe(1);
      expect(parsed.uncertaintyBudget.status).toBe("underpowered_or_fragile");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("triages dataset candidates before empirical research use", () => {
    const synthetic = researchDatasetCandidateCommand({
      id: "synthetic-preeclampsia",
      title: "Synthetic maternal health preeclampsia dataset",
      sourceUrl: "https://example.test/dataset",
      modality: ["tabular", "text"],
      rowCount: 50000,
      license: "cc-by-4.0",
      synthetic: true,
      intendedUse: "empirical_analysis",
    });
    const empirical = researchDatasetCandidateCommand({
      id: "curated-survey",
      title: "Curated health survey",
      sourceUrl: "https://example.test/survey",
      modality: ["tabular"],
      rowCount: 10000,
      license: "public-domain",
      intendedUse: "empirical_analysis",
    });

    expect(synthetic.status).toBe("unsuitable");
    expect(synthetic.risks.map(risk => risk.code)).toContain("SYNTHETIC_EMPIRICAL_ANALYSIS");
    expect(empirical.status).toBe("empirical_ready");
    expect(renderResearchDatasetCandidate(synthetic)).toContain("research dataset candidate");
    expect(JSON.parse(renderResearchDatasetCandidateJson(empirical)).datasetCandidate.status).toBe("empirical_ready");
  });

  it("ranks improvement candidates by expected utility under cost and risk", () => {
    const agenda = researchImprovementAgendaCommand({
      budgetUsd: 1,
      candidates: [
        "expensive-cloud:0.9:0.6:5:0.2:Cloud-backed real data adapter",
        "local-repair-loop:0.8:0.8:0:0.2:Local repair loop",
        "risky-refactor:0.7:0.4:0:0.9:Large runtime rewrite",
      ],
    });
    const parsed = JSON.parse(renderResearchImprovementAgendaJson(agenda)) as {
      schemaVersion: number;
      improvementAgenda: { selected: string[] };
    };

    expect(agenda.selected[0]).toBe("local-repair-loop");
    expect(agenda.candidates.find(candidate => candidate.id === "expensive-cloud")?.decision).toBe("queue");
    expect(renderResearchImprovementAgenda(agenda)).toContain("research improvement agenda");
    expect(parsed.schemaVersion).toBe(1);
    expect(parsed.improvementAgenda.selected).toContain("local-repair-loop");
  });

  it("guards generated reports against unsupported causal claims", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "research-claim-guard-"));
    try {
      const report = path.join(dir, "report.md");
      await writeFile(report, [
        "# Report",
        "Vitamin D deficiency reduces hypertension in adults.",
        "This observational cross-sectional fixture cannot infer causality.",
      ].join("\n"));
      const guarded = await researchClaimGuardCommand({ reportPath: report });
      const safeReport = path.join(dir, "safe-report.md");
      await writeFile(safeReport, [
        "# Report",
        "Vitamin D deficiency was associated with measured hypertension in this observational cross-sectional fixture.",
        "The design cannot infer causality.",
      ].join("\n"));
      const safe = await researchClaimGuardCommand({ reportPath: safeReport });

      expect(guarded.status).toBe("blocked");
      expect(guarded.issues.map(issue => issue.code)).toContain("UNSUPPORTED_CAUSAL_LANGUAGE");
      expect(safe.status).toBe("pass");
      expect(renderResearchClaimGuard(guarded)).toContain("research claim guard");
      expect(JSON.parse(renderResearchClaimGuardJson(safe)).claimGuard.status).toBe("pass");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("checks NHANES paper artifacts for reporting and QA requirements", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "research-paper-qa-"));
    try {
      const paper = path.join(dir, "paper.md");
      const evidence = path.join(dir, "analysis.json");
      await writeFile(paper, [
        "# Paper",
        "## Abstract",
        "A cross-sectional observational NHANES analysis.",
        "## Introduction",
        "Motivation.",
        "## Methods",
        "We used WTMEC2YR survey weight language and noted strata and PSU limitations.",
        "A weighted approximate logistic GLM estimated an adjusted odds ratio, adjusting for age, sex, and race.",
        "## Results",
        "There were 19,770 complete-case eligible rows and the adjusted odds ratio was 0.97.",
        "## Discussion",
        "The association was exploratory and cannot infer causality; this is not evidence that exposure caused the outcome.",
        "## Limitations",
        "Missing data and complete-case handling may bias results; approximate variance without full complex survey strata and PSU is a limitation.",
        "## Reproducibility",
        "Evidence is in analysis.json.",
        "## References",
        "https://www.strobe-statement.org/",
        "https://wwwn.cdc.gov/nchs/nhanes/AnalyticGuidelines.aspx",
        "https://arxiv.org/abs/2004.14066",
      ].join("\n"));
      await writeFile(evidence, `${JSON.stringify({
        rowCounts: { completeCaseEligible: 19770 },
        model: {
          type: "weighted approximate logistic GLM",
          covariates: ["vitd_10", "age_10", "female", "race_1"],
        },
        limitations: ["Approximate survey weights only"],
      }, null, 2)}\n`);

      const qa = await researchPaperQaCommand({ paperPath: paper, evidencePath: evidence });
      const parsed = JSON.parse(renderResearchPaperQaJson(qa)) as {
        schemaVersion: number;
        paperQa: { status: string };
      };

      expect(qa.status).toBe("pass");
      expect(qa.checks.map(check => check.id)).toContain("survey-design-language");
      expect(renderResearchPaperQa(qa)).toContain("research paper QA");
      expect(parsed.schemaVersion).toBe(1);
      expect(parsed.paperQa.status).toBe("pass");

      await writeFile(paper, [
        "# Paper",
        "## Abstract",
        "A cross-sectional observational NHANES analysis.",
        "## Introduction",
        "Motivation.",
        "## Methods",
        "We used WTMEC2YR survey weight language and noted strata and PSU limitations.",
        "A weighted approximate logistic GLM estimated an adjusted odds ratio, adjusting for age, sex, and race.",
        "## Results",
        "There were 19,770 complete-case eligible rows and the adjusted odds ratio was 0.97.",
        "## Discussion",
        "The exposure caused the outcome.",
        "## Limitations",
        "Missing data and complete-case handling may bias results; approximate variance without full complex survey strata and PSU is a limitation.",
        "## Reproducibility",
        "Evidence is in analysis.json.",
        "## References",
        "https://www.strobe-statement.org/",
        "https://wwwn.cdc.gov/nchs/nhanes/AnalyticGuidelines.aspx",
        "https://arxiv.org/abs/2004.14066",
      ].join("\n"));
      const unsafe = await researchPaperQaCommand({ paperPath: paper, evidencePath: evidence });
      expect(unsafe.status).toBe("fail");
      expect(unsafe.checks.find(check => check.id === "causal-language")?.status).toBe("fail");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("checks model-family and covariate consistency in NHANES papers", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "research-paper-model-qa-"));
    try {
      const paper = path.join(dir, "paper.md");
      const evidence = path.join(dir, "analysis.json");
      const basePaper = [
        "# Paper",
        "## Abstract",
        "A cross-sectional observational NHANES analysis.",
        "## Introduction",
        "Motivation.",
        "## Methods",
        "We used WTMEC2YR survey weight language and noted strata and PSU limitations.",
        "A weighted approximate linear regression estimated the adjusted mean difference, adjusting for age, sex, and race.",
        "## Results",
        "There were 20,334 complete-case eligible rows and the mean difference was -0.93 mg/dL (95% CI -1.56 to -0.29; p=0.00407).",
        "## Discussion",
        "The association was exploratory and cannot infer causality.",
        "## Limitations",
        "Missing data and complete-case handling may bias results; approximate variance without full complex survey strata and PSU is a limitation.",
        "## Reproducibility",
        "Evidence is in analysis.json.",
        "## References",
        "https://www.strobe-statement.org/",
        "https://wwwn.cdc.gov/nchs/nhanes/AnalyticGuidelines.aspx",
        "https://arxiv.org/abs/2004.14066",
      ].join("\n");
      await writeFile(paper, basePaper);
      await writeFile(evidence, `${JSON.stringify({
        rowCounts: { completeCaseEligible: 20334 },
        model: {
          type: "weighted approximate linear regression",
          covariates: ["ever_smoker", "age_10", "female", "race_1"],
          everSmokerMeanDifferenceMgDl: -0.9259742029913821,
          ci95: [-1.557703075185466, -0.2942453307972983],
          pValue: 0.004066911251292218,
        },
        analysisSpec: {
          inferencePolicy: {
            estimandType: "associational",
            varianceEstimator: "approximate_weighted",
            allowedInference: "exploratory_association",
            pValueLanguage: "approximate_only",
            causalClaimsAllowed: false,
          },
        },
        limitations: ["Approximate survey weights only"],
      }, null, 2)}\n`);

      const qa = await researchPaperQaCommand({ paperPath: paper, evidencePath: evidence });
      expect(qa.status).toBe("pass");
      expect(qa.checks.map(check => check.id)).toContain("model-family-linear-effect");
      expect(qa.checks.map(check => check.id)).toContain("model-covariate-disclosure");
      expect(qa.checks.find(check => check.id === "inference-policy-approximate-language")?.status).toBe("pass");

      await writeFile(paper, basePaper.replace("The association was exploratory and cannot infer causality.", "The association was statistically significant and cannot infer causality."));
      const overstrong = await researchPaperQaCommand({ paperPath: paper, evidencePath: evidence });
      expect(overstrong.status).toBe("fail");
      expect(overstrong.checks.find(check => check.id === "inference-policy-no-strong-significance")?.status).toBe("fail");

      await writeFile(paper, basePaper
        .replace("linear regression estimated the adjusted mean difference", "logistic GLM estimated the adjusted odds ratio")
        .replace("the mean difference was -0.93 mg/dL", "the odds ratio was 1.50"));
      const mismatched = await researchPaperQaCommand({ paperPath: paper, evidencePath: evidence });
      expect(mismatched.status).toBe("fail");
      expect(mismatched.checks.find(check => check.id === "model-family-linear-effect")?.status).toBe("fail");
      expect(mismatched.checks.find(check => check.id === "model-effect-numeric-consistency")?.status).toBe("fail");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("treats survey-logistic linearized models as logistic, not linear, in paper QA", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "research-paper-logistic-linearized-"));
    try {
      const paper = path.join(dir, "paper.md");
      const evidence = path.join(dir, "analysis.json");
      await writeFile(paper, [
        "# Paper",
        "## Abstract",
        "A cross-sectional observational NHANES analysis.",
        "## Introduction",
        "Motivation.",
        "## Methods",
        "We used WTMEC2YR survey weight language and noted strata and PSU limitations.",
        "A weighted logistic regression estimated an adjusted odds ratio, adjusting for age, sex, and race.",
        "## Results",
        "There were 24,836 complete-case eligible rows and the adjusted odds ratio was 1.10 (95% CI 1.09 to 1.11; p=9.36e-93).",
        "## Discussion",
        "The association was exploratory and cannot infer causality.",
        "## Limitations",
        "Missing data and complete-case handling may bias results; complex survey strata and PSU linearized variance was used.",
        "## Reproducibility",
        "Evidence is in analysis.json.",
        "## References",
        "https://www.strobe-statement.org/",
        "https://wwwn.cdc.gov/nchs/nhanes/AnalyticGuidelines.aspx",
        "https://wwwn.cdc.gov/nchs/nhanes/tutorials/weighting.aspx",
      ].join("\n"));
      await writeFile(evidence, `${JSON.stringify({
        rowCounts: { completeCaseEligible: 24836 },
        model: {
          type: "weighted logistic regression with strata/PSU linearized sandwich variance",
          covariates: ["BMXBMI", "RIDAGEYR", "RIAGENDR", "RIDRETH1"],
          logOddsCoefficient: 0.09433598185432909,
          oddsRatio: 1.0989289040694459,
          ci95: [1.09, 1.11],
          pValue: 9.36e-93,
        },
        analysisSpec: {
          inferencePolicy: {
            varianceEstimator: "complex_survey",
            allowedInference: "design_corrected_inference",
            pValueLanguage: "standard",
            causalClaimsAllowed: false,
          },
        },
        limitations: ["Complex survey linearized variance"],
      }, null, 2)}\n`);

      const qa = await researchPaperQaCommand({ paperPath: paper, evidencePath: evidence });
      expect(qa.status).toBe("pass");
      expect(qa.checks.find(check => check.id === "model-family-logistic-effect")?.status).toBe("pass");
      expect(qa.checks.find(check => check.id === "model-family-linear-effect")).toBeUndefined();
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("requires subsample-weight domain evidence and disclosure in paper QA", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "research-paper-subsample-qa-"));
    try {
      const paper = path.join(dir, "paper.md");
      const evidence = path.join(dir, "analysis.json");
      await writeFile(paper, [
        "# Paper",
        "## Abstract",
        "A cross-sectional observational NHANES analysis using the fasting subsample analytic population.",
        "## Introduction",
        "Motivation.",
        "## Methods",
        "We used WTSAF2YR survey weight language with strata and PSU linearized variance.",
        "The least common denominator was the morning fasting laboratory subsample, an eligible subgroup with a declared weight-domain rationale.",
        "A weighted linear regression estimated an adjusted mean difference, adjusting for age, sex, and race.",
        "## Results",
        "There were 9,000 complete-case eligible rows and the adjusted mean difference was 0.25 (95% CI 0.10 to 0.40; p=0.001).",
        "## Discussion",
        "The association was exploratory and cannot infer causality.",
        "## Limitations",
        "Missing data and complete-case handling may bias results; complex survey strata and PSU linearized variance was used.",
        "## Reproducibility",
        "Evidence is in analysis.json.",
        "## References",
        "https://www.strobe-statement.org/",
        "https://wwwn.cdc.gov/nchs/nhanes/AnalyticGuidelines.aspx",
        "https://wwwn.cdc.gov/nchs/nhanes/tutorials/weighting.aspx",
      ].join("\n"));
      await writeFile(evidence, `${JSON.stringify({
        rowCounts: { completeCaseEligible: 9000 },
        weights: {
          weight: "WTSAF2YR",
          strata: "SDMVSTRA",
          psu: "SDMVPSU",
          domain: {
            id: "fasting_subsample",
            label: "Morning fasting laboratory subsample",
            isSubsample: true,
            rationale: "Fasting glucose is measured in the fasting laboratory subsample.",
            eligibilityNote: "Use the eligible morning fasting laboratory subsample.",
          },
        },
        model: {
          type: "weighted linear regression with strata/PSU linearized sandwich variance",
          covariates: ["BMXBMI", "RIDAGEYR", "RIAGENDR", "RIDRETH1"],
          exposureCoefficient: 0.25,
          ci95: [0.10, 0.40],
          pValue: 0.001,
        },
        limitations: ["Complex survey linearized variance"],
      }, null, 2)}\n`);

      const qa = await researchPaperQaCommand({ paperPath: paper, evidencePath: evidence });
      expect(qa.status).toBe("pass");
      expect(qa.checks.find(check => check.id === "subsample-weight-disclosure")?.status).toBe("pass");
      expect(qa.checks.find(check => check.id === "subsample-weight-evidence")?.status).toBe("pass");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("requires a reader-facing study summary for paper-run evidence", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "research-paper-safety-header-"));
    try {
      const paper = path.join(dir, "paper.md");
      const evidence = path.join(dir, "analysis.json");
      await writeFile(paper, [
        "# Paper",
        "## Study Summary",
        "- Analysis type: observational cross-sectional association.",
        "- Survey method: weighted linear regression with WTMEC2YR survey weights, strata, and PSU.",
        "- Weight domain: MEC-exam participants.",
        "- Causal status: not causal; cannot infer causality.",
        "- Clinical actionability: not clinically actionable.",
        "- Human review: required before sharing.",
        "## Abstract",
        "Main finding: higher exposure was associated with higher outcome in this sample.",
        "A cross-sectional observational NHANES analysis.",
        "## Introduction",
        "Motivation.",
        "## Methods",
        "We used WTMEC2YR survey weight language and noted strata and PSU limitations.",
        "A weighted linear regression estimated an adjusted mean difference, adjusting for age, sex, and race.",
        "## Results",
        "There were 9,000 complete-case eligible rows and the adjusted mean difference was 0.25 (95% CI 0.10 to 0.40; p=0.001).",
        "## Discussion",
        "The association was exploratory and cannot infer causality.",
        "## Limitations",
        "Missing data and complete-case handling may bias results; complex survey strata and PSU linearized variance was used.",
        "## Reproducibility",
        "Evidence is in analysis.json.",
        "## References",
        "https://www.strobe-statement.org/",
        "https://wwwn.cdc.gov/nchs/nhanes/AnalyticGuidelines.aspx",
        "https://wwwn.cdc.gov/nchs/nhanes/tutorials/weighting.aspx",
      ].join("\n"));
      await writeFile(evidence, `${JSON.stringify({
        paperId: "fixture-paper-run",
        analysisSpecPath: "/tmp/analysis-spec.json",
        rowCounts: { completeCaseEligible: 9000 },
        weights: { weight: "WTMEC2YR", strata: "SDMVSTRA", psu: "SDMVPSU" },
        model: {
          type: "weighted linear regression with strata/PSU linearized sandwich variance",
          covariates: ["BMXBMI", "RIDAGEYR", "RIAGENDR", "RIDRETH1"],
          exposureCoefficient: 0.25,
          ci95: [0.10, 0.40],
          pValue: 0.001,
        },
        limitations: ["Complex survey linearized variance"],
      }, null, 2)}\n`);

      const qa = await researchPaperQaCommand({ paperPath: paper, evidencePath: evidence });
      expect(qa.status).toBe("pass");
      expect(qa.checks.find(check => check.id === "reader-safety-summary")?.status).toBe("pass");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("blocks internal framework jargon in reader-facing paper markdown", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "research-paper-language-qa-"));
    try {
      const paper = path.join(dir, "paper.md");
      await writeFile(paper, [
        "# Paper",
        "## Abstract",
        "Agenteer generated this paper from an AnalysisSpec.",
        "## Introduction",
        "Motivation.",
        "## Methods",
        "The result posture was local_review_ready.",
        "## Results",
        "There were 100 complete-case eligible rows.",
        "## Discussion",
        "This observational cross-sectional analysis cannot infer causality.",
        "## Limitations",
        "Missing data may bias results.",
        "## Reproducibility",
        "Evidence is available in companion files.",
        "## References",
        "https://www.strobe-statement.org/",
        "https://wwwn.cdc.gov/nchs/nhanes/AnalyticGuidelines.aspx",
        "https://wwwn.cdc.gov/nchs/nhanes/tutorials/weighting.aspx",
      ].join("\n"));

      const qa = await researchPaperQaCommand({ paperPath: paper });
      expect(qa.status).toBe("fail");
      expect(qa.checks.find(check => check.id === "reader-facing-language")?.status).toBe("fail");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("checks threshold provenance and diagnostic overclaiming in NHANES papers", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "research-paper-threshold-qa-"));
    try {
      const paper = path.join(dir, "paper.md");
      const evidence = path.join(dir, "analysis.json");
      await writeFile(paper, [
        "# Paper",
        "## Abstract",
        "A cross-sectional observational NHANES analysis of threshold-defined measured hypertension and UACR.",
        "## Introduction",
        "Motivation.",
        "## Methods",
        "We used WTMEC2YR survey weight language and noted strata and PSU limitations.",
        "Albuminuria was classified with a UACR threshold of 30 mg/g, and measured hypertension was defined as systolic blood pressure >=130 or diastolic blood pressure >=80.",
        "This is not a clinical hypertension diagnosis and a single UACR measurement cannot diagnose persistent albuminuria or CKD.",
        "## Results",
        "There were 20,461 complete-case eligible rows.",
        "## Discussion",
        "The association was exploratory and cannot infer causality.",
        "## Limitations",
        "Missing data and complete-case handling may bias results.",
        "## Reproducibility",
        "Evidence is in analysis.json.",
        "## References",
        "https://www.kidney.org/kidney-health/kidneydisease/siemens_hcp_acr",
        "https://professional.heart.org/en/science-news/2017-hypertension-clinical-guidelines/top-things-to-know",
        "https://wwwn.cdc.gov/nchs/nhanes/AnalyticGuidelines.aspx",
      ].join("\n"));
      await writeFile(evidence, `${JSON.stringify({
        rowCounts: { completeCaseEligible: 20461 },
        thresholds: {
          uacrAlbuminuria: "URDACT >= 30 mg/g",
          measuredHypertension: "BPXSY1 >= 130 or BPXDI1 >= 80",
        },
        limitations: ["Single-visit thresholds", "Approximate survey weights only"],
      }, null, 2)}\n`);

      const qa = await researchPaperQaCommand({ paperPath: paper, evidencePath: evidence });
      expect(qa.status).toBe("pass");
      expect(qa.checks.map(check => check.id)).toContain("threshold-provenance");
      expect(qa.checks.map(check => check.id)).toContain("single-measure-kidney-caveat");
      expect(qa.checks.map(check => check.id)).toContain("single-measure-bp-caveat");

      await writeFile(paper, [
        "# Paper",
        "## Abstract",
        "A cross-sectional observational NHANES analysis.",
        "## Introduction",
        "Motivation.",
        "## Methods",
        "We used WTMEC2YR survey weight language and noted strata and PSU limitations.",
        "## Results",
        "There were 20,461 complete-case eligible rows and participants were diagnosed hypertension.",
        "## Discussion",
        "The association was exploratory and cannot infer causality.",
        "## Limitations",
        "Missing data and complete-case handling may bias results.",
        "## Reproducibility",
        "Evidence is in analysis.json.",
        "## References",
        "https://www.kidney.org/kidney-health/kidneydisease/siemens_hcp_acr",
        "https://professional.heart.org/en/science-news/2017-hypertension-clinical-guidelines/top-things-to-know",
        "https://wwwn.cdc.gov/nchs/nhanes/AnalyticGuidelines.aspx",
      ].join("\n"));
      const unsafe = await researchPaperQaCommand({ paperPath: paper, evidencePath: evidence });
      expect(unsafe.status).toBe("fail");
      expect(unsafe.checks.find(check => check.id === "diagnosis-overclaiming")?.status).toBe("fail");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("does not require blood-pressure caveats for non-BP papers with numeric eligibility thresholds", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "research-paper-non-bp-threshold-"));
    try {
      const paper = path.join(dir, "paper.md");
      const evidence = path.join(dir, "analysis.json");
      await writeFile(paper, [
        "# Paper",
        "## Abstract",
        "A cross-sectional observational NHANES analysis.",
        "## Introduction",
        "Motivation.",
        "## Methods",
        "We used WTMEC2YR survey weight language and noted strata and PSU limitations.",
        "A weighted approximate linear regression estimated the adjusted mean difference, adjusting for age, sex, and race.",
        "## Results",
        "There were 18,394 complete-case eligible rows and the mean difference was 1.42 mg/dL (95% CI 1.28 to 1.56; p=2.16e-87).",
        "## Discussion",
        "The association was exploratory and cannot infer causality.",
        "## Limitations",
        "Missing data and complete-case handling may bias results; approximate variance without full complex survey strata and PSU is a limitation.",
        "## Reproducibility",
        "Evidence is in analysis.json.",
        "## References",
        "https://www.strobe-statement.org/",
        "https://wwwn.cdc.gov/nchs/nhanes/AnalyticGuidelines.aspx",
        "https://wwwn.cdc.gov/nchs/nhanes/tutorials/weighting.aspx",
      ].join("\n"));
      await writeFile(evidence, `${JSON.stringify({
        rowCounts: { completeCaseEligible: 18394 },
        population: { eligibility: ["RIDAGEYR >= 20"] },
        model: {
          type: "weighted approximate linear regression",
          covariates: ["pir", "age_10", "female", "race_1"],
          pirMeanDifferenceHdlMgDl: 1.4216180158918028,
          ci95: [1.2817593542764187, 1.5614766775071869],
          pValue: 2.1574710295628383e-87,
        },
        analysisSpec: {
          inferencePolicy: {
            varianceEstimator: "approximate_weighted",
            allowedInference: "exploratory_association",
            pValueLanguage: "approximate_only",
            causalClaimsAllowed: false,
          },
        },
        limitations: ["Approximate survey weights only"],
      }, null, 2)}\n`);

      const qa = await researchPaperQaCommand({ paperPath: paper, evidencePath: evidence });
      expect(qa.status).toBe("pass");
      expect(qa.checks.find(check => check.id === "single-measure-bp-caveat")).toBeUndefined();
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("indexes generated NHANES paper directories and latest QA status", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "research-paper-index-"));
    try {
      const first = path.join(dir, "0001-first-paper");
      const second = path.join(dir, "0002-second-paper");
      await mkdir(first);
      await mkdir(second);
      await writeFile(path.join(first, "analysis.json"), `${JSON.stringify({
        title: "First paper",
        rowCounts: { completeCaseEligible: 123 },
      })}\n`);
      await writeFile(path.join(first, "qa-cli.json"), `${JSON.stringify({
        paperQa: { status: "pass", summary: "10/10 paper QA checks passed." },
      })}\n`);
      await writeFile(path.join(first, "paper.md"), [
        "# First paper",
        "## Abstract",
        "This paper uses reader-facing scientific language.",
      ].join("\n"));
      await writeFile(path.join(second, "analysis.json"), `${JSON.stringify({
        title: "Second paper",
        rowCounts: { completeCaseEligible: 456 },
      })}\n`);
      await writeFile(path.join(second, "paper.md"), [
        "# Second paper",
        "## Abstract",
        "Agenteer generated this paper from an AnalysisSpec.",
      ].join("\n"));
      await writeFile(path.join(second, "qa-old.json"), `${JSON.stringify({
        paperQa: { status: "warning", summary: "9/10 paper QA checks passed." },
      })}\n`);
      await new Promise(resolve => setTimeout(resolve, 5));
      await writeFile(path.join(second, "qa-new.json"), `${JSON.stringify({
        paperQa: { status: "pass", summary: "12/12 paper QA checks passed." },
      })}\n`);
      await writeFile(path.join(second, "runner-record.json"), `${JSON.stringify({
        schemaVersion: 1,
        paperRunnerRecord: {
          recordType: "agenteer.research.paper-runner-record",
          status: "succeeded",
          analysisSpec: { binding: "retrospective" },
          inputs: [],
          outputs: [],
        },
      })}\n`);
      const out = path.join(dir, "INDEX.md");

      const index = await researchPaperIndexCommand({ papersDir: dir, outPath: out });
      const parsed = JSON.parse(renderResearchPaperIndexJson(index)) as {
        schemaVersion: number;
        paperIndex: { papers: Array<{ id: string; latestQaStatus: string; latestQaSummary: string; runnerStatus: string }> };
      };

      expect(index.papers).toHaveLength(2);
      expect(index.papers[1]?.latestQaPath).toContain("qa-new.json");
      expect(index.papers[0]?.readerFacingLanguageStatus).toBe("pass");
      expect(index.papers[1]?.readerFacingLanguageStatus).toBe("legacy_or_fail");
      expect(index.papers[1]?.readerFacingLanguageHits).toEqual(expect.arrayContaining(["Agenteer", "AnalysisSpec"]));
      expect(index.papers[0]?.runnerStatus).toBe("missing");
      expect(index.papers[1]?.runnerStatus).toBe("retrospective_succeeded");
      expect(parsed.schemaVersion).toBe(1);
      expect(parsed.paperIndex.papers[1]?.latestQaSummary).toContain("12/12");
      expect(parsed.paperIndex.papers[1]?.runnerStatus).toBe("retrospective_succeeded");
      expect(renderResearchPaperIndex(index)).toContain("First paper");
      expect(renderResearchPaperIndex(index)).toContain("legacy/fail");
      expect(renderResearchPaperIndex(index)).toContain("retrospective_succeeded");
      expect(await readFile(out, "utf-8")).toContain("Second paper");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("summarizes paper lifecycle across QA, runner, task, and capabilities", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "research-paper-lifecycle-"));
    try {
      const paperDir = path.join(dir, "0001-paper");
      const interopDir = path.join(paperDir, "interop");
      const capabilityDir = path.join(dir, "capabilities");
      await mkdir(interopDir, { recursive: true });
      await mkdir(capabilityDir);
      await writeFile(path.join(paperDir, "analysis.json"), `${JSON.stringify({
        title: "Lifecycle paper",
      })}\n`);
      await writeFile(path.join(paperDir, "qa-cli.json"), `${JSON.stringify({
        paperQa: { status: "pass", summary: "26/26 paper QA checks passed." },
      })}\n`);
      await writeFile(path.join(paperDir, "runner-record.json"), `${JSON.stringify({
        paperRunnerRecord: {
          recordType: "agenteer.research.paper-runner-record",
          status: "succeeded",
          analysisSpec: { binding: "spec-governed" },
          warnings: [],
        },
      })}\n`);
      await writeFile(path.join(paperDir, "rerun-stability.json"), `${JSON.stringify({
        paperRerunStability: { status: "pass", summary: "15/15 rerun stability checks passed." },
      })}\n`);
      await writeFile(path.join(interopDir, "task-succeeded.json"), `${JSON.stringify({
        taskEnvelope: {
          status: "succeeded",
          evidenceReceipts: [{ status: "pass" }, { status: "warning" }],
        },
      })}\n`);
      await writeFile(path.join(interopDir, "task-validation-with-capabilities.json"), `${JSON.stringify({
        interopValidation: { status: "pass", issues: [] },
      })}\n`);
      await writeFile(path.join(capabilityDir, "research.paper.qa.validation.json"), `${JSON.stringify({
        interopValidation: { status: "pass", issues: [] },
      })}\n`);

      const lifecycle = await researchPaperLifecycleCommand({ paperDir, capabilityDir });
      const parsed = JSON.parse(renderResearchPaperLifecycleJson(lifecycle)) as {
        paperLifecycle: { lifecycleStatus: string };
      };

      expect(lifecycle.lifecycleStatus).toBe("ready_for_local_review");
      expect(lifecycle.task.receiptStatuses).toEqual(["pass", "warning"]);
      expect(lifecycle.capabilities.status).toBe("pass");
      expect(lifecycle.rerunStability.status).toBe("pass");
      expect(lifecycle.statsRun.status).toBe("missing");
      expect(renderResearchPaperLifecycle(lifecycle)).toContain("research paper lifecycle");
      expect(renderResearchPaperLifecycle(lifecycle)).toContain("rerun stability: pass");
      expect(renderResearchPaperLifecycle(lifecycle)).toContain("stats-run: missing");
      expect(parsed.paperLifecycle.lifecycleStatus).toBe("ready_for_local_review");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("surfaces stats-run failures in paper lifecycle", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "research-stats-lifecycle-"));
    try {
      const paperDir = path.join(dir, "stats-backed");
      const interopDir = path.join(paperDir, "interop");
      await mkdir(interopDir, { recursive: true });
      await writeFile(path.join(paperDir, "analysis.json"), `${JSON.stringify({ title: "Stats-backed lifecycle" })}\n`);
      await writeFile(path.join(paperDir, "qa-cli.json"), `${JSON.stringify({ paperQa: { status: "pass", summary: "stats packet QA passed" } })}\n`);
      await writeFile(path.join(paperDir, "runner-record.json"), `${JSON.stringify({
        paperRunnerRecord: {
          recordType: "agenteer.research.paper-runner-record",
          status: "succeeded",
          analysisSpec: { binding: "spec-governed" },
          warnings: [],
        },
      })}\n`);
      await writeFile(path.join(interopDir, "task-succeeded.json"), `${JSON.stringify({ taskEnvelope: { status: "succeeded", evidenceReceipts: [{ status: "pass" }] } })}\n`);
      await writeFile(path.join(interopDir, "task-validation-with-capabilities.json"), `${JSON.stringify({ interopValidation: { status: "pass", issues: [] } })}\n`);
      await writeFile(path.join(paperDir, "stats-run.json"), `${JSON.stringify({
        schemaVersion: 1,
        runId: "statsrun-test",
        method: "linear-regression",
        status: "failed",
        rowCount: 0,
        completeCaseN: 0,
        variables: ["y", "x"],
        binding: {
          methodSelectionPath: null,
          methodSelectionId: null,
          methodId: null,
          analysisSpecPath: null,
          specHash: null,
          status: "unbound",
        },
        parameters: {},
        estimates: [],
        diagnostics: {},
        issues: [{ severity: "blocker", code: "SURVEY_DESIGN_REQUIRES_SURVEY_RUNNER", message: "Use a survey runner.", evidenceRefs: [] }],
        warnings: [],
        errors: ["Complex-survey design requires a survey-aware runner."],
        resultPosture: {
          status: "blocked_survey_required",
          label: "Blocked: survey-aware runner required",
          interpretationBoundary: "This run cannot support inferential research claims because complex-survey variance was declared but not executed.",
          supports: ["failure attribution", "runner routing decision"],
          cannotSupport: ["effect estimates", "confidence intervals", "p-values", "paper-ready inference"],
          nextAction: "Run a survey-aware backend.",
        },
        artifacts: [],
        outDir: paperDir,
      })}\n`);

      const lifecycle = await researchPaperLifecycleCommand({ paperDir });

      expect(lifecycle.statsRun.status).toBe("failed");
      expect(lifecycle.statsRun.issueCodes).toContain("SURVEY_DESIGN_REQUIRES_SURVEY_RUNNER");
      expect(lifecycle.statsRun.posture).toBe("blocked_survey_required");
      expect(lifecycle.statsRun.interpretationBoundary).toContain("cannot support inferential research claims");
      expect(lifecycle.lifecycleStatus).toBe("blocked");
      expect(lifecycle.blockers.join(" ")).toContain("stats-run failed");
      expect(renderResearchPaperLifecycle(lifecycle)).toContain("stats-run: failed method=linear-regression binding=unbound posture=blocked_survey_required");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("detects scientific-field drift between repeated paper runs", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "research-paper-rerun-stability-"));
    try {
      const baseline = path.join(dir, "baseline");
      const repeat = path.join(dir, "repeat");
      await mkdir(baseline, { recursive: true });
      await mkdir(repeat, { recursive: true });
      const analysis = {
        rowCounts: { completeCaseEligible: 100 },
        weights: { weight: "WTMEC2YR", strata: "SDMVSTRA", psu: "SDMVPSU", domain: { id: "mec_exam", isSubsample: false } },
        model: {
          type: "weighted linear regression with strata/PSU linearized sandwich variance",
          exposureCoefficient: 0.5,
          standardError: 0.1,
          ci95: [0.3, 0.7],
          pValue: 0.01,
        },
      };
      const runner = {
        recordType: "agenteer.research.paper-runner-record",
        analysisSpec: { specHash: "spec-1" },
        inputs: [{ path: "/tmp/input.parquet", sha256: "abc" }],
      };
      for (const target of [baseline, repeat]) {
        await writeFile(path.join(target, "analysis.json"), `${JSON.stringify(analysis, null, 2)}\n`);
        await writeFile(path.join(target, "qa-cli.json"), `${JSON.stringify({ paperQa: { status: "pass" } }, null, 2)}\n`);
        await writeFile(path.join(target, "lifecycle.json"), `${JSON.stringify({ paperLifecycle: { lifecycleStatus: "ready_for_local_review" } }, null, 2)}\n`);
        await writeFile(path.join(target, "runner-record.json"), `${JSON.stringify(runner, null, 2)}\n`);
      }

      const pass = await researchPaperRerunStabilityCommand({ baselineDir: baseline, repeatDir: repeat });
      expect(pass.status).toBe("pass");

      await writeFile(path.join(repeat, "analysis.json"), `${JSON.stringify({
        ...analysis,
        model: { ...analysis.model, exposureCoefficient: 0.55 },
      }, null, 2)}\n`);
      const fail = await researchPaperRerunStabilityCommand({ baselineDir: baseline, repeatDir: repeat, tolerance: 1e-8 });
      expect(fail.status).toBe("fail");
      expect(fail.comparisons.find(item => item.field === "model.exposureCoefficient")?.status).toBe("fail");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("creates paper runner records with AnalysisSpec binding and hashed file evidence", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "research-paper-runner-record-"));
    try {
      const specPath = path.join(dir, "analysis-spec.json");
      const inputPath = path.join(dir, "input.json");
      const paperPath = path.join(dir, "paper.md");
      const outPath = path.join(dir, "runner-record.json");
      await writeFile(specPath, `${JSON.stringify({
        schemaVersion: 1,
        analysisSpec: {
          schemaVersion: 1,
          id: "analysis_fixture",
          specHash: "fixture-spec-hash",
        },
      }, null, 2)}\n`);
      await writeFile(inputPath, JSON.stringify([{ SEQN: 1, WTMEC2YR: 2 }], null, 2));
      await writeFile(paperPath, "# Paper\n");

      const record = await researchPaperRunnerRecordCommand({
        paperId: "fixture-paper",
        commandSummary: "Ran deterministic fixture paper generation.",
        analysisSpecPath: specPath,
        binding: "retrospective",
        inputFiles: [inputPath],
        outputFiles: [paperPath],
        weighting: "WTMEC2YR normalized approximate weights",
        variance: "approximate weighted variance",
        population: "fixture adults",
        outPath,
      });
      const parsed = JSON.parse(renderResearchPaperRunnerRecordJson(record)) as {
        paperRunnerRecord: { analysisSpec: { specHash: string }; inputs: Array<{ sha256: string }> };
      };

      expect(record.analysisSpec.specHash).toBe("fixture-spec-hash");
      expect(record.warnings.find(issue => issue.code === "RETROSPECTIVE_ANALYSIS_SPEC_BINDING")?.severity).toBe("warning");
      expect(record.nextAction).toContain("Do not treat this as spec-governed");
      expect(record.analysisSpec.artifactHash).toMatch(/^[a-f0-9]{64}$/);
      expect(record.inputs[0]?.sha256).toMatch(/^[a-f0-9]{64}$/);
      expect(record.outputs[0]?.path).toBe(paperPath);
      expect(parsed.paperRunnerRecord.analysisSpec.specHash).toBe("fixture-spec-hash");
      expect(renderResearchPaperRunnerRecord(record)).toContain("spec binding: retrospective");
      expect(renderResearchPaperRunnerRecord(record)).toContain("research paper runner record");
      expect(await readFile(outPath, "utf-8")).toContain("fixture-paper");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("renders reusable research pipeline stages as machine-readable JSON", () => {
    const rendered = renderResearchPipelineStagesJson(researchPipelineStagesCommand());
    const parsed = JSON.parse(rendered) as {
      schemaVersion: number;
      stages: Array<{ id: string; nodeId: string; humanReview: boolean }>;
    };

    expect(parsed.schemaVersion).toBe(1);
    expect(parsed.stages.map(stage => stage.id)).toContain("runner-spec");
    expect(parsed.stages.find(stage => stage.id === "approval")?.humanReview).toBe(true);
  });

  it("renders the research methods framework as structured pipeline policy", () => {
    const framework = researchMethodsFrameworkCommand();
    const parsed = JSON.parse(renderResearchMethodsFrameworkJson(framework)) as typeof framework;

    expect(framework.schemaVersion).toBe(1);
    expect(framework.items.map(item => item.id)).toEqual(expect.arrayContaining([
      "strobe",
      "target-trial-emulation",
      "missing-data",
      "ro-crate",
      "w3c-prov",
    ]));
    expect(framework.items.find(item => item.id === "survey-design")?.pipelineImplication).toContain("local fixtures");
    expect(renderResearchMethodsFramework(framework)).toContain("research methods framework");
    expect(parsed.items.find(item => item.id === "fair")?.sourceUrl).toContain("nature.com");
  });

  it("inspects a generated research design packet", async () => {
    const repo = await makeRepo();
    const outDir = await mkdtemp(path.join(os.tmpdir(), "research-packet-"));
    try {
      await researchDesignCommand({
        project: "medbrevia-nhanes",
        repoDir: repo,
        question: "Vitamin D deficiency and measured hypertension in NHANES adults",
        outDir,
      });
      const inspected = await researchInspectPacketCommand(outDir);

      expect(inspected.blockers).toBe(0);
      expect(inspected.registrySha256).toMatch(/^[a-f0-9]{64}$/);
      expect(renderResearchPacketInspect(inspected)).toContain("next: Proceed");
    } finally {
      await rm(repo, { recursive: true, force: true });
      await rm(outDir, { recursive: true, force: true });
    }
  });

  it("critiques packet methodology before execution", async () => {
    const outDir = await mkdtemp(path.join(os.tmpdir(), "research-critique-"));
    try {
      await writeFile(path.join(outDir, "design.json"), `${JSON.stringify({
        packetVersion: 0,
        source: { registrySha256: "a".repeat(64) },
        protocol: {
          title: "Body Mass Index and HbA1c",
          clinicalQuestion: "Among NHANES adults, how does measured obesity relate to HbA1c-defined diabetes status?",
          dataset: "nhanes",
          cycles: ["2017-2020-prepandemic"],
          approvedDataInputs: ["demographics", "anthropometrics", "diabetes"],
          exposure: { variables: ["BMXBMI"] },
          endpoint: { variables: ["LBXGH"] },
          covariates: ["RIDAGEYR", "RIAGENDR", "RIDRETH3"],
          caveats: ["NHANES is observational and cross-sectional."],
        },
        diagnostics: { blockers: [], warnings: [] },
      }, null, 2)}\n`);

      const critique = await researchCritiquePacketCommand(outDir);

      expect(critique.status).toBe("needs_review");
      expect(critique.issues.map(issue => issue.code)).toContain("MISSING_HBA1C_THRESHOLD");
      expect(renderResearchPacketCritique(critique)).toContain("MISSING_HBA1C_THRESHOLD");
    } finally {
      await rm(outDir, { recursive: true, force: true });
    }
  });

  it("blocks income-to-poverty questions when income is demoted to a covariate", async () => {
    const outDir = await mkdtemp(path.join(os.tmpdir(), "research-income-critique-"));
    try {
      await writeFile(path.join(outDir, "design.json"), `${JSON.stringify({
        packetVersion: 0,
        source: { registrySha256: "a".repeat(64) },
        protocol: {
          title: "Body Mass Index and Lipids",
          clinicalQuestion: "In NHANES adults, are lipid markers patterned by family income-to-poverty ratio after BMI adjustment?",
          dataset: "nhanes",
          cycles: ["2017-2020-prepandemic"],
          approvedDataInputs: ["demographics", "anthropometrics", "lipids"],
          exposure: { variables: ["BMXBMI"] },
          endpoint: { variables: ["LBXTC", "LBDHDD"] },
          covariates: ["RIDAGEYR", "RIAGENDR", "RIDRETH3", "INDFMPIR"],
          caveats: ["NHANES is observational and cross-sectional."],
        },
        diagnostics: { blockers: [], warnings: [] },
      }, null, 2)}\n`);

      const critique = await researchCritiquePacketCommand(outDir);

      expect(critique.status).toBe("blocked");
      expect(critique.issues.map(issue => issue.code)).toEqual(expect.arrayContaining([
        "MISSING_INCOME_EXPOSURE",
        "INCOME_EXPOSURE_AS_COVARIATE",
      ]));
    } finally {
      await rm(outDir, { recursive: true, force: true });
    }
  });

  it("blocks sex-difference questions when sex is only an adjustment covariate", async () => {
    const outDir = await mkdtemp(path.join(os.tmpdir(), "research-sex-critique-"));
    try {
      await writeFile(path.join(outDir, "design.json"), `${JSON.stringify({
        packetVersion: 0,
        source: { registrySha256: "a".repeat(64) },
        protocol: {
          title: "Smoking History and Blood Pressure",
          clinicalQuestion: "Is smoking history associated with measured blood pressure differently by sex among NHANES adults?",
          dataset: "nhanes",
          cycles: ["2017-2020-prepandemic"],
          approvedDataInputs: ["demographics", "smoking", "blood_pressure"],
          exposure: { variables: ["SMQ020"] },
          endpoint: { variables: ["BPXSY1", "BPXDI1"] },
          covariates: ["RIDAGEYR", "RIAGENDR", "RIDRETH3"],
          stratifiers: [],
          caveats: ["NHANES is observational and cross-sectional."],
        },
        diagnostics: { blockers: [], warnings: [] },
      }, null, 2)}\n`);

      const critique = await researchCritiquePacketCommand(outDir);

      expect(critique.status).toBe("blocked");
      expect(critique.issues.map(issue => issue.code)).toEqual(expect.arrayContaining([
        "MISSING_SEX_STRATIFIER",
        "SEX_EFFECT_MODIFIER_AS_COVARIATE",
      ]));
    } finally {
      await rm(outDir, { recursive: true, force: true });
    }
  });

  it("blocks self-reported hypertension questions without BPQ020 exposure", async () => {
    const outDir = await mkdtemp(path.join(os.tmpdir(), "research-self-report-critique-"));
    try {
      await writeFile(path.join(outDir, "design.json"), `${JSON.stringify({
        packetVersion: 0,
        source: { registrySha256: "a".repeat(64) },
        protocol: {
          title: "Blood Pressure and Blood Pressure",
          clinicalQuestion: "Among NHANES adults, is self-reported high blood pressure associated with measured hypertension?",
          dataset: "nhanes",
          cycles: ["2017-2020-prepandemic"],
          approvedDataInputs: ["demographics", "blood_pressure"],
          exposure: { variables: ["BPXSY1"] },
          endpoint: { variables: ["BPXSY1", "BPXDI1"] },
          covariates: ["RIDAGEYR", "RIAGENDR", "RIDRETH3"],
          stratifiers: [],
          caveats: ["NHANES is observational and cross-sectional."],
        },
        diagnostics: { blockers: [], warnings: [] },
      }, null, 2)}\n`);

      const critique = await researchCritiquePacketCommand(outDir);

      expect(critique.status).toBe("blocked");
      expect(critique.issues.map(issue => issue.code)).toContain("MISSING_SELF_REPORTED_HYPERTENSION_EXPOSURE");
    } finally {
      await rm(outDir, { recursive: true, force: true });
    }
  });

  it("passes critique when generated definitions cover thresholds", async () => {
    const repo = await makeRepo();
    const outDir = await mkdtemp(path.join(os.tmpdir(), "research-defined-"));
    try {
      await researchDesignCommand({
        project: "medbrevia-nhanes",
        repoDir: repo,
        question: "Vitamin D deficiency and measured hypertension in NHANES adults",
        outDir,
      });

      const critique = await researchCritiquePacketCommand(outDir);

      expect(critique.status).toBe("pass");
      expect(critique.issues.map(issue => issue.code)).toContain("READY_FOR_SCOUT");
    } finally {
      await rm(repo, { recursive: true, force: true });
      await rm(outDir, { recursive: true, force: true });
    }
  });

  it("validates packet methods against broader research policy", async () => {
    const repo = await makeRepo();
    const outDir = await mkdtemp(path.join(os.tmpdir(), "research-methods-validation-"));
    try {
      await researchDesignCommand({
        project: "medbrevia-nhanes",
        repoDir: repo,
        question: "Vitamin D deficiency and measured hypertension in NHANES adults",
        outDir,
      });

      const validation = await researchValidateMethodsCommand(outDir);
      const parsed = JSON.parse(renderResearchMethodsValidationJson(validation)) as {
        schemaVersion: number;
        methodsValidation: { status: string; appliedFrameworkItems: string[] };
      };

      expect(validation.status).toBe("needs_review");
      expect(validation.appliedFrameworkItems).toEqual(expect.arrayContaining(["strobe", "missing-data", "survey-design", "fair", "w3c-prov"]));
      expect(validation.issues.map(issue => issue.code)).toEqual(expect.arrayContaining([
        "MISSINGNESS_NOT_COMPUTED",
        "MISSING_REPRODUCIBILITY_MANIFEST",
      ]));
      expect(renderResearchMethodsValidation(validation)).toContain("research methods validation");
      expect(parsed.schemaVersion).toBe(1);
    } finally {
      await rm(repo, { recursive: true, force: true });
      await rm(outDir, { recursive: true, force: true });
    }
  });

  it("blocks causal language until target trial components are specified", async () => {
    const outDir = await mkdtemp(path.join(os.tmpdir(), "research-methods-causal-"));
    try {
      await writeFile(path.join(outDir, "design.json"), `${JSON.stringify({
        packetVersion: 0,
        source: { registrySha256: "a".repeat(64) },
        protocol: {
          title: "Treatment and Outcome",
          clinicalQuestion: "What is the effect of treatment on mortality in adults?",
          dataset: "registry",
          cycles: ["2020"],
          approvedDataInputs: ["demographics", "treatment", "outcomes"],
          population: { filters: [] },
          exposure: { variables: ["TRT"] },
          endpoint: { variables: ["DEATH"] },
          covariates: ["AGE"],
          stratifiers: [],
          derivedDefinitions: [],
          surveyDesign: { weightVariable: null, strataVariable: null, psuVariable: null },
          caveats: ["Observational data require careful interpretation."],
        },
        diagnostics: { blockers: [], warnings: [] },
      }, null, 2)}\n`);

      const validation = await researchValidateMethodsCommand(outDir);

      expect(validation.status).toBe("blocked");
      expect(validation.appliedFrameworkItems).toContain("target-trial-emulation");
      expect(validation.issues.map(issue => issue.code)).toContain("CAUSAL_LANGUAGE_REQUIRES_TARGET_TRIAL_SPEC");
    } finally {
      await rm(outDir, { recursive: true, force: true });
    }
  });

  it("creates a local scout plan from a design packet", async () => {
    const repo = await makeRepo();
    const outDir = await mkdtemp(path.join(os.tmpdir(), "research-scout-"));
    try {
      await researchDesignCommand({
        project: "medbrevia-nhanes",
        repoDir: repo,
        question: "Vitamin D deficiency and measured hypertension in NHANES adults",
        outDir,
      });

      const plan = await researchScoutPlanCommand(outDir);

      expect(plan.requiredVariables).toEqual(expect.arrayContaining(["SEQN", "LBXVIDMS", "BPXSY1", "WTMEC2YR", "SDMVSTRA", "SDMVPSU"]));
      expect(plan.caseRequirements.populationFilters).toEqual(expect.arrayContaining(["RIDSTATR == 2", "RIDAGEYR >= 20 when adult population is intended"]));
      expect(plan.caseRequirements.endpointAnyOf).toEqual(expect.arrayContaining(["BPXSY1", "BPXDI1"]));
      expect(plan.caseRequirements.covariatesAllOf).toEqual(expect.arrayContaining(["RIDAGEYR", "RIAGENDR", "RIDRETH3"]));
      expect(plan.derivedDefinitions.map(def => def.id)).toContain("measured_hypertension");
      expect(renderResearchScoutPlan(plan)).toContain("population filters [RIDSTATR == 2");
      expect(renderResearchScoutPlan(plan)).toContain("local data: not_available");
    } finally {
      await rm(repo, { recursive: true, force: true });
      await rm(outDir, { recursive: true, force: true });
    }
  });

  it("computes scout metrics from a local JSON fixture", async () => {
    const repo = await makeRepo();
    const outDir = await mkdtemp(path.join(os.tmpdir(), "research-scout-fixture-"));
    const fixture = path.join(outDir, "rows.json");
    try {
      await researchDesignCommand({
        project: "medbrevia-nhanes",
        repoDir: repo,
        question: "Vitamin D deficiency and measured hypertension in NHANES adults",
        outDir,
      });
      await writeFile(fixture, `${JSON.stringify([
        {
          SEQN: 1,
          RIDSTATR: 2,
          RIDAGEYR: 44,
          RIAGENDR: 1,
          RIDRETH3: 3,
          LBXVIDMS: 40,
          BPXSY1: 140,
          BPXDI1: 90,
          WTMEC2YR: 1.2,
          SDMVSTRA: 101,
          SDMVPSU: 1,
        },
        {
          SEQN: 2,
          RIDSTATR: 1,
          RIDAGEYR: 35,
          RIAGENDR: 2,
          RIDRETH3: 4,
          LBXVIDMS: 70,
          BPXSY1: 120,
          BPXDI1: 70,
          WTMEC2YR: 1,
          SDMVSTRA: 101,
          SDMVPSU: 2,
        },
      ], null, 2)}\n`);

      const plan = await researchScoutPlanCommand(outDir, fixture);

      expect(plan.status).toBe("computed");
      expect(plan.metrics?.baseRows).toBe(2);
      expect(plan.metrics?.eligibleRows).toBe(1);
      expect(plan.metrics?.completeCaseRows).toBe(1);
      expect(renderResearchScoutPlan(plan)).toContain("complete-case rows: 1");
    } finally {
      await rm(repo, { recursive: true, force: true });
      await rm(outDir, { recursive: true, force: true });
    }
  });

  it("records human-in-the-loop packet approval", async () => {
    const repo = await makeRepo();
    const outDir = await mkdtemp(path.join(os.tmpdir(), "research-approval-"));
    try {
      await researchDesignCommand({
        project: "medbrevia-nhanes",
        repoDir: repo,
        question: "Vitamin D deficiency and measured hypertension in NHANES adults",
        outDir,
      });
      await researchScoutPlanCommand(outDir);

      const approval = await researchApprovePacketCommand(outDir, "Protocol and scout plan reviewed.");

      expect(approval.schemaVersion).toBe(1);
      expect(approval.eventType).toBe("research.packet.approval");
      expect(approval.decisionId).toHaveLength(16);
      expect(approval.recordHash).toHaveLength(64);
      expect(approval.status).toBe("approved");
      expect(approval.critiqueStatus).toBe("pass");
      expect(approval.scoutStatus).toBe("plan_ready");
      expect(renderResearchApproval(approval)).toContain("Protocol and scout plan reviewed.");
      const verification = await researchApprovalVerifyCommand(outDir);
      const parsed = JSON.parse(renderResearchApprovalVerificationJson(verification)) as {
        schemaVersion: number;
        approvalVerification: { status: string };
      };
      expect(verification.status).toBe("valid");
      expect(renderResearchApprovalVerification(verification)).toContain("status: valid");
      expect(parsed.schemaVersion).toBe(1);
      expect(parsed.approvalVerification.status).toBe("valid");
    } finally {
      await rm(repo, { recursive: true, force: true });
      await rm(outDir, { recursive: true, force: true });
    }
  });

  it("runs a local fixture analysis after approval", async () => {
    const repo = await makeRepo();
    const outDir = await mkdtemp(path.join(os.tmpdir(), "research-analysis-"));
    const fixture = path.join(outDir, "rows.json");
    try {
      await researchDesignCommand({
        project: "medbrevia-nhanes",
        repoDir: repo,
        question: "Vitamin D deficiency and measured hypertension in NHANES adults",
        outDir,
      });
      await writeFile(fixture, `${JSON.stringify([
        { SEQN: 1, RIDSTATR: 2, RIDAGEYR: 44, RIAGENDR: 1, RIDRETH3: 3, LBXVIDMS: 40, BPXSY1: 140, BPXDI1: 90, WTMEC2YR: 1 },
        { SEQN: 2, RIDSTATR: 2, RIDAGEYR: 60, RIAGENDR: 2, RIDRETH3: 4, LBXVIDMS: 80, BPXSY1: 110, BPXDI1: 70, WTMEC2YR: 1 },
      ], null, 2)}\n`);
      await researchScoutPlanCommand(outDir, fixture);
      await researchApprovePacketCommand(outDir, "Approved for fixture analysis.");

      const result = await researchAnalyzeLocalCommand(outDir, fixture);

      expect(result.completeCaseRows).toBe(2);
      expect(result.exposurePositiveRows).toBe(1);
      expect(result.endpointPositiveRows).toBe(1);
      expect(renderResearchAnalysisResult(result)).toContain("complete-case rows: 2");
    } finally {
      await rm(repo, { recursive: true, force: true });
      await rm(outDir, { recursive: true, force: true });
    }
  });

  it("applies subcohort filters and coded questionnaire exposure in local analysis", async () => {
    const repo = await makeRepo();
    const outDir = await mkdtemp(path.join(os.tmpdir(), "research-insurance-analysis-"));
    const fixture = path.join(outDir, "rows.json");
    try {
      await researchDesignCommand({
        project: "medbrevia-nhanes",
        repoDir: repo,
        question: "Among NHANES adults with measured hypertension, is health insurance coverage associated with uncontrolled blood pressure?",
        outDir,
      });
      await writeFile(fixture, `${JSON.stringify([
        { SEQN: 1, RIDSTATR: 2, RIDAGEYR: 54, RIAGENDR: 1, RIDRETH3: 3, HIQ011: 1, BPXSY1: 145, BPXDI1: 92, WTMEC2YR: 1 },
        { SEQN: 2, RIDSTATR: 2, RIDAGEYR: 63, RIAGENDR: 2, RIDRETH3: 4, HIQ011: 2, BPXSY1: 132, BPXDI1: 84, WTMEC2YR: 1 },
        { SEQN: 3, RIDSTATR: 2, RIDAGEYR: 48, RIAGENDR: 1, RIDRETH3: 2, HIQ011: 1, BPXSY1: 118, BPXDI1: 72, WTMEC2YR: 1 },
      ], null, 2)}\n`);
      await researchScoutPlanCommand(outDir, fixture);
      await researchApprovePacketCommand(outDir, "Approved for insurance fixture analysis.");

      const result = await researchAnalyzeLocalCommand(outDir, fixture);

      expect(result.eligibleRows).toBe(2);
      expect(result.completeCaseRows).toBe(2);
      expect(result.exposurePositiveRows).toBe(1);
      expect(result.endpointPositiveRows).toBe(1);
      expect(result.twoByTwo).toEqual([
        { exposure: "negative_or_reference", endpointNegative: 1, endpointPositive: 0, total: 1 },
        { exposure: "positive_or_exposed", endpointNegative: 0, endpointPositive: 1, total: 1 },
      ]);
    } finally {
      await rm(repo, { recursive: true, force: true });
      await rm(outDir, { recursive: true, force: true });
    }
  });

  it("computes diagnostic metrics for self-reported versus measured hypertension", async () => {
    const repo = await makeRepo();
    const outDir = await mkdtemp(path.join(os.tmpdir(), "research-bpq-analysis-"));
    const fixture = path.join(outDir, "rows.json");
    try {
      await researchDesignCommand({
        project: "medbrevia-nhanes",
        repoDir: repo,
        question: "Among NHANES adults, is self-reported high blood pressure associated with measured hypertension?",
        outDir,
      });
      await writeFile(fixture, `${JSON.stringify([
        { SEQN: 1, RIDSTATR: 2, RIDAGEYR: 45, RIAGENDR: 1, RIDRETH3: 3, BPQ020: 1, BPXSY1: 142, BPXDI1: 86, WTMEC2YR: 1 },
        { SEQN: 2, RIDSTATR: 2, RIDAGEYR: 58, RIAGENDR: 2, RIDRETH3: 4, BPQ020: 2, BPXSY1: 118, BPXDI1: 72, WTMEC2YR: 1 },
        { SEQN: 3, RIDSTATR: 2, RIDAGEYR: 66, RIAGENDR: 1, RIDRETH3: 2, BPQ020: 1, BPXSY1: 124, BPXDI1: 76, WTMEC2YR: 1 },
        { SEQN: 4, RIDSTATR: 2, RIDAGEYR: 52, RIAGENDR: 2, RIDRETH3: 1, BPQ020: 2, BPXSY1: 136, BPXDI1: 82, WTMEC2YR: 1 },
      ], null, 2)}\n`);
      await researchScoutPlanCommand(outDir, fixture);
      await researchApprovePacketCommand(outDir, "Approved for BPQ diagnostic fixture.");

      const result = await researchAnalyzeLocalCommand(outDir, fixture);

      expect(result.diagnosticMetrics).toEqual({
        sensitivity: 0.5,
        specificity: 0.5,
        positivePredictiveValue: 0.5,
        negativePredictiveValue: 0.5,
      });
      expect(renderResearchAnalysisResult(result)).toContain("sensitivity: 0.500");
    } finally {
      await rm(repo, { recursive: true, force: true });
      await rm(outDir, { recursive: true, force: true });
    }
  });

  it("summarizes continuous kidney endpoints by HbA1c category", async () => {
    const repo = await makeRepo();
    const outDir = await mkdtemp(path.join(os.tmpdir(), "research-kidney-analysis-"));
    const fixture = path.join(outDir, "rows.json");
    try {
      await researchDesignCommand({
        project: "medbrevia-nhanes",
        repoDir: repo,
        question: "In NHANES adults, do kidney markers differ across HbA1c categories after adjustment for age, sex, race/ethnicity, and BMI?",
        outDir,
      });
      await writeFile(fixture, `${JSON.stringify([
        { SEQN: 1, RIDSTATR: 2, RIDAGEYR: 45, RIAGENDR: 1, RIDRETH3: 3, BMXBMI: 24, LBXGH: 5.4, URDACT: 10, LBXSCR: 0.8, WTMEC2YR: 1 },
        { SEQN: 2, RIDSTATR: 2, RIDAGEYR: 58, RIAGENDR: 2, RIDRETH3: 4, BMXBMI: 31, LBXGH: 6.0, URDACT: 30, LBXSCR: 1.0, WTMEC2YR: 1 },
        { SEQN: 3, RIDSTATR: 2, RIDAGEYR: 66, RIAGENDR: 1, RIDRETH3: 2, BMXBMI: 29, LBXGH: 7.2, URDACT: 80, LBXSCR: 1.4, WTMEC2YR: 1 },
      ], null, 2)}\n`);
      await researchScoutPlanCommand(outDir, fixture);
      await researchApprovePacketCommand(outDir, "Approved for kidney fixture analysis.");

      const result = await researchAnalyzeLocalCommand(outDir, fixture);

      expect(result.analysisKind).toBe("continuous_by_exposure_group");
      expect(result.completeCaseRows).toBe(3);
      expect(result.groupSummaries).toEqual([
        { exposureGroup: "lt_5_7", n: 1, endpointMeans: [{ variable: "URDACT", mean: 10 }, { variable: "LBXSCR", mean: 0.8 }] },
        { exposureGroup: "5_7_to_6_4", n: 1, endpointMeans: [{ variable: "URDACT", mean: 30 }, { variable: "LBXSCR", mean: 1 }] },
        { exposureGroup: "gte_6_5", n: 1, endpointMeans: [{ variable: "URDACT", mean: 80 }, { variable: "LBXSCR", mean: 1.4 }] },
      ]);
      expect(renderResearchAnalysisResult(result)).toContain("analysis: continuous_by_exposure_group");
    } finally {
      await rm(repo, { recursive: true, force: true });
      await rm(outDir, { recursive: true, force: true });
    }
  });

  it("summarizes continuous lipid endpoints by income-to-poverty category", async () => {
    const repo = await makeRepo();
    const outDir = await mkdtemp(path.join(os.tmpdir(), "research-lipids-analysis-"));
    const fixture = path.join(outDir, "rows.json");
    try {
      await researchDesignCommand({
        project: "medbrevia-nhanes",
        repoDir: repo,
        question: "In NHANES adults, are lipid markers patterned by family income-to-poverty ratio after age, sex, race/ethnicity, and BMI adjustment?",
        outDir,
      });
      await writeFile(fixture, `${JSON.stringify([
        { SEQN: 1, RIDSTATR: 2, RIDAGEYR: 45, RIAGENDR: 1, RIDRETH3: 3, BMXBMI: 24, INDFMPIR: 0.9, LBXTC: 210, LBDHDD: 42, LBXTR: 160, WTMEC2YR: 1 },
        { SEQN: 2, RIDSTATR: 2, RIDAGEYR: 58, RIAGENDR: 2, RIDRETH3: 4, BMXBMI: 31, INDFMPIR: 2.4, LBXTC: 190, LBDHDD: 50, LBXTR: 120, WTMEC2YR: 1 },
        { SEQN: 3, RIDSTATR: 2, RIDAGEYR: 66, RIAGENDR: 1, RIDRETH3: 2, BMXBMI: 29, INDFMPIR: 4.2, LBXTC: 175, LBDHDD: 56, LBXTR: 100, WTMEC2YR: 1 },
      ], null, 2)}\n`);
      await researchScoutPlanCommand(outDir, fixture);
      await researchApprovePacketCommand(outDir, "Approved for lipids fixture analysis.");

      const result = await researchAnalyzeLocalCommand(outDir, fixture);

      expect(result.analysisKind).toBe("continuous_by_exposure_group");
      expect(result.groupSummaries?.map(group => group.exposureGroup)).toEqual(["lt_1_3", "1_3_to_3_5", "gt_3_5"]);
      expect(result.groupSummaries?.[0]?.endpointMeans).toEqual([
        { variable: "LBXTC", mean: 210 },
        { variable: "LBDHDD", mean: 42 },
        { variable: "LBXTR", mean: 160 },
      ]);
    } finally {
      await rm(repo, { recursive: true, force: true });
      await rm(outDir, { recursive: true, force: true });
    }
  });

  it("keeps smoking questionnaire coding and sex strata in local analysis", async () => {
    const repo = await makeRepo();
    const outDir = await mkdtemp(path.join(os.tmpdir(), "research-smoking-sex-analysis-"));
    const fixture = path.join(outDir, "rows.json");
    try {
      await researchDesignCommand({
        project: "medbrevia-nhanes",
        repoDir: repo,
        question: "Is smoking history associated with measured blood pressure differently by sex among NHANES adults?",
        outDir,
      });
      await writeFile(fixture, `${JSON.stringify([
        { SEQN: 1, RIDSTATR: 2, RIDAGEYR: 45, RIAGENDR: 1, RIDRETH3: 3, SMQ020: 1, BPXSY1: 142, BPXDI1: 86, WTMEC2YR: 1 },
        { SEQN: 2, RIDSTATR: 2, RIDAGEYR: 58, RIAGENDR: 1, RIDRETH3: 4, SMQ020: 2, BPXSY1: 118, BPXDI1: 72, WTMEC2YR: 1 },
        { SEQN: 3, RIDSTATR: 2, RIDAGEYR: 66, RIAGENDR: 2, RIDRETH3: 2, SMQ020: 1, BPXSY1: 122, BPXDI1: 74, WTMEC2YR: 1 },
        { SEQN: 4, RIDSTATR: 2, RIDAGEYR: 52, RIAGENDR: 2, RIDRETH3: 1, SMQ020: 2, BPXSY1: 136, BPXDI1: 82, WTMEC2YR: 1 },
      ], null, 2)}\n`);
      await researchScoutPlanCommand(outDir, fixture);
      await researchApprovePacketCommand(outDir, "Approved for smoking sex-stratified fixture analysis.");

      const result = await researchAnalyzeLocalCommand(outDir, fixture);
      const review = await researchReviewReportCommand(outDir);

      expect(result.analysisKind).toBe("binary_association");
      expect(result.exposurePositiveRows).toBe(2);
      expect(result.endpointPositiveRows).toBe(2);
      expect(result.stratifiedTwoByTwo?.map(stratum => `${stratum.stratifier}:${stratum.level}`)).toEqual([
        "RIAGENDR:female",
        "RIAGENDR:male",
      ]);
      expect(renderResearchAnalysisResult(result)).toContain("RIAGENDR=female");
      expect(review.status).toBe("pass");
      expect(review.issues.map(issue => issue.code)).not.toContain("SPARSE_STRATIFIED_CELL");
    } finally {
      await rm(repo, { recursive: true, force: true });
      await rm(outDir, { recursive: true, force: true });
    }
  });

  it("flags reports that omit required stratified sections", async () => {
    const repo = await makeRepo();
    const outDir = await mkdtemp(path.join(os.tmpdir(), "research-missing-strata-report-"));
    const fixture = path.join(outDir, "rows.json");
    try {
      await researchDesignCommand({
        project: "medbrevia-nhanes",
        repoDir: repo,
        question: "Is smoking history associated with measured blood pressure differently by sex among NHANES adults?",
        outDir,
      });
      await writeFile(fixture, `${JSON.stringify([
        { SEQN: 1, RIDSTATR: 2, RIDAGEYR: 45, RIAGENDR: 1, RIDRETH3: 3, SMQ020: 1, BPXSY1: 142, BPXDI1: 86, WTMEC2YR: 1 },
        { SEQN: 2, RIDSTATR: 2, RIDAGEYR: 58, RIAGENDR: 2, RIDRETH3: 4, SMQ020: 2, BPXSY1: 118, BPXDI1: 72, WTMEC2YR: 1 },
      ], null, 2)}\n`);
      await researchScoutPlanCommand(outDir, fixture);
      await researchApprovePacketCommand(outDir, "Approved for report QA fixture.");
      await researchAnalyzeLocalCommand(outDir, fixture);
      await writeFile(path.join(outDir, "report.md"), [
        "# Smoking History and Blood Pressure",
        "",
        "This is a local fixture analysis for pipeline validation only. It is unweighted and not a NHANES population estimate.",
        "NHANES is observational and cross-sectional.",
        "",
      ].join("\n"));

      const review = await researchReviewReportCommand(outDir);

      expect(review.status).toBe("needs_review");
      expect(review.issues.map(issue => issue.code)).toContain("MISSING_STRATIFIED_REPORT_SECTION");
    } finally {
      await rm(repo, { recursive: true, force: true });
      await rm(outDir, { recursive: true, force: true });
    }
  });

  it("flags diagnostic analyses when reports omit diagnostic metrics", async () => {
    const repo = await makeRepo();
    const outDir = await mkdtemp(path.join(os.tmpdir(), "research-missing-diagnostics-report-"));
    const fixture = path.join(outDir, "rows.json");
    try {
      await researchDesignCommand({
        project: "medbrevia-nhanes",
        repoDir: repo,
        question: "Among NHANES adults, is self-reported high blood pressure associated with measured hypertension?",
        outDir,
      });
      await writeFile(fixture, `${JSON.stringify([
        { SEQN: 1, RIDSTATR: 2, RIDAGEYR: 45, RIAGENDR: 1, RIDRETH3: 3, BPQ020: 1, BPXSY1: 142, BPXDI1: 86, WTMEC2YR: 1 },
        { SEQN: 2, RIDSTATR: 2, RIDAGEYR: 58, RIAGENDR: 2, RIDRETH3: 4, BPQ020: 2, BPXSY1: 118, BPXDI1: 72, WTMEC2YR: 1 },
      ], null, 2)}\n`);
      await researchScoutPlanCommand(outDir, fixture);
      await researchApprovePacketCommand(outDir, "Approved for missing diagnostic report QA.");
      await researchAnalyzeLocalCommand(outDir, fixture);
      await writeFile(path.join(outDir, "report.md"), [
        "# Self-Reported Hypertension and Blood Pressure",
        "",
        "This is a local fixture analysis for pipeline validation only. It is unweighted and not a NHANES population estimate.",
        "NHANES is observational and cross-sectional.",
        "",
      ].join("\n"));

      const review = await researchReviewReportCommand(outDir);

      expect(review.status).toBe("needs_review");
      expect(review.issues.map(issue => issue.code)).toContain("MISSING_DIAGNOSTIC_METRICS");
    } finally {
      await rm(repo, { recursive: true, force: true });
      await rm(outDir, { recursive: true, force: true });
    }
  });

  it("reviews generated reports for local-fixture caveats", async () => {
    const repo = await makeRepo();
    const outDir = await mkdtemp(path.join(os.tmpdir(), "research-report-review-"));
    const fixture = path.join(outDir, "rows.json");
    try {
      await researchDesignCommand({
        project: "medbrevia-nhanes",
        repoDir: repo,
        question: "Vitamin D deficiency and measured hypertension in NHANES adults",
        outDir,
      });
      await writeFile(fixture, `${JSON.stringify([
        { SEQN: 1, RIDSTATR: 2, RIDAGEYR: 44, RIAGENDR: 1, RIDRETH3: 3, LBXVIDMS: 40, BPXSY1: 140, BPXDI1: 90, WTMEC2YR: 1 },
      ], null, 2)}\n`);
      await researchScoutPlanCommand(outDir, fixture);
      await researchApprovePacketCommand(outDir, "Approved for report review.");
      await researchAnalyzeLocalCommand(outDir, fixture);

      const review = await researchReviewReportCommand(outDir);

      expect(review.status).toBe("pass");
      expect(review.issues.map(issue => issue.code)).toContain("REPORT_READY");
      expect(renderResearchReportReview(review)).toContain("REPORT_READY");
      expect(JSON.parse(renderResearchReportReviewJson(review)).schemaVersion).toBe(1);
    } finally {
      await rm(repo, { recursive: true, force: true });
      await rm(outDir, { recursive: true, force: true });
    }
  });

  it("writes a reproducible artifact manifest with hashes", async () => {
    const repo = await makeRepo();
    const outDir = await mkdtemp(path.join(os.tmpdir(), "research-manifest-"));
    const fixture = path.join(outDir, "rows.json");
    try {
      await researchDesignCommand({
        project: "medbrevia-nhanes",
        repoDir: repo,
        question: "Vitamin D deficiency and measured hypertension in NHANES adults",
        outDir,
      });
      await writeFile(fixture, `${JSON.stringify([
        { SEQN: 1, RIDSTATR: 2, RIDAGEYR: 44, RIAGENDR: 1, RIDRETH3: 3, LBXVIDMS: 40, BPXSY1: 140, BPXDI1: 90, WTMEC2YR: 1 },
      ], null, 2)}\n`);
      await researchScoutPlanCommand(outDir, fixture);
      await writeFile(path.join(outDir, "methods-validation.json"), "{}\n");
      await writeFile(path.join(outDir, "data-quality.json"), "{}\n");
      await researchRunnerSpecCommand(outDir);
      await researchApprovePacketCommand(outDir, "Approved for manifest fixture.");
      await researchAnalyzeLocalCommand(outDir, fixture);

      const manifest = await researchArtifactManifestCommand(outDir);

      expect(manifest.artifacts.map(artifact => artifact.path)).toEqual(expect.arrayContaining([
        "design.json",
        "scout-plan.json",
        "runner-spec.json",
        "approval.json",
        "analysis-result.json",
        "report.md",
      ]));
      expect(manifest.artifacts[0]?.sha256).toMatch(/^[a-f0-9]{64}$/);
      expect(renderResearchArtifactManifest(manifest)).toContain("research artifact manifest");
      expect(JSON.parse(renderResearchArtifactManifestJson(manifest)).schemaVersion).toBe(1);
      const manifestVerification = await researchManifestVerifyCommand(outDir);
      expect(manifestVerification.status).toBe("valid");
      expect(manifestVerification.validLocal).toBe(true);
      expect(manifestVerification.validForShare).toBe(false);
      expect(renderResearchManifestVerification(manifestVerification)).toContain("status: valid");
      expect(renderResearchManifestVerification(manifestVerification)).toContain("valid local: true");
      expect(JSON.parse(renderResearchManifestVerificationJson(manifestVerification)).schemaVersion).toBe(1);
      const checkpoint = await researchCheckpointCommand(outDir);
      expect(checkpoint.currentStage).toBe("export");
      expect(checkpoint.nextCommand).toContain("research export");
    } finally {
      await rm(repo, { recursive: true, force: true });
      await rm(outDir, { recursive: true, force: true });
    }
  });

  it("verifies golden manifests independently and catches hash drift", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "research-golden-manifest-"));
    try {
      const artifactPath = path.join(dir, "analysis.json");
      await writeFile(artifactPath, `${JSON.stringify({ ok: true })}\n`);
      const bytes = (await readFile(artifactPath)).byteLength;
      const sha256 = createHash("sha256").update(await readFile(artifactPath)).digest("hex");
      await writeFile(path.join(dir, "golden-manifest.json"), `${JSON.stringify({
        schemaVersion: 1,
        status: "ready_for_local_review",
        localReviewStatus: "ready_for_local_review",
        shareStatus: "local_only_blocked_for_share",
        checks: {
          sourceValidation: "passed",
          rerunDiff: "stable",
          paperQa: "pass",
          runnerRecord: "present",
        },
        artifacts: [{ path: artifactPath, bytes, sha256 }],
      }, null, 2)}\n`);

      const valid = await researchManifestVerifyCommand(dir);
      await writeFile(artifactPath, `${JSON.stringify({ ok: false })}\n`);
      const invalid = await researchManifestVerifyCommand(dir);

      expect(valid.status).toBe("valid");
      expect(valid.validLocal).toBe(true);
      expect(valid.validForShare).toBe(false);
      expect(valid.shareStatus).toBe("local_only_blocked_for_share");
      expect(valid.checkedArtifacts).toBe(1);
      expect(invalid.status).toBe("invalid");
      expect(invalid.issues.join(" ")).toContain("sha256 changed");
      expect(invalid.typedIssues.map(issue => issue.code)).toContain("ARTIFACT_SHA256_CHANGED");

      await writeFile(path.join(dir, "golden-manifest.json"), `${JSON.stringify({
        schemaVersion: 1,
        localReviewStatus: "not_ready",
        checks: {
          sourceValidation: "passed",
          rerunDiff: "stable",
          paperQa: "pass",
          runnerRecord: "present",
        },
        artifacts: [],
      }, null, 2)}\n`);
      const notReady = await researchManifestVerifyCommand(dir);
      expect(notReady.status).toBe("invalid");
      expect(notReady.issues).toContain("golden local review status is not ready");
      expect(notReady.typedIssues.map(issue => issue.code)).toContain("LOCAL_REVIEW_NOT_READY");

      await writeFile(path.join(dir, "golden-manifest.json"), `${JSON.stringify({
        schemaVersion: 1,
        localReviewStatus: "ready_for_local_review",
        checks: {
          sourceValidation: "passed",
          rerunDiff: "changed",
          paperQa: "pass",
          runnerRecord: "present",
        },
        artifacts: [],
      }, null, 2)}\n`);
      const unstable = await researchManifestVerifyCommand(dir);
      expect(unstable.status).toBe("invalid");
      expect(unstable.typedIssues).toEqual(expect.arrayContaining([
        expect.objectContaining({ code: "RERUN_DIFF_UNSTABLE", severity: "blocker" }),
      ]));

      const specPath = path.join(dir, "analysis-spec.json");
      const runnerPath = path.join(dir, "runner-record.json");
      await writeFile(specPath, `${JSON.stringify({ analysisSpec: { specHash: "spec_current" } })}\n`);
      await writeFile(runnerPath, `${JSON.stringify({ analysisSpec: { specHash: "spec_old" } })}\n`);
      const specBytes = (await readFile(specPath)).byteLength;
      const runnerBytes = (await readFile(runnerPath)).byteLength;
      await writeFile(path.join(dir, "golden-manifest.json"), `${JSON.stringify({
        schemaVersion: 1,
        localReviewStatus: "ready_for_local_review",
        checks: {
          sourceValidation: "passed",
          rerunDiff: "stable",
          paperQa: "pass",
          runnerRecord: "present",
        },
        artifacts: [
          { path: specPath, bytes: specBytes, sha256: createHash("sha256").update(await readFile(specPath)).digest("hex") },
          { path: runnerPath, bytes: runnerBytes, sha256: createHash("sha256").update(await readFile(runnerPath)).digest("hex") },
        ],
      }, null, 2)}\n`);
      const staleRunner = await researchManifestVerifyCommand(dir);
      expect(staleRunner.status).toBe("invalid");
      expect(staleRunner.typedIssues.map(issue => issue.code)).toContain("RUNNER_SPEC_HASH_MISMATCH");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("composes existing primitives for a miniature golden packet", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "research-golden-composed-"));
    try {
      const paper = path.join(dir, "paper.md");
      const evidence = path.join(dir, "analysis.json");
      await writeFile(paper, [
        "# Paper",
        "## Abstract",
        "A cross-sectional observational NHANES analysis.",
        "## Introduction",
        "Motivation.",
        "## Methods",
        "We used WTMEC2YR survey weight language and noted strata and PSU limitations.",
        "A weighted approximate linear regression estimated an adjusted mean difference, adjusting for age, sex, and race.",
        "## Results",
        "There were 1,000 complete-case eligible rows and the mean difference was 0.05 (95% CI 0.01 to 0.08; p=0.0047).",
        "## Discussion",
        "The association was exploratory and cannot infer causality.",
        "## Limitations",
        "Missing data and complete-case handling may bias results; approximate variance without full complex survey strata and PSU is a limitation.",
        "## Reproducibility",
        "Evidence is in analysis.json.",
        "## References",
        "https://www.strobe-statement.org/",
        "https://wwwn.cdc.gov/nchs/nhanes/AnalyticGuidelines.aspx",
        "https://arxiv.org/abs/2004.14066",
      ].join("\n"));
      await writeFile(evidence, `${JSON.stringify({
        rowCounts: { completeCaseEligible: 1000 },
        model: {
          type: "weighted approximate linear regression",
          covariates: ["uninsured", "age_10", "female", "race_1"],
          uninsuredMeanDifferenceHbA1cPercent: 0.05,
          ci95: [0.01, 0.08],
          pValue: 0.0047,
        },
        limitations: ["Approximate survey weights only"],
      }, null, 2)}\n`);
      const qa = await researchPaperQaCommand({ paperPath: paper, evidencePath: evidence });
      const qaPath = path.join(dir, "qa.json");
      await writeFile(qaPath, renderResearchPaperQaJson(qa));
      const manifestArtifact = await readFile(qaPath);
      await writeFile(path.join(dir, "golden-manifest.json"), `${JSON.stringify({
        schemaVersion: 1,
        localReviewStatus: qa.status === "pass" ? "ready_for_local_review" : "not_ready",
        checks: {
          sourceValidation: "passed",
          rerunDiff: "stable",
          paperQa: qa.status,
          runnerRecord: "present",
        },
        artifacts: [{
          path: qaPath,
          bytes: manifestArtifact.byteLength,
          sha256: createHash("sha256").update(manifestArtifact).digest("hex"),
        }],
      }, null, 2)}\n`);

      const manifest = await researchManifestVerifyCommand(dir);
      expect(qa.status).toBe("pass");
      expect(manifest.status).toBe("valid");
      expect(manifest.checkedArtifacts).toBe(1);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("registers and runs a golden packet benchmark with expected local-only share failure", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "research-benchmark-golden-"));
    try {
      await makeBenchmarkGoldenPacket(dir);
      const benchmarkPath = path.join(dir, "golden-benchmark.json");
      const benchmark = await researchBenchmarkRegisterCommand({ packetDir: dir, outPath: benchmarkPath });
      const run = await researchBenchmarkRunCommand({ benchmarkPath });
      const score = await researchBenchmarkScoreCommand(run.runPath!);
      const parsedBenchmark = JSON.parse(renderResearchBenchmarkJson(benchmark)) as { benchmark: { benchmarkId: string } };
      const parsedRun = JSON.parse(renderResearchBenchmarkRunJson(run)) as { benchmarkRun: { status: string } };
      const parsedScore = JSON.parse(renderResearchBenchmarkScoreJson(score)) as { benchmarkScore: { normalizedScore: number } };

      expect(benchmark.expectedArtifacts.map(artifact => artifact.id)).toEqual(expect.arrayContaining(["analysis_spec_json", "golden_manifest_json", "paper"]));
      expect(benchmark.expectedFailures.map(failure => failure.code)).toContain("SHARE_NOT_READY");
      expect(run.status).toBe("pass");
      expect(run.checks.find(check => check.id === "share-export-policy")?.status).toBe("expected_failure");
      expect(score.normalizedScore).toBeGreaterThan(0.95);
      expect(renderResearchBenchmark(benchmark)).toContain("research benchmark");
      expect(renderResearchBenchmarkRun(run)).toContain("expected failures");
      expect(parsedBenchmark.benchmark.benchmarkId).toContain("golden");
      expect(parsedRun.benchmarkRun.status).toBe("pass");
      expect(parsedScore.benchmarkScore.normalizedScore).toBeGreaterThan(0.95);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("fails benchmark runs for missing expected artifacts and rerun instability", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "research-benchmark-failure-"));
    try {
      await makeBenchmarkGoldenPacket(dir, { omitLocalReviewNote: true, rerunStatus: "changed" });
      const benchmarkPath = path.join(dir, "golden-benchmark.json");
      await researchBenchmarkRegisterCommand({ packetDir: dir, outPath: benchmarkPath });
      const run = await researchBenchmarkRunCommand({ benchmarkPath });

      expect(run.status).toBe("fail");
      expect(run.unexpectedFailures.map(issue => issue.code)).toEqual(expect.arrayContaining(["BENCHMARK_ARTIFACT_MISSING", "RERUN_DIFF_UNSTABLE"]));
      expect(run.checks.find(check => check.id === "rerun-stability")?.status).toBe("fail");
      expect(run.checks.find(check => check.id === "cold-review")?.status).toBe("fail");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("discovers benchmark suites and scores aggregate runs", async () => {
    const suiteDir = await mkdtemp(path.join(os.tmpdir(), "research-benchmark-suite-"));
    try {
      const first = path.join(suiteDir, "first");
      const second = path.join(suiteDir, "second");
      await mkdir(first, { recursive: true });
      await mkdir(second, { recursive: true });
      await makeBenchmarkGoldenPacket(first);
      await makeBenchmarkGoldenPacket(second);
      await researchBenchmarkRegisterCommand({ packetDir: first });
      await researchBenchmarkRegisterCommand({ packetDir: second });

      const suite = await researchBenchmarkSuiteCommand({ suiteDir });
      const parsed = JSON.parse(renderResearchBenchmarkSuiteJson(suite)) as { benchmarkSuite: { runs: unknown[] } };

      expect(suite.benchmarks).toHaveLength(2);
      expect(suite.runs.every(run => run.status === "pass")).toBe(true);
      expect(suite.score.status).toBe("pass");
      expect(renderResearchBenchmarkSuite(suite)).toContain("benchmarks: 2");
      expect(parsed.benchmarkSuite.runs).toHaveLength(2);
    } finally {
      await rm(suiteDir, { recursive: true, force: true });
    }
  });

  it("writes RO-Crate metadata for packet artifacts", async () => {
    const repo = await makeRepo();
    const outDir = await mkdtemp(path.join(os.tmpdir(), "research-ro-crate-"));
    try {
      await researchDesignCommand({
        project: "medbrevia-nhanes",
        repoDir: repo,
        question: "Vitamin D deficiency and measured hypertension in NHANES adults",
        outDir,
      });
      await researchArtifactManifestCommand(outDir);

      const crate = await researchRoCrateCommand(outDir);
      const parsed = JSON.parse(renderResearchRoCrateJson(crate)) as {
        schemaVersion: number;
        roCrate: { metadata: { "@graph": Array<Record<string, unknown>> } };
      };

      expect(crate.metadata["@context"]).toContain("ro/crate");
      expect(crate.metadata["@graph"].some(node => node["@id"] === "design.json")).toBe(true);
      expect(renderResearchRoCrate(crate)).toContain("research ro-crate");
      expect(parsed.schemaVersion).toBe(1);
    } finally {
      await rm(repo, { recursive: true, force: true });
      await rm(outDir, { recursive: true, force: true });
    }
  });

  it("writes a PROV-style provenance graph for packet artifacts", async () => {
    const repo = await makeRepo();
    const outDir = await mkdtemp(path.join(os.tmpdir(), "research-provenance-"));
    try {
      await researchDesignCommand({
        project: "medbrevia-nhanes",
        repoDir: repo,
        question: "Vitamin D deficiency and measured hypertension in NHANES adults",
        outDir,
      });
      await researchArtifactManifestCommand(outDir);

      const provenance = await researchProvenanceCommand(outDir);
      const parsed = JSON.parse(renderResearchProvenanceJson(provenance)) as {
        schemaVersion: number;
        provenance: { graph: { entities: unknown[]; activities: Array<{ id: string }> } };
      };

      expect(provenance.graph.entities.some(entity => entity.path === "design.json")).toBe(true);
      expect(provenance.graph.activities.some(activity => activity.id === "activity:design")).toBe(true);
      expect(renderResearchProvenance(provenance)).toContain("research provenance");
      expect(parsed.schemaVersion).toBe(1);
    } finally {
      await rm(repo, { recursive: true, force: true });
      await rm(outDir, { recursive: true, force: true });
    }
  });

  it("summarizes packet readiness in a QA dashboard", async () => {
    const repo = await makeRepo();
    const packetDir = await mkdtemp(path.join(os.tmpdir(), "research-qa-dashboard-"));
    const exportDir = await mkdtemp(path.join(os.tmpdir(), "research-qa-dashboard-export-"));
    const fixture = path.join(packetDir, "rows.json");
    try {
      await researchDesignCommand({
        project: "medbrevia-nhanes",
        repoDir: repo,
        question: "Vitamin D deficiency and measured hypertension in NHANES adults",
        outDir: packetDir,
      });
      await writeFile(fixture, `${JSON.stringify([
        { SEQN: 1, RIDSTATR: 2, RIDAGEYR: 44, RIAGENDR: 1, RIDRETH3: 3, LBXVIDMS: 40, BPXSY1: 140, BPXDI1: 90, WTMEC2YR: 1 },
      ], null, 2)}\n`);
      await researchScoutPlanCommand(packetDir, fixture);
      await researchRunnerSpecCommand(packetDir);
      await researchApprovePacketCommand(packetDir, "Approved for QA fixture.");
      await researchAnalyzeLocalCommand(packetDir, fixture);
      await researchReviewReportCommand(packetDir);
      await researchValidateMethodsCommand(packetDir);
      await researchArtifactManifestCommand(packetDir);
      await researchRoCrateCommand(packetDir);
      await researchProvenanceCommand(packetDir);
      await researchArtifactManifestCommand(packetDir);
      await researchExportPacketCommand(packetDir, exportDir);

      const dashboard = await researchQaDashboardCommand(packetDir);
      const parsed = JSON.parse(renderResearchQaDashboardJson(dashboard)) as {
        schemaVersion: number;
        qaDashboard: { checks: Array<{ id: string; status: string }> };
      };

      expect(dashboard.checks.map(check => check.id)).toEqual(expect.arrayContaining(["checkpoint", "methods-validation", "ro-crate", "provenance"]));
      expect(dashboard.checks.find(check => check.id === "provenance")?.status).toBe("pass");
      expect(renderResearchQaDashboard(dashboard)).toContain("research QA dashboard");
      expect(parsed.schemaVersion).toBe(1);
      expect(JSON.parse(await readFile(path.join(packetDir, "qa-dashboard.json"), "utf-8"))).toMatchObject({ status: dashboard.status });
    } finally {
      await rm(repo, { recursive: true, force: true });
      await rm(packetDir, { recursive: true, force: true });
      await rm(exportDir, { recursive: true, force: true });
    }
  });

  it("writes a zero-cloud runner adapter contract", async () => {
    const repo = await makeRepo();
    const outDir = await mkdtemp(path.join(os.tmpdir(), "research-runner-spec-"));
    try {
      await researchDesignCommand({
        project: "medbrevia-nhanes",
        repoDir: repo,
        question: "Is smoking history associated with measured blood pressure differently by sex among NHANES adults?",
        outDir,
      });
      await researchScoutPlanCommand(outDir);

      const spec = await researchRunnerSpecCommand(outDir);

      expect(spec.mode).toBe("local_fixture");
      expect(spec.contract.stratifiers).toEqual(["RIAGENDR"]);
      expect(spec.contract.analysisKind).toBe("binary_association");
      expect(spec.safety).toEqual({
        cloudSpendUsd: 0,
        medbreviaMutationAllowed: false,
        requiresHumanApproval: true,
      });
      expect(renderResearchRunnerSpec(spec)).toContain("cloud=$0");
    } finally {
      await rm(repo, { recursive: true, force: true });
      await rm(outDir, { recursive: true, force: true });
    }
  });

  it("exports packet artifacts into a stable directory", async () => {
    const repo = await makeRepo();
    const packetDir = await mkdtemp(path.join(os.tmpdir(), "research-export-packet-"));
    const exportDir = await mkdtemp(path.join(os.tmpdir(), "research-export-out-"));
    const fixture = path.join(packetDir, "rows.json");
    try {
      await researchDesignCommand({
        project: "medbrevia-nhanes",
        repoDir: repo,
        question: "Vitamin D deficiency and measured hypertension in NHANES adults",
        outDir: packetDir,
      });
      await writeFile(fixture, `${JSON.stringify([
        { SEQN: 1, RIDSTATR: 2, RIDAGEYR: 44, RIAGENDR: 1, RIDRETH3: 3, LBXVIDMS: 40, BPXSY1: 140, BPXDI1: 90, WTMEC2YR: 1 },
      ], null, 2)}\n`);
      await researchScoutPlanCommand(packetDir, fixture);
      await researchRunnerSpecCommand(packetDir);
      await researchApprovePacketCommand(packetDir, "Approved for export fixture.");
      await researchAnalyzeLocalCommand(packetDir, fixture);
      await researchPacketReadinessCommand(packetDir);

      const exported = await researchExportPacketCommand(packetDir, exportDir);
      const manifest = await researchArtifactManifestCommand(packetDir);
      const exportedManifest = JSON.parse(await readFile(path.join(exportDir, "artifact-manifest.json"), "utf-8")) as {
        artifacts: Array<{ path: string }>;
      };
      const exportedRecord = JSON.parse(await readFile(path.join(exportDir, "export-record.json"), "utf-8")) as {
        copiedArtifacts: string[];
      };
      const checkpoint = await researchCheckpointCommand(packetDir);

      expect(exported.copiedArtifacts).toEqual(expect.arrayContaining(["design.json", "runner-spec.json", "packet-readiness.json", "artifact-manifest.json", "export-record.json"]));
      expect(exported.exportReceipt?.policy).toBe("shareable-local-path-scan-v1");
      expect(exported.exportReceipt?.artifactChecks.map(artifact => artifact.path)).toContain("design.json");
      expect(["pass", "fail"]).toContain(exported.exportReceipt?.status);
      expect(manifest.artifacts.map(artifact => artifact.path)).toContain("export-record.json");
      expect(exportedManifest.artifacts.map(artifact => artifact.path)).toContain("packet-readiness.json");
      expect(exportedManifest.artifacts.map(artifact => artifact.path)).toContain("export-record.json");
      expect(exportedRecord.copiedArtifacts).toContain("export-record.json");
      expect(checkpoint.currentStage).toBe("complete");
      expect(checkpoint.artifacts.exportRecord).toBe(true);
      expect(renderResearchPacketExport(exported)).toContain("research packet export");
    } finally {
      await rm(repo, { recursive: true, force: true });
      await rm(packetDir, { recursive: true, force: true });
      await rm(exportDir, { recursive: true, force: true });
    }
  });

  it("summarizes packet orchestration state in one structured document", async () => {
    const repo = await makeRepo();
    const packetDir = await mkdtemp(path.join(os.tmpdir(), "research-summary-packet-"));
    const exportDir = await mkdtemp(path.join(os.tmpdir(), "research-summary-export-"));
    const fixture = path.join(packetDir, "rows.json");
    try {
      await researchDesignCommand({
        project: "medbrevia-nhanes",
        repoDir: repo,
        question: "Vitamin D deficiency and measured hypertension in NHANES adults",
        outDir: packetDir,
      });
      await writeFile(fixture, `${JSON.stringify([
        { SEQN: 1, RIDSTATR: 2, RIDAGEYR: 44, RIAGENDR: 1, RIDRETH3: 3, LBXVIDMS: 40, BPXSY1: 140, BPXDI1: 90, WTMEC2YR: 1 },
      ], null, 2)}\n`);
      await researchScoutPlanCommand(packetDir, fixture);
      await researchRunnerSpecCommand(packetDir);
      await researchApprovePacketCommand(packetDir, "Approved for summary fixture.");
      await researchAnalyzeLocalCommand(packetDir, fixture);
      await researchReviewReportCommand(packetDir);
      await researchArtifactManifestCommand(packetDir);
      await researchExportPacketCommand(packetDir, exportDir);

      const summary = await researchPacketSummaryCommand(packetDir);
      const parsed = JSON.parse(renderResearchPacketSummaryJson(summary)) as {
        schemaVersion: number;
        packetSummary: { checkpoint: { currentStage: string }; stages: unknown[]; manifest: { artifacts: unknown[] }; reportReview: { status: string }; exportRecord: { exportDir: string } };
      };

      expect(summary.checkpoint.currentStage).toBe("complete");
      expect(summary.stages.length).toBeGreaterThan(5);
      expect(summary.manifest?.artifacts.map(artifact => artifact.path)).toContain("export-record.json");
      expect(summary.reportReview?.status).toBe("pass");
      expect(summary.exportRecord?.exportDir).toBe(path.resolve(exportDir));
      expect(renderResearchPacketSummary(summary)).toContain("stage: complete");
      expect(parsed.schemaVersion).toBe(1);
      expect(parsed.packetSummary.checkpoint.currentStage).toBe("complete");
    } finally {
      await rm(repo, { recursive: true, force: true });
      await rm(packetDir, { recursive: true, force: true });
      await rm(exportDir, { recursive: true, force: true });
    }
  });

  it("recommends manifest export after report generation", async () => {
    const repo = await makeRepo();
    const outDir = await mkdtemp(path.join(os.tmpdir(), "research-checkpoint-manifest-"));
    const fixture = path.join(outDir, "rows.json");
    try {
      await researchDesignCommand({
        project: "medbrevia-nhanes",
        repoDir: repo,
        question: "Vitamin D deficiency and measured hypertension in NHANES adults",
        outDir,
      });
      await writeFile(fixture, `${JSON.stringify([
        { SEQN: 1, RIDSTATR: 2, RIDAGEYR: 44, RIAGENDR: 1, RIDRETH3: 3, LBXVIDMS: 40, BPXSY1: 140, BPXDI1: 90, WTMEC2YR: 1 },
      ], null, 2)}\n`);
      await researchScoutPlanCommand(outDir, fixture);
      await researchRunnerSpecCommand(outDir);
      await researchApprovePacketCommand(outDir, "Approved for checkpoint manifest fixture.");
      await researchAnalyzeLocalCommand(outDir, fixture);

      const checkpoint = await researchCheckpointCommand(outDir);

      expect(checkpoint.currentStage).toBe("manifest");
      expect(checkpoint.artifacts.artifactManifest).toBe(false);
      expect(checkpoint.stageGate?.status).toBe("pass");
      expect(renderResearchCheckpoint(checkpoint)).toContain("research manifest");
    } finally {
      await rm(repo, { recursive: true, force: true });
      await rm(outDir, { recursive: true, force: true });
    }
  });

  it("recommends durable export after manifest creation", async () => {
    const repo = await makeRepo();
    const outDir = await mkdtemp(path.join(os.tmpdir(), "research-checkpoint-export-"));
    const fixture = path.join(outDir, "rows.json");
    try {
      await researchDesignCommand({
        project: "medbrevia-nhanes",
        repoDir: repo,
        question: "Vitamin D deficiency and measured hypertension in NHANES adults",
        outDir,
      });
      await writeFile(fixture, `${JSON.stringify([
        { SEQN: 1, RIDSTATR: 2, RIDAGEYR: 44, RIAGENDR: 1, RIDRETH3: 3, LBXVIDMS: 40, BPXSY1: 140, BPXDI1: 90, WTMEC2YR: 1 },
      ], null, 2)}\n`);
      await researchScoutPlanCommand(outDir, fixture);
      await researchRunnerSpecCommand(outDir);
      await researchApprovePacketCommand(outDir, "Approved for checkpoint export fixture.");
      await researchAnalyzeLocalCommand(outDir, fixture);
      await researchArtifactManifestCommand(outDir);

      const checkpoint = await researchCheckpointCommand(outDir);

      expect(checkpoint.currentStage).toBe("export");
      expect(checkpoint.artifacts.exportRecord).toBe(false);
      expect(renderResearchCheckpoint(checkpoint)).toContain("research export");
    } finally {
      await rm(repo, { recursive: true, force: true });
      await rm(outDir, { recursive: true, force: true });
    }
  });

  it("renders checkpoint state as machine-readable JSON", async () => {
    const packetDir = await mkdtemp(path.join(os.tmpdir(), "research-checkpoint-json-"));
    try {
      const checkpoint = await researchCheckpointCommand(packetDir);
      const parsed = JSON.parse(renderResearchCheckpointJson(checkpoint)) as {
        schemaVersion: number;
        checkpoint: { currentStage: string; artifacts: { design: boolean }; nextCommand: string; recommendedCommands: string[] };
      };

      expect(parsed.schemaVersion).toBe(1);
      expect(parsed.checkpoint.currentStage).toBe("design");
      expect(parsed.checkpoint.artifacts.design).toBe(false);
      expect(parsed.checkpoint.nextCommand).toContain("agenteer research design");
      expect(parsed.checkpoint.recommendedCommands[0]).toContain("agenteer research design");
    } finally {
      await rm(packetDir, { recursive: true, force: true });
    }
  });

  it("recommends missing gate commands before executable analysis", async () => {
    const packetDir = await mkdtemp(path.join(os.tmpdir(), "research-checkpoint-gates-"));
    try {
      await writeFile(path.join(packetDir, "design.json"), "{}\n");
      await writeFile(path.join(packetDir, "scout-plan.json"), "{}\n");
      await writeFile(path.join(packetDir, "runner-spec.json"), "{}\n");
      await writeFile(path.join(packetDir, "approval.json"), "{}\n");

      const checkpoint = await researchCheckpointCommand(packetDir);

      expect(checkpoint.currentStage).toBe("analysis");
      expect(checkpoint.stageGate?.status).toBe("blocked");
      expect(checkpoint.recommendedCommands).toEqual(expect.arrayContaining([
        `agenteer research critique --packet ${packetDir}`,
        `agenteer research validate-methods --packet ${packetDir} --json`,
        "agenteer research data-quality --fixture <rows.json> --json",
      ]));
      expect(renderResearchCheckpoint(checkpoint)).toContain("recommended:");
    } finally {
      await rm(packetDir, { recursive: true, force: true });
    }
  });

  it("summarizes the next packet action from checkpoint and stage gates", async () => {
    const packetDir = await mkdtemp(path.join(os.tmpdir(), "research-next-"));
    try {
      await writeFile(path.join(packetDir, "design.json"), "{}\n");
      await writeFile(path.join(packetDir, "scout-plan.json"), "{}\n");
      await writeFile(path.join(packetDir, "runner-spec.json"), "{}\n");
      await writeFile(path.join(packetDir, "approval.json"), "{}\n");

      const next = await researchPacketNextCommand(packetDir);
      const parsed = JSON.parse(renderResearchPacketNextJson(next)) as {
        schemaVersion: number;
        packetNext: { schemaVersion: number; eventType: string; gateStatus: string; decisionId: string; recordHash: string; recommendedCommands: string[]; expectedArtifacts: Array<{ path: string }> };
      };

      expect(next.currentStage).toBe("analysis");
      expect(next.decisionId).toHaveLength(16);
      expect(next.recordHash).toHaveLength(64);
      expect(next.gateStatus).toBe("blocked");
      expect(next.recommendedCommands[0]).toContain("research critique");
      expect(next.expectedArtifacts.map(artifact => path.basename(artifact.path))).toEqual(expect.arrayContaining([
        "critique.json",
        "methods-validation.json",
        "data-quality.json",
      ]));
      expect(next.expectedArtifacts.every(artifact => artifact.exists === false)).toBe(true);
      expect(renderResearchPacketNext(next)).toContain("research next:");
      expect(renderResearchPacketNext(next)).toContain("event: research.packet.next v1");
      expect(renderResearchPacketNext(next)).toContain("expected artifacts:");
      expect(renderResearchPacketNext(next)).toContain("missing");
      expect(parsed.schemaVersion).toBe(1);
      expect(parsed.packetNext.schemaVersion).toBe(1);
      expect(parsed.packetNext.eventType).toBe("research.packet.next");
      expect(parsed.packetNext.decisionId).toHaveLength(16);
      expect(parsed.packetNext.recordHash).toHaveLength(64);
      expect(parsed.packetNext.gateStatus).toBe("blocked");
      expect(parsed.packetNext.expectedArtifacts[0].path).toContain(packetDir);
    } finally {
      await rm(packetDir, { recursive: true, force: true });
    }
  });

  it("can append a navigation trace without executing the next stage", async () => {
    const packetDir = await mkdtemp(path.join(os.tmpdir(), "research-next-trace-"));
    try {
      await writeFile(path.join(packetDir, "design.json"), "{}\n");
      const next = await researchPacketNextCommand(packetDir, { trace: true });
      const tracePath = path.join(packetDir, "navigation-trace.jsonl");
      const trace = await readFile(tracePath, "utf-8");

      expect(next.tracePath).toBe(tracePath);
      expect(trace).toContain(next.decisionId);
      expect(trace).toContain("\"recordHash\"");
      expect(trace).toContain("\"eventType\":\"research.packet.next\"");
      expect(trace).toContain("\"schemaVersion\":1");
      expect(trace).toContain("\"recommendedCommands\"");
    } finally {
      await rm(packetDir, { recursive: true, force: true });
    }
  });

  it("summarizes navigation traces without changing packet state", async () => {
    const packetDir = await mkdtemp(path.join(os.tmpdir(), "research-navigation-trace-"));
    try {
      await writeFile(path.join(packetDir, "design.json"), "{}\n");
      const next = await researchPacketNextCommand(packetDir, { trace: true });
      const summary = await researchNavigationTraceCommand(packetDir);
      const parsed = JSON.parse(renderResearchNavigationTraceJson(summary)) as {
        schemaVersion: number;
        navigationTrace: { status: string; events: number; malformedLines: number; hashChainStatus: string; eventTypes: Record<string, number>; lastEvent: { decisionId: string } };
      };

      expect(summary.status).toBe("valid");
      expect(summary.hashChainStatus).toBe("valid");
      expect(summary.exists).toBe(true);
      expect(summary.events).toBe(1);
      expect(summary.malformedLines).toBe(0);
      expect(summary.eventTypes["research.packet.next"]).toBe(1);
      expect(summary.lastEvent?.decisionId).toBe(next.decisionId);
      expect(renderResearchNavigationTrace(summary)).toContain(next.decisionId);
      expect(renderResearchNavigationTrace(summary)).toContain("status: valid");
      expect(renderResearchNavigationTrace(summary)).toContain("hash chain: valid");
      expect(renderResearchNavigationTrace(summary)).toContain("event types: research.packet.next=1");
      expect(parsed.schemaVersion).toBe(1);
      expect(parsed.navigationTrace.status).toBe("valid");
      expect(parsed.navigationTrace.hashChainStatus).toBe("valid");
      expect(parsed.navigationTrace.events).toBe(1);
      expect(parsed.navigationTrace.malformedLines).toBe(0);
    } finally {
      await rm(packetDir, { recursive: true, force: true });
    }
  });

  it("reports malformed navigation trace lines", async () => {
    const packetDir = await mkdtemp(path.join(os.tmpdir(), "research-navigation-trace-bad-"));
    try {
      await writeFile(path.join(packetDir, "navigation-trace.jsonl"), "{\"eventType\":\"research.packet.next\"}\nnot-json\n");
      const summary = await researchNavigationTraceCommand(packetDir);

      expect(summary.status).toBe("invalid");
      expect(summary.exists).toBe(true);
      expect(summary.events).toBe(1);
      expect(summary.malformedLines).toBe(1);
      expect(summary.hashChainStatus).toBe("broken");
      expect(summary.eventTypes["research.packet.next"]).toBe(1);
    } finally {
      await rm(packetDir, { recursive: true, force: true });
    }
  });

  it("aggregates packet integrity verification from existing verifiers", async () => {
    const packetDir = await mkdtemp(path.join(os.tmpdir(), "research-packet-verify-"));
    try {
      await writeFile(path.join(packetDir, "design.json"), "{}\n");
      await researchPacketNextCommand(packetDir, { trace: true });
      const approvalWithoutHash = {
        schemaVersion: 1,
        eventType: "research.packet.approval",
        packetDir,
        approvedAtIso: "2026-01-01T00:00:00.000Z",
        decisionId: "approval1234567",
        reviewer: "agent-human-in-the-loop",
        status: "approved",
        title: "Fixture approval",
        note: "ok",
        critiqueStatus: "pass",
        scoutStatus: "plan_ready",
      };
      const hash = createHash("sha256").update(JSON.stringify(approvalWithoutHash)).digest("hex");
      await writeFile(path.join(packetDir, "approval.json"), `${JSON.stringify({ ...approvalWithoutHash, recordHash: hash }, null, 2)}\n`);
      await researchArtifactManifestCommand(packetDir);

      const verification = await researchPacketVerifyCommand(packetDir);
      const parsed = JSON.parse(renderResearchPacketVerificationJson(verification)) as {
        schemaVersion: number;
        packetVerification: { mode: string; scope: string[]; status: string; exportIntegrityReady: boolean; exportIntegrityReason: string; summary: string; nextAction: string };
      };

      expect(verification.mode).toBe("available-integrity");
      expect(verification.scope).toEqual(["approval-record-hash", "navigation-trace-jsonl", "artifact-manifest-hashes"]);
      expect(verification.status).toBe("pass");
      expect(verification.exportIntegrityReady).toBe(true);
      expect(verification.exportIntegrityReason).toContain("matches packet artifacts");
      expect(verification.summary).toContain("does not validate scientific methods");
      expect(verification.nextAction).toContain("methods validation");
      expect(renderResearchPacketVerification(verification)).toContain("mode: available-integrity");
      expect(renderResearchPacketVerification(verification)).toContain("export integrity: ready");
      expect(renderResearchPacketVerification(verification)).toContain("summary:");
      expect(renderResearchPacketVerification(verification)).toContain("status: pass");
      expect(parsed.schemaVersion).toBe(1);
      expect(parsed.packetVerification.mode).toBe("available-integrity");
      expect(parsed.packetVerification.status).toBe("pass");
      expect(parsed.packetVerification.exportIntegrityReady).toBe(true);
      expect(parsed.packetVerification.exportIntegrityReason).toContain("matches packet artifacts");
      expect(parsed.packetVerification.nextAction).toContain("methods validation");
    } finally {
      await rm(packetDir, { recursive: true, force: true });
    }
  });

  it("reports scoped packet readiness without certifying scientific validity", async () => {
    const repo = await makeRepo();
    const packetDir = await mkdtemp(path.join(os.tmpdir(), "research-packet-readiness-"));
    const exportDir = await mkdtemp(path.join(os.tmpdir(), "research-packet-readiness-export-"));
    const fixture = path.join(packetDir, "rows.json");
    try {
      await researchDesignCommand({
        project: "medbrevia-nhanes",
        repoDir: repo,
        question: "Vitamin D deficiency and measured hypertension in NHANES adults",
        outDir: packetDir,
      });
      await researchPacketNextCommand(packetDir, { trace: true });
      await writeFile(fixture, `${JSON.stringify([
        { SEQN: 1, RIDSTATR: 2, RIDAGEYR: 44, RIAGENDR: 1, RIDRETH3: 3, LBXVIDMS: 40, BPXSY1: 140, BPXDI1: 90, WTMEC2YR: 1 },
        { SEQN: 2, RIDSTATR: 2, RIDAGEYR: 52, RIAGENDR: 2, RIDRETH3: 4, LBXVIDMS: 20, BPXSY1: 116, BPXDI1: 74, WTMEC2YR: 1 },
      ], null, 2)}\n`);
      await researchScoutPlanCommand(packetDir, fixture);
      await researchRunnerSpecCommand(packetDir);
      await researchApprovePacketCommand(packetDir, "Approved for readiness fixture.");
      await researchAnalyzeLocalCommand(packetDir, fixture);
      await researchReviewReportCommand(packetDir);
      await researchValidateMethodsCommand(packetDir);
      await researchRoCrateCommand(packetDir);
      await researchProvenanceCommand(packetDir);
      await researchArtifactManifestCommand(packetDir);
      const readinessBeforeExport = await researchPacketReadinessCommand(packetDir);
      expect(readinessBeforeExport.status).toBe("review_ready");
      expect(readinessBeforeExport.sharePosture).toBe("do_not_share");
      await researchExportPacketCommand(packetDir, exportDir);
      await researchArtifactManifestCommand(packetDir);

      const readiness = await researchPacketReadinessCommand(packetDir);
      const parsed = JSON.parse(renderResearchPacketReadinessJson(readiness)) as {
        schemaVersion: number;
        packetReadiness: {
          mode: string;
          readinessProfile: { id: string; selection: string };
          scope: string[];
          status: string;
          decisionPosture: string;
          sharePosture: string;
          stopReasons: string[];
          recommendedCommands: string[];
          clinicianSummary: string;
          limitations: string[];
          references: Array<{ id: string; url: string }>;
        };
      };

      expect(readiness.mode).toBe("review-readiness");
      expect(readiness.readinessProfile.id).toBe("observational-survey-v1");
      expect(readiness.scope).toContain("claim-language-guard");
      expect(["stop", "read_with_caution", "ready_for_scientific_review"]).toContain(readiness.decisionPosture);
      expect(["do_not_share", "share_with_caution", "ready_to_share"]).toContain(readiness.sharePosture);
      expect(Array.isArray(readiness.stopReasons)).toBe(true);
      expect(Array.isArray(readiness.recommendedCommands)).toBe(true);
      expect(readiness.recommendedCommands.every(command => command.startsWith("agenteer research ") && !command.includes("&&"))).toBe(true);
      expect(readiness.clinicianSummary).toContain("report");
      expect(readiness.components.map(component => component.id)).toEqual(expect.arrayContaining(["integrity", "methods-validation", "claim-guard", "provenance"]));
      expect(readiness.limitations.join(" ")).toContain("not proof of scientific validity");
      expect(readiness.limitations.join(" ")).toContain("weights");
      expect(readiness.references.map(reference => reference.id)).toContain("strobe-official");
      expect(renderResearchPacketReadiness(readiness)).toContain("limitations:");
      expect(renderResearchPacketReadiness(readiness)).toContain("references:");
      expect(renderResearchPacketReadiness(readiness)).toContain("profile: observational-survey-v1");
      expect(renderResearchPacketReadiness(readiness)).toContain("profile caveat:");
      expect(parsed.schemaVersion).toBe(1);
      expect(parsed.packetReadiness.mode).toBe("review-readiness");
      expect(parsed.packetReadiness.readinessProfile.selection).toBe("default");
      expect(parsed.packetReadiness.clinicianSummary.length).toBeGreaterThan(20);
      expect(parsed.packetReadiness.references.find(reference => reference.id === "strobe-official")?.url).toContain("strobe-statement");
      expect(JSON.parse(await readFile(path.join(packetDir, "packet-readiness.json"), "utf-8"))).toMatchObject({ mode: "review-readiness" });
    } finally {
      await rm(repo, { recursive: true, force: true });
      await rm(packetDir, { recursive: true, force: true });
      await rm(exportDir, { recursive: true, force: true });
    }
  });

  it("reports stage-aware checkpoints without executing the next stage", async () => {
    const repo = await makeRepo();
    const outDir = await mkdtemp(path.join(os.tmpdir(), "research-checkpoint-"));
    try {
      await researchDesignCommand({
        project: "medbrevia-nhanes",
        repoDir: repo,
        question: "Vitamin D deficiency and measured hypertension in NHANES adults",
        outDir,
      });

      const checkpoint = await researchCheckpointCommand(outDir);

      expect(checkpoint.currentStage).toBe("scout");
      expect(checkpoint.artifacts.design).toBe(true);
      expect(checkpoint.artifacts.scoutPlan).toBe(false);
      expect(renderResearchCheckpoint(checkpoint)).toContain("research scout");
    } finally {
      await rm(repo, { recursive: true, force: true });
      await rm(outDir, { recursive: true, force: true });
    }
  });

  it("recommends runner spec after scout planning", async () => {
    const repo = await makeRepo();
    const outDir = await mkdtemp(path.join(os.tmpdir(), "research-checkpoint-runner-"));
    try {
      await researchDesignCommand({
        project: "medbrevia-nhanes",
        repoDir: repo,
        question: "Vitamin D deficiency and measured hypertension in NHANES adults",
        outDir,
      });
      await researchScoutPlanCommand(outDir);

      const checkpoint = await researchCheckpointCommand(outDir);

      expect(checkpoint.currentStage).toBe("runner_spec");
      expect(checkpoint.artifacts.runnerSpec).toBe(false);
      expect(renderResearchCheckpoint(checkpoint)).toContain("research runner-spec");
    } finally {
      await rm(repo, { recursive: true, force: true });
      await rm(outDir, { recursive: true, force: true });
    }
  });

  it("reports durable loop status from state files", async () => {
    const stateDir = await mkdtemp(path.join(os.tmpdir(), "research-loop-state-"));
    try {
      await writeFile(path.join(stateDir, "state.json"), `${JSON.stringify({
        currentPacket: "/tmp/packet",
        nextAction: "agenteer research checkpoint --packet /tmp/packet",
      }, null, 2)}\n`);
      await writeFile(path.join(stateDir, "journal.md"), "## Cycle 1\n\nInitialized.\n\n## Cycle 2\n\nContinued.\n");
      await writeFile(path.join(stateDir, "backlog.json"), `${JSON.stringify([
        { id: "runner-adapter", status: "todo" },
      ], null, 2)}\n`);

      const status = await researchLoopStatusCommand(stateDir);

      expect(status.stateExists).toBe(true);
      expect(status.journalEntries).toBe(2);
      expect(status.backlogItems).toBe(1);
      expect(renderResearchLoopStatus(status)).toContain("state: present");
    } finally {
      await rm(stateDir, { recursive: true, force: true });
    }
  });

  it("renders durable loop status as machine-readable JSON", async () => {
    const stateDir = await mkdtemp(path.join(os.tmpdir(), "research-loop-status-json-"));
    try {
      await researchLoopNoteCommand({
        stateDir,
        cycle: 42,
        summary: "Loop status JSON test.",
        nextAction: "Continue from structured state.",
      });

      const status = await researchLoopStatusCommand(stateDir);
      const parsed = JSON.parse(renderResearchLoopStatusJson(status)) as {
        schemaVersion: number;
        loopStatus: { stateExists: boolean; journalEntries: number; nextAction: string };
      };

      expect(parsed.schemaVersion).toBe(1);
      expect(parsed.loopStatus.stateExists).toBe(true);
      expect(parsed.loopStatus.journalEntries).toBe(1);
      expect(parsed.loopStatus.nextAction).toContain("structured state");
    } finally {
      await rm(stateDir, { recursive: true, force: true });
    }
  });

  it("appends durable loop journal notes and updates state", async () => {
    const stateDir = await mkdtemp(path.join(os.tmpdir(), "research-loop-note-"));
    try {
      await writeFile(path.join(stateDir, "state.json"), `${JSON.stringify({
        role: "test",
        cyclesCompletedThisRun: 1,
      }, null, 2)}\n`);

      const note = await researchLoopNoteCommand({
        stateDir,
        cycle: 2,
        summary: "Added journal command.",
        nextAction: "Run loop-status.",
      });
      const status = await researchLoopStatusCommand(stateDir);

      expect(note.cycle).toBe(2);
      expect(status.journalEntries).toBe(1);
      expect(status.state).toEqual(expect.objectContaining({
        cyclesCompletedThisRun: 2,
        nextAction: "Run loop-status.",
      }));
      expect(renderResearchLoopNote(note)).toContain("cycle: 2");
    } finally {
      await rm(stateDir, { recursive: true, force: true });
    }
  });
});

async function makeBenchmarkGoldenPacket(dir: string, opts: { omitLocalReviewNote?: boolean; rerunStatus?: "stable" | "changed" } = {}): Promise<void> {
  const paper = path.join(dir, "paper.md");
  const evidence = path.join(dir, "analysis.json");
  const analysisSpecPath = path.join(dir, "analysis-spec.json");
  const runnerRecordPath = path.join(dir, "runner-record.json");
  const qaPath = path.join(dir, "paper-qa.json");
  const sourceValidationPath = path.join(dir, "source-validation.json");
  const rerunDiffPath = path.join(dir, "rerun-diff.json");
  const shareSafetyPath = path.join(dir, "share-safety.json");
  const localReviewPath = path.join(dir, "local-review-note.md");
  const goldenPacketPath = path.join(dir, "golden-packet.json");
  await writeFile(paper, [
    "# Mini Golden Paper",
    "## Abstract",
    "This observational cross-sectional NHANES-style paper studies insurance coverage and HbA1c.",
    "## Introduction",
    "The question is public-health relevant.",
    "## Methods",
    "We used WTMEC2YR survey weight language and disclosed strata and PSU complex survey limitations.",
    "A weighted approximate linear regression estimated an adjusted mean difference, adjusting for age, sex, and race.",
    "## Results",
    "There were 1,000 complete-case eligible rows and the adjusted mean difference was 0.05 (95% CI 0.01 to 0.08; p=0.0047).",
    "## Discussion",
    "The result is exploratory and cannot infer causality.",
    "## Limitations",
    "Missing data and complete-case handling may bias results; approximate variance without full complex survey strata and PSU is a limitation.",
    "## Reproducibility",
    "Evidence is in analysis.json.",
    "## References",
    "https://www.strobe-statement.org/",
    "https://wwwn.cdc.gov/nchs/nhanes/AnalyticGuidelines.aspx",
    "https://arxiv.org/abs/2004.14066",
  ].join("\n"));
  await writeFile(evidence, `${JSON.stringify({
    rowCounts: { completeCaseEligible: 1000 },
    model: {
      type: "weighted approximate linear regression",
      covariates: ["uninsured", "age_10", "female", "race_1"],
      uninsuredMeanDifferenceHbA1cPercent: 0.05,
      ci95: [0.01, 0.08],
      pValue: 0.0047,
    },
    limitations: ["Approximate survey weights only"],
  }, null, 2)}\n`);
  const qa = await researchPaperQaCommand({ paperPath: paper, evidencePath: evidence });
  await writeFile(qaPath, renderResearchPaperQaJson(qa));
  await writeFile(analysisSpecPath, `${JSON.stringify({
    schemaVersion: 1,
    analysisSpec: {
      schemaVersion: 1,
      id: "analysis_test_golden",
      researchQuestion: "Among adults, is insurance associated with HbA1c?",
      surveyDesign: {
        weightVariable: "WTMEC2YR",
        strataVariable: "SDMVSTRA",
        psuVariable: "SDMVPSU",
      },
      analysisPlan: ["approximate weighted observational association"],
      inferencePolicy: {
        varianceEstimator: "approximate_weighted",
        allowedInference: "exploratory_association",
        causalClaimsAllowed: false,
      },
      failurePolicy: {
        rerunInstability: "block",
        missingVariable: "block",
      },
      requiredVariables: ["WTMEC2YR", "SDMVSTRA", "SDMVPSU", "LBXGH", "HIQ011"],
      specHash: "spec_current",
    },
  }, null, 2)}\n`);
  await writeFile(runnerRecordPath, `${JSON.stringify({ status: "succeeded", analysisSpec: { specHash: "spec_current" } }, null, 2)}\n`);
  await writeFile(sourceValidationPath, `${JSON.stringify({ schemaVersion: 1, status: "passed" }, null, 2)}\n`);
  await writeFile(rerunDiffPath, `${JSON.stringify({ schemaVersion: 1, status: opts.rerunStatus ?? "stable", diffs: opts.rerunStatus === "changed" ? [{ path: "analysis.json", before: 1, after: 2 }] : [] }, null, 2)}\n`);
  await writeFile(shareSafetyPath, `${JSON.stringify({ schemaVersion: 1, status: "local_only_blocked_for_share", localPathCount: 1 }, null, 2)}\n`);
  if (!opts.omitLocalReviewNote) {
    await writeFile(localReviewPath, "Local review note: packet is suitable for local review with approximate variance limitations.\n");
  }
  await writeFile(goldenPacketPath, `${JSON.stringify({
    schemaVersion: 1,
    id: "golden_test_packet",
    artifacts: {
      paper,
      analysisEvidence: evidence,
      paperQa: qaPath,
      runnerRecord: runnerRecordPath,
    },
  }, null, 2)}\n`);
  const manifestArtifacts = [
    goldenPacketPath,
    analysisSpecPath,
    sourceValidationPath,
    rerunDiffPath,
    evidence,
    paper,
    qaPath,
    runnerRecordPath,
    shareSafetyPath,
    localReviewPath,
  ];
  const artifacts = [];
  for (const artifactPath of manifestArtifacts) {
    const bytes = await readFile(artifactPath).catch(() => null);
    artifacts.push({
      path: artifactPath,
      bytes: bytes?.byteLength ?? 0,
      sha256: bytes ? createHash("sha256").update(bytes).digest("hex") : "missing",
    });
  }
  await writeFile(path.join(dir, "golden-manifest.json"), `${JSON.stringify({
    schemaVersion: 1,
    id: "golden_test_packet",
    localReviewStatus: "ready_for_local_review",
    shareStatus: "local_only_blocked_for_share",
    checks: {
      sourceValidation: "passed",
      rerunDiff: opts.rerunStatus ?? "stable",
      paperQa: qa.status,
      runnerRecord: "present",
      shareSafety: "local_only_blocked_for_share",
    },
    artifacts,
  }, null, 2)}\n`);
}

async function makeRepo(): Promise<string> {
  const repo = await mkdtemp(path.join(os.tmpdir(), "research-fixture-"));
  const registryDir = path.join(repo, "data", "analytics", "nhanes");
  await mkdir(registryDir, { recursive: true });
  await writeFile(path.join(registryDir, "registry.json"), `${JSON.stringify({
    dataset: "nhanes",
    cycles: [{ id: "2017-2018" }],
    domains: {
      demographics: {},
      vitamin_d: {},
      blood_pressure: {},
	      anthropometrics: {},
	      smoking: {},
	      insurance_access: {},
      diabetes: {},
      kidney: {},
      lipids: {},
    },
    variables: [
      { name: "RIDAGEYR", domain: "demographics", label: "Age" },
      { name: "RIAGENDR", domain: "demographics", label: "Gender" },
      { name: "RIDRETH3", domain: "demographics", label: "Race ethnicity" },
      { name: "INDFMPIR", domain: "demographics", label: "Family income to poverty ratio" },
      { name: "WTMEC2YR", domain: "demographics", label: "MEC weight" },
      { name: "SDMVSTRA", domain: "demographics", label: "Strata" },
      { name: "SDMVPSU", domain: "demographics", label: "PSU" },
      { name: "LBXVIDMS", domain: "vitamin_d", label: "Vitamin D" },
      { name: "BPXSY1", domain: "blood_pressure", label: "Systolic BP" },
      { name: "BPXDI1", domain: "blood_pressure", label: "Diastolic BP" },
      { name: "BPQ020", domain: "blood_pressure", label: "Ever told you had high blood pressure" },
	      { name: "BMXBMI", domain: "anthropometrics", label: "Body mass index" },
	      { name: "SMQ020", domain: "smoking", label: "Smoked cigarettes" },
	      { name: "HIQ011", domain: "insurance_access", label: "Covered by health insurance" },
      { name: "LBXGH", domain: "diabetes", label: "Glycohemoglobin/HbA1c" },
      { name: "URDACT", domain: "kidney", label: "Urine albumin-creatinine ratio" },
      { name: "LBXSCR", domain: "kidney", label: "Serum creatinine" },
      { name: "LBXTC", domain: "lipids", label: "Total cholesterol" },
      { name: "LBDHDD", domain: "lipids", label: "HDL cholesterol" },
      { name: "LBXTR", domain: "lipids", label: "Triglycerides" },
	      { name: "WTMECPRP", domain: "demographics", label: "Pre-pandemic MEC weight" },
    ],
    weightRules: [
      {
        id: "mec",
        weightVariable: "WTMEC2YR",
        strataVariable: "SDMVSTRA",
        psuVariable: "SDMVPSU",
      },
    ],
  }, null, 2)}\n`);
  return repo;
}
