import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { InMemoryNodeRegistry } from "@agenteer/core";
import {
  RESEARCH_PIPELINE_NODE_MANIFESTS,
  registerResearchPipelineNodes,
  researchAnalyzeFactory,
  researchDataQualityFactory,
  researchExportFactory,
  researchManifestFactory,
  researchMethodsValidationFactory,
  researchProvenanceFactory,
  researchProtocolCritiqueFactory,
  researchProtocolDesignFactory,
  researchQaDashboardFactory,
  researchReportReviewFactory,
  researchRoCrateFactory,
  researchRunnerSpecFactory,
  researchScoutPlanFactory,
} from "../nodes.js";

describe("research pipeline nodes", () => {
  it("runs design, critique, scout, and runner-spec as deterministic nodes", async () => {
    const repo = await makeRepo();
    const packetDir = await mkdtemp(path.join(os.tmpdir(), "research-node-packet-"));
    const exportDir = await mkdtemp(path.join(os.tmpdir(), "research-node-export-"));
    const fixturePath = path.join(packetDir, "rows.json");
    try {
      const design = await researchProtocolDesignFactory().execute({
        original: {
          project: "medbrevia-nhanes",
          repoDir: repo,
          question: "Among NHANES adults, is self-reported high blood pressure associated with measured hypertension?",
          outDir: packetDir,
        },
      }, null as never);
      expect(design.kind).toBe("output");

      const critique = await researchProtocolCritiqueFactory().execute({
        original: { packetDir },
      }, null as never);
      expect(critique.kind).toBe("output");
      expect(critique.evidence?.verdict).toBe("pass");

      const scout = await researchScoutPlanFactory().execute({
        original: { packetDir },
      }, null as never);
      expect(scout.kind).toBe("output");

      const runner = await researchRunnerSpecFactory().execute({
        original: { packetDir },
      }, null as never);
      expect(runner.kind).toBe("output");
      expect(runner.evidence?.verdict).toBe("pass");

      await writeFile(fixturePath, `${JSON.stringify([
        { SEQN: 1, RIDSTATR: 2, RIDAGEYR: 45, RIAGENDR: 1, RIDRETH3: 3, BPQ020: 1, BPXSY1: 142, BPXDI1: 86, WTMEC2YR: 1 },
        { SEQN: 2, RIDSTATR: 2, RIDAGEYR: 58, RIAGENDR: 2, RIDRETH3: 4, BPQ020: 2, BPXSY1: 118, BPXDI1: 72, WTMEC2YR: 1 },
      ], null, 2)}\n`);

      const approval = await import("../../../packages/cli/src/commands/research.js")
        .then(mod => mod.researchApprovePacketCommand(packetDir, "Approved in node test."));
      expect(approval.status).toBe("approved");

      const analysis = await researchAnalyzeFactory().execute({
        original: { packetDir, fixturePath },
      }, null as never);
      expect(analysis.kind).toBe("output");

      const dataQuality = await researchDataQualityFactory().execute({
        original: { packetDir, fixturePath },
      }, null as never);
      expect(dataQuality.kind).toBe("output");

      const reportReview = await researchReportReviewFactory().execute({
        original: { packetDir },
      }, null as never);
      expect(reportReview.kind).toBe("output");
      expect(reportReview.evidence?.verdict).toBe("pass");

      const methods = await researchMethodsValidationFactory().execute({
        original: { packetDir },
      }, null as never);
      expect(methods.kind).toBe("output");

      const manifest = await researchManifestFactory().execute({
        original: { packetDir },
      }, null as never);
      expect(manifest.kind).toBe("output");

      const roCrate = await researchRoCrateFactory().execute({
        original: { packetDir },
      }, null as never);
      expect(roCrate.kind).toBe("output");

      const provenance = await researchProvenanceFactory().execute({
        original: { packetDir },
      }, null as never);
      expect(provenance.kind).toBe("output");

      const dashboard = await researchQaDashboardFactory().execute({
        original: { packetDir },
      }, null as never);
      expect(dashboard.kind).toBe("output");

      const exported = await researchExportFactory().execute({
        original: { packetDir, outDir: exportDir },
      }, null as never);
      expect(exported.kind).toBe("output");

      expect(RESEARCH_PIPELINE_NODE_MANIFESTS.map(manifest => manifest.id)).toEqual([
        "@agenteer/node-research-protocol-design",
        "@agenteer/node-research-protocol-critique",
        "@agenteer/node-research-scout-plan",
        "@agenteer/node-research-runner-spec",
        "@agenteer/node-research-analyze-local",
        "@agenteer/node-research-report-review",
        "@agenteer/node-research-methods-validation",
        "@agenteer/node-research-data-quality",
        "@agenteer/node-research-artifact-manifest",
        "@agenteer/node-research-ro-crate",
        "@agenteer/node-research-provenance",
        "@agenteer/node-research-qa-dashboard",
        "@agenteer/node-research-export",
      ]);
    } finally {
      await rm(repo, { recursive: true, force: true });
      await rm(packetDir, { recursive: true, force: true });
      await rm(exportDir, { recursive: true, force: true });
    }
  });

  it("registers all research pipeline nodes into a node registry", () => {
    const registry = new InMemoryNodeRegistry();

    registerResearchPipelineNodes(registry);

    expect(registry.all().map(entry => entry.manifest.id)).toEqual(
      RESEARCH_PIPELINE_NODE_MANIFESTS.map(manifest => manifest.id),
    );
    expect(registry.has("@agenteer/node-research-qa-dashboard")).toBe(true);
    expect(registry.has("@agenteer/node-research-export")).toBe(true);
  });
});

async function makeRepo(): Promise<string> {
  const repo = await mkdtemp(path.join(os.tmpdir(), "research-node-repo-"));
  const registryDir = path.join(repo, "data", "analytics", "nhanes");
  await mkdir(registryDir, { recursive: true });
  await writeFile(path.join(registryDir, "registry.json"), `${JSON.stringify({
    dataset: "nhanes",
    cycles: [{ id: "2017-2018" }],
    domains: {
      demographics: {},
      blood_pressure: {},
    },
    variables: [
      { name: "RIDAGEYR", domain: "demographics", label: "Age" },
      { name: "RIAGENDR", domain: "demographics", label: "Gender" },
      { name: "RIDRETH3", domain: "demographics", label: "Race ethnicity" },
      { name: "WTMEC2YR", domain: "demographics", label: "MEC weight" },
      { name: "SDMVSTRA", domain: "demographics", label: "Strata" },
      { name: "SDMVPSU", domain: "demographics", label: "PSU" },
      { name: "BPXSY1", domain: "blood_pressure", label: "Systolic BP" },
      { name: "BPXDI1", domain: "blood_pressure", label: "Diastolic BP" },
      { name: "BPQ020", domain: "blood_pressure", label: "Ever told you had high blood pressure" },
    ],
    weightRules: [
      {
        id: "mec",
        weightVariable: "WTMEC2YR",
        strataVariable: "SDMVSTRA",
        psuVariable: "SDMVPSU",
      },
    ],
  }, null, 2)}\n`);
  return repo;
}
