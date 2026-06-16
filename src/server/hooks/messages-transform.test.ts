import { describe, expect, test } from "bun:test";
import { createMessagesTransformHook } from "./messages-transform.js";
import type { FusionResult, JudgeOutput } from "../../types/results.js";
import type { Message, Part } from "@opencode-ai/sdk";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function okFusionResult(overrides: Partial<FusionResult> = {}): FusionResult {
  return {
    status: "ok",
    analysis: {
      consensus: [
        { point: "The sky is blue", supportingModels: ["gpt-4o", "claude-3-haiku"] },
      ],
      contradictions: [
        {
          topic: "Best approach",
          stances: [
            { modelId: "gpt-4o", stance: "iterative" },
            { modelId: "claude-3-haiku", stance: "recursive" },
          ],
        },
      ],
      partial_coverage: [
        { point: "Edge case handling", models: ["gpt-4o"] },
      ],
      unique_insights: [
        { modelId: "gemini-1.5-flash", insight: "Consider async alternatives" },
      ],
      blind_spots: ["Memory management", "Error recovery"],
      scoring: [
        {
          modelId: "gpt-4o",
          scores: { completeness: 8, accuracy: 9, novelty: 7, clarity: 8 },
          total: 32,
        },
      ],
      winner: "gpt-4o",
    },
    responses: [
      {
        modelId: "gpt-4o",
        providerId: "openai",
        content: "The sky is blue.",
        tokenCount: { prompt: 10, completion: 5 },
        latencyMs: 200,
      },
    ],
    synthesizedAnswer:
      "Based on panel analysis, the sky is blue. Claude noted atmospheric scattering, " +
      "while Gemini suggested considering time-of-day effects.",
    cost: {
      totalPromptTokens: 100,
      totalCompletionTokens: 50,
      estimatedCost: 0.0015,
    },
    ...overrides,
  };
}

function userMessage(): { info: Message; parts: Part[] } {
  return {
    info: {
      id: "msg-1",
      sessionID: "s1",
      role: "user",
      time: { created: 1000 },
      agent: "default",
      model: { providerID: "openai", modelID: "gpt-4o" },
    } as Message,
    parts: [{ type: "text", text: "What color is the sky?" } as Part],
  };
}

// ---------------------------------------------------------------------------
// createMessagesTransformHook
// ---------------------------------------------------------------------------

describe("createMessagesTransformHook", () => {
  // -----------------------------------------------------------------------
  // GIVEN a FusionResult with analysis and synthesized answer
  // WHEN the messages transform hook runs
  // THEN the messages array contains original + analysis (system) + answer (assistant)
  // -----------------------------------------------------------------------
  test("injects analysis and answer when fusionResult is present", async () => {
    const hook = createMessagesTransformHook({
      fusionResult: okFusionResult(),
    });

    const original = userMessage();
    const output = { messages: [original] };

    await hook({}, output);

    // Original message preserved
    expect(output.messages).toHaveLength(3);
    expect(output.messages[0]).toBe(original);

    // Analysis message injected
    const analysisMsg = output.messages[1];
    expect((analysisMsg.info as { role: string }).role).toBe("system");
    expect(analysisMsg.parts).toHaveLength(1);
    expect((analysisMsg.parts[0] as { text: string }).text).toContain(
      "Fusion Panel Analysis",
    );
    expect((analysisMsg.parts[0] as { text: string }).text).toContain(
      "Consensus Points",
    );
    expect((analysisMsg.parts[0] as { text: string }).text).toContain(
      "The sky is blue",
    );

    // Answer message injected
    const answerMsg = output.messages[2];
    expect(answerMsg.info.role).toBe("assistant");
    expect(answerMsg.parts).toHaveLength(1);
    expect((answerMsg.parts[0] as { text: string }).text).toBe(
      okFusionResult().synthesizedAnswer!,
    );
  });

  // -----------------------------------------------------------------------
  // GIVEN no FusionResult (undefined)
  // WHEN the messages transform hook runs
  // THEN messages pass through unchanged
  // -----------------------------------------------------------------------
  test("passes through unchanged when fusionResult is undefined", async () => {
    const hook = createMessagesTransformHook({});

    const original = userMessage();
    const output = { messages: [original] };

    await hook({}, output);

    expect(output.messages).toHaveLength(1);
    expect(output.messages[0]).toBe(original);
  });

  // -----------------------------------------------------------------------
  // GIVEN a FusionResult with analysis and answer
  // WHEN the messages transform hook runs
  // THEN the analysis message has role "system" and the answer has role "assistant"
  // -----------------------------------------------------------------------
  test("injected messages have correct roles", async () => {
    const hook = createMessagesTransformHook({
      fusionResult: okFusionResult(),
    });

    const output = { messages: [userMessage()] };

    await hook({}, output);

    expect(output.messages).toHaveLength(3);

    // Analysis → system
    expect((output.messages[1].info as { role: string }).role).toBe("system");

    // Answer → assistant
    expect(output.messages[2].info.role).toBe("assistant");
  });

  // -----------------------------------------------------------------------
  // GIVEN a FusionResult with null analysis (degraded scenario)
  // WHEN the messages transform hook runs
  // THEN the analysis summary notes the missing analysis gracefully
  // -----------------------------------------------------------------------
  test("handles missing analysis gracefully", async () => {
    const result = okFusionResult({ analysis: undefined });
    const hook = createMessagesTransformHook({ fusionResult: result });

    const output = { messages: [userMessage()] };

    await hook({}, output);

    expect(output.messages).toHaveLength(3);
    const analysisText = (output.messages[1].parts[0] as { text: string }).text;
    expect(analysisText).toContain("no judge analysis is available");
  });

  // -----------------------------------------------------------------------
  // GIVEN a FusionResult with no synthesized answer
  // WHEN the messages transform hook runs
  // THEN a fallback message is injected as the answer
  // -----------------------------------------------------------------------
  test("handles missing synthesized answer gracefully", async () => {
    const result = okFusionResult({ synthesizedAnswer: undefined });
    const hook = createMessagesTransformHook({ fusionResult: result });

    const output = { messages: [userMessage()] };

    await hook({}, output);

    expect(output.messages).toHaveLength(3);
    const answerText = (output.messages[2].parts[0] as { text: string }).text;
    expect(answerText).toContain("no synthesized answer");
  });
});
