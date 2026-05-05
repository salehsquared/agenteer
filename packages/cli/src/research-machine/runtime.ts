import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { access, mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import {
  archetypeCatalog,
  backendCatalog,
  datasetCatalog,
  getArchetypeManifest,
  getBackendManifest,
  getDatasetManifest,
} from "./catalog.js";
import {
  analysisSpecV2Schema,
  backendIdSchema,
  benchmarkCaseSchema,
  type AnalysisSpecV2,
  type BackendId,
  type BenchmarkCase,
  type BenchmarkEvaluation,
  type DatasetAdapterId,
  type ExecutionContract,
  type MachineIssue,
  type MachinePlan,
  type MachineStatus,
  type ModelFamily,
  type ResearchBackendManifest,
  type StudyArchetypeId,
} from "./schemas.js";

const execFileAsync = promisify(execFile);

export interface RuntimeProbeOptions {
  python?: string;
  rscript?: string;
  dataRoot?: string;
}

export interface SpecV2Result {
  spec: AnalysisSpecV2;
  sourceKind: "analysis-spec-v2" | "analysis-spec-v1" | "legacy-packet";
  validation: {
    status: "pass" | "warning" | "blocked";
    issues: MachineIssue[];
  };
  outPath: string | null;
}

export interface DatasetAdapterInspection {
  adapter: ReturnType<typeof getDatasetManifest>;
  dataRoot: string | null;
  availability: "available" | "partial" | "missing" | "not_checked";
  evidence: string[];
  issues: MachineIssue[];
  discoveredFiles: Array<{ path: string; bytes: number; role: string }>;
}

export interface BackendRuntimeStatus {
  manifest: ResearchBackendManifest;
  availability: "available" | "missing" | "not_checked";
  version: string | null;
  packages: Record<string, string | null>;
  issues: MachineIssue[];
}

export interface MachineBenchmarkResult {
  benchmark: BenchmarkCase;
  evaluation: BenchmarkEvaluation;
  outPath: string | null;
}

export function stableHash(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(sortJson(value))).digest("hex");
}

function sortJson(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortJson);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, sortJson(item)]));
  }
  return value;
}

export async function readJsonFile(file: string): Promise<unknown> {
  return JSON.parse(await readFile(path.resolve(file), "utf-8")) as unknown;
}

function unwrapArtifact(value: unknown, key: string): unknown {
  if (value && typeof value === "object" && key in value) return (value as Record<string, unknown>)[key];
  return value;
}

function issue(severity: MachineIssue["severity"], code: string, message: string, evidenceRefs: string[] = []): MachineIssue {
  return { severity, code, message, evidenceRefs };
}

async function pathExists(file: string): Promise<boolean> {
  try {
    await access(file);
    return true;
  } catch {
    return false;
  }
}

async function probePython(executable: string, packages: string[]): Promise<{ availability: "available" | "missing"; version: string | null; packages: Record<string, string | null> }> {
  const code = [
    "import importlib, json, sys",
    `mods = ${JSON.stringify(packages)}`,
    "out = {'version': sys.version.split()[0], 'packages': {}}",
    "for m in mods:",
    "    try:",
    "        mod = importlib.import_module(m)",
    "        out['packages'][m] = getattr(mod, '__version__', 'available')",
    "    except Exception:",
    "        out['packages'][m] = None",
    "print(json.dumps(out))",
  ].join("\n");
  try {
    const { stdout } = await execFileAsync(executable, ["-c", code], { maxBuffer: 1024 * 1024 });
    const parsed = JSON.parse(stdout) as { version: string; packages: Record<string, string | null> };
    return { availability: packages.every(pkg => parsed.packages[pkg]) ? "available" : "missing", version: parsed.version, packages: parsed.packages };
  } catch {
    return { availability: "missing", version: null, packages: Object.fromEntries(packages.map(pkg => [pkg, null])) };
  }
}

async function probeR(executable: string, packages: string[]): Promise<{ availability: "available" | "missing"; version: string | null; packages: Record<string, string | null> }> {
  const code = [
    "suppressPackageStartupMessages({library(jsonlite)})",
    `pkgs <- c(${packages.map(pkg => `'${pkg}'`).join(",")})`,
    "versions <- list()",
    "for (p in pkgs) { versions[[p]] <- tryCatch(as.character(packageVersion(p)), error=function(e) NA_character_) }",
    "cat(toJSON(list(version=as.character(getRversion()), packages=versions), auto_unbox=TRUE, null='null'))",
  ].join("; ");
  try {
    const { stdout } = await execFileAsync(executable, ["-e", code], { maxBuffer: 1024 * 1024 });
    const parsed = JSON.parse(stdout) as { version: string; packages: Record<string, string | null> };
    return { availability: packages.every(pkg => parsed.packages[pkg]) ? "available" : "missing", version: parsed.version, packages: parsed.packages };
  } catch {
    return { availability: "missing", version: null, packages: Object.fromEntries(packages.map(pkg => [pkg, null])) };
  }
}

