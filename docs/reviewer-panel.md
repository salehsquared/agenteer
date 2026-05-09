# External Reviewer Panel

Agenteer can run a cold external review gate over a research packet. This is different from deterministic QA: `study-critic` assembles a bounded review packet, sends it to configured LLM reviewers, adjudicates their findings, and writes state-reentry artifacts that tell the runner where to resume.

## Provider Defaults

| Provider | Default model | Env var |
|---|---|---|
| OpenAI | `gpt-5.4` | `OPENAI_API_KEY` |
| Anthropic | `claude-opus-4-7` | `ANTHROPIC_API_KEY` |
| Google Gemini | `gemini-3.1-pro` | `GOOGLE_API_KEY` or `GEMINI_API_KEY` |
| DeepSeek | `deepseek-v4-pro` | `DEEPSEEK_API_KEY` |
| xAI | `grok-4` | `XAI_API_KEY` |

xAI is treated as its own OpenAI-compatible provider. It is not a universal router for OpenAI, Anthropic, Gemini, or DeepSeek.

Reviewer commands read normal environment variables. They also accept `--env-file <path>` or `AGENTEER_ENV_FILE=<path>` for local key files. The file is parsed as simple `KEY=value` lines; secret values are not printed in provider-status output.

## Panels

- `default`: Anthropic Opus 4.7 plus DeepSeek v4 Pro.
- `cheap`: DeepSeek plus xAI.
- `strict`: Anthropic, OpenAI, and Gemini.
- `all`: Anthropic, DeepSeek, OpenAI, Gemini, and xAI.

You can override the panel:

```bash
agenteer research study-critic \
  --run-dir ./run \
  --stage final \
  --env-file /Users/saleh/env_file \
  --reviewer anthropic:claude-opus-4-7 \
  --reviewer deepseek:deepseek-v4-pro \
  --autonomy aggressive
```

## Outputs

`study-critic` writes:

- `review-packet.json`: artifacts and bounded prompt context sent to reviewers.
- `review-redaction-report.json`: included/skipped artifacts and privacy settings.
- `model-review-*.json`: each successful reviewer result.
- `review-panel.json`: all reviewer outcomes, including failed or skipped calls.
- `review-adjudication.json`: accepted/rejected findings, consensus, and reentry point.
- `review-response.json`: runner decisions for each accepted finding.
- `state-reentry.json`: suggested next commands and whether to rerun review after repair.

Reviewer calls are allowed to fail. Missing API keys, no credits, rate limits, and provider errors are recorded as failed reviewer results; the panel continues with available reviewers.

## Autonomy

- `aggressive`: accept actionable findings and route directly back into the pipeline unless cost/privacy limits block.
- `balanced`: auto-accept reporting, figure, reproducibility, and literature fixes; method/cohort/design issues are modified or require review.
- `conservative`: major and blocker findings require human review.

## Cost

Defaults:

- per reviewer call: `$0.50`
- per panel: `$2.00`
- full study loop: `$5.00`

Override with `--max-per-call-usd`, `--max-panel-usd`, and `--max-study-loop-usd`.

## Review Stages

Use `--stage` to run reviewer gates at different points:

- `protocol`
- `analysis_spec`
- `feasibility`
- `method`
- `execution`
- `manuscript`
- `final`

The reviewer output includes a recommended state reentry point such as `protocol`, `analysis_spec`, `method_selection`, `execution`, `qa`, `manuscript`, `literature`, or `human_review`.
