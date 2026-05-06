# COPD And Respiratory Failure ICU Outcomes

Question: Among ICU patients with COPD and/or acute respiratory failure codes, which first-day respiratory markers predict mortality?

Domain: `pulmonary`

## ICD Verification

- `icd10cm J44`: verified_online. Examples: J44.0 Chronic obstructive pulmonary disease with (acute) lower respiratory infection; J44.1 Chronic obstructive pulmonary disease with (acute) exacerbation; J44.81 Bronchiolitis obliterans and bronchiolitis obliterans syndrome
- `icd10cm J96`: verified_online. Examples: J96.00 Acute respiratory failure, unspecified whether with hypoxia or hypercapnia; J96.01 Acute respiratory failure with hypoxia; J96.02 Acute respiratory failure with hypercapnia
- `icd9cm_dx 496`: verified_online. Examples: 496 Chronic airway obstruction, not elsewhere classified
- `icd9cm_dx 518.81`: verified_online. Examples: 518.81 Acute respiratory failure

## Tables

`hosp-diagnoses-icd`, `hosp-d-icd-diagnoses`, `derived-icustay-detail`, `derived-first-day-bg`, `derived-first-day-bg-art`, `derived-oxygen-delivery`, `derived-oasis`

## Methods

- respiratory phenotype
- blood-gas high-missingness warning
- sensitivity using oxygen-delivery data

## Self-Audit

- Feasibility status: `ready_for_bounded_design`.
- Estimated naive required-table transfer: `$0.0095`.
- Promotion decision: `promote_to_candidate_queue`.
- Warning: Mortality models are associational unless a causal design is specified.
