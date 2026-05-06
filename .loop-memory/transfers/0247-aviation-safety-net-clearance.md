# Tick 0247 Transfer - Aviation Safety Net Clearance

## Open Question

How should exploration output prevent unadjusted correlations from being promoted too casually?

## Fields Searched

- Astronomy / observational science
- Cryptography
- Air traffic control

## Techniques Considered

- Astronomy source-catalog vetting: detection is separated from confirmation.
- Certificate Transparency: claims are logged and verifiable by audit proof rather than trusted as bare assertions. Source: https://developer.mozilla.org/en-US/docs/Web/Security/Defenses/Certificate_Transparency
- Autonomous Runway Incursion Warning System / runway status lights: independent surveillance produces red-light safety warnings that indicate unsafe entry/crossing. Source: https://skybrary.aero/articles/autonomous-runway-incursion-warning-system-ariws

## Chosen Transfer

Use aviation safety-net clearance. An exploration packet should not only list alerts; it should produce a clearance state:

- `clear_for_handoff`
- `hold_for_methods_review`
- `stop`

## Structural Mapping

- Runway conflict warning -> exploration burden warning.
- Red light -> `hold_for_methods_review` or `stop`.
- Clearance to cross/enter -> `clear_for_handoff`.
- Independent safety net -> deterministic promotion gate separate from ranked associations.

## Architecture Change

Add `explorationBurden.promotionClearance` and a QA check that reflects its level.

## Smallest Trial

The golden exploration packet now emits `promotionClearance=hold_for_methods_review` because all candidate questions need methods review and near-perfect target associations raise proxy/leakage risk.

## Status

Implemented in Tick 0247. Future exploration-to-modeling handoff should consume this field directly.
