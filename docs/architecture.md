# Architecture

A top-down tour of how Agenteer is put together. Read this before `capabilities.md` or `cli.md` — it's the map the rest of the docs assume.

## The elevator pitch

Every piece of state is inspectable, replayable, and bounded by an explicit capability grammar. Nodes compose via returned intents. Sessions pause and resume on disk. Community packages ship through npm under a strict `@<scope>/node-<name>` convention.

Concretely:

- You declare **nodes**: units of work with a manifest, Zod schemas, and an `execute()` function that returns an **intent**.
- The **runtime** authorizes each spawn against a **capability envelope**, dispatches the node, applies its returned ctx patches, and records **evidence**.
- A **session** is an on-disk directory that captures everything: the spawn tree, every ctx patch, every evidence record, every permission decision, every pending human prompt.

The runtime is the only thing that applies state changes. Nodes return intents; the runtime decides what (if anything) to do with them.

## Packages (the stack)

```
+-----------------------------------------------------+
|  @agenteer/cli        bin + workflow runner         |
+-----------------------------------------------------+
|  @agenteer/stdlib     19 v1 nodes (factories)       |
+-----------------------------------------------------+
|  @agenteer/registry   publish/install + ajv bridge  |
+-----------------------------------------------------+
|  @agenteer/core       Runtime, kernel, context      |
+------------------------+----------------------------+
                         | depends on
                         v
                 +-------------------+
                 |  @agenteer/trust  |   evidence, structured,
                 |                   |   access, cross-check
                 +-------------------+
                         no deps on core
```

`@agenteer/trust` is deliberately free of a core dependency — you can use its evidence / structured-output / access-guard modules in any Node project without adopting the full runtime.

## The runtime loop

A single `runtime.run(rootSpawn, grantedCaps)` call:

1. **Authorize the root spawn.** The kernel intersects `grantedCaps` with the root manifest's `required_actions`. If the intersection doesn't cover a required capability, deny.
2. **Build the root frame.** Each frame carries an `effectiveCaps` set (the intersection) and a `ctxScope` set (parent ctx ∪ ctx grants).
3. **Materialize the slice.** The node declares what ctx items it needs via `ctx: [...selectors]`. The runtime materializes those as a read-only slice — filtered by `ctxScope`, which is how parent-slice bounds are enforced.
4. **Run `execute()`.** The node does its work and returns an intent:
   - `{kind: "output", value, evidence}` — done; value becomes a ctx artifact.
   - `{kind: "spawn_children", children, ctx_grants?}` — push new frames onto the queue.
   - `{kind: "needs_user", prompt}` — suspend; the session records the pending prompt.
   - `{kind: "error", reason}` — record a failure evidence record and propagate.
   - `{kind: "replace_me", with}` — replace the current frame with a new spawn (tail-call).
5. **Apply the intent.** The runtime applies the ctx patch, writes evidence, emits events, and loops to the next frame.
6. **Loop until the queue is empty.**

The runtime is single-threaded. Parallelism is explicit via `parallel_fanout` (which spawns N child frames with the same manifest) or by returning multiple children from a single `spawn_children` intent.

## Context: content-addressable, immutable, sliced

The context store is the shared memory. Items are **immutable** — once written, never mutated. An item's id is a hash of its canonical content, so writing the same value twice is a no-op dedup. When something changes upstream, **staleness** propagates through `derives_from` chains and downstream consumers see a `StaleMarker` on their slice.

**Slices** are what nodes actually see. A slice is a read-only view over the store, filtered by:

- selectors (by id, by tag, by type)
- the frame's `ctxScope` (parent ctx ∪ ctx grants)

The slice is materialized deterministically — same inputs, same bytes. That's what makes replay possible.

Two stores ship: `InMemoryContextStore` (tests, transient) and `FileContextStore` (sessions; atomic YAML writes + per-path mutex; the durable option).

## Evidence: a record per verdict

Every node run emits one **primary** evidence record — `pass`, `fail`, or `neutral` with a title, tool/command, exit code, and timestamps. Nodes can emit **auxiliary** records for sub-checks (access scans, cross-checks, sub-tests). All records are grouped by `lineage_id` so the full trace through a subtree is legible in one grep.

Evidence is YAML on disk, append-only. The `EvidenceStore` interface is the seam — the default `YamlEvidenceStore` writes to `.session/evidence/`, but you can plug in anything (SQLite, S3) that honors the same API.

