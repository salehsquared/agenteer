/**
 * Evidence sink — M1 placeholder.
 *
 * Master plan §R2: every completed `execute` emits exactly one primary
 * evidence record (plus optional auxiliaries). The full schema, staleness
 * cascade, and on-disk YAML format belong to `@agenteer/trust/evidence`
 * (sub-plan 04), scheduled for M3. For M1 we expose the interface and an
 * in-memory `MemoryEvidenceSink` so the runtime can emit records and
 * tests can assert on them.
 */

export type EvidenceVerdict = "pass" | "fail" | "inconclusive";

export interface EvidenceInput {
  nodeId: string;
  manifest_id: string;
  lineage_id: string;
  correlation: string;
  timestamp: string;
  duration_ms: number;
  verdict: EvidenceVerdict;
  tool_calls?: Array<{ name: string; args_hash: string; exit_code?: number }>;
  model_calls?: Array<{ model: string; prompt_tokens: number; completion_tokens: number }>;
  /** From NodeResult.evidence when present; runtime synthesizes a default otherwise. */
  delta?: { verdict: EvidenceVerdict; claims?: readonly string[] };
  parent_node_run_id?: string;
  kind?: "llm_call" | "shell_exec" | "validator_run" | "human_prompt" | "meta_run" | "generic";
}

export interface EvidenceRecord extends EvidenceInput {
  id: string;
}

export interface EvidenceSink {
  emit(record: EvidenceInput): Promise<{ id: string }>;
}

export class MemoryEvidenceSink implements EvidenceSink {
  readonly records: EvidenceRecord[] = [];
  private counter = 0;

  async emit(record: EvidenceInput): Promise<{ id: string }> {
    this.counter += 1;
    const id = `EV-${record.timestamp.slice(0, 10).replace(/-/g, "")}-${this.counter.toString().padStart(6, "0")}`;
    this.records.push({ ...record, id });
    return { id };
  }
}
