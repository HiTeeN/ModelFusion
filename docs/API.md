# API Reference

Complete reference for all exports from the ModelFusion plugin. The plugin is split into two entry points: server plugin (for deliberation logic) and TUI plugin (for terminal UI commands).

---

## Server Plugin Exports

### FusionPlugin

The main plugin export for the OpenCode server runtime.

```typescript
import { FusionPlugin } from "@modelfusion/plugin/server";
```

The module also exposes:

```typescript
import pluginModule, { server } from "@modelfusion/plugin/server";
// pluginModule = { server }
```

OpenCode loads the server entrypoint through the default module shape `{ server }`.

**Type**: `Plugin` (from `@opencode-ai/plugin`)

**Signature**:
```typescript
const FusionPlugin: Plugin = async (
  ctx: PluginContext,
  options?: Partial<FusionConfig>,
) => Hooks;
```

**Parameters**:
- `ctx` — Plugin context provided by the OpenCode runtime. Contains `client` for session/API interaction.
- `options` — Partial `FusionConfig` override. Invalid values fall back to `DEFAULT_FUSION_CONFIG` with a console warning.

**Returns**: A `Hooks` object with 8 hook keys:
- `chat.message`
- `chat.params`
- `experimental.chat.messages.transform`
- `experimental.chat.system.transform`
- `tool`
- `tool.execute.before`
- `tool.execute.after`
- `event`

**Example**:
```typescript
const plugin = await FusionPlugin(ctx, {
  panel: {
    models: [
      { providerId: "openai", modelId: "gpt-4o-mini" },
      { providerId: "anthropic", modelId: "claude-3-haiku" },
    ],
  },
  judge: { providerId: "openai", modelId: "gpt-4o" },
  triggering: "manual",
});
```

---

## TUI Plugin Exports

### FusionTuiPlugin

The TUI plugin export for the OpenCode terminal UI.

```typescript
import { FusionTuiPlugin } from "@modelfusion/plugin/tui";
```

The module also exposes:

```typescript
import pluginModule, { tui } from "@modelfusion/plugin/tui";
// pluginModule = { tui }
```

OpenCode loads the TUI entrypoint through the default module shape `{ tui }`.

**Type**: `TuiPlugin` (from `@opencode-ai/plugin/tui`)

**Signature**:
```typescript
const FusionTuiPlugin: TuiPlugin = async (
  api: TuiPluginApi,
  _options?: PluginOptions,
  _meta?: TuiPluginMeta,
) => Promise<void>;
```

**Parameters**:
- `api` — TUI plugin API for registering commands via `api.keymap.registerLayer`, UI elements, and lifecycle hooks.
- `_options` — Plugin options (currently unused, but required by type).
- `_meta` — Plugin metadata from the runtime (package info, version, etc.).

**Returns**: `Promise<void>` (registers `/fusion` and `/fusion:config`, stores plugin state in `api.kv`, and wires lifecycle handlers via `api.keymap.registerLayer`).

**Example**:
```typescript
import { FusionTuiPlugin } from "@modelfusion/plugin/tui";

const tuiPlugin = await FusionTuiPlugin(api);
```

### `/fusion` Manual Trigger Path

`createFusionCommand()` sends the user question through:

```typescript
await api.client.session.prompt({
  sessionID,
  variant: "fusion:manual",
  parts: [{ type: "text", text: question }],
});
```

The server `chat.message` hook treats `variant === "fusion:manual"` as an explicit signal to run `runFusionPipeline(...)` even when `triggering` is configured as `"manual"`.

---

## Core Engine Exports

### runFusionPipeline

Orchestrates the full fusion pipeline: validate → fan-out → judge → synthesize.

```typescript
import { runFusionPipeline } from "@modelfusion/plugin/server";
// or
import { runFusionPipeline } from "./pipeline";
```

**Type**:
```typescript
async function runFusionPipeline(
  client: PipelineClient,
  sessionID: string,
  prompt: string,
  config: FusionConfig,
  originalModel: OriginalModel,
  recursionGuard: RecursionGuard,
): Promise<FusionResult>;
```

