/**
 * `@agenteer/node-typecheck` — thin wrapper over `compile` with
 * types-only flags (sub-plan 03 §10).
 *
 * v1 supports TypeScript (`tsc --noEmit --strict`). The wrapper exists
 * separately from `compile` so planners can distinguish "types only"
 * from "full build"; the underlying adapter is shared.
 */

import { z } from "zod";
import {
  makeManifest,
  type Node,
  type NodeInput,
  type NodeManifest,
  type NodeResult,
  type NodeRuntimeHandle,
  authorizeOperation,
} from "@agenteer/core";
import {
  failOutput,
  passOutput,
  runCommand,
  tailOf,
  ValidatorOutputSchema,
  type ValidatorIssue,
  type ValidatorOutput,
} from "../shared/index.js";

const MANIFEST: NodeManifest = makeManifest({
  id: "@agenteer/node-typecheck",
  name: "typecheck",
  description: "Types-only check (v1: TypeScript tsc --noEmit --strict).",
  determinism: "deterministic",
  required_actions: ["shell.exec:"],
  dynamic_actions: true,
  dynamic_action_spec: "fs.read:${input.cwd}",
  tags: ["validator"],
});

const InputSchema = z.object({
  language: z.enum(["typescript"]),
  cwd: z.string().min(1),
  tsconfig: z.string().optional(),
  strict: z.boolean().default(true),
  timeout_ms: z.number().int().min(1).max(600_000).default(300_000),
});

type Input = z.input<typeof InputSchema>;

const TSC_ISSUE_RE = /^(.+?)\((\d+),(\d+)\):\s+(error|warning)\s+TS\d+:\s+(.*)$/gm;

export function typecheckFactory(): Node<Input, ValidatorOutput> {
  return {
    manifest: MANIFEST,
    inputSchema: InputSchema,
    outputSchema: ValidatorOutputSchema,
    ctx: [],
    model: null,
    async execute(
      input: NodeInput<Input>,
      handle: NodeRuntimeHandle,
    ): Promise<NodeResult<ValidatorOutput>> {
      const { cwd, tsconfig } = input.original;
      const strict = input.original.strict ?? true;
      const timeout_ms = input.original.timeout_ms ?? 300_000;

      try {
        authorizeOperation(handle.granted, { kind: "shell.exec" });
      } catch (err) {
        return {
          kind: "failed",
          reason: `permission_denied: ${err instanceof Error ? err.message : String(err)}`,
          retryable: false,
          evidence: { verdict: "fail" },
        };
      }

      const tsconfigArg = tsconfig ? `--project ${JSON.stringify(tsconfig)}` : "";
      const strictFlag = strict ? "--strict" : "";
      const command = `npx -y tsc --noEmit ${tsconfigArg} ${strictFlag}`.replace(/\s+/g, " ").trim();

      try {
        const r = await runCommand(command, { cwd, timeout_ms, signal: handle.signal });
        const combined = `${r.stdout}\n${r.stderr}`;
        const issues: ValidatorIssue[] = [];
        for (const m of combined.matchAll(TSC_ISSUE_RE)) {
          issues.push({
            path: `${m[1]}:${m[2]}:${m[3]}`,
            message: m[5]!.trim(),
            code: "TS",
            severity: m[4] === "warning" ? "warning" : "error",
          });
        }
        const verdict: ValidatorOutput["verdict"] = r.exit_code === 0 && issues.length === 0 ? "pass" : "fail";
        const out: ValidatorOutput =
          verdict === "pass"
            ? { ...passOutput(`typecheck clean (${r.duration_ms}ms)`), exit_code: r.exit_code }
            : failOutput(
                issues.length ? issues : [{ message: `tsc exited ${r.exit_code}`, severity: "error" }],
                `typecheck: ${issues.length} issue(s)`,
                {
                  exit_code: r.exit_code,
                  stdout_tail: tailOf(r.stdout),
                  stderr_tail: tailOf(r.stderr),
                },
              );
        return { kind: "output", value: out, evidence: { verdict } };
      } catch (err) {
        return {
          kind: "failed",
          reason: err instanceof Error ? err.message : String(err),
          retryable: true,
          evidence: { verdict: "fail" },
        };
      }
    },
  };
}

export const typecheckManifest = MANIFEST;
