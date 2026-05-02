import {
  researchAnalyzeFactory,
  researchExportFactory,
  researchManifestFactory,
  researchProtocolCritiqueFactory,
  researchProtocolDesignFactory,
  researchReportReviewFactory,
  researchRunnerSpecFactory,
  researchScoutPlanFactory,
} from "./nodes.js";
import { researchApprovePacketCommand } from "../../packages/cli/src/commands/research.js";

export interface ResearchPipelineNodeRunOptions {
  project: "medbrevia-nhanes";
  repoDir: string;
  question: string;
  packetDir: string;
  fixturePath: string;
  exportDir: string;
  approvalNote?: string;
}

export interface ResearchPipelineNodeRunResult {
  packetDir: string;
  exportDir: string;
  stages: Array<{
    name: string;
    verdict: "pass" | "fail";
  }>;
}

export async function runResearchPipelineNodeDemo(
  opts: ResearchPipelineNodeRunOptions,
): Promise<ResearchPipelineNodeRunResult> {
  const stages: ResearchPipelineNodeRunResult["stages"] = [];
  const record = (name: string, verdict: "pass" | "fail") => stages.push({ name, verdict });

  const design = await researchProtocolDesignFactory().execute({
    original: {
      project: opts.project,
      repoDir: opts.repoDir,
      question: opts.question,
      outDir: opts.packetDir,
    },
  }, null as never);
  record("design", design.evidence?.verdict === "fail" ? "fail" : "pass");

  const critique = await researchProtocolCritiqueFactory().execute({
    original: { packetDir: opts.packetDir },
  }, null as never);
  record("critique", critique.evidence?.verdict === "fail" ? "fail" : "pass");

  const scout = await researchScoutPlanFactory().execute({
    original: { packetDir: opts.packetDir, fixturePath: opts.fixturePath },
  }, null as never);
  record("scout", scout.evidence?.verdict === "fail" ? "fail" : "pass");

  const runner = await researchRunnerSpecFactory().execute({
    original: { packetDir: opts.packetDir },
  }, null as never);
  record("runner-spec", runner.evidence?.verdict === "fail" ? "fail" : "pass");

  const approval = await researchApprovePacketCommand(opts.packetDir, opts.approvalNote ?? "Approved by node demo driver.");
  record("approval", approval.status === "approved" ? "pass" : "fail");

  const analysis = await researchAnalyzeFactory().execute({
    original: { packetDir: opts.packetDir, fixturePath: opts.fixturePath },
  }, null as never);
  record("analysis", analysis.evidence?.verdict === "fail" ? "fail" : "pass");

  const report = await researchReportReviewFactory().execute({
    original: { packetDir: opts.packetDir },
  }, null as never);
  record("report-review", report.evidence?.verdict === "fail" ? "fail" : "pass");

  const manifest = await researchManifestFactory().execute({
    original: { packetDir: opts.packetDir },
  }, null as never);
  record("manifest", manifest.evidence?.verdict === "fail" ? "fail" : "pass");

  const exported = await researchExportFactory().execute({
    original: { packetDir: opts.packetDir, outDir: opts.exportDir },
  }, null as never);
  record("export", exported.evidence?.verdict === "fail" ? "fail" : "pass");

  return {
    packetDir: opts.packetDir,
    exportDir: opts.exportDir,
    stages,
  };
}
