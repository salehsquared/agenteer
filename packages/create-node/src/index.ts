/**
 * `@agenteer/create-node` — scaffold a new node package ready to publish.
 *
 * Library form: `scaffoldNode({ targetDir, packageName, description?, ... })`.
 * CLI form:     `npx @agenteer/create-node my-triage-node` (or with flags).
 *
 * The scaffold produces a minimal TypeScript package with:
 *   - package.json  (correct scope convention, keywords, framework pointer)
 *   - framework.json (Zod-free JSON Schema input/output; runtime wraps via ajv)
 *   - src/index.ts  (Node factory skeleton + Zod schemas)
 *   - tsconfig.json
 *   - tests/node.test.ts (vitest harness)
 *   - README.md
 *
 * We deliberately DO NOT depend on @agenteer/core here — this package
 * runs under `npx` before the user has any dependency. The templates
 * reference @agenteer/core at runtime; the generated package.json
 * lists it as a peer / regular dep.
 */

import { mkdir, writeFile, access } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";

export interface ScaffoldNodeOptions {
  /** Where to create the package. A new directory named `<packageName after slash>`. */
  targetDir: string;
  /** `@scope/node-name`. Must match the plan's convention. */
  packageName: string;
  /** framework.json.description + README intro. */
  description?: string;
  /** Author name/email for package.json. */
  author?: string;
  /** `"deterministic" | "stochastic"`. Defaults to deterministic. */
  determinism?: "deterministic" | "stochastic";
  /** Initial required_actions list. Defaults to []. */
  requiredActions?: readonly string[];
  /** Overwrite existing files if present. Default: refuse. */
  force?: boolean;
}

const NAME_RE = /^@[a-z0-9][a-z0-9_-]*\/node-[a-z0-9][a-z0-9_-]*$/;

export interface ScaffoldNodeResult {
  /** Absolute path to the created package directory. */
  packageDir: string;
  /** Files written, relative to packageDir. */
  filesWritten: string[];
}

export async function scaffoldNode(opts: ScaffoldNodeOptions): Promise<ScaffoldNodeResult> {
  if (!NAME_RE.test(opts.packageName)) {
    throw new Error(
      `create-node: invalid package name '${opts.packageName}'. ` +
        `Expected '@<scope>/node-<name>', e.g. '@acme/node-bug-triage'.`,
    );
  }
  const nodeShortName = opts.packageName.split("/")[1]!; // after '/'
  const packageDir = resolve(opts.targetDir, nodeShortName);
  await assertEmptyOrForce(packageDir, opts.force === true);

  const description =
    opts.description ?? `Agenteer node: ${nodeShortName.replace(/^node-/, "")}.`;
  const determinism = opts.determinism ?? "deterministic";
  const requiredActions = opts.requiredActions ?? [];
  const author = opts.author ?? "";
  const scaffoldVersion = "0.1.0";

  const files: Record<string, string> = {
    "package.json": templatePackageJson({
      packageName: opts.packageName,
      description,
      author,
      version: scaffoldVersion,
    }),
    "framework.json": templateFrameworkJson({
      packageName: opts.packageName,
      description,
      determinism,
      requiredActions,
      version: scaffoldVersion,
    }),
    "tsconfig.json": templateTsconfig(),
    "src/index.ts": templateSrcIndex(opts.packageName, determinism),
    "tests/node.test.ts": templateTest(opts.packageName),
    "README.md": templateReadme(opts.packageName, description),
    "LICENSE": templateLicense(author),
    ".gitignore": `node_modules\ndist\n*.tsbuildinfo\n`,
  };

  const filesWritten: string[] = [];
  for (const [rel, content] of Object.entries(files)) {
    const full = join(packageDir, rel);
    await mkdir(dirname(full), { recursive: true });
    await writeFile(full, content, "utf-8");
    filesWritten.push(rel);
  }
  return { packageDir, filesWritten };
}

async function assertEmptyOrForce(dir: string, force: boolean): Promise<void> {
  try {
    await access(dir);
  } catch {
    return; // doesn't exist — we'll create it
  }
  if (force) return;
  throw new Error(
    `create-node: '${dir}' already exists. Pass --force to overwrite, or choose a different target directory.`,
  );
}

// ----- templates --------------------------------------------------------

function templatePackageJson(args: {
  packageName: string;
  description: string;
  author: string;
  version: string;
}): string {
  return (
    JSON.stringify(
      {
        name: args.packageName,
        version: args.version,
        description: args.description,
        type: "module",
        main: "./dist/index.js",
        types: "./dist/index.d.ts",
        license: "MIT",
        ...(args.author ? { author: args.author } : {}),
        keywords: ["framework-node"],
        framework: {
          manifest: "./framework.json",
        },
        exports: {
          ".": {
            types: "./dist/index.d.ts",
            default: "./dist/index.js",
          },
        },
        files: ["dist", "src", "framework.json", "LICENSE", "README.md"],
        scripts: {
          build: "tsc -b",
          test: "vitest run",
          prepublishOnly: "tsc -b",
        },
        dependencies: {
          "@agenteer/core": "^1.0.0-rc.2",
          zod: "^4.3.6",
        },
        devDependencies: {
          "@types/node": "^22.0.0",
          typescript: "^5.9.3",
          vitest: "^3.2.4",
        },
      },
      null,
      2,
    ) + "\n"
  );
}

