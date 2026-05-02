import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

export interface LabMedbreviaNhanesOptions {
  repoDir: string;
  question: string;
  outDir?: string;
}

export interface NhanesRegistryVariable {
  name: string;
  domain?: string;
  table?: string;
  label?: string;
  role?: string;
  unit?: string;
  weightHint?: string;
}

export interface NhanesRegistry {
  dataset?: string;
  version?: string;
  cycles?: Array<{
    id: string;
    label?: string;
    trendComparable?: boolean;
    weightYears?: number;
  }>;
  domains?: Record<string, { label?: string; description?: string }>;
  variables?: NhanesRegistryVariable[];
  weightRules?: Array<{
    id: string;
    weightVariable: string;
    strataVariable: string;
    psuVariable: string;
    description?: string;
  }>;
}

export interface LabProtocolDesign {
  title: string;
  clinicalQuestion: string;
  dataset: "nhanes";
  population: {
    label: string;
    filters: string[];
  };
  exposure: {
    label: string;
    variables: string[];
    domain: string | null;
  };
  endpoint: {
    label: string;
    variables: string[];
    domain: string | null;
  };
  covariates: string[];
  stratifiers: string[];
  cycles: string[];
  approvedDataInputs: string[];
  surveyDesign: {
    weightRule: string;
    weightVariable: string | null;
    strataVariable: string | null;
    psuVariable: string | null;
  };
  requestedOutputs: string[];
  derivedDefinitions: Array<{
    id: string;
    label: string;
    expression: string;
    variables: string[];
    role: "exposure" | "endpoint" | "filter" | "covariate";
  }>;
  caveats: string[];
}

export interface LabMedbreviaNhanesResult {
  packetVersion: 0;
  generatedAtIso: string;
  source: {
    medbreviaRepo: string;
    branch: string | null;
    registryPath: string;
    registryVersion: string | null;
    registrySha256: string;
  };
  protocol: LabProtocolDesign;
  diagnostics: {
    matchedVariables: NhanesRegistryVariable[];
    warnings: Array<{ code: string; message: string }>;
    blockers: Array<{ code: string; message: string }>;
  };
  commandLineProduct: {
    purpose: string;
    proposedCommands: string[];
    medbreviaInputs: string[];
    agenteerOutputs: string[];
  };
  improvementLoop: {
    agenteerShouldOwn: string[];
    medbreviaShouldOwn: string[];
    firstAgenteerBacklog: string[];
  };
  outDir?: string;
}

const DOMAIN_SYNONYMS: Record<string, string[]> = {
  blood_pressure: ["hypertension", "blood pressure", "systolic", "diastolic", "bp"],
  vitamin_d: ["vitamin d", "25 hydroxy", "25-hydroxy", "vitd", "lbxvid"],
  anthropometrics: ["bmi", "body mass", "obesity", "weight", "height", "waist"],
  smoking: ["smoking", "smoker", "cigarette", "tobacco"],
  diabetes: ["diabetes", "hba1c", "glycohemoglobin", "glucose"],
  kidney: ["kidney", "renal", "creatinine", "albuminuria", "egfr"],
  lipids: ["cholesterol", "lipid", "hdl", "triglyceride"],
  insurance_access: ["insurance", "access to care", "coverage"],
};

const VARIABLE_HINTS: Record<string, string[]> = {
  LBXVIDMS: ["vitamin d", "25 hydroxy", "25-hydroxy", "vitd"],
  BPXSY1: ["hypertension", "blood pressure", "systolic"],
  BPXSY2: ["hypertension", "blood pressure", "systolic"],
  BPXSY3: ["hypertension", "blood pressure", "systolic"],
  BPXDI1: ["hypertension", "blood pressure", "diastolic"],
  BPXDI2: ["hypertension", "blood pressure", "diastolic"],
  BPXDI3: ["hypertension", "blood pressure", "diastolic"],
  BPQ020: ["self-reported high blood pressure", "told you had high blood pressure", "doctor told high blood pressure"],
  RIDAGEYR: ["adult", "age", "older", "years"],
  RIAGENDR: ["sex", "gender"],
  RIDRETH3: ["race", "ethnicity", "ethnic"],
  BMXBMI: ["bmi", "body mass", "obesity"],
  INDFMPIR: ["income", "poverty", "socioeconomic"],
  SMQ020: ["smoking", "smoker", "cigarette"],
  URDACT: ["kidney", "renal", "albuminuria", "urine albumin creatinine"],
  LBXSCR: ["kidney", "renal", "creatinine", "serum creatinine", "egfr"],
};

