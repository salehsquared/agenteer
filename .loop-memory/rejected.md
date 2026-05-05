# Rejected Counter-Designs

## Tick 001

Rejected: build a new "run all research stages" command immediately.

Reason: the current stage-based workflow is intentional because the agent is supposed to act as human-in-the-loop between design, validation, scout, approval, analysis, and export. A hidden all-in-one command would be faster superficially but would blur the review boundaries that make the research packet trustworthy.

## Tick 002

Rejected: overwrite `nextCommand` with the first missing gate command.

Reason: `nextCommand` still describes the nominal stage transition, while `recommendedCommands` can represent gate-aware repair steps. Keeping both avoids breaking existing consumers and makes the distinction explicit.

## Tick 003

Rejected: remove the `research stages` alias entirely.

Reason: the alias may already be used in local notes or scripts. Hiding it from docs/help reduces visible surface area without creating unnecessary breakage.

## Tick 004

Rejected: make `packet-summary` the only navigator command.

Reason: `packet-summary` is broader lifecycle state. The common human-paced action is narrower: "what is the next safe command?" A small `next` primitive keeps that path short while leaving full summaries intact.

## Tick 005

Rejected: make `research next` execute the first safe command automatically.

Reason: execution would collapse the human-paced loop. The better design is a richer clearance object: what to run, why, and what artifact proves it worked.

## Tick 006

Rejected: add expected artifacts directly to `ResearchCheckpoint`.

Reason: `checkpoint` is the state engine; `next` is the human-facing navigation projection. Keeping the richer clearance language in `next` reduces drift while avoiding extra checkpoint payload churn.

## Tick 007

Rejected: export a new public stage metadata API immediately.

Reason: the expected-artifact registry is useful internally, but exposing it now would create compatibility expectations before the stage model is stable.

## Tick 008

Rejected: treat a present artifact as sufficient proof of correctness.

Reason: presence only proves the artifact exists. Correctness still belongs to validation, critique, review, and manifest checks.

## Tick 009

Rejected: force `report.md` into the stage metadata registry as `report-review`.

Reason: analysis generates `report.md`; report review generates `report-review.json`. Collapsing them would make the packet lifecycle less explicit.

## Tick 010

Rejected: make `research next` trace writing the default.

Reason: navigation should remain read-only unless the user explicitly opts into packet mutation with `--trace`.

## Tick 011

Rejected: split `next` into separate `next`, `next-evidence`, and `next-trace` commands now.

Reason: the current CLI should stay learnable while the navigation contract stabilizes.

## Tick 012

Rejected: add artifact hashes to `research next` trace records.

Reason: hashes belong to manifest/provenance stages. `next` should identify navigation decisions, not become artifact validation.

## Tick 013

Rejected: add a separate trace-summary command this tick.

Reason: a one-line renderer improvement addressed the immediate usability gap without expanding the CLI surface.

## Tick 014

Rejected: change blocked navigation to always return zero.

Reason: default nonzero exits still protect scripts from accidentally continuing past a blocked gate.

## Tick 015

Rejected: delete `checkpoint` and force consumers through `next`.

Reason: `checkpoint` is the stable state primitive; `next` is a higher-level clearance projection.

## Tick 016

Rejected: add navigation trace data to `packet-summary`.

Reason: trace inspection is useful, but packet summary should not grow every side-channel artifact by default.

## Tick 017

Rejected: immediately replace `navigation-trace` with a generic `research events` command.

Reason: there is currently only one event type written by this path, so a generic event reader would imply an architecture that does not exist yet.

## Tick 018

Rejected: generalize `navigation-trace` into a full event-log validator.

Reason: only navigation events are currently written through this path. General event validation should wait until multiple event-producing stages exist.

## Tick 019

Rejected: hide malformed-line and event-type details after adding `status`.

Reason: the status is the fast read; detailed counts remain necessary for debugging and scripts.

## Tick 020

Rejected: Ed25519 signatures or external timestamp anchoring now.

Reason: local SHA-256 chaining is enough for the current dogfood loop. Signatures and anchoring belong in a later provenance/security layer.

## Tick 021

Rejected: immediately move the hash-chain helper into a shared provenance module.

Reason: shared provenance utilities should be designed around at least two event types. Extracting now would make navigation assumptions look generic.

## Tick 022

Rejected: add `approval-trace.jsonl`.

Reason: approval already writes a durable packet artifact. Making that artifact event-shaped is simpler than adding another side-channel trace file.

## Tick 023

Rejected: immediately add chain fields to `approval.json`.

Reason: approval is a standalone durable artifact. Chaining standalone packet artifacts belongs in manifest/provenance design.

## Tick 024

Rejected: introduce a public `ResearchEvent` union type now.

