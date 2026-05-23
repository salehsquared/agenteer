import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
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
