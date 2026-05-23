import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  defaultReviewerPanel,
  researchReviewAdjudicateCommand,
  researchReviewerProvidersCommand,
  researchReviewResponseCommand,
  researchStudyCriticCommand,
} from "../src/research-machine/reviewer.js";

describe("research external reviewer layer", () => {
  it("lists provider defaults and keeps unavailable providers non-fatal", async () => {
    const result = await researchReviewerProvidersCommand();

    expect(result.providers.map(provider => provider.id)).toEqual(expect.arrayContaining(["openai", "anthropic", "google", "deepseek", "xai"]));
    expect(result.providers.find(provider => provider.id === "openai")?.defaultModel).toBe("gpt-5.4");
    expect(result.providers.find(provider => provider.id === "anthropic")?.defaultModel).toBe("claude-opus-4-7");
    expect(result.providers.find(provider => provider.id === "google")?.defaultModel).toBe("gemini-3.1-pro");
    expect(result.providers.find(provider => provider.id === "deepseek")?.defaultModel).toBe("deepseek-v4-pro");
    expect(result.defaultPanel.map(reviewer => reviewer.provider)).toEqual(["anthropic", "deepseek"]);
    expect(result.budget.maxPerCallUsd).toBe(0.5);
  });

  it("supports a two-role DeepSeek-only panel for low-cost external QA", async () => {
    const panel = defaultReviewerPanel("deepseek-dual");

    expect(panel).toHaveLength(2);
    expect(panel.every(reviewer => reviewer.provider === "deepseek")).toBe(true);
    expect(panel.every(reviewer => reviewer.model === "deepseek-v4-pro")).toBe(true);
    expect(new Set(panel.map(reviewer => reviewer.id)).size).toBe(2);
    expect(panel.map(reviewer => reviewer.role).join(" ")).toMatch(/methods/i);
    expect(panel.map(reviewer => reviewer.role).join(" ")).toMatch(/reproducibility/i);
  });

  it("supports a three-role DeepSeek-only panel for phenotype-heavy medical studies", async () => {
    const panel = defaultReviewerPanel("deepseek-triple");

    expect(panel).toHaveLength(3);
    expect(panel.every(reviewer => reviewer.provider === "deepseek")).toBe(true);
    expect(panel.every(reviewer => reviewer.model === "deepseek-v4-pro")).toBe(true);
    expect(new Set(panel.map(reviewer => reviewer.id)).size).toBe(3);
    const roles = panel.map(reviewer => reviewer.role).join(" ");
    expect(roles).toMatch(/methods/i);
    expect(roles).toMatch(/phenotype/i);
    expect(roles).toMatch(/reproducibility/i);
  });

  it("builds a cold review packet, panel, adjudication, and state reentry response", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "agenteer-study-critic-"));
    try {
      await mkdir(path.join(dir, "stats-run"), { recursive: true });
      await writeFile(path.join(dir, "manuscript.md"), [
        "# Local Study",
        "",
        "This manuscript says the exposure causes the outcome in a complete-case analysis.",
        "Missingness was present but not fully handled.",
      ].join("\n"));
      await writeFile(path.join(dir, "analysis-spec-v2.json"), `${JSON.stringify({ schemaVersion: 2, dataset: "user-table", researchQuestion: "Does exposure cause outcome?", specHash: "abc" })}\n`);
      await writeFile(path.join(dir, "method-qa.json"), `${JSON.stringify({ overallStatus: "warning", checks: [{ status: "warning", message: "Missingness review needed." }] })}\n`);
      await writeFile(path.join(dir, "stats-run", "stats-run.json"), `${JSON.stringify({ status: "succeeded", completeCaseN: 42, issues: [] })}\n`);

      const result = await researchStudyCriticCommand({
        runDir: dir,
        stage: "final",
        autonomy: "aggressive",
        mock: true,
      });

      expect(result.panel.reviewers).toHaveLength(1);
      expect(result.panel.reviewers[0]?.status).toBe("succeeded");
      expect(result.adjudication.verdict).toBe("block");
      expect(result.adjudication.acceptedFindings.map(finding => finding.category)).toEqual(expect.arrayContaining(["causal_claims", "missingness"]));
      expect(result.response.stateReentry.status).toBe("blocked");
      expect(result.response.stateReentry.reentryPoint).toBe("protocol");
      expect(result.response.stateReentry.suggestedCommands[0]).toContain("protocol-candidates");
      expect(await readFile(result.generatedFiles.reviewPacket, "utf-8")).toContain("manuscript.md");
      expect(await readFile(result.generatedFiles.stateReentry, "utf-8")).toContain("protocol");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("normalizes near-valid reviewer reentry labels instead of dropping the review", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "agenteer-review-normalize-"));
    try {
      await writeFile(path.join(dir, "paper.md"), "# Study\n\nResults were reported with limited diagnostics.\n");
      const fetchImpl = (async () => new Response(JSON.stringify({
        choices: [{
          message: {
            content: JSON.stringify({
              verdict: "revise",
              summary: "Near-valid response with non-canonical reentry labels.",
              findings: [
                {
                  id: "bad-label",
                  severity: "major",
                  category: "reporting",
                  title: "Report label should normalize",
                  evidenceRefs: ["paper.md"],
                  whyItMatters: "The manuscript needs a clearer result.",
                  actionableFix: "Route back to manuscript repair.",
                  reentryPoint: "reporting",
                  deterministicVerification: null,
                  confidence: 0.8,
                },
              ],
              missingEvidence: [],
              recommendedNextStage: "report",
            }),
          },
        }],
      }), { status: 200, headers: { "content-type": "application/json" } })) as typeof fetch;

      const result = await researchStudyCriticCommand({
        runDir: dir,
        stage: "final",
        autonomy: "aggressive",
        reviewers: ["deepseek:deepseek-v4-pro"],
        env: { DEEPSEEK_API_KEY: "test" },
        fetchImpl,
      });

      expect(result.panel.reviewers[0]?.status).toBe("succeeded");
      expect(result.adjudication.acceptedFindings[0]?.reentryPoint).toBe("manuscript");
      expect(result.response.stateReentry.reentryPoint).toBe("manuscript");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("adjudicates existing panels and applies conservative response policy", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "agenteer-review-response-"));
    try {
      const first = await researchStudyCriticCommand({
        runDir: dir,
        stage: "manuscript",
        autonomy: "aggressive",
        mock: true,
      });
      const adjudication = await researchReviewAdjudicateCommand({
        panelPath: first.generatedFiles.panel,
        outPath: path.join(dir, "manual-adjudication.json"),
      });
      const response = await researchReviewResponseCommand({
        adjudicationPath: adjudication.outPath!,
        runDir: dir,
        autonomy: "conservative",
        outPath: path.join(dir, "manual-response.json"),
        stateReentryPath: path.join(dir, "manual-reentry.json"),
      });

      expect(adjudication.verdict).toBe("pass");
      expect(response.stateReentry.status).toBe("ready_to_continue");
      expect(response.stateReentry.reentryPoint).toBe("promotion");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
