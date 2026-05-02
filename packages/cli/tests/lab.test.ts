import { mkdtemp, rm, writeFile, mkdir } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  labMedbreviaNhanesCommand,
  renderLabMedbreviaNhanesResult,
} from "../src/commands/lab.js";

const REGISTRY = {
  dataset: "nhanes",
  version: "test-registry",
  cycles: [
    { id: "2017-2018", label: "2017-2018" },
    { id: "2017-2020-prepandemic", label: "2017-March 2020 pre-pandemic" },
  ],
  domains: {
    demographics: { label: "Demographics" },
    vitamin_d: { label: "Vitamin D" },
    blood_pressure: { label: "Blood pressure" },
    anthropometrics: { label: "Anthropometrics" },
    smoking: { label: "Smoking" },
    diabetes: { label: "Diabetes" },
    insurance_access: { label: "Insurance and access" },
    kidney: { label: "Kidney" },
    lipids: { label: "Lipids" },
  },
  variables: [
    { name: "RIDAGEYR", domain: "demographics", label: "Age in years", role: "covariate" },
    { name: "RIAGENDR", domain: "demographics", label: "Gender", role: "covariate" },
    { name: "RIDRETH3", domain: "demographics", label: "Race ethnicity", role: "covariate" },
    { name: "INDFMPIR", domain: "demographics", label: "Family income to poverty ratio", role: "covariate" },
    { name: "WTMEC2YR", domain: "demographics", label: "MEC weight", role: "survey_weight" },
    { name: "SDMVSTRA", domain: "demographics", label: "Strata", role: "survey_design" },
    { name: "SDMVPSU", domain: "demographics", label: "PSU", role: "survey_design" },
    { name: "LBXVIDMS", domain: "vitamin_d", label: "25-hydroxyvitamin D", role: "measure" },
    { name: "DIQ010", domain: "diabetes", label: "Doctor told you have diabetes", role: "outcome" },
    { name: "LBXGH", domain: "diabetes", label: "Glycohemoglobin/HbA1c", role: "measure" },
    { name: "LBXGLU", domain: "diabetes", label: "Fasting glucose", role: "measure", weightHint: "fasting" },
    { name: "BPXSY1", domain: "blood_pressure", label: "Systolic BP reading 1", role: "measure" },
    { name: "BPXSY2", domain: "blood_pressure", label: "Systolic BP reading 2", role: "measure" },
    { name: "BPXSY3", domain: "blood_pressure", label: "Systolic BP reading 3", role: "measure" },
    { name: "BPXDI1", domain: "blood_pressure", label: "Diastolic BP reading 1", role: "measure" },
    { name: "BPXDI2", domain: "blood_pressure", label: "Diastolic BP reading 2", role: "measure" },
    { name: "BPXDI3", domain: "blood_pressure", label: "Diastolic BP reading 3", role: "measure" },
    { name: "BPQ020", domain: "blood_pressure", label: "Ever told you had high blood pressure", role: "questionnaire" },
    { name: "BMXBMI", domain: "anthropometrics", label: "Body mass index", role: "measure" },
    { name: "SMQ020", domain: "smoking", label: "Smoked cigarettes", role: "questionnaire" },
    { name: "HIQ011", domain: "insurance_access", label: "Covered by health insurance", role: "questionnaire" },
    { name: "URDACT", domain: "kidney", label: "Urine albumin-creatinine ratio", role: "measure" },
    { name: "LBXSCR", domain: "kidney", label: "Serum creatinine", role: "measure" },
    { name: "LBXTC", domain: "lipids", label: "Total cholesterol", role: "measure" },
    { name: "LBDHDD", domain: "lipids", label: "HDL cholesterol", role: "measure" },
    { name: "LBXTR", domain: "lipids", label: "Triglycerides", role: "measure" },
  ],
  weightRules: [
    {
      id: "mec",
      weightVariable: "WTMEC2YR",
      strataVariable: "SDMVSTRA",
      psuVariable: "SDMVPSU",
    },
  ],
};

