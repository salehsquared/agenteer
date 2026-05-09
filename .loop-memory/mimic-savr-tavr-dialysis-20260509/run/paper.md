# Dialysis Status and Outcomes After SAVR or TAVR in MIMIC-IV


## Abstract


**Background:** Dialysis patients undergoing aortic valve replacement are clinically high risk, but local EHR data need careful handling because procedure coding, follow-up capture, and dialysis modality evidence are imperfect.

**Objective:** To compare mortality, heart-failure/cardiac readmission, MACE, and valve reintervention after SAVR or TAVR among patients with hemodialysis or unspecified dialysis evidence, peritoneal dialysis evidence, and no dialysis evidence.

**Design:** Same-hospital longitudinal cohort analysis of MIMIC-IV v3.1 hospital admissions. The cohort included 4,255 first observed SAVR/TAVR admissions from 4,255 patients.

**Methods:** SAVR/TAVR were identified from ICD-9-CM and ICD-10-PCS procedure codes, with HCPCS/CPT event scanning documented separately. Dialysis groups were assigned from diagnoses, procedures, and HCPCS descriptions available up to the index admission. Outcomes were measured during the index admission and subsequent same-hospital admissions within 365 days.

**Results:** Outcome rates and adjusted models are reported as local EHR associations. Local HCPCS/CPT scanning found TAVR-related code(s): 0256T, 33361; SAVR CPT code(s): none. Most valve strategy classification was driven by ICD procedure coding.

**Conclusion:** This packet is suitable for methods review of a MIMIC-feasible version of the question. It is not a claims-registry study and should not be interpreted as complete 2008-2022 national longitudinal follow-up.


## Introduction


This study evaluates outcomes after surgical or transcatheter aortic valve replacement by dialysis status. The motivating clinical question asks about hemodialysis, peritoneal dialysis, and non-dialysis patients across SAVR and TAVR, including mortality, cardiac readmission, MACE, and valve reintervention.

MIMIC-IV can answer a narrower same-institution version of this question. It contains deidentified hospital admissions, diagnosis/procedure codes, HCPCS events, patient death dates, and anchor-year groups. It does not provide complete national claims follow-up or exact public calendar years.

Prior registry and cohort literature generally treats dialysis patients undergoing aortic valve replacement as a high-risk population, with high longer-term mortality and clinically important risks of stroke, myocardial infarction, and reoperation. This MIMIC analysis is therefore positioned as a local feasibility and methods packet rather than a replacement for a national registry or claims-based longitudinal study.


## Methods


### Data Source


We used the local project-owned Parquet cache of MIMIC-IV v3.1. MIMIC-IV anchor-year groups allow approximate temporal grouping from 2008-2022, but individual dates are deidentified and shifted. The analysis used aggregate outputs only; temporary row-level cache files were removed after execution.

### Cohort Construction


The cohort included each patient's first observed hospital admission containing SAVR or TAVR evidence. SAVR used ICD-9-CM 35.21/35.22 and ICD-10-PCS open replacement of the aortic valve. TAVR used ICD-9-CM 35.05/35.06 and ICD-10-PCS percutaneous, transapical, or percutaneous endoscopic replacement of the aortic valve. HCPCS/CPT event data were scanned for common SAVR/TAVR codes; observed TAVR-related code(s) were 0256T, 33361, and observed SAVR CPT code(s) were none.

### Dialysis Status


Dialysis evidence was searched in diagnosis, procedure, and HCPCS event records up to the index admission. Peritoneal dialysis was assigned when peritoneal dialysis-specific evidence was present. Hemodialysis/unspecified dialysis was assigned when hemodialysis, ESRD, dependence on renal dialysis, or renal dialysis status evidence was present without peritoneal dialysis evidence. This is not a clean outpatient modality registry.

### Outcomes


Outcomes were in-hospital mortality, death within 30 and 365 days, heart-failure readmission within 365 days, broad cardiac-related readmission within 365 days, MI, stroke, MACE, and valve reintervention within 365 days. MACE was defined as death, MI, or stroke within the available same-patient timeline. Readmissions and reinterventions are same-hospital only.

### Statistical Analysis


We summarized outcomes by valve strategy and dialysis group. Adjusted logistic models were attempted for each outcome using dialysis group, valve strategy, age, sex, Charlson comorbidity index, anchor-year group, and insurance when event counts permitted. Models were not fit when events per predictor were too sparse.


## Results


### Cohort


