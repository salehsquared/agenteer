import { createHash, createHmac } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

export const DEFAULT_MEDBREVIA_SEARCH_BASE_URL = "http://localhost:3000";
export const DEFAULT_MEDBREVIA_AGENT_API_KEY = "agenteer-local-literature-dev-key-2026";

export type MedBreviaLiteratureStatus = "succeeded" | "failed";
export type MedBreviaSearchAuthMode = "api-key" | "bearer" | "mobile-jwt" | "cookie" | "none";
export type LiteratureSourceType = "pubmed" | "trial" | "guideline" | "dailymed" | "chembl" | "unknown";
export type LiteratureQaStatus = "pass" | "warning" | "fail";

export interface LiteratureSource {
  id: string;
  sourceType: LiteratureSourceType;
  title: string;
  journal: string | null;
  publicationDate: string | null;
  publicationYear: number | null;
  url: string | null;
  abstract: string | null;
  snippet: string | null;
  evidenceType: string[];
  retrievalScore: number | null;
  qualityScore: number;
  citationLabel: string;
  raw: Record<string, unknown>;
}

export interface ResearchLiteratureSearchResult {
  schemaVersion: 1;
  generatedAtIso: string;
  searchId: string;
  provider: "medbrevia-search";
  status: MedBreviaLiteratureStatus;
  request: {
    question: string;
    baseUrl: string;
    endpoint: string;
    responseDepth: "quick" | "standard" | "long";
    dateRange: string;
    highImpact: boolean;
    prefersList: boolean;
    topK: number;
    timeoutMs: number;
    authMode: MedBreviaSearchAuthMode;
  };
  evidenceSummary: {
    sourceCount: number;
    pubmedCount: number;
    trialCount: number;
    guidelineCount: number;
    nonPubmedLaneCount: number;
    highQualitySourceCount: number;
    latestPublicationYear: number | null;
    plannedSearchCount: number;
    selectedPmidCount: number;
    briefingAvailable: boolean;
  };
  plannedSearches: string[];
  qHash: string | null;
  briefingText: string | null;
  sources: LiteratureSource[];
  events: Array<{ event: string; data: unknown }>;
  warnings: string[];
  errors: string[];
  timings: Record<string, unknown> | null;
  retrievalDebug: Record<string, unknown> | null;
  outPath: string | null;
  reportPath: string | null;
}

export interface ResearchLiteratureQaCheck {
  id: string;
  status: LiteratureQaStatus;
  severity: "info" | "minor" | "major" | "blocker";
  message: string;
  evidenceRefs: string[];
  recommendedAction: string;
}

export interface ResearchLiteratureQaResult {
  schemaVersion: 1;
  generatedAtIso: string;
  question: string;
  literaturePath: string;
  paperPath: string | null;
  status: LiteratureQaStatus;
  checks: ResearchLiteratureQaCheck[];
  evidenceSummary: ResearchLiteratureSearchResult["evidenceSummary"];
  citedSourceIds: string[];
  uncitedHighQualitySourceIds: string[];
  overlap: {
    questionTokenCoverage: number;
    paperTokenCoverage: number | null;
  };
  nextAction: string;
  outPath: string | null;
  reportPath: string | null;
}

export interface ResearchLiteratureContext {
  schemaVersion: 1;
  generatedAtIso: string;
  contextId: string;
  question: string;
  literaturePath: string;
  searchId: string;
  status: "ready" | "needs_more_evidence" | "failed";
  evidenceStrength: "none" | "sparse" | "adequate" | "strong";
  sourceSummary: ResearchLiteratureSearchResult["evidenceSummary"];
  sourceDigest: string;
  quality: {
    questionTokenCoverage: number;
    highQualityFraction: number;
    latestPublicationYear: number | null;
    yearsSinceLatest: number | null;
  };
  designSignals: string[];
  methodSignals: string[];
  planningImplications: string[];
  followUpSearches: string[];
  issues: ResearchLiteratureQaCheck[];
  outPath: string | null;
  reportPath: string | null;
}

interface SseEvent {
  event: string;
  data: unknown;
}

