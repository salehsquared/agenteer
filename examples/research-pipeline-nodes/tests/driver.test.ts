import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { runResearchPipelineNodeDemo } from "../driver.js";

describe("research pipeline node driver", () => {
  it("composes reusable research nodes into a complete local packet run", async () => {
    const repo = await makeRepo();
    const packetDir = await mkdtemp(path.join(os.tmpdir(), "research-node-driver-packet-"));
    const exportDir = await mkdtemp(path.join(os.tmpdir(), "research-node-driver-export-"));
    const fixturePath = path.join(packetDir, "rows.json");
    try {
      await writeFile(fixturePath, `${JSON.stringify([
        { SEQN: 1, RIDSTATR: 2, RIDAGEYR: 45, RIAGENDR: 1, RIDRETH3: 3, BPQ020: 1, BPXSY1: 142, BPXDI1: 86, WTMEC2YR: 1 },
        { SEQN: 2, RIDSTATR: 2, RIDAGEYR: 58, RIAGENDR: 2, RIDRETH3: 4, BPQ020: 2, BPXSY1: 118, BPXDI1: 72, WTMEC2YR: 1 },
      ], null, 2)}\n`);

      const result = await runResearchPipelineNodeDemo({
        project: "medbrevia-nhanes",
        repoDir: repo,
        question: "Among NHANES adults, is self-reported high blood pressure associated with measured hypertension?",
        packetDir,
        fixturePath,
        exportDir,
      });

      expect(result.stages.map(stage => `${stage.name}:${stage.verdict}`)).toEqual([
        "design:pass",
        "critique:pass",
        "scout:pass",
        "runner-spec:pass",
        "approval:pass",
        "analysis:pass",
        "report-review:pass",
        "manifest:pass",
        "export:pass",
      ]);
    } finally {
      await rm(repo, { recursive: true, force: true });
      await rm(packetDir, { recursive: true, force: true });
      await rm(exportDir, { recursive: true, force: true });
    }
  });
});

async function makeRepo(): Promise<string> {
  const repo = await mkdtemp(path.join(os.tmpdir(), "research-node-driver-repo-"));
  const registryDir = path.join(repo, "data", "analytics", "nhanes");
  await mkdir(registryDir, { recursive: true });
  await writeFile(path.join(registryDir, "registry.json"), `${JSON.stringify({
    dataset: "nhanes",
    cycles: [{ id: "2017-2018" }],
    domains: {
      demographics: {},
      blood_pressure: {},
    },
    variables: [
      { name: "RIDAGEYR", domain: "demographics", label: "Age" },
      { name: "RIAGENDR", domain: "demographics", label: "Gender" },
      { name: "RIDRETH3", domain: "demographics", label: "Race ethnicity" },
      { name: "WTMEC2YR", domain: "demographics", label: "MEC weight" },
      { name: "SDMVSTRA", domain: "demographics", label: "Strata" },
      { name: "SDMVPSU", domain: "demographics", label: "PSU" },
      { name: "BPXSY1", domain: "blood_pressure", label: "Systolic BP" },
      { name: "BPXDI1", domain: "blood_pressure", label: "Diastolic BP" },
      { name: "BPQ020", domain: "blood_pressure", label: "Ever told you had high blood pressure" },
    ],
    weightRules: [
      {
        id: "mec",
        weightVariable: "WTMEC2YR",
        strataVariable: "SDMVSTRA",
        psuVariable: "SDMVPSU",
      },
    ],
  }, null, 2)}\n`);
  return repo;
}
