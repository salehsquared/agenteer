# Neurology Validation Issues

## Validation Outcome

- Packet: `.loop-memory/mimic-executed-studies-20260506/runs/0314-mimic-neuro-stroke-icu-mortality`
- Original runner QA: pass
- Trust-layer readiness: `needs_methods_review`
- Method QA: warning, not blocked
- Manuscript QA: pass
- New cloud cost: `$0.00`

## Scientific Issues

- The packet uses prediction wording and AUROC, but lacks calibration, validation split, temporal validation, and explicit prediction horizon.
- ICD-9 `434` includes subcodes with different explicitness about infarction; phenotype sensitivity is needed.
- Severity scores and first-day physiology are risk markers and care-process markers, not causal targets.
- Separation, collinearity, and influence diagnostics remain absent.

## Framework Issues Found

- Manuscript QA blocks internal jargon but does not yet enforce a prediction-claim firewall.
- Method QA detects `prediction` from wording but does not require calibration/validation evidence unless the packet is an ML comparison route.

## Remaining Follow-Up

Add prediction-framing QA for non-ML observational packets: AUROC or "predict" language should require calibration/validation evidence or explicitly relabel the study as a risk-marker association.