export async function researchMedbreviaLiteratureSearchCommand(opts: {
  question: string;
  baseUrl?: string;
  endpoint?: string;
  apiKey?: string;
  bearerToken?: string;
  cookie?: string;
  authSecret?: string;
  userId?: string;
  userEmail?: string;
  responseDepth?: "quick" | "standard" | "long";
  dateRange?: string;
  highImpact?: boolean;
  prefersList?: boolean;
  topK?: number;
  timeoutMs?: number;
  outPath?: string;
  reportPath?: string;
  mockResponsePath?: string;
}): Promise<ResearchLiteratureSearchResult> {
  const baseUrl = normalizeBaseUrl(opts.baseUrl ?? process.env.MEDBREVIA_SEARCH_BASE_URL ?? DEFAULT_MEDBREVIA_SEARCH_BASE_URL);
  const endpoint = opts.endpoint ?? "/api/search";
  const responseDepth = opts.responseDepth ?? "standard";
  const dateRange = opts.dateRange ?? "5y";
  const topK = Math.max(1, Math.min(50, Math.floor(opts.topK ?? 12)));
  const timeoutMs = Math.max(1000, Math.floor(opts.timeoutMs ?? 120000));
  const auth = buildMedBreviaAuthHeaders(opts);
  const request = {
    question: opts.question,
    baseUrl,
    endpoint,
    responseDepth,
    dateRange,
    highImpact: opts.highImpact ?? false,
    prefersList: opts.prefersList ?? true,
    topK,
    timeoutMs,
    authMode: auth.mode,
  };

  let events: SseEvent[] = [];
  const warnings: string[] = [];
  const errors: string[] = [];

  if (opts.mockResponsePath) {
    const raw = JSON.parse(await readFile(path.resolve(opts.mockResponsePath), "utf-8")) as Record<string, unknown>;
    if (raw.literatureSearch && typeof raw.literatureSearch === "object" && Array.isArray((raw.literatureSearch as Record<string, unknown>).sources)) {
      const existing = raw.literatureSearch as ResearchLiteratureSearchResult;
      const result: ResearchLiteratureSearchResult = {
        ...existing,
        generatedAtIso: new Date().toISOString(),
        request: {
          ...existing.request,
          question: opts.question,
          baseUrl,
          endpoint,
          responseDepth,
          dateRange,
          highImpact: opts.highImpact ?? existing.request.highImpact ?? false,
          prefersList: opts.prefersList ?? existing.request.prefersList ?? true,
          topK,
          timeoutMs,
          authMode: auth.mode,
        },
        outPath: null,
        reportPath: null,
      };
      if (opts.outPath) {
        const outPath = path.resolve(opts.outPath);
        await mkdir(path.dirname(outPath), { recursive: true });
        result.outPath = outPath;
        await writeFile(outPath, renderResearchMedbreviaLiteratureSearchJson(result), "utf-8");
      }
      if (opts.reportPath) {
        const reportPath = path.resolve(opts.reportPath);
        await mkdir(path.dirname(reportPath), { recursive: true });
        result.reportPath = reportPath;
        await writeFile(reportPath, renderResearchMedbreviaLiteratureSearch(result), "utf-8");
      }
      return result;
    }
    events = Array.isArray(raw.events) ? raw.events.map(normalizeSseEvent).filter(Boolean) as SseEvent[] : [];
    if (!events.length && raw.literatureSearch && typeof raw.literatureSearch === "object") {
      const existing = raw.literatureSearch as ResearchLiteratureSearchResult;
      events = existing.events.map(normalizeSseEvent).filter(Boolean) as SseEvent[];
    }
    if (!events.length) warnings.push("Mock response did not contain SSE events; normalized sources may be empty.");
  } else {
    const url = new URL(endpoint, baseUrl).toString();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "text/event-stream, application/json",
          ...auth.headers,
        },
        body: JSON.stringify({
          question: opts.question,
          response_depth: responseDepth,
          date_range: dateRange,
          is_high_impact: opts.highImpact ?? false,
          prefers_list: opts.prefersList ?? true,
          top_k: topK,
          agenteer_api_key: opts.apiKey ?? process.env.MEDBREVIA_SEARCH_API_KEY ?? DEFAULT_MEDBREVIA_AGENT_API_KEY,
        }),
        signal: controller.signal,
      });
      if (!response.ok) {
        errors.push(`MedBrevia search returned HTTP ${response.status}: ${await safeResponseText(response)}`);
      } else {
        const contentType = response.headers.get("content-type") ?? "";
        if (contentType.includes("text/event-stream")) {
          events = await parseSseResponse(response);
        } else {
          const json = await response.json().catch(() => null);
          events = normalizeJsonSearchResponse(json);
        }
      }
    } catch (err) {
      errors.push(err instanceof Error ? err.message : String(err));
    } finally {
      clearTimeout(timeout);
    }
  }

  const result = buildLiteratureSearchResult({ request, events, warnings, errors });
  if (opts.outPath) {
    const outPath = path.resolve(opts.outPath);
    await mkdir(path.dirname(outPath), { recursive: true });
    result.outPath = outPath;
    await writeFile(outPath, renderResearchMedbreviaLiteratureSearchJson(result), "utf-8");
  }
  if (opts.reportPath) {
    const reportPath = path.resolve(opts.reportPath);
    await mkdir(path.dirname(reportPath), { recursive: true });
    result.reportPath = reportPath;
    await writeFile(reportPath, renderResearchMedbreviaLiteratureSearch(result), "utf-8");
  }
  return result;
}

