# Sepsis ICU Mortality

Question: Among ICU admissions with sepsis diagnosis codes, which first-day severity scores and labs predict mortality?

Domain: `critical-care`

## ICD Verification

- `icd10cm A40`: verified_online. Examples: A40.0 Sepsis due to streptococcus, group A; A40.1 Sepsis due to streptococcus, group B; A40.3 Sepsis due to Streptococcus pneumoniae
- `icd10cm A41`: verified_online. Examples: A41.01 Sepsis due to Methicillin susceptible Staphylococcus aureus; A41.02 Sepsis due to Methicillin resistant Staphylococcus aureus; A41.1 Sepsis due to other specified staphylococcus
- `icd9cm_dx 995.91`: verified_online. Examples: 995.91 Sepsis
- `icd9cm_dx 995.92`: verified_online. Examples: 995.92 Severe sepsis

## Tables

`hosp-diagnoses-icd`, `hosp-d-icd-diagnoses`, `derived-icustay-detail`, `derived-sepsis3`, `derived-first-day-lab`, `derived-first-day-sofa`

## Methods

- ICD sepsis vs derived sepsis comparison
- SOFA/lab model
- definition mismatch audit

## Self-Audit

- Feasibility status: `needs_table_or_profile_review`.
- Estimated naive required-table transfer: `$0.0087`.
- Promotion decision: `hold_for_review`.
- Blocker: Missing tables: derived-sepsis3.
- Warning: Mortality models are associational unless a causal design is specified.