Reason: the shared behavior is hashing, not lifecycle management. A union type can wait until there are more event-shaped artifacts.

## Tick 025

Rejected: adopt an external event schema wholesale right now.

Reason: the project needs a small local pattern first. External schema alignment should happen after the packet has enough real event types to map.

## Tick 026

Rejected: wait for a broader packet event verifier before checking approval hashes.

Reason: approval already has a hash, so leaving it unverifiable would make the integrity field decorative.

## Tick 027

Rejected: add approval verification into `checkpoint`.

Reason: checkpoint answers workflow position, not artifact integrity.

## Tick 028

Rejected: add new packet-level validation rules inside `packet-verify`.

Reason: this tick was only allowed to aggregate existing verifiers. New integrity rules need their own focused tick.

## Tick 029

Rejected: rename `packet-verify` to `integrity-verify`.

Reason: the future direction is packet verification. The current problem is scope clarity.

## Tick 030

Rejected: broaden `packet-verify` into methods, report, and manifest validation this tick.

Reason: scope metadata should land before broadening, so future additions are explicit and reviewable.

## Tick 031

Rejected: add a separate "Integrity CLI" documentation section now.

Reason: the command list is enough while the integrity surface is still small.

## Tick 032

Rejected: change `agenteer research --help` behavior in this tick.

Reason: the existing CLI help model is top-level usage text. Subcommand-scoped help is a separate ergonomics improvement.

## Tick 033

Rejected: implement `agenteer research --help` now by printing the same global usage.

Reason: that would be a shallow alias, not real scoped help.

## Tick 034

Rejected: make `manifest-verify` regenerate the manifest automatically.

Reason: verification should compare current files to the recorded manifest. Regeneration would hide drift instead of reporting it.

## Tick 035

Rejected: add methods/report/claim checks to `packet-verify` immediately.

Reason: that would mix artifact integrity with scientific validity before the verifier contract is clear.

## Tick 036

Rejected: rename `pass` to `integrity_pass` throughout the API.

Reason: `mode`, `scope`, and `summary` now disambiguate the status without awkward status strings.

## Tick 0182

Rejected: add calibration as only prose in generated paper QA.

Reason: calibration is a model artifact, not just a reporting phrase. Binary probabilistic ML runs should produce machine-readable calibration evidence so papers, benchmarks, and future decision-curve checks can inspect the same object.

## Tick 0183

Rejected: keep `method-select` and `modeling-plan` as separate, unlinked front doors.

Reason: `modeling-plan` already calls method selection internally. Exposing the selection id/hash and recommended backend makes the artifact auditable and reduces duplicate operator decisions.

## Tick 0184

Rejected: add more method-catalog breadth before execution support.

Reason: the catalog already names many methods. The immediate research-platform gap was runnable estimates, diagnostics, and artifact provenance for standard table statistics.

## Tick 0185

Rejected: treat documentation warnings as sufficient protection for `stats-run`.

Reason: survey misuse, sparse cells, overdispersion, and separation are predictable failure modes. They need typed diagnostics or refusal paths, not only prose.

## Tick 0186

Rejected: treat `--survey` as a harmless annotation in `stats-run`.

Reason: survey design changes variance and interpretation. A standard runner should refuse by default or require an explicit exploratory approximation flag.

## Tick 0187

Rejected: make users infer executable runners from method names.

Reason: a modeling candidate that is executable should name the runner and artifacts directly; otherwise planning remains a descriptive catalog rather than an operational decision.

## Tick 0188

Rejected: treat stats-run provenance as only file hashes.

Reason: for research execution, the selected method id and AnalysisSpec hash are also provenance boundaries. A run can be perfectly hashed and still be the wrong method.

## Tick 0189

Rejected: leave the method-to-stats-run mapping duplicated in modeling and binding code.

Reason: duplicated mappings would eventually disagree, causing the planner to recommend one executable path while binding validation enforces another.

## Tick 0190

Rejected: declare the stats path paper-ready from command-level tests alone.

Reason: paper-grade reliability needs packet lifecycle evidence that consumes stats binding and typed issues.

## Tick 0191

Rejected: answer analysis surface sprawl by adding another broad runner.

Reason: the current problem is route ambiguity among existing planning and runner commands, not missing surface area.

## Tick 0192

Rejected: add a separate `analysis-route` command immediately.

Reason: `modeling-plan` already owns the decision context; routing belongs inside that artifact before creating another command.

## Tick 037

## Tick 048

Rejected: fold research readiness into `packet-verify`.

Reason: `packet-verify` answers available file-integrity questions. A readiness command needs to include workflow, methods, report, claims, provenance, and export review without implying scientific validity.

## Tick 049

Rejected: implement a full STROBE checklist scorer now.