export async function researchLiteratureQaCommand(opts: {
  question?: string;
  literaturePath: string;
  paperPath?: string;
  outPath?: string;
  reportPath?: string;
}): Promise<ResearchLiteratureQaResult> {
  const literaturePath = path.resolve(opts.literaturePath);
  const literature = unwrapLiteratureSearch(JSON.parse(await readFile(literaturePath, "utf-8")) as Record<string, unknown>);
  const paperPath = opts.paperPath ? path.resolve(opts.paperPath) : null;
  const paper = paperPath ? await readFile(paperPath, "utf-8").catch(() => "") : "";
  const question = opts.question ?? literature.request.question;
  const questionCoverage = tokenCoverage(question, literature.sources.map(source => `${source.title} ${source.abstract ?? ""} ${source.snippet ?? ""}`).join("\n"));
  const paperCoverage = paper ? tokenCoverage(paper, literature.sources.map(source => `${source.title} ${source.abstract ?? ""} ${source.snippet ?? ""}`).join("\n")) : null;
  const citedSourceIds = findCitedSourceIds(paper, literature.sources);
  const highQuality = literature.sources.filter(source => source.qualityScore >= 0.72);
  const uncitedHighQualitySourceIds = paper
    ? highQuality.filter(source => !citedSourceIds.includes(source.id)).map(source => source.id)
    : highQuality.map(source => source.id);
  const checks: ResearchLiteratureQaCheck[] = [
    qaCheck("literature-search-status", literature.status === "succeeded" ? "pass" : "fail", literature.status === "succeeded" ? "Search completed successfully." : `Search failed: ${literature.errors.join("; ") || "unknown failure"}`, ["literatureSearch.status"], "Repair MedBrevia search connectivity/auth before treating literature QA as complete."),
    qaCheck("source-count", literature.evidenceSummary.sourceCount >= 3 ? "pass" : literature.evidenceSummary.sourceCount > 0 ? "warning" : "fail", `${literature.evidenceSummary.sourceCount} literature source(s) were available.`, ["literatureSearch.sources"], "Run additional searches or broaden the query if evidence is sparse."),
    qaCheck("high-quality-sources", literature.evidenceSummary.highQualitySourceCount > 0 ? "pass" : "warning", `${literature.evidenceSummary.highQualitySourceCount} high-quality source(s) were detected.`, ["literatureSearch.evidenceSummary.highQualitySourceCount"], "Prefer guidelines, systematic reviews, randomized trials, and complete abstracts when shaping claims."),
    qaCheck("question-overlap", questionCoverage >= 0.35 ? "pass" : questionCoverage >= 0.2 ? "warning" : "fail", `Question-token coverage in retrieved evidence is ${formatPercent(questionCoverage)}.`, ["question", "literatureSearch.sources"], "Revise the search query or add focused follow-up searches for the missing clinical concepts."),
    qaCheck("paper-citation-coverage", !paper ? "warning" : citedSourceIds.length > 0 ? "pass" : "fail", paper ? `${citedSourceIds.length} retrieved source id(s) are cited or mentioned in the paper.` : "No paper was supplied; post-run citation QA was skipped.", paperPath ? [paperPath] : [], "Cite or explicitly discuss the retrieved PMID/guideline/trial evidence in reader-facing papers."),
    qaCheck("paper-literature-overlap", !paper ? "warning" : paperCoverage != null && paperCoverage >= 0.25 ? "pass" : "warning", paper ? `Paper-token coverage in retrieved evidence is ${formatPercent(paperCoverage ?? 0)}.` : "No paper was supplied; paper overlap QA was skipped.", paperPath ? [paperPath, literaturePath] : [literaturePath], "Regenerate or revise the report if it does not discuss the retrieved literature context."),
    qaCheck("causal-and-clinical-boundary", !paper || hasConservativeBoundary(paper) ? "pass" : "warning", !paper || hasConservativeBoundary(paper) ? "Reader-facing causal/clinical boundary language was present or not applicable." : "The paper does not clearly bound causal, clinical, or deployment claims.", paperPath ? [paperPath] : [], "Add explicit language distinguishing local observational evidence from causal proof, recommendations, or deployment validation."),
  ];
  const status = checks.some(check => check.status === "fail") ? "fail" : checks.some(check => check.status === "warning") ? "warning" : "pass";
  const result: ResearchLiteratureQaResult = {
    schemaVersion: 1,
    generatedAtIso: new Date().toISOString(),
    question,
    literaturePath,
    paperPath,
    status,
    checks,
    evidenceSummary: literature.evidenceSummary,
    citedSourceIds,
    uncitedHighQualitySourceIds,
    overlap: {
      questionTokenCoverage: questionCoverage,
      paperTokenCoverage: paperCoverage,
    },
    nextAction: status === "pass"
      ? "Literature evidence is adequate for local review; preserve the search artifact with the packet."
      : status === "warning"
        ? "Review literature warnings before stronger claims or external sharing."
        : "Do not promote this packet until literature search and citation QA pass.",
    outPath: null,
    reportPath: null,
  };
  if (opts.outPath) {
    const outPath = path.resolve(opts.outPath);
    await mkdir(path.dirname(outPath), { recursive: true });
    result.outPath = outPath;
    await writeFile(outPath, renderResearchLiteratureQaJson(result), "utf-8");
  }
  if (opts.reportPath) {
    const reportPath = path.resolve(opts.reportPath);
    await mkdir(path.dirname(reportPath), { recursive: true });
    result.reportPath = reportPath;
    await writeFile(reportPath, renderResearchLiteratureQa(result), "utf-8");
  }
  return result;
}

export async function researchLiteratureContextCommand(opts: {
  literaturePath: string;
  question?: string;
  outPath?: string;
  reportPath?: string;
}): Promise<ResearchLiteratureContext> {
  const literaturePath = path.resolve(opts.literaturePath);
  const literature = unwrapLiteratureSearch(JSON.parse(await readFile(literaturePath, "utf-8")) as Record<string, unknown>);
  const result = buildLiteratureContext(literature, {
    literaturePath,
    question: opts.question ?? literature.request.question,
  });
  if (opts.outPath) {
    const outPath = path.resolve(opts.outPath);
    await mkdir(path.dirname(outPath), { recursive: true });
    result.outPath = outPath;
    await writeFile(outPath, renderResearchLiteratureContextJson(result), "utf-8");
  }
  if (opts.reportPath) {
    const reportPath = path.resolve(opts.reportPath);
    await mkdir(path.dirname(reportPath), { recursive: true });
    result.reportPath = reportPath;
    await writeFile(reportPath, renderResearchLiteratureContext(result), "utf-8");
  }
  return result;
}

export function renderResearchMedbreviaLiteratureSearch(result: ResearchLiteratureSearchResult): string {
  const lines = [
    `research literature search: ${result.searchId}`,
    `  provider: ${result.provider}`,
    `  status: ${result.status}`,
    `  question: ${result.request.question}`,
    `  base: ${result.request.baseUrl}${result.request.endpoint}`,
    `  sources: ${result.evidenceSummary.sourceCount} (${result.evidenceSummary.pubmedCount} PubMed; ${result.evidenceSummary.guidelineCount} guidelines; ${result.evidenceSummary.trialCount} trials)`,
    `  high quality: ${result.evidenceSummary.highQualitySourceCount}`,
    `  latest year: ${result.evidenceSummary.latestPublicationYear ?? "(unknown)"}`,
    `  planned searches: ${result.evidenceSummary.plannedSearchCount}`,
    `  q_hash: ${result.qHash ?? "(none)"}`,
  ];
  if (result.sources.length) {
    lines.push("", "Top sources:");
    for (const source of result.sources.slice(0, 8)) {
      lines.push(`- [${source.sourceType}] ${source.citationLabel}: ${source.title}${source.journal ? ` (${source.journal})` : ""}`);
    }
  }
  if (result.errors.length) lines.push("", "Errors:", ...result.errors.map(error => `- ${error}`));
  if (result.warnings.length) lines.push("", "Warnings:", ...result.warnings.map(warning => `- ${warning}`));
  return `${lines.join("\n")}\n`;
}

export function renderResearchMedbreviaLiteratureSearchJson(result: ResearchLiteratureSearchResult): string {
  return `${JSON.stringify({ schemaVersion: 1, literatureSearch: result }, null, 2)}\n`;
}

