import { describe, expect, test } from "bun:test";
import type { PanelModel, FusionConfig } from "../types/config";
import { fanOut, type OrchestratorClient, type PromptResponse } from "./orchestrator";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeConfig(models: PanelModel[]): FusionConfig {
  return {
    panel: { models, maxModels: 8 },
    judge: { providerId: "openai", modelId: "gpt-4o" },
    triggering: "manual",
    maxToolCalls: 8,
    temperature: 0.7,
    enabled: true,
  };
}

function successResponse(content: string): PromptResponse {
  return {
    info: { tokens: { input: 10, output: 20 } },
    parts: [{ type: "text", text: content }],
  };
}

interface MockState {
  calls: Array<{ model: { providerID: string; modelID: string }; prompt: string }>;
  maxConcurrent: number;
}

function mockHappyClient(models: PanelModel[]): { client: OrchestratorClient; state: MockState } {
  const state: MockState = { calls: [], maxConcurrent: 0 };
  let concurrent = 0;

  const client: OrchestratorClient = {
    session: {
      prompt: async (params) => {
        const textPart = params.parts.find((p) => p.type === "text");
        state.calls.push({ model: params.model, prompt: textPart?.text ?? "" });
        concurrent++;
        state.maxConcurrent = Math.max(state.maxConcurrent, concurrent);

        // yield the microtask queue so other promises can start
        await Promise.resolve();

        concurrent--;

        const key = `${params.model.providerID}/${params.model.modelID}`;
        return successResponse(`Response from ${key}`);
      },
    },
  };

  return { client, state };
}

function mockPartialFailClient(models: PanelModel[]): { client: OrchestratorClient; state: MockState } {
  const state: MockState = { calls: [], maxConcurrent: 0 };
  let concurrent = 0;

  const client: OrchestratorClient = {
    session: {
      prompt: async (params) => {
        const textPart = params.parts.find((p) => p.type === "text");
        state.calls.push({ model: params.model, prompt: textPart?.text ?? "" });
        concurrent++;
        state.maxConcurrent = Math.max(state.maxConcurrent, concurrent);

        await Promise.resolve();

        concurrent--;

        if (params.model.modelID === "fail-model") {
          throw new Error("Simulated API failure");
        }

        const key = `${params.model.providerID}/${params.model.modelID}`;
        return successResponse(`Response from ${key}`);
      },
    },
  };

  return { client, state };
}

function mockAllFailClient(): { client: OrchestratorClient; state: MockState } {
  const state: MockState = { calls: [], maxConcurrent: 0 };
  let concurrent = 0;

  const client: OrchestratorClient = {
    session: {
      prompt: async (params) => {
        const textPart = params.parts.find((p) => p.type === "text");
        state.calls.push({ model: params.model, prompt: textPart?.text ?? "" });
        concurrent++;
        state.maxConcurrent = Math.max(state.maxConcurrent, concurrent);

        await Promise.resolve();

        concurrent--;

        throw new Error(`Simulated failure for ${params.model.modelID}`);
      },
    },
  };

  return { client, state };
}

// ---------------------------------------------------------------------------
// Shared test data
// ---------------------------------------------------------------------------

const threeModels: PanelModel[] = [
  { providerId: "openai", modelId: "gpt-4o-mini" },
  { providerId: "anthropic", modelId: "claude-3-haiku" },
  { providerId: "google", modelId: "gemini-1.5-flash" },
];

const modelsWithOneFailing: PanelModel[] = [
  { providerId: "openai", modelId: "gpt-4o-mini" },
  { providerId: "test", modelId: "fail-model" },
  { providerId: "google", modelId: "gemini-1.5-flash" },
];