Reason: STROBE itself warns against using its checklist as a study-quality instrument. The safer first step is source-grounded limitations and references inside readiness output.

## Tick 050

Rejected: implement decision posture inside the challenge tick.

Reason: challenge ticks should produce critique first. The next standard tick should respond with code if the critique survives inspection.

## Tick 051

Rejected: add a separate `research clinician-readiness` command.

Reason: the clinician-facing posture is a projection of packet readiness. A separate command would duplicate state and make the readiness surface harder to learn.

## Tick 052

Rejected: add a normalized mutable stage manifest immediately.

Reason: stage artifact metadata should be inspectable before it becomes another source of packet state. The revived command is read-only and low risk.

## Tick 053

Rejected: add another readiness component before addressing drift.

Reason: more checks would increase the number of projection paths. Reliability now depends on shared mapping or drift tests.

## Tick 054

Rejected: refactor QA and readiness into a shared adapter immediately.

Reason: the new cross-projection drift test is a smaller safety net and reduces risk before moving component construction.

## Tick 055

Rejected: add `research status` immediately.

Reason: the current problem is command-surface clarity. Adding an umbrella command before clarifying docs/help could compound the naming burden.

## Tick 056

Rejected: add subcommand-scoped help or a new umbrella command now.

Reason: the smallest response to command-surface growth is documentation grouping. Behavior changes can follow if users still cannot find the primary path.

## Tick 057

Rejected: add an interactive read-back/confirmation step to readiness.

Reason: explicit stop reasons carry the useful safety signal while keeping the command deterministic and scriptable.

## Tick 058

Rejected: leave repair actions only in prose.

Reason: downstream agents and scripts need a stable field for actionable commands; parsing `nextAction` would be brittle.

## Tick 059

Rejected: add another readiness field during the challenge.

Reason: contributors first need a stable-vs-human field contract; more fields would worsen the uncertainty.

## Tick 060

Rejected: add review-policy identifiers during the challenge tick.

Reason: readiness contract documentation should come first so policy identifiers have a clear place in the schema.

## Tick 061

Rejected: add `contractVersion` to readiness immediately.

Reason: `schemaVersion: 1` already wraps the JSON output. Documentation resolves the current ambiguity without another field.

## Tick 062

Rejected: make export automatically generate packet readiness.

Reason: export should preserve existing review artifacts, not introduce a fresh recomputation that can alter packet state at packaging time.

## Tick 063

Rejected: add artifact category metadata immediately.

Reason: duplicated artifact names are the current drift risk; deriving the allowlist should come before richer metadata.

## Tick 064

Rejected: export the extras list as public API.

Reason: artifact extras are internal until Agenteer has a richer artifact taxonomy and consumer contract.

## Tick 065

Rejected: convert `recommendedCommands` to structured argv inside the challenge tick.

Reason: the security critique should be recorded first; the next implementation can harden the field deliberately.

## Tick 066

Rejected: convert `recommendedCommands` to structured argv arrays immediately.

Reason: structured argv is likely better long-term, but a non-breaking single-command filter reduces shell risk now.

## Tick 067

Rejected: remove the export component from readiness entirely.

Reason: export still matters for share posture; it should not block internal review posture.

## Tick 068

Rejected: require checkpoint `complete` for review readiness.

Reason: `complete` includes export packaging; human scientific review should be possible before sharing/export completion.

## Tick 069

Rejected: keep the resolved review/share posture question in `open-questions.md`.

Reason: the implementation and tick files preserve history; open questions should remain actionable.

## Tick 070

Rejected: implement readiness profiles during the challenge tick.

Reason: the immediate need is to constrain language and make the current observational/survey default explicit.

## Tick 071

Rejected: implement full readiness profile selection now.

Reason: the first safe step is naming the implicit default profile; selection can wait for a second domain.

## Tick 072

Rejected: implement profile selection or a registry now.

Reason: a named default profile captures the current boundary without inventing unused selection machinery.

## Tick 073

Rejected: export the default readiness profile constant.

Reason: exporting it would imply a public profile registry before profile selection exists.

## Tick 074

Rejected: test only the JSON profile field.

Reason: the human renderer is part of the CLI contract for reviewers and should show the profile too.

## Tick 075

Rejected: encode statistical adequacy into readiness profile naming.

Reason: statistical adequacy belongs in methods validation and explicit review artifacts, not in a profile id.

## Tick 076

Rejected: add a separate top-level warning block for profile interpretation.

Reason: the caveat belongs immediately next to the profile id, where readers interpret the profile.

Rejected: force navigation trace creation through `commandForResearchStage`.

Reason: `next --trace --exit-zero-on-blocked` is a navigation/audit action, not a pipeline stage command.

## Tick 038