export function renderResearchLiteratureQa(result: ResearchLiteratureQaResult): string {
  return [
    `research literature QA: ${result.status}`,
    `  question: ${result.question}`,
    `  literature: ${result.literaturePath}`,
    `  paper: ${result.paperPath ?? "(none)"}`,
    `  source count: ${result.evidenceSummary.sourceCount}`,
    `  cited sources: ${result.citedSourceIds.join(", ") || "(none)"}`,
    `  question overlap: ${formatPercent(result.overlap.questionTokenCoverage)}`,
    `  paper overlap: ${result.overlap.paperTokenCoverage == null ? "(skipped)" : formatPercent(result.overlap.paperTokenCoverage)}`,
    "",
    "Checks:",
    ...result.checks.map(check => `- ${check.status}: ${check.id} - ${check.message}`),
    "",
    `Next: ${result.nextAction}`,
  ].join("\n");
}

export function renderResearchLiteratureQaJson(result: ResearchLiteratureQaResult): string {
  return `${JSON.stringify({ schemaVersion: 1, literatureQa: result }, null, 2)}\n`;
}

export function renderResearchLiteratureContext(result: ResearchLiteratureContext): string {
  return [
    `research literature context: ${result.status}`,
    `  question: ${result.question}`,
    `  evidence: ${result.evidenceStrength}; sources=${result.sourceSummary.sourceCount}; high-quality=${result.sourceSummary.highQualitySourceCount}`,
    `  latest year: ${result.sourceSummary.latestPublicationYear ?? "(unknown)"}`,
    `  design signals: ${result.designSignals.join(", ") || "(none)"}`,
    `  method signals: ${result.methodSignals.join(", ") || "(none)"}`,
    "",
    "Planning implications:",
    ...result.planningImplications.map(item => `- ${item}`),
    "",
    "Follow-up searches:",
    ...result.followUpSearches.map(item => `- ${item}`),
    "",
    "Issues:",
    ...result.issues.map(issue => `- ${issue.status}: ${issue.id} - ${issue.message}`),
  ].join("\n");
}

export function renderResearchLiteratureContextJson(result: ResearchLiteratureContext): string {
  return `${JSON.stringify({ schemaVersion: 1, literatureContext: result }, null, 2)}\n`;
}

function buildLiteratureContext(literature: ResearchLiteratureSearchResult, opts: { literaturePath: string; question: string }): ResearchLiteratureContext {
  const corpus = [
    opts.question,
    literature.briefingText ?? "",
    ...literature.sources.map(source => `${source.title} ${source.abstract ?? ""} ${source.snippet ?? ""} ${source.evidenceType.join(" ")}`),
  ].join("\n").toLowerCase();
  const questionCoverage = tokenCoverage(opts.question, literature.sources.map(source => `${source.title} ${source.abstract ?? ""} ${source.snippet ?? ""}`).join("\n"));
  const highQualityFraction = literature.evidenceSummary.sourceCount
    ? literature.evidenceSummary.highQualitySourceCount / literature.evidenceSummary.sourceCount
    : 0;
  const currentYear = new Date().getUTCFullYear();
  const yearsSinceLatest = literature.evidenceSummary.latestPublicationYear == null ? null : currentYear - literature.evidenceSummary.latestPublicationYear;
  const designSignals = detectSignals(corpus, [
    ["systematic-review", /\bsystematic review|meta-analysis\b/],
    ["guideline", /\bguideline|recommendation|consensus\b/],
    ["randomized-trial", /\brandomi[sz]ed|clinical trial|trial registry\b/],
    ["observational-cohort", /\bcohort|observational|retrospective|prospective\b/],
    ["cross-sectional", /\bcross-sectional|survey\b/],
    ["case-control", /\bcase-control|matched case\b/],
    ["diagnostic-accuracy", /\bsensitivity|specificity|diagnostic accuracy|roc|auc|reference standard\b/],
    ["prediction-validation", /\bprediction model|risk score|calibration|validation|c-statistic|auroc\b/],
    ["causal-inference", /\bcausal|propensity|target trial|instrumental variable|difference-in-differences|marginal structural\b/],
  ]);
  const methodSignals = detectSignals(corpus, [
    ["survey-design", /\bsurvey weight|complex survey|stratified sample|psu|sampling weight\b/],
    ["missing-data", /\bmissing data|multiple imputation|complete case|mice\b/],
    ["sparse-events", /\bsparse|rare event|low event|separation\b/],
    ["propensity", /\bpropensity score|matching|inverse probability|iptw\b/],
    ["survival", /\bsurvival|cox|kaplan-meier|time-to-event|hazard ratio\b/],
    ["calibration", /\bcalibration|brier|decision curve|net benefit\b/],
    ["external-validation", /\bexternal validation|temporal validation|geographic validation\b/],
  ]);
  const issues: ResearchLiteratureQaCheck[] = [
    qaCheck("literature-search-status", literature.status === "succeeded" ? "pass" : "fail", literature.status === "succeeded" ? "MedBrevia search completed." : `MedBrevia search failed: ${literature.errors.join("; ") || "unknown error"}`, ["literatureSearch.status"], "Repair search connectivity/auth before using literature context in planning."),
    qaCheck("literature-source-depth", literature.evidenceSummary.sourceCount >= 5 ? "pass" : literature.evidenceSummary.sourceCount >= 3 ? "warning" : "fail", `${literature.evidenceSummary.sourceCount} source(s) available for planning.`, ["literatureSearch.sources"], "Run focused follow-up searches before choosing methods for broad claims."),
    qaCheck("literature-quality-depth", literature.evidenceSummary.highQualitySourceCount >= 2 ? "pass" : literature.evidenceSummary.highQualitySourceCount >= 1 ? "warning" : "fail", `${literature.evidenceSummary.highQualitySourceCount} high-quality source(s) detected.`, ["literatureSearch.evidenceSummary"], "Prefer systematic reviews, guidelines, trials, and full abstracts when setting claim boundaries."),
    qaCheck("literature-question-fit", questionCoverage >= 0.35 ? "pass" : questionCoverage >= 0.2 ? "warning" : "fail", `Question/evidence token overlap is ${formatPercent(questionCoverage)}.`, ["question", "literatureSearch.sources"], "Revise the query or add follow-up searches for missing population/exposure/outcome concepts."),
    qaCheck("literature-recency", yearsSinceLatest == null || yearsSinceLatest > 10 ? "warning" : "pass", yearsSinceLatest == null ? "No source recency could be inferred." : `Latest source is ${yearsSinceLatest} year(s) old.`, ["literatureSearch.evidenceSummary.latestPublicationYear"], "Run a current-date-range search when evidence appears stale or undated."),
  ];
  const evidenceStrength = literature.status !== "succeeded" || literature.evidenceSummary.sourceCount === 0
    ? "none"
    : literature.evidenceSummary.sourceCount < 3 || questionCoverage < 0.2
      ? "sparse"
      : literature.evidenceSummary.highQualitySourceCount >= 2 && questionCoverage >= 0.35
        ? "strong"
        : "adequate";
  const status = literature.status === "failed" || issues.some(issue => issue.status === "fail")
    ? "failed"
    : issues.some(issue => issue.status === "warning") || evidenceStrength === "sparse"
      ? "needs_more_evidence"
      : "ready";
  const planningImplications = buildPlanningImplications({ designSignals, methodSignals, evidenceStrength });
  const followUpSearches = buildFollowUpSearches(opts.question, designSignals, methodSignals, literature);
  return {
    schemaVersion: 1,
    generatedAtIso: new Date().toISOString(),
    contextId: `literature_context_${hash({ searchId: literature.searchId, question: opts.question, sources: literature.sources.map(source => source.id) }).slice(0, 16)}`,
    question: opts.question,
    literaturePath: opts.literaturePath,
    searchId: literature.searchId,
    status,
    evidenceStrength,
    sourceSummary: literature.evidenceSummary,
    sourceDigest: hash(literature.sources.map(source => ({ id: source.id, type: source.sourceType, title: source.title, quality: source.qualityScore }))),
    quality: {
      questionTokenCoverage: questionCoverage,
      highQualityFraction,
      latestPublicationYear: literature.evidenceSummary.latestPublicationYear,
      yearsSinceLatest,
    },
    designSignals,
    methodSignals,
    planningImplications,
    followUpSearches,
    issues,
    outPath: null,
    reportPath: null,
  };
}

