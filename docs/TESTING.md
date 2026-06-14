# Testing

ModelFusion uses `bun:test` for all testing. The project has 162 tests across 25 test files, with 624 `expect()` calls.

---

## Test Framework

**Framework**: `bun:test` (built into Bun 1.3.14+)

**Import**:
```typescript
import { describe, expect, test, mock } from "bun:test";
```

**Run Command**:
```bash
bun test --isolate           # All tests (MANDATORY --isolate)
bun test --isolate src/server/  # Server tests only
bun test --isolate src/tui/     # TUI tests only
bun test --isolate '*integration*'  # Integration tests
```

---

## BDD Pattern (GIVEN/WHEN/THEN)

Every test case uses GIVEN/WHEN/THEN comments to structure test logic:

```typescript
describe("fanOut", () => {
  test("GIVEN 3 valid models WHEN fanOut executes THEN returns 3 panel results", async () => {
    // GIVEN a mock client that returns responses for all models
    const client = makeMockClient();

    // WHEN fanOut is called with 3 models
    const results = await fanOut(client, "session-1", "test prompt", threeModels, config);

    // THEN 3 panel results are returned with correct content
    expect(results).toHaveLength(3);
    expect(results[0].content).toBe("response from model A");
    expect(results[1].content).toBe("response from model B");
    expect(results[2].content).toBe("response from model C");
  });
});
```

This pattern:
- Makes test intent immediately clear
- Serves as living documentation
- Makes test failures easier to diagnose (the GIVEN/WHEN tells you what scenario broke)

---

## Mock Isolation (Critical)

### The `--isolate` Flag

**`mock.module()` is process-global in Bun.** Without `--isolate`, mocks set in one test file can leak into other test files, causing false failures or false passes.

**ALWAYS use `bun test --isolate`** — never run without it.

The `package.json` script already includes the flag:
```json
{
  "scripts": {
    "test": "bun test --isolate"
  }
}
```

### Unit Tests (No mock.module())

Unit tests use `mock()` from `bun:test` for function-level mocking and inline mock objects for client stubs. They do NOT use `mock.module()`.

```typescript
import { describe, expect, test, mock } from "bun:test";

// Function mock
const mockPipeline = mock(() => Promise.resolve(validFusionResult));

// Inline client mock
const mockClient = {
  session: {
    prompt: mock(async (_path: string, _body: unknown) => ({
      choices: [{ message: { content: "mock response" } }],
    })),
  },
};
```

### Integration Tests (Use mock.module())

Integration tests replace entire sub-modules via `mock.module()`:

```typescript
import { mock, describe, expect, test } from "bun:test";

// Mock sub-modules before importing the module under test
mock.module("./orchestrator", () => ({
  fanOut: mockFanOut,
}));

mock.module("../judge", () => ({
  runJudge: mockJudge,
}));

mock.module("../synthesizer", () => ({
  synthesize: mockSynthesize,
}));

// Then import dynamically
const { runFusionPipeline } = await import("../pipeline");
```

**Order matters**: `mock.module()` calls must precede the dynamic `import()`.

---

## File Naming Conventions

| Type | Pattern | Location | Example |
|---|---|---|---|
| Unit tests | `*.test.ts` | Co-located with source | `orchestrator.test.ts` in `src/server/` |
| Integration tests | `*.integration.test.ts` | `src/` or alongside | `pipeline.integration.test.ts` |
| Smoke tests | `smoke.test.ts` | `src/` | `src/smoke.test.ts` |

---

## Test Files Inventory

| File | Tests | `expect()` Calls | Tests |
|---|---|---|---|
| `src/smoke.test.ts` | 5 | 8 | Toolchain verification |
| `src/types/config.test.ts` | 8 | — | Config schema validation |
| `src/types/schema.test.ts` | — | — | JSON Schema validation |
| `src/server/providers.test.ts` | 4 | 6 | Provider discovery |
| `src/server/orchestrator.test.ts` | 7 | 59 | Panel fan-out |
| `src/server/judge.test.ts` | 5 | 16 | Judge engine |
| `src/server/synthesizer.test.ts` | 4 | 10 | Synthesizer |
| `src/server/pipeline.test.ts` | — | — | Pipeline orchestration |
| `src/server/pipeline.integration.test.ts` | — | — | Pipeline integration |
| `src/server/cost-tracker.test.ts` | 5 | 16 | Cost tracking |
| `src/server/degradation.test.ts` | 6 | 26 | Degradation handler |
| `src/server/recursion-guard.test.ts` | 3 | 9 | Recursion guard |
| `src/server/error-handling.test.ts` | 15 | 35 | Error hardening |
| `src/server/index.test.ts` | 6 | 40 | Plugin entry point |
| `src/server/hooks/chat-message.test.ts` | 7 | 13 | Chat message hook |
| `src/server/hooks/chat-params.test.ts` | 4 | 10 | Chat params hook |
| `src/server/hooks/messages-transform.test.ts` | 5 | 19 | Messages transform hook |
| `src/server/hooks/system-transform.test.ts` | 2 | 6 | System transform hook |
| `src/server/hooks/tool-registration.test.ts` | 3 | 12 | Tool registration |
| `src/server/hooks/tool-execute.test.ts` | 10 | 35 | Tool execute hooks |
| `src/server/hooks/event.test.ts` | 4 | 4 | Event hook |
| `src/tui/index.test.ts` | 6 | 20 | TUI entry point |
| `src/tui/progress.test.ts` | 8 | 24 | Progress notifier |
| `src/tui/commands.test.ts` | 4 | 25 | Fusion command |
| `src/tui/config.test.ts` | 23 | — | Config UI |
| `src/integration.test.ts` | 8 | 73 | E2E integration |

