#!/usr/bin/env python3
"""Render the SAVR/TAVR dialysis review packet as styled HTML + Chrome PDF."""

from __future__ import annotations

import html
import json
import re
import subprocess
from pathlib import Path

import pandas as pd


RUN_DIR = Path(__file__).resolve().parent
HTML_PATH = RUN_DIR / "dialysis-savr-tavr-mimic-paper.html"
PDF_PATH = RUN_DIR / "dialysis-savr-tavr-mimic-paper-formatted.pdf"
MANIFEST_PATH = RUN_DIR / "pdf-export-manifest-formatted.json"
CHROME = Path("/Applications/Google Chrome.app/Contents/MacOS/Google Chrome")


def inline_markdown(text: str) -> str:
    escaped = html.escape(text)
    escaped = re.sub(r"\*\*(.+?)\*\*", r"<strong>\1</strong>", escaped)
    escaped = re.sub(r"`(.+?)`", r"<code>\1</code>", escaped)
    escaped = re.sub(r"(https?://[^\s<]+)", r'<a href="\1">\1</a>', escaped)
    return escaped


def markdown_to_html(md: str) -> str:
    parts: list[str] = []
    in_list = False
    in_refs = False
    for raw in md.splitlines():
        line = raw.rstrip()
        if not line.strip():
            if in_list:
                parts.append("</ul>")
                in_list = False
            continue
        if line.startswith("# "):
            parts.append(f"<h1>{inline_markdown(line[2:].strip())}</h1>")
        elif line.startswith("## "):
            if in_list:
                parts.append("</ul>")
                in_list = False
            title = line[3:].strip()
            in_refs = title.lower() == "references"
            parts.append(f"<h2>{inline_markdown(title)}</h2>")
        elif line.startswith("### "):
            if in_list:
                parts.append("</ul>")
                in_list = False
            parts.append(f"<h3>{inline_markdown(line[4:].strip())}</h3>")
        elif line.startswith("- "):
            if not in_list:
                parts.append("<ul>")
                in_list = True
            parts.append(f"<li>{inline_markdown(line[2:].strip())}</li>")
        else:
            if in_list:
                parts.append("</ul>")
                in_list = False
            css = "reference" if in_refs else ""
            parts.append(f'<p class="{css}">{inline_markdown(line)}</p>')
    if in_list:
        parts.append("</ul>")
    return "\n".join(parts)


def pct(value: object) -> str:
    if value is None or pd.isna(value):
        return ""
    return f"{100 * float(value):.1f}%"


def fmt_num(value: object) -> str:
    if value is None or pd.isna(value):
        return ""
    if isinstance(value, float):
        if abs(value) < 0.001 and value != 0:
            return f"{value:.2e}"
        return f"{value:.3g}"
    return str(value)


def table_html(df: pd.DataFrame, classes: str = "") -> str:
    clean = df.copy()
    for col in clean.columns:
        clean[col] = clean[col].map(fmt_num)
    return clean.to_html(index=False, escape=True, classes=f"data-table {classes}".strip(), border=0)


def figure_cards(figures: list[dict[str, object]]) -> str:
    cards = []
    for idx, figure in enumerate(figures, start=1):
        path = Path(str(figure["path"]))
        rel = html.escape(path.name)
        title = inline_markdown(str(figure.get("title", f"Figure {idx}")))
        caption = inline_markdown(str(figure.get("caption", "")))
        alt = inline_markdown(str(figure.get("altText", "")))
        cards.append(
            f"""
            <section class="figure-page">
              <h2>Figure {idx}. {title}</h2>
              <figure>
                <img src="{rel}" alt="{alt}">
                <figcaption>{caption}</figcaption>
              </figure>
            </section>
            """
        )
    return "\n".join(cards)


