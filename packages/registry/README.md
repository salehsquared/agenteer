# @agenteer/registry

Publish/install/search helpers for [Agenteer](https://github.com/salehsquared/agenteer) node packages. The registry layer wraps npm directly and adds manifest validation, capability-diff prompts, provenance reporting, and `framework.lock` management.

## Install

```bash
npm install @agenteer/registry @agenteer/core zod
```

Requires **Node >= 20**.

## What it does

- **`publishNode(opts)`** — validates `framework.json`, enforces the package-name convention, and runs `npm publish`.
- **`installNode(opts)`** — installs a node package into a workflow, validates it, computes the capability diff, records the install in `framework.workflow.yaml`, and pins the manifest hash in `framework.lock`.
- **`searchNodes(opts)`** — keyword search over npm with curated-index annotations when available.
- **`validateNodePackage(dir)`** — standalone validator with issue codes like `bad_package_name`, `missing_framework_keyword`, `id_mismatch`, and `manifest_load_failed`.
- **`jsonSchemaToZod(schema)` / `compileNodeSchemas(manifest)`** — AJV-backed bridge for published JSON Schema manifests.

## Naming convention

Node packages must use the enforced scope/short-name convention:

```
@<scope>/node-<name>
```

Example: `@agenteer/node-file-read` or `@acme/node-bug-triage`.

## Publish flow

```ts
import { DefaultNpmRunner, publishNode } from "@agenteer/registry";

const result = await publishNode({
  pkgDir: "./my-node",
  npm: new DefaultNpmRunner(),
  dryRun: true,
});

if (!result.ok) {
  console.error(result.validation.issues);
} else {
  console.log(result.manifest_id, result.manifest_hash);
}
```

`PublishResult` reports the validated manifest id, package version, manifest hash, provenance status, and whether the run was a dry-run.

## Install flow

```ts
import { DefaultNpmRunner, installNode } from "@agenteer/registry";

const result = await installNode({
  spec: "@acme/node-bug-triage",
  workflowDir: "./my-workflow",
  npm: new DefaultNpmRunner(),
  autoApprove: false,
  confirm: async ({ summary_text }) => {
    console.log(summary_text);
    return true;
  },
});

if (!result.ok) {
  console.error(result.reason);
}
```

A third-party package with `dynamic_actions: true` ignores `autoApprove` and requires an explicit confirmation callback response.

## License

MIT — see LICENSE.
