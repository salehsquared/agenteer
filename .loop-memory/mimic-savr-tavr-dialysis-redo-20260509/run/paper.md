# Dialysis Status and Outcomes After SAVR or TAVR in MIMIC-IV

## Abstract

**Background:** Dialysis patients undergoing aortic valve replacement are clinically high risk. A hospital EHR dataset can support a transparent same-institution analysis, but it cannot replace claims or registry follow-up.

**Objective:** To compare mortality, heart-failure or cardiac-related readmission, MACE, and valve-reintervention outcomes after SAVR or TAVR by dialysis status.

**Design:** Retrospective same-hospital longitudinal cohort analysis of MIMIC-IV v3.1. The study included 4,255 first observed SAVR/TAVR admissions from 4,255 patients.

**Methods:** The cohort was identified from user-supplied ICD-9 procedure and dialysis diagnosis/procedure/CPT/HCPCS codes, ICD-10-PCS aortic-valve replacement logic, and local HCPCS/CPT-like event scanning. Outcomes were summarized at 30 days, 1 year, 3 years, 5 years, and 10 years where MIMIC timelines allowed. Adjusted logistic and event-specific Cox models compared non-dialysis versus hemodialysis/unspecified dialysis patients while adjusting for valve strategy; the peritoneal dialysis and mixed-procedure strata were descriptive only. A propensity-score matched sensitivity analysis compared hemodialysis/unspecified dialysis with non-dialysis patients.

**Results:** The cohort included SAVR: 3,047; TAVR: 1,203; mixed savr tavr same admission: 5 by valve strategy and non dialysis: 4,076; hemodialysis or unspecified dialysis: 167; peritoneal dialysis: 12 by dialysis group. Peritoneal dialysis was very sparse. Same-hospital one-year outcomes are reported below; model estimates should be interpreted as local associations, not treatment effects.

**Conclusion:** This redo creates a reviewer-ready MIMIC packet for the feasible version of the question. It does not establish complete 2008-2022 national longitudinal outcomes because MIMIC lacks complete outside-hospital claims follow-up and exact public dates.

## Introduction

In hemodialysis, peritoneal dialysis, and non-dialysis patients undergoing SAVR and TAVR across ICD-9, ICD-10, and CPT/HCPCS-coded hospital data, how do clinical outcomes differ across mortality, heart-failure or cardiac-related hospital admission, MACE, and valve reintervention?

The clinically ideal version of this question is a claims or registry study with complete procedure, CPT/HCPCS, readmission, and reintervention follow-up. This MIMIC-IV analysis is a narrower but auditable same-hospital study designed to test phenotype definitions, outcome logic, and reporting quality.

## Methods

### Data Source

We used the project-owned local GCS Parquet cache of MIMIC-IV v3.1. Admissions, diagnosis codes, procedure codes, HCPCS events, patient metadata, and Charlson comorbidity scores were loaded. MIMIC-IV is not a complex survey dataset; there is no survey weight, strata, or PSU design for these models. Temporary row-level cache files were deleted after execution; saved artifacts are aggregate CSV/JSON/PNG files.

### Code Definitions

The user-supplied TAVR ICD-9 procedure codes were 35.05 and 35.06. The user-supplied SAVR ICD-9 procedure codes were 35.21 and 35.22. Dialysis evidence used ICD-10-CM N18.6 and Z99.2; ICD-9-CM 585.6, V45.11, V56.0, V56.1, V56.2, V56.31, V56.32, and V56.8; ICD-9 procedure code 54.98; and peritoneal dialysis CPT/HCPCS codes 49324, 49325, 49326, 49418, 49420, 49421, 49422, 49435, 49436, and G0052. A secondary hemodialysis CPT/HCPCS scan used 90935, 90937, 90945, 90947, 90999, and G0257 when those rows were present.

ICD-10-PCS SAVR/TAVR classification used aortic-valve replacement code-axis/title logic. The matched valve procedure code list is saved as `valve-phenotype-code-list.csv`, and the exact rule is saved in `outcome-phenotypes.json`. HCPCS/CPT-like event rows were scanned for auxiliary valve codes, but MIMIC HCPCS events are not a complete professional-claims feed.

### Cohort Construction