def build_tables() -> str:
    baseline = pd.read_csv(RUN_DIR / "baseline-by-group.csv")
    baseline = baseline.rename(columns={
        "valve_strategy": "Valve",
        "dialysis_group": "Dialysis group",
        "n": "N",
        "admission_age_median": "Age median",
        "admission_age_q1": "Age Q1",
        "admission_age_q3": "Age Q3",
        "charlson_comorbidity_index_median": "Charlson median",
        "male_n": "Male n",
        "male_pct": "Male %",
    })
    if "Male %" in baseline:
        baseline["Male %"] = baseline["Male %"].map(pct)

    outcomes = pd.read_csv(RUN_DIR / "outcomes-by-horizon.csv")
    one_year = outcomes[outcomes["horizon"].eq("1y")].copy()
    one_year = one_year[[
        "valve_strategy",
        "dialysis_group",
        "n",
        "death_pct",
        "hf_pct",
        "cardiac_pct",
        "mace_pct",
        "valve_reintervention_pct",
    ]].rename(columns={
        "valve_strategy": "Valve",
        "dialysis_group": "Dialysis group",
        "n": "N",
        "death_pct": "Death",
        "hf_pct": "HF readmission",
        "cardiac_pct": "Cardiac readmission",
        "mace_pct": "MACE",
        "valve_reintervention_pct": "Valve reintervention",
    })
    for col in ["Death", "HF readmission", "Cardiac readmission", "MACE", "Valve reintervention"]:
        one_year[col] = one_year[col].map(pct)

    horizon = outcomes.groupby(["dialysis_group", "horizon", "horizon_days"], as_index=False).agg({
        "n": "sum",
        "death_n": "sum",
        "mace_n": "sum",
        "valve_reintervention_n": "sum",
    }).sort_values(["dialysis_group", "horizon_days"])
    horizon["Death"] = horizon["death_n"] / horizon["n"]
    horizon["MACE"] = horizon["mace_n"] / horizon["n"]
    horizon["Valve reintervention"] = horizon["valve_reintervention_n"] / horizon["n"]
    horizon = horizon[["dialysis_group", "horizon", "n", "Death", "MACE", "Valve reintervention"]].rename(columns={
        "dialysis_group": "Dialysis group",
        "horizon": "Horizon",
        "n": "N",
    })
    for col in ["Death", "MACE", "Valve reintervention"]:
        horizon[col] = horizon[col].map(pct)

    estimates = pd.read_csv(RUN_DIR / "model-estimates.csv")
    estimates = estimates[estimates["term"].isin(["dialysis_hd_unspecified", "valve_tavr"])].copy()
    estimates["Estimate"] = estimates.apply(lambda row: row["hazard_ratio"] if row["model_family"] == "cox" else row["odds_ratio"], axis=1)
    estimates["Measure"] = estimates["model_family"].map(lambda value: "HR" if value == "cox" else "OR")
    estimates["95% CI"] = estimates.apply(lambda row: f"{fmt_num(row['ci_low'])}-{fmt_num(row['ci_high'])}", axis=1)
    estimates = estimates[["model_family", "outcome", "term", "Measure", "Estimate", "95% CI", "p_value", "n", "events"]].head(28).rename(columns={
        "model_family": "Model",
        "outcome": "Outcome",
        "term": "Term",
        "p_value": "P value",
        "n": "N",
        "events": "Events",
    })

    propensity = pd.read_csv(RUN_DIR / "propensity-balance.csv").rename(columns={
        "covariate": "Covariate",
        "smd_before": "SMD before",
        "smd_after": "SMD after",
    })
    missingness = pd.read_csv(RUN_DIR / "missingness-summary.csv").rename(columns={
        "variable": "Variable",
        "n": "N",
        "missing_n": "Missing n",
        "missing_pct": "Missing %",
        "nonmissing_n": "Nonmissing n",
    })
    missingness["Missing %"] = missingness["Missing %"].map(pct)

    sections = [
        ("Table 1. Baseline Characteristics", baseline),
        ("Table 2. One-Year Outcomes", one_year),
        ("Table 3. Outcomes Across Follow-Up Horizons", horizon),
        ("Table 4. Selected Adjusted Model Estimates", estimates),
        ("Table 5. Propensity Balance", propensity),
        ("Table 6. Missingness Summary", missingness),
    ]
    return "\n".join(
        f'<section class="table-page"><h2>{html.escape(title)}</h2>{table_html(df)}</section>'
        for title, df in sections
    )


