/**
 * schemaToPromptDescription — renders a Zod schema as a readable skeleton
 * for the text-parse-retry path. Ported from OpenEngine's structured.ts.
 * Uses Zod 4's `z.toJSONSchema`.
 */

import { z } from "zod";

interface JsonSchemaNode {
  type?: string;
  properties?: Record<string, JsonSchemaNode>;
  items?: JsonSchemaNode;
  enum?: unknown[];
  const?: unknown;
  required?: string[];
  anyOf?: JsonSchemaNode[];
  oneOf?: JsonSchemaNode[];
  description?: string;
  [k: string]: unknown;
}

export function schemaToPromptDescription(schema: z.ZodType): string {
  try {
    const jsonSchema = z.toJSONSchema(schema) as JsonSchemaNode;
    return describe(jsonSchema, 0);
  } catch {
    return "# (schema description unavailable)";
  }
}

function describe(node: JsonSchemaNode, indent: number): string {
  const pad = "  ".repeat(indent);

  if (node.anyOf || node.oneOf) {
    const variants = (node.anyOf ?? node.oneOf ?? []).filter((v) => v.type !== "null");
    if (variants.length === 1) {
      return describe(variants[0]!, indent) + " (optional)";
    }
    const descs = variants.map((v) => describe(v, indent + 1));
    return `${pad}# one of:\n${descs.join("\n")}`;
  }

  if (node.const !== undefined) {
    return `${pad}# exactly: ${JSON.stringify(node.const)}`;
  }
  if (node.enum) {
    return `${pad}# one of: ${node.enum.map(String).join(", ")}`;
  }

  switch (node.type) {
    case "object": {
      const props = node.properties ?? {};
      const required = new Set(node.required ?? []);
      const lines = Object.entries(props).map(([key, val]) => {
        const opt = required.has(key) ? "" : " (optional)";
        return `${pad}${key}:${opt}\n${describe(val, indent + 1)}`;
      });
      return lines.length ? lines.join("\n") : `${pad}# object`;
    }
    case "array":
      return `${pad}# array of:\n${describe(node.items ?? { type: "string" }, indent + 1)}`;
    case "string":
      return `${pad}# string${node.description ? " — " + node.description : ""}`;
    case "number":
    case "integer":
      return `${pad}# number`;
    case "boolean":
      return `${pad}# boolean`;
    default:
      return `${pad}# ${node.type ?? "unknown"}`;
  }
}

export function formatZodErrors(error: z.ZodError): string {
  return error.issues
    .map((i) => {
      const path = i.path.length ? i.path.join(".") : "(root)";
      return `- ${path}: ${i.message}`;
    })
    .join("\n");
}

/** Strip Markdown code fences (```yaml ... ```). */
export function stripFences(raw: string): string {
  return raw
    .replace(/^```(?:ya?ml|json)?\s*\n?/m, "")
    .replace(/\n?```\s*$/m, "")
    .trim();
}
