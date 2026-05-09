import { mkdir, mkdtemp, rm, writeFile, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  researchDatasetSpecCommand,
  researchPhenotypeInspectCommand,
  researchPhenotypeListCommand,
  researchPhenotypeMatchCommand,
  researchPhenotypeReviewCommand,
  renderResearchPhenotypeReviewJson,
} from "../src/research-machine/commands.js";
import {
  getPhenotypeDefinition,
  normalizeClinicalCode,
  reviewPhenotypeAgainstRows,
  ruleMatchesCode,
} from "../src/research-machine/phenotypes.js";

describe("research phenotype registry", () => {
  it("ships versioned cardiovascular and dialysis phenotype definitions with source policy", async () => {
    const registry = await researchPhenotypeListCommand();

    expect(registry.phenotypes.map(item => item.phenotypeId)).toEqual(expect.arrayContaining([
      "savr",
      "tavr",
      "hemodialysis",
      "peritoneal_dialysis",
      "myocardial_infarction",
      "ischemic_stroke",
      "heart_failure",
      "aortic_valve_reintervention",
    ]));
    expect(registry.sourcePolicy.authoritativeSources.join(" ")).toContain("CMS");
    expect(registry.sourcePolicy.cptNotice).toContain("CPT");
  });

  it("matches ICD-10-PCS aortic valve replacement by axes instead of unsafe prefixes", () => {
    const tavr = getPhenotypeDefinition("tavr");
    const savr = getPhenotypeDefinition("savr");
    const tavrPcs = tavr.rules.find(rule => rule.id === "tavr-icd10pcs-percutaneous-aortic-replacement");
    const savrPcs = savr.rules.find(rule => rule.id === "savr-icd10pcs-open-aortic-replacement");

    expect(tavrPcs).toBeTruthy();
    expect(savrPcs).toBeTruthy();
    expect(ruleMatchesCode(tavrPcs!, { system: "icd10pcs", code: "02RF38Z", title: "Replacement of aortic valve with zooplastic tissue, percutaneous approach" })).toBe(true);
    expect(ruleMatchesCode(tavrPcs!, { system: "icd10pcs", code: "02RF08Z", title: "Replacement of aortic valve with zooplastic tissue, open approach" })).toBe(false);
    expect(ruleMatchesCode(savrPcs!, { system: "icd10pcs", code: "02RF08Z", title: "Replacement of aortic valve with zooplastic tissue, open approach" })).toBe(true);
  });

  it("reviews dictionaries, reports near-misses, sensitivity coverage, and web/source status", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "agenteer-phenotype-review-"));
    try {
      const dictionary = path.join(dir, "procedures.csv");
      await writeFile(dictionary, [
        "icd_code,icd_version,long_title",
        "02RF38Z,10,Replacement of Aortic Valve with Zooplastic Tissue Percutaneous Approach",
        "02RF08Z,10,Replacement of Aortic Valve with Zooplastic Tissue Open Approach",
        "35.05,9,Endovascular replacement of aortic valve",
        "39.95,9,Hemodialysis",
      ].join("\n"));

      const review = await researchPhenotypeReviewCommand({
        id: "tavr",
        dictionaryPath: dictionary,
        system: "icd10pcs",
        web: true,
        outDir: dir,
      });
      const parsed = JSON.parse(renderResearchPhenotypeReviewJson(review)) as { phenotypeReview: { status: string } };

      expect(review.status).toBe("review");
      expect(review.matchedCodes.map(item => normalizeClinicalCode(item.code))).toContain("02RF38Z");
      expect(review.matchedCodes.map(item => normalizeClinicalCode(item.code))).toContain("3505");
      expect(review.nearMisses.map(item => normalizeClinicalCode(item.code))).toContain("02RF08Z");
      expect(review.codeUsage.some(item => item.normalizedCode === "02RF38Z" && item.matchedRows === 1)).toBe(true);
      expect(review.conceptQaSummary.passed).toBeGreaterThan(0);
      expect(review.promotionGate.promotable).toBe(false);
      expect(review.sensitivitySummaries.some(item => item.id === "narrow-all-positions" && item.matchedCodes > 0)).toBe(true);
      expect(review.webReview.status).toBe("source_links_present");
      expect(parsed.phenotypeReview.status).toBe("review");
      expect(await readFile(path.join(dir, "tavr-phenotype-review.md"), "utf-8")).toContain("Phenotype Review");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("flags semantically contradictory matched code titles instead of trusting code patterns alone", () => {
    const review = reviewPhenotypeAgainstRows(getPhenotypeDefinition("tavr"), [
      { system: "icd10pcs", code: "02RF38Z", title: "Replacement of mitral valve with zooplastic tissue, percutaneous approach" },
    ]);

    expect(review.status).toBe("blocked");
    expect(review.issues.map(issue => issue.code)).toContain("MATCHED_CODE_TITLE_CONTRADICTS_RULE");
    expect(review.matchedCodes[0]?.conceptQa.excludedHits).toContain("mitral");
    expect(review.promotionGate.promotable).toBe(false);
  });

  it("surfaces unmatched lookalike codes as review candidates for missing rules or explicit exclusions", () => {
    const review = reviewPhenotypeAgainstRows(getPhenotypeDefinition("savr"), [
      { system: "cpt", code: "33406", title: "Replacement of aortic valve with annulus enlargement" },
      { system: "cpt", code: "33405", title: "Replacement of aortic valve with prosthetic valve" },
    ]);

    expect(review.matchedCodes.map(item => item.code)).toContain("33405");
    expect(review.unmatchedLookalikes.map(item => item.code)).toContain("33406");
    expect(review.issues.map(issue => issue.code)).toContain("UNMATCHED_LOOKALIKE_CODES");
  });

  it("filters matched codes through named sensitivity definitions", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "agenteer-phenotype-match-"));
    try {
      const dictionary = path.join(dir, "procedures.csv");
      await writeFile(dictionary, [
        "icd_code,icd_version,long_title",
        "33361,0,Transcatheter aortic valve replacement",
        "33369,0,Transcatheter aortic valve replacement add-on",
      ].join("\n"));

      const match = await researchPhenotypeMatchCommand({
        id: "tavr",
        dictionaryPath: dictionary,
        system: "cpt",
        sensitivity: "narrow-all-positions",
      });

      expect(match.matchedCodes.map(item => item.code)).toEqual(["33361"]);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("blocks invalid custom phenotypes before they can masquerade as reviewed", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "agenteer-phenotype-invalid-"));
    try {
      const custom = path.join(dir, "custom.json");
      await writeFile(custom, `${JSON.stringify({
        schemaVersion: 1,
        phenotypeId: "bad_pcs",
        version: "1",
        name: "Bad PCS",
        purpose: "Invalid test phenotype",
        domain: "test",
        author: "test",
        reviewStatus: "draft",
        lastReviewedIso: "2026-05-09T00:00:00.000Z",
        timing: {},
        rules: [{ id: "bad", system: "icd10pcs", match: "range", label: "bad", use: "inclusion", sensitivity: "narrow", timing: "index", evidenceRefs: [], rationale: "bad" }],
        sensitivityDefinitions: [],
        evidenceSources: [],
        inclusionRules: [],
        exclusionRules: [],
        notes: [],
      }, null, 2)}\n`);

      const inspected = await researchPhenotypeInspectCommand({ phenotypePath: custom });

      expect(inspected.validation.status).toBe("blocked");
      expect(inspected.validation.issues.map(issue => issue.code)).toContain("RULE_MISSING_RANGE");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("carries phenotype IDs from study design into dataset AnalysisSpec V2", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "agenteer-phenotype-spec-"));
    try {
      const datasetDir = path.join(dir, "dataset");
      await mkdir(datasetDir);
      await writeFile(path.join(datasetDir, "dataset-manifest.json"), `${JSON.stringify({
        schemaVersion: 1,
        datasetId: "mimic-demo",
        title: "MIMIC demo",
        description: "fixture",
        domain: "ehr",
        source: { kind: "manifest", uri: datasetDir, manifestPath: path.join(datasetDir, "dataset-manifest.json") },
        access: { piiPhiRisk: "high", restrictions: [] },
        tables: [
          { tableId: "hosp-diagnoses-icd", sourcePath: path.join(datasetDir, "diagnoses.csv"), format: "csv", bytes: 1 },
          { tableId: "hosp-d-icd-diagnoses", sourcePath: path.join(datasetDir, "d-diagnoses.csv"), format: "csv", bytes: 1 },
          { tableId: "hosp-procedures-icd", sourcePath: path.join(datasetDir, "procedures.csv"), format: "csv", bytes: 1 },
          { tableId: "hosp-d-icd-procedures", sourcePath: path.join(datasetDir, "d-procedures.csv"), format: "csv", bytes: 1 },
          { tableId: "derived-icustay-detail", sourcePath: path.join(datasetDir, "base.csv"), format: "csv", bytes: 1 },
        ],
      }, null, 2)}\n`);
      const studyPath = path.join(dir, "study.json");
      await writeFile(studyPath, `${JSON.stringify({
        study: {
          id: "tavr-demo",
          title: "TAVR demo",
          question: "Do outcomes differ after TAVR?",
          phenotypes: [{ phenotypeId: "tavr", role: "index" }],
        },
      }, null, 2)}\n`);

      const result = await researchDatasetSpecCommand({ studyPath, datasetDir });

      expect(result.spec.phenotype?.phenotypeIds).toEqual([{ phenotypeId: "tavr", role: "index" }]);
      expect(result.spec.datasetAccess?.requiredTables).toEqual(expect.arrayContaining(["hosp-procedures-icd", "hosp-d-icd-procedures"]));
      expect(result.spec.phenotype?.codingReviewStatus).toBe("needs_clinical_review");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("exposes review primitives for in-memory dictionaries", () => {
    const review = reviewPhenotypeAgainstRows(getPhenotypeDefinition("hemodialysis"), [
      { system: "icd10cm", code: "Z99.2", title: "Dependence on renal dialysis" },
      { system: "icd10cm", code: "Z49.9", title: "Encounter for dialysis, unspecified" },
    ], { web: true });

    expect(review.matchedCodes.map(item => item.code)).toContain("Z99.2");
    expect(review.issues.map(issue => issue.code)).toContain("UNSPECIFIED_DIALYSIS_REVIEW");
  });

  it("contains the manually inserted dialysis and valve code list with QA roles", () => {
    const tavr = getPhenotypeDefinition("tavr");
    const savr = getPhenotypeDefinition("savr");
    const hemodialysis = getPhenotypeDefinition("hemodialysis");
    const peritoneal = getPhenotypeDefinition("peritoneal_dialysis");
    const codesFor = (rules: typeof tavr.rules) => Array.from(new Set(rules.flatMap(rule => [rule.code, rule.start, rule.end].filter((value): value is string => Boolean(value))).map(normalizeClinicalCode)));

    expect(codesFor(tavr.rules)).toEqual(expect.arrayContaining(["3505", "3506"]));
    expect(codesFor(savr.rules)).toEqual(expect.arrayContaining(["3521", "3522"]));
    expect(codesFor(hemodialysis.rules)).toEqual(expect.arrayContaining(["N186", "Z992", "5856", "V4511", "V560", "V561", "V562", "V5631", "V5632", "V568"]));
    expect(codesFor(peritoneal.rules)).toEqual(expect.arrayContaining(["5498", "49324", "49325", "49326", "49418", "49420", "49421", "49422", "49435", "49436", "G0052"]));
    expect(hemodialysis.rules.find(rule => rule.code === "V56.32")?.sensitivity).toBe("supportive");
    expect(peritoneal.rules.find(rule => rule.code === "G0052")?.system).toBe("hcpcs");
  });

  it("re-runs manual dialysis code review against a fixture dictionary", () => {
    const review = reviewPhenotypeAgainstRows(getPhenotypeDefinition("peritoneal_dialysis"), [
      { system: "icd9cm_px", code: "54.98", title: "Peritoneal dialysis" },
      { system: "cpt", code: "49324", title: "Laparoscopy surgical with insertion of intraperitoneal cannula or catheter for dialysis" },
      { system: "cpt", code: "49420", title: "Insertion of tunneled intraperitoneal catheter for dialysis" },
      { system: "hcpcs", code: "G0052", title: "Peritoneal dialysis catheter service" },
      { system: "icd9cm_px", code: "39.95", title: "Hemodialysis" },
    ]);

    expect(review.matchedCodes.map(item => item.normalizedCode)).toEqual(expect.arrayContaining(["5498", "49324", "49420", "G0052"]));
    expect(review.nearMisses.map(item => item.normalizedCode)).toContain("3995");
    expect(review.conceptQaSummary.failed).toBe(0);
  });
});
