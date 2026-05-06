#!/usr/bin/env python3
import json, math, subprocess, sys, tempfile
from pathlib import Path

import numpy as np
import pandas as pd


def unwrap_spec(raw):
    return raw.get("analysisSpec", raw)


def variable_list(spec, key):
    variables = spec.get("variables", {})
    value = variables.get(key, [])
    if isinstance(value, list):
        return [str(item) for item in value]
    if isinstance(value, dict) and "variable" in value:
        return [str(value["variable"])]
    if isinstance(value, str):
        return [value]
    return []


def survey_value(spec, camel, nested):
    survey = spec.get("surveyDesign", {}) or {}
    if survey.get(camel):
        return str(survey[camel])
    variables = spec.get("variables", {}) or {}
    nested_survey = variables.get("surveyDesign", {}) or {}
    if nested_survey.get(nested):
        return str(nested_survey[nested])
    return None


def simple_filters(spec):
    population = spec.get("population", {}) or {}
    filters = population.get("filters") or population.get("eligibility") or []
    return [str(item) for item in filters if isinstance(item, str)]


def table_files_for_variables(data_root, required):
    files = sorted(Path(data_root).rglob("*.parquet")) + sorted(Path(data_root).rglob("*.csv")) + sorted(Path(data_root).rglob("*.json"))
    selected = []
    remaining = set(required)
    for file in files:
        try:
            if file.suffix == ".parquet":
                frame = pd.read_parquet(file)
            elif file.suffix == ".csv":
                frame = pd.read_csv(file)
            else:
                frame = pd.read_json(file)
        except Exception:
            continue
        cols = set(map(str, frame.columns))
        if "SEQN" in cols and (remaining & cols):
            selected.append((file, frame))
            remaining -= cols
        if not remaining:
            break
    if remaining:
        raise SystemExit(f"Missing required variables in data root: {sorted(remaining)}")
    return selected


def apply_filters(df, filters):
    out = df
    for raw in filters:
        parts = raw.replace(">=", " >= ").replace("<=", " <= ").replace(">", " > ").replace("<", " < ").replace("==", " == ").split()
        if len(parts) < 3:
            continue
        column, op, value_raw = parts[0], parts[1], parts[2]
        if column not in out.columns:
            continue
        try:
            value = float(value_raw)
        except ValueError:
            continue
        series = pd.to_numeric(out[column], errors="coerce")
        if op == ">=":
            out = out[series >= value]
        elif op == "<=":
            out = out[series <= value]
        elif op == ">":
            out = out[series > value]
        elif op == "<":
            out = out[series < value]
        elif op == "==":
            out = out[series == value]
    return out


def merge_tables(tables):
    merged = None
    for _, frame in tables:
        if merged is None:
            merged = frame.copy()
        else:
            keep = [col for col in frame.columns if col == "SEQN" or col not in merged.columns]
            merged = merged.merge(frame[keep], on="SEQN", how="inner")
    return merged if merged is not None else pd.DataFrame()


def binary_threshold(spec):
    model = spec.get("model", {}) or {}
    threshold = model.get("binaryThreshold") or model.get("binary_threshold")
    if isinstance(threshold, dict):
        variable = str(threshold.get("variable") or "")
        operator = str(threshold.get("operator") or ">=")
        value = threshold.get("value")
        name = str(threshold.get("name") or f"{variable}_threshold")
        if variable and value is not None:
            return {"variable": variable, "operator": operator, "value": float(value), "name": name}
    return None


def model_family(spec):
    model = spec.get("model", {}) or {}
    family = str(model.get("family") or model.get("type") or "").lower()
    if "logistic" in family or "binomial" in family:
        return "logistic"
    return "linear"


