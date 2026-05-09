# Figure Study Suite

Data: /Users/saleh/TechProjects/agenteer/.loop-memory/figure-study-suite-20260509/visual-study-data.csv

| # | Study | Method | Paper | Figure QA | Figures |
|---|---|---|---|---|---|
| 1 | Descriptive profile of synthetic public-health risk variables | `descriptive` | `studies/01-descriptive-profile/paper.md` | pass | descriptive-histograms.png: pass 1125x750 nonblank=0.2502; x=Value; y=Frequency, missingness-bar.png: pass 1125x750 nonblank=0.1051; x=Variable; y=Fraction missing |
| 2 | Welch comparison of continuous outcome by treatment group | `welch-t-test` | `studies/02-treatment-continuous-outcome/paper.md` | pass | group-distribution.png: pass 960x720 nonblank=0.0292; x=treatment; y=outcome_cont |
| 3 | Chi-square association between treatment and binary outcome | `chi-square` | `studies/03-treatment-binary-outcome/paper.md` | pass | contingency-heatmap.png: pass 1125x750 nonblank=0.6215; x=treatment; y=outcome_bin |
| 4 | Correlation between biomarker level and continuous outcome | `pearson` | `studies/04-biomarker-continuous-correlation/paper.md` | pass | correlation-scatter.png: pass 1125x750 nonblank=0.0805; x=biomarker; y=outcome_cont |
| 5 | Adjusted linear model for continuous outcome using biomarker and covariates | `linear-regression` | `studies/05-adjusted-linear-model/paper.md` | pass | model-residuals.png: pass 1125x750 nonblank=0.0828; x=Fitted value; y=Residual |
| 6 | Kaplan-Meier survival analysis by treatment group | `kaplan-meier` | `studies/06-survival-by-treatment/paper.md` | pass | kaplan-meier.png: pass 1125x750 nonblank=0.0335; x=Time; y=Survival probability |
| 7 | Cumulative incidence of the primary event with competing events | `aalen-johansen-cif` | `studies/07-competing-risk-incidence/paper.md` | pass | cumulative-incidence.png: pass 1125x750 nonblank=0.0331; x=Time; y=Cumulative incidence |
| 8 | PCA of correlated component variables | `pca` | `studies/08-latent-component-structure/paper.md` | pass | pca-scree.png: pass 1125x750 nonblank=0.0222; x=Principal component; y=Explained variance ratio |
| 9 | Bland-Altman agreement between two biomarker measurements | `bland-altman` | `studies/09-measurement-agreement/paper.md` | pass | bland-altman.png: pass 1125x750 nonblank=0.0833; x=Mean of measurements; y=Difference between measurements |
| 10 | ROC analysis for risk score prediction of binary outcome | `prediction-evaluation` | `studies/10-risk-score-prediction/paper.md` | pass | roc-curve.png: pass 1125x750 nonblank=0.0244; x=False positive rate; y=True positive rate |
