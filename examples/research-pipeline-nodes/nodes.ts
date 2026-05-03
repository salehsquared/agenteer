import { z } from "zod";
import {
  makeManifest,
  type Node,
  type NodeInput,
  type NodeManifest,
  type NodeRegistry,
  type NodeResult,
} from "@agenteer/core";
import {
  researchCritiquePacketCommand,
  researchAnalyzeLocalCommand,
  researchArtifactManifestCommand,
  researchDesignCommand,
  researchExportPacketCommand,
  researchReviewReportCommand,
  researchValidateMethodsCommand,
  researchRoCrateCommand,
  researchProvenanceCommand,
  researchQaDashboardCommand,
  researchDataQualityCommand,
  researchRunnerSpecCommand,
  researchScoutPlanCommand,
  type ResearchProject,
} from "../../packages/cli/src/commands/research.js";

const DesignInput = z.object({
  project: z.literal("medbrevia-nhanes"),
  repoDir: z.string().min(1),
  question: z.string().min(1),
  outDir: z.string().optional(),
});

const PacketInput = z.object({
  packetDir: z.string().min(1),
});

const ScoutInput = PacketInput.extend({
  fixturePath: z.string().optional(),
});

const AnalyzeInput = PacketInput.extend({
  fixturePath: z.string().min(1),
});

const ExportInput = PacketInput.extend({
  outDir: z.string().min(1),
});

const UnknownOutput = z.unknown();

export const researchProtocolDesignManifest: NodeManifest = makeManifest({
  id: "@agenteer/node-research-protocol-design",
  name: "research_protocol_design",
  description: "Design a traceable research protocol packet from a dataset registry and question.",
  determinism: "deterministic",
  required_actions: [],
  tags: ["research", "protocol", "dataset"],
  side_effects: {
    writes_fs: true,
    network: false,
    mutates_ctx: false,
  },
});

export const researchProtocolCritiqueManifest: NodeManifest = makeManifest({
  id: "@agenteer/node-research-protocol-critique",
  name: "research_protocol_critique",
  description: "Run deterministic research-method critique against a design packet.",
  determinism: "deterministic",
  required_actions: [],
  tags: ["research", "validation"],
  side_effects: {
    writes_fs: false,
    network: false,
    mutates_ctx: false,
  },
});

export const researchScoutPlanManifest: NodeManifest = makeManifest({
  id: "@agenteer/node-research-scout-plan",
  name: "research_scout_plan",
  description: "Build or compute a cohort scout plan from a design packet and optional local fixture.",
  determinism: "deterministic",
  required_actions: [],
  tags: ["research", "cohort", "data-quality"],
  side_effects: {
    writes_fs: true,
    network: false,
    mutates_ctx: false,
  },
});

export const researchRunnerSpecManifest: NodeManifest = makeManifest({
  id: "@agenteer/node-research-runner-spec",
  name: "research_runner_spec",
  description: "Create a zero-cloud local fixture runner contract for a research packet.",
  determinism: "deterministic",
  required_actions: [],
  tags: ["research", "runner", "safety"],
  side_effects: {
    writes_fs: true,
    network: false,
    mutates_ctx: false,
  },
});

export const researchAnalyzeManifest: NodeManifest = makeManifest({
  id: "@agenteer/node-research-analyze-local",
  name: "research_analyze_local",
  description: "Run approved local fixture analysis for a research packet.",
  determinism: "deterministic",
  required_actions: [],
  tags: ["research", "analysis", "fixture"],
  side_effects: {
    writes_fs: true,
    network: false,
    mutates_ctx: false,
  },
});

export const researchReportReviewManifest: NodeManifest = makeManifest({
  id: "@agenteer/node-research-report-review",
  name: "research_report_review",
  description: "Review a generated research report against packet-specific QA requirements.",
  determinism: "deterministic",
  required_actions: [],
  tags: ["research", "report", "qa"],
  side_effects: {
    writes_fs: false,
    network: false,
    mutates_ctx: false,
  },
});

