# agenteer

Convenience package for Agenteer. It installs the scoped runtime packages together, exposes the `agenteer` CLI, and provides namespace exports for each package.

```bash
npm install agenteer
```

For a global CLI install:

```bash
npm install -g agenteer
agenteer --help
create-agenteer-node --help
```

## Imports

The root export re-exports `@agenteer/core` and provides namespaces for the rest of the framework:

```ts
import { Runtime, InMemoryContextStore, stdlib, trust, registry } from "agenteer";

const store = new InMemoryContextStore();
```

You can also import each package through a subpath:

```ts
import { registerStdlib } from "agenteer/stdlib";
import { scaffoldNode } from "agenteer/create-node";
```

## Included Packages

- `@agenteer/core`
- `@agenteer/trust`
- `@agenteer/stdlib`
- `@agenteer/registry`
- `@agenteer/cli`
- `@agenteer/create-node`

The implementation remains in the scoped packages; `agenteer` is the unscoped bundle for users who want one install target.
