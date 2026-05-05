# Challenge 0227 - Diagnostic Study Selection

## Critique

The current diagnostic route proves local 2x2 arithmetic and claim boundaries, but the first synthetic example is too clean:

- binary index test is already thresholded
- binary reference standard is already defined
- no indeterminate results
- no ROC threshold search
- no interval estimates
- no stratified/spectrum-bias stress
- no actual NHANES-derived table

## Better Next Diagnostic Study

Use a real public-health screening scenario where the pipeline must derive the index test and reference standard from continuous/clinical variables:

**Question candidate:** Among adults in a local NHANES-shaped table, how accurately does self-reported prior diabetes diagnosis identify elevated HbA1c or fasting glucose?

Why this is stronger:

- self-report versus biomarker is a realistic diagnostic/agreement stress case
- the index test and reference standard have different measurement error modes
- PPV/NPV are prevalence-sensitive
- undiagnosed disease language is tempting and must be controlled
- missing fasting subsample eligibility may force refusal or subsample-weight rationale

## Required Response

Before generating a diagnostic paper, add at least one of:

- Wilson/exact intervals for sensitivity, specificity, PPV, and NPV
- indeterminate/missing-result accounting
- threshold derivation support from continuous values
- a diagnostic paper packet wrapper that consumes `stats-run` artifacts

## Counter-Design Rejected

Do not generate another synthetic diagnostic paper with pre-thresholded columns only. That would flatter the route without testing the next real weakness.
