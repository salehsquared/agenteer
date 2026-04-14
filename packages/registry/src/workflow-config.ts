/**
 * `framework.workflow.yaml` + `framework.lock` — the installed-node ledger
 * and the content-integrity pin (sub-plan 02 §3.3 + §3.4).
 *
 *   framework.workflow.yaml
 *     workflow_version: 1
 *     workflow_id: my-project
 *     granted: [ ...capability strings... ]
 *     nodes:
 *       - id: @acme/node-bug-triage
 *         version: 1.4.0            # exact resolved, lockfile-style
 *         range:   ^1.4.0           # user intent
 *
 *   framework.lock
 *     lock_version: 1
 *     entries:
 *       - id: @acme/node-bug-triage
 *         version: 1.4.0
 *         manifest_hash: <sha256>   # supply-chain pin
 *         installed_at: <iso>
 *
 * Both files live at `<workflowDir>/framework.workflow.yaml` and
 * `<workflowDir>/framework.lock`. Reads are tolerant of absence (first
 * install); writes create the file atomically.
 */

import { readFile, writeFile, rename, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { parse as parseYaml, stringify as yamlStringify } from "yaml";
import { z } from "zod";

export const WORKFLOW_CONFIG = "framework.workflow.yaml";
export const WORKFLOW_LOCK = "framework.lock";

export const WorkflowNodeEntrySchema = z.object({
  id: z.string(),
  version: z.string(),
  range: z.string(),
});
export type WorkflowNodeEntry = z.infer<typeof WorkflowNodeEntrySchema>;

export const WorkflowConfigSchema = z.object({
  workflow_version: z.literal(1),
  workflow_id: z.string(),
  granted: z.array(z.string()).default([]),
  nodes: z.array(WorkflowNodeEntrySchema).default([]),
});
export type WorkflowConfig = z.infer<typeof WorkflowConfigSchema>;

export const LockEntrySchema = z.object({
  id: z.string(),
  version: z.string(),
  manifest_hash: z.string(),
  installed_at: z.string(),
});
export type LockEntry = z.infer<typeof LockEntrySchema>;

export const LockFileSchema = z.object({
  lock_version: z.literal(1),
  entries: z.array(LockEntrySchema).default([]),
});
export type LockFile = z.infer<typeof LockFileSchema>;

async function atomicWrite(filePath: string, content: string): Promise<void> {
  await mkdir(dirname(filePath), { recursive: true });
  const tmp = `${filePath}.tmp`;
  await writeFile(tmp, content, "utf-8");
  await rename(tmp, filePath);
}

async function readIfExists(filePath: string): Promise<string | null> {
  try {
    return await readFile(filePath, "utf-8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw err;
  }
}

export async function readWorkflowConfig(workflowDir: string): Promise<WorkflowConfig | null> {
  const raw = await readIfExists(join(workflowDir, WORKFLOW_CONFIG));
  if (raw === null) return null;
  return WorkflowConfigSchema.parse(parseYaml(raw));
}

export async function writeWorkflowConfig(
  workflowDir: string,
  config: WorkflowConfig,
): Promise<void> {
  const parsed = WorkflowConfigSchema.parse(config);
  await atomicWrite(
    join(workflowDir, WORKFLOW_CONFIG),
    yamlStringify(parsed, { lineWidth: 120 }),
  );
}

export async function ensureWorkflowConfig(
  workflowDir: string,
  args: { workflow_id: string; granted?: readonly string[] },
): Promise<WorkflowConfig> {
  const existing = await readWorkflowConfig(workflowDir);
  if (existing) return existing;
  const fresh: WorkflowConfig = {
    workflow_version: 1,
    workflow_id: args.workflow_id,
    granted: [...(args.granted ?? [])],
    nodes: [],
  };
  await writeWorkflowConfig(workflowDir, fresh);
  return fresh;
}

export async function readLockfile(workflowDir: string): Promise<LockFile> {
  const raw = await readIfExists(join(workflowDir, WORKFLOW_LOCK));
  if (raw === null) return { lock_version: 1, entries: [] };
  return LockFileSchema.parse(parseYaml(raw));
}

export async function writeLockfile(workflowDir: string, lock: LockFile): Promise<void> {
  const parsed = LockFileSchema.parse(lock);
  await atomicWrite(
    join(workflowDir, WORKFLOW_LOCK),
    yamlStringify(parsed, { lineWidth: 120 }),
  );
}

/**
 * Upsert a node entry into the workflow config + lockfile. Same id replaces.
 */
export async function recordInstall(
  workflowDir: string,
  args: {
    id: string;
    version: string;
    range: string;
    manifestHash: string;
    installedAt?: string;
  },
): Promise<void> {
  const workflow = (await readWorkflowConfig(workflowDir))!;
  const updatedNodes = upsertNode(workflow.nodes, {
    id: args.id,
    version: args.version,
    range: args.range,
  });
  await writeWorkflowConfig(workflowDir, { ...workflow, nodes: updatedNodes });

  const lock = await readLockfile(workflowDir);
  const installedAt = args.installedAt ?? new Date().toISOString();
  const updatedEntries = upsertEntry(lock.entries, {
    id: args.id,
    version: args.version,
    manifest_hash: args.manifestHash,
    installed_at: installedAt,
  });
  await writeLockfile(workflowDir, { ...lock, entries: updatedEntries });
}

export async function removeInstall(workflowDir: string, id: string): Promise<void> {
  const workflow = await readWorkflowConfig(workflowDir);
  if (workflow) {
    await writeWorkflowConfig(workflowDir, {
      ...workflow,
      nodes: workflow.nodes.filter((n) => n.id !== id),
    });
  }
  const lock = await readLockfile(workflowDir);
  await writeLockfile(workflowDir, {
    ...lock,
    entries: lock.entries.filter((e) => e.id !== id),
  });
}

function upsertNode(
  list: readonly WorkflowNodeEntry[],
  entry: WorkflowNodeEntry,
): WorkflowNodeEntry[] {
  const out = list.filter((n) => n.id !== entry.id);
  out.push(entry);
  out.sort((a, b) => a.id.localeCompare(b.id));
  return out;
}

function upsertEntry(list: readonly LockEntry[], entry: LockEntry): LockEntry[] {
  const out = list.filter((n) => n.id !== entry.id);
  out.push(entry);
  out.sort((a, b) => a.id.localeCompare(b.id));
  return out;
}
