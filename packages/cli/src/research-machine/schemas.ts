import { z } from "zod";

export const machineIssueSeveritySchema = z.enum(["blocker", "warning", "note"]);
export type MachineIssueSeverity = z.infer<typeof machineIssueSeveritySchema>;

export const machineIssueSchema = z.object({
  severity: machineIssueSeveritySchema,
  code: z.string().min(1),
  message: z.string().min(1),
  evidenceRefs: z.array(z.string()).default([]),
});
export type MachineIssue = z.infer<typeof machineIssueSchema>;

export const backendIdSchema = z.enum([
  "duckdb-polars",
  "python-scipy",
  "python-statsmodels",
  "python-linearized",
  "r-survey",
  "r-gtsummary",
  "r-survival",
  "r-lme4",
  "r-mice",
  "r-meta",
  "r-lavaan",
  "python-lifelines",
  "python-networkx",
  "python-nlp",
  "sklearn",
  "causal",
  "bayesian",
]);
export type BackendId = z.infer<typeof backendIdSchema>;

export const modelFamilySchema = z.enum([
  "descriptive",
  "hypothesis_test",
  "correlation",
  "linear",
  "logistic",
  "ordinal",
  "multinomial",
  "count",
  "prevalence",
  "diagnostic_accuracy",
  "survival",
  "mixed_effects",
  "gee",
  "multilevel",
  "glm",
  "time_series",
  "difference_in_differences",
  "propensity_weighting",
  "mediation",
  "sem",
  "prediction",
  "dimension_reduction",
  "clustering",
  "meta_analysis",
  "nonparametric",
  "missing_data",
  "multiple_comparison",
  "reliability",
  "agreement",
  "survey_measurement",
  "epidemiologic",
  "clinical_trial",
  "health_economics",
  "spatial",
  "network",
  "nlp",
  "qualitative",
  "mixed_methods",
  "high_dimensional",
  "image_signal",
  "power",
  "diagnostics",
  "bayesian",
]);
export type ModelFamily = z.infer<typeof modelFamilySchema>;

export const datasetAdapterIdSchema = z.enum(["nhanes", "brfss", "seer", "mimic", "claims", "user-table", "synthetic-fixture"]);
export type DatasetAdapterId = z.infer<typeof datasetAdapterIdSchema>;

export const studyArchetypeIdSchema = z.enum([
  "cross-sectional-association",
  "survey-prevalence",
  "continuous-biomarker-model",
  "binary-outcome-model",
  "subgroup-domain-analysis",
  "subsample-high-missingness",
  "diagnostic-accuracy",
  "prediction-model",
  "target-trial-emulation-sketch",
  "interrupted-time-series",
  "difference-in-differences",
]);
export type StudyArchetypeId = z.infer<typeof studyArchetypeIdSchema>;

export const researchBackendManifestSchema = z.object({
  schemaVersion: z.literal(1),
  id: backendIdSchema,
  label: z.string().min(1),
  role: z.enum(["data-prep", "inference", "table-reporting", "ml", "causal", "bayesian"]),
  productionStatus: z.enum(["available", "optional", "future", "blocked"]),
  supportedModelFamilies: z.array(modelFamilySchema),
  requiredExecutables: z.array(z.string()),
  requiredPackages: z.array(z.string()),
  inputs: z.array(z.string()),
  outputs: z.array(z.string()),
  limitations: z.array(z.string()),
  verifier: z.object({
    commandKind: z.enum(["python-import", "r-package", "none"]),
    required: z.array(z.string()),
  }),
});
export type ResearchBackendManifest = z.infer<typeof researchBackendManifestSchema>;

