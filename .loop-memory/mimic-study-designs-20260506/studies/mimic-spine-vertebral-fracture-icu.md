# Vertebral Fracture ICU Outcomes

Question: Among ICU patients with vertebral fracture diagnoses, what first-day factors predict mortality and ICU length of stay?

Domain: `orthopedics-spine`

## ICD Verification

- `icd10cm S12`: verified_online. Examples: S12.000A Unspecified displaced fracture of first cervical vertebra, initial encounter for closed fracture; S12.000B Unspecified displaced fracture of first cervical vertebra, initial encounter for open fracture; S12.000D Unspecified displaced fracture of first cervical vertebra, subsequent encounter for fracture with routine healing
- `icd10cm S22.0`: verified_online. Examples: S22.000A Wedge compression fracture of unspecified thoracic vertebra, initial encounter for closed fracture; S22.000B Wedge compression fracture of unspecified thoracic vertebra, initial encounter for open fracture; S22.000D Wedge compression fracture of unspecified thoracic vertebra, subsequent encounter for fracture with routine healing
- `icd10cm S32.0`: verified_online. Examples: S32.000A Wedge compression fracture of unspecified lumbar vertebra, initial encounter for closed fracture; S32.000B Wedge compression fracture of unspecified lumbar vertebra, initial encounter for open fracture; S32.000D Wedge compression fracture of unspecified lumbar vertebra, subsequent encounter for fracture with routine healing
- `icd9cm_dx 805`: verified_online. Examples: 805.00 Closed fracture of cervical vertebra, unspecified level; 805.01 Closed fracture of first cervical vertebra; 805.02 Closed fracture of second cervical vertebra
- `icd9cm_dx 806`: verified_online. Examples: 806.00 Closed fracture of C1-C4 level with unspecified spinal cord injury; 806.01 Closed fracture of C1-C4 level with complete lesion of cord; 806.02 Closed fracture of C1-C4 level with anterior cord syndrome

## Tables

`hosp-diagnoses-icd`, `hosp-d-icd-diagnoses`, `derived-icustay-detail`, `derived-first-day-vitalsign`, `derived-first-day-sofa`

## Methods

- spine fracture phenotype
- neurologic injury sensitivity
- mortality/LOS models

## Self-Audit

- Feasibility status: `ready_for_bounded_design`.
- Estimated naive required-table transfer: `$0.0085`.
- Promotion decision: `promote_to_candidate_queue`.
- Warning: Mortality models are associational unless a causal design is specified.
