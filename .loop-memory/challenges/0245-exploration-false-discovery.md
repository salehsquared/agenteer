# Tick 0245 Challenge - Skeptical Statistician

## Critique

`research explore` is now genuinely useful, but it is also dangerous in exactly the way exploratory data analysis is usually dangerous: it can create a ranked list of impressive-looking associations from a large search space. A strong `r`, eta-squared, or Cramer's V from a broad scan is not a study result; it is an invitation to design a study. The current posture says that, but the artifact does not yet quantify the burden that made the warning necessary.

Specific concerns:

- Multiplicity is unnamed. The output should record how many eligible pairs were scanned, how many target-centered pairs were scanned, and whether the candidate list is likely to be false-discovery-prone.
- Survey design is only in generic limitations. If columns look like weights, strata, PSUs, cycles, waves, or clusters, the packet should explicitly state that the scan ignored design structure.
- Missingness and sparse categories are not summarized enough. A variable can look highly associated because it has few complete rows, rare categories, or selection into a subsample.
- Target leakage/proxy risk is missing. A target-centered scan should flag variables with suspicious names or near-perfect associations that may be derived from or downstream of the target.
- Candidate questions are too easy to promote. Each question should have a promotion status: `promotable_hypothesis`, `needs_methods_review`, or `blocked`, with reasons.
- The background map can still tempt overinterpretation. It needs its own interpretation boundary: data-map signal, not research-question priority unless explicitly promoted.

## Actionable Implications

The next implementation tick should add an `explorationBurden` object and question-level promotion gate:

- `eligiblePairCount`
- `testedPairCount`
- `targetPairCount`
- `highMissingnessVariables`
- `sparseCategoricalVariables`
- `surveyDesignCandidates`
- `possibleLeakagePairs`
- `multiplicityRisk`
- `promotionStatus` and `promotionBlockers` per candidate question

The report should surface this before candidate questions, not after limitations.

## Evidence That Would Change This Critique

I would trust the mode more if a golden exploration packet showed:

- explicit count of tested associations;
- target scan count;
- survey/design warning when relevant;
- leakage/proxy warning for near-perfect or suspicious target pairs;
- question-level promotion gating;
- a downstream handoff that refuses blocked questions.

Until then, exploration should remain experimental and should not feed paper generation directly.
