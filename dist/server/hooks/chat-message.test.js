import { describe, expect, test, mock } from "bun:test";
import { createChatMessageHook } from "./chat-message.js";
import { RecursionGuard } from "../recursion-guard.js";
// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------
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
function makeInput(overrides = {}) {
    return {
        sessionID: "test-session",
        model: { providerID: "openai", modelID: "gpt-4o" },
        ...overrides,
    };
}
function makeOutput(parts = []) {
    return {
        message: {
            id: "msg-1",
            sessionID: "test-session",
            role: "user",
            time: { created: Date.now() },
            agent: "test-agent",
            model: { providerID: "openai", modelID: "gpt-4o" },
        },
        parts,
    };
}
function textPart(text) {
    return { type: "text", text };
}
function makePluginState(overrides = {}) {
    return {
        config: makeConfig(),
        recursionGuard: new RecursionGuard(),
        pipeline: mock(async () => ({
            status: "ok",
            responses: [],
            cost: { totalPromptTokens: 0, totalCompletionTokens: 0, estimatedCost: 0 },
            synthesizedAnswer: "Fused answer",
        })),
        client: {},
        ...overrides,
    };
}
// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe("createChatMessageHook", () => {
    // -----------------------------------------------------------------------
    // Test 1: Manual mode — pipeline NOT called
    // -----------------------------------------------------------------------
    test("GIVEN triggering=manual WHEN message arrives THEN pipeline is NOT called", async () => {
        const pipeline = mock(async () => ({
            status: "ok",
            responses: [],
            cost: { totalPromptTokens: 0, totalCompletionTokens: 0, estimatedCost: 0 },
            synthesizedAnswer: "Fused answer",
        }));
        const state = makePluginState({
            config: makeConfig({ triggering: "manual" }),
            pipeline: pipeline,
        });
        const hook = createChatMessageHook(state);
        const input = makeInput();
        const output = makeOutput([textPart("Hello, how are you?")]);
        await hook(input, output);
        // THEN pipeline was never called
        expect(pipeline).not.toHaveBeenCalled();
        // THEN output parts are unchanged
        expect(output.parts).toEqual([textPart("Hello, how are you?")]);
    });
    test("GIVEN manual fusion variant WHEN message arrives THEN pipeline is called", async () => {
        const pipeline = mock(async () => ({
            status: "ok",
            responses: [],
            cost: { totalPromptTokens: 0, totalCompletionTokens: 0, estimatedCost: 0 },
            synthesizedAnswer: "Fused answer",
        }));
        const state = makePluginState({
            config: makeConfig({ triggering: "manual" }),
            pipeline: pipeline,
        });
        const hook = createChatMessageHook(state);
        const input = makeInput({ variant: "fusion:manual" });
        const output = makeOutput([textPart("Force fusion")]);
        await hook(input, output);
        expect(pipeline).toHaveBeenCalledTimes(1);
        expect(output.parts).toEqual([textPart("Fused answer")]);
    });
    test("GIVEN slash fusion prompt WHEN message arrives THEN pipeline is called in manual mode", async () => {
        let receivedPrompt = "";
        let callCount = 0;
        const pipeline = (async (_client, _sessionID, prompt) => {
            callCount += 1;
            receivedPrompt = prompt;
            return {
                status: "ok",
                responses: [],
                cost: { totalPromptTokens: 0, totalCompletionTokens: 0, estimatedCost: 0 },
                synthesizedAnswer: "Fused answer",
            };
        });
        const state = makePluginState({
            config: makeConfig({ triggering: "manual" }),
            pipeline,
        });
        const hook = createChatMessageHook(state);
        const input = makeInput();
        const output = makeOutput([textPart("/fusion Compare SQLite and DuckDB")]);
        await hook(input, output);
        expect(callCount).toBe(1);
        expect(receivedPrompt).toBe("Compare SQLite and DuckDB");
        expect(output.parts).toEqual([textPart("Fused answer")]);
    });
    test("GIVEN slash fusion config prompt WHEN message arrives THEN config text is returned", async () => {
        const pipeline = mock(async () => ({
            status: "ok",
            responses: [],
            cost: { totalPromptTokens: 0, totalCompletionTokens: 0, estimatedCost: 0 },
            synthesizedAnswer: "Fused answer",
        }));
        const state = makePluginState({
            config: makeConfig({ triggering: "manual" }),
            pipeline: pipeline,
        });
        const hook = createChatMessageHook(state);
        const input = makeInput();
        const output = makeOutput([textPart("/fusion:config")]);
        await hook(input, output);
        expect(pipeline).not.toHaveBeenCalled();
        expect(output.parts[0]?.text).toContain("Current Fusion Configuration");
    });
    // -----------------------------------------------------------------------
    // Test 2: Auto mode — pipeline called
    // -----------------------------------------------------------------------
    test("GIVEN triggering=auto WHEN message arrives THEN pipeline is called", async () => {
        const pipeline = mock(async () => ({
            status: "ok",
            responses: [],
            cost: { totalPromptTokens: 0, totalCompletionTokens: 0, estimatedCost: 0 },
            synthesizedAnswer: "Fused answer",
        }));
        const state = makePluginState({
            config: makeConfig({ triggering: "auto" }),
            pipeline: pipeline,
        });
        const hook = createChatMessageHook(state);
        const input = makeInput();
        const output = makeOutput([textPart("Hello")]);
        await hook(input, output);
        // THEN pipeline was called once
        expect(pipeline).toHaveBeenCalledTimes(1);
        // THEN output parts replaced with synthesized answer
        expect(output.parts).toEqual([textPart("Fused answer")]);
    });
    // -----------------------------------------------------------------------
    // Test 3: Threshold mode — short prompt NOT called, long prompt called
    // -----------------------------------------------------------------------
    test("GIVEN triggering=threshold WHEN short prompt THEN pipeline NOT called", async () => {
        const pipeline = mock(async () => ({
            status: "ok",
            responses: [],
            cost: { totalPromptTokens: 0, totalCompletionTokens: 0, estimatedCost: 0 },
            synthesizedAnswer: "Fused answer",
        }));
        const state = makePluginState({
            config: makeConfig({
                triggering: "threshold",
                threshold: { minPromptLength: 100, keywords: [] },
            }),
            pipeline: pipeline,
        });
        const hook = createChatMessageHook(state);
        const input = makeInput();
        const shortPrompt = "Hi";
        const output = makeOutput([textPart(shortPrompt)]);
        await hook(input, output);
        // THEN pipeline was NOT called (prompt too short)
        expect(pipeline).not.toHaveBeenCalled();
        // THEN output parts unchanged
        expect(output.parts).toEqual([textPart(shortPrompt)]);
    });
    test("GIVEN triggering=threshold WHEN long prompt THEN pipeline is called", async () => {
        const pipeline = mock(async () => ({
            status: "ok",
            responses: [],
            cost: { totalPromptTokens: 0, totalCompletionTokens: 0, estimatedCost: 0 },
            synthesizedAnswer: "Fused answer",
        }));
        const state = makePluginState({
            config: makeConfig({
                triggering: "threshold",
                threshold: { minPromptLength: 100, keywords: [] },
            }),
            pipeline: pipeline,
        });
        const hook = createChatMessageHook(state);
        const input = makeInput();
        const longPrompt = "A".repeat(150);
        const output = makeOutput([textPart(longPrompt)]);
        await hook(input, output);
        // THEN pipeline was called (prompt exceeds minPromptLength)
        expect(pipeline).toHaveBeenCalledTimes(1);
        // THEN output parts replaced with synthesized answer
        expect(output.parts).toEqual([textPart("Fused answer")]);
    });
    // -----------------------------------------------------------------------
    // Test 4: Threshold mode — keyword match triggers, no keyword skips
    // -----------------------------------------------------------------------
    test("GIVEN triggering=threshold with keywords WHEN prompt contains keyword THEN pipeline called", async () => {
        const pipeline = mock(async () => ({
            status: "ok",
            responses: [],
            cost: { totalPromptTokens: 0, totalCompletionTokens: 0, estimatedCost: 0 },
            synthesizedAnswer: "Fused answer",
        }));
        const state = makePluginState({
            config: makeConfig({
                triggering: "threshold",
                threshold: { minPromptLength: 500, keywords: ["refactor", "architecture"] },
            }),
            pipeline: pipeline,
        });
        const hook = createChatMessageHook(state);
        const input = makeInput();
        const output = makeOutput([textPart("Please refactor the auth module")]);
        await hook(input, output);
        // THEN pipeline was called (keyword "refactor" matched)
        expect(pipeline).toHaveBeenCalledTimes(1);
    });
    test("GIVEN triggering=threshold with keywords WHEN prompt has no keyword THEN pipeline NOT called", async () => {
        const pipeline = mock(async () => ({
            status: "ok",
            responses: [],
            cost: { totalPromptTokens: 0, totalCompletionTokens: 0, estimatedCost: 0 },
            synthesizedAnswer: "Fused answer",
        }));
        const state = makePluginState({
            config: makeConfig({
                triggering: "threshold",
                threshold: { minPromptLength: 500, keywords: ["refactor", "architecture"] },
            }),
            pipeline: pipeline,
        });
        const hook = createChatMessageHook(state);
        const input = makeInput();
        const output = makeOutput([textPart("Hello, how are you?")]);
        await hook(input, output);
        // THEN pipeline was NOT called (no keyword match, prompt too short)
        expect(pipeline).not.toHaveBeenCalled();
        // THEN output parts unchanged
        expect(output.parts).toEqual([textPart("Hello, how are you?")]);
    });
    // -----------------------------------------------------------------------
    // Test 5: Recursion guard — isFusionActive=true → pipeline NOT called
    // -----------------------------------------------------------------------
    test("GIVEN fusion already active for session WHEN message arrives THEN pipeline NOT called", async () => {
        const pipeline = mock(async () => ({
            status: "ok",
            responses: [],
            cost: { totalPromptTokens: 0, totalCompletionTokens: 0, estimatedCost: 0 },
            synthesizedAnswer: "Fused answer",
        }));
        const guard = new RecursionGuard();
        guard.markFusionActive("test-session");
        const state = makePluginState({
            config: makeConfig({ triggering: "auto" }),
            recursionGuard: guard,
            pipeline: pipeline,
        });
        const hook = createChatMessageHook(state);
        const input = makeInput({ sessionID: "test-session" });
        const output = makeOutput([textPart("Hello")]);
        await hook(input, output);
        // THEN pipeline was NOT called (recursion guard blocked it)
        expect(pipeline).not.toHaveBeenCalled();
        // THEN output parts unchanged
        expect(output.parts).toEqual([textPart("Hello")]);
    });
});
//# sourceMappingURL=chat-message.test.js.map