# MIMIC-IV v3.1 Bounded Data Audit

Generated: 2026-05-06T18:24:21.430385+00:00

## Cost And Scope Guard

- Hard actual-read cap: 256 MiB.
- Actual copied/read Parquet bytes: 239.11 MiB.
- Conservative transfer estimate at $0.12/GB: $0.0280.
- Estimated Class B object-read/list operations: under $0.0040 at this scale.
- Temporary row-level Parquet cache is removed after aggregate profiling.

## Profiled Tables

- `derived-acei`: 135153 rows, 3.08 MiB.
- `derived-age`: 546028 rows, 9.62 MiB.
- `derived-antibiotic`: 949901 rows, 20.54 MiB.
- `derived-apsiii`: 94458 rows, 2.20 MiB.
- `derived-arb`: 53603 rows, 1.35 MiB.
- `derived-cardiac-marker`: 380131 rows, 8.20 MiB.
- `derived-charlson`: 546028 rows, 7.04 MiB.
- `derived-code-status`: 354306 rows, 6.28 MiB.
- `derived-creatinine-baseline`: 546028 rows, 3.10 MiB.
- `derived-crrt`: 475214 rows, 7.30 MiB.
- `derived-dobutamine`: 10264 rows, 0.38 MiB.
- `derived-dopamine`: 18085 rows, 0.66 MiB.
- `derived-epinephrine`: 31495 rows, 1.17 MiB.
- `derived-first-day-bg`: 94458 rows, 2.71 MiB.
- `derived-first-day-bg-art`: 94458 rows, 2.37 MiB.
- `derived-first-day-gcs`: 94458 rows, 1.20 MiB.
- `derived-first-day-height`: 94458 rows, 1.17 MiB.
- `derived-first-day-lab`: 94458 rows, 6.77 MiB.
- `derived-first-day-rrt`: 94458 rows, 1.12 MiB.
- `derived-first-day-sofa`: 94458 rows, 1.92 MiB.
- `derived-first-day-urine-output`: 94458 rows, 1.21 MiB.
- `derived-first-day-vitalsign`: 94458 rows, 5.35 MiB.
- `derived-first-day-weight`: 94458 rows, 1.37 MiB.
- `derived-height`: 43342 rows, 0.98 MiB.
- `derived-icp`: 243283 rows, 2.08 MiB.
- `derived-icustay-detail`: 94458 rows, 5.79 MiB.
- `derived-icustay-times`: 94458 rows, 3.49 MiB.
- `derived-inflammation`: 174269 rows, 3.77 MiB.
- `derived-invasive-line`: 108165 rows, 2.37 MiB.
- `derived-lods`: 94458 rows, 1.86 MiB.
- `derived-meld`: 94458 rows, 2.01 MiB.
- `derived-metadata`: 3 rows, 0.00 MiB.
- `derived-milrinone`: 10668 rows, 0.40 MiB.
- `derived-neuroblock`: 19430 rows, 0.78 MiB.
- `derived-nsaid`: 293253 rows, 6.78 MiB.
- `derived-oasis`: 94458 rows, 2.88 MiB.
- `derived-oxygen-delivery`: 794232 rows, 8.23 MiB.
- `hosp-admissions`: 546028 rows, 22.13 MiB.
- `hosp-d-hcpcs`: 89208 rows, 0.99 MiB.
- `hosp-d-icd-diagnoses`: 112107 rows, 1.89 MiB.
- `hosp-d-icd-procedures`: 86423 rows, 1.46 MiB.
- `hosp-d-labitems`: 1650 rows, 0.02 MiB.
- `hosp-diagnoses-icd`: 6364488 rows, 57.61 MiB.
- `hosp-drgcodes`: 761856 rows, 7.68 MiB.
- `hosp-hcpcsevents`: 186074 rows, 2.49 MiB.
- `hosp-patients`: 364627 rows, 2.46 MiB.
- `hosp-provider`: 42244 rows, 0.31 MiB.
- `icu-caregiver`: 17984 rows, 0.10 MiB.
- `icu-d-items`: 4095 rows, 0.12 MiB.
- `icu-icustays`: 94458 rows, 4.32 MiB.

## Findings Summary

- Blockers: 1.
- Warnings: 41.
- Notes: 31.

## Important Warnings

