import path from "node:path";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { z } from "zod";

export const phenotypeCodeSystemSchema = z.enum(["icd9cm_dx", "icd10cm", "icd9cm_px", "icd10pcs", "cpt", "hcpcs"]);
export type PhenotypeCodeSystem = z.infer<typeof phenotypeCodeSystemSchema>;

export const phenotypeReviewStatusSchema = z.enum(["draft", "needs_clinical_review", "verified_online", "clinician_reviewed", "deprecated"]);
export type PhenotypeReviewStatus = z.infer<typeof phenotypeReviewStatusSchema>;

export const phenotypeMatchKindSchema = z.enum(["exact", "prefix", "range", "regex", "pcs_axis"]);
export type PhenotypeMatchKind = z.infer<typeof phenotypeMatchKindSchema>;

const pcsAxisSchema = z.object({
  section: z.array(z.string()).optional(),
  bodySystem: z.array(z.string()).optional(),
  rootOperation: z.array(z.string()).optional(),
  bodyPart: z.array(z.string()).optional(),
  approach: z.array(z.string()).optional(),
  device: z.array(z.string()).optional(),
  qualifier: z.array(z.string()).optional(),
});
export type PcsAxisConstraint = z.infer<typeof pcsAxisSchema>;

export const phenotypeConceptQaSchema = z.object({
  includeAll: z.array(z.string()).default([]),
  includeAny: z.array(z.string()).default([]),
  exclude: z.array(z.string()).default([]),
  ambiguity: z.array(z.string()).default([]),
  mismatchSeverity: z.enum(["blocker", "warning"]).default("warning"),
});
export type PhenotypeConceptQa = z.infer<typeof phenotypeConceptQaSchema>;

export const phenotypeCodeRuleSchema = z.object({
  id: z.string().min(1),
  system: phenotypeCodeSystemSchema,
  match: phenotypeMatchKindSchema,
  code: z.string().min(1).optional(),
  start: z.string().min(1).optional(),
  end: z.string().min(1).optional(),
  pattern: z.string().min(1).optional(),
  pcsAxes: pcsAxisSchema.optional(),
  label: z.string().min(1),
  use: z.enum(["inclusion", "exclusion", "supportive", "near_miss"]).default("inclusion"),
  sensitivity: z.enum(["narrow", "broad", "supportive"]).default("narrow"),
  primaryPositionOnly: z.boolean().default(false),
  timing: z.enum(["baseline", "index", "post_index", "any"]).default("any"),
  conceptQa: phenotypeConceptQaSchema.default({ includeAll: [], includeAny: [], exclude: [], ambiguity: [], mismatchSeverity: "warning" }),
  evidenceRefs: z.array(z.string()).default([]),
  rationale: z.string().min(1).default("Declared by phenotype definition."),
});
export type PhenotypeCodeRule = z.infer<typeof phenotypeCodeRuleSchema>;

export const phenotypeEvidenceSourceSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  url: z.string().url(),
  sourceType: z.enum(["cms", "cdc-nchs", "nlm", "ama", "paper", "registry", "local-review", "other"]),
  supports: z.array(z.string()).default([]),
  confidence: z.enum(["high", "medium", "low"]).default("medium"),
  checkedAtIso: z.string().min(1),
  note: z.string().optional(),
});
export type PhenotypeEvidenceSource = z.infer<typeof phenotypeEvidenceSourceSchema>;

export const phenotypeSensitivityDefinitionSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  description: z.string().min(1),
  includeSensitivities: z.array(z.enum(["narrow", "broad", "supportive"])).default(["narrow"]),
  systems: z.array(phenotypeCodeSystemSchema).default([]),
  primaryPositionOnly: z.boolean().default(false),
  requireProcedureAndDiagnosis: z.boolean().default(false),
});
export type PhenotypeSensitivityDefinition = z.infer<typeof phenotypeSensitivityDefinitionSchema>;

export const phenotypeTimingSchema = z.object({
  baselineWindow: z.string().default("Codes before or at cohort index only."),
  indexWindow: z.string().default("Codes during the index admission or encounter."),
  outcomeWindow: z.string().default("Codes after index discharge or after the declared landmark."),
  leakageWarnings: z.array(z.string()).default([]),
});
export type PhenotypeTiming = z.infer<typeof phenotypeTimingSchema>;

export const phenotypeDefinitionSchema = z.object({
  schemaVersion: z.literal(1),
  phenotypeId: z.string().min(1),
  version: z.string().min(1),
  name: z.string().min(1),
  purpose: z.string().min(1),
  domain: z.string().min(1),
  author: z.string().min(1),
  reviewStatus: phenotypeReviewStatusSchema,
  lastReviewedIso: z.string().min(1),
  inclusionRules: z.array(z.string()).default([]),
  exclusionRules: z.array(z.string()).default([]),
  timing: phenotypeTimingSchema,
  rules: z.array(phenotypeCodeRuleSchema).min(1),
  sensitivityDefinitions: z.array(phenotypeSensitivityDefinitionSchema).default([]),
  evidenceSources: z.array(phenotypeEvidenceSourceSchema).default([]),
  notes: z.array(z.string()).default([]),
});
export type PhenotypeDefinition = z.infer<typeof phenotypeDefinitionSchema>;

export const phenotypeRegistrySchema = z.object({
  schemaVersion: z.literal(1),
  generatedAtIso: z.string().min(1),
  sourcePolicy: z.object({
    authoritativeSources: z.array(z.string()),
    liveWebReview: z.string(),
    cptNotice: z.string(),
  }),
  phenotypes: z.array(phenotypeDefinitionSchema),
});
export type PhenotypeRegistry = z.infer<typeof phenotypeRegistrySchema>;

export interface CodeDictionaryRow {
  code: string;
  system?: PhenotypeCodeSystem;
  icdVersion?: number;
  title: string;
  position?: number | null;
  raw?: Record<string, unknown>;
}

export interface PhenotypeIssue {
  severity: "blocker" | "warning" | "note";
  code: string;
  message: string;
  evidenceRefs: string[];
}

export interface PhenotypeMatchedCode {
  code: string;
  normalizedCode: string;
  system: PhenotypeCodeSystem;
  title: string;
  ruleId: string;
  ruleLabel: string;
  match: PhenotypeMatchKind;
  sensitivity: "narrow" | "broad" | "supportive";
  timing: "baseline" | "index" | "post_index" | "any";
  position: number | null;
  conceptQa: {
    status: "pass" | "review" | "fail";
    includeAllMissing: string[];
    includeAnyMatched: string[];
    includeAnyRequired: string[];
    excludedHits: string[];
    ambiguityHits: string[];
  };
}

export interface PhenotypeReviewResult {
  schemaVersion: 1;
  phenotype: Pick<PhenotypeDefinition, "phenotypeId" | "version" | "name" | "reviewStatus">;
  status: "pass" | "review" | "blocked";
  dictionaryPath: string | null;
  matchedCodes: PhenotypeMatchedCode[];
  excludedCodes: PhenotypeMatchedCode[];
  nearMisses: Array<{ code: string; normalizedCode: string; system: PhenotypeCodeSystem; title: string; reason: string }>;
  unmatchedLookalikes: Array<{ code: string; normalizedCode: string; system: PhenotypeCodeSystem; title: string; reason: string; suggestedAction: string }>;
  systemCoverage: Array<{ system: PhenotypeCodeSystem; declaredRules: number; matchedCodes: number; status: "matched" | "declared_no_match" | "not_declared" }>;
  sensitivitySummaries: Array<{ id: string; label: string; matchedCodes: number; systems: PhenotypeCodeSystem[]; primaryPositionOnly: boolean }>;
  conceptQaSummary: {
    passed: number;
    review: number;
    failed: number;
    ambiguous: number;
  };
  codeUsage: Array<{ system: PhenotypeCodeSystem; code: string; normalizedCode: string; title: string; matchedRows: number; ruleIds: string[] }>;
  promotionGate: {
    promotable: boolean;
    blockers: string[];
    warnings: string[];
  };
  issues: PhenotypeIssue[];
  webReview: {
    requested: boolean;
    status: "not_requested" | "source_links_present" | "needs_external_search";
    evidenceSourceCount: number;
    authoritativeSourceCount: number;
    sourceUrls: string[];
  };
  outPath: string | null;
  nextAction: string;
}

function nowIso(): string {
  return new Date().toISOString();
}

function evidence(id: string, title: string, url: string, sourceType: PhenotypeEvidenceSource["sourceType"], supports: string[], confidence: PhenotypeEvidenceSource["confidence"] = "high"): PhenotypeEvidenceSource {
  return { id, title, url, sourceType, supports, confidence, checkedAtIso: "2026-05-09" };
}

