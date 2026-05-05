# Tick 0066 Tail Candidates

1. Add another docs note about `recommendedCommands`.
2. Convert `recommendedCommands` into structured argv arrays.
3. Add a new `safeCommands` field and deprecate `recommendedCommands`.
4. Harden `recommendedCommands` so only single `agenteer research ...` commands without shell operators are admitted.
5. Add a security challenge fixture with adversarial packet paths.
6. Remove `recommendedCommands` until structured execution exists.
7. Add an execution-policy warning to every readiness output.

Discarded ranks 1-3 per tail-sample protocol. Picked rank 4 because it is less invasive than a schema break but directly reduces shell-chain ambiguity.
