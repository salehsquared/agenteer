# Study 2 Design: Pulmonary / COPD And Respiratory Failure ICU Outcomes

## Packet

Source packet: `.loop-memory/mimic-executed-studies-20260506/runs/0308-mimic-pulmonary-copd-respiratory-failure`

## Research Question

Among ICU patients with COPD and/or acute respiratory failure diagnosis codes, which first-day severity, respiratory, and physiologic markers are associated with in-hospital mortality and ICU length of stay?

## Cohort Definition

- Data source: MIMIC-IV ICU and hospital diagnosis-derived tables exported during the prior bounded run.
- Phenotype: broad respiratory diagnosis family using ICD-10-CM `J44` and `J96`, plus ICD-9-CM `496` and `518.81`, verified online in the prior design phase.
- Unit of analysis: first ICU stay per matching hospitalization.
- Baseline cohort evidence:
  - First ICU stay rows: 25,835.
  - Unique patients: 21,370.
  - Matched diagnosis codes: 23.
  - Matched diagnosis rows: 67,320.

## Outcomes

- In-hospital mortality (`hospital_expire_flag`), modeled as a binary outcome.
- ICU length of stay (`los_icu`), modeled on a transformed continuous scale.

## Validation Focus

This packet should stress:

- Broad phenotype reliability.
- High missingness and complete-case denominator transparency.
- Mortality-performance reporting without implying deployable prediction.
- Whether a runner-level QA pass is enough once trust-layer review inspects missingness and model diagnostics.

## Expected Issues To Look For

- Very high missingness in some first-day blood gas/lab variables may shrink model complete-case N.
- COPD and acute respiratory failure are related but not interchangeable phenotypes.
- Physiologic markers may reflect treatment intensity, care processes, or disease severity.
- Model performance metrics should not be framed as clinical deployment evidence without validation and calibration.
