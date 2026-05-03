import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  renderResearchPacketCritique,
  renderResearchPacketInspect,
  renderResearchQuestions,
  renderResearchScoutPlan,
  renderResearchApproval,
  renderResearchAnalysisResult,
  renderResearchArtifactManifest,
  renderResearchArtifactManifestJson,
  renderResearchLoopStatus,
  renderResearchLoopStatusJson,
  renderResearchLoopNote,
  renderResearchRunnerSpec,
  renderResearchPacketExport,
  renderResearchPacketSummary,
  renderResearchPacketSummaryJson,
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
  renderResearchSchemaInference,
  renderResearchSchemaInferenceJson,
  renderResearchPipelineStages,
  renderResearchPipelineStagesJson,
  renderResearchCheckpoint,
  renderResearchCheckpointJson,
  renderResearchReportReview,
  renderResearchReportReviewJson,
  researchAnalyzeLocalCommand,
  researchArtifactManifestCommand,
  researchLoopStatusCommand,
  researchLoopNoteCommand,
  researchRunnerSpecCommand,
  researchExportPacketCommand,
  researchPacketSummaryCommand,
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
  researchInferSchemaCommand,
  researchPipelineStagesCommand,
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

      expect(approval.status).toBe("approved");
      expect(approval.critiqueStatus).toBe("pass");
      expect(approval.scoutStatus).toBe("plan_ready");
      expect(renderResearchApproval(approval)).toContain("Protocol and scout plan reviewed.");
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
      const checkpoint = await researchCheckpointCommand(outDir);
      expect(checkpoint.currentStage).toBe("export");
      expect(checkpoint.nextCommand).toContain("research export");
    } finally {
      await rm(repo, { recursive: true, force: true });
      await rm(outDir, { recursive: true, force: true });
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

      const exported = await researchExportPacketCommand(packetDir, exportDir);
      const manifest = await researchArtifactManifestCommand(packetDir);
      const exportedManifest = JSON.parse(await readFile(path.join(exportDir, "artifact-manifest.json"), "utf-8")) as {
        artifacts: Array<{ path: string }>;
      };
      const exportedRecord = JSON.parse(await readFile(path.join(exportDir, "export-record.json"), "utf-8")) as {
        copiedArtifacts: string[];
      };
      const checkpoint = await researchCheckpointCommand(packetDir);

      expect(exported.copiedArtifacts).toEqual(expect.arrayContaining(["design.json", "runner-spec.json", "artifact-manifest.json", "export-record.json"]));
      expect(manifest.artifacts.map(artifact => artifact.path)).toContain("export-record.json");
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
        checkpoint: { currentStage: string; artifacts: { design: boolean }; nextCommand: string };
      };

      expect(parsed.schemaVersion).toBe(1);
      expect(parsed.checkpoint.currentStage).toBe("design");
      expect(parsed.checkpoint.artifacts.design).toBe(false);
      expect(parsed.checkpoint.nextCommand).toContain("agenteer research design");
    } finally {
      await rm(packetDir, { recursive: true, force: true });
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
