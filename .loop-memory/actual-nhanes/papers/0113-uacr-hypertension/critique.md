# Critique: Albuminuria and measured hypertension paper

## Passes

- Uses kidney-domain variables and threshold logic distinct from prior papers.
- Records UACR threshold provenance and states single-measure limitations.
- Includes merged sample construction and companion analysis JSON.
- Avoids causal and diagnostic overclaiming.

## Major Limitations

- Full NHANES complex survey variance is not implemented.
- A single UACR measure cannot confirm persistence or CKD diagnosis.
- BP endpoint is a measurement threshold, not diagnosis.
- Important confounders such as diabetes, BMI, medication use, kidney function, and socioeconomic factors are omitted.

## Repair Actions

1. Add paper QA checks for threshold provenance when evidence JSON contains `thresholds`.
2. Add a kidney-specific semantic QA rule that blocks CKD diagnosis language from single UACR measures.
3. Add richer covariate selection from diabetes, BMI, and kidney function domains.
