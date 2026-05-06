import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { access, mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export type DatasetSourceKind = "local-file" | "local-directory" | "gcs-prefix" | "manifest";
export type DatasetTableFormat = "csv" | "json" | "parquet" | "duckdb" | "unknown";
export type DatasetDomain = "public-health-survey" | "ehr" | "registry" | "claims" | "user-upload" | "synthetic" | "unknown";

export interface DatasetIssue {
  severity: "blocker" | "warning" | "note";
  code: string;
  message: string;
  evidenceRefs: string[];
}

export interface DatasetTableProfile {
  tableId: string;
  sourcePath: string;
  format: DatasetTableFormat;
  bytes: number;
  rowCount: number | null;
  columnCount: number | null;
  sha256: string | null;
  columns: DatasetVariableProfile[];
  profileStatus: "profiled" | "metadata_only" | "failed";
  profileWarnings: DatasetIssue[];
}

export interface DatasetVariableProfile {
  tableId: string;
  name: string;
  label: string;
  role: "id" | "outcome_candidate" | "exposure_candidate" | "covariate_candidate" | "survey_weight" | "survey_design" | "time" | "text" | "metadata" | "low_information" | "feature";
  inferredType: "number" | "string" | "boolean" | "date" | "empty" | "mixed" | "unknown";
  nonMissingRows: number | null;
  missingFraction: number | null;
  distinctCount: number | null;
  min?: number;
  max?: number;
  mean?: number;
  sampleValues: string[];
  semanticTags: string[];
  watchouts: DatasetIssue[];
}

export interface DatasetManifest {
  schemaVersion: 1;
  datasetId: string;
  title: string;
  description: string;
  domain: DatasetDomain;
  generatedAtIso: string;
  source: {
    kind: DatasetSourceKind;
    uri: string;
    manifestPath: string | null;
  };
  storage: {
    totalBytes: number;
    tableCount: number;
    profiledTableCount: number;
    rowCountTotalKnown: number | null;
    supportedFormats: DatasetTableFormat[];
  };
  access: {
    local: boolean;
    cloud: boolean;
    piiPhiRisk: "unknown" | "low" | "moderate" | "high";
    license: string | null;
    restrictions: string[];
  };
  standardLayout: Record<"root" | "manifest" | "variableRegistry" | "relationshipGraph" | "profile" | "watchouts" | "questions" | "summary" | "context", string>;
  tables: Array<{
    tableId: string;
    sourcePath: string;
    format: DatasetTableFormat;
    bytes: number;
    rowCount: number | null;
    columnCount: number | null;
    profileStatus: DatasetTableProfile["profileStatus"];
  }>;
  hash: string;
}

export interface DatasetVariableRegistry {
  schemaVersion: 1;
  datasetId: string;
  generatedAtIso: string;
  variables: DatasetVariableProfile[];
  byRole: Record<string, string[]>;
  semanticIndex: Record<string, string[]>;
  watchouts: DatasetIssue[];
}

export interface DatasetRelationshipGraph {
  schemaVersion: 1;
  datasetId: string;
  generatedAtIso: string;
  nodes: Array<{ tableId: string; rowCount: number | null; columnCount: number | null; sourcePath: string }>;
  edges: Array<{
    leftTable: string;
    rightTable: string;
    keys: string[];
    confidence: number;
    cardinality: "unknown" | "one-to-one" | "one-to-many" | "many-to-many";
    rationale: string;
  }>;
  entityHints: Array<{ entity: string; keys: string[]; tables: string[]; rationale: string }>;
  warnings: DatasetIssue[];
}

export interface DatasetProfileBundle {
  schemaVersion: 1;
  datasetId: string;
  generatedAtIso: string;
  tableProfiles: DatasetTableProfile[];
  aggregate: {
    tableCount: number;
    profiledTableCount: number;
    rowCountTotalKnown: number | null;
    columnCountTotalKnown: number | null;
    totalBytes: number;
    highMissingVariableCount: number;
    emptyVariableCount: number;
    likelyIdentifierCount: number;
    semanticWatchoutCount: number;
  };
  watchouts: DatasetIssue[];
}

export interface DatasetQuestionSeed {
  id: string;
  question: string;
  outcome: string;
  exposure: string;
  rationale: string;
  suggestedDesign: "descriptive" | "cross-sectional association" | "prediction" | "longitudinal/temporal" | "data-quality review";
  requiredChecks: string[];
  priority: "high" | "medium" | "low";
}

export interface DatasetQuestionBank {
  schemaVersion: 1;
  datasetId: string;
  generatedAtIso: string;
  seeds: DatasetQuestionSeed[];
  blockedIdeas: Array<{ idea: string; reason: string }>;
}

export interface DatasetRegistrationResult {
  schemaVersion: 1;
  datasetId: string;
  rootDir: string;
  manifest: DatasetManifest;
  profile: DatasetProfileBundle;
  variableRegistry: DatasetVariableRegistry;
  relationshipGraph: DatasetRelationshipGraph;
  questions: DatasetQuestionBank;
  summaryPath: string;
  contextPath: string;
  generatedFiles: string[];
  nextAction: string;
}

export interface DatasetRegisterOptions {
  datasetId: string;
  source?: string;
  fromManifest?: string;
  outDir: string;
  title?: string;
  description?: string;
  domain?: DatasetDomain;
  license?: string;
  maxTables?: number;
  maxRows?: number;
  python?: string;
}

export interface DatasetLoadOptions {
  datasetDir: string;
}

function nowIso(): string {
  return new Date().toISOString();
}

function issue(severity: DatasetIssue["severity"], code: string, message: string, evidenceRefs: string[] = []): DatasetIssue {
  return { severity, code, message, evidenceRefs };
}

function stableHash(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(sortJson(value))).digest("hex");
}

function sortJson(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortJson);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, sortJson(item)]));
  }
  return value;
}

async function pathExists(file: string): Promise<boolean> {
  try {
    await access(file);
    return true;
  } catch {
    return false;
  }
}

function slugify(value: string): string {
  const slug = value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return slug || `dataset-${createHash("sha1").update(value).digest("hex").slice(0, 8)}`;
}

function formatForPath(file: string): DatasetTableFormat {
  const ext = path.extname(file).toLowerCase();
  if (ext === ".csv") return "csv";
  if (ext === ".json" || ext === ".jsonl") return "json";
  if (ext === ".parquet") return "parquet";
  if (ext === ".duckdb" || ext === ".db") return "duckdb";
  return "unknown";
}

function isSupportedTablePath(file: string): boolean {
  return ["csv", "json", "parquet", "duckdb"].includes(formatForPath(file));
}

async function hashFile(file: string): Promise<string> {
  return createHash("sha256").update(await readFile(file)).digest("hex");
}

function sourceKind(source: string | undefined, fromManifest: string | undefined): DatasetSourceKind {
  if (fromManifest) return "manifest";
  if (!source) return "manifest";
  if (source.startsWith("gs://")) return "gcs-prefix";
  return "local-file";
}