export const datasetAdapterManifestSchema = z.object({
  schemaVersion: z.literal(1),
  id: datasetAdapterIdSchema,
  label: z.string().min(1),
  domain: z.enum(["public-health-survey", "registry", "ehr", "claims", "user-upload", "synthetic"]),
  productionStatus: z.enum(["ready", "partial", "design-only", "blocked"]),
  localCachePolicy: z.enum(["required", "optional", "not-applicable"]),
  supportedFormats: z.array(z.enum(["parquet", "csv", "json", "xpt", "duckdb"])),
  keyFields: z.array(z.string()),
  surveyDesign: z.object({
    supportsWeights: z.boolean(),
    weightVariables: z.array(z.string()),
    strataVariables: z.array(z.string()),
    psuVariables: z.array(z.string()),
    replicateWeights: z.boolean(),
    multiCyclePolicy: z.enum(["explicit-required", "not-applicable", "unsupported"]),
  }),
  codebookPolicy: z.enum(["required", "recommended", "not-applicable"]),
  caveats: z.array(z.string()),
  validationRules: z.array(z.string()),
});
export type DatasetAdapterManifest = z.infer<typeof datasetAdapterManifestSchema>;

export const studyArchetypeManifestSchema = z.object({
  schemaVersion: z.literal(1),
  id: studyArchetypeIdSchema,
  label: z.string().min(1),
  questionPatterns: z.array(z.string()),
  requiredSpecSections: z.array(z.string()),
  allowedDatasets: z.array(datasetAdapterIdSchema),
  allowedBackends: z.array(backendIdSchema),
  modelFamilies: z.array(modelFamilySchema),
  requiredVariables: z.array(z.enum(["outcome", "exposure", "covariates", "weights", "time", "caseDefinition", "goldStandard"])),
  expectedArtifacts: z.array(z.string()),
  qaGates: z.array(z.string()),
  commonFailureModes: z.array(z.string()),
  stopForHumanReviewWhen: z.array(z.string()),
});
export type StudyArchetypeManifest = z.infer<typeof studyArchetypeManifestSchema>;

export const analysisMethodCategorySchema = z.enum([
  "descriptive",
  "group_comparison",
  "correlation_association",
  "linear_regression",
  "logistic_regression",
  "count_regression",
  "survival_time_to_event",
  "longitudinal_repeated_measures",
  "multilevel_hierarchical",
  "generalized_linear_model",
  "causal_inference",
  "diagnostic_prognostic",
  "prediction_machine_learning",
  "model_validation",
  "dimensionality_latent",
  "clustering_subgroup_discovery",
  "time_series",
  "meta_analysis",
  "bayesian",
  "nonparametric_resampling",
  "missing_data",
  "sensitivity_subgroup_secondary",
  "effect_size",
  "agreement_reliability",
  "survey_questionnaire",
  "epidemiologic",
  "clinical_trial",
  "health_economics",
  "spatial_geographic",
  "network",
  "text_nlp",
  "qualitative",
  "mixed_methods",
  "mediation_moderation_path",
  "structural_equation_modeling",
  "high_dimensional",
  "image_signal",
  "power_sample_size",
  "model_diagnostics",
  "multiple_comparisons",
]);
export type AnalysisMethodCategory = z.infer<typeof analysisMethodCategorySchema>;

export const outcomeTypeSchema = z.enum([
  "none",
  "continuous",
  "binary",
  "categorical",
  "ordinal",
  "count",
  "rate",
  "time_to_event",
  "repeated_continuous",
  "repeated_binary",
  "clustered",
  "text",
  "image",
  "signal",
  "spatial",
  "network",
  "high_dimensional",
  "qualitative",
  "mixed",
]);
export type OutcomeType = z.infer<typeof outcomeTypeSchema>;

export const studyDesignSchema = z.enum([
  "unspecified",
  "cross_sectional",
  "case_control",
  "cohort",
  "randomized_trial",
  "longitudinal_cohort",
  "diagnostic",
  "prediction",
  "meta_analysis",
  "qualitative",
  "mixed_methods",
  "time_series",
  "spatial",
  "network",
  "economic_evaluation",
  "measurement",
]);
export type StudyDesign = z.infer<typeof studyDesignSchema>;

export const dataStructureSchema = z.enum([
  "single_table",
  "complex_survey",
  "paired",
  "repeated_measures",
  "clustered",
  "nested",
  "longitudinal",
  "time_series",
  "survival",
  "case_control_matched",
  "high_dimensional",
  "text_corpus",
  "image_collection",
  "signal_series",
  "spatial_units",
  "network_graph",
  "study_level_effects",
  "qualitative_corpus",
  "mixed_methods",
]);
export type DataStructure = z.infer<typeof dataStructureSchema>;

