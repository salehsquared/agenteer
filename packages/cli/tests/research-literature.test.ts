import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  researchAnalysisRunCommand,
  researchLiteratureContextCommand,
  researchLiteratureQaCommand,
  researchMedbreviaLiteratureSearchCommand,
  researchModelingPlanCommand,
} from "../src/index.js";

const python = path.resolve(".research-runtime/python/bin/python");

describe("MedBrevia literature search integration", () => {
  const servers: Array<{ close: () => Promise<void> }> = [];

  afterEach(async () => {
    await Promise.all(servers.map(server => server.close()));
    servers.length = 0;
  });

  it("normalizes MedBrevia SSE search events into a persisted evidence packet", async () => {
    const server = await startMockMedBreviaSearchServer();
    servers.push(server);
    const dir = await mkdtemp(path.join(os.tmpdir(), "agenteer-literature-search-"));
    try {
      const outPath = path.join(dir, "literature-search.json");
      const reportPath = path.join(dir, "literature-search.md");
      const result = await researchMedbreviaLiteratureSearchCommand({
        question: "How accurately does waist circumference identify elevated HbA1c?",
        baseUrl: server.url,
        outPath,
        reportPath,
        topK: 5,
      });

      expect(result.status).toBe("succeeded");
      expect(result.request.authMode).toBe("api-key");
      expect(result.evidenceSummary.sourceCount).toBeGreaterThanOrEqual(3);
      expect(result.evidenceSummary.pubmedCount).toBe(2);
      expect(result.evidenceSummary.guidelineCount).toBe(1);
      expect(result.plannedSearches[0]).toContain("waist circumference");
      expect(result.sources[0]?.citationLabel).toMatch(/PMID:111|guideline:/);
      expect(JSON.parse(await readFile(outPath, "utf-8")).literatureSearch.searchId).toBe(result.searchId);
      expect(await readFile(reportPath, "utf-8")).toContain("research literature search");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("checks whether a reader-facing paper actually uses the retrieved evidence", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "agenteer-literature-qa-"));
    try {
      const literaturePath = path.join(dir, "literature-search.json");
      await writeFile(literaturePath, JSON.stringify({ schemaVersion: 1, literatureSearch: mockLiteratureSearch() }, null, 2));
      const paperPath = path.join(dir, "paper.md");
      await writeFile(paperPath, [
        "# Waist Circumference and HbA1c",
        "",
        "This diagnostic accuracy analysis compares a waist circumference threshold with elevated HbA1c.",
        "It cites PMID:111 and does not establish causality or a clinical screening recommendation.",
      ].join("\n"));

      const result = await researchLiteratureQaCommand({
        literaturePath,
        paperPath,
        outPath: path.join(dir, "literature-qa.json"),
        reportPath: path.join(dir, "literature-qa.md"),
      });

      expect(result.status).toBe("pass");
      expect(result.citedSourceIds).toContain("111");
      expect(result.checks.find(check => check.id === "paper-citation-coverage")?.status).toBe("pass");
      expect(result.checks.find(check => check.id === "source-count")?.status).toBe("pass");
      expect(await readFile(path.join(dir, "literature-qa.md"), "utf-8")).toContain("research literature QA");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("turns MedBrevia search output into planning evidence for broad study routing", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "agenteer-literature-context-"));
    try {
      const literaturePath = path.join(dir, "literature-search.json");
      await writeFile(literaturePath, JSON.stringify({ schemaVersion: 1, literatureSearch: mockLiteratureSearch() }, null, 2));
      const context = await researchLiteratureContextCommand({
        literaturePath,
        outPath: path.join(dir, "literature-context.json"),
        reportPath: path.join(dir, "literature-context.md"),
      });

      expect(context.status).toBe("ready");
      expect(context.evidenceStrength).toBe("strong");
      expect(context.designSignals).toContain("diagnostic-accuracy");
      expect(context.planningImplications.join("\n")).toContain("reference standard");

      const plan = researchModelingPlanCommand({
        question: "How accurately does waist circumference identify elevated HbA1c?",
        literatureEvidence: {
          path: path.join(dir, "literature-context.json"),
          status: context.status,
          evidenceStrength: context.evidenceStrength,
          sourceCount: context.sourceSummary.sourceCount,
          highQualitySourceCount: context.sourceSummary.highQualitySourceCount,
          latestPublicationYear: context.sourceSummary.latestPublicationYear,
          questionTokenCoverage: context.quality.questionTokenCoverage,
          designSignals: context.designSignals,
          methodSignals: context.methodSignals,
          planningImplications: context.planningImplications,
          followUpSearches: context.followUpSearches,
          issueCodes: context.issues.filter(issue => issue.status !== "pass").map(issue => issue.id),
        },
      });
      expect(plan.literatureEvidence.source).toBe("literature-context");
      expect(plan.inferredGoal).toBe("diagnose");
      expect(plan.inferredStudyDesign).toBe("diagnostic");
      expect(plan.issues.map(issue => issue.code)).not.toContain("LITERATURE_CONTEXT_FAILED");
      expect(await readFile(path.join(dir, "literature-context.md"), "utf-8")).toContain("research literature context");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("attaches literature evidence and post-report literature QA to analysis-run artifacts", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "agenteer-literature-analysis-run-"));
    try {
      const dataPath = path.join(dir, "diagnostic.csv");
      await writeFile(dataPath, [
        "waist_cm,hba1c_pct",
        ...Array.from({ length: 60 }, (_, index) => {
          const elevated = index % 3 === 0;
          const waist = elevated ? 101 + (index % 8) : 82 + (index % 16);
          const hba1c = elevated ? 6.5 + (index % 5) / 10 : 5.3 + (index % 8) / 10;
          return `${waist},${hba1c.toFixed(1)}`;
        }),
      ].join("\n"));
      const literaturePath = path.join(dir, "literature-search.json");
      await writeFile(literaturePath, JSON.stringify({ schemaVersion: 1, literatureSearch: mockLiteratureSearch() }, null, 2));

      const result = await researchAnalysisRunCommand({
        question: "How accurately does waist circumference identify elevated HbA1c?",
        method: "diagnostic-accuracy",
        dataPath,
        outcome: "hba1c_pct",
        exposure: "waist_cm",
        outcomeThreshold: 6.5,
        exposureThreshold: 100,
        literaturePath,
        outDir: path.join(dir, "analysis-run"),
        python,
      });

      expect(result.generatedFiles.literatureEvidence).toBeTruthy();
      expect(result.generatedFiles.literatureContext).toBeTruthy();
      expect(result.generatedFiles.literatureContextReport).toBeTruthy();
      expect(result.generatedFiles.literatureQa).toBeTruthy();
      expect(result.generatedFiles.literatureQaReport).toBeTruthy();
      expect(result.modelingPlan.literatureEvidence.source).toBe("literature-context");
      expect(result.postRunModelingPlan.literatureEvidence.source).toBe("literature-context");
      const qa = JSON.parse(await readFile(result.generatedFiles.literatureQa!, "utf-8")) as { literatureQa: { status: string; checks: Array<{ id: string; status: string }> } };
      expect(qa.literatureQa.checks.map(check => check.id)).toContain("paper-citation-coverage");
      expect(["warning", "fail", "pass"]).toContain(qa.literatureQa.status);
      expect(result.analysisRunManifest.artifacts.find(artifact => artifact.kind === "literature-search")?.exists).toBe(true);
      expect(result.analysisRunManifest.artifacts.find(artifact => artifact.kind === "literature-context")?.exists).toBe(true);
      expect(result.analysisRunManifest.artifacts.find(artifact => artifact.kind === "literature-qa")?.exists).toBe(true);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

function mockLiteratureSearch() {
  return {
    schemaVersion: 1,
    generatedAtIso: "2026-05-08T00:00:00.000Z",
    searchId: "medbrevia_lit_test",
    provider: "medbrevia-search",
    status: "succeeded",
    request: {
      question: "How accurately does waist circumference identify elevated HbA1c?",
      baseUrl: "http://localhost:3000/",
      endpoint: "/api/search",
      responseDepth: "standard",
      dateRange: "5y",
      highImpact: false,
      prefersList: true,
      topK: 5,
      timeoutMs: 120000,
      authMode: "api-key",
    },
    evidenceSummary: {
      sourceCount: 5,
      pubmedCount: 4,
      trialCount: 0,
      guidelineCount: 1,
      nonPubmedLaneCount: 1,
      highQualitySourceCount: 4,
      latestPublicationYear: 2025,
      plannedSearchCount: 1,
      selectedPmidCount: 2,
      briefingAvailable: true,
    },
    plannedSearches: ["waist circumference HbA1c diagnostic accuracy"],
    qHash: "abc123",
    briefingText: "Recent evidence includes PMID:111 and PMID:222.",
    sources: [
      source("111", "Diagnostic accuracy of waist circumference for dysglycemia", "Systematic Review", 0.91),
      source("222", "Central adiposity and HbA1c in adults", "Journal Article", 0.73),
      source("333", "Waist circumference thresholds and diabetes screening", "Meta-Analysis", 0.88),
      source("444", "Diagnostic thresholds for cardiometabolic risk", "Journal Article", 0.74),
      {
        ...source("guideline-1", "Clinical guidance on cardiometabolic risk screening", "guideline", 0.84),
        sourceType: "guideline",
        journal: "Guideline",
        citationLabel: "guideline:guideline-1",
      },
    ],
    events: [],
    warnings: [],
    errors: [],
    timings: null,
    retrievalDebug: null,
    outPath: null,
    reportPath: null,
  };
}

function source(id: string, title: string, evidenceType: string, qualityScore: number) {
  return {
    id,
    sourceType: "pubmed",
    title,
    journal: "Test Medical Journal",
    publicationDate: "2025",
    publicationYear: 2025,
    url: `https://pubmed.ncbi.nlm.nih.gov/${id}/`,
    abstract: "Waist circumference, central adiposity, diagnostic accuracy, elevated HbA1c, sensitivity, specificity, and adult cardiometabolic outcomes are reviewed.",
    snippet: null,
    evidenceType: [evidenceType],
    retrievalScore: 0.8,
    qualityScore,
    citationLabel: `PMID:${id}`,
    raw: {},
  };
}

async function startMockMedBreviaSearchServer(): Promise<{ url: string; close: () => Promise<void> }> {
  const server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
    if (req.method !== "POST" || req.url !== "/api/search") {
      res.writeHead(404).end();
      return;
    }
    let body = "";
    for await (const chunk of req) body += chunk;
    const parsed = JSON.parse(body) as { question?: string };
    res.writeHead(200, { "content-type": "text/event-stream" });
    res.end([
      sse("plan", {
        q_hash: "abc123",
        plannedSearches: [{ query: `${parsed.question ?? ""} literature` }],
        selectedPmids: ["111", "222"],
      }),
      sse("results", {
        articleIds: ["111", "222"],
        articles: [
          {
            id: "111",
            title: "Diagnostic accuracy of waist circumference for dysglycemia",
            journal: "JAMA",
            pub_date: "2025",
            pub_types: ["Systematic Review"],
            journal_tier: 1,
            abstract: "Waist circumference elevated HbA1c diagnostic accuracy sensitivity specificity adults.",
            retrieval_rrf: 0.92,
          },
          {
            id: "222",
            title: "Central adiposity and HbA1c in adults",
            journal: "BMJ",
            pub_date: "2024",
            pub_types: ["Journal Article"],
            journal_tier: 1,
            abstract: "Central adiposity and HbA1c association with cardiometabolic outcomes.",
            retrieval_rrf: 0.8,
          },
        ],
      }),
      sse("guideline_results", {
        guidelines: [{
          id: "guideline-1",
          title: "Clinical guidance on cardiometabolic risk screening",
          organization: "Guideline Group",
          date: "2024",
          text: "Guideline discusses cardiometabolic screening and waist circumference.",
        }],
      }),
      sse("briefing_complete", {
        text: "Recent evidence includes PMID:111 and PMID:222.",
        pmidsUsed: ["111", "222"],
        timings: { total_ms: 12 },
        retrieval_debug: { pubmed: { selected_count: 2 } },
      }),
    ].join(""));
  });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("mock server did not expose a TCP address");
  return {
    url: `http://127.0.0.1:${address.port}`,
    close: () => new Promise(resolve => server.close(() => resolve())),
  };
}

function sse(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}