const authoritativeSources = [
  evidence("cms-icd10", "CMS ICD-10-CM/PCS files", "https://www.cms.gov/Medicare/Coding/ICD10/index", "cms", ["icd10cm", "icd10pcs"]),
  evidence("cdc-icd10cm", "CDC/NCHS ICD-10-CM files", "https://www.cdc.gov/nchs/icd/icd-10-cm/files.html", "cdc-nchs", ["icd10cm"]),
  evidence("cdc-icd9cm", "CDC/NCHS ICD-9-CM archive", "https://archive.cdc.gov/www_cdc_gov/nchs/icd/icd9cm.htm", "cdc-nchs", ["icd9cm_dx", "icd9cm_px"]),
  evidence("cms-hcpcs", "CMS Healthcare Common Procedure Coding System", "https://www.cms.gov/medicare/coding-billing/healthcare-common-procedure-system", "cms", ["hcpcs"]),
  evidence("nlm-icd10cm-api", "NLM Clinical Tables ICD-10-CM API", "https://clinicaltables.nlm.nih.gov/apidoc/icd10cm/v3/doc.html", "nlm", ["icd10cm"], "medium"),
];

function rule(id: string, system: PhenotypeCodeSystem, match: PhenotypeMatchKind, label: string, options: Partial<PhenotypeCodeRule> = {}): PhenotypeCodeRule {
  return phenotypeCodeRuleSchema.parse({
    id,
    system,
    match,
    label,
    code: options.code,
    start: options.start,
    end: options.end,
    pattern: options.pattern,
    pcsAxes: options.pcsAxes,
    use: options.use ?? "inclusion",
    sensitivity: options.sensitivity ?? "narrow",
    primaryPositionOnly: options.primaryPositionOnly ?? false,
    timing: options.timing ?? "any",
    conceptQa: options.conceptQa ?? inferConceptQa(id, label),
    evidenceRefs: options.evidenceRefs ?? ["cms-icd10", "cdc-icd9cm", "cms-hcpcs"],
    rationale: options.rationale ?? label,
  });
}

function inferConceptQa(id: string, label: string): PhenotypeConceptQa {
  const text = `${id} ${label}`.toLowerCase();
  if (text.includes("near-miss") || text.includes("near miss")) return phenotypeConceptQaSchema.parse({});
  if (text.includes("aortic valve") || text.includes("savr") || text.includes("tavr")) {
    const includeAll = ["aortic", "valve"];
    const includeAny = text.includes("tavr") || text.includes("transcatheter") || text.includes("endovascular") || text.includes("percutaneous") || text.includes("transapical")
      ? ["replacement", "transcatheter", "endovascular", "percutaneous", "transapical"]
      : ["replacement", "open", "prosthetic"];
    return phenotypeConceptQaSchema.parse({ includeAll, includeAny, exclude: ["mitral", "tricuspid", "pulmonary"], ambiguity: ["other", "unspecified"] });
  }
  if (text.includes("hemodialysis")) {
    return phenotypeConceptQaSchema.parse({ includeAny: ["hemodialysis", "dialysis", "end stage renal", "renal dialysis"], exclude: ["peritoneal"], ambiguity: ["unspecified"] });
  }
  if (text.includes("peritoneal dialysis")) {
    return phenotypeConceptQaSchema.parse({ includeAll: ["dialysis"], includeAny: ["peritoneal"], exclude: ["hemodialysis"], ambiguity: ["unspecified"] });
  }
  if (text.includes("myocardial infarction") || text.includes("mi-")) {
    return phenotypeConceptQaSchema.parse({ includeAny: ["myocardial infarction", "infarction"], exclude: ["old", "history"], ambiguity: ["subsequent"] });
  }
  if (text.includes("stroke") || text.includes("cerebral infarction")) {
    return phenotypeConceptQaSchema.parse({ includeAny: ["stroke", "infarction", "cerebrovascular", "occlusion"], exclude: ["sequela", "history"], ambiguity: ["ill-defined", "unspecified"] });
  }
  if (text.includes("heart failure")) {
    return phenotypeConceptQaSchema.parse({ includeAll: ["heart"], includeAny: ["failure"], exclude: ["history"], ambiguity: ["unspecified"] });
  }
  return phenotypeConceptQaSchema.parse({});
}

function basePhenotype(input: Omit<PhenotypeDefinition, "schemaVersion" | "author" | "lastReviewedIso" | "evidenceSources" | "timing" | "sensitivityDefinitions" | "notes"> & {
  timing?: Partial<PhenotypeTiming>;
  evidenceSources?: PhenotypeEvidenceSource[];
  sensitivityDefinitions?: PhenotypeSensitivityDefinition[];
  notes?: string[];
}): PhenotypeDefinition {
  return phenotypeDefinitionSchema.parse({
    schemaVersion: 1,
    author: "Agenteer built-in phenotype registry",
    lastReviewedIso: "2026-05-09T00:00:00.000Z",
    evidenceSources: input.evidenceSources ?? authoritativeSources,
    timing: {
      baselineWindow: "Use only codes dated before index or present-on-admission when this phenotype is a baseline covariate.",
      indexWindow: "Use procedure codes during the index admission or encounter when this phenotype defines treatment/exposure.",
      outcomeWindow: "Use codes after index discharge or after the declared landmark when this phenotype defines an outcome.",
      leakageWarnings: [
        "Do not use post-index outcome codes as baseline adjustment variables.",
        "For readmission outcomes, separate same-admission complications from future admissions.",
      ],
      ...input.timing,
    },
    sensitivityDefinitions: input.sensitivityDefinitions ?? [
      { id: "narrow-all-positions", label: "Narrow definition, any position", description: "Use narrow inclusion rules in any diagnosis/procedure position.", includeSensitivities: ["narrow"], systems: [], primaryPositionOnly: false, requireProcedureAndDiagnosis: false },
      { id: "broad-all-positions", label: "Broad definition, any position", description: "Use narrow plus broad rules where declared.", includeSensitivities: ["narrow", "broad"], systems: [], primaryPositionOnly: false, requireProcedureAndDiagnosis: false },
      { id: "primary-position", label: "Primary-position diagnosis sensitivity", description: "Restrict diagnosis rules to primary position when dictionary/event data expose position.", includeSensitivities: ["narrow"], systems: ["icd9cm_dx", "icd10cm"], primaryPositionOnly: true, requireProcedureAndDiagnosis: false },
      { id: "procedure-confirmed", label: "Diagnosis plus procedure-confirmed sensitivity", description: "Require procedure evidence when both diagnosis and procedure rules are declared.", includeSensitivities: ["narrow"], systems: ["icd9cm_px", "icd10pcs", "cpt", "hcpcs"], primaryPositionOnly: false, requireProcedureAndDiagnosis: true },
    ],
    ...input,
  });
}

