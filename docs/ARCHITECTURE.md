# Architecture

ModelFusion is a dual-plugin system (server + TUI) that enables multi-model deliberation within OpenCode. This document covers every component, how data flows through the system, how hooks are wired, the pipeline stages, degradation paths, and state management.

---

## Component Tree

```
opencode runtime
│
├── Server Plugin (src/server/index.ts)
│   ├── FusionPlugin / default { server } ───────────────────── Plugin entry point
│   │   ├── Config parser (FusionConfigSchema)
│   │   ├── RecursionGuard (in-memory session state)
│   │   ├── CostTracker (per-session accumulator)
│   │   └── pluginState (shared object passed to hook factories)
│   │
│   ├── Pipeline Engine (src/server/pipeline.ts)
│   │   ├── runFusionPipeline ───────────────────────────────── orchestrates all stages
│   │   ├── fanOut (src/server/orchestrator.ts) ─────────────── parallel panelist dispatch
│   │   ├── runJudge (src/server/judge.ts) ──────────────────── structured JSON comparison
│   │   ├── synthesize (src/server/synthesizer.ts) ──────────── final answer from analysis
│   │   ├── CostTracker (src/server/cost-tracker.ts) ────────── token/cost accumulation
│   │   └── RecursionGuard (src/server/recursion-guard.ts) ──── nested-call prevention
│   │
│   ├── Hooks (7 hook factories in src/server/hooks/)
│   │   ├── createChatMessageHook        → chat.message
│   │   ├── createChatParamsHook         → chat.params
│   │   ├── createMessagesTransformHook  → experimental.chat.messages.transform
│   │   ├── createSystemTransformHook    → experimental.chat.system.transform
│   │   ├── createFusionTool             → tool["fusion:deliberate"]
│   │   ├── createToolExecuteBeforeHook  → tool.execute.before
│   │   ├── createToolExecuteAfterHook   → tool.execute.after
│   │   └── createEventHook              → event
│   │
│   ├── Utilities
│   │   ├── discoverAvailableModels  (src/server/providers.ts)
│   │   ├── validatePanelModels      (src/server/providers.ts)
│   │   ├── resolveModel             (src/server/providers.ts)
│   │   ├── handleDegradation        (src/server/degradation.ts)
│   │   └── getDegradationMessage    (src/server/degradation.ts)
│   │
│   └── Error Handling (inlined in orchestrator.ts, judge.ts)
│       ├── withTimeout         ─────── per-panelist timeout wrapper
│       ├── callPanelistWithRetry ───── retry loop for transient failures
│       ├── tryJSONRepair       ─────── 3-strategy JSON repair for judge output
│       └── sanitizePanelResults ────── control-char removal before judge prompt
│
├── TUI Plugin (src/tui/index.ts)
│   ├── FusionTuiPlugin / default { tui } ───────────────────── TUI entry point
│   │   ├── api.kv state persistence (fusion.initialized, fusion.version)
│   │   ├── /fusion slash command  (src/tui/commands.ts)
│   │   ├── /fusion:config command (src/tui/config.ts)
│   │   ├── `variant: "fusion:manual"` prompt delegation
│   │   ├── FusionProgressNotifier (src/tui/progress.ts)
│   │   └── Event subscriptions (session.created, session.deleted)
│
└── Types (src/types/)
    ├── results.ts ───── PanelResult, JudgeOutput, FusionResult, Scoring, etc.
    ├── config.ts ────── FusionConfig, PanelModel, Zod schemas, DEFAULT_FUSION_CONFIG
    ├── schema.ts ────── JUDGE_OUTPUT_SCHEMA (JSON Schema draft-07)
    └── index.ts ─────── barrel re-exports
```

---

## Data Flow

