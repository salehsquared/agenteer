#!/usr/bin/env node
/**
 * `agenteer` — CLI entrypoint.
 *
 * Subcommands:
 *   run      --spec <file.json> --session <dir> [--model <id>]*
 *   resume   --session <dir> [--model <id>]*
 *   ctx      list|get|lineage|diff --session <dir> [subcommand args]
 *   inspect  --session <dir>
 *
 * Everything here is a thin shell over the library functions exported
 * from `@agenteer/cli`. Keeping the bin minimal means scripted / embedded
 * users don't pay for argv parsing they don't need.
 */

import { readFile } from "node:fs/promises";
import { parse as parseYaml } from "yaml";
import { parseArgs, flagString, flagList, requireFlagString } from "../util/args.js";
import { runWorkflow, WorkflowSpecSchema } from "../commands/run.js";
import { resumeWorkflow } from "../commands/resume.js";
import {
  ctxDiff,
  ctxGet,
  ctxLineage,
  ctxList,
} from "../commands/ctx.js";
import {
  inspectSession,
  renderInspectReport,
  renderCtxTimeline,
  renderEvidenceTree,
  renderPermissionDenials,
} from "../commands/inspect.js";
import { buildProviderForModels } from "../providers/index.js";
import {
  publishCommand,
  renderPublishResult,
} from "../commands/publish.js";
import {
  installCommand,
  renderInstallResult,
  cliConfirm,
} from "../commands/install.js";
import { searchCommand, renderSearchHits } from "../commands/search.js";
import {
  labMedbreviaNhanesCommand,
  renderLabMedbreviaNhanesResult,
} from "../commands/lab.js";
import {
  researchDesignCommand,
  researchCritiquePacketCommand,
  researchApprovePacketCommand,
  researchAnalyzeLocalCommand,
  researchCheckpointCommand,
  researchArtifactManifestCommand,
  researchLoopStatusCommand,
  researchLoopNoteCommand,
  researchRunnerSpecCommand,
  researchExportPacketCommand,
  researchPipelineStagesCommand,
  researchReviewReportCommand,
  researchInspectPacketCommand,
  researchQuestionsCommand,
  researchScoutPlanCommand,
  renderResearchPacketCritique,
  renderResearchApproval,
  renderResearchAnalysisResult,
  renderResearchCheckpoint,
  renderResearchCheckpointJson,
  renderResearchArtifactManifest,
  renderResearchLoopStatus,
  renderResearchLoopStatusJson,
  renderResearchLoopNote,
  renderResearchRunnerSpec,
  renderResearchPacketExport,
  renderResearchPipelineStages,
  renderResearchPipelineStagesJson,
  renderResearchReportReview,
  renderResearchPacketInspect,
  renderResearchDesignResult,
  renderResearchQuestions,
  renderResearchScoutPlan,
  type ResearchProject,
} from "../commands/research.js";

async function main(argv: readonly string[]): Promise<number> {
  const [cmd, ...rest] = argv;
  switch (cmd) {
    case undefined:
    case "--help":
    case "-h":
    case "help":
      printHelp();
      return 0;
    case "run":
      return runCmd(rest);
    case "resume":
      return resumeCmd(rest);
    case "ctx":
      return ctxCmd(rest);
    case "inspect":
      return inspectCmd(rest);
    case "publish":
      return publishCmd(rest);
    case "install":
      return installCmd(rest);
    case "search":
      return searchCmd(rest);
    case "lab":
      return labCmd(rest);
    case "research":
      return researchCmd(rest);
    default:
      console.error(`unknown command: ${cmd}`);
      printHelp();
      return 2;
  }
}