function detectSignals(corpus: string, patterns: Array<[string, RegExp]>): string[] {
  return patterns.filter(([, pattern]) => pattern.test(corpus)).map(([signal]) => signal);
}

function buildPlanningImplications(opts: { designSignals: string[]; methodSignals: string[]; evidenceStrength: ResearchLiteratureContext["evidenceStrength"] }): string[] {
  const implications = new Set<string>();
  if (opts.evidenceStrength === "none" || opts.evidenceStrength === "sparse") implications.add("Treat the literature pass as incomplete; do not promote strong background, clinical, or causal claims.");
  if (opts.designSignals.includes("diagnostic-accuracy")) implications.add("If the question is diagnostic, require reference standard, index test, threshold policy, and diagnostic accuracy intervals.");
  if (opts.designSignals.includes("prediction-validation")) implications.add("If the question is prediction-oriented, require calibration, validation design, and intended-use boundaries.");
  if (opts.designSignals.includes("causal-inference") || opts.methodSignals.includes("propensity")) implications.add("If causal language is intended, require target-trial framing, measured-confounder rationale, positivity/overlap diagnostics, and sensitivity analysis.");
  if (opts.methodSignals.includes("survey-design")) implications.add("If using survey data, preserve weights, strata, PSU, domain/subsample eligibility, and cross-sectional limits.");
  if (opts.methodSignals.includes("missing-data")) implications.add("Add missingness mechanism review and sensitivity or imputation planning before interpretation.");
  if (opts.methodSignals.includes("sparse-events")) implications.add("Review sparse cells/events-per-parameter and consider exact, penalized, or simplified models.");
  if (opts.methodSignals.includes("external-validation")) implications.add("Do not treat local performance as deployable unless external or temporal validation is part of the plan.");
  if (implications.size === 0) implications.add("Use the evidence packet as background context, but continue to choose methods from dataset shape, study design, and AnalysisSpec evidence.");
  return [...implications];
}

function buildFollowUpSearches(question: string, designSignals: string[], methodSignals: string[], literature: ResearchLiteratureSearchResult): string[] {
  const searches: string[] = [];
  if (literature.evidenceSummary.highQualitySourceCount < 2) searches.push(`${question} systematic review guideline`);
  if (!designSignals.includes("guideline")) searches.push(`${question} guideline consensus statement`);
  if (designSignals.includes("diagnostic-accuracy") && !methodSignals.includes("calibration")) searches.push(`${question} diagnostic accuracy sensitivity specificity calibration`);
  if (designSignals.includes("prediction-validation") && !methodSignals.includes("external-validation")) searches.push(`${question} prediction model external validation calibration`);
  if (designSignals.includes("causal-inference") || methodSignals.includes("propensity")) searches.push(`${question} propensity score target trial sensitivity analysis`);
  if (methodSignals.includes("survey-design")) searches.push(`${question} complex survey weights strata PSU methods`);
  return [...new Set(searches)].slice(0, 6);
}

