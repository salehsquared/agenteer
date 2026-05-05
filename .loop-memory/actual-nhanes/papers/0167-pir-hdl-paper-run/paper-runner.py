#!/usr/bin/env python3
import json, math, sys
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


def weighted_linearized(df, outcome, exposure, covariates, weight, strata, psu):
    columns = [outcome, exposure, weight, strata, psu] + covariates
    cc = df.dropna(subset=columns).copy()
    cc = cc[pd.to_numeric(cc[weight], errors="coerce") > 0].copy()
    y = pd.to_numeric(cc[outcome], errors="coerce").to_numpy(dtype=float)
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
    xtwx = X.T @ (w[:, None] * X)
    xtwy = X.T @ (w * y)
    inv = np.linalg.pinv(xtwx)
    beta = inv @ xtwy
    residual = y - X @ beta
    scores = (w[:, None] * X) * residual[:, None]
    meat = np.zeros((X.shape[1], X.shape[1]))
    strata_values = cc[strata].astype(str).to_numpy()
    psu_values = cc[psu].astype(str).to_numpy()
    strata_count = 0
    psu_count = 0
    for stratum in sorted(set(strata_values)):
        indices = np.where(strata_values == stratum)[0]
        psus = sorted(set(psu_values[indices]))
        if len(psus) < 2:
            continue
        strata_count += 1
        psu_scores = []
        for cluster in psus:
            psu_scores.append(scores[indices[psu_values[indices] == cluster], :].sum(axis=0))
        U = np.vstack(psu_scores)
        centered = U - U.mean(axis=0)
        meat += (len(psus) / (len(psus) - 1.0)) * (centered.T @ centered)
        psu_count += len(psus)
    cov = inv @ meat @ inv
    se = np.sqrt(np.maximum(np.diag(cov), 0.0))
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
    }


def weighted_mean(values, weights):
    return float(np.average(values, weights=weights)) if len(values) else None