Rejected: change manifest verifier messaging this tick.

Reason: the current drift messages are already specific enough for the common changed-artifact case.

## Tick 039

Rejected: describe manifest entries as event records.

Reason: a manifest entry is an integrity statement about an artifact, not a decision event.

## Tick 040

Rejected: block `research export` on `packet-verify` immediately.

Reason: export behavior changes are higher impact. Readiness should be observable before it becomes enforced.

## Tick 041

Rejected: replace `exportIntegrityReady` with a multi-level export readiness enum now.

Reason: the current field is specifically about integrity readiness, not full export readiness.

## Tick 042

Rejected: make `exportIntegrityReason` a structured object immediately.

Reason: the verifier already exposes the full manifest verification object. The reason string is for quick human interpretation.

## Tick 043

Rejected: remove `scope` from human `packet-verify` output.

Reason: scope prevents users from treating available integrity verification as full research validity.

## Tick 044

Rejected: include fixture analysis/report generation in the integrity smoke path.

Reason: this tick is about integrity verification, not full research execution.

## Tick 045

Rejected: fold all verification into `packet-verify` immediately.

Reason: integrity verification and research validity are different layers. They should stay explicit and then be composed.

## Tick 046

Rejected: rename or migrate existing historical `tick-NNN.md` files into 4-digit filenames.

Reason: preserving history avoids churn and keeps prior references stable. Future ticks can use the dual-tick `NNNN.md` convention.

## Tick 0047

Rejected: implement `packet-readiness` during the challenge tick.

Reason: challenge ticks should critique direction first; the next standard tick should respond by incorporating, disputing, or deferring the critique.

## Tick 077

Rejected: immediately downloading fresh NHANES data from GCS.

Reason: the local MedBrevia cache already contains the curated release needed for this tick, so cloud spend would not improve evidence quality.

## Tick 078

Rejected: adding pandas/pyarrow as mandatory Agenteer CLI dependencies.

Reason: Parquet support should be available for real-data research workflows, but generic agent orchestration should not require every installation to carry a data-science runtime.

## Tick 079

Rejected: keeping Parquet support isolated to `table-summary`.

Reason: inspection alone still forces manual conversion before variable mapping. Reusing table summaries in `suggest-variable-map` is a smaller and more useful workflow simplification.

## Tick 080

Rejected: implementing runtime provenance during the challenge tick.

Reason: the challenge protocol should surface the critique first. The next standard tick should respond with the smallest correction.

## Tick 081

Rejected: recording only Python package versions as provenance.

Reason: package versions explain runtime behavior, but file hash and mtime are needed to detect data drift.

## Tick 082

Rejected: automatically writing a `table-summary.json` sidecar from `suggest-variable-map`.

Reason: suggestion commands should remain read-only unless explicitly asked to persist mappings or artifacts.

## Tick 083

Rejected: adding Parquet support to `semantic-quality` next.

Reason: expanding more commands onto the Python bridge before consolidating packet-level real-data evidence would increase choreography.

## Tick 084

Rejected: inventing an Agenteer-only provenance vocabulary immediately.

Reason: W3C PROV and RO-Crate already provide the relevant conceptual split; Agenteer should use a plain, small schema that can map to those standards later.

## Tick 085

Rejected: making enriched `data-access.json` purely machine/provenance oriented.

Reason: the research pipeline has a human-in-the-loop reviewer, so real-data evidence must summarize clinical/research implications as well as hashes and runtime details.

## Tick 086

Rejected: adding a separate `real-data-adapter.json` command immediately.

Reason: enriched `data-access.json` handles the current entity/activity/agent evidence need with less CLI choreography.

## Tick 087

Rejected: treating bare `data-access.json` existence as enough real-study readiness progress.

Reason: a file list without table-summary provenance does not prove that real data were readable, stable, or usable.

## Tick 088

Rejected: building another single-file diabetes-only packet.

Reason: NHANES real-data readiness needs demographics and survey design variables, so the useful stressor is a two-domain packet.

## Tick 089

Rejected: silently removing the fixture-runner readiness check.

Reason: fixture execution remains useful for synthetic pipeline testing; it should become advisory, not disappear.

## Tick 090

Rejected: stripping absolute paths from internal data-access artifacts immediately.

Reason: local reruns need exact paths. Redaction should happen at export/share boundaries or be represented as a separate display/source reference.

## Tick 091

Rejected: treating absolute local paths as harmless because NHANES is public-use.

Reason: public data can still be referenced through local paths that disclose user/environment details and reduce export portability.

## Tick 092

Rejected: adding a bespoke readiness status like `ready_but_missing_fixture_runner`.

Reason: blocking/advisory requirement semantics are more general and handle future nonblocking checks without multiplying status values.

## Tick 093

