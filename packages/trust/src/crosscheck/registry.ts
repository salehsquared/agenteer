/**
 * ComparatorRegistry — sub-plan 04 §4.4/§2.4.
 *
 * Applications register per-schema projectors here. Trust ships none;
 * OpenEngine's specific projectors (`projectSpecIR`, etc.) live with OE.
 * Falls back to canonical projection when no comparator is registered.
 */

import { projectCanonical, type JsonLike } from "./semantic.js";

export type Projector = (value: unknown) => JsonLike;

export class ComparatorRegistry {
  private readonly exact = new Map<string, Projector>();
  private readonly prefixes: Array<{ prefix: string; projector: Projector }> = [];

  register(schemaName: string, projector: Projector): void {
    this.exact.set(schemaName, projector);
  }

  registerPrefix(prefix: string, projector: Projector): void {
    this.prefixes.push({ prefix, projector });
  }

  get(schemaName: string): Projector | null {
    const exact = this.exact.get(schemaName);
    if (exact) return exact;
    for (const { prefix, projector } of this.prefixes) {
      if (schemaName.startsWith(prefix)) return projector;
    }
    return null;
  }

  projectOrCanonical(schemaName: string, value: unknown): JsonLike {
    const p = this.get(schemaName);
    return p ? p(value) : projectCanonical(value);
  }
}
