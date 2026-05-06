# Tick 0257 Challenge - Methodology Archivist

## Persona

Methodology archivist evaluating whether the new exploration taxonomy will be reusable, auditable, and interpretable months later.

## Critique

The candidate taxonomy improves the immediate NHANES HbA1c example, but it is now a hidden ontology embedded inside TypeScript heuristics. That creates three risks.

First, the taxonomy is not dataset-backed. `RIDAGEYR`, `BMXWAIST`, and `LBXGH` are classified from regexes, not from a codebook, derivation manifest, variable dictionary, or dataset adapter. The current output looks more intelligent than its evidence warrants.

Second, the taxonomy is not auditable enough. A candidate says `social_demographic_determinant` or `plausible_risk_factor`, but it does not record which rule fired, which aliases matched, or which competing categories were considered and rejected. That will make future disagreements hard to debug.

Third, the taxonomy may overcorrect. It demotes same-domain glycemic markers, which is useful for avoiding dull questions, but some studies legitimately ask same-domain mechanistic questions, validation questions, or construct-validity questions. "Avoid as primary" should be a recommendation with reason and override path, not a quiet sorting penalty.

## Actionable Implications

- Move taxonomy rules into a named, versioned exploration taxonomy object with rule ids.
- Record per-question `taxonomyEvidence`: matched rule ids, matched terms, category score adjustments, and rejected category candidates.
- Add an override-friendly field such as `primaryQuestionUse`: `recommended`, `review_before_primary`, or `avoid_primary`.
- Let dataset adapters optionally contribute labels, domains, aliases, and derivation lineage to the taxonomy.
- Add a simple taxonomy QA check: every candidate question must have taxonomy evidence, a reader rationale, and a primary-use recommendation.

## Evidence That Would Change This Critique

This critique would weaken if `exploration.json` could show why each category was assigned, cite the rule version, and preserve enough evidence for a future developer or methods reviewer to understand and override the classification.

## Next Implementation Requirement

The next implementation tick should make taxonomy transparent and versioned before adding more categories or relying on the score for promotion.