export async function inspectBackends(opts: RuntimeProbeOptions = {}): Promise<BackendRuntimeStatus[]> {
  const python = opts.python ?? process.env.AGENTEER_RESEARCH_PYTHON ?? process.env.PYTHON ?? "python3";
  const rscript = opts.rscript ?? process.env.AGENTEER_RESEARCH_RSCRIPT ?? "Rscript";
  const results: BackendRuntimeStatus[] = [];
  for (const manifest of backendCatalog) {
    if (manifest.verifier.commandKind === "none" || manifest.productionStatus === "future" || manifest.productionStatus === "blocked") {
      results.push({ manifest, availability: "not_checked", version: null, packages: {}, issues: [] });
      continue;
    }
    const probe = manifest.verifier.commandKind === "r-package"
      ? await probeR(rscript, manifest.verifier.required)
      : await probePython(python, manifest.verifier.required);
    results.push({
      manifest,
      availability: probe.availability,
      version: probe.version,
      packages: probe.packages,
      issues: probe.availability === "available" ? [] : [issue("warning", "BACKEND_MISSING", `${manifest.id} is not available in the configured local runtime.`)],
    });
  }
  return results;
}

export async function inspectDatasetAdapter(dataset: DatasetAdapterId, opts: { dataRoot?: string } = {}): Promise<DatasetAdapterInspection> {
  const adapter = getDatasetManifest(dataset);
  if (!opts.dataRoot || adapter.localCachePolicy === "not-applicable") {
    return {
      adapter,
      dataRoot: opts.dataRoot ? path.resolve(opts.dataRoot) : null,
      availability: adapter.localCachePolicy === "not-applicable" ? "available" : "not_checked",
      evidence: adapter.localCachePolicy === "not-applicable" ? ["No local cache required."] : ["No data root supplied."],
      issues: adapter.localCachePolicy === "required" ? [issue("warning", "DATA_ROOT_NOT_SUPPLIED", `${adapter.id} requires a local data root before execution.`)] : [],
      discoveredFiles: [],
    };
  }
  const dataRoot = path.resolve(opts.dataRoot);
  if (!await pathExists(dataRoot)) {
    return { adapter, dataRoot, availability: "missing", evidence: [`Data root does not exist: ${dataRoot}`], issues: [issue("blocker", "DATA_ROOT_MISSING", `Dataset root does not exist: ${dataRoot}`)], discoveredFiles: [] };
  }
  const files = await discoverDataFiles(dataRoot, adapter.supportedFormats);
  const names = files.map(file => path.basename(file.path).toUpperCase());
  const evidence = [`Discovered ${files.length} supported files under ${dataRoot}.`];
  const issues: MachineIssue[] = [];
  let availability: DatasetAdapterInspection["availability"] = files.length ? "partial" : "missing";
  if (dataset === "nhanes") {
    const hasDesign = ["SDMVSTRA", "SDMVPSU"].every(token => names.some(name => name.includes(token) || name.includes("DEMO")));
    const hasWeightHint = names.some(name => name.includes("DEMO") || name.includes("FAST") || name.includes("GLU"));
    if (hasDesign && hasWeightHint && files.length > 0) availability = "available";
    if (!hasDesign) issues.push(issue("warning", "NHANES_DESIGN_FILES_NOT_OBVIOUS", "NHANES cache was found, but demographics/design files were not obvious from filenames."));
    evidence.push(`NHANES design evidence: ${hasDesign ? "present" : "not obvious"}.`);
  }
  if (!files.length) issues.push(issue("blocker", "NO_SUPPORTED_DATA_FILES", `No ${adapter.supportedFormats.join("/")} files found under ${dataRoot}.`));
  return { adapter, dataRoot, availability, evidence, issues, discoveredFiles: files.slice(0, 50) };
}

async function discoverDataFiles(root: string, formats: string[]): Promise<Array<{ path: string; bytes: number; role: string }>> {
  const out: Array<{ path: string; bytes: number; role: string }> = [];
  async function walk(dir: string, depth: number): Promise<void> {
    if (depth > 4) return;
    const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(full, depth + 1);
      } else {
        const ext = path.extname(entry.name).replace(".", "").toLowerCase();
        if (formats.includes(ext as never)) {
          const info = await stat(full);
          out.push({ path: full, bytes: info.size, role: inferDataFileRole(entry.name) });
        }
      }
    }
  }
  await walk(root, 0);
  return out.sort((a, b) => a.path.localeCompare(b.path));
}

function inferDataFileRole(file: string): string {
  const upper = file.toUpperCase();
  if (upper.includes("DEMO")) return "demographics/survey-design";
  if (upper.includes("GLU") || upper.includes("GHB") || upper.includes("BIOPRO")) return "laboratory";
  if (upper.includes("BPX")) return "examination";
  if (upper.includes("MCQ") || upper.includes("SMQ") || upper.includes("HIQ")) return "questionnaire";
  return "data-table";
}

