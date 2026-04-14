# @agenteer/stdlib

The 18 standard-library nodes for [Agenteer](https://github.com/salehsquared/agenteer). Each node ships with a hardened schema, explicit capability requirements, and a factory the runtime can register directly.

## Install

```bash
npm install @agenteer/stdlib @agenteer/core @agenteer/trust zod
```

Requires **Node ≥ 20**.

## The nodes

**Primitives (5):**

| id | purpose |
|---|---|
| `@agenteer/node-file-read` | Read files with fs.read capability gating. |
| `@agenteer/node-file-write` | Write files with fs.write capability gating + staleness emission. |
| `@agenteer/node-shell-exec` | Run shell commands with shell capability gating + exit-code verdict. |
| `@agenteer/node-llm-call` | Structured LLM call with retry. Needs a `ModelProvider`. |
| `@agenteer/node-tool-call` | Dispatch to registered tools (e.g. `web_search`, `gh`). Needs a `ToolRegistry`. |

**Validators (5):**

| id | purpose |
|---|---|
| `@agenteer/node-json-schema-validate` | Validate arbitrary JSON against a JSON Schema via ajv. |
| `@agenteer/node-regex-check` | `must_match` / `must_not_match` rule list over a string. |
| `@agenteer/node-compile` | Pluggable compile adapter (tsc, swc, etc.). Emits compile evidence. |
| `@agenteer/node-test-run` | Pluggable test adapter (vitest, jest). Emits test evidence. |
| `@agenteer/node-typecheck` | Standalone typecheck via adapter; emits typecheck evidence. |

**Meta (4):**

| id | purpose |
|---|---|
| `@agenteer/node-parallel-fanout` | Spawn N children with the same manifest, different inputs; join modes `all` / `any` / `race`. |
| `@agenteer/node-cross-check` | Run two providers against the same input; emits an agreement evidence record. |
| `@agenteer/node-judge-with-stripped-ctx` | Grade a ctx artifact against a rubric using only the artifact itself (no lineage leak). |
| `@agenteer/node-repair-loop` | Bounded iterative repair over a failing evidence record. |

**Humans (2):**

| id | purpose |
|---|---|
| `@agenteer/node-approval-gate` | Suspends the runtime until a human approves or denies. |
| `@agenteer/node-ask-user` | Suspends the runtime to ask the user a free-form question. |

**Planner (1):**

| id | purpose |
|---|---|
| `@agenteer/node-default-planner` | Composes a plan-as-data from `available_manifests`. Does **not** conceptualize new node types. |

**Context (1):**

| id | purpose |
|---|---|
| `@agenteer/node-context-curator` | Query/condense ctx artifacts. v1.0 ships query-mode only. |

## Quickstart

```ts
import { InMemoryNodeRegistry } from "@agenteer/core";
import { registerStdlib } from "@agenteer/stdlib";

const registry = new InMemoryNodeRegistry();
registerStdlib(registry);
// registry now has 14 nodes registered (self-contained ones).
```

Nodes with external wiring (provider, tool registry, resolver) are exported as factories so you can wire them yourself:

```ts
import {
  approvalGateFactory, approvalGateManifest,
  askUserFactory, askUserManifest,
  llmCallFactory, llmCallManifest,
  crossCheckFactory, crossCheckManifest,
} from "@agenteer/stdlib";

registry.register(approvalGateManifest, approvalGateFactory(myApprovalResolver));
registry.register(askUserManifest, askUserFactory({ resolver: myAskResolver }));
registry.register(llmCallManifest, llmCallFactory());              // runtime injects the provider
registry.register(crossCheckManifest, crossCheckFactory(myProviderResolver));
```

## `default_planner` — what it does and doesn't

The planner composes a plan **by selecting from the manifests you pass via `available_manifests`**. Its output is a plan-as-data artifact: an ordered list of `{manifest_id, input, depends_on}` steps drawn from the candidates you supplied.

It does **not** conceptualize new node types. Plans can't refer to manifests that weren't in `available_manifests`. If you want new capabilities in a workflow, install more nodes (`agenteer install @acme/node-foo`) or register a custom node via `extraRegistrations`.

## License

MIT — see LICENSE.
