/**
 * Filesystem utilities used by trust's YAML stores. Ported verbatim from
 * OpenEngine `src/utils/fs.ts`. Atomic writes matter: a crash mid-write
 * must not leave a half-serialized evidence file.
 */

import { readFile, writeFile, rename, mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { parse, stringify } from "yaml";
import type { z } from "zod";

/** Write a file atomically: write to `.tmp`, then rename. */
export async function atomicWriteFile(filePath: string, content: string): Promise<void> {
  const tmpPath = `${filePath}.tmp`;
  await writeFile(tmpPath, content, "utf-8");
  await rename(tmpPath, filePath);
}

/** mkdir -p */
export async function ensureDir(dirPath: string): Promise<void> {
  await mkdir(dirPath, { recursive: true });
}

/** Read a YAML file and validate it against a Zod schema. null if file absent. */
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

/** Write YAML atomically, creating parent directories as needed. */
export async function writeYaml(filePath: string, data: unknown): Promise<void> {
  await ensureDir(dirname(filePath));
  const yamlStr = stringify(data, { lineWidth: 120 });
  await atomicWriteFile(filePath, yamlStr);
}
