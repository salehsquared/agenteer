# Renal Validation Issues

## Validation Outcome

- Packet: `.loop-memory/mimic-executed-studies-20260506/runs/0310-mimic-renal-aki-icu-mortality`
- Original runner QA: pass
- Trust-layer readiness: `needs_methods_review`
- Method QA: warning, not blocked
- Manuscript QA: pass
- New cloud cost: `$0.00`

## Scientific Issues

- AKI stage is derived and may be affected by measurement timing and care process.
- Original runner warnings noted unprofiled KDIGO-derived tables and diagnosis-code timing uncertainty.
- Mortality is modeled with odds-ratio coefficients, so separation diagnostics should be attached before stronger claims.
- Collinearity and influence diagnostics remain absent.

## Framework Issues Found And Addressed

- Runner `qa.json` string warnings were not being collected as method-QA issue evidence.
- Semantic plausibility did not explicitly recognize unprofiled required tables or diagnosis-code timing warnings.

## Fix Implemented

- String warnings inside `warnings` arrays are now converted into issue records.
- Semantic plausibility now flags unprofiled required tables and diagnosis-code timing/phenotype review concerns.
- Added regression coverage proving runner string warnings surface as semantic-plausibility warning evidence.

## Remaining Follow-Up

The next MIMIC runner should write explicit derived-table profile artifacts for KDIGO tables, not only a warning string.
