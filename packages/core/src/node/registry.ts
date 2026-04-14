import type { Node, NodeFactory, NodeManifest } from "./types.js";

export interface NodeManifestEntry {
  readonly manifest: NodeManifest;
  instantiate(): Node;
}

export interface NodeRegistry {
  lookup(manifest_id: string): NodeManifestEntry;
  instantiate(manifest_id: string): Node;
  register(manifest: NodeManifest, factory: NodeFactory): void;
  has(manifest_id: string): boolean;
}

/**
 * In-memory registry. M1 concerns only: lookup + instantiate. Integrity
 * checking (sha256), signature verification, and manifest schema
 * validation move to `@agenteer/registry` in M6.
 */
export class InMemoryNodeRegistry implements NodeRegistry {
  private readonly entries = new Map<string, NodeManifestEntry>();

  register(manifest: NodeManifest, factory: NodeFactory): void {
    if (this.entries.has(manifest.id)) {
      throw new Error(`registerNode: manifest ${manifest.id} already registered`);
    }
    validateAtRegistration(manifest, factory);
    this.entries.set(manifest.id, { manifest, instantiate: factory });
  }

  lookup(manifest_id: string): NodeManifestEntry {
    const entry = this.entries.get(manifest_id);
    if (!entry) throw new Error(`lookup: unknown manifest ${manifest_id}`);
    return entry;
  }

  instantiate(manifest_id: string): Node {
    return this.lookup(manifest_id).instantiate();
  }

  has(manifest_id: string): boolean {
    return this.entries.has(manifest_id);
  }
}

function validateAtRegistration(manifest: NodeManifest, factory: NodeFactory): void {
  const instance = factory();
  if (instance.deterministic && instance.model !== null) {
    throw new Error(
      `registerNode(${manifest.id}): deterministic nodes must have model === null`,
    );
  }
  if (instance.manifest.id !== manifest.id) {
    throw new Error(
      `registerNode(${manifest.id}): instance.manifest.id mismatch (${instance.manifest.id})`,
    );
  }
}
