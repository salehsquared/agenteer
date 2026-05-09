import { z } from "zod";

export const statsMethodSchema = z.enum([
  "descriptive",
  "t-test",
  "mann-whitney",
  "chi-square",
  "fisher-exact",
  "pearson",
  "spearman",
  "linear-regression",
  "logistic-regression",
  "poisson-regression",
  "diagnostic-accuracy",
  "propensity-score-matching",
  "propensity-score-weighting",
]);
export type StatsMethod = z.infer<typeof statsMethodSchema>;

export const statsRunRequestSchema = z.object({
  schemaVersion: z.literal(1),
  method: statsMethodSchema,
  dataPath: z.string().min(1),
  outcome: z.string().min(1).optional(),
  exposure: z.string().min(1).optional(),
  group: z.string().min(1).optional(),
  outcomeThreshold: z.number().optional(),
  exposureThreshold: z.number().optional(),
  variables: z.array(z.string().min(1)).default([]),
  covariates: z.array(z.string().min(1)).default([]),
  weight: z.string().min(1).optional(),
  exactCovariates: z.array(z.string().min(1)).default([]),
  estimand: z.enum(["ATE", "ATT"]).default("ATT"),
  matchRatio: z.number().int().min(1).max(10).default(1),
  caliper: z.number().positive().max(10).optional(),
  replacement: z.boolean().default(false),
  trimThreshold: z.number().min(0).max(0.49).default(0.01),
  stabilizeWeights: z.boolean().default(true),
  surveyDesign: z.boolean().default(false),
  allowSurveyApproximation: z.boolean().default(false),
  methodSelectionPath: z.string().min(1).optional(),
  analysisSpecPath: z.string().min(1).optional(),
  outDir: z.string().min(1),
  alpha: z.number().min(0.0001).max(0.5).default(0.05),
  python: z.string().min(1).optional(),
});
export type StatsRunRequest = z.infer<typeof statsRunRequestSchema>;

export const statsArtifactSchema = z.object({
  kind: z.enum(["config", "summary", "table", "diagnostics", "report", "qa", "balance", "propensity-scores", "propensity-overlap", "matched-pairs", "weights"]),
  path: z.string().min(1),
  sha256: z.string().optional(),
});
export type StatsArtifact = z.infer<typeof statsArtifactSchema>;

export const statsIssueSchema = z.object({
  severity: z.enum(["blocker", "warning", "note"]),
  code: z.string().min(1),
  message: z.string().min(1),
  evidenceRefs: z.array(z.string()).default([]),
});
export type StatsIssue = z.infer<typeof statsIssueSchema>;

export const statsResultPostureSchema = z.object({
  status: z.enum([
    "failed",
    "blocked_survey_required",
    "invalid_binding",
    "exploratory_survey_approximation",
    "exploratory_standard_table",
    "bound_standard_table",
    "causal_design_review_required",
  ]),
  label: z.string().min(1),
  interpretationBoundary: z.string().min(1),
  supports: z.array(z.string().min(1)),
  cannotSupport: z.array(z.string().min(1)),
  nextAction: z.string().min(1),
});
export type StatsResultPosture = z.infer<typeof statsResultPostureSchema>;

export const statsRunResultSchema = z.object({
  schemaVersion: z.literal(1),
  runId: z.string().min(1),
  method: statsMethodSchema,
  status: z.enum(["succeeded", "failed"]),
  rowCount: z.number().int().nonnegative(),
  completeCaseN: z.number().int().nonnegative(),
  variables: z.array(z.string()),
  binding: z.object({
    methodSelectionPath: z.string().nullable(),
    methodSelectionId: z.string().nullable(),
    methodId: z.string().nullable(),
    analysisSpecPath: z.string().nullable(),
    specHash: z.string().nullable(),
    status: z.enum(["unbound", "bound", "mismatch", "invalid"]),
  }),
  parameters: z.record(z.string(), z.unknown()),
  estimates: z.array(z.record(z.string(), z.unknown())),
  diagnostics: z.record(z.string(), z.unknown()),
  issues: z.array(statsIssueSchema),
  warnings: z.array(z.string()),
  errors: z.array(z.string()),
  resultPosture: statsResultPostureSchema.optional(),
  artifacts: z.array(statsArtifactSchema),
  outDir: z.string().min(1),
});
export type StatsRunResult = z.infer<typeof statsRunResultSchema>;
