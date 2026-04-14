# CLI reference

Full reference for `agenteer`. Install with:

```bash
npm install -g @agenteer/cli
```

Or run without install:

```bash
npx @agenteer/cli <command> [flags]
```

All commands are also exported as functions from `@agenteer/cli` for programmatic use.

## `agenteer run`

Run a workflow spec from scratch. Creates a new session directory and drives it to completion (or suspension).

```bash
agenteer run --spec <file> [options]
```

| flag | purpose |
|---|---|
| `--spec <file>` | Path to the workflow spec YAML/JSON. **Required.** |
| `--session <dir>` | Output session directory. Default: `./.session`. |
| `--model <id>` | Model id (e.g. `claude-sonnet-4-5`, `gpt-4o`). Drives provider selection via `buildProviderForModels`. |
| `--granted <cap>` | Capability to grant (repeatable). Pairs with `required_actions` in the spec. |
| `--no-interactive` | Disable stdin prompting; `ask_user` / `approval_gate` return `needs_user` immediately. |

**Exit codes:**

- `0` — completed.
- `2` — suspended on user input (resume via `agenteer resume`).
- `1` — failed.

## `agenteer resume`

Resume a suspended session. Looks up the pending prompt in `session.yaml`, asks via stdin (or a programmatic resolver), and replays the runtime from the suspension point.

```bash
agenteer resume --session <dir> [options]
```

| flag | purpose |
|---|---|
| `--session <dir>` | Session directory. **Required.** |
| `--answer <value>` | Non-interactive answer for the pending prompt. |
| `--model <id>` | Same as `run`. |

## `agenteer ctx`

Inspect the context store of a session.

### `agenteer ctx list`

```bash
agenteer ctx list --session <dir> [--tag <label>] [--type <type>]
```

Lists ctx items with their ids, tags, types, and hashes. Filter by tag glob or type.

### `agenteer ctx get`

```bash
agenteer ctx get --session <dir> --id <ctx-id>
```

Prints the item content as YAML.

### `agenteer ctx lineage`

```bash
agenteer ctx lineage --session <dir> --id <ctx-id>
```

Walks the `derives_from` chain upstream, showing each predecessor's id, tag, and status (fresh / stale / superseded).

### `agenteer ctx diff`

```bash
agenteer ctx diff --session <dir> --from <id-a> --to <id-b>
```

Structural diff between two items. Works across content-addressable history — useful for seeing what a repair loop actually changed.

## `agenteer inspect`

Render a session report.

```bash
agenteer inspect --session <dir> [options]
```

| flag | purpose |
|---|---|
| `--session <dir>` | Session directory. **Required.** |
| `--summary` | One-screen summary: status, steps run, ctx count, evidence verdict mix, denial count. |
| `--ctx-timeline` | All ctx patches in order, with node-run correlation and scope-restriction events. |
| `--evidence` | Evidence tree grouped by `lineage_id`. |
| `--denials` | Every `spawn_denied` event with `explainPermissionDenial` output. |

Without any flags, prints a full report: steps, ctx timeline, evidence tree, denials, and summary.

## `agenteer publish`

Validate + publish a node package via npm.

```bash
agenteer publish --dir <package-dir> [options]
```

| flag | purpose |
|---|---|
| `--dir <path>` | Path to the package to publish. Default: `.`. |
| `--provenance` | Enable npm provenance (requires CI context with OIDC). |
| `--dry-run` | Run validation + print what would publish, but skip the push. |
| `--tag <dist-tag>` | Publish under a non-`latest` dist-tag (e.g. `next`, `rc`). |

Runs `validateNodePackage` first. If any issues are found with severity `error`, publish aborts and prints the issues with actionable hints. On success, prints the tarball URL and the manifest hash.

## `agenteer install`

Install a node package into a workflow. Updates `framework.workflow.yaml` and pins the manifest hash in `framework.lock`.

```bash
agenteer install <package-name> [options]
```

| flag | purpose |
|---|---|
| `--workflow-dir <path>` | Directory containing `framework.workflow.yaml`. Default: `.`. |
| `--yes` | Auto-approve the capability diff. **Ignored** for third-party packages with `dynamic_actions: true`. |
| `--version <range>` | npm version range (defaults to latest). |

Shows the capability diff vs. the current workflow grants, prompts for confirmation, then records the entry + pins the hash. If the package declares `dynamic_actions: true` and is not `@agenteer/*`-scoped, `--yes` is ignored and the prompt is required.

## `agenteer search`

Search npm for Agenteer-shaped node packages.

```bash
agenteer search <query> [options]
```

| flag | purpose |
|---|---|
| `--limit <n>` | Max hits to show. Default: 20. |
| `--curated` | Only show packages listed in the curated index. |

Hits are annotated with the curated index when available.

## Common flags

- `--log-level <level>` — `error`, `warn`, `info`, `debug`. Default: `info`.
- `--help` — per-command help.

## Environment variables

| var | purpose |
|---|---|
| `ANTHROPIC_API_KEY` | Claude API key; picked up by the Anthropic provider. |
| `OPENAI_API_KEY` | OpenAI API key; picked up by the OpenAI provider. |
| `AGENTEER_LOG_LEVEL` | Default log level. Overridden by `--log-level`. |

## Exit codes

- `0` — success.
- `1` — failure (validation, runtime error, uncaught exception).
- `2` — suspended on user input (only from `run` / `resume`).
- `3` — permission-denied at the kernel boundary.
