# Capabilities

Agenteer's permission model in one page. Every spawn and every `callAction` is gated by a capability envelope; parents can attenuate; children can never escalate.

## The grammar

A capability is a single string:

```
<type>:<glob>[#<operation>]
```

| part | examples |
|---|---|
| `type` | `fs.read`, `fs.write`, `fs.delete`, `net.http`, `net.dns`, `shell.exec`, `model`, `context.read`, `context.write`, `spawn`, `tool` |
| `glob` | `/tmp/**`, `claude-*`, `api.github.com/**`, `@acme/node-*`, `gh`, `*` |
| `operation` | optional; fine-grained action (e.g. `net.http:api.example.com/**#POST`) |

Eleven resource types total. Scope with a glob; narrow further with an operation.

## What each type gates

| type | gated operations |
|---|---|
| `fs.read:<path-glob>` | `read`, `list` on the filesystem |
| `fs.write:<path-glob>` | `write`, `create` on the filesystem |
| `fs.delete:<path-glob>` | `unlink`, `rmdir` |
| `net.http:<url-glob>` | HTTP requests; operation is the method (GET/POST/etc.) |
| `net.dns:<host-glob>` | DNS resolution (rarely used directly) |
| `shell.exec:<cmd-glob>` | `shell_exec` primitive with a command-line glob |
| `model:<id-glob>` | which LLM model ids this node may call |
| `context.read:<tag-glob>` | which ctx tags a node may read |
| `context.write:<tag-glob>` | which ctx tags a node may write |
| `spawn:<manifest-id-glob>` | which child manifests this node may spawn |
| `tool:<tool-id-glob>` | which tool-registry entries this node may dispatch |

## Example envelopes

A read-only documentation node:
```
context.read:spec.*
context.read:docs.*
context.write:report.*
model:claude-*
```

A scaffold node that edits `./src`:
```
fs.read:./src/**
fs.write:./src/**
fs.delete:./src/**
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

## How the kernel decides

Given a parent with effective caps `E` and a child with required caps `R`, the kernel computes:

```
E' = E ∩ R
```

Then checks that `E'` covers every member of `R` (every required glob is ⊆ some member of `E`). If covered, allow — the child runs with effective caps `E'`. If not, deny — the `authorizeSpawn` result includes `missing: ParsedCapability[]` listing what the child asked for that the parent couldn't grant.

**Attenuation** (child narrower than parent): allowed.
- Parent: `fs.read:/tmp/**`, child: `fs.read:/tmp/work/**` → fine.

**Escalation** (child wider than parent): denied.
- Parent: `fs.read:/tmp/work/**`, child: `fs.read:/tmp/**` → denied. The intersection is `/tmp/work/**`, which does not cover `/tmp/**`.

**Intersection over globs** is glob-aware: `fs.read:/tmp/a/*.txt ∩ fs.read:/tmp/**` = `/tmp/a/*.txt`.

## Context scope (the C1 rule)

In addition to capabilities, child frames are bounded by a `ctxScope`:

```
child.ctxScope = parent.ctx ∪ ctx_grants.keys
```

A parent passing down a ctx grant must either already hold those ctx items in its own slice or have `context.read` capability for them. The runtime materializes the child's slice filtered by `ctxScope` — items outside are invisible, even if the child declares them in its `ctx: [...]` selectors. The runtime emits a `ctx_scope_restricted` event when this filter hides items, so you can audit it via `inspect --ctx-timeline`.

## `dynamic_actions: true` and why it's load-bearing

Most nodes declare a fixed `required_actions` list at authorship time. But meta-nodes like `default_planner` and `parallel_fanout` may issue `callAction` with caps chosen at **runtime** (e.g. "spawn whichever child the plan called for"). Those manifests set `dynamic_actions: true` to signal the runtime that their effective caps may span beyond the static list.

At install time, a third-party package (non-`@agenteer/*` scope) with `dynamic_actions: true` triggers a hard-stop. Even `--yes` does not auto-approve. The human must confirm explicitly — because you're granting "this package may attempt anything at runtime up to its required_actions envelope." First-party `@agenteer/*` packages are exempt (same enforcement scope as the project itself).

## Globs

Pattern syntax is conventional glob: `*` (one segment), `**` (zero or more segments), literal path separators, no character classes. Internally we use `micromatch`-style globs. If you need to match `.` literally in a URL host, just include it: `api.github.com/**`.

## Denylist

A capability set can carry an explicit denylist that wins against any allow, useful for shared-config overrides like "no network calls, ever". See `DenylistViolation` in the kernel module. Denials from the denylist are distinguished from intersection failures in the event stream.

## Debugging denials

Any denied spawn emits a `spawn_denied` event the session records. Two helpers render them:

```ts
import { explainPermissionDenial } from "@agenteer/core";

const text = explainPermissionDenial({
  denial,
  childManifestId: "@acme/node-foo",
  grantedCaps,
  context: "inside planner step 2",
});
```

`agenteer inspect --denials` prints one per line with the hint text. Each denial includes the `missing` caps — usually the answer is "add those to the parent's `required_actions` (if the node needs them) or the spec's `granted` list (if the workflow as a whole doesn't have them yet)."

## The always-check

If you write a custom node, declare only what you need. The runtime will intersect harder than you think — better to overly-narrow in the manifest and let the caller decide how to grant, than to overly-broaden and have the kernel block you at authorize time.
