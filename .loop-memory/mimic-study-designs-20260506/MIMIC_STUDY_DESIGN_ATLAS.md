# MIMIC-IV Study Design Atlas

This atlas acquaints the research pipeline with MIMIC-IV by designing study candidates from the current dataset artifacts. It performs no new row-level cloud reads.

## Cost Guard

- User ceiling: `$1.00`.
- New estimated cloud spend in this design run: `$0.0000`.
- No BigQuery queries and no GCS Parquet copies were performed.

## Online ICD Verification

- All ICD families verified online: `True`.
- Unique online lookups: 61.
- Sources: CDC/NCHS ICD-10-CM page plus NLM Clinical Tables ICD-10-CM and ICD-9-CM diagnosis APIs.

## Studies

- `mimic-ortho-hip-fracture-icu` (orthopedics): Among ICU stays linked to hip or femur fracture admissions, which first-day severity and physiologic markers are associated with mortality and ICU length of stay? Decision: `promote_to_candidate_queue`; feasibility `ready_for_bounded_design`.
- `mimic-ortho-geriatric-hip-fracture` (orthopedics): Among patients aged 65+ with femoral neck, intertrochanteric, or subtrochanteric fracture codes, what predicts mortality and prolonged ICU stay? Decision: `promote_to_candidate_queue`; feasibility `ready_for_bounded_design`.
- `mimic-ortho-periprosthetic-hip-fracture` (orthopedics): How do ICU outcomes for periprosthetic hip fracture admissions compare with other hip/femur fracture admissions? Decision: `promote_to_candidate_queue`; feasibility `ready_for_bounded_design`.
- `mimic-spine-vertebral-fracture-icu` (orthopedics-spine): Among ICU patients with vertebral fracture diagnoses, what first-day factors predict mortality and ICU length of stay? Decision: `promote_to_candidate_queue`; feasibility `ready_for_bounded_design`.
- `mimic-ortho-osteomyelitis-icu` (orthopedic-infection): What severity and comorbidity patterns characterize ICU stays with osteomyelitis diagnosis codes? Decision: `promote_to_candidate_queue`; feasibility `ready_for_bounded_design`.
- `mimic-ortho-septic-arthritis-icu` (orthopedic-infection): Among ICU patients with septic arthritis codes, what predicts mortality and prolonged stay? Decision: `promote_to_candidate_queue`; feasibility `ready_for_bounded_design`.
- `mimic-ortho-prosthetic-joint-infection` (orthopedic-infection): Are prosthetic joint infection diagnoses associated with higher ICU resource use than other orthopedic infection diagnoses? Decision: `promote_to_candidate_queue`; feasibility `ready_for_bounded_design`.
- `mimic-trauma-lower-extremity-fracture-aki` (trauma-renal): Among ICU admissions with lower-extremity fracture diagnoses, how common is early renal dysfunction and is it associated with mortality? Decision: `promote_to_candidate_queue`; feasibility `ready_for_bounded_design`.
- `mimic-cardiology-mi-icu-mortality` (cardiology): Which first-day ICU features predict in-hospital mortality among admissions with acute myocardial infarction codes? Decision: `promote_to_candidate_queue`; feasibility `ready_for_bounded_design`.
- `mimic-cardiology-heart-failure-icu` (cardiology): Among ICU admissions with heart failure diagnoses, how do first-day renal and vital-sign features relate to mortality and ICU length of stay? Decision: `promote_to_candidate_queue`; feasibility `ready_for_bounded_design`.
- `mimic-pulmonary-copd-respiratory-failure` (pulmonary): Among ICU patients with COPD and/or acute respiratory failure codes, which first-day respiratory markers predict mortality? Decision: `promote_to_candidate_queue`; feasibility `ready_for_bounded_design`.
- `mimic-renal-aki-icu-mortality` (renal): Among ICU admissions with AKI diagnosis codes or derived AKI stages, how strongly does AKI severity predict mortality? Decision: `promote_to_candidate_queue`; feasibility `needs_table_or_profile_review`.
- `mimic-renal-ckd-fracture-interaction` (ortho-renal): In hip/femur fracture ICU patients, is chronic kidney disease associated with mortality after severity adjustment? Decision: `promote_to_candidate_queue`; feasibility `ready_for_bounded_design`.
- `mimic-endocrine-diabetes-fracture-outcomes` (ortho-endocrine): Among hip/femur fracture ICU patients, is diabetes diagnosis associated with mortality or prolonged ICU stay? Decision: `promote_to_candidate_queue`; feasibility `ready_for_bounded_design`.
- `mimic-neuro-stroke-icu-mortality` (neurology): Among ICU admissions with ischemic stroke codes, which first-day severity and physiologic variables predict mortality? Decision: `promote_to_candidate_queue`; feasibility `ready_for_bounded_design`.
- `mimic-neuro-intracranial-hemorrhage` (neurology): Among ICU admissions with intracranial hemorrhage diagnoses, how do first-day GCS and vital signs predict mortality? Decision: `promote_to_candidate_queue`; feasibility `ready_for_bounded_design`.
- `mimic-gi-upper-bleed-icu` (gastroenterology): Among ICU admissions with gastrointestinal bleeding codes, are first-day hemoglobin and hemodynamic markers associated with mortality and prolonged stay? Decision: `promote_to_candidate_queue`; feasibility `ready_for_bounded_design`.
- `mimic-liver-cirrhosis-icu` (hepatology): Among ICU admissions with cirrhosis codes, how do MELD-like derived variables and first-day labs relate to mortality? Decision: `promote_to_candidate_queue`; feasibility `ready_for_bounded_design`.
- `mimic-sepsis-icu-mortality` (critical-care): Among ICU admissions with sepsis diagnosis codes, which first-day severity scores and labs predict mortality? Decision: `hold_for_review`; feasibility `needs_table_or_profile_review`.
- `mimic-pneumonia-respiratory-outcomes` (pulmonary-infection): Among ICU admissions with pneumonia codes, what respiratory and oxygen-delivery features are associated with mortality? Decision: `promote_to_candidate_queue`; feasibility `ready_for_bounded_design`.
- `mimic-anemia-icu-outcomes` (hematology): Among ICU admissions with anemia codes, do first-day hemoglobin values and comorbidity burden predict mortality? Decision: `promote_to_candidate_queue`; feasibility `ready_for_bounded_design`.
- `mimic-delirium-icu-los` (neurocritical-care): Are delirium or encephalopathy diagnosis codes associated with prolonged ICU stay after severity adjustment? Decision: `promote_to_candidate_queue`; feasibility `ready_for_bounded_design`.
- `mimic-obesity-icu-outcomes` (metabolic): Among ICU patients, are obesity diagnosis codes associated with mortality or ICU length of stay after severity adjustment? Decision: `promote_to_candidate_queue`; feasibility `ready_for_bounded_design`.
- `mimic-opioid-overdose-icu` (toxicology): Among ICU admissions with opioid poisoning codes, what first-day factors are associated with mortality and length of stay? Decision: `promote_to_candidate_queue`; feasibility `ready_for_bounded_design`.