function printHelp(): void {
  const help = `
agenteer — run and inspect Agenteer workflows.

Usage:
  agenteer run     --spec <file> --session <dir> [--model <id>]*
  agenteer resume  --session <dir> [--model <id>]* [--no-interactive]
  agenteer ctx     <list|get|lineage|diff> --session <dir> [...]
  agenteer inspect --session <dir> [--ctx-timeline | --evidence | --denials | --summary]
  agenteer publish --dir <pkg-dir> [--provenance] [--dry-run] [--registry <url>]
  agenteer install <spec>  --workflow-dir <dir> [--yes] [--grant <cap>]* [--registry <url>]
  agenteer search  <query> [--registry <url>]
  agenteer lab     medbrevia-nhanes --repo <medbrevia_v3> --question <text> [--out <dir>]
  agenteer research design --project medbrevia-nhanes --repo <medbrevia_v3> --question <text> [--out <dir>]
  agenteer research questions --project medbrevia-nhanes --repo <medbrevia_v3> [--limit <n>]
  agenteer research stages [--json]
  agenteer research inspect --packet <dir>
  agenteer research critique --packet <dir>
  agenteer research scout --packet <dir>
  agenteer research approve --packet <dir> [--note <text>]
  agenteer research analyze --packet <dir> --fixture <rows.json>
  agenteer research review-report --packet <dir>
  agenteer research manifest --packet <dir>
  agenteer research runner-spec --packet <dir>
  agenteer research export --packet <dir> --out <dir>
  agenteer research loop-status [--state <dir>] [--json]
  agenteer research loop-note --cycle <n> --summary <text> [--next <text>] [--state <dir>]
  agenteer research checkpoint --packet <dir> [--json]

Common flags:
  --session <dir>   Session directory (context/ + evidence/ + session.yaml)
  --model <id>      Repeatable. Builds providers for claude-*/gpt-* ids.
`.trim();
  console.log(help);
}

async function runCmd(argv: readonly string[]): Promise<number> {
  const { flags } = parseArgs(argv);
  const specPath = requireFlagString(flags, "spec");
  const sessionDir = requireFlagString(flags, "session");
  const specRaw = await loadSpec(specPath);
  const spec = WorkflowSpecSchema.parse(specRaw);

  const modelIds = collectModelIds(flags, spec.model_ids);
  const modelProvider = modelIds.length > 0 ? buildProviderForModels({ modelIds }) : undefined;

  const { outcome, sessionId } = await runWorkflow({
    sessionDir,
    spec,
    ...(modelProvider ? { modelProvider } : {}),
  });
  console.log(
    `run: session=${sessionId} status=${outcome.finalStatus} steps=${outcome.totalSteps}`,
  );
  if (outcome.finalStatus === "suspended") console.log(`  resume with: agenteer resume --session ${sessionDir}`);
  if (outcome.finalStatus === "failed" && outcome.rootResult?.kind === "failed") {
    explainRunFailure(outcome.rootResult, spec.granted);
  }
  return outcome.finalStatus === "completed" ? 0 : 1;
}

async function resumeCmd(argv: readonly string[]): Promise<number> {
  const { flags } = parseArgs(argv);
  const sessionDir = requireFlagString(flags, "session");
  const interactive = flags["no-interactive"] !== true;
  const modelIds = collectModelIds(flags, []);
  const modelProvider = modelIds.length > 0 ? buildProviderForModels({ modelIds }) : undefined;

  const { outcome, sessionId } = await resumeWorkflow({
    sessionDir,
    interactive,
    ...(modelProvider ? { modelProvider } : {}),
  });
  console.log(`resume: session=${sessionId} status=${outcome.finalStatus}`);
  if (outcome.finalStatus === "failed" && outcome.rootResult?.kind === "failed") {
    explainRunFailure(outcome.rootResult, []);
  }
  return outcome.finalStatus === "completed" ? 0 : 1;
}

/**
 * When a runtime run fails, render an actionable explanation — not just
 * `reason: "..."`. Matches `explainPermissionDenial` output when the
 * failure is a spawn denial; falls back to the raw reason otherwise.
 */