export function migrateToAnalysisSpecV2(raw: unknown): SpecV2Result {
  const candidate = unwrapArtifact(unwrapArtifact(raw, "analysisSpecV2"), "analysisSpec");
  const direct = analysisSpecV2Schema.safeParse(candidate);
  if (direct.success) {
    const validation = validateAnalysisSpecV2(direct.data);
    return { spec: direct.data, sourceKind: "analysis-spec-v2", validation, outPath: null };
  }
  if (!candidate || typeof candidate !== "object") {
    throw new Error("spec-v2 requires an AnalysisSpec object or wrapped analysisSpec artifact.");
  }
  const v1 = candidate as Record<string, unknown>;
  const researchQuestion = stringValue(v1.researchQuestion) ?? "Unspecified research question";
  const variables = recordValue(v1.variables);
  const survey = recordValue(v1.surveyDesign);
  const inference = recordValue(v1.inferencePolicy);
  const failure = recordValue(v1.failurePolicy);
  const outcome = stringArray(variables.outcome);
  const exposure = stringArray(variables.exposures ?? variables.exposure);
  const covariates = stringArray(variables.covariates);
  const modelFamily = inferModelFamily(v1, outcome);
  const dataset = inferDatasetId(stringValue(v1.dataset));
  const archetype = inferArchetypeId(researchQuestion, modelFamily, survey);
  const preferred = choosePreferredBackend(dataset, archetype, modelFamily);
  const specWithoutHash = {
    schemaVersion: 2 as const,
    specId: stringValue(v1.id) ?? `analysis_v2_${stableHash({ researchQuestion, outcome, exposure }).slice(0, 12)}`,
    title: titleFromQuestion(researchQuestion),
    researchQuestion,
    dataset,
    archetype,
    estimand: {
      type: inference.estimandType === "causal" ? "causal" as const : inference.estimandType === "descriptive" ? "descriptive" as const : "associational" as const,
      targetQuantity: modelFamily === "logistic" ? "adjusted odds ratio" : modelFamily === "prevalence" ? "survey-weighted prevalence" : "adjusted mean difference or slope",
      populationLevel: Boolean(survey.weightVariable),
      causalClaimsAllowed: Boolean(inference.causalClaimsAllowed),
    },
    population: {
      description: stringArray(recordValue(v1.population).description).length ? stringArray(recordValue(v1.population).description) : ["AnalysisSpec-defined population"],
      inclusionCriteria: stringArray(recordValue(v1.population).filters),
      exclusionCriteria: [],
      filters: stringArray(recordValue(v1.population).filters),
    },
    variables: {
      outcome: outcome.length ? outcome : ["OUTCOME_UNSPECIFIED"],
      exposure: exposure.length ? exposure : ["EXPOSURE_UNSPECIFIED"],
      covariates,
      stratifiers: stringArray(variables.stratify ?? variables.stratifiers),
      filters: stringArray(variables.filters),
      derived: stringArray(recordValue(v1.derivedDefinitions).definitions).map((definition, index) => {
        const sourceVariables = extractVariableNames(definition);
        return { name: `derived_${index + 1}`, expression: definition, sourceVariables: sourceVariables.length ? sourceVariables : ["REVIEW_SOURCE_VARIABLES"] };
      }),
    },
    surveyDesign: {
      required: Boolean(survey.weightVariable || survey.strataVariable || survey.psuVariable),
      weightVariable: nullableString(survey.weightVariable),
      strataVariable: nullableString(survey.strataVariable),
      psuVariable: nullableString(survey.psuVariable),
      replicateWeightPattern: null,
      weightDomain: inferWeightDomain(nullableString(survey.weightVariable)),
      weightRationale: stringValue(survey.weightRationale) ?? stringValue(survey.weight_rule) ?? `${nullableString(survey.weightVariable) ?? "No weight"} selected by prior AnalysisSpec.`,
      eligibilityNote: stringValue(survey.eligibilityNote) ?? "Eligibility follows declared population filters and complete-case requirements.",
      multiCycleRule: stringValue(survey.multiCycleRule) ?? "Use declared cycles only; combined-cycle weights require explicit construction evidence.",
    },
    missingness: {
      policy: "complete_case" as const,
      highMissingnessThreshold: numberValue(failure.highMissingnessThreshold, 0.4),
      requiredDiagnostics: ["per-variable missingness", "complete-case count", "weight-domain eligibility"],
    },
    model: {
      family: modelFamily,
      link: modelFamily === "logistic" ? "logit" : modelFamily === "linear" ? "identity" : null,
      binaryThreshold: numberOrNull(recordValue(v1.model).binaryThreshold),
      formula: `${(outcome[0] ?? "outcome")} ~ ${(exposure[0] ?? "exposure")}${covariates.length ? ` + ${covariates.join(" + ")}` : ""}`,
      diagnostics: modelFamily === "logistic" ? ["separation", "sparse cells", "odds-ratio consistency"] : ["influence", "residual scale", "numeric consistency"],
    },
    sensitivityAnalyses: [
      { id: "complete-case-vs-missingness", description: "Assess whether complete-case exclusions could change interpretation.", required: true },
    ],
    backendRequirements: {
      preferred,
      allowed: allowedBackendsFor(archetype, modelFamily),
      minimumCapabilities: ["local execution", "artifact hashing", "QA evidence", ...(Boolean(survey.weightVariable) ? ["survey weights"] : [])],
    },
    artifactExpectations: [
      { path: "analysis.json", role: "statistical-results", required: true, validator: "json-schema" },
      { path: "paper.md", role: "human-readable-report", required: true, validator: "paper-qa" },
      { path: "qa-cli.json", role: "deterministic-qa", required: true, validator: "paper-qa-json" },
      { path: "runner-record.json", role: "execution-provenance", required: true, validator: "runner-record" },
      { path: "lifecycle.json", role: "review-state", required: true, validator: "lifecycle" },
    ],
    claimPolicy: {
      allowedInference: inference.allowedInference === "design_corrected_inference" ? "design_corrected_inference" as const : "exploratory_association" as const,
      pValueLanguage: inference.pValueLanguage === "standard" ? "standard" as const : "approximate_only" as const,
      causalLanguage: Boolean(inference.causalClaimsAllowed) ? "requires_target_trial_review" as const : "forbidden" as const,
      actionability: "hypothesis_generating" as const,
    },
    failurePolicy: {
      missingVariable: "block" as const,
      invalidWeight: "block" as const,
      highMissingness: "sensitivity_required" as const,
      sparseCells: "suppress" as const,
      hashMismatch: "block" as const,
      rerunInstability: "block" as const,
      methodologicalUncertainty: "stop_for_review" as const,
      unsupportedBackend: "block" as const,
    },
    execution: {
      maxRuntimeSeconds: numberValue(recordValue(v1.execution).timeoutSeconds, 900),
      maxRows: numberValue(recordValue(v1.execution).maxRows, 250000),
      maxOutputBytes: numberValue(recordValue(v1.execution).maxOutputBytes, 25_000_000),
      maxUsd: 0,
      allowedWriteRoots: [],
      deniedActions: ["write-medbrevia", "cloud"],
    },
  };
  const spec = { ...specWithoutHash, specHash: stableHash(specWithoutHash) };
  const parsed = analysisSpecV2Schema.parse(spec);
  const validation = validateAnalysisSpecV2(parsed);
  return { spec: parsed, sourceKind: "analysis-spec-v1", validation, outPath: null };
}