export const builtInPhenotypes: PhenotypeDefinition[] = [
  basePhenotype({
    phenotypeId: "savr",
    version: "2026.05.09",
    name: "Surgical aortic valve replacement",
    purpose: "Identify open surgical aortic valve replacement procedures for index treatment or reintervention studies.",
    domain: "cardiovascular-procedures",
    reviewStatus: "needs_clinical_review",
    inclusionRules: ["Open surgical aortic valve replacement procedure code during the index admission/encounter."],
    exclusionRules: ["Exclude percutaneous/endovascular aortic valve replacement codes from the narrow SAVR definition."],
    rules: [
      rule("savr-icd9px-3521", "icd9cm_px", "exact", "ICD-9 procedure 35.21/open aortic valve replacement", { code: "35.21", timing: "index" }),
      rule("savr-icd9px-3522", "icd9cm_px", "exact", "ICD-9 procedure 35.22/other aortic valve replacement", { code: "35.22", timing: "index", sensitivity: "broad" }),
      rule("savr-icd10pcs-open-aortic-replacement", "icd10pcs", "pcs_axis", "ICD-10-PCS open replacement of aortic valve", { code: "02RF", pcsAxes: { rootOperation: ["R"], bodyPart: ["F"], approach: ["0"] }, timing: "index" }),
      rule("savr-cpt-33405", "cpt", "exact", "CPT surgical replacement of aortic valve", { code: "33405", timing: "index" }),
      rule("savr-cpt-33410", "cpt", "exact", "CPT surgical replacement of aortic valve", { code: "33410", timing: "index" }),
      rule("savr-cpt-33411", "cpt", "exact", "CPT surgical replacement of aortic valve", { code: "33411", timing: "index" }),
      rule("savr-cpt-33412", "cpt", "exact", "CPT surgical replacement of aortic valve", { code: "33412", timing: "index" }),
      rule("savr-cpt-33413", "cpt", "exact", "CPT surgical replacement of aortic valve", { code: "33413", timing: "index" }),
      rule("savr-near-miss-transcatheter", "icd10pcs", "pcs_axis", "Near miss: transcatheter aortic valve replacement is not SAVR", { code: "02RF", pcsAxes: { rootOperation: ["R"], bodyPart: ["F"], approach: ["3", "4"] }, use: "near_miss", timing: "index" }),
    ],
  }),
  basePhenotype({
    phenotypeId: "tavr",
    version: "2026.05.09",
    name: "Transcatheter aortic valve replacement",
    purpose: "Identify transcatheter/percutaneous aortic valve replacement procedures for index treatment or reintervention studies.",
    domain: "cardiovascular-procedures",
    reviewStatus: "needs_clinical_review",
    inclusionRules: ["Percutaneous/endovascular aortic valve replacement procedure code during the index admission/encounter."],
    exclusionRules: ["Exclude open surgical approach codes from the narrow TAVR definition."],
    rules: [
      rule("tavr-icd9px-3505", "icd9cm_px", "exact", "ICD-9 procedure 35.05 endovascular replacement of aortic valve", { code: "35.05", timing: "index" }),
      rule("tavr-icd9px-3506", "icd9cm_px", "exact", "ICD-9 procedure 35.06 transapical replacement of aortic valve", { code: "35.06", timing: "index" }),
      rule("tavr-icd10pcs-percutaneous-aortic-replacement", "icd10pcs", "pcs_axis", "ICD-10-PCS percutaneous/endoscopic replacement of aortic valve", { code: "02RF", pcsAxes: { rootOperation: ["R"], bodyPart: ["F"], approach: ["3", "4"] }, timing: "index" }),
      rule("tavr-cpt-33361-33366", "cpt", "range", "CPT TAVR procedural family 33361-33366", { start: "33361", end: "33366", timing: "index" }),
      rule("tavr-cpt-33367-33369", "cpt", "range", "CPT TAVR add-on/conversion procedural family 33367-33369", { start: "33367", end: "33369", timing: "index", sensitivity: "broad" }),
      rule("tavr-cpt-cat3-0256t-0259t", "cpt", "range", "Historical Category III transcatheter aortic valve procedure codes", { start: "0256T", end: "0259T", timing: "index", sensitivity: "broad" }),
      rule("tavr-near-miss-open", "icd10pcs", "pcs_axis", "Near miss: open aortic valve replacement is not TAVR", { code: "02RF", pcsAxes: { rootOperation: ["R"], bodyPart: ["F"], approach: ["0"] }, use: "near_miss", timing: "index" }),
    ],
  }),
  basePhenotype({
    phenotypeId: "hemodialysis",
    version: "2026.05.09",
    name: "Hemodialysis or end-stage renal disease treated with hemodialysis",
    purpose: "Identify hemodialysis exposure/status while separating peritoneal and unspecified dialysis where possible.",
    domain: "renal-replacement-therapy",
    reviewStatus: "needs_clinical_review",
    inclusionRules: ["Dialysis status/ESRD diagnosis or hemodialysis procedure evidence before index for baseline status, or during admission for treatment exposure."],
    exclusionRules: ["Flag unspecified dialysis separately when codes do not distinguish hemodialysis from peritoneal dialysis."],
    rules: [
      rule("hd-icd9dx-v4511", "icd9cm_dx", "exact", "ICD-9 diagnosis V45.11 renal dialysis status", { code: "V45.11", timing: "baseline" }),
      rule("hd-icd9dx-v560", "icd9cm_dx", "exact", "ICD-9 diagnosis V56.0 extracorporeal dialysis encounter", { code: "V56.0", timing: "baseline", sensitivity: "broad" }),
      rule("dialysis-icd9dx-v561", "icd9cm_dx", "exact", "ICD-9 diagnosis V56.1 fitting and adjustment of extracorporeal dialysis catheter", { code: "V56.1", timing: "baseline", sensitivity: "supportive", conceptQa: { includeAll: [], includeAny: ["dialysis", "extracorporeal"], exclude: ["peritoneal"], ambiguity: ["fitting", "adjustment"], mismatchSeverity: "warning" } }),
      rule("dialysis-icd9dx-v562", "icd9cm_dx", "exact", "ICD-9 diagnosis V56.2 fitting and adjustment of peritoneal dialysis catheter", { code: "V56.2", timing: "baseline", sensitivity: "supportive", conceptQa: { includeAll: ["dialysis"], includeAny: ["peritoneal", "catheter"], exclude: [], ambiguity: ["fitting", "adjustment"], mismatchSeverity: "warning" } }),
      rule("hd-icd9dx-v5631", "icd9cm_dx", "exact", "ICD-9 diagnosis V56.31 encounter for adequacy testing for hemodialysis", { code: "V56.31", timing: "baseline", sensitivity: "broad", conceptQa: { includeAll: [], includeAny: ["hemodialysis", "dialysis"], exclude: ["peritoneal"], ambiguity: ["adequacy testing"], mismatchSeverity: "warning" } }),
      rule("dialysis-icd9dx-v5632", "icd9cm_dx", "exact", "ICD-9 diagnosis V56.32 encounter for adequacy testing for peritoneal dialysis", { code: "V56.32", timing: "baseline", sensitivity: "supportive", conceptQa: { includeAll: ["dialysis"], includeAny: ["peritoneal"], exclude: ["hemodialysis"], ambiguity: ["adequacy testing"], mismatchSeverity: "warning" } }),
      rule("dialysis-icd9dx-v568", "icd9cm_dx", "exact", "ICD-9 diagnosis V56.8 other dialysis encounter", { code: "V56.8", timing: "baseline", sensitivity: "supportive", conceptQa: { includeAll: [], includeAny: ["dialysis"], exclude: [], ambiguity: ["other", "unspecified"], mismatchSeverity: "warning" } }),
      rule("hd-icd9dx-5856", "icd9cm_dx", "exact", "ICD-9 diagnosis 585.6 end stage renal disease", { code: "585.6", timing: "baseline", sensitivity: "supportive" }),
      rule("hd-icd9px-3995", "icd9cm_px", "exact", "ICD-9 procedure 39.95 hemodialysis", { code: "39.95", timing: "baseline" }),
      rule("hd-icd10dx-z992", "icd10cm", "exact", "ICD-10-CM Z99.2 dependence on renal dialysis", { code: "Z99.2", timing: "baseline" }),
      rule("hd-icd10dx-n186", "icd10cm", "exact", "ICD-10-CM N18.6 end stage renal disease", { code: "N18.6", timing: "baseline", sensitivity: "supportive" }),
      rule("hd-icd10pcs-5a1d", "icd10pcs", "prefix", "ICD-10-PCS performance of urinary filtration/hemodialysis family", { code: "5A1D", timing: "baseline" }),
      rule("hd-unspecified-dialysis-near-miss", "icd10cm", "regex", "Near miss: unspecified dialysis terms need classification review", { pattern: "dialysis", use: "near_miss", timing: "baseline" }),
    ],
  }),
  basePhenotype({
    phenotypeId: "peritoneal_dialysis",
    version: "2026.05.09",
    name: "Peritoneal dialysis",
    purpose: "Identify peritoneal dialysis status or procedure evidence separately from hemodialysis and unspecified dialysis.",
    domain: "renal-replacement-therapy",
    reviewStatus: "needs_clinical_review",
    inclusionRules: ["Peritoneal dialysis status/encounter/procedure evidence before index for baseline status."],
    exclusionRules: ["Exclude hemodialysis procedure-only evidence from the narrow peritoneal dialysis definition."],
    rules: [
      rule("pd-icd9dx-v4512", "icd9cm_dx", "exact", "ICD-9 diagnosis V45.12 noncompliance/peritoneal dialysis status family check", { code: "V45.12", timing: "baseline", sensitivity: "broad" }),
      rule("pd-icd9dx-v5632", "icd9cm_dx", "exact", "ICD-9 diagnosis V56.32 encounter for adequacy testing for peritoneal dialysis", { code: "V56.32", timing: "baseline" }),
      rule("pd-icd9px-5498", "icd9cm_px", "exact", "ICD-9 procedure 54.98 peritoneal dialysis", { code: "54.98", timing: "baseline" }),
      rule("pd-cpt-49324", "cpt", "exact", "CPT laparoscopic insertion of intraperitoneal cannula or catheter for peritoneal dialysis", { code: "49324", timing: "baseline", conceptQa: { includeAll: ["peritoneal"], includeAny: ["dialysis", "catheter", "cannula"], exclude: ["hemodialysis"], ambiguity: [], mismatchSeverity: "warning" } }),
      rule("pd-cpt-49325", "cpt", "exact", "CPT laparoscopic revision/removal of peritoneal dialysis catheter family", { code: "49325", timing: "baseline", sensitivity: "broad", conceptQa: { includeAll: ["peritoneal"], includeAny: ["dialysis", "catheter", "cannula"], exclude: ["hemodialysis"], ambiguity: ["revision", "removal"], mismatchSeverity: "warning" } }),
      rule("pd-cpt-49326", "cpt", "exact", "CPT laparoscopic peritoneal dialysis catheter procedure family", { code: "49326", timing: "baseline", sensitivity: "broad", conceptQa: { includeAll: ["peritoneal"], includeAny: ["dialysis", "catheter", "cannula"], exclude: ["hemodialysis"], ambiguity: ["revision", "removal"], mismatchSeverity: "warning" } }),
      rule("pd-cpt-49418", "cpt", "exact", "CPT tunneled intraperitoneal catheter insertion for dialysis", { code: "49418", timing: "baseline", conceptQa: { includeAll: [], includeAny: ["peritoneal", "intraperitoneal", "dialysis", "catheter"], exclude: ["hemodialysis"], ambiguity: [], mismatchSeverity: "warning" } }),
      rule("pd-cpt-49420", "cpt", "exact", "CPT insertion of tunneled intraperitoneal catheter for dialysis", { code: "49420", timing: "baseline", conceptQa: { includeAll: [], includeAny: ["peritoneal", "intraperitoneal", "dialysis", "catheter"], exclude: ["hemodialysis"], ambiguity: [], mismatchSeverity: "warning" } }),
      rule("pd-cpt-49421", "cpt", "exact", "CPT insertion of tunneled intraperitoneal catheter for dialysis with imaging guidance", { code: "49421", timing: "baseline", sensitivity: "broad", conceptQa: { includeAll: [], includeAny: ["peritoneal", "intraperitoneal", "dialysis", "catheter"], exclude: ["hemodialysis"], ambiguity: [], mismatchSeverity: "warning" } }),
      rule("pd-cpt-49422", "cpt", "exact", "CPT removal of tunneled intraperitoneal catheter", { code: "49422", timing: "baseline", sensitivity: "broad", conceptQa: { includeAll: [], includeAny: ["peritoneal", "intraperitoneal", "dialysis", "catheter"], exclude: ["hemodialysis"], ambiguity: ["removal"], mismatchSeverity: "warning" } }),
      rule("pd-cpt-49435", "cpt", "exact", "CPT radiologic insertion of tunneled intraperitoneal catheter for dialysis", { code: "49435", timing: "baseline", conceptQa: { includeAll: [], includeAny: ["peritoneal", "intraperitoneal", "dialysis", "catheter"], exclude: ["hemodialysis"], ambiguity: [], mismatchSeverity: "warning" } }),
      rule("pd-cpt-49436", "cpt", "exact", "CPT delayed creation of exit site from embedded subcutaneous peritoneal dialysis catheter", { code: "49436", timing: "baseline", sensitivity: "broad", conceptQa: { includeAll: ["peritoneal"], includeAny: ["dialysis", "catheter"], exclude: ["hemodialysis"], ambiguity: ["embedded", "exit site"], mismatchSeverity: "warning" } }),
      rule("pd-hcpcs-g0052", "hcpcs", "exact", "HCPCS peritoneal dialysis catheter procedure/service", { code: "G0052", timing: "baseline", sensitivity: "broad", conceptQa: { includeAll: ["peritoneal"], includeAny: ["dialysis", "catheter"], exclude: ["hemodialysis"], ambiguity: [], mismatchSeverity: "warning" } }),
      rule("pd-icd10dx-z4932", "icd10cm", "exact", "ICD-10-CM Z49.32 encounter for adequacy testing for peritoneal dialysis", { code: "Z49.32", timing: "baseline" }),
      rule("pd-icd10pcs-3e1m", "icd10pcs", "prefix", "ICD-10-PCS peritoneal cavity dialysis/irrigation family", { code: "3E1M", timing: "baseline", sensitivity: "broad" }),
      rule("pd-near-miss-hemodialysis", "icd9cm_px", "exact", "Near miss: hemodialysis is not peritoneal dialysis", { code: "39.95", use: "near_miss", timing: "baseline" }),
    ],
  }),
  basePhenotype({
    phenotypeId: "myocardial_infarction",
    version: "2026.05.09",
    name: "Acute myocardial infarction",
    purpose: "Identify acute myocardial infarction as a baseline comorbidity or post-index MACE outcome.",
    domain: "cardiovascular-outcomes",
    reviewStatus: "needs_clinical_review",
    inclusionRules: ["Acute MI diagnosis in the declared time window."],
    exclusionRules: ["Old/history-of MI codes should be supportive only unless explicitly intended."],
    rules: [
      rule("mi-icd9dx-410", "icd9cm_dx", "prefix", "ICD-9 acute myocardial infarction family 410", { code: "410", timing: "post_index" }),
      rule("mi-icd10dx-i21", "icd10cm", "prefix", "ICD-10-CM acute myocardial infarction family I21", { code: "I21", timing: "post_index" }),
      rule("mi-icd10dx-i22", "icd10cm", "prefix", "ICD-10-CM subsequent myocardial infarction family I22", { code: "I22", timing: "post_index", sensitivity: "broad" }),
      rule("mi-history-near-miss", "icd10cm", "prefix", "Near miss: old myocardial infarction is history, not acute event", { code: "I25.2", use: "near_miss", timing: "baseline" }),
    ],
  }),
  basePhenotype({
    phenotypeId: "ischemic_stroke",
    version: "2026.05.09",
    name: "Stroke",
    purpose: "Identify stroke events for MACE outcome definitions, with ischemic and unspecified sensitivity options.",
    domain: "cardiovascular-neurologic-outcomes",
    reviewStatus: "needs_clinical_review",
    inclusionRules: ["Acute ischemic or unspecified stroke diagnosis in the declared outcome window."],
    exclusionRules: ["History/sequelae codes should not be counted as incident events in narrow outcome definitions."],
    rules: [
      rule("stroke-icd9dx-433", "icd9cm_dx", "prefix", "ICD-9 occlusion/stenosis precerebral arteries with infarction review", { code: "433", timing: "post_index", sensitivity: "broad" }),
      rule("stroke-icd9dx-434", "icd9cm_dx", "prefix", "ICD-9 cerebral artery occlusion with infarction", { code: "434", timing: "post_index" }),
      rule("stroke-icd9dx-436", "icd9cm_dx", "exact", "ICD-9 acute but ill-defined cerebrovascular disease", { code: "436", timing: "post_index", sensitivity: "broad" }),
      rule("stroke-icd10dx-i63", "icd10cm", "prefix", "ICD-10-CM cerebral infarction family I63", { code: "I63", timing: "post_index" }),
      rule("stroke-icd10dx-i64", "icd10cm", "exact", "ICD-10-CM stroke not specified as hemorrhage or infarction", { code: "I64", timing: "post_index", sensitivity: "broad" }),
      rule("stroke-sequela-near-miss", "icd10cm", "prefix", "Near miss: sequelae/history of stroke are not incident stroke", { code: "I69", use: "near_miss", timing: "baseline" }),
    ],
  }),
  basePhenotype({
    phenotypeId: "heart_failure",
    version: "2026.05.09",
    name: "Heart failure",
    purpose: "Identify heart-failure baseline status or post-index heart-failure admission/outcome.",
    domain: "cardiovascular-outcomes",
    reviewStatus: "needs_clinical_review",
    inclusionRules: ["Heart failure diagnosis code in the declared baseline or outcome window."],
    exclusionRules: ["Do not combine baseline heart failure with post-index heart-failure admission without timing separation."],
    rules: [
      rule("hf-icd9dx-428", "icd9cm_dx", "prefix", "ICD-9 heart failure family 428", { code: "428", timing: "any" }),
      rule("hf-icd10dx-i50", "icd10cm", "prefix", "ICD-10-CM heart failure family I50", { code: "I50", timing: "any" }),
      rule("hf-history-near-miss", "icd10cm", "regex", "Near miss: vague cardiac history labels require review", { pattern: "history.*heart failure|personal history", use: "near_miss", timing: "baseline" }),
    ],
  }),
  basePhenotype({
    phenotypeId: "aortic_valve_reintervention",
    version: "2026.05.09",
    name: "Aortic valve reintervention",
    purpose: "Identify post-index repeat TAVR, SAVR, explant, revision, or related aortic valve reoperation.",
    domain: "cardiovascular-procedures",
    reviewStatus: "needs_clinical_review",
    inclusionRules: ["Aortic valve replacement/revision/reoperation code after index discharge or after declared landmark."],
    exclusionRules: ["Exclude the index procedure itself; require event date after index landmark."],
    rules: [
      rule("reint-icd10pcs-repeat-replacement", "icd10pcs", "pcs_axis", "ICD-10-PCS repeat replacement of aortic valve", { code: "02RF", pcsAxes: { rootOperation: ["R"], bodyPart: ["F"] }, timing: "post_index" }),
      rule("reint-icd10pcs-revision-aortic-valve", "icd10pcs", "pcs_axis", "ICD-10-PCS revision of aortic valve substitute", { code: "02WF", pcsAxes: { rootOperation: ["W"], bodyPart: ["F"] }, timing: "post_index", sensitivity: "broad" }),
      rule("reint-icd10pcs-removal-aortic-valve", "icd10pcs", "pcs_axis", "ICD-10-PCS removal of aortic valve substitute", { code: "02PF", pcsAxes: { rootOperation: ["P"], bodyPart: ["F"] }, timing: "post_index", sensitivity: "broad" }),
      rule("reint-icd9px-avr", "icd9cm_px", "range", "ICD-9 aortic valve replacement procedure family", { start: "35.21", end: "35.22", timing: "post_index" }),
      rule("reint-cpt-savr", "cpt", "range", "CPT SAVR family", { start: "33405", end: "33413", timing: "post_index" }),
      rule("reint-cpt-tavr", "cpt", "range", "CPT TAVR family", { start: "33361", end: "33369", timing: "post_index" }),
    ],
  }),
];