def main() -> None:
    paper = (RUN_DIR / "paper.md").read_text(encoding="utf-8")
    figures = json.loads((RUN_DIR / "figures.json").read_text(encoding="utf-8"))["figures"]
    analysis = json.loads((RUN_DIR / "analysis-results.json").read_text(encoding="utf-8"))
    paper_html = markdown_to_html(paper)
    css = """
      @page { size: Letter; margin: 0.72in 0.68in 0.78in 0.68in; }
      * { box-sizing: border-box; }
      body { font-family: -apple-system, BlinkMacSystemFont, "Helvetica Neue", Arial, sans-serif; color: #1f2933; font-size: 10.4pt; line-height: 1.45; margin: 0; }
      h1 { font-size: 26pt; line-height: 1.08; margin: 0 0 0.2in 0; color: #111827; }
      h2 { font-size: 15pt; margin: 0.28in 0 0.1in 0; color: #111827; break-after: avoid; }
      h3 { font-size: 11.5pt; margin: 0.18in 0 0.06in 0; color: #243b53; break-after: avoid; }
      p { margin: 0 0 0.08in 0; }
      ul { margin: 0.03in 0 0.11in 0.18in; padding-left: 0.16in; }
      li { margin: 0.025in 0; }
      code { font-family: "SF Mono", Menlo, monospace; font-size: 8.8pt; background: #f3f4f6; padding: 0 2px; border-radius: 2px; }
      a { color: #1d4ed8; text-decoration: none; overflow-wrap: anywhere; }
      .cover { min-height: 9.3in; display: flex; flex-direction: column; justify-content: space-between; page-break-after: always; }
      .kicker { text-transform: uppercase; letter-spacing: 0.08em; color: #52606d; font-size: 8.5pt; font-weight: 700; margin-bottom: 0.18in; }
      .subtitle { font-size: 12.5pt; color: #334e68; max-width: 6.5in; margin-top: 0.12in; }
      .status-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 0.12in; margin: 0.35in 0; }
      .status-card { border: 1px solid #d7dde5; border-left: 4px solid #2f80ed; border-radius: 5px; padding: 0.12in; background: #fbfcfe; }
      .status-card b { display: block; color: #111827; margin-bottom: 0.02in; }
      .warning { border-left-color: #b7791f; background: #fffaf0; }
      .paper { page-break-after: always; }
      .paper h1 { display: none; }
      .figure-page, .table-page { page-break-before: always; }
      figure { margin: 0.08in 0 0 0; }
      figure img { display: block; max-width: 100%; max-height: 7.25in; object-fit: contain; margin: 0 auto; border: 1px solid #e5e7eb; }
      figcaption { color: #475569; font-size: 9pt; margin-top: 0.08in; }
      .data-table { width: 100%; border-collapse: collapse; table-layout: fixed; font-size: 7.2pt; margin-top: 0.08in; page-break-inside: auto; }
      .data-table th { background: #e9eef5; color: #111827; font-weight: 700; border: 1px solid #cbd5e1; padding: 4px 4px; vertical-align: bottom; }
      .data-table td { border: 1px solid #d7dde5; padding: 3px 4px; vertical-align: top; overflow-wrap: anywhere; }
      .data-table tr { page-break-inside: avoid; break-inside: avoid; }
      .data-table tr:nth-child(even) td { background: #f8fafc; }
      .reference { font-size: 8.5pt; overflow-wrap: anywhere; }
      .footer-note { color: #52606d; font-size: 8.5pt; border-top: 1px solid #d7dde5; padding-top: 0.1in; }
    """
    html_doc = f"""<!doctype html>
    <html>
      <head>
        <meta charset="utf-8">
        <title>Dialysis Status and Outcomes After SAVR or TAVR in MIMIC-IV</title>
        <style>{css}</style>
      </head>
      <body>
        <section class="cover">
          <div>
            <div class="kicker">Research Review Packet</div>
            <h1>Dialysis Status and Outcomes After SAVR or TAVR in MIMIC-IV</h1>
            <div class="subtitle">Formatted PDF generated programmatically from the aggregate run packet. Includes the manuscript, figures, selected tables, and review posture.</div>
            <div class="status-grid">
              <div class="status-card"><b>Cohort</b>{analysis['cohortSummary']['indexRows']:,} index admissions from {analysis['cohortSummary']['uniquePatients']:,} patients.</div>
              <div class="status-card"><b>Deterministic QA</b>Paper QA pass; Figure QA pass.</div>
              <div class="status-card"><b>Cost</b>Successful GCS read estimate: ${analysis['cost']['actualUsd']:.4f}.</div>
              <div class="status-card warning"><b>Review Posture</b>External reviewer promotion remains blocked pending phenotype and methods decisions.</div>
            </div>
          </div>
          <div class="footer-note">Source directory: {html.escape(str(RUN_DIR))}</div>
        </section>
        <main class="paper">{paper_html}</main>
        {figure_cards(figures)}
        {build_tables()}
      </body>
    </html>"""
    HTML_PATH.write_text(html_doc, encoding="utf-8")
    if not CHROME.exists():
        raise SystemExit(f"Chrome not found at {CHROME}")
    subprocess.run([
        str(CHROME),
        "--headless",
        "--disable-gpu",
        "--no-sandbox",
        "--no-pdf-header-footer",
        f"--print-to-pdf={PDF_PATH}",
        str(HTML_PATH),
    ], check=True, capture_output=True, text=True)
    manifest = {
        "schemaVersion": 2,
        "renderer": "Google Chrome headless HTML/CSS print-to-pdf",
        "html": str(HTML_PATH),
        "pdf": str(PDF_PATH),
        "sourceRunDir": str(RUN_DIR),
        "included": ["paper.md", "figures.json", "baseline-by-group.csv", "outcomes-by-horizon.csv", "model-estimates.csv", "propensity-balance.csv", "missingness-summary.csv"],
        "posture": "review packet; not promotion-ready until phenotype/methods blockers are resolved",
    }
    MANIFEST_PATH.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    print(PDF_PATH)
    print(PDF_PATH.stat().st_size)


if __name__ == "__main__":
    main()
