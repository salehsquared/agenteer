#!/usr/bin/env python3
"""Generate 20 local papers and review each with two DeepSeek v4 Pro reviewers."""

from __future__ import annotations

import asyncio
import json
import subprocess
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
NODE = "node"
CLI = ROOT / "packages/cli/dist/bin/agenteer.js"
DATA = ROOT / ".loop-memory/stats-method-validation-20260509/validation-data.csv"
OUT = ROOT / ".loop-memory/deepseek-reviewed-papers-20260509"
ENV_FILE = "/Users/saleh/env_file"


STUDIES = [
    ("01-descriptive-clinical-profile", "table-one-descriptive-summary", "What are the distributions of age, severity, BMI, albumin, and continuous outcome?", ["--method", "descriptive", "--variable", "age", "--variable", "severity", "--variable", "bmi", "--variable", "albumin", "--variable", "outcome_cont"]),
    ("02-welch-treatment-continuous", "welch-t-test", "Does the continuous outcome differ by treatment group using Welch's t-test?", ["--method", "welch-t-test", "--outcome", "outcome_cont", "--group", "treatment"]),
    ("03-mann-whitney-treatment-continuous", "mann-whitney-u", "Does the continuous outcome differ by treatment group using a rank-based test?", ["--method", "mann-whitney", "--outcome", "outcome_cont", "--group", "treatment"]),
    ("04-anova-group-continuous", "one-way-anova", "Does the continuous outcome differ across clinical groups?", ["--method", "anova", "--outcome", "outcome_cont", "--group", "group"]),
    ("05-ancova-group-continuous", "ancova", "Does the continuous outcome differ across groups after age and severity adjustment?", ["--method", "ancova", "--outcome", "outcome_cont", "--group", "group", "--covariate", "age", "--covariate", "severity"]),
    ("06-chi-square-treatment-outcome", "chi-square-independence", "Is binary outcome frequency associated with treatment group?", ["--method", "chi-square", "--outcome", "outcome_binary", "--exposure", "treatment"]),
    ("07-fisher-treatment-outcome", "fisher-exact-test", "Is binary outcome frequency associated with treatment group using exact testing?", ["--method", "fisher-exact", "--outcome", "outcome_binary", "--exposure", "treatment"]),
    ("08-pearson-severity-continuous", "pearson-correlation", "How strongly is severity linearly associated with the continuous outcome?", ["--method", "pearson", "--outcome", "outcome_cont", "--exposure", "severity"]),
    ("09-partial-correlation-severity", "partial-correlation", "How strongly is severity associated with the continuous outcome after age and treatment adjustment?", ["--method", "partial-correlation", "--outcome", "outcome_cont", "--exposure", "severity", "--covariate", "age", "--covariate", "treatment"]),
    ("10-linear-regression-severity", "multiple-linear-regression", "How is severity associated with the continuous outcome after adjustment?", ["--method", "linear-regression", "--outcome", "outcome_cont", "--exposure", "severity", "--covariate", "age", "--covariate", "treatment"]),
    ("11-logistic-regression-treatment", "binary-logistic-regression", "How is treatment associated with the binary outcome after adjustment?", ["--method", "logistic-regression", "--outcome", "outcome_binary", "--exposure", "treatment", "--covariate", "age", "--covariate", "severity", "--covariate", "albumin"]),
    ("12-poisson-count-events", "poisson-regression", "How is treatment associated with count-event burden after adjustment?", ["--method", "poisson-regression", "--outcome", "count_events", "--exposure", "treatment", "--covariate", "age", "--covariate", "severity"]),
    ("13-negative-binomial-count-events", "negative-binomial-regression", "How is treatment associated with overdispersed count-event burden after adjustment?", ["--method", "negative-binomial-regression", "--outcome", "count_events", "--exposure", "treatment", "--covariate", "age", "--covariate", "severity"]),
    ("14-quantile-continuous-outcome", "quantile-regression", "How is treatment associated with the median continuous outcome after adjustment?", ["--method", "quantile-regression", "--outcome", "outcome_cont", "--exposure", "treatment", "--covariate", "age", "--covariate", "severity"]),
    ("15-kaplan-meier-treatment", "kaplan-meier-log-rank", "How does event-free survival differ by treatment group?", ["--method", "kaplan-meier", "--time", "survival_time", "--event", "event", "--group", "treatment"]),
    ("16-cox-treatment-survival", "cox-proportional-hazards", "How is treatment associated with time-to-event outcome after adjustment?", ["--method", "cox-proportional-hazards", "--time", "survival_time", "--event", "event", "--group", "treatment", "--covariate", "age", "--covariate", "severity"]),
    ("17-cif-competing-risk", "aalen-johansen-cumulative-incidence", "How does cumulative incidence of the target event differ by treatment when competing events are present?", ["--method", "aalen-johansen-cif", "--time", "survival_time", "--event", "competing_event", "--group", "treatment"]),
    ("18-propensity-matching-treatment", "propensity-score-matching", "What is the matched treated-control contrast for treatment and binary outcome?", ["--method", "propensity-score-matching", "--outcome", "outcome_binary", "--exposure", "treatment", "--covariate", "age", "--covariate", "severity", "--covariate", "albumin", "--exact-covariate", "sex", "--caliper", "0.4"]),
    ("19-pca-scale-structure", "principal-component-analysis", "What latent component structure is suggested by correlated scale items and severity?", ["--method", "pca", "--variable", "scale_item_1", "--variable", "scale_item_2", "--variable", "scale_item_3", "--variable", "severity"]),
    ("20-prediction-risk-score", "prediction-performance-evaluation", "How well does the risk score discriminate the binary outcome?", ["--method", "prediction-evaluation", "--outcome", "outcome_binary", "--exposure", "pred_score"]),
]