export function buildPhenotypeRegistry(): PhenotypeRegistry {
  return phenotypeRegistrySchema.parse({
    schemaVersion: 1,
    generatedAtIso: nowIso(),
    sourcePolicy: {
      authoritativeSources: [
        "CMS ICD-10-CM/PCS and HCPCS sources are authoritative for code set structure.",
        "CDC/NCHS ICD-9-CM archives are authoritative for ICD-9-CM diagnosis/procedure history.",
        "NLM Clinical Tables may be used as a lookup aid but does not replace coding review.",
        "CPT code definitions are AMA-controlled; this registry stores only operational code rules and requires licensed/source review before publication.",
      ],
      liveWebReview: "phenotype-review --web checks whether definitions contain authoritative source links; live literature retrieval should be attached through research literature-search.",
      cptNotice: "CPT labels here are short operational labels only. Validate final CPT definitions against licensed CPT materials or payer/registry specifications.",
    },
    phenotypes: builtInPhenotypes,
  });
}

export function getPhenotypeDefinition(id: string, version?: string): PhenotypeDefinition {
  const matches = builtInPhenotypes.filter(item => item.phenotypeId === id && (!version || item.version === version));
  if (!matches.length) throw new Error(`Unknown phenotype '${id}'. Run 'agenteer research phenotype-list' to see built-ins.`);
  return matches[0]!;
}

