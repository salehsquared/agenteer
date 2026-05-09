# Cardiology Validation Issues

## Validation Outcome

- Packet: `.loop-memory/mimic-executed-studies-20260506/runs/0307-mimic-cardiology-heart-failure-icu`
- Trust-layer readiness: `needs_methods_review`
- Method QA: warning, not blocked
- Manuscript QA: pass after generator hardening
- New cloud cost: `$0.00`

## Scientific Issues

- The original runner passed, but the trust layer correctly asks for explicit collinearity and influence diagnostics before stronger claims.
- The analysis is observational. First-day SOFA, laboratory, and vital-sign values may be markers of illness severity or care process rather than causal factors.
- Complete-case modeling is disclosed, but publication-grade work should add a missingness mechanism review and a sensitivity analysis.

## Framework Issues Found And Addressed

- The manuscript generator exposed an internal readiness enum (`needs_methods_review`) in reader-facing prose. This violated the paper-language contract and failed manuscript QA.
- The generated manuscript title fell back to a generic title for long questions instead of using the packet's study title.
- A status extraction heuristic incorrectly risked pulling ICD verification statuses such as `verified_online` into the Results section.

## Fix Implemented

- Reader-facing manuscript quality-control text now translates internal statuses into plain language.
- Manuscripts now prefer study titles found in run artifacts.
- Result bullets now use the original runner `qa.json` status rather than arbitrary nested `status` fields.

## Remaining Follow-Up

The larger MIMIC runner still needs a first-class packet schema or CLI command so collinearity, influence diagnostics, and missingness sensitivity can be generated during execution rather than discovered only after the fact.