export const analysisMethodSchema = z.object({
  schemaVersion: z.literal(1),
  id: z.string().min(1),
  label: z.string().min(1),
  category: analysisMethodCategorySchema,
  modelFamily: modelFamilySchema,
  purpose: z.string().min(1),
  aliases: z.array(z.string()),
  outcomeTypes: z.array(outcomeTypeSchema),
  exposureTypes: z.array(z.enum(["none", "continuous", "binary", "categorical", "ordinal", "count", "time", "text", "image", "network", "spatial", "mixed"])),
  studyDesigns: z.array(studyDesignSchema),
  dataStructures: z.array(dataStructureSchema),
  compatibleBackends: z.array(backendIdSchema),
  implementationStatus: z.enum(["executable", "contract-ready", "design-only", "blocked"]),
  requiredFields: z.array(z.string()),
  assumptions: z.array(z.string()),
  diagnostics: z.array(z.string()),
  effectMeasures: z.array(z.string()),
  artifactExpectations: z.array(z.string()),
  qaGates: z.array(z.string()),
  missingDataRequirements: z.array(z.string()),
  multiplicityRequirements: z.array(z.string()),
  commonFailureModes: z.array(z.string()),
  stopForHumanReviewWhen: z.array(z.string()),
  selection: z.object({
    keywords: z.array(z.string()),
    antiKeywords: z.array(z.string()).default([]),
    minScore: z.number().min(0).max(1).default(0.35),
  }),
});
export type AnalysisMethod = z.infer<typeof analysisMethodSchema>;

export const methodSelectionRequestSchema = z.object({
  question: z.string().min(1),
  outcomeType: outcomeTypeSchema.optional(),
  studyDesign: studyDesignSchema.optional(),
  dataStructures: z.array(dataStructureSchema).default([]),
  dataset: datasetAdapterIdSchema.optional(),
  goal: z.enum(["describe", "compare_groups", "associate", "predict", "diagnose", "causal", "validate", "discover", "synthesize", "measure", "economic", "qualitative", "mixed"]).optional(),
  surveyDesign: z.boolean().default(false),
  repeatedMeasures: z.boolean().default(false),
  clustered: z.boolean().default(false),
  timeToEvent: z.boolean().default(false),
  highDimensional: z.boolean().default(false),
  text: z.boolean().default(false),
  image: z.boolean().default(false),
  spatial: z.boolean().default(false),
  network: z.boolean().default(false),
  maxCandidates: z.number().int().positive().max(50).default(10),
});
export type MethodSelectionRequest = z.infer<typeof methodSelectionRequestSchema>;

export const methodCandidateSchema = z.object({
  method: analysisMethodSchema,
  score: z.number().min(0).max(1),
  rank: z.number().int().positive(),
  fitReasons: z.array(z.string()),
  cautions: z.array(machineIssueSchema),
  requiredBeforeExecution: z.array(z.string()),
});
export type MethodCandidate = z.infer<typeof methodCandidateSchema>;

export const methodSelectionResultSchema = z.object({
  schemaVersion: z.literal(1),
  selectionId: z.string().min(1),
  request: methodSelectionRequestSchema,
  primary: methodCandidateSchema.nullable(),
  candidates: z.array(methodCandidateSchema),
  excluded: z.array(z.object({
    methodId: z.string(),
    reason: z.string(),
  })),
  recommendedArchetype: studyArchetypeIdSchema,
  recommendedBackend: backendIdSchema,
  stopForHumanReview: z.boolean(),
  issues: z.array(machineIssueSchema),
  nextAction: z.string(),
});
export type MethodSelectionResult = z.infer<typeof methodSelectionResultSchema>;

