# Tick 0260 Challenge - Scaling Skeptic

## Persona

Scaling skeptic reviewing whether exploration mode is becoming a practical tool or a metadata-heavy artifact generator.

## Critique

Exploration mode is improving, but the last several ticks added many fields: promotion status, clearance, taxonomy, research-interest score, taxonomy evidence, primary-use recommendation, handoff status, methods-review note, and planner handoff. Each field is defensible alone. Together, they risk making the first user experience feel like reading an internal audit log rather than exploring a dataset.

The danger is not too much metadata in JSON. The danger is that there is still no single concise "what should I do next?" object that chooses one question, says why it is worth pursuing, states what it is not, and names the next executable command. The report has the pieces, but the user or agent must assemble the final action.

The web-search tick reinforces this: signal map, question agenda, and route intent should be distinct. Right now the system has signal map and question agenda, but route intent is implicit. Without route intent, modeling-plan still has to infer whether the handoff is explanatory, predictive, diagnostic, descriptive, causal, or data-quality review.

## Actionable Implications

- Add candidate-level `routeIntent`.
- Add a compact run-level `recommendedQuestion` or `recommendedNextStep` that points to one candidate and explains the reason.
- Keep the detailed taxonomy evidence in JSON, but make the Markdown report prioritize the concise recommendation first.
- Do not add another evidence field until at least one downstream command consumes `routeIntent`.

## Evidence That Would Change This Critique

This critique would weaken if the actual NHANES exploration report opened with a short recommendation such as: "Best next question: age and HbA1c; route intent: explanatory association; why: social/demographic determinant with large N; not prediction or causality; next command: explore-promote/modeling-plan."

## Next Implementation Requirement

Implement route intent and a concise recommended next question before adding more exploration metadata.
