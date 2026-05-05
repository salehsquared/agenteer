import { z } from "zod";

export const specializationIssueSchema = z.object({
  severity: z.enum(["blocker", "warning", "note"]),
  code: z.string().min(1),
  message: z.string().min(1),
  evidenceRefs: z.array(z.string()).default([]),
});
export type SpecializationIssue = z.infer<typeof specializationIssueSchema>;

export const evaluationRubricSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  requiredKeywords: z.array(z.string()).default([]),
  forbiddenKeywords: z.array(z.string()).default([]),
  requiredArtifactKinds: z.array(z.string()).default([]),
  minScore: z.number().min(0).max(1).default(0.7),
  weights: z.record(z.string(), z.number()).default({}),
});
export type EvaluationRubric = z.infer<typeof evaluationRubricSchema>;

export const specializationFixtureSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  task: z.string().min(1),
  input: z.unknown().optional(),
  expectedOutputs: z.array(z.string()).default([]),
  expectedKeywords: z.array(z.string()).default([]),
  forbiddenKeywords: z.array(z.string()).default([]),
  requiredArtifacts: z.array(z.string()).default([]),
  baselineMetric: z.number().min(0).max(1).default(0.5),
  shouldReject: z.boolean().default(false),
  tags: z.array(z.string()).default([]),
});
export type SpecializationFixture = z.infer<typeof specializationFixtureSchema>;

export const promotionCriteriaSchema = z.object({
  minScore: z.number().min(0).max(1).default(0.75),
  minBaselineDelta: z.number().default(0),
  requireCritiquePass: z.boolean().default(true),
  requireAllFixturesPass: z.boolean().default(true),
  maxCostUsd: z.number().min(0).default(0),
  maxRiskFlags: z.number().int().min(0).default(1),
});
export type PromotionCriteria = z.infer<typeof promotionCriteriaSchema>;

export const specializationManifestSchema = z.object({
  schemaVersion: z.literal(1),
  id: z.string().min(1),
  name: z.string().min(1),
  version: z.string().min(1),
  purpose: z.string().min(1),
  domain: z.string().min(1),
  allowedCapabilities: z.array(z.string()).default([]),
  allowedTools: z.array(z.string()).default([]),
  allowedActions: z.array(z.string()).default([]),
  requiredInputs: z.array(z.string()).default([]),
  expectedOutputs: z.array(z.string()).default([]),
  workflowTemplates: z.array(z.object({
    id: z.string().min(1),
    description: z.string().min(1),
    manifestId: z.string().min(1).optional(),
    steps: z.array(z.string()).default([]),
  })).default([]),
  candidateGenerators: z.array(z.object({
    id: z.string().min(1),
    strategy: z.enum(["baseline", "strict", "creative", "adversarial", "repair"]),
    description: z.string().min(1),
  })).default([]),
  evaluators: z.array(z.object({
    id: z.string().min(1),
    type: z.enum(["deterministic-test", "fixture-test", "schema-validation", "rubric", "baseline-comparison", "regression", "cost-time-budget", "reproducibility", "artifact-completeness"]),
    description: z.string().min(1),
  })).default([]),
  critics: z.array(z.object({
    id: z.string().min(1),
    type: z.enum(["deterministic", "llm-optional", "human"]),
    rubricId: z.string().min(1),
  })).default([]),
  repairPolicies: z.array(z.object({
    id: z.string().min(1),
    trigger: z.string().min(1),
    action: z.string().min(1),
    maxAttempts: z.number().int().min(0).default(1),
  })).default([]),
  baselineStrategies: z.array(z.object({
    id: z.string().min(1),
    description: z.string().min(1),
    expectedMetric: z.number().min(0).max(1).default(0.5),
  })).default([]),
  promotionCriteria: promotionCriteriaSchema,
  artifactSchemas: z.array(z.object({
    kind: z.string().min(1),
    requiredFields: z.array(z.string()).default([]),
  })).default([]),
  fixtures: z.array(specializationFixtureSchema).default([]),
  evaluationRubrics: z.array(evaluationRubricSchema).default([]),
  safetyLimits: z.object({
    maxCostUsd: z.number().min(0).default(0),
    maxRuntimeSeconds: z.number().int().min(1).default(60),
    maxModelCalls: z.number().int().min(0).default(0),
    networkAllowed: z.boolean().default(false),
    cloudAllowed: z.boolean().default(false),
  }),
  persistence: z.object({
    rootDir: z.string().min(1),
    candidatesDir: z.string().min(1).default("candidates"),
    evaluationsDir: z.string().min(1).default("evaluations"),
    critiquesDir: z.string().min(1).default("critiques"),
    repairsDir: z.string().min(1).default("repairs"),
    promotionsDir: z.string().min(1).default("promotions"),
    artifactsDir: z.string().min(1).default("artifacts"),
    reportsDir: z.string().min(1).default("reports"),
  }),
});
export type SpecializationManifest = z.infer<typeof specializationManifestSchema>;

