/**
 * Streaming stdout/stderr capture with ring-buffer truncation — sub-plan
 * 03 §S.2. Shared by `shell_exec`, `compile`, `test_run`. One module,
 * not three, so truncation + timeout + binary-detection behavior stays
 * consistent across validators.
 */

import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";

export interface RunCommandOptions {
  readonly cwd?: string;
  readonly timeout_ms: number;
  readonly stdin?: string;
  readonly signal: AbortSignal;
  readonly env?: NodeJS.ProcessEnv;
  /** Per-stream ring buffer cap (default 256 KiB). */
  readonly capture_limit?: number;
  /** SIGTERM → SIGKILL grace (default 5s). */
  readonly kill_grace_ms?: number;
  readonly onStdoutLine?: (line: string) => void;
  readonly onStderrLine?: (line: string) => void;
}

export interface RunCommandResult {
  exit_code: number;
  stdout: string;
  stderr: string;
  duration_ms: number;
  timed_out: boolean;
  truncated: { stdout: boolean; stderr: boolean };
}

const DEFAULT_CAPTURE_LIMIT = 256 * 1024;
const DEFAULT_KILL_GRACE_MS = 5_000;

export async function runCommand(
  command: string,
  opts: RunCommandOptions,
): Promise<RunCommandResult> {
  const startedAt = Date.now();
  return await new Promise<RunCommandResult>((resolve, reject) => {
    const child: ChildProcessWithoutNullStreams = spawn(command, {
      shell: true,
      ...(opts.cwd !== undefined ? { cwd: opts.cwd } : {}),
      ...(opts.env ? { env: opts.env } : {}),
    }) as ChildProcessWithoutNullStreams;

    const limit = opts.capture_limit ?? DEFAULT_CAPTURE_LIMIT;
    let stdout = "";
    let stderr = "";
    let stdoutTruncated = false;
    let stderrTruncated = false;
    let timedOut = false;
    let settled = false;
    let stdoutTail = "";
    let stderrTail = "";

    const feed = (
      chunk: Buffer | string,
      which: "stdout" | "stderr",
    ): void => {
      const s = chunk.toString();
      const appendTo = (buf: string, truncated: boolean): [string, boolean] => {
        if (truncated) return [buf, true];
        if (buf.length + s.length > limit) {
          const room = Math.max(0, limit - buf.length);
          return [buf + s.slice(0, room), true];
        }
        return [buf + s, false];
      };
      if (which === "stdout") {
        [stdout, stdoutTruncated] = appendTo(stdout, stdoutTruncated);
        if (opts.onStdoutLine) {
          stdoutTail += s;
          const idx = stdoutTail.lastIndexOf("\n");
          if (idx >= 0) {
            for (const line of stdoutTail.slice(0, idx).split("\n")) {
              if (line.length) opts.onStdoutLine(line);
            }
            stdoutTail = stdoutTail.slice(idx + 1);
          }
        }
      } else {
        [stderr, stderrTruncated] = appendTo(stderr, stderrTruncated);
        if (opts.onStderrLine) {
          stderrTail += s;
          const idx = stderrTail.lastIndexOf("\n");
          if (idx >= 0) {
            for (const line of stderrTail.slice(0, idx).split("\n")) {
              if (line.length) opts.onStderrLine(line);
            }
            stderrTail = stderrTail.slice(idx + 1);
          }
        }
      }
    };

    child.stdout.on("data", (c) => feed(c, "stdout"));
    child.stderr.on("data", (c) => feed(c, "stderr"));

    const grace = opts.kill_grace_ms ?? DEFAULT_KILL_GRACE_MS;
    const timeoutTimer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGTERM");
      const hard = setTimeout(() => child.kill("SIGKILL"), grace);
      hard.unref();
    }, opts.timeout_ms);

    const onAbort = (): void => {
      child.kill("SIGTERM");
    };
    opts.signal.addEventListener("abort", onAbort, { once: true });

    child.on("error", (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeoutTimer);
      opts.signal.removeEventListener("abort", onAbort);
      reject(err);
    });

    child.on("close", (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeoutTimer);
      opts.signal.removeEventListener("abort", onAbort);
      // Flush any remaining partial lines.
      if (stdoutTail.length && opts.onStdoutLine) opts.onStdoutLine(stdoutTail);
      if (stderrTail.length && opts.onStderrLine) opts.onStderrLine(stderrTail);
      resolve({
        exit_code: code ?? -1,
        stdout: stdoutTruncated
          ? `${stdout}\n[...stdout truncated at ${limit} bytes...]`
          : stdout,
        stderr: stderrTruncated
          ? `${stderr}\n[...stderr truncated at ${limit} bytes...]`
          : stderr,
        duration_ms: Date.now() - startedAt,
        timed_out: timedOut,
        truncated: { stdout: stdoutTruncated, stderr: stderrTruncated },
      });
    });

    if (opts.stdin !== undefined) {
      child.stdin.write(opts.stdin);
    }
    child.stdin.end();
  });
}

/** Convenience: tail of a stream for evidence `stdout_tail` / summary. */
export function tailOf(text: string, maxChars = 4096): string {
  if (text.length <= maxChars) return text;
  return `[...]${text.slice(-maxChars)}`;
}