export async function labMedbreviaNhanesCommand(
  opts: LabMedbreviaNhanesOptions,
): Promise<LabMedbreviaNhanesResult> {
  const repoDir = path.resolve(opts.repoDir);
  const registryPath = path.join(repoDir, "data", "analytics", "nhanes", "registry.json");
  const registryRaw = await readFile(registryPath, "utf-8");
  const registry = JSON.parse(registryRaw) as NhanesRegistry;
  const question = opts.question.trim();
  if (!question) throw new Error("lab medbrevia-nhanes: --question is required");

  const protocol = designProtocol(question, registry);
  const diagnostics = validateProtocol(protocol, registry);
  const result: LabMedbreviaNhanesResult = {
    packetVersion: 0,
    generatedAtIso: new Date().toISOString(),
    source: {
      medbreviaRepo: repoDir,
      branch: readGitBranch(repoDir),
      registryPath,
      registryVersion: registry.version ?? null,
      registrySha256: sha256(registryRaw),
    },
    protocol,
    diagnostics,
    commandLineProduct: {
      purpose:
        "A CLI-only research design loop where Agenteer reads dataset metadata, proposes bounded analytic protocols, and returns traceable design packets without mutating the source project.",
      proposedCommands: [
        "agenteer research design --project medbrevia-nhanes --repo <medbrevia_v3> --question '<clinical question>' --out <packet-dir>",
        "agenteer run --spec <packet-dir>/workflow.yaml --session <session-dir>",
        "agenteer inspect --session <session-dir> --evidence",
      ],
      medbreviaInputs: [
        "NHANES registry JSON",
        "analytics runner contract",
        "current analytics tests and fixtures",
      ],
      agenteerOutputs: [
        "candidate protocol JSON",
        "workflow spec skeleton",
        "evidence-backed design report",
        "framework backlog discovered by the use case",
      ],
    },
    improvementLoop: {
      agenteerShouldOwn: [
        "workflow state, session replay, permission envelopes, evidence records, node composition, and inspectable traces",
        "deterministic protocol validation before any model-generated code can run",
        "human approval and resume boundaries between design, scout, and execution",
      ],
      medbreviaShouldOwn: [
        "auth, UI, Firestore/GCS/Cloud Run integration, dataset hosting, and product-specific presentation",
        "curated dataset registries and medical domain constraints",
        "final clinical UX and staff review policy",
      ],
      firstAgenteerBacklog: [
        "promote this lab command into a real workflow example with nodes for registry_load, protocol_design, protocol_validate, cohort_scout, and report_packet",
        "teach inspect to group failures by product concept: question, protocol, data, execution, artifact, report",
        "add artifact evidence records for generated code, tables, plots, runner logs, and validation reports",
        "add a fixture-driven long-running workflow test with human approval and resume",
      ],
    },
  };

  if (opts.outDir) {
    const outDir = path.resolve(opts.outDir);
    await mkdir(outDir, { recursive: true });
    await writeFile(path.join(outDir, "design.json"), `${JSON.stringify(result, null, 2)}\n`);
    await writeFile(path.join(outDir, "design.md"), renderLabMedbreviaNhanesResult(result));
    await writeFile(path.join(outDir, "workflow.yaml"), renderWorkflowSkeleton(result));
    result.outDir = outDir;
  }

  return result;
}

