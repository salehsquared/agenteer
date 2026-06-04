export interface SemanticPlausibilityColumn {
  name: string;
  inferredType?: "number" | "string" | "boolean" | "empty" | "mixed" | "unknown";
  nonMissingRows?: number;
  uniqueCount?: number;
  min?: number;
  max?: number;
  mean?: number;
}

export interface SemanticPlausibilityIssue {
  severity: "blocker" | "warning" | "note";
  code: string;
  message: string;
}

export function semanticPlausibilityIssuesForColumn(column: SemanticPlausibilityColumn, rowCount: number | null): SemanticPlausibilityIssue[] {
  const issues: SemanticPlausibilityIssue[] = [];
  const lower = column.name.toLowerCase();
  if (column.inferredType !== "number") return issues;
  const binaryIndicatorLike = lower.startsWith("elevated_")
    || lower.startsWith("high_")
    || lower.startsWith("has_")
    || lower.startsWith("is_")
    || lower.endsWith("_flag")
    || lower.endsWith("_indicator")
    || lower.endsWith("_binary")
    || /(death|mortality|stroke|mace)/.test(lower);
  if (binaryIndicatorLike) {
    if (column.min !== undefined && column.max !== undefined && (column.min < 0 || column.max > 1)) issues.push({ severity: "blocker", code: "INVALID_BINARY_EVENT_RANGE", message: `Binary-event-like column ${column.name} is not bounded to 0/1 (${column.min} to ${column.max}).` });
    return issues;
  }
  if (/(^|_)age($|_)|age_?years?|ridageyr/.test(lower) && ((column.min ?? 0) < 0 || (column.max ?? 0) > 120)) issues.push({ severity: "blocker", code: "IMPLAUSIBLE_AGE_RANGE", message: `Age-like column ${column.name} has implausible range ${column.min} to ${column.max}.` });
  if (/(^|_)age($|_)|age_?years?|ridageyr/.test(lower) && typeof column.mean === "number" && column.mean > 95) issues.push({ severity: "warning", code: "IMPLAUSIBLE_AGE_MEAN", message: `Age-like column ${column.name} has mean ${round(column.mean, 2)}, which is unusually high for most human cohorts.` });
  if (/(bmi|body.?mass|bmxbmi)/.test(lower) && ((column.min ?? 20) < 5 || (column.max ?? 20) > 100)) issues.push({ severity: "blocker", code: "IMPLAUSIBLE_BMI_RANGE", message: `BMI-like column ${column.name} has implausible range ${column.min} to ${column.max}.` });
  if (/(bmi|body.?mass|bmxbmi)/.test(lower) && typeof column.mean === "number" && column.mean > 60) issues.push({ severity: "warning", code: "IMPLAUSIBLE_BMI_MEAN", message: `BMI-like column ${column.name} has mean ${round(column.mean, 2)}, which suggests possible unit/coding problems.` });
  if (/(hba1c|glycohemoglobin|lbxgh)/.test(lower) && ((column.min ?? 5) < 2 || (column.max ?? 5) > 20)) issues.push({ severity: "blocker", code: "IMPLAUSIBLE_HBA1C_RANGE", message: `HbA1c-like column ${column.name} has implausible range ${column.min} to ${column.max}.` });
  if (/(systolic|bpxsy|sbp)/.test(lower) && ((column.min ?? 120) < 40 || (column.max ?? 120) > 300)) issues.push({ severity: "blocker", code: "IMPLAUSIBLE_SYSTOLIC_BP_RANGE", message: `Systolic-blood-pressure-like column ${column.name} has implausible range ${column.min} to ${column.max}.` });
  if (/(diastolic|bpxdi|dbp)/.test(lower) && ((column.min ?? 70) < 0 || (column.max ?? 70) > 180)) issues.push({ severity: "blocker", code: "IMPLAUSIBLE_DIASTOLIC_BP_RANGE", message: `Diastolic-blood-pressure-like column ${column.name} has implausible range ${column.min} to ${column.max}.` });
  if (/(los|length.?of.?stay)/.test(lower) && (column.min ?? 0) < 0) issues.push({ severity: "warning", code: "NEGATIVE_LENGTH_OF_STAY", message: `Length-of-stay-like column ${column.name} has negative values.` });
  if (/(weight|sample_?weight|survey_?weight|^wt|_wt)/.test(lower) && (column.min ?? 0) < 0) issues.push({ severity: "blocker", code: "NEGATIVE_WEIGHT_VALUE", message: `Weight-like column ${column.name} has negative values.` });
  if (/(probability|propensity|proportion|fraction)/.test(lower) && column.min !== undefined && column.max !== undefined && (column.min < 0 || column.max > 1)) issues.push({ severity: "blocker", code: "INVALID_PROPORTION_RANGE", message: `Proportion-like column ${column.name} is not bounded to 0/1 (${column.min} to ${column.max}).` });
  if (/(percent|pct|percentage)/.test(lower) && column.min !== undefined && column.max !== undefined && (column.min < 0 || column.max > 100)) issues.push({ severity: "blocker", code: "INVALID_PERCENT_RANGE", message: `Percent-like column ${column.name} is not bounded to 0/100 (${column.min} to ${column.max}).` });
  const eventStateLike = /(event)/.test(lower) && !/(death|mortality|flag|stroke|mace|period|time|month|week|day|year|window|relative|index)/.test(lower);
  if (eventStateLike && column.min !== undefined && column.max !== undefined && column.min < 0) issues.push({ severity: "blocker", code: "INVALID_EVENT_CODE_RANGE", message: `Event-like column ${column.name} has negative event codes (${column.min} to ${column.max}).` });
  if (eventStateLike && column.min !== undefined && column.max !== undefined && column.max > 1) issues.push({ severity: "warning", code: "MULTISTATE_EVENT_CODES", message: `Event-like column ${column.name} has codes beyond 0/1 (${column.min} to ${column.max}); verify the selected method supports competing or multistate event coding.` });
  if (/(year)/.test(lower) && column.min !== undefined && column.max !== undefined && (column.min < 1800 || column.max > 2200)) issues.push({ severity: "warning", code: "IMPLAUSIBLE_YEAR_RANGE", message: `Year-like column ${column.name} has implausible range ${column.min} to ${column.max}.` });
  if (/(count|_n$|^n_)/.test(lower) && (column.min ?? 0) < 0) issues.push({ severity: "blocker", code: "NEGATIVE_COUNT_VALUE", message: `Count-like column ${column.name} has negative values.` });
  if (rowCount !== null && /(count|_n$|^n_)/.test(lower) && typeof column.max === "number" && column.max > rowCount && rowCount >= 5) issues.push({ severity: "warning", code: "COUNT_EXCEEDS_TABLE_ROWS", message: `Count-like column ${column.name} has maximum ${column.max}, which exceeds table row count ${rowCount}; confirm this is an aggregate count rather than row-level data.` });
  return issues;
}