**Parameters**:
| Param | Type | Description |
|---|---|---|
| `client` | `PipelineClient` | Session client with `session.prompt({ sessionID, model, parts })` method |
| `sessionID` | `string` | Current session identifier |
| `prompt` | `string` | The user's question or prompt |
| `config` | `FusionConfig` | Plugin configuration |
| `originalModel` | `OriginalModel` | The session's model (used for synthesis) |
| `recursionGuard` | `RecursionGuard` | Prevents nested fusion calls |

**Returns**: `FusionResult` with status, analysis, responses, cost.

---

### fanOut

Dispatches a prompt to all panel models in parallel.

```typescript
import { fanOut } from "@modelfusion/plugin/server";
// or
import { fanOut } from "./orchestrator";
```

**Signature**:
```typescript
async function fanOut(
  client: OrchestratorClient,
  sessionID: string,
  prompt: string,
  models: PanelModel[],
  config: FusionConfig,
  options?: FanOutOptions,
): Promise<PanelResult[]>;
```

**Parameters**:
| Param | Type | Default | Description |
|---|---|---|---|
| `client` | `OrchestratorClient` | — | Session client with `session.prompt({ sessionID, model, parts })` |
| `sessionID` | `string` | — | Current session |
| `prompt` | `string` | — | Verbatim prompt (no modifications) |
| `models` | `PanelModel[]` | — | Array of models to query |
| `config` | `FusionConfig` | — | Plugin config (for temperature, etc.) |
| `options.timeoutMs` | `number` | `120000` | Per-call timeout in ms |
| `options.retries` | `number` | `1` | Retry attempts per call |

**Returns**: `PanelResult[]` — one entry per model, with `error` field on failures.

---

### runJudge

Calls the judge model to compare panel responses using structured JSON output.

```typescript
import { runJudge } from "@modelfusion/plugin/server";
// or
import { runJudge } from "./judge";
```

**Signature**:
```typescript
async function runJudge(
  client: JudgeClient,
  sessionID: string,
  panelResults: PanelResult[],
  config: FusionConfig,
): Promise<JudgeOutput | null>;
```

**Parameters**:
| Param | Type | Description |
|---|---|---|
| `client` | `JudgeClient` | Session client with `session.prompt({ sessionID, model, parts, format })` |
| `sessionID` | `string` | Current session |
| `panelResults` | `PanelResult[]` | All panelist responses (success + failure) |
| `config` | `FusionConfig` | Plugin config (for judge model selection) |

**Returns**: `JudgeOutput | null` — `null` on any failure (invalid JSON, empty response, API error).

---

### synthesize

Produces a final answer from the judge's structured analysis and panel responses.

```typescript
import { synthesize } from "@modelfusion/plugin/server";
// or
import { synthesize } from "./synthesizer";
```

**Signature**:
```typescript
async function synthesize(
  client: SynthesizerClient,
  sessionID: string,
  judgeOutput: JudgeOutput,
  panelResults: PanelResult[],
  config: FusionConfig,
  originalModel: OriginalModel,
): Promise<string>;
```

**Parameters**:
| Param | Type | Description |
|---|---|---|
| `client` | `SynthesizerClient` | Session client with `session.prompt({ sessionID, model, parts })` |
| `sessionID` | `string` | Current session |
| `judgeOutput` | `JudgeOutput` | Structured analysis from judge |
| `panelResults` | `PanelResult[]` | Original panel responses |
| `config` | `FusionConfig` | Plugin config (for temperature) |
| `originalModel` | `OriginalModel` | The session's model (NOT the judge model) |

**Returns**: `string` — the synthesized final answer.

---

## Utility Exports

### CostTracker

Tracks token counts and estimates costs across pipeline stages.

```typescript
import { CostTracker } from "@modelfusion/plugin/server";
// or
import { CostTracker } from "./cost-tracker";
```

