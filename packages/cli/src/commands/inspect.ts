/**
 * `agenteer inspect` — session summary plus three detail views:
 *
 *   - ctx_timeline     : per-node_run, what keys were set/deleted/appended
 *   - evidence_tree    : evidence records grouped by lineage_id (ReplaceMe
 *                        chain), with the primary record and its auxiliaries
 *   - permission_denials : filtered permission_denied + ctx_scope_restricted
 *                          events with who/what/why
 *
 * The library form returns a structured `InspectReport` that includes
 * all three detail sections; the CLI bin renders them selectively
 * based on flags. Events on the bus aren't user-facing — these views
 * are what make the black box legible.
 */

import { readFile } from "node:fs/promises";
import {
  FileContextStore,
  loadSession,
  sessionEventsPath,
  sessionEvidenceDir,
  type SessionState,
} from "@agenteer/core";
import { YamlEvidenceStore, type EvidenceRecord } from "@agenteer/trust/evidence";

export interface CtxTimelineEntry {
  node_run_id: string;
  manifest: string;
  correlation: string;
  timestamp: string;
  set_keys: readonly string[];
  deleted_keys: readonly string[];
  appended_keys: readonly string[];
}

export interface EvidenceChain {
  lineage_id: string;
  records: readonly EvidenceRecord[];
  /** True when any record has verdict="fail". */
  has_failure: boolean;
}

export interface PermissionDenialEntry {
  kind: "permission_denied" | "ctx_scope_restricted";
  node_id: string;
  timestamp: string;
  /** Raw event payload (different shape per kind). */
  detail: unknown;
}

export interface InspectReport {
  state: SessionState;
  event_count: number;
  event_types: Record<string, number>;
  last_events: Array<{ type: string; recorded_at: string; payload: unknown }>;
  context_item_count: number;
  evidence_count: number;
  evidence_verdicts: Record<string, number>;
  ctx_timeline: readonly CtxTimelineEntry[];
  evidence_tree: readonly EvidenceChain[];
  permission_denials: readonly PermissionDenialEntry[];
}

type EventLine = { type: string; payload: Record<string, unknown>; recorded_at: string };

export async function inspectSession(
  sessionDir: string,
  opts: { lastEvents?: number } = {},
): Promise<InspectReport> {
  const state = await loadSession(sessionDir);
  if (!state) throw new Error(`inspectSession: no session at ${sessionDir}`);

  const events = await readEventsJsonl(sessionDir);

  const event_types: Record<string, number> = {};
  for (const e of events) {
    event_types[e.type] = (event_types[e.type] ?? 0) + 1;
  }
  const lastN = opts.lastEvents ?? 10;
  const last_events = events.slice(Math.max(0, events.length - lastN));

  const contextStore = new FileContextStore({ sessionDir });
  await contextStore.load();
  const context_item_count = contextStore.snapshot().length;

  const evidenceSink = new YamlEvidenceStore({
    dir: sessionEvidenceDir(sessionDir),
    duplicates: "dedupe",
  });
  const allEvidence = await evidenceSink.list();
  const evidence_verdicts: Record<string, number> = {};
  for (const rec of allEvidence) {
    evidence_verdicts[rec.result.verdict] =
      (evidence_verdicts[rec.result.verdict] ?? 0) + 1;
  }

  const ctx_timeline = buildCtxTimeline(events);
  const evidence_tree = buildEvidenceTree(allEvidence);
  const permission_denials = buildDenialLog(events);

  return {
    state,
    event_count: events.length,
    event_types,
    last_events,
    context_item_count,
    evidence_count: allEvidence.length,
    evidence_verdicts,
    ctx_timeline,
    evidence_tree,
    permission_denials,
  };
}

// --- helpers --------------------------------------------------------------