```
User prompt
     │
     ▼
┌─────────────────────────────────────────────────────────────────────┐
│ 1. chat.message hook                                                │
│    (createChatMessageHook)                                          │
│    ├─ Manual mode:    pass through unless variant="fusion:manual"  │
│    ├─ Auto mode:      always trigger                                │
│    └─ Threshold mode: trigger if prompt > minPromptLength           │
│                       OR prompt contains any keyword                 │
│    ┌─ RecursionGuard check: skip if fusion already active           │
│    └─ On trigger: calls runFusionPipeline(...)                      │
└──────────────────────────┬──────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────────┐
│ 1a. Explicit TUI manual trigger                                     │
│    (`/fusion` in src/tui/commands.ts)                               │
│    ├─ Opens a dialog prompt for the question                        │
│    ├─ Calls `api.client.session.prompt(...)`                        │
│    ├─ Sends `variant: "fusion:manual"`                             │
│    └─ Server hook treats that variant as force-trigger              │
└──────────────────────────┬──────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────────┐
│ 2. chat.params hook                                                 │
│    (createChatParamsHook)                                           │
│    ┌─ If fusion active: set temperature, maxOutputTokens            │
│    └─ If inactive: pass through unchanged                           │
└──────────────────────────┬──────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────────┐
│ 3. Fusion Pipeline (runFusionPipeline)                              │
│                                                                     │
│    Stage 1: Recursion Guard check                                   │
│    ├─ Active? → return { status: "error", reason: "capped" }       │
│    └─ Inactive? → markFusionActive(sessionID)                       │
│                                                                     │
│    Stage 2: fanOut (parallel dispatch)                              │
│    ├─ Promise.allSettled over all panel models                      │
│    ├─ Per-call: timeout (120s), retry (1 attempt)                   │
│    ├─ Each model gets verbatim prompt (no lenses/roles)             │
│    ├─ Captures: content, tokenCount, latencyMs                      │
│    └─ On failure: PanelResult with error field (no crash)           │
│                                                                     │
│    Stage 3: All-panelist-fail check                                 │
│    ├─ 0 successful → error, failureReason="all_panels_failed"       │
│    └─ >0 successful → proceed                                       │
│                                                                     │
│    Stage 4: runJudge                                                │
│    ├─ Sends panel responses to judge model (configured)             │
│    ├─ format: json_schema with JUDGE_OUTPUT_SCHEMA                  │
│    ├─ Judge prompt: "compare and contrast — do NOT merge"           │
│    ├─ JSON repair: direct → strip fences → regex extract            │
│    ├─ Normalization: snake_case → camelCase type conversion         │
│    └─ On failure (invalid JSON/empty/error) → returns null          │
│                                                                     │
│    Stage 5: Judge-null check                                        │
│    ├─ judgeOutput === null → degraded (raw responses, no analysis)  │
│    └─ judgeOutput present → proceed                                 │
│                                                                     │
│    Stage 6: synthesize                                              │
│    ├─ Uses ORIGINAL session model (not judge model)                 │
│    ├─ Prompt includes: judge JSON + panel responses + instructions  │
│    └─ Returns synthesized answer string                             │
│                                                                     │
│    Stage 7: Cost tracking                                           │
│    ├─ Per panelist: trackPanelist(modelId, prompt, completion)      │
│    ├─ Per judge: trackJudge(0, 0)                                   │
│    ├─ Per synthesis: trackSynthesis(0, 0)                           │
│    └─ getSummary() → totals + estimatedCost                         │
│                                                                     │
│    Stage 8: Cleanup                                                 │
│    └─ markFusionComplete(sessionID)                                 │
└──────────────────────────┬──────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────────┐
│ 4. Post-pipeline                                                    │
│                                                                     │
│    a. chat.message result injection                                 │
│       ├─ ok: replace output.parts with synthesized answer           │
│       ├─ degraded: show raw panel responses with warning            │
│       └─ error: prepend failure message to original parts           │
│                                                                     │
│    b. messages.transform hook (createMessagesTransformHook)         │
│       ├─ Appends analysis summary (system role)                     │
│       └─ Appends synthesized answer (assistant role)                │
│                                                                     │
│    c. tool.execute.after (createToolExecuteAfterHook)               │
│       ├─ Formats: Analysis Summary → Final Answer → Cost → ...     │
│       ├─ Includes degradation notice if applicable                  │
│       └─ Sets title to "Fusion: OK|DEGRADED|ERROR"                  │
│                                                                     │
│    d. system.transform hook (createSystemTransformHook)             │
│       └─ Appends deliberation prompt to system messages             │
└─────────────────────────────────────────────────────────────────────┘
                           │
                           ▼
                    User sees final response
```

---

## Hook Wiring Map

Each hook factory receives a subset of `pluginState` (structural typing). Here is what each factory destructures and which hook key it serves.

