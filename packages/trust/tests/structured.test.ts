import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  StructuredProvider,
  StructuredOutputError,
  type ProviderLike,
  stripFences,
  schemaToPromptDescription,
} from "../src/structured/index.js";

/**
 * Stub providers for each code path. Native-first (generateStructured)
 * + text-parse-retry with exhaustion.
 */
function makeTextProvider(responses: string[]): ProviderLike {
  let i = 0;
  return {
    modelId: "stub/text",
    async generate() {
      const resp = responses[i];
      if (resp === undefined) throw new Error(`stub ran out at call ${i}`);
      i += 1;
      return resp;
    },
  };
}

function makeNativeProvider(response: unknown): ProviderLike {
  return {
    modelId: "claude-test",
    async generate() {
      throw new Error("text path not used when native works");
    },
    async generateStructured<T>() {
      return response as T;
    },
  };
}

const Schema = z.object({ answer: z.number() });

describe("StructuredProvider — native path", () => {
  it("uses the native entry point when available and schema matches", async () => {
    const gen = new StructuredProvider(makeNativeProvider({ answer: 42 }));
    const out = await gen.generate({
      systemPrompt: "x",
      userPrompt: "y",
      schema: Schema,
      schemaName: "A",
    });
    expect(out).toEqual({ answer: 42 });
    expect(gen.apiCallCount).toBe(1);
    expect(gen.lastMethod).toBe("native_tool_use");
  });

  it("falls through to text-parse when native returns an invalid shape", async () => {
    // Native returns junk; text-parse stub produces a valid YAML.
    const bad: ProviderLike = {
      modelId: "claude-wrong",
      async generate() {
        return "answer: 7";
      },
      async generateStructured<T>() {
        return { wrong: "shape" } as T;
      },
    };
    const gen = new StructuredProvider(bad);
    const out = await gen.generate({
      systemPrompt: "x",
      userPrompt: "y",
      schema: Schema,
      schemaName: "A",
    });
    expect(out).toEqual({ answer: 7 });
    expect(gen.lastMethod).toBe("text_parse");
  });
});

describe("StructuredProvider — text-parse-retry", () => {
  it("recovers on second attempt after a validation failure", async () => {
    const gen = new StructuredProvider(
      makeTextProvider(['answer: "not a number"', "answer: 42"]),
    );
    const out = await gen.generate({
      systemPrompt: "sys",
      userPrompt: "user",
      schema: Schema,
      schemaName: "A",
      maxRetries: 2,
    });
    expect(out).toEqual({ answer: 42 });
    expect(gen.apiCallCount).toBe(2);
  });

  it("throws StructuredOutputError after exhausting retries", async () => {
    const gen = new StructuredProvider(
      makeTextProvider(["bad", "still bad", "still still bad"]),
    );
    await expect(
      gen.generate({
        systemPrompt: "sys",
        userPrompt: "user",
        schema: Schema,
        schemaName: "A",
        maxRetries: 2,
      }),
    ).rejects.toBeInstanceOf(StructuredOutputError);
  });

  it("strips markdown fences", () => {
    expect(stripFences("```yaml\nanswer: 1\n```\n")).toBe("answer: 1");
    expect(stripFences("```json\n{\"answer\":1}\n```")).toBe('{"answer":1}');
  });

  it("schemaToPromptDescription renders a readable skeleton", () => {
    const desc = schemaToPromptDescription(Schema);
    expect(desc).toMatch(/answer/);
    expect(desc).toMatch(/number/);
  });
});
