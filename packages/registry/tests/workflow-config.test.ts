import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  ensureWorkflowConfig,
  readLockfile,
  readWorkflowConfig,
  recordInstall,
  removeInstall,
} from "../src/index.js";

describe("workflow-config", () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "agenteer-workflow-"));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("ensureWorkflowConfig creates a fresh file and is a no-op on subsequent calls", async () => {
    const first = await ensureWorkflowConfig(dir, {
      workflow_id: "demo",
      granted: ["fs.read:/tmp/**"],
    });
    expect(first.workflow_id).toBe("demo");
    expect(first.granted).toEqual(["fs.read:/tmp/**"]);

    const second = await ensureWorkflowConfig(dir, {
      workflow_id: "ignored",
      granted: ["should-not-overwrite"],
    });
    expect(second.workflow_id).toBe("demo");
    expect(second.granted).toEqual(["fs.read:/tmp/**"]);
  });

  it("recordInstall upserts nodes in the config and lockfile", async () => {
    await ensureWorkflowConfig(dir, { workflow_id: "d" });
    await recordInstall(dir, {
      id: "@toy/node-triage",
      version: "1.2.0",
      range: "^1.2.0",
      manifestHash: "abc123",
    });
    await recordInstall(dir, {
      id: "@toy/node-triage",
      version: "1.3.0",
      range: "^1.2.0",
      manifestHash: "def456",
    });

    const cfg = (await readWorkflowConfig(dir))!;
    expect(cfg.nodes).toHaveLength(1);
    expect(cfg.nodes[0]!.version).toBe("1.3.0");

    const lock = await readLockfile(dir);
    expect(lock.entries).toHaveLength(1);
    expect(lock.entries[0]!.manifest_hash).toBe("def456");
  });

  it("removeInstall drops the entry from both files", async () => {
    await ensureWorkflowConfig(dir, { workflow_id: "d" });
    await recordInstall(dir, {
      id: "@toy/node-triage",
      version: "1.2.0",
      range: "^1.2.0",
      manifestHash: "x",
    });
    await removeInstall(dir, "@toy/node-triage");
    const cfg = (await readWorkflowConfig(dir))!;
    const lock = await readLockfile(dir);
    expect(cfg.nodes).toHaveLength(0);
    expect(lock.entries).toHaveLength(0);
  });
});
