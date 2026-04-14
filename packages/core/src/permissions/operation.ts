/**
 * Action-time capability checks — sub-plan 02 §1.5 Layer B. Only the five
 * primitive surfaces need this (file_read, file_write, shell_exec,
 * net_http, model_call). Every other node composes these.
 *
 * An "operation" here is the runtime synthesizing a capability string from
 * a concrete action, then asking whether the granted set covers it.
 */

import { parseCapability } from "./capability.js";
import { capabilityCoversOperation, type CapabilitySet } from "./subset.js";

export interface FsReadOp {
  kind: "fs.read";
  path: string;
}
export interface FsWriteOp {
  kind: "fs.write";
  path: string;
}
export interface FsDeleteOp {
  kind: "fs.delete";
  path: string;
}
export interface NetHttpOp {
  kind: "net.http";
  url: string;
}
export interface ShellExecOp {
  kind: "shell.exec";
}
export interface ModelOp {
  kind: "model";
  modelId: string;
}
export interface SpawnOp {
  kind: "spawn";
  manifestId: string;
}
export interface ContextOp {
  kind: "context.read" | "context.write";
  variantId: string;
}
export interface ToolOp {
  kind: "tool";
  toolName: string;
}

export type Operation =
  | FsReadOp
  | FsWriteOp
  | FsDeleteOp
  | NetHttpOp
  | ShellExecOp
  | ModelOp
  | SpawnOp
  | ContextOp
  | ToolOp;

export class OperationDenied extends Error {
  constructor(
    readonly operation: Operation,
    readonly reason: string,
  ) {
    super(`operation denied: ${reason}`);
  }
}

export function authorizeOperation(granted: CapabilitySet, op: Operation): void {
  const synthesized = synthesizeCapability(op);
  if (!capabilityCoversOperation(granted, synthesized)) {
    throw new OperationDenied(op, `no granted capability covers ${synthesized.raw}`);
  }
}

export function isOperationAllowed(granted: CapabilitySet, op: Operation): boolean {
  try {
    authorizeOperation(granted, op);
    return true;
  } catch {
    return false;
  }
}

function synthesizeCapability(op: Operation) {
  switch (op.kind) {
    case "fs.read":
    case "fs.write":
    case "fs.delete":
      return parseCapability(`${op.kind}:${op.path}`);
    case "net.http":
      return parseCapability(`net.http:${urlToScope(op.url)}`);
    case "shell.exec":
      return parseCapability("shell.exec:");
    case "model":
      return parseCapability(`model:${op.modelId}`);
    case "spawn":
      return parseCapability(`spawn:${op.manifestId}`);
    case "context.read":
    case "context.write":
      return parseCapability(`${op.kind}:${op.variantId}`);
    case "tool":
      return parseCapability(`tool:${op.toolName}`);
  }
}

function urlToScope(url: string): string {
  try {
    const u = new URL(url);
    const host = u.hostname;
    const port = u.port ? `:${u.port}` : "";
    const path = u.pathname === "/" ? "/" : u.pathname;
    return `${host}${port}${path}`;
  } catch {
    return url;
  }
}