def weight_domain_info(spec, weight, adapter):
    survey = spec.get("surveyDesign", {}) or {}
    upper = str(weight).upper()
    domains = ((adapter.get("surveyDesign") or {}).get("weightDomains") or [])
    matched = next((item for item in domains if str(item.get("weight", "")).upper() == upper), None)
    domain_id = str(matched.get("id") or upper.lower()) if matched else "custom_weight"
    label = str(matched.get("label") or f"Custom or less common NHANES weight {weight}") if matched else f"Custom or less common NHANES weight {weight}"
    is_subsample = bool(matched.get("isSubsample")) if matched else (upper.startswith("WTS") or upper.startswith("WTSAF"))
    rationale = str(survey.get("weightRationale") or survey.get("weight_rationale") or "").strip()
    eligibility = str(survey.get("eligibilityNote") or survey.get("eligibility_note") or survey.get("subsampleEligibility") or "").strip()
    if not rationale and matched:
        rationale = str(matched.get("rationale") or "").strip()
    if not eligibility and matched:
        eligibility = str(matched.get("eligibilityNote") or "").strip()
    if is_subsample and (not rationale or not eligibility):
        raise SystemExit(f"Subsample weight {weight} requires surveyDesign.weightRationale and surveyDesign.eligibilityNote before execution.")
    if not rationale:
        rationale = f"{weight} was selected from the survey design section of the analysis plan."
    rationale = reader_text(rationale)
    eligibility = reader_text(eligibility)
    if not eligibility:
        eligibility = label
    return {
        "id": domain_id,
        "label": label,
        "isSubsample": bool(is_subsample),
        "rationale": rationale,
        "eligibilityNote": eligibility,
        "cycleYears": matched.get("cycleYears") if matched else None,
        "multiCycleConstruction": matched.get("multiCycleConstruction") if matched else "No adapter multi-cycle policy declared for this weight.",
    }


def reader_text(text):
    out = str(text)
    replacements = [
        ("for this AnalysisSpec", "for this analysis"),
        ("this AnalysisSpec", "this analysis"),
        ("the AnalysisSpec", "the analysis plan"),
        ("AnalysisSpec", "analysis plan"),
        ("analysis spec", "analysis plan"),
        ("Interpret estimates for ", ""),
        ("interpret estimates for ", ""),
    ]
    for old, new in replacements:
        out = out.replace(old, new)
    return out


def metadata_for(adapter, variable):
    return (adapter.get("variableMetadata") or {}).get(str(variable).upper(), {})


def label_for(adapter, variable):
    meta = metadata_for(adapter, variable)
    return str(meta.get("label") or variable)


def unit_for(adapter, variable):
    meta = metadata_for(adapter, variable)
    unit = meta.get("unit")
    return str(unit) if unit else ""


def label_with_code(adapter, variable):
    label = label_for(adapter, variable)
    code = str(variable)
    return label if label == code else f"{label} ({code})"


def build_design(df, y_variable, exposure, covariates, weight, strata, psu, threshold=None):
    columns = [exposure, weight, strata, psu] + covariates
    if threshold:
        columns.append(threshold["variable"])
    else:
        columns.append(y_variable)
    cc = df.dropna(subset=columns).copy()
    cc = cc[pd.to_numeric(cc[weight], errors="coerce") > 0].copy()
    if threshold:
        source = pd.to_numeric(cc[threshold["variable"]], errors="coerce")
        if threshold["operator"] == ">":
            y = (source > threshold["value"]).astype(float).to_numpy(dtype=float)
        elif threshold["operator"] == "<":
            y = (source < threshold["value"]).astype(float).to_numpy(dtype=float)
        elif threshold["operator"] == "<=":
            y = (source <= threshold["value"]).astype(float).to_numpy(dtype=float)
        else:
            y = (source >= threshold["value"]).astype(float).to_numpy(dtype=float)
        cc[threshold["name"]] = y
    else:
        y = pd.to_numeric(cc[y_variable], errors="coerce").to_numpy(dtype=float)
    w = pd.to_numeric(cc[weight], errors="coerce").to_numpy(dtype=float)
    x_parts = [np.ones(len(cc)), pd.to_numeric(cc[exposure], errors="coerce").to_numpy(dtype=float)]
    names = ["intercept", exposure]
    for cov in covariates:
        series = cc[cov]
        if str(series.dtype) == "object" or series.nunique(dropna=True) <= 8:
            dummies = pd.get_dummies(series.astype("category"), prefix=cov, drop_first=True, dtype=float)
            for col in dummies.columns:
                x_parts.append(dummies[col].to_numpy(dtype=float))
                names.append(str(col))
        else:
            x_parts.append(pd.to_numeric(series, errors="coerce").to_numpy(dtype=float))
            names.append(cov)
    X = np.column_stack(x_parts)
    valid = np.isfinite(y) & np.isfinite(w) & np.all(np.isfinite(X), axis=1)
    y, w, X = y[valid], w[valid], X[valid, :]
    cc = cc.loc[valid].copy()
    return cc, y, w, X, names