def run(cmd: list[str], cwd: Path = ROOT, allow_fail: bool = False) -> subprocess.CompletedProcess[str]:
    result = subprocess.run(cmd, cwd=cwd, text=True, capture_output=True)
    if result.returncode and not allow_fail:
        raise RuntimeError(f"Command failed ({result.returncode}): {' '.join(cmd)}\nSTDOUT:\n{result.stdout}\nSTDERR:\n{result.stderr}")
    return result


def write_context(run_dir: Path, question: str) -> None:
    (run_dir / "reviewer-context.md").write_text(
        "\n".join([
            "# Reviewer Context",
            "",
            f"Research question: {question}",
            "",
            "Dataset: synthetic-but-realistic tabular validation data used to exercise Agenteer's statistical runner.",
            "Purpose: dogfood the research pipeline, manuscript generation, deterministic QA, figure QA, and external model-review gates.",
            "Review expectation: critique the study as a local-review research packet, not as a deployment-ready clinical tool.",
            "Required reviewer attention: method appropriateness, missingness, sparse cells, uncertainty, figure usefulness, result reporting, and whether the manuscript matches the machine-readable stats artifacts.",
            "Known boundary: these are validation studies over a local table; external validity and causal interpretation require additional design evidence.",
            "",
        ]),
        encoding="utf-8",
    )


def write_method_selection(run_dir: Path, study_id: str, question: str, method_id: str) -> Path:
    selection = {
        "schemaVersion": 1,
        "methodSelection": {
            "schemaVersion": 1,
            "selectionId": f"method_selection_{study_id.replace('-', '_')}",
            "request": {
                "question": question,
                "dataStructures": ["single_table"],
                "surveyDesign": False,
                "maxCandidates": 1,
            },
            "primary": {
                "method": {
                    "schemaVersion": 1,
                    "id": method_id,
                    "label": method_id.replace("-", " "),
                    "implementationStatus": "implemented",
                },
                "score": 1,
                "rank": 1,
                "fitReasons": ["Manually bound for DeepSeek reviewer dogfood batch."],
                "cautions": [],
            },
            "alternatives": [],
            "rejected": [],
            "nextAction": "Run the bound stats method and review manuscript quality.",
        },
    }
    path = run_dir / "method-selection.json"
    path.write_text(json.dumps(selection, indent=2) + "\n", encoding="utf-8")
    return path


async def review_one(study_id: str, run_dir: Path, sem: asyncio.Semaphore) -> dict:
    async with sem:
        cmd = [
            NODE, str(CLI), "research", "study-critic",
            "--run-dir", str(run_dir),
            "--panel", "deepseek-dual",
            "--stage", "final",
            "--autonomy", "aggressive",
            "--env-file", ENV_FILE,
            "--max-per-call-usd", "0.12",
            "--max-panel-usd", "0.30",
            "--max-prompt-chars", "12000",
            "--max-artifact-bytes", "60000",
            "--json",
        ]
        proc = await asyncio.create_subprocess_exec(*cmd, cwd=ROOT, stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE)
        stdout, stderr = await proc.communicate()
        (run_dir / "deepseek-review.stdout").write_bytes(stdout)
        (run_dir / "deepseek-review.stderr").write_bytes(stderr)
        return {
            "studyId": study_id,
            "returnCode": proc.returncode,
            "reviewPanel": str(run_dir / "review/review-panel.json"),
            "adjudication": str(run_dir / "review/review-adjudication.json"),
            "response": str(run_dir / "review/review-response.json"),
        }


