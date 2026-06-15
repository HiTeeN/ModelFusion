# Contributing

Guide for developers working on the ModelFusion plugin. Covers setup, build, test, code patterns, conventions, and known gotchas.

---

## Prerequisites

- **Bun** 1.3.14 or later (project uses bun:test, bun run, bun install)
- **Node.js** 22+ (required by Bun's TypeScript compiler)
- **TypeScript** 5.x (dev dependency)

---

## Setup

```bash
# Clone the repository
git clone <repo-url> /path/to/ModelFusion
cd /path/to/ModelFusion

# Install dependencies
bun install

# Verify setup — TypeScript compilation
bun run build

# Verify setup — test suite
bun test --isolate
```

### Dependency Note

`bun install` may timeout on the first run due to `effect` package extraction (a transitive dependency of `@opencode-ai/plugin`). If this happens, retry with a longer timeout:

```bash
bun install --fetch-timeout 120000
```

---

## Build

```bash
bun run build
```

Runs `tsc --noEmit` to type-check the entire project. No output files are generated (the plugin is loaded directly from source by the OpenCode runtime).

Build must pass with 0 errors before any commit.

---

## Test

```bash
# Run all tests
bun test --isolate

# Run only server tests
bun test --isolate src/server/

# Run only TUI tests
bun test --isolate src/tui/

# Run a specific test file
bun test --isolate src/server/orchestrator.test.ts

# Run tests matching a pattern
bun test --isolate --test-name-pattern "judge"

# Run integration tests
bun test --isolate '*integration*'
```

**The `--isolate` flag is MANDATORY.** See [Mock Isolation](#mock-isolation) below.

---

## Project Structure

```
src/
├── index.ts                          # Placeholder (export {})
├── smoke.test.ts                     # Toolchain smoke tests
├── integration.test.ts               # End-to-end integration tests
├── server/
│   ├── index.ts                      # Server plugin entry point
│   ├── pipeline.ts                   # Full pipeline orchestrator
│   ├── orchestrator.ts               # Parallel panelist dispatch
│   ├── judge.ts                      # Judge model with JSON schema output
│   ├── synthesizer.ts                # Final answer synthesis
│   ├── cost-tracker.ts               # Token counting and cost estimation
│   ├── degradation.ts                # Graceful degradation handler
│   ├── recursion-guard.ts            # Recursion prevention (single-level)
│   ├── providers.ts                  # Provider/model discovery
│   ├── error-handling.test.ts        # Error hardening tests
│   ├── *.test.ts                     # Co-located unit tests
│   └── hooks/
│       ├── chat-message.ts           # chat.message hook factory
│       ├── chat-params.ts            # chat.params hook factory
│       ├── messages-transform.ts     # messages.transform hook factory
│       ├── system-transform.ts       # system.transform hook factory
│       ├── tool-registration.ts      # fusion:deliberate tool factory
│       ├── tool-execute.ts           # tool.execute.before/after factories
│       ├── event.ts                  # event hook factory
│       └── *.test.ts                 # Co-located unit tests
├── tui/
│   ├── index.ts                      # TUI plugin entry point
│   ├── commands.ts                   # /fusion slash command
│   ├── progress.ts                   # Toast-based progress notifier
│   ├── config.ts                     # Config UI (/fusion:config command)
│   └── *.test.ts                     # Co-located unit tests
└── types/
    ├── index.ts                      # Barrel re-exports
    ├── results.ts                    # Core result/output types
    ├── config.ts                     # Zod schemas + defaults
    └── schema.ts                     # JSON Schema for judge output
```

---

## Code Patterns

### Test Structure (BDD)

Every test uses GIVEN/WHEN/THEN comments:

```typescript
import { describe, expect, test, mock } from "bun:test";

describe("fanOut", () => {
  test("GIVEN valid models WHEN fanOut executes THEN returns panel results", async () => {
    // GIVEN a mock client and configured models
    const client = makeMockClient();

    // WHEN fanOut is called
    const results = await fanOut(client, "session-1", "test prompt", models, config);

    // THEN results contain one entry per model
    expect(results).toHaveLength(3);
    expect(results[0].content).toBe("response from model A");
  });
});
```

### Loose Typing for Client Params

Client interfaces are loosely typed to avoid SDK coupling. Instead of importing OpenCode SDK types, each module defines its own minimal interface:

```typescript
// In orchestrator.ts — not importing from @opencode-ai/sdk
export interface OrchestratorClient {
  session: {
    prompt: (params: {
      sessionID: string;
      model: { providerID: string; modelID: string };
      parts: Array<{ type: string; text?: string; [key: string]: unknown }>;
    }) => Promise<PromptResponse>;
  };
}

export interface PromptResponse {
  info: {
    tokens: {
      input: number;
      output: number;
    };
  };
  parts: Array<{ type: string; text?: string }>;
}
```

This pattern keeps the plugin resilient to SDK version changes. The v1.17.6 API uses a single params object with `parts` instead of the old two-argument `session.prompt(sessionID, { model, prompt })` format.

### Verbatim Prompting Rule

All panelists receive the exact user prompt with no modifications:

```typescript
// CORRECT — verbatim (v1.17.6 single-object format)
const response = await client.session.prompt({
  sessionID,
  model: { providerID, modelID },
  parts: [{ type: "text", text: userPrompt }],  // exactly as received
});

// WRONG — no lenses, roles, or personas
// parts: [{ type: "text", text: `[Role: expert] ${userPrompt}` }]  // NO
```

### Factory Pattern for Hooks

Each hook is created by a factory function that receives a `pluginState` object:

```typescript
export function createChatMessageHook(
  pluginState: ChatMessagePluginState,
): (input: ChatMessageInput, output: ChatMessageOutput) => Promise<void> {
  const { config, recursionGuard, pipeline, client } = pluginState;
  return async (input, output) => {
    // hook logic
  };
}
```

### Plugin Module Entry Shape

OpenCode does not just need a correctly typed function. It loads plugin entrypoints as module objects:

```typescript
// src/server/index.ts
export const server = FusionPlugin;
export default { server };

// src/tui/index.ts
export const tui = FusionTuiPlugin;
export default { tui };
```

Keep the legacy named exports (`FusionPlugin`, `FusionTuiPlugin`) for direct imports and tests, but do not remove the default `{ server }` / `{ tui }` module shape.

### `/fusion` Must Force Manual Deliberation

The `/fusion` TUI command is not a plain chat prompt. It must send:

```typescript
await api.client.session.prompt({
  sessionID,
  variant: "fusion:manual",
  parts: [{ type: "text", text: question }],
});
```

The server `chat.message` hook treats `variant === "fusion:manual"` as an explicit trigger, even when `config.triggering === "manual"`. If you remove that variant path, `/fusion` stops being a reliable manual trigger.

### File Naming

| Type | Convention | Example |
|---|---|---|
| Unit tests | `*.test.ts`, co-located | `orchestrator.test.ts` |
| Integration tests | `*.integration.test.ts` | `pipeline.integration.test.ts` |
| Source files | kebab-case | `cost-tracker.ts`, `chat-message.ts` |

---

## Mock Isolation

### The `--isolate` Flag

**`mock.module()` is process-global in Bun.** This means mocks set in one test file can leak into other test files if they run in the same process.

**Always use `bun test --isolate`** to run each test file in its own worker process:

```bash
bun test --isolate        # CORRECT
bun test                  # WRONG — mock leaks possible
```

The `package.json` test script already includes `--isolate`:

```json
{
  "scripts": {
    "test": "bun test --isolate"
  }
}
```

### Unit Tests

- Use `mock()` from `bun:test` for function-level mocking
- Use inline mock objects for client stubs
- Do NOT use `mock.module()` in unit tests (overkill)

```typescript
const mockPipeline = mock(() => Promise.resolve(validFusionResult));
```

### Integration Tests

- Use `mock.module()` for sub-module replacement
- Must run with `--isolate` (always)
- `mock.module()` calls must precede the dynamic `import()` of the module being tested

```typescript
import { mock, describe, expect, test } from "bun:test";

mock.module("../orchestrator", () => ({
  fanOut: mockFanOut,
}));

const { runFusionPipeline } = await import("../pipeline");
```

### Mock Factories for Tests

Complex test files use helper factories to create fixtures:

```typescript
function makeFusionResult(overrides?: Partial<FusionResult>): FusionResult {
  return {
    status: "ok",
    responses: [],
    cost: { totalPromptTokens: 0, totalCompletionTokens: 0, estimatedCost: 0 },
    ...overrides,
  };
}
```

---

## Commit Conventions

```
<type>(<scope>): <description>
```

| Type | Scope Examples | Description |
|---|---|---|
| `feat` | core, types, tui | New feature |
| `fix` | orchestrator, judge | Bug fix |
| `test` | all, judge | Test changes |
| `docs` | readme, api | Documentation |
| `chore` | deps, scaffold | Maintenance |

Examples:
```
feat(core): add panel orchestrator with parallel fan-out
test(judge): cover invalid JSON and empty response paths
docs(api): add complete API reference
chore(deps): update @opencode-ai/plugin to 1.17.6
```

---

## Known Gotchas

### Zod v4 vs SDK Zod v1 Conflict

The project uses `zod@^4.1.8` but `@opencode-ai/plugin` bundles `zod@^1.x` internally. When the SDK's `ToolDefinition` type references its own Zod version, the type mismatch requires a cast at the boundary:

```typescript
// In src/server/index.ts
return {
  // ...hooks
} as unknown as import("@opencode-ai/plugin").Hooks;
```

### TuiCommand has no argumentHint

`argumentHint` is a non-standard extension to `TuiCommand`. It works in OpenCode's TUI but is not part of the official `@opencode-ai/plugin/tui` type. If tests or the runtime complain, it may need to be added as a type assertion.

### TUI Commands Use api.keymap.registerLayer

In v1.17.6, TUI commands are registered via `api.keymap.registerLayer` instead of the old `api.command` API:

```typescript
api.keymap.registerLayer({
  commands: [
    {
      name: "fusion:deliberate",
      title: "Fusion: Deliberate",
      desc: "...",
      category: "fusion",
      namespace: "palette",
      slashName: "fusion",
      slashAliases: ["deliberate", "panel"],
      run: async () => { /* ... */ },
    },
  ],
  bindings: [],
});
```

`src/tui/index.ts` currently registers the main deliberation command via `createFusionCommand(api)` and the configuration command via `createConfigUI(api)`. Do not replace them with inline placeholder commands.

### mock() Return Type in bun:test

`mock()` from `bun:test` returns a type that doesn't expose `.mock.calls` directly. Access call metadata via a cast:

```typescript
const fn = mock(() => {});
const calls = (fn as ReturnType<typeof mock>).mock.calls;
```

### Matcher Gotcha: toHaveProperty with Dotted Keys

`expect(hooks).toHaveProperty("chat.message")` FAILS because `toHaveProperty` treats dots as path separators. Use bracket access instead:

```typescript
// WRONG
expect(hooks).toHaveProperty("chat.message");

// CORRECT
expect(hooks["chat.message"]).toBeDefined();
```

### RecursionGuard Mock in Tests

`RecursionGuard` is a class with private fields. When mocking in tests, cast through `unknown`:

```typescript
const mockGuard = {
  isFusionActive: mock(() => false),
  markFusionActive: mock(() => true),
  markFusionComplete: mock(() => {}),
} as unknown as RecursionGuard;
```

### Integration Test Mock Order

In integration tests, `mock.module()` calls must precede `import()`:

```typescript
// 1. Set up mocks FIRST
mock.module("./orchestrator", () => ({ fanOut: mockFanOut }));

// 2. THEN import the module under test
const { runFusionPipeline } = await import("./pipeline");
```

### Message Type for System Role Injection

The SDK `Message` type is `UserMessage | AssistantMessage`. When injecting system-role messages, use a type assertion:

```typescript
const base = {
  id: `fusion-${role}-${Date.now()}`,
  sessionID: "",
  role,  // "system" | "assistant"
  time: { created: Date.now() },
};

const info: Message = base as Message;  // runtime accepts system role
```

### Bun Binary Not in PATH

If `bun` is not in PATH, use the explicit path:

```bash
~/.bun/bin/bun test --isolate
```

Or via npx:

```bash
npx bun test --isolate
```
