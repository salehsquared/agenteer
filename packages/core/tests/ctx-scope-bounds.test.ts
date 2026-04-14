/**
 * C1: parent slice-view bounds the child's selector scope (master plan
 * §Pillar 3 invariant). Verified by driving a parent that declares a
 * narrow `ctx: ["public.a"]` but spawns a child declaring a wider
 * `ctx: ["public.a", "secret.x"]`. The child must see "public.a" only;
 * "secret.x" must be invisible and a ctx_scope_restricted event fires.
 */

import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  InMemoryContextStore,
  InMemoryNodeRegistry,
  MemoryEvidenceSink,
  Runtime,
  RuntimeEvents,
  asArtifact,
  makeManifest,
  type Node,
  type NodeResult,
  type RuntimeEventMap,
} from "../src/index.js";

const ChildManifest = makeManifest({
  id: "@agenteer/node-test-child",
  name: "test_child",
  description: "Declares a wider ctx than parent; verifies scope enforcement.",
  determinism: "deterministic",
});

const ParentManifest = makeManifest({
  id: "@agenteer/node-test-parent",
  name: "test_parent",
  description: "Seeds ctx, spawns child, returns what the child saw.",
  determinism: "deterministic",
  required_actions: [`spawn:${ChildManifest.id}`],
});

interface ChildOut {
  seen_keys: string[];
  secret_visible: boolean;
}

function childFactory(): Node<unknown, ChildOut> {
  return {
    manifest: ChildManifest,
    inputSchema: z.unknown(),
    outputSchema: z.object({
      seen_keys: z.array(z.string()),
      secret_visible: z.boolean(),
    }),
    ctx: ["public.a", "secret.x"], // deliberately wider than parent
    model: null,
    async execute(_input, handle): Promise<NodeResult<ChildOut>> {
      const seen = [...handle.ctx.keys()];
      return {
        kind: "output",
        value: { seen_keys: seen, secret_visible: seen.includes("secret.x") },
      };
    },
  };
}

function parentFactory(): Node<unknown, { child: ChildOut }> {
  return {
    manifest: ParentManifest,
    inputSchema: z.unknown(),
    outputSchema: z.object({
      child: z.object({ seen_keys: z.array(z.string()), secret_visible: z.boolean() }),
    }),
    ctx: ["public.a"], // narrower scope
    model: null,
    async execute(input): Promise<NodeResult<{ child: ChildOut }>> {
      if (!input.children) {
        return {
          kind: "spawn_children",
          children: [
            { manifest_id: ChildManifest.id, input: {}, correlation: "c" },
          ],
          join: { mode: "all" },
        };
      }
      const childRes = input.children[0]!.result;
      if (childRes.kind !== "output") {
        return { kind: "failed", reason: "child_not_output", retryable: false };
      }
      return { kind: "output", value: { child: childRes.value as ChildOut } };
    },
  };
}

function newRuntime() {
  const registry = new InMemoryNodeRegistry();
  registry.register(ParentManifest, parentFactory);
  registry.register(ChildManifest, childFactory);
  const events = new RuntimeEvents();
  const contextStore = new InMemoryContextStore();
  // Seed two ctx items: public.a and secret.x.
  contextStore.add({
    type: "observation",
    content: { kind: "observation", subject: "public", observed: "A" },
    provenance: { source_node: "seed", source_node_run_id: "seed1" },
    labels: { tag: "public.a" },
  });
  contextStore.add({
    type: "observation",
    content: { kind: "observation", subject: "secret", observed: "X" },
    provenance: { source_node: "seed", source_node_run_id: "seed2" },
    labels: { tag: "secret.x" },
  });
  const runtime = new Runtime({
    registry,
    contextStore,
    evidenceSink: new MemoryEvidenceSink(),
    events,
  });
  return { runtime, events };
}

