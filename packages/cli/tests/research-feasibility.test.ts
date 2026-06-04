import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  identifierLikeColumnReason,
  outcomeOrFutureLeakageReason,
  postTreatmentAdjustmentReason,
  semanticPlausibilityIssuesForColumn,
} from "../src/index.js";
import {
  researchControllerRunCommand,
  type ControllerFeasibilityVerdict,
} from "../src/research-machine/controller.js";
import {
  researchFeasibilityGateCommand,
  renderResearchFeasibilityGateJson,
  renderResearchFeasibilityGateMarkdown,
} from "../src/research-machine/commands.js";

describe("research feasibility gate", () => {
  it("shares semantic plausibility helpers across feasibility, modeling, and stats preflight", () => {
    expect(semanticPlausibilityIssuesForColumn({
      name: "bmi",
      inferredType: "number",
      min: 18,
      max: 45,
      mean: 63,
    }, 100)).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "IMPLAUSIBLE_BMI_MEAN", severity: "warning" }),
    ]));
    expect(semanticPlausibilityIssuesForColumn({
      name: "mortality_flag",
      inferredType: "number",
      min: 0,
      max: 2,
    }, 100)).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "INVALID_BINARY_EVENT_RANGE", severity: "blocker" }),
    ]));
    expect(identifierLikeColumnReason({ name: "patient_id", uniqueCount: 90, nonMissingRows: 100 }, 100)).toContain("identifier");
    expect(outcomeOrFutureLeakageReason("post_discharge_mortality", "mortality")).toContain("future/outcome-like");
    expect(outcomeOrFutureLeakageReason("baseline_stroke_history", "mortality")).toBeNull();
    expect(postTreatmentAdjustmentReason("in_hospital_vasopressor")).toContain("post-baseline care");
    expect(postTreatmentAdjustmentReason("baseline_vasopressor_history")).toBeNull();
  });

  it("approves a well-specified binary study for formal analysis with minor artifact modifications", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "agenteer-feasibility-ready-"));
    try {
      const data = path.join(dir, "rows.csv");
      await writeFile(data, binaryCsv({ rows: 120, events: 42 }));

      const result = await researchFeasibilityGateCommand({
        question: "Among adults in a cohort, is treatment group associated with 30-day mortality after adjustment?",
        dataPath: data,
        method: "logistic-regression",
        outcome: "mortality",
        exposure: "treatment",
        covariates: ["age", "risk_score"],
        minRows: 80,
        outDir: path.join(dir, "gate"),
      });

      expect(result.verdict).toBe("formal_analysis_ready");
      expect(result.status).toBe("warning");
      expect(result.primaryAction).toBe("revise_design");
      expect(result.domains.map(domain => domain.id)).toEqual(expect.arrayContaining([
        "data_availability",
        "cohort_size",
        "event_count",
        "missingness",
        "phenotype_confidence",
        "temporal_validity",
        "outcome_observability",
        "method_suitability",
        "semantic_plausibility",
        "expected_statistical_power",
        "expected_reviewer_risk",
        "design_specificity",
        "artifact_readiness",
        "cost_and_access",
      ]));
      expect(result.internalReviews).toHaveLength(5);
      expect(result.outcomeDiagnostics.eventCount).toBe(42);
      expect(result.requiredModifications).toEqual(expect.arrayContaining([
        expect.stringContaining("AnalysisSpec"),
      ]));
      expect(await readFile(path.join(dir, "gate", "feasibility-gate.json"), "utf-8")).toContain("formal_analysis_ready");
      expect(await readFile(path.join(dir, "gate", "feasibility-gate.md"), "utf-8")).toContain("Internal Reviews");
      expect(renderResearchFeasibilityGateJson(result)).toContain("feasibilityGate");
      expect(renderResearchFeasibilityGateMarkdown(result)).toContain("Domain Scores");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("requires data profiling when no table evidence is available", async () => {
    const result = await researchFeasibilityGateCommand({
      question: "Is exposure associated with mortality?",
      method: "logistic-regression",
      outcome: "mortality",
      exposure: "exposure",
    });

    expect(result.verdict).toBe("needs_data_profiling");
    expect(result.primaryAction).toBe("profile_data");
    expect(result.domains.find(domain => domain.id === "data_availability")?.status).toBe("warning");
    expect(result.nextAction).toMatch(/Profile/);
  });

  it("uses aggregate value counts for summary-only or parquet-style feasibility", async () => {
    const result = await researchFeasibilityGateCommand({
      question: "Is treatment associated with mortality?",
      method: "logistic-regression",
      outcome: "mortality",
      exposure: "treatment",
      covariates: ["age"],
      minRows: 80,
      tableSummary: {
        file: "/bounded/profile.parquet",
        format: "parquet",
        adapter: { kind: "python-pandas-parquet", executable: "python", version: "3.12", packages: { pandas: "2", pyarrow: "20" } },
        fileSizeBytes: 1024,
        fileMtimeMs: 1,
        fileSha256: "abc",
        rowCount: 200,
        columnCount: 3,
        columns: [
          { name: "mortality", inferredType: "number", nonMissingRows: 200, missingFraction: 0, uniqueCount: 2, valueCounts: [{ value: "0", count: 150, fraction: 0.75 }, { value: "1", count: 50, fraction: 0.25 }], sampleValues: ["0", "1"], min: 0, max: 1, mean: 0.25 },
          { name: "treatment", inferredType: "number", nonMissingRows: 200, missingFraction: 0, uniqueCount: 2, valueCounts: [{ value: "0", count: 100, fraction: 0.5 }, { value: "1", count: 100, fraction: 0.5 }], sampleValues: ["0", "1"], min: 0, max: 1, mean: 0.5 },
          { name: "age", inferredType: "number", nonMissingRows: 200, missingFraction: 0, uniqueCount: 60, valueCounts: [], sampleValues: ["50", "60"], min: 20, max: 90, mean: 61 },
        ],
        warnings: [],
      },
    });

    expect(result.outcomeDiagnostics.observedLevels).toEqual(expect.arrayContaining([
      { value: "1", count: 50 },
      { value: "0", count: 150 },
    ]));
    expect(result.outcomeDiagnostics.eventCount).toBe(50);
    expect(result.outcomeDiagnostics.nonEventCount).toBe(150);
    expect(result.variableChecks.find(check => check.name === "mortality")?.uniqueCount).toBe(2);
    expect(result.variableChecks.find(check => check.name === "mortality")?.valueCounts[0]).toMatchObject({ value: "0", count: 150 });
    expect(result.domains.find(domain => domain.id === "event_count")?.status).toBe("pass");
  });

  it("blocks identifier-like columns when they are bound to substantive analysis roles", async () => {
    const result = await researchFeasibilityGateCommand({
      question: "Is patient identifier associated with mortality?",
      method: "logistic-regression",
      outcome: "mortality",
      exposure: "patient_id",
      id: "patient_id",
      tableSummary: {
        file: "/bounded/profile.parquet",
        format: "parquet",
        adapter: { kind: "python-pandas-parquet", executable: "python", version: "3.12", packages: { pandas: "2", pyarrow: "20" } },
        fileSizeBytes: 1024,
        fileMtimeMs: 1,
        fileSha256: "abc",
        rowCount: 200,
        columnCount: 3,
        columns: [
          { name: "mortality", inferredType: "number", nonMissingRows: 200, missingFraction: 0, uniqueCount: 2, valueCounts: [{ value: "0", count: 150, fraction: 0.75 }, { value: "1", count: 50, fraction: 0.25 }], sampleValues: ["0", "1"], min: 0, max: 1, mean: 0.25 },
          { name: "patient_id", inferredType: "number", nonMissingRows: 200, missingFraction: 0, uniqueCount: 200, valueCounts: [], sampleValues: ["1", "2", "3"], min: 1, max: 200, mean: 100.5 },
          { name: "treatment", inferredType: "number", nonMissingRows: 200, missingFraction: 0, uniqueCount: 2, valueCounts: [{ value: "0", count: 100, fraction: 0.5 }, { value: "1", count: 100, fraction: 0.5 }], sampleValues: ["0", "1"], min: 0, max: 1, mean: 0.5 },
        ],
        warnings: [],
      },
    });
    const exposureCheck = result.variableChecks.find(check => check.role === "exposure" && check.name === "patient_id");
    const idCheck = result.variableChecks.find(check => check.role === "id" && check.name === "patient_id");

    expect(result.status).toBe("block");
    expect(result.verdict).toBe("reject");
    expect(exposureCheck?.issues.map(issue => issue.code)).toContain("IDENTIFIER_USED_AS_ANALYSIS_VARIABLE");
    expect(idCheck?.issues.map(issue => issue.code)).not.toContain("IDENTIFIER_USED_AS_ANALYSIS_VARIABLE");
  });

  it("routes coded clinical studies to phenotype review before formal analysis", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "agenteer-feasibility-phenotype-"));
    try {
      const data = path.join(dir, "rows.csv");
      await writeFile(data, binaryCsv({ rows: 140, events: 50 }));

      const result = await researchFeasibilityGateCommand({
        question: "Across ICD-9, ICD-10, and CPT phenotypes, do dialysis patients have higher post-procedure mortality?",
        dataPath: data,
        method: "logistic-regression",
        outcome: "mortality",
        exposure: "treatment",
        covariates: ["age", "risk_score"],
        phenotypeIds: ["dialysis", "procedure"],
        phenotypeConfidence: 0.6,
        phenotypeReviewed: false,
        minRows: 80,
      });

      expect(result.verdict).toBe("needs_phenotype_review");
      expect(result.primaryAction).toBe("review_phenotype");
      expect(result.clarifyingQuestions.join(" ")).toMatch(/phenotype|code/i);
      expect(result.alternativeStudyIdeas.some(idea => idea.title.includes("Phenotype validation"))).toBe(true);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("rejects event-dependent designs with too few events", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "agenteer-feasibility-sparse-"));
    try {
      const data = path.join(dir, "rows.csv");
      await writeFile(data, binaryCsv({ rows: 80, events: 1 }));

      const result = await researchFeasibilityGateCommand({
        question: "Is treatment associated with mortality?",
        dataPath: data,
        method: "logistic-regression",
        outcome: "mortality",
        exposure: "treatment",
        covariates: ["age", "risk_score"],
        minRows: 50,
      });

      expect(result.verdict).toBe("reject");
      expect(result.status).toBe("block");
      expect(result.blockers.join(" ")).toMatch(/event|events/i);
      expect(result.alternativeStudyIdeas.some(idea => idea.title.includes("Descriptive"))).toBe(true);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("rejects analyses when a required exposure has no analysis-complete variation", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "agenteer-feasibility-constant-exposure-"));
    try {
      const data = path.join(dir, "rows.csv");
      await writeFile(data, [
        "mortality,treatment,age,risk_score",
        ...Array.from({ length: 100 }, (_, index) => `${index < 35 ? 1 : 0},1,${45 + index % 40},${(0.2 + (index % 20) / 10).toFixed(2)}`),
      ].join("\n"));

      const result = await researchFeasibilityGateCommand({
        question: "Is treatment associated with mortality?",
        dataPath: data,
        method: "logistic-regression",
        outcome: "mortality",
        exposure: "treatment",
        covariates: ["age", "risk_score"],
        minRows: 50,
      });

      expect(result.verdict).toBe("reject");
      expect(result.status).toBe("block");
      expect(result.issues).toEqual(expect.arrayContaining([
        expect.objectContaining({ code: "NO_ROLE_VARIATION", role: "exposure", variable: "treatment", severity: "blocker" }),
      ]));
      expect(result.blockers.join(" ")).toContain("exposure variable 'treatment' has only 1 analysis-complete level");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("warns but does not reject when an adjustment covariate has no analysis-complete variation", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "agenteer-feasibility-constant-covariate-"));
    try {
      const data = path.join(dir, "rows.csv");
      await writeFile(data, [
        "mortality,treatment,age,risk_score",
        ...Array.from({ length: 120 }, (_, index) => `${index < 42 ? 1 : 0},${index % 2},60,${(0.2 + (index % 20) / 10).toFixed(2)}`),
      ].join("\n"));

      const result = await researchFeasibilityGateCommand({
        question: "Is treatment associated with mortality?",
        dataPath: data,
        outcome: "mortality",
        exposure: "treatment",
        covariates: ["age", "risk_score"],
        minRows: 50,
      });

      expect(result.status).toBe("warning");
      expect(result.blockers.join(" ")).not.toContain("covariate variable 'age'");
      expect(result.issues).toEqual(expect.arrayContaining([
        expect.objectContaining({ code: "LOW_SIGNAL_ROLE_VARIATION", role: "covariate", variable: "age", severity: "warning" }),
      ]));
      expect(result.warnings.join(" ")).toContain("covariate variable 'age' has only 1 analysis-complete level");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("uses analysis-complete event counts for event-dependent feasibility", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "agenteer-feasibility-complete-events-"));
    try {
      const data = path.join(dir, "rows.csv");
      await writeFile(data, [
        "mortality,treatment,age,risk_score",
        ...Array.from({ length: 100 }, (_, index) => {
          const mortality = index < 20 ? 1 : 0;
          const risk = index > 0 && index < 20 ? "" : (0.2 + (index % 20) / 10).toFixed(2);
          return `${mortality},${index % 2},${45 + index % 40},${risk}`;
        }),
      ].join("\n"));

      const result = await researchFeasibilityGateCommand({
        question: "Is treatment associated with mortality after adjustment?",
        dataPath: data,
        method: "logistic-regression",
        outcome: "mortality",
        exposure: "treatment",
        covariates: ["age", "risk_score"],
        minRows: 50,
      });

      expect(result.outcomeDiagnostics.eventCount).toBe(20);
      expect(result.outcomeDiagnostics.analysisEventCount).toBe(1);
      expect(result.verdict).toBe("reject");
      expect(result.domains.find(domain => domain.id === "event_count")).toMatchObject({
        status: "block",
        rationale: expect.stringContaining("analysis-complete event"),
      });
      expect(result.blockers.join(" ")).toMatch(/analysis-complete event/i);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("does not infer event support from only the first 5000 sorted local rows", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "agenteer-feasibility-sorted-events-"));
    try {
      const data = path.join(dir, "sorted-events.csv");
      await writeFile(data, [
        "mortality,treatment,age,risk_score",
        ...Array.from({ length: 6000 }, (_, index) => {
          const mortality = index < 5000 ? 0 : 1;
          const treatment = index % 2;
          const age = 45 + index % 35;
          const risk = (0.1 + (index % 100) / 100).toFixed(2);
          return `${mortality},${treatment},${age},${risk}`;
        }),
      ].join("\n"));

      const result = await researchFeasibilityGateCommand({
        question: "Is treatment associated with mortality after adjustment?",
        dataPath: data,
        method: "logistic-regression",
        outcome: "mortality",
        exposure: "treatment",
        covariates: ["age", "risk_score"],
        minRows: 50,
      });

      expect(result.completeCase).toMatchObject({
        scanned: true,
        scannedRows: 6000,
        completeRows: 6000,
      });
      expect(result.completeCase.scanReason).toContain("Scanned 6000 rows");
      expect(result.outcomeDiagnostics.analysisEventCount).toBe(1000);
      expect(result.outcomeDiagnostics.analysisNonEventCount).toBe(5000);
      expect(result.domains.find(domain => domain.id === "event_count")).toMatchObject({
        status: "pass",
      });
      expect(result.blockers.join(" ")).not.toMatch(/No observed outcome events|Only 0 event|Only 0 usable row/i);
      expect(result.verdict).not.toBe("reject");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("rejects multi-label negative-looking outcomes instead of aggregating them as binary", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "agenteer-feasibility-full-binary-levels-"));
    try {
      const data = path.join(dir, "many-negative-levels.csv");
      await writeFile(data, [
        "mortality,treatment,age,risk_score",
        ...Array.from({ length: 25 }, (_, levelIndex) => (
          Array.from({ length: 100 }, (_, rowIndex) => {
            const index = levelIndex * 100 + rowIndex;
            return [`no event ${levelIndex}`, index % 2, 45 + index % 35, (0.1 + (index % 100) / 100).toFixed(2)].join(",");
          })
        )).flat(),
        ...Array.from({ length: 5 }, (_, index) => ["event", index % 2, 70 + index, "0.95"].join(",")),
      ].join("\n"));

      const result = await researchFeasibilityGateCommand({
        question: "Is treatment associated with rare mortality after adjustment?",
        dataPath: data,
        method: "logistic-regression",
        outcome: "mortality",
        exposure: "treatment",
        covariates: ["age", "risk_score"],
        minRows: 50,
      });

      expect(result.outcomeDiagnostics.observedLevels).toHaveLength(20);
      expect(result.outcomeDiagnostics.observedLevels.map(level => level.value)).not.toContain("event");
      expect(result.outcomeDiagnostics.observedLevelCount).toBe(26);
      expect(result.outcomeDiagnostics.binarySupported).toBe(false);
      expect(result.outcomeDiagnostics.analysisObservedLevelCount).toBe(26);
      expect(result.outcomeDiagnostics.analysisBinarySupported).toBe(false);
      expect(result.outcomeDiagnostics.analysisEventCount).toBeNull();
      expect(result.outcomeDiagnostics.analysisNonEventCount).toBeNull();
      expect(result.blockers.join(" ")).toContain("METHOD_BINARY_OUTCOME_REQUIRED");
      expect(result.verdict).toBe("reject");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("keeps rare event support for valid two-level binary outcomes", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "agenteer-feasibility-rare-binary-levels-"));
    try {
      const data = path.join(dir, "rare-valid-binary.csv");
      await writeFile(data, [
        "mortality,treatment,age,risk_score",
        ...Array.from({ length: 2500 }, (_, index) => ["no event", index % 2, 45 + index % 35, (0.1 + (index % 100) / 100).toFixed(2)].join(",")),
        ...Array.from({ length: 5 }, (_, index) => ["event", index % 2, 70 + index, "0.95"].join(",")),
      ].join("\n"));

      const result = await researchFeasibilityGateCommand({
        question: "Is treatment associated with rare mortality after adjustment?",
        dataPath: data,
        method: "logistic-regression",
        outcome: "mortality",
        exposure: "treatment",
        covariates: ["age", "risk_score"],
        minRows: 50,
      });

      expect(result.outcomeDiagnostics.observedLevelCount).toBe(2);
      expect(result.outcomeDiagnostics.binarySupported).toBe(true);
      expect(result.outcomeDiagnostics.analysisObservedLevelCount).toBe(2);
      expect(result.outcomeDiagnostics.analysisBinarySupported).toBe(true);
      expect(result.outcomeDiagnostics.analysisEventCount).toBe(5);
      expect(result.outcomeDiagnostics.analysisNonEventCount).toBe(2500);
      expect(result.blockers.join(" ")).not.toContain("METHOD_BINARY_OUTCOME_REQUIRED");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("rejects semantically impossible event columns before modeling", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "agenteer-feasibility-semantic-"));
    try {
      const data = path.join(dir, "rows.csv");
      await writeFile(data, [
        "mortality,treatment,age",
        "2,0,64",
        "3,1,72",
        "1,0,68",
        "0,1,59",
        "2,1,80",
        "0,0,76",
      ].join("\n"));

      const result = await researchFeasibilityGateCommand({
        question: "Is treatment associated with mortality?",
        dataPath: data,
        method: "logistic-regression",
        outcome: "mortality",
        exposure: "treatment",
        covariates: ["age"],
        minRows: 5,
      });

      expect(result.verdict).toBe("reject");
      expect(result.blockers.join(" ")).toMatch(/0\/1|Binary-event-like/i);
      expect(result.domains.find(domain => domain.id === "semantic_plausibility")?.status).toBe("block");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("rejects method-family choices that do not match observed outcome shape", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "agenteer-feasibility-method-shape-"));
    try {
      const continuousOutcome = path.join(dir, "continuous-outcome.csv");
      await writeFile(continuousOutcome, [
        "severity_score,treatment,age",
        ...Array.from({ length: 80 }, (_, index) => `${(12.5 + index * 0.37).toFixed(2)},${index % 2},${45 + index % 30}`),
      ].join("\n"));

      const logistic = await researchFeasibilityGateCommand({
        question: "Is treatment associated with severity score?",
        dataPath: continuousOutcome,
        method: "logistic-regression",
        outcome: "severity_score",
        exposure: "treatment",
        covariates: ["age"],
        minRows: 40,
      });
      expect(logistic.verdict).toBe("reject");
      expect(logistic.domains.find(domain => domain.id === "method_suitability")?.status).toBe("block");
      expect(logistic.blockers.join(" ")).toContain("METHOD_BINARY_OUTCOME_REQUIRED");

      const decimalCount = path.join(dir, "decimal-count.csv");
      await writeFile(decimalCount, [
        "visit_count,treatment,age",
        ...Array.from({ length: 80 }, (_, index) => `${(index % 8 + 0.5).toFixed(1)},${index % 2},${45 + index % 30}`),
      ].join("\n"));
      const poisson = await researchFeasibilityGateCommand({
        question: "Is treatment associated with visit counts?",
        dataPath: decimalCount,
        method: "poisson-regression",
        outcome: "visit_count",
        exposure: "treatment",
        covariates: ["age"],
        minRows: 40,
      });
      expect(poisson.verdict).toBe("reject");
      expect(poisson.blockers.join(" ")).toContain("METHOD_COUNT_OUTCOME_REQUIRED");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("rejects categorical and propensity routes when observed inputs are continuous or nonbinary", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "agenteer-feasibility-method-input-shape-"));
    try {
      const continuousInputs = path.join(dir, "continuous-inputs.csv");
      await writeFile(continuousInputs, [
        "biomarker,dose,mortality,age",
        ...Array.from({ length: 90 }, (_, index) => `${(8 + index * 0.2).toFixed(2)},${(2 + index * 0.15).toFixed(2)},${index < 30 ? 1 : 0},${40 + index % 45}`),
      ].join("\n"));

      const chiSquare = await researchFeasibilityGateCommand({
        question: "Is biomarker associated with dose category?",
        dataPath: continuousInputs,
        method: "chi-square",
        outcome: "biomarker",
        exposure: "dose",
        minRows: 40,
      });
      expect(chiSquare.verdict).toBe("reject");
      expect(chiSquare.blockers.join(" ")).toContain("METHOD_CATEGORICAL_INPUT_REQUIRED");

      const propensity = await researchFeasibilityGateCommand({
        question: "Estimate treatment effect of dose on mortality using propensity matching.",
        dataPath: continuousInputs,
        method: "propensity-score-matching",
        outcome: "mortality",
        exposure: "dose",
        covariates: ["age", "biomarker"],
        minRows: 40,
      });
      expect(propensity.verdict).toBe("reject");
      expect(propensity.blockers.join(" ")).toContain("METHOD_BINARY_TREATMENT_REQUIRED");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("uses analysis-complete levels for two-by-two categorical feasibility", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "agenteer-feasibility-categorical-complete-"));
    try {
      const data = path.join(dir, "categorical.csv");
      await writeFile(data, [
        "mortality,group,age",
        ...Array.from({ length: 30 }, () => "alive,control,62"),
        ...Array.from({ length: 10 }, () => "dead,control,67"),
        ...Array.from({ length: 20 }, () => "alive,treated,64"),
        ...Array.from({ length: 20 }, () => "dead,treated,70"),
        ...Array.from({ length: 8 }, () => "pending,,58"),
        ...Array.from({ length: 8 }, () => ",screened_only,61"),
      ].join("\n"));

      const result = await researchFeasibilityGateCommand({
        question: "Is treatment group associated with mortality?",
        dataPath: data,
        method: "fisher-exact",
        outcome: "mortality",
        exposure: "group",
        minRows: 50,
      });

      expect(result.outcomeDiagnostics.observedLevels).toEqual(expect.arrayContaining([
        { value: "pending", count: 8 },
      ]));
      expect(result.completeCase.completeValueCounts.mortality).toEqual({ alive: 50, dead: 30 });
      expect(result.completeCase.completeValueCounts.group).toEqual({ control: 40, treated: 40 });
      expect(result.domains.find(domain => domain.id === "method_suitability")).not.toMatchObject({ status: "block" });
      expect(result.blockers.join(" ")).not.toContain("METHOD_2X2_REQUIRED");
      expect(result.verdict).not.toBe("reject");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("uses analysis-complete binary levels for outcome and treatment feasibility", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "agenteer-feasibility-binary-complete-"));
    try {
      const outcomeData = path.join(dir, "outcome.csv");
      await writeFile(outcomeData, [
        "mortality,treatment,age,risk_score",
        ...Array.from({ length: 50 }, (_, index) => `${index < 25 ? "dead" : "alive"},${index % 2 ? "treated" : "control"},${55 + index % 20},${(0.2 + index / 100).toFixed(2)}`),
        ...Array.from({ length: 8 }, () => "pending,treated,,0.80"),
      ].join("\n"));

      const logistic = await researchFeasibilityGateCommand({
        question: "Is treatment associated with mortality?",
        dataPath: outcomeData,
        method: "logistic-regression",
        outcome: "mortality",
        exposure: "treatment",
        covariates: ["age", "risk_score"],
        minRows: 40,
      });

      expect(logistic.outcomeDiagnostics.observedLevels).toEqual(expect.arrayContaining([
        { value: "pending", count: 8 },
      ]));
      expect(logistic.outcomeDiagnostics.analysisObservedLevels).toEqual(expect.arrayContaining([
        { value: "alive", count: 25 },
        { value: "dead", count: 25 },
      ]));
      expect(logistic.blockers.join(" ")).not.toContain("METHOD_BINARY_OUTCOME_REQUIRED");
      expect(logistic.verdict).not.toBe("reject");

      const treatmentData = path.join(dir, "treatment.csv");
      await writeFile(treatmentData, [
        "mortality,treatment,age,risk_score",
        ...Array.from({ length: 50 }, (_, index) => `${index < 20 ? 1 : 0},${index % 2 ? "treated" : "control"},${55 + index % 20},${(0.2 + index / 100).toFixed(2)}`),
        ...Array.from({ length: 8 }, () => "0,unknown,,0.70"),
      ].join("\n"));

      const propensity = await researchFeasibilityGateCommand({
        question: "Estimate treatment effect on mortality using propensity matching.",
        dataPath: treatmentData,
        method: "propensity-score-matching",
        outcome: "mortality",
        exposure: "treatment",
        covariates: ["age", "risk_score"],
        minRows: 40,
      });

      expect(propensity.completeCase.completeValueCounts.treatment).toEqual({ control: 25, treated: 25 });
      expect(propensity.blockers.join(" ")).not.toContain("METHOD_BINARY_TREATMENT_REQUIRED");
      expect(propensity.verdict).not.toBe("reject");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("downgrades binary outcome contrasts with sparse or zero event-by-arm support", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "agenteer-feasibility-binary-arm-events-"));
    try {
      const zeroCellData = path.join(dir, "zero-cell.csv");
      await writeFile(zeroCellData, [
        "mortality,treatment,age,risk_score",
        ...Array.from({ length: 30 }, (_, index) => `0,treated,${55 + index % 20},${(0.2 + index / 100).toFixed(2)}`),
        ...Array.from({ length: 20 }, (_, index) => `1,control,${60 + index % 20},${(0.3 + index / 100).toFixed(2)}`),
        ...Array.from({ length: 30 }, (_, index) => `0,control,${45 + index % 20},${(0.1 + index / 100).toFixed(2)}`),
      ].join("\n"));

      const logistic = await researchFeasibilityGateCommand({
        question: "Is treatment associated with mortality?",
        dataPath: zeroCellData,
        method: "logistic-regression",
        outcome: "mortality",
        exposure: "treatment",
        covariates: ["age", "risk_score"],
        minRows: 50,
      });
      expect(logistic.verdict).toBe("exploratory_only");
      expect(logistic.warnings.join(" ")).toContain("METHOD_BINARY_OUTCOME_BY_ARM_ZERO_CELL");

      const fisher = await researchFeasibilityGateCommand({
        question: "Is treatment group associated with mortality?",
        dataPath: zeroCellData,
        method: "fisher-exact",
        outcome: "mortality",
        exposure: "treatment",
        minRows: 50,
      });
      expect(fisher.verdict).toBe("exploratory_only");
      expect(fisher.warnings.join(" ")).toContain("METHOD_BINARY_OUTCOME_BY_ARM_ZERO_CELL");

      const sparseCellData = path.join(dir, "sparse-cell.csv");
      await writeFile(sparseCellData, [
        "mortality,treatment,age,risk_score",
        ...Array.from({ length: 4 }, (_, index) => `1,treated,${55 + index},${(0.2 + index / 100).toFixed(2)}`),
        ...Array.from({ length: 36 }, (_, index) => `0,treated,${55 + index % 20},${(0.3 + index / 100).toFixed(2)}`),
        ...Array.from({ length: 20 }, (_, index) => `1,control,${60 + index % 20},${(0.4 + index / 100).toFixed(2)}`),
        ...Array.from({ length: 30 }, (_, index) => `0,control,${45 + index % 20},${(0.1 + index / 100).toFixed(2)}`),
      ].join("\n"));

      const sparsePropensity = await researchFeasibilityGateCommand({
        question: "Estimate treatment effect on mortality using propensity weighting.",
        dataPath: sparseCellData,
        method: "propensity-score-weighting",
        outcome: "mortality",
        exposure: "treatment",
        covariates: ["age", "risk_score"],
        minRows: 50,
      });
      expect(sparsePropensity.verdict).toBe("exploratory_only");
      expect(sparsePropensity.warnings.join(" ")).toContain("METHOD_BINARY_OUTCOME_BY_ARM_SPARSE_CELL");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("rejects fragile regression-family specifications before execution", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "agenteer-feasibility-regression-support-"));
    try {
      const overfitData = path.join(dir, "overfit-logistic.csv");
      await writeFile(overfitData, [
        "mortality,treatment,hospital",
        ...Array.from({ length: 80 }, (_, index) => `${index < 20 ? 1 : 0},${index % 2},h${index % 10}`),
      ].join("\n"));
      const overfit = await researchFeasibilityGateCommand({
        question: "Is treatment associated with mortality after hospital adjustment?",
        dataPath: overfitData,
        method: "logistic-regression",
        outcome: "mortality",
        exposure: "treatment",
        covariates: ["hospital"],
        minRows: 50,
      });
      expect(overfit.verdict).toBe("reject");
      expect(overfit.blockers.join(" ")).toContain("METHOD_LOGISTIC_EVENTS_PER_PARAMETER_REQUIRED");

      const separatedData = path.join(dir, "separated-logistic.csv");
      await writeFile(separatedData, [
        "mortality,treatment,age",
        ...Array.from({ length: 10 }, (_, index) => `1,treated,${50 + index}`),
        ...Array.from({ length: 20 }, (_, index) => `1,control,${60 + index}`),
        ...Array.from({ length: 50 }, (_, index) => `0,control,${45 + index % 20}`),
      ].join("\n"));
      const separated = await researchFeasibilityGateCommand({
        question: "Is treatment associated with mortality?",
        dataPath: separatedData,
        method: "logistic-regression",
        outcome: "mortality",
        exposure: "treatment",
        covariates: ["age"],
        minRows: 50,
      });
      expect(separated.verdict).toBe("exploratory_only");
      expect(separated.warnings.join(" ")).toContain("METHOD_LOGISTIC_SEPARATION_RISK");

      const constantCovariateData = path.join(dir, "constant-covariate.csv");
      await writeFile(constantCovariateData, [
        "outcome,treatment,site",
        ...Array.from({ length: 60 }, (_, index) => `${10 + index / 10},${index % 2},same_site`),
      ].join("\n"));
      const constantCovariate = await researchFeasibilityGateCommand({
        question: "Is treatment associated with outcome after site adjustment?",
        dataPath: constantCovariateData,
        method: "linear-regression",
        outcome: "outcome",
        exposure: "treatment",
        covariates: ["site"],
        minRows: 50,
      });
      expect(constantCovariate.verdict).toBe("reject");
      expect(constantCovariate.blockers.join(" ")).toContain("METHOD_REGRESSION_TERM_VARIATION_REQUIRED");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("rejects outcome-derived, post-index, and conflicting model terms during feasibility", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "agenteer-feasibility-leakage-"));
    try {
      const dataPath = path.join(dir, "leakage.csv");
      await writeFile(dataPath, [
        "mortality,treatment,age,post_discharge_los,prior_mi,in_hospital_procedure,history_surgery",
        ...Array.from({ length: 120 }, (_, index) => `${index < 40 ? 1 : 0},${index % 2},${45 + index % 35},${1 + index % 10},${index % 3 === 0 ? 1 : 0},${index % 4 === 0 ? 1 : 0},${index % 5 === 0 ? 1 : 0}`),
      ].join("\n"));

      const leaky = await researchFeasibilityGateCommand({
        question: "Is treatment associated with mortality after adjustment?",
        dataPath,
        method: "logistic-regression",
        outcome: "mortality",
        exposure: "treatment",
        covariates: ["age", "post_discharge_los", "prior_mi"],
        minRows: 80,
      });
      expect(leaky.verdict).toBe("reject");
      expect(leaky.blockers.join(" ")).toContain("METHOD_OUTCOME_LEAKAGE_TERM_REVIEW");
      expect(leaky.blockers.join(" ")).toContain("post_discharge_los");
      expect(leaky.blockers.join(" ")).not.toContain("prior_mi (");

      const postTreatmentAdjustment = await researchFeasibilityGateCommand({
        question: "Is treatment associated with mortality after adjustment?",
        dataPath,
        method: "logistic-regression",
        outcome: "mortality",
        exposure: "treatment",
        covariates: ["age", "in_hospital_procedure", "history_surgery"],
        minRows: 80,
      });
      expect(postTreatmentAdjustment.verdict).toBe("reject");
      expect(postTreatmentAdjustment.blockers.join(" ")).toContain("METHOD_POST_TREATMENT_ADJUSTMENT_REVIEW");
      expect(postTreatmentAdjustment.blockers.join(" ")).toContain("in_hospital_procedure");
      expect(postTreatmentAdjustment.blockers.join(" ")).not.toContain("history_surgery (");

      const baselineHistoryAdjustment = await researchFeasibilityGateCommand({
        question: "Is treatment associated with mortality after adjustment?",
        dataPath,
        method: "logistic-regression",
        outcome: "mortality",
        exposure: "treatment",
        covariates: ["age", "prior_mi", "history_surgery"],
        minRows: 80,
      });
      expect(baselineHistoryAdjustment.blockers.join(" ")).not.toContain("METHOD_POST_TREATMENT_ADJUSTMENT_REVIEW");
      expect(baselineHistoryAdjustment.blockers.join(" ")).not.toContain("METHOD_OUTCOME_LEAKAGE_TERM_REVIEW");

      const roleConflict = await researchFeasibilityGateCommand({
        question: "Is treatment associated with mortality after adjustment?",
        dataPath,
        method: "logistic-regression",
        outcome: "mortality",
        exposure: "treatment",
        covariates: ["age", "mortality"],
        minRows: 80,
      });
      expect(roleConflict.verdict).toBe("reject");
      expect(roleConflict.blockers.join(" ")).toContain("METHOD_MODEL_ROLE_CONFLICT");

      const duplicate = await researchFeasibilityGateCommand({
        question: "Is treatment associated with mortality after adjustment?",
        dataPath,
        method: "logistic-regression",
        outcome: "mortality",
        exposure: "treatment",
        covariates: ["age", "age"],
        minRows: 80,
      });
      expect(duplicate.verdict).toBe("reject");
      expect(duplicate.blockers.join(" ")).toContain("METHOD_DUPLICATE_COVARIATES");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("checks requested calendar windows against observed year coverage", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "agenteer-feasibility-temporal-window-"));
    try {
      const dataPath = path.join(dir, "temporal.csv");
      await writeFile(dataPath, [
        "mortality,treatment,age,index_year",
        ...Array.from({ length: 120 }, (_, index) => `${index < 42 ? 1 : 0},${index % 2},${45 + index % 35},${2015 + index % 5}`),
      ].join("\n"));

      const impossible = await researchFeasibilityGateCommand({
        question: "Longitudinal study from 2008 to 2012 of treatment and mortality.",
        dataPath,
        method: "logistic-regression",
        outcome: "mortality",
        exposure: "treatment",
        covariates: ["age"],
        period: "index_year",
        minRows: 80,
      });
      expect(impossible.verdict).toBe("reject");
      expect(impossible.blockers.join(" ")).toContain("TEMPORAL_WINDOW_NOT_OBSERVED");
      expect(impossible.domains.find(domain => domain.id === "temporal_validity")?.status).toBe("block");

      const partial = await researchFeasibilityGateCommand({
        question: "Longitudinal study from 2014 to 2022 of treatment and mortality.",
        dataPath,
        method: "logistic-regression",
        outcome: "mortality",
        exposure: "treatment",
        covariates: ["age"],
        period: "index_year",
        minRows: 80,
      });
      expect(partial.verdict).toBe("exploratory_only");
      expect(partial.warnings.join(" ")).toContain("TEMPORAL_WINDOW_LEFT_TRUNCATED");
      expect(partial.warnings.join(" ")).toContain("TEMPORAL_WINDOW_RIGHT_TRUNCATED");

      const covered = await researchFeasibilityGateCommand({
        question: "Longitudinal study from 2016 to 2018 of treatment and mortality.",
        dataPath,
        method: "logistic-regression",
        outcome: "mortality",
        exposure: "treatment",
        covariates: ["age"],
        minRows: 80,
      });
      expect(covered.blockers.join(" ")).not.toContain("TEMPORAL_WINDOW");
      expect(covered.warnings.join(" ")).not.toContain("TEMPORAL_WINDOW");
      expect(covered.domains.find(domain => domain.id === "temporal_validity")?.rationale).toContain("index_year range 2015-2019");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("uses analysis-complete binary levels for diagnostic accuracy feasibility", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "agenteer-feasibility-diagnostic-complete-"));
    try {
      const data = path.join(dir, "diagnostic.csv");
      await writeFile(data, [
        "reference_status,index_status,age",
        ...Array.from({ length: 15 }, () => "positive,detected,62"),
        ...Array.from({ length: 10 }, () => "positive,not_detected,64"),
        ...Array.from({ length: 5 }, () => "negative,detected,59"),
        ...Array.from({ length: 20 }, () => "negative,not_detected,57"),
        ...Array.from({ length: 5 }, () => "pending,,60"),
        ...Array.from({ length: 5 }, () => ",indeterminate,61"),
      ].join("\n"));

      const result = await researchFeasibilityGateCommand({
        question: "How accurately does the index status detect the reference status?",
        dataPath: data,
        method: "diagnostic-accuracy",
        outcome: "reference_status",
        exposure: "index_status",
        minRows: 40,
      });

      expect(result.completeCase.completeValueCounts.reference_status).toEqual({ positive: 25, negative: 25 });
      expect(result.completeCase.completeValueCounts.index_status).toEqual({ detected: 20, not_detected: 30 });
      expect(result.blockers.join(" ")).not.toContain("METHOD_DIAGNOSTIC_REFERENCE_REQUIRED");
      expect(result.blockers.join(" ")).not.toContain("METHOD_DIAGNOSTIC_INDEX_REQUIRED");
      expect(result.verdict).not.toBe("reject");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("rejects grouped and correlation methods when analyzed rows lose required variation", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "agenteer-feasibility-variation-complete-"));
    try {
      const groupedData = path.join(dir, "grouped.csv");
      await writeFile(groupedData, [
        "outcome,group,age",
        ...Array.from({ length: 40 }, (_, index) => `${10 + index / 10},control,${50 + index % 20}`),
        ...Array.from({ length: 20 }, (_, index) => `,treated,${55 + index % 10}`),
      ].join("\n"));

      const grouped = await researchFeasibilityGateCommand({
        question: "Does outcome differ by group?",
        dataPath: groupedData,
        method: "anova",
        outcome: "outcome",
        group: "group",
        minRows: 30,
      });

      expect(grouped.completeCase.completeValueCounts.group).toEqual({ control: 40 });
      expect(grouped.verdict).toBe("reject");
      expect(grouped.blockers.join(" ")).toContain("METHOD_GROUP_LEVELS_REQUIRED");

      const correlationData = path.join(dir, "correlation.csv");
      await writeFile(correlationData, [
        "x,y,z",
        ...Array.from({ length: 45 }, (_, index) => `1,${2 + index / 5},${index % 3}`),
        ...Array.from({ length: 20 }, (_, index) => `${2 + index / 10},,${index % 3}`),
      ].join("\n"));

      const correlation = await researchFeasibilityGateCommand({
        question: "Are x and y correlated?",
        dataPath: correlationData,
        method: "pearson",
        outcome: "y",
        exposure: "x",
        minRows: 30,
      });

      expect(correlation.completeCase.completeValueCounts.x).toEqual({ "1": 45 });
      expect(correlation.verdict).toBe("reject");
      expect(correlation.blockers.join(" ")).toContain("METHOD_CORRELATION_VARIATION_REQUIRED");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("uses analysis-complete numeric domains for count, positive-outcome, and survival feasibility", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "agenteer-feasibility-numeric-complete-"));
    try {
      const countData = path.join(dir, "count.csv");
      await writeFile(countData, [
        "visit_count,treatment,age",
        ...Array.from({ length: 60 }, (_, index) => `${index % 5},${index % 2},${45 + index % 30}`),
        ...Array.from({ length: 8 }, () => "2.5,1,"),
      ].join("\n"));

      const count = await researchFeasibilityGateCommand({
        question: "Is treatment associated with visit counts?",
        dataPath: countData,
        method: "poisson-regression",
        outcome: "visit_count",
        exposure: "treatment",
        covariates: ["age"],
        minRows: 50,
      });
      expect(count.completeCase.completeValueCounts.visit_count).toEqual({ "0": 12, "1": 12, "2": 12, "3": 12, "4": 12 });
      expect(count.blockers.join(" ")).not.toContain("METHOD_COUNT_OUTCOME_REQUIRED");
      expect(count.verdict).not.toBe("reject");

      const positiveData = path.join(dir, "positive.csv");
      await writeFile(positiveData, [
        "cost,treatment,age",
        ...Array.from({ length: 60 }, (_, index) => `${(1 + index / 10).toFixed(2)},${index % 2},${45 + index % 30}`),
        ...Array.from({ length: 8 }, () => "0,1,"),
      ].join("\n"));

      const gamma = await researchFeasibilityGateCommand({
        question: "Is treatment associated with cost?",
        dataPath: positiveData,
        method: "gamma-glm",
        outcome: "cost",
        exposure: "treatment",
        covariates: ["age"],
        minRows: 50,
      });
      expect(gamma.completeCase.completeValueCounts.cost["0"]).toBeUndefined();
      expect(gamma.blockers.join(" ")).not.toContain("METHOD_POSITIVE_OUTCOME_REQUIRED");
      expect(gamma.verdict).not.toBe("reject");

      const survivalData = path.join(dir, "survival.csv");
      await writeFile(survivalData, [
        "time,event,treatment,age",
        ...Array.from({ length: 60 }, (_, index) => `${1 + index},${index < 20 ? 1 : 0},${index % 2},${45 + index % 30}`),
        ...Array.from({ length: 8 }, () => "-1,0,1,"),
      ].join("\n"));

      const cox = await researchFeasibilityGateCommand({
        question: "Is treatment associated with time to event?",
        dataPath: survivalData,
        method: "cox-proportional-hazards",
        time: "time",
        event: "event",
        exposure: "treatment",
        covariates: ["age"],
        minRows: 50,
      });
      expect(cox.completeCase.completeValueCounts.time["-1"]).toBeUndefined();
      expect(cox.blockers.join(" ")).not.toContain("METHOD_NONNEGATIVE_TIME_REQUIRED");
      expect(cox.verdict).not.toBe("reject");

      const recurrentData = path.join(dir, "recurrent.csv");
      await writeFile(recurrentData, recurrentIntervalCsv(72));
      const recurrent = await researchFeasibilityGateCommand({
        question: "Do treatment intervals change recurrent event hazards?",
        dataPath: recurrentData,
        method: "recurrent-event-cox",
        start: "start",
        stop: "stop",
        event: "event",
        id: "subject",
        exposure: "arm",
        covariates: ["severity"],
        minRows: 50,
      });
      expect(recurrent.blockers.join(" ")).not.toContain("METHOD_REQUIRED_ARGUMENTS");
      expect(recurrent.variableChecks.map(check => `${check.role}:${check.name}`)).toEqual(expect.arrayContaining([
        "start:start",
        "stop:stop",
        "event:event",
        "id:subject",
      ]));
      expect(recurrent.verdict).not.toBe("reject");

      const recurrentMissingStart = await researchFeasibilityGateCommand({
        question: "Do treatment intervals change recurrent event hazards?",
        dataPath: recurrentData,
        method: "recurrent-event-cox",
        stop: "stop",
        event: "event",
        id: "subject",
        exposure: "arm",
        covariates: ["severity"],
        minRows: 50,
      });
      expect(recurrentMissingStart.verdict).toBe("reject");
      expect(recurrentMissingStart.blockers.join(" ")).toContain("METHOD_REQUIRED_ARGUMENTS");
      expect(recurrentMissingStart.blockers.join(" ")).toContain("start");

      const zeroGroupEventsData = path.join(dir, "survival-zero-group-events.csv");
      await writeFile(zeroGroupEventsData, [
        "time,event,treatment,age",
        ...Array.from({ length: 30 }, (_, index) => `${10 + index},0,treated,${55 + index % 15}`),
        ...Array.from({ length: 15 }, (_, index) => `${12 + index},1,control,${60 + index % 15}`),
        ...Array.from({ length: 25 }, (_, index) => `${20 + index},0,control,${50 + index % 15}`),
      ].join("\n"));
      const zeroGroupEvents = await researchFeasibilityGateCommand({
        question: "Do survival outcomes differ by treatment group?",
        dataPath: zeroGroupEventsData,
        method: "log-rank",
        time: "time",
        event: "event",
        group: "treatment",
        minRows: 50,
      });
      expect(zeroGroupEvents.verdict).toBe("exploratory_only");
      expect(zeroGroupEvents.warnings.join(" ")).toContain("METHOD_SURVIVAL_GROUP_ZERO_EVENTS");

      const sparseGroupEventsData = path.join(dir, "survival-sparse-group-events.csv");
      await writeFile(sparseGroupEventsData, [
        "time,event,treatment,age",
        ...Array.from({ length: 4 }, (_, index) => `${10 + index},1,treated,${55 + index}`),
        ...Array.from({ length: 36 }, (_, index) => `${14 + index},0,treated,${50 + index % 15}`),
        ...Array.from({ length: 15 }, (_, index) => `${12 + index},1,control,${60 + index % 15}`),
        ...Array.from({ length: 25 }, (_, index) => `${20 + index},0,control,${50 + index % 15}`),
      ].join("\n"));
      const sparseGroupEvents = await researchFeasibilityGateCommand({
        question: "Is treatment associated with survival after adjustment?",
        dataPath: sparseGroupEventsData,
        method: "cox-proportional-hazards",
        time: "time",
        event: "event",
        exposure: "treatment",
        covariates: ["age"],
        minRows: 50,
      });
      expect(sparseGroupEvents.verdict).toBe("exploratory_only");
      expect(sparseGroupEvents.warnings.join(" ")).toContain("METHOD_SURVIVAL_GROUP_SPARSE_EVENTS");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("rejects invalid weight and offset columns before count-rate or weighted execution", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "agenteer-feasibility-weight-offset-"));
    try {
      const offsetData = path.join(dir, "bad-offset.csv");
      await writeFile(offsetData, [
        "visit_count,treatment,person_time",
        ...Array.from({ length: 30 }, (_, index) => `${index % 4},${index % 2},${index === 0 ? 0 : (0.5 + index / 10).toFixed(2)}`),
      ].join("\n"));

      const offset = await researchFeasibilityGateCommand({
        question: "Is treatment associated with visit-count incidence rates?",
        dataPath: offsetData,
        method: "poisson-regression",
        outcome: "visit_count",
        exposure: "treatment",
        offset: "person_time",
        minRows: 20,
      });
      expect(offset.verdict).toBe("reject");
      expect(offset.blockers.join(" ")).toContain("Offset/person-time variable 'person_time' must be strictly positive in analyzed rows");
      expect(offset.variableChecks.find(check => check.role === "offset")?.issues.map(issue => issue.code)).toContain("NONPOSITIVE_OFFSET");

      const weightedData = path.join(dir, "bad-weight.csv");
      await writeFile(weightedData, [
        "y,x,analysis_weight",
        ...Array.from({ length: 30 }, (_, index) => `${2 + index / 5},${index % 2},${index === 0 ? -1 : (1 + index / 20).toFixed(2)}`),
      ].join("\n"));

      const weighted = await researchFeasibilityGateCommand({
        question: "Is x associated with y using analysis weights?",
        dataPath: weightedData,
        method: "linear-regression",
        outcome: "y",
        exposure: "x",
        weight: "analysis_weight",
        minRows: 20,
      });
      expect(weighted.verdict).toBe("reject");
      expect(weighted.blockers.join(" ")).toContain("Weight variable 'analysis_weight' must be nonnegative in analyzed rows");
      expect(weighted.variableChecks.find(check => check.role === "weight")?.issues.map(issue => issue.code)).toContain("NEGATIVE_WEIGHT");

      const marginalInvalidData = path.join(dir, "marginal-invalid.csv");
      await writeFile(marginalInvalidData, [
        "visit_count,treatment,person_time,analysis_weight,age",
        "1,1,0,-1,",
        ...Array.from({ length: 35 }, (_, index) => `${index % 4},${index % 2},${(0.5 + index / 10).toFixed(2)},${(1 + index / 20).toFixed(2)},${45 + index % 20}`),
      ].join("\n"));

      const marginalOffset = await researchFeasibilityGateCommand({
        question: "Is treatment associated with visit-count incidence rates after adjustment?",
        dataPath: marginalInvalidData,
        method: "poisson-regression",
        outcome: "visit_count",
        exposure: "treatment",
        offset: "person_time",
        covariates: ["age"],
        minRows: 20,
      });
      expect(marginalOffset.verdict).not.toBe("reject");
      expect(marginalOffset.blockers.join(" ")).not.toContain("person_time");
      expect(marginalOffset.variableChecks.find(check => check.role === "offset")?.issues.map(issue => issue.code)).toContain("MARGINAL_NONPOSITIVE_OFFSET");

      const marginalWeight = await researchFeasibilityGateCommand({
        question: "Is treatment associated with visit count using analysis weights after adjustment?",
        dataPath: marginalInvalidData,
        method: "linear-regression",
        outcome: "visit_count",
        exposure: "treatment",
        weight: "analysis_weight",
        covariates: ["age"],
        minRows: 20,
      });
      expect(marginalWeight.verdict).not.toBe("reject");
      expect(marginalWeight.blockers.join(" ")).not.toContain("analysis_weight");
      expect(marginalWeight.variableChecks.find(check => check.role === "weight")?.issues.map(issue => issue.code)).toContain("MARGINAL_NEGATIVE_WEIGHT");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("flags degenerate paired and repeated-measure designs during feasibility", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "agenteer-feasibility-repeated-degenerate-"));
    try {
      const wideData = path.join(dir, "wide.csv");
      await writeFile(wideData, [
        "pre,post,followup,bin1,bin2,bin3",
        ...Array.from({ length: 40 }, (_, index) => `${index},${index},${index},${index % 2},${index % 2},${index % 2}`),
      ].join("\n"));

      const paired = await researchFeasibilityGateCommand({
        question: "Did the paired measurement change?",
        dataPath: wideData,
        method: "paired-t-test",
        variables: ["pre", "post"],
        minRows: 30,
      });
      expect(paired.verdict).toBe("exploratory_only");
      expect(paired.warnings.join(" ")).toContain("METHOD_PAIRED_DIFFERENCE_VARIATION_REQUIRED");

      const friedman = await researchFeasibilityGateCommand({
        question: "Do repeated measurements differ?",
        dataPath: wideData,
        method: "friedman",
        variables: ["pre", "post", "followup"],
        minRows: 30,
      });
      expect(friedman.verdict).toBe("exploratory_only");
      expect(friedman.warnings.join(" ")).toContain("METHOD_REPEATED_WITHIN_SUBJECT_VARIATION_REQUIRED");

      const cochran = await researchFeasibilityGateCommand({
        question: "Do repeated binary measurements differ?",
        dataPath: wideData,
        method: "cochran-q",
        variables: ["bin1", "bin2", "bin3"],
        minRows: 30,
      });
      expect(cochran.verdict).toBe("exploratory_only");
      expect(cochran.warnings.join(" ")).toContain("METHOD_REPEATED_BINARY_DISCORDANCE_REQUIRED");

      const longData = path.join(dir, "long.csv");
      await writeFile(longData, [
        "subject,period,y",
        ...Array.from({ length: 30 }, (_, subject) => [
          `${subject},0,${subject}`,
          `${subject},1,${subject}`,
        ]).flat(),
      ].join("\n"));

      const repeatedAnova = await researchFeasibilityGateCommand({
        question: "Does outcome differ across repeated periods?",
        dataPath: longData,
        method: "repeated-measures-anova",
        outcome: "y",
        exposure: "period",
        cluster: "subject",
        minRows: 30,
      });
      expect(repeatedAnova.verdict).toBe("exploratory_only");
      expect(repeatedAnova.warnings.join(" ")).toContain("METHOD_REPEATED_OUTCOME_VARIATION_REQUIRED");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("rejects longitudinal models with insufficient complete-case cluster support", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "agenteer-feasibility-longitudinal-support-"));
    try {
      const lowClusterData = path.join(dir, "low-clusters.csv");
      await writeFile(lowClusterData, [
        "subject,period,y",
        ...Array.from({ length: 7 }, (_, subject) => [
          `${subject},0,${subject}`,
          `${subject},1,${subject + 1}`,
        ]).flat(),
      ].join("\n"));

      const lowCluster = await researchFeasibilityGateCommand({
        question: "Do repeated outcomes differ over time?",
        dataPath: lowClusterData,
        method: "linear-mixed-model",
        outcome: "y",
        exposure: "period",
        cluster: "subject",
        minRows: 10,
      });
      expect(lowCluster.verdict).toBe("reject");
      expect(lowCluster.blockers.join(" ")).toContain("METHOD_LONGITUDINAL_CLUSTER_SUPPORT_REQUIRED");

      const singletonData = path.join(dir, "singleton-clusters.csv");
      await writeFile(singletonData, [
        "subject,period,y",
        "0,0,0",
        ...Array.from({ length: 7 }, (_, index) => {
          const subject = index + 1;
          return [
            `${subject},0,${subject}`,
            `${subject},1,${subject + 1}`,
          ];
        }).flat(),
      ].join("\n"));

      const singleton = await researchFeasibilityGateCommand({
        question: "Do repeated outcomes differ over time?",
        dataPath: singletonData,
        method: "gee",
        outcome: "y",
        exposure: "period",
        cluster: "subject",
        minRows: 10,
      });
      expect(singleton.verdict).toBe("reject");
      expect(singleton.blockers.join(" ")).toContain("METHOD_LONGITUDINAL_REPEATED_OBSERVATIONS_REQUIRED");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("rejects unsupported measurement, unsupervised, and p-value utility methods during feasibility", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "agenteer-feasibility-measurement-support-"));
    try {
      const dataPath = path.join(dir, "measurement.csv");
      await writeFile(dataPath, [
        "rater_a,rater_b,constant_feature,varying_feature,p_value",
        ...Array.from({ length: 30 }, (_, index) => [
          "same",
          index % 2 === 0 ? "yes" : "no",
          "1",
          String(index),
          index === 0 ? "1.2" : "0.05",
        ].join(",")),
      ].join("\n"));

      const kappa = await researchFeasibilityGateCommand({
        question: "Do two raters agree?",
        dataPath,
        method: "reliability-kappa",
        variables: ["rater_a", "rater_b"],
        minRows: 20,
      });
      expect(kappa.verdict).toBe("reject");
      expect(kappa.blockers.join(" ")).toContain("METHOD_KAPPA_RATER_LEVELS_REQUIRED");

      const pca = await researchFeasibilityGateCommand({
        question: "Can we reduce feature dimensionality?",
        dataPath,
        method: "pca",
        variables: ["constant_feature", "varying_feature"],
        minRows: 20,
      });
      expect(pca.verdict).toBe("reject");
      expect(pca.blockers.join(" ")).toContain("METHOD_NUMERIC_VARIABLE_COUNT_REQUIRED");

      const pValues = await researchFeasibilityGateCommand({
        question: "Can we correct p-values?",
        dataPath,
        method: "multiple-comparison-correction",
        variables: ["p_value"],
        minRows: 20,
      });
      expect(pValues.verdict).toBe("reject");
      expect(pValues.blockers.join(" ")).toContain("METHOD_PVALUE_DOMAIN_REQUIRED");

      const power = await researchFeasibilityGateCommand({
        question: "How much sample size do we need?",
        dataPath,
        method: "power-sample-size",
        outcomeThreshold: -0.1,
        exposureThreshold: 1.2,
        minRows: 20,
      });
      expect(power.verdict).toBe("reject");
      expect(power.blockers.join(" ")).toContain("METHOD_POWER_EFFECT_SIZE_REQUIRED");
      expect(power.blockers.join(" ")).toContain("METHOD_POWER_TARGET_REQUIRED");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("rejects unsupported causal and quasi-experimental designs during feasibility", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "agenteer-feasibility-causal-support-"));
    try {
      const didData = path.join(dir, "did.csv");
      await writeFile(didData, [
        "y,treatment,post",
        ...Array.from({ length: 10 }, (_, index) => `${index},0,0`),
        ...Array.from({ length: 10 }, (_, index) => `${index + 1},0,1`),
        ...Array.from({ length: 10 }, (_, index) => `${index + 2},1,1`),
      ].join("\n"));

      const did = await researchFeasibilityGateCommand({
        question: "Did the intervention change outcomes after implementation?",
        dataPath: didData,
        method: "difference-in-differences",
        outcome: "y",
        exposure: "treatment",
        post: "post",
        minRows: 20,
      });
      expect(did.verdict).toBe("reject");
      expect(did.blockers.join(" ")).toContain("METHOD_DID_CELL_SUPPORT_REQUIRED");

      const itsData = path.join(dir, "its.csv");
      await writeFile(itsData, [
        "y,time,post",
        ...Array.from({ length: 8 }, (_, index) => `${index},0,0`),
        ...Array.from({ length: 8 }, (_, index) => `${index + 2},1,1`),
        ...Array.from({ length: 8 }, (_, index) => `${index + 3},2,1`),
      ].join("\n"));

      const its = await researchFeasibilityGateCommand({
        question: "Did the intervention change the time trend?",
        dataPath: itsData,
        method: "interrupted-time-series",
        outcome: "y",
        time: "time",
        post: "post",
        minRows: 20,
      });
      expect(its.verdict).toBe("reject");
      expect(its.blockers.join(" ")).toContain("METHOD_ITS_SEGMENT_TIME_SUPPORT_REQUIRED");

      const rddData = path.join(dir, "rdd.csv");
      await writeFile(rddData, [
        "y,running",
        ...Array.from({ length: 3 }, (_, index) => `${index},${-3 + index}`),
        ...Array.from({ length: 20 }, (_, index) => `${index + 4},${index}`),
      ].join("\n"));

      const rdd = await researchFeasibilityGateCommand({
        question: "Is there a discontinuity at the assignment cutoff?",
        dataPath: rddData,
        method: "regression-discontinuity",
        outcome: "y",
        runningVariable: "running",
        cutoff: 0,
        minRows: 20,
      });
      expect(rdd.verdict).toBe("reject");
      expect(rdd.blockers.join(" ")).toContain("METHOD_RDD_CUTOFF_SUPPORT_REQUIRED");

      const ivData = path.join(dir, "iv.csv");
      await writeFile(ivData, [
        "y,exposure,instrument",
        ...Array.from({ length: 30 }, (_, index) => `${index},${index % 5},1`),
      ].join("\n"));

      const iv = await researchFeasibilityGateCommand({
        question: "What is the instrumented effect of exposure on outcome?",
        dataPath: ivData,
        method: "instrumental-variables-2sls",
        outcome: "y",
        exposure: "exposure",
        instrument: "instrument",
        minRows: 20,
      });
      expect(iv.verdict).toBe("reject");
      expect(iv.blockers.join(" ")).toContain("METHOD_INSTRUMENT_VARIATION_REQUIRED");

      const sparsePropensityData = path.join(dir, "sparse-propensity.csv");
      await writeFile(sparsePropensityData, [
        "outcome,treatment,age,risk",
        ...Array.from({ length: 4 }, (_, index) => `${index % 2},treated,${50 + index},${0.2 + index / 100}`),
        ...Array.from({ length: 96 }, (_, index) => `${index % 3 === 0 ? 1 : 0},control,${45 + index % 30},${0.1 + index / 200}`),
      ].join("\n"));

      const sparsePropensity = await researchFeasibilityGateCommand({
        question: "What is the treatment effect after propensity score matching?",
        dataPath: sparsePropensityData,
        method: "propensity-score-matching",
        outcome: "outcome",
        exposure: "treatment",
        covariates: ["age", "risk"],
        minRows: 80,
      });
      expect(sparsePropensity.verdict).toBe("reject");
      expect(sparsePropensity.blockers.join(" ")).toContain("METHOD_TREATMENT_ARM_SUPPORT_REQUIRED");

      const limitedPropensityData = path.join(dir, "limited-propensity.csv");
      await writeFile(limitedPropensityData, [
        "outcome,treatment,age,risk",
        ...Array.from({ length: 12 }, (_, index) => `${index % 2},treated,${50 + index},${0.2 + index / 100}`),
        ...Array.from({ length: 88 }, (_, index) => `${index % 3 === 0 ? 1 : 0},control,${45 + index % 30},${0.1 + index / 200}`),
      ].join("\n"));

      const limitedPropensity = await researchFeasibilityGateCommand({
        question: "What is the treatment effect after propensity score weighting?",
        dataPath: limitedPropensityData,
        method: "propensity-score-weighting",
        outcome: "outcome",
        exposure: "treatment",
        covariates: ["age", "risk"],
        minRows: 80,
      });
      expect(limitedPropensity.verdict).toBe("exploratory_only");
      expect(limitedPropensity.warnings.join(" ")).toContain("METHOD_TREATMENT_ARM_SUPPORT_SPARSE");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("rejects unsupported missing-data methods during feasibility", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "agenteer-feasibility-missingness-support-"));
    try {
      const completeData = path.join(dir, "complete.csv");
      await writeFile(completeData, [
        "outcome,age,bmi",
        ...Array.from({ length: 30 }, (_, index) => `${index},${40 + index},${25 + index / 10}`),
      ].join("\n"));

      const mice = await researchFeasibilityGateCommand({
        question: "Can missing covariate values be imputed?",
        dataPath: completeData,
        method: "multiple-imputation-mice",
        variables: ["age", "bmi"],
        minRows: 20,
      });
      expect(mice.verdict).toBe("reject");
      expect(mice.blockers.join(" ")).toContain("METHOD_IMPUTATION_MISSINGNESS_REQUIRED");

      const ipw = await researchFeasibilityGateCommand({
        question: "Should we weight for outcome missingness?",
        dataPath: completeData,
        method: "missingness-ipw",
        outcome: "outcome",
        covariates: ["age", "bmi"],
        minRows: 20,
      });
      expect(ipw.verdict).toBe("exploratory_only");
      expect(ipw.warnings.join(" ")).toContain("METHOD_MISSINGNESS_TARGET_REQUIRED");

      const sensitivity = await researchFeasibilityGateCommand({
        question: "Is complete-case inference sensitive to missingness?",
        dataPath: completeData,
        method: "complete-case-sensitivity",
        outcome: "outcome",
        variables: ["age", "bmi"],
        minRows: 20,
      });
      expect(sensitivity.verdict).toBe("reject");
      expect(sensitivity.blockers.join(" ")).toContain("METHOD_MISSINGNESS_SENSITIVITY_REQUIRED");

      const categoricalMissing = path.join(dir, "categorical-missing.csv");
      await writeFile(categoricalMissing, [
        "category,label",
        "a,x",
        "b,",
        "c,y",
      ].join("\n"));
      const nonnumericMice = await researchFeasibilityGateCommand({
        question: "Can categorical missing values be imputed locally?",
        dataPath: categoricalMissing,
        method: "multiple-imputation-mice",
        variables: ["category", "label"],
      });
      expect(nonnumericMice.verdict).toBe("reject");
      expect(nonnumericMice.blockers.join(" ")).toContain("METHOD_IMPUTATION_NUMERIC_VARIABLES_REQUIRED");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("rejects prediction evaluation when the score has only binary test resolution", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "agenteer-feasibility-prediction-support-"));
    try {
      const dataPath = path.join(dir, "binary-score.csv");
      await writeFile(dataPath, [
        "outcome,test_index",
        ...Array.from({ length: 40 }, (_, index) => `${index % 2},${index % 2}`),
      ].join("\n"));

      const result = await researchFeasibilityGateCommand({
        question: "How well does this model score predict the outcome?",
        dataPath,
        method: "prediction-evaluation",
        outcome: "outcome",
        exposure: "test_index",
        minRows: 20,
      });
      expect(result.verdict).toBe("exploratory_only");
      expect(result.warnings.join(" ")).toContain("METHOD_PREDICTION_SCORE_RESOLUTION_REQUIRED");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("downgrades formal modeling when selected variables have high complete-case attrition", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "agenteer-feasibility-attrition-warning-"));
    try {
      const data = path.join(dir, "rows.csv");
      await writeFile(data, [
        "mortality,treatment,age,risk_score,lab",
        ...Array.from({ length: 200 }, (_, index) => {
          const lab = index < 80 ? (3.5 + index / 100).toFixed(2) : "";
          const mortality = index < 80 ? index % 2 : index < 120 ? 1 : 0;
          return `${mortality},${Math.floor(index / 2) % 2},${45 + index % 40},${(0.2 + (index % 20) / 10).toFixed(2)},${lab}`;
        }),
      ].join("\n"));

      const result = await researchFeasibilityGateCommand({
        question: "Is treatment associated with mortality after adjustment for baseline labs?",
        dataPath: data,
        method: "logistic-regression",
        outcome: "mortality",
        exposure: "treatment",
        covariates: ["age", "risk_score", "lab"],
        minRows: 60,
      });

      const missingness = result.domains.find(domain => domain.id === "missingness");
      expect(result.completeCase).toMatchObject({ scanned: true, scannedRows: 200, completeRows: 80 });
      expect(result.verdict).toBe("exploratory_only");
      expect(result.issues).toEqual(expect.arrayContaining([
        expect.objectContaining({
          severity: "warning",
          code: "COMPLETE_CASE_ATTRITION_HIGH",
          source: "domain",
          domainId: "missingness",
        }),
      ]));
      expect(missingness).toMatchObject({
        status: "warning",
        warnings: expect.arrayContaining([expect.stringContaining("COMPLETE_CASE_ATTRITION_HIGH")]),
      });
      expect(result.requiredModifications.join(" ")).toMatch(/complete-case|missingness/i);
      expect(renderResearchFeasibilityGateMarkdown(result)).toContain("## Typed Issues");
      expect(renderResearchFeasibilityGateMarkdown(result)).toContain("COMPLETE_CASE_ATTRITION_HIGH");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("rejects inferential modeling when complete-case attrition is extreme", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "agenteer-feasibility-attrition-block-"));
    try {
      const data = path.join(dir, "rows.csv");
      await writeFile(data, [
        "mortality,treatment,age,risk_score,lab",
        ...Array.from({ length: 200 }, (_, index) => {
          const lab = index < 25 ? (3.5 + index / 100).toFixed(2) : "";
          return `${index < 80 ? 1 : 0},${index % 2},${45 + index % 40},${(0.2 + (index % 20) / 10).toFixed(2)},${lab}`;
        }),
      ].join("\n"));

      const result = await researchFeasibilityGateCommand({
        question: "Is treatment associated with mortality after adjustment for baseline labs?",
        dataPath: data,
        method: "logistic-regression",
        outcome: "mortality",
        exposure: "treatment",
        covariates: ["age", "risk_score", "lab"],
        minRows: 40,
      });

      const missingness = result.domains.find(domain => domain.id === "missingness");
      expect(result.completeCase).toMatchObject({ scanned: true, scannedRows: 200, completeRows: 25 });
      expect(result.verdict).toBe("reject");
      expect(result.issues.map(issue => issue.code)).toContain("COMPLETE_CASE_ATTRITION_EXTREME");
      expect(missingness).toMatchObject({
        status: "block",
        blockers: expect.arrayContaining([expect.stringContaining("COMPLETE_CASE_ATTRITION_EXTREME")]),
      });
      expect(result.blockers.join(" ")).toContain("COMPLETE_CASE_ATTRITION_EXTREME");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("writes rich feasibility verdicts from the controller state machine", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "agenteer-controller-feasibility-rich-"));
    try {
      const data = path.join(dir, "rows.csv");
      await writeFile(data, binaryCsv({ rows: 120, events: 40 }));

      const result = await researchControllerRunCommand({
        question: "Among adults in a cohort, is treatment group associated with mortality?",
        outDir: path.join(dir, "run"),
        dataPath: data,
        method: "logistic-regression",
        outcome: "mortality",
        exposure: "treatment",
        covariates: ["age", "risk_score"],
        maxSteps: 3,
      });

      const verdictPath = result.state.artifacts.find(artifact => artifact.kind === "controller-feasibility-verdict")?.path;
      expect(verdictPath).toBeTruthy();
      const raw = JSON.parse(await readFile(verdictPath ?? "", "utf-8")) as { controllerFeasibilityVerdict: ControllerFeasibilityVerdict };
      expect(raw.controllerFeasibilityVerdict.verdict).toBe("formal_analysis_ready");
      expect(raw.controllerFeasibilityVerdict.domains.length).toBeGreaterThanOrEqual(10);
      expect(raw.controllerFeasibilityVerdict.internalReviews).toHaveLength(5);
      expect(raw.controllerFeasibilityVerdict.issues).toEqual(expect.any(Array));
      expect(raw.controllerFeasibilityVerdict.requiredModifications).toEqual(expect.arrayContaining([
        expect.stringContaining("AnalysisSpec"),
      ]));
      expect(raw.controllerFeasibilityVerdict.nextAction).toMatch(/Formal analysis|Proceed/);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }, 30_000);
});