export function renderLabMedbreviaNhanesResult(result: LabMedbreviaNhanesResult): string {
  const p = result.protocol;
  const lines = [
    "# Agenteer x MedBrevia NHANES Design Packet",
    "",
    `Question: ${p.clinicalQuestion}`,
    `MedBrevia repo: ${result.source.medbreviaRepo}`,
    `Branch: ${result.source.branch ?? "unknown"}`,
    `Registry SHA-256: ${result.source.registrySha256}`,
    "",
    "## Candidate Protocol",
    "",
    `Title: ${p.title}`,
    `Dataset: ${p.dataset}`,
    `Population: ${p.population.label}`,
    `Cycles: ${p.cycles.join(", ") || "(none)"}`,
    `Approved domains: ${p.approvedDataInputs.join(", ") || "(none)"}`,
    `Survey design: ${p.surveyDesign.weightRule} / ${p.surveyDesign.weightVariable ?? "unknown"}`,
    "",
    "### Variables",
    "",
    `Exposure: ${p.exposure.label} (${p.exposure.variables.join(", ") || "unspecified"})`,
    `Endpoint: ${p.endpoint.label} (${p.endpoint.variables.join(", ") || "unspecified"})`,
    `Covariates: ${p.covariates.join(", ") || "(none)"}`,
    `Stratifiers: ${p.stratifiers.join(", ") || "(none)"}`,
    "",
    "### Derived Definitions",
    "",
    ...renderDerivedDefinitions(p.derivedDefinitions),
    "",
    "### Diagnostics",
    "",
    ...renderIssues("Blockers", result.diagnostics.blockers),
    ...renderIssues("Warnings", result.diagnostics.warnings),
    "",
    "## CLI Product Shape",
    "",
    result.commandLineProduct.purpose,
    "",
    ...result.commandLineProduct.proposedCommands.map(command => `- \`${command}\``),
    "",
    "## Self-Reinforcing Loop",
    "",
    "Agenteer improves by turning this workflow into reusable nodes and better inspection. The research pipeline improves by replacing hand-rolled orchestration with a replayable command-line contract while keeping domain/product ownership outside the framework.",
    "",
    "### Agenteer Owns",
    "",
    ...result.improvementLoop.agenteerShouldOwn.map(item => `- ${item}`),
    "",
    "### Domain/Product Owns",
    "",
    ...result.improvementLoop.medbreviaShouldOwn.map(item => `- ${item}`),
    "",
    "### First Agenteer Backlog",
    "",
    ...result.improvementLoop.firstAgenteerBacklog.map(item => `- ${item}`),
    "",
  ];
  return `${lines.join("\n")}\n`;
}

function renderIssues(title: string, issues: Array<{ code: string; message: string }>): string[] {
  if (!issues.length) return [`${title}: none`];
  return [
    `${title}:`,
    ...issues.map(issue => `- ${issue.code}: ${issue.message}`),
  ];
}

function designProtocol(question: string, registry: NhanesRegistry): LabProtocolDesign {
  const matchedVariables = matchVariables(question, registry);
  const exposure = pickConcept(question, matchedVariables, "exposure");
  const endpoint = pickConcept(question, matchedVariables, "endpoint");
  const stratifiers = pickStratifiers(question);
  const covariates = pickCovariates(question, matchedVariables, [...exposure.variables, ...endpoint.variables, ...stratifiers]);
  const domains = unique([
    "demographics",
    exposure.domain,
    endpoint.domain,
    ...covariates.map(name => registry.variables?.find(v => v.name === name)?.domain),
  ].filter((value): value is string => Boolean(value)));
  const cycles = pickCycles(matchedVariables, registry);
  const weightRule = pickWeightRule(cycles, matchedVariables);
  const selectedWeight = registry.weightRules?.find(rule => rule.id === weightRule);
  const derivedDefinitions = buildDerivedDefinitions(question, exposure, endpoint);

  return {
    title: makeTitle(exposure.label, endpoint.label),
    clinicalQuestion: question,
    dataset: "nhanes",
    population: {
      label: /\b(adult|adults|20\+|age)\b/i.test(question) ? "Adults, age 20+ when clinically appropriate" : "NHANES participants matching protocol eligibility",
      filters: ["RIDSTATR == 2", "RIDAGEYR >= 20 when adult population is intended"],
    },
    exposure,
    endpoint,
    covariates,
    stratifiers,
    cycles,
    approvedDataInputs: domains,
    surveyDesign: {
      weightRule,
      weightVariable: selectedWeight?.weightVariable ?? null,
      strataVariable: selectedWeight?.strataVariable ?? null,
      psuVariable: selectedWeight?.psuVariable ?? null,
    },
    requestedOutputs: [
      "cohort_flow_table",
      "weighted_descriptive_table",
      "primary_model_table",
      "methods_and_limitations_report",
    ],
    derivedDefinitions,
    caveats: [
      "NHANES analyses are observational and cross-sectional unless a specific longitudinal design is introduced.",
      "Use survey weights, strata, and PSU variables for population estimates.",
      "Generated execution code should not run until the protocol and cohort scout pass deterministic validation.",
    ],
  };
}

