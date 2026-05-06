# Tick 0259 Web Search - Exploration Mode Research Pressure

## Sources

1. QUIS: Question-guided Insights Generation for Automated Exploratory Data Analysis, EMNLP Industry 2024 / arXiv 2410.10270  
   Source: https://arxiv.org/abs/2410.10270

2. A Graph RAG Approach to Enhance Explainability in Dataset Discovery, Data Science and Engineering 2025/2026  
   Source: https://link.springer.com/article/10.1007/s41019-025-00313-x

3. TRIPOD+AI statement: updated guidance for reporting clinical prediction models that use regression or machine learning methods, BMJ 2024  
   Source: https://pmc.ncbi.nlm.nih.gov/articles/PMC11025451/

## Findings

- QUIS reinforces that exploration should be question-guided rather than only association-ranked. Agenteer now generates candidate questions, but the next improvement should explicitly keep a question agenda separate from statistical findings.
- Graph-RAG dataset discovery reinforces explainable ranking criteria. Agenteer's taxonomy evidence is aligned with this, but the source metadata is still heuristic rather than graph/codebook-backed.
- TRIPOD+AI is relevant once exploration shifts into prediction. Exploration handoffs should preserve a boundary: exploratory association, explanatory modeling, and prediction-model development are different route intents.

## Applicability To Agenteer

Exploration mode should grow three separate artifacts:

1. `signalMap`: associations and caveats.
2. `questionAgenda`: candidate research questions, taxonomy, why-this-question, primary-use recommendation, and next checks.
3. `routeIntent`: explanatory association, prediction, diagnostic, causal, descriptive, or data-quality review.

This would prevent a strong signal from masquerading as a good question and prevent a good explanatory question from accidentally turning into a prediction-model task.

## Tail-End Idea

Add a "research question compiler": candidate questions compile into typed intermediate intent before AnalysisSpec. The compiler would reject impossible intent transitions, such as sending a data-quality duplicate/proxy signal directly to inferential modeling or sending an exploratory explanatory question directly to prediction-model reporting.

## Candidate Next Move

Add `routeIntent` to exploration candidate questions and handoffs. `modeling-plan` can then set `goal` defaults from the handoff instead of guessing from text and flags.
