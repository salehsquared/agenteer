/**
 * Unified evidence constructor — sub-plan 04 §1.6.
 *
 * OE's two constructors (`collectFromGateCheck`, `collectFromHookResult`)
 * collapse into this. Thin adapters preserve OE call-site shapes; both
 * just fill in `kind` and massage field names.
 */

import type {
  ClaimRef,
  EvidenceKind,
  EvidenceRecord,
} from "./schema.js";
import type { EvidencePutInput, EvidenceStore } from "./store.js";

export interface CollectFromNodeRunInput {
  kind: EvidenceKind;
  nodeId: string;
  nodeRunId: string;
  parentNodeRunId?: string;
  lineageId?: string;
  tool: {
    name: string;
    version?: string;
    command: string;
  };
  run: {
    timestamp: string;
    trigger: EvidenceRecord["run"]["trigger"];
    commit_sha?: string;
  };
  result: {
    verdict: EvidenceRecord["result"]["verdict"];
    exit_code?: number;
    stdout?: string;
    stderr?: string;
    summary?: string;
  };
  claims?: ClaimRef[];
  writes?: string[];
  reads?: string[];
  contentHash?: string;
}

export async function collectFromNodeRun(
  store: EvidenceStore,
  input: CollectFromNodeRunInput,
): Promise<EvidenceRecord> {
  const exit_code =
    input.result.exit_code ??
    (input.result.verdict === "pass" || input.result.verdict === "skip" ? 0 : 1);

  const rawLog = joinLogs(input.result.stdout, input.result.stderr);
  const summary = input.result.summary ?? deriveSummary(input, rawLog);

  const record: EvidencePutInput = {
    evidence_version: 1,
    claim_refs: input.claims ?? [],
    run: {
      timestamp: input.run.timestamp,
      trigger: input.run.trigger,
      ...(input.run.commit_sha ? { commit_sha: input.run.commit_sha } : {}),
      node_id: input.nodeId,
      node_run_id: input.nodeRunId,
      ...(input.parentNodeRunId ? { parent_node_run_id: input.parentNodeRunId } : {}),
      ...(input.lineageId ? { lineage_id: input.lineageId } : {}),
    },
    tool: {
      name: input.tool.name,
      ...(input.tool.version ? { version: input.tool.version } : {}),
      command: input.tool.command,
      exit_code,
    },
    result: {
      verdict: input.result.verdict,
      summary,
    },
    kind: input.kind,
  };

  const artifacts = buildArtifacts({
    raw_log: rawLog,
    content_hash: input.contentHash,
    writes: input.writes,
    reads: input.reads,
  });
  if (artifacts) record.artifacts = artifacts;

  return store.put(record);
}

function joinLogs(stdout?: string, stderr?: string): string | undefined {
  if (!stdout && !stderr) return undefined;
  if (stdout && !stderr) return stdout;
  if (stderr && !stdout) return `STDERR:\n${stderr}`;
  return `${stdout}\n---STDERR---\n${stderr}`;
}

function deriveSummary(input: CollectFromNodeRunInput, rawLog?: string): string {
  const head = rawLog ? rawLog.split("\n").slice(-3).join(" ").slice(0, 200) : "";
  const base = `${input.tool.name} ${input.result.verdict}`;
  return head ? `${base} — ${head}` : base;
}

function buildArtifacts(input: {
  raw_log?: string;
  content_hash?: string;
  writes?: string[];
  reads?: string[];
}): EvidenceRecord["artifacts"] | undefined {
  const entries: Partial<NonNullable<EvidenceRecord["artifacts"]>> = {};
  if (input.raw_log) entries.raw_log = input.raw_log;
  if (input.content_hash) entries.content_hash = input.content_hash;
  if (input.writes?.length) entries.writes = input.writes;
  if (input.reads?.length) entries.reads = input.reads;
  if (Object.keys(entries).length === 0) return undefined;
  return entries as EvidenceRecord["artifacts"];
}

// ─── OE-compat adapters ───────────────────────────────────────────────

export async function collectFromGateCheck(
  store: EvidenceStore,
  check: { name: string; passed: boolean; message: string },
  command: string,
  claims: ClaimRef[],
  meta?: { nodeId: string; nodeRunId: string; gateType?: string },
): Promise<EvidenceRecord> {
  return collectFromNodeRun(store, {
    kind: "gate_check",
    nodeId: meta?.nodeId ?? "unknown",
    nodeRunId: meta?.nodeRunId ?? "unknown",
    tool: { name: meta?.gateType ?? check.name, command },
    run: { timestamp: new Date().toISOString(), trigger: "agent" },
    result: {
      verdict: check.passed ? "pass" : "fail",
      summary: `${check.name}: ${check.message}`,
    },
    claims,
  });
}

export async function collectFromHookResult(
  store: EvidenceStore,
  hook: {
    hookId: string;
    hookType: string;
    outcome: "pass" | "fail" | "error" | "timeout" | "skipped";
    output: string;
    executedAt: string;
  },
  claims: ClaimRef[],
  trigger: EvidenceRecord["run"]["trigger"] = "agent",
): Promise<EvidenceRecord> {
  const verdict: EvidenceRecord["result"]["verdict"] =
    hook.outcome === "skipped" ? "skip" : hook.outcome;
  return collectFromNodeRun(store, {
    kind: "hook_result",
    nodeId: hook.hookType,
    nodeRunId: hook.hookId,
    tool: { name: hook.hookType, command: hook.hookId },
    run: { timestamp: hook.executedAt, trigger },
    result: {
      verdict,
      stdout: hook.output,
    },
    claims,
  });
}
