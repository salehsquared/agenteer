# Evidence records

The evidence system is Agenteer's audit trail. Every node run emits at least one record; sub-checks and access scans emit more. Records are YAML on disk, append-only, content-addressable, and grouped by `lineage_id` so a full subtree's history reads as one sequence.

This doc covers the record shape, the verdict semantics, and the lifecycle (write, read, stale). If you just want to see a trace, jump to [reading a trace](#reading-a-trace).

## Why evidence exists

Most agent frameworks give you traces or logs. Both are narrative. Evidence records are structured claims with verdicts — "this test passed," "this access scan saw these paths," "this cross-check agreed." The difference matters for three reasons:

1. **Programmatic consumption.** A downstream gate can read the evidence tree and refuse to progress until every constraint has a passing record.
2. **Explainability.** When a run fails, you can grep `verdict: fail` and find the exact step that broke.
3. **Staleness.** When upstream ctx changes, the evidence that depended on it gets marked stale — you know what you can still trust and what needs re-running.

## The schema

Full `EvidenceRecord` shape (from `@agenteer/trust/evidence`):

```yaml
evidence_version: 1
id: "EV-20260414-a1b2c3d4"              # stable content-hash id
claim_refs:                              # optional; what this evidence supports
  - type: constraint
    id: "C-auth-login-01"
run:
  timestamp: "2026-04-14T15:12:09.123Z"
  commit_sha: "abcd123"                  # optional
  trigger: agent                          # agent | ci | manual | watch
  node_id: "nrun-5f8e"                    # optional
  node_run_id: "nrun-5f8e"                # optional
  parent_node_run_id: "nrun-3d21"         # optional
  lineage_id: "L-42"                      # groups evidence across ReplaceMe chains
tool:
  name: "vitest"
  version: "3.2.4"                        # optional
  command: "npx vitest run tests/auth"
  exit_code: 0
result:
  verdict: pass                           # pass | fail | error | skip | timeout
  summary: "12 tests passed in 240ms"
artifacts:                                 # optional
  raw_log: "tests ran, 12 passed..."      # trimmed if large
  content_hash: "sha256:..."              # optional, for artifact dedup
  writes: ["tests/auth.test.ts"]
  reads: ["src/auth/login.ts"]
kind: gate_check                          # optional; grouping hint
stale: false
stale_markers: []                         # populated when upstream changes
```

**Zod schema:** `EvidenceRecordSchema` in `@agenteer/trust/evidence`. Strict — extra fields fail validation.

## Verdicts

| verdict | when to use |
|---|---|
| `pass` | The check ran and succeeded. |
| `fail` | The check ran and the subject is incorrect (test failures, schema violations). |
| `error` | The check itself malfunctioned — tool crashed, network timed out at tool level, runtime issue. |
| `skip` | The check was intentionally not run (e.g., gated by a feature flag that's off). |
| `timeout` | The check exceeded its time budget. |

The `pass/fail/error` distinction is load-bearing. `fail` means "the thing we tested is wrong"; `error` means "we couldn't test it." Downstream gates treat these differently — a `fail` blocks progression; an `error` typically signals "fix your tooling and rerun."

Nodes return a minimal `EvidenceDelta` with the verdict subset `pass | fail | inconclusive`. The runtime expands this into a full record. `inconclusive` in the delta maps to either `skip` or `error` in the stored record depending on context.

## Primary vs auxiliary

Every node run emits **one primary** evidence record — the main verdict. Nodes can also emit **auxiliary** records for sub-checks. Examples:

- `file_write` emits a primary `gate_check` record for the write itself, plus an auxiliary `access_scan` record listing every path the write touched.
- `cross_check` emits a primary with the agreement verdict, plus auxiliaries for each individual model call.
- `shell_exec` emits a primary with the exit code, plus an auxiliary for each stdout tail if the command was loud.

The `kind` field (`gate_check | hook_result | llm_call | cross_check | access_scan | shell_exec | user | generic`) tells you how to read the record. The primary is usually `gate_check`; auxiliaries use the other kinds.

## Lineage

Every record carries a `run.lineage_id` — an opaque string that identifies the **logical** unit of work. Multiple records share a lineage when:

- A `spawn_children` join produces one parent lineage that children inherit.
- A `replace_me` tail-call keeps the successor on the same lineage as the original node — the two are one logical step, just authored in two phases.

`agenteer inspect --evidence` groups by lineage, so a replaced-then-completed step reads as one coherent trace instead of two fragmentary ones.

If you need a record that's independent of any node lineage (e.g., a periodic health check), emit it with a freshly-generated lineage id.

## Staleness

An evidence record goes **stale** when something upstream of it changes. The record isn't deleted — the stale marker is appended to `stale_markers` and the `stale` flag is set. Five reasons:

| reason | when |
|---|---|
| `upstream_changed` | A ctx item this evidence depends on was superseded. |
| `explicit` | Some code called `markStale` directly (rare). |
| `repair_invalidated` | A `repair_loop` node ran and needs this check to re-verify. |
| `superseded` | A newer record covers the same claim. |
| `evidence_refreshed` | The check ran again and this record is the older copy. |

Stale records stay in the store — the audit trail is append-only. Queries can filter `stale: false` to see only what's current.

Gates typically refuse to pass on stale evidence: if `C-auth-login-01`'s last record is stale, the gate treats it as unverified, even though the last verdict was `pass`.

## Claim refs

Evidence can be tied to **claims** — constraints, acceptance criteria, invariants, or requirements:

```yaml
claim_refs:
  - type: constraint
    id: "C-auth-login-01"
  - type: acceptance_criterion
    id: "AC-5.2"
```

The refs are opaque ids — Agenteer doesn't own the claim registry. Whatever system tracks your constraints (a spec document, a test-plan YAML, a Jira export) produces the ids; evidence records point to them.

The four claim types have conventional meanings:

- **`constraint`** — a rule the system must hold (e.g., "auth tokens never logged").
- **`acceptance_criterion`** — a spec-level test condition (e.g., "user can log in with email+password").
- **`invariant`** — a runtime guarantee (e.g., "every request carries a correlation id").
- **`requirement`** — a feature requirement (e.g., "support OAuth login by Q3").

If your workflow doesn't use claims, leave `claim_refs` empty. Evidence still works; you just can't query by claim.

## Writing evidence

Two places evidence lands:

### From inside a node

Return an `EvidenceDelta`:

```ts
return {
  kind: "output",
  value: /* ... */,
  evidence: {
    verdict: "pass",
    claims: ["C-auth-login-01"],
    tool_output: { command: "npm test", exit_code: 0 },
  },
};
```

The runtime fills in `id`, `run`, `tool.name`, `stale`, and so on. You provide the load-bearing fields (verdict, claims, tool output).

### Directly, outside the node lifecycle

For workflows that want to record evidence for non-node actions (e.g., a manual review):

```ts
import { YamlEvidenceStore } from "@agenteer/trust/evidence";

const store = new YamlEvidenceStore({ dir: "./.session/evidence", duplicates: "dedupe" });
await store.put({
  id: "EV-custom-001",
  evidence_version: 1,
  run: {
    timestamp: new Date().toISOString(),
    trigger: "manual",
    lineage_id: "L-review-42",
  },
  tool: { name: "human-review", command: "review PR #142", exit_code: 0 },
  result: { verdict: "pass", summary: "approved after pair review" },
  claim_refs: [{ type: "acceptance_criterion", id: "AC-5.2" }],
});
```

## Reading a trace

### From the CLI

```bash
agenteer inspect --session ./.session --evidence
```

Renders the evidence tree grouped by `lineage_id`, with stale records annotated:

```
├── L-root (@agenteer/node-default-planner, 2026-04-14T15:11:00Z)
│   ├── primary   pass    gate_check    "plan drafted, 6 steps"
│   └── auxiliary pass    llm_call      "claude-sonnet-4-5, 450 tokens"
├── L-step-1 (@agenteer/node-tool-call, web_search)
│   ├── primary   pass    gate_check    "5 findings returned"
│   └── auxiliary pass    access_scan   "net.http reads: api.example.com"
├── L-step-2 (@agenteer/node-judge-with-stripped-ctx)
│   └── primary   fail    gate_check    "findings inconclusive (score 0.3)"  <-- STALE (superseded)
└── L-step-3 (@agenteer/node-repair-loop → @agenteer/node-tool-call)
    └── primary   pass    gate_check    "second search passed the judge"
```

### Programmatically

```ts
import { YamlEvidenceStore } from "@agenteer/trust/evidence";

const store = new YamlEvidenceStore({ dir: "./.session/evidence" });
const all = await store.list();
const failures = all.filter(r => r.result.verdict === "fail" && !r.stale);
```

### Filtering

Common queries:

| query | code |
|---|---|
| Only current (non-stale) records | `r => !r.stale` |
| Failures anywhere in the run | `r => r.result.verdict === "fail"` |
| Records backing a specific claim | `r => r.claim_refs.some(c => c.id === "C-auth-01")` |
| A specific lineage | `r => r.run.lineage_id === "L-42"` |

## Evidence stores

Two implementations ship in 1.0:

- **`MemoryEvidenceSink`** (from `@agenteer/core/evidence/sink`). In-process Map; drops on exit. Use in tests.
- **`YamlEvidenceStore`** (from `@agenteer/trust/evidence/yaml-store`). Durable, one YAML file per record, append-only. Use in sessions.

Both implement the same `EvidenceStore` interface; the runtime doesn't care which you pass. If you want S3 or SQLite backing, implement the interface yourself — four methods (`put`, `get`, `list`, `markStale`).

## Using evidence outside Agenteer

`@agenteer/trust/evidence` is intentionally standalone. You can adopt evidence records in any Node project, even without the runtime:

```ts
import { YamlEvidenceStore, EvidenceRecordSchema } from "@agenteer/trust/evidence";

const store = new YamlEvidenceStore({ dir: "./evidence" });
await store.put({ /* ... */ });
```

Useful for CI pipelines that want a durable audit trail, for test reporters that want claim-based gating, or for any system that benefits from "structured verdict with stale tracking" as a primitive.

## Where to go next

- [nodes.md](nodes.md) — how evidence deltas are returned from inside a node.
- [architecture.md](architecture.md) — how evidence flows through the runtime loop.
- [capabilities.md](capabilities.md) — how access-scan evidence intersects with the permission kernel.
