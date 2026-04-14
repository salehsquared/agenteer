# Agenteer

**Debuggable context · hardened node library · dynamic composition.**

A greenfield agentic framework whose pitch is that every piece of state — context, evidence, permission decisions — is inspectable, replayable, and bounded by an explicit capability grammar. Nodes compose via returned intents, sessions pause and resume on disk, and community packages ship through npm under a strict `@<scope>/node-<name>` convention.

Status: **v1.0 release candidate.** Published to npm as `1.0.0-rc.1` under the `@agenteer/*` scope. M1 → M6 implemented, plus three v1.0 gate items (dynamic-actions install hard-stop, parent-slice bounds on child spawn, ajv JSON-Schema bridge). 175 / 175 tests green.

## Packages

- **`@agenteer/core`** — Node primitive, runtime loop, context store (in-memory + FileContextStore), event bus, permission kernel, manifest schema, session persistence.
- **`@agenteer/trust`** — evidence records, structured output with text-parse retry, filesystem access guard, cross-check engine. Zero dependency on core.
- **`@agenteer/stdlib`** — 18 v1 nodes (5 primitives, 5 validators, 4 meta, 2 humans, 1 planner, 1 context).
- **`@agenteer/cli`** — `agenteer run / resume / ctx / inspect / publish / install / search`, plus Anthropic + OpenAI `ProviderLike` adapters.
- **`@agenteer/registry`** — publishing, installing, permission-diff, `framework.lock`, ajv bridge.
- **`@agenteer/create-node`** — `npx @agenteer/create-node @scope/node-name` scaffold.

## Quickstart

Install from npm:

```bash
npm install @agenteer/core @agenteer/stdlib @agenteer/trust zod
```

Run a two-node workflow end to end:

```ts
import {
  InMemoryContextStore,
  InMemoryNodeRegistry,
  MemoryEvidenceSink,
  Runtime,
  makeManifest,
  type Node,
} from "@agenteer/core";
import { z } from "zod";

const manifest = makeManifest({
  id: "@example/node-greet",
  name: "greet",
  description: "Greets the given name.",
  determinism: "deterministic",
  required_actions: [],
});

const registry = new InMemoryNodeRegistry();
registry.register(
  manifest,
  (): Node<{ name: string }, { message: string }> => ({
    manifest,
    inputSchema: z.object({ name: z.string() }),
    outputSchema: z.object({ message: z.string() }),
    ctx: [],
    model: null,
    async execute(input) {
      return {
        kind: "output",
        value: { message: `hello, ${input.original.name}` },
        evidence: { verdict: "pass" },
      };
    },
  }),
);

const runtime = new Runtime({
  registry,
  contextStore: new InMemoryContextStore(),
  evidenceSink: new MemoryEvidenceSink(),
});

const outcome = await runtime.run(
  { manifest_id: manifest.id, input: { name: "world" }, correlation: "root" },
  [`spawn:${manifest.id}`],
);
console.log(outcome.rootResult);
// { kind: "output", value: { message: "hello, world" }, evidence: { verdict: "pass" } }
```

Or install the CLI and run a stdlib node from the shell:

```bash
npm install -g @agenteer/cli
```

```yaml
# workflow.yaml
manifest_id: "@agenteer/node-regex-check"
input:
  input: "release 1.0.0-rc.1"
  rules:
    - id: contains-rc
      pattern: "1\\.0\\.0-rc\\.1"
      kind: must_match
granted: []
```

```bash
agenteer run --spec workflow.yaml --session ./.session
agenteer inspect --session ./.session --summary
```

A runnable demo using six stdlib nodes lives at [`examples/research-assistant/`](examples/research-assistant/README.md) — question → plan → approve → search → check → report.

## Dev setup (contributing to the monorepo)

Only needed if you're working **on** Agenteer itself, not using it:

```bash
git clone https://github.com/salehsquared/agenteer.git
cd agenteer
npm install
npm run build
npm test
```

Requires Node ≥ 20. The test suite is 175 tests across 43 files; expect ~3 seconds.

## What you get at v1.0

