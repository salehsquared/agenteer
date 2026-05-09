# Study 1 Design: Cardiology / Heart Failure ICU Outcomes

## Packet

Source packet: `.loop-memory/mimic-executed-studies-20260506/runs/0307-mimic-cardiology-heart-failure-icu`

## Research Question

Among ICU admissions with heart failure diagnoses, how do first-day renal, severity, and vital-sign features relate to in-hospital mortality and ICU length of stay?

## Cohort Definition

- Data source: MIMIC-IV ICU and hospital diagnosis-derived tables exported to local/GCS Parquet during the prior bounded run.
- Phenotype: ICD-10-CM `I50` and ICD-9-CM `428` heart failure code families, verified online during the prior design phase.
- Unit of analysis: first ICU stay per matching hospitalization.
- Baseline cohort evidence from executed packet:
  - First ICU stay rows: 22,580.
  - Unique patients: 16,583.
  - Matched diagnosis codes: 43.
  - Matched diagnosis rows: 112,810.

## Outcomes

- In-hospital mortality (`hospital_expire_flag`), modeled as a binary outcome.
- ICU length of stay (`los_icu`), modeled on a transformed continuous scale.

## Predictors And Adjustment Intent

The existing packet uses first-day severity and physiology predictors, including SOFA, age, sex, renal labs, oxygenation, heart rate, and systolic blood pressure. These should be interpreted as risk/association markers, not causal intervention targets.

## Validation Focus

This packet should stress:

- Large-cohort regression QA.
- Mortality discrimination and LOS model diagnostics.
- Missingness disclosure.
- Plain-language limitation text.
- Trust-layer handling of a non-survey, non-diagnostic observational ICU packet.

## Expected Issues To Look For

- Potential severity-marker circularity: first-day SOFA and labs may partly encode downstream clinical deterioration or care intensity.
- No temporal causal design: associations should not be worded as treatment effects.
- Complete-case analysis may understate missingness bias.
- ICU LOS is skewed; percent-change language must remain clear and robust to non-finite transformed effects.
