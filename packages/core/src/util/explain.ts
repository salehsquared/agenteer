/**
 * Human-readable explanations for the framework's most common failure
 * modes. Intended to be called from CLI error paths so users see an
 * actionable message instead of a stack trace.
 *
 *   explainPermissionDenial — turns a kernel deny into "node X wanted
 *   cap Y; your workflow grants only Z. Add the cap or attenuate."
 *
 *   explainManifestError — turns a Zod-validation bundle of issues into
 *   path-annotated per-field hints with concrete fix text.
 *
 * These are library helpers (pure functions, no IO). The CLI's render
 * layer decides when to call them.
 */

import type { Capability } from "../permissions/capability.js";
import type { AuthorizeSpawnDeny } from "../permissions/kernel.js";
import type { ZodError } from "zod";

export function explainPermissionDenial(args: {
  denial: AuthorizeSpawnDeny;
  childManifestId: string;
  grantedCaps: readonly string[];
  /** Optional: where the denial happened — "root spawn", "child spawn", etc. */
  context?: string;
}): string {
  const lines: string[] = [];
  const where = args.context ?? "spawn";
  lines.push(
    `Permission denied at ${where}: node '${args.childManifestId}' requires capabilities that exceed the parent's effective grants.`,
  );
  if (args.denial.missing.length > 0) {
    lines.push(`  Missing caps (not covered by parent):`);
    for (const c of args.denial.missing) {
      lines.push(`    - ${c.raw}`);
    }
  }
  if (args.grantedCaps.length > 0) {
    lines.push(`  Parent grants ${args.grantedCaps.length} cap(s):`);
    for (const c of args.grantedCaps) lines.push(`    - ${c}`);
  } else {
    lines.push(`  Parent has NO grants.`);
  }
  lines.push(`  Fix options:`);
  lines.push(`    (a) Add the missing caps to the workflow's root grants.`);
  lines.push(`    (b) Attenuate the spawn: pass a narrower 'attenuate' on NodeSpawn`);
  lines.push(`        so the missing caps are explicitly disclaimed.`);
  lines.push(`    (c) Narrow the node's framework.json required_actions so it only`);
  lines.push(`        requests caps it actually uses at dispatch time.`);
  return lines.join("\n");
}

export interface ExplainedIssue {
  path: string;
  message: string;
  hint?: string;
}

/**
 * Convert a Zod `issues` array (from ManifestValidationError) into per-
 * issue annotated entries with targeted hints for the most common
 * manifest errors.
 */
export function explainManifestIssues(issues: ZodError["issues"]): ExplainedIssue[] {
  return issues.map((i) => {
    const path = i.path.join(".") || "<root>";
    const base: ExplainedIssue = { path, message: i.message };
    const hint = hintForIssue(path, i.message);
    if (hint) base.hint = hint;
    return base;
  });
}

export function renderExplainedIssues(issues: readonly ExplainedIssue[]): string {
  if (issues.length === 0) return "  (no issues)";
  const lines: string[] = [];
  for (const i of issues) {
    lines.push(`  - [${i.path}] ${i.message}`);
    if (i.hint) lines.push(`      hint: ${i.hint}`);
  }
  return lines.join("\n");
}

function hintForIssue(path: string, message: string): string | null {
  if (path === "id" || message.includes("id must match")) {
    return `expected '@<scope>/node-<name>' (e.g. '@acme/node-bug-triage'). Check your package.json name too — they must match.`;
  }
  if (path === "version" || message.includes("semver")) {
    return `version must be semver (e.g. '1.2.0'). Bare '1.2' or pre-release suffixes must follow semver.org.`;
  }
  if (path.startsWith("required_actions")) {
    return `required_actions entries must be capability strings like 'fs.read:/tmp/**', 'net.http:api.example.com/**', 'model:claude-*', 'spawn:@scope/node-*', 'tool:gh'. No regex; globs only.`;
  }
  if (path === "dynamic_action_spec" && message.includes("required")) {
    return `when dynamic_actions: true, dynamic_action_spec must declare the template, e.g. 'tool:\${input.tool_name}'.`;
  }
  if (path === "dynamic_actions" && message.includes("only valid")) {
    return `dynamic_action_spec requires dynamic_actions: true. Set the flag or drop the spec.`;
  }
  if (path.startsWith("side_effects")) {
    return `side_effects must be an object with booleans: { writes_fs, network, mutates_ctx, emits_ctx_variants[], reads_ctx_variants[] }. Missing fields default to false/[].`;
  }
  if (path === "manifest_version") {
    return `manifest_version must be the literal number 1 at v1 (pending a framework-level bump).`;
  }
  if (path.startsWith("tags")) {
    return `tags must match /^[a-z][a-z0-9-]*$/ — lowercase, hyphens only.`;
  }
  return null;
}
