import { chmod, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  researchArchetypesCommand,
  researchDatasetAdapterCommand,
  researchDatasetRunCommand,
  researchDatasetRunIndexCommand,
  researchDatasetSpecCommand,
  researchExecutionContractCommand,
  researchMachineBenchmarkCommand,
  researchMachinePlanCommand,
  researchMachineStatusCommand,
  researchMethodApplyCommand,
  researchMethodSelectCommand,
  researchMethodValidateCommand,
  researchMethodsCatalogCommand,
  researchSpecV2Command,
  renderDatasetRun,
  renderDatasetRunIndex,
  renderDatasetSpec,
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
      expect(adapter.variableMetadataCount).toBeGreaterThan(10);
      expect(adapter.adapter.variableMetadata?.BMXBMI?.label).toBe("body mass index");
      expect(adapter.adapter.variableMetadata?.LBXGLU?.unit).toBe("mg/dL");
      expect(adapter.surveyWeightDomains.map(domain => domain.weight)).toEqual(expect.arrayContaining(["WTMEC2YR", "WTSAF2YR"]));
      expect(adapter.surveyWeightDomains.find(domain => domain.weight === "WTSAF2YR")?.isSubsample).toBe(true);
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

  it("creates an AnalysisSpec V2 from a MIMIC-style study and executes a manifest-backed dataset run", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "agenteer-dataset-run-"));
    try {
      const datasetDir = await writeMimicFixtureDataset(dir, 140, 60);
      const studyPath = path.join(dir, "hip-fracture-study.json");
      await writeFile(studyPath, `${JSON.stringify(mimicStudyArtifact(), null, 2)}\n`);
      const specPath = path.join(dir, "analysis-spec-v2.json");

      const spec = await researchDatasetSpecCommand({ studyPath, datasetDir, outPath: specPath });
      const run = await researchDatasetRunCommand({
        analysisSpecPath: specPath,
        datasetDir,
        outDir: path.join(dir, "runs", "hip-fracture"),
        python: path.resolve(".research-runtime/python/bin/python"),
        maxUsd: 1,
      });
      const index = await researchDatasetRunIndexCommand({
        runRoot: path.join(dir, "runs"),
        outPath: path.join(dir, "runs", "index.json"),
        reportPath: path.join(dir, "runs", "index.md"),
      });

      expect(spec.spec.archetype).toBe("ehr-diagnosis-cohort-outcome");
      expect(spec.spec.datasetAccess?.requiredTables).toEqual(expect.arrayContaining(["hosp-diagnoses-icd", "hosp-d-icd-diagnoses", "derived-icustay-detail"]));
      expect(spec.spec.phenotype?.codingReviewStatus).toBe("verified_online");
      expect(run.status).toBe("succeeded");
      expect(run.readiness).toBe("local_review_ready");
      expect(run.cohortSummary.firstCohortRows).toBe(140);
      expect(run.cohortSummary.matchedDiagnosisCodes).toBe(1);
      expect(run.modelStatus.mortality).toBe("fit");
      expect(run.modelStatus.los).toBe("fit");
      expect(run.artifacts.map(artifact => artifact.kind)).toEqual(expect.arrayContaining(["dataset-run", "analysis", "paper", "qa", "manifest", "cost", "matched-codes", "lifecycle"]));
      expect(index.totalRuns).toBe(1);
      expect(index.readinessCounts.local_review_ready).toBe(1);
      expect(renderDatasetSpec(spec)).toContain("research dataset spec");
      expect(renderDatasetRun(run)).toContain("local_review_ready");
      expect(renderDatasetRunIndex(index)).toContain("Dataset Run Index");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("downgrades sparse EHR outcome runs instead of promoting fitted models", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "agenteer-dataset-run-sparse-"));
    try {
      const datasetDir = await writeMimicFixtureDataset(dir, 55, 8);
      const studyPath = path.join(dir, "sparse-study.json");
      await writeFile(studyPath, `${JSON.stringify(mimicStudyArtifact(), null, 2)}\n`);
      const specPath = path.join(dir, "analysis-spec-v2.json");
      await researchDatasetSpecCommand({ studyPath, datasetDir, outPath: specPath });

      const run = await researchDatasetRunCommand({
        analysisSpecPath: specPath,
        datasetDir,
        outDir: path.join(dir, "runs", "sparse"),
        python: path.resolve(".research-runtime/python/bin/python"),
        maxUsd: 1,
      });

      expect(run.status).toBe("succeeded");
      expect(run.readiness).toBe("needs_methods_review");
      expect(run.qaStatus).toBe("review");
      expect(run.typedIssues.map(issue => issue.code)).toEqual(expect.arrayContaining(["SMALL_COHORT_REVIEW", "SPARSE_BINARY_OUTCOME_REVIEW", "LOW_EVENTS_PER_PREDICTOR"]));
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

async function writeMimicFixtureDataset(root: string, rows: number, deaths: number): Promise<string> {
  const datasetDir = path.join(root, "dataset");
  const sourceDir = path.join(root, "source");
  await mkdir(datasetDir, { recursive: true });
  await mkdir(sourceDir, { recursive: true });
  const diagnosesPath = path.join(sourceDir, "hosp-diagnoses-icd.csv");
  const dictionaryPath = path.join(sourceDir, "hosp-d-icd-diagnoses.csv");
  const detailPath = path.join(sourceDir, "derived-icustay-detail.csv");
  await writeFile(dictionaryPath, "icd_code,icd_version,long_title\nS72001,10,Fracture of unspecified part of neck of femur\n");
  const dx = ["subject_id,hadm_id,icd_code,icd_version"];
  const detail = ["subject_id,hadm_id,stay_id,icu_intime,gender,admission_age,hospital_expire_flag,los_icu,apsiii,oasis,sofa"];
  for (let i = 1; i <= rows; i += 1) {
    dx.push(`${i},${1000 + i},S72001,10`);
    const died = i <= deaths ? 1 : 0;
    const age = 55 + (i % 35);
    const apsiii = 35 + (i % 45) + (died ? 4 : 0);
    const los = died ? 6 + (i % 5) : 2 + (i % 4);
    detail.push(`${i},${1000 + i},${2000 + i},2024-01-${String((i % 27) + 1).padStart(2, "0")},${i % 2 ? "M" : "F"},${age},${died},${los},${apsiii},${20 + (i % 10)},${2 + (i % 7)}`);
  }
  await writeFile(diagnosesPath, `${dx.join("\n")}\n`);
  await writeFile(detailPath, `${detail.join("\n")}\n`);
  const tables = [
    { tableId: "hosp-diagnoses-icd", sourcePath: diagnosesPath },
    { tableId: "hosp-d-icd-diagnoses", sourcePath: dictionaryPath },
    { tableId: "derived-icustay-detail", sourcePath: detailPath },
  ];
  const manifest = {
    schemaVersion: 1,
    datasetId: "mimic-fixture",
    title: "MIMIC fixture",
    description: "Local deterministic MIMIC-style fixture.",
    domain: "ehr",
    generatedAtIso: "2026-05-06T00:00:00.000Z",
    source: { kind: "local-directory", uri: sourceDir, manifestPath: null },
    storage: { totalBytes: 3072, tableCount: tables.length, profiledTableCount: tables.length, rowCountTotalKnown: null, supportedFormats: ["csv"] },
    access: { local: true, cloud: false, piiPhiRisk: "high", license: "fixture", restrictions: ["no row-level export"] },
    standardLayout: { root: datasetDir, manifest: path.join(datasetDir, "dataset-manifest.json"), variableRegistry: "", relationshipGraph: "", profile: "", watchouts: "", questions: "", summary: "", context: "" },
    tables: tables.map(table => ({ ...table, format: "csv", bytes: 1024, rowCount: null, columnCount: null, profileStatus: "profiled" })),
    hash: "fixture",
  };
  await writeFile(path.join(datasetDir, "dataset-manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  return datasetDir;
}

function mimicStudyArtifact(): unknown {
  return {
    schemaVersion: 1,
    study: {
      id: "mimic-fixture-hip-fracture",
      title: "Hip Fracture ICU Outcomes",
      question: "Among ICU stays with hip fracture diagnosis codes, what predicts mortality and ICU length of stay?",
      population: "First ICU stays for hospitalizations with matching hip fracture diagnosis codes.",
      tables: ["hosp-diagnoses-icd", "hosp-d-icd-diagnoses", "derived-icustay-detail"],
    },
    icdFamilies: [
      {
        system: "icd10cm",
        query: "S72.0",
        expectedTerms: ["fracture"],
        verifiedOnline: true,
        verificationRefs: ["https://clinicaltables.nlm.nih.gov/apidoc/icd10cm/v3/doc.html"],
      },
    ],
  };
}