function buildLiteratureSearchResult(opts: {
  request: ResearchLiteratureSearchResult["request"];
  events: SseEvent[];
  warnings: string[];
  errors: string[];
}): ResearchLiteratureSearchResult {
  const events = opts.events.filter(event => event.event !== "heartbeat");
  const plan = lastEventData(events, "plan");
  const results = lastEventData(events, "results");
  const trials = lastEventData(events, "trials_results");
  const guidelines = lastEventData(events, "guideline_results");
  const dailyMed = lastEventData(events, "dailymed_results");
  const chembl = lastEventData(events, "chembl_results");
  const complete = lastEventData(events, "briefing_complete");
  const eventErrors = events.filter(event => event.event === "error").map(event => JSON.stringify(event.data));
  const sources = [
    ...normalizeArticleSources(results),
    ...normalizeTrialSources(trials),
    ...normalizeGuidelineSources(guidelines),
    ...normalizeDailyMedSources(dailyMed),
    ...normalizeChemblSources(chembl),
  ];
  const uniqueSources = dedupeSources(sources).slice(0, opts.request.topK);
  const latestPublicationYear = maxNullable(uniqueSources.map(source => source.publicationYear));
  const evidenceSummary = {
    sourceCount: uniqueSources.length,
    pubmedCount: uniqueSources.filter(source => source.sourceType === "pubmed").length,
    trialCount: uniqueSources.filter(source => source.sourceType === "trial").length,
    guidelineCount: uniqueSources.filter(source => source.sourceType === "guideline").length,
    nonPubmedLaneCount: uniqueSources.filter(source => source.sourceType !== "pubmed").length,
    highQualitySourceCount: uniqueSources.filter(source => source.qualityScore >= 0.72).length,
    latestPublicationYear,
    plannedSearchCount: arrayOfRecords(plan?.plannedSearches).length,
    selectedPmidCount: arrayOfStrings(plan?.selectedPmids).length,
    briefingAvailable: typeof complete?.text === "string" && complete.text.trim().length > 0,
  };
  const errors = [...opts.errors, ...eventErrors];
  if (!uniqueSources.length && !errors.length) opts.warnings.push("MedBrevia search completed without normalized sources.");
  const searchId = `medbrevia_lit_${hash({ question: opts.request.question, sources: uniqueSources.map(source => source.id), errors }).slice(0, 16)}`;
  return {
    schemaVersion: 1,
    generatedAtIso: new Date().toISOString(),
    searchId,
    provider: "medbrevia-search",
    status: errors.length ? "failed" : "succeeded",
    request: opts.request,
    evidenceSummary,
    plannedSearches: arrayOfRecords(plan?.plannedSearches).map(item => String(item.query ?? item.q ?? item.text ?? "")).filter(Boolean),
    qHash: typeof plan?.q_hash === "string" ? plan.q_hash : null,
    briefingText: typeof complete?.text === "string" ? complete.text : null,
    sources: uniqueSources,
    events,
    warnings: opts.warnings,
    errors,
    timings: isRecord(complete?.timings) ? complete.timings : null,
    retrievalDebug: isRecord(complete?.retrieval_debug) ? complete.retrieval_debug : null,
    outPath: null,
    reportPath: null,
  };
}

async function parseSseResponse(response: Response): Promise<SseEvent[]> {
  const text = await response.text();
  return parseSseText(text);
}

export function parseSseText(text: string): SseEvent[] {
  const blocks = text.split(/\r?\n\r?\n/);
  const events: SseEvent[] = [];
  for (const block of blocks) {
    const lines = block.split(/\r?\n/);
    let event = "message";
    const dataLines: string[] = [];
    for (const line of lines) {
      if (line.startsWith("event:")) event = line.slice(6).trim() || "message";
      if (line.startsWith("data:")) dataLines.push(line.slice(5).trimStart());
    }
    if (!dataLines.length) continue;
    const rawData = dataLines.join("\n");
    let data: unknown = rawData;
    try {
      data = JSON.parse(rawData);
    } catch {
      data = rawData;
    }
    events.push({ event, data });
  }
  return events;
}

function buildMedBreviaAuthHeaders(opts: {
  apiKey?: string;
  bearerToken?: string;
  cookie?: string;
  authSecret?: string;
  userId?: string;
  userEmail?: string;
}): { mode: MedBreviaSearchAuthMode; headers: Record<string, string> } {
  const bearerToken = opts.bearerToken ?? process.env.MEDBREVIA_SEARCH_BEARER_TOKEN;
  if (bearerToken) return { mode: "bearer", headers: { Authorization: `Bearer ${bearerToken}` } };
  const cookie = opts.cookie ?? process.env.MEDBREVIA_SEARCH_COOKIE;
  if (cookie) return { mode: "cookie", headers: { Cookie: cookie } };
  const authSecret = opts.authSecret ?? process.env.MEDBREVIA_SEARCH_AUTH_SECRET ?? process.env.NEXTAUTH_SECRET ?? process.env.AUTH_SECRET;
  if (authSecret) {
    return {
      mode: "mobile-jwt",
      headers: {
        Authorization: `Bearer ${signMobileJwt({
          secret: authSecret,
          userId: opts.userId ?? process.env.MEDBREVIA_SEARCH_USER_ID ?? "agenteer-local-research-agent",
          email: opts.userEmail ?? process.env.MEDBREVIA_SEARCH_USER_EMAIL ?? "agenteer-local@medbrevia.dev",
        })}`,
      },
    };
  }
  const apiKey = opts.apiKey ?? process.env.MEDBREVIA_SEARCH_API_KEY ?? DEFAULT_MEDBREVIA_AGENT_API_KEY;
  return {
    mode: apiKey ? "api-key" : "none",
    headers: apiKey ? { "x-agenteer-api-key": apiKey, "x-medbrevia-agent-key": apiKey } : {},
  };
}

function signMobileJwt(opts: { secret: string; userId: string; email: string }): string {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "HS256", typ: "JWT" };
  const payload = {
    iss: "medbrevia",
    aud: "medbrevia-mobile",
    sub: opts.userId,
    email: opts.email,
    name: "Agenteer Research Agent",
    token_type: "mobile",
    emailVerified: true,
    providers: ["agenteer-local"],
    isAdmin: true,
    disabled: false,
    authVersion: 1,
    iat: now,
    exp: now + 60 * 60,
  };
  const encoded = `${base64urlJson(header)}.${base64urlJson(payload)}`;
  const signature = createHmac("sha256", opts.secret).update(encoded).digest("base64url");
  return `${encoded}.${signature}`;
}

