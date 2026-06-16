import { describe, expect, test } from "bun:test";
import { createChatParamsHook } from "./chat-params.js";
// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------
function mockRecursionGuard(active) {
    return {
        isFusionActive: () => active,
        markFusionActive: () => true,
        markFusionComplete: () => { },
        getDepth: () => (active ? 1 : 0),
    };
}
function makeConfig(overrides = {}) {
    return {
        panel: {
            models: [
                { providerId: "openai", modelId: "gpt-4o-mini" },
                { providerId: "anthropic", modelId: "claude-3-haiku" },
            ],
            maxModels: 8,
        },
        judge: { providerId: "openai", modelId: "gpt-4o" },
        triggering: "manual",
        maxToolCalls: 8,
        temperature: 0.7,
        enabled: true,
        ...overrides,
    };
}
function makeInput(sessionID = "test-session") {
    return {
        sessionID,
        agent: "test-agent",
        model: { providerID: "openai", modelID: "gpt-4o" },
        provider: {},
        message: {},
    };
}
function makeOutput() {
    return {
        temperature: 1.0,
        topP: 0.9,
        topK: 40,
        maxOutputTokens: 4096,
        options: {},
    };
}
// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe("createChatParamsHook", () => {
    // -----------------------------------------------------------------------
    // Test 1: Fusion active — params modified
    // -----------------------------------------------------------------------
    test("GIVEN fusion is active WHEN hook runs THEN temperature and maxOutputTokens are set from config", async () => {
        // GIVEN
        const config = makeConfig({ temperature: 0.3, maxToolCalls: 5 });
        const state = {
            config,
            recursionGuard: mockRecursionGuard(true),
        };
        const hook = createChatParamsHook(state);
        const input = makeInput();
        const output = makeOutput();
        // WHEN
        await hook(input, output);
        // THEN
        expect(output.temperature).toBe(0.3);
        expect(output.maxOutputTokens).toBe(5000); // 5 * 1000
        // Non-fusion params left unchanged
        expect(output.topP).toBe(0.9);
        expect(output.topK).toBe(40);
    });
    // -----------------------------------------------------------------------
    // Test 2: Fusion inactive — pass through unchanged
    // -----------------------------------------------------------------------
    test("GIVEN fusion is NOT active WHEN hook runs THEN output is unchanged", async () => {
        // GIVEN
        const config = makeConfig({ temperature: 0.3, maxToolCalls: 5 });
        const state = {
            config,
            recursionGuard: mockRecursionGuard(false),
        };
        const hook = createChatParamsHook(state);
        const input = makeInput();
        const output = makeOutput();
        const original = { ...output };
        // WHEN
        await hook(input, output);
        // THEN
        expect(output).toEqual(original);
    });
    // -----------------------------------------------------------------------
    // Test 3: maxOutputTokens computed correctly
    // -----------------------------------------------------------------------
    test("GIVEN fusion is active with maxToolCalls=12 WHEN hook runs THEN maxOutputTokens is 12000", async () => {
        // GIVEN
        const config = makeConfig({ maxToolCalls: 12, temperature: 0.5 });
        const state = {
            config,
            recursionGuard: mockRecursionGuard(true),
        };
        const hook = createChatParamsHook(state);
        const input = makeInput();
        const output = makeOutput();
        // WHEN
        await hook(input, output);
        // THEN
        expect(output.maxOutputTokens).toBe(12000);
        expect(output.temperature).toBe(0.5);
    });
    // -----------------------------------------------------------------------
    // Test 4: Different sessions — only active session gets modified
    // -----------------------------------------------------------------------
    test("GIVEN fusion active for session A but not B WHEN hook runs for B THEN B is unchanged", async () => {
        // GIVEN — guard that only returns true for session "active-session"
        const selectiveGuard = {
            isFusionActive: (sid) => sid === "active-session",
            markFusionActive: () => true,
            markFusionComplete: () => { },
            getDepth: (sid) => (sid === "active-session" ? 1 : 0),
        };
        const config = makeConfig({ temperature: 0.2, maxToolCalls: 3 });
        const state = { config, recursionGuard: selectiveGuard };
        const hook = createChatParamsHook(state);
        // WHEN — active session
        const activeOutput = makeOutput();
        await hook(makeInput("active-session"), activeOutput);
        // THEN — active session modified
        expect(activeOutput.temperature).toBe(0.2);
        expect(activeOutput.maxOutputTokens).toBe(3000);
        // WHEN — inactive session
        const inactiveOutput = makeOutput();
        const inactiveOriginal = { ...inactiveOutput };
        await hook(makeInput("inactive-session"), inactiveOutput);
        // THEN — inactive session unchanged
        expect(inactiveOutput).toEqual(inactiveOriginal);
    });
});
//# sourceMappingURL=chat-params.test.js.map