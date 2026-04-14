/**
 * Filesystem utilities for on-disk context / session persistence.
 *
 * Intentionally duplicates the 30-line helper in `@agenteer/trust/src/util/fs.ts`
 * rather than exposing trust internals as a public subpath export — same
 * contract (atomic write, YAML round-trip), no cross-package coupling.
 */

import { readFile, writeFile, rename, mkdir, readdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { parse, stringify } from "yaml";
import type { z } from "zod";

/** Write file atomically: write to `.tmp`, then rename over the target. */
export async function atomicWriteFile(filePath: string, content: string): Promise<void> {
  const tmpPath = `${filePath}.tmp`;
  await writeFile(tmpPath, content, "utf-8");
  await rename(tmpPath, filePath);
}

export async function ensureDir(dirPath: string): Promise<void> {
  await mkdir(dirPath, { recursive: true });
}

/**
 * Read a YAML file and validate against a Zod schema. Returns null if the
 * file is absent. Any other error is rethrown.
 */
export async function readYaml<T>(
  filePath: string,
  schema: z.ZodType<T>,
): Promise<T | null> {
  let raw: string;
  try {
    raw = await readFile(filePath, "utf-8");
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw err;
  }
  const parsed = parse(raw);
  return schema.parse(parsed);
}

/** Write YAML atomically, creating parent directories. */
export async function writeYaml(filePath: string, data: unknown): Promise<void> {
  await ensureDir(dirname(filePath));
  const yamlStr = stringify(data, { lineWidth: 120 });
  await atomicWriteFile(filePath, yamlStr);
}

/** Append a single line to a file, creating the file/dir as needed. */
export async function appendLine(filePath: string, line: string): Promise<void> {
  await ensureDir(dirname(filePath));
  await writeFile(filePath, `${line}\n`, { flag: "a", encoding: "utf-8" });
}

/** List all entries matching a suffix in a directory, or empty if missing. */
export async function listFiles(dirPath: string, suffix: string): Promise<string[]> {
  try {
    const entries = await readdir(dirPath);
    return entries.filter((e) => e.endsWith(suffix)).map((e) => join(dirPath, e));
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw err;
  }
}