export async function writeSpecV2(raw: unknown, outPath?: string): Promise<SpecV2Result> {
  const result = migrateToAnalysisSpecV2(raw);
  if (outPath) {
    const resolved = path.resolve(outPath);
    await mkdir(path.dirname(resolved), { recursive: true });
    await writeFile(resolved, `${JSON.stringify({ schemaVersion: 1, analysisSpecV2: result.spec, validation: result.validation }, null, 2)}\n`);
    return { ...result, outPath: resolved };
  }
  return result;
}

export function validateAnalysisSpecV2(spec: AnalysisSpecV2): SpecV2Result["validation"] {
  const issues: MachineIssue[] = [];
  const { specHash: _specHash, ...withoutHash } = spec;
  const expectedHash = stableHash(withoutHash);
  if (spec.specHash !== expectedHash) issues.push(issue("warning", "SPEC_HASH_STALE", "AnalysisSpec V2 hash does not match canonical content.", ["specHash"]));
  if (spec.surveyDesign.required) {
    if (!spec.surveyDesign.weightVariable) issues.push(issue("blocker", "SURVEY_WEIGHT_MISSING", "Survey analysis requires a weight variable."));
    if (!spec.surveyDesign.strataVariable) issues.push(issue("blocker", "SURVEY_STRATA_MISSING", "Survey analysis requires a strata variable."));
    if (!spec.surveyDesign.psuVariable) issues.push(issue("blocker", "SURVEY_PSU_MISSING", "Survey analysis requires a PSU variable."));
  }
  if ((spec.surveyDesign.weightDomain === "fasting" || spec.surveyDesign.weightDomain === "subsample") && spec.surveyDesign.weightRationale.length < 20) {
    issues.push(issue("blocker", "SUBSAMPLE_RATIONALE_WEAK", "Subsample or fasting weights require a specific rationale."));
  }
  if (spec.model.family === "logistic" && spec.model.binaryThreshold === null && spec.archetype === "binary-outcome-model") {
    issues.push(issue("blocker", "BINARY_THRESHOLD_MISSING", "Binary outcome models require model.binaryThreshold."));
  }
  if (spec.estimand.type !== "causal" && spec.claimPolicy.causalLanguage !== "forbidden") {
    issues.push(issue("blocker", "CAUSAL_POLICY_CONFLICT", "Non-causal specs must forbid causal language."));
  }
  if (spec.execution.maxUsd > 0 && !spec.execution.deniedActions.includes("cloud")) {
    issues.push(issue("warning", "COST_BOUNDARY_NONZERO", "Spec allows paid execution; this needs explicit human review."));
  }
  return { status: issues.some(item => item.severity === "blocker") ? "blocked" : issues.length ? "warning" : "pass", issues };
}