export function identifierLikeColumnReason(column: SemanticPlausibilityColumn, rowCount: number | null): string | null {
  const lower = column.name.toLowerCase();
  if (/^(seqn|id|row|rowid|row_id)$/.test(lower)) return "name is a canonical row/person identifier";
  if (/(^|_)(identifier|record_id|row_id|person_id|participant_id|subject_id|patient_id|encounter_id|admission_id|hadm_id|stay_id|visit_id)(_|$)/.test(lower)) return "name indicates a row, person, encounter, admission, stay, or visit identifier";
  if (/(^|_)(subject|person|participant|patient|encounter|admission|hadm|stay|visit|row)[_-]?id$/.test(lower)) return "name indicates a row, person, encounter, admission, stay, or visit identifier";
  if (!/(^|_)id$|_id$/.test(lower)) return null;
  const denominator = rowCount ?? column.nonMissingRows ?? null;
  const uniqueCount = column.uniqueCount ?? null;
  if (denominator !== null && denominator > 0 && uniqueCount !== null && uniqueCount / denominator >= 0.7) return `id-like name with high cardinality (${uniqueCount}/${denominator} unique values)`;
  if (uniqueCount !== null && uniqueCount >= 100) return `id-like name with high cardinality (${uniqueCount} unique values)`;
  return null;
}

