# @agenteer/create-node

Scaffold a new [Agenteer](https://github.com/salehsquared/agenteer) node package ready to publish.

## Usage

```bash
npx @agenteer/create-node @your-scope/node-bug-triage
```

Creates a `./node-bug-triage/` directory with:

- `package.json` — correctly scoped name, `framework.manifest` pointer, deps on `@agenteer/core` + `zod`.
- `framework.json` — manifest + JSON Schema input/output (ajv bridge compiles at install).
- `src/index.ts` — Node factory skeleton + Zod schemas.
- `tsconfig.json` — TypeScript strict mode + NodeNext.
- `tests/node.test.ts` — vitest harness with a smoke run through the Agenteer runtime.
- `README.md` — placeholder describing the node.
- `.gitignore`

## Options

```bash
npx @agenteer/create-node @acme/node-foo \
  --description "Does the thing." \
  --author "Alice <alice@example.com>" \
  --determinism stochastic \
  --dir ./packages
```

| flag | purpose | default |
|---|---|---|
| `--description <s>` | Sets `framework.json.description` and README intro. | auto-generated |
| `--author <s>` | Sets `package.json.author`. | empty |
| `--determinism <d>` | `deterministic` or `stochastic`. | `deterministic` |
| `--required-action <cap>` | Seed `required_actions` (repeatable). | `[]` |
| `--dir <path>` | Parent directory for the new package. | `.` |
| `--force` | Overwrite if target directory exists. | off |

## Naming convention

Package names must match the Agenteer convention:

```
@<scope>/node-<name>
```

e.g. `@acme/node-bug-triage`. Both the npm name and `framework.json.id` are enforced identical at publish time by `@agenteer/registry`.

## After scaffolding

```bash
cd node-bug-triage
npm install
npm test          # smoke test should pass
npm run build
npx @agenteer/cli publish --dir . --dry-run
npx @agenteer/cli publish --dir .
```

Add `--provenance` when you're publishing from a CI/OIDC environment that supports npm provenance. See the [publishing guide](https://github.com/salehsquared/agenteer/blob/main/docs/publishing-a-node.md) for the full walkthrough, or `npx @agenteer/cli install <your-package> --workflow-dir ./my-workflow` to try it from a fresh workflow.

## License

MIT — see LICENSE.