export async function buildMachineStatus(opts: RuntimeProbeOptions = {}): Promise<MachineStatus> {
  const backends = await inspectBackends(opts);
  const datasetInspections = await Promise.all(datasetCatalog.map(dataset => inspectDatasetAdapter(dataset.id, { dataRoot: opts.dataRoot })));
  const issues = [...backends.flatMap(item => item.issues), ...datasetInspections.flatMap(item => item.issues)];
  const tracks: MachineStatus["tracks"] = [
    { id: "execution-core", status: "ready", summary: "Typed execution contracts, policy envelopes, artifact expectations, repeatability gates." },
    { id: "analysis-engines", status: backends.some(item => item.manifest.id === "r-survey" && item.availability === "available") ? "ready" : "partial", summary: "Backend manifest registry with runtime probes for Python, DuckDB/Polars, and R survey." },
    { id: "analysis-spec-v2", status: "ready", summary: "Strict V2 contract with migration and validation from current specs." },
    { id: "study-archetypes", status: "ready", summary: `${archetypeCatalog.length} executable archetype manifests.` },
    { id: "dataset-adapters", status: datasetInspections.some(item => item.adapter.id === "nhanes" && item.availability === "available") ? "ready" : "partial", summary: "Dataset adapter manifests with NHANES local cache inspection." },
    { id: "qa-benchmark", status: "ready", summary: "Benchmark case builder/evaluator with artifact, methods, rerun, claim, backend, and adapter gates." },
    { id: "planner-product", status: "partial", summary: "Deterministic planner emits backend/archetype choice, review stops, and CLI command sequence." },
  ];
  return {
    schemaVersion: 1,
    generatedAtIso: new Date().toISOString(),
    tracks,
    backends: backends.map(item => ({ ...item.manifest, availability: item.availability, version: item.version, packages: item.packages })),
    datasets: datasetInspections.map(item => ({ ...item.adapter, availability: item.availability, evidence: item.evidence })),
    archetypes: archetypeCatalog,
    issues,
    nextAction: tracks.some(track => track.status !== "ready")
      ? "Resolve partial tracks by promoting NHANES adapter evidence and R survey runtime into the golden benchmark suite."
      : "Run machine-plan against a real question and promote the packet into benchmark evaluation.",
  };
}

export function buildExecutionContract(spec: AnalysisSpecV2, opts: { backend?: BackendId; dataRoot?: string; outDir?: string } = {}): ExecutionContract {
  const backendId = opts.backend ?? spec.backendRequirements.preferred;
  const backend = getBackendManifest(backendId);
  const datasetAdapter = getDatasetManifest(spec.dataset);
  const archetype = getArchetypeManifest(spec.archetype);
  const issues = validateAnalysisSpecV2(spec).issues;
  if (!spec.backendRequirements.allowed.includes(backendId)) {
    issues.push(issue("blocker", "BACKEND_NOT_ALLOWED", `${backendId} is not allowed by the AnalysisSpec backend policy.`));
  }
  if (!archetype.allowedBackends.includes(backendId)) {
    issues.push(issue("blocker", "ARCHETYPE_BACKEND_UNSUPPORTED", `${backendId} does not support archetype ${archetype.id}.`));
  }
  if (!archetype.allowedDatasets.includes(spec.dataset)) {
    issues.push(issue("blocker", "ARCHETYPE_DATASET_UNSUPPORTED", `${spec.dataset} does not support archetype ${archetype.id}.`));
  }
  if (backend.productionStatus === "future" || backend.productionStatus === "blocked") {
    issues.push(issue("blocker", "BACKEND_NOT_PRODUCTION_READY", `${backendId} is ${backend.productionStatus}.`));
  }
  const outDir = opts.outDir ?? "./research-machine-output";
  const command = backendId === "r-survey" || backendId === "python-linearized"
    ? ["agenteer", "research", "paper-run", "--backend", backendId, "--analysis-spec", "analysis-spec-v2.json", "--data-root", opts.dataRoot ?? "<data-root>", "--out-dir", outDir]
    : ["agenteer", "research", "execute-backend", "--backend", backendId, "--spec", "analysis-spec-v2.json"];
  return {
    schemaVersion: 1,
    contractId: `exec_${stableHash({ specHash: spec.specHash, backendId, outDir }).slice(0, 12)}`,
    specHash: spec.specHash,
    backend,
    datasetAdapter,
    archetype,
    runner: {
      kind: spec.execution.maxUsd === 0 ? "sandboxed-local" : "cloud-disallowed",
      command,
      environment: { AGENTEER_RESEARCH_BACKEND: backendId },
      timeoutSeconds: spec.execution.maxRuntimeSeconds,
    },
    policyEnvelope: {
      maxUsd: spec.execution.maxUsd,
      allowedWriteRoots: spec.execution.allowedWriteRoots.length ? spec.execution.allowedWriteRoots : [outDir],
      deniedActions: spec.execution.deniedActions,
      requiresHumanReview: issues.some(item => item.severity === "blocker") || spec.archetype.includes("target-trial"),
      stopReasons: issues.filter(item => item.severity === "blocker").map(item => `${item.code}: ${item.message}`),
    },
    typedOutputs: spec.artifactExpectations.map(artifact => ({ path: artifact.path, role: artifact.role, schemaRef: artifact.validator, required: artifact.required })),
    repeatability: {
      required: true,
      maxAbsoluteNumericDiff: 1e-9,
      compareArtifacts: ["analysis.json", "qa-cli.json", "runner-record.json"],
    },
    validation: {
      status: issues.some(item => item.severity === "blocker") ? "blocked" : issues.length ? "warning" : "pass",
      issues,
    },
  };
}

