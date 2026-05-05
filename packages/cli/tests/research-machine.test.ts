import { chmod, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  researchArchetypesCommand,
  researchDatasetAdapterCommand,
  researchExecutionContractCommand,
  researchMachineBenchmarkCommand,
  researchMachinePlanCommand,
  researchMachineStatusCommand,
  researchMethodApplyCommand,
  researchMethodSelectCommand,
  researchMethodValidateCommand,
  researchMethodsCatalogCommand,
  researchSpecV2Command,
  renderResearchExecutionContractJson,
  renderResearchMachineBenchmarkJson,
  renderResearchMachinePlan,
  renderResearchMachineStatusJson,
  renderResearchMachineMethodSelectionJson,
  renderResearchMethodsCatalog,
  renderResearchSpecV2Json,
} from "../src/research-machine/commands.js";

describe("research machine layer", () => {
  it("probes analysis engines and NHANES adapter evidence through machine status", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "agenteer-machine-status-"));
    try {
      const fakePython = path.join(dir, "fake-python");
      const fakeRscript = path.join(dir, "fake-Rscript");
      const dataRoot = path.join(dir, "nhanes");
      await mkdir(dataRoot);
      await writeFile(path.join(dataRoot, "DEMO_J.parquet"), "");
      await writeFile(path.join(dataRoot, "GLU_J.parquet"), "");
      await writeFile(fakePython, `#!/bin/sh
cat <<'JSON'
{"version":"3.12.0","packages":{"duckdb":"1","polars":"1","pyarrow":"1","numpy":"1","pandas":"1","statsmodels":"1","sklearn":"1"}}
JSON
`);
      await writeFile(fakeRscript, `#!/bin/sh
cat <<'JSON'
{"version":"4.5.0","packages":{"survey":"4","jsonlite":"2","arrow":"20","gtsummary":"2","dplyr":"1","broom":"1"}}
JSON
`);
      await chmod(fakePython, 0o755);
      await chmod(fakeRscript, 0o755);

      const status = await researchMachineStatusCommand({ python: fakePython, rscript: fakeRscript, dataRoot });
      const parsed = JSON.parse(renderResearchMachineStatusJson(status)) as {
        machineStatus: { backends: Array<{ id: string; availability: string }>; datasets: Array<{ id: string; availability: string }> };
      };

      expect(status.tracks.map(track => track.id)).toContain("analysis-spec-v2");
      expect(status.backends.find(backend => backend.id === "r-survey")?.availability).toBe("available");
      expect(status.backends.find(backend => backend.id === "duckdb-polars")?.availability).toBe("available");
      expect(status.datasets.find(dataset => dataset.id === "nhanes")?.availability).toBe("available");
      expect(parsed.machineStatus.backends.find(backend => backend.id === "r-survey")?.availability).toBe("available");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("migrates AnalysisSpec V1 to strict V2 and builds a validated execution contract", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "agenteer-spec-v2-"));
    try {
      const specPath = path.join(dir, "analysis-spec.json");
      const outPath = path.join(dir, "analysis-spec-v2.json");
      await writeFile(specPath, `${JSON.stringify(wrappedV1Spec(), null, 2)}\n`);

      const migrated = await researchSpecV2Command({ specPath, outPath });
      const contract = researchExecutionContractCommand({ spec: { analysisSpec: migrated.spec }, backend: "r-survey", dataRoot: "/tmp/nhanes", outDir: "/tmp/out" });
      const parsedSpec = JSON.parse(renderResearchSpecV2Json(migrated)) as { analysisSpecV2: { schemaVersion: number; specHash: string } };
      const parsedContract = JSON.parse(renderResearchExecutionContractJson(contract)) as { executionContract: { validation: { status: string } } };

      expect(migrated.sourceKind).toBe("analysis-spec-v1");
      expect(migrated.validation.status).toBe("pass");
      expect(migrated.spec.schemaVersion).toBe(2);
      expect(migrated.spec.backendRequirements.preferred).toBe("r-survey");
      expect(migrated.spec.surveyDesign.weightDomain).toBe("fasting");
      expect(contract.validation.status).toBe("pass");
      expect(contract.runner.command).toContain("r-survey");
      expect(parsedSpec.analysisSpecV2.schemaVersion).toBe(2);
      expect(parsedSpec.analysisSpecV2.specHash).toHaveLength(64);
      expect(parsedContract.executionContract.validation.status).toBe("pass");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("blocks unsupported backend/archetype combinations before execution", () => {
    const migrated = researchExecutionContractCommand({
      spec: wrappedV1Spec(),
      backend: "sklearn",
      dataRoot: "/tmp/nhanes",
    });

    expect(migrated.validation.status).toBe("blocked");
    expect(migrated.validation.issues.map(issue => issue.code)).toEqual(expect.arrayContaining(["BACKEND_NOT_ALLOWED", "ARCHETYPE_BACKEND_UNSUPPORTED", "BACKEND_NOT_PRODUCTION_READY"]));
    expect(migrated.policyEnvelope.requiresHumanReview).toBe(true);
  });

  it("selects planner dataset, archetype, backend, review gates, and command sequence", () => {
    const plan = researchMachinePlanCommand({
      question: "In NHANES adults, is BMI associated with fasting glucose in the fasting subsample?",
      dataRoot: "/tmp/nhanes",
    });

    expect(plan.dataset.id).toBe("nhanes");
    expect(plan.archetype.id).toBe("subsample-high-missingness");
    expect(plan.backend.id).toBe("r-survey");
    expect(plan.commandSequence.some(command => command.includes("spec-v2"))).toBe(true);
    expect(renderResearchMachinePlan(plan)).toContain("research machine plan");
  });

  it("inspects dataset adapter availability and lists archetype capability contracts", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "agenteer-dataset-adapter-"));
    try {
      await writeFile(path.join(dir, "DEMO.parquet"), "");
      const adapter = await researchDatasetAdapterCommand({ dataset: "nhanes", dataRoot: dir });
      const archetypes = researchArchetypesCommand();

      expect(adapter.availability).toBe("available");
      expect(adapter.discoveredFiles[0]?.role).toBe("demographics/survey-design");
      expect(archetypes.archetypes.map(archetype => archetype.id)).toContain("target-trial-emulation-sketch");
      expect(archetypes.archetypes.find(archetype => archetype.id === "subgroup-domain-analysis")?.allowedBackends).toEqual(["r-survey"]);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("evaluates machine benchmark artifacts, QA, lifecycle, provenance, and rerun stability", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "agenteer-machine-benchmark-"));
    try {
      await writeFile(path.join(dir, "analysis-spec.json"), `${JSON.stringify(wrappedV1Spec(), null, 2)}\n`);
      await writeFile(path.join(dir, "analysis.json"), "{}\n");
      await writeFile(path.join(dir, "paper.md"), "# Paper\n");
      await writeFile(path.join(dir, "qa-cli.json"), `${JSON.stringify({ paperQa: { status: "pass" } })}\n`);
      await writeFile(path.join(dir, "runner-record.json"), `${JSON.stringify({ paperRunnerRecord: { analysisSpec: { binding: "spec-governed" } } })}\n`);
      await writeFile(path.join(dir, "lifecycle.json"), `${JSON.stringify({ paperLifecycle: { lifecycleStatus: "ready_for_local_review" } })}\n`);
      await writeFile(path.join(dir, "rerun-stability.json"), `${JSON.stringify({ paperRerunStability: { status: "pass" } })}\n`);

      const result = await researchMachineBenchmarkCommand({ packetDir: dir, specPath: path.join(dir, "analysis-spec.json"), outPath: path.join(dir, "machine-benchmark.json") });
      const parsed = JSON.parse(renderResearchMachineBenchmarkJson(result)) as { evaluation: { status: string; normalizedScore: number } };

      expect(result.evaluation.status).toBe("pass");
      expect(result.evaluation.normalizedScore).toBe(1);
      expect(result.benchmark.expectedArtifacts).toEqual(expect.arrayContaining(["analysis.json", "paper.md", "qa-cli.json", "runner-record.json", "lifecycle.json"]));
      expect(parsed.evaluation.status).toBe("pass");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("exposes a comprehensive analysis-method ontology across major biomedical method families", () => {
    const catalog = researchMethodsCatalogCommand();
    const categories = new Set(catalog.methods.map(method => method.category));

    expect(catalog.methods.length).toBeGreaterThanOrEqual(40);
    expect([...categories]).toEqual(expect.arrayContaining([
      "descriptive",
      "group_comparison",
      "linear_regression",
      "logistic_regression",
      "survival_time_to_event",
      "causal_inference",
      "diagnostic_prognostic",
      "prediction_machine_learning",
      "missing_data",
      "clinical_trial",
      "health_economics",
      "text_nlp",
      "model_diagnostics",
      "multiple_comparisons",
    ]));
    expect(catalog.methods.find(method => method.id === "cox-proportional-hazards")?.requiredFields).toContain("time at risk");
    expect(catalog.methods.find(method => method.id === "multiple-imputation-mice")?.qaGates).toContain("missingness-mechanism");
    expect(renderResearchMethodsCatalog(catalog)).toContain("research methods catalog");
  });

  it("selects R survey logistic methods for NHANES binary survey questions", async () => {
    const selection = await researchMethodSelectCommand({
      question: "In NHANES adults, are higher BMI values associated with elevated HbA1c odds?",
      dataset: "nhanes",
      outcomeType: "binary",
      surveyDesign: true,
      maxCandidates: 8,
    });
    const parsed = JSON.parse(renderResearchMachineMethodSelectionJson(selection)) as {
      methodSelection: { primary: { method: { id: string } }; recommendedBackend: string; recommendedArchetype: string };
    };

    expect(selection.primary?.method.id).toBe("binary-logistic-regression");
    expect(selection.recommendedBackend).toBe("r-survey");
    expect(selection.recommendedArchetype).toBe("binary-outcome-model");
    expect(selection.candidates.some(candidate => candidate.method.id === "survey-weighted-descriptive-summary")).toBe(true);
    expect(parsed.methodSelection.primary.method.id).toBe("binary-logistic-regression");
  });

  it("selects Cox survival methods and blocks execution until survival runners are verified", async () => {
    const selection = await researchMethodSelectCommand({
      question: "In a cohort, is treatment associated with time to readmission?",
      outcomeType: "time_to_event",
      studyDesign: "cohort",
      timeToEvent: true,
      goal: "associate",
      maxCandidates: 5,
    });

    expect(selection.primary?.method.id).toBe("cox-proportional-hazards");
    expect(selection.recommendedBackend).toBe("r-survival");
    expect(selection.stopForHumanReview).toBe(true);
    expect(selection.issues.map(issue => issue.code)).toContain("METHOD_NO_PRODUCTION_BACKEND");
  });

  it("persists method selections, applies them to AnalysisSpec V2, and validates method/spec compatibility", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "agenteer-method-apply-"));
    try {
      const specPath = path.join(dir, "analysis-spec.json");
      const selectionPath = path.join(dir, "selection.json");
      const outPath = path.join(dir, "analysis-spec-v2-method.json");
      await writeFile(specPath, `${JSON.stringify(wrappedV1Spec(), null, 2)}\n`);
      const selection = await researchMethodSelectCommand({
        question: "In NHANES adults, is BMI associated with fasting glucose in the fasting subsample?",
        dataset: "nhanes",
        outcomeType: "continuous",
        surveyDesign: true,
        outPath: selectionPath,
      });
      const applied = await researchMethodApplyCommand({ specPath, selectionPath, outPath });
      const validation = await researchMethodValidateCommand({ specPath: outPath, methodId: selection.primary?.method.id ?? "" });

      expect(selection.outPath).toBe(selectionPath);
      expect(applied.spec.model.diagnostics).toEqual(expect.arrayContaining(selection.primary?.method.diagnostics ?? []));
      expect(applied.spec.backendRequirements.minimumCapabilities).toEqual(expect.arrayContaining(selection.primary?.method.qaGates ?? []));
      expect(applied.validation.status).toBe("pass");
      expect(validation.validation.status).toBe("pass");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("rejects incompatible method/spec pairings before execution", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "agenteer-method-invalid-"));
    try {
      const specPath = path.join(dir, "analysis-spec.json");
      await writeFile(specPath, `${JSON.stringify(wrappedV1Spec(), null, 2)}\n`);
      const validation = await researchMethodValidateCommand({ specPath, methodId: "cox-proportional-hazards" });

      expect(validation.validation.status).toBe("blocked");
      expect(validation.validation.issues.map(issue => issue.code)).toEqual(expect.arrayContaining(["METHOD_OUTCOME_MISMATCH", "METHOD_BACKEND_MISMATCH", "METHOD_REQUIRED_TIME_FIELD_MISSING", "METHOD_SURVEY_LIMITED"]));
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

function wrappedV1Spec(): unknown {
  return {
    schemaVersion: 1,
    analysisSpec: {
      schemaVersion: 1,
      id: "analysis_fasting_glucose",
      dataset: "nhanes",
      researchQuestion: "In NHANES adults, is BMI associated with fasting glucose in the fasting subsample?",
      population: { description: ["Adults aged 20 years and older"], filters: ["RIDAGEYR >= 20"] },
      variables: {
        outcome: ["LBXGLU"],
        exposures: ["BMXBMI"],
        covariates: ["RIDAGEYR", "RIAGENDR"],
        stratify: [],
        filters: ["RIDAGEYR"],
      },
      derivedDefinitions: { source: "test", definitions: [] },
      surveyDesign: {
        weightRule: "fasting-subsample",
        weightVariable: "WTSAF2YR",
        strataVariable: "SDMVSTRA",
        psuVariable: "SDMVPSU",
        weightRationale: "WTSAF2YR is required because fasting glucose is measured only in the fasting subsample.",
        eligibilityNote: "Eligible participants are fasting laboratory subsample members with positive WTSAF2YR weights.",
      },
      model: { binaryThreshold: null },
      inferencePolicy: {
        estimandType: "associational",
        varianceEstimator: "complex_survey",
        allowedInference: "design_corrected_inference",
        pValueLanguage: "standard",
        causalClaimsAllowed: false,
      },
      failurePolicy: {
        missingVariable: "block",
        invalidWeight: "block",
        highMissingnessThreshold: 0.4,
        sparseCellThreshold: 16,
        rerunInstability: "block",
        hashMismatch: "block",
        methodologicalUncertainty: "stop_for_review",
      },
      execution: { timeoutSeconds: 600, maxRows: 200000, maxOutputBytes: 25000000 },
      requiredVariables: ["LBXGLU", "BMXBMI", "WTSAF2YR", "SDMVSTRA", "SDMVPSU"],
      expectedOutputs: ["analysis.json", "paper.md"],
      specHash: "legacy_hash",
    },
  };
}