export const specializationArtifactSchema = z.object({
  id: z.string().min(1),
  kind: z.string().min(1),
  path: z.string().min(1),
  sha256: z.string().nullable(),
  producedBy: z.string().min(1),
  schemaValid: z.boolean(),
  required: z.boolean(),
});
export type SpecializationArtifact = z.infer<typeof specializationArtifactSchema>;

export const candidateVariantSchema = z.object({
  schemaVersion: z.literal(1),
  id: z.string().min(1),
  specializationId: z.string().min(1),
  parentCandidateId: z.string().nullable(),
  status: z.enum(["generated", "evaluated", "repaired", "promoted", "rejected"]),
  generationMethod: z.string().min(1),
  proposedChanges: z.object({
    workflow: z.array(z.string()).default([]),
    nodes: z.array(z.string()).default([]),
    tools: z.array(z.string()).default([]),
    prompts: z.array(z.string()).default([]),
    config: z.record(z.string(), z.unknown()).default({}),
    strategy: z.string().min(1),
  }),
  requiredCapabilities: z.array(z.string()).default([]),
  expectedOutputs: z.array(z.string()).default([]),
  riskFlags: z.array(z.string()).default([]),
  costEstimateUsd: z.number().min(0).default(0),
  artifactRefs: z.array(specializationArtifactSchema).default([]),
  createdAtIso: z.string().min(1),
});
export type CandidateVariant = z.infer<typeof candidateVariantSchema>;

export const candidateLineageSchema = z.object({
  candidateId: z.string().min(1),
  parentCandidateId: z.string().nullable(),
  rootCandidateId: z.string().min(1),
  generation: z.number().int().min(0),
  events: z.array(z.object({
    atIso: z.string().min(1),
    type: z.enum(["generated", "evaluated", "critiqued", "repaired", "promoted", "rejected"]),
    artifactPath: z.string().nullable(),
    summary: z.string().min(1),
  })).default([]),
});
export type CandidateLineage = z.infer<typeof candidateLineageSchema>;

export const baselineResultSchema = z.object({
  baselineId: z.string().min(1),
  fixtureId: z.string().min(1),
  metric: z.number().min(0).max(1),
  summary: z.string().min(1),
});
export type BaselineResult = z.infer<typeof baselineResultSchema>;

export const candidateEvaluationSchema = z.object({
  schemaVersion: z.literal(1),
  id: z.string().min(1),
  candidateId: z.string().min(1),
  specializationId: z.string().min(1),
  fixtureId: z.string().min(1),
  evaluatorTypes: z.array(z.string()).default([]),
  baselineComparison: z.object({
    baselineId: z.string().nullable(),
    baselineMetric: z.number().min(0).max(1).nullable(),
    candidateMetric: z.number().min(0).max(1),
    delta: z.number(),
  }),
  metrics: z.record(z.string(), z.number()).default({}),
  result: z.enum(["pass", "fail"]),
  failureModes: z.array(z.string()).default([]),
  reproducibility: z.object({
    deterministic: z.boolean(),
    inputHash: z.string().min(1),
    candidateHash: z.string().min(1),
    artifactHashes: z.array(z.string()).default([]),
  }),
  execution: z.object({
    startedAtIso: z.string().min(1),
    endedAtIso: z.string().min(1),
    runtimeMs: z.number().min(0),
    costUsd: z.number().min(0),
    logs: z.array(z.string()).default([]),
    artifacts: z.array(specializationArtifactSchema).default([]),
  }),
  issues: z.array(specializationIssueSchema).default([]),
});
export type CandidateEvaluation = z.infer<typeof candidateEvaluationSchema>;