Sample construction began with admissions containing SAVR or TAVR evidence in ICD procedure or auxiliary HCPCS/CPT-like records. We retained the first observed eligible SAVR/TAVR admission per patient. The study population contained 4,255 eligible rows from 4,255 unique patients. Valve strategy counts were SAVR: 3,047; TAVR: 1,203; mixed savr tavr same admission: 5. Dialysis group counts were non dialysis: 4,076; hemodialysis or unspecified dialysis: 167; peritoneal dialysis: 12. Peritoneal dialysis was treated as exploratory because only 12 index patients met that definition.

### Outcomes

Outcomes were in-hospital mortality; death at 30 days, 1 year, 3 years, 5 years, and 10 years; heart-failure readmission; broad cardiac-related readmission; MI; stroke; MACE defined as death, MI, or stroke; later TAVR; later SAVR; revision/explant proxy; and valve reintervention composite. Readmission and reintervention outcomes are same-hospital only. Time zero was index admission for mortality horizons and time-to-death models, index discharge for post-discharge readmission and reintervention outcomes, and index admission for in-hospital mortality.

Heart-failure readmission used ICD-9-CM 428* or ICD-10-CM I50* diagnosis evidence. Cardiac-related readmission used ICD-9-CM 390-459 or ICD-10-CM I* diagnosis evidence. MI used ICD-9-CM 410* or ICD-10-CM I21*/I22*. Stroke used ICD-9-CM 430*/431*/432*/433*/434*/436*/437*/438* or ICD-10-CM I60*/I61*/I62*/I63*/I64*, excluding ICD-9-CM 435/TIA. Valve reintervention combined later TAVR, later SAVR, and ICD-10-PCS title-based revision/explant proxy evidence. The full machine-readable outcome phenotype record is saved as `outcome-phenotypes.json`.

### Statistical Analysis

We generated baseline summaries, outcome counts by horizon, adjusted logistic models for selected binary outcomes, event-specific Cox proportional-hazards models for time-to-event outcomes, and a propensity-score matched sensitivity analysis for hemodialysis/unspecified dialysis versus non-dialysis. Formal adjusted models excluded peritoneal dialysis patients and same-admission mixed SAVR/TAVR patients because those strata were too small for stable adjusted inference. Models included dialysis group, valve strategy, age, sex, Charlson comorbidity index, insurance, and anchor-year group when appropriate and feasible. Models used complete-case rows for the required outcome and adjustment variables. Missing data were handled by complete-case exclusion rather than imputation, and models were not interpreted when event counts were too sparse. Nonfatal readmission/reintervention Cox models censor deaths before nonfatal events; Fine-Gray competing-risk models were not estimated in this MIMIC redo.

## Results

### One-Year Outcomes

- SAVR / hemodialysis_or_unspecified_dialysis: n=113; death 40/113 (35.4%); HF readmission 21/113 (18.6%); cardiac readmission 42/113 (37.2%); MACE 45/113 (39.8%); valve reintervention 2/113 (1.8%).
- SAVR / non_dialysis: n=2,925; death 135/2925 (4.6%); HF readmission 293/2925 (10.0%); cardiac readmission 763/2925 (26.1%); MACE 226/2925 (7.7%); valve reintervention 14/2925 (0.5%).
- SAVR / peritoneal_dialysis: n=9; death 3/9 (33.3%); HF readmission 1/9 (11.1%); cardiac readmission 4/9 (44.4%); MACE 4/9 (44.4%); valve reintervention 0/9 (0.0%).
- TAVR / hemodialysis_or_unspecified_dialysis: n=54; death 20/54 (37.0%); HF readmission 17/54 (31.5%); cardiac readmission 21/54 (38.9%); MACE 20/54 (37.0%); valve reintervention 2/54 (3.7%).
- TAVR / non_dialysis: n=1,146; death 166/1146 (14.5%); HF readmission 287/1146 (25.0%); cardiac readmission 404/1146 (35.3%); MACE 210/1146 (18.3%); valve reintervention 13/1146 (1.1%).
- TAVR / peritoneal_dialysis: n=3; death 0/3 (0.0%); HF readmission 2/3 (66.7%); cardiac readmission 3/3 (100.0%); MACE 1/3 (33.3%); valve reintervention 0/3 (0.0%).
- mixed_savr_tavr_same_admission / non_dialysis: n=5; death 3/5 (60.0%); HF readmission 1/5 (20.0%); cardiac readmission 1/5 (20.0%); MACE 4/5 (80.0%); valve reintervention 0/5 (0.0%).

