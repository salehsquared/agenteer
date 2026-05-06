# Diagnostic Accuracy of waist_cm Against hba1c_pct

## Summary

This report estimates how well waist_cm identified records meeting the hba1c_pct reference definition in the analyzed table. It is a diagnostic accuracy analysis of local data, not a clinical screening recommendation or validation of a deployable diagnostic rule.

Main finding: in 180 complete records, sensitivity was 0.8590 (0.7649, 0.9194) and specificity was 0.9608 (0.9035, 0.9846). Positive and negative predictive values depend on the prevalence in this analyzed table.

## Research Question

How accurately does a waist circumference threshold identify elevated HbA1c from continuous values?

## Methods

The reference standard was hba1c_pct; records were considered reference-positive when >=6.5. The index test was waist_cm; records were considered test-positive when >=100.

The analysis used complete records for both measures (N = 180). It formed a 2 x 2 diagnostic accuracy table and estimated sensitivity, specificity, positive predictive value, negative predictive value, likelihood ratios, and prevalence in the analyzed table. Wilson binomial intervals were used for sensitivity, specificity, PPV, and NPV when available.
Thresholds were applied before the 2 x 2 table was formed: hba1c_pct was positive at 6.500 and waist_cm was positive at 100.

## Results

The diagnostic table contained 67 true positives, 4 false positives, 98 true negatives, and 11 false negatives.

- Sensitivity: 0.8590 (0.7649, 0.9194).
- Specificity: 0.9608 (0.9035, 0.9846).
- Positive predictive value: 0.9437 (0.8639, 0.9779).
- Negative predictive value: 0.8991 (0.8283, 0.9427).
- Positive likelihood ratio: 21.90.
- Negative likelihood ratio: 0.1468.
- Prevalence in analyzed table: 0.4333.

## Interpretation

These results describe agreement between waist_cm and hba1c_pct in the analyzed records. They do not establish external validity, clinical utility, causal interpretation, or a recommendation to screen.
One or more diagnostic cells were sparse, so the accuracy estimates may be unstable and should be reviewed with caution.

## Limitations

This analysis used only the rows available in the supplied table and should not be generalized without external validation. Predictive values are prevalence-dependent. Threshold-derived classifications can be sensitive to the chosen cut points. This report does not assess clinical utility, calibration across populations, harms, or implementation feasibility.

## Reproducibility Note

The companion files in this packet contain the numerical estimates, quality checks, run metadata, and file hashes needed to audit or rerun the analysis.
