import { describe, expect, it } from "vitest";
import { searchNodes, type NpmRunner } from "../src/index.js";

function mockNpm(hits: unknown[]): NpmRunner {
  return {
    publish: async () => {},
    install: async () => {},
    uninstall: async () => {},
    view: async () => null,
    search: async () => hits as never,
  };
}

describe("searchNodes", () => {
  it("filters to framework-node keyword and surfaces curated badges", async () => {
    const npm = mockNpm([
      {
        name: "@toy/node-triage",
        version: "1.2.0",
        description: "Triage",
        keywords: ["framework-node", "triage"],
      },
      {
        name: "@other/unrelated",
        version: "1.0.0",
        description: "wrong",
        keywords: ["unrelated"],
      },
      {
        name: "@acme/node-bug",
        version: "0.1.0",
        description: "Bug triage",
        keywords: ["framework-node"],
      },
    ]);
    const hits = await searchNodes("triage", {
      npm,
      curated: [{ id: "@toy/node-triage", note: "community-reviewed" }],
    });
    expect(hits).toHaveLength(2);
    // Curated sorted first.
    expect(hits[0]!.name).toBe("@toy/node-triage");
    expect(hits[0]!.curated).toBe(true);
    expect(hits[0]!.curated_note).toBe("community-reviewed");
    expect(hits[1]!.name).toBe("@acme/node-bug");
    expect(hits[1]!.curated).toBe(false);
  });

  it("returns empty when nothing matches the keyword filter", async () => {
    const npm = mockNpm([
      { name: "@other/unrelated", version: "1.0.0", keywords: [] },
    ]);
    const hits = await searchNodes("anything", { npm });
    expect(hits).toEqual([]);
  });
});