function normalizeJsonSearchResponse(json: unknown): SseEvent[] {
  if (!isRecord(json)) return [];
  const data = isRecord(json.data) ? json.data : json;
  const events = Array.isArray(data.events) ? data.events.map(normalizeSseEvent).filter(Boolean) as SseEvent[] : [];
  if (events.length) return events;
  const generated: SseEvent[] = [];
  if (data.plan) generated.push({ event: "plan", data: data.plan });
  if (data.results) generated.push({ event: "results", data: data.results });
  if (data.briefing_complete) generated.push({ event: "briefing_complete", data: data.briefing_complete });
  return generated;
}

function normalizeSseEvent(value: unknown): SseEvent | null {
  if (!isRecord(value)) return null;
  const event = typeof value.event === "string" ? value.event : typeof value.type === "string" ? value.type : "message";
  const data = "data" in value ? value.data : value;
  return { event, data };
}

function normalizeArticleSources(results: unknown): LiteratureSource[] {
  const articles = arrayOfRecords((results as Record<string, unknown> | null)?.articles);
  return articles.map(article => {
    const id = String(article.id ?? article.pmid ?? "");
    return sourceFromRecord("pubmed", id, article, {
      title: stringValue(article.title),
      journal: stringValue(article.journal),
      publicationDate: stringValue(article.pub_date ?? article.date),
      url: stringValue(article.source_url ?? article.url) ?? (id ? `https://pubmed.ncbi.nlm.nih.gov/${id}/` : null),
      abstract: stringValue(article.abstract),
      snippet: stringValue(article.summary ?? article.snippet),
      evidenceType: arrayOfStrings(article.pub_types),
      retrievalScore: finiteNumber(article.retrieval_rrf ?? article.retrieval_score ?? article.score),
    });
  }).filter(source => source.id);
}

function normalizeTrialSources(payload: unknown): LiteratureSource[] {
  return arrayOfRecords((payload as Record<string, unknown> | null)?.trials).map(trial => {
    const id = String(trial.nct_id ?? trial.nctId ?? trial.id ?? "");
    return sourceFromRecord("trial", id, trial, {
      title: stringValue(trial.title ?? trial.brief_title),
      journal: "ClinicalTrials.gov",
      publicationDate: stringValue(trial.last_update_submitted_date ?? trial.start_date ?? trial.completion_date),
      url: stringValue(trial.url) ?? (id ? `https://clinicaltrials.gov/study/${id}` : null),
      abstract: stringValue(trial.summary ?? trial.brief_summary),
      snippet: stringValue(trial.condition ?? trial.status),
      evidenceType: ["clinical trial registry"],
      retrievalScore: finiteNumber(trial.score),
    });
  }).filter(source => source.id);
}

function normalizeGuidelineSources(payload: unknown): LiteratureSource[] {
  return arrayOfRecords((payload as Record<string, unknown> | null)?.guidelines).map((guideline, index) => {
    const id = String(guideline.id ?? guideline.chunk_id ?? guideline.source_id ?? `guideline-${index + 1}`);
    return sourceFromRecord("guideline", id, guideline, {
      title: stringValue(guideline.title ?? guideline.source_title),
      journal: stringValue(guideline.organization ?? guideline.publisher) ?? "guideline",
      publicationDate: stringValue(guideline.date ?? guideline.publication_date),
      url: stringValue(guideline.url ?? guideline.source_url),
      abstract: stringValue(guideline.text ?? guideline.chunk ?? guideline.summary),
      snippet: stringValue(guideline.snippet ?? guideline.text),
      evidenceType: ["guideline"],
      retrievalScore: finiteNumber(guideline.score),
    });
  }).filter(source => source.id);
}

function normalizeDailyMedSources(payload: unknown): LiteratureSource[] {
  return arrayOfRecords((payload as Record<string, unknown> | null)?.labels).map((label, index) => {
    const id = String(label.set_id ?? label.spl_set_id ?? label.id ?? `dailymed-${index + 1}`);
    return sourceFromRecord("dailymed", id, label, {
      title: stringValue(label.title ?? label.drug_name),
      journal: "DailyMed",
      publicationDate: stringValue(label.effective_time ?? label.updated_at),
      url: stringValue(label.url ?? label.source_url),
      abstract: stringValue(label.indications_and_usage ?? label.text),
      snippet: stringValue(label.warning ?? label.snippet),
      evidenceType: ["drug label"],
      retrievalScore: finiteNumber(label.score),
    });
  }).filter(source => source.id);
}

function normalizeChemblSources(payload: unknown): LiteratureSource[] {
  return arrayOfRecords((payload as Record<string, unknown> | null)?.cards).map((card, index) => {
    const id = String(card.molecule_chembl_id ?? card.target_chembl_id ?? card.id ?? `chembl-${index + 1}`);
    return sourceFromRecord("chembl", id, card, {
      title: stringValue(card.pref_name ?? card.title ?? card.name),
      journal: "ChEMBL",
      publicationDate: null,
      url: stringValue(card.url ?? card.source_url),
      abstract: stringValue(card.description ?? card.summary),
      snippet: stringValue(card.snippet ?? card.activity_summary),
      evidenceType: ["bioactivity evidence"],
      retrievalScore: finiteNumber(card.score),
    });
  }).filter(source => source.id);
}

function sourceFromRecord(sourceType: LiteratureSourceType, id: string, raw: Record<string, unknown>, fields: {
  title: string | null;
  journal: string | null;
  publicationDate: string | null;
  url: string | null;
  abstract: string | null;
  snippet: string | null;
  evidenceType: string[];
  retrievalScore: number | null;
}): LiteratureSource {
  const year = publicationYear(fields.publicationDate ?? raw.pub_year ?? raw.year);
  const evidenceType = fields.evidenceType.length ? fields.evidenceType : arrayOfStrings(raw.pub_types);
  const qualityScore = scoreLiteratureSource({ sourceType, evidenceType, journalTier: raw.journal_tier, year, abstract: fields.abstract ?? fields.snippet });
  return {
    id,
    sourceType,
    title: fields.title ?? "(untitled source)",
    journal: fields.journal,
    publicationDate: fields.publicationDate,
    publicationYear: year,
    url: fields.url,
    abstract: fields.abstract,
    snippet: fields.snippet,
    evidenceType,
    retrievalScore: fields.retrievalScore,
    qualityScore,
    citationLabel: sourceType === "pubmed" ? `PMID:${id}` : `${sourceType}:${id}`,
    raw,
  };
}

