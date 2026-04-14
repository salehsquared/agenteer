/**
 * `@agenteer/node-shell-exec` — permissioned subprocess (sub-plan 03 §5).
 *
 * `shell.exec` is intentionally coarse (sub-plan 02 §1.1.4). At M2 we
 * enforce capability + denylist on cwd; snapshot-verify of fs.write scope
 * per §R1 lands with `@agenteer/trust/access` in M3.
 */

import { spawn } from "node:child_process";
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

const STDOUT_LIMIT = 256 * 1024; // sub-plan 03 §S.2
const STDERR_LIMIT = 256 * 1024;

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
      // Capability gate (shell.exec:).
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
      // Denylist on cwd (other paths are caught by fs primitives when used).
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

      const start = Date.now();
      return await runCommand(command, { cwd, timeout_ms, stdin, signal: handle.signal }).then(
        (r) => ({
          kind: "output" as const,
          value: { ...r, duration_ms: Date.now() - start },
          evidence: {
            verdict: r.exit_code === 0 ? ("pass" as const) : ("fail" as const),
            tool_output: { command, exit_code: r.exit_code, stdout_tail: r.stdout.slice(-4096) },
          },
        }),
        (err: unknown) => ({
          kind: "failed" as const,
          reason: err instanceof Error ? err.message : String(err),
          retryable: true,
          evidence: { verdict: "fail" as const },
        }),
      );
    },
  };
}

export const shellExecManifest = MANIFEST;

interface RunResult {
  exit_code: number;
  stdout: string;
  stderr: string;
  timed_out: boolean;
}

async function runCommand(
  command: string,
  opts: { cwd?: string; timeout_ms: number; stdin?: string; signal: AbortSignal },
): Promise<RunResult> {
  return await new Promise<RunResult>((resolve, reject) => {
    const child = spawn(command, {
      shell: true,
      cwd: opts.cwd,
    });

    let stdout = "";
    let stderr = "";
    let stdoutTruncated = false;
    let stderrTruncated = false;
    let timedOut = false;
    let settled = false;

    child.stdout?.on("data", (chunk: Buffer | string) => {
      const s = chunk.toString();
      if (stdout.length + s.length > STDOUT_LIMIT) {
        const room = Math.max(0, STDOUT_LIMIT - stdout.length);
        stdout += s.slice(0, room);
        stdoutTruncated = true;
      } else {
        stdout += s;
      }
    });
    child.stderr?.on("data", (chunk: Buffer | string) => {
      const s = chunk.toString();
      if (stderr.length + s.length > STDERR_LIMIT) {
        const room = Math.max(0, STDERR_LIMIT - stderr.length);
        stderr += s.slice(0, room);
        stderrTruncated = true;
      } else {
        stderr += s;
      }
    });

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGTERM");
      const grace = setTimeout(() => child.kill("SIGKILL"), 5000);
      grace.unref();
    }, opts.timeout_ms);

    const onAbort = () => {
      child.kill("SIGTERM");
    };
    opts.signal.addEventListener("abort", onAbort, { once: true });

    child.on("error", (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      opts.signal.removeEventListener("abort", onAbort);
      reject(err);
    });

    child.on("close", (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      opts.signal.removeEventListener("abort", onAbort);
      resolve({
        exit_code: code ?? -1,
        stdout: stdoutTruncated ? stdout + "\n[...stdout truncated...]" : stdout,
        stderr: stderrTruncated ? stderr + "\n[...stderr truncated...]" : stderr,
        timed_out: timedOut,
      });
    });

    if (opts.stdin !== undefined) {
      child.stdin?.write(opts.stdin);
    }
    child.stdin?.end();
  });
}
