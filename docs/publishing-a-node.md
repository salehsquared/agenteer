# Publishing a node

This guide walks through building, validating, and publishing a community
Agenteer node — the kind that installs via `agenteer install @you/node-foo`.
If you're writing a node for internal use only, skip the publish step;
everything else applies.

## 1. Scaffold the package

```bash
npx @agenteer/create-node @acme/node-bug-triage
cd node-bug-triage
npm install
npm test
```

The scaffold ships:

| File | Purpose |
|---|---|
| `package.json` | Declares `@acme/node-bug-triage`, marks `framework-node` keyword, points `framework.manifest` at `./framework.json`. |
| `framework.json` | The published manifest: id, version, description, determinism, `required_actions`, JSON Schemas for input/output. |
| `src/index.ts` | Runtime Node factory. Replace the TODO. |
| `tests/node.test.ts` | A vitest smoke test that spins up a real `Runtime` and runs your node. |
| `README.md` | User-facing docs. |

## 2. Write the node

Edit `src/index.ts`. The key contract (sub-plan 00 §3):

- Return a `NodeResult` union: `output`, `replace_me`, `spawn_children`, `needs_user`, or `failed`.
- Declare `required_actions` in `framework.json` — anything you'll `callAction` for (`shell.exec:`, `net.http:api.example.com/**`, `model:claude-*`, `tool:gh`, `spawn:@other/node-*`).
- Keep determinism honest: if your node calls an LLM, set `"determinism": "stochastic"`. The runtime uses this to decide caching eligibility (v1.1) and to set expectations for resume behavior.

## 3. Declare input/output schemas

Two supported shapes:

**Zod (programmatic):** wire them directly on the `Node` factory via `inputSchema` / `outputSchema`. This is how the stdlib ships. Fast, typed, no conversion step.

**JSON Schema (published):** drop `input_schema` / `output_schema` objects into `framework.json`. The registry's ajv adapter compiles them into Zod-shaped validators at install time, so runtime validation works whether you shipped Zod or JSON Schema. Use this form if you're writing a node in a non-TypeScript language or don't want a Zod dependency.

Both shapes plug into the same runtime-enforced `input_schema_violation` / `output_schema_violation` error paths.

## 4. Declare capabilities honestly

Your `required_actions` list is the installer's permission-diff basis. Users see exactly which caps you're requesting compared to their workflow's existing grants before approving. Lie here and you lie at install time — the prompt shows your claims verbatim.

Common capability patterns:

| Use case | Capability string |
|---|---|
| Read a tmpfile | `fs.read:/tmp/**` |
| Write a build artifact | `fs.write:/repo/dist/**` |
| Call GitHub's API | `net.http:api.github.com/**` |
| Use a specific model | `model:claude-sonnet-4-5` |
| Use any Claude model | `model:claude-*` |
| Use a custom tool | `tool:gh` |
| Spawn a subtask | `spawn:@acme/node-subtask` |
| Run any shell command | `shell.exec:` (scopeless — command text is not part of the capability grammar; filter commands in the runner) |

Capabilities are globs only — no regex. Wildcards: `*` (one segment) and `**` (multiple). See sub-plan 02 §1.1 for the grammar.

### Dynamic actions

If your node synthesizes capability strings at dispatch time (e.g. `tool_call` with user-supplied tool name), declare:

```json
{
  "dynamic_actions": true,
  "dynamic_action_spec": "tool:${input.tool_name}"
}
```

For THIRD-PARTY nodes with `dynamic_actions: true`, `agenteer install` fires a **hard-stop prompt** even with `--yes`. Users must interactively confirm. This is deliberate: the disclosure flag is the trust boundary. First-party (`@agenteer/*`) packages auto-approve under `--yes`.

## 5. Validate before publishing

```bash
agenteer publish --dir . --dry-run
```

This runs the full publish-time validator — naming convention, keyword, manifest ⇄ package name match, schema shape, capability grammar — without actually uploading. Fix any issues it surfaces; the errors include file paths and concrete fix hints.

## 6. Publish with provenance

For community nodes, provenance is optional (recommended). For `@agenteer/*` scoped packages it's **required** — `agenteer install` blocks scoped installs without provenance attestations.

From a GitHub Actions workflow:

```yaml
- name: publish
  run: agenteer publish --dir . --provenance
  env:
    NPM_TOKEN: ${{ secrets.NPM_TOKEN }}
    # required for --provenance to succeed:
    NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}
```

Locally you can publish without provenance:

```bash
agenteer publish --dir .
```

`agenteer publish` wraps `npm publish`; all npm auth mechanics apply verbatim.

## 7. Post-publish: what users see

When someone runs `agenteer install @acme/node-bug-triage`, they'll see:

```
Installing @acme/node-bug-triage@1.0.0
  Description: Triages GitHub issues by severity and assigns labels.
  License:     MIT
  Provenance:  [OK] (https://slsa.dev/provenance/v1)
  Required actions:
    - net.http:api.github.com/**
    - context.read:issue.*
    - context.write:triage.*
  These permissions exceed your current workflow root by:
    + net.http:api.github.com/**   (not currently granted)
Proceed? (y/N)
```

That's your package's landing page for every installer. Your `description`, your `license`, your capability claims — all visible, all accountable. Make them clean.

## Verifying locally with verdaccio

See `packages/registry/VERDACCIO.md` in the agenteer repo for a five-minute walkthrough: start verdaccio, `npm publish` against it, `agenteer install` from it, confirm the permission-diff prompt + provenance check behave as documented.

## Troubleshooting

**`bad_package_name`** — package.json `name` must match `@<scope>/node-<name>`. Rename and republish.

**`id_mismatch`** — `framework.json` `id` must match `package.json` `name`. Keep them synced; the scaffold does this by default.

**`missing_framework_keyword`** — add `framework-node` to `package.json` `keywords` so `agenteer search` indexes your package.

**`input_schema_violation`** — runtime rejected a call before your code ran. Check `framework.json`'s `input_schema` against what the caller actually passed. The CLI's `agenteer inspect --session <dir> --denials` shows the offending path.

**`first_party_provenance_required`** — only affects `@agenteer/*`. Publish with `--provenance` from GitHub Actions.

**`third_party_dynamic_actions_requires_confirmation`** — your `dynamic_actions: true` node was installed with `--yes`; per R4-A that's ignored for third-party. Re-run the install interactively, or pass a `confirm` callback when calling `installNode` programmatically.
