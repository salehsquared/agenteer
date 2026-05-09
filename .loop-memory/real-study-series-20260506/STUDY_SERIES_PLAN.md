# Five-Specialty Real Study Validation Series

Generated for ticks 0328-0337.

## Scope

This series selects five already executed MIMIC-IV study packets across five specialties and validates them with Agenteer's trust layer. The goal is not to claim publication readiness. The goal is to test whether real study packets are understandable, inspectable, and methodologically honest enough for local scientific review.

No new raw data reads are planned for this series. The selected packets already carry cost receipts and cache-cleanup evidence from the corrected MIMIC execution run, so these validation ticks should add no cloud cost.

## Selected Studies

| Pair | Specialty | Packet | Research Question |
| --- | --- | --- | --- |
| 0328-0329 | Cardiology | `0307-mimic-cardiology-heart-failure-icu` | Among ICU admissions with heart failure diagnoses, how do first-day renal, severity, and vital-sign features relate to mortality and ICU length of stay? |
| 0330-0331 | Pulmonary/Critical Care | `0308-mimic-pulmonary-copd-respiratory-failure` | Among ICU admissions with COPD or respiratory failure diagnoses, which first-day severity and physiology features are associated with mortality and ICU length of stay? |
| 0332-0333 | Nephrology | `0310-mimic-renal-aki-icu-mortality` | Among ICU admissions with acute kidney injury diagnoses, which first-day severity, laboratory, and vital-sign features are associated with in-hospital mortality and ICU length of stay? |
| 0334-0335 | Neurology | `0314-mimic-neuro-stroke-icu-mortality` | Among ICU admissions with stroke diagnoses, how do first-day severity and physiologic features relate to mortality and ICU length of stay? |
| 0336-0337 | Hepatology/Gastroenterology | `0317-mimic-liver-cirrhosis-icu` | Among ICU admissions with cirrhosis diagnoses, which first-day severity and physiology features are associated with mortality and ICU length of stay? |

## Common Validation Contract

Each study pair should produce:

- A study-specific `design.md` describing cohort, exposure/predictor family, outcome, intended model family, and scientific limits.
- Trust-layer validation artifacts: `method-qa.json`, `method-qa.md`, `run-inspection.json`, `run-inspection.md`, `manuscript.md`, and `manuscript-qa.json`.
- A short issue ledger naming whether the blocker is design, data, methods, report readability, provenance, or Agenteer framework behavior.
- A tick file recording hypothesis, intervention, evidence, verification, counter-design, decision, memory updates, and next tick.

## Cross-Study Acceptance Criteria

- Diagnosis families were verified before execution and matched against the local MIMIC diagnosis dictionary.
- Cohort size, matched diagnosis rows/codes, unique patients, model complete-case N, missingness, QA status, cost, and cache cleanup are inspectable without opening raw row-level data.
- Papers avoid internal platform jargon and describe observational limitations plainly.
- Trust-layer warnings are route-appropriate and do not ask for irrelevant survey or diagnostic-only checks.
- Review packets preserve the difference between `pass`, `needs_methods_review`, and `blocked`.

## Known Baseline Limitation

The current MIMIC runner is still stored as loop-memory infrastructure rather than a first-class `agenteer research dataset-run` command. This series should decide whether the next implementation should promote that runner into the CLI or first harden the packet schema and lifecycle/index layer.
