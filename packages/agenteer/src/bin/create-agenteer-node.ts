#!/usr/bin/env node
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";

const require = createRequire(import.meta.url);
const createNodeIndexPath = require.resolve("@agenteer/create-node");
const createNodeBinPath = join(dirname(createNodeIndexPath), "bin/create-node.js");

await import(pathToFileURL(createNodeBinPath).href);
