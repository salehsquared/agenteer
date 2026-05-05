# Tick 0077 Tail-Sample Candidates

Axis: tail-sample

Default-ranked plausible moves:

1. Continue polishing packet-readiness wording.
2. Add one more packet-readiness test for recommended command filtering.
3. Update docs with another primary/review command example.
4. Locate and document MedBrevia's actual NHANES data substrate under read-only constraints.
5. Run one Agenteer-adjacent real NHANES cohort scout using MedBrevia cached Parquet without GCP spend.
6. Add first-class Parquet ingestion support to Agenteer's local scout.
7. Design a bounded real-data packet fixture format that references external read-only Parquet without copying PHI-like large data.

Tail choice: rank 5.

Reason: the loop has been over-optimizing CLI packet semantics against fixtures. The user explicitly asked to move to actual NHANES data, and a real scout is the smallest move that changes the loop's evidence base without writing to MedBrevia or spending cloud budget.