function explainRunFailure(
  result: { reason: string; details?: unknown },
  grants: readonly string[],
): void {
  if (result.reason.startsWith("root_spawn_denied") || result.reason.startsWith("permission_denied")) {
    const missing = (result.details as { missing?: string[] } | undefined)?.missing ?? [];
    console.error(``);
    console.error(`failure: ${result.reason}`);
    if (missing.length > 0) {
      console.error(`  missing caps:`);
      for (const c of missing) console.error(`    - ${c}`);
    }
    if (grants.length > 0) {
      console.error(`  current grants:`);
      for (const c of grants) console.error(`    - ${c}`);
    }
    console.error(`  fix: add the missing cap(s) to your workflow spec's 'granted' list,`);
    console.error(`       or attenuate the spawn via NodeSpawn.attenuate to disclaim them.`);
    return;
  }
  if (result.reason === "input_schema_violation" || result.reason === "output_schema_violation") {
    const issues = Array.isArray(result.details) ? result.details : [];
    console.error(``);
    console.error(`failure: ${result.reason}`);
    for (const issue of issues as Array<{ path?: unknown[]; message?: string }>) {
      const path = Array.isArray(issue.path) ? issue.path.join(".") || "<root>" : "<root>";
      console.error(`  [${path}] ${issue.message ?? "invalid"}`);
    }
    return;
  }
  console.error(``);
  console.error(`failure: ${result.reason}`);
}

async function ctxCmd(argv: readonly string[]): Promise<number> {
  const [sub, ...rest] = argv;
  const { flags } = parseArgs(rest);
  const sessionDir = requireFlagString(flags, "session");
  switch (sub) {
    case "list": {
      const entries = await ctxList(sessionDir, {
        ...(flagString(flags, "tag") ? { tag: flagString(flags, "tag")! } : {}),
      });
      for (const e of entries) {
        const tag = e.tag ? ` tag=${e.tag}` : "";
        const stale = e.stale ? " STALE" : "";
        console.log(`  ${e.timestamp} ${e.type} ${e.id}${tag}${stale}`);
      }
      console.log(`  (${entries.length} items)`);
      return 0;
    }
    case "get": {
      const id = requireFlagString(flags, "id");
      const item = await ctxGet(sessionDir, id);
      if (!item) {
        console.error(`not found: ${id}`);
        return 1;
      }
      console.log(JSON.stringify(item, null, 2));
      return 0;
    }
    case "lineage": {
      const id = requireFlagString(flags, "id");
      const items = await ctxLineage(sessionDir, id);
      for (const i of items) {
        console.log(`  ${i.provenance.timestamp} ${i.id} (${i.type})`);
      }
      return 0;
    }
    case "diff": {
      const id1 = requireFlagString(flags, "left");
      const id2 = requireFlagString(flags, "right");
      const res = await ctxDiff(sessionDir, id1, id2);
      console.log(res.text);
      return 0;
    }
    default:
      console.error(`ctx: unknown subcommand '${sub ?? ""}'`);
      return 2;
  }
}

async function inspectCmd(argv: readonly string[]): Promise<number> {
  const { flags } = parseArgs(argv);
  const sessionDir = requireFlagString(flags, "session");
  const report = await inspectSession(sessionDir);
  // When a specific view flag is given, show only that section. Default:
  // summary + all three detail views.
  const showAll =
    flags["ctx-timeline"] !== true &&
    flags["evidence"] !== true &&
    flags["denials"] !== true;
  if (showAll || flags["summary"] === true) {
    console.log(renderInspectReport(report));
  }
  if (showAll || flags["ctx-timeline"] === true) {
    console.log("");
    console.log(renderCtxTimeline(report.ctx_timeline));
  }
  if (showAll || flags["evidence"] === true) {
    console.log("");
    console.log(renderEvidenceTree(report.evidence_tree));
  }
  if (showAll || flags["denials"] === true) {
    console.log("");
    console.log(renderPermissionDenials(report.permission_denials));
  }
  return 0;
}

async function publishCmd(argv: readonly string[]): Promise<number> {
  const { flags } = parseArgs(argv);
  const pkgDir = requireFlagString(flags, "dir");
  const result = await publishCommand({
    pkgDir,
    provenance: flags["provenance"] === true,
    dryRun: flags["dry-run"] === true,
    ...(flagString(flags, "registry") ? { registry: flagString(flags, "registry")! } : {}),
  });
  console.log(renderPublishResult(result));
  return result.ok ? 0 : 1;
}

