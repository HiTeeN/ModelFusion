import { describe, expect, test, mock } from "bun:test";
import type { PanelModel, FusionConfig } from "../types/config";
import type { JudgeOutput, PanelResult } from "../types/results";
import { fanOut, type OrchestratorClient, type PromptResponse } from "./orchestrator";
import { runJudge, sanitizeConfigValue, type JudgeClient } from "./judge";

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

const singleModel: PanelModel[] = [
  { providerId: "openai", modelId: "gpt-4o-mini" },
];

const defaultPanelModels: PanelModel[] = [
  { providerId: "openai", modelId: "gpt-4o-mini" },
  { providerId: "anthropic", modelId: "claude-3-haiku" },
];

const defaultConfig: FusionConfig = {
  panel: { models: defaultPanelModels, maxModels: 8 },
  judge: { providerId: "openai", modelId: "gpt-4o" },
  triggering: "manual",
  maxToolCalls: 8,
  temperature: 0.7,
  enabled: true,
};

const samplePanelResults: PanelResult[] = [
  {
    modelId: "gpt-4o-mini",
    providerId: "openai",
    content: "The answer is 42.",
    tokenCount: { prompt: 10, completion: 5 },
    latencyMs: 100,
  },
  {
    modelId: "claude-3-haiku",
    providerId: "anthropic",
    content: "42 is the ultimate answer.",
    tokenCount: { prompt: 10, completion: 6 },
    latencyMs: 90,
  },
];

const validJsonString = JSON.stringify({
  consensus: [
    { point: "Both agree on 42", supporting_models: ["gpt-4o-mini", "claude-3-haiku"] },
  ],
  contradictions: [],
  partial_coverage: [],
  unique_insights: [],
  blind_spots: [],
  scoring: [
    { model_id: "gpt-4o-mini", scores: { completeness: 7, accuracy: 8, novelty: 5, clarity: 7 }, total: 27 },
    { model_id: "claude-3-haiku", scores: { completeness: 8, accuracy: 9, novelty: 7, clarity: 9 }, total: 33 },
  ],
  winner: "claude-3-haiku",
});

const SESSION_ID = "ses_test123";
const TEST_PROMPT = "What is the meaning of life?";

// ---------------------------------------------------------------------------
// Test 1: Timeout handling
// ---------------------------------------------------------------------------

describe("fanOut timeout handling", () => {
  test("timeout: call exceeding timeoutMs is captured as error PanelResult", async () => {
    // GIVEN a mock client whose prompt never resolves (simulating a hang)
    const client: OrchestratorClient = {
      session: {
        prompt: () => new Promise(() => {}), // never settles
      },
    };

    const config = makeConfig(singleModel);

    // WHEN fanOut is called with a short 50ms timeout
    const results = await fanOut(client, SESSION_ID, TEST_PROMPT, singleModel, config, {
      timeoutMs: 50,
    });

    // THEN the result has an error containing "timeout" and the model metadata
    expect(results).toHaveLength(1);
    expect(results[0].error).toBeDefined();
    expect(results[0].error).toContain("timeout");
    expect(results[0].modelId).toBe("gpt-4o-mini");
    expect(results[0].providerId).toBe("openai");
  });

  test("timeout: call within timeoutMs succeeds normally", async () => {
    // GIVEN a mock client that responds immediately
    const client: OrchestratorClient = {
      session: {
        prompt: async () => successResponse("Quick response"),
      },
    };

    const config = makeConfig(singleModel);

    // WHEN fanOut is called with a generous timeout
    const results = await fanOut(client, SESSION_ID, TEST_PROMPT, singleModel, config, {
      timeoutMs: 5000,
    });

    // THEN the result succeeds with content and no error
    expect(results).toHaveLength(1);
    expect(results[0].error).toBeUndefined();
    expect(results[0].content).toBe("Quick response");
  });
});

// ---------------------------------------------------------------------------
// Test 2: Retry logic
// ---------------------------------------------------------------------------

