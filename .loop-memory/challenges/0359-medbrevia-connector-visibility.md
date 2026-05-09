# Challenge 0359: MedBrevia Connector Visibility

The connector is not sufficient if it only produces `literature-search.json`. A reviewer needs to know whether the evidence was used, whether it was strong enough for planning, and whether the generated paper cited or ignored it. The most important integration point is `run-inspect`, because that is the packet readiness view.

Decision: literature evidence must become visible in unified inspection and should affect readiness when attached.