The cohort included 4,255 first observed SAVR/TAVR admissions. Valve strategy counts were: {'SAVR': 3049, 'TAVR': 1201, 'mixed_savr_tavr_same_admission': 5}. Dialysis group counts were: {'non_dialysis': 4077, 'hemodialysis_or_unspecified_dialysis': 166, 'peritoneal_dialysis': 12}.

### Outcomes By Valve Strategy And Dialysis Group


- SAVR / hemodialysis_or_unspecified_dialysis: n=112; in-hospital death 28/112 (25.0%); 365-day death 40/112 (35.7%); HF readmission 21/112 (18.8%); cardiac readmission 42/112 (37.5%); MACE 58/112 (51.8%); valve reintervention 2/112 (1.8%).

- SAVR / non_dialysis: n=2,928; in-hospital death 33/2928 (1.1%); 365-day death 138/2928 (4.7%); HF readmission 293/2928 (10.0%); cardiac readmission 764/2928 (26.1%); MACE 493/2928 (16.8%); valve reintervention 14/2928 (0.5%).

- SAVR / peritoneal_dialysis: n=9; in-hospital death 2/9 (22.2%); 365-day death 3/9 (33.3%); HF readmission 1/9 (11.1%); cardiac readmission 4/9 (44.4%); MACE 7/9 (77.8%); valve reintervention 0/9 (0.0%).

- TAVR / hemodialysis_or_unspecified_dialysis: n=54; in-hospital death 3/54 (5.6%); 365-day death 20/54 (37.0%); HF readmission 17/54 (31.5%); cardiac readmission 21/54 (38.9%); MACE 22/54 (40.7%); valve reintervention 2/54 (3.7%).

- TAVR / non_dialysis: n=1,144; in-hospital death 28/1144 (2.4%); 365-day death 171/1144 (14.9%); HF readmission 287/1144 (25.1%); cardiac readmission 403/1144 (35.2%); MACE 291/1144 (25.4%); valve reintervention 13/1144 (1.1%).

- TAVR / peritoneal_dialysis: n=3; in-hospital death 0/3 (0.0%); 365-day death 0/3 (0.0%); HF readmission 2/3 (66.7%); cardiac readmission 3/3 (100.0%); MACE 1/3 (33.3%); valve reintervention 0/3 (0.0%).

- mixed_savr_tavr_same_admission / non_dialysis: n=5; in-hospital death 2/5 (40.0%); 365-day death 3/5 (60.0%); HF readmission 1/5 (20.0%); cardiac readmission 1/5 (20.0%); MACE 4/5 (80.0%); valve reintervention 0/5 (0.0%).

### Baseline Characteristics


- SAVR / hemodialysis_or_unspecified_dialysis: age median 66.5, Charlson median 7.0, 365-day follow-up admissions median 0.0.

- SAVR / non_dialysis: age median 71.0, Charlson median 4.0, 365-day follow-up admissions median 0.0.

- SAVR / peritoneal_dialysis: age median 62.0, Charlson median 7.0, 365-day follow-up admissions median 0.0.

- TAVR / hemodialysis_or_unspecified_dialysis: age median 78.5, Charlson median 8.0, 365-day follow-up admissions median 0.0.

- TAVR / non_dialysis: age median 82.0, Charlson median 6.0, 365-day follow-up admissions median 0.0.

- TAVR / peritoneal_dialysis: age median 69.0, Charlson median 7.0, 365-day follow-up admissions median 4.0.

- mixed_savr_tavr_same_admission / non_dialysis: age median 79.0, Charlson median 6.0, 365-day follow-up admissions median 0.0.

### Adjusted Models


- in_hospital_mortality: model not fit (math range error; n=4255, events=96).

- death_30d: model not fit (math range error; n=4255, events=127).

- death_365d: adjusted model fit with n=4,255, events=375, predictors=14. Selected terms:

  - admission_age: OR 0.99 (95% CI 0.98-1.00); p=0.116.

  - male: OR 1.17 (95% CI 0.92-1.48); p=0.19.

  - charlson_comorbidity_index: OR 1.33 (95% CI 1.26-1.41); p=1.83e-24.

  - dialysis_group_non_dialysis: OR 0.24 (95% CI 0.16-0.34); p=6.13e-14.

  - dialysis_group_peritoneal_dialysis: OR 0.58 (95% CI 0.14-2.43); p=0.458.

  - valve_strategy_TAVR: OR 1.77 (95% CI 1.36-2.31); p=2.04e-05.

  - valve_strategy_mixed_savr_tavr_same_admission: OR 15.03 (95% CI 2.38-94.89); p=0.00394.

  - anchor_year_group_2011 - 2013: OR 0.72 (95% CI 0.51-1.01); p=0.0571.

