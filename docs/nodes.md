# Writing a node

How to author a custom node for Agenteer. Read [architecture.md](architecture.md) first if you haven't — this guide assumes you know what a runtime loop, a context slice, and a capability envelope are.

## The Node contract

A node is an object that implements `Node<Input, Output>` from `@agenteer/core`:

```text
import type {
  Node, NodeInput, NodeResult, NodeRuntimeHandle, NodeManifest,
} from "@agenteer/core";
import { z } from "zod";

const manifest: NodeManifest = /* ... */;

const myNode: Node<MyInput, MyOutput> = {
  manifest,
  inputSchema: z.object({ /* ... */ }),
  outputSchema: z.object({ /* ... */ }),
  ctx: [],                    // namespace labels this node reads
  model: null,                // or a concrete model id if you `callModel`
  async execute(input, handle) {
    // your logic
    return { kind: "output", value: ..., evidence: { verdict: "pass" } };
  },
};
```
(Shape shown as prose — see [create-node's scaffold](https://github.com/salehsquared/agenteer/tree/main/packages/create-node) for a compilable reference implementation.)

Node authors ship a **factory**: `() => Node<I, O>`. Factories let the runtime instantiate a fresh node per spawn, which matters if your node holds any per-run state. Registrations pass the factory, not a pre-built instance:

```text
registry.register(manifest, () => myNodeInstance);
```

## The manifest

The manifest is the node's public face — the shape the registry validates, the permission kernel checks, and the file on disk if you publish. Construct one with `makeManifest`:

```ts
import { makeManifest } from "@agenteer/core";

const manifest = makeManifest({
  id: "@acme/node-bug-triage",            // must match package.json.name exactly
  name: "bug_triage",                      // snake_case short handle
  description: "Classifies a bug report into severity + component.",
  determinism: "stochastic",               // or "deterministic"
  required_actions: [
    "model:claude-*",
    "context.read:bug.*",
    "context.write:triage.*",
  ],
  version: "0.1.0",                        // semver; optional in dev, required to publish
  tags: ["triage", "classification"],
  dynamic_actions: false,                  // true if you callAction with runtime-chosen caps
});
```

**`required_actions`** is the single most important field. It's the capability envelope the runtime must grant for your node to spawn — not what your node can reach, but what the kernel will intersect with the parent's effective caps. Declare only what you need. Filesystem scopes must be absolute paths or `*`, so if your node writes under `/workspace/src`, declare `fs.write:/workspace/src/**`, not `fs.write:**`. Narrow is safe; wide invites denials.

**`determinism`** hints to schedulers whether re-running with the same input always yields the same output. It doesn't change runtime behavior in 1.0, but v1.1 caching will key off it.

**`dynamic_actions: true`** is for meta-nodes like `default_planner` and `parallel_fanout` that choose their capabilities at runtime (e.g., "spawn whichever manifest the plan named"). Setting this on a third-party package triggers an install-time hard-stop — even `--yes` can't bypass the confirmation prompt.

## The execute function

`execute` gets two arguments: `input` (your input envelope) and `handle` (the runtime handle for calling models, actions, and logs).

### The input envelope

```text
interface NodeInput<T> {
  original: T;                             // your typed input, matches inputSchema
  children?: ReadonlyArray<{               // populated on re-entry after spawn_children
    correlation: string;
    manifest_id: string;
    result: NodeResult<unknown>;
  }>;
}
```

First call: `input.children` is `undefined`. If your previous result was `spawn_children`, the runtime re-enters `execute` after the join completes and passes the children's results in `input.children`.

### The runtime handle

```text
interface NodeRuntimeHandle {
  readonly ctx: ReadonlyContextSlice;      // your materialized view of ctx
  readonly signal: AbortSignal;             // abort signal for long ops
  readonly correlation: string;             // for logs / tracing
  readonly lineage: NodeLineage;            // your spot in the spawn tree
  readonly granted: CapabilitySet;          // what caps you ended up with

  log({ level, message, data? }): void;

  callModel<T>(req: ModelCallRequest<T>): Promise<ModelCallResult<T>>;
  callAction<T>(name: string, args: unknown): Promise<T>;
}
```

- **`ctx`** — your read-only slice, filtered to your `ctxScope` (parent ctx ∪ ctx grants). Iterating or looking up items is cheap; the slice is pre-materialized.
- **`callModel`** — dispatches to the `ModelProvider` registered on the runtime. Schema-bound calls (`req.schema`) go through the structured-output retry loop; text calls return raw strings.
- **`callAction`** — named-action dispatch through the `ActionRegistry`. The kernel authorizes each call against your granted caps before the handler runs; a denied call throws `OperationDenied`.
- **`granted`** — the effective cap set after intersection. Use this to decide what you can do if a capability is optional for your logic.

### The five result kinds

`execute` must return a `NodeResult<Output>`. There are five kinds, and picking the right one is most of the art of node authoring.

#### `output` — you're done

```text
return {
  kind: "output",
  value: { severity: "P2", component: "auth" },
  ctx_patch: { set: { "triage.latest": { /* ... */ } } },  // optional
  evidence: { verdict: "pass" },                            // optional
};
```

`value` is your typed output. The runtime validates it against `outputSchema` (if present) and makes it available as a ctx artifact. `ctx_patch` is optional structured mutation; `evidence` is the delta the runtime records.

#### `spawn_children` — you need parallel sub-work

```text
return {
  kind: "spawn_children",
  children: [
    { manifest_id: "@agenteer/node-llm-call", input: { /* ... */ }, correlation: "c1" },
    { manifest_id: "@agenteer/node-llm-call", input: { /* ... */ }, correlation: "c2" },
  ],
  join: { mode: "all" },
  ctx_grants: [{ keys: ["bug.reports"] }],                 // optional
};
```

**Join modes:**

| mode | semantics |
|---|---|
| `{ mode: "all" }` | Wait for every child; re-enter `execute` with all results. |
| `{ mode: "any" }` | Re-enter as soon as one child succeeds; cancel the rest. |
| `{ mode: "race_with_budget", budget_ms, min_results }` | Wait up to `budget_ms` for at least `min_results` children. |
| `{ mode: "detached" }` | Fire-and-forget; don't wait, don't re-enter. |

After the join, the runtime re-calls `execute` with `input.children` populated. You then compute your final output from the children's results.

**`ctx_grants`** bounds the child's `ctxScope`. Without grants, children can only see ctx items in your own scope plus the ones implied by their manifest's `ctx:` selectors — filtered to your scope. Use `ctx_grants` to expose specific tags to a child intentionally.

#### `replace_me` — you'd rather be a different node

```text
return {
  kind: "replace_me",
  successor: {
    manifest_id: "@acme/node-deeper-triage",
    input: { /* ... */ },
    correlation: handle.correlation,                       // reuse to preserve lineage
  },
  reason: "initial triage inconclusive; escalating to deep-dive",
  ctx_patch: { /* optional */ },
};
```

The runtime replaces your frame with the successor's spawn. Evidence for the successor shares your `lineage_id`, so the trace reads as one logical unit. Use this for routing decisions that are themselves cheap — when the "real" work is in the successor, not in your computation.

#### `needs_user` — ask the human

```text
return {
  kind: "needs_user",
  prompt: "Is this bug already filed? (yes / no)",
  schema: { type: "string", enum: ["yes", "no"] },         // optional JSON Schema
  resume_hint: "dedup-check",                              // for the resume CLI
};
```

The runtime suspends. The session records the pending prompt. `runtime.run()` returns with `finalStatus: "suspended"`. The caller collects the answer, records it, calls `resume`, and the runtime re-enters `execute` through the session-backed resolvers.

You don't have to structure `ask_user` around `needs_user` directly — you can just spawn `@agenteer/node-ask-user` as a child. But `needs_user` is the primitive if you need the prompt to come from inside your own logic.

#### `failed` — something went wrong

```text
return {
  kind: "failed",
  reason: "primary LLM returned an unparseable response 3 times",
  retryable: false,
  evidence: { verdict: "fail", tool_output: { stdout_tail: "..." } },
  details: { attempts: 3, last_error: /* ... */ },
};
```

This is a controlled failure, not an exception. The runtime records a fail evidence record, emits a `node_failed` event, and propagates the failure to the parent. Throwing an exception works too — the runtime catches it and synthesizes a `failed` result — but explicit `failed` gives you control over the reason text and retryability flag.

## Ctx patches — writing to the store

`CtxPatch` has three operations:

```text
interface CtxPatch {
  set?: Record<string, unknown>;          // create/supersede by key
  delete?: readonly string[];              // tombstone
  append?: Record<string, unknown[]>;      // append to an artifact chain
}
```

- **`set`** creates a Decision item by default, or an Artifact when you wrap the value:
  ```text
  import { asArtifact } from "@agenteer/core";
  return {
    kind: "output",
    value: /* ... */,
    ctx_patch: {
      set: {
        "triage.report": asArtifact(reportMarkdown, { media_type: "text/markdown" }),
      },
    },
  };
  ```
- **`delete`** tombstones the key. Readers see the tombstone and know the key was explicitly removed.
- **`append`** extends an artifact chain — use for streaming or iterative outputs.

Patches are applied atomically by the runtime. They can't be mutated mid-execution; you build the patch, return it, and the runtime writes.

## Evidence deltas — the minimal signal

Your node returns a minimal `EvidenceDelta`:

```text
interface EvidenceDelta {
  verdict: "pass" | "fail" | "inconclusive";
  claims?: readonly string[];              // claim-ref ids this evidence supports
  tool_output?: { command?: string; exit_code?: number; stdout_tail?: string };
}
```

The runtime fills in the rest (`id`, `run.timestamp`, `lineage_id`, `kind`, artifacts) and writes a full `EvidenceRecord` to the evidence store. See [evidence.md](evidence.md) for the full record shape and verdict semantics.

You don't have to return evidence. If you omit it, the runtime still records a minimal gate-check record for the node run — but a node that does meaningful work should return an explicit delta so verdicts are legible.

## Zod vs JSON Schema

In-tree nodes ship Zod schemas directly:

```text
inputSchema: z.object({ question: z.string().min(1) }),
outputSchema: z.object({ answer: z.string() }),
```

Published node packages ship JSON Schema in `framework.json`. The registry's `compileNodeSchemas` uses the ajv bridge to wrap each JSON Schema in a `z.unknown().superRefine(...)` at install time. The Zod issue path preserves the JSON instancePath, so errors look the same either way.

You can also ship both — Zod in the source (for types + in-process validation) and JSON Schema in `framework.json` for publish/install. `makeManifest` only builds manifest metadata; schema wiring lives on the node object and in the published manifest file.

## Testing a node

Spin up a real runtime in your test. It's fast (ms) and catches integration issues that unit tests miss:

```text
import { describe, expect, it } from "vitest";
import {
  InMemoryContextStore,
  InMemoryNodeRegistry,
  MemoryEvidenceSink,
  Runtime,
} from "@agenteer/core";
import { myNodeFactory, myManifest } from "../src/index.js";

describe("my-node", () => {
  it("produces an output for a valid input", async () => {
    const registry = new InMemoryNodeRegistry();
    registry.register(myManifest, myNodeFactory);

    const runtime = new Runtime({
      registry,
      contextStore: new InMemoryContextStore(),
      evidenceSink: new MemoryEvidenceSink(),
    });

    const outcome = await runtime.run(
      { manifest_id: myManifest.id, input: { /* ... */ }, correlation: "root" },
      [`spawn:${myManifest.id}`],
    );

    expect(outcome.finalStatus).toBe("completed");
    if (outcome.rootResult?.kind !== "output") throw new Error("unreachable");
    expect(outcome.rootResult.value).toMatchObject({ /* ... */ });
  });
});
```
(The scaffold at `packages/create-node/src/index.ts` (`templateTest`) renders this exact structure with a real input — it's the compilable reference.)

For stochastic nodes that call models, use `MockModelProvider`:

```ts
import {
  InMemoryContextStore,
  InMemoryNodeRegistry,
  MemoryEvidenceSink,
  MockModelProvider,
  Runtime,
} from "@agenteer/core";

const provider = new MockModelProvider({
  "mock:model": () => ({ severity: "P1" }),
});

const runtime = new Runtime({
  registry: new InMemoryNodeRegistry(),
  contextStore: new InMemoryContextStore(),
  evidenceSink: new MemoryEvidenceSink(),
  modelProvider: provider,
});
```

## Common pitfalls

- **Don't mutate the ctx slice.** It's frozen. If you need to write, return a `ctx_patch`.
- **Don't do I/O in the factory.** The factory runs per spawn; keep it cheap. Move I/O into `execute`.
- **Don't widen `required_actions` to avoid denials.** The denial is the system telling you your manifest is over-promising. Narrow the scope, or ask the caller to grant the broader cap explicitly.
- **Don't forget `correlation` on children.** Each spawn needs a unique correlation id (within the parent). The lineage ties use it for ordering; duplicates confuse inspect.
- **Don't mix `replace_me` with long-running work.** `replace_me` is a tail-call. If your pre-decision work is expensive, let it finish, emit an output, and let the parent spawn the follow-up.
- **Don't throw in `execute` when `failed` is what you mean.** Throwing works (the runtime catches), but `failed` gives you the reason text and retryable flag the caller actually wants to read.

## Where to go next

- [evidence.md](evidence.md) — how to write and read evidence records.
- [capabilities.md](capabilities.md) — the capability grammar your `required_actions` draws from.
- [publishing-a-node.md](publishing-a-node.md) — once you have a working node, how to ship it.
- [../examples/research-assistant/](../examples/research-assistant/) — see six stdlib nodes composed in a single workflow.