async function discoverLocalTables(source: string, maxTables: number): Promise<DatasetTableProfile[]> {
  const resolved = path.resolve(source);
  const info = await stat(resolved);
  const files: string[] = [];
  if (info.isFile()) {
    if (!isSupportedTablePath(resolved)) throw new Error(`Unsupported dataset file format: ${resolved}`);
    files.push(resolved);
  } else if (info.isDirectory()) {
    await walkSupportedTables(resolved, files, maxTables);
  } else {
    throw new Error(`Dataset source is neither file nor directory: ${resolved}`);
  }
  return Promise.all(files.slice(0, maxTables).map(async file => {
    const fileStat = await stat(file);
    return {
      tableId: inferTableId(file, resolved),
      sourcePath: file,
      format: formatForPath(file),
      bytes: fileStat.size,
      rowCount: null,
      columnCount: null,
      sha256: fileStat.size <= 256 * 1024 * 1024 ? await hashFile(file) : null,
      columns: [],
      profileStatus: "metadata_only",
      profileWarnings: fileStat.size > 256 * 1024 * 1024 ? [issue("note", "HASH_SKIPPED_LARGE_FILE", "File hash skipped because the file is larger than 256 MiB.", [file])] : [],
    };
  }));
}

async function walkSupportedTables(dir: string, out: string[], maxTables: number, depth = 0): Promise<void> {
  if (depth > 6 || out.length >= maxTables) return;
  const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    if (out.length >= maxTables) return;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      await walkSupportedTables(full, out, maxTables, depth + 1);
    } else if (entry.isFile() && isSupportedTablePath(full)) {
      out.push(full);
    }
  }
}

function inferTableId(file: string, root: string): string {
  const relative = file.startsWith(root) ? path.relative(root, file) : path.basename(file);
  const withoutExt = relative.replace(/\.[^.]+$/, "");
  return slugify(withoutExt.replaceAll(path.sep, "."));
}

async function profilesFromExportManifest(manifestPath: string): Promise<{ sourceUri: string; tables: DatasetTableProfile[]; description: string; title: string }> {
  const resolved = path.resolve(manifestPath);
  const raw = JSON.parse(await readFile(resolved, "utf-8")) as Record<string, unknown>;
  const sourceManifestPath = typeof raw.sourceManifest === "string" ? raw.sourceManifest : null;
  const sourceManifest = sourceManifestPath && await pathExists(sourceManifestPath)
    ? JSON.parse(await readFile(sourceManifestPath, "utf-8")) as Record<string, unknown>
    : null;
  const tablesRaw = Array.isArray(raw.tables) ? raw.tables as Array<Record<string, unknown>> : [];
  const destination = raw.destination && typeof raw.destination === "object"
    ? raw.destination as Record<string, unknown>
    : sourceManifest?.destination && typeof sourceManifest.destination === "object"
      ? sourceManifest.destination as Record<string, unknown>
      : {};
  const source = raw.source && typeof raw.source === "object"
    ? raw.source as Record<string, unknown>
    : sourceManifest?.source && typeof sourceManifest.source === "object"
      ? sourceManifest.source as Record<string, unknown>
      : {};
  const sourceUri = typeof destination.rootUri === "string" ? destination.rootUri : resolved;
  const tables = tablesRaw.map(item => {
    const dataset = String(item.dataset ?? "dataset");
    const table = String(item.table ?? item.tableId ?? "table");
    const tableId = slugify(`${dataset}.${table}`);
    const sourcePath = String(item.destinationPrefix ?? item.source ?? `${sourceUri}${dataset}/${table}/`);
    const rowCount = numberOrNull(item.bigqueryRows ?? item.rowCount);
    const columnCount = numberOrNull(item.bigquerySchemaFields ?? item.columnCount);
    const bytes = numberOrNull(item.gcsExportedBytes ?? item.bytes) ?? 0;
    const rawColumns = Array.isArray(item.columns) ? item.columns as Array<Record<string, unknown>> : [];
    const columns = rawColumns.map(column => decorateVariable({
      tableId,
      name: String(column.name ?? "unknown"),
      label: typeof column.description === "string" && column.description.trim() ? column.description.trim() : labelize(String(column.name ?? "unknown")),
      role: "feature",
      inferredType: bigQueryTypeToInferredType(String(column.type ?? "unknown")),
      nonMissingRows: null,
      missingFraction: null,
      distinctCount: null,
      sampleValues: [],
      semanticTags: [String(column.type ?? "unknown").toLowerCase()].filter(Boolean),
      watchouts: [],
    }));
    return {
      tableId,
      sourcePath,
      format: "parquet" as const,
      bytes,
      rowCount,
      columnCount: columnCount ?? columns.length,
      sha256: null,
      columns,
      profileStatus: columns.length ? "profiled" as const : "metadata_only" as const,
      profileWarnings: columns.length
        ? [issue("note", "SCHEMA_METADATA_ONLY", "Column names and types came from metadata; missingness/distribution profiling requires local files or samples.", [sourcePath])]
        : [issue("note", "MANIFEST_METADATA_ONLY", "Table came from an export manifest; column-level profiling requires local files or sampled metadata.", [sourcePath])],
    };
  });
  return {
    sourceUri,
    tables,
    title: String("mimicVersion" in source ? `MIMIC-IV ${String(source.mimicVersion)}` : "Manifest dataset"),
    description: `Dataset registered from export manifest ${resolved}.`,
  };
}

function bigQueryTypeToInferredType(type: string): DatasetVariableProfile["inferredType"] {
  const upper = type.toUpperCase();
  if (["INTEGER", "INT64", "FLOAT", "FLOAT64", "NUMERIC", "BIGNUMERIC"].includes(upper)) return "number";
  if (["BOOLEAN", "BOOL"].includes(upper)) return "boolean";
  if (["DATE", "DATETIME", "TIME", "TIMESTAMP"].includes(upper)) return "date";
  if (["STRING", "BYTES"].includes(upper)) return "string";
  return "unknown";
}

