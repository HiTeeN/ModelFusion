import { describe, expect, test } from "bun:test";
import { RecursionGuard } from "../recursion-guard.js";
import { createToolExecuteBeforeHook, createToolExecuteAfterHook, } from "./tool-execute.js";
// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function makeFusionResult(overrides = {}) {
    return {
        status: "ok",
        analysis: {
            consensus: [
                { point: "Use TypeScript for type safety", supportingModels: ["gpt-4o", "claude-3"] },
            ],
            contradictions: [],
            partial_coverage: [],
            unique_insights: [
                { modelId: "gpt-4o", insight: "Consider using Zod for runtime validation" },
            ],
            blind_spots: ["Performance implications not discussed"],
            scoring: [],
            winner: "gpt-4o",
        },
        responses: [
            {
                modelId: "gpt-4o",
                providerId: "openai",
                content: "Use TypeScript with strict mode.",
                tokenCount: { prompt: 100, completion: 50 },
                latencyMs: 1200,
            },
            {
                modelId: "claude-3",
                providerId: "anthropic",
                content: "TypeScript is the right choice here.",
                tokenCount: { prompt: 100, completion: 40 },
                latencyMs: 900,
            },
        ],
        synthesizedAnswer: "Based on panel analysis, TypeScript with strict mode is recommended.",
        cost: {
            totalPromptTokens: 200,
            totalCompletionTokens: 90,
            estimatedCost: 0.0045,
        },
        ...overrides,
    };
}
function makeBeforeInput(overrides = {}) {
    return {
        tool: "fusion:deliberate",
        sessionID: "test-session",
        callID: "call-1",
        ...overrides,
    };
}
function makeBeforeOutput(overrides = {}) {
    return {
        args: { prompt: "What is the best language for a CLI tool?" },
        ...overrides,
    };
}
function makeAfterInput(overrides = {}) {
    return {
        tool: "fusion:deliberate",
        sessionID: "test-session",
        callID: "call-1",
        args: { prompt: "What is the best language for a CLI tool?" },
        ...overrides,
    };
}
function makeAfterOutput(overrides = {}) {
    return {
        title: "",
        output: "",
        metadata: {},
        ...overrides,
    };
}
// ---------------------------------------------------------------------------
// createToolExecuteBeforeHook
// ---------------------------------------------------------------------------
describe("createToolExecuteBeforeHook", () => {
    test("fusion:deliberate — validates args, checks recursion, marks active", async () => {
        // GIVEN a fresh RecursionGuard and a before hook
        const guard = new RecursionGuard();
        const state = { recursionGuard: guard };
        const hook = createToolExecuteBeforeHook(state);
        const input = makeBeforeInput();
        const output = makeBeforeOutput();
        // WHEN the hook runs for a fusion:deliberate call
        // THEN it completes without throwing (args valid, no active fusion)
        await hook(input, output);
        // AND fusion is now marked active
        expect(guard.isFusionActive("test-session")).toBe(true);
    });
    test("fusion:deliberate — blocks nested fusion when already active", async () => {
        // GIVEN a RecursionGuard with an already-active fusion session
        const guard = new RecursionGuard();
        guard.markFusionActive("test-session");
        const state = { recursionGuard: guard };
        const hook = createToolExecuteBeforeHook(state);
        const input = makeBeforeInput();
        const output = makeBeforeOutput();
        // WHEN the hook runs for a second fusion:deliberate call in the same session
        // THEN it throws to block nested fusion
        await expect(hook(input, output)).rejects.toThrow("Fusion already running in this session");
    });
    test("fusion:deliberate — rejects missing prompt arg", async () => {
        // GIVEN a fresh RecursionGuard and a before hook
        const guard = new RecursionGuard();
        const state = { recursionGuard: guard };
        const hook = createToolExecuteBeforeHook(state);
        const input = makeBeforeInput();
        const output = makeBeforeOutput({ args: {} });
        // WHEN the hook runs with no prompt argument
        // THEN it throws a validation error
        await expect(hook(input, output)).rejects.toThrow("fusion:deliberate requires a non-empty 'prompt' argument");
    });
    test("fusion:deliberate — rejects empty prompt arg", async () => {
        // GIVEN a fresh RecursionGuard and a before hook
        const guard = new RecursionGuard();
        const state = { recursionGuard: guard };
        const hook = createToolExecuteBeforeHook(state);
        const input = makeBeforeInput();
        const output = makeBeforeOutput({ args: { prompt: "   " } });
        // WHEN the hook runs with a whitespace-only prompt
        // THEN it throws a validation error
        await expect(hook(input, output)).rejects.toThrow("fusion:deliberate requires a non-empty 'prompt' argument");
    });
    test("other tool — passes through unchanged", async () => {
        // GIVEN a before hook
        const guard = new RecursionGuard();
        const state = { recursionGuard: guard };
        const hook = createToolExecuteBeforeHook(state);
        const input = makeBeforeInput({ tool: "bash" });
        const output = makeBeforeOutput({ args: { command: "ls" } });
        // WHEN the hook runs for a non-fusion tool
        // THEN it completes without throwing
        await hook(input, output);
        // AND fusion is NOT marked active
        expect(guard.isFusionActive("test-session")).toBe(false);
        // AND output args are unchanged
        expect(output.args).toEqual({ command: "ls" });
    });
});
// ---------------------------------------------------------------------------
// createToolExecuteAfterHook
// ---------------------------------------------------------------------------
describe("createToolExecuteAfterHook", () => {
    test("fusion:deliberate — formats output with analysis, answer, cost, marks complete", async () => {
        // GIVEN an active fusion session and a fusion result
        const guard = new RecursionGuard();
        guard.markFusionActive("test-session");
        const fusionResult = makeFusionResult();
        const state = { recursionGuard: guard, fusionResult };
        const hook = createToolExecuteAfterHook(state);
        const input = makeAfterInput();
        const output = makeAfterOutput();
        // WHEN the after hook runs for a fusion:deliberate call
        await hook(input, output);
        // THEN fusion is marked complete
        expect(guard.isFusionActive("test-session")).toBe(false);
        // AND output contains analysis summary
        expect(output.output).toContain("## Analysis Summary");
        expect(output.output).toContain("Use TypeScript for type safety");
        expect(output.output).toContain("gpt-4o, claude-3");
        // AND output contains final answer
        expect(output.output).toContain("## Final Answer");
        expect(output.output).toContain("TypeScript with strict mode is recommended");
        // AND output contains cost
        expect(output.output).toContain("## Cost");
        expect(output.output).toContain("200");
        expect(output.output).toContain("90");
        expect(output.output).toContain("0.0045");
        // AND output title reflects status
        expect(output.title).toBe("Fusion: OK");
        // AND metadata includes fusion details
        expect(output.metadata.fusionStatus).toBe("ok");
        expect(output.metadata.panelCount).toBe(2);
        expect(output.metadata.hasAnalysis).toBe(true);
        expect(output.metadata.hasSynthesis).toBe(true);
    });
    test("fusion:deliberate — includes degradation notice when degraded", async () => {
        // GIVEN a degraded fusion result (judge failed, no analysis)
        const guard = new RecursionGuard();
        guard.markFusionActive("test-session");
        const fusionResult = makeFusionResult({
            status: "degraded",
            analysis: undefined,
            synthesizedAnswer: undefined,
        });
        const state = { recursionGuard: guard, fusionResult };
        const hook = createToolExecuteAfterHook(state);
        const input = makeAfterInput();
        const output = makeAfterOutput();
        // WHEN the after hook runs
        await hook(input, output);
        // THEN output includes degradation notice
        expect(output.output).toContain("## Degradation Notice");
        expect(output.output).toContain("Judge model failed");
        // AND title reflects degraded status
        expect(output.title).toBe("Fusion: DEGRADED");
        // AND no analysis or final answer sections
        expect(output.output).not.toContain("## Analysis Summary");
        expect(output.output).not.toContain("## Final Answer");
    });
    test("fusion:deliberate — includes failed models section when present", async () => {
        // GIVEN a fusion result with failed models
        const guard = new RecursionGuard();
        guard.markFusionActive("test-session");
        const fusionResult = makeFusionResult({
            failedModels: [
                { modelId: "gemini-pro", reason: "API rate limit exceeded" },
            ],
        });
        const state = { recursionGuard: guard, fusionResult };
        const hook = createToolExecuteAfterHook(state);
        const input = makeAfterInput();
        const output = makeAfterOutput();
        // WHEN the after hook runs
        await hook(input, output);
        // THEN output includes failed models section
        expect(output.output).toContain("## Failed Models");
        expect(output.output).toContain("gemini-pro");
        expect(output.output).toContain("API rate limit exceeded");
    });
    test("fusion:deliberate — marks complete even without fusionResult", async () => {
        // GIVEN an active fusion session but NO fusion result
        const guard = new RecursionGuard();
        guard.markFusionActive("test-session");
        const state = { recursionGuard: guard };
        const hook = createToolExecuteAfterHook(state);
        const input = makeAfterInput();
        const output = makeAfterOutput({ output: "raw output", title: "raw title" });
        // WHEN the after hook runs
        await hook(input, output);
        // THEN fusion is still marked complete
        expect(guard.isFusionActive("test-session")).toBe(false);
        // AND output is left unchanged
        expect(output.output).toBe("raw output");
        expect(output.title).toBe("raw title");
    });
    test("other tool — passes through unchanged", async () => {
        // GIVEN an after hook
        const guard = new RecursionGuard();
        const state = { recursionGuard: guard };
        const hook = createToolExecuteAfterHook(state);
        const input = makeAfterInput({ tool: "bash" });
        const output = makeAfterOutput({ output: "file list", title: "ls result" });
        // WHEN the hook runs for a non-fusion tool
        await hook(input, output);
        // THEN output is unchanged
        expect(output.output).toBe("file list");
        expect(output.title).toBe("ls result");
        // AND fusion state is unaffected
        expect(guard.isFusionActive("test-session")).toBe(false);
    });
});
//# sourceMappingURL=tool-execute.test.js.map