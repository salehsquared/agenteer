import type { Node, NodeFactory } from "./types.js";
import { type NodeManifest, validateManifest } from "../manifest/index.js";

export interface NodeManifestEntry {
  readonly manifest: NodeManifest;
  instantiate(): Node;
}

export interface NodeRegistry {
  lookup(manifest_id: string): NodeManifestEntry;
  instantiate(manifest_id: string): Node;
  register(manifestInput: unknown, factory: NodeFactory): NodeManifest;
  has(manifest_id: string): boolean;
  all(): ReadonlyArray<NodeManifestEntry>;
}

/**
 * In-memory registry with runtime-load validation (sub-plan 02 §2.3).
 * Manifest integrity (sha256) and npm provenance ship with the registry
 * package in M6.
 */
export class InMemoryNodeRegistry implements NodeRegistry {
  private readonly entries = new Map<string, NodeManifestEntry>();

  register(manifestInput: unknown, factory: NodeFactory): NodeManifest {
    const manifest = validateManifest(manifestInput);
    if (this.entries.has(manifest.id)) {
      throw new Error(`registerNode: manifest ${manifest.id} already registered`);
    }
    // Runtime-load invariant: instance must carry the same manifest object.
    const instance = factory();
    if (instance.manifest.id !== manifest.id) {
      throw new Error(
        `registerNode(${manifest.id}): instance.manifest.id mismatch (${instance.manifest.id})`,
      );
    }
    if (manifest.determinism === "deterministic" && instance.model !== null) {
      throw new Error(
        `registerNode(${manifest.id}): deterministic manifest must have model === null on the instance`,
      );
    }
    this.entries.set(manifest.id, { manifest, instantiate: factory });
    return manifest;
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

  all(): ReadonlyArray<NodeManifestEntry> {
    return Array.from(this.entries.values());
  }
}
