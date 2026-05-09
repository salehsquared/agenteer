# Study 4 Design: Neurology / Ischemic Stroke ICU Mortality

## Packet

Source packet: `.loop-memory/mimic-executed-studies-20260506/runs/0314-mimic-neuro-stroke-icu-mortality`

## Research Question

Among ICU admissions with ischemic stroke diagnosis codes, which first-day severity and physiologic variables are associated with in-hospital mortality and ICU length of stay?

## Cohort Definition

- Data source: MIMIC-IV ICU and hospital diagnosis-derived tables exported during the prior bounded run.
- Phenotype: ICD-10-CM `I63` cerebral infarction and ICD-9-CM `434` cerebral artery occlusion families, verified online in the prior design phase.
- Unit of analysis: first ICU stay per matching hospitalization.
- Baseline cohort evidence:
  - First ICU stay rows: 3,546.
  - Unique patients: 3,471.
  - Matched diagnosis codes: 119.
  - Matched diagnosis rows: 7,564.

## Outcomes

- In-hospital mortality (`hospital_expire_flag`), modeled as a binary outcome.
- ICU length of stay (`los_icu`), modeled on a transformed continuous scale.

## Validation Focus

This packet should stress:

- Moderate-cohort logistic diagnostics.
- Stroke phenotype breadth and ICD-9 ambiguity around occlusion without infarction.
- Care-process/severity overlap for GCS, APS III, OASIS, oxygenation, and urine output.
- Whether reports avoid saying "predict" in a clinical deployment sense without external validation.

## Expected Issues To Look For

- ICD-9 `434` includes codes without explicit infarction wording, so phenotype sensitivity may be required.
- Severity scores and first-day physiology are useful risk markers but are not causal targets.
- Mortality model event count is adequate, but separation, collinearity, and influence diagnostics still need to be recorded.
- External validity is limited to similar ICU/EHR contexts.
