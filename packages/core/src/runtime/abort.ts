/**
 * Cascading AbortController tree. A child's signal aborts when the child's
 * own controller aborts OR when any ancestor aborts. Node ≥ 20 ships
 * `AbortSignal.any([...])` natively, but we wrap it so we also have a
 * handle for per-subtree cancellation (used by {mode: "any"} joins).
 */

export interface AbortHandle {
  readonly signal: AbortSignal;
  readonly controller: AbortController;
  abort(reason?: unknown): void;
}

export function createRootAbort(): AbortHandle {
  const controller = new AbortController();
  return {
    signal: controller.signal,
    controller,
    abort(reason) {
      if (!controller.signal.aborted) controller.abort(reason);
    },
  };
}

export function createChildAbort(parent: AbortSignal): AbortHandle {
  const controller = new AbortController();
  if (parent.aborted) {
    controller.abort(parent.reason);
  } else {
    const onAbort = () => {
      if (!controller.signal.aborted) controller.abort(parent.reason);
      parent.removeEventListener("abort", onAbort);
    };
    parent.addEventListener("abort", onAbort, { once: true });
  }
  return {
    signal: controller.signal,
    controller,
    abort(reason) {
      if (!controller.signal.aborted) controller.abort(reason);
    },
  };
}