Rejected: adding a separate `path-redaction-check` command.

Reason: local path leakage changes packet share posture, so the warning belongs in packet readiness.
# Tick 0094

- Rejected mutating `data-access.json` in place for share safety. Internal local reruns need absolute paths, so redaction should be an explicit derived artifact.

# Tick 0095

- Rejected treating a clean standalone `data-access-redacted.json` as archive-sufficient. Export wiring and derivation evidence are required before it is trustworthy for sharing.

# Tick 0096

- Rejected adding a full PROV graph to redacted data-access in this tick. A source manifest hash is the smallest useful derivation proof before export wiring.

# Tick 0097

- Rejected a standalone `data-access-redaction-verify` command for now. Packet readiness already owns the share/export posture, so freshness belongs there first.

# Tick 0098

- Rejected switching `research export` to a full BagIt package immediately. Borrow relative-path checksums and local-path scanning first; full archive format can wait.

# Tick 0099

- Rejected rewriting export copy/substitution policy without first adding a measurable export receipt. The current export path couples copied artifacts and manifests, so direct rewriting would be too easy to make silently inconsistent.

# Tick 0100

- Rejected spending many more consecutive ticks on archive packaging. Finish the minimum export receipt/local-path scan, then return to actual-data research execution and quality pressure.

# Tick 0101

- Rejected excluding all path-bearing artifacts from the export scan just to make the receipt pass. The current failure is useful evidence for the next fix.

# Tick 0102

- Rejected making "green export scan" the goal by itself. The goal is a principled local/share boundary that preserves local rerunability and safe sharing.

# Tick 0103

- Rejected sanitizing every path-bearing artifact in one sweep. Data-access substitution is the smallest safe export policy change; remaining leaks should stay measurable.

# Tick 0104

- Rejected using another diabetes/HbA1c packet as the second actual-data stress test. A vitamin-D/blood-pressure packet exercises different NHANES domains and endpoint variables.

# Tick 0105

- Rejected treating `ready_for_local_real_data` as sufficient for study generation. It proves local inputs can be attempted, not that the merged analytic cohort is usable.

# Tick 0106

- Rejected jumping directly from file readiness to association modeling. A merged cohort-feasibility artifact is the safer next pre-analysis gate.

# Tick 0107

- Rejected generating paper prose first and retrofitting QA afterward. The QA contract should shape paper generation from the start.

# Tick 0108

- Rejected labeling the vitamin-D/BP paper as publication-grade. The analysis is useful dogfood evidence but still approximate because full NHANES complex survey variance is not implemented.

# Tick 0109

- Rejected keeping paper QA as one-off Python. Multiple papers need a shared deterministic QA gate.

# Tick 0110

- Rejected another hypertension-style binary-outcome paper as Paper 2. The next paper should stress continuous endpoints and different domains.

# Tick 0111

- Rejected triglycerides as the main endpoint for Paper 2 because the current lipids summary showed high missingness and likely fasting/subsample complexity.

# Tick 0112

- Rejected another generic lipid or hypertension paper as Paper 3. Kidney albuminuria/UACR creates a more useful measurement-threshold stress test.

# Tick 0113

- Rejected eGFR as the main kidney endpoint for this tick. UACR was directly present and better matched the threshold-provenance stress test.

# Tick 0114

- Rejected a separate kidney-paper validator. Threshold provenance and diagnostic-overclaim risks are reusable across many medical paper types, so they belong in `research paper-qa`.

# Tick 0115

- Rejected treating a perfect deterministic reporting QA score as scientific adequacy. Model-family and evidence/prose consistency need their own checks.

# Tick 0116

- Rejected waiting for a full formal statistical schema before improving QA. Existing `analysis.json` model fields are sufficient for a useful first model-aware gate.

# Tick 0117

- Rejected generating another paper before numeric result verification. More artifacts are less useful if stale Results prose can still pass QA.

# Tick 0118

- Rejected exact string matching for statistics. Generated papers round values, so numeric tolerance is the right contract.

# Tick 0119

- Rejected another minor variation on HbA1c as a pure lab-outcome paper. The stronger next stress test is health-access exposure plus glycemic outcome and diagnosis-threshold caveats.

# Tick 0120

- Rejected framing insurance/HbA1c as diabetes-care quality without first defining a diagnosed-diabetes cohort. In all adults, it is a descriptive glycemic-measurement association.

# Tick 0121

- Rejected starting Paper 4 with a diagnosed-diabetes-only cohort. The all-adult paper better tests target-population and overclaiming discipline.

# Tick 0122

- Rejected banning causal trigger words in all contexts. Papers need to state causal limits, so negated causal statements should pass while unsupported causal claims fail.

# Tick 0123

