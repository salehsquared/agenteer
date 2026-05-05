import type { StatsMethod } from "./schemas.js";

const analysisMethodToStatsMethod: Readonly<Record<string, StatsMethod>> = {
  "table-one-descriptive-summary": "descriptive",
  "two-sample-t-test": "t-test",
  "mann-whitney-u": "mann-whitney",
  "chi-square-independence": "chi-square",
  "fisher-exact-test": "fisher-exact",
  "pearson-correlation": "pearson",
  "spearman-correlation": "spearman",
  "multiple-linear-regression": "linear-regression",
  "binary-logistic-regression": "logistic-regression",
  "poisson-regression": "poisson-regression",
  "diagnostic-accuracy-basic": "diagnostic-accuracy",
};

export function statsRunMethodForAnalysisMethod(methodId: string): StatsMethod | null {
  return analysisMethodToStatsMethod[methodId] ?? null;
}

export function analysisMethodIdsWithStatsRunner(): string[] {
  return Object.keys(analysisMethodToStatsMethod);
}
