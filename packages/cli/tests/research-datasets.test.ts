import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  renderDatasetManifest,
  renderDatasetProfile,
  renderDatasetQuestions,
  renderDatasetRegistration,
  researchDatasetDescribeCommand,
  researchDatasetInspectCommand,
  researchDatasetProfileCommand,
  researchDatasetQuestionsCommand,
  researchDatasetRegisterCommand,
  researchDatasetRelationshipsCommand,
} from "../src/research-machine/datasets.js";

describe("dataset intelligence layer", () => {
  it("registers a local tabular dataset with canonical artifacts, watchouts, relationships, and question seeds", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "agenteer-dataset-register-"));
    try {
      const source = path.join(dir, "source");
      const out = path.join(dir, "datasets");
      await mkdir(source);
      await writeFile(path.join(source, "patients.csv"), [
        "subject_id,age,bmi,mortality_event,sex,empty_col,weight",
        "1,45,27.5,0,F,,1.2",
        "2,66,31.2,1,M,,0.8",
        "3,72,120,1,F,,1.1",
        "4,,24.1,0,M,,1.0",
      ].join("\n"));
      await writeFile(path.join(source, "labs.csv"), [
        "subject_id,glucose_result,hba1c_pct,charttime",
        "1,90,5.4,2024-01-01",
        "2,210,8.2,2024-01-02",
        "3,180,7.9,2024-01-03",
        "4,,6.1,2024-01-04",
      ].join("\n"));

      const result = await researchDatasetRegisterCommand({
        datasetId: "Local ICU Fixture",
        source,
        outDir: out,
        title: "Local ICU Fixture",
        domain: "ehr",
      });
      const manifest = await researchDatasetInspectCommand({ datasetDir: result.rootDir });
      const profile = await researchDatasetProfileCommand({ datasetDir: result.rootDir });
      const relationships = await researchDatasetRelationshipsCommand({ datasetDir: result.rootDir });
      const questions = await researchDatasetQuestionsCommand({ datasetDir: result.rootDir });
      const summary = await researchDatasetDescribeCommand({ datasetDir: result.rootDir });

      expect(result.generatedFiles.map(file => path.basename(file))).toEqual(expect.arrayContaining([
        "dataset-manifest.json",
        "variable-registry.json",
        "relationship-graph.json",
        "data-profile.json",
        "watchouts.json",
        "question-seeds.json",
        "dataset-summary.md",
        "DATASET_CONTEXT.md",
      ]));
      expect(manifest.source.kind).toBe("local-directory");
      expect(manifest.storage.tableCount).toBe(2);
      expect(profile.aggregate.profiledTableCount).toBe(2);
      expect(profile.aggregate.semanticWatchoutCount).toBeGreaterThan(0);
      expect(profile.watchouts.map(issue => issue.code)).toEqual(expect.arrayContaining(["SEMANTIC_BMI_RANGE", "EMPTY_VARIABLE"]));
      expect(relationships.edges.some(edge => edge.keys.includes("subject_id"))).toBe(true);
      expect(questions.seeds.length).toBeGreaterThan(0);
      expect(summary).toContain("Standard Files For Agents");
      expect(summary).toContain("Things To Watch Out For");
      expect(renderDatasetRegistration(result)).toContain("dataset registered");
      expect(renderDatasetManifest(manifest)).toContain("Local ICU Fixture");
      expect(renderDatasetProfile(profile)).toContain("semantic watchouts");
      expect(renderDatasetQuestions(questions)).toContain("dataset questions");

      const context = await readFile(path.join(result.rootDir, "DATASET_CONTEXT.md"), "utf-8");
      expect(context).toContain("Read this file before planning");
      expect(context).toContain("Variable registry:");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("registers an export manifest as metadata-only and preserves cost/table inventory for large cloud datasets", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "agenteer-dataset-manifest-"));
    try {
      const manifestPath = path.join(dir, "export-manifest.json");
      await writeFile(manifestPath, `${JSON.stringify({
        source: { mimicVersion: "3.1" },
        destination: { rootUri: "gs://example/mimiciv/v3.1/" },
        tables: [
          { dataset: "hosp", table: "patients", destinationPrefix: "gs://example/mimiciv/v3.1/hosp/patients/", bigqueryRows: 100, bigquerySchemaFields: 6, gcsExportedBytes: 2048 },
          { dataset: "icu", table: "icustays", destinationPrefix: "gs://example/mimiciv/v3.1/icu/icustays/", bigqueryRows: 50, bigquerySchemaFields: 8, gcsExportedBytes: 4096 },
        ],
      }, null, 2)}\n`);

      const result = await researchDatasetRegisterCommand({
        datasetId: "mimic-test",
        fromManifest: manifestPath,
        outDir: path.join(dir, "datasets"),
        domain: "ehr",
      });

      expect(result.manifest.source.kind).toBe("manifest");
      expect(result.manifest.source.uri).toBe("gs://example/mimiciv/v3.1/");
      expect(result.manifest.storage.tableCount).toBe(2);
      expect(result.manifest.storage.rowCountTotalKnown).toBe(150);
      expect(result.profile.tableProfiles.every(table => table.profileStatus === "metadata_only")).toBe(true);
      expect(result.profile.watchouts.map(issue => issue.code)).toContain("MANIFEST_METADATA_ONLY");
      expect(result.manifest.access.piiPhiRisk).toBe("high");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