function binaryCsv(opts: { rows: number; events: number }): string {
  const lines = ["mortality,treatment,age,risk_score"];
  for (let i = 0; i < opts.rows; i += 1) {
    const mortality = i < opts.events ? 1 : 0;
    const treatment = i % 2;
    const age = 45 + i % 40;
    const risk = 0.2 + (i % 20) / 10;
    lines.push(`${mortality},${treatment},${age},${risk.toFixed(2)}`);
  }
  return lines.join("\n");
}

function recurrentIntervalCsv(subjects: number): string {
  const lines = ["subject,start,stop,event,arm,severity"];
  for (let subject = 1; subject <= subjects; subject += 1) {
    const arm = subject % 2;
    const severity = 0.25 + (subject % 8) * 0.07 + arm * 0.1;
    for (let interval = 0; interval < 3; interval += 1) {
      const start = interval * 1.5;
      const stop = start + 1.1 + (subject % 4) * 0.05;
      const event = ((subject + interval * 3) % (arm ? 5 : 8) === 0 || (arm === 1 && interval === 2 && subject % 11 === 0)) ? 1 : 0;
      lines.push(`${subject},${start.toFixed(2)},${stop.toFixed(2)},${event},${arm},${severity.toFixed(3)}`);
    }
  }
  return lines.join("\n");
}
