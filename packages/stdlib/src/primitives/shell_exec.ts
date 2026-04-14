/**
 * `@agenteer/node-shell-exec` — permissioned subprocess (sub-plan 03 §5).
 *
 * `shell.exec` is intentionally coarse (sub-plan 02 §1.1.4). Dispatch
 * checks capability + denylist on cwd; the runtime's §R1 snapshot wrap
 * catches writes that escape the declared `fs.write` scope. Streaming
 * stdout/stderr uses the shared capture utility so `compile` / `test_run`
 * behave identically.
 */

import { z } from "zod";
import {
  authorizeOperation,
  assertNotDenied,
  makeManifest,
  type Node,
  type NodeInput,
  type NodeManifest,
  type NodeResult,
  type NodeRuntimeHandle,
} from "@agenteer/core";
import { runCommand, tailOf } from "../shared/index.js";

const MANIFEST: NodeManifest = makeManifest({
  id: "@agenteer/node-shell-exec",
  name: "shell_exec",
  description: "Execute a shell command. Captures stdout/stderr/exit_code. Coarse-grained.",
  determinism: "stochastic",
  required_actions: ["shell.exec:"],
  tags: ["primitive", "shell"],
});

const InputSchema = z.object({
  command: z.string().min(1),
  cwd: z.string().optional(),
  timeout_ms: z.number().int().min(1).max(600_000).default(120_000),
  stdin: z.string().optional(),
});

const OutputSchema = z.object({
  exit_code: z.number().int(),
  stdout: z.string(),
  stderr: z.string(),
  duration_ms: z.number().int().nonnegative(),
  timed_out: z.boolean(),
});

type Input = z.input<typeof InputSchema>;
type Output = z.infer<typeof OutputSchema>;

export function shellExecFactory(): Node<Input, Output> {
  return {
    manifest: MANIFEST,
    inputSchema: InputSchema,
    outputSchema: OutputSchema,
    ctx: [],
    model: null,
    async execute(input: NodeInput<Input>, handle: NodeRuntimeHandle): Promise<NodeResult<Output>> {
      const { command, cwd, stdin } = input.original;
      const timeout_ms = input.original.timeout_ms ?? 120_000;

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
      if (cwd) {
        try {
          assertNotDenied(cwd);
        } catch (err) {
          return {
            kind: "failed",
            reason: err instanceof Error ? err.message : String(err),
            retryable: false,
            evidence: { verdict: "fail" },
          };
        }
      }

      try {
        const r = await runCommand(command, {
          ...(cwd !== undefined ? { cwd } : {}),
          ...(stdin !== undefined ? { stdin } : {}),
          timeout_ms,
          signal: handle.signal,
        });
        return {
          kind: "output",
          value: {
            exit_code: r.exit_code,
            stdout: r.stdout,
            stderr: r.stderr,
            duration_ms: r.duration_ms,
            timed_out: r.timed_out,
          },
          evidence: {
            verdict: r.exit_code === 0 && !r.timed_out ? "pass" : "fail",
            tool_output: {
              command,
              exit_code: r.exit_code,
              stdout_tail: tailOf(r.stdout),
            },
          },
        };
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

export const shellExecManifest = MANIFEST;
