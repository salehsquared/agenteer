# Capabilities

Agenteer's permission model in one page. Every spawn and every `callAction` is gated by a capability envelope; parents can attenuate; children cannot escalate.

## The grammar

A capability is a single string:

```
<type>:<scope>
```

| part | examples |
|---|---|
| `type` | `fs.read`, `fs.write`, `fs.delete`, `net.http`, `net.dns`, `shell.exec`, `model`, `context.read`, `context.write`, `spawn`, `tool` |
| `scope` | `/tmp/**`, `claude-*`, `api.github.com/**`, `@acme/node-*`, `gh`, `*`, `` |

Eleven resource types total.

## What each type gates

| type | scope rules |
|---|---|
| `fs.read:<path-glob>` | Absolute path glob or `*` |
| `fs.write:<path-glob>` | Absolute path glob or `*` |
| `fs.delete:<path-glob>` | Absolute path glob or `*` |
| `net.http:<host-and-path-glob>` | Host/path glob derived from the requested URL |
| `net.dns:<host-glob>` | Host glob |
| `shell.exec:` | Scopeless. The scope must be empty. |
| `model:<id-glob>` | Model id glob |
| `context.read:<tag-glob>` | Ctx tag glob |
| `context.write:<tag-glob>` | Ctx tag glob |
| `spawn:<manifest-id-glob>` | Child manifest id glob |
| `tool:<tool-id-glob>` | Tool name glob |

Two constraints are easy to miss:

- Filesystem capabilities must use absolute paths. `fs.write:./src/**` is invalid; use something like `fs.write:/workspace/src/**`.
- `shell.exec` does not encode command text in the capability. The valid form is `shell.exec:`.

`net.http` also does not encode HTTP method as a separate capability dimension. Authorization is based on the normalized host/path scope the runtime derives from the URL.

## Example envelopes

A read-only documentation node:

```
context.read:spec.*
context.read:docs.*
context.write:report.*
model:claude-*
```

A scaffold node that edits a workspace tree:

```
fs.read:/workspace/src/**
fs.write:/workspace/src/**
fs.delete:/workspace/src/**
spawn:@agenteer/node-file-*
context.write:scaffold.*
```

A tool-using triage agent:

```
tool:gh
tool:jira
net.http:api.github.com/**
model:claude-sonnet-*
spawn:@agenteer/node-tool-call
spawn:@agenteer/node-llm-call
```

A shell-enabled node:

```
shell.exec:
fs.read:/workspace/**
fs.write:/workspace/**
```

## How the kernel decides

Given a parent with effective caps `E` and a child with required caps `R`, the kernel computes:

```
E' = E ∩ R
```

Then it checks that `E'` covers every member of `R`. If covered, the child runs with effective caps `E'`. If not, the spawn is denied with a `missing` list.

**Attenuation** is allowed.

- Parent: `fs.read:/tmp/**`
- Child: `fs.read:/tmp/work/**`

**Escalation** is denied.

- Parent: `fs.read:/tmp/work/**`
- Child: `fs.read:/tmp/**`

Over a spawn chain, effective capabilities only stay the same or shrink.

## Context scope (the C1 rule)

In addition to capabilities, child frames are bounded by `ctxScope`:

```
child.ctxScope = parent.ctx ∪ ctx_grants.keys
```

A parent can only grant ctx items it already holds in-scope or can read. The runtime materializes each child slice filtered by that scope and emits `ctx_scope_restricted` when items are hidden.

## `dynamic_actions: true`

Most nodes declare a fixed `required_actions` list. Meta-nodes like `default_planner` and `parallel_fanout` may issue `callAction` with caps chosen at runtime; those manifests set `dynamic_actions: true`.

At install time, a third-party package with `dynamic_actions: true` triggers a hard-stop. `--yes` does not auto-approve it. First-party `@agenteer/*` packages are exempt from that specific install-time hard-stop.

## Globs

The kernel uses its own simple glob matcher:

- `*` matches within a single segment
- `**` matches across zero or more segments
- no character classes
- no negation

This is not a full micromatch implementation.

## Denylist

A capability allow-list can be paired with a denylist floor for paths that are never allowed even when a capability would otherwise match. The denylist is enforced separately from subset/intersection checks.

## Debugging denials

Denied spawns are recorded and can be rendered with `explainPermissionDenial()`:

```ts
import { explainPermissionDenial } from "@agenteer/core";

const text = explainPermissionDenial({
  denial,
  childManifestId: "@acme/node-foo",
  grantedCaps,
  context: "inside planner step 2",
});
```

`agenteer inspect --denials` prints the recorded denials with the same hint text.