| Hook Key | Factory | Receives From pluginState | Purpose |
|---|---|---|---|
| `chat.message` | `createChatMessageHook` | config, recursionGuard, pipeline, client | Intercept user messages, trigger fusion |
| `chat.params` | `createChatParamsHook` | config, recursionGuard | Adjust temperature/maxOutputTokens for panelist calls |
| `experimental.chat.messages.transform` | `createMessagesTransformHook` | fusionResult (separate param) | Inject fusion analysis summary + answer into history |
| `experimental.chat.system.transform` | `createSystemTransformHook` | config | Inject deliberation prompt into system messages |
| `tool["fusion:deliberate"]` | `createFusionTool` | runFusionPipeline (function) | Register the fusion tool |
| `tool.execute.before` | `createToolExecuteBeforeHook` | recursionGuard | Validate args, guard recursion |
| `tool.execute.after` | `createToolExecuteAfterHook` | recursionGuard, fusionResult | Format output, mark complete |
| `event` | `createEventHook` | recursionGuard, costTracker | Session lifecycle management |

### pluginState Shape

```typescript
const pluginState = {
  config: FusionConfig,
  recursionGuard: RecursionGuard,
  costTracker: CostTracker,
  pipeline: typeof runFusionPipeline,
  client: PipelineClient,
};
```

Each factory destructures only what it needs. Extra properties are ignored via structural typing.

---

## Pipeline Stages (Detailed)

### Stage 1: Recursion Guard
- **File**: `src/server/recursion-guard.ts`
- **Check**: `recursionGuard.isFusionActive(sessionID)`
- **Block**: If active, returns error with `failureReason: "fusion_invocation_capped"`
- **Activate**: `recursionGuard.markFusionActive(sessionID)`
- **Cleanup**: `recursionGuard.markFusionComplete(sessionID)` in all exit paths (success, error, catch)

### Stage 2: Fan-Out (Parallel Panelist Dispatch)
- **File**: `src/server/orchestrator.ts`
- **Function**: `fanOut(client, sessionID, prompt, models, config, options?)`
- **Execution**: `Promise.allSettled` over all panel models
- **Each call**: `client.session.prompt({ sessionID, model: { providerID, modelID }, parts: [{ type: "text", text: prompt }] })`
- **Verbatim**: Prompt is passed exactly as received (trimmed). No lenses, roles, or personas.
- **Timeout**: 120s default per call, configurable via `FanOutOptions.timeoutMs`
- **Retry**: 1 retry per call with 100ms delay, configurable via `FanOutOptions.retries`
- **Error isolation**: Each promise has its own `.catch()` returning a `PanelResult` with `error` field
- **Tracking**: Per-model latency via `startTimes` Map, token counts from `response.info.tokens`

### Stage 3: Judge
- **File**: `src/server/judge.ts`
- **Function**: `runJudge(client, sessionID, panelResults, config)`
- **Prompt**: "You are a judge comparing responses from multiple AI models... compare and contrast. Do NOT merge or synthesize."
- **Format**: `format: { type: "json_schema", schema: JUDGE_OUTPUT_SCHEMA }`
- **Sanitization**: Panel content stripped of control characters before prompt building
- **JSON Repair**: 3 strategies tried in order:
  1. Direct `JSON.parse`
  2. Strip ` ```json ... ``` ` fences, then parse
  3. Regex `{...}` extraction, then parse
- **Normalization**: snake_case fields from JSON schema → camelCase TypeScript types
- **Returns**: `JudgeOutput | null` (null on any failure)

### Stage 4: Synthesize
- **File**: `src/server/synthesizer.ts`
- **Function**: `synthesize(client, sessionID, judgeOutput, panelResults, config, originalModel)`
- **Model**: Uses the **original session model**, NOT the judge model
- **Prompt**: Judge analysis JSON block + original model responses + attribution instructions
- **Returns**: synthesized answer string

### Stage 5: Cost Tracking
- **File**: `src/server/cost-tracker.ts`
- **Per-panelist**: `costTracker.trackPanelist(modelId, promptTokens, completionTokens)` — tokens from `response.info.tokens.input` / `output`
- **Judge**: `costTracker.trackJudge(promptTokens, completionTokens)` — currently tracks 0/0 (token counts not exposed by runJudge return)
- **Synthesis**: `costTracker.trackSynthesis(promptTokens, completionTokens)` — currently tracks 0/0
- **Summary**: `costTracker.getSummary()` → `{ perModel, judge, synthesis, totals, estimatedCost }`
- **Estimation**: 3 pricing tiers: budget ($0.15/$0.60 per 1M), standard ($3/$15), premium ($15/$75)

### Stage 6: Degradation Post-Processing
- **File**: `src/server/degradation.ts`
- **Applied in**: hook consumers (not in pipeline itself)
- **Scenarios**:
  - Judge fail, panel OK → status "degraded", analysis omitted
  - Partial panel failure → status stays "ok", failedModels populated
  - All panelists fail → status "error", failureReason "all_panels_failed"
  - Pre-existing failureReason (e.g., recursion capped) → preserved as-is