export const analysisSpecV2Schema = z.object({
  schemaVersion: z.literal(2),
  specId: z.string().min(1),
  title: z.string().min(1),
  researchQuestion: z.string().min(1),
  dataset: datasetAdapterIdSchema,
  archetype: studyArchetypeIdSchema,
  estimand: z.object({
    type: z.enum(["descriptive", "associational", "causal", "predictive", "diagnostic"]),
    targetQuantity: z.string().min(1),
    populationLevel: z.boolean(),
    causalClaimsAllowed: z.boolean(),
  }),
  population: z.object({
    description: z.array(z.string()).min(1),
    inclusionCriteria: z.array(z.string()).default([]),
    exclusionCriteria: z.array(z.string()).default([]),
    filters: z.array(z.string()).default([]),
  }),
  variables: z.object({
    outcome: z.array(z.string()).min(1),
    exposure: z.array(z.string()).min(1),
    covariates: z.array(z.string()).default([]),
    stratifiers: z.array(z.string()).default([]),
    filters: z.array(z.string()).default([]),
    derived: z.array(z.object({
      name: z.string().min(1),
      expression: z.string().min(1),
      sourceVariables: z.array(z.string()).min(1),
    })).default([]),
  }),
  surveyDesign: z.object({
    required: z.boolean(),
    weightVariable: z.string().nullable(),
    strataVariable: z.string().nullable(),
    psuVariable: z.string().nullable(),
    replicateWeightPattern: z.string().nullable(),
    weightDomain: z.enum(["interview", "mec", "fasting", "subsample", "none"]),
    weightRationale: z.string().min(1),
    eligibilityNote: z.string().min(1),
    multiCycleRule: z.string().min(1),
  }),
  missingness: z.object({
    policy: z.enum(["complete_case", "multiple_imputation_required", "sensitivity_required", "not_applicable"]),
    highMissingnessThreshold: z.number().min(0).max(1),
    requiredDiagnostics: z.array(z.string()),
  }),
  model: z.object({
    family: modelFamilySchema,
    link: z.string().nullable(),
    binaryThreshold: z.number().nullable(),
    formula: z.string().min(1),
    diagnostics: z.array(z.string()),
  }),
  sensitivityAnalyses: z.array(z.object({
    id: z.string().min(1),
    description: z.string().min(1),
    required: z.boolean(),
  })).default([]),
  backendRequirements: z.object({
    preferred: backendIdSchema,
    allowed: z.array(backendIdSchema).min(1),
    minimumCapabilities: z.array(z.string()),
  }),
  artifactExpectations: z.array(z.object({
    path: z.string().min(1),
    role: z.string().min(1),
    required: z.boolean(),
    validator: z.string().min(1),
  })).min(1),
  claimPolicy: z.object({
    allowedInference: z.enum(["descriptive_only", "exploratory_association", "design_corrected_inference", "predictive_performance", "causal_only_after_review"]),
    pValueLanguage: z.enum(["avoid", "approximate_only", "standard"]),
    causalLanguage: z.enum(["forbidden", "requires_target_trial_review", "allowed"]),
    actionability: z.enum(["not_actionable", "hypothesis_generating", "clinical_review_required"]),
  }),
  failurePolicy: z.object({
    missingVariable: z.enum(["block", "warn"]),
    invalidWeight: z.enum(["block", "warn"]),
    highMissingness: z.enum(["block", "warn", "sensitivity_required"]),
    sparseCells: z.enum(["block", "suppress", "warn"]),
    hashMismatch: z.enum(["block"]),
    rerunInstability: z.enum(["block", "warn"]),
    methodologicalUncertainty: z.enum(["stop_for_review"]),
    unsupportedBackend: z.enum(["block"]),
  }),
  execution: z.object({
    maxRuntimeSeconds: z.number().int().positive(),
    maxRows: z.number().int().positive(),
    maxOutputBytes: z.number().int().positive(),
    maxUsd: z.number().min(0),
    allowedWriteRoots: z.array(z.string()),
    deniedActions: z.array(z.string()),
  }),
  specHash: z.string().min(16),
});
export type AnalysisSpecV2 = z.infer<typeof analysisSpecV2Schema>;