- `NEGATIVE_PLAUSIBILITY_VALUE` at `derived-crrt.citrate`: citrate has minimum -123.0, which may be implausible depending on coding.
- `NEGATIVE_PLAUSIBILITY_VALUE` at `derived-crrt.dialysate_rate`: dialysate_rate has minimum -50.0, which may be implausible depending on coding.
- `VERY_HIGH_MISSINGNESS` at `derived-crrt.heparin_concentration`: heparin_concentration is 97.9% missing in the profiled table.
- `NEGATIVE_PLAUSIBILITY_VALUE` at `derived-crrt.prefilter_replacement_rate`: prefilter_replacement_rate has minimum -601600.0, which may be implausible depending on coding.
- `NEGATIVE_PLAUSIBILITY_VALUE` at `derived-crrt.postfilter_replacement_rate`: postfilter_replacement_rate has minimum -35300.0, which may be implausible depending on coding.
- `NEGATIVE_PLAUSIBILITY_VALUE` at `derived-crrt.replacement_rate`: replacement_rate has minimum -1800.0, which may be implausible depending on coding.
- `NEGATIVE_PLAUSIBILITY_VALUE` at `derived-crrt.ultrafiltrate_output`: ultrafiltrate_output has minimum -600.0, which may be implausible depending on coding.
- `VERY_HIGH_MISSINGNESS` at `derived-crrt.clots_increasing`: clots_increasing is 99.1% missing in the profiled table.
- `VERY_HIGH_MISSINGNESS` at `derived-crrt.clotted`: clotted is 99.6% missing in the profiled table.
- `VERY_HIGH_MISSINGNESS` at `derived-first-day-bg.bicarbonate_min`: bicarbonate_min is 97.2% missing in the profiled table.
- `VERY_HIGH_MISSINGNESS` at `derived-first-day-bg.bicarbonate_max`: bicarbonate_max is 97.2% missing in the profiled table.
- `VERY_HIGH_MISSINGNESS` at `derived-first-day-bg.carboxyhemoglobin_min`: carboxyhemoglobin_min is 98.2% missing in the profiled table.
- `VERY_HIGH_MISSINGNESS` at `derived-first-day-bg.carboxyhemoglobin_max`: carboxyhemoglobin_max is 98.2% missing in the profiled table.
- `VERY_HIGH_MISSINGNESS` at `derived-first-day-bg.methemoglobin_min`: methemoglobin_min is 98.3% missing in the profiled table.
- `VERY_HIGH_MISSINGNESS` at `derived-first-day-bg.methemoglobin_max`: methemoglobin_max is 98.3% missing in the profiled table.
- `VERY_HIGH_MISSINGNESS` at `derived-first-day-bg-art.bicarbonate_min`: bicarbonate_min is 98.2% missing in the profiled table.
- `VERY_HIGH_MISSINGNESS` at `derived-first-day-bg-art.bicarbonate_max`: bicarbonate_max is 98.2% missing in the profiled table.
- `VERY_HIGH_MISSINGNESS` at `derived-first-day-bg-art.carboxyhemoglobin_min`: carboxyhemoglobin_min is 99.1% missing in the profiled table.
- `VERY_HIGH_MISSINGNESS` at `derived-first-day-bg-art.carboxyhemoglobin_max`: carboxyhemoglobin_max is 99.1% missing in the profiled table.
- `VERY_HIGH_MISSINGNESS` at `derived-first-day-bg-art.methemoglobin_min`: methemoglobin_min is 99.2% missing in the profiled table.
- `VERY_HIGH_MISSINGNESS` at `derived-first-day-bg-art.methemoglobin_max`: methemoglobin_max is 99.2% missing in the profiled table.
- `VERY_HIGH_MISSINGNESS` at `derived-first-day-lab.globulin_min`: globulin_min is 98.9% missing in the profiled table.
- `VERY_HIGH_MISSINGNESS` at `derived-first-day-lab.globulin_max`: globulin_max is 98.9% missing in the profiled table.
- `VERY_HIGH_MISSINGNESS` at `derived-first-day-lab.total_protein_min`: total_protein_min is 97.9% missing in the profiled table.
- `VERY_HIGH_MISSINGNESS` at `derived-first-day-lab.total_protein_max`: total_protein_max is 97.9% missing in the profiled table.
- `VERY_HIGH_MISSINGNESS` at `derived-first-day-lab.d_dimer_min`: d_dimer_min is 98.9% missing in the profiled table.
- `VERY_HIGH_MISSINGNESS` at `derived-first-day-lab.d_dimer_max`: d_dimer_max is 98.9% missing in the profiled table.
- `VERY_HIGH_MISSINGNESS` at `derived-first-day-lab.thrombin_min`: thrombin_min is 99.8% missing in the profiled table.
- `VERY_HIGH_MISSINGNESS` at `derived-first-day-lab.thrombin_max`: thrombin_max is 99.8% missing in the profiled table.
- `VERY_HIGH_MISSINGNESS` at `derived-first-day-lab.bilirubin_direct_min`: bilirubin_direct_min is 95.8% missing in the profiled table.
- `VERY_HIGH_MISSINGNESS` at `derived-first-day-lab.bilirubin_direct_max`: bilirubin_direct_max is 95.8% missing in the profiled table.
- `VERY_HIGH_MISSINGNESS` at `derived-first-day-lab.bilirubin_indirect_min`: bilirubin_indirect_min is 96.1% missing in the profiled table.
- `VERY_HIGH_MISSINGNESS` at `derived-first-day-lab.bilirubin_indirect_max`: bilirubin_indirect_max is 96.1% missing in the profiled table.
- `VERY_HIGH_MISSINGNESS` at `derived-first-day-lab.ggt_min`: ggt_min is 99.3% missing in the profiled table.
- `VERY_HIGH_MISSINGNESS` at `derived-first-day-lab.ggt_max`: ggt_max is 99.3% missing in the profiled table.
- `VERY_HIGH_MISSINGNESS` at `derived-first-day-rrt.dialysis_type`: dialysis_type is 96.7% missing in the profiled table.
- `VERY_HIGH_MISSINGNESS` at `derived-oxygen-delivery.o2_delivery_device_3`: o2_delivery_device_3 is 99.4% missing in the profiled table.
- `VERY_HIGH_MISSINGNESS` at `derived-oxygen-delivery.o2_delivery_device_4`: o2_delivery_device_4 is 100.0% missing in the profiled table.
- `VERY_HIGH_MISSINGNESS` at `hosp-admissions.deathtime`: deathtime is 97.8% missing in the profiled table.
- `VERY_HIGH_MISSINGNESS` at `icu-d-items.lownormalvalue`: lownormalvalue is 99.5% missing in the profiled table.