describe("fanOut retry logic", () => {
  test("retry: transient error on first attempt succeeds on retry", async () => {
    // GIVEN a mock client that fails once then succeeds
    let callCount = 0;
    const client: OrchestratorClient = {
      session: {
        prompt: async () => {
          callCount++;
          if (callCount <= 1) {
            throw new Error("Transient network error");
          }
          return successResponse("Retried successfully");
        },
      },
    };

    const config = makeConfig(singleModel);

    // WHEN fanOut is called with retries=1
    const results = await fanOut(client, SESSION_ID, TEST_PROMPT, singleModel, config, {
      retries: 1,
    });

    // THEN the result succeeds (not an error) and was called twice
    expect(results).toHaveLength(1);
    expect(results[0].error).toBeUndefined();
    expect(results[0].content).toBe("Retried successfully");
    expect(callCount).toBe(2);
  });

  test("retry: persistent error after all retries is captured as error PanelResult", async () => {
    // GIVEN a mock client that always fails
    const client: OrchestratorClient = {
      session: {
        prompt: async () => {
          throw new Error("Persistent API failure");
        },
      },
    };

    const config = makeConfig(singleModel);

    // WHEN fanOut is called with retries=1 (default)
    const results = await fanOut(client, SESSION_ID, TEST_PROMPT, singleModel, config);

    // THEN the result has an error, no content
    expect(results).toHaveLength(1);
    expect(results[0].error).toBeDefined();
    expect(results[0].error).toContain("Persistent API failure");
    expect(results[0].content).toBe("");
  });

  test("retry: zero retries means no retry on failure", async () => {
    // GIVEN a mock client that always fails
    let callCount = 0;
    const client: OrchestratorClient = {
      session: {
        prompt: async () => {
          callCount++;
          throw new Error("Single failure");
        },
      },
    };

    const config = makeConfig(singleModel);

    // WHEN fanOut is called with retries=0
    const results = await fanOut(client, SESSION_ID, TEST_PROMPT, singleModel, config, {
      retries: 0,
    });

    // THEN it was called exactly once and captured as error
    expect(callCount).toBe(1);
    expect(results[0].error).toContain("Single failure");
  });
});

// ---------------------------------------------------------------------------
// Test 3: JSON repair
// ---------------------------------------------------------------------------

