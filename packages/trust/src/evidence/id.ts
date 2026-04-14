/**
 * Evidence ID generation — sub-plan 04 §1.2.
 *
 * Format: `EV-YYYYMMDD-<sha256[0..12]>`. 12 hex = 48 bits — matches
 * sub-plan 01's `ctx_YYYYMMDD_<12hex>` cousin and widens OE's original
 * 6 hex to reduce collision risk at framework scale.
 */

import { createHash } from "node:crypto";

export interface HashInputs {
  command: string;
  verdict: string;
  timestamp: string;
  nodeId?: string;
  nodeRunId?: string;
  contentHash?: string;
}

export function generateEvidenceId(inputs: HashInputs): string {
  const payload = [
    inputs.command,
    inputs.verdict,
    inputs.timestamp,
    inputs.nodeId ?? "",
    inputs.nodeRunId ?? "",
    inputs.contentHash ?? "",
  ].join("|");
  const hash = createHash("sha256").update(payload).digest("hex").slice(0, 12);
  const date = inputs.timestamp.slice(0, 10).replace(/-/g, "");
  return `EV-${date}-${hash}`;
}

export function nextDedupeSuffix(base: string, existing: ReadonlySet<string>): string {
  if (!existing.has(base)) return base;
  let n = 2;
  while (existing.has(`${base}-${n}`)) n += 1;
  return `${base}-${n}`;
}