- hf_readmission_365d: adjusted model fit with n=4,255, events=622, predictors=14. Selected terms:

  - admission_age: OR 0.98 (95% CI 0.97-0.99); p=0.00139.

  - male: OR 0.97 (95% CI 0.81-1.17); p=0.757.

  - charlson_comorbidity_index: OR 1.32 (95% CI 1.26-1.38); p=4.32e-33.

  - dialysis_group_non_dialysis: OR 1.10 (95% CI 0.73-1.65); p=0.648.

  - dialysis_group_peritoneal_dialysis: OR 0.94 (95% CI 0.22-3.96); p=0.931.

  - valve_strategy_TAVR: OR 2.08 (95% CI 1.68-2.57); p=1.08e-11.

  - valve_strategy_mixed_savr_tavr_same_admission: OR 1.72 (95% CI 0.19-15.77); p=0.632.

  - anchor_year_group_2011 - 2013: OR 0.72 (95% CI 0.56-0.93); p=0.0119.

- cardiac_readmission_365d: adjusted model fit with n=4,255, events=1,238, predictors=14. Selected terms:

  - admission_age: OR 0.99 (95% CI 0.98-1.00); p=0.00234.

  - male: OR 0.94 (95% CI 0.82-1.09); p=0.412.

  - charlson_comorbidity_index: OR 1.14 (95% CI 1.10-1.19); p=6.76e-13.

  - dialysis_group_non_dialysis: OR 0.97 (95% CI 0.69-1.37); p=0.882.

  - dialysis_group_peritoneal_dialysis: OR 1.97 (95% CI 0.58-6.63); p=0.275.

  - valve_strategy_TAVR: OR 1.39 (95% CI 1.17-1.64); p=0.000167.

  - valve_strategy_mixed_savr_tavr_same_admission: OR 0.70 (95% CI 0.08-6.35); p=0.754.

  - anchor_year_group_2011 - 2013: OR 0.70 (95% CI 0.57-0.85); p=0.000281.

- mace_365d: adjusted model fit with n=4,255, events=876, predictors=14. Selected terms:

  - admission_age: OR 0.97 (95% CI 0.96-0.98); p=7.5e-08.

  - male: OR 1.09 (95% CI 0.92-1.29); p=0.296.

  - charlson_comorbidity_index: OR 1.51 (95% CI 1.44-1.57); p=1.2e-75.

  - dialysis_group_non_dialysis: OR 0.58 (95% CI 0.41-0.83); p=0.00246.

  - dialysis_group_peritoneal_dialysis: OR 2.03 (95% CI 0.54-7.58); p=0.293.

  - valve_strategy_TAVR: OR 0.80 (95% CI 0.66-0.98); p=0.0297.

  - valve_strategy_mixed_savr_tavr_same_admission: OR 11.09 (95% CI 1.18-104.08); p=0.0352.

  - anchor_year_group_2011 - 2013: OR 0.81 (95% CI 0.64-1.03); p=0.0842.

- valve_reintervention_365d: model not fit (Low events per predictor; n=4255, events=31).

## Discussion


This local MIMIC-IV analysis gives an auditable first pass on dialysis status and outcomes after aortic valve replacement. It suggests how outcome rates differ across SAVR/TAVR and dialysis groups in the available EHR data, but it also shows why the full requested question is more naturally a claims-registry study.

The strongest use of this packet is feasibility and methods development: code lists are visible, CPT/HCPCS absence is explicit, follow-up is bounded to the same institution, and sparse model conditions are not hidden.

## Limitations


- MIMIC-IV is a single-center deidentified EHR dataset, not a national claims registry.

- Admission years are approximate through anchor-year groups; exact 2008-2022 public calendar-year trends are not available.

- Same-hospital readmission and reintervention capture may miss outside-hospital events.

- HCPCS/CPT event data were sparse for valve replacement coding; TAVR-related CPT evidence was present, but requested SAVR CPT codes were not observed, so most cohort definition depends on ICD procedure codes.

- Hemodialysis/unspecified dialysis combines ESRD, dependence/status, and hemodialysis evidence; outpatient modality assignment is imperfect.

- MACE uses diagnosis-code evidence and death-date availability; it is not adjudicated.

## Reproducibility


The run directory contains aggregate CSV and JSON artifacts for code matching, cohort audit, outcomes, model estimates, QA, cost, and source inventory. Estimated GCS read cost was $0.0125, below the $10.00 ceiling. Temporary row-level cache removed: true.