### Baseline Characteristics

- SAVR / hemodialysis_or_unspecified_dialysis: n=113; median age 66.0; median Charlson 7.0; male 77/113 (68.1%).
- SAVR / non_dialysis: n=2,925; median age 71.0; median Charlson 4.0; male 1928/2925 (65.9%).
- SAVR / peritoneal_dialysis: n=9; median age 62.0; median Charlson 7.0; male 4/9 (44.4%).
- TAVR / hemodialysis_or_unspecified_dialysis: n=54; median age 78.5; median Charlson 8.0; male 39/54 (72.2%).
- TAVR / non_dialysis: n=1,146; median age 82.0; median Charlson 6.0; male 613/1146 (53.5%).
- TAVR / peritoneal_dialysis: n=3; median age 69.0; median Charlson 7.0; male 1/3 (33.3%).
- mixed_savr_tavr_same_admission / non_dialysis: n=5; median age 79.0; median Charlson 6.0; male 4/5 (80.0%).

### Missingness

- admission_age: 0/4255 missing (0.0%).
- male: 0/4255 missing (0.0%).
- charlson_comorbidity_index: 0/4255 missing (0.0%).
- insurance: 12/4255 missing (0.3%).
- anchor_year_group: 0/4255 missing (0.0%).
- valve_strategy: 0/4255 missing (0.0%).
- dialysis_group: 0/4255 missing (0.0%).

### Outcomes Across Follow-Up Horizons

The following horizon summaries collapse across SAVR/TAVR strategy to show the overall dialysis-status gradient. Readmission and reintervention outcomes remain same-hospital only.

- hemodialysis_or_unspecified_dialysis at 30d: death 24/167 (14.4%); HF readmission 22/167 (13.2%); cardiac readmission 41/167 (24.6%); MACE 28/167 (16.8%); valve reintervention 1/167 (0.6%).
- hemodialysis_or_unspecified_dialysis at 1y: death 60/167 (35.9%); HF readmission 38/167 (22.8%); cardiac readmission 63/167 (37.7%); MACE 65/167 (38.9%); valve reintervention 4/167 (2.4%).
- hemodialysis_or_unspecified_dialysis at 3y: death 75/167 (44.9%); HF readmission 49/167 (29.3%); cardiac readmission 78/167 (46.7%); MACE 82/167 (49.1%); valve reintervention 4/167 (2.4%).
- hemodialysis_or_unspecified_dialysis at 5y: death 83/167 (49.7%); HF readmission 54/167 (32.3%); cardiac readmission 81/167 (48.5%); MACE 88/167 (52.7%); valve reintervention 4/167 (2.4%).
- hemodialysis_or_unspecified_dialysis at 10y: death 86/167 (51.5%); HF readmission 57/167 (34.1%); cardiac readmission 83/167 (49.7%); MACE 93/167 (55.7%); valve reintervention 4/167 (2.4%).
- non_dialysis at 30d: death 65/4076 (1.6%); HF readmission 290/4076 (7.1%); cardiac readmission 663/4076 (16.3%); MACE 137/4076 (3.4%); valve reintervention 12/4076 (0.3%).
- non_dialysis at 1y: death 304/4076 (7.5%); HF readmission 581/4076 (14.3%); cardiac readmission 1168/4076 (28.7%); MACE 440/4076 (10.8%); valve reintervention 27/4076 (0.7%).
- non_dialysis at 3y: death 440/4076 (10.8%); HF readmission 760/4076 (18.6%); cardiac readmission 1442/4076 (35.4%); MACE 613/4076 (15.0%); valve reintervention 37/4076 (0.9%).
- non_dialysis at 5y: death 526/4076 (12.9%); HF readmission 870/4076 (21.3%); cardiac readmission 1590/4076 (39.0%); MACE 734/4076 (18.0%); valve reintervention 60/4076 (1.5%).
- non_dialysis at 10y: death 643/4076 (15.8%); HF readmission 973/4076 (23.9%); cardiac readmission 1701/4076 (41.7%); MACE 856/4076 (21.0%); valve reintervention 92/4076 (2.3%).
- peritoneal_dialysis at 30d: death 2/12 (16.7%); HF readmission 0/12 (0.0%); cardiac readmission 3/12 (25.0%); MACE 3/12 (25.0%); valve reintervention 0/12 (0.0%).
- peritoneal_dialysis at 1y: death 3/12 (25.0%); HF readmission 3/12 (25.0%); cardiac readmission 7/12 (58.3%); MACE 5/12 (41.7%); valve reintervention 0/12 (0.0%).
- peritoneal_dialysis at 3y: death 6/12 (50.0%); HF readmission 6/12 (50.0%); cardiac readmission 8/12 (66.7%); MACE 8/12 (66.7%); valve reintervention 0/12 (0.0%).
- peritoneal_dialysis at 5y: death 8/12 (66.7%); HF readmission 6/12 (50.0%); cardiac readmission 8/12 (66.7%); MACE 9/12 (75.0%); valve reintervention 0/12 (0.0%).
- peritoneal_dialysis at 10y: death 8/12 (66.7%); HF readmission 6/12 (50.0%); cardiac readmission 8/12 (66.7%); MACE 9/12 (75.0%); valve reintervention 0/12 (0.0%).

