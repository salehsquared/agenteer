import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { AnthropicProvider, OpenAIProvider } from "../src/providers/index.js";

function fakeFetch(response: unknown, status = 200): typeof fetch {
  return vi.fn(async () => ({
    ok: status >= 200 && status < 300,
    status,
    statusText: String(status),
    async json() {
      return response;
    },
    async text() {
      return typeof response === "string" ? response : JSON.stringify(response);
    },
  })) as unknown as typeof fetch;
}

describe("AnthropicProvider", () => {
  it("plain generate returns the first text block", async () => {
    const fetchImpl = fakeFetch({
      content: [{ type: "text", text: "hello" }],
    });
    const p = new AnthropicProvider({
      modelId: "claude-sonnet-4-5",
      apiKey: "test-key",
      fetchImpl,
    });
    const out = await p.generate("system", "user");
    expect(out).toBe("hello");
  });

  it("generateStructured returns tool_use input validated against schema", async () => {
    const schema = z.object({ severity: z.enum(["low", "high"]), note: z.string() });
    const fetchImpl = fakeFetch({
      content: [
        {
          type: "tool_use",
          id: "t1",
          name: "s",
          input: { severity: "high", note: "auth timeout" },
        },
      ],
    });
    const p = new AnthropicProvider({
      modelId: "claude-sonnet-4-5",
      apiKey: "test-key",
      fetchImpl,
    });
    const out = await p.generateStructured({
      systemPrompt: "",
      userPrompt: "rate this",
      schema,
      schemaName: "severity",
    });
    expect(out.severity).toBe("high");
    expect(out.note).toBe("auth timeout");
  });

  it("throws on non-2xx status with upstream message", async () => {
    const fetchImpl = fakeFetch("rate limit", 429);
    const p = new AnthropicProvider({
      modelId: "claude-sonnet-4-5",
      apiKey: "k",
      fetchImpl,
    });
    await expect(p.generate("", "hi")).rejects.toThrow(/429/);
  });
});

describe("OpenAIProvider", () => {
  it("plain generate returns first choice content", async () => {
    const fetchImpl = fakeFetch({
      choices: [{ message: { content: "world" }, finish_reason: "stop" }],
    });
    const p = new OpenAIProvider({
      modelId: "gpt-4o",
      apiKey: "test-key",
      fetchImpl,
    });
    const out = await p.generate("sys", "user");
    expect(out).toBe("world");
  });

  it("generateStructured parses JSON from content against schema", async () => {
    const schema = z.object({ action: z.enum(["approve", "deny"]) });
    const fetchImpl = fakeFetch({
      choices: [
        { message: { content: JSON.stringify({ action: "approve" }) }, finish_reason: "stop" },
      ],
    });
    const p = new OpenAIProvider({ modelId: "gpt-4o", apiKey: "k", fetchImpl });
    const out = await p.generateStructured({
      systemPrompt: "",
      userPrompt: "ok?",
      schema,
      schemaName: "decision",
    });
    expect(out.action).toBe("approve");
  });
});
