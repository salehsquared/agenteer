/**
 * M4 validator tests — `verdict: "fail"` returned as DATA per ratified
 * resolution. Compile + test_run only smoke-tested for shape (real tsc
 * /vitest invocation is exercised by the framework's own CI).
 */

import { describe, expect, it } from "vitest";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  InMemoryContextStore,
  InMemoryNodeRegistry,
  MemoryEvidenceSink,
  Runtime,
  RuntimeEvents,
  type NodeSpawn,
} from "@agenteer/core";
import {
  regexCheckFactory,
  regexCheckManifest,
  compileFactory,
  compileManifest,
  typecheckFactory,
  typecheckManifest,
  testRunFactory,
  testRunManifest,
} from "../src/index.js";

function newRuntime() {
  const registry = new InMemoryNodeRegistry();
  const contextStore = new InMemoryContextStore();
  const evidenceSink = new MemoryEvidenceSink();
  const events = new RuntimeEvents();
  const runtime = new Runtime({ registry, contextStore, evidenceSink, events });
  return { runtime, registry, contextStore, evidenceSink, events };
}

describe("regex_check", () => {
  it("returns verdict=pass when all rules satisfied", async () => {
    const { runtime, registry } = newRuntime();
    registry.register(regexCheckManifest, regexCheckFactory);
    const outcome = await runtime.run(
      {
        manifest_id: regexCheckManifest.id,
        input: {
          input: "hello world",
          rules: [
            { id: "must.world", pattern: "world", kind: "must_match" },
            { id: "no.foo", pattern: "foo", kind: "must_not_match" },
          ],
        },
        correlation: "r",
      },
      [`spawn:${regexCheckManifest.id}`],
    );
    expect(outcome.finalStatus).toBe("completed");
    if (outcome.rootResult?.kind !== "output") throw new Error("expected output");
    const v = outcome.rootResult.value as { verdict: string; issues: unknown[] };
    expect(v.verdict).toBe("pass");
    expect(v.issues).toEqual([]);
  });

  it("returns verdict=fail (as DATA, not Failed) when a rule fails", async () => {
    const { runtime, registry } = newRuntime();
    registry.register(regexCheckManifest, regexCheckFactory);
    const outcome = await runtime.run(
      {
        manifest_id: regexCheckManifest.id,
        input: {
          input: "hello",
          rules: [{ id: "must.world", pattern: "world", kind: "must_match" }],
        },
        correlation: "r",
      },
      [`spawn:${regexCheckManifest.id}`],
    );
    expect(outcome.finalStatus).toBe("completed"); // not "failed" — verdict is data
    if (outcome.rootResult?.kind !== "output") throw new Error("expected output");
    const v = outcome.rootResult.value as { verdict: string; issues: { path?: string }[] };
    expect(v.verdict).toBe("fail");
    expect(v.issues[0]!.path).toBe("must.world");
  });

  it("returns Failed only when the regex itself is invalid", async () => {
    const { runtime, registry } = newRuntime();
    registry.register(regexCheckManifest, regexCheckFactory);
    const outcome = await runtime.run(
      {
        manifest_id: regexCheckManifest.id,
        input: {
          input: "x",
          rules: [{ id: "broken", pattern: "[invalid", kind: "must_match" }],
        },
        correlation: "r",
      },
      [`spawn:${regexCheckManifest.id}`],
    );
    expect(outcome.finalStatus).toBe("failed");
    if (outcome.rootResult?.kind !== "failed") throw new Error("unreachable");
    expect(outcome.rootResult.reason).toMatch(/invalid_regex/);
  });
});

describe("compile (tsc adapter)", () => {
  it("smoke: returns Failed when shell.exec capability is denied", async () => {
    const { runtime, registry } = newRuntime();
    registry.register(compileManifest, compileFactory);
    const cwd = process.cwd();
    const outcome = await runtime.run(
      {
        manifest_id: compileManifest.id,
        input: { language: "typescript", cwd },
        correlation: "r",
      },
      // No shell.exec capability granted.
      [`spawn:${compileManifest.id}`, `fs.read:${cwd}`],
    );
    expect(outcome.finalStatus).toBe("failed");
    if (outcome.rootResult?.kind !== "failed") throw new Error("unreachable");
    // Either root_spawn_denied (kernel — cap missing) or permission_denied at dispatch.
    expect(outcome.rootResult.reason).toMatch(/spawn_denied|permission_denied/);
  });
});

describe("typecheck (manifest shape)", () => {
  it("manifest declares dynamic fs.read scope per R4", () => {
    expect(typecheckManifest.dynamic_actions).toBe(true);
    expect(typecheckManifest.dynamic_action_spec).toMatch(/fs\.read:/);
    expect(typecheckManifest.required_actions).toContain("shell.exec:");
  });
});

describe("test_run (manifest shape)", () => {
  it("manifest declares vitest as the v1 framework", () => {
    expect(testRunManifest.id).toBe("@agenteer/node-test-run");
    expect(testRunManifest.dynamic_actions).toBe(true);
  });

  it("instantiation does not throw", () => {
    const node = testRunFactory();
    expect(node.manifest.id).toBe(testRunManifest.id);
  });
});