export function buildMachinePlan(opts: { question: string; dataset?: DatasetAdapterId; archetype?: StudyArchetypeId; dataRoot?: string; backend?: BackendId }): MachinePlan {
  const dataset = getDatasetManifest(opts.dataset ?? inferDatasetIdFromQuestion(opts.question));
  const archetype = getArchetypeManifest(opts.archetype ?? inferArchetypeFromQuestion(opts.question, dataset.id));
  const backend = getBackendManifest(opts.backend ?? chooseBestBackend(archetype));
  const risks: MachineIssue[] = [];
  if (!archetype.allowedDatasets.includes(dataset.id)) risks.push(issue("blocker", "PLANNER_DATASET_ARCHETYPE_MISMATCH", `${dataset.id} is not allowed for ${archetype.id}.`));
  if (!archetype.allowedBackends.includes(backend.id)) risks.push(issue("blocker", "PLANNER_BACKEND_ARCHETYPE_MISMATCH", `${backend.id} is not allowed for ${archetype.id}.`));
  if (backend.productionStatus === "future") risks.push(issue("blocker", "PLANNER_BACKEND_FUTURE", `${backend.id} is not production-ready.`));
  const stopForHumanReview = risks.some(item => item.severity === "blocker") || archetype.stopForHumanReviewWhen.length > 0;
  const confidence = Math.max(0.25, 0.92 - risks.length * 0.2 - (dataset.productionStatus !== "ready" ? 0.08 : 0) - (backend.productionStatus !== "available" ? 0.08 : 0));
  return {
    schemaVersion: 1,
    planId: `plan_${stableHash({ question: opts.question, dataset: dataset.id, archetype: archetype.id, backend: backend.id }).slice(0, 12)}`,
    question: opts.question,
    dataset,
    archetype,
    backend,
    confidence,
    stopForHumanReview,
    rationale: [
      `Selected dataset adapter ${dataset.id} because the question fits ${dataset.domain}.`,
      `Selected archetype ${archetype.id} from question patterns and requested methods.`,
      `Selected backend ${backend.id} from archetype allowed engines and production readiness.`,
    ],
    commandSequence: [
      `agenteer research machine-status${opts.dataRoot ? ` --data-root ${shellQuote(opts.dataRoot)}` : ""} --json`,
      `agenteer research machine-plan --question ${shellQuote(opts.question)} --dataset ${dataset.id} --archetype ${archetype.id} --json`,
      "agenteer research spec-v2 --spec ./analysis-spec.json --out ./analysis-spec-v2.json --json",
      `agenteer research execution-contract --spec ./analysis-spec-v2.json --backend ${backend.id}${opts.dataRoot ? ` --data-root ${shellQuote(opts.dataRoot)}` : ""} --json`,
      "agenteer research paper-run --analysis-spec ./analysis-spec-v2.json --data-root <data-root> --out-dir ./paper --backend r-survey --json",
      "agenteer research machine-benchmark --packet ./paper --spec ./analysis-spec-v2.json --json",
    ],
    requiredArtifacts: ["analysis-spec-v2.json", ...archetype.expectedArtifacts, "machine-benchmark.json"],
    risks,
  };
}

export async function buildBenchmarkCase(opts: { packetDir: string; specPath?: string }): Promise<BenchmarkCase> {
  const packetDir = path.resolve(opts.packetDir);
  const specResult = opts.specPath ? migrateToAnalysisSpecV2(await readJsonFile(opts.specPath)) : await inferSpecFromPacket(packetDir);
  const spec = specResult.spec;
  return {
    schemaVersion: 1,
    benchmarkId: `bench_${path.basename(packetDir).replace(/[^a-zA-Z0-9_-]/g, "_")}_${spec.specHash.slice(0, 8)}`,
    packetDir,
    specHash: spec.specHash,
    archetype: spec.archetype,
    dataset: spec.dataset,
    expectedArtifacts: spec.artifactExpectations.filter(item => item.required).map(item => item.path),
    requiredQaGates: getArchetypeManifest(spec.archetype).qaGates,
    requiredFailurePolicies: Object.entries(spec.failurePolicy).filter(([, value]) => value === "block" || value === "stop_for_review").map(([key]) => key),
    rerunStability: { required: true, maxDiffCount: 0, maxAbsoluteNumericDiff: 1e-9 },
    reviewerRubric: ["claim-safety", "methods-disclosure", "survey-design", "artifact-provenance", "rerun-stability"],
  };
}

