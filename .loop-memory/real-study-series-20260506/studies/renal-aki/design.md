# Study 3 Design: Nephrology / Acute Kidney Injury ICU Mortality

## Packet

Source packet: `.loop-memory/mimic-executed-studies-20260506/runs/0310-mimic-renal-aki-icu-mortality`

## Research Question

Among ICU admissions with acute kidney injury diagnosis codes or derived AKI stages, how strongly is AKI severity associated with in-hospital mortality and ICU length of stay?

## Cohort Definition

- Data source: MIMIC-IV ICU and hospital diagnosis-derived tables exported during the prior bounded run.
- Phenotype: ICD-10-CM `N17` and ICD-9-CM `584` acute kidney failure families, verified online in the prior design phase.
- Derived physiology: KDIGO stage-derived tables plus first-day laboratory data.
- Unit of analysis: first ICU stay per matching hospitalization.
- Baseline cohort evidence:
  - First ICU stay rows: 25,658.
  - Unique patients: 21,251.
  - Matched diagnosis codes: 11.
  - Matched diagnosis rows: 73,580.

## Outcomes

- In-hospital mortality (`hospital_expire_flag`), modeled as a binary outcome.
- ICU length of stay (`los_icu`), modeled on a transformed continuous scale.

## Validation Focus

This packet should stress:

- Large-cohort logistic/linear diagnostics.
- Derived AKI stage semantics.
- Diagnosis-code timing versus clinical onset timing.
- Whether the trust layer surfaces warnings already recorded by runner QA, especially unprofiled KDIGO-derived tables.

## Expected Issues To Look For

- AKI stage may be partly derived from values close to outcome timing and ICU care process.
- Diagnosis code timing may lag clinical onset.
- Derived KDIGO tables need semantic/provenance profiling before publication-grade interpretation.
- Good denominator retention should not hide missing separation, collinearity, or influence diagnostics.