describe("C1: parent slice-view bounds child ctx scope", () => {
  it("child sees only tags within parent.ctx; restricted tags are dropped", async () => {
    const { runtime, events } = newRuntime();
    const restricted: RuntimeEventMap["ctx_scope_restricted"][] = [];
    events.on("ctx_scope_restricted", (p) => restricted.push(p));

    const outcome = await runtime.run(
      { manifest_id: ParentManifest.id, input: {}, correlation: "root" },
      [`spawn:${ParentManifest.id}`, `spawn:${ChildManifest.id}`],
    );
    expect(outcome.finalStatus).toBe("completed");
    if (outcome.rootResult?.kind !== "output") throw new Error("unreachable");
    const v = outcome.rootResult.value as { child: ChildOut };
    expect(v.child.seen_keys).toEqual(["public.a"]);
    expect(v.child.secret_visible).toBe(false);

    // Exactly one restriction event for the child.
    expect(restricted).toHaveLength(1);
    expect(restricted[0]!.restricted).toEqual(["secret.x"]);
    expect(restricted[0]!.allowed).toEqual(["public.a"]);
  });

  it("root-level node is unrestricted (no parent) — no ctx_scope_restricted fires", async () => {
    const { runtime, events } = newRuntime();
    const restricted: RuntimeEventMap["ctx_scope_restricted"][] = [];
    events.on("ctx_scope_restricted", (p) => restricted.push(p));
    await runtime.run(
      { manifest_id: ChildManifest.id, input: {}, correlation: "root" },
      [`spawn:${ChildManifest.id}`],
    );
    // No parent → no bound → child sees both seeded tags, no restriction.
    expect(restricted).toHaveLength(0);
  });
});

describe("C1 + ctx_grants: parent can widen the child's scope explicitly", () => {
  // A parent that declares narrow ctx BUT passes an explicit ctx_grant
  // that includes secret.x; the child should now see it.
  const GrantingParent = makeManifest({
    id: "@agenteer/node-test-grant",
    name: "test_granting",
    description: "Narrow ctx + explicit ctx_grants to child.",
    determinism: "deterministic",
    required_actions: [`spawn:${ChildManifest.id}`],
  });
  function grantingFactory(): Node<unknown, { child: ChildOut }> {
    return {
      manifest: GrantingParent,
      ctx: ["public.a"],
      model: null,
      async execute(input): Promise<NodeResult<{ child: ChildOut }>> {
        if (!input.children) {
          return {
            kind: "spawn_children",
            children: [{ manifest_id: ChildManifest.id, input: {}, correlation: "c" }],
            join: { mode: "all" },
            ctx_grants: [{ keys: ["secret.x"] }],
          };
        }
        const r = input.children[0]!.result;
        if (r.kind !== "output") return { kind: "failed", reason: "x", retryable: false };
        return { kind: "output", value: { child: r.value as ChildOut } };
      },
    };
  }

  it("ctx_grants widens the scope; child now sees both keys", async () => {
    const registry = new InMemoryNodeRegistry();
    registry.register(GrantingParent, grantingFactory);
    registry.register(ChildManifest, childFactory);
    const contextStore = new InMemoryContextStore();
    contextStore.add({
      type: "observation",
      content: { kind: "observation", subject: "public", observed: "A" },
      provenance: { source_node: "seed", source_node_run_id: "s1" },
      labels: { tag: "public.a" },
    });
    contextStore.add({
      type: "observation",
      content: { kind: "observation", subject: "secret", observed: "X" },
      provenance: { source_node: "seed", source_node_run_id: "s2" },
      labels: { tag: "secret.x" },
    });
    const runtime = new Runtime({
      registry,
      contextStore,
      evidenceSink: new MemoryEvidenceSink(),
    });
    const out = await runtime.run(
      { manifest_id: GrantingParent.id, input: {}, correlation: "r" },
      [`spawn:${GrantingParent.id}`, `spawn:${ChildManifest.id}`],
    );
    expect(out.finalStatus).toBe("completed");
    if (out.rootResult?.kind !== "output") throw new Error("unreachable");
    const v = out.rootResult.value as { child: ChildOut };
    expect(v.child.seen_keys.sort()).toEqual(["public.a", "secret.x"]);
    expect(v.child.secret_visible).toBe(true);
  });
});