async function installCmd(argv: readonly string[]): Promise<number> {
  const { positional, flags } = parseArgs(argv);
  const spec = positional[0];
  if (!spec) {
    console.error("install: missing package spec (e.g. @acme/node-bug-triage@^1.4.0)");
    return 2;
  }
  const workflowDir = requireFlagString(flags, "workflow-dir");
  const autoApprove = flags["yes"] === true;
  const grants = collectStringList(flags, "grant");
  const result = await installCommand({
    workflowDir,
    spec,
    autoApprove,
    grants,
    ...(flagString(flags, "registry") ? { registry: flagString(flags, "registry")! } : {}),
    confirm: (s) => cliConfirm({ summary_text: s.summary_text }),
  });
  console.log(renderInstallResult(result));
  return result.ok ? 0 : 1;
}

async function searchCmd(argv: readonly string[]): Promise<number> {
  const { positional, flags } = parseArgs(argv);
  const query = positional.join(" ").trim();
  if (!query) {
    console.error("search: missing query");
    return 2;
  }
  const hits = await searchCommand(query, {
    ...(flagString(flags, "registry") ? { registry: flagString(flags, "registry")! } : {}),
  });
  console.log(renderSearchHits(hits));
  return 0;
}

async function labCmd(argv: readonly string[]): Promise<number> {
  const [sub, ...rest] = argv;
  const { flags } = parseArgs(rest);
  switch (sub) {
    case "medbrevia-nhanes": {
      const repoDir = requireFlagString(flags, "repo");
      const question = requireFlagString(flags, "question");
      const result = await labMedbreviaNhanesCommand({
        repoDir,
        question,
        ...(flagString(flags, "out") ? { outDir: flagString(flags, "out")! } : {}),
      });
      console.log(renderLabMedbreviaNhanesResult(result));
      if (result.outDir) console.log(`wrote: ${result.outDir}`);
      return result.diagnostics.blockers.length ? 1 : 0;
    }
    default:
      console.error(`lab: unknown subcommand '${sub ?? ""}'`);
      console.error("usage: agenteer lab medbrevia-nhanes --repo <medbrevia_v3> --question <text> [--out <dir>]");
      return 2;
  }
}

