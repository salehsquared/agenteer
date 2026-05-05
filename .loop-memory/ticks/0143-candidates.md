# Tick 0143 Candidate Moves

1. Add one more golden manifest readiness check.
2. Add another miniature golden integration test.
3. Regenerate the live golden manifest.
4. Make repair planning consume typed manifest verifier failures.
5. Add a rerun-instability fixture artifact under the golden packet.
6. Add an instability-focused design note from control systems.
7. Remove repair-plan prose actions and replace with typed action records.

Ranks 1-3 were discarded under the tail-sample protocol because they keep working inside verification rather than changing how failures drive repair.

Chosen: rank 4. It is less obvious than adding another check, but it converts typed failures into a reusable repair-planning pathway.
