# Acute Kidney Injury ICU Mortality

## Abstract

Background: This study analyzes ICU data to answer a prespecified clinical research question: Among ICU admissions with AKI diagnosis codes or derived AKI stages, how strongly does AKI severity predict mortality?

Objective: Among ICU admissions with AKI diagnosis codes or derived AKI stages, how strongly does AKI severity predict mortality?

Design: This was an observational dataset analysis with interpretation bounded to the analyzed data.

Participants: The source cohort included 25658 records; the most restrictive model complete-case sample included 25411 records.

Methods: Cohort construction, descriptive summaries, and model outputs were extracted from the runner analysis artifacts. Detected model family: logistic with 9 modeled predictors.

Results: The mortality model included 25431 complete-case records, 5289 deaths, AUROC 0.714, average precision 0.388. The ICU length-of-stay model included 25411 complete-case records with R-squared 0.331.

Conclusion: The analysis produced interpretable local evidence, but methods review is required before stronger claims.

## Introduction

The prespecified research question was: Among ICU admissions with AKI diagnosis codes or derived AKI stages, how strongly does AKI severity predict mortality? The intent is to provide a reproducible local analysis of cohort construction, baseline characteristics, model results, missingness, and limitations, while keeping causal and deployment claims out of scope.

## Methods

### Statistical Analysis

Diagnosis-code families were verified online before execution, then matched against the local MIMIC diagnosis dictionary. The primary cohort used the first ICU stay per matching hospitalization. Models used complete-case analysis for available first-day severity, laboratory, and vital-sign predictors.

## Results

### Cohort

- Matched diagnosis codes: 11.
- Matched diagnosis rows: 73580.
- Matched hospital admissions: 73202.
- First ICU stay cohort rows: 25658.
- Unique patients: 21251.

### Cohort Characteristics

- admission_age: median 70.00 (IQR 58.00-80.00), n=25658.
- los_icu: median 2.54 (IQR 1.33-5.25), n=25649.
- los_hospital: median 10.00 (IQR 5.00-17.00), n=25658.
- In-hospital mortality: 5370 of 25658 (20.9%).
- Male sex: 15167 of 25658 (59.1%).

### Mortality Model

Complete-case N=25431; deaths=5289; AUROC=0.714; average precision=0.388.
- aki_stage: adjusted OR 2.17 (2.01, 2.33), p=8.6e-95, per 1 SD.
- bun_max: adjusted OR 1.33 (1.28, 1.39), p=5.41e-43, per 1 SD.
- wbc_max: adjusted OR 1.18 (1.14, 1.22), p=8.58e-23, per 1 SD.
- admission_age: adjusted OR 1.16 (1.12, 1.20), p=5e-17, per 1 SD.
- creatinine_max: adjusted OR 0.84 (0.80, 0.88), p=4.65e-13, per 1 SD.
- hemoglobin_min: adjusted OR 0.93 (0.90, 0.96), p=1.91e-05, per 1 SD.

### ICU Length Of Stay Model

Complete-case N=25411; R-squared=0.331.
- aki_stage: 41.5% change (40.0%, 43.0%), p=0, per 1 SD.
- aki_stage_smoothed: 10.1% change (9.1%, 11.3%), p=1.5e-80, per 1 SD.
- admission_age: -6.7% change (-7.5%, -6.0%), p=1.83e-66, per 1 SD.
- creatinine_max: -7.5% change (-8.7%, -6.3%), p=2.73e-32, per 1 SD.
- male: 4.7% change (3.1%, 6.3%), p=7.68e-09, per unit.
- bun_max: 3.3% change (2.1%, 4.4%), p=1.6e-08, per 1 SD.

### Missingness

- wbc_max: 175 missing (0.7%).
- hemoglobin_min: 173 missing (0.7%).
- glucose_max: 147 missing (0.6%).
- bun_max: 116 missing (0.5%).
- creatinine_max: 114 missing (0.4%).
- los_icu: 9 missing (0.0%).
- admission_age: 0 missing (0.0%).
- male: 0 missing (0.0%).
- aki_stage: 0 missing (0.0%).
- aki_stage_smoothed: 0 missing (0.0%).

## Discussion

The result should be interpreted conservatively as local evidence from the analyzed dataset.

The findings should be interpreted as local observational evidence from the analyzed ICU cohort. They should not be read as causal estimates, clinical recommendations, or externally validated prediction-model performance unless separate design and validation evidence is added.

## Limitations

- This is an observational diagnosis-code-based analysis.
- Diagnosis codes may reflect billing/coding and may not perfectly identify clinical onset, severity, or reason for ICU admission.
- First-day variables may be care-process markers as well as illness-severity markers.
- Complete-case models should be reviewed before publication-quality use.

## What This Does And Does Not Show

- This report describes the analyzed cohort, model results, missingness, quality checks, and reproducibility evidence.
- It does not establish causality, treatment benefit, clinical deployability, or external validity.
- Prediction or risk-marker language should be interpreted as internal/local evidence unless calibration and validation evidence are provided.

## Reproducibility

### Quality And Cost Controls

- QA status: pass.
- Estimated run cost: $0.0367.
- Cumulative estimated session cost: $0.1782 of $1.00.
- Temporary row-level cache removed: yes.

Artifact inventory hash: b4a18117cd14934b465a6e4d0cebeb6814f0d7231adc0d35a96359b567d67493.