- Rejected deleting older QA files to reduce clutter. QA history is useful progression evidence, so a corpus index is safer than cleanup by deletion.

# Tick 0124

- Rejected leaving paper indexing as an ad hoc Python script. Repeated lookup friction should become a CLI primitive.

# Tick 0125

- Rejected generating another one-off paper before addressing runner provenance. Output diversity is useful, but repeatability is now the reliability bottleneck.

# Tick 0126

- Rejected waiting for a full RO-Crate exporter before recording paper-run provenance. A compact runner record is useful now and can map to RO-Crate later.

# Tick 0127

- Rejected a separate runner-status index. Paper corpus inspection should have one index surface.

# Tick 0128

- Rejected dismissing the runner-record backfill failure as only a script bug. It exposed real looseness in paper evidence schemas.

# Tick 0129

- Rejected making all four generated papers co-equal golden packets. One packet should become fully executable and rerunnable before broadening.

# Tick 0130

- Rejected treating a retrospective AnalysisSpec as proof of spec-first execution. It must govern a future rerun.

# Tick 0131

- Rejected rerunning the model before source-table validation. Spec-first execution needs a preflight gate for required variables and survey fields.

# Tick 0132

- Rejected adding a separate golden-source validator CLI. Existing `cohort-scout-file` should be the pre-execution gate that learns these failures.

# Tick 0133

- Rejected relying on paper QA as rerun evidence. QA does not prove spec-governed regeneration.

# Tick 0134

- Rejected treating the paper directory as a sufficient manifest. The packet needs explicit hashes and readiness checks.

# Tick 0135

- Rejected accepting `golden-manifest.json` readiness at face value. The manifest needs independent verification.

# Tick 0136

- Rejected adding a separate `golden-manifest-verify` command. Existing `manifest-verify` should verify artifact manifests across packet types.

# Tick 0137

- Rejected treating valid local hashes as share-safe evidence. Local review and portable export have separate contracts.

# Tick 0138

- Rejected a single overloaded golden `status` field. Local review and share/export readiness should be separate.

# Tick 0139

- Rejected adding a separate readiness verifier for local/share status. Manifest verification should own this.

# Tick 0140

- Rejected growing a separate `golden-*` command namespace. Golden readiness should compose existing primitives.

# Tick 0141

- Rejected adding a golden command namespace. The test path composes existing primitives instead.

# Tick 0142

- Rejected adding a new repair classifier command. Manifest verification already observes the relevant reproducibility failures, so it should emit typed records directly.

# Tick 0143

- Rejected leaving repair-plan as a separate freeform issue detector. Typed verifier failures should flow into repair planning directly.

# Tick 0144

- Rejected leaving stale golden-packet candidate wording until a future generator exists. Local-review artifacts must describe their current evidence state accurately.

# Tick 0145

- Rejected treating approximate-variance caveats as sufficient because they exist in prose. Methodological limits need machine-checkable policy.

# Tick 0146

- Rejected keeping inference policy only in report text. Machine-readable policy is required for QA, runner, and repair decisions.

# Tick 0147

- Rejected citing survey-design sources only in loop memory. The golden packet README is part of local review evidence and needs the source-backed methods boundary.

# Tick 0148

- Rejected treating all repair-plan issues as one queue. Methodological blockers must stop executable repair rather than become generic patch tasks.

# Tick 0149

- Rejected assuming unit-test coverage is enough for maturity-mode dogfooding. The canonical packet should exercise the same path.

# Tick 0150

- Rejected assuming dense technical artifacts are enough for clinical review. The packet needs a short first-read interpretation boundary.

# Tick 0151

- Rejected adding a new summary command before proving the artifact shape. A manifest-tracked note is simpler and directly reviewable.

# Tick 0152

- Rejected relying on manifest byte hashes alone. Byte hashes prove artifact integrity, but not that the runner receipt belongs to the current AnalysisSpec.

# Tick 0153

- Rejected leaving repair posture implicit because the current packet has no repair issues. No-issue status is still review evidence.

# Tick 0154

- Rejected treating verifier determinism as obvious. The live packet should carry receipts for important reproducibility claims.

# Tick 0155

- Rejected relying on manifest `shareStatus` alone. Verification output should itself separate local validity from share/export validity.

# Tick 0156

- Rejected adding a standalone share-safety command now. The local/share distinction belongs in manifest verification output first.

# Tick 0157

- Rejected continuing with hand-written runner records for each paper. It made actual-paper runs harder to compare and prevented runner provenance from becoming part of the CLI contract.

# Tick 0158

- Rejected editing the generated runner JSON by hand so `paper-index` would recognize it. The right fix is for Agenteer to understand the envelope its own CLI emits.

# Tick 0159

