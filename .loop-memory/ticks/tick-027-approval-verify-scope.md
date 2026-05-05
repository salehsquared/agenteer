# Tick 027 Design Note: Approval Verify Scope

Axis: remove or merge a primitive.

## Decision

Keep `approval-verify` narrow for now.

Reasons:

- `checkpoint` should remain about stage/artifact presence, not artifact integrity.
- `packet-summary` already has broad lifecycle concerns and should not become a validator bucket.
- `approval-verify` has a clean single responsibility: recompute and compare the approval event hash.

## Merge Trigger

Merge it into a broader verifier only when a command like `research packet-verify` exists and checks multiple event-shaped artifacts plus traces.

Candidate future shape:

```bash
agenteer research packet-verify --packet ./packet --json
```

That command could aggregate:

- approval hash verification
- navigation trace hash-chain validation
- manifest hash coverage
- provenance graph consistency
- report claim guard status

## Counter-Design Rejected

Rejected: adding approval verification into `checkpoint`.

Reason: checkpoint answers "where is the packet in the workflow?" not "are all integrity proofs valid?"
