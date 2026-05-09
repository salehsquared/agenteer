# Study 5 Design: Hepatology / Cirrhosis And ICU Outcomes

## Packet

Source packet: `.loop-memory/mimic-executed-studies-20260506/runs/0317-mimic-liver-cirrhosis-icu`

## Research Question

Among ICU admissions with cirrhosis diagnosis codes, how do MELD-like derived variables and first-day laboratory markers relate to in-hospital mortality and ICU length of stay?

## Cohort Definition

- Data source: MIMIC-IV ICU and hospital diagnosis-derived tables exported during the prior bounded run.
- Phenotype: ICD-10-CM `K74` fibrosis/cirrhosis and ICD-9-CM `571.5` cirrhosis code families, verified online in the prior design phase.
- Unit of analysis: first ICU stay per matching hospitalization.
- Baseline cohort evidence:
  - First ICU stay rows: 2,662.
  - Unique patients: 2,094.
  - Matched diagnosis codes: 13.
  - Matched diagnosis rows: 12,959.

## Outcomes

- In-hospital mortality (`hospital_expire_flag`), modeled as a binary outcome.
- ICU length of stay (`los_icu`), modeled on a transformed continuous scale.

## Validation Focus

This packet should stress:

- Hepatology phenotype breadth, especially ICD-10 `K74` including fibrosis and cirrhosis terms.
- MELD-like and coagulation-derived table provenance.
- Mortality-model reporting in a domain where prognostic scores are common.
- Whether unprofiled derived coagulation tables surface in trust-layer inspection.

## Web-Grounded Methods Pressure

- AASLD guidance on acute-on-chronic liver failure and cirrhosis with critical illness emphasizes that cirrhosis/ACLF management and prognosis are tied to organ failures and critical illness context: https://www.aasld.org/practice-guidelines/acute-chronic-liver-failure-and-management
- Prior ICU cirrhosis prognostic studies compare MELD, SOFA/APACHE-style severity, and liver-specific scores; this supports reporting severity-marker boundaries rather than causal interpretations.
- Prediction-model reporting guidance requires clear performance measures, validation/calibration context, and intended-use boundaries when a study claims prognostic prediction.

## Expected Issues To Look For

- Derived MELD/coagulation variables need provenance profiling.
- General ICU severity and liver-specific markers may overlap.
- The study is observational and diagnosis-code-based.
- Model discrimination is internal only; not a deployable prediction model without validation/calibration.