function renderDerivedDefinitions(definitions: LabProtocolDesign["derivedDefinitions"]): string[] {
  if (!definitions.length) return ["Derived definitions: none"];
  return definitions.map(def => `- ${def.id}: ${def.expression}`);
}

function matchVariables(question: string, registry: NhanesRegistry): NhanesRegistryVariable[] {
  const q = normalize(question);
  const variables = registry.variables ?? [];
  const scored = variables
    .map(variable => {
      const hints = [
        variable.name,
        variable.label,
        variable.domain,
        ...(VARIABLE_HINTS[variable.name] ?? []),
        ...(variable.domain ? DOMAIN_SYNONYMS[variable.domain] ?? [] : []),
      ].filter(Boolean).map(String);
      const score = hints.reduce((total, hint) => total + (q.includes(normalize(hint)) ? 1 : 0), 0);
      return { variable, score };
    })
    .filter(item => item.score > 0)
    .sort((a, b) => b.score - a.score || a.variable.name.localeCompare(b.variable.name));
  return uniqueBy(scored.map(item => item.variable), variable => variable.name);
}

function pickConcept(
  question: string,
  matched: NhanesRegistryVariable[],
  role: "exposure" | "endpoint",
): LabProtocolDesign["exposure"] {
  const q = normalize(question);
  const desiredDomain = desiredDomainForQuestion(q, role);
  const preferred = preferredVariablesForQuestion(q, role);
  const matchedNames = new Set(matched.map(variable => variable.name));
  const preferredMatches = preferred.filter(name => matchedNames.has(name));
  const variables = (preferredMatches.length ? preferredMatches : matched
    .filter(variable => desiredDomain ? variable.domain === desiredDomain : variable.role === (role === "endpoint" ? "outcome" : "measure"))
    .map(variable => variable.name));
  const domain = desiredDomain ?? matched.find(variable => variables.includes(variable.name))?.domain ?? null;
  return {
    label: labelForConcept(domain, variables, role),
    variables: variables.slice(0, role === "endpoint" && domain === "blood_pressure" ? 6 : 4),
    domain,
  };
}

function desiredDomainForQuestion(q: string, role: "exposure" | "endpoint"): string | null {
  if (role === "exposure") {
    if (/\b(self-reported high blood pressure|self reported high blood pressure|told you had high blood pressure|doctor told.*high blood pressure)\b/.test(q)) return "blood_pressure";
    if (q.includes("vitamin d")) return "vitamin_d";
    if (/\b(across hba1c|hba1c categor|glycohemoglobin categor)\b/.test(q)) return "diabetes";
    if (/\b(income-to-poverty|income to poverty|family income|poverty ratio|socioeconomic)\b/.test(q)) return "demographics";
    if (/\b(obesity|obese|bmi|body mass)\b/.test(q)) return "anthropometrics";
    if (/\bsmoking|smoker|cigarette\b/.test(q)) return "smoking";
    if (/\binsurance|coverage|access\b/.test(q)) return "insurance_access";
    return null;
  }
  if (/\bhypertension|blood pressure|systolic|diastolic\b/.test(q)) return "blood_pressure";
  if (/\bkidney|renal|creatinine|albuminuria|egfr\b/.test(q)) return "kidney";
  if (/\bdiabetes|hba1c|glycohemoglobin\b/.test(q)) return "diabetes";
  if (/\blipid|cholesterol|hdl|triglyceride\b/.test(q)) return "lipids";
  return null;
}