### Code And Phenotype QA

- User-supplied dialysis and peritoneal-dialysis codes observed in the local tables: 49324, 49325, 49420, 49421, 49422, 49435, 5498, 5856, N186, V4511, V560, V561, V562, V5631, V568, Z992.
- Auxiliary hemodialysis CPT/HCPCS scan codes observed: 90935, 90945, G0257.
- Auxiliary TAVR CPT/HCPCS scan codes observed: 0256T, 33361.
- Auxiliary SAVR CPT/HCPCS scan codes observed: none.
- ICD-10-PCS aortic-valve replacement classification was derived from code-axis/title logic and should be treated as a reviewed phenotype rule, not a raw exact-code list.

### Adjusted Model Findings

- logistic death_1y / dialysis_hd_unspecified: OR 4.44 (95% CI 3.04-6.49); p=1.07e-14; n=4238, events=361.
- logistic death_1y / valve_tavr: OR 1.78 (95% CI 1.36-2.33); p=2.43e-05; n=4238, events=361.
- logistic death_5y / dialysis_hd_unspecified: OR 4.00 (95% CI 2.80-5.71); p=2.38e-14; n=4238, events=606.
- logistic death_5y / valve_tavr: OR 2.27 (95% CI 1.82-2.82); p=2.21e-13; n=4238, events=606.
- logistic mace_1y / dialysis_hd_unspecified: OR 3.04 (95% CI 2.12-4.35); p=1.33e-09; n=4238, events=501.
- logistic mace_1y / valve_tavr: OR 1.55 (95% CI 1.23-1.95); p=0.000225; n=4238, events=501.
- logistic mace_5y / dialysis_hd_unspecified: OR 2.83 (95% CI 2.00-3.99); p=3.71e-09; n=4238, events=818.
- logistic mace_5y / valve_tavr: OR 1.87 (95% CI 1.54-2.27); p=3.04e-10; n=4238, events=818.
- logistic hf_1y / dialysis_hd_unspecified: OR 0.91 (95% CI 0.61-1.36); p=0.642; n=4238, events=618.
- logistic hf_1y / valve_tavr: OR 2.05 (95% CI 1.66-2.53); p=2.68e-11; n=4238, events=618.
- logistic cardiac_1y / dialysis_hd_unspecified: OR 1.01 (95% CI 0.72-1.42); p=0.932; n=4238, events=1230.
- logistic cardiac_1y / valve_tavr: OR 1.38 (95% CI 1.17-1.64); p=0.000178; n=4238, events=1230.
- cox death / dialysis_hd_unspecified: HR 2.63 (95% CI 2.07-3.34); p=2.63e-15; n=4231, events=723.
- cox death / valve_tavr: HR 1.47 (95% CI 1.25-1.74); p=5.25e-06; n=4231, events=723.
- cox hf_readmission / dialysis_hd_unspecified: HR 0.95 (95% CI 0.72-1.25); p=0.707; n=4222, events=1013.
- cox hf_readmission / valve_tavr: HR 1.38 (95% CI 1.20-1.60); p=1.18e-05; n=4222, events=1013.
- cox cardiac_readmission / dialysis_hd_unspecified: HR 1.00 (95% CI 0.79-1.27); p=0.989; n=4200, events=1745.
- cox cardiac_readmission / valve_tavr: HR 1.12 (95% CI 0.99-1.25); p=0.0634; n=4200, events=1745.
- cox mace / dialysis_hd_unspecified: HR 2.14 (95% CI 1.70-2.68); p=6.43e-11; n=4226, events=937.
- cox mace / valve_tavr: HR 1.30 (95% CI 1.12-1.50); p=0.000621; n=4226, events=937.
- cox valve_reintervention / dialysis_hd_unspecified: HR 0.79 (95% CI 0.27-2.27); p=0.657; n=4238, events=96.
- cox valve_reintervention / valve_tavr: HR 1.41 (95% CI 0.80-2.50); p=0.235; n=4238, events=96.