- Rejected forcing new runner records to use the old raw JSON shape. The CLI envelope is useful for schema versioning, so consumers should normalize it.

# Tick 0161

- Rejected hiding retrospective AnalysisSpec binding inside a generic successful runner status. Retrospective provenance is useful, but it should not look like spec-governed execution.

# Tick 0162

- Rejected removing capability requirements from the task just to make validation pass. The validation failure is useful because it shows the interop layer needs real capability declarations.

# Tick 0163

- Rejected adding a generic wildcard research capability. Separate paper-generation, QA, and runner-provenance capabilities expose different permissions, outputs, and failure types.

# Tick 0164

- Rejected weakening or bypassing paper QA after the PIR/HDL paper failed. The right fix was to tighten an overbroad threshold heuristic and rerun the same gate.

# Tick 0166

- Rejected adding another index-only field as the answer to artifact sprawl. A dedicated lifecycle summary gives reviewers a compact state view without overloading the paper corpus index.

# Tick 0167

- Rejected claiming R `survey` support because R is not installed locally. Implemented a transparent local strata/PSU linearized variance runner instead and recorded its current scope.
- Rejected keeping the AnalysisSpec-to-paper path as a recipe of manual commands. The new `paper-run` command exists so future development has a single golden path to harden.

# Tick 0168

- Rejected treating binary outcomes as unsupported after the linear runner landed. Logistic models use the same score-aggregation structure, so adding a bounded survey-logistic path was a better maturity move.
- Rejected weakening paper QA when `linearized` triggered the linear-model family check. The right fix was to make logistic model detection take precedence over the word `linearized`.
- Tick 169 rejected weakening the survey-logistic QA fixture to satisfy the old checker. The failure identified real checker mistakes, so the implementation was corrected instead.
- Tick 171 rejected treating subsample weights as ordinary weight variables. Subsample weights now require explicit rationale/eligibility notes before execution.
- Tick 172 rejected bespoke manual Python for the fasting-glucose paper; the paper was generated through `research paper-run` so the platform, not the operator, carried the work.
- Tick 174 rejected lifecycle-only safety boundaries; generated papers now include a first-read local-review safety header because interpretation risk starts in the Markdown.
- Tick 176 rejected raw Markdown/file-byte repeatability as the primary check; scientific-field stability is the useful archive primitive.
- Tick 177 rejected a separate `paper-archive-status` command; rerun stability now surfaces through the existing lifecycle status surface.
# Tick 178

- Rejected putting model choice directly inside `ml-compare`. Model choice must cover statistical inference, survey design, causal/survival stop rules, and policy artifacts before sklearn comparison starts.

# Tick 179

- Rejected adding more adapters before fixing model-selection quality. Selection needs actual table/spec evidence before adapter breadth.

# Tick 180

- Rejected treating the expanded command list as self-documenting. New contributors need encoded golden-path sequence, not just many commands.

# Tick 181

- Rejected requiring manual `--small-sample`, `--high-missingness`, and `--feature-count` flags when a table file or table-summary artifact is available.

# Tick 193

- Rejected adding a separate `research stats-lifecycle` command. It would make the command maze worse. The existing lifecycle summary should absorb stats-run evidence when a packet carries it.

# Tick 194

- Rejected making `modeling-plan` probe local backends automatically on every run. Accepting a `machine-status` artifact keeps planning deterministic and lets callers decide when runtime probing is worth the cost/noise.

# Tick 195

- Rejected expanding the stats method list during a challenge tick. The immediate weakness is not method breadth; it is that stats execution still lacks a complete packet-grade artifact path.

# Tick 196

- Rejected adding a separate `research stats-report` command. Report and QA artifacts should be emitted during stats execution so they are hashed against the exact runner result.

# Tick 197

- Rejected expanding into survival, causal ML, or advanced modeling families before standard stats/ML outputs have explicit run-level interpretation posture.

# Tick 198

- Rejected making posture a Markdown-only report section. The next planner/lifecycle gates need typed machine-readable posture, not prose that downstream code has to parse.

# Tick 199

- Rejected adding a new `ml-lifecycle` command. The simpler move was to make the existing `ml-run` artifact self-describing enough for current and future lifecycle surfaces.

# Tick 200

- Rejected treating stats/ML posture as complete just because it is typed and tested. Posture must feed planning gates; otherwise it remains a polished label.

# Tick 201

- Rejected adding a separate prior-run review command. The existing analysis front door, `modeling-plan`, should absorb prior execution evidence and decide the next route.

# Tick 202

- Rejected expanding `paper-lifecycle` to pretend every stats/ML run is a paper. A compact analysis-run manifest is the smaller primitive for non-paper routes.

# Tick 203

- Rejected calling the new manifest sufficient without a route smoke. Provenance primitives need at least one saved golden route showing how they compose.