function preferredVariablesForQuestion(q: string, role: "exposure" | "endpoint"): string[] {
  if (role === "exposure") {
    if (/\b(self-reported high blood pressure|self reported high blood pressure|told you had high blood pressure|doctor told.*high blood pressure)\b/.test(q)) return ["BPQ020"];
    if (q.includes("vitamin d")) return ["LBXVIDMS"];
    if (/\b(across hba1c|hba1c categor|glycohemoglobin categor)\b/.test(q)) return ["LBXGH"];
    if (/\b(income-to-poverty|income to poverty|family income|poverty ratio|socioeconomic)\b/.test(q)) return ["INDFMPIR"];
    if (/\b(obesity|obese|bmi|body mass)\b/.test(q)) return ["BMXBMI"];
    if (/\bsmoking|smoker|cigarette\b/.test(q)) return ["SMQ020"];
    if (/\binsurance|coverage|access\b/.test(q)) return ["HIQ011"];
    return [];
  }
  if (/\bkidney|renal|creatinine|albuminuria|egfr\b/.test(q)) return ["URDACT", "LBXSCR"];
  if (/\bhba1c|glycohemoglobin|glycated\b/.test(q)) return ["LBXGH"];
  if (/\bdiabetes\b/.test(q)) return ["DIQ010", "LBXGH"];
  if (/\bhypertension|blood pressure|systolic|diastolic\b/.test(q)) {
    return ["BPXDI1", "BPXDI2", "BPXDI3", "BPXSY1", "BPXSY2", "BPXSY3"];
  }
  if (/\blipid|cholesterol|hdl|triglyceride\b/.test(q)) return ["LBXTC", "LBDHDD", "LBXTR"];
  return [];
}

function labelForConcept(domain: string | null, variables: readonly string[], role: "exposure" | "endpoint"): string {
  if (variables.includes("BMXBMI")) return "Body Mass Index";
  if (variables.includes("LBXVIDMS")) return "Vitamin D";
  if (variables.includes("LBXGH")) return "HbA1c";
  if (variables.includes("DIQ010")) return "Diabetes";
  if (variables.includes("BPQ020")) return "Self-Reported Hypertension";
  if (variables.some(variable => variable.startsWith("BPX"))) return "Blood Pressure";
  if (variables.some(variable => ["URDACT", "LBXSCR"].includes(variable))) return "Kidney Markers";
  if (variables.includes("SMQ020")) return "Smoking History";
  if (variables.includes("HIQ011")) return "Health Insurance Coverage";
  if (variables.includes("INDFMPIR")) return "Income-To-Poverty Ratio";
  return domain ? readableDomain(domain) : role === "exposure" ? "Primary exposure" : "Primary endpoint";
}

function pickCovariates(
  question: string,
  matched: NhanesRegistryVariable[],
  excludedVariables: readonly string[] = [],
): string[] {
  const defaults = ["RIDAGEYR", "RIAGENDR", "RIDRETH3"];
  const optional = ["BMXBMI", "INDFMPIR", "SMQ020"].filter(name => {
    const hints = VARIABLE_HINTS[name] ?? [];
    return hints.some(hint => normalize(question).includes(normalize(hint)))
      || matched.some(variable => variable.name === name);
  });
  const excluded = new Set(excludedVariables);
  return unique([...defaults, ...optional]).filter(variable => !excluded.has(variable));
}

function pickStratifiers(question: string): string[] {
  const q = normalize(question);
  if (/\b(differently by sex|by sex|sex strata|stratified by sex|effect modification by sex)\b/.test(q)) {
    return ["RIAGENDR"];
  }
  return [];
}

