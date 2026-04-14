/**
 * Node manifest schema — sub-plan 02 §2.1. Zod-first.
 *
 * Includes `dynamic_actions` + `dynamic_action_spec` per master plan §R4:
 * manifests must honestly disclose dispatch-time capability augmentation.
 *
 * JSON-Schema export (ajv at runtime) is deferred to the registry work in
 * M6. At M2 we ship Zod-validated manifests directly; the runtime loads
 * from in-memory registrations, so Zod is enough.
 */

import { z } from "zod";
import { parseCapability } from "../permissions/capability.js";

const CapabilityStringSchema = z.string().superRefine((value, ctx) => {
  try {
    parseCapability(value);
  } catch (err) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: err instanceof Error ? err.message : String(err),
    });
  }
});

const SemverRe = /^\d+\.\d+\.\d+(?:-[\w.]+)?$/;
const ManifestIdRe = /^@[a-z0-9][a-z0-9-]*\/node-[a-z0-9][a-z0-9-]*$/;

const DeterminismSchema = z.enum(["deterministic", "stochastic"]);

const SideEffectsDefault = {
  writes_fs: false,
  network: false,
  mutates_ctx: false,
  emits_ctx_variants: [] as string[],
  reads_ctx_variants: [] as string[],
};

const SideEffectsSchema = z
  .object({
    writes_fs: z.boolean().default(false),
    network: z.boolean().default(false),
    mutates_ctx: z.boolean().default(false),
    emits_ctx_variants: z.array(z.string()).default([]),
    reads_ctx_variants: z.array(z.string()).default([]),
  })
  .default(() => SideEffectsDefault);

const RequiredCapabilitiesDefault = {
  tool_use: false,
  vision: false,
  structured_output: "any" as const,
};

const RequiredCapabilitiesSchema = z
  .object({
    tool_use: z.boolean().default(false),
    vision: z.boolean().default(false),
    min_context_tokens: z.number().int().optional(),
    structured_output: z.enum(["native", "text_parse", "any"]).default("any"),
  })
  .default(() => RequiredCapabilitiesDefault);

const PlannerHintsSchema = z
  .object({
    cost_tier: z.enum(["cheap", "medium", "expensive"]).optional(),
    latency_tier: z.enum(["fast", "medium", "slow"]).optional(),
    typical_use: z.string().optional(),
  })
  .optional();

export const NodeManifestSchema = z
  .object({
    manifest_version: z.literal(1),
    id: z.string().regex(ManifestIdRe, "id must match @<scope>/node-<name>"),
    version: z.string().regex(SemverRe, "version must be semver"),
    name: z.string().min(1).max(80),
    description: z.string().min(1).max(500),

    // I/O schemas. At M2 these are optional (nodes may ship Zod directly
    // via the runtime registration), but if present must parse as objects.
    input_schema: z.unknown().optional(),
    output_schema: z.unknown().optional(),

    // Authorization
    required_actions: z.array(CapabilityStringSchema).default([]),
    required_capabilities: RequiredCapabilitiesSchema,

    // Master plan §R4 — dispatch-time augmentation disclosure.
    dynamic_actions: z.boolean().default(false),
    dynamic_action_spec: z.string().optional(),

    // Semantics
    side_effects: SideEffectsSchema,
    determinism: DeterminismSchema,

    // Discovery
    tags: z.array(z.string().regex(/^[a-z][a-z0-9-]*$/)).default([]),

    // Metadata
    author: z.string().default(""),
    license: z.string().default("UNLICENSED"),
    homepage: z.string().url().optional(),
    repository: z.string().url().optional(),
    planner_hints: PlannerHintsSchema,

    // Integrity (filled by publisher at M6; optional at M2).
    sha256: z.string().optional(),
  })
  .strict()
  .superRefine((m, ctx) => {
    // R4 rule: dynamic_action_spec required iff dynamic_actions === true.
    if (m.dynamic_actions && !m.dynamic_action_spec) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["dynamic_action_spec"],
        message: "dynamic_action_spec is required when dynamic_actions is true",
      });
    }
    if (!m.dynamic_actions && m.dynamic_action_spec) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["dynamic_actions"],
        message: "dynamic_action_spec is only valid when dynamic_actions is true",
      });
    }

    // Side-effects / required_actions consistency — sub-plan 02 §2.3.
    const caps = m.required_actions.map(parseCapability);
    const hasFsWrite = caps.some((c) =>
      c.resource === "fs.write" || c.resource === "fs.delete",
    );
    const hasNetwork = caps.some((c) =>
      c.resource === "net.http" || c.resource === "net.dns",
    );
    const hasShell = caps.some((c) => c.resource === "shell.exec");

    if ((hasFsWrite || hasShell) && !m.side_effects.writes_fs) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["side_effects", "writes_fs"],
        message:
          "manifest declares fs.write/delete or shell.exec but side_effects.writes_fs is false",
      });
    }
    if ((hasNetwork || hasShell) && !m.side_effects.network) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["side_effects", "network"],
        message:
          "manifest declares net.* or shell.exec but side_effects.network is false",
      });
    }
  });

export type NodeManifest = z.infer<typeof NodeManifestSchema>;

export type NodeManifestInput = z.input<typeof NodeManifestSchema>;
