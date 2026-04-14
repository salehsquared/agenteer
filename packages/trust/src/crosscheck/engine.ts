/**
 * CrossCheckEngine — sub-plan 04 §4.2.
 *
 * Runs one pass of `primary + secondary` (or `primary + fallback-primary`
 * with a temperature/prompt delta). Returns a `CrossCheckOutcome` for the
 * meta-node to interpret. Retry semantics (retry-on-disagreement) live in
 * the meta-node via `ReplaceMe`, not here.
 */

import { createHash } from "node:crypto";
import type {
  StructuredGenerator,
  StructuredGenerateOpts,
} from "../structured/generator.js";
import { ComparatorRegistry } from "./registry.js";
import { diffPaths, projectCanonical } from "./semantic.js";
import { type CrossCheckPolicy, DEFAULT_POLICY } from "./policy.js";

export interface CrossCheckMeta {
  schemaName: string;
  primaryModel: string;
  secondaryModelOrFallback: string;
  attempts: number;
  parallel: boolean;
  usedFallbackPrimarySecondPass: boolean;
}

export type CrossCheckOutcome<T> =
  | { kind: "agreement"; value: T; meta: CrossCheckMeta }
  | {
      kind: "disagreement";
      primary: T;
      secondary: T;
      disagreementKeys: string[];
      fingerprint: string;
      meta: CrossCheckMeta;
    }
  | { kind: "missing_secondary_skip"; value: T; meta: CrossCheckMeta }
  | {
      kind: "missing_secondary_fallback_disagreement";
      primary: T;
      secondFallback: T;
      disagreementKeys: string[];
      fingerprint: string;
      meta: CrossCheckMeta;
    };

export class CrossCheckEngine {
  constructor(
    private readonly primary: StructuredGenerator,
    private readonly secondary: StructuredGenerator | undefined,
    private readonly policy: CrossCheckPolicy = DEFAULT_POLICY,
    private readonly comparators: ComparatorRegistry = new ComparatorRegistry(),
  ) {}

  async run<T>(opts: StructuredGenerateOpts<T>): Promise<CrossCheckOutcome<T>> {
    const schemaName = opts.schemaName;
    const primaryModel = this.primary.modelId ?? "<primary>";

    if (!this.secondary) {
      return this.handleMissingSecondary(opts, primaryModel);
    }

    const secondaryModel = this.secondary.modelId ?? "<secondary>";
    const parallel = this.policy.parallel;

    const [pri, sec] = parallel
      ? await Promise.all([this.primary.generate(opts), this.secondary.generate(opts)])
      : await (async () => {
          const a = await this.primary.generate(opts);
          const b = await this.secondary!.generate(opts);
          return [a, b] as [T, T];
        })();

    const proj1 = this.comparators.projectOrCanonical(schemaName, pri);
    const proj2 = this.comparators.projectOrCanonical(schemaName, sec);
    const diffs = diffPaths(proj1, proj2);

    if (diffs.length === 0) {
      return {
        kind: "agreement",
        value: pri,
        meta: {
          schemaName,
          primaryModel,
          secondaryModelOrFallback: secondaryModel,
          attempts: 2,
          parallel,
          usedFallbackPrimarySecondPass: false,
        },
      };
    }
    return {
      kind: "disagreement",
      primary: pri,
      secondary: sec,
      disagreementKeys: diffs,
      fingerprint: fingerprint(schemaName, diffs),
      meta: {
        schemaName,
        primaryModel,
        secondaryModelOrFallback: secondaryModel,
        attempts: 2,
        parallel,
        usedFallbackPrimarySecondPass: false,
      },
    };
  }

  private async handleMissingSecondary<T>(
    opts: StructuredGenerateOpts<T>,
    primaryModel: string,
  ): Promise<CrossCheckOutcome<T>> {
    const mode = this.policy.on_missing_secondary;
    if (mode === "error") {
      throw new Error("crosscheck: secondary provider missing (policy: error)");
    }
    if (mode === "warn_skip") {
      const value = await this.primary.generate(opts);
      return {
        kind: "missing_secondary_skip",
        value,
        meta: {
          schemaName: opts.schemaName,
          primaryModel,
          secondaryModelOrFallback: "(skipped)",
          attempts: 1,
          parallel: false,
          usedFallbackPrimarySecondPass: false,
        },
      };
    }
    // warn_fallback_primary_second_pass
    const pri = await this.primary.generate(opts);
    const delta = this.policy.fallback_temperature_delta;
    const altTemp =
      opts.temperature !== undefined ? opts.temperature + delta : delta;
    const fallbackOpts: StructuredGenerateOpts<T> = {
      ...opts,
      systemPrompt: this.policy.fallback_prompt_variant
        ? `${opts.systemPrompt}\n\nActing as an independent reviewer: produce your best answer without referring to any prior output.`
        : opts.systemPrompt,
      temperature: altTemp,
    };
    const sec = await this.primary.generate(fallbackOpts);

    const proj1 = this.comparators.projectOrCanonical(opts.schemaName, pri);
    const proj2 = this.comparators.projectOrCanonical(opts.schemaName, sec);
    const diffs = diffPaths(proj1, proj2);

    const meta: CrossCheckMeta = {
      schemaName: opts.schemaName,
      primaryModel,
      secondaryModelOrFallback: `${primaryModel} (fallback+Δ${delta})`,
      attempts: 2,
      parallel: false,
      usedFallbackPrimarySecondPass: true,
    };

    if (diffs.length === 0) {
      return { kind: "agreement", value: pri, meta };
    }
    return {
      kind: "missing_secondary_fallback_disagreement",
      primary: pri,
      secondFallback: sec,
      disagreementKeys: diffs,
      fingerprint: fingerprint(opts.schemaName, diffs),
      meta,
    };
  }
}

function fingerprint(schemaName: string, keys: readonly string[]): string {
  return createHash("sha256")
    .update(`${schemaName}|${keys.slice().sort().join("|")}`)
    .digest("hex")
    .slice(0, 12);
}