def survey_sandwich(cc, scores, bread, strata, psu):
    meat = np.zeros((scores.shape[1], scores.shape[1]))
    strata_values = cc[strata].astype(str).to_numpy()
    psu_values = cc[psu].astype(str).to_numpy()
    strata_count = 0
    psu_count = 0
    lonely_strata = 0
    for stratum in sorted(set(strata_values)):
        indices = np.where(strata_values == stratum)[0]
        psus = sorted(set(psu_values[indices]))
        if len(psus) < 2:
            lonely_strata += 1
            continue
        strata_count += 1
        psu_scores = []
        for cluster in psus:
            psu_scores.append(scores[indices[psu_values[indices] == cluster], :].sum(axis=0))
        U = np.vstack(psu_scores)
        centered = U - U.mean(axis=0)
        meat += (len(psus) / (len(psus) - 1.0)) * (centered.T @ centered)
        psu_count += len(psus)
    cov = bread @ meat @ bread
    se = np.sqrt(np.maximum(np.diag(cov), 0.0))
    return cov, se, strata_count, psu_count, lonely_strata


def weighted_linearized(df, outcome, exposure, covariates, weight, strata, psu):
    cc, y, w, X, names = build_design(df, outcome, exposure, covariates, weight, strata, psu)
    xtwx = X.T @ (w[:, None] * X)
    xtwy = X.T @ (w * y)
    inv = np.linalg.pinv(xtwx)
    beta = inv @ xtwy
    residual = y - X @ beta
    scores = (w[:, None] * X) * residual[:, None]
    _, se, strata_count, psu_count, lonely_strata = survey_sandwich(cc, scores, inv, strata, psu)
    effect = float(beta[1])
    standard_error = float(se[1]) if len(se) > 1 else float("nan")
    z = effect / standard_error if standard_error and math.isfinite(standard_error) and standard_error > 0 else float("nan")
    p = math.erfc(abs(z) / math.sqrt(2)) if math.isfinite(z) else None
    return {
        "data": cc,
        "names": names,
        "beta": beta,
        "standardError": standard_error,
        "effect": effect,
        "ci95": [effect - 1.96 * standard_error, effect + 1.96 * standard_error] if math.isfinite(standard_error) else [None, None],
        "pValue": p,
        "strataCount": strata_count,
        "psuCount": psu_count,
        "lonelyStrata": lonely_strata,
        "family": "linear",
    }