export const researchMethodsValidationManifest: NodeManifest = makeManifest({
  id: "@agenteer/node-research-methods-validation",
  name: "research_methods_validation",
  description: "Validate a research packet against broader medical research methods policy.",
  determinism: "deterministic",
  required_actions: [],
  tags: ["research", "methods", "validation"],
  side_effects: {
    writes_fs: true,
    network: false,
    mutates_ctx: false,
  },
});

export const researchDataQualityManifest: NodeManifest = makeManifest({
  id: "@agenteer/node-research-data-quality",
  name: "research_data_quality",
  description: "Profile fixture data quality, missingness, and coded unknown values.",
  determinism: "deterministic",
  required_actions: [],
  tags: ["research", "data-quality", "fixture"],
  side_effects: {
    writes_fs: false,
    network: false,
    mutates_ctx: false,
  },
});

export const researchManifestManifest: NodeManifest = makeManifest({
  id: "@agenteer/node-research-artifact-manifest",
  name: "research_artifact_manifest",
  description: "Write a hash-based artifact manifest for research packet outputs.",
  determinism: "deterministic",
  required_actions: [],
  tags: ["research", "reproducibility", "artifacts"],
  side_effects: {
    writes_fs: true,
    network: false,
    mutates_ctx: false,
  },
});

export const researchRoCrateManifest: NodeManifest = makeManifest({
  id: "@agenteer/node-research-ro-crate",
  name: "research_ro_crate",
  description: "Write RO-Crate-style metadata for research packet artifacts.",
  determinism: "deterministic",
  required_actions: [],
  tags: ["research", "reproducibility", "ro-crate"],
  side_effects: {
    writes_fs: true,
    network: false,
    mutates_ctx: false,
  },
});

export const researchProvenanceManifest: NodeManifest = makeManifest({
  id: "@agenteer/node-research-provenance",
  name: "research_provenance",
  description: "Write a PROV-style graph for packet artifacts and activities.",
  determinism: "deterministic",
  required_actions: [],
  tags: ["research", "provenance", "audit"],
  side_effects: {
    writes_fs: true,
    network: false,
    mutates_ctx: false,
  },
});

export const researchQaDashboardManifest: NodeManifest = makeManifest({
  id: "@agenteer/node-research-qa-dashboard",
  name: "research_qa_dashboard",
  description: "Summarize packet readiness across lifecycle, methods, reproducibility, and export checks.",
  determinism: "deterministic",
  required_actions: [],
  tags: ["research", "qa", "dashboard"],
  side_effects: {
    writes_fs: false,
    network: false,
    mutates_ctx: false,
  },
});

export const researchExportManifest: NodeManifest = makeManifest({
  id: "@agenteer/node-research-export",
  name: "research_export",
  description: "Export manifest-backed research packet artifacts to a durable directory.",
  determinism: "deterministic",
  required_actions: [],
  tags: ["research", "reproducibility", "export"],
  side_effects: {
    writes_fs: true,
    network: false,
    mutates_ctx: false,
  },
});

export function researchProtocolDesignFactory(): Node<
  z.infer<typeof DesignInput>,
  unknown
> {
  return {
    manifest: researchProtocolDesignManifest,
    inputSchema: DesignInput,
    outputSchema: UnknownOutput,
    ctx: [],
    model: null,
    async execute(input: NodeInput<z.infer<typeof DesignInput>>): Promise<NodeResult<unknown>> {
      const result = await researchDesignCommand({
        project: input.original.project as ResearchProject,
        repoDir: input.original.repoDir,
        question: input.original.question,
        ...(input.original.outDir ? { outDir: input.original.outDir } : {}),
      });
      return { kind: "output", value: result, evidence: { verdict: result.diagnostics.blockers.length ? "fail" : "pass" } };
    },
  };
}

export function researchProtocolCritiqueFactory(): Node<
  z.infer<typeof PacketInput>,
  unknown
> {
  return {
    manifest: researchProtocolCritiqueManifest,
    inputSchema: PacketInput,
    outputSchema: UnknownOutput,
    ctx: [],
    model: null,
    async execute(input: NodeInput<z.infer<typeof PacketInput>>): Promise<NodeResult<unknown>> {
      const result = await researchCritiquePacketCommand(input.original.packetDir);
      return { kind: "output", value: result, evidence: { verdict: result.status === "blocked" ? "fail" : "pass" } };
    },
  };
}

