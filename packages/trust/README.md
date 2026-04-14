# @agenteer/trust

Trust layer for [Agenteer](https://github.com/salehsquared/agenteer). Four independent modules you can use in isolation, even outside of Agenteer runtimes:

- **`/evidence`** — YAML-backed evidence records with primary/auxiliary kinds, `lineage_id` grouping, and a `MemoryEvidenceSink` + `YamlEvidenceStore`.
- **`/structured`** — structured LLM output with schema retry (`generateStructured`) that recovers from text-parse failures using a feedback loop.
- **`/access`** — filesystem access guard that records reads/writes as capabilities and emits a pre-flight scan.
- **`/crosscheck`** — cross-check engine for running a second model against a primary's output and recording the agreement/disagreement as an auxiliary evidence record.

**Zero runtime dependency on `@agenteer/core`** — you can pull this into any Node project that wants evidence-style observability.

## Install

```bash
npm install @agenteer/trust zod
```

Requires **Node ≥ 20**.

## Evidence records

```ts
import { YamlEvidenceStore } from "@agenteer/trust/evidence";

const store = new YamlEvidenceStore({ dir: "./.session/evidence" });
await store.put({
  kind: "primary",
  node_run_id: "nrun-123",
  lineage_id: "L-42",
  verdict: "pass",
  title: "compile clean",
  tool: { command: "tsc --noEmit", exit_code: 0 },
  run: { trigger: "agent", at: new Date().toISOString() },
});
```

Evidence is append-only YAML, one file per record. Deduplication is content-addressable; staleness tracking cascades when upstream items change.

## Structured output with retry

```ts
import { generateStructured } from "@agenteer/trust/structured";
import { z } from "zod";

const Spec = z.object({
  title: z.string(),
  bullets: z.array(z.string()).min(3),
});

const result = await generateStructured({
  provider,                 // any ModelProvider
  schema: Spec,
  prompt: "Summarize the README as a 3+ bullet list.",
  maxRetries: 2,
});
```

On validation failure, the retry loop feeds the parse errors back into the model with a targeted repair prompt. No silent fallbacks.

## Filesystem access guard

```ts
import { AccessGuard } from "@agenteer/trust/access";

const guard = new AccessGuard({ caps: ["fs.read:/tmp/**", "fs.write:/tmp/**"] });
await guard.read("/tmp/notes.md");       // ok
await guard.write("/etc/passwd", "x");   // throws AccessDenied
```

All operations emit `fs_accessed` evidence auxiliaries — useful for auditing what a node touched even when the run succeeded.

## Cross-check engine

```ts
import { crossCheck } from "@agenteer/trust/crosscheck";

const report = await crossCheck({
  primary: primaryProvider,
  checker: checkerProvider,
  prompt: "What does the config say the max retry count is?",
  expected: { schema: z.object({ max: z.number() }) },
});
```

Run two models against the same prompt, compare outputs, and emit an evidence record noting agreement/divergence.

## License

MIT — see LICENSE.