function buildDerivedDefinitions(
  question: string,
  exposure: LabProtocolDesign["exposure"],
  endpoint: LabProtocolDesign["endpoint"],
): LabProtocolDesign["derivedDefinitions"] {
  const q = normalize(question);
  const definitions: LabProtocolDesign["derivedDefinitions"] = [];
  const add = (definition: LabProtocolDesign["derivedDefinitions"][number]): void => {
    if (!definitions.some(existing => existing.id === definition.id)) definitions.push(definition);
  };

  if (exposure.variables.includes("LBXVIDMS") && /\b(deficien|deficiency|low)\b/.test(q)) {
    add({
      id: "vitamin_d_deficiency",
      label: "Vitamin D deficiency",
      expression: "LBXVIDMS < 50 nmol/L",
      variables: ["LBXVIDMS"],
      role: "exposure",
    });
  }

  if (endpoint.variables.includes("LBXGH") && /\b(hba1c-defined diabetes|diabetes status|diabetes)\b/.test(q)) {
    add({
      id: "hba1c_defined_diabetes",
      label: "HbA1c-defined diabetes",
      expression: "LBXGH >= 6.5%",
      variables: ["LBXGH"],
      role: "endpoint",
    });
  }

  if (exposure.variables.includes("LBXGH") && /\b(across hba1c|hba1c categor|glycohemoglobin categor)\b/.test(q)) {
    add({
      id: "hba1c_categories",
      label: "HbA1c categories",
      expression: "LBXGH < 5.7%, 5.7-6.4%, >= 6.5%",
      variables: ["LBXGH"],
      role: "exposure",
    });
  }

  if (exposure.variables.includes("INDFMPIR") && /\b(income-to-poverty|income to poverty|family income|poverty ratio|socioeconomic)\b/.test(q)) {
    add({
      id: "income_poverty_ratio_categories",
      label: "Income-to-poverty ratio categories",
      expression: "INDFMPIR < 1.3, 1.3-3.5, > 3.5",
      variables: ["INDFMPIR"],
      role: "exposure",
    });
  }

  if (exposure.variables.includes("BPQ020")) {
    add({
      id: "self_reported_hypertension",
      label: "Self-reported hypertension",
      expression: "BPQ020 == 1",
      variables: ["BPQ020"],
      role: "exposure",
    });
  }

  if (endpoint.variables.some(variable => variable.startsWith("BPX")) && /\b(adults|participants|people|persons) with measured hypertension\b/.test(q)) {
    add({
      id: "measured_hypertension",
      label: "Measured hypertension",
      expression: "mean available systolic BP >= 130 mmHg or mean available diastolic BP >= 80 mmHg",
      variables: endpoint.variables,
      role: "filter",
    });
  }

  if (endpoint.variables.some(variable => variable.startsWith("BPX")) && /\buncontrolled blood pressure\b/.test(q)) {
    add({
      id: "uncontrolled_blood_pressure",
      label: "Uncontrolled blood pressure",
      expression: "mean available systolic BP >= 140 mmHg or mean available diastolic BP >= 90 mmHg",
      variables: endpoint.variables,
      role: "endpoint",
    });
  }

  if (endpoint.variables.some(variable => variable.startsWith("BPX")) && /\b(hypertension|blood pressure)\b/.test(q) && !definitions.some(def => def.role === "endpoint" && def.variables.some(variable => variable.startsWith("BPX")))) {
    add({
      id: "measured_hypertension",
      label: "Measured hypertension",
      expression: "mean available systolic BP >= 130 mmHg or mean available diastolic BP >= 80 mmHg",
      variables: endpoint.variables,
      role: "endpoint",
    });
  }

  return definitions;
}

function pickCycles(matched: NhanesRegistryVariable[], registry: NhanesRegistry): string[] {
  const cycleIds = new Set((registry.cycles ?? []).map(cycle => cycle.id));
  if (matched.some(variable => variable.name === "LBXVIDMS") && cycleIds.has("2017-2018")) {
    return ["2017-2018"];
  }
  if (cycleIds.has("2017-2020-prepandemic")) return ["2017-2020-prepandemic"];
  return Array.from(cycleIds).slice(-1);
}

function pickWeightRule(cycles: string[], variables: NhanesRegistryVariable[]): string {
  if (cycles.includes("2017-2020-prepandemic")) return "prepandemic_mec";
  if (variables.some(variable => variable.weightHint === "fasting")) return "fasting";
  return "mec";
}

