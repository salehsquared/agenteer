/**
 * M2 stdlib smoke: run each of the 5 seed nodes via the runtime, assert
 * correctness + capability enforcement + the key R1/R4 behaviors.
 */

import { describe, expect, it } from "vitest";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { z } from "zod";
import {
  InMemoryContextStore,
  InMemoryNodeRegistry,
  MemoryEvidenceSink,
  MockModelProvider,
  Runtime,
  RuntimeEvents,
  type NodeSpawn,
} from "@agenteer/core";
import {
  fileReadFactory,
  fileReadManifest,
  fileWriteFactory,
  fileWriteManifest,
  jsonSchemaValidateFactory,
  jsonSchemaValidateManifest,
  llmCallFactory,
  llmCallManifest,
  shellExecFactory,
  shellExecManifest,
} from "../src/index.js";

async function withTmp<T>(fn: (dir: string) => Promise<T>): Promise<T> {
  const dir = await mkdtemp(join(tmpdir(), "agenteer-stdlib-"));
  try {
    return await fn(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

function newRuntime(opts?: {
  modelProvider?: MockModelProvider;
}): { runtime: Runtime; registry: InMemoryNodeRegistry; events: RuntimeEvents } {
  const registry = new InMemoryNodeRegistry();
  const contextStore = new InMemoryContextStore();
  const evidenceSink = new MemoryEvidenceSink();
  const events = new RuntimeEvents();
  const runtime = new Runtime({
    registry,
    contextStore,
    evidenceSink,
    events,
    ...(opts?.modelProvider ? { modelProvider: opts.modelProvider } : {}),
  });
  return { runtime, registry, events };
}

describe("file_read", () => {
  it("reads a file it holds capability for", async () => {
    await withTmp(async (dir) => {
      const path = join(dir, "hello.txt");
      const { writeFile } = await import("node:fs/promises");
      await writeFile(path, "hello world", "utf8");

      const { runtime, registry } = newRuntime();
      registry.register(fileReadManifest, fileReadFactory);

      const spawn: NodeSpawn = {
        manifest_id: fileReadManifest.id,
        input: { path },
        correlation: "root",
      };
      const outcome = await runtime.run(spawn, [`fs.read:${dir}/**`]);
      expect(outcome.finalStatus).toBe("completed");
      if (outcome.rootResult?.kind !== "output") throw new Error("unreachable");
      const v = outcome.rootResult.value as { path: string; content: string; bytes: number };
      expect(v.content).toBe("hello world");
      expect(v.bytes).toBe(11);
    });
  });

  it("refuses reads outside the granted glob (§R4 dynamic augmentation, spawn-time)", async () => {
    await withTmp(async (dir) => {
      const path = join(dir, "hello.txt");
      const { writeFile } = await import("node:fs/promises");
      await writeFile(path, "x", "utf8");

      const { runtime, registry } = newRuntime();
      registry.register(fileReadManifest, fileReadFactory);

      const other = await mkdtemp(join(tmpdir(), "agenteer-other-"));
      try {
        const outcome = await runtime.run(
          { manifest_id: fileReadManifest.id, input: { path }, correlation: "r" },
          [`fs.read:${other}/**`],
        );
        // With dynamic_actions, the kernel synthesizes `fs.read:<path>`
        // from input at spawn time and denies because the root's grant
        // doesn't cover it. `finalStatus` reflects the failed root.
        expect(outcome.finalStatus).toBe("failed");
        if (outcome.rootResult?.kind !== "failed") throw new Error("expected failed");
        expect(outcome.rootResult.reason).toMatch(/root_spawn_denied|permission_denied/);
      } finally {
        await rm(other, { recursive: true, force: true });
      }
    });
  });
});

describe("file_write", () => {
  it("writes a file and the denylist rejects sensitive paths", async () => {
    await withTmp(async (dir) => {
      const path = join(dir, "out.txt");
      const { runtime, registry } = newRuntime();
      registry.register(fileWriteManifest, fileWriteFactory);

      const ok = await runtime.run(
        {
          manifest_id: fileWriteManifest.id,
          input: { path, content: "abc" },
          correlation: "r",
        },
        [`fs.write:${dir}/**`],
      );
      expect(ok.finalStatus).toBe("completed");
      expect(await readFile(path, "utf8")).toBe("abc");

      // Now try to write under /etc — capability allows (fs.write:*), but
      // the denylist catches it unconditionally at the dispatcher.
      const deny = await runtime.run(
        {
          manifest_id: fileWriteManifest.id,
          input: { path: "/etc/agenteer-test", content: "x" },
          correlation: "r",
        },
        ["fs.write:*"],
      );
      // Root result is `failed` (the node caught the DispatchError and
      // returned Failed); runtime collapses that to finalStatus=failed.
      expect(deny.finalStatus).toBe("failed");
      if (deny.rootResult?.kind !== "failed") throw new Error("expected failed");
      expect(deny.rootResult.reason).toMatch(/denylist/i);
    });
  });
});

describe("shell_exec", () => {
  it("captures stdout/exit and is gated by shell.exec", async () => {
    const { runtime, registry } = newRuntime();
    registry.register(shellExecManifest, shellExecFactory);

    // Without the cap, it fails at dispatch.
    const denied = await runtime.run(
      { manifest_id: shellExecManifest.id, input: { command: "echo hi" }, correlation: "r" },
      [`spawn:${shellExecManifest.id}`],
    );
    expect(denied.finalStatus).toBe("failed");
    // ^ root-spawn-denied because shellExec's manifest requires shell.exec:
    //   and the root grants don't include it.

    // With the cap, it runs.
    const ok = await runtime.run(
      { manifest_id: shellExecManifest.id, input: { command: "echo hi" }, correlation: "r" },
      ["shell.exec:"],
    );
    expect(ok.finalStatus).toBe("completed");
    if (ok.rootResult?.kind !== "output") throw new Error("expected output");
    const v = ok.rootResult.value as { stdout: string; exit_code: number; timed_out: boolean };
    expect(v.exit_code).toBe(0);
    expect(v.stdout.trim()).toBe("hi");
    expect(v.timed_out).toBe(false);
  });
});

describe("json_schema_validate", () => {
  it("returns verdict=pass for a valid value and verdict=fail with errors otherwise", async () => {
    const { runtime, registry } = newRuntime();
    registry.register(jsonSchemaValidateManifest, jsonSchemaValidateFactory);

    const schema = z.object({ n: z.number().int().positive() });

    const passed = await runtime.run(
      {
        manifest_id: jsonSchemaValidateManifest.id,
        input: { value: { n: 3 }, schema },
        correlation: "r",
      },
      [`spawn:${jsonSchemaValidateManifest.id}`],
    );
    expect(passed.finalStatus).toBe("completed");
    if (passed.rootResult?.kind !== "output") throw new Error("unreachable");
    expect((passed.rootResult.value as { verdict: string }).verdict).toBe("pass");

    const failed = await runtime.run(
      {
        manifest_id: jsonSchemaValidateManifest.id,
        input: { value: { n: -1 }, schema },
        correlation: "r",
      },
      [`spawn:${jsonSchemaValidateManifest.id}`],
    );
    expect(failed.finalStatus).toBe("completed");
    if (failed.rootResult?.kind !== "output") throw new Error("unreachable");
    const out = failed.rootResult.value as { verdict: string; errors: unknown[] };
    // R3: validators return fail as DATA, not Failed.
    expect(out.verdict).toBe("fail");
    expect(out.errors.length).toBeGreaterThan(0);
  });
});

describe("llm_call with MockModelProvider", () => {
  it("routes through the kernel's model capability + the provider", async () => {
    const modelProvider = new MockModelProvider({
      "mock/test-model": () => ({ answer: 42 }),
    });
    const { runtime, registry, events } = newRuntime({ modelProvider });
    const llmFactory = llmCallFactory(z.object({ answer: z.number() }));
    registry.register(llmCallManifest, llmFactory);

    // Without model:* capability at root, the spawn is denied.
    const denied = await runtime.run(
      {
        manifest_id: llmCallManifest.id,
        input: { model_id: "mock/test-model", prompt: "hi" },
        correlation: "r",
      },
      [`spawn:${llmCallManifest.id}`],
    );
    expect(denied.finalStatus).toBe("failed");
    if (denied.rootResult?.kind !== "failed") throw new Error("unreachable");
    expect(denied.rootResult.reason).toMatch(/root_spawn_denied/);

    // With model:mock/test-model attenuation, it succeeds.
    const permDenials: unknown[] = [];
    events.on("permission_denied", (e) => permDenials.push(e));
    const ok = await runtime.run(
      {
        manifest_id: llmCallManifest.id,
        input: { model_id: "mock/test-model", prompt: "hi", emit_as: "answer" },
        correlation: "r",
      },
      ["model:mock/test-model"],
    );
    expect(ok.finalStatus).toBe("completed");
    if (ok.rootResult?.kind !== "output") throw new Error("unreachable");
    const v = ok.rootResult.value as { value: unknown; method: string };
    expect(v.method).toBe("mock");
    expect(v.value).toEqual({ answer: 42 });
    expect(permDenials.length).toBe(0);
  });
});
