import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { z } from "zod";
import { getArchetypeManifest, getDatasetManifest } from "./catalog.js";
import { researchDatasetInspectCommand, type DatasetManifest } from "./datasets.js";
import { migrateToAnalysisSpecV2, readJsonFile, stableHash } from "./runtime.js";
import { analysisSpecV2Schema, type AnalysisSpecV2, type MachineIssue } from "./schemas.js";

const execFileAsync = promisify(execFile);

const icdFamilySchema = z.object({
  system: z.enum(["icd10cm", "icd9cm_dx"]),
  query: z.string().min(1),
  expectedTerms: z.array(z.string()).default([]),
  verifiedOnline: z.boolean().default(false),
  verificationRefs: z.array(z.string()).default([]),
});

const datasetRunRequestSchema = z.object({
  schemaVersion: z.literal(1),
  analysisSpecPath: z.string().min(1),
  datasetDir: z.string().min(1),
  outDir: z.string().min(1),
  python: z.string().optional(),
  maxUsd: z.number().min(0).default(1),
  usdPerGbRead: z.number().min(0).default(0.12),
  allowGcs: z.boolean().default(false),
});
export type DatasetRunRequest = z.infer<typeof datasetRunRequestSchema>;

export interface DatasetRunIssue {
  severity: "blocker" | "warning" | "note";
  code: string;
  message: string;
  evidenceRefs: string[];
  terms?: string[];
}

export interface DatasetRunArtifact {
  kind: "dataset-run" | "analysis" | "paper" | "qa" | "manifest" | "cost" | "matched-codes" | "lifecycle" | "critique" | "config";
  path: string;
  sha256?: string;
}

export interface DatasetRunResult {
  schemaVersion: 1;
  runId: string;
  status: "succeeded" | "failed";
  readiness: "local_review_ready" | "needs_methods_review" | "blocked";
  analysisSpecPath: string;
  specHash: string;
  datasetDir: string;
  datasetId: string;
  studyTitle: string;
  cohortSummary: {
    matchedDiagnosisCodes: number;
    matchedDiagnosisRows: number;
    matchedAdmissions: number;
    firstCohortRows: number;
    uniquePatients: number | null;
  };
  modelStatus: {
    mortality: "fit" | "not_fit" | "not_requested";
    los: "fit" | "not_fit" | "not_requested";
  };
  qaStatus: "pass" | "review" | "fail";
  typedIssues: DatasetRunIssue[];
  cost: {
    estimatedUsd: number;
    readBytes: number;
    maxUsd: number;
    usdPerGbRead: number;
  };
  artifacts: DatasetRunArtifact[];
  outDir: string;
  nextAction: string;
}

export interface DatasetSpecFromStudyResult {
  schemaVersion: 1;
  spec: AnalysisSpecV2;
  sourceStudyPath: string;
  datasetDir: string;
  outPath: string | null;
  validation: ReturnType<typeof migrateToAnalysisSpecV2>["validation"];
}

export interface DatasetRunIndex {
  schemaVersion: 1;
  runRoot: string;
  generatedAtIso: string;
  totalRuns: number;
  qaCounts: Record<string, number>;
  readinessCounts: Record<string, number>;
  estimatedUsd: number;
  allCachesRemoved: boolean;
  runs: DatasetRunResult[];
  nextAction: string;
  outPath: string | null;
  reportPath: string | null;
}

function nowIso(): string {
  return new Date().toISOString();
}

function hashFileContents(raw: Buffer | string): string {
  return createHash("sha256").update(raw).digest("hex");
}

function issue(severity: DatasetRunIssue["severity"], code: string, message: string, evidenceRefs: string[] = [], terms?: string[]): DatasetRunIssue {
  return terms?.length ? { severity, code, message, evidenceRefs, terms } : { severity, code, message, evidenceRefs };
}

function uniqueStrings(values: string[]): string[] {
  return Array.from(new Set(values));
}

function unwrapSpec(raw: unknown): AnalysisSpecV2 {
  return migrateToAnalysisSpecV2(raw).spec;
}

async function readDatasetManifest(datasetDir: string): Promise<DatasetManifest> {
  const resolved = path.resolve(datasetDir);
  const raw = JSON.parse(await readFile(path.join(resolved, "dataset-manifest.json"), "utf-8")) as Record<string, unknown>;
  const sourceRecord = raw.source && typeof raw.source === "object" ? raw.source as Record<string, unknown> : {};
  const accessRecord = raw.access && typeof raw.access === "object" ? raw.access as Record<string, unknown> : {};
  const storageRecord = raw.storage && typeof raw.storage === "object" ? raw.storage as Record<string, unknown> : {};
  const rawTables = Array.isArray(raw.tables) ? raw.tables : [];
  const tables = rawTables
    .map((entry, index) => {
      const table = entry && typeof entry === "object" ? entry as Record<string, unknown> : {};
      const sourcePath = String(table.sourcePath ?? table.path ?? "");
      const fallbackId = sourcePath
        ? path.basename(sourcePath).replace(/\.(csv|json|parquet|duckdb)$/i, "")
        : `table_${index + 1}`;
      const tableId = String(table.tableId ?? table.id ?? table.name ?? fallbackId);
      const format = String(table.format ?? (path.extname(sourcePath).replace(".", "") || "unknown")) as DatasetManifest["tables"][number]["format"];
      const bytes = Number(table.bytes ?? table.sizeBytes ?? table.size ?? 0);
      return {
        tableId,
        sourcePath,
        format,
        bytes: Number.isFinite(bytes) ? bytes : 0,
        rowCount: typeof table.rowCount === "number" ? table.rowCount : null,
        columnCount: typeof table.columnCount === "number" ? table.columnCount : null,
        profileStatus: (table.profileStatus === "profiled" || table.profileStatus === "failed" || table.profileStatus === "metadata_only" ? table.profileStatus : "metadata_only") as DatasetManifest["tables"][number]["profileStatus"],
      };
    })
    .filter(table => table.tableId && table.sourcePath);
  const supportedFormats = uniqueStrings(tables.map(table => table.format).filter(format => format !== "unknown")) as DatasetManifest["storage"]["supportedFormats"];
  return {
    schemaVersion: 1,
    datasetId: String(raw.datasetId ?? raw.id ?? path.basename(resolved)),
    title: String(raw.title ?? raw.datasetId ?? raw.id ?? path.basename(resolved)),
    description: String(raw.description ?? "Manifest-backed dataset."),
    domain: (raw.domain === "public-health-survey" || raw.domain === "ehr" || raw.domain === "registry" || raw.domain === "claims" || raw.domain === "user-upload" || raw.domain === "synthetic" ? raw.domain : "unknown") as DatasetManifest["domain"],
    generatedAtIso: String(raw.generatedAtIso ?? raw.registeredAtIso ?? nowIso()),
    source: {
      kind: (sourceRecord.kind === "local-file" || sourceRecord.kind === "local-directory" || sourceRecord.kind === "gcs-prefix" || sourceRecord.kind === "manifest" ? sourceRecord.kind : "manifest") as DatasetManifest["source"]["kind"],
      uri: String(sourceRecord.uri ?? raw.sourceUri ?? resolved),
      manifestPath: String(sourceRecord.manifestPath ?? path.join(resolved, "dataset-manifest.json")),
    },
    storage: {
      totalBytes: typeof storageRecord.totalBytes === "number" ? storageRecord.totalBytes : tables.reduce((sum, table) => sum + table.bytes, 0),
      tableCount: typeof storageRecord.tableCount === "number" ? storageRecord.tableCount : tables.length,
      profiledTableCount: typeof storageRecord.profiledTableCount === "number" ? storageRecord.profiledTableCount : tables.filter(table => table.profileStatus === "profiled").length,
      rowCountTotalKnown: typeof storageRecord.rowCountTotalKnown === "number" ? storageRecord.rowCountTotalKnown : null,
      supportedFormats: supportedFormats.length ? supportedFormats : ["unknown"],
    },
    access: {
      local: typeof accessRecord.local === "boolean" ? accessRecord.local : tables.some(table => !table.sourcePath.startsWith("gs://")),
      cloud: typeof accessRecord.cloud === "boolean" ? accessRecord.cloud : tables.some(table => table.sourcePath.startsWith("gs://")),
      piiPhiRisk: (accessRecord.piiPhiRisk === "low" || accessRecord.piiPhiRisk === "moderate" || accessRecord.piiPhiRisk === "high" ? accessRecord.piiPhiRisk : "unknown") as DatasetManifest["access"]["piiPhiRisk"],
      license: typeof accessRecord.license === "string" ? accessRecord.license : null,
      restrictions: Array.isArray(accessRecord.restrictions) ? accessRecord.restrictions.map(String) : [],
    },
    standardLayout: raw.standardLayout && typeof raw.standardLayout === "object" ? raw.standardLayout as DatasetManifest["standardLayout"] : {
      root: resolved,
      manifest: path.join(resolved, "dataset-manifest.json"),
      variableRegistry: path.join(resolved, "variable-registry.json"),
      relationshipGraph: path.join(resolved, "relationship-graph.json"),
      profile: path.join(resolved, "data-profile.json"),
      watchouts: path.join(resolved, "watchouts.json"),
      questions: path.join(resolved, "question-seeds.json"),
      summary: path.join(resolved, "dataset-summary.md"),
      context: path.join(resolved, "DATASET_CONTEXT.md"),
    },
    tables,
    hash: typeof raw.hash === "string" ? raw.hash : stableHash({ datasetDir: resolved, tables }),
  };
}

