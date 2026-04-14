import { randomBytes } from "node:crypto";

export function newCorrelationId(prefix = "cor"): string {
  return `${prefix}_${randomBytes(6).toString("hex")}`;
}

export function newNodeRunId(): string {
  return `run_${randomBytes(6).toString("hex")}`;
}

export function newSessionId(): string {
  return `sess_${randomBytes(8).toString("hex")}`;
}
