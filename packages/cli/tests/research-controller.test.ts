import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  controllerArtifactReportKindPairs,
  researchControllerAgendaCommand,
  researchControllerAuditCommand,
  researchControllerBenchmarkCommand,
  researchControllerCapabilitiesCommand,
  researchControllerCompletionAuditCommand,
  researchControllerDoctorCommand,
  researchControllerEnvironmentCommand,
  researchControllerFollowAgendaCommand,
  researchControllerFollowLoopCommand,
  researchControllerGoldenPacketCommand,
  researchControllerGoalAuditCommand,
  researchControllerInitCommand,
  researchControllerInspectCommand,
  researchControllerOperateCommand,
  researchControllerPatchCommand,
  researchControllerRepairCycleCommand,
  researchControllerResumeCommand,
  researchControllerRunbookCommand,
  researchControllerRunnerPacketCommand,
  researchControllerRunCommand,
  researchControllerSelfTestCommand,
  researchControllerStepCommand,
  researchControllerStartCommand,
  researchControllerStatusCommand,
  researchControllerSupervisorCommand,
  researchControllerToolCommand,
  renderResearchControllerAgenda,
  renderResearchControllerAudit,
  renderResearchControllerBenchmark,
  renderResearchControllerCapabilities,
  renderResearchControllerCompletionAudit,
  renderResearchControllerEnvironment,
  renderResearchControllerGoalAudit,
  renderResearchControllerDoctor,
  renderResearchControllerFollowAgenda,
  renderResearchControllerFollowLoop,
  renderResearchControllerGoldenPacket,
  renderResearchControllerOperate,
  renderResearchControllerRepairCycle,
  renderResearchControllerRunbook,
  renderResearchControllerRunnerPacket,
  renderResearchControllerSelfTest,
  renderResearchControllerStart,
  renderResearchControllerState,
  renderResearchControllerStatus,
  renderResearchControllerSupervisor,
  type ControllerModelRunnerPacket,
  type ControllerSelfTestResult,
  type ControllerState,
} from "../src/research-machine/controller.js";

const controllerIntegrationTestTimeout = 24 * 60 * 60 * 1000;

vi.setConfig({ testTimeout: controllerIntegrationTestTimeout });

describe("research controller agent", () => {
  it("initializes a durable controller state with GPT-5.4 as the default controller model", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "agenteer-controller-init-"));
    try {
      const state = await researchControllerInitCommand({
        question: "Is exposure associated with outcome?",
        outDir: dir,
        method: "linear-regression",
        outcome: "outcome",
        exposure: "exposure",
      });
      const persisted = JSON.parse(await readFile(path.join(dir, "controller-state.json"), "utf-8")) as { controllerState: ControllerState };

      expect(state.currentStage).toBe("intake");
      expect(state.policy.controller.provider).toBe("openai");
      expect(state.policy.controller.model).toBe("gpt-5.4");
      expect(state.policy.controller.enabled).toBe(false);
      expect(state.issueLedgers).toHaveLength(1);
      expect(state.workPlans).toHaveLength(1);
      expect(state.agendas).toHaveLength(1);
      const stateConsole = renderResearchControllerState(state);
      expect(stateConsole).toContain("latest issue ledger: clear (0 issue(s), 0 blocker)");
      expect(stateConsole).toContain(`issue ledger record: ${state.issueLedgers[0]?.outPath}`);
      expect(stateConsole).toContain(`issue ledger report: ${state.issueLedgers[0]?.reportPath}`);
      expect(stateConsole).toContain("latest agenda: ready");
      expect(stateConsole).toContain(`agenda record: ${state.agendas[0]?.outPath}`);
      expect(stateConsole).toContain(`agenda report: ${state.agendas[0]?.reportPath}`);
      expect(state.artifacts.map(artifact => artifact.kind)).toEqual(expect.arrayContaining(["controller-issue-ledger", "controller-issue-ledger-report", "controller-work-plan", "controller-work-plan-report", "controller-execution-agenda", "controller-execution-agenda-report"]));
      expect(persisted.controllerState.runId).toBe(state.runId);
      const ledger = JSON.parse(await readFile(state.issueLedgers[0]?.outPath ?? "", "utf-8")) as { controllerIssueLedger: { status: string; issues: unknown[]; counts: { blockers: number } } };
      expect(ledger.controllerIssueLedger.status).toBe("clear");
      expect(ledger.controllerIssueLedger.counts.blockers).toBe(0);
      expect(ledger.controllerIssueLedger.issues).toEqual([]);
      const plan = JSON.parse(await readFile(state.workPlans[0]?.outPath ?? "", "utf-8")) as { controllerWorkPlan: { status: string; currentStage: string; items: Array<{ stage: string; status: string; requirement: string }> } };
      expect(plan.controllerWorkPlan.status).toBe("active");
      expect(plan.controllerWorkPlan.currentStage).toBe("intake");
      expect(plan.controllerWorkPlan.items).toEqual(expect.arrayContaining([
        expect.objectContaining({ stage: "intake", status: "in_progress" }),
        expect.objectContaining({ stage: "dataset_feasibility", status: "pending" }),
        expect.objectContaining({ stage: "context", status: "not_applicable" }),
      ]));
      const agenda = JSON.parse(await readFile(state.agendas[0]?.outPath ?? "", "utf-8")) as { controllerExecutionAgenda: { status: string; primaryCommand: string; items: Array<{ kind: string; status: string; command: string }> } };
      expect(agenda.controllerExecutionAgenda.status).toBe("ready");
      expect(agenda.controllerExecutionAgenda.primaryCommand).toMatch(/controller-run --state/);
      expect(agenda.controllerExecutionAgenda.items).toEqual(expect.arrayContaining([
        expect.objectContaining({ kind: "run", status: "executable" }),
      ]));
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("starts a controller run with first-read status and runbook evidence before operation", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "agenteer-controller-start-"));
    try {
      const result = await researchControllerStartCommand({
        question: "Is exposure associated with outcome?",
        outDir: dir,
        method: "linear-regression",
        outcome: "outcome",
        exposure: "exposure",
      });

      expect(result.mode).toBe("status_only");
      expect(result.status).toMatch(/ready|review/);
      expect(result.state.currentStage).toBe("intake");
      expect(result.operateSummary.requested).toBe(false);
      expect(result.statusSummary.recommendedCommand).toMatch(/controller-|run/);
      expect(result.statusSummary.feasibilityReadiness).toBeNull();
      expect(result.statusSummary.feasibilityVerdict).toBeNull();
      expect(result.runbookSummary.firstReadCommand).toContain("controller-status");
      expect(result.runbookSummary.launchCommand).toContain("controller-operate");
      expect(result.artifactPaths.state).toBe(path.join(dir, "controller-state.json"));
      expect(result.artifactPaths.status).toMatch(/controller_status_\d+\.json/);
      expect(result.artifactPaths.runbook).toMatch(/controller_runbook_\d+\.json/);
      expect(await fileExists(result.outPath)).toBe(true);
      expect(await fileExists(result.reportPath)).toBe(true);
      expect(await readFile(result.reportPath, "utf-8")).toContain("Feasibility readiness: (missing)");
      expect(await readFile(result.reportPath, "utf-8")).toContain("Completion evidence pending");
      const startConsole = renderResearchControllerStart(result);
      expect(startConsole).toContain("warnings:");
      expect(startConsole).toContain("- warning: Completion evidence pending");
      expect(startConsole).toContain("launch blockers:");
      expect(startConsole).toContain("evidence=");
      expect(startConsole).toContain("report:");
      expect(startConsole).toContain("controller_start_");

      const persisted = JSON.parse(await readFile(result.statePath, "utf-8")) as { controllerState: ControllerState };
      expect(persisted.controllerState.artifacts.map(artifact => artifact.kind)).toEqual(expect.arrayContaining([
        "controller-start",
        "controller-start-report",
        "controller-status",
        "controller-status-report",
        "controller-runbook",
        "controller-runbook-report",
      ]));
      const capabilities = await researchControllerCapabilitiesCommand({
        statePath: result.statePath,
        reason: "test_start_capability",
      });
      const goldenStartup = capabilities.entries.find(entry => entry.id === "golden_path_startup");
      expect(goldenStartup?.status).toBe("covered");
      expect(goldenStartup?.evidenceRefs).toEqual(expect.arrayContaining([
        result.outPath,
        result.artifactPaths.status,
        result.artifactPaths.runbook,
      ]));
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("can start and operate through the bounded controller path from one command", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "agenteer-controller-start-operate-"));
    try {
      const data = await writeLinearCsv(path.join(dir, "rows.csv"), 50);
      const result = await researchControllerStartCommand({
        question: "Is x associated with y?",
        outDir: path.join(dir, "run"),
        dataPath: data,
        method: "linear-regression",
        outcome: "y",
        exposure: "x",
        operate: true,
        maxCycles: 2,
        maxRounds: 2,
        maxIterationsPerRound: 2,
        maxStepsPerRun: 6,
      });

      expect(result.mode).toBe("operate");
      expect(result.operateSummary.requested).toBe(true);
      expect(result.operateSummary.status).not.toBeNull();
      expect(result.operateSummary.cycles).toBeGreaterThan(0);
      expect(result.artifactPaths.operate).toMatch(/controller_operate_\d+\.json/);
      expect(result.state.actions.map(action => action.action)).toContain("run_analysis");
      expect(result.state.artifacts.map(artifact => artifact.kind)).toEqual(expect.arrayContaining([
        "controller-start",
        "controller-operate",
        "controller-status",
        "controller-runbook",
      ]));
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("turns run-inspection recommended commands into controller agenda items", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "agenteer-controller-inspection-agenda-"));
    try {
      const state = await researchControllerInitCommand({
        question: "Is exposure associated with outcome?",
        outDir: dir,
        method: "linear-regression",
        outcome: "outcome",
        exposure: "exposure",
      });
      await mkdir(state.inputs.runDir, { recursive: true });
      const inspectionPath = path.join(state.inputs.runDir, "run-inspection.json");
      const figureQaCommand = `agenteer research figure-qa --figures ${JSON.stringify(path.join(state.inputs.runDir, "figures.json"))} --out ${JSON.stringify(path.join(state.inputs.runDir, "figure-qa.json"))} --report ${JSON.stringify(path.join(state.inputs.runDir, "figure-qa.md"))}`;
      await writeFile(inspectionPath, `${JSON.stringify({
        schemaVersion: 1,
        runInspection: {
          schemaVersion: 1,
          runDir: state.inputs.runDir,
          readiness: "needs_methods_review",
          recommendedCommands: [
            figureQaCommand,
            `agenteer research run-inspect --run-dir ${JSON.stringify(state.inputs.runDir)} --json`,
          ],
        },
      }, null, 2)}\n`);

      const agenda = await researchControllerAgendaCommand({ statePath: state.statePath, reason: "test run-inspection commands" });

      expect(agenda.sourceArtifacts.runInspection).toBe(inspectionPath);
      expect(agenda.items).toEqual(expect.arrayContaining([
        expect.objectContaining({
          source: "run_inspection",
          kind: "qa",
          command: figureQaCommand,
        }),
        expect.objectContaining({
          source: "run_inspection",
          kind: "inspect",
          command: expect.stringContaining("research run-inspect"),
        }),
      ]));
      const report = await readFile(agenda.reportPath, "utf-8");
      expect(report).toContain("Run inspection:");
      expect(report).toContain("research figure-qa");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("follow-agenda executes bounded run-inspection QA commands", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "agenteer-controller-follow-inspection-qa-"));
    try {
      const state = await researchControllerInitCommand({
        question: "Is exposure associated with outcome?",
        outDir: dir,
        method: "linear-regression",
        outcome: "outcome",
        exposure: "exposure",
      });
      await mkdir(state.inputs.runDir, { recursive: true });
      const figuresPath = path.join(state.inputs.runDir, "figures.json");
      const figureQaPath = path.join(state.inputs.runDir, "figure-qa.json");
      const figureQaReportPath = path.join(state.inputs.runDir, "figure-qa.md");
      await writeFile(figuresPath, `${JSON.stringify({
        schemaVersion: 1,
        figures: [{
          id: "missing-residual-plot",
          path: path.join(state.inputs.runDir, "missing-residual-plot.png"),
          title: "Missing Residual Plot",
          caption: "Fixture figure expected to fail file-exists QA.",
          sourceColumns: ["outcome", "exposure"],
        }],
      }, null, 2)}\n`);
      const figureQaCommand = `agenteer research figure-qa --figures ${JSON.stringify(figuresPath)} --out ${JSON.stringify(figureQaPath)} --report ${JSON.stringify(figureQaReportPath)}`;
      await writeFile(path.join(state.inputs.runDir, "run-inspection.json"), `${JSON.stringify({
        schemaVersion: 1,
        runInspection: {
          schemaVersion: 1,
          runDir: state.inputs.runDir,
          readiness: "needs_methods_review",
          recommendedCommands: [figureQaCommand],
        },
      }, null, 2)}\n`);

      const followed = await researchControllerFollowAgendaCommand({
        statePath: state.statePath,
        reason: "test follow run-inspection QA command",
        maxSteps: 1,
      });

      expect(followed.executed).toBe(true);
      expect(followed.refused).toBe(false);
      expect(followed.selectedItem).toEqual(expect.objectContaining({
        source: "run_inspection",
        kind: "qa",
        command: figureQaCommand,
      }));
      expect(followed.reason).toContain("Executed agenda qa item");
      expect(await fileExists(figureQaPath)).toBe(true);
      expect(await fileExists(figureQaReportPath)).toBe(true);
      expect(followed.state.artifacts).toEqual(expect.arrayContaining([
        expect.objectContaining({ kind: "figure-qa", path: figureQaPath }),
        expect.objectContaining({ kind: "figure-qa-report", path: figureQaReportPath }),
      ]));
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("follow-agenda executes bounded run-inspection manifest commands", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "agenteer-controller-follow-manifest-"));
    try {
      const state = await researchControllerInitCommand({
        question: "Is exposure associated with outcome?",
        outDir: dir,
        method: "linear-regression",
        outcome: "outcome",
        exposure: "exposure",
      });
      await mkdir(state.inputs.runDir, { recursive: true });
      const manifestPath = path.join(state.inputs.runDir, "analysis-run-manifest.json");
      await writeFile(path.join(state.inputs.runDir, "stats-run.json"), `${JSON.stringify({
        status: "succeeded",
        method: "linear-regression",
        resultPosture: {
          status: "bound_standard_table",
          interpretationBoundary: "Fixture local analysis.",
          nextAction: "Proceed to local methods review.",
        },
        completeCaseN: 20,
        estimates: [{ term: "exposure", estimate: 1.2, pValue: 0.04 }],
        diagnostics: {},
        issues: [],
        artifacts: [],
      }, null, 2)}\n`);
      const manifestCommand = `agenteer research analysis-manifest --run-dir ${JSON.stringify(state.inputs.runDir)} --out ${JSON.stringify(manifestPath)} --json`;
      await writeFile(path.join(state.inputs.runDir, "run-inspection.json"), `${JSON.stringify({
        schemaVersion: 1,
        runInspection: {
          schemaVersion: 1,
          runDir: state.inputs.runDir,
          readiness: "needs_methods_review",
          recommendedCommands: [manifestCommand],
        },
      }, null, 2)}\n`);

      const followed = await researchControllerFollowAgendaCommand({
        statePath: state.statePath,
        reason: "test follow run-inspection manifest command",
        maxSteps: 1,
      });

      expect(followed.executed).toBe(true);
      expect(followed.refused).toBe(false);
      expect(followed.selectedItem).toEqual(expect.objectContaining({
        source: "run_inspection",
        kind: "manifest",
        command: manifestCommand,
      }));
      expect(followed.reason).toContain("Executed agenda manifest item");
      expect(await fileExists(manifestPath)).toBe(true);
      expect(followed.state.artifacts).toEqual(expect.arrayContaining([
        expect.objectContaining({ kind: "analysis-run-manifest", path: manifestPath }),
      ]));
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("refreshes a public execution agenda without executing a controller stage", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "agenteer-controller-agenda-"));
    try {
      const state = await researchControllerInitCommand({
        question: "Is x associated with y?",
        outDir: dir,
        method: "linear-regression",
        outcome: "y",
        exposure: "x",
      });
      const beforeActions = state.actions.length;
      const agenda = await researchControllerAgendaCommand({
        statePath: state.statePath,
        reason: "test_agenda_refresh",
      });
      const persisted = JSON.parse(await readFile(state.statePath, "utf-8")) as { controllerState: ControllerState };

      expect(agenda.reason).toBe("test_agenda_refresh");
      expect(agenda.status).toBe("ready");
      expect(agenda.primaryCommand).toMatch(/controller-run --state/);
      expect(agenda.items).toEqual(expect.arrayContaining([
        expect.objectContaining({ kind: "run", status: "executable", safety: "safe" }),
        expect.objectContaining({ kind: "step", status: "executable", safety: "safe" }),
      ]));
      const agendaConsole = renderResearchControllerAgenda(agenda);
      expect(agendaConsole).toContain("issueCodes=none");
      expect(agendaConsole).toContain("evidence=");
      expect(agendaConsole).toContain(`agenda: ${agenda.outPath}`);
      expect(agendaConsole).toContain(`report: ${agenda.reportPath}`);
      expect(persisted.controllerState.actions).toHaveLength(beforeActions);
      expect(persisted.controllerState.agendas.at(-1)?.agendaId).toBe(agenda.agendaId);
      expect(persisted.controllerState.artifacts.map(artifact => artifact.kind)).toEqual(expect.arrayContaining(["controller-execution-agenda", "controller-execution-agenda-report"]));
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("writes a public operator audit with readiness, capability coverage, and blockers", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "agenteer-controller-audit-"));
    try {
      const state = await researchControllerInitCommand({
        question: "Is x associated with y?",
        outDir: path.join(dir, "run"),
        method: "linear-regression",
        outcome: "y",
        exposure: "x",
      });
      const audit = await researchControllerAuditCommand({
        statePath: state.statePath,
        reason: "test_operator_audit",
      });
      expect(audit.status).toMatch(/pass|warning/);
      expect(audit.readiness).toMatch(/ready_to_follow|ready_for_review/);
      expect(audit.defaultControllerModel).toBe("openai:gpt-5.4");
      expect(audit.latestAgenda?.primaryCommand).toMatch(/controller-run --state/);
      expect(audit.checks.map(check => check.id)).toEqual(expect.arrayContaining(["state-integrity", "default-model", "follow-loop-capability", "agenda-primary-command"]));
      expect(audit.environment.repoRoot).toContain("agenteer");
      expect(audit.environment.checks.map(check => check.id)).toEqual(expect.arrayContaining(["repo-root", "package-scripts", "node-runtime", "npm-runtime", "cli-dist", "git-status", "tool-policy"]));
      expect(audit.capabilityCoverage.map(item => item.capability)).toContain("execution_agenda");
      expect(renderResearchControllerAudit(audit)).toContain("readiness blockers: 0");
      expect(renderResearchControllerAudit(audit)).toContain("dataset semantic audit:");
      expect(await fileExists(audit.reportPath)).toBe(true);
      expect(renderResearchControllerAudit(audit)).toContain(`audit: ${audit.outPath}`);
      expect(renderResearchControllerAudit(audit)).toContain(`report: ${audit.reportPath}`);

      const data = path.join(dir, "bad.csv");
      await writeFile(data, "y,x\n1,0\n2,1\n3,2\n");
      const blocked = await researchControllerRunCommand({
        question: "Is x associated with y?",
        outDir: path.join(dir, "blocked"),
        dataPath: data,
        method: "linear-regression",
        outcome: "y",
        exposure: "x",
        maxSteps: 8,
      });
      const blockedAudit = await researchControllerAuditCommand({
        statePath: blocked.state.statePath,
        reason: "test_blocked_operator_audit",
      });
      expect(blockedAudit.status).toBe("fail");
      expect(blockedAudit.readiness).toBe("blocked");
      expect(blockedAudit.checks).toEqual(expect.arrayContaining([
        expect.objectContaining({ id: "feasibility", status: "fail" }),
        expect.objectContaining({ id: "issue-ledger", status: "fail" }),
      ]));
      expect(blockedAudit.nextCommand).toMatch(/controller-patch|controller-status|controller-inspect/);
      const blockedAuditConsole = renderResearchControllerAudit(blockedAudit);
      expect(blockedAuditConsole).toContain("readiness blockers:");
      expect(blockedAuditConsole).toContain("- readiness blocker/");
      for (const blocker of blockedAudit.readinessBlockers.slice(0, 5)) {
        expect(blockedAuditConsole).toContain(`evidence=${blocker.evidenceRefs.slice(0, 3).join(",") || "(none)"}`);
      }
      expect(blockedAuditConsole).toContain(`audit: ${blockedAudit.outPath}`);
      expect(blockedAuditConsole).toContain(`report: ${blockedAudit.reportPath}`);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("writes a controller environment preflight for autonomous runner pickup", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "agenteer-controller-env-"));
    try {
      const state = await researchControllerInitCommand({
        question: "Is x associated with y?",
        outDir: dir,
        method: "linear-regression",
        outcome: "y",
        exposure: "x",
        controller: { enabled: true },
        requireControllerModel: true,
      });
      const preflight = await researchControllerEnvironmentCommand({
        statePath: state.statePath,
        reason: "test_environment_preflight",
      });
      const persisted = JSON.parse(await readFile(state.statePath, "utf-8")) as { controllerState: ControllerState };

      expect(preflight.repoRoot).toContain("agenteer");
      expect(preflight.packageScripts.build).toBe(true);
      expect(preflight.packageScripts.test).toBe(true);
      expect(preflight.nodeVersion).toMatch(/^v/);
      expect(preflight.npmVersion).toBeTruthy();
      expect(preflight.cliDist.path).toMatch(/packages\/cli\/dist\/bin\/agenteer\.js$/);
      expect(preflight.git.available).toBe(true);
      expect(preflight.policy.allowedToolIds).toContain("controller-run-agenteer");
      expect(preflight.checks.map(check => check.id)).toEqual(expect.arrayContaining([
        "repo-root",
        "package-scripts",
        "node-runtime",
        "npm-runtime",
        "cli-dist",
        "git-status",
        "tool-policy",
        "tool-timeout",
      ]));
      const environmentConsole = renderResearchControllerEnvironment(preflight);
      expect(environmentConsole).toContain("failed checks:");
      expect(environmentConsole).toContain("warning checks:");
      for (const check of preflight.checks.filter(check => check.status !== "pass").slice(0, 5)) {
        expect(environmentConsole).toContain(`${check.status} ${check.id}/${check.category}`);
        expect(environmentConsole).toContain(`evidence=${check.evidenceRefs.slice(0, 3).join(",") || "(none)"}`);
      }
      expect(await fileExists(preflight.reportPath)).toBe(true);
      expect(environmentConsole).toContain(`preflight: ${preflight.outPath}`);
      expect(environmentConsole).toContain(`report: ${preflight.reportPath}`);
      expect(persisted.controllerState.artifacts.map(artifact => artifact.kind)).toEqual(expect.arrayContaining([
        "controller-environment-preflight",
        "controller-environment-preflight-report",
      ]));
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("writes a controller capability manifest for model-runner pickup", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "agenteer-controller-capabilities-"));
    try {
      const state = await researchControllerInitCommand({
        question: "Is x associated with y?",
        outDir: dir,
        method: "linear-regression",
        outcome: "y",
        exposure: "x",
      });
      const manifest = await researchControllerCapabilitiesCommand({
        statePath: state.statePath,
        reason: "test_capability_manifest",
      });
      const persisted = JSON.parse(await readFile(state.statePath, "utf-8")) as { controllerState: ControllerState };
      const byId = new Map(manifest.entries.map(entry => [entry.id, entry]));
      const commandCatalog = await readFile(path.resolve("docs/command-catalog.md"), "utf-8");
      const cliHelpSource = await readFile(path.resolve("packages/cli/src/bin/agenteer.ts"), "utf-8");
      const controllerSource = await readFile(path.resolve("packages/cli/src/research-machine/controller.ts"), "utf-8");
      const statsRunnerSource = await readFile(path.resolve("packages/cli/src/research-machine/stats/runner.ts"), "utf-8");
      const controllerDocs = await readFile(path.resolve("docs/research-controller.md"), "utf-8");

      expect(manifest.defaultControllerModel).toBe("openai:gpt-5.4");
      const publicControllerCommands = [
        "controller-init",
        "controller-start",
        "controller-step",
        "controller-run",
        "run-autonomous",
        "controller-patch",
        "controller-resume",
        "controller-tool",
        "controller-inspect",
        "controller-agenda",
        "controller-follow-agenda",
        "controller-follow-loop",
        "controller-supervise",
        "controller-env",
        "controller-audit",
        "controller-status",
        "controller-doctor",
        "controller-operate",
        "controller-capabilities",
        "controller-benchmark",
        "controller-goal-audit",
        "controller-completion-audit",
        "controller-golden-packet",
        "controller-repair-cycle",
        "controller-runbook",
        "controller-runner-packet",
        "controller-self-test",
      ];
      expect(manifest.controllerCommands).toEqual(expect.arrayContaining(publicControllerCommands));
      expect(byId.get("golden_path_startup")?.commands.join(" ")).toContain("controller-start");
      expect(byId.get("golden_path_startup")?.status).toBe("available");
      expect(byId.get("persistent_state_machine")?.status).toBe("covered");
      expect(byId.get("default_gpt54_controller_model")?.status).toBe("covered");
      expect(byId.get("execution_agenda")?.commands.join(" ")).toContain("controller-follow-loop");
      expect(byId.get("execution_agenda")?.artifactKinds).toEqual(expect.arrayContaining([
        "controller-execution-agenda-report",
        "controller-follow-agenda-report",
        "controller-follow-loop-report",
        "controller-supervisor-report",
      ]));
      expect(byId.get("actionable_run_inspection_recovery")?.description).toContain("Run-inspection recommended commands");
      expect(byId.get("actionable_run_inspection_recovery")?.commands.join(" ")).toContain("controller-follow-agenda");
      expect(byId.get("actionable_run_inspection_recovery")?.artifactKinds).toEqual(expect.arrayContaining(["run-inspection", "run-inspection-report", "controller-model-runner-packet", "controller-runbook"]));
      expect(byId.get("continuous_benchmark_regression_suite")?.description).toContain("Continuous benchmark scoring");
      expect(byId.get("continuous_benchmark_regression_suite")?.commands.join(" ")).toContain("benchmark-suite-run");
      expect(byId.get("continuous_benchmark_regression_suite")?.testRefs).toEqual(expect.arrayContaining(["packages/cli/tests/research-trust.test.ts"]));
      expect(byId.get("operator_audit")?.commands.join(" ")).toContain("controller-audit");
      expect(byId.get("operational_status")?.description).toContain("First-read controller status");
      expect(byId.get("operational_status")?.commands.join(" ")).toContain("controller-status");
      expect(byId.get("operational_status")?.status).toBe("available");
      for (const command of publicControllerCommands) {
        expect(commandCatalog).toContain(`research ${command}`);
        expect(cliHelpSource).toContain(`agenteer research ${command}`);
      }
      const reportKindByBase = new Map(controllerArtifactReportKindPairs());
      expect(reportKindByBase.has("review-adjudication")).toBe(false);
      expect(reportKindByBase.has("stats-qa")).toBe(false);
      expect(reportKindByBase.get("stats-run")).toBe("stats-report");
      expect(reportKindByBase.get("stats-summary")).toBe("stats-report");
      const jsonOnlyFalseReportKinds = [
        "method-selection-report",
        "controller-modeling-plan-report",
        "manuscript-qa-report",
        "review-adjudication-report",
        "stats-qa-report",
      ];
      for (const reportKind of jsonOnlyFalseReportKinds) {
        expect([...reportKindByBase.values()]).not.toContain(reportKind);
        expect(controllerSource).not.toContain(reportKind);
        expect(controllerDocs).not.toContain(reportKind);
        expect(commandCatalog).not.toContain(reportKind);
      }
      const keyArtifactBlocks: string[] = [];
      for (let start = controllerSource.indexOf("keyArtifacts: {"); start >= 0; start = controllerSource.indexOf("keyArtifacts: {", start + 1)) {
        const braceStart = controllerSource.indexOf("{", start);
        let depth = 0;
        let end = -1;
        for (let index = braceStart; index < controllerSource.length; index++) {
          const char = controllerSource[index];
          if (char === "{") depth += 1;
          if (char === "}") {
            depth -= 1;
            if (depth === 0) {
              end = index;
              break;
            }
          }
        }
        expect(end).toBeGreaterThan(braceStart);
        keyArtifactBlocks.push(controllerSource.slice(braceStart, end + 1));
      }
      expect(keyArtifactBlocks.length).toBeGreaterThanOrEqual(2);
      for (const block of keyArtifactBlocks) {
        expect(block).not.toContain("reportPath");
        expect(block).not.toContain("Report:");
        expect(block).not.toContain("-report");
      }
      const keyArtifactReportBlocks = [...controllerSource.matchAll(/keyArtifactReports:\s*\{[\s\S]*?\n\s*\}/g)].map(match => match[0]);
      expect(keyArtifactReportBlocks.length).toBeGreaterThanOrEqual(2);
      const reportKindsUsedByKeyArtifactReports = [...new Set(keyArtifactReportBlocks.flatMap(block => [...block.matchAll(/latestArtifactPath\(state, "([^"]+)"\)/g)].map(match => match[1])))].sort();
      for (const reportKind of reportKindsUsedByKeyArtifactReports) {
        expect([...reportKindByBase.values()]).toContain(reportKind);
      }
      const reportPairTableStart = controllerSource.indexOf("const controllerArtifactReportKindByBase");
      const reportPairTableEnd = controllerSource.indexOf("]);", reportPairTableStart);
      expect(reportPairTableStart).toBeGreaterThanOrEqual(0);
      expect(reportPairTableEnd).toBeGreaterThan(reportPairTableStart);
      const controllerSourceOutsideReportPairTable = `${controllerSource.slice(0, reportPairTableStart)}${controllerSource.slice(reportPairTableEnd + 3)}`;
      for (const [baseKind, reportKind] of reportKindByBase) {
        expect(controllerSourceOutsideReportPairTable).toContain(baseKind);
        expect(controllerSourceOutsideReportPairTable).toContain(reportKind);
        if (reportKind === "stats-report") {
          expect(statsRunnerSource).toContain("stats-report.md");
        } else {
          expect(
            controllerSource.includes(`artifact("${reportKind}"`) ||
            controllerSource.includes(`pushControllerArtifactOnce(state, "${reportKind}"`),
          ).toBe(true);
        }
      }
      for (const entry of manifest.entries) {
        for (const [baseKind, reportKind] of reportKindByBase) {
          if (entry.artifactKinds.includes(baseKind)) expect(entry.artifactKinds).toContain(reportKind);
        }
      }
      expect(byId.get("dataset_exploration")?.artifactKinds).toEqual(expect.arrayContaining(["exploration", "exploration-report"]));
      expect(byId.get("literature_intake_and_qa")?.artifactKinds).toEqual(expect.arrayContaining(["literature-search", "literature-search-report", "literature-context", "literature-context-report"]));
      expect(byId.get("analysis_execution")?.artifactKinds).toEqual(expect.arrayContaining(["stats-summary", "stats-report", "stats-qa"]));
      expect(byId.get("method_qa")?.artifactKinds).toEqual(expect.arrayContaining(["method-qa", "method-qa-report"]));
      expect(byId.get("external_reviewer_panel")?.artifactKinds).toEqual(expect.arrayContaining(["review-adjudication"]));
      expect(byId.get("dataset_feasibility")?.status).toBe("not_applicable");
      expect(byId.get("external_reviewer_panel")?.status).toBe("not_applicable");
      expect(byId.get("method_selection_and_modeling_plan")?.testRefs).toContain("packages/cli/tests/research-controller.test.ts");
      const capabilitiesConsole = renderResearchControllerCapabilities(manifest);
      expect(capabilitiesConsole).toContain("missing capabilities:");
      expect(capabilitiesConsole).toContain("available capabilities:");
      for (const entry of manifest.entries.filter(entry => entry.status === "missing").slice(0, 5)) {
        expect(capabilitiesConsole).toContain(`missing ${entry.id}: ${entry.failureMode}`);
        expect(capabilitiesConsole).toContain(`artifacts=${entry.artifactKinds.slice(0, 6).join(",") || "(none)"}`);
        expect(capabilitiesConsole).toContain(`evidence=${entry.evidenceRefs.slice(0, 3).join(",") || "(none)"}`);
        expect(capabilitiesConsole).toContain(`tests=${entry.testRefs.slice(0, 3).join(",") || "(none)"}`);
      }
      for (const entry of manifest.entries.filter(entry => entry.status === "available").slice(0, 5)) {
        expect(capabilitiesConsole).toContain(`available ${entry.id}: ${entry.failureMode}`);
        expect(capabilitiesConsole).toContain(`artifacts=${entry.artifactKinds.slice(0, 6).join(",") || "(none)"}`);
        expect(capabilitiesConsole).toContain(`evidence=${entry.evidenceRefs.slice(0, 3).join(",") || "(none)"}`);
        expect(capabilitiesConsole).toContain(`tests=${entry.testRefs.slice(0, 3).join(",") || "(none)"}`);
      }
      expect(capabilitiesConsole).toContain("controller-start-report");
      expect(manifest.summary.covered).toBeGreaterThan(0);
      expect(await fileExists(manifest.reportPath)).toBe(true);
      expect(capabilitiesConsole).toContain(`manifest: ${manifest.outPath}`);
      expect(capabilitiesConsole).toContain(`report: ${manifest.reportPath}`);
      expect(persisted.controllerState.artifacts.map(artifact => artifact.kind)).toEqual(expect.arrayContaining([
        "controller-capability-manifest",
        "controller-capability-manifest-report",
      ]));
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("writes a requirement-level goal audit before claiming controller completion", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "agenteer-controller-goal-audit-"));
    try {
      const state = await researchControllerInitCommand({
        question: "Is x associated with y?",
        outDir: dir,
        method: "linear-regression",
        outcome: "y",
        exposure: "x",
      });
      const audit = await researchControllerGoalAuditCommand({
        statePath: state.statePath,
        objective: "Complete Research Controller Agent build with GPT-5.4 controller, autonomous pickup, research execution, QA, source repair, and tests.",
        reason: "test_goal_audit",
      });
      const persisted = JSON.parse(await readFile(state.statePath, "utf-8")) as { controllerState: ControllerState };
      const byId = new Map(audit.requirements.map(item => [item.id, item]));

      expect(audit.objective).toContain("Complete Research Controller Agent");
      expect(audit.status).toMatch(/warning|fail|pass/);
      expect(audit.readiness).toMatch(/in_progress|blocked|goal_complete/);
      expect(audit.score).toBeGreaterThan(0);
      expect(byId.get("persistent_resumable_state")?.status).toMatch(/partial|proved/);
      expect(byId.get("persistent_resumable_state")?.requirement).toContain("handoff artifacts");
      expect(byId.get("actionable_inspection_recovery")?.requirement).toContain("run-inspection recommended commands");
      expect(byId.get("actionable_inspection_recovery")?.evidenceStandard).toContain("actionable_run_inspection_recovery");
      expect(byId.get("actionable_inspection_recovery")?.status).toBe("missing");
      expect(byId.get("actionable_inspection_recovery")?.nextAction).toContain("run-inspect");
      expect(byId.get("doctor_driven_autonomous_operation")?.status).toMatch(/partial|proved|missing/);
      expect(byId.get("doctor_driven_autonomous_operation")?.nextAction).toContain("controller-operate");
      expect(byId.get("default_gpt54_model_control")?.status).toBe("proved");
      expect(byId.get("implementation_change_loop")?.status).toMatch(/partial|proved|missing/);
      expect(byId.get("documented_and_tested_public_surface")?.evidenceRefs).toEqual(expect.arrayContaining([
        "docs/research-controller.md",
        "packages/cli/tests/research-controller.test.ts",
      ]));
      expect(byId.get("continuous_benchmark_regression")?.status).toMatch(/partial|proved|not_applicable/);
      expect(byId.get("continuous_benchmark_regression")?.requirement).toContain("representative continuous benchmark runs");
      expect(byId.get("continuous_benchmark_regression")?.evidenceStandard).toContain("controller-benchmark");
      expect(byId.get("continuous_benchmark_regression")?.nextAction).toContain("controller-benchmark");
      expect(audit.operatorAuditPath).toMatch(/controller_operator_audit/);
      expect(audit.capabilityManifestPath).toMatch(/controller_capabilities/);
      expect(audit.nextCommand).toBeTruthy();
      const goalAuditConsole = renderResearchControllerGoalAudit(audit);
      expect(goalAuditConsole).toContain("evidence=");
      expect(goalAuditConsole).toContain(`report: ${audit.reportPath}`);
      expect(await fileExists(audit.reportPath)).toBe(true);
      expect(persisted.controllerState.artifacts.map(artifact => artifact.kind)).toEqual(expect.arrayContaining([
        "controller-goal-audit",
        "controller-goal-audit-report",
        "controller-operator-audit",
        "controller-capability-manifest",
      ]));
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("runs controller benchmark evidence and marks continuous benchmark coverage", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "agenteer-controller-benchmark-"));
    try {
      const data = await writeLinearCsv(path.join(dir, "rows.csv"), 120);
      const completed = await researchControllerRunCommand({
        question: "Is x associated with y?",
        outDir: path.join(dir, "controller"),
        dataPath: data,
        method: "linear-regression",
        outcome: "y",
        exposure: "x",
        maxSteps: 8,
      });
      const benchmark = await researchControllerBenchmarkCommand({
        statePath: completed.state.statePath,
        suiteDir: completed.state.inputs.runDir,
        historyDir: path.join(dir, "benchmark-history"),
        reason: "test benchmark coverage",
      });
      const refreshed = await researchControllerCapabilitiesCommand({
        statePath: completed.state.statePath,
        reason: "test benchmark capabilities",
      });
      const audit = await researchControllerGoalAuditCommand({
        statePath: completed.state.statePath,
        objective: "Prove benchmark regression evidence is attached before promoting broad controller changes.",
        reason: "test benchmark goal audit",
      });
      const persisted = JSON.parse(await readFile(completed.state.statePath, "utf-8")) as { controllerState: ControllerState };
      const byId = new Map(refreshed.entries.map(entry => [entry.id, entry]));
      const auditById = new Map(audit.requirements.map(entry => [entry.id, entry]));

      expect(benchmark.suite.caseCount).toBeGreaterThanOrEqual(1);
      expect(benchmark.attachedArtifacts.map(item => item.kind)).toEqual(expect.arrayContaining([
        "continuous-benchmark-suite",
        "continuous-benchmark-suite-report",
        "continuous-benchmark-trend",
        "continuous-benchmark-trend-report",
      ]));
      const benchmarkConsole = renderResearchControllerBenchmark(benchmark);
      expect(benchmarkConsole).toContain("research controller benchmark");
      expect(benchmarkConsole).toContain(`regressions: ${new Set([...benchmark.suite.regressions, ...benchmark.trend.regressions]).size}`);
      expect(benchmarkConsole).toContain(`suite record: ${benchmark.suite.outPath}`);
      expect(benchmarkConsole).toContain(`suite report: ${benchmark.suite.reportPath}`);
      expect(benchmarkConsole).toContain(`trend record: ${benchmark.trend.outPath}`);
      expect(benchmarkConsole).toContain(`trend report: ${benchmark.trend.reportPath}`);
      expect(benchmarkConsole).toContain(`report: ${benchmark.reportPath}`);
      expect(await fileExists(benchmark.outPath)).toBe(true);
      expect(await fileExists(benchmark.reportPath)).toBe(true);
      expect(byId.get("continuous_benchmark_regression_suite")?.status).toBe("covered");
      expect(byId.get("continuous_benchmark_regression_suite")?.evidenceRefs).toEqual(expect.arrayContaining([
        benchmark.outPath,
        benchmark.suite.outPath,
        benchmark.trend.outPath,
      ]));
      expect(auditById.get("continuous_benchmark_regression")?.status).toBe("proved");
      expect(auditById.get("continuous_benchmark_regression")?.evidenceRefs).toEqual(expect.arrayContaining([
        benchmark.outPath,
        benchmark.suite.outPath,
        benchmark.trend.outPath,
      ]));
      expect(persisted.controllerState.artifacts.map(artifact => artifact.kind)).toEqual(expect.arrayContaining([
        "controller-benchmark",
        "controller-benchmark-report",
        "continuous-benchmark-suite",
        "continuous-benchmark-suite-report",
        "continuous-benchmark-trend",
        "continuous-benchmark-trend-report",
      ]));
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }, 30_000);

  it("reruns a public completion audit and blocks false completion claims", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "agenteer-controller-completion-audit-"));
    try {
      const state = await researchControllerInitCommand({
        question: "Is x associated with y?",
        outDir: path.join(dir, "early"),
        method: "linear-regression",
        outcome: "y",
        exposure: "x",
      });
      const earlyAudit = await researchControllerCompletionAuditCommand({
        statePath: state.statePath,
        reason: "test_false_completion_guard",
      });
      const earlyPersisted = JSON.parse(await readFile(state.statePath, "utf-8")) as { controllerState: ControllerState };
      expect(earlyAudit.status).toBe("fail");
      expect(earlyAudit.readiness).toBe("blocked");
      expect(earlyAudit.missingEvidence).toEqual(expect.arrayContaining(["stage-coverage", "method-planning", "analysis-execution"]));
      expect(renderResearchControllerCompletionAudit(earlyAudit)).toContain("failed requirements:");
      expect(renderResearchControllerCompletionAudit(earlyAudit)).toContain("evidence=");
      expect(renderResearchControllerCompletionAudit(earlyAudit)).toContain(`report: ${earlyAudit.reportPath}`);
      expect(await fileExists(earlyAudit.outPath)).toBe(true);
      expect(earlyPersisted.controllerState.artifacts.map(artifact => artifact.kind)).toEqual(expect.arrayContaining([
        "controller-completion-audit",
        "controller-completion-audit-report",
      ]));

      const data = await writeLinearCsv(path.join(dir, "rows.csv"), 80);
      const completed = await researchControllerRunCommand({
        question: "Is x associated with y?",
        outDir: path.join(dir, "run"),
        dataPath: data,
        method: "linear-regression",
        outcome: "y",
        exposure: "x",
        maxSteps: 12,
      });
      const finalAudit = await researchControllerCompletionAuditCommand({
        statePath: completed.state.statePath,
        reason: "test_completion_audit_refresh",
      });
      expect(finalAudit.status).not.toBe("fail");
      expect(finalAudit.readiness).toMatch(/complete|local_review_only/);
      expect(finalAudit.requirements).toEqual(expect.arrayContaining([
        expect.objectContaining({ id: "stage-coverage", status: "proved" }),
        expect.objectContaining({ id: "artifact-integrity", status: "proved" }),
        expect.objectContaining({ id: "action-contracts", status: "proved" }),
      ]));
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("writes a fresh model-runner packet for autonomous controller pickup", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "agenteer-controller-runner-packet-"));
    try {
      const state = await researchControllerInitCommand({
        question: "Is x associated with y?",
        outDir: dir,
        method: "linear-regression",
        outcome: "y",
        exposure: "x",
        controller: { enabled: true },
        requireControllerModel: true,
      });
      const packet = await researchControllerRunnerPacketCommand({
        statePath: state.statePath,
        reason: "test_fresh_runner_handoff",
      });
      const persisted = JSON.parse(await readFile(state.statePath, "utf-8")) as { controllerState: ControllerState };
      const artifactKinds = persisted.controllerState.artifacts.map(artifact => artifact.kind);

      expect(packet.schemaVersion).toBe(1);
      expect(packet.defaultControllerModel).toBe("openai:gpt-5.4");
      expect(packet.strictModelRecommended).toBe(true);
      expect(packet.systemPrompt).toContain("Research Controller Agent");
      expect(packet.systemPrompt).toContain("issueCodes");
      expect(packet.userPrompt).toContain(state.statePath);
      expect(packet.userPrompt).toContain("First-read command");
      expect(packet.userPrompt).toContain("controller-run-agenteer");
      expect(packet.operatingRules.join(" ")).toContain("Use controller-status as the first-read readiness command/tool");
      expect(packet.operatingRules.join(" ")).toContain("recentToolResults.controllerStatus");
      expect(packet.allowedCommands).toEqual(expect.arrayContaining([
        expect.stringContaining("controller-run"),
        expect.stringContaining("controller-status"),
        expect.stringContaining("controller-follow-loop"),
        expect.stringContaining("controller-benchmark"),
        expect.stringContaining("controller-inspect"),
      ]));
      expect(packet.forbiddenActions).toEqual(expect.arrayContaining([
        expect.stringContaining("arbitrary shell"),
      ]));
      expect(packet.evidenceRefs).toEqual(expect.arrayContaining([state.statePath]));
      expect(packet.feasibilityReadiness.present).toBe(false);
      expect(packet.feasibilityReadiness.status).toBeNull();
      expect(packet.feasibilityReadiness.verdict).toBeNull();
      expect(packet.userPrompt).toContain("Feasibility readiness: missing");
      expect(renderResearchControllerRunnerPacket(packet)).toContain("feasibility readiness: (missing)");
      expect(renderResearchControllerRunnerPacket(packet)).toContain(`reports: agenda=${packet.agenda.reportPath}`);
      expect(renderResearchControllerRunnerPacket(packet)).toContain(`audit=${packet.audit.reportPath}`);
      expect(renderResearchControllerRunnerPacket(packet)).toContain(`environment=${packet.environment.reportPath}`);
      expect(renderResearchControllerRunnerPacket(packet)).toContain(`capabilities=${packet.capabilities.reportPath}`);
      expect(renderResearchControllerRunnerPacket(packet)).toContain("evidence refs:");
      expect(renderResearchControllerRunnerPacket(packet)).toContain(state.statePath);
      expect(packet.datasetSemanticAudit.present).toBe(false);
      expect(packet.datasetSemanticAudit.status).toBe("unknown");
      expect(packet.agenda.primaryCommand).toMatch(/controller-run --state/);
      expect(packet.agenda.path).toMatch(/controller_execution_agenda/);
      expect(packet.agenda.reportPath).toMatch(/controller_execution_agenda/);
      expect(packet.audit.status).toMatch(/pass|warning|fail/);
      expect(packet.audit.path).toMatch(/controller_operator_audit/);
      expect(packet.audit.reportPath).toMatch(/controller_operator_audit/);
      expect(packet.environment.repoRoot).toContain("agenteer");
      expect(packet.environment.outPath).toMatch(/controller_environment/);
      expect(packet.environment.reportPath).toMatch(/controller_environment/);
      expect(packet.capabilities.path).toMatch(/controller_capabilities/);
      expect(packet.capabilities.reportPath).toMatch(/controller_capabilities/);
      expect(await fileExists(packet.outPath)).toBe(true);
      expect(await fileExists(packet.reportPath)).toBe(true);
      expect(await fileExists(packet.agenda.reportPath)).toBe(true);
      expect(await fileExists(packet.audit.reportPath)).toBe(true);
      expect(await fileExists(packet.environment.reportPath)).toBe(true);
      expect(await fileExists(packet.capabilities.reportPath)).toBe(true);
      expect(await readFile(packet.reportPath, "utf-8")).toContain("Feasibility readiness: missing");
      expect(await readFile(packet.reportPath, "utf-8")).toContain("Agenda report:");
      expect(await readFile(packet.reportPath, "utf-8")).toContain("Audit report:");
      expect(await readFile(packet.reportPath, "utf-8")).toContain("Environment report:");
      expect(await readFile(packet.reportPath, "utf-8")).toContain("Capability report:");
      expect(artifactKinds).toEqual(expect.arrayContaining([
        "controller-model-runner-packet",
        "controller-model-runner-packet-report",
        "controller-operator-audit",
        "controller-environment-preflight",
        "controller-capability-manifest",
      ]));
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("includes run-inspection agenda commands in the model-runner packet", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "agenteer-controller-runner-inspection-commands-"));
    try {
      const state = await researchControllerInitCommand({
        question: "Is exposure associated with outcome?",
        outDir: dir,
        method: "linear-regression",
        outcome: "outcome",
        exposure: "exposure",
      });
      await mkdir(state.inputs.runDir, { recursive: true });
      const figuresPath = path.join(state.inputs.runDir, "figures.json");
      const figureQaCommand = `agenteer research figure-qa --figures ${JSON.stringify(figuresPath)} --out ${JSON.stringify(path.join(state.inputs.runDir, "figure-qa.json"))} --report ${JSON.stringify(path.join(state.inputs.runDir, "figure-qa.md"))}`;
      await writeFile(path.join(state.inputs.runDir, "run-inspection.json"), `${JSON.stringify({
        schemaVersion: 1,
        runInspection: {
          schemaVersion: 1,
          runDir: state.inputs.runDir,
          readiness: "needs_methods_review",
          recommendedCommands: [figureQaCommand],
        },
      }, null, 2)}\n`);

      const packet = await researchControllerRunnerPacketCommand({
        statePath: state.statePath,
        reason: "test runner packet inspection commands",
      });

      expect(packet.agenda.sourceArtifacts.runInspection).toBe(path.join(state.inputs.runDir, "run-inspection.json"));
      expect(packet.agendaCommands).toContain(figureQaCommand);
      expect(packet.allowedCommands).toContain(figureQaCommand);
      expect(packet.agenda.items).toEqual(expect.arrayContaining([
        expect.objectContaining({ source: "run_inspection", kind: "qa", command: figureQaCommand }),
      ]));
      expect(await readFile(packet.reportPath, "utf-8")).toContain("## Agenda Commands");
      expect(renderResearchControllerRunnerPacket(packet)).toContain("agenda command 1:");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("includes run-inspection commands as next-action alternatives for stopped runs", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "agenteer-controller-next-action-inspection-"));
    try {
      const state = await researchControllerInitCommand({
        question: "Is exposure associated with outcome?",
        outDir: dir,
        method: "linear-regression",
        outcome: "outcome",
        exposure: "exposure",
      });
      await mkdir(state.inputs.runDir, { recursive: true });
      const figureQaCommand = `agenteer research figure-qa --figures ${JSON.stringify(path.join(state.inputs.runDir, "figures.json"))} --out ${JSON.stringify(path.join(state.inputs.runDir, "figure-qa.json"))} --report ${JSON.stringify(path.join(state.inputs.runDir, "figure-qa.md"))}`;
      await writeFile(path.join(state.inputs.runDir, "run-inspection.json"), `${JSON.stringify({
        schemaVersion: 1,
        runInspection: {
          schemaVersion: 1,
          runDir: state.inputs.runDir,
          readiness: "needs_methods_review",
          recommendedCommands: [figureQaCommand],
        },
      }, null, 2)}\n`);
      const stopped: ControllerState = {
        ...state,
        status: "needs_human_review",
        currentStage: "human_review",
        stopReason: "Fixture stopped run for next-action alternatives.",
      };
      await writeFile(state.statePath, `${JSON.stringify({ schemaVersion: 1, controllerState: stopped }, null, 2)}\n`);

      await researchControllerInspectCommand({ statePath: state.statePath });
      const nextAction = JSON.parse(await readFile(path.join(state.rootDir, "controller-next-action.json"), "utf-8")) as { controllerNextAction: { recommendedCommand: string; alternativeCommands: string[]; issueLedger: { path: string | null; reportPath: string | null }; createdFromArtifacts: { terminalHandoffReport: string; reentryPlanReport: string; issueLedgerReport: string | null } } };
      const report = await readFile(path.join(state.rootDir, "controller-next-action.md"), "utf-8");

      expect(nextAction.controllerNextAction.recommendedCommand).toBeTruthy();
      expect(nextAction.controllerNextAction.alternativeCommands).toEqual(expect.arrayContaining([
        expect.stringContaining("controller-status"),
      ]));
      expect(nextAction.controllerNextAction.alternativeCommands).toContain(figureQaCommand);
      expect(report).toContain("## Alternative Commands");
      expect(report).toContain("controller-status");
      expect(report).toContain("research figure-qa");
      expect(nextAction.controllerNextAction.createdFromArtifacts.terminalHandoffReport).toContain("controller-terminal-handoff.md");
      expect(nextAction.controllerNextAction.createdFromArtifacts.reentryPlanReport).toContain("controller-reentry-plan.md");
      expect(report).toContain("Terminal handoff report:");
      expect(report).toContain("Re-entry plan report:");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("includes run-inspection commands in terminal handoff suggestions", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "agenteer-controller-handoff-inspection-"));
    try {
      const state = await researchControllerInitCommand({
        question: "Is exposure associated with outcome?",
        outDir: dir,
        method: "linear-regression",
        outcome: "outcome",
        exposure: "exposure",
      });
      await mkdir(state.inputs.runDir, { recursive: true });
      const figureQaCommand = `agenteer research figure-qa --figures ${JSON.stringify(path.join(state.inputs.runDir, "figures.json"))} --out ${JSON.stringify(path.join(state.inputs.runDir, "figure-qa.json"))} --report ${JSON.stringify(path.join(state.inputs.runDir, "figure-qa.md"))}`;
      await writeFile(path.join(state.inputs.runDir, "run-inspection.json"), `${JSON.stringify({
        schemaVersion: 1,
        runInspection: {
          schemaVersion: 1,
          runDir: state.inputs.runDir,
          readiness: "needs_methods_review",
          recommendedCommands: [figureQaCommand],
        },
      }, null, 2)}\n`);
      const stopped: ControllerState = {
        ...state,
        status: "needs_human_review",
        currentStage: "human_review",
        stopReason: "Fixture stopped run for terminal handoff suggestions.",
      };
      await writeFile(state.statePath, `${JSON.stringify({ schemaVersion: 1, controllerState: stopped }, null, 2)}\n`);

      await researchControllerInspectCommand({ statePath: state.statePath });
      const handoff = JSON.parse(await readFile(path.join(state.rootDir, "controller-terminal-handoff.json"), "utf-8")) as { controllerTerminalHandoff: { suggestedCommands: string[]; reentryPlan: { reportPath: string } } };
      const report = await readFile(path.join(state.rootDir, "controller-terminal-handoff.md"), "utf-8");

      expect(handoff.controllerTerminalHandoff.suggestedCommands[0]).toContain("controller-status");
      expect(handoff.controllerTerminalHandoff.suggestedCommands).toContain(figureQaCommand);
      expect(handoff.controllerTerminalHandoff.reentryPlan.reportPath).toContain("controller-reentry-plan.md");
      expect(report).toContain("controller-status");
      expect(report).toContain("research figure-qa");
      expect(report).toContain("Plan report:");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("writes a controller doctor report that consolidates readiness, blockers, and pickup evidence", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "agenteer-controller-doctor-"));
    try {
      const data = await writeLinearCsv(path.join(dir, "rows.csv"), 80);
      const state = await researchControllerInitCommand({
        question: "Is x associated with y?",
        outDir: path.join(dir, "early"),
        dataPath: data,
        method: "linear-regression",
        outcome: "y",
        exposure: "x",
      });
      const earlyDoctor = await researchControllerDoctorCommand({
        statePath: state.statePath,
        reason: "test_operator_doctor_early",
      });
      const earlyPersisted = JSON.parse(await readFile(state.statePath, "utf-8")) as { controllerState: ControllerState };
      expect(earlyDoctor.schemaVersion).toBe(1);
      expect(earlyDoctor.status).toBe("ready_to_continue");
      expect(earlyDoctor.safeToAutoContinue).toBe(true);
      expect(earlyDoctor.blockers).toHaveLength(0);
      expect(earlyDoctor.warnings).toEqual(expect.arrayContaining([
        expect.stringContaining("stage-coverage"),
      ]));
      expect(earlyDoctor.summaries.operatorAudit.path).toMatch(/controller_operator_audit/);
      expect(earlyDoctor.summaries.completionAudit.path).toMatch(/controller-completion-audit/);
      expect(earlyDoctor.summaries.runnerPacket.path).toMatch(/controller_model_runner_packet/);
      expect(earlyDoctor.summaries.runnerPacket.feasibilityReadiness.present).toBe(false);
      expect(earlyDoctor.summaries.runnerPacket.feasibilityReadiness.status).toBeNull();
      expect(earlyDoctor.summaries.runnerPacket.datasetSemanticAudit.present).toBe(false);
      expect(earlyDoctor.summaries.runnerPacket.datasetSemanticAudit.status).toBe("unknown");
      expect(earlyDoctor.summaries.reentryPlan.path).toMatch(/controller-reentry-plan/);
      const earlyDoctorConsole = renderResearchControllerDoctor(earlyDoctor);
      expect(earlyDoctorConsole).toContain("evidence: operator=");
      expect(earlyDoctorConsole).toContain(earlyDoctor.summaries.completionAudit.path);
      expect(earlyDoctorConsole).toContain(`reports: operator=${earlyDoctor.summaries.operatorAudit.reportPath}`);
      expect(earlyDoctorConsole).toContain(`completion=${earlyDoctor.summaries.completionAudit.reportPath}`);
      expect(earlyDoctorConsole).toContain(`runner=${earlyDoctor.summaries.runnerPacket.reportPath}`);
      expect(earlyDoctorConsole).toContain(`capabilities=${earlyDoctor.summaries.capabilities.reportPath}`);
      expect(earlyDoctorConsole).toContain(`reentry=${earlyDoctor.summaries.reentryPlan.reportPath}`);
      expect(earlyDoctorConsole).toContain("evidence refs:");
      expect(earlyDoctorConsole).toContain(`- evidence: ${earlyDoctor.evidenceRefs[0]}`);
      expect(earlyDoctorConsole).toContain(`report: ${earlyDoctor.reportPath}`);
      expect(await fileExists(earlyDoctor.outPath)).toBe(true);
      expect(await fileExists(earlyDoctor.reportPath)).toBe(true);
      expect(await fileExists(earlyDoctor.summaries.operatorAudit.reportPath)).toBe(true);
      expect(await fileExists(earlyDoctor.summaries.completionAudit.reportPath)).toBe(true);
      expect(await fileExists(earlyDoctor.summaries.runnerPacket.reportPath)).toBe(true);
      expect(await fileExists(earlyDoctor.summaries.capabilities.reportPath)).toBe(true);
      expect(await fileExists(earlyDoctor.summaries.reentryPlan.reportPath)).toBe(true);
      expect(earlyPersisted.controllerState.artifacts.map(artifact => artifact.kind)).toEqual(expect.arrayContaining([
        "controller-doctor",
        "controller-doctor-report",
        "controller-model-runner-packet",
        "controller-completion-audit",
        "controller-operator-audit",
        "controller-reentry-plan",
      ]));

      const completed = await researchControllerRunCommand({
        question: "Is x associated with y?",
        outDir: path.join(dir, "completed"),
        dataPath: data,
        method: "linear-regression",
        outcome: "y",
        exposure: "x",
        maxSteps: 12,
      });
      const finalDoctor = await researchControllerDoctorCommand({
        statePath: completed.state.statePath,
        reason: "test_operator_doctor_complete",
      });
      expect(finalDoctor.status).toMatch(/complete|needs_review/);
      expect(finalDoctor.summaries.completionAudit.failedRequirements).toHaveLength(0);
      expect(finalDoctor.summaries.runnerPacket.datasetSemanticAudit.present).toBe(true);
      expect(finalDoctor.summaries.runnerPacket.datasetSemanticAudit.status).toBe("pass");
      expect(finalDoctor.summaries.runnerPacket.datasetSemanticAudit.selectedRoleStatus).toBe("pass");
      expect(finalDoctor.summaries.runnerPacket.feasibilityReadiness.status).toBe("pass");
      expect(finalDoctor.summaries.runnerPacket.feasibilityReadiness.verdict).toBe("formal_analysis_ready");
      expect(renderResearchControllerDoctor(finalDoctor)).toContain("runner feasibility readiness: pass; verdict: formal_analysis_ready");
      expect(renderResearchControllerDoctor(finalDoctor)).toContain("warnings:");
      expect(finalDoctor.summaries.artifacts.missingRequiredHashes).toHaveLength(0);
      expect(finalDoctor.evidenceRefs).toEqual(expect.arrayContaining([
        finalDoctor.summaries.operatorAudit.path,
        finalDoctor.summaries.completionAudit.path,
        finalDoctor.summaries.runnerPacket.path,
        finalDoctor.summaries.capabilities.path,
      ]));
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("writes a unified controller status artifact for first-read readiness inspection", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "agenteer-controller-status-"));
    try {
      const data = await writeLinearCsv(path.join(dir, "rows.csv"), 74);
      const state = await researchControllerInitCommand({
        question: "Is x associated with y?",
        outDir: path.join(dir, "run"),
        dataPath: data,
        method: "linear-regression",
        outcome: "y",
        exposure: "x",
      });

      const status = await researchControllerStatusCommand({
        statePath: state.statePath,
        reason: "test_unified_status",
      });
      const persisted = JSON.parse(await readFile(state.statePath, "utf-8")) as { controllerState: ControllerState };
      const saved = JSON.parse(await readFile(status.outPath, "utf-8")) as {
        controllerStatus: {
          status: string;
          recommendedCommand: string;
          summary: { feasibilityReadiness: string | null; feasibilityVerdict: string | null };
          artifactPaths: { doctor: string; runbook: string; goldenPacket: string; runnerPacket: string };
          keyArtifactReports: Record<string, string | null>;
        };
      };
      const report = await readFile(status.reportPath, "utf-8");

      expect(status.schemaVersion).toBe(1);
      expect(status.statusId).toMatch(/controller_status_/);
      expect(status.status).toMatch(/ready|review|complete/);
      expect(status.status).not.toBe("blocked");
      expect(status.summary.feasibilityReadiness).toBeNull();
      expect(status.summary.feasibilityVerdict).toBeNull();
      expect(status.activeBlockerIssueCodes).toEqual([]);
      expect(status.warnings.some(warning => warning.includes("Completion evidence pending"))).toBe(true);
      expect(status.recommendedCommand).toContain("agenteer research controller-");
      expect(status.artifactPaths.doctor).toMatch(/controller_doctor/);
      expect(status.artifactPaths.runbook).toMatch(/controller_runbook/);
      expect(status.artifactPaths.goldenPacket).toMatch(/controller-golden-packet/);
      expect(status.artifactPaths.runnerPacket).toMatch(/controller_model_runner_packet/);
      expect(status.evidenceRefs).toEqual(expect.arrayContaining([
        status.artifactPaths.doctor,
        status.artifactPaths.runbook,
        status.artifactPaths.goldenPacket,
        status.artifactPaths.runnerPacket,
      ]));
      expect(saved.controllerStatus.status).toBe(status.status);
      expect(saved.controllerStatus.summary.feasibilityReadiness).toBeNull();
      expect(saved.controllerStatus.recommendedCommand).toBe(status.recommendedCommand);
      expect(saved.controllerStatus.artifactPaths.doctor).toBe(status.artifactPaths.doctor);
      expect(saved.controllerStatus.keyArtifactReports.state).toBeNull();
      expect(saved.controllerStatus.keyArtifactReports.statsRun).toBeNull();
      expect(saved.controllerStatus.keyArtifactReports.statsQa).toBeNull();
      expect(Object.keys(saved.controllerStatus.keyArtifactReports)).toEqual(expect.arrayContaining(["feasibility", "statsRun", "statsQa"]));
      expect(report).toContain("# Controller Status");
      expect(report).toContain("Feasibility readiness: (missing)");
      expect(report).toContain("## Key Artifact Reports");
      expect(report).toContain("- state: not report-backed");
      expect(report).toContain("- statsRun: not report-backed");
      expect(report).toContain("- statsQa: not report-backed");
      const statusConsole = renderResearchControllerStatus(status);
      expect(statusConsole).toContain("feasibility readiness: (missing)");
      expect(statusConsole).toContain("- warning: Completion evidence pending");
      expect(statusConsole).toContain("evidence: doctor=");
      expect(statusConsole).toContain(status.artifactPaths.runbook);
      expect(statusConsole).toContain("reports: doctor=");
      expect(statusConsole).toContain(status.artifactPaths.runbookReport);
      expect(statusConsole).toContain("key reports:");
      expect(statusConsole).toContain("- report state: not report-backed");
      expect(statusConsole).toContain("- report statsRun: not report-backed");
      expect(statusConsole).toContain("- report statsQa: not report-backed");
      expect(statusConsole).toContain(`report: ${status.reportPath}`);
      expect(report).toContain("## Key Artifacts");
      expect(report).toContain("Active blocker issue codes:");
      expect(await fileExists(status.outPath)).toBe(true);
      expect(await fileExists(status.reportPath)).toBe(true);
      expect(persisted.controllerState.artifacts.map(artifact => artifact.kind)).toEqual(expect.arrayContaining([
        "controller-status",
        "controller-status-report",
        "controller-doctor",
        "controller-runbook",
        "controller-golden-packet",
      ]));
      const capabilities = await researchControllerCapabilitiesCommand({
        statePath: state.statePath,
        reason: "test_unified_status_capability",
      });
      expect(capabilities.entries.find(entry => entry.id === "operational_status")).toEqual(expect.objectContaining({
        status: "covered",
        artifactKinds: expect.arrayContaining(["controller-status", "controller-status-report"]),
      }));
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("blocks controller doctor auto-continuation when repair verification is missing", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "agenteer-controller-doctor-repair-verification-"));
    try {
      const state = await researchControllerInitCommand({
        question: "Is x associated with y?",
        outDir: dir,
        method: "linear-regression",
        outcome: "y",
        exposure: "x",
        allowExternalReview: true,
        allowAutoRepair: true,
      });
      const reviewDir = path.join(state.inputs.runDir, "review");
      await mkdir(reviewDir, { recursive: true });
      const repairExecutionPath = path.join(reviewDir, "controller-repair-execution-01.json");
      await writeFile(repairExecutionPath, `${JSON.stringify({ schemaVersion: 1, controllerRepairExecution: { repairId: "repair_01", status: "succeeded" } }, null, 2)}\n`);
      const repairedState: ControllerState = {
        ...state,
        currentStage: "external_review",
        status: "running",
        policy: { ...state.policy, allowExternalReview: true, allowAutoRepair: true, autonomy: "aggressive" },
        repairs: [{
          schemaVersion: 1,
          generatedAtIso: new Date().toISOString(),
          repairId: "repair_01",
          sourceReviewPath: null,
          status: "succeeded",
          stageBeforeRepair: "repair",
          nextStage: "external_review",
          executedRepairs: [{ findingId: "finding_01", pluginId: "refresh-method-selection", status: "succeeded", reason: "test", artifactRefs: [] }],
          skippedFindings: [],
          outPath: repairExecutionPath,
        }],
        artifacts: [
          ...state.artifacts,
          {
            kind: "controller-repair-execution",
            path: repairExecutionPath,
            stage: "repair",
            sha256: "repair-execution-sha",
            requiredForPromotion: true,
          },
        ],
      };
      await writeFile(state.statePath, `${JSON.stringify({ schemaVersion: 1, controllerState: repairedState }, null, 2)}\n`);

      const doctor = await researchControllerDoctorCommand({
        statePath: state.statePath,
        reason: "test missing repair verification blocks doctor",
      });

      expect(doctor.status).toBe("blocked");
      expect(doctor.safeToAutoContinue).toBe(false);
      expect(doctor.blockers).toEqual(expect.arrayContaining([
        expect.stringContaining("repair-verification"),
      ]));
      const audit = JSON.parse(await readFile(doctor.summaries.operatorAudit.path, "utf-8")) as { controllerOperatorAudit: { checks: Array<{ id: string; status: string; message: string }> } };
      expect(audit.controllerOperatorAudit.checks).toEqual(expect.arrayContaining([
        expect.objectContaining({ id: "repair-verification", status: "fail" }),
      ]));
      const capabilities = await researchControllerCapabilitiesCommand({
        statePath: state.statePath,
        reason: "test missing repair verification capability",
      });
      const boundedRepair = capabilities.entries.find(entry => entry.id === "bounded_repair");
      expect(boundedRepair?.status).toBe("missing");
      expect(boundedRepair?.artifactKinds).toEqual(expect.arrayContaining([
        "controller-repair-execution",
        "controller-repair-verification",
        "controller-repair-verification-report",
      ]));
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("runs a doctor-driven operate loop that supervises safe work and records an operation report", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "agenteer-controller-operate-"));
    try {
      const data = await writeLinearCsv(path.join(dir, "rows.csv"), 84);
      const state = await researchControllerInitCommand({
        question: "Is x associated with y?",
        outDir: path.join(dir, "run"),
        dataPath: data,
        method: "linear-regression",
        outcome: "y",
        exposure: "x",
      });
      const result = await researchControllerOperateCommand({
        statePath: state.statePath,
        maxCycles: 2,
        maxRounds: 2,
        maxIterationsPerRound: 2,
        maxStepsPerRun: 3,
        reason: "test_doctor_driven_operate",
      });
      const persisted = JSON.parse(await readFile(state.statePath, "utf-8")) as { controllerState: ControllerState };
      expect(result.schemaVersion).toBe(1);
      expect(result.cycles.length).toBeGreaterThan(0);
      expect(result.cycles.some(cycle => cycle.action === "supervise")).toBe(true);
      expect(result.cycles[0]?.doctorFeasibilityReadiness).toBeNull();
      expect(result.cycles[0]?.doctorFeasibilityVerdict).toBeNull();
      expect(result.cycles[0]?.doctorFeasibilityPath).toBeNull();
      expect(result.cycles[0]?.doctorReportPath).toMatch(/controller_doctor/);
      expect(result.cycles.find(cycle => cycle.action === "supervise")?.issueCodes).toEqual([]);
      const supervisedCycle = result.cycles.find(cycle => cycle.action === "supervise");
      expect(supervisedCycle?.actionReportPath).toMatch(/controller_supervisor/);
      expect(result.finalDoctorPath).toMatch(/controller_doctor/);
      expect(await fileExists(result.outPath)).toBe(true);
      expect(await fileExists(result.reportPath)).toBe(true);
      expect(await fileExists(result.cycles[0]?.doctorReportPath ?? "")).toBe(true);
      expect(await fileExists(supervisedCycle?.actionReportPath ?? "")).toBe(true);
      expect(await readFile(result.reportPath, "utf-8")).toContain("Doctor feasibility: missing");
      expect(await readFile(result.reportPath, "utf-8")).toContain("Doctor report:");
      expect(await readFile(result.reportPath, "utf-8")).toContain("Action report:");
      expect(renderResearchControllerOperate(result)).toContain("latest doctor feasibility: (missing)");
      expect(renderResearchControllerOperate(result)).toContain("evidence=");
      expect(renderResearchControllerOperate(result)).toContain(result.cycles[0]?.doctorPath ?? "");
      expect(renderResearchControllerOperate(result)).toContain(`doctorReport=${result.cycles[0]?.doctorReportPath}`);
      expect(renderResearchControllerOperate(result)).toContain(`actionReport=${supervisedCycle?.actionReportPath}`);
      expect(renderResearchControllerOperate(result)).toContain(`report: ${result.reportPath}`);
      expect(renderResearchControllerOperate(result)).toContain("reason=");
      expect(persisted.controllerState.artifacts.map(artifact => artifact.kind)).toEqual(expect.arrayContaining([
        "controller-operate",
        "controller-operate-report",
        "controller-doctor",
        "controller-supervisor",
      ]));
      expect(persisted.controllerState.actions.length).toBeGreaterThan(0);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("writes a controller launch runbook for external model-runner startup", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "agenteer-controller-runbook-"));
    try {
      const data = await writeLinearCsv(path.join(dir, "rows.csv"), 72);
      const state = await researchControllerInitCommand({
        question: "Is x associated with y?",
        outDir: path.join(dir, "run"),
        dataPath: data,
        method: "linear-regression",
        outcome: "y",
        exposure: "x",
        requireControllerModel: true,
      });
      const runbook = await researchControllerRunbookCommand({
        statePath: state.statePath,
        reason: "test_external_runner_launch",
      });
      const persisted = JSON.parse(await readFile(state.statePath, "utf-8")) as { controllerState: ControllerState };

      expect(runbook.schemaVersion).toBe(1);
      expect(runbook.defaultControllerModel).toBe("openai:gpt-5.4");
      expect(runbook.strictModelRecommended).toBe(true);
      expect(runbook.firstReadCommand).toContain("controller-status");
      expect(runbook.launchCommand).toContain("controller-operate");
      expect(runbook.readinessCommand).toContain("controller-doctor");
      expect(runbook.inspectionCommand).toContain("controller-inspect");
      expect(runbook.allowedCommands).toEqual(expect.arrayContaining([
        expect.stringContaining("controller-status"),
        expect.stringContaining("controller-operate"),
        expect.stringContaining("controller-runbook"),
        expect.stringContaining("controller-benchmark"),
        expect.stringContaining("controller-completion-audit"),
      ]));
      expect(runbook.verificationCommands).toEqual(expect.arrayContaining([
        expect.stringContaining("controller-benchmark"),
      ]));
      expect(runbook.recoveryCommands).toEqual(expect.arrayContaining([
        expect.stringContaining("controller-status"),
      ]));
      expect(runbook.handoffPrompt).toContain("First-read command");
      expect(runbook.handoffPrompt).toContain("recentToolResults.controllerStatus");
      expect(runbook.stopCriteria).toEqual(expect.arrayContaining([
        expect.stringContaining("controller-doctor reports blocked"),
        expect.stringContaining("cost estimates exceed"),
        expect.stringContaining("controller-repair-verification"),
      ]));
      expect(runbook.environment.requiredEnvVars).toEqual(expect.arrayContaining(["OPENAI_API_KEY"]));
      expect(runbook.environment.packageScripts).toEqual(expect.arrayContaining(["build", "test"]));
      expect(runbook.artifactsToInspect).toEqual(expect.arrayContaining([
        state.statePath,
        runbook.doctor.outPath,
        runbook.runnerPacket.path,
      ]));
      expect(runbook.runnerPacket.feasibilityReadiness.present).toBe(false);
      expect(runbook.runnerPacket.feasibilityReadiness.status).toBeNull();
      expect(runbook.runnerPacket.datasetSemanticAudit.present).toBe(false);
      expect(runbook.runnerPacket.datasetSemanticAudit.status).toBe("unknown");
      expect(runbook.evidenceRefs).toEqual(expect.arrayContaining([
        runbook.doctor.outPath,
        runbook.runnerPacket.path,
        runbook.capabilities.path,
      ]));
      expect(await fileExists(runbook.outPath)).toBe(true);
      expect(await fileExists(runbook.reportPath)).toBe(true);
      expect(await readFile(runbook.reportPath, "utf-8")).toContain("Runner feasibility readiness: missing");
      const runbookConsole = renderResearchControllerRunbook(runbook);
      expect(runbookConsole).toContain("runner feasibility readiness: (missing)");
      expect(runbookConsole).toContain(`first-read: ${runbook.firstReadCommand}`);
      expect(runbookConsole).toContain(`readiness: ${runbook.readinessCommand}`);
      expect(runbookConsole).toContain(`inspection: ${runbook.inspectionCommand}`);
      expect(runbookConsole).toContain("evidence=");
      expect(runbookConsole).toContain("report:");
      expect(runbookConsole).toContain("controller_runbook_");
      expect(runbookConsole).toContain("artifacts to inspect:");
      expect(runbookConsole).toContain(runbook.doctor.outPath);
      expect(persisted.controllerState.artifacts.map(artifact => artifact.kind)).toEqual(expect.arrayContaining([
        "controller-runbook",
        "controller-runbook-report",
        "controller-doctor",
        "controller-model-runner-packet",
      ]));
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("includes repair verification artifacts in launch runbook inspection paths", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "agenteer-controller-runbook-repair-verification-"));
    try {
      const state = await researchControllerInitCommand({
        question: "Is x associated with y?",
        outDir: dir,
        method: "linear-regression",
        outcome: "y",
        exposure: "x",
        allowExternalReview: true,
        allowAutoRepair: true,
      });
      const reviewDir = path.join(state.inputs.runDir, "review");
      await mkdir(reviewDir, { recursive: true });
      const repairExecutionPath = path.join(reviewDir, "controller-repair-execution-01.json");
      const repairVerificationPath = path.join(reviewDir, "controller-repair-verification-01.json");
      const repairVerificationReportPath = path.join(reviewDir, "controller-repair-verification-01.md");
      await writeFile(repairExecutionPath, `${JSON.stringify({ schemaVersion: 1, controllerRepairExecution: { repairId: "repair_01", status: "succeeded" } }, null, 2)}\n`);
      await writeFile(repairVerificationPath, `${JSON.stringify({ schemaVersion: 1, controllerRepairVerification: { status: "pass", nextAction: "Run external review on the repaired packet.", freshExternalReviewRequired: true } }, null, 2)}\n`);
      await writeFile(repairVerificationReportPath, "# Controller Repair Verification\n\nStatus: pass\n");
      const repairedState: ControllerState = {
        ...state,
        currentStage: "external_review",
        status: "running",
        policy: { ...state.policy, allowExternalReview: true, allowAutoRepair: true, autonomy: "aggressive" },
        repairs: [{
          schemaVersion: 1,
          generatedAtIso: new Date().toISOString(),
          repairId: "repair_01",
          sourceReviewPath: null,
          status: "succeeded",
          stageBeforeRepair: "repair",
          nextStage: "external_review",
          executedRepairs: [{ findingId: "finding_01", pluginId: "refresh-method-selection", status: "succeeded", reason: "test", artifactRefs: [] }],
          skippedFindings: [],
          outPath: repairExecutionPath,
        }],
        artifacts: [
          ...state.artifacts,
          { kind: "controller-repair-execution", path: repairExecutionPath, stage: "repair", sha256: "repair-execution-sha", requiredForPromotion: true },
          { kind: "controller-repair-verification", path: repairVerificationPath, stage: "repair", sha256: "repair-verification-sha", requiredForPromotion: true },
          { kind: "controller-repair-verification-report", path: repairVerificationReportPath, stage: "repair", sha256: "repair-verification-report-sha", requiredForPromotion: false },
        ],
      };
      await writeFile(state.statePath, `${JSON.stringify({ schemaVersion: 1, controllerState: repairedState }, null, 2)}\n`);

      const runbook = await researchControllerRunbookCommand({
        statePath: state.statePath,
        reason: "test runbook repair verification artifacts",
      });

      expect(runbook.artifactsToInspect).toEqual(expect.arrayContaining([repairVerificationPath, repairVerificationReportPath]));
      expect(runbook.evidenceRefs).toEqual(expect.arrayContaining([repairVerificationPath, repairVerificationReportPath]));
      const capabilities = await researchControllerCapabilitiesCommand({
        statePath: state.statePath,
        reason: "test verified repair capability",
      });
      const boundedRepair = capabilities.entries.find(entry => entry.id === "bounded_repair");
      expect(boundedRepair?.status).toBe("covered");
      expect(boundedRepair?.evidenceRefs).toEqual(expect.arrayContaining([
        repairExecutionPath,
        repairVerificationPath,
        repairVerificationReportPath,
      ]));
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("includes run-inspection agenda commands in launch runbook recovery commands", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "agenteer-controller-runbook-inspection-commands-"));
    try {
      const state = await researchControllerInitCommand({
        question: "Is exposure associated with outcome?",
        outDir: dir,
        method: "linear-regression",
        outcome: "outcome",
        exposure: "exposure",
      });
      await mkdir(state.inputs.runDir, { recursive: true });
      const figureQaCommand = `agenteer research figure-qa --figures ${JSON.stringify(path.join(state.inputs.runDir, "figures.json"))} --out ${JSON.stringify(path.join(state.inputs.runDir, "figure-qa.json"))} --report ${JSON.stringify(path.join(state.inputs.runDir, "figure-qa.md"))}`;
      await writeFile(path.join(state.inputs.runDir, "run-inspection.json"), `${JSON.stringify({
        schemaVersion: 1,
        runInspection: {
          schemaVersion: 1,
          runDir: state.inputs.runDir,
          readiness: "needs_methods_review",
          recommendedCommands: [figureQaCommand],
        },
      }, null, 2)}\n`);

      const runbook = await researchControllerRunbookCommand({
        statePath: state.statePath,
        reason: "test runbook inspection commands",
      });

      expect(runbook.allowedCommands).toContain(figureQaCommand);
      expect(runbook.recoveryCommands).toContain(figureQaCommand);
      const report = await readFile(runbook.reportPath, "utf-8");
      expect(report).toContain("## Recovery Commands");
      expect(report).toContain("research figure-qa");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("runs a public controller self-test across golden path, supervised pickup, strict model control, tools, and infeasible-study rejection", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "agenteer-controller-self-test-"));
    try {
      const result = await researchControllerSelfTestCommand({
        outDir: dir,
        objective: "Prove local controller runner readiness in tests.",
      });
      const byId = new Map(result.scenarios.map(item => [item.id, item]));
      const requirements = new Map(result.requirements.map(item => [item.id, item]));

      expect(result.status).toBe("pass");
      expect(result.readiness).toBe("ready");
      expect(result.requirements.every(item => item.status === "pass")).toBe(true);
      const selfTestConsole = renderResearchControllerSelfTest(result);
      expect(selfTestConsole).toContain("non-pass scenarios: 0");
      expect(selfTestConsole).toContain("non-pass requirements: 0");
      expect(selfTestConsole).toContain("non-pass checks: 0");
      expect(requirements.get("persistent_autonomous_state")?.status).toBe("pass");
      expect(requirements.get("default_gpt54_strict_model_runner")?.status).toBe("pass");
      expect(requirements.get("bounded_supervised_pickup")?.status).toBe("pass");
      expect(requirements.get("doctor_driven_operate_loop")?.status).toBe("pass");
      expect(requirements.get("dataset_grounded_research_execution")?.status).toBe("pass");
      expect(requirements.get("independent_review_and_repair")?.status).toBe("pass");
      expect(requirements.get("implementation_change_loop")?.status).toBe("pass");
      expect(requirements.get("safety_and_artifact_integrity")?.status).toBe("pass");
      expect(requirements.get("documented_tested_public_surface")?.evidenceRefs).toEqual(expect.arrayContaining([
        "docs/research-controller.md",
        "docs/command-catalog.md",
        "packages/cli/tests/research-controller.test.ts",
      ]));
      expect(requirements.get("persistent_autonomous_state")?.evidenceRefs.join(" ")).toContain("controller_start");
      expect(byId.get("golden_path_startup")?.status).toBe("pass");
      expect(byId.get("golden_path_startup")?.checks).toEqual(expect.arrayContaining([
        expect.objectContaining({ id: "start-artifacts", status: "pass" }),
        expect.objectContaining({ id: "start-readiness-envelope", status: "pass" }),
      ]));
      expect(byId.get("deterministic_golden_path")?.status).toBe("pass");
      expect(byId.get("supervised_pickup_loop")?.status).toBe("pass");
      expect(byId.get("doctor_operate_loop")?.status).toBe("pass");
      expect(byId.get("external_review_repair_loop")?.status).toBe("pass");
      expect(byId.get("strict_model_controller")?.status).toBe("pass");
      expect(byId.get("infeasible_study_rejection")?.status).toBe("pass");
      expect(byId.get("deterministic_golden_path")?.checks).toEqual(expect.arrayContaining([
        expect.objectContaining({ id: "source-patch-loop", status: "pass" }),
        expect.objectContaining({ id: "first-read-status", status: "pass" }),
      ]));
      expect(byId.get("supervised_pickup_loop")?.checks).toEqual(expect.arrayContaining([
        expect.objectContaining({ id: "runner-packet-refresh", status: "pass" }),
        expect.objectContaining({ id: "safe-follow-loop", status: "pass" }),
        expect.objectContaining({ id: "post-round-audit", status: "pass" }),
        expect.objectContaining({ id: "supervisor-artifacts", status: "pass" }),
      ]));
      expect(byId.get("doctor_operate_loop")?.checks).toEqual(expect.arrayContaining([
        expect.objectContaining({ id: "doctor-refresh", status: "pass" }),
        expect.objectContaining({ id: "safe-supervision-selected", status: "pass" }),
        expect.objectContaining({ id: "operate-artifacts", status: "pass" }),
        expect.objectContaining({ id: "bounded-stop", status: "pass" }),
      ]));
      expect(byId.get("external_review_repair_loop")?.checks).toEqual(expect.arrayContaining([
        expect.objectContaining({ id: "external-review-artifacts", status: "pass" }),
        expect.objectContaining({ id: "bounded-repair-executed", status: "pass" }),
      ]));
      expect(byId.get("strict_model_controller")?.checks).toEqual(expect.arrayContaining([
        expect.objectContaining({ id: "model-decisions", status: "pass" }),
        expect.objectContaining({ id: "model-preflight-quality", status: "pass" }),
      ]));
      expect(byId.get("infeasible_study_rejection")?.checks).toEqual(expect.arrayContaining([
        expect.objectContaining({ id: "blocked-before-execution", status: "pass" }),
      ]));
      expect(await fileExists(path.join(dir, "controller-self-test.json"))).toBe(true);
      expect(await fileExists(path.join(dir, "controller-self-test.md"))).toBe(true);
      expect(await fileExists(path.join(dir, "deterministic-golden", "controller-state.json"))).toBe(true);
      const statusEvidence = byId.get("deterministic_golden_path")?.evidenceRefs.find(ref => ref.includes("controller_status_"));
      expect(statusEvidence).toBeTruthy();
      expect(await fileExists(statusEvidence ?? "")).toBe(true);
      expect(selfTestConsole).toContain("evidence refs:");
      expect(selfTestConsole).toContain("controller_status_");
      expect(selfTestConsole).toContain(result.reportPath);
      const repairEvidence = byId.get("external_review_repair_loop")?.evidenceRefs.find(ref => ref.includes("controller-repair-execution"));
      expect(repairEvidence).toBeTruthy();
      expect(await fileExists(repairEvidence ?? "")).toBe(true);
      const repairVerificationEvidence = byId.get("external_review_repair_loop")?.evidenceRefs.find(ref => ref.includes("controller-repair-verification"));
      expect(repairVerificationEvidence).toBeTruthy();
      expect(await fileExists(repairVerificationEvidence ?? "")).toBe(true);
      expect(await fileExists(path.join(dir, "strict-model-golden", "controller_model_preflight_001.json"))).toBe(true);
      expect(await fileExists(path.join(dir, "blocked-feasibility", "controller-feasibility-verdict.json"))).toBe(true);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("prints bounded self-test evidence refs for non-pass terminal handoff", () => {
    const result: ControllerSelfTestResult = {
      schemaVersion: 1,
      generatedAtIso: "2026-06-03T00:00:00.000Z",
      selfTestId: "controller_self_test_fake",
      status: "fail",
      readiness: "blocked",
      outDir: "/tmp/agenteer-self-test",
      objective: "Verify self-test compact output.",
      scenarios: [{
        id: "scenario_a",
        label: "Scenario A",
        status: "fail",
        statePath: "/tmp/agenteer-self-test/state.json",
        finalStage: "dataset_feasibility",
        finalStatus: "blocked",
        evidenceRefs: ["/tmp/agenteer-self-test/scenario-a.json"],
        checks: [{
          id: "check_a",
          status: "fail",
          message: "Check A failed.",
          evidenceRefs: ["/tmp/agenteer-self-test/check-a.json"],
        }],
      }],
      requirements: [{
        id: "requirement_a",
        category: "testing",
        requirement: "Requirement A.",
        status: "fail",
        evidenceRefs: ["/tmp/agenteer-self-test/requirement-a.json"],
        gaps: ["Requirement A gap."],
      }],
      checks: [{
        id: "overall_a",
        status: "warning",
        message: "Overall A warning.",
        evidenceRefs: ["/tmp/agenteer-self-test/overall-a.json"],
      }],
      nextAction: "Inspect self-test evidence.",
      outPath: "/tmp/agenteer-self-test/controller-self-test.json",
      reportPath: "/tmp/agenteer-self-test/controller-self-test.md",
    };

    const selfTestConsole = renderResearchControllerSelfTest(result);

    expect(selfTestConsole).toContain("- scenario fail scenario_a: Scenario A; evidence=/tmp/agenteer-self-test/scenario-a.json");
    expect(selfTestConsole).toContain("- requirement fail requirement_a: Requirement A gap.; evidence=/tmp/agenteer-self-test/requirement-a.json");
    expect(selfTestConsole).toContain("- check warning overall_a: Overall A warning.; evidence=/tmp/agenteer-self-test/overall-a.json");
    expect(selfTestConsole).toContain("evidence refs: 4");
    expect(selfTestConsole).toContain("- evidence: /tmp/agenteer-self-test/check-a.json");
  });

  it("follows only safe executable agenda items and records refusal for blocked agendas", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "agenteer-controller-follow-agenda-"));
    try {
      const data = await writeLinearCsv(path.join(dir, "rows.csv"), 60);
      const state = await researchControllerInitCommand({
        question: "Is x associated with y?",
        outDir: path.join(dir, "run"),
        dataPath: data,
        method: "linear-regression",
        outcome: "y",
        exposure: "x",
      });
      const followed = await researchControllerFollowAgendaCommand({
        statePath: state.statePath,
        maxSteps: 1,
        reason: "test_safe_follow",
      });
      expect(followed.executed).toBe(true);
      expect(followed.refused).toBe(false);
      expect(followed.selectedItem?.kind).toBe("run");
      expect(followed.runResult?.stepCount).toBe(1);
      expect(followed.state.actions.map(action => action.action)).toContain("initialize");
      expect(renderResearchControllerFollowAgenda(followed)).toContain("selected reason:");
      expect(renderResearchControllerFollowAgenda(followed)).toContain(followed.selectedItem?.reason ?? "Run");
      expect(renderResearchControllerFollowAgenda(followed)).toContain("selected evidence:");
      expect(renderResearchControllerFollowAgenda(followed)).toContain(followed.selectedItem?.evidenceRefs.slice(0, 5).join(", ") || "(none)");
      expect(renderResearchControllerFollowAgenda(followed)).toContain(`report: ${followed.reportPath}`);
      expect(await fileExists(followed.outPath)).toBe(true);
      expect(await fileExists(followed.reportPath)).toBe(true);
      expect(followed.state.artifacts.map(artifact => artifact.kind)).toEqual(expect.arrayContaining([
        "controller-follow-agenda",
        "controller-follow-agenda-report",
      ]));
      expect(await readFile(followed.reportPath, "utf-8")).toContain("## Selected Item");
      expect(await readFile(followed.reportPath, "utf-8")).toContain("Evidence refs:");

      const badData = path.join(dir, "bad.csv");
      await writeFile(badData, "y,x\n1,0\n2,1\n3,2\n");
      const blocked = await researchControllerRunCommand({
        question: "Is x associated with y?",
        outDir: path.join(dir, "blocked"),
        dataPath: badData,
        method: "linear-regression",
        outcome: "y",
        exposure: "x",
        maxSteps: 8,
      });
      const refused = await researchControllerFollowAgendaCommand({
        statePath: blocked.state.statePath,
        reason: "test_blocked_follow",
      });
      expect(refused.executed).toBe(false);
      expect(refused.refused).toBe(true);
      expect(refused.reason).toMatch(/not executable|requires review|patch|Active coded blocker/);
      expect(refused.agenda.status).toBe("blocked");
      expect(refused.selectedItem?.safety).toBe("requires_review");
      expect(renderResearchControllerFollowAgenda(refused)).toContain("selected reason:");
      expect(renderResearchControllerFollowAgenda(refused)).toContain("selected evidence:");
      expect(renderResearchControllerFollowAgenda(refused)).toContain(`report: ${refused.reportPath}`);
      expect(await fileExists(refused.reportPath)).toBe(true);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("refuses follow-agenda execution when active coded blockers remain", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "agenteer-controller-follow-agenda-coded-blocker-"));
    try {
      const data = await writeLinearCsv(path.join(dir, "rows.csv"), 60);
      const state = await researchControllerInitCommand({
        question: "Is x associated with y?",
        outDir: path.join(dir, "run"),
        dataPath: data,
        method: "linear-regression",
        outcome: "y",
        exposure: "x",
      });
      const issueLedgerPath = path.join(state.rootDir, "controller_issue_ledger_997.json");
      const issueLedger = {
        schemaVersion: 1,
        generatedAtIso: new Date().toISOString(),
        ledgerId: "controller_issue_ledger_997",
        reason: "synthetic coded blocker for follow-agenda guard regression",
        runId: state.runId,
        status: "blocked",
        currentStage: "exploration",
        controllerStatus: "running",
        counts: { blockers: 1, major: 0, minor: 0, info: 0 },
        issues: [
          {
            id: "issue_complete_case_attrition_extreme",
            issueCode: "COMPLETE_CASE_ATTRITION_EXTREME",
            severity: "blocker",
            category: "data",
            status: "active",
            source: "feasibility:COMPLETE_CASE_ATTRITION_EXTREME",
            stage: "dataset_feasibility",
            message: "COMPLETE_CASE_ATTRITION_EXTREME: complete-case attrition remains unresolved.",
            evidenceRefs: [issueLedgerPath],
            suggestedAction: "Revise high-missingness variables before continuing.",
            reentryStage: "dataset_feasibility",
          },
        ],
        topIssue: {
          id: "issue_complete_case_attrition_extreme",
          issueCode: "COMPLETE_CASE_ATTRITION_EXTREME",
          severity: "blocker",
          category: "data",
          status: "active",
          source: "feasibility:COMPLETE_CASE_ATTRITION_EXTREME",
          stage: "dataset_feasibility",
          message: "COMPLETE_CASE_ATTRITION_EXTREME: complete-case attrition remains unresolved.",
          evidenceRefs: [issueLedgerPath],
          suggestedAction: "Revise high-missingness variables before continuing.",
          reentryStage: "dataset_feasibility",
        },
        nextAction: "Patch study variables before continuing.",
        outPath: issueLedgerPath,
        reportPath: path.join(state.rootDir, "controller_issue_ledger_997.md"),
      };
      await writeFile(issueLedgerPath, JSON.stringify({ schemaVersion: 1, controllerIssueLedger: issueLedger }, null, 2));
      const inconsistentState: ControllerState = {
        ...state,
        currentStage: "exploration",
        status: "running",
        completedStages: ["intake", "dataset_feasibility"],
        issueLedgers: [
          ...state.issueLedgers,
          {
            ledgerId: "controller_issue_ledger_997",
            reason: issueLedger.reason,
            status: "blocked",
            currentStage: "exploration",
            issueCount: 1,
            blockerCount: 1,
            outPath: issueLedgerPath,
            reportPath: issueLedger.reportPath,
          },
        ],
      };
      await writeFile(inconsistentState.statePath, JSON.stringify({ schemaVersion: 1, controllerState: inconsistentState }, null, 2));

      const followed = await researchControllerFollowAgendaCommand({
        statePath: inconsistentState.statePath,
        maxSteps: 1,
        reason: "test_follow_agenda_active_coded_blocker",
      });

      expect(followed.executed).toBe(false);
      expect(followed.refused).toBe(true);
      expect(followed.reason).toContain("COMPLETE_CASE_ATTRITION_EXTREME");
      expect(renderResearchControllerFollowAgenda(followed)).toContain("selected issue codes:");
      expect(renderResearchControllerFollowAgenda(followed)).toContain("COMPLETE_CASE_ATTRITION_EXTREME");
      expect(renderResearchControllerFollowAgenda(followed)).toContain("selected evidence:");
      expect(renderResearchControllerFollowAgenda(followed)).toContain(followed.selectedItem?.evidenceRefs.slice(0, 5).join(", ") || "(none)");
      expect(renderResearchControllerFollowAgenda(followed)).toContain(`report: ${followed.reportPath}`);
      expect(followed.selectedItem?.status).toBe("executable");
      expect(followed.selectedItem?.safety).toBe("safe");
      expect(followed.state.actions.map(action => action.action)).not.toContain("explore");
      expect(followed.state.artifacts.map(artifact => artifact.kind)).toEqual(expect.arrayContaining([
        "controller-follow-agenda",
        "controller-follow-agenda-report",
      ]));
      expect(await readFile(followed.outPath, "utf-8")).toContain("COMPLETE_CASE_ATTRITION_EXTREME");
      expect(await readFile(followed.reportPath, "utf-8")).toContain("COMPLETE_CASE_ATTRITION_EXTREME");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("does not treat advisory uppercase labels as active coded blockers", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "agenteer-controller-advisory-code-filter-"));
    try {
      const data = await writeLinearCsv(path.join(dir, "rows.csv"), 60);
      const state = await researchControllerInitCommand({
        question: "Is x associated with y?",
        outDir: path.join(dir, "run"),
        dataPath: data,
        method: "linear-regression",
        outcome: "y",
        exposure: "x",
      });
      const issueLedgerPath = path.join(state.rootDir, "controller_issue_ledger_994.json");
      const issueLedger = {
        schemaVersion: 1,
        generatedAtIso: new Date().toISOString(),
        ledgerId: "controller_issue_ledger_994",
        reason: "synthetic advisory code filter regression",
        runId: state.runId,
        status: "warnings",
        currentStage: "blocked",
        controllerStatus: "blocked",
        counts: { blockers: 0, major: 1, minor: 1, info: 0 },
        issues: [
          {
            id: "issue_pico_review",
            issueCode: "PICO",
            severity: "major",
            category: "review",
            status: "active",
            source: "review:PICO",
            stage: "blocked",
            message: "PICO framing needs human review, but this is not a coded hard blocker.",
            evidenceRefs: [issueLedgerPath],
            suggestedAction: "Inspect the study framing before resuming.",
            reentryStage: "human_review",
          },
          {
            id: "issue_artifact_readiness_warning",
            issueCode: "ARTIFACT_READINESS_WARNING",
            severity: "minor",
            category: "artifact",
            status: "active",
            source: "feasibility:ARTIFACT_READINESS_WARNING",
            stage: "blocked",
            message: "ARTIFACT_READINESS_WARNING: downstream artifacts are not ready yet.",
            evidenceRefs: [issueLedgerPath],
            suggestedAction: "Continue normal artifact generation.",
            reentryStage: "method_selection",
          },
        ],
        topIssue: {
          id: "issue_pico_review",
          issueCode: "PICO",
          severity: "major",
          category: "review",
          status: "active",
          source: "review:PICO",
          stage: "blocked",
          message: "PICO framing needs human review, but this is not a coded hard blocker.",
          evidenceRefs: [issueLedgerPath],
          suggestedAction: "Inspect the study framing before resuming.",
          reentryStage: "human_review",
        },
        nextAction: "Inspect before resuming.",
        outPath: issueLedgerPath,
        reportPath: path.join(state.rootDir, "controller_issue_ledger_994.md"),
      };
      await writeFile(issueLedgerPath, JSON.stringify({ schemaVersion: 1, controllerIssueLedger: issueLedger }, null, 2));
      const blockedState: ControllerState = {
        ...state,
        currentStage: "blocked",
        status: "blocked",
        stopReason: "Paused for advisory review labels PICO and ARTIFACT_READINESS_WARNING.",
        issueLedgers: [
          ...state.issueLedgers,
          {
            ledgerId: "controller_issue_ledger_994",
            reason: issueLedger.reason,
            status: "warnings",
            currentStage: "blocked",
            issueCount: 2,
            blockerCount: 0,
            outPath: issueLedgerPath,
            reportPath: issueLedger.reportPath,
          },
        ],
      };
      await writeFile(blockedState.statePath, JSON.stringify({ schemaVersion: 1, controllerState: blockedState }, null, 2));

      const followed = await researchControllerFollowAgendaCommand({
        statePath: blockedState.statePath,
        maxSteps: 1,
        reason: "test_advisory_code_filter",
      });

      expect(followed.executed).toBe(false);
      expect(followed.refused).toBe(true);
      expect(followed.agenda.activeIssueCodes).toEqual(expect.arrayContaining(["PICO", "ARTIFACT_READINESS_WARNING"]));
      expect(followed.agenda.activeBlockerIssueCodes).toEqual([]);
      expect(followed.reason).not.toContain("Active coded blocker");
      expect(followed.reason).toMatch(/not executable|requires review|human\/model review|completion/);
      expect(await readFile(followed.outPath, "utf-8")).toContain("PICO");

      const packet = await researchControllerRunnerPacketCommand({
        statePath: blockedState.statePath,
        reason: "test_advisory_code_filter_packet",
      });
      expect(packet.activeIssueCodes).toEqual(expect.arrayContaining(["PICO", "ARTIFACT_READINESS_WARNING"]));
      expect(packet.activeBlockerIssueCodes).toEqual([]);
      expect(packet.userPrompt).toContain("Active issue codes: PICO, ARTIFACT_READINESS_WARNING");
      expect(packet.userPrompt).toContain("Active blocker issue codes: none");

      const doctor = await researchControllerDoctorCommand({
        statePath: blockedState.statePath,
        reason: "test_advisory_code_filter_doctor",
      });
      expect(doctor.activeIssueCodes).toEqual(expect.arrayContaining(["PICO", "ARTIFACT_READINESS_WARNING"]));
      expect(doctor.activeBlockerIssueCodes).toEqual([]);
      expect(await readFile(doctor.reportPath, "utf-8")).toContain("Active issue codes: PICO, ARTIFACT_READINESS_WARNING");
      expect(await readFile(doctor.reportPath, "utf-8")).toContain("Active blocker issue codes: (none)");

      const runbook = await researchControllerRunbookCommand({
        statePath: blockedState.statePath,
        reason: "test_advisory_code_filter_runbook",
      });
      expect(runbook.activeIssueCodes).toEqual(expect.arrayContaining(["PICO", "ARTIFACT_READINESS_WARNING"]));
      expect(runbook.activeBlockerIssueCodes).toEqual([]);
      expect(runbook.doctor.activeIssueCodes).toEqual(expect.arrayContaining(["PICO", "ARTIFACT_READINESS_WARNING"]));
      expect(runbook.doctor.activeBlockerIssueCodes).toEqual([]);
      expect(runbook.runnerPacket.activeIssueCodes).toEqual(expect.arrayContaining(["PICO", "ARTIFACT_READINESS_WARNING"]));
      expect(runbook.runnerPacket.activeBlockerIssueCodes).toEqual([]);
      expect(await readFile(runbook.reportPath, "utf-8")).toContain("Active issue codes: PICO, ARTIFACT_READINESS_WARNING");
      expect(await readFile(runbook.reportPath, "utf-8")).toContain("Active blocker issue codes: (none)");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("marks supervisor agenda pickup unsafe when active coded blockers remain", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "agenteer-controller-supervisor-coded-blocker-"));
    try {
      const data = await writeLinearCsv(path.join(dir, "rows.csv"), 60);
      const state = await researchControllerInitCommand({
        question: "Is x associated with y?",
        outDir: path.join(dir, "run"),
        dataPath: data,
        method: "linear-regression",
        outcome: "y",
        exposure: "x",
      });
      const issueLedgerPath = path.join(state.rootDir, "controller_issue_ledger_996.json");
      const issueLedger = {
        schemaVersion: 1,
        generatedAtIso: new Date().toISOString(),
        ledgerId: "controller_issue_ledger_996",
        reason: "synthetic coded blocker for supervisor guard regression",
        runId: state.runId,
        status: "blocked",
        currentStage: "exploration",
        controllerStatus: "running",
        counts: { blockers: 1, major: 0, minor: 0, info: 0 },
        issues: [
          {
            id: "issue_complete_case_attrition_extreme",
            issueCode: "COMPLETE_CASE_ATTRITION_EXTREME",
            severity: "blocker",
            category: "data",
            status: "active",
            source: "feasibility:COMPLETE_CASE_ATTRITION_EXTREME",
            stage: "dataset_feasibility",
            message: "COMPLETE_CASE_ATTRITION_EXTREME: complete-case attrition remains unresolved.",
            evidenceRefs: [issueLedgerPath],
            suggestedAction: "Revise high-missingness variables before continuing.",
            reentryStage: "dataset_feasibility",
          },
        ],
        topIssue: {
          id: "issue_complete_case_attrition_extreme",
          issueCode: "COMPLETE_CASE_ATTRITION_EXTREME",
          severity: "blocker",
          category: "data",
          status: "active",
          source: "feasibility:COMPLETE_CASE_ATTRITION_EXTREME",
          stage: "dataset_feasibility",
          message: "COMPLETE_CASE_ATTRITION_EXTREME: complete-case attrition remains unresolved.",
          evidenceRefs: [issueLedgerPath],
          suggestedAction: "Revise high-missingness variables before continuing.",
          reentryStage: "dataset_feasibility",
        },
        nextAction: "Patch study variables before continuing.",
        outPath: issueLedgerPath,
        reportPath: path.join(state.rootDir, "controller_issue_ledger_996.md"),
      };
      await writeFile(issueLedgerPath, JSON.stringify({ schemaVersion: 1, controllerIssueLedger: issueLedger }, null, 2));
      const inconsistentState: ControllerState = {
        ...state,
        currentStage: "exploration",
        status: "running",
        completedStages: ["intake", "dataset_feasibility"],
        issueLedgers: [
          ...state.issueLedgers,
          {
            ledgerId: "controller_issue_ledger_996",
            reason: issueLedger.reason,
            status: "blocked",
            currentStage: "exploration",
            issueCount: 1,
            blockerCount: 1,
            outPath: issueLedgerPath,
            reportPath: issueLedger.reportPath,
          },
        ],
      };
      await writeFile(inconsistentState.statePath, JSON.stringify({ schemaVersion: 1, controllerState: inconsistentState }, null, 2));

      const supervised = await researchControllerSupervisorCommand({
        statePath: inconsistentState.statePath,
        maxRounds: 1,
        maxIterationsPerRound: 1,
        reason: "test_supervisor_active_coded_blocker",
      });

      expect(supervised.rounds[0]?.safeAgendaPrimary).toBe(false);
      expect(supervised.rounds[0]?.followLoopPath).toBeNull();
      expect(supervised.rounds[0]?.reason).toContain("COMPLETE_CASE_ATTRITION_EXTREME");
      expect(supervised.rounds[0]?.afterStage).toBe("exploration");
      expect(supervised.state.actions.map(action => action.action)).not.toContain("explore");
      expect(renderResearchControllerSupervisor(supervised)).toContain("reason=");
      expect(renderResearchControllerSupervisor(supervised)).toContain("COMPLETE_CASE_ATTRITION_EXTREME");
      expect(renderResearchControllerSupervisor(supervised)).toContain("evidence=");
      expect(renderResearchControllerSupervisor(supervised)).toContain(supervised.rounds[0]?.runnerPacketPath ?? "");
      expect(renderResearchControllerSupervisor(supervised)).toContain(`report: ${supervised.reportPath}`);
      expect(await readFile(supervised.reportPath, "utf-8")).toContain("COMPLETE_CASE_ATTRITION_EXTREME");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("preserves active coded blockers in operate cycle stop reports", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "agenteer-controller-operate-coded-blocker-"));
    try {
      const data = await writeLinearCsv(path.join(dir, "rows.csv"), 60);
      const state = await researchControllerInitCommand({
        question: "Is x associated with y?",
        outDir: path.join(dir, "run"),
        dataPath: data,
        method: "linear-regression",
        outcome: "y",
        exposure: "x",
      });
      const issueLedgerPath = path.join(state.rootDir, "controller_issue_ledger_995.json");
      const issueLedger = {
        schemaVersion: 1,
        generatedAtIso: new Date().toISOString(),
        ledgerId: "controller_issue_ledger_995",
        reason: "synthetic coded blocker for operate guard regression",
        runId: state.runId,
        status: "blocked",
        currentStage: "exploration",
        controllerStatus: "running",
        counts: { blockers: 1, major: 0, minor: 0, info: 0 },
        issues: [
          {
            id: "issue_complete_case_attrition_extreme",
            issueCode: "COMPLETE_CASE_ATTRITION_EXTREME",
            severity: "blocker",
            category: "data",
            status: "active",
            source: "feasibility:COMPLETE_CASE_ATTRITION_EXTREME",
            stage: "dataset_feasibility",
            message: "COMPLETE_CASE_ATTRITION_EXTREME: complete-case attrition remains unresolved.",
            evidenceRefs: [issueLedgerPath],
            suggestedAction: "Revise high-missingness variables before continuing.",
            reentryStage: "dataset_feasibility",
          },
        ],
        topIssue: {
          id: "issue_complete_case_attrition_extreme",
          issueCode: "COMPLETE_CASE_ATTRITION_EXTREME",
          severity: "blocker",
          category: "data",
          status: "active",
          source: "feasibility:COMPLETE_CASE_ATTRITION_EXTREME",
          stage: "dataset_feasibility",
          message: "COMPLETE_CASE_ATTRITION_EXTREME: complete-case attrition remains unresolved.",
          evidenceRefs: [issueLedgerPath],
          suggestedAction: "Revise high-missingness variables before continuing.",
          reentryStage: "dataset_feasibility",
        },
        nextAction: "Patch study variables before continuing.",
        outPath: issueLedgerPath,
        reportPath: path.join(state.rootDir, "controller_issue_ledger_995.md"),
      };
      await writeFile(issueLedgerPath, JSON.stringify({ schemaVersion: 1, controllerIssueLedger: issueLedger }, null, 2));
      const inconsistentState: ControllerState = {
        ...state,
        currentStage: "exploration",
        status: "running",
        completedStages: ["intake", "dataset_feasibility"],
        issueLedgers: [
          ...state.issueLedgers,
          {
            ledgerId: "controller_issue_ledger_995",
            reason: issueLedger.reason,
            status: "blocked",
            currentStage: "exploration",
            issueCount: 1,
            blockerCount: 1,
            outPath: issueLedgerPath,
            reportPath: issueLedger.reportPath,
          },
        ],
      };
      await writeFile(inconsistentState.statePath, JSON.stringify({ schemaVersion: 1, controllerState: inconsistentState }, null, 2));

      const operated = await researchControllerOperateCommand({
        statePath: inconsistentState.statePath,
        maxCycles: 1,
        maxRounds: 1,
        maxIterationsPerRound: 1,
        maxStepsPerRun: 1,
        reason: "test_operate_active_coded_blocker",
      });

      expect(operated.status).toMatch(/blocked|stopped/);
      expect(operated.cycles[0]?.action).toBe("stop");
      expect(operated.cycles[0]?.issueCodes).toContain("COMPLETE_CASE_ATTRITION_EXTREME");
      expect(operated.cycles[0]?.doctorFeasibilityReadiness).toBeNull();
      expect(operated.stoppedReason).toContain("COMPLETE_CASE_ATTRITION_EXTREME");
      expect(operated.state.actions.map(action => action.action)).not.toContain("explore");
      expect(await readFile(operated.outPath, "utf-8")).toContain("COMPLETE_CASE_ATTRITION_EXTREME");
      expect(await readFile(operated.reportPath, "utf-8")).toContain("Issue codes: COMPLETE_CASE_ATTRITION_EXTREME");
      expect(renderResearchControllerOperate(operated)).toContain("issue codes: COMPLETE_CASE_ATTRITION_EXTREME");
      expect(renderResearchControllerOperate(operated)).toContain("issueCodes=COMPLETE_CASE_ATTRITION_EXTREME");
      expect(renderResearchControllerOperate(operated)).toContain("evidence=");
      expect(renderResearchControllerOperate(operated)).toContain(operated.cycles[0]?.doctorPath ?? "");
      expect(renderResearchControllerOperate(operated)).toContain(`report: ${operated.reportPath}`);
      expect(renderResearchControllerOperate(operated)).toContain("reason=");
      expect(renderResearchControllerOperate(operated)).toContain("COMPLETE_CASE_ATTRITION_EXTREME");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("runs a bounded follow loop until max iterations or refusal", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "agenteer-controller-follow-loop-"));
    try {
      const data = await writeLinearCsv(path.join(dir, "rows.csv"), 72);
      const state = await researchControllerInitCommand({
        question: "Is x associated with y?",
        outDir: path.join(dir, "run"),
        dataPath: data,
        method: "linear-regression",
        outcome: "y",
        exposure: "x",
      });
      const loop = await researchControllerFollowLoopCommand({
        statePath: state.statePath,
        maxIterations: 2,
        maxStepsPerRun: 1,
        reason: "test_follow_loop",
      });

      expect(loop.iterations).toHaveLength(2);
      expect(loop.iterations.every(iteration => iteration.executed)).toBe(true);
      expect(loop.iterations[0]?.selectedIssueCodes).toEqual([]);
      expect(loop.iterations[0]?.selectedEvidenceRefs.length).toBeGreaterThan(0);
      expect(loop.iterations[0]?.followRecordPath).toMatch(/controller-follow-agenda/);
      expect(loop.iterations[0]?.followReportPath).toMatch(/controller-follow-agenda/);
      expect(loop.stoppedReason).toMatch(/max follow-loop iterations/);
      expect(loop.state.actions.length).toBeGreaterThanOrEqual(2);
      expect(loop.state.artifacts.map(artifact => artifact.kind)).toContain("controller-follow-loop");
      expect(await fileExists(loop.reportPath)).toBe(true);
      expect(await fileExists(loop.iterations[0]?.followRecordPath ?? "")).toBe(true);
      expect(await fileExists(loop.iterations[0]?.followReportPath ?? "")).toBe(true);
      expect(renderResearchControllerFollowLoop(loop)).toContain("issueCodes=none");
      expect(renderResearchControllerFollowLoop(loop)).toContain("evidence=");
      expect(renderResearchControllerFollowLoop(loop)).toContain(`follow=${loop.iterations[0]?.followRecordPath}`);
      expect(renderResearchControllerFollowLoop(loop)).toContain(`report=${loop.iterations[0]?.followReportPath}`);
      expect(renderResearchControllerFollowLoop(loop)).toContain("reason=");
      expect(renderResearchControllerFollowLoop(loop)).toContain(`report: ${loop.reportPath}`);
      expect(await readFile(loop.reportPath, "utf-8")).toContain("Selected issue codes: (none)");
      expect(await readFile(loop.reportPath, "utf-8")).toContain("Selected evidence:");
      expect(await readFile(loop.reportPath, "utf-8")).toContain("Follow report:");

      const badData = path.join(dir, "bad-loop.csv");
      await writeFile(badData, "y,x\n1,0\n2,1\n3,2\n");
      const blocked = await researchControllerRunCommand({
        question: "Is x associated with y?",
        outDir: path.join(dir, "blocked-loop"),
        dataPath: badData,
        method: "linear-regression",
        outcome: "y",
        exposure: "x",
        maxSteps: 8,
      });
      const refused = await researchControllerFollowLoopCommand({
        statePath: blocked.state.statePath,
        maxIterations: 3,
        maxStepsPerRun: 1,
        reason: "test_blocked_follow_loop",
      });
      expect(refused.iterations).toHaveLength(0);
      expect(refused.terminal).toBe(true);
      expect(refused.stoppedReason).toMatch(/terminal|paused/);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("supervises unattended pickup with runner packets, follow loops, and post-round audits", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "agenteer-controller-supervisor-"));
    try {
      const data = await writeLinearCsv(path.join(dir, "rows.csv"), 80);
      const state = await researchControllerInitCommand({
        question: "Is x associated with y?",
        outDir: path.join(dir, "run"),
        dataPath: data,
        method: "linear-regression",
        outcome: "y",
        exposure: "x",
      });
      const supervised = await researchControllerSupervisorCommand({
        statePath: state.statePath,
        maxRounds: 3,
        maxIterationsPerRound: 2,
        maxStepsPerRun: 4,
        reason: "test_supervised_pickup",
      });
      const artifactKinds = supervised.state.artifacts.map(artifact => artifact.kind);

      expect(supervised.rounds.length).toBeGreaterThan(0);
      expect(supervised.rounds[0]?.runnerPacketPath).toMatch(/controller_model_runner_packet/);
      expect(supervised.rounds[0]?.runnerPacketReportPath).toMatch(/controller_model_runner_packet/);
      expect(supervised.rounds[0]?.runnerPacketFeasibilityReadiness).toBeNull();
      expect(supervised.rounds[0]?.runnerPacketFeasibilityVerdict).toBeNull();
      expect(supervised.rounds[0]?.runnerPacketFeasibilityPath).toBeNull();
      expect(supervised.rounds[0]?.safeAgendaPrimary).toBe(true);
      expect(supervised.rounds[0]?.followLoopIssueCodes).toEqual([]);
      expect(supervised.rounds.some(round => (round.followLoopIterations ?? 0) > 0)).toBe(true);
      expect(supervised.rounds.some(round => round.auditPath)).toBe(true);
      expect(supervised.rounds.some(round => round.followLoopReportPath)).toBe(true);
      expect(supervised.rounds.some(round => round.auditReportPath)).toBe(true);
      expect(supervised.state.status).toMatch(/complete|needs_human_review|running/);
      expect(artifactKinds).toEqual(expect.arrayContaining([
        "controller-supervisor",
        "controller-supervisor-report",
        "controller-model-runner-packet",
        "controller-follow-loop",
        "controller-operator-audit",
      ]));
      expect(await fileExists(supervised.outPath)).toBe(true);
      expect(await fileExists(supervised.reportPath)).toBe(true);
      expect(await fileExists(supervised.rounds[0]?.runnerPacketReportPath ?? "")).toBe(true);
      const roundWithFollowLoop = supervised.rounds.find(round => round.followLoopReportPath);
      const roundWithAudit = supervised.rounds.find(round => round.auditReportPath);
      expect(await fileExists(roundWithFollowLoop?.followLoopReportPath ?? "")).toBe(true);
      expect(await fileExists(roundWithAudit?.auditReportPath ?? "")).toBe(true);
      expect(await readFile(supervised.reportPath, "utf-8")).toContain("Runner packet feasibility: missing");
      expect(await readFile(supervised.reportPath, "utf-8")).toContain("Runner packet report:");
      expect(await readFile(supervised.reportPath, "utf-8")).toContain("Follow-loop report:");
      expect(await readFile(supervised.reportPath, "utf-8")).toContain("Audit report:");
      expect(await readFile(supervised.reportPath, "utf-8")).toContain("Follow-loop issue codes: (none)");
      expect(renderResearchControllerSupervisor(supervised)).toContain("latest packet feasibility: (missing)");
      expect(renderResearchControllerSupervisor(supervised)).toContain("feasibility=missing");
      expect(renderResearchControllerSupervisor(supervised)).toContain(`packetReport=${supervised.rounds[0]?.runnerPacketReportPath}`);
      expect(renderResearchControllerSupervisor(supervised)).toContain(`followReport=${roundWithFollowLoop?.followLoopReportPath}`);
      expect(renderResearchControllerSupervisor(supervised)).toContain(`auditReport=${roundWithAudit?.auditReportPath}`);
      expect(renderResearchControllerSupervisor(supervised)).toContain("issueCodes=none");
      expect(renderResearchControllerSupervisor(supervised)).toContain("evidence=");
      expect(renderResearchControllerSupervisor(supervised)).toContain(supervised.rounds[0]?.runnerPacketPath ?? "");
      expect(renderResearchControllerSupervisor(supervised)).toContain(`report: ${supervised.reportPath}`);
      expect(renderResearchControllerSupervisor(supervised)).toContain("reason=");
      const persisted = JSON.parse(await readFile(supervised.state.statePath, "utf-8")) as { controllerState: ControllerState };
      expect(persisted.controllerState.artifacts.map(artifact => artifact.kind)).toContain("controller-supervisor");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("rejects infeasible paper ideas before execution when required data are too small", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "agenteer-controller-small-"));
    try {
      const data = path.join(dir, "rows.csv");
      await writeFile(data, "y,x\n1,0\n2,1\n3,2\n");
      const result = await researchControllerRunCommand({
        question: "Is x associated with y?",
        outDir: path.join(dir, "run"),
        dataPath: data,
        method: "linear-regression",
        outcome: "y",
        exposure: "x",
        maxSteps: 8,
      });

      expect(result.state.status).toBe("blocked");
      expect(result.state.currentStage).toBe("blocked");
      expect(result.state.gates.find(gate => gate.stage === "dataset_feasibility")?.reasons.join(" ")).toMatch(/below minimum/);
      expect(result.state.actions.some(action => action.action === "run_analysis")).toBe(false);
      const issueLedgerPath = result.state.issueLedgers.at(-1)?.outPath;
      const issueLedger = JSON.parse(await readFile(issueLedgerPath ?? "", "utf-8")) as { controllerIssueLedger: { status: string; counts: { blockers: number }; topIssue: { category: string; message: string } | null; issues: Array<{ category: string; severity: string; suggestedAction: string }> } };
      expect(issueLedger.controllerIssueLedger.status).toBe("blocked");
      expect(issueLedger.controllerIssueLedger.counts.blockers).toBeGreaterThan(0);
      expect(issueLedger.controllerIssueLedger.topIssue?.category).toBe("data");
      expect(issueLedger.controllerIssueLedger.issues.some(issue => /below minimum/.test(issue.message))).toBe(true);
      expect(issueLedger.controllerIssueLedger.issues.some(issue => /dataset_feasibility/.test(issue.suggestedAction))).toBe(true);
      const handoffPath = path.join(result.state.rootDir, "controller-terminal-handoff.json");
      const handoffReportPath = path.join(result.state.rootDir, "controller-terminal-handoff.md");
      const nextActionPath = path.join(result.state.rootDir, "controller-next-action.json");
      const handoff = JSON.parse(await readFile(handoffPath, "utf-8")) as Record<string, { trigger: string; failureAttribution: Array<{ category: string; severity: string }>; suggestedCommands: string[] }>;
      const nextAction = JSON.parse(await readFile(nextActionPath, "utf-8")) as { controllerNextAction: { status: string; safeToAutoResume: boolean; recommendedCommand: string; alternativeCommands: string[]; issueLedger: { path: string | null; reportPath: string | null; topIssues: Array<{ category: string; message: string }> }; reentryPlan: { status: string; recommendedStage: string }; mustReviewArtifacts: Array<{ kind: string }>; createdFromArtifacts: { terminalHandoffReport: string; reentryPlanReport: string; issueLedgerReport: string | null } } };
      expect(handoff.controllerTerminalHandoff.trigger).toBe("blocked");
      expect(handoff.controllerTerminalHandoff.failureAttribution).toEqual(expect.arrayContaining([expect.objectContaining({ category: "data", severity: "blocker" })]));
      expect(handoff.controllerTerminalHandoff.reentryPlan.status).toBe("patch_then_resume");
      expect(handoff.controllerTerminalHandoff.reentryPlan.recommendedStage).toBe("dataset_feasibility");
      expect(handoff.controllerTerminalHandoff.suggestedCommands[0]).toContain("controller-status");
      expect(handoff.controllerTerminalHandoff.suggestedCommands.join("\n")).toMatch(/controller-patch/);
      expect(nextAction.controllerNextAction.status).toBe("blocked");
      expect(nextAction.controllerNextAction.safeToAutoResume).toBe(false);
      expect(nextAction.controllerNextAction.reentryPlan.status).toBe("patch_then_resume");
      expect(nextAction.controllerNextAction.reentryPlan.recommendedStage).toBe("dataset_feasibility");
      expect(nextAction.controllerNextAction.recommendedCommand).toMatch(/controller-patch/);
      expect(nextAction.controllerNextAction.alternativeCommands).toEqual(expect.arrayContaining([
        expect.stringContaining("controller-status"),
      ]));
      expect(nextAction.controllerNextAction.issueLedger.topIssues.some(issue => issue.category === "data")).toBe(true);
      expect(nextAction.controllerNextAction.issueLedger.reportPath).toContain("controller_issue_ledger_");
      expect(nextAction.controllerNextAction.createdFromArtifacts.terminalHandoffReport).toBe(handoffReportPath);
      expect(nextAction.controllerNextAction.createdFromArtifacts.reentryPlanReport).toContain("controller-reentry-plan.md");
      expect(nextAction.controllerNextAction.createdFromArtifacts.issueLedgerReport).toContain("controller_issue_ledger_");
      const goldenPacketPath = path.join(result.state.rootDir, "controller-golden-packet.json");
      const goldenPacketReportPath = path.join(result.state.rootDir, "controller-golden-packet.md");
      expect(await fileExists(goldenPacketPath)).toBe(true);
      expect(await fileExists(goldenPacketReportPath)).toBe(true);
      const goldenPacket = JSON.parse(await readFile(goldenPacketPath, "utf-8")) as { controllerGoldenPacket: { status: string; readiness: { promotable: boolean; promotionDecision: string }; blockers: string[]; stageSummary: Array<{ stage: string; completed: boolean; latestAction: string | null }>; keyArtifacts: Record<string, string | null>; keyArtifactReports: Record<string, string | null>; nextAction: string } };
      expect(goldenPacket.controllerGoldenPacket.status).toBe("blocked");
      expect(goldenPacket.controllerGoldenPacket.readiness.promotable).toBe(false);
      expect(goldenPacket.controllerGoldenPacket.readiness.promotionDecision).toBe("human_review");
      expect(goldenPacket.controllerGoldenPacket.blockers.join(" ")).toMatch(/below minimum/);
      expect(goldenPacket.controllerGoldenPacket.stageSummary).toEqual(expect.arrayContaining([
        expect.objectContaining({ stage: "dataset_feasibility", completed: false }),
        expect.objectContaining({ stage: "execution", completed: false, latestAction: null }),
      ]));
      expect(goldenPacket.controllerGoldenPacket.keyArtifacts.feasibility).toContain("controller-feasibility-verdict.json");
      expect(goldenPacket.controllerGoldenPacket.keyArtifacts.issueLedger).toContain("controller_issue_ledger_");
      expect(goldenPacket.controllerGoldenPacket.keyArtifacts.stageReview).toContain("controller_stage_review_");
      expect(goldenPacket.controllerGoldenPacket.keyArtifacts.nextAction).toContain("controller-next-action.json");
      expect(goldenPacket.controllerGoldenPacket.keyArtifacts.reentryPlan).toContain("controller-reentry-plan.json");
      expect(goldenPacket.controllerGoldenPacket.keyArtifactReports.feasibility).toContain("controller-feasibility-verdict.md");
      expect(goldenPacket.controllerGoldenPacket.keyArtifactReports.issueLedger).toContain("controller_issue_ledger_");
      expect(goldenPacket.controllerGoldenPacket.keyArtifactReports.stageReview).toContain("controller_stage_review_");
      expect(goldenPacket.controllerGoldenPacket.keyArtifactReports.nextAction).toContain("controller-next-action.md");
      expect(goldenPacket.controllerGoldenPacket.keyArtifactReports.reentryPlan).toContain("controller-reentry-plan.md");
      expect(goldenPacket.controllerGoldenPacket.keyArtifactReports).toMatchObject({
        state: null,
        methodSelection: null,
        modelingPlan: null,
        statsRun: null,
        statsQa: null,
        manuscript: null,
        manuscriptQa: null,
        reviewAdjudication: null,
      });
      const goldenPacketReport = await readFile(goldenPacketReportPath, "utf-8");
      expect(goldenPacketReport).toContain("- state: not report-backed");
      expect(goldenPacketReport).toContain("- methodSelection: not report-backed");
      expect(goldenPacketReport).toContain("- modelingPlan: not report-backed");
      expect(goldenPacketReport).toContain("- statsRun: not report-backed");
      expect(goldenPacketReport).toContain("- statsQa: not report-backed");
      expect(goldenPacketReport).toContain("- manuscript: not report-backed");
      expect(goldenPacketReport).toContain("- manuscriptQa: not report-backed");
      expect(goldenPacketReport).toContain("- reviewAdjudication: not report-backed");
      expect(goldenPacket.controllerGoldenPacket.keyArtifacts.statsRun).toBeNull();
      expect(goldenPacket.controllerGoldenPacket.nextAction).toMatch(/Do not execute downstream analysis/);
      const goldenPacketConsole = renderResearchControllerGoldenPacket(goldenPacket.controllerGoldenPacket);
      expect(goldenPacketConsole).toContain("key reports:");
      expect(goldenPacketConsole).toContain("- report state: not report-backed");
      expect(goldenPacketConsole).toContain("- report statsRun: not report-backed");
      expect(goldenPacketConsole).toContain("- report statsQa: not report-backed");
      const refreshedGoldenPacket = await researchControllerGoldenPacketCommand({
        statePath: result.state.statePath,
        reason: "test refresh blocked golden packet",
      });
      expect(refreshedGoldenPacket.status).toBe("blocked");
      expect(refreshedGoldenPacket.readiness.promotable).toBe(false);
      expect(refreshedGoldenPacket.blockers.join(" ")).toMatch(/below minimum/);
      expect(refreshedGoldenPacket.keyArtifacts.statsRun).toBeNull();
      expect(refreshedGoldenPacket.keyArtifacts.issueLedger).toContain("controller_issue_ledger_");
      expect(refreshedGoldenPacket.keyArtifacts.stageReview).toContain("controller_stage_review_");
      expect(refreshedGoldenPacket.keyArtifacts.nextAction).toContain("controller-next-action.json");
      expect(refreshedGoldenPacket.keyArtifactReports.issueLedger).toContain("controller_issue_ledger_");
      expect(refreshedGoldenPacket.keyArtifactReports.nextAction).toContain("controller-next-action.md");
      expect(refreshedGoldenPacket.keyArtifactReports).toMatchObject({
        state: null,
        methodSelection: null,
        modelingPlan: null,
        statsRun: null,
        statsQa: null,
        manuscript: null,
        manuscriptQa: null,
        reviewAdjudication: null,
      });
      expect(result.state.stageReviews.length).toBeGreaterThanOrEqual(1);
      const stageReview = JSON.parse(await readFile(result.state.stageReviews.at(-1)?.outPath ?? "", "utf-8")) as { controllerStageReview: { status: string; reviewedStage: string; findings: Array<{ severity: string; category: string; message: string; repairAction: string }> } };
      expect(stageReview.controllerStageReview.status).toBe("block");
      expect(stageReview.controllerStageReview.reviewedStage).toBe("dataset_feasibility");
      expect(stageReview.controllerStageReview.findings).toEqual(expect.arrayContaining([
        expect.objectContaining({ severity: "blocker", category: "data" }),
      ]));
      expect(stageReview.controllerStageReview.findings.map(finding => finding.repairAction).join(" ")).toMatch(/Patch study variables|Do not execute downstream/);
      const latestAgenda = JSON.parse(await readFile(result.state.agendas.at(-1)?.outPath ?? "", "utf-8")) as { controllerExecutionAgenda: { status: string; primaryCommand: string; sourceArtifacts: { issueLedger: string | null; stageReview: string | null; nextAction: string | null }; items: Array<{ kind: string; status: string; safety: string; source: string; command: string }> } };
      expect(latestAgenda.controllerExecutionAgenda.status).toBe("blocked");
      expect(latestAgenda.controllerExecutionAgenda.primaryCommand).toMatch(/controller-patch|controller-status|controller-inspect/);
      expect(latestAgenda.controllerExecutionAgenda.sourceArtifacts.issueLedger).toBeTruthy();
      expect(latestAgenda.controllerExecutionAgenda.sourceArtifacts.stageReview).toBeTruthy();
      expect(latestAgenda.controllerExecutionAgenda.sourceArtifacts.nextAction).toBeTruthy();
      expect(latestAgenda.controllerExecutionAgenda.items).toEqual(expect.arrayContaining([
        expect.objectContaining({ kind: "patch", safety: "requires_review" }),
      ]));
      expect(result.state.artifacts.map(artifact => artifact.kind)).toEqual(expect.arrayContaining(["controller-next-action", "controller-next-action-report"]));
      expect(result.state.artifacts.map(artifact => artifact.kind)).toEqual(expect.arrayContaining(["controller-golden-packet", "controller-golden-packet-report"]));
      expect(result.state.artifacts.map(artifact => artifact.kind)).toEqual(expect.arrayContaining(["controller-model-runner-packet", "controller-model-runner-packet-report"]));
      expect(await readFile(handoffReportPath, "utf-8")).toMatch(/Failure Attribution/);
      expect(await fileExists(path.join(result.state.rootDir, "controller-reentry-plan.json"))).toBe(true);
      const blockedRunnerPacketPath = result.state.artifacts.find(artifact => artifact.kind === "controller-model-runner-packet")?.path;
      expect(blockedRunnerPacketPath).toBeTruthy();
      const blockedRunnerPacket = JSON.parse(await readFile(blockedRunnerPacketPath as string, "utf-8")) as { controllerModelRunnerPacket: { status: string; recommendedCommand: string; forbiddenActions: string[] } };
      expect(blockedRunnerPacket.controllerModelRunnerPacket.status).toMatch(/blocked|review/);
      expect(blockedRunnerPacket.controllerModelRunnerPacket.recommendedCommand).toMatch(/controller-patch|controller-status|controller-inspect/);
      expect(blockedRunnerPacket.controllerModelRunnerPacket.forbiddenActions.join(" ")).toMatch(/arbitrary shell/);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("routes typed feasibility issue codes into issue ledger and re-entry artifacts", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "agenteer-controller-feasibility-codes-"));
    try {
      const data = path.join(dir, "rows.csv");
      await writeFile(data, [
        "mortality,treatment,age,risk_score,lab",
        ...Array.from({ length: 120 }, (_, index) => {
          const lab = index < 14 ? (3.5 + index / 100).toFixed(2) : "";
          const mortality = index < 60 ? 1 : 0;
          return `${mortality},${Math.floor(index / 2) % 2},${45 + index % 40},${(0.2 + (index % 20) / 10).toFixed(2)},${lab}`;
        }),
      ].join("\n"));

      const result = await researchControllerRunCommand({
        question: "Is treatment associated with mortality after adjustment for baseline laboratory values?",
        outDir: path.join(dir, "run"),
        dataPath: data,
        method: "logistic-regression",
        outcome: "mortality",
        exposure: "treatment",
        covariates: ["age", "risk_score", "lab"],
        maxSteps: 8,
      });

      expect(result.state.status).toBe("blocked");
      expect(result.state.actions.some(action => action.action === "run_analysis")).toBe(false);
      const verdict = JSON.parse(await readFile(path.join(result.state.rootDir, "controller-feasibility-verdict.json"), "utf-8")) as {
        controllerFeasibilityVerdict: { issues: Array<{ code: string; severity: string }> };
      };
      expect(verdict.controllerFeasibilityVerdict.issues).toEqual(expect.arrayContaining([
        expect.objectContaining({ code: "COMPLETE_CASE_ATTRITION_EXTREME", severity: "blocker" }),
      ]));

      const issueLedger = JSON.parse(await readFile(result.state.issueLedgers.at(-1)?.outPath ?? "", "utf-8")) as {
        controllerIssueLedger: { status: string; issues: Array<{ source: string; issueCode?: string; message: string; reentryStage: string }> };
      };
      expect(issueLedger.controllerIssueLedger.status).toBe("blocked");
      expect(issueLedger.controllerIssueLedger.issues).toEqual(expect.arrayContaining([
        expect.objectContaining({
          source: "feasibility:COMPLETE_CASE_ATTRITION_EXTREME",
          issueCode: "COMPLETE_CASE_ATTRITION_EXTREME",
          reentryStage: "dataset_feasibility",
        }),
      ]));
      expect(issueLedger.controllerIssueLedger.issues.find(issue => issue.issueCode === "COMPLETE_CASE_ATTRITION_EXTREME")?.message).toContain("COMPLETE_CASE_ATTRITION_EXTREME");
      expect(issueLedger.controllerIssueLedger.issues.find(issue => issue.issueCode === "COMPLETE_CASE_ATTRITION_EXTREME")?.message).toContain("selected analysis variables");
      const stateConsole = renderResearchControllerState(result);
      expect(result.state.issueLedgers.at(-1)?.topIssues).toEqual(expect.arrayContaining([
        expect.objectContaining({
          issueCode: "COMPLETE_CASE_ATTRITION_EXTREME",
          evidenceRefs: expect.arrayContaining([path.join(result.state.rootDir, "controller-feasibility-verdict.json")]),
        }),
      ]));
      expect(stateConsole).toContain("COMPLETE_CASE_ATTRITION_EXTREME");
      expect(stateConsole).toContain("evidence=");
      expect(stateConsole).toContain("controller-feasibility-verdict.json");
      const stageReview = JSON.parse(await readFile(result.state.stageReviews.at(-1)?.outPath ?? "", "utf-8")) as {
        controllerStageReview: {
          status: string;
          findings: Array<{ severity: string; category: string; issueCodes?: string[]; message: string }>;
        };
      };
      expect(stageReview.controllerStageReview.status).toBe("block");
      expect(stageReview.controllerStageReview.findings).toEqual(expect.arrayContaining([
        expect.objectContaining({
          severity: "blocker",
          category: "data",
          issueCodes: expect.arrayContaining(["COMPLETE_CASE_ATTRITION_EXTREME"]),
          message: expect.stringContaining("COMPLETE_CASE_ATTRITION_EXTREME"),
        }),
      ]));
      expect(await readFile(result.state.stageReviews.at(-1)?.reportPath ?? "", "utf-8")).toContain("COMPLETE_CASE_ATTRITION_EXTREME");
      const goldenPacket = JSON.parse(await readFile(path.join(result.state.rootDir, "controller-golden-packet.json"), "utf-8")) as {
        controllerGoldenPacket: {
          status: string;
          readiness: { promotable: boolean };
          activeIssueCodes: string[];
          activeBlockerIssueCodes: string[];
          issueSummary: Array<{ category: string; severity: string; issueCodes: string[]; message: string; evidenceRefs: string[] }>;
          keyArtifactReports: Record<string, string | null>;
          reportPath: string;
        };
      };
      expect(goldenPacket.controllerGoldenPacket.status).toBe("blocked");
      expect(goldenPacket.controllerGoldenPacket.readiness.promotable).toBe(false);
      expect(goldenPacket.controllerGoldenPacket.issueSummary).toEqual(expect.arrayContaining([
        expect.objectContaining({
          category: "issue_ledger",
          severity: "blocker",
          issueCodes: expect.arrayContaining(["COMPLETE_CASE_ATTRITION_EXTREME"]),
          message: expect.stringContaining("selected analysis variables"),
        }),
      ]));
      expect(goldenPacket.controllerGoldenPacket.activeIssueCodes).toEqual(expect.arrayContaining(["COMPLETE_CASE_ATTRITION_EXTREME"]));
      expect(goldenPacket.controllerGoldenPacket.activeBlockerIssueCodes).toEqual(expect.arrayContaining(["COMPLETE_CASE_ATTRITION_EXTREME"]));
      const goldenPacketConsole = renderResearchControllerGoldenPacket(goldenPacket.controllerGoldenPacket);
      expect(goldenPacketConsole).toContain("issue summary:");
      expect(goldenPacketConsole).toContain("COMPLETE_CASE_ATTRITION_EXTREME");
      expect(goldenPacketConsole).toContain("- issue blocker/issue_ledger");
      expect(goldenPacketConsole).toContain("evidence=");
      expect(goldenPacketConsole).toContain("controller_issue_ledger");
      expect(goldenPacketConsole).toContain("key reports:");
      expect(goldenPacketConsole).toContain("- report issueLedger:");
      expect(goldenPacketConsole).toContain("report:");
      expect(goldenPacketConsole).toContain("controller-golden-packet.md");
      expect(goldenPacket.controllerGoldenPacket.keyArtifactReports.issueLedger).toContain("controller_issue_ledger_");
      expect(await readFile(path.join(result.state.rootDir, "controller-golden-packet.md"), "utf-8")).toContain("COMPLETE_CASE_ATTRITION_EXTREME");
      expect(await readFile(path.join(result.state.rootDir, "controller-golden-packet.md"), "utf-8")).toContain("## Key Artifact Reports");

      const reentryPlan = JSON.parse(await readFile(path.join(result.state.rootDir, "controller-reentry-plan.json"), "utf-8")) as {
        controllerReentryPlan: { status: string; recommendedStage: string; reason: string };
      };
      expect(reentryPlan.controllerReentryPlan.status).toBe("patch_then_resume");
      expect(reentryPlan.controllerReentryPlan.recommendedStage).toBe("dataset_feasibility");
      expect(reentryPlan.controllerReentryPlan.reason).toContain("COMPLETE_CASE_ATTRITION_EXTREME");
      const nextAction = JSON.parse(await readFile(path.join(result.state.rootDir, "controller-next-action.json"), "utf-8")) as {
        controllerNextAction: { issueLedger: { reportPath: string | null; topIssues: Array<{ issueCode?: string; suggestedAction: string }> }; createdFromArtifacts: { issueLedgerReport: string | null } };
      };
      expect(nextAction.controllerNextAction.issueLedger.reportPath).toContain("controller_issue_ledger_");
      expect(nextAction.controllerNextAction.createdFromArtifacts.issueLedgerReport).toContain("controller_issue_ledger_");
      expect(nextAction.controllerNextAction.issueLedger.topIssues).toEqual(expect.arrayContaining([
        expect.objectContaining({
          issueCode: "COMPLETE_CASE_ATTRITION_EXTREME",
          suggestedAction: expect.stringContaining("Revise high-missingness variables"),
        }),
      ]));
      expect(await readFile(path.join(result.state.rootDir, "controller-next-action.md"), "utf-8")).toContain("COMPLETE_CASE_ATTRITION_EXTREME");
      expect(await readFile(path.join(result.state.rootDir, "controller-next-action.md"), "utf-8")).toContain("Issue ledger report:");
      const latestAgenda = JSON.parse(await readFile(result.state.agendas.at(-1)?.outPath ?? "", "utf-8")) as {
        controllerExecutionAgenda: {
          status: string;
          activeIssueCodes: string[];
          activeBlockerIssueCodes: string[];
          items: Array<{ source: string; status: string; safety: string; issueCodes?: string[] }>;
        };
      };
      expect(latestAgenda.controllerExecutionAgenda.status).toBe("blocked");
      expect(latestAgenda.controllerExecutionAgenda.activeIssueCodes).toEqual(expect.arrayContaining(["COMPLETE_CASE_ATTRITION_EXTREME"]));
      expect(latestAgenda.controllerExecutionAgenda.activeBlockerIssueCodes).toEqual(expect.arrayContaining(["COMPLETE_CASE_ATTRITION_EXTREME"]));
      expect(latestAgenda.controllerExecutionAgenda.items).toEqual(expect.arrayContaining([
        expect.objectContaining({
          status: "blocked",
          safety: "requires_review",
          issueCodes: expect.arrayContaining(["COMPLETE_CASE_ATTRITION_EXTREME"]),
        }),
      ]));
      expect(renderResearchControllerAgenda(latestAgenda.controllerExecutionAgenda)).toContain("issueCodes=COMPLETE_CASE_ATTRITION_EXTREME");
      expect(await readFile(result.state.agendas.at(-1)?.reportPath ?? "", "utf-8")).toContain("COMPLETE_CASE_ATTRITION_EXTREME");
      const operatorAudit = await researchControllerAuditCommand({
        statePath: result.state.statePath,
        reason: "Verify operator audit preserves typed feasibility issue codes.",
      });
      expect(operatorAudit.status).toBe("fail");
      expect(operatorAudit.readiness).toBe("blocked");
      expect(operatorAudit.checks).toEqual(expect.arrayContaining([
        expect.objectContaining({
          id: "feasibility",
          status: "fail",
          issueCodes: expect.arrayContaining(["COMPLETE_CASE_ATTRITION_EXTREME"]),
        }),
        expect.objectContaining({
          id: "issue-ledger",
          status: "fail",
          issueCodes: expect.arrayContaining(["COMPLETE_CASE_ATTRITION_EXTREME"]),
        }),
      ]));
      expect(operatorAudit.readinessBlockers).toEqual(expect.arrayContaining([
        expect.objectContaining({
          id: "feasibility",
          severity: "blocker",
          issueCodes: expect.arrayContaining(["COMPLETE_CASE_ATTRITION_EXTREME"]),
          message: expect.stringContaining("COMPLETE_CASE_ATTRITION_EXTREME"),
        }),
      ]));
      expect(renderResearchControllerAudit(operatorAudit)).toContain("readiness blockers:");
      expect(renderResearchControllerAudit(operatorAudit)).toContain("- readiness blocker/data");
      expect(renderResearchControllerAudit(operatorAudit)).toContain("COMPLETE_CASE_ATTRITION_EXTREME");
      expect(renderResearchControllerAudit(operatorAudit)).toContain("dataset semantic audit:");
      expect(await readFile(operatorAudit.reportPath, "utf-8")).toContain("COMPLETE_CASE_ATTRITION_EXTREME");
      const runnerPacketPath = result.state.artifacts.find(artifact => artifact.kind === "controller-model-runner-packet")?.path ?? "";
      expect(runnerPacketPath).toBeTruthy();
      const runnerPacket = JSON.parse(await readFile(runnerPacketPath, "utf-8")) as {
        controllerModelRunnerPacket: ControllerModelRunnerPacket;
      };
      expect(runnerPacket.controllerModelRunnerPacket.status).toBe("blocked");
      expect(runnerPacket.controllerModelRunnerPacket.safeToAutoExecute).toBe(false);
      expect(runnerPacket.controllerModelRunnerPacket.activeIssueCodes).toEqual(expect.arrayContaining(["COMPLETE_CASE_ATTRITION_EXTREME"]));
      expect(runnerPacket.controllerModelRunnerPacket.activeBlockerIssueCodes).toEqual(expect.arrayContaining(["COMPLETE_CASE_ATTRITION_EXTREME"]));
      expect(runnerPacket.controllerModelRunnerPacket.systemPrompt).toContain("activeBlockerIssueCodes");
      expect(runnerPacket.controllerModelRunnerPacket.userPrompt).toContain("Active issue codes");
      expect(runnerPacket.controllerModelRunnerPacket.userPrompt).toContain("Active blocker issue codes");
      expect(runnerPacket.controllerModelRunnerPacket.userPrompt).toContain("COMPLETE_CASE_ATTRITION_EXTREME");
      expect(runnerPacket.controllerModelRunnerPacket.handoffBlockers).toEqual(expect.arrayContaining([
        expect.objectContaining({
          category: "issue_ledger",
          severity: "blocker",
          issueCodes: expect.arrayContaining(["COMPLETE_CASE_ATTRITION_EXTREME"]),
          message: expect.stringContaining("selected analysis variables"),
        }),
      ]));
      const runnerPacketConsole = renderResearchControllerRunnerPacket(runnerPacket.controllerModelRunnerPacket);
      expect(runnerPacketConsole).toContain("handoff blockers:");
      expect(runnerPacketConsole).toContain("COMPLETE_CASE_ATTRITION_EXTREME");
      expect(runnerPacketConsole).toContain("- handoff blocker/issue_ledger");
      expect(runnerPacketConsole).toContain("evidence=");
      expect(runnerPacketConsole).toContain("controller_issue_ledger");
      expect(runnerPacketConsole).toContain("evidence refs:");
      expect(runnerPacketConsole).toContain("report:");
      expect(runnerPacketConsole).toContain("controller_model_runner_packet_");
      expect(await readFile(result.state.artifacts.find(artifact => artifact.kind === "controller-model-runner-packet-report")?.path ?? "", "utf-8")).toContain("COMPLETE_CASE_ATTRITION_EXTREME");
      const completionAudit = await researchControllerCompletionAuditCommand({
        statePath: result.state.statePath,
        reason: "Verify typed feasibility issue codes are preserved in completion audit.",
      });
      expect(completionAudit.status).toBe("fail");
      expect(completionAudit.requirements).toEqual(expect.arrayContaining([
        expect.objectContaining({
          id: "active-issue-ledger",
          status: "failed",
          issueCodes: expect.arrayContaining(["COMPLETE_CASE_ATTRITION_EXTREME"]),
          finding: expect.stringContaining("COMPLETE_CASE_ATTRITION_EXTREME"),
        }),
      ]));
      expect(renderResearchControllerCompletionAudit(completionAudit)).toContain("COMPLETE_CASE_ATTRITION_EXTREME");
      expect(renderResearchControllerCompletionAudit(completionAudit)).toContain("evidence=");
      expect(renderResearchControllerCompletionAudit(completionAudit)).toContain(`report: ${completionAudit.reportPath}`);
      const goalAudit = await researchControllerGoalAuditCommand({
        statePath: result.state.statePath,
        objective: "Prevent autonomous research completion claims while coded feasibility blockers remain active.",
        reason: "Verify typed feasibility issue codes block goal audit clearance.",
      });
      const activeIssueClearance = goalAudit.requirements.find(requirement => requirement.id === "active_issue_ledger_clearance");
      expect(goalAudit.status).toBe("fail");
      expect(goalAudit.readiness).toBe("blocked");
      expect(activeIssueClearance).toEqual(expect.objectContaining({
        status: "missing",
        issueCodes: expect.arrayContaining(["COMPLETE_CASE_ATTRITION_EXTREME"]),
      }));
      expect(activeIssueClearance?.gaps.join(" ")).toContain("COMPLETE_CASE_ATTRITION_EXTREME");
      expect(renderResearchControllerGoalAudit(goalAudit)).toContain("- blocking active_issue_ledger_clearance");
      expect(renderResearchControllerGoalAudit(goalAudit)).toContain("COMPLETE_CASE_ATTRITION_EXTREME");
      expect(renderResearchControllerGoalAudit(goalAudit)).toContain(activeIssueClearance?.gaps[0] ?? "COMPLETE_CASE_ATTRITION_EXTREME");
      expect(renderResearchControllerGoalAudit(goalAudit)).toContain("evidence=");
      expect(renderResearchControllerGoalAudit(goalAudit)).toContain(`report: ${goalAudit.reportPath}`);
      expect(await readFile(goalAudit.reportPath, "utf-8")).toContain("COMPLETE_CASE_ATTRITION_EXTREME");
      const doctor = await researchControllerDoctorCommand({
        statePath: result.state.statePath,
        reason: "Verify doctor report preserves typed feasibility issue codes.",
      });
      expect(doctor.status).toBe("blocked");
      expect(doctor.safeToAutoContinue).toBe(false);
      expect(doctor.activeIssueCodes).toEqual(expect.arrayContaining(["COMPLETE_CASE_ATTRITION_EXTREME"]));
      expect(doctor.activeBlockerIssueCodes).toEqual(expect.arrayContaining(["COMPLETE_CASE_ATTRITION_EXTREME"]));
      expect(doctor.blockers.join(" ")).toContain("COMPLETE_CASE_ATTRITION_EXTREME");
      expect(doctor.blockers.join(" ")).toContain("selected analysis variables");
      expect(renderResearchControllerDoctor(doctor)).toContain("- blocker:");
      expect(renderResearchControllerDoctor(doctor)).toContain("COMPLETE_CASE_ATTRITION_EXTREME");
      expect(renderResearchControllerDoctor(doctor)).toContain("evidence: operator=");
      expect(renderResearchControllerDoctor(doctor)).toContain("evidence refs:");
      expect(renderResearchControllerDoctor(doctor)).toContain(`report: ${doctor.reportPath}`);
      expect(doctor.summaries.completionAudit.failedRequirementDetails).toEqual(expect.arrayContaining([
        expect.objectContaining({
          id: "active-issue-ledger",
          issueCodes: expect.arrayContaining(["COMPLETE_CASE_ATTRITION_EXTREME"]),
          finding: expect.stringContaining("selected analysis variables"),
        }),
      ]));
      expect(await readFile(doctor.reportPath, "utf-8")).toContain("COMPLETE_CASE_ATTRITION_EXTREME");
      const runbook = await researchControllerRunbookCommand({
        statePath: result.state.statePath,
        reason: "Verify launch runbook preserves typed feasibility issue codes.",
      });
      expect(runbook.status).toBe("blocked");
      expect(runbook.readyToLaunch).toBe(false);
      expect(runbook.activeIssueCodes).toEqual(expect.arrayContaining(["COMPLETE_CASE_ATTRITION_EXTREME"]));
      expect(runbook.activeBlockerIssueCodes).toEqual(expect.arrayContaining(["COMPLETE_CASE_ATTRITION_EXTREME"]));
      expect(runbook.doctor.activeBlockerIssueCodes).toEqual(expect.arrayContaining(["COMPLETE_CASE_ATTRITION_EXTREME"]));
      expect(runbook.runnerPacket.activeBlockerIssueCodes).toEqual(expect.arrayContaining(["COMPLETE_CASE_ATTRITION_EXTREME"]));
      expect(runbook.launchBlockers).toEqual(expect.arrayContaining([
        expect.objectContaining({
          category: "completion_audit",
          severity: "blocker",
          issueCodes: expect.arrayContaining(["COMPLETE_CASE_ATTRITION_EXTREME"]),
          message: expect.stringContaining("selected analysis variables"),
        }),
      ]));
      const runbookConsole = renderResearchControllerRunbook(runbook);
      expect(runbookConsole).toContain("launch blockers:");
      expect(runbookConsole).toContain("COMPLETE_CASE_ATTRITION_EXTREME");
      expect(runbookConsole).toContain("- launch blocker/completion_audit");
      expect(runbookConsole).toContain(`reports: doctor=${runbook.handoffArtifacts.doctor.reportPath}`);
      expect(runbookConsole).toContain(`runner=${runbook.handoffArtifacts.runnerPacket.reportPath}`);
      expect(runbookConsole).toContain(`audit=${runbook.handoffArtifacts.operatorAudit.reportPath}`);
      expect(runbookConsole).toContain(`environment=${runbook.handoffArtifacts.environment.reportPath}`);
      expect(runbookConsole).toContain(`completion=${runbook.handoffArtifacts.completionAudit.reportPath}`);
      expect(runbookConsole).toContain(`capabilities=${runbook.handoffArtifacts.capabilities.reportPath}`);
      expect(runbookConsole).toContain(`reentry=${runbook.handoffArtifacts.reentryPlan.reportPath}`);
      expect(runbookConsole).toContain("artifacts to inspect:");
      expect(runbookConsole).toContain(runbook.doctor.outPath);
      expect(runbook.handoffArtifacts.doctor.path).toBe(runbook.doctor.outPath);
      expect(runbook.handoffArtifacts.doctor.reportPath).toBe(runbook.doctor.reportPath);
      expect(runbook.handoffArtifacts.runnerPacket.path).toBe(runbook.runnerPacket.path);
      expect(runbook.handoffArtifacts.runnerPacket.reportPath).toBe(runbook.runnerPacket.reportPath);
      expect(runbook.handoffArtifacts.capabilities.path).toBe(runbook.capabilities.path);
      expect(runbook.handoffArtifacts.capabilities.reportPath).toBe(runbook.capabilities.reportPath);
      expect(runbook.artifactsToInspect).toEqual(expect.arrayContaining([
        runbook.handoffArtifacts.doctor.reportPath,
        runbook.handoffArtifacts.runnerPacket.reportPath,
        runbook.handoffArtifacts.operatorAudit.reportPath,
        runbook.handoffArtifacts.completionAudit.reportPath,
        runbook.handoffArtifacts.capabilities.reportPath,
        runbook.handoffArtifacts.reentryPlan.reportPath,
      ]));
      expect(await fileExists(runbook.handoffArtifacts.doctor.reportPath)).toBe(true);
      expect(await fileExists(runbook.handoffArtifacts.runnerPacket.reportPath)).toBe(true);
      expect(await fileExists(runbook.handoffArtifacts.operatorAudit.reportPath)).toBe(true);
      expect(await fileExists(runbook.handoffArtifacts.completionAudit.reportPath)).toBe(true);
      expect(await fileExists(runbook.handoffArtifacts.capabilities.reportPath)).toBe(true);
      expect(await fileExists(runbook.handoffArtifacts.reentryPlan.reportPath)).toBe(true);
      expect(await readFile(runbook.reportPath, "utf-8")).toContain("COMPLETE_CASE_ATTRITION_EXTREME");
      expect(await readFile(runbook.reportPath, "utf-8")).toContain("Doctor report:");
      expect(await readFile(runbook.reportPath, "utf-8")).toContain("Runner packet report:");
      expect(await readFile(runbook.reportPath, "utf-8")).toContain("Environment report:");
      expect(await readFile(runbook.reportPath, "utf-8")).toContain("Capability manifest report:");
      const status = await researchControllerStatusCommand({
        statePath: result.state.statePath,
        reason: "Verify first-read status compact output preserves typed feasibility issue codes.",
      });
      expect(status.status).toBe("blocked");
      expect(status.activeBlockerIssueCodes).toEqual(expect.arrayContaining(["COMPLETE_CASE_ATTRITION_EXTREME"]));
      expect(renderResearchControllerStatus(status)).toContain("- blocker:");
      expect(renderResearchControllerStatus(status)).toContain("COMPLETE_CASE_ATTRITION_EXTREME");
      expect(renderResearchControllerStatus(status)).toContain("evidence: doctor=");
      expect(renderResearchControllerStatus(status)).toContain("reports: doctor=");
      expect(renderResearchControllerStatus(status)).toContain(`report: ${status.reportPath}`);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("executes the data-aware statistical guidance instead of the request-only method fallback", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "agenteer-controller-data-aware-method-"));
    try {
      const data = await writeSkewedTwoGroupCsv(path.join(dir, "rows.csv"));
      const result = await researchControllerRunCommand({
        question: "Compare length of stay between procedure groups.",
        outDir: path.join(dir, "run"),
        dataPath: data,
        outcome: "los_days",
        group: "procedure_group",
        maxSteps: 6,
      });

      const selectAction = result.state.actions.find(action => action.action === "select_method");
      expect(selectAction?.outputSummary).toContain("data-aware-statistical-guidance");
      expect(result.state.inputs.method).toBe("mann-whitney");

      const modelingPlan = JSON.parse(await readFile(path.join(result.state.rootDir, "controller-modeling-plan.json"), "utf-8")) as {
        modelingPlan: {
          statisticalMethodGuidance: {
            source: string;
            recommendedStatsRunMethod: string;
            dataShape: { targetSkewness: number | null; targetOutlierFraction: number | null };
            blockers: unknown[];
          };
        };
      };
      expect(modelingPlan.modelingPlan.statisticalMethodGuidance.source).toBe("table-summary");
      expect(modelingPlan.modelingPlan.statisticalMethodGuidance.recommendedStatsRunMethod).toBe("mann-whitney");
      expect(modelingPlan.modelingPlan.statisticalMethodGuidance.dataShape.targetSkewness ?? 0).toBeGreaterThan(1.5);
      expect(modelingPlan.modelingPlan.statisticalMethodGuidance.blockers).toEqual([]);

      const statsRun = JSON.parse(await readFile(path.join(result.state.inputs.runDir, "stats-run.json"), "utf-8")) as {
        statsRun?: { method?: string; status?: string };
        method?: string;
        status?: string;
      };
      expect(statsRun.statsRun?.method ?? statsRun.method).toBe("mann-whitney");
      expect(statsRun.statsRun?.status ?? statsRun.status).toBe("succeeded");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("blocks selected statistical methods before execution when method-contract roles are missing", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "agenteer-controller-method-contract-block-"));
    try {
      const data = await writeLinearCsv(path.join(dir, "rows.csv"), 80);
      const result = await researchControllerRunCommand({
        question: "Compare y between groups.",
        outDir: path.join(dir, "run"),
        dataPath: data,
        method: "mann-whitney",
        outcome: "y",
        maxSteps: 6,
      });

      expect(result.state.status).toBe("blocked");
      expect(result.state.currentStage).toBe("blocked");
      expect(result.state.actions.map(action => action.action)).not.toContain("run_analysis");

      const verdict = JSON.parse(await readFile(path.join(result.state.rootDir, "controller-feasibility-verdict.json"), "utf-8")) as {
        controllerFeasibilityVerdict: {
          methodChecks: Array<{ id: string; status: string; message: string }>;
          blockers: string[];
        };
      };
      const requiredArgsCheck = verdict.controllerFeasibilityVerdict.methodChecks.find(check => check.id === "method-required-arguments");
      expect(requiredArgsCheck).toMatchObject({ status: "block" });
      expect(requiredArgsCheck?.message).toContain("group");
      expect(verdict.controllerFeasibilityVerdict.blockers.join(" ")).toContain("group");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("selects survival methods from time-to-event roles without collapsing events to binary regression", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "agenteer-controller-survival-method-"));
    try {
      const data = await writeSurvivalCsv(path.join(dir, "survival.csv"), 120);
      const result = await researchControllerRunCommand({
        question: "Is treatment associated with time to death?",
        outDir: path.join(dir, "run"),
        dataPath: data,
        time: "followup_days",
        event: "death",
        exposure: "treatment",
        covariates: ["age"],
        maxSteps: 6,
      });

      expect(result.state.inputs.method).toBe("cox-proportional-hazards");
      expect(result.state.actions.find(action => action.action === "select_method")?.outputSummary).toContain("data-aware-statistical-guidance");
      const modelingPlan = JSON.parse(await readFile(path.join(result.state.rootDir, "controller-modeling-plan.json"), "utf-8")) as {
        modelingPlan: { statisticalMethodGuidance: { recommendedStatsRunMethod: string; alternatives: Array<{ method: string; commandHint: string | null }> } };
      };
      expect(modelingPlan.modelingPlan.statisticalMethodGuidance.recommendedStatsRunMethod).toBe("cox-proportional-hazards");
      expect(modelingPlan.modelingPlan.statisticalMethodGuidance.alternatives.map(item => item.method)).toEqual(expect.arrayContaining(["kaplan-meier", "aalen-johansen-cif"]));
      expect(modelingPlan.modelingPlan.statisticalMethodGuidance.alternatives.find(item => item.method === "cox-proportional-hazards")?.commandHint).toContain("--time followup_days --event death --exposure treatment");
      const statsRun = JSON.parse(await readFile(path.join(result.state.inputs.runDir, "stats-run.json"), "utf-8")) as { statsRun?: { method?: string; status?: string }; method?: string; status?: string };
      expect(statsRun.statsRun?.method ?? statsRun.method).toBe("cox-proportional-hazards");
      expect(statsRun.statsRun?.status ?? statsRun.status).toBe("succeeded");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("allows ungrouped Kaplan-Meier execution because the method contract only requires time and event", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "agenteer-controller-km-ungrouped-"));
    try {
      const data = await writeSurvivalCsv(path.join(dir, "survival.csv"), 90);
      const result = await researchControllerRunCommand({
        question: "Estimate overall time to death.",
        outDir: path.join(dir, "run"),
        dataPath: data,
        method: "kaplan-meier",
        time: "followup_days",
        event: "death",
        maxSteps: 6,
      });

      expect(result.state.actions.map(action => action.action)).toContain("run_analysis");
      expect(result.state.inputs.method).toBe("kaplan-meier");
      const verdict = JSON.parse(await readFile(path.join(result.state.rootDir, "controller-feasibility-verdict.json"), "utf-8")) as {
        controllerFeasibilityVerdict: { methodChecks: Array<{ id: string; status: string; message: string }> };
      };
      expect(verdict.controllerFeasibilityVerdict.methodChecks.find(check => check.id === "method-required-arguments")).toBeUndefined();
      const statsRun = JSON.parse(await readFile(path.join(result.state.inputs.runDir, "stats-run.json"), "utf-8")) as { statsRun?: { method?: string; status?: string }; method?: string; status?: string };
      expect(statsRun.statsRun?.method ?? statsRun.method).toBe("kaplan-meier");
      expect(statsRun.statsRun?.status ?? statsRun.status).toBe("succeeded");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("passes diagnostic thresholds through controller feasibility and execution", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "agenteer-controller-diagnostic-thresholds-"));
    try {
      const data = await writeDiagnosticThresholdCsv(path.join(dir, "diagnostic.csv"), 120);
      const result = await researchControllerRunCommand({
        question: "How accurately does waist circumference identify elevated HbA1c?",
        outDir: path.join(dir, "run"),
        dataPath: data,
        method: "diagnostic-accuracy",
        outcome: "hba1c_pct",
        exposure: "waist_cm",
        outcomeThreshold: 6.5,
        exposureThreshold: 100,
        maxSteps: 6,
      });

      expect(result.state.actions.map(action => action.action)).toContain("run_analysis");
      expect(result.state.inputs.outcomeThreshold).toBe(6.5);
      expect(result.state.inputs.exposureThreshold).toBe(100);
      const statsRun = JSON.parse(await readFile(path.join(result.state.inputs.runDir, "stats-run.json"), "utf-8")) as { statsRun?: { method?: string; status?: string; request?: Record<string, unknown> }; method?: string; status?: string; request?: Record<string, unknown> };
      const run = statsRun.statsRun ?? statsRun;
      expect(run.method).toBe("diagnostic-accuracy");
      expect(run.status).toBe("succeeded");
      expect(JSON.stringify(run.request ?? statsRun)).toContain("6.5");
      const report = await readFile(path.join(result.state.inputs.runDir, "stats-report.md"), "utf-8");
      expect(report).toContain("sensitivity");
      expect(report).toContain("specificity");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("passes count-rate offsets through controller feasibility and execution", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "agenteer-controller-poisson-offset-"));
    try {
      const data = await writePoissonOffsetCsv(path.join(dir, "rate.csv"), 140);
      const result = await researchControllerRunCommand({
        question: "Is treatment associated with count incidence rates after person-time offset?",
        outDir: path.join(dir, "run"),
        dataPath: data,
        method: "poisson-regression",
        outcome: "count",
        exposure: "treatment",
        offset: "person_time",
        maxSteps: 6,
      });

      expect(result.state.actions.map(action => action.action)).toContain("run_analysis");
      expect(result.state.inputs.offset).toBe("person_time");
      const statsRun = JSON.parse(await readFile(path.join(result.state.inputs.runDir, "stats-run.json"), "utf-8")) as { statsRun?: { method?: string; status?: string; diagnostics?: Record<string, unknown> }; method?: string; status?: string; diagnostics?: Record<string, unknown> };
      const run = statsRun.statsRun ?? statsRun;
      expect(run.method).toBe("poisson-regression");
      expect(run.status).toBe("succeeded");
      expect(run.diagnostics).toMatchObject({
        offset_variable: "person_time",
        offset_scale: "log",
      });
      const qa = JSON.parse(await readFile(path.join(result.state.inputs.runDir, "stats-qa.json"), "utf-8")) as { checks: Array<{ id: string; status: string }> };
      expect(qa.checks.find(check => check.id === "model-count-offset-validity")?.status).toBe("pass");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("runs recurrent-event Cox through the controller when start stop and subject roles are present", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "agenteer-controller-recurrent-cox-"));
    try {
      const data = await writeRecurrentEventCsv(path.join(dir, "intervals.csv"), 84);
      const result = await researchControllerRunCommand({
        question: "Do treatment intervals change recurrent hospitalization event hazards?",
        outDir: path.join(dir, "run"),
        dataPath: data,
        method: "recurrent-event-cox",
        start: "start",
        stop: "stop",
        event: "event",
        id: "subject",
        exposure: "arm",
        covariates: ["severity"],
        maxSteps: 6,
      });

      expect(result.state.actions.map(action => action.action)).toContain("run_analysis");
      expect(result.state.inputs.start).toBe("start");
      expect(result.state.inputs.stop).toBe("stop");
      expect(result.state.inputs.method).toBe("recurrent-event-cox");
      const verdict = JSON.parse(await readFile(path.join(result.state.rootDir, "controller-feasibility-verdict.json"), "utf-8")) as {
        controllerFeasibilityVerdict: { methodChecks: Array<{ id: string; status: string; message: string }> };
      };
      expect(verdict.controllerFeasibilityVerdict.methodChecks.find(check => check.id === "method-required-arguments")).toBeUndefined();
      const statsRun = JSON.parse(await readFile(path.join(result.state.inputs.runDir, "stats-run.json"), "utf-8")) as { statsRun?: { method?: string; status?: string; diagnostics?: Record<string, unknown> }; method?: string; status?: string; diagnostics?: Record<string, unknown> };
      const run = statsRun.statsRun ?? statsRun;
      expect(run.method).toBe("recurrent-event-cox");
      expect(run.status).toBe("succeeded");
      expect(await readFile(path.join(result.state.inputs.runDir, "recurrent-event-cox-intervals.csv"), "utf-8")).toContain("start_time");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("blocks recurrent-event Cox before execution when start stop interval roles are incomplete", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "agenteer-controller-recurrent-cox-missing-"));
    try {
      const data = await writeRecurrentEventCsv(path.join(dir, "intervals.csv"), 60);
      const result = await researchControllerRunCommand({
        question: "Do treatment intervals change recurrent hospitalization event hazards?",
        outDir: path.join(dir, "run"),
        dataPath: data,
        method: "recurrent-event-cox",
        stop: "stop",
        event: "event",
        id: "subject",
        exposure: "arm",
        covariates: ["severity"],
        maxSteps: 6,
      });

      expect(result.state.status).toBe("blocked");
      expect(result.state.actions.map(action => action.action)).not.toContain("run_analysis");
      const verdict = JSON.parse(await readFile(path.join(result.state.rootDir, "controller-feasibility-verdict.json"), "utf-8")) as {
        controllerFeasibilityVerdict: {
          methodChecks: Array<{ id: string; status: string; message: string }>;
          blockers: string[];
        };
      };
      const requiredArgsCheck = verdict.controllerFeasibilityVerdict.methodChecks.find(check => check.id === "method-required-arguments");
      expect(requiredArgsCheck).toMatchObject({ status: "block" });
      expect(requiredArgsCheck?.message).toContain("start");
      expect(verdict.controllerFeasibilityVerdict.blockers.join(" ")).toContain("start");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("stops group-comparison survival questions when no grouping variable is available", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "agenteer-controller-survival-missing-group-"));
    try {
      const data = await writeUngroupedSurvivalCsv(path.join(dir, "survival.csv"), 90);
      const result = await researchControllerRunCommand({
        question: "Compare survival between hospital groups.",
        outDir: path.join(dir, "run"),
        dataPath: data,
        time: "followup_days",
        event: "death",
        maxSteps: 6,
      });

      expect(result.state.currentStage).toMatch(/blocked|human_review/);
      expect(result.state.status).toMatch(/blocked|needs_human_review/);
      expect(result.state.actions.map(action => action.action)).not.toContain("run_analysis");
      const modelingPlan = JSON.parse(await readFile(path.join(result.state.rootDir, "controller-modeling-plan.json"), "utf-8")) as {
        modelingPlan: { blocked: boolean; statisticalMethodGuidance: { blockers: Array<{ code: string }> } };
      };
      expect(modelingPlan.modelingPlan.blocked).toBe(true);
      expect(modelingPlan.modelingPlan.statisticalMethodGuidance.blockers.map(issue => issue.code)).toContain("METHOD_GUIDANCE_GROUPING_MISSING");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("runs the bounded golden path through execution, QA, manuscript, and inspection", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "agenteer-controller-run-"));
    try {
      const data = await writeLinearCsv(path.join(dir, "rows.csv"), 80);
      const result = await researchControllerRunCommand({
        question: "Is x associated with y?",
        outDir: path.join(dir, "run"),
        dataPath: data,
        method: "linear-regression",
        outcome: "y",
        exposure: "x",
        maxSteps: 12,
      });
      const actions = result.state.actions.map(action => action.action);
      const artifacts = result.state.artifacts.map(artifact => artifact.kind);
      const artifactByKind = (kind: string) => result.state.artifacts.filter(artifact => artifact.kind === kind).at(-1);

      expect(actions).toEqual(expect.arrayContaining(["run_analysis", "method_qa", "write_manuscript", "inspect_run", "decide_promotion"]));
      expect(artifacts).toEqual(expect.arrayContaining(["controller-feasibility-verdict", "controller-modeling-plan", "stats-summary", "stats-report", "stats-qa", "method-qa", "manuscript", "manuscript-qa", "run-inspection", "controller-action-contract", "controller-action-readiness", "controller-completion-audit", "controller-golden-packet", "controller-step-checkpoint", "controller-state-snapshot", "controller-issue-ledger", "controller-work-plan", "controller-decision-context", "controller-run-invocation"]));
      expect(artifactByKind("stats-summary")).toMatchObject({
        path: path.join(result.state.inputs.runDir, "stats-summary.json"),
        requiredForPromotion: true,
      });
      expect(artifactByKind("stats-report")).toMatchObject({
        path: path.join(result.state.inputs.runDir, "stats-report.md"),
        requiredForPromotion: true,
      });
      expect(artifactByKind("stats-qa")).toMatchObject({
        path: path.join(result.state.inputs.runDir, "stats-qa.json"),
        requiredForPromotion: true,
      });
      expect(await fileExists(path.join(result.state.inputs.runDir, "stats-run.json"))).toBe(true);
      expect(result.state.status).toMatch(/complete|needs_human_review/);
      expect(result.state.issueLedgers.length).toBeGreaterThanOrEqual(actions.length + 1);
      expect(result.state.stageReviews.length).toBeGreaterThanOrEqual(actions.length);
      expect(result.state.agendas.length).toBeGreaterThanOrEqual(actions.length + 1);
      expect(artifacts).toEqual(expect.arrayContaining(["controller-stage-review", "controller-stage-review-report", "controller-execution-agenda", "controller-execution-agenda-report"]));
      expect(artifacts).not.toContain("stats-qa-report");
      const stageReviewPath = result.state.stageReviews.find(review => review.reviewedStage === "execution")?.outPath;
      expect(stageReviewPath).toBeTruthy();
      const stageReview = JSON.parse(await readFile(stageReviewPath as string, "utf-8")) as { controllerStageReview: { status: string; reviewedStage: string; acceptedEvidenceRefs: string[]; findings: Array<{ severity: string; category: string; message: string }> } };
      expect(stageReview.controllerStageReview.reviewedStage).toBe("execution");
      expect(stageReview.controllerStageReview.status).not.toBe("block");
      expect(stageReview.controllerStageReview.acceptedEvidenceRefs.join("\n")).toMatch(/stats-(summary|qa|report)|controller-action-contract/);
      const readinessArtifacts = result.state.artifacts.filter(artifact => artifact.kind === "controller-action-readiness");
      expect(readinessArtifacts.length).toBeGreaterThanOrEqual(actions.length);
      const runReadinessPath = readinessArtifacts.find(artifact => artifact.path.includes("run_analysis"))?.path;
      expect(runReadinessPath).toBeTruthy();
      const runReadiness = JSON.parse(await readFile(runReadinessPath as string, "utf-8")) as { controllerActionReadiness: { status: string; checks: Array<{ id: string; status: string }> } };
      expect(runReadiness.controllerActionReadiness.status).toMatch(/pass|warning/);
      expect(runReadiness.controllerActionReadiness.checks).toEqual(expect.arrayContaining([
        expect.objectContaining({ id: "feasibility-before-execution", status: "pass" }),
        expect.objectContaining({ id: "semantic-audit-before-execution", status: "pass" }),
        expect.objectContaining({ id: "method-present", status: "pass" }),
      ]));
      const decisionContexts = result.state.artifacts.filter(artifact => artifact.kind === "controller-decision-context");
      expect(decisionContexts.length).toBeGreaterThanOrEqual(result.state.decisions.length);
      const firstDecisionContext = JSON.parse(await readFile(decisionContexts[0]?.path ?? "", "utf-8")) as { controllerDecisionContext: { stage: string; workPlan: { present: boolean; pending: Array<{ stage: string }> }; executionAgenda: { present: boolean; primaryCommand: string | null; items: Array<{ kind: string }> }; allowedActions: string[]; instructions: string[] } };
      expect(firstDecisionContext.controllerDecisionContext.stage).toBe("intake");
      expect(firstDecisionContext.controllerDecisionContext.workPlan.present).toBe(true);
      expect(firstDecisionContext.controllerDecisionContext.executionAgenda.present).toBe(true);
      expect(firstDecisionContext.controllerDecisionContext.executionAgenda.primaryCommand).toMatch(/controller-run --state/);
      expect(firstDecisionContext.controllerDecisionContext.executionAgenda.items.map(item => item.kind)).toContain("run");
      expect(firstDecisionContext.controllerDecisionContext.workPlan.pending.map(item => item.stage)).toContain("intake");
      expect(firstDecisionContext.controllerDecisionContext.allowedActions).toContain("initialize");
      expect(firstDecisionContext.controllerDecisionContext.instructions.join(" ")).toMatch(/feasibility/);
      expect(firstDecisionContext.controllerDecisionContext.instructions.join(" ")).toMatch(/issueLedger/);
      expect(firstDecisionContext.controllerDecisionContext.instructions.join(" ")).toMatch(/issueCode/);
      expect(firstDecisionContext.controllerDecisionContext.instructions.join(" ")).toContain("keyArtifactReports");
      expect(firstDecisionContext.controllerDecisionContext.instructions.join(" ")).toContain("JSON-only null report slots");
      expect(result.state.workPlans.length).toBeGreaterThanOrEqual(actions.length + 1);
      const latestWorkPlan = JSON.parse(await readFile(result.state.workPlans.at(-1)?.outPath ?? "", "utf-8")) as { controllerWorkPlan: { status: string; currentStage: string; items: Array<{ stage: string; status: string; evidenceRefs: string[] }>; risks: string[] } };
      expect(latestWorkPlan.controllerWorkPlan.status).toMatch(/complete|needs_human_review/);
      expect(latestWorkPlan.controllerWorkPlan.items).toEqual(expect.arrayContaining([
        expect.objectContaining({ stage: "dataset_feasibility", status: "completed" }),
        expect.objectContaining({ stage: "execution", status: "completed" }),
        expect.objectContaining({ stage: "inspection", status: "completed" }),
      ]));
      expect(latestWorkPlan.controllerWorkPlan.items.find(item => item.stage === "execution")?.evidenceRefs.join("\n")).toMatch(/stats-run|stats-report|stats-qa/);
      const snapshotArtifacts = result.state.artifacts.filter(artifact => artifact.kind === "controller-state-snapshot");
      expect(snapshotArtifacts.length).toBeGreaterThanOrEqual(actions.length);
      const firstSnapshot = JSON.parse(await readFile(snapshotArtifacts[0]?.path ?? "", "utf-8")) as { controllerStateSnapshot: { reason: string; stage: string; status: string; stateHash: string; counts: { actions: number }; controllerState: { currentStage: string } } };
      expect(firstSnapshot.controllerStateSnapshot.reason).toBe("before_step_intake");
      expect(firstSnapshot.controllerStateSnapshot.stage).toBe("intake");
      expect(firstSnapshot.controllerStateSnapshot.status).toBe("running");
      expect(firstSnapshot.controllerStateSnapshot.stateHash).toBeTruthy();
      expect(firstSnapshot.controllerStateSnapshot.counts.actions).toBe(0);
      expect(firstSnapshot.controllerStateSnapshot.controllerState.currentStage).toBe("intake");
      const checkpointArtifacts = result.state.artifacts.filter(artifact => artifact.kind === "controller-step-checkpoint");
      expect(checkpointArtifacts.length).toBeGreaterThanOrEqual(actions.length);
      const firstCheckpoint = JSON.parse(await readFile(checkpointArtifacts[0]?.path ?? "", "utf-8")) as { controllerStepCheckpoint: { reason: string; before: { stage: string }; after: { stage: string }; lastGate: { stage: string } } };
      expect(firstCheckpoint.controllerStepCheckpoint.before.stage).toBe("intake");
      expect(firstCheckpoint.controllerStepCheckpoint.after.stage).toBe("dataset_feasibility");
      expect(firstCheckpoint.controllerStepCheckpoint.lastGate.stage).toBe("intake");
      const contractArtifacts = result.state.artifacts.filter(artifact => artifact.kind === "controller-action-contract");
      expect(contractArtifacts.length).toBeGreaterThanOrEqual(actions.length);
      const runAnalysisContractPath = contractArtifacts.find(artifact => artifact.path.includes("run_analysis"))?.path;
      expect(runAnalysisContractPath).toBeTruthy();
      const runAnalysisContract = JSON.parse(await readFile(runAnalysisContractPath as string, "utf-8")) as { controllerActionContract: { status: string; expectedArtifacts: string[]; missingExpectedArtifacts: string[] } };
      expect(runAnalysisContract.controllerActionContract.status).toBe("pass");
      expect(runAnalysisContract.controllerActionContract.expectedArtifacts).toEqual(expect.arrayContaining(["stats-run.json", "stats-report.md", "stats-qa.json"]));
      expect(runAnalysisContract.controllerActionContract.missingExpectedArtifacts).toEqual([]);
      const modelingPlan = JSON.parse(await readFile(path.join(result.state.rootDir, "controller-modeling-plan.json"), "utf-8")) as { modelingPlan: { dataEvidence: { source: string; rowCount: number }; routeRecommendation: { route: string } } };
      expect(modelingPlan.modelingPlan.dataEvidence.source).toBe("table-summary");
      expect(modelingPlan.modelingPlan.dataEvidence.rowCount).toBe(80);
      expect(await fileExists(path.join(result.state.inputs.runDir, "manuscript.md"))).toBe(true);
      expect(await fileExists(path.join(result.state.inputs.runDir, "run-inspection.json"))).toBe(true);
      expect(await fileExists(path.join(result.state.rootDir, "controller-terminal-handoff.json"))).toBe(true);
      expect(await fileExists(path.join(result.state.rootDir, "controller-next-action.json"))).toBe(true);
      expect(await fileExists(result.state.artifacts.find(artifact => artifact.kind === "controller-model-runner-packet")?.path ?? "")).toBe(true);
      expect(await fileExists(result.state.artifacts.find(artifact => artifact.kind === "controller-model-runner-packet-report")?.path ?? "")).toBe(true);
      expect(await fileExists(path.join(result.state.rootDir, "controller-self-evaluation.json"))).toBe(true);
      expect(await fileExists(path.join(result.state.rootDir, "controller-completion-audit.json"))).toBe(true);
      expect(await fileExists(path.join(result.state.rootDir, "controller-golden-packet.json"))).toBe(true);
      expect(await fileExists(path.join(result.state.rootDir, "controller-golden-packet.md"))).toBe(true);
      const modelRunnerPacket = JSON.parse(await readFile(result.state.artifacts.filter(artifact => artifact.kind === "controller-model-runner-packet").at(-1)?.path ?? "", "utf-8")) as { controllerModelRunnerPacket: { defaultControllerModel: string; systemPrompt: string; userPrompt: string; evidenceRefs: string[]; feasibilityReadiness: { present: boolean; status: string | null; verdict: string | null; path: string | null } } };
      expect(modelRunnerPacket.controllerModelRunnerPacket.defaultControllerModel).toBe("openai:gpt-5.4");
      expect(modelRunnerPacket.controllerModelRunnerPacket.systemPrompt).toContain("Research Controller Agent");
      expect(modelRunnerPacket.controllerModelRunnerPacket.userPrompt).toContain(result.state.statePath);
      expect(modelRunnerPacket.controllerModelRunnerPacket.userPrompt).toContain("Feasibility readiness: pass; verdict=formal_analysis_ready");
      expect(modelRunnerPacket.controllerModelRunnerPacket.feasibilityReadiness.present).toBe(true);
      expect(modelRunnerPacket.controllerModelRunnerPacket.feasibilityReadiness.status).toBe("pass");
      expect(modelRunnerPacket.controllerModelRunnerPacket.feasibilityReadiness.verdict).toBe("formal_analysis_ready");
      expect(modelRunnerPacket.controllerModelRunnerPacket.evidenceRefs).toEqual(expect.arrayContaining([result.state.statePath]));
      const completionAudit = JSON.parse(await readFile(path.join(result.state.rootDir, "controller-completion-audit.json"), "utf-8")) as { controllerCompletionAudit: { status: string; requirements: Array<{ id: string; status: string }> } };
      expect(completionAudit.controllerCompletionAudit.status).not.toBe("fail");
      expect(completionAudit.controllerCompletionAudit.requirements).toEqual(expect.arrayContaining([
        expect.objectContaining({ id: "stage-coverage", status: "proved" }),
        expect.objectContaining({ id: "dataset-semantic-audit", status: "proved" }),
        expect.objectContaining({ id: "artifact-integrity", status: "proved" }),
        expect.objectContaining({ id: "action-contracts", status: "proved" }),
        expect.objectContaining({ id: "step-checkpoints", status: "proved" }),
        expect.objectContaining({ id: "stage-reviews", status: "proved" }),
        expect.objectContaining({ id: "execution-agenda", status: "proved" }),
      ]));
      expect(result.state.selfEvaluations.length).toBeGreaterThanOrEqual(1);
      expect(result.state.selfEvaluations.at(-1)?.checks.map(check => check.id)).toEqual(expect.arrayContaining(["required-stage-coverage", "feasibility-verdict-artifact", "dataset-semantic-audit", "analysis-executed", "modeling-plan-artifact", "required-artifacts", "action-contracts", "stage-review-coverage", "execution-agenda-coverage"]));
      expect(result.state.selfEvaluations.at(-1)?.checks.find(check => check.id === "dataset-semantic-audit")?.status).toBe("pass");
      const goldenPacket = JSON.parse(await readFile(path.join(result.state.rootDir, "controller-golden-packet.json"), "utf-8")) as { controllerGoldenPacket: { readiness: { runInspection: string | null; feasibilityReadiness: string | null; feasibilityVerdict: string | null; completionAudit: string; selfEvaluation: string; promotable: boolean }; stageSummary: Array<{ stage: string; completed: boolean }>; keyArtifacts: Record<string, string | null>; keyArtifactReports: Record<string, string | null>; blockers: string[]; warnings: string[] } };
      expect(goldenPacket.controllerGoldenPacket.readiness.runInspection).toMatch(/local_review_ready|needs_methods_review|blocked/);
      expect(goldenPacket.controllerGoldenPacket.readiness.feasibilityReadiness).toBe("pass");
      expect(goldenPacket.controllerGoldenPacket.readiness.feasibilityVerdict).toBe("formal_analysis_ready");
      expect(renderResearchControllerGoldenPacket(goldenPacket.controllerGoldenPacket)).toContain("feasibility readiness: pass; verdict: formal_analysis_ready");
      expect(renderResearchControllerGoldenPacket(goldenPacket.controllerGoldenPacket)).toContain("key reports:");
      expect(renderResearchControllerGoldenPacket(goldenPacket.controllerGoldenPacket)).toContain("- report statsRun:");
      expect(renderResearchControllerGoldenPacket(goldenPacket.controllerGoldenPacket)).toContain("stats-report.md");
      expect(renderResearchControllerGoldenPacket(goldenPacket.controllerGoldenPacket)).toContain("- report statsQa: not report-backed");
      expect(goldenPacket.controllerGoldenPacket.keyArtifactReports).toMatchObject({
        methodSelection: null,
        modelingPlan: null,
        statsRun: expect.stringContaining("stats-report.md"),
        statsQa: null,
        manuscriptQa: null,
        reviewAdjudication: null,
      });
      const completedStatus = await researchControllerStatusCommand({
        statePath: result.state.statePath,
        reason: "verify_completed_status_report_slots",
      });
      expect(completedStatus.keyArtifactReports).toMatchObject({
        statsRun: expect.stringContaining("stats-report.md"),
        statsQa: null,
      });
      const completedStatusReport = await readFile(completedStatus.reportPath, "utf-8");
      const completedStatusConsole = renderResearchControllerStatus(completedStatus);
      expect(completedStatusConsole).toContain("stats-report.md");
      expect(completedStatusConsole).toContain("- report statsQa: not report-backed");
      expect(completedStatusConsole).toContain("- report issueLedger:");
      expect(completedStatusReport).toContain("stats-report.md");
      expect(completedStatusReport).toContain("- statsQa: not report-backed");
      expect(goldenPacket.controllerGoldenPacket.readiness.completionAudit).not.toBe("fail");
      expect(goldenPacket.controllerGoldenPacket.readiness.selfEvaluation).not.toBe("fail");
      expect(goldenPacket.controllerGoldenPacket.stageSummary).toEqual(expect.arrayContaining([
        expect.objectContaining({ stage: "execution", completed: true }),
        expect.objectContaining({ stage: "inspection", completed: true }),
        expect.objectContaining({ stage: "promotion_decision", completed: true }),
      ]));
      expect(goldenPacket.controllerGoldenPacket.keyArtifacts).toMatchObject({
        statsQa: expect.stringContaining("stats-qa.json"),
        manuscript: expect.stringContaining("manuscript.md"),
        runInspection: expect.stringContaining("run-inspection.json"),
        completionAudit: expect.stringContaining("controller-completion-audit.json"),
        selfEvaluation: expect.stringContaining("controller-self-evaluation.json"),
        issueLedger: expect.stringContaining("controller_issue_ledger_"),
        stageReview: expect.stringContaining("controller_stage_review_"),
        actionReadiness: expect.stringContaining("controller_action_readiness_"),
        actionContract: expect.stringContaining("controller-action-contract-"),
      });
      const verdict = JSON.parse(await readFile(path.join(result.state.rootDir, "controller-feasibility-verdict.json"), "utf-8")) as { controllerFeasibilityVerdict: { status: string; methodChecks: Array<{ id: string; status: string }> } };
      expect(verdict.controllerFeasibilityVerdict.status).toBe("pass");
      expect(verdict.controllerFeasibilityVerdict.methodChecks).toEqual(expect.arrayContaining([expect.objectContaining({ id: "continuous-outcome-variation", status: "pass" })]));
      const goldenPacketReport = await readFile(path.join(result.state.rootDir, "controller-golden-packet.md"), "utf-8");
      expect(goldenPacketReport).toContain("Feasibility readiness: pass; verdict: formal_analysis_ready");
      expect(goldenPacketReport).toContain("- methodSelection: not report-backed");
      expect(goldenPacketReport).toContain("- modelingPlan: not report-backed");
      expect(goldenPacketReport).toContain("- statsQa: not report-backed");
      const invocationPath = result.state.artifacts.find(artifact => artifact.kind === "controller-run-invocation")?.path;
      expect(invocationPath).toBeTruthy();
      const invocation = JSON.parse(await readFile(invocationPath as string, "utf-8")) as { controllerRunInvocation: { stepCount: number; actionDelta: Array<{ action: string; status: string }>; terminal: boolean; nextRecommendedAction: string } };
      expect(invocation.controllerRunInvocation.stepCount).toBeGreaterThan(0);
      expect(invocation.controllerRunInvocation.actionDelta.map(action => action.action)).toEqual(expect.arrayContaining(["run_analysis", "write_manuscript"]));
      expect(invocation.controllerRunInvocation.nextRecommendedAction).toBeTruthy();
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("blocks semantically invalid study ideas before execution with a durable feasibility verdict", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "agenteer-controller-invalid-feasibility-"));
    try {
      const data = path.join(dir, "rows.csv");
      const lines = ["death_flag,x,age"];
      for (let i = 0; i < 70; i += 1) lines.push(`${i % 3},${i},${40 + (i % 20)}`);
      await writeFile(data, `${lines.join("\n")}\n`);

      const result = await researchControllerRunCommand({
        question: "Is x associated with mortality?",
        outDir: path.join(dir, "run"),
        dataPath: data,
        method: "logistic-regression",
        outcome: "death_flag",
        exposure: "x",
        maxSteps: 8,
      });

      expect(result.state.status).toBe("blocked");
      expect(result.state.currentStage).toBe("blocked");
      expect(result.state.actions.map(action => action.action)).not.toContain("run_analysis");
      expect(result.state.artifacts.map(artifact => artifact.kind)).toEqual(expect.arrayContaining(["table-summary", "controller-feasibility-verdict"]));
      const semanticAuditPath = result.state.artifacts.find(artifact => artifact.kind === "controller-dataset-semantic-audit")?.path ?? "";
      expect(semanticAuditPath).toBeTruthy();
      const semanticAudit = JSON.parse(await readFile(semanticAuditPath, "utf-8")) as {
        controllerDatasetSemanticAudit: {
          status: string;
          selectedRoleStatus: string;
          issues: Array<{ column: string; selected: boolean; code: string }>;
        };
      };
      expect(semanticAudit.controllerDatasetSemanticAudit.status).toBe("block");
      expect(semanticAudit.controllerDatasetSemanticAudit.selectedRoleStatus).toBe("block");
      expect(semanticAudit.controllerDatasetSemanticAudit.issues).toEqual(expect.arrayContaining([
        expect.objectContaining({ column: "death_flag", selected: true, code: "INVALID_BINARY_EVENT_RANGE" }),
      ]));
      const goldenPacket = JSON.parse(await readFile(path.join(result.state.rootDir, "controller-golden-packet.json"), "utf-8")) as {
        controllerGoldenPacket: {
          datasetSemanticAudit: { status: string; selectedRoleStatus: string; topIssues: Array<{ column: string; selected: boolean; code: string }> };
          keyArtifacts: Record<string, string | null>;
          keyArtifactReports: Record<string, string | null>;
        };
      };
      expect(goldenPacket.controllerGoldenPacket.datasetSemanticAudit.status).toBe("block");
      expect(goldenPacket.controllerGoldenPacket.datasetSemanticAudit.selectedRoleStatus).toBe("block");
      expect(goldenPacket.controllerGoldenPacket.datasetSemanticAudit.topIssues).toEqual(expect.arrayContaining([
        expect.objectContaining({ column: "death_flag", selected: true, code: "INVALID_BINARY_EVENT_RANGE" }),
      ]));
      expect(goldenPacket.controllerGoldenPacket.keyArtifacts.datasetSemanticAudit).toContain("controller_dataset_semantic_audit_");
      expect(goldenPacket.controllerGoldenPacket.keyArtifacts.datasetSemanticAuditReport).toBeUndefined();
      expect(Object.keys(goldenPacket.controllerGoldenPacket.keyArtifacts).filter(key => key.endsWith("Report"))).toEqual([]);
      expect(goldenPacket.controllerGoldenPacket.keyArtifactReports.datasetSemanticAudit).toContain("controller_dataset_semantic_audit_");
      const verdict = JSON.parse(await readFile(path.join(result.state.rootDir, "controller-feasibility-verdict.json"), "utf-8")) as { controllerFeasibilityVerdict: { status: string; blockers: string[]; variableChecks: Array<{ name: string; issues: Array<{ code: string }> }> } };
      expect(verdict.controllerFeasibilityVerdict.status).toBe("block");
      expect(verdict.controllerFeasibilityVerdict.blockers.join(" ")).toMatch(/not bounded to 0\/1/);
      expect(verdict.controllerFeasibilityVerdict.variableChecks.find(check => check.name === "death_flag")?.issues.map(issue => issue.code)).toContain("INVALID_BINARY_EVENT_RANGE");
      const issueLedger = JSON.parse(await readFile(result.state.issueLedgers.at(-1)?.outPath ?? "", "utf-8")) as {
        controllerIssueLedger: { status: string; issues: Array<{ source: string; message: string; severity: string; reentryStage: string }> };
      };
      expect(issueLedger.controllerIssueLedger.status).toBe("blocked");
      expect(issueLedger.controllerIssueLedger.issues).toEqual(expect.arrayContaining([
        expect.objectContaining({
          source: "dataset-semantic-audit:INVALID_BINARY_EVENT_RANGE",
          severity: "blocker",
          reentryStage: "dataset_feasibility",
          message: expect.stringContaining("INVALID_BINARY_EVENT_RANGE"),
        }),
      ]));
      const terminalHandoff = JSON.parse(await readFile(path.join(result.state.rootDir, "controller-terminal-handoff.json"), "utf-8")) as {
        controllerTerminalHandoff: {
          failureAttribution: Array<{ category: string; severity: string; message: string; evidenceRefs: string[] }>;
        };
      };
      expect(terminalHandoff.controllerTerminalHandoff.failureAttribution).toEqual(expect.arrayContaining([
        expect.objectContaining({
          category: "data",
          severity: "blocker",
          message: expect.stringContaining("INVALID_BINARY_EVENT_RANGE"),
        }),
      ]));
      expect(terminalHandoff.controllerTerminalHandoff.failureAttribution.find(item => item.message.includes("INVALID_BINARY_EVENT_RANGE"))?.evidenceRefs.join(" ")).toContain("controller_dataset_semantic_audit_");
      const nextAction = JSON.parse(await readFile(path.join(result.state.rootDir, "controller-next-action.json"), "utf-8")) as {
        controllerNextAction: {
          issueLedger: { topIssues: Array<{ message: string; evidenceRefs: string[] }> };
          mustReviewArtifacts: Array<{ kind: string; path: string }>;
        };
      };
      expect(nextAction.controllerNextAction.issueLedger.topIssues).toEqual(expect.arrayContaining([
        expect.objectContaining({
          message: expect.stringContaining("INVALID_BINARY_EVENT_RANGE"),
        }),
      ]));
      expect(nextAction.controllerNextAction.mustReviewArtifacts.map(item => item.kind)).toEqual(expect.arrayContaining([
        "controller-dataset-semantic-audit",
        "controller-dataset-semantic-audit-report",
        "controller-stage-review",
        "controller-stage-review-report",
        "controller-issue-ledger",
        "controller-issue-ledger-report",
      ]));
      const reentryPlan = JSON.parse(await readFile(path.join(result.state.rootDir, "controller-reentry-plan.json"), "utf-8")) as {
        controllerReentryPlan: {
          status: string;
          recommendedStage: string;
          reason: string;
          triggeringEvidence: string[];
        };
      };
      expect(reentryPlan.controllerReentryPlan.status).toBe("patch_then_resume");
      expect(reentryPlan.controllerReentryPlan.recommendedStage).toBe("dataset_feasibility");
      expect(reentryPlan.controllerReentryPlan.reason).toContain("INVALID_BINARY_EVENT_RANGE");
      expect(reentryPlan.controllerReentryPlan.triggeringEvidence.join(" ")).toContain("controller_dataset_semantic_audit_");
      const stageReview = JSON.parse(await readFile(result.state.stageReviews.at(-1)?.outPath ?? "", "utf-8")) as {
        controllerStageReview: { status: string; findings: Array<{ message: string; severity: string; reentryStage: string }> };
      };
      expect(stageReview.controllerStageReview.status).toBe("block");
      expect(stageReview.controllerStageReview.findings).toEqual(expect.arrayContaining([
        expect.objectContaining({
          severity: "blocker",
          reentryStage: "dataset_feasibility",
          message: expect.stringContaining("INVALID_BINARY_EVENT_RANGE"),
        }),
      ]));
      const completionAudit = await researchControllerCompletionAuditCommand({
        statePath: result.state.statePath,
        reason: "Verify semantic audit blockers prevent false completion.",
      });
      const completionAuditConsole = renderResearchControllerCompletionAudit(completionAudit);
      expect(completionAuditConsole).toContain("failed requirements:");
      expect(completionAuditConsole).toContain("dataset-semantic-audit");
      expect(completionAuditConsole).toContain("INVALID_BINARY_EVENT_RANGE");
      expect(completionAudit.status).toBe("fail");
      expect(completionAudit.requirements).toEqual(expect.arrayContaining([
        expect.objectContaining({ id: "dataset-semantic-audit", status: "failed", finding: expect.stringContaining("INVALID_BINARY_EVENT_RANGE") }),
      ]));
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("surfaces dataset-wide semantic plausibility issues without blocking valid selected roles", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "agenteer-controller-dataset-semantic-audit-"));
    try {
      const data = path.join(dir, "rows.csv");
      const lines = ["y,x,bmi,post_discharge_los,in_hospital_procedure"];
      for (let i = 0; i < 80; i += 1) lines.push(`${10 + i * 1.5},${i},${70 + (i % 20)},${1 + (i % 12)},${i % 4 === 0 ? 1 : 0}`);
      await writeFile(data, `${lines.join("\n")}\n`);

      const result = await researchControllerRunCommand({
        question: "Is x associated with y?",
        outDir: path.join(dir, "run"),
        dataPath: data,
        method: "linear-regression",
        outcome: "y",
        exposure: "x",
        maxSteps: 8,
      });

      expect(result.state.actions.map(action => action.action)).toContain("run_analysis");
      const semanticAuditPath = result.state.artifacts.find(artifact => artifact.kind === "controller-dataset-semantic-audit")?.path ?? "";
      expect(semanticAuditPath).toBeTruthy();
      const semanticAudit = JSON.parse(await readFile(semanticAuditPath, "utf-8")) as {
        controllerDatasetSemanticAudit: {
          status: string;
          selectedRoleStatus: string;
          issueCount: number;
          issueCodeSummary: Array<{ code: string; severity: string; totalIssueCount: number; selectedIssueCount: number; columns: string[] }>;
          selectedRoleSummary: Array<{ column: string; role: string; issueCount: number; blockerCount: number; warningCount: number; codes: string[] }>;
          issues: Array<{ column: string; selected: boolean; code: string; severity: string }>;
        };
      };
      expect(semanticAudit.controllerDatasetSemanticAudit.status).toBe("warning");
      expect(semanticAudit.controllerDatasetSemanticAudit.selectedRoleStatus).toBe("pass");
      expect(semanticAudit.controllerDatasetSemanticAudit.issueCount).toBeGreaterThan(0);
      expect(semanticAudit.controllerDatasetSemanticAudit.issues).toEqual(expect.arrayContaining([
        expect.objectContaining({ column: "bmi", selected: false, code: "IMPLAUSIBLE_BMI_MEAN", severity: "warning" }),
        expect.objectContaining({ column: "post_discharge_los", selected: false, code: "OUTCOME_FUTURE_LEAKAGE_UNSELECTED_COLUMN", severity: "warning" }),
        expect.objectContaining({ column: "in_hospital_procedure", selected: false, code: "POST_TREATMENT_ADJUSTMENT_UNSELECTED_COLUMN", severity: "warning" }),
      ]));
      expect(semanticAudit.controllerDatasetSemanticAudit.issueCodeSummary).toEqual(expect.arrayContaining([
        expect.objectContaining({ code: "IMPLAUSIBLE_BMI_MEAN", severity: "warning", totalIssueCount: 1, selectedIssueCount: 0, columns: ["bmi"] }),
        expect.objectContaining({ code: "OUTCOME_FUTURE_LEAKAGE_UNSELECTED_COLUMN", severity: "warning", totalIssueCount: 1, selectedIssueCount: 0, columns: ["post_discharge_los"] }),
        expect.objectContaining({ code: "POST_TREATMENT_ADJUSTMENT_UNSELECTED_COLUMN", severity: "warning", totalIssueCount: 1, selectedIssueCount: 0, columns: ["in_hospital_procedure"] }),
      ]));
      expect(semanticAudit.controllerDatasetSemanticAudit.selectedRoleSummary).toEqual([]);
      const semanticAuditReport = await readFile(semanticAuditPath.replace(/\.json$/, ".md"), "utf-8");
      expect(semanticAuditReport).toContain("## Issue Summary");
      expect(semanticAuditReport).toContain("IMPLAUSIBLE_BMI_MEAN: 1 total, 0 selected");
      expect(semanticAuditReport).toContain("## Selected Role Summary");
      const contractArtifacts = result.state.artifacts.filter(artifact => artifact.kind === "controller-action-contract");
      const tableSummaryContractPath = contractArtifacts.find(artifact => artifact.path.includes("table_summary"))?.path ?? "";
      expect(tableSummaryContractPath).toBeTruthy();
      const tableSummaryContract = JSON.parse(await readFile(tableSummaryContractPath, "utf-8")) as {
        controllerActionContract: {
          status: string;
          missingExpectedArtifacts: string[];
        };
      };
      expect(tableSummaryContract.controllerActionContract.status).toBe("pass");
      expect(tableSummaryContract.controllerActionContract.missingExpectedArtifacts).not.toContain("controller-dataset-semantic-audit");

      const inspected = await researchControllerInspectCommand({ statePath: result.state.statePath });
      const inspection = JSON.parse(await readFile(path.join(inspected.state.rootDir, "controller-internal-inspection.json"), "utf-8")) as {
        controllerInspection: { checks: Array<{ id: string; status: string; message: string }> };
      };
      expect(inspection.controllerInspection.checks).toEqual(expect.arrayContaining([
        expect.objectContaining({ id: "dataset-semantic-audit-present", status: "pass" }),
        expect.objectContaining({ id: "dataset-semantic-audit-status", status: "pass", message: expect.stringContaining("unused or nonblocking columns") }),
      ]));

      const operatorAudit = await researchControllerAuditCommand({
        statePath: inspected.state.statePath,
        reason: "Verify dataset semantic audit is visible without blocking valid selected roles.",
      });
      expect(operatorAudit.datasetSemanticAudit.status).toBe("warning");
      expect(operatorAudit.datasetSemanticAudit.selectedRoleStatus).toBe("pass");
      expect(operatorAudit.datasetSemanticAudit.topIssues).toEqual(expect.arrayContaining([
        expect.objectContaining({ column: "bmi", selected: false, code: "IMPLAUSIBLE_BMI_MEAN" }),
        expect.objectContaining({ column: "post_discharge_los", selected: false, code: "OUTCOME_FUTURE_LEAKAGE_UNSELECTED_COLUMN" }),
        expect.objectContaining({ column: "in_hospital_procedure", selected: false, code: "POST_TREATMENT_ADJUSTMENT_UNSELECTED_COLUMN" }),
      ]));
      expect(operatorAudit.checks).toEqual(expect.arrayContaining([
        expect.objectContaining({ id: "dataset-semantic-audit", status: "pass" }),
      ]));
      const issueLedger = JSON.parse(await readFile(inspected.state.issueLedgers.at(-1)?.outPath ?? "", "utf-8")) as {
        controllerIssueLedger: { status: string; issues: Array<{ source: string; message: string }> };
      };
      expect(issueLedger.controllerIssueLedger.status).not.toBe("blocked");
      expect(issueLedger.controllerIssueLedger.issues.some(issue => issue.source.startsWith("dataset-semantic-audit:"))).toBe(false);
      expect(issueLedger.controllerIssueLedger.issues.map(issue => issue.message).join(" ")).not.toContain("IMPLAUSIBLE_BMI_MEAN");
      const completionAudit = await researchControllerCompletionAuditCommand({
        statePath: inspected.state.statePath,
        reason: "Verify unused-column semantic warnings remain nonblocking for completion evidence.",
      });
      const semanticRequirement = completionAudit.requirements.find(item => item.id === "dataset-semantic-audit");
      expect(semanticRequirement?.status).toBe("proved");
      expect(semanticRequirement?.finding).toContain("unused/nonblocking");
      const runnerPacket = await researchControllerRunnerPacketCommand({
        statePath: inspected.state.statePath,
        reason: "Verify fresh runner sees dataset-wide semantic warnings.",
      });
      expect(runnerPacket.datasetSemanticAudit.present).toBe(true);
      expect(runnerPacket.datasetSemanticAudit.status).toBe("warning");
      expect(runnerPacket.datasetSemanticAudit.selectedRoleStatus).toBe("pass");
      expect(runnerPacket.datasetSemanticAudit.topIssues).toEqual(expect.arrayContaining([
        expect.objectContaining({ column: "bmi", selected: false, code: "IMPLAUSIBLE_BMI_MEAN" }),
      ]));
      expect(runnerPacket.datasetSemanticAudit.issueCodeSummary).toEqual(expect.arrayContaining([
        expect.objectContaining({ code: "IMPLAUSIBLE_BMI_MEAN", selectedIssueCount: 0 }),
      ]));
      expect(runnerPacket.feasibilityReadiness.status).toBe("pass");
      expect(runnerPacket.feasibilityReadiness.verdict).toBe("formal_analysis_ready");
      expect(runnerPacket.userPrompt).toContain("Dataset semantic audit");
      expect(runnerPacket.userPrompt).toContain("Feasibility readiness: pass; verdict=formal_analysis_ready");
      expect(runnerPacket.evidenceRefs).toEqual(expect.arrayContaining([
        semanticAuditPath,
        runnerPacket.feasibilityReadiness.path,
      ]));
      const runnerPacketReport = await readFile(runnerPacket.reportPath, "utf-8");
      expect(runnerPacketReport).toContain("Feasibility readiness: pass; verdict: formal_analysis_ready");
      expect(runnerPacketReport).toContain("## Dataset Semantic Audit");
      expect(runnerPacketReport).toContain("IMPLAUSIBLE_BMI_MEAN");
      const runbook = await researchControllerRunbookCommand({
        statePath: inspected.state.statePath,
        reason: "Verify launch runbook carries dataset-wide semantic warnings.",
      });
      expect(runbook.runnerPacket.datasetSemanticAudit.present).toBe(true);
      expect(runbook.runnerPacket.datasetSemanticAudit.status).toBe("warning");
      expect(runbook.runnerPacket.datasetSemanticAudit.selectedRoleStatus).toBe("pass");
      expect(runbook.runnerPacket.feasibilityReadiness.status).toBe("pass");
      expect(runbook.runnerPacket.feasibilityReadiness.verdict).toBe("formal_analysis_ready");
      const runbookReport = await readFile(runbook.reportPath, "utf-8");
      expect(runbookReport).toContain("Runner feasibility readiness: pass; verdict=formal_analysis_ready");
      expect(runbookReport).toContain("## Dataset Semantic Audit");
      expect(runbookReport).toContain("IMPLAUSIBLE_BMI_MEAN");
      const doctor = await researchControllerDoctorCommand({
        statePath: inspected.state.statePath,
        reason: "Verify controller doctor carries dataset-wide semantic warnings.",
      });
      expect(doctor.summaries.runnerPacket.datasetSemanticAudit.present).toBe(true);
      expect(doctor.summaries.runnerPacket.datasetSemanticAudit.status).toBe("warning");
      expect(doctor.summaries.runnerPacket.datasetSemanticAudit.selectedRoleStatus).toBe("pass");
      expect(doctor.summaries.runnerPacket.feasibilityReadiness.status).toBe("pass");
      expect(doctor.summaries.runnerPacket.feasibilityReadiness.verdict).toBe("formal_analysis_ready");
      const doctorReport = await readFile(doctor.reportPath, "utf-8");
      expect(doctorReport).toContain("Runner feasibility readiness: pass; verdict=formal_analysis_ready");
      expect(doctorReport).toContain("## Dataset Semantic Audit");
      expect(doctorReport).toContain("IMPLAUSIBLE_BMI_MEAN");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("blocks leaky adjusted regression ideas before controller method execution", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "agenteer-controller-leaky-feasibility-"));
    try {
      const data = path.join(dir, "rows.csv");
      await writeFile(data, [
        "mortality,treatment,age,post_discharge_los,prior_mi",
        ...Array.from({ length: 120 }, (_, index) => `${index < 40 ? 1 : 0},${index % 2},${45 + index % 35},${1 + index % 10},${index % 3 === 0 ? 1 : 0}`),
      ].join("\n"));

      const result = await researchControllerRunCommand({
        question: "Is treatment associated with mortality after adjustment?",
        outDir: path.join(dir, "run"),
        dataPath: data,
        method: "logistic-regression",
        outcome: "mortality",
        exposure: "treatment",
        covariates: ["age", "post_discharge_los", "prior_mi"],
        maxSteps: 8,
      });

      expect(result.state.status).toBe("blocked");
      expect(result.state.actions.map(action => action.action)).not.toContain("run_analysis");
      const verdict = JSON.parse(await readFile(path.join(result.state.rootDir, "controller-feasibility-verdict.json"), "utf-8")) as {
        controllerFeasibilityVerdict: {
          status: string;
          blockers: string[];
          methodChecks: Array<{ id: string; status: string; message: string }>;
        };
      };
      expect(verdict.controllerFeasibilityVerdict.status).toBe("block");
      expect(verdict.controllerFeasibilityVerdict.blockers.join(" ")).toContain("METHOD_OUTCOME_LEAKAGE_TERM_REVIEW");
      expect(verdict.controllerFeasibilityVerdict.blockers.join(" ")).toContain("post_discharge_los");
      expect(verdict.controllerFeasibilityVerdict.blockers.join(" ")).not.toContain("prior_mi (");
      expect(verdict.controllerFeasibilityVerdict.methodChecks).toEqual(expect.arrayContaining([
        expect.objectContaining({ id: "comprehensive-feasibility-blocker", status: "block", message: expect.stringContaining("post_discharge_los") }),
      ]));
      const semanticAuditPath = result.state.artifacts.find(artifact => artifact.kind === "controller-dataset-semantic-audit")?.path ?? "";
      const semanticAudit = JSON.parse(await readFile(semanticAuditPath, "utf-8")) as {
        controllerDatasetSemanticAudit: {
          status: string;
          selectedRoleStatus: string;
          issueCodeSummary: Array<{ code: string; severity: string; totalIssueCount: number; selectedIssueCount: number; columns: string[] }>;
          selectedRoleSummary: Array<{ column: string; role: string; issueCount: number; blockerCount: number; warningCount: number; codes: string[] }>;
          issues: Array<{ column: string; selected: boolean; code: string; message: string }>;
        };
      };
      expect(semanticAudit.controllerDatasetSemanticAudit.status).toBe("block");
      expect(semanticAudit.controllerDatasetSemanticAudit.selectedRoleStatus).toBe("block");
      expect(semanticAudit.controllerDatasetSemanticAudit.issues).toEqual(expect.arrayContaining([
        expect.objectContaining({
          column: "post_discharge_los",
          selected: true,
          code: "OUTCOME_FUTURE_LEAKAGE_SELECTED_ROLE",
          message: expect.stringContaining("post-index"),
        }),
      ]));
      expect(semanticAudit.controllerDatasetSemanticAudit.issueCodeSummary).toEqual(expect.arrayContaining([
        expect.objectContaining({ code: "OUTCOME_FUTURE_LEAKAGE_SELECTED_ROLE", severity: "blocker", selectedIssueCount: 1, columns: ["post_discharge_los"] }),
      ]));
      expect(semanticAudit.controllerDatasetSemanticAudit.selectedRoleSummary).toEqual(expect.arrayContaining([
        expect.objectContaining({ column: "post_discharge_los", role: "covariate", blockerCount: 1, codes: ["OUTCOME_FUTURE_LEAKAGE_SELECTED_ROLE"] }),
      ]));
      const handoff = JSON.parse(await readFile(path.join(result.state.rootDir, "controller-terminal-handoff.json"), "utf-8")) as {
        controllerTerminalHandoff: { failureAttribution: Array<{ message: string; severity: string; category: string }> };
      };
      expect(handoff.controllerTerminalHandoff.failureAttribution).toEqual(expect.arrayContaining([
        expect.objectContaining({
          category: "data",
          severity: "blocker",
          message: expect.stringContaining("OUTCOME_FUTURE_LEAKAGE_SELECTED_ROLE"),
        }),
      ]));
      const completionAudit = await researchControllerCompletionAuditCommand({
        statePath: result.state.statePath,
        reason: "Verify leaky selected covariates block false completion.",
      });
      expect(completionAudit.status).toBe("fail");
      expect(completionAudit.requirements).toEqual(expect.arrayContaining([
        expect.objectContaining({ id: "dataset-semantic-audit", status: "failed", finding: expect.stringContaining("OUTCOME_FUTURE_LEAKAGE_SELECTED_ROLE") }),
      ]));

      const patched = await researchControllerPatchCommand({
        statePath: result.state.statePath,
        patch: { covariates: ["age", "prior_mi"] },
        reason: "Remove post-outcome leakage covariate after feasibility rejection.",
      });
      expect(patched.status).toBe("running");
      expect(patched.currentStage).toBe("dataset_feasibility");

      const repaired = await researchControllerRunCommand({
        statePath: patched.statePath,
        maxSteps: 8,
      });
      expect(repaired.state.actions.map(action => action.action)).toContain("run_analysis");
      const feasibilityArtifacts = repaired.state.artifacts.filter(artifact => artifact.kind === "controller-feasibility-verdict");
      expect(feasibilityArtifacts.length).toBeGreaterThanOrEqual(1);
      const latestVerdictPath = feasibilityArtifacts.at(-1)?.path ?? "";
      const repairedVerdict = JSON.parse(await readFile(latestVerdictPath, "utf-8")) as {
        controllerFeasibilityVerdict: {
          status: string;
          blockers: string[];
          warnings: string[];
        };
      };
      expect(repairedVerdict.controllerFeasibilityVerdict.status).not.toBe("block");
      expect(repairedVerdict.controllerFeasibilityVerdict.blockers.join(" ")).not.toContain("post_discharge_los");
      const latestSemanticAuditPath = repaired.state.artifacts.filter(artifact => artifact.kind === "controller-dataset-semantic-audit").at(-1)?.path ?? "";
      const repairedSemanticAudit = JSON.parse(await readFile(latestSemanticAuditPath, "utf-8")) as {
        controllerDatasetSemanticAudit: {
          selectedRoleStatus: string;
          issues: Array<{ column: string; selected: boolean; code: string }>;
        };
      };
      expect(repairedSemanticAudit.controllerDatasetSemanticAudit.selectedRoleStatus).toBe("pass");
      expect(repairedSemanticAudit.controllerDatasetSemanticAudit.issues).not.toEqual(expect.arrayContaining([
        expect.objectContaining({ column: "prior_mi", selected: true, code: "OUTCOME_FUTURE_LEAKAGE_SELECTED_ROLE" }),
      ]));
      const ledgerPath = repaired.state.issueLedgers.at(-1)?.outPath ?? "";
      const ledger = JSON.parse(await readFile(ledgerPath, "utf-8")) as {
        controllerIssueLedger: { issues: Array<{ message: string; severity: string; source: string }> };
      };
      expect(ledger.controllerIssueLedger.issues.filter(issue => issue.source === "feasibility").map(issue => issue.message).join(" ")).not.toContain("post_discharge_los");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }, 30_000);

  it("blocks post-treatment adjustment variables while allowing baseline history covariates", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "agenteer-controller-post-treatment-adjustment-"));
    try {
      const data = path.join(dir, "rows.csv");
      await writeFile(data, [
        "mortality,treatment,age,in_hospital_procedure,history_surgery",
        ...Array.from({ length: 120 }, (_, index) => `${index < 42 ? 1 : 0},${index % 2},${45 + index % 35},${index % 4 === 0 ? 1 : 0},${index % 5 === 0 ? 1 : 0}`),
      ].join("\n"));

      const result = await researchControllerRunCommand({
        question: "Is treatment associated with mortality after adjustment?",
        outDir: path.join(dir, "run"),
        dataPath: data,
        method: "logistic-regression",
        outcome: "mortality",
        exposure: "treatment",
        covariates: ["age", "in_hospital_procedure", "history_surgery"],
        maxSteps: 8,
      });

      expect(result.state.status).toBe("blocked");
      expect(result.state.actions.map(action => action.action)).not.toContain("run_analysis");
      const semanticAuditPath = result.state.artifacts.find(artifact => artifact.kind === "controller-dataset-semantic-audit")?.path ?? "";
      const semanticAudit = JSON.parse(await readFile(semanticAuditPath, "utf-8")) as {
        controllerDatasetSemanticAudit: {
          status: string;
          selectedRoleStatus: string;
          issues: Array<{ column: string; selected: boolean; code: string; message: string }>;
        };
      };
      expect(semanticAudit.controllerDatasetSemanticAudit.status).toBe("block");
      expect(semanticAudit.controllerDatasetSemanticAudit.selectedRoleStatus).toBe("block");
      expect(semanticAudit.controllerDatasetSemanticAudit.issues).toEqual(expect.arrayContaining([
        expect.objectContaining({
          column: "in_hospital_procedure",
          selected: true,
          code: "POST_TREATMENT_ADJUSTMENT_SELECTED_ROLE",
          message: expect.stringContaining("post-baseline treatment"),
        }),
      ]));
      expect(semanticAudit.controllerDatasetSemanticAudit.issues).not.toEqual(expect.arrayContaining([
        expect.objectContaining({ column: "history_surgery", selected: true, code: "POST_TREATMENT_ADJUSTMENT_SELECTED_ROLE" }),
      ]));

      const patched = await researchControllerPatchCommand({
        statePath: result.state.statePath,
        patch: { covariates: ["age", "history_surgery"] },
        reason: "Remove post-treatment adjustment variable after semantic audit rejection.",
      });
      const repaired = await researchControllerRunCommand({
        statePath: patched.statePath,
        maxSteps: 8,
      });
      expect(repaired.state.actions.map(action => action.action)).toContain("run_analysis");
      const latestSemanticAuditPath = repaired.state.artifacts.filter(artifact => artifact.kind === "controller-dataset-semantic-audit").at(-1)?.path ?? "";
      const repairedSemanticAudit = JSON.parse(await readFile(latestSemanticAuditPath, "utf-8")) as {
        controllerDatasetSemanticAudit: {
          selectedRoleStatus: string;
          issues: Array<{ column: string; selected: boolean; code: string }>;
        };
      };
      expect(repairedSemanticAudit.controllerDatasetSemanticAudit.selectedRoleStatus).toBe("pass");
      expect(repairedSemanticAudit.controllerDatasetSemanticAudit.issues).not.toEqual(expect.arrayContaining([
        expect.objectContaining({ column: "history_surgery", selected: true, code: "POST_TREATMENT_ADJUSTMENT_SELECTED_ROLE" }),
      ]));
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }, 30_000);

  it("can run optional context preflight before dataset planning", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "agenteer-controller-context-"));
    try {
      const data = await writeLinearCsv(path.join(dir, "rows.csv"), 80);
      const contextBin = await writeFakeContextBin(path.join(dir, "fake-context.js"), "ready");
      await mkdir(path.join(dir, ".autocontext", "memory"), { recursive: true });
      await writeFile(path.join(dir, ".autocontext", "memory", "controller.md"), "Use table feasibility before method selection for research studies.\n");

      const result = await researchControllerRunCommand({
        question: "Is x associated with y?",
        outDir: path.join(dir, "run"),
        dataPath: data,
        method: "linear-regression",
        outcome: "y",
        exposure: "x",
        allowContext: true,
        contextRepo: dir,
        contextTarget: "analysis-plan",
        contextBin,
        maxSteps: 13,
      });
      const actions = result.state.actions.map(action => action.action);
      const artifacts = result.state.artifacts.map(artifact => artifact.kind);

      expect(actions).toEqual(expect.arrayContaining(["context_preflight", "table_summary", "select_method"]));
      expect(result.state.completedStages).toContain("context");
      expect(artifacts).toEqual(expect.arrayContaining(["controller-context-preflight", "controller-context-manifest"]));
      const manifest = JSON.parse(await readFile(path.join(result.state.rootDir, "controller-context-manifest.json"), "utf-8")) as { contextManifest: { status: string; score: number } };
      const preflight = JSON.parse(await readFile(path.join(result.state.rootDir, "controller-context-preflight.json"), "utf-8")) as { controllerContextPreflight: { staleOrMissing: boolean; memoryHits: unknown[] } };
      expect(manifest.contextManifest.status).toBe("ready");
      expect(manifest.contextManifest.score).toBeGreaterThan(0);
      expect(preflight.controllerContextPreflight.staleOrMissing).toBe(false);
      expect(preflight.controllerContextPreflight.memoryHits.length).toBeGreaterThanOrEqual(1);
      expect(result.state.selfEvaluations.at(-1)?.checks.map(check => check.id)).toContain("context-preflight-artifact");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("stops for human review when required context preflight reports blocked context", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "agenteer-controller-context-block-"));
    try {
      const data = await writeLinearCsv(path.join(dir, "rows.csv"), 80);
      const contextBin = await writeFakeContextBin(path.join(dir, "fake-context.js"), "missing");

      const result = await researchControllerRunCommand({
        question: "Is x associated with y?",
        outDir: path.join(dir, "run"),
        dataPath: data,
        method: "linear-regression",
        outcome: "y",
        exposure: "x",
        allowContext: true,
        requireContext: true,
        contextRepo: dir,
        contextBin,
        maxSteps: 4,
      });

      expect(result.state.status).toBe("needs_human_review");
      expect(result.state.currentStage).toBe("human_review");
      expect(result.state.actions.map(action => action.action)).toContain("context_preflight");
      expect(result.state.actions.map(action => action.action)).not.toContain("table_summary");
      const manifest = JSON.parse(await readFile(path.join(result.state.rootDir, "controller-context-manifest.json"), "utf-8")) as { contextManifest: { status: string } };
      expect(manifest.contextManifest.status).toBe("blocked");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("self-evaluation prevents false promotion when required artifacts are missing", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "agenteer-controller-self-eval-"));
    try {
      const data = await writeLinearCsv(path.join(dir, "rows.csv"), 70);
      const initialized = await researchControllerInitCommand({
        question: "Is x associated with y?",
        outDir: path.join(dir, "run"),
        dataPath: data,
        method: "linear-regression",
        outcome: "y",
        exposure: "x",
      });
      const feasibilityPath = path.join(initialized.rootDir, "controller-feasibility-verdict.json");
      await writeFile(feasibilityPath, JSON.stringify({
        controllerFeasibilityVerdict: {
          status: "block",
          verdict: "reject",
          score: 0.12,
          confidence: 0.9,
          primaryAction: "revise_question",
          blockers: ["COMPLETE_CASE_ATTRITION_EXTREME: Complete-case attrition is too high for promotion."],
          warnings: [],
          issues: [
            {
              severity: "blocker",
              code: "COMPLETE_CASE_ATTRITION_EXTREME",
              message: "Complete-case attrition is too high for promotion.",
              source: "domain",
              evidenceRefs: [feasibilityPath],
              suggestedFixes: ["Revise high-missingness variables before promotion."],
            },
          ],
        },
      }, null, 2));
      const corruptState: ControllerState = {
        ...initialized,
        currentStage: "promotion_decision",
        status: "running",
        completedStages: ["intake", "dataset_feasibility", "exploration", "method_selection", "execution", "qa", "manuscript", "inspection"],
        actions: [
          {
            decisionId: "manual-corrupt",
            action: "run_analysis",
            status: "succeeded",
            startedAtIso: new Date().toISOString(),
            finishedAtIso: new Date().toISOString(),
            commandSummary: "synthetic",
            outputSummary: "synthetic",
            artifacts: [],
            error: null,
            nextStage: "qa",
          },
        ],
        artifacts: [
          { kind: "run-inspection", path: path.join(initialized.inputs.runDir, "run-inspection.json"), stage: "inspection", sha256: "synthetic", requiredForPromotion: true },
          { kind: "controller-feasibility-verdict", path: feasibilityPath, stage: "dataset_feasibility", sha256: "synthetic", requiredForPromotion: true },
        ],
      };
      await writeFile(corruptState.statePath, JSON.stringify({ schemaVersion: 1, controllerState: corruptState }, null, 2));

      const stepped = await researchControllerStepCommand({ statePath: corruptState.statePath });

      expect(stepped.status).toBe("needs_human_review");
      expect(stepped.currentStage).toBe("human_review");
      expect(stepped.selfEvaluations.at(-1)?.status).toBe("fail");
      expect(stepped.selfEvaluations.at(-1)?.checks).toEqual(expect.arrayContaining([
        expect.objectContaining({
          id: "feasibility-verdict-artifact",
          status: "fail",
          issueCodes: expect.arrayContaining(["COMPLETE_CASE_ATTRITION_EXTREME"]),
          message: expect.stringContaining("COMPLETE_CASE_ATTRITION_EXTREME"),
        }),
      ]));
      expect(stepped.selfEvaluations.at(-1)?.checks.find(check => check.id === "required-artifacts")?.status).toBe("pass");
      expect(stepped.selfEvaluations.at(-1)?.checks.find(check => check.id === "method-qa-artifact")?.status).toBe("fail");
      const selfEvaluationReport = await readFile(path.join(stepped.rootDir, "controller-self-evaluation.md"), "utf-8");
      expect(selfEvaluationReport).toContain("COMPLETE_CASE_ATTRITION_EXTREME");
      const goldenPacket = JSON.parse(await readFile(path.join(stepped.rootDir, "controller-golden-packet.json"), "utf-8")) as {
        controllerGoldenPacket: {
          issueSummary: Array<{ category: string; severity: string; issueCodes: string[]; message: string }>;
        };
      };
      expect(goldenPacket.controllerGoldenPacket.issueSummary).toEqual(expect.arrayContaining([
        expect.objectContaining({
          category: "self_evaluation",
          severity: "blocker",
          issueCodes: expect.arrayContaining(["COMPLETE_CASE_ATTRITION_EXTREME"]),
          message: expect.stringContaining("COMPLETE_CASE_ATTRITION_EXTREME"),
        }),
      ]));
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("integrates mock external review as a controller gate without requiring provider credentials", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "agenteer-controller-review-"));
    try {
      const data = await writeLinearCsv(path.join(dir, "rows.csv"), 60);
      const result = await researchControllerRunCommand({
        question: "Is x associated with y?",
        outDir: path.join(dir, "run"),
        dataPath: data,
        method: "linear-regression",
        outcome: "y",
        exposure: "x",
        allowExternalReview: true,
        mockExternalReview: true,
        reviewPanel: "cheap",
        maxSteps: 13,
      });

      expect(result.state.actions.map(action => action.action)).toContain("external_review");
      expect(result.state.artifacts.map(artifact => artifact.kind)).toEqual(expect.arrayContaining(["review-panel", "review-adjudication", "state-reentry"]));
      expect(await fileExists(path.join(result.state.inputs.runDir, "review", "review-panel.json"))).toBe(true);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("does not treat unresolved external reviewer revisions as promotion-ready evidence", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "agenteer-controller-review-revise-"));
    try {
      const state = await researchControllerInitCommand({
        question: "Is x associated with y?",
        outDir: dir,
        method: "linear-regression",
        outcome: "y",
        exposure: "x",
        allowExternalReview: true,
      });
      const runDir = state.inputs.runDir;
      const reviewDir = path.join(runDir, "review");
      await mkdir(reviewDir, { recursive: true });
      const now = new Date().toISOString();
      const artifact = (kind: string, filePath: string, requiredForPromotion = true) => ({
        kind,
        path: filePath,
        stage: "promotion_decision" as const,
        sha256: `${kind}-sha`,
        requiredForPromotion,
      });
      const manuscriptPath = path.join(runDir, "manuscript.md");
      const manuscriptQaPath = path.join(runDir, "manuscript-qa.json");
      const inspectionPath = path.join(runDir, "run-inspection.json");
      const reviewPanelPath = path.join(reviewDir, "review-panel.json");
      const reviewAdjudicationPath = path.join(reviewDir, "review-adjudication.json");
      await writeFile(manuscriptPath, "# Study\n\nA locally reviewed manuscript.\n");
      await writeFile(manuscriptQaPath, `${JSON.stringify({ manuscriptQa: { status: "pass" } }, null, 2)}\n`);
      await writeFile(inspectionPath, `${JSON.stringify({ schemaVersion: 1, runInspection: { readiness: "local_review_ready", blockers: [], warnings: [] } }, null, 2)}\n`);
      await writeFile(reviewPanelPath, `${JSON.stringify({ schemaVersion: 1, reviewPanel: { status: "revise", reviewers: [] } }, null, 2)}\n`);
      await writeFile(reviewAdjudicationPath, `${JSON.stringify({
        schemaVersion: 1,
        reviewAdjudication: {
          generatedAtIso: now,
          panelPath: reviewPanelPath,
          verdict: "revise",
          consensus: "single_reviewer",
          acceptedFindings: [{
            id: "missing-sensitivity-analysis",
            severity: "major",
            category: "method_choice",
            title: "Sensitivity analysis is missing",
            evidenceRefs: ["manuscript.md"],
            whyItMatters: "The study should not be promoted until the robustness claim is tested.",
            actionableFix: "Add the sensitivity analysis and rerun reviewer QA.",
            reentryPoint: "method_selection",
            deterministicVerification: "analysis artifacts include sensitivity output",
            confidence: 0.9,
            reviewerIds: ["deepseek-methods"],
            supportCount: 1,
          }],
          rejectedFindings: [],
          conflictNotes: [],
          reentryPoint: "method_selection",
          nextAction: "Repair accepted findings and re-review before promotion.",
          outPath: reviewAdjudicationPath,
        },
      }, null, 2)}\n`);
      const promotionState: ControllerState = {
        ...state,
        currentStage: "promotion_decision",
        status: "running",
        policy: { ...state.policy, allowExternalReview: true },
        artifacts: [
          ...state.artifacts,
          artifact("manuscript", manuscriptPath),
          artifact("manuscript-qa", manuscriptQaPath),
          artifact("run-inspection", inspectionPath),
          artifact("review-panel", reviewPanelPath),
          artifact("review-adjudication", reviewAdjudicationPath),
        ],
      };
      await writeFile(state.statePath, `${JSON.stringify({ schemaVersion: 1, controllerState: promotionState }, null, 2)}\n`);

      const audit = await researchControllerCompletionAuditCommand({ statePath: state.statePath, reason: "test unresolved reviewer revision" });
      const externalReviewCheck = audit.requirements.find(check => check.id === "external-review-policy");

      expect(externalReviewCheck?.status).toBe("failed");
      expect(externalReviewCheck?.finding).toMatch(/unresolved \(revise\)/i);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("routes promotion-point reviewer repairs back to fresh external review", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "agenteer-controller-repair-rereview-"));
    try {
      const state = await researchControllerInitCommand({
        question: "Is x associated with y?",
        outDir: dir,
        method: "linear-regression",
        outcome: "y",
        exposure: "x",
        allowExternalReview: true,
        allowAutoRepair: true,
      });
      const reviewDir = path.join(state.inputs.runDir, "review");
      await mkdir(reviewDir, { recursive: true });
      const repairPlanPath = path.join(reviewDir, "controller-repair-plan.json");
      await writeFile(repairPlanPath, `${JSON.stringify({
        schemaVersion: 1,
        controllerRepairPlan: {
          generatedAtIso: new Date().toISOString(),
          runId: state.runId,
          reviewPanelPath: path.join(reviewDir, "review-panel.json"),
          adjudicationPath: path.join(reviewDir, "review-adjudication.json"),
          autonomy: "aggressive",
          verdict: "revise",
          acceptedFindings: [{
            findingId: "reviewer-method-selection-repair",
            severity: "major",
            category: "method_choice",
            title: "Method choice requires refresh",
            action: "Refresh method selection before promotion.",
            reentryPoint: "promotion",
            deterministicVerification: "method-selection-repair artifact exists",
            supportCount: 1,
            reviewerIds: ["deepseek-methods"],
          }],
          autoRepairPolicy: "test",
          reviewReentryPoint: "promotion",
          nextStage: "promotion_decision",
        },
      }, null, 2)}\n`);
      const repairState: ControllerState = {
        ...state,
        currentStage: "repair",
        status: "running",
        policy: { ...state.policy, allowExternalReview: true, allowAutoRepair: true, autonomy: "aggressive", maxAutoRepairs: 2 },
        artifacts: [
          ...state.artifacts,
          {
            kind: "controller-repair-plan",
            path: repairPlanPath,
            stage: "external_review",
            sha256: "controller-repair-plan-sha",
            requiredForPromotion: true,
          },
        ],
      };
      await writeFile(state.statePath, `${JSON.stringify({ schemaVersion: 1, controllerState: repairState }, null, 2)}\n`);

      const stepped = await researchControllerStepCommand({ statePath: state.statePath });
      const repair = stepped.repairs.at(-1);

      expect(stepped.actions.at(-1)?.action).toBe("apply_repairs");
      expect(repair?.status).toBe("succeeded");
      expect(repair?.nextStage).toBe("external_review");
      expect(stepped.currentStage).toBe("external_review");
      expect(stepped.artifacts.map(artifact => artifact.kind)).toEqual(expect.arrayContaining(["controller-repair-execution", "controller-repair-verification"]));
      const verificationPath = stepped.artifacts.find(artifact => artifact.kind === "controller-repair-verification")?.path ?? "";
      const verification = JSON.parse(await readFile(verificationPath, "utf-8")) as { controllerRepairVerification: { status: string; freshExternalReviewRequired: boolean; nextAction: string } };
      expect(verification.controllerRepairVerification.status).toBe("pass");
      expect(verification.controllerRepairVerification.freshExternalReviewRequired).toBe(true);
      expect(verification.controllerRepairVerification.nextAction).toMatch(/external review/i);
      const repairContractPath = stepped.artifacts.find(artifact => artifact.kind === "controller-action-contract" && artifact.path.includes("apply_repairs"))?.path ?? "";
      const repairContract = JSON.parse(await readFile(repairContractPath, "utf-8")) as { controllerActionContract: { status: string; expectedArtifacts: string[]; missingExpectedArtifacts: string[] } };
      expect(repairContract.controllerActionContract.status).toBe("pass");
      expect(repairContract.controllerActionContract.expectedArtifacts).toEqual(expect.arrayContaining(["controller-repair-execution.json", "controller-repair-verification.json"]));
      expect(repairContract.controllerActionContract.missingExpectedArtifacts).toEqual([]);

      const packet = await researchControllerRunnerPacketCommand({
        statePath: state.statePath,
        reason: "test repair verification handoff",
      });
      expect(packet.evidenceRefs).toEqual(expect.arrayContaining([verificationPath]));
      expect(packet.userPrompt).toContain("Repair verification: status=pass");
      expect(packet.userPrompt).toContain("freshExternalReviewRequired=true");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("requires a fresh external reviewer pass after bounded repairs change the packet", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "agenteer-controller-review-stale-"));
    try {
      const state = await researchControllerInitCommand({
        question: "Is x associated with y?",
        outDir: dir,
        method: "linear-regression",
        outcome: "y",
        exposure: "x",
        allowExternalReview: true,
      });
      const runDir = state.inputs.runDir;
      const reviewDir = path.join(runDir, "review");
      await mkdir(reviewDir, { recursive: true });
      const now = new Date().toISOString();
      const artifact = (kind: string, filePath: string, stage = "promotion_decision", requiredForPromotion = true) => ({
        kind,
        path: filePath,
        stage: stage as ControllerState["currentStage"],
        sha256: `${kind}-sha`,
        requiredForPromotion,
      });
      const action = (decisionId: string, actionName: ControllerState["actions"][number]["action"], outputSummary: string) => ({
        decisionId,
        action: actionName,
        status: "succeeded" as const,
        startedAtIso: now,
        finishedAtIso: now,
        commandSummary: actionName,
        outputSummary,
        artifacts: [],
        error: null,
        nextStage: "promotion_decision" as const,
      });
      const manuscriptPath = path.join(runDir, "manuscript.md");
      const manuscriptQaPath = path.join(runDir, "manuscript-qa.json");
      const inspectionPath = path.join(runDir, "run-inspection.json");
      const reviewPanelPath = path.join(reviewDir, "review-panel.json");
      const reviewAdjudicationPath = path.join(reviewDir, "review-adjudication.json");
      const repairPath = path.join(reviewDir, "controller-repair-execution-01.json");
      await writeFile(manuscriptPath, "# Study\n\nA repaired manuscript.\n");
      await writeFile(manuscriptQaPath, `${JSON.stringify({ manuscriptQa: { status: "pass" } }, null, 2)}\n`);
      await writeFile(inspectionPath, `${JSON.stringify({ schemaVersion: 1, runInspection: { readiness: "local_review_ready", blockers: [], warnings: [] } }, null, 2)}\n`);
      await writeFile(reviewPanelPath, `${JSON.stringify({ schemaVersion: 1, reviewPanel: { status: "pass", reviewers: [] } }, null, 2)}\n`);
      await writeFile(reviewAdjudicationPath, `${JSON.stringify({
        schemaVersion: 1,
        reviewAdjudication: {
          generatedAtIso: now,
          panelPath: reviewPanelPath,
          verdict: "pass",
          consensus: "single_reviewer",
          acceptedFindings: [],
          rejectedFindings: [],
          conflictNotes: [],
          reentryPoint: "promotion",
          nextAction: "Proceed.",
          outPath: reviewAdjudicationPath,
        },
      }, null, 2)}\n`);
      await writeFile(repairPath, `${JSON.stringify({ schemaVersion: 1, controllerRepairExecution: { status: "succeeded" } }, null, 2)}\n`);
      const staleReviewState: ControllerState = {
        ...state,
        currentStage: "promotion_decision",
        status: "running",
        policy: { ...state.policy, allowExternalReview: true },
        actions: [
          action("decision-review", "external_review", "External review pass; accepted findings=0; reentry=promotion."),
          action("decision-repair", "apply_repairs", "Repair succeeded; executed=1; skipped=0; next=inspection."),
        ],
        artifacts: [
          ...state.artifacts,
          artifact("manuscript", manuscriptPath),
          artifact("manuscript-qa", manuscriptQaPath),
          artifact("run-inspection", inspectionPath),
          artifact("review-panel", reviewPanelPath),
          artifact("review-adjudication", reviewAdjudicationPath),
          artifact("controller-repair-execution", repairPath, "repair"),
        ],
      };
      await writeFile(state.statePath, `${JSON.stringify({ schemaVersion: 1, controllerState: staleReviewState }, null, 2)}\n`);

      const audit = await researchControllerCompletionAuditCommand({ statePath: state.statePath, reason: "test stale review after repair" });
      const externalReviewCheck = audit.requirements.find(check => check.id === "external-review-policy");

      expect(externalReviewCheck?.status).toBe("failed");
      expect(externalReviewCheck?.finding).toMatch(/passed before the latest repair/i);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("can run optional literature intake and post-manuscript literature QA inside the controller lifecycle", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "agenteer-controller-literature-"));
    try {
      const data = await writeLinearCsv(path.join(dir, "rows.csv"), 70);
      const literatureMock = path.join(dir, "literature-mock.json");
      await writeFile(literatureMock, JSON.stringify({ schemaVersion: 1, literatureSearch: mockLiteratureSearch() }, null, 2));
      const result = await researchControllerRunCommand({
        question: "Is exposure associated with outcome?",
        outDir: path.join(dir, "run"),
        dataPath: data,
        method: "linear-regression",
        outcome: "y",
        exposure: "x",
        allowLiterature: true,
        literatureMockResponsePath: literatureMock,
        maxSteps: 16,
      });
      const actions = result.state.actions.map(action => action.action);
      const artifacts = result.state.artifacts.map(artifact => artifact.kind);

      expect(actions).toEqual(expect.arrayContaining(["literature_search", "literature_qa"]));
      expect(result.state.completedStages).toEqual(expect.arrayContaining(["literature", "literature_qa"]));
      expect(artifacts).toEqual(expect.arrayContaining(["literature-search", "literature-context", "literature-qa"]));
      const modelingPlan = JSON.parse(await readFile(path.join(result.state.rootDir, "controller-modeling-plan.json"), "utf-8")) as { modelingPlan: { literatureEvidence: { source: string; evidenceStrength: string; sourceCount: number } } };
      expect(modelingPlan.modelingPlan.literatureEvidence.source).toBe("literature-context");
      expect(modelingPlan.modelingPlan.literatureEvidence.sourceCount).toBeGreaterThanOrEqual(4);
      expect(await fileExists(path.join(result.state.rootDir, "literature", "literature-context.json"))).toBe(true);
      expect(await fileExists(path.join(result.state.inputs.runDir, "literature-qa.json"))).toBe(true);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("executes bounded repair plugins from accepted reviewer findings and avoids infinite review loops", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "agenteer-controller-repair-"));
    try {
      const data = await writeLinearCsv(path.join(dir, "rows.csv"), 60);
      const result = await researchControllerRunCommand({
        question: "Does x cause y with missingness concerns?",
        outDir: path.join(dir, "run"),
        dataPath: data,
        method: "linear-regression",
        outcome: "y",
        exposure: "x",
        allowExternalReview: true,
        mockExternalReview: true,
        reviewPanel: "cheap",
        maxAutoRepairs: 1,
        maxSteps: 20,
      });
      const actions = result.state.actions.map(action => action.action);
      const repairArtifacts = result.state.artifacts.filter(artifact => artifact.kind.includes("repair"));

      expect(actions).toContain("apply_repairs");
      expect(result.state.repairs).toHaveLength(1);
      expect(result.state.repairs[0]?.status).toBe("succeeded");
      expect(result.state.repairs[0]?.executedRepairs.some(repair => repair.pluginId === "refresh-method-qa-and-inspection")).toBe(true);
      expect(repairArtifacts.map(artifact => artifact.kind)).toContain("controller-repair-execution");
      expect(repairArtifacts.map(artifact => artifact.kind)).toContain("controller-repair-verification");
      expect(result.state.status).toBe("needs_human_review");
      expect(result.state.stopReason).toMatch(/human review/i);
      const handoff = JSON.parse(await readFile(path.join(result.state.rootDir, "controller-terminal-handoff.json"), "utf-8")) as Record<string, { trigger: string; suggestedCommands: string[] }>;
      expect(handoff.controllerTerminalHandoff.trigger).toBe("human_review");
      expect(handoff.controllerTerminalHandoff.suggestedCommands.join("\n")).toMatch(/controller-resume --state/);
      const nextAction = JSON.parse(await readFile(path.join(result.state.rootDir, "controller-next-action.json"), "utf-8")) as { controllerNextAction: { mustReviewArtifacts: Array<{ kind: string; path: string }> } };
      const repairVerificationReview = nextAction.controllerNextAction.mustReviewArtifacts.find(artifact => artifact.kind === "controller-repair-verification");
      const repairVerificationReportReview = nextAction.controllerNextAction.mustReviewArtifacts.find(artifact => artifact.kind === "controller-repair-verification-report");
      expect(repairVerificationReview?.path).toBeTruthy();
      expect(repairVerificationReportReview?.path).toBeTruthy();
      expect(await fileExists(repairVerificationReview?.path ?? "")).toBe(true);
      expect(await fileExists(repairVerificationReportReview?.path ?? "")).toBe(true);
      const reentry = JSON.parse(await readFile(path.join(result.state.rootDir, "controller-reentry-plan.json"), "utf-8")) as { controllerReentryPlan: { status: string; recommendedStage: string; commands: string[] } };
      expect(reentry.controllerReentryPlan.status).toMatch(/resume|repair_then_resume|patch_then_resume/);
      expect(reentry.controllerReentryPlan.commands.join("\n")).toMatch(/controller-resume --state/);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("runs a public bounded repair cycle from a repair-stage controller state", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "agenteer-controller-repair-cycle-"));
    try {
      const data = await writeLinearCsv(path.join(dir, "rows.csv"), 60);
      const seeded = await researchControllerRunCommand({
        question: "Does x cause y with missingness concerns?",
        outDir: path.join(dir, "run"),
        dataPath: data,
        method: "linear-regression",
        outcome: "y",
        exposure: "x",
        allowExternalReview: true,
        mockExternalReview: true,
        reviewPanel: "cheap",
        maxAutoRepairs: 1,
        maxSteps: 8,
      });
      expect(seeded.state.currentStage).toMatch(/repair|human_review/);
      expect(seeded.state.repairs).toHaveLength(0);

      const cycle = await researchControllerRepairCycleCommand({
        statePath: seeded.state.statePath,
        maxSteps: 4,
        reason: "test_public_repair_cycle",
      });
      const artifactKinds = cycle.state.artifacts.map(artifact => artifact.kind);

      expect(cycle.status).toBe("repaired");
      expect(cycle.beforeStage).toMatch(/repair|human_review/);
      expect(cycle.runResultPath).toBeTruthy();
      expect(cycle.runResultReportPath).toBeTruthy();
      expect(cycle.completionAuditPath).toBeTruthy();
      expect(cycle.completionAuditReportPath).toBeTruthy();
      expect(cycle.state.repairs.length).toBeGreaterThan(0);
      expect(cycle.state.actions.map(action => action.action)).toContain("apply_repairs");
      const repairCycleConsole = renderResearchControllerRepairCycle(cycle);
      expect(repairCycleConsole).toContain(`reentry plan: ${cycle.reentryPlanPath}`);
      expect(repairCycleConsole).toContain(`reentry report: ${cycle.reentryPlanReportPath}`);
      expect(repairCycleConsole).toContain(`run invocation: ${cycle.runResultPath}`);
      expect(repairCycleConsole).toContain(`run invocation report: ${cycle.runResultReportPath}`);
      expect(repairCycleConsole).toContain(`completion audit: ${cycle.completionAuditPath}`);
      expect(repairCycleConsole).toContain(`completion audit report: ${cycle.completionAuditReportPath}`);
      expect(repairCycleConsole).toContain(`report: ${cycle.reportPath}`);
      expect(artifactKinds).toEqual(expect.arrayContaining([
        "controller-repair-cycle",
        "controller-repair-cycle-report",
        "controller-repair-execution",
        "controller-completion-audit",
      ]));
      expect(await fileExists(cycle.outPath)).toBe(true);
      expect(await fileExists(cycle.reportPath)).toBe(true);
      expect(await fileExists(cycle.reentryPlanReportPath)).toBe(true);
      expect(await fileExists(cycle.runResultReportPath ?? "")).toBe(true);
      expect(await fileExists(cycle.completionAuditReportPath ?? "")).toBe(true);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("resumes executable re-entry plans and refuses patch-required plans without force", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "agenteer-controller-resume-"));
    try {
      const data = await writeLinearCsv(path.join(dir, "rows.csv"), 60);
      const paused = await researchControllerRunCommand({
        question: "Is x associated with y?",
        outDir: path.join(dir, "run"),
        dataPath: data,
        method: "linear-regression",
        outcome: "y",
        exposure: "x",
        maxSteps: 1,
      });
      expect(paused.state.status).toBe("needs_human_review");
      const resume = await researchControllerResumeCommand({
        statePath: paused.state.statePath,
        reason: "Resume from typed re-entry plan during test.",
      });

      expect(resume.resumed).toBe(true);
      expect(resume.state.status).toBe("running");
      expect(resume.state.currentStage).not.toBe("human_review");
      expect(resume.reentryPlan?.commands.join("\n")).toMatch(/controller-resume --state/);
      expect(await fileExists(resume.resumeRecordPath)).toBe(true);

      const badData = path.join(dir, "bad.csv");
      await writeFile(badData, "death_flag,x\n2,1\n1,2\n0,3\n2,4\n1,5\n0,6\n2,7\n1,8\n0,9\n2,10\n1,11\n0,12\n2,13\n1,14\n0,15\n2,16\n1,17\n0,18\n2,19\n1,20\n0,21\n2,22\n1,23\n0,24\n2,25\n1,26\n0,27\n2,28\n1,29\n0,30\n");
      const blocked = await researchControllerRunCommand({
        question: "Is x associated with mortality?",
        outDir: path.join(dir, "blocked"),
        dataPath: badData,
        method: "logistic-regression",
        outcome: "death_flag",
        exposure: "x",
        maxSteps: 8,
      });
      const blockedResume = await researchControllerResumeCommand({ statePath: blocked.state.statePath });
      expect(blockedResume.resumed).toBe(false);
      expect(blockedResume.reason).toMatch(/requires a reviewed controller-patch/i);
      expect(blockedResume.state.status).toBe("blocked");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("applies safe manual input patches, records provenance, and invalidates downstream stages", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "agenteer-controller-patch-"));
    try {
      const data = await writeLinearCsv(path.join(dir, "rows.csv"), 70);
      const result = await researchControllerRunCommand({
        question: "Is x associated with y?",
        outDir: path.join(dir, "run"),
        dataPath: data,
        method: "linear-regression",
        outcome: "y",
        exposure: "x",
        maxSteps: 8,
      });
      const patched = await researchControllerPatchCommand({
        statePath: result.state.statePath,
        patch: { exposure: "age", covariates: ["x"], weight: "age", alphaPenalty: 0.2, l1Ratio: 0.4 },
        reason: "Switch exposure after controller review.",
      });

      expect(patched.inputs.exposure).toBe("age");
      expect(patched.inputs.covariates).toEqual(["x"]);
      expect(patched.inputs.weight).toBe("age");
      expect(patched.inputs.alphaPenalty).toBe(0.2);
      expect(patched.inputs.l1Ratio).toBe(0.4);
      expect(patched.patches).toHaveLength(1);
      expect(patched.patches[0]?.status).toBe("applied");
      expect(patched.patches[0]?.changedFields).toEqual(expect.arrayContaining(["exposure", "covariates", "weight", "alphaPenalty", "l1Ratio"]));
      expect(patched.currentStage).toBe("dataset_feasibility");
      expect(patched.completedStages).not.toContain("execution");
      expect(patched.artifacts.map(artifact => artifact.kind)).toContain("controller-input-patch");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("can use a model-backed controller decision and falls back to deterministic state if needed", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "agenteer-controller-model-"));
    try {
      const state = await researchControllerInitCommand({
        question: "Is x associated with y?",
        outDir: dir,
        method: "linear-regression",
        outcome: "y",
        exposure: "x",
        controller: { enabled: true, provider: "openai", model: "gpt-5.4" },
      });
      const fetchImpl = async () => new Response(JSON.stringify({
        choices: [{ message: { content: JSON.stringify({ action: "initialize", rationale: "Initialize because the intake gate passed.", confidence: 0.91, riskFlags: [] }) } }],
      }), { status: 200, headers: { "content-type": "application/json" } });

      const stepped = await researchControllerStepCommand({
        statePath: state.statePath,
        env: { OPENAI_API_KEY: "test-key" } as NodeJS.ProcessEnv,
        fetchImpl: fetchImpl as typeof fetch,
      });
      const inspected = await researchControllerInspectCommand({ statePath: state.statePath });

      expect(stepped.decisions[0]?.source).toBe("model");
      expect(stepped.currentStage).toBe("method_selection");
      expect(inspected.state.decisions[0]?.source).toBe("model");
      expect(stepped.artifacts.map(artifact => artifact.kind)).toEqual(expect.arrayContaining(["controller-model-preflight", "controller-decision-quality"]));
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("can require the model controller and refuse deterministic fallback when the model response is invalid", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "agenteer-controller-required-model-"));
    try {
      const state = await researchControllerInitCommand({
        question: "Is x associated with y?",
        outDir: dir,
        method: "linear-regression",
        outcome: "y",
        exposure: "x",
        requireControllerModel: true,
        controller: { enabled: true, provider: "openai", model: "gpt-5.4" },
      });
      const fetchImpl = async () => new Response(JSON.stringify({
        choices: [{ message: { content: JSON.stringify({ action: "run_analysis", rationale: "Invalid for intake.", confidence: 0.5 }) } }],
      }), { status: 200, headers: { "content-type": "application/json" } });

      const stepped = await researchControllerStepCommand({
        statePath: state.statePath,
        env: { OPENAI_API_KEY: "test-key" } as NodeJS.ProcessEnv,
        fetchImpl: fetchImpl as typeof fetch,
      });

      expect(stepped.status).toBe("needs_human_review");
      expect(stepped.currentStage).toBe("human_review");
      expect(stepped.decisions[0]?.source).toBe("model_fallback");
      expect(stepped.decisions[0]?.action).toBe("stop_for_human");
      expect(stepped.decisions[0]?.rationale).toMatch(/required by policy/i);
      expect(stepped.actions.map(action => action.action)).not.toContain("initialize");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("preflights required model-controller credentials before model decisions", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "agenteer-controller-model-preflight-"));
    try {
      const state = await researchControllerInitCommand({
        question: "Is x associated with y?",
        outDir: dir,
        method: "linear-regression",
        outcome: "y",
        exposure: "x",
        requireControllerModel: true,
        controller: { enabled: true, provider: "openai", model: "gpt-5.4" },
      });

      const stepped = await researchControllerStepCommand({
        statePath: state.statePath,
        env: {} as NodeJS.ProcessEnv,
        fetchImpl: (async () => {
          throw new Error("fetch should not be called when model preflight fails");
        }) as typeof fetch,
      });
      const preflightPath = path.join(dir, "controller_model_preflight_001.json");
      const preflight = JSON.parse(await readFile(preflightPath, "utf-8")) as { controllerModelPreflight: { status: string; checks: Array<{ id: string; status: string; message: string }>; fallbackAllowed: boolean } };

      expect(stepped.status).toBe("needs_human_review");
      expect(stepped.currentStage).toBe("human_review");
      expect(stepped.artifacts.map(artifact => artifact.kind)).toContain("controller-model-preflight");
      expect(preflight.controllerModelPreflight.status).toBe("fail");
      expect(preflight.controllerModelPreflight.fallbackAllowed).toBe(false);
      expect(preflight.controllerModelPreflight.checks).toEqual(expect.arrayContaining([
        expect.objectContaining({ id: "provider-credentials", status: "fail" }),
      ]));
      expect(stepped.decisions[0]?.rationale).toMatch(/preflight failed/i);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("blocks low-quality required model-controller decisions before execution", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "agenteer-controller-decision-quality-"));
    try {
      const state = await researchControllerInitCommand({
        question: "Is x associated with y?",
        outDir: dir,
        method: "linear-regression",
        outcome: "y",
        exposure: "x",
        requireControllerModel: true,
        controller: { enabled: true, provider: "openai", model: "gpt-5.4" },
      });
      const fetchImpl = async () => new Response(JSON.stringify({
        choices: [{ message: { content: JSON.stringify({ action: "initialize", rationale: "Maybe continue.", confidence: 0.41, riskFlags: ["unsupported_methodological_jump"] }) } }],
      }), { status: 200, headers: { "content-type": "application/json" } });

      const stepped = await researchControllerStepCommand({
        statePath: state.statePath,
        env: { OPENAI_API_KEY: "test-key" } as NodeJS.ProcessEnv,
        fetchImpl: fetchImpl as typeof fetch,
      });
      const qualityPath = path.join(dir, "controller_decision_quality_001.json");
      const quality = JSON.parse(await readFile(qualityPath, "utf-8")) as { controllerDecisionQuality: { status: string; checks: Array<{ id: string; status: string }> } };

      expect(stepped.status).toBe("needs_human_review");
      expect(stepped.currentStage).toBe("human_review");
      expect(stepped.decisions[0]?.action).toBe("stop_for_human");
      expect(stepped.decisions[0]?.rationale).toMatch(/decision quality failed/i);
      expect(stepped.actions.map(action => action.action)).not.toContain("initialize");
      expect(stepped.artifacts.map(artifact => artifact.kind)).toContain("controller-decision-quality");
      expect(quality.controllerDecisionQuality.status).toBe("fail");
      expect(quality.controllerDecisionQuality.checks).toEqual(expect.arrayContaining([
        expect.objectContaining({ id: "confidence", status: "fail" }),
        expect.objectContaining({ id: "risk-flags", status: "fail" }),
      ]));
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("blocks required model-controller continuation while active coded blockers remain", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "agenteer-controller-coded-blocker-quality-"));
    try {
      const data = await writeLinearCsv(path.join(dir, "rows.csv"), 50);
      const state = await researchControllerInitCommand({
        question: "Is x associated with y?",
        outDir: path.join(dir, "run"),
        dataPath: data,
        method: "linear-regression",
        outcome: "y",
        exposure: "x",
        requireControllerModel: true,
        controller: { enabled: true, provider: "openai", model: "gpt-5.4" },
      });
      const issueLedgerPath = path.join(state.rootDir, "controller_issue_ledger_999.json");
      const issueLedger = {
        schemaVersion: 1,
        generatedAtIso: new Date().toISOString(),
        ledgerId: "controller_issue_ledger_999",
        reason: "synthetic coded blocker for model-quality regression",
        runId: state.runId,
        status: "blocked",
        currentStage: "exploration",
        controllerStatus: "running",
        counts: { blockers: 1, major: 0, minor: 0, info: 0 },
        issues: [
          {
            id: "issue_complete_case_attrition_extreme",
            issueCode: "COMPLETE_CASE_ATTRITION_EXTREME",
            severity: "blocker",
            category: "data",
            status: "active",
            source: "feasibility:COMPLETE_CASE_ATTRITION_EXTREME",
            stage: "dataset_feasibility",
            message: "COMPLETE_CASE_ATTRITION_EXTREME: complete-case attrition remains unresolved.",
            evidenceRefs: [issueLedgerPath],
            suggestedAction: "Revise high-missingness variables before continuing.",
            reentryStage: "dataset_feasibility",
          },
        ],
        topIssue: {
          id: "issue_complete_case_attrition_extreme",
          issueCode: "COMPLETE_CASE_ATTRITION_EXTREME",
          severity: "blocker",
          category: "data",
          status: "active",
          source: "feasibility:COMPLETE_CASE_ATTRITION_EXTREME",
          stage: "dataset_feasibility",
          message: "COMPLETE_CASE_ATTRITION_EXTREME: complete-case attrition remains unresolved.",
          evidenceRefs: [issueLedgerPath],
          suggestedAction: "Revise high-missingness variables before continuing.",
          reentryStage: "dataset_feasibility",
        },
        nextAction: "Patch study variables before continuing.",
        outPath: issueLedgerPath,
        reportPath: path.join(state.rootDir, "controller_issue_ledger_999.md"),
      };
      await writeFile(issueLedgerPath, JSON.stringify({ schemaVersion: 1, controllerIssueLedger: issueLedger }, null, 2));
      const inconsistentState: ControllerState = {
        ...state,
        currentStage: "exploration",
        status: "running",
        completedStages: ["intake", "dataset_feasibility"],
        issueLedgers: [
          ...state.issueLedgers,
          {
            ledgerId: "controller_issue_ledger_999",
            reason: issueLedger.reason,
            status: "blocked",
            currentStage: "exploration",
            issueCount: 1,
            blockerCount: 1,
            outPath: issueLedgerPath,
            reportPath: issueLedger.reportPath,
          },
        ],
      };
      await writeFile(inconsistentState.statePath, JSON.stringify({ schemaVersion: 1, controllerState: inconsistentState }, null, 2));
      const fetchImpl = async () => new Response(JSON.stringify({
        choices: [{ message: { content: JSON.stringify({ action: "explore", rationale: "Continue exploration despite the unresolved coded blocker.", confidence: 0.9, riskFlags: [] }) } }],
      }), { status: 200, headers: { "content-type": "application/json" } });

      const stepped = await researchControllerStepCommand({
        statePath: inconsistentState.statePath,
        env: { OPENAI_API_KEY: "test-key" } as NodeJS.ProcessEnv,
        fetchImpl: fetchImpl as typeof fetch,
      });
      const qualityPath = path.join(state.rootDir, "controller_decision_quality_001.json");
      const quality = JSON.parse(await readFile(qualityPath, "utf-8")) as {
        controllerDecisionQuality: {
          status: string;
          checks: Array<{ id: string; status: string; issueCodes?: string[]; message: string }>;
        };
      };

      expect(stepped.status).toBe("needs_human_review");
      expect(stepped.currentStage).toBe("human_review");
      expect(stepped.decisions.at(-1)?.action).toBe("stop_for_human");
      expect(stepped.actions.map(action => action.action)).not.toContain("explore");
      expect(quality.controllerDecisionQuality.status).toBe("fail");
      expect(quality.controllerDecisionQuality.checks).toEqual(expect.arrayContaining([
        expect.objectContaining({
          id: "active-coded-blockers",
          status: "fail",
          issueCodes: expect.arrayContaining(["COMPLETE_CASE_ATTRITION_EXTREME"]),
          message: expect.stringContaining("explore"),
        }),
      ]));
      expect(await readFile(path.join(state.rootDir, "controller_decision_quality_001.md"), "utf-8")).toContain("COMPLETE_CASE_ATTRITION_EXTREME");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("blocks deterministic continuation while active coded blockers remain", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "agenteer-controller-deterministic-coded-blocker-"));
    try {
      const data = await writeLinearCsv(path.join(dir, "rows.csv"), 50);
      const state = await researchControllerInitCommand({
        question: "Is x associated with y?",
        outDir: path.join(dir, "run"),
        dataPath: data,
        method: "linear-regression",
        outcome: "y",
        exposure: "x",
      });
      const issueLedgerPath = path.join(state.rootDir, "controller_issue_ledger_998.json");
      const issueLedger = {
        schemaVersion: 1,
        generatedAtIso: new Date().toISOString(),
        ledgerId: "controller_issue_ledger_998",
        reason: "synthetic coded blocker for deterministic guard regression",
        runId: state.runId,
        status: "blocked",
        currentStage: "exploration",
        controllerStatus: "running",
        counts: { blockers: 1, major: 0, minor: 0, info: 0 },
        issues: [
          {
            id: "issue_complete_case_attrition_extreme",
            issueCode: "COMPLETE_CASE_ATTRITION_EXTREME",
            severity: "blocker",
            category: "data",
            status: "active",
            source: "feasibility:COMPLETE_CASE_ATTRITION_EXTREME",
            stage: "dataset_feasibility",
            message: "COMPLETE_CASE_ATTRITION_EXTREME: complete-case attrition remains unresolved.",
            evidenceRefs: [issueLedgerPath],
            suggestedAction: "Revise high-missingness variables before continuing.",
            reentryStage: "dataset_feasibility",
          },
        ],
        topIssue: {
          id: "issue_complete_case_attrition_extreme",
          issueCode: "COMPLETE_CASE_ATTRITION_EXTREME",
          severity: "blocker",
          category: "data",
          status: "active",
          source: "feasibility:COMPLETE_CASE_ATTRITION_EXTREME",
          stage: "dataset_feasibility",
          message: "COMPLETE_CASE_ATTRITION_EXTREME: complete-case attrition remains unresolved.",
          evidenceRefs: [issueLedgerPath],
          suggestedAction: "Revise high-missingness variables before continuing.",
          reentryStage: "dataset_feasibility",
        },
        nextAction: "Patch study variables before continuing.",
        outPath: issueLedgerPath,
        reportPath: path.join(state.rootDir, "controller_issue_ledger_998.md"),
      };
      await writeFile(issueLedgerPath, JSON.stringify({ schemaVersion: 1, controllerIssueLedger: issueLedger }, null, 2));
      const inconsistentState: ControllerState = {
        ...state,
        currentStage: "exploration",
        status: "running",
        completedStages: ["intake", "dataset_feasibility"],
        issueLedgers: [
          ...state.issueLedgers,
          {
            ledgerId: "controller_issue_ledger_998",
            reason: issueLedger.reason,
            status: "blocked",
            currentStage: "exploration",
            issueCount: 1,
            blockerCount: 1,
            outPath: issueLedgerPath,
            reportPath: issueLedger.reportPath,
          },
        ],
      };
      await writeFile(inconsistentState.statePath, JSON.stringify({ schemaVersion: 1, controllerState: inconsistentState }, null, 2));

      const stepped = await researchControllerStepCommand({ statePath: inconsistentState.statePath });

      expect(stepped.status).toBe("blocked");
      expect(stepped.currentStage).toBe("blocked");
      expect(stepped.decisions.at(-1)?.action).toBe("block");
      expect(stepped.stopReason).toContain("COMPLETE_CASE_ATTRITION_EXTREME");
      expect(stepped.actions.map(action => action.action)).not.toContain("explore");
      expect(stepped.gates.at(-1)?.label).toContain("Active coded blockers");
      expect(stepped.gates.at(-1)?.reasons.join(" ")).toContain("COMPLETE_CASE_ATTRITION_EXTREME");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("applies explicit runtime policy overrides when continuing from an existing controller state", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "agenteer-controller-runtime-policy-"));
    try {
      const state = await researchControllerInitCommand({
        question: "Is x associated with y?",
        outDir: dir,
        method: "linear-regression",
        outcome: "y",
        exposure: "x",
      });
      const fetchImpl = async () => new Response(JSON.stringify({
        choices: [{ message: { content: JSON.stringify({ action: "run_analysis", rationale: "Invalid for intake.", confidence: 0.5 }) } }],
      }), { status: 200, headers: { "content-type": "application/json" } });

      const run = await researchControllerRunCommand({
        question: "",
        outDir: dir,
        statePath: state.statePath,
        maxSteps: 1,
        requireControllerModel: true,
        controller: { enabled: true, provider: "openai", model: "gpt-5.4" },
        env: { OPENAI_API_KEY: "test-key" } as NodeJS.ProcessEnv,
        fetchImpl: fetchImpl as typeof fetch,
      });

      expect(run.state.policy.controller.enabled).toBe(true);
      expect(run.state.policy.requireControllerModel).toBe(true);
      expect(run.state.policyUpdates).toHaveLength(1);
      expect(run.state.policyUpdates[0]?.changedFields.map(change => change.field)).toEqual(expect.arrayContaining(["requireControllerModel", "controller.enabled"]));
      expect(run.state.artifacts.map(artifact => artifact.kind)).toEqual(expect.arrayContaining(["controller-policy-update", "controller-state-snapshot"]));
      const firstSnapshot = JSON.parse(await readFile(run.state.artifacts.find(artifact => artifact.kind === "controller-state-snapshot")?.path ?? "", "utf-8")) as { controllerStateSnapshot: { reason: string; stage: string; status: string } };
      expect(firstSnapshot.controllerStateSnapshot.reason).toBe("before_runtime_policy_overrides");
      expect(firstSnapshot.controllerStateSnapshot.stage).toBe("intake");
      expect(firstSnapshot.controllerStateSnapshot.status).toBe("running");
      expect(run.state.status).toBe("needs_human_review");
      expect(run.state.decisions[0]?.action).toBe("stop_for_human");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("accepts safe model-proposed input patches and rejects unsafe no-op patches", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "agenteer-controller-model-patch-"));
    try {
      const state = await researchControllerInitCommand({
        question: "Is x associated with y?",
        outDir: dir,
        method: "linear-regression",
        controller: { enabled: true, provider: "openai", model: "gpt-5.4" },
      });
      const fetchImpl = async () => new Response(JSON.stringify({
        choices: [{ message: { content: JSON.stringify({ action: "initialize", rationale: "Record the intended outcome before planning.", confidence: 0.9, inputPatch: { outcome: "y" } }) } }],
      }), { status: 200, headers: { "content-type": "application/json" } });

      const stepped = await researchControllerStepCommand({
        statePath: state.statePath,
        env: { OPENAI_API_KEY: "test-key" } as NodeJS.ProcessEnv,
        fetchImpl: fetchImpl as typeof fetch,
      });

      expect(stepped.inputs.outcome).toBe("y");
      expect(stepped.patches).toHaveLength(1);
      expect(stepped.patches[0]?.source).toBe("model_decision");
      expect(stepped.patches[0]?.status).toBe("applied");
      expect(stepped.decisions[0]?.patchValidation.status).toBe("valid");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("re-enters invalidated stages after model-proposed input patches instead of executing stale actions", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "agenteer-controller-model-patch-reentry-"));
    try {
      const data = await writeLinearCsv(path.join(dir, "rows.csv"), 70);
      const state = await researchControllerInitCommand({
        question: "Is x associated with y?",
        outDir: dir,
        dataPath: data,
        method: "linear-regression",
        outcome: "y",
        exposure: "x",
        controller: { enabled: true, provider: "openai", model: "gpt-5.4" },
      });
      let call = 0;
      const fetchImpl = async () => {
        call += 1;
        const payload = call === 1
          ? { action: "initialize", rationale: "Start controller.", confidence: 0.9 }
          : call === 2
            ? { action: "table_summary", rationale: "Summarize data.", confidence: 0.9 }
            : call === 3
              ? { action: "explore", rationale: "Explore data.", confidence: 0.9 }
              : { action: "select_method", rationale: "Switch exposure before method selection because age is the reviewed exposure.", confidence: 0.9, inputPatch: { exposure: "age", covariates: ["x"] } };
        return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(payload) } }] }), { status: 200, headers: { "content-type": "application/json" } });
      };

      let stepped = await researchControllerStepCommand({ statePath: state.statePath, env: { OPENAI_API_KEY: "test-key" } as NodeJS.ProcessEnv, fetchImpl: fetchImpl as typeof fetch });
      stepped = await researchControllerStepCommand({ statePath: stepped.statePath, env: { OPENAI_API_KEY: "test-key" } as NodeJS.ProcessEnv, fetchImpl: fetchImpl as typeof fetch });
      stepped = await researchControllerStepCommand({ statePath: stepped.statePath, env: { OPENAI_API_KEY: "test-key" } as NodeJS.ProcessEnv, fetchImpl: fetchImpl as typeof fetch });
      expect(stepped.currentStage).toBe("method_selection");

      const patched = await researchControllerStepCommand({ statePath: stepped.statePath, env: { OPENAI_API_KEY: "test-key" } as NodeJS.ProcessEnv, fetchImpl: fetchImpl as typeof fetch });

      expect(patched.inputs.exposure).toBe("age");
      expect(patched.inputs.covariates).toEqual(["x"]);
      expect(patched.currentStage).toBe("dataset_feasibility");
      expect(patched.status).toBe("running");
      expect(patched.patches.at(-1)?.source).toBe("model_decision");
      expect(patched.patches.at(-1)?.invalidatedStages).toEqual(expect.arrayContaining(["dataset_feasibility", "method_selection", "execution"]));
      expect(patched.actions.map(action => action.action)).not.toContain("select_method");
      expect(patched.completedStages).not.toContain("method_selection");
      expect(patched.nextRecommendedAction).toMatch(/re-enter dataset_feasibility/i);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("runs bounded controller status and inspection tools and records tool provenance", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "agenteer-controller-tool-"));
    try {
      const state = await researchControllerInitCommand({
        question: "Is exposure associated with outcome?",
        outDir: dir,
        method: "linear-regression",
        outcome: "outcome",
        exposure: "exposure",
      });

      const statused = await researchControllerToolCommand({
        statePath: state.statePath,
        request: {
          toolId: "controller-status",
          args: [],
          reason: "Refresh first-read controller readiness before continuing.",
        },
      });

      expect(statused.toolActions).toHaveLength(1);
      expect(statused.toolActions[0]?.status).toBe("succeeded");
      expect(statused.toolActions[0]?.command).toBeNull();
      expect(statused.artifacts.map(artifact => artifact.kind)).toEqual(expect.arrayContaining([
        "controller-status",
        "controller-status-report",
        "controller-tool-action",
        "controller-tool-stdout",
      ]));
      expect(await fileExists(statused.toolActions[0]?.stdoutPath ?? "")).toBe(true);

      const inspected = await researchControllerToolCommand({
        statePath: state.statePath,
        request: {
          toolId: "controller-inspect",
          args: [],
          reason: "Verify controller state integrity before continuing.",
        },
      });

      const inspectAction = inspected.toolActions.at(-1);
      expect(inspected.toolActions).toHaveLength(2);
      expect(inspectAction?.request.toolId).toBe("controller-inspect");
      expect(inspectAction?.status).toBe("succeeded");
      expect(inspectAction?.command).toBeNull();
      expect(inspectAction?.inspection?.status).toBe("pass");
      expect(inspected.artifacts.map(artifact => artifact.kind)).toEqual(expect.arrayContaining(["controller-tool-action", "controller-tool-stdout"]));
      expect(await fileExists(inspectAction?.stdoutPath ?? "")).toBe(true);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("writes durable inspection artifacts from the public controller inspect command", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "agenteer-controller-inspect-"));
    try {
      const state = await researchControllerInitCommand({
        question: "Is exposure associated with outcome?",
        outDir: dir,
        method: "linear-regression",
        outcome: "outcome",
        exposure: "exposure",
      });

      const inspected = await researchControllerInspectCommand({ statePath: state.statePath });
      const inspectionPath = path.join(dir, "controller-internal-inspection.json");
      const reportPath = path.join(dir, "controller-internal-inspection.md");
      const recoveryPath = path.join(dir, "controller-recovery-inspection.json");
      const persisted = JSON.parse(await readFile(path.join(dir, "controller-state.json"), "utf-8")) as { controllerState: ControllerState };
      const inspection = JSON.parse(await readFile(inspectionPath, "utf-8")) as { controllerInspection: { status: string; checks: Array<{ id: string; status: string }> } };
      const recovery = JSON.parse(await readFile(recoveryPath, "utf-8")) as { controllerRecoveryInspection: { status: string; recommendedCommand: string } };

      expect(inspected.state.artifacts.map(artifact => artifact.kind)).toEqual(expect.arrayContaining(["controller-internal-inspection", "controller-internal-inspection-report", "controller-recovery-inspection"]));
      expect(persisted.controllerState.artifacts.map(artifact => artifact.kind)).toEqual(expect.arrayContaining(["controller-internal-inspection", "controller-internal-inspection-report", "controller-recovery-inspection"]));
      expect(inspection.controllerInspection.status).toBe("pass");
      expect(recovery.controllerRecoveryInspection.status).toBe("resume_safe");
      expect(recovery.controllerRecoveryInspection.recommendedCommand).toMatch(/controller-run --state/);
      expect(inspection.controllerInspection.checks).toEqual(expect.arrayContaining([
        expect.objectContaining({ id: "state-path", status: "pass" }),
        expect.objectContaining({ id: "stage-valid", status: "pass" }),
        expect.objectContaining({ id: "issue-ledger-present", status: "pass" }),
        expect.objectContaining({ id: "work-plan-present", status: "pass" }),
        expect.objectContaining({ id: "decision-context-coverage", status: "pass" }),
        expect.objectContaining({ id: "action-readiness-coverage", status: "pass" }),
      ]));
      expect(await readFile(reportPath, "utf-8")).toMatch(/Controller Internal Inspection/);
      expect(await fileExists(reportPath)).toBe(true);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("detects possible interrupted or stepwise controller progress during inspection", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "agenteer-controller-recovery-"));
    try {
      const state = await researchControllerInitCommand({
        question: "Is x associated with y?",
        outDir: dir,
        method: "linear-regression",
        outcome: "y",
        exposure: "x",
      });
      await researchControllerStepCommand({ statePath: state.statePath });
      await researchControllerInspectCommand({ statePath: state.statePath });
      const recovery = JSON.parse(await readFile(path.join(dir, "controller-recovery-inspection.json"), "utf-8")) as { controllerRecoveryInspection: { status: string; unledgeredActionCount: number; lastCheckpoint: { checkpointId: string } | null; lastInvocation: unknown | null; lastSnapshot: { snapshotId: string; reason: string } | null; recommendedCommand: string } };

      expect(recovery.controllerRecoveryInspection.status).toBe("possible_interruption");
      expect(recovery.controllerRecoveryInspection.unledgeredActionCount).toBe(1);
      expect(recovery.controllerRecoveryInspection.lastCheckpoint?.checkpointId).toBeTruthy();
      expect(recovery.controllerRecoveryInspection.lastInvocation).toBeNull();
      expect(recovery.controllerRecoveryInspection.lastSnapshot?.snapshotId).toBeTruthy();
      expect(recovery.controllerRecoveryInspection.lastSnapshot?.reason).toBe("before_step_intake");
      expect(recovery.controllerRecoveryInspection.recommendedCommand).toMatch(/--max-steps 4/);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("surfaces feasibility verdict evidence to controller inspection", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "agenteer-controller-tool-feasibility-"));
    try {
      const data = await writeLinearCsv(path.join(dir, "rows.csv"), 70);
      const state = await researchControllerRunCommand({
        question: "Is x associated with y?",
        outDir: path.join(dir, "run"),
        dataPath: data,
        method: "linear-regression",
        outcome: "y",
        exposure: "x",
        maxSteps: 2,
      });

      const inspected = await researchControllerToolCommand({
        statePath: state.state.statePath,
        request: {
          toolId: "controller-inspect",
          args: [],
          reason: "Verify feasibility verdict is visible to controller inspection.",
        },
      });

      expect(inspected.toolActions[0]?.inspection?.checks).toEqual(expect.arrayContaining([
        expect.objectContaining({ id: "feasibility-verdict-present", status: "pass" }),
        expect.objectContaining({ id: "feasibility-verdict-status", status: "pass" }),
      ]));
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("reads bounded previews of controller-owned artifacts for model/manual review", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "agenteer-controller-read-artifact-"));
    try {
      const data = await writeLinearCsv(path.join(dir, "rows.csv"), 70);
      const result = await researchControllerRunCommand({
        question: "Is x associated with y?",
        outDir: path.join(dir, "run"),
        dataPath: data,
        method: "linear-regression",
        outcome: "y",
        exposure: "x",
        maxSteps: 8,
      });

      const read = await researchControllerToolCommand({
        statePath: result.state.statePath,
        request: {
          toolId: "controller-read-artifact",
          args: ["stats-qa"],
          reason: "Read stats QA before deciding whether the run needs repair.",
        },
      });

      expect(read.toolActions.at(-1)?.status).toBe("succeeded");
      expect(read.toolActions.at(-1)?.command).toBeNull();
      const stdoutPath = read.toolActions.at(-1)?.stdoutPath;
      expect(stdoutPath).toBeTruthy();
      const stdout = JSON.parse(await readFile(stdoutPath as string, "utf-8")) as { controllerArtifactRead: { status: string; artifact: { kind: string }; contentPreview: string; truncated: boolean } };
      expect(stdout.controllerArtifactRead.status).toBe("found");
      expect(stdout.controllerArtifactRead.artifact.kind).toBe("stats-qa");
      expect(stdout.controllerArtifactRead.contentPreview).toContain("checks");
      expect(stdout.controllerArtifactRead.contentPreview).toContain("execution-status");
      expect(stdout.controllerArtifactRead.truncated).toBe(false);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("reads and searches bounded repository context as controller tools", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "agenteer-controller-repo-context-"));
    try {
      const state = await researchControllerInitCommand({
        question: "Can the controller inspect implementation context before changing code?",
        outDir: dir,
        method: "linear-regression",
        outcome: "outcome",
        exposure: "exposure",
      });

      const searched = await researchControllerToolCommand({
        statePath: state.statePath,
        request: {
          toolId: "controller-search-repo",
          args: ["ControllerToolExecution", "packages/cli/src/research-machine/controller.ts"],
          reason: "Find controller tool execution definitions before proposing a change.",
        },
      });
      expect(searched.toolActions.at(-1)?.status).toBe("succeeded");
      expect(searched.artifacts.map(artifact => artifact.kind)).toContain("controller-repo-search");
      const searchStdout = JSON.parse(await readFile(searched.toolActions.at(-1)?.stdoutPath ?? "", "utf-8")) as { controllerRepoSearch: { status: string; matches: Array<{ path: string; lineNumber: number; linePreview: string }>; searchedFiles: number; truncated: boolean } };
      expect(searchStdout.controllerRepoSearch.status).toBe("found");
      expect(searchStdout.controllerRepoSearch.searchedFiles).toBeGreaterThan(0);
      expect(searchStdout.controllerRepoSearch.matches[0]?.path).toBe("packages/cli/src/research-machine/controller.ts");
      expect(searchStdout.controllerRepoSearch.matches[0]?.linePreview).toMatch(/ControllerToolExecution/);

      const read = await researchControllerToolCommand({
        statePath: searched.statePath,
        request: {
          toolId: "controller-read-file",
          args: ["packages/cli/src/research-machine/controller.ts"],
          reason: "Read bounded controller source preview after search.",
        },
      });
      expect(read.toolActions.at(-1)?.status).toBe("succeeded");
      expect(read.artifacts.map(artifact => artifact.kind)).toContain("controller-repo-file-read");
      const readStdout = JSON.parse(await readFile(read.toolActions.at(-1)?.stdoutPath ?? "", "utf-8")) as { controllerRepoFileRead: { status: string; relativePath: string; contentPreview: string; sha256: string | null; truncated: boolean } };
      expect(readStdout.controllerRepoFileRead.status).toBe("found");
      expect(readStdout.controllerRepoFileRead.relativePath).toBe("packages/cli/src/research-machine/controller.ts");
      expect(readStdout.controllerRepoFileRead.sha256).toBeTruthy();
      expect(readStdout.controllerRepoFileRead.contentPreview).toContain("controllerToolIdSchema");

      const catalog = await researchControllerToolCommand({
        statePath: read.statePath,
        request: {
          toolId: "controller-run-agenteer",
          args: ["research", "methods-catalog", "--json"],
          reason: "Inspect the read-only methods catalog through the bounded Agenteer tool.",
        },
      });
      expect(catalog.toolActions.at(-1)?.status).toBe("succeeded");
      expect(catalog.artifacts.map(artifact => artifact.kind)).toContain("controller-agenteer-command");
      const catalogStdout = JSON.parse(await readFile(catalog.toolActions.at(-1)?.stdoutPath ?? "", "utf-8")) as { controllerAgenteerCommand: { status: string; command: { args: string[] }; stdoutPreview: string; exitCode: number | null } };
      expect(catalogStdout.controllerAgenteerCommand.status).toBe("passed");
      expect(catalogStdout.controllerAgenteerCommand.command.args.join(" ")).toContain("research methods-catalog --json");
      expect(catalogStdout.controllerAgenteerCommand.exitCode).toBe(0);
      expect(catalogStdout.controllerAgenteerCommand.stdoutPreview).toContain("methods");

      const statusCommand = await researchControllerToolCommand({
        statePath: catalog.statePath,
        request: {
          toolId: "controller-run-agenteer",
          args: ["research", "controller-status", "--state", catalog.statePath, "--json"],
          reason: "Refresh first-read status through the read-only Agenteer introspection allowlist.",
        },
      });
      expect(statusCommand.toolActions.at(-1)?.status).toBe("succeeded");
      const statusStdout = JSON.parse(await readFile(statusCommand.toolActions.at(-1)?.stdoutPath ?? "", "utf-8")) as { controllerAgenteerCommand: { status: string; command: { args: string[] }; stdoutPreview: string; exitCode: number | null } };
      expect(statusStdout.controllerAgenteerCommand.status).toBe("passed");
      expect(statusStdout.controllerAgenteerCommand.command.args.join(" ")).toContain("research controller-status --state");
      expect(statusStdout.controllerAgenteerCommand.stdoutPreview).toContain("controllerStatus");

      const wrongStateCommand = await researchControllerToolCommand({
        statePath: statusCommand.statePath,
        request: {
          toolId: "controller-run-agenteer",
          args: ["research", "controller-status", "--state", path.join(dir, "other-controller-state.json"), "--json"],
          reason: "A different controller state path must not be introspected through the bounded tool.",
        },
      });
      expect(wrongStateCommand.toolActions.at(-1)?.status).toBe("rejected");
      expect(wrongStateCommand.toolActions.at(-1)?.validationReasons.join(" ")).toMatch(/current controller --state path|safe scalar/);

      const unsafeCommand = await researchControllerToolCommand({
        statePath: wrongStateCommand.statePath,
        request: {
          toolId: "controller-run-agenteer",
          args: ["research", "stats-run", "--method", "linear-regression"],
          reason: "Mutation/execution commands should not run through read-only introspection.",
        },
      });
      expect(unsafeCommand.toolActions.at(-1)?.status).toBe("rejected");
      expect(unsafeCommand.toolActions.at(-1)?.validationReasons.join(" ")).toMatch(/not allowlisted|read-only/);
      expect(unsafeCommand.toolActions.at(-1)?.stdoutPath).toBeNull();

      const escaped = await researchControllerToolCommand({
        statePath: unsafeCommand.statePath,
        request: {
          toolId: "controller-read-file",
          args: ["../env_file"],
          reason: "Traversal should be rejected before any file read.",
        },
      });
      expect(escaped.toolActions.at(-1)?.status).toBe("rejected");
      expect(escaped.toolActions.at(-1)?.validationReasons.join(" ")).toMatch(/parent traversal|absolute paths|flags/);
      expect(escaped.toolActions.at(-1)?.stdoutPath).toBeNull();
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("captures bounded git diffs and non-applying source patch proposals as controller tools", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "agenteer-controller-source-tools-"));
    try {
      const state = await researchControllerInitCommand({
        question: "Can the controller propose a safe implementation change?",
        outDir: dir,
        method: "linear-regression",
        outcome: "outcome",
        exposure: "exposure",
      });

      const diffed = await researchControllerToolCommand({
        statePath: state.statePath,
        request: {
          toolId: "controller-git-diff",
          args: [],
          reason: "Inspect current source diff before proposing implementation work.",
        },
      });
      expect(diffed.toolActions.at(-1)?.status).toBe("succeeded");
      expect(diffed.artifacts.map(artifact => artifact.kind)).toContain("controller-git-diff");
      const diffStdout = JSON.parse(await readFile(diffed.toolActions.at(-1)?.stdoutPath ?? "", "utf-8")) as { controllerGitDiff: { repoRoot: string; changedFiles: string[]; diffPreview: string } };
      expect(diffStdout.controllerGitDiff.repoRoot).toContain("agenteer");
      expect(Array.isArray(diffStdout.controllerGitDiff.changedFiles)).toBe(true);

      const proposalJson = JSON.stringify({
        summary: "Add a documentation sentence in a bounded patch proposal.",
        risk: "low",
        changes: [{
          path: "docs/research-controller.md",
          rationale: "Document the controller source-patch proposal capability.",
          diff: "--- a/docs/research-controller.md\n+++ b/docs/research-controller.md\n@@ proposal @@\n+Controller patch proposals are validated before application.\n",
        }],
        tests: ["npm run build", "npm test -- packages/cli/tests/research-controller.test.ts"],
      });
      const proposed = await researchControllerToolCommand({
        statePath: diffed.statePath,
        request: {
          toolId: "controller-propose-patch",
          args: [proposalJson],
          reason: "Persist a non-applying source patch proposal for review.",
        },
      });
      expect(proposed.toolActions.at(-1)?.status).toBe("succeeded");
      expect(proposed.artifacts.map(artifact => artifact.kind)).toContain("controller-source-patch-proposal");
      const proposalStdout = JSON.parse(await readFile(proposed.toolActions.at(-1)?.stdoutPath ?? "", "utf-8")) as { controllerSourcePatchProposal: { status: string; changes: Array<{ path: string; diffHash: string }>; outPath: string; reportPath: string } };
      expect(proposalStdout.controllerSourcePatchProposal.status).toBe("valid");
      expect(proposalStdout.controllerSourcePatchProposal.changes[0]?.path).toBe("docs/research-controller.md");
      expect(proposalStdout.controllerSourcePatchProposal.changes[0]?.diffHash).toBeTruthy();
      expect(await fileExists(proposalStdout.controllerSourcePatchProposal.outPath)).toBe(true);
      expect(await fileExists(proposalStdout.controllerSourcePatchProposal.reportPath)).toBe(true);

      const escaped = await researchControllerToolCommand({
        statePath: proposed.statePath,
        request: {
          toolId: "controller-propose-patch",
          args: [JSON.stringify({
            summary: "Unsafe escape attempt",
            risk: "high",
            changes: [{ path: "../outside.ts", rationale: "Should be blocked.", diff: "bad" }],
            tests: [],
          })],
          reason: "Unsafe proposal should fail validation.",
        },
      });
      expect(escaped.toolActions.at(-1)?.status).toBe("failed");
      const escapedStdout = JSON.parse(await readFile(escaped.toolActions.at(-1)?.stdoutPath ?? "", "utf-8")) as { controllerSourcePatchProposal: { status: string; validationReasons: string[] } };
      expect(escapedStdout.controllerSourcePatchProposal.status).toBe("invalid");
      expect(escapedStdout.controllerSourcePatchProposal.validationReasons.join(" ")).toMatch(/outside repository root|parent traversal|path/);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("applies reviewed full-file source patch proposals with hash checks and backups", async () => {
    const repoRoot = process.cwd();
    const testRoot = path.join(repoRoot, ".loop-memory", `controller-apply-test-${Date.now()}`);
    const runDir = path.join(testRoot, "run");
    const targetRel = path.relative(repoRoot, path.join(testRoot, "fixture.txt"));
    const targetPath = path.join(repoRoot, targetRel);
    try {
      await mkdir(testRoot, { recursive: true });
      await writeFile(targetPath, "before\n");
      const state = await researchControllerInitCommand({
        question: "Can the controller apply a reviewed implementation proposal?",
        outDir: runDir,
        method: "linear-regression",
        outcome: "outcome",
        exposure: "exposure",
      });
      const proposed = await researchControllerToolCommand({
        statePath: state.statePath,
        request: {
          toolId: "controller-propose-patch",
          args: [JSON.stringify({
            summary: "Replace fixture content through a reviewed controller patch.",
            risk: "low",
            changes: [{
              path: targetRel,
              rationale: "Exercise the apply gate without touching project source files.",
              after: "after\n",
            }],
            tests: ["npm run build"],
          })],
          reason: "Persist a full-file source patch proposal for apply-gate testing.",
        },
      });
      expect(proposed.toolActions.at(-1)?.status).toBe("succeeded");

      const applied = await researchControllerToolCommand({
        statePath: proposed.statePath,
        request: {
          toolId: "controller-apply-patch",
          args: ["latest"],
          reason: "Apply the reviewed low-risk full-file patch proposal.",
        },
      });
      expect(applied.toolActions.at(-1)?.status).toBe("succeeded");
      expect(await readFile(targetPath, "utf-8")).toBe("after\n");
      expect(applied.artifacts.map(artifact => artifact.kind)).toEqual(expect.arrayContaining([
        "controller-source-patch-apply",
        "controller-source-patch-apply-record",
        "controller-source-patch-apply-report",
        "controller-git-diff-after-apply",
      ]));
      const applyStdout = JSON.parse(await readFile(applied.toolActions.at(-1)?.stdoutPath ?? "", "utf-8")) as { controllerSourcePatchApply: { status: string; appliedChanges: Array<{ status: string; backupPath: string | null; beforeHash: string | null; afterHash: string | null }>; diffSnapshotPath: string | null } };
      expect(applyStdout.controllerSourcePatchApply.status).toBe("applied");
      expect(applyStdout.controllerSourcePatchApply.appliedChanges[0]?.status).toBe("applied");
      expect(applyStdout.controllerSourcePatchApply.appliedChanges[0]?.backupPath).toBeTruthy();
      expect(applyStdout.controllerSourcePatchApply.appliedChanges[0]?.beforeHash).toBeTruthy();
      expect(applyStdout.controllerSourcePatchApply.appliedChanges[0]?.afterHash).toBeTruthy();
      expect(await fileExists(applyStdout.controllerSourcePatchApply.diffSnapshotPath ?? "")).toBe(true);

      const verified = await researchControllerToolCommand({
        statePath: applied.statePath,
        request: {
          toolId: "controller-verify-patch",
          args: ["latest"],
          reason: "Run the verification commands declared by the applied patch.",
        },
      });
      expect(verified.toolActions.at(-1)?.status).toBe("succeeded");
      expect(verified.artifacts.map(artifact => artifact.kind)).toEqual(expect.arrayContaining([
        "controller-source-patch-verification",
        "controller-source-patch-verification-record",
        "controller-source-patch-verification-report",
        "controller-git-diff-after-verification",
      ]));
      const verifyStdout = JSON.parse(await readFile(verified.toolActions.at(-1)?.stdoutPath ?? "", "utf-8")) as { controllerSourcePatchVerification: { status: string; commands: Array<{ command: string; status: string }>; diffSnapshotPath: string | null } };
      expect(verifyStdout.controllerSourcePatchVerification.status).toBe("passed");
      expect(verifyStdout.controllerSourcePatchVerification.commands[0]?.command).toBe("npm run build");
      expect(verifyStdout.controllerSourcePatchVerification.commands[0]?.status).toBe("passed");
      expect(await fileExists(verifyStdout.controllerSourcePatchVerification.diffSnapshotPath ?? "")).toBe(true);

      const rolledBack = await researchControllerToolCommand({
        statePath: verified.statePath,
        request: {
          toolId: "controller-rollback-patch",
          args: ["latest"],
          reason: "Rollback the applied patch after verification.",
        },
      });
      expect(rolledBack.toolActions.at(-1)?.status).toBe("succeeded");
      expect(await readFile(targetPath, "utf-8")).toBe("before\n");
      expect(rolledBack.artifacts.map(artifact => artifact.kind)).toEqual(expect.arrayContaining([
        "controller-source-patch-rollback",
        "controller-source-patch-rollback-record",
        "controller-source-patch-rollback-report",
        "controller-git-diff-after-rollback",
      ]));
      const rollbackStdout = JSON.parse(await readFile(rolledBack.toolActions.at(-1)?.stdoutPath ?? "", "utf-8")) as { controllerSourcePatchRollback: { status: string; restoredChanges: Array<{ status: string }>; diffSnapshotPath: string | null } };
      expect(rollbackStdout.controllerSourcePatchRollback.status).toBe("rolled_back");
      expect(rollbackStdout.controllerSourcePatchRollback.restoredChanges[0]?.status).toBe("restored");
      expect(await fileExists(rollbackStdout.controllerSourcePatchRollback.diffSnapshotPath ?? "")).toBe(true);

      const staleProposal = await researchControllerToolCommand({
        statePath: rolledBack.statePath,
        request: {
          toolId: "controller-propose-patch",
          args: [JSON.stringify({
            summary: "Create a stale proposal.",
            risk: "low",
            changes: [{
              path: targetRel,
              rationale: "This should become stale after manual mutation.",
              after: "stale-after\n",
            }],
            tests: [],
          })],
          reason: "Persist a proposal that will be invalidated before apply.",
        },
      });
      await writeFile(targetPath, "manual-drift\n");
      const staleApply = await researchControllerToolCommand({
        statePath: staleProposal.statePath,
        request: {
          toolId: "controller-apply-patch",
          args: ["latest"],
          reason: "Stale proposal should fail before-hash validation.",
        },
      });
      expect(staleApply.toolActions.at(-1)?.status).toBe("failed");
      const staleStdout = JSON.parse(await readFile(staleApply.toolActions.at(-1)?.stdoutPath ?? "", "utf-8")) as { controllerSourcePatchApply: { status: string; appliedChanges: Array<{ status: string; reason: string }> } };
      expect(staleStdout.controllerSourcePatchApply.status).toBe("failed");
      expect(staleStdout.controllerSourcePatchApply.appliedChanges[0]?.status).toBe("failed");
      expect(staleStdout.controllerSourcePatchApply.appliedChanges[0]?.reason).toMatch(/beforeHash/);
      expect(await readFile(targetPath, "utf-8")).toBe("manual-drift\n");
    } finally {
      await rm(testRoot, { recursive: true, force: true });
    }
  });

  it("rejects controller artifact reads outside recorded controller artifacts", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "agenteer-controller-read-reject-"));
    try {
      const state = await researchControllerInitCommand({
        question: "Is exposure associated with outcome?",
        outDir: dir,
        method: "linear-regression",
        outcome: "outcome",
        exposure: "exposure",
      });

      const result = await researchControllerToolCommand({
        statePath: state.statePath,
        request: {
          toolId: "controller-read-artifact",
          args: ["../secret.txt"],
          reason: "Unsafe traversal should be rejected.",
        },
      });

      expect(result.toolActions.at(-1)?.status).toBe("rejected");
      expect(result.toolActions.at(-1)?.validationReasons.join(" ")).toMatch(/parent traversal/);
      expect(result.currentStage).toBe("intake");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("surfaces prior artifact-read tool results to the next model-controller prompt", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "agenteer-controller-tool-result-prompt-"));
    try {
      const data = await writeLinearCsv(path.join(dir, "rows.csv"), 70);
      let state = await researchControllerInitCommand({
        question: "Is x associated with y?",
        outDir: path.join(dir, "run"),
        dataPath: data,
        method: "linear-regression",
        outcome: "y",
        exposure: "x",
      });
      for (let i = 0; i < 5; i += 1) state = await researchControllerStepCommand({ statePath: state.statePath });

      expect(state.currentStage).toBe("qa");
      state.policy.controller.enabled = true;
      await writeFile(state.statePath, `${JSON.stringify({ schemaVersion: 1, controllerState: state }, null, 2)}\n`);
      await researchControllerToolCommand({
        statePath: state.statePath,
        request: {
          toolId: "controller-read-artifact",
          args: ["stats-qa"],
          reason: "Read stats QA before the QA decision.",
        },
      });

      const prompts: string[] = [];
      const fetchImpl = async (_url: string | URL | Request, init?: RequestInit) => {
        const body = JSON.parse(String(init?.body ?? "{}")) as { messages?: Array<{ role: string; content: string }> };
        const user = body.messages?.find(message => message.role === "user")?.content;
        if (user) prompts.push(user);
        return new Response(JSON.stringify({
          choices: [{ message: { content: JSON.stringify({ action: "method_qa", rationale: "Use the observed stats QA artifact to continue method QA.", confidence: 0.9, riskFlags: [] }) } }],
        }), { status: 200, headers: { "content-type": "application/json" } });
      };

      await researchControllerStepCommand({
        statePath: state.statePath,
        env: { OPENAI_API_KEY: "test-key" } as NodeJS.ProcessEnv,
        fetchImpl: fetchImpl as typeof fetch,
      });

      expect(prompts).toHaveLength(1);
      expect(prompts[0]).toContain("\"bundleId\": \"controller_decision_context_");
      expect(prompts[0]).toContain("\"workPlan\"");
      expect(prompts[0]).toContain("\"recentToolResults\"");
      expect(prompts[0]).toContain("\"toolId\": \"controller-read-artifact\"");
      expect(prompts[0]).toContain("\"artifactKind\": \"stats-qa\"");
      expect(prompts[0]).toContain("execution-status");
      expect(prompts[0]).toContain("do not request the same artifact again");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("includes feasibility verdict contents in model-controller prompts after data feasibility", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "agenteer-controller-model-feasibility-"));
    try {
      const data = path.join(dir, "rows.csv");
      const lines = ["y,x,bmi"];
      for (let i = 0; i < 70; i += 1) lines.push(`${i * 2 + 1},${i + 1},${70 + (i % 12)}`);
      await writeFile(data, `${lines.join("\n")}\n`);
      const userPrompts: string[] = [];
      const fetchImpl = async (_url: string | URL | Request, init?: RequestInit) => {
        const body = JSON.parse(String(init?.body ?? "{}")) as { messages?: Array<{ role: string; content: string }> };
        const user = body.messages?.find(message => message.role === "user")?.content;
        if (user) userPrompts.push(user);
        const action = userPrompts.length === 1 ? "initialize" : userPrompts.length === 2 ? "table_summary" : "explore";
        return new Response(JSON.stringify({
          choices: [{ message: { content: JSON.stringify({ action, rationale: "Use the allowed controller action.", confidence: 0.9, riskFlags: [] }) } }],
        }), { status: 200, headers: { "content-type": "application/json" } });
      };

      const result = await researchControllerRunCommand({
        question: "Is x associated with y?",
        outDir: path.join(dir, "run"),
        dataPath: data,
        method: "linear-regression",
        outcome: "y",
        exposure: "x",
        controller: { enabled: true, provider: "openai", model: "gpt-5.4" },
        env: { OPENAI_API_KEY: "test-key" } as NodeJS.ProcessEnv,
        fetchImpl: fetchImpl as typeof fetch,
        maxSteps: 3,
      });

      expect(result.state.decisions.map(decision => decision.source)).toEqual(["model", "model", "model"]);
      expect(userPrompts).toHaveLength(3);
      const thirdPrompt = userPrompts[2] ?? "";
      expect(thirdPrompt).toContain("\"feasibility\"");
      expect(thirdPrompt).toContain("\"status\": \"pass\"");
      expect(thirdPrompt).toContain("\"datasetSemanticAudit\"");
      expect(thirdPrompt).toContain("\"selectedRoleStatus\": \"pass\"");
      expect(thirdPrompt).toContain("\"status\": \"warning\"");
      expect(thirdPrompt).toContain("IMPLAUSIBLE_BMI_MEAN");
      expect(thirdPrompt).toContain("If feasibility.status is block");
      expect(thirdPrompt).toContain("If datasetSemanticAudit.selectedRoleStatus is block");
      expect(result.state.artifacts.map(artifact => artifact.kind)).toContain("controller-decision-context");
      const contextPath = result.state.artifacts.filter(artifact => artifact.kind === "controller-decision-context").at(-1)?.path;
      const context = JSON.parse(await readFile(contextPath ?? "", "utf-8")) as { controllerDecisionContext: { feasibility: { status: string }; datasetSemanticAudit: { present: boolean; status: string; selectedRoleStatus: string; topIssues: Array<{ code: string; selected: boolean }> }; issueLedger: { present: boolean; status: string | null }; workPlan: { present: boolean }; allowedActions: string[] } };
      expect(context.controllerDecisionContext.feasibility.status).toBe("pass");
      expect(context.controllerDecisionContext.datasetSemanticAudit.present).toBe(true);
      expect(context.controllerDecisionContext.datasetSemanticAudit.status).toBe("warning");
      expect(context.controllerDecisionContext.datasetSemanticAudit.selectedRoleStatus).toBe("pass");
      expect(context.controllerDecisionContext.datasetSemanticAudit.topIssues).toEqual(expect.arrayContaining([
        expect.objectContaining({ code: "IMPLAUSIBLE_BMI_MEAN", selected: false }),
      ]));
      expect(context.controllerDecisionContext.issueLedger.present).toBe(true);
      expect(context.controllerDecisionContext.workPlan.present).toBe(true);
      expect(context.controllerDecisionContext.allowedActions).toContain("explore");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("rejects unsafe controller tool arguments without changing execution stage", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "agenteer-controller-tool-reject-"));
    try {
      const state = await researchControllerInitCommand({
        question: "Is exposure associated with outcome?",
        outDir: dir,
        method: "linear-regression",
        outcome: "outcome",
        exposure: "exposure",
      });

      const result = await researchControllerToolCommand({
        statePath: state.statePath,
        request: {
          toolId: "npm-build",
          args: ["--unsafe"],
          reason: "This should be rejected because npm-build accepts no caller-controlled args.",
        },
      });

      expect(result.toolActions).toHaveLength(1);
      expect(result.toolActions[0]?.status).toBe("rejected");
      expect(result.toolActions[0]?.validationReasons.join(" ")).toMatch(/does not accept caller-controlled args/);
      expect(result.currentStage).toBe("intake");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("blocks selected execution actions when pre-action readiness evidence is missing", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "agenteer-controller-readiness-block-"));
    try {
      const data = await writeLinearCsv(path.join(dir, "rows.csv"), 70);
      const initialized = await researchControllerInitCommand({
        question: "Is x associated with y?",
        outDir: path.join(dir, "run"),
        dataPath: data,
        method: "linear-regression",
        outcome: "y",
        exposure: "x",
      });
      const staleExecutionState: ControllerState = {
        ...initialized,
        currentStage: "execution",
        status: "running",
        completedStages: ["intake", "method_selection"],
        artifacts: [],
      };
      await writeFile(staleExecutionState.statePath, `${JSON.stringify({ schemaVersion: 1, controllerState: staleExecutionState }, null, 2)}\n`);

      const stepped = await researchControllerStepCommand({ statePath: staleExecutionState.statePath });
      const readinessPath = stepped.artifacts.find(artifact => artifact.kind === "controller-action-readiness")?.path;
      const readiness = JSON.parse(await readFile(readinessPath ?? "", "utf-8")) as { controllerActionReadiness: { status: string; checks: Array<{ id: string; status: string; message: string }> } };

      expect(stepped.status).toBe("needs_human_review");
      expect(stepped.currentStage).toBe("human_review");
      expect(stepped.actions.map(action => action.action)).not.toContain("run_analysis");
      const issueLedger = JSON.parse(await readFile(stepped.issueLedgers.at(-1)?.outPath ?? "", "utf-8")) as { controllerIssueLedger: { status: string; issues: Array<{ source: string; message: string }> } };
      expect(issueLedger.controllerIssueLedger.status).toBe("blocked");
      expect(issueLedger.controllerIssueLedger.issues.some(issue => issue.source.includes("readiness:run_analysis"))).toBe(true);
      expect(readiness.controllerActionReadiness.status).toBe("fail");
      expect(readiness.controllerActionReadiness.checks).toEqual(expect.arrayContaining([
        expect.objectContaining({ id: "feasibility-before-execution", status: "fail" }),
        expect.objectContaining({ id: "semantic-audit-before-execution", status: "fail" }),
      ]));
      expect(stepped.stopReason).toMatch(/failed pre-action readiness/i);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("pauses after model-proposed evidence tools so the next decision can use tool results", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "agenteer-controller-model-tool-"));
    try {
      const state = await researchControllerInitCommand({
        question: "Is x associated with y?",
        outDir: dir,
        method: "linear-regression",
        outcome: "y",
        exposure: "x",
        controller: { enabled: true, provider: "openai", model: "gpt-5.4" },
      });
      const fetchImpl = async () => new Response(JSON.stringify({
        choices: [{ message: { content: JSON.stringify({
          action: "initialize",
          rationale: "Inspect controller state, then initialize the pipeline.",
          confidence: 0.88,
          toolRequests: [{ toolId: "controller-inspect", args: [], reason: "Verify state integrity." }],
        }) } }],
      }), { status: 200, headers: { "content-type": "application/json" } });

      const stepped = await researchControllerStepCommand({
        statePath: state.statePath,
        env: { OPENAI_API_KEY: "test-key" } as NodeJS.ProcessEnv,
        fetchImpl: fetchImpl as typeof fetch,
      });

      expect(stepped.decisions[0]?.source).toBe("model");
      expect(stepped.decisions[0]?.toolValidation.status).toBe("valid");
      expect(stepped.toolActions).toHaveLength(1);
      expect(stepped.toolActions[0]?.request.toolId).toBe("controller-inspect");
      expect(stepped.actions).toHaveLength(0);
      expect(stepped.currentStage).toBe("intake");
      expect(stepped.nextRecommendedAction).toMatch(/recentToolResults/);

      const prompts: string[] = [];
      const nextFetch = async (_url: string | URL | Request, init?: RequestInit) => {
        const body = JSON.parse(String(init?.body ?? "{}")) as { messages?: Array<{ role: string; content: string }> };
        const user = body.messages?.find(message => message.role === "user")?.content;
        if (user) prompts.push(user);
        return new Response(JSON.stringify({
          choices: [{ message: { content: JSON.stringify({ action: "initialize", rationale: "Tool results are clean; initialize now.", confidence: 0.9 }) } }],
        }), { status: 200, headers: { "content-type": "application/json" } });
      };
      const resumed = await researchControllerStepCommand({
        statePath: state.statePath,
        env: { OPENAI_API_KEY: "test-key" } as NodeJS.ProcessEnv,
        fetchImpl: nextFetch as typeof fetch,
      });
      expect(prompts[0]).toContain("\"recentToolResults\"");
      expect(prompts[0]).toContain("\"toolId\":\"controller-status\"");
      expect(prompts[0]).toContain("controller-run-agenteer with args");
      expect(prompts[0]).toContain("\"research\",\"controller-status\",\"--state\"");
      expect(prompts[0]).toContain(state.statePath);
      expect(prompts[0]).toContain("\"toolId\": \"controller-inspect\"");
      expect(resumed.actions[0]?.action).toBe("initialize");
      expect(resumed.currentStage).toBe("method_selection");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("summarizes controller-status tool results for the next model decision", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "agenteer-controller-model-status-tool-"));
    try {
      const state = await researchControllerInitCommand({
        question: "Is x associated with y?",
        outDir: dir,
        method: "linear-regression",
        outcome: "y",
        exposure: "x",
        controller: { enabled: true, provider: "openai", model: "gpt-5.4" },
      });
      const statusFetch = async () => new Response(JSON.stringify({
        choices: [{ message: { content: JSON.stringify({
          action: "initialize",
          rationale: "Refresh first-read readiness before choosing the next action.",
          confidence: 0.86,
          toolRequests: [{ toolId: "controller-status", args: [], reason: "Refresh first-read controller status." }],
        }) } }],
      }), { status: 200, headers: { "content-type": "application/json" } });

      const first = await researchControllerStepCommand({
        statePath: state.statePath,
        env: { OPENAI_API_KEY: "test-key" } as NodeJS.ProcessEnv,
        fetchImpl: statusFetch as typeof fetch,
      });
      expect(first.toolActions.at(-1)?.request.toolId).toBe("controller-status");
      expect(first.toolActions.at(-1)?.status).toBe("succeeded");
      expect(first.actions).toHaveLength(0);
      expect(first.nextRecommendedAction).toMatch(/recentToolResults/);

      const prompts: string[] = [];
      const nextFetch = async (_url: string | URL | Request, init?: RequestInit) => {
        const body = JSON.parse(String(init?.body ?? "{}")) as { messages?: Array<{ role: string; content: string }> };
        const user = body.messages?.find(message => message.role === "user")?.content;
        if (user) prompts.push(user);
        return new Response(JSON.stringify({
          choices: [{ message: { content: JSON.stringify({ action: "initialize", rationale: "Status evidence is available; initialize now.", confidence: 0.9 }) } }],
        }), { status: 200, headers: { "content-type": "application/json" } });
      };
      const resumed = await researchControllerStepCommand({
        statePath: state.statePath,
        env: { OPENAI_API_KEY: "test-key" } as NodeJS.ProcessEnv,
        fetchImpl: nextFetch as typeof fetch,
      });

      expect(prompts[0]).toContain("\"recentToolResults\"");
      expect(prompts[0]).toContain("\"toolId\": \"controller-status\"");
      expect(prompts[0]).toContain("\"controllerStatus\"");
      expect(prompts[0]).toContain("\"activeBlockerIssueCodes\"");
      expect(prompts[0]).toContain("\"recommendedCommand\"");
      expect(prompts[0]).toContain("\"keyArtifactReports\"");
      expect(prompts[0]).toContain("\"statsQa\": null");
      expect(prompts[0]).toContain("JSON-only null report slots");
      expect(prompts[0]).toContain("controller-status ");
      expect(resumed.actions[0]?.action).toBe("initialize");
      expect(resumed.currentStage).toBe("method_selection");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("summarizes controller-run-agenteer controller-status output for the next model decision", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "agenteer-controller-model-agenteer-status-"));
    try {
      const state = await researchControllerInitCommand({
        question: "Is x associated with y?",
        outDir: dir,
        method: "linear-regression",
        outcome: "y",
        exposure: "x",
        controller: { enabled: true, provider: "openai", model: "gpt-5.4" },
      });
      const statusTool = await researchControllerToolCommand({
        statePath: state.statePath,
        request: {
          toolId: "controller-run-agenteer",
          args: ["research", "controller-status", "--state", state.statePath, "--json"],
          reason: "Refresh first-read status through the bounded Agenteer command adapter.",
        },
      });
      expect(statusTool.toolActions.at(-1)?.request.toolId).toBe("controller-run-agenteer");
      expect(statusTool.toolActions.at(-1)?.status).toBe("succeeded");

      const prompts: string[] = [];
      const fetchImpl = async (_url: string | URL | Request, init?: RequestInit) => {
        const body = JSON.parse(String(init?.body ?? "{}")) as { messages?: Array<{ role: string; content: string }> };
        const user = body.messages?.find(message => message.role === "user")?.content;
        if (user) prompts.push(user);
        return new Response(JSON.stringify({
          choices: [{ message: { content: JSON.stringify({ action: "initialize", rationale: "Bounded status evidence is available; initialize now.", confidence: 0.9 }) } }],
        }), { status: 200, headers: { "content-type": "application/json" } });
      };
      const stepped = await researchControllerStepCommand({
        statePath: statusTool.statePath,
        env: { OPENAI_API_KEY: "test-key" } as NodeJS.ProcessEnv,
        fetchImpl: fetchImpl as typeof fetch,
      });

      expect(prompts[0]).toContain("\"recentToolResults\"");
      expect(prompts[0]).toContain("\"toolId\": \"controller-run-agenteer\"");
      expect(prompts[0]).toContain("\"agenteerCommand\"");
      expect(prompts[0]).toContain("\"controllerStatus\"");
      expect(prompts[0]).toContain("\"activeBlockerIssueCodes\"");
      expect(prompts[0]).toContain("\"recommendedCommand\"");
      expect(prompts[0]).toContain("\"keyArtifactReports\"");
      expect(prompts[0]).toContain("\"statsQa\": null");
      expect(prompts[0]).toContain("JSON-only null report slots");
      expect(stepped.actions[0]?.action).toBe("initialize");
      expect(stepped.currentStage).toBe("method_selection");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("rejects repeated evidence tool requests at the same unchanged stage", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "agenteer-controller-model-tool-repeat-"));
    try {
      const state = await researchControllerInitCommand({
        question: "Is x associated with y?",
        outDir: dir,
        method: "linear-regression",
        outcome: "y",
        exposure: "x",
        controller: { enabled: true, provider: "openai", model: "gpt-5.4" },
      });
      const repeatedInspectResponse = async () => new Response(JSON.stringify({
        choices: [{ message: { content: JSON.stringify({
          action: "initialize",
          rationale: "Inspect again before doing anything.",
          confidence: 0.78,
          toolRequests: [{ toolId: "controller-inspect", args: [], reason: "Repeat the same inspection." }],
        }) } }],
      }), { status: 200, headers: { "content-type": "application/json" } });

      const first = await researchControllerStepCommand({
        statePath: state.statePath,
        env: { OPENAI_API_KEY: "test-key" } as NodeJS.ProcessEnv,
        fetchImpl: repeatedInspectResponse as typeof fetch,
      });
      expect(first.status).toBe("running");
      expect(first.currentStage).toBe("intake");
      expect(first.toolActions).toHaveLength(1);
      expect(first.actions).toHaveLength(0);

      const repeated = await researchControllerStepCommand({
        statePath: state.statePath,
        env: { OPENAI_API_KEY: "test-key" } as NodeJS.ProcessEnv,
        fetchImpl: repeatedInspectResponse as typeof fetch,
      });
      expect(repeated.status).toBe("needs_human_review");
      expect(repeated.currentStage).toBe("human_review");
      expect(repeated.stopReason).toMatch(/Repeated evidence tool request/);
      expect(repeated.actions).toHaveLength(0);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

async function writeLinearCsv(file: string, rows: number): Promise<string> {
  await mkdir(path.dirname(file), { recursive: true });
  const lines = ["y,x,age"];
  for (let i = 1; i <= rows; i += 1) lines.push(`${i * 2 + 1},${i},${20 + (i % 60)}`);
  await writeFile(file, `${lines.join("\n")}\n`);
  return file;
}

async function writeSkewedTwoGroupCsv(file: string): Promise<string> {
  await mkdir(path.dirname(file), { recursive: true });
  const lines = ["los_days,procedure_group,age"];
  for (let i = 0; i < 48; i += 1) {
    const los = 1 + (i % 5);
    lines.push(`${los},A,${50 + (i % 20)}`);
  }
  for (let i = 0; i < 48; i += 1) {
    const los = 2 + (i % 5);
    lines.push(`${los},B,${52 + (i % 18)}`);
  }
  for (const los of [55, 62, 70, 81, 95, 120]) {
    lines.push(`${los},B,67`);
  }
  await writeFile(file, `${lines.join("\n")}\n`);
  return file;
}

async function writeSurvivalCsv(file: string, rows: number): Promise<string> {
  await mkdir(path.dirname(file), { recursive: true });
  const lines = ["followup_days,death,treatment,age"];
  for (let i = 0; i < rows; i += 1) {
    const treatment = i % 2;
    const age = 50 + (i % 35);
    const followup = 30 + i * 4 + treatment * 12;
    const death = i % 5 === 0 || (treatment === 1 && i % 7 === 0) ? 1 : 0;
    lines.push(`${followup},${death},${treatment},${age}`);
  }
  await writeFile(file, `${lines.join("\n")}\n`);
  return file;
}

async function writeDiagnosticThresholdCsv(file: string, rows: number): Promise<string> {
  await mkdir(path.dirname(file), { recursive: true });
  const lines = ["hba1c_pct,waist_cm"];
  for (let i = 0; i < rows; i += 1) {
    const elevated = i % 3 === 0 || i % 11 === 0;
    const hba1c = elevated ? 6.7 + (i % 5) * 0.08 : 5.4 + (i % 7) * 0.08;
    const waist = elevated ? 103 + (i % 12) : 84 + (i % 18);
    lines.push(`${hba1c.toFixed(2)},${waist.toFixed(1)}`);
  }
  await writeFile(file, `${lines.join("\n")}\n`);
  return file;
}

async function writePoissonOffsetCsv(file: string, rows: number): Promise<string> {
  await mkdir(path.dirname(file), { recursive: true });
  const lines = ["count,treatment,person_time"];
  for (let i = 0; i < rows; i += 1) {
    const treatment = i % 2;
    const personTime = 0.75 + (i % 7) * 0.35;
    const baseRate = treatment ? 0.95 : 0.45;
    const seasonal = i % 11 === 0 ? 1 : 0;
    const count = Math.max(0, Math.round(personTime * baseRate + seasonal));
    lines.push(`${count},${treatment},${personTime.toFixed(3)}`);
  }
  await writeFile(file, `${lines.join("\n")}\n`);
  return file;
}

async function writeRecurrentEventCsv(file: string, subjects: number): Promise<string> {
  await mkdir(path.dirname(file), { recursive: true });
  const lines = ["subject,start,stop,event,arm,severity"];
  for (let subject = 1; subject <= subjects; subject += 1) {
    const arm = subject % 2;
    const severity = 0.2 + (subject % 9) * 0.08 + arm * 0.12;
    for (let interval = 0; interval < 3; interval += 1) {
      const start = interval * 1.5;
      const stop = start + 1.2 + (subject % 5) * 0.03;
      const event = ((subject + interval * 4) % (arm ? 5 : 8) === 0 || (arm === 1 && interval === 2 && subject % 9 === 0)) ? 1 : 0;
      lines.push(`${subject},${start.toFixed(2)},${stop.toFixed(2)},${event},${arm},${severity.toFixed(3)}`);
    }
  }
  await writeFile(file, `${lines.join("\n")}\n`);
  return file;
}

async function writeUngroupedSurvivalCsv(file: string, rows: number): Promise<string> {
  await mkdir(path.dirname(file), { recursive: true });
  const lines = ["followup_days,death,age"];
  for (let i = 0; i < rows; i += 1) {
    const age = 50 + (i % 35);
    const followup = 30 + i * 4;
    const death = i % 5 === 0 ? 1 : 0;
    lines.push(`${followup},${death},${age}`);
  }
  await writeFile(file, `${lines.join("\n")}\n`);
  return file;
}

async function fileExists(file: string): Promise<boolean> {
  try {
    await readFile(file);
    return true;
  } catch {
    return false;
  }
}

async function writeFakeContextBin(file: string, mode: "ready" | "missing"): Promise<string> {
  await writeFile(file, `#!/usr/bin/env node
const mode = ${JSON.stringify(mode)};
const cmd = process.argv[2];
if (cmd === "status") {
  console.log(JSON.stringify(mode === "missing"
    ? { ok: true, status: "missing", freshness: 0, message: "structured context missing" }
    : { ok: true, status: "ready", freshness: 1, message: "context ready" }));
} else if (cmd === "pack") {
  console.log(JSON.stringify(mode === "missing"
    ? { ok: true, status: "missing", items: [], text: "" }
    : { ok: true, status: "ready", items: [{ path: "src/index.ts", score: 0.9, content: "planner repair context" }], text: "planner repair context" }));
} else if (cmd === "impact") {
  console.log(JSON.stringify({ ok: true, status: mode === "missing" ? "missing" : "ready", risk: mode === "missing" ? "unknown" : "low", targets: process.argv.slice(3) }));
} else if (cmd === "verify") {
  console.log(JSON.stringify({ ok: true, status: mode === "missing" ? "missing" : "pass" }));
} else {
  console.log(JSON.stringify({ ok: true, status: "noop" }));
}
`);
  await chmod(file, 0o755);
  return file;
}

function mockLiteratureSearch() {
  return {
    schemaVersion: 1,
    generatedAtIso: "2026-05-22T00:00:00.000Z",
    searchId: "medbrevia_lit_controller_test",
    provider: "medbrevia-search",
    status: "succeeded",
    request: {
      question: "Is exposure associated with outcome?",
      baseUrl: "http://localhost:3000/",
      endpoint: "/api/search",
      responseDepth: "standard",
      dateRange: "5y",
      highImpact: false,
      prefersList: true,
      topK: 5,
      timeoutMs: 120000,
      authMode: "api-key",
    },
    evidenceSummary: {
      sourceCount: 4,
      pubmedCount: 4,
      trialCount: 0,
      guidelineCount: 0,
      nonPubmedLaneCount: 0,
      highQualitySourceCount: 3,
      latestPublicationYear: 2025,
      plannedSearchCount: 1,
      selectedPmidCount: 2,
      briefingAvailable: true,
    },
    plannedSearches: ["exposure outcome association observational cohort"],
    qHash: "controller-test",
    briefingText: "Recent observational cohort evidence discusses exposure and outcome association with regression methods.",
    sources: ["111", "222", "333", "444"].map((id, index) => ({
      id,
      sourceType: "pubmed",
      title: `Observational cohort study ${index + 1} of exposure and outcome association`,
      journal: "Test Journal",
      publicationDate: "2025-01-01",
      publicationYear: 2025,
      url: `https://pubmed.ncbi.nlm.nih.gov/${id}/`,
      abstract: "This observational cohort study evaluates association between exposure and outcome using regression and conservative interpretation.",
      snippet: "exposure outcome association regression cohort",
      evidenceType: ["Journal Article"],
      retrievalScore: 0.8,
      qualityScore: index < 3 ? 0.82 : 0.7,
      citationLabel: `PMID:${id}`,
      raw: {},
    })),
    events: [],
    warnings: [],
    errors: [],
    timings: null,
    retrievalDebug: null,
    outPath: null,
    reportPath: null,
  };
}
