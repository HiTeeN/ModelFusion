# ModelFusion -- Multi-Model Deliberation Plugin for OpenCode

ModelFusion brings structured debate to AI conversations. Instead of trusting a single model for important decisions, it runs a panel of models on your question, compares their answers, and produces a synthesized response with attribution.

Think of it as a discussion roundtable for your prompts. Each model on the panel gives its take, a judge evaluates the responses, and a synthesizer produces the final output.

## How It Works

When you trigger a deliberation (either manually or automatically), here's what happens under the hood:

```
  Your Question
       |
       v
  +------------------+
  |   Panel Models   |  (2-8 models, queried in parallel)
  |  [Model A]       |
  |  [Model B]       |  Each model generates its own response
  |  [Model C]       |
  +------------------+
       |  |  |
       v  v  v
  +------------------+
  |   Judge Model    |  Evaluates all responses, picks the best ones
  +------------------+
       |
       v
  +------------------+
  |  Synthesizer     |  Blends top responses into a final answer
  +------------------+
       |
       v
  Final Response (with attributions)
```

Each step streams back to the chat, so you see the deliberation unfold in real time. Panel models run in parallel, so latency stays close to the slowest single model call.

## Installation

1. Add the package to your OpenCode project:

```bash
bun add @modelfusion/plugin
```

2. Register the plugin in your `opencode.json`:

```json
{
  "plugins": ["@modelfusion/plugin"]
}
```

3. Restart OpenCode. The `/fusion` command should now be available in the TUI, and the `fusion:deliberate` tool will be registered with the server plugin.

### Server Plugin

The server plugin (`@modelfusion/plugin/server`) registers the deliberation tool and lifecycle hooks. You can pass config options when creating the plugin:

```json
{
  "plugins": [
    {
      "id": "@modelfusion/plugin",
      "options": {
        "panel": {
          "models": [
            { "providerId": "openai", "modelId": "gpt-4o-mini" },
            { "providerId": "anthropic", "modelId": "claude-3-haiku" }
          ]
        },
        "judge": { "providerId": "openai", "modelId": "gpt-4o" },
        "triggering": "manual"
      }
    }
  ]
}
```

### TUI Plugin

The TUI plugin (`@modelfusion/plugin/tui`) is loaded automatically alongside the server plugin. It registers the `/fusion` slash command and `/deliberate` and `/panel` aliases. No additional config needed.

## Configuration Reference

All config is validated against `FusionConfigSchema` (Zod) at plugin load time. Invalid values fall back to defaults with a console warning.

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `panel.models` | `PanelModel[]` | 3 default models | Array of model configs (1-8). Each has `providerId` and `modelId`. |
| `panel.maxModels` | `number` (1-8) | `8` | Max models to query per deliberation. |
| `judge.providerId` | `string` | `"openai"` | Provider for the judge model. |
| `judge.modelId` | `string` | `"gpt-4o"` | Model ID for the judge. |
| `triggering` | `"auto"` \| `"manual"` \| `"threshold"` | `"manual"` | How deliberation gets triggered. |
| `threshold.minPromptLength` | `number` | `200` | Min character count to auto-trigger (threshold mode). |
| `threshold.keywords` | `string[]` | `[]` | Keywords that trigger deliberation (threshold mode). |
| `maxToolCalls` | `number` (1-16) | `8` | Max tool call iterations during deliberation. |
| `temperature` | `number` (0-2) | `0.7` | Temperature for panel model responses. |
| `enabled` | `boolean` | `true` | Master toggle for the plugin. |

### PanelModel

```typescript
{
  providerId: string;  // e.g., "openai", "anthropic", "google"
  modelId: string;     // e.g., "gpt-4o-mini", "claude-3-haiku"
}
```

## Usage

### Triggering Modes

ModelFusion supports three triggering modes controlled by the `triggering` config field.

#### Manual Mode (default)

Deliberation only happens when you explicitly ask for it. This is the simplest and most predictable mode -- no surprises, no extra cost.

**TUI:** Type `/fusion` followed by your question:
```
/fusion What are the tradeoffs between SQL and NoSQL databases?
```

**Chat:** Use the `fusion:deliberate` tool directly. The tool accepts no extra arguments -- it deliberates on the current conversation context.

#### Auto Mode

Every message you send goes through deliberation automatically. Best for high-stakes conversations where you want the best possible answer every time. Has the highest cost and latency.

#### Threshold Mode

Deliberation triggers when certain conditions are met:
- Your prompt exceeds `minPromptLength` characters (default: 200)
- Your prompt contains any keyword from the `threshold.keywords` list

This gives you a middle ground -- automatic for complex questions, skip for quick ones.

```json
{
  "triggering": "threshold",
  "threshold": {
    "minPromptLength": 200,
    "keywords": ["compare", "debate", "analyze", "decide", "choose", "pros", "cons"]
  }
}
```