function inferStudyRequiredTables(study: Record<string, unknown>, dataset: DatasetManifest, hasDiagnosisPhenotype: boolean): string[] {
  if (Array.isArray(study.tables) && study.tables.length) return uniqueStrings(study.tables.map(String));
  const tableIds = dataset.tables.map(table => table.tableId);
  const findTable = (patterns: RegExp[]): string | null => tableIds.find(tableId => patterns.some(pattern => pattern.test(tableId))) ?? null;
  const requested: string[] = [];
  if (hasDiagnosisPhenotype) {
    const diagnoses = findTable([/diagnoses[-_]?icd/i, /diagnos/i]);
    const dictionary = findTable([/d[-_]?icd[-_]?diagnoses/i, /dictionary/i]);
    if (diagnoses) requested.push(diagnoses);
    if (dictionary) requested.push(dictionary);
  }
  const baseFromStudy = typeof study.primaryTable === "string" && tableIds.includes(study.primaryTable) ? study.primaryTable : null;
  const base = baseFromStudy ?? findTable([/icustay[-_]?detail/i, /stay[-_]?detail/i, /admission/i, /base/i]) ?? tableIds[0];
  if (base) requested.push(base);
  return uniqueStrings(requested.length ? requested : tableIds.slice(0, 1));
}

