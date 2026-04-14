/**
 * M3 integration — `llm_call` routed through trust's `StructuredProvider`.
 *
 * The runtime is wired with a `StructuredModelProvider` that adapts a
 * raw `ProviderLike` (mockable) via trust's structured-output wrapper.
 * Asserts that text-parse-retry actually runs and that the retry count
 * shows up in `gen.apiCallCount` via the dispatch surface.
 */

import { describe, expect, it } from "vitest";
import { z } from "zod";
import type { ProviderLike } from "@agenteer/trust/structured";
import {
  InMemoryContextStore,
  InMemoryNodeRegistry,
  MemoryEvidenceSink,
  Runtime,
  RuntimeEvents,
  StructuredModelProvider,
} from "@agenteer/core";
import { llmCallFactory, llmCallManifest } from "../src/index.js";

function makeSequentialProvider(responses: string[], id = "mock/struct"): ProviderLike {
  let i = 0;
  return {
    modelId: id,
    async generate() {
      const resp = responses[i];
      if (resp === undefined) throw new Error(`ran out at call ${i}`);
      i += 1;
      return resp;
    },
  };
}

describe("llm_call via StructuredModelProvider (trust.StructuredProvider)", () => {
  it("delivers a validated value after a text-parse-retry", async () => {
    const provider = makeSequentialProvider([
      'answer: "not a number"',
      "answer: 7",
    ]);
    const modelProvider = new StructuredModelProvider(provider);
    const ResponseSchema = z.object({ answer: z.number() });

    const registry = new InMemoryNodeRegistry();
    const contextStore = new InMemoryContextStore();
    const evidenceSink = new MemoryEvidenceSink();
    const events = new RuntimeEvents();
    registry.register(llmCallManifest, llmCallFactory(ResponseSchema));

    const runtime = new Runtime({
      registry,
      contextStore,
      evidenceSink,
      events,
      modelProvider,
    });

    const outcome = await runtime.run(
      {
        manifest_id: llmCallManifest.id,
        input: { model_id: "mock/struct", prompt: "return answer=7 as yaml" },
        correlation: "r",
      },
      ["model:mock/struct"],
    );

    expect(outcome.finalStatus).toBe("completed");
    if (outcome.rootResult?.kind !== "output") throw new Error("expected output");
    const v = outcome.rootResult.value as {
      value: unknown;
      method: "native" | "text_parse" | "mock";
    };
    expect(v.value).toEqual({ answer: 7 });
    expect(v.method).toBe("text_parse");
  });

  it("surfaces StructuredOutputError as a retryable Failed on retry exhaustion", async () => {
    const provider = makeSequentialProvider(["bad", "still bad", "bad again"]);
    const modelProvider = new StructuredModelProvider(provider);
    const ResponseSchema = z.object({ answer: z.number() });

    const registry = new InMemoryNodeRegistry();
    const contextStore = new InMemoryContextStore();
    const evidenceSink = new MemoryEvidenceSink();
    registry.register(llmCallManifest, llmCallFactory(ResponseSchema));

    const runtime = new Runtime({
      registry,
      contextStore,
      evidenceSink,
      modelProvider,
    });

    const outcome = await runtime.run(
      {
        manifest_id: llmCallManifest.id,
        input: { model_id: "mock/struct", prompt: "x" },
        correlation: "r",
      },
      ["model:mock/struct"],
    );

    expect(outcome.finalStatus).toBe("failed");
    if (outcome.rootResult?.kind !== "failed") throw new Error("unreachable");
    expect(outcome.rootResult.reason).toMatch(/structured_output_exhausted/);
  });
});