**Constructor**: `new CostTracker(tier?: CostTier)` — default tier is `"standard"`

**Methods**:

| Method | Signature | Description |
|---|---|---|
| `trackPanelist` | `(modelId: string, promptTokens: number, completionTokens: number) => void` | Record panelist token usage |
| `trackJudge` | `(promptTokens: number, completionTokens: number) => void` | Record judge token usage |
| `trackSynthesis` | `(promptTokens: number, completionTokens: number) => void` | Record synthesis token usage |
| `getSummary` | `() => CostSummary` | Get accumulated costs |

**CostTier**: `"budget" | "standard" | "premium"`

**CostSummary**:
```typescript
{
  perModel: Record<string, { prompt: number; completion: number; estimatedCost: number }>;
  judge: { prompt: number; completion: number; estimatedCost: number };
  synthesis: { prompt: number; completion: number; estimatedCost: number };
  totals: { prompt: number; completion: number };
  estimatedCost: number;
}
```

---

### RecursionGuard

Prevents nested/recursive fusion calls within a session.

```typescript
import { RecursionGuard } from "@modelfusion/plugin/server";
// or
import { RecursionGuard } from "./recursion-guard";
```

**Constructor**: `new RecursionGuard()`

**Methods**:

| Method | Signature | Returns | Description |
|---|---|---|---|
| `isFusionActive` | `(sessionID: string) => boolean` | `boolean` | Check if session has active fusion |
| `markFusionActive` | `(sessionID: string) => boolean` | `boolean` | Mark active (false if already active) |
| `markFusionComplete` | `(sessionID: string) => void` | — | Clear active flag |
| `getDepth` | `(sessionID: string) => number` | `number` | 1 if active, 0 if not |

---

### discoverAvailableModels

Discovers all available models from the OpenCode provider system.

```typescript
import { discoverAvailableModels } from "@modelfusion/plugin/server";
// or
import { discoverAvailableModels } from "./providers";
```

**Signature**:
```typescript
async function discoverAvailableModels(
  client: ProviderClient,
): Promise<AvailableModel[]>;
```

**AvailableModel**: `{ providerId: string; modelId: string }`

---

### validatePanelModels

Checks which configured panel models are available vs unavailable.

```typescript
import { validatePanelModels } from "@modelfusion/plugin/server";
// or
import { validatePanelModels } from "./providers";
```

**Signature**:
```typescript
function validatePanelModels(
  available: AvailableModel[],
  configured: PanelModel[],
): { valid: PanelModel[]; invalid: PanelModel[] };
```

---

### resolveModel

Normalizes provider/model IDs to OpenCode's expected format.

```typescript
import { resolveModel } from "@modelfusion/plugin/server";
// or
import { resolveModel } from "./providers";
```

**Signature**:
```typescript
function resolveModel(
  providerId: string,
  modelId: string,
): { providerID: string; modelID: string };
```

Note: capital-D keys (`providerID`, `modelID`) — OpenCode SDK convention.

---

## Hook Factory Exports

### createChatMessageHook

Creates the `chat.message` hook that intercepts user messages to trigger fusion.

```typescript
import { createChatMessageHook } from "./hooks/chat-message";
```

**Signature**:
```typescript
function createChatMessageHook(
  pluginState: ChatMessagePluginState,
): (input: ChatMessageInput, output: ChatMessageOutput) => Promise<void>;
```

**ChatMessagePluginState**: `{ config: FusionConfig, recursionGuard: RecursionGuard, pipeline: typeof runFusionPipeline, client: PipelineClient }`

**ChatMessageInput**:
```typescript
{
  sessionID: string;
  agent?: string;
  model?: { providerID: string; modelID: string };
  messageID?: string;
  variant?: string;
}
```

**ChatMessageOutput**:
```typescript
{
  message: UserMessage;
  parts: Part[];
}
```

---

### createChatParamsHook

Creates the `chat.params` hook that adjusts LLM params when fusion is active.