export async function researchDatasetSpecCommand(opts: { studyPath: string; datasetDir: string; outPath?: string }): Promise<DatasetSpecFromStudyResult> {
  const studyPath = path.resolve(opts.studyPath);
  const datasetDir = path.resolve(opts.datasetDir);
  const raw = await readJsonFile(studyPath);
  const source = raw && typeof raw === "object" ? raw as Record<string, unknown> : {};
  const study = source.study && typeof source.study === "object" ? source.study as Record<string, unknown> : source;
  const dataset = await readDatasetManifest(datasetDir);
  const title = String(study.title ?? study.id ?? "Dataset cohort outcome study");
  const question = String(study.question ?? title);
  const studyId = String(study.id ?? (title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "dataset-study"));
  const icdFamilies = icdFamilySchema.array().parse(Array.isArray(source.icdFamilies) ? source.icdFamilies : []);
  const requiredTables = inferStudyRequiredTables(study, dataset, icdFamilies.length > 0);
  const covariates = [
    "admission_age",
    "male",
    "apsiii",
    "oasis",
    "sofa",
    "charlson_comorbidity_index",
    "hemoglobin_min",
    "wbc_max",
    "creatinine_max",
    "bun_max",
    "glucose_max",
    "sbp_min",
    "heart_rate_max",
    "spo2_min",
    "gcs",
    "urineoutput",
    "aki_stage",
  ];
  const specWithoutHash = {
    schemaVersion: 2,
    specId: `spec_${studyId}`,
    title,
    researchQuestion: question,
    dataset: dataset.domain === "ehr" || dataset.datasetId.toLowerCase().includes("mimic") ? "mimic" : "user-table",
    archetype: "ehr-diagnosis-cohort-outcome",
    estimand: {
      type: "associational",
      targetQuantity: "Association between diagnosis-code cohort membership, illness severity, and ICU/hospital outcomes",
      populationLevel: false,
      causalClaimsAllowed: false,
    },
    population: {
      description: [String(study.population ?? "Hospitalizations or ICU stays matching the declared dataset cohort definition.")],
      inclusionCriteria: ["Rows linked through the declared cohort base table.", "Complete-case rows for each fitted model."],
      exclusionCriteria: ["Rows missing required outcome or model variables for a given model."],
      filters: [],
    },
    variables: {
      outcome: ["hospital_expire_flag", "los_icu"],
      exposure: [studyId],
      covariates,
      stratifiers: [],
      filters: [],
      derived: [{ name: "male", expression: "gender == 'M'", sourceVariables: ["gender"] }],
    },
    surveyDesign: {
      required: false,
      weightVariable: null,
      strataVariable: null,
      psuVariable: null,
      replicateWeightPattern: null,
      weightDomain: "none",
      weightRationale: "MIMIC-style EHR data are not a complex survey sample.",
      eligibilityNote: "Not applicable.",
      multiCycleRule: "Not applicable.",
    },
    missingness: {
      policy: "complete_case",
      highMissingnessThreshold: 0.35,
      requiredDiagnostics: ["complete-case n", "missingness by modeled variable"],
    },
    model: {
      family: "logistic",
      link: "logit for hospital mortality; log-linear robust OLS for ICU length of stay when available",
      binaryThreshold: null,
      formula: "hospital_expire_flag + log1p(los_icu) ~ available covariates",
      diagnostics: ["events-per-predictor", "sparse outcome", "non-finite effects", "complete-case n"],
    },
    sensitivityAnalyses: [
      { id: "broad-vs-narrow-icd", description: "Compare broad and narrow ICD family definitions when alternate families are available.", required: true },
      { id: "primary-diagnosis-only", description: "Repeat cohort construction using primary diagnosis only when diagnosis priority is available.", required: false },
    ],
    backendRequirements: {
      preferred: "python-statsmodels",
      allowed: ["python-statsmodels"],
      minimumCapabilities: ["diagnosis-code matching", "complete-case logistic model", "robust log-LOS model", "typed methods QA"],
    },
    artifactExpectations: [
      { path: "dataset-run.json", role: "runner result", required: true, validator: "dataset-run-schema" },
      { path: "analysis-results.json", role: "aggregate scientific result", required: true, validator: "json" },
      { path: "paper.md", role: "reader-facing local-review report", required: true, validator: "reader-facing-paper" },
      { path: "qa.json", role: "typed quality review", required: true, validator: "dataset-run-qa" },
      { path: "run-manifest.json", role: "input/output lineage", required: true, validator: "hash-manifest" },
      { path: "cost-receipt.json", role: "cost boundary", required: true, validator: "cost-under-policy" },
    ],
    datasetAccess: {
      requiredTables,
      joinKeys: ["subject_id", "hadm_id", "stay_id"],
      maxReadBytes: null,
      piiPhiRisk: dataset.access.piiPhiRisk,
      rowLevelCachePolicy: "temporary_delete_after_run",
    },
    phenotype: {
      kind: icdFamilies.length ? "diagnosis-code-cohort" : "none",
      label: title,
      diagnosisFamilies: icdFamilies,
      tables: {
        diagnoses: requiredTables.find(table => table.includes("diagnoses-icd")) ?? requiredTables.find(table => table.includes("diagnos")) ?? "hosp-diagnoses-icd",
        dictionary: requiredTables.find(table => table.includes("d-icd")) ?? requiredTables.find(table => table.includes("dictionary")) ?? "hosp-d-icd-diagnoses",
        baseCohort: requiredTables.find(table => table.includes("icustay-detail")) ?? requiredTables[0],
      },
      sensitivityAnalyses: [
        { id: "code-family-review", description: "Review matched ICD titles against the intended clinical phenotype.", change: "manual coding review of matched-icd-codes.csv", required: true },
      ],
      codingReviewStatus: icdFamilies.every(family => family.verifiedOnline) ? "verified_online" : "needs_clinical_review",
    },
    claimPolicy: {
      allowedInference: "exploratory_association",
      pValueLanguage: "standard",
      causalLanguage: "forbidden",
      actionability: "clinical_review_required",
    },
    failurePolicy: {
      missingVariable: "warn",
      invalidWeight: "block",
      highMissingness: "warn",
      sparseCells: "warn",
      hashMismatch: "block",
      rerunInstability: "warn",
      methodologicalUncertainty: "stop_for_review",
      unsupportedBackend: "block",
    },
    execution: {
      maxRuntimeSeconds: 900,
      maxRows: 1_000_000,
      maxOutputBytes: 50 * 1024 * 1024,
      maxUsd: 1,
      allowedWriteRoots: [path.resolve(opts.outPath ? path.dirname(opts.outPath) : datasetDir)],
      deniedActions: ["domain-repo-write", "row-level-export", "unbounded-cloud-query"],
    },
  } satisfies Omit<AnalysisSpecV2, "specHash">;
  const spec = analysisSpecV2Schema.parse({ ...specWithoutHash, specHash: stableHash(specWithoutHash) });
  const validation = migrateToAnalysisSpecV2(spec).validation;
  const outPath = opts.outPath ? path.resolve(opts.outPath) : null;
  if (outPath) {
    await mkdir(path.dirname(outPath), { recursive: true });
    await writeFile(outPath, `${JSON.stringify({ schemaVersion: 1, analysisSpecV2: spec }, null, 2)}\n`);
  }
  return { schemaVersion: 1, spec, sourceStudyPath: studyPath, datasetDir, outPath, validation };
}

