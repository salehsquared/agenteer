#!/usr/bin/env node
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";

const require = createRequire(import.meta.url);
const cliIndexPath = require.resolve("@agenteer/cli");
const cliBinPath = join(dirname(cliIndexPath), "bin/agenteer.js");

await import(pathToFileURL(cliBinPath).href);