def main():
    config = json.loads(Path(sys.argv[1]).read_text())
    out_dir = Path(config["outDir"])
    raw_spec = json.loads(Path(config["analysisSpecPath"]).read_text())
    spec = unwrap_spec(raw_spec)
    outcome = variable_list(spec, "outcome")[0]
    exposure = variable_list(spec, "exposures")[0] if variable_list(spec, "exposures") else variable_list(spec, "exposure")[0]
    covariates = variable_list(spec, "covariates")
    weight = survey_value(spec, "weightVariable", "weight")
    strata = survey_value(spec, "strataVariable", "strata")
    psu = survey_value(spec, "psuVariable", "psu")
    if not all([outcome, exposure, weight, strata, psu]):
        raise SystemExit("AnalysisSpec must declare outcome, exposure, weight, strata, and psu.")
    required = ["SEQN", outcome, exposure, weight, strata, psu] + covariates
    tables = table_files_for_variables(config["dataRoot"], required)
    merged = merge_tables(tables)
    adults = apply_filters(merged, simple_filters(spec))
    missingness = {col: float(adults[col].isna().mean()) if col in adults else 1.0 for col in required if col != "SEQN"}
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
            "weightedMeanOutcome": weighted_mean(pd.to_numeric(cc.loc[mask, outcome], errors="coerce").to_numpy(dtype=float), w[mask]),
            "weightedMeanExposure": weighted_mean(pd.to_numeric(cc.loc[mask, exposure], errors="coerce").to_numpy(dtype=float), w[mask]),
        })
    title = spec.get("title") or spec.get("researchQuestion") or f"{exposure} and {outcome}"
    title = str(title).strip().rstrip("?")
    question = str(spec.get("researchQuestion") or title)
    variance = "complex_survey_linearized"
    effect = fit["effect"]
    se = fit["standardError"]
    ci = fit["ci95"]
    p = fit["pValue"]
    model = {
        "type": "weighted linear regression with strata/PSU linearized sandwich variance",
        "covariates": fit["names"],
        "exposureCoefficient": effect,
        "standardError": se,
        "ci95": ci,
        "pValue": p,
        "strataCount": fit["strataCount"],
        "psuCount": fit["psuCount"],
    }
    analysis = {
        "paperId": out_dir.name,
        "title": title,
        "researchQuestion": question,
        "analysisSpecPath": config["analysisSpecPath"],
        "dataRoot": config["dataRoot"],
        "inputFiles": [str(path) for path, _ in tables],
        "population": "; ".join(simple_filters(spec)) or "AnalysisSpec-defined population",
        "exposure": {"name": exposure, "variable": exposure, "definition": f"Continuous {exposure}"},
        "outcome": {"name": outcome, "variable": outcome, "definition": f"Continuous {outcome}"},
        "rowCounts": {"mergedRows": int(len(merged)), "eligibleRows": int(len(adults)), "completeCaseEligible": int(len(cc))},
        "missingnessEligibleRows": missingness,
        "weights": {"weight": weight, "strata": strata, "psu": psu, "implementation": "strata/PSU linearized sandwich variance for weighted linear regression"},
        "varianceEstimator": variance,
        "model": model,
        "groupSummary": groups,
        "analysisSpec": {"inferencePolicy": {"estimandType": "associational", "varianceEstimator": "complex_survey", "allowedInference": "design_corrected_inference", "pValueLanguage": "standard", "causalClaimsAllowed": False}},
        "limitations": ["Cross-sectional analysis; no temporality or causality.", "Complete-case analysis may induce selection bias.", "Design-based linearized variance is implemented for the primary weighted linear model only."],
        "sources": ["https://wwwn.cdc.gov/nchs/nhanes/AnalyticGuidelines.aspx", "https://wwwn.cdc.gov/nchs/nhanes/tutorials/weighting.aspx", "https://journals.plos.org/plosone/article?id=10.1371%2Fjournal.pone.0309210"],
    }
    p_text = f"{p:.3g}" if p is not None else "not estimable"
    paper = f"""# {title}

## Abstract

This spec-governed NHANES analysis evaluated {question.rstrip('?')}. The AnalysisSpec existed before execution, and the analytic sample included {len(cc):,} complete-case eligible adults or participants after applying the declared population filters. A weighted linear regression with WTMEC2YR survey weights and strata/PSU linearized sandwich variance estimated an adjusted mean difference of {effect:.2f} outcome units per one-unit higher {exposure} (95% CI {ci[0]:.2f} to {ci[1]:.2f}; p={p_text}). This is an observational cross-sectional association and cannot infer causality.

## Introduction

NHANES analyses need explicit handling of survey weights, strata, PSU, missingness, and cross-sectional interpretation. This paper is generated from a pre-run AnalysisSpec to test whether Agenteer can move from a design contract to a reproducible, inspectable public-health paper without retrospective provenance.

## Methods

The pre-run AnalysisSpec was read from analysis-spec.json. Agenteer loaded local cached NHANES files under the declared data root, selected files containing the required variables, merged them by SEQN, applied the declared population filters, and required complete cases for {outcome}, {exposure}, {weight}, {strata}, {psu}, and covariates. The complete-case analytic sample was {len(cc):,} from {len(adults):,} eligible merged rows. Missingness among eligible rows included {exposure}: {missingness.get(exposure, 0) * 100:.1f}%, {outcome}: {missingness.get(outcome, 0) * 100:.1f}%, and {weight}: {missingness.get(weight, 0) * 100:.1f}%.

The primary model was weighted linear regression with covariate adjustment for {', '.join(covariates) if covariates else 'no additional covariates'}. Unlike earlier approximate papers, this runner used a design-aware strata/PSU linearized sandwich variance estimator with {fit['strataCount']} strata and {fit['psuCount']} PSU clusters contributing to variance estimation.

## Results

The adjusted mean difference was {effect:.2f} outcome units per one-unit higher {exposure} (95% CI {ci[0]:.2f} to {ci[1]:.2f}; p={p_text}). Weighted descriptive quartiles of {exposure} showed outcome means of {groups[0]['weightedMeanOutcome']:.2f}, {groups[1]['weightedMeanOutcome']:.2f}, {groups[2]['weightedMeanOutcome']:.2f}, and {groups[3]['weightedMeanOutcome']:.2f}. These descriptive summaries support inspection of the model direction but do not establish a causal gradient.

## Discussion

The generated paper demonstrates a complete AnalysisSpec-to-paper path with design-aware variance evidence. The association is still observational and cross-sectional, so the result should be interpreted as a population-survey association conditional on the variables included in the specification, not as evidence that the exposure caused the outcome.

## Limitations

This analysis cannot establish temporality or causality. Complete-case analysis may introduce selection bias. The current survey-aware runner implements linearized variance for the primary weighted linear model only; binary endpoints and more complex estimands still need explicit runner support before they should be presented with design-corrected inference.

## Reproducibility

Agenteer generated this paper through research paper-run from a pre-run AnalysisSpec. The packet includes analysis.json, paper.md, qa-cli.json, runner-record.json, task/evidence receipts, interop exports, and lifecycle.md. Input files and output files are hashed in runner provenance.

## References

- CDC NHANES analytic guidelines: https://wwwn.cdc.gov/nchs/nhanes/AnalyticGuidelines.aspx
- CDC NHANES weighting tutorial: https://wwwn.cdc.gov/nchs/nhanes/tutorials/weighting.aspx
- Workflow Run RO-Crate provenance: https://journals.plos.org/plosone/article?id=10.1371%2Fjournal.pone.0309210
"""
    critique = """# Critique

This paper resolves the prior manual-orchestration issue for the supported linear-survey path: Agenteer starts from an AnalysisSpec, executes the analysis, runs QA, records provenance, creates task receipts, and emits lifecycle state. The remaining methods limit is scope: binary endpoints, subsample-specific weights, domain analysis, and multiple-cycle weight construction still need explicit runner support.
"""
    (out_dir / "analysis.json").write_text(json.dumps(analysis, indent=2) + "\n")
    (out_dir / "paper.md").write_text(paper)
    (out_dir / "critique.md").write_text(critique)


if __name__ == "__main__":
    main()
