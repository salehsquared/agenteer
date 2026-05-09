import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  researchBenchmarkSuiteRunCommand,
  researchBenchmarkTrendCommand,
  researchExplorePlanCommand,
  researchManuscriptCommand,
  researchMethodQaCommand,
  researchRunInspectCommand,
  researchSpecV2Command,
  renderResearchRunInspectJson,
} from "../src/research-machine/commands.js";

describe("research trust layer", () => {
  it("runs methods-aware QA and blocks reader-facing causal overclaiming", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "agenteer-method-qa-"));
    try {
      await writeFixtureRun(dir, {
        paper: "# Study\n\nThe exposure causes better outcomes in this local dataset.",
        issues: [{ code: "LOW_EVENTS_PER_PREDICTOR", severity: "blocker", message: "Too few events for predictors." }],
      });
      const result = await researchMethodQaCommand({
        runDir: dir,
        outPath: path.join(dir, "method-qa.json"),
        reportPath: path.join(dir, "method-qa.md"),
      });
      expect(result.overallStatus).toBe("fail");
      expect(result.readiness).toBe("blocked");
      expect(result.checks.map(check => check.category)).toContain("claim_alignment");
      expect(result.outPath).toBe(path.join(dir, "method-qa.json"));
      expect(result.reportPath).toBe(path.join(dir, "method-qa.md"));
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("generates a structured manuscript and companion manuscript QA", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "agenteer-manuscript-"));
    try {
      await writeFixtureRun(dir);
      const result = await researchManuscriptCommand({ runDir: dir });
      expect(result.manuscriptMarkdown).toContain("## Abstract");
      expect(result.manuscriptMarkdown).toContain("## Methods");
      expect(result.manuscriptMarkdown).toContain("## What This Does And Does Not Show");
      expect(result.manuscriptMarkdown).not.toContain("AnalysisSpec");
      expect(result.manuscriptQa.sectionStatus.Abstract).toBe(true);
      expect(result.methodQa.checks.find(check => check.category === "claim_alignment")?.status).toBe("pass");
      expect(result.manuscriptPath).toBe(path.join(dir, "manuscript.md"));
      expect(result.qaPath).toBe(path.join(dir, "manuscript-qa.json"));
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("keeps generated manuscripts reader-facing when the run needs methods review", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "agenteer-manuscript-reader-"));
    try {
      await mkdir(dir, { recursive: true });
      await writeFile(path.join(dir, "analysis-results.json"), `${JSON.stringify({
        study: {
          title: "Heart Failure ICU Outcomes",
          question: "Among ICU admissions with heart failure diagnoses, how do first-day features relate to mortality and ICU length of stay?",
        },
        completeCaseN: 22580,
        eventCount: 3232,
        estimates: [{ term: "age", oddsRatio: 1.47, ciLow: 1.41, ciHigh: 1.55, pValue: 0.001 }],
      }, null, 2)}\n`);
      await writeFile(path.join(dir, "paper.md"), "# Heart Failure ICU Outcomes\n\nThis analysis estimates local associations and does not establish causality.\n");
      await writeFile(path.join(dir, "qa.json"), `${JSON.stringify({ status: "pass" }, null, 2)}\n`);
      await writeFile(path.join(dir, "cost-receipt.json"), `${JSON.stringify({ estimatedUsd: 0.01 }, null, 2)}\n`);

      const result = await researchManuscriptCommand({ runDir: dir });

      expect(result.manuscriptMarkdown).toContain("# Heart Failure ICU Outcomes");
      expect(result.manuscriptMarkdown).toContain("The methods review found advisory issues");
      expect(result.manuscriptMarkdown).not.toContain("needs_methods_review");
      expect(result.manuscriptMarkdown).not.toContain("Methods-aware QA");
      expect(result.manuscriptMarkdown).not.toContain("verified_online");
      expect(result.manuscriptQa.status).toBe("pass");
      expect(result.manuscriptQa.readability.internalJargonHits).toEqual([]);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("preserves rich runner paper sections when generating manuscripts", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "agenteer-rich-manuscript-"));
    try {
      await writeFixtureRun(dir, {
        paper: `# Heart Failure ICU Outcomes

## Plain-Language Summary

This analysis used ICU records to evaluate heart failure outcomes. The results are observational and do not establish causality.

## Research Question

Among ICU admissions with heart failure diagnoses, how do first-day features relate to mortality?

## Data Source

The analysis used a local research data cache and saved aggregate artifacts only.

## Cohort Definition

- First ICU stay cohort rows: 22580.
- Unique patients: 16583.

## Methods

Models used complete-case analysis for first-day severity, laboratory, and vital-sign predictors.

## Cohort Characteristics

- In-hospital mortality: 3339 of 22580 (14.8%).
- Male sex: 12423 of 22580 (55.0%).

## Mortality Model

Complete-case N=22250; deaths=3232; AUROC=0.775; average precision=0.443.
- sofa: adjusted OR 2.00 (1.92, 2.09), p=3.63e-207, per 1 SD.

## ICU Length Of Stay Model

Complete-case N=22240; R-squared=0.116.
- sofa: 20.5% change (19.2%, 21.8%), p=4.5e-248, per 1 SD.

## Missingness

- glucose_max: 194 missing (0.9%).

## Interpretation

This is a reproducible first-pass description of critically ill patients.

## Quality And Cost Controls

- QA status: pass.

## Limitations

- This is an observational ICU cohort analysis.

## Artifact Index

- analysis-results.json: model coefficients and metrics.
`,
      });

      const result = await researchManuscriptCommand({ runDir: dir });

      expect(result.manuscriptQa.status).toBe("pass");
      expect(result.manuscriptMarkdown).toContain("## Results");
      expect(result.manuscriptMarkdown).toContain("### Mortality Model");
      expect(result.manuscriptMarkdown).toContain("adjusted OR 2.00");
      expect(result.manuscriptMarkdown).toContain("### ICU Length Of Stay Model");
      expect(result.manuscriptMarkdown).toContain("### Cohort Characteristics");
      expect(result.manuscriptMarkdown).toContain("### Statistical Analysis");
      expect(result.manuscriptMarkdown).not.toContain("This analysis evaluates Among ICU");
      expect(result.manuscriptMarkdown).not.toContain("## Methods\n### Methods");
      expect(result.manuscriptMarkdown).not.toContain("## Limitations\n### Limitations");
      expect(result.manuscriptMarkdown).not.toContain("The outcome, exposure, and covariates should be read");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("unifies readiness, provenance, QA, cost, paper paths, and next action", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "agenteer-run-inspect-"));
    try {
      await writeFixtureRun(dir);
      await researchManuscriptCommand({ runDir: dir });
      const result = await researchRunInspectCommand({
        runDir: dir,
        outPath: path.join(dir, "run-inspection.json"),
        reportPath: path.join(dir, "run-inspection.md"),
      });
      const parsed = JSON.parse(renderResearchRunInspectJson(result)) as { runInspection: { provenance: { artifactCount: number } } };
      expect(result.provenance.artifactCount).toBeGreaterThan(0);
      expect(result.cost.estimatedUsd).toBe(0.01);
      expect(result.paperPath).toBe(path.join(dir, "paper.md"));
      expect(result.manuscriptPath).toBe(path.join(dir, "manuscript.md"));
      expect(parsed.runInspection.provenance.artifactCount).toBeGreaterThan(0);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("surfaces MedBrevia literature evidence in unified inspection readiness", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "agenteer-literature-inspect-"));
    try {
      await writeFixtureRun(dir);
      await writeFile(path.join(dir, "literature-search.json"), `${JSON.stringify({
        schemaVersion: 1,
        literatureSearch: {
          status: "succeeded",
          evidenceSummary: {
            sourceCount: 6,
            pubmedCount: 5,
            trialCount: 0,
            guidelineCount: 1,
            nonPubmedLaneCount: 1,
            highQualitySourceCount: 5,
            latestPublicationYear: 2026,
            plannedSearchCount: 3,
            selectedPmidCount: 5,
            briefingAvailable: true,
          },
        },
      }, null, 2)}\n`);
      await writeFile(path.join(dir, "literature-qa.json"), `${JSON.stringify({
        schemaVersion: 1,
        literatureQa: {
          status: "warning",
          evidenceSummary: { sourceCount: 6, highQualitySourceCount: 5 },
          citedSourceIds: ["pmid-1", "pmid-2"],
          checks: [{
            id: "citation_coverage",
            status: "warning",
            severity: "major",
            message: "Two high-quality sources are not cited in the paper.",
            evidenceRefs: ["literature-search.json"],
            recommendedAction: "Add citations or explain exclusion.",
          }],
          nextAction: "Review uncited high-quality literature before promotion.",
        },
      }, null, 2)}\n`);

      const result = await researchRunInspectCommand({ runDir: dir, reportPath: path.join(dir, "run-inspection.md") });

      expect(result.literature.status).toBe("warning");
      expect(result.qa.literatureQaStatus).toBe("warning");
      expect(result.literature.sourceCount).toBe(6);
      expect(result.literature.highQualitySourceCount).toBe(5);
      expect(result.literature.citedSourceCount).toBe(2);
      expect(result.readiness).toBe("needs_methods_review");
      expect(result.warnings).toContain("Literature QA has 1 warning(s).");
      expect(result.reportPath).toBe(path.join(dir, "run-inspection.md"));
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("ingests nested analysis-run stats artifacts when inspecting packet roots", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "agenteer-nested-run-inspect-"));
    try {
      const nested = path.join(root, "analysis-run", "stats-run");
      await writeFixtureRun(nested);
      await writeFile(path.join(root, "analysis-run", "paper.md"), "# Nested Paper\n\nThis analysis estimates an association and does not establish causality.\n");
      await writeFile(path.join(root, "analysis-run", "paper-qa.json"), `${JSON.stringify({ status: "pass" }, null, 2)}\n`);
      await writeFile(path.join(root, "rerun-stability.json"), `${JSON.stringify({ status: "pass" }, null, 2)}\n`);

      const result = await researchRunInspectCommand({ runDir: root });

      expect(result.paperPath).toBe(path.join(root, "analysis-run", "paper.md"));
      expect(result.qa.paperQaStatus).toBe("pass");
      expect(result.qa.rerunStabilityStatus).toBe("pass");
      expect(result.methodQa.methodSummary.detectedRunKind).toBe("stats-run");
      expect(result.methodQa.methodSummary.completeCaseN).toBe(120);
      expect(result.methodQa.checks.find(check => check.category === "missingness")?.status).toBe("pass");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("recognizes diagnostic accuracy performance metrics as estimate evidence", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "agenteer-diagnostic-qa-"));
    try {
      await writeFixtureRun(root);
      await writeFile(path.join(root, "stats-run.json"), `${JSON.stringify({
        status: "succeeded",
        method: "diagnostic-accuracy",
        completeCaseN: 180,
        estimates: [{
          term: "waist_cm",
          reference: "hba1c_pct",
          true_positive: 67,
          false_positive: 4,
          true_negative: 98,
          false_negative: 11,
          sensitivity: 0.86,
          sensitivity_ci_low: 0.76,
          sensitivity_ci_high: 0.92,
          specificity: 0.96,
          specificity_ci_low: 0.90,
          specificity_ci_high: 0.98,
          positive_predictive_value: 0.94,
          positive_predictive_value_ci_low: 0.86,
          positive_predictive_value_ci_high: 0.98,
          negative_predictive_value: 0.90,
          negative_predictive_value_ci_low: 0.83,
          negative_predictive_value_ci_high: 0.94,
        }],
      }, null, 2)}\n`);

      const result = await researchMethodQaCommand({ runDir: root });
      const effectCheck = result.checks.find(check => check.category === "effect_size");
      const collinearityCheck = result.checks.find(check => check.category === "collinearity");
      const influenceCheck = result.checks.find(check => check.category === "influence");

      expect(effectCheck?.status).toBe("pass");
      expect(effectCheck?.message).toContain("diagnostic performance");
      expect(collinearityCheck?.status).toBe("pass");
      expect(collinearityCheck?.message).toContain("not applicable");
      expect(influenceCheck?.status).toBe("pass");
      expect(influenceCheck?.message).toContain("not applicable");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("uses model denominators and high missingness to downgrade methods review", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "agenteer-denominator-qa-"));
    try {
      await writeFixtureRun(root);
      await writeFile(path.join(root, "analysis-results.json"), `${JSON.stringify({
        cohortSummary: { firstIcuStayRows: 1000 },
        missingness: [{ column: "blood_gas", missingFraction: 0.72 }],
        models: {
          mortality: {
            status: "fit",
            n: 250,
            events: 40,
            predictors: ["age", "severity", "blood_gas", "urine_output"],
            coefficients: [{ term: "severity", oddsRatio: 1.4, ci95: [1.1, 1.8], pValue: 0.01 }],
          },
        },
      }, null, 2)}\n`);

      const result = await researchMethodQaCommand({ runDir: root });
      const missingness = result.checks.find(check => check.category === "missingness");

      expect(result.methodSummary.completeCaseN).toBe(250);
      expect(result.methodSummary.eventCount).toBe(40);
      expect(result.methodSummary.predictorCount).toBe(4);
      expect(result.methodSummary.detectedModelFamilies).toContain("logistic");
      expect(missingness?.status).toBe("warning");
      expect(missingness?.message).toContain("25.0% of the cohort");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("surfaces string runner warnings as semantic plausibility evidence", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "agenteer-runner-warning-"));
    try {
      await writeFixtureRun(root);
      await writeFile(path.join(root, "qa.json"), `${JSON.stringify({
        status: "pass",
        warnings: ["Unprofiled required tables: derived-kdigo-stages.", "Diagnosis-code timing may not equal clinical onset timing."],
      }, null, 2)}\n`);

      const result = await researchMethodQaCommand({ runDir: root });
      const semantic = result.checks.find(check => check.category === "semantic_plausibility");

      expect(semantic?.status).toBe("warning");
      expect(semantic?.message).toMatch(/semantic|coding|plausibility|clinical/i);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("turns an exploration candidate into a formal AnalysisSpec V2 planning artifact", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "agenteer-explore-plan-"));
    try {
      const explorationPath = path.join(dir, "exploration.json");
      await writeFile(explorationPath, `${JSON.stringify({
        schemaVersion: 1,
        exploration: {
          dataPath: path.join(dir, "rows.json"),
          target: "mortality",
          tableSummary: { rowCount: 100, columnCount: 4 },
          explorationBurden: {
            promotionClearance: { level: "hold_for_methods_review", reasons: ["multiple exploratory pairs tested"] },
          },
          candidateQuestions: [{
            id: "q1",
            question: "Among ICU patients, is age associated with mortality?",
            outcome: "mortality",
            exposure: "age",
            routeIntent: "explanatory_association",
            promotionStatus: "needs_methods_review",
            promotionBlockers: [],
            requiredNextChecks: ["Review sparse events."],
          }],
        },
      }, null, 2)}\n`);
      const result = await researchExplorePlanCommand({
        explorationPath,
        questionId: "q1",
        dataset: "mimic",
        methodsReviewNote: "Reviewed exploratory status; planning only.",
        outPath: path.join(dir, "formal-plan.json"),
      });
      expect(result.status).toBe("needs_methods_review");
      expect(result.analysisSpecV2.schemaVersion).toBe(2);
      expect(result.analysisSpecV2.dataset).toBe("mimic");
      expect(result.analysisSpecV2.claimPolicy.causalLanguage).toBe("forbidden");
      expect(result.formalPlan.requiredBeforeExecution).toContain("Run method-select/modeling-plan against this spec before execution.");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("runs a continuous benchmark suite and computes trend evidence", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "agenteer-benchmark-suite-"));
    try {
      const runDir = path.join(root, "case-a");
      await mkdir(runDir, { recursive: true });
      await writeFixtureRun(runDir);
      await researchManuscriptCommand({ runDir });
      const outDir = path.join(root, "history");
      const suite = await researchBenchmarkSuiteRunCommand({ suiteDir: root, outDir });
      expect(suite.caseCount).toBeGreaterThanOrEqual(1);
      expect(suite.meanScore).toBeGreaterThan(0);
      const trend = await researchBenchmarkTrendCommand({ historyDir: outDir });
      expect(trend.runCount).toBe(1);
      expect(trend.trend).toBe("insufficient_history");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("benchmarks packet roots without double-counting nested runner directories", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "agenteer-benchmark-collapse-"));
    try {
      const packetRun = path.join(root, "packet-a", "analysis-run");
      await mkdir(path.join(packetRun, "stats-run"), { recursive: true });
      await writeFixtureRun(path.join(packetRun, "stats-run"));
      await writeFile(path.join(packetRun, "paper.md"), "# Nested Packet\n\nThis packet summarizes a local association and does not establish causality.\n");
      await writeFile(path.join(packetRun, "paper-qa.json"), `${JSON.stringify({ status: "pass" }, null, 2)}\n`);

      const suite = await researchBenchmarkSuiteRunCommand({ suiteDir: root });

      expect(suite.caseCount).toBe(1);
      expect(suite.cases[0]?.id).toBe("analysis-run");
      expect(suite.cases[0]?.runDir).toBe(packetRun);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});

