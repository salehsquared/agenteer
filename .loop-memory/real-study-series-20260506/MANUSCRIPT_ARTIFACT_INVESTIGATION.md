# Manuscript Artifact Investigation

Date: 2026-05-06

## Problem

Some recent files named `manuscript.md` read like sparse local-review summaries instead of full papers. They omitted the useful study content that existed in earlier MIMIC outputs: cohort construction, descriptive statistics, adjusted model results, length-of-stay models, missingness, quality checks, and artifact indexes.

## Root Cause

The richer MIMIC runner continued to write useful `paper.md` artifacts. The regression came from the newer trust-layer command:

`agenteer research manuscript`

That command generated a generic post-hoc manuscript from run metadata. It extracted only a title, research question, complete-case N, a first numeric estimate, QA posture, and artifact count. It did not preserve rich runner sections when a detailed `paper.md` already existed.

The result was an artifact naming problem and a rendering problem:

- `paper.md` was the real analysis report.
- `manuscript.md` looked more official but was a thin QA-oriented summary.
- Users naturally opened `manuscript.md` and saw a worse paper.

## Fix

The manuscript renderer now detects rich runner papers and preserves their substantive sections:

- data source and cohort construction
- cohort counts and descriptive characteristics
- mortality model results
- ICU length-of-stay model results
- prolonged-stay model results when present
- missingness summaries
- interpretation and limitations
- QA/cost controls and artifact provenance

The generic sparse manuscript renderer remains available only as a fallback when no rich report exists.

## Regression Test

`packages/cli/tests/research-trust.test.ts` now verifies that rich runner papers are not collapsed into generic manuscripts. The test asserts that model sections, coefficient text, cohort characteristics, and statistical-analysis content survive manuscript generation.

## Regenerated Outputs

The five real-study-series manuscripts were regenerated from their original rich MIMIC runner papers:

- `studies/cardiology-heart-failure/manuscript.md`
- `studies/hepatology-cirrhosis/manuscript.md`
- `studies/pulmonary-copd/manuscript.md`
- `studies/renal-aki/manuscript.md`
- `studies/neurology-stroke/manuscript.md`

## Remaining Product Lesson

Agenteer should stop presenting a generic review artifact as a manuscript. The canonical reader-facing paper should be generated from the analysis runner or from a rich structured report object. QA and inspection summaries should stay clearly labeled as QA/inspection artifacts.
