# @agenteer/registry

The publish/install/search surface for [Agenteer](https://github.com/salehsquared/agenteer) node packages. Wraps npm directly — no proprietary registry — and layers validation, capability-diff prompts, provenance reporting, and `framework.lock` management on top.

## Install

```bash
npm install @agenteer/registry @agenteer/core zod
```

Requires **Node ≥ 20**.

## What it does

- **`publishNode(opts)`** — validates the `framework.json`, checks package-name convention, runs the npm publish with `--provenance` (when available), and writes back a publish result with the registry URL.
- **`installNode(opts)`** — validates, diffs required capabilities against the workflow's current grants, prompts on third-party `dynamic_actions: true` (hard-stop; `--yes` is ignored), records the entry in `framework.workflow.yaml` and pins the manifest hash in `framework.lock`.
- **`searchNodes(opts)`** — keyword search over npm + annotations from a curated index.
- **`validateNodePackage(dir)`** — standalone validator with issue codes (`bad_package_name`, `missing_framework_keyword`, `id_mismatch`, `manifest_load_failed`) usable before publish.
- **`diffPermissions(existing, required)`** — set-algebra diff on capability sets using the `@agenteer/core` kernel.
- **`jsonSchemaToZod(schema)` / `compileNodeSchemas(manifest)`** — ajv bridge so non-Zod publishers can ship plain JSON Schema in `framework.json` and still get Zod-shaped validators at install time.

## Naming convention

Node packages must use the scope/short-name convention enforced by `validateNodePackage`:

```
@<scope>/node-<name>        // e.g. @agenteer/node-file-read, @acme/node-bug-triage
```

And `framework.json.id` must match `package.json.name` exactly. Mismatches are rejected before publish.

## Publish flow

```ts
import { publishNode, DefaultNpmRunner } from "@agenteer/registry";

const result = await publishNode({
  dir: "./my-node",
  runner: new DefaultNpmRunner(),
  provenance: true,   // requires npm provenance context (OIDC / CI)
});

if (!result.ok) {
  // result.issues is a PackageValidationIssue[] with issue codes + hints.
} else {
  // result.published.tarballUrl, result.published.manifestHash, ...
}
```

## Install flow

```ts
import { installNode, DefaultNpmRunner } from "@agenteer/registry";

const result = await installNode({
  name: "@acme/node-bug-triage",
  workflowDir: "./my-workflow",
  runner: new DefaultNpmRunner(),
  autoApprove: false,            // if true, non-dynamic-actions packages skip the prompt
  permissionPromptCallback: async ({ diff, loaded }) => confirm(...),
});
```

A third-party package with `dynamic_actions: true` ignores `autoApprove` and always returns an install decline with `reason: "third_party_dynamic_actions_requires_confirmation"` and `dynamic_actions_hard_stop: true` unless the prompt callback explicitly approves.

## License

MIT — see LICENSE.