- **Capability-gated spawns + actions** — every `spawn` and every `callAction` is checked against a hierarchical capability envelope (`fs.read:/tmp/**`, `model:claude-*`, `tool:gh`, etc.). Parents can attenuate; children can't escalate.
- **Content-addressable context** — items are immutable and deduplicated by canonical content hash; staleness propagates through `derives_from` chains; slices materialize deterministically.
- **Session pause/resume on disk** — `ask_user` and `approval_gate` suspend the runtime; the session directory captures every step; `agenteer resume` replays with recorded answers.
- **Evidence records** — one primary per node run, auxiliaries for access scans and cross-checks, all grouped by `lineage_id` so the full trace is legible.
- **Publishable nodes** — `agenteer publish --dir .` runs a validator + delegates to `npm publish --provenance`; third-party packages with `dynamic_actions: true` trigger an install-time hard-stop even with `--yes` (R4-A).
- **JSON Schema or Zod** — non-Zod publishers ship `input_schema` / `output_schema` as plain JSON Schema in `framework.json`; the ajv bridge compiles them at install.

## What you don't get at v1.0 (ships in v1.1)

- **Node-output caching.** Deterministic nodes re-run on resume. Content-addressable ctx dedupes, so correctness is preserved; latency isn't optimized yet.
- **Multi-process session locking.** Sessions are single-writer by design at v1.0.
- **`context_curator` condensing + pedagogical modes.** Query mode only.
- **Sigstore/cosign signing + transparency log.** npm provenance is the v1 trust boundary.
- **`framework.lock` upgrade resolver.** The lockfile pins manifest content hashes today; upgrade flows are v1.1.

## ⚠️ Scope note: what `default_planner` does (and doesn't)

`default_planner` composes a plan **by selecting from the manifests you pass it** via `available_manifests`. Its output is a plan-as-data artifact: an ordered list of `{manifest_id, input, depends_on}` steps drawn from the candidates you supplied.

**It does NOT conceptualize new node types.** Plans can't refer to manifests that weren't in `available_manifests`. The runtime refuses to spawn anything outside that set; the planner refuses to emit anything outside it too (defensively — the kernel would reject a rogue step at auth time regardless).

If you want new capabilities in a workflow, install more nodes (`agenteer install @acme/node-foo`) or register a custom node via `extraRegistrations`. Don't expect the planner to invent them.

That's a deliberate v1.0 scoping decision. Dynamically-conceptualized node types are a research problem that belongs somewhere else in the stack — likely an agent that *authors* a node package (producing a publishable `framework.json`) rather than a planner that synthesizes at plan-emit time without a verification story.

## Docs

- [Architecture](docs/architecture.md) — top-down tour: runtime loop, context, evidence, kernel, sessions.
- [Capabilities](docs/capabilities.md) — the grammar, intersection rules, and `dynamic_actions` semantics.
- [Writing a node](docs/nodes.md) — Node contract, intents, ctx patches, evidence deltas.
- [Evidence records](docs/evidence.md) — verdict semantics, lineage, staleness, reading a trace.
- [CLI reference](docs/cli.md) — every command, every flag.
- [Publishing a node](docs/publishing-a-node.md) — scaffold, validate, publish, troubleshoot.
- [Verdaccio verification](packages/registry/VERDACCIO.md) — real-registry walkthrough for the publish → install story.
- [Research assistant demo](examples/research-assistant/README.md) — runnable 6-stdlib-node composition.
- [Changelog](CHANGELOG.md) — per-release notes.

## Layout

```
packages/
  core/         — @agenteer/core
  trust/        — @agenteer/trust
  stdlib/       — @agenteer/stdlib
  cli/          — @agenteer/cli + bin/agenteer.ts
  registry/     — @agenteer/registry
  create-node/  — @agenteer/create-node (npx scaffold)
examples/
  research-assistant/  — runnable demo
docs/
  architecture.md      — system tour
  capabilities.md      — permission grammar
  nodes.md             — how to write a node
  evidence.md          — evidence records, lineage, staleness
  cli.md               — CLI reference
  publishing-a-node.md — node-author publish flow
CHANGELOG.md
LICENSE
```

## License

MIT (see LICENSE).