```typescript
import { createChatParamsHook } from "./hooks/chat-params";
```

**Signature**:
```typescript
function createChatParamsHook(
  pluginState: ChatParamsPluginState,
): (input: ChatParamsInput, output: ChatParamsOutput) => Promise<void>;
```

**ChatParamsPluginState**: `{ config: FusionConfig, recursionGuard: RecursionGuard }`

**ChatParamsInput**:
```typescript
{
  sessionID: string;
  agent: string;
  model: Model;
  provider: ProviderContext;
  message: UserMessage;
}
```

**ChatParamsOutput**:
```typescript
{
  temperature: number;
  topP: number;
  topK: number;
  maxOutputTokens: number | undefined;
  options: Record<string, unknown>;
}
```

**Behavior**: Sets `temperature` and `maxOutputTokens` when fusion is active. `maxOutputTokens` = `config.maxToolCalls * 1000`.

---

### createMessagesTransformHook

Creates the `experimental.chat.messages.transform` hook that injects fusion results into message history.

```typescript
import { createMessagesTransformHook } from "./hooks/messages-transform";
```

**Signature**:
```typescript
function createMessagesTransformHook(
  pluginState: MessagesTransformPluginState,
): (input: {}, output: { messages: Array<{ info: Message; parts: Part[] }> }) => Promise<void>;
```

**MessagesTransformPluginState**: `{ fusionResult?: FusionResult }`

---

### createSystemTransformHook

Creates the `experimental.chat.system.transform` hook that injects a deliberation system prompt.

```typescript
import { createSystemTransformHook } from "./hooks/system-transform";
```

**Signature**:
```typescript
function createSystemTransformHook(
  pluginState: { config: FusionConfig },
): (input: { sessionID?: string; model: Model }, output: { system: string[] }) => Promise<void>;
```

**Deliberation Prompt**:
```
You have access to a multi-model deliberation tool (fusion:deliberate). For complex questions, invoke it to get consensus, contradictions, unique insights, and blind spots from a panel of models. Use the analysis to write a better final answer with attribution.
```

---

### createFusionTool

Creates the `fusion:deliberate` tool definition using the `tool()` API from `@opencode-ai/plugin/tool`.

```typescript
import { createFusionTool } from "./hooks/tool-registration";
```

**Signature**:
```typescript
function createFusionTool(deps: {
  pipelineFn: typeof runFusionPipeline;
  client: PipelineClient;
  config: FusionConfig;
  recursionGuard: RecursionGuard;
  originalModel: OriginalModel;
}): ToolDefinition;
```

**ToolDefinition** (from `tool()`):
```typescript
import { tool } from "@opencode-ai/plugin/tool";

tool({
  description: "...",
  args: {
    prompt: tool.schema.string().describe("..."),
  },
  async execute(args, context) {
    const { prompt } = args;
    // ... pipeline call
    return JSON.stringify(result);
  },
});
```

---

### createToolExecuteBeforeHook

Creates the `tool.execute.before` hook that validates fusion tool args and enforces recursion guard.

```typescript
import { createToolExecuteBeforeHook } from "./hooks/tool-execute";
```

**Signature**:
```typescript
function createToolExecuteBeforeHook(
  pluginState: ToolExecutePluginState,
): (input: ToolExecuteBeforeInput, output: ToolExecuteBeforeOutput) => Promise<void>;
```

---

### createToolExecuteAfterHook

Creates the `tool.execute.after` hook that formats fusion results with analysis, cost, and degradation.

```typescript
import { createToolExecuteAfterHook } from "./hooks/tool-execute";
```

**Signature**:
```typescript
function createToolExecuteAfterHook(
  pluginState: ToolExecutePluginState,
): (input: ToolExecuteAfterInput, output: ToolExecuteAfterOutput) => Promise<void>;
```

**ToolExecutePluginState**: `{ recursionGuard: RecursionGuard, fusionResult?: FusionResult }`

**ToolExecuteBeforeInput**:
```typescript
{ tool: string; sessionID: string; callID: string }
```