export async function evaluateMachineBenchmark(opts: { packetDir: string; specPath?: string; outPath?: string }): Promise<MachineBenchmarkResult> {
  const benchmark = await buildBenchmarkCase(opts);
  const checks: BenchmarkEvaluation["checks"] = [];
  const issues: MachineIssue[] = [];
  const addCheck = (id: string, ok: boolean, weight: number, detail: string, evidenceRefs: string[] = []) => {
    checks.push({ id, status: ok ? "pass" : "fail", weight, detail, evidenceRefs });
    if (!ok) issues.push(issue(weight >= 1.5 ? "blocker" : "warning", `BENCHMARK_${id.toUpperCase().replace(/[^A-Z0-9]+/g, "_")}`, detail, evidenceRefs));
  };
  for (const artifact of benchmark.expectedArtifacts) {
    const artifactPath = path.join(benchmark.packetDir, artifact);
    addCheck(`artifact:${artifact}`, await pathExists(artifactPath), 1.4, `Required artifact ${artifact} ${await pathExists(artifactPath) ? "exists" : "is missing"}.`, [artifactPath]);
  }
  const qa = await readOptionalJson(path.join(benchmark.packetDir, "qa-cli.json"));
  addCheck("paper-qa-pass", artifactStatus(qa, "paperQa") === "pass", 1.6, "Paper QA must pass.", [path.join(benchmark.packetDir, "qa-cli.json")]);
  const lifecycle = await readOptionalJson(path.join(benchmark.packetDir, "lifecycle.json"));
  addCheck("lifecycle-ready", JSON.stringify(lifecycle).includes("ready_for_local_review"), 1.4, "Lifecycle must be ready for local review.", [path.join(benchmark.packetDir, "lifecycle.json")]);
  const runner = await readOptionalJson(path.join(benchmark.packetDir, "runner-record.json"));
  addCheck("runner-spec-governed", JSON.stringify(runner).includes("spec-governed"), 1.5, "Runner record must be spec-governed.", [path.join(benchmark.packetDir, "runner-record.json")]);
  const stability = await readOptionalJson(path.join(benchmark.packetDir, "rerun-stability.json"));
  addCheck("rerun-stability", !benchmark.rerunStability.required || JSON.stringify(stability).includes('"status":"pass"') || JSON.stringify(stability).includes('"status": "pass"'), 1.5, "Rerun stability must pass.", [path.join(benchmark.packetDir, "rerun-stability.json")]);
  const score = checks.reduce((sum, check) => sum + (check.status === "pass" ? check.weight : 0), 0);
  const maxScore = checks.reduce((sum, check) => sum + check.weight, 0) || 1;
  const normalizedScore = Number((score / maxScore).toFixed(4));
  const evaluation: BenchmarkEvaluation = {
    schemaVersion: 1,
    benchmarkId: benchmark.benchmarkId,
    status: issues.some(item => item.severity === "blocker") ? "fail" : issues.length ? "warning" : "pass",
    normalizedScore,
    checks,
    issues,
    nextAction: issues.length ? "Fix benchmark failures before promoting this packet." : "Packet passes machine benchmark; promote into the golden suite or add a harder archetype.",
  };
  if (opts.outPath) {
    const resolved = path.resolve(opts.outPath);
    await mkdir(path.dirname(resolved), { recursive: true });
    await writeFile(resolved, `${JSON.stringify({ schemaVersion: 1, benchmark, evaluation }, null, 2)}\n`);
    return { benchmark, evaluation, outPath: resolved };
  }
  return { benchmark, evaluation, outPath: null };
}

async function inferSpecFromPacket(packetDir: string): Promise<SpecV2Result> {
  for (const name of ["analysis-spec-v2.json", "analysis-spec.json"]) {
    const file = path.join(packetDir, name);
    if (await pathExists(file)) return migrateToAnalysisSpecV2(await readJsonFile(file));
  }
  throw new Error(`No analysis spec found in packet: ${packetDir}`);
}

async function readOptionalJson(file: string): Promise<unknown | null> {
  try {
    return JSON.parse(await readFile(file, "utf-8")) as unknown;
  } catch {
    return null;
  }
}

function artifactStatus(value: unknown, key: string): string | null {
  const artifact = unwrapArtifact(value, key);
  if (artifact && typeof artifact === "object" && typeof (artifact as Record<string, unknown>).status === "string") return String((artifact as Record<string, unknown>).status);
  return null;
}

function recordValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? value as Record<string, unknown> : {};
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

function nullableString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

function stringArray(value: unknown): string[] {
  if (Array.isArray(value)) return [...new Set(value.filter((item): item is string => typeof item === "string" && item.trim().length > 0).map(item => item.trim()))];
  if (typeof value === "string" && value.trim()) return [value.trim()];
  return [];
}