export function researchScoutPlanFactory(): Node<
  z.infer<typeof ScoutInput>,
  unknown
> {
  return {
    manifest: researchScoutPlanManifest,
    inputSchema: ScoutInput,
    outputSchema: UnknownOutput,
    ctx: [],
    model: null,
    async execute(input: NodeInput<z.infer<typeof ScoutInput>>): Promise<NodeResult<unknown>> {
      const result = await researchScoutPlanCommand(input.original.packetDir, input.original.fixturePath);
      return { kind: "output", value: result, evidence: { verdict: result.metrics?.completeCaseRows === 0 ? "fail" : "pass" } };
    },
  };
}

export function researchRunnerSpecFactory(): Node<
  z.infer<typeof PacketInput>,
  unknown
> {
  return {
    manifest: researchRunnerSpecManifest,
    inputSchema: PacketInput,
    outputSchema: UnknownOutput,
    ctx: [],
    model: null,
    async execute(input: NodeInput<z.infer<typeof PacketInput>>): Promise<NodeResult<unknown>> {
      const result = await researchRunnerSpecCommand(input.original.packetDir);
      return { kind: "output", value: result, evidence: { verdict: "pass" } };
    },
  };
}

export function researchAnalyzeFactory(): Node<
  z.infer<typeof AnalyzeInput>,
  unknown
> {
  return {
    manifest: researchAnalyzeManifest,
    inputSchema: AnalyzeInput,
    outputSchema: UnknownOutput,
    ctx: [],
    model: null,
    async execute(input: NodeInput<z.infer<typeof AnalyzeInput>>): Promise<NodeResult<unknown>> {
      const result = await researchAnalyzeLocalCommand(input.original.packetDir, input.original.fixturePath);
      return { kind: "output", value: result, evidence: { verdict: result.completeCaseRows > 0 ? "pass" : "fail" } };
    },
  };
}

export function researchReportReviewFactory(): Node<
  z.infer<typeof PacketInput>,
  unknown
> {
  return {
    manifest: researchReportReviewManifest,
    inputSchema: PacketInput,
    outputSchema: UnknownOutput,
    ctx: [],
    model: null,
    async execute(input: NodeInput<z.infer<typeof PacketInput>>): Promise<NodeResult<unknown>> {
      const result = await researchReviewReportCommand(input.original.packetDir);
      return { kind: "output", value: result, evidence: { verdict: result.status === "pass" ? "pass" : "fail" } };
    },
  };
}

export function researchMethodsValidationFactory(): Node<
  z.infer<typeof PacketInput>,
  unknown
> {
  return {
    manifest: researchMethodsValidationManifest,
    inputSchema: PacketInput,
    outputSchema: UnknownOutput,
    ctx: [],
    model: null,
    async execute(input: NodeInput<z.infer<typeof PacketInput>>): Promise<NodeResult<unknown>> {
      const result = await researchValidateMethodsCommand(input.original.packetDir);
      return { kind: "output", value: result, evidence: { verdict: result.status === "blocked" ? "fail" : "pass" } };
    },
  };
}

export function researchDataQualityFactory(): Node<
  z.infer<typeof AnalyzeInput>,
  unknown
> {
  return {
    manifest: researchDataQualityManifest,
    inputSchema: AnalyzeInput,
    outputSchema: UnknownOutput,
    ctx: [],
    model: null,
    async execute(input: NodeInput<z.infer<typeof AnalyzeInput>>): Promise<NodeResult<unknown>> {
      const result = await researchDataQualityCommand(input.original.fixturePath);
      return { kind: "output", value: result, evidence: { verdict: result.warnings.some(issue => issue.severity === "blocker") ? "fail" : "pass" } };
    },
  };
}

export function researchManifestFactory(): Node<
  z.infer<typeof PacketInput>,
  unknown
> {
  return {
    manifest: researchManifestManifest,
    inputSchema: PacketInput,
    outputSchema: UnknownOutput,
    ctx: [],
    model: null,
    async execute(input: NodeInput<z.infer<typeof PacketInput>>): Promise<NodeResult<unknown>> {
      const result = await researchArtifactManifestCommand(input.original.packetDir);
      return { kind: "output", value: result, evidence: { verdict: "pass" } };
    },
  };
}