def summarize_review(run_dir: Path) -> dict:
    panel_path = run_dir / "review/review-panel.json"
    adj_path = run_dir / "review/review-adjudication.json"
    panel = json.loads(panel_path.read_text(encoding="utf-8"))["reviewPanel"] if panel_path.exists() else {}
    adjudication = json.loads(adj_path.read_text(encoding="utf-8"))["reviewAdjudication"] if adj_path.exists() else {}
    reviewers = panel.get("reviewers", [])
    return {
        "panelStatus": panel.get("status"),
        "verdict": adjudication.get("verdict"),
        "reentryPoint": adjudication.get("reentryPoint"),
        "reviewersSucceeded": sum(1 for item in reviewers if item.get("status") == "succeeded"),
        "reviewersFailed": sum(1 for item in reviewers if item.get("status") == "failed"),
        "acceptedFindings": len(adjudication.get("acceptedFindings", [])),
        "topFindings": [item.get("title") for item in adjudication.get("acceptedFindings", [])[:3]],
        "estimatedUsd": panel.get("costEstimateUsd"),
    }


async def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    index = {"schemaVersion": 1, "dataPath": str(DATA), "studies": []}
    review_sem = asyncio.Semaphore(3)
    review_tasks = []
    for number, (study_id, method_id, question, args) in enumerate(STUDIES, start=1):
        run_dir = OUT / "papers" / study_id
        run_dir.mkdir(parents=True, exist_ok=True)
        write_context(run_dir, question)
        method_selection = write_method_selection(run_dir, study_id, question, method_id)
        stats_dir = run_dir / "stats-run"
        stats_cmd = [NODE, str(CLI), "research", "stats-run", "--data", str(DATA), "--out-dir", str(stats_dir), *args, "--method-selection", str(method_selection), "--json"]
        stats = run(stats_cmd)
        (run_dir / "stats-run.stdout").write_text(stats.stdout, encoding="utf-8")
        (run_dir / "stats-run.stderr").write_text(stats.stderr, encoding="utf-8")
        manuscript = run([NODE, str(CLI), "research", "manuscript", "--run-dir", str(run_dir), "--json"])
        (run_dir / "manuscript.stdout").write_text(manuscript.stdout, encoding="utf-8")
        (run_dir / "manuscript.stderr").write_text(manuscript.stderr, encoding="utf-8")
        paper_qa = run([NODE, str(CLI), "research", "paper-qa", "--paper", str(run_dir / "manuscript.md"), "--evidence", str(stats_dir / "stats-run.json"), "--json"], allow_fail=True)
        (run_dir / "paper-qa.stdout").write_text(paper_qa.stdout, encoding="utf-8")
        (run_dir / "paper-qa.stderr").write_text(paper_qa.stderr, encoding="utf-8")
        if (stats_dir / "figures.json").exists():
            figure_qa = run([NODE, str(CLI), "research", "figure-qa", "--figures", str(stats_dir / "figures.json"), "--out", str(run_dir / "figure-qa.json"), "--report", str(run_dir / "figure-qa.md"), "--json"], allow_fail=True)
            (run_dir / "figure-qa.stdout").write_text(figure_qa.stdout, encoding="utf-8")
            (run_dir / "figure-qa.stderr").write_text(figure_qa.stderr, encoding="utf-8")
        inspect = run([NODE, str(CLI), "research", "run-inspect", "--run-dir", str(run_dir), "--out", str(run_dir / "run-inspection.json"), "--report", str(run_dir / "run-inspection.md"), "--json"], allow_fail=True)
        (run_dir / "run-inspect.stdout").write_text(inspect.stdout, encoding="utf-8")
        (run_dir / "run-inspect.stderr").write_text(inspect.stderr, encoding="utf-8")
        review_tasks.append(asyncio.create_task(review_one(study_id, run_dir, review_sem)))
        index["studies"].append({
            "number": number,
            "studyId": study_id,
            "question": question,
            "runDir": str(run_dir),
            "manuscript": str(run_dir / "manuscript.md"),
            "statsRun": str(stats_dir / "stats-run.json"),
            "review": str(run_dir / "review/review-panel.json"),
        })
    review_results = await asyncio.gather(*review_tasks)
    for entry, review in zip(index["studies"], review_results):
        run_dir = Path(entry["runDir"])
        entry["reviewRun"] = review
        entry["reviewSummary"] = summarize_review(run_dir)
    (OUT / "DEEPSEEK_REVIEWED_PAPER_INDEX.json").write_text(json.dumps(index, indent=2) + "\n", encoding="utf-8")
    lines = ["# DeepSeek-Reviewed Paper Series", "", f"Data: `{DATA}`", "", "| # | Study | Review | Succeeded | Findings | Top finding |", "|---:|---|---|---:|---:|---|"]
    for entry in index["studies"]:
        summary = entry["reviewSummary"]
        top = "; ".join(item for item in summary.get("topFindings", []) if item) or ""
        lines.append(f"| {entry['number']} | [{entry['studyId']}](papers/{entry['studyId']}/manuscript.md) | {summary.get('verdict')} / {summary.get('reentryPoint')} | {summary.get('reviewersSucceeded')} | {summary.get('acceptedFindings')} | {top} |")
    (OUT / "DEEPSEEK_REVIEWED_PAPER_INDEX.md").write_text("\n".join(lines) + "\n", encoding="utf-8")


if __name__ == "__main__":
    asyncio.run(main())
