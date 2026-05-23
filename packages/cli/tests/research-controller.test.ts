import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  researchControllerAgendaCommand,
  researchControllerAuditCommand,
  researchControllerCapabilitiesCommand,
  researchControllerCompletionAuditCommand,
  researchControllerDoctorCommand,
  researchControllerEnvironmentCommand,
  researchControllerFollowAgendaCommand,
  researchControllerFollowLoopCommand,
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
  researchControllerSupervisorCommand,
  researchControllerToolCommand,
  type ControllerState,
} from "../src/research-machine/controller.js";

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
      expect(await fileExists(audit.reportPath)).toBe(true);

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
      expect(blockedAudit.nextCommand).toMatch(/controller-patch|controller-inspect/);
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
      expect(await fileExists(preflight.reportPath)).toBe(true);
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

      expect(manifest.defaultControllerModel).toBe("openai:gpt-5.4");
      expect(manifest.controllerCommands).toEqual(expect.arrayContaining([
        "controller-run",
        "run-autonomous",
        "controller-follow-loop",
        "controller-audit",
        "controller-capabilities",
      ]));
      expect(byId.get("persistent_state_machine")?.status).toBe("covered");
      expect(byId.get("default_gpt54_controller_model")?.status).toBe("covered");
      expect(byId.get("execution_agenda")?.commands.join(" ")).toContain("controller-follow-loop");
      expect(byId.get("operator_audit")?.commands.join(" ")).toContain("controller-audit");
      expect(byId.get("dataset_feasibility")?.status).toBe("not_applicable");
      expect(byId.get("external_reviewer_panel")?.status).toBe("not_applicable");
      expect(byId.get("method_selection_and_modeling_plan")?.testRefs).toContain("packages/cli/tests/research-controller.test.ts");
      expect(manifest.summary.covered).toBeGreaterThan(0);
      expect(await fileExists(manifest.reportPath)).toBe(true);
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
      expect(byId.get("doctor_driven_autonomous_operation")?.status).toMatch(/partial|proved|missing/);
      expect(byId.get("doctor_driven_autonomous_operation")?.nextAction).toContain("controller-operate");
      expect(byId.get("default_gpt54_model_control")?.status).toBe("proved");
      expect(byId.get("implementation_change_loop")?.status).toMatch(/partial|proved|missing/);
      expect(byId.get("documented_and_tested_public_surface")?.evidenceRefs).toEqual(expect.arrayContaining([
        "docs/research-controller.md",
        "packages/cli/tests/research-controller.test.ts",
      ]));
      expect(audit.operatorAuditPath).toMatch(/controller_operator_audit/);
      expect(audit.capabilityManifestPath).toMatch(/controller_capabilities/);
      expect(audit.nextCommand).toBeTruthy();
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
      expect(packet.userPrompt).toContain(state.statePath);
      expect(packet.allowedCommands).toEqual(expect.arrayContaining([
        expect.stringContaining("controller-run"),
        expect.stringContaining("controller-follow-loop"),
        expect.stringContaining("controller-inspect"),
      ]));
      expect(packet.forbiddenActions).toEqual(expect.arrayContaining([
        expect.stringContaining("arbitrary shell"),
      ]));
      expect(packet.evidenceRefs).toEqual(expect.arrayContaining([state.statePath]));
      expect(packet.agenda.primaryCommand).toMatch(/controller-run --state/);
      expect(packet.audit.status).toMatch(/pass|warning|fail/);
      expect(packet.environment.repoRoot).toContain("agenteer");
      expect(await fileExists(packet.outPath)).toBe(true);
      expect(await fileExists(packet.reportPath)).toBe(true);
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
      expect(earlyDoctor.summaries.reentryPlan.path).toMatch(/controller-reentry-plan/);
      expect(await fileExists(earlyDoctor.outPath)).toBe(true);
      expect(await fileExists(earlyDoctor.reportPath)).toBe(true);
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
      expect(result.finalDoctorPath).toMatch(/controller_doctor/);
      expect(await fileExists(result.outPath)).toBe(true);
      expect(await fileExists(result.reportPath)).toBe(true);
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
      expect(runbook.launchCommand).toContain("controller-operate");
      expect(runbook.readinessCommand).toContain("controller-doctor");
      expect(runbook.inspectionCommand).toContain("controller-inspect");
      expect(runbook.allowedCommands).toEqual(expect.arrayContaining([
        expect.stringContaining("controller-operate"),
        expect.stringContaining("controller-runbook"),
        expect.stringContaining("controller-completion-audit"),
      ]));
      expect(runbook.stopCriteria).toEqual(expect.arrayContaining([
        expect.stringContaining("controller-doctor reports blocked"),
        expect.stringContaining("cost estimates exceed"),
      ]));
      expect(runbook.environment.requiredEnvVars).toEqual(expect.arrayContaining(["OPENAI_API_KEY"]));
      expect(runbook.environment.packageScripts).toEqual(expect.arrayContaining(["build", "test"]));
      expect(runbook.artifactsToInspect).toEqual(expect.arrayContaining([
        state.statePath,
        runbook.doctor.outPath,
        runbook.runnerPacket.path,
      ]));
      expect(runbook.evidenceRefs).toEqual(expect.arrayContaining([
        runbook.doctor.outPath,
        runbook.runnerPacket.path,
        runbook.capabilities.path,
      ]));
      expect(await fileExists(runbook.outPath)).toBe(true);
      expect(await fileExists(runbook.reportPath)).toBe(true);
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
      expect(byId.get("deterministic_golden_path")?.status).toBe("pass");
      expect(byId.get("supervised_pickup_loop")?.status).toBe("pass");
      expect(byId.get("doctor_operate_loop")?.status).toBe("pass");
      expect(byId.get("external_review_repair_loop")?.status).toBe("pass");
      expect(byId.get("strict_model_controller")?.status).toBe("pass");
      expect(byId.get("infeasible_study_rejection")?.status).toBe("pass");
      expect(byId.get("deterministic_golden_path")?.checks).toEqual(expect.arrayContaining([
        expect.objectContaining({ id: "source-patch-loop", status: "pass" }),
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
      const repairEvidence = byId.get("external_review_repair_loop")?.evidenceRefs.find(ref => ref.includes("controller-repair-execution"));
      expect(repairEvidence).toBeTruthy();
      expect(await fileExists(repairEvidence ?? "")).toBe(true);
      expect(await fileExists(path.join(dir, "strict-model-golden", "controller_model_preflight_001.json"))).toBe(true);
      expect(await fileExists(path.join(dir, "blocked-feasibility", "controller-feasibility-verdict.json"))).toBe(true);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
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
      expect(await fileExists(followed.outPath)).toBe(true);

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
      expect(refused.reason).toMatch(/not executable|requires review|patch/);
      expect(refused.agenda.status).toBe("blocked");
      expect(refused.selectedItem?.safety).toBe("requires_review");
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
      expect(loop.stoppedReason).toMatch(/max follow-loop iterations/);
      expect(loop.state.actions.length).toBeGreaterThanOrEqual(2);
      expect(loop.state.artifacts.map(artifact => artifact.kind)).toContain("controller-follow-loop");
      expect(await fileExists(loop.reportPath)).toBe(true);

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
      expect(supervised.rounds[0]?.safeAgendaPrimary).toBe(true);
      expect(supervised.rounds.some(round => (round.followLoopIterations ?? 0) > 0)).toBe(true);
      expect(supervised.rounds.some(round => round.auditPath)).toBe(true);
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
      const nextAction = JSON.parse(await readFile(nextActionPath, "utf-8")) as { controllerNextAction: { status: string; safeToAutoResume: boolean; recommendedCommand: string; issueLedger: { topIssues: Array<{ category: string; message: string }> }; reentryPlan: { status: string; recommendedStage: string }; mustReviewArtifacts: Array<{ kind: string }> } };
      expect(handoff.controllerTerminalHandoff.trigger).toBe("blocked");
      expect(handoff.controllerTerminalHandoff.failureAttribution).toEqual(expect.arrayContaining([expect.objectContaining({ category: "data", severity: "blocker" })]));
      expect(handoff.controllerTerminalHandoff.reentryPlan.status).toBe("patch_then_resume");
      expect(handoff.controllerTerminalHandoff.reentryPlan.recommendedStage).toBe("dataset_feasibility");
      expect(handoff.controllerTerminalHandoff.suggestedCommands.join("\n")).toMatch(/controller-patch/);
      expect(nextAction.controllerNextAction.status).toBe("blocked");
      expect(nextAction.controllerNextAction.safeToAutoResume).toBe(false);
      expect(nextAction.controllerNextAction.reentryPlan.status).toBe("patch_then_resume");
      expect(nextAction.controllerNextAction.reentryPlan.recommendedStage).toBe("dataset_feasibility");
      expect(nextAction.controllerNextAction.recommendedCommand).toMatch(/controller-patch/);
      expect(nextAction.controllerNextAction.issueLedger.topIssues.some(issue => issue.category === "data")).toBe(true);
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
      expect(latestAgenda.controllerExecutionAgenda.primaryCommand).toMatch(/controller-patch|controller-inspect/);
      expect(latestAgenda.controllerExecutionAgenda.sourceArtifacts.issueLedger).toBeTruthy();
      expect(latestAgenda.controllerExecutionAgenda.sourceArtifacts.stageReview).toBeTruthy();
      expect(latestAgenda.controllerExecutionAgenda.sourceArtifacts.nextAction).toBeTruthy();
      expect(latestAgenda.controllerExecutionAgenda.items).toEqual(expect.arrayContaining([
        expect.objectContaining({ kind: "patch", safety: "requires_review" }),
      ]));
      expect(result.state.artifacts.map(artifact => artifact.kind)).toEqual(expect.arrayContaining(["controller-next-action", "controller-next-action-report"]));
      expect(result.state.artifacts.map(artifact => artifact.kind)).toEqual(expect.arrayContaining(["controller-model-runner-packet", "controller-model-runner-packet-report"]));
      expect(await readFile(handoffReportPath, "utf-8")).toMatch(/Failure Attribution/);
      expect(await fileExists(path.join(result.state.rootDir, "controller-reentry-plan.json"))).toBe(true);
      const blockedRunnerPacketPath = result.state.artifacts.find(artifact => artifact.kind === "controller-model-runner-packet")?.path;
      expect(blockedRunnerPacketPath).toBeTruthy();
      const blockedRunnerPacket = JSON.parse(await readFile(blockedRunnerPacketPath as string, "utf-8")) as { controllerModelRunnerPacket: { status: string; recommendedCommand: string; forbiddenActions: string[] } };
      expect(blockedRunnerPacket.controllerModelRunnerPacket.status).toMatch(/blocked|review/);
      expect(blockedRunnerPacket.controllerModelRunnerPacket.recommendedCommand).toMatch(/controller-patch|controller-inspect/);
      expect(blockedRunnerPacket.controllerModelRunnerPacket.forbiddenActions.join(" ")).toMatch(/arbitrary shell/);
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

      expect(actions).toEqual(expect.arrayContaining(["run_analysis", "method_qa", "write_manuscript", "inspect_run", "decide_promotion"]));
      expect(artifacts).toEqual(expect.arrayContaining(["controller-feasibility-verdict", "controller-modeling-plan", "stats-summary", "stats-report", "stats-qa", "method-qa", "manuscript", "manuscript-qa", "run-inspection", "controller-action-contract", "controller-action-readiness", "controller-completion-audit", "controller-step-checkpoint", "controller-state-snapshot", "controller-issue-ledger", "controller-work-plan", "controller-decision-context", "controller-run-invocation"]));
      expect(result.state.status).toMatch(/complete|needs_human_review/);
      expect(result.state.issueLedgers.length).toBeGreaterThanOrEqual(actions.length + 1);
      expect(result.state.stageReviews.length).toBeGreaterThanOrEqual(actions.length);
      expect(result.state.agendas.length).toBeGreaterThanOrEqual(actions.length + 1);
      expect(artifacts).toEqual(expect.arrayContaining(["controller-stage-review", "controller-stage-review-report", "controller-execution-agenda", "controller-execution-agenda-report"]));
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
      const modelRunnerPacket = JSON.parse(await readFile(result.state.artifacts.find(artifact => artifact.kind === "controller-model-runner-packet")?.path ?? "", "utf-8")) as { controllerModelRunnerPacket: { defaultControllerModel: string; systemPrompt: string; userPrompt: string; evidenceRefs: string[] } };
      expect(modelRunnerPacket.controllerModelRunnerPacket.defaultControllerModel).toBe("openai:gpt-5.4");
      expect(modelRunnerPacket.controllerModelRunnerPacket.systemPrompt).toContain("Research Controller Agent");
      expect(modelRunnerPacket.controllerModelRunnerPacket.userPrompt).toContain(result.state.statePath);
      expect(modelRunnerPacket.controllerModelRunnerPacket.evidenceRefs).toEqual(expect.arrayContaining([result.state.statePath]));
      const completionAudit = JSON.parse(await readFile(path.join(result.state.rootDir, "controller-completion-audit.json"), "utf-8")) as { controllerCompletionAudit: { status: string; requirements: Array<{ id: string; status: string }> } };
      expect(completionAudit.controllerCompletionAudit.status).not.toBe("fail");
      expect(completionAudit.controllerCompletionAudit.requirements).toEqual(expect.arrayContaining([
        expect.objectContaining({ id: "stage-coverage", status: "proved" }),
        expect.objectContaining({ id: "artifact-integrity", status: "proved" }),
        expect.objectContaining({ id: "action-contracts", status: "proved" }),
        expect.objectContaining({ id: "step-checkpoints", status: "proved" }),
        expect.objectContaining({ id: "stage-reviews", status: "proved" }),
        expect.objectContaining({ id: "execution-agenda", status: "proved" }),
      ]));
      expect(result.state.selfEvaluations.length).toBeGreaterThanOrEqual(1);
      expect(result.state.selfEvaluations.at(-1)?.checks.map(check => check.id)).toEqual(expect.arrayContaining(["required-stage-coverage", "feasibility-verdict-artifact", "analysis-executed", "modeling-plan-artifact", "required-artifacts", "action-contracts", "stage-review-coverage", "execution-agenda-coverage"]));
      const verdict = JSON.parse(await readFile(path.join(result.state.rootDir, "controller-feasibility-verdict.json"), "utf-8")) as { controllerFeasibilityVerdict: { status: string; methodChecks: Array<{ id: string; status: string }> } };
      expect(verdict.controllerFeasibilityVerdict.status).toBe("pass");
      expect(verdict.controllerFeasibilityVerdict.methodChecks).toEqual(expect.arrayContaining([expect.objectContaining({ id: "continuous-outcome-variation", status: "pass" })]));
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
      const verdict = JSON.parse(await readFile(path.join(result.state.rootDir, "controller-feasibility-verdict.json"), "utf-8")) as { controllerFeasibilityVerdict: { status: string; blockers: string[]; variableChecks: Array<{ name: string; issues: Array<{ code: string }> }> } };
      expect(verdict.controllerFeasibilityVerdict.status).toBe("block");
      expect(verdict.controllerFeasibilityVerdict.blockers.join(" ")).toMatch(/not bounded to 0\/1/);
      expect(verdict.controllerFeasibilityVerdict.variableChecks.find(check => check.name === "death_flag")?.issues.map(issue => issue.code)).toContain("INVALID_BINARY_EVENT_RANGE");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

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
        ],
      };
      await writeFile(corruptState.statePath, JSON.stringify({ schemaVersion: 1, controllerState: corruptState }, null, 2));

      const stepped = await researchControllerStepCommand({ statePath: corruptState.statePath });

      expect(stepped.status).toBe("needs_human_review");
      expect(stepped.currentStage).toBe("human_review");
      expect(stepped.selfEvaluations.at(-1)?.status).toBe("fail");
      expect(stepped.selfEvaluations.at(-1)?.checks.find(check => check.id === "required-artifacts")?.status).toBe("pass");
      expect(stepped.selfEvaluations.at(-1)?.checks.find(check => check.id === "method-qa-artifact")?.status).toBe("fail");
      expect(await fileExists(path.join(stepped.rootDir, "controller-self-evaluation.md"))).toBe(true);
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
      expect(result.state.status).toBe("needs_human_review");
      expect(result.state.stopReason).toMatch(/human review/i);
      const handoff = JSON.parse(await readFile(path.join(result.state.rootDir, "controller-terminal-handoff.json"), "utf-8")) as Record<string, { trigger: string; suggestedCommands: string[] }>;
      expect(handoff.controllerTerminalHandoff.trigger).toBe("human_review");
      expect(handoff.controllerTerminalHandoff.suggestedCommands.join("\n")).toMatch(/controller-resume --state/);
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
      expect(cycle.completionAuditPath).toBeTruthy();
      expect(cycle.state.repairs.length).toBeGreaterThan(0);
      expect(cycle.state.actions.map(action => action.action)).toContain("apply_repairs");
      expect(artifactKinds).toEqual(expect.arrayContaining([
        "controller-repair-cycle",
        "controller-repair-cycle-report",
        "controller-repair-execution",
        "controller-completion-audit",
      ]));
      expect(await fileExists(cycle.outPath)).toBe(true);
      expect(await fileExists(cycle.reportPath)).toBe(true);
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
        patch: { exposure: "age", covariates: ["x"] },
        reason: "Switch exposure after controller review.",
      });

      expect(patched.inputs.exposure).toBe("age");
      expect(patched.inputs.covariates).toEqual(["x"]);
      expect(patched.patches).toHaveLength(1);
      expect(patched.patches[0]?.status).toBe("applied");
      expect(patched.patches[0]?.changedFields).toEqual(expect.arrayContaining(["exposure", "covariates"]));
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

  it("runs bounded controller inspection tools and records tool provenance", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "agenteer-controller-tool-"));
    try {
      const state = await researchControllerInitCommand({
        question: "Is exposure associated with outcome?",
        outDir: dir,
        method: "linear-regression",
        outcome: "outcome",
        exposure: "exposure",
      });

      const inspected = await researchControllerToolCommand({
        statePath: state.statePath,
        request: {
          toolId: "controller-inspect",
          args: [],
          reason: "Verify controller state integrity before continuing.",
        },
      });

      expect(inspected.toolActions).toHaveLength(1);
      expect(inspected.toolActions[0]?.status).toBe("succeeded");
      expect(inspected.toolActions[0]?.command).toBeNull();
      expect(inspected.toolActions[0]?.inspection?.status).toBe("pass");
      expect(inspected.artifacts.map(artifact => artifact.kind)).toEqual(expect.arrayContaining(["controller-tool-action", "controller-tool-stdout"]));
      expect(await fileExists(inspected.toolActions[0]?.stdoutPath ?? "")).toBe(true);
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

      const unsafeCommand = await researchControllerToolCommand({
        statePath: catalog.statePath,
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
      const data = await writeLinearCsv(path.join(dir, "rows.csv"), 70);
      const userPrompts: string[] = [];
      const fetchImpl = async (_url: string | URL | Request, init?: RequestInit) => {
        const body = JSON.parse(String(init?.body ?? "{}")) as { messages?: Array<{ role: string; content: string }> };
        const user = body.messages?.find(message => message.role === "user")?.content;
        if (user) userPrompts.push(user);
        const action = userPrompts.length === 1 ? "initialize" : "table_summary";
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
        maxSteps: 2,
      });

      expect(result.state.decisions.map(decision => decision.source)).toEqual(["model", "model"]);
      expect(userPrompts).toHaveLength(2);
      const secondPrompt = userPrompts[1] ?? "";
      expect(secondPrompt).toContain("\"feasibility\"");
      expect(secondPrompt).toContain("\"status\": \"pass\"");
      expect(secondPrompt).toContain("\"continuous-outcome-variation\"");
      expect(secondPrompt).toContain("If feasibility.status is block");
      expect(result.state.artifacts.map(artifact => artifact.kind)).toContain("controller-decision-context");
      const contextPath = result.state.artifacts.filter(artifact => artifact.kind === "controller-decision-context").at(-1)?.path;
      const context = JSON.parse(await readFile(contextPath ?? "", "utf-8")) as { controllerDecisionContext: { feasibility: { status: string }; issueLedger: { present: boolean; status: string | null }; workPlan: { present: boolean }; allowedActions: string[] } };
      expect(context.controllerDecisionContext.feasibility.status).toBe("pass");
      expect(context.controllerDecisionContext.issueLedger.present).toBe(true);
      expect(context.controllerDecisionContext.workPlan.present).toBe(true);
      expect(context.controllerDecisionContext.allowedActions).toContain("table_summary");
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
      expect(prompts[0]).toContain("\"toolId\": \"controller-inspect\"");
      expect(resumed.actions[0]?.action).toBe("initialize");
      expect(resumed.currentStage).toBe("method_selection");
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
