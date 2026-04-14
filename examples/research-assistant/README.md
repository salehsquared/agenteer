# Research assistant — Agenteer demo

A runnable workflow that uses **six stdlib nodes** to answer an
open-ended research question, with a human approval gate in the middle
and a written report as the final artifact.

**Nodes involved (all from `@agenteer/stdlib`):**

1. `ask_user` — gather the research question interactively.
2. `default_planner` — generate an investigation plan from the question.
3. `approval_gate` — require user sign-off before executing the plan.
4. `tool_call` — invoke a `web_search` tool (stubbed in the mock mode).
5. `judge_with_stripped_ctx` — score the findings against the question.
6. `llm_call` — synthesize the final report.

The whole thing runs through the CLI (`agenteer run`), persists to disk,
suspends on each human touchpoint, and resumes on demand. The session
directory captures every step — run `agenteer inspect` to see them.

## Run the mock version (no API keys needed)

```bash
# From the agenteer repo root.
npm run build
node examples/research-assistant/run-mock.js \
  --question "What were the top 3 causes of last quarter's outages?"
```

The mock path uses `MockModelProvider` for the planner / judge / llm_call
and a fake `web_search` tool that returns canned findings. The goal is
to prove the composition; the answers are synthetic.

## Run against a real model

Set an API key and pick a model id:

```bash
export ANTHROPIC_API_KEY=sk-ant-...
node examples/research-assistant/run-real.js \
  --model claude-sonnet-4-5 \
  --question "..."
```

This path wires the Anthropic (or OpenAI) provider via
`buildProviderForModels`. The planner and judge issue real calls. The
`web_search` tool is still stubbed — wiring a real search backend is
the integrator's job, not the framework's.

## What you'll see

- A session directory at `./.demo-session` gets created.
- The workflow suspends twice: once on the initial `ask_user`, then on
  `approval_gate`. Each suspension is persisted in `session.yaml`.
- After the second resume, `tool_call` + `judge_with_stripped_ctx` +
  `llm_call` run, and the final report lands as a ctx artifact under
  the `research.report` tag.

Inspect the session after it completes:

```bash
node ./packages/cli/dist/bin/agenteer.js inspect --session ./.demo-session
node ./packages/cli/dist/bin/agenteer.js inspect --session ./.demo-session --ctx-timeline
node ./packages/cli/dist/bin/agenteer.js ctx get \
  --session ./.demo-session --id <report-id-from-timeline>
```

## What this demo does NOT do

- **Does not conceptualize new node types.** `default_planner` composes
  over the nodes you pass in `available_manifests`; it never invents
  new manifests. If you want to add capabilities, install more nodes
  (`agenteer install ...`) or wire your own via `extraRegistrations`.
- **Does not cache node outputs.** Resume re-runs the graph. For
  deterministic nodes this is safe (content-addressable ctx dedupes);
  for stochastic `llm_call` it re-queries. Caching lands in v1.1.
- **Does not ship a real web-search implementation.** The stub returns
  canned findings; plug in your preferred search API by replacing the
  `web_search` tool handler.
