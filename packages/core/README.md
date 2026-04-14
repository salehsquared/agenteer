# @agenteer/core

Core runtime for [Agenteer](https://github.com/salehsquared/agenteer) — a debuggable agentic framework where every piece of state (context, evidence, permission decisions) is inspectable, replayable, and bounded by an explicit capability grammar.

This package provides the **runtime primitives**: the Node type, the runtime loop, the context store (in-memory + file-backed), the event bus, the permission kernel, the manifest schema, and session persistence. It has one runtime dependency on `@agenteer/trust` for evidence records.

## Install

```bash
npm install @agenteer/core @agenteer/trust zod
```

Requires **Node ≥ 20**.

## 30-second example

```ts
import {
  InMemoryContextStore,
  InMemoryNodeRegistry,
  MemoryEvidenceSink,
  Runtime,
  makeManifest,
} from "@agenteer/core";
import { z } from "zod";

const manifest = makeManifest({
  id: "@example/node-hello",
  name: "hello",
  description: "Says hello.",
  determinism: "deterministic",
  required_actions: [],
});

const registry = new InMemoryNodeRegistry();
registry.register(manifest, () => ({
  manifest,
  inputSchema: z.object({ who: z.string() }),
  outputSchema: z.object({ greeting: z.string() }),
  ctx: [],
  model: null,
  async execute(input) {
    return {
      kind: "output",
      value: { greeting: `hello, ${input.original.who}` },
      evidence: { verdict: "pass" },
    };
  },
}));

const runtime = new Runtime({
  registry,
  contextStore: new InMemoryContextStore(),
  evidenceSink: new MemoryEvidenceSink(),
});

const outcome = await runtime.run(
  { manifest_id: manifest.id, input: { who: "world" }, correlation: "root" },
  [`spawn:${manifest.id}`],
);
console.log(outcome.rootResult);
```

## What you get

- **`Runtime`** — the main driver. Authorizes each spawn against a capability envelope, dispatches nodes, applies ctx patches, records evidence.
- **`InMemoryContextStore` / `FileContextStore`** — content-addressable, immutable context items with slice materialization and staleness propagation.
- **`InMemoryNodeRegistry`** — map of `manifest_id` → factory. Nodes lookup and instantiate via the registry.
- **Permission kernel** — `authorizeSpawn`, `isSubset`, `intersect`, capability grammar parser. Parents can attenuate; children cannot escalate.
- **Manifest schema** — Zod-backed schema for `NodeManifest` with ajv JSON-Schema bridging available via `@agenteer/registry`.
- **Session persistence** — `SessionState`, `SessionRecorder`, and `recordedAnswerResolver` for `ask_user` / `approval_gate` pause/resume.
- **Events** — typed emitter with `node_start`, `node_complete`, `evidence_collected`, `ctx_scope_restricted`, etc.
- **Explainers** — `explainPermissionDenial` and `explainManifestIssues` turn kernel denials into actionable error text.

## Capability grammar

A capability is a string like `fs.read:/tmp/**`, `model:claude-*`, `tool:gh`, or `net.http:api.github.com/**`. Eleven resource types; glob-scoped; used to gate every `spawn` and every `callAction`.

```
<type>:<glob>[#<operation>]
```

Children must declare required capabilities in their manifest. The runtime intersects parent grants with child requirements; the child runs with the intersection. If the intersection is empty or doesn't cover a needed capability, the spawn is denied at authorize time, before any code runs. See [capabilities.md](https://github.com/salehsquared/agenteer/blob/main/docs/capabilities.md) for the full grammar.

## License

MIT — see LICENSE.
