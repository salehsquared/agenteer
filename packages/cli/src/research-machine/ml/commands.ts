import path from "node:path";
import { listMlModels } from "./catalog.js";
import { compareMlModels, inspectMlRun, runMlModel, validateMlTask } from "./runner.js";
import type { MlComparisonRequest, MlComparisonResult, MlRunRequest, MlRunResult, MlTaskType } from "./schemas.js";

export function researchMlModelsCommand(opts: { task?: MlTaskType; includeUnavailable?: boolean } = {}) {
  const models = listMlModels(opts);
  return {
    task: opts.task ?? null,
    models,
    nextAction: "Use ml-run for one model or ml-compare to rank compatible models on the same split.",
  };
}

export async function researchMlRunCommand(opts: Omit<MlRunRequest, "schemaVersion">): Promise<MlRunResult> {
  return runMlModel({ schemaVersion: 1, ...opts });
}

export async function researchMlCompareCommand(opts: Omit<MlComparisonRequest, "schemaVersion">): Promise<MlComparisonResult> {
  return compareMlModels({ schemaVersion: 1, ...opts });
}

export async function researchMlInspectCommand(opts: { runPath: string }): Promise<MlRunResult> {
  return inspectMlRun(opts.runPath);
}

export function parseMlTask(value: string | undefined): MlTaskType | undefined {
  return value === undefined ? undefined : validateMlTask(value);
}

export function parseMlTaskRequired(value: string): MlTaskType {
  return validateMlTask(value);
}

export function parseMlNumber(value: string | undefined, fallback: number): number {
  if (value === undefined) return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) throw new Error(`Expected numeric value, got '${value}'`);
  return parsed;
}

export function parseMlInteger(value: string | undefined, fallback: number): number {
  const parsed = parseMlNumber(value, fallback);
  if (!Number.isInteger(parsed)) throw new Error(`Expected integer value, got '${value}'`);
  return parsed;
}

export function renderResearchMlModels(result: ReturnType<typeof researchMlModelsCommand>): string {
  return [
    `research ML models${result.task ? `: ${result.task}` : ""}`,
    `  models: ${result.models.length}`,
    ...result.models.map(model => `  ${model.id}: ${model.label} [${model.tasks.join(", ")}; ${model.availability}${model.requiredPackage ? `; requires ${model.requiredPackage}` : ""}]`),
    `  next: ${result.nextAction}`,
  ].join("\n");
}

export function renderResearchMlModelsJson(result: ReturnType<typeof researchMlModelsCommand>): string {
  return `${JSON.stringify({ schemaVersion: 1, mlModels: result }, null, 2)}\n`;
}

export function renderResearchMlRun(result: MlRunResult): string {
  const metric = result.primaryMetric ? result.metrics[result.primaryMetric] : undefined;
  return [
    `research ML run: ${result.runId}`,
    `  task: ${result.task}`,
    `  model: ${result.modelId}`,
    `  status: ${result.status}`,
    `  posture: ${result.resultPosture?.status ?? "missing"}`,
    result.resultPosture?.interpretationBoundary ? `  boundary: ${result.resultPosture.interpretationBoundary}` : "",
    `  primary metric: ${result.primaryMetric ?? "(none)"}${typeof metric === "number" ? `=${metric}` : ""}`,
    `  rows: ${result.preprocessing.rowCount}`,
    `  features: ${result.preprocessing.featureCount}`,
    `  warnings: ${result.warnings.length}`,
    `  errors: ${result.errors.length}`,
    `  out: ${path.resolve(result.outDir)}`,
  ].filter(Boolean).join("\n");
}

export function renderResearchMlRunJson(result: MlRunResult): string {
  return `${JSON.stringify({ schemaVersion: 1, mlRun: result }, null, 2)}\n`;
}

export function renderResearchMlComparison(result: MlComparisonResult): string {
  return [
    `research ML comparison: ${result.comparisonId}`,
    `  task: ${result.task}`,
    `  primary metric: ${result.primaryMetric} (${result.primaryMetricDirection})`,
    `  posture: ${result.comparisonPosture?.status ?? "missing"}`,
    `  review card: ${result.reviewCard?.status ?? "missing"}${result.reviewCard?.path ? ` (${result.reviewCard.path})` : ""}`,
    `  models: ${result.ranked.length}`,
    ...result.ranked.map(item => `  ${item.rank}. ${item.modelId}: ${item.score ?? "(unavailable)"} [${item.status}]`),
    `  warnings: ${result.warnings.length}`,
    `  out: ${path.resolve(result.outDir)}`,
  ].join("\n");
}

export function renderResearchMlComparisonJson(result: MlComparisonResult): string {
  return `${JSON.stringify({ schemaVersion: 1, mlComparison: result }, null, 2)}\n`;
}
