/**
 * `agenteer install <pkg>` — wraps `@agenteer/registry#installNode`.
 *
 * The library form takes an optional `confirm` callback. The bin supplies
 * a readline-based y/N prompt. Tests inject `autoApprove` or a stubbed
 * confirm.
 */

import * as readline from "node:readline/promises";
import { stdin, stdout } from "node:process";
import {
  installNode,
  type InstallOptions,
  type InstallResult,
} from "@agenteer/registry";

export async function installCommand(opts: InstallOptions): Promise<InstallResult> {
  return installNode(opts);
}

/** Interactive y/N prompt for the CLI bin. */
export async function cliConfirm(summary: {
  summary_text: string;
}): Promise<boolean> {
  const rl = readline.createInterface({ input: stdin, output: stdout });
  try {
    stdout.write(`${summary.summary_text}\n`);
    const ans = (await rl.question(`Proceed? (y/N) `)).trim().toLowerCase();
    return ans === "y" || ans === "yes";
  } finally {
    rl.close();
  }
}

export function renderInstallResult(result: InstallResult): string {
  if (!result.ok) {
    const reason = result.reason ?? "unknown_error";
    const lines = [`install failed: ${reason} (${result.spec})`];
    switch (reason) {
      case "first_party_provenance_required":
        lines.push(
          `  fix: @agenteer/* packages must ship npm provenance attestations.`,
        );
        lines.push(
          `       Publish with 'agenteer publish --provenance' from a GitHub Actions workflow.`,
        );
        break;
      case "third_party_dynamic_actions_requires_confirmation":
        lines.push(
          `  fix: this package declares dynamic_actions: true. --yes is ignored for`,
        );
        lines.push(
          `       third-party dynamic nodes. Re-run interactively, or provide a`,
        );
        lines.push(
          `       confirm callback when calling installNode programmatically.`,
        );
        break;
      case "validation_failed":
        lines.push(
          `  fix: the installed package failed framework.json validation. Try`,
        );
        lines.push(
          `       'agenteer publish --dir <pkg> --dry-run' against the source to see`,
        );
        lines.push(`       the specific issues before re-publishing.`);
        break;
      case "declined_by_user":
        lines.push(`  (no changes written; run again when you're ready to approve.)`);
        break;
    }
    return lines.join("\n");
  }
  const lines = [
    `installed ${result.id}@${result.version} (range ${result.range})`,
    `  manifest_hash: ${result.manifest_hash}`,
  ];
  if (result.diff && result.diff.new_required.length > 0) {
    lines.push(`  note: workflow grants extended with ${result.diff.new_required.length} new cap(s)`);
  }
  if (result.provenance) {
    lines.push(`  provenance: ${result.provenance.present ? "ok" : "missing"}`);
  }
  return lines.join("\n");
}
