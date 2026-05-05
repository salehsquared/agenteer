# Tick 039 Design Note: Manifest Verification Scope

Axis: remove or merge a primitive.

## Decision

Manifest verification belongs under reproducibility/export integrity, not event records.

Reasoning:

- Event records explain decisions and approvals.
- Manifests verify artifact bytes and hashes.
- Provenance graphs explain lineage between artifacts.

These can be aggregated by `packet-verify`, but they should not be conceptually merged.

## Documentation Rule

Keep `manifest-verify` near `manifest`, `export`, RO-Crate, and provenance documentation. Keep approval/navigation event details under event records.

## Counter-Design Rejected

Rejected: describe manifest entries as event records.

Reason: a manifest entry is an integrity statement about an artifact, not a decision event.
