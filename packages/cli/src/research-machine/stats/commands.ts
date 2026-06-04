import path from "node:path";
import {
  auditStatisticalMethodFigureAliases,
  auditStatisticalMethodFigureSourceColumns,
  auditStatisticalMethodQaGateAliases,
  auditStatisticalMethodRequiredArguments,
  auditStatisticalMethodTableArtifacts,
  expectedTableArtifactFiles,
  figureSourceColumnRequestFields,
  getStatisticalMethodSpec,
  listStatisticalMethodSpecs,
  statsRunnerCapabilityForMethod,
  type FigureAliasAudit,
  type FigureSourceColumnAudit,
  type QaGateAliasAudit,
  type RequiredArgumentContractAudit,
  type StatisticalMethodSpec,
  type StatsRunnerCapability,
  type TableArtifactContractAudit,
} from "./contracts.js";
import { renderFigureQaCli, renderFigureQaJson, writeFigureQa, type FigureQaResult } from "./figure-qa.js";
import { runStatsMethod } from "./runner.js";
import { statsMethodSchema, type StatsMethod, type StatsRunRequest, type StatsRunResult } from "./schemas.js";

export { auditStatisticalMethodFigureAliases, auditStatisticalMethodFigureSourceColumns, auditStatisticalMethodQaGateAliases, auditStatisticalMethodRequiredArguments, auditStatisticalMethodTableArtifacts, contractArgumentNameFor, contractArgumentRequestFields, expectedTableArtifactFiles, figureContractAliases, figureSourceColumnRequestFields, qaGateContractAliases, requiredContractArgumentsForMethod, statsRunnerCapabilityForMethod, type FigureAliasAudit, type FigureSourceColumnAudit, type QaGateAliasAudit, type RequiredArgumentContractAudit, type StatsContractArgumentName, type StatsRunnerCapability, type TableArtifactContractAudit } from "./contracts.js";

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
    `  runner: ${result.runnerCapability?.status ?? "missing"}`,
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

export function researchStatsContractsCommand(opts: { method?: StatsMethod } = {}): { contracts: StatisticalMethodSpec[]; capabilities: StatsRunnerCapability[]; figureAliasAudit: FigureAliasAudit; figureSourceColumnAudit: FigureSourceColumnAudit; qaGateAliasAudit: QaGateAliasAudit; requiredArgumentAudit: RequiredArgumentContractAudit; tableArtifactAudit: TableArtifactContractAudit; method: StatsMethod | null; nextAction: string } {
  const contracts = opts.method ? [getStatisticalMethodSpec(opts.method)] : listStatisticalMethodSpecs();
  const capabilities = contracts.map(contract => statsRunnerCapabilityForMethod(contract.method));
  const figureAliasAudit = auditStatisticalMethodFigureAliases(contracts);
  const figureSourceColumnAudit = auditStatisticalMethodFigureSourceColumns(contracts);
  const qaGateAliasAudit = auditStatisticalMethodQaGateAliases(contracts);
  const requiredArgumentAudit = auditStatisticalMethodRequiredArguments(contracts);
  const tableArtifactAudit = auditStatisticalMethodTableArtifacts(contracts);
  return {
    contracts,
    capabilities,
    figureAliasAudit,
    figureSourceColumnAudit,
    qaGateAliasAudit,
    requiredArgumentAudit,
    tableArtifactAudit,
    method: opts.method ?? null,
    nextAction: opts.method
      ? "Use this contract to verify required arguments, assumptions, diagnostics, figures, QA gates, and failure modes before stats-run."
      : "Inspect a specific method contract before execution, or run modeling-plan to pick a contract from data evidence.",
  };
}

export function renderResearchStatsContracts(result: ReturnType<typeof researchStatsContractsCommand>): string {
  return [
    `research stats contracts${result.method ? `: ${result.method}` : ""}`,
    `  methods: ${result.contracts.length}`,
    `  required arguments: refs=${result.requiredArgumentAudit.totalRequiredArgumentReferences}, unique=${result.requiredArgumentAudit.uniqueRequiredArguments.length}, unsupported=${result.requiredArgumentAudit.unsupportedRequiredArguments.join(", ") || "none"}`,
    `  table artifacts: required=${result.tableArtifactAudit.requiredFileExpectationCount}, conditional=${result.tableArtifactAudit.conditionalFileExpectationCount}, narrative=${result.tableArtifactAudit.narrativeExpectationCount}, missing-core=${result.tableArtifactAudit.missingCoreArtifacts.map(row => `${row.method}:${row.missingFiles.join("/")}`).join(", ") || "none"}`,
    `  figure aliases: required=${result.figureAliasAudit.requiredFigureCount}, abstract=${result.figureAliasAudit.abstractFigureCount}, concrete=${result.figureAliasAudit.concreteFigureCount}, unmapped=${result.figureAliasAudit.unmappedAbstractFigures.map(figure => `${figure.method}:${figure.figureId}`).join(", ") || "none"}`,
    `  figure sources: refs=${result.figureSourceColumnAudit.totalSourceColumnReferences}, unique=${result.figureSourceColumnAudit.uniqueSourceColumns.length}, unknown=${result.figureSourceColumnAudit.unknownSourceColumns.join(", ") || "none"}`,
    `  qa gate aliases: abstract=${result.qaGateAliasAudit.abstractGateCount}, concrete=${result.qaGateAliasAudit.concreteGateCount}, unmapped=${result.qaGateAliasAudit.unmappedAbstractGates.join(", ") || "none"}`,
    ...result.contracts.slice(0, 20).map(contract => [
      `  ${contract.method}: ${contract.family}`,
      `    runner: ${result.capabilities.find(capability => capability.method === contract.method)?.status ?? "unknown"}`,
      `    required: ${contract.requiredArguments.join(", ") || "(none)"}`,
      `    diagnostics: ${contract.diagnostics.slice(0, 5).join(", ")}${contract.diagnostics.length > 5 ? ", ..." : ""}`,
      `    required figures: ${contract.expectedFigures.filter(figure => figure.required).map(figure => figure.label).join(", ") || "(none)"}`,
      `    qa gates: ${contract.qaGates.slice(0, 6).join(", ")}${contract.qaGates.length > 6 ? ", ..." : ""}`,
    ].join("\n")),
    result.contracts.length > 20 ? `  ... ${result.contracts.length - 20} more contract(s)` : null,
    `  next: ${result.nextAction}`,
  ].filter((line): line is string => Boolean(line)).join("\n");
}

export function renderResearchStatsContractsJson(result: ReturnType<typeof researchStatsContractsCommand>): string {
  return `${JSON.stringify({ schemaVersion: 1, statsContracts: result }, null, 2)}\n`;
}

export async function researchFigureQaCommand(opts: { manifestPath: string; outPath?: string; reportPath?: string }): Promise<FigureQaResult & { outPath: string | null; reportPath: string | null }> {
  return writeFigureQa(opts);
}

export const renderResearchFigureQa = renderFigureQaCli;
export const renderResearchFigureQaJson = renderFigureQaJson;
