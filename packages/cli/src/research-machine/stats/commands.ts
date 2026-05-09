import path from "node:path";
import { renderFigureQaCli, renderFigureQaJson, writeFigureQa, type FigureQaResult } from "./figure-qa.js";
import { runStatsMethod } from "./runner.js";
import { statsMethodSchema, type StatsMethod, type StatsRunRequest, type StatsRunResult } from "./schemas.js";

export async function researchStatsRunCommand(opts: Omit<StatsRunRequest, "schemaVersion">): Promise<StatsRunResult> {
  return runStatsMethod({ schemaVersion: 1, ...opts });
}

export function parseStatsMethod(value: string): StatsMethod {
  return statsMethodSchema.parse(value);
}

export function renderResearchStatsRun(result: StatsRunResult): string {
  const first = result.estimates[0] ?? {};
  const p = typeof first.p_value === "number" ? `; p=${first.p_value}` : "";
  const qaArtifact = result.artifacts.find(artifact => artifact.kind === "qa");
  const reportArtifact = result.artifacts.find(artifact => artifact.kind === "report");
  return [
    `research stats run: ${result.runId}`,
    `  method: ${result.method}`,
    `  status: ${result.status}`,
    `  rows: ${result.rowCount}`,
    `  complete-case n: ${result.completeCaseN}`,
    `  binding: ${result.binding.status}${result.binding.methodId ? `; method=${result.binding.methodId}` : ""}`,
    `  estimates: ${result.estimates.length}${p}`,
    `  issues: ${result.issues.length}`,
    `  warnings: ${result.warnings.length}`,
    `  errors: ${result.errors.length}`,
    `  report: ${reportArtifact ? path.resolve(reportArtifact.path) : "(missing)"}`,
    `  qa: ${qaArtifact ? path.resolve(qaArtifact.path) : "(missing)"}`,
    `  out: ${path.resolve(result.outDir)}`,
  ].join("\n");
}

export function renderResearchStatsRunJson(result: StatsRunResult): string {
  return `${JSON.stringify({ schemaVersion: 1, statsRun: result }, null, 2)}\n`;
}

export async function researchFigureQaCommand(opts: { manifestPath: string; outPath?: string; reportPath?: string }): Promise<FigureQaResult & { outPath: string | null; reportPath: string | null }> {
  return writeFigureQa(opts);
}

export const renderResearchFigureQa = renderFigureQaCli;
export const renderResearchFigureQaJson = renderFigureQaJson;
