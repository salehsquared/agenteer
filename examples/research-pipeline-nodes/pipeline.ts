import { researchPipelineStagesCommand } from "../../packages/cli/src/commands/research.js";

export interface ResearchPipelineStage {
  id: string;
  manifestId: string;
  requiresHumanReviewBefore?: boolean;
  purpose: string;
}

export const RESEARCH_PIPELINE_STAGES: ResearchPipelineStage[] = researchPipelineStagesCommand().map(stage => ({
  id: stage.id,
  manifestId: stage.nodeId,
  purpose: stage.purpose,
  ...(stage.humanReview ? { requiresHumanReviewBefore: true } : {}),
}));

export function renderResearchPipelineStages(stages = RESEARCH_PIPELINE_STAGES): string {
  return stages
    .map((stage, index) => `${index + 1}. ${stage.id} -> ${stage.manifestId}: ${stage.purpose}`)
    .join("\n");
}
