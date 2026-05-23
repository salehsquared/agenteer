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
  renderSpecializationInspect,
  renderSpecializationPlan,
  renderSpecializationReport,
  specializationCritiqueCommand,
  specializationEvaluateCommand,
  specializationGenerateCommand,
  specializationInitCommand,
  specializationInspectCommand,
  specializationPlanCommand,
  specializationPromoteCommand,
  specializationRunLoopCommand,
} from "../specialize/runtime.js";
import {
  parseBackendId,
  parseControllerModel,
  parseDataStructures,
  parseDatasetAdapterId,
  parseMethodCategory,
  parseMethodGoal,
  parseModelingGoal,
  parseOutcomeType,
  parsePhenotypeCodeSystem,
  parseReviewAutonomy,
  parseReviewStage,
  parseStudyArchetypeId,
  parseStudyDesign,
  researchAnalysisBenchmarkCommand,
  researchAnalysisManifestCommand,
  researchAnalysisRunCommand,
  researchArchetypesCommand,
  researchDatasetAdapterCommand,
  researchDatasetRunCommand,
  researchDatasetRunIndexCommand,
  researchDatasetSpecCommand,
  researchExecutionContractFromFileCommand,
  researchPhenotypeInspectCommand,
  researchPhenotypeListCommand,
  researchPhenotypeMatchCommand,
  researchPhenotypeReviewCommand,
  researchReviewAdjudicateCommand,
  researchReviewerProvidersCommand,
  researchReviewResponseCommand,
  researchMethodApplyCommand,
  researchMethodSelectCommand,
  researchMethodValidateCommand,
  researchLiteratureContextCommand,
  researchMethodsCatalogCommand,
  researchModelingPlanCommand,
  researchMachineBenchmarkCommand,
  researchMachinePlanCommand,
  researchMachineStatusCommand,
  researchBenchmarkSuiteRunCommand,
  researchBenchmarkTrendCommand,
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
  researchSpecV2Command,
  researchExplorePlanCommand,
  researchManuscriptCommand,
  researchMethodQaCommand,
  researchLiteratureQaCommand,
  researchMedbreviaLiteratureSearchCommand,
  researchRunInspectCommand,
  researchStudyCriticCommand,
  renderResearchAnalysisBenchmark,
  renderResearchAnalysisBenchmarkJson,
  renderResearchAnalysisManifest,
  renderResearchAnalysisManifestJson,
  renderResearchAnalysisRun,
  renderResearchAnalysisRunJson,
  renderResearchArchetypes,
  renderResearchArchetypesJson,
  renderResearchDatasetAdapter,
  renderResearchDatasetAdapterJson,
  renderDatasetRun,
  renderDatasetRunIndex,
  renderDatasetRunIndexJson,
  renderDatasetRunJson,
  renderDatasetSpec,
  renderDatasetSpecJson,
  renderResearchPhenotypeInspect,
  renderResearchPhenotypeInspectJson,
  renderResearchPhenotypeList,
  renderResearchPhenotypeListJson,
  renderResearchPhenotypeMatch,
  renderResearchPhenotypeMatchJson,
  renderResearchPhenotypeReview,
  renderResearchPhenotypeReviewJson,
  renderResearchReviewAdjudication,
  renderResearchReviewAdjudicationJson,
  renderResearchReviewerProviders,
  renderResearchReviewerProvidersJson,
  renderResearchReviewResponse,
  renderResearchReviewResponseJson,
  renderResearchStudyCritic,
  renderResearchStudyCriticJson,
  renderResearchExecutionContract,
  renderResearchExecutionContractJson,
  renderResearchMachineBenchmark,
  renderResearchMachineBenchmarkJson,
  renderResearchMachinePlan,
  renderResearchMachinePlanJson,
  renderResearchMachineStatus,
  renderResearchMachineStatusJson,
  renderResearchBenchmarkSuiteRun,
  renderResearchBenchmarkSuiteRunJson,
  renderResearchBenchmarkTrend,
  renderResearchBenchmarkTrendJson,
  renderResearchControllerAgenda,
  renderResearchControllerAgendaJson,
  renderResearchControllerAudit,
  renderResearchControllerAuditJson,
  renderResearchControllerCapabilities,
  renderResearchControllerCapabilitiesJson,
  renderResearchControllerCompletionAudit,
  renderResearchControllerCompletionAuditJson,
  renderResearchControllerDoctor,
  renderResearchControllerDoctorJson,
  renderResearchControllerEnvironment,
  renderResearchControllerEnvironmentJson,
  renderResearchControllerFollowAgenda,
  renderResearchControllerFollowAgendaJson,
  renderResearchControllerFollowLoop,
  renderResearchControllerFollowLoopJson,
  renderResearchControllerGoalAudit,
  renderResearchControllerGoalAuditJson,
  renderResearchControllerOperate,
  renderResearchControllerOperateJson,
  renderResearchControllerRepairCycle,
  renderResearchControllerRepairCycleJson,
  renderResearchControllerRunbook,
  renderResearchControllerRunbookJson,
  renderResearchControllerRunnerPacket,
  renderResearchControllerRunnerPacketJson,
  renderResearchControllerSelfTest,
  renderResearchControllerSelfTestJson,
  renderResearchControllerState,
  renderResearchControllerStateJson,
  renderResearchControllerSupervisor,
  renderResearchControllerSupervisorJson,
  renderResearchExplorePlan,
  renderResearchExplorePlanJson,
  renderResearchManuscript,
  renderResearchManuscriptJson,
  renderResearchMethodQa,
  renderResearchMethodQaJson,
  renderResearchLiteratureContext,
  renderResearchLiteratureContextJson,
  renderResearchLiteratureQa,
  renderResearchLiteratureQaJson,
  renderResearchMedbreviaLiteratureSearch,
  renderResearchMedbreviaLiteratureSearchJson,
  renderResearchRunInspect,
  renderResearchRunInspectJson,
  renderResearchMethodApply,
  renderResearchMethodApplyJson,
  renderResearchMachineMethodSelection,
  renderResearchMachineMethodSelectionJson,
  renderResearchMethodValidation,
  renderResearchMethodValidationJson,
  renderResearchMethodsCatalog,
  renderResearchMethodsCatalogJson,
  renderResearchModelingPlan,
  renderResearchModelingPlanJson,
  renderResearchSpecV2,
  renderResearchSpecV2Json,
  resolveMachineOutPath,
} from "../research-machine/commands.js";
import {
  parseMlInteger,
  parseMlNumber,
  parseMlTask,
  parseMlTaskRequired,
  researchMlCompareCommand,
  researchMlInspectCommand,
  researchMlModelsCommand,
  researchMlRunCommand,
  renderResearchMlComparison,
  renderResearchMlComparisonJson,
  renderResearchMlModels,
  renderResearchMlModelsJson,
  renderResearchMlRun,
  renderResearchMlRunJson,
} from "../research-machine/ml/commands.js";
import {
  parseStatsMethod,
  researchFigureQaCommand,
  researchStatsRunCommand,
  renderResearchFigureQa,
  renderResearchFigureQaJson,
  renderResearchStatsRun,
  renderResearchStatsRunJson,
} from "../research-machine/stats/commands.js";
import {
  renderDatasetManifest,
  renderDatasetManifestJson,
  renderDatasetProfile,
  renderDatasetProfileJson,
  renderDatasetQuestions,
  renderDatasetQuestionsJson,
  renderDatasetRegistration,
  renderDatasetRegistrationJson,
  renderDatasetRelationships,
  renderDatasetRelationshipsJson,
  researchDatasetDescribeCommand,
  researchDatasetInspectCommand,
  researchDatasetProfileCommand,
  researchDatasetQuestionsCommand,
  researchDatasetRegisterCommand,
  researchDatasetRelationshipsCommand,
  type DatasetDomain,
} from "../research-machine/datasets.js";
import {
  agentAdversarialProtocolsCommand,
  agentCapabilityFromContractCommand,
  agentCapabilityValidateCommand,
  agentCognitivePoolCommand,
  agentContextImpactCommand,
  agentContextDenoiseCommand,
  agentContextImmuneCheckCommand,
  agentContextManifestCommand,
  agentContextPackCommand,
  agentContextPreflightCommand,
  agentContextOutcomeCommand,
  agentContextScoreCommand,
  agentContextVerifyCommand,
  agentCreativitySynthCommand,
  agentCriticCommand,
  agentDreamCommand,
  agentEvidenceReceiptCommand,
  agentExecutionMemoryCommand,
  agentIdeaEvolveCommand,
  agentImprovementCandidatesCommand,
  agentImprovementRunCommand,
  agentNodeContractCommand,
  agentNodeContractsCommand,
  agentNodeContractValidateCommand,
  agentNodeIoValidateCommand,
  agentNodeOutputRecordCommand,
  agentPlanCriticCommand,
  agentPlanDiffCommand,
  agentPlanStateCreateCommand,
  agentPlanStateEventCommand,
  agentPlanStateReplanCommand,
  agentPlanStateResumeCommand,
  agentPlanV2Command,
  agentReplanCommand,
  agentRepairProvenanceCommand,
  agentRepairRunCommand,
  agentResearchIntakeCommand,
  agentResearchMarketCommand,
  agentReliabilityEvalCommand,
  agentSourceRankCommand,
  agentTaskCreateCommand,
  agentTaskExportCommand,
  agentTaskTransitionCommand,
  agentTaskValidateCommand,
  agentTrajectoryPolicyCommand,
  renderAgentAdversarialProtocols,
  renderAgentAdversarialProtocolsJson,
  renderAgentCapabilityDeclaration,
  renderAgentCapabilityDeclarationJson,
  renderAgentCognitivePool,
  renderAgentCognitivePoolJson,
  renderAgentContextImpact,
  renderAgentContextDenoise,
  renderAgentContextDenoiseJson,
  renderAgentContextImpactJson,
  renderAgentContextImmuneCheck,
  renderAgentContextImmuneCheckJson,
  renderAgentContextManifest,
  renderAgentContextManifestJson,
  renderAgentContextPack,
  renderAgentContextPackJson,
  renderAgentContextPreflight,
  renderAgentContextPreflightJson,
  renderAgentContextScore,
  renderAgentContextScoreJson,
  renderAgentContextVerify,
  renderAgentContextVerifyJson,
  renderAgentCreativitySynthesis,
  renderAgentCreativitySynthesisJson,
  renderAgentCritique,
  renderAgentCritiqueJson,
  renderAgentDream,
  renderAgentDreamJson,
  renderAgentEvidenceReceipt,
  renderAgentEvidenceReceiptJson,
  renderAgentExecutionMemory,
  renderAgentExecutionMemoryJson,
  renderAgentIdeaEvolution,
  renderAgentIdeaEvolutionJson,
  renderAgentImprovementCandidates,
  renderAgentImprovementCandidatesJson,
  renderAgentImprovementRun,
  renderAgentImprovementRunJson,
  renderAgentInteropValidation,
  renderAgentInteropValidationJson,
  renderAgentNodeContractRegistry,
  renderAgentNodeContractRegistryJson,
  renderAgentNodeContractValidation,
  renderAgentNodeContractValidationJson,
  renderAgentNodeExecutionRecord,
  renderAgentNodeExecutionRecordJson,
  renderAgentNodeIoValidation,
  renderAgentNodeIoValidationJson,
  renderAgentPlanCritique,
  renderAgentPlanCritiqueJson,
  renderAgentPlanDiff,
  renderAgentPlanDiffJson,
  renderAgentPlanPortfolio,
  renderAgentPlanPortfolioJson,
  renderAgentPlanState,
  renderAgentPlanStateJson,
  renderAgentReplan,
  renderAgentReplanJson,
  renderAgentRepairProvenance,
  renderAgentRepairProvenanceJson,
  renderAgentRepairRun,
  renderAgentRepairRunJson,
  renderAgentResearchIntake,
  renderAgentResearchIntakeJson,
  renderAgentResearchMarket,
  renderAgentResearchMarketJson,
  renderAgentReliabilityEval,
  renderAgentReliabilityEvalJson,
  renderAgentSourceRank,
  renderAgentSourceRankJson,
  renderAgentTaskEnvelope,
  renderAgentTaskEnvelopeJson,
  renderAgentTaskInteropExport,
  renderAgentTaskInteropExportJson,
  renderAgentTaskTransition,
  renderAgentTaskTransitionJson,
  renderAgentTrajectoryPolicy,
  renderAgentTrajectoryPolicyJson,
} from "../commands/agent.js";
import {
  researchDesignCommand,
  researchCritiquePacketCommand,
  researchApprovePacketCommand,
  researchApprovalVerifyCommand,
  researchManifestVerifyCommand,
  researchAnalyzeLocalCommand,
  researchCheckpointCommand,
  researchArtifactManifestCommand,
  researchLoopStatusCommand,
  researchLoopNoteCommand,
  researchCycleAuditCommand,
  researchRunnerSpecCommand,
  researchExportPacketCommand,
  researchPacketSummaryCommand,
  researchPacketNextCommand,
  researchNavigationTraceCommand,
  researchPacketVerifyCommand,
  researchPacketReadinessCommand,
  researchMethodsFrameworkCommand,
  researchValidateMethodsCommand,
  researchRegistryInspectCommand,
  researchDecomposeQuestionCommand,
  researchClarificationPlanCommand,
  researchDataQualityCommand,
  researchSelectMethodCommand,
  researchRoCrateCommand,
  researchProvenanceCommand,
  researchQaDashboardCommand,
  researchSuppressionPolicyCommand,
  researchRegistrySearchCommand,
  researchEstimandSketchCommand,
  researchSimulateStudyCommand,
  researchRealStudyReadinessCommand,
  researchDataAccessManifestCommand,
  researchDataAccessRedactCommand,
  researchRealLocalRunnerSpecCommand,
  researchRealStudyChecklistCommand,
  researchAdapterGapReportCommand,
  researchVariableMapCommand,
  researchSuggestVariableMapCommand,
  researchApplyVariableMapSuggestionsCommand,
  researchWorkflowScorecardCommand,
  researchEvidenceGapReportCommand,
  researchPacketDiffCommand,
  researchNodeProposalCommand,
  researchNodeProposalRegistryCommand,
  researchCostLedgerCommand,
  researchQuestionBankCommand,
  researchQuestionReadinessCommand,
  researchProtocolCandidatesCommand,
  researchProtocolSteerCommand,
  researchProtocolPromoteCommand,
  researchProtocolEditCommand,
  researchAnalysisSpecCommand,
  researchCohortScoutFileCommand,
  researchSemanticQualityCommand,
  researchProgressCommand,
  researchJobLifecycleCommand,
  researchRepairPlanCommand,
  researchAgentExecutionRecordCommand,
  researchWorkflowMemoryCommand,
  researchUncertaintyBudgetCommand,
  researchDatasetCandidateCommand,
  researchImprovementAgendaCommand,
  researchClaimGuardCommand,
  researchBackendStatusCommand,
  researchExploreCommand,
  researchExplorePromoteCommand,
  researchPaperIndexCommand,
  researchPaperLifecycleCommand,
  researchPaperRerunStabilityCommand,
  researchPaperRunCommand,
  researchPaperQaCommand,
  researchPaperRunnerRecordCommand,
  researchBenchmarkRegisterCommand,
  researchBenchmarkRunCommand,
  researchBenchmarkScoreCommand,
  researchBenchmarkSuiteCommand,
  researchTableSummaryCommand,
  researchInferSchemaCommand,
  researchPipelineStagesCommand,
  researchStageArtifactsCommand,
  researchStageGateCommand,
  researchReviewReportCommand,
  researchInspectPacketCommand,
  researchQuestionsCommand,
  researchScoutPlanCommand,
  renderResearchPacketCritique,
  renderResearchApproval,
  renderResearchApprovalVerification,
  renderResearchApprovalVerificationJson,
  renderResearchAnalysisResult,
  renderResearchCheckpoint,
  renderResearchCheckpointJson,
  renderResearchArtifactManifest,
  renderResearchArtifactManifestJson,
  renderResearchManifestVerification,
  renderResearchManifestVerificationJson,
  renderResearchLoopStatus,
  renderResearchLoopStatusJson,
  renderResearchLoopNote,
  renderResearchLoopNoteJson,
  renderResearchCycleAudit,
  renderResearchCycleAuditJson,
  renderResearchRunnerSpec,
  renderResearchPacketExport,
  renderResearchPacketSummary,
  renderResearchPacketSummaryJson,
  renderResearchPacketNext,
  renderResearchPacketNextJson,
  renderResearchNavigationTrace,
  renderResearchNavigationTraceJson,
  renderResearchPacketVerification,
  renderResearchPacketVerificationJson,
  renderResearchPacketReadiness,
  renderResearchPacketReadinessJson,
  renderResearchMethodsFramework,
  renderResearchMethodsFrameworkJson,
  renderResearchMethodsValidation,
  renderResearchMethodsValidationJson,
  renderResearchRegistryInspect,
  renderResearchRegistryInspectJson,
  renderResearchQuestionDecomposition,
  renderResearchQuestionDecompositionJson,
  renderResearchClarificationPlan,
  renderResearchClarificationPlanJson,
  renderResearchDataQuality,
  renderResearchDataQualityJson,
  renderResearchMethodSelection,
  renderResearchMethodSelectionJson,
  renderResearchRoCrate,
  renderResearchRoCrateJson,
  renderResearchProvenance,
  renderResearchProvenanceJson,
  renderResearchQaDashboard,
  renderResearchQaDashboardJson,
  renderResearchSuppressionPolicy,
  renderResearchSuppressionPolicyJson,
  renderResearchRegistrySearch,
  renderResearchRegistrySearchJson,
  renderResearchEstimandSketch,
  renderResearchEstimandSketchJson,
  renderResearchStudySimulation,
  renderResearchStudySimulationJson,
  renderResearchRealStudyReadiness,
  renderResearchRealStudyReadinessJson,
  renderResearchDataAccessManifest,
  renderResearchDataAccessManifestJson,
  renderResearchDataAccessRedaction,
  renderResearchDataAccessRedactionJson,
  renderResearchRealLocalRunnerSpec,
  renderResearchRealLocalRunnerSpecJson,
  renderResearchRealStudyChecklist,
  renderResearchRealStudyChecklistJson,
  renderResearchAdapterGapReport,
  renderResearchAdapterGapReportJson,
  renderResearchVariableMap,
  renderResearchVariableMapJson,
  renderResearchVariableMapSuggestion,
  renderResearchVariableMapSuggestionJson,
  renderResearchVariableMapApplyResult,
  renderResearchVariableMapApplyResultJson,
  renderResearchWorkflowScorecard,
  renderResearchWorkflowScorecardJson,
  renderResearchEvidenceGapReport,
  renderResearchEvidenceGapReportJson,
  renderResearchPacketDiff,
  renderResearchPacketDiffJson,
  renderResearchNodeProposal,
  renderResearchNodeProposalJson,
  renderResearchNodeProposalRegistry,
  renderResearchNodeProposalRegistryJson,
  renderResearchCostLedger,
  renderResearchCostLedgerJson,
  renderResearchQuestionBank,
  renderResearchQuestionBankJson,
  renderResearchQuestionReadiness,
  renderResearchQuestionReadinessJson,
  renderResearchProtocolCandidates,
  renderResearchProtocolCandidatesJson,
  renderResearchProtocolSteer,
  renderResearchProtocolSteerJson,
  renderResearchProtocolPromotion,
  renderResearchProtocolPromotionJson,
  renderResearchProtocolEdit,
  renderResearchProtocolEditJson,
  renderResearchAnalysisSpec,
  renderResearchAnalysisSpecJson,
  renderResearchCohortScoutFile,
  renderResearchCohortScoutFileJson,
  renderResearchSemanticQuality,
  renderResearchSemanticQualityJson,
  renderResearchProgress,
  renderResearchProgressJson,
  renderResearchJobLifecycle,
  renderResearchJobLifecycleJson,
  renderResearchRepairPlan,
  renderResearchRepairPlanJson,
  renderResearchAgentExecutionRecord,
  renderResearchAgentExecutionRecordJson,
  renderResearchWorkflowMemory,
  renderResearchWorkflowMemoryJson,
  renderResearchUncertaintyBudget,
  renderResearchUncertaintyBudgetJson,
  renderResearchDatasetCandidate,
  renderResearchDatasetCandidateJson,
  renderResearchImprovementAgenda,
  renderResearchImprovementAgendaJson,
  renderResearchClaimGuard,
  renderResearchClaimGuardJson,
  renderResearchBackendStatus,
  renderResearchBackendStatusJson,
  renderResearchExplore,
  renderResearchExploreJson,
  renderResearchExplorePromote,
  renderResearchExplorePromoteJson,
  renderResearchPaperIndex,
  renderResearchPaperIndexJson,
  renderResearchPaperLifecycle,
  renderResearchPaperLifecycleJson,
  renderResearchPaperRerunStability,
  renderResearchPaperRerunStabilityJson,
  renderResearchPaperRun,
  renderResearchPaperRunJson,
  renderResearchPaperQa,
  renderResearchPaperQaJson,
  renderResearchPaperRunnerRecord,
  renderResearchPaperRunnerRecordJson,
  renderResearchBenchmark,
  renderResearchBenchmarkJson,
  renderResearchBenchmarkRun,
  renderResearchBenchmarkRunJson,
  renderResearchBenchmarkScore,
  renderResearchBenchmarkScoreJson,
  renderResearchBenchmarkSuite,
  renderResearchBenchmarkSuiteJson,
  renderResearchTableSummary,
  renderResearchTableSummaryJson,
  renderResearchSchemaInference,
  renderResearchSchemaInferenceJson,
  renderResearchPipelineStages,
  renderResearchPipelineStagesJson,
  renderResearchStageArtifacts,
  renderResearchStageArtifactsJson,
  renderResearchStageGate,
  renderResearchStageGateJson,
  renderResearchReportReview,
  renderResearchReportReviewJson,
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
    case "agent":
      return agentCmd(rest);
    case "specialize":
      return specializeCmd(rest);
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
  agenteer specialize init --out <dir> [--builtin research-methods-specialist | --name <text> --domain <text> --purpose <text>] [--json]
  agenteer specialize plan --dir <dir> [--json]
  agenteer specialize generate --dir <dir> [--count <n>] [--json]
  agenteer specialize evaluate --dir <dir> [--candidate <id>] [--json]
  agenteer specialize critique --dir <dir> [--candidate <id>] [--json]
  agenteer specialize promote --dir <dir> [--candidate <id>] [--json]
  agenteer specialize inspect --dir <dir> [--json]
  agenteer specialize run-loop --dir <dir> [--count <n>] [--json]
  agenteer agent context-preflight --repo <dir> --query <text> [--target <file|symbol>] [--context-bin <path>] [--autocontext-root <dir>] [--json]
  agenteer agent context-pack --repo <dir> (--query <text> | --file <path> | --symbol <name>) [--budget <n>] [--json]
  agenteer agent context-manifest --repo <dir> --query <text> [--target <file|symbol>] [--out <json>] [--json]
  agenteer agent context-score --manifest <context-manifest.json> [--json]
  agenteer agent context-outcome --manifest <context-manifest.json> --result <result.json|txt> [--out <json>] [--json]
  agenteer agent context-impact --repo <dir> --target <file|symbol> [--json]
  agenteer agent context-verify --repo <dir> [--json]
  agenteer agent node-contract --manifest <framework-or-contract.json> [--out <node-contract.json>] [--json]
  agenteer agent node-contracts --dir <dir> [--json]
  agenteer agent node-contract-validate --contract <node-contract.json> [--json]
  agenteer agent node-io-validate --contract <node-contract.json> --kind input|output --value <json> [--json]
  agenteer agent node-output-record --contract <node-contract.json> --input <json> --output <json> [--artifact-base <dir>] [--out <json>] [--json]
  agenteer agent plan-v2 --goal <text> [--context-pack <json>] [--context-manifest <json>] [--repo <dir>] [--node-contracts <dir>] [--json]
  agenteer agent plan-state-create --plan <plan.json> [--out <state.json>] [--json]
  agenteer agent plan-state-event --state <state.json> --event <event-json-or-text> [--out <state.json>] [--json]
  agenteer agent plan-state-replan --state <state.json> --event <event-json-or-text> [--out <state.json>] [--json]
  agenteer agent plan-state-resume --state <state.json> [--json]
  agenteer agent replan --plan <plan.json> --event <event-json-or-text> [--json]
  agenteer agent plan-critic --plan <plan.json> [--rubric <json>] [--node-contracts <dir>] [--repo <dir>] [--json]
  agenteer agent plan-diff --before <plan.json> --after <plan.json> [--json]
  agenteer agent repair-run --bundle <dir> --qa <command|artifact> [--repair-command <cmd>] [--max-attempts <n>] [--max-cost-usd <n>] [--max-risk-score <n>] [--allow-file <path-or-glob>]* [--analysis-spec <json>] [--json]
  agenteer agent repair-provenance --repair-run <json> [--json]
  agenteer agent research-intake --topic <text> [--web] [--x] [--papers] [--live] [--json]
  agenteer agent source-rank --sources <json> [--json]
  agenteer agent creativity-synth --sources <json> --goal <text> [--json]
  agenteer agent idea-evolve --ideas <json> [--generations <n>] [--json]
  agenteer agent adversarial-protocols --domain <text> [--json]
  agenteer agent critic --artifact <path> --rubric <json> [--mode cold|same-context] [--json]
  agenteer agent cognitive-pool --artifact <path> [--json]
  agenteer agent context-immune-check --context <json|dir> [--json]
  agenteer agent context-denoise --context <json|dir> [--json]
  agenteer agent dream --history <dir> [--json]
  agenteer agent research-market --candidates <json> [--budget-usd <n>] [--json]
  agenteer agent improvement-candidates --goal <text> [--ideas <json>] [--plan-state <json>] [--repair-provenance <json>] [--benchmark-target <json>] [--history <dir>] [--rejected-history <dir>] [--out <json>] [--json]
  agenteer agent improvement-run --candidates <json> --benchmark-before <json> --benchmark-after <json> [--budget-usd <n>] [--tests-failed] [--override-neutral] [--override-reason <text>] [--rejected-dir <dir>] [--out <json>] [--json]
  agenteer agent reliability-eval --runs <json> [--json]
  agenteer agent trajectory-policy --trajectory <json> --state <text> [--valid-action <action>]* [--json]
  agenteer agent execution-memory --history <dir> [--json]
  agenteer agent capability-from-contract --contract <node-contract.json> [--out <capability.json>] [--json]
  agenteer agent capability-validate --capability <capability.json> [--json]
  agenteer agent evidence-receipt --artifact <path> --produced-by <id> --validator <name> [--status pass|fail|warning|unverified] [--out <receipt.json>] [--json]
  agenteer agent task-create --goal <text> --requester <id> [--capability <id>]* [--input <json-or-text>]* [--artifact <path>]* [--allow-action <action>]* [--deny-action <action>]* [--write-root <dir>]* [--max-usd <n>] [--max-runtime-seconds <n>] [--max-model-calls <n>] [--network] [--cloud] [--human-approval] [--out <task.json>] [--json]
  agenteer agent task-validate --task <task.json> [--capability <capability.json>]* [--json]
  agenteer agent task-transition --task <task.json> --status <status> [--evidence <receipt.json>]* [--reason <text>] [--out <task.json>] [--json]
  agenteer agent task-export --task <task.json> [--shape local|mcp|a2a] [--json]
  agenteer research design --project medbrevia-nhanes --repo <medbrevia_v3> --question <text> [--out <dir>]
  agenteer research questions --project medbrevia-nhanes --repo <medbrevia_v3> [--limit <n>]
  agenteer research methods-framework [--json]
  agenteer research validate-methods --packet <dir> [--json]
  agenteer research registry-inspect --registry <registry.json> [--json]
  agenteer research decompose-question --question <text> [--json]
  agenteer research clarification-plan --question <text> [--json]
  agenteer research data-quality --fixture <rows.json> [--json]
  agenteer research select-method --question <text> [--json]
  agenteer research ro-crate --packet <dir> [--json]
  agenteer research provenance --packet <dir> [--json]
  agenteer research qa-dashboard --packet <dir> [--json]
  agenteer research suppression-policy --count <n> [--threshold <n>] [--json]
  agenteer research registry-search --registry <registry.json> --query <text> [--limit <n>] [--json]
  agenteer research estimand-sketch --question <text> [--json]
  agenteer research simulate-study --project medbrevia-nhanes --repo <medbrevia_v3> --question <text> --out <dir> [--json]
  agenteer research real-study-readiness --packet <dir> [--json]
  agenteer research data-access --packet <dir> --file <path>* [--python <path>] [--json]
  agenteer research data-access-redact --packet <dir> [--json]
  agenteer research real-runner-spec --packet <dir> [--json]
  agenteer research real-study-checklist --packet <dir> [--json]
  agenteer research adapter-gap-report --packet <dir> [--json]
  agenteer research variable-map --packet <dir> --file <path> --map <VAR:COLUMN>* [--json]
  agenteer research suggest-variable-map --packet <dir> --file <rows.json|rows.csv|rows.parquet> [--python <path>] [--json]
  agenteer research apply-variable-map-suggestions --packet <dir> --file <rows.json> [--json]
  agenteer research workflow-scorecard --packet <dir> [--json]
  agenteer research evidence-gap --packet <dir> [--json]
  agenteer research packet-diff --base <dir> --compare <dir> [--json]
  agenteer research node-proposal --id <id> --purpose <text> --evaluator <text> --rollback <text> [--cost-usd <n>] [--promotion <text>*] [--json]
  agenteer research node-registry --dir <proposal-dir> [--json]
  agenteer research cost-ledger [--packet <dir>] [--proposal-dir <dir>] [--hard-stop-usd <n>] [--json]
  agenteer research question-bank [--domain <medical|public-health>] [--json]
  agenteer research question-readiness --question <text> [--json]
  agenteer research protocol-candidates --question <text> [--json]
  agenteer research protocol-steer --portfolio <candidates.json> [--prefer <text>] [--avoid <text>] [--require-variable <name>] [--json]
  agenteer research protocol-promote --portfolio <candidates.json> [--candidate <id>] [--json]
  agenteer research protocol-edit --protocol <protocol.json> [--set-title <text>] [--set-question <text>] [--cycles <csv>] [--add-covariate <LABEL:VARIABLE:DOMAIN>] [--json]
  agenteer research analysis-spec [--packet <dir> | --protocol <protocol.json>] [--json]
  agenteer research cohort-scout-file --spec <analysis-spec.json> --file <rows.json|rows.csv> [--json]
  agenteer research semantic-quality --file <rows.json|rows.csv> [--json]
  agenteer research progress --phase <phase> [--label <text>] [--detail <text>] [--next-step <text>] [--terminal] [--json]
  agenteer research job-lifecycle --job <id> --status <status> [--phase <phase>] [--json]
  agenteer research repair-plan --packet <dir> [--json]
  agenteer research agent-record --intent <text> --observation <text> --inference <text> --action <text> [--cycle <n>] [--evidence <path>] [--tag <text>] [--confidence <0..1>] [--json]
  agenteer research workflow-memory --source <updates-upgrades.md> [--json]
  agenteer research uncertainty-budget --spec <analysis-spec.json> [--scout <cohort-scout.json>] [--comparisons <n>] [--alpha <n>] [--json]
  agenteer research dataset-candidate --id <id> [--title <text>] [--source-url <url>] [--modality <name>] [--row-count <n>] [--license <id>] [--synthetic] [--intended-use <use>] [--json]
  agenteer research improvement-agenda --candidate <ID:IMPACT:CONFIDENCE:COST_USD:RISK[:TITLE]> [--budget-usd <n>] [--json]
  agenteer research claim-guard --report <report.md> [--spec <analysis-spec.json>] [--json]
  agenteer research machine-status [--data-root <dir>] [--python <python>] [--rscript <Rscript>] [--json]
  agenteer research dataset-register --id <id> (--source <file|dir|gs://prefix> | --from-manifest <json>) --out-dir <dir> [--title <text>] [--description <text>] [--domain <domain>] [--license <text>] [--max-tables <n>] [--max-rows <n>] [--python <path>] [--json]
  agenteer research dataset-inspect --dataset-dir <dir> [--json]
  agenteer research dataset-profile --dataset-dir <dir> [--json]
  agenteer research dataset-relationships --dataset-dir <dir> [--json]
  agenteer research dataset-questions --dataset-dir <dir> [--json]
  agenteer research dataset-describe --dataset-dir <dir> [--json]
  agenteer research dataset-spec --study <study.json> --dataset-dir <dir> [--out <analysis-spec-v2.json>] [--json]
  agenteer research dataset-run --analysis-spec <analysis-spec-v2.json> --dataset-dir <dir> --out-dir <dir> [--max-usd <n>] [--allow-gcs] [--python <path>] [--json]
  agenteer research dataset-run-index --run-root <dir> [--out <index.json>] [--report <index.md>] [--json]
  agenteer research phenotype-list [--out <registry.json>] [--json]
  agenteer research phenotype-inspect (--id <phenotype-id> | --phenotype <phenotype.json>) [--out <review.json>] [--json]
  agenteer research phenotype-review (--id <phenotype-id> | --phenotype <phenotype.json>) --dictionary <codes.csv|json> [--system <system>] [--web] [--out-dir <dir> | --out <json>] [--json]
  agenteer research phenotype-match (--id <phenotype-id> | --phenotype <phenotype.json>) --dictionary <codes.csv|json> [--system <system>] [--sensitivity <id>] [--out <json>] [--json]
  agenteer research spec-v2 --spec <analysis-spec.json> [--out <analysis-spec-v2.json>] [--json]
  agenteer research execution-contract --spec <analysis-spec-v2.json> [--backend <id>] [--data-root <dir>] [--out-dir <dir>] [--json]
  agenteer research archetypes [--id <archetype-id>] [--json]
  agenteer research methods-catalog [--category <category>] [--method <id>] [--json]
  agenteer research method-select --question <text> [--outcome <type>] [--study-design <design>] [--data-structure <name|csv>]* [--dataset <id>] [--goal <goal>] [--survey] [--repeated] [--clustered] [--time-to-event] [--high-dimensional] [--text] [--image] [--spatial] [--network] [--max-candidates <n>] [--out <selection.json>] [--json]
  agenteer research method-apply --spec <analysis-spec.json> --selection <selection.json> [--out <analysis-spec-v2.json>] [--json]
  agenteer research method-validate --spec <analysis-spec.json> --method <id> [--json]
  agenteer research literature-search --question <text> [--base-url <url>] [--endpoint <path>] [--api-key <key>] [--bearer-token <token>] [--cookie <cookie>] [--auth-secret <secret>] [--user-id <id>] [--user-email <email>] [--depth quick|standard|long] [--date-range <range>] [--high-impact] [--top-k <n>] [--timeout-ms <n>] [--mock-response <json>] [--out <json>] [--report <md>] [--json]
  agenteer research literature-context --literature <literature-search.json> [--question <text>] [--out <json>] [--report <md>] [--json]
  agenteer research literature-qa --literature <literature-search.json> [--question <text>] [--paper <paper.md>] [--out <json>] [--report <md>] [--json]
  agenteer research modeling-plan --question <text> [--goal <goal>] [--outcome <type>] [--study-design <design>] [--data-structure <name|csv>]* [--table <rows.csv|json|parquet> | --table-summary <summary.json> | --exploration-handoff <handoff.json>] [--literature <literature-search-or-context.json>] [--backend-status <machine-status.json>] [--prior-run <stats-run.json|ml-run.json>]* [--target <column>] [--survey] [--repeated] [--clustered] [--time-to-event] [--high-dimensional] [--text] [--image] [--spatial] [--network] [--row-count <n>] [--feature-count <n>] [--class-count <n>] [--high-missingness] [--small-sample] [--predict] [--no-inference] [--max-candidates <n>] [--json]
  agenteer research analysis-run --question <text> --method <stats-method> --data <rows.csv|json|parquet> --out-dir <dir> [--outcome <col>] [--exposure <col>] [--group <col>] [--time <col>] [--event <col>] [--id <col>] [--strata <col>] [--cluster <col>] [--period <col>] [--post <col>] [--running-variable <col>] [--cutoff <n>] [--instrument <col>] [--alpha-penalty <n>] [--l1-ratio <n>] [--outcome-threshold <n>] [--exposure-threshold <n>] [--covariate <col>]* [--exact-covariate <col>]* [--variable <col>]* [--estimand ATE|ATT] [--match-ratio <n>] [--caliper <n>] [--replacement] [--trim-threshold <n>] [--no-stabilize-weights] [--method-selection <json>] [--analysis-spec <json>] [--literature <literature-search.json>] [--require-bound] [--survey] [--allow-survey-approximation] [--python <path>] [--json]
  agenteer research analysis-manifest --run-dir <dir> [--out <analysis-run-manifest.json>] [--require-ready] [--json]
  agenteer research analysis-benchmark --run-dir <dir>* [--require-ready] [--require-multi-route] [--out <json>] [--report <md>] [--json]
  agenteer research dataset-adapter --dataset <id> [--data-root <dir>] [--json]
  agenteer research machine-plan --question <text> [--dataset <id>] [--archetype <id>] [--backend <id>] [--data-root <dir>] [--json]
  agenteer research machine-benchmark --packet <dir> [--spec <analysis-spec.json>] [--out <benchmark-eval.json>] [--json]
  agenteer research ml-models [--task <task>] [--include-unavailable] [--json]
  agenteer research ml-run --task <task> --model <id> --data <rows.csv|json|parquet> [--target <column>] [--feature <column>]* --out-dir <dir> [--primary-metric <metric>] [--test-size <n>] [--seed <n>] [--scale] [--cv <folds>] [--python <path>] [--json]
  agenteer research ml-compare --task <task> --data <rows.csv|json|parquet> --model <id>* [--target <column>] [--feature <column>]* --out-dir <dir> [--primary-metric <metric>] [--scale] [--cv <folds>] [--python <path>] [--json]
  agenteer research ml-inspect --run <ml-run.json> [--json]
  agenteer research stats-run --method <method> --data <rows.csv|json|parquet> --out-dir <dir> [--outcome <column>] [--exposure <column>] [--group <column>] [--time <column>] [--event <column>] [--id <column>] [--strata <column>] [--cluster <column>] [--period <column>] [--post <column>] [--running-variable <column>] [--cutoff <n>] [--instrument <column>] [--alpha-penalty <n>] [--l1-ratio <n>] [--outcome-threshold <n>] [--exposure-threshold <n>] [--variable <column>]* [--covariate <column>]* [--exact-covariate <column>]* [--weight <column>] [--estimand ATE|ATT] [--match-ratio <n>] [--caliper <n>] [--replacement] [--trim-threshold <n>] [--no-stabilize-weights] [--method-selection <json>] [--analysis-spec <json>] [--survey] [--allow-survey-approximation] [--alpha <n>] [--python <path>] [--json]
  agenteer research figure-qa --figures <figures.json> [--out <figure-qa.json>] [--report <figure-qa.md>] [--json]
  agenteer research explore --data <rows.csv|json|parquet> [--out-dir <dir>] [--target <column>] [--max-pairs <n>] [--python <path>] [--json]
  agenteer research explore-promote --exploration <exploration.json> --question <id> [--methods-review-note <text>] [--out <handoff.json>] [--json]
  agenteer research explore-plan --exploration <exploration.json> --question <id> [--dataset <id>] [--methods-review-note <text>] [--out <formal-plan.json>] [--json]
  agenteer research method-qa --run-dir <dir> [--out <method-qa.json>] [--report <method-qa.md>] [--json]
  agenteer research manuscript --run-dir <dir> [--out <manuscript.md>] [--qa-out <manuscript-qa.json>] [--json]
  agenteer research run-inspect --run-dir <dir> [--out <run-inspection.json>] [--report <run-inspection.md>] [--json]
  agenteer research controller-init --question <text> --out-dir <dir> [--data <rows.csv|json|parquet>] [--method <stats-method>] [--outcome <col>] [--exposure <col>] [--covariate <col>]* [--controller openai:gpt-5.4] [--use-model] [--context] [--literature] [--json]
  agenteer research controller-step --state <controller-state.json> [--env-file <path>] [--json]
  agenteer research controller-patch --state <controller-state.json> --patch <json|file.json> [--reason <text>] [--json]
  agenteer research controller-resume --state <controller-state.json> [--force] [--reason <text>] [--json]
  agenteer research controller-tool --state <controller-state.json> --tool npm-build|npm-test|controller-inspect|controller-read-artifact|controller-read-file|controller-search-repo|controller-run-agenteer|controller-git-diff|controller-propose-patch|controller-apply-patch|controller-verify-patch|controller-rollback-patch [--arg <test-file|artifact-kind|repo-path|query|agenteer-arg|proposal-json|proposal-selector|apply-selector>] --reason <text> [--json]
  agenteer research controller-agenda --state <controller-state.json> [--reason <text>] [--json]
  agenteer research controller-audit --state <controller-state.json> [--reason <text>] [--json]
  agenteer research controller-capabilities --state <controller-state.json> [--reason <text>] [--json]
  agenteer research controller-env --state <controller-state.json> [--reason <text>] [--json]
  agenteer research controller-doctor --state <controller-state.json> [--reason <text>] [--json]
  agenteer research controller-goal-audit --state <controller-state.json> [--objective <text>] [--reason <text>] [--json]
  agenteer research controller-completion-audit --state <controller-state.json> [--reason <text>] [--json]
  agenteer research controller-repair-cycle --state <controller-state.json> [--max-steps <n>] [--force] [--reason <text>] [--json]
  agenteer research controller-runbook --state <controller-state.json> [--reason <text>] [--json]
  agenteer research controller-runner-packet --state <controller-state.json> [--reason <text>] [--json]
  agenteer research controller-self-test --out-dir <dir> [--objective <text>] [--json]
  agenteer research controller-follow-agenda --state <controller-state.json> [--max-steps <n>] [--force] [--reason <text>] [--json]
  agenteer research controller-follow-loop --state <controller-state.json> [--max-iterations <n>] [--max-steps-per-run <n>] [--force] [--reason <text>] [--json]
  agenteer research controller-operate --state <controller-state.json> [--max-cycles <n>] [--max-rounds <n>] [--max-iterations-per-round <n>] [--max-steps-per-run <n>] [--force] [--reason <text>] [--json]
  agenteer research controller-supervise --state <controller-state.json> [--max-rounds <n>] [--max-iterations-per-round <n>] [--max-steps-per-run <n>] [--force] [--reason <text>] [--json]
  agenteer research controller-run (--state <controller-state.json> | --question <text> --out-dir <dir>) [--data <rows.csv|json|parquet>] [--method <stats-method>] [--outcome <col>] [--exposure <col>] [--covariate <col>]* [--controller openai:gpt-5.4] [--use-model] [--require-controller-model] [--context] [--require-context] [--context-repo <dir>] [--context-target <file|symbol>] [--context-bin <path>] [--context-budget <tokens>] [--literature] [--literature-mock-response <json>] [--external-review] [--mock-review] [--no-auto-repair] [--max-auto-repairs <n>] [--max-steps <n>] [--json]
  agenteer research controller-inspect --state <controller-state.json> [--json]
  agenteer research run-autonomous --question <text> --out-dir <dir> [same options as controller-run]
  agenteer research reviewer-providers [--env-file <path>] [--json]
  agenteer research study-critic --run-dir <dir> [--stage protocol|analysis_spec|feasibility|method|execution|manuscript|final] [--panel default|cheap|strict|all|deepseek-dual|deepseek-triple] [--reviewer provider:model]* [--autonomy conservative|balanced|aggressive] [--env-file <path>] [--mock] [--json]
  agenteer research review-adjudicate --panel <review-panel.json> [--out <json>] [--json]
  agenteer research review-response --adjudication <review-adjudication.json> [--run-dir <dir>] [--autonomy conservative|balanced|aggressive] [--out <json>] [--state-reentry <json>] [--json]
  agenteer research benchmark-suite-run --suite <dir> [--out-dir <dir>] [--out <json>] [--report <md>] [--json]
  agenteer research benchmark-trend --history <dir> [--out <json>] [--report <md>] [--json]
  agenteer research backend-status [--python <python>] [--rscript <Rscript>] [--json]
  agenteer research paper-qa --paper <paper.md> [--evidence <analysis.json>] [--json]
  agenteer research paper-index --papers-dir <dir> [--out <INDEX.md>] [--json]
  agenteer research paper-lifecycle --paper-dir <dir> [--capability-dir <dir>] [--out <SUMMARY.md>] [--json]
  agenteer research paper-rerun-stability --baseline <paper-dir> --repeat <paper-dir> [--tolerance <n>] [--out <json>] [--json]
  agenteer research paper-run --analysis-spec <json> --data-root <dir> --out-dir <dir> [--backend python-linearized|r-survey] [--python <python>] [--rscript <Rscript>] [--capability-dir <dir>] [--json]
  agenteer research paper-runner-record --paper-id <id> --command-summary <text> [--status succeeded|failed|stopped] [--runner-kind <kind>] [--analysis-spec <json>] [--binding spec-governed|retrospective|none] [--input <file>]* [--output <file>]* [--weighting <text>] [--variance <text>] [--population <text>] [--out <json>] [--json]
  agenteer research benchmark-register --packet <dir> [--out <benchmark.json>] [--id <id>] [--domain <text>] [--json]
  agenteer research benchmark-run --benchmark <benchmark.json> [--out <run.json>] [--json]
  agenteer research benchmark-score --run <benchmark-run.json> [--json]
  agenteer research benchmark-suite --dir <golden-dir> [--out <suite.json>] [--json]
  agenteer research table-summary --file <rows.json|rows.csv|rows.parquet> [--python <path>] [--json]
  agenteer research infer-schema --file <rows.json> [--json]
  agenteer research pipeline-stages [--json]
  agenteer research stage-artifacts [--json]
  agenteer research stage-gate --completed <stage,csv> --target <stage> [--json]
  agenteer research inspect --packet <dir>
  agenteer research critique --packet <dir>
  agenteer research scout --packet <dir>
  agenteer research approve --packet <dir> [--note <text>]
  agenteer research approval-verify --packet <dir> [--json]
  agenteer research analyze --packet <dir> --fixture <rows.json>
  agenteer research review-report --packet <dir> [--json]
  agenteer research manifest --packet <dir> [--json]
  agenteer research manifest-verify --packet <dir> [--json]
  agenteer research runner-spec --packet <dir>
  agenteer research export --packet <dir> --out <dir>
  agenteer research next --packet <dir> [--trace] [--exit-zero-on-blocked] [--json]
  agenteer research navigation-trace --packet <dir> [--json]
  agenteer research packet-verify --packet <dir> [--json]
  agenteer research packet-readiness --packet <dir> [--json]
  agenteer research packet-summary --packet <dir> [--json]
  agenteer research loop-status [--state <dir>] [--json]
  agenteer research loop-note --cycle <n> --summary <text> [--next <text>] [--state <dir>]
  agenteer research cycle-audit --cycle-dir <dir> [--json]
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

async function specializeCmd(argv: readonly string[]): Promise<number> {
  const [sub, ...rest] = argv;
  const { flags } = parseArgs(rest);
  const json = flags.json === true;
  switch (sub) {
    case "init": {
      const outDir = requireFlagString(flags, "out");
      const builtin = flagString(flags, "builtin");
      const result = await specializationInitCommand({
        outDir,
        ...(builtin === "research-methods-specialist" ? { builtin } : {}),
        ...(flagString(flags, "name") ? { name: flagString(flags, "name")! } : {}),
        ...(flagString(flags, "domain") ? { domain: flagString(flags, "domain")! } : {}),
        ...(flagString(flags, "purpose") ? { purpose: flagString(flags, "purpose")! } : {}),
      });
      console.log(json ? JSON.stringify(result, null, 2) : `initialized specialization ${result.id} at ${result.persistence.rootDir}`);
      return 0;
    }
    case "plan": {
      const result = await specializationPlanCommand(requireFlagString(flags, "dir"));
      console.log(json ? JSON.stringify(result, null, 2) : renderSpecializationPlan(result));
      return result.risks.some((r) => /No fixtures|No evaluators|No candidate/.test(r)) ? 1 : 0;
    }
    case "generate": {
      const result = await specializationGenerateCommand(requireFlagString(flags, "dir"), parsePositiveIntFlag(flags, "count", 3));
      console.log(json ? JSON.stringify(result, null, 2) : `generated ${result.length} candidate(s): ${result.map((c) => c.id).join(", ")}`);
      return 0;
    }
    case "evaluate": {
      const result = await specializationEvaluateCommand(requireFlagString(flags, "dir"), flagString(flags, "candidate") ?? undefined);
      console.log(json ? JSON.stringify(result, null, 2) : `evaluated ${result.length} fixture result(s): ${result.filter((e) => e.result === "pass").length} pass, ${result.filter((e) => e.result === "fail").length} fail`);
      return result.some((e) => e.result === "fail") ? 1 : 0;
    }
    case "critique": {
      const result = await specializationCritiqueCommand(requireFlagString(flags, "dir"), flagString(flags, "candidate") ?? undefined);
      console.log(json ? JSON.stringify(result, null, 2) : `critiqued ${result.length} candidate(s): ${result.map((c) => `${c.candidateId}=${c.recommendation}`).join(", ")}`);
      return result.some((c) => c.recommendation === "reject") ? 1 : 0;
    }
    case "promote": {
      const result = await specializationPromoteCommand(requireFlagString(flags, "dir"), flagString(flags, "candidate") ?? undefined);
      console.log(json ? JSON.stringify(result, null, 2) : `promotion decisions: ${result.map((d) => `${d.candidateId}=${d.decision}`).join(", ")}`);
      return result.some((d) => d.decision !== "promoted") ? 1 : 0;
    }
    case "inspect": {
      const result = await specializationInspectCommand(requireFlagString(flags, "dir"));
      console.log(json ? JSON.stringify(result, null, 2) : renderSpecializationInspect(result));
      return 0;
    }
    case "run-loop": {
      const result = await specializationRunLoopCommand(requireFlagString(flags, "dir"), {
        count: parsePositiveIntFlag(flags, "count", 3),
      });
      console.log(json ? JSON.stringify(result, null, 2) : renderSpecializationReport(result));
      return result.cycleAccounting.fullCycle ? 0 : 1;
    }
    default:
      console.error(`specialize: unknown subcommand '${sub ?? ""}'`);
      console.error("usage: agenteer specialize init|plan|generate|evaluate|critique|promote|inspect|run-loop ...");
      return 2;
  }
}

async function agentCmd(argv: readonly string[]): Promise<number> {
  const [sub, ...rest] = argv;
  const { flags } = parseArgs(rest);
  const contextOpts = {
    contextBin: flagString(flags, "context-bin") ?? undefined,
    autocontextRoot: flagString(flags, "autocontext-root") ?? undefined,
  };
  switch (sub) {
    case "context-preflight": {
      const result = await agentContextPreflightCommand(requireFlagString(flags, "repo"), requireFlagString(flags, "query"), {
        ...contextOpts,
        target: flagString(flags, "target") ?? undefined,
        budget: flagString(flags, "budget") ? Number(flagString(flags, "budget")) : undefined,
      });
      console.log(flags.json === true ? renderAgentContextPreflightJson(result) : renderAgentContextPreflight(result));
      return result.status.ok && result.pack.ok && !result.staleOrMissing ? 0 : 1;
    }
    case "context-pack": {
      const query = flagString(flags, "query");
      const file = flagString(flags, "file");
      const symbol = flagString(flags, "symbol");
      const seed = query ? { kind: "query" as const, value: query } : file ? { kind: "file" as const, value: file } : symbol ? { kind: "symbol" as const, value: symbol } : null;
      if (!seed) throw new Error("context-pack requires --query, --file, or --symbol");
      const result = await agentContextPackCommand(requireFlagString(flags, "repo"), seed, {
        ...contextOpts,
        budget: flagString(flags, "budget") ? Number(flagString(flags, "budget")) : undefined,
      });
      console.log(flags.json === true ? renderAgentContextPackJson(result) : renderAgentContextPack(result));
      return result.result.ok ? 0 : 1;
    }
    case "context-manifest": {
      const result = await agentContextManifestCommand(requireFlagString(flags, "repo"), requireFlagString(flags, "query"), {
        ...contextOpts,
        target: flagString(flags, "target") ?? undefined,
        budget: flagString(flags, "budget") ? Number(flagString(flags, "budget")) : undefined,
        outPath: flagString(flags, "out") ?? undefined,
      });
      console.log(flags.json === true ? renderAgentContextManifestJson(result) : renderAgentContextManifest(result));
      return result.status === "blocked" ? 1 : 0;
    }
    case "context-score": {
      const result = await agentContextScoreCommand(requireFlagString(flags, "manifest"));
      console.log(flags.json === true ? renderAgentContextScoreJson(result) : renderAgentContextScore(result));
      return result.status === "blocked" ? 1 : 0;
    }
    case "context-outcome": {
      const result = await agentContextOutcomeCommand(requireFlagString(flags, "manifest"), requireFlagString(flags, "result"), {
        outPath: flagString(flags, "out") ?? undefined,
      });
      console.log(flags.json === true ? renderAgentContextManifestJson(result) : renderAgentContextManifest(result));
      return result.status === "blocked" ? 1 : 0;
    }
    case "context-impact": {
      const result = await agentContextImpactCommand(requireFlagString(flags, "repo"), requireFlagString(flags, "target"), contextOpts);
      console.log(flags.json === true ? renderAgentContextImpactJson(result) : renderAgentContextImpact(result));
      return result.result.ok ? 0 : 1;
    }
    case "context-verify": {
      const result = await agentContextVerifyCommand(requireFlagString(flags, "repo"), contextOpts);
      console.log(flags.json === true ? renderAgentContextVerifyJson(result) : renderAgentContextVerify(result));
      return result.result.ok ? 0 : 1;
    }
    case "node-contract": {
      const result = await agentNodeContractCommand(requireFlagString(flags, "manifest"), { outPath: flagString(flags, "out") ?? undefined });
      console.log(flags.json === true ? renderAgentNodeContractValidationJson(result) : renderAgentNodeContractValidation(result));
      return result.status === "blocked" ? 1 : 0;
    }
    case "node-contracts": {
      const result = await agentNodeContractsCommand(requireFlagString(flags, "dir"));
      console.log(flags.json === true ? renderAgentNodeContractRegistryJson(result) : renderAgentNodeContractRegistry(result));
      return result.issues.some(issue => issue.severity === "blocker") ? 1 : 0;
    }
    case "node-contract-validate": {
      const result = await agentNodeContractValidateCommand(requireFlagString(flags, "contract"));
      console.log(flags.json === true ? renderAgentNodeContractValidationJson(result) : renderAgentNodeContractValidation(result));
      return result.status === "blocked" ? 1 : 0;
    }
    case "node-io-validate": {
      const rawKind = requireFlagString(flags, "kind");
      if (rawKind !== "input" && rawKind !== "output") {
        console.error("node-io-validate: --kind must be input or output");
        return 2;
      }
      const result = await agentNodeIoValidateCommand(requireFlagString(flags, "contract"), rawKind, requireFlagString(flags, "value"));
      console.log(flags.json === true ? renderAgentNodeIoValidationJson(result) : renderAgentNodeIoValidation(result));
      return result.status === "pass" ? 0 : 1;
    }
    case "node-output-record": {
      const result = await agentNodeOutputRecordCommand(requireFlagString(flags, "contract"), requireFlagString(flags, "input"), requireFlagString(flags, "output"), {
        artifactBaseDir: flagString(flags, "artifact-base") ?? undefined,
        outPath: flagString(flags, "out") ?? undefined,
      });
      console.log(flags.json === true ? renderAgentNodeExecutionRecordJson(result) : renderAgentNodeExecutionRecord(result));
      return result.status === "passed" ? 0 : 1;
    }
    case "plan-v2": {
      const result = await agentPlanV2Command(requireFlagString(flags, "goal"), { contextPackPath: flagString(flags, "context-pack") ?? undefined, contextManifestPath: flagString(flags, "context-manifest") ?? undefined, repo: flagString(flags, "repo") ?? undefined, nodeContractDir: flagString(flags, "node-contracts") ?? undefined });
      console.log(flags.json === true ? renderAgentPlanPortfolioJson(result) : renderAgentPlanPortfolio(result));
      return result.selectedCandidateId ? 0 : 1;
    }
    case "plan-state-create": {
      const result = await agentPlanStateCreateCommand(requireFlagString(flags, "plan"), { outPath: flagString(flags, "out") ?? undefined });
      console.log(flags.json === true ? renderAgentPlanStateJson(result) : renderAgentPlanState(result));
      return 0;
    }
    case "plan-state-event": {
      const result = await agentPlanStateEventCommand(requireFlagString(flags, "state"), await readArgOrFile(requireFlagString(flags, "event")), { outPath: flagString(flags, "out") ?? undefined });
      console.log(flags.json === true ? renderAgentPlanStateJson(result) : renderAgentPlanState(result));
      return result.currentStatus === "blocked" ? 1 : 0;
    }
    case "plan-state-replan": {
      const result = await agentPlanStateReplanCommand(requireFlagString(flags, "state"), await readArgOrFile(requireFlagString(flags, "event")), { outPath: flagString(flags, "out") ?? undefined });
      console.log(flags.json === true ? renderAgentPlanStateJson(result) : renderAgentPlanState(result));
      return 0;
    }
    case "plan-state-resume": {
      const result = await agentPlanStateResumeCommand(requireFlagString(flags, "state"));
      console.log(flags.json === true ? renderAgentPlanStateJson(result) : renderAgentPlanState(result));
      return 0;
    }
    case "replan": {
      const result = await agentReplanCommand(requireFlagString(flags, "plan"), await readArgOrFile(requireFlagString(flags, "event")));
      console.log(flags.json === true ? renderAgentReplanJson(result) : renderAgentReplan(result));
      return 0;
    }
    case "plan-critic": {
      const result = await agentPlanCriticCommand(requireFlagString(flags, "plan"), flagString(flags, "rubric") ?? undefined, {
        nodeContractDir: flagString(flags, "node-contracts") ?? undefined,
        repo: flagString(flags, "repo") ?? undefined,
      });
      console.log(flags.json === true ? renderAgentPlanCritiqueJson(result) : renderAgentPlanCritique(result));
      return result.status === "blocked" ? 1 : 0;
    }
    case "plan-diff": {
      const result = await agentPlanDiffCommand(requireFlagString(flags, "before"), requireFlagString(flags, "after"));
      console.log(flags.json === true ? renderAgentPlanDiffJson(result) : renderAgentPlanDiff(result));
      return 0;
    }
    case "repair-run": {
      const result = await agentRepairRunCommand(requireFlagString(flags, "bundle"), requireFlagString(flags, "qa"), {
        maxAttempts: flagString(flags, "max-attempts") ? Number(flagString(flags, "max-attempts")) : undefined,
        repairCommand: flagString(flags, "repair-command") ?? undefined,
        maxCostUsd: flagString(flags, "max-cost-usd") ? Number(flagString(flags, "max-cost-usd")) : undefined,
        maxRiskScore: flagString(flags, "max-risk-score") ? Number(flagString(flags, "max-risk-score")) : undefined,
        allowedFiles: flagList(flags, "allow-file"),
        analysisSpecPath: flagString(flags, "analysis-spec") ?? undefined,
      });
      console.log(flags.json === true ? renderAgentRepairRunJson(result) : renderAgentRepairRun(result));
      return result.finalStatus === "passed" ? 0 : 1;
    }
    case "repair-provenance": {
      const result = await agentRepairProvenanceCommand(requireFlagString(flags, "repair-run"));
      console.log(flags.json === true ? renderAgentRepairProvenanceJson(result) : renderAgentRepairProvenance(result));
      return 0;
    }
    case "research-intake": {
      const result = await agentResearchIntakeCommand(requireFlagString(flags, "topic"), {
        web: flags.web === true,
        x: flags.x === true,
        papers: flags.papers === true,
        live: flags.live === true,
      });
      console.log(flags.json === true ? renderAgentResearchIntakeJson(result) : renderAgentResearchIntake(result));
      return 0;
    }
    case "source-rank": {
      const result = await agentSourceRankCommand(requireFlagString(flags, "sources"));
      console.log(flags.json === true ? renderAgentSourceRankJson(result) : renderAgentSourceRank(result));
      return 0;
    }
    case "creativity-synth": {
      const result = await agentCreativitySynthCommand(requireFlagString(flags, "sources"), requireFlagString(flags, "goal"));
      console.log(flags.json === true ? renderAgentCreativitySynthesisJson(result) : renderAgentCreativitySynthesis(result));
      return 0;
    }
    case "idea-evolve": {
      const result = await agentIdeaEvolveCommand(requireFlagString(flags, "ideas"), flagString(flags, "generations") ? Number(flagString(flags, "generations")) : undefined);
      console.log(flags.json === true ? renderAgentIdeaEvolutionJson(result) : renderAgentIdeaEvolution(result));
      return 0;
    }
    case "adversarial-protocols": {
      const result = agentAdversarialProtocolsCommand(requireFlagString(flags, "domain"));
      console.log(flags.json === true ? renderAgentAdversarialProtocolsJson(result) : renderAgentAdversarialProtocols(result));
      return 0;
    }
    case "critic": {
      const mode = flagString(flags, "mode") === "same-context" ? "same-context" : "cold";
      const result = await agentCriticCommand(requireFlagString(flags, "artifact"), requireFlagString(flags, "rubric"), mode);
      console.log(flags.json === true ? renderAgentCritiqueJson(result) : renderAgentCritique(result));
      return result.status === "blocked" ? 1 : 0;
    }
    case "cognitive-pool": {
      const result = await agentCognitivePoolCommand(requireFlagString(flags, "artifact"));
      console.log(flags.json === true ? renderAgentCognitivePoolJson(result) : renderAgentCognitivePool(result));
      return result.consensus === "blocked" ? 1 : 0;
    }
    case "context-immune-check": {
      const result = await agentContextImmuneCheckCommand(requireFlagString(flags, "context"));
      console.log(flags.json === true ? renderAgentContextImmuneCheckJson(result) : renderAgentContextImmuneCheck(result));
      return result.items.some(item => item.action === "quarantine") ? 1 : 0;
    }
    case "context-denoise": {
      const result = await agentContextDenoiseCommand(requireFlagString(flags, "context"));
      console.log(flags.json === true ? renderAgentContextDenoiseJson(result) : renderAgentContextDenoise(result));
      return result.quarantined ? 1 : 0;
    }
    case "dream": {
      const result = await agentDreamCommand(requireFlagString(flags, "history"));
      console.log(flags.json === true ? renderAgentDreamJson(result) : renderAgentDream(result));
      return 0;
    }
    case "research-market": {
      const result = await agentResearchMarketCommand(requireFlagString(flags, "candidates"), flagString(flags, "budget-usd") ? Number(flagString(flags, "budget-usd")) : undefined);
      console.log(flags.json === true ? renderAgentResearchMarketJson(result) : renderAgentResearchMarket(result));
      return result.funded.length ? 0 : 1;
    }
    case "improvement-candidates": {
      const result = await agentImprovementCandidatesCommand({
        goal: requireFlagString(flags, "goal"),
        ideasPath: flagString(flags, "ideas") ?? undefined,
        planStatePath: flagString(flags, "plan-state") ?? undefined,
        repairProvenancePath: flagString(flags, "repair-provenance") ?? undefined,
        benchmarkTarget: flagString(flags, "benchmark-target") ?? undefined,
        historyDir: flagString(flags, "history") ?? undefined,
        rejectedHistoryDir: flagString(flags, "rejected-history") ?? undefined,
        outPath: flagString(flags, "out") ?? undefined,
      });
      console.log(flags.json === true ? renderAgentImprovementCandidatesJson(result) : renderAgentImprovementCandidates(result));
      return result.length ? 0 : 1;
    }
    case "improvement-run": {
      const result = await agentImprovementRunCommand({
        candidatesPath: requireFlagString(flags, "candidates"),
        benchmarkBeforePath: requireFlagString(flags, "benchmark-before"),
        benchmarkAfterPath: requireFlagString(flags, "benchmark-after"),
        budgetUsd: flagString(flags, "budget-usd") ? Number(flagString(flags, "budget-usd")) : undefined,
        testsPassed: flags["tests-failed"] === true ? false : true,
        overrideNeutral: flags["override-neutral"] === true,
        overrideReason: flagString(flags, "override-reason") ?? undefined,
        rejectedDir: flagString(flags, "rejected-dir") ?? undefined,
        outPath: flagString(flags, "out") ?? undefined,
      });
      console.log(flags.json === true ? renderAgentImprovementRunJson(result) : renderAgentImprovementRun(result));
      return result.promoted.length ? 0 : 1;
    }
    case "reliability-eval": {
      const result = await agentReliabilityEvalCommand(requireFlagString(flags, "runs"));
      console.log(flags.json === true ? renderAgentReliabilityEvalJson(result) : renderAgentReliabilityEval(result));
      return result.issues.some(issue => issue.severity === "blocker") ? 1 : 0;
    }
    case "trajectory-policy": {
      const result = await agentTrajectoryPolicyCommand(requireFlagString(flags, "trajectory"), requireFlagString(flags, "state"), flagList(flags, "valid-action"));
      console.log(flags.json === true ? renderAgentTrajectoryPolicyJson(result) : renderAgentTrajectoryPolicy(result));
      return result.recommendedAction ? 0 : 1;
    }
    case "execution-memory": {
      const result = await agentExecutionMemoryCommand(requireFlagString(flags, "history"));
      console.log(flags.json === true ? renderAgentExecutionMemoryJson(result) : renderAgentExecutionMemory(result));
      return 0;
    }
    case "capability-from-contract": {
      const result = await agentCapabilityFromContractCommand(requireFlagString(flags, "contract"), { outPath: flagString(flags, "out") ?? undefined });
      console.log(flags.json === true ? renderAgentCapabilityDeclarationJson(result) : renderAgentCapabilityDeclaration(result));
      return 0;
    }
    case "capability-validate": {
      const result = await agentCapabilityValidateCommand(requireFlagString(flags, "capability"));
      console.log(flags.json === true ? renderAgentInteropValidationJson(result) : renderAgentInteropValidation(result));
      return result.status === "blocked" ? 1 : 0;
    }
    case "evidence-receipt": {
      const result = await agentEvidenceReceiptCommand({
        artifact: requireFlagString(flags, "artifact"),
        producedBy: requireFlagString(flags, "produced-by"),
        validator: requireFlagString(flags, "validator"),
        status: flagString(flags, "status") as Parameters<typeof agentEvidenceReceiptCommand>[0]["status"],
        outPath: flagString(flags, "out") ?? undefined,
      });
      console.log(flags.json === true ? renderAgentEvidenceReceiptJson(result) : renderAgentEvidenceReceipt(result));
      return 0;
    }
    case "task-create": {
      const result = await agentTaskCreateCommand({
        goal: requireFlagString(flags, "goal"),
        requester: requireFlagString(flags, "requester"),
        capabilities: flagList(flags, "capability"),
        inputs: flagList(flags, "input"),
        artifacts: flagList(flags, "artifact"),
        allowedActions: flagList(flags, "allow-action"),
        deniedActions: flagList(flags, "deny-action"),
        writeRoots: flagList(flags, "write-root"),
        maxUsd: flagString(flags, "max-usd") ? Number(flagString(flags, "max-usd")) : undefined,
        maxRuntimeSeconds: flagString(flags, "max-runtime-seconds") ? Number(flagString(flags, "max-runtime-seconds")) : undefined,
        maxModelCalls: flagString(flags, "max-model-calls") ? Number(flagString(flags, "max-model-calls")) : undefined,
        networkAllowed: flags.network === true,
        cloudAllowed: flags.cloud === true,
        humanApprovalRequired: flags["human-approval"] === true,
        outPath: flagString(flags, "out") ?? undefined,
      });
      console.log(flags.json === true ? renderAgentTaskEnvelopeJson(result) : renderAgentTaskEnvelope(result));
      return 0;
    }
    case "task-validate": {
      const result = await agentTaskValidateCommand(requireFlagString(flags, "task"), { capabilityPaths: flagList(flags, "capability") });
      console.log(flags.json === true ? renderAgentInteropValidationJson(result) : renderAgentInteropValidation(result));
      return result.status === "blocked" ? 1 : 0;
    }
    case "task-transition": {
      const result = await agentTaskTransitionCommand(requireFlagString(flags, "task"), requireFlagString(flags, "status") as Parameters<typeof agentTaskTransitionCommand>[1], {
        evidencePaths: flagList(flags, "evidence"),
        reason: flagString(flags, "reason") ?? undefined,
        outPath: flagString(flags, "out") ?? undefined,
      });
      console.log(flags.json === true ? renderAgentTaskTransitionJson(result) : renderAgentTaskTransition(result));
      return result.allowed ? 0 : 1;
    }
    case "task-export": {
      const shape = flagString(flags, "shape");
      const result = await agentTaskExportCommand(requireFlagString(flags, "task"), shape === "mcp" || shape === "a2a" ? shape : "local");
      console.log(flags.json === true ? renderAgentTaskInteropExportJson(result) : renderAgentTaskInteropExport(result));
      return 0;
    }
    default:
      console.error(`agent: unknown subcommand '${sub ?? ""}'`);
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
    case "methods-framework": {
      const result = researchMethodsFrameworkCommand();
      console.log(flags.json === true ? renderResearchMethodsFrameworkJson(result) : renderResearchMethodsFramework(result));
      return 0;
    }
    case "validate-methods": {
      const packetDir = requireFlagString(flags, "packet");
      const result = await researchValidateMethodsCommand(packetDir);
      console.log(flags.json === true ? renderResearchMethodsValidationJson(result) : renderResearchMethodsValidation(result));
      return result.status === "blocked" ? 1 : 0;
    }
    case "registry-inspect": {
      const result = await researchRegistryInspectCommand(requireFlagString(flags, "registry"));
      console.log(flags.json === true ? renderResearchRegistryInspectJson(result) : renderResearchRegistryInspect(result));
      return result.warnings.some(issue => issue.severity === "blocker") ? 1 : 0;
    }
    case "decompose-question": {
      const result = researchDecomposeQuestionCommand(requireFlagString(flags, "question"));
      console.log(flags.json === true ? renderResearchQuestionDecompositionJson(result) : renderResearchQuestionDecomposition(result));
      return 0;
    }
    case "clarification-plan": {
      const result = researchClarificationPlanCommand(requireFlagString(flags, "question"));
      console.log(flags.json === true ? renderResearchClarificationPlanJson(result) : renderResearchClarificationPlan(result));
      return 0;
    }
    case "data-quality": {
      const result = await researchDataQualityCommand(requireFlagString(flags, "fixture"));
      console.log(flags.json === true ? renderResearchDataQualityJson(result) : renderResearchDataQuality(result));
      return result.warnings.some(issue => issue.severity === "blocker") ? 1 : 0;
    }
    case "select-method": {
      const result = researchSelectMethodCommand(requireFlagString(flags, "question"));
      console.log(flags.json === true ? renderResearchMethodSelectionJson(result) : renderResearchMethodSelection(result));
      return 0;
    }
    case "ro-crate": {
      const result = await researchRoCrateCommand(requireFlagString(flags, "packet"));
      console.log(flags.json === true ? renderResearchRoCrateJson(result) : renderResearchRoCrate(result));
      return 0;
    }
    case "provenance": {
      const result = await researchProvenanceCommand(requireFlagString(flags, "packet"));
      console.log(flags.json === true ? renderResearchProvenanceJson(result) : renderResearchProvenance(result));
      return 0;
    }
    case "qa-dashboard": {
      const result = await researchQaDashboardCommand(requireFlagString(flags, "packet"));
      console.log(flags.json === true ? renderResearchQaDashboardJson(result) : renderResearchQaDashboard(result));
      return result.status === "blocked" ? 1 : 0;
    }
    case "suppression-policy": {
      const count = Number.parseInt(requireFlagString(flags, "count"), 10);
      const thresholdText = flagString(flags, "threshold");
      const threshold = thresholdText ? Number.parseInt(thresholdText, 10) : 16;
      if (!Number.isFinite(count) || count < 0) throw new Error("research suppression-policy: --count must be a nonnegative integer");
      if (!Number.isFinite(threshold) || threshold < 1) throw new Error("research suppression-policy: --threshold must be a positive integer");
      const result = researchSuppressionPolicyCommand(count, threshold);
      console.log(flags.json === true ? renderResearchSuppressionPolicyJson(result) : renderResearchSuppressionPolicy(result));
      return 0;
    }
    case "registry-search": {
      const limitText = flagString(flags, "limit");
      const limit = limitText ? Number.parseInt(limitText, 10) : 20;
      const result = await researchRegistrySearchCommand(requireFlagString(flags, "registry"), requireFlagString(flags, "query"), limit);
      console.log(flags.json === true ? renderResearchRegistrySearchJson(result) : renderResearchRegistrySearch(result));
      return 0;
    }
    case "estimand-sketch": {
      const result = researchEstimandSketchCommand(requireFlagString(flags, "question"));
      console.log(flags.json === true ? renderResearchEstimandSketchJson(result) : renderResearchEstimandSketch(result));
      return 0;
    }
    case "simulate-study": {
      const result = await researchSimulateStudyCommand({
        project: requireFlagString(flags, "project") as ResearchProject,
        repoDir: requireFlagString(flags, "repo"),
        question: requireFlagString(flags, "question"),
        outDir: requireFlagString(flags, "out"),
      });
      console.log(flags.json === true ? renderResearchStudySimulationJson(result) : renderResearchStudySimulation(result));
      return result.qaStatus === "blocked" ? 1 : 0;
    }
    case "real-study-readiness": {
      const result = await researchRealStudyReadinessCommand(requireFlagString(flags, "packet"));
      console.log(flags.json === true ? renderResearchRealStudyReadinessJson(result) : renderResearchRealStudyReadiness(result));
      return result.status === "ready_for_local_real_data" ? 0 : 1;
    }
    case "data-access": {
      const result = await researchDataAccessManifestCommand(requireFlagString(flags, "packet"), flagList(flags, "file"), {
        python: flagString(flags, "python") ?? undefined,
      });
      console.log(flags.json === true ? renderResearchDataAccessManifestJson(result) : renderResearchDataAccessManifest(result));
      return result.files.every(file => file.exists) ? 0 : 1;
    }
    case "data-access-redact": {
      const result = await researchDataAccessRedactCommand(requireFlagString(flags, "packet"));
      console.log(flags.json === true ? renderResearchDataAccessRedactionJson(result) : renderResearchDataAccessRedaction(result));
      return 0;
    }
    case "real-runner-spec": {
      const result = await researchRealLocalRunnerSpecCommand(requireFlagString(flags, "packet"));
      console.log(flags.json === true ? renderResearchRealLocalRunnerSpecJson(result) : renderResearchRealLocalRunnerSpec(result));
      return result.dataAccessManifest ? 0 : 1;
    }
    case "real-study-checklist": {
      const result = await researchRealStudyChecklistCommand(requireFlagString(flags, "packet"));
      console.log(flags.json === true ? renderResearchRealStudyChecklistJson(result) : renderResearchRealStudyChecklist(result));
      return 0;
    }
    case "adapter-gap-report": {
      const result = await researchAdapterGapReportCommand(requireFlagString(flags, "packet"));
      console.log(flags.json === true ? renderResearchAdapterGapReportJson(result) : renderResearchAdapterGapReport(result));
      return result.status === "mapping_ready" ? 0 : 1;
    }
    case "variable-map": {
      const result = await researchVariableMapCommand(requireFlagString(flags, "packet"), requireFlagString(flags, "file"), flagList(flags, "map"));
      console.log(flags.json === true ? renderResearchVariableMapJson(result) : renderResearchVariableMap(result));
      return 0;
    }
    case "suggest-variable-map": {
      const result = await researchSuggestVariableMapCommand(requireFlagString(flags, "packet"), requireFlagString(flags, "file"), {
        python: flagString(flags, "python") ?? undefined,
      });
      console.log(flags.json === true ? renderResearchVariableMapSuggestionJson(result) : renderResearchVariableMapSuggestion(result));
      return result.unmatchedVariables.length ? 1 : 0;
    }
    case "apply-variable-map-suggestions": {
      const result = await researchApplyVariableMapSuggestionsCommand(requireFlagString(flags, "packet"), requireFlagString(flags, "file"));
      console.log(flags.json === true ? renderResearchVariableMapApplyResultJson(result) : renderResearchVariableMapApplyResult(result));
      return result.adapterStatus === "mapping_ready" ? 0 : 1;
    }
    case "workflow-scorecard": {
      const result = await researchWorkflowScorecardCommand(requireFlagString(flags, "packet"));
      console.log(flags.json === true ? renderResearchWorkflowScorecardJson(result) : renderResearchWorkflowScorecard(result));
      return result.status === "blocked" ? 1 : 0;
    }
    case "evidence-gap": {
      const result = await researchEvidenceGapReportCommand(requireFlagString(flags, "packet"));
      console.log(flags.json === true ? renderResearchEvidenceGapReportJson(result) : renderResearchEvidenceGapReport(result));
      return result.status === "ready" ? 0 : 1;
    }
    case "packet-diff": {
      const result = await researchPacketDiffCommand(requireFlagString(flags, "base"), requireFlagString(flags, "compare"));
      console.log(flags.json === true ? renderResearchPacketDiffJson(result) : renderResearchPacketDiff(result));
      return 0;
    }
    case "node-proposal": {
      const result = researchNodeProposalCommand({
        id: requireFlagString(flags, "id"),
        purpose: requireFlagString(flags, "purpose"),
        evaluator: requireFlagString(flags, "evaluator"),
        rollback: requireFlagString(flags, "rollback"),
        costUsd: Number(flagString(flags, "cost-usd") ?? "0"),
        promotion: flagList(flags, "promotion"),
      });
      console.log(flags.json === true ? renderResearchNodeProposalJson(result) : renderResearchNodeProposal(result));
      return 0;
    }
    case "node-registry": {
      const result = await researchNodeProposalRegistryCommand(requireFlagString(flags, "dir"));
      console.log(flags.json === true ? renderResearchNodeProposalRegistryJson(result) : renderResearchNodeProposalRegistry(result));
      return 0;
    }
    case "cost-ledger": {
      const result = await researchCostLedgerCommand({
        packetDir: flagString(flags, "packet") ?? undefined,
        proposalDir: flagString(flags, "proposal-dir") ?? undefined,
        hardStopUsd: Number(flagString(flags, "hard-stop-usd") ?? "30"),
      });
      console.log(flags.json === true ? renderResearchCostLedgerJson(result) : renderResearchCostLedger(result));
      return result.status === "within_budget" ? 0 : 1;
    }
    case "question-bank": {
      const result = researchQuestionBankCommand(flagString(flags, "domain") ?? "medical");
      console.log(flags.json === true ? renderResearchQuestionBankJson(result) : renderResearchQuestionBank(result));
      return 0;
    }
    case "question-readiness": {
      const result = researchQuestionReadinessCommand(requireFlagString(flags, "question"));
      console.log(flags.json === true ? renderResearchQuestionReadinessJson(result) : renderResearchQuestionReadiness(result));
      return result.status === "ready_for_protocol" ? 0 : 1;
    }
    case "protocol-candidates": {
      const result = researchProtocolCandidatesCommand(requireFlagString(flags, "question"));
      console.log(flags.json === true ? renderResearchProtocolCandidatesJson(result) : renderResearchProtocolCandidates(result));
      return result.selectedCandidateId ? 0 : 1;
    }
    case "protocol-steer": {
      const result = await researchProtocolSteerCommand(requireFlagString(flags, "portfolio"), {
        prefer: flagList(flags, "prefer"),
        avoid: flagList(flags, "avoid"),
        requireVariables: flagList(flags, "require-variable"),
      });
      console.log(flags.json === true ? renderResearchProtocolSteerJson(result) : renderResearchProtocolSteer(result));
      return result.updatedPortfolio.selectedCandidateId ? 0 : 1;
    }
    case "protocol-promote": {
      const result = await researchProtocolPromoteCommand(requireFlagString(flags, "portfolio"), flagString(flags, "candidate") ?? undefined);
      console.log(flags.json === true ? renderResearchProtocolPromotionJson(result) : renderResearchProtocolPromotion(result));
      return 0;
    }
    case "protocol-edit": {
      const result = await researchProtocolEditCommand(requireFlagString(flags, "protocol"), {
        title: flagString(flags, "set-title") ?? undefined,
        question: flagString(flags, "set-question") ?? undefined,
        cycles: flagString(flags, "cycles")?.split(",").map(item => item.trim()).filter(Boolean),
        addCovariate: flagList(flags, "add-covariate"),
        addCaveat: flagList(flags, "add-caveat"),
        addAssumption: flagList(flags, "add-assumption"),
      });
      console.log(flags.json === true ? renderResearchProtocolEditJson(result) : renderResearchProtocolEdit(result));
      return 0;
    }
    case "analysis-spec": {
      const result = await researchAnalysisSpecCommand({
        packetDir: flagString(flags, "packet") ?? undefined,
        protocolPath: flagString(flags, "protocol") ?? undefined,
      });
      console.log(flags.json === true ? renderResearchAnalysisSpecJson(result) : renderResearchAnalysisSpec(result));
      return 0;
    }
    case "cohort-scout-file": {
      const result = await researchCohortScoutFileCommand(requireFlagString(flags, "spec"), requireFlagString(flags, "file"));
      console.log(flags.json === true ? renderResearchCohortScoutFileJson(result) : renderResearchCohortScoutFile(result));
      return result.status === "passed" ? 0 : 1;
    }
    case "semantic-quality": {
      const result = await researchSemanticQualityCommand(requireFlagString(flags, "file"));
      console.log(flags.json === true ? renderResearchSemanticQualityJson(result) : renderResearchSemanticQuality(result));
      return result.status === "failed" ? 1 : 0;
    }
    case "progress": {
      const result = researchProgressCommand({
        phase: requireFlagString(flags, "phase"),
        label: flagString(flags, "label") ?? undefined,
        detail: flagString(flags, "detail") ?? undefined,
        nextStep: flagString(flags, "next-step") ?? undefined,
        terminal: flags.terminal === true,
      });
      console.log(flags.json === true ? renderResearchProgressJson(result) : renderResearchProgress(result));
      return 0;
    }
    case "job-lifecycle": {
      const result = researchJobLifecycleCommand({
        jobId: requireFlagString(flags, "job"),
        status: requireFlagString(flags, "status") as Parameters<typeof researchJobLifecycleCommand>[0]["status"],
        phase: flagString(flags, "phase") ?? undefined,
        label: flagString(flags, "label") ?? undefined,
        detail: flagString(flags, "detail") ?? undefined,
        nextStep: flagString(flags, "next-step") ?? undefined,
      });
      console.log(flags.json === true ? renderResearchJobLifecycleJson(result) : renderResearchJobLifecycle(result));
      return 0;
    }
    case "repair-plan": {
      const result = await researchRepairPlanCommand(requireFlagString(flags, "packet"));
      console.log(flags.json === true ? renderResearchRepairPlanJson(result) : renderResearchRepairPlan(result));
      return result.status === "repair_recommended" ? 1 : 0;
    }
    case "agent-record": {
      const cycleValue = flagString(flags, "cycle");
      const result = researchAgentExecutionRecordCommand({
        cycle: cycleValue ? Number.parseInt(cycleValue, 10) : undefined,
        intent: requireFlagString(flags, "intent"),
        observation: requireFlagString(flags, "observation"),
        inference: requireFlagString(flags, "inference"),
        action: requireFlagString(flags, "action"),
        evidence: flagList(flags, "evidence"),
        confidence: flagString(flags, "confidence") ? Number(flagString(flags, "confidence")) : undefined,
        tags: flagList(flags, "tag"),
      });
      console.log(flags.json === true ? renderResearchAgentExecutionRecordJson(result) : renderResearchAgentExecutionRecord(result));
      return 0;
    }
    case "workflow-memory": {
      const result = await researchWorkflowMemoryCommand({ source: requireFlagString(flags, "source") });
      console.log(flags.json === true ? renderResearchWorkflowMemoryJson(result) : renderResearchWorkflowMemory(result));
      return 0;
    }
    case "uncertainty-budget": {
      const result = await researchUncertaintyBudgetCommand({
        specPath: requireFlagString(flags, "spec"),
        scoutPath: flagString(flags, "scout") ?? undefined,
        comparisons: flagString(flags, "comparisons") ? Number(flagString(flags, "comparisons")) : undefined,
        alpha: flagString(flags, "alpha") ? Number(flagString(flags, "alpha")) : undefined,
      });
      console.log(flags.json === true ? renderResearchUncertaintyBudgetJson(result) : renderResearchUncertaintyBudget(result));
      return result.status === "underpowered_or_fragile" ? 1 : 0;
    }
    case "dataset-candidate": {
      const rowCountValue = flagString(flags, "row-count");
      const result = researchDatasetCandidateCommand({
        id: requireFlagString(flags, "id"),
        title: flagString(flags, "title") ?? undefined,
        sourceUrl: flagString(flags, "source-url") ?? undefined,
        modality: flagList(flags, "modality"),
        rowCount: rowCountValue ? Number(rowCountValue) : undefined,
        license: flagString(flags, "license") ?? undefined,
        synthetic: flags.synthetic === true,
        containsHumanSubjects: flags["human-subjects"] === true ? true : undefined,
        intendedUse: flagString(flags, "intended-use") as Parameters<typeof researchDatasetCandidateCommand>[0]["intendedUse"],
      });
      console.log(flags.json === true ? renderResearchDatasetCandidateJson(result) : renderResearchDatasetCandidate(result));
      return result.status === "unsuitable" ? 1 : 0;
    }
    case "improvement-agenda": {
      const result = researchImprovementAgendaCommand({
        budgetUsd: flagString(flags, "budget-usd") ? Number(flagString(flags, "budget-usd")) : undefined,
        candidates: flagList(flags, "candidate"),
      });
      console.log(flags.json === true ? renderResearchImprovementAgendaJson(result) : renderResearchImprovementAgenda(result));
      return result.selected.length ? 0 : 1;
    }
    case "claim-guard": {
      const result = await researchClaimGuardCommand({
        reportPath: requireFlagString(flags, "report"),
        specPath: flagString(flags, "spec") ?? undefined,
      });
      console.log(flags.json === true ? renderResearchClaimGuardJson(result) : renderResearchClaimGuard(result));
      return result.status === "blocked" ? 1 : 0;
    }
    case "machine-status": {
      const result = await researchMachineStatusCommand({
        dataRoot: flagString(flags, "data-root") ?? undefined,
        python: flagString(flags, "python") ?? undefined,
        rscript: flagString(flags, "rscript") ?? undefined,
      });
      console.log(flags.json === true ? renderResearchMachineStatusJson(result) : renderResearchMachineStatus(result));
      return result.issues.some(issue => issue.severity === "blocker") ? 1 : 0;
    }
    case "dataset-register": {
      const result = await researchDatasetRegisterCommand({
        datasetId: requireFlagString(flags, "id"),
        source: flagString(flags, "source") ?? undefined,
        fromManifest: flagString(flags, "from-manifest") ?? undefined,
        outDir: requireFlagString(flags, "out-dir"),
        title: flagString(flags, "title") ?? undefined,
        description: flagString(flags, "description") ?? undefined,
        domain: parseDatasetDomain(flagString(flags, "domain") ?? undefined),
        license: flagString(flags, "license") ?? undefined,
        maxTables: parseOptionalIntegerFlag(flags, "max-tables"),
        maxRows: parseOptionalIntegerFlag(flags, "max-rows"),
        python: flagString(flags, "python") ?? undefined,
      });
      console.log(flags.json === true ? renderDatasetRegistrationJson(result) : renderDatasetRegistration(result));
      return result.profile.watchouts.some(issue => issue.severity === "blocker") ? 1 : 0;
    }
    case "dataset-inspect": {
      const result = await researchDatasetInspectCommand({ datasetDir: requireFlagString(flags, "dataset-dir") });
      console.log(flags.json === true ? renderDatasetManifestJson(result) : renderDatasetManifest(result));
      return 0;
    }
    case "dataset-profile": {
      const result = await researchDatasetProfileCommand({ datasetDir: requireFlagString(flags, "dataset-dir") });
      console.log(flags.json === true ? renderDatasetProfileJson(result) : renderDatasetProfile(result));
      return result.watchouts.some(issue => issue.severity === "blocker") ? 1 : 0;
    }
    case "dataset-relationships": {
      const result = await researchDatasetRelationshipsCommand({ datasetDir: requireFlagString(flags, "dataset-dir") });
      console.log(flags.json === true ? renderDatasetRelationshipsJson(result) : renderDatasetRelationships(result));
      return result.warnings.some(issue => issue.severity === "blocker") ? 1 : 0;
    }
    case "dataset-questions": {
      const result = await researchDatasetQuestionsCommand({ datasetDir: requireFlagString(flags, "dataset-dir") });
      console.log(flags.json === true ? renderDatasetQuestionsJson(result) : renderDatasetQuestions(result));
      return result.seeds.length ? 0 : 1;
    }
    case "dataset-describe": {
      const result = await researchDatasetDescribeCommand({ datasetDir: requireFlagString(flags, "dataset-dir") });
      console.log(flags.json === true ? JSON.stringify({ schemaVersion: 1, datasetSummaryMarkdown: result }, null, 2) : result);
      return 0;
    }
    case "dataset-spec": {
      const result = await researchDatasetSpecCommand({
        studyPath: requireFlagString(flags, "study"),
        datasetDir: requireFlagString(flags, "dataset-dir"),
        outPath: flagString(flags, "out") ?? undefined,
      });
      console.log(flags.json === true ? renderDatasetSpecJson(result) : renderDatasetSpec(result));
      return result.validation.status === "blocked" ? 1 : 0;
    }
    case "dataset-run": {
      const result = await researchDatasetRunCommand({
        analysisSpecPath: requireFlagString(flags, "analysis-spec"),
        datasetDir: requireFlagString(flags, "dataset-dir"),
        outDir: requireFlagString(flags, "out-dir"),
        python: flagString(flags, "python") ?? undefined,
        maxUsd: parseOptionalNumberFlag(flags, "max-usd") ?? 1,
        usdPerGbRead: parseOptionalNumberFlag(flags, "usd-per-gb-read") ?? 0.12,
        allowGcs: flags["allow-gcs"] === true,
      });
      console.log(flags.json === true ? renderDatasetRunJson(result) : renderDatasetRun(result));
      return result.status === "failed" || result.readiness === "blocked" ? 1 : 0;
    }
    case "dataset-run-index": {
      const result = await researchDatasetRunIndexCommand({
        runRoot: requireFlagString(flags, "run-root"),
        outPath: flagString(flags, "out") ?? undefined,
        reportPath: flagString(flags, "report") ?? undefined,
      });
      console.log(flags.json === true ? renderDatasetRunIndexJson(result) : renderDatasetRunIndex(result));
      return result.totalRuns > 0 ? 0 : 1;
    }
    case "phenotype-list": {
      const result = await researchPhenotypeListCommand({
        outPath: flagString(flags, "out") ?? undefined,
      });
      console.log(flags.json === true ? renderResearchPhenotypeListJson(result) : renderResearchPhenotypeList(result));
      return 0;
    }
    case "phenotype-inspect": {
      const result = await researchPhenotypeInspectCommand({
        id: flagString(flags, "id") ?? undefined,
        phenotypePath: flagString(flags, "phenotype") ?? undefined,
        outPath: flagString(flags, "out") ?? undefined,
      });
      console.log(flags.json === true ? renderResearchPhenotypeInspectJson(result) : renderResearchPhenotypeInspect(result));
      return result.validation.status === "blocked" ? 1 : 0;
    }
    case "phenotype-review": {
      const result = await researchPhenotypeReviewCommand({
        id: flagString(flags, "id") ?? undefined,
        phenotypePath: flagString(flags, "phenotype") ?? undefined,
        dictionaryPath: requireFlagString(flags, "dictionary"),
        system: parsePhenotypeCodeSystem(flagString(flags, "system") ?? undefined),
        web: flags.web === true,
        outDir: flagString(flags, "out-dir") ?? undefined,
        outPath: flagString(flags, "out") ?? undefined,
      });
      console.log(flags.json === true ? renderResearchPhenotypeReviewJson(result) : renderResearchPhenotypeReview(result));
      return result.status === "blocked" ? 1 : 0;
    }
    case "phenotype-match": {
      const result = await researchPhenotypeMatchCommand({
        id: flagString(flags, "id") ?? undefined,
        phenotypePath: flagString(flags, "phenotype") ?? undefined,
        dictionaryPath: requireFlagString(flags, "dictionary"),
        system: parsePhenotypeCodeSystem(flagString(flags, "system") ?? undefined),
        sensitivity: flagString(flags, "sensitivity") ?? undefined,
        outPath: flagString(flags, "out") ?? undefined,
      });
      console.log(flags.json === true ? renderResearchPhenotypeMatchJson(result) : renderResearchPhenotypeMatch(result));
      return result.matchedCodes.length ? 0 : 1;
    }
    case "spec-v2": {
      const result = await researchSpecV2Command({
        specPath: requireFlagString(flags, "spec"),
        outPath: resolveMachineOutPath(flagString(flags, "out") ?? undefined),
      });
      console.log(flags.json === true ? renderResearchSpecV2Json(result) : renderResearchSpecV2(result));
      return result.validation.status === "blocked" ? 1 : 0;
    }
    case "execution-contract": {
      const result = await researchExecutionContractFromFileCommand({
        specPath: requireFlagString(flags, "spec"),
        backend: parseBackendId(flagString(flags, "backend") ?? undefined),
        dataRoot: flagString(flags, "data-root") ?? undefined,
        outDir: flagString(flags, "out-dir") ?? undefined,
      });
      console.log(flags.json === true ? renderResearchExecutionContractJson(result) : renderResearchExecutionContract(result));
      return result.validation.status === "blocked" ? 1 : 0;
    }
    case "archetypes": {
      const result = researchArchetypesCommand({
        id: parseStudyArchetypeId(flagString(flags, "id") ?? undefined),
      });
      console.log(flags.json === true ? renderResearchArchetypesJson(result) : renderResearchArchetypes(result));
      return result.archetypes.length ? 0 : 1;
    }
    case "methods-catalog": {
      const result = researchMethodsCatalogCommand({
        category: parseMethodCategory(flagString(flags, "category") ?? undefined),
        methodId: flagString(flags, "method") ?? undefined,
      });
      console.log(flags.json === true ? renderResearchMethodsCatalogJson(result) : renderResearchMethodsCatalog(result));
      return result.methods.length ? 0 : 1;
    }
    case "method-select": {
      const maxCandidatesRaw = flagString(flags, "max-candidates");
      const result = await researchMethodSelectCommand({
        question: requireFlagString(flags, "question"),
        outcomeType: parseOutcomeType(flagString(flags, "outcome") ?? undefined),
        studyDesign: parseStudyDesign(flagString(flags, "study-design") ?? undefined),
        dataStructures: parseDataStructures(flagList(flags, "data-structure")),
        dataset: flagString(flags, "dataset") ? parseDatasetAdapterId(flagString(flags, "dataset") ?? undefined, "nhanes") : undefined,
        goal: parseMethodGoal(flagString(flags, "goal") ?? undefined),
        surveyDesign: flags.survey === true,
        repeatedMeasures: flags.repeated === true,
        clustered: flags.clustered === true,
        timeToEvent: flags["time-to-event"] === true,
        highDimensional: flags["high-dimensional"] === true,
        text: flags.text === true,
        image: flags.image === true,
        spatial: flags.spatial === true,
        network: flags.network === true,
        maxCandidates: maxCandidatesRaw ? Number(maxCandidatesRaw) : undefined,
        outPath: resolveMachineOutPath(flagString(flags, "out") ?? undefined),
      });
      console.log(flags.json === true ? renderResearchMachineMethodSelectionJson(result) : renderResearchMachineMethodSelection(result));
      return result.primary ? 0 : 1;
    }
    case "method-apply": {
      const result = await researchMethodApplyCommand({
        specPath: requireFlagString(flags, "spec"),
        selectionPath: requireFlagString(flags, "selection"),
        outPath: resolveMachineOutPath(flagString(flags, "out") ?? undefined),
      });
      console.log(flags.json === true ? renderResearchMethodApplyJson(result) : renderResearchMethodApply(result));
      return result.validation.status === "blocked" ? 1 : 0;
    }
    case "method-validate": {
      const result = await researchMethodValidateCommand({
        specPath: requireFlagString(flags, "spec"),
        methodId: requireFlagString(flags, "method"),
      });
      console.log(flags.json === true ? renderResearchMethodValidationJson(result) : renderResearchMethodValidation(result));
      return result.validation.status === "blocked" ? 1 : 0;
    }
    case "literature-search": {
      const result = await researchMedbreviaLiteratureSearchCommand({
        question: requireFlagString(flags, "question"),
        baseUrl: flagString(flags, "base-url") ?? undefined,
        endpoint: flagString(flags, "endpoint") ?? undefined,
        apiKey: flagString(flags, "api-key") ?? undefined,
        bearerToken: flagString(flags, "bearer-token") ?? undefined,
        cookie: flagString(flags, "cookie") ?? undefined,
        authSecret: flagString(flags, "auth-secret") ?? undefined,
        userId: flagString(flags, "user-id") ?? undefined,
        userEmail: flagString(flags, "user-email") ?? undefined,
        responseDepth: parseLiteratureDepth(flagString(flags, "depth") ?? flagString(flags, "response-depth") ?? undefined),
        dateRange: flagString(flags, "date-range") ?? undefined,
        highImpact: flags["high-impact"] === true,
        prefersList: flags["no-list"] === true ? false : true,
        topK: parseOptionalIntegerFlag(flags, "top-k"),
        timeoutMs: parseOptionalIntegerFlag(flags, "timeout-ms"),
        outPath: flagString(flags, "out") ?? undefined,
        reportPath: flagString(flags, "report") ?? undefined,
        mockResponsePath: flagString(flags, "mock-response") ?? undefined,
      });
      console.log(flags.json === true ? renderResearchMedbreviaLiteratureSearchJson(result) : renderResearchMedbreviaLiteratureSearch(result));
      return result.status === "failed" ? 1 : 0;
    }
    case "literature-context": {
      const result = await researchLiteratureContextCommand({
        question: flagString(flags, "question") ?? undefined,
        literaturePath: requireFlagString(flags, "literature"),
        outPath: flagString(flags, "out") ?? undefined,
        reportPath: flagString(flags, "report") ?? undefined,
      });
      console.log(flags.json === true ? renderResearchLiteratureContextJson(result) : renderResearchLiteratureContext(result));
      return result.status === "failed" ? 1 : 0;
    }
    case "literature-qa": {
      const result = await researchLiteratureQaCommand({
        question: flagString(flags, "question") ?? undefined,
        literaturePath: requireFlagString(flags, "literature"),
        paperPath: flagString(flags, "paper") ?? undefined,
        outPath: flagString(flags, "out") ?? undefined,
        reportPath: flagString(flags, "report") ?? undefined,
      });
      console.log(flags.json === true ? renderResearchLiteratureQaJson(result) : renderResearchLiteratureQa(result));
      return result.status === "fail" ? 1 : 0;
    }
    case "modeling-plan": {
      const maxCandidatesRaw = flagString(flags, "max-candidates");
      let explorationHandoff: Parameters<typeof researchModelingPlanCommand>[0]["explorationHandoff"];
      let explorationSeed: Record<string, unknown> = {};
      const explorationHandoffPath = flagString(flags, "exploration-handoff");
      if (explorationHandoffPath) {
        const rawHandoff = JSON.parse(await readFile(explorationHandoffPath, "utf-8")) as Record<string, unknown>;
        const handoff = rawHandoff.explorationHandoff && typeof rawHandoff.explorationHandoff === "object"
          ? rawHandoff.explorationHandoff as Record<string, unknown>
          : rawHandoff;
        explorationSeed = handoff.modelingPlanSeed && typeof handoff.modelingPlanSeed === "object"
          ? handoff.modelingPlanSeed as Record<string, unknown>
          : {};
        const status = handoff.status === "ready_for_modeling_plan" || handoff.status === "needs_methods_review" || handoff.status === "blocked"
          ? handoff.status
          : "blocked";
        const clearanceLevel = handoff.clearanceLevel === "clear_for_handoff" || handoff.clearanceLevel === "hold_for_methods_review" || handoff.clearanceLevel === "stop"
          ? handoff.clearanceLevel
          : "stop";
        explorationHandoff = {
          path: explorationHandoffPath,
          status,
          clearanceLevel,
          sourceExplorationSha256: typeof handoff.sourceExplorationSha256 === "string" ? handoff.sourceExplorationSha256 : null,
          questionId: typeof handoff.questionId === "string" ? handoff.questionId : null,
          blockers: Array.isArray(handoff.blockers) ? handoff.blockers.map(item => String(item)) : [],
          methodsReviewNote: typeof handoff.methodsReviewNote === "string" ? handoff.methodsReviewNote : null,
        };
      }
      const seededQuestion = typeof explorationSeed.question === "string" ? explorationSeed.question : undefined;
      const seededOutcome = typeof explorationSeed.outcome === "string" ? explorationSeed.outcome : undefined;
      const seededTablePath = typeof explorationSeed.tablePath === "string" ? explorationSeed.tablePath : undefined;
      const seededRouteIntent = typeof explorationSeed.routeIntent === "string" ? explorationSeed.routeIntent : undefined;
      const seededGoal = seededRouteIntent === "prediction_modeling" ? "predict"
        : seededRouteIntent === "diagnostic_accuracy" ? "diagnose"
          : seededRouteIntent === "data_quality_review" ? "discover"
            : seededRouteIntent === "descriptive_profile" ? "describe"
              : seededRouteIntent === "causal_design_review" ? "causal"
                : seededRouteIntent === "explanatory_association" ? "associate"
                  : undefined;
      const question = flagString(flags, "question") ?? seededQuestion;
      if (!question) throw new Error("--question is required unless --exploration-handoff contains modelingPlanSeed.question");
      let tableSummary: unknown;
      const tableSummaryPath = flagString(flags, "table-summary");
      if (tableSummaryPath) {
        const rawSummary = JSON.parse(await readFile(tableSummaryPath, "utf-8")) as Record<string, unknown>;
        tableSummary = rawSummary.tableSummary ?? rawSummary;
      } else {
        const tablePath = flagString(flags, "table") ?? seededTablePath;
        if (tablePath) {
          tableSummary = await researchTableSummaryCommand({ file: tablePath, python: flagString(flags, "python") ?? undefined });
        }
      }
      let backendStatus: unknown;
      const backendStatusPath = flagString(flags, "backend-status");
      if (backendStatusPath) {
        const rawBackendStatus = JSON.parse(await readFile(backendStatusPath, "utf-8")) as Record<string, unknown>;
        backendStatus = rawBackendStatus.machineStatus ?? rawBackendStatus;
      }
      let literatureEvidence: Parameters<typeof researchModelingPlanCommand>[0]["literatureEvidence"];
      const literaturePath = flagString(flags, "literature");
      if (literaturePath) {
        const context = await loadLiteratureContextForModeling(literaturePath, question);
        literatureEvidence = {
          path: literaturePath,
          status: context.status,
          evidenceStrength: context.evidenceStrength,
          sourceCount: context.sourceSummary.sourceCount,
          highQualitySourceCount: context.sourceSummary.highQualitySourceCount,
          latestPublicationYear: context.sourceSummary.latestPublicationYear,
          questionTokenCoverage: context.quality.questionTokenCoverage,
          designSignals: context.designSignals,
          methodSignals: context.methodSignals,
          planningImplications: context.planningImplications,
          followUpSearches: context.followUpSearches,
          issueCodes: context.issues.filter(issue => issue.status !== "pass").map(issue => issue.id),
        };
      }
      const priorRuns = await Promise.all(flagList(flags, "prior-run").map(async priorRunPath => {
        const raw = JSON.parse(await readFile(priorRunPath, "utf-8")) as Record<string, unknown>;
        const candidate = "statsRun" in raw && raw.statsRun && typeof raw.statsRun === "object"
          ? raw.statsRun as Record<string, unknown>
          : "mlRun" in raw && raw.mlRun && typeof raw.mlRun === "object"
            ? raw.mlRun as Record<string, unknown>
            : raw;
        const resultPosture = candidate.resultPosture && typeof candidate.resultPosture === "object"
          ? candidate.resultPosture as Record<string, unknown>
          : {};
        const issues = Array.isArray(candidate.issues) ? candidate.issues : [];
        return {
          path: priorRunPath,
          kind: candidate.method ? "stats" as const : candidate.modelId ? "ml" as const : "unknown" as const,
          status: typeof candidate.status === "string" ? candidate.status : "unknown",
          posture: typeof resultPosture.status === "string" ? resultPosture.status : null,
          methodOrModel: typeof candidate.method === "string"
            ? candidate.method
            : typeof candidate.modelId === "string"
              ? candidate.modelId
              : null,
          issueCodes: issues.map(issue => issue && typeof issue === "object" ? String((issue as Record<string, unknown>).code ?? "") : "").filter(Boolean),
          errors: Array.isArray(candidate.errors) ? candidate.errors.map(error => String(error)) : [],
        };
      }));
      const result = researchModelingPlanCommand({
        question,
        goal: parseModelingGoal(flagString(flags, "goal") ?? seededGoal),
        outcomeType: parseOutcomeType(flagString(flags, "outcome") ?? undefined),
        studyDesign: parseStudyDesign(flagString(flags, "study-design") ?? undefined),
        dataStructures: parseDataStructures(flagList(flags, "data-structure")),
        tableSummary: tableSummary as Parameters<typeof researchModelingPlanCommand>[0]["tableSummary"],
        backendStatus: backendStatus as Parameters<typeof researchModelingPlanCommand>[0]["backendStatus"],
        literatureEvidence,
        priorRuns,
        explorationHandoff,
        target: flagString(flags, "target") ?? seededOutcome,
        surveyDesign: flags.survey === true,
        repeatedMeasures: flags.repeated === true,
        clustered: flags.clustered === true,
        timeToEvent: flags["time-to-event"] === true,
        highDimensional: flags["high-dimensional"] === true,
        text: flags.text === true,
        image: flags.image === true,
        spatial: flags.spatial === true,
        network: flags.network === true,
        rowCount: flagString(flags, "row-count") ? Number(flagString(flags, "row-count")) : undefined,
        featureCount: flagString(flags, "feature-count") ? Number(flagString(flags, "feature-count")) : undefined,
        classCount: flagString(flags, "class-count") ? Number(flagString(flags, "class-count")) : undefined,
        highMissingness: flags["high-missingness"] === true,
        smallSample: flags["small-sample"] === true,
        requiresPrediction: flags.predict === true,
        requiresInference: flags["no-inference"] === true ? false : true,
        maxCandidates: maxCandidatesRaw ? Number(maxCandidatesRaw) : undefined,
      });
      console.log(flags.json === true ? renderResearchModelingPlanJson(result) : renderResearchModelingPlan(result));
      return result.blocked ? 1 : 0;
    }
    case "analysis-run": {
      const result = await researchAnalysisRunCommand({
        question: requireFlagString(flags, "question"),
        method: parseStatsMethod(requireFlagString(flags, "method")),
        dataPath: requireFlagString(flags, "data"),
        outDir: requireFlagString(flags, "out-dir"),
        outcome: flagString(flags, "outcome") ?? undefined,
        exposure: flagString(flags, "exposure") ?? undefined,
        group: flagString(flags, "group") ?? undefined,
        outcomeThreshold: parseOptionalNumberFlag(flags, "outcome-threshold"),
        exposureThreshold: parseOptionalNumberFlag(flags, "exposure-threshold"),
        variables: flagList(flags, "variable"),
        covariates: flagList(flags, "covariate"),
        time: flagString(flags, "time") ?? undefined,
        event: flagString(flags, "event") ?? undefined,
        id: flagString(flags, "id") ?? undefined,
        strata: flagString(flags, "strata") ?? undefined,
        cluster: flagString(flags, "cluster") ?? undefined,
        period: flagString(flags, "period") ?? undefined,
        post: flagString(flags, "post") ?? undefined,
        runningVariable: flagString(flags, "running-variable") ?? undefined,
        cutoff: parseOptionalNumberFlag(flags, "cutoff"),
        instrument: flagString(flags, "instrument") ?? undefined,
        alphaPenalty: parseOptionalNumberFlag(flags, "alpha-penalty"),
        l1Ratio: parseOptionalNumberFlag(flags, "l1-ratio"),
        weight: flagString(flags, "weight") ?? undefined,
        exactCovariates: flagList(flags, "exact-covariate"),
        estimand: parseEstimand(flagString(flags, "estimand")) ?? "ATT",
        matchRatio: parseOptionalIntegerFlag(flags, "match-ratio") ?? 1,
        caliper: parseOptionalNumberFlag(flags, "caliper"),
        replacement: flags.replacement === true,
        trimThreshold: parseOptionalNumberFlag(flags, "trim-threshold") ?? 0.01,
        stabilizeWeights: flags["no-stabilize-weights"] === true ? false : true,
        surveyDesign: flags.survey === true,
        allowSurveyApproximation: flags["allow-survey-approximation"] === true,
        methodSelectionPath: flagString(flags, "method-selection") ?? undefined,
        analysisSpecPath: flagString(flags, "analysis-spec") ?? undefined,
        literaturePath: flagString(flags, "literature") ?? undefined,
        requireBound: flags["require-bound"] === true,
        python: flagString(flags, "python") ?? undefined,
      });
      console.log(flags.json === true ? renderResearchAnalysisRunJson(result) : renderResearchAnalysisRun(result));
      return result.statsRun.status === "failed" || result.analysisRunManifest.readiness === "blocked" ? 1 : 0;
    }
    case "analysis-manifest": {
      const result = await researchAnalysisManifestCommand({
        runDir: requireFlagString(flags, "run-dir"),
        outPath: flagString(flags, "out") ?? undefined,
        requireReady: flags["require-ready"] === true,
      });
      console.log(flags.json === true ? renderResearchAnalysisManifestJson(result) : renderResearchAnalysisManifest(result));
      return result.readiness === "blocked" ? 1 : 0;
    }
    case "analysis-benchmark": {
      const result = await researchAnalysisBenchmarkCommand({
        runDirs: flagList(flags, "run-dir"),
        requireReady: flags["require-ready"] === true,
        requireMultiRoute: flags["require-multi-route"] === true,
        outPath: flagString(flags, "out") ?? undefined,
        reportPath: flagString(flags, "report") ?? undefined,
      });
      console.log(flags.json === true ? renderResearchAnalysisBenchmarkJson(result) : renderResearchAnalysisBenchmark(result));
      return result.status === "pass" ? 0 : 1;
    }
    case "dataset-adapter": {
      const result = await researchDatasetAdapterCommand({
        dataset: parseDatasetAdapterId(flagString(flags, "dataset") ?? undefined, "nhanes"),
        dataRoot: flagString(flags, "data-root") ?? undefined,
      });
      console.log(flags.json === true ? renderResearchDatasetAdapterJson(result) : renderResearchDatasetAdapter(result));
      return result.issues.some(issue => issue.severity === "blocker") ? 1 : 0;
    }
    case "machine-plan": {
      const result = researchMachinePlanCommand({
        question: requireFlagString(flags, "question"),
        dataset: flagString(flags, "dataset") ? parseDatasetAdapterId(flagString(flags, "dataset") ?? undefined, "nhanes") : undefined,
        archetype: parseStudyArchetypeId(flagString(flags, "archetype") ?? undefined),
        backend: parseBackendId(flagString(flags, "backend") ?? undefined),
        dataRoot: flagString(flags, "data-root") ?? undefined,
      });
      console.log(flags.json === true ? renderResearchMachinePlanJson(result) : renderResearchMachinePlan(result));
      return result.risks.some(issue => issue.severity === "blocker") ? 1 : 0;
    }
    case "machine-benchmark": {
      const result = await researchMachineBenchmarkCommand({
        packetDir: requireFlagString(flags, "packet"),
        specPath: flagString(flags, "spec") ?? undefined,
        outPath: resolveMachineOutPath(flagString(flags, "out") ?? undefined),
      });
      console.log(flags.json === true ? renderResearchMachineBenchmarkJson(result) : renderResearchMachineBenchmark(result));
      return result.evaluation.status === "fail" ? 1 : 0;
    }
    case "ml-models": {
      const result = researchMlModelsCommand({
        task: parseMlTask(flagString(flags, "task") ?? undefined),
        includeUnavailable: flags["include-unavailable"] === true,
      });
      console.log(flags.json === true ? renderResearchMlModelsJson(result) : renderResearchMlModels(result));
      return result.models.length ? 0 : 1;
    }
    case "ml-run": {
      const result = await researchMlRunCommand({
        task: parseMlTaskRequired(requireFlagString(flags, "task")),
        modelId: requireFlagString(flags, "model"),
        dataPath: requireFlagString(flags, "data"),
        target: flagString(flags, "target") ?? undefined,
        features: flagList(flags, "feature"),
        outDir: requireFlagString(flags, "out-dir"),
        primaryMetric: flagString(flags, "primary-metric") ?? undefined,
        testSize: parseMlNumber(flagString(flags, "test-size"), 0.25),
        validationSize: parseMlNumber(flagString(flags, "validation-size"), 0),
        seed: parseMlInteger(flagString(flags, "seed"), 17),
        scale: flags.scale === true,
        cvFolds: parseMlInteger(flagString(flags, "cv"), 0),
        saveModel: flags["no-save-model"] === true ? false : true,
        permutationImportance: flags["no-permutation-importance"] === true ? false : true,
        maxPermutationRows: parseMlInteger(flagString(flags, "max-permutation-rows"), 500),
        params: flagString(flags, "params") ? JSON.parse(flagString(flags, "params")!) as Record<string, unknown> : {},
        python: flagString(flags, "python") ?? undefined,
      });
      console.log(flags.json === true ? renderResearchMlRunJson(result) : renderResearchMlRun(result));
      return result.status === "failed" ? 1 : 0;
    }
    case "ml-compare": {
      const result = await researchMlCompareCommand({
        task: parseMlTaskRequired(requireFlagString(flags, "task")),
        modelIds: flagList(flags, "model"),
        dataPath: requireFlagString(flags, "data"),
        target: flagString(flags, "target") ?? undefined,
        features: flagList(flags, "feature"),
        outDir: requireFlagString(flags, "out-dir"),
        primaryMetric: flagString(flags, "primary-metric") ?? undefined,
        testSize: parseMlNumber(flagString(flags, "test-size"), 0.25),
        validationSize: parseMlNumber(flagString(flags, "validation-size"), 0),
        seed: parseMlInteger(flagString(flags, "seed"), 17),
        scale: flags.scale === true,
        cvFolds: parseMlInteger(flagString(flags, "cv"), 0),
        saveModel: flags["no-save-model"] === true ? false : true,
        permutationImportance: flags["no-permutation-importance"] === true ? false : true,
        maxPermutationRows: parseMlInteger(flagString(flags, "max-permutation-rows"), 500),
        params: flagString(flags, "params") ? JSON.parse(flagString(flags, "params")!) as Record<string, unknown> : {},
        python: flagString(flags, "python") ?? undefined,
      });
      console.log(flags.json === true ? renderResearchMlComparisonJson(result) : renderResearchMlComparison(result));
      return result.ranked.some(item => item.status === "succeeded") ? 0 : 1;
    }
    case "ml-inspect": {
      const result = await researchMlInspectCommand({ runPath: requireFlagString(flags, "run") });
      console.log(flags.json === true ? renderResearchMlRunJson(result) : renderResearchMlRun(result));
      return result.status === "failed" ? 1 : 0;
    }
    case "stats-run": {
      const result = await researchStatsRunCommand({
        method: parseStatsMethod(requireFlagString(flags, "method")),
        dataPath: requireFlagString(flags, "data"),
        outcome: flagString(flags, "outcome") ?? undefined,
        exposure: flagString(flags, "exposure") ?? undefined,
        group: flagString(flags, "group") ?? undefined,
        outcomeThreshold: parseOptionalNumberFlag(flags, "outcome-threshold"),
        exposureThreshold: parseOptionalNumberFlag(flags, "exposure-threshold"),
        variables: flagList(flags, "variable"),
        covariates: flagList(flags, "covariate"),
        time: flagString(flags, "time") ?? undefined,
        event: flagString(flags, "event") ?? undefined,
        id: flagString(flags, "id") ?? undefined,
        strata: flagString(flags, "strata") ?? undefined,
        cluster: flagString(flags, "cluster") ?? undefined,
        period: flagString(flags, "period") ?? undefined,
        post: flagString(flags, "post") ?? undefined,
        runningVariable: flagString(flags, "running-variable") ?? undefined,
        cutoff: parseOptionalNumberFlag(flags, "cutoff"),
        instrument: flagString(flags, "instrument") ?? undefined,
        alphaPenalty: parseOptionalNumberFlag(flags, "alpha-penalty"),
        l1Ratio: parseOptionalNumberFlag(flags, "l1-ratio"),
        weight: flagString(flags, "weight") ?? undefined,
        exactCovariates: flagList(flags, "exact-covariate"),
        estimand: parseEstimand(flagString(flags, "estimand")) ?? "ATT",
        matchRatio: parseOptionalIntegerFlag(flags, "match-ratio") ?? 1,
        caliper: parseOptionalNumberFlag(flags, "caliper"),
        replacement: flags.replacement === true,
        trimThreshold: parseOptionalNumberFlag(flags, "trim-threshold") ?? 0.01,
        stabilizeWeights: flags["no-stabilize-weights"] === true ? false : true,
        surveyDesign: flags.survey === true,
        allowSurveyApproximation: flags["allow-survey-approximation"] === true,
        methodSelectionPath: flagString(flags, "method-selection") ?? undefined,
        analysisSpecPath: flagString(flags, "analysis-spec") ?? undefined,
        outDir: requireFlagString(flags, "out-dir"),
        alpha: parseMlNumber(flagString(flags, "alpha"), 0.05),
        python: flagString(flags, "python") ?? undefined,
      });
      console.log(flags.json === true ? renderResearchStatsRunJson(result) : renderResearchStatsRun(result));
      return result.status === "failed" ? 1 : 0;
    }
    case "figure-qa": {
      const result = await researchFigureQaCommand({
        manifestPath: requireFlagString(flags, "figures"),
        outPath: flagString(flags, "out") ?? undefined,
        reportPath: flagString(flags, "report") ?? undefined,
      });
      console.log(flags.json === true ? renderResearchFigureQaJson(result) : renderResearchFigureQa(result));
      return result.status === "fail" ? 1 : 0;
    }
    case "explore": {
      const maxPairsRaw = flagString(flags, "max-pairs");
      const result = await researchExploreCommand({
        dataPath: requireFlagString(flags, "data"),
        outDir: flagString(flags, "out-dir") ?? undefined,
        target: flagString(flags, "target") ?? undefined,
        maxPairs: maxPairsRaw ? Number(maxPairsRaw) : undefined,
        python: flagString(flags, "python") ?? undefined,
      });
      console.log(flags.json === true ? renderResearchExploreJson(result) : renderResearchExplore(result));
      return result.qa.status === "blocked" ? 1 : 0;
    }
    case "explore-promote": {
      const result = await researchExplorePromoteCommand({
        explorationPath: requireFlagString(flags, "exploration"),
        questionId: requireFlagString(flags, "question"),
        methodsReviewNote: flagString(flags, "methods-review-note") ?? undefined,
        outPath: flagString(flags, "out") ?? undefined,
      });
      console.log(flags.json === true ? renderResearchExplorePromoteJson(result) : renderResearchExplorePromote(result));
      return result.status === "blocked" ? 1 : 0;
    }
    case "explore-plan": {
      const result = await researchExplorePlanCommand({
        explorationPath: requireFlagString(flags, "exploration"),
        questionId: requireFlagString(flags, "question"),
        dataset: flagString(flags, "dataset") ? parseDatasetAdapterId(flagString(flags, "dataset") ?? undefined, "user-table") : undefined,
        methodsReviewNote: flagString(flags, "methods-review-note") ?? undefined,
        outPath: flagString(flags, "out") ?? undefined,
      });
      console.log(flags.json === true ? renderResearchExplorePlanJson(result) : renderResearchExplorePlan(result));
      return result.status === "blocked" ? 1 : 0;
    }
    case "method-qa": {
      const result = await researchMethodQaCommand({
        runDir: requireFlagString(flags, "run-dir"),
        outPath: flagString(flags, "out") ?? undefined,
        reportPath: flagString(flags, "report") ?? undefined,
      });
      console.log(flags.json === true ? renderResearchMethodQaJson(result) : renderResearchMethodQa(result));
      return result.overallStatus === "fail" ? 1 : 0;
    }
    case "manuscript": {
      const result = await researchManuscriptCommand({
        runDir: requireFlagString(flags, "run-dir"),
        outPath: flagString(flags, "out") ?? undefined,
        qaOutPath: flagString(flags, "qa-out") ?? undefined,
      });
      console.log(flags.json === true ? renderResearchManuscriptJson(result) : renderResearchManuscript(result));
      return result.manuscriptQa.status === "fail" ? 1 : 0;
    }
    case "run-inspect": {
      const result = await researchRunInspectCommand({
        runDir: requireFlagString(flags, "run-dir"),
        outPath: flagString(flags, "out") ?? undefined,
        reportPath: flagString(flags, "report") ?? undefined,
      });
      console.log(flags.json === true ? renderResearchRunInspectJson(result) : renderResearchRunInspect(result));
      return result.readiness === "blocked" ? 1 : 0;
    }
    case "controller-init": {
      const result = await researchControllerInitCommand(controllerOptionsFromFlags(flags, { requireQuestion: true, requireOutDir: true }));
      console.log(flags.json === true ? renderResearchControllerStateJson(result) : renderResearchControllerState(result));
      return 0;
    }
    case "controller-step": {
      const env = await reviewerEnv(flags);
      const result = await researchControllerStepCommand({
        statePath: requireFlagString(flags, "state"),
        env,
      });
      console.log(flags.json === true ? renderResearchControllerStateJson(result) : renderResearchControllerState(result));
      return result.status === "blocked" || result.status === "failed" ? 1 : 0;
    }
    case "controller-patch": {
      const patch = JSON.parse(await readArgOrFile(requireFlagString(flags, "patch"))) as Parameters<typeof researchControllerPatchCommand>[0]["patch"];
      const result = await researchControllerPatchCommand({
        statePath: requireFlagString(flags, "state"),
        patch,
        reason: flagString(flags, "reason") ?? undefined,
      });
      console.log(flags.json === true ? renderResearchControllerStateJson(result) : renderResearchControllerState(result));
      return result.status === "blocked" || result.status === "failed" ? 1 : 0;
    }
    case "controller-resume": {
      const result = await researchControllerResumeCommand({
        statePath: requireFlagString(flags, "state"),
        force: flags.force === true,
        reason: flagString(flags, "reason") ?? undefined,
      });
      console.log(flags.json === true ? `${JSON.stringify(result, null, 2)}\n` : renderResearchControllerState(result.state));
      return result.resumed ? 0 : 1;
    }
    case "controller-tool": {
      const result = await researchControllerToolCommand({
        statePath: requireFlagString(flags, "state"),
        request: {
          toolId: parseControllerToolId(requireFlagString(flags, "tool")),
          args: flagList(flags, "arg"),
          reason: flagString(flags, "reason") ?? "Manual bounded controller tool invocation.",
        },
      });
      console.log(flags.json === true ? renderResearchControllerStateJson(result) : renderResearchControllerState(result));
      return result.status === "blocked" || result.status === "failed" ? 1 : 0;
    }
    case "controller-agenda": {
      const result = await researchControllerAgendaCommand({
        statePath: requireFlagString(flags, "state"),
        reason: flagString(flags, "reason") ?? undefined,
      });
      console.log(flags.json === true ? renderResearchControllerAgendaJson(result) : renderResearchControllerAgenda(result));
      return result.status === "blocked" ? 1 : 0;
    }
    case "controller-audit": {
      const result = await researchControllerAuditCommand({
        statePath: requireFlagString(flags, "state"),
        reason: flagString(flags, "reason") ?? undefined,
      });
      console.log(flags.json === true ? renderResearchControllerAuditJson(result) : renderResearchControllerAudit(result));
      return result.status === "fail" ? 1 : 0;
    }
    case "controller-capabilities": {
      const result = await researchControllerCapabilitiesCommand({
        statePath: requireFlagString(flags, "state"),
        reason: flagString(flags, "reason") ?? undefined,
      });
      console.log(flags.json === true ? renderResearchControllerCapabilitiesJson(result) : renderResearchControllerCapabilities(result));
      return result.summary.missing > 0 ? 1 : 0;
    }
    case "controller-env": {
      const result = await researchControllerEnvironmentCommand({
        statePath: requireFlagString(flags, "state"),
        reason: flagString(flags, "reason") ?? undefined,
      });
      console.log(flags.json === true ? renderResearchControllerEnvironmentJson(result) : renderResearchControllerEnvironment(result));
      return result.readiness === "blocked" ? 1 : 0;
    }
    case "controller-doctor": {
      const result = await researchControllerDoctorCommand({
        statePath: requireFlagString(flags, "state"),
        reason: flagString(flags, "reason") ?? undefined,
      });
      console.log(flags.json === true ? renderResearchControllerDoctorJson(result) : renderResearchControllerDoctor(result));
      return result.status === "blocked" ? 1 : 0;
    }
    case "controller-goal-audit": {
      const result = await researchControllerGoalAuditCommand({
        statePath: requireFlagString(flags, "state"),
        objective: flagString(flags, "objective") ?? undefined,
        reason: flagString(flags, "reason") ?? undefined,
      });
      console.log(flags.json === true ? renderResearchControllerGoalAuditJson(result) : renderResearchControllerGoalAudit(result));
      return result.readiness === "blocked" ? 1 : 0;
    }
    case "controller-completion-audit": {
      const result = await researchControllerCompletionAuditCommand({
        statePath: requireFlagString(flags, "state"),
        reason: flagString(flags, "reason") ?? undefined,
      });
      console.log(flags.json === true ? renderResearchControllerCompletionAuditJson(result) : renderResearchControllerCompletionAudit(result));
      return result.status === "fail" ? 1 : 0;
    }
    case "controller-repair-cycle": {
      const env = await reviewerEnv(flags);
      const result = await researchControllerRepairCycleCommand({
        statePath: requireFlagString(flags, "state"),
        reason: flagString(flags, "reason") ?? undefined,
        maxSteps: parseOptionalNumberFlag(flags, "max-steps") ?? undefined,
        force: flags.force === true,
        env,
      });
      console.log(flags.json === true ? renderResearchControllerRepairCycleJson(result) : renderResearchControllerRepairCycle(result));
      return result.status === "blocked" ? 1 : 0;
    }
    case "controller-runbook": {
      const result = await researchControllerRunbookCommand({
        statePath: requireFlagString(flags, "state"),
        reason: flagString(flags, "reason") ?? undefined,
      });
      console.log(flags.json === true ? renderResearchControllerRunbookJson(result) : renderResearchControllerRunbook(result));
      return result.status === "blocked" ? 1 : 0;
    }
    case "controller-runner-packet": {
      const result = await researchControllerRunnerPacketCommand({
        statePath: requireFlagString(flags, "state"),
        reason: flagString(flags, "reason") ?? undefined,
      });
      console.log(flags.json === true ? renderResearchControllerRunnerPacketJson(result) : renderResearchControllerRunnerPacket(result));
      return result.status === "blocked" ? 1 : 0;
    }
    case "controller-self-test": {
      const result = await researchControllerSelfTestCommand({
        outDir: requireFlagString(flags, "out-dir"),
        objective: flagString(flags, "objective") ?? undefined,
      });
      console.log(flags.json === true ? renderResearchControllerSelfTestJson(result) : renderResearchControllerSelfTest(result));
      return result.status === "fail" ? 1 : 0;
    }
    case "controller-follow-agenda": {
      const env = await reviewerEnv(flags);
      const result = await researchControllerFollowAgendaCommand({
        statePath: requireFlagString(flags, "state"),
        reason: flagString(flags, "reason") ?? undefined,
        maxSteps: parseOptionalNumberFlag(flags, "max-steps") ?? undefined,
        forceReviewRequired: flags.force === true,
        env,
      });
      console.log(flags.json === true ? renderResearchControllerFollowAgendaJson(result) : renderResearchControllerFollowAgenda(result));
      return result.refused || result.state.status === "blocked" || result.state.status === "failed" ? 1 : 0;
    }
    case "controller-follow-loop": {
      const env = await reviewerEnv(flags);
      const result = await researchControllerFollowLoopCommand({
        statePath: requireFlagString(flags, "state"),
        reason: flagString(flags, "reason") ?? undefined,
        maxIterations: parseOptionalNumberFlag(flags, "max-iterations") ?? undefined,
        maxStepsPerRun: parseOptionalNumberFlag(flags, "max-steps-per-run") ?? undefined,
        forceReviewRequired: flags.force === true,
        env,
      });
      console.log(flags.json === true ? renderResearchControllerFollowLoopJson(result) : renderResearchControllerFollowLoop(result));
      return result.state.status === "blocked" || result.state.status === "failed" ? 1 : 0;
    }
    case "controller-operate": {
      const env = await reviewerEnv(flags);
      const result = await researchControllerOperateCommand({
        statePath: requireFlagString(flags, "state"),
        reason: flagString(flags, "reason") ?? undefined,
        maxCycles: parseOptionalNumberFlag(flags, "max-cycles") ?? undefined,
        maxRounds: parseOptionalNumberFlag(flags, "max-rounds") ?? undefined,
        maxIterationsPerRound: parseOptionalNumberFlag(flags, "max-iterations-per-round") ?? undefined,
        maxStepsPerRun: parseOptionalNumberFlag(flags, "max-steps-per-run") ?? undefined,
        forceReviewRequired: flags.force === true,
        env,
      });
      console.log(flags.json === true ? renderResearchControllerOperateJson(result) : renderResearchControllerOperate(result));
      return result.status === "blocked" ? 1 : 0;
    }
    case "controller-supervise": {
      const env = await reviewerEnv(flags);
      const result = await researchControllerSupervisorCommand({
        statePath: requireFlagString(flags, "state"),
        reason: flagString(flags, "reason") ?? undefined,
        maxRounds: parseOptionalNumberFlag(flags, "max-rounds") ?? undefined,
        maxIterationsPerRound: parseOptionalNumberFlag(flags, "max-iterations-per-round") ?? undefined,
        maxStepsPerRun: parseOptionalNumberFlag(flags, "max-steps-per-run") ?? undefined,
        forceReviewRequired: flags.force === true,
        env,
      });
      console.log(flags.json === true ? renderResearchControllerSupervisorJson(result) : renderResearchControllerSupervisor(result));
      return result.state.status === "blocked" || result.state.status === "failed" || result.rounds.some(item => /did not authorize/.test(item.reason)) ? 1 : 0;
    }
    case "controller-run":
    case "run-autonomous": {
      const env = await reviewerEnv(flags);
      const statePath = flagString(flags, "state");
      const result = await researchControllerRunCommand({
        ...controllerOptionsFromFlags(flags, { requireQuestion: !statePath, requireOutDir: !statePath }),
        statePath,
        env,
      });
      console.log(flags.json === true ? renderResearchControllerStateJson(result) : renderResearchControllerState(result));
      return result.state.status === "blocked" || result.state.status === "failed" ? 1 : 0;
    }
    case "controller-inspect": {
      const result = await researchControllerInspectCommand({ statePath: requireFlagString(flags, "state") });
      console.log(flags.json === true ? renderResearchControllerStateJson(result) : renderResearchControllerState(result));
      return result.state.status === "blocked" || result.state.status === "failed" ? 1 : 0;
    }
    case "reviewer-providers": {
      const env = await reviewerEnv(flags);
      const result = await researchReviewerProvidersCommand(env);
      console.log(flags.json === true ? renderResearchReviewerProvidersJson(result) : renderResearchReviewerProviders(result));
      return 0;
    }
    case "study-critic": {
      const env = await reviewerEnv(flags);
      const result = await researchStudyCriticCommand({
        runDir: requireFlagString(flags, "run-dir"),
        outDir: flagString(flags, "out-dir") ?? undefined,
        stage: parseReviewStage(flagString(flags, "stage") ?? undefined),
        autonomy: parseReviewAutonomy(flagString(flags, "autonomy") ?? undefined),
        panel: (flagString(flags, "panel") as "default" | "cheap" | "strict" | "all" | "deepseek-dual" | "deepseek-triple" | undefined) ?? undefined,
        reviewers: flagList(flags, "reviewer"),
        budget: {
          maxPerCallUsd: parseOptionalNumberFlag(flags, "max-per-call-usd") ?? undefined,
          maxPanelUsd: parseOptionalNumberFlag(flags, "max-panel-usd") ?? undefined,
          maxStudyLoopUsd: parseOptionalNumberFlag(flags, "max-study-loop-usd") ?? undefined,
        },
        includeRaw: flags["no-raw"] === true ? false : true,
        allowPhi: flags["no-phi"] === true ? false : true,
        maxPromptChars: parseOptionalIntegerFlag(flags, "max-prompt-chars"),
        maxArtifactBytes: parseOptionalIntegerFlag(flags, "max-artifact-bytes"),
        mock: flags.mock === true,
        env,
      });
      console.log(flags.json === true ? renderResearchStudyCriticJson(result) : renderResearchStudyCritic(result));
      return result.adjudication.verdict === "block" ? 1 : 0;
    }
    case "review-adjudicate": {
      const result = await researchReviewAdjudicateCommand({
        panelPath: requireFlagString(flags, "panel"),
        outPath: flagString(flags, "out") ?? undefined,
      });
      console.log(flags.json === true ? renderResearchReviewAdjudicationJson(result) : renderResearchReviewAdjudication(result));
      return result.verdict === "block" ? 1 : 0;
    }
    case "review-response": {
      const result = await researchReviewResponseCommand({
        adjudicationPath: requireFlagString(flags, "adjudication"),
        runDir: flagString(flags, "run-dir") ?? undefined,
        autonomy: parseReviewAutonomy(flagString(flags, "autonomy") ?? undefined),
        outPath: flagString(flags, "out") ?? undefined,
        stateReentryPath: flagString(flags, "state-reentry") ?? undefined,
      });
      console.log(flags.json === true ? renderResearchReviewResponseJson(result) : renderResearchReviewResponse(result));
      return result.stateReentry.status === "blocked" ? 1 : 0;
    }
    case "benchmark-suite-run": {
      const result = await researchBenchmarkSuiteRunCommand({
        suiteDir: requireFlagString(flags, "suite"),
        outDir: flagString(flags, "out-dir") ?? undefined,
        outPath: flagString(flags, "out") ?? undefined,
        reportPath: flagString(flags, "report") ?? undefined,
      });
      console.log(flags.json === true ? renderResearchBenchmarkSuiteRunJson(result) : renderResearchBenchmarkSuiteRun(result));
      return result.failCount > 0 ? 1 : 0;
    }
    case "benchmark-trend": {
      const result = await researchBenchmarkTrendCommand({
        historyDir: requireFlagString(flags, "history"),
        outPath: flagString(flags, "out") ?? undefined,
        reportPath: flagString(flags, "report") ?? undefined,
      });
      console.log(flags.json === true ? renderResearchBenchmarkTrendJson(result) : renderResearchBenchmarkTrend(result));
      return result.trend === "regressing" ? 1 : 0;
    }
    case "backend-status": {
      const result = await researchBackendStatusCommand({
        python: flagString(flags, "python") ?? undefined,
        rscript: flagString(flags, "rscript") ?? undefined,
      });
      console.log(flags.json === true ? renderResearchBackendStatusJson(result) : renderResearchBackendStatus(result));
      return 0;
    }
    case "paper-qa": {
      const result = await researchPaperQaCommand({
        paperPath: requireFlagString(flags, "paper"),
        evidencePath: flagString(flags, "evidence") ?? undefined,
      });
      console.log(flags.json === true ? renderResearchPaperQaJson(result) : renderResearchPaperQa(result));
      return result.status === "fail" ? 1 : 0;
    }
    case "paper-index": {
      const result = await researchPaperIndexCommand({
        papersDir: requireFlagString(flags, "papers-dir"),
        outPath: flagString(flags, "out") ?? undefined,
      });
      console.log(flags.json === true ? renderResearchPaperIndexJson(result) : renderResearchPaperIndex(result));
      return result.papers.length ? 0 : 1;
    }
    case "paper-lifecycle": {
      const result = await researchPaperLifecycleCommand({
        paperDir: requireFlagString(flags, "paper-dir"),
        capabilityDir: flagString(flags, "capability-dir") ?? undefined,
        outPath: flagString(flags, "out") ?? undefined,
      });
      console.log(flags.json === true ? renderResearchPaperLifecycleJson(result) : renderResearchPaperLifecycle(result));
      return result.lifecycleStatus === "blocked" ? 1 : 0;
    }
    case "paper-rerun-stability": {
      const toleranceRaw = flagString(flags, "tolerance");
      const result = await researchPaperRerunStabilityCommand({
        baselineDir: requireFlagString(flags, "baseline"),
        repeatDir: requireFlagString(flags, "repeat"),
        tolerance: toleranceRaw ? Number(toleranceRaw) : undefined,
        outPath: flagString(flags, "out") ?? undefined,
      });
      console.log(flags.json === true ? renderResearchPaperRerunStabilityJson(result) : renderResearchPaperRerunStability(result));
      return result.status === "pass" ? 0 : 1;
    }
    case "paper-run": {
      const result = await researchPaperRunCommand({
        analysisSpecPath: requireFlagString(flags, "analysis-spec"),
        dataRoot: requireFlagString(flags, "data-root"),
        outDir: requireFlagString(flags, "out-dir"),
        backend: flagString(flags, "backend") as Parameters<typeof researchPaperRunCommand>[0]["backend"],
        python: flagString(flags, "python") ?? undefined,
        rscript: flagString(flags, "rscript") ?? undefined,
        capabilityDir: flagString(flags, "capability-dir") ?? undefined,
      });
      console.log(flags.json === true ? renderResearchPaperRunJson(result) : renderResearchPaperRun(result));
      return result.lifecycleStatus === "ready_for_local_review" ? 0 : 1;
    }
    case "paper-runner-record": {
      const result = await researchPaperRunnerRecordCommand({
        paperId: requireFlagString(flags, "paper-id"),
        commandSummary: requireFlagString(flags, "command-summary"),
        status: flagString(flags, "status") as Parameters<typeof researchPaperRunnerRecordCommand>[0]["status"],
        runnerKind: flagString(flags, "runner-kind") ?? undefined,
        analysisSpecPath: flagString(flags, "analysis-spec") ?? undefined,
        binding: flagString(flags, "binding") as Parameters<typeof researchPaperRunnerRecordCommand>[0]["binding"],
        inputFiles: flagList(flags, "input"),
        outputFiles: flagList(flags, "output"),
        weighting: flagString(flags, "weighting") ?? undefined,
        variance: flagString(flags, "variance") ?? undefined,
        population: flagString(flags, "population") ?? undefined,
        outPath: flagString(flags, "out") ?? undefined,
      });
      console.log(flags.json === true ? renderResearchPaperRunnerRecordJson(result) : renderResearchPaperRunnerRecord(result));
      return result.status === "succeeded" ? 0 : 1;
    }
    case "benchmark-register": {
      const result = await researchBenchmarkRegisterCommand({
        packetDir: requireFlagString(flags, "packet"),
        outPath: flagString(flags, "out") ?? undefined,
        benchmarkId: flagString(flags, "id") ?? undefined,
        domain: flagString(flags, "domain") ?? undefined,
      });
      console.log(flags.json === true ? renderResearchBenchmarkJson(result) : renderResearchBenchmark(result));
      return result.expectedArtifacts.length ? 0 : 1;
    }
    case "benchmark-run": {
      const result = await researchBenchmarkRunCommand({
        benchmarkPath: requireFlagString(flags, "benchmark"),
        outPath: flagString(flags, "out") ?? undefined,
      });
      console.log(flags.json === true ? renderResearchBenchmarkRunJson(result) : renderResearchBenchmarkRun(result));
      return result.status === "fail" ? 1 : 0;
    }
    case "benchmark-score": {
      const result = await researchBenchmarkScoreCommand(requireFlagString(flags, "run"));
      console.log(flags.json === true ? renderResearchBenchmarkScoreJson(result) : renderResearchBenchmarkScore(result));
      return result.status === "fail" ? 1 : 0;
    }
    case "benchmark-suite": {
      const result = await researchBenchmarkSuiteCommand({
        suiteDir: requireFlagString(flags, "dir"),
        outPath: flagString(flags, "out") ?? undefined,
      });
      console.log(flags.json === true ? renderResearchBenchmarkSuiteJson(result) : renderResearchBenchmarkSuite(result));
      return result.score.status === "fail" ? 1 : 0;
    }
    case "table-summary": {
      const result = await researchTableSummaryCommand({
        file: requireFlagString(flags, "file"),
        python: flagString(flags, "python") ?? undefined,
      });
      console.log(flags.json === true ? renderResearchTableSummaryJson(result) : renderResearchTableSummary(result));
      return result.warnings.some(issue => issue.severity === "blocker") ? 1 : 0;
    }
    case "infer-schema": {
      const result = await researchInferSchemaCommand(requireFlagString(flags, "file"));
      console.log(flags.json === true ? renderResearchSchemaInferenceJson(result) : renderResearchSchemaInference(result));
      return 0;
    }
    case "stages":
    case "pipeline-stages": {
      const stages = researchPipelineStagesCommand();
      console.log(flags.json === true ? renderResearchPipelineStagesJson(stages) : renderResearchPipelineStages(stages));
      return 0;
    }
    case "stage-artifacts": {
      const artifacts = researchStageArtifactsCommand();
      console.log(flags.json === true ? renderResearchStageArtifactsJson(artifacts) : renderResearchStageArtifacts(artifacts));
      return 0;
    }
    case "stage-gate": {
      const result = researchStageGateCommand(flagList(flags, "completed"), requireFlagString(flags, "target"));
      console.log(flags.json === true ? renderResearchStageGateJson(result) : renderResearchStageGate(result));
      return result.status === "blocked" ? 1 : 0;
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
    case "approval-verify": {
      const result = await researchApprovalVerifyCommand(requireFlagString(flags, "packet"));
      console.log(flags.json === true ? renderResearchApprovalVerificationJson(result) : renderResearchApprovalVerification(result));
      return result.status === "valid" ? 0 : 1;
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
      console.log(flags.json === true ? renderResearchReportReviewJson(result) : renderResearchReportReview(result));
      return result.status === "pass" ? 0 : 1;
    }
    case "manifest": {
      const packetDir = requireFlagString(flags, "packet");
      const result = await researchArtifactManifestCommand(packetDir);
      console.log(flags.json === true ? renderResearchArtifactManifestJson(result) : renderResearchArtifactManifest(result));
      return 0;
    }
    case "manifest-verify": {
      const result = await researchManifestVerifyCommand(requireFlagString(flags, "packet"));
      console.log(flags.json === true ? renderResearchManifestVerificationJson(result) : renderResearchManifestVerification(result));
      return result.status === "valid" ? 0 : 1;
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
    case "packet-summary": {
      const packetDir = requireFlagString(flags, "packet");
      const result = await researchPacketSummaryCommand(packetDir);
      console.log(flags.json === true ? renderResearchPacketSummaryJson(result) : renderResearchPacketSummary(result));
      return result.checkpoint.currentStage === "complete" ? 0 : 1;
    }
    case "next": {
      const result = await researchPacketNextCommand(requireFlagString(flags, "packet"), { trace: flags.trace === true });
      console.log(flags.json === true ? renderResearchPacketNextJson(result) : renderResearchPacketNext(result));
      if (flags["exit-zero-on-blocked"] === true) return 0;
      return result.gateStatus === "blocked" ? 1 : 0;
    }
    case "navigation-trace": {
      const result = await researchNavigationTraceCommand(requireFlagString(flags, "packet"));
      console.log(flags.json === true ? renderResearchNavigationTraceJson(result) : renderResearchNavigationTrace(result));
      return result.status === "valid" ? 0 : 1;
    }
    case "packet-verify": {
      const result = await researchPacketVerifyCommand(requireFlagString(flags, "packet"));
      console.log(flags.json === true ? renderResearchPacketVerificationJson(result) : renderResearchPacketVerification(result));
      return result.status === "pass" ? 0 : 1;
    }
    case "packet-readiness": {
      const result = await researchPacketReadinessCommand(requireFlagString(flags, "packet"));
      console.log(flags.json === true ? renderResearchPacketReadinessJson(result) : renderResearchPacketReadiness(result));
      return result.status === "review_ready" ? 0 : 1;
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
      console.log(flags.json === true ? renderResearchLoopNoteJson(result) : renderResearchLoopNote(result));
      return 0;
    }
    case "cycle-audit": {
      const result = await researchCycleAuditCommand(requireFlagString(flags, "cycle-dir"));
      console.log(flags.json === true ? renderResearchCycleAuditJson(result) : renderResearchCycleAudit(result));
      return result.countsAsCycle ? 0 : 1;
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

function parsePositiveIntFlag(
  flags: Parameters<typeof flagString>[0],
  key: string,
  fallback: number,
): number {
  const raw = flagString(flags, key);
  if (raw === undefined) return fallback;
  const value = Number.parseInt(raw, 10);
  if (!Number.isFinite(value) || value < 1) throw new Error(`--${key} must be a positive integer`);
  return value;
}

function parseOptionalNumberFlag(
  flags: Parameters<typeof flagString>[0],
  key: string,
): number | undefined {
  const raw = flagString(flags, key);
  if (raw === undefined) return undefined;
  const value = Number(raw);
  if (!Number.isFinite(value)) throw new Error(`--${key} must be numeric`);
  return value;
}

function parseOptionalIntegerFlag(
  flags: Parameters<typeof flagString>[0],
  key: string,
): number | undefined {
  const raw = flagString(flags, key);
  if (raw === undefined) return undefined;
  const value = Number.parseInt(raw, 10);
  if (!Number.isFinite(value) || value < 1) throw new Error(`--${key} must be a positive integer`);
  return value;
}

function controllerOptionsFromFlags(
  flags: Parameters<typeof flagString>[0],
  requirements: { requireQuestion: boolean; requireOutDir: boolean },
): Parameters<typeof researchControllerInitCommand>[0] {
  const question = requirements.requireQuestion ? requireFlagString(flags, "question") : (flagString(flags, "question") ?? "");
  const outDir = requirements.requireOutDir ? requireFlagString(flags, "out-dir") : (flagString(flags, "out-dir") ?? ".");
  const methodRaw = flagString(flags, "method");
  const controllerRequested = flagString(flags, "controller") !== undefined
    || flags["use-model"] === true
    || flags["require-controller-model"] === true
    || flagString(flags, "controller-max-input-chars") !== undefined
    || flagString(flags, "controller-max-output-tokens") !== undefined
    || flagString(flags, "controller-timeout-ms") !== undefined;
  const controller = controllerRequested
    ? {
        ...parseControllerModel(flagString(flags, "controller"), flags["use-model"] === true || flags["require-controller-model"] === true),
        maxInputChars: parseOptionalIntegerFlag(flags, "controller-max-input-chars"),
        maxOutputTokens: parseOptionalIntegerFlag(flags, "controller-max-output-tokens"),
        timeoutMs: parseOptionalIntegerFlag(flags, "controller-timeout-ms"),
      }
    : undefined;
  return {
    question,
    outDir,
    dataPath: flagString(flags, "data") ?? undefined,
    datasetDir: flagString(flags, "dataset-dir") ?? undefined,
    runDir: flagString(flags, "run-dir") ?? undefined,
    method: methodRaw ? parseStatsMethod(methodRaw) : undefined,
    outcome: flagString(flags, "outcome") ?? undefined,
    exposure: flagString(flags, "exposure") ?? undefined,
    group: flagString(flags, "group") ?? undefined,
    time: flagString(flags, "time") ?? undefined,
    event: flagString(flags, "event") ?? undefined,
    id: flagString(flags, "id") ?? undefined,
    strata: flagString(flags, "strata") ?? undefined,
    cluster: flagString(flags, "cluster") ?? undefined,
    period: flagString(flags, "period") ?? undefined,
    post: flagString(flags, "post") ?? undefined,
    runningVariable: flagString(flags, "running-variable") ?? undefined,
    cutoff: parseOptionalNumberFlag(flags, "cutoff"),
    instrument: flagString(flags, "instrument") ?? undefined,
    variables: flagList(flags, "variable"),
    covariates: flagList(flags, "covariate"),
    exactCovariates: flagList(flags, "exact-covariate"),
    surveyDesign: flags.survey === true ? true : undefined,
    allowSurveyApproximation: flags["allow-survey-approximation"] === true ? true : undefined,
    python: flagString(flags, "python") ?? undefined,
    autonomy: parseReviewAutonomy(flagString(flags, "autonomy") ?? undefined),
    maxSteps: parseOptionalIntegerFlag(flags, "max-steps"),
    minRows: parseOptionalIntegerFlag(flags, "min-rows"),
    maxRequiredVariableMissingness: parseOptionalNumberFlag(flags, "max-required-missingness"),
    allowExecution: flags["no-execution"] === true ? false : undefined,
    allowExternalReview: flags["external-review"] === true ? true : undefined,
    requireExternalReviewForPromotion: flags["require-external-review"] === true ? true : undefined,
    mockExternalReview: flags["mock-review"] === true ? true : undefined,
    allowAutoRepair: flags["no-auto-repair"] === true ? false : undefined,
    maxAutoRepairs: parseOptionalIntegerFlag(flags, "max-auto-repairs"),
    allowInputPatches: flags["no-input-patches"] === true ? false : undefined,
    maxInputPatches: parseOptionalIntegerFlag(flags, "max-input-patches"),
    allowToolActions: flags["no-tool-actions"] === true ? false : undefined,
    maxToolActions: parseOptionalIntegerFlag(flags, "max-tool-actions"),
    allowedToolIds: parseControllerToolIds(flagList(flags, "allowed-tool")),
    toolTimeoutMs: parseOptionalIntegerFlag(flags, "tool-timeout-ms"),
    allowContext: flags.context === true || flags["context-preflight"] === true ? true : undefined,
    requireContext: flags["require-context"] === true ? true : undefined,
    contextRepo: flagString(flags, "context-repo") ?? undefined,
    contextTarget: flagString(flags, "context-target") ?? undefined,
    contextBin: flagString(flags, "context-bin") ?? undefined,
    autocontextRoot: flagString(flags, "autocontext-root") ?? undefined,
    contextBudgetTokens: parseOptionalIntegerFlag(flags, "context-budget") ?? parseOptionalIntegerFlag(flags, "context-budget-tokens"),
    allowLiterature: flags.literature === true || flags["literature-search"] === true ? true : undefined,
    literatureBaseUrl: flagString(flags, "literature-base-url") ?? undefined,
    literatureEndpoint: flagString(flags, "literature-endpoint") ?? undefined,
    literatureDepth: parseControllerLiteratureDepth(flagString(flags, "literature-depth") ?? undefined),
    literatureTopK: parseOptionalIntegerFlag(flags, "literature-top-k"),
    literatureTimeoutMs: parseOptionalIntegerFlag(flags, "literature-timeout-ms"),
    literatureMockResponsePath: flagString(flags, "literature-mock-response") ?? undefined,
    reviewPanel: parseControllerReviewPanel(flagString(flags, "panel")),
    reviewStage: parseReviewStage(flagString(flags, "stage") ?? undefined),
    reviewerBudget: {
      maxPerCallUsd: parseOptionalNumberFlag(flags, "max-per-call-usd"),
      maxPanelUsd: parseOptionalNumberFlag(flags, "max-panel-usd"),
      maxStudyLoopUsd: parseOptionalNumberFlag(flags, "max-study-loop-usd"),
    },
    controllerBudget: {
      maxPerCallUsd: parseOptionalNumberFlag(flags, "controller-max-per-call-usd"),
      maxPanelUsd: parseOptionalNumberFlag(flags, "controller-max-panel-usd"),
      maxStudyLoopUsd: parseOptionalNumberFlag(flags, "controller-max-study-loop-usd"),
    },
    requireControllerModel: flags["require-controller-model"] === true ? true : undefined,
    controller,
  };
}

function parseControllerReviewPanel(raw: string | undefined): "default" | "cheap" | "strict" | "all" | "deepseek-dual" | "deepseek-triple" | undefined {
  if (raw === undefined) return undefined;
  const allowed = new Set(["default", "cheap", "strict", "all", "deepseek-dual", "deepseek-triple"]);
  if (!allowed.has(raw)) throw new Error("--panel must be default, cheap, strict, all, deepseek-dual, or deepseek-triple");
  return raw as "default" | "cheap" | "strict" | "all" | "deepseek-dual" | "deepseek-triple";
}

function parseControllerToolId(raw: string): Parameters<typeof researchControllerToolCommand>[0]["request"]["toolId"] {
  if (raw !== "npm-build" && raw !== "npm-test" && raw !== "controller-inspect" && raw !== "controller-read-artifact" && raw !== "controller-read-file" && raw !== "controller-search-repo" && raw !== "controller-run-agenteer" && raw !== "controller-git-diff" && raw !== "controller-propose-patch" && raw !== "controller-apply-patch" && raw !== "controller-verify-patch" && raw !== "controller-rollback-patch") {
    throw new Error("--tool must be npm-build, npm-test, controller-inspect, controller-read-artifact, controller-read-file, controller-search-repo, controller-run-agenteer, controller-git-diff, controller-propose-patch, controller-apply-patch, controller-verify-patch, or controller-rollback-patch");
  }
  return raw;
}

function parseControllerToolIds(raw: string[]): Parameters<typeof researchControllerInitCommand>[0]["allowedToolIds"] {
  if (!raw.length) return undefined;
  return raw.map(parseControllerToolId);
}

function parseControllerLiteratureDepth(raw: string | undefined): "quick" | "standard" | "long" | undefined {
  if (raw === undefined) return undefined;
  if (raw !== "quick" && raw !== "standard" && raw !== "long") throw new Error("--literature-depth must be quick, standard, or long");
  return raw;
}

function parseEstimand(raw: string | undefined): "ATE" | "ATT" | undefined {
  if (raw === undefined) return undefined;
  const value = raw.toUpperCase();
  if (value !== "ATE" && value !== "ATT") throw new Error("--estimand must be ATE or ATT");
  return value;
}

function parseLiteratureDepth(raw: string | undefined): "quick" | "standard" | "long" | undefined {
  if (raw === undefined) return undefined;
  if (raw !== "quick" && raw !== "standard" && raw !== "long") throw new Error("--depth must be quick, standard, or long");
  return raw;
}

function parseDatasetDomain(raw: string | undefined): DatasetDomain | undefined {
  if (raw === undefined) return undefined;
  const allowed = new Set<DatasetDomain>(["public-health-survey", "ehr", "registry", "claims", "user-upload", "synthetic", "unknown"]);
  if (!allowed.has(raw as DatasetDomain)) throw new Error(`--domain must be one of ${Array.from(allowed).join(", ")}`);
  return raw as DatasetDomain;
}

async function reviewerEnv(flags: Parameters<typeof flagString>[0]): Promise<NodeJS.ProcessEnv> {
  const explicit = flagString(flags, "env-file");
  const envFile = explicit ?? process.env.AGENTEER_ENV_FILE;
  if (!envFile) return process.env;
  const text = await readFile(envFile, "utf-8");
  const parsed: Record<string, string> = {};
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const withoutExport = trimmed.startsWith("export ") ? trimmed.slice("export ".length).trim() : trimmed;
    const eq = withoutExport.indexOf("=");
    if (eq <= 0) continue;
    const key = withoutExport.slice(0, eq).trim();
    let value = withoutExport.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    parsed[key] = value;
  }
  return { ...process.env, ...parsed };
}

async function loadLiteratureContextForModeling(pathValue: string, question: string): Promise<Awaited<ReturnType<typeof researchLiteratureContextCommand>>> {
  const raw = JSON.parse(await readFile(pathValue, "utf-8")) as Record<string, unknown>;
  if (raw.literatureContext && typeof raw.literatureContext === "object") {
    return raw.literatureContext as Awaited<ReturnType<typeof researchLiteratureContextCommand>>;
  }
  return researchLiteratureContextCommand({ literaturePath: pathValue, question });
}

async function loadSpec(path: string): Promise<unknown> {
  const raw = await readFile(path, "utf-8");
  if (path.endsWith(".json")) return JSON.parse(raw);
  return parseYaml(raw);
}

async function readArgOrFile(value: string): Promise<string> {
  try {
    return await readFile(value, "utf-8");
  } catch {
    return value;
  }
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
