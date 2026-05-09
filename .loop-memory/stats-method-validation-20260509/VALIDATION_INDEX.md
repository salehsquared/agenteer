# Stats Method Validation Index

## Summary

- Total runs: 71
- Succeeded: 67
- Failed / blocked: 4
- Runs with figures: 31
- Runs with reader-facing papers: 2
- Runs with generated manuscripts: 1
- Categories: {'execution_validated_review_limited': 67, 'backend_blocked': 3, 'execution_blocked_or_nonconverged': 1}

## Interpretation

This index validates local CLI execution and artifact production. It does not certify that every model assumption is satisfied for a future real study. Review-limited routes need method-specific assumption checks before strong scientific claims.

## Runs

| run | method | status | QA | N | figures | reader artifact | category | issues |
|---|---|---|---|---:|---:|---|---|---|
| 0391-anova | anova | succeeded | warning | 240 | 1 | manuscript | execution_validated_review_limited |  |
| 0391-chi-square | chi-square | succeeded | warning | 240 | 1 | stats-report | execution_validated_review_limited |  |
| 0391-paired-t | paired-t-test | succeeded | warning | 240 | 0 | stats-report | execution_validated_review_limited |  |
| 0391-partial-correlation | partial-correlation | succeeded | warning | 240 | 1 | stats-report | execution_validated_review_limited |  |
| 0391-welch | welch-t-test | succeeded | warning | 240 | 1 | stats-report | execution_validated_review_limited |  |
| 0392-gamma | gamma-glm | succeeded | warning | 240 | 1 | stats-report | execution_validated_review_limited |  |
| 0392-inv-gaussian | inverse-gaussian-glm | succeeded | warning | 240 | 1 | stats-report | execution_validated_review_limited |  |
| 0392-logistic | logistic-regression | succeeded | warning | 240 | 1 | stats-report | execution_validated_review_limited |  |
| 0392-multinomial | multinomial-logistic-regression | succeeded | warning | 240 | 0 | stats-report | execution_validated_review_limited |  |
| 0392-neg-bin | negative-binomial-regression | succeeded | warning | 240 | 1 | stats-report | execution_validated_review_limited |  |
| 0392-ordinal | ordinal-logistic-regression | succeeded | warning | 240 | 0 | stats-report | execution_validated_review_limited |  |
| 0392-penalized-linear | penalized-linear-regression | succeeded | warning | 240 | 0 | stats-report | execution_validated_review_limited | PENALIZED_INFERENCE_CAVEAT |
| 0392-penalized-logistic | penalized-logistic-regression | succeeded | warning | 240 | 0 | stats-report | execution_validated_review_limited | PENALIZED_INFERENCE_CAVEAT |
| 0392-poisson | poisson-regression | succeeded | warning | 240 | 1 | stats-report | execution_validated_review_limited |  |
| 0392-quantile | quantile-regression | succeeded | warning | 240 | 1 | stats-report | execution_validated_review_limited |  |
| 0392-robust-linear | robust-linear-regression | succeeded | warning | 240 | 1 | stats-report | execution_validated_review_limited |  |
| 0392-zero-inflated-poisson | zero-inflated-poisson | succeeded | warning | 240 | 1 | stats-report | execution_validated_review_limited |  |
| 0393-cif | aalen-johansen-cif | succeeded | warning | 240 | 1 | stats-report | execution_validated_review_limited |  |
| 0393-cox | cox-proportional-hazards | succeeded | warning | 240 | 0 | stats-report | execution_validated_review_limited |  |
| 0393-fine-gray-block | fine-gray | failed | fail | 240 | 0 | stats-report | backend_blocked | METHOD_BACKEND_NOT_AVAILABLE |
| 0393-gee | gee | succeeded | warning | 240 | 0 | stats-report | execution_validated_review_limited |  |
| 0393-glmm-block | generalized-mixed-model | failed | fail | 240 | 0 | stats-report | backend_blocked | GLMM_BACKEND_NOT_AVAILABLE |
| 0393-km | kaplan-meier | succeeded | warning | 240 | 1 | stats-report | execution_validated_review_limited |  |
| 0393-linear-mixed | linear-mixed-model | succeeded | warning | 240 | 0 | stats-report | execution_validated_review_limited |  |
| 0393-log-rank | log-rank | succeeded | warning | 240 | 0 | stats-report | execution_validated_review_limited |  |
| 0393-recurrent | recurrent-event-rate | succeeded | warning | 240 | 0 | stats-report | execution_validated_review_limited |  |
| 0393-repeated-anova | repeated-measures-anova | succeeded | warning | 240 | 0 | stats-report | execution_validated_review_limited |  |
| 0393-stratified-cox | stratified-cox | succeeded | warning | 240 | 0 | stats-report | execution_validated_review_limited |  |
| 0393-time-varying-block | time-varying-cox | failed | fail | 240 | 0 | stats-report | backend_blocked | METHOD_BACKEND_NOT_AVAILABLE |
| 0394-aipw | doubly-robust-aipw | succeeded | warning | 240 | 0 | stats-report | execution_validated_review_limited |  |
| 0394-did | difference-in-differences | succeeded | warning | 240 | 0 | stats-report | execution_validated_review_limited |  |
| 0394-entropy | entropy-balancing | succeeded | warning | 240 | 0 | stats-report | execution_validated_review_limited |  |
| 0394-evalue | unmeasured-confounding-sensitivity | succeeded | warning | 240 | 0 | stats-report | execution_validated_review_limited |  |
| 0394-event-study | event-study-did | succeeded | warning | 240 | 0 | stats-report | execution_validated_review_limited |  |
| 0394-iptw | propensity-score-weighting | succeeded | warning | 240 | 0 | paper | execution_validated_review_limited |  |
| 0394-its | interrupted-time-series | succeeded | warning | 240 | 0 | stats-report | execution_validated_review_limited |  |
| 0394-iv | instrumental-variables-2sls | succeeded | warning | 240 | 0 | stats-report | execution_validated_review_limited |  |
| 0394-overlap | overlap-weighting | succeeded | warning | 240 | 0 | stats-report | execution_validated_review_limited |  |
| 0394-psm | propensity-score-matching | succeeded | warning | 240 | 0 | paper | execution_validated_review_limited | PROPENSITY_UNMATCHED_TREATED, PROPENSITY_RESIDUAL_IMBALANCE |
| 0394-rdd | regression-discontinuity | succeeded | warning | 240 | 0 | stats-report | execution_validated_review_limited |  |
| 0394-target-trial | target-trial-emulation-spec | succeeded | warning | 240 | 0 | stats-report | execution_validated_review_limited | TARGET_TRIAL_REVIEW_REQUIRED |
| 0396-ancova | ancova | succeeded | warning | 240 | 1 | stats-report | execution_validated_review_limited |  |
| 0396-bland-altman | bland-altman | succeeded | warning | 240 | 1 | stats-report | execution_validated_review_limited |  |
| 0396-cc-sensitivity | complete-case-sensitivity | succeeded | warning | 218 | 0 | stats-report | execution_validated_review_limited |  |
| 0396-clustering | clustering-validation | succeeded | warning | 240 | 0 | stats-report | execution_validated_review_limited |  |
| 0396-cronbach | cronbach-alpha | succeeded | warning | 240 | 0 | stats-report | execution_validated_review_limited |  |
| 0396-descriptive | descriptive | succeeded | warning | 240 | 2 | stats-report | execution_validated_review_limited |  |
| 0396-diagnostics | model-diagnostics | succeeded | warning | 240 | 0 | stats-report | execution_validated_review_limited |  |
| 0396-fisher | fisher-exact | succeeded | warning | 240 | 1 | stats-report | execution_validated_review_limited |  |
| 0396-friedman | friedman | succeeded | warning | 240 | 0 | stats-report | execution_validated_review_limited |  |
| 0396-icc | intraclass-correlation | succeeded | warning | 240 | 0 | stats-report | execution_validated_review_limited |  |
| 0396-kappa | reliability-kappa | succeeded | warning | 240 | 0 | stats-report | execution_validated_review_limited |  |
| 0396-kendall | kendall | succeeded | warning | 240 | 1 | stats-report | execution_validated_review_limited |  |
| 0396-kruskal | kruskal-wallis | succeeded | warning | 240 | 1 | stats-report | execution_validated_review_limited |  |
| 0396-mann-whitney | mann-whitney | succeeded | warning | 240 | 1 | stats-report | execution_validated_review_limited |  |
| 0396-mcnemar | mcnemar | succeeded | warning | 240 | 1 | stats-report | execution_validated_review_limited |  |
| 0396-mice | multiple-imputation-mice | succeeded | warning | 218 | 0 | stats-report | execution_validated_review_limited | IMPUTATION_ASSUMPTION_REVIEW |
| 0396-missing-ipw | missingness-ipw | succeeded | warning | 218 | 0 | stats-report | execution_validated_review_limited |  |
| 0396-missingness | missingness-summary | succeeded | warning | 218 | 1 | stats-report | execution_validated_review_limited |  |
| 0396-mnar | mnar-sensitivity | succeeded | warning | 218 | 0 | stats-report | execution_validated_review_limited |  |
| 0396-multiple-correction | multiple-comparison-correction | succeeded | warning | 240 | 0 | stats-report | execution_validated_review_limited |  |
| 0396-pca | pca | succeeded | warning | 240 | 1 | stats-report | execution_validated_review_limited |  |
| 0396-pearson | pearson | succeeded | warning | 240 | 1 | stats-report | execution_validated_review_limited |  |
| 0396-power | power-sample-size | succeeded | warning | 240 | 0 | stats-report | execution_validated_review_limited |  |
| 0396-prediction | prediction-evaluation | succeeded | warning | 240 | 1 | stats-report | execution_validated_review_limited |  |
| 0396-spearman | spearman | succeeded | warning | 240 | 1 | stats-report | execution_validated_review_limited |  |
| 0396-t-test | t-test | succeeded | warning | 240 | 1 | stats-report | execution_validated_review_limited |  |
| 0396-trend | cochran-armitage-trend | succeeded | warning | 240 | 1 | stats-report | execution_validated_review_limited |  |
| 0396-wilcoxon | wilcoxon | succeeded | warning | 240 | 0 | stats-report | execution_validated_review_limited |  |
| 0397-zero-inflated-neg-bin | zero-inflated-negative-binomial | failed | fail | 240 | 1 | stats-report | execution_blocked_or_nonconverged | REGRESSION_DID_NOT_CONVERGE |
| 0397-zero-inflated-neg-bin-success | zero-inflated-negative-binomial | succeeded | warning | 600 | 1 | stats-report | execution_validated_review_limited |  |