function numberValue(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function numberOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function inferDatasetId(dataset: string | null): DatasetAdapterId {
  const normalized = (dataset ?? "").toLowerCase();
  if (normalized.includes("nhanes")) return "nhanes";
  if (normalized.includes("brfss")) return "brfss";
  if (normalized.includes("mimic")) return "mimic";
  if (normalized.includes("claim")) return "claims";
  if (normalized.includes("seer")) return "seer";
  return "user-table";
}

function inferDatasetIdFromQuestion(question: string): DatasetAdapterId {
  const lower = question.toLowerCase();
  if (lower.includes("nhanes") || lower.includes("survey") || lower.includes("adult") || lower.includes("biomarker")) return "nhanes";
  if (lower.includes("claims") || lower.includes("medicare")) return "claims";
  if (lower.includes("icu") || lower.includes("ehr")) return "mimic";
  return "user-table";
}

function inferModelFamily(v1: Record<string, unknown>, outcome: string[]): ModelFamily {
  const plan = JSON.stringify(v1).toLowerCase();
  if (plan.includes("logistic") || plan.includes("odds") || plan.includes("binarythreshold")) return "logistic";
  if (plan.includes("prevalence")) return "prevalence";
  if (outcome.some(name => /death|event|yes|flag|case/i.test(name))) return "logistic";
  return "linear";
}

function inferArchetypeId(question: string, family: ModelFamily, survey: Record<string, unknown>): StudyArchetypeId {
  const lower = question.toLowerCase();
  if (survey.weightVariable === "WTSAF2YR" || lower.includes("fasting") || lower.includes("subsample")) return "subsample-high-missingness";
  if (lower.includes("prevalence") || lower.includes("how common")) return "survey-prevalence";
  if (family === "logistic") return "binary-outcome-model";
  if (lower.includes("subgroup") || lower.includes("interaction") || lower.includes("by sex")) return "subgroup-domain-analysis";
  if (lower.includes("biomarker") || lower.includes("hba1c") || lower.includes("glucose") || lower.includes("hdl")) return "continuous-biomarker-model";
  return "cross-sectional-association";
}

function inferArchetypeFromQuestion(question: string, dataset: DatasetAdapterId): StudyArchetypeId {
  const lower = question.toLowerCase();
  if (lower.includes("fasting") || lower.includes("subsample")) return "subsample-high-missingness";
  if (lower.includes("prevalence") || lower.includes("proportion") || lower.includes("how common")) return "survey-prevalence";
  if (lower.includes("odds") || lower.includes("elevated") || lower.includes("binary")) return "binary-outcome-model";
  if (lower.includes("diagnostic") || lower.includes("sensitivity") || lower.includes("specificity")) return "diagnostic-accuracy";
  if (lower.includes("predict") || lower.includes("risk score")) return "prediction-model";
  if (lower.includes("effect of") || lower.includes("causal")) return "target-trial-emulation-sketch";
  if (lower.includes("subgroup") || lower.includes("interaction") || lower.includes(" by ")) return "subgroup-domain-analysis";
  if (dataset === "nhanes" && (lower.includes("hba1c") || lower.includes("glucose") || lower.includes("hdl") || lower.includes("bmi"))) return "continuous-biomarker-model";
  return "cross-sectional-association";
}

function choosePreferredBackend(dataset: DatasetAdapterId, archetype: StudyArchetypeId, family: ModelFamily): BackendId {
  if (dataset === "nhanes" || archetype === "survey-prevalence" || archetype === "subsample-high-missingness") return "r-survey";
  if (family === "prediction") return "sklearn";
  if (archetype.includes("target-trial") || family === "difference_in_differences" || family === "propensity_weighting") return "causal";
  return "python-statsmodels";
}

function chooseBestBackend(archetype: ReturnType<typeof getArchetypeManifest>): BackendId {
  const available = archetype.allowedBackends.find(id => getBackendManifest(id).productionStatus === "available");
  return available ?? archetype.allowedBackends[0] ?? "python-statsmodels";
}

function allowedBackendsFor(archetype: StudyArchetypeId, family: ModelFamily): BackendId[] {
  const allowed = getArchetypeManifest(archetype).allowedBackends.filter(id => getBackendManifest(id).supportedModelFamilies.includes(family) || getBackendManifest(id).role === "data-prep");
  return allowed.length ? allowed : getArchetypeManifest(archetype).allowedBackends;
}

function inferWeightDomain(weight: string | null): AnalysisSpecV2["surveyDesign"]["weightDomain"] {
  if (!weight) return "none";
  if (/WTSAF/i.test(weight)) return "fasting";
  if (/WTINT/i.test(weight)) return "interview";
  if (/WTMEC/i.test(weight)) return "mec";
  return "subsample";
}

function extractVariableNames(text: string): string[] {
  return [...new Set((text.match(/\b[A-Z][A-Z0-9_]{2,}\b/g) ?? []).filter(token => token.length <= 24))];
}

function titleFromQuestion(question: string): string {
  return question.replace(/\?+$/, "").trim() || "Research study";
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, "'\\''")}'`;
}
