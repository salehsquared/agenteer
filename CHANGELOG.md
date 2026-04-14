# Changelog

All notable changes to the Agenteer project are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses [semver](https://semver.org/).

Each published npm package (`@agenteer/core`, `@agenteer/trust`, `@agenteer/stdlib`, `@agenteer/registry`, `@agenteer/cli`, `@agenteer/create-node`) is versioned in lockstep until the first stable `1.0.0`. After that, packages may version independently when a change is scoped to a single package.

## [Unreleased]

Nothing yet. The first post-`1.0.0-rc.1` change lands here.

## [1.0.0-rc.1] — 2026-04-14

First npm release. Six packages published under the `@agenteer` organization, all at the same version. Everything described in the root [README](./README.md) ships with this tag.

### Scope

- **`@agenteer/core`** — Runtime, Node primitive, content-addressable context store (in-memory + file-backed), event bus, permission kernel (eleven resource types), manifest schema, session persistence.
- **`@agenteer/trust`** — evidence records with YAML storage, structured LLM output with text-parse retry, filesystem access guard, cross-check engine. Zero runtime dependency on `@agenteer/core`.
- **`@agenteer/stdlib`** — 18 hardened nodes: 5 primitives, 5 validators, 4 meta, 2 human-in-the-loop, 1 planner, 1 context curator (query mode).
- **`@agenteer/registry`** — publish, install, search, permission-diff, `framework.lock` management, ajv JSON-Schema → Zod bridge.
- **`@agenteer/cli`** — `run / resume / ctx / inspect / publish / install / search` subcommands, plus Anthropic and OpenAI `ProviderLike` adapters.
- **`@agenteer/create-node`** — `npx @agenteer/create-node @scope/node-name` scaffold.

### v1.0 gate items (landed before first publish)

- **R4-A — install-time hard-stop for third-party `dynamic_actions: true` packages.** Third-party packages that declare runtime-chosen capabilities bypass `--yes` autoApprove and must be manually confirmed at install. First-party `@agenteer/*` packages are exempt (same enforcement scope as the project itself).
- **C1 — parent slice-view bounds on child spawn.** Every frame carries a `ctxScope = parent.ctx ∪ ctx_grants.keys`; child slice materialization filters to this set; a `ctx_scope_restricted` event fires when items are hidden.
- **A5 — ajv JSON-Schema bridge.** Non-Zod publishers can ship plain JSON Schema in `framework.json`; the registry compiles it to a `z.unknown().superRefine(...)` shape at install, preserving `instancePath` as the Zod issue path so errors look identical either way.

### Polish shipped with the gate

- **Actionable errors.** `explainPermissionDenial(denial)` and `explainManifestIssues(issues)` turn kernel rejections into text with concrete hints.
- **Expanded `agenteer inspect`.** `--ctx-timeline`, `--evidence`, `--denials`, `--summary` views.
- **`@agenteer/create-node` scaffold.** `npx` entry point + `docs/publishing-a-node.md` walkthrough.
- **Research-assistant demo.** Runnable 6-stdlib-node composition under `examples/research-assistant/`.

### Explicit non-goals (will not change before stable)

- **`default_planner` does not conceptualize new node types.** It composes over the manifests passed as `available_manifests`. Dynamically authoring new node packages is out of scope for v1.

### Known deferrals (shipping in 1.1)

- Node-output caching. Deterministic nodes re-run on resume; content-addressable ctx dedupes so correctness is preserved.
- Multi-process session locking. Sessions are single-writer by design at 1.0.
- `context_curator` condensing + pedagogical modes. Query mode only in this release.
- Sigstore/cosign signing + transparency log. npm provenance is the 1.0 trust boundary.
- `framework.lock` upgrade resolver. The lockfile pins manifest content hashes today; upgrade flows land in 1.1.

### Counts

- 175/175 tests green
- 6 published packages
- 18 stdlib nodes
- 11 capability resource types
- 7 CLI subcommands

[Unreleased]: https://github.com/salehsquared/agenteer/compare/04dee2f...HEAD
[1.0.0-rc.1]: https://github.com/salehsquared/agenteer/commit/04dee2f