function numberOrNull(value: unknown): number | null {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

async function profileLocalTable(table: DatasetTableProfile, opts: { python?: string; maxRows: number }): Promise<DatasetTableProfile> {
  if (table.format === "duckdb") {
    return { ...table, profileStatus: "metadata_only", profileWarnings: [...table.profileWarnings, issue("warning", "DUCKDB_TABLE_PROFILING_NOT_INLINE", "DuckDB database files are registered as sources; profile concrete tables through exported views or Parquet files.", [table.sourcePath])] };
  }
  if (table.format === "csv" || table.format === "json") {
    try {
      const rows = table.format === "csv"
        ? parseCsvRows(await readFile(table.sourcePath, "utf-8")).slice(0, opts.maxRows)
        : normalizeJsonRows(JSON.parse(await readFile(table.sourcePath, "utf-8"))).slice(0, opts.maxRows);
      return profileRows(table, rows);
    } catch (error) {
      return { ...table, profileStatus: "failed", profileWarnings: [...table.profileWarnings, issue("warning", "LOCAL_PROFILE_FAILED", error instanceof Error ? error.message : String(error), [table.sourcePath])] };
    }
  }
  if (table.format === "parquet") {
    return profileParquetTable(table, opts);
  }
  return { ...table, profileStatus: "metadata_only", profileWarnings: [...table.profileWarnings, issue("warning", "UNKNOWN_FORMAT_PROFILE_SKIPPED", "Unknown table format; metadata-only registration.", [table.sourcePath])] };
}

function normalizeJsonRows(value: unknown): Array<Record<string, unknown>> {
  if (Array.isArray(value)) return value.filter(item => item && typeof item === "object").map(item => item as Record<string, unknown>);
  if (value && typeof value === "object") {
    const object = value as Record<string, unknown>;
    for (const key of ["rows", "data", "records"]) {
      if (Array.isArray(object[key])) return normalizeJsonRows(object[key]);
    }
  }
  throw new Error("JSON table must be an array of objects or contain rows/data/records.");
}

function parseCsvRows(text: string): Array<Record<string, unknown>> {
  const [headerLine, ...lines] = text.trim().split(/\r?\n/);
  if (!headerLine) return [];
  const headers = splitCsvLine(headerLine);
  return lines.filter(Boolean).map(line => {
    const cells = splitCsvLine(line);
    return Object.fromEntries(headers.map((header, index) => [header, coerceScalar(cells[index] ?? "")]));
  });
}

function splitCsvLine(line: string): string[] {
  const cells: string[] = [];
  let current = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === "\"" && line[index + 1] === "\"") {
      current += "\"";
      index += 1;
    } else if (char === "\"") {
      quoted = !quoted;
    } else if (char === "," && !quoted) {
      cells.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  cells.push(current);
  return cells.map(cell => cell.trim());
}

function coerceScalar(value: string): unknown {
  if (value === "" || value.toUpperCase() === "NA" || value.toUpperCase() === "NULL") return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : value;
}

async function profileParquetTable(table: DatasetTableProfile, opts: { python?: string; maxRows: number }): Promise<DatasetTableProfile> {
  const python = opts.python ?? process.env.AGENTEER_RESEARCH_PYTHON ?? process.env.PYTHON ?? path.resolve(".research-runtime/python/bin/python");
  const script = `
import json, sys
try:
    import pandas as pd
except Exception as exc:
    print(json.dumps({"error": "PANDAS_UNAVAILABLE", "message": str(exc)}))
    sys.exit(2)
path = sys.argv[1]
max_rows = int(sys.argv[2])
df = pd.read_parquet(path)
total_rows = int(len(df))
sample = df.head(max_rows)
def clean(v):
    if pd.isna(v):
        return None
    if hasattr(v, "item"):
        try:
            return v.item()
        except Exception:
            pass
    return str(v) if not isinstance(v, (str, int, float, bool)) else v
cols = []
for name in df.columns:
    s = sample[name]
    non = s.dropna()
    inferred = "unknown"
    if len(non) == 0:
        inferred = "empty"
    elif pd.api.types.is_bool_dtype(s):
        inferred = "boolean"
    elif pd.api.types.is_datetime64_any_dtype(s):
        inferred = "date"
    elif pd.api.types.is_numeric_dtype(s):
        inferred = "number"
    elif pd.api.types.is_string_dtype(s) or pd.api.types.is_object_dtype(s):
        inferred = "string"
    item = {
        "name": str(name),
        "inferredType": inferred,
        "nonMissingRows": int(len(non)),
        "missingFraction": float((len(sample) - len(non)) / len(sample)) if len(sample) else 1.0,
        "distinctCount": int(non.nunique(dropna=True)) if len(non) else 0,
        "sampleValues": [str(clean(v)) for v in non.head(5).tolist()],
    }
    if inferred == "number" and len(non):
        num = pd.to_numeric(non, errors="coerce").dropna()
        if len(num):
            item["min"] = float(num.min())
            item["max"] = float(num.max())
            item["mean"] = float(num.mean())
    cols.append(item)
print(json.dumps({"rowCount": total_rows, "sampledRows": int(len(sample)), "columnCount": int(len(df.columns)), "columns": cols}))
`;
  try {
    const { stdout } = await execFileAsync(python, ["-c", script, table.sourcePath, String(opts.maxRows)], { maxBuffer: 1024 * 1024 * 24 });
    const parsed = JSON.parse(stdout) as { rowCount?: number; columnCount?: number; columns?: Array<Record<string, unknown>>; error?: string; message?: string };
    if (parsed.error) throw new Error(`${parsed.error}: ${parsed.message ?? ""}`);
    const rowCount = numberOrNull(parsed.rowCount) ?? table.rowCount;
    const columns = Array.isArray(parsed.columns) ? parsed.columns.map(col => variableProfileFromRaw(table.tableId, col, rowCount)) : [];
    return { ...table, rowCount, columnCount: numberOrNull(parsed.columnCount) ?? columns.length, columns, profileStatus: "profiled" };
  } catch (error) {
    return { ...table, profileStatus: "failed", profileWarnings: [...table.profileWarnings, issue("warning", "PARQUET_PROFILE_FAILED", error instanceof Error ? error.message : String(error), [table.sourcePath])] };
  }
}

function profileRows(table: DatasetTableProfile, rows: Array<Record<string, unknown>>): DatasetTableProfile {
  const names = Array.from(new Set(rows.flatMap(row => Object.keys(row)))).sort((a, b) => a.localeCompare(b));
  const columns = names.map(name => summarizeValues(table.tableId, name, rows.map(row => row[name]), rows.length));
  return { ...table, rowCount: rows.length, columnCount: columns.length, columns, profileStatus: "profiled" };
}

function summarizeValues(tableId: string, name: string, rawValues: unknown[], rowCount: number): DatasetVariableProfile {
  const values = rawValues.filter(value => value !== null && value !== undefined && value !== "");
  const numeric = values.map(value => Number(value)).filter(value => Number.isFinite(value));
  const distinct = new Set(values.map(value => String(value)));
  const lower = name.toLowerCase();
  const inferredType: DatasetVariableProfile["inferredType"] = values.length === 0 ? "empty"
    : numeric.length === values.length ? "number"
      : values.every(value => typeof value === "boolean") ? "boolean"
        : /date|time|dt$|_dt|charttime|admittime|dischtime/i.test(lower) ? "date"
          : values.every(value => ["string", "boolean", "number"].includes(typeof value)) ? "string"
            : "mixed";
  return decorateVariable({
    tableId,
    name,
    label: labelize(name),
    role: "feature",
    inferredType,
    nonMissingRows: values.length,
    missingFraction: rowCount ? (rowCount - values.length) / rowCount : 1,
    distinctCount: distinct.size,
    sampleValues: Array.from(distinct).slice(0, 5),
    ...(numeric.length ? { min: Math.min(...numeric), max: Math.max(...numeric), mean: numeric.reduce((sum, value) => sum + value, 0) / numeric.length } : {}),
    semanticTags: [],
    watchouts: [],
  });
}

function variableProfileFromRaw(tableId: string, raw: Record<string, unknown>, rowCount: number | null): DatasetVariableProfile {
  return decorateVariable({
    tableId,
    name: String(raw.name ?? "unknown"),
    label: labelize(String(raw.name ?? "unknown")),
    role: "feature",
    inferredType: parseInferredType(raw.inferredType),
    nonMissingRows: numberOrNull(raw.nonMissingRows),
    missingFraction: numberOrNull(raw.missingFraction),
    distinctCount: numberOrNull(raw.distinctCount),
    sampleValues: Array.isArray(raw.sampleValues) ? raw.sampleValues.map(String).slice(0, 5) : [],
    ...(typeof raw.min === "number" ? { min: raw.min } : {}),
    ...(typeof raw.max === "number" ? { max: raw.max } : {}),
    ...(typeof raw.mean === "number" ? { mean: raw.mean } : {}),
    semanticTags: rowCount === 0 ? ["empty-table"] : [],
    watchouts: [],
  });
}

function parseInferredType(value: unknown): DatasetVariableProfile["inferredType"] {
  return value === "number" || value === "string" || value === "boolean" || value === "date" || value === "empty" || value === "mixed" || value === "unknown" ? value : "unknown";
}

function decorateVariable(variable: DatasetVariableProfile): DatasetVariableProfile {
  const lower = `${variable.name} ${variable.label}`.toLowerCase();
  const tags = new Set(variable.semanticTags);
  const watchouts = [...variable.watchouts];
  let role = variable.role;
  if (/^(id|rowid|index)$|(^|_)(id|uuid)$|subject_id|hadm_id|stay_id|seqn|patient/i.test(lower)) {
    role = "id"; tags.add("identifier");
  } else if (/weight|wtmec|wtint|wt[_.-]|_llcpwt/i.test(lower)) {
    role = "survey_weight"; tags.add("weight");
  } else if (/strata|psu|sdmvstra|sdmvpsu|cluster/i.test(lower)) {
    role = "survey_design"; tags.add("survey-design");
  } else if (/date|time|year|month|day|admit|discharge|chart/i.test(lower)) {
    role = "time"; tags.add("time");
  } else if (/note|text|description|comment|diagnosis|label/i.test(lower) && variable.inferredType === "string") {
    role = "text"; tags.add("text");
  } else if (/outcome|event|death|mortality|case|diagnosis|hba1c|glucose|bp|score|result/i.test(lower)) {
    role = "outcome_candidate"; tags.add("outcome-candidate");
  } else if (/exposure|treat|risk|bmi|age|sex|race|income|poverty|smok|drug|med/i.test(lower)) {
    role = "exposure_candidate"; tags.add("exposure-candidate");
  } else if (/covariate|age|sex|race|ethnicity|insurance|income|site/i.test(lower)) {
    role = "covariate_candidate"; tags.add("covariate-candidate");
  }
  if (variable.inferredType === "empty") {
    role = "low_information";
    watchouts.push(issue("warning", "EMPTY_VARIABLE", `${variable.name} has no non-missing values in the profiled sample.`, [`${variable.tableId}.${variable.name}`]));
  }
  if (typeof variable.missingFraction === "number" && variable.missingFraction >= 0.5) {
    watchouts.push(issue(variable.missingFraction >= 0.8 ? "warning" : "note", "HIGH_MISSINGNESS", `${variable.name} is ${(variable.missingFraction * 100).toFixed(1)}% missing in the profiled rows.`, [`${variable.tableId}.${variable.name}`]));
  }
  if (variable.distinctCount === 1 && role !== "id") {
    watchouts.push(issue("note", "NEAR_CONSTANT_VARIABLE", `${variable.name} has only one observed value in the profiled rows.`, [`${variable.tableId}.${variable.name}`]));
  }
  if (variable.inferredType === "string" && typeof variable.distinctCount === "number" && typeof variable.nonMissingRows === "number" && variable.nonMissingRows > 0 && variable.distinctCount / variable.nonMissingRows > 0.8 && role !== "id" && role !== "text") {
    watchouts.push(issue("note", "HIGH_CARDINALITY_STRING", `${variable.name} is high-cardinality text/categorical data; avoid naive dummy expansion without review.`, [`${variable.tableId}.${variable.name}`]));
  }
  for (const semantic of semanticRangeWatchouts(variable)) watchouts.push(semantic);
  return { ...variable, role, semanticTags: Array.from(tags).sort(), watchouts };
}

function semanticRangeWatchouts(variable: DatasetVariableProfile): DatasetIssue[] {
  const lower = variable.name.toLowerCase();
  const out: DatasetIssue[] = [];
  if (variable.inferredType !== "number") return out;
  const min = variable.min;
  const max = variable.max;
  const ref = `${variable.tableId}.${variable.name}`;
  if (/age|ridageyr/.test(lower) && ((typeof min === "number" && min < 0) || (typeof max === "number" && max > 120))) {
    out.push(issue("warning", "SEMANTIC_AGE_RANGE", `${variable.name} has values outside a plausible human age range.`, [ref]));
  }
  if (/\bbmi\b|bmxbmi|body.?mass/.test(lower) && ((typeof min === "number" && min < 5) || (typeof max === "number" && max > 100))) {
    out.push(issue("warning", "SEMANTIC_BMI_RANGE", `${variable.name} has values outside a broad plausible BMI range.`, [ref]));
  }
  if (/(percent|pct|hba1c|gh)$/i.test(variable.name) && ((typeof min === "number" && min < 0) || (typeof max === "number" && max > 100))) {
    out.push(issue("note", "SEMANTIC_PERCENT_RANGE", `${variable.name} looks percentage-like but falls outside 0-100. Confirm units/coding.`, [ref]));
  }
  if (/weight|wtmec|wtint|_llcpwt/i.test(lower) && typeof min === "number" && min < 0) {
    out.push(issue("warning", "NEGATIVE_WEIGHT", `${variable.name} has negative values; survey/sample weights should generally be non-negative.`, [ref]));
  }
  if (/systolic|bpxsy|blood.?pressure/i.test(lower) && ((typeof min === "number" && min < 40) || (typeof max === "number" && max > 300))) {
    out.push(issue("warning", "SEMANTIC_BP_RANGE", `${variable.name} has values outside broad plausible systolic blood pressure range.`, [ref]));
  }
  return out;
}

function labelize(name: string): string {
  return name.replace(/[_-]+/g, " ").replace(/\b\w/g, c => c.toUpperCase());
}

function buildProfileBundle(datasetId: string, tableProfiles: DatasetTableProfile[]): DatasetProfileBundle {
  const variables = tableProfiles.flatMap(table => table.columns);
  const watchouts = [
    ...tableProfiles.flatMap(table => table.profileWarnings),
    ...variables.flatMap(variable => variable.watchouts),
  ];
  const rowCounts = tableProfiles.map(table => table.rowCount).filter((value): value is number => typeof value === "number");
  const columnCounts = tableProfiles.map(table => table.columnCount).filter((value): value is number => typeof value === "number");
  return {
    schemaVersion: 1,
    datasetId,
    generatedAtIso: nowIso(),
    tableProfiles,
    aggregate: {
      tableCount: tableProfiles.length,
      profiledTableCount: tableProfiles.filter(table => table.profileStatus === "profiled").length,
      rowCountTotalKnown: rowCounts.length === tableProfiles.length ? rowCounts.reduce((sum, value) => sum + value, 0) : rowCounts.length ? rowCounts.reduce((sum, value) => sum + value, 0) : null,
      columnCountTotalKnown: columnCounts.length ? columnCounts.reduce((sum, value) => sum + value, 0) : null,
      totalBytes: tableProfiles.reduce((sum, table) => sum + table.bytes, 0),
      highMissingVariableCount: variables.filter(variable => typeof variable.missingFraction === "number" && variable.missingFraction >= 0.5).length,
      emptyVariableCount: variables.filter(variable => variable.inferredType === "empty").length,
      likelyIdentifierCount: variables.filter(variable => variable.role === "id").length,
      semanticWatchoutCount: variables.reduce((sum, variable) => sum + variable.watchouts.length, 0),
    },
    watchouts,
  };
}

function buildVariableRegistry(datasetId: string, profile: DatasetProfileBundle): DatasetVariableRegistry {
  const variables = profile.tableProfiles.flatMap(table => table.columns);
  const byRole: Record<string, string[]> = {};
  const semanticIndex: Record<string, string[]> = {};
  for (const variable of variables) {
    const ref = `${variable.tableId}.${variable.name}`;
    byRole[variable.role] = [...(byRole[variable.role] ?? []), ref];
    for (const tag of variable.semanticTags) semanticIndex[tag] = [...(semanticIndex[tag] ?? []), ref];
  }
  return {
    schemaVersion: 1,
    datasetId,
    generatedAtIso: nowIso(),
    variables,
    byRole: sortRecordArrays(byRole),
    semanticIndex: sortRecordArrays(semanticIndex),
    watchouts: profile.watchouts,
  };
}

function sortRecordArrays(input: Record<string, string[]>): Record<string, string[]> {
  return Object.fromEntries(Object.entries(input).sort(([a], [b]) => a.localeCompare(b)).map(([key, values]) => [key, values.slice().sort((a, b) => a.localeCompare(b))]));
}

function buildRelationshipGraph(datasetId: string, profile: DatasetProfileBundle): DatasetRelationshipGraph {
  const nodes = profile.tableProfiles.map(table => ({ tableId: table.tableId, rowCount: table.rowCount, columnCount: table.columnCount, sourcePath: table.sourcePath }));
  const keyToTables = new Map<string, string[]>();
  for (const table of profile.tableProfiles) {
    const keyCandidates = table.columns
      .filter(column => column.role === "id" || /(^|_)(id|seqn)$|subject_id|hadm_id|stay_id|patient/i.test(column.name.toLowerCase()))
      .map(column => column.name);
    for (const key of keyCandidates) keyToTables.set(key, [...(keyToTables.get(key) ?? []), table.tableId]);
  }
  const edges: DatasetRelationshipGraph["edges"] = [];
  const warnings: DatasetIssue[] = [];
  for (const [key, tables] of keyToTables) {
    const uniqueTables = Array.from(new Set(tables)).sort((a, b) => a.localeCompare(b));
    const pairs = relationshipPairsForKey(key, uniqueTables);
    if (uniqueTables.length > 20) {
      warnings.push(issue("note", "HIGH_FANOUT_RELATIONSHIP_KEY", `${key} appears in ${uniqueTables.length} tables; relationship graph uses anchor/capped edges to avoid a noisy complete graph.`, [`relationshipGraph.${key}`]));
    }
    for (const [leftId, rightId] of pairs) {
      const left = profile.tableProfiles.find(table => table.tableId === leftId);
      const right = profile.tableProfiles.find(table => table.tableId === rightId);
      const cardinality = inferCardinality(left, right, key);
      edges.push({
        leftTable: leftId,
        rightTable: rightId,
        keys: [key],
        confidence: key === "subject_id" || key === "hadm_id" || key === "stay_id" || key === "SEQN" ? 0.9 : 0.7,
        cardinality,
        rationale: `Both tables contain likely join key ${key}.`,
      });
    }
  }
  const entityHints = Array.from(keyToTables.entries()).map(([key, tables]) => ({
    entity: entityForKey(key),
    keys: [key],
    tables: Array.from(new Set(tables)).sort((a, b) => a.localeCompare(b)),
    rationale: `Detected ${key} in ${new Set(tables).size} table(s).`,
  })).filter(item => item.tables.length > 0);
  if (edges.length === 0 && nodes.length > 1) {
    warnings.push(issue("warning", "NO_JOIN_KEYS_INFERRED", "No shared identifier keys were inferred across tables. Provide explicit relationship metadata before multi-table analysis.", ["relationshipGraph.edges"]));
  }
  return { schemaVersion: 1, datasetId, generatedAtIso: nowIso(), nodes, edges, entityHints, warnings };
}

function relationshipPairsForKey(key: string, tables: string[]): Array<[string, string]> {
  const anchor = anchorTableForKey(key, tables);
  if (anchor && tables.length > 2) {
    return tables.filter(table => table !== anchor).slice(0, 250).map(table => [anchor, table]);
  }
  const pairs: Array<[string, string]> = [];
  const limit = tables.length > 20 ? 250 : Number.POSITIVE_INFINITY;
  for (let i = 0; i < tables.length; i += 1) {
    for (let j = i + 1; j < tables.length; j += 1) {
      if (pairs.length >= limit) return pairs;
      pairs.push([tables[i]!, tables[j]!]);
    }
  }
  return pairs;
}

function anchorTableForKey(key: string, tables: string[]): string | null {
  const lower = key.toLowerCase();
  const preferred = lower === "subject_id"
    ? ["hosp-patients", "derived-icustay-detail"]
    : lower === "hadm_id"
      ? ["hosp-admissions", "derived-icustay-detail"]
      : lower === "stay_id"
        ? ["icu-icustays", "derived-icustay-detail"]
        : lower === "itemid"
          ? ["icu-d-items", "hosp-d-labitems"]
          : [];
  for (const candidate of preferred) {
    if (tables.includes(candidate)) return candidate;
  }
  return tables.length > 20 ? tables[0] ?? null : null;
}

function inferCardinality(left: DatasetTableProfile | undefined, right: DatasetTableProfile | undefined, key: string): DatasetRelationshipGraph["edges"][number]["cardinality"] {
  if (!left || !right) return "unknown";
  if (/subject_id|patient|seqn/i.test(key) && ((left.rowCount ?? 0) !== (right.rowCount ?? 0))) return "one-to-many";
  if (/hadm_id|stay_id/i.test(key)) return "one-to-many";
  return "unknown";
}

function entityForKey(key: string): string {
  if (/subject/i.test(key)) return "person/patient";
  if (/hadm/i.test(key)) return "hospital admission";
  if (/stay/i.test(key)) return "ICU stay/encounter";
  if (/seqn/i.test(key)) return "survey participant";
  if (/patient/i.test(key)) return "patient";
  return "entity";
}

function buildQuestionBank(datasetId: string, registry: DatasetVariableRegistry, graph: DatasetRelationshipGraph): DatasetQuestionBank {
  const outcomes = registry.variables.filter(variable => variable.role === "outcome_candidate" && isUsableVariable(variable));
  const exposures = registry.variables.filter(variable => (variable.role === "exposure_candidate" || variable.role === "covariate_candidate" || variable.role === "feature") && isUsableVariable(variable));
  const seeds: DatasetQuestionSeed[] = [];
  for (const outcome of outcomes.slice(0, 12)) {
    for (const exposure of exposures.filter(item => item.name !== outcome.name).slice(0, 10)) {
      if (seeds.length >= 25) break;
      const sameTable = outcome.tableId === exposure.tableId;
      const relationship = sameTable ? null : graph.edges.find(edge =>
        (edge.leftTable === outcome.tableId && edge.rightTable === exposure.tableId)
        || (edge.leftTable === exposure.tableId && edge.rightTable === outcome.tableId));
      if (!sameTable && !relationship) continue;
      const design = outcome.inferredType === "number" && exposure.inferredType === "number"
        ? "cross-sectional association"
        : outcome.inferredType === "number" || exposure.inferredType === "number"
          ? "cross-sectional association"
          : "descriptive";
      seeds.push({
        id: `question_${String(seeds.length + 1).padStart(2, "0")}_${stableHash([outcome.tableId, outcome.name, exposure.tableId, exposure.name]).slice(0, 8)}`,
        question: `Is ${exposure.label} associated with ${outcome.label} in ${datasetId}?`,
        outcome: `${outcome.tableId}.${outcome.name}`,
        exposure: `${exposure.tableId}.${exposure.name}`,
        rationale: sameTable
          ? "Variables are in the same profiled table and passed basic missingness/low-information filters."
          : `Variables can be connected through inferred key(s): ${relationship?.keys.join(", ")}.`,
        suggestedDesign: design,
        requiredChecks: [
          "Confirm the scientific meaning of the variables with a codebook.",
          "Check missingness and sparse cells before modeling.",
          "Choose covariates using domain knowledge rather than exploratory ranking alone.",
          "Treat this as hypothesis generation until a protocol is approved.",
        ],
        priority: priorityForQuestion(outcome, exposure),
      });
    }
  }
  const blockedIdeas = registry.variables
    .filter(variable => !isUsableVariable(variable))
    .slice(0, 20)
    .map(variable => ({ idea: `Use ${variable.tableId}.${variable.name} as a primary analysis variable`, reason: variable.watchouts.map(w => w.message).join("; ") || "Low information or unsuitable role." }));
  return { schemaVersion: 1, datasetId, generatedAtIso: nowIso(), seeds, blockedIdeas };
}

function isUsableVariable(variable: DatasetVariableProfile): boolean {
  return variable.role !== "id"
    && variable.role !== "survey_design"
    && variable.role !== "survey_weight"
    && variable.role !== "low_information"
    && variable.inferredType !== "empty"
    && (variable.missingFraction === null || variable.missingFraction < 0.8);
}

function priorityForQuestion(outcome: DatasetVariableProfile, exposure: DatasetVariableProfile): DatasetQuestionSeed["priority"] {
  if (outcome.watchouts.some(item => item.severity === "warning") || exposure.watchouts.some(item => item.severity === "warning")) return "low";
  if (outcome.tableId === exposure.tableId && outcome.role === "outcome_candidate" && exposure.role === "exposure_candidate") return "high";
  return "medium";
}

function buildManifest(opts: DatasetRegisterOptions, rootDir: string, sourceUri: string, sourceKindValue: DatasetSourceKind, profile: DatasetProfileBundle, descriptionSeed: string): DatasetManifest {
  const supportedFormats = Array.from(new Set(profile.tableProfiles.map(table => table.format))).sort((a, b) => a.localeCompare(b));
  const manifestWithoutHash = {
    schemaVersion: 1 as const,
    datasetId: opts.datasetId,
    title: opts.title ?? labelize(opts.datasetId),
    description: opts.description ?? descriptionSeed,
    domain: opts.domain ?? inferDatasetDomain(opts.datasetId, sourceUri),
    generatedAtIso: nowIso(),
    source: {
      kind: sourceKindValue,
      uri: sourceUri,
      manifestPath: opts.fromManifest ? path.resolve(opts.fromManifest) : null,
    },
    storage: {
      totalBytes: profile.aggregate.totalBytes,
      tableCount: profile.aggregate.tableCount,
      profiledTableCount: profile.aggregate.profiledTableCount,
      rowCountTotalKnown: profile.aggregate.rowCountTotalKnown,
      supportedFormats,
    },
    access: {
      local: sourceKindValue === "local-file" || sourceKindValue === "local-directory",
      cloud: sourceKindValue === "gcs-prefix" || sourceUri.startsWith("gs://"),
      piiPhiRisk: inferPiiPhiRisk(opts.datasetId, opts.domain ?? "unknown"),
      license: opts.license ?? null,
      restrictions: accessRestrictionsFor(opts.datasetId, opts.domain ?? "unknown"),
    },
    standardLayout: standardLayout(rootDir),
    tables: profile.tableProfiles.map(table => ({
      tableId: table.tableId,
      sourcePath: table.sourcePath,
      format: table.format,
      bytes: table.bytes,
      rowCount: table.rowCount,
      columnCount: table.columnCount,
      profileStatus: table.profileStatus,
    })),
  };
  return { ...manifestWithoutHash, hash: stableHash(manifestWithoutHash) };
}

function inferDatasetDomain(datasetId: string, sourceUri: string): DatasetDomain {
  const text = `${datasetId} ${sourceUri}`.toLowerCase();
  if (text.includes("mimic") || text.includes("ehr") || text.includes("icu")) return "ehr";
  if (text.includes("nhanes") || text.includes("brfss") || text.includes("survey")) return "public-health-survey";
  if (text.includes("seer") || text.includes("registry")) return "registry";
  if (text.includes("claim")) return "claims";
  if (text.includes("synthetic") || text.includes("fixture")) return "synthetic";
  return "user-upload";
}

function inferPiiPhiRisk(datasetId: string, domain: DatasetDomain): DatasetManifest["access"]["piiPhiRisk"] {
  const text = datasetId.toLowerCase();
  if (text.includes("mimic") || domain === "ehr" || domain === "claims") return "high";
  if (domain === "public-health-survey" || domain === "registry") return "moderate";
  if (domain === "synthetic") return "low";
  return "unknown";
}

function accessRestrictionsFor(datasetId: string, domain: DatasetDomain): string[] {
  const out = ["Confirm source license and redistribution rights before export or sharing."];
  if (datasetId.toLowerCase().includes("mimic") || domain === "ehr") out.push("Treat as credentialed clinical data; do not publish row-level data or derived identifiable artifacts.");
  if (domain === "public-health-survey") out.push("Use design weights/strata/PSU metadata when making population statements.");
  return out;
}

function standardLayout(rootDir: string): DatasetManifest["standardLayout"] {
  return {
    root: rootDir,
    manifest: path.join(rootDir, "dataset-manifest.json"),
    variableRegistry: path.join(rootDir, "variable-registry.json"),
    relationshipGraph: path.join(rootDir, "relationship-graph.json"),
    profile: path.join(rootDir, "data-profile.json"),
    watchouts: path.join(rootDir, "watchouts.json"),
    questions: path.join(rootDir, "question-seeds.json"),
    summary: path.join(rootDir, "dataset-summary.md"),
    context: path.join(rootDir, "DATASET_CONTEXT.md"),
  };
}

export async function researchDatasetRegisterCommand(opts: DatasetRegisterOptions): Promise<DatasetRegistrationResult> {
  if (!opts.source && !opts.fromManifest) throw new Error("dataset-register requires --source or --from-manifest.");
  const datasetId = slugify(opts.datasetId);
  const rootDir = path.resolve(opts.outDir, datasetId);
  await mkdir(rootDir, { recursive: true });
  const maxTables = opts.maxTables ?? 200;
  const maxRows = opts.maxRows ?? 10_000;
  let tables: DatasetTableProfile[];
  let sourceUri = opts.source ?? path.resolve(opts.fromManifest!);
  let titleSeed = opts.title ?? labelize(datasetId);
  let descriptionSeed = opts.description ?? `Dataset registered from ${sourceUri}.`;
  const kind = sourceKind(opts.source, opts.fromManifest);
  if (opts.fromManifest) {
    const fromManifest = await profilesFromExportManifest(opts.fromManifest);
    tables = fromManifest.tables.slice(0, maxTables);
    sourceUri = fromManifest.sourceUri;
    titleSeed = opts.title ?? fromManifest.title;
    descriptionSeed = opts.description ?? fromManifest.description;
  } else if (opts.source?.startsWith("gs://")) {
    tables = [{
      tableId: datasetId,
      sourcePath: opts.source,
      format: "unknown",
      bytes: 0,
      rowCount: null,
      columnCount: null,
      sha256: null,
      columns: [],
      profileStatus: "metadata_only",
      profileWarnings: [issue("warning", "GCS_PREFIX_METADATA_ONLY", "GCS prefixes require an export manifest or local cache for table-level profiling.", [opts.source])],
    }];
  } else {
    tables = await discoverLocalTables(opts.source!, maxTables);
    tables = await Promise.all(tables.map(table => profileLocalTable(table, { python: opts.python, maxRows })));
    const sourceStat = await stat(path.resolve(opts.source!));
    if (sourceStat.isDirectory()) {
      sourceUri = path.resolve(opts.source!);
    }
  }
  const profile = buildProfileBundle(datasetId, tables);
  const variableRegistry = buildVariableRegistry(datasetId, profile);
  const relationshipGraph = buildRelationshipGraph(datasetId, profile);
  const questions = buildQuestionBank(datasetId, variableRegistry, relationshipGraph);
  const manifest = buildManifest({ ...opts, datasetId, title: titleSeed, description: descriptionSeed }, rootDir, sourceUri, kind === "local-file" && opts.source && await isDirectory(opts.source) ? "local-directory" : kind, profile, descriptionSeed);
  const watchouts = {
    schemaVersion: 1,
    datasetId,
    generatedAtIso: nowIso(),
    issues: profile.watchouts,
    summary: summarizeWatchouts(profile.watchouts),
  };
  const summary = renderDatasetSummary({ manifest, profile, variableRegistry, relationshipGraph, questions });
  const context = renderDatasetContext({ manifest, profile, variableRegistry, relationshipGraph, questions });
  const layout = manifest.standardLayout;
  const files: Array<[string, unknown | string]> = [
    [layout.manifest, manifest],
    [layout.profile, profile],
    [layout.variableRegistry, variableRegistry],
    [layout.relationshipGraph, relationshipGraph],
    [layout.watchouts, watchouts],
    [layout.questions, questions],
    [layout.summary, summary],
    [layout.context, context],
    [path.join(rootDir, "README.md"), renderDatasetReadme(manifest)],
  ];
  const generatedFiles: string[] = [];
  for (const [file, value] of files) {
    await writeFile(file, typeof value === "string" ? value : `${JSON.stringify(value, null, 2)}\n`, "utf-8");
    generatedFiles.push(file);
  }
  return {
    schemaVersion: 1,
    datasetId,
    rootDir,
    manifest,
    profile,
    variableRegistry,
    relationshipGraph,
    questions,
    summaryPath: layout.summary,
    contextPath: layout.context,
    generatedFiles,
    nextAction: questions.seeds.length
      ? `Use ${layout.context} before planning; run dataset-questions or promote one seed into method selection.`
      : `Use ${layout.profile} and ${layout.variableRegistry} to add codebook metadata before research planning.`,
  };
}

async function isDirectory(file: string): Promise<boolean> {
  return (await stat(path.resolve(file))).isDirectory();
}

function summarizeWatchouts(issues: DatasetIssue[]): string {
  const blockers = issues.filter(item => item.severity === "blocker").length;
  const warnings = issues.filter(item => item.severity === "warning").length;
  const notes = issues.filter(item => item.severity === "note").length;
  return `${blockers} blocker(s), ${warnings} warning(s), ${notes} note(s).`;
}

export async function researchDatasetInspectCommand(opts: DatasetLoadOptions): Promise<DatasetManifest> {
  return readDatasetJson(opts.datasetDir, "dataset-manifest.json") as Promise<DatasetManifest>;
}

export async function researchDatasetProfileCommand(opts: DatasetLoadOptions): Promise<DatasetProfileBundle> {
  return readDatasetJson(opts.datasetDir, "data-profile.json") as Promise<DatasetProfileBundle>;
}

export async function researchDatasetRelationshipsCommand(opts: DatasetLoadOptions): Promise<DatasetRelationshipGraph> {
  return readDatasetJson(opts.datasetDir, "relationship-graph.json") as Promise<DatasetRelationshipGraph>;
}

export async function researchDatasetQuestionsCommand(opts: DatasetLoadOptions): Promise<DatasetQuestionBank> {
  return readDatasetJson(opts.datasetDir, "question-seeds.json") as Promise<DatasetQuestionBank>;
}

export async function researchDatasetDescribeCommand(opts: DatasetLoadOptions): Promise<string> {
  return readFile(path.join(path.resolve(opts.datasetDir), "dataset-summary.md"), "utf-8");
}

async function readDatasetJson(datasetDir: string, file: string): Promise<unknown> {
  const resolved = path.join(path.resolve(datasetDir), file);
  return JSON.parse(await readFile(resolved, "utf-8")) as unknown;
}

export function renderDatasetRegistration(result: DatasetRegistrationResult): string {
  return [
    `dataset registered: ${result.datasetId}`,
    `  root: ${result.rootDir}`,
    `  tables: ${result.manifest.storage.tableCount} (${result.manifest.storage.profiledTableCount} profiled)`,
    `  rows known: ${result.manifest.storage.rowCountTotalKnown ?? "(partial/unknown)"}`,
    `  variables: ${result.variableRegistry.variables.length}`,
    `  watchouts: ${summarizeWatchouts(result.profile.watchouts)}`,
    `  question seeds: ${result.questions.seeds.length}`,
    `  context: ${result.contextPath}`,
    `  next: ${result.nextAction}`,
  ].join("\n");
}

export function renderDatasetRegistrationJson(result: DatasetRegistrationResult): string {
  return `${JSON.stringify({ schemaVersion: 1, datasetRegistration: result }, null, 2)}\n`;
}

export function renderDatasetManifest(result: DatasetManifest): string {
  return [
    `dataset: ${result.datasetId}`,
    `  title: ${result.title}`,
    `  source: ${result.source.kind} ${result.source.uri}`,
    `  domain: ${result.domain}`,
    `  tables: ${result.storage.tableCount}; profiled=${result.storage.profiledTableCount}`,
    `  rows known: ${result.storage.rowCountTotalKnown ?? "(partial/unknown)"}`,
    `  summary: ${result.standardLayout.summary}`,
    `  context: ${result.standardLayout.context}`,
  ].join("\n");
}

export function renderDatasetManifestJson(result: DatasetManifest): string {
  return `${JSON.stringify({ schemaVersion: 1, datasetManifest: result }, null, 2)}\n`;
}

export function renderDatasetProfile(result: DatasetProfileBundle): string {
  return [
    `dataset profile: ${result.datasetId}`,
    `  tables: ${result.aggregate.tableCount}; profiled=${result.aggregate.profiledTableCount}`,
    `  rows known: ${result.aggregate.rowCountTotalKnown ?? "(partial/unknown)"}`,
    `  columns known: ${result.aggregate.columnCountTotalKnown ?? "(partial/unknown)"}`,
    `  high missing variables: ${result.aggregate.highMissingVariableCount}`,
    `  semantic watchouts: ${result.aggregate.semanticWatchoutCount}`,
    ...result.tableProfiles.slice(0, 12).map(table => `  ${table.tableId}: rows=${table.rowCount ?? "?"} cols=${table.columnCount ?? "?"} status=${table.profileStatus}`),
  ].join("\n");
}

export function renderDatasetProfileJson(result: DatasetProfileBundle): string {
  return `${JSON.stringify({ schemaVersion: 1, datasetProfile: result }, null, 2)}\n`;
}

export function renderDatasetRelationships(result: DatasetRelationshipGraph): string {
  return [
    `dataset relationships: ${result.datasetId}`,
    `  tables: ${result.nodes.length}`,
    `  inferred edges: ${result.edges.length}`,
    `  entities: ${result.entityHints.map(item => `${item.entity}(${item.keys.join(",")})`).join("; ") || "(none)"}`,
    ...result.edges.slice(0, 12).map(edge => `  ${edge.leftTable} <-> ${edge.rightTable} on ${edge.keys.join(",")} confidence=${edge.confidence}`),
  ].join("\n");
}

export function renderDatasetRelationshipsJson(result: DatasetRelationshipGraph): string {
  return `${JSON.stringify({ schemaVersion: 1, relationshipGraph: result }, null, 2)}\n`;
}

export function renderDatasetQuestions(result: DatasetQuestionBank): string {
  return [
    `dataset questions: ${result.datasetId}`,
    `  seeds: ${result.seeds.length}`,
    ...result.seeds.slice(0, 12).map(seed => `  ${seed.id} [${seed.priority}] ${seed.question}`),
    `  blocked ideas: ${result.blockedIdeas.length}`,
  ].join("\n");
}

export function renderDatasetQuestionsJson(result: DatasetQuestionBank): string {
  return `${JSON.stringify({ schemaVersion: 1, datasetQuestions: result }, null, 2)}\n`;
}

function renderDatasetSummary(input: {
  manifest: DatasetManifest;
  profile: DatasetProfileBundle;
  variableRegistry: DatasetVariableRegistry;
  relationshipGraph: DatasetRelationshipGraph;
  questions: DatasetQuestionBank;
}): string {
  const { manifest, profile, variableRegistry, relationshipGraph, questions } = input;
  const topWatchouts = summarizeIssueGroups(profile.watchouts).slice(0, 12);
  const roleRows = Object.entries(variableRegistry.byRole).sort(([a], [b]) => a.localeCompare(b));
  return [
    `# ${manifest.title}`,
    "",
    "## What This Dataset Is",
    "",
    manifest.description,
    "",
    `Source: ${manifest.source.uri}`,
    `Domain: ${manifest.domain}`,
    `Tables: ${manifest.storage.tableCount}`,
    `Profiled tables: ${manifest.storage.profiledTableCount}`,
    `Known rows across tables: ${manifest.storage.rowCountTotalKnown ?? "partial/unknown"}`,
    `Storage footprint: ${formatBytes(manifest.storage.totalBytes)}`,
    "",
    "## Standard Files For Agents",
    "",
    "- `dataset-manifest.json`: source, access, storage, table inventory, and fixed file locations.",
    "- `variable-registry.json`: variable roles, inferred types, semantic tags, and variable-level watchouts.",
    "- `relationship-graph.json`: inferred table relationships and entity keys.",
    "- `data-profile.json`: table and column profiling evidence.",
    "- `watchouts.json`: consolidated blockers, warnings, and notes.",
    "- `question-seeds.json`: candidate research questions that still require protocol review.",
    "- `DATASET_CONTEXT.md`: short agent-facing context to read before every planning round.",
    "",
    "## Variable Role Inventory",
    "",
    ...roleRows.map(([role, refs]) => `- ${role}: ${refs.length}`),
    "",
    "## Relationship Map",
    "",
    relationshipGraph.edges.length
      ? relationshipGraph.edges.slice(0, 20).map(edge => `- ${edge.leftTable} to ${edge.rightTable} via ${edge.keys.join(", ")} (${edge.cardinality}, confidence ${edge.confidence}).`).join("\n")
      : "No relationships were inferred. Multi-table analysis needs explicit join metadata.",
    "",
    "## Things To Watch Out For",
    "",
    topWatchouts.length
      ? topWatchouts.map(item => `- ${item.severity.toUpperCase()} ${item.code} (${item.count}): ${item.message}`).join("\n")
      : "No deterministic watchouts were detected in the profiled metadata.",
    "",
    "## Candidate Research Directions",
    "",
    questions.seeds.length
      ? questions.seeds.slice(0, 10).map(seed => `- ${seed.id}: ${seed.question} Suggested design: ${seed.suggestedDesign}.`).join("\n")
      : "No candidate research questions were generated. Add codebook metadata or profile concrete tables.",
    "",
    "## Required Before Serious Analysis",
    "",
    "- Confirm source license/access rules and whether row-level data may be exported.",
    "- Attach or verify codebooks for variable meanings and coding.",
    "- Confirm table joins and analytic unit before joining tables.",
    "- Run method selection against a specific research question before modeling.",
    "- Treat generated question seeds as exploratory until a protocol is approved.",
    "",
  ].join("\n");
}

function summarizeIssueGroups(issues: DatasetIssue[]): Array<DatasetIssue & { count: number }> {
  const groups = new Map<string, DatasetIssue & { count: number }>();
  for (const item of issues) {
    const key = `${item.severity}:${item.code}:${item.message}`;
    const existing = groups.get(key);
    if (existing) {
      existing.count += 1;
      existing.evidenceRefs = Array.from(new Set([...existing.evidenceRefs, ...item.evidenceRefs])).slice(0, 12);
    } else {
      groups.set(key, { ...item, evidenceRefs: item.evidenceRefs.slice(0, 12), count: 1 });
    }
  }
  const severityRank: Record<DatasetIssue["severity"], number> = { blocker: 0, warning: 1, note: 2 };
  return Array.from(groups.values()).sort((a, b) => severityRank[a.severity] - severityRank[b.severity] || b.count - a.count || a.code.localeCompare(b.code));
}

function renderDatasetContext(input: {
  manifest: DatasetManifest;
  profile: DatasetProfileBundle;
  variableRegistry: DatasetVariableRegistry;
  relationshipGraph: DatasetRelationshipGraph;
  questions: DatasetQuestionBank;
}): string {
  const { manifest, profile, variableRegistry, relationshipGraph, questions } = input;
  return [
    `# Dataset Context: ${manifest.datasetId}`,
    "",
    `Read this file before planning with ${manifest.datasetId}.`,
    "",
    `Manifest: ${manifest.standardLayout.manifest}`,
    `Variable registry: ${manifest.standardLayout.variableRegistry}`,
    `Relationship graph: ${manifest.standardLayout.relationshipGraph}`,
    `Profile: ${manifest.standardLayout.profile}`,
    `Watchouts: ${manifest.standardLayout.watchouts}`,
    `Question seeds: ${manifest.standardLayout.questions}`,
    "",
    "## Operational Summary",
    "",
    `- Domain: ${manifest.domain}`,
    `- Tables: ${profile.aggregate.tableCount}; profiled: ${profile.aggregate.profiledTableCount}`,
    `- Known rows: ${profile.aggregate.rowCountTotalKnown ?? "partial/unknown"}`,
    `- Known variables: ${variableRegistry.variables.length}`,
    `- Inferred relationship edges: ${relationshipGraph.edges.length}`,
    `- Watchouts: ${summarizeWatchouts(profile.watchouts)}`,
    "",
    "## First Checks",
    "",
    "- Use `dataset-manifest.json` to verify source and access boundaries.",
    "- Use `variable-registry.json` before choosing outcome/exposure/covariates.",
    "- Use `relationship-graph.json` before any multi-table materialization.",
    "- Use `watchouts.json` to block high-missingness, semantic-range, low-information, and access-risk mistakes.",
    "- Use `question-seeds.json` only as hypothesis-generation input, not as approved protocols.",
    "",
    "## Top Question Seeds",
    "",
    ...(questions.seeds.slice(0, 5).map(seed => `- ${seed.id}: ${seed.question}`)),
    "",
  ].join("\n");
}

function renderDatasetReadme(manifest: DatasetManifest): string {
  return [
    `# ${manifest.title} Dataset Intelligence`,
    "",
    "This directory is the canonical dataset context bundle for Agenteer research planning.",
    "",
    "Start with `DATASET_CONTEXT.md`, then inspect the JSON artifacts referenced there.",
    "",
  ].join("\n");
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KiB", "MiB", "GiB", "TiB"];
  let value = bytes / 1024;
  for (const unit of units) {
    if (value < 1024) return `${value.toFixed(2)} ${unit}`;
    value /= 1024;
  }
  return `${value.toFixed(2)} PiB`;
}
