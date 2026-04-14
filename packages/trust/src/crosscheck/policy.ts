/**
 * CrossCheckPolicy — sub-plan 04 §4.3.
 *
 * `max_retries` is intentionally absent from the engine policy — the
 * meta-node (stdlib, M4) owns retry via `ReplaceMe`. The engine runs one
 * pass of primary + secondary (or primary + fallback-primary).
 */

export interface CrossCheckPolicy {
  enabled: boolean;
  on_missing_secondary:
    | "warn_fallback_primary_second_pass"
    | "warn_skip"
    | "error";
  on_disagreement:
    | "fail"
    | "return_primary_with_warning"
    | "return_disagreement_for_meta";
  parallel: boolean;
  fallback_prompt_variant: boolean;
  fallback_temperature_delta: number;
}

export const DEFAULT_POLICY: CrossCheckPolicy = {
  enabled: true,
  on_missing_secondary: "warn_fallback_primary_second_pass",
  on_disagreement: "return_disagreement_for_meta",
  parallel: true,
  fallback_prompt_variant: true,
  fallback_temperature_delta: 0.3,
};
