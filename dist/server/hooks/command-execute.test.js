import { describe, expect, test, mock } from "bun:test";
import { createCommandExecuteBeforeHook } from "./command-execute.js";
import { RecursionGuard } from "../recursion-guard.js";
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
function makeState(overrides = {}) {
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
describe("createCommandExecuteBeforeHook", () => {
    test("GIVEN fusion command WHEN hook runs THEN pipeline result is injected", async () => {
        const pipeline = mock(async () => ({
            status: "ok",
            responses: [],
            cost: { totalPromptTokens: 0, totalCompletionTokens: 0, estimatedCost: 0 },
            synthesizedAnswer: "Fused answer",
        }));
        const hook = createCommandExecuteBeforeHook(makeState({ pipeline: pipeline }));
        const output = { parts: [] };
        await hook({ command: "fusion", sessionID: "ses_1", arguments: "Compare Redis and Valkey" }, output);
        expect(pipeline).toHaveBeenCalledTimes(1);
        expect(output.parts[0]?.text).toBe("Fused answer");
    });
    test("GIVEN fusion command without args WHEN hook runs THEN usage message is injected", async () => {
        const pipeline = mock(async () => ({
            status: "ok",
            responses: [],
            cost: { totalPromptTokens: 0, totalCompletionTokens: 0, estimatedCost: 0 },
            synthesizedAnswer: "Fused answer",
        }));
        const hook = createCommandExecuteBeforeHook(makeState({ pipeline: pipeline }));
        const output = { parts: [] };
        await hook({ command: "fusion", sessionID: "ses_1", arguments: "   " }, output);
        expect(pipeline).not.toHaveBeenCalled();
        expect(output.parts[0]?.text).toContain("Usage: /fusion <question>");
    });
    test("GIVEN fusion config command WHEN hook runs THEN config text is injected", async () => {
        const hook = createCommandExecuteBeforeHook(makeState());
        const output = { parts: [] };
        await hook({ command: "fusion:config", sessionID: "ses_1", arguments: "" }, output);
        expect(output.parts[0]?.text).toContain("Current Fusion Configuration");
        expect(output.parts[0]?.text).toContain("Panel models:");
    });
    test("GIVEN unrelated command WHEN hook runs THEN output stays unchanged", async () => {
        const pipeline = mock(async () => ({
            status: "ok",
            responses: [],
            cost: { totalPromptTokens: 0, totalCompletionTokens: 0, estimatedCost: 0 },
            synthesizedAnswer: "Fused answer",
        }));
        const hook = createCommandExecuteBeforeHook(makeState({ pipeline: pipeline }));
        const output = { parts: [{ type: "text", text: "original" }] };
        await hook({ command: "help", sessionID: "ses_1", arguments: "" }, output);
        expect(pipeline).not.toHaveBeenCalled();
        expect(output.parts[0]?.text).toBe("original");
    });
});
//# sourceMappingURL=command-execute.test.js.map