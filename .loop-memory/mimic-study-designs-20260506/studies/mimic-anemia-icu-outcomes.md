# Anemia Diagnosis And ICU Outcomes

Question: Among ICU admissions with anemia codes, do first-day hemoglobin values and comorbidity burden predict mortality?

Domain: `hematology`

## ICD Verification

- `icd10cm D64`: verified_online. Examples: D64.0 Hereditary sideroblastic anemia; D64.1 Secondary sideroblastic anemia due to disease; D64.2 Secondary sideroblastic anemia due to drugs and toxins
- `icd9cm_dx 285`: verified_online. Examples: 285.0 Sideroblastic anemia; 285.1 Acute posthemorrhagic anemia; 285.21 Anemia in chronic kidney disease

## Tables

`hosp-diagnoses-icd`, `hosp-d-icd-diagnoses`, `derived-icustay-detail`, `derived-first-day-lab`, `derived-charlson`

## Methods

- diagnosis-lab concordance audit
- mortality model
- transfusion data deferred

## Self-Audit

- Feasibility status: `ready_for_bounded_design`.
- Estimated naive required-table transfer: `$0.0093`.
- Promotion decision: `promote_to_candidate_queue`.
- Warning: Diagnosis-code timing may not equal clinical onset timing.
- Warning: Mortality models are associational unless a causal design is specified.