---

## Degradation Paths

| Scenario | Status | Analysis | Synthesis | User Sees |
|---|---|---|---|---|
| Happy path (panel + judge + synthesis) | "ok" | Present | Present | Synthesized answer with attribution |
| Judge fails, panel OK | "degraded" | Omitted | Omitted | Raw panel responses with warning |
| Some panelists fail, judge OK | "ok" | Present | Present | Synthesized answer + failedModels list |
| All panelists fail | "error" | Omitted | Omitted (fallback to original) | Original model response + error message |
| Recursion capped (nested fusion) | "error" | Omitted | Omitted | "Fusion already running" message |
| Pipeline exception | "error" | Omitted | Omitted | Error message from exception |

---

## State Management

### RecursionGuard
- **Type**: In-memory `Map<string, boolean>`
- **Scope**: Per-plugin-instance (global to all sessions)
- **Persistence**: None (lost on restart)
- **Depth**: Single level only (`MAX_DEPTH = 1`)
- **Methods**:
  - `isFusionActive(sessionID)` — check
  - `markFusionActive(sessionID)` — activate (returns false if already active)
  - `markFusionComplete(sessionID)` — deactivate (sets to false, does not delete)
  - `getDepth(sessionID)` — 1 if active, 0 if not

### CostTracker
- **Type**: Class with internal Maps and counters
- **Scope**: Per-pipeline-invocation (created fresh in `runFusionPipeline`)
- **Pricing Tiers**: budget, standard (default), premium
- **Methods**: `trackPanelist`, `trackJudge`, `trackSynthesis`, `getSummary`

### Config (TUI)
- **Storage**: `api.kv` with key `fusion.config`
- **Namespace**: `"fusion"` prefix for all KV keys
- **Persistence**: Survives restarts (opencode KV is persistent)
- **Validation**: Every write runs through `FusionConfigSchema.safeParse()`

---

## File Map

| File | Role | Dependencies |
|---|---|---|
| `src/server/index.ts` | Server plugin entry point, hook wiring | All hooks, pipeline, config, recursion-guard, cost-tracker |
| `src/server/pipeline.ts` | Full pipeline orchestration | orchestrator, judge, synthesizer, cost-tracker, recursion-guard |
| `src/server/orchestrator.ts` | Parallel panelist dispatch | types/config, types/results |
| `src/server/judge.ts` | Judge model call with structured output | types/config, types/results, types/schema |
| `src/server/synthesizer.ts` | Final answer synthesis | types/config, types/results |
| `src/server/cost-tracker.ts` | Token counting and cost estimation | (standalone) |
| `src/server/degradation.ts` | Graceful degradation logic | types/results |
| `src/server/recursion-guard.ts` | Recursion prevention | (standalone) |
| `src/server/providers.ts` | Provider/model discovery and validation | types/config |
| `src/tui/index.ts` | TUI plugin entry point | @opencode-ai/plugin/tui |
| `src/tui/commands.ts` | /fusion slash command | @opencode-ai/plugin/tui |
| `src/tui/progress.ts` | Toast-based progress notifications | (standalone) |
| `src/tui/config.ts` | Config UI (/fusion:config) | types/config, @opencode-ai/plugin/tui |
| `src/types/results.ts` | Core result and output types | (standalone) |
| `src/types/config.ts` | Zod schemas and default config | zod |
| `src/types/schema.ts` | JSON Schema for judge output | (standalone) |
| `src/types/index.ts` | Barrel re-exports | results, config, schema |

### Hook Factory Files

| File | Exports | Consumed By |
|---|---|---|
| `src/server/hooks/chat-message.ts` | `createChatMessageHook` | `chat.message` hook |
| `src/server/hooks/chat-params.ts` | `createChatParamsHook` | `chat.params` hook |
| `src/server/hooks/messages-transform.ts` | `createMessagesTransformHook` | `experimental.chat.messages.transform` |
| `src/server/hooks/system-transform.ts` | `createSystemTransformHook` | `experimental.chat.system.transform` |
| `src/server/hooks/tool-registration.ts` | `createFusionTool` | `tool["fusion:deliberate"]` |
| `src/server/hooks/tool-execute.ts` | `createToolExecuteBeforeHook`, `createToolExecuteAfterHook` | `tool.execute.before`, `tool.execute.after` |
| `src/server/hooks/event.ts` | `createEventHook` | `event` hook |