function templateFrameworkJson(args: {
  packageName: string;
  description: string;
  determinism: "deterministic" | "stochastic";
  requiredActions: readonly string[];
  version: string;
}): string {
  return (
    JSON.stringify(
      {
        manifest_version: 1,
        id: args.packageName,
        version: args.version,
        name: args.packageName.split("/")[1]!.replace(/^node-/, "").replace(/-/g, "_"),
        description: args.description,
        determinism: args.determinism,
        required_actions: [...args.requiredActions],
        tags: [],
        input_schema: {
          type: "object",
          required: ["question"],
          properties: {
            question: { type: "string", minLength: 1 },
          },
          additionalProperties: false,
        },
        output_schema: {
          type: "object",
          required: ["answer"],
          properties: {
            answer: { type: "string" },
          },
          additionalProperties: false,
        },
      },
      null,
      2,
    ) + "\n"
  );
}

function templateTsconfig(): string {
  return (
    JSON.stringify(
      {
        compilerOptions: {
          target: "ES2022",
          module: "NodeNext",
          moduleResolution: "NodeNext",
          lib: ["ES2022"],
          strict: true,
          esModuleInterop: true,
          skipLibCheck: true,
          declaration: true,
          outDir: "./dist",
          rootDir: "./src",
        },
        include: ["src/**/*"],
        exclude: ["node_modules", "dist", "tests"],
      },
      null,
      2,
    ) + "\n"
  );
}

function templateSrcIndex(packageName: string, determinism: "deterministic" | "stochastic"): string {
  const shortName = packageName.split("/")[1]!.replace(/^node-/, "").replace(/-/g, "_");
  return `/**
 * ${packageName} — Agenteer node.
 *
 * Exports the runtime Node factory. The published \`framework.json\`
 * carries the manifest + JSON Schemas that the Agenteer runtime uses
 * when nobody registers us programmatically (the ajv bridge wraps the
 * JSON Schemas in Zod-shaped validators at install).
 */

import { z } from "zod";
import {
  makeManifest,
  type Node,
  type NodeInput,
  type NodeResult,
} from "@agenteer/core";

const MANIFEST = makeManifest({
  id: "${packageName}",
  name: "${shortName}",
  description: "TODO: describe what this node does in one sentence.",
  determinism: "${determinism}",
  required_actions: [],
});

const InputSchema = z.object({
  question: z.string().min(1),
});
type Input = z.input<typeof InputSchema>;

const OutputSchema = z.object({
  answer: z.string(),
});
type Output = z.infer<typeof OutputSchema>;

export function nodeFactory(): Node<Input, Output> {
  return {
    manifest: MANIFEST,
    inputSchema: InputSchema,
    outputSchema: OutputSchema,
    ctx: [],
    model: null,
    async execute(input: NodeInput<Input>): Promise<NodeResult<Output>> {
      const { question } = input.original;
      // TODO: replace with your node's logic.
      return {
        kind: "output",
        value: { answer: \`echo: \${question}\` },
        evidence: { verdict: "pass" },
      };
    },
  };
}

export const manifest = MANIFEST;
`;
}

function templateTest(packageName: string): string {
  return `import { describe, expect, it } from "vitest";
import {
  InMemoryContextStore,
  InMemoryNodeRegistry,
  MemoryEvidenceSink,
  Runtime,
} from "@agenteer/core";
import { nodeFactory, manifest } from "../src/index.js";

describe("${packageName}", () => {
  it("smoke: runs and returns output with the declared schema", async () => {
    const registry = new InMemoryNodeRegistry();
    registry.register(manifest, nodeFactory);
    const runtime = new Runtime({
      registry,
      contextStore: new InMemoryContextStore(),
      evidenceSink: new MemoryEvidenceSink(),
    });
    const outcome = await runtime.run(
      { manifest_id: manifest.id, input: { question: "hello" }, correlation: "root" },
      [\`spawn:\${manifest.id}\`],
    );
    expect(outcome.finalStatus).toBe("completed");
    if (outcome.rootResult?.kind !== "output") throw new Error("unreachable");
    const v = outcome.rootResult.value as { answer: string };
    expect(v.answer).toMatch(/hello/);
  });
});
`;
}

function templateReadme(packageName: string, description: string): string {
  return `# ${packageName}

${description}

An [Agenteer](https://github.com/salehsquared/agenteer) node package.

## Install (into a workflow)

\`\`\`bash
npx @agenteer/cli install ${packageName} --workflow-dir ./my-workflow
\`\`\`

## Develop

\`\`\`bash
npm install
npm test
npm run build
\`\`\`

## Publish

\`\`\`bash
# Validate first, then publish. Add --provenance in CI/OIDC when desired.
npx @agenteer/cli publish --dir . --dry-run
npx @agenteer/cli publish --dir .
\`\`\`

See \`docs/publishing-a-node.md\` in the agenteer repo for the full flow.

## Versioning

\`framework.json.version\` must match \`package.json.version\`. The registry
rejects publishes where they drift. Bump both when you cut a release.

## Edit

- \`framework.json\` — the published manifest. Keep \`id\` in sync with \`package.json\` \`name\` and \`version\` in sync with \`package.json\` \`version\`.
- \`src/index.ts\` — runtime logic. Replace the TODO.
- \`tests/node.test.ts\` — vitest harness; expand as the node grows.
`;
}

function templateLicense(author: string): string {
  const year = new Date().getFullYear();
  const holder = author.trim() !== "" ? author : "the package author";
  return `MIT License

Copyright (c) ${year} ${holder}

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
`;
}
