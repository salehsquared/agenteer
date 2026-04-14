/**
 * Hard denylist — non-overridable floor. Sub-plan 02 §1.6. Port of
 * OpenEngine's `SENSITIVE_PREFIXES` / `HOME_SENSITIVE_PATHS`.
 *
 * Denylist checks run AFTER capability resolution. Passing the cap check
 * is necessary but not sufficient — these bytes are off-limits even with
 * `fs.*:*` or `shell.exec`.
 *
 * Denylist is hardcoded at v1 (open question #8 in sub-plan 02); user
 * additions via workflow config are a later concern.
 */

import { homedir } from "node:os";
import { realpathSync } from "node:fs";
import { resolve, dirname, sep } from "node:path";

const SENSITIVE_PREFIXES: readonly string[] = [
  resolve("/etc"),
  resolve("/proc"),
  resolve("/sys"),
  resolve("/dev"),
  resolve("/var/run"),
  resolve("/private/etc"),
  resolve("/private/var/run"),
];

function homeSensitivePaths(): readonly string[] {
  const home = homedir();
  return [
    resolve(home, ".ssh"),
    resolve(home, ".gnupg"),
    resolve(home, "Library", "Keychains"),
    resolve(home, ".aws"),
    resolve(home, ".kube"),
    resolve(home, ".docker"),
    resolve(home, ".config", "gh"),
  ];
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
    const basename = target.slice(parent.length);
    return realParent + basename;
  }
}

function isWithin(root: string, target: string): boolean {
  const r = resolve(root);
  const t = resolve(target);
  return t === r || t.startsWith(`${r}${sep}`);
}

/**
 * Throws `DenylistViolation` if the target resolves under a sensitive
 * prefix. Symlink-following. Safe to call with non-existent files (write
 * targets).
 */
export function assertNotDenied(targetPath: string): void {
  if (targetPath.includes("\0")) {
    throw new DenylistViolation(targetPath, "null byte in path");
  }
  const abs = resolveReal(resolve(targetPath));
  for (const prefix of SENSITIVE_PREFIXES) {
    if (isWithin(prefix, abs)) {
      throw new DenylistViolation(targetPath, `within sensitive system prefix ${prefix}`);
    }
  }
  for (const prefix of homeSensitivePaths()) {
    if (isWithin(prefix, abs)) {
      throw new DenylistViolation(targetPath, `within sensitive home prefix ${prefix}`);
    }
  }
}

/** Non-throwing variant for callers that want to report cleanly. */
export function isDenied(targetPath: string): { denied: boolean; reason?: string } {
  try {
    assertNotDenied(targetPath);
    return { denied: false };
  } catch (err) {
    if (err instanceof DenylistViolation) return { denied: true, reason: err.message };
    throw err;
  }
}
