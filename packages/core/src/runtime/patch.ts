/**
 * CtxPatch compiler. Master plan §R3: `ctx_patch` is authoring sugar over
 * append-only item ops. The store is never mutated; every op compiles to
 * one or more `ContextStore.add(...)` calls.
 *
 *   set(key, value)       → Decision item, labels.tag = key, body = value
 *                           via `rationale`; refs.supersedes = <prior head>.
 *   delete(key)           → tombstone Decision (choice = "tombstone") with
 *                           supersedes link to current head.
 *   append(key, [values]) → Artifact item, labels.tag = key, body = values,
 *                           refs.extends = <prior head>.
 *
 * Returns the list of added items and a structured summary for event
 * emission.
 */

import type { CtxPatch } from "../node/types.js";
import type { ContextStore } from "../context/store.js";
import type {
  ContextItem,
  ContextRef,
  NewContextItem,
  Provenance,
} from "../context/types.js";

export interface ApplyPatchOutcome {
  added: ContextItem[];
  setKeys: string[];
  deletedKeys: string[];
  appendedKeys: string[];
}

export interface ApplyPatchContext {
  sourceNode: string;
  sourceNodeRunId: string;
  sourceInputHash: string;
  parentNodeRunId?: string;
  cause?: Provenance["cause"];
}

export function applyPatch(
  store: ContextStore,
  patch: CtxPatch | undefined,
  ctx: ApplyPatchContext,
): ApplyPatchOutcome {
  const outcome: ApplyPatchOutcome = {
    added: [],
    setKeys: [],
    deletedKeys: [],
    appendedKeys: [],
  };
  if (!patch) return outcome;

  const provenance = (): NewContextItem["provenance"] => ({
    source_node: ctx.sourceNode,
    source_node_run_id: ctx.sourceNodeRunId,
    source_input_hash: ctx.sourceInputHash,
    ...(ctx.parentNodeRunId ? { parent_node_run_id: ctx.parentNodeRunId } : {}),
    cause: ctx.cause ?? "patch",
  });

  if (patch.set) {
    for (const [key, value] of Object.entries(patch.set)) {
      const prior = store.getHeadByTag(key);
      const refs: ContextRef[] = prior
        ? [{ kind: "supersedes", target: { scope: "ctx", id: prior.id } }]
        : [];
      const added = store.add({
        type: "decision",
        content: {
          kind: "decision",
          question: `ctx.set(${key})`,
          choice: stringifyForDecision(value),
          alternatives: [],
          rationale: JSON.stringify(value),
        },
        provenance: provenance(),
        refs,
        tags: [],
        labels: { tag: key, ctx_op: "set" },
      });
      outcome.added.push(added);
      outcome.setKeys.push(key);
    }
  }

  if (patch.delete) {
    for (const key of patch.delete) {
      const prior = store.getHeadByTag(key);
      const refs: ContextRef[] = prior
        ? [{ kind: "supersedes", target: { scope: "ctx", id: prior.id } }]
        : [];
      const added = store.add({
        type: "decision",
        content: {
          kind: "decision",
          question: `ctx.delete(${key})`,
          choice: "tombstone",
          alternatives: [],
        },
        provenance: provenance(),
        refs,
        tags: ["tombstone"],
        labels: { tag: key, ctx_op: "delete" },
      });
      outcome.added.push(added);
      outcome.deletedKeys.push(key);
    }
  }

  if (patch.append) {
    for (const [key, values] of Object.entries(patch.append)) {
      const prior = store.getHeadByTag(key);
      const refs: ContextRef[] = prior
        ? [{ kind: "extends", target: { scope: "ctx", id: prior.id } }]
        : [];
      const added = store.add({
        type: "artifact",
        content: {
          kind: "artifact",
          media_type: "application/json",
          encoding: "inline_json",
          body: values,
        },
        provenance: provenance(),
        refs,
        tags: [],
        labels: { tag: key, ctx_op: "append" },
      });
      outcome.added.push(added);
      outcome.appendedKeys.push(key);
    }
  }

  return outcome;
}

function stringifyForDecision(value: unknown): string {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (value === null || value === undefined) return String(value);
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}