export function normalizeClinicalCode(value: unknown): string {
  return String(value ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function numericClinicalCode(value: string): number | null {
  const normalized = normalizeClinicalCode(value).replace(/^V/, "900").replace(/^E/, "800");
  const number = Number.parseInt(normalized.replace(/[^0-9]/g, ""), 10);
  return Number.isFinite(number) ? number : null;
}

function systemFromRow(row: Record<string, unknown>, fallback?: PhenotypeCodeSystem): PhenotypeCodeSystem {
  const explicit = String(row.system ?? row.code_system ?? row.codeSystem ?? "").toLowerCase().replace(/[-\s]/g, "_");
  if (phenotypeCodeSystemSchema.safeParse(explicit).success) return explicit as PhenotypeCodeSystem;
  const icdVersion = Number(row.icd_version ?? row.icdVersion);
  if (fallback === "icd10pcs" || fallback === "icd9cm_px") {
    if (icdVersion === 10) return "icd10pcs";
    if (icdVersion === 9) return "icd9cm_px";
    return fallback;
  }
  if (fallback === "icd10cm" || fallback === "icd9cm_dx") {
    if (icdVersion === 10) return "icd10cm";
    if (icdVersion === 9) return "icd9cm_dx";
    return fallback;
  }
  if (fallback === "cpt" || fallback === "hcpcs") return fallback;
  const type = String(row.type ?? row.code_type ?? row.kind ?? "").toLowerCase();
  if (icdVersion === 10 && /proc|pcs/.test(type)) return "icd10pcs";
  if (icdVersion === 10) return "icd10cm";
  if (icdVersion === 9 && /proc|procedure|px/.test(type)) return "icd9cm_px";
  if (icdVersion === 9) return "icd9cm_dx";
  return fallback ?? "icd10cm";
}

function rowToDictionaryRow(row: Record<string, unknown>, fallbackSystem?: PhenotypeCodeSystem): CodeDictionaryRow {
  const code = String(row.code ?? row.icd_code ?? row.hcpcs_cd ?? row.cpt_code ?? row.procedure_code ?? row.dx_code ?? "");
  const title = String(row.title ?? row.long_title ?? row.short_description ?? row.description ?? row.label ?? "");
  const positionValue = row.position ?? row.seq_num ?? row.seqNumber;
  const position = typeof positionValue === "number" ? positionValue : Number.isFinite(Number(positionValue)) ? Number(positionValue) : null;
  return {
    code,
    system: systemFromRow(row, fallbackSystem),
    icdVersion: Number.isFinite(Number(row.icd_version ?? row.icdVersion)) ? Number(row.icd_version ?? row.icdVersion) : undefined,
    title,
    position,
    raw: row,
  };
}

export function ruleMatchesCode(rule: PhenotypeCodeRule, row: CodeDictionaryRow): boolean {
  if (row.system !== rule.system) return false;
  if (rule.primaryPositionOnly && row.position !== null && row.position !== 1) return false;
  const code = normalizeClinicalCode(row.code);
  const title = row.title.toLowerCase();
  if (!code) return false;
  if (rule.match === "exact") return code === normalizeClinicalCode(rule.code);
  if (rule.match === "prefix") return code.startsWith(normalizeClinicalCode(rule.code));
  if (rule.match === "range") {
    const current = numericClinicalCode(code);
    const start = numericClinicalCode(rule.start ?? "");
    const end = numericClinicalCode(rule.end ?? "");
    return current !== null && start !== null && end !== null && current >= start && current <= end;
  }
  if (rule.match === "regex") {
    const pattern = new RegExp(rule.pattern ?? "", "i");
    return pattern.test(row.code) || pattern.test(row.title) || pattern.test(title);
  }
  if (rule.match === "pcs_axis") {
    if (rule.system !== "icd10pcs" || code.length < 7) return false;
    const prefix = normalizeClinicalCode(rule.code);
    if (prefix && !code.startsWith(prefix)) return false;
    const axes = rule.pcsAxes ?? {};
    const values: Record<keyof PcsAxisConstraint, string> = {
      section: code[0] ?? "",
      bodySystem: code[1] ?? "",
      rootOperation: code[2] ?? "",
      bodyPart: code[3] ?? "",
      approach: code[4] ?? "",
      device: code[5] ?? "",
      qualifier: code[6] ?? "",
    };
    return (Object.entries(axes) as Array<[keyof PcsAxisConstraint, string[] | undefined]>).every(([axis, allowed]) => {
      if (!allowed?.length) return true;
      return allowed.map(normalizeClinicalCode).includes(values[axis]);
    });
  }
  return false;
}

function normalizedText(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
}

function termHits(text: string, terms: string[]): string[] {
  const normalized = normalizedText(text);
  return terms.filter(term => normalized.includes(normalizedText(term)));
}

function evaluateConceptQa(rule: PhenotypeCodeRule, row: CodeDictionaryRow): PhenotypeMatchedCode["conceptQa"] {
  const qa = phenotypeConceptQaSchema.parse(rule.conceptQa ?? {});
  const includeAllMissing = qa.includeAll.filter(term => !normalizedText(row.title).includes(normalizedText(term)));
  const includeAnyMatched = termHits(row.title, qa.includeAny);
  const includeAnyRequired = qa.includeAny;
  const excludedHits = termHits(row.title, qa.exclude);
  const ambiguityHits = termHits(row.title, qa.ambiguity);
  const missingAny = qa.includeAny.length > 0 && includeAnyMatched.length === 0;
  const missingExpected = includeAllMissing.length > 0 || missingAny;
  const status = excludedHits.length > 0 || (missingExpected && qa.mismatchSeverity === "blocker")
    ? "fail"
    : missingExpected || ambiguityHits.length > 0
      ? "review"
      : "pass";
  return { status, includeAllMissing, includeAnyMatched, includeAnyRequired, excludedHits, ambiguityHits };
}

function phenotypeLookalikeTerms(definition: PhenotypeDefinition): string[] {
  const fromRules = definition.rules.flatMap(rule => [
    ...rule.conceptQa.includeAll,
    ...rule.conceptQa.includeAny,
  ]);
  const fromName = definition.name.split(/\s+/).filter(term => term.length > 3);
  return Array.from(new Set([...fromRules, ...fromName].map(normalizedText).filter(term => term.length > 3)));
}

export function validatePhenotypeDefinition(definition: PhenotypeDefinition): PhenotypeIssue[] {
  const parsed = phenotypeDefinitionSchema.safeParse(definition);
  const issues: PhenotypeIssue[] = [];
  if (!parsed.success) {
    issues.push({ severity: "blocker", code: "PHENOTYPE_SCHEMA_INVALID", message: parsed.error.issues.map(issue => `${issue.path.join(".")}: ${issue.message}`).join("; "), evidenceRefs: [] });
    return issues;
  }
  const duplicateKeys = new Set<string>();
  const seen = new Set<string>();
  for (const item of definition.rules) {
    const key = `${item.system}:${item.match}:${item.code ?? ""}:${item.start ?? ""}:${item.end ?? ""}:${item.pattern ?? ""}:${JSON.stringify(item.pcsAxes ?? {})}:${item.use}`;
    if (seen.has(key)) duplicateKeys.add(key);
    seen.add(key);
    if ((item.match === "exact" || item.match === "prefix" || item.match === "pcs_axis") && !item.code) {
      issues.push({ severity: "blocker", code: "RULE_MISSING_CODE", message: `Rule ${item.id} needs a code for ${item.match} matching.`, evidenceRefs: item.evidenceRefs });
    }
    if (item.match === "range" && (!item.start || !item.end)) {
      issues.push({ severity: "blocker", code: "RULE_MISSING_RANGE", message: `Rule ${item.id} needs start and end for range matching.`, evidenceRefs: item.evidenceRefs });
    }
    if (item.match === "regex" && !item.pattern) {
      issues.push({ severity: "blocker", code: "RULE_MISSING_REGEX", message: `Rule ${item.id} needs a pattern for regex matching.`, evidenceRefs: item.evidenceRefs });
    }
    if (item.system === "icd10pcs" && item.match === "prefix" && item.use === "inclusion") {
      issues.push({ severity: "warning", code: "PCS_PREFIX_WITHOUT_AXIS_CONSTRAINTS", message: `Rule ${item.id} uses ICD-10-PCS prefix matching without axis constraints; prefer pcs_axis for serious procedure phenotypes.`, evidenceRefs: item.evidenceRefs });
    }
    if (item.evidenceRefs.length === 0) {
      issues.push({ severity: "warning", code: "RULE_MISSING_EVIDENCE_REF", message: `Rule ${item.id} has no evidence reference.`, evidenceRefs: [] });
    }
    const conceptQa = phenotypeConceptQaSchema.parse(item.conceptQa ?? {});
    if ((item.use === "inclusion" || item.use === "supportive") && conceptQa.includeAll.length === 0 && conceptQa.includeAny.length === 0) {
      issues.push({ severity: "warning", code: "RULE_MISSING_CONCEPT_QA", message: `Rule ${item.id} does not declare expected title/concept terms, so dataset dictionary validation cannot detect semantic drift.`, evidenceRefs: item.evidenceRefs });
    }
  }
  for (const key of duplicateKeys) {
    issues.push({ severity: "warning", code: "DUPLICATE_RULE", message: `Duplicate code rule detected: ${key}.`, evidenceRefs: [] });
  }
  const evidenceIds = new Set(definition.evidenceSources.map(source => source.id));
  const missingEvidence = definition.rules.flatMap(item => item.evidenceRefs).filter(ref => !evidenceIds.has(ref));
  if (missingEvidence.length) {
    issues.push({ severity: "warning", code: "UNKNOWN_EVIDENCE_REF", message: `Rules reference missing evidence source ids: ${Array.from(new Set(missingEvidence)).join(", ")}.`, evidenceRefs: [] });
  }
  if (definition.reviewStatus === "draft" || definition.reviewStatus === "needs_clinical_review") {
    issues.push({ severity: "warning", code: "PHENOTYPE_REQUIRES_REVIEW", message: `Phenotype ${definition.phenotypeId} is ${definition.reviewStatus}; serious analyses should carry this as a methods limitation.`, evidenceRefs: definition.evidenceSources.map(source => source.url) });
  }
  return issues;
}

export function reviewPhenotypeAgainstRows(definition: PhenotypeDefinition, rows: CodeDictionaryRow[], opts: { dictionaryPath?: string; web?: boolean } = {}): PhenotypeReviewResult {
  const issues = validatePhenotypeDefinition(definition);
  const matchedCodes: PhenotypeMatchedCode[] = [];
  const excludedCodes: PhenotypeMatchedCode[] = [];
  const nearMisses: PhenotypeReviewResult["nearMisses"] = [];
  const matchedRowKeys = new Set<string>();
  for (const row of rows) {
    const rowMatches = definition.rules.filter(item => ruleMatchesCode(item, row));
    for (const item of rowMatches) {
      matchedRowKeys.add(`${row.system}:${normalizeClinicalCode(row.code)}:${row.title}`);
      const matched: PhenotypeMatchedCode = {
        code: row.code,
        normalizedCode: normalizeClinicalCode(row.code),
        system: row.system ?? item.system,
        title: row.title,
        ruleId: item.id,
        ruleLabel: item.label,
        match: item.match,
        sensitivity: item.sensitivity,
        timing: item.timing,
        position: row.position ?? null,
        conceptQa: evaluateConceptQa(item, row),
      };
      if (item.use === "exclusion") excludedCodes.push(matched);
      else if (item.use === "near_miss") nearMisses.push({ code: row.code, normalizedCode: normalizeClinicalCode(row.code), system: row.system ?? item.system, title: row.title, reason: item.label });
      else matchedCodes.push(matched);
    }
  }
  const unmatchedLookalikes = rows
    .filter(row => !matchedRowKeys.has(`${row.system}:${normalizeClinicalCode(row.code)}:${row.title}`))
    .map(row => {
      const hits = termHits(row.title, phenotypeLookalikeTerms(definition));
      return { row, hits };
    })
    .filter(item => item.hits.length >= 2 || item.hits.some(hit => ["dialysis", "infarction", "stroke", "failure"].includes(hit)))
    .slice(0, 200)
    .map(item => ({
      code: item.row.code,
      normalizedCode: normalizeClinicalCode(item.row.code),
      system: item.row.system ?? "icd10cm",
      title: item.row.title,
      reason: `Unmatched dictionary label contains phenotype-like terms: ${item.hits.join(", ")}.`,
      suggestedAction: "Review as a possible missing rule, explicit exclusion, or near-miss.",
    }));
  if (unmatchedLookalikes.length) {
    issues.push({ severity: "warning", code: "UNMATCHED_LOOKALIKE_CODES", message: `${unmatchedLookalikes.length} unmatched code label(s) look semantically related to the phenotype.`, evidenceRefs: [opts.dictionaryPath ?? "dictionary"] });
  }
  const failedConceptQa = matchedCodes.filter(item => item.conceptQa.status === "fail");
  const reviewConceptQa = matchedCodes.filter(item => item.conceptQa.status === "review");
  if (failedConceptQa.length) {
    issues.push({ severity: "blocker", code: "MATCHED_CODE_TITLE_CONTRADICTS_RULE", message: `${failedConceptQa.length} matched code label(s) contradicted rule concept QA.`, evidenceRefs: [opts.dictionaryPath ?? "dictionary"] });
  }
  if (reviewConceptQa.length) {
    issues.push({ severity: "warning", code: "MATCHED_CODE_TITLE_NEEDS_REVIEW", message: `${reviewConceptQa.length} matched code label(s) had missing expected terms or ambiguity terms.`, evidenceRefs: [opts.dictionaryPath ?? "dictionary"] });
  }
  const declaredSystems = Array.from(new Set(definition.rules.filter(item => item.use !== "near_miss").map(item => item.system)));
  const allSystems = Array.from(new Set([...declaredSystems, ...rows.map(row => row.system).filter(Boolean) as PhenotypeCodeSystem[]])).sort();
  const systemCoverage = allSystems.map(system => {
    const declaredRules = definition.rules.filter(item => item.system === system && item.use !== "near_miss").length;
    const matches = matchedCodes.filter(item => item.system === system).length;
    return { system, declaredRules, matchedCodes: matches, status: declaredRules === 0 ? "not_declared" as const : matches > 0 ? "matched" as const : "declared_no_match" as const };
  });
  for (const coverage of systemCoverage) {
    if (coverage.declaredRules > 0 && coverage.matchedCodes === 0 && rows.some(row => row.system === coverage.system)) {
      issues.push({ severity: "warning", code: "DECLARED_SYSTEM_NO_MATCH", message: `${coverage.system} rules were declared but matched no dictionary rows.`, evidenceRefs: [opts.dictionaryPath ?? "dictionary"] });
    }
  }
  if (!matchedCodes.length && rows.length) {
    issues.push({ severity: "blocker", code: "PHENOTYPE_MATCHED_NO_CODES", message: "Phenotype matched no codes in the supplied dictionary/event rows.", evidenceRefs: [opts.dictionaryPath ?? "dictionary"] });
  }
  if (definition.phenotypeId.includes("dialysis")) {
    const ambiguous = rows.filter(row => /dialysis/i.test(row.title) && !/hemo|peritoneal/i.test(row.title));
    if (ambiguous.length) {
      issues.push({ severity: "warning", code: "UNSPECIFIED_DIALYSIS_REVIEW", message: `${ambiguous.length} dialysis-like code label(s) did not specify hemodialysis or peritoneal dialysis.`, evidenceRefs: [opts.dictionaryPath ?? "dictionary"] });
    }
  }
  const sensitivitySummaries = definition.sensitivityDefinitions.map(sensitivity => {
    const allowedSystems = sensitivity.systems.length ? sensitivity.systems : declaredSystems;
    const allowedSensitivities = new Set(sensitivity.includeSensitivities);
    const count = matchedCodes.filter(item => allowedSystems.includes(item.system) && allowedSensitivities.has(item.sensitivity) && (!sensitivity.primaryPositionOnly || item.position === 1 || item.position === null)).length;
    return { id: sensitivity.id, label: sensitivity.label, matchedCodes: count, systems: allowedSystems, primaryPositionOnly: sensitivity.primaryPositionOnly };
  });
  const conceptQaSummary = {
    passed: matchedCodes.filter(item => item.conceptQa.status === "pass").length,
    review: reviewConceptQa.length,
    failed: failedConceptQa.length,
    ambiguous: matchedCodes.filter(item => item.conceptQa.ambiguityHits.length > 0).length,
  };
  const codeUsage = Array.from(matchedCodes.reduce((acc, item) => {
    const key = `${item.system}:${item.normalizedCode}:${item.title}`;
    const current = acc.get(key) ?? { system: item.system, code: item.code, normalizedCode: item.normalizedCode, title: item.title, matchedRows: 0, ruleIds: new Set<string>() };
    current.matchedRows += 1;
    current.ruleIds.add(item.ruleId);
    acc.set(key, current);
    return acc;
  }, new Map<string, { system: PhenotypeCodeSystem; code: string; normalizedCode: string; title: string; matchedRows: number; ruleIds: Set<string> }>()).values())
    .map(item => ({ ...item, ruleIds: Array.from(item.ruleIds).sort() }))
    .sort((a, b) => b.matchedRows - a.matchedRows || a.normalizedCode.localeCompare(b.normalizedCode));
  const authoritativeSourceCount = definition.evidenceSources.filter(source => source.confidence === "high" && ["cms", "cdc-nchs", "nlm", "ama"].includes(source.sourceType)).length;
  const webReview = {
    requested: opts.web === true,
    status: opts.web === true ? authoritativeSourceCount > 0 ? "source_links_present" as const : "needs_external_search" as const : "not_requested" as const,
    evidenceSourceCount: definition.evidenceSources.length,
    authoritativeSourceCount,
    sourceUrls: definition.evidenceSources.map(source => source.url),
  };
  if (opts.web && authoritativeSourceCount === 0) {
    issues.push({ severity: "warning", code: "WEB_REVIEW_NEEDS_AUTHORITATIVE_SOURCE", message: "Web review was requested, but no authoritative CMS/CDC/NLM/AMA source links are attached.", evidenceRefs: [] });
  }
  const status = issues.some(item => item.severity === "blocker") ? "blocked" : issues.some(item => item.severity === "warning") ? "review" : "pass";
  const promotionGate = {
    promotable: status === "pass" && definition.reviewStatus !== "draft" && definition.reviewStatus !== "needs_clinical_review",
    blockers: issues.filter(item => item.severity === "blocker").map(item => item.code),
    warnings: issues.filter(item => item.severity === "warning").map(item => item.code),
  };
  return {
    schemaVersion: 1,
    phenotype: {
      phenotypeId: definition.phenotypeId,
      version: definition.version,
      name: definition.name,
      reviewStatus: definition.reviewStatus,
    },
    status,
    dictionaryPath: opts.dictionaryPath ? path.resolve(opts.dictionaryPath) : null,
    matchedCodes,
    excludedCodes,
    nearMisses,
    unmatchedLookalikes,
    systemCoverage,
    sensitivitySummaries,
    conceptQaSummary,
    codeUsage,
    promotionGate,
    issues,
    webReview,
    outPath: null,
    nextAction: status === "blocked"
      ? "Fix blocking phenotype/dictionary issues before cohort construction."
      : status === "review"
        ? "Review warnings, near-misses, and sensitivity definitions before promoting results."
        : "Phenotype review passed for this dictionary; attach the artifact to the study packet.",
  };
}

async function parseDictionaryFile(filePath: string, fallbackSystem?: PhenotypeCodeSystem): Promise<CodeDictionaryRow[]> {
  const resolved = path.resolve(filePath);
  const raw = await readFile(resolved, "utf-8");
  if (resolved.endsWith(".json")) {
    const parsed = JSON.parse(raw) as unknown;
    const rows: unknown[] = Array.isArray(parsed)
      ? parsed as unknown[]
      : Array.isArray((parsed as Record<string, unknown>).rows)
        ? (parsed as Record<string, unknown>).rows as unknown[]
        : Array.isArray((parsed as Record<string, unknown>).codes)
          ? (parsed as Record<string, unknown>).codes as unknown[]
          : [];
    return rows.filter((row): row is Record<string, unknown> => Boolean(row && typeof row === "object")).map(row => rowToDictionaryRow(row, fallbackSystem));
  }
  const [headerLine = "", ...lines] = raw.split(/\r?\n/).filter(line => line.trim().length > 0);
  const headers = splitCsvLine(headerLine).map(item => item.trim());
  return lines.map(line => {
    const values = splitCsvLine(line);
    const row: Record<string, unknown> = {};
    headers.forEach((header, index) => { row[header] = values[index] ?? ""; });
    return rowToDictionaryRow(row, fallbackSystem);
  });
}

function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let current = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index]!;
    if (char === '"' && line[index + 1] === '"') {
      current += '"';
      index += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === "," && !quoted) {
      out.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  out.push(current);
  return out;
}

async function readPhenotypeFile(filePath: string): Promise<PhenotypeDefinition> {
  const raw = await readFile(path.resolve(filePath), "utf-8");
  return phenotypeDefinitionSchema.parse(JSON.parse(raw));
}

export async function researchPhenotypeListCommand(opts: { outPath?: string } = {}): Promise<PhenotypeRegistry & { outPath: string | null }> {
  const registry = buildPhenotypeRegistry();
  const outPath = opts.outPath ? path.resolve(opts.outPath) : null;
  if (outPath) {
    await mkdir(path.dirname(outPath), { recursive: true });
    await writeFile(outPath, `${JSON.stringify(registry, null, 2)}\n`);
  }
  return { ...registry, outPath };
}

export async function researchPhenotypeInspectCommand(opts: { id?: string; version?: string; phenotypePath?: string; outPath?: string }): Promise<{ schemaVersion: 1; phenotype: PhenotypeDefinition; validation: { status: "pass" | "review" | "blocked"; issues: PhenotypeIssue[] }; outPath: string | null }> {
  const phenotype = opts.phenotypePath ? await readPhenotypeFile(opts.phenotypePath) : getPhenotypeDefinition(opts.id ?? "");
  const issues = validatePhenotypeDefinition(phenotype);
  const validation = { status: issues.some(item => item.severity === "blocker") ? "blocked" as const : issues.some(item => item.severity === "warning") ? "review" as const : "pass" as const, issues };
  const result = { schemaVersion: 1 as const, phenotype, validation, outPath: opts.outPath ? path.resolve(opts.outPath) : null };
  if (result.outPath) {
    await mkdir(path.dirname(result.outPath), { recursive: true });
    await writeFile(result.outPath, `${JSON.stringify(result, null, 2)}\n`);
  }
  return result;
}

export async function researchPhenotypeReviewCommand(opts: { id?: string; version?: string; phenotypePath?: string; dictionaryPath: string; system?: PhenotypeCodeSystem; web?: boolean; outDir?: string; outPath?: string }): Promise<PhenotypeReviewResult> {
  const phenotype = opts.phenotypePath ? await readPhenotypeFile(opts.phenotypePath) : getPhenotypeDefinition(opts.id ?? "", opts.version);
  const rows = await parseDictionaryFile(opts.dictionaryPath, opts.system);
  const reviewed = reviewPhenotypeAgainstRows(phenotype, rows, { dictionaryPath: opts.dictionaryPath, web: opts.web });
  const outPath = opts.outPath
    ? path.resolve(opts.outPath)
    : opts.outDir
      ? path.join(path.resolve(opts.outDir), `${phenotype.phenotypeId}-phenotype-review.json`)
      : null;
  const result = { ...reviewed, outPath };
  if (outPath) {
    await mkdir(path.dirname(outPath), { recursive: true });
    await writeFile(outPath, `${JSON.stringify(result, null, 2)}\n`);
    await writeFile(outPath.replace(/\.json$/i, ".md"), renderResearchPhenotypeReview(result), "utf-8");
  }
  return result;
}

export async function researchPhenotypeMatchCommand(opts: { id?: string; version?: string; phenotypePath?: string; dictionaryPath: string; system?: PhenotypeCodeSystem; sensitivity?: string; outPath?: string }): Promise<{ schemaVersion: 1; phenotypeId: string; version: string; sensitivity: string | null; matchedCodes: PhenotypeMatchedCode[]; outPath: string | null }> {
  const phenotype = opts.phenotypePath ? await readPhenotypeFile(opts.phenotypePath) : getPhenotypeDefinition(opts.id ?? "", opts.version);
  const rows = await parseDictionaryFile(opts.dictionaryPath, opts.system);
  const review = reviewPhenotypeAgainstRows(phenotype, rows, { dictionaryPath: opts.dictionaryPath });
  const sensitivity = opts.sensitivity ? phenotype.sensitivityDefinitions.find(item => item.id === opts.sensitivity) : null;
  const matchedCodes = sensitivity
    ? review.matchedCodes.filter(item => {
      const systems = sensitivity.systems.length ? sensitivity.systems : phenotype.rules.map(rule => rule.system);
      return systems.includes(item.system) && sensitivity.includeSensitivities.includes(item.sensitivity) && (!sensitivity.primaryPositionOnly || item.position === 1 || item.position === null);
    })
    : review.matchedCodes;
  const result = { schemaVersion: 1 as const, phenotypeId: phenotype.phenotypeId, version: phenotype.version, sensitivity: sensitivity?.id ?? null, matchedCodes, outPath: opts.outPath ? path.resolve(opts.outPath) : null };
  if (result.outPath) {
    await mkdir(path.dirname(result.outPath), { recursive: true });
    await writeFile(result.outPath, `${JSON.stringify(result, null, 2)}\n`);
  }
  return result;
}

export function renderResearchPhenotypeList(registry: PhenotypeRegistry & { outPath?: string | null }): string {
  const lines = [
    "research phenotype registry",
    `  phenotypes: ${registry.phenotypes.length}`,
    `  out: ${registry.outPath ?? "(not written)"}`,
  ];
  for (const item of registry.phenotypes) {
    lines.push(`  - ${item.phenotypeId}@${item.version}: ${item.name} [${item.reviewStatus}]`);
  }
  return lines.join("\n");
}

export function renderResearchPhenotypeListJson(registry: PhenotypeRegistry & { outPath?: string | null }): string {
  return `${JSON.stringify({ schemaVersion: 1, phenotypeRegistry: registry }, null, 2)}\n`;
}

export function renderResearchPhenotypeInspect(result: Awaited<ReturnType<typeof researchPhenotypeInspectCommand>>): string {
  return [
    `research phenotype: ${result.phenotype.phenotypeId}@${result.phenotype.version}`,
    `  name: ${result.phenotype.name}`,
    `  review: ${result.phenotype.reviewStatus}`,
    `  rules: ${result.phenotype.rules.length}`,
    `  validation: ${result.validation.status}; issues=${result.validation.issues.map(issue => issue.code).join(",") || "(none)"}`,
    `  out: ${result.outPath ?? "(not written)"}`,
  ].join("\n");
}

export function renderResearchPhenotypeInspectJson(result: Awaited<ReturnType<typeof researchPhenotypeInspectCommand>>): string {
  return `${JSON.stringify({ schemaVersion: 1, phenotypeInspect: result }, null, 2)}\n`;
}

export function renderResearchPhenotypeReview(result: PhenotypeReviewResult): string {
  const lines = [
    `# Phenotype Review: ${result.phenotype.name}`,
    "",
    `Phenotype: \`${result.phenotype.phenotypeId}@${result.phenotype.version}\`.`,
    `Status: **${result.status}**.`,
    `Dictionary: \`${result.dictionaryPath ?? "(none)"}\`.`,
    "",
    "## Matched Codes",
    "",
    "| System | Code | Rule | Label | Timing | Sensitivity |",
    "| --- | --- | --- | --- | --- | --- |",
    ...result.matchedCodes.slice(0, 200).map(item => `| ${item.system} | ${item.code} | ${item.ruleId} | ${item.title.replace(/\|/g, "/")} | ${item.timing} | ${item.sensitivity} |`),
    result.matchedCodes.length > 200 ? `| ... | ${result.matchedCodes.length - 200} additional matched codes omitted from markdown | ... | ... | ... | ... |` : "",
    "",
    "## Near Misses",
    "",
    ...(result.nearMisses.length ? result.nearMisses.map(item => `- ${item.system} ${item.code}: ${item.title} (${item.reason})`) : ["- None detected."]),
    "",
    "## Unmatched Lookalikes",
    "",
    ...(result.unmatchedLookalikes.length ? result.unmatchedLookalikes.map(item => `- ${item.system} ${item.code}: ${item.title}. ${item.suggestedAction}`) : ["- None detected."]),
    "",
    "## Concept QA",
    "",
    `Passed: ${result.conceptQaSummary.passed}; review: ${result.conceptQaSummary.review}; failed: ${result.conceptQaSummary.failed}; ambiguous: ${result.conceptQaSummary.ambiguous}.`,
    "",
    "## Code Usage",
    "",
    ...result.codeUsage.slice(0, 50).map(item => `- ${item.system} ${item.code}: ${item.matchedRows} matched row(s); rules=${item.ruleIds.join(",")}.`),
    result.codeUsage.length > 50 ? `- ${result.codeUsage.length - 50} additional code usage rows omitted from markdown.` : "",
    "",
    "## Sensitivity Definitions",
    "",
    ...result.sensitivitySummaries.map(item => `- ${item.id}: ${item.matchedCodes} matched code(s); systems=${item.systems.join(",") || "all"}; primaryPositionOnly=${item.primaryPositionOnly}.`),
    "",
    "## Issues",
    "",
    ...(result.issues.length ? result.issues.map(item => `- ${item.severity.toUpperCase()} ${item.code}: ${item.message}`) : ["- None."]),
    "",
    "## Promotion Gate",
    "",
    `Promotable: ${result.promotionGate.promotable}.`,
    `Blockers: ${result.promotionGate.blockers.join(", ") || "(none)"}.`,
    `Warnings: ${result.promotionGate.warnings.join(", ") || "(none)"}.`,
    "",
    "## Source Review",
    "",
    `Web/source review requested: ${result.webReview.requested}.`,
    `Authoritative source links attached: ${result.webReview.authoritativeSourceCount}.`,
    ...result.webReview.sourceUrls.map(url => `- ${url}`),
    "",
    `Next action: ${result.nextAction}`,
    "",
  ].filter(Boolean);
  return `${lines.join("\n")}\n`;
}

export function renderResearchPhenotypeReviewJson(result: PhenotypeReviewResult): string {
  return `${JSON.stringify({ schemaVersion: 1, phenotypeReview: result }, null, 2)}\n`;
}

export function renderResearchPhenotypeMatch(result: Awaited<ReturnType<typeof researchPhenotypeMatchCommand>>): string {
  return [
    `research phenotype match: ${result.phenotypeId}@${result.version}`,
    `  sensitivity: ${result.sensitivity ?? "(all)"}`,
    `  matched codes: ${result.matchedCodes.length}`,
    `  out: ${result.outPath ?? "(not written)"}`,
  ].join("\n");
}

export function renderResearchPhenotypeMatchJson(result: Awaited<ReturnType<typeof researchPhenotypeMatchCommand>>): string {
  return `${JSON.stringify({ schemaVersion: 1, phenotypeMatch: result }, null, 2)}\n`;
}
