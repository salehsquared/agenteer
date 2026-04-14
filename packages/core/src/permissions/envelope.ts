/**
 * Permission envelope — M1 placeholder.
 *
 * Full capability grammar, hierarchical globs, dispatch-time refusal,
 * snapshot verification — all live in `@agenteer/core/permissions` in M2
 * (sub-plan 02). For M1 we define the envelope shape and a naive
 * `intersect` so children can be constrained relative to their parent. No
 * enforcement at model/action dispatch yet (those surfaces do not exist
 * in M1 runtime scope).
 */

export interface PermissionEnvelope {
  readonly models_allowed: readonly string[];
  readonly actions_allowed: readonly string[];
  readonly new_node_states_allowed: readonly string[];
  readonly ctx_keys: readonly string[];
}

export const EMPTY_ENVELOPE: PermissionEnvelope = Object.freeze({
  models_allowed: [],
  actions_allowed: [],
  new_node_states_allowed: [],
  ctx_keys: [],
});

/**
 * Intersect a parent envelope with a child's requested subset. `null` in
 * the request means "inherit this slot unchanged". Anything the child
 * asks for that the parent doesn't have is silently dropped — a stricter
 * policy kernel (M2) will raise.
 */
export function intersect(
  parent: PermissionEnvelope,
  requested: Partial<PermissionEnvelope> | null,
): PermissionEnvelope {
  if (!requested) return parent;
  return {
    models_allowed: intersectField(parent.models_allowed, requested.models_allowed),
    actions_allowed: intersectField(parent.actions_allowed, requested.actions_allowed),
    new_node_states_allowed: intersectField(
      parent.new_node_states_allowed,
      requested.new_node_states_allowed,
    ),
    ctx_keys: intersectField(parent.ctx_keys, requested.ctx_keys),
  };
}

function intersectField(
  parent: readonly string[],
  child: readonly string[] | undefined,
): readonly string[] {
  if (child === undefined) return parent;
  const parentSet = new Set(parent);
  return child.filter((x) => parentSet.has(x));
}

export function isSpawnAllowed(
  parent: PermissionEnvelope,
  manifestId: string,
): { allowed: boolean; reason?: string } {
  if (parent.new_node_states_allowed.length === 0) {
    // Convention: empty allowlist in M1 means "no restriction". M2 flips
    // this to strict-deny. Recorded as a known gap for the kernel port.
    return { allowed: true };
  }
  if (parent.new_node_states_allowed.includes(manifestId)) return { allowed: true };
  return { allowed: false, reason: `manifest ${manifestId} not in parent's new_node_states_allowed` };
}
