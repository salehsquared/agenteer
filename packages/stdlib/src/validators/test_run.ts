/**
 * `@agenteer/node-test-run` — deterministic test-suite validator
 * (sub-plan 03 §7).
 *
 * M4 ships a vitest adapter. Runs `vitest run --reporter=json` in the
 * declared cwd, parses per-test results, surfaces failures as structured
 * issues. Verdict is DATA; `Failed` is reserved for "couldn't run at all"
 * (binary missing, denylist, capability denied).
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
  id: "@agenteer/node-test-run",
  name: "test_run",
  description: "Run a test suite (v1: vitest). Returns structured per-test failures.",
  determinism: "deterministic",
  required_actions: ["shell.exec:"],
  dynamic_actions: true,
  dynamic_action_spec: "fs.read:${input.cwd}",
  tags: ["validator"],
});

const InputSchema = z.object({
  framework: z.enum(["vitest"]),
  cwd: z.string().min(1),
  /** Optional test name or path filter. */
  filter: z.string().optional(),
  flags: z.array(z.string()).default([]),
  timeout_ms: z.number().int().min(1).max(1_800_000).default(600_000),
});

type Input = z.input<typeof InputSchema>;

export function testRunFactory(): Node<Input, ValidatorOutput> {
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
      const { framework, cwd, filter, flags } = input.original;
      const timeout_ms = input.original.timeout_ms ?? 600_000;

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

      const adapter = ADAPTERS[framework];
      const command = adapter.command({ ...(filter !== undefined ? { filter } : {}), flags: flags ?? [] });

      try {
        const r = await runCommand(command, { cwd, timeout_ms, signal: handle.signal });
        const parsed = adapter.parseReport(r.stdout, r.stderr);
        const failed = parsed.issues.filter((i) => i.severity === "error");
        const verdict: ValidatorOutput["verdict"] =
          r.exit_code === 0 && failed.length === 0 ? "pass" : "fail";

        const out: ValidatorOutput =
          verdict === "pass"
            ? {
                ...passOutput(`${framework} passed (${parsed.testCount} tests, ${r.duration_ms}ms)`),
                exit_code: r.exit_code,
              }
            : failOutput(
                parsed.issues.length
                  ? parsed.issues
                  : [
                      {
                        message: `${framework} exited ${r.exit_code}${r.timed_out ? " (timed out)" : ""}`,
                        severity: "error",
                      },
                    ],
                `${framework}: ${failed.length} test(s) failed`,
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

export const testRunManifest = MANIFEST;

export interface TestReport {
  testCount: number;
  issues: ValidatorIssue[];
}

export interface TestAdapter {
  readonly framework: string;
  command(opts: { filter?: string; flags: readonly string[] }): string;
  parseReport(stdout: string, stderr: string): TestReport;
}

/** Parse Vitest's `--reporter=json` output when it's present; fall back to stdout. */
const VITEST_ADAPTER: TestAdapter = {
  framework: "vitest",
  command(opts) {
    const filter = opts.filter ? ` ${JSON.stringify(opts.filter)}` : "";
    const extra = opts.flags.join(" ");
    return `npx -y vitest run --reporter=json${filter} ${extra}`.replace(/\s+/g, " ").trim();
  },
  parseReport(stdout, _stderr) {
    const json = extractLastJson(stdout);
    if (!json) return { testCount: 0, issues: [] };
    const issues: ValidatorIssue[] = [];
    let testCount = 0;
    type TestResult = {
      name?: string;
      fullName?: string;
      status?: string;
      failureMessages?: string[];
    };
    const testResults: Array<{ testResults?: TestResult[]; name?: string }> =
      (json as { testResults?: Array<{ testResults?: TestResult[]; name?: string }> }).testResults ??
      [];
    for (const file of testResults) {
      for (const t of file.testResults ?? []) {
        testCount += 1;
        if (t.status === "failed") {
          issues.push({
            path: `${file.name ?? "<file>"}::${t.fullName ?? t.name ?? "<test>"}`,
            message: (t.failureMessages ?? ["failed"]).join("\n"),
            code: "test_failed",
            severity: "error",
          });
        }
      }
    }
    return { testCount, issues };
  },
};

const ADAPTERS: Record<Input["framework"], TestAdapter> = {
  vitest: VITEST_ADAPTER,
};

function extractLastJson(text: string): unknown | null {
  // Vitest prints the JSON report on its own line; a few noisy warnings
  // can precede it. Walk backwards and take the last balanced `{...}`.
  const idx = text.lastIndexOf("}");
  if (idx < 0) return null;
  let depth = 0;
  for (let i = idx; i >= 0; i -= 1) {
    const ch = text[i];
    if (ch === "}") depth += 1;
    else if (ch === "{") depth -= 1;
    if (depth === 0) {
      try {
        return JSON.parse(text.slice(i, idx + 1));
      } catch {
        return null;
      }
    }
  }
  return null;
}
