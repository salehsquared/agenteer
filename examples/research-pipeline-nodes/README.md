# Research Pipeline Nodes

This example turns the CLI-first research pipeline into reusable Agenteer-style deterministic nodes.

The NHANES registry remains only a realistic substrate. The node boundaries are meant to generalize to other dataset-backed research workflows:

1. `research_protocol_design` creates a traceable protocol packet from a dataset registry and question.
2. `research_protocol_critique` runs deterministic methodology checks before execution.
3. `research_scout_plan` builds or computes data-quality and complete-case requirements.
4. `research_runner_spec` writes a zero-cloud local runner contract.
5. `research_analyze_local` runs approved local fixture analysis.
6. `research_report_review` reviews report artifacts against packet-specific QA requirements.
7. `research_artifact_manifest` hashes packet artifacts.
8. `research_export` copies manifest-backed artifacts to a durable export directory.

`driver.ts` composes these nodes into a complete local packet run. It deliberately uses local fixtures and writes no MedBrevia files.

`pipeline.ts` documents the intended stage order and maps each stage to its node manifest ID. This makes the pipeline inspectable even before it is executed by a runtime driver. The CLI can emit the same stage contract for external tools with `agenteer research stages --json`.

Register all node factories into an Agenteer registry with:

```ts
import { registerResearchPipelineNodes } from "./nodes.js";

registerResearchPipelineNodes(registry);
```

Run the example tests:

```bash
npx vitest run examples/research-pipeline-nodes/tests
```
