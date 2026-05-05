import { z } from "zod";

export const mlTaskTypeSchema = z.enum([
  "binary_classification",
  "multiclass_classification",
  "regression",
  "clustering",
  "dimensionality_reduction",
]);
export type MlTaskType = z.infer<typeof mlTaskTypeSchema>;

export const mlAdapterStatusSchema = z.enum(["available", "optional_missing"]);
export type MlAdapterStatus = z.infer<typeof mlAdapterStatusSchema>;

export const mlModelManifestSchema = z.object({
  schemaVersion: z.literal(1),
  id: z.string().min(1),
  label: z.string().min(1),
  backend: z.literal("sklearn"),
  tasks: z.array(mlTaskTypeSchema).min(1),
  family: z.enum([
    "linear",
    "neighbors",
    "kernel",
    "tree",
    "ensemble",
    "boosting",
    "neural_network",
    "mixture",
    "decomposition",
    "manifold",
  ]),
  estimatorClass: z.string().min(1),
  availability: mlAdapterStatusSchema,
  requiredPackage: z.string().optional(),
  supportsPredict: z.boolean(),
  supportsPredictProba: z.boolean(),
  supportsEvaluation: z.boolean(),
  supportsSerialization: z.boolean(),
  supportsCoefficients: z.boolean(),
  supportsFeatureImportance: z.boolean(),
  supportsPermutationImportance: z.boolean(),
  defaultParams: z.record(z.string(), z.unknown()).default({}),
  limitations: z.array(z.string()).default([]),
});
export type MlModelManifest = z.infer<typeof mlModelManifestSchema>;

export const mlMetricDirectionSchema = z.enum(["maximize", "minimize"]);
export type MlMetricDirection = z.infer<typeof mlMetricDirectionSchema>;

export const mlRunStatusSchema = z.enum(["succeeded", "failed", "partially_succeeded"]);
export type MlRunStatus = z.infer<typeof mlRunStatusSchema>;

export const mlArtifactSchema = z.object({
  kind: z.enum(["model", "predictions", "transformed", "summary", "comparison", "config", "log"]),
  path: z.string().min(1),
  sha256: z.string().length(64).optional(),
});
export type MlArtifact = z.infer<typeof mlArtifactSchema>;

export const mlRunRequestSchema = z.object({
  schemaVersion: z.literal(1).default(1),
  task: mlTaskTypeSchema,
  modelId: z.string().min(1),
  dataPath: z.string().min(1),
  target: z.string().min(1).optional(),
  features: z.array(z.string().min(1)).default([]),
  outDir: z.string().min(1),
  primaryMetric: z.string().min(1).optional(),
  testSize: z.number().gt(0).lt(1).default(0.25),
  validationSize: z.number().min(0).lt(1).default(0),
  seed: z.number().int().default(17),
  scale: z.boolean().default(false),
  cvFolds: z.number().int().min(0).default(0),
  saveModel: z.boolean().default(true),
  permutationImportance: z.boolean().default(true),
  maxPermutationRows: z.number().int().positive().default(500),
  params: z.record(z.string(), z.unknown()).default({}),
  python: z.string().min(1).optional(),
});
export type MlRunRequest = z.infer<typeof mlRunRequestSchema>;

export const mlComparisonRequestSchema = mlRunRequestSchema.omit({ modelId: true }).extend({
  modelIds: z.array(z.string().min(1)).min(1),
});
export type MlComparisonRequest = z.infer<typeof mlComparisonRequestSchema>;

export interface MlRunResult {
  schemaVersion: 1;
  runId: string;
  task: MlTaskType;
  modelId: string;
  status: MlRunStatus;
  primaryMetric: string | null;
  primaryMetricDirection: MlMetricDirection | null;
  metrics: Record<string, unknown>;
  warnings: string[];
  errors: string[];
  preprocessing: {
    rowCount: number;
    featureCount: number;
    numericFeatures: string[];
    categoricalFeatures: string[];
    excludedColumns: string[];
    trainRows?: number;
    testRows?: number;
    transformedShape?: [number, number];
  };
  evaluation: {
    split: "train_test" | "full_data" | "cross_validation";
    crossValidation?: Record<string, unknown>;
  };
  explanation: {
    coefficients?: Array<{ feature: string; value: number }>;
    featureImportances?: Array<{ feature: string; value: number }>;
    permutationImportance?: Array<{ feature: string; value: number; std?: number }>;
    shapAvailable: boolean;
    shapStatus: "not_requested" | "optional_missing" | "not_supported";
  };
  artifacts: MlArtifact[];
  outDir: string;
}

export interface MlComparisonResult {
  schemaVersion: 1;
  comparisonId: string;
  task: MlTaskType;
  primaryMetric: string;
  primaryMetricDirection: MlMetricDirection;
  ranked: Array<{
    rank: number;
    modelId: string;
    status: MlRunStatus;
    score: number | null;
    warnings: string[];
    errors: string[];
    outDir: string;
  }>;
  runs: MlRunResult[];
  warnings: string[];
  outDir: string;
}