# Tick 204

- Rejected a fully autonomous all-method runner. First principles favor one bounded, inspectable stats route before allowing the command to pick arbitrary modeling families.

# Tick 205

- Rejected removing `analysis-run` after the critique. The command is useful, but it needs strict binding support rather than deletion.

# Tick 206

- Rejected making `--require-bound` a documentation-only convention. Strict mode must fail before execution when no method-selection or AnalysisSpec evidence is supplied.

# Tick 207

- Rejected treating exploratory manifest completion as enough for benchmark success. Artifact completeness and local-review readiness are separate gates.

# Tick 208

- Rejected reviving a separate `ml-lifecycle` command. The useful part of that rejected idea is stricter ML readiness, which belongs in `analysis-manifest`.

# Tick 209

- Rejected treating a ranked ML table as enough. A safety-case-shaped comparison must state whether baseline comparison evidence is actually ready.

# Tick 210

- Rejected adding more estimators before model-card-style review evidence exists for prediction comparisons.

# Tick 211

- Rejected creating a separate `ml-review-card` command. The faster, safer path is for every `ml-compare` run to emit review-card evidence by default.

# Tick 212

- Rejected calling ML review-card support complete without a saved route fixture. Future benchmark work needs durable artifacts to inspect.

# Tick 213

- Rejected adding a separate ML comparison manifest command. The existing `analysis-manifest` should absorb comparison readiness instead of fragmenting the surface.

# Tick 214

- Rejected writing benchmark checks as ad hoc loop-memory scripts. A reusable CLI benchmark gate keeps golden route pressure available outside this tick history.
# Tick 0215

- Rejected counting the ML comparison golden route alone as benchmark maturity; standard-table stats and ML prediction fail through different readiness mechanisms and need a suite-level gate.

# Tick 0216

- Rejected regenerating the old exploratory stats route in place. Keeping the old route visible preserves the failure contrast; the new route proves the corrected bound path.

# Tick 0217

- Rejected making `analysis-benchmark` fail every single-route suite by default. Narrow suite coverage should be visible as a warning/posture first so existing focused tests and one-route workflows remain usable.

# Tick 0218

- Rejected silently upgrading the default benchmark semantics to require route diversity. A narrow single-route benchmark is still useful for development; promotion scripts should opt into `--require-multi-route`.

# Tick 0219

- Rejected deleting the old exploratory 0203 stats route. Preserving it as superseded keeps a useful regression contrast for readiness gating.

# Tick 0220

- Rejected forcing paper-run directories into `analysis-benchmark`; paper lifecycle has richer task/rerun semantics and needs a composed summary, not flattening.

# Tick 0221

- Rejected rerunning the expensive survey paper just to refresh a health note; the existing machine benchmark and lifecycle artifacts are sufficient for this tick's proof.

# Tick 0222

- Rejected adding another regression-style paper idea. Diagnostic accuracy has a different artifact shape and better exposes whether the pipeline can handle non-regression clinical methods.
# Tick 0223

- Rejected implementing diagnostic accuracy only inside generated paper code. The reusable primitive belongs in `stats-run` so method binding, QA, manifests, and benchmark gates can all see it.

# Tick 0224

- Rejected keeping diagnostic semantics implicit in the runner output only. Planning artifacts must carry the diagnostic study shape before execution.

# Tick 0225

- Rejected treating correct diagnostic metric arithmetic as sufficient. Diagnostic reports need their own claim firewall.

# Tick 0226

- Rejected a generic caution-only diagnostic report. The report now carries method-specific role, prevalence, precision, and screening-claim safeguards.

# Tick 0227

- Rejected a second pre-thresholded synthetic diagnostic paper. The next diagnostic paper must pressure a harder real-world study shape.

# Tick 0228

- Rejected bootstrap intervals as the first diagnostic precision method. Wilson intervals are deterministic and easier to keep stable in golden-route tests.

# Tick 0229

- Rejected automatic optimal cutoff search. Explicit thresholds are auditable; cutoff search needs validation policy before promotion.

# Tick 0230

- Rejected jumping to a UI or broad new paper subsystem before a narrow diagnostic stats-run-to-paper packet bridge exists.

# Tick 0231

- Rejected adding a separate diagnostic-paper command. The bounded `analysis-run` route can generate the narrow diagnostic paper packet without expanding CLI surface.

# Tick 0232

- Rejected making diagnostic papers required for all stats manifests. Optional visibility gives inspection value without blocking ordinary standard-table routes.

# Tick 0233

- Rejected treating a green research-ML suite as diagnostic track completion. It proves regression health, not actual-data scientific maturity.

# Tick 0234

- Rejected adding a new rerun-stability CLI command before proving the route-specific receipt is useful.