export const executionContractSchema = z.object({
  schemaVersion: z.literal(1),
  contractId: z.string().min(1),
  specHash: z.string().min(16),
  backend: researchBackendManifestSchema,
  datasetAdapter: datasetAdapterManifestSchema,
  archetype: studyArchetypeManifestSchema,
  runner: z.object({
    kind: z.enum(["local", "sandboxed-local", "cloud-disallowed"]),
    command: z.array(z.string()),
    environment: z.record(z.string(), z.string()),
    timeoutSeconds: z.number().int().positive(),
  }),
  policyEnvelope: z.object({
    maxUsd: z.number().min(0),
    allowedWriteRoots: z.array(z.string()),
    deniedActions: z.array(z.string()),
    requiresHumanReview: z.boolean(),
    stopReasons: z.array(z.string()),
  }),
  typedOutputs: z.array(z.object({
    path: z.string().min(1),
    role: z.string().min(1),
    schemaRef: z.string().min(1),
    required: z.boolean(),
  })),
  repeatability: z.object({
    required: z.boolean(),
    maxAbsoluteNumericDiff: z.number().min(0),
    compareArtifacts: z.array(z.string()),
  }),
  validation: z.object({
    status: z.enum(["pass", "warning", "blocked"]),
    issues: z.array(machineIssueSchema),
  }),
});
export type ExecutionContract = z.infer<typeof executionContractSchema>;

export const benchmarkCaseSchema = z.object({
  schemaVersion: z.literal(1),
  benchmarkId: z.string().min(1),
  packetDir: z.string().min(1),
  specHash: z.string().nullable(),
  archetype: studyArchetypeIdSchema,
  dataset: datasetAdapterIdSchema,
  expectedArtifacts: z.array(z.string()),
  requiredQaGates: z.array(z.string()),
  requiredFailurePolicies: z.array(z.string()),
  rerunStability: z.object({
    required: z.boolean(),
    maxDiffCount: z.number().int().min(0),
    maxAbsoluteNumericDiff: z.number().min(0),
  }),
  reviewerRubric: z.array(z.string()),
});
export type BenchmarkCase = z.infer<typeof benchmarkCaseSchema>;

export const benchmarkEvaluationSchema = z.object({
  schemaVersion: z.literal(1),
  benchmarkId: z.string(),
  status: z.enum(["pass", "warning", "fail"]),
  normalizedScore: z.number().min(0).max(1),
  checks: z.array(z.object({
    id: z.string(),
    status: z.enum(["pass", "warning", "fail"]),
    weight: z.number().positive(),
    detail: z.string(),
    evidenceRefs: z.array(z.string()),
  })),
  issues: z.array(machineIssueSchema),
  nextAction: z.string(),
});
export type BenchmarkEvaluation = z.infer<typeof benchmarkEvaluationSchema>;

export const machinePlanSchema = z.object({
  schemaVersion: z.literal(1),
  planId: z.string().min(1),
  question: z.string().min(1),
  dataset: datasetAdapterManifestSchema,
  archetype: studyArchetypeManifestSchema,
  backend: researchBackendManifestSchema,
  confidence: z.number().min(0).max(1),
  stopForHumanReview: z.boolean(),
  rationale: z.array(z.string()),
  commandSequence: z.array(z.string()),
  requiredArtifacts: z.array(z.string()),
  risks: z.array(machineIssueSchema),
});
export type MachinePlan = z.infer<typeof machinePlanSchema>;

export const machineStatusSchema = z.object({
  schemaVersion: z.literal(1),
  generatedAtIso: z.string(),
  tracks: z.array(z.object({
    id: z.string(),
    status: z.enum(["ready", "partial", "blocked"]),
    summary: z.string(),
  })),
  backends: z.array(researchBackendManifestSchema.extend({
    availability: z.enum(["available", "missing", "not_checked"]),
    version: z.string().nullable(),
    packages: z.record(z.string(), z.string().nullable()),
  })),
  datasets: z.array(datasetAdapterManifestSchema.extend({
    availability: z.enum(["available", "partial", "missing", "not_checked"]),
    evidence: z.array(z.string()),
  })),
  archetypes: z.array(studyArchetypeManifestSchema),
  issues: z.array(machineIssueSchema),
  nextAction: z.string(),
});
export type MachineStatus = z.infer<typeof machineStatusSchema>;
