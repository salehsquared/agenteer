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
      const hint = hintForIssueCode(issue.code);
      if (hint) lines.push(`      fix: ${hint}`);
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

function hintForIssueCode(code: string): string | null {
  switch (code) {
    case "bad_package_name":
      return `rename package.json 'name' to match '@<scope>/node-<name>', e.g. '@acme/node-bug-triage'.`;
    case "missing_framework_keyword":
      return `add 'framework-node' to package.json 'keywords' so 'agenteer search' indexes this node.`;
    case "id_mismatch":
      return `align framework.json 'id' with package.json 'name' — they must match exactly.`;
    case "manifest_load_failed":
      return `check framework.json fields; every manifest needs manifest_version:1, id, version, name, description, determinism. See docs/publishing-a-node.md.`;
    default:
      return null;
  }
}