export function researchRoCrateFactory(): Node<
  z.infer<typeof PacketInput>,
  unknown
> {
  return {
    manifest: researchRoCrateManifest,
    inputSchema: PacketInput,
    outputSchema: UnknownOutput,
    ctx: [],
    model: null,
    async execute(input: NodeInput<z.infer<typeof PacketInput>>): Promise<NodeResult<unknown>> {
      const result = await researchRoCrateCommand(input.original.packetDir);
      return { kind: "output", value: result, evidence: { verdict: result.metadata["@graph"].length > 0 ? "pass" : "fail" } };
    },
  };
}

export function researchProvenanceFactory(): Node<
  z.infer<typeof PacketInput>,
  unknown
> {
  return {
    manifest: researchProvenanceManifest,
    inputSchema: PacketInput,
    outputSchema: UnknownOutput,
    ctx: [],
    model: null,
    async execute(input: NodeInput<z.infer<typeof PacketInput>>): Promise<NodeResult<unknown>> {
      const result = await researchProvenanceCommand(input.original.packetDir);
      return { kind: "output", value: result, evidence: { verdict: result.graph.activities.length > 0 ? "pass" : "fail" } };
    },
  };
}

export function researchQaDashboardFactory(): Node<
  z.infer<typeof PacketInput>,
  unknown
> {
  return {
    manifest: researchQaDashboardManifest,
    inputSchema: PacketInput,
    outputSchema: UnknownOutput,
    ctx: [],
    model: null,
    async execute(input: NodeInput<z.infer<typeof PacketInput>>): Promise<NodeResult<unknown>> {
      const result = await researchQaDashboardCommand(input.original.packetDir);
      return { kind: "output", value: result, evidence: { verdict: result.status === "blocked" ? "fail" : "pass" } };
    },
  };
}

export function researchExportFactory(): Node<
  z.infer<typeof ExportInput>,
  unknown
> {
  return {
    manifest: researchExportManifest,
    inputSchema: ExportInput,
    outputSchema: UnknownOutput,
    ctx: [],
    model: null,
    async execute(input: NodeInput<z.infer<typeof ExportInput>>): Promise<NodeResult<unknown>> {
      const result = await researchExportPacketCommand(input.original.packetDir, input.original.outDir);
      return { kind: "output", value: result, evidence: { verdict: result.copiedArtifacts.length > 0 ? "pass" : "fail" } };
    },
  };
}

export const RESEARCH_PIPELINE_NODE_MANIFESTS = [
  researchProtocolDesignManifest,
  researchProtocolCritiqueManifest,
  researchScoutPlanManifest,
  researchRunnerSpecManifest,
  researchAnalyzeManifest,
  researchReportReviewManifest,
  researchMethodsValidationManifest,
  researchDataQualityManifest,
  researchManifestManifest,
  researchRoCrateManifest,
  researchProvenanceManifest,
  researchQaDashboardManifest,
  researchExportManifest,
] as const;

export function registerResearchPipelineNodes(registry: NodeRegistry): void {
  registry.register(researchProtocolDesignManifest, researchProtocolDesignFactory);
  registry.register(researchProtocolCritiqueManifest, researchProtocolCritiqueFactory);
  registry.register(researchScoutPlanManifest, researchScoutPlanFactory);
  registry.register(researchRunnerSpecManifest, researchRunnerSpecFactory);
  registry.register(researchAnalyzeManifest, researchAnalyzeFactory);
  registry.register(researchReportReviewManifest, researchReportReviewFactory);
  registry.register(researchMethodsValidationManifest, researchMethodsValidationFactory);
  registry.register(researchDataQualityManifest, researchDataQualityFactory);
  registry.register(researchManifestManifest, researchManifestFactory);
  registry.register(researchRoCrateManifest, researchRoCrateFactory);
  registry.register(researchProvenanceManifest, researchProvenanceFactory);
  registry.register(researchQaDashboardManifest, researchQaDashboardFactory);
  registry.register(researchExportManifest, researchExportFactory);
}
