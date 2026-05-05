# Tick 0154 Candidate Moves

1. Add one more paper-QA assertion.
2. Add a small manifest-verifier unit test.
3. Regenerate the golden repair plan after every manifest change.
4. Add a repeat-verification receipt for the live golden packet.
5. Create a deliberately broken shadow manifest and store its failure.
6. Add an adversarial "reviewer asks only one question" note.
7. Build a tiny packet diff receipt against the previous golden state.

Ranks 1-3 were discarded because they extend already-covered code paths. Rank 4 was chosen because it makes verifier determinism itself inspectable in the live packet without a new command.