async function writeFixtureRun(dir: string, opts: { paper?: string; issues?: unknown[] } = {}): Promise<void> {
  await mkdir(dir, { recursive: true });
  const specIn = path.join(dir, "analysis-spec.json");
  const specOut = path.join(dir, "analysis-spec-v2.json");
  await writeFile(specIn, `${JSON.stringify({
    analysisSpec: {
      id: "fixture-study",
      researchQuestion: "Is age associated with mortality in a local ICU cohort?",
      dataset: "mimic",
      variables: { outcome: ["mortality"], exposure: ["age"], covariates: ["sex"] },
      population: { description: ["Local ICU cohort"], filters: [] },
      surveyDesign: {},
      inferencePolicy: { estimandType: "associational", causalClaimsAllowed: false, allowedInference: "exploratory_association" },
      model: { binaryThreshold: 1 },
      execution: { maxRows: 1000 },
    },
  }, null, 2)}\n`);
  await researchSpecV2Command({ specPath: specIn, outPath: specOut });
  await writeFile(path.join(dir, "analysis-results.json"), `${JSON.stringify({
    readiness: "local_review_ready",
    completeCaseN: 120,
    eventCount: 30,
    predictorCount: 3,
    estimates: [{ term: "age", oddsRatio: 1.08, ciLow: 1.01, ciHigh: 1.15, pValue: 0.02 }],
    methodIssues: opts.issues ?? [],
  }, null, 2)}\n`);
  await writeFile(path.join(dir, "stats-run.json"), `${JSON.stringify({
    status: "succeeded",
    resultPosture: "bound_standard_table",
    completeCaseN: 120,
    estimates: [{ term: "age", oddsRatio: 1.08, ciLow: 1.01, ciHigh: 1.15, pValue: 0.02 }],
    issues: opts.issues ?? [],
  }, null, 2)}\n`);
  await writeFile(path.join(dir, "diagnostics.json"), `${JSON.stringify({ completeCaseN: 120, missingness: [] }, null, 2)}\n`);
  await writeFile(path.join(dir, "stats-qa.json"), `${JSON.stringify({ status: "pass", checks: [] }, null, 2)}\n`);
  await writeFile(path.join(dir, "paper.md"), opts.paper ?? "# ICU Mortality Study\n\nThis local analysis estimates whether age is associated with mortality. It does not establish causality.\n");
  await writeFile(path.join(dir, "qa.json"), `${JSON.stringify({ status: "pass" }, null, 2)}\n`);
  await writeFile(path.join(dir, "lifecycle.json"), `${JSON.stringify({ lifecycleStatus: "ready_for_local_review" }, null, 2)}\n`);
  await writeFile(path.join(dir, "rerun-stability.json"), `${JSON.stringify({ status: "pass" }, null, 2)}\n`);
  await writeFile(path.join(dir, "runner-record.json"), `${JSON.stringify({ status: "succeeded", analysisSpec: { binding: "spec-governed" } }, null, 2)}\n`);
  await writeFile(path.join(dir, "cost-receipt.json"), `${JSON.stringify({ estimatedUsd: 0.01, hardStopUsd: 1 }, null, 2)}\n`);
}
