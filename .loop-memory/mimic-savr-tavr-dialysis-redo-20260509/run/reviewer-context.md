# Reviewer Context

Research question: In hemodialysis, peritoneal dialysis, and non-dialysis patients undergoing SAVR and TAVR across ICD-9, ICD-10, and CPT/HCPCS-coded hospital data, how do clinical outcomes differ across mortality, heart-failure or cardiac-related hospital admission, MACE, and valve reintervention?

This is a complete redo of the SAVR/TAVR dialysis-status packet. Review the MIMIC-feasible study, not the impossible claims-registry version.

## Data Boundary

- MIMIC-IV supports deidentified same-hospital longitudinal admissions and death-date-based mortality where available.
- MIMIC-IV does not support complete national claims follow-up, outside-hospital readmissions, exact public dates, or complete CPT claims capture.
- Anchor-year groups approximate the requested 2008-2022 period; they are not exact public dates.

## User-Supplied Codes

{
  "tavrIcd9Procedure": [
    "3505",
    "3506"
  ],
  "savrIcd9Procedure": [
    "3521",
    "3522"
  ],
  "dialysisIcd10Diagnosis": [
    "N186",
    "Z992"
  ],
  "dialysisIcd9Diagnosis": [
    "5856",
    "V4511",
    "V560",
    "V561",
    "V562",
    "V5631",
    "V5632",
    "V568"
  ],
  "peritonealDialysisIcd9Procedure": [
    "5498"
  ],
  "peritonealDialysisCptHcpcs": [
    "49324",
    "49325",
    "49326",
    "49418",
    "49420",
    "49421",
    "49422",
    "49435",
    "49436",
    "G0052"
  ],
  "auxiliaryHemodialysisCptHcpcsScan": [
    "90935",
    "90937",
    "90945",
    "90947",
    "90999",
    "G0257"
  ]
}

## Official/Primary Context Sources Consulted

- https://www.cdc.gov/nchs/icd/icd-10-cm/index.html
- https://www.cms.gov/medicare/coding-billing/icd-10-codes
- https://www.cms.gov/files/document/fy-2012-fr-table-6b-new-diagnosis-codes-pdf.pdf
- https://www.cms.gov/regulations-and-guidance/guidance/transmittals/downloads/r2552cp.pdf
- https://www.cms.gov/medicare/regulations-guidance/physician-self-referral/list-cpt-hcpcs-codes
- https://physionet.org/content/mimiciv/3.1/
- https://mimic.mit.edu/docs/iv/

## Run QA Issues

[
  {
    "severity": "warning",
    "code": "TINY_PD_STRATUM",
    "message": "Peritoneal dialysis stratum is too small for adjusted inference."
  },
  {
    "severity": "warning",
    "code": "SAVR_CPT_NOT_OBSERVED",
    "message": "Auxiliary SAVR CPT scan codes were not observed in local HCPCS events."
  }
]

## What To Review

- Whether the coding logic is sufficiently transparent and appropriately limited.
- Whether the same-hospital longitudinal boundary is stated clearly enough.
- Whether the outcome definitions match the stated claims.
- Whether adjusted and propensity analyses are appropriate or overinterpreted.
- Whether the paper should re-enter phenotype review, method selection, execution, manuscript repair, or human review.
