import { describe, expect, test } from "bun:test";
import type { JudgeOutput, PanelResult } from "../types/results.js";
import type { FusionConfig } from "../types/config.js";
import { synthesize, type SynthesizerClient, type OriginalModel } from "./synthesizer.js";

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

const sampleJudgeOutput: JudgeOutput = {
  consensus: [
    { point: "The answer should be 42", supportingModels: ["gpt-4o", "claude-opus"] },
  ],
  contradictions: [
    {
      topic: "precision",
      stances: [
        { modelId: "gpt-4o", stance: "exact" },
        { modelId: "gemini-flash", stance: "approximate" },
      ],
    },
  ],
  partial_coverage: [
    { point: "edge case handling", models: ["claude-opus"] },
  ],
  unique_insights: [
    { modelId: "gpt-4o", insight: "noted quantum implications" },
  ],
  blind_spots: ["performance at scale"],
  scoring: [
    {
      modelId: "gpt-4o",
      scores: { completeness: 9, accuracy: 8, novelty: 7, clarity: 9 },
      total: 33,
    },
  ],
  winner: "gpt-4o",
};

const samplePanelResults: PanelResult[] = [
  {
    modelId: "gpt-4o",
    providerId: "openai",
    content: "The answer is 42.",
    tokenCount: { prompt: 10, completion: 5 },
    latencyMs: 200,
  },
  {
    modelId: "claude-opus",
    providerId: "anthropic",
    content: "42 is the answer.",
    tokenCount: { prompt: 10, completion: 5 },
    latencyMs: 300,
  },
];

const sampleConfig: FusionConfig = {
  panel: {
    models: [
      { providerId: "openai", modelId: "gpt-4o" },
      { providerId: "anthropic", modelId: "claude-opus" },
    ],
    maxModels: 8,
  },
  judge: { providerId: "openai", modelId: "gpt-4o" },
  triggering: "manual",
  maxToolCalls: 8,
  temperature: 0.7,
  enabled: true,
};

const originalModel: OriginalModel = {
  providerId: "openai",
  modelId: "gpt-4o",
};

// ---------------------------------------------------------------------------
// Mock client factory
// ---------------------------------------------------------------------------

function mockClient(): {
  client: SynthesizerClient;
  capturedBody: () => { model: { providerID: string; modelID: string }; prompt: string } | null;
} {
  let captured: { model: { providerID: string; modelID: string }; prompt: string } | null = null;

  const client: SynthesizerClient = {
    session: {
      prompt: async (params) => {
        const textPart = params.parts.find((p) => p.type === "text");
        captured = { model: params.model, prompt: textPart?.text ?? "" };
        return {
          info: { tokens: { input: 0, output: 0 } },
          parts: [{ type: "text", text: "Synthesized answer." }],
        };
      },
    },
  };

  return { client, capturedBody: () => captured };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("synthesize", () => {
  test("prompt body includes judgeOutput JSON", async () => {
    // GIVEN a mock client and judge output with consensus data
    const { client, capturedBody } = mockClient();

    // WHEN synthesize is called
    await synthesize(
      client,
      "session-1",
      sampleJudgeOutput,
      samplePanelResults,
      sampleConfig,
      originalModel,
    );

    // THEN the prompt body contains the judge output as JSON
    const body = capturedBody();
    expect(body).not.toBeNull();
    const promptStr = body!.prompt;
    expect(promptStr).toContain('"consensus"');
    expect(promptStr).toContain('"supportingModels"');
    expect(promptStr).toContain('"gpt-4o"');
  });

  test("prompt body includes attribution instructions", async () => {
    // GIVEN a mock client
    const { client, capturedBody } = mockClient();

    // WHEN synthesize is called
    await synthesize(
      client,
      "session-1",
      sampleJudgeOutput,
      samplePanelResults,
      sampleConfig,
      originalModel,
    );

    // THEN the prompt instructs attribution to specific models
    const body = capturedBody();
    expect(body).not.toBeNull();
    const promptStr = body!.prompt;
    expect(promptStr.toLowerCase()).toContain("attribute");
    expect(promptStr).toContain("Attribute claims to specific models");
  });

  test("model parameter matches the passed original model", async () => {
    // GIVEN a mock client and an original model reference
    const { client, capturedBody } = mockClient();

    // WHEN synthesize is called with that original model
    await synthesize(
      client,
      "session-1",
      sampleJudgeOutput,
      samplePanelResults,
      sampleConfig,
      originalModel,
    );

    // THEN the model sent to session.prompt matches the original model (not the judge)
    const body = capturedBody();
    expect(body).not.toBeNull();
    expect(body!.model).toEqual({
      providerID: "openai",
      modelID: "gpt-4o",
    });
  });

  test("returns the content string from the client response", async () => {
    // GIVEN a mock client that returns a known content string
    const { client } = mockClient();

    // WHEN synthesize is called
    const result = await synthesize(
      client,
      "session-1",
      sampleJudgeOutput,
      samplePanelResults,
      sampleConfig,
      originalModel,
    );

    // THEN the returned value is the content from the client
    expect(result).toBe("Synthesized answer.");
  });
});