export const candidateCritiqueSchema = z.object({
  schemaVersion: z.literal(1),
  id: z.string().min(1),
  candidateId: z.string().min(1),
  specializationId: z.string().min(1),
  correctnessIssues: z.array(specializationIssueSchema).default([]),
  safetyIssues: z.array(specializationIssueSchema).default([]),
  evidenceIssues: z.array(specializationIssueSchema).default([]),
  brittlenessIssues: z.array(specializationIssueSchema).default([]),
  overclaimingIssues: z.array(specializationIssueSchema).default([]),
  missingValidation: z.array(specializationIssueSchema).default([]),
  suggestedRepairs: z.array(z.string()).default([]),
  recommendation: z.enum(["reject", "repair", "promote"]),
  confidence: z.number().min(0).max(1),
});
export type CandidateCritique = z.infer<typeof candidateCritiqueSchema>;

export const candidateRepairSchema = z.object({
  schemaVersion: z.literal(1),
  id: z.string().min(1),
  candidateId: z.string().min(1),
  repairedCandidateId: z.string().min(1),
  repairActions: z.array(z.string()).default([]),
  sourceCritiqueId: z.string().min(1),
  status: z.enum(["repaired", "no-repair-available", "blocked"]),
  lineage: candidateLineageSchema,
});
export type CandidateRepair = z.infer<typeof candidateRepairSchema>;

export const promotionDecisionSchema = z.object({
  schemaVersion: z.literal(1),
  id: z.string().min(1),
  candidateId: z.string().min(1),
  specializationId: z.string().min(1),
  decision: z.enum(["promoted", "rejected", "retry"]),
  reason: z.string().min(1),
  baselineDelta: z.number(),
  evidence: z.array(z.string()).default([]),
  remainingRisks: z.array(z.string()).default([]),
  artifactsPromoted: z.array(specializationArtifactSchema).default([]),
  criteriaSatisfied: z.boolean(),
});
export type PromotionDecision = z.infer<typeof promotionDecisionSchema>;

export const candidatePromotionSchema = z.object({
  schemaVersion: z.literal(1),
  id: z.string().min(1),
  decision: promotionDecisionSchema,
  promotedAtIso: z.string().min(1),
  reusableArtifacts: z.array(specializationArtifactSchema).default([]),
});
export type CandidatePromotion = z.infer<typeof candidatePromotionSchema>;

export const specializationReportSchema = z.object({
  schemaVersion: z.literal(1),
  id: z.string().min(1),
  specializationId: z.string().min(1),
  runId: z.string().min(1),
  generatedCandidates: z.array(z.string()).default([]),
  evaluatedCandidates: z.array(z.string()).default([]),
  critiquedCandidates: z.array(z.string()).default([]),
  repairedCandidates: z.array(z.string()).default([]),
  promotedCandidates: z.array(z.string()).default([]),
  rejectedCandidates: z.array(z.string()).default([]),
  baselineSummary: z.array(baselineResultSchema).default([]),
  cycleAccounting: z.object({
    selectedTaskOrStressCase: z.boolean(),
    executedCandidates: z.boolean(),
    evaluationResult: z.boolean(),
    critiqueFailureAttribution: z.boolean(),
    repairMutationOrExplicitRejection: z.boolean(),
    rerunOrJustifiedStop: z.boolean(),
    finalPromotionOrRejection: z.boolean(),
    nextStepRecommendation: z.boolean(),
    fullCycle: z.boolean(),
  }),
  issues: z.array(specializationIssueSchema).default([]),
  nextRecommendedImprovements: z.array(z.string()).default([]),
  reportPath: z.string().nullable(),
});
export type SpecializationReport = z.infer<typeof specializationReportSchema>;

export const specializationRunSchema = z.object({
  schemaVersion: z.literal(1),
  id: z.string().min(1),
  specializationId: z.string().min(1),
  startedAtIso: z.string().min(1),
  endedAtIso: z.string().nullable(),
  status: z.enum(["planned", "running", "completed", "incomplete", "failed"]),
  selectedTaskOrStressCase: z.string().nullable(),
  candidateIds: z.array(z.string()).default([]),
  evaluationIds: z.array(z.string()).default([]),
  critiqueIds: z.array(z.string()).default([]),
  repairIds: z.array(z.string()).default([]),
  promotionDecisionIds: z.array(z.string()).default([]),
  reportId: z.string().nullable(),
  cycleCounted: z.boolean(),
});
export type SpecializationRun = z.infer<typeof specializationRunSchema>;
