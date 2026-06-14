import { describe, expect, test } from "bun:test";
import type { FusionResult, PanelResult, FailedModel } from "../types/results";
import { handleDegradation, getDegradationMessage } from "./degradation";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeBaseResult(overrides: Partial<FusionResult> = {}): FusionResult {
  return {
    status: "ok",
    responses: [],
    cost: { totalPromptTokens: 0, totalCompletionTokens: 0, estimatedCost: 0 },
    ...overrides,
  };
}

function successResponse(modelId: string, providerId: string): PanelResult {
  return {
    modelId,
    providerId,
    content: `Response from ${providerId}/${modelId}`,
    tokenCount: { prompt: 10, completion: 20 },
    latencyMs: 50,
  };
}

function errorResponse(modelId: string, providerId: string): PanelResult {
  return {
    modelId,
    providerId,
    content: "",
    tokenCount: { prompt: 0, completion: 0 },
    latencyMs: 30,
    error: "Simulated API failure",
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("handleDegradation", () => {
  // -----------------------------------------------------------------------
  // Test 1: Scenario A — judge fail, panel OK → status "degraded"
  // -----------------------------------------------------------------------
  test("judge fail, panel OK → status 'degraded', responses present, analysis null", () => {
    // GIVEN a result with successful panel responses but no judge analysis
    const result = makeBaseResult({
      status: "ok",
      responses: [
        successResponse("gpt-4o-mini", "openai"),
        successResponse("claude-3-haiku", "anthropic"),
      ],
      analysis: undefined,
    });

    // WHEN handleDegradation processes it
    const processed = handleDegradation(result);

    // THEN status is "degraded"
    expect(processed.status).toBe("degraded");

    // THEN responses are preserved
    expect(processed.responses).toHaveLength(2);
    expect(processed.responses[0].content).toBeTruthy();
    expect(processed.responses[1].content).toBeTruthy();

    // THEN analysis remains undefined
    expect(processed.analysis).toBeUndefined();

    // THEN getDegradationMessage returns the degraded explanation
    const msg = getDegradationMessage(processed);
    expect(msg).toContain("Judge model failed");
    expect(msg).toContain("raw panel responses");
  });

  // -----------------------------------------------------------------------
  // Test 2: Scenario B — partial panel failure → status stays "ok"
  // -----------------------------------------------------------------------
  test("partial panel failure → status stays 'ok', failedModels populated", () => {
    // GIVEN a result with 1 failed panelist, 2 successful, and judge analysis present
    const failedModels: FailedModel[] = [
      { modelId: "fail-model", reason: "Simulated API failure" },
    ];
    const result = makeBaseResult({
      status: "ok",
      responses: [
        successResponse("gpt-4o-mini", "openai"),
        errorResponse("fail-model", "test"),
        successResponse("gemini-1.5-flash", "google"),
      ],
      analysis: {
        consensus: [],
        contradictions: [],
        partial_coverage: [],
        unique_insights: [],
        blind_spots: [],
        scoring: [],
        winner: null,
      },
      failedModels,
    });

    // WHEN handleDegradation processes it
    const processed = handleDegradation(result);

    // THEN status remains "ok" (partial failure is acceptable)
    expect(processed.status).toBe("ok");

    // THEN failedModels are preserved
    expect(processed.failedModels).toEqual(failedModels);

    // THEN analysis is preserved
    expect(processed.analysis).toBeDefined();

    // THEN getDegradationMessage returns empty string for "ok"
    expect(getDegradationMessage(processed)).toBe("");
  });

  // -----------------------------------------------------------------------
  // Test 3: Scenario C — all panelists fail → status "error"
  // -----------------------------------------------------------------------
  test("all panelists fail → status 'error', failure_reason 'all_panels_failed'", () => {
    // GIVEN a result where every panelist has an error
    const result = makeBaseResult({
      status: "ok",
      responses: [
        errorResponse("gpt-4o-mini", "openai"),
        errorResponse("claude-3-haiku", "anthropic"),
        errorResponse("gemini-1.5-flash", "google"),
      ],
    });

    // WHEN handleDegradation processes it
    const processed = handleDegradation(result);

    // THEN status is "error"
    expect(processed.status).toBe("error");

    // THEN failureReason is "all_panels_failed"
    expect(processed.failureReason).toBe("all_panels_failed");

    // THEN getDegradationMessage returns the all-panels-failed explanation
    const msg = getDegradationMessage(processed);
    expect(msg).toContain("All panel models failed");
    expect(msg).toContain("Falling back to the original model");
  });

  // -----------------------------------------------------------------------
  // Test 4: Scenario C with originalModelResponse → fallback included
  // -----------------------------------------------------------------------
  test("all panel fail with originalModelResponse → fallback in synthesizedAnswer", () => {
    // GIVEN all panelists failed and an original model response is available
    const result = makeBaseResult({
      status: "ok",
      responses: [
        errorResponse("gpt-4o-mini", "openai"),
        errorResponse("claude-3-haiku", "anthropic"),
      ],
    });
    const fallback = "Paris is the capital of France.";

    // WHEN handleDegradation is called with the original model response
    const processed = handleDegradation(result, fallback);

    // THEN synthesizedAnswer contains the fallback
    expect(processed.synthesizedAnswer).toBe(fallback);

    // THEN status is "error"
    expect(processed.status).toBe("error");

    // THEN failureReason is "all_panels_failed"
    expect(processed.failureReason).toBe("all_panels_failed");
  });

  // -----------------------------------------------------------------------
  // Test 5: fusion_invocation_capped → preserved, correct message
  // -----------------------------------------------------------------------
  test("fusion_invocation_capped → failureReason preserved, correct error message", () => {
    // GIVEN a result already marked with fusion_invocation_capped (from RecursionGuard)
    const result = makeBaseResult({
      status: "error",
      failureReason: "fusion_invocation_capped",
      responses: [],
    });

    // WHEN handleDegradation processes it
    const processed = handleDegradation(result);

    // THEN the pre-existing failureReason is preserved unchanged
    expect(processed.failureReason).toBe("fusion_invocation_capped");
    expect(processed.status).toBe("error");

    // THEN getDegradationMessage returns the capped explanation
    const msg = getDegradationMessage(processed);
    expect(msg).toContain("Fusion already running");
    expect(msg).toContain("nested deliberation blocked");
  });

  // -----------------------------------------------------------------------
  // Test 6: happy path — everything succeeded → no changes
  // -----------------------------------------------------------------------
  test("happy path: all succeeded with analysis → status stays 'ok', no message", () => {
    // GIVEN a fully successful result with analysis and no failures
    const result = makeBaseResult({
      status: "ok",
      responses: [
        successResponse("gpt-4o-mini", "openai"),
        successResponse("claude-3-haiku", "anthropic"),
      ],
      analysis: {
        consensus: [{ point: "Agreed on X", supportingModels: ["gpt-4o-mini", "claude-3-haiku"] }],
        contradictions: [],
        partial_coverage: [],
        unique_insights: [],
        blind_spots: [],
        scoring: [],
        winner: "gpt-4o-mini",
      },
      synthesizedAnswer: "The capital is Paris.",
    });

    // WHEN handleDegradation processes it
    const processed = handleDegradation(result);

    // THEN status remains "ok"
    expect(processed.status).toBe("ok");

    // THEN all fields are preserved
    expect(processed.analysis).toBeDefined();
    expect(processed.synthesizedAnswer).toBe("The capital is Paris.");

    // THEN getDegradationMessage returns empty string
    expect(getDegradationMessage(processed)).toBe("");
  });
});