async function readEventsJsonl(sessionDir: string): Promise<EventLine[]> {
  let raw = "";
  try {
    raw = await readFile(sessionEventsPath(sessionDir), "utf-8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
  }
  const out: EventLine[] = [];
  for (const line of raw.trim().split("\n")) {
    if (!line) continue;
    try {
      out.push(JSON.parse(line));
    } catch {
      /* skip malformed */
    }
  }
  return out;
}

function buildCtxTimeline(events: EventLine[]): CtxTimelineEntry[] {
  // We need node_start for (manifest, correlation) metadata keyed by
  // nodeId, and ctx_patched for the operation list.
  type Meta = { manifest: string; correlation: string; timestamp: string };
  const meta = new Map<string, Meta>();
  for (const e of events) {
    if (e.type !== "node_start") continue;
    const p = e.payload as { nodeId: string; manifest: string; correlation: string; timestamp: string };
    meta.set(p.nodeId, { manifest: p.manifest, correlation: p.correlation, timestamp: p.timestamp });
  }
  const out: CtxTimelineEntry[] = [];
  for (const e of events) {
    if (e.type !== "ctx_patched") continue;
    const p = e.payload as {
      nodeId: string;
      setKeys: string[];
      deletedKeys: string[];
      appendedKeys: string[];
      timestamp: string;
    };
    const m = meta.get(p.nodeId);
    out.push({
      node_run_id: p.nodeId,
      manifest: m?.manifest ?? "(unknown)",
      correlation: m?.correlation ?? "",
      timestamp: p.timestamp,
      set_keys: p.setKeys ?? [],
      deleted_keys: p.deletedKeys ?? [],
      appended_keys: p.appendedKeys ?? [],
    });
  }
  return out;
}

function buildEvidenceTree(records: EvidenceRecord[]): EvidenceChain[] {
  const byLineage = new Map<string, EvidenceRecord[]>();
  for (const r of records) {
    const lineage = r.run.lineage_id ?? r.run.node_run_id ?? r.id;
    const chain = byLineage.get(lineage) ?? [];
    chain.push(r);
    byLineage.set(lineage, chain);
  }
  const chains: EvidenceChain[] = [];
  for (const [lineage_id, recs] of byLineage.entries()) {
    const sorted = [...recs].sort((a, b) =>
      a.run.timestamp.localeCompare(b.run.timestamp),
    );
    chains.push({
      lineage_id,
      records: sorted,
      has_failure: sorted.some((r) => r.result.verdict === "fail"),
    });
  }
  chains.sort((a, b) => {
    const at = a.records[0]?.run.timestamp ?? "";
    const bt = b.records[0]?.run.timestamp ?? "";
    return at.localeCompare(bt);
  });
  return chains;
}

function buildDenialLog(events: EventLine[]): PermissionDenialEntry[] {
  const out: PermissionDenialEntry[] = [];
  for (const e of events) {
    if (e.type === "permission_denied") {
      const p = e.payload as { nodeId: string; timestamp: string };
      out.push({
        kind: "permission_denied",
        node_id: p.nodeId,
        timestamp: p.timestamp,
        detail: e.payload,
      });
    } else if (e.type === "ctx_scope_restricted") {
      const p = e.payload as { nodeId: string; timestamp: string };
      out.push({
        kind: "ctx_scope_restricted",
        node_id: p.nodeId,
        timestamp: p.timestamp,
        detail: e.payload,
      });
    }
  }
  return out;
}

// --- rendering ------------------------------------------------------------

/** Terminal-friendly rendering. Returns a string with ANSI-free lines. */
export function renderInspectReport(report: InspectReport): string {
  const out: string[] = [];
  const s = report.state;
  out.push(`session ${s.session_id}${s.title ? ` — ${s.title}` : ""}`);
  out.push(`  status:     ${s.status}`);
  out.push(`  created:    ${s.created_at}`);
  out.push(`  updated:    ${s.updated_at}`);
  out.push(`  root:       ${s.root.manifest_id}`);
  out.push(`  granted:    ${s.granted_root.length} cap(s)`);
  if (s.pending_prompts.length > 0) {
    out.push(`  pending prompts:`);
    for (const p of s.pending_prompts) out.push(`    - [${p.resume_hint}] ${p.prompt}`);
  }
  if (s.user_answers.length > 0) out.push(`  user answers: ${s.user_answers.length}`);
  out.push(`  context items: ${report.context_item_count}`);
  out.push(`  evidence:      ${report.evidence_count}`);
  if (Object.keys(report.evidence_verdicts).length > 0) {
    out.push(
      `    ${Object.entries(report.evidence_verdicts).map(([v, n]) => `${v}=${n}`).join(" ")}`,
    );
  }
  out.push(`  events:        ${report.event_count}`);
  if (Object.keys(report.event_types).length > 0) {
    out.push(
      `    ${Object.entries(report.event_types).map(([v, n]) => `${v}=${n}`).join(" ")}`,
    );
  }
  return out.join("\n");
}

export function renderCtxTimeline(entries: readonly CtxTimelineEntry[]): string {
  if (entries.length === 0) return "  (no ctx patches recorded)";
  const out: string[] = ["context timeline:"];
  for (const e of entries) {
    const ops: string[] = [];
    if (e.set_keys.length > 0) ops.push(`set=${e.set_keys.join(",")}`);
    if (e.deleted_keys.length > 0) ops.push(`del=${e.deleted_keys.join(",")}`);
    if (e.appended_keys.length > 0) ops.push(`app=${e.appended_keys.join(",")}`);
    out.push(`  ${e.timestamp}  ${e.manifest}  [${e.correlation}]  ${ops.join(" ")}`);
  }
  return out.join("\n");
}

export function renderEvidenceTree(chains: readonly EvidenceChain[]): string {
  if (chains.length === 0) return "  (no evidence)";
  const out: string[] = ["evidence tree (by lineage):"];
  for (const c of chains) {
    const marker = c.has_failure ? "[FAIL]" : "[ok]  ";
    out.push(`  ${marker} ${c.lineage_id}  (${c.records.length} records)`);
    for (const r of c.records) {
      const verd = r.result.verdict.padEnd(4);
      out.push(`      ${verd}  ${r.run.timestamp}  ${r.tool.name}  ${r.result.summary ?? ""}`);
    }
  }
  return out.join("\n");
}

export function renderPermissionDenials(entries: readonly PermissionDenialEntry[]): string {
  if (entries.length === 0) return "  (no denials — all spawns + ctx reads authorized)";
  const out: string[] = ["permission denials:"];
  for (const e of entries) {
    if (e.kind === "permission_denied") {
      const d = e.detail as { nodeId: string; attempted?: Record<string, string>; reason: string };
      const what = d.attempted
        ? Object.entries(d.attempted).map(([k, v]) => `${k}=${v}`).join(" ")
        : "";
      out.push(`  ${e.timestamp}  DENY       ${d.nodeId}  ${what}`);
      out.push(`             ${d.reason}`);
    } else {
      const d = e.detail as {
        nodeId: string;
        requested: string[];
        allowed: string[];
        restricted: string[];
      };
      out.push(
        `  ${e.timestamp}  SCOPE-RES  ${d.nodeId}  restricted=${d.restricted.join(",")}`,
      );
      out.push(`             allowed=${d.allowed.join(",")}  requested=${d.requested.join(",")}`);
    }
  }
  return out.join("\n");
}