function scoreLiteratureSource(opts: { sourceType: LiteratureSourceType; evidenceType: string[]; journalTier: unknown; year: number | null; abstract: string | null }): number {
  const lowerTypes = opts.evidenceType.map(type => type.toLowerCase());
  const typeScore = opts.sourceType === "guideline" ? 1
    : lowerTypes.some(type => type.includes("systematic review")) ? 0.95
      : lowerTypes.some(type => type.includes("meta-analysis")) ? 0.9
        : lowerTypes.some(type => type.includes("randomized") || type.includes("clinical trial")) ? 0.82
          : lowerTypes.some(type => type.includes("review")) ? 0.46
            : opts.sourceType === "trial" ? 0.56
              : opts.sourceType === "dailymed" ? 0.6
                : opts.sourceType === "chembl" ? 0.42
                  : 0.3;
  const tier = finiteNumber(opts.journalTier);
  const tierScore = tier == null ? 0.35 : tier <= 1 ? 1 : tier <= 2 ? 0.78 : tier <= 3 ? 0.58 : tier <= 5 ? 0.35 : 0.18;
  const currentYear = new Date().getUTCFullYear();
  const recency = opts.year == null ? 0.35 : currentYear - opts.year <= 2 ? 1 : currentYear - opts.year <= 5 ? 0.82 : currentYear - opts.year <= 10 ? 0.58 : 0.32;
  const abstractScore = (opts.abstract ?? "").length >= 500 ? 1 : (opts.abstract ?? "").length >= 150 ? 0.7 : 0.25;
  return Number((0.46 * typeScore + 0.2 * tierScore + 0.22 * recency + 0.12 * abstractScore).toFixed(4));
}

function dedupeSources(sources: LiteratureSource[]): LiteratureSource[] {
  const byKey = new Map<string, LiteratureSource>();
  for (const source of sources) {
    const key = `${source.sourceType}:${source.id}`;
    const previous = byKey.get(key);
    if (!previous || source.qualityScore > previous.qualityScore) byKey.set(key, source);
  }
  return Array.from(byKey.values()).sort((a, b) =>
    (b.qualityScore - a.qualityScore) ||
    ((b.retrievalScore ?? -Infinity) - (a.retrievalScore ?? -Infinity)) ||
    a.title.localeCompare(b.title));
}

function unwrapLiteratureSearch(raw: Record<string, unknown>): ResearchLiteratureSearchResult {
  return (raw.literatureSearch && typeof raw.literatureSearch === "object"
    ? raw.literatureSearch
    : raw) as ResearchLiteratureSearchResult;
}

function findCitedSourceIds(paper: string, sources: LiteratureSource[]): string[] {
  if (!paper) return [];
  const lower = paper.toLowerCase();
  return sources
    .filter(source => lower.includes(source.id.toLowerCase()) || lower.includes(source.citationLabel.toLowerCase()))
    .map(source => source.id);
}

function hasConservativeBoundary(text: string): boolean {
  return /not (as )?(proof|causal|clinical recommendation|deployment|screening recommendation)|does not establish|cannot establish|unmeasured confounding|external validation/i.test(text);
}

function tokenCoverage(target: string, evidence: string): number {
  const targetTokens = Array.from(new Set(tokenize(target)));
  if (!targetTokens.length) return 0;
  const evidenceTokens = new Set(tokenize(evidence));
  return targetTokens.filter(token => evidenceTokens.has(token)).length / targetTokens.length;
}

function tokenize(text: string): string[] {
  const stop = new Set(["the", "and", "or", "of", "in", "to", "with", "for", "a", "an", "is", "are", "does", "do", "how", "what", "among", "after", "before", "using", "use", "relate", "related", "association", "effect"]);
  return text.toLowerCase().match(/[a-z][a-z0-9-]{2,}/g)?.filter(token => !stop.has(token)) ?? [];
}

function qaCheck(id: string, status: LiteratureQaStatus, message: string, evidenceRefs: string[], recommendedAction: string): ResearchLiteratureQaCheck {
  return {
    id,
    status,
    severity: status === "fail" ? "blocker" : status === "warning" ? "major" : "info",
    message,
    evidenceRefs,
    recommendedAction,
  };
}

function lastEventData(events: SseEvent[], eventName: string): Record<string, unknown> | null {
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = events[index];
    if (event?.event === eventName && isRecord(event.data)) return event.data;
  }
  return null;
}

function arrayOfRecords(value: unknown): Array<Record<string, unknown>> {
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

function arrayOfStrings(value: unknown): string[] {
  if (!Array.isArray(value)) {
    if (typeof value === "string") return value.split(/[;,|]/).map(item => item.trim()).filter(Boolean);
    return [];
  }
  return value.map(item => String(item)).filter(Boolean);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : value == null ? null : String(value);
}

function finiteNumber(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function publicationYear(value: unknown): number | null {
  const numeric = finiteNumber(value);
  if (numeric && numeric >= 1900 && numeric <= 2100) return Math.floor(numeric);
  const match = String(value ?? "").match(/(19\d{2}|20\d{2})/);
  return match ? Number(match[1]) : null;
}

function maxNullable(values: Array<number | null>): number | null {
  const numeric = values.filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  return numeric.length ? Math.max(...numeric) : null;
}

function normalizeBaseUrl(value: string): string {
  return value.endsWith("/") ? value : `${value}/`;
}

function hash(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function base64urlJson(value: unknown): string {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

function formatPercent(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

async function safeResponseText(response: Response): Promise<string> {
  return (await response.text().catch(() => "")).slice(0, 500);
}
