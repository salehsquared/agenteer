research paper lifecycle: 0158-bmi-hba1c
  title: Body mass index and HbA1c in NHANES adults
  status: needs_methods_review
  qa: pass (28/28 paper QA checks passed.)
  runner: retrospective_succeeded binding=retrospective warnings=RETROSPECTIVE_ANALYSIS_SPEC_BINDING
  task: succeeded validation=pass receipts=pass,pass,warning
  capabilities: pass count=3
  - blocker: AnalysisSpec binding is retrospective, not spec-governed
  next: Do not present as spec-governed; create a pre-run AnalysisSpec for the next execution.