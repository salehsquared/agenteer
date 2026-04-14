/**
 * Stdin-based resolvers for interactive CLI resume.
 *
 * When the CLI resumes a session with pending prompts that have no recorded
 * answer yet, it streams them to stdout and reads stdin via `readline`.
 * Tests never exercise this path — they pass their own resolvers.
 *
 * For `approval_gate`, the resolver loops until it reads a valid
 * approve/deny answer. For `ask_user`, any non-empty string is accepted.
 */

import * as readline from "node:readline/promises";
import { stdin, stdout } from "node:process";
import type { ApprovalResolver, AskUserResolver } from "@agenteer/stdlib";

/** One-shot readline question; closes its own interface. */
async function question(prompt: string): Promise<string> {
  const rl = readline.createInterface({ input: stdin, output: stdout });
  try {
    const raw = await rl.question(prompt);
    return raw.trim();
  } finally {
    rl.close();
  }
}

export function stdinApprovalResolver(): ApprovalResolver {
  return {
    resolve({ prompt }) {
      return null; // synchronous contract — defer via NeedsUser, CLI handles later
    },
  };
}

export function stdinAskUserResolver(): AskUserResolver {
  return {
    resolve() {
      return null;
    },
  };
}

/**
 * Prompt stdin for an answer to a pending prompt. Returns a string for
 * ask_user or "approve"/"deny" for approval_gate.
 */
export async function promptForAnswer(opts: {
  manifestId: string;
  prompt: string;
}): Promise<string> {
  if (opts.manifestId === "@agenteer/node-approval-gate") {
    for (;;) {
      const ans = await question(`${opts.prompt} [approve/deny] `);
      const norm = ans.toLowerCase();
      if (norm === "approve" || norm === "a" || norm === "y" || norm === "yes") {
        return "approve";
      }
      if (norm === "deny" || norm === "d" || norm === "n" || norm === "no") {
        return "deny";
      }
      stdout.write(`  (please answer approve/deny)\n`);
    }
  }
  for (;;) {
    const ans = await question(`${opts.prompt}\n> `);
    if (ans.length > 0) return ans;
    stdout.write(`  (non-empty answer required)\n`);
  }
}
