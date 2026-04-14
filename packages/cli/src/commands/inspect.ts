/**
 * `agenteer inspect` — session summary: state, pending prompts, recent
 * events, evidence counts. Intended for CLI human use; library form
 * returns a structured report for programmatic consumption.
 */

import { readFile } from "node:fs/promises";
import {
  FileContextStore,
  loadSession,
  sessionEventsPath,
  sessionEvidenceDir,
  type SessionState,
} from "@agenteer/core";
import { YamlEvidenceStore } from "@agenteer/trust/evidence";

export interface InspectReport {
  state: SessionState;
  event_count: number;
  event_types: Record<string, number>;
  last_events: Array<{ type: string; recorded_at: string; payload: unknown }>;
  context_item_count: number;
  evidence_count: number;
  evidence_verdicts: Record<string, number>;
}

export async function inspectSession(
  sessionDir: string,
  opts: { lastEvents?: number } = {},
): Promise<InspectReport> {
  const state = await loadSession(sessionDir);
  if (!state) throw new Error(`inspectSession: no session at ${sessionDir}`);

  // Events (optional file — a brand-new session before any run has none).
  let eventsRaw = "";
  try {
    eventsRaw = await readFile(sessionEventsPath(sessionDir), "utf-8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
  }
  const lines = eventsRaw.trim().split("\n").filter(Boolean);
  const event_types: Record<string, number> = {};
  for (const line of lines) {
    try {
      const parsed = JSON.parse(line) as { type: string };
      event_types[parsed.type] = (event_types[parsed.type] ?? 0) + 1;
    } catch {
      /* skip malformed */
    }
  }
  const lastN = opts.lastEvents ?? 10;
  const last_events = lines
    .slice(Math.max(0, lines.length - lastN))
    .map((l) => {
      try {
        return JSON.parse(l);
      } catch {
        return { type: "unparseable", recorded_at: "", payload: l };
      }
    });

  // Context.
  const contextStore = new FileContextStore({ sessionDir });
  await contextStore.load();
  const context_item_count = contextStore.snapshot().length;

  // Evidence.
  const evidence = new YamlEvidenceStore({
    dir: sessionEvidenceDir(sessionDir),
    duplicates: "dedupe",
  });
  const all = await evidence.list();
  const evidence_verdicts: Record<string, number> = {};
  for (const rec of all) {
    evidence_verdicts[rec.result.verdict] =
      (evidence_verdicts[rec.result.verdict] ?? 0) + 1;
  }

  return {
    state,
    event_count: lines.length,
    event_types,
    last_events,
    context_item_count,
    evidence_count: all.length,
    evidence_verdicts,
  };
}

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
    for (const p of s.pending_prompts) {
      out.push(`    - [${p.resume_hint}] ${p.prompt}`);
    }
  }
  if (s.user_answers.length > 0) {
    out.push(`  user answers: ${s.user_answers.length}`);
  }
  out.push(`  context items: ${report.context_item_count}`);
  out.push(`  evidence:      ${report.evidence_count}`);
  if (Object.keys(report.evidence_verdicts).length > 0) {
    const parts = Object.entries(report.evidence_verdicts)
      .map(([v, n]) => `${v}=${n}`)
      .join(" ");
    out.push(`    ${parts}`);
  }
  out.push(`  events:        ${report.event_count}`);
  if (Object.keys(report.event_types).length > 0) {
    const parts = Object.entries(report.event_types)
      .map(([v, n]) => `${v}=${n}`)
      .join(" ");
    out.push(`    ${parts}`);
  }
  return out.join("\n");
}