function validateProtocol(protocol: LabProtocolDesign, registry: NhanesRegistry): LabMedbreviaNhanesResult["diagnostics"] {
  const knownVariables = new Set((registry.variables ?? []).map(variable => variable.name));
  const knownDomains = new Set(Object.keys(registry.domains ?? {}));
  const knownCycles = new Set((registry.cycles ?? []).map(cycle => cycle.id));
  const allVariables = [
    ...protocol.exposure.variables,
    ...protocol.endpoint.variables,
    ...protocol.covariates,
    protocol.surveyDesign.weightVariable,
    protocol.surveyDesign.strataVariable,
    protocol.surveyDesign.psuVariable,
  ].filter((value): value is string => Boolean(value));
  const blockers: Array<{ code: string; message: string }> = [];
  const warnings: Array<{ code: string; message: string }> = [];

  for (const variable of allVariables) {
    if (!knownVariables.has(variable)) blockers.push({ code: "UNKNOWN_VARIABLE", message: `${variable} is not in the NHANES registry.` });
  }
  for (const domain of protocol.approvedDataInputs) {
    if (!knownDomains.has(domain)) blockers.push({ code: "UNKNOWN_DOMAIN", message: `${domain} is not in the NHANES registry.` });
  }
  for (const cycle of protocol.cycles) {
    if (!knownCycles.has(cycle)) blockers.push({ code: "UNKNOWN_CYCLE", message: `${cycle} is not in the NHANES registry.` });
  }
  if (protocol.cycles.includes("2017-2020-prepandemic") && protocol.cycles.length > 1) {
    blockers.push({
      code: "INVALID_PREPANDEMIC_POOLING",
      message: "The pre-pandemic release must not be pooled with standard two-year cycles.",
    });
  }
  if (!protocol.exposure.variables.length) {
    warnings.push({ code: "MISSING_EXPOSURE_VARIABLE", message: "No explicit exposure variable was inferred from the question." });
  }
  if (!protocol.endpoint.variables.length) {
    warnings.push({ code: "MISSING_ENDPOINT_VARIABLE", message: "No explicit endpoint variable was inferred from the question." });
  }

  return {
    matchedVariables: matchVariables(protocol.clinicalQuestion, registry),
    blockers,
    warnings,
  };
}

function renderWorkflowSkeleton(result: LabMedbreviaNhanesResult): string {
  return [
    "title: MedBrevia NHANES research design lab",
    "manifest_id: '@agenteer/node-repair-loop'",
    "correlation: medbrevia-nhanes-lab",
    "model_ids: []",
    "granted:",
    "  - fs.read:*",
    "  - fs.write:*",
    "input:",
    "  note: >",
    "    Placeholder workflow skeleton generated by agenteer lab medbrevia-nhanes.",
    "    The next Agenteer improvement is to replace this with first-class",
    "    registry_load, protocol_validate, cohort_scout, and report_packet nodes.",
    "  protocol:",
    indentYaml(JSON.stringify(result.protocol, null, 2), 4),
    "",
  ].join("\n");
}

function indentYaml(text: string, spaces: number): string {
  const prefix = " ".repeat(spaces);
  return text.split("\n").map(line => `${prefix}${line}`).join("\n");
}

function makeTitle(exposure: string, endpoint: string): string {
  return `${capitalize(exposure)} and ${endpoint}`;
}

function readableDomain(domain: string): string {
  return domain.split("_").map(capitalize).join(" ");
}

function capitalize(value: string): string {
  return value ? `${value[0]!.toUpperCase()}${value.slice(1)}` : value;
}

function normalize(value: string): string {
  return value.toLowerCase().replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim();
}

function unique<T>(values: readonly T[]): T[] {
  return Array.from(new Set(values));
}

function uniqueBy<T>(values: readonly T[], key: (value: T) => string): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const value of values) {
    const k = key(value);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(value);
  }
  return out;
}

function readGitBranch(repoDir: string): string | null {
  try {
    return execFileSync("git", ["branch", "--show-current"], {
      cwd: repoDir,
      encoding: "utf-8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim() || null;
  } catch {
    return null;
  }
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}
