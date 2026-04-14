/**
 * `@agenteer/node-compile` — deterministic compile validator (sub-plan 03 §6).
 *
 * M4 ships a TypeScript (`tsc`) adapter only; the adapter interface below
 * is what community packages (pyright/clippy/go-build) plug into. Choosing
 * TS-only keeps the surface small and dogfoods from day one.
 *
 * Deterministic given identical project state + invoking flags; results
 * are cacheable on `(manifest, input, ctx_slice)` per sub-plan 00 §11.
 *
 * `shell.exec` is declared statically. The caller-supplied `cwd` decides
 * where tsc runs; capability scope for fs.read is declared dynamically
 * from input.cwd so workflows only hand over the directory that matters.
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
  id: "@agenteer/node-compile",
  name: "compile",
  description:
    "Run a compile step (v1: TypeScript `tsc`). Returns structured issue list; verdict is DATA.",
  determinism: "deterministic",
  required_actions: ["shell.exec:"],
  dynamic_actions: true,
  dynamic_action_spec: "fs.read:${input.cwd}",
  tags: ["validator"],
});

const InputSchema = z.object({
  /** Which language toolchain. v1 ships `typescript` only; `x-*` reserved for community. */
  language: z.enum(["typescript"]),
  cwd: z.string().min(1),
  /** Explicit tsconfig path relative to cwd (default: `tsconfig.json`). */
  tsconfig: z.string().optional(),
  /** Additional flags (e.g. `--incremental false`). */
  flags: z.array(z.string()).default([]),
  timeout_ms: z.number().int().min(1).max(600_000).default(300_000),
});

type Input = z.input<typeof InputSchema>;

export function compileFactory(): Node<Input, ValidatorOutput> {
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
      const { language, cwd, tsconfig, flags } = input.original;
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

      const adapter = ADAPTERS[language];
      const command = adapter.command({ tsconfig, flags: flags ?? [] });

      try {
        const r = await runCommand(command, {
          cwd,
          timeout_ms,
          signal: handle.signal,
        });
        const issues = adapter.parseIssues(r.stdout + "\n" + r.stderr);
        const verdict: ValidatorOutput["verdict"] = r.exit_code === 0 && issues.length === 0 ? "pass" : "fail";
        const out =
          verdict === "pass"
            ? {
                ...passOutput(`${language} compile clean (${r.duration_ms}ms)`),
                exit_code: r.exit_code,
              }
            : failOutput(
                issues.length
                  ? issues
                  : [
                      {
                        message: `${language} exited ${r.exit_code}${r.timed_out ? " (timed out)" : ""}`,
                        severity: "error" as const,
                      },
                    ],
                `${language} compile failed: ${issues.length} issue(s)`,
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

export const compileManifest = MANIFEST;

/**
 * Compile adapter interface — community-extensible.
 *
 * A compile adapter maps an opaque `language` id to (a) a shell command
 * and (b) a stdout/stderr parser that extracts structured issues. The
 * parser must be best-effort: when tool output cannot be parsed, return
 * an empty list and let the exit code carry the verdict.
 */
export interface CompileAdapter {
  readonly language: string;
  command(opts: { tsconfig?: string; flags: readonly string[] }): string;
  parseIssues(combinedOutput: string): ValidatorIssue[];
}

/** tsc issue regex — `path(line,col): error TSxxxx: message`. */
const TSC_ISSUE_RE = /^(.+?)\((\d+),(\d+)\):\s+(error|warning)\s+TS\d+:\s+(.*)$/gm;

const TYPESCRIPT_ADAPTER: CompileAdapter = {
  language: "typescript",
  command(opts) {
    const tsconfigArg = opts.tsconfig ? `--project ${JSON.stringify(opts.tsconfig)}` : "";
    const extra = opts.flags.join(" ");
    return `npx -y tsc --noEmit ${tsconfigArg} ${extra}`.replace(/\s+/g, " ").trim();
  },
  parseIssues(output) {
    const issues: ValidatorIssue[] = [];
    for (const m of output.matchAll(TSC_ISSUE_RE)) {
      const [, file, line, col, sev, msg] = m;
      issues.push({
        path: `${file}:${line}:${col}`,
        message: msg!.trim(),
        code: "TS",
        severity: sev === "warning" ? "warning" : "error",
      });
    }
    return issues;
  },
};

const ADAPTERS: Record<Input["language"], CompileAdapter> = {
  typescript: TYPESCRIPT_ADAPTER,
};
