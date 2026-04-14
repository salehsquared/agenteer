/**
 * Hard denylist — sub-plan 04 §3.3 (and sub-plan 02 §1.6).
 *
 * Ported from OpenEngine `src/tools/sandbox.ts`. Non-overridable floor:
 * no capability bypasses these paths. Checks run AFTER capability
 * resolution — passing the cap check is necessary but not sufficient.
 */

import { homedir } from "node:os";
import { realpathSync } from "node:fs";
import { resolve, dirname, sep } from "node:path";

const SENSITIVE_SYSTEM: readonly string[] = [
  "/etc",
  "/proc",
  "/sys",
  "/dev",
  "/var/run",
  "/private/etc",
  "/private/var/run",
];

function homeSensitive(): readonly string[] {
  const home = homedir();
  return [
    `${home}/.ssh`,
    `${home}/.gnupg`,
    `${home}/Library/Keychains`,
    `${home}/.aws`,
    `${home}/.kube`,
    `${home}/.docker`,
    `${home}/.config/gh`,
  ];
}

export function defaultDenylist(): readonly string[] {
  return [...SENSITIVE_SYSTEM, ...homeSensitive()];
}

export class DenylistViolation extends Error {
  constructor(
    readonly target: string,
    readonly reason: string,
  ) {
    super(`denylist: ${reason}. target="${target}"`);
  }
}

function resolveReal(target: string): string {
  try {
    return realpathSync(target);
  } catch {
    const parent = dirname(target);
    if (parent === target) return resolve(target);
    const realParent = resolveReal(parent);
    return realParent + target.slice(parent.length);
  }
}

function isWithin(root: string, target: string): boolean {
  const r = resolve(root);
  const t = resolve(target);
  return t === r || t.startsWith(`${r}${sep}`);
}

export interface DenylistCheckerOptions {
  /** Extra absolute-path prefixes this node adds on top of the default floor. */
  extend?: readonly string[];
}

/**
 * DenylistChecker — trust exports the mechanism; the *policy* list is
 * closed in the sense that users can **extend** it but never shrink it
 * (sub-plan 02 §1.6, sub-plan 04 §3.3).
 */
export class DenylistChecker {
  readonly prefixes: readonly string[];

  constructor(options: DenylistCheckerOptions = {}) {
    this.prefixes = [...defaultDenylist(), ...(options.extend ?? [])];
  }

  extend(additional: readonly string[]): DenylistChecker {
    return new DenylistChecker({ extend: [...this.prefixes, ...additional] });
  }

  assertAllowed(targetPath: string): void {
    if (targetPath.includes("\0")) {
      throw new DenylistViolation(targetPath, "null byte in path");
    }
    const abs = resolveReal(resolve(targetPath));
    for (const prefix of this.prefixes) {
      if (isWithin(prefix, abs)) {
        throw new DenylistViolation(targetPath, `within sensitive prefix ${prefix}`);
      }
    }
  }

  isAllowed(targetPath: string): boolean {
    try {
      this.assertAllowed(targetPath);
      return true;
    } catch (err) {
      if (err instanceof DenylistViolation) return false;
      throw err;
    }
  }
}

/** Default shared checker — use this unless a node needs extensions. */
export const DEFAULT_DENYLIST_CHECKER = new DenylistChecker();