export async function researchDatasetRunCommand(rawOpts: Omit<DatasetRunRequest, "schemaVersion">): Promise<DatasetRunResult> {
  const request = datasetRunRequestSchema.parse({ schemaVersion: 1, ...rawOpts });
  const outDir = path.resolve(request.outDir);
  const datasetDir = path.resolve(request.datasetDir);
  await mkdir(outDir, { recursive: true });
  const rawSpec = await readJsonFile(request.analysisSpecPath);
  const spec = unwrapSpec(rawSpec);
  const manifest = await readDatasetManifest(datasetDir);
  const inspection = await researchDatasetInspectCommand({ datasetDir });
  const preflightIssues = validateDatasetRunPreflight(spec, manifest, request, inspection);
  const configPath = path.join(outDir, "dataset-run-config.json");
  const scriptDir = await mkdtemp(path.join(os.tmpdir(), "agenteer-dataset-run-"));
  const scriptPath = path.join(scriptDir, "dataset_run_bridge.py");
  const config = {
    schemaVersion: 1,
    request: { ...request, analysisSpecPath: path.resolve(request.analysisSpecPath), datasetDir, outDir },
    spec,
    manifest,
    preflightIssues,
  };
  await writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`);
  await writeFile(scriptPath, datasetRunBridgeSource());
  if (preflightIssues.some(item => item.severity === "blocker")) {
    const failed = await writeFailedDatasetRun(outDir, spec, datasetDir, request, preflightIssues, configPath);
    await rm(scriptDir, { recursive: true, force: true });
    return failed;
  }
  const python = request.python ?? process.env.AGENTEER_RESEARCH_PYTHON ?? path.resolve(".research-runtime/python/bin/python");
  try {
    const { stdout, stderr } = await execFileAsync(python, [scriptPath, configPath], {
      cwd: process.cwd(),
      env: { ...process.env, PYTHONWARNINGS: "ignore" },
      maxBuffer: 1024 * 1024 * 64,
    });
    const parsed = JSON.parse(stdout) as DatasetRunResult;
    const withDatasetRunArtifact: DatasetRunResult = {
      ...parsed,
      typedIssues: stderr.trim() ? [...parsed.typedIssues, issue("note", "RUNNER_STDERR", stderr.trim(), [])] : parsed.typedIssues,
      artifacts: [{ kind: "dataset-run", path: path.join(outDir, "dataset-run.json") }, { kind: "config", path: configPath }, ...parsed.artifacts],
    };
    await writeFile(path.join(outDir, "dataset-run.json"), `${JSON.stringify(withDatasetRunArtifact, null, 2)}\n`);
    const result = await attachDatasetRunHashes(withDatasetRunArtifact);
    await writeFile(path.join(outDir, "dataset-run.json"), `${JSON.stringify(result, null, 2)}\n`);
    await rm(scriptDir, { recursive: true, force: true });
    return result;
  } catch (error) {
    await rm(scriptDir, { recursive: true, force: true });
    const stderr = typeof (error as { stderr?: unknown }).stderr === "string" ? (error as { stderr: string }).stderr.trim() : "";
    const message = stderr || (error instanceof Error ? error.message : String(error));
    return writeFailedDatasetRun(outDir, spec, datasetDir, request, [issue("blocker", "RUNNER_FAILED", message, [configPath])], configPath);
  }
}

function validateDatasetRunPreflight(spec: AnalysisSpecV2, manifest: DatasetManifest, request: DatasetRunRequest, inspection: Awaited<ReturnType<typeof researchDatasetInspectCommand>>): DatasetRunIssue[] {
  const issues: DatasetRunIssue[] = [];
  if (!spec.datasetAccess?.requiredTables?.length) {
    issues.push(issue("blocker", "SPEC_MISSING_REQUIRED_TABLES", "AnalysisSpec V2 must declare datasetAccess.requiredTables before dataset-run.", [request.analysisSpecPath]));
  }
  if (spec.dataset !== "mimic" && manifest.domain === "ehr") {
    issues.push(issue("warning", "SPEC_DATASET_ADAPTER_MISMATCH", `Spec dataset is ${spec.dataset}, but manifest domain is EHR.`, [request.analysisSpecPath, path.join(request.datasetDir, "dataset-manifest.json")]));
  }
  const byId = new Map(manifest.tables.map(table => [table.tableId, table]));
  const missing = (spec.datasetAccess?.requiredTables ?? []).filter(table => !byId.has(table));
  if (missing.length) {
    issues.push(issue("blocker", "REQUIRED_TABLE_MISSING", `Required table(s) are absent from dataset manifest: ${missing.join(", ")}.`, [path.join(request.datasetDir, "dataset-manifest.json")]));
  }
  const readBytes = (spec.datasetAccess?.requiredTables ?? []).reduce((sum, table) => sum + (byId.get(table)?.bytes ?? 0), 0);
  const estimatedUsd = readBytes / 1024 ** 3 * request.usdPerGbRead;
  const maxReadBytes = spec.datasetAccess?.maxReadBytes ?? spec.execution.maxRows * 1024;
  if (maxReadBytes && readBytes > maxReadBytes) {
    issues.push(issue("blocker", "READ_BYTES_EXCEED_SPEC_POLICY", `Planned read ${readBytes} bytes exceeds spec policy ${maxReadBytes} bytes.`, [request.analysisSpecPath]));
  }
  if (estimatedUsd > Math.min(request.maxUsd, spec.execution.maxUsd)) {
    issues.push(issue("blocker", "COST_CEILING_EXCEEDED", `Planned read estimate $${estimatedUsd.toFixed(4)} exceeds the configured ceiling.`, [request.analysisSpecPath]));
  }
  const usesGcs = (spec.datasetAccess?.requiredTables ?? []).some(table => (byId.get(table)?.sourcePath ?? "").startsWith("gs://"));
  if (usesGcs && !request.allowGcs) {
    issues.push(issue("blocker", "GCS_READ_REQUIRES_EXPLICIT_ALLOW", "At least one required table is on GCS; pass --allow-gcs after confirming cost/read policy.", [path.join(request.datasetDir, "dataset-manifest.json")]));
  }
  if (inspection.access.piiPhiRisk === "high" && spec.datasetAccess?.rowLevelCachePolicy !== "temporary_delete_after_run") {
    issues.push(issue("blocker", "ROW_LEVEL_CACHE_POLICY_UNSAFE", "High-risk clinical datasets require temporary row-level cache deletion after run.", [request.analysisSpecPath]));
  }
  if (spec.phenotype?.kind === "diagnosis-code-cohort" && spec.phenotype.codingReviewStatus !== "verified_online") {
    issues.push(issue("warning", "PHENOTYPE_CODING_REVIEW_NEEDED", "Diagnosis-code cohort is not marked verified_online; promote only after coding review.", [request.analysisSpecPath]));
  }
  return issues;
}

async function writeFailedDatasetRun(outDir: string, spec: AnalysisSpecV2, datasetDir: string, request: DatasetRunRequest, issues: DatasetRunIssue[], configPath: string): Promise<DatasetRunResult> {
  await mkdir(outDir, { recursive: true });
  const result: DatasetRunResult = await attachDatasetRunHashes({
    schemaVersion: 1,
    runId: `datasetrun_${Date.now()}`,
    status: "failed",
    readiness: "blocked",
    analysisSpecPath: path.resolve(request.analysisSpecPath),
    specHash: spec.specHash,
    datasetDir,
    datasetId: spec.dataset,
    studyTitle: spec.title,
    cohortSummary: { matchedDiagnosisCodes: 0, matchedDiagnosisRows: 0, matchedAdmissions: 0, firstCohortRows: 0, uniquePatients: null },
    modelStatus: { mortality: "not_requested", los: "not_requested" },
    qaStatus: "fail",
    typedIssues: issues,
    cost: { estimatedUsd: 0, readBytes: 0, maxUsd: request.maxUsd, usdPerGbRead: request.usdPerGbRead },
    artifacts: [{ kind: "config", path: configPath }],
    outDir,
    nextAction: "Fix blocking dataset-run preflight issues, then rerun.",
  });
  await writeDatasetRunSidecars(result, { checks: [] });
  return result;
}

async function attachDatasetRunHashes(result: DatasetRunResult): Promise<DatasetRunResult> {
  const artifacts: DatasetRunArtifact[] = [];
  for (const artifact of result.artifacts) {
    try {
      const raw = await readFile(path.resolve(artifact.path));
      artifacts.push({ ...artifact, sha256: hashFileContents(raw) });
    } catch {
      artifacts.push(artifact);
    }
  }
  return { ...result, artifacts };
}

async function writeDatasetRunSidecars(result: DatasetRunResult, qa: unknown): Promise<void> {
  await mkdir(result.outDir, { recursive: true });
  await writeFile(path.join(result.outDir, "dataset-run.json"), `${JSON.stringify(result, null, 2)}\n`);
  await writeFile(path.join(result.outDir, "qa.json"), `${JSON.stringify(qa, null, 2)}\n`);
}

export async function researchDatasetRunIndexCommand(opts: { runRoot: string; outPath?: string; reportPath?: string }): Promise<DatasetRunIndex> {
  const runRoot = path.resolve(opts.runRoot);
  const entries = await readdir(runRoot, { withFileTypes: true }).catch(() => []);
  const runs: DatasetRunResult[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const runFile = path.join(runRoot, entry.name, "dataset-run.json");
    try {
      runs.push(JSON.parse(await readFile(runFile, "utf-8")) as DatasetRunResult);
    } catch {
      // Ignore non-run directories; the index reports only valid dataset-run packets.
    }
  }
  runs.sort((a, b) => a.outDir.localeCompare(b.outDir));
  const qaCounts = countBy(runs.map(run => run.qaStatus));
  const readinessCounts = countBy(runs.map(run => run.readiness));
  const index: DatasetRunIndex = {
    schemaVersion: 1,
    runRoot,
    generatedAtIso: nowIso(),
    totalRuns: runs.length,
    qaCounts,
    readinessCounts,
    estimatedUsd: runs.reduce((sum, run) => sum + run.cost.estimatedUsd, 0),
    allCachesRemoved: runs.every(run => !run.artifacts.some(artifact => artifact.path.includes("_tmp"))),
    runs,
    nextAction: runs.some(run => run.readiness === "blocked")
      ? "Fix blocked dataset-run packets before promotion."
      : runs.some(run => run.readiness === "needs_methods_review")
        ? "Review methods-only packets before using them as scientific evidence."
        : "Promote ready packets into benchmark or lifecycle evaluation.",
    outPath: opts.outPath ? path.resolve(opts.outPath) : null,
    reportPath: opts.reportPath ? path.resolve(opts.reportPath) : null,
  };
  if (index.outPath) {
    await mkdir(path.dirname(index.outPath), { recursive: true });
    await writeFile(index.outPath, `${JSON.stringify(index, null, 2)}\n`);
  }
  if (index.reportPath) {
    await mkdir(path.dirname(index.reportPath), { recursive: true });
    await writeFile(index.reportPath, renderDatasetRunIndex(index));
  }
  return index;
}

function countBy(values: string[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const value of values) out[value] = (out[value] ?? 0) + 1;
  return out;
}

export function renderDatasetSpec(result: DatasetSpecFromStudyResult): string {
  return [
    `research dataset spec: ${result.spec.specId}`,
    `  title: ${result.spec.title}`,
    `  dataset: ${result.spec.dataset}`,
    `  archetype: ${result.spec.archetype}`,
    `  required tables: ${result.spec.datasetAccess?.requiredTables.join(", ") || "(none)"}`,
    `  phenotype: ${result.spec.phenotype?.kind ?? "none"} status=${result.spec.phenotype?.codingReviewStatus ?? "n/a"}`,
    `  validation: ${result.validation.status}`,
    `  out: ${result.outPath ?? "(not written)"}`,
  ].join("\n");
}

export function renderDatasetSpecJson(result: DatasetSpecFromStudyResult): string {
  return `${JSON.stringify({ schemaVersion: 1, datasetSpec: result }, null, 2)}\n`;
}

export function renderDatasetRun(result: DatasetRunResult): string {
  return [
    `research dataset run: ${result.runId}`,
    `  status: ${result.status}`,
    `  readiness: ${result.readiness}`,
    `  study: ${result.studyTitle}`,
    `  cohort rows: ${result.cohortSummary.firstCohortRows}`,
    `  QA: ${result.qaStatus}; issues=${result.typedIssues.map(issue => issue.code).join(",") || "(none)"}`,
    `  models: mortality=${result.modelStatus.mortality}; los=${result.modelStatus.los}`,
    `  estimated cost: $${result.cost.estimatedUsd.toFixed(4)} of $${result.cost.maxUsd.toFixed(2)}`,
    `  out: ${result.outDir}`,
    `  next: ${result.nextAction}`,
  ].join("\n");
}

export function renderDatasetRunJson(result: DatasetRunResult): string {
  return `${JSON.stringify({ schemaVersion: 1, datasetRun: result }, null, 2)}\n`;
}

export function renderDatasetRunIndex(index: DatasetRunIndex): string {
  const lines = [
    "# Dataset Run Index",
    "",
    `Run root: \`${index.runRoot}\`.`,
    `Total runs: ${index.totalRuns}.`,
    `Estimated read cost: $${index.estimatedUsd.toFixed(4)}.`,
    `Readiness counts: ${Object.entries(index.readinessCounts).map(([key, value]) => `${key}=${value}`).join(", ") || "(none)"}.`,
    "",
    "| Run | Cohort rows | QA | Readiness | Issues |",
    "| --- | ---: | --- | --- | --- |",
  ];
  for (const run of index.runs) {
    lines.push(`| ${path.basename(run.outDir)} | ${run.cohortSummary.firstCohortRows} | ${run.qaStatus} | ${run.readiness} | ${run.typedIssues.map(issue => issue.code).join(", ") || "-"} |`);
  }
  lines.push("", `Next action: ${index.nextAction}`);
  return `${lines.join("\n")}\n`;
}

