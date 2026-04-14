import { describe, expect, it } from "vitest";
import { mkdtemp, rm, readdir, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parse as parseYaml } from "yaml";
import {
  MemoryEvidenceStore,
  YamlEvidenceStore,
  collectFromNodeRun,
  collectFromGateCheck,
  generateEvidenceId,
  nextDedupeSuffix,
  attachBridge,
} from "../src/evidence/index.js";

describe("generateEvidenceId", () => {
  it("produces deterministic id for identical inputs", () => {
    const a = generateEvidenceId({
      command: "tsc --noEmit",
      verdict: "pass",
      timestamp: "2026-04-13T10:00:00Z",
    });
    const b = generateEvidenceId({
      command: "tsc --noEmit",
      verdict: "pass",
      timestamp: "2026-04-13T10:00:00Z",
    });
    expect(a).toBe(b);
    expect(a).toMatch(/^EV-20260413-[0-9a-f]{12}$/);
  });

  it("differs on any hash input", () => {
    const base = { command: "x", verdict: "pass", timestamp: "2026-04-13T10:00:00Z" };
    const a = generateEvidenceId(base);
    const b = generateEvidenceId({ ...base, verdict: "fail" });
    expect(a).not.toBe(b);
  });
});

describe("nextDedupeSuffix", () => {
  it("appends -2, -3, … on collision", () => {
    const existing = new Set(["EV-aa", "EV-aa-2"]);
    expect(nextDedupeSuffix("EV-bb", existing)).toBe("EV-bb");
    expect(nextDedupeSuffix("EV-aa", existing)).toBe("EV-aa-3");
  });
});

describe("MemoryEvidenceStore", () => {
  it("put + get round-trip", async () => {
    const store = new MemoryEvidenceStore();
    const rec = await store.put({
      evidence_version: 1,
      run: { timestamp: "2026-04-13T10:00:00Z", trigger: "agent" },
      tool: { name: "tsc", command: "tsc --noEmit", exit_code: 0 },
      result: { verdict: "pass", summary: "clean" },
    });
    expect(await store.get(rec.id)).toEqual(rec);
  });

  it("dedupe mode returns existing record on identical inputs", async () => {
    const store = new MemoryEvidenceStore({ duplicates: "dedupe" });
    const a = await store.put({
      evidence_version: 1,
      run: { timestamp: "2026-04-13T10:00:00Z", trigger: "agent" },
      tool: { name: "t", command: "c", exit_code: 0 },
      result: { verdict: "pass", summary: "s" },
    });
    const b = await store.put({
      evidence_version: 1,
      run: { timestamp: "2026-04-13T10:00:00Z", trigger: "agent" },
      tool: { name: "t", command: "c", exit_code: 0 },
      result: { verdict: "pass", summary: "s (different summary, same hash inputs)" },
    });
    expect(a.id).toBe(b.id);
    expect((await store.list()).length).toBe(1);
  });

  it("distinct mode suffixes colliding ids", async () => {
    const store = new MemoryEvidenceStore({ duplicates: "distinct" });
    const base = {
      evidence_version: 1 as const,
      run: { timestamp: "2026-04-13T10:00:00Z" as const, trigger: "agent" as const },
      tool: { name: "t", command: "c", exit_code: 0 },
      result: { verdict: "pass" as const, summary: "s" },
    };
    const a = await store.put(base);
    const b = await store.put(base);
    expect(a.id).not.toBe(b.id);
    expect(b.id.endsWith("-2")).toBe(true);
  });

  it("markStale appends a marker and flips stale", async () => {
    const store = new MemoryEvidenceStore();
    const rec = await store.put({
      evidence_version: 1,
      run: { timestamp: "2026-04-13T10:00:00Z", trigger: "agent" },
      tool: { name: "t", command: "c", exit_code: 0 },
      result: { verdict: "pass", summary: "s" },
    });
    await store.markStale(rec.id, { by: "test", reason: "upstream_changed" });
    const updated = await store.get(rec.id);
    expect(updated!.stale).toBe(true);
    expect(updated!.stale_markers).toHaveLength(1);
  });

  it("queryByClaim filters by claim ref", async () => {
    const store = new MemoryEvidenceStore();
    await store.put({
      evidence_version: 1,
      claim_refs: [{ type: "constraint", id: "C-1" }],
      run: { timestamp: "2026-04-13T10:00:00Z", trigger: "agent" },
      tool: { name: "t", command: "c", exit_code: 0 },
      result: { verdict: "pass", summary: "s" },
    });
    const hits = await store.queryByClaim({ type: "constraint", id: "C-1" });
    expect(hits).toHaveLength(1);
  });
});

describe("YamlEvidenceStore", () => {
  it("writes one YAML per record and round-trips", async () => {
    const dir = await mkdtemp(join(tmpdir(), "agenteer-ev-"));
    try {
      const store = new YamlEvidenceStore({ dir });
      await collectFromNodeRun(store, {
        kind: "gate_check",
        nodeId: "@agenteer/node-compile",
        nodeRunId: "run_1",
        tool: { name: "tsc", command: "tsc --noEmit" },
        run: { timestamp: "2026-04-13T10:00:00Z", trigger: "agent" },
        result: { verdict: "pass", summary: "clean" },
      });
      const files = (await readdir(dir)).filter((f) => f.endsWith(".yaml"));
      expect(files).toHaveLength(1);
      const raw = await readFile(join(dir, files[0]!), "utf8");
      const parsed = parseYaml(raw) as Record<string, unknown>;
      expect(parsed.evidence_version).toBe(1);
      expect((parsed.run as Record<string, string>).node_id).toBe("@agenteer/node-compile");

      // A fresh store instance reads the existing files on demand.
      const store2 = new YamlEvidenceStore({ dir });
      const all = await store2.list();
      expect(all).toHaveLength(1);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

describe("EvidenceBridge", () => {
  it("fires on put and stale", async () => {
    const store = new MemoryEvidenceStore();
    const puts: string[] = [];
    const stales: string[] = [];
    attachBridge(store, {
      onEvidencePut: (rec) => {
        puts.push(rec.id);
      },
      onEvidenceStale: (id) => {
        stales.push(id);
      },
    });
    const rec = await collectFromGateCheck(
      store,
      { name: "tsc", passed: true, message: "ok" },
      "tsc --noEmit",
      [],
      { nodeId: "node-compile", nodeRunId: "run_x" },
    );
    expect(puts).toEqual([rec.id]);
    await store.markStale(rec.id, { by: "test", reason: "upstream_changed" });
    expect(stales).toEqual([rec.id]);
  });
});