describe("labMedbreviaNhanesCommand", () => {
  it("turns a MedBrevia NHANES registry into a CLI design packet", async () => {
    const repo = await makeRepo();
    try {
      const result = await labMedbreviaNhanesCommand({
        repoDir: repo,
        question: "In NHANES adults, is vitamin D deficiency associated with measured hypertension after BMI and smoking adjustment?",
      });

      expect(result.protocol.exposure.variables).toContain("LBXVIDMS");
      expect(result.protocol.endpoint.variables).toEqual(expect.arrayContaining(["BPXSY1", "BPXDI1"]));
      expect(result.protocol.covariates).toEqual(expect.arrayContaining(["RIDAGEYR", "RIAGENDR", "RIDRETH3", "BMXBMI", "SMQ020"]));
      expect(result.protocol.cycles).toEqual(["2017-2018"]);
      expect(result.protocol.surveyDesign.weightRule).toBe("mec");
      expect(result.protocol.derivedDefinitions.map(def => def.id)).toEqual(expect.arrayContaining(["vitamin_d_deficiency", "measured_hypertension"]));
      expect(result.packetVersion).toBe(0);
      expect(result.source.registrySha256).toMatch(/^[a-f0-9]{64}$/);
      expect(result.diagnostics.blockers).toEqual([]);
      expect(renderLabMedbreviaNhanesResult(result)).toContain("Self-Reinforcing Loop");
    } finally {
      await rm(repo, { recursive: true, force: true });
    }
  });

  it("writes design artifacts when outDir is provided", async () => {
    const repo = await makeRepo();
    const outDir = await mkdtemp(path.join(os.tmpdir(), "agenteer-lab-out-"));
    try {
      const result = await labMedbreviaNhanesCommand({
        repoDir: repo,
        outDir,
        question: "Vitamin D and hypertension in adults",
      });

      expect(result.outDir).toBe(outDir);
    } finally {
      await rm(repo, { recursive: true, force: true });
      await rm(outDir, { recursive: true, force: true });
    }
  });

  it("distinguishes BMI exposure from HbA1c endpoint", async () => {
    const repo = await makeRepo();
    try {
      const result = await labMedbreviaNhanesCommand({
        repoDir: repo,
        question: "Among NHANES adults, how does measured obesity relate to HbA1c-defined diabetes status after age, sex, and race/ethnicity adjustment?",
      });

      expect(result.protocol.exposure.label).toBe("Body Mass Index");
      expect(result.protocol.exposure.variables).toEqual(["BMXBMI"]);
      expect(result.protocol.endpoint.label).toBe("HbA1c");
      expect(result.protocol.endpoint.variables).toEqual(["LBXGH"]);
      expect(result.protocol.derivedDefinitions.map(def => def.id)).toContain("hba1c_defined_diabetes");
      expect(result.protocol.covariates).not.toContain("BMXBMI");
      expect(result.protocol.surveyDesign.weightRule).toBe("prepandemic_mec");
    } finally {
      await rm(repo, { recursive: true, force: true });
    }
  });

  it("separates hypertension subcohort filters from uncontrolled BP endpoint", async () => {
    const repo = await makeRepo();
    try {
      const result = await labMedbreviaNhanesCommand({
        repoDir: repo,
        question: "Among NHANES adults with measured hypertension, is health insurance coverage associated with uncontrolled blood pressure?",
      });

      expect(result.protocol.exposure.variables).toEqual(["HIQ011"]);
      expect(result.protocol.derivedDefinitions).toEqual(expect.arrayContaining([
        expect.objectContaining({ id: "measured_hypertension", role: "filter" }),
        expect.objectContaining({ id: "uncontrolled_blood_pressure", role: "endpoint" }),
      ]));
    } finally {
      await rm(repo, { recursive: true, force: true });
    }
  });

  it("treats HbA1c categories as exposure when kidney markers are the endpoint", async () => {
    const repo = await makeRepo();
    try {
      const result = await labMedbreviaNhanesCommand({
        repoDir: repo,
        question: "In NHANES adults, do kidney markers differ across HbA1c categories after adjustment for age, sex, race/ethnicity, and BMI?",
      });

      expect(result.protocol.exposure.label).toBe("HbA1c");
      expect(result.protocol.exposure.variables).toEqual(["LBXGH"]);
      expect(result.protocol.endpoint.label).toBe("Kidney Markers");
      expect(result.protocol.endpoint.variables).toEqual(expect.arrayContaining(["URDACT", "LBXSCR"]));
      expect(result.protocol.covariates).toContain("BMXBMI");
      expect(result.protocol.derivedDefinitions).toEqual(expect.arrayContaining([
        expect.objectContaining({ id: "hba1c_categories", role: "exposure" }),
      ]));
    } finally {
      await rm(repo, { recursive: true, force: true });
    }
  });

  it("treats income-to-poverty as exposure when BMI is an adjustment covariate", async () => {
    const repo = await makeRepo();
    try {
      const result = await labMedbreviaNhanesCommand({
        repoDir: repo,
        question: "In NHANES adults, are lipid markers patterned by family income-to-poverty ratio after age, sex, race/ethnicity, and BMI adjustment?",
      });

      expect(result.protocol.exposure.label).toBe("Income-To-Poverty Ratio");
      expect(result.protocol.exposure.variables).toEqual(["INDFMPIR"]);
      expect(result.protocol.endpoint.label).toBe("Lipids");
      expect(result.protocol.endpoint.variables).toEqual(expect.arrayContaining(["LBXTC", "LBDHDD", "LBXTR"]));
      expect(result.protocol.covariates).toContain("BMXBMI");
      expect(result.protocol.covariates).not.toContain("INDFMPIR");
      expect(result.protocol.derivedDefinitions).toEqual(expect.arrayContaining([
        expect.objectContaining({ id: "income_poverty_ratio_categories", role: "exposure" }),
      ]));
    } finally {
      await rm(repo, { recursive: true, force: true });
    }
  });

  it("models sex-specific smoking questions with sex as a stratifier", async () => {
    const repo = await makeRepo();
    try {
      const result = await labMedbreviaNhanesCommand({
        repoDir: repo,
        question: "Is smoking history associated with measured blood pressure differently by sex among NHANES adults?",
      });

      expect(result.protocol.exposure.variables).toEqual(["SMQ020"]);
      expect(result.protocol.endpoint.variables).toEqual(expect.arrayContaining(["BPXSY1", "BPXDI1"]));
      expect(result.protocol.stratifiers).toEqual(["RIAGENDR"]);
      expect(result.protocol.covariates).toEqual(expect.arrayContaining(["RIDAGEYR", "RIDRETH3"]));
      expect(result.protocol.covariates).not.toContain("RIAGENDR");
    } finally {
      await rm(repo, { recursive: true, force: true });
    }
  });

  it("uses self-reported hypertension questionnaire as exposure for measured hypertension questions", async () => {
    const repo = await makeRepo();
    try {
      const result = await labMedbreviaNhanesCommand({
        repoDir: repo,
        question: "Among NHANES adults, is self-reported high blood pressure associated with measured hypertension?",
      });

      expect(result.protocol.exposure.label).toBe("Self-Reported Hypertension");
      expect(result.protocol.exposure.variables).toEqual(["BPQ020"]);
      expect(result.protocol.endpoint.variables).toEqual(expect.arrayContaining(["BPXSY1", "BPXDI1"]));
      expect(result.protocol.derivedDefinitions).toEqual(expect.arrayContaining([
        expect.objectContaining({ id: "self_reported_hypertension", role: "exposure" }),
        expect.objectContaining({ id: "measured_hypertension", role: "endpoint" }),
      ]));
    } finally {
      await rm(repo, { recursive: true, force: true });
    }
  });
});

async function makeRepo(): Promise<string> {
  const repo = await mkdtemp(path.join(os.tmpdir(), "medbrevia-fixture-"));
  const registryDir = path.join(repo, "data", "analytics", "nhanes");
  await mkdir(registryDir, { recursive: true });
  await writeFile(path.join(registryDir, "registry.json"), `${JSON.stringify(REGISTRY, null, 2)}\n`);
  return repo;
}