## High Missingness Columns

- `derived-oxygen-delivery.o2_delivery_device_4`: 100.0% missing.
- `derived-first-day-lab.thrombin_min`: 99.8% missing.
- `derived-first-day-lab.thrombin_max`: 99.8% missing.
- `derived-crrt.clotted`: 99.6% missing.
- `icu-d-items.lownormalvalue`: 99.5% missing.
- `icu-d-items.highnormalvalue`: 99.5% missing.
- `derived-oxygen-delivery.o2_delivery_device_3`: 99.4% missing.
- `derived-first-day-lab.ggt_min`: 99.3% missing.
- `derived-first-day-lab.ggt_max`: 99.3% missing.
- `derived-first-day-bg-art.methemoglobin_min`: 99.2% missing.
- `derived-first-day-bg-art.methemoglobin_max`: 99.2% missing.
- `derived-first-day-bg-art.carboxyhemoglobin_min`: 99.1% missing.
- `derived-first-day-bg-art.carboxyhemoglobin_max`: 99.1% missing.
- `derived-crrt.clots_increasing`: 99.1% missing.
- `derived-first-day-lab.d_dimer_min`: 98.9% missing.
- `derived-first-day-lab.d_dimer_max`: 98.9% missing.
- `derived-first-day-lab.globulin_min`: 98.9% missing.
- `derived-first-day-lab.globulin_max`: 98.9% missing.
- `derived-first-day-bg.methemoglobin_min`: 98.3% missing.
- `derived-first-day-bg.methemoglobin_max`: 98.3% missing.
- `derived-first-day-bg-art.bicarbonate_min`: 98.2% missing.
- `derived-first-day-bg-art.bicarbonate_max`: 98.2% missing.
- `derived-first-day-bg.carboxyhemoglobin_min`: 98.2% missing.
- `derived-first-day-bg.carboxyhemoglobin_max`: 98.2% missing.
- `derived-crrt.heparin_concentration`: 97.9% missing.
- `derived-first-day-lab.total_protein_min`: 97.9% missing.
- `derived-first-day-lab.total_protein_max`: 97.9% missing.
- `hosp-admissions.deathtime`: 97.8% missing.
- `derived-first-day-bg.bicarbonate_min`: 97.2% missing.
- `derived-first-day-bg.bicarbonate_max`: 97.2% missing.

## Practical Implications

- The profiled subset is suitable for building first-pass cohorts around admissions, ICU stays, first-day labs/vitals, severity scores, and diagnosis codes.
- Very large event tables such as chartevents, labevents, emar, pharmacy, inputevents, and prescriptions still need query-specific bounded scans before use.
- Any generated study should record exactly which profiled tables were used and whether unprofiled large tables were touched.
- Avoid row-level export in reports; keep outputs aggregate and de-identified.