export function outcomeOrFutureLeakageReason(columnName: string, targetName?: string | null): string | null {
  const tokens = columnNameTokens(columnName);
  const collapsed = tokens.join("");
  const targetTokens = targetName ? columnNameTokens(targetName) : [];
  const targetTokenSet = new Set(targetTokens.filter(token => token.length >= 4 && !LOW_SIGNAL_TARGET_TOKENS.has(token)));
  const hasBaselineQualifier = tokens.some(token => BASELINE_TIMING_TOKENS.has(token))
    || tokens.includes("preindex")
    || tokens.includes("preoperative")
    || tokens.includes("preop");
  const markers = new Set<string>();
  const addIfPresent = (token: string, marker = token): void => {
    if (tokens.includes(token)) markers.add(marker);
  };

  for (const token of [
    "post",
    "postop",
    "postoperative",
    "after",
    "later",
    "subsequent",
    "future",
    "readmission",
    "readmit",
    "rehospitalization",
    "complication",
    "complications",
    "mortality",
    "death",
    "dead",
    "died",
    "mace",
    "reintervention",
    "reinterventions",
    "revision",
    "explant",
    "explantation",
    "discharge",
    "discharged",
    "disposition",
    "outcome",
    "endpoint",
    "event",
    "events",
  ]) {
    addIfPresent(token);
  }
  if (tokens.includes("label") && (tokens.length === 1 || tokens.includes("outcome") || tokens.includes("target"))) markers.add("label");
  if (tokens.includes("followup") || collapsed.includes("followup") || (tokens.includes("follow") && tokens.includes("up"))) markers.add("follow-up");
  if (tokens.includes("los") || collapsed.includes("lengthofstay")) markers.add("length-of-stay");
  if (tokens.includes("mi")) markers.add("myocardial-infarction");
  if (tokens.includes("stroke")) markers.add("stroke");
  if (tokens.includes("hf") || (tokens.includes("heart") && tokens.includes("failure"))) markers.add("heart-failure");

  for (const token of targetTokenSet) {
    if (tokens.includes(token) && !hasBaselineQualifier) markers.add(`target-token:${token}`);
  }

  if (!markers.size) return null;
  const baselineSensitiveMarkers = new Set(["myocardial-infarction", "stroke", "heart-failure"]);
  if (hasBaselineQualifier && [...markers].every(marker => baselineSensitiveMarkers.has(marker))) return null;
  return `future/outcome-like marker(s): ${[...markers].sort().join(", ")}`;
}

export function postTreatmentAdjustmentReason(columnName: string): string | null {
  const tokens = columnNameTokens(columnName);
  const collapsed = tokens.join("");
  const hasBaselineQualifier = tokens.some(token => BASELINE_TIMING_TOKENS.has(token))
    || tokens.includes("preindex")
    || tokens.includes("preoperative")
    || tokens.includes("preop");
  if (hasBaselineQualifier) return null;

  const timingMarkers = new Set<string>();
  for (const token of ["post", "postop", "postoperative", "after", "later", "subsequent", "future", "new", "during", "inpatient", "inhospital", "hospital", "received", "given", "administered"]) {
    if (tokens.includes(token)) timingMarkers.add(token);
  }
  if (collapsed.includes("inhospital")) timingMarkers.add("in-hospital");
  if (tokens.includes("hospital") && tokens.includes("acquired")) timingMarkers.add("hospital-acquired");

  const careMarkers = new Set<string>();
  for (const token of [
    "treatment",
    "treated",
    "therapy",
    "therapeutic",
    "procedure",
    "procedural",
    "intervention",
    "interventional",
    "surgery",
    "surgical",
    "operation",
    "operative",
    "medication",
    "medications",
    "drug",
    "vasopressor",
    "ventilation",
    "ventilator",
    "transfusion",
    "dialysis",
    "catheter",
    "central",
    "line",
  ]) {
    if (tokens.includes(token)) careMarkers.add(token);
  }
  if (tokens.includes("mechanical") && tokens.includes("ventilation")) careMarkers.add("mechanical-ventilation");
  if (tokens.includes("renal") && tokens.includes("replacement")) careMarkers.add("renal-replacement");

  if (!timingMarkers.size || !careMarkers.size) return null;
  return `post-baseline care marker(s): ${[...timingMarkers].sort().join(", ")} + ${[...careMarkers].sort().join(", ")}`;
}

const BASELINE_TIMING_TOKENS = new Set(["prior", "history", "hx", "baseline", "pre", "preop", "preoperative", "preindex", "previous", "past", "chronic", "comorbid", "comorbidity", "existing"]);
const LOW_SIGNAL_TARGET_TOKENS = new Set(["status", "flag", "indicator", "binary", "outcome", "target", "label", "event", "events", "any", "has", "is", "numeric", "variable", "var", "value", "measure", "measured", "by", "paired", "left", "right"]);

function columnNameTokens(value: string): string[] {
  const spaced = value
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
    .toLowerCase();
  return spaced.split(/[^a-z0-9]+/).filter(Boolean);
}

function round(value: number, digits = 4): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}
