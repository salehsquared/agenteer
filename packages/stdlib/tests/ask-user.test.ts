import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  InMemoryContextStore,
  InMemoryNodeRegistry,
  MemoryEvidenceSink,
  Runtime,
  RuntimeEvents,
} from "@agenteer/core";
import {
  askUserFactory,
  askUserManifest,
  type AskUserResolver,
} from "../src/index.js";

function newRuntime() {
  const registry = new InMemoryNodeRegistry();
  const contextStore = new InMemoryContextStore();
  const evidenceSink = new MemoryEvidenceSink();
  const events = new RuntimeEvents();
  const runtime = new Runtime({ registry, contextStore, evidenceSink, events });
  return { runtime, registry };
}

describe("ask_user", () => {
  it("replays the recorded `answer` without prompting", async () => {
    const { runtime, registry } = newRuntime();
    registry.register(askUserManifest, askUserFactory());
    const outcome = await runtime.run(
      {
        manifest_id: askUserManifest.id,
        input: { prompt: "What's the root cause?", answer: "bad migration" },
        correlation: "r",
      },
      [`spawn:${askUserManifest.id}`],
    );
    expect(outcome.finalStatus).toBe("completed");
    if (outcome.rootResult?.kind !== "output") throw new Error("unreachable");
    const v = outcome.rootResult.value as { answer: string; source: string };
    expect(v.answer).toBe("bad migration");
    expect(v.source).toBe("recorded");
  });

  it("uses the injected resolver when no recorded answer is present", async () => {
    const resolver: AskUserResolver = {
      resolve: ({ question_id }) => (question_id === "rca.root" ? "auth timeout" : null),
    };
    const { runtime, registry } = newRuntime();
    registry.register(askUserManifest, askUserFactory({ resolver }));
    const outcome = await runtime.run(
      {
        manifest_id: askUserManifest.id,
        input: { prompt: "Root cause?", question_id: "rca.root" },
        correlation: "r",
      },
      [`spawn:${askUserManifest.id}`],
    );
    expect(outcome.finalStatus).toBe("completed");
    if (outcome.rootResult?.kind !== "output") throw new Error("unreachable");
    const v = outcome.rootResult.value as { answer: string; source: string };
    expect(v.answer).toBe("auth timeout");
    expect(v.source).toBe("resolver");
  });

  it("falls through to NeedsUser with a stable resume_hint when no answer", async () => {
    const { runtime, registry } = newRuntime();
    registry.register(askUserManifest, askUserFactory());
    const events: Array<{ resume_hint: string; prompt: string }> = [];
    runtime.events.on("needs_user", (p) =>
      events.push({ resume_hint: p.resume_hint, prompt: p.prompt }),
    );
    const outcome = await runtime.run(
      {
        manifest_id: askUserManifest.id,
        input: { prompt: "What happened?", question_id: "rca.q1" },
        correlation: "r",
      },
      [`spawn:${askUserManifest.id}`],
    );
    expect(outcome.finalStatus).toBe("suspended");
    expect(events).toHaveLength(1);
    expect(events[0]!.resume_hint).toBe("rca.q1");
    expect(events[0]!.prompt).toBe("What happened?");
  });

  it("rejects a recorded answer that fails the custom schema", async () => {
    const { runtime, registry } = newRuntime();
    registry.register(
      askUserManifest,
      askUserFactory({ answerSchema: z.object({ severity: z.enum(["low", "high"]) }) }),
    );
    const outcome = await runtime.run(
      {
        manifest_id: askUserManifest.id,
        input: { prompt: "severity?", answer: { severity: "enormous" } },
        correlation: "r",
      },
      [`spawn:${askUserManifest.id}`],
    );
    expect(outcome.finalStatus).toBe("failed");
    if (outcome.rootResult?.kind !== "failed") throw new Error("unreachable");
    expect(outcome.rootResult.reason).toMatch(/recorded_answer_schema_violation/);
  });
});