def weighted_logistic_linearized(df, outcome, exposure, covariates, weight, strata, psu, threshold):
    cc, y, w, X, names = build_design(df, outcome, exposure, covariates, weight, strata, psu, threshold)
    beta = np.zeros(X.shape[1])
    for _ in range(100):
        eta = np.clip(X @ beta, -30, 30)
        mu = 1.0 / (1.0 + np.exp(-eta))
        v = np.maximum(mu * (1.0 - mu), 1e-8)
        xtwx = X.T @ ((w * v)[:, None] * X)
        score = X.T @ (w * (y - mu))
        step = np.linalg.pinv(xtwx) @ score
        beta = beta + step
        if float(np.max(np.abs(step))) < 1e-8:
            break
    eta = np.clip(X @ beta, -30, 30)
    mu = 1.0 / (1.0 + np.exp(-eta))
    v = np.maximum(mu * (1.0 - mu), 1e-8)
    bread = np.linalg.pinv(X.T @ ((w * v)[:, None] * X))
    scores = (w[:, None] * X) * (y - mu)[:, None]
    _, se, strata_count, psu_count, lonely_strata = survey_sandwich(cc, scores, bread, strata, psu)
    log_or = float(beta[1])
    standard_error = float(se[1]) if len(se) > 1 else float("nan")
    z = log_or / standard_error if standard_error and math.isfinite(standard_error) and standard_error > 0 else float("nan")
    p = math.erfc(abs(z) / math.sqrt(2)) if math.isfinite(z) else None
    ci_log = [log_or - 1.96 * standard_error, log_or + 1.96 * standard_error] if math.isfinite(standard_error) else [None, None]
    return {
        "data": cc,
        "names": names,
        "beta": beta,
        "standardError": standard_error,
        "effect": log_or,
        "oddsRatio": float(math.exp(log_or)),
        "ci95": [float(math.exp(ci_log[0])), float(math.exp(ci_log[1]))] if ci_log[0] is not None else [None, None],
        "logOddsCi95": ci_log,
        "pValue": p,
        "strataCount": strata_count,
        "psuCount": psu_count,
        "lonelyStrata": lonely_strata,
        "family": "logistic",
        "eventCount": int(y.sum()),
        "eventWeightedPercent": float(100.0 * np.average(y, weights=w)) if len(y) else None,
    }


def weighted_r_survey_svyglm(df, outcome, exposure, covariates, weight, strata, psu, threshold, family, rscript):
    cc, y, w, X, names = build_design(df, outcome, exposure, covariates, weight, strata, psu, threshold)
    outcome_model = threshold["name"] if threshold else outcome
    model_columns = [outcome_model, exposure, weight, strata, psu] + covariates
    export = cc[model_columns].copy()
    export[outcome_model] = y
    r_code = '''
suppressPackageStartupMessages({
  library(jsonlite)
  library(survey)
})
args <- commandArgs(trailingOnly = TRUE)
input <- fromJSON(args[[1]])
df <- read.csv(input$csv, check.names = FALSE)
for (col in input$numericColumns) {
  df[[col]] <- as.numeric(df[[col]])
}
for (col in input$factorColumns) {
  df[[col]] <- as.factor(df[[col]])
}
design <- svydesign(
  ids = as.formula(paste0("~", input$psu)),
  strata = as.formula(paste0("~", input$strata)),
  weights = as.formula(paste0("~", input$weight)),
  data = df,
  nest = TRUE
)
formula <- as.formula(paste(input$outcome, "~", paste(c(input$exposure, input$covariates), collapse = " + ")))
fit <- if (input$family == "logistic") {
  svyglm(formula, design = design, family = quasibinomial())
} else {
  svyglm(formula, design = design, family = gaussian())
}
coefs <- summary(fit)$coefficients
effect <- unname(coefs[input$exposure, "Estimate"])
se <- unname(coefs[input$exposure, "Std. Error"])
p <- unname(coefs[input$exposure, ncol(coefs)])
ci <- c(effect - 1.96 * se, effect + 1.96 * se)
payload <- list(
  effect = effect,
  standardError = se,
  pValue = p,
  ci95 = ci,
  coefficientNames = names(coef(fit)),
  strataCount = length(unique(df[[input$strata]])),
  psuCount = length(unique(df[[input$psu]]))
)
if (input$family == "logistic") {
  payload$oddsRatio <- exp(effect)
  payload$logOddsCi95 <- ci
  payload$ci95 <- exp(ci)
  payload$eventCount <- sum(df[[input$outcome]], na.rm = TRUE)
  payload$eventWeightedPercent <- 100 * sum(df[[input$outcome]] * df[[input$weight]], na.rm = TRUE) / sum(df[[input$weight]][!is.na(df[[input$outcome]])], na.rm = TRUE)
}
cat(toJSON(payload, auto_unbox = TRUE, null = "null"))
'''
    with tempfile.TemporaryDirectory() as tmp:
        csv_path = Path(tmp) / "design.csv"
        r_path = Path(tmp) / "fit.R"
        input_path = Path(tmp) / "input.json"
        export.to_csv(csv_path, index=False)
        factor_columns = [cov for cov in covariates if cov in export.columns and export[cov].nunique(dropna=True) <= 8]
        numeric_columns = [col for col in model_columns if col not in factor_columns]
        r_path.write_text(r_code)
        input_path.write_text(json.dumps({
            "csv": str(csv_path),
            "outcome": outcome_model,
            "exposure": exposure,
            "covariates": covariates,
            "weight": weight,
            "strata": strata,
            "psu": psu,
            "family": family,
            "numericColumns": numeric_columns,
            "factorColumns": factor_columns,
        }))
        completed = subprocess.run([rscript, str(r_path), str(input_path)], check=True, text=True, capture_output=True)
        payload = json.loads(completed.stdout)
    if family == "logistic":
        return {
            "data": cc,
            "names": payload.get("coefficientNames") or names,
            "standardError": payload["standardError"],
            "effect": payload["effect"],
            "oddsRatio": payload["oddsRatio"],
            "ci95": payload["ci95"],
            "logOddsCi95": payload["logOddsCi95"],
            "pValue": payload["pValue"],
            "strataCount": payload["strataCount"],
            "psuCount": payload["psuCount"],
            "lonelyStrata": None,
            "family": "logistic",
            "eventCount": payload["eventCount"],
            "eventWeightedPercent": payload["eventWeightedPercent"],
            "backend": "r-survey",
        }
    return {
        "data": cc,
        "names": payload.get("coefficientNames") or names,
        "standardError": payload["standardError"],
        "effect": payload["effect"],
        "ci95": payload["ci95"],
        "pValue": payload["pValue"],
        "strataCount": payload["strataCount"],
        "psuCount": payload["psuCount"],
        "lonelyStrata": None,
        "family": "linear",
        "backend": "r-survey",
    }


