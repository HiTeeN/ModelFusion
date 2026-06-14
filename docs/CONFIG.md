# Configuration Reference

Complete reference for all configuration fields, defaults, validation rules, and examples.

---

## FusionConfig

The top-level configuration object for the ModelFusion plugin. Passed as `options` to `FusionPlugin`:

```json
{
  "plugins": [
    {
      "id": "@modelfusion/plugin",
      "options": {
        "panel": {
          "models": [
            { "providerId": "openai", "modelId": "gpt-4o-mini" }
          ]
        },
        "judge": { "providerId": "openai", "modelId": "gpt-4o" },
        "triggering": "manual"
      }
    }
  ]
}
```

---

## Field Reference

### panel

Configuration for the panel of models that will analyze the prompt.

```typescript
{
  panel: {
    models: PanelModel[];   // Array of model configs
    maxModels: number;      // Maximum models to use (default: 8)
  }
}
```

| Sub-field | Type | Default | Min | Max | Description |
|---|---|---|---|---|---|
| `models` | `PanelModel[]` | (see defaults) | 1 | 8 | Models to query in parallel |
| `maxModels` | `number` | `8` | 1 | 8 | Cap on how many models to actually query |

**Validation**:
- `models` must have at least 1 entry and at most 8
- `maxModels` must be an integer between 1 and 8
- Each model must have non-empty `providerId` and `modelId`

---

### panel.models (PanelModel)

```typescript
{
  providerId: string;  // e.g., "openai", "anthropic", "google"
  modelId: string;     // e.g., "gpt-4o-mini", "claude-3-haiku"
}
```

Each entry represents one model on the panel. Models are queried in parallel during the fan-out stage.

**Validation**:
- `providerId` must be a non-empty string
- `modelId` must be a non-empty string

---

### judge

Configuration for the judge model that compares panel responses.

```typescript
{
  judge: {
    providerId: string;  // e.g., "openai"
    modelId: string;     // e.g., "gpt-4o"
  }
}
```

| Sub-field | Type | Default | Description |
|---|---|---|---|
| `providerId` | `string` | `"openai"` | Provider for the judge model |
| `modelId` | `string` | `"gpt-4o"` | Model ID for the judge |

**Validation**:
- `providerId` must be a non-empty string
- `modelId` must be a non-empty string

Note: The judge model receives panel responses and produces structured JSON analysis (consensus, contradictions, scoring, etc.). It does NOT produce the final answer — synthesis is handled by the original session model.

---

### triggering

Controls when deliberation is triggered.

```typescript
{
  triggering: "auto" | "manual" | "threshold";
  threshold?: {
    minPromptLength: number;
    keywords: string[];
  };
}
```

| Value | Behavior |
|---|---|
| `"manual"` (default) | Deliberation only happens when explicitly invoked via `/fusion` or `fusion:deliberate` tool |
| `"auto"` | Every user message triggers deliberation automatically |
| `"threshold"` | Deliberation triggers when prompt length exceeds `minPromptLength` OR prompt contains any keyword |

**Validation**:
- Must be one of: `"auto"`, `"manual"`, `"threshold"`
- Default: `"manual"`

---

### threshold

Only used when `triggering` is `"threshold"`.

```typescript
{
  threshold: {
    minPromptLength: number;  // Min character count (default: 200)
    keywords: string[];        // Trigger keywords (default: [])
  }
}
```

| Sub-field | Type | Default | Min | Description |
|---|---|---|---|---|
| `minPromptLength` | `number` | `200` | 1 | Minimum prompt character count to trigger (strict greater-than) |
| `keywords` | `string[]` | `[]` | — | Case-insensitive keyword matching |

**Threshold logic**:
```
trigger = (prompt.length > minPromptLength) OR keywords.some(kw => prompt.toLowerCase().includes(kw.toLowerCase()))
```

Note: A prompt of exactly 200 chars with default minPromptLength of 200 does NOT trigger (strict >, not >=).

---

### maxToolCalls

```typescript
{
  maxToolCalls: number;  // default: 8
}
```

Controls the maximum number of tool call iterations during deliberation.

| Type | Default | Min | Max |
|---|---|---|---|
| `number` | `8` | 1 | 16 |

Also affects `maxOutputTokens` in the `chat.params` hook when fusion is active: `maxOutputTokens = maxToolCalls * 1000`.

---

### temperature

```typescript
{
  temperature: number;  // default: 0.7
}
```

Controls the temperature for panel model responses.

| Type | Default | Min | Max |
|---|---|---|---|
| `number` | `0.7` | 0 | 2 |

Applied via the `chat.params` hook when fusion is active for the session.

---

### enabled

```typescript
{
  enabled: boolean;  // default: true
}
```

Master toggle for the plugin. When `false`:
- The `system.transform` hook does not inject the deliberation prompt
- The plugin is registered but inactive

---

## DEFAULT_FUSION_CONFIG

```typescript
{
  panel: {
    models: [
      { providerId: "openai", modelId: "gpt-4o-mini" },
      { providerId: "anthropic", modelId: "claude-3-haiku" },
      { providerId: "google", modelId: "gemini-1.5-flash" },
    ],
    maxModels: 8,
  },
  judge: {
    providerId: "openai",
    modelId: "gpt-4o",
  },
  triggering: "manual",
  maxToolCalls: 8,
  temperature: 0.7,
  enabled: true,
}
```

This is the fallback used when the provided config fails validation.

---

## Validation Rules (Zod Schema)

| Rule | Schema Constraint | Effect |
|---|---|---|
| Panel model count | `z.array(PanelModelSchema).min(1).max(8)` | Rejects empty or >8 models |
| maxModels | `z.number().int().min(1).max(8)` | Must be integer 1-8 |
| providerId/modelId | `z.string().min(1)` | Must be non-empty strings |
| triggering | `z.enum(["auto", "manual", "threshold"])` | Only valid values accepted |
| temperature | `z.number().min(0).max(2)` | Must be 0-2 |
| maxToolCalls | `z.number().int().min(1).max(16)` | Must be integer 1-16 |
| enabled | `z.boolean()` | Must be boolean |

Invalid config at plugin load time falls back to `DEFAULT_FUSION_CONFIG` with a console warning. The plugin never crashes due to bad config.

---

## Example Configurations

### Basic (2 models, manual)

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

### Full (3 models, auto with threshold)

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

### Economy (cheap models, budget)

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

See `examples/` directory for these as JSON files.

---

## TUI Config Commands

The `/fusion:config` command provides runtime configuration editing:

| Command | Description |
|---|---|
| `/fusion:config` | Show current configuration |
| `/fusion:config panel add <providerId> <modelId>` | Add a panel model |
| `/fusion:config panel remove <modelId>` | Remove a panel model |
| `/fusion:config judge <providerId> <modelId>` | Set the judge model |
| `/fusion:config mode <auto\|manual\|threshold>` | Change triggering mode |

Config is persisted to `api.kv` under the key `fusion.config`. Every change runs through `FusionConfigSchema.safeParse()` before saving, so invalid config can never be written.