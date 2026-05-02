import { describe, expect, it } from "vitest";
import {
  RESEARCH_PIPELINE_STAGES,
  renderResearchPipelineStages,
} from "../pipeline.js";
import { RESEARCH_PIPELINE_NODE_MANIFESTS } from "../nodes.js";
import { researchPipelineStagesCommand } from "../../../packages/cli/src/commands/research.js";

describe("research pipeline stage manifest", () => {
  it("documents stage order and maps stages to registered node IDs", () => {
    const nodeIds = new Set(RESEARCH_PIPELINE_NODE_MANIFESTS.map(manifest => manifest.id));
    const stageIds = RESEARCH_PIPELINE_STAGES.map(stage => stage.id);

    expect(stageIds).toEqual([
      "design",
      "critique",
      "scout",
      "runner-spec",
      "approval",
      "analysis",
      "report-review",
      "manifest",
      "export",
    ]);
    for (const stage of RESEARCH_PIPELINE_STAGES.filter(stage => stage.manifestId !== "human:approval")) {
      expect(nodeIds.has(stage.manifestId)).toBe(true);
    }
    expect(renderResearchPipelineStages()).toContain("design -> @agenteer/node-research-protocol-design");
  });

  it("stays in parity with the CLI research stages output", () => {
    expect(researchPipelineStagesCommand().map(stage => ({
      id: stage.id,
      nodeId: stage.nodeId,
      purpose: stage.purpose,
    }))).toEqual(RESEARCH_PIPELINE_STAGES.map(stage => ({
      id: stage.id,
      nodeId: stage.manifestId,
      purpose: stage.purpose,
    })));
  });
});
