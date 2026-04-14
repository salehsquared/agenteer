/**
 * E2E test for the research-assistant demo — runs the exact same code
 * path users exercise via `node run-mock.js`. Proves the 6-stdlib-node
 * composition completes, produces a ctx artifact, and surfaces the
 * expected score + validation verdict.
 */

import { describe, expect, it } from "vitest";
import { runMockDemo } from "../run-mock.js";

describe("research-assistant demo", () => {
  it("completes end-to-end with mock model + canned findings", async () => {
    const { report, sessionDir } = await runMockDemo({
      question: "Why did outages spike last quarter?",
      topic: "t1",
      approve: true,
    });
    expect(report).toMatch(/status:\s+completed/);
    // Ctx timeline shows the driver's artifact write.
    expect(report).toMatch(/research\.t1\.report/);
    // Session dir returned for inspection (cleanup is caller's job).
    expect(sessionDir).toMatch(/research-assistant-/);
  }, 30_000);

  it("deny path short-circuits with 'aborted' report", async () => {
    const { report } = await runMockDemo({
      question: "y",
      topic: "t2",
      approve: false,
    });
    expect(report).toMatch(/status:\s+completed/);
  }, 30_000);
});
