/**
 * tool_call: §R4 dynamic_actions threading + ToolRegistry dispatch.
 */

import { describe, expect, it } from "vitest";
import {
  InMemoryContextStore,
  InMemoryNodeRegistry,
  InMemoryToolRegistry,
  MemoryEvidenceSink,
  Runtime,
  RuntimeEvents,
  type ToolHandler,
} from "@agenteer/core";
import { toolCallFactory, toolCallManifest } from "../src/index.js";

function newRuntime(toolRegistry: InMemoryToolRegistry) {
  const registry = new InMemoryNodeRegistry();
  registry.register(toolCallManifest, toolCallFactory);
  const contextStore = new InMemoryContextStore();
  const evidenceSink = new MemoryEvidenceSink();
  const events = new RuntimeEvents();
  const runtime = new Runtime({
    registry,
    contextStore,
    evidenceSink,
    events,
    toolRegistry,
  });
  return { runtime, events };
}

const echoTool: ToolHandler<{ msg: string }, { echoed: string }> = {
  name: "echo",
  async invoke(args) {
    return { echoed: args.msg };
  },
};

describe("tool_call", () => {
  it("invokes a registered tool when granted tool:<name>", async () => {
    const tools = new InMemoryToolRegistry();
    tools.register(echoTool);
    const { runtime } = newRuntime(tools);
    const outcome = await runtime.run(
      {
        manifest_id: toolCallManifest.id,
        input: { tool_name: "echo", args: { msg: "hi" } },
        correlation: "r",
      },
      ["tool:echo"],
    );
    expect(outcome.finalStatus).toBe("completed");
    if (outcome.rootResult?.kind !== "output") throw new Error("expected output");
    const v = outcome.rootResult.value as { tool_name: string; value: { echoed: string } };
    expect(v.tool_name).toBe("echo");
    expect(v.value.echoed).toBe("hi");
  });

  it("denies when the granted tool capability does not cover the called tool", async () => {
    const tools = new InMemoryToolRegistry();
    tools.register(echoTool);
    const { runtime } = newRuntime(tools);
    const outcome = await runtime.run(
      {
        manifest_id: toolCallManifest.id,
        input: { tool_name: "echo", args: { msg: "hi" } },
        correlation: "r",
      },
      // Only granted `tool:other`; calling `echo` is denied at spawn.
      ["tool:other"],
    );
    expect(outcome.finalStatus).toBe("failed");
    if (outcome.rootResult?.kind !== "failed") throw new Error("unreachable");
    expect(outcome.rootResult.reason).toMatch(/spawn_denied|permission_denied/);
  });
});
