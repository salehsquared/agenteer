/**
 * Evidence record schema (sub-plan 04 §1.1).
 *
 * Extends OpenEngine's schema additively — every new field is optional so
 * OE YAML round-trips unchanged. `evidence_version: 1` stays pinned; the
 * shape is frozen at v1 per sub-plan 04 §0.5.
 */

import { z } from "zod";

export const ClaimTypeSchema = z.enum([
  "constraint",
  "acceptance_criterion",
  "invariant",
  "requirement",
]);
export type ClaimType = z.infer<typeof ClaimTypeSchema>;

export const ClaimRefSchema = z
  .object({
    type: ClaimTypeSchema,
    id: z.string(),
  })
  .strict();
export type ClaimRef = z.infer<typeof ClaimRefSchema>;

export const EvidenceKindSchema = z.enum([
  "gate_check",
  "hook_result",
  "llm_call",
  "cross_check",
  "access_scan",
  "shell_exec",
  "user",
  "generic",
]);
export type EvidenceKind = z.infer<typeof EvidenceKindSchema>;

export const StaleMarkerSchema = z
  .object({
    at: z.string(),
    by: z.string(),
    reason: z.enum([
      "upstream_changed",
      "explicit",
      "repair_invalidated",
      "superseded",
      "evidence_refreshed",
    ]),
    detail: z.string().optional(),
  })
  .strict();
export type StaleMarker = z.infer<typeof StaleMarkerSchema>;

const RunSchema = z
  .object({
    timestamp: z.string(),
    commit_sha: z.string().optional(),
    trigger: z.enum(["agent", "ci", "manual", "watch"]),
    node_id: z.string().optional(),
    node_run_id: z.string().optional(),
    parent_node_run_id: z.string().optional(),
    /**
     * Sub-plan 00 §16.4: stable across a ReplaceMe chain — every
     * successor's evidence carries the same `lineage_id` as the
     * originally-spawned node. Optional for OE round-trip.
     */
    lineage_id: z.string().optional(),
  })
  .strict();

const ToolSchema = z
  .object({
    name: z.string(),
    version: z.string().optional(),
    command: z.string(),
    exit_code: z.number().int(),
  })
  .strict();

const ResultSchema = z
  .object({
    verdict: z.enum(["pass", "fail", "error", "skip", "timeout"]),
    summary: z.string(),
  })
  .strict();

const ArtifactsSchema = z
  .object({
    raw_log: z.string().optional(),
    content_hash: z.string().optional(),
    writes: z.array(z.string()).optional(),
    reads: z.array(z.string()).optional(),
  })
  .strict();

export const EvidenceRecordSchema = z
  .object({
    evidence_version: z.literal(1),
    id: z.string(),
    claim_refs: z.array(ClaimRefSchema).default([]),
    run: RunSchema,
    tool: ToolSchema,
    result: ResultSchema,
    artifacts: ArtifactsSchema.optional(),
    kind: EvidenceKindSchema.optional(),
    stale: z.boolean().default(false),
    stale_markers: z.array(StaleMarkerSchema).default([]),
  })
  .strict();

export type EvidenceRecord = z.infer<typeof EvidenceRecordSchema>;
export type EvidenceRecordInput = z.input<typeof EvidenceRecordSchema>;
