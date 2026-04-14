/**
 * `agenteer publish` — wraps `@agenteer/registry#publishNode`.
 * Library form returns the result object; the bin renders it.
 */

import { publishNode, type PublishOptions, type PublishResult } from "@agenteer/registry";

export async function publishCommand(opts: PublishOptions): Promise<PublishResult> {
  return publishNode(opts);
}

export function renderPublishResult(result: PublishResult): string {
  if (!result.ok) {
    const lines = [`publish failed:`];
    for (const issue of result.validation.issues) {
      lines.push(`  [${issue.code}] ${issue.message}`);
    }
    return lines.join("\n");
  }
  const lines = [
    `published ${result.manifest_id}@${result.version}`,
    `  manifest_hash: ${result.manifest_hash}`,
    `  provenance:    ${result.provenance_enabled ? "enabled" : "disabled"}`,
  ];
  if (result.dry_run) lines.push(`  (dry-run — no tarball uploaded)`);
  return lines.join("\n");
}
