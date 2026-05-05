# Critique: Smoking history and HDL cholesterol paper

## Passes

- Uses a different domain shape and outcome type from the vitamin-D/BP paper.
- Records why triglycerides were rejected as a fragile endpoint.
- Includes actual merged sample counts and a companion analysis JSON.
- Avoids causal claims and states full NHANES survey variance is not implemented.

## Major Limitations

- Ever-smoking history is coarse and does not distinguish current, former, intensity, or cotinine-verified exposure.
- The model lacks important confounders such as BMI, alcohol use, medications, diet, and physical activity.
- Approximate weighted linear regression is not publication-grade NHANES survey analysis.
- Continuous outcome QA is still generic; future QA should check scale/units and outlier handling.

## Repair Actions

1. Add endpoint-type-aware paper QA checks for continuous outcomes.
2. Add a reusable endpoint rejection/selection artifact.
3. Consider cotinine if available in future curated NHANES domains.
