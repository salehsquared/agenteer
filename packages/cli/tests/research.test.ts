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
  renderResearchLoopStatus,
  renderResearchLoopStatusJson,
  renderResearchLoopNote,
  renderResearchRunnerSpec,
  renderResearchPacketExport,
  renderResearchPipelineStages,
  renderResearchPipelineStagesJson,
  renderResearchCheckpoint,
  renderResearchCheckpointJson,
  renderResearchReportReview,
  researchAnalyzeLocalCommand,
  researchArtifactManifestCommand,
  researchLoopStatusCommand,
  researchLoopNoteCommand,
  researchRunnerSpecCommand,
  researchExportPacketCommand,
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

  it("renders reusable research pipeline stages", () => {
    const stages = researchPipelineStagesCommand();

    expect(stages.map(stage => stage.id)).toEqual([
      "design",
      "critique",
      "scout",
      "runner-spec",
      "approval",
      "analysis",
      "report-review",
      "manifest",
      "export",
    ]);
    expect(renderResearchPipelineStages(stages)).toContain("@agenteer/node-research-protocol-design");
    expect(stages.find(stage => stage.id === "approval")?.humanReview).toBe(true);
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
      const checkpoint = await researchCheckpointCommand(outDir);
      expect(checkpoint.currentStage).toBe("export");
      expect(checkpoint.nextCommand).toContain("research export");
    } finally {
      await rm(repo, { recursive: true, force: true });
      await rm(outDir, { recursive: true, force: true });
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