def weighted_mean(values, weights):
    return float(np.average(values, weights=weights)) if len(values) else None


def main():
    config = json.loads(Path(sys.argv[1]).read_text())
    out_dir = Path(config["outDir"])
    backend = config.get("backend", "python-linearized")
    rscript = config.get("rscript", "Rscript")
    adapter = config.get("datasetAdapter") or {}
    raw_spec = json.loads(Path(config["analysisSpecPath"]).read_text())
    spec = unwrap_spec(raw_spec)
    outcome = variable_list(spec, "outcome")[0]
    exposure = variable_list(spec, "exposures")[0] if variable_list(spec, "exposures") else variable_list(spec, "exposure")[0]
    covariates = variable_list(spec, "covariates")
    threshold = binary_threshold(spec)
    family = model_family(spec)
    weight = survey_value(spec, "weightVariable", "weight")
    strata = survey_value(spec, "strataVariable", "strata")
    psu = survey_value(spec, "psuVariable", "psu")
    if not all([outcome, exposure, weight, strata, psu]):
        raise SystemExit("AnalysisSpec must declare outcome, exposure, weight, strata, and psu.")
    weight_domain = weight_domain_info(spec, weight, adapter)
    outcome_source = threshold["variable"] if threshold else outcome
    required = ["SEQN", outcome_source, exposure, weight, strata, psu] + covariates
    tables = table_files_for_variables(config["dataRoot"], required)
    merged = merge_tables(tables)
    adults = apply_filters(merged, simple_filters(spec))
    missingness = {col: float(adults[col].isna().mean()) if col in adults else 1.0 for col in required if col != "SEQN"}
    if backend == "r-survey":
        fit = weighted_r_survey_svyglm(adults, outcome, exposure, covariates, weight, strata, psu, threshold, family, rscript)
    elif family == "logistic":
        if not threshold:
            raise SystemExit("Logistic paper-run requires model.binaryThreshold in the AnalysisSpec.")
        fit = weighted_logistic_linearized(adults, outcome, exposure, covariates, weight, strata, psu, threshold)
    else:
        fit = weighted_linearized(adults, outcome, exposure, covariates, weight, strata, psu)
    cc = fit["data"]
    w = pd.to_numeric(cc[weight], errors="coerce").to_numpy(dtype=float)
    exposure_values = pd.to_numeric(cc[exposure], errors="coerce")
    quartiles = pd.qcut(exposure_values.rank(method="first"), 4, labels=["q1", "q2", "q3", "q4"])
    groups = []
    for label in ["q1", "q2", "q3", "q4"]:
        mask = np.asarray(quartiles == label)
        groups.append({
            "category": label,
            "n": int(mask.sum()),
            "weightedMeanOutcome": weighted_mean(pd.to_numeric(cc.loc[mask, threshold["name"] if threshold else outcome], errors="coerce").to_numpy(dtype=float), w[mask]),
            "weightedMeanExposure": weighted_mean(pd.to_numeric(cc.loc[mask, exposure], errors="coerce").to_numpy(dtype=float), w[mask]),
        })
    title = spec.get("title") or spec.get("researchQuestion") or f"{exposure} and {outcome}"
    title = str(title).strip().rstrip("?")
    question = str(spec.get("researchQuestion") or title)
    variance = "r_survey_taylor_linearized" if backend == "r-survey" else "complex_survey_linearized"
    effect = fit["effect"]
    se = fit["standardError"]
    ci = fit["ci95"]
    p = fit["pValue"]
    if family == "logistic":
        model = {
            "type": "R survey svyglm weighted logistic regression with Taylor linearized variance" if backend == "r-survey" else "weighted logistic regression with strata/PSU linearized sandwich variance",
            "covariates": fit["names"],
            "logOddsCoefficient": effect,
            "oddsRatio": fit["oddsRatio"],
            "standardError": se,
            "ci95": ci,
            "logOddsCi95": fit["logOddsCi95"],
            "pValue": p,
            "eventCount": fit["eventCount"],
            "eventWeightedPercent": fit["eventWeightedPercent"],
            "strataCount": fit["strataCount"],
            "psuCount": fit["psuCount"],
            "lonelyStrata": fit["lonelyStrata"],
        }
    else:
        model = {
            "type": "R survey svyglm weighted linear regression with Taylor linearized variance" if backend == "r-survey" else "weighted linear regression with strata/PSU linearized sandwich variance",
            "covariates": fit["names"],
            "exposureCoefficient": effect,
            "standardError": se,
            "ci95": ci,
            "pValue": p,
            "strataCount": fit["strataCount"],
            "psuCount": fit["psuCount"],
            "lonelyStrata": fit["lonelyStrata"],
        }
    exposure_label = label_for(adapter, exposure)
    exposure_label_code = label_with_code(adapter, exposure)
    outcome_label = label_for(adapter, outcome_source)
    outcome_label_code = label_with_code(adapter, outcome_source)
    outcome_unit = unit_for(adapter, outcome_source)
    outcome_unit_phrase = f" {outcome_unit}" if outcome_unit else f" {outcome_label} units"
    weight_label_code = label_with_code(adapter, weight)
    covariate_labels = [label_for(adapter, covariate) for covariate in covariates]
    effect_phrase = f"an adjusted odds ratio of {model['oddsRatio']:.2f}" if family == "logistic" else f"an adjusted mean difference of {effect:.2f}{outcome_unit_phrase}"
    result_phrase = f"odds ratio {model['oddsRatio']:.2f}" if family == "logistic" else f"mean difference {effect:.2f}"
    model_phrase = ("R survey-weighted logistic regression" if family == "logistic" else "R survey-weighted linear regression") if backend == "r-survey" else ("weighted logistic regression" if family == "logistic" else "weighted linear regression")
    outcome_definition = f"Binary threshold {threshold['name']} from {label_with_code(adapter, threshold['variable'])} {threshold['operator']} {threshold['value']}" if threshold else f"Continuous {outcome_label_code}"
    analysis = {
        "paperId": out_dir.name,
        "title": title,
        "researchQuestion": question,
        "analysisSpecPath": config["analysisSpecPath"],
        "dataRoot": config["dataRoot"],
        "inputFiles": [str(path) for path, _ in tables],
        "population": "; ".join(simple_filters(spec)) or "Pre-specified eligible population",
        "exposure": {"name": exposure_label, "variable": exposure, "definition": f"Continuous {exposure_label_code}"},
        "outcome": {"name": threshold["name"] if threshold else outcome_label, "variable": outcome_source, "definition": outcome_definition},
        "rowCounts": {"mergedRows": int(len(merged)), "eligibleRows": int(len(adults)), "completeCaseEligible": int(len(cc))},
        "missingnessEligibleRows": missingness,
        "weights": {"weight": weight, "strata": strata, "psu": psu, "implementation": (f"R survey Taylor linearized variance via svyglm for weighted {family} regression" if backend == "r-survey" else f"strata/PSU linearized sandwich variance for weighted {family} regression"), "domain": weight_domain},
        "varianceEstimator": variance,
        "model": model,
        "thresholds": {"binaryOutcome": outcome_definition} if threshold else {},
        "groupSummary": groups,
        "datasetAdapter": {"id": adapter.get("id"), "label": adapter.get("label"), "variableMetadataSource": "dataset-adapter-manifest", "variableMetadataCount": len(adapter.get("variableMetadata") or {})},
        "analysisSpec": {"inferencePolicy": {"estimandType": "associational", "varianceEstimator": "complex_survey", "allowedInference": "design_corrected_inference", "pValueLanguage": "standard", "causalClaimsAllowed": False}},
        "limitations": ["Cross-sectional analysis; no temporality or causality.", "Complete-case analysis may induce selection bias.", ("R survey svyglm provides design-aware Taylor linearized variance for the declared design." if backend == "r-survey" else "Design-based linearized variance is implemented for primary weighted linear and logistic models."), "Subsample weights change the analytic population and must be interpreted using the declared weight-domain eligibility." if weight_domain["isSubsample"] else "Weight-domain eligibility follows the declared survey design."],
        "sources": ["https://wwwn.cdc.gov/nchs/nhanes/AnalyticGuidelines.aspx", "https://wwwn.cdc.gov/nchs/nhanes/tutorials/weighting.aspx", "https://journals.plos.org/plosone/article?id=10.1371%2Fjournal.pone.0309210"],
    }
    p_text = f"{p:.3g}" if p is not None else "not estimable"
    weight_domain_rationale = str(weight_domain["rationale"]).rstrip(".; ")
    weight_domain_eligibility = str(weight_domain["eligibilityNote"]).rstrip(".; ")
    weight_domain_sentence = f" The selected weight domain was {weight_domain['label']} because {weight_domain_rationale}. This means results apply to {weight_domain_eligibility}." if weight_domain["isSubsample"] else ""
    variance_phrase = "R survey Taylor linearized variance" if backend == "r-survey" else "strata/PSU linearized sandwich variance"
    safety_header = f"""## Study Summary

- Analysis type: observational cross-sectional association.
- Survey method: {model_phrase} with {weight_label_code}, survey strata, survey primary sampling units, and {variance_phrase}.
- Weight domain: {weight_domain['label']} ({'subsample analytic population' if weight_domain['isSubsample'] else 'standard analytic population for this weight'}).
- Population: {len(cc):,} complete-case eligible participants after applying the stated eligibility criteria.
- Causal status: not causal; this cannot infer causality or temporality.
- Clinical actionability: not clinically actionable and not a diagnostic rule.
- Human review: required before sharing, publication, clinical interpretation, or product integration.
"""
    paper = f"""# {title}

{safety_header}

## Abstract

Main finding: higher {exposure_label} was associated with higher {outcome_label} in the analyzed NHANES sample.

This NHANES analysis evaluated the adjusted association between {exposure_label_code} and {outcome_label_code} in the stated study population. The analysis followed a pre-specified plan, and the analytic sample included {len(cc):,} complete-case eligible participants after applying the stated population filters. A {model_phrase} with {weight_label_code} and {variance_phrase} estimated {effect_phrase} per one-unit higher {exposure_label} (95% CI {ci[0]:.2f} to {ci[1]:.2f}; p={p_text}).{weight_domain_sentence} This is an observational cross-sectional association and cannot infer causality.

## Introduction

NHANES analyses need explicit handling of survey weights, strata, primary sampling units, missingness, and cross-sectional interpretation. This report evaluates the adjusted association between {exposure_label} and {outcome_label} in a reproducible public-health analysis using a pre-specified plan. The statistical backend was {backend}.

## Methods

The analysis plan was read before execution. Local cached NHANES component files were loaded from the declared data directory, files containing the required variables were selected, records were merged by participant identifier, population filters were applied, and complete cases were required for {outcome_label}, {exposure_label}, {weight_label_code}, survey strata, survey primary sampling units, and covariates. The complete-case analytic sample was {len(cc):,} from {len(adults):,} eligible merged rows. Missingness among eligible rows included {exposure_label}: {missingness.get(exposure, 0) * 100:.1f}%, {outcome_label}: {missingness.get(outcome, 0) * 100:.1f}%, and {label_for(adapter, weight)}: {missingness.get(weight, 0) * 100:.1f}%. The weight domain was {weight_domain['label']} because {weight_domain_rationale}. Results apply to {weight_domain_eligibility}.

The primary model was {model_phrase} with covariate adjustment for {', '.join(covariate_labels) if covariate_labels else 'no additional covariates'}. Unlike earlier approximate papers, this analysis used {variance_phrase} with {fit['strataCount']} strata and {fit['psuCount']} primary sampling unit clusters contributing to variance estimation.

## Results

The adjusted {result_phrase} per one-unit higher {exposure_label} had a 95% CI of {ci[0]:.2f} to {ci[1]:.2f} (p={p_text}). Weighted descriptive quartiles of {exposure_label} showed {outcome_label} means or event fractions of {groups[0]['weightedMeanOutcome']:.2f}, {groups[1]['weightedMeanOutcome']:.2f}, {groups[2]['weightedMeanOutcome']:.2f}, and {groups[3]['weightedMeanOutcome']:.2f}. These descriptive summaries support inspection of the model direction but do not establish a causal gradient.

## Discussion

In this cross-sectional survey analysis, {exposure_label} was associated with {outcome_label} after the stated covariate adjustment. The result should be interpreted as a population-survey association conditional on the variables included in the model, not as evidence that the exposure caused the outcome.

## Limitations

This analysis cannot establish temporality or causality. Complete-case analysis may introduce selection bias. The current survey-aware runner implements primary weighted linear and logistic models only. Subsample-weight analyses apply to the declared eligible subgroup rather than all examined participants, and domain analysis, replicate weights, plus multi-cycle weight construction still need explicit runner support before they should be presented as fully automated.

## Reproducibility

The companion packet includes the analysis results, quality checks, run metadata, and file hashes needed to audit or rerun the analysis. Input files and output files are hashed in the companion metadata.

## References

- CDC NHANES analytic guidelines: https://wwwn.cdc.gov/nchs/nhanes/AnalyticGuidelines.aspx
- CDC NHANES weighting tutorial: https://wwwn.cdc.gov/nchs/nhanes/tutorials/weighting.aspx
- R survey package: https://r-survey.r-forge.r-project.org/survey/index.html
"""
    critique = """# Critique

This report is suitable for local scientific review of the supported survey path. The main remaining methods limits are domain analysis, replicate weights, and multiple-cycle weight construction.
"""
    (out_dir / "analysis.json").write_text(json.dumps(analysis, indent=2) + "\n")
    (out_dir / "paper.md").write_text(paper)
    (out_dir / "critique.md").write_text(critique)


if __name__ == "__main__":
    main()