export function renderDatasetRunIndexJson(index: DatasetRunIndex): string {
  return `${JSON.stringify({ schemaVersion: 1, datasetRunIndex: index }, null, 2)}\n`;
}

function datasetRunBridgeSource(): string {
  return String.raw`#!/usr/bin/env python3
import json, math, os, re, shutil, subprocess, sys, tempfile
from datetime import datetime, timezone
from pathlib import Path

def now_iso():
    return datetime.now(timezone.utc).isoformat()

def norm_code(value):
    return re.sub(r"[^A-Z0-9]", "", str(value).upper())

def sanitize(value):
    if isinstance(value, float):
        return value if math.isfinite(value) else None
    if isinstance(value, dict):
        return {k: sanitize(v) for k, v in value.items()}
    if isinstance(value, list):
        return [sanitize(v) for v in value]
    return value

def read_frame(source):
    import pandas as pd
    p = str(source)
    if p.startswith("gs://"):
        tmp = Path(tempfile.mkdtemp(prefix="agenteer-gcs-table-"))
        try:
            listing = subprocess.run(["gcloud", "storage", "ls", "--json", "--recursive", p], text=True, capture_output=True, check=True)
            objects = [x["url"].split("#", 1)[0] for x in json.loads(listing.stdout) if x.get("type") == "cloud_object" and x.get("url", "").split("#", 1)[0].endswith((".parquet", ".csv", ".json"))]
            paths = []
            for obj in sorted(objects):
                local = tmp / obj.rsplit("/", 1)[-1]
                subprocess.run(["gcloud", "storage", "cp", obj, str(local)], text=True, capture_output=True, check=True)
                paths.append(local)
            return read_paths(paths)
        finally:
            shutil.rmtree(tmp, ignore_errors=True)
    path = Path(p)
    if path.is_dir():
        paths = sorted([x for x in path.rglob("*") if x.suffix.lower() in {".csv", ".json", ".parquet"}])
        return read_paths(paths)
    return read_paths([path])

def read_paths(paths):
    import pandas as pd
    if not paths:
        return pd.DataFrame()
    suffix = paths[0].suffix.lower()
    if suffix == ".csv":
        return pd.concat([pd.read_csv(p) for p in paths], ignore_index=True)
    if suffix == ".json":
        return pd.concat([pd.read_json(p) for p in paths], ignore_index=True)
    if suffix == ".parquet":
        return pd.concat([pd.read_parquet(p) for p in paths], ignore_index=True)
    raise RuntimeError(f"Unsupported table format: {paths[0]}")

def match_dictionary(dictionary, families):
    import pandas as pd
    if dictionary.empty or not families:
        return dictionary.iloc[0:0].copy()
    d = dictionary.copy()
    d["icd_code"] = d["icd_code"].astype(str)
    d["icd_version"] = d["icd_version"].astype(int)
    d["_norm"] = d["icd_code"].map(norm_code)
    d["_title"] = d["long_title"].astype(str).str.lower()
    mask_any = None
    for fam in families:
        version = 10 if fam["system"] == "icd10cm" else 9
        q = str(fam["query"])
        q_norm = norm_code(q)
        mask = d["icd_version"].eq(version)
        if re.fullmatch(r"[A-Za-z0-9.]+", q) and q_norm:
            mask = mask & d["_norm"].str.startswith(q_norm)
        else:
            for term in [t for t in re.split(r"\s+", q.lower()) if len(t) > 2]:
                mask = mask & d["_title"].str.contains(re.escape(term), na=False)
        expected = [str(t).lower() for t in fam.get("expectedTerms", [])]
        if expected:
            expected_mask = False
            for term in expected:
                expected_mask = expected_mask | d["_title"].str.contains(re.escape(term), na=False)
            mask = mask & expected_mask
        mask_any = mask if mask_any is None else (mask_any | mask)
    return d.loc[mask_any].drop(columns=["_norm", "_title"]).drop_duplicates()

def prepare_table(table_id, frame):
    import numpy as np
    if table_id.endswith("d-icd-diagnoses") or table_id.endswith("diagnoses-icd"):
        return frame
    keys = [k for k in ["subject_id", "hadm_id", "stay_id"] if k in frame.columns]
    if not keys or not frame.duplicated(keys).any():
        return frame.drop_duplicates()
    numeric = [c for c in frame.select_dtypes(include=[np.number]).columns if c not in keys]
    categorical = [c for c in frame.columns if c not in keys and c not in numeric]
    parts = []
    if numeric:
        parts.append(frame.groupby(keys, dropna=False)[numeric].max())
    if categorical:
        parts.append(frame.groupby(keys, dropna=False)[categorical].first())
    return pd.concat(parts, axis=1).reset_index() if parts else frame.drop_duplicates(keys)

def first_base(frame):
    f = frame.copy()
    if "icu_intime" in f.columns:
        f["icu_intime"] = pd.to_datetime(f["icu_intime"], errors="coerce")
        f = f.sort_values([c for c in ["hadm_id", "icu_intime", "stay_id"] if c in f.columns])
        return f.drop_duplicates("hadm_id", keep="first") if "hadm_id" in f.columns else f
    return f.drop_duplicates()

def merge_table(base, table_id, frame):
    frame = prepare_table(table_id, frame)
    keys = [k for k in ["subject_id", "hadm_id", "stay_id"] if k in base.columns and k in frame.columns]
    if not keys:
        return base
    keep = [c for c in frame.columns if c in keys or c not in base.columns]
    return base.merge(frame[keep], on=keys, how="left")

def standardize(df, predictors):
    scalers = {}
    for col in predictors:
        if col == "male":
            continue
        if df[col].nunique(dropna=True) <= 2:
            continue
        mean = float(df[col].mean())
        sd = float(df[col].std(ddof=1)) or 1.0
        if not math.isfinite(sd) or sd == 0:
            sd = 1.0
        df[col] = (df[col] - mean) / sd
        scalers[col] = {"mean": mean, "sd": sd}
    return df, scalers

def candidate_predictors(cohort, covariates):
    out = []
    for col in covariates:
        if col in cohort.columns and pd.to_numeric(cohort[col], errors="coerce").notna().sum() >= max(20, int(0.05 * len(cohort))):
            out.append(col)
    return out[:12]

def fit_logistic(cohort, outcome, predictors):
    import statsmodels.api as sm
    from sklearn.metrics import average_precision_score, roc_auc_score
    if outcome not in cohort.columns or not predictors:
        return {"status":"not_requested","reason":"missing outcome or predictors"}
    frame = cohort[[outcome] + predictors].replace([float("inf"), float("-inf")], float("nan")).copy()
    for col in frame.columns:
        frame[col] = pd.to_numeric(frame[col], errors="coerce")
    frame = frame.dropna()
    if len(frame) < 50:
        return {"status":"not_fit","reason":"too few complete cases","n":int(len(frame)),"predictors":predictors}
    y = frame[outcome].astype(int)
    if y.nunique() != 2 or int(y.sum()) < 5 or int(len(y)-y.sum()) < 5:
        return {"status":"not_fit","reason":"outcome lacks enough events/non-events","n":int(len(frame)), "events": int(y.sum()), "predictors": predictors}
    frame, scalers = standardize(frame, predictors)
    x = sm.add_constant(frame[predictors], has_constant="add")
    try:
        result = sm.Logit(y, x).fit(disp=False, maxiter=200)
        conf = result.conf_int()
        rows = []
        for term in result.params.index:
            if term == "const":
                continue
            rows.append({"term":term,"oddsRatio":float(math.exp(result.params[term])),"ci95":[float(math.exp(conf.loc[term,0])),float(math.exp(conf.loc[term,1]))],"pValue":float(result.pvalues[term])})
        pred = result.predict(x)
        return {"status":"fit","n":int(len(frame)),"events":int(y.sum()),"predictors":predictors,"scalers":scalers,"metrics":{"auroc":float(roc_auc_score(y,pred)),"averagePrecision":float(average_precision_score(y,pred))},"coefficients":rows}
    except Exception as exc:
        return {"status":"not_fit","reason":str(exc),"n":int(len(frame)),"events":int(y.sum()),"predictors":predictors}

def pct_from_log(value):
    try:
        v = float(value)
    except Exception:
        return None
    if not math.isfinite(v) or v > 50 or v < -50:
        return None
    out = (math.exp(v) - 1) * 100
    return out if math.isfinite(out) else None

def fit_los(cohort, predictors):
    import statsmodels.api as sm
    if "los_icu" not in cohort.columns or not predictors:
        return {"status":"not_requested","reason":"missing los_icu or predictors"}
    frame = cohort[["los_icu"] + predictors].replace([float("inf"), float("-inf")], float("nan")).copy()
    for col in frame.columns:
        frame[col] = pd.to_numeric(frame[col], errors="coerce")
    frame = frame.dropna()
    frame = frame[frame["los_icu"] > 0]
    if len(frame) < 50:
        return {"status":"not_fit","reason":"too few complete cases","n":int(len(frame))}
    frame, scalers = standardize(frame, predictors)
    y = np.log1p(frame["los_icu"])
    x = sm.add_constant(frame[predictors], has_constant="add")
    try:
        result = sm.OLS(y, x).fit(cov_type="HC3")
        conf = result.conf_int()
        rows = []
        for term in result.params.index:
            if term == "const":
                continue
            rows.append({"term":term,"percentChangeInLos":pct_from_log(result.params[term]),"ci95PercentChange":[pct_from_log(conf.loc[term,0]),pct_from_log(conf.loc[term,1])],"pValue":float(result.pvalues[term])})
        return {"status":"fit","n":int(len(frame)),"predictors":predictors,"scalers":scalers,"rSquared":float(result.rsquared),"coefficients":rows}
    except Exception as exc:
        return {"status":"not_fit","reason":str(exc),"n":int(len(frame))}

def numeric_summary(series):
    clean = pd.to_numeric(series, errors="coerce").dropna()
    if clean.empty:
        return {"n":0}
    return {"n":int(len(clean)),"missing":int(len(series)-len(clean)),"median":float(clean.median()),"iqr":[float(clean.quantile(.25)),float(clean.quantile(.75))],"mean":float(clean.mean())}

def binary_summary(series):
    clean = pd.to_numeric(series, errors="coerce").dropna().astype(int)
    n = int(len(clean))
    pos = int(clean.sum()) if n else 0
    return {"n":n,"positive":pos,"proportion":pos/n if n else None}

def methods_issues(cohort_summary, models):
    issues = []
    n = int(cohort_summary.get("firstCohortRows") or 0)
    if n < 100:
        issues.append({"severity":"warning","code":"SMALL_COHORT_REVIEW","message":"Fewer than 100 cohort rows were available; estimates may be unstable.","evidenceRefs":["analysis-results.json"]})
    mortality = models.get("mortality", {})
    if mortality.get("status") == "fit":
        events = int(mortality.get("events") or 0)
        predictors = len(mortality.get("predictors") or [])
        non_events = int(mortality.get("n") or 0) - events
        if events < 20 or non_events < 20:
            issues.append({"severity":"warning","code":"SPARSE_BINARY_OUTCOME_REVIEW","message":"The binary model has fewer than 20 events or non-events.","evidenceRefs":["analysis-results.json"]})
        if predictors and events / predictors < 10:
            issues.append({"severity":"warning","code":"LOW_EVENTS_PER_PREDICTOR","message":f"Binary model has {events} events across {predictors} predictors.","evidenceRefs":["analysis-results.json"]})
    elif mortality.get("status") == "not_fit" and mortality.get("events") is not None:
        events = int(mortality.get("events") or 0)
        predictors = len(mortality.get("predictors") or [])
        n = int(mortality.get("n") or 0)
        non_events = n - events
        if events < 20 or non_events < 20:
            issues.append({"severity":"warning","code":"SPARSE_BINARY_OUTCOME_REVIEW","message":"The binary model has fewer than 20 events or non-events.","evidenceRefs":["analysis-results.json"]})
        if predictors and events / predictors < 10:
            issues.append({"severity":"warning","code":"LOW_EVENTS_PER_PREDICTOR","message":f"Binary model has {events} events across {predictors} predictors.","evidenceRefs":["analysis-results.json"]})
    los = models.get("los", {})
    if los.get("status") == "fit":
        bad = [r.get("term") for r in los.get("coefficients", []) if r.get("percentChangeInLos") is None or any(x is None for x in r.get("ci95PercentChange", []))]
        if bad:
            issues.append({"severity":"warning","code":"NONFINITE_LOS_EFFECT_REVIEW","message":"At least one LOS effect estimate was too unstable to render.","evidenceRefs":["analysis-results.json"],"terms":bad})
    return issues

def write_paper(out_dir, spec, summary, models, qa, cost):
    lines = [
        f"# {spec['title']}",
        "",
        "## Plain-Language Summary",
        "",
        f"This analysis used a local dataset manifest to study: {spec['researchQuestion']} The findings are observational associations in the analyzed data, not evidence of cause and effect.",
        "",
        "## Cohort",
        "",
        f"- Matched diagnosis codes: {summary['matchedDiagnosisCodes']}.",
        f"- Matched diagnosis rows: {summary['matchedDiagnosisRows']}.",
        f"- Matched admissions: {summary['matchedAdmissions']}.",
        f"- Cohort rows: {summary['firstCohortRows']}.",
        f"- Unique patients: {summary.get('uniquePatients')}.",
        "",
        "## Methods",
        "",
        "The cohort was built from the declared AnalysisSpec, dataset manifest, and diagnosis-code phenotype. Models used complete-case rows for available covariates. Sparse outcome and unstable-effect checks were applied before local-review promotion.",
        "",
        "## Results",
        "",
    ]
    mort = models.get("mortality", {})
    if mort.get("status") == "fit":
        lines.append(f"Mortality model: complete-case N={mort['n']}; deaths={mort['events']}; AUROC={mort['metrics']['auroc']:.3f}.")
        for row in sorted(mort.get("coefficients", []), key=lambda r: r.get("pValue", 1))[:5]:
            lines.append(f"- {row['term']}: adjusted OR {row['oddsRatio']:.2f} ({row['ci95'][0]:.2f}, {row['ci95'][1]:.2f}), p={row['pValue']:.3g}.")
    else:
        lines.append(f"Mortality model was not fit: {mort.get('reason', 'not requested')}.")
    los = models.get("los", {})
    if los.get("status") == "fit":
        lines.append(f"ICU length-of-stay model: complete-case N={los['n']}; R-squared={los['rSquared']:.3f}.")
        for row in sorted(los.get("coefficients", []), key=lambda r: r.get("pValue", 1))[:5]:
            if row.get("percentChangeInLos") is None:
                lines.append(f"- {row['term']}: effect estimate was too unstable to render as a finite percent change, p={row['pValue']:.3g}.")
            else:
                lo, hi = row["ci95PercentChange"]
                lines.append(f"- {row['term']}: {row['percentChangeInLos']:.1f}% change ({lo:.1f}%, {hi:.1f}%), p={row['pValue']:.3g}.")
    else:
        lines.append(f"ICU length-of-stay model was not fit: {los.get('reason', 'not requested')}.")
    lines.extend(["", "## Quality Review", "", f"- QA status: {qa['status']}."])
    for item in qa.get("typedIssues", []):
        lines.append(f"- {item['code']}: {item['message']}")
    lines.extend(["", "## Cost And Data Controls", "", "- Estimated read cost: $" + f"{cost['estimatedUsd']:.4f}.", "- Temporary row-level cache was removed after execution.", "", "## Limitations", "", "- Diagnosis-code phenotypes require clinical/coding review.", "- Complete-case models can be biased when missingness is informative.", "- Results are local-review artifacts, not clinical guidance."])
    (Path(out_dir) / "paper.md").write_text("\n".join(lines) + "\n")

def main():
    global pd, np
    import pandas as pd
    import numpy as np
    config = json.loads(Path(sys.argv[1]).read_text())
    spec = config["spec"]
    manifest = config["manifest"]
    request = config["request"]
    out_dir = Path(request["outDir"])
    out_dir.mkdir(parents=True, exist_ok=True)
    table_by_id = {t["tableId"]: t for t in manifest["tables"]}
    required = spec.get("datasetAccess", {}).get("requiredTables", [])
    read_bytes = sum(int(table_by_id[t].get("bytes") or 0) for t in required if t in table_by_id)
    cost = {"estimatedUsd": read_bytes / (1024**3) * float(request["usdPerGbRead"]), "readBytes": read_bytes, "maxUsd": request["maxUsd"], "usdPerGbRead": request["usdPerGbRead"]}
    tables = {tid: read_frame(table_by_id[tid]["sourcePath"]) for tid in required}
    phenotype = spec.get("phenotype") or {}
    matched = pd.DataFrame()
    summary = {"matchedDiagnosisCodes":0,"matchedDiagnosisRows":0,"matchedAdmissions":0,"firstCohortRows":0,"uniquePatients":None}
    if phenotype.get("kind") == "diagnosis-code-cohort":
        diag_id = phenotype.get("tables", {}).get("diagnoses")
        dict_id = phenotype.get("tables", {}).get("dictionary")
        base_id = phenotype.get("tables", {}).get("baseCohort")
        dx = tables[diag_id].copy()
        dictionary = tables[dict_id].copy()
        matched = match_dictionary(dictionary, phenotype.get("diagnosisFamilies", []))
        cohort_dx = dx.merge(matched[["icd_code","icd_version","long_title"]], on=["icd_code","icd_version"], how="inner") if not matched.empty else dx.iloc[0:0].copy()
        admissions = cohort_dx[[c for c in ["subject_id","hadm_id"] if c in cohort_dx.columns]].drop_duplicates()
        base = first_base(tables[base_id])
        cohort = base.merge(admissions, on=[c for c in ["subject_id","hadm_id"] if c in base.columns and c in admissions.columns], how="inner") if not admissions.empty else base.iloc[0:0].copy()
        for tid, frame in tables.items():
            if tid in {diag_id, dict_id, base_id}:
                continue
            cohort = merge_table(cohort, tid, frame)
        summary = {"matchedDiagnosisCodes":int(len(matched)),"matchedDiagnosisRows":int(len(cohort_dx)),"matchedAdmissions":int(len(admissions)),"firstCohortRows":int(len(cohort)),"uniquePatients":int(cohort["subject_id"].nunique()) if "subject_id" in cohort.columns else None}
    else:
        base_id = required[0]
        cohort = tables[base_id].copy()
        summary["firstCohortRows"] = int(len(cohort))
        summary["uniquePatients"] = int(cohort["subject_id"].nunique()) if "subject_id" in cohort.columns else None
    if "gender" in cohort.columns and "male" not in cohort.columns:
        cohort["male"] = (cohort["gender"].astype(str).str.upper() == "M").astype(int)
    covariates = spec.get("variables", {}).get("covariates", [])
    predictors = candidate_predictors(cohort, covariates)
    models = {
        "mortality": fit_logistic(cohort, "hospital_expire_flag", predictors) if "hospital_expire_flag" in spec.get("variables", {}).get("outcome", []) else {"status":"not_requested"},
        "los": fit_los(cohort, predictors) if "los_icu" in spec.get("variables", {}).get("outcome", []) else {"status":"not_requested"},
    }
    typed = list(config.get("preflightIssues", [])) + methods_issues(summary, models)
    qa_status = "fail" if any(i.get("severity") == "blocker" for i in typed) else ("review" if typed else "pass")
    readiness = "blocked" if qa_status == "fail" else ("needs_methods_review" if qa_status == "review" else "local_review_ready")
    analysis = {"schemaVersion":1,"study":{"title":spec["title"],"question":spec["researchQuestion"]},"cohortSummary":summary,"predictors":predictors,"models":models}
    qa = {"schemaVersion":1,"status":qa_status,"typedIssues":typed,"checks":[{"code":"cohort-nonempty","passed":summary["firstCohortRows"]>0},{"code":"cache-policy","passed":True},{"code":"cost-under-ceiling","passed":cost["estimatedUsd"] <= float(request["maxUsd"])}]}
    (out_dir / "analysis-results.json").write_text(json.dumps(sanitize(analysis), indent=2) + "\n")
    (out_dir / "qa.json").write_text(json.dumps(sanitize(qa), indent=2) + "\n")
    (out_dir / "cost-receipt.json").write_text(json.dumps(sanitize(cost), indent=2) + "\n")
    (out_dir / "run-manifest.json").write_text(json.dumps({"schemaVersion":1,"generatedAtIso":now_iso(),"requiredTables":required,"sourceInventory":[table_by_id[t] for t in required if t in table_by_id],"specHash":spec["specHash"]}, indent=2) + "\n")
    (out_dir / "critique.md").write_text("# Critique\n\n" + ("Needs methods review.\n" if readiness != "local_review_ready" else "Ready for local review.\n"))
    if not matched.empty:
        matched.to_csv(out_dir / "matched-icd-codes.csv", index=False)
    else:
        (out_dir / "matched-icd-codes.csv").write_text("icd_code,icd_version,long_title\n")
    write_paper(out_dir, spec, summary, models, qa, cost)
    lifecycle = {"schemaVersion":1,"status":readiness,"qaStatus":qa_status,"nextAction":"Review typed issues before promotion." if readiness != "local_review_ready" else "Promote into benchmark or report review."}
    (out_dir / "lifecycle.json").write_text(json.dumps(lifecycle, indent=2) + "\n")
    result = {"schemaVersion":1,"runId":f"datasetrun_{int(datetime.now().timestamp()*1000)}","status":"succeeded","readiness":readiness,"analysisSpecPath":request["analysisSpecPath"],"specHash":spec["specHash"],"datasetDir":request["datasetDir"],"datasetId":spec["dataset"],"studyTitle":spec["title"],"cohortSummary":summary,"modelStatus":{"mortality":models["mortality"].get("status"),"los":models["los"].get("status")},"qaStatus":qa_status,"typedIssues":typed,"cost":cost,"artifacts":[{"kind":"analysis","path":str(out_dir/"analysis-results.json")},{"kind":"paper","path":str(out_dir/"paper.md")},{"kind":"qa","path":str(out_dir/"qa.json")},{"kind":"manifest","path":str(out_dir/"run-manifest.json")},{"kind":"cost","path":str(out_dir/"cost-receipt.json")},{"kind":"matched-codes","path":str(out_dir/"matched-icd-codes.csv")},{"kind":"lifecycle","path":str(out_dir/"lifecycle.json")},{"kind":"critique","path":str(out_dir/"critique.md")}],"outDir":str(out_dir),"nextAction":lifecycle["nextAction"]}
    print(json.dumps(sanitize(result)))

if __name__ == "__main__":
    main()
`;
}