Total: **162 tests, 624 expect() calls across 25 files** (at last full audit).

---

## Test Patterns

### Mock Client Factories

```typescript
function makeMockClient() {
  return {
    session: {
      prompt: mock(async (_path: string, body: Record<string, unknown>) => {
        const modelId = (body.model as { modelID: string }).modelID;
        if (modelId === "fail-model") throw new Error("Simulated failure");
        return {
          choices: [{ message: { content: `response from ${modelId}` } }],
          usage: { prompt_tokens: 50, completion_tokens: 100 },
        };
      }),
    },
  };
}
```

### Partial Override Fixtures

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

### Captured Body Pattern

```typescript
function makeCapturingClient() {
  const bodies: Array<Record<string, unknown>> = [];
  return {
    session: {
      prompt: mock(async (_path: string, body: Record<string, unknown>) => {
        bodies.push(body);  // capture for later assertion
        return { content: "mock synthesis" };
      }),
    },
    getCapturedBodies: () => bodies,
  };
}
```

### Toast Call Extraction

```typescript
function lastToastCall(api: ReturnType<typeof mockApi>) {
  const toastMock = api.ui.toast as ReturnType<typeof mock>;
  return toastMock.mock.calls[toastMock.mock.calls.length - 1]?.[0];
}
```

### Parallel Execution Verification

```typescript
function makeParallelTrackingClient() {
  let maxConcurrent = 0;
  let current = 0;
  return {
    session: {
      prompt: mock(async () => {
        current++;
        if (current > maxConcurrent) maxConcurrent = current;
        await Promise.resolve();  // yield event loop
        current--;
        return { choices: [{ message: { content: "ok" } }] };
      }),
    },
    getMaxConcurrent: () => maxConcurrent,
  };
}
```

---

## Known Pitfalls

### 1. Mock `mock()` call metadata access

`bun:test`'s `mock()` returns a typed function. Accessing `.mock.calls` requires a cast:

```typescript
const fn = mock(() => {});
const calls = (fn as ReturnType<typeof mock>).mock.calls;
```

### 2. `toHaveProperty` with dotted keys

`expect(hooks).toHaveProperty("chat.message")` treats the dot as a path separator. Use bracket access:

```typescript
expect(hooks["chat.message"]).toBeDefined();  // CORRECT
```

### 3. RecursionGuard mock

`RecursionGuard` has private fields. Cast through `unknown`:

```typescript
const mockGuard = {
  isFusionActive: mock(() => false),
  markFusionActive: mock(() => true),
  markFusionComplete: mock(() => {}),
} as unknown as RecursionGuard;
```

### 4. Message type assertion for system role

SDK `Message` type is `UserMessage | AssistantMessage`. For system-role injection tests:

```typescript
expect((msg.info as { role: string }).role).toBe("system");
```

### 5. FusionResult.synthesizedAnswer is optional

`synthesizedAnswer` is `string | undefined`. Use `!` assertion in fixtures:

```typescript
expect(result.synthesizedAnswer!).toBe("expected answer");
```

### 6. Integration test mock order

`mock.module()` must come BEFORE dynamic `import()`:

```typescript
mock.module("./orchestrator", () => ({ fanOut: mockFn }));
const { runFusionPipeline } = await import("./pipeline");
```

---

## Running Tests

```bash
# Quick check (all tests)
bun test --isolate

# Watch mode
bun test --isolate --watch

# With coverage
bun test --isolate --coverage

# Specific test
bun test --isolate --test-name-pattern "GIVEN valid config"
```

All commands must include `--isolate`. The project's `package.json` has `"test": "bun test --isolate"` to enforce this by default.