# Agentic Workflow Research Notes

Cycle 60 synthesis, captured to steer Agenteer and the research pipeline.

## Sources Reviewed

- Google DeepMind AlphaEvolve announcement, May 14 2025: https://deepmind.google/blog/alphaevolve-a-gemini-powered-coding-agent-for-designing-advanced-algorithms/
- AlphaEvolve arXiv white paper, submitted June 16 2025: https://arxiv.org/abs/2506.13131
- AlphaEvolve results repository: https://github.com/google-deepmind/alphaevolve_results
- Google Gemini Deep Research / Interactions API announcement, Dec 11 2025: https://blog.google/innovation-and-ai/technology/developers-tools/deep-research-agent-gemini-api/
- Polymath dynamic hierarchical workflow paper, revised Aug 7 2025: https://arxiv.org/abs/2508.02959
- Small X sample on May 2 2026 for recent product/community signal only. The useful signal was not methodological proof; it was repeated concern about verifiability, cost/performance, and deep-research task usefulness.

## Design Requirements

1. Evaluator-first loops. AlphaEvolve's core lesson for this project is not "let the model keep trying"; it is "make the candidate change executable, scored, and comparable." Agenteer should keep moving toward explicit evaluators, scorecards, replayable artifacts, and small local experiments before model-heavy or cloud-heavy runs.

2. Program and workflow mutation must remain inspectable. AlphaEvolve stores and scores generated programs; the public results repository includes correctness-verification code for reported mathematical results. For Agenteer, every new node, prompt, validator, and runner adapter should leave an artifact trail that explains why it exists and how it was verified.

3. Deep research needs iterative gap detection, not one-shot retrieval. Google's Deep Research description emphasizes planning, querying, reading, gap detection, and re-searching. The research pipeline should make this deterministic where possible: evidence plans, missing-source reports, citation coverage checks, and report-to-evidence traceability.

4. Structured outputs are infrastructure, not polish. Deep Research's developer framing calls out structured outputs and detailed citations. The pipeline should keep preferring JSON artifacts plus Markdown renderers, because downstream commands can validate, summarize, diff, and export those records.

5. Dynamic workflow graphs are worth testing, but only behind safety rails. Polymath argues for code-represented, dynamically optimized task graphs when labeled data is unavailable. Agenteer should experiment with node proposal/removal and graph critique, but each proposed graph change needs static validation, cost envelopes, and local fixture evaluation before promotion.

6. Cost is a first-class evaluator. The X sample contained enthusiasm for large autonomous research and concern about result-vs-cost tradeoffs. The local loop should track spend estimates, prefer fixtures and deterministic validators, and treat cloud/tool expansion as a deliberate escalation.

## Backlog Implications

- Add a research evidence-gap command that compares report claims against artifact citations and source records.
- Add a workflow scorecard command that records evaluator results for a proposed pipeline or node change.
- Add node-candidate metadata: purpose, expected evaluator, rollback condition, cost envelope, and promotion criteria.
- Add packet diffing so one cycle's research packet can be compared against another without reading every artifact manually.
- Add citation coverage checks to report QA before treating a study packet as publishable.
