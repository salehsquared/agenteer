# CLI reference

Full reference for `agenteer`.

## Install

```bash
npm install -g @agenteer/cli
```

Or run without a global install:

```bash
npx @agenteer/cli <command> [flags]
```

## First run

Create `workflow.yaml`:

```yaml
manifest_id: "@agenteer/node-regex-check"
input:
  input: "release 1.0.0-rc.1"
  rules:
    - id: contains-rc
      pattern: "1\\.0\\.0-rc\\.1"
      kind: must_match
granted: []
```

Run the workflow and inspect the recorded summary:

```bash
agenteer run --spec workflow.yaml --session ./.session
agenteer inspect --session ./.session --summary
```

## `agenteer run`

Run a workflow spec from scratch. Creates a new session directory and drives it to completion or suspension.

```bash
agenteer run --spec <file> --session <dir> [--model <id>]*
```

| flag | purpose |
|---|---|
| `--spec <file>` | Path to the workflow spec YAML or JSON. **Required.** |
| `--session <dir>` | Session directory to create. **Required.** |
| `--model <id>` | Repeatable model id. Used to build Anthropic/OpenAI providers for stdlib nodes that call models. |

On success the command prints the session id, final status, and step count. Suspended runs print a `resume with:` hint and exit with status `1`.

## `agenteer resume`

Resume a suspended session.

```bash
agenteer resume --session <dir> [--model <id>]* [--no-interactive]
```

| flag | purpose |
|---|---|
| `--session <dir>` | Session directory. **Required.** |
| `--model <id>` | Repeatable model id for any resumed stdlib model calls. |
| `--no-interactive` | Do not prompt on stdin for unanswered pending prompts. Any required answers must already be recorded on disk. |

Programmatic resume uses `answerProvider`; the CLI does not expose a `--answer` flag.

## `agenteer ctx`

Inspect the context store for a recorded session.

### `agenteer ctx list`

```bash
agenteer ctx list --session <dir> [--tag <label>]
```

Lists ctx items with timestamps, ids, optional tags, and stale markers.

### `agenteer ctx get`

```bash
agenteer ctx get --session <dir> --id <ctx-id>
```

Prints the item as formatted JSON.

### `agenteer ctx lineage`

```bash
agenteer ctx lineage --session <dir> --id <ctx-id>
```

Walks the `derives_from` chain upstream.

### `agenteer ctx diff`

```bash
agenteer ctx diff --session <dir> --left <id-a> --right <id-b>
```

Produces a structural diff between two ctx items.

## `agenteer inspect`

Render a session report.

```bash
agenteer inspect --session <dir> [--ctx-timeline | --evidence | --denials | --summary]
```

Without a view flag, `inspect` prints the summary plus all detail sections.

## `agenteer publish`

Validate and publish a node package through npm.

```bash
agenteer publish --dir <package-dir> [--provenance] [--dry-run] [--registry <url>]
```

| flag | purpose |
|---|---|
| `--dir <path>` | Path to the package directory. **Required.** |
| `--provenance` | Enable npm provenance for this publish. |
| `--dry-run` | Validate and run `npm publish --dry-run` without uploading. |
| `--registry <url>` | Alternate registry URL, useful for Verdaccio tests. |

Successful runs print the manifest id, manifest hash, provenance status, and whether the publish was a dry-run.

## `agenteer install`

Install a node package into a workflow.

```bash
agenteer install <spec> --workflow-dir <dir> [--yes] [--grant <cap>]* [--registry <url>]
```

| flag | purpose |
|---|---|
| `<spec>` | npm package spec such as `@acme/node-bug-triage` or `@acme/node-bug-triage@^1.4.0`. |
| `--workflow-dir <path>` | Workflow directory containing `framework.workflow.yaml`. **Required.** |
| `--yes` | Auto-approve permission diffs when allowed. |
| `--grant <cap>` | Extra workflow grants used when computing the install diff. Repeat by comma-separated value or repeated flag. |
| `--registry <url>` | Alternate registry URL. |

Third-party packages with `dynamic_actions: true` still require explicit confirmation even when `--yes` is present.

## `agenteer search`

Search npm for Agenteer-shaped node packages.

```bash
agenteer search <query> [--registry <url>]
```

| flag | purpose |
|---|---|
| `<query>` | Search query string. |
| `--registry <url>` | Alternate registry URL. |

## Programmatic API

All commands are also exported as functions from `@agenteer/cli`.

```ts
import { inspectSession, runWorkflow } from "@agenteer/cli";

const { outcome } = await runWorkflow({
  sessionDir: "./.session",
  spec: {
    manifest_id: "@agenteer/node-regex-check",
    input: {
      input: "release 1.0.0-rc.1",
      rules: [
        {
          id: "contains-rc",
          pattern: "1\\.0\\.0-rc\\.1",
          kind: "must_match" as const,
        },
      ],
    },
    granted: [],
  },
});

console.log(outcome.finalStatus);
console.log((await inspectSession("./.session")).event_count);
```

## Environment variables

| var | purpose |
|---|---|
| `ANTHROPIC_API_KEY` | Anthropic API key for Claude-family model ids. |
| `OPENAI_API_KEY` | OpenAI API key for GPT/OpenAI-family model ids. |

## Exit codes

- `0` — command completed successfully.
- `1` — runtime failure, validation failure, suspended session, or uncaught command error.
- `2` — CLI usage error such as a missing required flag or unknown subcommand.
