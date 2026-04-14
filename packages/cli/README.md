# @agenteer/cli

Command-line interface for [Agenteer](https://github.com/salehsquared/agenteer). Runs workflows, resumes suspended sessions, inspects context and traces, and handles publish/install/search for node packages.

## Install

```bash
npm install -g @agenteer/cli
```

Or use `npx`:

```bash
npx @agenteer/cli run --spec workflow.yaml
```

Requires **Node ≥ 20**.

## Commands

| command | purpose |
|---|---|
| `agenteer run --spec <file>` | Run a workflow spec. Creates a session directory. |
| `agenteer resume --session <dir>` | Resume a suspended session (after `ask_user` / `approval_gate`). |
| `agenteer ctx <subcommand>` | Inspect the ctx store: `list`, `get`, `lineage`, `diff`. |
| `agenteer inspect --session <dir>` | Print a full session report: steps, ctx timeline, evidence tree, permission denials. |
| `agenteer publish --dir <pkg>` | Validate + publish a node package via npm. |
| `agenteer install <name>` | Install a node package into a workflow's `framework.workflow.yaml`. |
| `agenteer search <query>` | Search npm for Agenteer-shaped node packages. |

## `inspect` — read a session

```bash
agenteer inspect --session ./.demo-session
agenteer inspect --session ./.demo-session --ctx-timeline
agenteer inspect --session ./.demo-session --evidence
agenteer inspect --session ./.demo-session --denials
agenteer inspect --session ./.demo-session --summary
```

The ctx timeline shows every patch applied to the context store in order. The evidence tree groups records by `lineage_id`. The denial log shows every spawn or action the kernel refused, with `explainPermissionDenial` rendering actionable hints.

## `ctx` — dig into context

```bash
agenteer ctx list   --session <dir> [--tag <label>]
agenteer ctx get    --session <dir> --id <ctx-id>
agenteer ctx lineage --session <dir> --id <ctx-id>
agenteer ctx diff   --session <dir> --from <ctx-id-a> --to <ctx-id-b>
```

Context items are immutable and content-addressable. `diff` gives a structural compare between two items; `lineage` walks the `derives_from` chain.

## Programmatic use

The commands are also exported as functions — handy for integrating into your own CLI or workflow driver:

```ts
import { runWorkflow, resumeWorkflow, inspectSession } from "@agenteer/cli";

const outcome = await runWorkflow({ spec, sessionDir: "./.session" });
if (outcome.finalStatus === "awaiting_user") {
  const answer = await askHuman(outcome.pending);
  await resumeWorkflow({ sessionDir: "./.session", answer });
}
const report = await inspectSession({ sessionDir: "./.session" });
```

## Providers

Bundled Anthropic and OpenAI `ProviderLike` adapters; switch models via the `--model` flag or construct directly via `buildProviderForModels`.

```ts
import { buildProviderForModels } from "@agenteer/cli";

const provider = buildProviderForModels({
  models: ["claude-sonnet-4-5", "gpt-4o"],
  anthropicApiKey: process.env.ANTHROPIC_API_KEY,
  openaiApiKey: process.env.OPENAI_API_KEY,
});
```

## License

MIT — see LICENSE.