async function researchCmd(argv: readonly string[]): Promise<number> {
  const [sub, ...rest] = argv;
  const { flags } = parseArgs(rest);
  switch (sub) {
    case "design": {
      const project = requireFlagString(flags, "project") as ResearchProject;
      const repoDir = requireFlagString(flags, "repo");
      const question = requireFlagString(flags, "question");
      const result = await researchDesignCommand({
        project,
        repoDir,
        question,
        ...(flagString(flags, "out") ? { outDir: flagString(flags, "out")! } : {}),
      });
      console.log(renderResearchDesignResult(result));
      if (result.outDir) console.log(`wrote: ${result.outDir}`);
      return result.diagnostics.blockers.length ? 1 : 0;
    }
    case "questions": {
      const project = requireFlagString(flags, "project") as ResearchProject;
      const repoDir = requireFlagString(flags, "repo");
      const limitText = flagString(flags, "limit");
      const limit = limitText ? Number.parseInt(limitText, 10) : undefined;
      const candidates = await researchQuestionsCommand({
        project,
        repoDir,
        ...(Number.isFinite(limit) && limit! > 0 ? { limit } : {}),
      });
      console.log(renderResearchQuestions(candidates));
      return 0;
    }
    case "stages": {
      const stages = researchPipelineStagesCommand();
      console.log(flags.json === true ? renderResearchPipelineStagesJson(stages) : renderResearchPipelineStages(stages));
      return 0;
    }
    case "inspect": {
      const packetDir = requireFlagString(flags, "packet");
      const result = await researchInspectPacketCommand(packetDir);
      console.log(renderResearchPacketInspect(result));
      return result.blockers ? 1 : 0;
    }
    case "critique": {
      const packetDir = requireFlagString(flags, "packet");
      const result = await researchCritiquePacketCommand(packetDir);
      console.log(renderResearchPacketCritique(result));
      return result.status === "blocked" ? 1 : 0;
    }
    case "scout": {
      const packetDir = requireFlagString(flags, "packet");
      const result = await researchScoutPlanCommand(packetDir, flagString(flags, "fixture"));
      console.log(renderResearchScoutPlan(result));
      return 0;
    }
    case "approve": {
      const packetDir = requireFlagString(flags, "packet");
      const result = await researchApprovePacketCommand(packetDir, flagString(flags, "note") ?? "");
      console.log(renderResearchApproval(result));
      return 0;
    }
    case "analyze": {
      const packetDir = requireFlagString(flags, "packet");
      const fixture = requireFlagString(flags, "fixture");
      const result = await researchAnalyzeLocalCommand(packetDir, fixture);
      console.log(renderResearchAnalysisResult(result));
      return 0;
    }
    case "review-report": {
      const packetDir = requireFlagString(flags, "packet");
      const result = await researchReviewReportCommand(packetDir);
      console.log(renderResearchReportReview(result));
      return result.status === "pass" ? 0 : 1;
    }
    case "manifest": {
      const packetDir = requireFlagString(flags, "packet");
      const result = await researchArtifactManifestCommand(packetDir);
      console.log(renderResearchArtifactManifest(result));
      return 0;
    }
    case "runner-spec": {
      const packetDir = requireFlagString(flags, "packet");
      const result = await researchRunnerSpecCommand(packetDir);
      console.log(renderResearchRunnerSpec(result));
      return 0;
    }
    case "export": {
      const packetDir = requireFlagString(flags, "packet");
      const outDir = requireFlagString(flags, "out");
      const result = await researchExportPacketCommand(packetDir, outDir);
      console.log(renderResearchPacketExport(result));
      return 0;
    }
    case "loop-status": {
      const result = await researchLoopStatusCommand(flagString(flags, "state") ?? undefined);
      console.log(flags.json === true ? renderResearchLoopStatusJson(result) : renderResearchLoopStatus(result));
      return result.stateExists ? 0 : 1;
    }
    case "loop-note": {
      const cycleText = requireFlagString(flags, "cycle");
      const cycle = Number.parseInt(cycleText, 10);
      if (!Number.isFinite(cycle) || cycle < 1) throw new Error("research loop-note: --cycle must be a positive integer");
      const result = await researchLoopNoteCommand({
        cycle,
        summary: requireFlagString(flags, "summary"),
        ...(flagString(flags, "next") ? { nextAction: flagString(flags, "next")! } : {}),
        ...(flagString(flags, "state") ? { stateDir: flagString(flags, "state")! } : {}),
      });
      console.log(renderResearchLoopNote(result));
      return 0;
    }
    case "checkpoint": {
      const packetDir = requireFlagString(flags, "packet");
      const result = await researchCheckpointCommand(packetDir);
      console.log(flags.json === true ? renderResearchCheckpointJson(result) : renderResearchCheckpoint(result));
      return 0;
    }
    default:
      console.error(`research: unknown subcommand '${sub ?? ""}'`);
      console.error("usage: agenteer research design --project medbrevia-nhanes --repo <medbrevia_v3> --question <text> [--out <dir>]");
      return 2;
  }
}

function collectStringList(
  flags: Parameters<typeof flagList>[0],
  key: string,
): string[] {
  return flagList(flags, key);
}

async function loadSpec(path: string): Promise<unknown> {
  const raw = await readFile(path, "utf-8");
  if (path.endsWith(".json")) return JSON.parse(raw);
  return parseYaml(raw);
}

function collectModelIds(
  flags: Parameters<typeof flagList>[0],
  extras: readonly string[],
): string[] {
  return [...extras, ...flagList(flags, "model")];
}

main(process.argv.slice(2))
  .then((code) => process.exit(code))
  .catch((err) => {
    console.error(err instanceof Error ? err.stack ?? err.message : String(err));
    process.exit(1);
  });
