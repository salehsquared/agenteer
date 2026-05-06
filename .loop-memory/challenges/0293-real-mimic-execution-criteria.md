# Tick 0293 Challenge - Real MIMIC Execution Criteria

The previous 30-tick MIMIC run produced a useful verified study-design atlas, but it did not satisfy the user's intended meaning of "complete ticks." A tick that only writes a candidate design, even with ICD verification, does not prove that Agenteer or the research pipeline can execute, inspect, QA, and learn from MIMIC data.

## Failure Attribution

- **Framework issue:** The loop memory allowed design artifacts to count like executed research work.
- **Research-pipeline issue:** The MIMIC path had no bounded per-study execution runner with row-level cache cleanup, per-run cost receipts, model output, and paper QA.
- **Operator issue:** The final summary overstated a design queue as if it were comparable to executed analysis ticks.

## Stricter Completion Rule For This Run

A MIMIC tick counts only if it produces at least one of:

- a real bounded MIMIC execution with copied/read table evidence, aggregate outputs, `paper.md`, `qa.json`, `cost-receipt.json`, critique, and cache cleanup;
- a real verification/runner improvement that is immediately used by later execution ticks;
- a challenge/audit tick that inspects executed artifacts and changes the next execution decision.

The run must stop before cumulative estimated cost exceeds `$1.00`.

## Required Evidence

Each execution tick must record:

- selected study/stress case;
- input tables and copied bytes;
- cumulative cost;
- cohort size and matched ICD evidence;
- model status or justified refusal;
- QA status;
- critique/failure attribution;
- rejected counter-design;
- next action.

## Promotion Boundary

Executed MIMIC papers are local review artifacts, not clinical claims. Diagnosis-code phenotypes require clinical/coding review before publication-quality use.