`inspect --evidence` renders the tree; `ctx lineage` walks upstream.

## Permission kernel: capability grammar + spawn authorization

Capabilities are strings: `fs.read:/tmp/**`, `model:claude-*`, `tool:gh`, `net.http:api.github.com/**`. Eleven resource types; glob-scoped; combinable into capability sets.

The kernel is:

- **`parseCapability(s)`** → `ParsedCapability` (type, glob, optional operation).
- **`isSubset(a, b)`** → `SubsetResult` — is `a` ⊆ `b`?
- **`intersect(a, b)`** → the tightest capability set covering only what both allow.
- **`authorizeSpawn({parent, child})`** → allow-with-effective-caps OR deny with `missing` list.

Spawn rule: `parent.effective ∩ child.required` must **cover** each required capability. Attenuation (child narrower than parent) is fine; escalation is denied. Over spawn chains, effective capabilities monotonically shrink.

Every deny emits a `spawn_denied` event the session records. `explainPermissionDenial()` renders it with actionable hints — `inspect --denials` shows the list.

See [capabilities.md](capabilities.md) for the grammar.

## Manifest: the public face of a node

Every node ships a `NodeManifest`:

- `id` — `@<scope>/node-<name>`, matches `package.json.name` exactly.
- `version` — semver.
- `determinism` — `deterministic` or `stochastic`.
- `required_actions` — the capabilities the runtime must grant for this node to run.
- `input_schema` / `output_schema` — Zod (in-tree) or plain JSON Schema (published via ajv bridge).
- `tags` — optional, for searching / registry curation.
- `dynamic_actions` — `true` if the node issues `callAction` at runtime with caps chosen at runtime (triggers an install-time hard-stop for third-party packages).

The schema is backed by Zod and enforced by `validateManifest`. JSON-Schema publishers run through the ajv bridge at install time, which wraps their schema in a `z.unknown().superRefine(...)` that preserves instancePath as the Zod issue path — so error messages look identical either way.

## Sessions: pause, persist, resume

A session directory holds:

```
.session/
  session.yaml          — SessionState: status, pending prompt, answers, root spawn
  events.jsonl          — append-only event log
  context/
    <item-id>.yaml      — one file per ctx item (content-addressable)
  evidence/
    <record-id>.yaml    — one file per evidence record
```

When a node returns `needs_user`, the runtime suspends, the recorder writes `session.yaml` with the pending prompt, and `runtime.run()` returns `awaiting_user`. You respond, call `resume`, and the runtime replays from the suspension point using the `recordedAnswerResolver` to satisfy the prompt from disk.

Replay is **not** caching. Deterministic nodes re-run on resume (content-addressable ctx dedupes, so there's no corruption). Stochastic `llm_call` re-queries. Caching lands in v1.1.

## Registry: npm as the substrate

There is no proprietary registry. `publish` = `npm publish --provenance`. `install` = `npm install` + validation + capability-diff + lockfile pinning + on-disk `framework.workflow.yaml` registration.

The trust boundary at v1 is **npm provenance**. Sigstore/cosign signing + a transparency log are v1.1. For today, a published node's provenance status (built-from-git + build-runner identity) is visible via `renderProvenanceLine`.

Third-party packages with `dynamic_actions: true` trigger an install-time hard-stop: even `--yes` does not auto-approve. You must manually confirm. First-party `@agenteer/*` packages are exempt (same enforcement scope as the project itself).

## What the v1.0 package does NOT do

Deferred to v1.1:

- **Node-output caching.** Resume re-runs deterministic nodes.
- **Multi-process session locking.** Sessions are single-writer by design at v1.0.
- **`context_curator` condensing + pedagogical modes.** Query mode only.
- **Sigstore/cosign signing.** npm provenance is the v1 trust boundary.
- **`framework.lock` upgrade resolver.** Lockfile pins manifest hashes; upgrade flows are v1.1.

And an explicit non-goal: **`default_planner` does not conceptualize new node types.** It selects from `available_manifests`. Dynamically authoring new node packages is a research problem that belongs in a separate agent that produces publishable packages — not in a planner emitting plans without a verification story.

## Where to go next

- [capabilities.md](capabilities.md) — the grammar + examples.
- [cli.md](cli.md) — every CLI subcommand, every flag.
- [publishing-a-node.md](publishing-a-node.md) — scaffold → validate → publish flow.
- [../examples/research-assistant/README.md](../examples/research-assistant/README.md) — runnable 6-node demo.
