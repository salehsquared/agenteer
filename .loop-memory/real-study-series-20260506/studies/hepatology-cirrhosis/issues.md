# Hepatology Validation Issues

## Validation Outcome

- Packet: `.loop-memory/mimic-executed-studies-20260506/runs/0317-mimic-liver-cirrhosis-icu`
- Original runner QA: pass
- Trust-layer readiness: `needs_methods_review`
- Method QA: warning, not blocked
- Manuscript QA: pass
- New cloud cost: `$0.00`

## Scientific Issues

- Derived MELD/coagulation inputs need provenance and semantic profiling.
- ICD-10-CM `K74` includes fibrosis and cirrhosis terms, so cirrhosis phenotype breadth should be reviewed.
- Mortality findings are internal observational associations, not deployable prognostic-model evidence.
- Separation, collinearity, and influence diagnostics remain absent.

## Framework Issues Found

- The improved runner-warning ingestion now correctly surfaces the unprofiled derived-coagulation warning as semantic-plausibility review.
- The remaining gap is not visibility but absence of a typed derived-table profile artifact.

## Remaining Follow-Up

Add a MIMIC derived-table profile artifact that records table source, row coverage, required variables, missingness, semantic ranges, and whether the table is safe for publication-grade use.
