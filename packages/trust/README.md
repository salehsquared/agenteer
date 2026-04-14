# @agenteer/trust

Trust layer for [Agenteer](https://github.com/salehsquared/agenteer). Four standalone modules you can use with or without the full runtime:

- **`/evidence`** — `EvidenceRecordSchema`, `YamlEvidenceStore`, and `MemoryEvidenceStore` for append-only evidence records.
- **`/structured`** — `StructuredProvider`, a native-first structured-output wrapper with text-parse retry fallback.
- **`/access`** — `DenylistChecker`, `snapshot`, and `diffSnapshots` for filesystem policy and access auditing.
- **`/crosscheck`** — `CrossCheckEngine` for comparing primary and secondary structured outputs.

**Zero runtime dependency on `@agenteer/core`** — this package stays usable in plain Node projects that want evidence-style observability.

## Install

```bash
npm install @agenteer/trust zod
```

Requires **Node >= 20**.

## Evidence records

```ts
import { YamlEvidenceStore, type EvidencePutInput } from "@agenteer/trust/evidence";

const store = new YamlEvidenceStore({
  dir: "./.session/evidence",
  duplicates: "dedupe",
});

const record: EvidencePutInput = {
  evidence_version: 1,
  claim_refs: [],
  run: {
    timestamp: new Date().toISOString(),
    trigger: "agent",
    node_run_id: "nrun-123",
    lineage_id: "L-42",
  },
  tool: {
    name: "tsc",
    command: "tsc --noEmit",
    exit_code: 0,
  },
  result: {
    verdict: "pass",
    summary: "compile clean",
  },
  kind: "gate_check",
};

await store.put(record);
```

The store writes one YAML file per record, keeps stale markers append-only, and validates every write against `EvidenceRecordSchema`.

## Structured output with retry

```ts
import { StructuredProvider, type ProviderLike } from "@agenteer/trust/structured";
import { z } from "zod";

const provider: ProviderLike = {
  modelId: "demo-text-model",
  async generate() {
    return [
      "title: Release checklist",
      "bullets:",
      "  - Verify docs",
      "  - Run tests",
      "  - Pack tarballs",
    ].join("\n");
  },
};

const Spec = z.object({
  title: z.string(),
  bullets: z.array(z.string()).min(3),
});

const structured = new StructuredProvider(provider);
const result = await structured.generate({
  systemPrompt: "Return a concise checklist.",
  userPrompt: "Summarize the release prep as three bullets.",
  schema: Spec,
  schemaName: "release_checklist",
  maxRetries: 2,
});
```

If the provider exposes native structured output, `StructuredProvider` uses it. Otherwise it falls back to text parsing with validation-aware retries.

## Filesystem access utilities

```ts
import { DenylistChecker } from "@agenteer/trust/access";

const checker = new DenylistChecker({ extend: ["/tmp/secrets"] });

checker.assertAllowed("/tmp/project/notes.md");
console.log(checker.isAllowed("/etc/passwd")); // false
```

Use `snapshot()` and `diffSnapshots()` when you need before/after filesystem evidence for a scoped subtree.

## Cross-check engine

```ts
import { CrossCheckEngine } from "@agenteer/trust/crosscheck";
import { StructuredProvider, type ProviderLike } from "@agenteer/trust/structured";
import { z } from "zod";

const makeProvider = (modelId: string, yaml: string): ProviderLike => ({
  modelId,
  async generate() {
    return yaml;
  },
});

const engine = new CrossCheckEngine(
  new StructuredProvider(makeProvider("primary-model", "max: 3")),
  new StructuredProvider(makeProvider("secondary-model", "max: 3")),
);

const report = await engine.run({
  systemPrompt: "Extract the retry budget.",
  userPrompt: "The config says the max retry count is 3.",
  schema: z.object({ max: z.number() }),
  schemaName: "retry_budget",
});
```

The outcome tells you whether the two passes agreed, disagreed on specific keys, or skipped because no secondary generator was configured.

## License

MIT — see LICENSE.
