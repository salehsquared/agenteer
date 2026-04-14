import type { z } from "zod";

/**
 * Thrown when structured-output generation fails validation after every
 * retry is exhausted (sub-plan 04 §2.2). Carries the last raw output and
 * the last Zod error so the caller can emit useful evidence.
 */
export class StructuredOutputError extends Error {
  constructor(
    public readonly schemaName: string,
    public readonly zodError: z.ZodError,
    public readonly rawOutput: string,
  ) {
    super(
      `structured_output_exhausted:${schemaName} — ${zodError.issues
        .map((i) => `${i.path.join(".") || "<root>"}: ${i.message}`)
        .join("; ")}`,
    );
    this.name = "StructuredOutputError";
  }
}
