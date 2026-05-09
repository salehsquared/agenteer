# COPD And Respiratory Failure ICU Outcomes

## Abstract

Background: This study analyzes ICU data to answer a prespecified clinical research question: Among ICU patients with COPD and/or acute respiratory failure codes, which first-day respiratory markers predict mortality?

Objective: Among ICU patients with COPD and/or acute respiratory failure codes, which first-day respiratory markers predict mortality?

Design: This was an observational dataset analysis with interpretation bounded to the analyzed data.

Participants: The source cohort included 25835 records; the most restrictive model complete-case sample included 4679 records.

Methods: Cohort construction, descriptive summaries, and model outputs were extracted from the runner analysis artifacts. Detected model family: logistic with 7 modeled predictors.

Results: The mortality model included 4680 complete-case records, 1116 deaths, AUROC 0.751, average precision 0.507. The ICU length-of-stay model included 4679 complete-case records with R-squared 0.044.

Conclusion: The analysis produced interpretable local evidence, but methods review is required before stronger claims.

## Introduction

The prespecified research question was: Among ICU patients with COPD and/or acute respiratory failure codes, which first-day respiratory markers predict mortality? The intent is to provide a reproducible local analysis of cohort construction, baseline characteristics, model results, missingness, and limitations, while keeping causal and deployment claims out of scope.

## Methods

### Statistical Analysis

Diagnosis-code families were verified online before execution, then matched against the local MIMIC diagnosis dictionary. The primary cohort used the first ICU stay per matching hospitalization. Models used complete-case analysis for available first-day severity, laboratory, and vital-sign predictors.

## Results

### Cohort

- Matched diagnosis codes: 23.
- Matched diagnosis rows: 67320.
- Matched hospital admissions: 58145.
- First ICU stay cohort rows: 25835.
- Unique patients: 21370.

### Cohort Characteristics

- admission_age: median 69.00 (IQR 59.00-79.00), n=25835.
- los_icu: median 2.88 (IQR 1.38-6.29), n=25827.
- los_hospital: median 9.00 (IQR 5.00-17.00), n=25835.
- oasis: median 34.00 (IQR 28.00-40.00), n=25835.
- In-hospital mortality: 5856 of 25835 (22.7%).
- Male sex: 14137 of 25835 (54.7%).

### Mortality Model

Complete-case N=4680; deaths=1116; AUROC=0.751; average precision=0.507.
- oasis: adjusted OR 2.63 (2.39, 2.90), p=1.48e-86, per 1 SD.
- gcs: adjusted OR 1.25 (1.16, 1.35), p=1.48e-08, per 1 SD.
- glucose_max: adjusted OR 1.16 (1.08, 1.24), p=2.48e-05, per 1 SD.
- urineoutput: adjusted OR 0.82 (0.75, 0.90), p=2.58e-05, per 1 SD.
- hemoglobin_min: adjusted OR 1.10 (1.03, 1.19), p=0.00854, per 1 SD.
- admission_age: adjusted OR 0.93 (0.86, 1.00), p=0.0616, per 1 SD.

### ICU Length Of Stay Model

Complete-case N=4679; R-squared=0.044.
- oasis: 17.6% change (14.5%, 20.8%), p=6.9e-32, per 1 SD.
- admission_age: -9.0% change (-11.2%, -6.7%), p=4.57e-14, per 1 SD.
- urineoutput: 6.8% change (4.0%, 9.6%), p=1.11e-06, per 1 SD.
- gcs: 3.9% change (1.2%, 6.6%), p=0.00376, per 1 SD.
- hemoglobin_min: -3.8% change (-6.3%, -1.2%), p=0.00403, per 1 SD.
- male: 4.4% change (-0.5%, 9.4%), p=0.0786, per unit.

### Missingness

- hemoglobin_min: 20261 missing (78.4%).
- glucose_max: 18274 missing (70.7%).
- urineoutput: 1230 missing (4.8%).
- gcs: 106 missing (0.4%).
- los_icu: 8 missing (0.0%).
- admission_age: 0 missing (0.0%).
- male: 0 missing (0.0%).
- oasis: 0 missing (0.0%).
- hospital_expire_flag: 0 missing (0.0%).
- los_hospital: 0 missing (0.0%).

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
- Estimated run cost: $0.0095.
- Cumulative estimated session cost: $0.1302 of $1.00.
- Temporary row-level cache removed: yes.

Artifact inventory hash: 9e538449346ba1f562ec6ac5a1365a0726a414b76232bd7592af00a5c37c0e76.
