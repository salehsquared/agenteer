import type { StatsMethod } from "./schemas.js";

const analysisMethodToStatsMethod: Readonly<Record<string, StatsMethod>> = {
  "table-one-descriptive-summary": "descriptive",
  "two-sample-t-test": "t-test",
  "paired-t-test": "paired-t-test",
  "welch-t-test": "welch-t-test",
  "one-way-anova": "anova",
  "ancova": "ancova",
  "mann-whitney-u": "mann-whitney",
  "wilcoxon-signed-rank": "wilcoxon",
  "kruskal-wallis": "kruskal-wallis",
  "friedman-test": "friedman",
  "chi-square-independence": "chi-square",
  "fisher-exact-test": "fisher-exact",
  "mcnemar-test": "mcnemar",
  "cochran-armitage-trend": "cochran-armitage-trend",
  "pearson-correlation": "pearson",
  "spearman-correlation": "spearman",
  "kendall-correlation": "kendall",
  "partial-correlation": "partial-correlation",
  "multiple-linear-regression": "linear-regression",
  "robust-linear-regression": "robust-linear-regression",
  "binary-logistic-regression": "logistic-regression",
  "ordinal-logistic-regression": "ordinal-logistic-regression",
  "multinomial-logistic-regression": "multinomial-logistic-regression",
  "poisson-regression": "poisson-regression",
  "negative-binomial-regression": "negative-binomial-regression",
  "zero-inflated-poisson": "zero-inflated-poisson",
  "zero-inflated-negative-binomial": "zero-inflated-negative-binomial",
  "gamma-regression": "gamma-glm",
  "inverse-gaussian-regression": "inverse-gaussian-glm",
  "quantile-regression": "quantile-regression",
  "kaplan-meier-log-rank": "kaplan-meier",
  "cox-proportional-hazards": "cox-proportional-hazards",
  "fine-gray-competing-risks": "fine-gray",
  "linear-mixed-model": "linear-mixed-model",
  "generalized-estimating-equations": "gee",
  "repeated-measures-anova": "repeated-measures-anova",
  "difference-in-differences": "difference-in-differences",
  "interrupted-time-series": "interrupted-time-series",
  "regression-discontinuity": "regression-discontinuity",
  "instrumental-variables": "instrumental-variables-2sls",
  "multiple-imputation-mice": "multiple-imputation-mice",
  "model-diagnostics": "model-diagnostics",
  "cronbach-alpha": "cronbach-alpha",
  "principal-component-analysis": "pca",
  "bland-altman": "bland-altman",
  "multiple-comparison-correction": "multiple-comparison-correction",
  "power-sample-size": "power-sample-size",
  "diagnostic-accuracy-basic": "diagnostic-accuracy",
  "propensity-score-matching": "propensity-score-matching",
  "propensity-score-weighting": "propensity-score-weighting",
};

export function statsRunMethodForAnalysisMethod(methodId: string): StatsMethod | null {
  return analysisMethodToStatsMethod[methodId] ?? null;
}

export function analysisMethodIdsWithStatsRunner(): string[] {
  return Object.keys(analysisMethodToStatsMethod);
}
