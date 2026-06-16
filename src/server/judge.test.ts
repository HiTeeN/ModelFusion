import { describe, expect, test } from "bun:test";
import type { FusionConfig, PanelModel } from "../types/config.js";
import type { JudgeOutput, PanelResult } from "../types/results.js";
import { runJudge, type JudgeClient } from "./judge.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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
    content: "The answer is 42. It is the ultimate answer to life, the universe, and everything.",
    tokenCount: { prompt: 10, completion: 15 },
    latencyMs: 200,
  },
  {
    modelId: "claude-3-haiku",
    providerId: "anthropic",
    content: "42 is indeed the answer, as established in The Hitchhiker's Guide to the Galaxy.",
    tokenCount: { prompt: 10, completion: 12 },
    latencyMs: 180,
  },
];

const validJudgeJson = {
  consensus: [
    { point: "The answer is 42", supporting_models: ["gpt-4o-mini", "claude-3-haiku"] },
  ],
  contradictions: [],
  partial_coverage: [],
  unique_insights: [
    { model_id: "claude-3-haiku", insight: "Referenced the literary source" },
  ],
  blind_spots: ["Did not explain why 42"],
  scoring: [
    {
      model_id: "gpt-4o-mini",
      scores: { completeness: 7, accuracy: 9, novelty: 5, clarity: 8 },
      total: 29,
    },
    {
      model_id: "claude-3-haiku",
      scores: { completeness: 8, accuracy: 9, novelty: 7, clarity: 9 },
      total: 33,
    },
  ],
  winner: "claude-3-haiku",
};

function mockClient(response: unknown): JudgeClient {
  return {
    session: {
      prompt: async () => response,
    },
  };
}

function mockClientThrowing(error: Error): JudgeClient {
  return {
    session: {
      prompt: async () => {
        throw error;
      },
    },
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("runJudge", () => {
  test("returns parsed JudgeOutput for valid JSON response", async () => {
    // GIVEN a judge client that returns valid structured JSON
    const client = mockClient({
      parts: [{ type: "text", text: JSON.stringify(validJudgeJson) }],
    });

    // WHEN running the judge
    const result = await runJudge(client, "session-1", samplePanelResults, defaultConfig);

    // THEN it returns a normalized JudgeOutput with camelCase keys
    expect(result).not.toBeNull();
    expect(result!.consensus).toHaveLength(1);
    expect(result!.consensus[0].point).toBe("The answer is 42");
    expect(result!.consensus[0].supportingModels).toEqual(["gpt-4o-mini", "claude-3-haiku"]);
    expect(result!.unique_insights).toHaveLength(1);
    expect(result!.unique_insights[0].modelId).toBe("claude-3-haiku");
    expect(result!.unique_insights[0].insight).toBe("Referenced the literary source");
    expect(result!.scoring).toHaveLength(2);
    expect(result!.scoring[0].modelId).toBe("gpt-4o-mini");
    expect(result!.scoring[0].scores.completeness).toBe(7);
    expect(result!.scoring[0].total).toBe(29);
    expect(result!.winner).toBe("claude-3-haiku");
  });

  test("returns null for invalid JSON response", async () => {
    // GIVEN a judge client that returns non-JSON content
    const client = mockClient({
      parts: [{ type: "text", text: "not json" }],
    });

    // WHEN running the judge
    const result = await runJudge(client, "session-1", samplePanelResults, defaultConfig);

    // THEN it returns null
    expect(result).toBeNull();
  });

  test("returns null for empty response content", async () => {
    // GIVEN a judge client that returns an empty content string
    const client = mockClient({
      parts: [{ type: "text", text: "" }],
    });

    // WHEN running the judge
    const result = await runJudge(client, "session-1", samplePanelResults, defaultConfig);

    // THEN it returns null
    expect(result).toBeNull();
  });

  test("returns null when the API call throws", async () => {
    // GIVEN a judge client whose prompt() throws an error
    const client = mockClientThrowing(new Error("API timeout"));

    // WHEN running the judge
    const result = await runJudge(client, "session-1", samplePanelResults, defaultConfig);

    // THEN it returns null
    expect(result).toBeNull();
  });

  test("returns null when JSON is missing required fields", async () => {
    // GIVEN a judge client that returns JSON without all required fields
    const incompleteJson = { consensus: [] };
    const client = mockClient({
      parts: [{ type: "text", text: JSON.stringify(incompleteJson) }],
    });

    // WHEN running the judge
    const result = await runJudge(client, "session-1", samplePanelResults, defaultConfig);

    // THEN it returns null
    expect(result).toBeNull();
  });
});
