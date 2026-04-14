/**
 * Capability grammar (sub-plan 02 §1.1).
 *
 * Format: `resource:scope`. 11 resource types; globs (`*`, `**`) only, no
 * regex, no negation. Hierarchical strings so subset check is a pure
 * string operation.
 */

export const RESOURCE_TYPES = [
  "fs.read",
  "fs.write",
  "fs.delete",
  "net.http",
  "net.dns",
  "shell.exec",
  "model",
  "context.read",
  "context.write",
  "spawn",
  /**
   * `tool` — named external-adapter invocation surface used by
   * `@agenteer/node-tool-call` (sub-plan 03 §2, master plan §R4). Scope
   * is an id-glob over tool names; `tool:*` means any tool.
   */
  "tool",
] as const;

export type ResourceType = (typeof RESOURCE_TYPES)[number];

const RESOURCE_SET: ReadonlySet<string> = new Set(RESOURCE_TYPES);

/** Branded to signal "parsed + validated", not just any string. */
export type Capability = string & { readonly __capability: unique symbol };

export interface ParsedCapability {
  readonly raw: Capability;
  readonly resource: ResourceType;
  readonly scope: string;
}

export class CapabilityParseError extends Error {
  constructor(readonly input: string, readonly why: string) {
    super(`invalid capability "${input}": ${why}`);
  }
}

const SEGMENT_RE = /^[A-Za-z0-9_]+$/;

export function parseCapability(raw: string): ParsedCapability {
  if (typeof raw !== "string") {
    throw new CapabilityParseError(String(raw), "not a string");
  }
  const colon = raw.indexOf(":");
  if (colon < 0) {
    throw new CapabilityParseError(raw, "missing ':' separator");
  }
  const resource = raw.slice(0, colon);
  const scope = raw.slice(colon + 1);
  if (!RESOURCE_SET.has(resource)) {
    throw new CapabilityParseError(raw, `unknown resource '${resource}'`);
  }
  // Resource segment must be valid (only validation above; segments are known literals here).
  validateScope(resource as ResourceType, scope, raw);
  return {
    raw: raw as Capability,
    resource: resource as ResourceType,
    scope,
  };
}

export function parseCapabilitySet(raws: readonly string[]): {
  caps: ParsedCapability[];
  errors: CapabilityParseError[];
} {
  const caps: ParsedCapability[] = [];
  const errors: CapabilityParseError[] = [];
  for (const raw of raws) {
    try {
      caps.push(parseCapability(raw));
    } catch (err) {
      if (err instanceof CapabilityParseError) errors.push(err);
      else throw err;
    }
  }
  return { caps, errors };
}

function validateScope(resource: ResourceType, scope: string, raw: string): void {
  switch (resource) {
    case "shell.exec":
      if (scope !== "") {
        throw new CapabilityParseError(
          raw,
          "shell.exec is scopeless; use 'shell.exec:' (empty scope)",
        );
      }
      return;

    case "fs.read":
    case "fs.write":
    case "fs.delete":
      if (scope === "*") return; // unconstrained
      if (!scope.startsWith("/") && scope !== "") {
        throw new CapabilityParseError(
          raw,
          `${resource} scope must start with '/' or be '*'; got '${scope}'`,
        );
      }
      validatePathGlob(scope, raw);
      return;

    case "net.http":
      if (scope === "*") return;
      validateOriginScope(scope, raw);
      return;

    case "net.dns":
      if (scope === "*") return;
      validateHostGlob(scope, raw);
      return;

    case "model":
    case "spawn":
    case "context.read":
    case "context.write":
    case "tool":
      if (scope === "") {
        throw new CapabilityParseError(raw, `${resource} requires non-empty scope`);
      }
      validateIdGlob(scope, raw);
      return;
  }
}

function validatePathGlob(scope: string, raw: string): void {
  if (scope.includes("\0")) throw new CapabilityParseError(raw, "null byte");
  for (const seg of scope.split("/")) {
    if (seg === "") continue;
    if (seg === "*" || seg === "**") continue;
    // Segments may include literal chars + embedded globs.
    if (seg.includes("?")) throw new CapabilityParseError(raw, "no '?' wildcard supported");
    // Disallow regex-ish chars explicitly — catch mistakes early.
    if (/[\[\]\(\)\|\\]/.test(seg)) {
      throw new CapabilityParseError(raw, `unsupported char in segment '${seg}'`);
    }
  }
}

function validateOriginScope(scope: string, raw: string): void {
  const slash = scope.indexOf("/");
  const hostPort = slash < 0 ? scope : scope.slice(0, slash);
  const pathPart = slash < 0 ? "" : scope.slice(slash);
  const [host, port] = hostPort.split(":");
  if (!host) throw new CapabilityParseError(raw, "net.http missing host");
  validateHostGlob(host, raw);
  if (port !== undefined) {
    if (!/^\d+$/.test(port)) {
      throw new CapabilityParseError(raw, `invalid port '${port}'`);
    }
  }
  if (pathPart) validatePathGlob(pathPart, raw);
}

function validateHostGlob(host: string, raw: string): void {
  // `*.foo.com` OK; bare `*` host is permitted via `*` scope; mid-name globs not.
  const labels = host.split(".");
  for (let i = 0; i < labels.length; i += 1) {
    const label = labels[i]!;
    if (label === "*") {
      if (i !== 0) throw new CapabilityParseError(raw, "'*' label only allowed leftmost");
      continue;
    }
    if (!/^[a-zA-Z0-9](?:[a-zA-Z0-9-]*[a-zA-Z0-9])?$/.test(label)) {
      throw new CapabilityParseError(raw, `invalid host label '${label}'`);
    }
  }
  if (SEGMENT_RE) {
    /* silence unused */
  }
}

function validateIdGlob(scope: string, raw: string): void {
  // Allow ALPHA / DIGIT / _ / / / - / . / : / * (id-scope per grammar).
  for (const ch of scope) {
    if (!/[A-Za-z0-9_\/\-.:*@]/.test(ch)) {
      throw new CapabilityParseError(raw, `invalid char in scope '${ch}'`);
    }
  }
}

/** Trusted construction from code that already validated — used by tests. */
export function unsafeCapability(s: string): Capability {
  return s as Capability;
}