### What You See

During a deliberation, you'll see progress updates in the chat:

```
[Model A] Considering your question from a performance perspective...
[Model B] Let me approach this from the developer experience angle...
[Model C] I'll focus on the scalability aspects...

[Judge] Evaluating 3 responses...

[Synthesizer] After consulting the panel, here's a balanced view...
```

If a model's response is low quality, the judge rejects it and flags the issue. At least 2 valid responses must pass the judge for a synthesis to happen.

## Examples

Full configuration examples are in the `examples/` directory:

- **basic-config.json** -- Two models, manual mode. Good starting point.
- **full-config.json** -- Three models, auto mode with threshold keywords. For power users.
- **budget-config.json** -- Cheap models only, economy judge. Minimum cost.

### Minimal Setup

```json
{
  "panel": {
    "models": [
      { "providerId": "openai", "modelId": "gpt-4o-mini" },
      { "providerId": "anthropic", "modelId": "claude-3-haiku" }
    ],
    "maxModels": 2
  },
  "judge": { "providerId": "openai", "modelId": "gpt-4o" },
  "triggering": "manual"
}
```

### Auto Mode With Threshold

```json
{
  "panel": {
    "models": [
      { "providerId": "openai", "modelId": "gpt-4o-mini" },
      { "providerId": "anthropic", "modelId": "claude-3-haiku" },
      { "providerId": "google", "modelId": "gemini-1.5-flash" }
    ]
  },
  "judge": { "providerId": "openai", "modelId": "gpt-4o" },
  "triggering": "auto",
  "threshold": {
    "minPromptLength": 200,
    "keywords": ["compare", "debate", "analyze"]
  },
  "maxToolCalls": 12,
  "temperature": 0.8
}
```

### Economy Setup

```json
{
  "panel": {
    "models": [
      { "providerId": "openai", "modelId": "gpt-4o-mini" },
      { "providerId": "google", "modelId": "gemini-1.5-flash" },
      { "providerId": "openai", "modelId": "gpt-4o-mini" }
    ],
    "maxModels": 3
  },
  "judge": { "providerId": "openai", "modelId": "gpt-4o-mini" },
  "triggering": "manual",
  "maxToolCalls": 4,
  "temperature": 0.5
}
```

## Documentation

For detailed reference material, see the `docs/` directory:

| Document | Description |
|---|---|
| [ARCHITECTURE.md](docs/ARCHITECTURE.md) | Component tree, data flow, hook wiring, pipeline stages, degradation paths, state management |
| [API.md](docs/API.md) | Complete API reference with signatures, types, examples |
| [CONFIG.md](docs/CONFIG.md) | Configuration reference with schema, validation rules, example configs |
| [CONTRIBUTING.md](docs/CONTRIBUTING.md) | Development guide, setup, build, test, code patterns, gotchas |
| [TESTING.md](docs/TESTING.md) | Test strategy, GIVEN/WHEN/THEN patterns, mock isolation rules |
| [ROADMAP.md](docs/ROADMAP.md) | v1.0 through v2.0 plans with rationale |
| [GLOSSARY.md](docs/GLOSSARY.md) | Terminology: panel, judge, synthesizer, degradation, recursion guard, etc. |

## Cost

ModelFusion adds extra API calls per deliberation. Here's what to expect.

**Per deliberation (manual mode):**
- `N` panel model calls (one per panel member)
- 1 judge call
- 1 synthesis call
- Optional tool calls (up to `maxToolCalls`)

With 3 panel models, that's at least 5 model calls per deliberation before any tool use.

**Cost saving tips:**
- Use `manual` mode so deliberation only runs when you ask
- Put cheaper models on the panel (gpt-4o-mini, claude-3-haiku, gemini-1.5-flash)
- Use a cheap model for the judge too (e.g., gpt-4o-mini can judge just fine)
- Keep `maxToolCalls` low if your panelists don't need many tools
- Use `threshold` mode with conservative keyword settings

## Limitations (v1)

This is version 0.1.0. Here's what's in scope and what's not.

**In scope:**
- Manual, auto, and threshold triggering modes
- Up to 8 panel models
- Judge-based evaluation and rejection
- Synthesized final responses with attributions
- `maxToolCalls` and `temperature` controls
- Recursion guard (prevents fusion-from-fusion loops)
- Cost tracking per session
- Provider routing via OpenCode's built-in provider system

**Not in scope (v1):**
- Custom judge prompts or evaluation rubrics
- Persisting deliberation history across sessions
- Model degradation recovery (planned)
- Web search augmentation
- Code merge workflows
- Custom synthesizer prompts
- Multi-turn panel discussions (panel runs once per trigger)
- Parallel judge evaluation