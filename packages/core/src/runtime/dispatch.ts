/**
 * Action dispatcher — the one surface through which nodes perform
 * side-effecting calls. Enforces R1 hybrid model:
 *   - Primitive FS actions refused preemptively against `granted`.
 *   - Denylist applied unconditionally after capability resolution.
 *   - Shell scope snapshotting lives in `@agenteer/trust/access` (M3);
 *     for M2 we expose the hook but the primitive itself is handled
 *     inside `@agenteer/stdlib/shell_exec`.
 */

import { readFile, writeFile, mkdir, stat } from "node:fs/promises";
import { dirname } from "node:path";
import type { CapabilitySet } from "../permissions/index.js";
import {
  authorizeOperation,
  OperationDenied,
  type Operation,
} from "../permissions/operation.js";
import { assertNotDenied, DenylistViolation } from "../permissions/denylist.js";
import type { ModelProvider, ModelCallDispatch, ModelCallDispatchResult } from "./providers.js";

export class DispatchError extends Error {
  constructor(
    readonly action: string,
    message: string,
    readonly cause?: unknown,
  ) {
    super(`dispatch(${action}): ${message}`);
  }
}

export interface ActionDispatcherDeps {
  readonly modelProvider?: ModelProvider;
}

export interface DispatchContext {
  readonly granted: CapabilitySet;
  readonly signal: AbortSignal;
}

export interface ActionRegistry {
  dispatch(name: string, args: unknown, ctx: DispatchContext): Promise<unknown>;
  dispatchModel<T>(req: ModelCallDispatch<T>, ctx: DispatchContext): Promise<ModelCallDispatchResult<T>>;
  /** For tests / trust layer: direct permission-checked helpers. */
  readonly fs: {
    readFile(path: string, ctx: DispatchContext): Promise<string>;
    writeFile(path: string, content: string, ctx: DispatchContext): Promise<{ bytes: number }>;
  };
}

export class StdActionRegistry implements ActionRegistry {
  constructor(private readonly deps: ActionDispatcherDeps = {}) {}

  async dispatch(name: string, args: unknown, ctx: DispatchContext): Promise<unknown> {
    switch (name) {
      case "fs.read": {
        const { path } = args as { path: string };
        return this.fs.readFile(path, ctx);
      }
      case "fs.write": {
        const { path, content } = args as { path: string; content: string };
        return this.fs.writeFile(path, content, ctx);
      }
      default:
        throw new DispatchError(name, `unknown action '${name}'`);
    }
  }

  async dispatchModel<T>(
    req: ModelCallDispatch<T>,
    ctx: DispatchContext,
  ): Promise<ModelCallDispatchResult<T>> {
    checkOp(ctx, { kind: "model", modelId: req.model_id });
    const provider = this.deps.modelProvider;
    if (!provider) {
      throw new DispatchError(
        "callModel",
        "no ModelProvider configured on the runtime",
      );
    }
    if (!provider.supports(req.model_id)) {
      throw new DispatchError(
        "callModel",
        `model '${req.model_id}' not supported by provider`,
      );
    }
    return provider.dispatch<T>({ ...req, signal: ctx.signal });
  }

  readonly fs = {
    readFile: async (path: string, ctx: DispatchContext): Promise<string> => {
      checkOp(ctx, { kind: "fs.read", path });
      assertNotDeniedOrThrow(path);
      try {
        return await readFile(path, "utf8");
      } catch (err) {
        throw new DispatchError("fs.read", `read failed: ${messageOf(err)}`, err);
      }
    },
    writeFile: async (
      path: string,
      content: string,
      ctx: DispatchContext,
    ): Promise<{ bytes: number }> => {
      checkOp(ctx, { kind: "fs.write", path });
      assertNotDeniedOrThrow(path);
      try {
        await mkdir(dirname(path), { recursive: true });
        await writeFile(path, content, "utf8");
        const s = await stat(path);
        return { bytes: s.size };
      } catch (err) {
        throw new DispatchError("fs.write", `write failed: ${messageOf(err)}`, err);
      }
    },
  };
}

function checkOp(ctx: DispatchContext, op: Operation): void {
  try {
    authorizeOperation(ctx.granted, op);
  } catch (err) {
    if (err instanceof OperationDenied) {
      throw new DispatchError(
        op.kind,
        `permission denied: ${err.reason}`,
        err,
      );
    }
    throw err;
  }
}

function assertNotDeniedOrThrow(path: string): void {
  try {
    assertNotDenied(path);
  } catch (err) {
    if (err instanceof DenylistViolation) {
      throw new DispatchError("fs", err.message, err);
    }
    throw err;
  }
}

function messageOf(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}
