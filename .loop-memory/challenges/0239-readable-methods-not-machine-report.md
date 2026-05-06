# Challenge 0239 - Readable Methods, Not Just Jargon-Free Output

## Critique

The latest paper now avoids internal platform vocabulary, but it still reads too much like a machine report:

- It uses raw variable names (`BMXBMI`, `LBXGLU`, `WTSAF2YR`, `SDMVSTRA`, `SDMVPSU`, `RIDAGEYR`, `RIAGENDR`, `RIDRETH1`) in places where readers need human labels.
- The abstract states an association but does not give a short plain-language thesis before the numeric estimate.
- The study summary is useful, but it is dense and repeats technical details that could be split between reader summary and methods.
- “The weight choice was based on this rationale” is understandable but bureaucratic; the reader needs a direct reason.
- “Outcome units” is vague for fasting glucose. The paper should say the unit when known, or at least name the outcome measure.
- The discussion repeats the cross-sectional caveat but does not explain the practical interpretation of a 0.84-unit mean difference per BMI unit.

## User-Facing Failure

A non-framework reader can now understand that this is a study, but they still need to translate variable codes and runner-derived phrasing. That is better than before but not yet a strong paper.

## Required Response

Next implementation tick should add a readability layer:

- variable label map for common NHANES variables used in papers
- paper QA warning/failure for excessive raw variable-code exposure
- main-finding sentence requirement in abstract or summary
- awkward phrase checks for known generator artifacts
- regenerated latest paper with human labels and cleaner weight-domain prose

## Counter-Design Rejected

Do not solve this by manually editing the latest paper. If the generator cannot produce readable labels and a main finding by itself, the next generated paper will regress.