### Propensity-Score Sensitivity

The hemodialysis/unspecified versus non-dialysis matched sensitivity analysis used nearest-neighbor matching on the logit propensity score with a caliper of 0.250. The propensity model covariates were admission_age, male, charlson_comorbidity_index, valve_tavr, insurance_Medicare, insurance_Other, insurance_Private, insurance_missing, anchor_year_group_2011 - 2013, anchor_year_group_2014 - 2016, anchor_year_group_2017 - 2019, anchor_year_group_2020 - 2022. It matched 166 of 167 treated patients. Maximum absolute SMD after matching was 0.125; the full balance table is saved as `propensity-balance.csv` and Figure 4.
- death_1y: treated risk 0.361, control risk 0.139, risk difference 0.223 (95% CI 0.134 to 0.312); McNemar p=8e-06.
- mace_1y: treated risk 0.392, control risk 0.199, risk difference 0.193 (95% CI 0.098 to 0.287); McNemar p=0.000211.

## Discussion

This analysis consistently shows that dialysis-coded patients are a higher-risk subgroup after aortic valve replacement in the available MIMIC-IV hospital timeline. The hemodialysis/unspecified dialysis group had higher crude death and MACE rates than non-dialysis patients in both SAVR and TAVR strata. Peritoneal dialysis counts were too small for stable comparative inference.

The most important interpretation boundary is ascertainment. MIMIC can observe same-hospital readmissions and reinterventions, plus death-date-based mortality where available. It cannot prove that a patient did not have an outside-hospital heart-failure admission, MI, stroke, TAVR, SAVR, or explant.

## Limitations

- This is a single-center deidentified EHR analysis, not a national claims or registry study.
- Calendar years are approximated through MIMIC anchor-year groups; exact public dates are not available.
- Same-hospital readmission and reintervention outcomes may miss outside-hospital events.
- CPT/HCPCS evidence is incomplete in MIMIC; valve classification is mainly ICD procedure driven.
- Peritoneal dialysis was rare and should be treated as descriptive only.
- Event-specific Cox models do not estimate subdistribution hazards; nonfatal event analyses should not be read as Fine-Gray competing-risk estimates.
- Dialysis modality assignment is code-based and may misclassify outpatient modality.
- No causal conclusion is supported by this observational design.

## Figures

- Figure 1: one-year MACE proportions by valve strategy and dialysis group.
- Figure 2: mortality proportions across 30-day, 1-year, 3-year, 5-year, and 10-year horizons by dialysis group.
- Figure 3: adjusted Cox-model dialysis-group hazard ratios.
- Figure 4, when available: propensity-balance love plot for hemodialysis/unspecified dialysis versus non-dialysis.

## Reproducibility

Estimated GCS read cost was $0.0125; row-level cache files were removed after execution. The run directory contains aggregate code-match, cohort, outcome, model, propensity, figure, QA, source-inventory, and reviewer-context artifacts.

## References

- MIMIC-IV v3.1, PhysioNet: https://physionet.org/content/mimiciv/3.1/
- MIMIC-IV documentation: https://mimic.mit.edu/docs/iv/
- CDC ICD-10-CM information: https://www.cdc.gov/nchs/icd/icd-10-cm/index.html
- CMS ICD-10 coding resources: https://www.cms.gov/medicare/coding-billing/icd-10-codes
- CMS CPT/HCPCS code-list resources: https://www.cms.gov/medicare/regulations-guidance/physician-self-referral/list-cpt-hcpcs-codes
