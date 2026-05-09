# Challenge 0365: Local Connector Safety

The local MedBrevia connector uses development-friendly authentication and localhost assumptions. That is acceptable for local dogfooding, but it must not be confused with production auth. Agenteer should keep the key explicit, local, documented, and easy to override. Production use needs a real token exchange or service identity approved in MedBrevia.

The current source-quality scoring is also only a triage heuristic. It should not be described as risk-of-bias appraisal or evidence certainty.