**ToolExecuteBeforeOutput**:
```typescript
{ args: any }
```

**ToolExecuteAfterInput**:
```typescript
{ tool: string; sessionID: string; callID: string; args: any }
```

**ToolExecuteAfterOutput**:
```typescript
{ title: string; output: string; metadata: any }
```

---

### createEventHook

Creates the `event` hook that handles session lifecycle events.

```typescript
import { createEventHook } from "./hooks/event";
```

**Signature**:
```typescript
function createEventHook(
  pluginState: { recursionGuard: RecursionGuard; costTracker: CostTracker },
): (input: EventHookInput) => Promise<void>;
```

**Handled events**: `session.created`, `session.deleted`, `session.error`

---

## Type Exports

```typescript
import type {
  PanelResult,
  ConsensusPoint,
  Contradiction,
  ContradictionStance,
  PartialCoverage,
  UniqueInsight,
  ModelScores,
  Scoring,
  JudgeOutput,
  FusionResultStatus,
  FailedModel,
  FusionCost,
  FusionResult,
  PanelModel,
  FusionConfig,
} from "@modelfusion/plugin/types";
```

### PanelResult
```typescript
{
  modelId: string;
  providerId: string;
  content: string;
  tokenCount: { prompt: number; completion: number };
  latencyMs: number;
  error?: string;
}
```

### JudgeOutput
```typescript
{
  consensus: ConsensusPoint[];
  contradictions: Contradiction[];
  partial_coverage: PartialCoverage[];
  unique_insights: UniqueInsight[];
  blind_spots: string[];
  scoring: Scoring[];
  winner: string | null;
}
```

### FusionResult
```typescript
{
  status: "ok" | "degraded" | "error";
  analysis?: JudgeOutput;
  responses: PanelResult[];
  failedModels?: FailedModel[];
  synthesizedAnswer?: string;
  cost: FusionCost;
  failureReason?: string;
}
```

### FusionConfig
```typescript
{
  panel: {
    models: PanelModel[];
    maxModels: number;
  };
  judge: {
    providerId: string;
    modelId: string;
  };
  triggering: "auto" | "manual" | "threshold";
  threshold?: {
    minPromptLength: number;
    keywords: string[];
  };
  maxToolCalls: number;
  temperature: number;
  enabled: boolean;
}
```

### ConsensusPoint
```typescript
{ point: string; supportingModels: string[] }
```

### Contradiction
```typescript
{ topic: string; stances: Array<{ modelId: string; stance: string }> }
```

### PartialCoverage
```typescript
{ point: string; models: string[] }
```

### UniqueInsight
```typescript
{ modelId: string; insight: string }
```

### Scoring
```typescript
{
  modelId: string;
  scores: { completeness: number; accuracy: number; novelty: number; clarity: number };
  total: number;
}
```

---

## Config Schema Exports

```typescript
import { FusionConfigSchema, PanelModelSchema, DEFAULT_FUSION_CONFIG } from "@modelfusion/plugin/types";
```

### FusionConfigSchema
A Zod schema (from `zod` v4) that validates the full fusion configuration. All fields have defaults.

### PanelModelSchema
A Zod schema for individual panel model entries: `{ providerId: string, modelId: string }`

### DEFAULT_FUSION_CONFIG
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
  judge: { providerId: "openai", modelId: "gpt-4o" },
  triggering: "manual",
  maxToolCalls: 8,
  temperature: 0.7,
  enabled: true,
}
```

---

## JSON Schema Export

```typescript
import { JUDGE_OUTPUT_SCHEMA } from "@modelfusion/plugin/types";
```

A draft-07 JSON Schema object used with OpenCode's `format: { type: "json_schema", schema: JUDGE_OUTPUT_SCHEMA }` for structured judge output. Contains 6 required fields: `consensus`, `contradictions`, `partial_coverage`, `unique_insights`, `blind_spots`, `scoring`. Field names use snake_case as required by OpenRouter's format convention.