describe("runJudge JSON repair", () => {
  test("JSON repair: parses JSON wrapped in markdown code fences", async () => {
    // GIVEN a judge client that returns JSON inside ```json fences
    const client: JudgeClient = {
      session: {
        prompt: async () => ({
          parts: [{ type: "text", text: "```json\n" + validJsonString + "\n```" }],
        }),
      },
    };

    // WHEN running the judge
    const result = await runJudge(client, SESSION_ID, samplePanelResults, defaultConfig);

    // THEN it repairs and returns a valid JudgeOutput
    expect(result).not.toBeNull();
    expect(result!.consensus).toHaveLength(1);
    expect(result!.winner).toBe("claude-3-haiku");
  });

  test("JSON repair: parses JSON with extra text before and after", async () => {
    // GIVEN a judge client that returns JSON with surrounding commentary
    const client: JudgeClient = {
      session: {
        prompt: async () => ({
          parts: [{ type: "text", text: "Here's my analysis:\n" + validJsonString + "\nLet me know if you need more detail." }],
        }),
      },
    };

    // WHEN running the judge
    const result = await runJudge(client, SESSION_ID, samplePanelResults, defaultConfig);

    // THEN it extracts and parses the JSON successfully
    expect(result).not.toBeNull();
    expect(result!.consensus).toHaveLength(1);
  });

  test("JSON repair: returns null for completely unparseable content", async () => {
    // GIVEN a judge client that returns garbage with no JSON object
    const client: JudgeClient = {
      session: {
        prompt: async () => ({
          parts: [{ type: "text", text: "Sorry, I couldn't analyze this properly." }],
        }),
      },
    };

    // WHEN running the judge
    const result = await runJudge(client, SESSION_ID, samplePanelResults, defaultConfig);

    // THEN it returns null
    expect(result).toBeNull();
  });

  test("JSON repair: parses JSON that is an array (should be rejected by type check)", async () => {
    // GIVEN a judge client that returns a JSON array instead of object
    const client: JudgeClient = {
      session: {
        prompt: async () => ({
          parts: [{ type: "text", text: "[1, 2, 3]" }],
        }),
      },
    };

    // WHEN running the judge
    const result = await runJudge(client, SESSION_ID, samplePanelResults, defaultConfig);

    // THEN it returns null (arrays are rejected after repair)
    expect(result).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Test 4: Input sanitization
// ---------------------------------------------------------------------------

describe("sanitizeConfigValue", () => {
  test("sanitization: trims leading and trailing whitespace", () => {
    // GIVEN a config value with whitespace padding
    // WHEN sanitized
    const result = sanitizeConfigValue("  gpt-4o  ");
    // THEN whitespace is trimmed
    expect(result).toBe("gpt-4o");
  });

  test("sanitization: strips null bytes and control characters", () => {
    // GIVEN a config value with null bytes and control chars
    // WHEN sanitized
    const result = sanitizeConfigValue("model\x00name\x1F\x7Fhere");
    // THEN dangerous characters are removed
    expect(result).toBe("modelnamehere");
  });

  test("sanitization: strips zero-width characters", () => {
    // GIVEN a config value with zero-width spaces/joiners
    // WHEN sanitized
    const result = sanitizeConfigValue("gpt\u200B-4o\uFEFF-mini");
    // THEN zero-width chars are removed
    expect(result).toBe("gpt-4o-mini");
  });

  test("sanitization: preserves normal strings unchanged", () => {
    // GIVEN a clean config value
    // WHEN sanitized
    const result = sanitizeConfigValue("claude-3-haiku");
    // THEN it passes through unchanged
    expect(result).toBe("claude-3-haiku");
  });

  test("sanitization: empty string stays empty", () => {
    // GIVEN an empty string
    // WHEN sanitized
    const result = sanitizeConfigValue("  ");
    // THEN it becomes empty
    expect(result).toBe("");
  });
});

// ---------------------------------------------------------------------------
// Test 5: Panel result sanitization in judge prompt
// ---------------------------------------------------------------------------

describe("judge panel result sanitization", () => {
  test("judge prompt sanitization: strips control chars from panel content", async () => {
    // GIVEN panel results containing null bytes and control characters
    const dirtyPanelResults: PanelResult[] = [
      {
        modelId: "gpt-4o-mini",
        providerId: "openai",
        content: "Answer:\x00\x1F 42 \x00", // null bytes and unit separator
        tokenCount: { prompt: 5, completion: 3 },
        latencyMs: 50,
      },
    ];

    const capturedBodies: Array<Record<string, unknown>> = [];
    const client: JudgeClient = {
      session: {
        prompt: async (params) => {
          capturedBodies.push(params as unknown as Record<string, unknown>);
          return { parts: [{ type: "text", text: validJsonString }] };
        },
      },
    };

    // WHEN the judge runs
    const result = await runJudge(client, SESSION_ID, dirtyPanelResults, defaultConfig);

    // THEN it still produces a result (didn't crash)
    expect(result).not.toBeNull();

    // THEN the prompt sent to the judge contains sanitized content (no null bytes)
    const parts = capturedBodies[0]?.parts as Array<{ type?: string; text?: string }> | undefined;
    expect(parts).toBeDefined();
    const promptContent = parts!.find((p) => p.type === "text")?.text ?? "";
    expect(promptContent).not.toContain("\x00");
    expect(promptContent).not.toContain("\x1F");
    expect(promptContent).toContain("Answer: 42"); // core content preserved
  });
});