const SESSION_ID = "ses_test123";
const TEST_PROMPT = "What is the capital of France?";

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("fanOut", () => {
  // -----------------------------------------------------------------------
  // Test 1: Happy path — all 3 models succeed
  // -----------------------------------------------------------------------
  test("happy path: all models succeed, returns 3 PanelResults with no errors", async () => {
    // GIVEN a mock client where all models return success
    const { client, state } = mockHappyClient(threeModels);
    const config = makeConfig(threeModels);

    // WHEN fanOut is called with 3 panel models
    const results = await fanOut(client, SESSION_ID, TEST_PROMPT, threeModels, config);

    // THEN 3 results are returned, none have errors
    expect(results).toHaveLength(3);
    for (const r of results) {
      expect(r.error).toBeUndefined();
      expect(r.content).toBeTruthy();
      expect(r.tokenCount.prompt).toBeGreaterThan(0);
      expect(r.tokenCount.completion).toBeGreaterThan(0);
      expect(r.latencyMs).toBeGreaterThanOrEqual(0);
    }

    // THEN each result maps to a configured model
    const modelIds = results.map((r) => r.modelId).sort();
    expect(modelIds).toEqual(["claude-3-haiku", "gemini-1.5-flash", "gpt-4o-mini"]);

    // THEN all 3 calls were made
    expect(state.calls).toHaveLength(3);
  });

  // -----------------------------------------------------------------------
  // Test 2: Partial failure — 1 of 3 models fails
  // -----------------------------------------------------------------------
  test("partial failure: 1 model throws, returns 2 successes + 1 error", async () => {
    // GIVEN a mock client where the "fail-model" throws
    const { client } = mockPartialFailClient(modelsWithOneFailing);
    const config = makeConfig(modelsWithOneFailing);

    // WHEN fanOut is called
    const results = await fanOut(client, SESSION_ID, TEST_PROMPT, modelsWithOneFailing, config);

    // THEN 3 results are returned
    expect(results).toHaveLength(3);

    // THEN exactly 1 has an error, 2 are successful
    const errors = results.filter((r) => r.error !== undefined);
    const successes = results.filter((r) => r.error === undefined);
    expect(errors).toHaveLength(1);
    expect(successes).toHaveLength(2);

    // THEN the error result belongs to the failing model
    expect(errors[0].modelId).toBe("fail-model");
    expect(errors[0].error).toContain("Simulated API failure");
    expect(errors[0].content).toBe("");
    expect(errors[0].tokenCount).toEqual({ prompt: 0, completion: 0 });

    // THEN successful results have content and token counts
    for (const r of successes) {
      expect(r.content).toBeTruthy();
      expect(r.tokenCount.prompt).toBeGreaterThan(0);
    }
  });

  // -----------------------------------------------------------------------
  // Test 3: All failure — all 3 models throw, no exception propagates
  // -----------------------------------------------------------------------
  test("all failure: all models throw, returns 3 error PanelResults, no crash", async () => {
    // GIVEN a mock client where every model throws
    const { client } = mockAllFailClient();
    const config = makeConfig(threeModels);

    // WHEN fanOut is called — must not throw
    let results: Awaited<ReturnType<typeof fanOut>>;
    let threw = false;
    try {
      results = await fanOut(client, SESSION_ID, TEST_PROMPT, threeModels, config);
    } catch {
      threw = true;
    }

    // THEN no exception was thrown
    expect(threw).toBe(false);

    // THEN 3 error PanelResults are returned
    expect(results!).toHaveLength(3);
    for (const r of results!) {
      expect(r.error).toBeDefined();
      expect(r.error).toContain("Simulated failure");
      expect(r.content).toBe("");
      expect(r.tokenCount).toEqual({ prompt: 0, completion: 0 });
    }
  });

  // -----------------------------------------------------------------------
  // Test 4: Verbatim prompt — prompt passed to mock is identical to input
  // -----------------------------------------------------------------------
  test("verbatim prompt: each panelist receives the exact input prompt unchanged", async () => {
    // GIVEN a mock client that records calls
    const { client, state } = mockHappyClient(threeModels);
    const config = makeConfig(threeModels);
    const exactPrompt = "Explain quantum computing in 3 sentences.";

    // WHEN fanOut is called
    await fanOut(client, SESSION_ID, exactPrompt, threeModels, config);

    // THEN every call received the verbatim prompt (no lenses, no roles, no wrappers)
    expect(state.calls).toHaveLength(3);
    for (const call of state.calls) {
      expect(call.prompt).toBe(exactPrompt);
    }
  });

  // -----------------------------------------------------------------------
  // Test 5: Parallel execution — all calls overlap in the same event loop
  // -----------------------------------------------------------------------
  test("parallel execution: all model calls overlap (concurrent > 1)", async () => {
    // GIVEN a mock client that tracks concurrent call count
    const { client, state } = mockHappyClient(threeModels);
    const config = makeConfig(threeModels);

    // WHEN fanOut is called
    await fanOut(client, SESSION_ID, TEST_PROMPT, threeModels, config);

    // THEN at some point more than 1 call was in-flight simultaneously
    expect(state.maxConcurrent).toBeGreaterThan(1);

    // THEN all 3 calls were made
    expect(state.calls).toHaveLength(3);
  });

  // -----------------------------------------------------------------------
  // Test 6: Token counts and latency are captured from response metadata
  // -----------------------------------------------------------------------
  test("token counts and latency captured from response metadata", async () => {
    // GIVEN a mock client returning specific usage data
    const { client } = mockHappyClient(threeModels);
    const config = makeConfig(threeModels);

    // WHEN fanOut is called
    const results = await fanOut(client, SESSION_ID, TEST_PROMPT, threeModels, config);

    // THEN each result has non-zero token counts
    for (const r of results) {
      expect(r.tokenCount.prompt).toBe(10);
      expect(r.tokenCount.completion).toBe(20);
      expect(r.latencyMs).toBeGreaterThanOrEqual(0);
    }
  });

  // -----------------------------------------------------------------------
  // Test 7: Empty models array returns empty results
  // -----------------------------------------------------------------------
  test("empty models array returns empty results array", async () => {
    // GIVEN a config with no panel models
    const { client } = mockHappyClient([]);
    const config = makeConfig([]);

    // WHEN fanOut is called with empty models
    const results = await fanOut(client, SESSION_ID, TEST_PROMPT, [], config);

    // THEN an empty array is returned, no calls were made
    expect(results).toEqual([]);
  });
});
